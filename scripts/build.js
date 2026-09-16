// 프로틴레이더 정적 data.json 빌드 파이프라인 (build.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateMenu, computePPR } from '../js/score.js';
import { validateMenuQA } from '../js/qa.js';
import { analyzeIngredients } from '../js/clean_radar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

function main() {
  console.log('🚀 프로틴레이더 data.json 빌드 시작...');

  const seedPath = path.join(rootDir, 'data', 'seed.json');
  if (!fs.existsSync(seedPath)) {
    console.error('❌ data/seed.json 파일이 존재하지 않습니다.');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  console.log(`📦 원본 데이터 ${rawData.length}건 로드 완료.`);

  // 1. QA 검증 (R1~R5)
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
    if (qa.warnings.length > 0) {
      qaWarningCount++;
    }
  }

  if (qaFailCount > 0) {
    console.error(`💥 QA 유효성 검사 실패 ${qaFailCount}건 발생. 빌드를 중단합니다.`);
    process.exit(1);
  }
  console.log(`✅ R1~R5 QA 통과 완료 (경고 ${qaWarningCount}건).`);

  // 2. 카테고리별 중위수 PPR 계산 (W6 룰용)
  const catPprMap = {};
  for (const item of rawData) {
    const cat = item.category || '기타';
    const ppr = computePPR(item.protein_g, item.price_krw);
    if (!catPprMap[cat]) catPprMap[cat] = [];
    catPprMap[cat].push(ppr);
  }

  const catMedianMap = {};
  for (const [cat, pprs] of Object.entries(catPprMap)) {
    pprs.sort((a, b) => a - b);
    const mid = Math.floor(pprs.length / 2);
    catMedianMap[cat] = pprs.length % 2 !== 0 ? pprs[mid] : (pprs[mid - 1] + pprs[mid]) / 2;
  }

  // 3. 지표 및 등급 산출 (evaluateMenu) & CleanRadar 원재료 안심 분석
  const evaluatedItems = rawData.map(item => {
    const medianPpr = catMedianMap[item.category] || 6.0;
    const evaluated = evaluateMenu(item, { categoryMedianPpr: medianPpr });
    const cleanAnalysis = analyzeIngredients(item.ingredients_raw, evaluated);
    evaluated.clean_score = cleanAnalysis.cleanScore;
    evaluated.clean_tier = cleanAnalysis.cleanScore >= 75 ? 'clean' : (cleanAnalysis.cleanScore >= 50 ? 'moderate' : 'warning');
    evaluated.clean_counts = {
      good: cleanAnalysis.stats.goodCount,
      neutral: cleanAnalysis.stats.neutralCount,
      caution: cleanAnalysis.stats.cautionCount,
      bad: cleanAnalysis.stats.badCount
    };
    return evaluated;
  });

  // 4. 통계 산출
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0 };
  const pwCounts = { verified: 0, conditional: 0, washing: 0, none: 0 };
  const cleanCounts = { clean: 0, moderate: 0, warning: 0 };

  for (const item of evaluatedItems) {
    gradeCounts[item.grade] = (gradeCounts[item.grade] || 0) + 1;
    if (item.pw_tier) {
      pwCounts[item.pw_tier] = (pwCounts[item.pw_tier] || 0) + 1;
    } else {
      pwCounts.none++;
    }
    cleanCounts[item.clean_tier] = (cleanCounts[item.clean_tier] || 0) + 1;
  }

  const total = evaluatedItems.length;
  console.log('\n📊 [등급 분포 현황]');
  console.log(`  A등급: ${gradeCounts.A}건 (${((gradeCounts.A / total) * 100).toFixed(1)}%)`);
  console.log(`  B등급: ${gradeCounts.B}건 (${((gradeCounts.B / total) * 100).toFixed(1)}%)`);
  console.log(`  C등급: ${gradeCounts.C}건 (${((gradeCounts.C / total) * 100).toFixed(1)}%)`);
  console.log(`  D등급: ${gradeCounts.D}건 (${((gradeCounts.D / total) * 100).toFixed(1)}%)`);

  console.log('\n🛡️ [프로틴 워싱 판독 현황]');
  console.log(`  검증 고단백: ${pwCounts.verified}건`);
  console.log(`  조건부: ${pwCounts.conditional}건`);
  console.log(`  워싱 의심 🔴: ${pwCounts.washing}건`);
  console.log(`  비강조 일반식품: ${pwCounts.none}건`);

  console.log('\n🧪 [CleanRadar 원재료 안심 현황]');
  console.log(`  🟢 안심 클린: ${cleanCounts.clean}건 (${((cleanCounts.clean / total) * 100).toFixed(1)}%)`);
  console.log(`  🟡 조건부 안심: ${cleanCounts.moderate}건 (${((cleanCounts.moderate / total) * 100).toFixed(1)}%)`);
  console.log(`  🔴 기피/주의: ${cleanCounts.warning}건 (${((cleanCounts.warning / total) * 100).toFixed(1)}%)`);

  // 5. data.json 출력
  const outputPath = path.join(rootDir, 'data.json');
  const jsonStr = JSON.stringify(evaluatedItems, null, 2);
  fs.writeFileSync(outputPath, jsonStr, 'utf-8');

  const fileSizeBytes = fs.statSync(outputPath).size;
  const fileSizeKB = (fileSizeBytes / 1024).toFixed(1);
  console.log(`\n💾 data.json 빌드 완료: ${fileSizeKB} KB -> ${outputPath}`);

  // build meta
  const meta = {
    total_count: total,
    generated_at: new Date().toISOString(),
    rule_version: 'v1.0',
    file_size_kb: Number(fileSizeKB),
    grades: gradeCounts,
    washing: pwCounts,
    clean: cleanCounts
  };
  fs.writeFileSync(path.join(rootDir, 'data_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  console.log('✨ 빌드가 성공적으로 완료되었습니다!\n');
}

main();
