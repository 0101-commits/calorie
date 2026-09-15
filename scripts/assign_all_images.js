// scripts/assign_all_images.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
};

function cleanBrandName(brand) {
  if (!brand) return '';
  return brand
    .replace(/\(주\)|\(유\)|㈜|\b주식회사\b|농업회사법인/g, '')
    .replace(/\s*(제천공장|익산공장|논산공장|공장).*$/g, '')
    .trim();
}

function cleanItemName(name) {
  if (!name) return '';
  return name
    .replace(/^[가-힣a-zA-Z0-9\(\)]+_/g, '')
    .replace(/\([^\)]*(?:기준|공장|KUKY|XL|80g|2알|1마리|1팩)[^\)]*\)/g, '')
    .replace(/\s*\d+(?:\.\d+)?(?:g|mL|ml|입|개|팩|캔|쪽)\b/g, '')
    .replace(/\s*단품\b/g, '')
    .trim();
}

async function searchDaumImage(query) {
  const url = `https://search.daum.net/search?w=img&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    const regex = /https:\/\/search\d+\.kakaocdn\.net\/argon\/[^\s"'<>]+/g;
    const matches = html.match(regex) || [];
    
    // 1순위: 깔끔한 320x320 썸네일
    const sq = matches.filter(m => m.includes('320x320') || m.includes('R320x320'));
    if (sq.length > 0) return sq[0];

    // 2순위: 기타 고해상도 아르곤 이미지
    if (matches.length > 0) return matches[0];
  } catch (err) {
    // ignore timeout or network error
  }
  return null;
}

async function findImageForItem(item) {
  if (item.image_url && item.image_url.startsWith('http')) {
    return item.image_url;
  }

  const brand = cleanBrandName(item.brand);
  const rawName = item.name || '';
  const cleanName = cleanItemName(rawName);

  const queries = [];
  if (brand && !cleanName.includes(brand)) {
    queries.push(`${brand} ${cleanName}`);
  }
  queries.push(cleanName);

  // 단위 제거한 검색어 추가 (예: 100g, 250mL 제거)
  const simplerName = rawName.replace(/\s*\d+(?:\.\d+)?(?:g|mL|ml|입|개|팩|캔)\b/g, '').trim();
  if (simplerName && simplerName !== rawName) {
    if (brand && !simplerName.includes(brand)) {
      queries.push(`${brand} ${simplerName}`);
    }
    queries.push(simplerName);
  }

  // 브랜드/제품별 최적화 쿼리
  if (rawName.includes('백종원')) queries.push('CU 백종원 반반 도시락', '백종원 매콤돈까스', 'CU 백종원 도시락');
  if (rawName.includes('힘을내요 미트볼')) queries.push('이마트24 미트볼 도시락');
  if (rawName.includes('그릭 요거트')) queries.push('스타벅스 오가닉 프로틴 그릭 요거트');
  if (rawName.includes('쿠우키')) queries.push('단백질 쿠우키');
  if (rawName.includes('프로뮨 단백질쌀쿠키')) queries.push('단백질 쌀쿠키');
  if (rawName.includes('언리미트')) queries.push('언리미트 식물성 육포');
  if (rawName.includes('비그레인')) queries.push('식물성 육포');
  if (rawName.includes('미니 단백질바')) queries.push('미니 단백질바');
  if (rawName.includes('생치킨텐더까스')) queries.push('치킨텐더까스');
  if (rawName.includes('혜성더단백한마카로니')) queries.push('마카로니 과자');
  if (rawName.includes('닥터랩노쉬')) queries.push('닥터랩노쉬 구미');
  if (rawName.includes('감동란')) queries.push('송사부 감동란 고로케');
  if (rawName.includes('킹크래미 피자')) queries.push('난타5000 킹크래미');
  if (rawName.includes('두부바')) queries.push('풀무원 지구식단 두부바');
  if (rawName.includes('구운란')) queries.push('노브랜드 구운란');
  if (rawName.includes('12곡 식빵')) queries.push('파리바게뜨 고단백 식빵');
  if (rawName.includes('직화 닭가슴살')) queries.push('풀무원 지구식단 직화 닭가슴살');
  if (rawName.includes('검은콩두유')) queries.push('풀무원 프로틴 검은콩두유');
  if (rawName.includes('들깨두부 칼국수')) queries.push('풀무원 들깨두부 칼국수');
  if (rawName.includes('두부볼')) queries.push('풀무원 지구식단 두부볼');
  if (rawName.includes('연두부')) queries.push('풀무원 연두부');
  if (rawName.includes('탄두리 치킨')) queries.push('하림 탄두리 치킨');
  if (rawName.includes('용가리')) queries.push('하림 용가리 고단백 너겟');
  if (rawName.includes('부침두부')) queries.push('종가집 부침두부');
  if (rawName.includes('쉐푸드')) queries.push('롯데 쉐푸드 닭가슴살 스테이크');
  if (rawName.includes('미각제빵소')) queries.push('미각제빵소 고단백');
  if (rawName.includes('동그랑땡')) queries.push('바르닭 닭가슴살 동그랑땡');
  if (rawName.includes('순수두유')) queries.push('노브랜드 순수두유');
  if (rawName.includes('혜자로운')) queries.push('혜자로운 닭다리살 도시락');
  // 신규 품목 전용 최적화
  if (rawName.includes('로티세리 치킨')) queries.push('코스트코 로티세리 치킨');
  if (rawName.includes('커클랜드') && rawName.includes('그릭요거트')) queries.push('커클랜드 그릭요거트', '코스트코 커클랜드 그릭요거트');
  if (rawName.includes('수지스')) queries.push('수지스 그릴드 닭가슴살', '수지스 닭가슴살');
  if (rawName.includes('커클랜드') && rawName.includes('프로틴바')) queries.push('커클랜드 프로틴바');
  if (rawName.includes('고등어구이')) queries.push('비비고 순살 고등어구이', '비비고 고등어구이');
  if (rawName.includes('삼치구이')) queries.push('비비고 순살 삼치구이', '비비고 삼치구이');
  if (rawName.includes('가자미구이')) queries.push('비비고 순살 가자미구이', '비비고 가자미구이');
  if (rawName.includes('연어구이')) queries.push('비비고 순살 연어구이', '비비고 연어구이');
  if (rawName.includes('크랩스')) queries.push('동원 리얼 크랩스');
  if (rawName.includes('크래미')) queries.push('한성 크래미');
  if (rawName.includes('두부면')) queries.push('풀무원 두부면');
  if (rawName.includes('롤유부초밥')) queries.push('풀무원 롤유부초밥');
  if (rawName.includes('미트리') && rawName.includes('볶음밥')) queries.push('미트리 닭가슴살 볶음밥', '미트리 볶음밥');
  if (rawName.includes('맛있닭') && rawName.includes('만두')) queries.push('맛있닭 닭가슴살 만두', '맛있닭 만두');
  if (rawName.includes('맛있닭') && rawName.includes('브리또')) queries.push('맛있닭 브리또');
  if (rawName.includes('몸짱이 될 닭')) queries.push('바디나인 내가 몸짱이 될 닭');
  if (rawName.includes('로드닭')) queries.push('굽네몰 로드닭');
  if (rawName.includes('소맛닭')) queries.push('굽네몰 소맛닭');
  if (rawName.includes('그릭데이')) queries.push('그릭데이 시그니처', '그릭데이');
  if (rawName.includes('요즘 플레인')) queries.push('요즘 그릭요거트');
  if (rawName.includes('매일두유 고단백')) queries.push('매일두유 고단백');

  for (const q of queries) {
    const img = await searchDaumImage(q);
    if (img) return img;
    await new Promise(r => setTimeout(r, 60));
  }

  return null;
}

// 동시성 제어 큐
async function runWithConcurrency(items, fn, limit = 5) {
  const results = new Array(items.length);
  let currentIndex = 0;
  let completed = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        results[idx] = null;
      }
      completed++;
      if (completed % 25 === 0 || completed === items.length) {
        console.log(`⏳ 진행률: ${completed}/${items.length} (${Math.round((completed / items.length) * 100)}%)`);
      }
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const products = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  console.log(`🔍 총 ${products.length}개 제품의 실물 이미지 검색을 시작합니다...`);
  const startTime = Date.now();

  const imageUrls = await runWithConcurrency(products, findImageForItem, 6);

  let matched = 0;
  let missing = [];

  for (let i = 0; i < products.length; i++) {
    const img = imageUrls[i];
    if (img) {
      products[i].image_url = img;
      matched++;
    } else {
      missing.push(products[i]);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 완료! (${durationSec}초 소요)`);
  console.log(`  - 매칭 성공: ${matched}/${products.length} (${((matched / products.length) * 100).toFixed(1)}%)`);
  console.log(`  - 미매칭 건수: ${missing.length}건`);

  if (missing.length > 0) {
    console.log('\n⚠️ 미매칭 품목 (일부):');
    missing.slice(0, 10).forEach(m => console.log(`  [${m.brand}] ${m.name}`));
  }

  fs.writeFileSync(seedPath, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`\n💾 data/seed.json 에 이미지 URL 업데이트 완료!`);
}

main().catch(err => {
  console.error('실행 중 오류 발생:', err);
  process.exit(1);
});
