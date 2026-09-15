import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const seed = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/seed.json'), 'utf-8'));
const legacy = seed.filter(d => d.menu_id.includes('-p1') || d.menu_id.includes('-d2'));

console.log(`Total legacy items: ${legacy.length}`);
legacy.forEach((d, i) => {
  console.log(`${(i + 1).toString().padStart(3, ' ')}: [${d.menu_id}] ${d.brand} | ${d.name} | ${d.channel}`);
});
