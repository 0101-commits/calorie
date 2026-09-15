import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePPR,
  getPPRGrade,
  computeCPD,
  getCPDGrade,
  computeNPI,
  getNPIGrade,
  computePW,
  evaluateMenu
} from '../js/score.js';

test('1. 훈제 닭가슴살 100g (Section 1.7 benchmark)', () => {
  const item = {
    name: '훈제 닭가슴살 100g',
    price_krw: 2500,
    kcal: 110,
    protein_g: 23,
    sugar_g: 1,
    sodium_mg: 420,
    sat_fat_g: 1,
    fiber_g: 0,
    protein_source: 'Q1',
    cooking: 'grilled',
    marketing_claim: true,
    serving_g: 100
  };

  const res = evaluateMenu(item);
  assert.equal(res.ppr, 9.2);
  assert.equal(res.ppr_grade, 'A');
  assert.equal(res.cpd, 20.9);
  assert.equal(res.cpd_grade, 'A');
  assert.equal(res.npi, 23.0);
  assert.equal(res.npi_grade, 'B');
  assert.equal(res.grade, 'A');
});

test('2. 닭가슴살 곡물 샐러드 215g (Section 1.7 benchmark)', () => {
  const item = {
    name: '닭가슴살 곡물 샐러드 215g',
    price_krw: 4900,
    kcal: 315,
    protein_g: 31,
    sugar_g: 6,
    sodium_mg: 760,
    sat_fat_g: 3,
    fiber_g: 6, // 식이섬유 보너스 +1
    protein_source: 'Q1',
    cooking: 'raw',
    marketing_claim: true,
    serving_g: 215
  };

  const res = evaluateMenu(item);
  assert.equal(res.ppr, 6.3);
  assert.equal(res.ppr_grade, 'B');
  assert.equal(res.cpd, 9.8);
  assert.equal(res.cpd_grade, 'B');
  assert.equal(res.npi, 32.0);
  assert.equal(res.npi_grade, 'A');
  assert.equal(res.grade, 'A');
  assert.equal(res.pw, 0);
  assert.equal(res.pw_tier, 'verified');
});

test('3. 프로틴 초코 음료 350mL (Section 1.7 benchmark)', () => {
  const item = {
    name: '프로틴 초코 음료 350mL',
    category: '유제품/음료',
    price_krw: 2800,
    kcal: 210,
    protein_g: 20,
    sugar_g: 22, // 당류 >= 20g -> 페널티 -0.10, 당류 > 단백질 -> W3(+20)
    sodium_mg: 180,
    sat_fat_g: 1.5,
    protein_source: 'Q1',
    cooking: 'raw',
    marketing_claim: true,
    claim_text: '프로틴',
    serving_g: 350
  };

  const res = evaluateMenu(item, { categoryMedianPpr: 7.5 });
  assert.equal(res.ppr, 7.1);
  assert.equal(res.ppr_grade, 'B');
  assert.equal(res.cpd, 9.5);
  assert.equal(res.cpd_grade, 'B');
  assert.equal(res.npi, 18.0);
  assert.equal(res.npi_grade, 'B');
  assert.equal(res.grade, 'B');
  assert.equal(res.pw, 30);
  assert.equal(res.pw_tier, 'conditional');
});

test('4. \'고단백\' 소시지 김밥 260g (Section 1.7 benchmark)', () => {
  const item = {
    name: '\'고단백\' 소시지 김밥 260g',
    price_krw: 3300,
    kcal: 520,
    protein_g: 17,
    sugar_g: 5,
    sodium_mg: 1180, // 나트륨 >= 1000 (-0.15), sodium/protein=69.4 (W4: +15)
    sat_fat_g: 7,
    protein_source: 'Q4', // 0.70
    cooking: 'mixed',
    marketing_claim: true,
    claim_text: '고단백',
    serving_g: 260
  };

  // NPI = 17 * 0.70 * (1 - 0.15) = 17 * 0.70 * 0.85 = 10.115 -> 10.1
  const res = evaluateMenu(item, { categoryMedianPpr: 6.0 });
  assert.equal(res.ppr, 5.2);
  assert.equal(res.ppr_grade, 'B');
  assert.equal(res.cpd, 3.3);
  assert.equal(res.cpd_grade, 'D');
  assert.equal(res.npi, 10.1);
  assert.equal(res.npi_grade, 'D');
  assert.equal(res.pw >= 50, true);
  assert.equal(res.pw_tier, 'washing');
  assert.equal(res.grade, 'D'); // 원래 C에서 워싱 강등으로 D
});

test('5. 더블 프로틴 치킨버거 세트 (Section 1.7 benchmark)', () => {
  const item = {
    name: '더블 프로틴 치킨버거 세트',
    price_krw: 8900,
    kcal: 980,
    protein_g: 38,
    sugar_g: 14,
    sodium_mg: 1840,
    sat_fat_g: 13,
    protein_source: 'Q3', // 0.80
    cooking: 'fried', // 튀김 (-0.15), 나트륨 (-0.15), 포화지방 (-0.15) -> 총 -0.45
    marketing_claim: true,
    claim_text: '더블 프로틴',
    serving_g: 450
  };

  // NPI = 38 * 0.80 * (1 - 0.45) = 38 * 0.80 * 0.55 = 16.72 -> 16.7
  const res = evaluateMenu(item, { categoryMedianPpr: 5.0 });
  assert.equal(res.ppr, 4.3);
  assert.equal(res.ppr_grade, 'C');
  assert.equal(res.cpd, 3.9);
  assert.equal(res.cpd_grade, 'D');
  assert.equal(res.npi, 16.7);
  assert.equal(res.npi_grade, 'C');
  assert.equal(res.pw >= 50, true);
  assert.equal(res.pw_tier, 'washing');
  assert.equal(res.grade, 'D'); // 워싱 강등 반영
});

test('6. 참치마요 삼각김밥 (Section 1.7 benchmark)', () => {
  const item = {
    name: '참치마요 삼각김밥',
    price_krw: 1400,
    kcal: 230,
    protein_g: 5,
    sugar_g: 2,
    sodium_mg: 380,
    sat_fat_g: 1,
    protein_source: 'Q1',
    cooking: 'mixed',
    marketing_claim: false,
    serving_g: 110
  };

  const res = evaluateMenu(item);
  assert.equal(res.ppr, 3.6);
  assert.equal(res.ppr_grade, 'C');
  assert.equal(res.cpd, 2.2);
  assert.equal(res.cpd_grade, 'D');
  assert.equal(res.npi, 5.0);
  assert.equal(res.npi_grade, 'D');
  assert.equal(res.pw, null);
  assert.equal(res.grade, 'C');
});
