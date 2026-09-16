// 배포 위생 게이트 G7 (check_deploy_hygiene.js)
// _site/ 에 시크릿·내부 도구·개발 부산물이 섞여 들어갔는지 검사하고, 있으면 빌드를 실패시킨다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(__dirname, '..', '_site');

// 금지 경로 패턴
const FORBIDDEN_PATHS = [
  /(^|[\\/])scripts[\\/]/i,
  /(^|[\\/])scratch[\\/]/i,
  /(^|[\\/])tools[\\/]/i,
  /(^|[\\/])data[\\/]/i,
  /(^|[\\/])node_modules[\\/]/i,
  /(^|[\\/])\.github[\\/]/i,
  /\.sql$/i,
  /\.env$/i,
  /audit_gallery\.html$/i,
  /wrangler\.jsonc$/i,
  /(^|[\\/])worker[\\/]/i
];

// 시크릿 패턴 — 공공데이터포털 인증키(64자 hex), 네이버 클라이언트 시크릿류, 일반 토큰
const SECRET_PATTERNS = [
  { name: '64자 hex 인증키', re: /\b[0-9a-f]{64}\b/i },
  { name: 'serviceKey 리터럴', re: /(serviceKey|ServiceKey)\s*[=:]\s*['"][A-Za-z0-9%+/=]{20,}['"]/ },
  { name: 'NAVER 시크릿', re: /X-Naver-Client-Secret['"]?\s*[:=]\s*['"][^'"]{8,}['"]/ },
  { name: 'AWS 키', re: /AKIA[0-9A-Z]{16}/ }
];

const TEXT_EXT = new Set(['.html', '.js', '.json', '.css', '.txt', '.md', '.yml', '.yaml']);

function walk(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

function main() {
  const files = walk(siteDir);
  if (files.length === 0) {
    console.error('❌ _site/ 가 비어 있습니다. collect_site.js 를 먼저 실행하세요.');
    process.exit(1);
  }

  const violations = [];

  for (const { rel, abs } of files) {
    for (const re of FORBIDDEN_PATHS) {
      if (re.test(rel)) violations.push(`금지 경로: ${rel}`);
    }
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) continue;
    const content = fs.readFileSync(abs, 'utf-8');
    for (const { name, re } of SECRET_PATTERNS) {
      const m = content.match(re);
      if (m) violations.push(`시크릿 의심(${name}): ${rel} — ${m[0].slice(0, 8)}…`);
    }
  }

  if (violations.length) {
    console.error('💥 G7 배포 위생 게이트 실패:');
    for (const v of violations) console.error('  - ' + v);
    process.exit(1);
  }

  console.log(`✅ G7 통과 — 배포 대상 ${files.length}개 파일에 시크릿·내부 도구 없음`);
}

main();
