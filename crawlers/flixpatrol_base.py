"""FlixPatrol 공통 크롤링 로직"""
import asyncio
from playwright.async_api import async_playwright

HEADERS = {
    "user_agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "locale": "ko-KR",
    "timezone_id": "Asia/Seoul",
}

async def crawl_flixpatrol(url: str, platform: str, conn):
    """FlixPatrol 페이지에서 TV/영화 TOP 10 크롤링"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent=HEADERS["user_agent"],
            locale=HEADERS["locale"],
            timezone_id=HEADERS["timezone_id"],
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=40000)
            await page.wait_for_selector("table.table, .top10-table, table", timeout=20000)

            # TV / 영화 섹션 각각 파싱
            for category in ["tv", "movie"]:
                await _parse_section(page, conn, platform, category)

        except Exception as e:
            print(f"  [{platform}] 페이지 로드 에러: {e}")
        finally:
            await browser.close()

async def _parse_section(page, conn, platform: str, category: str):
    from db import save

    # FlixPatrol 테이블 구조: TV섹션 먼저, Movie섹션 다음
    # section id: "tv" / "movies"
    section_id = "tv" if category == "tv" else "movies"

    try:
        # 섹션별 테이블 행 선택
        rows = await page.query_selector_all(
            f"#{section_id} table tbody tr, "
            f"[data-id='{section_id}'] table tbody tr"
        )

        if not rows:
            # fallback: 순서대로 첫번째=TV, 두번째=영화
            tables = await page.query_selector_all("table.table tbody, table tbody")
            idx = 0 if category == "tv" else 1
            if idx < len(tables):
                rows = await tables[idx].query_selector_all("tr")

        count = 0
        for row in rows:
            if count >= 10:
                break
            try:
                # 순위 셀
                rank_el = await row.query_selector("td:first-child")
                title_el = await row.query_selector("td a, td:nth-child(2) a, td:nth-child(2)")

                if not rank_el or not title_el:
                    continue

                rank_txt = (await rank_el.inner_text()).strip()
                title_txt = (await title_el.inner_text()).strip()

                if not rank_txt.isdigit() or not title_txt:
                    continue

                rank = int(rank_txt)
                title = title_txt
                count += 1
                save(conn, platform, category, rank, title_ko=title, title_en=title)

            except Exception:
                continue

        if count == 0:
            print(f"  [{platform}][{category}] ⚠️  데이터 없음 (셀렉터 불일치 가능)")

    except Exception as e:
        print(f"  [{platform}][{category}] 파싱 에러: {e}")
