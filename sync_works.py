"""
D1 데이터 → 로컬 rankings.db 동기화 v2
────────────────────────────────────────────────────────────────
크롤링 전에 반드시 실행 (daily_crawl.yml에서 제거 절대 금지!)

동기화 대상:
  1. works        — Admin 수동 저장 데이터 보호 (핵심!)
  2. ott_categories — 슬롯 설정 (크롤러가 읽어야 함, 신규 추가)
  3. title_map    — 영어↔한글 매핑 (기존 유지)

⚠️ 주의사항:
  - D1_DATABASE_ID Secret 없으면 sync 스킵 → Admin 수정 데이터 날아감!
  - 이 파일을 daily_crawl.yml에서 절대 제거하지 말 것
────────────────────────────────────────────────────────────────
"""
import sqlite3
import requests
import os

DB_PATH = "rankings.db"

# Cloudflare D1 REST API 설정
CF_ACCOUNT_ID  = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN   = os.environ.get("CLOUDFLARE_API_TOKEN", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

D1_API_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/"
    f"{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
)


def d1_query(sql: str, params: list = None) -> list:
    """D1 REST API로 SQL 실행 후 결과 반환"""
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    body = {"sql": sql}
    if params:
        body["params"] = params

    resp = requests.post(D1_API_URL, headers=headers, json=body, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"D1 API 오류: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    if not data.get("success"):
        raise Exception(f"D1 쿼리 실패: {data}")

    return data["result"][0].get("results", [])


def _ensure_local_tables(conn: sqlite3.Connection):
    """로컬 DB에 필요한 테이블이 없으면 생성"""

    # ott_categories 테이블 (신규)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ott_categories (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            platform       TEXT    NOT NULL,
            category_slot  TEXT    NOT NULL,
            table_index    INTEGER NOT NULL DEFAULT 0,
            source_name    TEXT    NOT NULL,
            display_name   TEXT,
            crawl_limit    INTEGER NOT NULL DEFAULT 20,
            main_limit     INTEGER NOT NULL DEFAULT 10,
            platform_limit INTEGER NOT NULL DEFAULT 20,
            is_active      INTEGER NOT NULL DEFAULT 1,
            UNIQUE(platform, category_slot)
        )
    """)

    # works 테이블 (match_source, confidence_score 컬럼 추가 마이그레이션)
    for col_sql in [
        "ALTER TABLE works ADD COLUMN match_source TEXT DEFAULT 'admin'",
        "ALTER TABLE works ADD COLUMN confidence_score INTEGER DEFAULT 100",
    ]:
        try:
            conn.execute(col_sql)
        except Exception:
            pass  # 이미 존재하면 무시

    conn.commit()


def sync_works(conn: sqlite3.Connection):
    """
    D1 works → 로컬 동기화
    ⚠️ 핵심: Admin이 수동 저장한 데이터(confidence_score=100)를 로컬에 반영
    크롤러가 덮어쓰지 못하도록 보호
    """
    print("  D1 → 로컬: works 동기화 중...")
    try:
        rows = d1_query("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating,
                   match_source, confidence_score
            FROM works
            WHERE tmdb_id IS NOT NULL
        """)

        count = 0
        d1_tmdb_ids = []  # D1에 있는 tmdb_id 목록

        for row in rows:
            d1_tmdb_ids.append(row["tmdb_id"])
            conn.execute("""
                INSERT INTO works
                    (tmdb_id, title_ko, title_en, poster_path,
                     genre, overview, release_year, tmdb_rating,
                     match_source, confidence_score, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
                ON CONFLICT(tmdb_id) DO UPDATE SET
                    title_ko         = CASE WHEN excluded.title_ko != '' THEN excluded.title_ko ELSE title_ko END,
                    title_en         = CASE WHEN excluded.title_en != '' THEN excluded.title_en ELSE title_en END,
                    poster_path      = COALESCE(excluded.poster_path, poster_path),
                    genre            = COALESCE(excluded.genre, genre),
                    overview         = COALESCE(excluded.overview, overview),
                    release_year     = COALESCE(excluded.release_year, release_year),
                    tmdb_rating      = COALESCE(excluded.tmdb_rating, tmdb_rating),
                    match_source     = excluded.match_source,
                    confidence_score = excluded.confidence_score,
                    updated_at       = datetime('now','localtime')
            """, (
                row["tmdb_id"],
                row["title_ko"] or "",
                row["title_en"] or "",
                row["poster_path"],
                row["genre"],
                row["overview"],
                row["release_year"],
                row["tmdb_rating"],
                row.get("match_source", "admin"),
                row.get("confidence_score", 100),
            ))
            count += 1

        # ⚠️ 핵심: D1에서 삭제된 항목은 로컬에서도 삭제
        # Admin이 D1에서 잘못된 works를 삭제하면 로컬에서도 반드시 삭제
        if d1_tmdb_ids:
            placeholders = ','.join('?' * len(d1_tmdb_ids))
            deleted = conn.execute(f"""
                DELETE FROM works
                WHERE tmdb_id NOT IN ({placeholders})
            """, d1_tmdb_ids).rowcount
            if deleted > 0:
                print(f"  🗑️ 로컬 works 정리: D1에 없는 {deleted}개 삭제")

        conn.commit()
        print(f"  ✅ works 동기화 완료: {count}개")

    except Exception as e:
        print(f"  ⚠️  works 동기화 실패: {e}")


def sync_ott_categories(conn: sqlite3.Connection):
    """
    D1 ott_categories → 로컬 동기화 (신규 추가)
    크롤러가 ott_categories에서 슬롯 설정(table_index, crawl_limit 등)을 읽어야 함
    이 동기화 없으면 flixpatrol_base.py가 슬롯 설정을 못 읽어서 크롤링 실패!
    """
    print("  D1 → 로컬: ott_categories 동기화 중...")
    try:
        rows = d1_query("""
            SELECT platform, category_slot, table_index, source_name,
                   display_name, crawl_limit, main_limit, platform_limit, is_active
            FROM ott_categories
            ORDER BY platform, category_slot
        """)

        # ⚠️ 전체 삭제 후 재삽입
        # rankings.db에 캐시된 구버전 설정(is_active 등)을 완전히 교체
        conn.execute("DELETE FROM ott_categories")
        conn.commit()

        count = 0
        for row in rows:
            conn.execute("""
                INSERT INTO ott_categories
                    (platform, category_slot, table_index, source_name,
                     display_name, crawl_limit, main_limit, platform_limit, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row["platform"],
                row["category_slot"],
                row["table_index"],
                row["source_name"],
                row["display_name"],
                row["crawl_limit"],
                row["main_limit"],
                row["platform_limit"],
                row["is_active"],
            ))
            count += 1

        conn.commit()
        print(f"  ✅ ott_categories 동기화 완료: {count}개 (전체 교체)")

    except Exception as e:
        print(f"  ⚠️  ott_categories 동기화 실패: {e}")


def sync_title_map(conn: sqlite3.Connection):
    """D1 title_map → 로컬 동기화 (기존 유지)"""
    print("  D1 → 로컬: title_map 동기화 중...")
    try:
        rows = d1_query("""
            SELECT title_en, title_ko, tmdb_id
            FROM title_map
            WHERE title_en IS NOT NULL
        """)

        count = 0
        for row in rows:
            conn.execute("""
                INSERT OR REPLACE INTO title_map (title_en, title_ko, tmdb_id)
                VALUES (?, ?, ?)
            """, (row["title_en"], row["title_ko"], row["tmdb_id"]))
            count += 1

        conn.commit()
        print(f"  ✅ title_map 동기화 완료: {count}개")

    except Exception as e:
        print(f"  ⚠️  title_map 동기화 실패: {e}")


def sync():
    """전체 동기화 실행"""

    # 환경변수 체크
    if not CF_ACCOUNT_ID or not CF_API_TOKEN or not D1_DATABASE_ID:
        print("⚠️  Cloudflare 환경변수 없음 — sync_works 스킵")
        print("   (D1_DATABASE_ID Secret이 설정되어 있는지 확인하세요)")
        return

    print("\n[sync_works] D1 → 로컬 동기화 시작...")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        # 로컬 테이블 준비
        _ensure_local_tables(conn)

        # 1. works 동기화 (Admin 수동 데이터 보호 — 핵심!)
        sync_works(conn)

        # 2. ott_categories 동기화 (신규 — 크롤러 슬롯 설정)
        sync_ott_categories(conn)

        # 3. title_map 동기화 (기존 유지)
        sync_title_map(conn)

    except Exception as e:
        print(f"  ⚠️  동기화 중 오류: {e}")
    finally:
        conn.close()

    print("[sync_works] 동기화 완료!\n")


if __name__ == "__main__":
    sync()
