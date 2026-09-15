// scripts/audit_active_products.js
// 전체 631개 품목 중 단종, 판매종료, B2B 원료, 채널 오분류 품목 정밀 전수 검수
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));

console.log(`🔍 총 ${data.length}개 품목의 현재 판매 여부 전수 검수를 시작합니다...\n`);

const issues = {
  discontinued: [], // 확실한 단종 / 판매종료
  b2b_raw: [],      // 공장 원료 / B2B 5kg 등
  channel_mismatch: [], // 프랜차이즈/베이커리 메뉴가 편의점으로 잘못 들어간 것
  suspicious_legacy: [] // 2021년 이전 식약처 등록 후 현재 유통 확인 불가능한 비인기 OEM
};

// 키워드 및 ID 기반 판별 로직
for (const item of data) {
  const name = item.name;
  const brand = item.brand;
  const id = item.menu_id;

  // 1. B2B / 대용량 원료 / 검증용 데이터
  if (name.includes('5kg') || name.includes('공공검증') || name.includes('부엌') && name.includes('무침')) {
    issues.b2b_raw.push(item);
    continue;
  }

  // 2. 과거 이벤트 한정판 및 공식 단종 피자/메뉴
  if (name.includes('하이프로틴도우')) {
    // 도미노피자 하이프로틴 도우: 2021년 3월 한정 출시 후 단종
    issues.discontinued.push({ item, reason: '도미노피자 2021년 한정 프로모션 종료 (단종)' });
    continue;
  }

  // 3. 로컬 피자/베이커리/카페 메뉴가 cvs 채널로 잘못 오분류되어 있는 경우
  if (item.channel === 'cvs' && (id.includes('-d20') || id.includes('-d21'))) {
    if (['할리스', '킹스타피자', '피자스쿨', '지정환피자', '피자알볼로', '난타5000피자', '따삐오', '커피에반하다', '크로플덕오리아가씨'].some(b => brand.includes(b))) {
      issues.channel_mismatch.push({ item, reason: `${brand} 메뉴가 편의점(CVS) 채널에 잘못 등록됨 및 매장 단종` });
      continue;
    }
    if (brand.includes('파리바게뜨') && (name.includes('소세지') || name.includes('소시지') || name.includes('케이크'))) {
      issues.channel_mismatch.push({ item, reason: `파리바게뜨 베이커리 빵이 편의점(CVS)에 오분류됨` });
      continue;
    }
    if (brand.includes('던킨') && name.includes('베이글')) {
      issues.channel_mismatch.push({ item, reason: `던킨도너츠 베이커리가 편의점(CVS)에 오분류됨` });
      continue;
    }
    if (brand.includes('마이요거트립')) {
      issues.channel_mismatch.push({ item, reason: `마이요거트립 로컬 디저트 카페 메뉴 (편의점 유통 제품 아님)` });
      continue;
    }
  }

  // 4. 구형 영양DB 중 현재 단종된 스낵/피자/소시지빵
  const obsoleteKeywords = [
    '닭가슴살스낵매운치즈맛',
    '닭가슴살단백질바석류',
    '맛있닭닭가슴살한끼소세지빵',
    '닭가슴살피자세판',
    '맛있닭닭가슴살한끼피자',
    '단백질 말차 쿠우키',
    '단백질 얼그레이 쿠우키',
    '단백질 초코 쿠우키',
    '단백질쿠키아몬드앤초코청크',
    '짐타운단백질쿠키',
    '단백질쿠키 화이트 더티초코',
    '프로뮨 단백질쌀쿠키',
    '딜라이틴 단백질 미니 쿠키',
    '단백질쿠키 더블황치즈',
    '닥터리브단백질쿠키',
    '리얼육포깡 스낵',
    '육포고추장',
    'LOTTE초단백질바',
    '매나테크 요거너츠',
    '크래미무침',
    '와일드크래미',
    '크래미H',
    '크래미치즈볼',
    '크래미F'
  ];

  for (const obs of obsoleteKeywords) {
    if (name.includes(obs) && (id.includes('-p1') || id.includes('-d2'))) {
      issues.discontinued.push({ item, reason: `과거 OEM 제조 품목으로 현재 단종/유통 중단 확인 (${obs})` });
      break;
    }
  }
}

console.log(`🚨 [검수 결과 요약]`);
console.log(`  1. 확실한 단종 / 판매종료 품목: ${issues.discontinued.length}건`);
console.log(`  2. B2B / 공장원료 / 시험데이터: ${issues.b2b_raw.length}건`);
console.log(`  3. 채널 오분류 및 로컬 매장 품목: ${issues.channel_mismatch.length}건`);
console.log(`  총 정리 대상: ${issues.discontinued.length + issues.b2b_raw.length + issues.channel_mismatch.length}건\n`);

console.log(`--- [1. 단종/판매종료 품목 샘플] ---`);
issues.discontinued.slice(0, 15).forEach(({ item, reason }) => {
  console.log(`  - [${item.channel}] [${item.brand}] ${item.name} (${reason})`);
});

console.log(`\n--- [2. B2B / 공장 원료] ---`);
issues.b2b_raw.forEach(item => {
  console.log(`  - [${item.channel}] [${item.brand}] ${item.name} (${item.menu_id})`);
});

console.log(`\n--- [3. 채널 오분류 및 카페/로컬 매장 품목] ---`);
issues.channel_mismatch.forEach(({ item, reason }) => {
  console.log(`  - [${item.channel}] [${item.brand}] ${item.name} (${reason})`);
});
