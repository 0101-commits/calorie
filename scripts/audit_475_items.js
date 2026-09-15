import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const seed = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/seed.json'), 'utf-8'));
const modern = seed.filter(d => !d.menu_id.includes('-p1') && !d.menu_id.includes('-d2') && !d.menu_id.includes('-d1') && !d.menu_id.includes('-d3'));

const idSet = new Set();
const nameSet = new Set();

for (const m of modern) {
  if (idSet.has(m.menu_id)) {
    console.error(`Duplicate menu_id: ${m.menu_id}`);
  }
  idSet.add(m.menu_id);

  const key = `${m.brand}___${m.name}`;
  if (nameSet.has(key)) {
    console.warn(`Duplicate brand+name: ${key}`);
  }
  nameSet.add(key);
}

console.log(`Audited ${modern.length} items. Unique menu_ids: ${idSet.size}, Unique brand+name: ${nameSet.size}`);
