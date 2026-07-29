"""
FlixPatrol 공통 크롤링 로직 v4
────────────────────────────────────────────────────────────────
2026-07-29 rev.1 — flixpatrol_base.py (403 차단 대응: 자동화 탐지(안티봇) 우회 추가 —
  navigator.webdriver 등 숨기는 stealth 스크립트 주입, --disable-blink-features=
  AutomationControlled, 실제 해상도 뷰포트, 모든 요청에 브라우저형 헤더 항상 적용
  (기존 world-URL 한정 로직의 중복조건 오타도 같이 수정). IP 차단이 아니라 Playwright
  자동화 탐지 문제인 것으로 확인 후 진행)
────────────────────────────────────────────────────────────────
변경사항 (v2 → v3):
  - ott_categories.crawl_url 컬럼 지원 추가
    → 슬롯별로 crawl_url 있으면 해당 URL 사용
    → 없으면 기존 PLATFORM_URLS 사용 (하위 호환 유지)
  - 같은 URL을 여러 슬롯이 공유할 때 URL당 1번만 페이지 로드
    → category07(Movies), category08(TV Shows) 둘 다 월드 URL이어도
       페이지 1번만 로드 후 각각 table_index로 파싱 (성능 최적화)
────────────────────────────────────────────────────────────────
"""
from playwright.async_api import async_playwright
from datetime import datetime, timezone, timedelta
import sqlite3
import os
import re

# 어제 날짜 (KST 기준) — FlixPatrol 월드 URL용
# 오늘 데이터는 업데이트 중일 수 있으므로 어제 날짜 사용
KST       = timezone(timedelta(hours=9))
YESTERDAY = (datetime.now(KST) - timedelta(days=1)).strftime('%Y-%m-%d')

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

# FlixPatrol 월드 페이지 접근용 추가 헤더
# GitHub Actions IP 차단 우회 — 실제 브라우저처럼 위장
WORLD_EXTRA_HEADERS = {
    "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language":           "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding":           "gzip, deflate, br",
    "Referer":                   "https://flixpatrol.com/",
    "sec-ch-ua":                 '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile":          "?0",
    "sec-ch-ua-platform":        '"Windows"',
    "sec-fetch-dest":            "document",
    "sec-fetch-mode":            "navigate",
    "sec-fetch-site":            "same-origin",
    "sec-fetch-user":            "?1",
    "upgrade-insecure-requests": "1",
    "Cache-Control":             "max-age=0",
    "Connection":                "keep-alive",
}

# FlixPatrol OTT별 기본 URL 매핑 (crawl_url 없는 슬롯용 fallback)
PLATFORM_URLS = {
    "netflix":    "https://flixpatrol.com/top10/netflix/south-korea/",
    "disney":     "https://flixpatrol.com/top10/disney/south-korea/",
    "wavve":      "https://flixpatrol.com/top10/wavve/south-korea/",
    "coupang":    "https://flixpatrol.com/top10/coupang-play/south-korea/",
}


# [2026-07-29 신규] Playwright 자동화 탐지(안티봇) 우회용 — 페이지 로드 전에 주입해서
# "이 브라우저는 자동화 프로그램이다"라고 알려주는 대표적인 신호들을 감춤.
# navigator.webdriver=true가 가장 흔한 탐지 신호라 이것만 꺼도 상당수 안티봇을 통과함.
STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
window.chrome = { runtime: {} };
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters)
);
"""


def get_category_slots(local_conn, platform: str) -> list[dict]:
    """
    로컬 SQLite DB에서 해당 플랫폼의 category_slot 설정 조회
    crawl_url 컬럼 포함 — 없으면 None 반환 (PLATFORM_URLS fallback)
    반환: [{ category_slot, table_index, source_name, crawl_limit, crawl_url }, ...]
    table_index 오름차순 정렬
    """
    try:
        # crawl_url 컬럼 포함 조회 (v3 신규)
        rows = local_conn.execute("""
            SELECT category_slot, table_index, source_name, crawl_limit, crawl_url
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
                "crawl_url":     row[4],  # None이면 PLATFORM_URLS fallback
            }
            for row in rows
        ]
    except Exception as e:
        # crawl_url 컬럼 없는 구버전 DB 하위 호환
        print(f"  [{platform}] ⚠️ crawl_url 컬럼 없음 — 구버전 호환 모드: {e}")
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
                "crawl_url":     None,
            }
            for row in rows
        ]


async def crawl_flixpatrol(platform: str, local_conn) -> list[dict]:
    """
    FlixPatrol OTT 페이지 크롤링 메인 함수

    v3 변경사항:
      - 슬롯별 crawl_url 지원
      - URL 그룹핑: 같은 URL이면 페이지 1번만 로드 후 여러 슬롯 파싱
        (category07, category08 모두 월드 URL → 페이지 1번 로드)

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
    # DB에서 슬롯 설정 조회 (crawl_url 포함)
    slots = get_category_slots(local_conn, platform)
    if not slots:
        print(f"  [{platform}] ⚠️ ott_categories에 슬롯 설정 없음")
        return []

    print(f"  [{platform}] 슬롯 {len(slots)}개: {[s['category_slot'] for s in slots]}")

    # ── URL 그룹핑 ───────────────────────────────────────────
    # 같은 URL을 여러 슬롯이 공유할 때 페이지 1번만 로드
    # { url: [slot, slot, ...] }
    default_url = PLATFORM_URLS.get(platform)
    url_groups  = {}

    for slot in slots:
        # table_index = -1 이면 크롤링 스킵 (수동 랭킹 등 크롤링 불필요 슬롯)
        if slot["table_index"] == -1:
            print(f"  [{platform}][{slot['category_slot']}] ⏭ table_index=-1 — 크롤링 스킵")
            continue

        # crawl_url 있으면 사용, 없으면 PLATFORM_URLS fallback
        raw_url = slot["crawl_url"] or default_url
        if not raw_url:
            print(f"  [{platform}][{slot['category_slot']}] ⚠️ URL 없음 — 스킵")
            continue

        # Tudum URL이면 별도 크롤러에서 처리 → 여기서는 스킵
        if "tudum" in raw_url:
            print(f"  [{platform}][{slot['category_slot']}] ⏭ Tudum URL — netflix_tudum.py에서 처리")
            continue

        # FlixPatrol 기본 URL (south-korea/world 없는 것)은 requests 기반 크롤러에서 처리
        # 예) https://flixpatrol.com/top10/netflix/ → netflix_tudum.py에서 처리
        if re.search(r"flixpatrol\.com/top10/[^/]+/$", raw_url):
            print(f"  [{platform}][{slot['category_slot']}] ⏭ FlixPatrol 기본 URL — netflix_tudum.py에서 처리")
            continue

        # {date} placeholder → 어제 날짜로 치환
        # 예) https://flixpatrol.com/top10/netflix/world/{date}/
        #   → https://flixpatrol.com/top10/netflix/world/2026-06-11/
        url = raw_url.replace("{date}", YESTERDAY)

        if url not in url_groups:
            url_groups[url] = []
        url_groups[url].append(slot)

    if not url_groups:
        print(f"  [{platform}] ⚠️ 크롤링할 URL 없음")
        return []

    print(f"  [{platform}] URL 그룹 {len(url_groups)}개: {list(url_groups.keys())}")

    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
                # [2026-07-29 신규] 크로미움이 "자동화로 제어되고 있다"고 스스로 표시하는
                # 내부 플래그를 끔 — navigator.webdriver 등 여러 탐지 신호의 근본 원인
                "--disable-blink-features=AutomationControlled",
            ]
        )
        context = await browser.new_context(
            user_agent=BROWSER_HEADERS["user_agent"],
            locale=BROWSER_HEADERS["locale"],
            timezone_id=BROWSER_HEADERS["timezone_id"],
            viewport={"width": 1920, "height": 1080},  # 실제 데스크탑 해상도처럼 보이게
        )
        # [2026-07-29 신규] 모든 페이지 로드 전에 탐지 우회 스크립트 주입
        await context.add_init_script(STEALTH_INIT_SCRIPT)
        page = await context.new_page()

        try:
            # URL 그룹별로 페이지 로드 → 각 슬롯 파싱
            for url, url_slots in url_groups.items():
                print(f"  [{platform}] 페이지 로드: {url}")

                try:
                    # [2026-07-29 수정] 기존엔 "world" URL에만 이 헤더를 쓰고 나머지는 헤더를
                    # 비웠는데(게다가 조건식 자체도 "world" in url 중복 오타), 탐지 우회
                    # 관점에서는 모든 요청이 실제 브라우저처럼 보이는 게 유리해서 항상 적용.
                    await page.set_extra_http_headers(WORLD_EXTRA_HEADERS)

                    resp = await page.goto(url, wait_until="domcontentloaded", timeout=40000)
                    print(f"  [{platform}] HTTP status: {resp.status}")

                    # card-table 셀렉터로 모든 테이블 수집
                    await page.wait_for_selector("table.card-table", timeout=20000)
                    tables = await page.query_selector_all("table.card-table")
                    print(f"  [{platform}] 전체 테이블 수: {len(tables)}")

                    # 이 URL에 속한 슬롯들 파싱
                    for slot in url_slots:
                        idx           = slot["table_index"]
                        category_slot = slot["category_slot"]
                        source_name   = slot["source_name"]
                        crawl_limit   = slot["crawl_limit"]

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
                    print(f"  [{platform}] URL 로드 에러 ({url}): {e}")
                    continue  # 이 URL 실패해도 다음 URL 계속 진행

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
