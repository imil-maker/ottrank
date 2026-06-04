/* ══════════════════════════════════════════════════════════════
   랭킹 관련 API 라우트
   GET  /rankings
   GET  /rankings/main
   GET  /rankings/platform
   GET  /rankings/weekly
   GET  /rankings/monthly
   GET  /rankings/history
   GET  /rankings/platforms/:tmdb_id
   GET  /rankings/manual/:tmdb_id
   GET  /latest-date
   GET  /platforms
══════════════════════════════════════════════════════════════ */

export async function handleRankings(path, request, env, url, headers) {

  // ── GET /rankings ─────────────────────────────────────────
  if (path === "/rankings" && request.method === "GET") {
    const platform = url.searchParams.get("platform");
    const category = url.searchParams.get("category");
    const date     = url.searchParams.get("date");

    let query  = "SELECT * FROM rankings WHERE 1=1";
    const params = [];

    if (platform) { query += " AND platform = ?"; params.push(platform); }
    if (category) { query += " AND category = ?"; params.push(category); }
    if (date)     { query += " AND date = ?";     params.push(date); }
    else { query += " AND date = (SELECT MAX(date) FROM rankings)"; }

    query += " ORDER BY platform, category, rank";

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify({ ok: true, data: results }), { headers });
  }

  // ── GET /rankings/main ───────────────────────────────────────
  // 메인페이지용 랭킹 데이터 (main_section='tv'/'movie' 카테고리)
  if (path === "/rankings/main" && request.method === "GET") {
    try {
      const date = url.searchParams.get("date") || null;

      // 일반 크롤링 랭킹
      const { results: crawlResults } = await env.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = COALESCE(?, (SELECT MAX(date) FROM rankings WHERE date != 'manual'))
          AND r.rank <= oc.main_limit
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).bind(date).all();

      // 수동 랭킹 (date='manual')
      const { results: manualResults } = await env.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = 'manual'
          AND r.rank <= oc.main_limit
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).all();

      const tv = {}, movie = {};

      for (const row of [...crawlResults, ...manualResults]) {
        const key  = `${row.platform}__${row.category_slot}`;
        const item = {
          rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
          tmdb_id: row.tmdb_id, poster_path: row.poster_path,
          genre: row.genre, tmdb_rating: row.tmdb_rating,
          release_year: row.release_year, memo: row.memo || null,
          display_name: row.display_name, platform: row.platform,
          category_slot: row.category_slot, main_order: row.main_order,
        };
        if (row.main_section === "tv") {
          if (!tv[key]) tv[key] = {
            platform: row.platform, category_slot: row.category_slot,
            display_name: row.display_name, main_order: row.main_order,
            memo_label: row.memo_label || null, items: []
          };
          tv[key].items.push(item);
        } else if (row.main_section === "movie") {
          if (!movie[key]) movie[key] = {
            platform: row.platform, category_slot: row.category_slot,
            display_name: row.display_name, main_order: row.main_order,
            memo_label: row.memo_label || null, items: []
          };
          movie[key].items.push(item);
        }
      }

      // 각 슬롯 내부 rank 순 정렬
      for (const key of Object.keys(tv))    tv[key].items.sort((a, b) => a.rank - b.rank);
      for (const key of Object.keys(movie)) movie[key].items.sort((a, b) => a.rank - b.rank);

      const tvList    = Object.values(tv).sort((a, b) => a.main_order - b.main_order);
      const movieList = Object.values(movie).sort((a, b) => a.main_order - b.main_order);

      return new Response(JSON.stringify({ ok: true, tv: tvList, movie: movieList }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/platform ───────────────────────────────────
  // OTT 플랫폼 페이지용 랭킹 데이터
  if (path === "/rankings/platform" && request.method === "GET") {
    try {
      const platform = url.searchParams.get("platform");
      const date     = url.searchParams.get("date") || null;
      if (!platform) {
        return new Response(JSON.stringify({ ok: false, message: "platform required" }), { status: 400, headers });
      }

      // 일반 크롤링 랭킹
      const { results: crawlResults } = await env.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.platform_section, oc.platform_order, oc.platform_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.platform = ?
          AND oc.platform_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = COALESCE(?, (SELECT MAX(date) FROM rankings WHERE date != 'manual'))
          AND r.rank <= oc.platform_limit
        ORDER BY oc.platform_order, r.rank
      `).bind(platform, date).all();

      // 수동 랭킹 (date='manual')
      const { results: manualResults } = await env.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
          oc.display_name, oc.platform_section, oc.platform_order, oc.platform_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.platform = ?
          AND oc.platform_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date = 'manual'
          AND r.rank <= oc.platform_limit
        ORDER BY oc.platform_order, r.rank
      `).bind(platform).all();

      // category_slot별 그룹핑 (크롤링 + 수동 합산)
      const groups = {};
      for (const row of [...crawlResults, ...manualResults]) {
        const key = row.category_slot;
        if (!groups[key]) groups[key] = {
          platform: row.platform, category_slot: row.category_slot,
          display_name: row.display_name, platform_order: row.platform_order,
          memo_label: row.memo_label || null, items: []
        };
        groups[key].items.push({
          rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
          tmdb_id: row.tmdb_id, poster_path: row.poster_path,
          genre: row.genre, tmdb_rating: row.tmdb_rating,
          release_year: row.release_year, memo: row.memo || null,
        });
      }
      // 각 슬롯 내부 rank 순 정렬
      for (const key of Object.keys(groups)) {
        groups[key].items.sort((a, b) => a.rank - b.rank);
      }
      const list = Object.values(groups).sort((a, b) => a.platform_order - b.platform_order);
      return new Response(JSON.stringify({ ok: true, data: list }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/weekly ──────────────────────────────────
  // 최근 7일 누적 랭킹 — 점수제: 1위=10점 ... 10위=1점
  if (path === "/rankings/weekly" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.release_year,
          MAX(r.tmdb_rating) AS tmdb_rating,
          COUNT(*) AS days_in_chart,
          SUM(11 - r.rank) AS score,
          ROW_NUMBER() OVER (
            PARTITION BY r.platform, r.category_slot ORDER BY SUM(11 - r.rank) DESC
          ) AS rank,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-6 days')
          AND r.date != 'manual'
          AND r.rank <= 10
        GROUP BY r.platform, r.category_slot, r.title_ko
        ORDER BY oc.main_section, oc.main_order, rank
      `).all();

      const tv = {}, movie = {};
      for (const row of results) {
        if (row.rank > (row.main_limit || 10)) continue;
        const key  = `${row.platform}__${row.category_slot}`;
        const item = {
          rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
          tmdb_id: row.tmdb_id, poster_path: row.poster_path,
          genre: row.genre, tmdb_rating: row.tmdb_rating,
          release_year: row.release_year, platform: row.platform,
          category_slot: row.category_slot, display_name: row.display_name,
          main_order: row.main_order,
        };
        if (row.main_section === "tv") {
          if (!tv[key]) tv[key] = {
            platform: row.platform, category_slot: row.category_slot,
            display_name: row.display_name, main_order: row.main_order, items: []
          };
          tv[key].items.push(item);
        } else if (row.main_section === "movie") {
          if (!movie[key]) movie[key] = {
            platform: row.platform, category_slot: row.category_slot,
            display_name: row.display_name, main_order: row.main_order, items: []
          };
          movie[key].items.push(item);
        }
      }
      const tvList    = Object.values(tv).sort((a, b) => a.main_order - b.main_order);
      const movieList = Object.values(movie).sort((a, b) => a.main_order - b.main_order);
      return new Response(JSON.stringify({ ok: true, tv: tvList, movie: movieList }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/monthly ─────────────────────────────────
  // 최근 30일 누적 랭킹 — 점수제: 1위=10점 ... 10위=1점
  if (path === "/rankings/monthly" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare(`
        SELECT
          r.platform, r.category_slot, r.title_ko, r.title_en,
          r.tmdb_id, r.poster_path, r.genre, r.release_year,
          MAX(r.tmdb_rating) AS tmdb_rating,
          COUNT(*) AS days_in_chart,
          SUM(11 - r.rank) AS score,
          ROW_NUMBER() OVER (
            PARTITION BY r.platform, r.category_slot ORDER BY SUM(11 - r.rank) DESC
          ) AS rank,
          oc.display_name, oc.main_section, oc.main_order, oc.main_limit, oc.memo_label
        FROM rankings r
        JOIN ott_categories oc ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE oc.main_section IS NOT NULL
          AND oc.is_active = 1
          AND r.date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-29 days')
          AND r.date != 'manual'
          AND r.rank <= 10
        GROUP BY r.platform, r.category_slot, r.title_ko
        ORDER BY oc.main_section, oc.main_order, rank
      `).all();

      const tv = {}, movie = {};
      for (const row of results) {
        if (row.rank > (row.main_limit || 10)) continue;
        const key  = `${row.platform}__${row.category_slot}`;
        const item = {
          rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
          tmdb_id: row.tmdb_id, poster_path: row.poster_path,
          genre: row.genre, tmdb_rating: row.tmdb_rating,
          release_year: row.release_year, platform: row.platform,
          category_slot: row.category_slot, display_name: row.display_name,
          main_order: row.main_order,
        };
        if (row.main_section === "tv") {
          if (!tv[key]) tv[key] = {
            platform: row.platform, category_slot: row.category_slot,
            display_name: row.display_name, main_order: row.main_order, items: []
          };
          tv[key].items.push(item);
        } else if (row.main_section === "movie") {
          if (!movie[key]) movie[key] = {
            platform: row.platform, category_slot: row.category_slot,
            display_name: row.display_name, main_order: row.main_order, items: []
          };
          movie[key].items.push(item);
        }
      }
      const tvList    = Object.values(tv).sort((a, b) => a.main_order - b.main_order);
      const movieList = Object.values(movie).sort((a, b) => a.main_order - b.main_order);
      return new Response(JSON.stringify({ ok: true, tv: tvList, movie: movieList }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/history ─────────────────────────────────
  // 특정 작품의 30일 순위 히스토리 (tmdb_id 필수)
  if (path === "/rankings/history" && request.method === "GET") {
    const tmdb_id = parseInt(url.searchParams.get("tmdb_id"));
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    const { results } = await env.DB.prepare(`
      SELECT date, platform, category_slot, rank
      FROM rankings
      WHERE tmdb_id = ?
        AND date != 'manual'
        AND date >= date((SELECT MAX(date) FROM rankings WHERE date != 'manual'), '-29 days')
      ORDER BY date ASC, platform ASC
    `).bind(tmdb_id).all();
    return new Response(JSON.stringify({ ok: true, data: results }), { headers });
  }

  // ── GET /rankings/platforms/:tmdb_id ─────────────────────────
  // 작품이 현재 등록된 OTT 플랫폼 목록 조회
  if (path.startsWith("/rankings/platforms/") && request.method === "GET") {
    const tmdb_id = parseInt(path.split("/rankings/platforms/")[1]);
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id = ?
          AND date = (SELECT MAX(date) FROM rankings WHERE date != 'manual')
        GROUP BY platform
        ORDER BY rank ASC
      `).bind(tmdb_id).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/manual/:tmdb_id ────────────────────────────
  // 특정 작품이 포함된 모든 수동 랭킹 목록 반환
  if (path.startsWith("/rankings/manual/") && request.method === "GET") {
    const tmdb_id = parseInt(path.split("/rankings/manual/")[1]);
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT
          r.rank, r.memo, r.platform, r.category_slot,
          oc.display_name, oc.memo_label
        FROM rankings r
        LEFT JOIN ott_categories oc
          ON r.platform = oc.platform AND r.category_slot = oc.category_slot
        WHERE r.tmdb_id = ? AND r.date = 'manual'
        ORDER BY r.rank ASC
      `).bind(tmdb_id).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /latest-date ──────────────────────────────────────
  if (path === "/latest-date") {
    const { results } = await env.DB.prepare(
      "SELECT MAX(date) as date FROM rankings WHERE date != 'manual'"
    ).all();
    return new Response(JSON.stringify({ ok: true, data: results[0] }), { headers });
  }

  // ── GET /platforms ────────────────────────────────────────
  if (path === "/platforms") {
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT platform FROM rankings ORDER BY platform"
    ).all();
    return new Response(JSON.stringify({ ok: true, data: results }), { headers });
  }

  return null; // 해당 라우트 없음
}
