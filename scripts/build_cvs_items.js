// 편의점 상품 레코드 생성 (build_cvs_items.js)
//
// 두 소스를 잇는다.
//   가격·상품명 : 각 체인 공식 웹 상품 목록 (data/cvs_prices.json)
//   영양성분     : 식약처 식품영양성분DB API (T1)
//
// 중요한 함정 두 가지를 여기서 처리한다.
//   ① API 수치는 SERVING_SIZE(대개 100g) 기준이다. 총 내용량(Z10500)으로 환산해야
//      우리 지표(1개 판매 단위 기준)와 맞는다.
//   ② 이름 검색은 엉뚱한 제품을 물어온다('불고기김밥' → '소디프 120줄불고기김밥햄').
//      정규화 이름이 같거나, 포함하면서 길이비가 1.6배 이내일 때만 채택한다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const KEY = process.env.DATA_GO_KR_API_KEY;
if (!KEY) {
  console.error('DATA_GO_KR_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const API = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';
const TODAY = new Date().toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// CU 상품명 접두사 → 카테고리
const PREFIX_CATEGORY = {
  '샐': '샐러드', '도': '도시락', '삼': '삼각김밥/주먹밥', '빅삼': '삼각김밥/주먹밥',
  '김': '삼각김밥/주먹밥', '주': '삼각김밥/주먹밥', '샌': '샌드위치/버거', '햄': '샌드위치/버거',
  '면': '면', '컵': '면', '핫': '닭가슴살/육가공', '닭': '닭가슴살/육가공'
};

// 접두사가 제조사면 브랜드로 쓴다(체인 PB 가 아니다)
const MAKER_PREFIX = new Set([
  '롯데', '오리온', '농심', '삼립', '크라운', '해태', '연세', '하겐', '빙그레', '매일',
  '남양', '동원', 'CJ', '풀무원', '오뚜기', '팔도', '삼양', '대상', '서울', '정식품',
  '프링글스', '켈로그', '다논', '덴마크', '대영', '스위트', '옐로우', 'ICK', '포차24', '405'
]);

function parseName(raw) {
  const m = String(raw).match(/^([^)]{1,4})\)(.*)$/);
  if (!m) return { prefix: null, core: String(raw).trim() };
  return { prefix: m[1].trim(), core: m[2].trim() };
}

function guessCategory(prefix, name) {
  if (prefix && PREFIX_CATEGORY[prefix]) return PREFIX_CATEGORY[prefix];
  const n = name;
  if (/샐러드/.test(n)) return '샐러드';
  if (/도시락|정식|한판/.test(n)) return '도시락';
  if (/삼각|김밥|주먹밥/.test(n)) return '삼각김밥/주먹밥';
  if (/버거|샌드|토스트|랩/.test(n)) return '샌드위치/버거';
  if (/우유|두유|라떼|음료|드링크|요거트|요구르트|쉐이크/.test(n)) return '유제품/음료';
  if (/라면|국수|우동|짜장|비빔면|컵면/.test(n)) return '면';
  if (/닭가슴살|닭안심|핫바|소시지|육포|계란|훈제란/.test(n)) return '닭가슴살/육가공';
  if (/아이스|콘|바닐라|초코바|모나카|빙수/.test(n)) return '디저트';
  if (/과자|칩|스낵|쿠키|비스킷|팝콘|바$/.test(n)) return '과자/바';
  if (/죽|밥$|햇반/.test(n)) return '즉석밥/죽';
  return '기타';
}

/** 원물 품질 Q — 이름에서 명확히 읽히는 것만 매긴다. 아니면 null(= Q_unknown) */
function guessProteinSource(name) {
  if (/닭가슴살|닭안심|훈제란|계란|생선|참치|연어|새우|두부|그릭요거트/.test(name)) return 'Q1';
  if (/대두단백|콩|두유|치즈/.test(name)) return 'Q2';
  if (/크래미|어묵|게맛살|성형/.test(name)) return 'Q3';
  if (/햄|소시지|베이컨|스팸|핫바|너겟|패티/.test(name)) return 'Q4';
  return null;
}

function guessCooking(name) {
  if (/튀김|프라이드|크리스피|돈까스|가라아게|탕수/.test(name)) return 'fried';
  if (/구이|직화|숯불|그릴/.test(name)) return 'grilled';
  if (/훈제|수비드|찜/.test(name)) return 'boiled';
  if (/샐러드|생/.test(name)) return 'raw';
  return 'unknown';
}

async function searchNutrition(query) {
  const url = `${API}?serviceKey=${KEY}&FOOD_NM_KR=${encodeURIComponent(query)}&type=json&numOfRows=5&pageNo=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const body = json.body || json;
  return body.items || [];
}

/** 엉뚱한 제품을 물고 오지 않도록 엄격히 고른다 */
function pickMatch(query, items) {
  const q = norm(query);
  if (!q || q.length < 3) return null;
  let best = null;
  for (const it of items || []) {
    const n = norm(it.FOOD_NM_KR);
    if (!n) continue;
    if (n === q) return { item: it, how: 'exact' };
    if (n.includes(q) && n.length <= q.length * 1.6) {
      if (!best || n.length < norm(best.item.FOOD_NM_KR).length) best = { item: it, how: 'contains' };
    }
  }
  return best;
}

/** 100g 기준 수치를 1개 판매 단위로 환산 */
function toPerPack(item) {
  const base = num(String(item.SERVING_SIZE || '100').replace(/[^\d.]/g, '')) || 100;
  const packRaw = String(item.Z10500 || '').replace(/[^\d.]/g, '');
  const pack = num(packRaw);
  if (!pack || pack <= 0) return null;
  const f = pack / base;
  const conv = v => {
    const x = num(v);
    return x === null ? null : Math.round(x * f * 10) / 10;
  };
  return {
    serving_g: Math.round(pack),
    kcal: conv(item.AMT_NUM1) === null ? null : Math.round(num(item.AMT_NUM1) * f),
    protein_g: conv(item.AMT_NUM3),
    fat_g: conv(item.AMT_NUM4),
    carb_g: conv(item.AMT_NUM6),
    sugar_g: conv(item.AMT_NUM7),
    sodium_mg: conv(item.AMT_NUM13) === null ? null : Math.round(num(item.AMT_NUM13) * f),
    sat_fat_g: conv(item.AMT_NUM14)
  };
}

const CHAIN_CODE = { CU: 'cu', '세븐일레븐': '7eleven', '이마트24': 'emart24' };

function slugify(s) {
  return String(s).toLowerCase().replace(/[^가-힣a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

async function main() {
  const priceFile = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'cvs_prices.json'), 'utf-8'));
  const existing = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'seed.json'), 'utf-8'));
  const existingNames = new Set(existing.map(x => norm(x.name)));

  const results = [];
  const stats = { total: 0, queried: 0, matched: 0, converted: 0, duplicate: 0, noProtein: 0, noPack: 0 };

  for (const row of priceFile.items) {
    stats.total++;
    const { prefix, core } = parseName(row.name);
    const query = core.replace(/^(뉴|NEW)\s*/i, '').trim();
    if (query.length < 3) continue;
    if (existingNames.has(norm(query)) || existingNames.has(norm(row.name))) { stats.duplicate++; continue; }

    stats.queried++;
    let items = null;
    try {
      items = await searchNutrition(query);
    } catch (e) {
      await sleep(400);
      continue;
    }
    await sleep(220);

    const m = pickMatch(query, items);
    if (!m) continue;
    stats.matched++;

    const per = toPerPack(m.item);
    if (!per) { stats.noPack++; continue; }
    if (!per.kcal || !per.protein_g) { stats.noProtein++; continue; }
    stats.converted++;

    const apiName = String(m.item.FOOD_NM_KR).trim();
    const isMakerPrefix = prefix && MAKER_PREFIX.has(prefix);
    const brand = isMakerPrefix ? prefix : row.chain;
    const brandCode = isMakerPrefix ? slugify(prefix) : CHAIN_CODE[row.chain];
    const category = guessCategory(prefix, apiName + ' ' + query);
    const proteinSource = guessProteinSource(apiName + ' ' + query);

    results.push({
      menu_id: `cvs-${brandCode}-${slugify(query)}-${per.serving_g}`,
      channel: 'cvs',
      brand,
      brand_code: brandCode,
      name: apiName,
      display_name_raw: row.name,
      category,
      price_krw: row.price,
      price_krw_status: 'measured',
      serving_g: per.serving_g,
      serving_g_status: 'measured',
      kcal: per.kcal, kcal_status: 'measured',
      protein_g: per.protein_g, protein_g_status: 'measured',
      carb_g: per.carb_g, carb_g_status: per.carb_g === null ? 'unknown' : 'measured',
      sugar_g: per.sugar_g, sugar_g_status: per.sugar_g === null ? 'unknown' : 'measured',
      fat_g: per.fat_g, fat_g_status: per.fat_g === null ? 'unknown' : 'measured',
      sat_fat_g: per.sat_fat_g, sat_fat_g_status: per.sat_fat_g === null ? 'unknown' : 'measured',
      trans_fat_g: null, trans_fat_g_status: 'unknown',
      sodium_mg: per.sodium_mg, sodium_mg_status: per.sodium_mg === null ? 'unknown' : 'measured',
      fiber_g: null, fiber_g_status: 'unknown',
      protein_source: proteinSource,
      cooking: guessCooking(apiName + ' ' + query),
      marketing_claim: /단백질|프로틴|고단백|protein/i.test(apiName + row.name) ? 1 : 0,
      claim_text: null,
      barcode: null,
      ingredients_raw: '',
      image_url: '',
      image_source: null,
      source_type: 'T1',
      source_url: `${API}?FOOD_NM_KR=${encodeURIComponent(query)}`,
      price_source_url: row.source_url,
      price_source_type: 'T3',
      verified_at: TODAY,
      rule_version: 'v1.1',
      match_how: m.how,
      item_report_no: m.item.ITEM_REPORT_NO || null,
      maker_nm: m.item.MAKER_NM || null
    });

    if (stats.queried % 100 === 0) {
      process.stdout.write(`  조회 ${stats.queried} · 매칭 ${stats.matched} · 채택 ${stats.converted}\r`);
    }
  }

  fs.writeFileSync(path.join(rootDir, 'data', 'cvs_new_items.json'), JSON.stringify(results, null, 2), 'utf-8');
  console.log('\n\n집계:', JSON.stringify(stats));
  console.log(`채택 ${results.length}건 → data/cvs_new_items.json`);
  const byChain = results.reduce((m, x) => { m[x.brand] = (m[x.brand] || 0) + 1; return m; }, {});
  console.log('브랜드별:', JSON.stringify(byChain));
}

main().catch(e => { console.error(e); process.exit(1); });
