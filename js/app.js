// 프로틴레이더 메인 애플리케이션 (app.js)
// 규칙 버전: v1.0 (2026-09-15 확정 스펙)

import { createSearchItem, searchProducts } from './search.js';
import { PRESETS, computeDailyTargets, computeMealTarget, computeFitScore, generateReasonSentence } from './calc.js';
import { findBestCombos } from './combo.js';
import { BarcodeScanner, lookupBarcode } from './scan.js';

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

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rankingSort = btn.dataset.sort;
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

  // 9. 모달 닫기 버튼들
  el.btnCloseDetail.addEventListener('click', () => el.sheetDetail.close());
  el.btnCloseCompare.addEventListener('click', () => el.sheetCompare.close());
  el.btnClosePolicy.addEventListener('click', () => el.sheetPolicy.close());
  el.btnCloseReport.addEventListener('click', () => el.sheetReport.close());
  el.btnOpenPolicy.addEventListener('click', (e) => {
    e.preventDefault();
    el.sheetPolicy.showModal();
  });
  el.btnOpenCompare.addEventListener('click', () => openCompareModal());

  // 10. 신고 제출
  el.btnSubmitReport.addEventListener('click', () => {
    alert('신고 및 정정 요청이 정상적으로 접수되었습니다. 72시간 이내에 공식 영양표를 재확인하겠습니다.');
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
  if (state.rankingFilter === 'cvs') {
    list = list.filter(p => p.channel === 'cvs');
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

    card.innerHTML = `
      <div class="combo-header">
        <span style="font-size:var(--t2); color:var(--ink-3); font-weight:var(--w-bold);">추천 조합 #${idx + 1}</span>
        <span class="combo-score-badge">Fit ${c.score}점</span>
      </div>
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

  if (p.penalties && p.penalties.length > 0) {
    tagsHtml += `<span class="tag tag-penalty">${p.penalties[0].label}</span>`;
  }

  card.innerHTML = `
    <div class="card-row">
      <div class="card-photo">
        <span>${p.category === '유제품/음료' ? '🥛' : (p.category === '샐러드' ? '🥗' : '🍱')}</span>
      </div>
      <div class="card-info">
        <div class="card-title">${p.name}</div>
        <div class="card-meta">${p.brand} · ${p.serving_g}g · ${p.price_krw.toLocaleString()}원</div>
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

  el.sheetDetailContent.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
      <div>
        <div style="font-size:var(--t2); color:var(--ink-3);">${p.brand} · ${p.category}</div>
        <h2 style="margin:2px 0 6px 0; font-size:var(--t6); color:var(--ink);">${p.name}</h2>
        <div style="font-size:var(--t4); font-weight:bold; color:var(--brand);">${p.price_krw.toLocaleString()}원</div>
      </div>
      <div class="grade-stamp grade-${p.grade}" style="width:48px; height:48px; font-size:22px;">${p.grade}</div>
    </div>

    <!-- 지표 3종 카드 -->
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-val">${p.ppr}</div>
        <div class="metric-label">PPR (g/천원)</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${p.cpd}</div>
        <div class="metric-label">CPD (g/100kcal)</div>
      </div>
      <div class="metric-card">
        <div class="metric-val">${p.npi}</div>
        <div class="metric-label">NPI (보정 g)</div>
      </div>
    </div>

    ${washingSection}

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
    <h3 style="margin-top:0;">메뉴 영양·가성비 한눈에 비교</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:var(--t3); text-align:center;">
        <thead>
          <tr style="border-bottom:2px solid var(--ink);">
            <th style="padding:6px; text-align:left;">구분</th>
            ${items.map(m => `<th style="padding:6px; max-width:90px; font-weight:bold;">${m.name}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left; font-weight:bold;">종합 등급</td>
            ${items.map(m => `<td style="padding:6px;"><span class="grade-stamp grade-${m.grade}" style="width:28px; height:28px; margin:0 auto; font-size:14px;">${m.grade}</span></td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left;">가격</td>
            ${items.map(m => `<td style="padding:6px;">${m.price_krw.toLocaleString()}원</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left; font-weight:bold; color:var(--brand);">PPR (가성비)</td>
            ${items.map(m => `<td style="padding:6px; font-weight:bold; color:var(--brand);">${m.ppr}</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left;">CPD (밀도)</td>
            ${items.map(m => `<td style="padding:6px;">${m.cpd}</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left;">NPI (실질g)</td>
            ${items.map(m => `<td style="padding:6px;">${m.npi}</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left;">단백질</td>
            ${items.map(m => `<td style="padding:6px; font-weight:bold;">${m.protein_g}g</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left;">열량</td>
            ${items.map(m => `<td style="padding:6px;">${m.kcal}kcal</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:6px; text-align:left;">나트륨</td>
            ${items.map(m => `<td style="padding:6px;">${m.sodium_mg}mg</td>`).join('')}
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
