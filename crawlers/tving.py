"""티빙 랭킹"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import random
import sqlite3
import requests
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

# Worker API 설정 (D1 날짜고정 데이터 조회용)
API_BASE     = "https://ottrank-api.tdidream.workers.dev"
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")


def _get_pinned_info_from_api() -> tuple[set, set]:
    """D1에서 오늘 날짜고정(is_manual=2) 목록을 Worker API로 조회.

    로컬 SQLite에는 is_manual=2 데이터가 없으므로
    반드시 Worker API(D1)에서 직접 가져와야 함.

    반환:
        pinned_tmdb_ids : 날짜고정된 tmdb_id set → 크롤링 결과 저장 skip용
        pinned_ranks    : 날짜고정된 rank set    → 빈 슬롯 계산용
    """
    today = get_today()
    try:
        resp = requests.get(
            f"{API_BASE}/admin/rankings",
            params={"date": today},
            headers={"Authorization": f"Bearer {ADMIN_SECRET}"},
            timeout=10,
        )
        if not resp.ok:
            print(f"  ⚠️ [티빙] API 조회 실패 (status={resp.status_code}) — 날짜고정 skip")
            return set(), set()

        data = resp.json()
        rows = data.get("data", [])

        # tving / category01 / is_manual=2 필터링
        pinned = [
            r for r in rows
            if r.get("platform") == PLATFORM
            and r.get("category_slot") == CATEGORY_SLOT
            and r.get("is_manual") == 2
        ]

        pinned_ranks    = {r["rank"] for r in pinned}
        pinned_tmdb_ids = {r["tmdb_id"] for r in pinned if r.get("tmdb_id")}

        if pinned:
            print(f"  📌 [티빙] 날짜고정 {len(pinned)}개 조회 완료 — rank: {sorted(pinned_ranks)}")
        else:
            print("  📌 [티빙] 날짜고정 데이터 없음")

        return pinned_tmdb_ids, pinned_ranks

    except Exception as e:
        print(f"  ⚠️ [티빙] API 조회 오류: {e} — 날짜고정 skip")
        return set(), set()


def _save_tving(conn: sqlite3.Connection, rank: int, title_ko: str, tmdb_data: dict | None):
    """티빙 랭킹을 로컬 SQLite rankings 테이블에 저장.

    - 크롤링 결과(is_manual=0)만 저장
    - INSERT OR REPLACE: 같은 날짜+플랫폼+category_slot+rank 중복 시 교체
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

    # ── STEP 1. D1에서 날짜고정 목록 조회 (Worker API) ────────────
    # 로컬 SQLite에는 is_manual=2 데이터가 없으므로 반드시 API로 조회
    pinned_tmdb_ids, pinned_ranks = _get_pinned_info_from_api()

    # ── STEP 2. 크롤링 실행 ────────────────────────────────────────
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

    # ── STEP 3. 그룹별 랜덤 배치 ──────────────────────────────────
    # 1~10위: 3개 그룹으로 나눠 각각 랜덤 셔플
    # 11위~ : 나머지 전체 랜덤 셔플
    top10 = titles[:10]
    rest  = titles[10:]

    g1 = top10[0:4]; random.shuffle(g1)    # 1~4위 그룹
    g2 = top10[4:7]; random.shuffle(g2)    # 5~7위 그룹
    g3 = top10[7:10]; random.shuffle(g3)   # 8~10위 그룹
    random.shuffle(rest)                    # 11위~ 전체 랜덤

    crawled_titles = g1 + g2 + g3 + rest   # 크롤링 순위 목록

    # ── STEP 4. TMDB 매칭 (저장 전 tmdb_id 확보) ──────────────────
    # 날짜고정 tmdb_id와 비교하려면 저장 전에 tmdb_id를 먼저 확보해야 함
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
            # 매칭 실패 → tmdb_data None
            resolved.append((title_ko, None))

    # ── STEP 5. 날짜고정 작품 skip ────────────────────────────────
    # 크롤링 결과 중 날짜고정된 tmdb_id와 일치하는 작품은 저장하지 않음
    # (작품 자체 데이터는 절대 건드리지 않음 — rankings 저장 여부만 제어)
    filtered = []
    for title_ko, tmdb_data in resolved:
        tmdb_id = tmdb_data.get("tmdb_id") if tmdb_data else None
        if tmdb_id and tmdb_id in pinned_tmdb_ids:
            print(f"  📌 [티빙] '{title_ko}' (tmdb_id={tmdb_id}) → 날짜고정 작품 — 저장 skip")
            continue
        filtered.append((title_ko, tmdb_data))

    # ── STEP 6. 빈 슬롯 계산 ──────────────────────────────────────
    # 날짜고정 rank 자리를 제외한 나머지 슬롯에 순서대로 배치
    # 예) 고정: {3, 15} → 빈 슬롯: [1,2,4,5,...,14,16,17,18,19,20]
    total_slots = max(len(filtered) + len(pinned_ranks), 20)
    empty_slots = [r for r in range(1, total_slots + 1) if r not in pinned_ranks]

    # ── STEP 7. 빈 슬롯에 크롤링 결과 저장 ───────────────────────
    saved_count = 0
    for slot, (title_ko, tmdb_data) in zip(empty_slots, filtered):
        if tmdb_data:
            print(f"  ✅ [티빙] {slot:2d}. '{title_ko}' → tmdb_id={tmdb_data.get('tmdb_id')}")
        else:
            # 매칭 실패 → 검토 큐 저장
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
