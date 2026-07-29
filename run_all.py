# 2026-07-29 rev.4 — run_all.py (박스오피스를 run_boxoffice.py로 완전 분리 —
#   FlixPatrol(하루 1번)과 박스오피스(하루 3번, 재시도 필요)가 스케줄이 달라야 해서
#   이 파일은 이제 FlixPatrol 전용. 박스오피스는 boxoffice_crawl.yml이 별도 실행)
"""
전체 크롤러 실행 v3 — FlixPatrol 전용
────────────────────────────────────────────────────────────────
실행 순서:
  1. sync_works.py — D1 works + ott_categories → 로컬 동기화 (⚠️ 삭제 금지!)
  2. FlixPatrol 4개 OTT 크롤링 — 정식 API 방식 (넷플릭스 남한/월드, 디즈니+, 웨이브, 쿠팡플레이)
  3. export_to_sql.py — 로컬 rankings.db → D1 업로드용 SQL 변환

  ※ 박스오피스는 2026-07-29부로 run_boxoffice.py + boxoffice_crawl.yml로 완전 분리됨
    (스케줄 하루 3번, KOBIS 타임아웃 대비 재시도 목적 — daily_crawl.yml과 무관하게 실행)
  ※ 티빙(키노라이츠) 크롤링은 2026-07-27부로 삭제됨.
    사유: 키노라이츠 데이터가 실제 티빙 순위와 불일치, 대체 소스 없음 → 수동 입력으로 전환.
  ※ FlixPatrol은 2026-07-29부로 Playwright 화면크롤링 → 정식 API 방식으로 전환됨
    (403 차단 문제 해결, tmdbId 직접 수신으로 매칭 정확도 향상).

배치 처리:
  - OTT별 크롤링 결과를 모아서 Claude API 1회 호출
  - TMDB 검색 후 works INSERT + rankings 저장
────────────────────────────────────────────────────────────────
"""

import asyncio
import sys
import os

# 루트 경로 추가
sys.path.insert(0, os.path.dirname(__file__))

from db import init_db, save_rankings_batch


async def run_flixpatrol_platforms(conn):
    """FlixPatrol 4개 OTT 크롤링 + 배치 처리"""
    from crawlers.flixpatrol_api import crawl_flixpatrol

    platforms = ["netflix", "disney", "wavve", "coupang"]
    all_results = []

    for platform in platforms:
        try:
            results = await crawl_flixpatrol(platform, conn)
            all_results.extend(results)
            print(f"  [{platform}] 수집 완료: {len(results)}개")
        except Exception as e:
            print(f"  [{platform}] 크롤링 오류: {e}")

    # 전체 배치 처리 (Claude API 1회 호출)
    print(f"\n  [배치 처리] 전체 {len(all_results)}개 매칭 시작...")
    await save_rankings_batch(conn, all_results)


async def main():
    print("=" * 60)
    print("오뜨랑 크롤러 v3 시작 (FlixPatrol 전용)")
    print("=" * 60)

    conn = init_db()

    try:
        # 1. FlixPatrol 4개 OTT (배치 처리)
        print("\n[1단계] FlixPatrol 크롤링 시작...")
        await run_flixpatrol_platforms(conn)

    finally:
        conn.close()

    print("\n" + "=" * 60)
    print("크롤링 완료!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
