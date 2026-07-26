/* 2026-07-26 rev.3 — rankings.js (/rankings/platform 박스오피스 관객수 조인 수정 — r.date=bs.date 정확 매칭 대신 tmdb_id별 가장 최근 boxoffice_stats 값을 가져오도록 변경, 순위표 날짜와 KOBIS 날짜가 항상 하루 어긋나 관객수가 계속 안 보이던 문제 해결) */
/* ══════════════════════════════════════════════════════════════
   랭킹 관련 API 라우트
   GET  /rankings
   GET  /rankings/main
   GET  /rankings/platform
   GET  /rankings/weekly
   GET  /rankings/monthly
   GET  /rankings/history
   GET  /rankings/platforms/:tmdb_id
   GET  /rankings/platforms-batch?tmdb_ids=1,2,3   ← person.html 필모그래피 배치조회(2026-07-11 신설)
   GET  /rankings/person-widget                    ← 인물페이지 상단 랭킹 위젯(2026-07-11 신설)
   GET  /rankings/manual/:tmdb_id
   GET  /rankings/boxoffice-stats/:tmdb_id          ← 작품 상세페이지 박스오피스 정보(2026-07-19 신설)
   GET  /latest-date
   GET  /platforms
   GET  /sitemap.xml
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
export function _mergeRankings(crawlRows, manualRows, limit) {
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

/**
 * [2026-07-15 추가] B안 안전망
 * 노출 설정(is_active=1 + 각 섹션 필드)은 켜져 있는데, "오늘 날짜"로는 rankings에
 * 데이터가 없는 카테고리(category10처럼 자동 크롤링이 아니라 수동 재계산이 필요한
 * 카테고리가 그날 재계산을 놓친 경우 등)만 골라서 각자의 가장 최근 날짜 데이터로 보충한다.
 * 평소(모든 카테고리가 오늘자 데이터를 갖고 있음)엔 missingCats가 비어있어서
 * 이 함수 자체가 호출되지 않거나(호출돼도 즉시 빈 배열 반환) 추가 D1 호출이 발생하지 않는다.
 *
 * @param {Object} env
 * @param {Array} missingCats - [{platform, category_slot, ...}] 오늘자 데이터가 없는 카테고리만
 * @returns {Array} 보충된 랭킹 행 배열 (platform, category_slot, rank, date 등 포함)
 */
export async function _fetchFallbackForMissing(env, missingCats) {
  if (!missingCats || !missingCats.length) return [];

  const statements = missingCats.map(c =>
    env.DB.prepare(`
      SELECT platform, category_slot, rank, title_ko, title_en, tmdb_id,
             poster_path, genre, tmdb_rating, release_year, memo, date
      FROM rankings
      WHERE platform = ? AND category_slot = ?
        AND date = (
          SELECT MAX(date) FROM rankings
          WHERE platform = ? AND category_slot = ? AND date != 'manual'
        )
      ORDER BY rank ASC
    `).bind(c.platform, c.category_slot, c.platform, c.category_slot)
  );

  const batchResults = await env.DB.batch(statements);
  return batchResults.flatMap(r => r.results || []);
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
    else { query += " AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')"; }

    query += " ORDER BY platform, category, rank";

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify({ ok: true, data: results }), { headers });
  }

  // ── GET /rankings/main ───────────────────────────────────────
  // 메인페이지용 랭킹 데이터 (main_section='tv'/'movie' 카테고리)
  if (path === "/rankings/main" && request.method === "GET") {
    try {
      const date = url.searchParams.get("date") || null;

      // [2026-07-15 추가] 노출 설정된 전체 카테고리 목록 — 오늘자 데이터 유무와 무관하게
      // "설정상 켜져있는" 카테고리를 먼저 확보해둬야, 아래에서 오늘자 데이터가 없는
      // 카테고리를 가려낼 수 있다 (B안 안전망의 기준표 역할)
      // [2026-07-17 수정] /rankings/platform과 동일한 이유로 batch 통합 — 서로 독립적인 쿼리
      // 3개(활성 카테고리 / 크롤링 랭킹 / 수동고정 랭킹)를 순서대로 await하던 걸 한 번의
      // 왕복으로 처리. 이 API는 전체 플랫폼을 한꺼번에 조회해서 /rankings/platform보다
      // 범위가 크고, 메인페이지 init()에서 제일 먼저 기다리는 요청이라 체감 영향이 큼.
      const [activeCatsRes, crawlRes, manualRes] = await env.DB.batch([
        env.DB.prepare(`
          SELECT platform, category_slot, display_name, main_section, main_order, main_limit, memo_label
          FROM ott_categories
          WHERE main_section IS NOT NULL AND is_active = 1
        `),
        env.DB.prepare(`
          SELECT
            r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
            r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo
          FROM rankings r
          JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
          WHERE oc.main_section IS NOT NULL
            AND oc.is_active = 1
            AND r.date = COALESCE(?, (SELECT value FROM app_settings WHERE key = 'latest_ranking_date'))
            AND r.rank <= oc.main_limit + 20
          ORDER BY oc.main_section, oc.main_order, r.rank
        `).bind(date),
        env.DB.prepare(`
          SELECT
            r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
            r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo
          FROM rankings r
          JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
          WHERE oc.main_section IS NOT NULL
            AND oc.is_active = 1
            AND r.is_manual = 1
            AND r.date = 'manual'
          ORDER BY oc.main_section, oc.main_order, r.rank
        `),
      ]);

      const activeCats    = activeCatsRes.results;
      const crawlResults  = crawlRes.results;
      const manualResults = manualRes.results;

      const catMeta = {};
      for (const c of activeCats) catMeta[`${c.platform}__${c.category_slot}`] = c;

      // category_slot별 그룹화
      const crawlBySlot  = {};
      const manualBySlot = {};

      for (const row of crawlResults) {
        const key = `${row.platform}__${row.category_slot}`;
        if (!crawlBySlot[key]) crawlBySlot[key] = [];
        crawlBySlot[key].push(row);
      }
      for (const row of manualResults) {
        const key = `${row.platform}__${row.category_slot}`;
        if (!manualBySlot[key]) manualBySlot[key] = [];
        manualBySlot[key].push(row);
      }

      // [2026-07-15 추가] B안 안전망 — 날짜 파라미터를 직접 지정한 조회(과거 특정일 조회)는
      // "그날 데이터가 없으면 없는 게 맞다"이므로 안전망 대상에서 제외하고, 기본(오늘자) 조회일 때만 적용
      // [2026-07-17 수정] /rankings/platform과 동일하게, 수동고정 데이터(manualBySlot)가
      // 이미 있는 카테고리는 보충 대상에서 제외 — 크롤링 데이터가 애초에 생길 일이 없는
      // 카테고리(예: featured 슬라이드처럼 수동으로만 채워지는 섹션)를 매번 헛수고로
      // 보충쿼리 날리던 문제 해결
      if (!date) {
        const missingCats = activeCats.filter(
          c => !crawlBySlot[`${c.platform}__${c.category_slot}`] &&
               !manualBySlot[`${c.platform}__${c.category_slot}`]
        );
        if (missingCats.length) {
          const fallbackRows = await _fetchFallbackForMissing(env, missingCats);
          for (const row of fallbackRows) {
            const key = `${row.platform}__${row.category_slot}`;
            if (!crawlBySlot[key]) crawlBySlot[key] = [];
            crawlBySlot[key].push(row);
          }
        }
      }

      const tv = {}, movie = {}, featured = {};
      const allKeys = new Set([...Object.keys(crawlBySlot), ...Object.keys(manualBySlot)]);

      for (const key of allKeys) {
        const meta    = catMeta[key];
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
          } else if (meta.main_section === "featured" && meta.platform === "netflix") {
            // featured: 넷플릭스 전용 — 메인 최상단 슬라이드 섹션 (최대 2개)
            if (!featured[key]) featured[key] = {
              platform: meta.platform, category_slot: meta.category_slot,
              display_name: meta.display_name, main_order: meta.main_order,
              memo_label: meta.memo_label || null, items: []
            };
            featured[key].items.push(item);
          }
        }
      }

      const tvList       = Object.values(tv).sort((a, b) => a.main_order - b.main_order);
      const movieList    = Object.values(movie).sort((a, b) => a.main_order - b.main_order);
      // featured: main_order 오름차순, 최대 2개만 반환
      const featuredList = Object.values(featured)
        .sort((a, b) => a.main_order - b.main_order)
        .slice(0, 2);

      return new Response(JSON.stringify({ ok: true, tv: tvList, movie: movieList, featured: featuredList }), { headers });
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

      // [2026-07-17 수정] 서로 의존관계 없는 쿼리 3개(활성 카테고리 목록 / 일반 크롤링 랭킹 /
      // 수동고정 랭킹)를 순서대로 하나씩 await하던 걸 env.DB.batch()로 묶어서 한 번의 왕복으로
      // 처리. 쿼리 각각의 실행시간(query time)은 이미 인덱스를 잘 타서 빨랐지만(EXPLAIN QUERY
      // PLAN으로 확인함), Worker↔D1 왕복 자체가 4번(+보충쿼리 1번) 순서대로 쌓이면서 넷플릭스
      // 페이지 기준 749ms까지 늘어났던 게 실측으로 확인됨. 왕복을 최대 2번(이 batch 1번 +
      // 보충쿼리 batch 1번)으로 줄여서 절반 가까이 단축을 노림.
      const [activeCatsRes, crawlRes, manualRes] = await env.DB.batch([
        env.DB.prepare(`
          SELECT platform, category_slot, display_name, platform_section, platform_order, platform_limit, memo_label
          FROM ott_categories
          WHERE platform = ? AND platform_section IS NOT NULL AND is_active = 1
        `).bind(platform),
        env.DB.prepare(`
          SELECT
            r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
            r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
            bs.audi_cnt AS audi_cnt
          FROM rankings r
          JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
          LEFT JOIN boxoffice_stats bs
            ON r.platform = 'boxoffice' AND r.tmdb_id = bs.tmdb_id
            AND bs.date = (SELECT MAX(b2.date) FROM boxoffice_stats b2 WHERE b2.tmdb_id = r.tmdb_id)
          WHERE r.platform = ?
            AND oc.platform_section IS NOT NULL
            AND oc.is_active = 1
            AND r.date = COALESCE(?, (SELECT value FROM app_settings WHERE key = 'latest_ranking_date'))
            AND r.rank <= oc.platform_limit + 20
          ORDER BY oc.platform_order, r.rank
        `).bind(platform, date),
        env.DB.prepare(`
          SELECT
            r.platform, r.category_slot, r.rank, r.title_ko, r.title_en,
            r.tmdb_id, r.poster_path, r.genre, r.tmdb_rating, r.release_year, r.memo,
            NULL AS audi_cnt
          FROM rankings r
          JOIN ott_categories oc
            ON r.platform = oc.platform AND r.category_slot = oc.category_slot
          WHERE r.platform = ?
            AND oc.platform_section IS NOT NULL
            AND oc.is_active = 1
            AND r.is_manual = 1
            AND r.date = 'manual'
          ORDER BY oc.platform_order, r.rank
        `).bind(platform),
      ]);

      const activeCats    = activeCatsRes.results;
      const crawlResults  = crawlRes.results;
      const manualResults = manualRes.results;

      const catMeta = {};
      for (const c of activeCats) catMeta[c.category_slot] = c;

      // category_slot별 그룹화
      const crawlBySlot  = {};
      const manualBySlot = {};

      for (const row of crawlResults) {
        const key = row.category_slot;
        if (!crawlBySlot[key]) crawlBySlot[key] = [];
        crawlBySlot[key].push(row);
      }
      for (const row of manualResults) {
        const key = row.category_slot;
        if (!manualBySlot[key]) manualBySlot[key] = [];
        manualBySlot[key].push(row);
      }

      // [2026-07-17 수정] "빠진 카테고리"를 크롤링 데이터(crawlBySlot) 유무만으로 판단했더니,
      // category05·06·09처럼 애초에 크롤링을 안 하고 수동고정(manualBySlot)으로만 채워지는
      // 카테고리까지 매번 "혹시 예전 크롤링 데이터라도 있나" 하고 헛수고로 보충쿼리를 날리고
      // 있었음(넷플릭스 페이지 응답속도 실측 시 확인됨). 수동고정 데이터가 이미 있으면
      // 애초에 화면에 빈 칸이 안 생기니, 보충 대상에서 제외한다.
      if (!date) {
        const missingCats = activeCats.filter(
          c => !crawlBySlot[c.category_slot] && !manualBySlot[c.category_slot]
        );
        if (missingCats.length) {
          const fallbackRows = await _fetchFallbackForMissing(env, missingCats);
          for (const row of fallbackRows) {
            const key = row.category_slot;
            if (!crawlBySlot[key]) crawlBySlot[key] = [];
            crawlBySlot[key].push(row);
          }
        }
      }

      const groups  = {};
      const allKeys = new Set([...Object.keys(crawlBySlot), ...Object.keys(manualBySlot)]);

      for (const key of allKeys) {
        const meta   = catMeta[key];
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
            // [2026-07-18 추가] boxoffice 전용 — 다른 플랫폼은 항상 null
            audi_cnt: row.audi_cnt || null,
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
          AND r.date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-6 days')
          AND r.date < 'manual'
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
          AND r.date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-29 days')
          AND r.date < 'manual'
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
    // [2026-07-18] netflix category10은 자동 크롤링이 아닌 수동 재계산 전용 비공식 카테고리라
    //   "N일간 TOP 10" 이력 계산 대상에서 제외 (작품페이지 heroRankRow의 chip-top10 배지용)
    const { results } = await env.DB.prepare(`
      SELECT date, platform, category_slot, rank
      FROM rankings
      WHERE tmdb_id = ?
        AND date < 'manual'
        AND date >= date((SELECT value FROM app_settings WHERE key = 'latest_ranking_date'), '-29 days')
        AND NOT (platform = 'netflix' AND category_slot = 'category10')
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
      // [2026-07-18] netflix category10은 비공식 카테고리 — 현재 순위 칩(heroRankRow chip-rank)에도 반영되지 않도록 제외
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id = ?
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          AND NOT (platform = 'netflix' AND category_slot = 'category10')
        GROUP BY platform
        ORDER BY rank ASC
      `).bind(tmdb_id).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/platforms-batch?tmdb_ids=1,2,3,... ─────────
  // [2026-07-11 신설] person.html 필모그래피용 — 여러 작품이 각각 지금
  // 랭킹에 있는지 한 번에 확인. 위 /rankings/platforms/:tmdb_id(단건)를
  // 화면에 보이는 작품 수(수십~수백 개)만큼 반복 호출하면 인물페이지
  // 방문마다 요청이 폭증하므로(N+1), IN절로 한 번에 묶어서 조회.
  // ⚠️ 경로를 /rankings/platforms/ 뒤에 이어붙이지 않고 /rankings/platforms-batch로
  // 완전히 분리 — 위 startsWith("/rankings/platforms/") 라우팅과 접두사가 겹치면
  // 이 요청이 먼저 그쪽으로 잘못 매칭될 수 있어(라우팅 순서 버그 재발 방지) 의도적으로 분리함.
  // 프론트(person.html)는 필모그래피 전체가 아니라 "지금 화면에 렌더링된 카드 목록"만
  // (더보기 클릭 시 그 페이지 분량만) 보내도록 설계 — 호출당 항상 수십 개 이내로 작게 유지.
  if (path === "/rankings/platforms-batch" && request.method === "GET") {
    const raw = (url.searchParams.get("tmdb_ids") || "").trim();
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_ids required" }), { status: 400, headers });
    }

    // 정수만 걸러내고, 한 번에 최대 50개까지만 허용 (person.html은 24개씩 보내는 게 정상 사용 패턴)
    const tmdbIds = [...new Set(
      raw.split(",").map(s => parseInt(s.trim())).filter(n => Number.isInteger(n) && n > 0)
    )].slice(0, 50);

    if (!tmdbIds.length) {
      return new Response(JSON.stringify({ ok: false, message: "유효한 tmdb_ids가 없습니다" }), { status: 400, headers });
    }

    try {
      const placeholders = tmdbIds.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, platform, MIN(rank) as rank
        FROM rankings
        WHERE tmdb_id IN (${placeholders})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          AND NOT (platform = 'netflix' AND category_slot = 'category10')
        GROUP BY tmdb_id, platform
        ORDER BY tmdb_id, rank ASC
      `).bind(...tmdbIds).all();

      // 프론트에서 바로 쓰기 좋게 { tmdb_id: [{platform, rank}, ...] } 형태로 묶어서 반환
      const data = {};
      for (const row of results) {
        if (!data[row.tmdb_id]) data[row.tmdb_id] = [];
        data[row.tmdb_id].push({ platform: row.platform, rank: row.rank });
      }

      return new Response(JSON.stringify({ ok: true, data }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/person-widget ──────────────────────────────
  // [2026-07-11 신설] 인물페이지 상단 "오늘의 랭킹" 위젯용.
  // 어드민 "페이지 카테고리 설정 → 인물페이지 설정"에서 person_section='person'으로
  // 켜놓은 카테고리 중 person_order가 가장 낮은 것 1개만 반환한다.
  // 여러 개를 켜놔도(어드민 저장 단계에서 2개 이상은 막지만, 방어적으로) 여기서 1개로 확정.
  // 켜놓은 게 하나도 없으면 data: null → 프론트(person.html)는 위젯을 아예 렌더링하지 않음.
  if (path === "/rankings/person-widget" && request.method === "GET") {
    try {
      const slot = await env.DB.prepare(`
        SELECT platform, category_slot, display_name, person_limit
        FROM ott_categories
        WHERE person_section = 'person'
          AND is_active = 1
        ORDER BY person_order ASC
        LIMIT 1
      `).first();

      if (!slot) {
        return new Response(JSON.stringify({ ok: true, data: null }), { headers });
      }

      const limit = slot.person_limit || 10;

      // [2026-07-18 수정] 일반 크롤링 랭킹(crawlResults)과 수동고정 랭킹(manualResults)이
      // 서로 의존관계 없이(둘 다 slot만 있으면 조회 가능) 순서대로 await되고 있었음 —
      // batch로 묶어서 한 번의 왕복으로 처리. slot 조회는 이 둘의 재료라 어쩔 수 없이
      // 먼저 필요하지만, 그 뒤 이 둘은 병렬 처리 가능.
      // ⚠️ works를 LEFT JOIN해서 media_type을 같이 가져옴 — rankings 테이블엔
      // media_type이 없는데, 영화/TV는 TMDB 숫자 tmdb_id를 공유하므로 이게 없으면
      // 프론트에서 작품 상세페이지로 이동할 때 완전히 다른(엉뚱한) 작품으로
      // 잘못 연결될 수 있음(works 3키 원칙과 같은 계열의 위험).
      const [crawlRes, manualRes] = await env.DB.batch([
        env.DB.prepare(`
          SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
                 r.tmdb_rating, r.release_year, w.media_type
          FROM rankings r
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.platform = ? AND r.category_slot = ?
            AND r.date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          ORDER BY r.rank ASC
        `).bind(slot.platform, slot.category_slot),
        env.DB.prepare(`
          SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
                 r.tmdb_rating, r.release_year, w.media_type
          FROM rankings r
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.platform = ? AND r.category_slot = ?
            AND r.is_manual = 1 AND r.date = 'manual'
          ORDER BY r.rank ASC
        `).bind(slot.platform, slot.category_slot),
      ]);

      let crawlResults = crawlRes.results;
      const manualResults = manualRes.results;

      // [2026-07-15 추가] B안 안전망 — 오늘자로 이 카테고리 데이터가 하나도 없으면
      // (예: category10처럼 그날 재계산을 못 돌린 경우), 이 카테고리의 가장 최근 날짜로 대체.
      // 노출 카테고리가 1개뿐인 위젯이라 매번 별도 쿼리라도 부담이 크지 않음.
      if (!crawlResults.length) {
        const { results: fallbackResults } = await env.DB.prepare(`
          SELECT r.rank, r.title_ko, r.title_en, r.tmdb_id, r.poster_path, r.genre,
                 r.tmdb_rating, r.release_year, w.media_type
          FROM rankings r
          LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.platform = ? AND r.category_slot = ?
            AND r.date = (
              SELECT MAX(date) FROM rankings
              WHERE platform = ? AND category_slot = ? AND date != 'manual'
            )
          ORDER BY r.rank ASC
        `).bind(slot.platform, slot.category_slot, slot.platform, slot.category_slot).all();
        crawlResults = fallbackResults;
      }

      // 기존 /rankings/main, /rankings/platform과 동일한 병합 함수 재사용
      const merged = _mergeRankings(crawlResults, manualResults, limit);

      return new Response(JSON.stringify({
        ok: true,
        data: {
          platform: slot.platform,
          category_slot: slot.category_slot,
          display_name: slot.display_name,
          items: merged.map(row => ({
            rank: row.rank, title_ko: row.title_ko, title_en: row.title_en,
            tmdb_id: row.tmdb_id, poster_path: row.poster_path,
            genre: row.genre, tmdb_rating: row.tmdb_rating, release_year: row.release_year,
            media_type: row.media_type || null,
          })),
        }
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /rankings/boxoffice-stats/:tmdb_id ───────────────────
  // 작품 상세페이지용 — 해당 작품의 가장 최근 KOBIS 박스오피스 지표 1건
  // (2026-07-19 신설) boxoffice_stats는 tmdb_id+date UNIQUE라 ORDER BY date DESC LIMIT 1로
  // 자동으로 인덱스를 탐 (별도 인덱스 추가 불필요 — 유니크 제약이 인덱스 역할)
  if (path.startsWith("/rankings/boxoffice-stats/") && request.method === "GET") {
    const tmdb_id = parseInt(path.split("/rankings/boxoffice-stats/")[1]);
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, movie_cd, date, rank, rank_inten, rank_old_and_new,
               audi_cnt, audi_acc, audi_change, sales_amt, sales_share,
               scrn_cnt, show_cnt
        FROM boxoffice_stats
        WHERE tmdb_id = ?
        ORDER BY date DESC
        LIMIT 1
      `).bind(tmdb_id).all();
      return new Response(JSON.stringify({ ok: true, data: results[0] || null }), { headers });
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
      "SELECT value as date FROM app_settings WHERE key = 'latest_ranking_date'"
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

  // ── GET /sitemap.xml ───────────────────────────────────────
  // 정적 페이지 + works 전체(작품 상세 페이지)를 묶어서 사이트맵 생성
  // 작품 슬러그 형식: /title/{season}-{year}{tmdb_id}
  //   - season: _title_detail.html에서 TMDB number_of_seasons 기준으로 결정되지만
  //             사이트맵에서는 시즌1(대표) 페이지만 등록 → 항상 1
  //   - year:   슬러그 파싱 시 폴백값인 "현재 연도"를 그대로 사용
  if (path === "/sitemap.xml") {
    // ── KV 캐시 우선 조회 (신규 2026-07-13) ──────────────────
    // ⚠️ 안전 원칙: 캐시 조회가 실패하거나, 캐시가 비어있거나,
    // env.SITEMAP_CACHE 바인딩 자체가 없어도 절대 에러 내지 않고
    // 아래 기존 D1 생성 로직으로 그대로 넘어감(폴백).
    // 검색봇이 sitemap을 못 받는 상황이 생기면 안 되므로,
    // 캐시는 "있으면 빠르고, 없어도 기존과 동일하게 100% 동작"해야 함.
    try {
      if (env.SITEMAP_CACHE) {
        const cached = await env.SITEMAP_CACHE.get("sitemap_xml");
        if (cached) {
          return new Response(cached, {
            headers: {
              ...headers,
              "Content-Type": "application/xml; charset=utf-8",
              "X-Sitemap-Cache": "HIT", // 디버깅용 — 캐시가 실제로 쓰였는지 확인 가능
            },
          });
        }
      }
    } catch (e) {
      // 캐시 조회 실패 — 조용히 무시하고 아래에서 정상 생성으로 진행
      console.log("sitemap cache read failed, falling back to D1:", e.message);
    }

    try {
      const baseUrl = "https://ottrank.kr";
      const year    = new Date().getFullYear();

      // 정적 페이지 목록 — { path, changefreq, priority }
      // changefreq: 랭킹/리뷰 페이지는 daily, 소개/약관은 monthly
      // priority: 메인 1.0, OTT 0.9, 커뮤니티 0.8, 기타 0.6
      // [2026-07-26 수정] /review(리뷰 작성 페이지, 콘텐츠 없음), /reactions(해외반응,
      // 데이터 거의 없음), /mypage·/my_review(개인 페이지)는 robots.txt에서도 차단 처리 —
      // 크롤 차단된 페이지를 sitemap에 올리는 건 앞뒤가 안 맞아 목록에서도 함께 제거함.
      // 데이터가 충분히 쌓이면(특히 /reactions) 다시 등록 검토.
      const staticPages = [
        // 메인
        { path: "/",              changefreq: "daily",   priority: "1.0" },
        // OTT 플랫폼 랭킹 (매일 업데이트)
        { path: "/netflix",       changefreq: "daily",   priority: "0.9" },
        { path: "/tving",         changefreq: "daily",   priority: "0.9" },
        { path: "/disneyplus",    changefreq: "daily",   priority: "0.9" },
        { path: "/wavve",         changefreq: "daily",   priority: "0.9" },
        { path: "/coupangplay",   changefreq: "daily",   priority: "0.9" },
        { path: "/boxoffice",     changefreq: "daily",   priority: "0.9" },
        // 커뮤니티/콘텐츠 (자주 업데이트)
        { path: "/community",     changefreq: "daily",   priority: "0.8" },
        { path: "/contents",      changefreq: "daily",   priority: "0.8" },
        // 서비스 안내
        { path: "/ott_intro.html",changefreq: "monthly", priority: "0.6" },
        { path: "/privacy",       changefreq: "monthly", priority: "0.4" },
        { path: "/terms",         changefreq: "monthly", priority: "0.4" },
      ];

      // works 전체 작품 목록 (tmdb_id 기준)
      // [2026-07-23 수정] 봇(검색엔진 크롤러)이 한국 작품/인물을 먼저 크롤링하도록 유도하기 위해
      // 한국작품(original_language='ko')을 먼저 나열 + priority도 더 높게 줌(아래 URL 생성부 참고).
      // "강제"는 아니고 "유도" 신호 — 사이트맵 순서/priority를 크롤러가 얼마나 따르는지는
      // 검색엔진마다 다름(구글은 참고만, 네이버는 비교적 잘 따르는 편으로 알려져 있음).
      const { results: works } = await env.DB.prepare(
        "SELECT tmdb_id, original_language FROM works WHERE tmdb_id IS NOT NULL ORDER BY (original_language = 'ko') DESC, tmdb_id"
      ).all();

      // persons 전체 인물 목록 (배우/감독 검색 SEO 유입용 — /person/{tmdb_id})
      // [2026-07-20 수정] 2단 레이아웃 배포 + 위키 데이터 매칭이 배우별로 매일 조금씩
      // 반영되므로, sitemap의 lastmod에 실제 갱신 시점을 반영하기 위해
      // person_wiki_cache(위키 매칭 승인 시점=created_at)를 LEFT JOIN
      // [2026-07-23 수정] has_korean_name(국적 판정 컬럼, 어드민 인물매칭 국적 필터와 동일 기준)으로
      // 한국인을 먼저 나열 — works와 동일한 목적(봇이 한국 콘텐츠 먼저 보게 유도)
      // [2026-07-26 수정] "고아 데이터" 자동 제외 — 등록된 작품이 나중에 삭제되면서 딸려있던
      // 배우 정보만 남는 경우가 실제로 다수 발견됨(2026-07-26 세션, 8,844명 수동 정리).
      // 아래 세 조건 중 하나라도 있으면 포함, 셋 다 없으면 sitemap에서 제외:
      //   ① work_cast에 우리 작품 출연 이력이 있음  ② 위키/AI 프로필이 있음  ③ 좋아요가 있음
      // 삭제까지는 안 하고 sitemap에서만 빼는 이유: 나중에 그 사람이 나온 작품이 다시 등록되면
      // work_cast 조건에 자동으로 다시 걸려서, 별도 복구 작업 없이도 sitemap에 알아서 재노출됨.
      const { results: persons } = await env.DB.prepare(`
        SELECT p.tmdb_id, p.has_korean_name, w.created_at AS wiki_matched_at
        FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        LEFT JOIN (
          SELECT person_tmdb_id, COUNT(DISTINCT tmdb_id) AS work_count
          FROM work_cast
          GROUP BY person_tmdb_id
        ) wc ON wc.person_tmdb_id = p.tmdb_id
        WHERE p.tmdb_id IS NOT NULL
          AND (
            wc.work_count IS NOT NULL
            OR w.tmdb_person_id IS NOT NULL
            OR p.like_count > 0
          )
        ORDER BY (p.has_korean_name = 1) DESC, p.tmdb_id
      `).all();

      const urls = [];

      // 정적 페이지 URL 생성
      for (const page of staticPages) {
        urls.push(
          `  <url>\n` +
          `    <loc>${baseUrl}${page.path}</loc>\n` +
          `    <changefreq>${page.changefreq}</changefreq>\n` +
          `    <priority>${page.priority}</priority>\n` +
          `  </url>`
        );
      }

      // 작품 상세 페이지 URL 생성
      // [2026-07-24 수정] 한국작품 priority 0.9 / 외국작품 0.3 (기존 0.8/0.6에서 격차 확대)
      for (const w of works) {
        const loc = `${baseUrl}/title/1-${year}${w.tmdb_id}`;
        const priority = w.original_language === "ko" ? "0.9" : "0.3";
        urls.push(
          `  <url>\n` +
          `    <loc>${loc}</loc>\n` +
          `    <changefreq>weekly</changefreq>\n` +
          `    <priority>${priority}</priority>\n` +
          `  </url>`
        );
      }

      // 인물 상세 페이지 URL 생성 (배우/감독 이름 검색 유입용)
      // [2026-07-20 신규] lastmod 추가 — 위키 매칭 승인된 사람은 그 승인일,
      // 아직 매칭 안 된 사람은 2단 레이아웃 배포일(고정)을 사용.
      // ⚠️ 사이트맵 생성 시점의 "오늘" 날짜를 넣으면 안 됨 — 이 사이트맵은 1시간마다
      // 재생성되는데, 그때마다 오늘 날짜가 찍히면 매일 "방금 바뀜"이라는 거짓 신호가 됨
      // [2026-07-24 수정] 한국인 priority 0.7 / 외국인(또는 아직 국적 미판정) 0.3
      // (기존 0.6/0.4에서 격차 확대)
      const PERSON_TEMPLATE_DEPLOYED = "2026-07-20"; // 2단 레이아웃 전체 배포일
      for (const p of persons) {
        const loc = `${baseUrl}/person/${p.tmdb_id}`;
        const lastmod = p.wiki_matched_at
          ? p.wiki_matched_at.slice(0, 10)
          : PERSON_TEMPLATE_DEPLOYED;
        const priority = p.has_korean_name === 1 ? "0.7" : "0.3";
        urls.push(
          `  <url>\n` +
          `    <loc>${loc}</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          `    <changefreq>monthly</changefreq>\n` +
          `    <priority>${priority}</priority>\n` +
          `  </url>`
        );
      }

      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.join("\n") + `\n` +
        `</urlset>`;

      // ── KV에 캐시 저장 (신규 2026-07-13) ──────────────────
      // ⚠️ 여기서 실패해도 이번 요청의 응답(xml)에는 전혀 영향 없음.
      // 저장만 안 될 뿐, 방금 D1에서 만든 정확한 xml은 정상적으로 응답됨.
      // 다음 요청이 왔을 때 다시 저장을 시도하므로 영구적으로 막히지 않음.
      // 유효기간 1시간 = 기존 sitemap.xml.js 주석에 있던 원래 의도값과 동일
      // (사이트 초기 단계라 검색 반영 지연을 최소화하기 위해 보수적으로 설정)
      try {
        if (env.SITEMAP_CACHE) {
          await env.SITEMAP_CACHE.put("sitemap_xml", xml, { expirationTtl: 3600 });
        }
      } catch (e) {
        console.log("sitemap cache write failed (non-fatal):", e.message);
      }

      return new Response(xml, {
        headers: {
          ...headers,
          "Content-Type": "application/xml; charset=utf-8",
          "X-Sitemap-Cache": "MISS", // 디버깅용 — 이번엔 D1에서 새로 만들었다는 표시
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null; // 해당 라우트 없음
}
