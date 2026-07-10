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

   [2026-07-10 변경] 작품연결 → title_videos 자동 복사
   ott_contents(예고편 게시판)에서 tmdb_id가 연결(등록 시 또는 이후 수정 시)
   되면, 같은 영상을 title_videos(작품 상세페이지 관련영상)에도 자동으로
   복사해 넣는다. 두 테이블은 원래 완전히 별개 시스템이었는데(사람이 직접
   확인하고 연결한 예고편이 작품페이지에는 전혀 반영이 안 되고 있었음),
   이번 변경으로 한쪽에 연결하면 다른 쪽에도 자동 반영되게 함.
     - 효과 1: 관련영상 개수(title_videos 기준)가 자동으로 늘어나서,
       유튜브 보충 크롤링(할당량 소모) 대상에서 자동 제외되는 작품이 늘어남
     - 효과 2: 관리자가 직접 확인하고 연결한 예고편이라 유튜브 검색
       관련성 필터보다 신뢰도 높은 소스가 관련영상에 섞여 들어감
   TMDB ID 충돌(영화/TV가 같은 숫자 ID를 쓰는 경우) 방지를 위해, 복사 전
   반드시 works.media_type과 ott_contents.tmdb_type이 일치하는지 확인한다.
   일치하지 않거나 works에 해당 작품이 아예 없으면 복사하지 않고 그냥
   넘어간다(로그만 남김) — 확실하지 않으면 틀린 영상을 붙이지 않는 원칙.
   이 복사 로직은 부가 기능이므로, 실패해도 ott_contents 등록/수정
   자체(핵심 기능)는 절대 막지 않도록 항상 try/catch로 격리한다.

   [2026-07-10 변경] adminCreateContent의 works 자동등록 하드코딩 제거
   기존엔 works에 신규 등록할 때 media_type을 무조건 'tv'로 넣고 있었음
   (media_type 개념이 정착되기 전에 만들어진 코드로 추정). 이제는 실제
   tmdb_type 값을 그대로 쓰고, 값이 없으면 추측하지 않고 NULL로 남긴다
   (release_year=0, original_language='unknown'과 같은 센티널 원칙 —
   "모름"과 "확정된 값"을 구분해서 다룸).
══════════════════════════════════════════════════════════════ */

import { _checkAuth, _getSessionCookie } from "../utils/authUtils.js";

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

    // DELETE /contents/comments/:id — 댓글 삭제 (본인만 가능)
    const deleteCommentMatch = path.match(/^\/contents\/comments\/(\d+)$/);
    if (method === "DELETE" && deleteCommentMatch) {
      return deleteComment(deleteCommentMatch[1], request, env, headers);
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
// 헬퍼: ott_contents 영상을 title_videos(작품페이지 관련영상)에 복사
//
// [2026-07-10 신설]
// - adminCreateContent(등록 시 tmdb_id 매칭됨)와 adminUpdateContent
//   (작품연결 버튼으로 tmdb_id 지정됨) 양쪽에서 공유해서 사용
// - works.media_type과 넘겨받은 tmdb_type이 일치할 때만 복사 실행
//   (TMDB ID 충돌 — 영화/TV가 같은 숫자 ID를 쓰는 경우 — 로 인해
//   엉뚱한 작품에 엉뚱한 영상이 붙는 사고를 막기 위함)
// - works에 해당 tmdb_id가 아예 없으면 확인 불가이므로 복사하지 않음
// - INSERT OR IGNORE라 title_videos에 같은 youtube_id가 이미 있으면
//   자동으로 건너뜀 (중복 저장 안 됨)
// - 호출부에서 반드시 try/catch로 감싸서 쓸 것 — 이 함수 자체는
//   에러를 던질 수 있음 (부가 기능 실패가 핵심 기능을 막으면 안 되므로)
// ─────────────────────────────────────────────
async function _linkToTitleVideos(tmdb_id, tmdb_type, youtube_id, title, env) {
  if (!tmdb_id || !youtube_id) return;

  const work = await env.DB.prepare(
    "SELECT media_type FROM works WHERE tmdb_id = ?"
  ).bind(tmdb_id).first();

  if (!work) {
    console.log(`[CONTENTS_LINK] tmdb_id=${tmdb_id} works에 없음 — title_videos 복사 스킵`);
    return;
  }

  if (!tmdb_type || work.media_type !== tmdb_type) {
    console.log(`[CONTENTS_LINK] tmdb_id=${tmdb_id} 타입 불일치(works=${work.media_type}, ott_contents=${tmdb_type}) — title_videos 복사 스킵`);
    return;
  }

  await env.DB.prepare(`
    INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
    VALUES (?, ?, ?, ?, 0)
  `).bind(
    tmdb_id,
    `https://www.youtube.com/watch?v=${youtube_id}`,
    youtube_id,
    title || "",
  ).run();

  console.log(`[CONTENTS_LINK] ✅ tmdb_id=${tmdb_id} youtube_id=${youtube_id} title_videos 복사 완료`);
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
  // ⚠️ 2026-06-20 수정: SELECT에 is_pinned, sort_order 추가.
  // 기존엔 WHERE/ORDER BY에서만 쓰고 SELECT 목록엔 빠져있어서,
  // 프론트(index.html)가 item.is_pinned로 분기하는 정렬 로직에서
  // 모든 항목이 undefined(=비고정) 취급되어 어드민에서 설정한
  // sort_order가 메인페이지에 전혀 반영되지 않던 원인이었음.
  const { results } = await env.DB.prepare(
    `SELECT id, youtube_id, platform, type, title, work_title,
            tmdb_id, tmdb_type, thumbnail, published_at, view_count,
            is_pinned, sort_order
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
            u.id AS user_id,
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
  // ── 유저 세션 인증 ──────────────────────────────────────────────────
  // 인증 방식 1순위: Authorization: Bearer {sid}  (모바일/앱 환경)
  // 인증 방식 2순위: Cookie: session={sid}         (웹 브라우저 환경)
  // _checkAuth 는 ADMIN_SECRET 전용이므로 여기서 사용 불가
  const authHeader = request.headers.get("Authorization") || "";
  const bearerSid  = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const cookieSid  = _getSessionCookie(request);
  const sid        = bearerSid || cookieSid;

  if (!sid) {
    return json({ ok: false, error: "로그인이 필요합니다." }, 401, headers);
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
// Public: 댓글 삭제 (본인만 가능)
// DELETE /contents/comments/:id
// ─────────────────────────────────────────────
async function deleteComment(commentId, request, env, headers) {
  // 세션 인증 (postComment 와 동일한 패턴)
  const authHeader = request.headers.get("Authorization") || "";
  const bearerSid  = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cookieSid  = _getSessionCookie(request);
  const sid        = bearerSid || cookieSid;

  if (!sid) {
    return json({ ok: false, error: "로그인이 필요합니다." }, 401, headers);
  }

  const user = await env.DB.prepare(
    `SELECT s.user_id AS id FROM sessions s WHERE s.id = ? LIMIT 1`
  ).bind(sid).first();

  if (!user) {
    return json({ ok: false, error: "로그인이 필요합니다." }, 401, headers);
  }

  // 댓글 존재 여부 + 본인 확인
  const comment = await env.DB.prepare(
    `SELECT id, user_id FROM ott_content_comments WHERE id = ?`
  ).bind(commentId).first();

  if (!comment) {
    return json({ ok: false, error: "댓글을 찾을 수 없습니다." }, 404, headers);
  }
  if (comment.user_id !== user.id) {
    return json({ ok: false, error: "본인 댓글만 삭제할 수 있습니다." }, 403, headers);
  }

  await env.DB.prepare(
    `DELETE FROM ott_content_comments WHERE id = ?`
  ).bind(commentId).run();

  return json({ ok: true }, 200, headers);
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
  const q        = (url.searchParams.get("q") || "").trim();
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
  if (q) {
    // 2026-07-08 추가: 작품명 검색 — 띄어쓰기 무시 매칭(works/search와 동일 원칙)
    // work_title(매칭된 작품명)과 title(원본 영상 제목) 둘 다 대상
    const qNoSpace = q.replace(/\s+/g, "");
    conditions.push("(REPLACE(work_title, ' ', '') LIKE ? OR REPLACE(title, ' ', '') LIKE ?)");
    bindings.push(`%${qNoSpace}%`, `%${qNoSpace}%`);
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
    //
    // ⚠️ 2026-06-20 수정: 컬럼명 category → media_type
    // works 테이블에는 'category' 컬럼이 존재하지 않음(실제 컬럼은 media_type).
    // 이 오타 때문에 tmdb_id + work_title이 함께 오는 모든 등록 요청이
    // "no such column: category" 에러로 throw되어 ott_contents에는 이미
    // INSERT된 뒤에도 전체 요청이 500으로 응답 — 크롤러가 매번 실패로
    // 인식하는 원인이었음.
    //
    // ⚠️ 2026-07-10 수정: media_type 'tv' 하드코딩 제거
    // 기존엔 이 자동등록이 영화/TV 구분 없이 무조건 'tv'로 저장하고
    // 있었음(media_type 개념이 정착되기 전 코드로 추정). 이제는 실제
    // tmdb_type을 그대로 쓰고, 없으면 추측하지 않고 NULL로 남긴다
    // (release_year=0, original_language='unknown'과 같은 센티널 원칙).
    //
    // 또한 이 works 자동등록은 부가 기능(있으면 좋은 것)이지 핵심 기능이
    // 아니므로, 여기서 또 다른 예기치 못한 에러가 나더라도 ott_contents
    // 등록 자체(핵심 기능)는 절대 막히지 않도록 try/catch로 격리한다.
    if (tmdb_id && work_title) {
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO works (tmdb_id, media_type, title_ko, match_source)
           VALUES (?, ?, ?, 'crawler')`
        ).bind(tmdb_id, tmdb_type || null, work_title).run();
      } catch (worksErr) {
        // works 자동등록 실패는 로그만 남기고 무시 — ott_contents 등록은 이미 성공했음
        console.error("[contents] works 자동등록 실패(무시):", worksErr.message);
      }
    }

    // [2026-07-10 신설] tmdb_id가 매칭된 상태로 등록됐으면, 같은 영상을
    // title_videos(작품페이지 관련영상)에도 자동 복사. 타입 불일치 등으로
    // 실패해도 ott_contents 등록 자체(핵심 기능)는 이미 끝난 뒤이므로
    // try/catch로 격리해서 응답에 영향 없게 한다.
    if (tmdb_id) {
      try {
        await _linkToTitleVideos(tmdb_id, tmdb_type || null, youtube_id, title, env);
      } catch (linkErr) {
        console.error("[contents] title_videos 복사 실패(무시):", linkErr.message);
      }
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
  // [2026-07-10 변경] tmdb_id 복사 로직에 필요한 youtube_id, title,
  // tmdb_type(요청에 tmdb_id만 오고 tmdb_type은 안 온 경우 대비)도 함께 조회
  const existing = await env.DB.prepare(
    `SELECT id, youtube_id, title, tmdb_type FROM ott_contents WHERE id = ?`
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

  // [2026-07-10 신설] "작품연결" — 이번 요청에 tmdb_id가 포함됐으면(=연결
  // 또는 재연결) 같은 영상을 title_videos(작품페이지 관련영상)에도 자동
  // 복사. tmdb_type은 이번 요청에 같이 왔으면 그 값을, 안 왔으면 기존에
  // 저장돼 있던 값을 사용한다. 실패해도 ott_contents 수정 자체(핵심
  // 기능)는 이미 끝난 뒤이므로 try/catch로 격리해서 응답에 영향 없게 한다.
  if (body.tmdb_id !== undefined) {
    try {
      const effectiveTmdbType = body.tmdb_type !== undefined ? body.tmdb_type : existing.tmdb_type;
      await _linkToTitleVideos(body.tmdb_id, effectiveTmdbType, existing.youtube_id, existing.title, env);
    } catch (linkErr) {
      console.error("[contents] title_videos 복사 실패(무시):", linkErr.message);
    }
  }

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
