// 편의점 신규 레코드 병합 (merge_cvs_items.js)
//
// build_cvs_items.js 산출물을 검증한 뒤 data/seed.json 에 합친다.
//
// 걸러내는 것 — 공공DB 에는 같은 이름의 '업소용 대용량' 제품이 함께 있어서,
// 편의점 소매 가격과 잘못 짝지어지면 김밥 1,027g / 치킨 9,000g 같은 레코드가 나온다.
//   ① 내용량 700g 초과 (편의점 1개 판매 단위로 볼 수 없다)
//   ② 1g당 가격 5원 미만 (실측 분포 p5 = 7.0원/g · 중위 17.9원/g)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const MAX_SERVING_G = 700;
const MIN_PRICE_PER_G = 5;

const norm = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

function main() {
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const incoming = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'cvs_new_items.json'), 'utf-8'));

  const existingIds = new Set(seed.map(x => x.menu_id));
  const existingNames = new Set(seed.map(x => norm(x.name)));

  const rejected = { oversize: [], cheap_per_g: [], duplicate: [] };
  const accepted = [];

  for (const it of incoming) {
    if (it.serving_g > MAX_SERVING_G) { rejected.oversize.push(it); continue; }
    if (it.price_krw / it.serving_g < MIN_PRICE_PER_G) { rejected.cheap_per_g.push(it); continue; }
    if (existingIds.has(it.menu_id) || existingNames.has(norm(it.name))) { rejected.duplicate.push(it); continue; }

    existingIds.add(it.menu_id);
    existingNames.add(norm(it.name));

    // 빌드 파이프라인이 기대하는 형태로만 남긴다(조사용 필드는 뺀다)
    const { display_name_raw, match_how, maker_nm, item_report_no, ...rest } = it;
    accepted.push({ ...rest, source_note: `영양 식약처 공공DB · 가격 ${it.price_source_type} 체인 공식 웹 · 제조 ${maker_nm || '미상'}` });
  }

  fs.writeFileSync(seedPath, JSON.stringify(seed.concat(accepted), null, 2), 'utf-8');

  console.log(`병합 ${accepted.length}건 (seed ${seed.length} → ${seed.length + accepted.length})`);
  console.log(`제외: 대용량 ${rejected.oversize.length} · 저단가 ${rejected.cheap_per_g.length} · 중복 ${rejected.duplicate.length}`);
  for (const r of [...rejected.oversize, ...rejected.cheap_per_g].slice(0, 10)) {
    console.log(`   빠짐: ${r.display_name_raw} → ${r.name} · ${r.serving_g}g · ${(r.price_krw / r.serving_g).toFixed(1)}원/g`);
  }

  const byBrand = accepted.reduce((m, x) => { m[x.brand] = (m[x.brand] || 0) + 1; return m; }, {});
  console.log('브랜드별:', JSON.stringify(byBrand));
}

main();
