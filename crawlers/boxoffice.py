"""극장 박스오피스 크롤러 - 무비차트 (KOBIS 데이터 출처)"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import asyncio
from playwright.async_api import async_playwright
from db import save

URL = "https://www.moviechart.co.kr/rank/boxoffice"

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
        try:
            await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_selector("table tr", timeout=15000)

            rows = await page.query_selector_all("table tr")
            count = 0
            for row in rows:
                if count >= 10:
                    break
                try:
                    # 순위 셀
                    rank_el = await row.query_selector("td:first-child")
                    # 영화명 셀 (링크)
                    title_el = await row.query_selector("td:nth-child(2) a")
                    if not rank_el or not title_el:
                        continue
                    rank_txt = (await rank_el.inner_text()).strip().lstrip("0")
                    title = (await title_el.inner_text()).strip()
                    if not rank_txt.isdigit() or not title:
                        continue
                    save(conn, "boxoffice", "movie", int(rank_txt), title_ko=title)
                    count += 1
                except Exception:
                    continue

            print(f"  [박스오피스] {count}개 저장 완료")
        except Exception as e:
            print(f"  [박스오피스] 에러: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    from db import init_db
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()