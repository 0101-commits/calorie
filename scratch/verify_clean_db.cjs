const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// 정적 HTTP 서버
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(rootDir, reqPath);

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

async function run() {
  await new Promise(resolve => server.listen(8089, resolve));
  console.log('Server listening on http://localhost:8089');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:8089/index.html', { waitUntil: 'networkidle0' });

  // 1. 홈 화면 캡처
  await page.screenshot({ path: path.join(__dirname, 'shot1_home_clean_badges.png') });
  console.log('Screenshot 1 captured: shot1_home_clean_badges.png');

  // 2. 랭킹 탭 이동 및 알룰로스 필터 클릭
  await page.click('button[data-tab="ranking"]');
  await new Promise(r => setTimeout(r, 400));
  await page.click('button[data-filter="allulose"]');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, 'shot2_ranking_allulose_filter.png') });
  console.log('Screenshot 2 captured: shot2_ranking_allulose_filter.png');

  // 3. 첫 번째 상품 클릭하여 상세 모달 오픈 (더단백 or 셀렉스 등 알룰로스 제품)
  const firstCard = await page.$('#ranking-list-container .card');
  if (firstCard) {
    await firstCard.click();
    await new Promise(r => setTimeout(r, 600));

    // 전성분 태그 아코디언 토글 클릭
    const toggleBtn = await page.$('#btn-toggle-clean-tags');
    if (toggleBtn) {
      await toggleBtn.click();
      await new Promise(r => setTimeout(r, 300));
    }

    await page.screenshot({ path: path.join(__dirname, 'shot3_detail_clean_radar.png') });
    console.log('Screenshot 3 captured: shot3_detail_clean_radar.png');
  }

  await browser.close();
  server.close();
  console.log('Done!');
}

run().catch(err => {
  console.error(err);
  server.close();
  process.exit(1);
});
