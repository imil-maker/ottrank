/* ══════════════════════════════════════════════════════════════
   blog.js — 블로그 포스팅 자동 생성 API
   라우트:
     POST /blog-gen         : D1 랭킹 조회 + Anthropic API → 포스팅 생성 (관리자 전용)
     POST /blog-gen/suggest : D1 랭킹 조회 + Anthropic API → 제목 8개 추천 (관리자 전용)
     GET  /blog-gen/preview : 랭킹 데이터 미리보기 (관리자 전용, 테스트용)

   필요 환경 변수:
     env.DB                : Cloudflare D1 바인딩
     env.ANTHROPIC_API_KEY : Anthropic API 키 (Secret)

   2026-06-30 업데이트:
     - platform 단위가 아니라 ott_categories의 개별 category_slot 단위로
       랭킹 데이터를 선택할 수 있도록 변경 (categorySlot 파라미터, 'all'이면 기존처럼 전체 합산)
       → TV 시리즈/영화가 같은 platform 안에서도 카테고리로 이미 나뉘어 있으므로
         이걸 직접 고르게 하는 게 source_name 기반 추측보다 정확함
     - Anthropic API 호출에 web_search_20250305 툴 추가
       → D1에 없는 최신 트렌드(예: "다음 달 신작")가 필요하면 모델이 알아서 검색해서 반영
     - /blog-gen/suggest 프롬프트를 topicType(순위/추천/리뷰/화제)별로 완전히 분리
       → 예전엔 4개 유형 예시를 항상 다 보여주고 "골고루 섞어서 작성"하라고 시켜서
         topicType을 뭘 골라도 결과가 순위형/TOP10으로만 나오던 버그 수정
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const SITE_URL = "https://ottrank.kr";

// ─── 플랫폼 한국어 이름 매핑 ───────────────────────────────
const PLATFORM_NAMES = {
  netflix:   "넷플릭스",
  tving:     "티빙",
  wavve:     "웨이브",
  disney:    "디즈니+",
  coupang:   "쿠팡플레이",
  boxoffice: "박스오피스",
};

// ─── 블로그 톤별 AI 프롬프트 설명 ──────────────────────────
const TONE_LABELS = {
  friendly: `네이버 블로그 감성 말투. 짧은 줄바꿈, 본인 얘기로 시작, 독자에게 말 거는 느낌.
예시 (이 구조 그대로 따라할 것):

안녕하세요, 저 요즘 드라마에 빠져서
주말을 통째로 날리고 있어요ㅋㅋ

이번 주 넷플릭스 순위 보다가
진짜 깜짝 놀랐거든요
1위가 완전 예상 밖이었어서요

저도 어제 1화 바로 봤는데
생각보다 훨씬 재밌더라고요
한 화 보고 멈추질 못했어요`,

  expert: `드라마 리뷰 전문 블로거. 연출·연기·스토리를 구체적으로 분석함.
예시 문장:
- "연출 면에서 특히 눈에 띄는 건 초반 3화의 호흡인데요. 불필요한 장면을 쳐내고 핵심만 남긴 편집이 몰입감을 살립니다"
- "주연 배우의 눈빛 연기가 대사보다 많은 걸 말하는 장면이 여럿 있어요. 특히 3화 엔딩은..."
- "올해 나온 한국 드라마 중 완성도로는 상위권이라고 봅니다. 단 기대치를 낮추고 보셔야 할 부분도 있어요"`,

  humor: `리액션 큰 드라마 덕후. 본인 감정을 과장되게 표현함.
예시 문장:
- "야 이거 보다가 진짜 소리 질렀어요ㅋㅋㅋ 결말에서 저 혼자 방에서 멘붕 왔거든요"
- "이 드라마 때문에 요즘 잠을 못 자고 있습니다. 밤새 봤어요 솔직히..."
- "1화 보고 '어 그냥 그렇구나' 했는데 4화부터 미쳐가기 시작함ㅋㅋ"`,

  news: `정보 전달 위주. 수치·사실 중심으로 담백하게 씀.
예시 문장:
- "이번 주 넷플릭스 국내 1위는 지난주와 동일하게 유지됐습니다"
- "공개 3일 만에 글로벌 TOP 10 진입, 현재 6위를 기록 중입니다"
- "시청자 평점 기준 이번 시즌 평균 8.2점으로 전작보다 0.4점 상승했습니다"`,

  sns: `짧고 직관적인 MZ 말투. 줄임말·이모지 자연스럽게 사용.
예시 문장:
- "요즘 넷플 뭐봄? 나 이거 보는 중인데 진짜 재밌음"
- "이거 안 봤으면 손해 ㄹㅇ.. 주변에 다 권하는 중"
- "1화만 보려다 새벽 3시임.. 내일 출근인데 어떡하지"`,

  magazine: `감성적이고 문학적인 문체. 분위기와 여운을 강조함.
예시 문장:
- "이번 주말, 당신의 소파와 이 드라마면 충분합니다"
- "보고 나서 한동안 멍하니 있었어요. 그런 드라마 오랜만이었거든요"
- "어떤 드라마는 끝나고 나서도 한참을 머릿속에 남아요. 이게 그런 작품입니다"`,
};

// ─── 콘텐츠 유형별 AI 프롬프트 지시문 ─────────────────────
const CONTENT_TYPE_PROMPTS = {
  weekly_ranking:  "주간 TOP10 랭킹 포스팅을 작성해주세요. 순위와 함께 각 작품을 소개하고, 이번 주 특히 주목할 작품을 강조해주세요.",
  recommendation: "지금 당장 봐야 할 추천 작품 모음 포스팅을 작성해주세요. 각 작품의 매력 포인트와 추천 이유를 구체적으로 강조해주세요.",
  genre:          "장르별로 작품을 분류하고, 어떤 취향의 사람에게 어울리는지 설명을 포함한 추천 포스팅을 작성해주세요.",
  review:         "상위 3~5개 작품에 집중해서 줄거리, 볼거리, 추천 포인트를 담은 미니 리뷰 형태의 포스팅을 작성해주세요.",
};

// ─── 주제 유형(topicType)별 네이버 SEO 제목 패턴 ────────────
// ⚠️ 핵심: 각 유형의 예시·생성 규칙을 완전히 분리해서 프롬프트에는
//          사용자가 고른 topicType 패턴만 들어가게 한다.
//          (예전엔 4개 유형을 항상 다 보여주고 "골고루 섞어서 작성"까지 시켜서
//           어떤 topicType을 골라도 결과가 순위형/TOP10 위주로만 나오는 버그가 있었음)
// 플레이스홀더: {platform} {media} {week} → 프롬프트 생성 시 실제 값으로 치환
const TOPIC_PATTERNS = {
  ranking: {
    label: "순위형",
    examples: [
      "{platform} {media} 순위 TOP 10 ({week} 업데이트)",
      "요즘 {platform} 순위 {media} TOP 10 골라봄",
      "{week} {platform} 순위 {media} 정리",
      "{platform} 오늘 순위 TOP 10 {media} (최신)",
    ],
    rule:
      `1. "{platform} + 순위 + TOP N 또는 날짜" 조합 필수\n` +
      `2. 실제 랭킹 1~3위 작품명을 제목에 직접 활용 (검색량 극대화)\n` +
      `3. 날짜/주차 표기로 최신성 강조 (예: {week}, 2026 최신)`,
  },
  recommendation: {
    label: "추천형",
    examples: [
      "지금 당장 봐야 할 {platform} 추천 {media} BEST 5",
      "{platform} 볼만한거 없을 때 추천 {media} TOP 7",
      "요즘 핫한 {platform} {media} 추천 2026 최신판",
      "{platform} {media} 추천 장르별 모음 (로맨스·스릴러·범죄)",
    ],
    rule:
      `1. "지금 봐야 할", "추천", "BEST", "강추" 등 큐레이션 키워드 필수\n` +
      `2. TOP N 숫자는 선택적으로만 사용 — 순위 나열형 제목으로 흐르지 말 것\n` +
      `3. 장르·취향 기반 표현을 적극 활용`,
  },
  review: {
    label: "리뷰형",
    examples: [
      "{platform} 1위 [작품명] 솔직 후기 재밌어? 결말까지",
      "[작품명] {platform} {media} 완주 후기 (스포없음)",
      "{platform} [작품명] 정주행 완료 별점 몇 점?",
    ],
    rule:
      `1. 랭킹 1위 작품 하나에 집중한 단일 작품 리뷰 제목\n` +
      `2. "후기", "솔직 리뷰", "결말", "정주행" 등 감상 키워드 필수\n` +
      `3. TOP N 순위 나열형 제목은 절대 사용하지 말 것`,
  },
  issue: {
    label: "화제형",
    examples: [
      "{platform} {media} 화제작 이번 주 놓치면 후회 TOP 5",
      "2026 상반기 {platform} {media} 흥행 순위 정리",
      "{platform} [작품명] 시즌2 기대되는 이유",
    ],
    rule:
      `1. "화제", "이슈", "흥행", "논란", "시즌2 기대" 등 화제성 키워드 필수\n` +
      `2. 단순 순위 나열형(TOP N) 제목은 지양하고 화제성에 집중`,
  },
};

// ─────────────────────────────────────────────────────────────
// D1에서 플랫폼별 랭킹 데이터 조회
// categorySlot: 특정 카테고리 슬롯(예: 'category02')을 주면 그 카테고리 하나만 조회.
//               null(기본값)이면 기존처럼 해당 플랫폼의 노출 중인 카테고리 전부 조회.
// ─────────────────────────────────────────────────────────────
async function fetchRankingFromD1(platform, env, categorySlot = null) {
  // OTT 페이지에 노출 중인 활성 카테고리 목록 조회
  const catQuery = categorySlot
    ? `SELECT category_slot, display_name, platform_limit, source_name
       FROM ott_categories
       WHERE platform = ?
         AND is_active = 1
         AND platform_section IS NOT NULL
         AND category_slot = ?
       ORDER BY platform_order ASC`
    : `SELECT category_slot, display_name, platform_limit, source_name
       FROM ott_categories
       WHERE platform = ?
         AND is_active = 1
         AND platform_section IS NOT NULL
       ORDER BY platform_order ASC`;

  const cats = categorySlot
    ? await env.DB.prepare(catQuery).bind(platform, categorySlot).all()
    : await env.DB.prepare(catQuery).bind(platform).all();

  if (!cats.results || cats.results.length === 0) return [];

  const result = [];

  for (const cat of cats.results) {
    const limit = cat.platform_limit || 10;

    // 수동고정(manual) + 최신 크롤링 데이터 병합 조회
    // works 테이블과 JOIN해서 평점/장르 등 보완
    const items = await env.DB.prepare(
      `SELECT
         r.rank,
         COALESCE(w.title_ko, r.title_ko) AS title_ko,
         COALESCE(w.title_en, r.title_en) AS title_en,
         r.tmdb_id,
         w.poster_path,
         w.genre,
         w.tmdb_rating,
         w.release_year
       FROM rankings r
       LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
       WHERE r.platform = ?
         AND r.category_slot = ?
         AND (
           r.date = 'manual'
           OR r.date = (
             SELECT MAX(date)
             FROM rankings
             WHERE platform = ?
               AND category_slot = ?
               AND date != 'manual'
           )
         )
       ORDER BY
         CASE WHEN r.date = 'manual' THEN 0 ELSE 1 END,
         r.rank ASC
       LIMIT ?`
    ).bind(platform, cat.category_slot, platform, cat.category_slot, limit).all();

    if (items.results && items.results.length > 0) {
      result.push({
        category_slot: cat.category_slot,
        display_name:  cat.display_name,
        source_name:   cat.source_name || '',
        items:         items.results,
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 랭킹 데이터를 AI 프롬프트용 텍스트로 변환
// ─────────────────────────────────────────────────────────────
function formatRankingForPrompt(data, platform) {
  const platformName = PLATFORM_NAMES[platform] || platform;
  let text = `[${platformName} 현재 랭킹 데이터]\n\n`;

  data.forEach((group) => {
    if (!group.items || group.items.length === 0) return;
    text += `## ${group.display_name}\n`;

    group.items.forEach((item, idx) => {
      const title  = item.title_ko || item.title_en || "제목 없음";
      const rating = item.tmdb_rating ? ` (오뜨랑 평점: ${item.tmdb_rating})` : "";
      const year   = item.release_year ? ` [${item.release_year}년]` : "";
      const genre  = item.genre ? ` | 장르: ${item.genre}` : "";
      text += `${idx + 1}위. ${title}${year}${rating}${genre}\n`;
    });

    text += "\n";
  });

  return text;
}

// ─────────────────────────────────────────────────────────────
// 현재 날짜 기준 주차 정보 계산
// ─────────────────────────────────────────────────────────────
function getWeekInfo() {
  const now         = new Date();
  const year        = now.getFullYear();
  const month       = now.getMonth() + 1;
  const weekOfMonth = Math.ceil(now.getDate() / 7);
  return `${year}년 ${month}월 ${weekOfMonth}주차`;
}

// ─────────────────────────────────────────────────────────────
// Anthropic API 호출
// useWebSearch: D1에 없는 최신 정보(다음 달 신작, 최신 이슈 등)가 필요하면
//               모델이 알아서 web_search 툴을 사용하도록 허용 (기본 true)
// ─────────────────────────────────────────────────────────────
async function callAnthropicAPI(prompt, apiKey, { useWebSearch = true, maxTokens = 4096 } = {}) {
  const requestBody = {
    model:      "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages:   [{ role: "user", content: prompt }],
  };

  if (useWebSearch) {
    requestBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API 오류: ${res.status}`);
  }

  const data = await res.json();

  // 웹 검색을 쓰면 응답이 text / server_tool_use / web_search_tool_result 등
  // 여러 블록으로 섞여서 옴 → text 타입 블록만 모아서 이어붙임
  return (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
// 메인 핸들러 — index.js에서 호출
// ─────────────────────────────────────────────────────────────
export async function handleBlog(path, request, env, url, headers) {

  // ── GET /blog-gen/image — TMDB 이미지 프록시 (CORS 우회용) ──
  if (request.method === "GET" && path === "/blog-gen/image") {
    const imagePath = url.searchParams.get("path") || "";
    const size      = url.searchParams.get("size") || "w780";

    if (!imagePath) {
      return new Response(JSON.stringify({ ok: false, error: "path 파라미터 필요" }), {
        status: 400, headers
      });
    }

    try {
      const imageUrl = `https://image.tmdb.org/t/p/${size}${imagePath}`;
      const imgRes   = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`이미지 로드 실패: ${imgRes.status}`);

      const imgBuffer = await imgRes.arrayBuffer();
      const imgType   = imgRes.headers.get("content-type") || "image/jpeg";

      // CORS 헤더 포함해서 이미지 바이너리 그대로 반환
      return new Response(imgBuffer, {
        status: 200,
        headers: {
          "Content-Type":                imgType,
          "Access-Control-Allow-Origin": headers["Access-Control-Allow-Origin"],
          "Cache-Control":               "public, max-age=86400",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500, headers
      });
    }
  }

  // ── GET /blog-gen/preview — 랭킹 데이터 미리보기 (테스트용) ──
  if (request.method === "GET" && path === "/blog-gen/preview") {

    // admin.js와 동일한 boolean 인증 패턴
    if (!_checkAuth(request, env)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const platform     = url.searchParams.get("platform") || "netflix";
    const categorySlot = url.searchParams.get("categorySlot") || null;

    if (!PLATFORM_NAMES[platform]) {
      return new Response(
        JSON.stringify({ ok: false, error: "지원하지 않는 플랫폼입니다." }),
        { status: 400, headers }
      );
    }

    try {
      const rankingData = await fetchRankingFromD1(platform, env, categorySlot);
      return new Response(
        JSON.stringify({ ok: true, data: rankingData }),
        { headers }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: e.message }),
        { status: 500, headers }
      );
    }
  }

  // ── POST /blog-gen/suggest — AI 블로그 주제 추천 ──────────────
  if (request.method === "POST" && path === "/blog-gen/suggest") {

    // 관리자 인증 (기존 /blog-gen 패턴과 동일)
    if (!_checkAuth(request, env)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    // Anthropic API 키 확인
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다." }),
        { status: 500, headers }
      );
    }

    // 요청 바디 파싱
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "잘못된 요청 형식입니다." }),
        { status: 400, headers }
      );
    }

    // platform: 'netflix' | 'tving' | 'wavve' | 'disney' | 'coupang' | 'boxoffice' | 'all'
    // topicType: 'ranking' | 'recommendation' | 'review' | 'issue'
    // categorySlot: 특정 카테고리 슬롯(예: 'category02') 또는 'all'(해당 플랫폼 노출 카테고리 전체 합산)
    //   ⚠️ platform='all'(복수 플랫폼 합산) 모드에서는 categorySlot을 무시하고 항상 전체로 처리
    const {
      platform     = "netflix",
      topicType    = "ranking",
      categorySlot = "all",
    } = body;

    try {
      // ① 랭킹 데이터 조회 — fetchRankingFromD1 재사용
      // 'all' 선택 시 넷플릭스 + 티빙 두 플랫폼 데이터 합산
      let rankingData = [];
      const platformsToFetch = platform === "all" ? ["netflix", "tving"] : [platform];

      // platform='all'일 땐 복수 플랫폼 합산이라 카테고리 단일 선택이 의미 없으므로 무시
      const effectiveCategorySlot = (platform !== "all" && categorySlot && categorySlot !== "all")
        ? categorySlot
        : null;

      for (const p of platformsToFetch) {
        // 유효하지 않은 플랫폼은 스킵
        if (p !== "all" && !PLATFORM_NAMES[p]) continue;
        const data = await fetchRankingFromD1(p, env, effectiveCategorySlot);
        rankingData.push(...data);
      }

      // ② 랭킹 데이터를 프롬프트용 텍스트로 변환
      // formatRankingForPrompt는 단일 플랫폼 기준이므로 'all'은 직접 포맷
      let rankingText = "";
      if (rankingData.length > 0) {
        rankingText = rankingData.map(group =>
          `[${group.display_name}]\n` +
          (group.items || []).slice(0, 5).map((item, i) => {
            const title  = item.title_ko || item.title_en || "제목 없음";
            const genre  = item.genre  ? ` (${item.genre.split(",")[0]})` : "";
            const rating = item.tmdb_rating
              ? ` ★${parseFloat(item.tmdb_rating).toFixed(1)}`
              : "";
            return `  ${i + 1}위. ${title}${genre}${rating}`;
          }).join("\n")
        ).join("\n\n");
      } else {
        // 랭킹 데이터가 없으면 일반 추천으로 대체 (+ 아래에서 web_search로 보강)
        rankingText = "현재 랭킹 데이터 없음. OTT 인기 콘텐츠 일반 트렌드 기반으로 추천해주세요.";
      }

      const platformKo = platform === "all"
        ? "넷플릭스·티빙"
        : (PLATFORM_NAMES[platform] || platform);
      const weekInfo = getWeekInfo();

      // 예시 문구에 쓸 "드라마/영화" 단어를 실제로 가져온 카테고리 표시명에서 결정
      // (별도 추측 로직이 아니라, 관리자가 직접 고른 카테고리의 display_name을 그대로 참고)
      const mediaLabel = (() => {
        if (rankingData.length === 1) {
          const name = rankingData[0].display_name || "";
          if (name.includes("영화")) return "영화";
          if (name.includes("드라마") || name.includes("TV") || name.includes("시리즈")) return "드라마";
        }
        return "드라마·영화";
      })();

      // ③ topicType에 해당하는 패턴 세트만 사용 (다른 유형과 절대 섞이지 않도록)
      const patternSet = TOPIC_PATTERNS[topicType] || TOPIC_PATTERNS.ranking;
      const exampleText = patternSet.examples
        .map((ex) => "- " + ex
          .replace(/{platform}/g, platformKo)
          .replace(/{media}/g, mediaLabel)
          .replace(/{week}/g, weekInfo))
        .join("\n");
      const ruleText = patternSet.rule
        .replace(/{platform}/g, platformKo)
        .replace(/{week}/g, weekInfo);

      // ④ Claude API 프롬프트 구성
      // 네이버 "넷플릭스 순위" "넷플릭스 추천" 실제 상위 노출 제목 패턴을 학습시킴
      const prompt = `당신은 네이버 블로그 SEO 전문가입니다.
아래는 네이버에서 실제로 상위 노출되는 OTT 블로그 제목 패턴 중 "${patternSet.label}" 유형 예시입니다.
이번 추천은 반드시 "${patternSet.label}" 스타일로만 작성하고, 다른 유형과 섞지 마세요.

[${patternSet.label} 패턴 예시]
${exampleText}

현재 랭킹 데이터:
플랫폼: ${platformKo} / 기간: ${weekInfo}

${rankingText}

위 데이터에 없는 주제(예: 다음 달 공개 예정 신작, 이번 분기·반기 결산, 아직 랭킹에 안 잡힌
최신 화제작·이슈 등)를 다뤄야 한다면, web_search를 여러 번 사용해서 언론 보도·화제성·
공개 시기·시즌 갱신 여부 같은 단서들을 충분히 모은 뒤, 그걸 근거로 순위·추천 리스트를
당당하게 만들어내세요. "정확한 공식 수치가 없다"는 식으로 발뺌하거나 애매하게 얼버무리지
말고, 실제 OTT 블로거가 쓰듯 자연스럽게 단정해서 쓰세요. 단, 검색 결과 문장을 그대로
베끼지 말고 직접 새로 표현해야 합니다.

제목 생성 조건:
${ruleText}
4. 15~35자 한국어, 특수기호 최소화
5. 8개 모두 위 "${patternSet.label}" 패턴 스타일을 유지하되 표현은 다양하게 변주
6. contentType: weekly_ranking / recommendation / genre / review 중 선택

다른 설명, 검색 과정 설명, 출처 표기 없이 아래 JSON 배열 형식으로만 응답하세요.
마크다운 코드블록(\`\`\`) 없이 순수 JSON만 반환합니다:
[
  {
    "title": "블로그 제목",
    "topic": "한 줄 주제 설명 (20자 이내)",
    "contentType": "weekly_ranking"
  }
]`;

      // ⑤ Anthropic API 호출 — 제목 추천은 Haiku로 빠르게
      // web_search: D1에 없는 최신 트렌드(다음 달 신작 등)가 필요하면 모델이 알아서 검색
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-haiku-4-5-20251001", // 빠른 응답 우선 (Haiku)
          max_tokens: 1500, // 웹 검색 사용 시를 대비해 기존 1200보다 여유있게
          messages:   [{ role: "user", content: prompt }],
          tools:      [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API 오류: ${res.status}`);
      }

      const aiData = await res.json();

      // 웹 검색을 쓰면 응답이 text / server_tool_use / web_search_tool_result 등
      // 여러 블록으로 섞여서 옴 → text 타입 블록만 모아서 이어붙임
      const rawText = (aiData.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim() || "[]";

      // ⑥ JSON 파싱 — 코드블록 기호 제거
      const cleanText = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/,      "")
        .replace(/\s*```$/,      "")
        .trim();

      let suggestions;
      try {
        suggestions = JSON.parse(cleanText);
      } catch {
        // 웹 검색 사용 시 JSON 앞뒤로 설명 텍스트가 섞여 나올 수 있어
        // 배열([...]) 부분만 다시 추출해서 재시도
        const match = cleanText.match(/\[[\s\S]*\]/);
        if (match) {
          try { suggestions = JSON.parse(match[0]); } catch { /* 아래에서 에러 처리 */ }
        }
      }

      if (!suggestions) {
        throw new Error("AI 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해주세요.");
      }

      if (!Array.isArray(suggestions)) {
        throw new Error("AI 응답이 배열 형식이 아닙니다.");
      }

      // 필수 필드 보정 + 최대 8개 제한
      suggestions = suggestions
        .filter(s => s && typeof s.title === "string" && s.title.trim())
        .map(s => ({
          title:       s.title.trim(),
          topic:       s.topic?.trim()       || "",
          contentType: s.contentType?.trim() || "weekly_ranking",
        }))
        .slice(0, 8);

      // ⑦ 응답 반환
      return new Response(
        JSON.stringify({
          ok: true,
          suggestions,
          rankingData,
          meta: {
            platform:      platformKo,
            weekLabel:     weekInfo,
            topicType,
            categorySlot:  effectiveCategorySlot || "all",
            categoryLabel: (effectiveCategorySlot && rankingData.length === 1)
              ? rankingData[0].display_name
              : "전체",
            generatedAt:   new Date().toISOString(),
          },
        }),
        { headers }
      );

    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: e.message }),
        { status: 500, headers }
      );
    }
  }

  // ── POST /blog-gen — 블로그 포스팅 생성 ──────────────────────
  if (request.method === "POST" && path === "/blog-gen") {

    // admin.js와 동일한 boolean 인증 패턴
    if (!_checkAuth(request, env)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    // Anthropic API 키 확인
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다. Cloudflare Workers → Settings → Variables and Secrets에서 등록해주세요.",
        }),
        { status: 500, headers }
      );
    }

    // 요청 바디 파싱
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "잘못된 요청 형식입니다." }),
        { status: 400, headers }
      );
    }

    // 옵션 파싱 (기본값 설정)
    const {
      platform     = "netflix",
      contentType  = "weekly_ranking",
      categorySlot = "all",
      tone         = "friendly",
      useEmoji     = true,
      useRating    = true,
      useLink      = true,
      useSpoiler   = false,
      useHashtag   = true,
      extraRequest = "",
    } = body;

    // 유효하지 않은 플랫폼 체크
    if (!PLATFORM_NAMES[platform]) {
      return new Response(
        JSON.stringify({ ok: false, error: "지원하지 않는 플랫폼입니다." }),
        { status: 400, headers }
      );
    }

    // categorySlot이 'all'이 아니면 해당 카테고리 하나만 조회
    const effectiveCategorySlot = (categorySlot && categorySlot !== "all") ? categorySlot : null;

    try {
      // ① D1에서 랭킹 데이터 조회 (카테고리 지정 시 해당 카테고리만)
      const rankingData = await fetchRankingFromD1(platform, env, effectiveCategorySlot);

      if (rankingData.length === 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: effectiveCategorySlot
              ? "선택한 카테고리의 랭킹 데이터가 없습니다. 다른 카테고리를 선택하거나 '전체'로 다시 시도해주세요."
              : "랭킹 데이터가 없습니다. 크롤링 완료 후 다시 시도하거나, 페이지 카테고리 설정에서 OTT 페이지 노출 여부를 확인해주세요.",
          }),
          { status: 404, headers }
        );
      }

      // ② AI 프롬프트 구성
      const rankingText  = formatRankingForPrompt(rankingData, platform);
      const weekInfo     = getWeekInfo();
      const platformName = PLATFORM_NAMES[platform];

      // 해시태그 예시 단어(드라마/영화) — 선택한 카테고리의 실제 표시명 기준으로 결정
      // (추측이 아니라 관리자가 고른 카테고리의 display_name을 그대로 참고)
      const hashtagMediaWord = (() => {
        if (rankingData.length === 1 && (rankingData[0].display_name || "").includes("영화")) {
          return "영화";
        }
        return "드라마";
      })();

      const options = [];
      if (!useEmoji)    options.push("이모지를 사용하지 마세요.");
      if (useRating)    options.push(`오뜨랑(${SITE_URL}) 평점 정보를 자연스럽게 언급해주세요.`);
      if (useLink)      options.push(`포스팅 중간이나 마지막에 "${SITE_URL}" 링크를 "오뜨랑에서 더 보기" 형태로 자연스럽게 삽입해주세요.`);
      if (useSpoiler)   options.push("스포일러 주의 문구가 필요한 작품에는 ⚠️ 스포주의 라벨을 달아주세요.");
      if (useHashtag)   options.push(`포스팅 마지막에 네이버 블로그용 해시태그를 15개 이상 추가해주세요. (예: #${platformName}${hashtagMediaWord}추천 #OTT추천 #${platformName}순위 등)`);
      if (extraRequest) options.push(extraRequest);

      const prompt = `당신은 네이버 블로그에 OTT 콘텐츠 글을 매일 쓰는 30대 직장인입니다.
드라마를 진짜 좋아해서 퇴근 후에 보고, 주말에 몰아보고, 느낀 대로 솔직하게 씁니다.
아래 랭킹 데이터를 바탕으로 지금 당장 이 사람이 쓸 것 같은 블로그 글을 작성해주세요.

${rankingText}

이 데이터에 없는 주제(예: 다음 달 공개 예정 신작, 이번 분기·반기 결산, 데이터에 아직
안 잡힌 최신 화제작·이슈 등)를 다뤄야 한다면, web_search를 여러 번 사용해서 언론 보도·
화제성·공개 시기·시즌 갱신 여부 같은 단서들을 충분히 모은 뒤, 그걸 근거로 순위·추천
리스트를 당당하게 만들어내세요. "정확한 공식 수치가 없다"는 식으로 발뺌하거나 애매하게
얼버무리지 말고, 실제 OTT 블로거가 쓰듯 자연스럽게 단정해서 쓰세요. 단, 검색 결과 문장을
그대로 베끼지 말고 네이버 블로거 말투로 직접 다시 써야 합니다.

━━━ 작성 조건 ━━━
주제: ${weekInfo} ${platformName} — ${CONTENT_TYPE_PROMPTS[contentType] || CONTENT_TYPE_PROMPTS.weekly_ranking}
말투: ${TONE_LABELS[tone] || TONE_LABELS.friendly}
길이: 1500자~2500자
구조: [제목] → 도입부 → 본문 → 마무리
${contentType === 'weekly_ranking'
  ? (rankingData.length > 1
      ? '순위 나열: 카테고리별로 섹션을 나눠서 각각 10위→1위 역순으로 작성 (서로 다른 카테고리를 하나의 순위 리스트로 합치지 말 것)'
      : '순위 나열: 10위→1위 역순 (끝까지 읽게 유도)')
  : ''}

━━━ 절대 쓰지 말아야 할 AI 표현 ━━━
금지 단어/표현:
- "~살펴보겠습니다" "~알아보겠습니다" "~소개해드리겠습니다"
- "안녕하세요, [블로그명]입니다"로 시작하는 인사
- "여러분" "독자 여러분" 호칭
- "이상으로 ~를 마치겠습니다" 식의 마무리
- "~라고 할 수 있습니다" "~라고 볼 수 있습니다" 같은 완곡 표현
- "정말", "매우", "굉장히"의 과도한 반복
- 소제목에 ★, ■, ◆ 같은 특수기호 남발
- 마크다운 ##, **, --- 기호

━━━ 실제 네이버 블로그 글 구조 예시 (반드시 이 형식으로) ━━━

네이버 블로그는 아래처럼 짧은 문장을 한 줄씩 줄바꿈해서 씁니다.
문단을 길게 쓰지 않고, 숨 쉬듯 끊어서 씁니다.

[도입부 예시 — 이렇게 시작해야 함]
안녕하세요, 김작입니다

드라마 리뷰어로서
가장 기분이 좋을 때는
볼만한 드라마가 많을 때인데요

요즘 넷플릭스를 켜면
딱 그런 기분이 들더라고요
다채로운 작품들이 많아서 말이죠

다가오는 연휴
각잡고 몰아보기 최고라 생각되는
요즘 핫한 넷플릭스 드라마들!
1위부터 5위까지 알아봅니다

---

[작품 소개 예시 — 이렇게 씀]
1위. 김부장

저도 어제 1화 봤거든요
처음엔 그냥 볼까 했는데
한 화 보고 바로 다음 화 눌렀어요

전개가 빠르고
주인공 캐릭터가 확실해서
몰입이 잘 돼요

---

[마무리 예시]
이번 주 순위는 여기까지예요

다음 주에 또 업데이트되면 바로 올게요
보고 싶은 거 있으면 댓글로 알려주세요!

━━━ 핵심 형식 규칙 ━━━
- 한 문장 = 한 줄. 절대 길게 붙여 쓰지 않음
- 도입부는 반드시 본인 얘기 또는 감정으로 시작 (정보 나열로 시작 금지)
- 작품마다 번호 + 제목 → 줄바꿈 → 짧은 감상 3~5줄
- 마무리는 짧고 친근하게, "다음에 또 올게요" 식으로
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${options.length > 0 ? "[추가 지시사항]\n" + options.map((o, i) => `${i + 1}. ${o}`).join("\n") : ""}

마크다운 기호 없이 일반 텍스트로, 단락 구분은 빈 줄로만 해주세요.`;

      // ③ Anthropic API 호출
      const generatedText = await callAnthropicAPI(prompt, apiKey);

      if (!generatedText) {
        throw new Error("AI 응답이 비어있습니다. 다시 시도해주세요.");
      }

      // ④ 결과 반환
      return new Response(
        JSON.stringify({
          ok: true,
          post: generatedText,
          rankingData,
          meta: {
            platform,
            platformName,
            weekInfo,
            categorySlot:  effectiveCategorySlot || "all",
            categoryLabel: (effectiveCategorySlot && rankingData.length === 1)
              ? rankingData[0].display_name
              : "전체",
            generatedAt: new Date().toISOString(),
          },
        }),
        { headers }
      );

    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: e.message }),
        { status: 500, headers }
      );
    }
  }

  // 해당 라우트 없음 → index.js에서 다음 라우터로 넘어가도록 null 반환
  return null;
}
