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
   GET    /admin/works                (?sort=recent 기본값=created_at DESC, ?sort=updated=updated_at DESC)
   PATCH  /admin/works/:tmdb_id
   PATCH  /admin/works/:tmdb_id/hero-backdrop  ← 핫100 히어로 캐러셀 배경이미지 수동 선택(2026-07-11 신설, 다른 필드는 안 건드리는 격리된 엔드포인트)
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
   POST   /admin/ott-points/adjust
   POST   /admin/works/collect-keywords
   POST   /admin/works/backfill-normalize-keywords   ← work_keywords/keyword_translation 정규화 백필
   POST   /admin/keywords/translate                  ← 영→한 키워드 AI 초벌 번역 (Claude Haiku)
   GET    /admin/keywords/review                     ← 키워드 번역 검토 대기(source='auto') 목록
   POST   /admin/keywords/review                     ← 키워드 번역 관리자 확정 저장(source='admin')
   GET    /admin/keywords/search                     ← 키워드 en/ko 검색 (오탐 발견 시 수동 수정용)
   POST   /admin/keywords/update                      ← 특정 키워드 한글 번역 개별 수정
   POST   /admin/works/discover-collect
   POST   /admin/works/classify-variety
   GET    /admin/variety-genre-options
   GET    /admin/works/variety-review
   POST   /admin/works/variety-review
   POST   /admin/works/variety-review/skip
   POST   /admin/works/pinned-similar
   GET    /admin/works/pinned-similar/:tmdb_id
   DELETE /admin/works/pinned-similar
   POST   /admin/persons/collect
   POST   /admin/works/backfill-language
   POST   /admin/works/backfill-release-year
   POST   /admin/works/backfill-rating
   POST   /admin/works/batch-imdb-search   ← IMDb 매칭 배치 (OMDB 제목검색)
   POST   /admin/works/imdb-manual         ← IMDb 평점 수동 입력 (OMDB 반영 지연 대응)
   GET    /admin/works/missing-media-type
   POST   /admin/works/bulk-set-media-type
   GET    /work-ott/:tmdb_id          ← OTT 오버라이드 조회 (인증 불필요 — 작품 페이지 호출)
   POST   /work-ott                   ← OTT 오버라이드 추가/수정 (관리자 전용)
   DELETE /work-ott/:id               ← OTT 오버라이드 삭제/복원 (관리자 전용)
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

export async function handleAdmin(path, request, env, url, headers) {

  /* ══════════════════════════════════════════════════════════════
     OTT 보러가기 수동 오버라이드 API
     ── GET  /work-ott/:tmdb_id  → 조회 (인증 불필요, 작품 페이지용)
     ── POST /work-ott           → 추가/수정 (관리자 전용)
     ── DELETE /work-ott/:id     → 삭제/복원 (관리자 전용)
  ══════════════════════════════════════════════════════════════ */

  // ── GET /work-ott/:tmdb_id ─────────────────────────────────
  // 작품 페이지에서 인증 없이 호출 → _checkAuth 불필요
  const workOttGetMatch = path.match(/^\/work-ott\/(\d+)$/);
  if (workOttGetMatch && request.method === "GET") {
    const tmdbId = parseInt(workOttGetMatch[1]);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, tmdb_id, ott_key, action, created_at
         FROM work_ott_overrides
         WHERE tmdb_id = ?
         ORDER BY created_at DESC`
      ).bind(tmdbId).all();
      return new Response(JSON.stringify({ ok: true, data: results || [] }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  // ── POST /work-ott ─────────────────────────────────────────
  // 관리자 전용 — 오버라이드 추가 또는 action 변경 (UPSERT)
  if (path === "/work-ott" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { tmdb_id, ott_key, action } = body;

      // 유효성 검사
      if (!tmdb_id || !ott_key || !action) {
        return new Response(JSON.stringify({
          ok: false, error: "tmdb_id, ott_key, action 필수"
        }), { status: 400, headers });
      }
      if (!["add", "remove"].includes(action)) {
        return new Response(JSON.stringify({
          ok: false, error: "action은 'add' 또는 'remove'만 허용"
        }), { status: 400, headers });
      }

      // UPSERT: 동일 tmdb_id+ott_key면 action 업데이트
      await env.DB.prepare(
        `INSERT INTO work_ott_overrides (tmdb_id, ott_key, action)
         VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id, ott_key)
         DO UPDATE SET action = excluded.action,
                       created_at = datetime('now')`
      ).bind(tmdb_id, ott_key, action).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /work-ott/:id ───────────────────────────────────
  // 관리자 전용 — 오버라이드 삭제 (자동 로직으로 복원)
  const workOttDelMatch = path.match(/^\/work-ott\/(\d+)$/);
  if (workOttDelMatch && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
    }
    const id = parseInt(workOttDelMatch[1]);
    try {
      await env.DB.prepare(
        `DELETE FROM work_ott_overrides WHERE id = ?`
      ).bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

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
        platform, category_slot, category_slot, date,
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

  // ── PATCH /admin/rankings/:id ─────────────────────────────
  // 체크박스 크롤링 고정(is_manual=2) / 해제(is_manual=0) 전용
  // POST /admin/fix(is_manual=1) 와 완전히 별도 — works/title_map 수정 없음
  const crawlLockMatch = path.match(/^\/admin\/rankings\/(\d+)$/);
  if (crawlLockMatch && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const rankingId = parseInt(crawlLockMatch[1]);
      const { is_manual } = await request.json();

      // is_manual 값 검증: 0(해제) 또는 2(크롤링 고정)만 허용
      if (is_manual !== 0 && is_manual !== 2) {
        return new Response(JSON.stringify({
          ok: false, message: "is_manual 값은 0(해제) 또는 2(크롤링고정)만 허용됩니다."
        }), { status: 400, headers });
      }

      // 대상 행 존재 여부 확인
      const row = await env.DB.prepare(
        "SELECT id, platform, category_slot, title_ko FROM rankings WHERE id = ?"
      ).bind(rankingId).first();

      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "해당 랭킹을 찾을 수 없습니다." }), { status: 404, headers });
      }

      // is_manual 업데이트 (1=수동고정은 건드리지 않음 — PATCH 전용이라 명시적 값만 세팅)
      await env.DB.prepare(
        "UPDATE rankings SET is_manual = ? WHERE id = ?"
      ).bind(is_manual, rankingId).run();

      // 관리자 로그 기록
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('crawl_lock', ?, ?, ?, ?)"
      ).bind(
        row.platform, row.category_slot, String(rankingId),
        JSON.stringify({ is_manual, title_ko: row.title_ko })
      ).run();

      return new Response(JSON.stringify({ ok: true, is_manual }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
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
              platform_section, platform_order, memo_label,
              hot100_eligible, hot100_weight } = body;

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
          hot100_eligible  = CASE WHEN ? = '__SKIP__' THEN hot100_eligible  ELSE ? END,
          hot100_weight    = COALESCE(?, hot100_weight),
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
        hot100_eligible === undefined ? "__SKIP__" : "__SET__", hot100_eligible === undefined ? null : (hot100_eligible ?? 0),
        hot100_weight ?? null,
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

  // ── GET /admin/works/:tmdb_id (단건 조회) ─────────────────────
  if (path.match(/^\/admin\/works\/\d+$/) && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const row = await env.DB.prepare(
        "SELECT * FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();
      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true, data: row }), { headers });
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
      const sort   = url.searchParams.get("sort") || "recent"; // 'recent'=최근 등록순(기본) | 'updated'=최근 수정순
      const page   = parseInt(url.searchParams.get("page") || "1");
      const limit  = 50;
      const offset = (page - 1) * limit;

      // 정렬 기준 컬럼 — created_at이 없는(마이그레이션 전) 초기 상태를 대비해 COALESCE로 안전하게 폴백
      // 2차 정렬 기준(id DESC): 기존 데이터는 마이그레이션 시점 일괄 백필로 created_at이 전부 동점이라,
      // 이 경우 실제 PK(id, AUTOINCREMENT)가 큰(=테이블에 더 나중에 INSERT된) 행을 우선 노출
      // ⚠️ id는 tmdb_id와 무관한 별도 PK 컬럼 — sqlite_master 스키마 확인으로 검증됨
      const orderBy = sort === "updated"
        ? "updated_at DESC, id DESC"
        : "COALESCE(created_at, updated_at) DESC, id DESC";

      let query, params;
      if (filter === "new_match" && date) {
        query  = `SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [date, limit, offset];
      } else if (q) {
        query  = `SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [`%${q}%`, `%${q}%`, limit, offset];
      } else {
        query  = `SELECT * FROM works ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
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
      const { title_ko, title_en, poster_path, delete_duplicates, media_type, mbti_tags } = body;

      // media_type 유효값만 허용 (tv / movie / null)
      const finalMediaType = (media_type === 'tv' || media_type === 'movie') ? media_type : null;

      // mbti_tags: "ENFP:95,ENTJ:80,ISTJ:75" 형식 또는 null
      // undefined면 기존값 유지 (COALESCE), null이면 명시적 초기화
      const mbtiTagsProvided = mbti_tags !== undefined;
      const finalMbtiTags    = mbtiTagsProvided
        ? (mbti_tags || null)   // 빈 문자열은 null로 저장
        : undefined;

      const before = await env.DB.prepare(
        "SELECT title_ko, title_en, poster_path, media_type FROM works WHERE tmdb_id = ?"
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
          media_type       = ?,
          mbti_tags        = ${mbtiTagsProvided ? '?' : 'mbti_tags'},
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
        WHERE tmdb_id = ?
      `).bind(
        title_ko || null,
        title_en || null,
        poster_path || null,
        finalMediaType,
        ...(mbtiTagsProvided ? [finalMbtiTags] : []),
        tmdb_id
      ).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)"
      ).bind(String(tmdb_id), JSON.stringify(before), JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/works/:tmdb_id/hero-backdrop ──────────────────
  // [2026-07-11 신설] 핫100 히어로 캐러셀용 배경이미지 수동 선택.
  // ⚠️ 기존 PATCH /admin/works/:tmdb_id는 media_type을 안 보내면 null로 덮어써버리는
  // 문제가 있어서(TMDB ID 충돌 방지에 중요한 필드), 배경이미지 하나만 딱 격리해서
  // 건드리는 별도 엔드포인트로 분리함. hero_backdrop_path 외 다른 컬럼은 전혀 안 건드림.
  if (path.match(/^\/admin\/works\/\d+\/hero-backdrop$/) && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const body    = await request.json();
      const { backdrop_path } = body; // null이면 선택 해제(기본 이미지로 되돌림)

      await env.DB.prepare(
        "UPDATE works SET hero_backdrop_path = ? WHERE tmdb_id = ?"
      ).bind(backdrop_path || null, tmdb_id).run();

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
      // tmdb_rating은 0점(투표수 부족)도 유효한 값이므로 ?? 사용
      // (|| 사용 시 0이 null로 사라지는 버그 — admin.html 프론트에서 이미 한 번 고쳤는데
      //  백엔드에서 다시 걸러지고 있던 것을 여기서 함께 수정)
      let tmdb_rating  = body.tmdb_rating  ?? null;
      const media_type = (body.media_type === "tv" || body.media_type === "movie") ? body.media_type : null;

      // works 테이블에서 부족한 필드 보완 — title_en도 title_ko/poster_path와 별개로 반드시 확인
      // (기존엔 title_ko·poster_path가 이미 있으면 이 조회 자체를 건너뛰어서 title_en이 계속 빈 값으로 저장되던 버그)
      if (!title_ko || !poster_path || !title_en) {
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
          // tmdb_rating도 동일하게 ?? — 요청에 값이 없을 때만(undefined/null) works 기존값으로 보완
          tmdb_rating  = tmdb_rating  ?? existing.tmdb_rating  ?? null;
        }
      }

      // works에도 없으면 TMDB에서 영문 제목 직접 조회 (/admin/fix와 동일 패턴)
      if (!title_en) {
        try {
          const mtypes = media_type ? [media_type] : ["tv", "movie"];
          for (const mtype of mtypes) {
            const tmdbEnResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
            );
            if (!tmdbEnResp.ok) continue;
            const tmdbEnData = await tmdbEnResp.json();
            if (!tmdbEnData.name && !tmdbEnData.title) continue;
            const originalTitle = tmdbEnData.original_title || tmdbEnData.original_name || "";
            const enTitle       = tmdbEnData.title || tmdbEnData.name || "";
            const isKorean      = /[\uAC00-\uD7A3]/.test(originalTitle);
            title_en = isKorean ? enTitle : (originalTitle || enTitle);
            break;
          }
        } catch (e) { /* TMDB 조회 실패 시 title_en 빈 값 유지 — 저장 자체는 계속 진행 */ }
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

      // works 테이블에도 title_en·평점 보완 (COALESCE로 3키 원칙 보호 — 이미 값이 있으면 덮어쓰지 않음)
      // 이걸 안 하면 다음에 또 같은 tmdb_id로 등록할 때마다 매번 TMDB를 다시 조회해야 함
      //
      // tmdb_rating: title_en과 달리 "보호 대상 아님" 원칙에 따라 항상 최신값으로 덮어씀
      //   (COALESCE(excluded.값, works.기존값) — 0점도 유효한 값이라 그대로 반영됨)
      // rating_updated_at: 이 저장 시점에 이미 관리자가 TMDB에서 최신 평점을 확인해온 것이므로
      //   현재 시각으로 기록 → 방문 시 자동 새로고침 로직이 "최근에 확인함"으로 인식해
      //   불필요한 재조회를 하지 않게 됨
      // title_en이 비어있어도(TMDB 조회 실패 등) 평점 동기화는 별도로 계속 진행되도록,
      // 기존의 `if (title_en)` 조건 밖으로 빼서 tmdb_id만 있으면 항상 실행되게 함
      const nowIsoManual = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, tmdb_rating, rating_updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_en          = CASE
            WHEN excluded.title_en IS NULL OR excluded.title_en = '' THEN works.title_en
            ELSE COALESCE(NULLIF(works.title_en, ''), excluded.title_en)
          END,
          tmdb_rating       = COALESCE(excluded.tmdb_rating, works.tmdb_rating),
          rating_updated_at = excluded.rating_updated_at,
          updated_at        = datetime('now')
      `).bind(
        parseInt(tmdb_id), title_ko || "", title_en || "", poster_path,
        tmdb_rating, nowIsoManual
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

  // ── POST /admin/works/collect-keywords ────────────────────
  // keywords가 비어있는 works를 대상으로 TMDB에서 일괄 수집
  // Workers 실행시간 제한 때문에 요청당 limit(기본 20, 최대 50)개씩만 처리 —
  // 어드민 화면에서 remaining이 0이 될 때까지 반복 호출하는 방식으로 사용
  if (path === "/admin/works/collect-keywords" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 20, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE keywords IS NULL OR keywords = ''
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({ ok: true, processed: 0, attempted: 0, remaining: 0, message: "수집할 작품 없음" }), { headers });
      }

      let processed = 0;
      let skippedRetry = 0; // 이번 배치에서 응답 실패로 재시도 대기 상태로 남긴 개수
      const updates = [];
      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let keywords  = "";
        let anySuccess = false; // TMDB로부터 정상 응답을 한 번이라도 받았는지
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}/keywords?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue; // 이 media_type 실패 — 다음 타입 시도 (anySuccess는 그대로)
            anySuccess = true;
            const data   = await resp.json();
            const kwList = data.keywords || data.results || []; // 영화: keywords, TV: results
            if (kwList.length) {
              keywords = kwList.map(k => k.name).filter(Boolean).join(",");
              break;
            }
          } catch (e) { /* 네트워크 오류 — 다음 media_type으로 계속 시도 */ }
        }

        if (keywords) {
          // 정상적으로 키워드를 찾음
          updates.push(
            env.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind(keywords, row.tmdb_id)
          );
          processed++;
        } else if (anySuccess) {
          // TMDB가 정상 응답했는데 진짜로 키워드가 없는 경우만 '__NONE__' 확정
          // (프론트/검색 쪽에서 keywords==='__NONE__'이면 빈 배열로 취급)
          updates.push(
            env.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind("__NONE__", row.tmdb_id)
          );
        } else {
          // 응답 자체를 한 번도 못 받음(네트워크 오류/TMDB 일시 오류) — __NONE__로 마킹하지 않고
          // keywords를 그대로 둬서(NULL/'') 다음 배치에서 자동 재시도되게 함
          skippedRetry++;
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE keywords IS NULL OR keywords = ''"
      ).first();

      return new Response(JSON.stringify({
        ok: true, processed, attempted: targets.length, skippedRetry, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-normalize-keywords ────────────
  // works.keywords(콤마 문자열)를 work_keywords(정규화 테이블)로 분해해서 옮기고,
  // 등장하는 영문 키워드를 keyword_translation에도 함께 등록(keyword_ko는 NULL로 남겨두고,
  // 이후 별도 AI 번역 배치가 채움 — 예능 태그 자동분류와 동일한 "auto 초안 → admin 확정" 구조 예정).
  // 외부 API 호출이 전혀 없는 순수 D1 내부 작업이라, collect-keywords류(외부 API 호출, 30~50개)보다
  // 훨씬 큰 단위(기본 200, 최대 300)로 처리 가능.
  // works.keywords_normalized_at으로 처리 여부를 추적 — 키워드가 없는/'__NONE__'인 작품도
  // "시도함"으로 마킹해서 매 배치마다 헛되이 다시 후보로 잡히지 않게 함
  // (release_year=0, original_language='unknown'과 동일한 센티널 원칙).
  // ⚠️ 2026-07-09 수정: 초기 버전은 "keywords가 아직 비어있는(=수집 전) 작품"까지 도장을 찍어버려서,
  //    이후 collect-keywords로 키워드가 채워져도 정규화 후보에서 영구 제외되는 버그가 있었음.
  //    → keywords IS NOT NULL AND keywords != '' 조건을 추가해, "수집 전이라 아직 모름"과
  //      "__NONE__(TMDB가 확인해줬는데 진짜 없음, 확정값)"을 구분해서, 확정된 것만 도장 찍도록 수정.
  if (path === "/admin/works/backfill-normalize-keywords" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 200, 300);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, keywords FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({ ok: true, processed: 0, attempted: 0, remaining: 0, message: "정규화할 작품 없음" }), { headers });
      }

      const statements = [];
      let processed = 0;
      const nowIso = new Date().toISOString();

      for (const row of targets) {
        // '__NONE__'은 "TMDB에 키워드 자체가 없어서 시도했지만 결과 없음" 센티널 —
        // collect-keywords와 동일하게, 글자 그대로 정규화 대상에 넣지 않도록 명시적으로 제외
        if (row.keywords && row.keywords !== '__NONE__') {
          // 같은 작품 안에서 키워드가 중복되는 경우 대비 Set으로 dedupe
          // (work_keywords에 tmdb_id+keyword UNIQUE 인덱스가 있어 중복 INSERT는 어차피 막히지만,
          //  batch 문 개수 자체를 줄여서 가볍게 처리하기 위함)
          const kwSet = new Set(
            row.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
          );
          if (kwSet.size) {
            for (const kw of kwSet) {
              statements.push(
                env.DB.prepare(
                  "INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)"
                ).bind(row.tmdb_id, kw)
              );
              statements.push(
                env.DB.prepare(
                  "INSERT OR IGNORE INTO keyword_translation (keyword_en) VALUES (?)"
                ).bind(kw)
              );
            }
            processed++;
          }
        }
        // 키워드 유무와 무관하게 항상 "시도함" 마킹 (무한 재대상화 방지)
        statements.push(
          env.DB.prepare(
            "UPDATE works SET keywords_normalized_at = ? WHERE tmdb_id = ?"
          ).bind(nowIso, row.tmdb_id)
        );
      }

      if (statements.length) await env.DB.batch(statements);

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
      `).first();

      return new Response(JSON.stringify({
        ok: true, processed, attempted: targets.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      // batch()는 실패 시 통째로 롤백되므로(부분 반영 없음), 안전하게 그대로 재시도 가능
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/keywords/translate ─────────────────────────
  // keyword_translation.keyword_ko가 비어있는(source IS NULL) 영문 키워드를
  // Claude API(Haiku)로 일괄 초벌 번역해 source='auto'로 저장.
  // 예능 태그 자동분류(classify-variety)와 동일한 "auto 초안 → admin 검토/확정" 구조 —
  // admin/keywords/review(POST)에서 source='admin'으로 확정되면 이 배치가 다시 건드리지 않음.
  // 짧은 단어/구 단위라 예능 태그(줄거리 포함)보다 프롬프트 부담이 적어 배치를 더 크게(기본 40, 최대 60) 잡음.
  //
  // ⚠️ 2026-07-11 수정 — "Claude가 요청받은 키워드를 응답에서 빠뜨리는" 경우 무한루프 방지
  // 기존엔 Claude 응답에 없는 키워드를 그냥 continue로 넘기고 아무 기록도 안 남겼음.
  // source가 계속 NULL로 남아있으니 다음 배치에서 다시 뽑히고, Claude가 같은 이유로
  // 또 빠뜨리면 영원히 반복(실제로 'pacific ocean' 1개가 이 패턴으로 무한루프 발생 확인됨).
  // collect-keywords의 __NONE__ 오탐 버그(2026-07-02)와 같은 계열 — "응답 실패"와
  // "아직 처리 안 함"을 구분 안 해서 생기는 문제. translate_attempts로 시도 횟수를
  // 추적해서, 일정 횟수(3회) 넘게 계속 빠지면 자동배치 대상에서 제외(관리자 수동 처리로 전환).
  if (path === "/admin/keywords/translate" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        ok: false, message: "ANTHROPIC_API_KEY가 Workers Secrets에 설정되어 있지 않습니다"
      }), { status: 500, headers });
    }

    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 40, 60);

      const { results: targets } = await env.DB.prepare(`
        SELECT keyword_en FROM keyword_translation
        WHERE source IS NULL
          AND (translate_attempts IS NULL OR translate_attempts < 3)
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, translated: 0, remaining: 0, message: "번역할 키워드 없음"
        }), { headers });
      }

      const kwListText = targets.map(t => `- ${t.keyword_en}`).join("\n");

      const systemPrompt =
        "너는 TMDB 영문 작품 키워드(테마/분위기 태그)를 한국 OTT 서비스 사용자용으로 번역하는 도우미다. " +
        "각 영문 키워드를 자연스럽고 간결한 한국어 명사구(대략 2~8자)로 번역해라. " +
        "직역보다 한국 시청자에게 익숙한 표현을 우선해라(예: revenge→복수, chaebol→재벌, coming of age→성장). " +
        "설명이나 부연 없이, 요청받은 키워드 전부에 대해 1:1로 번역해라. " +
        "반드시 JSON 배열만 출력하고, 다른 설명이나 코드블록(```)은 절대 포함하지 마라. " +
        "출력 형식: [{\"keyword_en\":\"revenge\",\"keyword_ko\":\"복수\"}, ...]";

      const userPrompt = `번역할 키워드 목록:\n${kwListText}`;

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!claudeResp.ok) {
        const errText = await claudeResp.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false, message: `Claude API 오류 (status ${claudeResp.status})`, detail: errText.slice(0, 300),
        }), { status: 502, headers });
      }

      const claudeData = await claudeResp.json();
      const rawText = (claudeData.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      let parsed;
      try {
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false, message: "Claude 응답 파싱 실패 — 다시 시도해주세요", raw: rawText.slice(0, 300),
        }), { status: 502, headers });
      }
      if (!Array.isArray(parsed)) parsed = [];

      // 이번 배치에 실제로 요청한 키워드만 반영(할루시네이션/다른 키워드 오염 방지)
      const targetSet = new Set(targets.map(t => t.keyword_en));
      const resultMap = new Map();
      for (const item of parsed) {
        const en = (item.keyword_en || "").trim().toLowerCase();
        const ko = (item.keyword_ko || "").trim();
        if (!en || !ko || !targetSet.has(en)) continue;
        resultMap.set(en, ko);
      }

      const updates = [];
      let translated = 0;
      for (const t of targets) {
        if (!resultMap.has(t.keyword_en)) {
          // Claude 응답에 없음 — 그냥 넘어가면 다음 배치에서 계속 같은 이유로
          // 빠질 수 있어 무한루프가 됨. 시도 횟수를 기록해서, 3회 넘게 반복되면
          // 자동배치 조회 조건(WHERE translate_attempts < 3)에서 자연스럽게 빠지게 함.
          updates.push(
            env.DB.prepare(
              "UPDATE keyword_translation SET translate_attempts = COALESCE(translate_attempts, 0) + 1 " +
              "WHERE keyword_en = ? AND source IS NULL"
            ).bind(t.keyword_en)
          );
          continue;
        }
        updates.push(
          env.DB.prepare(
            "UPDATE keyword_translation SET keyword_ko = ?, source = 'auto' WHERE keyword_en = ? AND source IS NULL"
          ).bind(resultMap.get(t.keyword_en), t.keyword_en)
        );
        translated++;
      }
      if (updates.length) await env.DB.batch(updates);

      // remaining: 자동배치가 다음에 실제로 집어들 수 있는 개수 (translate_attempts < 3 조건 동일 적용)
      // stuck: 3회 넘게 실패해서 자동배치에서 제외된 개수 — 관리자 수동 처리 필요
      const remainRow = await env.DB.prepare(`
        SELECT
          SUM(CASE WHEN source IS NULL AND (translate_attempts IS NULL OR translate_attempts < 3) THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN source IS NULL AND translate_attempts >= 3 THEN 1 ELSE 0 END) AS stuck
        FROM keyword_translation
      `).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, translated,
        remaining: remainRow?.remaining || 0,
        stuck: remainRow?.stuck || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/keywords/review ──────────────────────────────
  // admin_videos.html "🔤 키워드 번역 검토" 그리드용 — AI 초안(source='auto') 목록 조회
  if (path === "/admin/keywords/review" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 30, 60);

      const { results: items } = await env.DB.prepare(`
        SELECT id, keyword_en, keyword_ko
        FROM keyword_translation
        WHERE source = 'auto'
        ORDER BY id ASC
        LIMIT ?
      `).bind(limit).all();

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/keywords/review ─────────────────────────────
  // 관리자가 검토 그리드에서 확인/수정한 한글 번역을 최종 확정 저장.
  // source를 'admin'으로 바꿔서 이후 keywords/translate 배치가 절대 다시 건드리지 않음
  // (variety_genre_source와 동일한 관리자 확정값 보호 원칙)
  if (path === "/admin/keywords/review" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      const valid = items.filter(it => it && it.id && typeof it.keyword_ko === "string" && it.keyword_ko.trim());

      if (!valid.length) {
        return new Response(JSON.stringify({ ok: false, message: "유효한 항목이 없어요" }), { status: 400, headers });
      }

      const updates = valid.map(it =>
        env.DB.prepare(
          "UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE id = ?"
        ).bind(it.keyword_ko.trim(), parseInt(it.id))
      );
      await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, updated: valid.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/keywords/search ──────────────────────────────
  // admin_videos.html "④ 키워드 검색/수정"용 — 영문(keyword_en) 또는 한글(keyword_ko)에
  // 검색어가 포함된 항목 조회. 서로 다른 영문이 같은 한글로 번역돼 중복 노출되는 것 같은
  // 오탐을 발견했을 때 수동으로 찾아 고치는 용도.
  // keyword_translation은 규모가 작은 테이블(~4,500행)이라 LIKE 풀스캔도 부담 없음
  // (관리자가 가끔 수동 호출하는 용도라 트래픽상으로도 문제 없음).
  if (path === "/admin/keywords/search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: false, message: "검색어(q)가 필요해요" }), { status: 400, headers });
      }
      const like = `%${q}%`;
      const { results: items } = await env.DB.prepare(`
        SELECT id, keyword_en, keyword_ko, source
        FROM keyword_translation
        WHERE keyword_en LIKE ? OR keyword_ko LIKE ?
        ORDER BY keyword_en ASC
        LIMIT 50
      `).bind(like, like).all();

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/keywords/update ─────────────────────────────
  // 검색 결과에서 개별 키워드의 한글 번역만 수정. source는 항상 'admin'으로 고정
  // (검토 대기 중이던 항목을 여기서 먼저 고쳐도 확정 처리되도록).
  // 주의: 이 API로 수정해도 이미 캐싱된 작품페이지(keyword_ko_map, 5~100일 TTL)엔
  // 즉시 반영 안 됨 — 특정 작품에 바로 반영하려면 어드민 화면 ③번 SQL로 그 작품 캐시를 초기화할 것.
  if (path === "/admin/keywords/update" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const keyword_en = (body.keyword_en || "").trim();
      const keyword_ko = (body.keyword_ko || "").trim();
      if (!keyword_en || !keyword_ko) {
        return new Response(JSON.stringify({ ok: false, message: "keyword_en, keyword_ko 모두 필요해요" }), { status: 400, headers });
      }
      const result = await env.DB.prepare(
        "UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE keyword_en = ?"
      ).bind(keyword_ko, keyword_en).run();

      if (!result.meta || result.meta.changes === 0) {
        return new Response(JSON.stringify({ ok: false, message: "해당 keyword_en을 찾지 못했어요" }), { status: 404, headers });
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/discover-collect ─────────────────────
  // TMDB discover API로 인기순 한국 작품을 조회해 works 테이블에 신규 등록
  // (랭킹에는 올리지 않음 — 검색/키워드 매칭 대상 풀만 넓히는 용도)
  // 이미 works에 있는 tmdb_id는 절대 덮어쓰지 않고 건너뜀 (기존 데이터 보호)
  // 어드민 화면에서 media_type을 번갈아가며 page를 1씩 증가시켜 반복 호출하는 방식으로 사용
  if (path === "/admin/works/discover-collect" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const mediaType = body.media_type;
      const page = Math.max(parseInt(body.page) || 1, 1);

      if (!["movie", "tv"].includes(mediaType)) {
        return new Response(JSON.stringify({
          ok: false, message: "media_type은 'movie' 또는 'tv'만 허용"
        }), { status: 400, headers });
      }

      // ① TMDB discover — 인기순 한국 작품 목록 조회
      const discoverUrl = mediaType === "movie"
        ? `https://api.themoviedb.org/3/discover/movie?api_key=${env.TMDB_API_KEY}&language=ko-KR&region=KR&with_original_language=ko&sort_by=popularity.desc&page=${page}`
        : `https://api.themoviedb.org/3/discover/tv?api_key=${env.TMDB_API_KEY}&language=ko-KR&with_origin_country=KR&sort_by=popularity.desc&page=${page}`;

      const discoverResp = await fetch(discoverUrl);
      if (!discoverResp.ok) {
        return new Response(JSON.stringify({
          ok: false, message: `TMDB discover 조회 실패 (status ${discoverResp.status})`
        }), { status: 502, headers });
      }
      const discoverData = await discoverResp.json();
      const results     = discoverData.results || [];
      const totalPages  = discoverData.total_pages || 1;

      if (!results.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, inserted: 0, skipped: 0,
          hasNextPage: false, nextPage: page + 1, totalPages,
        }), { headers });
      }

      // ② 이미 works에 있는 tmdb_id는 제외 (기존 데이터 보호 — 절대 덮어쓰지 않음)
      const ids = results.map(r => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const { results: existingRows } = await env.DB.prepare(
        `SELECT tmdb_id FROM works WHERE tmdb_id IN (${placeholders})`
      ).bind(...ids).all();
      const existingSet = new Set((existingRows || []).map(r => r.tmdb_id));
      const newItems = results.filter(r => !existingSet.has(r.id));

      // ③ 신규 작품만 상세정보 조회 후 works INSERT (기존 랭킹 등록 로직과 동일한 TMDB 조회 패턴)
      const updates = [];
      let inserted = 0;
      for (const item of newItems) {
        let titleKo = null, titleEn = null, poster = null, genre = null,
            rating  = null, year = null, overview = "";

        try {
          const koResp = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${item.id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
          );
          if (koResp.ok) {
            const ko = await koResp.json();
            titleKo  = ko.name || ko.title || item.name || item.title || null;
            poster   = ko.poster_path || item.poster_path || null;
            genre    = (ko.genres || []).map(g => g.name).join(", ") || null;
            rating   = ko.vote_average ? parseFloat(ko.vote_average.toFixed(1)) : null;
            year     = parseInt((ko.first_air_date || ko.release_date || "").slice(0, 4)) || null;
            overview = ko.overview || item.overview || "";
          }
        } catch (e) { /* ko 상세조회 실패 시 discover 목록값으로 폴백 */ }

        if (!titleKo) continue; // 제목조차 못 가져오면 등록 스킵 (불완전 데이터 방지)

        try {
          const enResp = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${item.id}?language=en-US&api_key=${env.TMDB_API_KEY}`
          );
          if (enResp.ok) {
            const en    = await enResp.json();
            const orig  = en.original_title || en.original_name || "";
            const enTxt = en.title || en.name || "";
            // 원어 제목이 한글이면(즉 영문 없으면) en 언어 응답값으로 대체
            titleEn = /[\uAC00-\uD7A3]/.test(orig) ? enTxt : (orig || enTxt);
          }
        } catch (e) { /* en 상세조회 실패해도 title_en 없이 진행 (나중에 보완 가능) */ }

        updates.push(
          env.DB.prepare(`
            INSERT INTO works
              (tmdb_id, title_ko, title_en, overview, genre, release_year,
               tmdb_rating, poster_path, media_type, match_source, confidence_score, first_matched_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discover', 90, date('now'))
            ON CONFLICT(tmdb_id) DO NOTHING
          `).bind(
            item.id, titleKo, titleEn || "", overview || "", genre || "",
            year, rating, poster, mediaType
          )
        );
        inserted++;
      }
      if (updates.length) await env.DB.batch(updates);

      return new Response(JSON.stringify({
        ok: true,
        attempted: results.length,
        inserted,
        skipped: results.length - newItems.length,
        hasNextPage: page < totalPages,
        nextPage: page + 1,
        totalPages,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/classify-variety ───────────────────────
  // 예능(Reality/Talk 등) 한국 작품 중 아직 예능 태그가 없는 작품을
  // Claude API로 일괄 분류해 variety_genre에 초안 저장(source='auto')
  // 관리자가 admin_videos.html 검토 그리드에서 확인/수정 후 source='admin'으로
  // 확정하면 이후 이 배치의 재처리 대상에서 영구 제외됨
  // (genre/keywords 컬럼과 동일한 "관리자 확정값 보호" 원칙)
  if (path === "/admin/works/classify-variety" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        ok: false, message: "ANTHROPIC_API_KEY가 Workers Secrets에 설정되어 있지 않습니다"
      }), { status: 500, headers });
    }

    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 10, 15); // 프롬프트 길이 관리를 위해 최대 15개로 제한

      // ① 태그 마스터 목록 조회 — 하드코딩 아님, DB가 최신 소스 (어드민에서 태그 추가 시 바로 반영)
      const { results: options } = await env.DB.prepare(
        "SELECT label FROM variety_genre_options ORDER BY sort_order ASC"
      ).all();
      if (!options.length) {
        return new Response(JSON.stringify({
          ok: false, message: "variety_genre_options에 태그가 하나도 없습니다. 먼저 태그를 등록해주세요."
        }), { status: 400, headers });
      }
      const labelList = options.map(o => o.label);

      // ② 분류 대상 조회 — Reality/Talk류 장르 + 한국작품 + 아직 미분류(source IS NULL)인 것만
      //    (관리자가 이미 확정(source='admin')했거나, 이전 배치에서 이미 처리(source='auto')한 것은 재처리 안 함)
      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, overview, genre
        FROM works
        WHERE original_language = 'ko'
          AND variety_genre_source IS NULL
          AND (
            genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR
            genre LIKE '%다큐멘터리%' OR genre LIKE '%리얼리티%' OR genre LIKE '%토크%'
          )
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, classified: 0, remaining: 0, message: "분류할 작품 없음"
        }), { headers });
      }

      // ③ Claude API 프롬프트 구성 — JSON만 출력하도록 강하게 명시 (파싱 실패 방지)
      const workListText = targets.map(t =>
        `- tmdb_id:${t.tmdb_id} / 제목:"${t.title_ko || ""}" / 줄거리:"${(t.overview || "").slice(0, 200)}"`
      ).join("\n");

      const systemPrompt =
        "너는 한국 예능 프로그램을 분류하는 도우미다. " +
        "아래 태그 목록 중에서만 골라야 하며, 목록에 없는 태그는 절대 만들어내지 마라. " +
        "각 작품마다 가장 어울리는 태그를 최대 2개까지 고르고, 애매하면 1개만 고르거나 \"일반 예능\"을 선택해라. " +
        "예능이 아니라고 판단되면(드라마/영화/다큐 등) tags를 빈 배열로 남겨라. " +
        "반드시 JSON 배열만 출력하고, 다른 설명이나 코드블록(```)은 절대 포함하지 마라. " +
        "출력 형식: [{\"tmdb_id\":123,\"tags\":[\"여행 예능\"]}, ...]";

      const userPrompt = `태그 목록: ${labelList.join(", ")}\n\n작품 목록:\n${workListText}`;

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", // 단순 분류 작업이라 가벼운 모델로 충분 (비용 절감)
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!claudeResp.ok) {
        // API 호출 자체가 실패 — 아무것도 업데이트하지 않고 다음 배치에서 재시도되게 둠
        const errText = await claudeResp.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false, message: `Claude API 오류 (status ${claudeResp.status})`, detail: errText.slice(0, 300),
        }), { status: 502, headers });
      }

      const claudeData = await claudeResp.json();
      const rawText = (claudeData.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      // ④ JSON 파싱 — 코드펜스(```json ... ```)가 섞여 나올 경우 대비해 방어적으로 추출
      let parsed;
      try {
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // 파싱 실패 — 이번 배치는 전부 재시도 대상으로 남김 (source 건드리지 않음)
        return new Response(JSON.stringify({
          ok: false, message: "Claude 응답 파싱 실패 — 다시 시도해주세요", raw: rawText.slice(0, 300),
        }), { status: 502, headers });
      }
      if (!Array.isArray(parsed)) parsed = [];

      // ⑤ 결과를 tmdb_id 기준 맵으로 정리 + 목록에 없는 태그(할루시네이션) 방어적 필터링
      const labelSet  = new Set(labelList);
      const resultMap = new Map();
      for (const item of parsed) {
        const tid = parseInt(item.tmdb_id);
        if (!tid) continue;
        const tags = Array.isArray(item.tags)
          ? item.tags.filter(t => labelSet.has(t)).slice(0, 2)
          : [];
        resultMap.set(tid, tags);
      }

      // ⑥ D1 batch UPDATE — 응답에 포함된 작품만 처리, 응답에서 누락된 작품은 다음 배치 재시도 대상으로 남김
      const updates = [];
      let classified = 0;
      for (const t of targets) {
        if (!resultMap.has(t.tmdb_id)) continue; // Claude 응답에 없음 — 다음 배치에서 재시도
        const tags = resultMap.get(t.tmdb_id);
        updates.push(
          env.DB.prepare(
            "UPDATE works SET variety_genre = ?, variety_genre_source = 'auto' WHERE tmdb_id = ?"
          ).bind(tags.length ? tags.join(",") : null, t.tmdb_id)
        );
        classified++;
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE original_language = 'ko' AND variety_genre_source IS NULL
          AND (genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR genre LIKE '%다큐멘터리%' OR genre LIKE '%리얼리티%' OR genre LIKE '%토크%')
      `).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, classified, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/variety-genre-options ──────────────────────────
  // admin_videos.html "🎭 예능 태그" 탭에서 태그 칩 버튼을 그리기 위한 목록 조회
  // (classify-variety 내부에서도 동일 테이블을 참조하므로, 여기서 태그를 추가/삭제하면
  //  자동분류 결과에도 곧바로 반영됨)
  if (path === "/admin/variety-genre-options" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        "SELECT id, label, sort_order FROM variety_genre_options ORDER BY sort_order ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/variety-review ───────────────────────────
  // Claude가 자동분류(variety_genre_source='auto')했지만 아직 관리자 확정 전인 작품 조회
  // 2026-07-07 변경: "건너뛰기"한 항목이 계속 최상단에 남아 새 항목을 가리던 문제 수정.
  // variety_review_skipped_at이 NULL인(=한 번도 안 건너뛴) 항목을 항상 최우선으로 보여주고,
  // 건너뛴 항목은 완전히 빼지 않고 "가장 오래전에 건너뛴 순"으로 뒤로 밀어서 계속 순환 노출됨
  // media_type도 함께 내려줘서 프론트가 TMDB 상세페이지로 바로 링크 걸 수 있게 함
  if (path === "/admin/works/variety-review" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 12, 30);

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path, variety_genre, media_type
        FROM works
        WHERE variety_genre_source = 'auto'
        ORDER BY (variety_review_skipped_at IS NULL) DESC, variety_review_skipped_at ASC, tmdb_id ASC
        LIMIT ?
      `).bind(limit).all();

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/variety-review ──────────────────────────
  // 관리자가 검토 그리드에서 확인/수정한 태그를 최종 확정 저장
  // variety_genre_source를 'admin'으로 바꿔서 이후 classify-variety 배치가
  // 이 작품을 절대 다시 건드리지 않도록 함 (genre/keywords와 동일한 보호 원칙)
  // tags를 빈 배열로 보내면 "이 작품은 예능 아님/태그 없음"으로 확정 저장됨
  if (path === "/admin/works/variety-review" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      const valid = items.filter(it => it && it.tmdb_id && Array.isArray(it.tags));

      if (!valid.length) {
        return new Response(JSON.stringify({ ok: false, message: "유효한 항목이 없어요" }), { status: 400, headers });
      }

      const updates = valid.map(it => {
        const tags = it.tags.filter(Boolean).slice(0, 2); // 최대 2개로 방어적 제한
        return env.DB.prepare(
          "UPDATE works SET variety_genre = ?, variety_genre_source = 'admin' WHERE tmdb_id = ?"
        ).bind(tags.length ? tags.join(",") : null, parseInt(it.tmdb_id));
      });
      await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, updated: valid.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/variety-review/skip ───────────────────────
  // "건너뛰기"한 작품을 완전히 빼는 게 아니라 variety_review_skipped_at에 현재 시각만 기록.
  // GET 쪽 ORDER BY가 이 값을 기준으로 순환시키므로, 저장은 이 컬럼 업데이트뿐 — 별도 상태 컬럼 불필요
  if (path === "/admin/works/variety-review/skip" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbIds = Array.isArray(body.tmdb_ids)
        ? body.tmdb_ids.map(v => parseInt(v)).filter(v => Number.isInteger(v))
        : [];

      if (!tmdbIds.length) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_ids required" }), { status: 400, headers });
      }

      const nowIso = new Date().toISOString();
      const updates = tmdbIds.map(id =>
        env.DB.prepare(
          "UPDATE works SET variety_review_skipped_at = ? WHERE tmdb_id = ?"
        ).bind(nowIso, id)
      );
      await env.DB.batch(updates);

      return new Response(JSON.stringify({ ok: true, skipped: tmdbIds.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/pinned-similar ──────────────────────────
  // "🔗 작품 연결" — 관리자가 지정한 두 작품을 "비슷한 취향의 작품" 최우선(Priority -1)으로 고정
  // 양방향 저장(A→B, B→A) — 어느 작품 페이지에서 봐도 서로 뜨게 하기 위함
  // 이미 연결돼있으면(UNIQUE 제약) 덮어쓰기(% 갱신)로 처리
  if (path === "/admin/works/pinned-similar" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbA = parseInt(body.tmdb_id);
      const tmdbB = parseInt(body.related_tmdb_id);
      let pct = parseInt(body.pinned_pct);
      if (!pct || pct < 1 || pct > 99) pct = 99; // 범위 밖이거나 미입력 시 기본값 99

      if (!tmdbA || !tmdbB) {
        return new Response(JSON.stringify({ ok: false, message: "두 작품의 tmdb_id가 모두 필요합니다" }), { status: 400, headers });
      }
      if (tmdbA === tmdbB) {
        return new Response(JSON.stringify({ ok: false, message: "같은 작품끼리는 연결할 수 없어요" }), { status: 400, headers });
      }

      // 두 작품 다 works 테이블에 존재하는지 먼저 확인 (없는 작품끼리 연결되는 것 방지)
      const { results: existCheck } = await env.DB.prepare(
        "SELECT tmdb_id FROM works WHERE tmdb_id IN (?, ?)"
      ).bind(tmdbA, tmdbB).all();
      if (existCheck.length < 2) {
        return new Response(JSON.stringify({ ok: false, message: "works 테이블에 없는 작품이 포함되어 있어요" }), { status: 400, headers });
      }

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(tmdbA, tmdbB, pct),
        env.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(tmdbB, tmdbA, pct),
      ]);

      return new Response(JSON.stringify({ ok: true, pinned_pct: pct }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/pinned-similar/:tmdb_id ──────────────────
  // 특정 작품의 현재 연결 목록 조회 — 어드민 "🔗 작품 연결" 섹션에서 작품 A 선택 시 표시
  if (path.startsWith("/admin/works/pinned-similar/") && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/admin/works/pinned-similar/")[1]);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }
      const { results } = await env.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(tmdb_id).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/works/pinned-similar ─────────────────────────
  // 연결 해제 — 별도 id 추적 없이 (tmdb_id, related_tmdb_id) 쌍으로 양방향을 한 번에 삭제
  if (path === "/admin/works/pinned-similar" && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const tmdbA = parseInt(body.tmdb_id);
      const tmdbB = parseInt(body.related_tmdb_id);
      if (!tmdbA || !tmdbB) {
        return new Response(JSON.stringify({ ok: false, message: "두 작품의 tmdb_id가 모두 필요합니다" }), { status: 400, headers });
      }
      await env.DB.prepare(`
        DELETE FROM work_pinned_similar
        WHERE (tmdb_id = ? AND related_tmdb_id = ?) OR (tmdb_id = ? AND related_tmdb_id = ?)
      `).bind(tmdbA, tmdbB, tmdbB, tmdbA).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/collect ─────────────────────────────
  // works의 크레딧(출연진/감독)에서 person id를 추출해 persons 테이블에 등록
  // TMDB에는 "한국 인물만 인기순" 조회가 없어서, 이미 한국 작품으로 필터된
  // works의 크레딧에서 역으로 뽑는 방식 — person.html이 tmdb_id만으로 라이브 렌더링하므로
  // 여기서는 이름/직업 정도만 참고용으로 저장하고 상세정보는 캐싱하지 않음
  // works.credits_scanned=0인 작품을 대상으로 하며, 처리 후 1로 마킹해 재스캔 방지
  if (path === "/admin/persons/collect" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 20, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE credits_scanned IS NULL OR credits_scanned = 0
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, worksScanned: 0, personsFound: 0, remaining: 0, message: "스캔할 작품 없음"
        }), { headers });
      }

      const personRows = new Map(); // tmdb_id → { name, job }  (배치 내 중복 제거용)
      const scannedIds  = [];

      for (const row of targets) {
        scannedIds.push(row.tmdb_id);
        const mtype = row.media_type === "tv" ? "tv" : "movie";
        // TV는 시즌 전체 출연진을 보려면 aggregate_credits가 필요 (§ 캐스트 표시 수정과 동일 원칙)
        const endpoint = mtype === "tv" ? "aggregate_credits" : "credits";

        try {
          const resp = await fetch(
            `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}/${endpoint}?api_key=${env.TMDB_API_KEY}`
          );
          if (!resp.ok) continue;
          const data = await resp.json();

          // 출연진 — 너무 많으면 의미 없는 단역까지 다 들어가니 상위 15명만
          for (const c of (data.cast || []).slice(0, 15)) {
            if (c.id && c.name && !personRows.has(c.id)) {
              personRows.set(c.id, { name: c.name, job: "act" });
            }
          }
          // 감독/크리에이터만 crew에서 추출
          for (const c of (data.crew || [])) {
            const isDirector = c.job === "Director" || c.job === "Creator" || c.department === "Directing"
              || (c.jobs || []).some(j => j.job === "Director" || j.job === "Creator"); // aggregate_credits는 jobs 배열 형태
            if (isDirector && c.id && c.name) {
              personRows.set(c.id, { name: c.name, job: "direct" });
            }
          }
        } catch (e) { /* 이 작품만 스킵, 다음 작품 계속 */ }
      }

      const updates = [];
      for (const [tmdbId, info] of personRows) {
        updates.push(
          env.DB.prepare(
            `INSERT INTO persons (tmdb_id, name, job) VALUES (?, ?, ?)
             ON CONFLICT(tmdb_id) DO NOTHING`
          ).bind(tmdbId, info.name, info.job)
        );
      }
      // 스캔 완료 마킹 (person 발견 여부와 무관하게 항상 마킹 — 재시도 방지)
      for (const id of scannedIds) {
        updates.push(
          env.DB.prepare(`UPDATE works SET credits_scanned = 1 WHERE tmdb_id = ?`).bind(id)
        );
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE credits_scanned IS NULL OR credits_scanned = 0"
      ).first();

      return new Response(JSON.stringify({
        ok: true,
        worksScanned: targets.length,
        personsFound: personRows.size,
        remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-language ─────────────────────
  // 기존 works 중 original_language가 비어있는 작품에 TMDB 원어 정보를 채워넣음
  // (키워드 수집 탭 등과 동일한 배치+반복 패턴 — 앞으로 신규 등록되는 작품은
  //  works/register가 자동으로 채우므로, 이건 과거분 일회성 백필용)
  if (path === "/admin/works/backfill-language" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE original_language IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let lang = null;
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data.original_language) { lang = data.original_language; break; }
          } catch (e) { /* 다음 media_type으로 계속 시도 */ }
        }
        if (lang) {
          updates.push(
            env.DB.prepare("UPDATE works SET original_language = ? WHERE tmdb_id = ?")
              .bind(lang, row.tmdb_id)
          );
          filled++;
        } else {
          // TMDB에서 못 가져와도 무한 재시도 방지를 위해 'unknown' 센티널로 마킹
          // (빈 문자열로 저장하면 위 WHERE IS NULL 조건은 피하지만 나중에 실수로
          //  IS NULL OR = '' 조건을 쓰면 재시도 루프 생길 수 있어 명확히 구분)
          updates.push(
            env.DB.prepare("UPDATE works SET original_language = 'unknown' WHERE tmdb_id = ?")
              .bind(row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE original_language IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-release-year ───────────────────
  // release_year가 비어있는 작품에 TMDB 원어 정보를 채워넣음 (backfill-language와 동일 패턴)
  // 계기: variety-similar 정렬에서 release_year가 NULL인 작품이 "0년(||0)"으로 취급되어
  //       오히려 가장 오래된 작품으로 오판되던 버그 발견 → 근본 해결은 데이터를 채우는 것
  if (path === "/admin/works/backfill-release-year" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE release_year IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let year = null;
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            const dateStr = data.release_date || data.first_air_date || "";
            const y = parseInt(dateStr.slice(0, 4));
            if (y) { year = y; break; }
          } catch (e) { /* 다음 media_type으로 계속 시도 */ }
        }
        if (year) {
          updates.push(
            env.DB.prepare("UPDATE works SET release_year = ? WHERE tmdb_id = ?")
              .bind(year, row.tmdb_id)
          );
          filled++;
        } else {
          // TMDB에서도 못 찾으면 무한 재시도 방지를 위해 0(=조회 시도했지만 실패) 센티널로 마킹
          // NULL로 남기면 매 배치마다 계속 대상에 걸림 — original_language의 'unknown'과 동일 원칙
          // (release_year는 정수 컬럼이라 'unknown' 대신 0을 사용, 정렬 로직에서도 0=가장 오래됨으로
          //  자연스럽게 처리되어 별도 예외 분기 불필요)
          updates.push(
            env.DB.prepare("UPDATE works SET release_year = 0 WHERE tmdb_id = ?")
              .bind(row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE release_year IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-rating ───────────────────────
  // tmdb_rating이 비어있는 작품에 TMDB 평점(vote_average)과 개봉/방영일(release_date)을
  // 한 번에 채워넣음 (backfill-language / backfill-release-year와 동일한 배치+반복 패턴)
  // 계기: 메인 슬라이더(수동 고정 랭킹, rankings 테이블)는 정규 크롤러 대상이 아니라
  //       works.tmdb_rating이 영구 결번되는 문제 발견 → 일회성 배치로 과거분을 채움
  //       (release_date는 "6개월 이내 신작 여부" 판별용으로 방문 시 자동 새로고침 로직에서 사용)
  //
  // 센티널 값을 쓰지 않는 이유: tmdb_rating은 화면에서 "값이 있으면 표시"하는 방식으로
  // 여러 곳(index.html, _title_detail.html)에서 체크하고 있어서, 예를 들어 release_year처럼
  // 0을 센티널로 쓰면 0점(투표수 부족)인 정상 데이터와 구분이 안 됨. 그래서 여기서는
  // "시도했는지" 여부를 rating_updated_at 컬럼으로 별도 추적하고, tmdb_rating은 진짜 값이
  // 있을 때만 채우고 없으면 NULL을 그대로 유지함 (화면 표시 로직을 안 건드려도 안전).
  if (path === "/admin/works/backfill-rating" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      // "한 번도 시도 안 한" 작품만 대상 (rating_updated_at IS NULL)
      // → 시도했지만 TMDB에 값이 없었던 작품은 rating_updated_at이 찍혀 있어 여기서 자동 제외됨
      //   (무한 재시도 방지. 이후 재시도는 방문 시 자동 새로고침 로직이 담당)
      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      const nowIso = new Date().toISOString();

      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let rating      = null;
        let releaseDate = null;
        let matched     = false; // TMDB로부터 정상 응답을 한 번이라도 받았는지

        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            matched = true;
            // 0점(투표수 부족)도 유효한 값이므로 ?? 사용 — || 사용 시 0이 사라지는 버그 재발 방지
            rating      = data.vote_average ?? null;
            releaseDate = data.release_date || data.first_air_date || null;
            break;
          } catch (e) { /* 다음 media_type으로 계속 시도 */ }
        }

        if (matched) {
          // TMDB가 정상 응답을 줬으므로, 평점이 실제로 없더라도(신작 투표수 0 등) 시도 시각은 기록
          updates.push(
            env.DB.prepare(
              "UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?"
            ).bind(rating, releaseDate, nowIso, row.tmdb_id)
          );
          if (rating !== null) filled++;
        } else {
          // 네트워크 오류 등으로 TMDB 응답 자체를 못 받음 — 그래도 rating_updated_at은 찍어서
          // 이번 배치 루프에서 같은 행을 무한 반복 조회하지 않게 함 (미래 재시도는 방문 시 자동
          // 새로고침 로직이 담당하므로 완전히 누락되지는 않음)
          updates.push(
            env.DB.prepare(
              "UPDATE works SET rating_updated_at = ? WHERE tmdb_id = ?"
            ).bind(nowIso, row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/batch-imdb-search ───────────────────────
  // [2026-07-08 신설] IMDb 매칭률 개선 — 관리자 수동 배치(반복 호출) 방식.
  //   배경: TMDB external_ids에 imdb_id가 없는 작품(한국 드라마 다수)은
  //         지금까지 IMDb 카드가 영원히 "—"로 남았음. OMDB 제목검색
  //         (?t=&y=&type=)으로 imdb_id를 직접 찾아 보완.
  //   ⚠️ 방문 트리거 방식은 절대 사용하지 않음 — 2026-07-08 YouTube
  //      quota 소진 사고(실패를 기록 안 하는 무한 재시도)의 재발을 막기
  //      위해, 반드시 관리자가 수동으로 실행하는 배치로만 동작하고
  //      성공/실패 관계없이 imdb_search_attempted_at을 기록해 재시도를
  //      7일 쿨다운으로 제한함.
  //   대상: imdb_id 없음 AND (attempted_at NULL 또는 7일 경과)
  //   우선순위: 오늘 rankings에 있는 작품(인기작) → created_at 최신순
  //   예산: body.limit (기본 30)
  if (path === "/admin/works/batch-imdb-search" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      let limit = 30;
      try {
        const body = await request.json();
        if (body?.limit && Number.isInteger(body.limit) && body.limit > 0) {
          limit = body.limit;
        }
      } catch (e) {
        // body 없이 호출된 경우 기본값(30) 사용 — 정상 케이스이므로 무시
      }

      const omdbKey = env.OMDB_API_KEY;
      if (!omdbKey) {
        return new Response(JSON.stringify({ ok: false, message: "OMDB key not configured" }), { status: 500, headers });
      }

      // 오늘 기준 최신 크롤링 날짜 조회 (batch-crawl과 동일 패턴)
      const latestDateRow = await env.DB.prepare(
        "SELECT MAX(date) AS latest_date FROM rankings WHERE date != 'manual'"
      ).first();
      const latestDate = latestDateRow?.latest_date || null;

      const { results: candidates } = await env.DB.prepare(`
        SELECT w.tmdb_id, w.title_en, w.release_year, w.media_type
        FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
        ORDER BY
          (
            EXISTS (
              SELECT 1 FROM rankings r
              WHERE r.tmdb_id = w.tmdb_id AND r.date = ?
            )
          ) DESC,
          w.created_at DESC
        LIMIT ?
      `).bind(latestDate, limit).all();

      if (!candidates.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0,
          message: "대상 작품 없음 (모두 매칭 완료됐거나 쿨다운 중)"
        }), { headers });
      }

      let filled = 0;
      const now = new Date().toISOString();

      // 순차 처리 (레이트리밋 회피 목적, 병렬 처리 안 함 — batch-crawl과 동일 원칙)
      for (const c of candidates) {
        try {
          if (!c.title_en) {
            // 영문 제목이 없으면 OMDB 제목검색 자체가 불가능 — 시도 기록만 남기고 스킵
            await env.DB.prepare(
              "UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?"
            ).bind(now, c.tmdb_id).run();
            continue;
          }

          const omdbType = c.media_type === "movie" ? "movie" : "series";
          const params = new URLSearchParams({ t: c.title_en, type: omdbType, apikey: omdbKey });
          if (c.release_year) params.set("y", String(c.release_year));

          const omdbRes  = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
          const omdbData = await omdbRes.json();

          if (omdbData.Response !== "False" && /^tt\d+$/.test(omdbData.imdbID || "")) {
            const r = parseFloat(omdbData.imdbRating);
            if (!isNaN(r)) {
              const v = omdbData.imdbVotes || "";
              await env.DB.prepare(
                "UPDATE works SET imdb_id = ?, imdb_rating = ?, imdb_votes = ?, imdb_updated = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?"
              ).bind(omdbData.imdbID, r, v, now, now, c.tmdb_id).run();
            } else {
              // imdb_id는 찾았지만 평점이 아직 없는 경우 — id만 저장, 평점은 기존 /imdb/:id 실시간 캐시 로직이 이후 채움
              await env.DB.prepare(
                "UPDATE works SET imdb_id = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?"
              ).bind(omdbData.imdbID, now, c.tmdb_id).run();
            }
            filled++;
          } else {
            // 매칭 실패 — 반드시 attempted_at 기록 (무한 재시도 방지, 오늘 확립한 핵심 원칙)
            await env.DB.prepare(
              "UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?"
            ).bind(now, c.tmdb_id).run();
          }
        } catch (e) {
          // 개별 작품 네트워크/예외 오류는 attempted_at 기록 없이 스킵
          // → 다음 배치에서 자동 재시도됨 (진짜 "실패"와 "일시적 오류"를 구분)
          console.error(`[IMDB_BATCH_SEARCH] tmdb_id=${c.tmdb_id} 오류:`, e.message);
        }
      }

      // 남은 대상 개수 재조회
      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
      `).first();

      console.log(`[IMDB_BATCH_SEARCH] ✅ 완료: 시도 ${candidates.length}건, 매칭 ${filled}개`);
      return new Response(JSON.stringify({
        ok: true, attempted: candidates.length, filled, remaining: remainRow?.cnt || 0
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/imdb-manual ─────────────────────────────
  // [2026-07-08 신설] IMDb 평점 수동 입력 — OMDB 반영 지연 대응.
  //   배경: 김부장(tmdb_id=296206)처럼 imdb_id는 이미 매칭됐지만 OMDB가
  //         아직 평점을 못 채운 신작을, 검색 유입이 많을 때 관리자가
  //         직접 IMDb 사이트에서 확인한 값을 넣어 즉시 반영하기 위함.
  //   ⚠️ 주의: 프론트(_title_detail.html)는 works.imdb_rating이 있으면
  //      OMDB를 다시 호출하지 않고 그 값을 그대로 표시함 → 여기서 넣은
  //      값은 나중에 실제 OMDB 데이터로 자동으로 안 바뀌고 고정됨.
  //      (사용자 확인 및 동의됨 — 필요시 나중에 다시 이 API로 갱신)
  //   ⚠️ imdb_id 자체가 없는 작품(TMDB external_ids 미매핑)은 평점을
  //      넣어도 화면에 카드 자체가 안 뜸 — 응답에 warning으로 안내.
  if (path === "/admin/works/imdb-manual" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const tmdb_id = parseInt(body?.tmdb_id);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }

      const rating = body?.imdb_rating === "" || body?.imdb_rating == null
        ? null : parseFloat(body.imdb_rating);
      if (rating !== null && (isNaN(rating) || rating < 0 || rating > 10)) {
        return new Response(JSON.stringify({ ok: false, message: "imdb_rating은 0~10 사이 숫자여야 합니다" }), { status: 400, headers });
      }
      const votes = (body?.imdb_votes || "").toString().trim() || null;

      const existing = await env.DB.prepare(
        "SELECT imdb_id FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();
      if (!existing) {
        return new Response(JSON.stringify({ ok: false, message: "해당 tmdb_id 작품을 찾을 수 없습니다" }), { status: 404, headers });
      }

      await env.DB.prepare(
        "UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = datetime('now') WHERE tmdb_id = ?"
      ).bind(rating, votes, tmdb_id).run();

      return new Response(JSON.stringify({
        ok: true,
        warning: existing.imdb_id ? null : "imdb_id가 없는 작품이라 화면에 카드가 안 뜰 수 있습니다 (IMDb 매칭 배치 선행 필요)",
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/missing-media-type ──────────────────────
  // media_type이 비어있는 작품을 포스터와 함께 조회 (관리자가 눈으로 보고 직접 판정하는 용도)
  // offset 없이 항상 최신 10개를 가져옴 — 채워지는 즉시 쿼리에서 빠지므로 건너뛴 항목은
  // 자연스럽게 다음 배치들에서 계속 다시 보이게 됨 (별도 skip 추적 불필요)
  if (path === "/admin/works/missing-media-type" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 10, 30);

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path
        FROM works
        WHERE media_type IS NULL OR media_type = ''
        ORDER BY tmdb_id
        LIMIT ?
      `).bind(limit).all();

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''"
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/bulk-set-media-type ─────────────────────
  // 관리자가 화면에서 영화/TV로 직접 판정한 작품들을 한 번에 저장
  if (path === "/admin/works/bulk-set-media-type" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      const valid = items.filter(it =>
        it && it.tmdb_id && (it.media_type === "movie" || it.media_type === "tv")
      );
      if (!valid.length) {
        return new Response(JSON.stringify({ ok: false, message: "유효한 항목이 없어요 (media_type은 'movie' 또는 'tv'만 허용)" }), { status: 400, headers });
      }

      const updates = valid.map(it =>
        env.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?")
          .bind(it.media_type, parseInt(it.tmdb_id))
      );
      await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''"
      ).first();

      return new Response(JSON.stringify({
        ok: true, updated: valid.length, remaining: remainRow?.cnt || 0,
      }), { headers });
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
            (grade_key, grade_name, emoji_url, min_ott_points, is_special, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(grade_key) DO UPDATE SET
            grade_name     = excluded.grade_name,
            emoji_url      = excluded.emoji_url,
            min_ott_points = excluded.min_ott_points,
            is_special     = excluded.is_special,
            sort_order     = excluded.sort_order
        `).bind(
          g.grade_key, g.grade_name, g.emoji_url || "",
          g.min_ott_points || 0,
          g.is_special ? 1 : 0, g.sort_order || 0
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
          u.created_at, u.last_login, u.ott_points,
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

  // ── POST /admin/ott-points/adjust ─────────────────────────
  // 관리자 수동 오뜨 조정 (지급/차감)
  if (path === "/admin/ott-points/adjust" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { user_id, points, reason } = await request.json();
      if (!user_id || points === undefined || !reason) {
        return new Response(JSON.stringify({ ok: false, message: "user_id, points, reason 필수" }), { status: 400, headers });
      }
      // 1. 내역 로그 기록
      await env.DB.prepare(
        `INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)`
      ).bind(user_id, points, reason).run();
      // 2. users.ott_points 캐시 업데이트
      await env.DB.prepare(
        `UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?`
      ).bind(points, user_id).run();
      // 3. 레벨 자동 재계산
      const user = await env.DB.prepare(
        `SELECT ott_points FROM users WHERE id = ?`
      ).bind(user_id).first();
      if (user) {
        const newGrade = await _calcGrade(user.ott_points, env);
        if (newGrade) {
          await env.DB.prepare(
            `UPDATE users SET grade = ? WHERE id = ? AND (grade IS NULL OR grade NOT IN (SELECT grade_key FROM grade_settings WHERE is_special = 1))`
          ).bind(newGrade, user_id).run();
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}

// ════════════════════════════════════════════════════
// 오뜨 포인트 공용 유틸 함수
// 다른 Worker 파일(auth.js, user.js 등)에서 import해서 사용
// ════════════════════════════════════════════════════

// 오뜨 적립/차감 + 레벨 자동 재계산
export async function _addOttPoints(userId, points, reason, env) {
  try {
    // 1. 내역 로그 기록
    await env.DB.prepare(
      `INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)`
    ).bind(userId, points, reason).run();
    // 2. users.ott_points 캐시 업데이트 (0 미만으로 내려가지 않도록)
    await env.DB.prepare(
      `UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?`
    ).bind(points, userId).run();
    // 3. 레벨 자동 재계산 (특별 등급 보호)
    const user = await env.DB.prepare(
      `SELECT ott_points FROM users WHERE id = ?`
    ).bind(userId).first();
    if (user) {
      const newGrade = await _calcGrade(user.ott_points, env);
      if (newGrade) {
        await env.DB.prepare(
          `UPDATE users SET grade = ? WHERE id = ?
           AND (grade IS NULL OR grade NOT IN
             (SELECT grade_key FROM grade_settings WHERE is_special = 1))`
        ).bind(newGrade, userId).run();
      }
    }
    return true;
  } catch (e) {
    console.error("[_addOttPoints] 오류:", e.message);
    return false;
  }
}

// 오뜨 점수 기준으로 해당 등급 key 계산
async function _calcGrade(ottPoints, env) {
  try {
    // min_ott_points 내림차순 → 가장 높은 달성 등급 반환
    const { results } = await env.DB.prepare(
      `SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`
    ).bind(ottPoints).all();
    return results[0]?.grade_key || null;
  } catch (e) {
    return null;
  }
}
