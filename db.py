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
            keywords       TEXT    DEFAULT '',
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

    # touched_works 테이블 (신규)
    # ⚠️ 목적: 이번 크롤링 실행에서 works를 "실제로" 쓴(INSERT/UPDATE) tmdb_id만 기록
    #   → upload_to_d1.py가 works 전체가 아니라 이 목록에 있는 것만 D1에 업로드하도록 좁히기 위함
    # ⚠️ 매 실행(run_all.py) 시작 시 반드시 비워야 함 — 지난 실행 기록이 남아있으면
    #   "이번에 안 바뀐 것"까지 다시 업로드하게 되어 좁히는 의미가 없어짐
    conn.execute("""
        CREATE TABLE IF NOT EXISTS touched_works (
            tmdb_id INTEGER PRIMARY KEY
        )
    """)
    conn.execute("DELETE FROM touched_works")
    conn.commit()

    # ── 기존 rankings.db 마이그레이션 (구버전 호환) ──────────
    # rankings.db가 구버전으로 레포에 존재할 경우 컬럼 추가
    migrations = [
        "ALTER TABLE rankings ADD COLUMN category_slot TEXT",
        "ALTER TABLE rankings ADD COLUMN source_name TEXT",
        "ALTER TABLE works ADD COLUMN match_source TEXT DEFAULT 'admin'",
        "ALTER TABLE works ADD COLUMN confidence_score INTEGER DEFAULT 100",
        "ALTER TABLE works ADD COLUMN first_matched_date TEXT",
        "ALTER TABLE works ADD COLUMN keywords TEXT DEFAULT ''",
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
    works 테이블에서 제목으로 조회
    반환: { tmdb_id, title_ko, title_en, poster_path } 또는 None

    ⚠️ 핵심 원칙: 이 함수만 works를 읽음
    크롤러는 works를 절대 UPDATE/DELETE 하지 않음

    조회 순서:
    1. title_en 완전 일치, 대소문자 무시 (영어 제목 크롤러용)
    2. title_ko 완전 일치 (한글 제목 크롤러용 — 웨이브/티빙 등)
       → 한글 제목이 title_en 자리에 들어올 때 Admin 데이터 보호

    ⚠️ 2026-07-11 수정 — 두 가지 문제 동시 해결:
    1) 대소문자 불일치로 못 찾는 문제: 크롤러가 매일 가져오는 제목
       ("The Hustle")과 관리자가 admin.html에서 직접 입력한 제목
       ("the Hustle")이 대소문자만 달라도 기존엔 완전히 다른 문자열로
       취급되어 관리자가 저장한 정답을 못 찾고 매번 TMDB 재검색으로
       빠지던 문제 → COLLATE NOCASE로 대소문자 무시 비교
    2) 같은 title_en으로 여러 행이 있을 때(관리자 확정 값 vs 크롤러가
       예전에 잘못 자동생성한 값) 정렬 기준이 없어 어느 게 뽑힐지
       불확실했던 문제 → confidence_score 높은 것(관리자 확정 100점)을
       우선하도록 정렬. 새 테이블/조인 없이 기존 컬럼만으로 해결.
    """
    if not title_en or not title_en.strip():
        return None

    title = title_en.strip()

    # 1순위: title_en으로 조회 (영어 제목 크롤러) — 대소문자 무시, 신뢰도 높은 것 우선
    row = conn.execute("""
        SELECT tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating
        FROM works
        WHERE title_en = ? COLLATE NOCASE
        ORDER BY confidence_score DESC
        LIMIT 1
    """, (title,)).fetchone()

    if row and row["tmdb_id"]:
        return dict(row)

    # 2순위: title_ko로 조회 (한글 제목이 title_en 자리에 들어온 경우)
    # 웨이브/티빙 등 한글 제목 크롤러에서 Admin 저장 데이터를 찾지 못하는 문제 방지
    row = conn.execute("""
        SELECT tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating
        FROM works
        WHERE title_ko = ?
        ORDER BY confidence_score DESC
        LIMIT 1
    """, (title,)).fetchone()

    if row and row["tmdb_id"]:
        return dict(row)

    return None



# ══════════════════════════════════════════════════════════════
# ③ Claude API — 영어 제목 → 한글 제목 번역 (배치)
# ══════════════════════════════════════════════════════════════


def translate_titles_to_korean(titles: list[str], platform: str = "") -> dict[str, str]:
    """
    Claude API + 웹 검색으로 영어 제목 → 한국 공식 제목 조회
    반환: { "Nemesis": "완전한 적", "Creed": "크리드", ... }

    개선사항:
    - web_search 툴 활성화 → 구글 검색으로 한국 공식 제목 직접 조회
    - 검색어: "넷플릭스 {제목} 한국 공식 제목" → 99.9% 정확도
    - 직역/오번역 문제 근본 해결
    - tool_use 응답 처리: content 블록에서 text 타입만 추출
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

    # 제목 단어 수에 따라 검색 전략 분기
    # 단어 1~2개 짧은 제목 → 플랫폼명 포함 (예: "넷플릭스 Tag 한국 공식 제목")
    # 단어 3개 이상 긴 제목  → 플랫폼명 없이  (예: "Monster-in-Law 한국 제목")
    def _search_hint(title: str, platform: str) -> str:
        word_count = len(title.replace("-", " ").split())
        if word_count <= 2:
            return f"{platform} {title} 한국 공식 제목"
        return f"{title} 한국 제목"

    search_hints = "\n".join(
        f"- {t}  →  검색어: \"{_search_hint(t, platform_ko)}\""
        for t in titles
    )

    prompt = f"""당신은 영화/드라마 한국 공식 제목 전문가입니다.
웹 검색을 활용해서 아래 작품들의 한국 공식 제목을 찾아주세요.

작품 목록 (각 작품마다 제안된 검색어로 검색하세요):
{search_hints}

중요 규칙:
1. 한국에서 실제 사용된 공식 한국어 제목으로 답하세요 (극장/OTT/방송 모두 포함)
2. 절대 직역하지 마세요
   - 예: "Monster-in-Law" → "퍼펙트 웨딩" (NOT "시어머니의 법칙")
   - 예: "A Shop for Killers" → "킬러들의 쇼핑몰" (NOT "킬러의 상점")
   - 예: "Tag" → 넷플릭스 Tag 검색 후 정확한 한국 제목 사용
3. 한국 작품이면 원래 한국어 제목으로 답하세요
4. 공식 한국 제목을 확실히 모르면 영어 원제 그대로 유지하세요 (절대 추측 금지)
5. 검색 후 반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):

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
                "max_tokens": 4000,
                "tools": [
                    {
                        "type": "web_search_20250305",
                        "name": "web_search",
                    }
                ],
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )

        if resp.status_code != 200:
            print(f"  [Claude] API 오류: {resp.status_code} / {resp.text[:200]}")
            return {}

        # tool_use 응답 처리: content 블록 중 text 타입만 추출
        # 웹검색 응답은 tool_use 블록 + text 블록이 섞여서 옴
        resp_json      = resp.json()
        content_blocks = resp_json.get("content", [])
        stop_reason    = resp_json.get("stop_reason", "")

        raw = "\n".join(
            block.get("text", "")
            for block in content_blocks
            if block.get("type") == "text"
        ).strip()

        if not raw:
            print(f"  [Claude] 웹 검색 응답 텍스트 없음 (stop_reason={stop_reason})")
            return {}

        # JSON 블록 추출 — 응답에 설명 텍스트가 섞여 있을 수 있음
        # 1) ```json ... ``` 블록 우선 추출
        import re as _re
        json_match = _re.search(r"```json\s*(.+?)\s*```", raw, _re.DOTALL)
        if json_match:
            raw = json_match.group(1).strip()
        else:
            # 2) { ... } 블록 직접 추출
            brace_match = _re.search(r"(\{.+\})", raw, _re.DOTALL)
            if brace_match:
                raw = brace_match.group(1).strip()
            else:
                raw = raw.replace("```json", "").replace("```", "").strip()

        if not raw:
            print("  [Claude] JSON 추출 실패")
            return {}

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as je:
            print(f"  [Claude] JSON 파싱 실패: {je} / raw={raw[:100]}")
            return {}

        translations = data.get("translations", {})
        print(f"  [Claude+웹검색] 번역 완료: {len(translations)}개")
        return translations

    except Exception as e:
        print(f"  [Claude] 번역 오류: {type(e).__name__}: {e}")
        return {}

def _infer_netflix_media_type_hint(item: dict) -> str | None:
    """
    [2026-07-11 신설] 넷플릭스 카테고리 기반 media_type 힌트

    배경: 넷플릭스는 category07=영화, category08=TV처럼 카테고리 자체가
    영화/TV를 명확히 분리하고 있고, 이 정보가 item["source_name"]에 이미
    "Movie"/"TV Show" 키워드로 들어있음(netflix_tudum.py 참고). 그런데
    기존 TMDB 영어검색 단계는 이 정보를 안 쓰고 무조건 tv→movie 순서로
    검색하다가, "The Hustle"(영화, 2019)을 tv 검색에서 먼저 찾다가
    "Romesh: Can't Knock the Hustle"(TV, 제목에 "the hustle" 단어만 겹침)을
    오매칭하는 사고가 있었음. 정답이 movie 검색에 있었는데 tv 검색에서
    엉뚱한 후보로 먼저 확정되어 movie 검색 자체를 시도조차 안 한 게 원인.

    이 함수는 넷플릭스에 한해서만 힌트를 제공 — 다른 플랫폼은 카테고리가
    영화/TV로 깔끔히 안 나뉘는 경우가 많아 적용하지 않음(넷플릭스 전용).

    반환: "tv" / "movie" / None(힌트 없음 — 기존 tv→movie 순서 그대로 사용)
    """
    if item.get("platform") != "netflix":
        return None
    sn = (item.get("source_name") or "").lower()
    if "tv show" in sn:
        return "tv"
    if "movie" in sn:
        return "movie"
    return None


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

    # 3단계: 영어 원제로 폴백 검색 (strict=True → 결과 여러개면 None 반환, 오매칭 방지)
    if title_en and title_en.strip() and title_en.strip() != title_ko:
        print(f"    [영어 폴백] '{title_ko}' → 영어 '{title_en}' 으로 재검색")
        for media_type in ["tv", "movie"]:
            result = _search_tmdb_by_title(title_en.strip(), media_type, lang="en-US", strict=True)
            if result:
                return result

        # 4단계: 영어 원제 시즌 번호 제거 후 재검색
        stripped_en = _strip_season_number(title_en.strip())
        if stripped_en != title_en.strip():
            print(f"    [영어 시즌제거] '{title_en}' → '{stripped_en}'")
            for media_type in ["tv", "movie"]:
                result = _search_tmdb_by_title(stripped_en, media_type, lang="en-US", strict=True)
                if result:
                    return result

    return None

def _tmdb_is_korean(r: dict) -> bool:
    """TMDB 결과에서 한국 작품 여부 확인"""
    countries = r.get("origin_country") or []
    if isinstance(countries, list) and "KR" in countries:
        return True
    if r.get("original_language") == "ko":
        return True
    return False

def _tmdb_get_popularity(r: dict) -> float:
    """TMDB 결과에서 popularity 추출"""
    try:
        return float(r.get("popularity") or 0)
    except Exception:
        return 0

def _tmdb_get_title(r: dict) -> str:
    """TMDB 결과에서 제목 추출"""
    return (r.get("name") or r.get("title") or "").strip()

def _tmdb_title_score(r: dict, query: str) -> int:
    """
    검색어와 TMDB 결과 제목 유사도 점수
    완전 일치: 100 / 단어 경계 일치: 80 / 단순 포함: 30 / 불일치: 0
    예: "링" vs "링크" → 30점 (단순 포함, 낮은 점수)
    예: "링" vs "링" → 100점 (완전 일치)
    """
    import re as _re
    t = _tmdb_get_title(r).lower().strip()
    q = query.lower().strip()
    if t == q:
        return 100
    pattern = r'(?<![\w가-힣])' + _re.escape(q) + r'(?![\w가-힣])'
    if _re.search(pattern, t):
        return 80
    if q in t or t in q:
        return 30
    return 0

def _search_tmdb_by_title(query: str, media_type: str, lang: str = "ko-KR", strict: bool = False) -> dict | None:
    """
    TMDB 검색 실행
    결과 1개 → 바로 반환
    결과 여러개 → 한국 작품 우선 → 그 중 popularity 높은 것
    lang: "ko-KR" (한글 검색) 또는 "en-US" (영어 폴백)
    strict: True이면 결과 여러개일 때 None 반환 (영어 폴백 시 오매칭 방지)
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

        # strict 모드 — 결과 여러개일 때 오매칭 방지
        # 단, 제목이 완전 일치하는 결과가 있으면 최신 연도 기준으로 반환
        if strict:
            def get_year(r):
                date_str = r.get("release_date") or r.get("first_air_date") or "0000"
                try: return int(date_str[:4])
                except: return 0

            # 제목 완전 일치(100점) 결과 있으면 반환 (Creed III 등 커버)
            exact_match = [r for r in valid if _tmdb_title_score(r, query) == 100]
            if exact_match:
                return _build_result(max(exact_match, key=get_year), media_type)

            # 유사도 낮으면 None 반환 (오매칭 방지)
            best_score = max(_tmdb_title_score(r, query) for r in valid)
            if best_score < 80:
                print(f"    [strict] '{query}' → 유사도 낮아 저장 안함 (score={best_score})")
                return None

            # 80점 이상 중 최신 연도
            high_score = [r for r in valid if _tmdb_title_score(r, query) >= 80]
            return _build_result(max(high_score, key=get_year), media_type)

        def get_year(r):
            """출시 연도 추출 — 최신 연도 우선 정렬용"""
            date_str = r.get("release_date") or r.get("first_air_date") or "0000"
            try:
                return int(date_str[:4])
            except Exception:
                return 0

        # ──────────────────────────────────────────────────────
        # 우선순위 기준: 최신 연도 우선 (popularity 사용 안 함)
        # 이유: TMDB popularity는 all-time 누적값이라
        #       오래된 명작이 신작보다 높게 나와 오매칭 발생
        # 같은 제목이면 현재 OTT에서 서비스 중인 신작이 정답일 확률이 높음
        # ──────────────────────────────────────────────────────

        # 1순위: 검색어와 정확히 일치하는 한국 작품 중 최신 연도
        exact_korean = [r for r in valid if _tmdb_is_korean(r) and _tmdb_title_score(r, query) == 100]
        if exact_korean:
            return _build_result(max(exact_korean, key=get_year), media_type)

        # 2순위: 단어 경계 일치하는 한국 작품 중 최신 연도 (80점)
        boundary_korean = [r for r in valid if _tmdb_is_korean(r) and _tmdb_title_score(r, query) >= 80]
        if boundary_korean:
            return _build_result(max(boundary_korean, key=get_year), media_type)

        # 3순위: 한국 작품 중 최신 연도
        korean = [r for r in valid if _tmdb_is_korean(r)]
        if korean:
            return _build_result(max(korean, key=get_year), media_type)

        # 4순위: 검색어 정확 일치하는 전체 작품 중 최신 연도
        exact_all = [r for r in valid if _tmdb_title_score(r, query) == 100]
        if exact_all:
            return _build_result(max(exact_all, key=get_year), media_type)

        # 5순위: 전체 결과 중 최신 연도
        return _build_result(max(valid, key=get_year), media_type)

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

    # 키워드 조회 — 신규 매칭 작품에 한해 1회만 수집 (genre와 별개 호출, TMDB API 추가 1회)
    keywords = _fetch_keywords(tmdb_id, media_type)

    return {
        "tmdb_id":      tmdb_id,
        "title_ko":     detail.get("title_ko") or title_ko,
        "title_en":     title_en,
        "poster_path":  detail.get("poster_path") or tmdb_item.get("poster_path") or "",
        "genre":        detail.get("genre", ""),
        "overview":     detail.get("overview", ""),
        "release_year": int(date_str[:4]) if date_str and len(date_str) >= 4 else None,
        "tmdb_rating":  tmdb_item.get("vote_average") or None,
        "keywords":     keywords,
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


def _fetch_keywords(tmdb_id: int, media_type: str) -> str:
    """TMDB 키워드 조회 — 영문, 콤마구분 문자열로 반환 (genre 컬럼과 동일 패턴)
    키워드는 언어 파라미터 없이 항상 영어로만 제공됨"""
    try:
        resp = requests.get(
            f"{TMDB_PROXY}/{media_type}/{tmdb_id}/keywords",
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            # TV는 'results', 영화는 'keywords' 키에 담겨서 옴 (TMDB API 사양)
            kw_list = data.get("keywords") or data.get("results") or []
            return ",".join(k.get("name", "") for k in kw_list if k.get("name"))
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
        cur = conn.execute("""
            INSERT INTO works
                (tmdb_id, title_ko, title_en, poster_path, genre, overview,
                 release_year, tmdb_rating, keywords, match_source, confidence_score,
                 first_matched_date, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now','localtime'), datetime('now','localtime'))
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
            tmdb_data.get("keywords", ""),
            match_source,
            confidence,
        ))

        # ⚠️ ON CONFLICT DO NOTHING이라 이미 있던 tmdb_id면 rowcount=0(아무것도 안 바뀜)
        # rowcount>0(진짜 신규 삽입)일 때만 touched_works에 기록 → upload_to_d1.py 업로드 대상이 됨
        if cur.rowcount > 0:
            conn.execute(
                "INSERT OR IGNORE INTO touched_works (tmdb_id) VALUES (?)",
                (tmdb_data["tmdb_id"],)
            )

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
    tmdb_rating 없으면 works 테이블에서 보완
    """
    today = get_today()
    category_compat = item["category_slot"]

    if tmdb_data:
        # tmdb_rating 없으면 works 테이블에서 보완
        tmdb_rating = tmdb_data.get("tmdb_rating")
        if not tmdb_rating and tmdb_data.get("tmdb_id"):
            row = conn.execute(
                "SELECT tmdb_rating FROM works WHERE tmdb_id = ?",
                (tmdb_data["tmdb_id"],)
            ).fetchone()
            if row and row[0]:
                tmdb_rating = row[0]

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
            tmdb_rating,
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

        # tmdb_rating은 변동값 → 매칭마다 TMDB API 재조회해서 최신값으로 갱신
        if works_data.get("tmdb_id"):
            detail = _fetch_detail(works_data["tmdb_id"], "tv")
            rating = detail.get("tmdb_rating")
            if not rating:
                detail2 = _fetch_detail(works_data["tmdb_id"], "movie")
                rating  = detail2.get("tmdb_rating")
            if rating and rating != works_data.get("tmdb_rating"):
                old = works_data.get("tmdb_rating")
                works_data["tmdb_rating"] = rating
                conn.execute(
                    "UPDATE works SET tmdb_rating = ?, updated_at = datetime('now','localtime') WHERE tmdb_id = ?",
                    (rating, works_data["tmdb_id"])
                )
                # 평점이 실제로 바뀐 경우만 touched_works에 기록 → upload_to_d1.py 업로드 대상이 됨
                conn.execute(
                    "INSERT OR IGNORE INTO touched_works (tmdb_id) VALUES (?)",
                    (works_data["tmdb_id"],)
                )
                conn.commit()
                print(f"     → tmdb_rating 갱신: {old} → {rating}")

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
        # Claude 번역 실패 → 검토 큐로 처리 (오매칭 방지)
        print(f"  ⚠️ [{platform}][{slot}] {rank:2d}. '{title_en}' → 번역 실패, 검토 큐 저장")
        save_review_queue(conn, item, title_en, fail_reason="claude_fail")
        _save_to_rankings(conn, item, None)
        return

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
    크롤링 결과 전체 배치 처리 - 새 파이프라인 v3

    매칭 순서:
    ① works DB 우선 조회 → 있으면 바로 저장
    ② TMDB 영어 원제 검색 (결과 1개면 바로 저장) → 넷플릭스 영어 작품 커버
    ③ Claude 번역 → TMDB 한글 검색 (한국/일본 작품 커버)
    ④ 전부 실패 → 검토 큐
    """
    if not items:
        return

    from collections import defaultdict

    # ── ① works 우선 조회 ────────────────────────────────────
    matched_items   = []
    unmatched_items = []

    for item in items:
        works_data = lookup_works(conn, item["title_en"])
        if works_data:
            matched_items.append((item, works_data))
        else:
            unmatched_items.append(item)

    print(f"\n  [배치] works 매칭: {len(matched_items)}개 / 신규: {len(unmatched_items)}개")

    for item, works_data in matched_items:
        print(f"  ✅ [{item['platform']}][{item['category_slot']}] "
              f"{item['rank']:2d}. '{item['title_en']}' → works DB (tmdb_id={works_data['tmdb_id']})")

        # tmdb_rating은 변동값 → 매칭마다 TMDB API 재조회해서 최신값으로 갱신
        # (3키 원칙 대상인 tmdb_id/title_ko/title_en은 건드리지 않음)
        if works_data.get("tmdb_id"):
            detail = _fetch_detail(works_data["tmdb_id"], "tv")
            rating = detail.get("tmdb_rating")
            if not rating:
                detail2 = _fetch_detail(works_data["tmdb_id"], "movie")
                rating  = detail2.get("tmdb_rating")
            if rating and rating != works_data.get("tmdb_rating"):
                old = works_data.get("tmdb_rating")
                works_data["tmdb_rating"] = rating
                conn.execute(
                    "UPDATE works SET tmdb_rating = ?, updated_at = datetime('now','localtime') WHERE tmdb_id = ?",
                    (rating, works_data["tmdb_id"])
                )
                # 평점이 실제로 바뀐 경우만 touched_works에 기록 → upload_to_d1.py 업로드 대상이 됨
                conn.execute(
                    "INSERT OR IGNORE INTO touched_works (tmdb_id) VALUES (?)",
                    (works_data["tmdb_id"],)
                )
                conn.commit()
                print(f"     → tmdb_rating 갱신: {old} → {rating}")

        _save_to_rankings(conn, item, works_data)

    if not unmatched_items:
        return

    # ── ② TMDB 영어 원제 검색 (strict=True, 결과 1개만 저장) ─
    # 넷플릭스/디즈니 영어 작품들 커버
    still_unmatched = []
    for item in unmatched_items:
        title_en = item["title_en"]

        # 한글 제목은 영어 검색 스킵
        if _is_korean(title_en):
            still_unmatched.append(item)
            continue

        # 단어 1개 제목은 오매칭 위험 → Claude 번역으로 넘김
        # 예) 'David', 'Creed', 'Goat', 'Raw' → TMDB에 동명 작품 너무 많음
        if len(title_en.split()) <= 1:
            still_unmatched.append(item)
            continue

        # 넷플릭스 카테고리 힌트 반영 — 확실한 타입(영화/TV)을 알고 있으면
        # 그것부터 검색해서, 틀린 타입에서 먼저 어설프게 매칭되는 사고 방지.
        # 힌트 없으면(넷플릭스가 아니거나 카테고리가 섞여있으면) 기존 순서 유지.
        hint = _infer_netflix_media_type_hint(item)
        if hint:
            search_order = [hint] + [mt for mt in ("tv", "movie") if mt != hint]
            print(f"    [카테고리 힌트] '{title_en}' → source_name='{item.get('source_name')}' "
                  f"기반 '{hint}' 우선 검색")
        else:
            search_order = ["tv", "movie"]

        tmdb_data = None
        for media_type in search_order:
            result = _search_tmdb_by_title(title_en, media_type, lang="en-US", strict=True)
            if result:
                tmdb_data = result
                break

        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_en
            print(f"  ✅ [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → '{tmdb_data['title_ko']}' "
                  f"(tmdb_id={tmdb_data['tmdb_id']}) [영어검색]")
            insert_work(conn, tmdb_data, match_source="auto_claude")
            _save_to_rankings(conn, item, tmdb_data)
        else:
            still_unmatched.append(item)

        time.sleep(0.1)

    if not still_unmatched:
        return

    # ── ③ Claude 번역 → TMDB 한글 검색 (신규 항목만) ─────────
    platform_groups = defaultdict(list)
    for item in still_unmatched:
        if _is_korean(item["title_en"]):
            pass  # 한글은 번역 스킵
        else:
            platform_groups[item["platform"]].append(item)

    translations = {}
    for plt, plt_items in platform_groups.items():
        plt_titles = [item["title_en"] for item in plt_items]
        plt_translations = translate_titles_to_korean(plt_titles, platform=plt)
        translations.update(plt_translations)

    # 한글 제목은 그대로 추가
    for item in still_unmatched:
        if _is_korean(item["title_en"]):
            translations[item["title_en"]] = item["title_en"]

    # TMDB 한글 검색
    for item in still_unmatched:
        title_en       = item["title_en"]
        title_ko_guess = translations.get(title_en, "")

        if title_ko_guess and title_ko_guess != title_en:
            print(f"  🔤 [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → '{title_ko_guess}' (Claude)")
        elif _is_korean(title_en):
            title_ko_guess = title_en
            print(f"  🔤 [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → 한글 그대로 검색")
        else:
            # 번역 실패 → 검토 큐
            print(f"  ⚠️ [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → 번역 실패, 검토 큐 저장")
            save_review_queue(conn, item, title_en, fail_reason="claude_fail")
            _save_to_rankings(conn, item, None)
            continue

        tmdb_data = search_tmdb_korean(title_ko_guess, title_en)
        time.sleep(0.2)

        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_en
            print(f"  ✅ [{item['platform']}][{item['category_slot']}] "
                  f"{item['rank']:2d}. '{title_en}' → '{tmdb_data['title_ko']}' "
                  f"(tmdb_id={tmdb_data['tmdb_id']})")
            insert_work(conn, tmdb_data, match_source="auto_claude")
            _save_to_rankings(conn, item, tmdb_data)
        else:
            save_review_queue(conn, item, title_ko_guess, fail_reason="tmdb_not_found")
            _save_to_rankings(conn, item, None)
