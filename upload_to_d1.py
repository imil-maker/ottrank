"""
2026-07-28 rev.1 — upload_to_d1.py (티빙 자동 업로드/날짜고정 제외, 수동 관리로 전환)
rankings.db → Cloudflare D1 직접 업로드 v2
────────────────────────────────────────────────────────────────
wrangler-action 대신 D1 REST API를 직접 호출하여 안정성 향상
SQL을 배치(batch)로 나눠서 업로드 (D1 API 한 번에 최대 10MB 제한 대응)

업로드 대상:
  1. rankings  — 오늘 날짜 데이터
  2. works     — 신규 작품 INSERT + tmdb_rating 항상 최신화
  3. boxoffice_stats — 오늘 날짜 KOBIS 관객수/매출 등 상세 지표 (2026-07-18 신설)
  4. review_queue — 오늘 날짜 매칭 실패 항목
  5. title_map — 전체 upsert
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


def _get_pinned_from_d1() -> dict:
    """
    D1에서 is_manual=2 (날짜고정) 목록 조회 — 날짜 무관 전체 조회
    반환: { (platform, tmdb_id): row_dict, ... }

    ⚠️ 핵심 용도:
      1. 크롤링 결과 업로드 시 is_manual=2 작품 덮어쓰기 방지 (skip)
      2. 오늘 날짜로 is_manual=2 복사 시 중복 방지
    """
    try:
        data = d1_execute("""
            SELECT date, platform, category, category_slot, source_name, rank,
                   title_ko, title_en, score, tmdb_id, poster_path,
                   genre, overview, release_year, tmdb_rating, is_manual
            FROM rankings
            WHERE is_manual = 2
            AND platform != 'tving'
            ORDER BY platform, category_slot, rank
        """)
        rows = data["result"][0].get("results", [])

        # (platform, tmdb_id) 를 키로 딕셔너리 생성
        # tmdb_id 가 없는 행은 제외 (보호 대상 아님)
        pinned = {}
        for r in rows:
            if r.get("tmdb_id"):
                key = (r["platform"], r["tmdb_id"])
                # 같은 작품이 여러 날짜에 있으면 가장 최신 날짜 것으로 유지
                if key not in pinned or r["date"] > pinned[key]["date"]:
                    pinned[key] = r

        print(f"  📌 D1 날짜고정(is_manual=2) 조회: {len(pinned)}개")
        return pinned

    except Exception as e:
        print(f"  ⚠️ is_manual=2 조회 실패: {e} — 날짜고정 보호 스킵")
        return {}


def _copy_pinned_to_today(pinned: dict) -> int:
    """
    is_manual=2 작품을 오늘 날짜로 복사
    → 오늘 날짜로 이미 있으면 skip (중복 방지)
    → 없으면 오늘 날짜로 INSERT (rank, is_manual=2 유지)
    → "며칠간 TOP10" 집계에 오늘 날짜 데이터가 필요하기 때문
    """
    if not pinned:
        return 0

    # 오늘 날짜로 이미 존재하는 is_manual=2 tmdb_id 세트 조회
    try:
        data = d1_execute(f"""
            SELECT platform, tmdb_id
            FROM rankings
            WHERE is_manual = 2
            AND date = '{TODAY}'
        """)
        already_today = {
            (r["platform"], r["tmdb_id"])
            for r in data["result"][0].get("results", [])
            if r.get("tmdb_id")
        }
    except Exception as e:
        print(f"  ⚠️ 오늘 날짜 is_manual=2 조회 실패: {e}")
        already_today = set()

    sql_list = []
    for (platform, tmdb_id), r in pinned.items():
        # 오늘 날짜로 이미 있으면 skip
        if (platform, tmdb_id) in already_today:
            continue

        sql_list.append(
            f"INSERT INTO rankings "
            f"(date, platform, category, category_slot, source_name, rank, "
            f"title_ko, title_en, score, tmdb_id, poster_path, "
            f"genre, overview, release_year, tmdb_rating, is_manual) "
            f"VALUES ({esc(TODAY)}, {esc(r['platform'])}, {esc(r['category'])}, "
            f"{esc(r['category_slot'])}, {esc(r.get('source_name'))}, {r['rank']}, "
            f"{esc(r['title_ko'])}, {esc(r.get('title_en', ''))}, {r.get('score') or 0}, "
            f"{r['tmdb_id']}, "
            f"{esc(r['poster_path']) if r.get('poster_path') else 'NULL'}, "
            f"{esc(r['genre']) if r.get('genre') else 'NULL'}, "
            f"{esc(r['overview']) if r.get('overview') else 'NULL'}, "
            f"{r['release_year'] if r.get('release_year') else 'NULL'}, "
            f"{r['tmdb_rating'] if r.get('tmdb_rating') else 'NULL'}, "
            f"2);"  # is_manual=2 유지
        )

    if not sql_list:
        print(f"  📌 날짜고정 복사: 0개 (오늘 날짜로 이미 모두 존재)")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ 날짜고정 복사: {success}/{len(sql_list)}개 → 오늘({TODAY}) 날짜로 복사")
    return success


def upload_rankings(conn: sqlite3.Connection) -> int:
    """rankings 오늘 날짜 데이터 D1 업로드
    ⚠️ is_active=0 인 카테고리는 업로드 제외
    ⚠️ [2026-07-28 추가] 티빙(tving)은 자동 업로드 대상에서 완전 제외 — 수동 관리 전환
    ⚠️ is_manual=2 (날짜고정) 작품 보호 로직:
       1. 같은 platform + tmdb_id 로 is_manual=2 있으면 작품 자체 skip
       2. is_manual=2 없는 빈 rank 자리에 순서대로 배치
       3. is_manual=2 오늘 날짜로 복사 (며칠간 TOP10 집계용)
    """
    from collections import defaultdict

    # ── STEP 1. D1에서 is_manual=2 목록 조회 ──────────────────
    pinned = _get_pinned_from_d1()

    # pinned_tmdb_ids: 작품 skip용 { (platform, tmdb_id) }
    # pinned_ranks_by_slot: 고정된 rank 자리 { (platform, category_slot): {rank, ...} }
    pinned_tmdb_ids      = set()
    pinned_ranks_by_slot = defaultdict(set)

    for (platform, tmdb_id), r in pinned.items():
        pinned_tmdb_ids.add((platform, tmdb_id))
        pinned_ranks_by_slot[(r["platform"], r["category_slot"])].add(r["rank"])

    # ── STEP 2. is_manual=2 오늘 날짜로 복사 ──────────────────
    # 오늘 날짜로 없는 것만 복사 (며칠간 TOP10 집계용)
    _copy_pinned_to_today(pinned)

    # ── STEP 3. 로컬 크롤링 결과 조회 ─────────────────────────
    # ⚠️ 2026-07-11 수정: poster_path를 works 테이블에서 우선 가져오도록 변경
    # 기존엔 그날 크롤링이 직접 찾은 r.poster_path를 그대로 썼는데, 크롤링이
    # tmdb_id 매칭은 성공했지만 포스터만 못 찾은 경우(가끔 발생) rankings에
    # NULL로 저장되고, 관리자가 works에서 수동으로 포스터를 채워도 다음
    # 크롤링 때 INSERT OR REPLACE로 다시 통째로 덮어써서 사라지는 문제가 있었음.
    # works는 daily_crawl.yml의 "D1 → 로컬 동기화" 단계에서 이미 로컬에
    # 최신 상태로 내려와 있으므로, 추가 D1 요청 없이 로컬 JOIN만으로 해결
    # 가능. works.poster_path가 있으면 그걸 우선 쓰고, 없을 때만(신규 작품 등)
    # 그날 크롤링 값으로 폴백.
    rows = conn.execute("""
        SELECT r.date, r.platform, r.category, r.category_slot, r.source_name, r.rank,
               r.title_ko, r.title_en, r.score, r.tmdb_id,
               COALESCE(w.poster_path, r.poster_path) AS poster_path,
               r.genre, r.overview, r.release_year, r.tmdb_rating, r.is_manual
        FROM rankings r
        LEFT JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        LEFT JOIN works w
            ON r.tmdb_id = w.tmdb_id
        WHERE r.date = ?
        AND (oc.is_active IS NULL OR oc.is_active = 1)
        AND r.platform != 'tving'
        ORDER BY r.platform, r.category_slot, r.rank
    """, (TODAY,)).fetchall()

    # ── STEP 4. 플랫폼+카테고리별로 그룹화 ───────────────────
    slot_rows = defaultdict(list)
    for row in rows:
        platform_     = row[1]
        category_slot_ = row[3]
        slot_rows[(platform_, category_slot_)].append(row)

    sql_list   = []
    skip_count = 0

    for (platform, category_slot), slot_data in slot_rows.items():
        # 이 슬롯의 고정된 rank 자리
        fixed_ranks = pinned_ranks_by_slot.get((platform, category_slot), set())

        # ── STEP 5. is_manual=2 tmdb_id 인 작품 skip ──────────
        # 고정 작품은 이미 _copy_pinned_to_today() 에서 D1에 저장됨
        filtered = []
        for row in slot_data:
            (date, platform_, category, category_slot_, source_name, rank,
             title_ko, title_en, score, tmdb_id, poster_path,
             genre, overview, release_year, tmdb_rating, is_manual) = row

            if tmdb_id and (platform_, tmdb_id) in pinned_tmdb_ids:
                skip_count += 1
                print(f"  📌 skip: [{platform_}] '{title_ko}' (tmdb_id={tmdb_id}) → is_manual=2 보호")
                continue
            filtered.append(row)

        # ── STEP 6. 빈 rank 자리 계산 ─────────────────────────
        # skip 후 실제 배치할 수 + 고정 rank 수 기준으로 total_slots 계산
        # fixed_ranks 최대값도 고려 (고정 rank가 높은 번호면 그 이상이어야 함)
        actual_count   = len(filtered)  # skip 후 실제 배치할 크롤링 수
        max_fixed_rank = max(fixed_ranks) if fixed_ranks else 0
        total_slots    = max(actual_count + len(fixed_ranks), 20, max_fixed_rank)
        empty_slots    = [r for r in range(1, total_slots + 1) if r not in fixed_ranks]

        # ── STEP 7. 빈 rank 자리에 순서대로 배치 ──────────────
        for slot, row in zip(empty_slots, filtered):
            (date, platform_, category, category_slot_, source_name, rank,
             title_ko, title_en, score, tmdb_id, poster_path,
             genre, overview, release_year, tmdb_rating, is_manual) = row

            sql_list.append(
                f"INSERT OR REPLACE INTO rankings "
                f"(date, platform, category, category_slot, source_name, rank, "
                f"title_ko, title_en, score, tmdb_id, poster_path, "
                f"genre, overview, release_year, tmdb_rating, is_manual) "
                f"VALUES ({esc(date)}, {esc(platform_)}, {esc(category)}, "
                f"{esc(category_slot_)}, {esc(source_name)}, {slot}, "
                f"{esc(title_ko)}, {esc(title_en)}, {score or 0}, "
                f"{tmdb_id if tmdb_id else 'NULL'}, "
                f"{esc(poster_path) if poster_path else 'NULL'}, "
                f"{esc(genre) if genre else 'NULL'}, "
                f"{esc(overview) if overview else 'NULL'}, "
                f"{release_year if release_year else 'NULL'}, "
                f"{tmdb_rating if tmdb_rating else 'NULL'}, "
                f"{is_manual or 0});"
            )

    if skip_count:
        print(f"  📌 날짜고정 skip 총: {skip_count}개")

    if not sql_list:
        print(f"  rankings: 0개 (오늘 날짜 데이터 없음)")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ rankings: {success}/{len(sql_list)}개 업로드")
    return success


def upload_works(conn: sqlite3.Connection) -> int:
    """
    works 업로드 — ⚠️ works 전체가 아니라, 이번 실행에서 실제로 INSERT/UPDATE된
    작품(touched_works에 기록된 tmdb_id)만 대상으로 함
    (전체를 매번 재업로드하면 works 규모가 클수록 D1 write가 불필요하게 커짐 — 2026-07-10 수정)
    ⚠️ title_ko / title_en / tmdb_id 는 크롤러 수정 불가 (3키 원칙)
    ⚠️ tmdb_rating / genre 는 크롤링마다 최신 값으로 업데이트 (평점은 변동값)
    """
    try:
        rows = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating,
                   match_source, confidence_score, keywords
            FROM works
            WHERE tmdb_id IS NOT NULL
              AND tmdb_id IN (SELECT tmdb_id FROM touched_works)
            ORDER BY tmdb_id
        """).fetchall()
    except Exception:
        try:
            rows = conn.execute("""
                SELECT tmdb_id, title_ko, title_en, poster_path,
                       genre, overview, release_year, tmdb_rating,
                       match_source, confidence_score, '' as keywords
                FROM works
                WHERE tmdb_id IS NOT NULL
                  AND tmdb_id IN (SELECT tmdb_id FROM touched_works)
                ORDER BY tmdb_id
            """).fetchall()
        except Exception:
            rows = conn.execute("""
                SELECT tmdb_id, title_ko, title_en, poster_path,
                       genre, overview, release_year, tmdb_rating,
                       'admin' as match_source, 100 as confidence_score, '' as keywords
                FROM works
                WHERE tmdb_id IS NOT NULL
                  AND tmdb_id IN (SELECT tmdb_id FROM touched_works)
                ORDER BY tmdb_id
            """).fetchall()

    sql_list = []
    for row in rows:
        (tmdb_id, title_ko, title_en, poster_path,
         genre, overview, release_year, tmdb_rating,
         match_source, confidence_score, keywords) = row
        sql_list.append(
            f"INSERT INTO works "
            f"(tmdb_id, title_ko, title_en, poster_path, "
            f"genre, overview, release_year, tmdb_rating, keywords, "
            f"match_source, confidence_score, updated_at) "
            f"VALUES ({tmdb_id}, {esc(title_ko)}, {esc(title_en)}, "
            f"{esc(poster_path) if poster_path else 'NULL'}, "
            f"{esc(genre) if genre else 'NULL'}, "
            f"{esc(overview) if overview else 'NULL'}, "
            f"{release_year if release_year else 'NULL'}, "
            f"{tmdb_rating if tmdb_rating else 'NULL'}, "
            f"{esc(keywords) if keywords else 'NULL'}, "
            f"{esc(match_source or 'admin')}, "
            f"{confidence_score or 100}, "
            f"datetime('now')) "
            f"ON CONFLICT(tmdb_id) DO UPDATE SET"
            # ── 3키 원칙: title_ko / title_en / tmdb_id 절대 수정 불가 ──
            # ── tmdb_rating 은 변동값 → 항상 최신값으로 업데이트 ──
            f"  tmdb_rating = CASE"
            f"    WHEN excluded.tmdb_rating IS NOT NULL"
            f"    THEN excluded.tmdb_rating ELSE works.tmdb_rating END,"
            # ── genre 는 NULL일 때만 보완 (Admin 설정 보호) ──
            f"  genre = CASE"
            f"    WHEN works.genre IS NULL AND excluded.genre IS NOT NULL"
            f"    THEN excluded.genre ELSE works.genre END,"
            # ── keywords 도 genre와 동일 원칙: 비어있을 때만 보완, 어드민이 채운 값 보호 ──
            f"  keywords = CASE"
            f"    WHEN (works.keywords IS NULL OR works.keywords = '') AND excluded.keywords IS NOT NULL"
            f"    THEN excluded.keywords ELSE works.keywords END,"
            f"  updated_at = datetime('now');"
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


def upload_boxoffice_stats(conn: sqlite3.Connection) -> int:
    """
    boxoffice_stats 오늘 날짜 데이터 D1 업로드 (2026-07-18 신설)
    KOBIS 박스오피스 관객수/매출/스크린수 등 상세 지표
    ⚠️ works가 먼저 D1에 올라가 있어야 tmdb_id 참조가 의미 있으므로
       upload_works() 이후에 호출 (호출 순서는 upload() 함수 참고)
    UNIQUE(tmdb_id, date) 기준이라 INSERT OR REPLACE로 안전하게 upsert
    """
    try:
        rows = conn.execute("""
            SELECT tmdb_id, movie_cd, date, rank, rank_inten, rank_old_and_new,
                   audi_cnt, audi_acc, audi_change, sales_amt, sales_share,
                   scrn_cnt, show_cnt
            FROM boxoffice_stats
            WHERE date = ?
            ORDER BY rank
        """, (TODAY,)).fetchall()
    except Exception:
        print(f"  boxoffice_stats: 0개 (테이블 없음)")
        return 0

    sql_list = []
    for row in rows:
        (tmdb_id, movie_cd, date, rank, rank_inten, rank_old_and_new,
         audi_cnt, audi_acc, audi_change, sales_amt, sales_share,
         scrn_cnt, show_cnt) = row
        sql_list.append(
            f"INSERT OR REPLACE INTO boxoffice_stats "
            f"(tmdb_id, movie_cd, date, rank, rank_inten, rank_old_and_new, "
            f"audi_cnt, audi_acc, audi_change, sales_amt, sales_share, "
            f"scrn_cnt, show_cnt) "
            f"VALUES ({tmdb_id}, {esc(movie_cd)}, {esc(date)}, "
            f"{rank if rank is not None else 'NULL'}, "
            f"{rank_inten if rank_inten is not None else 'NULL'}, "
            f"{esc(rank_old_and_new)}, "
            f"{audi_cnt if audi_cnt is not None else 'NULL'}, "
            f"{audi_acc if audi_acc is not None else 'NULL'}, "
            f"{audi_change if audi_change is not None else 'NULL'}, "
            f"{sales_amt if sales_amt is not None else 'NULL'}, "
            f"{sales_share if sales_share is not None else 'NULL'}, "
            f"{scrn_cnt if scrn_cnt is not None else 'NULL'}, "
            f"{show_cnt if show_cnt is not None else 'NULL'});"
        )

    if not sql_list:
        print(f"  boxoffice_stats: 0개")
        return 0

    success = d1_batch(sql_list)
    print(f"  ✅ boxoffice_stats: {success}/{len(sql_list)}개 업로드")
    return success


def _update_latest_ranking_date() -> None:
    """
    [2026-07-14 신설] 'latest_ranking_date' 설정값을 오늘 날짜로 갱신.

    videos.js/rankings.js/hot100.js/admin.js가 방문마다 각자
    `(SELECT MAX(date) FROM rankings WHERE date < 'manual')`를 재계산하던 것을,
    이 한 줄로 미리 계산해두고 app_settings에서 읽어가도록 바꾸기 위한 것.
    rankings 업로드가 끝난 직후(=오늘 날짜 데이터가 실제로 D1에 반영된 시점)에만 호출.
    """
    try:
        d1_execute(f"""
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('latest_ranking_date', {esc(TODAY)}, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        """)
        print(f"  ✅ app_settings: latest_ranking_date → {TODAY}")
    except Exception as e:
        print(f"  ⚠️ app_settings 갱신 실패: {e}")


def upload():
    """전체 D1 업로드 실행"""

    if not CF_ACCOUNT_ID or not CF_API_TOKEN or not D1_DATABASE_ID:
        print("⚠️  Cloudflare 환경변수 없음 — D1 업로드 스킵")
        return

    print(f"\n[D1 업로드] {TODAY} 데이터 업로드 시작...")

    conn = sqlite3.connect(DB_PATH)

    try:
        upload_rankings(conn)
        _update_latest_ranking_date()
        upload_works(conn)
        upload_boxoffice_stats(conn)
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
