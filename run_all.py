"""전체 OTT 크롤러 병렬 실행 (max_workers=4)"""
import asyncio
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

from db import init_db
from crawlers.netflix  import run as run_netflix
from crawlers.wavve    import run as run_wavve
from crawlers.coupang  import run as run_coupang
from crawlers.disney   import run as run_disney
from crawlers.tving    import run as run_tving

KST = timezone(timedelta(hours=9))

async def run_all():
    conn = init_db()
    today = datetime.now(KST).strftime("%Y-%m-%d")

    print(f"\n{'='*45}")
    print(f"  오뜨랑 OTT 랭킹 크롤링 시작: {today}")
    print(f"{'='*45}")

    # FlixPatrol 4개 병렬 실행 (각각 별도 브라우저)
    # 티빙(키노라이츠)은 별도 순차 실행
    await asyncio.gather(
        run_netflix(conn),
        run_wavve(conn),
        run_coupang(conn),
        run_disney(conn),
    )

    # 티빙은 순차 실행 (키노라이츠 모바일 크롤링)
    await run_tving(conn)

    conn.close()
    print(f"\n{'='*45}")
    print(f"  ✅ 크롤링 완료!")
    print(f"{'='*45}\n")

if __name__ == "__main__":
    asyncio.run(run_all())
