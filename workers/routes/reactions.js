/* ══════════════════════════════════════════════════════════════
   반응(Reactions) 관련 API 라우트
   GET    /reactions
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

import { _checkAuth } from "../utils/authUtils.js";
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
        (nickname || "익명").slice(0, 20),
        content.trim(),
        is_spoiler ? 1 : 0
      ).run();

      return new Response(JSON.stringify({ ok: true, id: result.meta?.last_row_id }), { headers });
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
