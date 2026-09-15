import https from 'https';

const queries = [
  '테이크핏 맥스 고소한맛 250',
  '남양 테이크핏 맥스 고소한맛'
];

async function searchDaum(query) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query);
    const url = `https://search.daum.net/search?w=img&q=${encoded}`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const matches = [...data.matchAll(/https:\/\/search\d+\.kakaocdn\.net\/argon\/[0-9a-zA-Z_]+\/([0-9a-zA-Z_-]+)/g)];
        const urls = [...new Set(matches.map(m => `https://search3.kakaocdn.net/argon/320x320_85_c/${m[1]}`))];
        resolve(urls.slice(0, 3));
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  for (const q of queries) {
    const urls = await searchDaum(q);
    console.log(`\n=== Query: ${q} ===`);
    urls.forEach(u => console.log(`${u}`));
  }
}

main();
