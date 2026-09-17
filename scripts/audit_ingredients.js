// 원재료 전수 점검 (audit_ingredients.js)
// 화면에 붙는 판정(CleanRadar·흡수 속도)은 원재료 문자열을 믿고 내려간다.
// 그 문자열이 다른 제품 것이거나 제품명과 어긋나면 판정 전체가 거짓이 된다.
// 이 스크립트는 고치지 않는다 — 의심 건을 찾아 보고만 한다.
//
//   node scripts/audit_ingredients.js            보고서 출력
//   node scripts/audit_ingredients.js --json     scratch/ingredient_audit.json 저장

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeIngredients } from '../js/clean_radar.js';
import { findCopiedIngredientGroups } from '../js/qa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// 제품명에 이 말이 있으면 원재료에도 대응 원료가 있어야 한다.
const NAME_TO_INGREDIENT = [
  { name: ['닭가슴살', '닭안심', '닭다리', '치킨', '닭강정'], expect: ['닭', '계육'] },
  { name: ['소고기', '스테이크', '불고기', '우삼겹'], expect: ['소고기', '우육', '쇠고기'] },
  { name: ['돼지', '삼겹', '제육', '돈까스', '돈카츠', '포크'], expect: ['돼지', '돈육'] },
  { name: ['연어'], expect: ['연어'] },
  { name: ['참치'], expect: ['참치', '다랑어'] },
  { name: ['새우'], expect: ['새우'] },
  { name: ['두부'], expect: ['두부', '대두'] },
  { name: ['계란', '달걀', '에그'], expect: ['계란', '달걀', '난백', '난황', '전란'] },
  { name: ['두유'], expect: ['대두', '두유', '콩'] }
];

const norm = s => String(s || '').toLowerCase().replace(/\s/g, '');

function loadItems() {
  const p = path.join(rootDir, 'data.json');
  if (!fs.existsSync(p)) {
    console.error('❌ data.json 이 없습니다. npm run pipeline 을 먼저 돌리세요.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** F1 — 제품명이 말하는 원료가 원재료에 없다 */
function findNameMismatch(items) {
  const out = [];
  for (const it of items) {
    const raw = norm(it.ingredients_raw);
    if (!raw) continue;
    const name = norm(it.name);
    for (const rule of NAME_TO_INGREDIENT) {
      if (!rule.name.some(k => name.includes(norm(k)))) continue;
      if (rule.expect.some(k => raw.includes(norm(k)))) continue;
      out.push({
        menu_id: it.menu_id,
        brand: it.brand,
        name: it.name,
        why: `제품명에 '${rule.name.find(k => name.includes(norm(k)))}' 가 있는데 원재료에 ${rule.expect.join('·')} 가 없다`,
        ingredients_head: String(it.ingredients_raw).slice(0, 80)
      });
      break;
    }
  }
  return out;
}

/** F2 — 서로 다른 브랜드가 같은 원재료 문자열을 쓴다(복사 붙여넣기 흔적) */
function findSharedStrings(items) {
  return findCopiedIngredientGroups(items).map(g => ({
    brands: g.brands,
    count: g.items.length,
    items: g.items.map(i => ({ menu_id: i.menu_id, brand: i.brand, name: i.name })),
    ingredients_head: g.ingredients_raw.slice(0, 80)
  }));
}

/** F3 — 단백질을 앞세운 제품인데 원재료에 단백질 원천이 하나도 없다 */
function findNoProteinSource(items) {
  const out = [];
  for (const it of items) {
    if (!String(it.ingredients_raw || '').trim()) continue;
    if (Number(it.protein_g || 0) < 10) continue;
    const tokens = analyzeIngredients(it.ingredients_raw).tokens || [];
    if (tokens.some(t => t.category === 'protein')) continue;
    out.push({
      menu_id: it.menu_id,
      brand: it.brand,
      name: it.name,
      protein_g: it.protein_g,
      ingredients_head: String(it.ingredients_raw).slice(0, 80)
    });
  }
  return out;
}

/** F4 — 원재료 문자열이 지나치게 짧다(요약본일 가능성) */
function findTooShort(items) {
  return items
    .filter(it => {
      const raw = String(it.ingredients_raw || '').trim();
      return raw && raw.length < 15;
    })
    .map(it => ({ menu_id: it.menu_id, brand: it.brand, name: it.name, ingredients_raw: it.ingredients_raw }));
}

function main() {
  const items = loadItems();
  const withRaw = items.filter(it => String(it.ingredients_raw || '').trim());

  const report = {
    generated_at: new Date().toISOString(),
    total: items.length,
    with_ingredients: withRaw.length,
    f1_name_mismatch: findNameMismatch(items),
    f2_shared_strings: findSharedStrings(items),
    f3_no_protein_source: findNoProteinSource(items),
    f4_too_short: findTooShort(items)
  };

  console.log(`\n🔍 원재료 전수 점검 — ${items.length}건 중 원재료 보유 ${withRaw.length}건\n`);

  console.log(`F1 제품명↔원재료 불일치: ${report.f1_name_mismatch.length}건`);
  report.f1_name_mismatch.slice(0, 15).forEach(r => console.log(`  - ${r.brand} ${r.name} — ${r.why}\n      ${r.ingredients_head}`));

  console.log(`\nF2 브랜드가 다른데 원재료 문자열이 같음: ${report.f2_shared_strings.length}묶음`);
  report.f2_shared_strings.slice(0, 10).forEach(r => console.log(`  - ${r.count}건 (${r.brands.join(', ')}): ${r.items.map(i => i.name).join(' / ')}\n      ${r.ingredients_head}`));

  console.log(`\nF3 단백질 10g 이상인데 원재료에 단백질 원천 없음: ${report.f3_no_protein_source.length}건`);
  report.f3_no_protein_source.slice(0, 15).forEach(r => console.log(`  - ${r.brand} ${r.name} (${r.protein_g}g)\n      ${r.ingredients_head}`));

  console.log(`\nF4 원재료가 너무 짧음: ${report.f4_too_short.length}건`);
  report.f4_too_short.slice(0, 10).forEach(r => console.log(`  - ${r.brand} ${r.name}: ${r.ingredients_raw}`));

  if (process.argv.includes('--json')) {
    const outPath = path.join(rootDir, 'scratch', 'ingredient_audit.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n💾 scratch/ingredient_audit.json 저장`);
  }
  console.log('');
}

main();
