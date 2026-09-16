// 정규화 파이프라인 (normalize.js)
// 기획안 v2.0 §4.1/§4.2/§4.4 — seed.json 을 한 번 통과시켜
//   ① 필드 신뢰도(*_status) 를 붙이고
//   ② 카테고리·조리법 enum 을 룰에 맞추고
//   ③ 브랜드 표기를 brand_code 로 통일하고
//   ④ menu_id 를 {channel}-{brand_code}-{slug}-{serving_g} 규칙으로 재생성한다(구 ID 는 legacy_ids 보존).
//
// 스크립트가 seed.json 을 직접 덮어쓰던 관행을 끊기 위해, 사람이 내린 보정은
// data/overrides.json 에 사유와 함께 적고 여기서 병합한다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const rules = JSON.parse(fs.readFileSync(path.join(rootDir, 'rules', 'rule_v1.1.json'), 'utf-8'));
const BRAND_CODES = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'brand_codes.json'), 'utf-8'));

// ── 카테고리 정규화 ──────────────────────────────────────────
const CATEGORY_MAP = {
  '라면/면류': '면',
  '아이스크림': '디저트',
  '간식/스낵': '과자/바',
  '육가공/가공육': '닭가슴살/육가공'
};

// ── 조리법 정규화 ────────────────────────────────────────────
// 'cooked'·'processed'·'microwave' 는 조리 방식을 특정하지 못하는 값이다.
// 임의로 끼워 맞추지 않고 unknown 으로 보낸 뒤, 튀김 여부는 제품명 보조 추정에 맡긴다.
const COOKING_MAP = {
  boil: 'boiled',
  cooked: 'unknown',
  processed: 'unknown',
  microwave: 'unknown'
};

// ── 브랜드 별칭 통합 (같은 주체만) ───────────────────────────
// 노브랜드버거(프랜차이즈)와 노브랜드(이마트 PB)는 다른 브랜드이므로 합치지 않는다.
const BRAND_ALIASES = {
  '굽네몰': '굽네치킨',
  '굽네': '굽네치킨',
  '롯데': '롯데웰푸드',
  '마이밀': '대상웰라이프',
  '청정원': '대상',
  '서브웨이': '써브웨이'
};

// T1 수집기(fetch_public_data.py)의 카테고리 고정 추정가 — 이 값과 정확히 같으면 추정가로 본다.
const ESTIMATED_PRICE_BY_CATEGORY = {
  '유제품/음료': [1800, 2800],
  '닭가슴살/육가공': [2200, 2900],
  '샐러드': [4900],
  '도시락': [5300],
  '삼각김밥/주먹밥': [1400],
  '샌드위치/버거': [4500],
  '과자/바': [2000],
  '기타': [3500]
};

const NUTRIENT_FIELDS = ['kcal', 'protein_g', 'carb_g', 'sugar_g', 'fat_g', 'sat_fat_g', 'sodium_mg', 'trans_fat_g', 'fiber_g'];

function slugFromMenuId(menuId) {
  if (typeof menuId !== 'string') return null;
  const parts = menuId.split('-');
  if (parts.length < 4) return null;
  return { brand_code: parts[1], slug: parts.slice(1, -1).join('-') };
}

function fallbackSlug(name) {
  return String(name || 'item')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function statusFor(item, field) {
  const v = item[field];
  if (v === null || v === undefined || v === '') return 'unknown';
  return 'measured';
}

function main() {
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  const overridesPath = path.join(rootDir, 'data', 'overrides.json');
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
    : {};

  const stats = {
    category_remapped: 0,
    cooking_remapped: 0,
    brand_merged: 0,
    menu_id_rebuilt: 0,
    price_estimated: 0,
    serving_estimated: 0,
    unknown_counts: {},
    overrides_applied: 0
  };

  const brands = {};
  const out = [];
  const usedIds = new Set();

  for (const raw of seed) {
    const item = { ...raw };

    // ① 카테고리
    if (CATEGORY_MAP[item.category]) {
      item.category = CATEGORY_MAP[item.category];
      stats.category_remapped++;
    }
    if (!rules.enums.category.includes(item.category)) {
      item.category = '기타';
      stats.category_remapped++;
    }

    // ② 조리법
    const mappedCooking = COOKING_MAP[item.cooking];
    if (mappedCooking) {
      item.cooking = mappedCooking;
      stats.cooking_remapped++;
    }
    if (!rules.enums.cooking.includes(item.cooking)) {
      item.cooking = 'unknown';
      stats.cooking_remapped++;
    }
    item.cooking_status = item.cooking === 'unknown' ? 'unknown' : 'measured';

    // ③ 브랜드
    const brandRaw = item.brand;
    const canonical = BRAND_ALIASES[brandRaw] || brandRaw;
    if (canonical !== brandRaw) stats.brand_merged++;
    const parsed = slugFromMenuId(item.menu_id);
    // brand_code 는 data/brand_codes.json 이 단일 원천이다.
    // 구 menu_id 의 2번째 토큰은 브랜드가 아니라 제품 라인(the·selex·doctor)인 경우가 있어 신뢰하지 않는다.
    const brandCode = BRAND_CODES[canonical] || fallbackSlug(canonical);
    item.brand = canonical;
    item.brand_raw = brandRaw;
    item.brand_code = brandCode;

    if (!brands[brandCode]) {
      brands[brandCode] = { brand_code: brandCode, name: canonical, aliases: new Set(), channels: new Set() };
    }
    brands[brandCode].aliases.add(brandRaw);
    brands[brandCode].channels.add(item.channel);

    // ④ menu_id 재생성 — 접두사를 channel 과 일치시킨다
    let slug = (parsed && parsed.slug) || fallbackSlug(item.name);
    if (slug.startsWith(`${brandCode}-`)) slug = slug.slice(brandCode.length + 1);
    if (!slug) slug = fallbackSlug(item.name);
    let newId = `${item.channel}-${brandCode}-${slug}-${Math.round(Number(item.serving_g) || 0)}`;
    if (usedIds.has(newId)) {
      let n = 2;
      while (usedIds.has(`${newId}-${n}`)) n++;
      newId = `${newId}-${n}`;
    }
    if (newId !== item.menu_id) {
      item.legacy_ids = Array.from(new Set([...(item.legacy_ids || []), item.menu_id]));
      item.menu_id = newId;
      stats.menu_id_rebuilt++;
    }
    usedIds.add(newId);

    // ⑤ 필드 신뢰도
    for (const f of NUTRIENT_FIELDS) {
      if (!(f in item)) item[f] = null;
      item[`${f}_status`] = statusFor(item, f);
    }
    item.price_krw_status = statusFor(item, 'price_krw');
    item.serving_g_status = statusFor(item, 'serving_g');

    // 가격 추정 판정 — T1 공공DB 행은 가격이 없어 수집기가 카테고리 고정값을 넣었다
    if (item.source_type === 'T1') {
      const candidates = ESTIMATED_PRICE_BY_CATEGORY[item.category] || [];
      if (candidates.includes(Number(item.price_krw))) {
        item.price_krw_status = 'estimated';
        item.estimate_basis = Object.assign({}, item.estimate_basis, {
          price_krw: '식약처 공공DB에는 가격이 없어 수집기가 카테고리 고정 추정가를 사용했다(fetch_public_data.estimate_price)'
        });
        stats.price_estimated++;
      }
    }

    // 내용량 역산 판정 — serving_g = P+C+F+50 으로 덮어쓴 흔적
    const p = Number(item.protein_g || 0);
    const c = Number(item.carb_g || 0);
    const f = Number(item.fat_g || 0);
    if (Number(item.serving_g) > 0 && Math.abs(Number(item.serving_g) - (p + c + f + 50)) < 0.51) {
      item.serving_g_status = 'estimated';
      item.estimate_basis = Object.assign({}, item.estimate_basis, {
        serving_g: '표기 내용량 미확보 · 영양성분 합계 + 50g 으로 역산된 값(fix_serving.js)'
      });
      stats.serving_estimated++;
    }

    // ⑥ 사람이 내린 보정 병합 (단일 원천 유지)
    const ov = overrides[item.menu_id] || overrides[raw.menu_id];
    if (ov && ov.fields) {
      for (const [k, v] of Object.entries(ov.fields)) {
        item[k] = v;
        if (NUTRIENT_FIELDS.includes(k)) item[`${k}_status`] = ov.status || 'measured';
      }
      item.override_reason = ov.reason || null;
      stats.overrides_applied++;
    }

    // 이미지 출처 필수 — 출처가 없으면 이미지를 쓰지 않는다
    if (item.image_url && !item.image_source) {
      item.image_url = '';
    }

    for (const f2 of [...NUTRIENT_FIELDS, 'price_krw', 'serving_g', 'cooking']) {
      if (item[`${f2}_status`] === 'unknown') {
        stats.unknown_counts[f2] = (stats.unknown_counts[f2] || 0) + 1;
      }
    }

    out.push(item);
  }

  fs.writeFileSync(seedPath, JSON.stringify(out, null, 2), 'utf-8');

  const brandsOut = Object.values(brands)
    .map(b => ({
      brand_code: b.brand_code,
      name: b.name,
      aliases: [...b.aliases].filter(a => a !== b.name),
      channels: [...b.channels].sort(),
      nutrition_url: null,
      disclosure_duty: null
    }))
    .sort((a, b) => a.brand_code.localeCompare(b.brand_code));
  fs.writeFileSync(path.join(rootDir, 'data', 'brands.json'), JSON.stringify(brandsOut, null, 2), 'utf-8');

  console.log('정규화 완료');
  console.log(`  카테고리 재매핑 ${stats.category_remapped} · 조리법 재매핑 ${stats.cooking_remapped}`);
  console.log(`  브랜드 통합 ${stats.brand_merged} · brand 사전 ${brandsOut.length}종`);
  console.log(`  menu_id 재생성 ${stats.menu_id_rebuilt}`);
  console.log(`  추정 표시: 가격 ${stats.price_estimated} · 내용량 ${stats.serving_estimated}`);
  console.log(`  보정 병합 ${stats.overrides_applied}건`);
  console.log('  unknown 필드 분포:', JSON.stringify(stats.unknown_counts));
}

main();
