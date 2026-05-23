import sqlite3
import requests
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"

def search_tmdb(title_ko, title_en=""):
    queries = [q for q in [title_ko, title_en] if q]
    for query in queries:
        for media_type in ["tv", "movie"]:
            try:
                url = f"{TMDB_PROXY}/search/{media_type}"
                resp = requests.get(url, params={"query": query, "language": "ko-KR"}, timeout=10)
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        return results[0].get("id"), results[0].get("poster_path")
            except Exception as e:
                print(f"TMDB 오류 ({query}): {e}")
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
            tmdb_id     INTEGER,
            poster_path TEXT,
            UNIQUE(date, platform, category, rank)
        )
    """)
    conn.commit()
    return conn

def save(conn, platform, category, rank, title_ko, title_en="", score=0.0):
    today = get_today()
    tmdb_id, poster_path = search_tmdb(title_ko, title_en)
    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path))
    conn.commit()
    print(f"  [{platform}][{category}] {rank:2d}. {title_ko} → tmdb_id={tmdb_id}")
