import sqlite3
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"

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
            UNIQUE(date, platform, category, rank)
        )
    """)
    conn.commit()
    return conn

def save(conn, platform, category, rank, title_ko, title_en="", score=0.0):
    today = get_today()
    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko, title_en, score))
    conn.commit()
    print(f"  [{platform}][{category}] {rank:2d}. {title_ko}")
