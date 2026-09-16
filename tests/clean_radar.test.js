import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIngredients } from '../js/clean_radar.js';

test('1. 알룰로스 및 닭가슴살 클린 식품 분석 테스트', () => {
  const rawText = '닭가슴살(국내산) 85%, 정제수, 알룰로스, 천일염, 스테비아, 올리브유, 비타민C';
  const report = analyzeIngredients(rawText);

  assert.ok(report.cleanScore >= 80, `CleanScore should be >= 80, got ${report.cleanScore}`);
  assert.equal(report.stats.badCount, 0);
  assert.ok(report.stats.goodCount >= 3);
  assert.equal(report.teardowns.sweetener.status, 'good');
  assert.equal(report.teardowns.protein.status, 'good');
  assert.equal(report.teardowns.fat.status, 'good');
  assert.equal(report.teardowns.additive.status, 'good');
});

test('2. 액상과당, 말티톨, 아질산나트륨 워싱 제품 분석 테스트', () => {
  const rawText = '분쇄가공육 60%, 액상과당, 정제설탕, 말티톨, 쇼트닝, 아질산나트륨, 식용색소적색제40호';
  const report = analyzeIngredients(rawText);

  assert.ok(report.cleanScore < 50, `CleanScore should be < 50, got ${report.cleanScore}`);
  assert.ok(report.stats.badCount >= 3, `Bad count should be >= 3, got ${report.stats.badCount}`);
  assert.equal(report.teardowns.sweetener.status, 'bad');
  assert.equal(report.teardowns.fat.status, 'bad');
  assert.equal(report.teardowns.additive.status, 'bad');
});

test('3. 원재료 텍스트 없는 폴백 제품 추론 테스트', () => {
  const cleanProduct = {
    name: '더단백 드링크 초코',
    category: '유제품/음료',
    sugar_g: 0.8,
    marketing_claim: 1,
    protein_source: 'Q1',
    pw_tier: 'verified',
    penalties: []
  };

  const report = analyzeIngredients('', cleanProduct);
  assert.ok(report.cleanScore >= 70);
  assert.equal(report.teardowns.sweetener.status, 'good');
});
