import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMenuQA } from '../js/qa.js';

test('1. 정상 메뉴 R1~R5 통과 테스트', () => {
  const goodMenu = {
    menu_id: 'cvs-cu-chicken-breast-100',
    channel: 'cvs',
    brand: 'CU',
    name: '훈제 닭가슴살 100g',
    category: '닭가슴살/육가공',
    price_krw: 2500,
    serving_g: 100,
    kcal: 110,
    protein_g: 23,
    carb_g: 1,
    sugar_g: 1,
    fat_g: 1.5,
    sat_fat_g: 0.5,
    sodium_mg: 420,
    source_type: 'T4',
    source_url: 'https://cu.bgfretail.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0'
  };

  const result = validateMenuQA(goodMenu);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('2. R2 질량 정합성 오류 (단백질이 총량 초과)', () => {
  const badMenu = {
    menu_id: 'cvs-gs25-impossible-50',
    channel: 'cvs',
    brand: 'GS25',
    name: '마법의 단백질',
    price_krw: 3000,
    serving_g: 50,
    kcal: 200,
    protein_g: 60, // 60g > 50g -> 불가능
    sodium_mg: 500,
    source_type: 'T2',
    source_url: 'http://test.com',
    verified_at: '2026-09-15',
    rule_version: 'v1.0'
  };

  const result = validateMenuQA(badMenu);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some(e => e.rule === 'R2'), true);
});

test('3. R5 출처 완결성 누락 오류', () => {
  const noProvenanceMenu = {
    menu_id: 'fr-subway-roast-chicken',
    price_krw: 7300,
    serving_g: 240,
    kcal: 300,
    protein_g: 29,
    sodium_mg: 590
    // missing source_type, verified_at, rule_version, source_url
  };

  const result = validateMenuQA(noProvenanceMenu);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some(e => e.rule === 'R5'), true);
});
