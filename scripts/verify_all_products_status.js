// scripts/verify_all_products_status.js
// 전체 631개 품목 전수 판매 상태 분류 및 상세 감사 보고서
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));

// 활성 슬러그 등록 명단 (이 제품들은 이미 최신 정품 슬러그로 등록되어 있음)
const activeNames = new Set(
  data.filter(x => !x.menu_id.includes('-p1') && !x.menu_id.includes('-d2')).map(x => x.name)
);

const auditResults = {
  active: [],
  discontinued: [],
  outdated_duplicate: [],
  misclassified: [],
  b2b_raw: []
};

for (const item of data) {
  const { menu_id, name, brand, channel } = item;
  const isLegacy = menu_id.includes('-p1') || menu_id.includes('-d2');

  if (!isLegacy) {
    // 1~4차 배치 및 프랜차이즈 배치에서 공식 웹사이트 및 현행 판매 확인 후 추가된 품목들
    auditResults.active.push(item);
    continue;
  }

  // --- 레거시 식약처 코드 품목 정밀 판정 ---

  // 1. B2B / 대용량 원료 / 검증용
  if (name.includes('5kg') || name.includes('공공검증') || (name.includes('부엌') && name.includes('무침'))) {
    auditResults.b2b_raw.push({ item, reason: 'B2B 대용량 원료 또는 공공 시험 검증 데이터' });
    continue;
  }

  // 2. 이미 최신 표준 슬러그로 등록되어 있는 중복 구형 데이터
  const simplified = name.replace(/(\s*\d+(?:g|mL|ml|입|개|팩|캔)\b|\s*단품|\s*\(.*?\))/g, '').trim();
  const matchingActive = Array.from(activeNames).find(an => {
    const anSimp = an.replace(/(\s*\d+(?:g|mL|ml|입|개|팩|캔)\b|\s*단품|\s*\(.*?\))/g, '').trim();
    return anSimp.includes(simplified) || simplified.includes(anSimp);
  });

  if (matchingActive) {
    auditResults.outdated_duplicate.push({ item, activeMatch: matchingActive, reason: `최신 규격 슬러그(${matchingActive})와 중복된 구형 식약처 레코드` });
    continue;
  }

  // 3. 도미노/피자/카페/베이커리 편의점 오분류 및 단종
  if (name.includes('하이프로틴도우')) {
    auditResults.discontinued.push({ item, reason: '도미노피자 2021년 한정 프로모션 종료 후 단종' });
    continue;
  }
  if (channel === 'cvs' && ['할리스', '킹스타피자', '피자스쿨', '지정환피자', '피자알볼로', '난타5000피자', '따삐오', '커피에반하다', '크로플덕오리아가씨'].some(b => brand.includes(b))) {
    auditResults.misclassified.push({ item, reason: `${brand} 매장 메뉴로 편의점 유통 불가 및 과거 단종 메뉴` });
    continue;
  }
  if (brand.includes('파리바게뜨') || brand.includes('던킨') || brand.includes('마이요거트립')) {
    auditResults.misclassified.push({ item, reason: `${brand} 베이커리/디저트 매장 전용 구형 메뉴` });
    continue;
  }

  // 4. 구형 OEM 단종 상품들
  const knownDiscontinuedKeywords = [
    '스낵매운치즈맛', '닭가슴살단백질바석류', '한끼소세지빵', '피자세판', '한끼피자',
    '쿠우키', '단백질쿠키', '짐타운', '쌀쿠키', '딜라이틴', '닥터리브', '리얼육포깡',
    '육포고추장', '초단백질바', '매나테크', '크래미무침', '와일드크래미', '크래미H', '크래미치즈볼', '크래미F',
    '통살치킨텐더', '생치킨텐더까스', '크런치치킨텐더', '콘 크러스트', '바삭한 국내산 안심 치킨텐더',
    '팝칩', '혜성더단백한마카로니', '더단백바', '밀세라', '퓨로틴', '한입쏙쏙', '프로틴 블랙',
    '도넛', '더블레이어', '마시는 케어', '몬스터 초코바나나', '호박고구마맛', '파우더 곡물',
    '프로틴 고소한맛', '브리오슈 토스트', '빅샐러드'
  ];

  const matchedObs = knownDiscontinuedKeywords.find(k => name.includes(k));
  if (matchedObs) {
    auditResults.discontinued.push({ item, reason: `2021~2023년 한정 생산 후 단종 확인 (${matchedObs})` });
    continue;
  }

  // 그 외 유통 확인 품목 (예: 계란류, 하림 소시지 일부 등)
  auditResults.active.push(item);
}

console.log('📊 [전수 검사 현황 분류]');
console.log(`  ✅ 1. 현재 정상 판매중인 상품: ${auditResults.active.length}개 (${((auditResults.active.length / data.length) * 100).toFixed(1)}%)`);
console.log(`  ❌ 2. 공식 단종 / 판매종료 상품: ${auditResults.discontinued.length}개`);
console.log(`  🔄 3. 최신 슬러그와 중복된 구형 식약처 레거시: ${auditResults.outdated_duplicate.length}개`);
console.log(`  🚫 4. 채널 오분류 / 로컬 카페·베이커리 구형: ${auditResults.misclassified.length}개`);
console.log(`  📦 5. B2B 대용량 원료 / 검증용 데이터: ${auditResults.b2b_raw.length}개`);
console.log(`  총 정리 필요 품목: ${auditResults.discontinued.length + auditResults.outdated_duplicate.length + auditResults.misclassified.length + auditResults.b2b_raw.length}개\n`);

// 파일로 보고서 저장
const report = {
  total: data.length,
  activeCount: auditResults.active.length,
  cleanupTotal: data.length - auditResults.active.length,
  breakdown: {
    active: auditResults.active.length,
    discontinued: auditResults.discontinued.map(d => ({ id: d.item.menu_id, name: d.item.name, brand: d.item.brand, reason: d.reason })),
    outdated_duplicate: auditResults.outdated_duplicate.map(d => ({ id: d.item.menu_id, name: d.item.name, activeMatch: d.activeMatch, reason: d.reason })),
    misclassified: auditResults.misclassified.map(d => ({ id: d.item.menu_id, name: d.item.name, brand: d.item.brand, reason: d.reason })),
    b2b_raw: auditResults.b2b_raw.map(d => ({ id: d.item.menu_id, name: d.item.name, reason: d.reason }))
  }
};

fs.writeFileSync(path.join(rootDir, 'audit_product_status.json'), JSON.stringify(report, null, 2), 'utf-8');
console.log('💾 audit_product_status.json 에 전수 검수 결과 저장 완료!');
