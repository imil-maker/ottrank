"""
오뜨랑 DB + TMDB 매칭 모듈 v2
────────────────────────────────────────────────────────────────
매칭 파이프라인 (순서 엄수):

  ① 크롤링 결과 수신 (title_en, platform, category_slot)

  ② works 테이블 우선 조회 (title_en 기준)
     → 있으면: 저장된 tmdb_id + title_ko + title_en 그대로 사용
     → 없으면: 다음 단계

  ③ Claude API — 영어 제목 → 한글 제목 번역 (신규 작품만, 배치)
     → "Brave Citizen" → "용감한 시민"

  ④ TMDB 한글 검색
     규칙1: 결과 1개 → 바로 확정
     규칙2: 결과 여러개 → 가장 최신 작품 우선
     규칙3: 시즌 포함 "약한영웅 2" → "약한영웅" 으로 재검색
     → 성공: works 테이블 INSERT + rankings 저장
     → 실패: review_queue 저장 (Admin 검토 큐)

핵심 원칙:
  - works 테이블: 크롤러는 INSERT만, UPDATE/DELETE 절대 금지
  - 크롤링이 몇 번을 돌아도 기존 works 데이터 절대 덮어쓰기 없음
  - Admin만 works를 수정/삭제 가능 (admin_logs에 기록)
────────────────────────────────────────────────────────────────
"""

import sqlite3
import requests
import time
import json
import re
import os
from datetime import datetime, timezone, timedelta

KST        = timezone(timedelta(hours=9))
DB_PATH    = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"

# Claude API 설정
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"

# Google Custom Search API 설정 (Claude 번역 실패 시 폴백)
GOOGLE_SEARCH_API_KEY = os.environ.get("GOOGLE_SEARCH_API_KEY", "")
GOOGLE_SEARCH_CX      = os.environ.get("GOOGLE_SEARCH_CX", "")
GOOGLE_SEARCH_URL     = "https://www.googleapis.com/customsearch/v1"


# ══════════════════════════════════════════════════════════════
# 유틸 함수
# ══════════════════════════════════════════════════════════════

def get_today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")

def _is_korean(text: str) -> bool:
    """한글 포함 여부 확인"""
    return any('\uAC00' <= c <= '\uD7A3' or '\u1100' <= c <= '\u11FF' for c in (text or ""))

def _strip_season_number(title: str) -> str:
    """
    시즌 번호 제거
    예: "약한영웅 2" → "약한영웅", "Stranger Things 4" → "Stranger Things"
    """
    # 끝에 숫자만 붙은 경우 제거 (공백 + 숫자)
    stripped = re.sub(r'\s+\d+$', '', title.strip())
    return stripped.strip()

def _normalize(text: str) -> str:
    """제목 정규화 — 소문자, 공백·특수문자 제거"""
    return re.sub(r'[\s\-\_\:\.\,\'\"]+', '', (text or "").lower().strip())


# ══════════════════════════════════════════════════════════════
# DB 초기화
# ══════════════════════════════════════════════════════════════

def init_db() -> sqlite3.Connection:
    """로컬 SQLite DB 초기화 (GitHub Actions 크롤링 환경용)"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # rankings 테이블 (category_slot 방식)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rankings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            date          TEXT    NOT NULL,
            platform      TEXT    NOT NULL,
            category_slot TEXT    NOT NULL,
            source_name   TEXT,
            rank          INTEGER NOT NULL,
            title_ko      TEXT    NOT NULL,
            title_en      TEXT    DEFAULT '',
            score         REAL    DEFAULT 0.0,
            tmdb_id       INTEGER DEFAULT NULL,
            poster_path   TEXT    DEFAULT NULL,
            is_manual     INTEGER DEFAULT 0,
            genre         TEXT    DEFAULT NULL,
            overview      TEXT    DEFAULT NULL,
            release_year  INTEGER DEFAULT NULL,
            tmdb_rating   REAL    DEFAULT NULL,
            created_at    TEXT    DEFAULT (datetime('now','localtime')),
            UNIQUE(date, platform, category_slot, rank)
        )
    """)

    # works 테이블 (크롤러 INSERT만 허용)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS works (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id        INTEGER NOT NULL UNIQUE,
            title_ko       TEXT    DEFAULT '',
            title_en       TEXT    DEFAULT '',
            poster_path    TEXT    DEFAULT NULL,
            genre          TEXT    DEFAULT NULL,
            overview       TEXT    DEFAULT NULL,
            release_year   INTEGER DEFAULT NULL,
            tmdb_rating    REAL    DEFAULT NULL,
            runtime        INTEGER DEFAULT NULL,
            imdb_id        TEXT    DEFAULT NULL,
            imdb_rating    REAL    DEFAULT NULL,
            imdb_votes     TEXT    DEFAULT NULL,
            imdb_updated   TEXT    DEFAULT NULL,
            match_source   TEXT    DEFAULT 'auto_claude',
            confidence_score INTEGER DEFAULT 95,
            first_matched_date TEXT   DEFAULT (date('now','localtime')),
            updated_at     TEXT    DEFAULT (datetime('now','localtime'))
        )
    """)

    # ott_categories 테이블 (sync_works.py로 D1에서 동기화)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ott_categories (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            platform       TEXT    NOT NULL,
            category_slot  TEXT    NOT NULL,
            table_index    INTEGER NOT NULL DEFAULT 0,
            source_name    TEXT    NOT NULL,
            display_name   TEXT,
            crawl_limit    INTEGER NOT NULL DEFAULT 20,
            main_limit     INTEGER NOT NULL DEFAULT 10,
            platform_limit INTEGER NOT NULL DEFAULT 20,
            is_active      INTEGER NOT NULL DEFAULT 1,
            UNIQUE(platform, category_slot)
        )
    """)

    # review_queue 테이블
    conn.execute("""
        CREATE TABLE IF NOT EXISTS review_queue (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            platform          TEXT    NOT NULL,
            category_slot     TEXT    NOT NULL,
            rank              INTEGER NOT NULL,
            title_en          TEXT    NOT NULL,
            title_ko_guess    TEXT,
            tmdb_search_tried TEXT,
            fail_reason       TEXT,
            crawled_date      TEXT    NOT NULL,
            crawled_at        TEXT    DEFAULT (datetime('now')),
            status            TEXT    NOT NULL DEFAULT 'pending',
            resolved_tmdb_id  INTEGER,
            resolved_at       TEXT
        )
    """)

    # title_map 테이블 (기존 유지)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS title_map (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title_en   TEXT NOT NULL UNIQUE,
            title_ko   TEXT NOT NULL,
            tmdb_id    INTEGER,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)

    # ── 기존 rankings.db 마이그레이션 (구버전 호환) ──────────
    # rankings.db가 구버전으로 레포에 존재할 경우 컬럼 추가
    migrations = [
        "ALTER TABLE rankings ADD COLUMN category_slot TEXT",
        "ALTER TABLE rankings ADD COLUMN source_name TEXT",
        "ALTER TABLE works ADD COLUMN match_source TEXT DEFAULT 'admin'",
        "ALTER TABLE works ADD COLUMN confidence_score INTEGER DEFAULT 100",
        "ALTER TABLE works ADD COLUMN first_matched_date TEXT",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # 이미 컬럼 존재하면 무시

    # 인덱스 (category_slot 컬럼 추가 후 생성)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_works_title_en ON works(title_en)")
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rankings_slot ON rankings(date, platform, category_slot)")
    except Exception:
        pass
    conn.commit()

    return conn


# ══════════════════════════════════════════════════════════════
# ② works 테이블 우선 조회
# ══════════════════════════════════════════════════════════════

def lookup_works(conn: sqlite3.Connection, title_en: str) -> dict | None:
    """
    works 테이블에서 영어 제목으로 조회
    반환: { tmdb_id, title_ko, title_en, poster_path } 또는 None

    ⚠️ 핵심 원칙: 이 함수만 works를 읽음
    크롤러는 works를 절대 UPDATE/DELETE 하지 않음
    """
    if not title_en or not title_en.strip():
        return None

    row = conn.execute("""
        SELECT tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating
        FROM works
        WHERE title_en = ?
        LIMIT 1
    """, (title_en.strip(),)).fetchone()

    if row and row["tmdb_id"]:
        return dict(row)

    return None


# ══════════════════════════════════════════════════════════════
# ③ Claude API — 영어 제목 → 한글 제목 번역 (배치)
# ══════════════════════════════════════════════════════════════


def google_search_korean_title(title_en: str, platform: str = "") -> str:
    """
    Google Custom Search API로 한글 제목 검색
    Claude 번역 실패 시 폴백으로 사용
    반환: 한글 제목 문자열 또는 빈 문자열
    """
    if not GOOGLE_SEARCH_API_KEY or not GOOGLE_SEARCH_CX:
        return ""

    platform_names = {
        "netflix": "넷플릭스", "disney": "디즈니플러스",
        "wavve": "웨이브", "coupang": "쿠팡플레이", "tving": "티빙",
    }
    platform_ko = platform_names.get(platform, "OTT")
    query = f"{platform_ko} {title_en} 한국 제목"

    try:
        resp = requests.get(
            GOOGLE_SEARCH_URL,
            params={
                "key": GOOGLE_SEARCH_API_KEY,
                "cx":  GOOGLE_SEARCH_CX,
                "q":   query,
                "num": 3,
                "lr":  "lang_ko",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"  [Google] API 오류: {resp.status_code}")
            return ""

        items = resp.json().get("items", [])
        if not items:
            return ""

        # 검색 결과 제목/설명에서 한글 제목 추출
        # Claude에게 검색 결과를 주고 한글 제목만 추출하도록 요청
        snippets = []
        for item in items[:3]:
            snippets.append(f"- {item.get('title', '')} | {item.get('snippet', '')}")
        snippets_text = "
".join(snippets)

        # Claude API로 검색 결과에서 한글 제목 추출
        if ANTHROPIC_API_KEY:
            prompt = f"""다음은 "{title_en}"의 한국 제목을 구글에서 검색한 결과입니다.
검색 결과에서 이 작품의 정확한 한국어 공식 제목만 추출해주세요.

검색 결과:
{snippets_text}

규칙:
1. 작품의 공식 한국어 제목만 답하세요 (다른 설명 없이)
2. 확실하지 않으면 빈 문자열로 답하세요
3. 반드시 JSON 형식으로만: {{"title_ko": "한글제목"}}"""

            resp2 = requests.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 100,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=15,
            )
            if resp2.status_code == 200:
                raw  = resp2.json().get("content", [{}])[0].get("text", "").strip()
                raw  = raw.replace("```json", "").replace("```", "").strip()
                data = json.loads(raw)
                title_ko = data.get("title_ko", "").strip()
                if title_ko:
                    print(f"  [Google+Claude] '{title_en}' → '{title_ko}'")
                    return title_ko

        # Claude 없으면 첫 번째 검색 결과 제목에서 한글만 추출
        for item in items[:3]:
            title = item.get("title", "")
            # 제목에서 한글 부분만 추출
            korean_parts = []
            current = ""
            for ch in title:
                if '가' <= ch <= '힣' or 'ᄀ' <= ch <= 'ᇿ' or ch in ' ':
                    current += ch
                else:
                    if current.strip() and len(current.strip()) > 1:
                        korean_parts.append(current.strip())
                    current = ""
            if current.strip() and len(current.strip()) > 1:
                korean_parts.append(current.strip())
            if korean_parts:
                result = max(korean_parts, key=len)
                if len(result) > 2:
                    print(f"  [Google] '{title_en}' → '{result}'")
                    return result

    except Exception as e:
        print(f"  [Google] 검색 오류: {e}")

    return ""

def translate_titles_to_korean(titles: list[str], platform: str = "") -> dict[str, str]:
    """
    Claude API로 영어 제목 목록을 한글 제목으로 배치 번역
    반환: { "Brave Citizen": "용감한 시민", "Tempest": "북극성", ... }

    핵심 개선:
    - 플랫폼 정보 + OTT 서비스 맥락 제공 → 직역 방지
    - 모델을 Sonnet으로 업그레이드 → 정확도 향상
    - 확실하지 않으면 원제 유지 (직역 금지)
    """
    if not ANTHROPIC_API_KEY:
        print("  [Claude] API 키 없음 → 번역 스킵")
        return {}
    if not titles:
        return {}

    # 플랫폼 표시명 매핑
    platform_names = {
        "netflix": "넷플릭스",
        "disney":  "디즈니플러스",
        "wavve":   "웨이브",
        "coupang": "쿠팡플레이",
        "tving":   "티빙",
    }
    platform_ko = platform_names.get(platform, "한국 OTT")

    titles_text = "\n".join(f"- {t}" for t in titles)

    prompt = f"""당신은 한국 OTT 스트리밍 콘텐츠 전문가입니다.

아래는 현재 {platform_ko}에서 인기 있는 작품들의 영어/외국어 제목 목록입니다.
각 작품이 한국에서 실제로 서비스되는 공식 제목을 알려주세요.

작품 목록:
{titles_text}

중요 규칙:
1. 반드시 한국 OTT/극장에서 실제 사용하는 공식 한국어 서비스 제목으로 답하세요
2. 절대 직역하지 마세요
   - 틀린 예: "A Shop for Killers" → "킬러의 상점" (직역 금지)
   - 맞는 예: "A Shop for Killers" → "킬러들의 쇼핑몰" (실제 서비스 제목)
3. 한국 작품이면 원래 한국어 제목으로 답하세요
   - 예: "Brave Citizen" → "용감한 시민"
4. 일본/중국 작품이면 한국 정식 서비스 제목으로 답하세요
   - 예: "Ringu" → "링", "My Dearest" → "나의 사랑 나의 신부"
5. 공식 한국 제목을 확실히 모르면 영어 원제 그대로 유지하세요 (절대 추측으로 직역하지 마세요)
6. 반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):

{{"translations": {{"영어제목1": "한글제목1", "영어제목2": "한글제목2"}}}}"""

    try:
        resp = requests.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      "claude-haiku-4-5-20251001",
                "max_tokens": 2000,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )

        if resp.status_code != 200:
            print(f"  [Claude] API 오류: {resp.status_code}")
            return {}

        raw  = resp.json().get("content", [{}])[0].get("text", "").strip()
        raw  = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw)
        translations = data.get("translations", {})
        print(f"  [Claude] 번역 완료: {len(translations)}개")
        return translations

    except Exception as e:
        print(f"  [Claude] 번역 오류: {e}")
        return {}
def search_tmdb_korean(title_ko: str, title_en: str = "") -> dict | None:
    """
    TMDB 검색으로 작품 매칭 (한글 우선 + 영어 폴백)
    반환: { tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating }
    또는 None (매칭 실패)

    검색 순서:
    1. 한글 제목으로 tv/movie 검색
    2. 시즌 번호 제거 후 한글 재검색 (예: "약한영웅 2" → "약한영웅")
    3. 영어 원제로 tv/movie 검색 (폴백 — 한글 번역이 달라도 커버)
    4. 영어 원제 시즌 번호 제거 후 재검색
    5. 전부 실패 → None (review_queue 처리)
    """
    if not title_ko:
        return None

    # 1단계: 한글 제목으로 검색 (tv/movie 둘 다)
    for media_type in ["tv", "movie"]:
        result = _search_tmdb_by_title(title_ko, media_type)
        if result:
            return result

    # 2단계: 시즌 번호 제거 후 한글 재검색
    stripped_ko = _strip_season_number(title_ko)
    if stripped_ko != title_ko:
        print(f"    [한글 시즌제거] '{title_ko}' → '{stripped_ko}'")
        for media_type in ["tv", "movie"]:
            result = _search_tmdb_by_title(stripped_ko, media_type)
            if result:
                return result

    # 3단계: 영어 원제로 폴백 검색 (한글 번역이 TMDB와 달라도 커버)
    if title_en and title_en.strip() and title_en.strip() != title_ko:
        print(f"    [영어 폴백] '{title_ko}' → 영어 '{title_en}' 으로 재검색")
        for media_type in ["tv", "movie"]:
            result = _search_tmdb_by_title(title_en.strip(), media_type, lang="en-US")
            if result:
                return result

        # 4단계: 영어 원제 시즌 번호 제거 후 재검색
        stripped_en = _strip_season_number(title_en.strip())
        if stripped_en != title_en.strip():
            print(f"    [영어 시즌제거] '{title_en}' → '{stripped_en}'")
            for media_type in ["tv", "movie"]:
                result = _search_tmdb_by_title(stripped_en, media_type, lang="en-US")
                if result:
                    return result

    return None
def _search_tmdb_by_title(query: str, media_type: str, lang: str = "ko-KR") -> dict | None:
    """
    TMDB 검색 실행
    결과 1개 → 바로 반환
    결과 여러개 → 한국 작품 우선 → 그 중 최신 → 없으면 전체 최신
    lang: "ko-KR" (한글 검색) 또는 "en-US" (영어 폴백)
    """
    try:
        resp = requests.get(
            f"{TMDB_PROXY}/search/{media_type}",
            params={"query": query, "language": lang},
            timeout=10,
        )
        if resp.status_code != 200:
            return None

        results = resp.json().get("results", [])
        if not results:
            return None

        # poster 있는 것만 필터
        valid = [r for r in results if r.get("poster_path")]
        if not valid:
            valid = results

        # 결과 1개 → 바로 확정
        if len(valid) == 1:
            return _build_result(valid[0], media_type)

        def get_year(r):
            date_str = r.get("release_date") or r.get("first_air_date") or "0000"
            try:
                return int(date_str[:4])
            except Exception:
                return 0

        def is_korean(r):
            """한국 작품 여부 확인 (origin_country 또는 original_language)"""
            countries = r.get("origin_country") or []
            if isinstance(countries, list) and "KR" in countries:
                return True
            if r.get("original_language") == "ko":
                return True
            return False

        def get_popularity(r):
            try:
                return float(r.get("popularity") or 0)
            except Exception:
                return 0

        def get_title(r):
            """TMDB 결과에서 제목 추출"""
            return (r.get("name") or r.get("title") or "").strip()

        def title_match_score(r, q):
            """
            검색어와 제목 유사도 점수
            완전 일치: 100
            검색어가 제목의 첫 단어로 시작: 80 (예: "링" → "링 2" 가능)
            포함이지만 다른 단어의 일부: 30 (예: "링" → "링크" 는 낮게)
            불일치: 0
            """
            t = get_title(r).lower().strip()
            q_lower = q.lower().strip()
            if t == q_lower:
                return 100  # 완전 일치
            # 검색어가 제목 전체 단어와 일치 (예: "링" → "링" 단독 단어)
            import re
            pattern = r'(?<![\w가-힣])' + re.escape(q_lower) + r'(?![\w가-힣])'
            if re.search(pattern, t):
                return 80  # 단어 경계 일치
            # 단순 포함 (예: "링" → "링크")
            if q_lower in t or t in q_lower:
                return 30
            return 0

        # 1순위: 검색어와 제목이 정확히 일치하는 한국 작품
        #        → "무빙" 검색 시 제목이 "무빙"인 작품 바로 선택
        exact_korean = [r for r in valid if is_korean(r) and title_match_score(r, query) == 100]
        if exact_korean:
            return _build_result(max(exact_korean, key=get_popularity), media_type)

        # 2순위: 제목 포함 일치하는 한국 작품
        partial_korean = [r for r in valid if is_korean(r) and title_match_score(r, query) == 50]
        if partial_korean:
            return _build_result(max(partial_korean, key=get_popularity), media_type)

        # 3순위: 한국 작품 중 popularity 높은 것
        korean = [r for r in valid if is_korean(r)]
        if korean:
            return _build_result(max(korean, key=get_popularity), media_type)

        # 4순위: 검색어 정확 일치하는 전체 작품
        exact_all = [r for r in valid if title_match_score(r, query) == 100]
        if exact_all:
            return _build_result(max(exact_all, key=get_popularity), media_type)

        # 5순위: 전체 결과 중 popularity 높은 것
        return _build_result(max(valid, key=get_popularity), media_type)

    except Exception as e:
        print(f"    TMDB 검색 오류 ({query}, {media_type}): {e}")
        return None


def _build_result(tmdb_item: dict, media_type: str) -> dict:
    """TMDB 검색 결과 → 표준 dict 변환"""
    tmdb_id  = tmdb_item.get("id")
    title_ko = tmdb_item.get("name") or tmdb_item.get("title") or ""
    date_str = tmdb_item.get("release_date") or tmdb_item.get("first_air_date") or ""

    # 영어 제목은 en-US로 재조회
    title_en = _fetch_english_title(tmdb_id, media_type)

    # 상세 정보 조회 (genre, overview 등)
    detail = _fetch_detail(tmdb_id, media_type)

    return {
        "tmdb_id":      tmdb_id,
        "title_ko":     detail.get("title_ko") or title_ko,
        "title_en":     title_en,
        "poster_path":  detail.get("poster_path") or tmdb_item.get("poster_path") or "",
        "genre":        detail.get("genre", ""),
        "overview":     detail.get("overview", ""),
        "release_year": int(date_str[:4]) if date_str and len(date_str) >= 4 else None,
        "tmdb_rating":  tmdb_item.get("vote_average") or None,
    }


def _fetch_english_title(tmdb_id: int, media_type: str) -> str:
    """TMDB en-US로 영어 제목 조회"""
    try:
        resp = requests.get(
            f"{TMDB_PROXY}/{media_type}/{tmdb_id}",
            params={"language": "en-US"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("title") or data.get("name") or ""
    except Exception:
        pass
    return ""


def _fetch_detail(tmdb_id: int, media_type: str) -> dict:
    """TMDB ko-KR 상세 정보 조회"""
    try:
        resp = requests.get(
            f"{TMDB_PROXY}/{media_type}/{tmdb_id}",
            params={"language": "ko-KR"},
            timeout=10,
        )
        if resp.status_code == 200:
            data     = resp.json()
            genres   = data.get("genres", [])
            genre_str = ",".join(g.get("name", "") for g in genres if g.get("name"))
            return {
                "title_ko":    data.get("name") or data.get("title") or "",
                "poster_path": data.get("poster_path") or "",
                "genre":       genre_str,
                "overview":    data.get("overview") or "",
                "tmdb_rating": data.get("vote_average") or None,
            }
    except Exception:
        pass
    return {}


# ══════════════════════════════════════════════════════════════
# review_queue 저장 (TMDB 매칭 실패)
# ══════════════════════════════════════════════════════════════

def save_review_queue(conn: sqlite3.Connection, item: dict, title_ko_guess: str = "", fail_reason: str = "tmdb_not_found"):
    """
    TMDB 자동 매칭 실패한 항목을 review_queue에 저장
    Admin 검토 큐로 이동
    """
    today = get_today()
    try:
        conn.execute("""
            INSERT OR IGNORE INTO review_queue
                (platform, category_slot, rank, title_en, title_ko_guess,
                 tmdb_search_tried, fail_reason, crawled_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["platform"],
            item["category_slot"],
            item["rank"],
            item["title_en"],
            title_ko_guess,
            title_ko_guess,   # 검색 시도한 키워드
            fail_reason,
            today,
        ))
        conn.commit()
        print(f"  ⚠️ [{item['platform']}][{item['category_slot']}] "
              f"{item['rank']:2d}. '{item['title_en']}' → 검토 큐 저장 ({fail_reason})")
    except Exception as e:
        print(f"  review_queue 저장 오류: {e}")


# ══════════════════════════════════════════════════════════════
# works 테이블 INSERT (크롤러용 — INSERT만, UPDATE 금지)
# ══════════════════════════════════════════════════════════════

def insert_work(conn: sqlite3.Connection, tmdb_data: dict, match_source: str = "auto_claude"):
    """
    works 테이블에 신규 작품 INSERT
    ⚠️ 크롤러는 INSERT만 — ON CONFLICT DO NOTHING (기존 데이터 절대 덮어쓰기 금지)
    Admin이 수동으로 저장한 데이터(confidence_score=100)는 절대 변경 안 됨
    """
    confidence = 100 if match_source == "admin" else 95
    try:
        conn.execute("""
            INSERT INTO works
                (tmdb_id, title_ko, title_en, poster_path, genre, overview,
                 release_year, tmdb_rating, match_source, confidence_score,
                 first_matched_date, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now','localtime'), datetime('now','localtime'))
            ON CONFLICT(tmdb_id) DO NOTHING
        """, (
            tmdb_data["tmdb_id"],
            tmdb_data.get("title_ko", ""),
            tmdb_data.get("title_en", ""),
            tmdb_data.get("poster_path", ""),
            tmdb_data.get("genre", ""),
            tmdb_data.get("overview", ""),
            tmdb_data.get("release_year"),
            tmdb_data.get("tmdb_rating"),
            match_source,
            confidence,
        ))
        conn.commit()
    except Exception as e:
        print(f"  works INSERT 오류: {e}")


# ══════════════════════════════════════════════════════════════
# rankings 저장
# ══════════════════════════════════════════════════════════════

def _save_to_rankings(conn: sqlite3.Connection, item: dict, tmdb_data: dict | None):
    """rankings 테이블에 저장
    ⚠️ 기존 rankings 테이블의 category 컬럼(NOT NULL) 호환을 위해
    category_slot 값을 category에도 함께 저장
    """
    today = get_today()
    # 기존 category 컬럼(NOT NULL) 호환 — category_slot 값으로 채움
    category_compat = item["category_slot"]

    if tmdb_data:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank,
                 title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            today,
            item["platform"],
            category_compat,
            item["category_slot"],
            item["source_name"],
            item["rank"],
            tmdb_data.get("title_ko") or item["title_en"],
            tmdb_data.get("title_en") or item["title_en"],
            tmdb_data.get("tmdb_id"),
            tmdb_data.get("poster_path"),
            tmdb_data.get("genre"),
            tmdb_data.get("overview"),
            tmdb_data.get("release_year"),
            tmdb_data.get("tmdb_rating"),
        ))
    else:
        # TMDB 매칭 실패 — 영어 제목만 저장 (tmdb_id=NULL)
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank, title_ko, title_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            today,
            item["platform"],
            category_compat,
            item["category_slot"],
            item["source_name"],
            item["rank"],
            item["title_en"],
            item["title_en"],
        ))

    conn.commit()


# ══════════════════════════════════════════════════════════════
# 메인 저장 함수 (크롤러에서 호출)
# ══════════════════════════════════════════════════════════════

async def save_ranking(conn: sqlite3.Connection, item: dict):
    """
    크롤링 결과 1개를 받아서 파이프라인 실행 후 저장

    item = {
        platform, category_slot, source_name, rank, title_en
    }
    """
    title_en = item["title_en"].strip()
    platform = item["platform"]
    slot     = item["category_slot"]
    rank     = item["rank"]

    # ── ② works 테이블 우선 조회 ──────────────────────────────
    works_data = lookup_works(conn, title_en)
    if works_data:
        print(f"  ✅ [{platform}][{slot}] {rank:2d}. '{title_en}' → works DB 매칭 (tmdb_id={works_data['tmdb_id']})")
        _save_to_rankings(conn, item, works_data)
        return

    # ── ③ Claude API 번역 (단일 항목) ────────────────────────
    # 이미 한글 제목이면 번역 스킵
    title_ko_guess = ""
    if _is_korean(title_en):
        title_ko_guess = title_en  # 이미 한글 → 그대로 사용
    else:
        translations = translate_titles_to_korean([title_en], platform=platform)
        title_ko_guess = translations.get(title_en, "")

    if title_ko_guess and title_ko_guess != title_en:
        print(f"  🔤 [{platform}][{slot}] {rank:2d}. '{title_en}' → '{title_ko_guess}' (Claude 번역)")
    elif _is_korean(title_en):
        # 이미 한글 제목 → 번역 없이 바로 TMDB 검색
        title_ko_guess = title_en
        print(f"  🔤 [{platform}][{slot}] {rank:2d}. '{title_en}' → 한글 제목 그대로 검색")
    else:
        # Claude 번역 실패 → Google Search로 한글 제목 검색
        google_title = google_search_korean_title(title_en, platform)
        if google_title:
            title_ko_guess = google_title
            print(f"  🔤 [{platform}][{slot}] {rank:2d}. '{title_en}' → '{title_ko_guess}' (Google 검색)")
        else:
            # Google도 실패 → 영어 원제로 TMDB 직접 검색
            print(f"  🔤 [{platform}][{slot}] {rank:2d}. '{title_en}' → 번역 실패, 영어 원제로 TMDB 검색")
            title_ko_guess = title_en

    # ── ④ TMDB 검색 (한글 우선, 영어 폴백) ──────────────────
    tmdb_data = search_tmdb_korean(title_ko_guess, title_en)

    if tmdb_data:
        tmdb_data["title_en"] = tmdb_data.get("title_en") or title_en
        print(f"  ✅ [{platform}][{slot}] {rank:2d}. '{title_en}' → "
              f"'{tmdb_data['title_ko']}' (tmdb_id={tmdb_data['tmdb_id']})")

        # works 테이블에 신규 INSERT (기존 데이터 덮어쓰기 금지)
        insert_work(conn, tmdb_data, match_source="auto_claude")

        # rankings 저장
        _save_to_rankings(conn, item, tmdb_data)

    else:
        # ── 매칭 실패 → review_queue ────────────────────────
        save_review_queue(conn, item, title_ko_guess, fail_reason="tmdb_not_found")
        _save_to_rankings(conn, item, None)


async def save_rankings_batch(conn: sqlite3.Connection, items: list[dict]):
    """
    크롤링 결과 전체를 배치로 처리 (Claude API 1회 호출로 전체 번역)

    권장 사용법:
    1. works에 없는 신규 항목만 추출
    2. Claude API 1번 호출로 전체 번역
    3. TMDB 검색 + 저장
    """
    if not items:
        return

    today = get_today()

    # ── ② works 우선 조회 — 매칭/미매칭 분리 ────────────────
    matched_items   = []  # works에 있는 항목
    unmatched_items = []  # works에 없는 신규 항목

    for item in items:
        works_data = lookup_works(conn, item["title_en"])
        if works_data:
            matched_items.append((item, works_data))
        else:
            unmatched_items.append(item)

    print(f"\n  [배치] works 매칭: {len(matched_items)}개 / 신규: {len(unmatched_items)}개")

    # ── works 매칭 항목 바로 저장 ────────────────────────────
    for item, works_data in matched_items:
        print(f"  ✅ [{item['platform']}][{item['category_slot']}] "
              f"{item['rank']:2d}. '{item['title_en']}' → works DB (tmdb_id={works_data['tmdb_id']})")
        _save_to_rankings(conn, item, works_data)

    if not unmatched_items:
        return

    # ── ③ Claude API 배치 번역 (신규 항목만, 플랫폼별 분리) ──
    # 이미 한글인 항목은 번역 스킵, 영어 제목만 번역 요청
    from collections import defaultdict
    platform_groups = defaultdict(list)
    for item in unmatched_items:
        if _is_korean(item["title_en"]):
            # 이미 한글 제목 → 번역 불필요, 그대로 사용
            pass
        else:
            platform_groups[item["platform"]].append(item)

    translations = {}
    for plt, plt_items in platform_groups.items():
        plt_titles = [item["title_en"] for item in plt_items]
        plt_translations = translate_titles_to_korean(plt_titles, platform=plt)
        translations.update(plt_translations)

    # 한글 제목은 번역 결과에 그대로 추가
    for item in unmatched_items:
        if _is_korean(item["title_en"]):
            translations[item["title_en"]] = item["title_en"]

    # ── ④ TMDB 한글 검색 + 저장 ─────────────────────────────
    for item in unmatched_items:
        title_en     = item["title_en"]
        title_ko_guess = translations.get(title_en, title_en)

        if title_ko_guess and title_ko_guess != title_en:
            print(f"  🔤 [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → '{title_ko_guess}'")
        elif _is_korean(title_en):
            # 이미 한글 제목 → 번역 없이 바로 TMDB 검색
            title_ko_guess = title_en
            print(f"  🔤 [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → 한글 제목 그대로 검색")
        else:
            # Claude 번역 실패 → Google Search로 한글 제목 검색
            google_title = google_search_korean_title(title_en, item["platform"])
            if google_title:
                title_ko_guess = google_title
                print(f"  🔤 [{item['platform']}][{item['category_slot']}] "
                      f"{item['rank']:2d}. '{title_en}' → '{title_ko_guess}' (Google 검색)")
            else:
                # Google도 실패 → 영어 원제로 TMDB 직접 검색
                print(f"  🔤 [{item['platform']}][{item['category_slot']}] "
                      f"{item['rank']:2d}. '{title_en}' → 번역 실패, 영어 원제로 TMDB 검색")
                title_ko_guess = title_en

        # title_en을 같이 넘겨서 한글 검색 실패 시 영어 폴백 가능하도록
        tmdb_data = search_tmdb_korean(title_ko_guess, title_en)
        time.sleep(0.2)  # TMDB API rate limit 방지

        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_en
            print(f"  ✅ [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → '{tmdb_data['title_ko']}' "
                  f"(tmdb_id={tmdb_data['tmdb_id']})")

            # works INSERT (기존 덮어쓰기 금지)
            insert_work(conn, tmdb_data, match_source="auto_claude")
            _save_to_rankings(conn, item, tmdb_data)

        else:
            # 매칭 실패 → review_queue
            save_review_queue(conn, item, title_ko_guess, fail_reason="tmdb_not_found")
            _save_to_rankings(conn, item, None)
