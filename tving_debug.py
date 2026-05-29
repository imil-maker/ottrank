"""티빙 __NEXT_DATA__ 디버그 스크립트
- requests로 티빙 홈페이지 GET 후 __NEXT_DATA__ 내용 확인
- GitHub Actions에서 실행하여 실제 응답 확인용
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import json
import time
import random
import requests
from bs4 import BeautifulSoup

TVING_HOME_URL = "https://www.tving.com"

DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

headers = {
    "User-Agent": DESKTOP_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    "Referer": "https://www.google.com/",
}

print("=" * 60)
print("티빙 __NEXT_DATA__ 디버그")
print("=" * 60)

time.sleep(random.uniform(1.0, 2.0))

session = requests.Session()
resp = session.get(TVING_HOME_URL, headers=headers, timeout=20, allow_redirects=True)

print(f"\n① HTTP 상태코드: {resp.status_code}")
print(f"② 최종 URL: {resp.url}")
print(f"③ 응답 크기: {len(resp.text):,} bytes")

# __NEXT_DATA__ 태그 확인
soup = BeautifulSoup(resp.text, "html.parser")
next_data_tag = soup.find("script", {"id": "__NEXT_DATA__"})

print(f"\n④ __NEXT_DATA__ 태그 존재: {'✅ 있음' if next_data_tag else '❌ 없음'}")

if next_data_tag:
    try:
        next_data = json.loads(next_data_tag.string)

        # 전체 키 구조 출력
        print(f"\n⑤ __NEXT_DATA__ 최상위 키: {list(next_data.keys())}")

        page_props = next_data.get("props", {}).get("pageProps", {})
        print(f"⑥ pageProps 키: {list(page_props.keys())[:20]}")  # 최대 20개

        # VOD_BASIC_RANKING 키워드 검색
        raw_text = next_data_tag.string
        if "VOD_BASIC_RANKING" in raw_text:
            print(f"\n⑦ ✅ 'VOD_BASIC_RANKING' 발견!")
            # 앞뒤 200자 출력
            idx = raw_text.find("VOD_BASIC_RANKING")
            print(f"   컨텍스트: ...{raw_text[max(0,idx-50):idx+200]}...")
        else:
            print(f"\n⑦ ❌ 'VOD_BASIC_RANKING' 없음")

        # bandType 키워드 검색
        if "bandType" in raw_text:
            print(f"\n⑧ ✅ 'bandType' 발견!")
            # bandType 값들 수집
            import re
            band_types = re.findall(r'"bandType"\s*:\s*"([^"]+)"', raw_text)
            print(f"   발견된 bandType 목록: {list(set(band_types))}")
        else:
            print(f"\n⑧ ❌ 'bandType' 없음")

        # __NEXT_DATA__ 앞 500자 출력 (구조 파악용)
        print(f"\n⑨ __NEXT_DATA__ 앞 500자:")
        print(raw_text[:500])

    except json.JSONDecodeError as e:
        print(f"\n⑤ ❌ JSON 파싱 실패: {e}")
        print(f"   raw 앞 200자: {next_data_tag.string[:200] if next_data_tag.string else 'None'}")

else:
    # __NEXT_DATA__ 없으면 HTML 앞부분 출력
    print(f"\n⑤ HTML 앞 500자:")
    print(resp.text[:500])
    print(f"\n⑥ HTML 뒷 500자:")
    print(resp.text[-500:])

print("\n" + "=" * 60)
print("디버그 완료")
print("=" * 60)
