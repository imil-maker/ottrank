"""티빙 랭킹"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
import random
import sqlite3
from playwright.async_api import async_playwright
from db import init_db, get_today, lookup_works, search_tmdb_korean, translate_titles_to_korean, insert_work

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


def _is_crawl_locked(conn: sqlite3.Connection, rank: int) -> bool:
    """해당 순위에 is_manual=2(날짜고정) 행이 오늘 날짜로 이미 존재하는지 확인.
    존재하면 크롤러가 덮어쓰지 않고 건너뜀.
    rank 기준으로 체크 — 같은 슬롯에서 순위 위치 보호.
    """
    today = get_today()
    row = conn.execute("""
        SELECT id FROM rankings
        WHERE date = ? AND platform = ? AND category_slot = ?
          AND rank = ? AND is_manual = 2
        LIMIT 1
    """, (today, PLATFORM, CATEGORY_SLOT, rank)).fetchone()
    return row is not None


def _save_tving(conn: sqlite3.Connection, rank: int, title_ko: str, tmdb_data: dict | None):
    """티빙 랭킹 rankings 테이블에 저장.
    is_manual=2(날짜고정) 행이 해당 순위에 있으면 INSERT를 건너뜀.
    """
    # ── 날짜고정 체크 ────────────────────────────────────────────
    # 같은 날짜·플랫폼·슬롯·순위에 is_manual=2 행이 있으면 보호 대상
    today = get_today()
    locked_row = conn.execute("""
        SELECT id, title_ko FROM rankings
        WHERE date = ? AND platform = ? AND category_slot = ?
          AND rank = ? AND is_manual = 2
        LIMIT 1
    """, (today, PLATFORM, CATEGORY_SLOT, rank)).fetchone()

    if locked_row:
        print(f"  📌 [티빙] {rank:2d}. '{locked_row[1]}' → 날짜고정(is_manual=2) — 건너뜀")
        return
    # ──────────────────────────────────────────────────────────────

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
    print("\n[티빙] 랭킹 수집 중...")
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
        page    = await context.new_page()
        titles  = await _crawl(page)
        await browser.close()

    if not titles:
        print("  [티빙] 데이터 없음")
        return

    # ── 그룹별 랜덤 배치 ──────────────────────────────────────────
    # 1~10위: 3개 그룹으로 나눠 각각 랜덤 셔플
    # 11위~: 나머지 전체 랜덤 셔플
    top10   = titles[:10]
    rest    = titles[10:]

    g1 = top10[0:4];  random.shuffle(g1)   # 1~4위 그룹
    g2 = top10[4:7];  random.shuffle(g2)   # 5~7위 그룹
    g3 = top10[7:10]; random.shuffle(g3)   # 8~10위 그룹
    random.shuffle(rest)                    # 11위~ 전체 랜덤

    ranked_titles = g1 + g2 + g3 + rest    # 최종 순위 목록

    # ── TMDB 매칭 및 저장 ────────────────────────────────────────
    for rank, title_ko in enumerate(ranked_titles, start=1):
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

        # ② TMDB 한글 검색
        tmdb_data = search_tmdb_korean(title_ko)
        if tmdb_data:
            tmdb_data["title_en"] = tmdb_data.get("title_en") or title_ko
            print(f"  ✅ [티빙] {rank:2d}. '{title_ko}' → TMDB 매칭 (tmdb_id={tmdb_data['tmdb_id']})")
            insert_work(conn, tmdb_data, match_source="auto_claude")
            _save_tving(conn, rank, title_ko, tmdb_data)
        else:
            print(f"  ⚠️ [티빙] {rank:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
            conn.execute("""
                INSERT OR IGNORE INTO review_queue
                    (platform, category_slot, rank, title_en, title_ko_guess, fail_reason, crawled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (PLATFORM, CATEGORY_SLOT, rank, title_ko, title_ko, "tmdb_not_found", get_today()))
            conn.commit()
            _save_tving(conn, rank, title_ko, None)

    print(f"  [티빙] {len(ranked_titles)}개 처리 완료")


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
