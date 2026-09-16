// 개인화 맞춤 추천 및 Fit Score 엔진 (calc.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

export const PRESETS = {
  diet_female: {
    id: 'diet_female',
    name: '다이어트 여성 표준',
    gender: 'female',
    age: 28,
    height_cm: 162,
    weight_kg: 54,
    activity_level: 'moderate',
    goal: 'diet',
    meal: 'lunch',
    budget_krw: 8000
  },
  lean_male: {
    id: 'lean_male',
    name: '린매스업 남성 표준',
    gender: 'male',
    age: 32,
    height_cm: 176,
    weight_kg: 78,
    activity_level: 'moderate',
    goal: 'lean_mass',
    meal: 'lunch',
    budget_krw: 8000
  },
  bulk_male: {
    id: 'bulk_male',
    name: '벌크업 남성 표준',
    gender: 'male',
    age: 25,
    height_cm: 178,
    weight_kg: 72,
    activity_level: 'heavy',
    goal: 'bulk_up',
    meal: 'lunch',
    budget_krw: 9000
  }
};

export const PAL_MAP = {
  sedentary: 1.20,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
  extreme: 1.90
};

export const MEAL_RATIOS = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.30,
  snack: 0.10
};

export const GOAL_WEIGHTS = {
  diet: { kcal: 0.30, P: 0.30, C: 0.05, F: 0.10, Na: 0.10, Sugar: 0.15 },
  lean_mass: { kcal: 0.25, P: 0.35, C: 0.15, F: 0.10, Na: 0.10, Sugar: 0.05 },
  bulk_up: { kcal: 0.30, P: 0.30, C: 0.20, F: 0.10, Na: 0.05, Sugar: 0.05 }
};

/**
 * 룰 파일(rules/rule_v1.1.json)의 recommendation 블록을 주입한다.
 * data_meta.json 의 rules_snapshot 을 그대로 넘기면 된다 — 화면과 빌드가 같은 값을 쓴다.
 * 주입하지 않으면 위 상수(테스트 픽스처 겸 기본값)가 쓰인다.
 */
export function configureFromRules(recommendation) {
  if (!recommendation) return;
  if (recommendation.pal) Object.assign(PAL_MAP, recommendation.pal);
  if (recommendation.meal_ratios) {
    Object.assign(MEAL_RATIOS, recommendation.meal_ratios);
  }
  if (recommendation.fit_weights) {
    for (const [goal, w] of Object.entries(recommendation.fit_weights)) {
      if (GOAL_WEIGHTS[goal]) Object.assign(GOAL_WEIGHTS[goal], w);
    }
  }
  if (recommendation.goals) {
    for (const [goal, g] of Object.entries(recommendation.goals)) {
      if (GOAL_PROFILES[goal]) Object.assign(GOAL_PROFILES[goal], g);
    }
  }
  if (recommendation.meal_protein_clamp) {
    MEAL_PROTEIN_CLAMP.min = recommendation.meal_protein_clamp.min;
    MEAL_PROTEIN_CLAMP.max = recommendation.meal_protein_clamp.max;
  }
}

export const MEAL_PROTEIN_CLAMP = { min: 20, max: 45 };

// 목적별 1일 목표 계수 — rules/rule_v1.1.json 의 recommendation.goals 와 같은 값이어야 한다.
export const GOAL_PROFILES = {
  diet:      { kcal_factor: 0.80, protein_per_kg: 2.0, fat_pct: 0.25, sodium_day_mg: 2000, sugar_day_g: 50 },
  lean_mass: { kcal_factor: 1.08, protein_per_kg: 1.8, fat_pct: 0.25, sodium_day_mg: 2300, sugar_day_g: 60 },
  bulk_up:   { kcal_factor: 1.15, protein_per_kg: 1.6, fat_pct: 0.275, sodium_day_mg: 2600, sugar_day_g: 80 }
};

/**
 * 1. Mifflin-St Jeor 기초대사량 (BMR) 계산
 * 남: 10 * weight + 6.25 * height - 5 * age + 5
 * 여: 10 * weight + 6.25 * height - 5 * age - 161
 */
export function computeBMR(params) {
  const w = Number(params.weight_kg);
  const h = Number(params.height_cm);
  const a = Number(params.age);
  const isMale = params.gender === 'male' || params.gender === '남';

  if (!w || !h || !a) return 1500;

  const base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(isMale ? base + 5 : base - 161);
}

/**
 * 2. 총 일일 에너지 소비량 (TDEE) 계산
 */
export function computeTDEE(bmr, activity_level = 'moderate') {
  const pal = PAL_MAP[activity_level] || 1.55;
  return Math.round(bmr * pal);
}

/**
 * 3. 1일 영양 목표 산출
 */
export function computeDailyTargets(params) {
  const bmr = computeBMR(params);
  const tdee = computeTDEE(bmr, params.activity_level);
  const weight = Number(params.weight_kg) || 70;
  const goal = params.goal || 'diet';
  const isMale = params.gender === 'male' || params.gender === '남';

  const profile = GOAL_PROFILES[goal] || GOAL_PROFILES.diet;
  let kcal_day = tdee * profile.kcal_factor;

  // 감량 시 하한 — 근손실·대사 적응 방지(기획서 §2.3)
  if (goal === 'diet') {
    const minKcal = Math.max(bmr * 1.1, isMale ? 1500 : 1200);
    kcal_day = Math.max(kcal_day, minKcal);
  }

  const p_g_per_kg = profile.protein_per_kg;
  const fat_ratio = profile.fat_pct;
  const na_day = profile.sodium_day_mg;
  const sugar_day = profile.sugar_day_g;

  kcal_day = Math.round(kcal_day);
  const P_day = Math.round(weight * p_g_per_kg);
  const F_day = Math.round((kcal_day * fat_ratio) / 9);
  const C_day = Math.max(0, Math.round((kcal_day - P_day * 4 - F_day * 9) / 4));

  return {
    bmr,
    tdee,
    kcal_day,
    P_day,
    C_day,
    F_day,
    Na_day: na_day,
    Sugar_day: sugar_day,
    goal
  };
}

/**
 * 4. 1끼 타깃 벡터 산출
 */
export function computeMealTarget(dailyTargets, meal = 'lunch') {
  const s = MEAL_RATIOS[meal] || 0.35;
  const isSnack = meal === 'snack';

  const kcal_meal = Math.round(dailyTargets.kcal_day * s);

  // 단백질은 근합성 역치(20~40g/끼)를 고려해 clamp(P_day / 3, 20, 45), 간식은 15%
  let P_meal;
  if (isSnack) {
    P_meal = Math.round(dailyTargets.P_day * 0.15);
  } else {
    P_meal = Math.min(MEAL_PROTEIN_CLAMP.max, Math.max(MEAL_PROTEIN_CLAMP.min, Math.round(dailyTargets.P_day / 3)));
  }

  const C_meal = Math.round(dailyTargets.C_day * s);
  const F_meal = Math.round(dailyTargets.F_day * s);
  const Na_meal = Math.round(dailyTargets.Na_day * s);
  const Sugar_meal = Math.round(dailyTargets.Sugar_day * s);

  return {
    meal,
    ratio: s,
    kcal: kcal_meal,
    P: P_meal,
    C: C_meal,
    F: F_meal,
    Na: Na_meal,
    Sugar: Sugar_meal
  };
}

/**
 * 5. Fit Score — 가중 정규화 거리 (0~100)
 */
export function computeFitScore(item, target, goal = 'diet') {
  const weights = GOAL_WEIGHTS[goal] || GOAL_WEIGHTS.diet;

  // 허용폭 tol
  const tol = {
    kcal: Math.max(100, target.kcal * 0.20),
    P: Math.max(5, target.P * 0.25),
    C: Math.max(10, (target.C || 50) * 0.30),
    F: Math.max(5, (target.F || 15) * 0.30),
    Na: Math.max(200, target.Na * 0.40),
    Sugar: Math.max(5, target.Sugar * 0.50)
  };

  // 비대칭 방향 계수 dir
  const dirMultiplier = (key, val, tVal) => {
    if (key === 'P') {
      return val >= tVal ? 0.5 : 1.0; // 단백질 초과는 덜 나쁨
    }
    if (key === 'kcal') {
      if (goal === 'diet') return val > tVal ? 2.0 : 0.5;
      if (goal === 'lean_mass') return 1.0;
      if (goal === 'bulk_up') return val > tVal ? 0.5 : 1.5;
    }
    if (key === 'Na' || key === 'Sugar') {
      return val <= tVal ? 0.0 : 1.0; // 나트륨/당류 미달은 무페널티
    }
    return 1.0;
  };

  const metrics = [
    { key: 'kcal', val: Number(item.kcal || 0), target: target.kcal, weight: weights.kcal },
    { key: 'P', val: Number(item.protein_g || 0), target: target.P, weight: weights.P },
    { key: 'C', val: Number(item.carb_g || 0), target: target.C, weight: weights.C },
    { key: 'F', val: Number(item.fat_g || 0), target: target.F, weight: weights.F },
    { key: 'Na', val: Number(item.sodium_mg || 0), target: target.Na, weight: weights.Na },
    { key: 'Sugar', val: Number(item.sugar_g || 0), target: target.Sugar, weight: weights.Sugar }
  ];

  let weightedLoss = 0;
  metrics.forEach(m => {
    const diff = Math.abs(m.val - m.target);
    const dir = dirMultiplier(m.key, m.val, m.target);
    const d = (diff / tol[m.key]) * dir;
    const loss = Math.min(1.0, d);
    weightedLoss += loss * m.weight;
  });

  const score = Math.round(100 * (1.0 - weightedLoss));
  return Math.max(0, Math.min(100, score));
}

/**
 * 6. 이유 문장 템플릿 생성
 * "단백질 목표 45g 중 43g(96%), 열량 749kcal 목표에 -118kcal. 나트륨은 1끼 목표의 61%. 감점 요인: 당류 22g(목표 18g 초과)."
 */
export function generateReasonSentence(item, target, fitScore, goal = 'diet') {
  const p = Number(item.protein_g || 0);
  const pPct = target.P > 0 ? Math.round((p / target.P) * 100) : 100;
  const kcalDiff = Math.round(Number(item.kcal || 0) - target.kcal);
  const kcalSign = kcalDiff >= 0 ? `+${kcalDiff}` : `${kcalDiff}`;

  const na = Number(item.sodium_mg || 0);
  const naPct = target.Na > 0 ? Math.round((na / target.Na) * 100) : 0;

  const deductions = [];
  const sugar = Number(item.sugar_g || 0);
  if (sugar > target.Sugar) {
    deductions.push(`당류 ${sugar}g(목표 ${target.Sugar}g 초과)`);
  }
  if (na > target.Na * 1.2) {
    deductions.push(`나트륨 ${na}mg(${naPct}%)`);
  }
  if (goal === 'diet' && kcalDiff > 100) {
    deductions.push(`열량 ${kcalSign}kcal 초과`);
  }
  if (p < target.P * 0.7) {
    deductions.push(`단백질 ${target.P - p}g 부족`);
  }

  let text = `단백질 목표 ${target.P}g 중 ${p}g(${pPct}%), 열량 ${target.kcal}kcal 목표에 ${kcalSign}kcal. 나트륨은 1끼 목표의 ${naPct}%.`;
  if (deductions.length > 0) {
    text += ` 감점 요인: ${deductions.slice(0, 2).join(', ')}.`;
  } else {
    text += ` 영양 밸런스가 매우 우수합니다.`;
  }

  return text;
}

if (typeof window !== 'undefined') {
  window.ProteinCalc = {
    PRESETS,
    PAL_MAP,
    MEAL_RATIOS,
    GOAL_WEIGHTS,
    computeBMR,
    computeTDEE,
    computeDailyTargets,
    computeMealTarget,
    computeFitScore,
    generateReasonSentence
  };
}
