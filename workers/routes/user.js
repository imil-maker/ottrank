/* ══════════════════════════════════════════════════════════════
   유저 활동 관련 API 라우트
   GET    /wishlist
   POST   /wishlist
   GET    /wishlist/check/:tmdb_id
   GET    /reviews/:tmdb_id
   GET    /reviews/:tmdb_id/me
   POST   /reviews/:tmdb_id
   POST   /reviews/:tmdb_id/like/:id   좋아요 토글 (로그인 필요, 다시 누르면 취소)
   DELETE /reviews/:tmdb_id
   GET    /mypage
   GET    /mypage/summary              오뜨 점수/등급만 가볍게 조회 (my_ott.html 전용)
   GET    /mypage/point-logs           오뜨 적립 내역 전체 조회 (페이지네이션)
   PATCH  /mypage/wishlist-public
   GET    /user/:uid
   GET    /user/:uid/reviews           타인 리뷰 목록만 가볍게 조회 (my_review.html 전용)
   GET    /mypage/reviews              본인 리뷰 목록만 가볍게 조회 (my_review.html 전용)
   GET    /grade-settings
   POST   /life-works                  인생작품 토글 (추가/해제)
   GET    /life-works/check/:tmdb_id   인생작품 저장 여부 확인
   GET    /pick-lists                  내 추천작품 컬렉션 목록
   POST   /pick-lists                  새 추천작품 컬렉션 생성
   DELETE /pick-lists/:id              추천작품 컬렉션 삭제
   POST   /pick-lists/:id/works        컬렉션에 작품 추가/제거 토글
   GET    /pick-lists/check/:tmdb_id   작품이 담긴 컬렉션 목록 확인
   POST   /reviews/share               리뷰 카드 공유 오뜨 +10 (1일 1회)
══════════════════════════════════════════════════════════════ */

import { _getSessionCookie, _recalcGrade, _addOttPoints } from "../utils/authUtils.js";

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
        // 찜 등록 시 +1 오뜨 (삭제 시 차감 없음)
        ctx.waitUntil(_addOttPoints(session.user_id, 1, 'wishlist', env));
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

      // 로그인 상태면 "내가 이미 좋아요 눌렀는지"도 같이 조회한다.
      // 비로그인이거나 세션이 만료된 경우엔 myUserId를 -1로 둬서
      // review_likes.user_id(항상 양수)와 매칭되지 않게 처리한다.
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      let myUserId = -1;
      if (sessionId) {
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (session) myUserId = session.user_id;
      }

      const { results } = await env.DB.prepare(`
        SELECT r.*, u.nickname, u.provider, u.grade, u.mbti,
          gs.emoji_url as grade_emoji_url, gs.grade_name,
          CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        WHERE r.tmdb_id = ?
        ORDER BY r.likes DESC, r.created_at DESC
      `).bind(myUserId, tmdb_id).all();
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

      // 신규 작성인지 수정인지 판단 (오뜨 중복 지급 방지)
      const existingReview = await env.DB.prepare(
        "SELECT id FROM reviews WHERE tmdb_id = ? AND user_id = ?"
      ).bind(tmdb_id, session.user_id).first();
      const isNew = !existingReview;

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

      // 신규 작성 시에만 +10 오뜨 (수정 시 미지급)
      if (isNew) ctx.waitUntil(_addOttPoints(session.user_id, 10, 'review', env));
      ctx.waitUntil(_recalcGrade(session.user_id, env));
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /reviews/:tmdb_id/like/:id — 좋아요 토글 ──────────
  // review_likes 행을 지우지 않고 is_active(켜짐/꺼짐)만 바꾸는 방식.
  // 이렇게 해야 "이 유저가 이 리뷰에 평생 한 번이라도 좋아요를 줬는지"를
  // 계속 기억할 수 있어서, 토글을 아무리 반복해도 오뜨는 최초 1회만 지급된다.
  //   - 기록이 아예 없음        → INSERT(is_active=1) + likes+1 + 오뜨 +1 (최초 1회)
  //   - 기록 있고 is_active=1  → is_active=0으로 변경(취소) + likes-1 (오뜨 변화 없음)
  //   - 기록 있고 is_active=0  → is_active=1로 변경(재좋아요) + likes+1 (오뜨 변화 없음 — 예전에 이미 지급함)
  if (path.match(/^\/reviews\/\d+\/like\/\d+$/) && request.method === "POST") {
    try {
      const review_id = parseInt(path.split("/")[4]);

      // 좋아요는 로그인한 유저만 가능 (다른 쓰기 API들과 동일한 패턴)
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const review = await env.DB.prepare(
        "SELECT user_id FROM reviews WHERE id = ?"
      ).bind(review_id).first();
      if (!review) return new Response(JSON.stringify({ ok: false, message: "리뷰를 찾을 수 없어요" }), { status: 404, headers });

      // 이 유저가 이 리뷰에 좋아요를 누른 적이 있는지 확인 (취소했어도 행 자체는 남아있음)
      const existing = await env.DB.prepare(
        "SELECT id, is_active FROM review_likes WHERE review_id = ? AND user_id = ?"
      ).bind(review_id, session.user_id).first();

      let liked;

      if (!existing) {
        // ── 최초 좋아요 — 행 신규 생성 + 오뜨 지급 ──
        await env.DB.prepare(
          "INSERT INTO review_likes (review_id, user_id, is_active) VALUES (?, ?, 1)"
        ).bind(review_id, session.user_id).run();
        await env.DB.prepare(
          "UPDATE reviews SET likes = likes + 1 WHERE id = ?"
        ).bind(review_id).run();
        if (review.user_id) {
          await env.DB.prepare(
            "UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?"
          ).bind(review.user_id).run();
          ctx.waitUntil(_addOttPoints(review.user_id, 1, 'like_received', env));
          ctx.waitUntil(_recalcGrade(review.user_id, env));
        }
        liked = true;

      } else if (existing.is_active) {
        // ── 좋아요 취소 — is_active만 0으로, 오뜨는 그대로 유지 ──
        await env.DB.prepare(
          "UPDATE review_likes SET is_active = 0 WHERE id = ?"
        ).bind(existing.id).run();
        await env.DB.prepare(
          "UPDATE reviews SET likes = MAX(0, likes - 1) WHERE id = ?"
        ).bind(review_id).run();
        if (review.user_id) {
          await env.DB.prepare(
            "UPDATE users SET total_likes_received = MAX(0, total_likes_received - 1) WHERE id = ?"
          ).bind(review.user_id).run();
        }
        liked = false;

      } else {
        // ── 재좋아요 — is_active만 1로, 오뜨는 다시 지급하지 않음(예전에 이미 줬음) ──
        await env.DB.prepare(
          "UPDATE review_likes SET is_active = 1 WHERE id = ?"
        ).bind(existing.id).run();
        await env.DB.prepare(
          "UPDATE reviews SET likes = likes + 1 WHERE id = ?"
        ).bind(review_id).run();
        if (review.user_id) {
          await env.DB.prepare(
            "UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = ?"
          ).bind(review.user_id).run();
        }
        liked = true;
      }

      // 프론트가 재조회 없이 바로 반영할 수 있도록 최신 likes 수치도 같이 반환
      const updated = await env.DB.prepare(
        "SELECT likes FROM reviews WHERE id = ?"
      ).bind(review_id).first();

      return new Response(JSON.stringify({ ok: true, liked, likes: updated?.likes ?? 0 }), { headers });
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

      // 아래 8개는 서로 독립적인 조회라서, 8번 왕복하는 대신
      // env.DB.batch()로 한 봉투에 묶어서 D1에 단 1번만 왕복한다.
      // (Promise.all은 JS 쪽에서 동시에 "보내기"는 하지만 D1까지의 왕복 자체는 각각 따로 발생함
      //  → batch()를 써야 실제로 네트워크 왕복 횟수가 줄어듦)
      const [
        userRes,
        reviewsRes,
        wishlistRes,
        postsRes,
        lifeWorksRes,
        pickListRowsRes,
        recentLogsRes,
        gradeSettingsRes,
      ] = await env.DB.batch([
        env.DB.prepare(`
          SELECT u.id, u.nickname, u.provider, u.email, u.avatar_url,
            u.grade, u.total_likes_received, u.created_at, u.wishlist_public, u.mbti,
            u.ott_points,
            gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
            gs.is_special as grade_is_special
          FROM users u
          LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
          WHERE u.id = ?
        `).bind(uid),

        env.DB.prepare(`
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
        `).bind(uid),

        env.DB.prepare(`
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
        `).bind(uid),

        env.DB.prepare(`
          SELECT id, board_type, title, like_count, view_count, created_at
          FROM posts
          WHERE user_id = ? AND is_hidden = 0
          ORDER BY created_at DESC
        `).bind(uid),

        env.DB.prepare(`
          SELECT lw.*,
            COALESCE(wk.poster_path, lw.poster_path) as poster_path,
            COALESCE(wk.title_ko, lw.title_ko) as title_ko
          FROM life_works lw
          LEFT JOIN works wk ON wk.tmdb_id = lw.tmdb_id
          WHERE lw.user_id = ?
          ORDER BY lw.created_at DESC
        `).bind(uid),

        env.DB.prepare(
          "SELECT * FROM pick_lists WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(uid),

        env.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 20
        `).bind(uid),

        env.DB.prepare(
          "SELECT grade_key, grade_name, min_ott_points, emoji_url, is_special, sort_order FROM grade_settings ORDER BY sort_order ASC"
        ),
      ]);

      // batch()는 .first()를 지원하지 않아서, user는 results 배열의 첫 행을 직접 꺼내야 함
      const user                = userRes.results[0] || null;
      const reviews              = reviewsRes.results;
      const wishlist             = wishlistRes.results;
      const posts                = postsRes.results;
      const life_works           = lifeWorksRes.results;
      const pickListRows         = pickListRowsRes.results;
      const recent_point_logs    = recentLogsRes.results;
      const grade_settings       = gradeSettingsRes.results;

      // 추천작품 컬렉션 작품 목록도 컬렉션 개수만큼 따로 왕복하지 않도록 batch로 한 번에 조회
      // (컬렉션이 하나도 없으면 batch([])가 에러날 수 있어 빈 배열일 때는 건너뜀)
      let pick_lists = [];
      if (pickListRows.length) {
        const workResults = await env.DB.batch(
          pickListRows.map((list) =>
            env.DB.prepare(
              "SELECT * FROM pick_list_works WHERE pick_list_id = ? ORDER BY sort_order ASC, created_at DESC"
            ).bind(list.id)
          )
        );
        pick_lists = pickListRows.map((list, i) => {
          const works = workResults[i].results;
          return { ...list, works, work_count: works.length };
        });
      }

      return new Response(JSON.stringify({
        ok: true, is_own: true, user, reviews, wishlist, posts,
        life_works, pick_lists, recent_point_logs, grade_settings,
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

  // ── GET /mypage/summary — 오뜨 점수/등급 정보만 가볍게 조회 (my_ott.html 전용) ──
  // 전체 /mypage는 리뷰/찜/게시글/인생작품/추천작품까지 다 조회해서 무겁다.
  // my_ott.html은 그중 user(오뜨 점수, 등급)만 필요하므로, 세션확인+유저조회 딱 2번만 하는 가벼운 버전.
  if (path === "/mypage/summary" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const user = await env.DB.prepare(`
        SELECT u.id, u.nickname, u.grade, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url, gs.sort_order as grade_order,
          gs.is_special as grade_is_special
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE u.id = ?
      `).bind(session.user_id).first();

      return new Response(JSON.stringify({ ok: true, user }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /mypage/point-logs — 오뜨 적립 내역 전체 조회 (페이지네이션) ──
  // my_ott.html의 "전체 내역" 목록에서 사용. /mypage는 미리보기용 최근 20개만 주므로 별도 분리.
  if (path === "/mypage/point-logs" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      const params = new URL(request.url).searchParams;
      const page  = Math.max(1, parseInt(params.get('page') || '1'));
      const limit = Math.min(50, Math.max(1, parseInt(params.get('limit') || '10')));
      const offset = (page - 1) * limit;

      // 개수 조회 + 목록 조회를 batch로 묶어서 1번만 왕복
      const [countRes, logsRes] = await env.DB.batch([
        env.DB.prepare(
          "SELECT COUNT(*) AS total FROM user_point_logs WHERE user_id = ?"
        ).bind(session.user_id),
        env.DB.prepare(`
          SELECT points, reason, created_at
          FROM user_point_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `).bind(session.user_id, limit, offset),
      ]);
      const total = countRes.results[0]?.total || 0;
      const logs  = logsRes.results;

      return new Response(JSON.stringify({ ok: true, logs, total, page, limit }), { headers });
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
  // 리뷰 목록 전용 (my_review.html) — 찜/게시글/인생작품/추천작품 없이
  // 리뷰만 가볍게 조회. /mypage, /user/:uid는 그 페이지들 전체 데이터까지
  // 다 가져와서 무겁기 때문에 분리.
  // ════════════════════════════════════════════════════════════

  // ── GET /mypage/reviews — 본인 리뷰 목록만 조회 ────────────
  if (path === "/mypage/reviews" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      // 페이지 타이틀에 닉네임을 표시하기 위해 같이 조회
      const userRow = await env.DB.prepare(
        "SELECT nickname FROM users WHERE id = ?"
      ).bind(session.user_id).first();

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
      `).bind(session.user_id).all();

      return new Response(JSON.stringify({ ok: true, reviews, nickname: userRow?.nickname || '나' }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /user/:uid/reviews — 타인 리뷰 목록만 조회 ─────────
  if (path.match(/^\/user\/\d+\/reviews$/) && request.method === "GET") {
    try {
      const targetUid = parseInt(path.split("/")[2]);

      const userRow = await env.DB.prepare(
        "SELECT nickname FROM users WHERE id = ?"
      ).bind(targetUid).first();
      if (!userRow) return new Response(JSON.stringify({ ok: false, message: "유저를 찾을 수 없어요" }), { status: 404, headers });

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

      return new Response(JSON.stringify({ ok: true, reviews, nickname: userRow.nickname || '유저' }), { headers });
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
        // 이미 있으면 제거 (차감 없음)
        await env.DB.prepare(
          "DELETE FROM life_works WHERE user_id = ? AND tmdb_id = ?"
        ).bind(session.user_id, parseInt(tmdb_id)).run();
        return new Response(JSON.stringify({ ok: true, saved: false }), { headers });
      } else {
        // 없으면 추가 + +2 오뜨
        await env.DB.prepare(
          "INSERT INTO life_works (user_id, tmdb_id, title_ko, poster_path, media_type) VALUES (?, ?, ?, ?, ?)"
        ).bind(session.user_id, parseInt(tmdb_id), title_ko || "", poster_path || "", media_type || "tv").run();
        // 인생작품 등록 시 +2 오뜨 (삭제 시 차감 없음)
        ctx.waitUntil(_addOttPoints(session.user_id, 2, 'life_work', env));
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

      // 추천작품 컬렉션 생성 시 +2 오뜨
      ctx.waitUntil(_addOttPoints(session.user_id, 2, 'pick_list', env));

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

  // ── GET /reviews/recent — 최근 평점 후기 (공개 API, 인증 불필요) ──
  if (path === "/reviews/recent" && request.method === "GET") {
    try {
      const params = new URL(request.url).searchParams;
      // limit: 메인페이지는 5, 커뮤니티는 20 — 최대 20으로 제한
      const limit  = Math.min(parseInt(params.get('limit') || '5'), 20);
      // page: 1부터 시작, 커뮤니티 페이지네이션용
      const page   = Math.max(1, parseInt(params.get('page') || '1'));
      const offset = (page - 1) * limit;

      // 로그인 상태면 "내가 이미 좋아요 눌렀는지"도 같이 조회 (커뮤니티 좋아요 버튼용)
      // 비로그인/세션만료 시 myUserId=-1로 둬서 review_likes.user_id(항상 양수)와 매칭 안 되게 처리
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      let myUserId = -1;
      if (sessionId) {
        const session = await env.DB.prepare(
          "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
        ).bind(sessionId).first();
        if (session) myUserId = session.user_id;
      }

      // 전체 리뷰 수 (페이지네이션 UI 계산용)
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM reviews`
      ).first();
      const total = countRow?.total || 0;

      const { results } = await env.DB.prepare(`
        SELECT r.id, r.user_id, r.tmdb_id, r.score, r.text AS body,
               r.emotions, r.created_at, r.likes,
               COALESCE(wk.title_ko, rk.title_ko) AS title_ko,
               wk.media_type AS media_type,
               wk.poster_path AS poster_path,
               u.nickname, u.profile_image, u.mbti,
               CASE WHEN rl.id IS NOT NULL THEN 1 ELSE 0 END AS liked_by_me
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN works wk ON wk.tmdb_id = r.tmdb_id
        LEFT JOIN (
          SELECT tmdb_id, title_ko
          FROM rankings WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id
        ) rk ON rk.tmdb_id = r.tmdb_id
        LEFT JOIN review_likes rl ON rl.review_id = r.id AND rl.user_id = ? AND rl.is_active = 1
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(myUserId, limit, offset).all();

      return new Response(JSON.stringify({
        ok:      true,
        reviews: results || [],
        total,
        page,
        limit,
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

  // ── POST /reviews/share — 리뷰 카드 공유 +10 오뜨 (1일 1회) ─
  if (path === "/reviews/share" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });

      // 1일 1회 제한 — 오늘 날짜(KST) 기준
      const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const alreadyShared = await env.DB.prepare(
        `SELECT id FROM user_point_logs
         WHERE user_id = ? AND reason = 'share'
         AND DATE(created_at) = ?
         LIMIT 1`
      ).bind(session.user_id, todayKST).first();

      if (alreadyShared) {
        return new Response(JSON.stringify({ ok: true, already: true, message: "오늘은 이미 공유 오뜨를 받았어요" }), { headers });
      }

      await _addOttPoints(session.user_id, 10, 'share', env);
      return new Response(JSON.stringify({ ok: true, already: false, points: 10 }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
