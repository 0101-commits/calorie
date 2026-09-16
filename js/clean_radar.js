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
    title: '희소당 감미료 알룰로스',
    desc: '자연계에 미량 존재하는 희소당으로, 체내에서 대부분 대사되지 않고 배출된다. 식약처 표시기준상 열량은 0kcal/g로 계산되며 당류 표시 대상에 포함되지 않는다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['스테비아', '효소처리스테비아', '스테비올배당체'],
    name: '스테비아',
    tier: 1,
    category: 'sweetener',
    title: '스테비올배당체 감미료',
    desc: '국화과 스테비아 잎에서 얻은 스테비올배당체를 단맛 성분으로 하는 지정 식품첨가물이다. JECFA는 일일섭취허용량(ADI)을 스테비올로서 체중 1kg당 4mg으로 설정했다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['에리스리톨', '에리트리톨'],
    name: '에리스리톨',
    tier: 1,
    category: 'sweetener',
    title: '발효 당알코올 에리스리톨',
    desc: '포도당을 발효해 만드는 당알코올로 식약처 표시기준상 열량은 0kcal/g로 계산된다. 당알코올을 주원료로 한 제품에는 과량 섭취 시 설사를 일으킬 수 있다는 주의 표시가 요구된다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['나한과', '몽크프룻'],
    name: '나한과추출물',
    tier: 1,
    category: 'sweetener',
    title: '나한과 유래 감미 원료',
    desc: '나한과(몽크프룻) 열매에서 추출한 모그로사이드류를 단맛 성분으로 하는 고감미 원료다. 설탕보다 적은 양으로 단맛을 내며 첨가량이 소량이다.',
    basis: null
  },
  {
    keywords: ['프락토올리고당', '이소말토올리고당', '올리고당', '갈락토올리고당'],
    name: '올리고당',
    tier: 2,
    category: 'sweetener',
    title: '난소화성 올리고당류',
    desc: '단당이 3~10개 결합한 당류로, 일부는 소장에서 소화되지 않고 대장 미생물에 이용된다. 설탕보다 단맛이 약하고 열량 환산값이 낮은 편이다.',
    basis: null
  },
  {
    keywords: ['말티톨', 'd-말티톨', '말티톨시럽'],
    name: '말티톨',
    tier: 3,
    category: 'sweetener',
    title: '당알코올 말티톨',
    desc: '맥아당을 수소화해 만든 당알코올로 설탕보다 열량 환산값이 낮게 계산된다. 당알코올을 주원료로 한 제품에는 과량 섭취 시 설사를 일으킬 수 있다는 주의 표시가 요구된다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['소르비톨', 'd-소르비톨'],
    name: '소르비톨',
    tier: 3,
    category: 'sweetener',
    title: '당알코올 소르비톨',
    desc: '과일에도 존재하는 당알코올로 감미료·습윤제 용도의 지정 식품첨가물이다. 당알코올을 주원료로 한 제품에는 과량 섭취 시 설사를 일으킬 수 있다는 주의 표시가 요구된다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['자일리톨'],
    name: '자일리톨',
    tier: 2,
    category: 'sweetener',
    title: '당알코올 자일리톨',
    desc: '자일로스를 수소화해 만든 당알코올 감미료로 설탕과 비슷한 단맛을 낸다. 당알코올을 주원료로 한 제품에는 과량 섭취 시 설사를 일으킬 수 있다는 주의 표시가 요구된다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['수크랄로스'],
    name: '수크랄로스',
    tier: 3,
    category: 'sweetener',
    title: '합성 감미료 수크랄로스',
    desc: '설탕을 염소화해 만든 합성 감미료로, 식품 유형별 사용량 기준이 정해진 지정 식품첨가물이다. JECFA는 일일섭취허용량(ADI)을 체중 1kg당 15mg으로 설정했다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['아세설팜칼륨', '아세설팜k'],
    name: '아세설팜칼륨',
    tier: 3,
    category: 'sweetener',
    title: '합성 감미료 아세설팜칼륨',
    desc: '체내에서 대사되지 않고 배출되는 합성 감미료로, 식품 유형별 사용량 기준이 정해진 지정 식품첨가물이다. JECFA는 일일섭취허용량(ADI)을 체중 1kg당 15mg으로 설정했다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['아스파탐'],
    name: '아스파탐',
    tier: 3,
    category: 'sweetener',
    title: '합성 감미료 아스파탐',
    desc: '아스파트산과 페닐알라닌으로 이루어진 합성 감미료로, 페닐알라닌 함유 사실을 표시해야 한다. IARC는 2023년 아스파탐을 2B군(인체 발암 가능성 있음)으로 분류했고 JECFA는 일일섭취허용량 40mg/kg을 유지했다.',
    basis: 'WHO/IARC 분류'
  },
  {
    keywords: ['말토덱스트린', '덱스트린'],
    name: '말토덱스트린',
    tier: 3,
    category: 'sweetener',
    title: '전분 가수분해물 말토덱스트린',
    desc: '전분을 부분 가수분해해 만든 다당류로 증량제·부형제·질감 조절 용도로 쓰인다. 단당·이당이 아니어서 식약처 표시기준상 당류가 아닌 탄수화물로 표시된다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['액상과당', '고과당', '기타과당', '고과당콘시럽', 'hfcs'],
    name: '액상과당 (HFCS)',
    tier: 4,
    category: 'sweetener',
    title: '고과당 옥수수시럽',
    desc: '전분을 당화한 뒤 포도당 일부를 과당으로 전환한 액상 감미료로, 식약처 표시기준상 당류에 포함된다. 식약처는 가공식품을 통한 첨가당 섭취를 1일 총 열량의 10% 이내로 줄이도록 권고한다.',
    basis: '식약처 당류 저감 정책 권고'
  },
  {
    keywords: ['백설탕', '설탕', '정제설탕', '갈색설탕', '흑설탕', '원당'],
    name: '설탕 (정제당)',
    tier: 4,
    category: 'sweetener',
    title: '정제당(설탕)',
    desc: '사탕수수·사탕무에서 정제한 이당류로 식약처 표시기준상 당류에 포함된다. 식약처는 가공식품을 통한 첨가당 섭취를 1일 총 열량의 10% 이내로 줄이도록 권고한다.',
    basis: '식약처 당류 저감 정책 권고'
  },
  {
    keywords: ['물엿', '맥아당', '요리당', '조청'],
    name: '물엿/맥아당',
    tier: 4,
    category: 'sweetener',
    title: '전분당 시럽(물엿)',
    desc: '전분을 당화해 만든 액상 감미료로 맥아당·포도당이 주성분이며 당류로 표시된다. 식약처는 가공식품을 통한 첨가당 섭취를 1일 총 열량의 10% 이내로 줄이도록 권고한다.',
    basis: '식약처 당류 저감 정책 권고'
  },

  // ── 2. 단백질 원천 ──
  {
    keywords: ['닭가슴살', '국내산닭가슴살', '닭안심', '닭고기'],
    name: '닭가슴살 원육',
    tier: 1,
    category: 'protein',
    title: '닭가슴살 원육',
    desc: '지방 함량이 낮고 단백질 밀도가 높은 가금류 부위로, 별도 가공 없이 쓰이는 축산물 원료다. 필수 아미노산을 모두 포함한다.',
    basis: null
  },
  {
    keywords: ['분리유청단백', 'wpi', '분리유청단백분말'],
    name: '분리유청단백 (WPI)',
    tier: 1,
    category: 'protein',
    title: '분리유청단백(WPI)',
    desc: '우유 유청에서 유당과 지방을 제거해 단백질 함량을 90% 안팎까지 높인 원료다. 유당 함량이 낮아 유당 민감군이 선택하는 형태다.',
    basis: null
  },
  {
    keywords: ['가수분해유청단백', 'wph'],
    name: '가수분해유청단백 (WPH)',
    tier: 1,
    category: 'protein',
    title: '가수분해유청단백(WPH)',
    desc: '유청단백을 효소로 부분 분해해 펩타이드 형태로 만든 원료다. 분해도가 높을수록 소화·흡수가 빠른 대신 쓴맛이 강해진다.',
    basis: null
  },
  {
    keywords: ['계란', '난백', '난백액', '달걀', '난백분말'],
    name: '계란/난백',
    tier: 1,
    category: 'protein',
    title: '계란·난백',
    desc: '필수 아미노산 조성이 고르게 갖춰져 단백질 품질 평가의 기준 식품으로 쓰여 온 원료다. 식약처 표시기준상 알류(가금류)는 알레르기 유발물질 표시 대상이다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['소고기', '우육', '돼지고기', '돈육', '돈안심', '연어', '명태'],
    name: '자연산 원육/생선살',
    tier: 1,
    category: 'protein',
    title: '원육·어육',
    desc: '가공하지 않은 축산물·수산물 원료로 단백질과 철·아연 등 미네랄의 급원이다. 부위에 따라 지방 함량 차이가 크다.',
    basis: null
  },
  {
    keywords: ['두부', '대두', '대두단백'],
    name: '두부/자연대두',
    tier: 1,
    category: 'protein',
    title: '두부·대두',
    desc: '대두를 원료로 한 식물성 단백질 급원으로 이소플라본과 식이섬유를 함께 함유한다. 식약처 표시기준상 대두는 알레르기 유발물질 표시 대상이다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['농축유청단백', 'wpc', '우유단백', '유청단백'],
    name: '농축유청단백 (WPC)',
    tier: 2,
    category: 'protein',
    title: '농축유청단백(WPC)',
    desc: '유청을 농축해 단백질 함량을 70~80% 수준으로 높인 원료로 유당과 지방이 일부 남는다. 식약처 표시기준상 우유는 알레르기 유발물질 표시 대상이다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['카제인', '카제인나트륨', '미셀라카제인'],
    name: '카제인단백질',
    tier: 2,
    category: 'protein',
    title: '카제인 단백질',
    desc: '우유 단백질의 대부분을 차지하는 성분으로 위에서 응고해 천천히 소화된다. 식약처 표시기준상 우유는 알레르기 유발물질 표시 대상이다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['분리대두단백', 'isp'],
    name: '분리대두단백 (ISP)',
    tier: 2,
    category: 'protein',
    title: '분리대두단백(ISP)',
    desc: '탈지대두에서 단백질만 분리해 함량을 90% 안팎으로 높인 식물성 원료다. 식약처 표시기준상 대두는 알레르기 유발물질 표시 대상이다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['분쇄가공육', '성형육', '어육', '크래미', '맛살'],
    name: '성형육/어육가공품',
    tier: 3,
    category: 'protein',
    title: '분쇄·성형 가공육',
    desc: '원료육이나 어육을 분쇄해 전분·결착제 등과 함께 성형한 가공품으로, 원료 함량은 제품마다 다르다. 식약처 표시기준은 주원료의 함량을 백분율로 표시하도록 정하고 있다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['밀글루텐', '활성글루텐', '글루텐'],
    name: '밀글루텐 (함량뻥튀기)',
    tier: 3,
    category: 'protein',
    title: '밀 유래 글루텐',
    desc: '밀에서 분리한 단백질로 조직감을 만들고 제품의 단백질 함량을 보강하는 데 쓰인다. 셀리악병이나 밀 알레르기가 없는 사람에게 미치는 영향은 연구에 따라 평가가 갈리는 성분이다.',
    basis: null
  },
  {
    keywords: ['젤라틴', '콜라겐', '피쉬콜라겐'],
    name: '젤라틴/콜라겐 (불완전단백)',
    tier: 3,
    category: 'protein',
    title: '젤라틴·콜라겐',
    desc: '동물의 껍질·뼈에서 얻은 콜라겐을 가열·분해한 단백질로, 필수 아미노산인 트립토판이 거의 들어 있지 않다. 아미노산 조성이 치우쳐 단백질 품질 평가(PDCAAS)에서 0으로 산출된다.',
    basis: null
  },

  // ── 3. 지방 및 유지류 ──
  {
    keywords: ['올리브유', '엑스트라버진올리브유', '아보카도오일'],
    name: '올리브유/아보카도유',
    tier: 1,
    category: 'fat',
    title: '올리브유·아보카도유',
    desc: '단일불포화지방산인 올레산 비율이 높은 식물성 유지다. 엑스트라버진 등급은 정제 과정을 거치지 않아 폴리페놀 등 미정제 성분을 함께 함유한다.',
    basis: null
  },
  {
    keywords: ['카놀라유', '대두유', '옥수수유', '해바라기유', '현미유'],
    name: '식물성 식용유',
    tier: 2,
    category: 'fat',
    title: '정제 식물성 유지',
    desc: '카놀라·대두·옥수수 등에서 정제한 식용유로 불포화지방산 비율이 높다. 식약처 표시기준에 따라 포화지방·트랜스지방 함량을 표시한다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['팜유', '팜올레인유', '우지', '돈지'],
    name: '팜유/동물성지방',
    tier: 3,
    category: 'fat',
    title: '팜유·동물성 유지',
    desc: '포화지방산 비율이 높아 실온에서 반고체 상태를 유지하고 산화 안정성이 큰 유지다. 식약처는 포화지방의 1일 영양성분 기준치를 15g으로 정하고 있다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['쇼트닝', '마가린', '부분경화유', '경화유', '가공유지'],
    name: '쇼트닝/마가린 (트랜스지방 위험)',
    tier: 4,
    category: 'fat',
    title: '경화유·가공유지',
    desc: '식물성 기름에 수소를 첨가해 굳힌 유지로, 부분경화 공정에서 트랜스지방산이 생성될 수 있다. 식약처 표시기준은 트랜스지방 함량 표시를 의무화하고 있고 WHO는 부분경화유의 식품 사용 퇴출을 권고한다.',
    basis: '식약처 「식품등의 표시기준」'
  },

  // ── 4. 식품첨가물, 보존료, 색소 ──
  {
    keywords: ['식이섬유', '난소화성말토덱스트린', '치커리추출물', '아카시아식이섬유'],
    name: '수용성 식이섬유',
    tier: 1,
    category: 'additive',
    title: '수용성 식이섬유',
    desc: '소장에서 소화되지 않고 대장에 도달하는 탄수화물로 난소화성말토덱스트린·치커리추출물 등이 해당한다. 식약처는 식이섬유의 1일 영양성분 기준치를 25g으로 정하고 있다.',
    basis: '식약처 「식품등의 표시기준」'
  },
  {
    keywords: ['비타민c', 'l-아스코브산', '구연산', '레시틴', '대두레시틴', '탄산수소나트륨', '정제수', '천일염'],
    name: '표준 안심 식품원료',
    tier: 2,
    category: 'additive',
    title: '일반 식품원료·영양성분',
    desc: '정제수, 식염, 구연산, 레시틴, 비타민C 등 식품 제조에 널리 쓰이는 원료와 영양성분이다. 각각 식품 원료 또는 지정 식품첨가물로 관리된다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['카라기난', '카라기닌'],
    name: '카라기난',
    tier: 3,
    category: 'additive',
    title: '해조 유래 증점제 카라기난',
    desc: '홍조류에서 추출한 다당류로 증점·안정 목적에 쓰이는 지정 식품첨가물이다. 저분자 분해물의 장 자극 가능성은 연구에 따라 평가가 갈린다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['l-글루탐산나트륨', '향미증진제', 'msg', '핵산'],
    name: '향미증진제 (MSG류)',
    tier: 3,
    category: 'additive',
    title: 'L-글루탐산나트륨 등 향미증진제',
    desc: '감칠맛을 내기 위해 쓰는 지정 식품첨가물로, JECFA는 일일섭취허용량을 따로 정하지 않음(ADI not specified)으로 평가했다. 나트륨을 함유하므로 제품의 총 나트륨 표시량에 포함된다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['변성전분'],
    name: '변성전분',
    tier: 3,
    category: 'additive',
    title: '가공전분(변성전분)',
    desc: '전분을 물리·효소·화학적으로 처리해 점도와 안정성을 높인 지정 식품첨가물이다. 소화되는 부분은 탄수화물로 계산되어 표시된다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['합성향료', '착향료'],
    name: '합성향료',
    tier: 3,
    category: 'additive',
    title: '합성착향료',
    desc: '식품에 향을 부여할 목적으로 쓰는 지정 식품첨가물로, 표시할 때 「합성착향료」 등 용도명을 함께 적는다. 개별 향 성분의 이름은 표시되지 않는 경우가 많다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['아질산나트륨'],
    name: '아질산나트륨 (발색제)',
    tier: 4,
    category: 'additive',
    title: '발색제 아질산나트륨',
    desc: '식육가공품의 색 고정과 보툴리누스균 억제를 위해 쓰는 지정 식품첨가물로, 식약처는 아질산 이온으로서의 잔존량 상한을 식품 유형별로 정하고 있다. IARC는 가공육을 1군으로 분류했고, 아질산염 자체는 체내 니트로소화가 일어나는 조건의 섭취를 2A군으로 분류했다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['소브산칼륨', '소르빈산칼륨', '안식향산나트륨', '방부제'],
    name: '합성 보존료 (방부제)',
    tier: 4,
    category: 'additive',
    title: '합성 보존료',
    desc: '소브산칼륨·안식향산나트륨 등 미생물 증식을 억제할 목적으로 쓰는 지정 식품첨가물이다. 식약처는 식품 유형별로 사용량 상한을 정하고 있다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['식용색소적색제40호', '타르색소', '식용색소황색제4호', '식용색소황색제5호', '적색40호', '황색4호'],
    name: '인공 타르색소',
    tier: 4,
    category: 'additive',
    title: '식용 타르색소',
    desc: '석유화학 원료로 합성한 수용성 착색료로 식용색소적색제40호·황색제4호 등이 해당한다. 식약처는 면류·다류·고춧가루 등 다수 식품 유형에 타르색소 사용을 금지하고 있다.',
    basis: '식약처 「식품첨가물의 기준 및 규격」'
  },
  {
    keywords: ['폴리인산나트륨', '피로인산나트륨', '산도조절제(인산염)'],
    name: '인산염류',
    tier: 3,
    category: 'additive',
    title: '인산염류',
    desc: '결착제·산도조절제로 쓰여 가공육과 유제품의 조직감·보수성을 높이는 식품첨가물이다. 가공식품 유래 인 섭취가 뼈·신장에 미치는 영향은 연구에 따라 평가가 갈리는 성분이다.',
    basis: null
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
      badge: '정제당·액상과당 포함',
      icon: '🍯',
      title: `${badNames} 사용`,
      desc: '식약처가 섭취 저감을 권고하는 첨가당 원료가 포함되어 있습니다. 1일 기준치는 당류 100g입니다.'
    };
  }
  if (hasGood && !hasCaution) {
    const gNames = sweetTokens.filter(t => t.tier === 1).map(t => t.name).join(', ');
    return {
      status: 'good',
      badge: '대체당 사용',
      icon: '🍯',
      title: `${gNames} 사용`,
      desc: '표시기준상 열량이 낮게 계산되는 대체당을 썼습니다. 정제당 대신 쓰인 경우 당류 표시량이 낮아집니다.'
    };
  }
  if (hasGood && hasCaution) {
    const gNames = sweetTokens.filter(t => t.tier === 1).map(t => t.name).join(', ');
    const cNames = sweetTokens.filter(t => t.tier === 3).map(t => t.name).join(', ');
    return {
      status: 'good',
      badge: '대체당 중심 · 보조 감미료 배합',
      icon: '🍯',
      title: `${gNames} 사용 (${cNames} 배합)`,
      desc: '대체당을 주로 쓰고 보조 감미 원료를 함께 배합했습니다. 각 감미료는 식약처가 정한 사용 기준 안에서 쓰입니다.'
    };
  }
  if (hasCaution) {
    const cNames = sweetTokens.filter(t => t.tier === 3).map(t => t.name).join(', ');
    return {
      status: 'caution',
      badge: '당알코올·합성감미료 포함',
      icon: '🍯',
      title: `${cNames} 사용`,
      desc: '당알코올 또는 합성감미료가 들어 있습니다. 당알코올은 일정량 이상이면 표시기준상 설사 유발 가능 문구를 함께 적게 되어 있습니다.'
    };
  }

  // 무가당/원물 자체
  return {
    status: 'good',
    badge: '첨가 감미료 없음',
    icon: '🍯',
    title: '정제당 무첨가 클린',
    desc: '원재료명에서 첨가 감미료나 정제당이 확인되지 않았습니다.'
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
      badge: '곡류 단백 포함',
      icon: '🍗',
      title: '밀글루텐 등 곡류 단백 배합',
      desc: '곡류에서 온 단백질이 포함되어 있습니다. 이 서비스는 원물 종류에 따라 NPI 가중치를 다르게 적용합니다(Q1 1.00 ~ Q5 0.60).'
    };
  }
  if (hasGood) {
    const gNames = pTokens.filter(t => t.tier === 1).map(t => t.name).join(', ');
    return {
      status: 'good',
      badge: '원육·유청 단백',
      icon: '🍗',
      title: `${gNames || '자연 원물'} 중심 고단백`,
      desc: '원육 또는 유청 단백을 주 원료로 씁니다. NPI 계산에서 가중치 Q1(1.00)이 적용되는 분류입니다.'
    };
  }
  return {
    status: 'neutral',
    badge: '표준 단백 원료',
    icon: '🍗',
    title: '표준 농축 단백질 원료',
    desc: '대두단백 또는 농축 유청단백 등이 배합돼 있습니다.'
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
      badge: '경화유지 포함',
      icon: '🧈',
      title: '쇼트닝·마가린 등 가공유지',
      desc: '부분경화유를 쓰면 트랜스지방이 생길 수 있어 표시기준이 트랜스지방 표시를 요구합니다. 1일 기준치는 포화지방 15g입니다.'
    };
  }
  if (hasGood) {
    return {
      status: 'good',
      badge: '식물성 오일',
      icon: '🧈',
      title: '올리브유·아보카도유 등',
      desc: '불포화지방 비중이 높은 식물성 오일을 씁니다.'
    };
  }
  return {
    status: 'neutral',
    badge: '표준 지방 원료',
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
      badge: '사용 기준이 정해진 첨가물 포함',
      icon: '🧪',
      title: `${names} 포함`,
      desc: '식약처가 식품유형별 사용량 상한을 정해 둔 첨가물이 포함되어 있습니다. 허용 범위 안에서 쓰이며, 섭취를 줄이려는 사람을 위해 표시합니다.'
    };
  }
  if (cautionAdditives.length > 0) {
    const names = cautionAdditives.map(t => t.name).join(', ');
    return {
      status: 'caution',
      badge: '가공보조 첨가물 포함',
      icon: '🧪',
      title: `${names} 포함`,
      desc: '안정제·향미증진제·변성전분 등 가공보조 목적의 첨가물이 들어 있습니다.'
    };
  }
  return {
    status: 'good',
    badge: '해당 첨가물 없음',
    icon: '🧪',
    title: '발색제·보존료·타르색소 미확인',
    desc: '원재료명에서 발색제·합성보존료·타르색소가 확인되지 않았습니다.'
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
