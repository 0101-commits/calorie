// P0 격리 스크립트 (p0_quarantine.js)
// 기획안 v2.0 P0 — 결정 D10/D16 반영. 1회성이 아니라 재실행 가능(멱등)하게 작성한다.
//
//  ① source_type = 'fatsecret' 59건  → 게시 중단(격리). 기획서 §3.7 금지 소스이며
//     나트륨·당류·포화지방이 리터럴 0이라 페널티가 면제돼 등급을 부풀린다.
//  ② source_url 이 재확인 불가('https://various') + brand='일반' 10건 → 격리.
//     식약처 원재료성 데이터를 잘못 파싱한 건으로 sat_fat===fat 오류 포함.
//  ③ 타사 CDN 핫링크 이미지 → image_url 비움. 기획서 §7은 촬영본·보도자료만 허용한다.
//     내린 건은 촬영 큐(data/photo_queue.json)로 남긴다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const seedPath = path.join(rootDir, 'data', 'seed.json');
const quarantineDir = path.join(rootDir, 'data', 'quarantine');

// 허용 이미지 호스트(자체 자산·브랜드 공식). 그 외 외부 호스트는 전부 내린다.
const ALLOWED_IMAGE_HOSTS = [];

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function main() {
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const before = seed.length;

  const quarantined = { fatsecret: [], corrupt_meta: [] };
  const kept = [];

  for (const item of seed) {
    if (item.source_type === 'fatsecret') {
      quarantined.fatsecret.push({
        ...item,
        _quarantine_reason: '기획서 §3.7 금지 소스(타사 식단 DB 스크레이핑) · 나트륨·당류·포화지방 리터럴 0 · 가격 추측값',
        _quarantined_at: new Date().toISOString().slice(0, 10)
      });
      continue;
    }
    if (item.source_url === 'https://various' || item.brand === '일반') {
      quarantined.corrupt_meta.push({
        ...item,
        _quarantine_reason: '출처 URL 재확인 불가 + 브랜드 미상 · 식약처 응답 파싱 오류(sat_fat===fat)',
        _quarantined_at: new Date().toISOString().slice(0, 10)
      });
      continue;
    }
    kept.push(item);
  }

  // ③ 핫링크 이미지 내림
  const photoQueue = [];
  for (const item of kept) {
    const url = item.image_url;
    if (!url) continue;
    const host = hostOf(url);
    if (ALLOWED_IMAGE_HOSTS.includes(host)) continue;
    photoQueue.push({
      menu_id: item.menu_id,
      brand: item.brand,
      name: item.name,
      channel: item.channel,
      category: item.category,
      price_krw: item.price_krw,
      protein_g: item.protein_g,
      removed_host: host
    });
    item.image_url = '';
    item.image_source = null;
  }

  // 촬영 우선순위: 단백질 가성비(PPR) 높은 순 — 랭킹 상위에 먼저 노출되는 카드부터
  photoQueue.sort((a, b) => {
    const pa = a.price_krw ? a.protein_g / (a.price_krw / 1000) : 0;
    const pb = b.price_krw ? b.protein_g / (b.price_krw / 1000) : 0;
    return pb - pa;
  });
  photoQueue.forEach((row, i) => { row.priority = i + 1; });

  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.writeFileSync(path.join(quarantineDir, 'fatsecret.json'),
    JSON.stringify(quarantined.fatsecret, null, 2), 'utf-8');
  fs.writeFileSync(path.join(quarantineDir, 'corrupt_meta.json'),
    JSON.stringify(quarantined.corrupt_meta, null, 2), 'utf-8');
  fs.writeFileSync(path.join(rootDir, 'data', 'photo_queue.json'),
    JSON.stringify(photoQueue, null, 2), 'utf-8');
  fs.writeFileSync(seedPath, JSON.stringify(kept, null, 2), 'utf-8');

  console.log(`격리: fatsecret ${quarantined.fatsecret.length}건 · 메타 손상 ${quarantined.corrupt_meta.length}건`);
  console.log(`이미지 내림: ${photoQueue.length}건 → data/photo_queue.json (촬영 큐)`);
  console.log(`seed.json ${before} → ${kept.length}건`);
}

main();
