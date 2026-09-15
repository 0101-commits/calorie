// 프로틴레이더 영양 평가 및 워싱 판독 엔진 (score.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

export const DEFAULT_RULES = {
  cutoffs: {
    ppr: { A: 8.0, B: 5.0, C: 3.0 },
    cpd: { A: 12.0, B: 8.0, C: 5.5 },
    npi: { A: 25.0, B: 18.0, C: 12.0 },
    total_grade: { A: 3.3, B: 2.3, C: 1.3 }
  },
  q_weights: {
    Q1: 1.00,
    Q2: 0.90,
    Q3: 0.80,
    Q4: 0.70,
    Q5: 0.60
  }
};

/**
 * 1. PPR (Protein-Price Ratio, g/천원)
 * 수식: protein_g / (price_krw / 1000)
 */
export function computePPR(protein_g, price_krw) {
  if (!price_krw || price_krw <= 0) return 0;
  const ppr = Number(protein_g) / (Number(price_krw) / 1000);
  return Math.round(ppr * 10) / 10;
}

export function getPPRGrade(ppr, cutoffs = DEFAULT_RULES.cutoffs.ppr) {
  if (ppr >= cutoffs.A) return 'A';
  if (ppr >= cutoffs.B) return 'B';
  if (ppr >= cutoffs.C) return 'C';
  return 'D';
}

/**
 * 2. CPD (Calorie-Protein Density, g/100kcal)
 * 수식: protein_g / (kcal / 100)
 */
export function computeCPD(protein_g, kcal) {
  if (!kcal || kcal <= 0) return 0;
  const cpd = Number(protein_g) / (Number(kcal) / 100);
  return Math.round(cpd * 10) / 10;
}

export function getCPDGrade(cpd, cutoffs = DEFAULT_RULES.cutoffs.cpd) {
  if (cpd >= cutoffs.A) return 'A';
  if (cpd >= cutoffs.B) return 'B';
  if (cpd >= cutoffs.C) return 'C';
  return 'D';
}

/**
 * 3. NPI (Net Protein Index, 보정 g)
 * 수식: protein_g * Q * (1 - min(0.50, sum_penalty)) + bonus
 */
export function computeNPI(params, rules = DEFAULT_RULES) {
  const protein_g = Number(params.protein_g || 0);
  const qCode = params.protein_source || 'Q5';
  let Q = rules.q_weights[qCode] !== undefined ? rules.q_weights[qCode] : 0.60;
  if (params.secondary_low_q) {
    Q = Math.max(0.50, Q - 0.05);
  }

  const penalties = computePenalties(params);
  const totalPenalty = Math.min(0.50, penalties.totalDeduction);
  const bonus = Number(params.fiber_g || 0) >= 5 ? 1.0 : 0.0;

  const npi = protein_g * Q * (1.0 - totalPenalty) + bonus;
  return Math.round(npi * 10) / 10;
}

export function getNPIGrade(npi, cutoffs = DEFAULT_RULES.cutoffs.npi) {
  if (npi >= cutoffs.A) return 'A';
  if (npi >= cutoffs.B) return 'B';
  if (npi >= cutoffs.C) return 'C';
  return 'D';
}

/**
 * 유해요소 페널티 계산
 */
export function computePenalties(item) {
  const list = [];
  let totalDeduction = 0;

  const isFried = item.cooking === 'fried' || 
    (typeof item.name === 'string' && /튀김|프라이드|크리스피|튀긴|돈까스|치킨/.test(item.name));
  if (isFried) {
    list.push({ code: 'fried', label: '튀김', deduction: 0.15 });
    totalDeduction += 0.15;
  }

  const sodium = Number(item.sodium_mg || 0);
  if (sodium >= 1000) {
    const pct = Math.round((sodium / 2000) * 100);
    list.push({ code: 'sodium', label: `나트륨 ${pct}%`, deduction: 0.15, raw: sodium });
    totalDeduction += 0.15;
  }

  const satFat = Number(item.sat_fat_g || 0);
  if (satFat >= 10) {
    list.push({ code: 'sat_fat', label: `포화지방 ${satFat}g`, deduction: 0.15, raw: satFat });
    totalDeduction += 0.15;
  }

  const sugar = Number(item.sugar_g || 0);
  const protein = Number(item.protein_g || 0);
  if (sugar >= 20 || (sugar > 0 && sugar >= protein)) {
    list.push({ code: 'sugar', label: `당류 ${sugar}g`, deduction: 0.10, raw: sugar });
    totalDeduction += 0.10;
  }

  const transFat = Number(item.trans_fat_g || 0);
  if (transFat >= 0.5) {
    list.push({ code: 'trans_fat', label: `트랜스지방 ${transFat}g`, deduction: 0.10, raw: transFat });
    totalDeduction += 0.10;
  }

  const fiber = Number(item.fiber_g || 0);
  const bonus = fiber >= 5 ? { code: 'fiber', label: `식이섬유 ${fiber}g`, bonus: 1.0 } : null;

  return {
    items: list,
    bonus,
    totalDeduction: Math.round(totalDeduction * 100) / 100,
    cappedDeduction: Math.min(0.50, Math.round(totalDeduction * 100) / 100)
  };
}

/**
 * 4. 프로틴 워싱 판독 (PW Score: 0~100)
 */
export function computePW(item, categoryMedianPpr = null) {
  // 마케팅 강조 표기가 없으면 null (판독 대상 아님)
  if (!item.marketing_claim) {
    return null;
  }

  let score = 0;
  const breakdown = [];
  const protein = Number(item.protein_g || 0);
  const serving = Number(item.serving_g || 100);
  const kcal = Number(item.kcal || 0);
  const cpd = kcal > 0 ? (protein / (kcal / 100)) : 0;
  const isLiquid = item.category === '유제품/음료' || /음료|쉐이크|드링크|밀크|라떼/.test(item.name || '');

  // W2: 법적 '고단백' 3기준 검증
  // 고형 >=11g/100g, 액상 >=5.5g/100mL, 열량 >=5.5g/100kcal (CPD >= 5.5)
  const meetsSolid = !isLiquid && serving > 0 && ((protein / serving) * 100 >= 11.0);
  const meetsLiquid = isLiquid && serving > 0 && ((protein / serving) * 100 >= 5.5);
  const meetsKcal = cpd >= 5.5;

  const meetsAnyLegalHigh = meetsSolid || meetsLiquid || meetsKcal;
  if (!meetsAnyLegalHigh) {
    const claimStr = (item.claim_text || item.name || '').toLowerCase();
    const isWeakClaim = /함유|급원/.test(claimStr) && !/고단백|풍부|protein|프로틴/.test(claimStr);
    const w2Points = isWeakClaim ? 20 : 40;
    score += w2Points;
    breakdown.push({ code: 'W2', score: w2Points, reason: '법적 고단백 영양표시 기준 미달' });
  }

  // W3: sugar_g >= protein_g
  const sugar = Number(item.sugar_g || 0);
  if (sugar > 0 && sugar >= protein) {
    score += 20;
    breakdown.push({ code: 'W3', score: 20, reason: `당류(${sugar}g)가 단백질(${protein}g) 이상` });
  }

  // W4: sodium_mg / protein_g >= 60
  const sodium = Number(item.sodium_mg || 0);
  if (protein > 0 && (sodium / protein) >= 60) {
    score += 15;
    breakdown.push({ code: 'W4', score: 15, reason: `단백질당 나트륨 비율 과다 (${Math.round(sodium / protein)}mg/g >= 60)` });
  }

  // W5: sat_fat_g >= 10 || cooking === 'fried'
  const satFat = Number(item.sat_fat_g || 0);
  const isFried = item.cooking === 'fried' || /튀김|치킨|돈까스|크리스피/.test(item.name || '');
  if (satFat >= 10 || isFried) {
    score += 15;
    breakdown.push({ code: 'W5', score: 15, reason: '포화지방 10g 이상 또는 튀김 조리' });
  }

  // W6: PPR < 카테고리 중위수
  const ppr = computePPR(protein, item.price_krw);
  if (categoryMedianPpr !== null && ppr < categoryMedianPpr) {
    score += 10;
    breakdown.push({ code: 'W6', score: 10, reason: `동일 카테고리 가성비(PPR) 중위수 미달` });
  }

  score = Math.min(100, Math.max(0, score));

  let tier = 'verified'; // 검증 고단백
  let label = '검증 고단백';
  if (score >= 50) {
    tier = 'washing'; // 워싱 의심
    label = `워싱 의심 ${score}`;
  } else if (score >= 25) {
    tier = 'conditional'; // 조건부
    label = `조건부`;
  }

  return {
    score,
    tier,
    label,
    breakdown
  };
}

/**
 * 5. 종합 등급 계산
 * 세 지표 점수화: A=4, B=3, C=2, D=1 평균.
 * 워싱 의심(PW >= 50)이면 1단계 강등 (A->B, B->C, C->D, D->D)
 */
export function computeTotalGrade(pprGrade, cpdGrade, npiGrade, pwInfo = null, cutoffs = DEFAULT_RULES.cutoffs.total_grade) {
  const valMap = { A: 4, B: 3, C: 2, D: 1 };
  const pprVal = valMap[pprGrade] || 1;
  const cpdVal = valMap[cpdGrade] || 1;
  const npiVal = valMap[npiGrade] || 1;

  const avg = (pprVal + cpdVal + npiVal) / 3;

  let grade = 'D';
  if (avg >= cutoffs.A) grade = 'A';
  else if (avg >= cutoffs.B) grade = 'B';
  else if (avg >= cutoffs.C) grade = 'C';

  // 워싱 판정 🔴 (score >= 50)이면 종합 등급 1단계 강등
  if (pwInfo && pwInfo.tier === 'washing') {
    if (grade === 'A') grade = 'B';
    else if (grade === 'B') grade = 'C';
    else if (grade === 'C') grade = 'D';
  }

  return {
    grade,
    average: Math.round(avg * 100) / 100
  };
}

/**
 * 메뉴 1건의 전체 영양 평가 일괄 산출
 */
export function evaluateMenu(menu, options = {}) {
  const rules = options.rules || DEFAULT_RULES;
  const medianPpr = options.categoryMedianPpr !== undefined ? options.categoryMedianPpr : null;

  const ppr = computePPR(menu.protein_g, menu.price_krw);
  const pprGrade = getPPRGrade(ppr, rules.cutoffs.ppr);

  const cpd = computeCPD(menu.protein_g, menu.kcal);
  const cpdGrade = getCPDGrade(cpd, rules.cutoffs.cpd);

  const npi = computeNPI(menu, rules);
  const npiGrade = getNPIGrade(npi, rules.cutoffs.npi);

  const penalties = computePenalties(menu);
  const pwInfo = computePW(menu, medianPpr);

  const total = computeTotalGrade(pprGrade, cpdGrade, npiGrade, pwInfo, rules.cutoffs.total_grade);

  return {
    ...menu,
    ppr,
    ppr_grade: pprGrade,
    cpd,
    cpd_grade: cpdGrade,
    npi,
    npi_grade: npiGrade,
    pw: pwInfo ? pwInfo.score : null,
    pw_tier: pwInfo ? pwInfo.tier : null,
    pw_label: pwInfo ? pwInfo.label : null,
    pw_breakdown: pwInfo ? pwInfo.breakdown : [],
    grade: total.grade,
    grade_avg: total.average,
    penalties: penalties.items,
    fiber_bonus: penalties.bonus,
    computed_at: new Date().toISOString()
  };
}

if (typeof window !== 'undefined') {
  window.ProteinScore = {
    DEFAULT_RULES,
    computePPR,
    getPPRGrade,
    computeCPD,
    getCPDGrade,
    computeNPI,
    getNPIGrade,
    computePenalties,
    computePW,
    computeTotalGrade,
    evaluateMenu
  };
}
