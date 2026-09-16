// 프로틴레이더 Cloudflare Worker API (worker/worker.js)
// 기획안 v2.0 P2 — 3가지를 고친다.
//   ① D1 이 없으면 성공(success:true)이 아니라 503 을 반환한다. 저장하지 않았는데
//      성공이라고 답하면 사용자는 제보가 접수된 줄 안다(가장 나쁜 실패 방식이다).
//   ② CORS 를 Pages 도메인으로 제한한다(전역 개방 금지).
//   ③ IP 는 저장 전에 해시한다. 컬럼명이 ip_hash 인데 평문이 들어가고 있었다.

const ALLOWED_ORIGINS = [
  'https://0101-commits.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

function corsHeadersFor(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

/** IP 를 그대로 저장하지 않는다 — 같은 제보자 판별에 필요한 만큼만 해시로 남긴다. */
async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt || 'protein-radar'}:${ip || 'anonymous'}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).slice(0, 12)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = corsHeadersFor(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const hasDb = Boolean(env && env.DB);

    try {
      // 1. 바코드 조회
      if (path === '/api/barcode') {
        const barcode = url.searchParams.get('code');
        if (!barcode) return json({ error: '바코드 번호가 누락되었습니다.' }, 400, cors);
        if (!hasDb) {
          return json({ error: 'db_unavailable', message: '조회 서버가 아직 연결되지 않았습니다.' }, 503, cors);
        }

        const row = await env.DB.prepare('SELECT * FROM menus WHERE barcode = ?').bind(barcode).first();
        ctx.waitUntil(
          env.DB.prepare('INSERT INTO scan_logs (barcode, matched, created_at) VALUES (?, ?, ?)')
            .bind(barcode, row ? 1 : 0, new Date().toISOString()).run()
        );
        if (row) return json({ matched: true, item: row }, 200, cors);
        return json({ matched: false, message: '미등록 바코드입니다. 제보해 주시면 확인 후 등록합니다.' }, 404, cors);
      }

      // 2. 오류 정정·이의제기 접수
      if (path === '/api/report' && request.method === 'POST') {
        const body = await request.json();
        const { menu_id, barcode, reason, detail } = body || {};
        if (!reason) return json({ error: 'reason 은 필수입니다.' }, 400, cors);
        if (!menu_id && !barcode) {
          return json({ error: 'menu_id 또는 barcode 중 하나는 필요합니다.' }, 400, cors);
        }
        if (!hasDb) {
          // 저장하지 못했으면 실패로 답한다.
          return json({ error: 'db_unavailable', message: '접수 창구가 아직 연결되지 않았습니다.' }, 503, cors);
        }

        await env.DB.prepare(
          'INSERT INTO reports (menu_id, reason, detail, status, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(menu_id || barcode, reason, detail || '', '접수', new Date().toISOString()).run();

        return json({ success: true, message: '접수됐습니다. 공식 영양표를 재확인해 반영합니다.' }, 200, cors);
      }

      // 3. 사진 제보 접수
      if (path === '/api/submit' && request.method === 'POST') {
        const body = await request.json();
        const { image_hash, nickname, parsed_json } = body || {};
        if (!hasDb) {
          return json({ error: 'db_unavailable', message: '제보 창구가 아직 연결되지 않았습니다.' }, 503, cors);
        }

        const ipHash = await hashIp(request.headers.get('CF-Connecting-IP'), env.IP_SALT);
        await env.DB.prepare(
          'INSERT INTO submissions (image_hash, nickname, ip_hash, parsed_json, status) VALUES (?, ?, ?, ?, ?)'
        ).bind(image_hash || null, nickname || '익명', ipHash, JSON.stringify(parsed_json || {}), '대기').run();

        return json({ success: true, message: '제보가 접수되었습니다.' }, 200, cors);
      }

      // 3-b. 사진 식별 — 패키지·메뉴판 사진에서 브랜드·제품명 후보를 뽑는다.
      //      프랜차이즈는 바코드가 없어 이 경로가 유일한 식별 수단이다(기획서 §2.7 ③).
      //      사진은 식별 후 즉시 버린다. 저장하지 않는다.
      if (path === '/api/identify' && request.method === 'POST') {
        if (!env || !env.ANTHROPIC_API_KEY) {
          return json({ error: 'vision_unavailable', message: '사진 식별이 아직 연결되지 않았습니다.' }, 503, cors);
        }
        const body = await request.json();
        const { image_base64, media_type } = body || {};
        if (!image_base64) return json({ error: 'image_base64 는 필수입니다.' }, 400, cors);

        const prompt = [
          '이 사진은 한국 편의점 또는 외식 프랜차이즈 제품의 패키지·메뉴판이다.',
          '보이는 그대로만 읽어라. 추측하지 마라.',
          'JSON 하나만 출력한다: {"brand": string|null, "name": string|null, "size": string|null, "confidence": number}',
          'confidence 는 0~1. 글자가 흐리거나 일부만 보이면 0.6 미만으로 낮춰라.'
        ].join('\n');

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 } },
                { type: 'text', text: prompt }
              ]
            }]
          })
        });

        if (!res.ok) {
          return json({ error: 'vision_failed', message: `식별 실패 (HTTP ${res.status})` }, 502, cors);
        }
        const data = await res.json();
        const text = (data.content || []).map(c => c.text || '').join('');
        let parsed = null;
        try {
          parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        } catch (e) {
          return json({ error: 'vision_parse_failed', raw: text.slice(0, 200) }, 502, cors);
        }
        return json({ success: true, result: parsed }, 200, cors);
      }

      // 4. 헬스체크 — D1 연결 여부를 그대로 보고한다.
      if (path === '/api/health') {
        return json({ status: 'ok', service: 'protein-radar-worker', version: 'v2.0', db: hasDb }, 200, cors);
      }

      return json({ error: 'Not Found' }, 404, cors);
    } catch (err) {
      return json({ error: 'internal_error', message: err.message }, 500, cors);
    }
  }
};
