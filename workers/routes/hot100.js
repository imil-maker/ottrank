// ─────────────────────────────────────────────────────────
// HOT100 랭킹 점수 계산 라우트
// RankScore × PlatformWeight + AdminBoost 기반
// (EngagementScore/검색어 점수는 추후 네이버 데이터랩 연동 시 추가 예정,
//  현재는 컬럼만 만들어두고 항상 0으로 저장)
//
// [2026-07-11 추가] 프론트엔드 구성(hot100_frontend_tabs) 관련:
//   GET   /admin/hot100/frontend-tabs
//   PATCH /admin/hot100/frontend-tabs/:platform
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

    // ── 3-1. admin_boosts 전체 조회 ──
    // is_pinned=1(고정) → 랭킹 유무 상관없이 pinned_score를 그대로 최종 점수로 사용(크롤링 반영 안 됨)
    // is_pinned=0인데 boost_value≠0 → "랭킹없는 작품 고정" 탭에서 점수만 부여한 경우.
    //   고정이 아니므로 매번 재계산 시 boost_value를 그대로 반영(살아있는 값), 나중에 크롤링으로
    //   실제 랭킹이 잡히면 자동으로 그 위에 합산되는 원래 부스트 동작으로 자연스럽게 전환됨.
    const { results: boostRows } = await env.DB.prepare(
      `SELECT tmdb_id, boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts`
    ).all();
    const boostMap = new Map((boostRows || []).map((b) => [b.tmdb_id, b]));

    // 로우 배열 예외 처리 — 크롤링 랭킹도 없고 부스트/고정 항목도 없는 경우만 에러
    if ((!results || results.length === 0) && boostMap.size === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "계산할 랭킹 데이터가 없습니다." }),
        { status: 404, headers }
      );
    }

    // ── 3-2. 크롤링 결과 + 부스트/고정 항목 병합 ──
    const finalRows = [];
    const seenTmdbIds = new Set();

    for (const row of results || []) {
      seenTmdbIds.add(row.tmdb_id);
      const b = boostMap.get(row.tmdb_id);
      if (b && b.is_pinned) {
        // 고정된 작품 — 크롤링 결과가 있어도 무시하고 pinned_score로 덮어씀
        finalRows.push({
          tmdb_id: row.tmdb_id,
          best_platform: b.pinned_platform || row.best_platform,
          best_rank: row.best_rank,
          rank_score: 0,
          platform_weight: 0,
          weighted_score: 0,
          admin_boost: b.pinned_score ?? 0,
        });
      } else {
        // 고정 아님 — weightedQuery의 SQL이 이미 boost_value를 admin_boost로 합산해 옴, 그대로 사용
        finalRows.push(row);
      }
    }
    for (const [tmdbId, b] of boostMap) {
      if (seenTmdbIds.has(tmdbId)) continue; // 크롤링 랭킹이 있는 작품은 위에서 이미 처리됨
      if (b.is_pinned) {
        // 랭킹 없이 고정만 된 작품(개봉 전 강제 편입 등)
        finalRows.push({
          tmdb_id: tmdbId,
          best_platform: b.pinned_platform || "manual",
          best_rank: null,
          rank_score: 0,
          platform_weight: 0,
          weighted_score: 0,
          admin_boost: b.pinned_score ?? 0,
        });
      } else if (b.boost_value) {
        // 랭킹은 없지만 점수(부스트)만 부여된 작품 — 고정 아니므로 boost_value가 바뀌면 다음 재계산에 그대로 반영됨
        finalRows.push({
          tmdb_id: tmdbId,
          best_platform: b.pinned_platform || "manual",
          best_rank: null,
          rank_score: 0,
          platform_weight: 0,
          weighted_score: 0,
          admin_boost: b.boost_value,
        });
      }
    }
    // 점수 내림차순 재정렬 (top10_preview, DB 저장 순서용 — 정렬 자체가 결과에 영향 없지만 일관성 유지)
    finalRows.sort(
      (a, b) => b.weighted_score + b.admin_boost - (a.weighted_score + a.admin_boost)
    );

    // ── 4. hot100_scores 테이블 전체 재계산(덮어쓰기) ─────────
    // KST 기준 현재 시각 (UTC + 9시간)
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // 기존 데이터 전체 삭제 + 신규 데이터 삽입을 하나의 배치로 묶음
    const statements = [env.DB.prepare(`DELETE FROM hot100_scores`)];

    for (const row of finalRows) {
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

    // ── 4-1. 넷플릭스 통합랭킹(category10) 저장 ─────────────
    // 넷플릭스는 FlixPatrol에 "통합(Overall)" 표 자체가 없어서, 다른 플랫폼처럼 그대로 크롤링해
    // 올 수가 없다. 그래서 핫100 계산 결과(finalRows) 중 best_platform='netflix'인 것만 추려서
    // rankings 테이블에 category10으로 저장 — 메인페이지는 다른 플랫폼 통합랭킹과 동일한 방식으로
    // 그대로 가져다 쓸 수 있음. 재계산할 때마다 그날 기존 category10 데이터를 지우고 새로 채운다
    // (누적 방지). rankings 스키마엔 title_ko/poster_path 등이 필요한데 hot100_scores엔 없어서
    // works에서 별도로 조회해서 채운다.
    const netflixTop = finalRows
      .filter((r) => r.best_platform === "netflix")
      .slice(0, 20);

    let netflixOverallSaved = 0;
    if (netflixTop.length > 0) {
      const tmdbIds = netflixTop.map((r) => r.tmdb_id);
      const placeholders = tmdbIds.map(() => "?").join(",");
      const { results: workRows } = await env.DB.prepare(
        `SELECT tmdb_id, title_ko, title_en, poster_path, genre, tmdb_rating, release_year
         FROM works WHERE tmdb_id IN (${placeholders})`
      ).bind(...tmdbIds).all();
      const workMap = new Map((workRows || []).map((w) => [w.tmdb_id, w]));

      const rankingStatements = [
        env.DB.prepare(
          `DELETE FROM rankings WHERE platform = 'netflix' AND category_slot = 'category10' AND date = ?`
        ).bind(latestDate),
      ];
      netflixTop.forEach((row, idx) => {
        const w = workMap.get(row.tmdb_id) || {};
        rankingStatements.push(
          env.DB.prepare(
            `INSERT INTO rankings
              (platform, category_slot, category, date, rank, tmdb_id,
               title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
               is_manual, source_name)
             VALUES ('netflix', 'category10', 'category10', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'HOT100 기반 통합랭킹')`
          ).bind(
            latestDate,
            idx + 1,
            row.tmdb_id,
            w.title_ko || "",
            w.title_en || "",
            w.poster_path || null,
            w.release_year || null,
            w.genre || null,
            w.tmdb_rating || null
          )
        );
      });
      await env.DB.batch(rankingStatements);
      netflixOverallSaved = netflixTop.length;
    }

    // ── 5. 결과 응답 ─────────────────────────────────────────
    return new Response(
      JSON.stringify({
        ok: true,
        netflix_overall_saved: netflixOverallSaved,
        calc_date: latestDate,
        total_works: finalRows.length,
        top10_preview: finalRows.slice(0, 10).map((r) => ({
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
      `SELECT ab.tmdb_id, ab.boost_value, ab.reason, ab.is_pinned, ab.pinned_score, ab.pinned_platform, ab.updated_at,
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
              COALESCE(ab.boost_value, 0) AS boost_value,
              COALESCE(ab.is_pinned, 0) AS is_pinned,
              ab.pinned_score,
              ab.pinned_platform
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
    const { tmdb_id, boost_value, reason, is_pinned, pinned_score, pinned_platform } = body;

    if (!tmdb_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "tmdb_id가 필요합니다." }),
        { status: 400, headers }
      );
    }

    // ⚠️ 요청 body에 필드가 아예 없으면(undefined) 기존 값을 유지한다 — 예를 들어
    // "해제"(is_pinned:false만 보냄) 요청이 boost_value/pinned_platform을 실수로
    // 0/null로 초기화하지 않도록 방어. pinned_score/pinned_platform은 is_pinned=0이어도
    // 지우지 않고 남겨둔다 (계산에는 is_pinned=1일 때만 쓰이므로 남아있어도 안전, 나중에
    // 다시 고정할 때 이전 값을 이어서 쓸 수 있음).
    const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);
    let existing = null;
    if (!hasField("boost_value") || !hasField("is_pinned") || !hasField("pinned_score") || !hasField("pinned_platform")) {
      existing = await env.DB.prepare(
        `SELECT boost_value, is_pinned, pinned_score, pinned_platform FROM admin_boosts WHERE tmdb_id = ?`
      ).bind(tmdb_id).first();
    }
    const finalBoostValue     = hasField("boost_value")     ? (boost_value || 0)       : (existing?.boost_value ?? 0);
    const finalIsPinned       = hasField("is_pinned")       ? (is_pinned ? 1 : 0)      : (existing?.is_pinned || 0);
    const finalPinnedScore    = hasField("pinned_score")    ? (pinned_score ?? 0)      : (existing?.pinned_score ?? null);
    const finalPinnedPlatform = hasField("pinned_platform") ? (pinned_platform || null) : (existing?.pinned_platform ?? null);

    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await env.DB.prepare(
      `INSERT INTO admin_boosts (tmdb_id, boost_value, reason, is_pinned, pinned_score, pinned_platform, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         boost_value = excluded.boost_value,
         reason = excluded.reason,
         is_pinned = excluded.is_pinned,
         pinned_score = excluded.pinned_score,
         pinned_platform = excluded.pinned_platform,
         updated_at = excluded.updated_at`
    ).bind(
      tmdb_id,
      finalBoostValue,
      reason || null,
      finalIsPinned,
      finalPinnedScore,
      finalPinnedPlatform,
      nowKst
    ).run();

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
        COALESCE(ab.is_pinned, 0) AS is_pinned,
        w.title_ko,
        w.title_en,
        w.poster_path,
        w.hero_backdrop_path,
        w.media_type,
        w.tmdb_rating,
        w.release_year
      FROM hot100_scores h
      LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
      LEFT JOIN admin_boosts ab ON ab.tmdb_id = h.tmdb_id
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

/**
 * GET /admin/hot100/frontend-tabs
 * 메인페이지 히어로 캐러셀 탭 구성(hot100_frontend_tabs) 7개 행 전체 조회
 */
export async function listFrontendTabs(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT platform, category_slot, top_n, display_order, is_active
       FROM hot100_frontend_tabs
       ORDER BY display_order ASC`
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
 * PATCH /admin/hot100/frontend-tabs/:platform
 * body: { category_slot, top_n, display_order, is_active }
 * platform은 이미 시드로 다 채워져 있는 고정 7개 행 중 하나만 수정(생성/삭제 없음)
 */
export async function updateFrontendTab(platform, request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const body = await request.json();
    const { category_slot, top_n, display_order, is_active } = body;

    await env.DB.prepare(
      `UPDATE hot100_frontend_tabs SET
         category_slot = COALESCE(?, category_slot),
         top_n         = COALESCE(?, top_n),
         display_order = COALESCE(?, display_order),
         is_active     = COALESCE(?, is_active)
       WHERE platform = ?`
    ).bind(
      category_slot ?? null,
      top_n ?? null,
      display_order ?? null,
      is_active ?? null,
      platform
    ).run();

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
