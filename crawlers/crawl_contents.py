"""
crawl_contents.py — OTT 콘텐츠(예고편/신작) 크롤러
=====================================================
YouTube Data API v3로 5개 OTT 공식 채널의 최신 영상을 수집하고
Claude API로 작품명 추출 + 타입 분류 후 D1에 저장합니다.

흐름:
  ① YouTube API → 채널별 최신 영상 수집 (초기 10개 / 이후 5개)
  ② /admin/contents/check 로 중복 체크 (DB에 있으면 Claude 호출 SKIP)
  ③ Python 키워드 1차 필터 (무료)
  ④ Claude API → 작품명 추출 + 타입 분류 (신규 영상만)
  ⑤ TMDB API → 작품 매칭 (confidence 0.8 이상만 자동 매칭)
  ⑥ /admin/contents POST → D1 저장

환경변수 (GitHub Actions Secrets):
  YOUTUBE_API_KEY   : YouTube Data API v3 키
  ADMIN_SECRET      : 오뜨랑 관리자 API 토큰
  ANTHROPIC_API_KEY : Claude API 키
  TMDB_API_KEY      : TMDB API 키
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone

# ─────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────

# API 엔드포인트
API_BASE      = "https://ottrank-api.tdidream.workers.dev"
YOUTUBE_API   = "https://www.googleapis.com/youtube/v3"
TMDB_API      = "https://api.themoviedb.org/3"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

# 환경변수에서 키 로드
YOUTUBE_API_KEY   = os.environ.get("YOUTUBE_API_KEY", "")
ADMIN_SECRET      = os.environ.get("ADMIN_SECRET", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
TMDB_API_KEY      = os.environ.get("TMDB_API_KEY", "")

# 초기 실행 여부 (환경변수로 제어)
# GitHub Actions에서 workflow_dispatch 시 inputs.initial=true 로 전달 가능
IS_INITIAL = os.environ.get("CRAWL_INITIAL", "false").lower() == "true"
MAX_PER_CHANNEL = 10 if IS_INITIAL else 5

# 크롤링 대상 OTT 채널
# key: platform 코드 (DB 저장값), value: YouTube 채널 ID
OTT_CHANNELS = {
    "netflix" : "UCiEEF51uRAeZeCo8CJFhGWw",  # @NetflixKorea
    "tving"   : "UCuPSKBzIdUKBzH6zxJfBcgA",  # @TVING_official
    "disney"  : "UCiDRmGbGqEBpnkPYP9TgLig",  # @DisneyPlusKR
    "coupang" : "UC7gXFMXsZUKDNJcZOnOhPAw",  # @CoupangPlay
    "wavve"   : "UCTPKaLvlsOVUGNklvSJFfAw",  # @wavve
}

# 키워드 1차 필터 — 이 중 하나라도 포함되면 통과
KEYWORDS = [
    "예고편", "티저", "선공개", "메인 예고", "공식 예고",
    "클립", "하이라이트", "trailer", "teaser", "preview",
    "now streaming", "공개", "지금 바로",
]

# Claude 타입 분류 기준
VALID_TYPES = ["trailer", "teaser", "preview", "release"]


# ─────────────────────────────────────────────
# 헬퍼: 로그 출력
# ─────────────────────────────────────────────
def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ─────────────────────────────────────────────
# STEP ①: YouTube 채널 최신 영상 수집
# ─────────────────────────────────────────────
def fetch_youtube_videos(channel_id: str, platform: str, max_results: int) -> list:
    """YouTube Data API v3로 채널의 최신 영상을 수집합니다."""
    try:
        url = (
            f"{YOUTUBE_API}/search"
            f"?part=snippet"
            f"&channelId={channel_id}"
            f"&type=video"
            f"&order=date"
            f"&maxResults={max_results}"
            f"&key={YOUTUBE_API_KEY}"
        )
        res  = requests.get(url, timeout=15)
        data = res.json()

        if not res.ok or "items" not in data:
            log(f"  ❌ YouTube API 오류 [{platform}]: {data.get('error', {}).get('message', '알 수 없는 오류')}")
            return []

        videos = []
        for item in data.get("items", []):
            video_id = item.get("id", {}).get("videoId")
            snippet  = item.get("snippet", {})
            if not video_id:
                continue

            # 썸네일: maxres > high > medium > default 순으로 선택
            thumbnails = snippet.get("thumbnails", {})
            thumbnail  = (
                thumbnails.get("maxres", {}).get("url") or
                thumbnails.get("high",   {}).get("url") or
                thumbnails.get("medium", {}).get("url") or
                thumbnails.get("default",{}).get("url") or ""
            )

            videos.append({
                "youtube_id"  : video_id,
                "title"       : snippet.get("title", ""),
                "thumbnail"   : thumbnail,
                "published_at": snippet.get("publishedAt", ""),
                "platform"    : platform,
            })

        log(f"  📺 [{platform}] YouTube 영상 {len(videos)}개 수집")
        return videos

    except Exception as e:
        log(f"  ❌ YouTube 수집 오류 [{platform}]: {e}")
        return []


# ─────────────────────────────────────────────
# STEP ②: 중복 체크 (DB에 이미 있는지 확인)
# ─────────────────────────────────────────────
def check_duplicate(youtube_id: str) -> bool:
    """DB에 이미 저장된 youtube_id인지 확인합니다. True면 중복."""
    try:
        res  = requests.get(
            f"{API_BASE}/admin/contents/check",
            params  = {"youtube_id": youtube_id},
            headers = {"Authorization": f"Bearer {ADMIN_SECRET}"},
            timeout = 10,
        )
        data = res.json()
        return data.get("exists", False)
    except Exception as e:
        log(f"  ⚠️  중복 체크 오류 ({youtube_id}): {e}")
        # 오류 시 중복 아닌 것으로 처리 (저장 시도, UNIQUE 제약으로 보호됨)
        return False


# ─────────────────────────────────────────────
# STEP ③: 키워드 1차 필터
# ─────────────────────────────────────────────
def keyword_filter(title: str) -> bool:
    """제목에 OTT 콘텐츠 관련 키워드가 포함되어 있는지 확인합니다."""
    title_lower = title.lower()
    return any(kw.lower() in title_lower for kw in KEYWORDS)


# ─────────────────────────────────────────────
# STEP ④: Claude API — 작품명 추출 + 타입 분류
# ─────────────────────────────────────────────
def classify_with_claude(videos: list) -> list:
    """
    Claude API로 YouTube 제목에서 작품명을 추출하고 타입을 분류합니다.
    비용 최소화를 위해 여러 영상을 한 번에 배치 처리합니다.

    반환: [{ youtube_id, work_title, type, confidence }, ...]
    """
    if not videos:
        return []

    # 배치 프롬프트 구성 (여러 영상을 한 번에 처리)
    video_list = "\n".join([
        f'{i+1}. youtube_id="{v["youtube_id"]}" | 제목="{v["title"]}" | 플랫폼={v["platform"]}'
        for i, v in enumerate(videos)
    ])

    prompt = f"""아래는 OTT 플랫폼 공식 YouTube 채널의 영상 제목 목록입니다.
각 영상에 대해 다음을 분석해 주세요:

1. work_title: 영상에 등장하는 작품명 (한국어 또는 영어 원제). 작품명을 특정할 수 없으면 null
2. type: 영상 타입 분류
   - "trailer"  : 공식 예고편, 메인 예고편
   - "teaser"   : 티저, 짧은 예고
   - "preview"  : 선공개 클립, 하이라이트
   - "release"  : 신작 공개 알림 ("지금 공개", "Now Streaming" 등)
3. confidence: 분류 신뢰도 (0.0 ~ 1.0)

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
[
  {{"youtube_id": "...", "work_title": "작품명 또는 null", "type": "trailer", "confidence": 0.95}},
  ...
]

영상 목록:
{video_list}"""

    try:
        res = requests.post(
            ANTHROPIC_API,
            headers={
                "Content-Type"      : "application/json",
                "x-api-key"         : ANTHROPIC_API_KEY,
                "anthropic-version" : "2023-06-01",
            },
            json={
                "model"     : "claude-haiku-4-5-20251001",  # 비용 최소화
                "max_tokens": 1000,
                "messages"  : [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        data     = res.json()
        raw_text = data.get("content", [{}])[0].get("text", "[]")

        # JSON 파싱 (마크다운 코드블록 제거)
        cleaned  = raw_text.replace("```json", "").replace("```", "").strip()
        results  = json.loads(cleaned)

        log(f"  🤖 Claude 분류 완료: {len(results)}개")
        return results if isinstance(results, list) else []

    except json.JSONDecodeError as e:
        log(f"  ❌ Claude 응답 파싱 실패: {e}\n     원문: {raw_text[:200]}")
        return []
    except Exception as e:
        log(f"  ❌ Claude API 오류: {e}")
        return []


# ─────────────────────────────────────────────
# STEP ⑤: TMDB 작품 검색
# ─────────────────────────────────────────────
def search_tmdb(work_title: str) -> dict | None:
    """
    TMDB API로 작품을 검색합니다.
    영화/TV 순으로 검색해 첫 번째 결과를 반환합니다.
    """
    if not work_title:
        return None

    for media_type in ["movie", "tv"]:
        try:
            res = requests.get(
                f"{TMDB_API}/search/{media_type}",
                params={
                    "query"         : work_title,
                    "api_key"       : TMDB_API_KEY,
                    "language"      : "ko-KR",
                    "include_adult" : False,
                },
                timeout=10,
            )
            data    = res.json()
            results = data.get("results", [])

            if results:
                best = results[0]
                return {
                    "tmdb_id"  : best.get("id"),
                    "tmdb_type": media_type,
                }
        except Exception as e:
            log(f"  ⚠️  TMDB 검색 오류 ({work_title}/{media_type}): {e}")

    return None


# ─────────────────────────────────────────────
# STEP ⑥: D1 저장
# ─────────────────────────────────────────────
def save_content(video: dict, claude_result: dict, tmdb_result: dict | None) -> bool:
    """
    /admin/contents API를 호출해 D1에 영상 정보를 저장합니다.
    UNIQUE 충돌(409) 시 중복으로 처리합니다.
    """
    # confidence 0.8 미만이면 tmdb_id 저장 안 함 (Admin 수동 매칭 대기)
    confidence = claude_result.get("confidence", 0)
    use_tmdb   = tmdb_result if confidence >= 0.8 else None

    payload = {
        "youtube_id"  : video["youtube_id"],
        "platform"    : video["platform"],
        "type"        : claude_result.get("type", "trailer"),
        "title"       : video["title"],
        "work_title"  : claude_result.get("work_title") or None,
        "tmdb_id"     : use_tmdb["tmdb_id"]   if use_tmdb else None,
        "tmdb_type"   : use_tmdb["tmdb_type"] if use_tmdb else None,
        "thumbnail"   : video["thumbnail"] or None,
        "published_at": video["published_at"],
    }

    try:
        res  = requests.post(
            f"{API_BASE}/admin/contents",
            headers = {
                "Authorization": f"Bearer {ADMIN_SECRET}",
                "Content-Type" : "application/json",
            },
            json    = payload,
            timeout = 10,
        )
        data = res.json()

        if res.status_code == 409:
            log(f"  ⏭️  중복 스킵: {video['youtube_id']}")
            return False
        if not data.get("ok"):
            log(f"  ❌ 저장 실패: {video['youtube_id']} — {data.get('error')}")
            return False

        tmdb_info = f" (TMDB:{use_tmdb['tmdb_id']})" if use_tmdb else " (TMDB 미매칭)"
        log(f"  ✅ 저장 완료: [{video['platform']}] {video['title'][:40]}{tmdb_info}")
        return True

    except Exception as e:
        log(f"  ❌ 저장 오류: {video['youtube_id']} — {e}")
        return False


# ─────────────────────────────────────────────
# 메인 실행
# ─────────────────────────────────────────────
def main():
    # 환경변수 체크
    missing = [k for k, v in {
        "YOUTUBE_API_KEY"  : YOUTUBE_API_KEY,
        "ADMIN_SECRET"     : ADMIN_SECRET,
        "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
        "TMDB_API_KEY"     : TMDB_API_KEY,
    }.items() if not v]

    if missing:
        log(f"❌ 필수 환경변수 누락: {', '.join(missing)}")
        sys.exit(1)

    mode = "초기(10개)" if IS_INITIAL else "일반(5개)"
    log(f"🚀 OTT 콘텐츠 크롤링 시작 — 모드: {mode}")
    log(f"   대상 채널: {len(OTT_CHANNELS)}개")

    total_saved   = 0  # 최종 저장 수
    total_skipped = 0  # 중복 스킵 수
    total_claude  = 0  # Claude API 호출 수

    for platform, channel_id in OTT_CHANNELS.items():
        log(f"\n📡 [{platform.upper()}] 크롤링 중...")

        # ① YouTube 영상 수집
        videos = fetch_youtube_videos(channel_id, platform, MAX_PER_CHANNEL)
        if not videos:
            continue

        # ② 중복 체크 — DB에 이미 있는 것 제거
        new_videos = []
        for v in videos:
            if check_duplicate(v["youtube_id"]):
                log(f"  ⏭️  중복 스킵: {v['youtube_id']} ({v['title'][:30]})")
                total_skipped += 1
            else:
                new_videos.append(v)
            time.sleep(0.1)  # API 레이트 리밋 방지

        if not new_videos:
            log(f"  ℹ️  [{platform}] 신규 영상 없음")
            continue

        log(f"  🆕 [{platform}] 신규 영상 {len(new_videos)}개 처리 시작")

        # ③ 키워드 1차 필터
        filtered_videos = [v for v in new_videos if keyword_filter(v["title"])]
        skipped_keyword = len(new_videos) - len(filtered_videos)
        if skipped_keyword:
            log(f"  🔍 키워드 필터로 {skipped_keyword}개 제외")

        if not filtered_videos:
            log(f"  ℹ️  [{platform}] 키워드 통과 영상 없음")
            continue

        # ④ Claude API — 배치 처리 (채널 단위로 한 번만 호출)
        total_claude += 1
        claude_results = classify_with_claude(filtered_videos)

        # claude_results를 youtube_id 기준 딕셔너리로 변환
        claude_map = {r["youtube_id"]: r for r in claude_results}

        # ⑤⑥ TMDB 검색 + D1 저장
        for video in filtered_videos:
            claude_result = claude_map.get(video["youtube_id"], {
                "work_title" : None,
                "type"       : "trailer",
                "confidence" : 0,
            })

            # TMDB 검색 (work_title이 있고 confidence 0.8 이상일 때만)
            tmdb_result = None
            if claude_result.get("work_title") and claude_result.get("confidence", 0) >= 0.8:
                tmdb_result = search_tmdb(claude_result["work_title"])
                time.sleep(0.3)  # TMDB API 레이트 리밋 방지

            # D1 저장
            saved = save_content(video, claude_result, tmdb_result)
            if saved:
                total_saved += 1

            time.sleep(0.2)  # API 레이트 리밋 방지

        # 채널 간 간격
        time.sleep(1)

    # 최종 결과 요약
    log(f"\n{'='*50}")
    log(f"✅ 크롤링 완료")
    log(f"   저장: {total_saved}개")
    log(f"   중복 스킵: {total_skipped}개")
    log(f"   Claude API 호출: {total_claude}회")
    log(f"{'='*50}")


if __name__ == "__main__":
    main()
