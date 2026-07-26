// 2026-07-26 rev.2 — hot100.js (ott_keys 로고 표시 순서 고정 — 쿠팡플레이를 항상 맨 마지막으로)
// ─────────────────────────────────────────────────────────
// HOT100 랭킹 점수 계산 라우트
// RankScore × PlatformWeight + AdminBoost 기반
// (EngagementScore/검색어 점수는 추후 네이버 데이터랩 연동 시 추가 예정,
//  현재는 컬럼만 만들어두고 항상 0으로 저장)
//
// [2026-07-11 추가] 프론트엔드 구성(hot100_frontend_tabs) 관련:
//   GET   /admin/hot100/frontend-tabs
//   PATCH /admin/hot100/frontend-tabs/:platform
//   GET   /hot100/hero-tabs  ← 공개 API, 어드민 미리보기 + 실제 메인페이지가 같이 씀
// ─────────────────────────────────────────────────────────

import { _checkAuth } from "../utils/authUtils.js";
import { _mergeRankings } from "./rankings.js";

/**
 * TMDB 로고 이미지 1건 조회 — admin.js의 collect-keywords와 완전히 동일한 방식으로
 * TMDB 공식 서버를 직접 호출한다(브라우저용 tmdb-proxy 아님. Worker끼리는 이 방식만 검증됨).
 * 한국어(ko) 로고 우선, 없으면 언어정보 없는(iso_639_1=null) 로고, 둘 다 없으면 null.
 * ⚠️ "TMDB 응답 실패"와 "TMDB에 로고가 진짜 없음"을 구분해서 반환한다(collect-keywords의
 * anySuccess 플래그와 동일 원칙) — 실패했을 때 ok:false를 줘야 호출부가
 * hero_logo_checked_at을 찍지 않고 다음 배치에서 재시도할 수 있다.
 * media_type을 모를 때는 collect-keywords와 동일하게 tv → movie 순서로 둘 다 시도한다.
 */
async function _fetchHeroLogoResult(tmdbId, knownMediaType, env) {
  const mtypes = knownMediaType ? [knownMediaType] : ["tv", "movie"];
  let anySuccess = false;

  for (const mtype of mtypes) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/${mtype}/${tmdbId}/images?api_key=${env.TMDB_API_KEY}`
      );
      if (!res.ok) continue; // 이 media_type 실패 — 다음 타입 시도(anySuccess는 그대로)
      anySuccess = true;
      const json = await res.json();
      const logos = json.logos || [];
      const best =
        logos.find((l) => l.iso_639_1 === "ko") ||
        logos.find((l) => !l.iso_639_1) ||
        null;
      if (best) return { ok: true, logoPath: best.file_path };
      // 이 media_type엔 로고가 없음 — 나머지 media_type도 마저 시도
    } catch (e) {
      // 네트워크 오류 — 다음 media_type으로 계속 시도
    }
  }

  // 모든 media_type을 다 시도한 결과
  return { ok: anySuccess, logoPath: null };
}

/**
 * 히어로 캐러셀 로고 자동 백필 — 최대 limit개까지 처리.
 * ─────────────────────────────────────────────
 * 대상 = hot100_scores(=calcHot100이 계산에 사용한 작품 전체)에 속하면서
 *   - hero_title_baked_in = 0  (이미지 자체에 이미 제목이 있는 건 로고/텍스트 오버레이 자체를 안 쓰므로 제외)
 *   - hero_logo_checked_at IS NULL  (아직 한 번도 TMDB 로고 유무를 확인 안 해본 것만, 중복 조회 방지)
 *
 * TMDB 응답 실패 건은 checked_at을 찍지 않고 건너뛰어 다음 배치에서 자동 재시도되게 둔다.
 * calcHot100(소량 자동) / backfillHeroLogos(관리자 수동, 대량) 양쪽에서 공용으로 사용.
 */
async function _backfillHeroLogosBatch(env, limit) {
  const { results: targets } = await env.DB.prepare(
    `SELECT w.tmdb_id, w.media_type
     FROM hot100_scores h
     JOIN works w ON w.tmdb_id = h.tmdb_id
     WHERE COALESCE(w.hero_title_baked_in, 0) = 0
       AND w.hero_logo_checked_at IS NULL
     LIMIT ?`
  )
    .bind(limit)
    .all();

  if (!targets || targets.length === 0) {
    return { processed: 0, found: 0, failed: 0 };
  }

  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  let found = 0;
  let failed = 0;
  const statements = [];

  for (const t of targets) {
    // media_type을 이미 알면 그대로, 모르면(구작 데이터) 함수 내부에서 tv/movie 둘 다 시도
    const result = await _fetchHeroLogoResult(t.tmdb_id, t.media_type || null, env);

    if (!result.ok) {
      failed++;
      continue; // checked_at 안 찍음 → 다음 배치에서 재시도
    }

    if (result.logoPath) found++;

    statements.push(
      env.DB.prepare(
        `UPDATE works SET hero_logo_path = ?, hero_logo_checked_at = ? WHERE tmdb_id = ?`
      ).bind(result.logoPath, nowKst, t.tmdb_id)
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return { processed: statements.length, found, failed };
}

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
      `SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'`
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
    // - [2026-07-19 수정] 기존엔 모든 플랫폼을 "오늘 날짜(app_settings.latest_ranking_date)"
    //   딱 하나로 고정해서 걸렀는데, 이러면 특정 플랫폼 하루 크롤링이 실패/지연될 때
    //   그 플랫폼 전체가 HOT100 계산에서 통째로 빠져버림(오늘 박스오피스 미반영 사례로 확인됨).
    //   플랫폼+카테고리별로 "각자 가진 가장 최근 날짜"를 찾아서 그 날짜 데이터를 쓰도록 변경.
    //   'manual'은 날짜 컬럼에 들어가는 특수 문자열이라 MAX(date) 계산에서 반드시 제외해야 함
    //   (문자열 비교상 'manual'이 어떤 날짜보다도 커서 안 걸러내면 MAX가 전부 'manual'이 되어버림).
    // - tmdb_id가 없는 행(TMDB 매칭 실패)은 제외
    // - 같은 tmdb_id가 여러 플랫폼/카테고리에 걸쳐 있으면
    //   "가중치 적용 후 점수"가 가장 높은 행 1개만 채택
    const weightedQuery = `
      WITH latest_per_slot AS (
        SELECT platform, category_slot, MAX(date) AS latest_date
        FROM rankings
        WHERE date < 'manual'
        GROUP BY platform, category_slot
      ),
      target_rankings AS (
        SELECT r.tmdb_id, r.platform, r.rank, r.title_ko,
               COALESCE(oc.hot100_weight, 0.5) AS category_weight
        FROM rankings r
        JOIN ott_categories oc
          ON oc.platform = r.platform
         AND oc.category_slot = r.category_slot
        JOIN latest_per_slot lps
          ON lps.platform = r.platform
         AND lps.category_slot = r.category_slot
         AND r.date = lps.latest_date
        WHERE r.tmdb_id IS NOT NULL
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

    const { results } = await env.DB.prepare(weightedQuery).all();

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

    // ── 4-2. 히어로 로고 자동 백필(신규 유입분만, 소량) ─────────
    // 계산할 때마다 전체를 다시 훑지 않고, 아직 확인 안 된 것 중 최대 20개만 처리해서
    // "계산" 버튼 응답이 과도하게 느려지지 않도록 함. 초기 대량 백필(기존에 쌓여있던 물량)은
    // 별도 "🖼 로고 일괄 백필" 버튼(POST /admin/hot100/backfill-logos)에서 처리한다.
    // 실패해도 핫100 계산 자체의 성공 여부에는 영향 주지 않는다.
    let heroLogoBackfill = { processed: 0, found: 0, failed: 0 };
    try {
      heroLogoBackfill = await _backfillHeroLogosBatch(env, 20);
    } catch (e) {
      console.error("calcHot100 로고 백필 오류:", e);
    }

    // ── 5. 결과 응답 ─────────────────────────────────────────
    return new Response(
      JSON.stringify({
        ok: true,
        netflix_overall_saved: netflixOverallSaved,
        calc_date: latestDate,
        total_works: finalRows.length,
        hero_logo_backfill: heroLogoBackfill,
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
        w.hero_custom_image_url,
        w.hero_title_baked_in,
        w.media_type,
        ROUND(w.tmdb_rating, 1) AS tmdb_rating,
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

/**
 * GET /hot100/hero-tabs
 * ─────────────────────────────────────────────
 * 메인페이지 히어로 캐러셀용 공개 조회 API.
 * hot100_frontend_tabs(is_active=1)를 display_order 순으로 돌면서,
 * 'all'은 hot100_scores, 나머지 플랫폼은 그 플랫폼의 지정 카테고리(rankings)를 채워서 반환.
 * ⚠️ 어드민 미리보기("프론트엔드 보기" 버튼)와 실제 메인페이지가 이 API 하나를 그대로 같이 씀 —
 * 나중에 메인페이지 만들 때 새 API 안 만들어도 됨.
 */
export async function getHeroTabs(request, env, headers) {
  try {
    // ⚠️ [2026-07-12 수정] 원래는 프론트가 "노출 켜져있나?"(page-display)를 먼저 물어보고,
    // 그 응답을 받은 뒤에야 이 API를 또 호출하는 2단계 순차 구조였음 — 다른 섹션들(TV/영화 TOP10 등)은
    // 전부 서버가 미리 필터링해서 1번 호출로 끝나는데 HOT100만 유난히 느렸던 진짜 원인이 이 구조였음.
    // page 파라미터를 받으면 이 API 안에서 노출 여부까지 한 번에 확인해서, 꺼져있으면 무거운 계산
    // (탭 7개 × 쿼리) 자체를 아예 안 하고 바로 반환 — 프론트는 이제 이 API 딱 1번만 호출하면 됨.
    // page 파라미터 없이 호출(예: hot100_preview.html의 관리자 미리보기)하면 예전처럼 그대로 동작.
    const url  = new URL(request.url);
    const page = url.searchParams.get("page");

    const TAB_CONFIGS_SQL = `
      SELECT platform, category_slot, top_n, display_order
      FROM hot100_frontend_tabs
      WHERE is_active = 1
      ORDER BY display_order ASC
    `;

    let tabConfigsResults;
    if (page) {
      // [2026-07-17 수정] displayRow 확인(①)과 tabConfigs 조회(②)가 서로 의존관계 없는
      // 별개 쿼리인데도 순서대로 await되고 있었음(왕복 2회). 메인페이지 실측 시
      // 이 API가 660ms 걸렸고, 그중 상당 부분이 이 불필요한 순차 왕복이었음.
      // batch로 묶어서 한 번의 왕복으로 처리 — 노출이 꺼져있는 드문 경우엔 tabConfigs
      // 결과를 그냥 버리게 되지만, 같은 왕복 안에서 이미 받아온 것이라 추가 비용 없음.
      const [displayRes, tabConfigsRes] = await env.DB.batch([
        env.DB.prepare(`SELECT is_active FROM hot100_page_display WHERE page = ?`).bind(page),
        env.DB.prepare(TAB_CONFIGS_SQL),
      ]);
      const displayRow = displayRes.results[0] || null;
      if (!displayRow || !displayRow.is_active) {
        return new Response(
          JSON.stringify({ ok: true, active: false, tabs: [] }),
          { status: 200, headers }
        );
      }
      tabConfigsResults = tabConfigsRes.results;
    } else {
      const { results } = await env.DB.prepare(TAB_CONFIGS_SQL).all();
      tabConfigsResults = results;
    }

    const PLATFORM_LABELS = {
      all: "전체 순위", netflix: "넷플릭스", tving: "티빙", disney: "디즈니+",
      coupang: "쿠팡플레이", wavve: "웨이브", boxoffice: "박스오피스",
    };

    const tabConfigs = tabConfigsResults;

    if (!tabConfigs || tabConfigs.length === 0) {
      return new Response(JSON.stringify({ ok: true, active: true, tabs: [] }), { status: 200, headers });
    }

    // ⚠️ [2026-07-12 재수정] Promise.all은 "동시에 쏘긴" 하지만 D1 입장에서는 여전히 최대 13개의
    // 개별 왕복(요청)임. env.DB.batch()로 묶으면 여러 쿼리를 물리적으로 한 번의 네트워크 왕복으로
    // 처리할 수 있어서 구조적으로 더 빠름(이미 다른 곳(calcHot100)에서 검증된 방식과 동일 원리).
    // tabConfigs를 순회하며 필요한 쿼리들을 하나의 배열에 순서대로 쌓아두고, batch 실행 후
    // 같은 순서로 다시 꺼내서 매칭한다 — 쿼리 개수가 탭마다 다르므로(전체=1개, 플랫폼=2개)
    // 포인터(bi)로 정확히 짚어가며 소비.
    const statements = [];
    for (const cfg of tabConfigs) {
      const limit = cfg.top_n || 10;

      if (cfg.platform === "all") {
        statements.push(
          env.DB.prepare(
            `SELECT h.tmdb_id, h.best_platform, w.title_ko, w.title_en,
                    w.poster_path, w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                    w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
             FROM hot100_scores h
             LEFT JOIN works w ON w.tmdb_id = h.tmdb_id
             ORDER BY h.total_score DESC
             LIMIT ?`
          ).bind(limit)
        );
        continue;
      }

      if (!cfg.category_slot) continue; // 카테고리 미지정이면 스킵(설정 누락 방어) — 쿼리 자체를 안 쌓음

      statements.push(
        env.DB.prepare(
          `SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                  w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                  w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM rankings r
           LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
           WHERE r.platform = ? AND r.category_slot = ?
             AND r.date = (
               SELECT MAX(date) FROM rankings
               WHERE platform = ? AND category_slot = ? AND date < 'manual'
             )
           ORDER BY r.rank ASC`
        ).bind(cfg.platform, cfg.category_slot, cfg.platform, cfg.category_slot)
      );
      statements.push(
        env.DB.prepare(
          `SELECT r.rank, r.tmdb_id, r.title_ko, r.title_en, r.poster_path,
                  w.hero_backdrop_path, w.hero_custom_image_url, w.hero_title_baked_in,
                  w.hero_logo_path, w.media_type, ROUND(w.tmdb_rating, 1) AS tmdb_rating
           FROM rankings r
           LEFT JOIN works w ON w.tmdb_id = r.tmdb_id
           WHERE r.platform = ? AND r.category_slot = ? AND r.is_manual = 1 AND r.date = 'manual'
           ORDER BY r.rank ASC`
        ).bind(cfg.platform, cfg.category_slot)
      );
    }

    const batchResults = statements.length ? await env.DB.batch(statements) : [];

    let bi = 0; // batchResults 소비 포인터 — statements를 쌓은 순서와 정확히 같은 순서로 다시 훑는다
    const tabs = [];
    for (const cfg of tabConfigs) {
      const limit = cfg.top_n || 10;

      if (cfg.platform === "all") {
        const results = batchResults[bi++]?.results || [];
        tabs.push({
          platform: "all",
          label: PLATFORM_LABELS.all,
          items: results.map((row, idx) => ({
            rank: idx + 1, tmdb_id: row.tmdb_id, best_platform: row.best_platform,
            title_ko: row.title_ko, title_en: row.title_en,
            poster_path: row.poster_path, hero_backdrop_path: row.hero_backdrop_path,
            hero_custom_image_url: row.hero_custom_image_url,
            hero_title_baked_in: row.hero_title_baked_in,
            hero_logo_path: row.hero_logo_path,
            media_type: row.media_type, tmdb_rating: row.tmdb_rating,
          })),
        });
        continue;
      }

      if (!cfg.category_slot) continue; // 위에서 쿼리 자체를 안 쌓았으므로 bi도 그대로 둠

      const crawlResults  = batchResults[bi++]?.results || [];
      const manualResults = batchResults[bi++]?.results || [];
      const merged = _mergeRankings(crawlResults, manualResults, limit);

      tabs.push({
        platform: cfg.platform,
        label: PLATFORM_LABELS[cfg.platform] || cfg.platform,
        items: merged.map((row) => ({
          rank: row.rank, tmdb_id: row.tmdb_id, best_platform: cfg.platform,
          title_ko: row.title_ko, title_en: row.title_en,
          poster_path: row.poster_path, hero_backdrop_path: row.hero_backdrop_path,
          hero_custom_image_url: row.hero_custom_image_url,
          hero_title_baked_in: row.hero_title_baked_in,
          hero_logo_path: row.hero_logo_path,
          media_type: row.media_type, tmdb_rating: row.tmdb_rating,
        })),
      });
    }

    // [2026-07-21 추가] 각 작품이 서비스중인 OTT 전체 목록(ott_keys) — 지금까지는 best_platform(1위
    // 플랫폼) 하나만 내려줘서 메인페이지 카드에 텍스트 뱃지 1개만 표시됐는데, 검색결과 페이지처럼
    // "서비스중인 OTT 전부"를 원형 로고로 보여주려면 work_ott 테이블 조회가 추가로 필요함.
    // 탭 전체(최대 7개 × 최대 12개)의 tmdb_id를 한 번에 모아 조회 1번으로 처리 — 탭마다 따로 안 물어봄.
    // D1 바인딩 변수 100개 제한 방어를 위해 100개씩 끊어서 조회(현재 규모론 사실상 1번이면 끝남).
    const allTmdbIds = [...new Set(tabs.flatMap(t => t.items.map(it => it.tmdb_id)).filter(Boolean))];
    const ottMap = {};
    for (let i = 0; i < allTmdbIds.length; i += 100) {
      const chunk = allTmdbIds.slice(i, i + 100);
      const placeholders = chunk.map(() => "?").join(",");
      const { results: ottRows } = await env.DB.prepare(
        `SELECT tmdb_id, ott_key FROM work_ott WHERE tmdb_id IN (${placeholders})`
      ).bind(...chunk).all();
      ottRows.forEach((r) => { (ottMap[r.tmdb_id] ||= []).push(r.ott_key); });
    }
    // [2026-07-26 추가] 로고 표시 순서 고정 — 원래는 D1에서 나온 순서 그대로라 뒤죽박죽이었음.
    // 쿠팡플레이는 관리자 요청으로 항상 맨 마지막에 오도록 함. 목록에 없는 새 OTT가 나중에
    // 생기면 순서 지정 없이 맨 뒤에 자연스럽게 붙음(대상에서 빠지는 일 없이 안전).
    const OTT_DISPLAY_ORDER = ["netflix", "tving", "wavve", "disney", "watcha", "coupang"];
    const _ottRank = (key) => {
      const idx = OTT_DISPLAY_ORDER.indexOf(key);
      return idx === -1 ? OTT_DISPLAY_ORDER.length : idx;
    };
    Object.values(ottMap).forEach((keys) => keys.sort((a, b) => _ottRank(a) - _ottRank(b)));
    tabs.forEach((t) => t.items.forEach((it) => { it.ott_keys = ottMap[it.tmdb_id] || []; }));

    return new Response(JSON.stringify({ ok: true, active: true, tabs }), { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "히어로 탭 조회 중 오류가 발생했습니다.", detail: err.message }),
      { status: 500, headers }
    );
  }
}

/**
 * POST /admin/hot100/backfill-logos
 * body: { limit? } — 기본 30, 최대 50
 * "🖼 로고 일괄 백필" 버튼에서 호출. 한 번에 limit개씩 처리하고 남은 개수를 같이 반환 —
 * 다 채워질 때까지 관리자가 버튼을 반복 클릭하는 방식(타임아웃 방지용).
 */
export async function backfillHeroLogos(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    let limit = 30;
    try {
      const body = await request.json();
      if (body && body.limit) {
        limit = Math.min(Math.max(parseInt(body.limit, 10) || 30, 1), 50);
      }
    } catch (e) {
      // body가 없어도 기본값(30)으로 그냥 진행
    }

    const result = await _backfillHeroLogosBatch(env, limit);

    const remainingRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt
       FROM hot100_scores h
       JOIN works w ON w.tmdb_id = h.tmdb_id
       WHERE COALESCE(w.hero_title_baked_in, 0) = 0
         AND w.hero_logo_checked_at IS NULL`
    ).first();

    return new Response(
      JSON.stringify({ ok: true, ...result, remaining: remainingRow?.cnt ?? 0 }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "로고 백필 중 오류가 발생했습니다.",
        detail: err.message,
      }),
      { status: 500, headers }
    );
  }
}

/**
 * GET /admin/hot100/backfill-logos/status
 * 아직 로고 확인 안 된 남은 개수만 조회 — 버튼 누르기 전 화면에 미리 표시용.
 */
export async function getBackfillLogoStatus(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt
       FROM hot100_scores h
       JOIN works w ON w.tmdb_id = h.tmdb_id
       WHERE COALESCE(w.hero_title_baked_in, 0) = 0
         AND w.hero_logo_checked_at IS NULL`
    ).first();
    return new Response(
      JSON.stringify({ ok: true, remaining: row?.cnt ?? 0 }),
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
 * GET /admin/hot100/page-display
 * 어느 페이지(메인/인물)에 HOT100 캐러셀을 노출할지 설정 — 딱 2줄(main, person)만 존재
 */
export async function listHot100PageDisplay(request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT page, is_active FROM hot100_page_display ORDER BY page ASC`
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
 * PATCH /admin/hot100/page-display/:page
 * body: { is_active }
 * page는 이미 시드로 채워진 고정 2행(main/person) 중 하나만 수정(생성/삭제 없음)
 */
export async function updateHot100PageDisplay(page, request, env, headers) {
  const isAuthed = await _checkAuth(request, env);
  if (!isAuthed) {
    return new Response(
      JSON.stringify({ ok: false, error: "관리자 인증이 필요합니다." }),
      { status: 401, headers }
    );
  }
  try {
    const body = await request.json();
    const { is_active } = body;

    await env.DB.prepare(
      `UPDATE hot100_page_display SET is_active = ? WHERE page = ?`
    ).bind(is_active ? 1 : 0, page).run();

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}

/**
 * GET /hot100/page-display?page=main
 * 공개 조회 — index.html/person.html이 캐러셀을 그릴지 말지 방문 시 확인하는 용도.
 * 인증 불필요(누구나 조회 가능한 단순 표시 설정값).
 */
export async function getHot100PageDisplay(request, env, headers) {
  try {
    const url = new URL(request.url);
    const page = url.searchParams.get("page");
    if (!page) {
      return new Response(
        JSON.stringify({ ok: false, error: "page 파라미터가 필요합니다." }),
        { status: 400, headers }
      );
    }
    const row = await env.DB.prepare(
      `SELECT is_active FROM hot100_page_display WHERE page = ?`
    ).bind(page).first();
    return new Response(
      JSON.stringify({ ok: true, is_active: !!(row && row.is_active) }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}
