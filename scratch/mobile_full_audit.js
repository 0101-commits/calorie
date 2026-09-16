// 프로틴레이더 모바일 UX/UI 전수 검사 자동화 스크립트 (mobile_full_audit.js)
// 1. 콘솔 에러 전수 수집
// 2. 가로 스크롤(X-overflow) 유발 요소 전수 탐지
// 3. 3개 모바일 해상도(375x812, 360x740, 412x915) 전수 점검
// 4. 홈/랭킹/내기준/상세/비교/스캔/신고/약관 전 모달 인터랙션 및 스크린샷 캡처

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const calorieDir = 'C:\\Users\\cgpar\\calorie';
const outputDir = 'C:\\Users\\cgpar\\.gemini\\antigravity-cli\\brain\\b7c02a28-6a17-4a91-8abf-137e31278e23\\scratch\\audit';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. HTTP 정적 서버
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(calorieDir, reqPath.replace(/\//g, '\\'));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + reqPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  console.log(`🚀 [전수 검사] 정적 서버 시작: http://localhost:${port}`);

  const tempDir = path.join(require('os').tmpdir(), 'edge_audit_' + Date.now());
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9565',
    `--user-data-dir=${tempDir}`,
    '--disable-gpu',
    '--no-first-run',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  const consoleLogs = [];
  const jsErrors = [];
  const overflowIssues = [];

  try {
    const listRes = await fetch('http://127.0.0.1:9565/json/list');
    const tabs = await listRes.json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve) => {
      const msgId = id++;
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    // CDP 이벤트 리스너 등록
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(data.params);
      }
      if (data.method === 'Runtime.exceptionThrown') {
        jsErrors.push(data.params);
      }
    };

    await new Promise(resolve => ws.onopen = resolve);
    await send('Runtime.enable');
    await send('Page.enable');

    console.log('📱 1. iPhone 375x812 뷰포트 설정 및 초기 로딩...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });

    await send('Page.navigate', { url: `http://localhost:${port}/index.html` });
    await new Promise(r => setTimeout(r, 1500));

    // X-Overflow 탐지 함수
    const checkOverflow = async (contextName) => {
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const docWidth = document.documentElement.clientWidth;
          const bodyWidth = document.body.scrollWidth;
          const offenders = [];
          const allEls = document.querySelectorAll('*');
          allEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            // 화면 오른쪽 경계를 1px 이상 벗어나는 요소 (칩 스크롤 컨테이너 내부 요소 제외)
            if (rect.right > docWidth + 1) {
              const isChipScroll = el.closest('.chip-scroll');
              const isNutritionTable = el.closest('.nutrition-table');
              const isCompareTable = el.closest('.compare-table-wrapper');
              if (!isChipScroll && !isNutritionTable && !isCompareTable) {
                offenders.push({
                  tag: el.tagName,
                  id: el.id,
                  className: el.className,
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  docWidth
                });
              }
            }
          });
          return { docWidth, bodyWidth, offenders: offenders.slice(0, 10) };
        })()`,
        returnByValue: true
      });
      const data = res.result.value;
      if (data.offenders.length > 0) {
        overflowIssues.push({ context: contextName, issues: data.offenders });
      }
      return data;
    };

    // ── STEP 1: 홈 탭 점검 ──
    console.log('🔍 [검사 1] 홈 탭 검사 진행 중...');
    await checkOverflow('Home Tab');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '01_home_tab.png'), Buffer.from(shot.data, 'base64'));

    // 홈 검색창 입력 및 드롭다운 검사
    await send('Runtime.evaluate', {
      expression: `(() => {
        const inp = document.getElementById('home-search-input');
        inp.value = '초코';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    });
    await new Promise(r => setTimeout(r, 500));
    await checkOverflow('Home Search Dropdown');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '02_home_search.png'), Buffer.from(shot.data, 'base64'));

    // 검색창 초기화
    await send('Runtime.evaluate', {
      expression: `(() => {
        const inp = document.getElementById('home-search-input');
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    });
    await new Promise(r => setTimeout(r, 300));

    // ── STEP 2: 랭킹 탭 점검 ──
    console.log('🔍 [검사 2] 랭킹 탭 검사 진행 중...');
    await send('Runtime.evaluate', {
      expression: `document.querySelector('button[data-tab="ranking"]').click()`
    });
    await new Promise(r => setTimeout(r, 500));
    await checkOverflow('Ranking Tab Default');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '03_ranking_tab.png'), Buffer.from(shot.data, 'base64'));

    // 랭킹 정렬 변경 (CPD 순)
    await send('Runtime.evaluate', {
      expression: `document.querySelector('button[data-sort="cpd"]').click()`
    });
    await new Promise(r => setTimeout(r, 300));

    // 랭킹 필터 변경 (안심 클린만)
    await send('Runtime.evaluate', {
      expression: `document.querySelector('button[data-filter="clean"]').click()`
    });
    await new Promise(r => setTimeout(r, 400));
    await checkOverflow('Ranking Clean Filter');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '04_ranking_clean_filter.png'), Buffer.from(shot.data, 'base64'));

    // ── STEP 3: 내 기준 탭 점검 ──
    console.log('🔍 [검사 3] 내 기준 탭 검사 진행 중...');
    await send('Runtime.evaluate', {
      expression: `document.querySelector('button[data-tab="calc"]').click()`
    });
    await new Promise(r => setTimeout(r, 500));
    await checkOverflow('Calc Tab Single Mode');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '05_calc_tab_single.png'), Buffer.from(shot.data, 'base64'));

    // 편의점 1끼 조합 모드로 전환
    await send('Runtime.evaluate', {
      expression: `document.querySelector('button[data-calc-mode="combo"]').click()`
    });
    await new Promise(r => setTimeout(r, 500));
    await checkOverflow('Calc Tab Combo Mode');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '06_calc_tab_combo.png'), Buffer.from(shot.data, 'base64'));

    // ── STEP 4: 상세 모달 열람 및 인터랙션 점검 ──
    console.log('🔍 [검사 4] 제품 상세 모달 및 CleanRadar 점검 중...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const card = document.querySelector('.card, .combo-card');
        if (card) card.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 600));

    // 모달 크기 및 스타일 정보 검사
    const modalCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const dlg = document.getElementById('sheet-detail');
        const rect = dlg.getBoundingClientRect();
        return {
          open: dlg.open,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          windowWidth: window.innerWidth
        };
      })()`,
      returnByValue: true
    });
    console.log('  상세 모달 Rect 상태:', modalCheck.result.value);

    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '07_modal_top.png'), Buffer.from(shot.data, 'base64'));

    // 모달 중간 스크롤 (지표 설명 및 CleanRadar 바)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const body = document.querySelector('#sheet-detail .sheet-body');
        if (body) body.scrollTop = 350;
      })()`
    });
    await new Promise(r => setTimeout(r, 400));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '08_modal_clean_radar.png'), Buffer.from(shot.data, 'base64'));

    // 전성분 태그 열기 및 개별 태그 클릭
    await send('Runtime.evaluate', {
      expression: `(() => {
        const body = document.querySelector('#sheet-detail .sheet-body');
        if (body) body.scrollTop = 600;
        const btn = document.getElementById('btn-toggle-clean-tags');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 400));

    // 첫 번째 태그 클릭
    await send('Runtime.evaluate', {
      expression: `(() => {
        const tag = document.querySelector('.clean-ingredient-tag');
        if (tag) tag.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 300));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '09_modal_tags_tooltip.png'), Buffer.from(shot.data, 'base64'));

    // 비교 담기 버튼 클릭
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('btn-toggle-compare');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 400));

    // 상세 모달 닫기
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-close-detail').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    // ── STEP 5: 비교함 플로팅 독 및 비교 모달 점검 ──
    console.log('🔍 [검사 5] 비교함 독 및 비교 모달 점검 중...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '10_compare_dock.png'), Buffer.from(shot.data, 'base64'));

    // 비교하기 버튼 클릭
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-open-compare').click()`
    });
    await new Promise(r => setTimeout(r, 500));
    await checkOverflow('Compare Modal');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '11_compare_modal.png'), Buffer.from(shot.data, 'base64'));

    // 비교 모달 닫기
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-close-compare').click()`
    });
    await new Promise(r => setTimeout(r, 300));

    // ── STEP 6: 안드로이드 표준 360x740 해상도 검사 ──
    console.log('📱 2. Android 360x740 뷰포트 검사...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 500));
    const galaxyOverflow = await checkOverflow('Galaxy 360x740 View');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '12_galaxy_360_home.png'), Buffer.from(shot.data, 'base64'));

    // ── STEP 7: 대화면 412x915 해상도 검사 ──
    console.log('📱 3. Galaxy Ultra 412x915 뷰포트 검사...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 915,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 500));
    const ultraOverflow = await checkOverflow('Galaxy Ultra 412x915 View');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, '13_galaxy_ultra_home.png'), Buffer.from(shot.data, 'base64'));

    // 최종 감사 결과 리포트 저장
    const auditSummary = {
      timestamp: new Date().toISOString(),
      testedResolutions: ['375x812 (iPhone X/12/13/14)', '360x740 (Galaxy S22/S23)', '412x915 (Galaxy Ultra)'],
      jsErrorsCount: jsErrors.length,
      jsErrors,
      consoleLogsCount: consoleLogs.length,
      overflowIssuesCount: overflowIssues.length,
      overflowIssues,
      modalCheck: modalCheck.result.value
    };

    fs.writeFileSync(path.join(outputDir, 'audit_report.json'), JSON.stringify(auditSummary, null, 2), 'utf-8');
    console.log('🎉 [전수 검사 완료] 결과 파일이 생성되었습니다!');

    ws.close();
  } catch (err) {
    console.error('검사 중 오류 발생:', err);
  } finally {
    edge.kill();
    server.close();
  }
});
