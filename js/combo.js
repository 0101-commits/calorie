// 편의점 1끼 조합(콤보) 추천 최적화 엔진 (combo.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

import { computeFitScore, generateReasonSentence } from './calc.js';

/**
 * 조합(콤보) 생성 및 랭킹 산출
 * @param {Array} items - 전체 후보 메뉴 목록
 * @param {Object} mealTarget - 1끼 타깃 벡터 (kcal, P, C, F, Na, Sugar)
 * @param {Object} options - { budget, goal, topCount, maxSingles }
 */
export function findBestCombos(items, mealTarget, options = {}) {
  const budget = options.budget || 10000;
  const goal = options.goal || 'diet';
  const topCount = options.topCount || 5;
  const maxSingles = options.maxSingles || 30;

  // 1. 하드 필터 및 단품 Fit Score 사전 계산
  const scoredSingles = items
    .filter(item => {
      // 가격이 예산 이내이고 유효한 영양값이 있는 제품
      if (!item.price_krw || item.price_krw > budget) return false;
      if (!item.kcal || !item.protein_g) return false;
      return true;
    })
    .map(item => ({
      item,
      fitScore: computeFitScore(item, mealTarget, goal)
    }))
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, maxSingles)
    .map(x => x.item);

  const n = scoredSingles.length;
  if (n < 2) return [];

  const minKcal = mealTarget.kcal * 0.7;
  const maxKcal = mealTarget.kcal * 1.3;

  const validCombos = [];

  // 2개 조합 생성 (C(N, 2))
  for (let i = 0; i < n; i++) {
    const a = scoredSingles[i];
    for (let j = i + 1; j < n; j++) {
      const b = scoredSingles[j];
      const combo = evaluateCombo([a, b], mealTarget, budget, minKcal, maxKcal, goal);
      if (combo) validCombos.push(combo);
    }
  }

  // 3개 조합 생성 (C(N, 3))
  for (let i = 0; i < n; i++) {
    const a = scoredSingles[i];
    for (let j = i + 1; j < n; j++) {
      const b = scoredSingles[j];
      if (a.price_krw + b.price_krw > budget) continue;
      for (let k = j + 1; k < n; k++) {
        const c = scoredSingles[k];
        const combo = evaluateCombo([a, b, c], mealTarget, budget, minKcal, maxKcal, goal);
        if (combo) validCombos.push(combo);
      }
    }
  }

  // 점수 내림차순 정렬
  validCombos.sort((a, b) => b.score - a.score);

  // 다양성 보장: Jaccard 유사도 <= 0.5
  const diverseCombos = [];
  for (const candidate of validCombos) {
    if (diverseCombos.length >= topCount) break;

    const candIds = new Set(candidate.items.map(m => m.menu_id || m.name));
    let isDuplicate = false;

    for (const selected of diverseCombos) {
      const selIds = new Set(selected.items.map(m => m.menu_id || m.name));
      let intersection = 0;
      for (const id of candIds) {
        if (selIds.has(id)) intersection++;
      }
      const union = candIds.size + selIds.size - intersection;
      const jaccard = intersection / union;

      if (jaccard > 0.5) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      diverseCombos.push(candidate);
    }
  }

  return diverseCombos;
}

/**
 * 조합 타당성 검증 및 합산 평가
 */
function evaluateCombo(items, mealTarget, budget, minKcal, maxKcal, goal) {
  // 1. 카테고리 중복 제약 (음료/유제품 제외 같은 카테고리 중복 금지)
  const categoryCounts = {};
  for (const item of items) {
    const cat = item.category || '기타';
    if (cat !== '유제품/음료') {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      if (categoryCounts[cat] > 1) return null;
    }
  }

  // 2. 합산 수치 계산
  let totalPrice = 0;
  let totalKcal = 0;
  let totalP = 0;
  let totalC = 0;
  let totalF = 0;
  let totalNa = 0;
  let totalSugar = 0;

  for (const item of items) {
    totalPrice += item.price_krw || 0;
    totalKcal += item.kcal || 0;
    totalP += item.protein_g || 0;
    totalC += item.carb_g || 0;
    totalF += item.fat_g || 0;
    totalNa += item.sodium_mg || 0;
    totalSugar += item.sugar_g || 0;
  }

  // 제약 검사: 예산 및 칼로리 범위 [0.7, 1.3]
  if (totalPrice > budget) return null;
  if (totalKcal < minKcal || totalKcal > maxKcal) return null;

  const aggregate = {
    name: items.map(x => x.name).join(' + '),
    price_krw: totalPrice,
    kcal: Math.round(totalKcal),
    protein_g: Math.round(totalP * 10) / 10,
    carb_g: Math.round(totalC * 10) / 10,
    fat_g: Math.round(totalF * 10) / 10,
    sodium_mg: Math.round(totalNa),
    sugar_g: Math.round(totalSugar * 10) / 10
  };

  const rawFit = computeFitScore(aggregate, mealTarget, goal);
  // 3개 조합은 편의성 감점 0.5
  const penalty = 0.5 * (items.length - 2);
  const finalScore = Math.max(0, Math.round(rawFit - penalty));

  const reason = generateReasonSentence(aggregate, mealTarget, finalScore, goal);

  return {
    items,
    item_count: items.length,
    aggregate,
    score: finalScore,
    reason
  };
}

if (typeof window !== 'undefined') {
  window.ProteinCombo = {
    findBestCombos
  };
}
