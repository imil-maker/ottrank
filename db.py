import sqlite3
import requests
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"


def _fetch_detail(tmdb_id: int, media_type: str):
    """tmdb_id로 상세정보(한국어 제목 + poster) 조회"""
    try:
        url = f"{TMDB_PROXY}/{media_type}/{tmdb_id}"
        resp = requests.get(url, params={"language": "ko-KR"}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            title_ko = data.get("name") or data.get("title") or ""
            poster   = data.get("poster_path") or ""
            return title_ko, poster
    except Exception:
        pass
    return "", ""


def search_tmdb(title_ko, title_en="", media_type="tv"):
    """
    TMDB 검색 → (tmdb_id, poster_path, title_ko_korean) 반환
    - 검색 후 반드시 tmdb_id로 ko-KR 상세 재조회 → 한국어 제목 확보
    """
    tmdb_type = "tv" if media_type == "tv" else "movie"

    # 검색 쿼리 우선순위
    queries = []
    if title_ko and title_ko.strip():
        queries.append(title_ko.strip())
    if title_en and title_en.strip() and title_en.strip() != title_ko.strip():
        words = title_en.strip().split()
        if len(words) >= 2:
            queries.append(title_en.strip())

    for query in queries:
        try:
            url = f"{TMDB_PROXY}/search/{tmdb_type}"
            # 검색은 en-US로 (범위 넓음) + ko-KR로도 시도
            for lang in ["ko-KR", "en-US"]:
                resp = requests.get(url, params={"query": query, "language": lang}, timeout=10)
                if resp.status_code != 200:
                    continue

                results = resp.json().get("results", [])

                # 1순위: 제목 정확 일치 + poster
                q_lower = query.lower()
                exact = [
                    r for r in results
                    if r.get("poster_path")
                    and (r.get("title", "") or r.get("name", "")).lower() == q_lower
                ]
                if exact:
                    best = sorted(exact, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                    tmdb_id = best.get("id")
                    # 반드시 ko-KR 상세 재조회
                    ko_title, poster = _fetch_detail(tmdb_id, tmdb_type)
                    poster = poster or best.get("poster_path", "")
                    print(f"    → 정확매칭({lang}): {ko_title or query}")
                    return tmdb_id, poster, ko_title

                # 2순위: popularity 10 이상 + poster
                popular = [
                    r for r in results
                    if r.get("poster_path") and r.get("popularity", 0) >= 10
                ]
                if popular:
                    best = sorted(popular, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                    tmdb_id = best.get("id")
                    ko_title, poster = _fetch_detail(tmdb_id, tmdb_type)
                    poster = poster or best.get("poster_path", "")
                    print(f"    → 인기매칭({lang}): {ko_title or query}")
                    return tmdb_id, poster, ko_title

                # 3순위: poster 있는 것 중 최고
                with_poster = [r for r in results if r.get("poster_path")]
                if with_poster:
                    best = sorted(with_poster, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                    tmdb_id = best.get("id")
                    ko_title, poster = _fetch_detail(tmdb_id, tmdb_type)
                    poster = poster or best.get("poster_path", "")
                    print(f"    → 폴백매칭({lang}): {ko_title or query}")
                    return tmdb_id, poster, ko_title

                time.sleep(0.2)

        except Exception as e:
            print(f"  TMDB 오류 ({query}): {e}")

    return None, None, None


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
            UNIQUE(date, platform, category, rank)
        )
    """)
    conn.commit()
    return conn


def save(conn, platform, category, rank, title_ko, title_en="", score=0.0,
         tmdb_id_override=None, poster_override=None):
    today = get_today()
    media_type = "tv" if category == "tv" else "movie"

    if tmdb_id_override and poster_override:
        tmdb_id = tmdb_id_override
        poster_path = poster_override
        ko_title, _ = _fetch_detail(tmdb_id, media_type)
        title_ko_final = ko_title or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(직접)")

    elif tmdb_id_override:
        tmdb_id = tmdb_id_override
        ko_title, poster_path = _fetch_detail(tmdb_id, media_type)
        title_ko_final = ko_title or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(ID조회)")

    else:
        tmdb_id, poster_path, ko_title = search_tmdb(title_ko, title_en, media_type=category)
        # ko_title: TMDB ko-KR 상세조회 결과
        # 한국어 제목이면 그대로, 영어면 원본(크롤링 제목) 유지
        if ko_title and _is_korean(ko_title):
            title_ko_final = ko_title
        else:
            title_ko_final = title_ko  # 크롤링 원본 유지 (영어여도)
        status = "✓" if poster_path else "✗ 포스터 없음"
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} {status}")

    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko_final, title_en, score, tmdb_id, poster_path))
    conn.commit()


def _is_korean(text: str) -> bool:
    """문자열에 한글이 포함되어 있는지 확인"""
    return any('\uAC00' <= c <= '\uD7A3' or '\u1100' <= c <= '\u11FF' for c in text)


def _get_poster_by_id(tmdb_id: int, media_type: str):
    _, poster = _fetch_detail(tmdb_id, media_type)
    return poster or None
