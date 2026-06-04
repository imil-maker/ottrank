/* ══════════════════════════════════════════════════════════════
   예고편 게시판 API 라우트 (신규)
   GET    /trailers                    플랫폼별 최신 20개씩 묶음 조회
   GET    /trailers/pinned             메인 고정 영상 (최대 5개)
   GET    /trailers/:platform          특정 플랫폼 목록 + 페이지네이션
   GET    /trailers/video/:id          영상 상세 단건
   GET    /trailers/comments/:video_id 댓글 목록
   POST   /trailers/comments           댓글 등록 (로그인 필요)
   POST   /admin/trailers              관리자 수동 등록
   PUT    /admin/trailers/:id          고정/숨김/순서 수정
   DELETE /admin/trailers/:id          영상 삭제
══════════════════════════════════════════════════════════════ */

import { _checkAuth, _getSessionCookie } from "../utils/authUtils.js";

// OTT 플랫폼 정렬 순서 (canonical)
const PLATFORM_ORDER = ["netflix", "tving", "disney", "coupang", "wavve"];

export async function handleTrailers(path, request, env, url, headers) {

  // ── GET /trailers ─────────────────────────────────────────
  // 플랫폼별 최신 20개씩 묶음 반환 (메인 게시판용)
  if (path === "/trailers" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare(`
        SELECT * FROM trailer_videos
        WHERE is_hidden = 0
        ORDER BY ott_platform, published_at DESC
      `).all();

      // 플랫폼별 그룹핑 (최대 20개)
      const grouped = {};
      for (const row of results) {
        const p = row.ott_platform;
        if (!grouped[p]) grouped[p] = [];
        if (grouped[p].length < 20) grouped[p].push(row);
      }

      // 고정 영상 별도 조회 (메인 상단 최대 5개)
      const { results: pinned } = await env.DB.prepare(`
        SELECT * FROM trailer_videos
        WHERE is_pinned = 1 AND is_hidden = 0
        ORDER BY pin_order ASC
        LIMIT 5
      `).all();

      // 플랫폼 정렬 순서 적용
      const platforms = PLATFORM_ORDER
        .filter(p => grouped[p])
        .map(p => ({ platform: p, items: grouped[p] }));

      return new Response(JSON.stringify({ ok: true, platforms, pinned }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /trailers/pinned ─────────────────────────────────
  // 메인 고정 영상 (최대 5개)
  if (path === "/trailers/pinned" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare(`
        SELECT * FROM trailer_videos
        WHERE is_pinned = 1 AND is_hidden = 0
        ORDER BY pin_order ASC
        LIMIT 5
      `).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /trailers/video/:id ───────────────────────────────
  // 영상 상세 단건 조회
  if (path.match(/^\/trailers\/video\/\d+$/) && request.method === "GET") {
    try {
      const id    = parseInt(path.split("/")[3]);
      const video = await env.DB.prepare(
        "SELECT * FROM trailer_videos WHERE id = ? AND is_hidden = 0"
      ).bind(id).first();
      if (!video) {
        return new Response(JSON.stringify({ ok: false, message: "영상을 찾을 수 없어요" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true, data: video }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /trailers/comments/:video_id ─────────────────────
  // 댓글 목록 조회
  if (path.match(/^\/trailers\/comments\/\d+$/) && request.method === "GET") {
    try {
      const video_id = parseInt(path.split("/")[3]);
      const { results } = await env.DB.prepare(`
        SELECT tc.id, tc.content, tc.created_at,
          u.nickname, u.grade,
          gs.emoji_url as grade_emoji_url, gs.grade_name
        FROM trailer_comments tc
        JOIN users u ON tc.user_id = u.id
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
        WHERE tc.video_id = ? AND tc.is_hidden = 0
        ORDER BY tc.created_at DESC
      `).bind(video_id).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /trailers/comments ───────────────────────────────
  // 댓글 등록 (로그인 필요)
  if (path === "/trailers/comments" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) {
        return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      }
      const session = await env.DB.prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) {
        return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });
      }

      const body = await request.json();
      const { video_id, content } = body;

      if (!video_id) {
        return new Response(JSON.stringify({ ok: false, message: "video_id required" }), { status: 400, headers });
      }
      if (!content || content.trim().length < 1) {
        return new Response(JSON.stringify({ ok: false, message: "댓글 내용을 입력해주세요" }), { status: 400, headers });
      }
      if (content.trim().length > 500) {
        return new Response(JSON.stringify({ ok: false, message: "댓글은 500자 이내로 입력해주세요" }), { status: 400, headers });
      }

      // 댓글 작성자 닉네임 조회
      const user = await env.DB.prepare(
        "SELECT nickname FROM users WHERE id = ?"
      ).bind(session.user_id).first();

      const result = await env.DB.prepare(`
        INSERT INTO trailer_comments (video_id, user_id, nickname, content)
        VALUES (?, ?, ?, ?)
      `).bind(video_id, session.user_id, user?.nickname || "익명", content.trim()).run();

      return new Response(JSON.stringify({ ok: true, id: result.meta?.last_row_id }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /trailers/:platform ───────────────────────────────
  // 특정 플랫폼 목록 (더보기 페이지용, 페이지네이션, 최대 30개/페이지)
  // 주의: /trailers/pinned, /trailers/video/:id 등과 겹치지 않도록 순서 중요
  if (path.match(/^\/trailers\/[a-z]+$/) && !path.includes("/video") && request.method === "GET") {
    try {
      const platform = path.split("/")[2];
      const page     = parseInt(url.searchParams.get("page") || "1");
      const limit    = 30;
      const offset   = (page - 1) * limit;

      const { results } = await env.DB.prepare(`
        SELECT * FROM trailer_videos
        WHERE ott_platform = ? AND is_hidden = 0
        ORDER BY published_at DESC
        LIMIT ? OFFSET ?
      `).bind(platform, limit, offset).all();

      const countRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM trailer_videos WHERE ott_platform = ? AND is_hidden = 0"
      ).bind(platform).first();

      return new Response(JSON.stringify({
        ok: true, data: results,
        total: countRow?.cnt || 0, page, limit,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ════════════════════════════════════════════════════════════
  // 관리자 API
  // ════════════════════════════════════════════════════════════

  // ── POST /admin/trailers ──────────────────────────────────
  // 관리자 수동 등록 (YouTube URL + OTT 이름 + 제목)
  if (path === "/admin/trailers" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { ott_platform, youtube_url, title: inputTitle } = body;

      if (!ott_platform || !youtube_url) {
        return new Response(JSON.stringify({ ok: false, message: "ott_platform, youtube_url required" }), { status: 400, headers });
      }

      // youtube_id 추출
      const ytMatch = youtube_url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (!ytMatch) {
        return new Response(JSON.stringify({ ok: false, message: "유효하지 않은 유튜브 URL" }), { status: 400, headers });
      }
      const youtube_id = ytMatch[1];

      // 중복 체크 (youtube_id UNIQUE 제약)
      const existing = await env.DB.prepare(
        "SELECT id FROM trailer_videos WHERE youtube_id = ?"
      ).bind(youtube_id).first();
      if (existing) {
        return new Response(JSON.stringify({ ok: false, message: "이미 등록된 영상이에요" }), { status: 409, headers });
      }

      // 제목 자동 조회 (입력값 없으면 YouTube oEmbed API)
      let title      = inputTitle || "";
      let thumbnail  = "";
      let channel_name = "";
      if (!title || !thumbnail) {
        try {
          const ytInfoRes  = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${youtube_id}&key=${env.YOUTUBE_API_KEY}`
          );
          const ytInfoData = await ytInfoRes.json();
          const snippet    = ytInfoData.items?.[0]?.snippet;
          if (snippet) {
            title        = title || snippet.title || "";
            thumbnail    = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || "";
            channel_name = snippet.channelTitle || "";
          }
        } catch (e) {
          // oEmbed 폴백
          try {
            const oembedRes  = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtube_id}&format=json`);
            const oembedData = await oembedRes.json();
            title     = title || oembedData.title || "";
            thumbnail = thumbnail || oembedData.thumbnail_url || "";
          } catch (e2) {}
        }
      }

      const result = await env.DB.prepare(`
        INSERT INTO trailer_videos (ott_platform, youtube_id, title, thumbnail_url, channel_name)
        VALUES (?, ?, ?, ?, ?)
      `).bind(ott_platform, youtube_id, title, thumbnail, channel_name).run();

      return new Response(JSON.stringify({ ok: true, id: result.meta?.last_row_id, title }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PUT /admin/trailers/:id ───────────────────────────────
  // 고정/숨김/순서 수정
  if (path.match(/^\/admin\/trailers\/\d+$/) && request.method === "PUT") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id   = parseInt(path.split("/")[3]);
      const body = await request.json();
      const { is_pinned, pin_order, is_hidden, title } = body;

      await env.DB.prepare(`
        UPDATE trailer_videos SET
          is_pinned  = COALESCE(?, is_pinned),
          pin_order  = COALESCE(?, pin_order),
          is_hidden  = COALESCE(?, is_hidden),
          title      = COALESCE(?, title)
        WHERE id = ?
      `).bind(
        is_pinned  ?? null,
        pin_order  ?? null,
        is_hidden  ?? null,
        title      || null,
        id
      ).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/trailers/:id ────────────────────────────
  if (path.match(/^\/admin\/trailers\/\d+$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id = parseInt(path.split("/")[3]);
      await env.DB.prepare("DELETE FROM trailer_videos WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM trailer_comments WHERE video_id = ?").bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
