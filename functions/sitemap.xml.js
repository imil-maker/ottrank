/* functions/sitemap.xml.js
   오뜨랑 사이트맵 — Cloudflare Pages Function

   ⚠️ 배경: _redirects의 외부 도메인 200 rewrite(프록시)는
   Cloudflare Pages에서 지원되지 않아 /sitemap.xml 요청이
   SPA 폴백(index.html)으로 떨어지는 문제가 있었음.

   해결: Pages Function에서 Workers API(/sitemap.xml)를 직접 fetch해서
   받은 XML을 그대로 응답으로 전달 (프록시).
   실제 sitemap 생성 로직(works 테이블 조회 등)은
   workers/routes/rankings.js의 GET /sitemap.xml에 그대로 있음.
*/

const API_SITEMAP_URL = 'https://ottrank-api.tdidream.workers.dev/sitemap.xml';

export async function onRequest(context) {
  try {
    const res = await fetch(API_SITEMAP_URL);
    const xml = await res.text();

    return new Response(xml, {
      status: res.status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        // 사이트맵은 자주 안 바뀌므로 1시간 캐시 허용
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}