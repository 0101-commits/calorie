// 초성 검색 및 오타 허용 한국어 검색 엔진 (search.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 한글 문자열에서 초성 추출
 * 예: "닭가슴살" -> "ㄷㄱㅅㅅ"
 */
export function extractChosung(str) {
  if (!str) return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xac00;
    if (code >= 0 && code <= 11171) {
      const chosungIndex = Math.floor(code / (21 * 28));
      result += CHOSUNG[chosungIndex];
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * 텍스트 정규화 (공백, 특수문자 제거 및 소문자화)
 */
export function normalizeText(str) {
  if (!str) return '';
  return str.replace(/[\s\-_.,'"()[\]{}·+]/g, '').toLowerCase();
}

/**
 * 레벤슈타인 편집 거리 계산
 */
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 치환
          matrix[i][j - 1] + 1,     // 삽입
          matrix[i - 1][j] + 1      // 삭제
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 단일 상품의 검색 색인 생성
 */
export function createSearchItem(menu) {
  const normName = normalizeText(menu.name || '');
  const normBrand = normalizeText(menu.brand || '');
  const normCategory = normalizeText(menu.category || '');
  const chosungName = extractChosung(menu.name || '');
  const chosungBrand = extractChosung(menu.brand || '');

  return {
    raw: menu,
    normName,
    normBrand,
    normCategory,
    chosungName: normalizeText(chosungName),
    chosungBrand: normalizeText(chosungBrand),
    fullText: `${normBrand}${normName}${normCategory}`
  };
}

/**
 * 검색 실행
 * @param {Array} searchIndex - createSearchItem으로 인덱싱된 배열
 * @param {string} query - 검색어
 * @param {number} limit - 결과 상한
 */
export function searchProducts(searchIndex, query, limit = 30) {
  if (!query || !query.trim()) return [];

  const rawQ = query.trim();
  const normQ = normalizeText(rawQ);
  const chosungQ = extractChosung(rawQ);
  const isOnlyChosung = /^[ㄱ-ㅎ]+$/.test(rawQ.replace(/\s+/g, ''));

  const scored = [];

  for (const item of searchIndex) {
    let score = 0;
    let matchType = null;

    // 1. 초성 질의인 경우
    if (isOnlyChosung) {
      if (item.chosungName.startsWith(normQ)) {
        score = 100 - (item.chosungName.length - normQ.length);
        matchType = 'chosung_prefix';
      } else if (item.chosungName.includes(normQ)) {
        score = 70;
        matchType = 'chosung_contain';
      } else if (item.chosungBrand.includes(normQ)) {
        score = 60;
        matchType = 'chosung_brand';
      } else if (normQ.length >= 3) {
        // 초성 질의에도 1자 오차를 허용한다(ㄷㄱㅅㅅ → ㄷㄱㅅ 오타 등).
        const dist = levenshteinDistance(item.chosungName.slice(0, normQ.length), normQ);
        if (dist <= 1) {
          score = 35;
          matchType = 'chosung_fuzzy';
        }
      }
    } else {
      // 2. 일반 텍스트 질의
      if (item.normName.startsWith(normQ)) {
        score = 100 - (item.normName.length - normQ.length);
        matchType = 'exact_prefix';
      } else if (item.normName.includes(normQ)) {
        score = 80;
        matchType = 'exact_contain';
      } else if (item.normBrand.includes(normQ)) {
        score = 70;
        matchType = 'brand_contain';
      } else if (item.normCategory.includes(normQ)) {
        score = 60;
        matchType = 'category_contain';
      } else if (item.fullText.includes(normQ)) {
        score = 50;
        matchType = 'fulltext_contain';
      } else if (normQ.length >= 2) {
        // 3. 편집거리 오타 검사 (길이 2 이상)
        const dist = levenshteinDistance(item.normName.slice(0, normQ.length), normQ);
        if (dist <= 1) {
          score = 40 - dist * 10;
          matchType = 'fuzzy';
        } else if (dist <= 2 && normQ.length >= 4) {
          score = 20;
          matchType = 'fuzzy';
        }
      }
    }

    if (score > 0) {
      scored.push({
        item: item.raw,
        score,
        matchType
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.item);
}

if (typeof window !== 'undefined') {
  window.ProteinSearch = {
    extractChosung,
    normalizeText,
    levenshteinDistance,
    createSearchItem,
    searchProducts
  };
}
