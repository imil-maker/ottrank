/* ══════════════════════════════════════════════════════════════
   blog.js — 블로그 포스팅 자동 생성 API
   라우트:
     POST /blog-gen         : D1 랭킹 조회 + Anthropic API → 포스팅 생성 (관리자 전용)
     GET  /blog-gen/preview : 랭킹 데이터 미리보기 (관리자 전용, 테스트용)

   필요 환경 변수:
     env.DB                : Cloudflare D1 바인딩
     env.ANTHROPIC_API_KEY : Anthropic API 키 (Secret)
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
  friendly: "친근하고 따뜻한 일상 블로그 말투 (예: '이 드라마 진짜 강추예요!', '주말에 뭐 볼지 고민이라면 바로 이거!')",
  expert:   "전문 영화/드라마 평론가 스타일의 분석적이고 격식 있는 말투 (예: '수작이라 불릴 만한 완성도', '연출의 치밀함이 돋보인다')",
  humor:    "재미있고 유머러스한 말투, 드라마틱한 반응 포함 (예: '이거 보고 출근 못할 뻔ㅋㅋ', '결말에서 제 심장이 나갔습니다')",
  news:     "객관적이고 정보 중심의 뉴스/매체 스타일 (예: '~위를 기록했다', '~으로 집계됐다')",
  sns:      "MZ세대 SNS 감성, 짧고 임팩트 있는 문체 (예: '요즘 뭐봄?', '이거 안 보면 손해 ㄹㅇ')",
  magazine: "라이프스타일 매거진 감성, 세련되고 감성적인 문체 (예: '이번 주말, 당신의 취향을 위한 한 편')",
};

// ─── 콘텐츠 유형별 AI 프롬프트 지시문 ─────────────────────
const CONTENT_TYPE_PROMPTS = {
  weekly_ranking:  "주간 TOP10 랭킹 포스팅을 작성해주세요. 순위와 함께 각 작품을 소개하고, 이번 주 특히 주목할 작품을 강조해주세요.",
  recommendation: "지금 당장 봐야 할 추천 작품 모음 포스팅을 작성해주세요. 각 작품의 매력 포인트와 추천 이유를 구체적으로 강조해주세요.",
  genre:          "장르별로 작품을 분류하고, 어떤 취향의 사람에게 어울리는지 설명을 포함한 추천 포스팅을 작성해주세요.",
  review:         "상위 3~5개 작품에 집중해서 줄거리, 볼거리, 추천 포인트를 담은 미니 리뷰 형태의 포스팅을 작성해주세요.",
};

// ─────────────────────────────────────────────────────────────
// D1에서 플랫폼별 랭킹 데이터 조회
// ─────────────────────────────────────────────────────────────
async function fetchRankingFromD1(platform, env) {
  // OTT 페이지에 노출 중인 활성 카테고리 목록 조회
  const cats = await env.DB.prepare(
    `SELECT category_slot, display_name, platform_limit, source_name
     FROM ott_categories
     WHERE platform = ?
       AND is_active = 1
       AND platform_section IS NOT NULL
     ORDER BY platform_order ASC`
  ).bind(platform).all();

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
// ─────────────────────────────────────────────────────────────
async function callAnthropicAPI(prompt, apiKey) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API 오류: ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
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

    const platform = url.searchParams.get("platform") || "netflix";

    if (!PLATFORM_NAMES[platform]) {
      return new Response(
        JSON.stringify({ ok: false, error: "지원하지 않는 플랫폼입니다." }),
        { status: 400, headers }
      );
    }

    try {
      const rankingData = await fetchRankingFromD1(platform, env);
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
    const { platform = "netflix", topicType = "ranking" } = body;

    try {
      // ① 랭킹 데이터 조회 — fetchRankingFromD1 재사용
      // 'all' 선택 시 넷플릭스 + 티빙 두 플랫폼 데이터 합산
      let rankingData = [];
      const platformsToFetch = platform === "all" ? ["netflix", "tving"] : [platform];

      for (const p of platformsToFetch) {
        // 유효하지 않은 플랫폼은 스킵
        if (p !== "all" && !PLATFORM_NAMES[p]) continue;
        const data = await fetchRankingFromD1(p, env);
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
        // 랭킹 데이터가 없으면 일반 추천으로 대체
        rankingText = "현재 랭킹 데이터 없음. OTT 인기 콘텐츠 일반 트렌드 기반으로 추천해주세요.";
      }

      // ③ 주제 유형별 추천 방향 설명
      const TOPIC_TYPE_DESC = {
        ranking:       "현재 순위 기반 정보성 제목 (TOP10, 이번 주 1위 등 랭킹 키워드 포함)",
        recommendation:"장르/취향 추천형 제목 (요즘 핫한, 꼭 봐야 할, 강추 등 큐레이션 키워드)",
        review:        "신작·화제작 리뷰 유도 제목 (후기, 솔직 리뷰, 결말 해석 등 감상 키워드)",
        issue:         "지금 화제·이슈 중심 제목 (논란, 결말 예측, 시즌2 기대 등 화제성 키워드)",
      };

      const platformKo = platform === "all"
        ? "넷플릭스·티빙"
        : (PLATFORM_NAMES[platform] || platform);
      const weekInfo   = getWeekInfo();
      const topicDesc  = TOPIC_TYPE_DESC[topicType] || TOPIC_TYPE_DESC.ranking;

      // ④ Claude API 프롬프트 구성
      // 네이버 "넷플릭스 순위" "넷플릭스 추천" 실제 상위 노출 제목 패턴을 학습시킴
      const prompt = `당신은 네이버 블로그 SEO 전문가입니다.
아래는 네이버에서 실제로 상위 노출되는 OTT 블로그 제목 패턴 예시입니다.
이 패턴을 철저히 참고하여, 현재 랭킹 데이터 기반으로 제목 8개를 추천해주세요.

[순위형]
- 넷플릭스 드라마 순위 TOP 10 (6월 4주차 업데이트)
- 요즘 넷플릭스 순위 드라마 TOP 10 골라봄
- 2026년 6월 4주차 넷플릭스 순위 드라마·영화 정리
- 넷플릭스 오늘 순위 TOP 10 드라마 영화 (6월 최신)
- 티빙 순위 TOP 10 이번 주 드라마·영화 정리

[추천형]
- 지금 당장 봐야 할 넷플릭스 추천 드라마 BEST 5
- 넷플릭스 볼만한거 없을 때 추천 드라마 TOP 7
- 요즘 핫한 넷플릭스 드라마 추천 2026 최신판
- 넷플릭스 드라마 추천 장르별 모음 (로맨스·스릴러·범죄)
- 티빙 드라마 추천 지금 봐야 할 인기작 모음

[리뷰형]
- 넷플릭스 1위 [작품명] 솔직 후기 재밌어? 결말까지
- [작품명] 넷플릭스 드라마 완주 후기 (스포없음)
- 넷플릭스 [작품명] 정주행 완료 별점 몇 점?

[화제형]
- 넷플릭스 드라마 화제작 이번 주 놓치면 후회 TOP 5
- 2026 상반기 넷플릭스 드라마 흥행 순위 정리

현재 랭킹 데이터:
플랫폼: ${platformKo} / 기간: ${weekInfo}
주제 유형 힌트: ${topicDesc}

${rankingText}

제목 생성 조건:
1. 위 패턴처럼 "넷플릭스/티빙 + 순위/추천/드라마/영화 + TOP N or 날짜" 조합 필수
2. 실제 랭킹 1~3위 작품명을 제목에 직접 활용 (검색량 극대화)
3. 날짜/주차 표기로 최신성 강조 (예: 6월 4주차, 2026 최신)
4. 15~35자 한국어, 특수기호 최소화
5. 8개 모두 위 순위형·추천형·리뷰형·화제형 골고루 섞어서 작성
6. contentType: weekly_ranking / recommendation / genre / review 중 선택

반드시 아래 JSON 배열 형식으로만 응답하세요.
마크다운 코드블록(\`\`\`) 없이 순수 JSON만 반환합니다:
[
  {
    "title": "블로그 제목",
    "topic": "한 줄 주제 설명 (20자 이내)",
    "contentType": "weekly_ranking"
  }
]`;

      // ⑤ Anthropic API 호출 — 제목 추천은 Haiku로 빠르게
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-haiku-4-5-20251001", // 빠른 응답 우선 (Haiku)
          max_tokens: 1200,
          messages:   [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API 오류: ${res.status}`);
      }

      const aiData  = await res.json();
      const rawText = aiData.content?.[0]?.text?.trim() || "[]";

      // ⑥ JSON 파싱 — 혹시 코드블록이 포함됐을 경우 제거
      const cleanText = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/,      "")
        .replace(/\s*```$/,      "")
        .trim();

      let suggestions;
      try {
        suggestions = JSON.parse(cleanText);
      } catch {
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
            platform:     platformKo,
            weekLabel:    weekInfo,
            topicType,
            generatedAt:  new Date().toISOString(),
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

    try {
      // ① D1에서 랭킹 데이터 조회
      const rankingData = await fetchRankingFromD1(platform, env);

      if (rankingData.length === 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "랭킹 데이터가 없습니다. 크롤링 완료 후 다시 시도하거나, 페이지 카테고리 설정에서 OTT 페이지 노출 여부를 확인해주세요.",
          }),
          { status: 404, headers }
        );
      }

      // ② AI 프롬프트 구성
      const rankingText  = formatRankingForPrompt(rankingData, platform);
      const weekInfo     = getWeekInfo();
      const platformName = PLATFORM_NAMES[platform];

      const options = [];
      if (!useEmoji)    options.push("이모지를 사용하지 마세요.");
      if (useRating)    options.push(`오뜨랑(${SITE_URL}) 평점 정보를 자연스럽게 언급해주세요.`);
      if (useLink)      options.push(`포스팅 중간이나 마지막에 "${SITE_URL}" 링크를 "오뜨랑에서 더 보기" 형태로 자연스럽게 삽입해주세요.`);
      if (useSpoiler)   options.push("스포일러 주의 문구가 필요한 작품에는 ⚠️ 스포주의 라벨을 달아주세요.");
      if (useHashtag)   options.push(`포스팅 마지막에 네이버 블로그용 해시태그를 15개 이상 추가해주세요. (예: #${platformName}드라마추천 #OTT추천 #넷플릭스순위 등)`);
      if (extraRequest) options.push(extraRequest);

      const prompt = `당신은 인기 OTT 드라마/영화 블로거입니다. 아래 실시간 랭킹 데이터를 바탕으로 네이버 블로그용 포스팅을 작성해주세요.

${rankingText}

[포스팅 요청사항]
- 주제: ${weekInfo} ${platformName} — ${CONTENT_TYPE_PROMPTS[contentType] || CONTENT_TYPE_PROMPTS.weekly_ranking}
- 말투/톤: ${TONE_LABELS[tone] || TONE_LABELS.friendly}
- 길이: 1500자 ~ 2500자 사이 (너무 짧으면 SEO에 불리합니다)
- 구조: 제목 → 도입부 → 순위/추천 본문 → 마무리 순서로 작성해주세요.
- 제목은 SEO를 고려해 클릭하고 싶어지는 매력적인 제목으로 작성하고, 제목 앞에 [제목] 태그를 붙여주세요.

${contentType === 'weekly_ranking' ? '- 순위를 나열할 때는 10위부터 1위 순서(역순)로 작성해주세요. 독자가 끝까지 읽도록 유도하는 방식입니다.' : ''}

${options.length > 0 ? "[추가 지시사항]\n" + options.map((o, i) => `${i + 1}. ${o}`).join("\n") : ""}

반드시 한국어로만 작성하고, 마크다운 기호(##, **, --- 등)가 아닌 일반 텍스트로 작성해주세요. 가독성을 위해 단락을 적절히 나눠주세요.`;

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
