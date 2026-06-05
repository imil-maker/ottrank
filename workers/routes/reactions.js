/* ══════════════════════════════════════════════════════════════
   반응(Reactions) 관련 API 라우트
   GET    /reactions
   GET    /reactions/work/:tmdb_id   ← 작품 추천 비율 + 내 선택 조회
   POST   /reactions/work            ← 작품 추천 선택/변경 (로그인 필요)
   GET    /reactions/:id/comments
   GET    /reactions/:id/posts
   POST   /reactions/:id/posts
   POST   /reactions/:id/like  (게시글 좋아요)
   POST   /admin/reactions
   POST   /admin/reactions/:id/collect
   PATCH  /admin/reactions/:id
   PUT    /admin/reactions/:id/featured
   DELETE /admin/reactions/:id
══════════════════════════════════════════════════════════════ */

import { _checkAuth, _getSessionCookie } from "../utils/authUtils.js";
import { collectAndTranslateComments } from "../utils/youtube.js";

export async function handleReactions(path, request, env, ctx, headers) {

  // ── GET /reactions ────────────────────────────────────────
  if (path === "/reactions" && request.method === "GET") {
    const url      = new URL(request.url);
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

  // ── GET /reactions/work/:tmdb_id ──────────────────────────
  // 작품 추천 비율 집계 + 내 선택 반환 (비로그인도 비율은 볼 수 있음)
  if (path.match(/^\/reactions\/work\/\d+$/) && request.method === "GET") {
    try {
      const tmdbId = parseInt(path.split("/")[3]);

      // 유효한 reaction 값
      const VALID = ["great", "good", "meh", "bad"];

      // 전체 집계 (비율 계산용)
      const { results: counts } = await env.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(tmdbId).all();

      // 총 투표 수
      const total = counts.reduce((s, r) => s + r.cnt, 0);

      // reaction별 카운트 맵
      const cntMap = {};
      VALID.forEach(k => cntMap[k] = 0);
      counts.forEach(r => { if (VALID.includes(r.reaction)) cntMap[r.reaction] = r.cnt; });

      // 비율 계산 (총합 100% 보정: 소수점 반올림 오차 방지)
      let ratios = {};
      if (total > 0) {
        // 각 비율 계산 후 반올림
        let sumRounded = 0;
        const pairs = VALID.map(k => ({ k, raw: (cntMap[k] / total) * 100 }));
        pairs.forEach((p, i) => {
          if (i < pairs.length - 1) {
            ratios[p.k] = Math.round(p.raw);
            sumRounded += ratios[p.k];
          } else {
            // 마지막 항목은 100에서 나머지를 빼서 정확히 맞춤
            ratios[p.k] = 100 - sumRounded;
          }
        });
      } else {
        VALID.forEach(k => ratios[k] = 0);
      }

      // 내 선택 조회 (로그인한 경우)
      let myReaction = null;
      const sid = request.headers.get("Authorization")?.replace("Bearer ", "") ||
                  (() => {
                    const cookie = request.headers.get("Cookie") || "";
                    const m = cookie.match(/session=([^;]+)/);
                    return m ? m[1] : null;
                  })();

      if (sid) {
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1"
        ).bind(sid).first();
        if (session?.user_id) {
          const myRow = await env.DB.prepare(
            "SELECT reaction FROM work_reactions WHERE tmdb_id = ? AND user_id = ? LIMIT 1"
          ).bind(tmdbId, session.user_id).first();
          myReaction = myRow?.reaction || null;
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        data: {
          total,
          counts: cntMap,
          ratios,
          my_reaction: myReaction,
        }
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /reactions/work ──────────────────────────────────
  // 작품 추천 선택/변경 (로그인 필요, UPSERT)
  if (path === "/reactions/work" && request.method === "POST") {
    try {
      // 세션 인증 (Bearer 토큰 또는 쿠키)
      const sid = request.headers.get("Authorization")?.replace("Bearer ", "") ||
                  (() => {
                    const cookie = request.headers.get("Cookie") || "";
                    const m = cookie.match(/session=([^;]+)/);
                    return m ? m[1] : null;
                  })();

      if (!sid) {
        return new Response(JSON.stringify({ ok: false, message: "로그인이 필요합니다" }), { status: 401, headers });
      }

      // 세션 → user_id 조회
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now') LIMIT 1"
      ).bind(sid).first();

      if (!session?.user_id) {
        return new Response(JSON.stringify({ ok: false, message: "세션이 만료됐습니다" }), { status: 401, headers });
      }

      const body = await request.json();
      const { tmdb_id, reaction } = body;

      // 유효성 검사
      const VALID = ["great", "good", "meh", "bad"];
      if (!tmdb_id || !VALID.includes(reaction)) {
        return new Response(JSON.stringify({ ok: false, message: "올바르지 않은 요청입니다" }), { status: 400, headers });
      }

      const userId = session.user_id;

      // UPSERT: 이미 선택한 경우 교체, 없으면 삽입
      await env.DB.prepare(`
        INSERT INTO work_reactions (tmdb_id, user_id, reaction, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(tmdb_id, user_id)
        DO UPDATE SET reaction = excluded.reaction, updated_at = datetime('now')
      `).bind(parseInt(tmdb_id), userId, reaction).run();

      // 업데이트 후 최신 비율 다시 집계해서 반환
      const { results: counts } = await env.DB.prepare(`
        SELECT reaction, COUNT(*) as cnt
        FROM work_reactions
        WHERE tmdb_id = ?
        GROUP BY reaction
      `).bind(parseInt(tmdb_id)).all();

      const total = counts.reduce((s, r) => s + r.cnt, 0);
      const cntMap = {};
      VALID.forEach(k => cntMap[k] = 0);
      counts.forEach(r => { if (VALID.includes(r.reaction)) cntMap[r.reaction] = r.cnt; });

      let ratios = {};
      let sumRounded = 0;
      const pairs = VALID.map(k => ({ k, raw: (cntMap[k] / total) * 100 }));
      pairs.forEach((p, i) => {
        if (i < pairs.length - 1) {
          ratios[p.k] = Math.round(p.raw);
          sumRounded += ratios[p.k];
        } else {
          ratios[p.k] = 100 - sumRounded;
        }
      });

      return new Response(JSON.stringify({
        ok: true,
        data: {
          total,
          counts: cntMap,
          ratios,
          my_reaction: reaction,
        }
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
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

      // ── 유저 세션 인증 (게시판 개발 가이드 §2 표준 패턴) ──
      const authHeader = request.headers.get("Authorization") || "";
      const bearerSid  = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      const cookieSid  = _getSessionCookie(request);
      const sid        = bearerSid || cookieSid;

      if (!sid) {
        return new Response(JSON.stringify({ ok: false, message: "로그인이 필요합니다." }), { status: 401, headers });
      }

      // sessions 테이블에서 유효한 세션 + 유저 정보 조회
      const user = await env.DB.prepare(
        `SELECT s.user_id AS id, u.nickname
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
         LIMIT 1`
      ).bind(sid).first();

      if (!user) {
        return new Response(JSON.stringify({ ok: false, message: "로그인이 필요합니다." }), { status: 401, headers });
      }

      const body = await request.json();
      const { is_spoiler, tmdb_id } = body;
      const content = (body.content || "").trim();

      if (!content) {
        return new Response(JSON.stringify({ ok: false, message: "댓글 내용을 입력해주세요" }), { status: 400, headers });
      }
      if (content.length > 500) {
        return new Response(JSON.stringify({ ok: false, message: "댓글은 500자 이내로 입력해주세요" }), { status: 400, headers });
      }

      const result = await env.DB.prepare(`
        INSERT INTO reaction_posts (reaction_id, tmdb_id, user_id, nickname, content, is_spoiler)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        reactionId,
        tmdb_id || 0,
        user.id,
        user.nickname,
        content,
        is_spoiler ? 1 : 0
      ).run();

      return new Response(JSON.stringify({
        ok: true,
        id: result.meta?.last_row_id,
        nickname: user.nickname,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /reactions/posts/:id — 본인 댓글 삭제 ──────────
  if (path.match(/^\/reactions\/posts\/\d+$/) && request.method === "DELETE") {
    try {
      const postId = parseInt(path.split("/")[3]);

      // 세션 인증
      const authHeader = request.headers.get("Authorization") || "";
      const bearerSid  = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      const cookieSid  = _getSessionCookie(request);
      const sid        = bearerSid || cookieSid;

      if (!sid) {
        return new Response(JSON.stringify({ ok: false, message: "로그인이 필요합니다." }), { status: 401, headers });
      }

      const user = await env.DB.prepare(
        `SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1`
      ).bind(sid).first();

      if (!user) {
        return new Response(JSON.stringify({ ok: false, message: "로그인이 필요합니다." }), { status: 401, headers });
      }

      // 댓글 존재 여부 + 본인 확인
      const post = await env.DB.prepare(
        `SELECT id, user_id FROM reaction_posts WHERE id = ?`
      ).bind(postId).first();

      if (!post) {
        return new Response(JSON.stringify({ ok: false, message: "댓글을 찾을 수 없습니다." }), { status: 404, headers });
      }
      if (post.user_id !== user.id) {
        return new Response(JSON.stringify({ ok: false, message: "본인 댓글만 삭제할 수 있습니다." }), { status: 403, headers });
      }

      await env.DB.prepare(`DELETE FROM reaction_posts WHERE id = ?`).bind(postId).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
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
    } catch (e) {
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
        parseInt(tmdb_id), title_ko || "", poster_path || "",
        video_id, video_title || "", custom_title || video_title || "",
        channel_name || "", thumbnail || "",
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
    } catch (e) {
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
        ok: true, message: "댓글 수집·번역 시작! 약 30초 후 확인하세요"
      }), { headers });
    } catch (e) {
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
        ).bind(custom_title || "", id).run();
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
