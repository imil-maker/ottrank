/* ══════════════════════════════════════════════════════════════
   인증 관련 API 라우트
   GET    /auth/google
   GET    /auth/google/callback
   GET    /auth/naver
   GET    /auth/naver/callback
   GET    /auth/kakao
   GET    /auth/kakao/callback
   GET    /auth/me
   GET    /auth/random-nickname   ← 신규: 랜덤 닉네임 생성
   POST   /auth/nickname          ← 변경: mbti 파라미터 추가
   PUT    /auth/nickname
   DELETE /auth/withdraw
   POST   /auth/logout
══════════════════════════════════════════════════════════════ */

import { _getSessionCookie, _addOttPoints } from "../utils/authUtils.js";

// ── 랜덤 닉네임 생성용 형용사 목록 ────────────────────────────
const ADJECTIVES = [
  "귀여운", "용감한", "신비로운", "엉뚱한", "조용한",
  "활발한", "느긋한", "열정적인", "낭만적인", "진지한",
  "유쾌한", "당당한", "수줍은", "독특한", "빠른",
  "따뜻한", "차가운", "배고픈", "졸린", "멋진",
  "황당한", "진지한", "느린", "영리한", "강한",
];

export async function handleAuth(path, request, env, headers) {
  const url = new URL(request.url);

  // ── GET /auth/google ──────────────────────────────────────
  if (path === "/auth/google" && request.method === "GET") {
    const redirect = url.searchParams.get("redirect") || "";
    const googleAuthUrl =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      "?client_id=" + env.GOOGLE_CLIENT_ID +
      "&redirect_uri=" + encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/google/callback") +
      "&response_type=code" +
      "&scope=" + encodeURIComponent("openid email profile") +
      "&access_type=offline" +
      (redirect ? "&state=" + encodeURIComponent(redirect) : "");
    return Response.redirect(googleAuthUrl, 302);
  }

  // ── GET /auth/google/callback ─────────────────────────────
  if (path === "/auth/google/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect("https://ottrank.kr?login=fail", 302);
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "authorization_code",
          client_id:     env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri:  "https://ottrank-api.tdidream.workers.dev/auth/google/callback",
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return Response.redirect("https://ottrank.kr?login=fail", 302);

      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: "Bearer " + tokenData.access_token },
      });
      const userData   = await userRes.json();
      const providerId = String(userData.id);
      const email      = userData.email || "";
      const avatar_url = userData.picture || "";

      const existingGoogle = await env.DB.prepare(
        "SELECT id, nickname FROM users WHERE provider = 'google' AND provider_id = ?"
      ).bind(providerId).first();

      await env.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('google', ?, null, ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(providerId, email, avatar_url).run();

      const userRow = await env.DB.prepare(
        "SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'google' AND provider_id = ?"
      ).bind(providerId).first();

      const isNew = !existingGoogle || !existingGoogle.nickname || existingGoogle.nickname.trim() === "";

      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
      ).bind(sessionId, userRow.id, expiresAt).run();

      const googleState = url.searchParams.get("state") || "";
      const googleAfter = googleState ? decodeURIComponent(googleState) : "";

      // 기존 로그인 시 1일 1회 +3 오뜨 — users.last_login_bonus_date 기준으로 판단 (/auth/me와 동일 기준)
      if (!isNew) {
        const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (userRow.last_login_bonus_date !== todayKST) {
          await _addOttPoints(userRow.id, 3, 'login', env);
          await env.DB.prepare(
            "UPDATE users SET last_login_bonus_date = ? WHERE id = ?"
          ).bind(todayKST, userRow.id).run();
        }
      }

      const redirectTo = isNew
        ? `https://ottrank.kr/signup.html?sid=${sessionId}` + (googleAfter ? `&redirect=${encodeURIComponent(googleAfter)}` : "")
        : `https://ottrank.kr/mypage.html?sid=${sessionId}`;

      return new Response(null, {
        status: 302,
        headers: {
          Location:     redirectTo,
          "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
        },
      });
    } catch (e) {
      console.error("[AUTH] 구글 콜백 오류:", e.message);
      return Response.redirect("https://ottrank.kr?login=fail", 302);
    }
  }

  // ── GET /auth/naver ───────────────────────────────────────
  if (path === "/auth/naver" && request.method === "GET") {
    const redirect = url.searchParams.get("redirect") || "";
    const state    = redirect ? encodeURIComponent(redirect) : crypto.randomUUID();
    const naverAuthUrl =
      "https://nid.naver.com/oauth2.0/authorize" +
      "?client_id=" + env.NAVER_CLIENT_ID +
      "&redirect_uri=" + encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/naver/callback") +
      "&response_type=code" +
      "&state=" + state;
    return Response.redirect(naverAuthUrl, 302);
  }

  // ── GET /auth/naver/callback ──────────────────────────────
  if (path === "/auth/naver/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect("https://ottrank.kr?login=fail", 302);
    try {
      const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token", {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "authorization_code",
          client_id:     env.NAVER_CLIENT_ID,
          client_secret: env.NAVER_CLIENT_SECRET,
          redirect_uri:  "https://ottrank-api.tdidream.workers.dev/auth/naver/callback",
          code,
          state: url.searchParams.get("state") || "",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return Response.redirect("https://ottrank.kr?login=fail", 302);

      const userRes  = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: "Bearer " + tokenData.access_token },
      });
      const userJson   = await userRes.json();
      const userData   = userJson.response;
      const providerId = String(userData.id);
      const email      = userData.email || "";
      const avatar_url = userData.profile_image || "";
      // 소셜 닉네임은 저장하지 않음 — signup.html에서 직접 설정

      const existingNaver = await env.DB.prepare(
        "SELECT id, nickname FROM users WHERE provider = 'naver' AND provider_id = ?"
      ).bind(providerId).first();

      await env.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('naver', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(providerId, email, avatar_url).run();

      const userRow = await env.DB.prepare(
        "SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'naver' AND provider_id = ?"
      ).bind(providerId).first();

      const isNew = !existingNaver || !existingNaver.nickname || existingNaver.nickname.trim() === "";

      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
      ).bind(sessionId, userRow.id, expiresAt).run();

      const naverState = url.searchParams.get("state") || "";
      let naverAfter   = "";
      try { naverAfter = naverState ? decodeURIComponent(naverState) : ""; } catch (e) {}
      if (!naverAfter.startsWith("/")) naverAfter = "";

      // 기존 로그인 시 1일 1회 +3 오뜨 — users.last_login_bonus_date 기준으로 판단 (/auth/me와 동일 기준)
      if (!isNew) {
        const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (userRow.last_login_bonus_date !== todayKST) {
          await _addOttPoints(userRow.id, 3, 'login', env);
          await env.DB.prepare(
            "UPDATE users SET last_login_bonus_date = ? WHERE id = ?"
          ).bind(todayKST, userRow.id).run();
        }
      }

      const redirectTo = isNew
        ? `https://ottrank.kr/signup.html?sid=${sessionId}` + (naverAfter ? `&redirect=${encodeURIComponent(naverAfter)}` : "")
        : `https://ottrank.kr/mypage.html?sid=${sessionId}`;

      return new Response(null, {
        status: 302,
        headers: {
          Location:     redirectTo,
          "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
        },
      });
    } catch (e) {
      console.error("[AUTH] 네이버 콜백 오류:", e.message);
      return Response.redirect("https://ottrank.kr?login=fail", 302);
    }
  }

  // ── GET /auth/kakao ───────────────────────────────────────
  if (path === "/auth/kakao" && request.method === "GET") {
    const redirect = url.searchParams.get("redirect") || "";
    const state    = redirect ? encodeURIComponent(redirect) : "";
    const kakaoAuthUrl =
      "https://kauth.kakao.com/oauth/authorize" +
      "?client_id=" + env.KAKAO_CLIENT_ID +
      "&redirect_uri=" + encodeURIComponent("https://ottrank-api.tdidream.workers.dev/auth/kakao/callback") +
      "&response_type=code" +
      (state ? "&state=" + state : "");
    return Response.redirect(kakaoAuthUrl, 302);
  }

  // ── GET /auth/kakao/callback ──────────────────────────────
  if (path === "/auth/kakao/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect("https://ottrank.kr?login=fail", 302);
    try {
      const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "authorization_code",
          client_id:     env.KAKAO_CLIENT_ID,
          client_secret: env.KAKAO_CLIENT_SECRET,
          redirect_uri:  "https://ottrank-api.tdidream.workers.dev/auth/kakao/callback",
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return Response.redirect("https://ottrank.kr?login=fail", 302);

      const userRes  = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: "Bearer " + tokenData.access_token },
      });
      const userData   = await userRes.json();
      const providerId = String(userData.id);
      const avatar_url = userData.kakao_account?.profile?.profile_image_url || "";
      const email      = userData.kakao_account?.email || "";
      // 소셜 닉네임은 저장하지 않음 — signup.html에서 직접 설정

      const existingKakao = await env.DB.prepare(
        "SELECT id, nickname FROM users WHERE provider = 'kakao' AND provider_id = ?"
      ).bind(providerId).first();

      await env.DB.prepare(`
        INSERT INTO users (provider, provider_id, nickname, email, avatar_url, last_login)
        VALUES ('kakao', ?, '', ?, ?, datetime('now'))
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email      = excluded.email,
          avatar_url = excluded.avatar_url,
          last_login = datetime('now')
      `).bind(providerId, email, avatar_url).run();

      const userRow = await env.DB.prepare(
        "SELECT id, nickname, last_login_bonus_date FROM users WHERE provider = 'kakao' AND provider_id = ?"
      ).bind(providerId).first();

      const isNew = !existingKakao || !existingKakao.nickname || existingKakao.nickname.trim() === "";

      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
      ).bind(sessionId, userRow.id, expiresAt).run();

      const stateParam = url.searchParams.get("state") || "";
      const afterLogin = stateParam ? decodeURIComponent(stateParam) : "";

      // 기존 로그인 시 1일 1회 +3 오뜨 — users.last_login_bonus_date 기준으로 판단 (/auth/me와 동일 기준)
      if (!isNew) {
        const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (userRow.last_login_bonus_date !== todayKST) {
          await _addOttPoints(userRow.id, 3, 'login', env);
          await env.DB.prepare(
            "UPDATE users SET last_login_bonus_date = ? WHERE id = ?"
          ).bind(todayKST, userRow.id).run();
        }
      }

      const redirectTo = isNew
        ? `https://ottrank.kr/signup.html?sid=${sessionId}` + (afterLogin ? `&redirect=${encodeURIComponent(afterLogin)}` : "")
        : `https://ottrank.kr/mypage.html?sid=${sessionId}`;

      return new Response(null, {
        status: 302,
        headers: {
          Location:     redirectTo,
          "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
        },
      });
    } catch (e) {
      console.error("[AUTH] 카카오 콜백 오류:", e.message);
      return Response.redirect("https://ottrank.kr?login=fail", 302);
    }
  }

  // ── GET /auth/me ──────────────────────────────────────────
  if (path === "/auth/me" && request.method === "GET") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sidHeader = auth.replace("Bearer ", "").trim();
      const sessionId = sidHeader || _getSessionCookie(request);
      if (!sessionId) return new Response(JSON.stringify({ ok: false }), { headers });

      const session = await env.DB.prepare(
        "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) return new Response(JSON.stringify({ ok: false }), { headers });

      // mbti, ott_points 컬럼 포함하여 조회
      const user = await env.DB.prepare(
        "SELECT id, nickname, email, avatar_url, provider, grade, total_likes_received, mbti, ott_points, created_at, last_login_bonus_date FROM users WHERE id = ?"
      ).bind(session.user_id).first();
      if (!user) return new Response(JSON.stringify({ ok: false }), { headers });

      // 로그인 세션을 계속 유지 중이어도 자정(KST)이 지나 날짜가 바뀌었으면
      // 페이지 이동 시(=이 /auth/me 호출 시) 1일 1회 로그인 오뜨(+3)를 적립
      // — 이미 오늘 적립됐으면(대부분의 호출) 컬럼 비교만 하고 그대로 통과, 추가 쿼리 없음
      const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (user.last_login_bonus_date !== todayKST) {
        await _addOttPoints(user.id, 3, 'login', env);
        await env.DB.prepare(
          "UPDATE users SET last_login_bonus_date = ? WHERE id = ?"
        ).bind(todayKST, user.id).run();
        // 응답에도 최신 값 반영 (재조회 없이 즉시 갱신)
        user.ott_points = (user.ott_points || 0) + 3;
        user.last_login_bonus_date = todayKST;
      }

      const gradeInfo = await env.DB.prepare(
        "SELECT grade_name, grade_key, emoji_url, sort_order FROM grade_settings WHERE grade_key = ?"
      ).bind(user.grade || "rookie").first();

      return new Response(JSON.stringify({ ok: true, user: { ...user, gradeInfo: gradeInfo || null } }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false }), { headers });
    }
  }

  // ── GET /auth/random-nickname ─────────────────────────────
  // works 테이블에서 랜덤 작품명 + 형용사 + 숫자 4자리 조합
  if (path === "/auth/random-nickname" && request.method === "GET") {
    try {
      // works 테이블에서 한글 제목만 랜덤으로 1개 조회
      // title_ko가 한글을 포함하고, 10자 이하인 것만 (닉네임 길이 제한 고려)
      const work = await env.DB.prepare(`
        SELECT title_ko FROM works
        WHERE title_ko IS NOT NULL
          AND title_ko != ''
          AND length(title_ko) <= 10
        ORDER BY RANDOM()
        LIMIT 1
      `).first();

      // DB 조회 실패 시 기본 단어 사용
      const workTitle = work?.title_ko || "드라마팬";

      // 형용사 랜덤 선택
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];

      // 숫자 4자리 랜덤 생성 (1000~9999)
      const num = Math.floor(Math.random() * 9000) + 1000;

      // 최종 닉네임: "귀여운파친코1234" (공백 없이, 20자 이하 보장)
      let nickname = `${adj}${workTitle}${num}`;

      // 20자 초과 시 작품명을 6자로 자름
      if (nickname.length > 20) {
        nickname = `${adj}${workTitle.slice(0, 6)}${num}`;
      }

      return new Response(JSON.stringify({ ok: true, nickname }), { headers });
    } catch (e) {
      // 오류 시 기본 닉네임 반환
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const num = Math.floor(Math.random() * 9000) + 1000;
      return new Response(JSON.stringify({ ok: true, nickname: `${adj}시네마${num}` }), { headers });
    }
  }

  // ── POST /auth/nickname ───────────────────────────────────
  if (path === "/auth/nickname" && request.method === "POST") {
    try {
      const body = await request.json();
      // mbti 파라미터 추가 (선택사항 — null 허용)
      const { nickname, sid, mbti } = body;

      const sessionId = sid || _getSessionCookie(request);
      if (!sessionId) {
        return new Response(JSON.stringify({ ok: false, message: "로그인이 필요해요" }), { status: 401, headers });
      }

      const session = await env.DB.prepare(
        "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) {
        return new Response(JSON.stringify({ ok: false, message: "세션이 만료됐어요" }), { status: 401, headers });
      }

      if (!nickname || nickname.trim().length < 2) {
        return new Response(JSON.stringify({ ok: false, message: "닉네임은 2자 이상 입력해주세요" }), { status: 400, headers });
      }
      if (nickname.trim().length > 20) {
        return new Response(JSON.stringify({ ok: false, message: "닉네임은 20자 이내로 입력해주세요" }), { status: 400, headers });
      }
      if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname.trim())) {
        return new Response(JSON.stringify({ ok: false, message: "한글, 영문, 숫자만 사용할 수 있어요" }), { status: 400, headers });
      }

      const dup = await env.DB.prepare(
        "SELECT id FROM users WHERE nickname = ? AND id != ?"
      ).bind(nickname.trim(), session.user_id).first();
      if (dup) {
        return new Response(JSON.stringify({ ok: false, message: "이미 사용 중인 닉네임이에요" }), { status: 400, headers });
      }

      // MBTI 유효성 검사 (선택사항이므로 null/undefined는 통과)
      const VALID_MBTI = [
        "INTJ","INTP","ENTJ","ENTP",
        "INFJ","INFP","ENFJ","ENFP",
        "ISTJ","ISFJ","ESTJ","ESFJ",
        "ISTP","ISFP","ESTP","ESFP",
      ];
      const finalMbti = mbti && VALID_MBTI.includes(mbti) ? mbti : null;

      // 닉네임 + mbti 함께 저장
      await env.DB.prepare(
        "UPDATE users SET nickname = ?, mbti = ? WHERE id = ?"
      ).bind(nickname.trim(), finalMbti, session.user_id).run();

      // 회원가입 완료 +30 오뜨 (최초 1회)
      const alreadySignup = await env.DB.prepare(
        "SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'signup' LIMIT 1"
      ).bind(session.user_id).first();
      if (!alreadySignup) {
        await _addOttPoints(session.user_id, 30, 'signup', env);
      }

      // MBTI 선택 시 +20 오뜨 (최초 1회)
      if (finalMbti) {
        const alreadyMbti = await env.DB.prepare(
          "SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1"
        ).bind(session.user_id).first();
        if (!alreadyMbti) {
          await _addOttPoints(session.user_id, 20, 'mbti_register', env);
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PUT /auth/nickname ────────────────────────────────────
  if (path === "/auth/nickname" && request.method === "PUT") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) {
        return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      }

      const session = await env.DB.prepare(
        "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) {
        return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });
      }

      const body         = await request.json();
      const { nickname } = body;

      if (!nickname || nickname.trim().length < 2) {
        return new Response(JSON.stringify({ ok: false, message: "닉네임은 2자 이상 입력해주세요" }), { status: 400, headers });
      }
      if (nickname.trim().length > 20) {
        return new Response(JSON.stringify({ ok: false, message: "닉네임은 20자 이내로 입력해주세요" }), { status: 400, headers });
      }
      if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname.trim())) {
        return new Response(JSON.stringify({ ok: false, message: "한글, 영문, 숫자만 사용할 수 있어요" }), { status: 400, headers });
      }

      const dup = await env.DB.prepare(
        "SELECT id FROM users WHERE nickname = ? AND id != ?"
      ).bind(nickname.trim(), session.user_id).first();
      if (dup) {
        return new Response(JSON.stringify({ ok: false, message: "이미 사용 중인 닉네임이에요" }), { status: 400, headers });
      }

      await env.DB.prepare(
        "UPDATE users SET nickname = ? WHERE id = ?"
      ).bind(nickname.trim(), session.user_id).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /auth/withdraw ─────────────────────────────────
  if (path === "/auth/withdraw" && request.method === "DELETE") {
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

      const uid = session.user_id;
      await env.DB.prepare("DELETE FROM sessions  WHERE user_id = ?").bind(uid).run();
      await env.DB.prepare("DELETE FROM wishlist  WHERE user_id = ?").bind(uid).run();
      await env.DB.prepare("DELETE FROM reviews   WHERE user_id = ?").bind(uid).run();
      await env.DB.prepare("DELETE FROM posts     WHERE user_id = ?").bind(uid).run();
      await env.DB.prepare("DELETE FROM users     WHERE id = ?").bind(uid).run();

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, "Set-Cookie": "session=; Path=/; HttpOnly; Secure; Max-Age=0" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /auth/mbti ──────────────────────────────────────
  // 마이페이지에서 MBTI 수정 또는 해제 (null 전송 시 해제)
  if (path === "/auth/mbti" && request.method === "PATCH") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sessionId = auth.replace("Bearer ", "").trim() || _getSessionCookie(request);
      if (!sessionId) {
        return new Response(JSON.stringify({ ok: false, message: "로그인 필요" }), { status: 401, headers });
      }

      const session = await env.DB.prepare(
        "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
      ).bind(sessionId).first();
      if (!session) {
        return new Response(JSON.stringify({ ok: false, message: "세션 만료" }), { status: 401, headers });
      }

      const body = await request.json();
      const { mbti } = body;

      // MBTI 유효성 검사 (null/undefined 허용 → 해제)
      const VALID_MBTI = [
        "INTJ","INTP","ENTJ","ENTP",
        "INFJ","INFP","ENFJ","ENFP",
        "ISTJ","ISFJ","ESTJ","ESFJ",
        "ISTP","ISFP","ESTP","ESFP",
      ];
      const finalMbti = mbti && VALID_MBTI.includes(mbti) ? mbti : null;

      // 변경 전 현재 MBTI 조회
      const currentUser = await env.DB.prepare(
        "SELECT mbti FROM users WHERE id = ?"
      ).bind(session.user_id).first();

      await env.DB.prepare(
        "UPDATE users SET mbti = ? WHERE id = ?"
      ).bind(finalMbti, session.user_id).run();

      // 오뜨 처리
      const hadMbti = !!currentUser?.mbti;
      const hasMbti = !!finalMbti;
      if (!hadMbti && hasMbti) {
        // 최초 등록 +20 오뜨 (1회)
        const alreadyGiven = await env.DB.prepare(
          "SELECT id FROM user_point_logs WHERE user_id = ? AND reason = 'mbti_register' LIMIT 1"
        ).bind(session.user_id).first();
        if (!alreadyGiven) await _addOttPoints(session.user_id, 20, 'mbti_register', env);
      } else if (hadMbti && !hasMbti) {
        // 해제 시 -20 오뜨
        await _addOttPoints(session.user_id, -20, 'mbti_unregister', env);
      }

      return new Response(JSON.stringify({ ok: true, mbti: finalMbti }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /auth/logout ─────────────────────────────────────
  if (path === "/auth/logout" && request.method === "POST") {
    try {
      const auth      = request.headers.get("Authorization") || "";
      const sidHeader = auth.replace("Bearer ", "").trim();
      const sessionId = sidHeader || _getSessionCookie(request);
      if (sessionId) {
        await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, "Set-Cookie": "session=; Path=/; HttpOnly; Secure; Max-Age=0" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
