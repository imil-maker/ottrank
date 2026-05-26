"""FlixPatrol 공통 크롤링 로직"""
from playwright.async_api import async_playwright
import re

HEADERS = {
    "user_agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "locale": "ko-KR",
    "timezone_id": "Asia/Seoul",
}

# { platform: { category: table_index } }
# FlixPatrol 페이지에서 실제 테이블 위치 (0부터 시작)
# 넷플릭스: Overall(0), TV(1), Movie(2) ... → movie=0, tv=1
# 쿠팡:    Overall(0), Movie(1), TV(2)   → movie=1, tv=2
# 웨이브:   Overall(0), Movie(1), TV(2), TV(in korean)(3) → movie=1, tv=3
# 디즈니:   Overall(0), Movie(1), TV(2)  → movie=1, tv=2
CATEGORY_TABLE_INDEX = {
    "netflix": {"movie": 0, "tv": 1},
    "coupang": {"movie": 1, "tv": 2},
    "wavve":   {"movie": 1, "tv": 3},
    "disney":  {"movie": 1, "tv": 2},
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

            table_index = CATEGORY_TABLE_INDEX.get(platform, {"movie": 0, "tv": 1})
            for category, idx in table_index.items():
                if idx >= len(tables):
                    print(f"  [{platform}][{category}] ⚠️  테이블 없음 (index={idx}, 전체={len(tables)})")
                    continue
                print(f"  [{platform}][{category}] 테이블 index={idx} 사용")
                await _parse_table(tables[idx], conn, platform, category)
        except Exception as e:
            print(f"  [{platform}] 에러: {e}")
        finally:
            await browser.close()

async def _parse_table(table, conn, platform: str, category: str):
    from db import save
    try:
        rows = await table.query_selector_all("tbody tr")
        print(f"  [{platform}][{category}] 행 개수: {len(rows)}")
        count = 0
        for row in rows:
            if count >= 10:
                break
            try:
                rank_el  = await row.query_selector("td:first-child")
                title_el = await row.query_selector("a[href*='/title/']")
                if not rank_el or not title_el:
                    continue

                rank_txt  = (await rank_el.inner_text()).strip().rstrip(".").strip()
                title_txt = (await title_el.inner_text()).strip()

                if count == 0:
                    print(f"  [{platform}][{category}] rank='{rank_txt}' title='{title_txt}'")

                if not rank_txt.isdigit() or not title_txt:
                    continue

                # ── FlixPatrol title 링크에서 TMDB ID 직접 추출 ──────────────
                # FlixPatrol 작품 페이지에 TMDB 링크가 있음
                # href 예: /title/number-one → 작품 slug
                title_href = await title_el.get_attribute("href")
                tmdb_id, poster_path = await _fetch_tmdb_from_flixpatrol(
                    table, row, title_href, category
                )

                save(
                    conn, platform, category, int(rank_txt),
                    title_ko=title_txt,   # FlixPatrol은 영어 제목만 제공
                    title_en=title_txt,
                    tmdb_id_override=tmdb_id,
                    poster_override=poster_path,
                )
                count += 1
            except Exception as e:
                if count == 0:
                    print(f"  [{platform}][{category}] row 에러: {e}")
                continue

        if count == 0:
            print(f"  [{platform}][{category}] ⚠️  데이터 없음")
    except Exception as e:
        print(f"  [{platform}][{category}] 파싱 에러: {e}")

async def _fetch_tmdb_from_flixpatrol(table, row, title_href, category):
    """
    FlixPatrol 행에서 TMDB 링크를 직접 읽어 tmdb_id와 poster_path 반환.
    FlixPatrol은 각 작품 행에 data-* 속성 또는 TMDB 링크를 포함하는 경우가 많음.
    없으면 (None, None) 반환 → db.py의 search_tmdb fallback 사용
    """
    try:
        # FlixPatrol 행에 TMDB 링크가 있는지 확인
        # 예: <a href="https://www.themoviedb.org/movie/526973">
        tmdb_el = await row.query_selector("a[href*='themoviedb.org']")
        if tmdb_el:
            href = await tmdb_el.get_attribute("href")
            # /movie/12345 또는 /tv/12345
            m = re.search(r'themoviedb\.org/(movie|tv)/(\d+)', href)
            if m:
                tmdb_id = int(m.group(2))
                # poster는 db.py에서 tmdb_id로 직접 조회
                poster = await _get_poster_by_id(tmdb_id, m.group(1))
                return tmdb_id, poster
    except Exception:
        pass
    return None, None

async def _get_poster_by_id(tmdb_id: int, media_type: str):
    """tmdb_id로 poster_path 직접 조회"""
    import requests
    TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"
    try:
        url = f"{TMDB_PROXY}/{media_type}/{tmdb_id}"
        resp = requests.get(url, params={"language": "ko-KR"}, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("poster_path")
    except Exception:
        pass
    return None
