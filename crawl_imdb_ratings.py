"""
IMDb 평점 크롤러
────────────────────────────────────────────────────────────────
D1 works 테이블에서 imdb_id는 있지만 imdb_rating이 없는 작품을 찾아
IMDb 페이지의 JSON-LD에서 평점을 수집하여 D1에 직접 업데이트

실행 방법:
  - GitHub Actions 수동 실행 (workflow_dispatch)
  - 또는 로컬: python crawl_imdb_ratings.py
────────────────────────────────────────────────────────────────
"""

import requests
import os
import time
import re
import json
from datetime import datetime, timezone, timedelta

# ── Cloudflare D1 설정 ──────────────────────────────────────────
CF_ACCOUNT_ID  = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN   = os.environ.get("CLOUDFLARE_API_TOKEN", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

D1_API_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/"
    f"{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
)

# ── IMDb 크롤링 설정 ────────────────────────────────────────────
IMDB_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# 요청 간 딜레이 (IMDb 차단 방지)
REQUEST_DELAY = 2.0


def d1_execute(sql: str, params: list = None) -> dict:
    """D1 REST API로 SQL 실행"""
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type":  "application/json",
    }
    body = {"sql": sql}
    if params:
        body["params"] = params

    resp = requests.post(D1_API_URL, headers=headers, json=body, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"D1 API 오류: {resp.status_code} {resp.text[:300]}")

    data = resp.json()
    if not data.get("success"):
        raise Exception(f"D1 쿼리 실패: {data}")

    return data


def get_works_without_imdb_rating() -> list:
    """D1에서 imdb_id 있고 imdb_rating 없는 작품 목록 조회"""
    result = d1_execute("""
        SELECT tmdb_id, title_ko, imdb_id
        FROM works
        WHERE imdb_id IS NOT NULL
          AND imdb_id != ''
          AND (imdb_rating IS NULL OR imdb_rating = 0)
        ORDER BY tmdb_id DESC
    """)
    rows = result["result"][0].get("results", [])
    print(f"  평점 없는 작품: {len(rows)}개")
    return rows


def fetch_imdb_rating(imdb_id: str) -> tuple:
    """
    IMDb 페이지에서 JSON-LD 파싱하여 평점 수집
    반환: (rating, votes) 또는 (None, None)
    """
    url = f"https://www.imdb.com/title/{imdb_id}/"
    try:
        resp = requests.get(url, headers=IMDB_HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"    ⚠️  HTTP {resp.status_code}")
            return None, None

        html = resp.text

        # JSON-LD 블록 추출
        ld_match = re.search(
            r'<script type="application/ld\+json">([\s\S]*?)</script>',
            html
        )
        if not ld_match:
            print(f"    ⚠️  JSON-LD 없음")
            return None, None

        ld_data = json.loads(ld_match.group(1))
        aggregate = ld_data.get("aggregateRating", {})

        rating = aggregate.get("ratingValue")
        votes  = aggregate.get("ratingCount")

        if rating is None:
            print(f"    ⚠️  평점 없음 (아직 충분한 투표 없음)")
            return None, None

        rating = float(rating)
        votes_str = f"{votes:,}" if isinstance(votes, int) else str(votes or "")

        return rating, votes_str

    except json.JSONDecodeError as e:
        print(f"    ⚠️  JSON 파싱 오류: {e}")
        return None, None
    except Exception as e:
        print(f"    ⚠️  오류: {e}")
        return None, None


def update_imdb_rating(imdb_id: str, rating: float, votes: str):
    """D1 works 테이블에 IMDb 평점 업데이트"""
    now = datetime.now(timezone.utc).isoformat()
    d1_execute(
        "UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?",
        [rating, votes, now, imdb_id]
    )


def main():
    print("=" * 60)
    print("IMDb 평점 크롤러 시작")
    print("=" * 60)

    if not CF_ACCOUNT_ID or not CF_API_TOKEN or not D1_DATABASE_ID:
        print("⚠️  Cloudflare 환경변수 없음 — 종료")
        return

    # 평점 없는 작품 조회
    print("\n[1단계] 평점 없는 작품 조회...")
    works = get_works_without_imdb_rating()

    if not works:
        print("  모든 작품에 IMDb 평점이 있습니다!")
        return

    # IMDb 크롤링
    print(f"\n[2단계] IMDb 평점 크롤링 시작 ({len(works)}개)...")
    success = 0
    fail    = 0
    no_rating = 0

    for i, work in enumerate(works, 1):
        tmdb_id  = work["tmdb_id"]
        title_ko = work["title_ko"]
        imdb_id  = work["imdb_id"]

        print(f"\n  [{i}/{len(works)}] {title_ko} ({imdb_id})")

        rating, votes = fetch_imdb_rating(imdb_id)

        if rating is not None:
            try:
                update_imdb_rating(imdb_id, rating, votes)
                print(f"    ✅ {rating}/10 ({votes}명)")
                success += 1
            except Exception as e:
                print(f"    ⚠️  DB 업데이트 실패: {e}")
                fail += 1
        else:
            no_rating += 1

        # IMDb 차단 방지 딜레이
        if i < len(works):
            time.sleep(REQUEST_DELAY)

    # 결과 요약
    print("\n" + "=" * 60)
    print(f"크롤링 완료!")
    print(f"  ✅ 성공: {success}개")
    print(f"  ⚠️  평점 없음: {no_rating}개")
    print(f"  ❌ 실패: {fail}개")
    print("=" * 60)


if __name__ == "__main__":
    main()
