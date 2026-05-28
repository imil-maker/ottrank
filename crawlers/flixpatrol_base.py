"""
FlixPatrol 공통 크롤링 로직 v2
────────────────────────────────────────────────────────────────
변경사항:
  - tv/movie 카테고리 코드 완전 삭제
  - category_slot(category01~09) 방식으로 전환
  - ott_categories DB에서 슬롯 설정 읽어서 크롤링
  - 크롤링 결과: 영어 제목 그대로 저장 (판단 없음)
  - TMDB 매칭은 db.py의 파이프라인에서 처리
────────────────────────────────────────────────────────────────
"""
from playwright.async_api import async_playwright
import sqlite3
import os

# 브라우저 설정
BROWSER_HEADERS = {
    "user_agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "locale":      "ko-KR",
    "timezone_id": "Asia/Seoul",
}

# FlixPatrol OTT별 URL 매핑
PLATFORM_URLS = {
    "netflix":    "https://flixpatrol.com/top10/netflix/south-korea/",
    "disney":     "https://flixpatrol.com/top10/disney/south-korea/",
    "wavve":      "https://flixpatrol.com/top10/wavve/south-korea/",
    "coupang":    "https://flixpatrol.com/top10/coupang-play/south-korea/",
}


def get_category_slots(local_conn, platform: str) -> list[dict]:
    """
    로컬 SQLite DB에서 해당 플랫폼의 category_slot 설정 조회
    반환: [{ category_slot, table_index, source_name, crawl_limit }, ...]
    table_index 오름차순 정렬
    """
    rows = local_conn.execute("""
        SELECT category_slot, table_index, source_name, crawl_limit
        FROM ott_categories
        WHERE platform = ? AND is_active = 1
        ORDER BY table_index ASC
    """, (platform,)).fetchall()

    return [
        {
            "category_slot": row[0],
            "table_index":   row[1],
            "source_name":   row[2],
            "crawl_limit":   row[3],
        }
        for row in rows
    ]


async def crawl_flixpatrol(platform: str, local_conn) -> list[dict]:
    """
    FlixPatrol OTT 페이지 크롤링 메인 함수

    반환: [
        {
            platform,
            category_slot,
            source_name,
            rank,
            title_en,      ← FlixPatrol 영어 원제 그대로
        },
        ...
    ]
    판단 없음 — 있는 그대로 반환, TMDB 매칭은 db.py에서 처리
    """
    url = PLATFORM_URLS.get(platform)
    if not url:
        print(f"  [{platform}] ⚠️ URL 없음")
        return []

    # DB에서 슬롯 설정 조회
    slots = get_category_slots(local_conn, platform)
    if not slots:
        print(f"  [{platform}] ⚠️ ott_categories에 슬롯 설정 없음")
        return []

    print(f"  [{platform}] 슬롯 {len(slots)}개: {[s['category_slot'] for s in slots]}")

    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent=BROWSER_HEADERS["user_agent"],
            locale=BROWSER_HEADERS["locale"],
            timezone_id=BROWSER_HEADERS["timezone_id"],
        )
        page = await context.new_page()

        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=40000)
            print(f"  [{platform}] HTTP status: {resp.status}")

            # card-table 셀렉터로 모든 테이블 수집
            await page.wait_for_selector("table.card-table", timeout=20000)
            tables = await page.query_selector_all("table.card-table")
            print(f"  [{platform}] 전체 테이블 수: {len(tables)}")

            # 슬롯별로 테이블 파싱
            for slot in slots:
                idx          = slot["table_index"]
                category_slot = slot["category_slot"]
                source_name  = slot["source_name"]
                crawl_limit  = slot["crawl_limit"]

                if idx >= len(tables):
                    print(f"  [{platform}][{category_slot}] ⚠️ 테이블 없음 (index={idx}, 전체={len(tables)})")
                    continue

                print(f"  [{platform}][{category_slot}] '{source_name}' 파싱 중 (table_index={idx}, limit={crawl_limit})")

                slot_results = await _parse_table(
                    tables[idx], platform, category_slot, source_name, crawl_limit
                )
                print(f"  [{platform}][{category_slot}] 수집: {len(slot_results)}개")
                results.extend(slot_results)

        except Exception as e:
            print(f"  [{platform}] 크롤링 에러: {e}")
        finally:
            await browser.close()

    return results


async def _parse_table(
    table,
    platform: str,
    category_slot: str,
    source_name: str,
    crawl_limit: int
) -> list[dict]:
    """
    card-table 하나를 파싱해서 랭킹 데이터 반환

    반환: [{ platform, category_slot, source_name, rank, title_en }, ...]
    - title_en: FlixPatrol 영어 원제 그대로 저장 (변환/판단 없음)
    - rank: 1부터 시작하는 실제 순위
    """
    results = []

    try:
        rows = await table.query_selector_all("tbody tr")
        print(f"    행 개수: {len(rows)}")

        count = 0
        for row in rows:
            if count >= crawl_limit:
                break

            try:
                rank_el  = await row.query_selector("td:first-child")
                title_el = await row.query_selector("a[href*='/title/']")

                if not rank_el or not title_el:
                    continue

                rank_txt  = (await rank_el.inner_text()).strip().rstrip(".").strip()
                title_txt = (await title_el.inner_text()).strip()

                # 순위가 숫자인지, 제목이 있는지 확인
                if not rank_txt.isdigit() or not title_txt:
                    continue

                rank = int(rank_txt)

                # 첫 번째 항목 로그
                if count == 0:
                    print(f"    첫 항목: rank={rank}, title='{title_txt}'")

                results.append({
                    "platform":      platform,
                    "category_slot": category_slot,
                    "source_name":   source_name,
                    "rank":          rank,
                    "title_en":      title_txt,   # 영어 원제 그대로
                })
                count += 1

            except Exception as e:
                print(f"    행 파싱 에러: {e}")
                continue

        if count == 0:
            print(f"    ⚠️ 데이터 없음")

    except Exception as e:
        print(f"  [{platform}][{category_slot}] 파싱 에러: {e}")

    return results
