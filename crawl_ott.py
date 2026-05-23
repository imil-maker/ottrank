import asyncio
import sqlite3
from datetime import datetime, timezone, timedelta
from playwright.async_api import async_playwright

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime("%Y-%m-%d")
DB_PATH = "rankings.db"

# DB 초기화
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            platform TEXT,
            category TEXT,
            rank INTEGER,
            title_ko TEXT,
            title_en TEXT,
            score REAL,
            UNIQUE(date, platform, category, rank)
        )
    """)
    conn.commit()
    return conn

def save(conn, platform, category, rank, title_ko, title_en="", score=0.0):
    conn.execute("""
        INSERT OR REPLACE INTO rankings (date, platform, category, rank, title_ko, title_en, score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (TODAY, platform, category, rank, title_ko, title_en, score))
    conn.commit()
    print(f"[{platform}][{category}] {rank}. {title_ko}")

# ── 티빙 ────────────────────────────────────────────
async def crawl_tving(page, conn):
    categories = [
        ("tv",    "https://www.tving.com/ranking/vod/weekly/tvprogram"),
        ("movie", "https://www.tving.com/ranking/vod/weekly/movie"),
    ]
    for cat, url in categories:
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_selector("li.ranking_item, li[class*='ranking']", timeout=15000)
            items = await page.query_selector_all("li.ranking_item, li[class*='ranking']")
            for i, item in enumerate(items[:10], 1):
                title_el = await item.query_selector("[class*='title'], strong, .tit")
                if title_el:
                    title = (await title_el.inner_text()).strip()
                    if title:
                        save(conn, "tving", cat, i, title)
        except Exception as e:
            print(f"[티빙][{cat}] 에러: {e}")
            # fallback: API 시도
            await crawl_tving_api(page, conn, cat)

async def crawl_tving_api(page, conn, category):
    """티빙 내부 API fallback"""
    type_map = {"tv": "P", "movie": "M"}
    ctype = type_map.get(category, "P")
    url = f"https://api.tving.com/v2/media/rankings?pageNo=1&pageSize=10&adult=Y&category={ctype}&country=KR&languageCode=ko"
    try:
        resp = await page.evaluate(f"""
            fetch('{url}', {{headers:{{'Accept':'application/json'}}}})
            .then(r=>r.json())
        """)
        items = resp.get("data", {}).get("items", [])
        for i, item in enumerate(items[:10], 1):
            title = item.get("title", {}).get("name", "") or item.get("name", "")
            if title:
                save(conn, "tving", category, i, title)
    except Exception as e:
        print(f"[티빙 API][{category}] 에러: {e}")

# ── 웨이브 ───────────────────────────────────────────
async def crawl_wavve(page, conn):
    categories = [
        ("tv",    "tv"),
        ("movie", "movie"),
    ]
    for cat, param in categories:
        url = f"https://www.wavve.com/ranking?type={param}"
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_selector("[class*='ranking'] li, .ranking-list li", timeout=15000)
            items = await page.query_selector_all("[class*='ranking'] li, .ranking-list li")
            for i, item in enumerate(items[:10], 1):
                title_el = await item.query_selector("[class*='title'], .tit, strong")
                if title_el:
                    title = (await title_el.inner_text()).strip()
                    if title:
                        save(conn, "wavve", cat, i, title)
        except Exception as e:
            print(f"[웨이브][{cat}] 에러: {e}")
            await crawl_wavve_api(conn, cat)

async def crawl_wavve_api(conn, category):
    """웨이브 공개 API fallback"""
    import urllib.request, json
    type_map = {"tv": "drama", "movie": "movie"}
    ctype = type_map.get(category, "drama")
    url = f"https://apis.wavve.com/fz/ranking/contents?type={ctype}&limit=10&offset=0&orderBy=rank&platform=pc&apikey=E5F3E0D30947AA5440B9E4D870DB2E63D5572D4C"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        items = data.get("list", [])
        for i, item in enumerate(items[:10], 1):
            title = item.get("title", "")
            if title:
                save(conn, "wavve", category, i, title)
    except Exception as e:
        print(f"[웨이브 API][{category}] 에러: {e}")

# ── 쿠팡플레이 ──────────────────────────────────────
async def crawl_coupang(page, conn):
    categories = [
        ("tv",    "series"),
        ("movie", "movie"),
    ]
    for cat, param in categories:
        url = f"https://www.coupangplay.com/ranking?type={param}"
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_selector("[class*='ranking'] li, [class*='RankingItem']", timeout=15000)
            items = await page.query_selector_all("[class*='ranking'] li, [class*='RankingItem']")
            for i, item in enumerate(items[:10], 1):
                title_el = await item.query_selector("[class*='title'], [class*='Title'], strong")
                if title_el:
                    title = (await title_el.inner_text()).strip()
                    if title:
                        save(conn, "coupang", cat, i, title)
        except Exception as e:
            print(f"[쿠팡플레이][{cat}] 에러: {e}")

# ── 메인 ────────────────────────────────────────────
async def main():
    conn = init_db()
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="ko-KR",
            timezone_id="Asia/Seoul"
        )
        page = await context.new_page()

        print(f"\n{'='*40}")
        print(f"크롤링 시작: {TODAY}")
        print(f"{'='*40}")

        print("\n[티빙] 크롤링 중...")
        await crawl_tving(page, conn)

        print("\n[웨이브] 크롤링 중...")
        await crawl_wavve(page, conn)

        print("\n[쿠팡플레이] 크롤링 중...")
        await crawl_coupang(page, conn)

        await browser.close()
    conn.close()
    print("\n✅ 크롤링 완료!")

if __name__ == "__main__":
    asyncio.run(main())
