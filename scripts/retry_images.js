import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
};

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchNaverShoppingImage(query) {
  const url = 'https://search.naver.com/search.naver?where=shopping&query=' + encodeURIComponent(query);
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/src="(https:\/\/shopping-phinf\.pstatic\.net\/main_[^"]+)"/);
    if (match) return match[1].split('?')[0];
  } catch (e) {}
  return null;
}

async function fetchDaumShoppingImage(query) {
  const url = 'https://search.daum.net/search?w=tot&q=' + encodeURIComponent(query + ' 가격');
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/src=["'](https:\/\/shop\d?\.daumcdn\.net\/shophow[^"']+)["']/);
    if (match) return match[1].split('?')[0];
  } catch (e) {}
  return null;
}

async function run() {
  const dataPath = path.join(rootDir, 'data', 'seed.json');
  const items = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  let updated = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Only update if it's still using the old kakaocdn/argon image (which are the memes)
    if (item.image_url && item.image_url.includes('kakaocdn.net/argon')) {
      let q = item.name;
      if (item.brand && !item.name.includes(item.brand)) {
        q = item.brand + ' ' + item.name;
      }
      if (item.channel === 'fr') q += ' 메뉴';

      await delay(800); // 800ms delay to avoid rate limiting
      
      let img = await fetchNaverShoppingImage(q);
      if (!img) img = await fetchDaumShoppingImage(q);
      if (!img) img = await fetchNaverShoppingImage(item.name);

      if (img) {
        item.image_url = img;
        updated++;
        console.log('[' + (i+1) + '/' + items.length + '] [OK] ' + item.name + ' -> ' + img.substring(0, 50));
      } else {
        console.log('[' + (i+1) + '/' + items.length + '] [FAIL] ' + item.name);
      }
      
      if (updated % 20 === 0) fs.writeFileSync(dataPath, JSON.stringify(items, null, 2), 'utf-8');
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(items, null, 2), 'utf-8');
  console.log('Finished. Updated ' + updated + ' images.');
}
run();
