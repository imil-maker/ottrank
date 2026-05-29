"""티빙 랭킹 크롤러
- category01: 키노라이츠 (기존 유지, Playwright)
- category02: 티빙 홈페이지 직접 크롤링 (__NEXT_DATA__ 파싱, requests + Playwright fallback)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import json
import sqlite3
import time
import random
import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from db import init_db, get_today, search_tmdb_korean, insert_work

# ─────────────────────────────────────────────
# 공통 상수
# ─────────────────────────────────────────────
PLATFORM = "tving"

# category01 - 키노라이츠
KINOLIGHTS_URL    = "https://m.kinolights.com/ranking/tving?category=series"
CATEGORY01_SLOT   = "category01"
CATEGORY01_SOURCE = "TOP 10 Overall"
CATEGORY01_LIMIT  = 10

# category02 - 티빙 홈페이지 직접
TVING_HOME_URL    = "https://www.tving.com"
CATEGORY02_SLOT   = "category02"
CATEGORY02_SOURCE = "TOP 20"
CATEGORY02_LIMIT  = 20

# 데스크탑 User-Agent (티빙 홈페이지용)
DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# 모바일 User-Agent (키노라이츠용, 기존 유지)
MOBILE_USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 10; SM-G981B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Mobile Safari/537.36"
)


# ─────────────────────────────────────────────
# 공통 저장 함수 (category_slot 파라미터화)
# ─────────────────────────────────────────────
def _save_tving(
    conn: sqlite3.Connection,
    rank: int,
    title_ko: str,
    tmdb_data: dict | None,
    category_slot: str,
    source_name: str,
):
    """티빙 랭킹 rankings 테이블에 저장 (category_slot 공용)"""
    today = get_today()
    if tmdb_data:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank,
                 title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            today, PLATFORM, category_slot, category_slot, source_name, rank,
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
        """, (today, PLATFORM, category_slot, category_slot, source_name, rank, title_ko, title_ko))
    conn.commit()


# ─────────────────────────────────────────────
# 공통 매칭 파이프라인 (category_slot 파라미터화)
# ─────────────────────────────────────────────
def _process_titles(conn: sqlite3.Connection, titles: list, category_slot: str, source_name: str):
    """크롤링된 한글 제목 리스트를 TMDB 매칭 후 rankings에 저장"""
    label = f"[티빙/{category_slot}]"

    for rank, title_ko in titles:
        # ① works DB 우선 조회 (한글 제목 기준)
        works_data = conn.execute("""
            SELECT tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating
            FROM works WHERE title_ko = ? LIMIT 1
        """, (title_ko,)).fetchone()

        if works_data:
            tmdb_data = dict(zip(
                ["tmdb_id", "title_ko", "title_en", "poster_path",
                 "genre", "overview", "release_year", "tmdb_rating"],
                works_data
            ))
            print(f"  ✅ {label} {rank:2d}. '{title_ko}' → works DB (tmdb_id={tmdb_data['tmdb_id']})")
            _save_tving(conn, rank, title_ko, tmdb_data, category_slot, source_name)
            continue

        # ② TMDB 한글 검색 (티빙은 이미 한글 제목)
        tmdb_data = search_tmdb_korean(title_ko)
        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_ko
            print(f"  ✅ {label} {rank:2d}. '{title_ko}' → TMDB 매칭 (tmdb_id={tmdb_data['tmdb_id']})")
            insert_work(conn, tmdb_data, match_source="auto_tmdb")
            _save_tving(conn, rank, title_ko, tmdb_data, category_slot, source_name)
        else:
            print(f"  ⚠️ {label} {rank:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                    (platform, category_slot, rank, title_en, title_ko_guess, fail_reason, crawled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (PLATFORM, category_slot, rank, title_ko, title_ko, "tmdb_not_found", get_today()))
            conn.commit()
            _save_tving(conn, rank, title_ko, None, category_slot, source_name)

    print(f"  {label} {len(titles)}개 처리 완료")


# ─────────────────────────────────────────────
# category01: 키노라이츠 크롤링 (Playwright, 기존 유지)
# ─────────────────────────────────────────────
async def _crawl_kinolights(page) -> list[tuple]:
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
            if count >= CATEGORY01_LIMIT:
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
            print("  [티빙/category01] ⚠️ 데이터 없음")
    except Exception as e:
        print(f"  [티빙/category01] 에러: {e}")
    return titles


# ─────────────────────────────────────────────
# category02: 티빙 홈페이지 __NEXT_DATA__ 파싱
# ─────────────────────────────────────────────
def _crawl_tving_requests() -> list[tuple]:
    """
    requests로 티빙 홈페이지 GET → __NEXT_DATA__ JSON 파싱
    → bandType == 'VOD_BASIC_RANKING' 밴드에서 TOP 20 추출
    반환: [(rank, title_ko), ...] 또는 빈 리스트 (실패 시 Playwright fallback)
    """
    # 봇 차단 우회: 실제 브라우저와 동일한 헤더 세팅
    headers = {
        "User-Agent": DESKTOP_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "Referer": "https://www.google.com/",  # 구글에서 유입된 것처럼 위장
    }

    try:
        # 랜덤 딜레이 (봇 패턴 방지)
        time.sleep(random.uniform(1.0, 2.5))

        session = requests.Session()
        resp = session.get(
            TVING_HOME_URL,
            headers=headers,
            timeout=20,
            allow_redirects=True,
        )

        if resp.status_code != 200:
            print(f"  [티빙/category02] HTTP {resp.status_code} → Playwright fallback 시도")
            return []

        # __NEXT_DATA__ script 태그 파싱
        soup = BeautifulSoup(resp.text, "html.parser")
        next_data_tag = soup.find("script", {"id": "__NEXT_DATA__"})

        if not next_data_tag:
            print("  [티빙/category02] __NEXT_DATA__ 태그 없음 → Playwright fallback 시도")
            return []

        next_data = json.loads(next_data_tag.string)
        titles = _extract_ranking_from_next_data(next_data)

        if not titles:
            print("  [티빙/category02] VOD_BASIC_RANKING 밴드 없음 → Playwright fallback 시도")

        return titles

    except requests.exceptions.RequestException as e:
        print(f"  [티빙/category02] requests 에러: {e} → Playwright fallback 시도")
        return []
    except json.JSONDecodeError as e:
        print(f"  [티빙/category02] JSON 파싱 에러: {e} → Playwright fallback 시도")
        return []
    except Exception as e:
        print(f"  [티빙/category02] 예외: {e} → Playwright fallback 시도")
        return []


def _extract_ranking_from_next_data(next_data: dict) -> list[tuple]:
    """
    __NEXT_DATA__ JSON에서 VOD_BASIC_RANKING 밴드를 찾아 제목 리스트 반환
    Next.js 구조: next_data → props → pageProps → 밴드 데이터 (중첩 구조 재귀 탐색)
    """
    titles = []
    try:
        page_props = next_data.get("props", {}).get("pageProps", {})
        bands = _find_bands_recursive(page_props)

        for band in bands:
            if band.get("bandType", "") == "VOD_BASIC_RANKING":
                items = band.get("items", [])
                print(f"  [티빙/category02] '{band.get('bandName', '')}' 밴드 발견 ({len(items)}개)")
                for idx, item in enumerate(items[:CATEGORY02_LIMIT]):
                    title = item.get("title", "").strip()
                    if title:
                        titles.append((idx + 1, title))
                break  # 첫 번째 VOD_BASIC_RANKING만 사용

    except Exception as e:
        print(f"  [티빙/category02] 데이터 추출 에러: {e}")

    return titles


def _find_bands_recursive(data, depth=0, max_depth=10) -> list:
    """
    JSON 구조를 재귀 탐색하여 bandType 키를 가진 객체 리스트 반환
    Next.js pageProps 구조가 중첩되어 있을 수 있으므로 재귀 탐색
    """
    if depth > max_depth:
        return []

    bands = []
    if isinstance(data, dict):
        if "bandType" in data:
            bands.append(data)
        for value in data.values():
            bands.extend(_find_bands_recursive(value, depth + 1, max_depth))
    elif isinstance(data, list):
        for item in data:
            bands.extend(_find_bands_recursive(item, depth + 1, max_depth))

    return bands


async def _crawl_tving_playwright() -> list[tuple]:
    """
    Playwright fallback: 티빙 홈페이지 렌더링 후 __NEXT_DATA__ 파싱
    requests 실패 시 자동 호출
    """
    titles = []
    print("  [티빙/category02] Playwright fallback 시작...")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            context = await browser.new_context(
                user_agent=DESKTOP_USER_AGENT,
                locale="ko-KR",
                timezone_id="Asia/Seoul",
                viewport={"width": 1280, "height": 800},
                extra_http_headers={
                    "Accept-Language": "ko-KR,ko;q=0.9",
                    "Referer": "https://www.google.com/",
                }
            )
            page = await context.new_page()

            # webdriver 감지 우회
            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            """)

            await page.goto(TVING_HOME_URL, wait_until="domcontentloaded", timeout=40000)

            # __NEXT_DATA__ script 태그에서 JSON 추출
            next_data_json = await page.evaluate("""
                () => {
                    const el = document.getElementById('__NEXT_DATA__');
                    return el ? el.textContent : null;
                }
            """)

            await browser.close()

            if not next_data_json:
                print("  [티빙/category02] Playwright에서도 __NEXT_DATA__ 없음")
                return []

            next_data = json.loads(next_data_json)
            titles = _extract_ranking_from_next_data(next_data)

    except Exception as e:
        print(f"  [티빙/category02] Playwright fallback 에러: {e}")

    return titles


# ─────────────────────────────────────────────
# 메인 실행 함수 (run_all.py에서 호출)
# ─────────────────────────────────────────────
async def run(conn: sqlite3.Connection):
    """category01(키노라이츠) + category02(티빙 홈) 순차 실행"""

    # ── category01: 키노라이츠 (Playwright) ──
    print("\n[티빙] category01 크롤링 중... (키노라이츠)")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent=MOBILE_USER_AGENT,
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            viewport={"width": 390, "height": 844},
        )
        page = await context.new_page()
        titles_cat01 = await _crawl_kinolights(page)
        await browser.close()

    if titles_cat01:
        _process_titles(conn, titles_cat01, CATEGORY01_SLOT, CATEGORY01_SOURCE)
    else:
        print("  [티빙/category01] 데이터 없음")

    # ── category02: 티빙 홈페이지 직접 ──
    print("\n[티빙] category02 크롤링 중... (티빙 홈페이지 직접)")

    # 1차 시도: requests (가볍고 빠름)
    titles_cat02 = _crawl_tving_requests()

    # 2차 시도: Playwright fallback (requests 실패 시)
    if not titles_cat02:
        titles_cat02 = await _crawl_tving_playwright()

    if titles_cat02:
        _process_titles(conn, titles_cat02, CATEGORY02_SLOT, CATEGORY02_SOURCE)
    else:
        print("  [티빙/category02] 최종 데이터 없음 (requests + Playwright 모두 실패)")


if __name__ == "__main__":
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
