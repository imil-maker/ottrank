// workers/routes/person-wiki.js
// ============================================================
// [2026-07-19 신규] 인물 위키백과 보강 데이터 — 테스트용 최소 버전
//
// 지금은 자동 매칭 로직 없이, person_wiki_cache에 "수동으로 넣어둔 데이터"를
// 그냥 조회만 하는 역할만 함. 자동 매칭/캐시 갱신 로직은 이후 세션에서 별도 설계.
//
// person.html에서 ?wikitest=1 파라미터가 있을 때만 이 API를 호출하도록
// 프론트에서 조건 분기하므로, 이 API 자체는 항상 열려있어도 무해함
// (캐시에 없는 tmdb_person_id는 그냥 data:null만 반환).
// ============================================================

/**
 * GET /person-wiki/:tmdb_person_id
 * → { ok: true, data: {...} }  또는  { ok: true, data: null } (캐시 없음)
 */
export async function handlePersonWiki(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    // /person-wiki/122408 형태에서 마지막 세그먼트를 tmdb_person_id로 사용
    const segments = url.pathname.split("/").filter(Boolean);
    const rawId = segments[segments.length - 1];
    const tmdbPersonId = parseInt(rawId, 10);

    // 방어적 처리 — 숫자가 아니면 400
    if (!Number.isInteger(tmdbPersonId) || tmdbPersonId <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid tmdb_person_id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Prepared Statement 사용 (SQL 인젝션 방지)
    const row = await env.DB.prepare(
      `SELECT tmdb_person_id, wiki_title, bio_summary, career_history,
              debut_work, debut_year, education, awards_text,
              kmdb_id, imdb_id, source_url
       FROM person_wiki_cache
       WHERE tmdb_person_id = ?`
    )
      .bind(tmdbPersonId)
      .first();

    // row가 null이어도(캐시 없음) 정상 응답 — ok:true, data:null
    return new Response(JSON.stringify({ ok: true, data: row || null }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    // DB 오류 등 예외 상황 — 500이지만 프론트는 이 실패를 조용히 무시하도록 설계됨
    console.log("[person-wiki] error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: "internal error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
}