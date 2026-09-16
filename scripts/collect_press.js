// 보도자료 수집 (collect_press.js)
//
// 편의점 본사가 배포한 신상품 보도자료에서 제품명·가격·출시일을 뽑아 후보 큐에 넣는다.
// GS25 는 공식 웹에 상품 카탈로그가 없어(전부 앱 유도) 보도자료가 유일한 공개 가격 경로다.
//
// 보도자료는 배포 목적으로 공개된 자료이고 사실(제품명·가격·날짜)만 인용한다.
// 본문을 저장하지 않고, 추출한 사실과 출처 URL 만 남긴다.
//
// 가드: robots 의 Crawl-delay·Visit-time 준수(GS리테일은 0400-0845 UTC) · 목록 1페이지 ·
//       기사 상한 · 403/429 즉시 중단 · 로그인 뒤 데이터 미접근.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const UA = 'ProteinRadarBot/2.0 (+https://0101-commits.github.io/calorie/; new-product press release lookup)';
const MAX_ARTICLES = Number(process.env.PRESS_MAX || 15);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** robots 의 Visit-time(UTC HHMM-HHMM) 창 안인지 */
function withinVisitWindow(visitTime, now = new Date()) {
  if (!visitTime) return true;
  const m = String(visitTime).match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return true;
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return start <= end ? (cur >= start && cur <= end) : (cur >= start || cur <= end);
}

// PB 라인 접두어 — 편의점 자체 브랜드 제품명은 거의 항상 이 말로 시작한다
const PB_PREFIX = ['유어스', '심플리쿡', '헤이루', 'HEYROO', '득템', '세븐셀렉트', '아임이', '민생'];

const normName = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

/**
 * 본문에서 제품명·가격 사실을 뽑는다.
 *
 * 정규식만으로 한국어 보도자료의 제품명을 끊으면 '가격은'·'2종을 출시했으며' 같은
 * 문장 조각이 제품명으로 들어온다. 그래서 두 가지 확실한 신호만 쓴다.
 *   ① 사전 일치 — 이미 아는 상품명(공공DB 수집분)이 본문에 나오는 경우
 *   ② 브랜드 접두어 — '유어스…', '득템…' 처럼 PB 라인 이름으로 시작하는 토큰
 * 두 경우 모두 그 위치에서 가장 가까운 금액과만 짝짓는다.
 */
function extractPriceFacts(text, dictionary = []) {
  const clean = String(text).replace(/\s+/g, ' ');
  const facts = [];

  // 본문의 모든 금액 위치를 미리 모은다
  const prices = [];
  const priceRe = /([\d,]{3,7})\s*원/g;
  let pm;
  while ((pm = priceRe.exec(clean)) !== null) {
    const v = Number(pm[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v >= 300 && v <= 50000) {
      prices.push({ value: v, at: pm.index });
    }
  }
  if (prices.length === 0) return facts;

  const nearestPrice = (at) => {
    let best = null;
    for (const p of prices) {
      const d = Math.abs(p.at - at);
      if (d > 250) continue;                 // 같은 문단 범위만
      if (!best || d < best.d) best = { ...p, d };
    }
    return best;
  };

  const push = (name, at, confidence) => {
    const p = nearestPrice(at);
    if (!p) return;
    const trimmed = name.trim().replace(/[,·]+$/g, '');
    if (trimmed.length < 3 || trimmed.length > 40) return;
    facts.push({ name: trimmed, price: p.value, confidence, distance: p.d });
  };

  // ⓪ 따옴표+괄호 가격 — 한국 보도자료의 표준 표기다. 가장 정확하다.
  //    예: '풍성한가위 정찬 도시락(6,500원)' · '참깨송편(3,500원)'
  const quoted = /[‘“'"]\s*([^’”'"()]{2,40}?)\s*\(\s*([\d,]{3,7})\s*원\s*\)/g;
  let qm;
  while ((qm = quoted.exec(clean)) !== null) {
    const price = Number(qm[2].replace(/,/g, ''));
    if (!Number.isFinite(price) || price < 300 || price > 50000) continue;
    facts.push({ name: qm[1].trim(), price, confidence: 'quoted', distance: 0 });
  }

  // ① 사전 일치
  const seenDict = new Set();
  for (const d of dictionary) {
    if (!d || d.length < 4) continue;
    const at = clean.indexOf(d);
    if (at < 0 || seenDict.has(d)) continue;
    seenDict.add(d);
    push(d, at, 'dictionary');
  }

  // ② 브랜드 접두어로 시작하는 제품명
  for (const prefix of PB_PREFIX) {
    let from = 0;
    for (;;) {
      const at = clean.indexOf(prefix, from);
      if (at < 0) break;
      from = at + prefix.length;
      // 접두어 뒤부터 잘라낸다. 문장부호나 '가격/출시/선보' 같은 서술어에서 끊고,
      // 남은 끝의 조사를 떼어낸다('불닭먹태구이를' → '불닭먹태구이').
      const tail = clean.slice(at, at + 46);
      const after = tail.slice(prefix.length);
      const stop = after.search(/[,.()\[\]·]|\d[\d,]{2,}\s*원|가격|출시|선보|판매|\d+종/);
      let name = prefix + (stop > 0 ? after.slice(0, stop) : after.split(' ').slice(0, 3).join(' '));
      name = name.trim().replace(/(을|를|은|는|이|가|와|과|의|도|만)$/, '').trim();
      push(name, at, 'prefix');
    }
  }

  // 같은 (이름, 가격) 은 하나만, 사전 일치를 우선한다
  const best = new Map();
  for (const f of facts) {
    const k = normName(f.name) + '|' + f.price;
    const prev = best.get(k);
    const rank = c => (c === 'quoted' ? 3 : c === 'dictionary' ? 2 : 1);
    if (!prev || rank(f.confidence) > rank(prev.confidence) ||
        (rank(f.confidence) === rank(prev.confidence) && f.distance < prev.distance)) {
      best.set(k, f);
    }
  }
  return [...best.values()];
}

async function collectOne(browser, source, dictionary) {
  const out = [];
  if (!withinVisitWindow(source.visit_time_utc)) {
    console.log(`  ${source.name}: robots 방문 시간대(${source.visit_time_utc} UTC) 밖 — 건너뜀`);
    return out;
  }

  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 1000 });
  const delay = Math.max(5000, (Number(source.crawl_delay_sec) || 0) * 1000);

  try {
    const res = await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 45000 });
    if (res && [403, 429].includes(res.status())) {
      console.warn(`  ${source.name}: HTTP ${res.status()} — 중단`);
      return out;
    }
    await sleep(3000);

    // 목록에서 기사 링크 수집
    const links = await page.evaluate(() => {
      const hrefs = [...document.querySelectorAll('a')]
        .map(a => a.href)
        .filter(h => h && /view|detail|articleCode|\?id=|\/news\//i.test(h));
      return [...new Set(hrefs)];
    });
    console.log(`  ${source.name}: 기사 링크 ${links.length}개`);

    // 개별 기사 링크가 없고 목록 본문에 제목이 다 실리는 사이트가 있다(이마트24).
    // 그런 경우를 위해 목록 페이지 본문에서도 한 번 훑는다.
    const listInfo = await page.evaluate(() => ({
      title: document.title,
      text: (document.body.innerText || '').slice(0, 8000)
    }));
    for (const f of extractPriceFacts(listInfo.text, dictionary)) {
      out.push({
        brand_code: source.brand_code, brand: source.name,
        name: f.name, price_krw: f.price, confidence: f.confidence,
        price_source_type: 'T3', source_url: source.url,
        article_title: listInfo.title.slice(0, 120),
        published_at: null, detected_at: new Date().toISOString(), status: '감지'
      });
    }

    for (const link of links.slice(0, MAX_ARTICLES)) {
      await sleep(delay);
      try {
        const r2 = await page.goto(link, { waitUntil: 'networkidle2', timeout: 40000 });
        if (r2 && [403, 429].includes(r2.status())) {
          console.warn(`  ${source.name}: HTTP ${r2.status()} — 중단`);
          break;
        }
        await sleep(1500);
        const info = await page.evaluate(() => ({
          title: document.title,
          text: (document.body.innerText || '').slice(0, 6000)
        }));

        const facts = extractPriceFacts(info.text, dictionary);
        if (!facts.length) continue;

        // 날짜 추정
        const dm = info.text.match(/(20\d{2})[.\-년\s]+(\d{1,2})[.\-월\s]+(\d{1,2})/);
        const detected = dm
          ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`
          : null;

        for (const f of facts) {
          out.push({
            brand_code: source.brand_code,
            brand: source.name,
            name: f.name,
            price_krw: f.price,
            confidence: f.confidence,
            price_source_type: 'T3',
            source_url: link,
            article_title: info.title.slice(0, 120),
            published_at: detected,
            detected_at: new Date().toISOString(),
            status: '감지'
          });
        }
      } catch (e) {
        // 개별 기사 실패는 넘어간다
      }
    }
  } catch (e) {
    console.warn(`  ${source.name}: ${e.message.slice(0, 90)}`);
  } finally {
    await page.close();
  }

  console.log(`  ${source.name}: 가격 사실 ${out.length}건 추출`);
  return out;
}

async function main() {
  const sourcesPath = path.join(rootDir, 'data', 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

  // 보도자료는 렌더가 필요해도 수집한다(목록·본문이 공개 자료다)
  const targets = (sources.press || []).filter(s => s.url && s.url_verified === true && s.status === 'ready');
  console.log(`보도자료 수집 대상 ${targets.length}곳`);

  // 사전 — 이미 아는 편의점 상품명(가격 대기 목록 + 기존 seed)
  const dictionary = [];
  const pendingPath = path.join(rootDir, 'data', 'pending_prices.json');
  if (fs.existsSync(pendingPath)) {
    for (const x of JSON.parse(fs.readFileSync(pendingPath, 'utf-8'))) dictionary.push(x.name);
  }
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  if (fs.existsSync(seedPath)) {
    for (const x of JSON.parse(fs.readFileSync(seedPath, 'utf-8'))) {
      if (x.channel === 'cvs') dictionary.push(x.name);
    }
  }
  console.log(`대조 사전 ${dictionary.length}개 상품명`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let all = [];
  try {
    for (const s of targets) {
      all = all.concat(await collectOne(browser, s, dictionary));
      await sleep(5000);
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(rootDir, 'data', 'press_prices.json');
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : [];
  const key = x => `${x.brand_code}|${x.name}|${x.price_krw}`;
  const seen = new Set(prev.map(key));
  const added = all.filter(x => !seen.has(key(x)));

  fs.writeFileSync(outPath, JSON.stringify(prev.concat(added), null, 2), 'utf-8');
  console.log(`\n신규 ${added.length}건 · 누적 ${prev.length + added.length}건 → data/press_prices.json`);
  for (const a of added.slice(0, 10)) {
    console.log(`   [${a.brand}] ${a.name} · ${a.price_krw.toLocaleString()}원`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
