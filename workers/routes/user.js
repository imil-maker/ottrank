/* ══════════════════════════════════════════════════════════════
   유저 활동 관련 API 라우트
   GET    /wishlist
   POST   /wishlist
   GET    /wishlist/check/:tmdb_id
   GET    /reviews/:tmdb_id
   GET    /reviews/:tmdb_id/me
   POST   /reviews/:tmdb_id
   POST   /reviews/:tmdb_id/like/:id
   DELETE /reviews/:tmdb_id
   GET    /mypage
   PATCH  /mypage/wishlist-public
   GET    /user/:uid
   GET    /grade-settings
══════════════════════════════════════════════════════════════ */

import { _getSessionCookie, _recalcGrade } from "../utils/authUtils.js";

export async function handleUser(path, request, env, ctx, headers) {

  // ════════════════════════════════════════════════════════════
  // 찜 (Wishlist)
  // ════════════════════════════════════════════════════════════

  // ── GET /wishlist ─────────────────────────────────────────
  if (path === "/wishlist" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /wishlist ────────────────────────────────────────
  if (path === "/wishlist" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /wishlist/check/:tmdb_id ──────────────────────────
  if (path.match(/^\/wishlist\/check\/\d+$/) && request.method === "GET") {
    try {
      const tmdb_id   = parseInt(path.split("/")[3]);
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: true, wishlisted: false }), { headers });
    }
  }

  // ════════════════════════════════════════════════════════════
  // 후기 (Reviews)
  // ════════════════════════════════════════════════════════════

  // ── GET /reviews/:tmdb_id ─────────────────────────────────
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /reviews/:tmdb_id/me ──────────────────────────────
  if (path.match(/^\/reviews\/\d+\/me$/) && request.method === "GET") {
    try {
      const tmdb_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /reviews/:tmdb_id ────────────────────────────────
  if (path.match(/^\/reviews\/\d+$/) && request.method === "POST") {
    try {
      const tmdb_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
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
        tmdb_id, session.user_id, score,
        JSON.stringify(emotions || []),
        JSON.stringify(custom_tags || []),
        (text || "").slice(0, 500),
        spoiler ? 1 : 0
      ).run();

      ctx.waitUntil(_recalcGrade(session.user_id, env));
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /reviews/:tmdb_id/like/:id ───────────────────────
  if (path.match(/^\/reviews\/\d+\/like\/\d+$/) && request.method === "POST") {
    try {
      const review_id = parseInt(path.split("/")[4]);
      const review    = await env.DB.prepare(
        "SELECT user_id FROM reviews WHERE id = ?"
      ).bind(review_id).first();
      await env.DB.prepare(
        "UPDATE reviews SET likes = likes + 1 WHERE id = ?"
      ).bind(review_id).run();
      if (review?.user_id) {
        await env.DB.prepare(
          "UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?"
        ).bind(review.user_id).run();
        ctx.waitUntil(_recalcGrade(review.user_id, env));
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /reviews/:tmdb_id ──────────────────────────────
  if (path.match(/^\/reviews\/\d+$/) && request.method === "DELETE") {
    try {
      const tmdb_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
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
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ════════════════════════════════════════════════════════════
  // 마이페이지
  // ════════════════════════════════════════════════════════════

  // ── GET /mypage ───────────────────────────────────────────
  if (path === "/mypage" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const uid = session.user_id;

      const user = await env.DB.prepare(`
        SELECT u.id, u.nickname, u.provider, u.email, u.avatar_url,
          u.grade, u.total_likes_received, u.created_at, u.wishlist_public,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
          gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(uid).first();

      const { results: reviews } = await env.DB.prepare(`
        SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
          r.likes, r.spoiler, r.created_at,
          COALESCE(rk.title_ko,  wk.title_ko)    as title_ko,
          COALESCE(rk.poster_path, wk.poster_path) as poster_path,
          COALESCE(rk.category,  wk.media_type)  as category,
          rk.release_year
        FROM reviews r
        LEFT JOIN (
          SELECT tmdb_id, title_ko, poster_path, category, release_year
          FROM rankings WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = r.tmdb_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).bind(uid).all();

      const { results: wishlist } = await env.DB.prepare(`
        SELECT w.*,
          COALESCE(rk.title_ko, w.title_ko) as title_ko,
          COALESCE(rk.poster_path, w.poster_path) as poster_path,
          COALESCE(rk.category, w.category, 'movie') as category,
          rk.release_year
        FROM wishlist w
        LEFT JOIN (
          SELECT tmdb_id, title_ko, poster_path, category, release_year
          FROM rankings WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = w.tmdb_id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC
      `).bind(uid).all();

      const { results: posts } = await env.DB.prepare(`
        SELECT id, board_type, title, like_count, view_count, created_at
        FROM posts
        WHERE user_id = ? AND is_hidden = 0
        ORDER BY created_at DESC
      `).bind(uid).all();

      return new Response(JSON.stringify({
        ok: true, is_own: true, user, reviews, wishlist, posts,
        stats: {
          review_count:   reviews.length,
          wishlist_count: wishlist.length,
          likes_received: user?.total_likes_received || 0,
          post_count:     posts.length,
        },
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /mypage/wishlist-public ─────────────────────────
  if (path === "/mypage/wishlist-public" && request.method === "PATCH") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const body            = await request.json();
      const wishlist_public = body.wishlist_public ? 1 : 0;
      await env.DB.prepare(
        "UPDATE users SET wishlist_public = ? WHERE id = ?"
      ).bind(wishlist_public, session.user_id).run();
      return new Response(JSON.stringify({ ok: true, wishlist_public }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /user/:uid ────────────────────────────────────────
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

      if (!user) {
        return new Response(JSON.stringify({ ok: false, message: "유저를 찾을 수 없어요" }), { status: 404, headers });
      }

      const { results: reviews } = await env.DB.prepare(`
        SELECT r.id, r.tmdb_id, r.score, r.text, r.emotions, r.custom_tags,
          r.likes, r.spoiler, r.created_at,
          COALESCE(rk.title_ko,  wk.title_ko)    as title_ko,
          COALESCE(rk.poster_path, wk.poster_path) as poster_path,
          COALESCE(rk.category,  wk.media_type)  as category,
          rk.release_year
        FROM reviews r
        LEFT JOIN (
          SELECT tmdb_id, title_ko, poster_path, category, release_year
          FROM rankings WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = r.tmdb_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
      `).bind(targetUid).all();

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
            FROM rankings WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id
          ) rk ON rk.tmdb_id = w.tmdb_id
          WHERE w.user_id = ?
          ORDER BY w.created_at DESC
        `).bind(targetUid).all();
        wishlist = results;
      }

      const { results: posts } = await env.DB.prepare(`
        SELECT id, board_type, title, like_count, view_count, created_at
        FROM posts WHERE user_id = ? AND is_hidden = 0 ORDER BY created_at DESC
      `).bind(targetUid).all();

      return new Response(JSON.stringify({
        ok: true, is_own: false, user, reviews, wishlist,
        wishlist_hidden: !user.wishlist_public, posts,
        stats: {
          review_count:   reviews.length,
          wishlist_count: user.wishlist_public ? wishlist.length : null,
          likes_received: user.total_likes_received || 0,
          post_count:     posts.length,
        },
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /grade-settings ───────────────────────────────────
  if (path === "/grade-settings" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare(
        "SELECT * FROM grade_settings ORDER BY sort_order ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
