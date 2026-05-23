import sqlite3
import requests
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"


def search_tmdb(title_ko, title_en="", media_type="tv"):
    """TMDB에서 제목 검색 → (tmdb_id, poster_path) 반환"""
    tmdb_type = "tv" if media_type == "tv" else "movie"

    # 검색 우선순위:
    # 1) title_ko 한국어 검색 (ko-KR)
    # 2) title_en 영어 검색 - 단어 2개 이상만 (1단어는 오매핑 위험)
    # 3) title_ko 영어 검색 (TMDB에 원제로 등록된 경우 대비)
    queries = []

    if title_ko and title_ko.strip():
        queries.append((title_ko.strip(), "ko-KR"))

    if title_en and title_en.strip() and title_en.strip() != title_ko.strip():
        words = title_en.strip().split()
        if len(words) >= 2:  # 단어 1개짜리 영어 제목은 오매핑 위험
            queries.append((title_en.strip(), "en-US"))

    if title_ko and title_ko.strip():
        queries.append((title_ko.strip(), "en-US"))

    for query, lang in queries:
        try:
            url = f"{TMDB_PROXY}/search/{tmdb_type}"
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
                print(f"    → TMDB 정확매칭({lang}): {best.get('title') or best.get('name')}")
                return best.get("id"), best.get("poster_path")

            # 2순위: popularity 10 이상 + poster
            popular = [
                r for r in results
                if r.get("poster_path") and r.get("popularity", 0) >= 10
            ]
            if popular:
                best = sorted(popular, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                print(f"    → TMDB 인기매칭({lang}): {best.get('title') or best.get('name')}")
                return best.get("id"), best.get("poster_path")

            # 3순위: poster 있는 것 중 최고 (한국 작품 대응)
            with_poster = [r for r in results if r.get("poster_path")]
            if with_poster:
                best = sorted(with_poster, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                print(f"    → TMDB 폴백({lang}): {best.get('title') or best.get('name')}")
                return best.get("id"), best.get("poster_path")

        except Exception as e:
            print(f"  TMDB 오류 ({query}/{lang}): {e}")

        time.sleep(0.3)

    return None, None


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
    """
    tmdb_id_override: 크롤러가 TMDB ID를 직접 확보했을 때 사용 (검색 생략)
    poster_override:  크롤러가 poster_path를 직접 확보했을 때 사용
    """
    today = get_today()

    if tmdb_id_override and poster_override:
        # 크롤러가 직접 TMDB ID + poster 확보 → 검색 불필요
        tmdb_id, poster_path = tmdb_id_override, poster_override
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko} → tmdb_id={tmdb_id} ✓(직접)")
    elif tmdb_id_override:
        # TMDB ID는 알지만 poster가 없는 경우 → ID로 직접 조회
        tmdb_id = tmdb_id_override
        poster_path = _get_poster_by_id(tmdb_id, "tv" if category == "tv" else "movie")
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko} → tmdb_id={tmdb_id} ✓(ID조회)")
    else:
        # FlixPatrol에 TMDB 링크 없거나 티빙 등 → 제목으로 검색
        tmdb_id, poster_path = search_tmdb(title_ko, title_en, media_type=category)
        status = "✓" if poster_path else "✗ 포스터 없음"
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko} → tmdb_id={tmdb_id} {status}")

    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path))
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
