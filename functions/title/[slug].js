/* functions/title/[slug].js - 오뜨랑 작품 상세 페이지 라우팅 + SSR SEO */

const TMDB_PROXY = 'https://tmdb-proxy.tdidream.workers.dev/tmdb';
const IMG_BASE   = 'https://image.tmdb.org/t/p/w780';
const IMG_OG     = 'https://image.tmdb.org/t/p/w500';

/* ── slug 파싱 ── */
function parseSlug(slug) {
  if (!slug) return null;
  const m = slug.match(/-(\d+)$/);
  if (!m) return null;
  const numStr   = m[1];
  const titleStr = slug.slice(0, m.index);
  let season = 1, year = new Date().getFullYear(), tmdb_id = null;
  if (numStr.length >= 6) {
    if (/^\d+$/.test(titleStr)) {
      season = parseInt(titleStr) || 1;
      const y = parseInt(numStr.slice(0, 4));
      const tid = numStr.slice(4);
      if (tid.length >= 1 && y >= 1900 && y <= 2100) { year = y; tmdb_id = parseInt(tid); }
    } else {
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

/* ── OTT 플랫폼명 한국어 ── */
const PC = {
  netflix: '넷플릭스', tving: '티빙', disney: '디즈니+',
  coupang: '쿠팡플레이', wavve: '웨이브', boxoffice: '박스오피스'
};

/* ── 특수문자 이스케이프 ── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function onRequest(context) {
  const { params, env } = context;
  const slug = params.slug;

  /* ── 1. _title_detail.html 원본 로드 ── */
  const response = await env.ASSETS.fetch('https://ottrank.kr/_title_detail.html');
  let html = await response.text();

  /* ── 2. slug 파싱 ── */
  const parsed = parseSlug(slug);

  /* ── 3. TMDB API 호출 (파싱 성공 시) ── */
  let seoTitle       = '작품 상세 | 오뜨랑 — OTT 랭킹·평점·후기';
  let seoDesc        = 'OTT 작품 평점, 사용자 후기, 순위 히스토리를 오뜨랑에서 확인하세요. 넷플릭스 추천 드라마·영화 순위 비교.';
  let seoKeywords    = 'OTT 추천, 넷플릭스 추천, 넷플릭스 순위, 넷플릭스 드라마 추천, 티빙 추천, OTT 순위, 드라마 평점, 영화 후기';
  let seoOgImage     = 'https://ottrank.kr/og-image.png';
  let seoCanonical   = `https://ottrank.kr/title/${slug}`;
  let jsonLd         = '{}';

  if (parsed && parsed.tmdb_id) {
    try {
      /* TV / Movie 병렬 조회 */
      const [tvRes, movieRes] = await Promise.allSettled([
        fetch(`${TMDB_PROXY}/tv/${parsed.tmdb_id}?language=ko-KR`).then(r => r.json()),
        fetch(`${TMDB_PROXY}/movie/${parsed.tmdb_id}?language=ko-KR`).then(r => r.json()),
      ]);

      const tvData    = tvRes.status    === 'fulfilled' ? tvRes.value    : null;
      const movieData = movieRes.status === 'fulfilled' ? movieRes.value : null;

      /* 유효한 데이터 선택 */
      let det = null, mediaType = 'tv';
      if (tvData?.id)    { det = tvData;    mediaType = 'tv'; }
      if (movieData?.id && (!det || (det === tvData && movieData.popularity > tvData.popularity))) {
        det = movieData; mediaType = 'movie';
      }
      /* TV가 있으면 TV 우선 */
      if (tvData?.id) { det = tvData; mediaType = 'tv'; }

      if (det) {
        const title     = det.name || det.title || '';
        const origTitle = det.original_name || det.original_title || '';
        const year      = (det.first_air_date || det.release_date || '').slice(0, 4);
        const overview  = (det.overview || '').slice(0, 150).replace(/\n/g, ' ');
        const genres    = (det.genres || []).map(g => g.name).join(', ');
        const typeLabel = mediaType === 'tv' ? '드라마' : '영화';

        /* 포스터 이미지 */
        if (det.poster_path) {
          seoOgImage = `${IMG_OG}${det.poster_path}`;
        } else if (det.backdrop_path) {
          seoOgImage = `${IMG_BASE}${det.backdrop_path}`;
        }

        /* title — 작품명 + 행동 키워드 + 브랜드 */
        seoTitle = `${title} 평점·후기·줄거리 | ${typeLabel} OTT 순위 | 오뜨랑`;

        /* description — 자연스러운 문장 + 키워드 포함 */
        const overviewSnippet = overview
          ? `${overview.slice(0, 80)}... `
          : '';
        seoDesc = `${overviewSnippet}${title} 평점, 사용자 후기, OTT 순위를 오뜨랑에서 확인하세요. 넷플릭스·티빙·디즈니+ 추천 ${typeLabel}.`;

        /* keywords — 작품명 변형 + 플랫폼 키워드 */
        seoKeywords = [
          title,
          `${title} 평점`,
          `${title} 후기`,
          `${title} 줄거리`,
          `${title} ${typeLabel}`,
          origTitle,
          `넷플릭스 추천 ${typeLabel}`,
          `넷플릭스 순위`,
          `OTT 추천`,
          `OTT 순위`,
          genres,
        ].filter(Boolean).join(', ');

        /* JSON-LD — TVSeries or Movie 스키마 */
        const schemaType  = mediaType === 'tv' ? 'TVSeries' : 'Movie';
        const actors      = (det.credits?.cast || []).slice(0, 5).map(a => ({
          '@type': 'Person', name: a.name
        }));
        const ld = {
          '@context': 'https://schema.org',
          '@type':    schemaType,
          name:       title,
          description: det.overview || seoDesc,
          url:        seoCanonical,
          image:      seoOgImage,
          datePublished: det.first_air_date || det.release_date || '',
          genre:      (det.genres || []).map(g => g.name),
        };
        if (actors.length) ld.actor = actors;
        if (det.number_of_seasons) ld.numberOfSeasons = det.number_of_seasons;
        if (origTitle) ld.alternateName = origTitle;
        jsonLd = JSON.stringify(ld);
      }
    } catch (e) {
      /* TMDB 실패 시 기본값 유지 */
    }
  }

  /* ── 4. HTML에 메타태그 SSR 주입 ── */
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
<meta property="og:image:width" content="500">
<meta property="og:image:height" content="750">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(seoDesc)}">
<meta name="twitter:image" content="${esc(seoOgImage)}">
<script type="application/ld+json">${jsonLd}</script>
<script>window.__TITLE_SLUG__="${slug}";</script>`;

  /* 기존 <title>, <meta> 태그들 제거 후 새것으로 교체 */
  html = html
    /* 기존 id 기반 메타태그 제거 (JS가 동적으로 바꾸던 것들) */
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
      /* 작품 정보는 자주 안 바뀌므로 5분 캐시 허용 */
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
