-- 프로틴레이더 (Protein Radar) D1 SQLite Schema
-- 버전: v1.1 (2026-09-15 확정 스펙)

-- 1. 메뉴 마스터 원장
CREATE TABLE IF NOT EXISTS menus (
  menu_id TEXT PRIMARY KEY,                       -- {channel}-{brand}-{slug}-{serving_g}
  channel TEXT NOT NULL,                          -- cvs(편의점) / fr(프랜차이즈)
  brand TEXT NOT NULL,                            -- CU, GS25, 7-ELEVEN, EMART24 / SUBWAY, MCDONALDS 등
  name TEXT NOT NULL,                             -- 제품/메뉴명
  category TEXT NOT NULL,                         -- 도시락, 삼각김밥/주먹밥, 샌드위치/버거, 샐러드, 닭가슴살/육가공 등 12종
  price_krw INTEGER NOT NULL,                     -- 가격 (원)
  serving_g INTEGER NOT NULL,                     -- 내용량 (g 또는 mL)
  servings_per_pack REAL DEFAULT 1.0,             -- 포장당 제공횟수
  kcal REAL NOT NULL,                             -- 열량 (kcal)
  protein_g REAL NOT NULL,                        -- 단백질 (g)
  carb_g REAL,                                    -- 탄수화물 (g)
  sugar_g REAL,                                   -- 당류 (g)
  fat_g REAL,                                     -- 지방 (g)
  sat_fat_g REAL,                                 -- 포화지방 (g)
  trans_fat_g REAL DEFAULT 0.0,                   -- 트랜스지방 (g)
  sodium_mg REAL NOT NULL,                        -- 나트륨 (mg)
  chol_mg REAL,                                   -- 콜레스테롤 (mg)
  fiber_g REAL DEFAULT 0.0,                       -- 식이섬유 (g)
  protein_source TEXT NOT NULL,                   -- 원물 품질 등급 Q1~Q5
  cooking TEXT NOT NULL,                          -- fried, grilled, boiled, raw, baked, mixed, unknown
  marketing_claim INTEGER NOT NULL DEFAULT 0,     -- 단백질 마케팅 강조 표기 여부 (1=있음, 0=없음)
  claim_text TEXT,                                -- 마케팅 강조 표기 문구
  barcode TEXT,                                   -- EAN-13 바코드
  image_url TEXT,                                 -- 제품 이미지 URL
  image_source TEXT,                              -- 이미지 출처 표기 (운영자 촬영, 보도자료 등)
  launch_date TEXT,                               -- 출시일 (YYYY-MM-DD)
  discontinued_at TEXT,                           -- 단종일 (YYYY-MM-DD)
  source_type TEXT NOT NULL,                      -- T1(공공), T2(의무/자발), T3(공식발표), T4(사용자/운영자)
  source_url TEXT,                                -- 공식 영양성분/보도자료 URL
  image_hash TEXT,                                -- 영양표/패키지 이미지 SHA-256 해시
  verified_at TEXT NOT NULL,                      -- 최종 검증일 (YYYY-MM-DD)
  rule_version TEXT NOT NULL,                     -- 적용 룰 버전 (예: v1.0)
  ppr REAL,                                       -- 가성비 지표 (g/천원)
  cpd REAL,                                       -- 다이어트 지표 (g/100kcal)
  npi REAL,                                       -- 클린 지표 (보정 단백질 g)
  pw INTEGER,                                     -- 프로틴 워싱 의심 점수 (0~100, null if marketing_claim=0)
  grade TEXT,                                     -- 종합 등급 (A, B, C, D)
  computed_at TEXT                                -- 지표 계산 일시
);

CREATE INDEX IF NOT EXISTS idx_menus_channel_brand ON menus(channel, brand);
CREATE INDEX IF NOT EXISTS idx_menus_category ON menus(category);
CREATE INDEX IF NOT EXISTS idx_menus_barcode ON menus(barcode);
CREATE INDEX IF NOT EXISTS idx_menus_grade ON menus(grade);
CREATE INDEX IF NOT EXISTS idx_menus_launch_date ON menus(launch_date);

-- 2. 미등록 스캔 및 검색 로그
CREATE TABLE IF NOT EXISTS scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT,
  identify_guess TEXT,
  matched INTEGER NOT NULL,                       -- 1=매칭 성공, 0=미등록
  channel_guess TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_barcode ON scan_logs(barcode);

-- 3. 가격 변동 이력
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id TEXT NOT NULL,
  price_krw INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY (menu_id) REFERENCES menus(menu_id)
);

-- 4. 신상 패스트트랙 후보 큐
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  price INTEGER,
  launch_date TEXT,
  detected_at TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT '감지'             -- 감지, 영양표확보, OCR, QA, 검수, 게시, 반려
);

-- 5. 크라우드 제출 이력 (2단계 개방)
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_hash TEXT NOT NULL,
  nickname TEXT,
  ip_hash TEXT,
  parsed_json TEXT,
  qa_result TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  status TEXT DEFAULT '대기'                      -- 대기, 승인, 반려
);

-- 6. 이의제기 및 정정 신고 이력
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id TEXT NOT NULL,
  reason TEXT NOT NULL,                           -- 수치 오류, 리뉴얼, 단종, 원물 분류 이의, 기타
  detail TEXT,
  status TEXT NOT NULL DEFAULT '접수',            -- 접수, 검토중, 정정완료, 반려
  resolved_at TEXT,
  correction TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (menu_id) REFERENCES menus(menu_id)
);

-- 7. 룰 버전 관리 테이블
CREATE TABLE IF NOT EXISTS rules (
  version TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  effective_from TEXT NOT NULL
);

-- 8. 소스 감지 레지스트리 (T2/T3)
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  tier TEXT NOT NULL,                             -- T1, T2, T3
  url TEXT NOT NULL,
  format TEXT,                                    -- html_table, dynamic_web, image_modal, pdf
  last_hash TEXT,
  last_checked_at TEXT
);
