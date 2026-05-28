"""
전체 크롤러 실행 v2
────────────────────────────────────────────────────────────────
실행 순서:
  1. sync_works.py — D1 works + ott_categories → 로컬 동기화 (⚠️ 삭제 금지!)
  2. FlixPatrol 4개 OTT 크롤링 (넷플릭스, 디즈니+, 웨이브, 쿠팡플레이)
  3. 티빙 크롤링 (키노라이츠, 기존 유지)
  4. 박스오피스 크롤링 (기존 유지)
  5. export_to_sql.py — 로컬 rankings.db → D1 업로드용 SQL 변환

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
    from crawlers.flixpatrol_base import crawl_flixpatrol

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


async def run_tving(conn):
    """티빙 크롤링 (키노라이츠, 기존 방식 유지)"""
    try:
        from crawlers.tving import run as tving_run
        await tving_run(conn)
    except Exception as e:
        print(f"  [티빙] 오류: {e}")


async def run_boxoffice(conn):
    """박스오피스 크롤링 (기존 방식 유지)"""
    try:
        from crawlers.boxoffice import run as boxoffice_run
        await boxoffice_run(conn)
    except Exception as e:
        print(f"  [박스오피스] 오류: {e}")


async def main():
    print("=" * 60)
    print("오뜨랑 크롤러 v2 시작")
    print("=" * 60)

    conn = init_db()

    try:
        # 1. FlixPatrol 4개 OTT (배치 처리)
        print("\n[1단계] FlixPatrol 크롤링 시작...")
        await run_flixpatrol_platforms(conn)

        # 2. 티빙 (기존 유지)
        print("\n[2단계] 티빙 크롤링 시작...")
        await run_tving(conn)

        # 3. 박스오피스 (기존 유지)
        print("\n[3단계] 박스오피스 크롤링 시작...")
        await run_boxoffice(conn)

    finally:
        conn.close()

    print("\n" + "=" * 60)
    print("크롤링 완료!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
