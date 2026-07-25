/* 2026-07-25 rev.1 — functions/person/[id].js (D1 bio_summary/auto_filmography_text 프리필 추가 — bio_summary 100자 미만이면 필모문장 이어붙임, 본문/description/JSON-LD 모두 적용) */
/* functions/person/[id].js - 오뜨랑 인물 상세 페이지 라우팅 + SSR SEO */

const TMDB_PROXY = 'https://tmdb-proxy.tdidream.workers.dev/tmdb';
const IMG_PROFILE = 'https://image.tmdb.org/t/p/w342';

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
  const personId = params.id;

  /* ── 1. person.html 원본 로드 ── */
  const response = await env.ASSETS.fetch('https://ottrank.kr/person.html');
  let html = await response.text();

  /* ── 2. 기본 SEO값 ── */
  let seoTitle     = '인물 정보 | 오뜨랑 — 배우·감독 프로필·필모그래피';
  let seoDesc      = '배우·감독 프로필, 출연작, 필모그래피를 오뜨랑에서 확인하세요.';
  let seoKeywords  = '배우 프로필, 감독 필모그래피, 출연작, 드라마 배우, OTT 배우';
  let seoOgImage   = 'https://ottrank.kr/og-image.png';
  let seoCanonical = `https://ottrank.kr/person/${personId}`;
  let jsonLd       = '{}';
  let bioSource    = ''; // [2026-07-25 신규] D1 약력(bio_summary/auto_filmography_text) 우선, 없으면 TMDB로 폴백

  /* ── 3. TMDB Person API 호출 ── */
  if (personId) {
    try {
      const res  = await fetch(
        `${TMDB_PROXY}/person/${personId}?language=ko-KR&append_to_response=combined_credits`
      );
      const data = await res.json();

      if (data && data.id) {
        /* 한국어 이름 추출 */
        const alsoKnown = data.also_known_as || [];
        const koName    = alsoKnown.find(n => /[가-힣]/.test(n)) || '';
        const name      = koName || data.name || '';
        const enName    = koName ? data.name : '';

        /* 대표 직업 (배우/감독) */
        const dept      = data.known_for_department || '';
        const jobLabel  = dept === 'Directing' ? '감독' : '배우';

        /* [2026-07-25 신규] D1 약력 프리필 — bio_summary(진짜 약력) 100자 이상이면 그것만,
           100자 미만(또는 없음)이면 auto_filmography_text(자동생성 필모문장)를 이어붙임.
           D1 조회 실패해도 TMDB biography로 그대로 폴백 — 페이지가 깨지는 일은 없음. */
        if (env.DB) {
          try {
            const wikiRow = await env.DB.prepare(
              `SELECT bio_summary, auto_filmography_text FROM person_wiki_cache WHERE tmdb_person_id = ?`
            ).bind(personId).first();

            if (wikiRow) {
              const manualBio = (wikiRow.bio_summary || '').trim();
              const autoRaw   = (wikiRow.auto_filmography_text || '').trim();
              const autoText  = (autoRaw && autoRaw !== '__NONE__') ? autoRaw : '';

              bioSource = manualBio.length >= 100
                ? manualBio
                : [manualBio, autoText].filter(Boolean).join(' ');
            }
          } catch (e) {
            bioSource = ''; // 조회 실패 시 아래에서 TMDB biography로 폴백
          }
        }
        if (!bioSource) bioSource = data.biography || '';

        /* 약력 앞 100자 */
        const bio       = bioSource.slice(0, 100).replace(/\n/g, ' ');

        /* 출연작 상위 3개 (최신순) */
        const credits   = data.combined_credits || {};
        const topWorks  = [...(credits.cast || []), ...(credits.crew || [])]
          .filter(w => w.poster_path)
          .sort((a, b) => {
            const da = a.release_date || a.first_air_date || '0000';
            const db = b.release_date || b.first_air_date || '0000';
            return db.localeCompare(da);
          })
          .slice(0, 3)
          .map(w => w.title || w.name || '')
          .filter(Boolean);

        /* 프로필 이미지 */
        if (data.profile_path) {
          seoOgImage = `${IMG_PROFILE}${data.profile_path}`;
        }

        /* title */
        seoTitle = `${name} 프로필·출연작·필모그래피 | ${jobLabel} 정보 | 오뜨랑`;

        /* description */
        const worksSnippet = topWorks.length
          ? `대표작: ${topWorks.join(', ')}. `
          : '';
        seoDesc = `${name} ${jobLabel} 나이, 출연 드라마·영화, 인스타그램 정보를 오뜨랑에서 확인하세요. ${worksSnippet}${bio ? bio + '...' : ''}`.trim();

        /* keywords */
        seoKeywords = [
          name,
          `${name} 드라마`,
          `${name} 영화`,
          `${name} 나이`,
          `${name} 프로필`,
          `${name} 인스타`,
          `${name} 출연작`,
          enName,
          `${jobLabel} 필모그래피`,
          'OTT 배우',
          '드라마 배우 프로필',
        ].filter(Boolean).join(', ');

        /* JSON-LD — Person 스키마 */
        const ld = {
          '@context': 'https://schema.org',
          '@type':    'Person',
          name,
          url:        seoCanonical,
          image:      seoOgImage,
          jobTitle:   jobLabel,
        };
        if (bioSource)          ld.description    = bioSource.slice(0, 200);
        if (data.birthday)     ld.birthDate      = data.birthday;
        if (data.place_of_birth) ld.birthPlace   = data.place_of_birth;
        if (enName)            ld.alternateName  = enName;

        /* sameAs — 인스타 링크 */
        const instaId = data.external_ids?.instagram_id;
        if (instaId) ld.sameAs = [`https://www.instagram.com/${instaId}/`];

        /* knowsAbout — 대표작 */
        if (topWorks.length) ld.knowsAbout = topWorks;

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
<meta property="og:type" content="profile">
<meta property="og:site_name" content="오뜨랑">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(seoDesc)}">
<meta property="og:url" content="${esc(seoCanonical)}">
<meta property="og:image" content="${esc(seoOgImage)}">
<meta property="og:image:width" content="342">
<meta property="og:image:height" content="513">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(seoDesc)}">
<meta name="twitter:image" content="${esc(seoOgImage)}">
<script type="application/ld+json">${jsonLd}</script>
<script>window.__PERSON_ID__="${personId}";</script>`;

  /* 기존 id 기반 메타태그 제거 후 교체 */
  html = html
    .replace(/<title[^>]*>.*?<\/title>/is, '')
    .replace(/<meta[^>]+id="seoTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoKw"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgUrl"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgImg"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwDesc"[^>]*>/i, '')
    .replace(/<link[^>]+id="seoCanonical"[^>]*>/i, '')
    .replace('<head>', `<head>\n${metaInject}`);

  /* [2026-07-25 신규] 본문 약력 자리(id="bioText")도 미리 채움 — 화면에는 자바스크립트가
     로드 후 다시 자기 로직(위키 우선 등)으로 덮어쓰므로 사람 눈엔 영향 없음. bioSource가
     비어있으면(D1도 TMDB도 없음) 건드리지 않고 기존 빈 상태 그대로 둠. */
  if (bioSource) {
    html = html.replace(
      /(<div class="bio-text" id="bioText">)[\s\S]*?(<\/div>)/,
      (_, pre, post) => `${pre}${esc(bioSource)}${post}`
    );
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      /* 인물 정보는 자주 안 바뀌므로 10분 캐시 */
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=120',
    },
  });
}
