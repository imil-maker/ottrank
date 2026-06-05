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

/**
 * 수동고정(is_manual=1) 행과 크롤링 행을 올바르게 병합
 *
 * 규칙:
 *   A. 수동고정 tmdb_id와 동일한 크롤링 행 → 제거 (수동고정이 우선)
 *   B. 나머지 크롤링 행을 순서대로 배치하되,
 *      수동고정이 삽입된 rank 이후 항목은 +N씩 밀려남
 *   C. 최종 limit개만 반환
 *
 * @param {Array} crawlRows  - 크롤링 행 배열 (rank 오름차순)
 * @param {Array} manualRows - 수동고정 행 배열 (rank 오름차순)
 * @param {number} limit     - 최대 노출 개수
 * @returns {Array}          - 병합 후 재번호 매긴 배열
 */
function _mergeRankings(crawlRows, manualRows, limit) {
  if (!manualRows.length) {
    // 수동고정 없으면 크롤링만 limit개
    return crawlRows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // 수동고정 tmdb_id 집합
  const manualTmdbIds = new Set(manualRows.map(r => r.tmdb_id).filter(Boolean));

  // 크롤링에서 수동고정과 동일 tmdb_id 제거
  const filteredCrawl = crawlRows.filter(r => !manualTmdbIds.has(r.tmdb_id));

  // 수동고정 rank 위치에 삽입, 나머지 크롤링으로 채움
  // 방식: 전체 슬롯(1~limit)을 순회하며 수동고정 우선 배치
  const manualByRank = {};
  for (const m of manualRows) {
    const r = Math.max(1, parseInt(m.rank) || 1);
    if (!manualByRank[r]) manualByRank[r] = [];
    manualByRank[r].push(m);
  }

  const result   = [];
  let crawlIdx   = 0;
  let slot       = 1;

  while (result.length < limit) {
    if (manualByRank[slot] && manualByRank[slot].length) {
      // 이 슬롯에 수동고정 항목 삽입
      const m = manualByRank[slot].shift();
      result.push({ ...m, rank: result.length + 1 });
    } else {
      // 크롤링에서 다음 항목 채움
      if (crawlIdx < filteredCrawl.length) {
        result.push({ ...filteredCrawl[crawlIdx], rank: result.length + 1 });
        crawlIdx++;
      } else {
        // 크롤링도 소진 → 남은 수동고정 항목 처리 후 종료
        const remaining = Object.values(manualByRank).flat();
        for (const m of remaining) {
          if (result.length >= limit) break;
          result.push({ ...m, rank: result.length + 1 });
        }
        break;
      }
    }
    slot++;
  }

  return result;
}

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
          AND r.rank <= oc.main_limit + 20
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).bind(date).all();

      // 수동 랭킹 (date='manual' AND is_manual=1)
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
          AND r.is_manual = 1
          AND r.date != 'manual'
        ORDER BY oc.main_section, oc.main_order, r.rank
      `).all();

      // category_slot별 그룹화 후 병합
      const crawlBySlot  = {};
      const manualBySlot = {};
      const slotMeta     = {};

      for (const row of crawlResults) {
        const key = `${row.platform}__${row.category_slot}`;
        if (!crawlBySlot[key])  crawlBySlot[key]  = [];
        if (!slotMeta[key])     slotMeta[key]      = row;
        crawlBySlot[key].push(row);
      }
      for (const row of manualResults) {
        const key = `${row.platform}__${row.category_slot}`;
        if (!manualBySlot[key]) manualBySlot[key]  = [];
        if (!slotMeta[key])     slotMeta[key]      = row;
        manualBySlot[key].push(row);
      }

      const tv = {}, movie = {};
      const allKeys = new Set([...Object.keys(crawlBySlot), ...Object.keys(manualBySlot)]);

      for (const key of allKeys) {
        const meta    = slotMeta[key];
        if (!meta) continue;
        const limit   = meta.main_limit || 10;
        const merged  = _mergeRankings(
          (crawlBySlot[key]  || []).sort((a, b) => a.rank - b.rank),
          (manualBySlot[key] || []).sort((a, b) => a.rank - b.rank),
          limit
        );

        for (const row of merged) {
          const item = {
            rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
            tmdb_id: row.tmdb_id, poster_path: row.poster_path,
            genre: row.genre, tmdb_rating: row.tmdb_rating,
            release_year: row.release_year, memo: row.memo || null,
            display_name: meta.display_name, platform: meta.platform,
            category_slot: meta.category_slot, main_order: meta.main_order,
          };
          if (meta.main_section === "tv") {
            if (!tv[key]) tv[key] = {
              platform: meta.platform, category_slot: meta.category_slot,
              display_name: meta.display_name, main_order: meta.main_order,
              memo_label: meta.memo_label || null, items: []
            };
            tv[key].items.push(item);
          } else if (meta.main_section === "movie") {
            if (!movie[key]) movie[key] = {
              platform: meta.platform, category_slot: meta.category_slot,
              display_name: meta.display_name, main_order: meta.main_order,
              memo_label: meta.memo_label || null, items: []
            };
            movie[key].items.push(item);
          }
        }
      }

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
          AND r.rank <= oc.platform_limit + 20
        ORDER BY oc.platform_order, r.rank
      `).bind(platform, date).all();

      // 수동고정 랭킹
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
          AND r.is_manual = 1
          AND r.date != 'manual'
        ORDER BY oc.platform_order, r.rank
      `).bind(platform).all();

      // category_slot별 그룹화 후 병합
      const crawlBySlot  = {};
      const manualBySlot = {};
      const slotMeta     = {};

      for (const row of crawlResults) {
        const key = row.category_slot;
        if (!crawlBySlot[key])  crawlBySlot[key]  = [];
        if (!slotMeta[key])     slotMeta[key]      = row;
        crawlBySlot[key].push(row);
      }
      for (const row of manualResults) {
        const key = row.category_slot;
        if (!manualBySlot[key]) manualBySlot[key]  = [];
        if (!slotMeta[key])     slotMeta[key]      = row;
        manualBySlot[key].push(row);
      }

      const groups  = {};
      const allKeys = new Set([...Object.keys(crawlBySlot), ...Object.keys(manualBySlot)]);

      for (const key of allKeys) {
        const meta   = slotMeta[key];
        if (!meta) continue;
        const limit  = meta.platform_limit || 20;
        const merged = _mergeRankings(
          (crawlBySlot[key]  || []).sort((a, b) => a.rank - b.rank),
          (manualBySlot[key] || []).sort((a, b) => a.rank - b.rank),
          limit
        );
        groups[key] = {
          platform: meta.platform, category_slot: meta.category_slot,
          display_name: meta.display_name, platform_order: meta.platform_order,
          memo_label: meta.memo_label || null,
          items: merged.map(row => ({
            rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
            tmdb_id: row.tmdb_id, poster_path: row.poster_path,
            genre: row.genre, tmdb_rating: row.tmdb_rating,
            release_year: row.release_year, memo: row.memo || null,
          })),
        };
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
