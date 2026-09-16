// 보도자료 가격을 가격 대기 목록에 채운다 (apply_press_prices.js)
//
// collect_press.js 가 뽑은 '제품명 + 가격'을 pending_prices.json 의 상품과 이름으로 잇는다.
// 사람이 직접 입력하지 않아도 되는 건은 여기서 자동으로 채워진다.
//
// 오매칭 방지: 정규화 이름이 같거나, 한쪽이 다른 쪽을 포함하면서 길이비 1.5배 이내일 때만.
// 이미 사람이 입력한 가격(T5-manual)은 덮어쓰지 않는다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const norm = s => String(s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

function main() {
  const pendingPath = path.join(rootDir, 'data', 'pending_prices.json');
  const pressPath = path.join(rootDir, 'data', 'press_prices.json');

  if (!fs.existsSync(pressPath)) {
    console.log('보도자료 가격 파일이 없습니다. 먼저 node scripts/collect_press.js 를 실행하세요.');
    return;
  }

  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
  const press = JSON.parse(fs.readFileSync(pressPath, 'utf-8'));

  // 신뢰도 높은 것부터(따옴표 표기 > 사전 일치 > 접두어)
  const rank = c => (c === 'quoted' ? 3 : c === 'dictionary' ? 2 : 1);
  const sorted = press.slice().sort((a, b) => rank(b.confidence) - rank(a.confidence));

  let filled = 0;
  const log = [];

  for (const it of pending) {
    if (it.price_krw) continue;                       // 이미 값이 있으면 건드리지 않는다
    const target = norm(it.name);
    if (target.length < 4) continue;

    const hit = sorted.find(p => {
      const n = norm(p.name);
      if (!n || n.length < 4) return false;
      if (n === target) return true;
      const [long, short] = n.length >= target.length ? [n, target] : [target, n];
      return long.includes(short) && long.length <= short.length * 1.5;
    });
    if (!hit) continue;

    it.price_krw = hit.price_krw;
    it.price_krw_status = 'measured';
    it.price_checked_at = (hit.published_at || hit.detected_at || '').slice(0, 10) || null;
    it.price_source_type = 'T3';
    it.price_source_note = `브랜드 보도자료에 표기된 가격 (${hit.confidence})`;
    it.price_source_url = hit.source_url;
    filled++;
    log.push(`${it.name} ← ${hit.name} · ${hit.price_krw.toLocaleString()}원 (${hit.confidence})`);
  }

  if (filled === 0) {
    console.log(`매칭된 가격이 없습니다. (보도자료 ${press.length}건 · 대기 ${pending.length}건)`);
    return;
  }

  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2), 'utf-8');
  console.log(`보도자료로 채운 가격 ${filled}건`);
  for (const l of log.slice(0, 15)) console.log('   ' + l);
  const priced = pending.filter(x => x.price_krw).length;
  console.log(`\n대기 ${pending.length}건 중 가격 확보 ${priced}건`);
}

main();
