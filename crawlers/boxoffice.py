"""극장 박스오피스 크롤러 - KOBIS(영화진흥위원회) 오픈API 직접 연동
────────────────────────────────────────────────────────────────
2026-08-04 rev.3 — boxoffice.py (boxoffice_stats.target_date 컬럼 신규 저장 — 지금까지
  date 컬럼엔 "크롤링을 실행한 날"이 저장되고 있었는데, 상세페이지에서 "이게 실제로 며칠
  순위인지"를 보여주려면 KOBIS에 요청할 때 쓴 실제 집계일(target_dt, 항상 어제)이 필요함.
  _fetch_kobis_daily()가 이미 계산해둔 target_dt를 반환하도록 수정하고, 저장 함수까지
  그대로 넘겨서 target_date 컬럼(YYYY-MM-DD 형식으로 변환)에 저장. date 컬럼(크롤링 저장일)
  은 기존 그대로 안 건드림)
2026-08-02 rev.2 — boxoffice.py (KOBIS 접속 타임아웃 시 즉시 포기하지 않고
  5초 간격으로 최대 3번까지 그 자리에서 재시도하도록 수정 — 하루 3회 스케줄
  중 한 회차가 통째로 실패해도 몇 초 안에 자체 복구되도록 함. 재시도 로직만
  추가, 매칭/저장 로직은 전혀 안 건드림)
2026-07-29 rev.1 — boxoffice.py (KOBIS_URL을 http → https로 변경 —
  GitHub Actions에서 http(80번 포트) 접속이 타임아웃되던 문제 수정)

2026-07-18 변경사항:
  - Playwright + 무비차트(moviechart.co.kr) 화면 크롤링 제거
  - KOBIS searchDailyBoxOfficeList API 직접 호출로 교체 (브라우저 실행 불필요)
  - 관객수/매출/스크린수 등 상세 지표를 boxoffice_stats 테이블에 신규 저장
    → 작품 상세페이지(_title_detail.html)에서 활용 예정

핵심 원칙:
  - targetDt는 항상 "어제(KST)" 고정. 몇 시에 크롤링이 돌든 동일하게 요청.
    (KOBIS 데이터는 익일 오전 확정되면 그날 하루 안 바뀌므로, 회차 시간을
    따로 계산할 필요 없음)
  - KOBIS 응답이 비어있거나 에러면 조용히 스킵 → 같은 날 다음 회차가 재시도
  - KOBIS 숫자 필드는 전부 문자열로 오므로 저장 전 반드시 int()/float() 변환
  - 매칭 파이프라인은 db.py의 기존 검증된 함수 재사용 (lookup_works,
    search_tmdb_korean, insert_work, save_review_queue) — 새 매칭 로직 없음
────────────────────────────────────────────────────────────────
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import time
import sqlite3
import requests
from datetime import datetime, timedelta, timezone

from db import (
    init_db, get_today, lookup_works, search_tmdb_korean,
    insert_work, save_review_queue,
)

KST = timezone(timedelta(hours=9))
KOBIS_API_KEY = os.environ.get("KOBIS_API_KEY", "")
KOBIS_URL = "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json"

# 박스오피스 고정 슬롯 설정 (기존과 동일 유지)
PLATFORM      = "boxoffice"
CATEGORY_SLOT = "category01"
SOURCE_NAME   = "일별 박스오피스"


# ══════════════════════════════════════════════════════════════
# ① KOBIS API 호출
# ══════════════════════════════════════════════════════════════

def _get_target_dt() -> str:
    """항상 '어제(KST)' 날짜를 yyyymmdd 형식으로 반환 (실행 시각과 무관하게 동일 로직)"""
    yesterday = datetime.now(KST) - timedelta(days=1)
    return yesterday.strftime("%Y%m%d")


def _fetch_kobis_daily() -> tuple[str, list[dict]]:
    """
    KOBIS 일별 박스오피스 API 호출 → (target_dt, 파싱된 리스트) 반환
    실패/데이터 미확정 시 (target_dt, 빈 리스트) 반환 → 크롤러는 조용히 스킵하고
    같은 날 다음 회차가 재시도하도록 함 (하루 5회 스케줄 중 몇 회가
    유실돼도 targetDt=어제 고정이라 자동으로 채워짐)
    [rev.3] target_dt도 같이 반환 — boxoffice_stats.target_date 저장에 사용
    """
    target_dt = _get_target_dt()

    if not KOBIS_API_KEY:
        print("  [박스오피스] KOBIS_API_KEY 없음 → 스킵")
        return target_dt, []

    params = {
        "key": KOBIS_API_KEY,
        "targetDt": target_dt,
        "itemPerPage": 10,
    }

    # [2026-08-02 추가] 접속 타임아웃 등으로 실패하면 5초 쉬었다가 최대 3번까지
    # 그 자리에서 재시도. 하루 3회 스케줄 중 한 회차가 통째로 KOBIS 접속 실패로
    # 날아가는 사고(7/27, 8/2 실제 발생)를 줄이기 위함. 마지막 시도까지 실패하면
    # 기존과 동일하게 조용히 빈 리스트 반환(같은 날 다음 회차가 또 재시도함).
    MAX_ATTEMPTS = 3
    RETRY_WAIT_SEC = 5
    data = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = requests.get(KOBIS_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as e:
            # 에러 로그에 API 키가 노출되지 않도록 params 전체는 출력하지 않음
            print(f"  [박스오피스] KOBIS API 호출 오류({attempt}/{MAX_ATTEMPTS}회): {type(e).__name__}: {e}")
            if attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_WAIT_SEC)

    if data is None:
        print(f"  [박스오피스] {MAX_ATTEMPTS}번 모두 실패 → 이번 회차는 스킵")
        return target_dt, []

    # KOBIS는 키 오류/날짜 형식 오류 시 boxOfficeResult 대신 faultInfo를 반환
    if "faultInfo" in data:
        fault = data["faultInfo"]
        print(f"  [박스오피스] KOBIS API 오류 응답: {fault.get('message', '알 수 없음')}")
        return target_dt, []

    raw_list = data.get("boxOfficeResult", {}).get("dailyBoxOfficeList", [])
    if not raw_list:
        print(f"  [박스오피스] {target_dt} 데이터 없음(아직 미확정 가능) → 스킵")
        return target_dt, []

    parsed = []
    for item in raw_list:
        try:
            parsed.append({
                "rank":             int(item["rank"]),
                "rank_inten":       int(item["rankInten"]),
                "rank_old_and_new": item["rankOldAndNew"],
                "movie_cd":         item["movieCd"],
                "movie_nm":         item["movieNm"],
                "audi_cnt":         int(item["audiCnt"]),
                "audi_acc":         int(item["audiAcc"]),
                "audi_change":      float(item["audiChange"]),
                "sales_amt":        int(item["salesAmt"]),
                "sales_share":      float(item["salesShare"]),
                "scrn_cnt":         int(item["scrnCnt"]),
                "show_cnt":         int(item["showCnt"]),
            })
        except (KeyError, ValueError) as e:
            # 항목 하나가 이상해도 전체를 죽이지 않고 그 항목만 건너뜀
            print(f"  [박스오피스] 항목 파싱 오류(건너뜀): {e} / {item.get('movieNm')}")
            continue

    print(f"  [박스오피스] KOBIS {target_dt} — {len(parsed)}개 수집")
    return target_dt, parsed


# ══════════════════════════════════════════════════════════════
# ② 저장 — rankings (기존 구조 그대로) + boxoffice_stats (신규)
# ══════════════════════════════════════════════════════════════

def _save_boxoffice_ranking(conn: sqlite3.Connection, rank: int, title_ko: str, tmdb_data: dict | None):
    """박스오피스 랭킹 rankings 테이블에 저장 (기존 boxoffice.py와 동일 구조 유지)"""
    today = get_today()
    if tmdb_data:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank,
                 title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            today, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, rank,
            tmdb_data.get("title_ko") or title_ko,
            tmdb_data.get("title_en") or title_ko,
            tmdb_data.get("tmdb_id"),
            tmdb_data.get("poster_path"),
            tmdb_data.get("genre"),
            tmdb_data.get("overview"),
            tmdb_data.get("release_year"),
            tmdb_data.get("tmdb_rating"),
        ))
    else:
        conn.execute("""
            INSERT OR REPLACE INTO rankings
                (date, platform, category, category_slot, source_name, rank, title_ko, title_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (today, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, rank, title_ko, title_ko))
    conn.commit()


def _save_boxoffice_stats(conn: sqlite3.Connection, tmdb_id: int, item: dict, crawl_date: str, target_date: str):
    """
    boxoffice_stats 테이블에 관객수/매출/스크린수 등 상세 지표 저장
    tmdb_id 매칭에 성공한 작품만 저장 (매칭 실패 작품은 어느 상세페이지에
    연결할지 알 수 없으므로 저장하지 않음)
    UNIQUE(tmdb_id, date) 기준 UPSERT — 같은 날 여러 회차가 돌아도 최신값으로 덮어씀
    [rev.3] target_date — 실제 이 지표가 집계된 날짜(KOBIS targetDt, 항상 어제).
    crawl_date(date 컬럼, 크롤링 실행일)와는 별개로 저장 — 상세페이지에서
    "몇 월 며칠 순위인지" 정확히 보여주는 용도
    """
    conn.execute("""
        INSERT INTO boxoffice_stats
            (tmdb_id, movie_cd, date, target_date, rank, rank_inten, rank_old_and_new,
             audi_cnt, audi_acc, audi_change, sales_amt, sales_share, scrn_cnt, show_cnt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id, date) DO UPDATE SET
            movie_cd         = excluded.movie_cd,
            target_date      = excluded.target_date,
            rank             = excluded.rank,
            rank_inten       = excluded.rank_inten,
            rank_old_and_new = excluded.rank_old_and_new,
            audi_cnt         = excluded.audi_cnt,
            audi_acc         = excluded.audi_acc,
            audi_change      = excluded.audi_change,
            sales_amt        = excluded.sales_amt,
            sales_share      = excluded.sales_share,
            scrn_cnt         = excluded.scrn_cnt,
            show_cnt         = excluded.show_cnt
    """, (
        tmdb_id, item["movie_cd"], crawl_date, target_date,
        item["rank"], item["rank_inten"], item["rank_old_and_new"],
        item["audi_cnt"], item["audi_acc"], item["audi_change"],
        item["sales_amt"], item["sales_share"], item["scrn_cnt"], item["show_cnt"],
    ))
    conn.commit()


# ══════════════════════════════════════════════════════════════
# ③ 실행 진입점 — run_all.py에서 호출
# ══════════════════════════════════════════════════════════════

async def run(conn):
    print("\n[박스오피스] KOBIS 오픈API 수집 중...")
    target_dt, items = _fetch_kobis_daily()

    if not items:
        print("  [박스오피스] 처리할 데이터 없음")
        return

    crawl_date = get_today()
    # [rev.3] target_dt는 "yyyymmdd"(KOBIS 요청용) → date 컬럼과 동일한 "YYYY-MM-DD" 형식으로 변환
    target_date = f"{target_dt[0:4]}-{target_dt[4:6]}-{target_dt[6:8]}"

    for item in items:
        rank     = item["rank"]
        title_ko = item["movie_nm"]

        # ① works 우선 조회 (KOBIS는 이미 한글 제목이라 title_ko로 바로 조회)
        tmdb_data = lookup_works(conn, title_ko)

        if tmdb_data:
            print(f"  ✅ [박스오피스] {rank:2d}. '{title_ko}' → works DB (tmdb_id={tmdb_data['tmdb_id']})")
        else:
            # ② TMDB 한글 검색 (Claude 번역 불필요 — 이미 한글 제목)
            tmdb_data = search_tmdb_korean(title_ko)
            if tmdb_data:
                tmdb_data["title_en"] = tmdb_data.get("title_en") or title_ko
                print(f"  ✅ [박스오피스] {rank:2d}. '{title_ko}' → TMDB 매칭 (tmdb_id={tmdb_data['tmdb_id']})")
                insert_work(conn, tmdb_data, match_source="auto_claude")
            else:
                print(f"  ⚠️ [박스오피스] {rank:2d}. '{title_ko}' → 매칭 실패, 검토 큐 저장")
                review_item = {
                    "platform": PLATFORM,
                    "category_slot": CATEGORY_SLOT,
                    "rank": rank,
                    "title_en": title_ko,
                }
                save_review_queue(conn, review_item, title_ko, fail_reason="tmdb_not_found")
            time.sleep(0.2)  # TMDB API 연속 호출 완충

        # rankings는 매칭 성공/실패 관계없이 저장 (기존 방식 동일)
        _save_boxoffice_ranking(conn, rank, title_ko, tmdb_data)

        # boxoffice_stats는 tmdb_id 확보된 작품만 저장
        if tmdb_data and tmdb_data.get("tmdb_id"):
            _save_boxoffice_stats(conn, tmdb_data["tmdb_id"], item, crawl_date, target_date)

    print(f"  [박스오피스] {len(items)}개 처리 완료")


if __name__ == "__main__":
    import asyncio
    conn = init_db()
    asyncio.run(run(conn))
    conn.close()
