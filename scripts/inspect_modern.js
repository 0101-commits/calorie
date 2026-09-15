import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));
const modern = data.filter(d => !d.menu_id.includes('-p1') && !d.menu_id.includes('-d2'));

console.log('Total modern items:', modern.length);

const byChannel = {};
modern.forEach(d => {
  if (!byChannel[d.channel]) byChannel[d.channel] = [];
  byChannel[d.channel].push(d);
});

for (const [ch, items] of Object.entries(byChannel)) {
  console.log(`\n=== Channel: ${ch} (${items.length} items) ===`);
  const brandCounts = {};
  items.forEach(it => { brandCounts[it.brand] = (brandCounts[it.brand] || 0) + 1; });
  console.log(brandCounts);
}
