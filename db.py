"""
넷플릭스 Tudum 공식 TOP10 크롤러 v2
────────────────────────────────────────────────────────────────
출처:
  - 전세계 영화:     https://www.netflix.com/tudum/top10
  - 전세계 TV시리즈: https://www.netflix.com/tudum/top10/tv

업데이트 주기: 매주 화요일 (주간 데이터)

크롤링 카테고리 2개 (ott_categories crawl_url 기준):
  category07 → /tudum/top10    → 전세계 영화 TOP 10
  category08 → /tudum/top10/tv → 전세계 TV 시리즈 TOP 10

파싱 전략:
  각 URL의 overview 테이블(table_index=0) 첫 번째 테이블에서
  순위 + 제목 추출
────────────────────────────────────────────────────────────────
"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from playwright.async_api import async_playwright

# 브라우저 설정
BROWSER_HEADERS = {
    "user_agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "locale":      "en-US",   # 영어 제목으로 가져오기
    "timezone_id": "Asia/Seoul",
}


def get_tudum_slots(local_conn) -> list[dict]:
    """
    로컬 DB에서 Tudum URL을 가진 netflix 슬롯 조회
    table_index 오름차순
    """
    try:
        rows = local_conn.execute("""
            SELECT category_slot, table_index, source_name, crawl_limit, crawl_url
            FROM ott_categories
            WHERE platform = 'netflix'
              AND is_active = 1
              AND crawl_url LIKE '%tudum%'
            ORDER BY table_index ASC
        """).fetchall()

        return [
            {
                "category_slot": row[0],
                "table_index":   row[1],
                "source_name":   row[2],
                "crawl_limit":   row[3],
                "crawl_url":     row[4],
            }
            for row in rows
        ]
    except Exception as e:
        print(f"  [netflix_tudum] ⚠️ 슬롯 조회 실패: {e}")
        return []


async def _crawl_one_url(browser, url: str, source_name: str, platform: str,
                          category_slot: str, crawl_limit: int) -> list[dict]:
    """
    Tudum URL 1개를 열어서 overview 테이블 첫 번째에서 TOP10 파싱
    """
    print(f"  [netflix_tudum][{category_slot}] 페이지 로드: {url}")
    results = []

    context = await browser.new_context(
        user_agent=BROWSER_HEADERS["user_agent"],
        locale=BROWSER_HEADERS["locale"],
        timezone_id=BROWSER_HEADERS["timezone_id"],
    )
    page = await context.new_page()

    try:
        resp = await page.goto(url, wait_until="domcontentloaded", timeout=40000)
        print(f"  [netflix_tudum][{category_slot}] HTTP status: {resp.status}")

        if resp.status != 200:
            print(f"  [netflix_tudum][{category_slot}] ⚠️ 페이지 로드 실패")
            return []

        # overview 테이블 로딩 대기
        await page.wait_for_selector("table", timeout=20000)

        # 첫 번째 테이블 파싱 (Global TOP 10 overview)
        tables = await page.query_selector_all("table")
        print(f"  [netflix_tudum][{category_slot}] 테이블 수: {len(tables)}")

        if not tables:
            print(f"  [netflix_tudum][{category_slot}] ⚠️ 테이블 없음")
            return []

        # table_index=0 → 첫 번째 테이블
        table = tables[0]
        rows  = await table.query_selector_all("tbody tr")
        print(f"  [netflix_tudum][{category_slot}] 행 수: {len(rows)}")

        count = 0
        for row in rows:
            if count >= crawl_limit:
                break
            try:
                # Tudum 테이블 구조:
                # td[0]: "01<img>Office Romance" (순위+포스터+제목 혼합)
                # td[1]: 전주 순위
                # td[2]: 시청 수
                # td[3]: 런타임
                # td[4]: 총 시청 시간
                first_td = await row.query_selector("td:first-child")
                if not first_td:
                    continue

                full_text = (await first_td.inner_text()).strip()
                if not full_text:
                    continue

                # "01Office Romance" → "Office Romance" (앞 2자리 숫자 제거)
                title_txt = re.sub(r'^\d{2}', '', full_text).strip()

                # Tudum TV 페이지 불필요 suffix 제거
                # 예) "The Witness: Limited Series" → "The Witness"
                # 예) "The Four Seasons: Season 2" → "The Four Seasons"
                # 예) "Raw: 2026 - June 1, 2026" → "Raw"
                title_txt = re.sub(
                    r':\s*(Season\s*\d+|Limited Series|Mini Series|\d{4}.*)$',
                    '', title_txt, flags=re.IGNORECASE
                ).strip()

                if not title_txt:
                    continue

                rank = count + 1
                if count == 0:
                    print(f"    첫 항목: rank={rank}, title='{title_txt}'")

                results.append({
                    "platform":      platform,
                    "category_slot": category_slot,
                    "source_name":   source_name,
                    "rank":          rank,
                    "title_en":      title_txt,
                })
                count += 1

            except Exception as e:
                print(f"    행 파싱 에러: {e}")
                continue

        print(f"  [netflix_tudum][{category_slot}] 수집: {len(results)}개")

    except Exception as e:
        print(f"  [netflix_tudum][{category_slot}] 크롤링 에러: {e}")
    finally:
        await context.close()

    return results


async def crawl_netflix_tudum(local_conn) -> list[dict]:
    """
    Netflix Tudum TOP10 전체 크롤링
    슬롯별로 각자 URL을 열어서 파싱
    """
    slots = get_tudum_slots(local_conn)
    if not slots:
        print("  [netflix_tudum] ⚠️ Tudum 슬롯 없음")
        return []

    print(f"  [netflix_tudum] 슬롯 {len(slots)}개: {[s['category_slot'] for s in slots]}")

    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        try:
            # 슬롯별로 URL 크롤링 (category07: 영화, category08: TV)
            for slot in slots:
                slot_results = await _crawl_one_url(
                    browser,
                    url           = slot["crawl_url"],
                    source_name   = slot["source_name"],
                    platform      = "netflix",
                    category_slot = slot["category_slot"],
                    crawl_limit   = slot["crawl_limit"],
                )
                results.extend(slot_results)
        finally:
            await browser.close()

    return results


async def run(local_conn, save_fn=None):
    """run_all.py에서 호출하는 진입점"""
    print("\n[netflix_tudum] Netflix Tudum TOP10 크롤링 시작...")
    results = await crawl_netflix_tudum(local_conn)

    if save_fn and results:
        print(f"  [netflix_tudum] {len(results)}개 저장 시작...")
        await save_fn(local_conn, results)

    print(f"  [netflix_tudum] 완료 — 총 {len(results)}개")
    return results


if __name__ == "__main__":
    import asyncio
    from db import init_db, save_rankings_batch
    conn = init_db()
    asyncio.run(run(conn, save_rankings_batch))
    conn.close()
