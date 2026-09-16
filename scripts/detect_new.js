// 신상·변경 감지 (detect_new.js)
// 기획안 v2.0 §4.6 detect-new.yml 이 호출한다.
//
// 하는 일: data/sources.json 에 등록된 '수집 가능' 소스의 공식 페이지를 받아
//          텍스트 해시를 비교하고, 바뀐 브랜드만 후보 큐(data/candidates.json)에 넣는다.
// 하지 않는 일: 편의점 앱·로그인 뒤 데이터·타사 DB 수집. 어떤 단계에서도 하지 않는다.
//
// 게이트: url_verified 가 true 이고 status 가 'notified' 인 항목만 호출한다.
//         (추정 URL 을 크론이 때리는 일을 구조적으로 막는다)

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const UA = 'ProteinRadarBot/2.0 (개인 프로젝트 · 영양정보 변경 감지 · 문의: 사이트 정책 페이지)';
const REQUEST_INTERVAL_MS = 5000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function textHash(html) {
  // 스크립트·스타일·공백을 걷어낸 본문 텍스트만 해싱한다(광고·타임스탬프 변동에 덜 민감).
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function fetchWithGuards(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow'
  });
  if (res.status === 403 || res.status === 429) {
    return { blocked: true, status: res.status };
  }
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return { html: await res.text() };
}

async function main() {
  const sourcesPath = path.join(rootDir, 'data', 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

  const targets = [...(sources.brands || []), ...(sources.press || [])]
    .filter(s => s.url && s.url_verified === true && s.status === 'notified');

  const skipped = [...(sources.brands || []), ...(sources.press || [])].length - targets.length;
  console.log(`감지 대상 ${targets.length}곳 (건너뜀 ${skipped}곳 — URL 미확인 또는 사전 고지 전)`);

  if (targets.length === 0) {
    console.log('수집 가능한 소스가 없습니다. data/sources.json 의 0단계 실사를 먼저 끝내세요.');
    return;
  }

  const candidatesPath = path.join(rootDir, 'data', 'candidates.json');
  const candidates = fs.existsSync(candidatesPath)
    ? JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'))
    : [];

  let changed = 0;
  for (const s of targets) {
    const r = await fetchWithGuards(s.url);
    await sleep(REQUEST_INTERVAL_MS);

    if (r.blocked) {
      s.status = 'blocked';
      s.last_checked_at = new Date().toISOString().slice(0, 10);
      console.warn(`  ${s.name}: 차단(HTTP ${r.status}) → status=blocked 로 내리고 수집을 멈춥니다.`);
      continue;
    }
    if (r.error) {
      console.warn(`  ${s.name}: ${r.error}`);
      continue;
    }

    const hash = textHash(r.html);
    const prev = s.last_hash;
    s.last_hash = hash;
    s.last_checked_at = new Date().toISOString().slice(0, 10);

    if (prev && prev !== hash) {
      changed++;
      candidates.push({
        brand_code: s.brand_code,
        brand: s.name,
        source_url: s.url,
        detected_at: new Date().toISOString(),
        status: '감지',
        note: `공식 페이지 내용 변경 (${prev} → ${hash})`
      });
      console.log(`  ${s.name}: 변경 감지 → 후보 큐 등재`);
    } else if (!prev) {
      console.log(`  ${s.name}: 최초 해시 기록 ${hash}`);
    } else {
      console.log(`  ${s.name}: 변경 없음`);
    }
  }

  fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2), 'utf-8');
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2), 'utf-8');
  console.log(`변경 ${changed}건 · 후보 큐 누적 ${candidates.length}건`);
}

main().catch(err => {
  console.error('감지 실패:', err.message);
  process.exit(1);
});
