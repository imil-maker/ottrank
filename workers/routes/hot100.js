// ─────────────────────────────────────────────────────────
// HOT100 랭킹 점수 계산 라우트
// RankScore × PlatformWeight + AdminBoost 기반
// (EngagementScore/검색어 점수는 추후 네이버 데이터랩 연동 시 추가 예정,
//  현재는 컬럼만 만들어두고 항상 0으로 저장)
// ─────────────────────────────────────────────────────────

import { _checkAuth } from "../utils/authUtils.js";

/**
 * POST /admin/calc-hot100
 * ─────────────────────────────────────────────
 * rankings 테이블의 최신 크롤링 데이터 + admin_boosts를 조합해
 * hot100_scores 테이블을 매번 전체 재계산(덮어쓰기)한다.
 * 이력을 쌓지 않는 설계이므로 호출할 때마다 테이블을 비우고 다시 채운다.
 */
export async function calcHot100(request, env, headers) {
  // ── 1. 어드민 인증 확인 ─────────────────────────────────
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }

  try {
    // ── 2. 최신 크롤링 날짜 조회 ────────────────────────────
    // date='manual'(수동 고정 데이터)은 날짜 비교 대상에서 제외하고,
    // 실제 크롤링 날짜 중 가장 최근 값을 기준으로 삼는다.
    const latestDateRow = await env.DB.prepare(
      `SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'`
    ).first();

    // 데이터가 없을 때 예외 처리
    if (!latestDateRow || !latestDateRow.latest_date) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "rankings 테이블에 유효한 크롤링 데이터가 없습니다.",
        }),
        { status: 404, headers }
      );
    }

    const latestDate = latestDateRow.latest_date;

    // ── 3. RankScore × PlatformWeight 계산 (SQL 윈도우 함수 활용) ──
    // - date = 최신 크롤링 날짜 OR date = 'manual'(수동 고정 데이터도 포함)
    // - tmdb_id가 없는 행(TMDB 매칭 실패)은 제외
    // - 같은 tmdb_id가 여러 플랫폼/카테고리에 걸쳐 있으면
    //   "가중치 적용 후 점수"가 가장 높은 행 1개만 채택
    const weightedQuery = `
      WITH target_rankings AS (
        SELECT r.tmdb_id, r.platform, r.rank, r.title_ko,
               COALESCE(oc.hot100_weight, 0.5) AS category_weight
        FROM rankings r
        JOIN ott_categories oc
          ON oc.platform = r.platform
         AND oc.category_slot = r.category_slot
        WHERE r.tmdb_id IS NOT NULL
          AND r.date = ?
          AND oc.hot100_eligible = 1
      ),
      weighted AS (
        SELECT
          tr.tmdb_id,
          tr.platform,
          tr.rank,
          tr.title_ko,
          CASE WHEN tr.rank <= 20 THEN (100 - (tr.rank - 1) * 5) ELSE 0 END AS rank_score,
          tr.category_weight AS platform_weight,
          CASE WHEN tr.rank <= 20 THEN (100 - (tr.rank - 1) * 5) ELSE 0 END
            * tr.category_weight AS weighted_score,
          ROW_NUMBER() OVER (
            PARTITION BY tr.tmdb_id
            ORDER BY
              (CASE WHEN tr.rank <= 20 THEN (100 - (tr.rank - 1) * 5) ELSE 0 END)
              * tr.category_weight DESC
          ) AS rn
        FROM target_rankings tr
      )
      SELECT
        w.tmdb_id,
        w.platform AS best_platform,
        w.rank AS best_rank,
        w.rank_score,
        w.platform_weight,
        w.weighted_score,
        COALESCE(ab.boost_value, 0) AS admin_boost
      FROM weighted w
      LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
      WHERE w.rn = 1
      ORDER BY (w.weighted_score + COALESCE(ab.boost_value, 0)) DESC
    `;

    const { results } = await env.DB.prepare(weightedQuery).bind(latestDate).all();

    // 로우 배열 예외 처리 — 계산할 데이터가 없는 경우
    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "계산할 랭킹 데이터가 없습니다." }),
        { status: 404, headers }
      );
    }

    // ── 4. hot100_scores 테이블 전체 재계산(덮어쓰기) ─────────
    // KST 기준 현재 시각 (UTC + 9시간)
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // 기존 데이터 전체 삭제 + 신규 데이터 삽입을 하나의 배치로 묶음
    const statements = [env.DB.prepare(`DELETE FROM hot100_scores`)];

    for (const row of results) {
      const totalScore = row.weighted_score + row.admin_boost;
      statements.push(
        env.DB.prepare(
          `INSERT INTO hot100_scores
            (tmdb_id, calc_date, best_platform, platform_weight,
             rank_score, weighted_rank_score, engagement_score,
             admin_boost, total_score, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
        ).bind(
          row.tmdb_id,
          latestDate,
          row.best_platform,
          row.platform_weight,
          row.rank_score,
          row.weighted_score,
          row.admin_boost,
          totalScore,
          nowKst
        )
      );
    }

    // env.DB.batch() — 여러 쿼리를 한 번의 네트워크 왕복으로 처리 (트랜잭션처럼 묶임)
    await env.DB.batch(statements);

    // ── 5. 결과 응답 ─────────────────────────────────────────
    return new Response(
      JSON.stringify({
        ok: true,
        calc_date: latestDate,
        total_works: results.length,
        top10_preview: results.slice(0, 10).map((r) => ({
          tmdb_id: r.tmdb_id,
          best_platform: r.best_platform,
          best_rank: r.best_rank,
          total_score: r.weighted_score + r.admin_boost,
        })),
      }),
      { status: 200, headers }
    );
  } catch (err) {
    // ── 예외 처리 ────────────────────────────────────────────
    console.error("calcHot100 오류:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "HOT100 계산 중 오류가 발생했습니다.",
        detail: err.message,
      }),
      { status: 500, headers }
    );
  }
}

/**
 * GET /admin/hot100/boosts
 * 현재 설정된 admin_boosts 전체 목록 (작품 정보 조인)
 */
export async function listAdminBoosts(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT ab.tmdb_id, ab.boost_value, ab.reason, ab.updated_at,
              w.title_ko, w.poster_path
       FROM admin_boosts ab
       LEFT JOIN works w ON w.tmdb_id = ab.tmdb_id
       ORDER BY ab.updated_at DESC`
    ).all();
    return new Response(
      JSON.stringify({ ok: true, data: results || [] }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}

/**
 * GET /admin/hot100/boosts/search?q=검색어
 * works에서 제목으로 작품 검색 (부스트 설정 대상 찾기용)
 */
export async function searchWorksForBoost(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();

    if (!q) {
      return new Response(
        JSON.stringify({ ok: true, data: [] }),
        { status: 200, headers }
      );
    }

    const { results } = await env.DB.prepare(
      `SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path,
              COALESCE(ab.boost_value, 0) AS boost_value
       FROM works w
       LEFT JOIN admin_boosts ab ON ab.tmdb_id = w.tmdb_id
       WHERE w.title_ko LIKE ? OR w.title_en LIKE ? OR w.tmdb_id = ?
       ORDER BY w.tmdb_id DESC
       LIMIT 20`
    ).bind(`%${q}%`, `%${q}%`, parseInt(q, 10) || 0).all();

    return new Response(
      JSON.stringify({ ok: true, data: results || [] }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}

/**
 * POST /admin/hot100/boosts
 * body: { tmdb_id, boost_value, reason }
 * 특정 작품의 수동 부스트 값을 등록/갱신 (있으면 UPDATE, 없으면 INSERT)
 */
export async function upsertAdminBoost(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const body = await request.json();
    const { tmdb_id, boost_value, reason } = body;

    if (!tmdb_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "tmdb_id가 필요합니다." }),
        { status: 400, headers }
      );
    }

    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await env.DB.prepare(
      `INSERT INTO admin_boosts (tmdb_id, boost_value, reason, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         boost_value = excluded.boost_value,
         reason = excluded.reason,
         updated_at = excluded.updated_at`
    ).bind(tmdb_id, boost_value || 0, reason || null, nowKst).run();

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}

/**
 * DELETE /admin/hot100/boosts/:tmdb_id
 * 수동 부스트 삭제 (0으로 리셋하는 대신 행 자체를 제거)
 */
export async function deleteAdminBoost(tmdbId, request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    await env.DB.prepare(`DELETE FROM admin_boosts WHERE tmdb_id = ?`)
      .bind(tmdbId)
      .run();
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}

/**
 * GET /hot100
 * ─────────────────────────────────────────────
 * 공개 조회 API — 계산된 HOT100 점수를 순위대로 반환.
 * 동점 처리: total_score 동점 시 works.tmdb_rating 내림차순 2차 정렬.
 */
export async function getHot100(request, env, headers) {
  try {
    const url = new URL(request.url);
    // limit 파라미터 안전 처리 (최대 100 고정)
    const limitParam = parseInt(url.searchParams.get("limit") || "100", 10);
    const limit = Number.isNaN(limitParam) ? 100 : Math.min(limitParam, 100);

    const query = `
      SELECT
        h.tmdb_id,
        h.best_platform,
        h.total_score,
        h.rank_score,
        h.platform_weight,
        h.engagement_score,
        h.admin_boost,
        h.calc_date,
        w.title_ko,
        w.title_en,
        w.poster_path,
        w.media_type,
        w.tmdb_rating,
        w.release_year
      FROM hot100_scores h
      LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
      ORDER BY h.total_score DESC, w.tmdb_rating DESC
      LIMIT ?
    `;

    const { results } = await env.DB.prepare(query).bind(limit).all();

    // 데이터가 없을 때(results가 null이거나 빈 배열) 예외 처리
    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: results.map((row, idx) => ({
          hot_rank: idx + 1,
          ...row,
        })),
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("getHot100 오류:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "HOT100 조회 중 오류가 발생했습니다.",
        detail: err.message,
      }),
      { status: 500, headers }
    );
  }
}
