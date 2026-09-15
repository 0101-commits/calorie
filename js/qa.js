// 유효성 검증 QA 룰셋 엔진 (qa.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

/**
 * 메뉴 1건에 대해 R1~R5 유효성 검사 수행
 * @param {Object} menu - 검사 대상 메뉴
 * @param {Set|Array} existingIds - 기존 등록된 menu_id 목록 (중복 검사용)
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
export function validateMenuQA(menu, existingIds = new Set()) {
  const errors = [];
  const warnings = [];

  const kcal = Number(menu.kcal);
  const p = Number(menu.protein_g);
  const c = menu.carb_g !== null && menu.carb_g !== undefined ? Number(menu.carb_g) : null;
  const f = menu.fat_g !== null && menu.fat_g !== undefined ? Number(menu.fat_g) : null;
  const sugar = menu.sugar_g !== null && menu.sugar_g !== undefined ? Number(menu.sugar_g) : null;
  const satFat = menu.sat_fat_g !== null && menu.sat_fat_g !== undefined ? Number(menu.sat_fat_g) : null;
  const sodium = Number(menu.sodium_mg || 0);
  const serving = Number(menu.serving_g || 0);
  const price = Number(menu.price_krw || 0);

  // R1: 열량 정합성
  if (kcal <= 0) {
    errors.push({ rule: 'R1', message: '열량(kcal)은 0보다 커야 합니다.' });
  } else if (c !== null && f !== null) {
    const calcKcal = 4 * p + 4 * c + 9 * f;
    const diffRatio = Math.abs(calcKcal - kcal) / kcal;
    if (diffRatio > 0.15) {
      warnings.push({ rule: 'R1', message: `열량 오차 과다 (표기 ${kcal} vs 계산 ${Math.round(calcKcal)}, 오차 ${Math.round(diffRatio * 100)}% > 15%)` });
    }
  } else {
    // 탄수/지방 누락 시 4*P <= kcal 만 검사
    if (4 * p > kcal * 1.05) {
      errors.push({ rule: 'R1', message: `단백질 열량(${Math.round(4 * p)}kcal)이 총 열량(${kcal}kcal)을 초과합니다.` });
    }
  }

  // R2: 질량 정합성
  if (serving > 0) {
    if (p > serving) errors.push({ rule: 'R2', message: `단백질(${p}g)이 총 내용량(${serving}g)을 초과합니다.` });
    if (c !== null && c > serving) errors.push({ rule: 'R2', message: `탄수화물(${c}g)이 총 내용량(${serving}g)을 초과합니다.` });
    if (f !== null && f > serving) errors.push({ rule: 'R2', message: `지방(${f}g)이 총 내용량(${serving}g)을 초과합니다.` });

    if (c !== null && f !== null) {
      const totalNutrientMass = p + c + f + (sodium / 1000);
      if (totalNutrientMass > serving * 1.05) {
        errors.push({ rule: 'R2', message: `영양소 합산 질량(${Math.round(totalNutrientMass)}g)이 총 내용량(${serving}g)의 105%를 초과합니다.` });
      }
    }

    if (sugar !== null && c !== null && sugar > c * 1.05) {
      errors.push({ rule: 'R2', message: `당류(${sugar}g)가 탄수화물(${c}g)을 초과합니다.` });
    }
    if (satFat !== null && f !== null && satFat > f * 1.05) {
      errors.push({ rule: 'R2', message: `포화지방(${satFat}g)이 총 지방(${f}g)을 초과합니다.` });
    }
  }

  // R3: 범위 및 이상치
  if (price < 500 || price > 30000) {
    errors.push({ rule: 'R3', message: `가격(${price}원)이 허용 범위(500~30,000원)를 벗어났습니다.` });
  }
  if (p < 0 || p > 80) {
    errors.push({ rule: 'R3', message: `단백질(${p}g)이 허용 범위(0~80g)를 벗어났습니다.` });
  }
  if (sodium < 0 || sodium > 4000) {
    errors.push({ rule: 'R3', message: `나트륨(${sodium}mg)이 허용 범위(0~4,000mg)를 벗어났습니다.` });
  }
  if (kcal > 2000) {
    warnings.push({ rule: 'R3', message: `열량(${kcal}kcal)이 일반 식품 허용 한도(2,000kcal)를 초과합니다.` });
  }

  // R4: 중복 검사
  const idSet = existingIds instanceof Set ? existingIds : new Set(existingIds);
  if (menu.menu_id && idSet.has(menu.menu_id)) {
    warnings.push({ rule: 'R4', message: `중복된 menu_id(${menu.menu_id})입니다. 업데이트 후보로 취급됩니다.` });
  }

  // R5: 출처 완결성
  const requiredProvenance = ['source_type', 'verified_at', 'rule_version'];
  for (const field of requiredProvenance) {
    if (!menu[field]) {
      errors.push({ rule: 'R5', message: `필수 출처 필드(${field})가 누락되었습니다.` });
    }
  }
  if (!menu.source_url && !menu.image_hash) {
    errors.push({ rule: 'R5', message: '출처 URL(source_url) 또는 이미지 해시(image_hash) 중 하나는 필수입니다.' });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

if (typeof window !== 'undefined') {
  window.ProteinQA = {
    validateMenuQA
  };
}
