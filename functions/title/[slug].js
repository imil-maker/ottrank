/* functions/title/[slug].js - 오뜨랑 작품 상세 페이지 라우팅 + SSR SEO */
/* 수정 이력:
 * - D1 works 테이블 우선 조회 (title_ko, overview, poster_path 활용)
 * - TV/Movie 판별 버그 수정 (TV 우선, 없으면 Movie 폴백)
 * - TMDB API 호출 최소화 (TV 확인 후 Movie 조건부 호출)
 * - credits append_to_response 추가 → JSON-LD actor 정상화
 * - OG 이미지 backdrop 우선, poster 폴백 + 동적 사이즈
 */

const TMDB_PROXY = 'https://tmdb-proxy.tdidream.workers.dev/tmdb';
const IMG_BACKDROP = 'https://image.tmdb.org/t/p/w1280'; // OG용 가로형 이미지
const IMG_POSTER   = 'https://image.tmdb.org/t/p/w500';  // OG용 세로형 폴백

/* ── slug 파싱 ──
 * 슬러그 형태: {season}-{year}{tmdb_id}
 * 예: 1-2026312493 → { season:1, year:2026, tmdb_id:312493 }
 */
function parseSlug(slug) {
  if (!slug) return null;
  const m = slug.match(/-(\d+)$/);
  if (!m) return null;
  const numStr   = m[1];
  const titleStr = slug.slice(0, m.index);
  let season = 1, year = new Date().getFullYear(), tmdb_id = null;
  if (numStr.length >= 6) {
    if (/^\d+$/.test(titleStr)) {
      // titleStr 자체가 숫자 = season 번호
      season = parseInt(titleStr) || 1;
      const y   = parseInt(numStr.slice(0, 4));
      const tid = numStr.slice(4);
      if (tid.length >= 1 && y >= 1900 && y <= 2100) {
        year = y; tmdb_id = parseInt(tid);
      }
    } else {
      // titleStr이 문자 포함 = 앞 1~2자리가 season
      for (let sLen = 1; sLen <= 2; sLen++) {
        const s   = parseInt(numStr.slice(0, sLen));
        const y   = parseInt(numStr.slice(sLen, sLen + 4));
        const tid = numStr.slice(sLen + 4);
        if (tid.length >= 1 && y >= 1900 && y <= 2100 && s >= 1) {
          season = s; year = y; tmdb_id = parseInt(tid); break;
        }
      }
    }
  }
  return { tmdb_id, season, year };
}

/* ── 특수문자 이스케이프 (XSS 방지) ── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ── D1에서 works 데이터 조회 ──
 * title_ko, overview, poster_path, genre, media_type 반환
 * 실패 시 null 반환 (폴백으로 TMDB만 사용)
 */
async function fetchWorksFromD1(db, tmdb_id) {
  if (!db || !tmdb_id) return null;
  try {
    const row = await db.prepare(`
      SELECT title_ko, overview, poster_path, genre, media_type
      FROM works
      WHERE tmdb_id = ?
      LIMIT 1
    `).bind(tmdb_id).first();
    return row || null;
  } catch (e) {
    // D1 조회 실패 시 TMDB 폴백으로 계속 진행
    console.error('[slug] D1 조회 실패:', e.message);
    return null;
  }
}

/* ── TMDB API 조회 ──
 * TV 먼저 시도 → id 있으면 TV 확정
 * TV 없으면 Movie 시도 (폴백)
 * credits는 append_to_response로 1회에 같이 조회
 */
async function fetchTmdbData(tmdb_id) {
  if (!tmdb_id) return { det: null, mediaType: 'tv' };
  try {
    // TV 먼저 시도 (credits 포함)
    const tvRes = await fetch(
      `${TMDB_PROXY}/tv/${tmdb_id}?language=ko-KR&append_to_response=credits`
    ).then(r => r.json()).catch(() => null);

    // TV id가 유효하면 TV 확정 → Movie 호출 안 함
    if (tvRes?.id) {
      return { det: tvRes, mediaType: 'tv' };
    }

    // TV 없으면 Movie 시도 (credits 포함)
    const movieRes = await fetch(
      `${TMDB_PROXY}/movie/${tmdb_id}?language=ko-KR&append_to_response=credits`
    ).then(r => r.json()).catch(() => null);

    if (movieRes?.id) {
      return { det: movieRes, mediaType: 'movie' };
    }

    // 둘 다 없으면 null
    return { det: null, mediaType: 'tv' };
  } catch (e) {
    return { det: null, mediaType: 'tv' };
  }
}

export async function onRequest(context) {
  const { params, env } = context;
  const slug = params.slug;

  /* ── 1. _title_detail.html 원본 로드 ── */
  const response = await env.ASSETS.fetch('https://ottrank.kr/_title_detail.html');
  let html = await response.text();

  /* ── 2. slug 파싱 ── */
  const parsed = parseSlug(slug);

  /* ── 3. SEO 기본값 설정 ── */
  let seoTitle     = '오뜨랑 — OTT 랭킹·평점·후기';
  let seoDesc      = 'OTT 작품 평점, 사용자 후기, 순위 히스토리를 오뜨랑에서 확인하세요. 넷플릭스·티빙·디즈니+ 추천 드라마·영화 순위 비교.';
  let seoKeywords  = 'OTT 추천, 넷플릭스 추천, 넷플릭스 순위, 넷플릭스 드라마 추천, 티빙 추천, OTT 순위, 드라마 평점, 영화 후기';
  let seoOgImage   = 'https://ottrank.kr/og-image.png';
  let seoOgWidth   = '1200';
  let seoOgHeight  = '630';
  let seoCanonical = `https://ottrank.kr/title/${slug}`;
  let jsonLd       = '{}';

  if (parsed && parsed.tmdb_id) {
    try {
      /* ── 4. D1 works 조회 (최우선) ── */
      const worksData = await fetchWorksFromD1(env.DB, parsed.tmdb_id);

      /* ── 5. TMDB API 조회 (TV 우선 → Movie 폴백) ── */
      const { det, mediaType } = await fetchTmdbData(parsed.tmdb_id);

      /* ── 6. 데이터 병합 (D1 우선, TMDB 폴백) ── */
      // 제목: D1 title_ko 우선 → TMDB ko-KR 폴백
      const title = worksData?.title_ko
        || det?.name
        || det?.title
        || '작품 상세';

      // 줄거리: D1 overview 우선 (한국어) → TMDB overview 폴백
      const overview = (worksData?.overview || det?.overview || '').replace(/\n/g, ' ');

      // 장르
      const genres = worksData?.genre
        || (det?.genres || []).map(g => g.name).join(', ')
        || '';

      // 출시년도
      const releaseYear = (det?.first_air_date || det?.release_date || '').slice(0, 4) || '';

      // 타입 레이블 (한국어)
      const typeLabel = mediaType === 'tv' ? '드라마' : '영화';

      /* ── 7. OG 이미지 결정 ──
       * backdrop(가로형 1280×720) 우선 → 카카오톡/슬랙 공유 최적화
       * poster(세로형 500×750) 폴백 → D1 poster_path 우선
       */
      const backdropPath = det?.backdrop_path;
      const posterPath   = worksData?.poster_path || det?.poster_path;

      if (backdropPath) {
        // backdrop: 가로형 → 공유 시 잘림 없음
        seoOgImage  = `${IMG_BACKDROP}${backdropPath}`;
        seoOgWidth  = '1280';
        seoOgHeight = '720';
      } else if (posterPath) {
        // poster: 세로형 폴백
        seoOgImage  = `${IMG_POSTER}${posterPath}`;
        seoOgWidth  = '500';
        seoOgHeight = '750';
      }

      /* ── 8. title 태그 ── */
      seoTitle = `${title} 평점·후기·줄거리 | ${typeLabel} OTT 순위 | 오뜨랑`;

      /* ── 9. description 태그 ──
       * 줄거리 앞 80자 + 행동 키워드
       */
      const overviewSnippet = overview
        ? `${overview.slice(0, 80)}... `
        : '';
      seoDesc = `${overviewSnippet}${title} 평점, 사용자 후기, OTT 순위를 오뜨랑에서 확인하세요. 넷플릭스·티빙·디즈니+ 추천 ${typeLabel}.`;

      /* ── 10. keywords 태그 ── */
      const origTitle = det?.original_name || det?.original_title || '';
      seoKeywords = [
        title,
        `${title} 평점`,
        `${title} 후기`,
        `${title} 줄거리`,
        `${title} ${typeLabel}`,
        origTitle,
        `넷플릭스 추천 ${typeLabel}`,
        '넷플릭스 순위',
        'OTT 추천',
        'OTT 순위',
        genres,
      ].filter(Boolean).join(', ');

      /* ── 11. JSON-LD 구조화 데이터 ──
       * TVSeries 또는 Movie 스키마
       * credits 포함으로 actor 정상 출력
       */
      const schemaType = mediaType === 'tv' ? 'TVSeries' : 'Movie';

      // credits는 append_to_response로 가져온 데이터 사용
      const actors = (det?.credits?.cast || [])
        .slice(0, 5)
        .map(a => ({ '@type': 'Person', name: a.name }));

      const ld = {
        '@context':    'https://schema.org',
        '@type':       schemaType,
        name:          title,
        description:   overview || seoDesc,
        url:           seoCanonical,
        image:         seoOgImage,
        datePublished: det?.first_air_date || det?.release_date || '',
        genre:         genres ? genres.split(',').map(g => g.trim()) : [],
      };
      if (actors.length)              ld.actor           = actors;
      if (det?.number_of_seasons)     ld.numberOfSeasons = det.number_of_seasons;
      if (origTitle)                  ld.alternateName   = origTitle;
      if (releaseYear)                ld.datePublished   = releaseYear;

      jsonLd = JSON.stringify(ld);

    } catch (e) {
      // 전체 실패 시 기본값 유지 (페이지는 정상 반환)
      console.error('[slug] SEO 생성 실패:', e.message);
    }
  }

  /* ── 12. HTML에 SSR 메타태그 주입 ── */
  const metaInject = `
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(seoDesc)}">
<meta name="keywords" content="${esc(seoKeywords)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(seoCanonical)}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="오뜨랑">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(seoDesc)}">
<meta property="og:url" content="${esc(seoCanonical)}">
<meta property="og:image" content="${esc(seoOgImage)}">
<meta property="og:image:width" content="${seoOgWidth}">
<meta property="og:image:height" content="${seoOgHeight}">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(seoDesc)}">
<meta name="twitter:image" content="${esc(seoOgImage)}">
<script type="application/ld+json">${jsonLd}</script>
<script>window.__TITLE_SLUG__="${esc(slug)}";</script>`;

  /* 기존 _title_detail.html의 id 기반 메타태그 제거 후 SSR 태그로 교체
   * (JS가 동적으로 바꾸던 태그들 — 봇은 JS 실행 전 HTML만 읽음)
   */
  html = html
    .replace(/<title[^>]*>.*?<\/title>/is, '')
    .replace(/<meta[^>]+id="seoTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoKw"[^>]*>/i, '')
    .replace(/<link[^>]+id="seoCanonical"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgUrl"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgImg"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwImg"[^>]*>/i, '')
    .replace(/<script[^>]+id="ldJson"[^>]*>.*?<\/script>/is, '')
    /* <head> 바로 뒤에 SSR 메타태그 삽입 */
    .replace('<head>', `<head>\n${metaInject}`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      /* 작품 정보는 자주 안 바뀌므로 5분 캐시 허용
       * stale-while-revalidate로 캐시 만료 후에도 빠른 응답 보장 */
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
