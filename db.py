import sqlite3
import requests
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"


def search_tmdb(title_ko, title_en="", media_type="tv"):
    """TMDB에서 제목 검색 → (tmdb_id, poster_path) 반환"""

    # media_type 정규화: DB category값("tv","movie")을 TMDB endpoint에 맞게 변환
    tmdb_type = "tv" if media_type == "tv" else "movie"

    # ── 검색 우선순위 ──────────────────────────────────────
    # 1) title_ko로 한국어 검색 (한국 작품은 ko-KR이 정확)
    # 2) title_en이 있고 의미있는 단어(3글자 이상)면 영어 검색
    # 3) title_ko로 영어 검색 (한국어 제목 그대로 영어 검색 - TMDB에 원제로 등록된 경우)
    queries = []

    if title_ko and title_ko.strip():
        queries.append((title_ko.strip(), "ko-KR"))

    if title_en and len(title_en.strip()) >= 3:
        # 흔한 단어로만 구성된 짧은 영어 제목은 오매핑 위험 → 단어 2개 이상만 허용
        words = title_en.strip().split()
        if len(words) >= 2:
            queries.append((title_en.strip(), "en-US"))

    if title_ko and title_ko.strip():
        queries.append((title_ko.strip(), "en-US"))

    for query, lang in queries:
        try:
            url = f"{TMDB_PROXY}/search/{tmdb_type}"
            resp = requests.get(
                url,
                params={"query": query, "language": lang},
                timeout=10
            )
            if resp.status_code != 200:
                continue

            results = resp.json().get("results", [])

            # ── 후보 선정 로직 ────────────────────────────
            # 1순위: poster 있고 제목 정확히 일치
            q_lower = query.lower()
            exact = [
                r for r in results
                if r.get("poster_path")
                and (r.get("title", "") or r.get("name", "")).lower() == q_lower
            ]
            if exact:
                best = sorted(exact, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                return best.get("id"), best.get("poster_path")

            # 2순위: poster 있고 popularity 10 이상
            popular = [
                r for r in results
                if r.get("poster_path") and r.get("popularity", 0) >= 10
            ]
            if popular:
                best = sorted(popular, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                return best.get("id"), best.get("poster_path")

            # 3순위: poster 있는 것 중 popularity 최고 (한국 작품은 popularity 낮아도 허용)
            with_poster = [r for r in results if r.get("poster_path")]
            if with_poster:
                best = sorted(with_poster, key=lambda x: x.get("popularity", 0), reverse=True)[0]
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


def save(conn, platform, category, rank, title_ko, title_en="", score=0.0):
    today = get_today()
    tmdb_id, poster_path = search_tmdb(title_ko, title_en, media_type=category)
    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path))
    conn.commit()
    poster_status = "✓" if poster_path else "✗ 포스터 없음"
    print(f"  [{platform}][{category}] {rank:2d}. {title_ko} → tmdb_id={tmdb_id} {poster_status}")
