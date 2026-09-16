// 신선도 스윕 (stale_sweep.js)
// 기획안 v2.0 §4.6 — verified_at 이 오래된 건을 판정해 배지·랭킹 제외 대상을 집계한다.
// 데이터를 지우지 않는다. 상태만 계산해 리포트하고, 랭킹 제외는 화면이 staleness 룰로 처리한다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const rules = JSON.parse(fs.readFileSync(path.join(rootDir, 'rules', 'rule_v1.1.json'), 'utf-8'));
const { stale_days: STALE, rank_exclude_days: EXCLUDE } = rules.staleness;

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function main() {
  const items = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));
  const buckets = { fresh: [], stale: [], excluded: [], unknown: [] };

  for (const it of items) {
    const d = daysSince(it.verified_at);
    if (d === null) buckets.unknown.push(it);
    else if (d >= EXCLUDE) buckets.excluded.push(it);
    else if (d >= STALE) buckets.stale.push(it);
    else buckets.fresh.push(it);
  }

  const total = items.length;
  const pct = n => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  console.log(`신선도 스윕 (기준: ${STALE}일 경과 → stale, ${EXCLUDE}일 경과 → 랭킹 제외)`);
  console.log(`  최신 ${buckets.fresh.length} (${pct(buckets.fresh.length)}%)`);
  console.log(`  오래됨 ${buckets.stale.length} (${pct(buckets.stale.length)}%)`);
  console.log(`  랭킹 제외 ${buckets.excluded.length} (${pct(buckets.excluded.length)}%)`);
  console.log(`  확인일 없음 ${buckets.unknown.length}`);

  // 재확인 큐 — 오래된 것부터, 랭킹 상위에 노출되는 것부터
  const queue = [...buckets.excluded, ...buckets.stale]
    .sort((a, b) => (a.verified_at || '').localeCompare(b.verified_at || '') || (b.ppr || 0) - (a.ppr || 0))
    .slice(0, 200)
    .map(it => ({
      menu_id: it.menu_id,
      brand: it.brand,
      name: it.name,
      verified_at: it.verified_at,
      days: daysSince(it.verified_at),
      source_type: it.source_type,
      source_url: it.source_url
    }));

  fs.writeFileSync(path.join(rootDir, 'data', 'recheck_queue.json'), JSON.stringify(queue, null, 2), 'utf-8');
  console.log(`  재확인 큐 ${queue.length}건 → data/recheck_queue.json`);

  const ratio = total ? buckets.stale.length / total : 0;
  if (ratio > 0.1) {
    console.warn(`⚠️  stale 비율 ${(ratio * 100).toFixed(1)}% — 기획서 KPI 목표(10% 미만)를 넘었습니다.`);
  }
}

main();
