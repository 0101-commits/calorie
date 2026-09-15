import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractChosung,
  normalizeText,
  createSearchItem,
  searchProducts
} from '../js/search.js';

test('1. 초성 추출 테스트', () => {
  assert.equal(extractChosung('닭가슴살'), 'ㄷㄱㅅㅅ');
  assert.equal(extractChosung('그릭요거트 플레인'), 'ㄱㄹㅇㄱㅌ ㅍㄹㅇ');
  assert.equal(extractChosung('CU 프로틴 음료'), 'CU ㅍㄹㅌ ㅇㄹ');
});

test('2. 초성 검색 매칭 테스트', () => {
  const sample = [
    { menu_id: '1', name: '훈제 닭가슴살', brand: 'GS25', category: '닭가슴살/육가공' },
    { menu_id: '2', name: '그릭요거트 플레인', brand: 'GS25', category: '유제품/음료' },
    { menu_id: '3', name: '프로틴 초코 음료', brand: 'CU', category: '유제품/음료' }
  ];

  const index = sample.map(createSearchItem);

  // 'ㄷㄱㅅㅅ' 검색 시 '훈제 닭가슴살' 포함 여부
  const res1 = searchProducts(index, 'ㄷㄱㅅㅅ');
  assert.equal(res1.length, 1);
  assert.equal(res1[0].name, '훈제 닭가슴살');

  // 'ㅍㄹㅌ' 검색 시 '프로틴 초코 음료' 매칭
  const res2 = searchProducts(index, 'ㅍㄹㅌ');
  assert.equal(res2.length, 1);
  assert.equal(res2[0].name, '프로틴 초코 음료');
});
