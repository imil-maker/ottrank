"""티빙 랭킹"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import random
import sqlite3
from playwright.async_api import async_playwright
from db import init_db, get_today, search_tmdb_korean, insert_work

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

# 크롤링 최대 수집 개수 (is_manual=2 수동 작품이 많으므로 15개로 제한)
CRAWL_LIMIT = 15


async def run(conn):
    print("\n[티빙] 랭킹 수집 중...")

    # ── STEP 1. 크롤링 실행 ────────────────────────────────────────
    # is_manual=2 보호 로직은 upload_to_d1.py 에서만 처리
    # tving.py 는 크롤링 + TMDB 매칭 + 로컬 저장만 담당
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

    # ── STEP 2. 그룹별 랜덤 배치 ──────────────────────────────────
    # 1~10위: 3개 그룹으로 나눠 각각 랜덤 셔플
    # 11위~ : 나머지 전체 랜덤 셔플
    # 크롤링 결과 최대 CRAWL_LIMIT 개로 제한
    titles = titles[:CRAWL_LIMIT]

    top10 = titles[:10]
    rest  = titles[10:]

    g1 = top10[0:4]; random.shuffle(g1)    # 1~4위 그룹
    g2 = top10[4:7]; random.shuffle(g2)    # 5~7위 그룹
    g3 = top10[7:10]; random.shuffle(g3)   # 8~10위 그룹
    random.shuffle(rest)                    # 11위~ 전체 랜덤

    crawled_titles = g1 + g2 + g3 + rest   # 크롤링 순위 목록

    # ── STEP 3. TMDB 매칭 ─────────────────────────────────────────
    today    = get_today()
    resolved = []  # [(title_ko, tmdb_data or None), ...]

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
            resolved.append((title_ko, None))

    # ── STEP 4. 로컬 SQLite에 rank 1~N 순서대로 저장 ─────────────
    # ⚠️ is_manual=2 보호는 여기서 하지 않음
    # → upload_to_d1.py 에서 D1 업로드 시 처리
    # ⚠️ 저장 전 오늘 날짜 tving 크롤링 데이터 초기화 (is_manual=0만)
    # → 이전 크롤링 결과가 남아서 중복되는 것 방지
    conn.execute("""
        DELETE FROM rankings
        WHERE date = ? AND platform = ? AND category_slot = ? AND is_manual = 0
    """, (today, PLATFORM, CATEGORY_SLOT))
    conn.commit()

    saved_count = 0
    for rank, (title_ko, tmdb_data) in enumerate(resolved, start=1):
        if tmdb_data:
            print(f"  ✅ [티빙] {rank:2d}. '{title_ko}' → tmdb_id={tmdb_data.get('tmdb_id')}")
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
            # 매칭 실패 → 검토 큐 저장 + title_ko 만 저장
            print(f"  ⚠️ [티빙] {rank:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                    (platform, category_slot, rank, title_en, title_ko_guess, fail_reason, crawled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (PLATFORM, CATEGORY_SLOT, rank, title_ko, title_ko, "tmdb_not_found", today))
            conn.execute("""
                INSERT OR REPLACE INTO rankings
                    (date, platform, category, category_slot, source_name,
                     rank, title_ko, title_en, is_manual)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (today, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, rank, title_ko, title_ko))

        conn.commit()
        saved_count += 1

    print(f"  [티빙] 크롤링 {saved_count}개 로컬 저장 완료 (is_manual=2 보호는 upload_to_d1.py 에서 처리)")


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
