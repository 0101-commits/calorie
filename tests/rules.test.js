// G5 회귀 게이트 — 룰 파일과 코드 기본값이 갈라지면 실패한다.
// 두 원천이 조용히 갈라지는 것이 기획안 v2.0 이 지목한 근본 원인 C2 이므로,
// 빌드(build.js)뿐 아니라 테스트에서도 잡는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_RULES } from '../js/score.js';
import { PAL_MAP, MEAL_RATIOS, GOAL_WEIGHTS, GOAL_PROFILES, MEAL_PROTEIN_CLAMP } from '../js/calc.js';
import { DEFAULT_COMBO_RULES } from '../js/combo.js';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(fs.readFileSync(path.join(rootDir, 'rules', 'rule_v1.1.json'), 'utf-8'));

test('G5-1. 지표 컷오프가 룰 파일과 일치한다', () => {
  assert.deepEqual(rules.cutoffs.ppr, DEFAULT_RULES.cutoffs.ppr);
  assert.deepEqual(rules.cutoffs.cpd, DEFAULT_RULES.cutoffs.cpd);
  assert.deepEqual(rules.cutoffs.npi, DEFAULT_RULES.cutoffs.npi);
  assert.deepEqual(rules.cutoffs.total_grade, DEFAULT_RULES.cutoffs.total_grade);
});

test('G5-2. 페널티·Q 가중치가 룰 파일과 일치한다', () => {
  assert.equal(rules.penalties.max_total_penalty, DEFAULT_RULES.penalties.max_total_penalty);
  assert.equal(rules.penalties.sodium.threshold_mg, DEFAULT_RULES.penalties.sodium.threshold_mg);
  assert.equal(rules.penalties.sat_fat.threshold_g, DEFAULT_RULES.penalties.sat_fat.threshold_g);
  assert.equal(rules.penalties.sugar.threshold_g, DEFAULT_RULES.penalties.sugar.threshold_g);
  assert.equal(rules.penalties.trans_fat.threshold_g, DEFAULT_RULES.penalties.trans_fat.threshold_g);
  assert.equal(rules.penalties.fiber_bonus.bonus_g, DEFAULT_RULES.penalties.fiber_bonus.bonus_g);
  assert.equal(rules.protein_source_q.Q_unknown, DEFAULT_RULES.protein_source_q.Q_unknown);
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) {
    assert.equal(rules.protein_source_q[q], DEFAULT_RULES.protein_source_q[q], `${q} 불일치`);
  }
});

test('G5-3. 추천 파라미터가 룰 파일과 일치한다', () => {
  assert.deepEqual(rules.recommendation.pal, PAL_MAP);
  assert.deepEqual(rules.recommendation.meal_ratios, MEAL_RATIOS);
  assert.deepEqual(rules.recommendation.fit_weights, GOAL_WEIGHTS);
  assert.deepEqual(rules.recommendation.meal_protein_clamp, MEAL_PROTEIN_CLAMP);
  for (const [goal, g] of Object.entries(rules.recommendation.goals)) {
    assert.deepEqual(g, GOAL_PROFILES[goal], `${goal} 목표 계수 불일치`);
  }
});

test('G5-4. 조합 제약이 룰 파일과 일치한다', () => {
  assert.deepEqual(rules.recommendation.combo, DEFAULT_COMBO_RULES);
});

test('G5-5. Fit 가중치 합은 목적별로 1.00 이다', () => {
  for (const [goal, w] of Object.entries(rules.recommendation.fit_weights)) {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${goal} 가중치 합 ${sum}`);
  }
});

test('G5-6. 등급 컷은 기획서 §1.7 벤치마크 6건과 모순되지 않는다', () => {
  // 기획서 §1.3 본문(3.5/2.5/1.5)과 §1.7 예시표가 어긋난다. 예시표를 정본으로 채택했으므로
  // 컷을 바꾸면 이 테스트가 먼저 깨져 근거 없이 표류하는 것을 막는다.
  const c = rules.cutoffs.total_grade;
  const grade = avg => (avg >= c.A ? 'A' : avg >= c.B ? 'B' : avg >= c.C ? 'C' : 'D');
  const demote = g => ({ A: 'B', B: 'C', C: 'D', D: 'D' }[g]);
  const rows = [
    { name: '훈제 닭가슴살', vals: [4, 4, 3], washing: false, expect: 'A' },
    { name: '곡물 샐러드', vals: [3, 3, 4], washing: false, expect: 'A' },
    { name: '프로틴 초코 음료', vals: [3, 3, 3], washing: false, expect: 'B' },
    { name: '고단백 소시지 김밥', vals: [3, 1, 1], washing: true, expect: 'D' },
    { name: '더블 프로틴 치킨버거', vals: [2, 1, 2], washing: true, expect: 'D' },
    { name: '참치마요 삼각김밥', vals: [2, 1, 1], washing: false, expect: 'C' }
  ];
  for (const r of rows) {
    const avg = r.vals.reduce((a, b) => a + b, 0) / 3;
    let g = grade(avg);
    if (r.washing) g = demote(g);
    assert.equal(g, r.expect, `${r.name}: 평균 ${avg.toFixed(2)} → ${g} (기대 ${r.expect})`);
  }
});
