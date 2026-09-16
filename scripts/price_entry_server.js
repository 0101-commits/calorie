// 가격 입력 로컬 서버 (price_entry_server.js)
//
// 사람이 앱·매장에서 눈으로 확인한 정가를 입력받아 data/pending_prices.json 에 기록한다.
// 자동 수집이 아니다 — 기획서 T5 가 허용하는 '운영자 수동 열람' 경로의 입력 도구다.
//
//   node scripts/price_entry_server.js   →  http://localhost:8123
//
// 로컬 전용이다. 외부에 노출하지 않는다(127.0.0.1 바인딩).

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const PENDING = path.join(rootDir, 'data', 'pending_prices.json');
const PAGE = path.join(rootDir, 'tools', 'price_entry.html');
const PORT = Number(process.env.PORT || 8123);

function readPending() {
  if (!fs.existsSync(PENDING)) return [];
  return JSON.parse(fs.readFileSync(PENDING, 'utf-8'));
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, fs.readFileSync(PAGE, 'utf-8'), 'text/html; charset=utf-8');
  }

  if (req.method === 'GET' && url.pathname === '/api/pending') {
    return send(res, 200, JSON.stringify(readPending()));
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try {
        const incoming = JSON.parse(raw);
        const byId = new Map(incoming.map(x => [x.menu_id, x]));
        const merged = readPending().map(it => {
          const got = byId.get(it.menu_id);
          if (!got) return it;
          const price = Number(got.price_krw);
          const ok = Number.isFinite(price) && price >= 300 && price <= 30000;
          return {
            ...it,
            price_krw: ok ? price : null,
            price_krw_status: ok ? 'measured' : 'unknown',
            price_checked_at: ok ? new Date().toISOString().slice(0, 10) : null,
            price_source_type: ok ? 'T5-manual' : null,
            price_source_note: ok ? '운영자가 앱·매장에서 직접 확인한 정가(수동 입력)' : null
          };
        });
        fs.writeFileSync(PENDING, JSON.stringify(merged, null, 2), 'utf-8');
        const priced = merged.filter(x => x.price_krw).length;
        console.log(`저장 · 가격 입력 ${priced} / ${merged.length}건`);
        send(res, 200, JSON.stringify({ ok: true, priced, total: merged.length }));
      } catch (e) {
        send(res, 400, JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  send(res, 404, JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  const pending = readPending();
  const priced = pending.filter(x => x.price_krw).length;
  console.log(`가격 입력 화면: http://localhost:${PORT}`);
  console.log(`대기 ${pending.length}건 · 입력 완료 ${priced}건`);
  console.log('입력 후 [저장] → node scripts/merge_pending_prices.js 로 반영합니다. (Ctrl+C 로 종료)');
});
