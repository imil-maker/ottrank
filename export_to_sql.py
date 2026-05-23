"""rankings.db → rankings_insert.sql 변환 (D1 업로드용)"""
import sqlite3
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime("%Y-%m-%d")
DB_PATH = "rankings.db"
SQL_PATH = "rankings_insert.sql"

def export():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("""
        SELECT date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path
        FROM rankings
        WHERE date = ?
        ORDER BY platform, category, rank
    """, (TODAY,)).fetchall()
    conn.close()

    lines = []
    for row in rows:
        date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path = row
        title_ko = title_ko.replace("'", "''")
        title_en = title_en.replace("'", "''") if title_en else ""
        poster_path = poster_path.replace("'", "''") if poster_path else ""
        tmdb_id_val = tmdb_id if tmdb_id else "NULL"
        poster_val = f"'{poster_path}'" if poster_path else "NULL"
        lines.append(
            f"INSERT OR REPLACE INTO rankings "
            f"(date, platform, category, rank, title_ko, title_en, score, tmdb_id, poster_path) "
            f"VALUES ('{date}', '{platform}', '{category}', {rank}, '{title_ko}', '{title_en}', {score}, {tmdb_id_val}, {poster_val});"
        )

    with open(SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"✅ {len(lines)}개 SQL 생성 완료 → {SQL_PATH}")

if __name__ == "__main__":
    export()
