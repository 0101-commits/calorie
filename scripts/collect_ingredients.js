// 원재료 재수집 (collect_ingredients.js)
//
// data/recheck_queue.json 에 쌓인 건의 원재료를 식품안전나라 C005(바코드 제품정보)에서 받아 온다.
// 받은 값만 seed.json 에 넣는다 — 못 받으면 비운 채로 둔다(추정하지 않는다).
//
// 실측 제약 두 가지:
//   ① C005 는 "09시~19시에는 서비스가 제한됩니다"(ERROR-503). 야간(KST 19시~09시)에만 응답한다.
//   ② 우리 데이터의 바코드 보유율은 약 58%다. 바코드가 없으면 이 경로로는 못 받는다.
//
//   node scripts/collect_ingredients.js            큐 전체 (기본 최대 200건)
//   node scripts/collect_ingredients.js --limit=20 건수 제한
//   node scripts/collect_ingredients.js --probe    1건만 호출해 서비스 창이 열렸는지 확인

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const API_KEY = process.env.FOOD_SAFETY_KOREA_API_KEY || readEnvKey('FOOD_SAFETY_KOREA_API_KEY');
const SERVICE = 'C005';
const REQUEST_GAP_MS = 350;

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const limit = Number(arg('limit')) || 200;
const probeOnly = process.argv.includes('--probe');

function readEnvKey(name) {
  const p = path.join(rootDir, '.env');
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** C005 한 건 조회. 반환: { ok, ingredients, code, message } */
async function fetchByBarcode(barcode) {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE}/json/1/5/BAR_CD=${encodeURIComponent(barcode)}`;
  const res = await fetch(url);
  const body = await res.json();
  const root = body[SERVICE] || {};
  const code = (root.RESULT && root.RESULT.CODE) || 'UNKNOWN';
  const message = (root.RESULT && root.RESULT.MSG) || '';

  if (!root.row || !root.row.length) return { ok: false, code, message };

  // 원재료 필드명은 서비스 버전에 따라 다르다 — 있는 것만 쓴다.
  const row = root.row[0];
  const raw = row.RAWMTRL_NM || row.RAWMTRL || row.MTRL_NM || '';
  if (!String(raw).trim()) return { ok: false, code: 'NO_INGREDIENTS', message: '응답에 원재료 항목이 없음' };
  return { ok: true, ingredients: String(raw).trim(), code, message };
}

async function main() {
  if (!API_KEY) {
    console.error('❌ FOOD_SAFETY_KOREA_API_KEY 가 없습니다(.env 또는 환경변수).');
    process.exit(1);
  }

  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const queuePath = path.join(rootDir, 'data', 'recheck_queue.json');
  const items = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const queue = fs.existsSync(queuePath) ? JSON.parse(fs.readFileSync(queuePath, 'utf-8')) : [];

  const byId = new Map(items.map(it => [it.menu_id, it]));
  const targets = queue
    .filter(q => q.field === 'ingredients_raw')
    .map(q => byId.get(q.menu_id))
    .filter(it => it && it.barcode && !String(it.ingredients_raw || '').trim())
    .slice(0, probeOnly ? 1 : limit);

  console.log(`\n📥 원재료 재수집 — 큐 ${queue.length}건 중 바코드 보유·미확보 ${targets.length}건 시도`);

  if (targets.length === 0) {
    console.log('대상이 없습니다.\n');
    return;
  }

  let filled = 0;
  const failures = {};

  for (const it of targets) {
    let result;
    try {
      result = await fetchByBarcode(it.barcode);
    } catch (e) {
      result = { ok: false, code: 'FETCH_ERROR', message: e.message };
    }

    if (result.ok) {
      it.ingredients_raw = result.ingredients;
      filled++;
      console.log(`  ✅ ${it.brand} ${it.name} — ${result.ingredients.slice(0, 50)}…`);
    } else {
      failures[result.code] = (failures[result.code] || 0) + 1;
      if (result.code === 'ERROR-503') {
        console.log(`\n⏳ 서비스 창이 닫혀 있습니다: ${result.message}`);
        console.log('   C005 는 야간(KST 19시~09시)에만 응답합니다. 그 시간대 크론에서 돌리세요.\n');
        break;
      }
    }
    await sleep(REQUEST_GAP_MS);
  }

  if (filled > 0) {
    fs.writeFileSync(seedPath, JSON.stringify(items, null, 2), 'utf-8');

    const filledIds = new Set(targets.filter(t => String(t.ingredients_raw || '').trim()).map(t => t.menu_id));
    const rest = queue.filter(q => !(q.field === 'ingredients_raw' && filledIds.has(q.menu_id)));
    fs.writeFileSync(queuePath, JSON.stringify(rest, null, 2), 'utf-8');

    console.log(`\n✅ ${filled}건 채움 · 큐 ${queue.length} → ${rest.length}건`);
    console.log('   npm run pipeline 으로 다시 빌드하면 화면에 반영됩니다.');
  } else {
    console.log('\n채운 건이 없습니다.');
  }

  const failSummary = Object.entries(failures).map(([k, v]) => `${k} ${v}건`).join(' · ');
  if (failSummary) console.log(`실패 사유: ${failSummary}`);
  console.log('');
}

main();
