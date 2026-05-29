"""
Google Custom Search API 테스트
GitHub Actions에서 실행: python test_google_search.py
"""
import requests
import os

GOOGLE_API_KEY = os.environ.get("GOOGLE_SEARCH_API_KEY", "")
GOOGLE_CX      = os.environ.get("GOOGLE_SEARCH_CX", "")

platform_names = {
    "netflix": "넷플릭스", "disney": "디즈니플러스",
    "wavve": "웨이브", "coupang": "쿠팡플레이",
}

test_cases = [
    ("Ringu",             "wavve"),
    ("Glasses",           "wavve"),
    ("King of Survival",  "wavve"),
    ("Ladies First",      "netflix"),
    ("KCSI: Smoking Gun", "wavve"),
]

print(f"API 키: {'있음' if GOOGLE_API_KEY else '없음'}")
print(f"CX: {'있음' if GOOGLE_CX else '없음'}\n")

for title_en, platform in test_cases:
    platform_ko = platform_names.get(platform, "OTT")
    query = f"{platform_ko} {title_en} 한국 제목"

    resp = requests.get(
        "https://www.googleapis.com/customsearch/v1",
        params={
            "key": GOOGLE_API_KEY,
            "cx":  GOOGLE_CX,
            "q":   query,
            "num": 3,
            "lr":  "lang_ko",
        },
        timeout=10,
    )

    print(f"🔍 '{query}'")
    print(f"   상태: {resp.status_code}")

    if resp.status_code == 200:
        items = resp.json().get("items", [])
        if items:
            for item in items[:2]:
                print(f"   - {item.get('title','')}")
                print(f"     {item.get('snippet','')[:100]}")
        else:
            print("   결과 없음")
    else:
        print(f"   오류: {resp.text[:300]}")
    print()
