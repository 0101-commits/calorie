// 공개 배포 산출물 수집 (collect_site.js)
// 기획안 v2.0 P0-② — 저장소 루트 전체 배포를 화이트리스트로 교체한다.
// 배포 대상이 아닌 것: scripts/ · scratch/ · data/ · tools/ · *.sql · audit_gallery.html · .env

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const siteDir = path.join(rootDir, '_site');

// 파일 단위 화이트리스트
const FILES = [
  'index.html',
  '.nojekyll',
  'data.json',
  'data_index.json',
  'data_meta.json'
];

// 디렉터리 단위 화이트리스트 (확장자까지 제한)
const DIRS = [
  { dir: 'js', ext: ['.js'] },
  { dir: 'css', ext: ['.css'] },
  { dir: 'rules', ext: ['.json'] }
];

function copyFile(rel) {
  const src = path.join(rootDir, rel);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(siteDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(rel, exts) {
  const src = path.join(rootDir, rel);
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      n += copyDir(childRel, exts);
    } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
      if (copyFile(childRel)) n++;
    }
  }
  return n;
}

function main() {
  // 디렉터리 자체가 잠겨 있을 수 있으므로(로컬 서버가 물고 있는 경우) 내용만 비운다.
  fs.mkdirSync(siteDir, { recursive: true });
  for (const entry of fs.readdirSync(siteDir)) {
    fs.rmSync(path.join(siteDir, entry), { recursive: true, force: true });
  }

  let count = 0;
  for (const f of FILES) {
    if (copyFile(f)) count++;
    else if (f !== '.nojekyll') console.warn(`⚠️  화이트리스트 파일 없음: ${f}`);
  }
  // .nojekyll 은 없으면 만든다
  const nojekyll = path.join(siteDir, '.nojekyll');
  if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, '');

  for (const { dir, ext } of DIRS) {
    const n = copyDir(dir, ext);
    count += n;
    console.log(`  ${dir}/ ${n}개`);
  }

  console.log(`✅ _site/ 수집 완료: ${count}개 파일`);
}

main();
