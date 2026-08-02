/* 2026-08-02 rev.3 — admin-season.js (자동배치/관리자지정 저장 시 poster_path도 함께 갱신 —
   화면에 실제로 뜨는 값은 season_poster_path가 아니라 poster_path라서, 이걸 안 바꾸면
   시즌 저장해도 화면엔 안 보이는 문제가 있었음) */
/* 2026-08-02 rev.3 — admin-season.js (화면에 실제 뜨는 poster_path도 시즌 저장 시 같이
   갱신하도록 수정 — 지금까지는 season_poster_path만 저장하고 poster_path는 안 건드려서
   화면에 반영이 안 됐음. season-apply에는 season_new_available 알림 초기화(NULL)도 추가,
   season-search 응답에도 season_new_available 포함) */
/* 2026-08-02 rev.2 — admin-season.js (관리자 직접 지정 API 2개 추가:
   GET /admin/works/season-search — 제목/tmdb_id 검색, /admin/works/keywords의
   검색 로직만 그대로 재사용(키워드 조인은 제외한 가벼운 버전).
   POST /admin/works/season-apply — 관리자가 고른 시즌+포스터 저장, season_source='admin' */
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
              SET season = ?, season_poster_path = ?, poster_path = ?, season_source = 'auto', season_checked_at = ?
              WHERE tmdb_id = ?
            `).bind(seasonNum, seasonPoster, seasonPoster, now, row.tmdb_id)
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

  // ── GET /admin/works/season-search ─────────────────────────────
  // 제목(부분일치) 또는 tmdb_id(완전일치) 검색 — /admin/works/keywords 검색 로직 재사용
  // (키워드 조인은 빼고, 시즌 관리에 필요한 필드만 반환)
  if (path === "/admin/works/season-search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: false, message: "검색어(q)가 필요해요" }), { status: 400, headers });
      }

      let works;
      if (/^\d+$/.test(q)) {
        const row = await env.DB.prepare(
          "SELECT tmdb_id, title_ko, title_en, media_type, season, season_poster_path, season_source, season_new_available FROM works WHERE tmdb_id = ?"
        ).bind(parseInt(q)).first();
        works = row ? [row] : [];
      } else {
        const { results } = await env.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en, media_type, season, season_poster_path, season_source, season_new_available
          FROM works
          WHERE title_ko LIKE ? OR title_en LIKE ?
          ORDER BY tmdb_rating DESC
          LIMIT 10
        `).bind(`%${q}%`, `%${q}%`).all();
        works = results;
      }

      return new Response(JSON.stringify({ ok: true, works }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/season-apply ─────────────────────────────
  // 관리자가 직접 고른 시즌 번호+포스터 저장. season_source='admin'으로 표시되어
  // 앞으로 자동배치·크롤러 어떤 자동 로직도 이 값을 절대 덮어쓰지 않음(최우선 원칙).
  if (path === "/admin/works/season-apply" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const tmdb_id = parseInt(body.tmdb_id) || null;
      const season  = parseInt(body.season) || null;
      const poster_path = body.poster_path || null;

      if (!tmdb_id || !season || !poster_path) {
        return new Response(JSON.stringify({
          ok: false, message: "tmdb_id, season, poster_path 필수"
        }), { status: 400, headers });
      }

      await env.DB.prepare(`
        UPDATE works
        SET season = ?, season_poster_path = ?, poster_path = ?, season_source = 'admin',
            season_checked_at = ?, season_new_available = NULL
        WHERE tmdb_id = ?
      `).bind(season, poster_path, poster_path, new Date().toISOString(), tmdb_id).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null; // 이 파일이 처리할 경로 아님 — index.js에서 다음 핸들러로 넘어가야 함
}
