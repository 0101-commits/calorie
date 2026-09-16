import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const dataPath = path.join(rootDir, 'data', 'seed.json');
let items = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
let purged = 0;

items.forEach(item => {
  if (item.image_url && item.image_url.includes('kakaocdn.net/argon')) {
    item.image_url = '';
    purged++;
  }
});

fs.writeFileSync(dataPath, JSON.stringify(items, null, 2), 'utf-8');
console.log('Purged ' + purged + ' meme/Kakao images.');
