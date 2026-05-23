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
        SELECT date, platform, category, rank, title_ko, title_en, score
        FROM rankings
        WHERE date = ?
        ORDER BY platform, category, rank
    """, (TODAY,)).fetchall()
    conn.close()

    lines = []
    for row in rows:
        date, platform, category, rank, title_ko, title_en, score = row
        # SQL injection 방지: 작은따옴표 이스케이프
        title_ko = title_ko.replace("'", "''")
        title_en = title_en.replace("'", "''") if title_en else ""
        lines.append(
            f"INSERT OR REPLACE INTO rankings (date, platform, category, rank, title_ko, title_en, score) "
            f"VALUES ('{date}', '{platform}', '{category}', {rank}, '{title_ko}', '{title_en}', {score});"
        )

    with open(SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"✅ {len(lines)}개 SQL 생성 완료 → {SQL_PATH}")

if __name__ == "__main__":
    export()
