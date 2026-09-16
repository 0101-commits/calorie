-- 프로틴레이더 D1 스키마 v2 (기획안 v2.0 §4.5)
-- 001 = schema.sql(초기 8테이블). 이 파일은 그 위에 얹는 변경분이다.
--
-- 적용:  wrangler d1 execute <DB> --file=migrations/002_schema_v2.sql
-- 주의:  현재 D1 은 미배포 상태다(D14 — 제보·정정이 실제로 돌 때 켠다).
--        먼저 wrangler.jsonc 의 database_id 를 실제 UUID 로 바꿔야 바인딩된다.

-- ─────────────────────────────────────────────────────────────
-- 1. menus — 필드 신뢰도(*_status) · 판정 보류 · 정규화 키
--    "모르는 값"과 "0"을 구분하지 못해 등급이 부풀려진 것이 v1 의 가장 큰 결함이었다.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE menus ADD COLUMN kcal_status TEXT DEFAULT 'measured';
ALTER TABLE menus ADD COLUMN protein_g_status TEXT DEFAULT 'measured';
ALTER TABLE menus ADD COLUMN carb_g_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN sugar_g_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN fat_g_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN sat_fat_g_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN trans_fat_g_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN sodium_mg_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN fiber_g_status TEXT DEFAULT 'unknown';
ALTER TABLE menus ADD COLUMN price_krw_status TEXT DEFAULT 'measured';
ALTER TABLE menus ADD COLUMN serving_g_status TEXT DEFAULT 'measured';
ALTER TABLE menus ADD COLUMN cooking_status TEXT DEFAULT 'measured';
ALTER TABLE menus ADD COLUMN estimate_basis TEXT;          -- JSON: 추정값의 근거
ALTER TABLE menus ADD COLUMN completeness REAL;            -- 필수 필드 실측 비율 0~1
ALTER TABLE menus ADD COLUMN grade_eligible INTEGER DEFAULT 1;
ALTER TABLE menus ADD COLUMN grade_hold_reason TEXT;       -- JSON: 어떤 값이 없어 보류했는지

-- 정규화 키 · 브랜드 사전 연결
ALTER TABLE menus ADD COLUMN brand_code TEXT;
ALTER TABLE menus ADD COLUMN legacy_ids TEXT;              -- JSON 배열: 구 menu_id (공유 링크 유지)
ALTER TABLE menus ADD COLUMN brand_raw TEXT;               -- 수집 당시 표기 원문

-- 검증 주체 — verified_at 이 스크립트 리터럴이던 문제를 막는다
ALTER TABLE menus ADD COLUMN verified_by TEXT;
ALTER TABLE menus ADD COLUMN source_tier TEXT;             -- source_type 에서 티어만 분리

-- data.json 에는 있는데 D1 컬럼이 없어 동기화 시 유실되던 것들
ALTER TABLE menus ADD COLUMN ingredients_raw TEXT;
ALTER TABLE menus ADD COLUMN clean_score INTEGER;
ALTER TABLE menus ADD COLUMN clean_tier TEXT;
ALTER TABLE menus ADD COLUMN clean_counts TEXT;            -- JSON
ALTER TABLE menus ADD COLUMN clean_report TEXT;            -- JSON
ALTER TABLE menus ADD COLUMN pw_tier TEXT;
ALTER TABLE menus ADD COLUMN pw_label TEXT;
ALTER TABLE menus ADD COLUMN pw_breakdown TEXT;            -- JSON
ALTER TABLE menus ADD COLUMN claim_strength TEXT;          -- strong | weak | none (W1)
ALTER TABLE menus ADD COLUMN grade_avg REAL;
ALTER TABLE menus ADD COLUMN ppr_grade TEXT;
ALTER TABLE menus ADD COLUMN cpd_grade TEXT;
ALTER TABLE menus ADD COLUMN npi_grade TEXT;
ALTER TABLE menus ADD COLUMN penalties TEXT;               -- JSON
ALTER TABLE menus ADD COLUMN penalty_unresolved TEXT;      -- JSON: 판정하지 못한 항목
ALTER TABLE menus ADD COLUMN fiber_bonus TEXT;             -- JSON

-- 알레르기 — 프랜차이즈 표시 의무 항목. 커버리지 90% 전에는 화면에 필터를 열지 않는다.
ALTER TABLE menus ADD COLUMN allergens TEXT;               -- JSON 배열(22종 코드)
ALTER TABLE menus ADD COLUMN allergens_status TEXT DEFAULT 'unknown';

-- 인덱스 교체 — launch_date 는 결측 100% 라 의미가 없었다
DROP INDEX IF EXISTS idx_menus_launch_date;
CREATE INDEX IF NOT EXISTS idx_menus_eligible_grade ON menus(grade_eligible, grade);
CREATE INDEX IF NOT EXISTS idx_menus_brand_code ON menus(brand_code);
CREATE INDEX IF NOT EXISTS idx_menus_verified_at ON menus(verified_at);

-- 바코드 중복(5종 10건)을 구조적으로 막는다. 적용 전 중복 정리 필요.
CREATE UNIQUE INDEX IF NOT EXISTS idx_menus_barcode_unique ON menus(barcode) WHERE barcode IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. brands — 표기 분열 해소 + T2 수집 레지스트리 겸용
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  brand_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT,                                   -- JSON 배열
  channels TEXT,                                  -- JSON 배열
  nutrition_url TEXT,
  url_verified INTEGER DEFAULT 0,
  disclosure_duty INTEGER,                        -- 어린이 식생활안전관리 특별법상 표시 의무 대상 여부
  collect_status TEXT DEFAULT 'pending_survey',   -- pending_survey | pending_notice | notified | blocked
  last_hash TEXT,
  last_checked_at TEXT
);

-- ─────────────────────────────────────────────────────────────
-- 3. reports — 정정 이력 공개(기획서 §7.2)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE reports ADD COLUMN public_visible INTEGER DEFAULT 0;
ALTER TABLE reports ADD COLUMN correction_before TEXT;
ALTER TABLE reports ADD COLUMN correction_after TEXT;
ALTER TABLE reports ADD COLUMN barcode TEXT;                -- 미등록 상품 제보용

-- ─────────────────────────────────────────────────────────────
-- 4. rules — 룰 파일을 테이블에도 싣는다(빌드는 파일 → 테이블 순으로 읽는다)
-- ─────────────────────────────────────────────────────────────
-- INSERT 는 배포 시 rules/rule_v1.1.json 내용으로 채운다.
