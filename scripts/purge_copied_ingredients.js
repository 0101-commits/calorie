// 복사된 원재료 문자열 격리 (purge_copied_ingredients.js)
//
// 서로 다른 브랜드의 제품이 똑같은 원재료 문자열을 갖고 있으면 그중 최소 한쪽은 그 제품의 것이 아니다.
// 실측에서 동원참치의 원재료가 "닭가슴살(국내산 96%)…" 였고, 같은 문자열을 87건이 공유했다.
// 이 문자열 위에서 CleanRadar 점수와 흡수 속도가 계산돼 화면에 「안심 원료」로 나갔다.
//
// 고치지 않고 비운다 — 원재료를 모르면 모른다고 적는 것이 이 서비스의 규칙이다.
//
//   node scripts/purge_copied_ingredients.js --dry     무엇이 비워지는지만 출력
//   node scripts/purge_copied_ingredients.js           seed.json 수정 + 격리 기록 + 재확인 큐 적재

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findCopiedIngredientGroups } from '../js/qa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const MIN_LENGTH = 20;   // 너무 짧은 문자열은 우연히 같을 수 있다
const dry = process.argv.includes('--dry');

const seedPath = path.join(rootDir, 'data', 'seed.json');
const items = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const groups = findCopiedIngredientGroups(items, MIN_LENGTH).map(g => ({ raw: g.ingredients_raw, brands: g.brands, items: g.items }));
const affected = groups.reduce((n, g) => n + g.items.length, 0);

console.log(`\n🧹 복사된 원재료 문자열 ${groups.length}묶음 · ${affected}건`);
groups.slice(0, 10).forEach(g => {
  console.log(`  - ${g.items.length}건 (브랜드 ${g.brands.length}곳): ${g.raw.slice(0, 60)}…`);
});

if (dry) {
  console.log('\n(--dry 이므로 파일은 바꾸지 않았습니다)\n');
  process.exit(0);
}

const quarantine = groups.map(g => ({
  reason: 'copied_ingredients',
  detected_at: new Date().toISOString().slice(0, 10),
  brand_count: g.brands.length,
  item_count: g.items.length,
  brands: g.brands,
  ingredients_raw: g.raw,
  items: g.items.map(i => ({ menu_id: i.menu_id, brand: i.brand, name: i.name }))
}));

const affectedIds = new Set();
for (const g of groups) for (const it of g.items) affectedIds.add(it.menu_id);

for (const it of items) {
  if (!affectedIds.has(it.menu_id)) continue;
  it.ingredients_raw = '';
}

fs.writeFileSync(seedPath, JSON.stringify(items, null, 2), 'utf-8');

const qPath = path.join(rootDir, 'data', 'quarantine', 'copied_ingredients.json');
fs.writeFileSync(qPath, JSON.stringify(quarantine, null, 2), 'utf-8');

// 재확인 큐 — 브랜드 공식 원재료를 다시 받아야 하는 목록
const queuePath = path.join(rootDir, 'data', 'recheck_queue.json');
const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf-8')) : [];
const queued = new Set(queue.map(q => q.menu_id));
for (const g of groups) {
  for (const it of g.items) {
    if (queued.has(it.menu_id)) continue;
    queue.push({
      menu_id: it.menu_id,
      brand: it.brand,
      brand_code: it.brand_code || null,
      name: it.name,
      field: 'ingredients_raw',
      reason: 'copied_ingredients',
      queued_at: new Date().toISOString().slice(0, 10)
    });
  }
}
fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');

console.log(`\n✅ seed.json 에서 ${affectedIds.size}건의 원재료를 비웠습니다.`);
console.log(`   격리 기록: data/quarantine/copied_ingredients.json (${groups.length}묶음)`);
console.log(`   재확인 큐: data/recheck_queue.json (${queue.length}건)\n`);
console.log('다음: npm run pipeline 으로 다시 빌드하면 해당 건의 CleanRadar·흡수 속도가 "미확보"로 바뀝니다.\n');
