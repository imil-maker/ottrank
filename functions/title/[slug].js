/* functions/title/[slug].js - 오뜨랑 작품 상세 페이지 라우팅  11  */

export async function onRequest(context) {
  const { params, request, env } = context;
  const slug = params.slug;

  // /_title_detail.html 을 가져와서 그대로 반환
  // URL에 ?slug= 를 붙여서 JS에서 읽을 수 있게 함
  const url = new URL(request.url);
  url.pathname = '/_title_detail.html';
  url.searchParams.set('slug', slug);

  const response = await env.ASSETS.fetch(url.toString());

  // HTML 응답을 그대로 반환하되, 브라우저 URL은 원래 /title/:slug 유지
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
