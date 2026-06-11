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
   POST   /life-works                  인생작품 토글 (추가/해제)
   GET    /life-works/check/:tmdb_id   인생작품 저장 여부 확인
   GET    /pick-lists                  내 추천작품 컬렉션 목록
   POST   /pick-lists                  새 추천작품 컬렉션 생성
   DELETE /pick-lists/:id              추천작품 컬렉션 삭제
   POST   /pick-lists/:id/works        컬렉션에 작품 추가/제거 토글
   GET    /pick-lists/check/:tmdb_id   작품이 담긴 컬렉션 목록 확인
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
          u.grade, u.total_likes_received, u.created_at, u.wishlist_public, u.mbti,
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

      // 인생작품 조회
      const { results: life_works } = await env.DB.prepare(`
        SELECT lw.*,
          COALESCE(wk.poster_path, lw.poster_path) as poster_path,
          COALESCE(wk.title_ko, lw.title_ko) as title_ko
        FROM life_works lw
        LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
        WHERE lw.user_id = ?
        ORDER BY lw.created_at DESC
      `).bind(uid).all();

      // 추천작품 컬렉션 조회 (작품 목록 포함)
      const { results: pickListRows } = await env.DB.prepare(
        "SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC"
      ).bind(uid).all();
      const pick_lists = await Promise.all(pickListRows.map(async (list) => {
        const { results: works } = await env.DB.prepare(
          "SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC"
        ).bind(list.id).all();
        return { ...list, works, work_count: works.length };
      }));

      return new Response(JSON.stringify({
        ok: true, is_own: true, user, reviews, wishlist, posts,
        life_works, pick_lists,
        stats: {
          review_count:    reviews.length,
          wishlist_count:  wishlist.length,
          likes_received:  user?.total_likes_received || 0,
          post_count:      posts.length,
          life_work_count: life_works.length,
          pick_list_count: pick_lists.length,
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
          u.wishlist_public, u.mbti,
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

      // 인생작품 조회
      const { results: life_works } = await env.DB.prepare(`
        SELECT lw.*,
          COALESCE(wk.poster_path, lw.poster_path) as poster_path,
          COALESCE(wk.title_ko, lw.title_ko) as title_ko
        FROM life_works lw
        LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
        WHERE lw.user_id = ?
        ORDER BY lw.created_at DESC
      `).bind(targetUid).all();

      // 추천작품 컬렉션 조회 (공개 컬렉션만)
      const { results: pickListRows } = await env.DB.prepare(
        "SELECT * FROM pick_lists WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC"
      ).bind(targetUid).all();
      const pick_lists = await Promise.all(pickListRows.map(async (list) => {
        const { results: works } = await env.DB.prepare(
          "SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC"
        ).bind(list.id).all();
        return { ...list, works, work_count: works.length };
      }));

      return new Response(JSON.stringify({
        ok: true, is_own: false, user, reviews, wishlist,
        wishlist_hidden: !user.wishlist_public, posts,
        life_works, pick_lists,
        stats: {
          review_count:    reviews.length,
          wishlist_count:  user.wishlist_public ? wishlist.length : null,
          likes_received:  user.total_likes_received || 0,
          post_count:      posts.length,
          life_work_count: life_works.length,
          pick_list_count: pick_lists.length,
        },
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ════════════════════════════════════════════════════════════
  // 인생작품 (Life Works)
  // ════════════════════════════════════════════════════════════

  // ── POST /life-works — 인생작품 토글 (추가/해제) ──────────
  if (path === "/life-works" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const { tmdb_id, title_ko, poster_path, media_type } = await request.json();
      if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id 필요" }), { status: 400, headers });

      const existing = await env.DB.prepare(
        "SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?"
      ).bind(session.user_id, parseInt(tmdb_id)).first();

      if (existing) {
        // 이미 있으면 제거
        await env.DB.prepare(
          "DELETE FROM life_works WHERE user_id = ? AND tmdb_id = ?"
        ).bind(session.user_id, parseInt(tmdb_id)).run();
        return new Response(JSON.stringify({ ok: true, saved: false }), { headers });
      } else {
        // 없으면 추가
        await env.DB.prepare(
          "INSERT INTO life_works (user_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)"
        ).bind(session.user_id, parseInt(tmdb_id), title_ko || "", poster_path || "", media_type || "tv").run();
        return new Response(JSON.stringify({ ok: true, saved: true }), { headers });
      }
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /life-works/check/:tmdb_id — 인생작품 저장 여부 ──
  if (path.match(/^\/life-works\/check\/\d+$/) && request.method === "GET") {
    try {
      const tmdb_id   = parseInt(path.split("/")[3]);
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: true, saved: false }), { headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: true, saved: false }), { headers });
      const existing = await env.DB.prepare(
        "SELECT id FROM life_works WHERE user_id = ? AND tmdb_id = ?"
      ).bind(session.user_id, tmdb_id).first();
      return new Response(JSON.stringify({ ok: true, saved: !!existing }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: true, saved: false }), { headers });
    }
  }

  // ════════════════════════════════════════════════════════════
  // 추천작품 컬렉션 (Pick Lists)
  // ════════════════════════════════════════════════════════════

  // ── GET /pick-lists — 내 추천작품 컬렉션 목록 ────────────
  if (path === "/pick-lists" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      // 컬렉션 목록 + 각 컬렉션의 작품 수 + 작품 목록 함께 조회
      const { results: lists } = await env.DB.prepare(
        "SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC"
      ).bind(session.user_id).all();

      // 각 컬렉션의 작품 목록 병렬 조회
      const listsWithWorks = await Promise.all(lists.map(async (list) => {
        const { results: works } = await env.DB.prepare(
          "SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC"
        ).bind(list.id).all();
        return { ...list, works, work_count: works.length };
      }));

      return new Response(JSON.stringify({ ok: true, data: listsWithWorks }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /pick-lists — 새 컬렉션 생성 ────────────────────
  if (path === "/pick-lists" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const { title, description, is_public } = await request.json();
      if (!title || !title.trim()) {
        return new Response(JSON.stringify({ ok: false, message: "컬렉션 제목을 입력해주세요" }), { status: 400, headers });
      }

      const result = await env.DB.prepare(
        "INSERT INTO pick_lists (user_id, title, description, is_public) VALUES (?, ?, ?, ?)"
      ).bind(session.user_id, title.trim().slice(0, 50), (description || "").slice(0, 200), is_public !== false ? 1 : 0).run();

      // D1에서 마지막 삽입 row id 가져오기
      const newRow = await env.DB.prepare(
        "SELECT id FROM pick_lists WHERE user_id = ? ORDER BY id DESC LIMIT 1"
      ).bind(session.user_id).first();

      return new Response(JSON.stringify({ ok: true, id: newRow?.id || null }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /pick-lists/:id — 컬렉션 삭제 ─────────────────
  if (path.match(/^\/pick-lists\/\d+$/) && request.method === "DELETE") {
    try {
      const list_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      // 본인 컬렉션인지 확인
      const list = await env.DB.prepare(
        "SELECT id FROM pick_lists WHERE id = ? AND user_id = ?"
      ).bind(list_id, session.user_id).first();
      if (!list) return new Response(JSON.stringify({ ok: false, message: "컬렉션을 찾을 수 없어요" }), { status: 404, headers });

      // ON DELETE CASCADE로 pick_list_works도 자동 삭제
      await env.DB.prepare("DELETE FROM pick_lists WHERE id = ?").bind(list_id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /pick-lists/:id/works — 컬렉션에 작품 추가/제거 토글
  if (path.match(/^\/pick-lists\/\d+\/works$/) && request.method === "POST") {
    try {
      const list_id   = parseInt(path.split("/")[2]);
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      // 본인 컬렉션인지 확인
      const list = await env.DB.prepare(
        "SELECT id FROM pick_lists WHERE id = ? AND user_id = ?"
      ).bind(list_id, session.user_id).first();
      if (!list) return new Response(JSON.stringify({ ok: false, message: "컬렉션을 찾을 수 없어요" }), { status: 404, headers });

      const { tmdb_id, title_ko, poster_path, media_type } = await request.json();
      if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id 필요" }), { status: 400, headers });

      const existing = await env.DB.prepare(
        "SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?"
      ).bind(list_id, parseInt(tmdb_id)).first();

      if (existing) {
        // 이미 있으면 제거
        await env.DB.prepare(
          "DELETE FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?"
        ).bind(list_id, parseInt(tmdb_id)).run();
        return new Response(JSON.stringify({ ok: true, added: false }), { headers });
      } else {
        // 없으면 추가
        await env.DB.prepare(
          "INSERT INTO pick_list_works (pick_list_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)"
        ).bind(list_id, parseInt(tmdb_id), title_ko || "", poster_path || "", media_type || "tv").run();
        return new Response(JSON.stringify({ ok: true, added: true }), { headers });
      }
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /pick-lists/check/:tmdb_id — 작품이 담긴 컬렉션 목록
  if (path.match(/^\/pick-lists\/check\/\d+$/) && request.method === "GET") {
    try {
      const tmdb_id   = parseInt(path.split("/")[3]);
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: true, lists: [] }), { headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: true, lists: [] }), { headers });

      // 내 컬렉션 전체 + 각 컬렉션에 해당 작품 포함 여부
      const { results: lists } = await env.DB.prepare(
        "SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC"
      ).bind(session.user_id).all();

      const listsWithCheck = await Promise.all(lists.map(async (list) => {
        const inList = await env.DB.prepare(
          "SELECT id FROM pick_list_works WHERE pick_list_id = ? AND tmdb_id = ?"
        ).bind(list.id, tmdb_id).first();
        const { results: works } = await env.DB.prepare(
          "SELECT COUNT(*) as cnt FROM pick_list_works WHERE pick_list_id = ?"
        ).bind(list.id).all();
        return { ...list, has_work: !!inList, work_count: works[0]?.cnt || 0 };
      }));

      return new Response(JSON.stringify({ ok: true, lists: listsWithCheck }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: true, lists: [] }), { headers });
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
