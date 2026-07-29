# 2026-07-29 rev.4 — test_flixpatrol_api.py (FlixPatrol API 탐색용 1회성 테스트)
# rev.4 변경: NameError 수정 — netflix_id를 회사 조회 직후(월드 섹션보다 앞)로 이동
# rev.3 변경: 넷플릭스 월드(전세계) 카테고리용 country=World ID 조회 단계 추가
# rev.2 변경: 회사명 검색을 "포함(contains)"에서 "정확히 일치(eq)"로 변경
#            — "Disney"로 검색 시 월트디즈니 계열 제작사 27개가 잡혀서 엉뚱한 회사가
#              선택되는 문제 발견 → "Disney+"처럼 정확한 이름으로 검색하도록 수정
#
# 목적: 화면 크롤링(Playwright) 없이 FlixPatrol 정식 API로 전환하기 전,
#       1) 회사(넷플릭스/디즈니/웨이브/쿠팡플레이) ID, 국가(대한민국) ID를 실제로 조회
#       2) TOP10 실제 응답에 tmdbId·mediaType이 어떻게 들어오는지 확인
#       매일 도는 크롤러(daily_crawl.yml)와는 완전히 별개, 이 파일 하나로 끝나는 1회성 테스트.

import os
import json
import requests
from datetime import datetime, timezone, timedelta

API_KEY = os.environ.get("FLIXPATROL_API_KEY")
BASE = "https://api.flixpatrol.com/v2"

if not API_KEY:
    print("❌ FLIXPATROL_API_KEY 환경변수가 없습니다. GitHub Secrets 등록/연결을 확인하세요.")
    raise SystemExit(1)

auth = (API_KEY, "")  # HTTP Basic Auth — API 키를 username 자리에, password는 빈 값

KST = timezone(timedelta(hours=9))
YESTERDAY = (datetime.now(KST) - timedelta(days=1)).strftime("%Y-%m-%d")


def call(path, params=None):
    """공통 호출 함수 — 상태코드/에러를 항상 출력"""
    url = f"{BASE}{path}"
    resp = requests.get(url, params=params, auth=auth, timeout=20)
    print(f"\n>>> GET {resp.url}")
    print(f"    status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"    본문: {resp.text[:500]}")
        return None
    return resp.json()


print("=" * 60)
print("① 회사(Company) ID 조회 — 넷플릭스/디즈니/웨이브/쿠팡플레이")
print("=" * 60)

company_ids = {}
for name in ["Netflix", "Disney+", "Wavve", "Coupang Play"]:
    # 정확히 일치하는 이름만 검색 (Disney처럼 계열사가 많은 경우 오검색 방지)
    data = call("/companies", {"name[eq]": name})
    if data and data.get("data"):
        for item in data["data"]:
            cid = item.get("data", {}).get("id")
            cname = item.get("data", {}).get("name")
            print(f"    후보: id={cid}  name={cname}")
        if len(data["data"]) == 1:
            company_ids[name] = data["data"][0]["data"].get("id")
        else:
            print(f"    ⚠️ '{name}' 정확히 일치하는 게 {len(data['data'])}개 — 수동 확인 필요")
    else:
        print(f"    ⚠️ '{name}' 정확히 일치하는 결과 없음 — eq 대신 contains로 재시도")
        data2 = call("/companies", {"name[contains]": name})
        if data2 and data2.get("data"):
            for item in data2["data"][:10]:
                cid = item.get("data", {}).get("id")
                cname = item.get("data", {}).get("name")
                print(f"    (contains 후보) id={cid}  name={cname}")

netflix_id = company_ids.get("Netflix")  # 이후 섹션에서 반복 사용

print("\n" + "=" * 60)
print("② 국가(Country) ID 조회 — 대한민국")
print("=" * 60)

country_id = None
data = call("/countries", {"name[eq]": "South Korea"})
if data and data.get("data"):
    for item in data["data"]:
        cid = item.get("data", {}).get("id")
        cname = item.get("data", {}).get("name")
        ccode = item.get("data", {}).get("code")
        print(f"    후보: id={cid}  name={cname}  code={ccode}")
        if ccode == "KR":
            country_id = cid
    if not country_id and data["data"]:
        # code 필드가 없거나 다르게 와도 일단 첫 후보 사용
        country_id = data["data"][0]["data"].get("id")
else:
    print("    ⚠️ 'South Korea' 정확 검색 결과 없음 — contains로 재시도")
    data2 = call("/countries", {"name[contains]": "Korea"})
    if data2 and data2.get("data"):
        for item in data2["data"]:
            cid = item.get("data", {}).get("id")
            cname = item.get("data", {}).get("name")
            ccode = item.get("data", {}).get("code")
            print(f"    (contains 후보) id={cid}  name={cname}  code={ccode}")
            if ccode == "KR":
                country_id = cid

print("\n" + "=" * 60)
print("②-2 국가(Country) ID 조회 — World(전세계, 넷플릭스 글로벌용)")
print("=" * 60)

world_id = None
data = call("/countries", {"name[eq]": "World"})
if data and data.get("data"):
    for item in data["data"]:
        cid = item.get("data", {}).get("id")
        cname = item.get("data", {}).get("name")
        ccode = item.get("data", {}).get("code")
        print(f"    후보: id={cid}  name={cname}  code={ccode}")
    if len(data["data"]) >= 1:
        world_id = data["data"][0]["data"].get("id")
else:
    print("    ⚠️ 'World' 정확 검색 결과 없음 — contains로 재시도")
    data2 = call("/countries", {"name[contains]": "World"})
    if data2 and data2.get("data"):
        for item in data2["data"]:
            cid = item.get("data", {}).get("id")
            cname = item.get("data", {}).get("name")
            print(f"    (contains 후보) id={cid}  name={cname}")

if world_id and netflix_id:
    print("\n" + "=" * 60)
    print(f"②-3 TOP10 실제 데이터 조회 — 넷플릭스 월드 영화 ({YESTERDAY})")
    print("=" * 60)
    world_top10 = call("/top10s", {
        "company[eq]":     netflix_id,
        "country[eq]":     world_id,
        "type[eq]":        2,
        "date[type][eq]":  1,
        "date[from][eq]":  YESTERDAY,
        "date[to][eq]":    YESTERDAY,
    })
    if world_top10:
        rows = world_top10.get("data", [])
        print(f"    결과 {len(rows)}건")
        if rows:
            m = rows[0].get("data", {}).get("movie", {}).get("data", {})
            print(f"    1위: {m.get('title')}  tmdbId={m.get('tmdbId')}")

print("\n" + "=" * 60)
print(f"③ TOP10 실제 데이터 조회 — 넷플릭스 남한 영화 ({YESTERDAY})")
print("=" * 60)

netflix_id = company_ids.get("Netflix")  # 이미 위에서 정의됨 (중복 대입, 값 동일)
if netflix_id and country_id:
    top10_data = call("/top10s", {
        "company[eq]":     netflix_id,
        "country[eq]":     country_id,
        "type[eq]":        2,          # Movies
        "date[type][eq]":  1,          # Day
        "date[from][eq]":  YESTERDAY,
        "date[to][eq]":    YESTERDAY,
    })
    if top10_data:
        print(f"\n    원본 응답(전체):\n{json.dumps(top10_data, indent=2, ensure_ascii=False)[:3000]}")

        # movie 필드가 title 정보를 포함하는지, 아니면 ID만 있는지 확인
        rows = top10_data.get("data", [])
        if rows:
            first_row = rows[0]
            movie_field = first_row.get("data", {}).get("movie")
            print(f"\n    첫 번째 항목의 movie 필드: {json.dumps(movie_field, ensure_ascii=False)}")

            # movie가 ID만 있는 구조라면, Titles 엔드포인트로 상세 조회 테스트
            movie_id = None
            if isinstance(movie_field, dict):
                movie_id = movie_field.get("data", {}).get("id")

            if movie_id:
                print("\n" + "=" * 60)
                print(f"④ Titles 상세 조회 — movie_id={movie_id}")
                print("=" * 60)
                title_data = call(f"/titles/{movie_id}")
                if title_data:
                    print(f"\n    Titles 상세 응답:\n{json.dumps(title_data, indent=2, ensure_ascii=False)[:2000]}")
else:
    print("    ⚠️ 회사 ID 또는 국가 ID를 못 찾아서 TOP10 조회 스킵")

print("\n" + "=" * 60)
print("테스트 완료")
print("=" * 60)
