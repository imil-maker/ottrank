export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const origin = request.headers.get("Origin") || "https://ottrank.kr";
    const allowedOrigins = ["https://ottrank.kr", "http://localhost:8788", "http://localhost:3000"];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "https://ottrank.kr";

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      }});
    }

    // ── GET /rankings ─────────────────────────────────────────
    if (path === "/rankings" && request.method === "GET") {
      const platform = url.searchParams.get("platform");
      const category = url.searchParams.get("category");
      const date     = url.searchParams.get("date");

      let query = "SELECT * FROM rankings WHERE 1=1";
      const params = [];

      if (platform) { query += " AND platform = ?"; params.push(platform); }
      if (category) { query += " AND category = ?"; params.push(category); }
      if (date)     { query += " AND date = ?";     params.push(date); }
      else { query += " AND date = (SELECT MAX(date) FROM rankings)"; }

      query += " ORDER BY platform, category, rank";

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    }

    // ── GET /rankings/weekly ──────────────────────────────────
    // 최근 7일 누적 랭킹 — 점수제: 1위=10점, 2위=9점 ... 10위=1점
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
          if (row.main_section === 'tv') {
            if (!tv[key]) tv[key] = { platform: row.platform, category_slot: row.category_slot,
              display_name: row.display_name, main_order: row.main_order, items: [] };
            tv[key].items.push(item);
          } else if (row.main_section === 'movie') {
            if (!movie[key]) movie[key] = { platform: row.platform, category_slot: row.category_slot,
              display_name: row.display_name, main_order: row.main_order, items: [] };
            movie[key].items.push(item);
          }
        }
        const tvList    = Object.values(tv).sort((a,b) => a.main_order - b.main_order);
        const movieList = Object.values(movie).sort((a,b) => a.main_order - b.main_order);
        return new Response(JSON.stringify({ ok: true, tv: tvList, movie: movieList }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /rankings/monthly ─────────────────────────────────
    // 최근 30일 누적 랭킹 — 점수제: 1위=10점, 2위=9점 ... 10위=1점
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
          if (row.main_section === 'tv') {
            if (!tv[key]) tv[key] = { platform: row.platform, category_slot: row.category_slot,
              display_name: row.display_name, main_order: row.main_order, items: [] };
            tv[key].items.push(item);
          } else if (row.main_section === 'movie') {
            if (!movie[key]) movie[key] = { platform: row.platform, category_slot: row.category_slot,
              display_name: row.display_name, main_order: row.main_order, items: [] };
            movie[key].items.push(item);
          }
        }
        const tvList    = Object.values(tv).sort((a,b) => a.main_order - b.main_order);
        const movieList = Object.values(movie).sort((a,b) => a.main_order - b.main_order);
        return new Response(JSON.stringify({ ok: true, tv: tvList, movie: movieList }), { headers });
      } catch(e) {
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
    // 외부 URL 직접 접근 시 platform 정보를 모르기 때문에 tmdb_id로 조회
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





    // ── GET /videos/:tmdb_id ─────────────────────────────────────
    // 작품별 유튜브 영상 목록 조회
    // DB 0개: TMDB 저장 + YouTube 크롤링 동시 실행 (TMDB 영상 없을 경우 대비)
    // DB 1~2개: YouTube 크롤링 추가 실행
    // DB 3개 이상: DB 영상만 표시
    if (path.startsWith("/videos/") && !path.includes("/admin") && request.method === "GET") {
      const tmdb_id = parseInt(path.split("/videos/")[1]);
      if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC"
        ).bind(tmdb_id).all();

        if (results.length === 0) {
          // TMDB 영상 저장 + YouTube 크롤링 동시 실행
          ctx.waitUntil(_saveTmdbVideos(tmdb_id, env));
          ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
        } else if (results.length <= 2) {
          // YouTube 추가 크롤링
          ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
        }

        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/videos/crawl ─────────────────────────────────
    // 관리자 수동 YouTube 크롤링 — TMDB 영상 외 추가 영상 수집
    if (path === "/admin/videos/crawl" && request.method === "POST") {
      if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { tmdb_id } = body;
        if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
        const saved = await _crawlYoutubeVideos(parseInt(tmdb_id), env);
        return new Response(JSON.stringify({ ok: true, saved }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/videos ───────────────────────────────────────
    // 관리자 유튜브 영상 추가
    // title 빈칸이면 YouTube oEmbed API로 제목 자동 조회 (API 키 불필요)
    if (path === "/admin/videos" && request.method === "POST") {
      if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { tmdb_id, youtube_url } = body;
        let { title } = body;
        if (!tmdb_id || !youtube_url) return new Response(JSON.stringify({ ok: false, message: "tmdb_id, youtube_url required" }), { status: 400, headers });
        // youtube_id 추출
        const ytMatch = youtube_url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
        if (!ytMatch) return new Response(JSON.stringify({ ok: false, message: "유효하지 않은 유튜브 URL" }), { status: 400, headers });
        const youtube_id = ytMatch[1];
        // title 빈칸이면 oEmbed API로 유튜브 제목 자동 조회
        if (!title) {
          try {
            const oembedRes  = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtube_id}&format=json`);
            const oembedData = await oembedRes.json();
            title = oembedData.title || '';
          } catch(e) {
            title = '';
          }
        }
        await env.DB.prepare(
          "INSERT INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main) VALUES (?, ?, ?, ?, 0)"
        ).bind(tmdb_id, youtube_url, youtube_id, title).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/videos/:id/main ────────────────────────────
    // 메인 영상 지정
    if (path.match(/\/admin\/videos\/(\d+)\/main/) && request.method === "PATCH") {
      if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const id = parseInt(path.match(/\/admin\/videos\/(\d+)\/main/)[1]);
      try {
        const { results } = await env.DB.prepare("SELECT tmdb_id FROM title_videos WHERE id = ?").bind(id).all();
        if (!results.length) return new Response(JSON.stringify({ ok: false, message: "없음" }), { status: 404, headers });
        const tmdb_id = results[0].tmdb_id;
        await env.DB.batch([
          env.DB.prepare("UPDATE title_videos SET is_main = 0 WHERE tmdb_id = ?").bind(tmdb_id),
          env.DB.prepare("UPDATE title_videos SET is_main = 1 WHERE id = ?").bind(id),
        ]);
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /admin/videos/:id ─────────────────────────────────
    // 유튜브 영상 삭제
    if (path.match(/\/admin\/videos\/(\d+)$/) && request.method === "DELETE") {
      if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const id = parseInt(path.match(/\/admin\/videos\/(\d+)$/)[1]);
      try {
        await env.DB.prepare("DELETE FROM title_videos WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /rankings/manual/:tmdb_id ────────────────────────────
    // 특정 작품이 포함된 모든 수동 랭킹 목록 반환
    // 예) 한국 역대 영화 관객수 TOP20 1위, 넷플릭스 역대 흥행 베스트10 3위 등
    if (path.startsWith("/rankings/manual/") && request.method === "GET") {
      const tmdb_id = parseInt(path.split("/rankings/manual/")[1]);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }
      try {
        const { results } = await env.DB.prepare(`
          SELECT
            r.rank,
            r.memo,
            r.platform,
            r.category_slot,
            oc.display_name,
            oc.memo_label
          FROM rankings r
          LEFT JOIN ott_categories oc
            ON r.platform = oc.platform
            AND r.category_slot = oc.category_slot
          WHERE r.tmdb_id = ?
            AND r.date = 'manual'
          ORDER BY r.rank ASC
        `).bind(tmdb_id).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /kmrb/:tmdb_id ───────────────────────────────────────
    // 영상물등급위원회 시청가이드 (boxoffice 극장 영화 전용)
    // 1. D1 캐시 우선 (30일)
    // 2. 캐시 없으면 영화 API 호출 → XML 파싱 → D1 저장
    if (path.startsWith("/kmrb/") && request.method === "GET") {
      const tmdb_id = parseInt(path.split("/kmrb/")[1]);
      const title_ko = url.searchParams.get("title_ko") || "";
      if (!tmdb_id || !title_ko) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id and title_ko required" }), { status: 400, headers });
      }
      try {
        // ① D1 캐시 확인 (30일 이내)
        const cached = await env.DB.prepare(
          "SELECT * FROM kmrb_ratings WHERE tmdb_id = ?"
        ).bind(tmdb_id).first();
        if (cached) {
          const fetchedAt = new Date(cached.fetched_at || 0);
          const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 30) {
            return new Response(JSON.stringify({ ok: true, source: "cache", data: cached }), { headers });
          }
        }

        // ② 영화 API 호출 (XML 응답)
        const encTitle = encodeURIComponent(title_ko);
        const movieUrl = `https://apis.data.go.kr/B551008/movie_v3/movie_search_v3?serviceKey=${env.KMRB_MOVIE_API_KEY}&pageNo=1&numOfRows=5&title=${encTitle}`;

        const xmlText = await fetch(movieUrl).then(r => r.text()).catch(() => null);
        if (!xmlText) {
          return new Response(JSON.stringify({ ok: false, message: "API 호출 실패" }), { headers });
        }

        // ③ XML 파싱 (간단한 태그 추출)
        const getTag = (xml, tag) => {
          const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
          return m ? m[1].trim() : "";
        };

        // 결과 없으면 종료
        if (xmlText.includes('<totalCount>0</totalCount>')) {
          return new Response(JSON.stringify({ ok: false, message: "등급분류 정보 없음" }), { headers });
        }

        // 첫 번째 item 파싱
        const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/);
        if (!itemMatch) {
          return new Response(JSON.stringify({ ok: false, message: "등급분류 정보 없음" }), { headers });
        }
        const item = itemMatch[1];

        // ④ 내용정보 파싱 (rtStdName1~7 순서: 주제/선정성/폭력성/공포/약물/대사/모방위험)
        const rating = {
          tmdb_id,
          title_ko: getTag(item, 'useTitle') || title_ko,
          watch_grade: getTag(item, 'gradeName'),
          subject   : getTag(item, 'rtStdName1'), // 주제
          sexuality : getTag(item, 'rtStdName2'), // 선정성
          violence  : getTag(item, 'rtStdName3'), // 폭력성
          horror    : getTag(item, 'rtStdName4'), // 공포
          drug      : getTag(item, 'rtStdName5'), // 약물
          language  : getTag(item, 'rtStdName6'), // 대사
          imitation : getTag(item, 'rtStdName7'), // 모방위험
          core_reason: getTag(item, 'rtCoreHarmRsnNm'), // 핵심유해사유
          source    : "movie",
          fetched_at: new Date().toISOString(),
        };

        // ⑤ D1 저장 (upsert)
        await env.DB.prepare(`
          INSERT INTO kmrb_ratings
            (tmdb_id, title_ko, watch_grade, subject, sexuality, violence,
             language, imitation, drug, horror, source, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko    = excluded.title_ko,
            watch_grade = excluded.watch_grade,
            subject     = excluded.subject,
            sexuality   = excluded.sexuality,
            violence    = excluded.violence,
            language    = excluded.language,
            imitation   = excluded.imitation,
            drug        = excluded.drug,
            horror      = excluded.horror,
            source      = excluded.source,
            fetched_at  = excluded.fetched_at
        `).bind(
          rating.tmdb_id, rating.title_ko, rating.watch_grade,
          rating.subject, rating.sexuality, rating.violence,
          rating.language, rating.imitation, rating.drug,
          rating.horror, rating.source, rating.fetched_at
        ).run();

        return new Response(JSON.stringify({ ok: true, source: "api", data: rating }), { headers });

      } catch(e) {
        console.error("[KMRB]", e.message);
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /admin/title-map ──────────────────────────────────
    // ── GET /admin/title-map ──────────────────────────────────
    // 영어↔한글 매핑 목록 조회
    if (path === "/admin/title-map" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const page   = parseInt(url.searchParams.get("page") || "1");
        const limit  = 50;
        const offset = (page - 1) * limit;
        const { results } = await env.DB.prepare(
          "SELECT * FROM title_map ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(limit, offset).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /admin/rankings ───────────────────────────────────
    if (path === "/admin/rankings" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const date = url.searchParams.get("date");
      const query = date
        ? "SELECT * FROM rankings WHERE date = ? ORDER BY platform, category, rank"
        : "SELECT * FROM rankings WHERE date = (SELECT MAX(date) FROM rankings) ORDER BY platform, category, rank";
      const { results } = date
        ? await env.DB.prepare(query).bind(date).all()
        : await env.DB.prepare(query).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    }

    // ── POST /admin/fix ───────────────────────────────────────
    if (path === "/admin/fix" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { id, tmdb_id, title_ko, title_en, delete_duplicates, media_type } = body;
        // media_type: 'tv' | 'movie' | null — 기존 category 컬럼과 완전 별도 필드
        if (!id) return new Response(JSON.stringify({ ok: false, message: "id required" }), { status: 400, headers });

        let finalPoster   = null;
        let finalTitleKo  = title_ko || null;
        let finalTitleEn  = title_en || null;

        // rankings 테이블에서 현재 row 정보 조회 (기존 제목 폴백용)
        const rankRow = await env.DB.prepare(
          "SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?"
        ).bind(parseInt(id)).first();

        if (tmdb_id) {
          try {
            // media_type 지정 시 해당 타입만 조회, 없으면 tv→movie 순서로 시도
            const mtypes = media_type === 'movie' ? ['movie'] :
                           media_type === 'tv'    ? ['tv']    :
                           ['tv', 'movie'];
            for (const mtype of mtypes) {
              // ko-KR로 TMDB 조회
              const tmdbResp = await fetch(
                `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
              );
              if (!tmdbResp.ok) continue;
              const tmdbData = await tmdbResp.json();

              // poster_path 또는 제목이 있으면 매칭 성공
              if (!tmdbData.poster_path && !tmdbData.name && !tmdbData.title) continue;

              finalPoster = tmdbData.poster_path || null;
              if (!finalTitleKo) {
                finalTitleKo = tmdbData.name || tmdbData.title || null;
              }

              // en-US로 영어 원제 조회
              if (!finalTitleEn) {
                const tmdbEnResp = await fetch(
                  `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
                );
                if (tmdbEnResp.ok) {
                  const tmdbEnData = await tmdbEnResp.json();
                  const originalTitle = tmdbEnData.original_title || tmdbEnData.original_name || '';
                  const enTitle       = tmdbEnData.title || tmdbEnData.name || '';
                  // original_title이 한글이면 en-US title 사용, 아니면 original_title 사용
                  const isKorean = /[\uAC00-\uD7A3]/.test(originalTitle);
                  finalTitleEn = isKorean ? enTitle : (originalTitle || enTitle);
                }
              }
              break; // 매칭 성공 → 루프 종료
            }
          } catch(e) {}
        }

        // ① rankings 업데이트
        await env.DB.prepare(`
          UPDATE rankings
          SET tmdb_id     = COALESCE(?, tmdb_id),
              title_ko    = COALESCE(?, title_ko),
              title_en    = COALESCE(?, title_en),
              poster_path = COALESCE(?, poster_path),
              is_manual   = 1
          WHERE id = ?
        `).bind(
          tmdb_id ? parseInt(tmdb_id) : null,
          finalTitleKo,
          finalTitleEn,
          finalPoster,
          parseInt(id)
        ).run();

        // ② works 테이블 upsert (영구 저장 — 날짜 바뀌어도 유지!)
        if (tmdb_id) {
          // 중복 삭제 체크박스 ON 시에만 삭제 (기본값 OFF — 안전)
          if (delete_duplicates) {
            if (finalTitleEn) {
              await env.DB.prepare(`
                DELETE FROM works WHERE title_en = ? AND tmdb_id != ?
              `).bind(finalTitleEn, parseInt(tmdb_id)).run();
            }
            if (finalTitleKo && /[\uAC00-\uD7A3]/.test(finalTitleKo)) {
              await env.DB.prepare(`
                DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?
              `).bind(finalTitleKo, parseInt(tmdb_id)).run();
            }
            // admin_logs 기록
            await env.DB.prepare(`
              INSERT INTO admin_logs (action, target_id, memo)
              VALUES ('works_delete', ?, ?)
            `).bind(
              String(tmdb_id),
              `중복 삭제: title_en="${finalTitleEn}" title_ko="${finalTitleKo}"`
            ).run();
          }
          // 올바른 데이터로 upsert
          // media_type은 명시적으로 지정된 경우만 저장 (null이면 기존값 유지)
          const mediaTypeVal = (media_type === 'tv' || media_type === 'movie') ? media_type : null;
          await env.DB.prepare(`
            INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(tmdb_id) DO UPDATE SET
              title_ko    = COALESCE(?, title_ko),
              title_en    = COALESCE(NULLIF(?, ''), title_en),
              poster_path = COALESCE(?, poster_path),
              media_type  = COALESCE(?, media_type),
              updated_at  = datetime('now')
          `).bind(
            parseInt(tmdb_id),
            finalTitleKo || '',
            finalTitleEn || '',
            finalPoster,
            mediaTypeVal,
            finalTitleKo || null,
            finalTitleEn || null,
            finalPoster,
            mediaTypeVal
          ).run();
        }

        // ③ title_map 저장 (영어↔한글 매핑)
        // 영어 제목이 있으면 title_en 기준으로 저장
        // 영어 제목 없어도 한글 제목 + tmdb_id로 저장 (한글 기준 검색용)
        const mapTitleEn = finalTitleEn || finalTitleKo || '';
        const mapTitleKo = finalTitleKo || finalTitleEn || '';
        if (mapTitleEn && mapTitleKo && tmdb_id) {
          await env.DB.prepare(`
            INSERT INTO title_map (title_en, title_ko, tmdb_id)
            VALUES (?, ?, ?)
            ON CONFLICT(title_en) DO UPDATE SET
              title_ko = excluded.title_ko,
              tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
          `).bind(
            mapTitleEn.trim(),
            mapTitleKo.trim(),
            parseInt(tmdb_id)
          ).run();
        }

        return new Response(JSON.stringify({
          ok: true,
          poster_path: finalPoster,
          title_ko: finalTitleKo,
          title_en: finalTitleEn,
        }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/unfix ─────────────────────────────────────
    if (path === "/admin/unfix" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json();
      const { id } = body;
      await env.DB.prepare("UPDATE rankings SET is_manual = 0 WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── GET /youtube/trending ─────────────────────────────────────
    // 유튜브 한국 급상승 TOP 50
    // D1에 캐시 저장 (6시간 이내면 DB에서 반환, 이후면 YouTube API 새로 호출)
    if (path === "/youtube/trending" && request.method === "GET") {
      try {
        // ① D1 캐시 확인 — 6시간 이내 데이터 있으면 바로 반환
        const { results: cached } = await env.DB.prepare(`
          SELECT * FROM youtube_trending ORDER BY rank ASC
        `).all();

        if (cached.length > 0) {
          const collectedAt = new Date(cached[0].collected_at);
          const diffHours   = (Date.now() - collectedAt.getTime()) / (1000 * 60 * 60);
          if (diffHours < 6) {
            return new Response(JSON.stringify({ ok: true, data: cached, cached: true }), { headers });
          }
        }

        // ② YouTube Data API v3 호출 — 한국 급상승 TOP 50
        const ytUrl = `https://www.googleapis.com/youtube/v3/videos` +
          `?part=snippet,statistics` +
          `&chart=mostPopular` +
          `&regionCode=KR` +
          `&maxResults=50` +
          `&key=${env.YOUTUBE_API_KEY}`;

        const ytRes  = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (!ytRes.ok || !ytData.items?.length) {
          // YouTube API 실패 시 캐시 데이터라도 반환
          if (cached.length > 0) {
            return new Response(JSON.stringify({ ok: true, data: cached, cached: true }), { headers });
          }
          return new Response(JSON.stringify({ ok: false, message: "YouTube API 오류" }), { status: 500, headers });
        }

        const now   = new Date().toISOString();
        const items = ytData.items.map((item, i) => ({
          rank:         i + 1,
          video_id:     item.id,
          title:        item.snippet?.title || '',
          channel:      item.snippet?.channelTitle || '',
          thumbnail:    item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
          view_count:   parseInt(item.statistics?.viewCount || 0),
          collected_at: now,
        }));

        // ③ D1 기존 데이터 삭제 후 새 데이터 저장
        await env.DB.prepare("DELETE FROM youtube_trending").run();
        const inserts = items.map(v =>
          env.DB.prepare(`
            INSERT INTO youtube_trending (rank, video_id, title, channel, thumbnail, view_count, collected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(v.rank, v.video_id, v.title, v.channel, v.thumbnail, v.view_count, v.collected_at)
        );
        await env.DB.batch(inserts);

        return new Response(JSON.stringify({ ok: true, data: items, cached: false }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /works/search ────────────────────────────────────────
    // 작품명(한글/영어)으로 works 테이블 검색 — Admin 전용
    if (path === "/works/search" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const q     = url.searchParams.get("q") || "";
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "8"), 20);
      if (!q.trim()) {
        return new Response(JSON.stringify({ ok: false, message: "q required" }), { status: 400, headers });
      }
      try {
        const { results } = await env.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en, poster_path, media_type
          FROM works
          WHERE title_ko LIKE ? OR title_en LIKE ?
          ORDER BY
            CASE WHEN title_ko LIKE ? THEN 0 ELSE 1 END,
            title_ko ASC
          LIMIT ?
        `).bind(`%${q}%`, `%${q}%`, `${q}%`, limit).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /works/:tmdb_id ───────────────────────────────────
    if (path.startsWith("/works/") && request.method === "GET") {
      const tmdb_id = path.split("/works/")[1];
      if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      const { results } = await env.DB.prepare(
        "SELECT * FROM works WHERE tmdb_id = ?"
      ).bind(parseInt(tmdb_id)).all();
      if (!results.length) return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
      return new Response(JSON.stringify({ ok: true, data: results[0] }), { headers });
    }

    // ── GET /platforms ────────────────────────────────────────
    if (path === "/platforms") {
      const { results } = await env.DB.prepare(
        "SELECT DISTINCT platform FROM rankings ORDER BY platform"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    }

    // ── GET /latest-date ──────────────────────────────────────
    // manual 데이터는 날짜가 아니므로 제외하고 실제 크롤링 최신 날짜만 반환
    if (path === "/latest-date") {
      const { results } = await env.DB.prepare(
        "SELECT MAX(date) as date FROM rankings WHERE date != 'manual'"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results[0] }), { headers });
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /imdb/:imdbId ─────────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (path.startsWith("/imdb/") && path !== "/imdb/save" && request.method === "GET") {
      const imdbId = path.split("/imdb/")[1];

      if (!imdbId || !/^tt\d+$/.test(imdbId)) {
        return new Response(JSON.stringify({ ok: false, message: "invalid imdb_id" }), { status: 400, headers });
      }

      try {
        const cached = await env.DB.prepare(
          "SELECT imdb_rating, imdb_votes, imdb_updated FROM works WHERE imdb_id = ? LIMIT 1"
        ).bind(imdbId).first();

        if (cached?.imdb_rating) {
          const updatedAt  = new Date(cached.imdb_updated || 0);
          const daysSince  = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 7) {
            return new Response(JSON.stringify({
              ok:     true,
              source: "cache",
              rating: cached.imdb_rating.toFixed(1),
              votes:  cached.imdb_votes || "",
            }), { headers });
          }
        }

        const omdbKey = env.OMDB_API_KEY;
        if (!omdbKey) {
          return new Response(JSON.stringify({ ok: false, message: "OMDB key not configured" }), { status: 500, headers });
        }

        const omdbRes  = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${omdbKey}`);
        const omdbData = await omdbRes.json();

        // OMDB 성공 시 저장 후 반환
        if (omdbData.Response !== "False") {
          const r = parseFloat(omdbData.imdbRating);
          if (!isNaN(r)) {
            const v = omdbData.imdbVotes || "";
            const now = new Date().toISOString();
            await env.DB.prepare(
              "UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?"
            ).bind(r, v, now, imdbId).run();
            return new Response(JSON.stringify({ ok: true, source: "omdb", rating: r.toFixed(1), votes: v }), { headers });
          }
        }

        return new Response(JSON.stringify({ ok: false, message: "rating not available" }), { status: 404, headers });

      } catch(e) {
        console.error("[IMDB GET]", e);
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /imdb/save ───────────────────────────────────────
    if (path === "/imdb/save" && request.method === "POST") {
      try {
        const body = await request.json();
        const { tmdb_id, imdb_id } = body;

        if (!tmdb_id || !imdb_id) {
          return new Response(JSON.stringify({ ok: false, message: "tmdb_id and imdb_id required" }), { status: 400, headers });
        }
        if (!/^tt\d+$/.test(imdb_id)) {
          return new Response(JSON.stringify({ ok: false, message: "invalid imdb_id format" }), { status: 400, headers });
        }

        await env.DB.prepare(
          "UPDATE works SET imdb_id = ? WHERE tmdb_id = ?"
        ).bind(imdb_id, parseInt(tmdb_id)).run();

        return new Response(JSON.stringify({ ok: true }), { headers });

      } catch(e) {
        console.error("[IMDB SAVE]", e);
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /reactions ────────────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (path === "/reactions" && request.method === "GET") {
      const tmdb_id  = url.searchParams.get("tmdb_id");
      const featured = url.searchParams.get("featured");
      const page     = parseInt(url.searchParams.get("page") || "1");
      const limit    = 20;
      const offset   = (page - 1) * limit;

      let query, params;
      if (featured === "1") {
        query  = "SELECT * FROM reactions WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 1";
        params = [];
      } else if (tmdb_id) {
        query  = "SELECT * FROM reactions WHERE tmdb_id = ? ORDER BY is_featured DESC, like_count DESC, created_at DESC";
        params = [parseInt(tmdb_id)];
      } else {
        query  = "SELECT * FROM reactions ORDER BY is_featured DESC, created_at DESC LIMIT ? OFFSET ?";
        params = [limit, offset];
      }

      const { results } = params.length
        ? await env.DB.prepare(query).bind(...params).all()
        : await env.DB.prepare(query).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    }

    // ── GET /reactions/:id/comments ───────────────────────────
    if (path.match(/^\/reactions\/\d+\/comments$/) && request.method === "GET") {
      const reactionId = parseInt(path.split("/")[2]);
      const { results } = await env.DB.prepare(
        "SELECT * FROM reaction_comments WHERE reaction_id = ? ORDER BY like_count DESC LIMIT 50"
      ).bind(reactionId).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    }

    // ── GET /reactions/:id/posts ──────────────────────────────
    if (path.match(/^\/reactions\/\d+\/posts$/) && request.method === "GET") {
      const reactionId = parseInt(path.split("/")[2]);
      const { results } = await env.DB.prepare(
        "SELECT * FROM reaction_posts WHERE reaction_id = ? ORDER BY created_at DESC"
      ).bind(reactionId).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    }

    // ── POST /reactions/:id/posts ─────────────────────────────
    if (path.match(/^\/reactions\/\d+\/posts$/) && request.method === "POST") {
      try {
        const reactionId = parseInt(path.split("/")[2]);
        const body = await request.json();
        const { nickname, content, is_spoiler, tmdb_id } = body;

        if (!content || !content.trim()) {
          return new Response(JSON.stringify({ ok: false, message: "댓글 내용을 입력해주세요" }), { status: 400, headers });
        }
        if (content.length > 500) {
          return new Response(JSON.stringify({ ok: false, message: "댓글은 500자 이내로 입력해주세요" }), { status: 400, headers });
        }

        const result = await env.DB.prepare(`
          INSERT INTO reaction_posts (reaction_id, tmdb_id, nickname, content, is_spoiler)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          reactionId,
          tmdb_id || 0,
          (nickname || '익명').slice(0, 20),
          content.trim(),
          is_spoiler ? 1 : 0
        ).run();

        return new Response(JSON.stringify({ ok: true, id: result.meta?.last_row_id }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /reactions/:id/like ──────────────────────────────
    if (path.match(/^\/reactions\/posts\/\d+\/like$/) && request.method === "POST") {
      try {
        const postId = parseInt(path.split("/")[3]);
        await env.DB.prepare(
          "UPDATE reaction_posts SET like_count = like_count + 1 WHERE id = ?"
        ).bind(postId).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/reactions ─────────────────────────────────
    if (path === "/admin/reactions" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { tmdb_id, title_ko, poster_path, video_id, video_title,
                channel_name, thumbnail, view_count, like_count, published_at,
                custom_title } = body;

        if (!tmdb_id || !video_id) {
          return new Response(JSON.stringify({ ok: false, message: "tmdb_id and video_id required" }), { status: 400, headers });
        }

        await env.DB.prepare(`
          INSERT OR REPLACE INTO reactions
            (tmdb_id, title_ko, poster_path, platform, video_id, video_title,
             custom_title, channel_name, thumbnail, view_count, like_count, published_at, is_manual)
          VALUES (?, ?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
          parseInt(tmdb_id), title_ko || '', poster_path || '',
          video_id, video_title || '', custom_title || video_title || '',
          channel_name || '', thumbnail || '',
          view_count || 0, like_count || 0,
          published_at || new Date().toISOString()
        ).run();

        const row = await env.DB.prepare(
          "SELECT id FROM reactions WHERE video_id = ? LIMIT 1"
        ).bind(video_id).first();
        const reactionId = row?.id;

        if (reactionId && env.YOUTUBE_API_KEY && env.ANTHROPIC_API_KEY) {
          ctx.waitUntil(
            collectAndTranslateComments(reactionId, video_id, parseInt(tmdb_id), env)
          );
        }

        return new Response(JSON.stringify({
          ok: true,
          reaction_id: reactionId,
          collecting: !!(reactionId && env.YOUTUBE_API_KEY),
          message: env.YOUTUBE_API_KEY
            ? "등록 완료! 댓글 수집·번역 중 (약 30초 후 표시)"
            : "등록 완료"
        }), { headers });

      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/reactions/:id/collect ─────────────────────
    if (path.match(/^\/admin\/reactions\/\d+\/collect$/) && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id  = parseInt(path.split("/")[3]);
        const row = await env.DB.prepare(
          "SELECT id, video_id, tmdb_id FROM reactions WHERE id = ? LIMIT 1"
        ).bind(id).first();

        if (!row) {
          return new Response(JSON.stringify({ ok: false, message: "reaction not found" }), { status: 404, headers });
        }
        if (!env.YOUTUBE_API_KEY) {
          return new Response(JSON.stringify({ ok: false, message: "YOUTUBE_API_KEY not set" }), { status: 500, headers });
        }

        ctx.waitUntil(
          collectAndTranslateComments(row.id, row.video_id, row.tmdb_id, env)
        );

        return new Response(JSON.stringify({
          ok: true,
          message: "댓글 수집·번역 시작! 약 30초 후 확인하세요"
        }), { headers });

      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/reactions/:id ────────────────────────────
    if (path.match(/^\/admin\/reactions\/\d+$/) && request.method === "PATCH") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id   = parseInt(path.split("/")[3]);
        const body = await request.json();
        const { custom_title, is_featured_off } = body;
        if (is_featured_off) {
          await env.DB.prepare("UPDATE reactions SET is_featured = 0 WHERE id = ?").bind(id).run();
        } else {
          await env.DB.prepare(
            "UPDATE reactions SET custom_title = ? WHERE id = ?"
          ).bind(custom_title || '', id).run();
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PUT /admin/reactions/:id/featured ─────────────────────
    if (path.match(/^\/admin\/reactions\/\d+\/featured$/) && request.method === "PUT") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id = parseInt(path.split("/")[3]);
        await env.DB.prepare("UPDATE reactions SET is_featured = 0").run();
        await env.DB.prepare("UPDATE reactions SET is_featured = 1 WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /admin/reactions/:id ───────────────────────────
    if (path.match(/^\/admin\/reactions\/\d+$/) && request.method === "DELETE") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id = parseInt(path.split("/")[3]);
        await env.DB.prepare("DELETE FROM reactions WHERE id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM reaction_comments WHERE reaction_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM reaction_posts WHERE reaction_id = ?").bind(id).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /auth/google ──────────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (path === "/auth/google" && request.method === "GET") {
      const redirect = url.searchParams.get("redirect") || "";
      const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth" +
        "?client_id=" + env.GOOGLE_CLIENT_ID +
        "&redirect_uri=" + encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/google/callback") +
        "&response_type=code" +
        "&scope=" + encodeURIComponent("openid email profile") +
        "&access_type=offline" +
        (redirect ? "&state=" + encodeURIComponent(redirect) : "");
      return Response.redirect(googleAuthUrl, 302);
    }

    // ── GET /auth/google/callback ─────────────────────────────
    if (path === "/auth/google/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) return Response.redirect("https://ottrank.kr?login=fail", 302);
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type:    "authorization_code",
            client_id:     env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri:  "https://ottrank-api.tdidream.workers.dev/auth/google/callback",
            code,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return Response.redirect("https://ottrank.kr?login=fail", 302);

        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: "Bearer " + tokenData.access_token },
        });
        const userData = await userRes.json();
        const providerId = String(userData.id);
        const nickname   = userData.name || "구글유저";
        const email      = userData.email || "";
        const avatar_url = userData.picture || "";

        // 기존 유저 확인 (INSERT 전에 먼저 체크)
        const existingGoogle = await env.DB.prepare(
          "SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?"
        ).bind(providerId).first();

        await env.DB.prepare(`
          INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
          VALUES ('google', ?, null, ?, ?, datetime('now'))
          ON CONFLICT(provider, provider_id) DO UPDATE SET
            email      = excluded.email,
            avatar_url = excluded.avatar_url,
            last_login = datetime('now')
        `).bind(providerId, email, avatar_url).run();

        const userRow = await env.DB.prepare(
          "SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?"
        ).bind(providerId).first();

        // 닉네임이 null이거나 비어있을 때만 신규 가입 처리
        const isNew = !existingGoogle || !existingGoogle.nickname || existingGoogle.nickname.trim() === '';

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
        `).bind(sessionId, userRow.id, expiresAt).run();

        const googleState = url.searchParams.get("state") || "";
        const googleAfter = googleState ? decodeURIComponent(googleState) : "";
        const googleBase = googleAfter ? `https://ottrank.kr${googleAfter}` : "https://ottrank.kr/";

        const redirectTo = isNew
          ? `https://ottrank.kr/signup.html?sid=${sessionId}` + (googleAfter ? `&redirect=${encodeURIComponent(googleAfter)}` : "")
          : `${googleBase}${googleBase.includes('?') ? '&' : '?'}sid=${sessionId}`;
        return new Response(null, {
          status: 302,
          headers: {
            Location:     redirectTo,
            "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
          },
        });
      } catch(e) {
        console.error("[AUTH] 구글 콜백 오류:", e.message);
        return Response.redirect("https://ottrank.kr?login=fail", 302);
      }
    }

    // ── GET /auth/naver ───────────────────────────────────────
    if (path === "/auth/naver" && request.method === "GET") {
      const redirect = url.searchParams.get("redirect") || "";
      const state = redirect ? encodeURIComponent(redirect) : crypto.randomUUID();
      const naverAuthUrl = "https://nid.naver.com/oauth2.0/authorize" +
        "?client_id=" + env.NAVER_CLIENT_ID +
        "&redirect_uri=" + encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/naver/callback") +
        "&response_type=code" +
        "&state=" + state;
      return Response.redirect(naverAuthUrl, 302);
    }

    // ── GET /auth/naver/callback ──────────────────────────────
    if (path === "/auth/naver/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) return Response.redirect("https://ottrank.kr?login=fail", 302);
      try {
        const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type:    "authorization_code",
            client_id:     env.NAVER_CLIENT_ID,
            client_secret: env.NAVER_CLIENT_SECRET,
            redirect_uri:  "https://ottrank-api.tdidream.workers.dev/auth/naver/callback",
            code,
            state: url.searchParams.get("state") || "",
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return Response.redirect("https://ottrank.kr?login=fail", 302);

        const userRes = await fetch("https://openapi.naver.com/v1/nid/me", {
          headers: { Authorization: "Bearer " + tokenData.access_token },
        });
        const userJson = await userRes.json();
        const userData  = userJson.response;
        const providerId = String(userData.id);
        const nickname   = userData.nickname || userData.name || "네이버유저";
        const email      = userData.email || "";
        const avatar_url = userData.profile_image || "";

        // 기존 유저 확인 (INSERT 전에 먼저 체크)
        const existingNaver = await env.DB.prepare(
          "SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?"
        ).bind(providerId).first();

        await env.DB.prepare(`
          INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
          VALUES ('naver', ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(provider, provider_id) DO UPDATE SET
            email      = excluded.email,
            avatar_url = excluded.avatar_url,
            last_login = datetime('now')
        `).bind(providerId, nickname, email, avatar_url).run();

        const userRow = await env.DB.prepare(
          "SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?"
        ).bind(providerId).first();

        // 닉네임이 null이거나 비어있을 때만 신규 가입 처리
        const isNew = !existingNaver || !existingNaver.nickname || existingNaver.nickname.trim() === '';

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
        `).bind(sessionId, userRow.id, expiresAt).run();

        const naverState = url.searchParams.get("state") || "";
        let naverAfter = "";
        try { naverAfter = naverState ? decodeURIComponent(naverState) : ""; } catch(e) {}
        if (naverAfter.startsWith('/')) {
          // 유효한 경로
        } else {
          naverAfter = "";
        }
        const naverBase = naverAfter ? `https://ottrank.kr${naverAfter}` : "https://ottrank.kr/";

        const redirectTo = isNew
          ? `https://ottrank.kr/signup.html?sid=${sessionId}` + (naverAfter ? `&redirect=${encodeURIComponent(naverAfter)}` : "")
          : `${naverBase}${naverBase.includes('?') ? '&' : '?'}sid=${sessionId}`;
        return new Response(null, {
          status: 302,
          headers: {
            Location:     redirectTo,
            "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
          },
        });
      } catch(e) {
        console.error("[AUTH] 네이버 콜백 오류:", e.message);
        return Response.redirect("https://ottrank.kr?login=fail", 302);
      }
    }

    // ── GET /auth/kakao ───────────────────────────────────────
    if (path === "/auth/kakao" && request.method === "GET") {
      const redirect = url.searchParams.get("redirect") || "";
      const state = redirect ? encodeURIComponent(redirect) : "";
      const kakaoAuthUrl = "https://kauth.kakao.com/oauth/authorize" +
        "?client_id=" + env.KAKAO_CLIENT_ID +
        "&redirect_uri=" + encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/kakao/callback") +
        "&response_type=code" +
        (state ? "&state=" + state : "");
      return Response.redirect(kakaoAuthUrl, 302);
    }

    // ── GET /auth/kakao/callback ──────────────────────────────
    if (path === "/auth/kakao/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) {
        return Response.redirect("https://ottrank.kr?login=fail", 302);
      }
      try {
        const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type:    "authorization_code",
            client_id:     env.KAKAO_CLIENT_ID,
            client_secret: env.KAKAO_CLIENT_SECRET,
            redirect_uri:  "https://ottrank-api.tdidream.workers.dev/auth/kakao/callback",
            code,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          return Response.redirect("https://ottrank.kr?login=fail", 302);
        }

        const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
          headers: { Authorization: "Bearer " + tokenData.access_token },
        });
        const userData = await userRes.json();
        const providerId = String(userData.id);
        const nickname   = userData.kakao_account?.profile?.nickname || "카카오유저";
        const avatar_url = userData.kakao_account?.profile?.profile_image_url || "";
        const email      = userData.kakao_account?.email || "";

        // 기존 유저 확인 (INSERT 전에 먼저 체크)
        const existingKakao = await env.DB.prepare(
          "SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?"
        ).bind(providerId).first();

        await env.DB.prepare(`
          INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
          VALUES ('kakao', ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(provider, provider_id) DO UPDATE SET
            email      = excluded.email,
            avatar_url = excluded.avatar_url,
            last_login = datetime('now')
        `).bind(providerId, nickname, email, avatar_url).run();

        const userRow = await env.DB.prepare(
          "SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?"
        ).bind(providerId).first();

        // 닉네임이 null이거나 비어있을 때만 신규 가입 처리
        const isNew = !existingKakao || !existingKakao.nickname || existingKakao.nickname.trim() === '';

        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, expires_at)
          VALUES (?, ?, ?)
        `).bind(sessionId, userRow.id, expiresAt).run();

        const stateParam = url.searchParams.get("state") || "";
        const afterLogin = stateParam ? decodeURIComponent(stateParam) : "";
        const baseUrl = afterLogin ? `https://ottrank.kr${afterLogin}` : "https://ottrank.kr/";

        const redirectTo = isNew
          ? `https://ottrank.kr/signup.html?sid=${sessionId}` + (afterLogin ? `&redirect=${encodeURIComponent(afterLogin)}` : "")
          : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}sid=${sessionId}`;
        return new Response(null, {
          status: 302,
          headers: {
            Location:     redirectTo,
            "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
          },
        });
      } catch(e) {
        console.error("[AUTH] 카카오 콜백 오류:", e.message);
        return Response.redirect("https://ottrank.kr?login=fail", 302);
      }
    }

    // ── GET /auth/me ──────────────────────────────────────────
    if (path === "/auth/me" && request.method === "GET") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sidHeader = auth.replace("Bearer ", "").trim();
        const sessionId = sidHeader || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false }), { headers });

        const session = await env.DB.prepare(
          "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false }), { headers });

        const user = await env.DB.prepare(
          "SELECT id, nickname, email, avatar_url, provider, grade, total_likes_received, created_at FROM users WHERE id = ?"
        ).bind(session.user_id).first();
        if (!user) return new Response(JSON.stringify({ ok: false }), { headers });

        // 등급 이모지 정보도 함께 반환
        const gradeInfo = await env.DB.prepare(
          "SELECT grade_name, grade_key, emoji_url, sort_order FROM grade_settings WHERE grade_key = ?"
        ).bind(user.grade || 'rookie').first();

        return new Response(JSON.stringify({ ok: true, user: { ...user, gradeInfo: gradeInfo || null } }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false }), { headers });
      }
    }

    // ── POST /auth/nickname ───────────────────────────────────
    if (path === "/auth/nickname" && request.method === "POST") {
      try {
        const body = await request.json();
        const { nickname, sid } = body;

        const sessionId = sid || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인이 필요해요" }), { status: 401, headers });

        const session = await env.DB.prepare(
          "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션이 만료됐어요" }), { status: 401, headers });

        if (!nickname || nickname.trim().length < 2) {
          return new Response(JSON.stringify({ ok: false, message: "닉네임은 2자 이상 입력해주세요" }), { status: 400, headers });
        }
        if (nickname.trim().length > 20) {
          return new Response(JSON.stringify({ ok: false, message: "닉네임은 20자 이내로 입력해주세요" }), { status: 400, headers });
        }
        if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname.trim())) {
          return new Response(JSON.stringify({ ok: false, message: "한글, 영문, 숫자만 사용할 수 있어요" }), { status: 400, headers });
        }

        const dup = await env.DB.prepare(
          "SELECT id FROM users WHERE nickname = ? AND id != ?"
        ).bind(nickname.trim(), session.user_id).first();
        if (dup) {
          return new Response(JSON.stringify({ ok: false, message: "이미 사용 중인 닉네임이에요" }), { status: 400, headers });
        }

        await env.DB.prepare(
          "UPDATE users SET nickname = ? WHERE id = ?"
        ).bind(nickname.trim(), session.user_id).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PUT /auth/nickname ────────────────────────────────────
    // 닉네임 변경 (마이페이지에서 사용)
    if (path === "/auth/nickname" && request.method === "PUT") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });

        const session = await env.DB.prepare(
          "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const body = await request.json();
        const { nickname } = body;

        if (!nickname || nickname.trim().length < 2) {
          return new Response(JSON.stringify({ ok: false, message: "닉네임은 2자 이상 입력해주세요" }), { status: 400, headers });
        }
        if (nickname.trim().length > 20) {
          return new Response(JSON.stringify({ ok: false, message: "닉네임은 20자 이내로 입력해주세요" }), { status: 400, headers });
        }
        if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname.trim())) {
          return new Response(JSON.stringify({ ok: false, message: "한글, 영문, 숫자만 사용할 수 있어요" }), { status: 400, headers });
        }

        const dup = await env.DB.prepare(
          "SELECT id FROM users WHERE nickname = ? AND id != ?"
        ).bind(nickname.trim(), session.user_id).first();
        if (dup) {
          return new Response(JSON.stringify({ ok: false, message: "이미 사용 중인 닉네임이에요" }), { status: 400, headers });
        }

        await env.DB.prepare(
          "UPDATE users SET nickname = ? WHERE id = ?"
        ).bind(nickname.trim(), session.user_id).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /auth/withdraw ─────────────────────────────
    // 회원 탈퇴 (세션/찜/후기/게시글/유저 전부 삭제)
    if (path === "/auth/withdraw" && request.method === "DELETE") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });

        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const uid = session.user_id;

        // 순서대로 삭제
        await env.DB.prepare("DELETE FROM sessions  WHERE user_id = ?").bind(uid).run();
        await env.DB.prepare("DELETE FROM wishlist  WHERE user_id = ?").bind(uid).run();
        await env.DB.prepare("DELETE FROM reviews   WHERE user_id = ?").bind(uid).run();
        await env.DB.prepare("DELETE FROM posts     WHERE user_id = ?").bind(uid).run();
        await env.DB.prepare("DELETE FROM users     WHERE id = ?").bind(uid).run();

        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            ...headers,
            "Set-Cookie": "session=; Path=/; HttpOnly; Secure; Max-Age=0",
          },
        });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /auth/logout ─────────────────────────────────────
    if (path === "/auth/logout" && request.method === "POST") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sidHeader = auth.replace("Bearer ", "").trim();
        const sessionId = sidHeader || _getSessionCookie(request);
        if (sessionId) {
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            ...headers,
            "Set-Cookie": "session=; Path=/; HttpOnly; Secure; Max-Age=0",
          },
        });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /wishlist ─────────────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (path === "/wishlist" && request.method === "GET") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false }), { status: 401, headers });
        const { results } = await env.DB.prepare(
          "SELECT * FROM wishlist WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(session.user_id).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /wishlist ────────────────────────────────────────
    if (path === "/wishlist" && request.method === "POST") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const body = await request.json();
        const { tmdb_id, title_ko, poster_path, release_year, category } = body;
        if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id 필요" }), { status: 400, headers });

        const existing = await env.DB.prepare(
          "SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?"
        ).bind(session.user_id, parseInt(tmdb_id)).first();

        if (existing) {
          await env.DB.prepare("DELETE FROM wishlist WHERE user_id = ? AND tmdb_id = ?")
            .bind(session.user_id, parseInt(tmdb_id)).run();
          ctx.waitUntil(_recalcGrade(session.user_id, env));
          return new Response(JSON.stringify({ ok: true, wishlisted: false }), { headers });
        } else {
          await env.DB.prepare(
            "INSERT INTO wishlist (user_id, tmdb_id, title_ko, poster_path, release_year, category) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(session.user_id, parseInt(tmdb_id), title_ko || "", poster_path || "", release_year || "", category || "movie").run();
          ctx.waitUntil(_recalcGrade(session.user_id, env));
          return new Response(JSON.stringify({ ok: true, wishlisted: true }), { headers });
        }
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /wishlist/check/:tmdb_id ──────────────────────────
    if (path.match(/^\/wishlist\/check\/\d+$/) && request.method === "GET") {
      try {
        const tmdb_id = parseInt(path.split("/")[3]);
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: true, wishlisted: false }), { headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: true, wishlisted: false }), { headers });
        const existing = await env.DB.prepare(
          "SELECT id FROM wishlist WHERE user_id = ? AND tmdb_id = ?"
        ).bind(session.user_id, tmdb_id).first();
        return new Response(JSON.stringify({ ok: true, wishlisted: !!existing }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: true, wishlisted: false }), { headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /reviews/:tmdb_id ─────────────────────────────────
    // ════════════════════════════════════════════════════════════
    if (path.match(/^\/reviews\/\d+$/) && request.method === "GET") {
      try {
        const tmdb_id = parseInt(path.split("/")[2]);
        const { results } = await env.DB.prepare(`
          SELECT r.*, u.nickname, u.provider, u.grade,
            gs.emoji_url as grade_emoji_url, gs.grade_name
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE r.tmdb_id = ?
          ORDER BY r.likes DESC, r.created_at DESC
        `).bind(tmdb_id).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /reviews/:tmdb_id/me ──────────────────────────────
    if (path.match(/^\/reviews\/\d+\/me$/) && request.method === "GET") {
      try {
        const tmdb_id = parseInt(path.split("/")[2]);
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: true, data: null }), { headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: true, data: null }), { headers });
        const review = await env.DB.prepare(
          "SELECT * FROM reviews WHERE tmdb_id = ? AND user_id = ?"
        ).bind(tmdb_id, session.user_id).first();
        return new Response(JSON.stringify({ ok: true, data: review || null }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /reviews/:tmdb_id ────────────────────────────────
    if (path.match(/^\/reviews\/\d+$/) && request.method === "POST") {
      try {
        const tmdb_id = parseInt(path.split("/")[2]);
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const body = await request.json();
        const { score, emotions, custom_tags, text, spoiler } = body;

        if (!score || score < 0.5 || score > 10) {
          return new Response(JSON.stringify({ ok: false, message: "별점을 선택해주세요 (0.5~10)" }), { status: 400, headers });
        }

        await env.DB.prepare(`
          INSERT INTO reviews (tmdb_id, user_id, score, emotions, custom_tags, text, spoiler)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id, user_id) DO UPDATE SET
            score       = excluded.score,
            emotions    = excluded.emotions,
            custom_tags = excluded.custom_tags,
            text        = excluded.text,
            spoiler     = excluded.spoiler,
            created_at  = datetime('now')
        `).bind(
          tmdb_id,
          session.user_id,
          score,
          JSON.stringify(emotions || []),
          JSON.stringify(custom_tags || []),
          (text || "").slice(0, 500),
          spoiler ? 1 : 0
        ).run();

        // 등급 재계산
        ctx.waitUntil(_recalcGrade(session.user_id, env));

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /reviews/:tmdb_id/like/:id ───────────────────────
    if (path.match(/^\/reviews\/\d+\/like\/\d+$/) && request.method === "POST") {
      try {
        const parts = path.split("/");
        const review_id = parseInt(parts[4]);
        const review = await env.DB.prepare(
          "SELECT user_id FROM reviews WHERE id = ?"
        ).bind(review_id).first();
        await env.DB.prepare(
          "UPDATE reviews SET likes = likes + 1 WHERE id = ?"
        ).bind(review_id).run();
        // 후기 작성자의 총 받은 좋아요 수 +1 및 등급 재계산
        if (review?.user_id) {
          await env.DB.prepare(
            "UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?"
          ).bind(review.user_id).run();
          ctx.waitUntil(_recalcGrade(review.user_id, env));
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /reviews/:tmdb_id ──────────────────────────────
    if (path.match(/^\/reviews\/\d+$/) && request.method === "DELETE") {
      try {
        const tmdb_id = parseInt(path.split("/")[2]);
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });
        await env.DB.prepare(
          "DELETE FROM reviews WHERE tmdb_id = ? AND user_id = ?"
        ).bind(tmdb_id, session.user_id).run();
        ctx.waitUntil(_recalcGrade(session.user_id, env));
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── 게시판 (posts) ────────────────────────────────────────
    // board_type: 'recommend' | 'free' | 'community'
    // ════════════════════════════════════════════════════════════

    // GET /posts?board=recommend&page=1
    if (path === "/posts" && request.method === "GET") {
      try {
        const board  = url.searchParams.get("board") || "free";
        const page   = parseInt(url.searchParams.get("page") || "1");
        const limit  = 20;
        const offset = (page - 1) * limit;

        const { results } = await env.DB.prepare(`
          SELECT p.id, p.board_type, p.title, p.like_count, p.view_count,
            p.created_at, p.is_hidden,
            u.nickname, u.grade,
            gs.emoji_url as grade_emoji_url, gs.grade_name
          FROM posts p
          JOIN users u ON p.user_id = u.id
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE p.board_type = ? AND p.is_hidden = 0
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(board, limit, offset).all();

        const countRow = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM posts WHERE board_type = ? AND is_hidden = 0"
        ).bind(board).first();

        return new Response(JSON.stringify({
          ok: true,
          data: results,
          total: countRow?.cnt || 0,
          page,
          limit,
        }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // GET /posts/:id  — 상세 조회 (조회수 +1)
    if (path.match(/^\/posts\/\d+$/) && request.method === "GET") {
      try {
        const post_id = parseInt(path.split("/")[2]);
        await env.DB.prepare(
          "UPDATE posts SET view_count = view_count + 1 WHERE id = ?"
        ).bind(post_id).run();
        const post = await env.DB.prepare(`
          SELECT p.*, u.nickname, u.grade,
            gs.emoji_url as grade_emoji_url, gs.grade_name
          FROM posts p
          JOIN users u ON p.user_id = u.id
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE p.id = ? AND p.is_hidden = 0
        `).bind(post_id).first();
        if (!post) return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
        return new Response(JSON.stringify({ ok: true, data: post }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // POST /posts  — 글쓰기
    if (path === "/posts" && request.method === "POST") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const body = await request.json();
        const { board_type, title, content } = body;

        if (!['recommend','free','community'].includes(board_type)) {
          return new Response(JSON.stringify({ ok: false, message: "올바른 게시판을 선택해주세요" }), { status: 400, headers });
        }
        if (!title || title.trim().length < 2) {
          return new Response(JSON.stringify({ ok: false, message: "제목은 2자 이상 입력해주세요" }), { status: 400, headers });
        }
        if (title.trim().length > 100) {
          return new Response(JSON.stringify({ ok: false, message: "제목은 100자 이내로 입력해주세요" }), { status: 400, headers });
        }
        if (!content || content.trim().length < 5) {
          return new Response(JSON.stringify({ ok: false, message: "내용은 5자 이상 입력해주세요" }), { status: 400, headers });
        }

        const result = await env.DB.prepare(`
          INSERT INTO posts (board_type, user_id, title, content)
          VALUES (?, ?, ?, ?)
        `).bind(board_type, session.user_id, title.trim(), content.trim()).run();

        // 글쓰기 후 등급 재계산
        ctx.waitUntil(_recalcGrade(session.user_id, env));

        return new Response(JSON.stringify({ ok: true, id: result.meta?.last_row_id }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // PATCH /posts/:id  — 글 수정
    if (path.match(/^\/posts\/\d+$/) && request.method === "PATCH") {
      try {
        const post_id = parseInt(path.split("/")[2]);
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const post = await env.DB.prepare(
          "SELECT user_id FROM posts WHERE id = ?"
        ).bind(post_id).first();
        if (!post) return new Response(JSON.stringify({ ok: false, message: "게시글 없음" }), { status: 404, headers });
        if (post.user_id !== session.user_id) {
          return new Response(JSON.stringify({ ok: false, message: "권한 없음" }), { status: 403, headers });
        }

        const body = await request.json();
        const { title, content } = body;
        await env.DB.prepare(
          "UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(title.trim(), content.trim(), post_id).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // DELETE /posts/:id  — 글 삭제
    if (path.match(/^\/posts\/\d+$/) && request.method === "DELETE") {
      try {
        const post_id = parseInt(path.split("/")[2]);
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const post = await env.DB.prepare(
          "SELECT user_id FROM posts WHERE id = ?"
        ).bind(post_id).first();
        if (!post) return new Response(JSON.stringify({ ok: false, message: "게시글 없음" }), { status: 404, headers });
        if (post.user_id !== session.user_id) {
          return new Response(JSON.stringify({ ok: false, message: "권한 없음" }), { status: 403, headers });
        }

        await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(post_id).run();
        ctx.waitUntil(_recalcGrade(session.user_id, env));
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // POST /posts/:id/like  — 게시글 좋아요
    if (path.match(/^\/posts\/\d+\/like$/) && request.method === "POST") {
      try {
        const post_id = parseInt(path.split("/")[2]);
        const post = await env.DB.prepare(
          "SELECT user_id FROM posts WHERE id = ?"
        ).bind(post_id).first();
        await env.DB.prepare(
          "UPDATE posts SET like_count = like_count + 1 WHERE id = ?"
        ).bind(post_id).run();
        if (post?.user_id) {
          await env.DB.prepare(
            "UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?"
          ).bind(post.user_id).run();
          ctx.waitUntil(_recalcGrade(post.user_id, env));
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── 회원등급 설정 (grade_settings) ───────────────────────
    // ════════════════════════════════════════════════════════════

    // GET /grade-settings  — 전체 등급 목록 (공개)
    if (path === "/grade-settings" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM grade_settings ORDER BY sort_order ASC"
        ).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // PUT /admin/grade-settings  — 등급 설정 저장 (관리자)
    // body: [ { grade_key, grade_name, emoji_url, min_reviews, min_wishlist, min_likes, is_special, sort_order } ]
    if (path === "/admin/grade-settings" && request.method === "PUT") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const grades = await request.json();
        if (!Array.isArray(grades)) {
          return new Response(JSON.stringify({ ok: false, message: "Array required" }), { status: 400, headers });
        }
        for (const g of grades) {
          await env.DB.prepare(`
            INSERT INTO grade_settings
              (grade_key, grade_name, emoji_url, min_reviews, min_wishlist, min_likes, is_special, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(grade_key) DO UPDATE SET
              grade_name  = excluded.grade_name,
              emoji_url   = excluded.emoji_url,
              min_reviews = excluded.min_reviews,
              min_wishlist= excluded.min_wishlist,
              min_likes   = excluded.min_likes,
              is_special  = excluded.is_special,
              sort_order  = excluded.sort_order
          `).bind(
            g.grade_key,
            g.grade_name,
            g.emoji_url || '',
            g.min_reviews   || 0,
            g.min_wishlist  || 0,
            g.min_likes     || 0,
            g.is_special    ? 1 : 0,
            g.sort_order    || 0
          ).run();
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // POST /admin/grade-settings/assign  — 특정 유저에게 특별 등급 수동 지정 (연출부 등)
    // body: { user_id, grade_key }
    if (path === "/admin/grade-settings/assign" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const { user_id, grade_key } = await request.json();
        if (!user_id || !grade_key) {
          return new Response(JSON.stringify({ ok: false, message: "user_id, grade_key required" }), { status: 400, headers });
        }
        await env.DB.prepare(
          "UPDATE users SET grade = ? WHERE id = ?"
        ).bind(grade_key, user_id).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // GET /admin/users  — 회원 목록 조회 (관리자)
    if (path === "/admin/users" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const page   = parseInt(url.searchParams.get("page") || "1");
        const limit  = 50;
        const offset = (page - 1) * limit;
        const search = url.searchParams.get("q") || "";

        let query = `
          SELECT u.id, u.nickname, u.provider, u.grade, u.total_likes_received,
            u.created_at, u.last_login,
            gs.grade_name, gs.emoji_url as grade_emoji_url,
            (SELECT COUNT(*) FROM reviews WHERE user_id = u.id) as review_count,
            (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
            (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        `;
        const params = [];
        if (search) {
          query += " WHERE u.nickname LIKE ?";
          params.push(`%${search}%`);
        }
        query += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /mypage ───────────────────────────────────────────
    // 내 마이페이지: 내 정보 + 후기 + 찜 + 게시글 통합
    // ════════════════════════════════════════════════════════════
    if (path === "/mypage" && request.method === "GET") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const uid = session.user_id;

        // 내 정보 (wishlist_public 포함)
        const user = await env.DB.prepare(`
          SELECT u.id, u.nickname, u.provider, u.email, u.avatar_url,
            u.grade, u.total_likes_received, u.created_at, u.wishlist_public,
            gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
            gs.is_special as grade_is_special
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE u.id = ?
        `).bind(uid).first();

        // 내 후기 (rankings 테이블 JOIN으로 포스터/작품명/카테고리 가져오기)
        const { results: reviews } = await env.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
            r.likes, r.spoiler, r.created_at,
            rk.title_ko, rk.poster_path, rk.category, rk.release_year
          FROM reviews r
          LEFT JOIN (
            SELECT tmdb_id, title_ko, poster_path, category, release_year
            FROM rankings
            WHERE tmdb_id IS NOT NULL
            GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = r.tmdb_id
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC
        `).bind(uid).all();

        // 찜한 작품 (rankings JOIN으로 포스터/제목 최신화)
        const { results: wishlist } = await env.DB.prepare(`
          SELECT w.*, 
            COALESCE(rk.title_ko, w.title_ko) as title_ko,
            COALESCE(rk.poster_path, w.poster_path) as poster_path,
            COALESCE(rk.category, w.category, 'movie') as category,
            rk.release_year
          FROM wishlist w
          LEFT JOIN (
            SELECT tmdb_id, title_ko, poster_path, category, release_year
            FROM rankings
            WHERE tmdb_id IS NOT NULL
            GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = w.tmdb_id
          WHERE w.user_id = ?
          ORDER BY w.created_at DESC
        `).bind(uid).all();

        // 게시글
        const { results: posts } = await env.DB.prepare(`
          SELECT id, board_type, title, like_count, view_count, created_at
          FROM posts
          WHERE user_id = ? AND is_hidden = 0
          ORDER BY created_at DESC
        `).bind(uid).all();

        const reviewCount   = reviews.length;
        const wishlistCount = wishlist.length;
        const likesReceived = user?.total_likes_received || 0;

        return new Response(JSON.stringify({
          ok: true,
          is_own: true,
          user,
          reviews,
          wishlist,
          posts,
          stats: {
            review_count:   reviewCount,
            wishlist_count: wishlistCount,
            likes_received: likesReceived,
            post_count:     posts.length,
          }
        }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── PATCH /mypage/wishlist-public ─────────────────────────
    // 찜 공개/비공개 토글
    // ════════════════════════════════════════════════════════════
    if (path === "/mypage/wishlist-public" && request.method === "PATCH") {
      try {
        const auth = request.headers.get("Authorization") || "";
        const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
        if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

        const body = await request.json();
        const wishlist_public = body.wishlist_public ? 1 : 0;

        await env.DB.prepare(
          "UPDATE users SET wishlist_public = ? WHERE id = ?"
        ).bind(wishlist_public, session.user_id).run();

        return new Response(JSON.stringify({ ok: true, wishlist_public }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /user/:uid ────────────────────────────────────────
    // 외부 유저 프로필 조회 (다른 유저가 볼 때)
    // ════════════════════════════════════════════════════════════
    if (path.match(/^\/user\/\d+$/) && request.method === "GET") {
      try {
        const targetUid = parseInt(path.split("/")[2]);

        const user = await env.DB.prepare(`
          SELECT u.id, u.nickname, u.grade, u.total_likes_received, u.created_at,
            u.wishlist_public,
            gs.grade_name, gs.emoji_url as grade_emoji_url, gs.is_special as grade_is_special
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE u.id = ?
        `).bind(targetUid).first();

        if (!user) return new Response(JSON.stringify({ ok: false, message: "유저를 찾을 수 없어요" }), { status: 404, headers });

        // 후기 (항상 공개, rankings JOIN)
        const { results: reviews } = await env.DB.prepare(`
          SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
            r.likes, r.spoiler, r.created_at,
            rk.title_ko, rk.poster_path, rk.category, rk.release_year
          FROM reviews r
          LEFT JOIN (
            SELECT tmdb_id, title_ko, poster_path, category, release_year
            FROM rankings
            WHERE tmdb_id IS NOT NULL
            GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = r.tmdb_id
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC
        `).bind(targetUid).all();

        // 찜한 작품 (wishlist_public = 1 일 때만, rankings JOIN)
        let wishlist = [];
        if (user.wishlist_public) {
          const { results } = await env.DB.prepare(`
            SELECT w.*,
              COALESCE(rk.title_ko, w.title_ko) as title_ko,
              COALESCE(rk.poster_path, w.poster_path) as poster_path,
              COALESCE(rk.category, w.category, 'movie') as category,
              rk.release_year
            FROM wishlist w
            LEFT JOIN (
              SELECT tmdb_id, title_ko, poster_path, category, release_year
              FROM rankings
              WHERE tmdb_id IS NOT NULL
              GROUP BY tmdb_id
            ) rk ON rk.tmdb_id = w.tmdb_id
            WHERE w.user_id = ?
            ORDER BY w.created_at DESC
          `).bind(targetUid).all();
          wishlist = results;
        }

        // 게시글 (항상 공개)
        const { results: posts } = await env.DB.prepare(`
          SELECT id, board_type, title, like_count, view_count, created_at
          FROM posts
          WHERE user_id = ? AND is_hidden = 0
          ORDER BY created_at DESC
        `).bind(targetUid).all();

        return new Response(JSON.stringify({
          ok: true,
          is_own: false,
          user,
          reviews,
          wishlist,
          wishlist_hidden: !user.wishlist_public,
          posts,
          stats: {
            review_count:   reviews.length,
            wishlist_count: user.wishlist_public ? wishlist.length : null,
            likes_received: user.total_likes_received || 0,
            post_count:     posts.length,
          }
        }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }


    // ════════════════════════════════════════════════════════════
    // ── GET /admin/categories ────────────────────────────────────
    // ott_categories 전체 조회
    // ════════════════════════════════════════════════════════════
    if (path === "/admin/categories" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const platform = url.searchParams.get("platform");
        let query = "SELECT * FROM ott_categories";
        const params = [];
        if (platform) {
          query += " WHERE platform = ?";
          params.push(platform);
        }
        query += " ORDER BY platform, category_slot";
        const { results } = params.length
          ? await env.DB.prepare(query).bind(...params).all()
          : await env.DB.prepare(query).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/categories/:id ───────────────────────────────
    // ott_categories 수정 (display_name, limits, is_active, memo_label)
    if (path.match(/^\/admin\/categories\/\d+$/) && request.method === "PATCH") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id   = parseInt(path.split("/")[3]);
        const body = await request.json();
        const { display_name, crawl_limit, main_limit, platform_limit,
                is_active, main_section, main_order,
                platform_section, platform_order, memo_label } = body;

        await env.DB.prepare(`
          UPDATE ott_categories SET
            display_name     = COALESCE(?, display_name),
            crawl_limit      = COALESCE(?, crawl_limit),
            main_limit       = COALESCE(?, main_limit),
            platform_limit   = COALESCE(?, platform_limit),
            is_active        = COALESCE(?, is_active),
            main_section     = CASE WHEN ? = '__SKIP__' THEN main_section     ELSE ? END,
            main_order       = CASE WHEN ? = '__SKIP__' THEN main_order       ELSE ? END,
            platform_section = CASE WHEN ? = '__SKIP__' THEN platform_section ELSE ? END,
            platform_order   = CASE WHEN ? = '__SKIP__' THEN platform_order   ELSE ? END,
            memo_label       = CASE WHEN ? = '__SKIP__' THEN memo_label       ELSE ? END,
            updated_at       = datetime('now')
          WHERE id = ?
        `).bind(
          display_name ?? null,
          crawl_limit  ?? null,
          main_limit   ?? null,
          platform_limit ?? null,
          is_active    ?? null,
          // main_section: body에 없으면 SKIP (기존값 유지)
          main_section === undefined ? '__SKIP__' : '__SET__',
          main_section === undefined ? null       : (main_section || null),
          // main_order: body에 없으면 SKIP
          main_order === undefined ? '__SKIP__' : '__SET__',
          main_order === undefined ? null       : (main_order ?? 0),
          // platform_section: body에 없으면 SKIP
          platform_section === undefined ? '__SKIP__' : '__SET__',
          platform_section === undefined ? null       : (platform_section || null),
          // platform_order: body에 없으면 SKIP
          platform_order === undefined ? '__SKIP__' : '__SET__',
          platform_order === undefined ? null       : (platform_order ?? 0),
          // memo_label: body에 없으면 SKIP
          memo_label === undefined ? '__SKIP__' : '__SET__',
          memo_label === undefined ? null       : (memo_label || null),
          id
        ).run();

        // admin_logs 기록
        await env.DB.prepare(`
          INSERT INTO admin_logs (action, target_id, after_value)
          VALUES ('category_setting', ?, ?)
        `).bind(String(id), JSON.stringify(body)).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /admin/review-queue ───────────────────────────────────
    // TMDB 매칭 실패 검토 큐 조회
    // ════════════════════════════════════════════════════════════
    if (path === "/admin/review-queue" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const status   = url.searchParams.get("status") || "pending";
        const platform = url.searchParams.get("platform");
        let query  = "SELECT * FROM review_queue WHERE status = ?";
        const params = [status];
        if (platform) { query += " AND platform = ?"; params.push(platform); }
        query += " ORDER BY crawled_date DESC, platform, category_slot, rank";
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/review-queue/:id/resolve ──────────────────────
    // 검토 큐 수동 매칭 해결 → works + rankings 업데이트
    if (path.match(/^\/admin\/review-queue\/\d+\/resolve$/) && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id   = parseInt(path.split("/")[3]);
        const body = await request.json();
        const { tmdb_id, title_ko, title_en } = body;

        if (!tmdb_id) {
          return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
        }

        // 큐 항목 조회
        const queueItem = await env.DB.prepare(
          "SELECT * FROM review_queue WHERE id = ?"
        ).bind(id).first();
        if (!queueItem) {
          return new Response(JSON.stringify({ ok: false, message: "Queue item not found" }), { status: 404, headers });
        }

        // TMDB에서 포스터 + 상세정보 조회
        let finalPoster = null, finalTitleKo = title_ko, finalTitleEn = title_en;
        try {
          for (const mtype of ['tv', 'movie']) {
            const tmdbResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
            );
            if (tmdbResp.ok) {
              const tmdbData = await tmdbResp.json();
              if (tmdbData.name || tmdbData.title) {
                finalPoster  = tmdbData.poster_path || null;
                if (!finalTitleKo) finalTitleKo = tmdbData.name || tmdbData.title;
                break;
              }
            }
          }
          if (!finalTitleEn) {
            for (const mtype of ['tv', 'movie']) {
              const enResp = await fetch(
                `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
              );
              if (enResp.ok) {
                const enData = await enResp.json();
                if (enData.name || enData.title) {
                  finalTitleEn = enData.title || enData.name;
                  break;
                }
              }
            }
          }
        } catch(e) {}

        const deleteDuplicates = body.delete_duplicates === true;

        // 중복 삭제 체크박스 ON → 같은 title_en의 기존 잘못된 works 삭제
        if (deleteDuplicates && (finalTitleEn || queueItem.title_en)) {
          const searchTitle = finalTitleEn || queueItem.title_en;
          const deleted = await env.DB.prepare(`
            DELETE FROM works
            WHERE title_en = ? AND tmdb_id != ?
          `).bind(searchTitle, parseInt(tmdb_id)).run();

          // admin_logs 기록
          await env.DB.prepare(`
            INSERT INTO admin_logs (action, target_id, before_value, memo)
            VALUES ('works_delete', ?, ?, ?)
          `).bind(
            String(tmdb_id),
            JSON.stringify({ title_en: searchTitle }),
              `중복 삭제: title_en="${searchTitle}" tmdb_id!=${tmdb_id}`
          ).run();
        }

        // works 테이블 INSERT (Admin 수동 = confidence_score 100)
        await env.DB.prepare(`
          INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, match_source, confidence_score)
          VALUES (?, ?, ?, ?, 'admin', 100)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko         = COALESCE(?, title_ko),
            title_en         = COALESCE(NULLIF(?, ''), title_en),
            poster_path      = COALESCE(?, poster_path),
            match_source     = 'admin',
            confidence_score = 100,
            updated_at       = datetime('now')
        `).bind(
          parseInt(tmdb_id), finalTitleKo || '', finalTitleEn || '', finalPoster,
          finalTitleKo || null, finalTitleEn || null, finalPoster
        ).run();

        // rankings 업데이트 (해당 날짜 + 플랫폼 + 슬롯 + 순위)
        await env.DB.prepare(`
          UPDATE rankings SET
            tmdb_id     = ?,
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            is_manual   = 1
          WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
        `).bind(
          parseInt(tmdb_id),
          finalTitleKo || null,
          finalTitleEn || null,
          finalPoster,
          queueItem.platform,
          queueItem.category_slot,
          queueItem.rank,
          queueItem.crawled_date
        ).run();

        // review_queue 상태 업데이트
        await env.DB.prepare(`
          UPDATE review_queue SET
            status           = 'resolved',
            resolved_tmdb_id = ?,
            resolved_at      = datetime('now')
          WHERE id = ?
        `).bind(parseInt(tmdb_id), id).run();

        // admin_logs 기록
        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value)
          VALUES ('queue_resolve', ?, ?, ?, ?)
        `).bind(
          queueItem.platform,
          queueItem.category_slot,
          String(tmdb_id),
          JSON.stringify({ tmdb_id, title_ko: finalTitleKo, title_en: finalTitleEn })
        ).run();

        return new Response(JSON.stringify({
          ok: true,
          poster_path: finalPoster,
          title_ko: finalTitleKo,
          title_en: finalTitleEn,
        }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── POST /admin/rank-override ────────────────────────────────
    // 순위 수동 조정 저장
    // ════════════════════════════════════════════════════════════
    if (path === "/admin/rank-override" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { platform, category_slot, date, tmdb_id, original_rank, override_rank, reason } = body;

        if (!platform || !category_slot || !date || !tmdb_id || !override_rank) {
          return new Response(JSON.stringify({ ok: false, message: "필수 파라미터 누락" }), { status: 400, headers });
        }

        await env.DB.prepare(`
          INSERT INTO rank_overrides
            (platform, category_slot, date, tmdb_id, original_rank, override_rank, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(platform, category_slot, date, tmdb_id) DO UPDATE SET
            override_rank = excluded.override_rank,
            reason        = excluded.reason,
            updated_at    = datetime('now')
        `).bind(
          platform, category_slot, date,
          parseInt(tmdb_id), original_rank || 0,
          parseInt(override_rank), reason || null
        ).run();

        // admin_logs 기록
        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value)
          VALUES ('rank_override', ?, ?, ?, ?, ?)
        `).bind(
          platform, category_slot, String(tmdb_id),
          JSON.stringify({ rank: original_rank }),
          JSON.stringify({ rank: override_rank, reason })
        ).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /admin/rank-override ───────────────────────────────
    // 순위 조정 취소
    if (path === "/admin/rank-override" && request.method === "DELETE") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { platform, category_slot, date, tmdb_id } = body;
        await env.DB.prepare(`
          DELETE FROM rank_overrides
          WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?
        `).bind(platform, category_slot, date, parseInt(tmdb_id)).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── GET /admin/works ─────────────────────────────────────────
    // works 테이블 조회 (검색 + 페이징)
    // ════════════════════════════════════════════════════════════
    if (path === "/admin/works" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const q        = url.searchParams.get("q") || "";
        const filter   = url.searchParams.get("filter") || "";  // "new_match" = 신규매칭
        const date     = url.searchParams.get("date") || "";    // 신규매칭 날짜 기준
        const page     = parseInt(url.searchParams.get("page") || "1");
        const limit    = 50;
        const offset   = (page - 1) * limit;

        let query, params;

        if (filter === "new_match" && date) {
          // 신규매칭 필터: 특정 날짜에 처음 매칭된 auto 작품
          query  = `SELECT * FROM works
                    WHERE first_matched_date = ?
                    AND match_source IN ('auto_claude', 'auto_tmdb')
                    ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
          params = [date, limit, offset];
        } else if (q) {
          query  = "SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?";
          params = [`%${q}%`, `%${q}%`, limit, offset];
        } else {
          query  = "SELECT * FROM works ORDER BY updated_at DESC LIMIT ? OFFSET ?";
          params = [limit, offset];
        }

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/works/:tmdb_id ───────────────────────────────
    // works 수정 (Admin만 가능, admin_logs 기록)
    if (path.match(/^\/admin\/works\/\d+$/) && request.method === "PATCH") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const tmdb_id = parseInt(path.split("/")[3]);
        const body    = await request.json();
        const { title_ko, title_en, poster_path, delete_duplicates } = body;

        // 변경 전 값 저장 (감사 로그용)
        const before = await env.DB.prepare(
          "SELECT title_ko, title_en, poster_path FROM works WHERE tmdb_id = ?"
        ).bind(tmdb_id).first();

        // 중복 삭제 체크박스 ON → 같은 title_en의 기존 잘못된 works 삭제
        if (delete_duplicates && (title_en || before?.title_en)) {
          const searchTitle = title_en || before?.title_en;
          await env.DB.prepare(`
            DELETE FROM works WHERE title_en = ? AND tmdb_id != ?
          `).bind(searchTitle, tmdb_id).run();

          await env.DB.prepare(`
            INSERT INTO admin_logs (action, target_id, before_value, memo)
            VALUES ('works_delete', ?, ?, ?)
          `).bind(
            String(tmdb_id),
            JSON.stringify({ title_en: searchTitle }),
              `중복 삭제: title_en="${searchTitle}" tmdb_id!=${tmdb_id}`
          ).run();
        }

        await env.DB.prepare(`
          UPDATE works SET
            title_ko         = COALESCE(?, title_ko),
            title_en         = COALESCE(?, title_en),
            poster_path      = COALESCE(?, poster_path),
            match_source     = 'admin',
            confidence_score = 100,
            updated_at       = datetime('now')
          WHERE tmdb_id = ?
        `).bind(
          title_ko    || null,
          title_en    || null,
          poster_path || null,
          tmdb_id
        ).run();

        // admin_logs 기록
        await env.DB.prepare(`
          INSERT INTO admin_logs (action, target_id, before_value, after_value)
          VALUES ('works_update', ?, ?, ?)
        `).bind(
          String(tmdb_id),
          JSON.stringify(before),
          JSON.stringify(body)
        ).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /admin/works/:tmdb_id ──────────────────────────────
    // works 삭제 (Admin만 가능, admin_logs 기록)
    if (path.match(/^\/admin\/works\/\d+$/) && request.method === "DELETE") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const tmdb_id = parseInt(path.split("/")[3]);

        const before = await env.DB.prepare(
          "SELECT * FROM works WHERE tmdb_id = ?"
        ).bind(tmdb_id).first();

        await env.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(tmdb_id).run();

        await env.DB.prepare(`
          INSERT INTO admin_logs (action, target_id, before_value)
          VALUES ('works_delete', ?, ?)
        `).bind(String(tmdb_id), JSON.stringify(before)).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /admin/review-queue/count ─────────────────────────────
    // 검토 큐 대기 건수 (Admin 뱃지용)
    if (path === "/admin/review-queue/count" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const row = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'"
        ).first();
        return new Response(JSON.stringify({ ok: true, count: row?.count || 0 }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /admin/new-match-count ────────────────────────────────
    // 특정 날짜 신규매칭 건수 (Admin 랭킹 테이블 버튼용)
    if (path === "/admin/new-match-count" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);
        const row  = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')"
        ).bind(date).first();
        return new Response(JSON.stringify({ ok: true, count: row?.count || 0, date }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }



    // ════════════════════════════════════════════════════════════
    // ── GET /rankings/main ───────────────────────────────────────
    // 메인페이지용 랭킹 데이터
    // main_section='tv' / 'movie' 인 카테고리를 main_order 순으로 반환
    // ════════════════════════════════════════════════════════════
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

        const tv    = {};
        const movie = {};

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
          if (row.main_section === 'tv') {
            if (!tv[key]) tv[key] = { platform: row.platform, category_slot: row.category_slot,
              display_name: row.display_name, main_order: row.main_order,
              memo_label: row.memo_label || null, items: [] };
            tv[key].items.push(item);
          } else if (row.main_section === 'movie') {
            if (!movie[key]) movie[key] = { platform: row.platform, category_slot: row.category_slot,
              display_name: row.display_name, main_order: row.main_order,
              memo_label: row.memo_label || null, items: [] };
            movie[key].items.push(item);
          }
        }

        // 각 슬롯 내부 rank 순 정렬
        for (const key of Object.keys(tv))    tv[key].items.sort((a,b) => a.rank - b.rank);
        for (const key of Object.keys(movie)) movie[key].items.sort((a,b) => a.rank - b.rank);

        const tvList    = Object.values(tv).sort((a,b) => a.main_order - b.main_order);
        const movieList = Object.values(movie).sort((a,b) => a.main_order - b.main_order);

        return new Response(JSON.stringify({
          ok: true, tv: tvList, movie: movieList
        }), { headers });

      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── GET /rankings/platform ───────────────────────────────────
    // OTT 페이지용 랭킹 데이터
    // 수동 랭킹(date='manual') 슬롯은 항상 manual 데이터로 반환
    if (path === "/rankings/platform" && request.method === "GET") {
      try {
        const platform = url.searchParams.get("platform");
        const date     = url.searchParams.get("date") || null;
        if (!platform) return new Response(JSON.stringify({ ok: false, message: "platform required" }), { status: 400, headers });

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
        const list = Object.values(groups).sort((a,b) => a.platform_order - b.platform_order);
        return new Response(JSON.stringify({ ok: true, data: list }), { headers });

      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }


    // ════════════════════════════════════════════════════════════
    // ── GET /admin/manual-rankings ───────────────────────────────
    // 수동 랭킹 조회 (date='manual' 고정)
    // ?platform=boxoffice&category_slot=category02
    // ════════════════════════════════════════════════════════════
    if (path === "/admin/manual-rankings" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const platform      = url.searchParams.get("platform");
        const category_slot = url.searchParams.get("category_slot");
        if (!platform || !category_slot) {
          return new Response(JSON.stringify({ ok: false, message: "platform, category_slot required" }), { status: 400, headers });
        }
        const { results } = await env.DB.prepare(`
          SELECT id, rank, title_ko, title_en, tmdb_id, poster_path,
                 genre, overview, release_year, tmdb_rating, source_name, memo
          FROM rankings
          WHERE date = 'manual'
            AND platform = ?
            AND category_slot = ?
          ORDER BY rank ASC
        `).bind(platform, category_slot).all();
        return new Response(JSON.stringify({ ok: true, data: results }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/manual-rankings ───────────────────────────────
    // 수동 랭킹 작품 추가
    // body: { platform, category_slot, source_name, tmdb_id, rank, memo }
    if (path === "/admin/manual-rankings" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { platform, category_slot, source_name, tmdb_id, rank, memo } = body;
        if (!platform || !category_slot || !tmdb_id || !rank) {
          return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, tmdb_id, rank required" }), { status: 400, headers });
        }

        // 프론트에서 이미 작품 정보를 선택해서 보내주므로 그대로 사용
        // works 테이블로 보완은 하되, TMDB 재조회는 절대 하지 않음
        // (TMDB 재조회 시 movie/tv 혼동으로 엉뚱한 작품이 저장되는 문제 방지)
        let title_ko     = body.title_ko     || '';
        let title_en     = body.title_en     || '';
        let poster_path  = body.poster_path  || null;
        let genre        = body.genre        || null;
        let overview     = body.overview     || null;
        let release_year = body.release_year || null;
        let tmdb_rating  = body.tmdb_rating  || null;

        // 프론트에서 정보가 누락된 경우에만 works DB로 보완 (TMDB 재조회 없음)
        if (!title_ko || !poster_path) {
          const existing = await env.DB.prepare(
            "SELECT * FROM works WHERE tmdb_id = ?"
          ).bind(parseInt(tmdb_id)).first();

          if (existing) {
            title_ko     = title_ko     || existing.title_ko     || '';
            title_en     = title_en     || existing.title_en     || '';
            poster_path  = poster_path  || existing.poster_path  || null;
            genre        = genre        || existing.genre        || null;
            overview     = overview     || existing.overview     || null;
            release_year = release_year || existing.release_year || null;
            tmdb_rating  = tmdb_rating  || existing.tmdb_rating  || null;
          }
        }

        // rankings 테이블에 date='manual' 로 저장
        // UNIQUE(date, platform, category, rank) 기준으로 충돌 처리
        await env.DB.prepare(`
          INSERT INTO rankings
            (date, platform, category, category_slot, source_name, rank,
             title_ko, title_en, tmdb_id, poster_path,
             genre, overview, release_year, tmdb_rating, is_manual, memo)
          VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(date, platform, category, rank) DO UPDATE SET
            tmdb_id      = excluded.tmdb_id,
            title_ko     = excluded.title_ko,
            title_en     = excluded.title_en,
            poster_path  = excluded.poster_path,
            genre        = excluded.genre,
            overview     = excluded.overview,
            release_year = excluded.release_year,
            tmdb_rating  = excluded.tmdb_rating,
            source_name  = excluded.source_name,
            category_slot = excluded.category_slot,
            is_manual    = 1,
            memo         = excluded.memo
        `).bind(
          platform, category_slot, category_slot,
          source_name || '',
          parseInt(rank),
          title_ko, title_en,
          parseInt(tmdb_id),
          poster_path, genre, overview, release_year, tmdb_rating,
          memo || null
        ).run();

        // admin_logs 기록
        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value)
          VALUES ('manual_ranking_add', ?, ?, ?, ?)
        `).bind(
          platform, category_slot,
          String(tmdb_id),
          JSON.stringify({ rank, title_ko, title_en, memo })
        ).run();

        return new Response(JSON.stringify({
          ok: true,
          data: { title_ko, title_en, poster_path, genre, release_year, tmdb_rating }
        }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/sync-ratings ────────────────────────────────
    // rankings 테이블의 tmdb_rating 없는 행을 works 테이블로 일괄 동기화
    if (path === "/admin/sync-ratings" && request.method === "PATCH") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        // tmdb_rating이 null이고 tmdb_id가 있는 rankings 행 조회
        const { results } = await env.DB.prepare(`
          SELECT r.id, r.tmdb_id
          FROM rankings r
          JOIN works w ON r.tmdb_id = w.tmdb_id
          WHERE r.tmdb_rating IS NULL AND r.tmdb_id IS NOT NULL AND w.tmdb_rating IS NOT NULL
          LIMIT 500
        `).all();

        if (!results.length) {
          return new Response(JSON.stringify({ ok: true, updated: 0, message: "동기화할 데이터 없음" }), { headers });
        }

        // 배치 업데이트
        const updates = results.map(row =>
          env.DB.prepare(
            "UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?"
          ).bind(row.tmdb_id, row.id)
        );
        await env.DB.batch(updates);

        return new Response(JSON.stringify({ ok: true, updated: results.length }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/rankings/reorder ────────────────────────────
    // 일반 랭킹 순위 일괄 재정렬
    // body: { date, platform, category_slot, items: [{id, rank}, ...] }
    if (path === "/admin/rankings/reorder" && request.method === "PATCH") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { date, platform, category_slot, items } = body;
        if (!date || !platform || !category_slot || !Array.isArray(items)) {
          return new Response(JSON.stringify({ ok: false, message: "date, platform, category_slot, items required" }), { status: 400, headers });
        }

        // UNIQUE(date, platform, category, rank) 충돌 방지
        // ① 임시 음수 rank로 먼저 업데이트
        // ② 정상 rank로 업데이트
        const step1 = items.map(item =>
          env.DB.prepare(
            "UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ?"
          ).bind(-parseInt(item.rank), parseInt(item.id), date, platform)
        );
        await env.DB.batch(step1);

        const step2 = items.map(item =>
          env.DB.prepare(
            "UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ?"
          ).bind(parseInt(item.rank), parseInt(item.id), date, platform)
        );
        await env.DB.batch(step2);

        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, after_value)
          VALUES ('ranking_reorder', ?, ?, ?)
        `).bind(platform, category_slot, JSON.stringify(items)).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── PATCH /admin/manual-rankings/reorder ──────────────────────
    // 수동 랭킹 순위 일괄 재정렬
    // body: { platform, category_slot, items: [{id, rank, memo}, ...] }
    if (path === "/admin/manual-rankings/reorder" && request.method === "PATCH") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { platform, category_slot, items } = body;
        if (!platform || !category_slot || !Array.isArray(items)) {
          return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, items required" }), { status: 400, headers });
        }

        // UNIQUE(date, platform, category, rank) 충돌 방지를 위해
        // ① 임시 음수 rank로 먼저 업데이트 (충돌 없음)
        // ② 정상 rank로 업데이트
        const step1 = items.map(item =>
          env.DB.prepare(
            "UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'"
          ).bind(-parseInt(item.rank), parseInt(item.id))
        );
        await env.DB.batch(step1);

        const step2 = items.map(item =>
          env.DB.prepare(
            "UPDATE rankings SET rank = ?, memo = ? WHERE id = ? AND date = 'manual'"
          ).bind(parseInt(item.rank), item.memo ?? null, parseInt(item.id))
        );
        await env.DB.batch(step2);

        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, after_value)
          VALUES ('manual_ranking_reorder', ?, ?, ?)
        `).bind(platform, category_slot, JSON.stringify(items)).run();

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── DELETE /admin/manual-rankings/:id ─────────────────────────
    // 수동 랭킹 항목 삭제
    if (path.match(/^\/admin\/manual-rankings\/\d+$/) && request.method === "DELETE") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const id = parseInt(path.split("/")[3]);
        const row = await env.DB.prepare(
          "SELECT * FROM rankings WHERE id = ? AND date = 'manual'"
        ).bind(id).first();
        if (!row) {
          return new Response(JSON.stringify({ ok: false, message: "Not found or not a manual ranking" }), { status: 404, headers });
        }
        await env.DB.prepare(
          "DELETE FROM rankings WHERE id = ? AND date = 'manual'"
        ).bind(id).run();
        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value)
          VALUES ('manual_ranking_delete', ?, ?, ?, ?)
        `).bind(
          row.platform, row.category_slot,
          String(row.tmdb_id),
          JSON.stringify({ rank: row.rank, title_ko: row.title_ko, memo: row.memo })
        ).run();
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    // ── POST /admin/categories ────────────────────────────────────
    // 신규 카테고리 슬롯 추가 (수동 랭킹용)
    if (path === "/admin/categories" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      try {
        const body = await request.json();
        const { platform, category_slot, source_name, display_name,
                crawl_limit, main_limit, platform_limit, is_active } = body;
        if (!platform || !category_slot || !source_name) {
          return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, source_name required" }), { status: 400, headers });
        }
        const maxRow = await env.DB.prepare(
          "SELECT MAX(table_index) as max_idx FROM ott_categories WHERE platform = ?"
        ).bind(platform).first();
        const table_index = (maxRow?.max_idx ?? -1) + 1;

        await env.DB.prepare(`
          INSERT INTO ott_categories
            (platform, category_slot, table_index, source_name, display_name,
             crawl_limit, main_limit, platform_limit, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(platform, category_slot) DO NOTHING
        `).bind(
          platform, category_slot, table_index,
          source_name, display_name || source_name,
          crawl_limit || 20, main_limit || 10, platform_limit || 20,
          is_active ?? 1
        ).run();

        const newRow = await env.DB.prepare(
          "SELECT * FROM ott_categories WHERE platform = ? AND category_slot = ?"
        ).bind(platform, category_slot).first();

        await env.DB.prepare(`
          INSERT INTO admin_logs (action, platform, category_slot, after_value)
          VALUES ('category_create', ?, ?, ?)
        `).bind(platform, category_slot, JSON.stringify(body)).run();

        return new Response(JSON.stringify({ ok: true, data: newRow }), { headers });
      } catch(e) {
        return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
  }
};

/* ══════════════════════════════════════════════════════════════
   회원 등급 자동 계산
   - 평점/게시글 합산(reviews + posts), 찜, 받은 좋아요 기준
   - is_special 등급(연출부, 제작자)은 관리자 수동 지정이므로 건드리지 않음
══════════════════════════════════════════════════════════════ */
async function _recalcGrade(userId, env) {
  try {
    const user = await env.DB.prepare(
      "SELECT grade, total_likes_received FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!user) return;

    // 특별 등급(is_special=1)이면 자동계산 안 함
    const currentGrade = await env.DB.prepare(
      "SELECT is_special FROM grade_settings WHERE grade_key = ?"
    ).bind(user.grade || 'rookie').first();
    if (currentGrade?.is_special) return;

    // 활동 집계
    const reviewCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM reviews WHERE user_id = ?"
    ).bind(userId).first();
    const postCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?"
    ).bind(userId).first();
    const wishlistCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM wishlist WHERE user_id = ?"
    ).bind(userId).first();

    const activityCount = (reviewCountRow?.cnt || 0) + (postCountRow?.cnt || 0);
    const wishlistCount = wishlistCountRow?.cnt || 0;
    const likesReceived = user.total_likes_received || 0;

    // 일반 등급 목록 (sort_order 내림차순 = 높은 등급부터)
    const { results: grades } = await env.DB.prepare(
      "SELECT * FROM grade_settings WHERE is_special = 0 ORDER BY sort_order DESC"
    ).all();

    let newGrade = 'rookie';
    for (const g of grades) {
      const ok =
        activityCount >= (g.min_reviews   || 0) &&
        wishlistCount >= (g.min_wishlist  || 0) &&
        likesReceived >= (g.min_likes     || 0);
      if (ok) { newGrade = g.grade_key; break; }
    }

    if (newGrade !== user.grade) {
      await env.DB.prepare(
        "UPDATE users SET grade = ? WHERE id = ?"
      ).bind(newGrade, userId).run();
    }
  } catch(e) {
    console.error("[GRADE]", e.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   YouTube 댓글 수집 + Claude 번역
══════════════════════════════════════════════════════════════ */
async function collectAndTranslateComments(reactionId, videoId, tmdbId, env) {
  try {
    console.log(`[REACTION] 댓글 수집 시작: reaction=${reactionId} video=${videoId}`);

    const ytUrl = 'https://www.googleapis.com/youtube/v3/commentThreads' +
      '?part=snippet&videoId=' + videoId +
      '&maxResults=100&order=relevance&key=' + env.YOUTUBE_API_KEY;

    const ytRes  = await fetch(ytUrl);
    const ytData = await ytRes.json();

    if (!ytRes.ok || !ytData.items?.length) {
      console.error('[REACTION] YouTube API 오류:', JSON.stringify(ytData).slice(0, 200));
      return;
    }

    const allComments = ytData.items
      .map(item => {
        const s = item.snippet.topLevelComment.snippet;
        return {
          author:    (s.authorDisplayName || '익명').replace(/^@/, ''),
          text:      (s.textDisplay || '').replace(/<[^>]*>/g, '').trim(),
          likes:     s.likeCount || 0,
          published: s.publishedAt || '',
        };
      })
      .filter(cm => cm.text.length > 5);

    const comments = allComments
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 50);

    if (!comments.length) return;

    const commentList = comments.map((cm, i) => (i + 1) + '. ' + cm.text.slice(0, 300)).join('\n');
    const prompt = '아래는 YouTube 영상의 해외 댓글 목록입니다.\n' +
      '각 댓글을 자연스러운 한국어로 번역하세요.\n\n' +
      '반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n' +
      '[\n  {"idx": 0, "translated": "번역된 댓글"},\n  ...\n]\n\n' +
      '댓글 목록:\n' + commentList;

    const claudeRes  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText    = claudeData.content?.[0]?.text || '[]';

    let translations = [];
    try {
      const cleaned = rawText.split('```json').join('').split('```').join('').trim();
      const parsed  = JSON.parse(cleaned);
      translations = Array.isArray(parsed) ? parsed : [];
    } catch(e) {
      console.error('[REACTION] Claude 응답 파싱 실패:', rawText.slice(0, 300));
      translations = [];
    }

    await env.DB.prepare(
      "DELETE FROM reaction_comments WHERE reaction_id = ?"
    ).bind(reactionId).run();

    for (let i = 0; i < comments.length; i++) {
      const cm = comments[i];
      const tr   = translations.find(t => t.idx === i)
                || translations.find(t => t.idx === i + 1)
                || translations[i]
                || {};
      const text = tr.translated || '';
      await env.DB.prepare(`
        INSERT INTO reaction_comments
          (reaction_id, tmdb_id, original_text, translated_text, author, like_count, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        reactionId, tmdbId,
        cm.text.slice(0, 1000),
        text.slice(0, 1000),
        cm.author.slice(0, 100),
        cm.likes,
        'neutral'
      ).run();
    }

    console.log(`[REACTION] ✅ 완료: reaction=${reactionId} 댓글 ${comments.length}개 저장`);
  } catch(e) {
    console.error('[REACTION] 오류:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   YouTube 추가 영상 크롤링 (관리자 수동 실행)
   - TMDB 영상 외에 YouTube에서 추가 관련 영상 수집
   - works 테이블에서 title_ko 조회 후 YouTube Data API v3 검색
   - 1차: "{title_ko} 예고편" / 2차: "{title_ko}" 인기순 폴백
   - 기존 DB에 있는 영상은 중복 저장 안 함
══════════════════════════════════════════════════════════════ */
async function _crawlYoutubeVideos(tmdb_id, env) {
  try {
    // ① works 테이블에서 한글 작품명 조회
    const work = await env.DB.prepare(
      "SELECT title_ko FROM works WHERE tmdb_id = ?"
    ).bind(tmdb_id).first();

    if (!work?.title_ko) {
      console.log(`[YT_CRAWL] tmdb_id=${tmdb_id} works 없음 — 스킵`);
      return 0;
    }
    const title_ko = work.title_ko;

    // ② DB에 이미 있는 youtube_id 목록 (중복 저장 방지)
    const { results: existingVideos } = await env.DB.prepare(
      "SELECT youtube_id FROM title_videos WHERE tmdb_id = ?"
    ).bind(tmdb_id).all();
    const existingIds = new Set(existingVideos.map(v => v.youtube_id));

    // ③ YouTube Data API v3 검색 — 1차: 예고편 / 2차: 일반 인기순
    const searchQueries = [`${title_ko} 예고편`, title_ko];
    const items = [];

    for (const query of searchQueries) {
      if (items.length >= 3) break;

      const ytUrl = `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&type=video&order=relevance&maxResults=6` +
        `&relevanceLanguage=ko` +
        `&q=${encodeURIComponent(query)}` +
        `&key=${env.YOUTUBE_API_KEY}`;

      const ytRes  = await fetch(ytUrl);
      const ytData = await ytRes.json();

      if (!ytRes.ok || !ytData.items?.length) continue;

      for (const item of ytData.items) {
        if (items.length >= 3) break;
        const videoId = item.id?.videoId;
        if (!videoId || existingIds.has(videoId)) continue;
        items.push({
          youtube_id:  videoId,
          title:       item.snippet?.title || title_ko,
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        });
        existingIds.add(videoId);
      }
    }

    if (!items.length) {
      console.log(`[YT_CRAWL] tmdb_id=${tmdb_id} "${title_ko}" 결과 없음`);
      return 0;
    }

    // ④ title_videos 저장
    for (const v of items) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, 0)
      `).bind(tmdb_id, v.youtube_url, v.youtube_id, v.title).run();
    }

    console.log(`[YT_CRAWL] ✅ tmdb_id=${tmdb_id} "${title_ko}" ${items.length}개 저장`);
    return items.length;

  } catch(e) {
    console.error(`[YT_CRAWL] tmdb_id=${tmdb_id} 오류:`, e.message);
    return 0;
  }
}

/* ══════════════════════════════════════════════════════════════
   TMDB 영상 DB 저장
   - 첫 접속 시 TMDB API에서 영상을 가져와 title_videos에 저장
   - Trailer/Teaser 우선, 나머지 뒤에
   - 첫 번째 영상을 is_main=1로 저장
══════════════════════════════════════════════════════════════ */
async function _saveTmdbVideos(tmdb_id, env) {
  try {
    // ① works 테이블에서 media_type 조회
    const work = await env.DB.prepare(
      "SELECT media_type FROM works WHERE tmdb_id = ?"
    ).bind(tmdb_id).first();
    const mediaType = work?.media_type || 'tv';

    // ② TMDB 영상 조회 (한국어 우선, 없으면 영어 폴백)
    let videos = [];
    try {
      const koRes = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${tmdb_id}/videos?language=ko-KR&api_key=${env.TMDB_API_KEY}`
      );
      videos = (await koRes.json()).results || [];
    } catch(e) {}

    if (!videos.length) {
      try {
        const enRes = await fetch(
          `https://api.themoviedb.org/3/${mediaType}/${tmdb_id}/videos?language=en-US&api_key=${env.TMDB_API_KEY}`
        );
        videos = (await enRes.json()).results || [];
      } catch(e) {}
    }

    // ③ YouTube 영상만 필터, Trailer/Teaser 우선 정렬
    const ytVideos = videos.filter(v => v.site === 'YouTube');
    const sorted   = [
      ...ytVideos.filter(v => v.type === 'Trailer' || v.type === 'Teaser'),
      ...ytVideos.filter(v => v.type !== 'Trailer' && v.type !== 'Teaser'),
    ];

    if (!sorted.length) {
      console.log(`[TMDB_SAVE] tmdb_id=${tmdb_id} TMDB 영상 없음`);
      return 0;
    }

    // ④ title_videos에 저장 (첫 번째만 is_main=1)
    for (let i = 0; i < sorted.length; i++) {
      const v      = sorted[i];
      const isMain = i === 0 ? 1 : 0;
      await env.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, ?)
      `).bind(tmdb_id, `https://www.youtube.com/watch?v=${v.key}`, v.key, v.name || '', isMain).run();
    }

    console.log(`[TMDB_SAVE] ✅ tmdb_id=${tmdb_id} ${sorted.length}개 저장`);
    return sorted.length;

  } catch(e) {
    console.error(`[TMDB_SAVE] tmdb_id=${tmdb_id} 오류:`, e.message);
    return 0;
  }
}

function _topN(rows, n) {
  const seen = {}, out = [];
  for (const row of rows) {
    const key = `${row.platform}|${row.category}`;
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] <= n) out.push(row);
  }
  return out;
}

function _checkAuth(request, env) {
  const auth  = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token === env.ADMIN_SECRET;
}

function _getSessionCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match  = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}