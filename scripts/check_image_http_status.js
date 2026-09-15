// scripts/check_image_http_status.js
// 전체 631개 이미지의 실제 HTTP 접근성(200 OK) 전수 네트워크 검증
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://search.daum.net/'
};

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(5000) });
    return res.status;
  } catch (err) {
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
      return res.status;
    } catch (e) {
      return 0; // failed
    }
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));
  console.log(`🌐 총 ${data.length}개 이미지 HTTP 200 전수 검사를 시작합니다...`);

  let okCount = 0;
  let failCount = 0;
  const failed = [];

  // 동시성 15개로 검사
  const concurrency = 15;
  let idx = 0;

  async function worker() {
    while (idx < data.length) {
      const current = idx++;
      const item = data[current];
      const status = await checkUrl(item.image_url);
      if (status >= 200 && status < 400) {
        okCount++;
      } else {
        failCount++;
        failed.push({ item, status });
      }
      if ((okCount + failCount) % 100 === 0 || (okCount + failCount) === data.length) {
        console.log(`⏳ 확인 진행률: ${okCount + failCount}/${data.length} (정상: ${okCount}, 실패: ${failCount})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\n🎉 HTTP 검증 완료!`);
  console.log(`  - 정상 응답(200 OK): ${okCount}/${data.length} (${((okCount / data.length) * 100).toFixed(1)}%)`);
  console.log(`  - 실패 건수: ${failCount}건`);

  if (failed.length > 0) {
    console.log('\n❌ 깨진 이미지 목록:');
    failed.forEach(f => console.log(`  [${f.item.menu_id}] ${f.item.name} (${f.status}) -> ${f.item.image_url}`));
  }
}

main().catch(console.error);
