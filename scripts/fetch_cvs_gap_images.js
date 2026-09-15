import https from 'https';

const items = [
  { q: '농심 너구리 큰사발 111g', id: 'cvs-nongshim-neoguri-bowl-111' },
  { q: '오뚜기 참깨라면 큰사발 110g', id: 'cvs-ottogi-chamkkae-ramen-cup-110' },
  { q: '오뚜기 열라면 큰사발 105g', id: 'cvs-ottogi-yeol-ramen-cup-105' },
  { q: '팔도 왕뚜껑 110g', id: 'cvs-paldo-wangttukkeong-110' },
  { q: 'GS25 오모리 김치찌개라면 160g', id: 'cvs-gs25-omori-kimchi-stew-cup-160' },
  { q: '삼양 치즈 불닭볶음면 큰컵 105g', id: 'cvs-samyang-cheese-buldak-cup-105' },
  { q: '농심 안성탕면 컵 66g', id: 'cvs-nongshim-ansungtangmyun-cup-66' },

  { q: 'GS25 아이돌 인기 샌드위치', id: 'cvs-gs25-idol-popular-sandwich-150' },
  { q: 'GS25 더블 불고기버거', id: 'cvs-gs25-double-bulgogi-burger-190' },
  { q: 'CU 대만식 연유 샌드위치', id: 'cvs-cu-taiwan-condensed-milk-sandwich-130' },
  { q: 'CU 매콤 치킨버거', id: 'cvs-cu-spicy-chicken-burger-180' },
  { q: '세븐일레븐 불고기 버거', id: 'cvs-seven-bulgogi-burger-175' },
  { q: '세븐일레븐 에그 포테이토 샌드위치', id: 'cvs-seven-egg-potato-sandwich-160' },

  { q: '롯데 의성마늘 프랑크 70g', id: 'cvs-lotte-uiseong-garlic-frank-70' },
  { q: '롯데 의성마늘 매콤프랑크 70g', id: 'cvs-lotte-uiseong-garlic-spicy-frank-70' },
  { q: 'CJ 맥스봉 오리지널 50g', id: 'cvs-cj-maxbon-original-50' },
  { q: '롯데 키스틱 오리지널 50g', id: 'cvs-lotte-kisseutik-original-50' },
  { q: '스팸 싱글 클래식 80g', id: 'cvs-cj-spam-single-classic-80' },
  { q: '사조 대림선 숯불구이맛 핫바 매콤', id: 'cvs-sajo-spicy-hotbar-80' },

  { q: '칠성사이다 제로 355mL 캔', id: 'cvs-lotte-chilsung-cider-zero-355' },
  { q: '코카콜라 제로 355mL 캔', id: 'cvs-cocacola-zero-355' },
  { q: '펩시 제로슈거 라임 355mL 캔', id: 'cvs-pepsi-zero-lime-355' },
  { q: '빙그레 바나나맛우유 라이트 240mL', id: 'cvs-binggrae-banana-milk-light-240' },
  { q: '매일 바리스타룰스 로에스프레소 라떼', id: 'cvs-maeil-baristarules-latte-250' },
  { q: '광동 비타500 제로 100mL', id: 'cvs-kwangdong-vita500-zero-100' },

  { q: '롯데 월드콘 바닐라', id: 'cvs-lotte-worldcone-vanilla-160' },
  { q: '롯데 죠스바 아이스크림', id: 'cvs-lotte-jawsbar-75' },
  { q: '롯데 스크류바 아이스크림', id: 'cvs-lotte-screwbar-75' },
  { q: '빙그레 바밤바', id: 'cvs-binggrae-babamba-70' },

  { q: 'HBAF 허니버터아몬드 30g', id: 'cvs-hbaf-honey-butter-almond-30' },
  { q: 'HBAF 와사비맛아몬드 30g', id: 'cvs-hbaf-wasabi-almond-30' },
  { q: '오리온 초코파이 情 1개', id: 'cvs-orion-chocopie-single-39' },
  { q: '롯데 칙촉 오리지널 낱개', id: 'cvs-lotte-chicchoc-single-30' },
  { q: '농심 뿌셔뿌셔 불고기맛 90g', id: 'cvs-nongshim-bbusheo-bbusheo-bulgogi-90' },

  { q: '풀무원 촉촉란 2구', id: 'cvs-pulmuone-chokchokran-egg-100' },
  { q: '햇반컵반 미역국밥 167g', id: 'cvs-cj-cupban-miyeokguk-167' },
  { q: '햇반컵반 황태국밥 170g', id: 'cvs-cj-cupban-hwangtaeguk-170' }
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
        resolve(urls[0] || '');
      });
    }).on('error', () => resolve(''));
  });
}

async function main() {
  const results = {};
  for (const it of items) {
    const img = await searchDaum(it.q);
    results[it.id] = img;
    console.log(`${it.id}: ${img ? 'FOUND' : 'MISSING'} -> ${img}`);
  }
  import('fs').then(fs => {
    fs.writeFileSync('scripts/cvs_gap_images.json', JSON.stringify(results, null, 2), 'utf-8');
  });
}

main();
