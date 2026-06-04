/* ══════════════════════════════════════════════════════════════
   게시판 (Posts) 관련 API 라우트
   GET    /posts
   GET    /posts/:id
   POST   /posts
   PATCH  /posts/:id
   DELETE /posts/:id
   POST   /posts/:id/like
══════════════════════════════════════════════════════════════ */

import { _getSessionCookie, _recalcGrade } from "../utils/authUtils.js";

export async function handlePosts(path, request, env, ctx, url, headers) {

  // ── GET /posts ────────────────────────────────────────────
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
        ok: true, data: results,
        total: countRow?.cnt || 0, page, limit,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /posts/:id ────────────────────────────────────────
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
      if (!post) {
        return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true, data: post }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /posts ───────────────────────────────────────────
  if (path === "/posts" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const body = await request.json();
      const { board_type, title, content } = body;

      if (!["recommend", "free", "community"].includes(board_type)) {
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

      const result = await env.DB.prepare(
        "INSERT INTO posts (board_type, user_id, title, content) VALUES (?, ?, ?, ?)"
      ).bind(board_type, session.user_id, title.trim(), content.trim()).run();

      ctx.waitUntil(_recalcGrade(session.user_id, env));
      return new Response(JSON.stringify({ ok: true, id: result.meta?.last_row_id }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /posts/:id ──────────────────────────────────────
  if (path.match(/^\/posts\/\d+$/) && request.method === "PATCH") {
    try {
      const post_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /posts/:id ─────────────────────────────────────
  if (path.match(/^\/posts\/\d+$/) && request.method === "DELETE") {
    try {
      const post_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /posts/:id/like ──────────────────────────────────
  if (path.match(/^\/posts\/\d+\/like$/) && request.method === "POST") {
    try {
      const post_id = parseInt(path.split("/")[2]);
      const post    = await env.DB.prepare(
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
