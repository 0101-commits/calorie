import https from 'https';

const queries = [
  { id: 'screwbar', q: '롯데 스크류바' },
  { id: 'jawsbar', q: '롯데 죠스바' },
  { id: 'wasabi_almond', q: '바프 와사비맛 아몬드' },
  { id: 'sajo_hotbar', q: '사조 매콤 숯불구이맛 후랑크 80g' },
  { id: 'harim_franks', q: '하림 닭가슴살 프랑크 오리지널 80g' }
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
        const urls = [...new Set(matches.map(m => `https://search4.kakaocdn.net/argon/320x320_85_c/${m[1]}`))];
        resolve(urls.slice(0, 4));
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  for (const it of queries) {
    const res = await searchDaum(it.q);
    console.log(`\n=== ${it.id} (${it.q}) ===`);
    res.forEach(u => console.log(u));
  }
}

main();
