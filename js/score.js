// 프로틴레이더 영양 평가 및 워싱 판독 엔진 (score.js)
// 규칙 버전: rules/rule_v1.1.json 이 단일 원천.
// 아래 DEFAULT_RULES 는 룰 파일을 주입하지 않은 호출(단위 테스트 픽스처)용 기본값이며,
// 빌드 파이프라인은 반드시 rules 를 주입한다(G5 게이트가 두 값의 불일치를 잡는다).

export const DEFAULT_RULES = {
  cutoffs: {
    ppr: { A: 8.0, B: 5.0, C: 3.0 },
    cpd: { A: 12.0, B: 8.0, C: 5.5 },
    npi: { A: 25.0, B: 18.0, C: 12.0 },
    total_grade: { A: 3.3, B: 2.3, C: 1.3 }
  },
  protein_source_q: {
    Q1: 1.0, Q2: 0.9, Q3: 0.8, Q4: 0.7, Q5: 0.6,
    Q_unknown: 0.6, secondary_low_q_penalty: 0.05, floor: 0.5
  },
  penalties: {
    fried: { deduction: 0.15, name_regex: '튀김|프라이드|크리스피|튀긴|돈까스|가라아게|탕수' },
    sodium: { threshold_mg: 1000, deduction: 0.15 },
    sat_fat: { threshold_g: 10, deduction: 0.15 },
    sugar: { threshold_g: 20, also_when_sugar_ge_protein: true, deduction: 0.10 },
    trans_fat: { threshold_g: 0.5, deduction: 0.10 },
    fiber_bonus: { threshold_g: 5, bonus_g: 1.0 },
    max_total_penalty: 0.50
  },
  protein_claims: {
    high_protein: { solid_g_per_100g: 11.0, liquid_g_per_100ml: 5.5, kcal_g_per_100kcal: 5.5 }
  },
  washing_rules: {
    W1: {
      strong_claim_regex: '고단백|하이프로틴|프로틴|protein|단백질\\s*\\d+\\s*g|더단백',
      weak_claim_regex: '단백질\\s*함유|급원|단백질이\\s*들어'
    },
    W2_strong_claim_fail: 40,
    W2_weak_claim_fail: 20,
    W3_sugar_over_protein: 20,
    W4_sodium_protein_ratio: 60,
    W4_score: 15,
    W5_fat_or_fried_score: 15,
    W6_below_median_ppr: 10,
    tiers: { verified_max: 24, conditional_max: 49, washing_min: 50 }
  },
  grade_eligibility: {
    required_measured: ['kcal', 'protein_g', 'price_krw'],
    penalty_inputs: ['sodium_mg', 'sat_fat_g', 'sugar_g'],
    max_unknown_penalty_inputs: 1
  }
};

/* ────────────────────────────────────────────────────────────
   필드 신뢰도 — 기획안 v2.0 §4.2
   값(value)과 상태(status)를 분리한다. 상태가 unknown 이면 "0"이 아니라
   "모른다"이며, 페널티 면제가 아니라 판정 보류로 이어진다.
   ──────────────────────────────────────────────────────────── */

/** 필드의 신뢰도 상태를 읽는다. `${field}_status` 가 없으면 값 존재 여부로 추론. */
export function fieldStatus(item, field) {
  const explicit = item[`${field}_status`];
  if (explicit) return explicit;
  const v = item[field];
  if (v === null || v === undefined || v === '') return 'unknown';
  return 'measured';
}

/** 계산에 쓸 수 있는 값인가(unknown 이 아닌가). */
function isKnown(item, field) {
  return fieldStatus(item, field) !== 'unknown';
}

function numOf(item, field) {
  return Number(item[field] || 0);
}

/**
 * 1. PPR (Protein-Price Ratio, g/천원) = protein_g / (price_krw / 1000)
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
 * 2. CPD (Calorie-Protein Density, g/100kcal) = protein_g / (kcal / 100)
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
 * 3. NPI (Net Protein Index, 보정 g) = protein_g × Q × (1 − min(cap, Σpenalty)) + bonus
 */
export function computeNPI(params, rules = DEFAULT_RULES) {
  const q = rules.protein_source_q || DEFAULT_RULES.protein_source_q;
  const protein_g = Number(params.protein_g || 0);

  // F3 — protein_source 미상은 조용한 폴백이 아니라 명시 상수 Q_unknown 을 쓴다.
  const qCode = params.protein_source;
  let Q;
  if (qCode && q[qCode] !== undefined) {
    Q = q[qCode];
  } else {
    Q = q.Q_unknown !== undefined ? q.Q_unknown : 0.6;
  }
  if (params.secondary_low_q) {
    Q = Math.max(q.floor !== undefined ? q.floor : 0.5, Q - (q.secondary_low_q_penalty || 0.05));
  }

  const penalties = computePenalties(params, rules);
  const cap = (rules.penalties || DEFAULT_RULES.penalties).max_total_penalty;
  const totalPenalty = Math.min(cap, penalties.totalDeduction);
  const bonus = penalties.bonus ? penalties.bonus.bonus : 0;

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
 * 유해요소 페널티 계산.
 * 반환값의 unresolved 는 "판정에 필요한데 값을 모르는" 항목이다 — 이 목록이 비어야
 * 페널티 합계를 신뢰할 수 있다.
 */
export function computePenalties(item, rules = DEFAULT_RULES) {
  const P = rules.penalties || DEFAULT_RULES.penalties;
  const list = [];
  const unresolved = [];
  let totalDeduction = 0;

  // ── 튀김 (F1) ──
  // cooking 이 실측이면 그 값만 믿는다. 이름 정규식은 cooking 이 unknown 일 때의
  // 보조 추정으로만 쓰고, 그때는 estimated 표식을 남긴다.
  const friedRe = new RegExp(P.fried.name_regex);
  const cooking = item.cooking;
  if (cooking === 'fried') {
    list.push({ code: 'fried', label: '튀김', deduction: P.fried.deduction, estimated: false });
    totalDeduction += P.fried.deduction;
  } else if (!cooking || cooking === 'unknown') {
    if (typeof item.name === 'string' && friedRe.test(item.name)) {
      list.push({ code: 'fried', label: '튀김(제품명 추정)', deduction: P.fried.deduction, estimated: true });
      totalDeduction += P.fried.deduction;
    } else {
      unresolved.push('cooking');
    }
  }

  // ── 나트륨 ──
  if (isKnown(item, 'sodium_mg')) {
    const sodium = numOf(item, 'sodium_mg');
    if (sodium >= P.sodium.threshold_mg) {
      const pct = Math.round((sodium / 2000) * 100);
      list.push({ code: 'sodium', label: `나트륨 ${pct}%`, deduction: P.sodium.deduction, raw: sodium });
      totalDeduction += P.sodium.deduction;
    }
  } else {
    unresolved.push('sodium_mg');
  }

  // ── 포화지방 ──
  if (isKnown(item, 'sat_fat_g')) {
    const satFat = numOf(item, 'sat_fat_g');
    if (satFat >= P.sat_fat.threshold_g) {
      list.push({ code: 'sat_fat', label: `포화지방 ${satFat}g`, deduction: P.sat_fat.deduction, raw: satFat });
      totalDeduction += P.sat_fat.deduction;
    }
  } else {
    unresolved.push('sat_fat_g');
  }

  // ── 당류 (F2: sugar >= protein 조항을 룰에서 읽는다) ──
  if (isKnown(item, 'sugar_g')) {
    const sugar = numOf(item, 'sugar_g');
    const protein = numOf(item, 'protein_g');
    const overThreshold = sugar >= P.sugar.threshold_g;
    const overProtein = P.sugar.also_when_sugar_ge_protein && sugar > 0 && sugar >= protein;
    if (overThreshold || overProtein) {
      list.push({
        code: 'sugar',
        label: overThreshold ? `당류 ${sugar}g` : `당류 ${sugar}g > 단백질 ${protein}g`,
        deduction: P.sugar.deduction,
        raw: sugar,
        reason: overThreshold ? 'threshold' : 'over_protein'
      });
      totalDeduction += P.sugar.deduction;
    }
  } else {
    unresolved.push('sugar_g');
  }

  // ── 트랜스지방 ──
  if (isKnown(item, 'trans_fat_g')) {
    const transFat = numOf(item, 'trans_fat_g');
    if (transFat >= P.trans_fat.threshold_g) {
      list.push({ code: 'trans_fat', label: `트랜스지방 ${transFat}g`, deduction: P.trans_fat.deduction, raw: transFat });
      totalDeduction += P.trans_fat.deduction;
    }
  } else {
    unresolved.push('trans_fat_g');
  }

  // ── 식이섬유 보너스 ──
  let bonus = null;
  if (isKnown(item, 'fiber_g')) {
    const fiber = numOf(item, 'fiber_g');
    if (fiber >= P.fiber_bonus.threshold_g) {
      bonus = { code: 'fiber', label: `식이섬유 ${fiber}g`, bonus: P.fiber_bonus.bonus_g };
    }
  } else {
    unresolved.push('fiber_g');
  }

  totalDeduction = Math.round(totalDeduction * 100) / 100;

  return {
    items: list,
    bonus,
    unresolved,
    totalDeduction,
    cappedDeduction: Math.min(P.max_total_penalty, totalDeduction)
  };
}

/**
 * W1 — 마케팅 표기 강도 판정 (F4).
 * 반환: 'strong' | 'weak' | 'none'
 * 표기가 없으면 워싱 판독 대상이 아니다. 단백질을 내세우지 않은 삼각김밥은
 * 단백질이 적어도 '워싱'이 아니라는 기획서 §1.6 전제를 코드로 옮긴 것이다.
 */
export function detectClaimStrength(item, rules = DEFAULT_RULES) {
  const W1 = (rules.washing_rules || DEFAULT_RULES.washing_rules).W1;
  const haystack = `${item.claim_text || ''} ${item.name || ''}`.toLowerCase();

  const strongRe = new RegExp(W1.strong_claim_regex, 'i');
  const weakRe = new RegExp(W1.weak_claim_regex, 'i');

  if (weakRe.test(haystack) && !strongRe.test(haystack)) return 'weak';
  if (strongRe.test(haystack)) return 'strong';

  // 정규식에 안 걸려도 수집 단계에서 표기를 확인했다면 강한 표기로 본다.
  if (item.marketing_claim) return 'strong';
  return 'none';
}

/**
 * 4. 프로틴 워싱 판독 (PW Score: 0~100)
 */
export function computePW(item, categoryMedianPpr = null, rules = DEFAULT_RULES) {
  const R = rules.washing_rules || DEFAULT_RULES.washing_rules;
  const claims = (rules.protein_claims || DEFAULT_RULES.protein_claims).high_protein;

  // W1: 표기 전제
  const claimStrength = detectClaimStrength(item, rules);
  if (claimStrength === 'none') return null;

  let score = 0;
  const breakdown = [{ code: 'W1', score: 0, reason: claimStrength === 'weak' ? '약한 단백질 표기' : '단백질 강조 표기' }];

  const protein = Number(item.protein_g || 0);
  const serving = Number(item.serving_g || 100);
  const kcal = Number(item.kcal || 0);
  const cpd = kcal > 0 ? (protein / (kcal / 100)) : 0;
  const isLiquid = item.category === '유제품/음료' || /음료|쉐이크|드링크|밀크|라떼/.test(item.name || '');

  // W2: 법적 '고단백' 3기준 검증
  const meetsSolid = !isLiquid && serving > 0 && ((protein / serving) * 100 >= claims.solid_g_per_100g);
  const meetsLiquid = isLiquid && serving > 0 && ((protein / serving) * 100 >= claims.liquid_g_per_100ml);
  const meetsKcal = cpd >= claims.kcal_g_per_100kcal;

  if (!(meetsSolid || meetsLiquid || meetsKcal)) {
    const w2 = claimStrength === 'weak' ? R.W2_weak_claim_fail : R.W2_strong_claim_fail;
    score += w2;
    breakdown.push({ code: 'W2', score: w2, reason: '법적 고단백 영양표시 기준 미달' });
  }

  // W3: sugar_g >= protein_g
  if (isKnown(item, 'sugar_g')) {
    const sugar = Number(item.sugar_g || 0);
    if (sugar > 0 && sugar >= protein) {
      score += R.W3_sugar_over_protein;
      breakdown.push({ code: 'W3', score: R.W3_sugar_over_protein, reason: `당류(${sugar}g)가 단백질(${protein}g) 이상` });
    }
  }

  // W4: sodium_mg / protein_g >= 60
  if (isKnown(item, 'sodium_mg')) {
    const sodium = Number(item.sodium_mg || 0);
    if (protein > 0 && (sodium / protein) >= R.W4_sodium_protein_ratio) {
      score += R.W4_score;
      breakdown.push({ code: 'W4', score: R.W4_score, reason: `단백질당 나트륨 ${Math.round(sodium / protein)}mg/g (기준 ${R.W4_sodium_protein_ratio} 이상)` });
    }
  }

  // W5: sat_fat_g >= 10 || 튀김 (F1 — 이름 정규식은 cooking 미상일 때만)
  const friedRe = new RegExp((rules.penalties || DEFAULT_RULES.penalties).fried.name_regex);
  const friedByCooking = item.cooking === 'fried';
  const friedByName = (!item.cooking || item.cooking === 'unknown') && friedRe.test(item.name || '');
  const satFatHigh = isKnown(item, 'sat_fat_g') && Number(item.sat_fat_g || 0) >= 10;
  if (satFatHigh || friedByCooking || friedByName) {
    score += R.W5_fat_or_fried_score;
    breakdown.push({ code: 'W5', score: R.W5_fat_or_fried_score, reason: satFatHigh ? '포화지방 10g 이상' : '튀김 조리' });
  }

  // W6: PPR < 카테고리 중위수
  const ppr = computePPR(protein, item.price_krw);
  if (categoryMedianPpr !== null && ppr < categoryMedianPpr) {
    score += R.W6_below_median_ppr;
    breakdown.push({ code: 'W6', score: R.W6_below_median_ppr, reason: '동일 카테고리 가성비(PPR) 중위수 미달' });
  }

  score = Math.min(100, Math.max(0, score));

  let tier = 'verified';
  let label = '검증 고단백';
  if (score >= R.tiers.washing_min) {
    tier = 'washing';
    label = `워싱 의심 ${score}`;
  } else if (score > R.tiers.verified_max) {
    tier = 'conditional';
    label = '조건부';
  }

  return { score, tier, label, breakdown, claimStrength };
}

/**
 * 5. 종합 등급 계산
 */
export function computeTotalGrade(pprGrade, cpdGrade, npiGrade, pwInfo = null, cutoffs = DEFAULT_RULES.cutoffs.total_grade) {
  const valMap = { A: 4, B: 3, C: 2, D: 1 };
  const avg = ((valMap[pprGrade] || 1) + (valMap[cpdGrade] || 1) + (valMap[npiGrade] || 1)) / 3;

  let grade = 'D';
  if (avg >= cutoffs.A) grade = 'A';
  else if (avg >= cutoffs.B) grade = 'B';
  else if (avg >= cutoffs.C) grade = 'C';

  if (pwInfo && pwInfo.tier === 'washing') {
    if (grade === 'A') grade = 'B';
    else if (grade === 'B') grade = 'C';
    else if (grade === 'C') grade = 'D';
  }

  return { grade, average: Math.round(avg * 100) / 100 };
}

/**
 * 등급 판정 가능 여부 — 기획안 v2.0 §5.2
 * 필수 3필드가 실측이 아니거나, 페널티 입력 3종 중 허용치를 넘는 unknown 이 있으면
 * 등급을 매기지 않는다(면제가 아니라 보류).
 */
export function computeGradeEligibility(item, rules = DEFAULT_RULES) {
  const cfg = rules.grade_eligibility || DEFAULT_RULES.grade_eligibility;
  const missingRequired = cfg.required_measured.filter(f => fieldStatus(item, f) !== 'measured');
  const unknownPenaltyInputs = cfg.penalty_inputs.filter(f => fieldStatus(item, f) === 'unknown');

  const eligible = missingRequired.length === 0 &&
    unknownPenaltyInputs.length <= cfg.max_unknown_penalty_inputs;

  return {
    eligible,
    missing_required: missingRequired,
    unknown_penalty_inputs: unknownPenaltyInputs
  };
}

/** 레코드의 필수 필드 실측 비율 */
export function computeCompleteness(item, rules = DEFAULT_RULES) {
  const cfg = rules.grade_eligibility || DEFAULT_RULES.grade_eligibility;
  const fields = [...cfg.required_measured, ...cfg.penalty_inputs, 'serving_g'];
  const measured = fields.filter(f => fieldStatus(item, f) === 'measured').length;
  return Math.round((measured / fields.length) * 100) / 100;
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

  const penalties = computePenalties(menu, rules);
  const pwInfo = computePW(menu, medianPpr, rules);
  const total = computeTotalGrade(pprGrade, cpdGrade, npiGrade, pwInfo, rules.cutoffs.total_grade);

  const eligibility = computeGradeEligibility(menu, rules);

  return {
    ...menu,
    ppr,
    ppr_grade: pprGrade,
    cpd,
    cpd_grade: cpdGrade,
    npi,
    // 페널티 입력을 모르면 NPI 등급은 매기지 않는다 — 감점 없는 것과 모르는 것은 다르다.
    npi_grade: eligibility.eligible ? npiGrade : null,
    pw: pwInfo ? pwInfo.score : null,
    pw_tier: pwInfo ? pwInfo.tier : null,
    pw_label: pwInfo ? pwInfo.label : null,
    pw_breakdown: pwInfo ? pwInfo.breakdown : [],
    claim_strength: pwInfo ? pwInfo.claimStrength : 'none',
    grade: eligibility.eligible ? total.grade : null,
    grade_avg: eligibility.eligible ? total.average : null,
    grade_eligible: eligibility.eligible,
    grade_hold_reason: eligibility.eligible ? null : {
      missing_required: eligibility.missing_required,
      unknown_penalty_inputs: eligibility.unknown_penalty_inputs
    },
    completeness: computeCompleteness(menu, rules),
    penalties: penalties.items,
    penalty_unresolved: penalties.unresolved,
    fiber_bonus: penalties.bonus,
    computed_at: new Date().toISOString()
  };
}

if (typeof window !== 'undefined') {
  window.ProteinScore = {
    DEFAULT_RULES,
    fieldStatus,
    computePPR,
    getPPRGrade,
    computeCPD,
    getCPDGrade,
    computeNPI,
    getNPIGrade,
    computePenalties,
    detectClaimStrength,
    computePW,
    computeTotalGrade,
    computeGradeEligibility,
    evaluateMenu
  };
}
