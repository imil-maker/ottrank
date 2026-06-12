"""
넷플릭스 Tudum 공식 TOP10 크롤러 v3
────────────────────────────────────────────────────────────────
출처:
  - 전세계 영화:     https://www.netflix.com/tudum/top10
  - 전세계 TV시리즈: https://www.netflix.com/tudum/top10/tv

업데이트 주기: 매주 화요일 (주간 데이터)

파싱 전략:
  각 페이지의 "Global Top 10" 섹션 헤더(h2) 다음에 오는
  overview 테이블에서 전세계 통합 순위 추출
  (영어/비영어 통합 — 영어권만 나오는 기본 탭 아님)
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
    "locale":      "en-US",
    "timezone_id": "Asia/Seoul",
}


def get_tudum_slots(local_conn) -> list[dict]:
    """로컬 DB에서 Tudum URL을 가진 netflix 슬롯 조회"""
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


def _clean_title(title: str) -> str:
    """
    Tudum 테이블 제목 클렌징
    - 앞 2자리 순위 번호 제거: "01Office Romance" → "Office Romance"
    - 시즌/에피소드 suffix 제거:
        "The Witness: Limited Series" → "The Witness"
        "The Four Seasons: Season 2"  → "The Four Seasons"
        "Raw: 2026 - June 1, 2026"   → "Raw"
        "Lawmen: Bass Reeves: Season 1" → "Lawmen: Bass Reeves"
    """
    # 앞 2자리 숫자 제거
    title = re.sub(r'^\d{2}', '', title).strip()

    # 마지막 ": Season N / Limited Series / Mini Series / 연도..." 제거
    title = re.sub(
        r':\s*(Season\s*\d+|Limited Series|Mini Series|\d{4}.*)$',
        '', title, flags=re.IGNORECASE
    ).strip()

    return title


async def _parse_global_top10(page, category_slot: str, source_name: str,
                               crawl_limit: int) -> list[dict]:
    """
    Tudum 페이지에서 'Global Top 10' 헤더(h2) 바로 다음 테이블 파싱
    영어/비영어 통합 전세계 순위

    페이지 구조:
      <h2>Global Top 10 Movies</h2>  or  <h2>Global Top 10 TV Shows</h2>
      ...
      <table>  ← 이 테이블의 overview 섹션 파싱
        <tbody>
          <tr> <td>01Office Romance</td> <td>1</td> <td>20,900,000</td> ... </tr>
        </tbody>
      </table>
    """
    results = []

    try:
        # h2 헤더 중 "Global Top 10" 포함하는 것 찾기
        h2_elements = await page.query_selector_all("h2")
        target_h2   = None

        for h2 in h2_elements:
            text = (await h2.inner_text()).strip()
            if "Global Top 10" in text:
                target_h2 = h2
                print(f"    [global] 헤더 발견: '{text}'")
                break

        if not target_h2:
            print(f"    [global] ⚠️ 'Global Top 10' 헤더 없음 — 첫 번째 테이블 fallback")
            # fallback: 첫 번째 테이블 사용
            tables = await page.query_selector_all("table")
            if not tables:
                print(f"    [global] ⚠️ 테이블도 없음")
                return []
            target_table = tables[0]
        else:
            # h2의 위치를 파악해서 해당 h2 이후에 등장하는 첫 번째 table 찾기
            # DOM 전체 순서(document order)로 h2 인덱스 확인 후 그 다음 table 선택
            table_index = await page.evaluate("""
                (h2) => {
                    const allH2 = Array.from(document.querySelectorAll('h2'));
                    const h2Idx = allH2.indexOf(h2);
                    const allTables = Array.from(document.querySelectorAll('table'));

                    // h2보다 DOM 순서상 뒤에 있는 첫 번째 table의 인덱스 반환
                    for (let i = 0; i < allTables.length; i++) {
                        const pos = h2.compareDocumentPosition(allTables[i]);
                        // DOCUMENT_POSITION_FOLLOWING = 4
                        if (pos & 4) return i;
                    }
                    return 0; // fallback: 첫 번째 테이블
                }
            """, target_h2)

            print(f"    [global] Global Top 10 다음 테이블 index: {table_index}")
            tables = await page.query_selector_all("table")
            if not tables:
                print(f"    [global] ⚠️ 테이블 없음")
                return []
            target_table = tables[table_index]

        # 테이블 rows 파싱
        rows = await target_table.query_selector_all("tbody tr")
        print(f"    [global] 행 수: {len(rows)}")

        count = 0
        for row in rows:
            if count >= crawl_limit:
                break
            try:
                first_td = await row.query_selector("td:first-child")
                if not first_td:
                    continue

                full_text = (await first_td.inner_text()).strip()
                if not full_text:
                    continue

                title_txt = _clean_title(full_text)
                if not title_txt:
                    continue

                rank = count + 1
                if count == 0:
                    print(f"    첫 항목: rank={rank}, title='{title_txt}'")

                results.append({
                    "platform":      "netflix",
                    "category_slot": category_slot,
                    "source_name":   source_name,
                    "rank":          rank,
                    "title_en":      title_txt,
                })
                count += 1

            except Exception as e:
                print(f"    행 파싱 에러: {e}")
                continue

    except Exception as e:
        print(f"  [netflix_tudum][{category_slot}] 파싱 에러: {e}")

    return results


async def _crawl_one_url(browser, url: str, source_name: str,
                          category_slot: str, crawl_limit: int) -> list[dict]:
    """Tudum URL 1개 열어서 Global Top 10 섹션 파싱"""
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

        # 테이블 로딩 대기
        await page.wait_for_selector("table", timeout=20000)

        # ── 디버그: 페이지 내 모든 h2 텍스트와 테이블 수 출력 ──
        h2_texts = await page.evaluate("""
            () => Array.from(document.querySelectorAll('h2')).map(h => h.innerText.trim())
        """)
        table_count = await page.evaluate(""" () => document.querySelectorAll('table').length """)
        print(f"    [debug] h2 목록: {h2_texts}")
        print(f"    [debug] 전체 테이블 수: {table_count}")

        # 각 테이블의 첫 번째 행 첫 번째 셀 텍스트 출력
        table_previews = await page.evaluate("""
            () => Array.from(document.querySelectorAll('table')).map((t, i) => {
                const firstRow = t.querySelector('tbody tr td:first-child');
                return i + ': ' + (firstRow ? firstRow.innerText.trim().slice(0, 30) : 'empty');
            })
        """)
        for preview in table_previews:
            print(f"    [debug] table {preview}")
        # ── 디버그 끝 ──

        # Global Top 10 섹션 파싱
        results = await _parse_global_top10(
            page, category_slot, source_name, crawl_limit
        )
        print(f"  [netflix_tudum][{category_slot}] 수집: {len(results)}개")

    except Exception as e:
        print(f"  [netflix_tudum][{category_slot}] 크롤링 에러: {e}")
    finally:
        await context.close()

    return results


async def crawl_netflix_tudum(local_conn) -> list[dict]:
    """Netflix Tudum TOP10 전체 크롤링"""
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
            for slot in slots:
                slot_results = await _crawl_one_url(
                    browser,
                    url           = slot["crawl_url"],
                    source_name   = slot["source_name"],
                    category_slot = slot["category_slot"],
                    crawl_limit   = slot["crawl_limit"],
                )
                results.extend(slot_results)
        finally:
            await browser.close()

    return results


async def run(local_conn, save_fn=None):
    """run_all.py에서 호출하는 진입점"""
    print("\n[netflix_tudum] Netflix Tudum 전세계 TOP10 크롤링 시작...")
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
