// 운동 타이밍 기능 게이트 (기획서 2026-09-17)
// 지키는 것: ① 룰 파일이 타이밍 수치의 단일 원천 ② 운동 후 하한 20g ③ 휴식일 하루 총량 하한
//            ④ 흡수 속도는 원재료로만 판정 ⑤ 미확보가 점수를 바꾸지 않음 ⑥ 조합 예외는 운동 후에만
//            ⑦ 타이밍 문구에 효능 단정 어휘 없음

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  TIMING_PROFILES, TIMING_FIT_WEIGHTS, GOAL_PROFILES,
  applyTimingTarget, computeDailyTargets, computeMealTarget,
  computeFitScore, generateReasonSentence
} from '../js/calc.js';
import { analyzeIngredients, classifyAbsorption, absorptionRank } from '../js/clean_radar.js';
import { findBestCombos } from '../js/combo.js';

const rules = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'rules', 'rule_v1.1.json'), 'utf-8'));
const ruleTiming = rules.recommendation.timing;

test('1. 룰 파일과 코드 상수의 타이밍 값이 같다 (G5)', () => {
  for (const key of ['pre', 'post', 'rest']) {
    assert.deepEqual(ruleTiming[key], TIMING_PROFILES[key], `timing.${key} 불일치`);
  }
  assert.deepEqual(ruleTiming.fit_weights, TIMING_FIT_WEIGHTS);
});

test('2. 타깃 보정이 룰 값대로 나오고 운동 후 권장 구간이 함께 실린다', () => {
  const base = { kcal: 500, P: 30, C: 60, F: 15, Na: 700, Sugar: 18, meal: 'lunch', ratio: 0.35 };

  for (const kg of [54, 78]) {
    const post = applyTimingTarget(base, 'post', kg);
    // 끼니 타깃(30g)이 구간 안이면 그 값을 쓴다 — 타이밍이 끼니 타깃을 깎지 않는다.
    assert.equal(post.P, 30, `${kg}kg 운동 후 단백질`);
    assert.deepEqual(post.P_band, [TIMING_PROFILES.post.protein_min, TIMING_PROFILES.post.protein_max]);
    assert.equal(post.C, Math.round(TIMING_PROFILES.post.carb_per_kg * kg));
  }

  // 끼니 타깃이 구간 위(45g)면 상한 40g 으로, 아래(10g)면 하한 20g 으로 민다.
  assert.equal(applyTimingTarget({ ...base, P: 45 }, 'post', 78).P, 40);
  assert.equal(applyTimingTarget({ ...base, P: 10 }, 'post', 54).P, 20);

  const pre54 = applyTimingTarget({ ...base, P: 10 }, 'pre', 54);
  assert.equal(pre54.P, TIMING_PROFILES.pre.protein_min); // 13.5 → 하한 15
  assert.equal(pre54.C, 41);                              // 0.75 × 54 = 40.5 → 41
  assert.equal(applyTimingTarget(base, 'pre', 78).C, 59); // 0.75 × 78 = 58.5 → 59

  // 휴식일은 1끼 벡터를 바꾸지 않는다.
  const rest = applyTimingTarget(base, 'rest', 78);
  assert.equal(rest.P, base.P);
  assert.equal(rest.C, base.C);
  assert.equal(rest.P_band, undefined);
});

test('2-b. 운동 후 채점은 점이 아니라 구간이다 — 구간 안은 동점, 밖은 감점', () => {
  const target = applyTimingTarget({ kcal: 900, P: 45, C: 100, F: 30, Na: 800, Sugar: 25 }, 'post', 78);
  const item = p => ({ kcal: 900, protein_g: p, carb_g: target.C, fat_g: 20, sodium_mg: 500, sugar_g: 10 });
  const fit = p => computeFitScore(item(p), target, 'lean_mass', 'post');

  // 구간(20~40g) 안은 전부 같은 점수 — 40g 제품이 20g 제품보다 불리하면 안 된다.
  assert.equal(fit(20), fit(40));
  assert.equal(fit(25), fit(40));
  // 구간 밖은 확실히 낮다. (수정 전에는 40g 과 10g 이 동점이었다.)
  assert.ok(fit(40) > fit(15), '구간 안이 구간 밖보다 높아야 한다');
  assert.ok(fit(15) > fit(5), '많이 모자랄수록 더 낮아야 한다');
  assert.ok(fit(40) > fit(50), '구간을 크게 넘겨도 감점은 있다');
});

test('3. 휴식일 하한이 실제로 단백질 총량을 끌어올린다', () => {
  const profile = {
    gender: 'male', age: 32, height_cm: 176, weight_kg: 78,
    activity_level: 'moderate', goal: 'diet'
  };
  const floor = Math.round(78 * TIMING_PROFILES.rest.protein_floor_per_kg);

  // 현재 목적 계수는 모두 1.4 g/kg 위라 하한이 놀고 있다. 하한 자체가 동작하는지 보려면
  // 목적 계수를 하한 아래로 내려 봐야 한다(configureFromRules 도 이 객체를 덮어쓴다).
  const original = GOAL_PROFILES.diet.protein_per_kg;
  try {
    GOAL_PROFILES.diet.protein_per_kg = 1.0;
    const normal = computeDailyTargets(profile);
    const rest = computeDailyTargets({ ...profile, timing: 'rest' });
    assert.equal(normal.P_day, 78);   // 하한이 없으면 78g
    assert.equal(rest.P_day, floor);  // 휴식일에는 1.4 g/kg 로 올라온다
    assert.ok(rest.P_day > normal.P_day);
  } finally {
    GOAL_PROFILES.diet.protein_per_kg = original;
  }

  // 지금 룰 값에서는 세 목적 모두 하한 위에 있어야 한다.
  for (const goal of ['diet', 'lean_mass', 'bulk_up']) {
    const rest = computeDailyTargets({ ...profile, goal, timing: 'rest' });
    assert.ok(rest.P_day >= floor, `${goal}: 휴식일 단백질 ${rest.P_day}g < 하한 ${floor}g`);
  }
});

test('4. 흡수 속도는 가장 앞에 적힌 단백질 원천 하나로만 정한다', () => {
  const classify = raw => classifyAbsorption(analyzeIngredients(raw).tokens);

  const whey = classify('정제수, 분리유청단백분말(WPI), 코코아분말');
  assert.equal(whey.absorption, 'fast');
  assert.deepEqual(whey.absorption_basis, ['분리유청단백 (WPI)']);

  assert.equal(classify('국내산닭가슴살, 정제수, 정제소금').absorption, 'medium');
  assert.equal(classify('우유, 미셀라카제인, 천연향료').absorption, 'slow');

  // 표기 순서가 함량 순이므로 앞선 원료가 이긴다 — 뒤에 붙은 미량 결착제가 원육 판정을 뒤집으면 안 된다.
  // (이 규칙이 없을 때 닭가슴살 제품 13건이 '느린 흡수'로 잘못 분류됐다.)
  const chicken = classify('닭가슴살(국내산), 정제수, 분리대두단백, 정제소금');
  assert.equal(chicken.absorption, 'medium');
  assert.deepEqual(chicken.absorption_basis, ['닭가슴살 원육']);

  const soyFirst = classify('분리대두단백(ISP), 분리유청단백분말(WPI), 코코아분말');
  assert.equal(soyFirst.absorption, 'slow');

  // '대두단백' 단독 표기도 자연대두가 아니라 분리·농축 대두단백으로 읽는다.
  assert.equal(classify('대두단백, 전분, 정제소금').absorption, 'slow');

  // 대두레시틴(유화제)은 단백질 원천이 아니다 — 근거에서 빠져야 한다.
  const lecithin = classify('정제수, 분리유청단백분말(WPI), 대두레시틴');
  assert.deepEqual(lecithin.absorption_basis, ['분리유청단백 (WPI)']);

  // 이름에 '프로틴'이 있어도 원재료가 없으면 판정하지 않는다.
  const noSource = classify('');
  assert.equal(noSource.absorption, 'unknown');
  assert.deepEqual(noSource.absorption_basis, []);
});

test('5. 흡수 속도는 점수가 아니라 정렬에만 쓰인다', () => {
  const target = applyTimingTarget(
    { kcal: 300, P: 30, C: 40, F: 10, Na: 600, Sugar: 12 }, 'post', 78
  );
  const nutrition = { kcal: 250, protein_g: 25, carb_g: 30, fat_g: 5, sodium_mg: 300, sugar_g: 5 };

  // 점수는 흡수 속도를 보지 않는다.
  const known = computeFitScore({ ...nutrition, absorption: 'fast' }, target, 'lean_mass', 'post');
  const unknown = computeFitScore({ ...nutrition, absorption: 'unknown' }, target, 'lean_mass', 'post');
  assert.equal(known, unknown);

  // 대신 동점일 때의 순서를 흡수 속도가 가른다 — 미확보는 감점 없이 뒤로 간다.
  const items = [
    { menu_id: 'u', absorption: 'unknown' },
    { menu_id: 's', absorption: 'slow' },
    { menu_id: 'f', absorption: 'fast' },
    { menu_id: 'm', absorption: 'medium' },
    { menu_id: 'x' } // 필드 자체가 없는 구 데이터
  ];
  const sorted = items.slice().sort((a, b) => absorptionRank(a) - absorptionRank(b)).map(i => i.menu_id);
  assert.deepEqual(sorted.slice(0, 3), ['f', 'm', 's']);
  assert.ok(sorted.indexOf('u') > sorted.indexOf('f'), '미확보가 빠른 흡수보다 앞설 수 없다');
  assert.equal(absorptionRank({}), absorptionRank({ absorption: 'unknown' }));
});

test('6. 식사류 최소 1개 예외는 운동 후에만 적용된다', () => {
  // 음료 1개 + 바 1개 — 어느 쪽도 main_categories 가 아니다.
  const items = [
    {
      menu_id: 'drink', name: '프로틴 드링크', category: '유제품/음료', channel: 'cvs',
      price_krw: 2900, kcal: 150, protein_g: 20, carb_g: 8, fat_g: 1,
      sodium_mg: 100, sugar_g: 2, npi: 20, pw_tier: 'verified', grade_eligible: true,
      carb_g_status: 'measured'
    },
    {
      menu_id: 'bar', name: '프로틴 바', category: '과자/바', channel: 'cvs',
      price_krw: 2500, kcal: 180, protein_g: 12, carb_g: 18, fat_g: 6,
      sodium_mg: 150, sugar_g: 6, npi: 11, pw_tier: 'verified', grade_eligible: true,
      carb_g_status: 'measured'
    }
  ];
  const target = { kcal: 330, P: 20, C: 47, F: 12, Na: 600, Sugar: 18 };

  const post = findBestCombos(items, target, { budget: 8000, goal: 'lean_mass', timing: 'post' });
  assert.ok(post.length > 0, '운동 후에는 음료+바 조합이 만들어져야 한다');

  const none = findBestCombos(items, target, { budget: 8000, goal: 'lean_mass' });
  assert.equal(none.length, 0, '타이밍이 없으면 기존 규칙(식사류 필수)이 그대로다');

  const pre = findBestCombos(items, target, { budget: 8000, goal: 'lean_mass', timing: 'pre' });
  assert.equal(pre.length, 0, '운동 전은 여전히 한 끼다');

  // 탄수가 실측이 아니면 운동 후 조합에서도 빠진다(결측을 0으로 채점하지 않는다).
  const unmeasured = items.map(i => ({ ...i, carb_g_status: 'unknown' }));
  const guarded = findBestCombos(unmeasured, target, { budget: 8000, goal: 'lean_mass', timing: 'post' });
  assert.equal(guarded.length, 0, '탄수 결측 건은 운동 후 조합 후보가 아니다');
});

test('7. 타이밍 문구에 효능 단정 어휘를 쓰지 않는다', () => {
  const BANNED = ['근육이 늘어', '효과가 있습니다', '치료', '보장', '반드시 늘', '흡수가 빨라져 근육'];
  const target = applyTimingTarget({ kcal: 300, P: 30, C: 40, F: 10, Na: 600, Sugar: 12 }, 'post', 78);
  const item = { kcal: 250, protein_g: 25, carb_g: 30, fat_g: 5, sodium_mg: 300, sugar_g: 5 };

  for (const timing of ['pre', 'post', null]) {
    const text = generateReasonSentence(item, target, 80, 'lean_mass', timing);
    for (const w of BANNED) assert.ok(!text.includes(w), `"${w}" 사용 (${timing})`);
  }

  // 화면 문구도 같은 규칙을 받는다 — 근거 링크 없이 수치를 적지 않는다.
  const appSource = fs.readFileSync(path.join(process.cwd(), 'js', 'app.js'), 'utf-8');
  const basisBlock = appSource.slice(appSource.indexOf('function renderTimingBasis'));
  assert.ok(basisBlock.includes('PMC5477153'), '단백질 권장량 출처 링크 누락');
  assert.ok(basisBlock.includes('PMC5596471'), '영양 타이밍 출처 링크 누락');
  assert.ok(basisBlock.includes('환산값'), '내부 환산값이라는 사실을 화면에 적어야 한다');
});

test('8. 1끼 타깃의 열량·나트륨은 타이밍이 건드리지 않는다', () => {
  const daily = computeDailyTargets({
    gender: 'female', age: 28, height_cm: 162, weight_kg: 54,
    activity_level: 'moderate', goal: 'diet'
  });
  const base = computeMealTarget(daily, 'lunch');
  for (const timing of ['pre', 'post']) {
    const t = applyTimingTarget(base, timing, 54);
    assert.equal(t.kcal, base.kcal);
    assert.equal(t.Na, base.Na);
    assert.equal(t.Sugar, base.Sugar);
  }
});
