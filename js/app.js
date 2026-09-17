// 프로틴레이더 메인 애플리케이션 (app.js)
// 기획안 v2.0 P2 — 신뢰 UI·2모드 랭킹·접근성·페이로드 분리를 반영한다.
//
// 핵심 원칙 3가지가 이 파일 전체를 관통한다.
//   ① 모르는 값은 0이 아니라 "—"로 쓴다. 등급이 보류된 제품은 숨기지 않고 사유를 보여준다.
//   ② 판정은 빌드가 한 번만 한다. 화면은 저장된 결과를 읽기만 한다(카드·상세 불일치 방지).
//   ③ 비교 기준이 다른 채널은 같은 랭킹에 섞지 않는다.

import { createSearchItem, searchProducts } from './search.js';
import {
  PRESETS, computeDailyTargets, computeMealTarget, computeFitScore,
  generateReasonSentence, configureFromRules, applyTimingTarget,
  TIMING_PROFILES, TIMING_LABELS
} from './calc.js';
import { findBestCombos, TIMING_CARB_GUARD } from './combo.js';
import { BarcodeScanner, lookupBarcode } from './scan.js';
import { INGREDIENT_DICTIONARY, absorptionRank } from './clean_radar.js';

// 제보·신고 수신 엔드포인트. 비어 있으면 화면이 "준비 중"이라고 정직하게 말한다.
const API_BASE = (typeof window !== 'undefined' && window.PR_API_BASE) || '';

const PAGE_SIZE = 50;

// 랭킹 2모드 — 기획안 §6.2. 비교 기준(1개 판매 단위 vs 100g 단가)이 다르므로 섞지 않는다.
const RANKING_MODES = {
  store: { label: '지금 매장에서', channels: ['cvs', 'fr'], note: '편의점·프랜차이즈 · 1개 판매 단위 가격 기준' },
  stock: { label: '미리 쟁여두기', channels: ['mart', 'online'], note: '마트·온라인 · 단백질 100g당 가격 기준' }
};

const state = {
  index: [],           // 목록용 경량 인덱스 (data_index.json)
  products: [],        // 상세·계산용 전체 데이터 (data.json, 지연 로드)
  productMap: new Map(),
  meta: null,
  searchIndex: [],
  fullDataPromise: null,
  activeTab: 'home',
  homeFilter: 'all',
  rankingMode: 'store',
  rankingSegment: 'all',
  rankingSort: 'ppr',
  rankingFilter: 'all',
  rankingRendered: 0,
  rankingList: [],
  calcMode: 'single',
  // 타이밍은 그날 한 번 쓰는 값이라 저장하지 않는다 — 방문할 때마다 미선택에서 시작한다.
  timing: null,
  compareList: [],
  activeProduct: null,
  userProfile: {
    gender: 'female', age: 28, height_cm: 162, weight_kg: 54,
    activity_level: 'moderate', goal: 'diet', meal: 'lunch', budget_krw: 8000
  }
};

let scannerInstance = null;

const el = {};
function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
function cacheDom() {
  const ids = [
    'home-search-input', 'home-scan-btn', 'new-items-container', 'home-recommend-container',
    'washing-alert-container', 'ranking-list-container', 'calc-result-container',
    'compare-dock', 'compare-dock-count', 'btn-open-compare', 'sheet-detail', 'sheet-detail-content',
    'btn-close-detail', 'sheet-compare', 'sheet-compare-content', 'btn-close-compare',
    'sheet-scanner', 'btn-close-scanner', 'scanner-video', 'select-demo-barcode', 'btn-test-barcode',
    'sheet-policy', 'btn-open-policy', 'btn-close-policy', 'sheet-report', 'report-target-name',
    'btn-close-report', 'btn-submit-report', 'data-freshness', 'ranking-count', 'ranking-more',
    'scanner-status', 'new-items-count', 'report-form-status', 'input-barcode-photo'
  ];
  for (const id of ids) el[toCamel(id)] = document.getElementById(id);
  el.tabBtns = document.querySelectorAll('.tab-btn');
  el.tabContents = document.querySelectorAll('.tab-content');
}

/* ───────────────────────── 초기화 ───────────────────────── */

async function init() {
  cacheDom();
  loadStoredProfile();
  await loadIndex();
  setupEventListeners();
  renderAll();
  // 목록이 먼저 그려진 뒤에 상세·계산용 전체 데이터를 배경에서 채운다.
  scheduleFullData();
}

function loadStoredProfile() {
  try {
    const saved = localStorage.getItem('pr_user_profile');
    if (saved) state.userProfile = { ...state.userProfile, ...JSON.parse(saved) };
  } catch (e) {
    console.warn('LocalStorage load error:', e);
  }
}

function saveStoredProfile() {
  try {
    localStorage.setItem('pr_user_profile', JSON.stringify(state.userProfile));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
}

/** 1단계 — 목록용 경량 인덱스(gzip 약 27KB) */
async function loadIndex() {
  try {
    const [idxRes, metaRes] = await Promise.all([fetch('data_index.json'), fetch('data_meta.json')]);
    if (!idxRes.ok) throw new Error('data_index.json 로드 실패');
    state.index = await idxRes.json();
    state.searchIndex = state.index.map(createSearchItem);
    if (metaRes.ok) {
      state.meta = await metaRes.json();
      // 화면이 쓰는 추천 파라미터도 룰 파일 스냅샷에서 주입한다(단일 원천).
      if (state.meta.rules_snapshot) configureFromRules(state.meta.rules_snapshot.recommendation);
    }
  } catch (err) {
    console.error('인덱스 로드 오류:', err);
    state.index = [];
  }
}

/** 2단계 — 상세·계산용 전체 데이터 */
function ensureFullData() {
  if (state.products.length) return Promise.resolve(state.products);
  if (state.fullDataPromise) return state.fullDataPromise;

  state.fullDataPromise = fetch('data.json')
    .then(res => {
      if (!res.ok) throw new Error('data.json 로드 실패');
      return res.json();
    })
    .then(list => {
      state.products = list;
      state.productMap = new Map(list.map(p => [p.menu_id, p]));
      return list;
    })
    .catch(err => {
      console.error('전체 데이터 로드 오류:', err);
      state.fullDataPromise = null;
      return [];
    });
  return state.fullDataPromise;
}

function scheduleFullData() {
  const run = () => ensureFullData().then(() => {
    if (state.activeTab === 'calc') renderCalcTab();
  });
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 300);
}

/** menu_id 로 전체 레코드를 찾는다(구 ID 공유 링크도 받아준다). */
function findFull(menuId) {
  if (state.productMap.has(menuId)) return state.productMap.get(menuId);
  return state.products.find(p => p.menu_id === menuId ||
    (Array.isArray(p.legacy_ids) && p.legacy_ids.includes(menuId))) || null;
}

/* ───────────────────────── 이벤트 ───────────────────────── */

function setupEventListeners() {
  el.tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  const navBrand = document.getElementById('nav-brand');
  if (navBrand) navBrand.addEventListener('click', (e) => { e.preventDefault(); switchTab('home'); });

  let debounceTimer;
  el.homeSearchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = e.target.value.trim();
      if (q) renderSearchResults(q);
      else renderHomeSections();
    }, 150);
  });

  document.querySelectorAll('[data-home-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-home-filter]', btn);
      state.homeFilter = btn.dataset.homeFilter;
      renderHomeSections();
    });
  });

  el.homeScanBtn.addEventListener('click', openScannerModal);
  el.btnCloseScanner.addEventListener('click', closeScannerModal);
  if (el.btnTestBarcode) {
    el.btnTestBarcode.addEventListener('click', () => {
      const code = el.selectDemoBarcode.value;
      if (code) handleBarcodeScanned(code);
    });
  }

  document.querySelectorAll('[data-ranking-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-ranking-mode]', btn);
      state.rankingMode = btn.dataset.rankingMode;
      state.rankingSort = state.rankingMode === 'stock' ? 'per100g' : 'ppr';
      state.rankingFilter = 'all';
      setActiveInGroup('[data-filter]', document.querySelector('[data-filter="all"]'));
      syncModeUi();
      renderRankingList();
    });
  });

  document.querySelectorAll('[data-segment]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-segment]', btn);
      state.rankingSegment = btn.dataset.segment;
      renderRankingList();
    });
  });

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-sort]', btn);
      state.rankingSort = btn.dataset.sort;
      updateSortTip();
      renderRankingList();
    });
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-filter]', btn);
      state.rankingFilter = btn.dataset.filter;
      renderRankingList();
    });
  });

  if (el.rankingMore) el.rankingMore.addEventListener('click', () => renderRankingChunk());

  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-preset]', btn);
      const preset = PRESETS[btn.dataset.preset];
      if (preset) {
        state.userProfile = { ...state.userProfile, ...preset };
        syncProfileForm();
        renderCalcTab();
        saveStoredProfile();
      }
    });
  });

  ['input-gender', 'input-age', 'input-height', 'input-weight', 'input-activity', 'input-goal', 'input-meal', 'input-budget']
    .forEach(id => {
      const elem = document.getElementById(id);
      if (elem) elem.addEventListener('change', () => {
        readProfileForm();
        renderCalcTab();
        saveStoredProfile();
      });
    });

  // 타이밍 칩 — 고른 칩을 다시 누르면 해제된다(선택 없음 = 현행 동작).
  document.querySelectorAll('[data-timing]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = state.timing === btn.dataset.timing ? null : btn.dataset.timing;
      state.timing = next;
      document.querySelectorAll('[data-timing]').forEach(b => {
        const on = b.dataset.timing === next;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      renderCalcTab();
    });
  });

  document.querySelectorAll('[data-calc-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveInGroup('[data-calc-mode]', btn);
      state.calcMode = btn.dataset.calcMode;
      renderCalcTab();
    });
  });

  el.btnCloseDetail.addEventListener('click', () => el.sheetDetail.close());
  el.btnCloseCompare.addEventListener('click', () => el.sheetCompare.close());
  el.btnClosePolicy.addEventListener('click', () => el.sheetPolicy.close());
  el.btnCloseReport.addEventListener('click', () => el.sheetReport.close());

  [el.sheetDetail, el.sheetCompare, el.sheetScanner, el.sheetPolicy, el.sheetReport].forEach(dlg => {
    if (!dlg) return;
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const rect = dlg.getBoundingClientRect();
      const inside = rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
      if (!inside) {
        if (dlg === el.sheetScanner && scannerInstance) scannerInstance.stopCamera();
        dlg.close();
      }
    });
  });

  // 카메라를 못 쓰는 상황(권한 거부·미지원)의 대체 경로 — 갤러리 사진에서 바코드를 읽는다.
  if (el.inputBarcodePhoto) {
    el.inputBarcodePhoto.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      announce(el.scannerStatus, '사진에서 바코드를 찾는 중…');
      if (!scannerInstance) scannerInstance = new BarcodeScanner({ onStatus: m => announce(el.scannerStatus, m) });
      const code = await scannerInstance.scanImageFile(file);
      e.target.value = '';
      if (code) handleBarcodeScanned(code);
      else announce(el.scannerStatus, '사진에서 바코드를 찾지 못했습니다. 제품명으로 검색하거나 제보해 주세요.');
    });
  }

  el.btnOpenPolicy.addEventListener('click', (e) => { e.preventDefault(); el.sheetPolicy.showModal(); });
  el.btnOpenCompare.addEventListener('click', openCompareModal);
  el.btnSubmitReport.addEventListener('click', submitReport);
}

function setActiveInGroup(selector, btn) {
  if (!btn) return;
  document.querySelectorAll(selector).forEach(b => {
    const on = b === btn;
    b.classList.toggle('active', on);
    if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on));
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  el.tabBtns.forEach(b => {
    const on = b.dataset.tab === tabId;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  el.tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (tabId === 'calc') renderCalcTab();
}

/* ───────────────────────── 프로필 폼 ───────────────────────── */

function syncProfileForm() {
  const set = (id, v) => { const node = document.getElementById(id); if (node) node.value = v; };
  set('input-gender', state.userProfile.gender);
  set('input-age', state.userProfile.age);
  set('input-height', state.userProfile.height_cm);
  set('input-weight', state.userProfile.weight_kg);
  set('input-activity', state.userProfile.activity_level);
  set('input-goal', state.userProfile.goal);
  set('input-meal', state.userProfile.meal);
  set('input-budget', state.userProfile.budget_krw);
}

function readProfileForm() {
  const get = id => (document.getElementById(id) || {}).value;
  state.userProfile.gender = get('input-gender');
  state.userProfile.age = Number(get('input-age'));
  state.userProfile.height_cm = Number(get('input-height'));
  state.userProfile.weight_kg = Number(get('input-weight'));
  state.userProfile.activity_level = get('input-activity');
  state.userProfile.goal = get('input-goal');
  state.userProfile.meal = get('input-meal');
  // 프리셋 값이 select 옵션에 없으면 value 가 빈 문자열이 되고, 그대로 읽으면 예산 0원이 되어
  // 추천이 통째로 사라진다(벌크업 프리셋 9,000원에서 실제로 그랬다). 값이 없으면 직전 값을 지킨다.
  const budget = Number(get('input-budget'));
  if (budget > 0) state.userProfile.budget_krw = budget;
}

/* ───────────────────────── 공통 헬퍼 ───────────────────────── */

const CH_LABEL = { cvs: '편의점', mart: '마트', online: '식단몰', fr: '외식' };

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function staleState(p) {
  const s = (state.meta && state.meta.rules_snapshot && state.meta.rules_snapshot.staleness)
    || { stale_days: 90, rank_exclude_days: 180 };
  const d = daysSince(p.verified_at);
  if (d === null) return 'unknown';
  if (d >= s.rank_exclude_days) return 'excluded';
  if (d >= s.stale_days) return 'stale';
  return 'fresh';
}

/** 단백질 100g당 가격(원) — '미리 쟁여두기' 모드의 정렬 기준 */
function pricePer100gProtein(p) {
  const protein = Number(p.protein_g || 0);
  if (!protein || !p.price_krw) return Infinity;
  return Math.round(Number(p.price_krw) / protein * 100);
}

function categoryIcon(p) {
  const map = {
    '유제품/음료': '🥛', '샐러드': '🥗', '닭가슴살/육가공': '🍗', '과자/바': '🍫',
    '디저트': '🍦', '면': '🍜', '삼각김밥/주먹밥': '🍙', '샌드위치/버거': '🥪',
    '즉석밥/죽': '🍚', '한식/분식': '🍲', '도시락': '🍱'
  };
  if (map[p.category]) return map[p.category];
  return p.channel === 'mart' ? '🛒' : '🍱';
}

function fmtValue(value, status, unit = '') {
  if (status === 'unknown' || value === null || value === undefined) return '—';
  return `${value}${unit}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function announce(node, text) {
  if (node) node.textContent = text;
}

/* ───────────────────────── 렌더 ───────────────────────── */

function renderAll() {
  syncProfileForm();
  renderFreshness();
  renderHomeSections();
  syncModeUi();
  renderRankingList();
  renderCalcTab();
  updateCompareDock();
}

function renderFreshness() {
  if (!el.dataFreshness) return;
  const m = state.meta;
  if (!m) { el.dataFreshness.textContent = ''; return; }
  const hold = m.hold_count ? ` · 정보 부족 ${m.hold_count}` : '';
  el.dataFreshness.textContent = `${m.total_count}건${hold} · 최근 확인 ${m.latest_verified_at || '-'}`;
}

// ── 홈 ──
function renderHomeSections() {
  // 「이번 주 새로 확인한 메뉴」 — 출시일 데이터가 없으므로 실제로 갱신되는 verified_at 을 쓴다.
  const latest = (state.meta && state.meta.latest_verified_at) || '';
  const latestAll = state.index.filter(p => p.verified_at === latest);
  renderProductList(el.newItemsContainer, latestAll.slice().sort((a, b) => (b.ppr || 0) - (a.ppr || 0)).slice(0, 3),
    'ppr', '아직 새로 확인된 메뉴가 없습니다.');
  if (el.newItemsCount) {
    // 확인일이 한 종류뿐이면 '새로 확인한'이라는 말이 성립하지 않는다 — 있는 그대로 적는다.
    const distinctDates = new Set(state.index.map(p2 => p2.verified_at)).size;
    el.newItemsCount.textContent = !latest ? ''
      : (distinctDates <= 1
        ? `${latest} 일괄 확인 · 갱신 이력이 쌓이면 이 자리에 변경분만 표시됩니다`
        : `${latest} 확인 · ${latestAll.length}건`);
  }

  let rec = state.index.filter(p => p.grade_eligible !== false && staleState(p) !== 'excluded');
  if (state.homeFilter === 'best_ppr') rec = rec.slice().sort((a, b) => b.ppr - a.ppr);
  else if (state.homeFilter === 'best_cpd') rec = rec.slice().sort((a, b) => b.cpd - a.cpd);
  else if (state.homeFilter === 'best_npi') rec = rec.slice().sort((a, b) => b.npi - a.npi);
  else rec = rec.filter(p => p.grade === 'A' || p.grade === 'B');
  renderProductList(el.homeRecommendContainer, rec.slice(0, 5), state.homeFilter.replace('best_', '') || 'ppr');

  const washing = state.index.filter(p => p.pw_tier === 'washing').slice(0, 2);
  renderProductList(el.washingAlertContainer, washing, 'ppr', '이번 주 워싱 의심 판정은 없습니다.');
}

function renderSearchResults(q) {
  const results = searchProducts(state.searchIndex, q, 30);
  if (results.length === 0) {
    el.homeRecommendContainer.innerHTML = `
      <div class="empty-state">
        <p><strong>"${escapeHtml(q)}"</strong> 검색 결과가 없습니다.</p>
        <p class="empty-sub">아직 등록되지 않은 상품일 수 있습니다. 영양표 사진을 제보해 주시면 확인 후 등록합니다.</p>
        <button class="btn" type="button" id="btn-empty-report">영양표 사진 제보하기</button>
      </div>`;
    const b = document.getElementById('btn-empty-report');
    if (b) b.addEventListener('click', () => openReportSheet(null, q));
  } else {
    renderProductList(el.homeRecommendContainer, results, 'ppr');
  }
  announce(el.rankingCount, `검색 결과 ${results.length}건`);
}

// ── 랭킹 ──
function syncModeUi() {
  const isStock = state.rankingMode === 'stock';
  const per100 = document.querySelector('[data-sort="per100g"]');
  const ppr = document.querySelector('[data-sort="ppr"]');
  if (per100) per100.hidden = !isStock;
  if (ppr) ppr.hidden = isStock;
  document.querySelectorAll('[data-filter]').forEach(b => {
    const only = b.dataset.modeOnly;
    if (only) b.hidden = only !== state.rankingMode;
  });
  document.querySelectorAll('[data-sort]').forEach(b => {
    const on = b.dataset.sort === state.rankingSort;
    b.classList.toggle('active', on);
    if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on));
  });
  const noteEl = document.getElementById('ranking-mode-note');
  if (noteEl) noteEl.textContent = RANKING_MODES[state.rankingMode].note;
  updateSortTip();
}

const SORT_TIPS = {
  ppr: '<strong>가성비(PPR) 순:</strong> 1,000원당 단백질(g)이 많은 순서입니다.',
  per100g: '<strong>단백질 100g당 가격 순:</strong> 대용량 제품을 같은 기준으로 비교합니다. 낮을수록 쌉니다.',
  cpd: '<strong>다이어트 밀도(CPD) 순:</strong> 100kcal당 단백질(g)이 높은 순서입니다.',
  npi: '<strong>실질 단백질(NPI) 순:</strong> 원물 품질과 유해요소 감점을 반영한 보정 단백질(g) 순서입니다.'
};

function updateSortTip() {
  const tip = document.getElementById('ranking-sort-tip-text');
  if (tip) tip.innerHTML = SORT_TIPS[state.rankingSort] || SORT_TIPS.ppr;
}

function renderRankingList() {
  const mode = RANKING_MODES[state.rankingMode];
  let list = state.index.filter(p => mode.channels.includes(p.channel));

  if (state.rankingSegment === 'recent') {
    const latest = (state.meta && state.meta.latest_verified_at) || '';
    list = list.filter(p => p.verified_at === latest);
  }

  // 등급 보류는 기본 노출에서 빼되, 전용 필터로 들어올 수 있게 한다(제보 유입 동선).
  if (state.rankingFilter === 'hold') {
    list = list.filter(p => p.grade_eligible === false);
  } else {
    list = list.filter(p => p.grade_eligible !== false);
    if (state.rankingFilter === 'clean') list = list.filter(p => p.clean_tier === 'clean');
    else if (state.rankingFilter === 'verified') list = list.filter(p => p.pw_tier === 'verified');
    else if (state.rankingFilter === 'under5k') list = list.filter(p => p.price_krw <= 5000);
    else if (state.rankingFilter === 'alt_sweetener') list = list.filter(p => p.sweetener_group === 'alternative');
    else if (state.rankingFilter === 'fast_absorb') list = list.filter(p => p.absorption === 'fast');
    else if (['cvs', 'fr', 'mart', 'online'].includes(state.rankingFilter)) {
      list = list.filter(p => p.channel === state.rankingFilter);
    }
  }

  // 180일 넘게 재확인되지 않은 건은 랭킹에서 뺀다(검색으로는 여전히 찾을 수 있다).
  list = list.filter(p => staleState(p) !== 'excluded');

  const sortKey = state.rankingSort;
  list.sort((a, b) => {
    if (sortKey === 'cpd') return b.cpd - a.cpd;
    if (sortKey === 'npi') return b.npi - a.npi;
    if (sortKey === 'per100g') return pricePer100gProtein(a) - pricePer100gProtein(b);
    return b.ppr - a.ppr;
  });

  state.rankingList = list;
  state.rankingRendered = 0;
  el.rankingListContainer.innerHTML = '';
  renderRankingChunk();
  announce(el.rankingCount, `${mode.label} ${list.length}건`);
}

/** 한 번에 50건씩 — 수백 건을 한꺼번에 그리면 중급 기기에서 화면이 멈춘다. */
function renderRankingChunk() {
  const slice = state.rankingList.slice(state.rankingRendered, state.rankingRendered + PAGE_SIZE);
  if (state.rankingRendered === 0 && slice.length === 0) {
    el.rankingListContainer.innerHTML = '<div class="empty-state"><p>조건에 맞는 메뉴가 없습니다.</p></div>';
  }
  const frag = document.createDocumentFragment();
  for (const p of slice) frag.appendChild(createProductCardElement(p, state.rankingSort));
  el.rankingListContainer.appendChild(frag);
  state.rankingRendered += slice.length;

  if (el.rankingMore) {
    const remain = state.rankingList.length - state.rankingRendered;
    el.rankingMore.hidden = remain <= 0;
    el.rankingMore.textContent = remain > 0 ? `${remain}건 더 보기` : '';
  }
}

// ── 내 기준 ──
function renderCalcTab() {
  const timing = state.timing;
  const daily = computeDailyTargets({ ...state.userProfile, timing });
  const meal = applyTimingTarget(
    computeMealTarget(daily, state.userProfile.meal),
    timing,
    state.userProfile.weight_kg
  );

  const mealNameMap = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' };
  const setText = (id, v) => { const node = document.getElementById(id); if (node) node.textContent = v; };
  const mealName = mealNameMap[meal.meal] || '1끼';
  setText('target-title-text', timing ? `${TIMING_LABELS[timing]} · ${mealName} 타깃` : `오늘 ${mealName} 1끼 타깃`);
  setText('target-tdee-badge', `TDEE ${daily.tdee.toLocaleString()} kcal`);

  if (timing === 'post') {
    const t = TIMING_PROFILES.post;
    setText('target-numbers-text', `단백질 ${t.protein_min}~${t.protein_max}g · 탄수 ${meal.C}g · ${meal.kcal} kcal`);
  } else if (timing === 'pre') {
    setText('target-numbers-text', `탄수 ${meal.C}g · 단백질 ${meal.P}g · ${meal.kcal} kcal`);
  } else if (timing === 'rest') {
    // 끼당 표시는 실제 채점에 쓰는 타깃(clamp 20~45g 적용분)이어야 한다 — P_day/3 을 적으면 화면과 추천이 갈린다.
    setText('target-numbers-text', `오늘 단백질 ${daily.P_day}g · 이 끼니 타깃 ${meal.P}g · ${meal.kcal} kcal`);
  } else {
    setText('target-numbers-text', `${meal.kcal} kcal · 단백질 ${meal.P}g · 나트륨 ${meal.Na}mg 이하`);
  }
  renderTimingBasis(timing);
  // 산식은 실제 계산 순서를 그대로 적는다(예전에는 PAL·목적계수가 빠져 있었다).
  const goalLabel = { diet: '감량', lean_mass: '린매스업', bulk_up: '벌크업' }[daily.goal] || daily.goal;
  const palUsed = (daily.tdee / daily.bmr).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  setText('target-formula-text',
    `BMR ${daily.bmr.toLocaleString()} × 활동 ${palUsed} = TDEE ${daily.tdee.toLocaleString()} → ${goalLabel} 보정 1일 ${daily.kcal_day.toLocaleString()}kcal × 끼니 ${meal.ratio} = ${meal.kcal}kcal (Mifflin-St Jeor)`);

  if (!state.products.length) {
    el.calcResultContainer.innerHTML = '<div class="empty-state"><p>추천 계산에 필요한 데이터를 불러오는 중입니다…</p></div>';
    ensureFullData().then(() => { if (state.activeTab === 'calc') renderCalcTab(); });
    return;
  }

  const comboRules = state.meta && state.meta.rules_snapshot && state.meta.rules_snapshot.recommendation
    ? state.meta.rules_snapshot.recommendation.combo : undefined;

  if (state.calcMode === 'single') {
    const singles = state.products
      .filter(p => p.price_krw <= state.userProfile.budget_krw)
      // 워싱 의심·등급 보류는 개인 맞춤 추천에서 제외한다(기획서 §2.4 하드 필터).
      .filter(p => p.pw_tier !== 'washing')
      .filter(p => p.grade_eligible !== false)
      .filter(p => staleState(p) !== 'excluded')
      // 탄수를 채점에 쓰는 타이밍(운동 전·후)에서는 탄수가 실측인 건만 고른다 — 모르는 값을 0으로 채점하지 않는다.
      .filter(p => !TIMING_CARB_GUARD.includes(timing) || p.carb_g_status === 'measured')
      // 운동 후 가중치에서 나트륨 비중이 낮아(0.05) 점수만으로는 막히지 않는다.
      // 조합에 이미 있는 방식대로 1끼 목표의 130%를 넘는 단품은 운동 후 추천에서 뺀다.
      .filter(p => timing !== 'post' || !meal.Na ||
        Number(p.sodium_mg || 0) <= meal.Na * TIMING_PROFILES.post.sodium_cap_ratio)
      .map(p => ({
        product: p,
        fitScore: computeFitScore(p, meal, state.userProfile.goal, timing),
        reason: generateReasonSentence(p, meal, 0, state.userProfile.goal, timing)
      }))
      // 운동 후에는 Fit 동점을 흡수 속도로 가른다(점수에는 넣지 않는다).
      .sort((a, b) => b.fitScore - a.fitScore ||
        (timing === 'post' ? absorptionRank(a.product) - absorptionRank(b.product) : 0) ||
        b.product.npi - a.product.npi)
      .slice(0, 5);
    renderSingleRecommendations(singles);
  } else {
    const combos = findBestCombos(state.products, meal, {
      budget: state.userProfile.budget_krw,
      goal: state.userProfile.goal,
      topCount: 5,
      timing,
      rules: comboRules
    });
    renderComboRecommendations(combos, meal);
  }
}

const ABSORPTION_TAGS = {
  fast: '<span class="tag tag-fast">⚡ 빠른 흡수</span>',
  slow: '<span class="tag tag-slow">느린 흡수</span>',
  unknown: '<span class="tag tag-muted">흡수 속도 미확보</span>'
};

/** 타이밍 수치의 출처를 화면에 적는다 — 근거 없는 숫자를 내놓지 않는다(서비스 규칙 3). */
function renderTimingBasis(timing) {
  const node = document.getElementById('target-basis-text');
  if (!node) return;
  if (!timing) { node.hidden = true; node.innerHTML = ''; return; }

  const issnProtein = '<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noopener noreferrer">ISSN 2017 단백질·운동</a>';
  const issnTiming = '<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/" target="_blank" rel="noopener noreferrer">ISSN 2017 영양 타이밍</a>';
  const kg = state.userProfile.weight_kg;
  const text = {
    pre: `기준: 1끼 단백질 0.25g/kg(${issnProtein}) · 탄수 ${TIMING_PROFILES.pre.carb_per_kg}g/kg — 1~4g/kg/day(${issnTiming})의 하단을 3끼로 나눈 환산값입니다. 체중 ${kg}kg 기준. 소화 부담은 개인차가 큽니다.`,
    post: `기준: 1회 ${TIMING_PROFILES.post.protein_min}~${TIMING_PROFILES.post.protein_max}g(${issnProtein}) · 탄수 ${TIMING_PROFILES.post.carb_per_kg}g/kg, 직후~2시간(${issnTiming}). 체중 ${kg}kg 기준.`,
    rest: `기준: 1일 1.4~2.0g/kg, 3~4시간 간격 분배(${issnProtein}). 운동을 쉰 날에도 하루 총량은 내리지 않습니다.`
  }[timing];

  if (!text) { node.hidden = true; node.innerHTML = ''; return; }
  node.innerHTML = text;
  node.hidden = false;
}

function renderSingleRecommendations(items) {
  el.calcResultContainer.innerHTML = '';
  if (items.length === 0) {
    el.calcResultContainer.innerHTML = '<div class="empty-state"><p>조건에 맞는 단품 추천이 없습니다. 예산을 늘려 보세요.</p></div>';
    return;
  }
  items.forEach(({ product, fitScore, reason }) => {
    const card = createProductCardElement(product, 'ppr');
    const reasonBox = document.createElement('span');
    reasonBox.className = 'combo-reason';
    reasonBox.innerHTML = `<strong>Fit ${fitScore}점:</strong> ${escapeHtml(reason)}`;
    card.appendChild(reasonBox);
    el.calcResultContainer.appendChild(card);
  });
}

function renderComboRecommendations(combos, meal) {
  el.calcResultContainer.innerHTML = '';
  if (combos.length === 0) {
    el.calcResultContainer.innerHTML = `<div class="empty-state">
      <p>조건을 만족하는 1끼 조합을 찾지 못했습니다.</p>
      <p class="empty-sub">예산을 올리거나 끼니를 바꿔 보세요. 나트륨이 1끼 목표의 150%를 넘는 조합은 추천에서 제외됩니다.</p>
    </div>`;
    return;
  }

  // 목표 열량이 커서 지금 데이터로는 채우기 어려운 경우가 있다 — 낮은 점수를 그냥 내놓지 않고 이유를 말한다.
  const best = combos[0];
  if (best && (best.score < 40 || combos.length < 3)) {
    const note = document.createElement('p');
    note.className = 'combo-caveat';
    const fill = Math.round((best.aggregate.kcal / meal.kcal) * 100);
    note.textContent = `지금 등록된 메뉴로는 이 목표(${meal.kcal}kcal)를 채우는 조합이 많지 않습니다. 가장 가까운 조합도 목표의 ${fill}% 수준입니다. 예산을 올리거나 끼니 비중을 조정해 보세요.`;
    el.calcResultContainer.appendChild(note);
  }

  combos.forEach((c, idx) => {
    const card = document.createElement('article');
    card.className = 'combo-card';
    const naPct = meal.Na ? Math.round((c.aggregate.sodium_mg / meal.Na) * 100) : 0;

    card.innerHTML = `
      <div class="combo-header">
        <span class="combo-rank">추천 조합 #${idx + 1}</span>
        <span class="combo-score-badge">Fit ${c.score}점</span>
      </div>
      <h3 class="combo-title">${escapeHtml(c.aggregate.name)}</h3>
      <div class="combo-meta">
        ${c.aggregate.price_krw.toLocaleString()}원 · ${c.aggregate.kcal}kcal · 단백질 ${c.aggregate.protein_g}g · 나트륨 ${c.aggregate.sodium_mg}mg (1끼 목표의 ${naPct}%)
      </div>
      <div class="combo-reason">${escapeHtml(c.reason)}</div>
      <div class="combo-items"></div>
    `;

    const itemsWrap = card.querySelector('.combo-items');
    c.items.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'combo-item-btn';
      b.textContent = `${m.name} · ${Number(m.price_krw).toLocaleString()}원`;
      b.addEventListener('click', () => openDetailModal(m));
      itemsWrap.appendChild(b);
    });

    el.calcResultContainer.appendChild(card);
  });
}

/* ───────────────────────── 카드 ───────────────────────── */

function renderProductList(container, items, highlightMetric = 'ppr', emptyText = '해당하는 메뉴가 없습니다.') {
  if (!container) return;
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(emptyText)}</p></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach(p => frag.appendChild(createProductCardElement(p, highlightMetric)));
  container.appendChild(frag);
}

function createProductCardElement(p, highlightMetric = 'ppr') {
  // 카드는 버튼이다 — div + click 은 키보드·스크린리더에서 존재하지 않는 것과 같다.
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';

  const hold = p.grade_eligible === false;
  const stale = staleState(p);

  let tagsHtml = '';
  if (hold) {
    tagsHtml += '<span class="tag tag-hold">정보 부족 · 등급 보류</span>';
  } else if (p.pw_tier === 'washing') {
    tagsHtml += `<span class="tag tag-washing">워싱 의심 ${p.pw}점</span>`;
  } else if (p.pw_tier === 'conditional') {
    tagsHtml += '<span class="tag tag-conditional">조건부</span>';
  } else if (p.pw_tier === 'verified') {
    tagsHtml += '<span class="tag tag-verified">검증 고단백</span>';
  }

  if (p.clean_tier === 'clean') tagsHtml += '<span class="tag tag-clean">안심 원료</span>';
  else if (p.clean_tier === 'warning') tagsHtml += '<span class="tag tag-additive">첨가물 주의</span>';
  else if (p.clean_tier === 'unknown') tagsHtml += '<span class="tag tag-muted">원재료 미확보</span>';

  // 흡수 속도는 운동 후 추천과 전용 필터에서만 보여 준다 — 다른 화면에서는 판단에 쓰이지 않는 정보다.
  if ((state.timing === 'post' && state.activeTab === 'calc') ||
      (state.rankingFilter === 'fast_absorb' && state.activeTab === 'ranking')) {
    if (ABSORPTION_TAGS[p.absorption]) tagsHtml += ABSORPTION_TAGS[p.absorption];
  }

  if (stale === 'stale') tagsHtml += '<span class="tag tag-muted">확인한 지 오래됨</span>';
  if (p.price_krw_status === 'estimated') tagsHtml += '<span class="tag tag-estimate">가격 추정</span>';

  const priceText = p.price_krw_status === 'unknown'
    ? '가격 미확인'
    : `${Number(p.price_krw).toLocaleString()}원${p.price_krw_status === 'estimated' ? '(추정)' : ''}`;

  const metricHtml = highlightMetric === 'per100g'
    ? `<span class="metric-item strong">100g당 ${pricePer100gProtein(p).toLocaleString()}원</span>
       <span class="metric-item">CPD ${p.cpd}</span>
       <span class="metric-item">NPI ${p.npi}</span>`
    : `<span class="metric-item ${highlightMetric === 'ppr' ? 'strong' : ''}">PPR ${p.ppr}</span>
       <span class="metric-item ${highlightMetric === 'cpd' ? 'strong' : ''}">CPD ${p.cpd}</span>
       <span class="metric-item ${highlightMetric === 'npi' ? 'strong' : ''}">NPI ${p.npi}</span>`;

  const stampClass = hold ? 'grade-hold' : `grade-${p.grade}`;
  const stampText = hold ? '?' : p.grade;
  const stampLabel = hold ? '등급 보류' : `종합 ${p.grade}등급`;

  const photoHtml = p.image_url
    ? `<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"
         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <span class="fallback-emoji" aria-hidden="true" style="display:none;">${categoryIcon(p)}</span>`
    : `<span class="fallback-emoji" aria-hidden="true">${categoryIcon(p)}</span>`;

  card.innerHTML = `
    <span class="card-row">
      <span class="card-photo">${photoHtml}</span>
      <span class="card-info">
        <span class="card-title">${escapeHtml(p.name)}</span>
        <span class="card-meta">${escapeHtml(p.brand)} · ${CH_LABEL[p.channel] || '기타'} · ${p.serving_g ? p.serving_g + 'g' : '—'} · ${priceText}</span>
        <span class="card-metrics">${metricHtml}</span>
        <span class="card-tags">${tagsHtml}</span>
      </span>
      <span class="grade-stamp ${stampClass}" aria-hidden="true">${stampText}</span>
    </span>
    <span class="sr-only">${stampLabel}</span>
  `;

  card.addEventListener('click', () => openDetailModal(p));
  return card;
}

/* ───────────────────────── 상세 시트 ───────────────────────── */

async function openDetailModal(pLight) {
  if (!el.sheetDetail.open) el.sheetDetail.showModal();
  el.sheetDetailContent.innerHTML = '<div class="empty-state"><p>불러오는 중…</p></div>';

  await ensureFullData();
  const p = findFull(pLight.menu_id) || pLight;
  state.activeProduct = p;

  const hold = p.grade_eligible === false;
  const isComparing = state.compareList.includes(p.menu_id);
  const chLabel = CH_LABEL[p.channel] || '기타';

  const heroImageHtml = p.image_url
    ? `<div class="detail-hero-photo"><img src="${escapeHtml(p.image_url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none';"></div>`
    : '';

  el.sheetDetailContent.innerHTML = `
    ${heroImageHtml}
    <div class="detail-head">
      <div>
        <div class="detail-brand">${escapeHtml(p.brand)} · ${chLabel} · ${escapeHtml(p.category)}</div>
        <h2 class="detail-name">${escapeHtml(p.name)}</h2>
        <div class="detail-price">${p.price_krw_status === 'unknown' ? '가격 미확인' : Number(p.price_krw).toLocaleString() + '원'}
          ${p.price_krw_status === 'estimated' ? '<span class="tag tag-estimate">추정가</span>' : ''}</div>
      </div>
      <div class="grade-stamp ${hold ? 'grade-hold' : 'grade-' + p.grade} detail-stamp" aria-hidden="true">${hold ? '?' : p.grade}</div>
    </div>

    ${hold ? renderHoldNotice(p) : ''}
    ${renderMetricCards(p, hold)}
    ${hold ? '' : renderWhyBlock(p)}
    ${renderWashingBlock(p)}
    ${renderCleanBlock(p)}
    ${renderAbsorptionBlock(p)}
    ${renderNutritionTable(p)}
    ${renderGuideBox()}

    <div class="btn-group">
      <button class="btn ${isComparing ? 'btn-brand' : ''}" type="button" id="btn-toggle-compare">
        ${isComparing ? '비교함에 담김' : '비교 담기 (최대 3개)'}
      </button>
      <button class="btn" type="button" id="btn-open-report">이 숫자 틀렸어요</button>
    </div>

    <div class="detail-source">
      출처 ${escapeHtml(p.source_type)}
      ${p.source_url ? `· <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener noreferrer">원본 보기</a>` : '· 패키지 촬영본'}
      · 확인일 ${escapeHtml(p.verified_at)} · 룰 ${escapeHtml(p.rule_version)}
    </div>
  `;

  bindDetailEvents(p);
}

function renderHoldNotice(p) {
  const reason = p.grade_hold_reason || {};
  const labels = {
    kcal: '열량', protein_g: '단백질', price_krw: '가격',
    sodium_mg: '나트륨', sat_fat_g: '포화지방', sugar_g: '당류'
  };
  const missing = (reason.missing_required || []).map(f => labels[f] || f);
  const unknown = (reason.unknown_penalty_inputs || []).map(f => labels[f] || f);
  const parts = [];
  if (missing.length) parts.push(`${missing.join('·')} 값이 실측이 아님`);
  if (unknown.length) parts.push(`${unknown.join('·')} 정보 없음`);

  return `
    <div class="hold-notice">
      <div class="hold-title">등급을 매기지 않았습니다</div>
      <p>${escapeHtml(parts.join(' · ') || '판정에 필요한 값이 부족합니다')}. 감점이 없는 것과 정보가 없는 것은 다르므로, 확인되지 않은 값으로 등급을 만들지 않습니다.</p>
      <button class="btn" type="button" id="btn-hold-report">영양표 사진 제보하기</button>
    </div>`;
}

function renderMetricCards(p, hold) {
  const cell = (badge, cls, val, unit, grade) => `
    <div class="metric-card">
      <span class="metric-badge-chip ${cls}">${badge}</span>
      <div class="metric-val">${val}</div>
      <div class="metric-label">${unit}</div>
      ${grade ? `<span class="metric-grade-pill metric-grade-${grade}">${grade}등급</span>`
              : '<span class="metric-grade-pill metric-grade-hold">보류</span>'}
    </div>`;
  return `<div class="metric-grid">
    ${cell('PPR 가성비', 'badge-ppr', p.ppr, 'g / 1,000원', p.ppr_grade)}
    ${cell('CPD 다이어트', 'badge-cpd', p.cpd, 'g / 100kcal', p.cpd_grade)}
    ${cell('NPI 실질단백', 'badge-npi', p.npi, '보정 g', hold ? null : p.npi_grade)}
  </div>`;
}

/** 「이 등급이 나온 이유」 — 교육 문단 대신 이 제품의 대입 과정을 보여준다. */
function renderWhyBlock(p) {
  const snapshot = (state.meta && state.meta.rules_snapshot) || {};
  const cut = (snapshot.cutoffs && snapshot.cutoffs.total_grade) || { A: 3.3, B: 2.3, C: 1.3 };
  const qMap = { Q1: 1.0, Q2: 0.9, Q3: 0.8, Q4: 0.7, Q5: 0.6 };
  const q = qMap[p.protein_source] !== undefined ? qMap[p.protein_source] : 0.6;
  const qLabel = qMap[p.protein_source] !== undefined ? p.protein_source : '원물 미확인';

  const penalties = p.penalties || [];
  const sumDeduction = Math.min(0.5, penalties.reduce((s, x) => s + (x.deduction || 0), 0));
  const bonus = p.fiber_bonus ? p.fiber_bonus.bonus : 0;
  const penaltyText = penalties.length
    ? penalties.map(x => `${x.label} −${x.deduction}${x.estimated ? '(추정)' : ''}`).join(' · ')
    : '감점 없음';
  const demoted = p.pw_tier === 'washing';

  return `
    <section class="why-block">
      <h3 class="why-title">이 등급이 나온 이유</h3>
      <div class="why-line">
        PPR ${p.ppr} <b>${p.ppr_grade}</b> · CPD ${p.cpd} <b>${p.cpd_grade}</b> · NPI ${p.npi} <b>${p.npi_grade}</b>
        → 평균 <b>${p.grade_avg}</b> (A컷 ${cut.A}) → 종합 <b>${p.grade}</b>${demoted ? ' <span class="why-demote">(워싱 판정으로 1단계 강등)</span>' : ''}
      </div>
      <div class="why-formula">
        NPI = 단백질 ${p.protein_g}g × 원물 ${q}(${escapeHtml(qLabel)}) × (1 − 감점 ${sumDeduction.toFixed(2)})${bonus ? ` + 식이섬유 ${bonus}` : ''} = <b>${p.npi}</b>
      </div>
      <div class="why-penalties">감점 요인: ${escapeHtml(penaltyText)}</div>
      ${(p.penalty_unresolved && p.penalty_unresolved.length)
        ? `<div class="why-unresolved">확인되지 않아 판정하지 못한 항목: ${escapeHtml(p.penalty_unresolved.join(', '))}</div>` : ''}
    </section>`;
}

function renderWashingBlock(p) {
  if (!p.pw_tier) {
    return `<section class="washing-block washing-none">
      <div class="washing-head">워싱 판독 <span class="tag tag-muted">대상 아님</span></div>
      <p>단백질을 내세운 표기가 없어 판독 대상이 아닙니다. 단백질이 적다는 뜻이 아니라, 광고 표기와 실제 함량의 차이를 따지는 지표가 적용되지 않는다는 뜻입니다.</p>
    </section>`;
  }
  const tierClass = p.pw_tier === 'washing' ? 'washing-bad' : (p.pw_tier === 'conditional' ? 'washing-warn' : 'washing-good');
  const rows = (p.pw_breakdown || [])
    .filter(b => b.code !== 'W1' && b.score > 0)
    .map(b => `<li><b>${b.code}</b> ${escapeHtml(b.reason)} <span class="washing-score">+${b.score}</span></li>`)
    .join('');
  return `
    <section class="washing-block ${tierClass}">
      <div class="washing-head">워싱 판독 <b>${escapeHtml(p.pw_label)}</b> · ${p.pw}점</div>
      ${rows ? `<ul class="washing-list">${rows}</ul>` : '<p>법적 고단백 기준을 충족하고 감점 조항에 걸리지 않았습니다.</p>'}
    </section>`;
}

const DICT_BY_NAME = new Map(INGREDIENT_DICTIONARY.map(d => [d.name, d]));

/** 「이 타이밍에 맞는 이유」 — 흡수 속도 판정과 그 근거를 원재료 이름으로 밝힌다. */
function renderAbsorptionBlock(p) {
  const labels = { fast: '빠른 흡수', medium: '보통', slow: '느린 흡수', unknown: '판정하지 않음' };
  const label = labels[p.absorption] || labels.unknown;
  const basis = (p.absorption_basis || []).map(escapeHtml).join(' · ');

  const body = (!p.absorption || p.absorption === 'unknown')
    ? '원재료를 확보하지 못했거나 분류할 수 있는 단백질 원천이 없어 흡수 속도를 판정하지 않았습니다. 제품명으로 추정하지 않습니다.'
    : `판정 근거 원재료: ${basis}`;

  return `
    <section class="clean-radar-card">
      <div class="clean-radar-head">
        <span class="clean-radar-title">운동 타이밍 메모</span>
        <span class="tag ${p.absorption === 'fast' ? 'tag-fast' : (p.absorption === 'slow' ? 'tag-slow' : 'tag-muted')}">${label}</span>
      </div>
      <p>${body}</p>
      <p class="absorb-note">흡수 속도는 등급·점수에 넣지 않습니다. 운동 후 추천에서 점수가 같을 때 순서를 정하는 데만 씁니다.</p>
    </section>`;
}

function renderCleanBlock(p) {
  if (!p.clean_report) {
    return `
      <section class="clean-radar-card clean-unknown">
        <div class="clean-radar-head"><span class="clean-radar-title">원재료·첨가물 안심 분석</span></div>
        <p>이 제품의 <strong>원재료명을 아직 확보하지 못했습니다.</strong> 성분을 추정해 보여주지 않습니다.</p>
        <button class="btn" type="button" id="btn-clean-report">원재료 사진 제보하기</button>
      </section>`;
  }

  const r = p.clean_report;
  const s = r.stats;
  const scoreClass = p.clean_score >= 80 ? 'clean-score-high' : (p.clean_score >= 50 ? 'clean-score-medium' : 'clean-score-low');
  const td = r.teardowns || {};

  const teardownHtml = [
    ['sweetener', '당류 & 감미료'],
    ['protein', '단백질 원물 품질'],
    ['fat', '지방 & 유지 원료'],
    ['additive', '요주의 식품첨가물']
  ].filter(([k]) => td[k]).map(([k, label]) => `
    <div class="clean-teardown-item">
      <div class="clean-teardown-header">
        <span class="clean-teardown-cat">${escapeHtml(label)}</span>
        <span class="clean-teardown-badge badge-status-${td[k].status}">${escapeHtml(td[k].badge)}</span>
      </div>
      <div class="clean-teardown-title">${escapeHtml(td[k].title)}</div>
      <div class="clean-teardown-desc">${escapeHtml(td[k].desc)}</div>
    </div>`).join('');

  const tagsHtml = (r.tokens || []).map((t, idx) => `
    <button type="button" class="clean-ingredient-tag tag-tier-${t.tier}" data-tag-idx="${idx}">${escapeHtml(t.name)}</button>`).join('');

  const seg = (cls, pctVal, label, count) =>
    `<div class="clean-seg ${cls}" style="width:${pctVal}%"><span class="sr-only">${label} ${count}개</span></div>`;

  return `
    <section class="clean-radar-card">
      <div class="clean-radar-head">
        <span class="clean-radar-title">원재료·첨가물 안심 분석</span>
        <span class="clean-radar-score-badge ${scoreClass}">안심 ${p.clean_score}점 · ${escapeHtml(r.tierLabel)}</span>
      </div>
      <div class="clean-bar-wrapper">
        <div class="clean-bar">
          ${seg('seg-good', s.goodPct, '안심', s.goodCount)}
          ${seg('seg-neutral', s.neutralPct, '일반', s.neutralCount)}
          ${seg('seg-caution', s.cautionPct, '주의', s.cautionCount)}
          ${seg('seg-bad', s.badPct, '기피', s.badCount)}
        </div>
        <div class="clean-legend">
          <span class="clean-legend-item"><span class="clean-dot dot-good"></span>안심 ${s.goodCount}</span>
          <span class="clean-legend-item"><span class="clean-dot dot-neutral"></span>일반 ${s.neutralCount}</span>
          <span class="clean-legend-item"><span class="clean-dot dot-caution"></span>주의 ${s.cautionCount}</span>
          <span class="clean-legend-item"><span class="clean-dot dot-bad"></span>기피 ${s.badCount}</span>
        </div>
      </div>
      <div class="clean-teardown-list">${teardownHtml}</div>
      <details class="clean-tags-section">
        <summary class="clean-tags-toggle-btn">전성분 원재료 ${(r.tokens || []).length}종</summary>
        <div class="clean-tags-cloud">${tagsHtml}</div>
        <div class="clean-tag-info-popup" id="clean-tag-info-popup" hidden>
          <strong id="clean-tag-info-title"></strong><br>
          <span id="clean-tag-info-desc"></span>
        </div>
      </details>
    </section>`;
}

function renderNutritionTable(p) {
  const snapshot = (state.meta && state.meta.rules_snapshot) || {};
  const std = snapshot.daily_standards || { protein_g: 55, sodium_mg: 2000, sugar_g: 100, sat_fat_g: 15 };
  const pctOf = (v, base, status) => (status === 'unknown' || v == null) ? '' : ` (${Math.round((v / base) * 100)}%)`;
  const row = (label, value, status, unit, pct = '') =>
    `<div class="nutrition-row"><span>${label}</span><span>${fmtValue(value, status, ' ' + unit)}${pct}</span></div>`;

  const servingText = p.serving_g_status === 'estimated'
    ? `${p.serving_g}g(추정)` : (p.serving_g ? `${p.serving_g}g` : '—');

  return `
    <div class="nutrition-table">
      <div class="nutrition-header">영양정보 (1회 제공량 ${servingText})</div>
      <div class="nutrition-row thick"><span>열량</span><span>${fmtValue(p.kcal, p.kcal_status, ' kcal')}</span></div>
      <div class="nutrition-row thick"><span>단백질</span><span>${fmtValue(p.protein_g, p.protein_g_status, ' g')}${pctOf(p.protein_g, std.protein_g, p.protein_g_status)}</span></div>
      ${row('탄수화물', p.carb_g, p.carb_g_status, 'g')}
      ${row('- 당류', p.sugar_g, p.sugar_g_status, 'g', pctOf(p.sugar_g, std.sugar_g, p.sugar_g_status))}
      ${row('지방', p.fat_g, p.fat_g_status, 'g')}
      ${row('- 포화지방', p.sat_fat_g, p.sat_fat_g_status, 'g', pctOf(p.sat_fat_g, std.sat_fat_g, p.sat_fat_g_status))}
      ${row('- 트랜스지방', p.trans_fat_g, p.trans_fat_g_status, 'g')}
      ${row('나트륨', p.sodium_mg, p.sodium_mg_status, 'mg', pctOf(p.sodium_mg, std.sodium_mg, p.sodium_mg_status))}
      ${row('식이섬유', p.fiber_g, p.fiber_g_status, 'g')}
      <div class="nutrition-note">「—」는 해당 값을 아직 확보하지 못했다는 뜻입니다. 0이 아닙니다.</div>
    </div>`;
}

/** 지표 설명은 접어 둔다 — 매번 3문단이 이 제품의 근거를 아래로 밀어냈다. */
function renderGuideBox() {
  return `
    <details class="metric-guide-box">
      <summary class="metric-guide-title">지표 3종은 무엇인가요? (PPR · CPD · NPI)</summary>
      <div class="metric-guide-items">
        <p><b>PPR</b> 단백질(g) ÷ (가격 ÷ 1,000). 1,000원당 단백질량으로, 8.0 이상이면 A등급입니다.</p>
        <p><b>CPD</b> 단백질(g) ÷ (열량 ÷ 100). 100kcal당 단백질량으로, 12.0 이상이면 A등급입니다. 5.5는 식약처 '고단백' 표시의 열량 기준입니다.</p>
        <p><b>NPI</b> 단백질 × 원물 품질 가중치 × (1 − 유해요소 감점) + 식이섬유 보너스. 25 이상이면 A등급입니다.</p>
      </div>
    </details>`;
}

function bindDetailEvents(p) {
  const toggleCompare = document.getElementById('btn-toggle-compare');
  if (toggleCompare) toggleCompare.addEventListener('click', () => {
    toggleCompareItem(p.menu_id);
    openDetailModal(p);
  });

  const openReport = document.getElementById('btn-open-report');
  if (openReport) openReport.addEventListener('click', () => openReportSheet(p));

  ['btn-hold-report', 'btn-clean-report'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => openReportSheet(p));
  });

  const popup = document.getElementById('clean-tag-info-popup');
  const popupTitle = document.getElementById('clean-tag-info-title');
  const popupDesc = document.getElementById('clean-tag-info-desc');
  const tokens = (p.clean_report && p.clean_report.tokens) || [];

  document.querySelectorAll('.clean-ingredient-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = tokens[Number(tag.dataset.tagIdx)];
      if (!t || !popup) return;
      const dict = DICT_BY_NAME.get(t.name);
      const tierLabel = { 1: '안심', 2: '일반', 3: '주의', 4: '기피' }[t.tier] || '일반';
      popupTitle.textContent = `${tierLabel}: ${t.name}${dict ? ` (${dict.title})` : ''}`;
      // 판정에는 근거를 함께 보여준다. 근거가 없으면 없다고 말한다 — 이 서비스의 기본 규칙이다.
      const basis = dict && dict.basis
        ? `근거: ${dict.basis}`
        : '공적 기준으로 뒷받침되는 판정이 아닙니다(참고용 설명).';
      popupDesc.textContent = `${dict ? dict.desc : '사전에 등록되지 않은 일반 원재료입니다.'}
${basis}`;
      popup.hidden = false;
    });
  });
}

/* ───────────────────────── 비교함 ───────────────────────── */

function toggleCompareItem(menuId) {
  const idx = state.compareList.indexOf(menuId);
  if (idx >= 0) state.compareList.splice(idx, 1);
  else {
    if (state.compareList.length >= 3) {
      alert('비교함에는 최대 3개까지 담을 수 있습니다.');
      return;
    }
    state.compareList.push(menuId);
  }
  updateCompareDock();
}

function updateCompareDock() {
  const count = state.compareList.length;
  el.compareDockCount.textContent = `(${count}/3)`;
  el.compareDock.classList.toggle('visible', count > 0);
}

async function openCompareModal() {
  await ensureFullData();
  const items = state.compareList.map(findFull).filter(Boolean);
  if (items.length === 0) return;

  const row = (label, cells) => `<tr><td>${label}</td>${cells}</tr>`;
  el.sheetCompareContent.innerHTML = `
    <h3 class="compare-title">메뉴 영양·가성비 비교</h3>
    <p class="compare-sub">좌우로 스크롤해 최대 3개를 비교하세요.</p>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead><tr><th scope="col">구분</th>
          ${items.map(m => `<th scope="col"><div class="compare-brand">${escapeHtml(m.brand)}</div><div class="compare-name">${escapeHtml(m.name)}</div></th>`).join('')}
        </tr></thead>
        <tbody>
          ${row('종합 등급', items.map(m => `<td>${m.grade_eligible === false ? '<span class="tag tag-hold">보류</span>' : `<span class="grade-stamp grade-${m.grade} compare-stamp">${m.grade}</span>`}</td>`).join(''))}
          ${row('가격', items.map(m => `<td><strong>${Number(m.price_krw).toLocaleString()}원</strong>${m.price_krw_status === 'estimated' ? ' (추정)' : ''}</td>`).join(''))}
          ${row('PPR (가성비)', items.map(m => `<td class="compare-strong">${m.ppr}</td>`).join(''))}
          ${row('CPD (밀도)', items.map(m => `<td>${m.cpd}</td>`).join(''))}
          ${row('NPI (실질g)', items.map(m => `<td>${m.npi}</td>`).join(''))}
          ${row('단백질', items.map(m => `<td><strong>${fmtValue(m.protein_g, m.protein_g_status, 'g')}</strong></td>`).join(''))}
          ${row('열량', items.map(m => `<td>${fmtValue(m.kcal, m.kcal_status, 'kcal')}</td>`).join(''))}
          ${row('나트륨', items.map(m => `<td>${fmtValue(m.sodium_mg, m.sodium_mg_status, 'mg')}</td>`).join(''))}
          ${row('확인일', items.map(m => `<td>${escapeHtml(m.verified_at)}</td>`).join(''))}
          ${row('출처', items.map(m => `<td>${m.source_url ? `<a href="${escapeHtml(m.source_url)}" target="_blank" rel="noopener noreferrer">원본</a>` : escapeHtml(m.source_type)}</td>`).join(''))}
        </tbody>
      </table>
    </div>
    <div class="compare-actions"><button class="btn" type="button" id="btn-clear-compare">비교함 비우기</button></div>
  `;

  document.getElementById('btn-clear-compare').addEventListener('click', () => {
    state.compareList = [];
    updateCompareDock();
    el.sheetCompare.close();
  });

  el.sheetCompare.showModal();
}

/* ───────────────────────── 스캔 ───────────────────────── */

function openScannerModal() {
  el.sheetScanner.showModal();
  if (!scannerInstance) {
    scannerInstance = new BarcodeScanner({
      videoElement: el.scannerVideo,
      onDetected: handleBarcodeScanned,
      onStatus: (msg) => announce(el.scannerStatus, msg),
      onError: (err) => {
        console.warn('카메라 스캔 오류:', err);
        announce(el.scannerStatus, '카메라를 쓸 수 없습니다. 제품명으로 검색하거나 사진을 제보해 주세요.');
      }
    });
  }
  scannerInstance.startCamera(el.scannerVideo);
}

function closeScannerModal() {
  if (scannerInstance) scannerInstance.stopCamera();
  el.sheetScanner.close();
}

async function handleBarcodeScanned(barcode) {
  closeScannerModal();
  await ensureFullData();
  const matched = lookupBarcode(barcode, state.products);
  if (matched) {
    openDetailModal(matched);
    return;
  }
  // 미등록 — 막다른 길이 아니라 제보 입구로 보낸다.
  openReportSheet(null, '', barcode);
}

/* ───────────────────────── 제보·신고 ───────────────────────── */

function openReportSheet(p, queryText = '', barcode = '') {
  if (el.sheetDetail.open) el.sheetDetail.close();
  const label = p
    ? `대상 상품: ${p.name} (${p.brand})`
    : (barcode ? `미등록 바코드 ${barcode}` : (queryText ? `검색어 "${queryText}"` : '미등록 상품 제보'));
  el.reportTargetName.textContent = label;
  el.sheetReport.dataset.menuId = p ? p.menu_id : '';
  el.sheetReport.dataset.barcode = barcode || '';
  if (el.reportFormStatus) {
    el.reportFormStatus.textContent = API_BASE ? '' : '접수 창구를 준비 중입니다. 지금은 제출해도 저장되지 않습니다.';
  }
  if (el.btnSubmitReport) el.btnSubmitReport.disabled = !API_BASE;
  el.sheetReport.showModal();
}

async function submitReport() {
  if (!API_BASE) {
    announce(el.reportFormStatus, '접수 창구를 준비 중입니다. 연결되면 이 화면에서 바로 접수됩니다.');
    return;
  }
  const reasonEl = document.getElementById('report-reason');
  const detailEl = document.getElementById('report-detail');
  const payload = {
    menu_id: el.sheetReport.dataset.menuId || null,
    barcode: el.sheetReport.dataset.barcode || null,
    reason: reasonEl ? reasonEl.value : 'other',
    detail: detailEl ? detailEl.value : ''
  };

  el.btnSubmitReport.disabled = true;
  announce(el.reportFormStatus, '보내는 중…');
  try {
    const res = await fetch(`${API_BASE}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`상태 ${res.status}`);
    announce(el.reportFormStatus, '접수됐습니다. 공식 영양표를 재확인해 반영하겠습니다.');
    setTimeout(() => el.sheetReport.close(), 1200);
  } catch (err) {
    console.warn('제보 전송 실패:', err);
    announce(el.reportFormStatus, '지금은 접수되지 않았습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    el.btnSubmitReport.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
