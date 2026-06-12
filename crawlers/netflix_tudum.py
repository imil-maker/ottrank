"""
넷플릭스 FlixPatrol 전세계 랭킹 크롤러 v4
────────────────────────────────────────────────────────────────
출처: https://flixpatrol.com/top10/netflix/
  - 항상 오늘 날짜 전세계 통합 랭킹 반환
  - Playwright 불필요 — requests + BeautifulSoup 텍스트 파싱
  - table_index=0 → TOP Movies, table_index=1 → TOP TV Shows

장점:
  - 가볍고 빠름 (브라우저 실행 없음)
  - 차단 없음 (텍스트 페이지라 robots.txt 우호적)
  - 전세계 통합 랭킹 (영어권 편향 없음)
────────────────────────────────────────────────────────────────
"""
import sys, os, re, time
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import requests
from bs4 import BeautifulSoup

FLIXPATROL_NETFLIX_URL = "https://flixpatrol.com/top10/netflix/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer":         "https://flixpatrol.com/",
}


def get_flixpatrol_slots(local_conn) -> list[dict]:
    """
    로컬 DB에서 flixpatrol.com/top10/netflix/ URL을 가진 슬롯 조회
    table_index 오름차순 (0=Movies, 1=TV Shows)
    """
    try:
        rows = local_conn.execute("""
            SELECT category_slot, table_index, source_name, crawl_limit, crawl_url
            FROM ott_categories
            WHERE platform = 'netflix'
              AND is_active = 1
              AND crawl_url LIKE '%flixpatrol.com/top10/netflix/%'
              AND crawl_url NOT LIKE '%/world/%'
              AND crawl_url NOT LIKE '%/south-korea/%'
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
        print(f"  [netflix_world] ⚠️ 슬롯 조회 실패: {e}")
        return []


def _parse_flixpatrol_tables(html: str) -> list[list[str]]:
    """
    FlixPatrol 넷플릭스 페이지에서 TOP Movies / TOP TV Shows 테이블 파싱
    반환: [[movie1, movie2, ...], [show1, show2, ...]]
    table_index=0 → Movies, table_index=1 → TV Shows
    """
    soup    = BeautifulSoup(html, "html.parser")
    tables  = soup.find_all("table")
    results = []

    for table in tables:
        titles = []
        rows   = table.find_all("tr")
        for row in rows:
            # a 태그 중 /title/ 경로를 가진 것에서 제목 추출
            link = row.find("a", href=lambda h: h and "/title/" in h)
            if not link:
                continue

            # 제목 텍스트 추출 — FlixPatrol은 같은 텍스트가 두 번 반복됨
            # 예: "Office Romance Office Romance" → "Office Romance"
            raw   = link.get_text(strip=True)
            # 중복 텍스트 제거: "ABC ABC" → "ABC"
            words = raw.split()
            half  = len(words) // 2
            if half > 0 and words[:half] == words[half:]:
                title = " ".join(words[:half])
            else:
                title = raw

            if title:
                titles.append(title)

        if titles:
            results.append(titles)

    return results


async def crawl_netflix_world(local_conn) -> list[dict]:
    """
    FlixPatrol 전세계 넷플릭스 랭킹 크롤링
    requests로 HTML 가져와서 BeautifulSoup으로 파싱
    """
    slots = get_flixpatrol_slots(local_conn)
    if not slots:
        print("  [netflix_world] ⚠️ FlixPatrol 전세계 슬롯 없음")
        return []

    print(f"  [netflix_world] 슬롯 {len(slots)}개: {[s['category_slot'] for s in slots]}")
    print(f"  [netflix_world] 페이지 로드: {FLIXPATROL_NETFLIX_URL}")

    # requests로 HTML 가져오기
    try:
        resp = requests.get(FLIXPATROL_NETFLIX_URL, headers=HEADERS, timeout=20)
        print(f"  [netflix_world] HTTP status: {resp.status_code}")

        if resp.status_code != 200:
            print(f"  [netflix_world] ⚠️ 페이지 로드 실패: {resp.status_code}")
            return []

    except Exception as e:
        print(f"  [netflix_world] ⚠️ 요청 실패: {e}")
        return []

    # HTML 파싱 → Movies / TV Shows 테이블 추출
    tables = _parse_flixpatrol_tables(resp.text)
    print(f"  [netflix_world] 파싱된 테이블 수: {len(tables)}")

    results = []

    for slot in slots:
        idx           = slot["table_index"]
        category_slot = slot["category_slot"]
        source_name   = slot["source_name"]
        crawl_limit   = slot["crawl_limit"]

        if idx >= len(tables):
            print(f"  [netflix_world][{category_slot}] ⚠️ 테이블 없음 (index={idx})")
            continue

        titles = tables[idx][:crawl_limit]
        print(f"  [netflix_world][{category_slot}] '{source_name}' 파싱 완료")
        if titles:
            print(f"    첫 항목: rank=1, title='{titles[0]}'")

        for rank, title in enumerate(titles, start=1):
            results.append({
                "platform":      "netflix",
                "category_slot": category_slot,
                "source_name":   source_name,
                "rank":          rank,
                "title_en":      title,
            })

        print(f"  [netflix_world][{category_slot}] 수집: {len(titles)}개")

    return results


async def run(local_conn, save_fn=None):
    """run_all.py에서 호출하는 진입점"""
    print("\n[netflix_world] Netflix 전세계 TOP10 크롤링 시작...")
    results = await crawl_netflix_world(local_conn)

    if save_fn and results:
        print(f"  [netflix_world] {len(results)}개 저장 시작...")
        await save_fn(local_conn, results)

    print(f"  [netflix_world] 완료 — 총 {len(results)}개")
    return results


if __name__ == "__main__":
    import asyncio
    from db import init_db, save_rankings_batch
    conn = init_db()
    asyncio.run(run(conn, save_rankings_batch))
    conn.close()
