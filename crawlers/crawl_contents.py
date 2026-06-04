"""
crawl_contents.py — OTT 콘텐츠(예고편/신작) 크롤러
=====================================================
YouTube Data API v3로 5개 OTT 공식 채널에서
"예고편", "선공개", "메인 예고" 키워드가 포함된 최신 영상 5개를 수집합니다.

흐름:
  ① YouTube Search API → 채널별 키워드 검색으로 최신 5개 수집
  ② /admin/contents/check 로 중복 체크 (DB에 있으면 Claude 호출 SKIP)
  ③ Claude API → 작품명 추출 (신규 영상만, 채널 단위 배치 처리)
  ④ TMDB API → 작품 매칭 (work_title이 있고 confidence 0.8 이상일 때만)
  ⑤ /admin/contents POST → D1 저장

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
from datetime import datetime

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

# 채널당 수집할 최대 영상 수 (고정 5개)
MAX_PER_CHANNEL = 5

# 크롤링 대상 OTT 채널
# key: platform 코드 (DB 저장값), value: YouTube 채널 ID
OTT_CHANNELS = {
    "netflix" : "UCiEEF51uRAeZeCo8CJFhGWw",  # @NetflixKorea
    "tving"   : "UCNIiH_4ArJNd_cDZApZ7AFg",  # @TVING_official
    "disney"  : "UCtdz9LWNNQKUg4Xpma_40Ug",  # @DisneyPlusKR
    "coupang" : "UCjn-VbcIkAeXQKCmLJV8YwQ",  # @CoupangPlay
    "wavve"   : "UCym5538xAEEppbridXozfgw",  # @wavve
}

# YouTube 검색 키워드 (채널 내 검색에 사용, | 는 OR 조건)
SEARCH_QUERY = "예고편|선공개|메인 예고"

# 키워드별 type 매핑 (DB 저장값)
TYPE_MAP = {
    "예고편"  : "trailer",
    "메인 예고": "trailer",
    "선공개"  : "preview",
}


# ─────────────────────────────────────────────
# 헬퍼: 로그 출력
# ─────────────────────────────────────────────
def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ─────────────────────────────────────────────
# 헬퍼: 제목에서 매칭된 키워드로 type 결정
# ─────────────────────────────────────────────
def get_content_type(title: str) -> str:
    """제목에서 매칭된 키워드로 type을 결정합니다."""
    for kw, content_type in TYPE_MAP.items():
        if kw in title:
            return content_type
    return "trailer"  # 기본값


# ─────────────────────────────────────────────
# STEP ①: YouTube 채널 내 키워드 검색
# ─────────────────────────────────────────────
def fetch_youtube_videos(channel_id: str, platform: str) -> list:
    """
    YouTube Data API v3로 채널 내에서 키워드 검색으로 영상을 수집합니다.
    "예고편 OR 선공개 OR 메인 예고" 가 포함된 최신 5개만 가져옵니다.
    """
    try:
        url = (
            f"{YOUTUBE_API}/search"
            f"?part=snippet"
            f"&channelId={channel_id}"
            f"&q={requests.utils.quote(SEARCH_QUERY)}"
            f"&type=video"
            f"&order=date"
            f"&maxResults={MAX_PER_CHANNEL}"
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

        log(f"  📺 [{platform}] 키워드 검색 결과 {len(videos)}개 수집")
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
# STEP ③: Claude API — 작품명 추출
# ─────────────────────────────────────────────
def extract_work_titles(videos: list) -> list:
    """
    Claude API로 YouTube 제목에서 작품명만 추출합니다.
    비용 최소화를 위해 채널 단위 배치 처리합니다.

    반환: [{ youtube_id, work_title, confidence }, ...]
    """
    if not videos:
        return []

    video_list = "\n".join([
        f'{i+1}. youtube_id="{v["youtube_id"]}" | 제목="{v["title"]}"'
        for i, v in enumerate(videos)
    ])

    prompt = f"""아래는 OTT 플랫폼 공식 YouTube 채널의 예고편/선공개 영상 제목 목록입니다.
각 영상 제목에서 드라마/영화/예능 작품명만 추출해 주세요.

규칙:
- work_title: 제목에서 작품명만 추출 (한국어 또는 영어 원제)
- 작품명을 특정할 수 없으면 null
- confidence: 추출 신뢰도 (0.0 ~ 1.0)
- 예고편, 선공개, 시즌, 파트, 공식 등의 수식어는 제거하고 순수 작품명만 추출

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
[
  {{"youtube_id": "...", "work_title": "작품명 또는 null", "confidence": 0.95}},
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
        cleaned = raw_text.replace("```json", "").replace("```", "").strip()
        results = json.loads(cleaned)

        log(f"  🤖 Claude 작품명 추출 완료: {len(results)}개")
        return results if isinstance(results, list) else []

    except json.JSONDecodeError as e:
        log(f"  ❌ Claude 응답 파싱 실패: {e}\n     원문: {raw_text[:200]}")
        return []
    except Exception as e:
        log(f"  ❌ Claude API 오류: {e}")
        return []


# ─────────────────────────────────────────────
# STEP ④: TMDB 작품 검색
# ─────────────────────────────────────────────
def search_tmdb(work_title: str) -> dict | None:
    """
    TMDB API로 작품을 검색합니다.
    TV → 영화 순으로 검색해 첫 번째 결과를 반환합니다.
    """
    if not work_title:
        return None

    for media_type in ["tv", "movie"]:
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
# STEP ⑤: D1 저장
# ─────────────────────────────────────────────
def save_content(video: dict, claude_result: dict, tmdb_result: dict | None) -> bool:
    """
    /admin/contents API를 호출해 D1에 영상 정보를 저장합니다.
    UNIQUE 충돌(409) 시 중복으로 처리합니다.
    """
    # 제목 키워드로 type 결정
    content_type = get_content_type(video["title"])

    # confidence 0.8 미만이면 tmdb_id 저장 안 함 (Admin 수동 매칭 대기)
    confidence = claude_result.get("confidence", 0)
    use_tmdb   = tmdb_result if confidence >= 0.8 else None

    payload = {
        "youtube_id"  : video["youtube_id"],
        "platform"    : video["platform"],
        "type"        : content_type,
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
            log(f"  ⏭️  중복 스킵: {video['title'][:40]}")
            return False
        if not data.get("ok"):
            log(f"  ❌ 저장 실패: {video['youtube_id']} — {data.get('error')}")
            return False

        tmdb_info = f" (TMDB:{use_tmdb['tmdb_id']})" if use_tmdb else " (TMDB 미매칭)"
        log(f"  ✅ 저장: [{video['platform']}] [{content_type}] {video['title'][:40]}{tmdb_info}")
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

    log(f"🚀 OTT 콘텐츠 크롤링 시작 (채널당 {MAX_PER_CHANNEL}개)")
    log(f"   검색 키워드: {SEARCH_QUERY}")
    log(f"   대상 채널: {len(OTT_CHANNELS)}개")

    total_saved   = 0  # 최종 저장 수
    total_skipped = 0  # 중복 스킵 수
    total_claude  = 0  # Claude API 호출 수

    for platform, channel_id in OTT_CHANNELS.items():
        log(f"\n📡 [{platform.upper()}] 크롤링 중...")

        # ① YouTube 채널 내 키워드 검색
        videos = fetch_youtube_videos(channel_id, platform)
        if not videos:
            continue

        # ② 중복 체크 — DB에 이미 있는 것 제거
        new_videos = []
        for v in videos:
            if check_duplicate(v["youtube_id"]):
                log(f"  ⏭️  중복 스킵: {v['title'][:40]}")
                total_skipped += 1
            else:
                new_videos.append(v)
            time.sleep(0.1)  # API 레이트 리밋 방지

        if not new_videos:
            log(f"  ℹ️  [{platform}] 신규 영상 없음")
            continue

        log(f"  🆕 [{platform}] 신규 영상 {len(new_videos)}개 처리 시작")

        # ③ Claude API — 작품명 추출 (채널 단위 배치, 1회 호출)
        total_claude += 1
        claude_results = extract_work_titles(new_videos)
        claude_map     = {r["youtube_id"]: r for r in claude_results}

        # ④⑤ TMDB 검색 + D1 저장
        for video in new_videos:
            claude_result = claude_map.get(video["youtube_id"], {
                "work_title" : None,
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
