import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data.json'), 'utf-8'));
const legacy = data.filter(d => d.menu_id.match(/^[a-z]+-[dp]\d+/));

console.log('Total regex matched legacy items:', legacy.length);
const byChannel = {};
legacy.forEach(d => {
  byChannel[d.channel] = (byChannel[d.channel] || 0) + 1;
});
console.log('Legacy by channel:', byChannel);

legacy.forEach((d, i) => {
  console.log(`${(i + 1).toString().padStart(3, ' ')}: [${d.channel}] [${d.menu_id}] ${d.brand} | ${d.name}`);
});
