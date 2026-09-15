// scripts/audit_and_fix_images.js
// 전체 631개 품목 이미지 전수 검수 및 오류 이미지 정밀 재매핑 스크립트
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

    // 2순위: 기타 아르곤 이미지
    if (matches.length > 0) return matches[0];
  } catch (err) {
    // ignore
  }
  return null;
}

// 명시적 1:1 정밀 타깃 쿼리 사전 (오검색 및 중복 방지)
const PRECISION_QUERIES = {
  // 계란류
  'cvs-gamdongran-boiled-egg-100': ['편의점 감동란 반숙란 2구', '감동란 2구', '감동란 반숙계란'],
  'cvs-d2197110000000159-100': ['송사부 매콤마요 감동란 고로케', '송사부 감동란 고로케'],
  'cvs-p1014020002000005-100': ['마라 감동란', '편의점 마라 감동란'],
  'cvs-d2197110000000044-100': ['GS25 감동란 샐러드', '감동란 닭가슴살 샐러드'],

  // 유어스 vs 행복한콩 두부
  'cvs-gs25-youus-smoked-chicken-100': ['GS25 유어스 훈제 닭가슴살', '유어스 훈제 닭가슴살', 'GS25 훈제 닭가슴살'],
  'mart-cj-happy-tofu-pan-fried-100': ['CJ 행복한콩 부침용 국산콩 두부', '행복한콩 국산콩 두부 부침용', 'CJ 행복한콩 두부'],

  // CJ 치즈큐브 vs 러브잇 양념
  'mart-cj-the-healthy-chicken-cube-cheese-100': ['CJ 더건강한 닭가슴살 한입큐브 치즈', '더건강한 한입큐브 치즈'],
  'online-loveat-sauce-chicken-spicy-100': ['러브잇 소스 닭가슴살 매콤양념', '러브잇 매콤양념 닭가슴살'],

  // 하림 소시지 오리지널 vs 훈제
  'cvs-harim-sausage-original-100': ['하림 닭가슴살 소시지 오리지널', '하림 소시지 오리지널'],
  'mart-harim-chicken-sausage-smoked-100': ['하림 닭가슴살 소시지 훈제', '하림 소시지 훈제'],

  // 비비고 생선구이 4종 각각 분리
  'mart-cj-bibigo-mackerel-grilled-60': ['비비고 순살 고등어구이', '비비고 고등어구이 60g'],
  'mart-cj-bibigo-flounder-grilled-60': ['비비고 순살 가자미구이', '비비고 가자미구이 60g'],
  'mart-cj-bibigo-spanish-mackerel-grilled-60': ['비비고 순살 삼치구이', '비비고 삼치구이 60g'],
  'mart-cj-bibigo-salmon-grilled-60': ['비비고 순살 연어구이', '비비고 연어구이 60g'],

  // 프랭크버거 버거별 고유 쿼리
  'fr-frankburger-cheeseburger-r-190': ['프랭크버거 치즈버거'],
  'fr-frankburger-double-cheeseburger-r-260': ['프랭크버거 더블치즈버거'],
  'fr-frankburger-jg-burger-310': ['프랭크버거 JG버거'],
  'fr-frankburger-bacon-cheese-r-215': ['프랭크버거 베이컨치즈버거'],
  'fr-frankburger-shrimp-burger-190': ['프랭크버거 쉬림프버거'],
  'fr-frankburger-sg-bulgogi-195': ['프랭크버거 SG불고기버거'],
  'fr-frankburger-k-bulgogi-200': ['프랭크버거 K불고기버거'],

  // 롯데리아 휠레 vs 화이어윙
  'fr-lotteria-chicken-fillet-4pcs-116': ['롯데리아 치킨휠레'],
  'fr-lotteria-fire-wing-4pcs-120': ['롯데리아 화이어윙'],

  // 버거킹 와퍼 분리
  'fr-burgerking-quattro-cheese-whopper-309': ['버거킹 콰트로치즈와퍼'],
  'fr-burgerking-cheese-whopper-298': ['버거킹 치즈와퍼'],
  'fr-burgerking-whole-shrimp-whopper-328': ['버거킹 통새우와퍼'],
  'fr-burgerking-whopper-junior-158': ['버거킹 와퍼주니어'],
  'fr-burgerking-garlic-bulgogi-whopper-305': ['버거킹 갈릭불고기와퍼'],

  // 쿠차라 부리또볼 치킨 vs 스테이크
  'fr-cuchara-burrito-bowl-chicken-410': ['쿠차라 부리또 볼 치킨'],
  'fr-cuchara-burrito-bowl-steak-410': ['쿠차라 부리또 볼 스테이크'],

  // 노브랜드 닭가슴살 vs 닭안심
  'mart-nobrand-frozen-chicken-breast-100': ['노브랜드 냉동 닭가슴살'],
  'mart-nobrand-frozen-tenderloin-100': ['노브랜드 냉동 닭안심'],

  // 미트리 볶음밥 갈릭 vs 김치
  'online-metree-chicken-fried-rice-garlic-200': ['미트리 닭가슴살 볶음밥 갈릭'],
  'online-metree-chicken-fried-rice-kimchi-200': ['미트리 닭가슴살 볶음밥 김치'],

  // 커클랜드 프로틴바 쿠키도우 vs 브라우니
  'mart-costco-kirkland-protein-bar-cookiedough-60': ['커클랜드 프로틴바 쿠키도우', '코스트코 프로틴바 쿠키도우'],
  'mart-costco-kirkland-protein-bar-brownie-60': ['커클랜드 프로틴바 브라우니', '코스트코 프로틴바 브라우니'],

  // 풀무원 두부바 플레인 vs 바질
  'mart-pulmuone-tofu-bar-plain-40': ['풀무원 지구식단 두부바 플레인'],
  'mart-pulmuone-tofu-bar-basil-40': ['풀무원 지구식단 바질 두부바'],

  // 끌레도르 더단백바 카라멜 vs 초코
  'cvs-p1021030103000836-100': ['끌레도르 더단백바 카라멜'],
  'cvs-p1021030103001179-100': ['끌레도르 더단백바 초코'],

  // 맛있닭 볼 치즈맛 vs 깻잎맛
  'online-masitdak-chicken-ball-cheese-100': ['맛있닭 닭가슴살 볼 치즈맛'],
  'online-masitdak-chicken-ball-perilla-100': ['맛있닭 닭가슴살 볼 깻잎맛'],

  // 맛있닭 한끼피자
  'cvs-p1014150004000121-100': ['맛있닭 닭가슴살 한끼피자 오리지널', '맛있닭 한끼피자'],
  'cvs-p1014150004000122-100': ['맛있닭 닭가슴살 한끼피자 야채플러스', '맛있닭 한끼피자 야채'],

  // 뉴트리디언 쿠우키
  'cvs-p1011030001000063-100': ['뉴트리디언 말차 쿠우키', '단백질 말차 쿠우키'],
  'cvs-p1011030001000064-100': ['뉴트리디언 얼그레이 쿠우키', '단백질 얼그레이 쿠우키'],

  // 여에스더 쿠키
  'cvs-p1011030001000299-107': ['여에스더 단백질 쿠키 다크초코'],
  'cvs-p1011030001000300-109': ['여에스더 단백질 쿠키 땅콩버터'],

  // 언리미트 육포 5종
  'cvs-p1167030703000048-100': ['언리미트 식물성 육포 갈비맛'],
  'cvs-p1167030703000050-100': ['언리미트 식물성 육포 양꼬치맛'],
  'cvs-p1167030703000049-100': ['언리미트 식물성 육포 멕시칸핫'],
  'cvs-p1167030703000052-100': ['언리미트 식물성 육포 치즈맛'],
  'cvs-p1167030703000134-100': ['언리미트 식물성 육포 후추'],

  // 비그레인 육포 3종
  'cvs-p1167030703000206-100': ['비그레인 식물성 육포 갈비맛'],
  'cvs-p1167030703000207-100': ['비그레인 식물성 육포 데리야끼맛'],
  'cvs-p1167030703000208-100': ['비그레인 식물성 육포 매운맛'],

  // 고기대신 육포 2종
  'cvs-p1167030703000001-100': ['고기대신 비건육포 오리지널'],
  'cvs-p1167030703000002-100': ['고기대신 비건육포 핫스파이시'],

  // 닥터랩노쉬 구미
  'cvs-p1012050002001431-100': ['닥터랩노쉬 릴렉스 구미'],
  'cvs-p1012050002001434-100': ['닥터랩노쉬 에너지 구미'],

  // 굽네 토스트
  'cvs-p1014050004002790-100': ['굽네 에그햄치즈 브리오슈 토스트'],
  'cvs-p1014050004002791-100': ['굽네 카야 브리오슈 토스트'],

  // 마이요거트립
  'cvs-d2197110000000238-100': ['마이요거트립 소소한행복 그릭요거트', '마이요거트립 그릭요거트'],
  'cvs-d2197110000000244-100': ['마이요거트립 싱가포르의아침 그릭요거트'],
  'cvs-d2197110000000290-100': ['마이요거트립 하루한번하늘 그릭요거트'],

  // GS25 혜자로운 집밥 시리즈 고유 분리
  'cvs-gs25-hyeja-jeyuk-390': ['GS25 혜자로운 집밥 제육볶음 도시락'],
  'cvs-gs25-hyeja-neobiani-410': ['GS25 혜자로운 집밥 너비아니 닭강정 도시락'],
  'cvs-gs25-hyeja-7side-480': ['GS25 혜자로운 집밥 7첩반상 도시락'],
  'cvs-gs25-hyeja-tongtong-soya-450': ['GS25 혜자로운 집밥 통통쏘야 도시락'],
  'cvs-gs25-hyeja-egghambak-460': ['GS25 혜자로운 집밥 에그함박 도시락'],
  'cvs-gs25-hyeja-chicken-sausage-410': ['GS25 혜자로운 집밥 닭가슴살소시지 도시락'],

  // CU 백종원 시리즈 고유 분리
  'cvs-cu-baekjongwon-plate-440': ['CU 백종원 백반한판 도시락'],
  'cvs-cu-baek-hanpan-460': ['CU 백종원 한판 도시락 460g', 'CU 백종원 한판 도시락'],
  'cvs-cu-baek-spicy-bulgogi-440': ['CU 백종원 매콤 불고기 도시락'],
  'cvs-cu-baek-bassak-bulgogi-430': ['CU 백종원 바싹 불고기 한판', 'CU 백종원 바싹불고기'],
  'cvs-cu-baek-7side-hanpan-470': ['CU 백종원 7첩 한판 도시락'],
  'cvs-cu-baek-triple-tonkatsu-490': ['CU 백종원 트리플 돈까스 도시락'],
  'cvs-cu-baekjongwon-doublepork-450': ['CU 백종원 더블패티 매콤돈까스 반반 도시락'],
  'cvs-cu-baek-spicy-jeyuk-gimbap-235': ['CU 백종원 매콤제육 김밥'],

  // 세븐일레븐 맛장우 시리즈
  'cvs-seven-matjangwoo-bibim-410': ['세븐일레븐 맛장우 전주비빔밥'],
  'cvs-seven-matjangwoo-bibim-430': ['세븐일레븐 맛장우 전주비빔밥 도시락'],
  'cvs-seven-matjangwoo-spicy-jeyuk-450': ['세븐일레븐 맛장우 매콤제육 도시락'],
  'cvs-seven-matjangwoo-bulbaek-460': ['세븐일레븐 맛장우 든든한불백 도시락'],

  // GS25 김밥 분리
  'cvs-gs25-tuna-mayo-gimbap-235': ['GS25 참치마요 김밥'],
  'cvs-gs25-tuna-mayo-gimbap-240': ['GS25 참치마요 김밥 240g', 'GS25 참치마요 김밥'],
  'cvs-gs25-tong-sausage-gimbap-240': ['GS25 통소시지 김밥 240g'],
  'cvs-gs25-tong-sausage-gimbap-245': ['GS25 바삭통소시지 김밥 245g']
};

async function main() {
  const seedPath = path.join(rootDir, 'data', 'seed.json');
  const products = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  console.log(`🔍 총 ${products.length}개 품목 전수 검수 및 정밀 재매핑을 시작합니다...`);

  // 1. PRECISION_QUERIES에 등록된 대상 품목들 전면 재검색
  let targetCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < products.length; i++) {
    const item = products[i];
    const queries = PRECISION_QUERIES[item.menu_id];

    if (queries && queries.length > 0) {
      targetCount++;
      let newImg = null;
      for (const q of queries) {
        newImg = await searchDaumImage(q);
        if (newImg) break;
        await new Promise(r => setTimeout(r, 60));
      }

      if (newImg) {
        if (item.image_url !== newImg) {
          console.log(`🔄 [재매핑 #${targetCount}] ${item.name} (${item.menu_id})`);
          console.log(`   기존: ${item.image_url}`);
          console.log(`   신규: ${newImg}`);
          item.image_url = newImg;
          updatedCount++;
        } else {
          console.log(`✅ [유지 #${targetCount}] ${item.name} (이미 정확함)`);
        }
      } else {
        console.warn(`⚠️ [검색실패] ${item.name} (${queries.join(', ')})`);
      }
    }
  }

  console.log(`\n🎉 1단계 정밀 쿼리 완료! 총 대상 ${targetCount}개 중 ${updatedCount}개 갱신됨.`);

  // data/seed.json 저장
  fs.writeFileSync(seedPath, JSON.stringify(products, null, 2), 'utf-8');
  console.log(`💾 data/seed.json 업데이트 완료!`);
}

main().catch(console.error);
