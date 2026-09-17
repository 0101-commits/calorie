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
  if (recommendation.timing) {
    for (const key of ['pre', 'post', 'rest']) {
      if (recommendation.timing[key]) Object.assign(TIMING_PROFILES[key], recommendation.timing[key]);
    }
    if (recommendation.timing.fit_weights) {
      for (const [key, w] of Object.entries(recommendation.timing.fit_weights)) {
        if (TIMING_FIT_WEIGHTS[key]) Object.assign(TIMING_FIT_WEIGHTS[key], w);
      }
    }
  }
}

export const MEAL_PROTEIN_CLAMP = { min: 20, max: 45 };

// 타이밍 프로필 — rules/rule_v1.1.json 의 recommendation.timing 과 같은 값이어야 한다(G5).
// pre.carb_per_kg 0.75 는 ISSN 의 1~4 g/kg/day 중 하단을 3끼로 나눈 내부 환산값이다.
export const TIMING_PROFILES = {
  pre:  { protein_per_kg: 0.25, protein_min: 15, protein_max: 30, carb_per_kg: 0.75, carb_basis: 'internal_conversion', fat_over_dir: 2 },
  post: { protein_per_kg: 0.25, protein_min: 20, protein_max: 40, carb_per_kg: 0.60, protein_under_dir: 1.5 },
  rest: { protein_floor_per_kg: 1.4 }
};

// 타이밍이 선택되면 목적별 가중치(GOAL_WEIGHTS) 대신 이 값을 쓴다. rest 는 기존 가중치를 그대로 쓴다.
export const TIMING_FIT_WEIGHTS = {
  pre:  { kcal: 0.20, P: 0.20, C: 0.30, F: 0.15, Na: 0.10, Sugar: 0.05 },
  post: { kcal: 0.15, P: 0.40, C: 0.25, F: 0.10, Na: 0.05, Sugar: 0.05 }
};

export const TIMING_LABELS = { pre: '운동 전', post: '운동 후', rest: '운동 안 한 날' };

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
  let P_day = Math.round(weight * p_g_per_kg);
  // 운동을 쉰 날에도 하루 단백질 총량은 내리지 않는다 — 근유지를 좌우하는 건 그날 열량이 아니라 총량이다.
  if (params.timing === 'rest') {
    P_day = Math.max(P_day, Math.round(weight * TIMING_PROFILES.rest.protein_floor_per_kg));
  }
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
 * 4-b. 타이밍 보정 — 1끼 타깃의 단백질·탄수만 덮어쓴다.
 * 열량·나트륨·당류는 사용자가 고른 끼니 비중을 그대로 둔다(타이밍은 끼니를 대체하지 않는다).
 * rest 는 1끼 벡터를 바꾸지 않는다 — 휴식일의 규칙은 하루 총량(computeDailyTargets)에 있다.
 */
export function applyTimingTarget(target, timing, weight_kg) {
  const profile = TIMING_PROFILES[timing];
  if (!profile || timing === 'rest') return { ...target, timing: timing || null };

  const kg = Number(weight_kg) || 70;
  const byWeight = Math.round(profile.protein_per_kg * kg);
  const lo = profile.protein_min;
  const hi = profile.protein_max;

  // 권장은 점이 아니라 구간(20~40g)이다. 구간 안이면 손실 0이 되도록 밴드를 함께 넘긴다.
  // 점 타깃은 '끼니 타깃과 체중 환산값 중 큰 쪽을 구간 안으로 밀어넣은 값' — 끼니 타깃을 깎지 않는다.
  const P = Math.min(hi, Math.max(lo, byWeight, Number(target.P) || 0));
  const C = Math.round(profile.carb_per_kg * kg);
  return { ...target, P, P_band: [lo, hi], C, timing };
}

/**
 * 5. Fit Score — 가중 정규화 거리 (0~100)
 * timing 이 주어지면 목적별 가중치 대신 타이밍 가중치를 쓴다.
 */
export function computeFitScore(item, target, goal = 'diet', timing = null) {
  const weights = (timing && TIMING_FIT_WEIGHTS[timing]) || GOAL_WEIGHTS[goal] || GOAL_WEIGHTS.diet;

  // 단백질 권장 구간(운동 후 20~40g) — 구간 안이면 손실 0, 밖이면 가까운 경계에서부터 잰다.
  const band = Array.isArray(target.P_band) ? target.P_band : null;

  // 허용폭 tol
  const tol = {
    kcal: Math.max(100, target.kcal * 0.20),
    // 구간이 있으면 구간 폭의 절반을 허용폭으로 쓴다 — 점 타깃의 25%는 너무 좁아 3g만 모자라도 최대 감점이었다.
    P: band ? Math.max(5, (band[1] - band[0]) / 2) : Math.max(5, target.P * 0.25),
    C: Math.max(10, (target.C || 50) * 0.30),
    F: Math.max(5, (target.F || 15) * 0.30),
    Na: Math.max(200, target.Na * 0.40),
    Sugar: Math.max(5, target.Sugar * 0.50)
  };

  // 비대칭 방향 계수 dir
  const dirMultiplier = (key, val, tVal) => {
    if (key === 'P') {
      if (band && val >= band[0] && val <= band[1]) return 0; // 권장 구간 안 — 감점 없음
      if (val >= tVal) return 0.5; // 단백질 초과는 덜 나쁨
      // 운동 후에는 단백질 미달이 더 크게 깎인다 — 이 끼니의 목적 자체가 단백질이다.
      return timing === 'post' ? (TIMING_PROFILES.post.protein_under_dir || 1.5) : 1.0;
    }
    // 운동 직전의 지방 초과는 소화 부담으로 이어진다(수치 근거는 없어 정렬 보조로만 쓴다).
    if (key === 'F' && timing === 'pre' && val > tVal) return TIMING_PROFILES.pre.fat_over_dir || 2.0;
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

  const bandDiff = (val) => {
    if (val < band[0]) return band[0] - val;
    if (val > band[1]) return val - band[1];
    return 0;
  };

  let weightedLoss = 0;
  metrics.forEach(m => {
    const diff = (m.key === 'P' && band) ? bandDiff(m.val) : Math.abs(m.val - m.target);
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
export function generateReasonSentence(item, target, fitScore, goal = 'diet', timing = null) {
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
  if (timing === 'pre') {
    text += ` 운동 전 기준 탄수 ${target.C}g 목표에 ${Number(item.carb_g || 0)}g, 지방 ${Number(item.fat_g || 0)}g.`;
  } else if (timing === 'post') {
    const profile = TIMING_PROFILES.post;
    text += ` 운동 후 권장 구간 ${profile.protein_min}~${profile.protein_max}g 중 ${p}g.`;
  }
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
    TIMING_PROFILES,
    TIMING_FIT_WEIGHTS,
    TIMING_LABELS,
    computeBMR,
    computeTDEE,
    computeDailyTargets,
    computeMealTarget,
    applyTimingTarget,
    computeFitScore,
    generateReasonSentence
  };
}
