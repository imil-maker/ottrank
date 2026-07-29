# 2026-07-29 rev.1 — run_boxoffice.py (박스오피스 단독 실행 — run_all.py에서 분리)
"""
박스오피스(KOBIS) 단독 크롤러 실행
────────────────────────────────────────────────────────────────
run_all.py(FlixPatrol 전용)와 완전히 분리된 별도 진입점.
boxoffice_crawl.yml이 하루 3번(01:17/10:17/19:17 KST) 이 파일을 실행함.

분리 이유: KOBIS는 접속 타임아웃이 잦아 재시도가 필요한데, FlixPatrol은
하루 1번이면 충분해서 두 크롤러의 스케줄이 서로 다름 — 한 워크플로우에
같이 묶으면 스케줄을 다르게 줄 수 없어서 분리함.
────────────────────────────────────────────────────────────────
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from db import init_db


async def main():
    print("=" * 60)
    print("오뜨랑 박스오피스 크롤러 시작")
    print("=" * 60)

    conn = init_db()

    try:
        from crawlers.boxoffice import run as boxoffice_run
        await boxoffice_run(conn)
    except Exception as e:
        print(f"  [박스오피스] 오류: {e}")
    finally:
        conn.close()

    print("\n" + "=" * 60)
    print("박스오피스 크롤링 완료!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())