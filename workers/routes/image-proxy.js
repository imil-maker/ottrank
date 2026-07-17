/* ══════════════════════════════════════════════════════════════
   routes/image-proxy.js
   - TMDB 포스터/백드롭 이미지를 우리 도메인(poster.ottrank.kr)에서
     캐싱해서 서빙하는 프록시 (2026-07-17 신설)
   - 목적: 브라우저가 image.tmdb.org로 매번 직접 연결(DNS+TLS)하는
     비용을 없애고, Cloudflare 엣지 캐시로 포스터 로딩속도 개선
   - 구조 (3단계):
     ① Cache API(빠른 캐시, 50일) — 대부분의 요청은 여기서 끝남
     ② 캐시 미스 시 TMDB 원본 요청 → 성공하면 캐시 저장 + R2 영구백업
     ③ TMDB 요청 자체가 실패(장애 등)하면 → R2 백업에서 예전 버전이라도
        반환 (TMDB 504 장애 같은 상황에서도 포스터가 안 깨지게 하는 안전장치)
   경로: GET /tmdb-img/{size}/{tmdb 이미지 경로}
   예:   GET /tmdb-img/w342/abc123XYZ.jpg
══════════════════════════════════════════════════════════════ */

// TMDB가 실제로 지원하는 이미지 크기만 허용 — 임의 경로로 오남용되는 것 방지
const ALLOWED_SIZES = new Set([
  "w92", "w154", "w185", "w300", "w342", "w500", "w780", "w1280", "original",
]);

const CACHE_TTL_SECONDS = 50 * 24 * 60 * 60; // 50일 — 포스터는 한 번 지정되면 거의 안 바뀜
const R2_PREFIX = "tmdb-cache/"; // 기존 히어로 커스텀 이미지 등 다른 R2 파일과 안 섞이게 구분

export async function handleImageProxy(path, request, env, ctx) {
  // 경로 파싱: /tmdb-img/{size}/{...imgPath}
  const m = path.match(/^\/tmdb-img\/([^/]+)\/(.+)$/);
  if (!m) {
    return new Response("Not found", { status: 404 });
  }
  const [, size, imgPath] = m;

  if (!ALLOWED_SIZES.has(size)) {
    return new Response("Invalid size", { status: 400 });
  }

  const r2Key = `${R2_PREFIX}${size}/${imgPath}`;

  // ① 빠른 캐시(Cache API) 먼저 확인
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // ② TMDB 원본에서 받아오기 시도
  let tmdbRes = null;
  try {
    tmdbRes = await fetch(`https://image.tmdb.org/t/p/${size}/${imgPath}`);
  } catch (e) {
    tmdbRes = null; // 네트워크 자체 실패(TMDB 장애 등) — 아래 ③ R2 폴백으로 이동
  }

  if (tmdbRes && tmdbRes.ok) {
    const buf = await tmdbRes.arrayBuffer();
    const contentType = tmdbRes.headers.get("Content-Type") || "image/jpeg";

    const response = new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, immutable`,
      },
    });

    // 캐시 저장 + R2 영구 백업은 응답을 막지 않도록 백그라운드로 처리
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    ctx.waitUntil(env.IMAGES.put(r2Key, buf, { httpMetadata: { contentType } }));

    return response;
  }

  // ③ TMDB 요청 실패 — R2에 예전에 백업해둔 게 있으면 그거라도 반환
  const r2Object = await env.IMAGES.get(r2Key);
  if (r2Object) {
    return new Response(r2Object.body, {
      status: 200,
      headers: {
        "Content-Type": r2Object.httpMetadata?.contentType || "image/jpeg",
        // TMDB 복구 후 금방 다시 시도하도록 짧게만 캐싱
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 캐시도 없고 R2 백업도 없고 TMDB도 실패 — 한 번도 요청된 적 없는 포스터
  return new Response("Image unavailable", { status: 502 });
}