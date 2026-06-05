/* ══════════════════════════════════════════════════════════════
   functions/reaction/[id].js
   Cloudflare Pages Function — /reaction/:id SSR
   구글/네이버 봇이 JS 실행 없이 완성된 메타태그를 읽을 수 있도록
   서버에서 reactions 데이터를 조회해 HTML에 직접 주입
══════════════════════════════════════════════════════════════ */

export async function onRequest(context) {
  const { params, env } = context;
  const id = params.id;

  /* ── 숫자 ID 검증 ── */
  if (!id || !/^\d+$/.test(id)) {
    return fallback(context);
  }

  try {
    /* ── D1에서 reaction 데이터 직접 조회 ── */
    const row = await env.DB.prepare(
      `SELECT id, tmdb_id, title_ko, poster_path, video_id, video_title,
              custom_title, channel_name, thumbnail, published_at
       FROM reactions
       WHERE id = ?
       LIMIT 1`
    ).bind(parseInt(id)).first();

    if (!row) return fallback(context);

    /* ── 메타태그 값 조립 ── */
    const workName = row.title_ko  || '';
    const vidTitle = row.custom_title || row.video_title || '해외반응';
    const channel  = row.channel_name || '';

    const seoTitle = workName
      ? `${workName} 해외반응 번역 | ${channel || 'YouTube'} | 오뜨랑`
      : `${vidTitle} | 오뜨랑`;

    const seoDesc = workName
      ? `${workName} 해외반응. 외국인들의 실제 반응과 번역 댓글을 오뜨랑에서 확인하세요. ${channel}`
      : `K-드라마·K-영화 해외반응 번역 댓글을 오뜨랑에서 확인하세요.`;

    const seoKw = workName
      ? `${workName} 해외반응, ${workName} 외국인 반응, ${workName} 번역, K드라마 해외반응, 오뜨랑`
      : 'K드라마 해외반응, 해외반응 번역, 오뜨랑';

    const seoImg = row.thumbnail || '';
    const seoUrl = `https://ottrank.kr/reaction/${row.id}`;

    /* JSON-LD */
    const jsonLd = JSON.stringify({
      "@context"   : "https://schema.org",
      "@type"      : "VideoObject",
      "name"       : seoTitle,
      "description": seoDesc,
      "thumbnailUrl": seoImg,
      "url"        : seoUrl,
      "embedUrl"   : `https://www.youtube.com/embed/${row.video_id}`,
      "uploadDate" : row.published_at || '',
      "publisher"  : { "@type": "Organization", "name": "오뜨랑", "url": "https://ottrank.kr" },
      ...(workName ? { "about": { "@type": "TVSeries", "name": workName } } : {}),
    });

    /* ── 원본 HTML 가져오기 ── */
    const originalUrl = new URL(context.request.url);
    originalUrl.pathname = '/_reaction_detail.html';
    const originalRes  = await fetch(originalUrl.toString());
    let   html         = await originalRes.text();

    /* ── 메타태그 주입 ── */
    const esc = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    html = html
      /* title */
      .replace(
        /<title id="seoTitle">.*?<\/title>/,
        `<title id="seoTitle">${esc(seoTitle)}</title>`
      )
      /* description */
      .replace(
        /<meta id="seoDesc" name="description" content=".*?">/,
        `<meta id="seoDesc" name="description" content="${esc(seoDesc)}">`
      )
      /* keywords */
      .replace(
        /<meta id="seoKeywords" name="keywords" content=".*?">/,
        `<meta id="seoKeywords" name="keywords" content="${esc(seoKw)}">`
      )
      /* og:title */
      .replace(
        /<meta id="seoOgTitle" property="og:title" content=".*?">/,
        `<meta id="seoOgTitle" property="og:title" content="${esc(seoTitle)}">`
      )
      /* og:description */
      .replace(
        /<meta id="seoOgDesc" property="og:description" content=".*?">/,
        `<meta id="seoOgDesc" property="og:description" content="${esc(seoDesc)}">`
      )
      /* og:image */
      .replace(
        /<meta id="seoOgImg" property="og:image" content=".*?">/,
        `<meta id="seoOgImg" property="og:image" content="${esc(seoImg)}">`
      )
      /* og:url */
      .replace(
        /<meta id="seoOgUrl" property="og:url" content=".*?">/,
        `<meta id="seoOgUrl" property="og:url" content="${esc(seoUrl)}">`
      )
      /* twitter:title */
      .replace(
        /<meta id="seoTwTitle" name="twitter:title" content=".*?">/,
        `<meta id="seoTwTitle" name="twitter:title" content="${esc(seoTitle)}">`
      )
      /* twitter:description */
      .replace(
        /<meta id="seoTwDesc" name="twitter:description" content=".*?">/,
        `<meta id="seoTwDesc" name="twitter:description" content="${esc(seoDesc)}">`
      )
      /* twitter:image */
      .replace(
        /<meta id="seoTwImg" name="twitter:image" content=".*?">/,
        `<meta id="seoTwImg" name="twitter:image" content="${esc(seoImg)}">`
      )
      /* JSON-LD */
      .replace(
        /<script id="jsonLd" type="application\/ld\+json">.*?<\/script>/s,
        `<script id="jsonLd" type="application/ld+json">${jsonLd}</script>`
      );

    return new Response(html, {
      headers: {
        'Content-Type' : 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=300', // 5분 캐시
      },
    });

  } catch(e) {
    console.error('[reaction/[id]]', e);
    return fallback(context);
  }
}

/* ── fallback: 원본 HTML 그대로 반환 ── */
async function fallback(context) {
  const url      = new URL(context.request.url);
  url.pathname   = '/_reaction_detail.html';
  const res      = await fetch(url.toString());
  const html     = await res.text();
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
