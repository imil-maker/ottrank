/* 2026-07-25 rev.2 — functions/title/[slug].js (D1 overview가 비어있으면 TMDB 실시간 조회 + D1 자동 백필 추가) */
/* ══════════════════════════════════════════════════════════════
   Cloudflare Pages Function — /title/:slug 요청을 가로채서,
   정적 _title_detail.html을 그대로 가져온 다음 <title>/메타태그/줄거리 부분만
   D1에서 미리 조회한 실제 값으로 채워서 내려준다.

   목적: 자바스크립트를 실행하지 않는 봇(네이버봇, 카카오톡 링크 미리보기 등)이
   빈 껍데기("줄거리 정보 불러오는 중…")만 보고 가는 문제 해결.
   나머지(리뷰/출연진/순위 등 복잡한 부분)는 전혀 안 건드리고 그대로 클라이언트
   자바스크립트가 이어받아서 처리함 — "제목+줄거리+메타태그"만 다루는 부분 SSR.

   [2026-07-25 발견] D1 works.overview가 전체 4923개 중 3233개(65%+)나 비어있는 걸 확인함
   (works 페이지 자체는 TMDB에 실시간으로 물어봐서 채우고 있어서 사람 눈엔 안 보이던 문제).
   그래서 D1 조회 결과 overview가 비어있으면 TMDB API로 한 번 직접 물어보고,
   받아온 값을 이번 응답에도 쓰고 D1에도 같이 저장(백필)해서 다음부터는 안 비게 만듦.

   필요 사전설정:
   ① 이 Pages 프로젝트에 D1(ottrank-db)이 변수명 DB로 바인딩되어 있어야 함
      (Workers & Pages → 해당 Pages 프로젝트 → Settings → Functions → D1 database bindings)
   ② 같은 곳에 환경변수 TMDB_API_KEY도 추가되어 있어야 함(D1 백필용 TMDB 직접 호출)

   실패 시 동작: 어떤 이유로든 실패하면(D1/TMDB 조회 실패, 파싱 실패 등) 원본 정적 HTML을
   그대로 반환한다 — 이 기능 때문에 페이지 자체가 깨지는 일은 절대 없어야 하므로.
══════════════════════════════════════════════════════════════ */

// URL 슬러그에서 tmdb_id와 year(동명이인 tmdb_id 충돌 시 연도로 구분용)만 뽑아냄.
// _title_detail.html의 parseSlug()와 같은 규칙이지만, SEO 프리필엔 season이 필요 없어서
// tmdb_id/year 두 개만 반환하는 축약판.
function parseSlugForSeo(slug) {
  const clean = slug.replace(/\.html$/, "");
  const m = clean.match(/-(\d+)$/);
  if (!m) return null;
  const numStr = m[1];
  const titleSlug = clean.slice(0, m.index);

  if (numStr.length < 6) return null;

  if (/^\d+$/.test(titleSlug)) {
    // 작품명 없는 URL: ex) '2-2023126485' → titleSlug='2'(시즌, 무시), numStr=연도4자리+tmdb_id
    const year = parseInt(numStr.slice(0, 4), 10);
    const tid = numStr.slice(4);
    if (tid.length >= 1 && year >= 1900 && year <= 2100) {
      return { tmdb_id: parseInt(tid, 10), year };
    }
    return null;
  }

  // 작품명 포함 URL: ex) 'moving-2-2023126485'
  for (let sLen = 1; sLen <= 2; sLen++) {
    const year = parseInt(numStr.slice(sLen, sLen + 4), 10);
    const tid = numStr.slice(sLen + 4);
    if (tid.length >= 1 && year >= 1900 && year <= 2100) {
      return { tmdb_id: parseInt(tid, 10), year };
    }
  }
  return null;
}

// HTML 텍스트 콘텐츠(태그 사이)용 이스케이프
function escText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// HTML 속성값(따옴표 안)용 이스케이프
function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// id="seoXxx" 메타/링크 태그의 content(또는 href) 속성값만 교체
function replaceAttrById(html, id, attrName, value) {
  const re = new RegExp(`(id="${id}"[^>]*?\\s${attrName}=")[^"]*(")`);
  return html.replace(re, (_, pre, post) => `${pre}${escAttr(value)}${post}`);
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const slug = params.slug || "";

  // 원본 정적 파일 그대로 가져오기 (실패하면 이 함수도 그냥 원래 흐름대로 404 등 처리)
  const assetRes = await env.ASSETS.fetch(new URL("/_title_detail.html", request.url));
  let html = await assetRes.text();

  try {
    const parsed = parseSlugForSeo(slug);
    if (parsed && env.DB) {
      const row = await env.DB.prepare(`
        SELECT title_ko, title_en, overview, poster_path, media_type
        FROM works
        WHERE tmdb_id = ?
        ORDER BY (release_year = ?) DESC
        LIMIT 1
      `).bind(parsed.tmdb_id, parsed.year).first();

      if (row) {
        const title = row.title_ko || row.title_en || "";
        let overview = (row.overview || "").trim();

        // [2026-07-25 추가] D1엔 줄거리가 비어있는 작품이 65%가 넘어서, 비어있으면
        // TMDB에 직접 한 번 물어보고, 받은 값을 이번 응답에 쓰는 동시에 D1에도 백필해둠
        // (다음 방문부터는 이 조회 자체가 필요 없어짐 — 스스로 채워지는 구조).
        if (!overview && row.media_type && env.TMDB_API_KEY) {
          try {
            const tmdbRes = await fetch(
              `https://api.themoviedb.org/3/${row.media_type}/${parsed.tmdb_id}?api_key=${env.TMDB_API_KEY}&language=ko-KR`
            );
            if (tmdbRes.ok) {
              const tmdbData = await tmdbRes.json();
              const tmdbOverview = (tmdbData.overview || "").trim();
              if (tmdbOverview) {
                overview = tmdbOverview;
                context.waitUntil(
                  env.DB.prepare(
                    "UPDATE works SET overview = ? WHERE tmdb_id = ? AND media_type = ?"
                  ).bind(tmdbOverview, parsed.tmdb_id, row.media_type).run()
                );
              }
            }
          } catch (e) {
            // TMDB 조회 실패해도 아래 로직은 그대로 진행(빈 줄거리로라도 나머지 메타태그는 채움)
          }
        }

        const poster = row.poster_path ? `https://poster.ottrank.kr/tmdb-img/w500${row.poster_path}` : "";
        const pageUrl = `https://ottrank.kr/title/${slug}`;

        if (title) {
          const pageTitle = `${title} 평점, 줄거리, 순위 정보 | 오뜨랑`;
          const desc = overview ? overview.slice(0, 150) : `${title}의 평점, 줄거리, 순위, 후기를 오뜨랑에서 확인하세요.`;

          html = html.replace(
            /(<title id="seoTitle">)[^<]*(<\/title>)/,
            (_, pre, post) => `${pre}${escText(pageTitle)}${post}`
          );
          html = replaceAttrById(html, "seoDesc", "content", desc);
          html = replaceAttrById(html, "seoCanonical", "href", pageUrl);
          html = replaceAttrById(html, "seoOgTitle", "content", pageTitle);
          html = replaceAttrById(html, "seoOgDesc", "content", desc);
          html = replaceAttrById(html, "seoOgUrl", "content", pageUrl);
          html = replaceAttrById(html, "seoTwTitle", "content", pageTitle);
          html = replaceAttrById(html, "seoTwDesc", "content", desc);
          if (poster) {
            html = replaceAttrById(html, "seoOgImg", "content", poster);
            html = replaceAttrById(html, "seoTwImg", "content", poster);
          }

          // 화면의 "줄거리 정보 불러오는 중…" 부분도 실제 텍스트로 미리 채움
          // (자바스크립트가 어차피 로드 후 다시 덮어쓰므로 사람 눈엔 순간적으로도 안 보임)
          html = html.replace(
            /(<p class="hero-overview" id="overview">)[^<]*(<\/p>)/,
            (_, pre, post) => `${pre}${escText(overview || "줄거리 정보가 없습니다.")}${post}`
          );
        }
      }
    }
  } catch (e) {
    // 어떤 이유로든 실패하면 원본 그대로 반환 — 이 기능 때문에 페이지가 깨지면 안 됨
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=300", // 5분 캐시 — 매 요청마다 D1 조회하지 않도록
    },
  });
}
