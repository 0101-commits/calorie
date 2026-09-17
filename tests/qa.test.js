import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMenuQA, findCopiedIngredientGroups } from '../js/qa.js';

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

test('4. 브랜드가 다른데 원재료 문자열이 같으면 잡아낸다 (G9)', () => {
  // 서로 다른 브랜드의 제품이 글자 하나까지 같은 원재료를 가질 수는 없다.
  // 2026-09-17 실측에서 동원참치의 원재료가 닭가슴살이었고 87건이 한 문자열을 공유했다.
  const copied = '닭가슴살(국내산 96%), 정제수, 천일염(국내산), 마늘분말, 양파분말, 비타민C, 포도당';
  const items = [
    { menu_id: 'a', brand: '하림', brand_code: 'harim', name: '닭가슴살 오리지널', ingredients_raw: copied },
    { menu_id: 'b', brand: '동원', brand_code: 'dongwon', name: '동원참치 마일드', ingredients_raw: copied },
    { menu_id: 'c', brand: '빙그레', brand_code: 'binggrae', name: '더단백 초코', ingredients_raw: '정제수, 원유(국산), 분리유청단백분말(WPI), D-알룰로스' }
  ];

  const groups = findCopiedIngredientGroups(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.deepEqual(groups[0].brands.sort(), ['dongwon', 'harim']);

  // 같은 브랜드의 맛 변형은 정상이다 — 잡으면 안 된다.
  const sameBrand = [
    { menu_id: 'd', brand: '하림', brand_code: 'harim', name: '닭가슴살 오리지널', ingredients_raw: copied },
    { menu_id: 'e', brand: '하림', brand_code: 'harim', name: '닭가슴살 훈제', ingredients_raw: copied }
  ];
  assert.equal(findCopiedIngredientGroups(sameBrand).length, 0);

  // 짧은 문자열은 우연히 같을 수 있으므로 세지 않는다.
  const short = [
    { menu_id: 'f', brand: 'A', brand_code: 'a', name: 'x', ingredients_raw: '정제수, 식염' },
    { menu_id: 'g', brand: 'B', brand_code: 'b', name: 'y', ingredients_raw: '정제수, 식염' }
  ];
  assert.equal(findCopiedIngredientGroups(short).length, 0);
});
