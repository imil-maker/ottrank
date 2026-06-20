"""
넷플릭스 FlixPatrol 전세계 랭킹 크롤러 v5
────────────────────────────────────────────────────────────────
출처: https://flixpatrol.com/top10/netflix/
  - 항상 오늘 날짜 전세계 통합 랭킹 반환
  - Playwright 불필요 — requests + BeautifulSoup 텍스트 파싱

⚠️ v5 변경사항 (2026-06-20) — table_index 위치 기반 매칭 폐기
  기존 방식: soup.find_all("table")[0] = Movies, [1] = TV Shows
  → table_index가 "몇 번째 <table>인가"라는 순수 위치값이라,
    FlixPatrol이 페이지에 숨김 테이블을 추가하거나 응답 순서가
    바뀌면(봇 차단 캐시 분기, 모바일 중복 마크업 등) category07(영화)에
    TV 데이터가, category08(TV)에 영화 데이터가 들어가는 식으로
    통째로 swap되는 사고 발생.

  v5 방식: 각 <table> 바로 앞의 헤딩 텍스트
  ("TOP Movies on Netflix..." / "TOP TV Shows on Netflix...")로
  종류를 식별. 테이블이 몇 번째 위치에 있든 영향받지 않음.
  D1의 table_index 컬럼은 더 이상 사용하지 않지만(하위호환을 위해
  조회는 하되 무시), source_name에 "Movie" / "TV Show" 키워드가
  반드시 포함되어 있어야 매칭 가능 — ott_categories 설정 시 주의.

장점:
  - 가볍고 빠름 (브라우저 실행 없음)
  - 차단 없음 (텍스트 페이지라 robots.txt 우호적)
  - 전세계 통합 랭킹 (영어권 편향 없음)
  - 페이지 내 테이블 순서 변경에 영향받지 않음 (v5)
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

# 헤딩 텍스트 → 테이블 종류 판별 정규식
# 예) "TOP Movies on Netflix on June 18, 2026"      → movies
#     "TOP TV Shows on Netflix on June 18, 2026"    → tv
#     "TOP Movies and TV Shows on Netflix... by country" → 둘 다 아님(국가별 표, 제외)
_RE_MOVIES_HEADING = re.compile(r'^top\s+movies?\s+on\b', re.IGNORECASE)
_RE_TV_HEADING      = re.compile(r'^top\s+tv\s+shows?\s+on\b', re.IGNORECASE)


def get_flixpatrol_slots(local_conn) -> list[dict]:
    """
    로컬 DB에서 flixpatrol.com/top10/netflix/ URL을 가진 슬롯 조회

    ⚠️ table_index는 더 이상 매칭에 사용하지 않음(v5) — 폴백 로깅 용도로만 조회.
    실제 매칭은 source_name에 포함된 "Movie" / "TV Show" 키워드로 수행하므로
    ott_categories.source_name에 해당 키워드가 반드시 포함되어 있어야 함.
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


def _extract_titles_from_table(table) -> list[str]:
    """단일 <table>에서 /title/ 링크를 가진 행들의 제목을 추출"""
    titles = []
    rows = table.find_all("tr")
    for row in rows:
        # a 태그 중 /title/ 경로를 가진 것에서 제목 추출
        link = row.find("a", href=lambda h: h and "/title/" in h)
        if not link:
            continue

        # 제목 텍스트 추출 — FlixPatrol은 같은 텍스트가 두 번 반복됨
        # 예: "Office Romance Office Romance" → "Office Romance"
        raw   = link.get_text(strip=True)
        words = raw.split()
        half  = len(words) // 2
        if half > 0 and words[:half] == words[half:]:
            title = " ".join(words[:half])
        else:
            title = raw

        if title:
            titles.append(title)

    return titles


def _parse_flixpatrol_tables(html: str) -> dict:
    """
    FlixPatrol 넷플릭스 페이지에서 TOP Movies / TOP TV Shows 테이블 파싱

    ⚠️ v5: table_index(몇 번째 <table>인가) 대신, 각 <table> 바로 앞의
    헤딩 텍스트로 종류를 식별한다. 페이지 내 테이블 순서가 바뀌거나
    중간에 다른 <table>이 끼어들어도 영향받지 않음.

    반환:
      {
        "movies": [[title1, title2, ...], ...],   # "TOP Movies on..." 헤딩의 테이블들
        "tv":     [[title1, title2, ...], ...],   # "TOP TV Shows on..." 헤딩의 테이블들
        "unknown": [[...], ...],                  # 식별 안 된 테이블(국가별 표 등) — 사용 안 함
      }
    """
    soup   = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")

    result = {"movies": [], "tv": [], "unknown": []}

    for table in tables:
        titles = _extract_titles_from_table(table)
        if not titles:
            continue  # /title/ 링크가 없는 테이블(레이아웃용 등)은 스킵

        # ── 종류 식별: 테이블 바로 앞쪽 헤딩(h1~h4) 텍스트로 판별 ──
        heading_node = table.find_previous(["h1", "h2", "h3", "h4"])
        heading_text = heading_node.get_text(strip=True) if heading_node else ""

        if _RE_TV_HEADING.match(heading_text):
            kind = "tv"
        elif _RE_MOVIES_HEADING.match(heading_text):
            kind = "movies"
        else:
            kind = "unknown"

        print(f"  [netflix_world] 테이블 발견 — 헤딩='{heading_text}' → 분류='{kind}' "
              f"(항목 {len(titles)}개, 첫 항목='{titles[0]}')")

        result[kind].append(titles)

    return result


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

    # HTML 파싱 → 헤딩 기반으로 movies / tv / unknown 분류
    tables_by_type = _parse_flixpatrol_tables(resp.text)
    print(f"  [netflix_world] 분류 결과 — movies={len(tables_by_type['movies'])}개, "
          f"tv={len(tables_by_type['tv'])}개, unknown={len(tables_by_type['unknown'])}개")

    results = []

    for slot in slots:
        category_slot = slot["category_slot"]
        source_name   = slot["source_name"] or ""
        crawl_limit   = slot["crawl_limit"]
        table_index   = slot["table_index"]  # 폴백 로깅용으로만 참고

        sn_lower = source_name.lower()
        if "tv show" in sn_lower:
            expected_type = "tv"
        elif "movie" in sn_lower:
            expected_type = "movies"
        else:
            expected_type = None

        titles = []

        if expected_type and tables_by_type.get(expected_type):
            titles = tables_by_type[expected_type][0]
            print(f"  [netflix_world][{category_slot}] '{source_name}' → "
                  f"헤딩 매칭 성공('{expected_type}' 테이블 사용)")
        else:
            # 헤딩 기반 식별 실패 — 잘못된 데이터를 저장하느니 스킵하고 명확히 경고
            print(f"  [netflix_world][{category_slot}] ⚠️ 매칭 실패! "
                  f"source_name='{source_name}'에서 'Movie' 또는 'TV Show' 키워드를 "
                  f"찾지 못했거나, 페이지에서 해당 종류 테이블을 찾지 못함 "
                  f"(table_index={table_index}는 더 이상 사용 안 함). "
                  f"D1 ott_categories.source_name 설정을 확인하세요.")
            continue

        titles = titles[:crawl_limit]
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
