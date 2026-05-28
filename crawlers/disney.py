"""디즈니+ 랭킹 크롤러 v2 - FlixPatrol"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
from crawlers.flixpatrol_base import crawl_flixpatrol

async def run(local_conn, save_fn):
    """
    local_conn : 로컬 SQLite 연결 (ott_categories 슬롯 설정 읽기용)
    save_fn    : db.py의 save_ranking 함수 (크롤링 결과 저장)
    """
    print("\n[디즈니+] 크롤링 시작...")
    results = await crawl_flixpatrol("disney", local_conn)
    for item in results:
        await save_fn(local_conn, item)
    print(f"[디즈니+] 완료 — 총 {len(results)}개")

if __name__ == "__main__":
    from db import init_db, save_ranking
    conn = init_db()
    asyncio.run(run(conn, save_ranking))
    conn.close()
