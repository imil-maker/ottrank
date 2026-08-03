/* 2026-08-04 rev.5 — work_cast.js (앞부분 번역이 한글 3글자 이상 나오면, 뒤에 막히는 토큰이
   있어도 거기서 끊고 성공 처리하도록 변경 — "Kim Hyun Seok [2018 - serial killer]"처럼
   이름 뒤에 부가설명이 붙는 경우, 이름만 번역되면 충분하다고 판단) */
/* 2026-08-04 rev.4 — work_cast.js ("[Panelist]"처럼 대괄호가 단어에 붙어 매칭 실패하던 문제
   수정 — 쪼개기 전에 대괄호 제거 */
/* 2026-08-04 rev.3 — work_cast.js ("Bak's"처럼 어퍼스트로피로 붙은 's가 통째로 한 토큰이 되어
   매칭 실패하던 문제 수정 — 쪼개기 전에 "'s" 앞에 공백을 넣어 별도 토큰으로 분리 */
/* 2026-08-04 rev.2 — work_cast.js (cast_name_overrides 예외표 신규 연동 — 음절 쪼개기 전에
   통째 이름 예외 먼저 확인. POST /admin/cast/override-save 신규(예외 등록/수정)) */
/* 2026-08-04 rev.1 — work_cast.js (신규 — 배역명(character_name) 한글화 전용 어드민 API.
   ① POST /admin/cast/translate-batch: 미번역 한국작품 배역을 romanization_map으로 자동매칭,
      성공/실패 리스트 반환 ② POST /admin/cast/save: 관리자 수동 입력 저장(source=manual)
      ③ GET /admin/cast/search: 영어 배역명 검색(작품명·배우명·현재 번역상태 같이 반환) */
import { _checkAuth } from "../utils/authUtils.js";

// [신규] 배역명 문자열 하나를 번역 — ① 통째 예외표(cast_name_overrides) 먼저 확인,
// 있으면 그대로 사용(음절 매칭 안 함). 없으면 기존처럼 공백/하이픈 쪼개서 romanization_map 조회
async function _translateName(rawName, env) {
  const override = await env.DB.prepare(
    `SELECT hangul FROM cast_name_overrides WHERE original = ?`
  ).bind(rawName).first();
  if (override) {
    return { ok: true, hangul: override.hangul };
  }

  // [2026-08-04 신규] "Bak's"처럼 어퍼스트로피로 붙은 's는 별도 토큰으로 떼어냄
  // (그래야 romanization_map에 등록해둔 "'s"→"의" 항목이 매칭됨)
  // [2026-08-04 신규] "[Panelist]"처럼 대괄호가 단어에 붙어있으면 매칭 실패하므로 제거
  const bracketsRemoved = rawName.replace(/[\[\]]/g, "");
  const normalized = bracketsRemoved.replace(/'s\b/gi, " 's");
  const tokens = normalized.split(/[\s\-]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, tokens: [] };

  const results = await Promise.all(
    tokens.map((t) =>
      env.DB.prepare(`SELECT hangul FROM romanization_map WHERE roman = ?`)
        .bind(t.toLowerCase())
        .first()
    )
  );

  // [2026-08-04 신규] 앞에서부터 순서대로 이어붙이다가 막히는 토큰이 나오면 거기서 멈춤.
  // 거기까지 이어붙인 한글이 이미 3글자 이상이면(=사람 이름 정도는 나온 걸로 판단) 그걸로
  // 성공 처리하고 나머지(예: "[2018 - serial killer]" 같은 부가설명)는 그냥 버림.
  let hangul = "";
  let stopIndex = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    if (!results[i]) { stopIndex = i; break; }
    hangul += results[i].hangul;
  }
  const fullMatch = stopIndex === tokens.length;
  if (fullMatch || hangul.length >= 3) {
    return { ok: true, hangul };
  }

  const failedTokens = tokens.filter((t, i) => !results[i]);
  if (failedTokens.length > 0) {
    return { ok: false, tokens: failedTokens };
  }
  return { ok: true, hangul };
}

export async function handleWorkCast(path, request, env, url, headers) {
  try {
    // ── POST /admin/cast/translate-batch ──────────────────────
    // body: { limit? }  기본 30, 최대 100
    // 대상: work_cast 중 character_name_ko가 아직 비어있고, 해당 작품이 한국작품인 것만
    if (path === "/admin/cast/translate-batch" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 100);

      const { results } = await env.DB.prepare(
        `SELECT wc.id, wc.character_name, wc.name AS actor_name, w.title_ko
         FROM work_cast wc
         JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
         WHERE w.original_language = 'ko'
           AND wc.character_name_ko IS NULL
           AND wc.character_name IS NOT NULL AND wc.character_name != ''
         LIMIT ?`
      ).bind(limit).all();

      const succeeded = [];
      const failed = [];

      for (const row of results || []) {
        const r = await _translateName(row.character_name, env);
        if (r.ok) {
          await env.DB.prepare(
            `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'auto' WHERE id = ?`
          ).bind(r.hangul, row.id).run();
          succeeded.push({
            id: row.id, work: row.title_ko, actor: row.actor_name,
            original: row.character_name, translated: r.hangul,
          });
        } else {
          failed.push({
            id: row.id, work: row.title_ko, actor: row.actor_name,
            original: row.character_name, missing_tokens: r.tokens,
          });
        }
      }

      // 이번 배치 대상이 됐던 전체 미번역 건수(진행률 참고용)
      const remainRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM work_cast wc
         JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
         WHERE w.original_language = 'ko' AND wc.character_name_ko IS NULL
           AND wc.character_name IS NOT NULL AND wc.character_name != ''`
      ).first();

      return new Response(JSON.stringify({
        ok: true, succeeded, failed, remaining: remainRow?.cnt || 0,
      }), { headers });
    }

    // ── POST /admin/cast/override-save ────────────────────────
    // body: { original, hangul } — "Sam Kim"→"샘킴" 같은 통째 예외 등록/수정
    if (path === "/admin/cast/override-save" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const original = (body.original || "").trim();
      const hangul = (body.hangul || "").trim();
      if (!original || !hangul) {
        return new Response(JSON.stringify({ ok: false, message: "original과 hangul이 필요해요" }), { status: 400, headers });
      }
      await env.DB.prepare(
        `INSERT INTO cast_name_overrides (original, hangul) VALUES (?, ?)
         ON CONFLICT(original) DO UPDATE SET hangul = excluded.hangul`
      ).bind(original, hangul).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── POST /admin/cast/save ─────────────────────────────────
    // body: { id, character_name_ko }  — 관리자 수동 입력/수정
    if (path === "/admin/cast/save" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const id = parseInt(body.id);
      const ko = (body.character_name_ko || "").trim();
      if (!id || !ko) {
        return new Response(JSON.stringify({ ok: false, message: "id와 character_name_ko가 필요해요" }), { status: 400, headers });
      }
      await env.DB.prepare(
        `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'manual' WHERE id = ?`
      ).bind(ko, id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── GET /admin/cast/search?q=... ──────────────────────────
    // 영어 배역명(character_name) 검색 — 앞부분 일치, 최대 50건
    if (path === "/admin/cast/search" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: true, data: [] }), { headers });
      }
      const { results } = await env.DB.prepare(
        `SELECT wc.id, wc.character_name, wc.character_name_ko, wc.character_name_ko_source,
                wc.name AS actor_name, w.title_ko
         FROM work_cast wc
         JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
         WHERE w.original_language = 'ko' AND wc.character_name LIKE ? ESCAPE '\\'
         ORDER BY wc.billing_order ASC
         LIMIT 50`
      ).bind(q + "%").all();

      return new Response(JSON.stringify({ ok: true, data: results || [] }), { headers });
    }

    return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
  } catch (e) {
    console.log("[work_cast] error:", e.message);
    return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
  }
}
