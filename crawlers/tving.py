"""티빙 랭킹 크롤러 - 키노라이츠 (통합 랭킹, TV 시리즈만)"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
from playwright.async_api import async_playwright
from db import save

# 티빙은 TV 시리즈 통합 랭킹만 운영 → category='tv'로 저장
KINOLIGHTS_URL = "https://m.kinolights.com/ranking/tving?category=series"

USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 10; SM-G981B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Mobile Safari/537.36"
)

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
        await _crawl(page, conn)
        await browser.close()

async def _crawl(page, conn):
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
                    # 티빙은 항상 category='tv'로 저장
                    save(conn, "tving", "tv", rank, title_ko=title)
                    count += 1
            except Exception:
                continue
        if count == 0:
            print(f"  [티빙][tv] ⚠️  데이터 없음")
        else:
            print(f"  [티빙][tv] {count}개 저장 완료")
    except Exception as e:
        print(f"  [티빙][tv] 에러: {e}")

if __name__ == "__main__":
    from db import init_db
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
