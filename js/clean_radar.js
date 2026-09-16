// 프로틴레이더 화해(Hwahae)형 원재료·첨가물 안심 분석 엔진 (clean_radar.js)
// 기획서 v1.2 (CleanRadar: 전성분 4단계 컬러 바 및 4대 심층 체커)

/**
 * 성분 안전도 4단계 분류 정의:
 * Tier 1 (good)   : 🟢 안심/유익 성분 (천연 고품질 원육, WPI, 알룰로스, 스테비아, 올리브유 등)
 * Tier 2 (neutral): ⚪ 일반/무해 성분 (정제수, 식염, 쌀, 대두, 비타민C 등)
 * Tier 3 (caution): 🟡 주의/조건부 성분 (말티톨, 수크랄로스, 변성전분, 카라기난, MSG 등)
 * Tier 4 (bad)    : 🔴 기피/워싱 성분 (액상과당, 정제설탕, 쇼트닝/마가린, 아질산나트륨, 타르색소 등)
 */

export const INGREDIENT_DICTIONARY = [
  // ── 1. 당류 및 감미료 ──
  {
    keywords: ['알룰로스', '알룰로오스', 'd-알룰로스', 'd-알룰로오스'],
    name: '알룰로스',
    tier: 1,
    category: 'sweetener',
    title: '혈당 스파이크 없는 0kcal 천연 대체당',
    desc: '체내 흡수되지 않고 98% 이상 소변으로 배출되는 최우수 안심 감미료입니다.'
  },
  {
    keywords: ['스테비아', '효소처리스테비아', '스테비올배당체'],
    name: '스테비아',
    tier: 1,
    category: 'sweetener',
    title: '식물 유래 천연 0kcal 감미료',
    desc: '국화과 식물에서 추출한 천연 감미료로 혈당과 인슐린에 영향을 주지 않습니다.'
  },
  {
    keywords: ['에리스리톨', '에리트리톨'],
    name: '에리스리톨',
    tier: 1,
    category: 'sweetener',
    title: '체내 대사 없는 발효 당알코올',
    desc: '혈당 지수(GI)가 0인 안심 감미료입니다. 대량 섭취 시 가벼운 복부 팽만이 생길 수 있습니다.'
  },
  {
    keywords: ['나한과', '몽크프룻'],
    name: '나한과추출물',
    tier: 1,
    category: 'sweetener',
    title: '천연 과일 추출 0kcal 감미료',
    desc: '나한과 열매에서 추출한 고감미 천연 대체당으로 혈당 부담이 없습니다.'
  },
  {
    keywords: ['프락토올리고당', '이소말토올리고당', '올리고당', '갈락토올리고당'],
    name: '올리고당',
    tier: 2,
    category: 'sweetener',
    title: '장내 유익균 먹이가 되는 기능성 당',
    desc: '설탕보다 칼로리가 낮고 식이섬유 성분이 포함된 일반 감미 원료입니다.'
  },
  {
    keywords: ['말티톨', 'd-말티톨', '말티톨시럽'],
    name: '말티톨',
    tier: 3,
    category: 'sweetener',
    title: '⚠️ 혈당 상승 및 복통 유발 주의 당알코올',
    desc: '설탕의 약 50~60% 수준으로 혈당(GI 35~52)을 올리며, 장내 흡수가 덜 되어 설사를 유발합니다.'
  },
  {
    keywords: ['소르비톨', 'd-소르비톨'],
    name: '소르비톨',
    tier: 3,
    category: 'sweetener',
    title: '복부 팽만·설사 유발 가능 당알코올',
    desc: '과량 섭취 시 장내 수분을 끌어들여 복부 불편감과 배변 장애를 유발할 수 있습니다.'
  },
  {
    keywords: ['자일리톨'],
    name: '자일리톨',
    tier: 2,
    category: 'sweetener',
    title: '충치 예방 기능성 당알코올',
    desc: '설탕 대비 혈당 상승이 완만하나 과량 섭취 시 완화 작용(설사)이 있을 수 있습니다.'
  },
  {
    keywords: ['수크랄로스'],
    name: '수크랄로스',
    tier: 3,
    category: 'sweetener',
    title: '합성 고감미 감미료 (단맛 600배)',
    desc: '칼로리는 0이나, 과다 섭취 시 장내 미생물총 균형 교란 및 단맛 의존성 우려가 있습니다.'
  },
  {
    keywords: ['아세설팜칼륨', '아세설팜k'],
    name: '아세설팜칼륨',
    tier: 3,
    category: 'sweetener',
    title: '합성 무열량 감미료',
    desc: '체내에 축적되지 않고 배출되나 합성 첨가물로서 섭취량 조절이 권장됩니다.'
  },
  {
    keywords: ['아스파탐'],
    name: '아스파탐',
    tier: 3,
    category: 'sweetener',
    title: '합성 감미료 (페닐케톤뇨증 주의)',
    desc: '열량이 낮아 널리 쓰이나 합성 인공 감미료로 장기 과다 섭취는 주의가 필요합니다.'
  },
  {
    keywords: ['말토덱스트린', '덱스트린'],
    name: '말토덱스트린',
    tier: 3,
    category: 'sweetener',
    title: '⚠️ 설탕보다 높은 초고혈당 탄수화물 (GI 85~105)',
    desc: '포장재 표기상 당류에 안 잡힐 수 있으나, 실제 체내에서는 설탕보다 빠르게 혈당을 치솟게 합니다.'
  },
  {
    keywords: ['액상과당', '고과당', '기타과당', '고과당콘시럽', 'hfcs'],
    name: '액상과당 (HFCS)',
    tier: 4,
    category: 'sweetener',
    title: '🚨 다이어트 최악의 흡수당 (지방간·비만 직결)',
    desc: '간에서 직접 지방으로 전환되어 내장지방과 지방간을 급격히 축적시키고 인슐린 저항성을 유발합니다.'
  },
  {
    keywords: ['백설탕', '설탕', '정제설탕', '갈색설탕', '흑설탕', '원당'],
    name: '설탕 (정제당)',
    tier: 4,
    category: 'sweetener',
    title: '혈당 급상승 정제 단순당',
    desc: '영양소 없이 칼로리만 높은 정제당으로 급격한 인슐린 분비와 체지방 축적을 유발합니다.'
  },
  {
    keywords: ['물엿', '맥아당', '요리당', '조청'],
    name: '물엿/맥아당',
    tier: 4,
    category: 'sweetener',
    title: '단순 당류 농축액',
    desc: '혈당 스파이크와 칼로리 과다를 일으키는 단순 정제 감미원료입니다.'
  },

  // ── 2. 단백질 원천 ──
  {
    keywords: ['닭가슴살', '국내산닭가슴살', '닭안심', '닭고기'],
    name: '닭가슴살 원육',
    tier: 1,
    category: 'protein',
    title: '1등급 순수 동물성 프리미엄 원육',
    desc: '생체 이용률과 BCAA 함량이 가장 우수한 최상위 순수 고단백 원물입니다.'
  },
  {
    keywords: ['분리유청단백', 'wpi', '분리유청단백분말'],
    name: '분리유청단백 (WPI)',
    tier: 1,
    category: 'protein',
    title: '유당 99% 제거 최고급 유청단백',
    desc: '유당불내증 걱정 없이 빠르게 흡수되는 순도 90% 이상의 최고급 단백질입니다.'
  },
  {
    keywords: ['가수분해유청단백', 'wph'],
    name: '가수분해유청단백 (WPH)',
    tier: 1,
    category: 'protein',
    title: '초고속 흡수 프리미엄 단백질',
    desc: '단백질 펩타이드 결합을 잘라 체내 소화 흡수 속도를 극대화한 원료입니다.'
  },
  {
    keywords: ['계란', '난백', '난백액', '달걀', '난백분말'],
    name: '계란/난백',
    tier: 1,
    category: 'protein',
    title: '생물가 100의 완전 단백질',
    desc: '필수 아미노산 조성이 완벽한 자연식 고품질 단백질입니다.'
  },
  {
    keywords: ['소고기', '우육', '돼지고기', '돈육', '돈안심', '연어', '명태'],
    name: '자연산 원육/생선살',
    tier: 1,
    category: 'protein',
    title: '자연식 순수 동물성 단백질',
    desc: '가공되지 않은 순수 원육으로 양질의 단백질과 미네랄을 공급합니다.'
  },
  {
    keywords: ['두부', '대두', '대두단백'],
    name: '두부/자연대두',
    tier: 1,
    category: 'protein',
    title: '식물성 클린 단백질',
    desc: '이소플라본과 식이섬유가 풍부한 건강한 식물성 단백질 원물입니다.'
  },
  {
    keywords: ['농축유청단백', 'wpc', '우유단백', '유청단백'],
    name: '농축유청단백 (WPC)',
    tier: 2,
    category: 'protein',
    title: '표준 유청단백질 (순도 80%)',
    desc: '면역 글로불린이 풍부하나 미량의 유당이 있어 심한 유당불내증 시 가스가 찰 수 있습니다.'
  },
  {
    keywords: ['카제인', '카제인나트륨', '미셀라카제인'],
    name: '카제인단백질',
    tier: 2,
    category: 'protein',
    title: '지속 흡수형 우유 단백질',
    desc: '위장에서 천천히 분해되어 장시간 포만감과 아미노산을 공급합니다.'
  },
  {
    keywords: ['분리대두단백', 'isp'],
    name: '분리대두단백 (ISP)',
    tier: 2,
    category: 'protein',
    title: '가공 식물성 분리 단백',
    desc: '대두에서 단백질만 분리 농축한 표준 식물성 원료로 가성비가 우수합니다.'
  },
  {
    keywords: ['분쇄가공육', '성형육', '어육', '크래미', '맛살'],
    name: '성형육/어육가공품',
    tier: 3,
    category: 'protein',
    title: '가공 분쇄육 (밀가루·전분 배합)',
    desc: '원육 함량이 낮고 밀가루, 결착제, 조미료가 섞여 순수 단백질 비중이 떨어집니다.'
  },
  {
    keywords: ['밀글루텐', '활성글루텐', '글루텐'],
    name: '밀글루텐 (함량뻥튀기)',
    tier: 4,
    category: 'protein',
    title: '⚠️ 단백질 수치 뻥튀기용 저품질 글루텐',
    desc: '아미노산 조성이 불완전하고 소화흡수율이 낮으며 장 점막 염증 및 복부 팽만을 유발할 수 있습니다.'
  },
  {
    keywords: ['젤라틴', '콜라겐', '피쉬콜라겐'],
    name: '젤라틴/콜라겐 (불완전단백)',
    tier: 3,
    category: 'protein',
    title: '근육 합성에 불리한 불완전 단백질',
    desc: '필수 아미노산인 트립토판이 결핍되어 있어 단백질 총량 수치는 채우나 근합성 효율은 낮습니다.'
  },

  // ── 3. 지방 및 유지류 ──
  {
    keywords: ['올리브유', '엑스트라버진올리브유', '아보카도오일'],
    name: '올리브유/아보카도유',
    tier: 1,
    category: 'fat',
    title: '심혈관에 유익한 프리미엄 불포화지방',
    desc: '항산화 물질과 올레산이 풍부하여 혈관 건강과 염증 완화에 도움을 줍니다.'
  },
  {
    keywords: ['카놀라유', '대두유', '옥수수유', '해바라기유', '현미유'],
    name: '식물성 식용유',
    tier: 2,
    category: 'fat',
    title: '일반 식물성 정제유',
    desc: '통상적인 조리에 사용되는 표준적인 식물성 유지 원료입니다.'
  },
  {
    keywords: ['팜유', '팜올레인유', '우지', '돈지'],
    name: '팜유/동물성지방',
    tier: 3,
    category: 'fat',
    title: '포화지방 함량이 높은 유지',
    desc: '산화 안정성은 높으나 포화지방 비율이 높아 과다 섭취 시 LDL 콜레스테롤 상승 우려가 있습니다.'
  },
  {
    keywords: ['쇼트닝', '마가린', '부분경화유', '경화유', '가공유지'],
    name: '쇼트닝/마가린 (트랜스지방 위험)',
    tier: 4,
    category: 'fat',
    title: '🚨 혈관 건강 기피 경화유지',
    desc: '액체 기름에 수소를 첨가해 굳힌 인공 유지로, 심혈관 질환과 염증의 주요 원인입니다.'
  },

  // ── 4. 식품첨가물, 보존료, 색소 ──
  {
    keywords: ['식이섬유', '난소화성말토덱스트린', '치커리추출물', '아카시아식이섬유'],
    name: '수용성 식이섬유',
    tier: 1,
    category: 'additive',
    title: '혈당 완충 및 장 건강 유익 성분',
    desc: '탄수화물의 흡수 속도를 늦추고 장내 유익균 증식을 돕는 안심 원료입니다.'
  },
  {
    keywords: ['비타민c', 'l-아스코브산', '구연산', '레시틴', '대두레시틴', '탄산수소나트륨', '정제수', '천일염'],
    name: '표준 안심 식품원료',
    tier: 2,
    category: 'additive',
    title: '식품 안전 공전 표준 원료',
    desc: '독성이 없고 인체 대사에 무해한 표준 원재료입니다.'
  },
  {
    keywords: ['카라기난', '카라기닌'],
    name: '카라기난',
    tier: 3,
    category: 'additive',
    title: '⚠️ 장 점막 자극 논란 증점제',
    desc: '음료와 단백질 쉐이크의 걸쭉한 질감을 만드나, 장이 예민한 분에게 염증 유발 가능성이 보고됩니다.'
  },
  {
    keywords: ['l-글루탐산나트륨', '향미증진제', 'msg', '핵산'],
    name: '향미증진제 (MSG류)',
    tier: 3,
    category: 'additive',
    title: '감칠맛 합성 조미 첨가물',
    desc: '식약처 안전 기준 내이나, 과다 섭취 시 나트륨 섭취를 부추기고 입맛을 자극합니다.'
  },
  {
    keywords: ['변성전분'],
    name: '변성전분',
    tier: 3,
    category: 'additive',
    title: '화학적 가공 전분 (혈당 급상승)',
    desc: '식감을 쫄깃하게 만드는 화학 가공 전분으로 단순 탄수화물 함량을 높입니다.'
  },
  {
    keywords: ['합성향료', '착향료'],
    name: '합성향료',
    tier: 3,
    category: 'additive',
    title: '인공 풍미 합성 첨가물',
    desc: '초코, 바나나, 바닐라 향 등을 내기 위한 인공 합성 향료입니다.'
  },
  {
    keywords: ['아질산나트륨'],
    name: '아질산나트륨 (발색제)',
    tier: 4,
    category: 'additive',
    title: '🚨 WHO 지정 1군 발암 추정 물질 논란',
    desc: '가공육의 붉은 색감과 보존을 위해 쓰이며, 체내에서 2급 아민과 결합 시 니트로사민(발암물질) 형성 우려가 큽니다.'
  },
  {
    keywords: ['소브산칼륨', '소르빈산칼륨', '안식향산나트륨', '방부제'],
    name: '합성 보존료 (방부제)',
    tier: 4,
    category: 'additive',
    title: '화학 합성 방부제',
    desc: '세균 번식을 막는 보존제이나 장기 섭취 시 간 대사 부담 및 천식 환자 주의가 필요합니다.'
  },
  {
    keywords: ['식용색소적색제40호', '타르색소', '식용색소황색제4호', '식용색소황색제5호', '적색40호', '황색4호'],
    name: '인공 타르색소',
    tier: 4,
    category: 'additive',
    title: '🚨 석유계 인공 착색료 (알레르기·행동장애 논란)',
    desc: '석유 타르 유래 인공 색소로 유럽에서는 과잉행동장애(ADHD) 유발 경고문구가 부착됩니다.'
  },
  {
    keywords: ['폴리인산나트륨', '피로인산나트륨', '산도조절제(인산염)'],
    name: '인산염류',
    tier: 4,
    category: 'additive',
    title: '체내 칼슘 흡수 방해 결착제',
    desc: '과다 섭취 시 혈중 인 농도를 높여 뼈의 칼슘을 배출시키고 신장 부담을 유발합니다.'
  }
];

/**
 * 원재료 텍스트 토크나이저 & 분석 함수
 */
export function analyzeIngredients(rawText, product = null) {
  const text = (rawText || '').trim();
  
  if (!text) {
    // 기획안 v2.0 P0-④ — 원재료 텍스트가 없으면 성분을 '추론'하지 않는다.
    // 근거 없는 성분명 생성은 실존 제품에 대한 허위 표시이므로 빈 상태를 그대로 반환한다.
    return buildUnavailableReport();
  }

  // 1. 괄호 및 쉼표 기반 분해
  const rawTokens = splitIngredientsText(text);
  
  // 2. 딕셔너리 매칭
  const matchedTokens = [];
  const unmatched = [];

  rawTokens.forEach(t => {
    const cleaned = t.trim().replace(/^[\d\.\s%g()\[\]]+/, '').toLowerCase();
    if (!cleaned || cleaned.length < 2) return;

    let found = null;
    for (const dictItem of INGREDIENT_DICTIONARY) {
      if (dictItem.keywords.some(kw => cleaned.includes(kw))) {
        found = dictItem;
        break;
      }
    }

    if (found) {
      matchedTokens.push({
        raw: t,
        name: found.name,
        tier: found.tier,
        category: found.category,
        title: found.title,
        desc: found.desc
      });
    } else {
      // 일반 식품 원료(Tier 2)로 처리
      unmatched.push({
        raw: t,
        name: t,
        tier: 2,
        category: 'general',
        title: '일반 식품 원료',
        desc: '식품 제조에 널리 사용되는 표준 원재료입니다.'
      });
    }
  });

  const allTokens = [...matchedTokens, ...unmatched];
  
  return buildAnalysisReport(allTokens, product);
}

/**
 * 괄호 및 쉼표 정규화 분해
 */
function splitIngredientsText(text) {
  // 괄호 안의 쉼표는 보호하면서 메인 쉼표 분리
  const cleaned = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ');
  const tokens = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);

    if ((ch === ',' || ch === ';') && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * 분석 보고서 빌더
 */
function buildAnalysisReport(tokens, product = null) {
  const good = tokens.filter(t => t.tier === 1);
  const neutral = tokens.filter(t => t.tier === 2);
  const caution = tokens.filter(t => t.tier === 3);
  const bad = tokens.filter(t => t.tier === 4);
  const total = tokens.length || 1;

  // 비율 계산
  const goodPct = Math.round((good.length / total) * 100);
  const neutralPct = Math.round((neutral.length / total) * 100);
  const cautionPct = Math.round((caution.length / total) * 100);
  const badPct = Math.max(0, 100 - goodPct - neutralPct - cautionPct);

  // 안심 점수 (Clean Score, 0~100)
  // 안심 성분 비중 가산, 기피 성분 대폭 감점, 주의 성분 소폭 감점
  let score = 75 + (good.length * 5) - (caution.length * 8) - (bad.length * 18);
  score = Math.max(10, Math.min(100, score));

  let tierLabel = '안심 클린';
  let tierColor = 'var(--good)';
  if (bad.length > 0 || score < 50) {
    tierLabel = '기피/주의';
    tierColor = 'var(--bad)';
  } else if (caution.length > 0 || score < 75) {
    tierLabel = '조건부 안심';
    tierColor = 'var(--warn)';
  }

  // 4대 카테고리 Teardown 판정
  const teardowns = {
    sweetener: evaluateSweetener(tokens, product),
    protein: evaluateProtein(tokens, product),
    fat: evaluateFat(tokens, product),
    additive: evaluateAdditive(tokens, product)
  };

  return {
    available: true,
    cleanScore: score,
    tierLabel,
    tierColor,
    stats: {
      goodCount: good.length,
      neutralCount: neutral.length,
      cautionCount: caution.length,
      badCount: bad.length,
      totalCount: total,
      goodPct,
      neutralPct,
      cautionPct,
      badPct
    },
    teardowns,
    tokens
  };
}

/**
 * 당류/감미료 심층 평가
 */
function evaluateSweetener(tokens, product) {
  const sweetTokens = tokens.filter(t => t.category === 'sweetener');
  const hasGood = sweetTokens.some(t => t.tier === 1);
  const hasCaution = sweetTokens.some(t => t.tier === 3);
  const hasBad = sweetTokens.some(t => t.tier === 4);

  if (hasBad) {
    const badNames = sweetTokens.filter(t => t.tier === 4).map(t => t.name).join(', ');
    return {
      status: 'bad',
      badge: '🔴 흡수당 주의',
      icon: '🍯',
      title: `${badNames} 사용`,
      desc: '인슐린 저항성과 체지방 축적을 유발하는 흡수당이 포함되어 있습니다.'
    };
  }
  if (hasGood && !hasCaution) {
    const gNames = sweetTokens.filter(t => t.tier === 1).map(t => t.name).join(', ');
    return {
      status: 'good',
      badge: '🟢 안심 대체당',
      icon: '🍯',
      title: `${gNames} 사용`,
      desc: '혈당 스파이크가 없는 최우수 0kcal 천연 대체당을 사용하여 안심할 수 있습니다.'
    };
  }
  if (hasGood && hasCaution) {
    const gNames = sweetTokens.filter(t => t.tier === 1).map(t => t.name).join(', ');
    const cNames = sweetTokens.filter(t => t.tier === 3).map(t => t.name).join(', ');
    return {
      status: 'good',
      badge: '🟢 안심 대체당 중심',
      icon: '🍯',
      title: `${gNames} 사용 (${cNames} 배합)`,
      desc: '혈당 부담이 적은 천연 대체당을 주로 사용하였으며 감미 보조 원료가 소량 배합되었습니다.'
    };
  }
  if (hasCaution) {
    const cNames = sweetTokens.filter(t => t.tier === 3).map(t => t.name).join(', ');
    return {
      status: 'caution',
      badge: '🟡 주의 감미료',
      icon: '🍯',
      title: `${cNames} 사용`,
      desc: '당알코올/합성감미료가 함유되어 소화 민감성 또는 단맛 중독성에 주의하세요.'
    };
  }

  // 무가당/원물 자체
  return {
    status: 'good',
    badge: '🟢 무첨가/클린',
    icon: '🍯',
    title: '정제당 무첨가 클린',
    desc: '인공 감미료나 정제당이 첨가되지 않은 정직한 원물 포뮬러입니다.'
  };
}

/**
 * 단백질 원물 품질 심층 평가
 */
function evaluateProtein(tokens, product) {
  const pTokens = tokens.filter(t => t.category === 'protein');
  const hasBad = pTokens.some(t => t.tier === 4);
  const hasGood = pTokens.some(t => t.tier === 1);

  if (hasBad) {
    return {
      status: 'bad',
      badge: '🔴 함량 뻥튀기 주의',
      icon: '🍗',
      title: '밀글루텐/저품질 단백 배합',
      desc: '아미노산 조성이 떨어지거나 소화 흡수율이 낮은 단백질이 포함되어 있습니다.'
    };
  }
  if (hasGood) {
    const gNames = pTokens.filter(t => t.tier === 1).map(t => t.name).join(', ');
    return {
      status: 'good',
      badge: '🟢 프리미엄 원육/유청',
      icon: '🍗',
      title: `${gNames || '자연 원물'} 중심 고단백`,
      desc: '생체 이용률과 BCAA 함량이 가장 높은 양질의 단백질 원물을 사용했습니다.'
    };
  }
  return {
    status: 'neutral',
    badge: '⚪ 표준 단백질',
    icon: '🍗',
    title: '표준 농축 단백질 원료',
    desc: '식물성 대두단백 또는 일반 유청단백이 배합된 표준 원료입니다.'
  };
}

/**
 * 지방/유지류 심층 평가
 */
function evaluateFat(tokens, product) {
  const fTokens = tokens.filter(t => t.category === 'fat');
  const hasBad = fTokens.some(t => t.tier === 4);
  const hasGood = fTokens.some(t => t.tier === 1);

  if (hasBad) {
    return {
      status: 'bad',
      badge: '🔴 쇼트닝/경화유 검출',
      icon: '🧈',
      title: '트랜스지방 위험 가공유지',
      desc: '심혈관 건강을 해치는 쇼트닝, 마가린, 부분경화유가 검출되었습니다.'
    };
  }
  if (hasGood) {
    return {
      status: 'good',
      badge: '🟢 건강한 불포화지방',
      icon: '🧈',
      title: '올리브유/식물성 오일',
      desc: '항산화 올레산이 풍부한 좋은 불포화지방을 사용했습니다.'
    };
  }
  return {
    status: 'neutral',
    badge: '⚪ 표준 지방 원료',
    icon: '🧈',
    title: '일반 식물성 유지',
    desc: '표준적인 식물성 유지 또는 원육 자체의 지방 성분입니다.'
  };
}

/**
 * 식품첨가물 5대 요주의 필터 평가
 */
function evaluateAdditive(tokens, product) {
  const badAdditives = tokens.filter(t => t.category === 'additive' && t.tier === 4);
  const cautionAdditives = tokens.filter(t => t.category === 'additive' && t.tier === 3);

  if (badAdditives.length > 0) {
    const names = badAdditives.map(t => t.name).join(', ');
    return {
      status: 'bad',
      badge: '🔴 요주의 첨가물 검출',
      icon: '🧪',
      title: `${names} 포함`,
      desc: '아질산나트륨, 합성보존료 또는 인공 타르색소가 포함되어 있습니다.'
    };
  }
  if (cautionAdditives.length > 0) {
    const names = cautionAdditives.map(t => t.name).join(', ');
    return {
      status: 'caution',
      badge: '🟡 주의 첨가물',
      icon: '🧪',
      title: `${names} 포함`,
      desc: '카라기난, 향미증진제(MSG) 또는 변성전분이 함유되어 있습니다.'
    };
  }
  return {
    status: 'good',
    badge: '🟢 무첨가 클린 포뮬러',
    icon: '🧪',
    title: '발색제·보존료 무첨가',
    desc: '아질산나트륨, 보존료, 인공 타르색소 없이 안심하고 드실 수 있습니다.'
  };
}

/**
 * 원재료 미확보 상태 — 점수를 매기지 않는다.
 * 화면은 이 상태를 '원재료 미확보 · 제보하기' 빈 상태로 렌더한다.
 */
export function buildUnavailableReport() {
  return {
    available: false,
    cleanScore: null,
    tierLabel: '원재료 미확보',
    tierColor: 'var(--ink-3)',
    stats: {
      goodCount: 0, neutralCount: 0, cautionCount: 0, badCount: 0,
      totalCount: 0, goodPct: 0, neutralPct: 0, cautionPct: 0, badPct: 0
    },
    teardowns: null,
    tokens: []
  };
}
