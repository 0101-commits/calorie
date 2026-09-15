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
    .replace(/\([^\)]*\)/g, '')
    .replace(/\s*\d+(?:\.\d+)?(?:g|mL|ml|입|개|팩|캔|쪽|cm)\b/g, '')
    .replace(/\s*단품\b/g, '')
    .replace(/\s+R\b/g, '')
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

  // 정밀 최적화 쿼리 (특정 품목 전용)
  if (rawName === '힘을내요 미트볼 도시락') queries.push('이마트24 미트볼 도시락');
  if (rawName === '송사부 감동란 고로케') queries.push('송사부 감동란 고로케');
  if (rawName.includes('킹크래미 피자')) queries.push('난타5000 킹크래미 피자');
  if (rawName === '종가집 부침두부') queries.push('종가집 부침두부');
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
  // 외식 2차 확장 품목 전용 최적화
  if (rawName.includes('굽네 오리지널')) queries.push('굽네 오리지널 순살', '굽네치킨 오리지널');
  if (rawName.includes('고추바사삭')) queries.push('굽네 고추바사삭 순살', '굽네치킨 고추바사삭');
  if (rawName.includes('볼케이노')) queries.push('굽네 볼케이노');
  if (rawName.includes('남해마늘 바사삭')) queries.push('굽네 남해마늘 바사삭');
  if (rawName.includes('그릴 비엔나')) queries.push('굽네 닭가슴살 그릴 비엔나', '굽네 비엔나');
  if (rawName.includes('교촌 오리지널')) queries.push('교촌 오리지널 순살', '교촌치킨 오리지널');
  if (rawName.includes('교촌 레드')) queries.push('교촌 레드 순살', '교촌치킨 레드');
  if (rawName.includes('교촌 허니')) queries.push('교촌 허니 순살', '교촌치킨 허니');
  if (rawName.includes('자메이카 통다리구이')) queries.push('BBQ 자메이카 통다리구이');
  if (rawName.includes('황금올리브치킨')) queries.push('BBQ 황금올리브치킨 순살');
  if (rawName.includes('맛초킹')) queries.push('BHC 맛초킹');
  if (rawName.includes('T-REX')) queries.push('롯데리아 티렉스 버거', '롯데리아 T-REX');
  if (rawName.includes('핫크리스피 버거')) queries.push('롯데리아 핫크리스피 버거');
  if (rawName.includes('클래식 치즈버거')) queries.push('롯데리아 클래식 치즈버거');
  if (rawName.includes('한우불고기 버거')) queries.push('롯데리아 한우불고기 버거');
  if (rawName.includes('모짜렐라 인 더 버거')) queries.push('롯데리아 모짜렐라 인 더 버거 베이컨');
  if (rawName.includes('치킨 휠레')) queries.push('롯데리아 치킨휠레');
  if (rawName.includes('NBB 시그니처')) queries.push('노브랜드버거 NBB 시그니처');
  if (rawName.includes('코울슬로 치킨')) queries.push('노브랜드버거 코울슬로 치킨');
  if (rawName.includes('메가바이트')) queries.push('노브랜드버거 메가바이트');
  if (rawName.includes('그릴드 불고기')) queries.push('노브랜드버거 그릴드 불고기');
  if (rawName.includes('크런치 윙')) queries.push('노브랜드버거 크런치 윙');
  if (rawName.includes('치킨마요')) queries.push('한솥 치킨마요');
  if (rawName.includes('빅치킨마요')) queries.push('한솥 빅치킨마요');
  if (rawName.includes('돈까스도련님')) queries.push('한솥 돈까스도련님');
  if (rawName.includes('동백 도시락')) queries.push('한솥 동백 도시락');
  if (rawName.includes('메가치킨제육')) queries.push('한솥 메가치킨제육');
  if (rawName.includes('숯불직화구이 덮밥')) queries.push('한솥 숯불직화구이 덮밥');
  if (rawName.includes('키토 크림치즈')) queries.push('바르다김선생 키토 크림치즈');
  if (rawName.includes('바른 김밥')) queries.push('바르다김선생 바른김밥');
  if (rawName.includes('바비큐 치킨 치즈 치아바타')) queries.push('스타벅스 바비큐 치킨 치즈 치아바타');
  if (rawName.includes('루꼴라 올리브')) queries.push('스타벅스 햄 루꼴라 올리브 샌드위치');
  if (rawName.includes('잉글리쉬 머핀')) queries.push('스타벅스 브렉퍼스트 잉글리쉬 머핀');
  if (rawName.includes('치킨 베이컨 랩')) queries.push('스타벅스 치킨 베이컨 랩');
  if (rawName.includes('멕시칸 파니니')) queries.push('투썸플레이스 멕시칸 파니니');
  if (rawName.includes('페스토 햄치즈')) queries.push('투썸플레이스 페스토 햄치즈 파니니');

  // 외식 3차 결측 확장 품목 전용 최적화
  if (rawName.includes('이탈리안 비엠티')) queries.push('써브웨이 이탈리안 비엠티');
  if (rawName.includes('스파이시 이탈리안')) queries.push('써브웨이 스파이시 이탈리안');
  if (rawName.includes('참치 15cm')) queries.push('써브웨이 참치 샌드위치', '써브웨이 참치');
  if (rawName.includes('치킨 베이컨 아보카도')) queries.push('써브웨이 치킨 베이컨 아보카도');
  if (rawName.includes('로티세리 바비큐 치킨 샐러드')) queries.push('써브웨이 로티세리 바비큐 치킨 샐러드', '써브웨이 로티세리 샐러드');
  if (rawName.includes('시저치킨 샐러디')) queries.push('샐러디 시저치킨 샐러디');
  if (rawName.includes('연어 샐러디')) queries.push('샐러디 연어 샐러디');
  if (rawName.includes('우삼겹 웜볼')) queries.push('샐러디 우삼겹 웜볼');
  if (rawName.includes('에그베이컨 샌드')) queries.push('샐러디 에그베이컨 샌드');
  if (rawName.includes('멕시칸 랩')) queries.push('샐러디 멕시칸 랩');
  if (rawName.includes('언빌리버블 버거')) queries.push('맘스터치 언빌리버블버거');
  if (rawName.includes('인크레더블 버거')) queries.push('맘스터치 인크레더블버거');
  if (rawName.includes('골든맥앤치즈')) queries.push('맘스터치 골든맥앤치즈 치킨버거');
  if (rawName.includes('바삭크림치즈')) queries.push('맘스터치 바삭크림치즈조각', '맘스터치 치즈조각');
  if (rawName.includes('통새우버거')) queries.push('맘스터치 통새우버거');
  if (rawName.includes('베이컨 토마토 디럭스')) queries.push('맥도날드 베이컨 토마토 디럭스');
  if (rawName.includes('1955 버거')) queries.push('맥도날드 1955 버거');
  if (rawName.includes('맥도날드') && rawName.includes('치즈버거')) queries.push('맥도날드 치즈버거');
  if (rawName.includes('더블 치즈버거')) queries.push('맥도날드 더블 치즈버거');
  if (rawName.includes('맥스파이시 치킨텐더')) queries.push('맥도날드 맥스파이시 치킨텐더', '맥도날드 치킨텐더');
  if (rawName.includes('에그 맥머핀')) queries.push('맥도날드 에그 맥머핀');
  if (rawName.includes('소시지 에그 맥머핀')) queries.push('맥도날드 소시지 에그 맥머핀');
  if (rawName.includes('통새우와퍼')) queries.push('버거킹 통새우와퍼');
  if (rawName.includes('콰트로치즈와퍼')) queries.push('버거킹 콰트로치즈와퍼');
  if (rawName.includes('치즈와퍼')) queries.push('버거킹 치즈와퍼');
  if (rawName.includes('와퍼주니어')) queries.push('버거킹 와퍼주니어');
  if (rawName.includes('갈릭불고기와퍼')) queries.push('버거킹 갈릭불고기와퍼');
  if (rawName.includes('바삭킹')) queries.push('버거킹 바삭킹');
  if (rawName.includes('타워버거')) queries.push('KFC 타워버거');
  if (rawName.includes('징거BLT')) queries.push('KFC 징거BLT 버거', 'KFC 징거버거');
  if (rawName.includes('갓양념 치킨')) queries.push('KFC 갓양념 치킨', 'KFC 양념치킨');
  if (rawName.includes('핫치즈징거')) queries.push('KFC 핫치즈징거버거');
  if (rawName.includes('닭껍질튀김')) queries.push('KFC 닭껍질튀김');
  if (rawName.includes('불고기 버거') && brand === '롯데리아') queries.push('롯데리아 불고기 버거');
  if (rawName.includes('새우버거') && brand === '롯데리아') queries.push('롯데리아 새우버거');
  if (rawName.includes('더블 한우불고기')) queries.push('롯데리아 더블 한우불고기 버거');
  if (rawName.includes('리아미라클')) queries.push('롯데리아 리아미라클 버거');
  if (rawName.includes('화이어윙')) queries.push('롯데리아 화이어윙');
  if (rawName.includes('미트 마니아')) queries.push('노브랜드버거 미트 마니아');
  if (rawName.includes('더블치즈앤베이컨')) queries.push('노브랜드버거 더블치즈앤베이컨');
  if (rawName.includes('산체스 버거')) queries.push('노브랜드버거 산체스 버거');
  if (rawName.includes('스모키 살사')) queries.push('노브랜드버거 스모키 살사');
  if (rawName.includes('치킨 시저 샐러드')) queries.push('노브랜드버거 치킨 시저 샐러드');
  if (rawName.includes('SG불고기')) queries.push('프랭크버거 SG불고기버거');
  if (rawName.includes('베이컨치즈버거') && brand === '프랭크버거') queries.push('프랭크버거 베이컨치즈버거');
  if (rawName.includes('쉬림프버거') && brand === '프랭크버거') queries.push('프랭크버거 쉬림프버거');
  if (rawName.includes('K불고기')) queries.push('프랭크버거 K불고기버거');
  if (rawName.includes('진달래 도시락')) queries.push('한솥 진달래 도시락');
  if (rawName.includes('개나리 도시락')) queries.push('한솥 개나리 도시락');
  if (rawName.includes('소불고기 도시락')) queries.push('한솥 소불고기 도시락');
  if (rawName.includes('스팸김치볶음밥')) queries.push('한솥 스팸김치볶음밥');
  if (rawName.includes('소불고기 비빔밥')) queries.push('한솥 소불고기 비빔밥');
  if (rawName.includes('참치야채 비빔밥')) queries.push('한솥 참치야채 비빔밥');
  if (rawName.includes('김치제육덮밥')) queries.push('한솥 김치제육덮밥');
  if (rawName.includes('갈비천왕')) queries.push('굽네 갈비천왕');
  if (rawName.includes('오븐바사삭')) queries.push('굽네 오븐바사삭');
  if (rawName.includes('교촌 반반')) queries.push('교촌 반반 순살', '교촌 반반치킨');
  if (rawName.includes('살살후라이드')) queries.push('교촌 살살후라이드', '교촌 살살치킨');
  if (rawName.includes('속안심')) queries.push('BBQ 황금올리브 속안심', 'BBQ 황금올리브치킨 속안심');
  if (rawName.includes('극한왕갈비')) queries.push('BBQ 극한왕갈비치킨');
  if (rawName.includes('뿌링클')) queries.push('BHC 뿌링클 순살', 'BHC 뿌링클');
  if (rawName.includes('골드킹')) queries.push('BHC 골드킹 순살', 'BHC 골드킹');
  if (rawName.includes('블랙알리오')) queries.push('푸라닭 블랙알리오 순살', '푸라닭 블랙알리오');
  if (rawName.includes('고추마요') && brand === '푸라닭') queries.push('푸라닭 고추마요 순살', '푸라닭 고추마요');
  if (rawName.includes('오리지널 순살') && brand === '푸라닭') queries.push('푸라닭 오리지널 순살', '푸라닭 푸라닭치킨');
  if (rawName.includes('슈프림양념')) queries.push('처갓집 슈프림양념치킨 순살', '처갓집 슈프림양념치킨');
  if (rawName.includes('양념 치킨 순살') && brand === '처갓집양념치킨') queries.push('처갓집 양념치킨 순살', '처갓집 양념치킨');
  if (rawName.includes('스파이시 참치 포케')) queries.push('슬로우캘리 스파이시 참치 포케');
  if (rawName.includes('스파이시 연어 포케')) queries.push('슬로우캘리 스파이시 연어 포케');
  if (rawName.includes('와사비 렌치 연어')) queries.push('슬로우캘리 와사비 렌치 연어 포케');
  if (rawName.includes('하와이안 갈릭 쉬림프')) queries.push('슬로우캘리 하와이안 갈릭 쉬림프');
  if (rawName.includes('프로틴 연어 포케')) queries.push('포케올데이 프로틴 연어 포케', '포케올데이 연어 포케');
  if (rawName.includes('우삼겹 메밀면 포케')) queries.push('포케올데이 우삼겹 메밀면 포케', '포케올데이 우삼겹 포케');
  if (rawName.includes('육회 프로틴 포케')) queries.push('포케올데이 육회 프로틴 포케', '포케올데이 육회 포케');
  if (rawName.includes('베이컨 치즈 토스트')) queries.push('스타벅스 베이컨 치즈 토스트');
  if (rawName.includes('단호박 에그 샌드위치')) queries.push('스타벅스 단호박 에그 샌드위치');
  if (rawName.includes('치킨 토마토 치즈')) queries.push('스타벅스 치킨 토마토 치즈 샌드위치');
  if (rawName.includes('콥 샐러드 밀박스')) queries.push('스타벅스 콥 샐러드 밀박스');
  if (rawName.includes('올데이 비프 파니니')) queries.push('투썸플레이스 올데이 비프 파니니');
  if (rawName.includes('바베큐 치킨 파니니')) queries.push('투썸플레이스 바베큐 치킨 파니니');
  if (rawName.includes('쉬림프 에그 샐러드')) queries.push('투썸플레이스 쉬림프 에그 샐러드');
  if (rawName.includes('블랙타이거 슈림프')) queries.push('도미노피자 블랙타이거 슈림프');
  if (rawName.includes('포테이토 씬')) queries.push('도미노피자 포테이토 피자');
  if (rawName.includes('리얼불고기 씬')) queries.push('도미노피자 리얼불고기 피자');
  if (rawName.includes('립스테이크 바이트')) queries.push('피자헛 립스테이크 바이트');

  // 편의점 4차 (라면, 아이스크림, 과자/스낵, 도시락, 간편식) 최적화
  if (rawName.includes('컵누들 매콤한맛')) queries.push('오뚜기 컵누들 매콤한맛');
  if (rawName.includes('컵누들 우동맛')) queries.push('오뚜기 컵누들 우동맛');
  if (rawName.includes('컵누들 매콤찜닭맛')) queries.push('오뚜기 컵누들 매콤찜닭맛');
  if (rawName.includes('컵누들 짜장맛')) queries.push('오뚜기 컵누들 짜장맛');
  if (rawName.includes('컵누들 마라탕맛')) queries.push('오뚜기 컵누들 마라탕맛');
  if (rawName.includes('컵누들 베트남쌀국수')) queries.push('오뚜기 컵누들 베트남쌀국수');
  if (rawName.includes('신라면 건면')) queries.push('농심 신라면 건면');
  if (rawName.includes('신라면 큰사발면')) queries.push('신라면 큰사발');
  if (rawName.includes('신라면 툼바')) queries.push('신라면 툼바 큰사발', '신라면 툼바');
  if (rawName.includes('불닭볶음면 큰컵')) queries.push('불닭볶음면 큰컵');
  if (rawName.includes('까르보불닭볶음면 큰컵')) queries.push('까르보불닭볶음면 큰컵');
  if (rawName.includes('로제불닭볶음면 큰컵')) queries.push('로제불닭볶음면 큰컵');
  if (rawName.includes('육개장 사발면')) queries.push('농심 육개장 사발면');
  if (rawName.includes('튀김우동 큰사발면')) queries.push('농심 튀김우동 큰사발면');
  if (rawName.includes('짜파게티 큰사발면')) queries.push('농심 짜파게티 큰사발면');
  if (rawName.includes('진라면 매운맛 큰컵')) queries.push('오뚜기 진라면 매운맛 큰컵', '진라면 매운맛 컵');
  if (rawName.includes('팔도 비빔면 컵')) queries.push('팔도 비빔면 컵');
  if (rawName.includes('장인라면 얼큰한맛')) queries.push('하림 The미식 장인라면 얼큰한맛 컵', '장인라면 얼큰한맛 컵');

  if (rawName.includes('라라스윗 바닐라 초코바')) queries.push('라라스윗 바닐라 초코바');
  if (rawName.includes('라라스윗 초콜릿 초코바')) queries.push('라라스윗 초콜릿 초코바');
  if (rawName.includes('라라스윗 말차 초코바')) queries.push('라라스윗 말차 초코바');
  if (rawName.includes('라라스윗 바닐라 모나카')) queries.push('라라스윗 바닐라 모나카');
  if (rawName.includes('라라스윗 옥수수 모나카')) queries.push('라라스윗 옥수수 모나카');
  if (rawName.includes('라라스윗 초콜릿 파인트')) queries.push('라라스윗 초콜릿 파인트');
  if (rawName.includes('스키니피그 더블초코')) queries.push('스키니피그 더블초코바', '스키니피그 더블초코');
  if (rawName.includes('스키니피그 바닐라 모나카')) queries.push('스키니피그 바닐라 모나카');
  if (rawName.includes('제로 밀크 모나카')) queries.push('롯데 제로 밀크 모나카');
  if (rawName.includes('제로 밀크 초콜릿 바')) queries.push('롯데 제로 초콜릿바', '롯데 제로 아이스크림 바');
  if (rawName.includes('투게더 미니어처 바닐라')) queries.push('빙그레 투게더 미니어처');
  if (rawName.includes('메로나 75mL')) queries.push('빙그레 메로나');
  if (rawName.includes('참붕어싸만코')) queries.push('빙그레 참붕어싸만코');
  if (rawName.includes('부라보콘 바닐라')) queries.push('해태 부라보콘');

  if (rawName.includes('단백질칩 칠리살사')) queries.push('오리온 닥터유 단백질칩 칠리살사');
  if (rawName.includes('단백질칩 버터솔트')) queries.push('오리온 닥터유 단백질칩 버터솔트');
  if (rawName.includes('닥터유 단백질볼')) queries.push('오리온 닥터유 단백질볼');
  if (rawName.includes('꼬북칩 초코츄러스')) queries.push('꼬북칩 초코츄러스');
  if (rawName.includes('포카칩 오리지널')) queries.push('오리온 포카칩 오리지널');
  if (rawName.includes('태양의맛 썬')) queries.push('태양의맛 썬 핫스파이시');
  if (rawName.includes('먹태깡 청양마요')) queries.push('농심 먹태깡 청양마요');
  if (rawName.includes('새우깡 90g')) queries.push('농심 새우깡');
  if (rawName.includes('매운 새우깡')) queries.push('농심 매운 새우깡');
  if (rawName.includes('포테토칩 오리지널')) queries.push('농심 포테토칩 오리지널');
  if (rawName.includes('제로 카카오 케이크')) queries.push('롯데 제로 카카오 케이크');
  if (rawName.includes('제로 크런치 초코볼')) queries.push('롯데 제로 크런치 초코볼');
  if (rawName.includes('허니버터칩')) queries.push('해태 허니버터칩');
  if (rawName.includes('C콘chip')) queries.push('크라운 콘칩');
  if (rawName.includes('갈릭버터 베이글칩')) queries.push('딜라이트 프로젝트 갈릭버터 베이글칩');
  if (rawName.includes('단백질 베이글칩')) queries.push('딜라이트 프로젝트 단백질 베이글칩');
  if (rawName.includes('블랙쿠키') && brand === '랩노쉬') queries.push('랩노쉬 프로틴 쿠키바 블랙쿠키');
  if (rawName.includes('마이밀 프로틴 바')) queries.push('마이밀 프로틴 바 너츠');
  if (rawName.includes('츄앤크리스피 완두')) queries.push('청정원 츄앤크리스피 완두');

  if (rawName.includes('혜자로운 집밥 7첩반상')) queries.push('GS25 혜자로운 집밥 7첩반상');
  if (rawName.includes('혜자로운 집밥 통통쏘야')) queries.push('GS25 혜자로운 집밥 통통쏘야');
  if (rawName.includes('혜자로운 집밥 에그함박')) queries.push('GS25 혜자로운 집밥 에그함박');
  if (rawName.includes('혜자로운 집밥 닭가슴살소시지')) queries.push('GS25 혜자로운 집밥 닭가슴살소시지');
  if (rawName.includes('백종원 한판 도시락')) queries.push('CU 백종원 한판 도시락');
  if (rawName.includes('백종원 매콤 불고기')) queries.push('CU 백종원 매콤 불고기 도시락');
  if (rawName.includes('백종원 바싹 불고기')) queries.push('CU 백종원 바싹 불고기');
  if (rawName.includes('백종원 7첩 한판')) queries.push('CU 백종원 7첩 한판 도시락');
  if (rawName.includes('백종원 트리플 돈까스')) queries.push('CU 백종원 트리플 돈까스 도시락');
  if (rawName.includes('맛장우 전주비빔밥')) queries.push('세븐일레븐 맛장우 전주비빔밥');
  if (rawName.includes('맛장우 매콤제육')) queries.push('세븐일레븐 맛장우 매콤제육');
  if (rawName.includes('맛장우 든든한불백')) queries.push('세븐일레븐 맛장우 든든한불백');
  if (rawName.includes('바싹불고기&소시지 도시락')) queries.push('이마트24 바싹불고기 도시락');
  if (rawName.includes('훈제오리&채소 도시락')) queries.push('이마트24 훈제오리 도시락');
  if (rawName.includes('참치마요덮밥 247g')) queries.push('CJ 햇반컵반 참치마요덮밥');

  if (rawName.includes('바삭통소시지 김밥')) queries.push('GS25 바삭통소시지 김밥', 'GS25 통소시지 김밥', 'GS25 소시지 김밥', '통소시지 김밥');
  if (rawName.includes('더큰 닭다리 즉석조리')) queries.push('GS25 더큰 닭다리');
  if (rawName.includes('바삭통다리 치킨')) queries.push('GS25 바삭통다리 치킨');
  if (rawName.includes('참치마요 삼각김밥 110g')) queries.push('CU 참치마요 삼각김밥');
  if (rawName.includes('전주비빔 삼각김밥 110g')) queries.push('CU 전주비빔 삼각김밥');
  if (rawName.includes('매콤제육 김밥 235g')) queries.push('CU 백종원 매콤제육 김밥');
  if (rawName.includes('자이언트 핫바 매콤한맛')) queries.push('CU 자이언트 핫바 매콤한맛');
  if (rawName.includes('더커진 참치마요 삼각김밥')) queries.push('세븐일레븐 더커진 참치마요 삼각김밥');
  if (rawName.includes('통닭다리구이 160g')) queries.push('세븐일레븐 통닭다리구이');
  if (rawName.includes('맥스봉 치즈소시지')) queries.push('CJ 맥스봉 치즈');
  if (rawName.includes('삼호어묵 오뎅한그릇')) queries.push('CJ 삼호어묵 오뎅한그릇');
  if (rawName.includes('천하장사 오리지널')) queries.push('진주햄 천하장사 오리지널 50g', '진주햄 천하장사');
  if (rawName.includes('숯불구이맛 핫바')) queries.push('사조 대림선 숯불구이맛 핫바');
  if (rawName.includes('휠터치 핫바')) queries.push('사조 대림선 휠터치');
  if (rawName.includes('닭가슴살 핫바 갈릭')) queries.push('하림 닭가슴살 핫바 갈릭');
  if (rawName.includes('닭가슴살 핫바 훈제')) queries.push('하림 닭가슴살 핫바 훈제');
  if (rawName.includes('치즈팡팡 핫도그')) queries.push('삼립 치즈팡팡 핫도그');


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
