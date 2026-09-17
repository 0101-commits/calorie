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
  // 기획안 v2.0 §2.2 — serving_g 가 영양성분 합계로 역산된 추정치면 이 검사는 정의상 통과하므로 제외한다.
  const servingEstimated = menu.serving_g_status === 'estimated';
  if (servingEstimated) {
    warnings.push({ rule: 'R2', message: '내용량이 추정치(역산)라 질량 정합성 검사를 건너뛰었습니다.' });
  }
  if (serving > 0 && !servingEstimated) {
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
  // 재확인 가능한 URL 이어야 출처로서 의미가 있다.
  if (menu.source_url && !/^https?:\/\/[^\s/]+\.[^\s/]+/.test(menu.source_url)) {
    errors.push({ rule: 'R5', message: `출처 URL 이 재확인 가능한 형식이 아닙니다(${menu.source_url}).` });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 브랜드가 다른데 원재료 문자열이 같은 묶음을 찾는다.
 *
 * 서로 다른 브랜드의 제품이 글자 하나까지 같은 원재료를 가질 수는 없다. 한쪽은 남의 제품 것이다.
 * 실측(2026-09-17)에서 동원참치의 원재료가 "닭가슴살(국내산 96%)…" 였고 87건이 그 문자열을 공유했다.
 * 빌드 게이트(G9)·점검 스크립트·격리 스크립트가 모두 이 함수를 쓴다.
 */
export function findCopiedIngredientGroups(items, minLength = 20) {
  const byRaw = new Map();
  for (const it of items || []) {
    const raw = String((it && it.ingredients_raw) || '').trim();
    if (raw.length < minLength) continue;
    if (!byRaw.has(raw)) byRaw.set(raw, []);
    byRaw.get(raw).push(it);
  }

  const groups = [];
  for (const [raw, group] of byRaw) {
    const brands = [...new Set(group.map(g => g.brand_code || g.brand))];
    if (brands.length < 2) continue;   // 같은 브랜드의 맛 변형은 정상이다
    groups.push({ ingredients_raw: raw, brands, items: group });
  }
  return groups.sort((a, b) => b.items.length - a.items.length);
}

if (typeof window !== 'undefined') {
  window.ProteinQA = {
    validateMenuQA,
    findCopiedIngredientGroups
  };
}
