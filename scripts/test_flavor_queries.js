// scripts/test_flavor_queries.js
import fs from 'fs';
import path from 'path';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
};

async function searchDaum(query) {
  const url = `https://search.daum.net/search?w=img&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers });
    const html = await res.text();
    const regex = /https:\/\/search\d+\.kakaocdn\.net\/argon\/[^\s"'<>]+/g;
    const matches = (html.match(regex) || []).filter(x => x.includes('320x320') || x.includes('R320x320'));
    return matches.slice(0, 3);
  } catch (err) {
    return [];
  }
}

async function main() {
  const testList = [
    ['kirkland-brownie', '커클랜드 단백질바 브라우니'],
    ['metree-garlic', '미트리 닭가슴살 갈릭볶음밥'],
    ['labnosh-energy', '닥터랩노쉬 에너지 구미 젤리'],
    ['cledor-choco', '끌레도르 더단백 초코 바'],
    ['esther-choco', '여에스더 단백질 쿠키 다크초코'],
    ['gogidaesin-orig', '고기대신 비건육포 오리지널'],
    ['unlimeat-cheese', '언리미트 식물성 육포 치즈'],
    ['unlimeat-pepper', '언리미트 식물성 육포 후추'],
    ['begrain-teri', '비그레인 데리야끼'],
    ['begrain-spicy', '비그레인 매운맛'],
    ['goobne-toast-egg', '굽네 에그햄치즈 브리오슈']
  ];

  for (const [id, q] of testList) {
    const urls = await searchDaum(q);
    console.log(`[${id}] "${q}" => ${urls.length > 0 ? urls[0] : 'NONE'}`);
    await new Promise(r => setTimeout(r, 80));
  }
}

main();
