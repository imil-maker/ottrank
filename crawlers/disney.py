"""디즈니+ 랭킹 크롤러 - FlixPatrol"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
from crawlers.flixpatrol_base import crawl_flixpatrol

URL = "https://flixpatrol.com/top10/disney/south-korea/"

async def run(conn):
    print("\n[디즈니+] 크롤링 중...")
    await crawl_flixpatrol(URL, "disney", conn)

if __name__ == "__main__":
    from db import init_db
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
