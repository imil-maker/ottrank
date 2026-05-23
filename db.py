import sqlite3
import requests
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"


def search_tmdb(title_ko, title_en="", media_type="tv"):
    """TMDB에서 제목 검색 → (tmdb_id, poster_path, title_ko_found) 반환"""
    tmdb_type = "tv" if media_type == "tv" else "movie"

    queries = []
    if title_ko and title_ko.strip():
        queries.append((title_ko.strip(), "ko-KR"))
    if title_en and title_en.strip() and title_en.strip() != title_ko.strip():
        words = title_en.strip().split()
        if len(words) >= 2:
            queries.append((title_en.strip(), "en-US"))
    if title_ko and title_ko.strip():
        queries.append((title_ko.strip(), "en-US"))

    for query, lang in queries:
        try:
            url = f"{TMDB_PROXY}/search/{tmdb_type}"
            resp = requests.get(url, params={"query": query, "language": "ko-KR"}, timeout=10)
            if resp.status_code != 200:
                continue

            results = resp.json().get("results", [])

            def get_ko_title(r):
                """TMDB ko-KR 결과에서 한국어 제목 추출"""
                return r.get("name") or r.get("title") or ""

            # 1순위: 제목 정확 일치 + poster
            q_lower = query.lower()
            exact = [
                r for r in results
                if r.get("poster_path")
                and (r.get("title", "") or r.get("name", "")).lower() == q_lower
            ]
            if exact:
                best = sorted(exact, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                ko_title = get_ko_title(best)
                print(f"    → TMDB 정확매칭: {ko_title}")
                return best.get("id"), best.get("poster_path"), ko_title

            # 2순위: popularity 10 이상 + poster
            popular = [
                r for r in results
                if r.get("poster_path") and r.get("popularity", 0) >= 10
            ]
            if popular:
                best = sorted(popular, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                ko_title = get_ko_title(best)
                print(f"    → TMDB 인기매칭: {ko_title}")
                return best.get("id"), best.get("poster_path"), ko_title

            # 3순위: poster 있는 것 중 최고
            with_poster = [r for r in results if r.get("poster_path")]
            if with_poster:
                best = sorted(with_poster, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                ko_title = get_ko_title(best)
                print(f"    → TMDB 폴백: {ko_title}")
                return best.get("id"), best.get("poster_path"), ko_title

        except Exception as e:
            print(f"  TMDB 오류 ({query}/{lang}): {e}")

        time.sleep(0.3)

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

    if tmdb_id_override and poster_override:
        tmdb_id, poster_path = tmdb_id_override, poster_override
        # tmdb_id로 한국어 제목 조회
        title_ko_final = _get_ko_title_by_id(tmdb_id, "tv" if category == "tv" else "movie") or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(직접)")
    elif tmdb_id_override:
        tmdb_id = tmdb_id_override
        poster_path = _get_poster_by_id(tmdb_id, "tv" if category == "tv" else "movie")
        title_ko_final = _get_ko_title_by_id(tmdb_id, "tv" if category == "tv" else "movie") or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(ID조회)")
    else:
        tmdb_id, poster_path, title_ko_found = search_tmdb(title_ko, title_en, media_type=category)
        # TMDB에서 한국어 제목 찾았으면 우선 사용, 없으면 원래 제목 유지
        title_ko_final = title_ko_found if title_ko_found else title_ko
        status = "✓" if poster_path else "✗ 포스터 없음"
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} {status}")

    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko_final, title_en, score, tmdb_id, poster_path))
    conn.commit()


def _get_poster_by_id(tmdb_id: int, media_type: str):
    """tmdb_id로 poster_path 직접 조회"""
    try:
        url = f"{TMDB_PROXY}/{media_type}/{tmdb_id}"
        resp = requests.get(url, params={"language": "ko-KR"}, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("poster_path")
    except Exception:
        pass
    return None


def _get_ko_title_by_id(tmdb_id: int, media_type: str):
    """tmdb_id로 한국어 제목 직접 조회"""
    try:
        url = f"{TMDB_PROXY}/{media_type}/{tmdb_id}"
        resp = requests.get(url, params={"language": "ko-KR"}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("name") or data.get("title") or None
    except Exception:
        pass
    return None
