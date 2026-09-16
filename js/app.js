// 프로틴레이더 메인 애플리케이션 (app.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

import { createSearchItem, searchProducts } from './search.js';
import { PRESETS, computeDailyTargets, computeMealTarget, computeFitScore, generateReasonSentence } from './calc.js';
import { findBestCombos } from './combo.js';
import { BarcodeScanner, lookupBarcode } from './scan.js';
import { analyzeIngredients } from './clean_radar.js';

// 전역 상태
const state = {
  products: [],
  searchIndex: [],
  activeTab: 'home',
  homeFilter: 'all',
  rankingSegment: 'all',
  rankingSort: 'ppr',
  rankingFilter: 'all',
  calcMode: 'single',
  compareList: [], // menu_id 배열 (최대 3개)
  activeProduct: null,
  userProfile: {
    gender: 'female',
    age: 28,
    height_cm: 162,
    weight_kg: 54,
    activity_level: 'moderate',
    goal: 'diet',
    meal: 'lunch',
    budget_krw: 8000
  }
};

let scannerInstance = null;

// DOM 요소 캐시
const el = {
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  homeSearchInput: document.getElementById('home-search-input'),
  homeScanBtn: document.getElementById('home-scan-btn'),
  newItemsContainer: document.getElementById('new-items-container'),
  homeRecommendContainer: document.getElementById('home-recommend-container'),
  washingAlertContainer: document.getElementById('washing-alert-container'),
  rankingListContainer: document.getElementById('ranking-list-container'),
  calcResultContainer: document.getElementById('calc-result-container'),
  compareDock: document.getElementById('compare-dock'),
  compareDockCount: document.getElementById('compare-dock-count'),
  btnOpenCompare: document.getElementById('btn-open-compare'),
  sheetDetail: document.getElementById('sheet-detail'),
  sheetDetailContent: document.getElementById('sheet-detail-content'),
  btnCloseDetail: document.getElementById('btn-close-detail'),
  sheetCompare: document.getElementById('sheet-compare'),
  sheetCompareContent: document.getElementById('sheet-compare-content'),
  btnCloseCompare: document.getElementById('btn-close-compare'),
  sheetScanner: document.getElementById('sheet-scanner'),
  btnCloseScanner: document.getElementById('btn-close-scanner'),
  scannerVideo: document.getElementById('scanner-video'),
  selectDemoBarcode: document.getElementById('select-demo-barcode'),
  btnTestBarcode: document.getElementById('btn-test-barcode'),
  sheetPolicy: document.getElementById('sheet-policy'),
  btnOpenPolicy: document.getElementById('btn-open-policy'),
  btnClosePolicy: document.getElementById('btn-close-policy'),
  sheetReport: document.getElementById('sheet-report'),
  reportTargetName: document.getElementById('report-target-name'),
  btnCloseReport: document.getElementById('btn-close-report'),
  btnSubmitReport: document.getElementById('btn-submit-report')
};

// 초기화
async function init() {
  loadStoredProfile();
  await loadData();
  setupEventListeners();
  renderAll();
}

// LocalStorage 체형 정보 복원
function loadStoredProfile() {
  try {
    const saved = localStorage.getItem('pr_user_profile');
    if (saved) {
      state.userProfile = { ...state.userProfile, ...JSON.parse(saved) };
    }
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

// data.json 로드
async function loadData() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error('data.json 로드 실패');
    state.products = await res.json();
    state.searchIndex = state.products.map(createSearchItem);
  } catch (err) {
    console.error('데이터 로드 중 오류:', err);
    state.products = [];
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 1. 하단 탭 전환
  el.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  document.getElementById('nav-brand').addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('home');
  });

  // 2. 홈 탭 검색
  let debounceTimer;
  el.homeSearchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = e.target.value.trim();
      if (q) {
        const results = searchProducts(state.searchIndex, q, 30);
        renderProductList(el.homeRecommendContainer, results, 'ppr');
      } else {
        renderHomeSections();
      }
    }, 150);
  });

  // 3. 홈 퀵 필터
  document.querySelectorAll('[data-home-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-home-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.homeFilter = btn.dataset.homeFilter;
      renderHomeSections();
    });
  });

  // 4. 스캔 버튼 & 모달
  el.homeScanBtn.addEventListener('click', () => {
    openScannerModal();
  });
  el.btnCloseScanner.addEventListener('click', () => {
    closeScannerModal();
  });
  el.btnTestBarcode.addEventListener('click', () => {
    const code = el.selectDemoBarcode.value;
    if (code) handleBarcodeScanned(code);
  });

  // 5. 랭킹 세그먼트 & 칩
  document.querySelectorAll('[data-segment]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-segment]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rankingSegment = btn.dataset.segment;
      renderRankingList();
    });
  });

  const sortTipMap = {
    ppr: '<strong>PPR (가성비) 순:</strong> 1,000원당 단백질(g)이 많은 순서로 정렬합니다. (단백질 ÷ 천원)',
    cpd: '<strong>CPD (다이어트) 순:</strong> 100kcal당 단백질(g)이 높은 다이어트 밀도 순으로 정렬합니다. (단백질 ÷ 100kcal)',
    npi: '<strong>NPI (클린 식단) 순:</strong> 원물 품질 가중치와 유해요소(나트륨·당류·포화지방 등) 감점을 제외한 순수 실효 단백질(g) 순으로 정렬합니다.'
  };

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rankingSort = btn.dataset.sort;
      const tipEl = document.getElementById('ranking-sort-tip-text');
      if (tipEl) {
        tipEl.innerHTML = sortTipMap[state.rankingSort] || sortTipMap.ppr;
      }
      renderRankingList();
    });
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rankingFilter = btn.dataset.filter;
      renderRankingList();
    });
  });

  // 6. 내 기준 탭 프리셋
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const presetKey = btn.dataset.preset;
      const preset = PRESETS[presetKey];
      if (preset) {
        state.userProfile = { ...state.userProfile, ...preset };
        syncProfileForm();
        renderCalcTab();
        saveStoredProfile();
      }
    });
  });

  // 7. 내 기준 입력 폼 체인지
  ['input-gender', 'input-age', 'input-height', 'input-weight', 'input-activity', 'input-goal', 'input-meal', 'input-budget'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.addEventListener('change', () => {
        readProfileForm();
        renderCalcTab();
        saveStoredProfile();
      });
    }
  });

  // 8. 내 기준 모드 세그먼트 (단품 vs 조합)
  document.querySelectorAll('[data-calc-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-calc-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.calcMode = btn.dataset.calcMode;
      renderCalcTab();
    });
  });

  // 9. 모달 닫기 버튼들 및 외부 클릭(백드롭) 닫기
  el.btnCloseDetail.addEventListener('click', () => el.sheetDetail.close());
  el.btnCloseCompare.addEventListener('click', () => el.sheetCompare.close());
  el.btnClosePolicy.addEventListener('click', () => el.sheetPolicy.close());
  el.btnCloseReport.addEventListener('click', () => el.sheetReport.close());

  [el.sheetDetail, el.sheetCompare, el.sheetScanner, el.sheetPolicy, el.sheetReport].forEach(dlg => {
    if (!dlg) return;
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const rect = dlg.getBoundingClientRect();
      const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height
        && rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
      if (!isInDialog) {
        if (dlg === el.sheetScanner && scannerInstance) scannerInstance.stopCamera();
        dlg.close();
      }
    });
  });

  el.btnOpenPolicy.addEventListener('click', (e) => {
    e.preventDefault();
    el.sheetPolicy.showModal();
  });
  el.btnOpenCompare.addEventListener('click', () => openCompareModal());

  // 10. 신고 제출
  el.btnSubmitReport.addEventListener('click', () => {
    alert('접수 창구가 아직 연결되지 않았습니다. 준비되는 대로 이 화면에서 바로 접수할 수 있게 됩니다.');
    el.sheetReport.close();
  });
}

// 탭 전환
function switchTab(tabId) {
  state.activeTab = tabId;
  el.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  el.tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// 프로필 폼 동기화
function syncProfileForm() {
  document.getElementById('input-gender').value = state.userProfile.gender;
  document.getElementById('input-age').value = state.userProfile.age;
  document.getElementById('input-height').value = state.userProfile.height_cm;
  document.getElementById('input-weight').value = state.userProfile.weight_kg;
  document.getElementById('input-activity').value = state.userProfile.activity_level;
  document.getElementById('input-goal').value = state.userProfile.goal;
  document.getElementById('input-meal').value = state.userProfile.meal;
  document.getElementById('input-budget').value = state.userProfile.budget_krw;
}

function readProfileForm() {
  state.userProfile.gender = document.getElementById('input-gender').value;
  state.userProfile.age = Number(document.getElementById('input-age').value);
  state.userProfile.height_cm = Number(document.getElementById('input-height').value);
  state.userProfile.weight_kg = Number(document.getElementById('input-weight').value);
  state.userProfile.activity_level = document.getElementById('input-activity').value;
  state.userProfile.goal = document.getElementById('input-goal').value;
  state.userProfile.meal = document.getElementById('input-meal').value;
  state.userProfile.budget_krw = Number(document.getElementById('input-budget').value);
}

// 전체 렌더링
function renderAll() {
  syncProfileForm();
  renderHomeSections();
  renderRankingList();
  renderCalcTab();
  updateCompareDock();
}

// ── 홈 탭 렌더링 ──
function renderHomeSections() {
  // 이번 주 신상 3건
  const newItems = [...state.products]
    .filter(p => p.launch_date && p.launch_date >= '2026-08-15' && p.grade === 'A')
    .sort((a, b) => b.launch_date.localeCompare(a.launch_date))
    .slice(0, 3);
  renderProductList(el.newItemsContainer, newItems, 'ppr');
  document.getElementById('new-items-count').textContent = `검증 고단백 ${newItems.length}개`;

  // 추천 하이라이트
  let recItems = [...state.products];
  if (state.homeFilter === 'best_ppr') {
    recItems.sort((a, b) => b.ppr - a.ppr);
  } else if (state.homeFilter === 'best_cpd') {
    recItems.sort((a, b) => b.cpd - a.cpd);
  } else if (state.homeFilter === 'best_npi') {
    recItems.sort((a, b) => b.npi - a.npi);
  } else if (state.homeFilter === 'washing') {
    recItems = recItems.filter(p => p.pw !== null && p.pw >= 50);
  } else {
    // all: A/B 등급 중심 5건
    recItems = recItems.filter(p => p.grade === 'A' || p.grade === 'B').slice(0, 5);
  }
  renderProductList(el.homeRecommendContainer, recItems.slice(0, 5), state.homeFilter.replace('best_', '') || 'ppr');

  // 워싱 주의 2건
  const washingItems = state.products.filter(p => p.pw !== null && p.pw >= 50).slice(0, 2);
  renderProductList(el.washingAlertContainer, washingItems, 'ppr');
}

// ── 랭킹 탭 렌더링 ──
function renderRankingList() {
  let list = [...state.products];

  // 세그먼트: 이번 주 신상 필터
  if (state.rankingSegment === 'new') {
    list = list.filter(p => p.launch_date && p.launch_date >= '2026-08-15');
  }

  // 필터 칩
  if (state.rankingFilter === 'clean') {
    list = list.filter(p => p.clean_tier === 'clean');
  } else if (state.rankingFilter === 'allulose') {
    list = list.filter(p => p.ingredients_raw && (p.ingredients_raw.includes('알룰로스') || p.ingredients_raw.includes('알룰로오스')));
  } else if (state.rankingFilter === 'cvs') {
    list = list.filter(p => p.channel === 'cvs');
  } else if (state.rankingFilter === 'mart') {
    list = list.filter(p => p.channel === 'mart');
  } else if (state.rankingFilter === 'online') {
    list = list.filter(p => p.channel === 'online');
  } else if (state.rankingFilter === 'fr') {
    list = list.filter(p => p.channel === 'fr');
  } else if (state.rankingFilter === 'under5k') {
    list = list.filter(p => p.price_krw <= 5000);
  } else if (state.rankingFilter === 'verified') {
    list = list.filter(p => p.pw_tier === 'verified');
  }

  // 정렬
  const sortKey = state.rankingSort;
  list.sort((a, b) => {
    if (sortKey === 'cpd') return b.cpd - a.cpd;
    if (sortKey === 'npi') return b.npi - a.npi;
    return b.ppr - a.ppr; // ppr 기본
  });

  renderProductList(el.rankingListContainer, list, sortKey);
}

// ── 내 기준 탭 렌더링 ──
function renderCalcTab() {
  const daily = computeDailyTargets(state.userProfile);
  const meal = computeMealTarget(daily, state.userProfile.meal);

  // 배너 업데이트
  const mealNameMap = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식/운동후' };
  document.getElementById('target-title-text').textContent = `오늘 ${mealNameMap[meal.meal]} 1끼 타깃`;
  document.getElementById('target-tdee-badge').textContent = `TDEE ${daily.tdee.toLocaleString()} kcal`;
  document.getElementById('target-numbers-text').textContent = 
    `${meal.kcal} kcal · 단백질 ${meal.P}g · 나트륨 ${meal.Na}mg 이하`;
  document.getElementById('target-formula-text').textContent = 
    `BMR ${daily.bmr.toLocaleString()} × ${meal.meal === 'lunch' ? '0.35' : meal.ratio} (Mifflin-St Jeor)`;

  if (state.calcMode === 'single') {
    // 단품 Top 5
    const singles = state.products
      .filter(p => p.price_krw <= state.userProfile.budget_krw)
      .map(p => ({
        product: p,
        fitScore: computeFitScore(p, meal, state.userProfile.goal),
        reason: generateReasonSentence(p, meal, 0, state.userProfile.goal)
      }))
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 5);

    renderSingleRecommendations(singles, meal);
  } else {
    // 조합 Top 5
    const combos = findBestCombos(state.products, meal, {
      budget: state.userProfile.budget_krw,
      goal: state.userProfile.goal,
      topCount: 5
    });

    renderComboRecommendations(combos);
  }
}

// 단품 추천 렌더링
function renderSingleRecommendations(items, target) {
  el.calcResultContainer.innerHTML = '';
  if (items.length === 0) {
    el.calcResultContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--ink-3);">조건에 맞는 단품 추천이 없습니다. 예산을 늘려보세요.</div>';
    return;
  }

  items.forEach(({ product, fitScore, reason }) => {
    const card = createProductCardElement(product, 'ppr');
    // Fit 점수 및 이유 문장 삽입
    const reasonBox = document.createElement('div');
    reasonBox.className = 'combo-reason';
    reasonBox.style.marginTop = '8px';
    reasonBox.innerHTML = `<strong>Fit ${fitScore}점:</strong> ${reason}`;
    card.appendChild(reasonBox);
    el.calcResultContainer.appendChild(card);
  });
}

// 조합 추천 렌더링
function renderComboRecommendations(combos) {
  el.calcResultContainer.innerHTML = '';
  if (combos.length === 0) {
    el.calcResultContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--ink-3);">조건을 만족하는 1끼 조합을 찾을 수 없습니다. 예산을 상향해보세요.</div>';
    return;
  }

  combos.forEach((c, idx) => {
    const card = document.createElement('div');
    card.className = 'combo-card';

    const itemNames = c.items.map(m => m.name).join(' + ');
    const thumbsHtml = c.items.map(m => {
      return m.image_url
        ? `<img src="${m.image_url}" alt="${m.name}" title="${m.name}" style="width:38px; height:38px; object-fit:cover; border-radius:6px; border:1px solid var(--line); background:var(--surface-2);" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';">`
        : '';
    }).filter(Boolean).join('');

    card.innerHTML = `
      <div class="combo-header">
        <span style="font-size:var(--t2); color:var(--ink-3); font-weight:var(--w-bold);">추천 조합 #${idx + 1}</span>
        <span class="combo-score-badge">Fit ${c.score}점</span>
      </div>
      ${thumbsHtml ? `<div style="display:flex; gap:6px; margin:6px 0 8px 0;">${thumbsHtml}</div>` : ''}
      <div class="combo-title">${itemNames}</div>
      <div class="combo-meta">
        ${c.aggregate.price_krw.toLocaleString()}원 · ${c.aggregate.kcal}kcal · 단백질 ${c.aggregate.protein_g}g · 나트륨 ${c.aggregate.sodium_mg}mg
      </div>
      <div class="combo-reason">${c.reason}</div>
    `;

    card.addEventListener('click', () => {
      // 첫 번째 제품의 상세 열기
      openDetailModal(c.items[0]);
    });

    el.calcResultContainer.appendChild(card);
  });
}

// ── 카드 렌더링 헬퍼 ──
function renderProductList(container, items, highlightMetric = 'ppr') {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--ink-3);">해당하는 메뉴가 없습니다.</div>';
    return;
  }

  items.forEach(p => {
    const card = createProductCardElement(p, highlightMetric);
    container.appendChild(card);
  });
}

function createProductCardElement(p, highlightMetric = 'ppr') {
  const card = document.createElement('div');
  card.className = 'card';

  // 브랜드/채널 로고 및 이니셜
  const initial = (p.brand || 'PR').slice(0, 2).toUpperCase();

  // 지표 텍스트 포맷
  const pprClass = highlightMetric === 'ppr' ? 'strong' : '';
  const cpdClass = highlightMetric === 'cpd' ? 'strong' : '';
  const npiClass = highlightMetric === 'npi' ? 'strong' : '';

  // 태그 목록
  let tagsHtml = '';
  if (p.pw_tier === 'washing') {
    tagsHtml += `<span class="tag tag-washing">🚨 워싱 의심 ${p.pw}점</span>`;
  } else if (p.pw_tier === 'conditional') {
    tagsHtml += `<span class="tag tag-conditional">조건부</span>`;
  } else if (p.pw_tier === 'verified') {
    tagsHtml += `<span class="tag tag-verified">검증 고단백</span>`;
  }

  // CleanRadar 안심원료 및 알룰로스 뱃지
  if (p.clean_tier === 'clean') {
    tagsHtml += `<span class="tag" style="background:#ecfdf5; color:#059669; border:1px solid rgba(16,185,129,0.3);">🟢 안심원료</span>`;
  } else if (p.clean_tier === 'warning') {
    tagsHtml += `<span class="tag" style="background:#fef2f2; color:#dc2626; border:1px solid rgba(239,68,68,0.3);">🔴 첨가물주의</span>`;
  }

  if (p.ingredients_raw && (p.ingredients_raw.includes('알룰로스') || p.ingredients_raw.includes('알룰로오스'))) {
    tagsHtml += `<span class="tag" style="background:#f0fdf4; color:#166534; border:1px solid rgba(22,101,52,0.25);">🍯 알룰로스</span>`;
  }

  if (p.penalties && p.penalties.length > 0) {
    tagsHtml += `<span class="tag tag-penalty">${p.penalties[0].label}</span>`;
  }

  // 카테고리/채널별 아이콘 매핑
  let icon = '🍱';
  if (p.category === '유제품/음료') icon = '🥛';
  else if (p.category === '샐러드') icon = '🥗';
  else if (p.category === '닭가슴살/육가공') icon = '🍗';
  else if (p.category === '과자/바') icon = '🍫';
  else if (p.category === '아이스크림') icon = '🍦';
  else if (p.category === '라면/면류') icon = '🍜';
  else if (p.category === '삼각김밥/주먹밥') icon = '🍙';
  else if (p.category === '샌드위치/버거') icon = '🥪';
  else if (p.channel === 'mart') icon = '🛒';

  const chLabelMap = { cvs: '편의점', mart: '마트', online: '식단몰', fr: '외식' };
  const chLabel = chLabelMap[p.channel] || '기타';

  const photoHtml = p.image_url
    ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <span class="fallback-emoji" style="display:none;">${icon}</span>`
    : `<span class="fallback-emoji">${icon}</span>`;

  card.innerHTML = `
    <div class="card-row">
      <div class="card-photo">
        ${photoHtml}
      </div>
      <div class="card-info">
        <div class="card-title">${p.name}</div>
        <div class="card-meta">${p.brand} · ${chLabel} · ${p.serving_g}g · ${p.price_krw.toLocaleString()}원</div>
        <div class="card-metrics">
          <span class="metric-item ${pprClass}">PPR ${p.ppr}</span>
          <span class="metric-item ${cpdClass}">CPD ${p.cpd}</span>
          <span class="metric-item ${npiClass}">NPI ${p.npi}</span>
        </div>
        <div class="card-tags">
          ${tagsHtml}
        </div>
      </div>
      <div class="grade-stamp grade-${p.grade}">${p.grade}</div>
    </div>
  `;

  card.addEventListener('click', () => openDetailModal(p));
  return card;
}

// ── 상세 바텀시트 열기 ──
function openDetailModal(p) {
  state.activeProduct = p;
  const isComparing = state.compareList.includes(p.menu_id);
  const chLabelMap = { cvs: '편의점', mart: '대형마트/식품', online: '식단/온라인몰', fr: '외식/카페' };
  const chLabel = chLabelMap[p.channel] || '기타';

  const heroImageHtml = p.image_url
    ? `<div class="detail-hero-photo">
         <img src="${p.image_url}" alt="${p.name}" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none';">
       </div>`
    : '';

  // 영양성분 1일 기준치 대비 %
  const pPct = Math.round((p.protein_g / 55) * 100);
  const naPct = Math.round((p.sodium_mg / 2000) * 100);
  const sugarPct = p.sugar_g ? Math.round((p.sugar_g / 100) * 100) : 0;
  const satFatPct = p.sat_fat_g ? Math.round((p.sat_fat_g / 15) * 100) : 0;

  let washingSection = '';
  if (p.marketing_claim) {
    const wTier = p.pw_tier === 'washing' ? 'var(--bad)' : (p.pw_tier === 'conditional' ? 'var(--warn)' : 'var(--good)');
    washingSection = `
      <div style="background:var(--surface-2); border-left:4px solid ${wTier}; padding:10px 12px; border-radius:var(--r2); margin:12px 0;">
        <div style="font-weight:bold; color:${wTier}; font-size:var(--t3);">워싱 판독 결과: ${p.pw_label || '검증 고단백'} (${p.pw}점)</div>
        <div style="font-size:var(--t1); color:var(--ink-2); margin-top:4px;">
          ${p.pw_breakdown && p.pw_breakdown.length > 0 ? p.pw_breakdown.map(b => `• ${b.reason}`).join('<br>') : '식약처 고단백 영양강조 기준을 정직하게 충족함'}
        </div>
      </div>
    `;
  }

  // ── CleanRadar 원재료·첨가물 안심 분석 ──
  const cleanReport = analyzeIngredients(p.ingredients_raw, p);
  const { stats, teardowns, tokens, cleanScore, tierLabel } = cleanReport;
  const scoreClass = cleanScore >= 80 ? 'clean-score-high' : (cleanScore >= 50 ? 'clean-score-medium' : 'clean-score-low');

  const tagsCloudHtml = tokens.map((t, idx) => `
    <span class="clean-ingredient-tag tag-tier-${t.tier}" data-tag-idx="${idx}">
      ${t.tier === 1 ? '🟢' : (t.tier === 3 ? '🟡' : (t.tier === 4 ? '🔴' : '⚪'))} ${t.name}
    </span>
  `).join('');

  const cleanRadarSection = `
    <!-- 🔬 화해형 CleanRadar 원재료·첨가물 안심 분석 카드 -->
    <div class="clean-radar-card">
      <div class="clean-radar-head">
        <div class="clean-radar-title">
          <span>🔬 원재료·첨가물 안심 분석</span>
        </div>
        <span class="clean-radar-score-badge ${scoreClass}">안심 ${cleanScore}점 · ${tierLabel}</span>
      </div>

      <!-- 화해형 4색 누적 세그먼트 바 -->
      <div class="clean-bar-wrapper">
        <div class="clean-bar">
          <div class="clean-seg seg-good" style="width: ${stats.goodPct}%;" title="안심 ${stats.goodCount}개 (${stats.goodPct}%)"></div>
          <div class="clean-seg seg-neutral" style="width: ${stats.neutralPct}%;" title="일반 ${stats.neutralCount}개 (${stats.neutralPct}%)"></div>
          <div class="clean-seg seg-caution" style="width: ${stats.cautionPct}%;" title="주의 ${stats.cautionCount}개 (${stats.cautionPct}%)"></div>
          <div class="clean-seg seg-bad" style="width: ${stats.badPct}%;" title="기피 ${stats.badCount}개 (${stats.badPct}%)"></div>
        </div>
        <div class="clean-legend">
          <span class="clean-legend-item"><span class="clean-dot" style="background:#10b981;"></span>안심 ${stats.goodCount}</span>
          <span class="clean-legend-item"><span class="clean-dot" style="background:#94a3b8;"></span>일반 ${stats.neutralCount}</span>
          <span class="clean-legend-item"><span class="clean-dot" style="background:#f59e0b;"></span>주의 ${stats.cautionCount}</span>
          <span class="clean-legend-item"><span class="clean-dot" style="background:#ef4444;"></span>기피 ${stats.badCount}</span>
        </div>
      </div>

      <!-- 4대 카테고리 심층 Teardown (당류/원물/지방/첨가물) -->
      <div class="clean-teardown-list">
        <!-- 1. 당류 및 감미료 -->
        <div class="clean-teardown-item">
          <div class="clean-teardown-header">
            <span class="clean-teardown-cat">${teardowns.sweetener.icon} 당류 & 감미료</span>
            <span class="clean-teardown-badge badge-status-${teardowns.sweetener.status}">${teardowns.sweetener.badge}</span>
          </div>
          <div class="clean-teardown-title">${teardowns.sweetener.title}</div>
          <div class="clean-teardown-desc">${teardowns.sweetener.desc}</div>
        </div>

        <!-- 2. 단백질 원천 -->
        <div class="clean-teardown-item">
          <div class="clean-teardown-header">
            <span class="clean-teardown-cat">${teardowns.protein.icon} 단백질 원물 품질</span>
            <span class="clean-teardown-badge badge-status-${teardowns.protein.status}">${teardowns.protein.badge}</span>
          </div>
          <div class="clean-teardown-title">${teardowns.protein.title}</div>
          <div class="clean-teardown-desc">${teardowns.protein.desc}</div>
        </div>

        <!-- 3. 지방 및 유지류 -->
        <div class="clean-teardown-item">
          <div class="clean-teardown-header">
            <span class="clean-teardown-cat">${teardowns.fat.icon} 지방 & 유지 원료</span>
            <span class="clean-teardown-badge badge-status-${teardowns.fat.status}">${teardowns.fat.badge}</span>
          </div>
          <div class="clean-teardown-title">${teardowns.fat.title}</div>
          <div class="clean-teardown-desc">${teardowns.fat.desc}</div>
        </div>

        <!-- 4. 식품첨가물 및 보존료 -->
        <div class="clean-teardown-item">
          <div class="clean-teardown-header">
            <span class="clean-teardown-cat">${teardowns.additive.icon} 요주의 식품첨가물</span>
            <span class="clean-teardown-badge badge-status-${teardowns.additive.status}">${teardowns.additive.badge}</span>
          </div>
          <div class="clean-teardown-title">${teardowns.additive.title}</div>
          <div class="clean-teardown-desc">${teardowns.additive.desc}</div>
        </div>
      </div>

      <!-- 전성분 인터랙티브 태그 클라우드 -->
      <div class="clean-tags-section">
        <button class="clean-tags-toggle-btn" id="btn-toggle-clean-tags">
          <span>📋 전성분 원재료 태그 (${tokens.length}종)</span>
          <span id="clean-tags-arrow">보기 ▾</span>
        </button>
        <div class="clean-tags-cloud" id="clean-tags-cloud" style="display:none;">
          ${tagsCloudHtml}
        </div>
        <div class="clean-tag-info-popup" id="clean-tag-info-popup">
          <strong id="clean-tag-info-title"></strong><br>
          <span id="clean-tag-info-desc"></span>
        </div>
      </div>
    </div>
  `;

  el.sheetDetailContent.innerHTML = `
    ${heroImageHtml}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
      <div>
        <div style="font-size:var(--t2); color:var(--ink-3);">${p.brand} · ${chLabel} · ${p.category}</div>
        <h2 style="margin:2px 0 6px 0; font-size:var(--t6); color:var(--ink);">${p.name}</h2>
        <div style="font-size:var(--t4); font-weight:bold; color:var(--brand);">${p.price_krw.toLocaleString()}원</div>
      </div>
      <div class="grade-stamp grade-${p.grade}" style="width:48px; height:48px; font-size:22px;">${p.grade}</div>
    </div>

    <!-- 지표 3종 카드 -->
    <div class="metric-grid">
      <div class="metric-card" title="단백질 가성비 지표">
        <span class="metric-badge-chip badge-ppr">PPR 가성비</span>
        <div class="metric-val">${p.ppr}</div>
        <div class="metric-label">g / 1,000원</div>
        <span class="metric-grade-pill metric-grade-${p.ppr_grade || 'B'}">${p.ppr_grade || 'B'}등급</span>
      </div>
      <div class="metric-card" title="다이어트 밀도 지표">
        <span class="metric-badge-chip badge-cpd">CPD 다이어트</span>
        <div class="metric-val">${p.cpd}</div>
        <div class="metric-label">g / 100kcal</div>
        <span class="metric-grade-pill metric-grade-${p.cpd_grade || 'B'}">${p.cpd_grade || 'B'}등급</span>
      </div>
      <div class="metric-card" title="클린 식단 지수">
        <span class="metric-badge-chip badge-npi">NPI 클린식단</span>
        <div class="metric-val">${p.npi}</div>
        <div class="metric-label">순수 보정 g</div>
        <span class="metric-grade-pill metric-grade-${p.npi_grade || 'B'}">${p.npi_grade || 'B'}등급</span>
      </div>
    </div>

    <!-- 핵심 지표 설명 가이드 박스 -->
    <div class="metric-guide-box">
      <div class="metric-guide-head">
        <span class="metric-guide-title">💡 핵심 지표 설명 (PPR · CPD · NPI)</span>
        <span style="font-size:10px; color:var(--ink-3); font-weight:600;">기획서 v1.1 기준</span>
      </div>
      <div class="metric-guide-items">
        <div class="metric-guide-item">
          <div class="metric-guide-item-top">
            <span style="font-weight:700; color:var(--ink);"><span class="metric-badge-chip badge-ppr" style="margin:0 4px 0 0;">PPR</span>단백질 가성비</span>
            <span class="metric-guide-formula">단백질(g) ÷ (가격 ÷ 1,000)</span>
          </div>
          <p>
            1,000원당 섭취 가능한 단백질량(g)입니다. <strong>8.0 이상(A등급)</strong>이면 가성비 1등 메뉴입니다.<br>
            👉 이 제품: <strong>${p.ppr}g/천원 (${p.ppr_grade || 'B'}등급)</strong>
          </p>
        </div>

        <div class="metric-guide-item">
          <div class="metric-guide-item-top">
            <span style="font-weight:700; color:var(--ink);"><span class="metric-badge-chip badge-cpd" style="margin:0 4px 0 0;">CPD</span>다이어트 밀도</span>
            <span class="metric-guide-formula">단백질(g) ÷ (열량 ÷ 100)</span>
          </div>
          <p>
            100kcal당 단백질 함량(g)입니다. 불필요한 칼로리 없이 순수 단백질만 채우는 효율로, <strong>12.0 이상(A등급)</strong>이면 다이어트에 최적화되어 있습니다.<br>
            👉 이 제품: <strong>${p.cpd}g/100kcal (${p.cpd_grade || 'B'}등급)</strong>
          </p>
        </div>

        <div class="metric-guide-item">
          <div class="metric-guide-item-top">
            <span style="font-weight:700; color:var(--ink);"><span class="metric-badge-chip badge-npi" style="margin:0 4px 0 0;">NPI</span>클린 식단 지수</span>
            <span class="metric-guide-formula">단백질 × 원물품질 - 페널티</span>
          </div>
          <p>
            단백질 원물 품질(닭가슴살 100%, 가공육 70%)과 유해요소(나트륨·당류·포화지방 과다, 튀김 등) 감점을 반영한 <strong>순수 실효 단백질(g)</strong>입니다. <strong>25 이상(A등급)</strong>이면 최고 수준의 클린 식단입니다.<br>
            👉 이 제품: <strong>${p.npi}g (${p.npi_grade || 'B'}등급)</strong>
          </p>
        </div>
      </div>
    </div>

    ${washingSection}

    ${cleanRadarSection}

    <!-- 영양성분 팩트 표 -->
    <div class="nutrition-table">
      <div class="nutrition-header">영양정보 (1회 제공량 ${p.serving_g}g)</div>
      <div class="nutrition-row thick"><span>열량</span><span>${p.kcal} kcal</span></div>
      <div class="nutrition-row thick"><span>단백질</span><span>${p.protein_g} g (${pPct}%)</span></div>
      <div class="nutrition-row"><span>탄수화물</span><span>${p.carb_g || '-'} g</span></div>
      <div class="nutrition-row"><span>- 당류</span><span>${p.sugar_g || '-'} g (${sugarPct}%)</span></div>
      <div class="nutrition-row"><span>지방</span><span>${p.fat_g || '-'} g</span></div>
      <div class="nutrition-row"><span>- 포화지방</span><span>${p.sat_fat_g || '-'} g (${satFatPct}%)</span></div>
      <div class="nutrition-row"><span>나트륨</span><span>${p.sodium_mg} mg (${naPct}%)</span></div>
      <div class="nutrition-row"><span>식이섬유</span><span>${p.fiber_g || 0} g</span></div>
    </div>

    <!-- 버튼 그룹 -->
    <div class="btn-group">
      <button class="btn ${isComparing ? 'btn-brand' : ''}" id="btn-toggle-compare">
        ${isComparing ? '✓ 비교함에 담김' : '비교 담기 (최대 3개)'}
      </button>
      <button class="btn" id="btn-open-report">이 숫자 틀렸어요</button>
    </div>

    <div style="font-size:var(--t1); color:var(--ink-3); margin-top:14px; text-align:center;">
      출처: ${p.source_type} (${p.source_url ? '공식 영양표' : '패키지 OCR'}) · 확인일: ${p.verified_at} · 룰: ${p.rule_version}
    </div>
  `;

  // 태그 아코디언 토글
  const toggleBtn = document.getElementById('btn-toggle-clean-tags');
  const cloud = document.getElementById('clean-tags-cloud');
  const arrow = document.getElementById('clean-tags-arrow');
  const popup = document.getElementById('clean-tag-info-popup');
  const popupTitle = document.getElementById('clean-tag-info-title');
  const popupDesc = document.getElementById('clean-tag-info-desc');

  if (toggleBtn && cloud) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = cloud.style.display === 'none';
      cloud.style.display = isHidden ? 'flex' : 'none';
      arrow.textContent = isHidden ? '접기 ▴' : '보기 ▾';
    });
  }

  // 개별 성분 태그 클릭 시 툴팁 팝오버
  document.querySelectorAll('.clean-ingredient-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(tag.dataset.tagIdx, 10);
      const item = tokens[idx];
      if (item && popup && popupTitle && popupDesc) {
        popupTitle.textContent = `${item.tier === 1 ? '🟢 안심' : (item.tier === 3 ? '🟡 주의' : (item.tier === 4 ? '🔴 기피' : '⚪ 일반'))}: ${item.name} (${item.title})`;
        popupDesc.textContent = item.desc;
        popup.style.display = 'block';
      }
    });
  });

  document.getElementById('btn-toggle-compare').addEventListener('click', () => {
    toggleCompareItem(p.menu_id);
    openDetailModal(p); // 리렌더링
  });

  document.getElementById('btn-open-report').addEventListener('click', () => {
    el.sheetDetail.close();
    el.reportTargetName.textContent = `대상 상품: ${p.name} (${p.brand})`;
    el.sheetReport.showModal();
  });

  el.sheetDetail.showModal();
}

// ── 비교함 관리 ──
function toggleCompareItem(menuId) {
  const idx = state.compareList.indexOf(menuId);
  if (idx >= 0) {
    state.compareList.splice(idx, 1);
  } else {
    if (state.compareList.length >= 3) {
      alert('비교함에는 최대 3개 상품까지 담을 수 있습니다.');
      return;
    }
    state.compareList.push(menuId);
  }
  updateCompareDock();
}

function updateCompareDock() {
  const count = state.compareList.length;
  el.compareDockCount.textContent = `(${count}/3)`;
  if (count > 0) {
    el.compareDock.classList.add('visible');
  } else {
    el.compareDock.classList.remove('visible');
  }
}

function openCompareModal() {
  const items = state.compareList.map(id => state.products.find(p => p.menu_id === id)).filter(Boolean);
  if (items.length === 0) return;

  el.sheetCompareContent.innerHTML = `
    <h3 style="margin-top:0; font-size:18px; color:var(--ink);">메뉴 영양·가성비 한눈에 비교</h3>
    <p style="font-size:12px; color:var(--ink-2); margin-bottom:12px;">좌우로 스크롤하여 최대 3개 상품의 지표를 비교하세요.</p>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th>구분</th>
            ${items.map(m => `
              <th>
                ${m.image_url ? `<img src="${m.image_url}" alt="${m.name}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; margin:0 auto 6px auto; display:block; border:1px solid var(--line);" referrerpolicy="no-referrer" onerror="this.style.display='none';">` : ''}
                <div style="font-size:11px; color:var(--ink-2);">${m.brand}</div>
                <div style="font-size:13px; font-weight:700; color:var(--ink); margin-top:2px;">${m.name}</div>
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>종합 등급</td>
            ${items.map(m => `<td><span class="grade-stamp grade-${m.grade}" style="width:28px; height:28px; margin:0 auto; font-size:14px;">${m.grade}</span></td>`).join('')}
          </tr>
          <tr>
            <td>가격</td>
            ${items.map(m => `<td><strong>${m.price_krw.toLocaleString()}원</strong></td>`).join('')}
          </tr>
          <tr>
            <td>PPR (가성비)</td>
            ${items.map(m => `<td style="font-weight:800; color:var(--brand);">${m.ppr}</td>`).join('')}
          </tr>
          <tr>
            <td>CPD (밀도)</td>
            ${items.map(m => `<td>${m.cpd}</td>`).join('')}
          </tr>
          <tr>
            <td>NPI (실질g)</td>
            ${items.map(m => `<td>${m.npi}</td>`).join('')}
          </tr>
          <tr>
            <td>단백질</td>
            ${items.map(m => `<td><strong>${m.protein_g}g</strong></td>`).join('')}
          </tr>
          <tr>
            <td>열량</td>
            ${items.map(m => `<td>${m.kcal}kcal</td>`).join('')}
          </tr>
          <tr>
            <td>나트륨</td>
            ${items.map(m => `<td>${m.sodium_mg}mg</td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;">
      <button class="btn" id="btn-clear-compare">비교함 비우기</button>
    </div>
  `;

  document.getElementById('btn-clear-compare').addEventListener('click', () => {
    state.compareList = [];
    updateCompareDock();
    el.sheetCompare.close();
  });

  el.sheetCompare.showModal();
}

// ── 바코드 스캔 처리 ──
function openScannerModal() {
  el.sheetScanner.showModal();
  if (!scannerInstance) {
    scannerInstance = new BarcodeScanner({
      videoElement: el.scannerVideo,
      onDetected: (barcode) => {
        handleBarcodeScanned(barcode);
      },
      onError: (err) => {
        console.warn('카메라 스캔 오류:', err);
      }
    });
  }
  scannerInstance.startCamera(el.scannerVideo);
}

function closeScannerModal() {
  if (scannerInstance) scannerInstance.stopCamera();
  el.sheetScanner.close();
}

function handleBarcodeScanned(barcode) {
  closeScannerModal();
  const matched = lookupBarcode(barcode, state.products);
  if (matched) {
    openDetailModal(matched);
  } else {
    alert(`[미등록 바코드 ${barcode}]\n등록되지 않은 상품입니다. 영양표 사진을 찍어 제보해주시면 48시간 내에 검증 성적표가 등록됩니다!`);
  }
}

// 앱 실행
document.addEventListener('DOMContentLoaded', init);
