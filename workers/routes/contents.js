/* ══════════════════════════════════════════════════════════════
   contents.js — OTT 콘텐츠(예고편/신작) 게시판 API
   
   Public:
     GET  /contents               플랫폼별 최신 목록 (타입 필터 가능)
     GET  /contents/pinned        메인 고정 최대 5개
     GET  /contents/list          더보기 (플랫폼+타입 필터, 페이지네이션)
     GET  /contents/video/:id     영상 상세
     GET  /contents/comments/:id  댓글 목록
     POST /contents/comments      댓글 등록 (로그인 필요)

   Admin:
     GET    /admin/contents                  전체 목록 (숨김 포함)
     GET    /admin/contents/check            youtube_id 중복 체크 (크롤러용)
     POST   /admin/contents                  수동 등록
     PUT    /admin/contents/:id              수정
     DELETE /admin/contents/:id              삭제
     PATCH  /admin/contents/pinned/reorder   고정 순서 변경
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

// ─────────────────────────────────────────────
// 라우터 진입점 — index.js에서 호출
// 기존 패턴: (path, request, env, url, headers)
// ─────────────────────────────────────────────
export async function handleContents(path, request, env, url, headers) {
  const method = request.method;

  try {
    // ── Public 라우트 ──────────────────────────────────────

    // GET /contents — 플랫폼별 최신 목록
    if (method === "GET" && path === "/contents") {
      return getContentsList(url, env, headers);
    }

    // GET /contents/pinned — 메인 고정 최대 5개
    if (method === "GET" && path === "/contents/pinned") {
      return getPinnedContents(env, headers);
    }

    // GET /contents/list — 더보기 (페이지네이션)
    if (method === "GET" && path === "/contents/list") {
      return getContentsListPaged(url, env, headers);
    }

    // GET /contents/video/:id — 영상 상세
    const videoMatch = path.match(/^\/contents\/video\/(\d+)$/);
    if (method === "GET" && videoMatch) {
      return getContentDetail(videoMatch[1], env, headers);
    }

    // GET /contents/comments/:content_id — 댓글 목록
    const commentsMatch = path.match(/^\/contents\/comments\/(\d+)$/);
    if (method === "GET" && commentsMatch) {
      return getComments(commentsMatch[1], env, headers);
    }

    // POST /contents/comments — 댓글 등록 (로그인 필요)
    if (method === "POST" && path === "/contents/comments") {
      return postComment(request, env, headers);
    }

    // ── Admin 라우트 ───────────────────────────────────────

    // PATCH /admin/contents/pinned/reorder — 고정 순서 변경
    // (PUT /:id 보다 앞에 배치해야 경로 충돌 없음)
    if (method === "PATCH" && path === "/admin/contents/pinned/reorder") {
      return adminReorderPinned(request, env, headers);
    }

    // GET /admin/contents/check — youtube_id 중복 체크 (크롤러용)
    // (GET /admin/contents 보다 앞에 배치해야 경로 충돌 없음)
    if (method === "GET" && path === "/admin/contents/check") {
      return adminCheckDuplicate(url, request, env, headers);
    }

    // GET /admin/contents — 관리자 전체 목록
    if (method === "GET" && path === "/admin/contents") {
      return adminGetContents(url, request, env, headers);
    }

    // POST /admin/contents — 수동 등록
    if (method === "POST" && path === "/admin/contents") {
      return adminCreateContent(request, env, headers);
    }

    // PUT /admin/contents/:id — 수정
    const adminPutMatch = path.match(/^\/admin\/contents\/(\d+)$/);
    if (method === "PUT" && adminPutMatch) {
      return adminUpdateContent(adminPutMatch[1], request, env, headers);
    }

    // DELETE /admin/contents/:id — 삭제
    const adminDeleteMatch = path.match(/^\/admin\/contents\/(\d+)$/);
    if (method === "DELETE" && adminDeleteMatch) {
      return adminDeleteContent(adminDeleteMatch[1], request, env, headers);
    }

    // 매칭되는 라우트 없음
    return null;

  } catch (e) {
    // 예상치 못한 에러 처리
    console.error("[contents] 오류:", e);
    return new Response(
      JSON.stringify({ ok: false, error: "서버 오류가 발생했습니다." }),
      { status: 500, headers }
    );
  }
}

// ─────────────────────────────────────────────
// 헬퍼: JSON 응답 생성
// ─────────────────────────────────────────────
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// ─────────────────────────────────────────────
// 헬퍼: Admin 인증 체크
// ─────────────────────────────────────────────
function checkAdmin(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  return token === env.ADMIN_SECRET;
}

// ─────────────────────────────────────────────
// Public: 플랫폼별 최신 목록
// GET /contents?platform=netflix&type=trailer&limit=20
// ─────────────────────────────────────────────
async function getContentsList(url, env, headers) {
  const platform = url.searchParams.get("platform"); // 없으면 전체
  const type     = url.searchParams.get("type");     // trailer / teaser / preview / release
  const limit    = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  // 동적 WHERE 조건 조립
  const conditions = ["is_hidden = 0"];
  const bindings   = [];

  if (platform) {
    conditions.push("platform = ?");
    bindings.push(platform);
  }
  if (type) {
    conditions.push("type = ?");
    bindings.push(type);
  }

  const where = conditions.join(" AND ");
  bindings.push(limit);

  const { results } = await env.DB.prepare(
    `SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count, is_pinned
     FROM ott_contents
     WHERE ${where}
     ORDER BY published_at DESC
     LIMIT ?`
  ).bind(...bindings).all();

  return json({ ok: true, items: results ?? [] }, 200, headers);
}

// ─────────────────────────────────────────────
// Public: 메인 고정 최대 5개
// GET /contents/pinned
// ─────────────────────────────────────────────
async function getPinnedContents(env, headers) {
  const { results } = await env.DB.prepare(
    `SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count
     FROM ott_contents
     WHERE is_pinned = 1 AND is_hidden = 0
     ORDER BY sort_order ASC
     LIMIT 5`
  ).all();

  return json({ ok: true, items: results ?? [] }, 200, headers);
}

// ─────────────────────────────────────────────
// Public: 더보기 (페이지네이션)
// GET /contents/list?platform=netflix&type=trailer&page=1
// ─────────────────────────────────────────────
async function getContentsListPaged(url, env, headers) {
  const platform = url.searchParams.get("platform");
  const type     = url.searchParams.get("type");
  const page     = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
  const pageSize = 30;
  const offset   = (page - 1) * pageSize;

  const conditions = ["is_hidden = 0"];
  const bindings   = [];

  if (platform) {
    conditions.push("platform = ?");
    bindings.push(platform);
  }
  if (type) {
    conditions.push("type = ?");
    bindings.push(type);
  }

  const where         = conditions.join(" AND ");
  const countBindings = [...bindings];
  const dataBindings  = [...bindings, pageSize, offset];

  // 전체 카운트 + 데이터 동시 조회 (batch로 요청 최소화)
  const [countResult, dataResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) as total FROM ott_contents WHERE ${where}`
    ).bind(...countBindings),
    env.DB.prepare(
      `SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at, view_count
       FROM ott_contents
       WHERE ${where}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...dataBindings),
  ]);

  const total = countResult.results?.[0]?.total ?? 0;
  const items = dataResult.results ?? [];

  return json({
    ok: true,
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }, 200, headers);
}

// ─────────────────────────────────────────────
// Public: 영상 상세 조회
// GET /contents/video/:id
// ─────────────────────────────────────────────
async function getContentDetail(id, env, headers) {
  const item = await env.DB.prepare(
    `SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, created_at
     FROM ott_contents
     WHERE id = ? AND is_hidden = 0`
  ).bind(id).first();

  if (!item) {
    return json({ ok: false, error: "영상을 찾을 수 없습니다." }, 404, headers);
  }

  // 조회수 +1 (응답 블로킹 없이 비동기 처리)
  env.DB.prepare(
    `UPDATE ott_contents SET view_count = view_count + 1 WHERE id = ?`
  ).bind(id).run();

  return json({ ok: true, item }, 200, headers);
}

// ─────────────────────────────────────────────
// Public: 댓글 목록 조회
// GET /contents/comments/:content_id
// ─────────────────────────────────────────────
async function getComments(contentId, env, headers) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at,
            u.id   AS user_id,
            u.nickname,
            u.profile_image
     FROM ott_content_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.content_id = ? AND c.is_hidden = 0
     ORDER BY c.created_at ASC`
  ).bind(contentId).all();

  return json({ ok: true, comments: results ?? [] }, 200, headers);
}

// ─────────────────────────────────────────────
// Public: 댓글 등록 (로그인 필요)
// POST /contents/comments
// body: { content_id, body }
// ─────────────────────────────────────────────
async function postComment(request, env, headers) {
  // 로그인 세션 확인
  const user = await _checkAuth(request, env);
  if (!user) {
    return json({ ok: false, error: "로그인이 필요합니다." }, 401, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다." }, 400, headers);
  }

  const { content_id, body: commentBody } = body;

  // 입력값 검증
  if (!content_id || !commentBody?.trim()) {
    return json({ ok: false, error: "content_id와 댓글 내용이 필요합니다." }, 400, headers);
  }
  if (commentBody.trim().length > 500) {
    return json({ ok: false, error: "댓글은 500자 이내로 입력해주세요." }, 400, headers);
  }

  // 영상 존재 여부 확인
  const content = await env.DB.prepare(
    `SELECT id FROM ott_contents WHERE id = ? AND is_hidden = 0`
  ).bind(content_id).first();

  if (!content) {
    return json({ ok: false, error: "영상을 찾을 수 없습니다." }, 404, headers);
  }

  // 댓글 저장
  const result = await env.DB.prepare(
    `INSERT INTO ott_content_comments (content_id, user_id, body)
     VALUES (?, ?, ?)`
  ).bind(content_id, user.id, commentBody.trim()).run();

  return json({ ok: true, id: result.meta?.last_row_id }, 200, headers);
}

// ─────────────────────────────────────────────
// Admin: 전체 목록 조회 (숨김 포함)
// GET /admin/contents?platform=&type=&page=1
// ─────────────────────────────────────────────
async function adminGetContents(url, request, env, headers) {
  if (!checkAdmin(request, env)) {
    return json({ ok: false, error: "권한이 없습니다." }, 403, headers);
  }

  const platform = url.searchParams.get("platform");
  const type     = url.searchParams.get("type");
  const page     = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
  const pageSize = 50;
  const offset   = (page - 1) * pageSize;

  const conditions = ["1=1"];
  const bindings   = [];

  if (platform) {
    conditions.push("platform = ?");
    bindings.push(platform);
  }
  if (type) {
    conditions.push("type = ?");
    bindings.push(type);
  }

  const where         = conditions.join(" AND ");
  const countBindings = [...bindings];
  const dataBindings  = [...bindings, pageSize, offset];

  const [countResult, dataResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) as total FROM ott_contents WHERE ${where}`
    ).bind(...countBindings),
    env.DB.prepare(
      `SELECT id, youtube_id, platform, type, title, work_title,
              tmdb_id, tmdb_type, thumbnail, published_at,
              view_count, is_pinned, is_hidden, sort_order, created_at
       FROM ott_contents
       WHERE ${where}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...dataBindings),
  ]);

  const total = countResult.results?.[0]?.total ?? 0;
  const items = dataResult.results ?? [];

  return json({
    ok: true,
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }, 200, headers);
}

// ─────────────────────────────────────────────
// Admin: youtube_id 중복 체크 (크롤러용)
// GET /admin/contents/check?youtube_id=xxxx
// 응답: { ok: true, exists: true/false }
// ─────────────────────────────────────────────
async function adminCheckDuplicate(url, request, env, headers) {
  if (!checkAdmin(request, env)) {
    return json({ ok: false, error: "권한이 없습니다." }, 403, headers);
  }

  const youtube_id = url.searchParams.get("youtube_id");
  if (!youtube_id) {
    return json({ ok: false, error: "youtube_id가 필요합니다." }, 400, headers);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM ott_contents WHERE youtube_id = ?`
  ).bind(youtube_id).first();

  return json({ ok: true, exists: !!existing }, 200, headers);
}

// ─────────────────────────────────────────────
// Admin: 수동 등록
// POST /admin/contents
// body: { youtube_id, platform, type, title, work_title,
//         tmdb_id, tmdb_type, thumbnail, published_at }
// ─────────────────────────────────────────────
async function adminCreateContent(request, env, headers) {
  if (!checkAdmin(request, env)) {
    return json({ ok: false, error: "권한이 없습니다." }, 403, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다." }, 400, headers);
  }

  const {
    youtube_id, platform, type = "trailer",
    title, work_title, tmdb_id, tmdb_type,
    thumbnail, published_at,
  } = body;

  // 필수값 검증
  if (!youtube_id || !platform || !title || !published_at) {
    return json({
      ok: false,
      error: "youtube_id, platform, title, published_at는 필수입니다.",
    }, 400, headers);
  }

  // 플랫폼 유효성 검증
  const validPlatforms = ["netflix", "tving", "disney", "coupang", "wavve", "boxoffice", "etc"];
  if (!validPlatforms.includes(platform)) {
    return json({ ok: false, error: "유효하지 않은 플랫폼입니다." }, 400, headers);
  }

  // 타입 유효성 검증
  const validTypes = ["trailer", "teaser", "preview", "release"];
  if (!validTypes.includes(type)) {
    return json({ ok: false, error: "유효하지 않은 타입입니다." }, 400, headers);
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO ott_contents
         (youtube_id, platform, type, title, work_title,
          tmdb_id, tmdb_type, thumbnail, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      youtube_id, platform, type, title,
      work_title  || null,
      tmdb_id     || null,
      tmdb_type   || null,
      thumbnail   || null,
      published_at
    ).run();

    // TMDB 매칭된 작품이 있으면 works 테이블에도 자동 등록
    // INSERT OR IGNORE → 이미 있으면 기존 데이터 보호, 없으면 신규 추가
    if (tmdb_id && work_title) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO works (tmdb_id, category, title_ko, match_source)
         VALUES (?, 'tv', ?, 'crawler')`
      ).bind(tmdb_id, work_title).run();
    }

    return json({ ok: true, id: result.meta?.last_row_id }, 200, headers);

  } catch (e) {
    // UNIQUE 제약 위반 — 이미 등록된 youtube_id
    if (e.message?.includes("UNIQUE")) {
      return json({ ok: false, error: "이미 등록된 YouTube 영상입니다." }, 409, headers);
    }
    throw e;
  }
}

// ─────────────────────────────────────────────
// Admin: 수정
// PUT /admin/contents/:id
// body: { work_title, tmdb_id, tmdb_type, type,
//         is_pinned, is_hidden, sort_order }
// ─────────────────────────────────────────────
async function adminUpdateContent(id, request, env, headers) {
  if (!checkAdmin(request, env)) {
    return json({ ok: false, error: "권한이 없습니다." }, 403, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다." }, 400, headers);
  }

  // 존재 여부 확인
  const existing = await env.DB.prepare(
    `SELECT id FROM ott_contents WHERE id = ?`
  ).bind(id).first();

  if (!existing) {
    return json({ ok: false, error: "영상을 찾을 수 없습니다." }, 404, headers);
  }

  // 업데이트 가능한 컬럼만 동적 조립 (전달된 값만 수정)
  const updatable  = ["work_title", "tmdb_id", "tmdb_type", "type", "is_pinned", "is_hidden", "sort_order"];
  const setClauses = [];
  const bindings   = [];

  for (const key of updatable) {
    if (body[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      bindings.push(body[key]);
    }
  }

  if (setClauses.length === 0) {
    return json({ ok: false, error: "수정할 값이 없습니다." }, 400, headers);
  }

  bindings.push(id);

  await env.DB.prepare(
    `UPDATE ott_contents SET ${setClauses.join(", ")} WHERE id = ?`
  ).bind(...bindings).run();

  return json({ ok: true }, 200, headers);
}

// ─────────────────────────────────────────────
// Admin: 삭제
// DELETE /admin/contents/:id
// ─────────────────────────────────────────────
async function adminDeleteContent(id, request, env, headers) {
  if (!checkAdmin(request, env)) {
    return json({ ok: false, error: "권한이 없습니다." }, 403, headers);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM ott_contents WHERE id = ?`
  ).bind(id).first();

  if (!existing) {
    return json({ ok: false, error: "영상을 찾을 수 없습니다." }, 404, headers);
  }

  // ON DELETE CASCADE로 댓글도 자동 삭제됨
  await env.DB.prepare(
    `DELETE FROM ott_contents WHERE id = ?`
  ).bind(id).run();

  return json({ ok: true }, 200, headers);
}

// ─────────────────────────────────────────────
// Admin: 고정 영상 순서 변경
// PATCH /admin/contents/pinned/reorder
// body: { ordered_ids: [3, 1, 5, 2, 4] }
// ─────────────────────────────────────────────
async function adminReorderPinned(request, env, headers) {
  if (!checkAdmin(request, env)) {
    return json({ ok: false, error: "권한이 없습니다." }, 403, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "잘못된 요청 형식입니다." }, 400, headers);
  }

  const { ordered_ids } = body;

  if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
    return json({ ok: false, error: "ordered_ids 배열이 필요합니다." }, 400, headers);
  }
  if (ordered_ids.length > 5) {
    return json({ ok: false, error: "고정 영상은 최대 5개입니다." }, 400, headers);
  }

  // 전체 is_pinned 해제 후 순서대로 재설정 (batch)
  const queries = [
    env.DB.prepare(`UPDATE ott_contents SET is_pinned = 0, sort_order = 0`),
    ...ordered_ids.map((contentId, index) =>
      env.DB.prepare(
        `UPDATE ott_contents SET is_pinned = 1, sort_order = ? WHERE id = ?`
      ).bind(index + 1, contentId)
    ),
  ];

  await env.DB.batch(queries);

  return json({ ok: true }, 200, headers);
}
