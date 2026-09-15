// 프로틴레이더 Cloudflare Worker API (worker/worker.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 헤더 설정
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json; charset=utf-8'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. 바코드 조회 API
      if (path === '/api/barcode') {
        const barcode = url.searchParams.get('code');
        if (!barcode) {
          return new Response(JSON.stringify({ error: '바코드 번호가 누락되었습니다.' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        // D1 바인딩이 있는 경우 DB 조회
        if (env && env.DB) {
          const row = await env.DB.prepare('SELECT * FROM menus WHERE barcode = ?').bind(barcode).first();
          if (row) {
            // scan_log 성공 기록
            ctx.waitUntil(
              env.DB.prepare('INSERT INTO scan_logs (barcode, matched, created_at) VALUES (?, 1, ?)')
                .bind(barcode, new Date().toISOString()).run()
            );
            return new Response(JSON.stringify({ matched: true, item: row }), { headers: corsHeaders });
          } else {
            // scan_log 실패 기록 (신상 후보 큐 집계용)
            ctx.waitUntil(
              env.DB.prepare('INSERT INTO scan_logs (barcode, matched, created_at) VALUES (?, 0, ?)')
                .bind(barcode, new Date().toISOString()).run()
            );
            return new Response(JSON.stringify({ matched: false, message: '미등록 바코드입니다. 제보가 가능합니다.' }), {
              status: 404,
              headers: corsHeaders
            });
          }
        }

        // Mock fallback
        return new Response(JSON.stringify({ matched: false, barcode }), { headers: corsHeaders });
      }

      // 2. 오류 정정 및 이의제기 접수 API
      if (path === '/api/report' && request.method === 'POST') {
        const body = await request.json();
        const { menu_id, reason, detail } = body;

        if (!menu_id || !reason) {
          return new Response(JSON.stringify({ error: 'menu_id와 reason은 필수입니다.' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        if (env && env.DB) {
          await env.DB.prepare(
            'INSERT INTO reports (menu_id, reason, detail, status, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(menu_id, reason, detail || '', '접수', new Date().toISOString()).run();
        }

        return new Response(JSON.stringify({ success: true, message: '72시간 내 재확인 SLA 접수 완료' }), {
          headers: corsHeaders
        });
      }

      // 3. 사진 제보 접수 API (2단계)
      if (path === '/api/submit' && request.method === 'POST') {
        const body = await request.json();
        const { image_hash, nickname, parsed_json } = body;

        if (env && env.DB) {
          const clientIp = request.headers.get('CF-Connecting-IP') || 'anonymous';
          await env.DB.prepare(
            'INSERT INTO submissions (image_hash, nickname, ip_hash, parsed_json, status) VALUES (?, ?, ?, ?, ?)'
          ).bind(image_hash || 'hash', nickname || '익명', clientIp, JSON.stringify(parsed_json || {}), '대기').run();
        }

        return new Response(JSON.stringify({ success: true, message: '제보가 접수되었습니다.' }), {
          headers: corsHeaders
        });
      }

      // 4. 상태 헬스체크
      if (path === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'protein-radar-worker', version: 'v1.1' }), {
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
