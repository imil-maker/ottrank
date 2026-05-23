"""FlixPatrol 공통 크롤링 로직"""
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
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=40000)
            print(f"  [{platform}] HTTP status: {resp.status}")
            await page.wait_for_selector("table.card-table", timeout=20000)
            tables = await page.query_selector_all("table.card-table")
            print(f"  [{platform}] card-table 개수: {len(tables)}")

            for idx, category in enumerate(["tv", "movie"]):
                if idx >= len(tables):
                    print(f"  [{platform}][{category}] ⚠️  테이블 없음")
                    continue
                await _parse_table(tables[idx], conn, platform, category)

        except Exception as e:
            print(f"  [{platform}] 에러: {e}")
        finally:
            await browser.close()

async def _parse_table(table, conn, platform: str, category: str):
    from db import save
    try:
        # tr.table-group 대신 tbody > tr 전체 선택
        rows = await table.query_selector_all("tbody tr")
        print(f"  [{platform}][{category}] 행 개수: {len(rows)}")

        count = 0
        for row in rows:
            if count >= 10:
                break
            try:
                # 순위: class에 'w-12' 포함된 td
                rank_el  = await row.query_selector("td.table-td-w-12, td[class*='w-12']")
                # 타이틀: class='table-td' 안의 a 태그
                title_el = await row.query_selector("td.table-td a")

                if not rank_el or not title_el:
                    continue

                rank_txt  = (await rank_el.inner_text()).strip().rstrip(".")
                title_txt = (await title_el.inner_text()).strip()

                if not rank_txt.isdigit() or not title_txt:
                    continue

                save(conn, platform, category, int(rank_txt), title_ko=title_txt, title_en=title_txt)
                count += 1

            except Exception:
                continue

        if count == 0:
            # 디버그: 첫 번째 행 HTML 출력
            if rows:
                html = await rows[0].inner_html()
                print(f"  [{platform}][{category}] 첫행 HTML: {html[:300]}")
            print(f"  [{platform}][{category}] ⚠️  데이터 없음")

    except Exception as e:
        print(f"  [{platform}][{category}] 파싱 에러: {e}")
