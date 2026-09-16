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

async function fetchNaverShoppingImage(query) {
  const url = `https://search.naver.com/search.naver?where=shopping&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/src="(https:\/\/shopping-phinf\.pstatic\.net\/main_[^"]+)"/);
    if (match) {
      // Modify URL to get slightly higher res (e.g. from type=f140 to type=f300 if exists, but Naver thumbnails are good enough)
      let imgUrl = match[1];
      // strip query string if any for cleaner URL
      imgUrl = imgUrl.split('?')[0];
      return imgUrl;
    }
  } catch (e) {
    // console.log(e.message);
  }
  return null;
}

async function fetchDaumShoppingImage(query) {
  const url = `https://search.daum.net/search?w=tot&q=${encodeURIComponent(query + ' 가격')}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    // Daum shopping thumbnail: search.pstatic.net or shop.daumcdn.net etc.
    const match = html.match(/src=["'](https:\/\/shop\d?\.daumcdn\.net\/shophow[^"']+)["']/);
    if (match) return match[1].split('?')[0];
  } catch (e) {}
  return null;
}

// Fallback to GS25/CU image search if it's a convenience store item
// Or just use Daum image search but with "제품 패키지" (product package) keyword
async function fetchImageFallback(query) {
  const url = `https://search.daum.net/search?w=img&q=${encodeURIComponent(query + ' "영양성분" OR "편의점"')}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    const regex = /https:\/\/search\d+\.kakaocdn\.net\/argon\/[^\s"'<>]+/g;
    const matches = html.match(regex) || [];
    // skip very wide images (often banners)
    return matches[0] || null;
  } catch (e) {}
  return null;
}

async function run() {
  const dataPath = path.join(rootDir, 'data', 'seed.json');
  const items = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  let updated = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // We want to fetch for EVERY item to overwrite the memes
    let q = item.name;
    if (item.brand && !item.name.includes(item.brand)) {
      q = item.brand + ' ' + item.name;
    }
    
    // For franchise or CVS, append something to narrow it down
    if (item.channel === 'fr') q += ' 메뉴';

    let img = await fetchNaverShoppingImage(q);
    if (!img) {
      img = await fetchDaumShoppingImage(q);
    }
    if (!img) {
      // Trying simpler query
      img = await fetchNaverShoppingImage(item.name);
    }
    if (!img) {
      img = await fetchImageFallback(q);
    }

    if (img) {
      item.image_url = img;
      updated++;
      console.log(`[${i+1}/${items.length}] [OK] ${item.name} -> ${img.substring(0, 50)}...`);
    } else {
      console.log(`[${i+1}/${items.length}] [FAIL] ${item.name}`);
    }

    // save every 50 to not lose progress
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(dataPath, JSON.stringify(items, null, 2), 'utf-8');
      console.log('Saved intermediate data_raw.json');
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(items, null, 2), 'utf-8');
  console.log(`Finished. Updated ${updated}/${items.length} images.`);
}

run();
