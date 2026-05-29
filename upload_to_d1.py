"""
rankings.db → Cloudflare D1 직접 업로드 v2
────────────────────────────────────────────────────────────────
wrangler-action 대신 D1 REST API를 직접 호출하여 안정성 향상
SQL을 배치(batch)로 나눠서 업로드 (D1 API 한 번에 최대 10MB 제한 대응)

업로드 대상:
  1. rankings  — 오늘 날짜 데이터
  2. works     — 신규 작품만 INSERT (ON CONFLICT DO NOTHING)
  3. review_queue — 오늘 날짜 매칭 실패 항목
  4. title_map — 전체 upsert
────────────────────────────────────────────────────────────────
"""
import sqlite3
import requests
import os
import time
from datetime import datetime, timezone, timedelta

KST      = timezone(timedelta(hours=9))
TODAY    = datetime.now(KST).strftime("%Y-%m-%d")
DB_PATH  = "rankings.db"

# Cloudflare D1 REST API 설정
CF_ACCOUNT_ID  = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN   = os.environ.get("CLOUDFLARE_API_TOKEN", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

D1_API_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/"
    f"{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
)

BATCH_SIZE = 50  # D1 API 한 번에 보낼 SQL 구문 수


def d1_execute(sql: str, params: list = None) -> dict:
    """D1 REST API로 단일 SQL 실행"""
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    body = {"sql": sql}
    if params:
        body["params"] = params

    resp = requests.post(D1_API_URL, headers=headers, json=body, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"D1 API 오류: {resp.status_code} {resp.text[:300]}")

    data = resp.json()
    if not data.get("success"):
        raise Exception(f"D1 쿼리 실패: {data}")

    return data


def d1_batch(sql_list: list[str]) -> int:
    """
    SQL 목록을 BATCH_SIZE 단위로 나눠서 D1에 업로드
    반환: 성공한 SQL 수
    """
    success = 0
    for i in range(0, len(sql_list), BATCH_SIZE):
        batch = sql_list[i:i + BATCH_SIZE]
        # D1은 여러 SQL을 세미콜론으로 구분해서 한 번에 실행 가능
        combined = "\n".join(batch)
        try:
            d1_execute(combined)
            success += len(batch)
        except Exception as e:
            print(f"  ⚠️ 배치 업로드 실패 (offset={i}): {e}")
            # 실패한 배치는 1개씩 재시도
            for sql in batch:
                try:
                    d1_execute(sql)
                    success += 1
                except Exception as e2:
                    print(f"  ⚠️ 단일 SQL 실패: {e2}\n    SQL: {sql[:100]}")
        time.sleep(0.1)  # API rate limit 방지

    return success


def esc(v) -> str:
    """SQL 문자열 이스케이프"""
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def upload_rankings(conn: sqlite3.Connection) -> int:
    """rankings 오늘 날짜 데이터 D1 업로드
    ⚠️ is_active=0 인 카테고리는 업로드 제외
    """
    rows = conn.execute("""
        SELECT r.date, r.platform, r.category, r.category_slot, r.source_name, r.rank,
               r.title_ko, r.title_en, r.score, r.tmdb_id, r.poster_path,
               r.genre, r.overview, r.release_year, r.tmdb_rating, r.is_manual
        FROM rankings r
        LEFT JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.date = ?
        AND (oc.is_active IS NULL OR oc.is_active = 1)
        ORDER BY r.platform, r.category_slot, r.rank
    """, (TODAY,)).fetchall()

    sql_list = []
    for row in rows:
        (date, platform, category, category_slot, source_name, rank,
         title_ko, title_en, score, tmdb_id, poster_path,
         genre, overview, release_year, tmdb_rating, is_manual) = row
        sql_list.append(
            f"INSERT OR REPLACE INTO rankings "
            f"(date, platform, category, category_slot, source_name, rank, "
            f"title_ko, title_en, score, tmdb_id, poster_path, "
            f"genre, overview, release_year, tmdb_rating, is_manual) "
            f"VALUES ({esc(date)}, {esc(platform)}, {esc(category)}, "
            f"{esc(category_slot)}, {esc(source_name)}, {rank}, "
            f"{esc(title_ko)}, {esc(title_en)}, {score or 0}, "
            f"{tmdb_id if tmdb_id else 'NULL'}, "
            f"{esc(poster_path) if poster_path else 'NULL'}, "
            f"{esc(genre) if genre else 'NULL'}, "
            f"{esc(overview) if overview else 'NULL'}, "
            f"{release_year if release_year else 'NULL'}, "
            f"{tmdb_rating if tmdb_rating else 'NULL'}, "
            f"{is_manual or 0});"
        )

    if not sql_list:
        print(f"  rankings: 0개 (오늘 날짜 데이터 없음)")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ rankings: {success}/{len(sql_list)}개 업로드")
    return success


def upload_works(conn: sqlite3.Connection) -> int:
    """
    works 신규 작품 D1 업로드
    ⚠️ ON CONFLICT DO NOTHING — Admin 수동 데이터 절대 덮어쓰기 금지
    """
    try:
        rows = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating,
                   match_source, confidence_score
            FROM works
            WHERE tmdb_id IS NOT NULL
            ORDER BY tmdb_id
        """).fetchall()
    except Exception:
        rows = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating,
                   'admin' as match_source, 100 as confidence_score
            FROM works
            WHERE tmdb_id IS NOT NULL
            ORDER BY tmdb_id
        """).fetchall()

    sql_list = []
    for row in rows:
        (tmdb_id, title_ko, title_en, poster_path,
         genre, overview, release_year, tmdb_rating,
         match_source, confidence_score) = row
        sql_list.append(
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
        )

    if not sql_list:
        print(f"  works: 0개")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ works: {success}/{len(sql_list)}개 업로드")
    return success


def upload_review_queue(conn: sqlite3.Connection) -> int:
    """review_queue 오늘 날짜 pending 항목 D1 업로드"""
    try:
        rows = conn.execute("""
            SELECT platform, category_slot, rank, title_en,
                   title_ko_guess, tmdb_search_tried, fail_reason,
                   crawled_date, status
            FROM review_queue
            WHERE crawled_date = ? AND status = 'pending'
            ORDER BY platform, category_slot, rank
        """, (TODAY,)).fetchall()
    except Exception:
        print(f"  review_queue: 0개 (테이블 없음)")
        return 0

    sql_list = []
    for row in rows:
        (platform, category_slot, rank, title_en,
         title_ko_guess, tmdb_search_tried, fail_reason,
         crawled_date, status) = row
        sql_list.append(
            f"INSERT OR IGNORE INTO review_queue "
            f"(platform, category_slot, rank, title_en, "
            f"title_ko_guess, tmdb_search_tried, fail_reason, "
            f"crawled_date, status) "
            f"VALUES ({esc(platform)}, {esc(category_slot)}, {rank}, "
            f"{esc(title_en)}, {esc(title_ko_guess)}, "
            f"{esc(tmdb_search_tried)}, {esc(fail_reason)}, "
            f"{esc(crawled_date)}, {esc(status)});"
        )

    if not sql_list:
        print(f"  review_queue: 0개")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ review_queue: {success}/{len(sql_list)}개 업로드")
    return success


def upload_title_map(conn: sqlite3.Connection) -> int:
    """title_map 전체 D1 업로드"""
    try:
        rows = conn.execute("""
            SELECT title_en, title_ko, tmdb_id
            FROM title_map
            WHERE title_en IS NOT NULL
            ORDER BY id
        """).fetchall()
    except Exception:
        print(f"  title_map: 0개 (테이블 없음)")
        return 0

    sql_list = []
    for row in rows:
        title_en, title_ko, tmdb_id = row
        sql_list.append(
            f"INSERT OR REPLACE INTO title_map "
            f"(title_en, title_ko, tmdb_id) "
            f"VALUES ({esc(title_en)}, {esc(title_ko)}, "
            f"{tmdb_id if tmdb_id else 'NULL'});"
        )

    if not sql_list:
        print(f"  title_map: 0개")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ title_map: {success}/{len(sql_list)}개 업로드")
    return success


def upload():
    """전체 D1 업로드 실행"""

    if not CF_ACCOUNT_ID or not CF_API_TOKEN or not D1_DATABASE_ID:
        print("⚠️  Cloudflare 환경변수 없음 — D1 업로드 스킵")
        return

    print(f"\n[D1 업로드] {TODAY} 데이터 업로드 시작...")

    conn = sqlite3.connect(DB_PATH)

    try:
        upload_rankings(conn)
        upload_works(conn)
        upload_review_queue(conn)
        upload_title_map(conn)
    except Exception as e:
        print(f"  ⚠️ 업로드 중 오류: {e}")
        raise
    finally:
        conn.close()

    print("[D1 업로드] 완료!\n")


if __name__ == "__main__":
    upload()
