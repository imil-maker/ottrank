"""티빙 랭킹 크롤러 - 키노라이츠 (기존 유지)
변경사항: save() → _save_tving_ranking() 으로 직접 저장 (category_slot 방식)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import sqlite3
from playwright.async_api import async_playwright
from db import init_db, get_today, lookup_works, search_tmdb_korean, translate_titles_to_korean, insert_work

KINOLIGHTS_URL = "https://m.kinolights.com/ranking/tving?category=series"

USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 10; SM-G981B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Mobile Safari/537.36"
)

# 티빙 고정 슬롯 설정
PLATFORM      = "tving"
CATEGORY_SLOT = "category01"
SOURCE_NAME   = "TOP 10 Overall"


def _save_tving(conn: sqlite3.Connection, rank: int, title_ko: str, tmdb_data: dict | None):
    """티빙 랭킹 rankings 테이블에 저장"""
    today = get_today()
    if tmdb_data:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank,
                 title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                (date, platform, category, category_slot, source_name, rank, title_ko, title_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (today, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, rank, title_ko, title_ko))
    conn.commit()


async def run(conn):
    print("\n[티빙] 크롤링 중... (키노라이츠)")
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
        page = await context.new_page()
        titles = await _crawl(page)
        await browser.close()

    if not titles:
        print("  [티빙] 데이터 없음")
        return

    # 매칭 파이프라인
    for rank, title_ko in titles:
        # ① works 우선 조회 (한글 제목으로)
        works_data = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating
            FROM works WHERE title_ko = ? LIMIT 1
        """, (title_ko,)).fetchone()

        if works_data:
            tmdb_data = dict(zip(
                ["tmdb_id","title_ko","title_en","poster_path","genre","overview","release_year","tmdb_rating"],
                works_data
            ))
            print(f"  ✅ [티빙] {rank:2d}. '{title_ko}' → works DB (tmdb_id={tmdb_data['tmdb_id']})")
            _save_tving(conn, rank, title_ko, tmdb_data)
            continue

        # ② TMDB 한글 검색 (티빙은 이미 한글 제목)
        tmdb_data = search_tmdb_korean(title_ko)
        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_ko
            print(f"  ✅ [티빙] {rank:2d}. '{title_ko}' → TMDB 매칭 (tmdb_id={tmdb_data['tmdb_id']})")
            insert_work(conn, tmdb_data, match_source="auto_claude")
            _save_tving(conn, rank, title_ko, tmdb_data)
        else:
            print(f"  ⚠️ [티빙] {rank:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
            # review_queue 저장
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                    (platform, category_slot, rank, title_en, title_ko_guess, fail_reason, crawled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (PLATFORM, CATEGORY_SLOT, rank, title_ko, title_ko, "tmdb_not_found", get_today()))
            conn.commit()
            _save_tving(conn, rank, title_ko, None)

    print(f"  [티빙] {len(titles)}개 처리 완료")


async def _crawl(page) -> list[tuple]:
    """키노라이츠에서 티빙 랭킹 크롤링, 반환: [(rank, title_ko), ...]"""
    titles = []
    try:
        await page.goto(KINOLIGHTS_URL, wait_until="networkidle", timeout=40000)
        await page.wait_for_selector(
            ".ranking-item, [class*='RankingItem'], li[class*='item']",
            timeout=20000
        )
        items = await page.query_selector_all(
            ".ranking-item, [class*='RankingItem'], li[class*='item']"
        )
        count = 0
        for item in items:
            if count >= 10:
                break
            try:
                rank_el  = await item.query_selector("[class*='rank'], .rank, span:first-child")
                title_el = await item.query_selector("[class*='title'], .title, strong, h3, h4")
                if not title_el:
                    continue
                title    = (await title_el.inner_text()).strip()
                rank_txt = (await rank_el.inner_text()).strip() if rank_el else str(count + 1)
                rank     = int(rank_txt) if rank_txt.isdigit() else count + 1
                if title:
                    titles.append((rank, title))
                    count += 1
            except Exception:
                continue
        if count == 0:
            print("  [티빙] ⚠️ 데이터 없음")
    except Exception as e:
        print(f"  [티빙] 에러: {e}")
    return titles


if __name__ == "__main__":
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
