// 편의점 공식 웹 상품 목록에서 상품명·가격 수집 (collect_cvs_prices.js)
//
// 목적: 식약처 공공DB(T1)에는 영양은 있지만 가격이 없다. 가격은 각 체인이 공식 웹에
//       공개한 상품 목록에서 가져와 둘을 이름으로 잇는다.
//
// 범위: CU · 세븐일레븐 · 이마트24 3사. GS25 는 공식 웹에 상품 카탈로그가 없고
//       전부 앱으로 유도하므로 대상에서 뺀다(앱 수집은 어떤 단계에서도 하지 않는다).
//
// 가드: robots 준수(세 곳 모두 상품 경로 차단 없음 · 2026-09-16 확인) · 요청 간격 5초 ·
//       페이지 수 상한 · 403/429 수신 시 즉시 중단 · UA 에 서비스 주소 표기 ·
//       로그인 뒤 데이터는 건드리지 않는다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const UA = 'ProteinRadarBot/2.0 (+https://0101-commits.github.io/calorie/; public product listing lookup)';
const INTERVAL_MS = 5000;
const MAX_PAGES = 40;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** "샐)오리지널닭가슴살샐러 4,800원" → { name, price } */
function splitNamePrice(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)[\s]*([\d][\d,]{2,6})\s*원?$/);
  if (!m) return null;
  const price = Number(m[2].replace(/,/g, ''));
  let name = m[1].trim();
  // 목록 앞에 붙는 배지 제거
  name = name.replace(/^(NEW|HOT|BEST|1\+1|2\+1|PB|행사)\s*/gi, '').trim();
  if (!name || !price || price < 300 || price > 50000) return null;
  return { name, price };
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 1000 });
  return page;
}

/** CU — pbAjax.do 가 페이지당 40건을 li.prod_list 로 준다 */
async function collectCU(browser) {
  const page = await newPage(browser);
  const out = [];
  const seen = new Set();
  try {
    for (let i = 1; i <= MAX_PAGES; i++) {
      const url = `https://cu.bgfretail.com/product/pbAjax.do?pageIndex=${i}`;
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (res && [403, 429].includes(res.status())) {
        console.warn(`  CU: HTTP ${res.status()} — 중단`);
        break;
      }
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('li.prod_list')].map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
      );
      let added = 0;
      for (const raw of items) {
        const p = splitNamePrice(raw);
        if (!p || seen.has(p.name)) continue;
        seen.add(p.name);
        out.push({ chain: 'CU', ...p, source_url: url });
        added++;
      }
      process.stdout.write(`  CU p${i}: ${items.length}건(신규 ${added})\r`);
      if (items.length === 0 || added === 0) break;
      await sleep(INTERVAL_MS);
    }
  } finally {
    await page.close();
  }
  console.log(`\n  CU 합계 ${out.length}건`);
  return out;
}

/** 세븐일레븐 — div.pic_product 안에 상품명과 가격이 함께 있다 */
async function collectSeven(browser) {
  const page = await newPage(browser);
  const out = [];
  const seen = new Set();
  const urls = [
    'https://www.7-eleven.co.kr/product/7prodList.asp',
    'https://www.7-eleven.co.kr/product/presentList.asp',
    'https://www.7-eleven.co.kr/product/bestList.asp',
    'https://www.7-eleven.co.kr/product/listMoreAjax.asp'
  ];
  try {
    for (const url of urls) {
      try {
        const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        if (res && [403, 429].includes(res.status())) {
          console.warn(`  세븐일레븐: HTTP ${res.status()} — 중단`);
          break;
        }
        await sleep(1500);
        const items = await page.evaluate(() =>
          [...document.querySelectorAll('div.pic_product')].map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
        );
        let added = 0;
        for (const raw of items) {
          const p = splitNamePrice(raw);
          if (!p || seen.has(p.name)) continue;
          seen.add(p.name);
          out.push({ chain: '세븐일레븐', ...p, source_url: url });
          added++;
        }
        console.log(`  세븐일레븐 ${url.split('/').pop()}: ${items.length}건(신규 ${added})`);
      } catch (e) {
        console.log(`  세븐일레븐 ${url.split('/').pop()}: ${e.message.slice(0, 60)}`);
      }
      await sleep(INTERVAL_MS);
    }
  } finally {
    await page.close();
  }
  console.log(`  세븐일레븐 합계 ${out.length}건`);
  return out;
}

/** 이마트24 — div.itemWrap 안에 상품명과 가격이 함께 있다 */
async function collectEmart24(browser) {
  const page = await newPage(browser);
  const out = [];
  const seen = new Set();
  const bases = ['https://emart24.co.kr/goods/pl', 'https://emart24.co.kr/goods/ff'];
  try {
    for (const base of bases) {
      for (let i = 1; i <= MAX_PAGES; i++) {
        const url = i === 1 ? base : `${base}?page=${i}`;
        const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        if (res && [403, 429].includes(res.status())) {
          console.warn(`  이마트24: HTTP ${res.status()} — 중단`);
          return out;
        }
        await sleep(1500);
        const items = await page.evaluate(() =>
          [...document.querySelectorAll('div.itemWrap')].map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
        );
        let added = 0;
        for (const raw of items) {
          const p = splitNamePrice(raw);
          if (!p || seen.has(p.name)) continue;
          seen.add(p.name);
          out.push({ chain: '이마트24', ...p, source_url: url });
          added++;
        }
        process.stdout.write(`  이마트24 ${base.split('/').pop()} p${i}: ${items.length}건(신규 ${added})\r`);
        if (items.length === 0 || added === 0) break;
        await sleep(INTERVAL_MS);
      }
      console.log('');
    }
  } finally {
    await page.close();
  }
  console.log(`  이마트24 합계 ${out.length}건`);
  return out;
}

(async () => {
  console.log('편의점 공식 웹 상품명·가격 수집 시작 (CU · 세븐일레븐 · 이마트24)');
  console.log('GS25 는 공식 웹에 상품 카탈로그가 없어 제외 — 앱 수집은 하지 않는다.\n');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let all = [];
  try {
    all = all.concat(await collectCU(browser));
    await sleep(INTERVAL_MS);
    all = all.concat(await collectSeven(browser));
    await sleep(INTERVAL_MS);
    all = all.concat(await collectEmart24(browser));
  } finally {
    await browser.close();
  }

  const payload = {
    collected_at: new Date().toISOString(),
    source: '각 체인 공식 웹 상품 목록 페이지',
    note: '상품명과 정가 표기만 수집한다. 영양성분은 식약처 공공DB 와 이름으로 매칭해 붙인다.',
    counts: all.reduce((m, x) => { m[x.chain] = (m[x.chain] || 0) + 1; return m; }, {}),
    items: all
  };
  const outPath = path.join(rootDir, 'data', 'cvs_prices.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\n총 ${all.length}건 → data/cvs_prices.json`);
  console.log(JSON.stringify(payload.counts));
})();
