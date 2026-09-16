// 가격 입력 대기 목록 생성 (build_pending_prices.js)
//
// 공공DB(T1)에 영양은 있는데 가격이 없는 편의점 PB 상품을 모아 둔다.
// 가격은 사람이 앱·매장에서 눈으로 확인해 입력한다(기획서 T5 — 자동 수집이 아니라 수동 열람).
//
// 출력: data/pending_prices.json — price_krw 가 비어 있는 레코드 목록

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

// 편의점 4사 자체 브랜드 라인
const PB = [
  { chain: 'GS25', brand_code: 'gs25', words: ['유어스', '심플리쿡'] },
  { chain: 'CU', brand_code: 'cu', words: ['헤이루', '득템'] },
  { chain: '세븐일레븐', brand_code: '7eleven', words: ['세븐셀렉트'] },
  { chain: '이마트24', brand_code: 'emart24', words: ['아임이'] }
];

const MAX_SERVING_G = 700;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

async function fetchAll(query) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${API}?serviceKey=${KEY}&FOOD_NM_KR=${encodeURIComponent(query)}&type=json&numOfRows=100&pageNo=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const json = await res.json();
    const body = json.body || json;
    const items = body.items || [];
    out.push(...items);
    if (out.length >= Number(body.totalCount || 0) || items.length === 0) break;
    await sleep(300);
  }
  return out;
}

/** 100g 기준 → 1개 판매 단위. 검증된 필드만 쓴다(NUM1·3·4·6·7·13) */
function toPerPack(item) {
  const base = num(String(item.SERVING_SIZE || '100').replace(/[^\d.]/g, '')) || 100;
  const pack = num(String(item.Z10500 || '').replace(/[^\d.]/g, ''));
  if (!pack || pack <= 0) return null;
  const f = pack / base;
  const c1 = v => { const x = num(v); return x === null ? null : Math.round(x * f * 10) / 10; };
  const c0 = v => { const x = num(v); return x === null ? null : Math.round(x * f); };
  return {
    serving_g: Math.round(pack),
    kcal: c0(item.AMT_NUM1),
    protein_g: c1(item.AMT_NUM3),
    fat_g: c1(item.AMT_NUM4),
    carb_g: c1(item.AMT_NUM6),
    sugar_g: c1(item.AMT_NUM7),
    sodium_mg: c0(item.AMT_NUM13)
  };
}

function guessCategory(n) {
  if (/샐러드/.test(n)) return '샐러드';
  if (/도시락|정식|한판/.test(n)) return '도시락';
  if (/삼각|김밥|주먹밥/.test(n)) return '삼각김밥/주먹밥';
  if (/버거|샌드|토스트|랩/.test(n)) return '샌드위치/버거';
  if (/우유|두유|라떼|음료|드링크|요거트|요구르트|쉐이크|커피|아메리카노/.test(n)) return '유제품/음료';
  if (/라면|국수|우동|짜장|비빔면|컵면|면$/.test(n)) return '면';
  if (/닭가슴살|닭안심|핫바|소시지|육포|계란|훈제란|어묵|크래미/.test(n)) return '닭가슴살/육가공';
  if (/아이스|콘$|모나카|빙수|젤리|푸딩/.test(n)) return '디저트';
  if (/칩|스낵|쿠키|비스킷|팝콘|그래놀라|바$|볼$/.test(n)) return '과자/바';
  if (/죽|햇반|밥$/.test(n)) return '즉석밥/죽';
  return '기타';
}

function guessProteinSource(n) {
  if (/닭가슴살|닭안심|훈제란|계란|생선|참치|연어|새우|두부|그릭요거트|유청/.test(n)) return 'Q1';
  if (/대두단백|콩|두유|치즈/.test(n)) return 'Q2';
  if (/크래미|어묵|게맛살/.test(n)) return 'Q3';
  if (/햄|소시지|베이컨|스팸|핫바|너겟|패티/.test(n)) return 'Q4';
  return null;
}

function guessCooking(n) {
  if (/튀김|프라이드|크리스피|돈까스|가라아게|탕수/.test(n)) return 'fried';
  if (/구이|직화|숯불|그릴/.test(n)) return 'grilled';
  if (/훈제|수비드|찜/.test(n)) return 'boiled';
  if (/샐러드/.test(n)) return 'raw';
  return 'unknown';
}

const slug = s => String(s).toLowerCase().replace(/[^가-힣a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function main() {
  const seed = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'seed.json'), 'utf-8'));
  const have = new Set(seed.map(x => norm(x.name)));

  const pendingPath = path.join(rootDir, 'data', 'pending_prices.json');
  const prevPrices = {};
  if (fs.existsSync(pendingPath)) {
    for (const r of JSON.parse(fs.readFileSync(pendingPath, 'utf-8'))) {
      if (r.price_krw) prevPrices[r.menu_id] = r.price_krw;   // 이미 입력한 가격은 보존
    }
  }

  const out = [];
  const seenId = new Set();

  for (const { chain, brand_code, words } of PB) {
    const bag = new Map();
    for (const w of words) {
      for (const it of await fetchAll(w)) {
        if (it.FOOD_NM_KR) bag.set(it.FOOD_NM_KR, it);
      }
    }

    let kept = 0;
    for (const it of bag.values()) {
      const name = String(it.FOOD_NM_KR).trim();
      if (have.has(norm(name))) continue;

      const per = toPerPack(it);
      if (!per || !per.kcal || !per.protein_g) continue;
      if (per.serving_g > MAX_SERVING_G) continue;

      const menuId = `cvs-${brand_code}-${slug(name)}-${per.serving_g}`;
      if (seenId.has(menuId)) continue;
      seenId.add(menuId);

      out.push({
        menu_id: menuId,
        chain,
        brand: chain,
        brand_code,
        name,
        category: guessCategory(name),
        price_krw: prevPrices[menuId] || null,       // ← 사람이 채울 자리
        price_krw_status: prevPrices[menuId] ? 'measured' : 'unknown',
        serving_g: per.serving_g,
        kcal: per.kcal,
        protein_g: per.protein_g,
        carb_g: per.carb_g,
        fat_g: per.fat_g,
        sugar_g: per.sugar_g,
        sodium_mg: per.sodium_mg,
        protein_source: guessProteinSource(name),
        cooking: guessCooking(name),
        marketing_claim: /단백질|프로틴|고단백|protein/i.test(name) ? 1 : 0,
        maker_nm: it.MAKER_NM || null,
        item_report_no: it.ITEM_REPORT_NO || null,
        source_url: `${API}?FOOD_NM_KR=${encodeURIComponent(name)}`
      });
      kept++;
    }
    console.log(`${chain}: 공공DB ${bag.size}건 → 가격 대기 ${kept}건`);
  }

  // 단백질 많은 것부터 — 입력 시간이 한정적이면 가치 높은 것부터 채운다
  out.sort((a, b) => b.protein_g - a.protein_g);
  fs.writeFileSync(pendingPath, JSON.stringify(out, null, 2), 'utf-8');

  const done = out.filter(x => x.price_krw).length;
  console.log(`\n대기 목록 ${out.length}건 (가격 입력됨 ${done}) → data/pending_prices.json`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
