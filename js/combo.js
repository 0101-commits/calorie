// 편의점 1끼 조합(콤보) 추천 최적화 엔진 (combo.js)
// 룰 단일 원천: rules/rule_v1.1.json 의 recommendation.combo (빌드가 data_meta.json 에 스냅샷으로 싣는다)

import { computeFitScore, generateReasonSentence } from './calc.js';

export const DEFAULT_COMBO_RULES = {
  max_singles: 30,
  kcal_range: [0.7, 1.3],
  size_penalty_per_extra_item: 0.5,
  jaccard_max_3item: 0.5,
  share_forbidden_for_2item: true,
  sodium_hard_cap_ratio: 1.5,
  duplicate_category_exempt: ['유제품/음료'],
  max_beverage_items: 1,
  main_categories: ['도시락', '삼각김밥/주먹밥', '샌드위치/버거', '샐러드', '닭가슴살/육가공', '면', '즉석밥/죽', '한식/분식'],
  require_main_item: true
};

/**
 * 조합(콤보) 생성 및 랭킹 산출
 * @param {Array} items - 전체 후보 메뉴 목록
 * @param {Object} mealTarget - 1끼 타깃 벡터 (kcal, P, C, F, Na, Sugar)
 * @param {Object} options - { budget, goal, topCount, maxSingles, rules }
 */
export function findBestCombos(items, mealTarget, options = {}) {
  const R = { ...DEFAULT_COMBO_RULES, ...(options.rules || {}) };
  const budget = options.budget || 10000;
  const goal = options.goal || 'diet';
  const topCount = options.topCount || 5;
  const maxSingles = options.maxSingles || R.max_singles;

  // 1. 하드 필터 및 후보 풀 구성
  //
  // 단품 Fit Score 만으로 상위 30개를 뽑으면 후보가 전부 '혼자서 한 끼'인 도시락·버거가 된다.
  // 그 둘을 합치면 열량·예산이 반드시 터지므로 조합이 거의 만들어지지 않는다(실측: 435쌍 중 4쌍).
  // 그래서 풀을 두 갈래로 만든다 — ① 한 끼 전체에 맞는 앵커 ② 한 끼의 절반에 맞는 구성품.
  const scaleTarget = (factor) => {
    const out = {};
    for (const [k, v] of Object.entries(mealTarget)) out[k] = typeof v === 'number' ? v * factor : v;
    return out;
  };
  // 1인분 전체(앵커) · 1/2 · 1/3 — 목표가 클수록 작은 구성품이 여러 개 필요하다.
  const trackTargets = [mealTarget, scaleTarget(0.5), scaleTarget(1 / 3)];

  const eligible = items
    .filter(item => {
      if (!item.price_krw || item.price_krw > budget) return false;
      if (!item.kcal || !item.protein_g) return false;
      // 워싱 의심(🔴)은 개인 맞춤 추천에서 제외한다 — 기획서 §2.4 하드 필터.
      if (item.pw_tier === 'washing') return false;
      // 등급 보류(정보 부족)는 추천 근거가 부족하므로 조합 후보에서 뺀다.
      if (item.grade_eligible === false) return false;
      return true;
    });

  const tracks = trackTargets.map(t => eligible
    .map(item => ({ item, fit: computeFitScore(item, t, goal) }))
    .sort((a, b) => b.fit - a.fit)
    .map(x => x.item));

  // 목록을 번갈아 뽑아 앵커와 구성품이 같은 풀에 들어가게 한다.
  const scoredSingles = [];
  const seen = new Set();
  const maxLen = Math.max(...tracks.map(t => t.length));
  for (let i = 0; scoredSingles.length < maxSingles && i < maxLen; i++) {
    for (const src of tracks) {
      const cand = src[i];
      if (!cand) continue;
      const key = cand.menu_id || cand.name;
      if (seen.has(key)) continue;
      seen.add(key);
      scoredSingles.push(cand);
      if (scoredSingles.length >= maxSingles) break;
    }
  }

  const n = scoredSingles.length;
  if (n < 2) return [];

  const minKcal = mealTarget.kcal * R.kcal_range[0];
  const maxKcal = mealTarget.kcal * R.kcal_range[1];
  const maxSodium = mealTarget.Na * R.sodium_hard_cap_ratio;

  const validCombos = [];

  for (let i = 0; i < n; i++) {
    const a = scoredSingles[i];
    for (let j = i + 1; j < n; j++) {
      const b = scoredSingles[j];
      const combo = evaluateCombo([a, b], mealTarget, { budget, minKcal, maxKcal, maxSodium, goal, R });
      if (combo) validCombos.push(combo);
    }
  }

  for (let i = 0; i < n; i++) {
    const a = scoredSingles[i];
    for (let j = i + 1; j < n; j++) {
      const b = scoredSingles[j];
      if (a.price_krw + b.price_krw > budget) continue;
      for (let k = j + 1; k < n; k++) {
        const c = scoredSingles[k];
        const combo = evaluateCombo([a, b, c], mealTarget, { budget, minKcal, maxKcal, maxSodium, goal, R });
        if (combo) validCombos.push(combo);
      }
    }
  }

  // 정렬 — Fit 동점이 흔하므로(허용폭이 넓어 손실이 포화한다) 2차 기준을 둔다.
  //   ① Fit 높은 순 ② 실질 단백질(NPI) 합 많은 순 ③ 나트륨 적은 순 ④ 가격 낮은 순
  validCombos.sort((a, b) =>
    b.score - a.score ||
    b.aggregate.npi_sum - a.aggregate.npi_sum ||
    a.aggregate.sodium_mg - b.aggregate.sodium_mg ||
    a.aggregate.price_krw - b.aggregate.price_krw
  );

  // 다양성 — 2개 조합은 하나만 겹쳐도 Jaccard 가 0.33이라 제약이 걸리지 않는다.
  // 그래서 "같은 크기의 2개 조합끼리는 한 품목도 공유 금지"를 따로 둔다.
  const diverseCombos = [];
  for (const candidate of validCombos) {
    if (diverseCombos.length >= topCount) break;

    const candIds = new Set(candidate.items.map(m => m.menu_id || m.name));
    let isDuplicate = false;

    for (const selected of diverseCombos) {
      const selIds = new Set(selected.items.map(m => m.menu_id || m.name));
      let intersection = 0;
      for (const id of candIds) if (selIds.has(id)) intersection++;

      if (intersection === 0) continue;

      const bothSmall = candIds.size === 2 && selIds.size === 2;
      if (bothSmall && R.share_forbidden_for_2item) {
        isDuplicate = true;
        break;
      }

      const union = candIds.size + selIds.size - intersection;
      if (intersection / union > R.jaccard_max_3item) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) diverseCombos.push(candidate);
  }

  return diverseCombos;
}

/**
 * 조합 타당성 검증 및 합산 평가
 */
function evaluateCombo(items, mealTarget, ctx) {
  const { budget, minKcal, maxKcal, maxSodium, goal, R } = ctx;

  // 1. 카테고리 제약
  //    ① 같은 카테고리 중복 금지(음료는 예외) ② 단, 음료는 조합당 상한이 있다
  //    ③ 1끼라면 식사류가 최소 하나는 있어야 한다 — 음료·바만으로는 한 끼가 아니다
  const categoryCounts = {};
  let beverageCount = 0;
  let hasMain = false;
  for (const item of items) {
    const cat = item.category || '기타';
    if (R.duplicate_category_exempt.includes(cat)) {
      beverageCount++;
      if (beverageCount > R.max_beverage_items) return null;
    } else {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      if (categoryCounts[cat] > 1) return null;
    }
    if (R.main_categories.includes(cat)) hasMain = true;
  }
  if (R.require_main_item && !hasMain) return null;

  // 2. 합산
  let totalPrice = 0, totalKcal = 0, totalP = 0, totalC = 0, totalF = 0, totalNa = 0, totalSugar = 0, totalNpi = 0;
  for (const item of items) {
    totalPrice += item.price_krw || 0;
    totalKcal += item.kcal || 0;
    totalP += item.protein_g || 0;
    totalC += item.carb_g || 0;
    totalF += item.fat_g || 0;
    totalNa += item.sodium_mg || 0;
    totalSugar += item.sugar_g || 0;
    totalNpi += item.npi || 0;
  }

  // 3. 하드 제약
  if (totalPrice > budget) return null;
  if (totalKcal < minKcal || totalKcal > maxKcal) return null;
  // 나트륨은 가중치만으로는 막히지 않는다 — 1끼 목표의 150%를 넘는 조합은 추천하지 않는다.
  if (maxSodium > 0 && totalNa > maxSodium) return null;

  const aggregate = {
    name: items.map(x => x.name).join(' + '),
    price_krw: totalPrice,
    kcal: Math.round(totalKcal),
    protein_g: Math.round(totalP * 10) / 10,
    carb_g: Math.round(totalC * 10) / 10,
    fat_g: Math.round(totalF * 10) / 10,
    sodium_mg: Math.round(totalNa),
    sugar_g: Math.round(totalSugar * 10) / 10,
    npi_sum: Math.round(totalNpi * 10) / 10
  };

  const rawFit = computeFitScore(aggregate, mealTarget, goal);
  const penalty = R.size_penalty_per_extra_item * (items.length - 2);
  const finalScore = Math.max(0, Math.round(rawFit - penalty));
  const reason = generateReasonSentence(aggregate, mealTarget, finalScore, goal);

  return { items, item_count: items.length, aggregate, score: finalScore, reason };
}

if (typeof window !== 'undefined') {
  window.ProteinCombo = { findBestCombos };
}
