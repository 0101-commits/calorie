// 입력된 가격을 seed 에 반영 (merge_pending_prices.js)
//
// data/pending_prices.json 에서 가격이 입력된 건만 골라 정식 레코드로 만들어 seed 에 넣는다.
// 가격이 없는 건은 그대로 대기 상태로 남긴다 — 추정치로 채우지 않는다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const MIN_PRICE_PER_G = 5;   // 업소용 대용량 혼입 방지(실측 분포 p5 = 7.0원/g)
const norm = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

function main() {
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const pendingPath = path.join(rootDir, 'data', 'pending_prices.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));

  const haveId = new Set(seed.map(x => x.menu_id));
  const haveName = new Set(seed.map(x => norm(x.name)));

  const accepted = [];
  const rejected = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const it of pending) {
    if (!it.price_krw) continue;
    if (haveId.has(it.menu_id) || haveName.has(norm(it.name))) continue;
    if (it.price_krw / it.serving_g < MIN_PRICE_PER_G) { rejected.push(it); continue; }

    haveId.add(it.menu_id);
    haveName.add(norm(it.name));

    accepted.push({
      menu_id: it.menu_id,
      channel: 'cvs',
      brand: it.brand,
      brand_code: it.brand_code,
      name: it.name,
      category: it.category,
      price_krw: it.price_krw,
      price_krw_status: 'measured',
      serving_g: it.serving_g,
      serving_g_status: 'measured',
      kcal: it.kcal, kcal_status: 'measured',
      protein_g: it.protein_g, protein_g_status: 'measured',
      carb_g: it.carb_g, carb_g_status: it.carb_g === null ? 'unknown' : 'measured',
      sugar_g: it.sugar_g, sugar_g_status: it.sugar_g === null ? 'unknown' : 'measured',
      fat_g: it.fat_g, fat_g_status: it.fat_g === null ? 'unknown' : 'measured',
      sat_fat_g: null, sat_fat_g_status: 'unknown',
      trans_fat_g: null, trans_fat_g_status: 'unknown',
      sodium_mg: it.sodium_mg, sodium_mg_status: it.sodium_mg === null ? 'unknown' : 'measured',
      fiber_g: null, fiber_g_status: 'unknown',
      protein_source: it.protein_source,
      cooking: it.cooking,
      marketing_claim: it.marketing_claim,
      claim_text: null,
      barcode: null,
      ingredients_raw: '',
      image_url: '',
      image_source: null,
      source_type: 'T1',
      source_url: it.source_url,
      price_source_type: it.price_source_type || 'T5-manual',
      price_source_url: null,
      verified_at: it.price_checked_at || today,
      rule_version: 'v1.1',
      source_note: `영양 식약처 공공DB · 가격 ${it.price_source_note || '운영자 직접 확인'} · 제조 ${it.maker_nm || '미상'}`
    });
  }

  if (accepted.length === 0) {
    const priced = pending.filter(x => x.price_krw).length;
    console.log(`반영할 신규 건이 없습니다. (가격 입력 ${priced}건 · 이미 반영됐거나 중복)`);
    if (rejected.length) console.log(`  단가 이상으로 제외 ${rejected.length}건`);
    return;
  }

  fs.writeFileSync(seedPath, JSON.stringify(seed.concat(accepted), null, 2), 'utf-8');
  console.log(`반영 ${accepted.length}건 (seed ${seed.length} → ${seed.length + accepted.length})`);
  if (rejected.length) {
    console.log(`제외 ${rejected.length}건 (1g당 ${MIN_PRICE_PER_G}원 미만 — 업소용 대용량 의심)`);
    for (const r of rejected.slice(0, 5)) {
      console.log(`   ${r.name} · ${r.serving_g}g · ${(r.price_krw / r.serving_g).toFixed(1)}원/g`);
    }
  }
  const byChain = accepted.reduce((m, x) => { m[x.brand] = (m[x.brand] || 0) + 1; return m; }, {});
  console.log('체인별:', JSON.stringify(byChain));
  console.log('\n다음: node scripts/normalize.js && node scripts/build.js');
}

main();
