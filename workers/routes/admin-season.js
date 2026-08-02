/* 2026-08-02 rev.1 — admin-season.js (신규 — 시즌 관리 전용 파일)
   POST /admin/works/backfill-season 만 우선 구현.
   대상: media_type='tv' AND season IS NULL AND season_checked_at IS NULL
   정렬: 한국어(original_language='ko') 먼저 → 그 안에서 tmdb_rating 높은 순
   시즌0(스페셜)은 제외하고 마지막 정규 시즌만 사용
   season_source='auto', season_checked_at 기록 (재시도 방지)
*/
import { _checkAuth } from "../utils/authUtils.js";

export async function handleAdminSeason(path, request, env, url, headers) {

  // ── POST /admin/works/backfill-season ─────────────────────────
  if (path === "/admin/works/backfill-season" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, original_language FROM works
        WHERE media_type = 'tv'
          AND season IS NULL
          AND season_checked_at IS NULL
        ORDER BY
          CASE WHEN original_language = 'ko' THEN 0 ELSE 1 END,
          tmdb_rating DESC
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      const now = new Date().toISOString();

      for (const row of targets) {
        let seasonNum = null;
        let seasonPoster = null;

        try {
          const resp = await fetch(
            `https://api.themoviedb.org/3/tv/${row.tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
          );
          if (resp.ok) {
            const data = await resp.json();
            // 시즌0(스페셜) 제외, season_number 최대값 = 마지막 정규 시즌
            const regularSeasons = (data.seasons || []).filter(s => s.season_number > 0);
            if (regularSeasons.length) {
              const latest = regularSeasons.reduce((a, b) => a.season_number > b.season_number ? a : b);
              seasonNum = latest.season_number;
              seasonPoster = latest.poster_path || null;

              // 목록 응답에 포스터가 없으면 시즌 상세 엔드포인트로 한 번 더 시도
              if (!seasonPoster) {
                const seasonResp = await fetch(
                  `https://api.themoviedb.org/3/tv/${row.tmdb_id}/season/${seasonNum}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
                );
                if (seasonResp.ok) {
                  const seasonData = await seasonResp.json();
                  seasonPoster = seasonData.poster_path || null;
                }
              }
            }
          }
        } catch (e) { /* 실패해도 아래에서 season_checked_at은 기록 */ }

        if (seasonNum && seasonPoster) {
          updates.push(
            env.DB.prepare(`
              UPDATE works
              SET season = ?, season_poster_path = ?, season_source = 'auto', season_checked_at = ?
              WHERE tmdb_id = ?
            `).bind(seasonNum, seasonPoster, now, row.tmdb_id)
          );
          filled++;
        } else {
          // 못 찾았어도 재시도 방지를 위해 확인 시각만 기록 (season은 NULL 유지)
          updates.push(
            env.DB.prepare(`UPDATE works SET season_checked_at = ? WHERE tmdb_id = ?`)
              .bind(now, row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE media_type = 'tv' AND season IS NULL AND season_checked_at IS NULL
      `).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null; // 이 파일이 처리할 경로 아님 — index.js에서 다음 핸들러로 넘어가야 함
}