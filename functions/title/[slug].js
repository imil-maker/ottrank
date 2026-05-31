/* functions/title/[slug].js - 오뜨랑 작품 상세 페이지 라우팅  12  */

export async function onRequest(context) {
  const { params, env } = context;
  const slug = params.slug;

  // /_title_detail.html 원본 HTML 가져오기
  const response = await env.ASSETS.fetch('https://ottrank.kr/_title_detail.html');
  let html = await response.text();

  // </head> 바로 앞에 slug 값을 전역 변수로 주입
  // title_detail.js에서 window.__TITLE_SLUG__ 로 읽음
  html = html.replace('</head>', `<script>window.__TITLE_SLUG__="${slug}";</script>\n</head>`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
