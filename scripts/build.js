// 프로틴레이더 정적 data.json 빌드 파이프라인 (build.js)
// 룰 단일 원천: rules/rule_v1.1.json — 코드 기본값(DEFAULT_RULES)은 테스트 픽스처일 뿐이다.
// 회귀 게이트 G1·G2·G3·G5 를 여기서 실패시킨다(기획안 v2.0 §8.1).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateMenu, computePPR, DEFAULT_RULES, fieldStatus } from '../js/score.js';
import { validateMenuQA } from '../js/qa.js';
import { analyzeIngredients } from '../js/clean_radar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const RULE_FILE = 'rule_v1.1.json';

/** 룰 파일을 읽어 반환. 파일이 없으면 빌드를 실패시킨다(조용한 폴백 금지). */
function loadRules() {
  const p = path.join(rootDir, 'rules', RULE_FILE);
  if (!fs.existsSync(p)) {
    console.error(`❌ 룰 파일이 없습니다: rules/${RULE_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** G5 — 룰 파일과 코드 기본값이 갈라지면 실패 */
function gateG5(rules) {
  const mismatches = [];
  const check = (label, a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(`${label}: 룰 ${JSON.stringify(a)} vs 코드 ${JSON.stringify(b)}`);
  };
  check('cutoffs.ppr', rules.cutoffs.ppr, DEFAULT_RULES.cutoffs.ppr);
  check('cutoffs.cpd', rules.cutoffs.cpd, DEFAULT_RULES.cutoffs.cpd);
  check('cutoffs.npi', rules.cutoffs.npi, DEFAULT_RULES.cutoffs.npi);
  check('cutoffs.total_grade', rules.cutoffs.total_grade, DEFAULT_RULES.cutoffs.total_grade);
  check('penalties.max_total_penalty', rules.penalties.max_total_penalty, DEFAULT_RULES.penalties.max_total_penalty);
  check('protein_source_q.Q_unknown', rules.protein_source_q.Q_unknown, DEFAULT_RULES.protein_source_q.Q_unknown);
  return mismatches;
}

/** G1 — 값이 0인데 measured 로 적힌 '플레이스홀더' 탐지 */
function gateG1(items) {
  const suspects = [];
  // 가공식품에서 실측 0이 사실상 불가능한 필드
  const IMPLAUSIBLE_ZERO = [
    { field: 'sodium_mg', when: () => true, why: '나트륨 0mg' },
    { field: 'sat_fat_g', when: it => Number(it.fat_g || 0) >= 5, why: '지방 5g 이상인데 포화지방 0g' }
  ];
  for (const it of items) {
    for (const { field, when, why } of IMPLAUSIBLE_ZERO) {
      if (Number(it[field]) === 0 && fieldStatus(it, field) === 'measured' && when(it)) {
        suspects.push(`${it.menu_id} — ${why}`);
      }
    }
  }
  return suspects;
}

/** G3 — enum 정합 */
function gateG3(items, rules) {
  const bad = [];
  for (const it of items) {
    if (!rules.enums.channel.includes(it.channel)) bad.push(`${it.menu_id} channel=${it.channel}`);
    if (!rules.enums.category.includes(it.category)) bad.push(`${it.menu_id} category=${it.category}`);
    if (!rules.enums.cooking.includes(it.cooking)) bad.push(`${it.menu_id} cooking=${it.cooking}`);
  }
  return bad;
}

function main() {
  console.log('🚀 프로틴레이더 data.json 빌드 시작...');
  const rules = loadRules();
  console.log(`📐 룰 ${rules.version} 로드 (rules/${RULE_FILE})`);

  const g5 = gateG5(rules);
  if (g5.length) {
    console.error('💥 G5 룰 단일 원천 게이트 실패 — 룰 파일과 코드 기본값 불일치:');
    g5.forEach(m => console.error('  - ' + m));
    process.exit(1);
  }

  const seedPath = path.join(rootDir, 'data', 'seed.json');
  if (!fs.existsSync(seedPath)) {
    console.error('❌ data/seed.json 파일이 존재하지 않습니다.');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  console.log(`📦 원본 데이터 ${rawData.length}건 로드 완료.`);

  // ── G3 enum ──
  const g3 = gateG3(rawData, rules);
  if (g3.length) {
    console.error(`💥 G3 enum 정합 게이트 실패 ${g3.length}건:`);
    g3.slice(0, 10).forEach(m => console.error('  - ' + m));
    process.exit(1);
  }

  // ── G1 플레이스홀더 ──
  const g1 = gateG1(rawData);
  if (g1.length) {
    console.error(`💥 G1 플레이스홀더 게이트 실패 ${g1.length}건 — 모르는 값을 0으로 적으면 안 됩니다:`);
    g1.slice(0, 10).forEach(m => console.error('  - ' + m));
    process.exit(1);
  }

  // ── R1~R5 QA (G2 출처 완결성 포함) ──
  const existingIds = new Set();
  let qaFailCount = 0;
  let qaWarningCount = 0;
  for (const item of rawData) {
    const qa = validateMenuQA(item, existingIds);
    existingIds.add(item.menu_id);
    if (!qa.valid) {
      console.error(`❌ [QA 오류] ${item.name} (${item.menu_id}):`, qa.errors);
      qaFailCount++;
    }
    if (qa.warnings.length > 0) qaWarningCount++;
  }
  if (qaFailCount > 0) {
    console.error(`💥 QA 유효성 검사 실패 ${qaFailCount}건 발생. 빌드를 중단합니다.`);
    process.exit(1);
  }
  console.log(`✅ R1~R5 QA 통과 (경고 ${qaWarningCount}건).`);

  // ── 카테고리별 PPR 중위수 (W6) ──
  const catPprMap = {};
  for (const item of rawData) {
    const cat = item.category || '기타';
    (catPprMap[cat] = catPprMap[cat] || []).push(computePPR(item.protein_g, item.price_krw));
  }
  const catMedianMap = {};
  for (const [cat, pprs] of Object.entries(catPprMap)) {
    pprs.sort((a, b) => a - b);
    const mid = Math.floor(pprs.length / 2);
    catMedianMap[cat] = pprs.length % 2 !== 0 ? pprs[mid] : (pprs[mid - 1] + pprs[mid]) / 2;
  }

  // ── 지표·등급·CleanRadar 산출 (모두 여기서 1회. 런타임 재계산 없음 → G4) ──
  const evaluatedItems = rawData.map(item => {
    const evaluated = evaluateMenu(item, {
      rules,
      categoryMedianPpr: catMedianMap[item.category] !== undefined ? catMedianMap[item.category] : 6.0
    });

    // 카드에 찍히는 룰 버전은 실제로 계산에 쓰인 룰 파일의 버전이어야 한다.
    evaluated.rule_version = rules.version;

    const cleanAnalysis = analyzeIngredients(item.ingredients_raw, evaluated);
    if (cleanAnalysis.available) {
      evaluated.clean_score = cleanAnalysis.cleanScore;
      evaluated.clean_tier = cleanAnalysis.cleanScore >= 75
        ? 'clean'
        : (cleanAnalysis.cleanScore >= 50 ? 'moderate' : 'warning');
      evaluated.clean_counts = {
        good: cleanAnalysis.stats.goodCount,
        neutral: cleanAnalysis.stats.neutralCount,
        caution: cleanAnalysis.stats.cautionCount,
        bad: cleanAnalysis.stats.badCount
      };
      // 상세 화면이 재계산하지 않도록 판정 결과를 저장한다(카드·상세 불일치 제거).
      // 토큰은 이름·등급·분류만 담고 설명 문구는 클라이언트 사전에서 조회한다(페이로드 절감).
      // 성분 그룹 플래그 — 알룰로스 전용 칩을 감미료 그룹 필터로 일반화하기 위한 값
      const sweeteners = cleanAnalysis.tokens.filter(t => t.category === 'sweetener');
      evaluated.sweetener_group = sweeteners.length === 0
        ? 'none'
        : (sweeteners.some(t => t.tier === 4) ? 'refined'
          : (sweeteners.some(t => t.tier === 3) ? 'mixed' : 'alternative'));

      evaluated.clean_report = {
        tierLabel: cleanAnalysis.tierLabel,
        stats: cleanAnalysis.stats,
        teardowns: cleanAnalysis.teardowns,
        tokens: cleanAnalysis.tokens.map(t => ({ name: t.name, tier: t.tier, category: t.category }))
      };
    } else {
      evaluated.clean_score = null;
      evaluated.clean_tier = 'unknown';
      evaluated.sweetener_group = 'unknown';
      evaluated.clean_counts = { good: 0, neutral: 0, caution: 0, bad: 0 };
      evaluated.clean_report = null;
    }
    return evaluated;
  });

  // ── 통계 ──
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, hold: 0 };
  const pwCounts = { verified: 0, conditional: 0, washing: 0, none: 0 };
  const cleanCounts = { clean: 0, moderate: 0, warning: 0, unknown: 0 };
  const channelCounts = {};
  let estimatedPrice = 0;

  for (const item of evaluatedItems) {
    if (item.grade_eligible) gradeCounts[item.grade] = (gradeCounts[item.grade] || 0) + 1;
    else gradeCounts.hold++;
    if (item.pw_tier) pwCounts[item.pw_tier]++; else pwCounts.none++;
    cleanCounts[item.clean_tier] = (cleanCounts[item.clean_tier] || 0) + 1;
    channelCounts[item.channel] = (channelCounts[item.channel] || 0) + 1;
    if (item.price_krw_status === 'estimated') estimatedPrice++;
  }

  const total = evaluatedItems.length;
  const graded = total - gradeCounts.hold;
  const pct = n => graded ? ((n / graded) * 100).toFixed(1) : '0.0';

  console.log('\n📊 [등급 분포] 판정 대상 ' + graded + '건 / 보류 ' + gradeCounts.hold + '건');
  console.log(`  A ${gradeCounts.A}건 (${pct(gradeCounts.A)}%) · B ${gradeCounts.B}건 (${pct(gradeCounts.B)}%) · C ${gradeCounts.C}건 (${pct(gradeCounts.C)}%) · D ${gradeCounts.D}건 (${pct(gradeCounts.D)}%)`);
  console.log('\n🛡️ [워싱 판독] 검증 ' + pwCounts.verified + ' · 조건부 ' + pwCounts.conditional + ' · 워싱 ' + pwCounts.washing + ' · 대상아님 ' + pwCounts.none);
  console.log('🧪 [CleanRadar] 안심 ' + cleanCounts.clean + ' · 조건부 ' + cleanCounts.moderate + ' · 주의 ' + cleanCounts.warning + ' · 원재료 미확보 ' + cleanCounts.unknown);
  console.log('💰 추정가 표시 ' + estimatedPrice + '건');

  // ── 출력 ──
  const outputPath = path.join(rootDir, 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(evaluatedItems, null, 2), 'utf-8');
  const fileSizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`\n💾 data.json: ${fileSizeKB} KB`);

  // 목록 렌더에 필요한 필드만 담은 경량 인덱스 (기획안 §6.5 페이로드 분리)
  const indexPath = path.join(rootDir, 'data_index.json');
  const index = evaluatedItems.map(it => ({
    menu_id: it.menu_id,
    channel: it.channel,
    brand: it.brand,
    brand_code: it.brand_code,
    name: it.name,
    category: it.category,
    price_krw: it.price_krw,
    price_krw_status: it.price_krw_status,
    serving_g: it.serving_g,
    kcal: it.kcal,
    protein_g: it.protein_g,
    ppr: it.ppr,
    cpd: it.cpd,
    npi: it.npi,
    grade: it.grade,
    grade_eligible: it.grade_eligible,
    pw: it.pw,
    pw_tier: it.pw_tier,
    clean_tier: it.clean_tier,
    sweetener_group: it.sweetener_group,
    image_url: it.image_url || '',
    verified_at: it.verified_at
  }));
  fs.writeFileSync(indexPath, JSON.stringify(index), 'utf-8');
  console.log(`💾 data_index.json: ${(fs.statSync(indexPath).size / 1024).toFixed(1)} KB (목록용 경량 인덱스)`);

  const meta = {
    total_count: total,
    graded_count: graded,
    hold_count: gradeCounts.hold,
    generated_at: new Date().toISOString(),
    rule_version: rules.version,
    rule_file: `rules/${RULE_FILE}`,
    file_size_kb: Number(fileSizeKB),
    grades: { A: gradeCounts.A, B: gradeCounts.B, C: gradeCounts.C, D: gradeCounts.D },
    washing: pwCounts,
    clean: cleanCounts,
    channels: channelCounts,
    estimated_price_count: estimatedPrice,
    latest_verified_at: evaluatedItems.reduce((m, it) => (it.verified_at > m ? it.verified_at : m), ''),
    rules_snapshot: {
      cutoffs: rules.cutoffs,
      recommendation: rules.recommendation,
      staleness: rules.staleness,
      penalties: rules.penalties
    }
  };
  fs.writeFileSync(path.join(rootDir, 'data_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  console.log('✨ 빌드 완료\n');
}

main();
