// 편의점 4사 커버리지 갭 조사 (survey_cvs_gap.js)
// 식약처 공공DB(T1)에 있는 편의점 PB 상품 중 우리 DB에 없는 것이 얼마인지 센다.
// 수집이 아니라 '얼마나 비어 있는지'를 재는 스크립트다 — 결과는 scratch 로만 쓴다.

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

const BASE = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

// 편의점 4사 자체 브랜드(PB) 라인 — 공공DB에 제품명으로 들어간다
const PB_KEYWORDS = [
  { chain: 'GS25', words: ['유어스', '심플리쿡'] },
  { chain: 'CU', words: ['헤이루', '득템'] },
  { chain: '세븐일레븐', words: ['세븐셀렉트', '세븐카페'] },
  { chain: '이마트24', words: ['아임이', '민생'] }
];

const norm = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

async function fetchAll(query) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${BASE}?serviceKey=${KEY}&FOOD_NM_KR=${encodeURIComponent(query)}&type=json&numOfRows=100&pageNo=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const json = await res.json();
    const body = json.body || json;
    const items = body.items || [];
    out.push(...items);
    const total = Number(body.totalCount || 0);
    if (out.length >= total || items.length === 0) break;
    await new Promise(r => setTimeout(r, 300));
  }
  return out;
}

async function main() {
  const ours = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));
  const ourNames = new Set(ours.map(x => norm(x.name)));

  const report = { generated_at: new Date().toISOString(), chains: {}, new_items: [] };

  for (const { chain, words } of PB_KEYWORDS) {
    const seen = new Map();
    for (const w of words) {
      const items = await fetchAll(w);
      for (const it of items) {
        const name = it.FOOD_NM_KR || '';
        if (!name) continue;
        seen.set(name, it);
      }
    }
    const all = [...seen.values()];
    const missing = all.filter(it => {
      const n = norm(it.FOOD_NM_KR);
      if (ourNames.has(n)) return false;
      // 부분 포함도 중복으로 본다(표기 차이)
      for (const o of ourNames) {
        if (o.length > 6 && (o.includes(n) || n.includes(o))) return false;
      }
      return true;
    });

    const withProtein = missing.filter(it => Number(it.AMT_NUM3 || 0) > 0);
    report.chains[chain] = {
      public_db_total: all.length,
      already_in_db: all.length - missing.length,
      missing: missing.length,
      missing_with_protein_value: withProtein.length
    };
    for (const it of withProtein) {
      report.new_items.push({
        chain,
        name: it.FOOD_NM_KR,
        maker: it.MAKER_NM || it.CMPNY_NM || null,
        serving: it.SERVING_SIZE || it.Z10500 || null,
        kcal: it.AMT_NUM1,
        protein_g: it.AMT_NUM3,
        carb_g: it.AMT_NUM6,
        fat_g: it.AMT_NUM4,
        sugar_g: it.AMT_NUM7,
        sodium_mg: it.AMT_NUM13,
        sat_fat_g: it.AMT_NUM14,
        food_code: it.FOOD_CD || null,
        data_date: it.CRTR_YMD || null
      });
    }
    console.log(`${chain}: 공공DB ${all.length}건 · 이미 보유 ${all.length - missing.length} · 없음 ${missing.length}(단백질 수치 있는 것 ${withProtein.length})`);
  }

  const outPath = path.join(rootDir, 'scratch', 'cvs_gap_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n신규 후보 ${report.new_items.length}건 → scratch/cvs_gap_report.json`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
