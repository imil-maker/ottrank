"""rankings.db → rankings_insert.sql 변환 (D1 업로드용)
   rankings (오늘 날짜) + works (전체) + title_map (전체) export
"""
import sqlite3
from datetime import datetime, timezone, timedelta

KST      = timezone(timedelta(hours=9))
TODAY    = datetime.now(KST).strftime("%Y-%m-%d")
DB_PATH  = "rankings.db"
SQL_PATH = "rankings_insert.sql"

def esc(v):
    """SQL 문자열 이스케이프"""
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def export():
    conn = sqlite3.connect(DB_PATH)
    lines = []

    # ── 1. rankings (오늘 날짜) ──────────────────────────────
    rows = conn.execute("""
        SELECT date, platform, category, rank,
               title_ko, title_en, score, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, is_manual
        FROM rankings
        WHERE date = ?
        ORDER BY platform, category, rank
    """, (TODAY,)).fetchall()

    for row in rows:
        (date, platform, category, rank,
         title_ko, title_en, score, tmdb_id, poster_path,
         genre, overview, release_year, tmdb_rating, is_manual) = row
        lines.append(
            f"INSERT OR REPLACE INTO rankings "
            f"(date, platform, category, rank, title_ko, title_en, score, "
            f"tmdb_id, poster_path, genre, overview, release_year, tmdb_rating, is_manual) "
            f"VALUES ({esc(date)}, {esc(platform)}, {esc(category)}, {rank}, "
            f"{esc(title_ko)}, {esc(title_en)}, {score or 0}, "
            f"{tmdb_id if tmdb_id else 'NULL'}, {esc(poster_path) if poster_path else 'NULL'}, "
            f"{esc(genre) if genre else 'NULL'}, {esc(overview) if overview else 'NULL'}, "
            f"{release_year if release_year else 'NULL'}, "
            f"{tmdb_rating if tmdb_rating else 'NULL'}, "
            f"{is_manual or 0});"
        )
    print(f"  rankings: {len(rows)}개")

    # ── 2. works (전체 upsert) ───────────────────────────────
    works_rows = conn.execute("""
        SELECT tmdb_id, category, title_ko, title_en, poster_path,
               genre, overview, release_year, tmdb_rating
        FROM works
        WHERE tmdb_id IS NOT NULL
        ORDER BY tmdb_id
    """).fetchall()

    for row in works_rows:
        (tmdb_id, category, title_ko, title_en, poster_path,
         genre, overview, release_year, tmdb_rating) = row
        lines.append(
            f"INSERT OR REPLACE INTO works "
            f"(tmdb_id, category, title_ko, title_en, poster_path, "
            f"genre, overview, release_year, tmdb_rating, updated_at) "
            f"VALUES ({tmdb_id}, {esc(category)}, {esc(title_ko)}, {esc(title_en)}, "
            f"{esc(poster_path) if poster_path else 'NULL'}, "
            f"{esc(genre) if genre else 'NULL'}, {esc(overview) if overview else 'NULL'}, "
            f"{release_year if release_year else 'NULL'}, "
            f"{tmdb_rating if tmdb_rating else 'NULL'}, "
            f"datetime('now'));"
        )
    print(f"  works: {len(works_rows)}개")

    # ── 3. title_map (전체 upsert) ───────────────────────────
    try:
        map_rows = conn.execute("""
            SELECT title_en, title_ko, tmdb_id, category
            FROM title_map
            WHERE title_en IS NOT NULL
            ORDER BY id
        """).fetchall()

        for row in map_rows:
            title_en, title_ko, tmdb_id, category = row
            lines.append(
                f"INSERT OR REPLACE INTO title_map "
                f"(title_en, title_ko, tmdb_id, category) "
                f"VALUES ({esc(title_en)}, {esc(title_ko)}, "
                f"{tmdb_id if tmdb_id else 'NULL'}, {esc(category)});"
            )
        print(f"  title_map: {len(map_rows)}개")
    except Exception as e:
        map_rows = []
        print(f"  title_map: 0개 (테이블 없음 — 스킵)")

    conn.close()

    with open(SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    total = len(rows) + len(works_rows) + len(map_rows)
    print(f"✅ 총 {total}개 SQL 생성 완료 → {SQL_PATH}")

if __name__ == "__main__":
    export()
