"""티빙 랭킹"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import random
import sqlite3
from playwright.async_api import async_playwright
from db import init_db, get_today, lookup_works, search_tmdb_korean, translate_titles_to_korean, insert_work

RANKING_URL = "https://m.kinolights.com/ranking/tving?category=series"

USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 10; SM-G981B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Mobile Safari/537.36"
)

# 티빙 고정 슬롯 설정
PLATFORM      = "tving"
CATEGORY_SLOT = "category01"
SOURCE_NAME   = "TOP 10 Overall"


def _copy_pinned_to_today(conn: sqlite3.Connection):
    """날짜고정(is_manual=2) 데이터를 오늘 날짜로 복사.

    - 오늘 날짜에 이미 is_manual=2 데이터가 있으면 아무것도 하지 않음
    - 없으면 가장 최근 날짜의 is_manual=2 데이터를 오늘 날짜로 복사
    - works 테이블 / tmdb 데이터는 절대 건드리지 않음
    - rankings 테이블의 오늘 날짜 저장 여부만 제어
    """
    today = get_today()

    # ── 오늘 날짜에 이미 날짜고정 데이터가 있으면 skip ────────────
    already = conn.execute("""
        SELECT COUNT(*) FROM rankings
        WHERE date = ? AND platform = ? AND category_slot = ? AND is_manual = 2
    """, (today, PLATFORM, CATEGORY_SLOT)).fetchone()[0]

    if already > 0:
        print(f"  📌 [티빙] 오늘 날짜고정 데이터 {already}개 이미 존재 — 복사 skip")
        return

    # ── 가장 최근 날짜의 날짜고정 데이터 조회 ─────────────────────
    latest_date = conn.execute("""
        SELECT MAX(date) FROM rankings
        WHERE platform = ? AND category_slot = ? AND is_manual = 2
    """, (PLATFORM, CATEGORY_SLOT)).fetchone()[0]

    if not latest_date:
        print("  📌 [티빙] 날짜고정 데이터 없음 — 복사 skip")
        return

    pinned_rows = conn.execute("""
        SELECT rank, title_ko, title_en, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating,
               category, source_name, memo, season
        FROM rankings
        WHERE date = ? AND platform = ? AND category_slot = ? AND is_manual = 2
        ORDER BY rank
    """, (latest_date, PLATFORM, CATEGORY_SLOT)).fetchall()

    if not pinned_rows:
        print("  📌 [티빙] 날짜고정 데이터 없음 — 복사 skip")
        return

    # ── 오늘 날짜로 복사 INSERT ────────────────────────────────────
    for row in pinned_rows:
        conn.execute("""
            INSERT OR IGNORE INTO rankings
                (date, platform, category, category_slot, source_name, rank,
                 title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating,
                 is_manual, memo, season)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?)
        """, (
            today, PLATFORM,
            row[9] or CATEGORY_SLOT,   # category
            CATEGORY_SLOT,
            row[10] or SOURCE_NAME,    # source_name
            row[0],                    # rank
            row[1],                    # title_ko
            row[2],                    # title_en
            row[3],                    # tmdb_id
            row[4],                    # poster_path
            row[5],                    # genre
            row[6],                    # overview
            row[7],                    # release_year
            row[8],                    # tmdb_rating
            row[11],                   # memo
            row[12],                   # season
        ))
    conn.commit()
    print(f"  📌 [티빙] 날짜고정 {len(pinned_rows)}개 → 오늘({today}) 날짜로 복사 완료")


def _get_pinned_info(conn: sqlite3.Connection) -> tuple[set, set]:
    """오늘 날짜고정(is_manual=2) 항목의 tmdb_id 집합과 rank 집합 반환.

    반환:
        pinned_tmdb_ids : 오늘 날짜고정된 tmdb_id set  → 크롤링 결과에서 저장 skip용
        pinned_ranks    : 오늘 날짜고정된 rank set      → 빈 슬롯 계산용
    """
    today = get_today()
    rows = conn.execute("""
        SELECT rank, tmdb_id FROM rankings
        WHERE date = ? AND platform = ? AND category_slot = ? AND is_manual = 2
    """, (today, PLATFORM, CATEGORY_SLOT)).fetchall()

    pinned_ranks    = {row[0] for row in rows}
    # tmdb_id가 NULL인 경우(미매칭 작품)는 None 제외
    pinned_tmdb_ids = {row[1] for row in rows if row[1] is not None}

    return pinned_tmdb_ids, pinned_ranks


def _save_tving(conn: sqlite3.Connection, rank: int, title_ko: str, tmdb_data: dict | None):
    """티빙 랭킹을 rankings 테이블에 저장.

    - is_manual=2(날짜고정) 행은 _copy_pinned_to_today()에서 이미 INSERT됨
    - 여기서는 크롤링 결과(is_manual=0)만 저장
    - INSERT OR REPLACE: 같은 날짜+플랫폼+카테고리+rank 중복 시 교체
    """
    today = get_today()

    if tmdb_data:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank,
                 title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating, is_manual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            today, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, rank,
            tmdb_data.get("title_ko") or title_ko,
            tmdb_data.get("title_en") or title_ko,
            tmdb_data.get("tmdb_id"),
            tmdb_data.get("poster_path"),
            tmdb_data.get("genre"),
            tmdb_data.get("overview"),
            tmdb_data.get("release_year"),
            tmdb_data.get("tmdb_rating"),
        ))
    else:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name,
                 rank, title_ko, title_en, is_manual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (today, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, rank, title_ko, title_ko))
    conn.commit()


async def run(conn):
    print("\n[티빙] 랭킹 수집 중...")

    # ── STEP 1. 날짜고정 데이터 오늘 날짜로 복사 ──────────────────
    # 날짜가 바뀌어도 is_manual=2 항목이 오늘 rankings에 존재하도록 보장
    _copy_pinned_to_today(conn)

    # ── STEP 2. 오늘 날짜고정 정보 수집 ───────────────────────────
    # pinned_tmdb_ids : 크롤링 결과에서 저장 skip할 tmdb_id 집합
    # pinned_ranks    : 빈 슬롯 계산 시 제외할 rank 집합
    pinned_tmdb_ids, pinned_ranks = _get_pinned_info(conn)

    if pinned_tmdb_ids or pinned_ranks:
        print(f"  📌 [티빙] 날짜고정 현황 — rank: {sorted(pinned_ranks)}, tmdb_id: {sorted(pinned_tmdb_ids)}")

    # ── STEP 3. 크롤링 실행 ────────────────────────────────────────
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent=USER_AGENT,
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            viewport={"width": 390, "height": 844},
        )
        page   = await context.new_page()
        titles = await _crawl(page)
        await browser.close()

    if not titles:
        print("  [티빙] 데이터 없음")
        return

    # ── STEP 4. 그룹별 랜덤 배치 ──────────────────────────────────
    # 1~10위: 3개 그룹으로 나눠 각각 랜덤 셔플
    # 11위~ : 나머지 전체 랜덤 셔플
    top10 = titles[:10]
    rest  = titles[10:]

    g1 = top10[0:4]; random.shuffle(g1)    # 1~4위 그룹
    g2 = top10[4:7]; random.shuffle(g2)    # 5~7위 그룹
    g3 = top10[7:10]; random.shuffle(g3)   # 8~10위 그룹
    random.shuffle(rest)                    # 11위~ 전체 랜덤

    crawled_titles = g1 + g2 + g3 + rest   # 크롤링 순위 목록

    # ── STEP 5. TMDB 매칭 (저장 전 tmdb_id 확보) ──────────────────
    # 저장 전에 모든 작품의 tmdb_id를 먼저 확보해야
    # 날짜고정 tmdb_id와 비교해서 중복 skip이 가능함
    resolved = []   # [(title_ko, tmdb_data or None), ...]

    for title_ko in crawled_titles:
        # ① works 테이블 우선 조회 (한글 제목으로)
        works_row = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path,
                   genre, overview, release_year, tmdb_rating
            FROM works WHERE title_ko = ? LIMIT 1
        """, (title_ko,)).fetchone()

        if works_row:
            tmdb_data = dict(zip(
                ["tmdb_id", "title_ko", "title_en", "poster_path",
                 "genre", "overview", "release_year", "tmdb_rating"],
                works_row
            ))
            resolved.append((title_ko, tmdb_data))
            continue

        # ② TMDB 한글 검색
        tmdb_data = search_tmdb_korean(title_ko)
        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_ko
            insert_work(conn, tmdb_data, match_source="auto_claude")
            resolved.append((title_ko, tmdb_data))
        else:
            # 매칭 실패 → tmdb_data None으로 저장 (tmdb_id=None)
            resolved.append((title_ko, None))

    # ── STEP 6. 날짜고정 작품 skip ────────────────────────────────
    # 크롤링 결과 중 오늘 날짜고정된 tmdb_id와 일치하는 작품은
    # 오늘 rankings에 저장하지 않음 (작품 자체 데이터는 건드리지 않음)
    filtered = []
    for title_ko, tmdb_data in resolved:
        tmdb_id = tmdb_data.get("tmdb_id") if tmdb_data else None
        if tmdb_id and tmdb_id in pinned_tmdb_ids:
            print(f"  📌 [티빙] '{title_ko}' (tmdb_id={tmdb_id}) → 날짜고정 작품 — 저장 skip")
            continue
        filtered.append((title_ko, tmdb_data))

    # ── STEP 7. 빈 슬롯 계산 ──────────────────────────────────────
    # 전체 순위 슬롯에서 날짜고정 rank를 제외한 나머지 슬롯에 순서대로 배치
    # 예) 고정: {3, 15} → 빈 슬롯: [1,2,4,5,...,14,16,17,18,19,20]
    total_slots = max(len(filtered) + len(pinned_ranks), 20)
    empty_slots = [r for r in range(1, total_slots + 1) if r not in pinned_ranks]

    # ── STEP 8. 빈 슬롯에 크롤링 결과 저장 ───────────────────────
    saved_count = 0
    for slot, (title_ko, tmdb_data) in zip(empty_slots, filtered):
        if tmdb_data:
            print(f"  ✅ [티빙] {slot:2d}. '{title_ko}' → tmdb_id={tmdb_data.get('tmdb_id')}")
        else:
            # 매칭 실패 작품 → 검토 큐 저장
            print(f"  ⚠️ [티빙] {slot:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                    (platform, category_slot, rank, title_en, title_ko_guess, fail_reason, crawled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (PLATFORM, CATEGORY_SLOT, slot, title_ko, title_ko, "tmdb_not_found", get_today()))
            conn.commit()

        _save_tving(conn, slot, title_ko, tmdb_data)
        saved_count += 1

    print(f"  [티빙] 크롤링 {saved_count}개 저장 완료 / 날짜고정 {len(pinned_ranks)}개 유지")


async def _crawl(page) -> list[str]:
    """티빙 랭킹 수집
    - 페이지 순서대로 제목 수집 (전체 OTT 순위 숫자 무시)
    - 중복 제목 제거
    - 반환: [title_ko, ...] (순서대로)
    """
    titles = []
    seen   = set()
    try:
        await page.goto(RANKING_URL, wait_until="networkidle", timeout=40000)
        await page.wait_for_selector(
            ".ranking-item, [class*='RankingItem'], li[class*='item']",
            timeout=20000
        )
        items = await page.query_selector_all(
            ".ranking-item, [class*='RankingItem'], li[class*='item']"
        )
        for item in items:
            try:
                title_el = await item.query_selector("[class*='title'], .title, strong, h3, h4")
                if not title_el:
                    continue
                title = (await title_el.inner_text()).strip()
                # 중복 제목 스킵
                if not title or title in seen:
                    continue
                seen.add(title)
                titles.append(title)
            except Exception:
                continue

        if not titles:
            print("  [티빙] ⚠️ 데이터 없음")
    except Exception as e:
        print(f"  [티빙] 에러: {e}")
    return titles


if __name__ == "__main__":
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
