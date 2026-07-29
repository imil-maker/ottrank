# 2026-07-29 rev.4 — flixpatrol_api.py (_api_get 실패 시 상태코드만 찍고 응답 본문(에러
#   메시지)은 출력을 안 하던 문제 수정 — category08 400 에러 원인 파악을 위해 필요)
# 2026-07-29 rev.3 — flixpatrol_api.py (World/글로벌 데이터는 /top10s가 아니라
#   /rankings 엔드포인트를 써야 하는 것으로 진단 확인됨 — TOP10s는 개별 국가별 데이터만
#   제공하고 "World"라는 국가 자체가 존재하지 않음. Rankings는 국가 무관 글로벌 집계
#   전용 엔드포인트. country="World"인 슬롯(넷플릭스 category07/08)만 /rankings로 분기)
#
# flixpatrol_base.py(Playwright 화면 크롤링)를 대체하는 API 방식 크롤러.
# 배경: FlixPatrol이 자동화 브라우저(Playwright) 접속을 403으로 차단하기 시작해서
#      화면 긁기 자체가 불가능해짐 → 정식 API(Start 요금제, $9.99/월, 월 1,000콜)로 전환.
#
# 기존 방식과 다른 점(장점):
#   - tmdbId를 API가 직접 줌 → "영어제목으로 TMDB 검색해서 매칭" 단계 불필요, 오매칭 사고 원천 차단
#   - 영화/TV 구분(type)도 API 요청 시 우리가 지정한 값 그대로 응답에 찍혀서 옴 → 분류 오류 없음
#   - 403 차단 문제 자체가 없음 (정식 인증된 API 호출)
#
# 지금 버전은 db.py의 기존 save_rankings_batch()가 기대하는 입력 형태를 그대로 맞춰서
# (platform/category_slot/source_name/rank/title_en) 최소 변경으로 오늘 바로 크롤링이
# 돌아가게 하는 데 집중함. tmdb_id를 db.py 저장 로직에서 직접 활용하도록 연결하는 작업은
# 다음 단계로 별도 진행 예정(현재는 tmdb_id/media_type을 결과에 추가로만 실어서 반환).

import os
import requests
from datetime import datetime, timezone, timedelta

from crawlers.flixpatrol_base import get_category_slots  # 슬롯 설정(crawl_limit 등) 조회 재사용

API_KEY = os.environ.get("FLIXPATROL_API_KEY")
API_BASE = "https://api.flixpatrol.com/v2"

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime("%Y-%m-%d")
TWO_DAYS_AGO = (datetime.now(KST) - timedelta(days=2)).strftime("%Y-%m-%d")

# 2026-07-29 테스트 호출로 실측 확정한 값 (test_flixpatrol_api.py 결과)
COMPANY_IDS = {
    "netflix": "cmp_IA6TdMqwf6kuyQvxo9bJ4nKX",
    "disney":  "cmp_oGtsgdpOrjIu3XzTEnWPt87Y",
    "wavve":   "cmp_8aaQ3PlONbeWiHX60xVfZLm4",
    "coupang": "cmp_mbbiAI3Ec9j15zKG0bNkSspd",
}

COUNTRY_IDS = {
    "KR":    "cnt_RyEvbGi0mzOncND8jVoZ2HST",
    "World": "cnt_aP0RJTnt9XO4bVmoriU3Ih7q",
}

# FlixPatrol Type enum (공식 문서 기준)
TYPE_OVERALL = 1
TYPE_MOVIES = 2
TYPE_TVSHOWS = 3
TYPE_ENTERTAINMENT = 54

# category_slot → (type, country) 매핑
# ※ 여기 없는 슬롯(예: netflix category09/10, disney category04)은 수동 관리 슬롯이라 스킵됨
CATEGORY_API_MAP = {
    "netflix": {
        "category01": {"type": TYPE_MOVIES,  "country": "KR"},
        "category02": {"type": TYPE_TVSHOWS, "country": "KR"},
        "category07": {"type": TYPE_MOVIES,  "country": "World"},
        "category08": {"type": TYPE_TVSHOWS, "country": "World"},
    },
    "disney": {
        "category01": {"type": TYPE_OVERALL, "country": "KR"},
        "category02": {"type": TYPE_MOVIES,  "country": "KR"},
        "category03": {"type": TYPE_TVSHOWS, "country": "KR"},
    },
    "wavve": {
        "category01": {"type": TYPE_OVERALL,       "country": "KR"},
        "category02": {"type": TYPE_MOVIES,        "country": "KR"},
        "category04": {"type": TYPE_TVSHOWS,       "country": "KR"},
        "category05": {"type": TYPE_ENTERTAINMENT, "country": "KR"},
    },
    "coupang": {
        "category01": {"type": TYPE_OVERALL, "country": "KR"},
        "category02": {"type": TYPE_MOVIES,  "country": "KR"},
        "category03": {"type": TYPE_TVSHOWS, "country": "KR"},
    },
}


def _api_get(path, params=None):
    """FlixPatrol API 공통 호출 — 실패해도 예외 던지지 않고 None 반환(한 슬롯 실패가 전체를 막지 않도록)"""
    if not API_KEY:
        print("  [flixpatrol_api] ❌ FLIXPATROL_API_KEY 환경변수 없음")
        return None
    try:
        resp = requests.get(
            f"{API_BASE}{path}",
            params=params,
            auth=(API_KEY, ""),  # HTTP Basic Auth — API 키를 username 자리에
            timeout=20,
        )
        if resp.status_code != 200:
            print(f"  [flixpatrol_api] ⚠️ status={resp.status_code} path={path} params={params}")
            print(f"  [flixpatrol_api] ⚠️ 응답 본문: {resp.text[:500]}")
            return None
        return resp.json()
    except Exception as e:
        print(f"  [flixpatrol_api] ⚠️ 호출 에러: {e}")
        return None


async def crawl_flixpatrol(platform: str, local_conn) -> list[dict]:
    """
    FlixPatrol API로 한 플랫폼의 전체 슬롯 크롤링.
    반환 형태는 기존 flixpatrol_base.crawl_flixpatrol()과 동일하게 맞춤
    (db.py의 save_rankings_batch가 그대로 쓸 수 있도록):
        { platform, category_slot, source_name, rank, title_en, tmdb_id, media_type }
    tmdb_id/media_type은 추가 필드 — db.py 연동은 다음 단계에서 진행.
    """
    company_id = COMPANY_IDS.get(platform)
    api_map = CATEGORY_API_MAP.get(platform)

    if not company_id or not api_map:
        print(f"  [{platform}] ⚠️ API 매핑 정보 없음 — 스킵")
        return []

    slots = get_category_slots(local_conn, platform)
    if not slots:
        print(f"  [{platform}] ⚠️ ott_categories에 슬롯 설정 없음")
        return []

    results = []

    for slot in slots:
        category_slot = slot["category_slot"]
        mapping = api_map.get(category_slot)
        if not mapping:
            # 수동 관리 슬롯(예: 역대 순위, HOT100 등) — API 크롤링 대상 아님
            continue

        country_id  = COUNTRY_IDS.get(mapping["country"])
        crawl_limit = slot["crawl_limit"] or 20
        source_name = slot["source_name"]

        # World(글로벌)는 /top10s가 아니라 /rankings 엔드포인트 사용 (진단으로 확인됨 —
        # TOP10s는 개별 국가 데이터만 제공, World라는 국가 자체가 없음)
        endpoint = "/rankings" if mapping["country"] == "World" else "/top10s"

        print(f"  [{platform}][{category_slot}] '{source_name}' API 조회 중 "
              f"(type={mapping['type']}, country={mapping['country']}, endpoint={endpoint})")

        data = _api_get(endpoint, {
            "company[eq]":     company_id,
            "country[eq]":     country_id,
            "type[eq]":        mapping["type"],
            "date[type][eq]":  1,             # Day
            "date[from][gte]": TWO_DAYS_AGO,  # 최근 2일 범위로 요청
            "date[from][lte]": TODAY,
        })

        if not data or not data.get("data"):
            print(f"  [{platform}][{category_slot}] ⚠️ 데이터 없음")
            continue

        rows = data["data"]

        # 응답에 여러 날짜가 섞여 올 수 있으니, 그 중 가장 최신 날짜만 골라 사용
        latest_date = max(
            (r.get("data", {}).get("date", {}).get("from") for r in rows if r.get("data", {}).get("date")),
            default=None,
        )
        if latest_date:
            rows = [r for r in rows if r.get("data", {}).get("date", {}).get("from") == latest_date]
            print(f"  [{platform}][{category_slot}] 최신 날짜: {latest_date} ({len(rows)}건)")

        # ranking 오름차순 정렬 후 crawl_limit만큼만 사용
        rows.sort(key=lambda r: r.get("data", {}).get("ranking", 9999))

        count = 0
        for row in rows:
            if count >= crawl_limit:
                break
            row_data = row.get("data", {})
            movie = row_data.get("movie", {}).get("data", {})

            title = movie.get("title")
            rank = row_data.get("ranking")
            if not title or not rank:
                continue

            results.append({
                "platform":      platform,
                "category_slot": category_slot,
                "source_name":   source_name,
                "rank":          rank,
                "title_en":      title,
                "tmdb_id":       movie.get("tmdbId"),   # 신규 — API가 직접 제공
                "media_type":    mapping["type"],        # 신규 — 우리가 요청한 값 그대로
            })
            count += 1

        print(f"  [{platform}][{category_slot}] 수집: {count}개")

    return results
