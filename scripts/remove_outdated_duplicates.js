import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const seedPath = path.join(rootDir, 'data/seed.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

const toRemove = new Set([
  'cvs-cu-baekjongwon-plate-440',
  'cvs-seven-matjangwoo-bibim-410',
  'cvs-gs25-tong-sausage-gimbap-240'
]);

const cleaned = seed.filter(s => !toRemove.has(s.menu_id));
console.log(`Original: ${seed.length}, Cleaned: ${cleaned.length}`);

fs.writeFileSync(seedPath, JSON.stringify(cleaned, null, 2), 'utf-8');
console.log('Successfully removed 3 outdated duplicate items from data/seed.json!');
