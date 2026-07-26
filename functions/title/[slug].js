/* 2026-07-27 rev.1 — functions/title/[slug].js (줄거리 더보기/접기 구조 변경으로 <p id="overview"> 안에 span/button이 추가되면서 기존 정규식이 매칭 실패하던 문제 수정 — span#overviewText만 정확히 타겟) */
/* ══════════════════════════════════════════════════════════════
   Cloudflare Pages Function — /title/:slug 요청을 가로채서,
   정적 _title_detail.html을 그대로 가져온 다음 <title>/메타태그/줄거리 부분만
   D1에서 미리 조회한 실제 값으로 채워서 내려준다.

   목적: 자바스크립트를 실행하지 않는 봇(네이버봇, 카카오톡 링크 미리보기 등)이
   빈 껍데기("줄거리 정보 불러오는 중…")만 보고 가는 문제 해결.
   나머지(리뷰/출연진/순위 등 복잡한 부분)는 전혀 안 건드리고 그대로 클라이언트
   자바스크립트가 이어받아서 처리함 — "제목+줄거리+메타태그"만 다루는 부분 SSR.

   [2026-07-25] 처음엔 D1 overview가 비어있으면 이 함수 안에서 TMDB를 실시간으로 조회해서
   채우는 로직도 넣었었는데, 봇 응답 속도/실패 지점이 늘어나기만 해서 제거함.
   D1 overview가 비어있는 작품(전체 4923개 중 3233개, 65%+)을 채우는 일은 이 함수와
   완전히 분리해서 admin.js의 /admin/works/backfill-overview(어드민 일괄 백필)가 전담함
   — 이 함수는 "이미 D1에 있는 걸 빠르게 읽어서 보여주기"만 함.

   필요 사전설정: 이 Pages 프로젝트에 D1(ottrank-db)이 변수명 DB로 바인딩되어 있어야 함
   (Workers & Pages → 해당 Pages 프로젝트 → Settings → Functions → D1 database bindings).

   실패 시 동작: 어떤 이유로든 실패하면(D1 조회 실패, 파싱 실패 등) 원본 정적 HTML을
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

// <script> 태그 안에 JSON을 안전하게 심기 위한 이스케이프 — 제목/줄거리 등에 "</script>"와
// 비슷한 문자열이 우연히 섞여도 스크립트 태그가 조기 종료되지 않도록 '<' 전부를 유니코드로 치환
function safeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
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
        SELECT title_ko, title_en, overview, poster_path, media_type, tmdb_rating,
               genre, release_date, imdb_rating
        FROM works
        WHERE tmdb_id = ?
        ORDER BY (release_year = ?) DESC
        LIMIT 1
      `).bind(parsed.tmdb_id, parsed.year).first();

      if (row) {
        const title = row.title_ko || row.title_en || "";
        // '__NONE__'은 admin.js의 backfill-overview가 "TMDB에도 줄거리가 없었다"는 걸
        // 표시해두는 센티널 값(재시도 방지용) — 화면엔 그냥 빈 것과 동일하게 처리.
        const rawOverview = (row.overview || "").trim();
        const overview = rawOverview === "__NONE__" ? "" : rawOverview;

        const poster = row.poster_path ? `https://poster.ottrank.kr/tmdb-img/w500${row.poster_path}` : "";
        const pageUrl = `https://ottrank.kr/title/${slug}`;

        if (title) {
          const pageTitle = `${title} 다시보기, 평점, 순위 정보 | 오뜨랑`;
          const desc = overview ? overview.slice(0, 150) : `${title} 다시보기, 평점, 순위, 후기 정보를 오뜨랑에서 확인하세요.`;

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
          // [2026-07-27 수정] 더보기/접기 기능 추가로 <p id="overview"> 안에 <span id="overviewText">와
          // <button>(접기)이 함께 들어있는 구조로 바뀌어서, p 태그 전체를 대상으로 하던 기존 정규식은
          // 더 이상 매칭되지 않음(태그 안에 태그가 있으면 [^<]*가 실패). span만 정확히 타겟팅하도록 수정.
          html = html.replace(
            /(<span id="overviewText">)[^<]*(<\/span>)/,
            (_, pre, post) => `${pre}${escText(overview || "줄거리 정보가 없습니다.")}${post}`
          );

          // [2026-07-25 신규] TMDB 평점 프리필. tmdb_rating은 0점(투표수 부족)도 유효한
          // 값이라 null/undefined일 때만 건너뜀.
          if (row.tmdb_rating !== null && row.tmdb_rating !== undefined) {
            const scoreText = Number(row.tmdb_rating).toFixed(1);
            html = html.replace(
              /(<div class="r-score" id="tmdbScore" style="color:#01b4e4">)[^<]*(<\/div>)/,
              (_, pre, post) => `${pre}${escText(scoreText)}${post}`
            );
          }

          // [2026-07-26 신규] IMDb 평점 프리필 — works.imdb_rating은 어드민 배치(batch-imdb-search)가
          // OMDB에서 미리 받아와 저장해둔 값이라 D1만 읽으면 됨(TMDB 평점과 동일한 방식).
          if (row.imdb_rating !== null && row.imdb_rating !== undefined && row.imdb_rating !== "") {
            const imdbNum = parseFloat(row.imdb_rating);
            if (!isNaN(imdbNum)) {
              html = html.replace(
                /(<div class="r-score" id="imdbScore" style="color:#F5C518">)[^<]*(<\/div>)/,
                (_, pre, post) => `${pre}${escText(imdbNum.toFixed(1))}${post}`
              );
            }
          }

          // [2026-07-26 신규] metaRow 프리필 — 공개일/개봉일 + 바로보기(OTT) 두 가지를 함께 채움.
          // 시즌·부작수·방영상태는 TMDB 실시간 조회로만 나오고 D1엔 없어서 이번엔 손대지 않음.
          // 자바스크립트 로드 전에도 최소한의 정보는 봇에게 보이게 하는 게 목적이고,
          // 로드되면 화면은 원래대로 더 완전한 값으로 덮어써짐(방문자 눈엔 차이 없음).
          const metaItems = [];

          if (row.release_date) {
            const relDate = new Date(row.release_date);
            if (!isNaN(relDate.getTime())) {
              const days = ["일", "월", "화", "수", "목", "금", "토"];
              const dateLabel = row.media_type === "tv" ? "공개일" : "개봉";
              metaItems.push(
                `${dateLabel} ${escText(row.release_date.replace(/-/g, "."))} (${days[relDate.getDay()]})`
              );
            }
          }

          // 바로보기(OTT) — work_ott는 어드민 배치(collect-ott)가 15일 주기로 미리 채워둔
          // 정규화 테이블이라 D1만 읽으면 됨. "다시보기 OTT" 검색어가 실제로 검색량이 가장
          // 높은 축이라 SEO상 중요도가 커서, 화면(복잡한 탭 UI)은 안 건드리고 텍스트로만 노출.
          try {
            const { results: ottRows } = await env.DB.prepare(
              "SELECT ott_key FROM work_ott WHERE tmdb_id = ?"
            ).bind(parsed.tmdb_id).all();
            if (ottRows && ottRows.length) {
              const OTT_NAMES = {
                netflix: "넷플릭스", tving: "티빙", wavve: "웨이브",
                disney: "디즈니+", coupang: "쿠팡플레이", watcha: "왓챠",
              };
              const ottNames = ottRows.map(r => OTT_NAMES[r.ott_key] || r.ott_key).filter(Boolean);
              if (ottNames.length) {
                metaItems.push(`다시보기 ${escText(ottNames.join(", "))}`);
              }
            }
          } catch (e) {
            // OTT 조회 실패해도 나머지 프리필엔 영향 없게 조용히 무시
          }

          if (metaItems.length) {
            const metaHtml = metaItems
              .map(t => `<span class="hero-meta-item">${t}</span>`)
              .join('<span class="hero-meta-sep">·</span>');
            html = html.replace(
              '<div class="hero-meta" id="metaRow"></div>',
              `<div class="hero-meta" id="metaRow">${metaHtml}</div>`
            );
          }

          // [2026-07-26 신규] 구조화 데이터(JSON-LD) 프리필 — 기존엔 <script id="ldJson">{}</script>로
          // 완전히 비어있는 채로 나가서, 자바스크립트를 실행하지 않는 봇에겐 구조화 데이터가 아예
          // 없는 것과 같았음. D1에 있는 값만으로 우선 채워서 최소한의 구조화 데이터가 항상 나가게 함
          // (자바스크립트가 로드되면 평점 개수 등을 포함한 더 완전한 값으로 덮어씀 — 화면 동작 그대로).
          // TMDB aggregateRating은 투표수(vote_count)가 D1에 없어서 넣지 않음 — ratingCount 없이
          // 넣으면 구조화 데이터 오류로 잡힐 수 있어, 값이 확실한 IMDb 평점(review 형태, 개수 불필요)만 포함.
          try {
            const ldType = row.media_type === "movie" ? "Movie" : "TVSeries";
            const ld = {
              "@context": "https://schema.org",
              "@type": ldType,
              "name": title,
              "description": desc,
              "url": pageUrl,
            };
            if (poster) ld.image = poster;
            if (row.genre) {
              const genreNames = row.genre.split(",").map(s => s.trim()).filter(Boolean);
              if (genreNames.length) ld.genre = genreNames;
            }
            if (row.release_date) ld.datePublished = row.release_date;
            if (row.imdb_rating) {
              const imdbNum = parseFloat(row.imdb_rating);
              if (!isNaN(imdbNum)) {
                ld.review = [{
                  "@type": "Review",
                  "author": { "@type": "Organization", "name": "IMDb" },
                  "reviewRating": { "@type": "Rating", "ratingValue": imdbNum, "bestRating": 10, "worstRating": 0 },
                }];
              }
            }
            html = html.replace(
              '<script id="ldJson" type="application/ld+json">{}</script>',
              `<script id="ldJson" type="application/ld+json">${safeJsonForScript(ld)}</script>`
            );
          } catch (e) {
            // 구조화 데이터 프리필 실패해도 나머지(제목/줄거리/평점)엔 영향 없게 조용히 무시
          }

          // [2026-07-25 신규] 인물관계도 이미지 프리필 — 공식 이미지가 등록돼있으면
          // (relationship_charts, status='approved') src/alt를 채우고 섹션을 노출.
          // 스포일러 방지용 접힘(relChartBody display:none)은 그대로 유지 — 펼치는 동작만
          // 막을 뿐, 이미지 자체는 페이지 소스에 존재해야 봇이 인식 가능.
          if (row.media_type) {
            try {
              const chart = await env.DB.prepare(`
                SELECT image_url FROM relationship_charts
                WHERE work_tmdb_id = ? AND work_media_type = ? AND status = 'approved'
                  AND image_url IS NOT NULL AND image_url != ''
                LIMIT 1
              `).bind(parsed.tmdb_id, row.media_type).first();

              if (chart && chart.image_url) {
                const chartAlt = `${title} 인물관계도`;
                html = html.replace(
                  /(<img id="relChartImg" src=")[^"]*("[^>]*alt=")[^"]*(")/,
                  (_, pre, mid, post) => `${pre}${escAttr(chart.image_url)}${mid}${escAttr(chartAlt)}${post}`
                );
                html = html.replace(
                  /(<div class="relchart-section" id="relChartSection" style=")display:none(")/,
                  (_, pre, post) => `${pre}${post}`
                );
                // [2026-07-26 신규] 버튼 텍스트("인물관계도 보기")는 relChartBody(이미지 박스)와
                // 달리 display:none으로 안 숨겨져 있어 원래도 크롤링 가능한 상태였지만, 제목이
                // 안 붙은 채로만 나가고 있었음. 이미지는 스포일러 방지 목적상 숨겨둔 채 그대로 두고,
                // 이 텍스트만 최소한으로 "{작품명} 인물관계도 보기"가 되도록 채워서 검색 단서를 남김.
                html = html.replace(
                  /(<span id="relChartToggleTitle">)[^<]*(<\/span>)/,
                  (_, pre, post) => `${pre}${escText(`${title} 인물관계도 보기`)}${post}`
                );
              }
            } catch (e) {
              // 관계도 조회 실패해도 나머지 프리필(제목/줄거리/평점)엔 영향 없게 조용히 무시
            }
          }

          // [2026-07-26 신규] 출연진/감독 프리필 — work_cast에 저장된 값이 있으면 봇이 자바스크립트를
          // 실행하지 않아도 인물페이지(/person/{id}) 링크를 미리 볼 수 있음. 화면(방문자)은 잠시 뒤
          // 자바스크립트가 TMDB 실시간 데이터로 그대로 덮어쓰므로 사람 눈엔 차이가 없음 — 이 프리필은
          // 오직 "JS를 실행하지 않는 봇"을 위한 것. 페이지 크기/속도를 위해 배우는 상위 30명까지만
          // 심음(화면은 여전히 전체 다 보여줌, _title_detail.html은 안 건드림).
          if (row.media_type) {
            try {
              const { results: castRows } = await env.DB.prepare(`
                SELECT person_tmdb_id, name, role, character_name, profile_path
                FROM work_cast
                WHERE tmdb_id = ? AND media_type = ?
                ORDER BY billing_order ASC
              `).bind(parsed.tmdb_id, row.media_type).all();

              const directors = (castRows || []).filter(p => p.role === "director").slice(0, 3);
              const castList  = (castRows || []).filter(p => p.role === "cast").slice(0, 30);

              if (directors.length || castList.length) {
                const IMG_PROFILE = "https://poster.ottrank.kr/tmdb-img/w185";

                const directorHtml = directors.map(p => `
                  <a class="director-chip" href="/person/${p.person_tmdb_id}">
                    <div class="director-photo">${p.profile_path
                      ? `<img src="${IMG_PROFILE}${escAttr(p.profile_path)}" alt="${escAttr(p.name || "")}" loading="lazy">`
                      : `<div class="director-photo-ph">${escText((p.name || "?")[0])}</div>`}
                    </div>
                    <div class="director-info">
                      <span class="director-name">${escText(p.name || "")}</span>
                      <span class="director-label">감독</span>
                    </div>
                  </a>`).join("");

                const castHtml = castList.map(p => `
                  <a class="cast-card" href="/person/${p.person_tmdb_id}">
                    <div class="cast-photo">
                      ${p.profile_path
                        ? `<img src="${IMG_PROFILE}${escAttr(p.profile_path)}" alt="${escAttr(p.name || "")}" loading="lazy">`
                        : `<div class="cast-photo-ph">${escText((p.name || "?")[0])}</div>`}
                    </div>
                    <div class="cast-name">${escText(p.name || "")}</div>
                    <div class="cast-role">${escText(p.character_name || "")}</div>
                  </a>`).join("");

                html = html.replace(
                  '<div class="director-row" id="directorRow"></div>',
                  `<div class="director-row" id="directorRow">${directorHtml}</div>`
                );
                html = html.replace(
                  '<div class="cast-scroll" id="castScroll"></div>',
                  `<div class="cast-scroll" id="castScroll">${castHtml}</div>`
                );
                html = html.replace(
                  '<div class="cast-section" id="castSection" style="display:none">',
                  '<div class="cast-section" id="castSection">'
                );
              }
            } catch (e) {
              // 출연진 조회 실패해도 나머지 프리필(제목/줄거리/평점/관계도)엔 영향 없게 조용히 무시
            }
          }
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
