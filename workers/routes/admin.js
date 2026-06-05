/* ══════════════════════════════════════════════════════════════
   관리자 전용 API 라우트
   GET    /admin/title-map
   GET    /admin/rankings
   POST   /admin/fix
   POST   /admin/unfix
   GET    /admin/categories
   PATCH  /admin/categories/:id
   POST   /admin/categories
   GET    /admin/review-queue
   GET    /admin/review-queue/count
   POST   /admin/review-queue/:id/resolve
   POST   /admin/rank-override
   DELETE /admin/rank-override
   GET    /admin/works
   PATCH  /admin/works/:tmdb_id
   DELETE /admin/works/:tmdb_id
   GET    /admin/new-match-count
   GET    /admin/manual-rankings
   POST   /admin/manual-rankings
   PATCH  /admin/manual-rankings/reorder
   DELETE /admin/manual-rankings/:id
   POST   /admin/manual-rankings/save-page-category
   GET    /admin/rankings/main
   PATCH  /admin/rankings/reorder
   PATCH  /admin/sync-ratings
   GET    /admin/grade-settings
   PUT    /admin/grade-settings
   POST   /admin/grade-settings/assign
   GET    /admin/users
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

export async function handleAdmin(path, request, env, url, headers) {

  // ── GET /admin/title-map ──────────────────────────────────
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/rankings ─────────────────────────────────────
  // 랭킹 카테고리 섹션에 작품 신규 추가
  // works upsert → rankings INSERT → title_map upsert
  if (path === "/admin/rankings" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, date, tmdb_id, rank,
              title_ko, title_en, media_type, is_manual } = body;

      if (!platform || !category_slot || !date || !tmdb_id || !title_ko) {
        return new Response(JSON.stringify({
          ok: false, message: "platform, category_slot, date, tmdb_id, title_ko 필수"
        }), { status: 400, headers });
      }

      let finalPoster  = null;
      let finalTitleKo = title_ko || null;
      let finalTitleEn = title_en || null;
      let finalYear    = null;
      let finalGenre   = null;
      let finalRating  = null;
      let finalMtype   = (media_type === "tv" || media_type === "movie") ? media_type : null;

      // ① TMDB API 조회 (포스터/연도/장르/평점/영문제목)
      try {
        const mtypes = finalMtype ? [finalMtype] : ["tv", "movie"];
        for (const mtype of mtypes) {
          const tmdbResp = await fetch(
            `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
          );
          if (!tmdbResp.ok) continue;
          const tmdbData = await tmdbResp.json();
          if (!tmdbData.poster_path && !tmdbData.name && !tmdbData.title) continue;

          finalPoster = tmdbData.poster_path || null;
          finalYear   = parseInt((tmdbData.first_air_date || tmdbData.release_date || "").slice(0, 4)) || null;
          finalRating = tmdbData.vote_average ? parseFloat(tmdbData.vote_average.toFixed(1)) : null;
          finalGenre  = (tmdbData.genres || []).map(g => g.name).join(", ") || null;
          if (!finalMtype) finalMtype = mtype;
          if (!finalTitleKo) finalTitleKo = tmdbData.name || tmdbData.title || null;

          if (!finalTitleEn) {
            const enResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
            );
            if (enResp.ok) {
              const enData = await enResp.json();
              const orig   = enData.original_title || enData.original_name || "";
              const en     = enData.title || enData.name || "";
              finalTitleEn = /[\uAC00-\uD7A3]/.test(orig) ? en : (orig || en);
            }
          }
          break;
        }
      } catch (e) { /* TMDB 실패 시 기존 값으로 진행 */ }

      // ② works upsert (마스터 데이터 보장)
      await env.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type, match_source, confidence_score)
        VALUES (?, ?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          media_type       = COALESCE(?, media_type),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(
        parseInt(tmdb_id), finalTitleKo || "", finalTitleEn || "", finalPoster, finalMtype,
        finalTitleKo || null, finalTitleEn || null, finalPoster, finalMtype
      ).run();

      // ③ 마지막 순위 계산 (rank 미지정 시 자동)
      let finalRank = parseInt(rank) || null;
      if (!finalRank) {
        const lastRow = await env.DB.prepare(
          "SELECT MAX(rank) as max_rank FROM rankings WHERE platform = ? AND category_slot = ? AND date = ?"
        ).bind(platform, category_slot, date).first();
        finalRank = (lastRow?.max_rank || 0) + 1;
      }

      // ④ rankings INSERT (음수 임시 삽입 → 양수 확정, UNIQUE 충돌 방지)
      await env.DB.prepare(`
        INSERT INTO rankings
          (platform, category_slot, category, date, rank, tmdb_id,
           title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
           is_manual, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        platform, category_slot, finalMtype || category_slot, date,
        -(finalRank), parseInt(tmdb_id),
        finalTitleKo || "", finalTitleEn || "", finalPoster,
        finalYear, finalGenre, finalRating,
        is_manual ? 1 : 0, category_slot
      ).run();

      await env.DB.prepare(
        "UPDATE rankings SET rank = ? WHERE platform = ? AND category_slot = ? AND date = ? AND rank = ?"
      ).bind(finalRank, platform, category_slot, date, -(finalRank)).run();

      // ⑤ title_map upsert
      if (finalTitleEn && finalTitleKo) {
        await env.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(finalTitleEn.trim(), finalTitleKo.trim(), parseInt(tmdb_id)).run();
      }

      // ⑥ admin_logs
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_add', ?, ?, ?, ?)"
      ).bind(platform, category_slot, String(tmdb_id),
        JSON.stringify({ rank: finalRank, title_ko: finalTitleKo, date })).run();

      return new Response(JSON.stringify({
        ok: true, rank: finalRank,
        poster_path: finalPoster, title_ko: finalTitleKo, title_en: finalTitleEn,
      }), { headers });

    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/rankings ───────────────────────────────────
  if (path === "/admin/rankings" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    const date   = url.searchParams.get("date");
    const manual = url.searchParams.get("manual");
    let query, bindVal;
    if (manual === "true") {
      // 수동 데이터 전용
      query    = "SELECT * FROM rankings WHERE date = 'manual' ORDER BY platform, category_slot, rank";
      bindVal  = null;
    } else if (date) {
      query    = "SELECT * FROM rankings WHERE date = ? ORDER BY platform, category_slot, rank";
      bindVal  = date;
    } else {
      query    = "SELECT * FROM rankings WHERE date = (SELECT MAX(date) FROM rankings WHERE date != 'manual') ORDER BY platform, category_slot, rank";
      bindVal  = null;
    }
    const { results } = bindVal
      ? await env.DB.prepare(query).bind(bindVal).all()
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
      // 시즌 번호 + 프론트에서 직접 전송한 시즌 포스터 (rankings에만 저장, works 건드리지 않음)
      const season          = body.season !== undefined ? body.season : undefined;
      const frontPosterPath = body.poster_path || null; // 시즌 포스터 (프론트에서 전송)

      if (!id) return new Response(JSON.stringify({ ok: false, message: "id required" }), { status: 400, headers });

      let finalPoster  = null;
      let finalTitleKo = title_ko || null;
      let finalTitleEn = title_en || null;

      const rankRow = await env.DB.prepare(
        "SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?"
      ).bind(parseInt(id)).first();

      if (tmdb_id) {
        try {
          const mtypes = media_type === "movie" ? ["movie"] :
                         media_type === "tv"    ? ["tv"]    :
                         ["tv", "movie"];
          for (const mtype of mtypes) {
            const tmdbResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
            );
            if (!tmdbResp.ok) continue;
            const tmdbData = await tmdbResp.json();
            if (!tmdbData.poster_path && !tmdbData.name && !tmdbData.title) continue;

            finalPoster = tmdbData.poster_path || null;
            if (!finalTitleKo) finalTitleKo = tmdbData.name || tmdbData.title || null;

            if (!finalTitleEn) {
              const tmdbEnResp = await fetch(
                `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
              );
              if (tmdbEnResp.ok) {
                const tmdbEnData    = await tmdbEnResp.json();
                const originalTitle = tmdbEnData.original_title || tmdbEnData.original_name || "";
                const enTitle       = tmdbEnData.title || tmdbEnData.name || "";
                const isKorean      = /[\uAC00-\uD7A3]/.test(originalTitle);
                finalTitleEn = isKorean ? enTitle : (originalTitle || enTitle);
              }
            }
            break;
          }
        } catch (e) {}
      }

      // 시즌 포스터가 프론트에서 전송된 경우 최우선 적용 (TMDB 기본 포스터 덮어쓰기)
      if (frontPosterPath) finalPoster = frontPosterPath;

      // ① rankings 업데이트 (season 컬럼 포함 — undefined면 기존값 유지)
      const seasonBind = season !== undefined
        ? (season !== null ? parseInt(season) : null)
        : undefined; // undefined → COALESCE로 기존값 유지

      await env.DB.prepare(`
        UPDATE rankings
        SET tmdb_id     = COALESCE(?, tmdb_id),
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            season      = ${seasonBind !== undefined ? '?' : 'season'},
            is_manual   = 1
        WHERE id = ?
      `).bind(
        ...[
          tmdb_id ? parseInt(tmdb_id) : null,
          finalTitleKo, finalTitleEn, finalPoster,
          ...(seasonBind !== undefined ? [seasonBind] : []),
          parseInt(id),
        ]
      ).run();

      // ② works 테이블 upsert
      if (tmdb_id) {
        if (delete_duplicates) {
          if (finalTitleEn) {
            await env.DB.prepare(
              "DELETE FROM works WHERE title_en = ? AND tmdb_id != ?"
            ).bind(finalTitleEn, parseInt(tmdb_id)).run();
          }
          if (finalTitleKo && /[\uAC00-\uD7A3]/.test(finalTitleKo)) {
            await env.DB.prepare(
              "DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?"
            ).bind(finalTitleKo, parseInt(tmdb_id)).run();
          }
          await env.DB.prepare(
            "INSERT INTO admin_logs (action, target_id, memo) VALUES ('works_delete', ?, ?)"
          ).bind(
            String(tmdb_id),
            `중복 삭제: title_en="${finalTitleEn}" title_ko="${finalTitleKo}"`
          ).run();
        }
        const mediaTypeVal = (media_type === "tv" || media_type === "movie") ? media_type : null;
        // 시즌 포스터(frontPosterPath)는 rankings에만 저장 — works 포스터는 기본 포스터 유지
        const worksPoserPath = frontPosterPath ? null : finalPoster;
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
          parseInt(tmdb_id), finalTitleKo || "", finalTitleEn || "", worksPoserPath, mediaTypeVal,
          finalTitleKo || null, finalTitleEn || null, worksPoserPath, mediaTypeVal
        ).run();
      }

      // ③ title_map 저장
      const mapTitleEn = finalTitleEn || finalTitleKo || "";
      const mapTitleKo = finalTitleKo || finalTitleEn || "";
      if (mapTitleEn && mapTitleKo && tmdb_id) {
        await env.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(mapTitleEn.trim(), mapTitleKo.trim(), parseInt(tmdb_id)).run();
      }

      return new Response(JSON.stringify({
        ok: true, poster_path: finalPoster,
        title_ko: finalTitleKo, title_en: finalTitleEn,
      }), { headers });
    } catch (e) {
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

  // ── GET /admin/categories ────────────────────────────────────
  if (path === "/admin/categories" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const platform = url.searchParams.get("platform");
      let query      = "SELECT * FROM ott_categories";
      const params   = [];
      if (platform) { query += " WHERE platform = ?"; params.push(platform); }
      query += " ORDER BY platform, category_slot";
      const { results } = params.length
        ? await env.DB.prepare(query).bind(...params).all()
        : await env.DB.prepare(query).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/categories/:id ───────────────────────────────
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
        display_name ?? null, crawl_limit ?? null, main_limit ?? null,
        platform_limit ?? null, is_active ?? null,
        main_section   === undefined ? "__SKIP__" : "__SET__", main_section   === undefined ? null : (main_section   || null),
        main_order     === undefined ? "__SKIP__" : "__SET__", main_order     === undefined ? null : (main_order     ?? 0),
        platform_section === undefined ? "__SKIP__" : "__SET__", platform_section === undefined ? null : (platform_section || null),
        platform_order === undefined ? "__SKIP__" : "__SET__", platform_order === undefined ? null : (platform_order ?? 0),
        memo_label     === undefined ? "__SKIP__" : "__SET__", memo_label     === undefined ? null : (memo_label     || null),
        id
      ).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, after_value) VALUES ('category_setting', ?, ?)"
      ).bind(String(id), JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/categories ────────────────────────────────────
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

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('category_create', ?, ?, ?)"
      ).bind(platform, category_slot, JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true, data: newRow }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/review-queue/count ─────────────────────────────
  if (path === "/admin/review-queue/count" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'"
      ).first();
      return new Response(JSON.stringify({ ok: true, count: row?.count || 0 }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/review-queue ───────────────────────────────────
  if (path === "/admin/review-queue" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const status   = url.searchParams.get("status") || "pending";
      const platform = url.searchParams.get("platform");
      let query      = "SELECT * FROM review_queue WHERE status = ?";
      const params   = [status];
      if (platform) { query += " AND platform = ?"; params.push(platform); }
      query += " ORDER BY crawled_date DESC, platform, category_slot, rank";
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/review-queue/:id/resolve ──────────────────────
  if (path.match(/^\/admin\/review-queue\/\d+\/resolve$/) && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id   = parseInt(path.split("/")[3]);
      const body = await request.json();
      const { tmdb_id, title_ko, title_en } = body;
      if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });

      const queueItem = await env.DB.prepare(
        "SELECT * FROM review_queue WHERE id = ?"
      ).bind(id).first();
      if (!queueItem) {
        return new Response(JSON.stringify({ ok: false, message: "Queue item not found" }), { status: 404, headers });
      }

      let finalPoster = null, finalTitleKo = title_ko, finalTitleEn = title_en;
      try {
        for (const mtype of ["tv", "movie"]) {
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
          for (const mtype of ["tv", "movie"]) {
            const enResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
            );
            if (enResp.ok) {
              const enData = await enResp.json();
              if (enData.name || enData.title) { finalTitleEn = enData.title || enData.name; break; }
            }
          }
        }
      } catch (e) {}

      const deleteDuplicates = body.delete_duplicates === true;
      if (deleteDuplicates && (finalTitleEn || queueItem.title_en)) {
        const searchTitle = finalTitleEn || queueItem.title_en;
        await env.DB.prepare(
          "DELETE FROM works WHERE title_en = ? AND tmdb_id != ?"
        ).bind(searchTitle, parseInt(tmdb_id)).run();
        await env.DB.prepare(
          "INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)"
        ).bind(String(tmdb_id), JSON.stringify({ title_en: searchTitle }), `중복 삭제: title_en="${searchTitle}" tmdb_id!=${tmdb_id}`).run();
      }

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
        parseInt(tmdb_id), finalTitleKo || "", finalTitleEn || "", finalPoster,
        finalTitleKo || null, finalTitleEn || null, finalPoster
      ).run();

      await env.DB.prepare(`
        UPDATE rankings SET
          tmdb_id     = ?,
          title_ko    = COALESCE(?, title_ko),
          title_en    = COALESCE(?, title_en),
          poster_path = COALESCE(?, poster_path),
          is_manual   = 1
        WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
      `).bind(
        parseInt(tmdb_id), finalTitleKo || null, finalTitleEn || null, finalPoster,
        queueItem.platform, queueItem.category_slot, queueItem.rank, queueItem.crawled_date
      ).run();

      await env.DB.prepare(`
        UPDATE review_queue SET
          status           = 'resolved',
          resolved_tmdb_id = ?,
          resolved_at      = datetime('now')
        WHERE id = ?
      `).bind(parseInt(tmdb_id), id).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('queue_resolve', ?, ?, ?, ?)"
      ).bind(queueItem.platform, queueItem.category_slot, String(tmdb_id),
        JSON.stringify({ tmdb_id, title_ko: finalTitleKo, title_en: finalTitleEn })).run();

      return new Response(JSON.stringify({
        ok: true, poster_path: finalPoster,
        title_ko: finalTitleKo, title_en: finalTitleEn,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/rank-override ────────────────────────────────
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
      `).bind(platform, category_slot, date, parseInt(tmdb_id), original_rank || 0, parseInt(override_rank), reason || null).run();
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value) VALUES ('rank_override', ?, ?, ?, ?, ?)"
      ).bind(platform, category_slot, String(tmdb_id),
        JSON.stringify({ rank: original_rank }), JSON.stringify({ rank: override_rank, reason })).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/rank-override ───────────────────────────────
  if (path === "/admin/rank-override" && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, date, tmdb_id } = body;
      await env.DB.prepare(
        "DELETE FROM rank_overrides WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?"
      ).bind(platform, category_slot, date, parseInt(tmdb_id)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works ─────────────────────────────────────────
  if (path === "/admin/works" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q      = url.searchParams.get("q") || "";
      const filter = url.searchParams.get("filter") || "";
      const date   = url.searchParams.get("date") || "";
      const page   = parseInt(url.searchParams.get("page") || "1");
      const limit  = 50;
      const offset = (page - 1) * limit;

      let query, params;
      if (filter === "new_match" && date) {
        query  = `SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/works/:tmdb_id ───────────────────────────────
  if (path.match(/^\/admin\/works\/\d+$/) && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const body    = await request.json();
      const { title_ko, title_en, poster_path, delete_duplicates } = body;

      const before = await env.DB.prepare(
        "SELECT title_ko, title_en, poster_path FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      if (delete_duplicates && (title_en || before?.title_en)) {
        const searchTitle = title_en || before?.title_en;
        await env.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?")
          .bind(searchTitle, tmdb_id).run();
        await env.DB.prepare(
          "INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)"
        ).bind(String(tmdb_id), JSON.stringify({ title_en: searchTitle }), `중복 삭제: title_en="${searchTitle}" tmdb_id!=${tmdb_id}`).run();
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
      `).bind(title_ko || null, title_en || null, poster_path || null, tmdb_id).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)"
      ).bind(String(tmdb_id), JSON.stringify(before), JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/works/:tmdb_id ──────────────────────────────
  if (path.match(/^\/admin\/works\/\d+$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const before  = await env.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(tmdb_id).first();
      await env.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(tmdb_id).run();
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, before_value) VALUES ('works_delete', ?, ?)"
      ).bind(String(tmdb_id), JSON.stringify(before)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/new-match-count ────────────────────────────────
  if (path === "/admin/new-match-count" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const row  = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')"
      ).bind(date).first();
      return new Response(JSON.stringify({ ok: true, count: row?.count || 0, date }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/manual-rankings ───────────────────────────────
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
               genre, overview, release_year, tmdb_rating, source_name, memo, season
        FROM rankings
        WHERE date = 'manual' AND platform = ? AND category_slot = ?
        ORDER BY rank ASC
      `).bind(platform, category_slot).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/manual-rankings ───────────────────────────────
  if (path === "/admin/manual-rankings" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, source_name, tmdb_id, rank, memo } = body;
      const season = body.season !== undefined ? body.season : null; // 시즌 번호 (NULL 허용)
      if (!platform || !category_slot || !tmdb_id || !rank) {
        return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, tmdb_id, rank required" }), { status: 400, headers });
      }

      let title_ko = body.title_ko || "", title_en = body.title_en || "";
      let poster_path  = body.poster_path  || null;
      let genre        = body.genre        || null;
      let overview     = body.overview     || null;
      let release_year = body.release_year || null;
      let tmdb_rating  = body.tmdb_rating  || null;

      if (!title_ko || !poster_path) {
        const existing = await env.DB.prepare(
          "SELECT * FROM works WHERE tmdb_id = ?"
        ).bind(parseInt(tmdb_id)).first();
        if (existing) {
          title_ko     = title_ko     || existing.title_ko     || "";
          title_en     = title_en     || existing.title_en     || "";
          poster_path  = poster_path  || existing.poster_path  || null;
          genre        = genre        || existing.genre        || null;
          overview     = overview     || existing.overview     || null;
          release_year = release_year || existing.release_year || null;
          tmdb_rating  = tmdb_rating  || existing.tmdb_rating  || null;
        }
      }

      await env.DB.prepare(`
        INSERT INTO rankings
          (date, platform, category, category_slot, source_name, rank,
           title_ko, title_en, tmdb_id, poster_path,
           genre, overview, release_year, tmdb_rating, is_manual, memo, season)
        VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
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
          memo         = excluded.memo,
          season       = excluded.season
      `).bind(
        platform, category_slot, category_slot, source_name || "", parseInt(rank),
        title_ko, title_en, parseInt(tmdb_id), poster_path,
        genre, overview, release_year, tmdb_rating, memo || null,
        season !== null ? parseInt(season) : null
      ).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('manual_ranking_add', ?, ?, ?, ?)"
      ).bind(platform, category_slot, String(tmdb_id), JSON.stringify({ rank, title_ko, title_en, memo })).run();

      return new Response(JSON.stringify({
        ok: true,
        data: { title_ko, title_en, poster_path, genre, release_year, tmdb_rating }
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/manual-rankings/reorder ──────────────────────
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
      // 충돌 방지: ① 임시 음수 rank → ② 정상 rank
      const step1 = items.map(item =>
        env.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'")
          .bind(-parseInt(item.rank), parseInt(item.id))
      );
      await env.DB.batch(step1);
      const step2 = items.map(item =>
        env.DB.prepare("UPDATE rankings SET rank = ?, memo = ?, season = ? WHERE id = ? AND date = 'manual'")
          .bind(parseInt(item.rank), item.memo ?? null,
                item.season !== undefined && item.season !== null ? parseInt(item.season) : null,
                parseInt(item.id))
      );
      await env.DB.batch(step2);
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('manual_ranking_reorder', ?, ?, ?)"
      ).bind(platform, category_slot, JSON.stringify(items)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/manual-rankings/:id ─────────────────────────
  if (path.match(/^\/admin\/manual-rankings\/\d+$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id  = parseInt(path.split("/")[3]);
      const row = await env.DB.prepare(
        "SELECT * FROM rankings WHERE id = ? AND date = 'manual'"
      ).bind(id).first();
      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "Not found or not a manual ranking" }), { status: 404, headers });
      }
      await env.DB.prepare("DELETE FROM rankings WHERE id = ? AND date = 'manual'").bind(id).run();
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value) VALUES ('manual_ranking_delete', ?, ?, ?, ?)"
      ).bind(row.platform, row.category_slot, String(row.tmdb_id),
        JSON.stringify({ rank: row.rank, title_ko: row.title_ko, memo: row.memo })).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/rankings/reorder ────────────────────────────
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
      // category_slot 조건 추가 — 같은 platform의 다른 슬롯 rank 오염 방지
      const step1 = items.map(item =>
        env.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?")
          .bind(-parseInt(item.rank), parseInt(item.id), date, platform, category_slot)
      );
      await env.DB.batch(step1);
      const step2 = items.map(item =>
        env.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?")
          .bind(parseInt(item.rank), parseInt(item.id), date, platform, category_slot)
      );
      await env.DB.batch(step2);
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('ranking_reorder', ?, ?, ?)"
      ).bind(platform, category_slot, JSON.stringify(items)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/sync-ratings ────────────────────────────────
  if (path === "/admin/sync-ratings" && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
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
      const updates = results.map(row =>
        env.DB.prepare("UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?")
          .bind(row.tmdb_id, row.id)
      );
      await env.DB.batch(updates);
      return new Response(JSON.stringify({ ok: true, updated: results.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /grade-settings (admin) ───────────────────────────
  if (path === "/admin/grade-settings" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    // 공개용 /grade-settings와 동일 데이터, admin 접근용 별도 경로
    try {
      const { results } = await env.DB.prepare(
        "SELECT * FROM grade_settings ORDER BY sort_order ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PUT /admin/grade-settings ─────────────────────────────
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
            grade_name   = excluded.grade_name,
            emoji_url    = excluded.emoji_url,
            min_reviews  = excluded.min_reviews,
            min_wishlist = excluded.min_wishlist,
            min_likes    = excluded.min_likes,
            is_special   = excluded.is_special,
            sort_order   = excluded.sort_order
        `).bind(
          g.grade_key, g.grade_name, g.emoji_url || "",
          g.min_reviews  || 0, g.min_wishlist || 0, g.min_likes || 0,
          g.is_special   ? 1 : 0, g.sort_order || 0
        ).run();
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/grade-settings/assign ─────────────────────
  if (path === "/admin/grade-settings/assign" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { user_id, grade_key } = await request.json();
      if (!user_id || !grade_key) {
        return new Response(JSON.stringify({ ok: false, message: "user_id, grade_key required" }), { status: 400, headers });
      }
      await env.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(grade_key, user_id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/users ──────────────────────────────────────
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
          (SELECT COUNT(*) FROM reviews  WHERE user_id = u.id) as review_count,
          (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
          (SELECT COUNT(*) FROM posts    WHERE user_id = u.id) as post_count
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
      `;
      const params = [];
      if (search) { query += " WHERE u.nickname LIKE ?"; params.push(`%${search}%`); }
      query += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
