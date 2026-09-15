import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBestCombos } from '../js/combo.js';

test('1. 편의점 1끼 조합 추천 기본 동작 및 제약 조건 테스트', () => {
  const items = [
    {
      menu_id: '1',
      name: '닭가슴살 샐러드',
      category: '샐러드',
      price_krw: 4500,
      kcal: 220,
      protein_g: 25,
      carb_g: 15,
      fat_g: 5,
      sodium_mg: 450,
      sugar_g: 4
    },
    {
      menu_id: '2',
      name: '훈제 닭가슴살',
      category: '닭가슴살/육가공',
      price_krw: 2500,
      kcal: 110,
      protein_g: 23,
      carb_g: 1,
      fat_g: 2,
      sodium_mg: 400,
      sugar_g: 0
    },
    {
      menu_id: '3',
      name: '무가당 두유',
      category: '유제품/음료',
      price_krw: 1200,
      kcal: 95,
      protein_g: 9,
      carb_g: 4,
      fat_g: 4,
      sodium_mg: 120,
      sugar_g: 1
    },
    {
      menu_id: '4',
      name: '참치마요 삼각김밥',
      category: '삼각김밥/주먹밥',
      price_krw: 1400,
      kcal: 210,
      protein_g: 5,
      carb_g: 35,
      fat_g: 5,
      sodium_mg: 380,
      sugar_g: 2
    },
    {
      menu_id: '5',
      name: '그릭요거트',
      category: '유제품/음료',
      price_krw: 2300,
      kcal: 120,
      protein_g: 10,
      carb_g: 6,
      fat_g: 3,
      sodium_mg: 60,
      sugar_g: 3
    }
  ];

  const target = {
    kcal: 500,
    P: 40,
    C: 50,
    F: 15,
    Na: 700,
    Sugar: 15
  };

  const combos = findBestCombos(items, target, {
    budget: 8500,
    goal: 'diet',
    topCount: 3
  });

  assert.equal(combos.length > 0, true);
  for (const c of combos) {
    assert.equal(c.aggregate.price_krw <= 8500, true);
    assert.equal(c.aggregate.kcal >= target.kcal * 0.7, true);
    assert.equal(c.aggregate.kcal <= target.kcal * 1.3, true);
    assert.equal(typeof c.reason, 'string');
  }
});
