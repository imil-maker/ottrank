"""극장 박스오피스 크롤러 - 무비차트 (기존 유지)
변경사항: save() → _save_boxoffice() 으로 직접 저장 (category_slot 방식)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import sqlite3
from playwright.async_api import async_playwright
from db import init_db, get_today, lookup_works, search_tmdb_korean, insert_work

URL = "https://www.moviechart.co.kr/rank/boxoffice"

# 박스오피스 고정 슬롯 설정
PLATFORM      = "boxoffice"
CATEGORY_SLOT = "category01"
SOURCE_NAME   = "주간 박스오피스"


def _save_boxoffice(conn: sqlite3.Connection, rank: int, title_ko: str, tmdb_data: dict | None):
    """박스오피스 랭킹 rankings 테이블에 저장"""
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
    print("\n[박스오피스] 크롤링 중... (무비차트)")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="ko-KR",
        )
        page = await context.new_page()
        titles = await _crawl(page)
        await browser.close()

    if not titles:
        print("  [박스오피스] 데이터 없음")
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
            print(f"  ✅ [박스오피스] {rank:2d}. '{title_ko}' → works DB (tmdb_id={tmdb_data['tmdb_id']})")
            _save_boxoffice(conn, rank, title_ko, tmdb_data)
            continue

        # ② TMDB 한글 검색 (박스오피스는 이미 한글 제목)
        tmdb_data = search_tmdb_korean(title_ko)
        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_ko
            print(f"  ✅ [박스오피스] {rank:2d}. '{title_ko}' → TMDB 매칭 (tmdb_id={tmdb_data['tmdb_id']})")
            insert_work(conn, tmdb_data, match_source="auto_claude")
            _save_boxoffice(conn, rank, title_ko, tmdb_data)
        else:
            print(f"  ⚠️ [박스오피스] {rank:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                    (platform, category_slot, rank, title_en, title_ko_guess, fail_reason, crawled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (PLATFORM, CATEGORY_SLOT, rank, title_ko, title_ko, "tmdb_not_found", get_today()))
            conn.commit()
            _save_boxoffice(conn, rank, title_ko, None)

    print(f"  [박스오피스] {len(titles)}개 처리 완료")


async def _crawl(page) -> list[tuple]:
    """무비차트에서 박스오피스 랭킹 크롤링, 반환: [(rank, title_ko), ...]"""
    titles = []
    try:
        await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_selector("table tr", timeout=15000)

        rows = await page.query_selector_all("table tr")
        count = 0
        for row in rows:
            if count >= 10:
                break
            try:
                rank_el  = await row.query_selector("td:first-child")
                title_el = await row.query_selector("td:nth-child(2) a")
                if not rank_el or not title_el:
                    continue
                rank_txt = (await rank_el.inner_text()).strip().lstrip("0")
                title    = (await title_el.inner_text()).strip()
                if not rank_txt.isdigit() or not title:
                    continue
                titles.append((int(rank_txt), title))
                count += 1
            except Exception:
                continue

        print(f"  [박스오피스] {count}개 수집")
    except Exception as e:
        print(f"  [박스오피스] 에러: {e}")
    return titles


if __name__ == "__main__":
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
