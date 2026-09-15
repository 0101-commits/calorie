import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const seedPath = path.join(rootDir, 'data/seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

console.log(`Original seed items count: ${seed.length}`);

// 1. 단종/오분류/테스트/구형중복 156개 레거시 항목 필터링
const keptModern = seed.filter(d => !d.menu_id.match(/^[a-z]+-[dp][0-9a-zA-Z]+-\d+/));
console.log(`Kept modern verified items: ${keptModern.length}`);

// 2. 레거시 중 실제 현재 시중 유통 중인 인기 핵심 8개 상품 표준 슬러그로 신규 등록
const verifiedAdditions = [
  {
    menu_id: 'cvs-orion-dryou-pro-bar-crunch-70',
    channel: 'cvs',
    brand: '오리온',
    name: '오리온 닥터유 PRO 단백질바 크런치 70g',
    category: '간식/스낵',
    price_krw: 2500,
    serving_g: 70,
    kcal: 287,
    protein_g: 24,
    carb_g: 26,
    sugar_g: 10,
    fat_g: 11,
    sat_fat_g: 4.8,
    sodium_mg: 190,
    protein_source: 'Q2',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '단백질 24g 고함량',
    barcode: '8801117796013',
    source_type: 'T2',
    source_url: 'https://www.orionworld.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search4.kakaocdn.net/argon/320x320_85_c/5gTtKdk9DT3'
  },
  {
    menu_id: 'cvs-dryou-pro-drink-24g-banana-250',
    channel: 'cvs',
    brand: '오리온',
    name: '닥터유 PRO 단백질 드링크 바나나 250mL',
    category: '유제품/음료',
    price_krw: 2900,
    serving_g: 250,
    kcal: 156,
    protein_g: 24,
    carb_g: 13,
    sugar_g: 1.5,
    fat_g: 0.9,
    sat_fat_g: 0.5,
    sodium_mg: 120,
    protein_source: 'Q1',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '단백질 24g 고함량',
    barcode: '8801117798024',
    source_type: 'T2',
    source_url: 'https://www.orionworld.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search1.kakaocdn.net/argon/320x320_85_c/7nqOOai4ky3'
  },
  {
    menu_id: 'cvs-ildong-himmune-active-banana-250',
    channel: 'cvs',
    brand: '일동후디스',
    name: '일동후디스 하이뮨 프로틴 밸런스 액티브 바나나 250mL',
    category: '유제품/음료',
    price_krw: 2900,
    serving_g: 250,
    kcal: 130,
    protein_g: 20,
    carb_g: 10,
    sugar_g: 0.9,
    fat_g: 1.2,
    sat_fat_g: 0.7,
    sodium_mg: 130,
    protein_source: 'Q1',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '단백질 20g 밸런스 액티브',
    barcode: '8801157140388',
    source_type: 'T2',
    source_url: 'https://www.ildongfoodis.co.kr',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search1.kakaocdn.net/argon/320x320_85_c/IW7n42DI6jN'
  },
  {
    menu_id: 'cvs-ildong-himmune-active-deepchoco-250',
    channel: 'cvs',
    brand: '일동후디스',
    name: '일동후디스 하이뮨 프로틴 밸런스 액티브 딥초코 250mL',
    category: '유제품/음료',
    price_krw: 2900,
    serving_g: 250,
    kcal: 130,
    protein_g: 20,
    carb_g: 9,
    sugar_g: 0.8,
    fat_g: 1.5,
    sat_fat_g: 0.8,
    sodium_mg: 125,
    protein_source: 'Q1',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '단백질 20g 딥초코',
    barcode: '8801157140395',
    source_type: 'T2',
    source_url: 'https://www.ildongfoodis.co.kr',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search2.kakaocdn.net/argon/320x320_85_c/JtHrpCtfs2K'
  },
  {
    menu_id: 'cvs-takefit-max-grain-250',
    channel: 'cvs',
    brand: '남양유업',
    name: '남양 테이크핏 맥스 호박씨(고소한맛) 250mL',
    category: '유제품/음료',
    price_krw: 2900,
    serving_g: 250,
    kcal: 105,
    protein_g: 21,
    carb_g: 3,
    sugar_g: 0.5,
    fat_g: 1.1,
    sat_fat_g: 0.4,
    sodium_mg: 120,
    protein_source: 'Q1',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '단백질 21g 저당',
    barcode: '8801069415849',
    source_type: 'T2',
    source_url: 'https://company.namyangi.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search3.kakaocdn.net/argon/320x320_85_c/BycNyFopnrU'
  },
  {
    menu_id: 'cvs-harim-sausage-buldak-100',
    channel: 'cvs',
    brand: '하림',
    name: '하림 닭가슴살 소시지 불닭 100g',
    category: '육가공/가공육',
    price_krw: 2500,
    serving_g: 100,
    kcal: 145,
    protein_g: 17,
    carb_g: 5,
    sugar_g: 2,
    fat_g: 6,
    sat_fat_g: 1.5,
    sodium_mg: 480,
    protein_source: 'Q1',
    cooking: 'cooked',
    marketing_claim: 1,
    claim_text: '국내산 닭가슴살 100% 매콤불닭',
    barcode: '8801123285907',
    source_type: 'T2',
    source_url: 'https://www.harimmkt.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search4.kakaocdn.net/argon/320x320_85_c/6CToIsprX09'
  },
  {
    menu_id: 'cvs-maeil-selex-protein-nuts-bar-50',
    channel: 'cvs',
    brand: '매일유업',
    name: '매일유업 셀렉스 코어프로틴 너츠바 50g',
    category: '간식/스낵',
    price_krw: 1800,
    serving_g: 50,
    kcal: 235,
    protein_g: 12,
    carb_g: 18,
    sugar_g: 8,
    fat_g: 13,
    sat_fat_g: 3.5,
    sodium_mg: 95,
    protein_source: 'Q2',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '단백질 12g 코어프로틴',
    barcode: '8801157140999',
    source_type: 'T2',
    source_url: 'https://www.selex.co.kr',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search3.kakaocdn.net/argon/320x320_85_c/LaqBiUNtXXU'
  },
  {
    menu_id: 'cvs-lotte-easyprotein-bar-50',
    channel: 'cvs',
    brand: '롯데웰푸드',
    name: '롯데 이지프로틴 고단백질바 50g',
    category: '간식/스낵',
    price_krw: 1800,
    serving_g: 50,
    kcal: 195,
    protein_g: 12,
    carb_g: 22,
    sugar_g: 6,
    fat_g: 7,
    sat_fat_g: 2.2,
    sodium_mg: 85,
    protein_source: 'Q2',
    cooking: 'raw',
    marketing_claim: 1,
    claim_text: '고단백 12g 이지프로틴',
    barcode: '8801062886011',
    source_type: 'T2',
    source_url: 'https://www.lottewellfood.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0',
    image_url: 'https://search4.kakaocdn.net/argon/320x320_85_c/KRaelBav0d0'
  }
];

const finalSeed = [...keptModern, ...verifiedAdditions];

console.log(`Final verified active seed items count: ${finalSeed.length}`);

// Channel breakdown
const channelCounts = {};
finalSeed.forEach(d => {
  channelCounts[d.channel] = (channelCounts[d.channel] || 0) + 1;
});
console.log('Final channel breakdown:', channelCounts);

fs.writeFileSync(seedPath, JSON.stringify(finalSeed, null, 2), 'utf-8');
console.log('Successfully updated data/seed.json!');
