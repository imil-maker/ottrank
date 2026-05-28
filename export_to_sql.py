"""
rankings.db → rankings_insert.sql 변환 (D1 업로드용) v2
────────────────────────────────────────────────────────────────
변경사항:
  - rankings: category → category_slot, source_name 으로 변경
  - works: match_source, confidence_score 컬럼 추가
  - review_queue: 신규 추가 (Admin 검토 큐 D1에 업로드)
  - title_map: 기존 유지
────────────────────────────────────────────────────────────────
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

    # ── 1. rankings (오늘 날짜, category_slot 방식) ──────────
    rows = conn.execute("""
        SELECT date, platform, category_slot, source_name, rank,
               title_ko, title_en, score, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, is_manual
        FROM rankings
        WHERE date = ?
        ORDER BY platform, category_slot, rank
    """, (TODAY,)).fetchall()

    for row in rows:
        (date, platform, category_slot, source_name, rank,
         title_ko, title_en, score, tmdb_id, poster_path,
         genre, overview, release_year, tmdb_rating, is_manual) = row
        lines.append(
            f"INSERT OR REPLACE INTO rankings "
            f"(date, platform, category_slot, source_name, rank, "
            f"title_ko, title_en, score, tmdb_id, poster_path, "
            f"genre, overview, release_year, tmdb_rating, is_manual) "
            f"VALUES ({esc(date)}, {esc(platform)}, {esc(category_slot)}, "
            f"{esc(source_name)}, {rank}, "
            f"{esc(title_ko)}, {esc(title_en)}, {score or 0}, "
            f"{tmdb_id if tmdb_id else 'NULL'}, "
            f"{esc(poster_path) if poster_path else 'NULL'}, "
            f"{esc(genre) if genre else 'NULL'}, "
            f"{esc(overview) if overview else 'NULL'}, "
            f"{release_year if release_year else 'NULL'}, "
            f"{tmdb_rating if tmdb_rating else 'NULL'}, "
            f"{is_manual or 0});"
        )
    print(f"  rankings: {len(rows)}개")

    # ── 2. works (전체 upsert, match_source/confidence_score 포함) ──
    try:
        works_rows = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating,
                   match_source, confidence_score
            FROM works
            WHERE tmdb_id IS NOT NULL
            ORDER BY tmdb_id
        """).fetchall()
    except Exception:
        # confidence_score 컬럼 없는 구버전 호환
        works_rows = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating,
                   'admin' as match_source, 100 as confidence_score
            FROM works
            WHERE tmdb_id IS NOT NULL
            ORDER BY tmdb_id
        """).fetchall()

    for row in works_rows:
        (tmdb_id, title_ko, title_en, poster_path,
         genre, overview, release_year, tmdb_rating,
         match_source, confidence_score) = row
        lines.append(
            f"INSERT INTO works "
            f"(tmdb_id, title_ko, title_en, poster_path, "
            f"genre, overview, release_year, tmdb_rating, "
            f"match_source, confidence_score, updated_at) "
            f"VALUES ({tmdb_id}, {esc(title_ko)}, {esc(title_en)}, "
            f"{esc(poster_path) if poster_path else 'NULL'}, "
            f"{esc(genre) if genre else 'NULL'}, "
            f"{esc(overview) if overview else 'NULL'}, "
            f"{release_year if release_year else 'NULL'}, "
            f"{tmdb_rating if tmdb_rating else 'NULL'}, "
            f"{esc(match_source or 'admin')}, "
            f"{confidence_score or 100}, "
            f"datetime('now')) "
            f"ON CONFLICT(tmdb_id) DO NOTHING;"
            # ⚠️ works는 D1에서 ON CONFLICT DO NOTHING
            # Admin이 수동 저장한 데이터(confidence_score=100) 절대 덮어쓰기 금지
        )
    print(f"  works: {len(works_rows)}개")

    # ── 3. review_queue (오늘 날짜 pending 항목) ─────────────
    try:
        queue_rows = conn.execute("""
            SELECT platform, category_slot, rank, title_en,
                   title_ko_guess, tmdb_search_tried, fail_reason,
                   crawled_date, status
            FROM review_queue
            WHERE crawled_date = ? AND status = 'pending'
            ORDER BY platform, category_slot, rank
        """, (TODAY,)).fetchall()

        for row in queue_rows:
            (platform, category_slot, rank, title_en,
             title_ko_guess, tmdb_search_tried, fail_reason,
             crawled_date, status) = row
            lines.append(
                f"INSERT OR IGNORE INTO review_queue "
                f"(platform, category_slot, rank, title_en, "
                f"title_ko_guess, tmdb_search_tried, fail_reason, "
                f"crawled_date, status) "
                f"VALUES ({esc(platform)}, {esc(category_slot)}, {rank}, "
                f"{esc(title_en)}, {esc(title_ko_guess)}, "
                f"{esc(tmdb_search_tried)}, {esc(fail_reason)}, "
                f"{esc(crawled_date)}, {esc(status)});"
            )
        print(f"  review_queue: {len(queue_rows)}개")
    except Exception as e:
        queue_rows = []
        print(f"  review_queue: 0개 ({e})")

    # ── 4. title_map (전체 upsert, 기존 유지) ────────────────
    try:
        map_rows = conn.execute("""
            SELECT title_en, title_ko, tmdb_id
            FROM title_map
            WHERE title_en IS NOT NULL
            ORDER BY id
        """).fetchall()

        for row in map_rows:
            title_en, title_ko, tmdb_id = row
            lines.append(
                f"INSERT OR REPLACE INTO title_map "
                f"(title_en, title_ko, tmdb_id) "
                f"VALUES ({esc(title_en)}, {esc(title_ko)}, "
                f"{tmdb_id if tmdb_id else 'NULL'});"
            )
        print(f"  title_map: {len(map_rows)}개")
    except Exception as e:
        map_rows = []
        print(f"  title_map: 0개 ({e})")

    conn.close()

    with open(SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    total = len(rows) + len(works_rows) + len(queue_rows) + len(map_rows)
    print(f"✅ 총 {total}개 SQL 생성 완료 → {SQL_PATH}")


if __name__ == "__main__":
    export()
