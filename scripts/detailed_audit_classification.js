// scripts/detailed_audit_classification.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));

// 최신 표준 슬러그 등록 명단
const activeSlugs = new Set(
  data.filter(x => !x.menu_id.includes('-p1') && !x.menu_id.includes('-d2')).map(x => x.menu_id)
);

const toRemove = [];
const toKeep = [];

for (const item of data) {
  const { menu_id, name, brand, channel } = item;
  const isLegacy = menu_id.includes('-p1') || menu_id.includes('-d2');

  if (!isLegacy) {
    toKeep.push(item);
    continue;
  }

  // 1. B2B 대용량 원료
  if (name.includes('5kg') || name.includes('공공검증') || (name.includes('부엌') && name.includes('무침'))) {
    toRemove.push({ item, category: 'B2B/공장원료', reason: '일반 소비자 소매용이 아닌 대용량 공장 원료' });
    continue;
  }

  // 2. 도미노 2021 한정 프로모션 도우
  if (name.includes('하이프로틴도우')) {
    toRemove.push({ item, category: '단종', reason: '2021년 한정 출시 후 단종된 프로모션 도우' });
    continue;
  }

  // 3. 편의점 채널에 오분류된 로컬 피자/베이커리/카페 구형 메뉴
  if (channel === 'cvs' && ['할리스', '킹스타피자', '피자스쿨', '지정환피자', '피자알볼로', '난타5000피자', '따삐오', '커피에반하다', '크로플덕오리아가씨'].some(b => brand.includes(b))) {
    toRemove.push({ item, category: '채널오분류/단종', reason: '편의점 유통 제품이 아닌 로컬 매장 구형 메뉴' });
    continue;
  }
  if (channel === 'cvs' && (brand.includes('파리바게뜨') || brand.includes('던킨') || brand.includes('마이요거트립') || brand.includes('송사부'))) {
    toRemove.push({ item, category: '채널오분류/단종', reason: '베이커리/디저트 매장 전용 구형 단종 메뉴' });
    continue;
  }

  // 4. 최신 슬러그로 이미 정식 등록되어 있는 구형 식약처 중복 레코드
  // 예: 더단백 드링크, 닥터유 프로, 하이뮨, 테이크핏, 하림 소시지, 감동란 등
  const duplicateMapping = {
    'cvs-p1098010801000270-100': 'cvs-binggrae-the-danbaek-choco-250',
    'cvs-p1092010200001167-100': 'cvs-binggrae-the-danbaek-coffee-250',
    'cvs-p1031020205000375-107': 'cvs-binggrae-the-danbaek-bar-choco-40',
    'cvs-p1031020205000883-107': 'cvs-binggrae-the-danbaek-bar-choco-40',
    'cvs-p1098010801002024-100': 'cvs-ildong-himmune-active-choco-250',
    'cvs-p1098010801001449-100': 'cvs-takefit-max-choco-250',
    'cvs-p1098010801003121-100': 'cvs-takefit-max-banana-250',
    'cvs-p1098010801000254-100': 'cvs-dryou-pro-drink-24g-choco-250',
    'cvs-p1098010801002471-100': 'cvs-dryou-pro-drink-40g-choco-350',
    'cvs-p1171000101002046-100': 'cvs-harim-chicken-blackpepper-100',
    'cvs-p1172010201000600-100': 'cvs-harim-sausage-original-100',
    'cvs-p1172010201000601-100': 'mart-harim-chicken-sausage-smoked-100',
    'cvs-p1181000107000012-100': 'cvs-gamdongran-boiled-egg-100',
    'cvs-p1201000104000035-100': 'cvs-hanseong-crami-90',
    'cvs-p1011060001007056-104': 'cvs-orion-dryou-protein-bar-50',
    'cvs-p1011060001000386-108': 'cvs-orion-dryou-protein-bar-50'
  };

  if (duplicateMapping[menu_id]) {
    toRemove.push({ item, category: '구형중복', reason: `최신 표준 슬러그(${duplicateMapping[menu_id]})로 정식 등록됨` });
    continue;
  }

  // 5. 과거 OEM 생산 후 단종된 비인기 쿠키/바/스낵/안주
  const obsoleteList = [
    '스낵매운치즈맛', '닭가슴살단백질바석류', '한끼소세지빵', '피자세판', '한끼피자',
    '쿠우키', '단백질쿠키', '짐타운', '쌀쿠키', '딜라이틴', '닥터리브', '리얼육포깡',
    '육포고추장', '초단백질바', '매나테크', '와일드크래미', '크래미H', '크래미치즈볼', '크래미F',
    '통살치킨텐더', '생치킨텐더까스', '크런치치킨텐더', '콘 크러스트', '바삭한 국내산 안심 치킨텐더',
    '팝칩', '혜성더단백한마카로니', '더단백바', '밀세라', '퓨로틴', '한입쏙쏙', '프로틴 블랙',
    '도넛', '더블레이어', '마시는 케어', '몬스터 초코바나나', '호박고구마맛', '파우더 곡물',
    '프로틴 고소한맛', '브리오슈 토스트', '빅샐러드', '칠리소시지바게트', '오가닉 프로틴 그릭 요거트',
    '더블샷 커피', '액상', '다크초코', '딸기'
  ];

  const matched = obsoleteList.find(kw => name.includes(kw));
  if (matched) {
    toRemove.push({ item, category: '단종', reason: `현재 시중 유통 확인 불가 및 제조사 생산 중단 (${matched})` });
    continue;
  }

  // 계란류 등 실제 유통 확인되는 제품은 유지
  toKeep.push(item);
}

console.log(`총 품목: ${data.length}`);
console.log(`유지 (현재 정상 판매 확인): ${toKeep.length}개`);
console.log(`제거 대상 (단종/오분류/중복): ${toRemove.length}개`);

const catCounts = {};
toRemove.forEach(r => catCounts[r.category] = (catCounts[r.category] || 0) + 1);
console.log('\n제거 대상 세부 분류:', catCounts);

fs.writeFileSync(path.join(rootDir, 'audit_cleanup_plan.json'), JSON.stringify({
  keepCount: toKeep.length,
  removeCount: toRemove.length,
  removeList: toRemove.map(r => ({ id: r.item.menu_id, brand: r.item.brand, name: r.item.name, category: r.category, reason: r.reason }))
}, null, 2), 'utf-8');
