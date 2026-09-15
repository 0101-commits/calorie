import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBMR,
  computeTDEE,
  computeDailyTargets,
  computeMealTarget,
  computeFitScore,
  generateReasonSentence
} from '../js/calc.js';

test('1. Section 2.2 Mifflin-St Jeor & TDEE benchmark', () => {
  const profile = {
    gender: 'male',
    age: 32,
    height_cm: 176,
    weight_kg: 78,
    activity_level: 'moderate',
    goal: 'diet'
  };

  const bmr = computeBMR(profile);
  assert.equal(bmr, 1725); // 780 + 1100 - 160 + 5 = 1725

  const tdee = computeTDEE(bmr, profile.activity_level);
  assert.equal(tdee, 2674); // 1725 * 1.55 = 2673.75 -> 2674
});

test('2. Section 2.3 다이어트 1일 및 점심 타깃 benchmark', () => {
  const profile = {
    gender: 'male',
    age: 32,
    height_cm: 176,
    weight_kg: 78,
    activity_level: 'moderate',
    goal: 'diet'
  };

  const daily = computeDailyTargets(profile);
  assert.equal(daily.kcal_day, 2139); // 2674 * 0.8 = 2139.2
  assert.equal(daily.P_day, 156);     // 78 * 2.0 = 156
  assert.equal(daily.F_day, 59);      // 2139 * 0.25 / 9 = 59.4 -> 59
  assert.equal(daily.C_day, 246);     // (2139 - 624 - 531) / 4 = 246

  const meal = computeMealTarget(daily, 'lunch');
  assert.equal(meal.kcal, 749);       // 2139 * 0.35 = 748.65 -> 749
  assert.equal(meal.P, 45);          // 156 / 3 = 52 -> clamped to 45
  assert.equal(meal.F, 21);          // 59 * 0.35 = 20.65 -> 21
  assert.equal(meal.C, 86);          // 246 * 0.35 = 86.1 -> 86
  assert.equal(meal.Na, 700);        // 2000 * 0.35 = 700
  assert.equal(meal.Sugar, 18);      // 50 * 0.35 = 17.5 -> 18
});

test('3. Section 2.4 Fit Score & Reason Sentence test', () => {
  const target = {
    kcal: 749,
    P: 45,
    C: 86,
    F: 21,
    Na: 700,
    Sugar: 18
  };

  const highProteinMeal = {
    kcal: 720,
    protein_g: 43,
    carb_g: 80,
    fat_g: 19,
    sodium_mg: 680,
    sugar_g: 12
  };

  const score = computeFitScore(highProteinMeal, target, 'diet');
  assert.equal(score >= 85, true);

  const reason = generateReasonSentence(highProteinMeal, target, score, 'diet');
  assert.equal(reason.includes('단백질'), true);
  assert.equal(reason.includes('열량'), true);
});
