// CleanRadar 성분 사전 게이트 (기획안 v2.0 §5.3 정식화 4조건)
// 이 사전은 실존 브랜드 제품에 붙는 판정이다. 근거 없는 기피 판정과 효능 단정을
// 코드가 아니라 테스트가 막는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENT_DICTIONARY, analyzeIngredients } from '../js/clean_radar.js';

const ALLOWED_BASIS = [
  '식약처 「식품첨가물의 기준 및 규격」',
  '식약처 「식품등의 표시기준」',
  '식약처 당류 저감 정책 권고',
  'WHO/IARC 분류'
];

test('사전의 모든 항목이 필수 필드를 갖는다', () => {
  assert.ok(INGREDIENT_DICTIONARY.length > 0);
  for (const d of INGREDIENT_DICTIONARY) {
    assert.ok(Array.isArray(d.keywords) && d.keywords.length > 0, `${d.name}: keywords 없음`);
    assert.ok(d.name && d.title && d.desc, `${d.name}: 표시 문구 누락`);
    assert.ok([1, 2, 3, 4].includes(d.tier), `${d.name}: tier 이상 (${d.tier})`);
    assert.ok('basis' in d, `${d.name}: basis 필드 없음`);
  }
});

test('기피(tier 4) 판정에는 공적 근거가 반드시 있다', () => {
  for (const d of INGREDIENT_DICTIONARY.filter(x => x.tier === 4)) {
    assert.ok(d.basis, `${d.name}: 근거 없이 기피 판정을 내릴 수 없다`);
    assert.ok(
      ALLOWED_BASIS.some(b => d.basis.startsWith(b)),
      `${d.name}: 허용되지 않은 근거 형식 (${d.basis})`
    );
  }
});

test('근거가 있는 항목은 허용된 출처 형식만 쓴다', () => {
  for (const d of INGREDIENT_DICTIONARY) {
    if (!d.basis) continue;
    assert.ok(
      ALLOWED_BASIS.some(b => d.basis.startsWith(b)),
      `${d.name}: 출처 형식이 목록에 없다 (${d.basis})`
    );
  }
});

test('효능·위해 단정 어휘를 쓰지 않는다', () => {
  // 브랜드 제품에 붙는 문구이므로 인과·서열 단정은 표시광고법 리스크가 된다.
  const BANNED = ['최악', '최우수', '직결', '주요 원인', '발암물질입니다', '건강을 해치', '중독성'];
  for (const d of INGREDIENT_DICTIONARY) {
    const text = `${d.title} ${d.desc}`;
    for (const w of BANNED) {
      assert.ok(!text.includes(w), `${d.name}: 단정 어휘 "${w}" 사용`);
    }
  }
});

test('원재료가 없으면 어떤 성분도 만들어내지 않는다', () => {
  const report = analyzeIngredients('', { category: '닭가슴살/육가공', pw_tier: 'washing', sugar_g: 30 });
  assert.equal(report.available, false);
  assert.equal(report.tokens.length, 0);
  assert.equal(report.cleanScore, null);
});

test('넓은 키워드보다 구체 키워드가 먼저 온다 (사전 순서 고정)', () => {
  // 사전은 먼저 걸리는 항목이 이긴다. '대두' 같은 넓은 키워드가 앞에 오면
  // 분리대두단백·대두레시틴·대두유가 전부 tier 1 '두부·대두'(안심 원료)로 잡힌다.
  const nameOf = raw => {
    const tokens = analyzeIngredients(raw).tokens;
    return tokens.length ? tokens[0].name : null;
  };

  assert.equal(nameOf('분리대두단백(미국산)'), '분리·농축 대두단백');
  assert.equal(nameOf('대두단백'), '분리·농축 대두단백');
  assert.equal(nameOf('대두레시틴'), '레시틴 (유화제)');
  assert.equal(nameOf('대두유'), '대두유');
  assert.equal(nameOf('두부'), '두부/자연대두');

  // 순서 자체를 고정한다 — 뒤에 항목을 추가하다 순서가 뒤집히면 여기서 막힌다.
  const indexOf = name => INGREDIENT_DICTIONARY.findIndex(d => d.name === name);
  const broad = indexOf('두부/자연대두');
  for (const specific of ['분리·농축 대두단백', '레시틴 (유화제)', '대두유']) {
    assert.ok(indexOf(specific) < broad, `${specific} 항목이 '두부/자연대두'보다 뒤에 있다`);
  }
});

test('가공 단백 소재를 원물과 같은 등급으로 매기지 않는다', () => {
  // 분리·농축 대두단백은 가공 단계를 거친 소재이므로 두부·대두 원물(tier 1)과 같을 수 없다.
  const soyIsolate = INGREDIENT_DICTIONARY.find(d => d.name === '분리·농축 대두단백');
  const wholeSoy = INGREDIENT_DICTIONARY.find(d => d.name === '두부/자연대두');
  assert.equal(soyIsolate.tier, 2);
  assert.equal(wholeSoy.tier, 1);
  assert.equal(INGREDIENT_DICTIONARY.find(d => d.name === '레시틴 (유화제)').category, 'additive');
});
