"""
오뜨랑 DB + TMDB 매칭 모듈
매칭 전략 (3단계):
  1단계: FlixPatrol TMDB 링크 직접 추출 (flixpatrol_base.py에서 처리)
  2단계: 제목 정확 일치 + 엄격한 조건만 매칭 (오매칭 최소화)
  3단계: 불확실한 후보들 → Claude API로 검증
  4단계: 그래도 모르면 None (오매칭 > 미매칭)
"""

import sqlite3
import requests
import time
import json
import os
from datetime import datetime, timezone, timedelta

KST       = timezone(timedelta(hours=9))
DB_PATH   = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"

# Claude API — 환경변수에서 읽기
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"


# ══════════════════════════════════════════════════════
# TMDB 상세 조회
# ══════════════════════════════════════════════════════
def _fetch_detail(tmdb_id: int, media_type: str):
    """tmdb_id로 상세정보 조회 → (title_ko, poster, genre, overview, release_year, tmdb_rating)"""
    try:
        url  = f"{TMDB_PROXY}/{media_type}/{tmdb_id}"
        resp = requests.get(url, params={"language": "ko-KR"}, timeout=10)
        if resp.status_code == 200:
            data         = resp.json()
            title_ko     = data.get("name") or data.get("title") or ""
            poster       = data.get("poster_path") or ""
            genres       = data.get("genres", [])
            genre_str    = ",".join(g.get("name","") for g in genres if g.get("name"))
            overview     = data.get("overview") or ""
            date_str     = data.get("release_date") or data.get("first_air_date") or ""
            release_year = int(date_str[:4]) if date_str and len(date_str) >= 4 else None
            tmdb_rating  = data.get("vote_average") or None
            return title_ko, poster, genre_str, overview, release_year, tmdb_rating
    except Exception:
        pass
    return "", "", "", "", None, None


# ══════════════════════════════════════════════════════
# 유틸
# ══════════════════════════════════════════════════════
def _is_korean(text: str) -> bool:
    return any('\uAC00' <= c <= '\uD7A3' or '\u1100' <= c <= '\u11FF' for c in (text or ""))

def _is_recent(r: dict, current_year: int, years: int) -> bool:
    date_str = r.get("release_date") or r.get("first_air_date") or ""
    if not date_str:
        return True
    try:
        return int(date_str[:4]) >= current_year - years
    except Exception:
        return True

def _normalize(text: str) -> str:
    """제목 정규화 — 소문자, 공백·특수문자 제거"""
    import re
    return re.sub(r'[\s\-\_\:\.\,\'\"]+', '', (text or "").lower().strip())


# ══════════════════════════════════════════════════════
# 2단계: 엄격한 TMDB 검색
# ══════════════════════════════════════════════════════
def _strict_search(title: str, tmdb_type: str) -> list:
    """
    제목으로 TMDB 검색 후 후보 목록 반환.
    각 후보: { id, title_display, title_ko, poster_path, popularity, year }
    """
    candidates = []
    seen_ids   = set()

    for lang in ["ko-KR", "en-US"]:
        try:
            resp = requests.get(
                f"{TMDB_PROXY}/search/{tmdb_type}",
                params={"query": title, "language": lang},
                timeout=10
            )
            if resp.status_code != 200:
                continue
            results = resp.json().get("results", [])
            for r in results[:10]:
                rid = r.get("id")
                if not rid or rid in seen_ids:
                    continue
                seen_ids.add(rid)
                date_str = r.get("release_date") or r.get("first_air_date") or ""
                candidates.append({
                    "id":          rid,
                    "title_en":    r.get("title") or r.get("name") or "",
                    "title_ko":    "",   # 나중에 채움
                    "poster_path": r.get("poster_path") or "",
                    "popularity":  r.get("popularity", 0),
                    "year":        date_str[:4] if date_str else "",
                    "overview":    r.get("overview") or "",
                })
            time.sleep(0.15)
        except Exception as e:
            print(f"    TMDB 검색 오류({lang}): {e}")

    return candidates


def _exact_match(title: str, candidates: list, tmdb_type: str):
    """
    후보 중 제목이 정확히 일치하는 것 반환.
    정규화 후 비교 → 확실한 경우만 반환.
    """
    norm_query = _normalize(title)
    for c in candidates:
        # TMDB en 제목 비교
        if _normalize(c["title_en"]) == norm_query:
            return c
    return None


# ══════════════════════════════════════════════════════
# 3단계: Claude API 검증
# ══════════════════════════════════════════════════════
def _claude_verify(ott_title: str, media_type: str, candidates: list) -> dict | None:
    """
    OTT 랭킹 작품명과 TMDB 후보 목록을 Claude에게 넘겨서
    가장 올바른 매칭을 선택하게 함.
    확신할 수 없으면 None 반환.
    """
    if not ANTHROPIC_API_KEY:
        print("    [Claude] API 키 없음 → 스킵")
        return None
    if not candidates:
        return None

    # 후보 목록 텍스트 구성 (최대 8개)
    cand_lines = []
    for i, c in enumerate(candidates[:8]):
        line = (
            f"{i+1}. ID={c['id']} | 제목={c['title_en']}"
            f" | 연도={c['year']} | 인기도={c['popularity']:.1f}"
            f" | 줄거리={c['overview'][:80]}"
        )
        cand_lines.append(line)

    prompt = f"""당신은 OTT 스트리밍 랭킹 데이터를 처리하는 전문가입니다.

한국 OTT 플랫폼 랭킹에 아래 작품이 올라와 있습니다:
- 작품명: "{ott_title}"
- 유형: {"TV 시리즈" if media_type == "tv" else "영화"}

TMDB에서 검색된 후보 목록입니다:
{chr(10).join(cand_lines)}

위 작품명이 한국 OTT에서 현재 방영/상영 중인 작품임을 고려하여,
가장 올바르게 매칭되는 후보의 번호를 선택하세요.

규칙:
1. 확실하게 매칭되는 후보가 있으면 해당 번호 선택
2. 비슷하지만 확신할 수 없으면 "0" 반환
3. 전혀 관련 없는 후보들뿐이면 "0" 반환
4. 동명이인/동명작품이 여럿이고 구분 불가하면 "0" 반환

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{{"choice": 숫자, "reason": "선택 이유 한 줄"}}"""

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
                "max_tokens": 200,
                "messages":   [{"role": "user", "content": prompt}],
            },
            timeout=20,
        )
        if resp.status_code != 200:
            print(f"    [Claude] API 오류: {resp.status_code}")
            return None

        raw  = resp.json().get("content", [{}])[0].get("text", "").strip()
        # JSON 파싱
        raw  = raw.replace("```json","").replace("```","").strip()
        data = json.loads(raw)
        choice = int(data.get("choice", 0))
        reason = data.get("reason", "")

        if choice == 0:
            print(f"    [Claude] '{ott_title}' → 확신 없음: {reason}")
            return None

        selected = candidates[choice - 1]
        print(f"    [Claude] '{ott_title}' → #{choice} ID={selected['id']} | {reason}")
        return selected

    except Exception as e:
        print(f"    [Claude] 오류: {e}")
        return None


# ══════════════════════════════════════════════════════
# 메인 매칭 함수
# ══════════════════════════════════════════════════════
def search_tmdb(title_ko, title_en="", media_type="tv"):
    """
    TMDB 매칭 (3단계 전략)
    반환: (tmdb_id, poster_path, title_ko_korean)
    """
    tmdb_type = "tv" if media_type == "tv" else "movie"
    current_year = datetime.now().year

    # 검색 쿼리 목록 (한글 제목 우선, 영어 제목도 시도)
    queries = []
    if title_ko and title_ko.strip():
        queries.append(title_ko.strip())
    if title_en and title_en.strip() and title_en.strip() != title_ko.strip():
        if len(title_en.strip().split()) >= 1:
            queries.append(title_en.strip())

    all_candidates = []
    seen_ids       = set()

    for query in queries:
        candidates = _strict_search(query, tmdb_type)
        for c in candidates:
            if c["id"] not in seen_ids:
                seen_ids.add(c["id"])
                all_candidates.append(c)

        # ── 2단계: 제목 정확 일치 확인 ──
        exact = _exact_match(query, candidates, tmdb_type)
        if exact:
            # poster 있고 최근 작품인지 확인
            if exact["poster_path"] and _is_recent(
                {"release_date": exact["year"]+"-01-01", "first_air_date": exact["year"]+"-01-01"},
                current_year, 15
            ):
                tmdb_id = exact["id"]
                ko_title, poster, _, _, _, _ = _fetch_detail(tmdb_id, tmdb_type)
                poster = poster or exact["poster_path"]
                print(f"    → [2단계 정확매칭] '{query}' → {ko_title or query} (ID={tmdb_id})")
                return tmdb_id, poster, ko_title or title_ko

    if not all_candidates:
        print(f"    → [미매칭] '{title_ko}' — 후보 없음")
        return None, None, None

    # 후보를 인기도 순으로 정렬, poster 있는 것 우선
    ranked = sorted(
        [c for c in all_candidates if c["poster_path"]],
        key=lambda x: x["popularity"],
        reverse=True
    )
    if not ranked:
        ranked = sorted(all_candidates, key=lambda x: x["popularity"], reverse=True)

    # ── 3단계: Claude 검증 ──
    # 상위 후보들에 ko-KR 제목 채우기 (Claude 판단에 도움)
    for c in ranked[:5]:
        try:
            ko, _, _, _, _, _ = _fetch_detail(c["id"], tmdb_type)
            c["title_ko"] = ko or ""
            time.sleep(0.1)
        except Exception:
            pass

    verified = _claude_verify(title_ko or title_en, tmdb_type, ranked[:8])

    if verified:
        tmdb_id  = verified["id"]
        ko_title, poster, _, _, _, _ = _fetch_detail(tmdb_id, tmdb_type)
        poster   = poster or verified["poster_path"]
        print(f"    → [3단계 Claude검증] '{title_ko}' → {ko_title or title_ko} (ID={tmdb_id})")
        return tmdb_id, poster, ko_title or title_ko

    # ── 4단계: None 반환 (오매칭 방지) ──
    print(f"    → [미매칭 처리] '{title_ko}' — Claude 검증 실패, 오매칭 방지를 위해 None")
    return None, None, None


# ══════════════════════════════════════════════════════
# DB 초기화
# ══════════════════════════════════════════════════════
def get_today():
    return datetime.now(KST).strftime("%Y-%m-%d")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rankings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,
            platform    TEXT    NOT NULL,
            category    TEXT    NOT NULL,
            rank        INTEGER NOT NULL,
            title_ko    TEXT    NOT NULL,
            title_en    TEXT    DEFAULT '',
            score       REAL    DEFAULT 0.0,
            created_at  TEXT    DEFAULT (datetime('now','localtime')),
            tmdb_id     INTEGER DEFAULT NULL,
            poster_path TEXT    DEFAULT NULL,
            is_manual   INTEGER DEFAULT 0,
            genre       TEXT    DEFAULT NULL,
            overview    TEXT    DEFAULT NULL,
            release_year INTEGER DEFAULT NULL,
            tmdb_rating REAL    DEFAULT NULL,
            UNIQUE(date, platform, category, rank)
        )
    """)
    conn.commit()

    # 기존 DB에 누락된 컬럼 자동 추가 (ALTER TABLE은 이미 있으면 오류 → 무시)
    migrations = [
        "ALTER TABLE rankings ADD COLUMN is_manual   INTEGER DEFAULT 0",
        "ALTER TABLE rankings ADD COLUMN genre        TEXT    DEFAULT NULL",
        "ALTER TABLE rankings ADD COLUMN overview     TEXT    DEFAULT NULL",
        "ALTER TABLE rankings ADD COLUMN release_year INTEGER DEFAULT NULL",
        "ALTER TABLE rankings ADD COLUMN tmdb_rating  REAL    DEFAULT NULL",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # 이미 컬럼 있으면 무시

    return conn


# ══════════════════════════════════════════════════════
# 랭킹 저장
# ══════════════════════════════════════════════════════
def save(conn, platform, category, rank, title_ko, title_en="", score=0.0,
         tmdb_id_override=None, poster_override=None):
    today      = get_today()
    media_type = "tv" if category == "tv" else "movie"

    # is_manual=1인 행은 크롤러가 덮어쓰지 않음
    existing = conn.execute("""
        SELECT is_manual, tmdb_id, poster_path, title_ko
        FROM rankings
        WHERE date = ? AND platform = ? AND category = ? AND rank = ?
    """, (today, platform, category, rank)).fetchone()

    if existing and existing[0] == 1:
        print(f"  [{platform}][{category}] {rank:2d}. {existing[3]} → 수동고정, 스킵")
        return

    genre = overview = release_year = tmdb_rating = None

    # ── FlixPatrol에서 직접 추출한 TMDB ID ──
    if tmdb_id_override and poster_override:
        tmdb_id        = tmdb_id_override
        poster_path    = poster_override
        ko_title, _, genre, overview, release_year, tmdb_rating = _fetch_detail(tmdb_id, media_type)
        title_ko_final = ko_title or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(직접)")

    elif tmdb_id_override:
        tmdb_id        = tmdb_id_override
        ko_title, poster_path, genre, overview, release_year, tmdb_rating = _fetch_detail(tmdb_id, media_type)
        title_ko_final = ko_title or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(ID조회)")

    else:
        # ── 3단계 매칭 전략 실행 ──
        tmdb_id, poster_path, ko_title = search_tmdb(title_ko, title_en, media_type=category)
        if ko_title and _is_korean(ko_title):
            title_ko_final = ko_title
        else:
            title_ko_final = title_ko
        if tmdb_id:
            _, _, genre, overview, release_year, tmdb_rating = _fetch_detail(tmdb_id, media_type)
        status = "✓" if poster_path else "✗ 미매칭(안전)"
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} {status}")

    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score,
             tmdb_id, poster_path, genre, overview, release_year, tmdb_rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko_final, title_en, score,
          tmdb_id, poster_path, genre or None, overview or None, release_year, tmdb_rating))
    conn.commit()

    # works 테이블에도 저장
    if tmdb_id:
        _upsert_work(conn, tmdb_id, media_type, title_ko_final, title_en,
                     poster_path, genre, overview, release_year, tmdb_rating)


# ══════════════════════════════════════════════════════
# works 테이블 upsert
# ══════════════════════════════════════════════════════
def _upsert_work(conn, tmdb_id, category, title_ko, title_en,
                 poster_path, genre, overview, release_year, tmdb_rating):
    try:
        conn.execute("""
            INSERT INTO works
                (tmdb_id, category, title_ko, title_en, poster_path,
                 genre, overview, release_year, tmdb_rating, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
            ON CONFLICT(tmdb_id) DO UPDATE SET
                title_ko     = excluded.title_ko,
                title_en     = excluded.title_en,
                poster_path  = COALESCE(excluded.poster_path, poster_path),
                genre        = COALESCE(excluded.genre, genre),
                overview     = COALESCE(excluded.overview, overview),
                release_year = COALESCE(excluded.release_year, release_year),
                tmdb_rating  = COALESCE(excluded.tmdb_rating, tmdb_rating),
                updated_at   = datetime('now','localtime')
        """, (tmdb_id, category, title_ko, title_en or '',
              poster_path or None, genre or None, overview or None,
              release_year, tmdb_rating))
        conn.commit()
    except Exception as e:
        print(f"  works upsert 오류: {e}")


def _get_poster_by_id(tmdb_id: int, media_type: str):
    _, poster, _, _, _, _ = _fetch_detail(tmdb_id, media_type)
    return poster or None
