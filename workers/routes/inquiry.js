/* ══════════════════════════════════════════════════════════════
   문의/신고 게시판 API 라우트 (광고문의 + 오류신고 통합)
   POST   /inquiry              문의/신고 접수 — 공개, 로그인 불필요
   GET    /admin/inquiry        목록 조회 — 관리자, type/status 필터 + 페이지네이션
   PATCH  /admin/inquiry/:id    상태 변경 + 답변 저장 — 관리자
   DELETE /admin/inquiry/:id    삭제 — 관리자

   ⚠️ 인증 방식 주의: 이 프로젝트의 videos.js 등 다른 admin 엔드포인트들은
   utils/authUtils.js의 _checkAuth()를 import만 해두고 실제로는 안 쓰고,
   `Authorization: Bearer {ADMIN_SECRET}` 헤더를 인라인으로 직접 비교하는 패턴을
   실제로 사용 중이라 — 이 파일도 동일한 인라인 패턴으로 통일했다.
   유저 세션(로그인) 확인은 게시판 개발 가이드(2026-06-06)의 _getSessionCookie()
   표준 패턴을 그대로 재사용한다.
══════════════════════════════════════════════════════════════ */

import { _getSessionCookie } from "../utils/authUtils.js";

const VALID_TYPES   = ["ad", "bug"];
const VALID_STATUS  = ["pending", "answered", "resolved"];
const COOLDOWN_SECONDS = 60; // 동일 IP 연속 제출 방지 쿨다운(초) — 상수이며 사용자 입력 아님(SQL 인젝션 무관)

export async function handleInquiry(path, request, env, ctx, url, headers) {

  // ── POST /inquiry ────────────────────────────────────────────
  // 공개 API — 로그인 여부와 무관하게 누구나 제출 가능 (광고문의/오류신고 공통)
  if (path === "/inquiry" && request.method === "POST") {
    try {
      const body = await request.json();
      const {
        type, name, email, phone, title, content, page_url,
        website, // ⚠️ 허니팟 필드 — 화면엔 안 보이는 숨김 input. 값이 채워져 있으면 봇으로 간주
      } = body;

      // ── 허니팟 체크 ──────────────────────────────────────────
      // 봇에게 "여기서 막혔다"는 신호를 주지 않기 위해, 실패를 알리지 않고
      // 성공한 것처럼 응답만 하고 실제 저장(INSERT)은 조용히 스킵한다.
      if (website) {
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ── 필수값 검증 ──────────────────────────────────────────
      if (!VALID_TYPES.includes(type)) {
        return new Response(JSON.stringify({ ok: false, message: "type은 ad 또는 bug여야 합니다" }), { status: 400, headers });
      }
      if (!title || !title.trim() || !content || !content.trim()) {
        return new Response(JSON.stringify({ ok: false, message: "제목과 내용은 필수입니다" }), { status: 400, headers });
      }
      // 광고문의: 담당자명/업체명 + 이메일 필수
      if (type === "ad") {
        if (!name || !name.trim()) {
          return new Response(JSON.stringify({ ok: false, message: "담당자명 또는 업체명을 입력해주세요" }), { status: 400, headers });
        }
        if (!email || !email.trim()) {
          return new Response(JSON.stringify({ ok: false, message: "이메일을 입력해주세요" }), { status: 400, headers });
        }
      }
      // 이메일 형식 검증 — 입력된 경우에만 (오류신고는 선택값이라 비어있을 수 있음)
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ ok: false, message: "이메일 형식이 올바르지 않습니다" }), { status: 400, headers });
      }

      // ── 길이 제한 (DB 보호 + 스팸/어뷰징 방어) ─────────────────
      const safeType    = type;
      const safeTitle   = String(title).slice(0, 200);
      const safeContent = String(content).slice(0, 5000);
      const safeName    = name     ? String(name).slice(0, 100)   : null;
      const safeEmail   = email    ? String(email).slice(0, 200)  : null;
      const safePhone   = phone    ? String(phone).slice(0, 30)   : null;
      const safePageUrl = page_url ? String(page_url).slice(0, 500) : null;

      // ── 부가 정보 자동 수집 (사용자 입력 아님) ──────────────────
      const userAgent = request.headers.get("User-Agent") || null;
      // Cloudflare가 자동으로 붙여주는 실제 접속 IP — 클라이언트가 위조 불가
      const ipAddress = request.headers.get("CF-Connecting-IP") || null;

      // ── 로그인 상태면 user_id도 같이 기록 (비로그인이어도 제출 자체는 항상 허용) ──
      let userId = null;
      try {
        const authHeader = request.headers.get("Authorization") || "";
        const bearerSid  = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
        const sid        = bearerSid || _getSessionCookie(request);
        if (sid) {
          const user = await env.DB.prepare(
            "SELECT user_id AS id FROM sessions WHERE id = ? LIMIT 1"
          ).bind(sid).first();
          if (user) userId = user.id;
        }
      } catch (e) {
        // 세션 조회 실패해도 비로그인 제출로 계속 진행 — 로그인 확인은 부가 기능일 뿐, 핵심 흐름을 막으면 안 됨
      }

      // ── 동일 IP 연속 제출 쿨다운 체크 (스팸 방지) ───────────────
      // COOLDOWN_SECONDS는 코드 상수(고정값)이며 사용자 입력이 아니므로 문자열 삽입해도 인젝션 위험 없음
      if (ipAddress) {
        const recent = await env.DB.prepare(
          `SELECT id FROM inquiries
           WHERE ip_address = ? AND created_at > datetime('now', '-${COOLDOWN_SECONDS} seconds')
           LIMIT 1`
        ).bind(ipAddress).first();
        if (recent) {
          return new Response(JSON.stringify({
            ok: false,
            message: `너무 빠른 연속 제출이에요. ${COOLDOWN_SECONDS}초 후 다시 시도해주세요.`,
          }), { status: 429, headers });
        }
      }

      // ── 저장 ───────────────────────────────────────────────
      // ⚠️ D1 INSERT ... RETURNING id는 간헐적으로 null을 반환하는 알려진 이슈가 있어
      // (프로젝트 내 다른 세션에서도 확인된 패턴) id를 응답에 굳이 실을 필요가 없는
      // 이 케이스에서는 아예 RETURNING을 쓰지 않고 성공 여부만 반환한다.
      await env.DB.prepare(`
        INSERT INTO inquiries (
          type, name, email, phone, title, content, page_url,
          user_agent, ip_address, user_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).bind(
        safeType, safeName, safeEmail, safePhone, safeTitle, safeContent, safePageUrl,
        userAgent, ipAddress, userId
      ).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/inquiry/:id ───────────────────────────────
  const delMatch = path.match(/^\/admin\/inquiry\/(\d+)$/);
  if (request.method === "DELETE" && delMatch) {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      await env.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(delMatch[1]).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/inquiry/:id ─────────────────────────────────
  // 상태 변경(pending/answered/resolved)과 관리자 메모(admin_reply) 저장을 겸함
  // 둘 다 선택적 — 하나만 보내도 나머지는 COALESCE로 기존값 유지
  const patchMatch = path.match(/^\/admin\/inquiry\/(\d+)$/);
  if (request.method === "PATCH" && patchMatch) {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { status, admin_reply } = body;

      if (status && !VALID_STATUS.includes(status)) {
        return new Response(JSON.stringify({ ok: false, message: "status 값이 올바르지 않습니다" }), { status: 400, headers });
      }

      const existing = await env.DB.prepare("SELECT id FROM inquiries WHERE id = ?").bind(patchMatch[1]).first();
      if (!existing) {
        return new Response(JSON.stringify({ ok: false, message: "찾을 수 없습니다" }), { status: 404, headers });
      }

      await env.DB.prepare(`
        UPDATE inquiries
        SET status      = COALESCE(?, status),
            admin_reply = COALESCE(?, admin_reply),
            updated_at  = datetime('now')
        WHERE id = ?
      `).bind(status || null, (admin_reply != null ? admin_reply : null), patchMatch[1]).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/inquiry ───────────────────────────────────────
  // 관리자 전용 목록 조회 — type(all/ad/bug) · status(all/pending/answered/resolved) 필터 + 페이지네이션
  if (path === "/admin/inquiry" && request.method === "GET") {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const type   = url.searchParams.get("type")   || "all";
      const status = url.searchParams.get("status") || "all";
      const limit  = Math.min(parseInt(url.searchParams.get("limit")  || "50"), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

      const conditions = [];
      const binds = [];
      if (type   !== "all") { conditions.push("type = ?");   binds.push(type); }
      if (status !== "all") { conditions.push("status = ?"); binds.push(status); }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      // 목록 + 전체 개수(페이지네이션용)를 env.DB.batch()로 한 번에 — D1 네트워크 왕복 1회로 최적화
      const [listRes, cntRes] = await env.DB.batch([
        env.DB.prepare(`SELECT * FROM inquiries ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset),
        env.DB.prepare(`SELECT COUNT(*) as cnt FROM inquiries ${whereClause}`).bind(...binds),
      ]);

      const results = listRes.results || [];
      const total   = cntRes.results?.[0]?.cnt || 0;

      return new Response(JSON.stringify({ ok: true, data: results, total }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}