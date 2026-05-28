-- ============================================================
-- 오뜨랑 (ottrank.kr) DB 마이그레이션 v2
-- 목적: 랭킹 시스템 전면 재구성
-- 적용: Cloudflare D1 (ottrank-db)
-- 날짜: 2026-05-29
-- ============================================================
-- 적용 방법:
-- wrangler d1 execute ottrank-db --file=migration_v2_ottrang_redesign.sql
-- ============================================================


-- ============================================================
-- STEP 1. 기존 rankings 테이블 컬럼 추가
-- (기존 데이터 보존, 컬럼만 추가)
-- ============================================================

-- category_slot 추가 (category01 ~ category09)
-- 기존 category(tv/movie) 컬럼은 일단 유지 (나중에 데이터 이전 후 삭제)
ALTER TABLE rankings ADD COLUMN category_slot TEXT;

-- 크롤링 원본 카테고리명 추가 (예: "TOP 10 TV Shows (in Korean)")
ALTER TABLE rankings ADD COLUMN source_name TEXT;


-- ============================================================
-- STEP 2. works 테이블 컬럼 추가
-- (기존 데이터 보존, 컬럼만 추가)
-- ============================================================

-- 매칭 출처: 'admin' / 'auto_claude' / 'auto_tmdb'
ALTER TABLE works ADD COLUMN match_source TEXT DEFAULT 'admin';

-- 매칭 신뢰도: 100(admin 수동) / 95(claude 번역) / 90(tmdb 자동)
ALTER TABLE works ADD COLUMN confidence_score INTEGER DEFAULT 100;

-- 기존 is_manual=1 데이터 → match_source='admin', confidence_score=100 으로 업데이트
UPDATE works SET match_source = 'admin', confidence_score = 100 WHERE 1=1;


-- ============================================================
-- STEP 3. 신규 테이블 생성
-- ============================================================

-- -----------------------------------------------------------
-- ott_categories: OTT별 카테고리 슬롯 관리
-- Admin에서 1회 설정 → 크롤러가 참조
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS ott_categories (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    platform              TEXT    NOT NULL,           -- netflix / disney / wavve / coupang / tving / boxoffice
    category_slot         TEXT    NOT NULL,           -- category01 ~ category09
    table_index           INTEGER NOT NULL DEFAULT 0, -- FlixPatrol 테이블 인덱스 (0부터 시작)
    source_name           TEXT    NOT NULL,           -- 크롤링 원본명 "TOP 10 TV Shows (in Korean)"
    display_name          TEXT,                       -- 프론트 표시명 "TV 시리즈" (Admin에서 수정)
    crawl_limit           INTEGER NOT NULL DEFAULT 20,-- 크롤링 몇 위까지 가져올지
    main_limit            INTEGER NOT NULL DEFAULT 10,-- 메인페이지 노출 순위
    platform_limit        INTEGER NOT NULL DEFAULT 20,-- OTT 페이지 노출 순위
    is_active             INTEGER NOT NULL DEFAULT 1, -- 프론트 노출 여부 (0=숨김, 1=노출)
    created_at            TEXT    DEFAULT (datetime('now')),
    updated_at            TEXT    DEFAULT (datetime('now')),
    UNIQUE(platform, category_slot)
);

-- -----------------------------------------------------------
-- review_queue: TMDB 자동 매칭 실패 → Admin 검토 대기 목록
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_queue (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    platform              TEXT    NOT NULL,
    category_slot         TEXT    NOT NULL,
    rank                  INTEGER NOT NULL,
    title_en              TEXT    NOT NULL,           -- FlixPatrol 크롤링 영어 원제
    title_ko_guess        TEXT,                       -- Claude API 번역 시도 결과
    tmdb_search_tried     TEXT,                       -- TMDB 검색 시도한 키워드
    fail_reason           TEXT,                       -- tmdb_not_found / claude_fail / tmdb_multiple
    crawled_date          TEXT    NOT NULL,           -- 크롤링 날짜 YYYY-MM-DD
    crawled_at            TEXT    DEFAULT (datetime('now')),
    status                TEXT    NOT NULL DEFAULT 'pending', -- pending / resolved / ignored
    resolved_tmdb_id      INTEGER,                   -- Admin이 수동으로 입력한 TMDB ID
    resolved_at           TEXT                        -- 해결 시각
);

-- -----------------------------------------------------------
-- rank_overrides: Admin 순위 수동 조정
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rank_overrides (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    platform              TEXT    NOT NULL,
    category_slot         TEXT    NOT NULL,
    date                  TEXT    NOT NULL,           -- YYYY-MM-DD
    tmdb_id               INTEGER NOT NULL,
    original_rank         INTEGER NOT NULL,           -- 원래 순위
    override_rank         INTEGER NOT NULL,           -- Admin이 조정한 순위
    reason                TEXT,                       -- 조정 사유 (선택)
    created_at            TEXT    DEFAULT (datetime('now')),
    updated_at            TEXT    DEFAULT (datetime('now')),
    UNIQUE(platform, category_slot, date, tmdb_id)
);

-- -----------------------------------------------------------
-- admin_logs: Admin 작업 전체 감사 로그
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_logs (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    action                TEXT    NOT NULL,
    -- 액션 종류:
    -- rank_override        순위 조정
    -- display_name_edit    카테고리 표시명 수정
    -- queue_resolve        검토 큐 수동 매칭 해결
    -- works_update         works 테이블 수정
    -- works_delete         works 테이블 삭제
    -- category_setting     카테고리 설정 변경
    -- crawl_manual         수동 크롤링 실행
    platform              TEXT,
    category_slot         TEXT,
    target_id             TEXT,                       -- 대상 tmdb_id 또는 기타 ID
    before_value          TEXT,                       -- 변경 전 값 (JSON 문자열)
    after_value           TEXT,                       -- 변경 후 값 (JSON 문자열)
    memo                  TEXT,                       -- 관리자 메모 (선택)
    created_at            TEXT    DEFAULT (datetime('now'))
);


-- ============================================================
-- STEP 4. ott_categories 초기 데이터 삽입
-- (실제 크롤링 후 source_name 확인하여 Admin에서 수정 가능)
-- ============================================================

-- -----------------------------------------------------------
-- 넷플릭스 (4개 카테고리)
-- URL: flixpatrol.com/top10/netflix/south-korea/
-- -----------------------------------------------------------
INSERT OR IGNORE INTO ott_categories
    (platform, category_slot, table_index, source_name, display_name, crawl_limit, main_limit, platform_limit, is_active)
VALUES
    ('netflix', 'category01', 0, 'TOP 10 Movies',        '영화',          20, 10, 20, 1),
    ('netflix', 'category02', 1, 'TOP 10 TV Shows',       'TV 시리즈',     20, 10, 20, 1),
    ('netflix', 'category03', 2, 'TOP 10 Kids Movies',    '키즈 영화',     20, 0,  20, 0), -- 기본 메인 미노출
    ('netflix', 'category04', 3, 'TOP 10 Kids TV Shows',  '키즈 TV',       20, 0,  20, 0); -- 기본 메인 미노출

-- -----------------------------------------------------------
-- 디즈니플러스 (3개 카테고리)
-- URL: flixpatrol.com/top10/disney/south-korea/
-- -----------------------------------------------------------
INSERT OR IGNORE INTO ott_categories
    (platform, category_slot, table_index, source_name, display_name, crawl_limit, main_limit, platform_limit, is_active)
VALUES
    ('disney', 'category01', 0, 'TOP 10 Overall',   '전체 TOP 10',   20, 10, 20, 1),
    ('disney', 'category02', 1, 'TOP 10 Movies',    '영화',          20, 0,  20, 1), -- 메인 미노출 (Overall과 중복)
    ('disney', 'category03', 2, 'TOP 10 TV Shows',  'TV 시리즈',     20, 0,  20, 1); -- 메인 미노출

-- -----------------------------------------------------------
-- 웨이브 (5개 카테고리)
-- URL: flixpatrol.com/top10/wavve/south-korea/
-- -----------------------------------------------------------
INSERT OR IGNORE INTO ott_categories
    (platform, category_slot, table_index, source_name, display_name, crawl_limit, main_limit, platform_limit, is_active)
VALUES
    ('wavve', 'category01', 0, 'TOP 10 Overall',               '전체 TOP 10',       20, 10, 20, 1),
    ('wavve', 'category02', 1, 'TOP 10 Movies',                '영화',              20, 0,  20, 1),
    ('wavve', 'category03', 2, 'TOP 10 TV Shows',              'TV 시리즈',         20, 0,  20, 1),
    ('wavve', 'category04', 3, 'TOP 10 TV Shows (in Korean)',  '한국 드라마',        20, 10, 20, 1),
    ('wavve', 'category05', 4, 'TOP 10 Entertainment Shows',   '예능',              20, 0,  20, 1);

-- -----------------------------------------------------------
-- 쿠팡플레이 (3개 카테고리)
-- URL: flixpatrol.com/top10/coupang-play/south-korea/
-- ⚠️ 기존 코드의 'coupang' → 'coupang-play' 로 URL 수정 필요!
-- -----------------------------------------------------------
INSERT OR IGNORE INTO ott_categories
    (platform, category_slot, table_index, source_name, display_name, crawl_limit, main_limit, platform_limit, is_active)
VALUES
    ('coupang', 'category01', 0, 'TOP 10 Overall',   '전체 TOP 10',   20, 10, 20, 1),
    ('coupang', 'category02', 1, 'TOP 10 Movies',    '영화',          20, 0,  20, 1),
    ('coupang', 'category03', 2, 'TOP 10 TV Shows',  'TV 시리즈',     20, 0,  20, 1);

-- -----------------------------------------------------------
-- 티빙 (1개 카테고리 - 키노라이츠 기존 유지)
-- -----------------------------------------------------------
INSERT OR IGNORE INTO ott_categories
    (platform, category_slot, table_index, source_name, display_name, crawl_limit, main_limit, platform_limit, is_active)
VALUES
    ('tving', 'category01', 0, 'TOP 10 Overall', '전체 TOP 10', 10, 10, 10, 1);

-- -----------------------------------------------------------
-- 박스오피스 (1개 카테고리 - 기존 유지)
-- -----------------------------------------------------------
INSERT OR IGNORE INTO ott_categories
    (platform, category_slot, table_index, source_name, display_name, crawl_limit, main_limit, platform_limit, is_active)
VALUES
    ('boxoffice', 'category01', 0, '주간 박스오피스', '박스오피스', 10, 10, 10, 1);


-- ============================================================
-- STEP 5. 인덱스 생성 (조회 성능 최적화)
-- ============================================================

-- rankings 조회 성능 (날짜 + 플랫폼 + 슬롯 기준 조회가 핵심)
CREATE INDEX IF NOT EXISTS idx_rankings_slot
    ON rankings(date, platform, category_slot);

-- works 영어제목 조회 (② DB 우선 조회 단계에서 핵심)
CREATE INDEX IF NOT EXISTS idx_works_title_en
    ON works(title_en);

-- review_queue 상태별 조회
CREATE INDEX IF NOT EXISTS idx_review_queue_status
    ON review_queue(status, platform, crawled_date);

-- rank_overrides 날짜+플랫폼+슬롯 조회
CREATE INDEX IF NOT EXISTS idx_rank_overrides_lookup
    ON rank_overrides(date, platform, category_slot);

-- admin_logs 시간순 조회
CREATE INDEX IF NOT EXISTS idx_admin_logs_created
    ON admin_logs(created_at DESC);


-- ============================================================
-- 완료 확인 쿼리 (적용 후 실행해서 확인)
-- ============================================================
-- SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
-- SELECT platform, category_slot, source_name, display_name, is_active FROM ott_categories ORDER BY platform, category_slot;
