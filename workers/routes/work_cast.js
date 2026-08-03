/* 2026-08-04 rev.17 — work_cast.js (POST /admin/cast/override-save에 cast_id(선택) 추가 —
   성공/미매칭 리스트에서 "예외등록" 누르면 예외표 등록만 되고 그 배역 자체의 저장값은
   안 고쳐지던 문제 수정. cast_id 있으면 예외표 등록과 동시에 work_cast.character_name_ko도
   바로 갱신(source='manual')) */
/* 2026-08-04 rev.16 — work_cast.js ("Secretary Sun-hee"처럼 설명단어+사람이름이 섞인 경우,
   rev.15가 공백/하이픈 구분 없이 모든 토큰 사이에 무조건 띄어쓰기를 넣어서 "비서 선 희"처럼
   이름 음절까지 쪼개버리던 문제 수정 — 원문에서 공백으로 나뉜 자리만 띄어쓰고, 하이픈으로
   나뉜 자리(이름 음절)는 그대로 붙여쓰도록 구분자 종류를 기억해서 재현("비서 선희")) */
/* 2026-08-04 rev.15 — work_cast.js (일반 토큰번역(_translateTokenSequence) 결과가 4글자
   이상이면 영어 원문의 단어 구분(공백/하이픈)을 그대로 살려서 띄어쓰기 적용
   ("Company senior" → "회사시니어"가 아니라 "회사 시니어"). 3글자 이하(대부분 사람 이름)는
   기존처럼 붙여쓰기 유지. 예외단어(cast_name_overrides)가 다른 토큰이랑 합쳐질 때 무조건
   띄어쓰는 규칙(rev.14)은 글자수 상관없이 그대로 유지됨) */
/* 2026-08-04 rev.14 — work_cast.js (cast_name_overrides 예외등록 로직 개편 — ① 대소문자
   구분 없이 비교하도록 수정("middle School" 등록해놨는데 "Middle School"은 안 걸리던 문제)
   ② 배역명 전체가 예외문구와 완전히 같을 때만 적용하던 것을, 배역명 "일부"에 예외문구가
   포함돼 있어도 그 부분만 바꿔치기하도록 확장("middle School girl" → "중학교" + 나머지는
   기존 토큰번역으로 "소녀" → 공백으로 이어붙여 "중학교 소녀") */
/* 2026-08-04 rev.13 — work_cast.js (숫자만 있는 토큰(예: "8")은 romanization_map 조회 없이
   그대로 통과시키도록 수정 — "Student 8" 같은 배역명이 숫자에서 막혀 미매칭 처리되던 문제 해결) */
/* 2026-08-04 rev.12 — work_cast.js (속도개선 — 행별 번역을 완전 순차 대신 "5개씩 묶어서
   동시처리"로 변경. 완전 동시(rev.8)는 D1 과부하로 멈춘 적 있고, 완전 순차(rev.10)는
   안전하지만 느려서, 절충안으로 5개 단위 청크만 Promise.all 병렬 처리하고 청크끼리는
   순서대로 진행하도록 함) */
/* 2026-08-04 rev.11 — work_cast.js (work_cast.character_name_ko_attempted 컬럼 연동 —
   실패하면 attempted=1로 표시해두고, /admin/cast/translate-batch는 "한 번도 시도 안 한 것"만,
   신규 /admin/cast/retry-failed는 "예전에 실패한 것"만 대상으로 분리. 배치 반복할 때마다
   실패건까지 처음부터 다시 도는 문제 해결. 공용 로직은 _runBatch()로 정리) */
/* 2026-08-04 rev.10 — work_cast.js (rev.8의 병렬처리가 D1에 순간적으로 요청이 너무 많이
   몰려서 배치가 아예 멈추는 문제를 일으켜서, 안정성 위해 행별 처리·2조각 분해 둘 다
   순차 처리로 되돌림. UPDATE는 env.DB.batch()로 모아서 쓰는 것만 유지) */
/* 2026-08-04 rev.9 — work_cast.js ("Jang 'Woo-gi' Wook"처럼 닉네임을 감싸는 작은따옴표 때문에
   매칭 실패하던 문제 수정 — 토큰 앞뒤 따옴표를 벗겨냄. "'s"(의) 토큰은 그대로 보호) */
/* 2026-08-04 rev.8 — work_cast.js (① self/himself/herself 규칙을 코드에 반영 — work_cast.name
   (배우이름) 그대로 사용, SQL 임시처리 대신 배치 돌릴 때마다 자동 적용됨 ② 속도개선 — 행별
   번역/2조각분해 조회를 순차 대기 대신 Promise.all로 병렬 처리, UPDATE도 env.DB.batch()로
   한번에 ③ id 커서(after_id) 도입 — 같은 회차 안에서 미매칭 30건을 무한 재조회하던 버그
   수정, 응답에 last_id 추가) */
/* 2026-08-04 rev.7 — work_cast.js (분해 로직을 "정확히 2조각"으로 제한 — 재귀적으로 여러
   조각 시도하던 방식이 "Reason"→"레아손"처럼 일반 영어 단어까지 억지로 끼워맞추는 문제가
   있어서, 앞+뒤 둘 다 매칭표에 있는 딱 2음절짜리 케이스("Munju"→문+주)만 구제하도록 축소) */
/* 2026-08-04 rev.6 — work_cast.js (① 기호 처리 방식 전면 개편 — 괄호( )는 유지하고 안쪽도
   번역, 그 외 기호(마침표·대괄호·물음표·콤마 등)는 전부 제거하는 방식으로 통일(마침표/대괄호
   전용 처리 제거) ② "Munju"처럼 음절 경계 없이 붙은 토큰을 앞에서부터 긴 조각 우선으로
   분해 시도하는 _trySegment 신규 — romanization_map 조합으로 재구성 가능하면 매칭 성공 처리) */
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

// [2026-08-04 신규] "Munju"(문+주)처럼 딱 2음절이 붙어있는 케이스만 조심스럽게 구제.
// 여러 조각으로 자유롭게 재귀 분해하면 "Reason"→"레아손"처럼 엉뚱한 영어 단어까지
// 억지로 끼워맞춰지는 문제가 있어서, "정확히 2조각(앞+뒤 둘 다 매칭표에 있어야 함)"으로만
// 제한. 3조각 이상 분해는 시도하지 않음.
async function _trySegment(token, env) {
  if (token.length < 2) return null;
  for (let i = token.length - 1; i >= 1; i--) {
    const first = token.slice(0, i);
    const second = token.slice(i);
    const [row1, row2] = await Promise.all([
      env.DB.prepare(`SELECT hangul FROM romanization_map WHERE roman = ?`).bind(first).first(),
      env.DB.prepare(`SELECT hangul FROM romanization_map WHERE roman = ?`).bind(second).first(),
    ]);
    if (row1 && row2) return row1.hangul + row2.hangul;
  }
  return null;
}

// 순수 로마자 토큰(괄호 없는 상태) 하나 번역 — 통째 매칭 우선, 안 되면 분해 시도
async function _lookupToken(token, env) {
  const row = await env.DB.prepare(`SELECT hangul FROM romanization_map WHERE roman = ?`)
    .bind(token)
    .first();
  if (row) return row.hangul;
  return await _trySegment(token, env);
}

// [2026-08-04 신규] 토큰 하나를 처리 — 괄호로 감싸져 있으면(예: "(voice)") 괄호는 유지하고
// 안쪽 내용만 번역해서 다시 괄호로 감싸 반환. 괄호 없으면 토큰 자체를 번역.
async function _translateToken(rawToken, env) {
  const openParen = rawToken.startsWith("(");
  const closeParen = rawToken.endsWith(")");
  const inner = rawToken.replace(/^\(/, "").replace(/\)$/, "");
  if (!inner) return null;
  // [rev.13] 숫자만 있는 토큰(예: "8")은 매칭표에서 찾을 필요 없이 그대로 통과
  if (/^\d+$/.test(inner)) {
    return (openParen ? "(" : "") + inner + (closeParen ? ")" : "");
  }
  const hangul = await _lookupToken(inner, env);
  if (hangul === null) return null;
  return (openParen ? "(" : "") + hangul + (closeParen ? ")" : "");
}

// [rev.16] 토큰 배열 하나를 이어붙여 번역 — delimTypes[i]는 tokens[i]와 tokens[i+1] 사이의
// 원문 구분자 종류('space' | 'hyphen'). 4글자 이상일 때 'space' 자리만 띄우고 'hyphen'
// 자리(이름 음절 구분용)는 그대로 붙여써서 원문 구분을 재현함.
async function _translateTokenSequence(tokens, delimTypes, env) {
  if (tokens.length === 0) return { ok: true, hangul: "" };

  const results = await Promise.all(
    tokens.map((t) => _translateToken(t.toLowerCase(), env))
  );

  // 앞에서부터 순서대로 이어붙이다가 막히는 토큰이 나오면 거기서 멈춤. 거기까지 이어붙인
  // 한글이 이미 3글자 이상이면(=사람 이름 정도는 나온 걸로 판단) 그걸로 성공 처리하고
  // 나머지(예: "[2018 - serial killer]" 같은 부가설명)는 그냥 버림.
  const pieces = [];
  let stopIndex = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    if (results[i] === null) { stopIndex = i; break; }
    pieces.push(results[i]);
  }
  const concatenated = pieces.join("");
  const fullMatch = stopIndex === tokens.length;
  if (fullMatch || concatenated.length >= 3) {
    let hangul;
    if (concatenated.length >= 4) {
      // [rev.15/16] 4글자 이상이면 설명형 배역명으로 보고, 원문에서 공백이었던 자리만
      // 띄어씀. 하이픈이었던 자리(이름 음절 구분용)는 그대로 붙여씀.
      hangul = pieces.reduce((acc, piece, i) => {
        if (i === 0) return piece;
        const delim = delimTypes[i - 1];
        return acc + (delim === "space" ? " " : "") + piece;
      }, "");
    } else {
      hangul = concatenated;
    }
    return { ok: true, hangul };
  }

  const failedTokens = tokens.filter((t, i) => results[i] === null);
  if (failedTokens.length > 0) {
    return { ok: false, tokens: failedTokens };
  }
  return { ok: true, hangul: concatenated };
}

// [rev.14] 소문자로 정리된 토큰 배열(tokensLower) 안에서, cast_name_overrides에 등록된
// 문구(여러 단어일 수 있음)와 연속으로 일치하는 가장 긴 구간을 찾음. 대소문자 무시.
// 찾으면 { startIdx, endIdx, hangul } 반환(endIdx는 배타적), 없으면 null.
async function _findOverrideSpan(tokensLower, env) {
  const { results } = await env.DB.prepare(
    `SELECT original, hangul FROM cast_name_overrides`
  ).all();
  if (!results || results.length === 0) return null;

  const overridePhrases = results.map((r) => ({
    tokens: r.original.toLowerCase().split(/[\s\-]+/).filter(Boolean),
    hangul: r.hangul,
  }));

  let best = null;
  for (let start = 0; start < tokensLower.length; start++) {
    for (const ov of overridePhrases) {
      const len = ov.tokens.length;
      if (len === 0 || start + len > tokensLower.length) continue;
      let match = true;
      for (let k = 0; k < len; k++) {
        if (tokensLower[start + k] !== ov.tokens[k]) { match = false; break; }
      }
      if (match && (!best || len > best.endIdx - best.startIdx)) {
        best = { startIdx: start, endIdx: start + len, hangul: ov.hangul };
      }
    }
  }
  return best;
}

// [신규] 배역명 문자열 하나를 번역 — ① 통째 예외표(cast_name_overrides) 먼저 확인(대소문자
// 무시), 완전히 일치하면 그대로 사용. ② 완전히 일치하는 게 없으면, 기호 정리(괄호는 유지,
// 그 외 기호는 전부 제거) 후 공백/하이픈으로 쪼개서 토큰화(이때 [rev.16] 각 구분자가
// 공백이었는지 하이픈이었는지도 같이 기억해둠). ③ [rev.14] 쪼갠 토큰들 안에 예외문구(여러
// 단어)와 일치하는 구간이 있으면 그 부분만 바꿔치고, 앞/뒤 남는 토큰은 기존 방식대로
// 번역해서 공백으로 이어붙임("middle School girl" → "중학교" + " " + "소녀").
// ④ 예외문구 매칭이 아예 없으면 기존처럼 전체를 토큰별로 번역(rev.16 구분자 규칙 적용).
async function _translateName(rawName, env) {
  const overrideFull = await env.DB.prepare(
    `SELECT hangul FROM cast_name_overrides WHERE LOWER(original) = LOWER(?)`
  ).bind(rawName).first();
  if (overrideFull) {
    return { ok: true, hangul: overrideFull.hangul };
  }

  // 괄호( )는 유지, 그 외 기호(마침표·대괄호·물음표·콤마 등)는 전부 제거.
  // 어퍼스트로피 's는 "Bak's"처럼 붙어오므로 별도 토큰으로 분리(앞에 공백 삽입).
  const symbolsCleaned = rawName.replace(/[^A-Za-z0-9\s\-'()]/g, "");
  const normalized = symbolsCleaned.replace(/'s\b/gi, " 's");

  // [rev.16] 공백/하이픈 구분자를 캡처 그룹으로 살려서 쪼갬 — 짝수 인덱스는 토큰,
  // 홀수 인덱스는 그 앞뒤 토큰을 나눈 구분자 원문(공백묶음 또는 하이픈묶음)
  const rawParts = normalized.split(/([\s-]+)/).filter((p) => p !== "");
  const tokens = [];
  const delimTypes = []; // delimTypes[i] = tokens[i]와 tokens[i+1] 사이 구분자 종류

  for (let i = 0; i < rawParts.length; i++) {
    if (i % 2 === 0) {
      let t = rawParts[i];
      // [2026-08-04 신규] "'Woo-gi'"처럼 닉네임을 감싸는 따옴표는 벗겨냄. "'s" 토큰 자체는 보호.
      if (t !== "'s") {
        t = t.replace(/^'+/, "").replace(/'+$/, "");
      }
      if (t) {
        tokens.push(t);
      } else if (delimTypes.length > 0) {
        // 정리 후 빈 토큰이 되면(드문 케이스) 앞뒤 구분자를 하나로 합침(공백 우선)
        delimTypes[delimTypes.length - 1] = "space";
      }
    } else {
      // 하이픈이 하나라도 섞여있으면 공백은 무시하고 hyphen으로 판단하지 않고,
      // 반대로 공백이 하나라도 섞여있으면 무조건 'space'로 취급(단어 구분 우선)
      delimTypes.push(rawParts[i].includes(" ") ? "space" : "hyphen");
    }
  }
  if (tokens.length === 0) return { ok: false, tokens: [] };

  // [rev.14] 토큰 안에서 예외문구 부분매칭 구간을 찾아봄(괄호 벗기고 소문자로 비교)
  const tokensLower = tokens.map((t) =>
    t.replace(/^\(/, "").replace(/\)$/, "").toLowerCase()
  );
  const span = await _findOverrideSpan(tokensLower, env);
  if (span) {
    const beforeTokens = tokens.slice(0, span.startIdx);
    const beforeDelims = delimTypes.slice(0, Math.max(span.startIdx - 1, 0));
    const afterTokens = tokens.slice(span.endIdx);
    const afterDelims = delimTypes.slice(span.endIdx);
    const [beforeR, afterR] = await Promise.all([
      _translateTokenSequence(beforeTokens, beforeDelims, env),
      _translateTokenSequence(afterTokens, afterDelims, env),
    ]);
    if (beforeR.ok && afterR.ok) {
      const parts = [beforeR.hangul, span.hangul, afterR.hangul].filter(Boolean);
      return { ok: true, hangul: parts.join(" ") };
    }
    const failedTokens = [
      ...(beforeR.ok ? [] : beforeR.tokens),
      ...(afterR.ok ? [] : afterR.tokens),
    ];
    return { ok: false, tokens: failedTokens };
  }

  // 예외문구 매칭이 없으면 기존처럼 전체를 토큰별로 번역
  return await _translateTokenSequence(tokens, delimTypes, env);
}

// [2026-08-04 신규] 배치 실행 공용 함수 — retryFailed=false면 "한 번도 시도 안 한 것"만,
// true면 "예전에 실패해서 character_name_ko_attempted=1로 표시된 것"만 대상으로 함.
// 실패하면 character_name_ko_attempted=1로 표시해둬서, 다음부터 "자동번역배치"(미시도용)
// 에는 안 걸리고 "미매칭 재시도" 버튼에서만 다시 만나도록 분리함.
async function _runBatch(env, { afterId, limit, retryFailed }) {
  const attemptedCond = retryFailed
    ? "wc.character_name_ko_attempted = 1"
    : "wc.character_name_ko_attempted IS NULL";

  const { results } = await env.DB.prepare(
    `SELECT wc.id, wc.character_name, wc.name AS actor_name, w.title_ko
     FROM work_cast wc
     JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
     WHERE w.original_language = 'ko'
       AND wc.character_name_ko IS NULL
       AND ${attemptedCond}
       AND wc.character_name IS NOT NULL AND wc.character_name != ''
       AND wc.id > ?
     ORDER BY wc.id ASC
     LIMIT ?`
  ).bind(afterId, limit).all();

  const rows = results || [];
  const succeeded = [];
  const failed = [];
  let lastId = afterId;

  // [rev.12] 5개씩 묶어서 동시 처리 — 청크 안에서는 병렬, 청크끼리는 순차로 진행해서
  // D1에 한 번에 몰리는 요청 수를 5건 단위로 제한함(완전 동시는 과부하 위험, 완전 순차는 느림)
  const CHUNK_SIZE = 5;
  const translations = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map((row) => {
        if (/self|himself|herself/i.test(row.character_name)) {
          return Promise.resolve(
            row.actor_name
              ? { ok: true, hangul: row.actor_name }
              : { ok: false, tokens: ["(배우 한글이름 없음)"] }
          );
        }
        return _translateName(row.character_name, env);
      })
    );
    translations.push(...chunkResults);
  }

  const updateStmts = [];
  rows.forEach((row, i) => {
    if (row.id > lastId) lastId = row.id;
    const r = translations[i];
    if (r.ok) {
      updateStmts.push(
        env.DB.prepare(
          `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'auto' WHERE id = ?`
        ).bind(r.hangul, row.id)
      );
      succeeded.push({
        id: row.id, work: row.title_ko, actor: row.actor_name,
        original: row.character_name, translated: r.hangul,
      });
    } else {
      updateStmts.push(
        env.DB.prepare(
          `UPDATE work_cast SET character_name_ko_attempted = 1 WHERE id = ?`
        ).bind(row.id)
      );
      failed.push({
        id: row.id, work: row.title_ko, actor: row.actor_name,
        original: row.character_name, missing_tokens: r.tokens,
      });
    }
  });
  if (updateStmts.length > 0) {
    await env.DB.batch(updateStmts);
  }

  const remainRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM work_cast wc
     JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
     WHERE w.original_language = 'ko' AND wc.character_name_ko IS NULL
       AND ${attemptedCond}
       AND wc.character_name IS NOT NULL AND wc.character_name != ''`
  ).first();

  return { ok: true, succeeded, failed, remaining: remainRow?.cnt || 0, last_id: lastId };
}

export async function handleWorkCast(path, request, env, url, headers) {
  try {
    // ── POST /admin/cast/translate-batch ──────────────────────
    // body: { limit?, after_id? }  기본 30, 최대 100
    // "한 번도 시도 안 한 것"만 대상(character_name_ko_attempted가 아직 NULL인 것)
    if (path === "/admin/cast/translate-batch" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 100);
      const afterId = parseInt(body.after_id) || 0;
      const result = await _runBatch(env, { afterId, limit, retryFailed: false });
      return new Response(JSON.stringify(result), { headers });
    }

    // ── POST /admin/cast/retry-failed ──────────────────────────
    // body: { limit?, after_id? }  — "예전에 실패해서 attempted=1로 표시된 것"만 재시도.
    // 매칭표(romanization_map)에 단어를 추가한 뒤, 실패했던 것만 다시 돌려보는 용도.
    if (path === "/admin/cast/retry-failed" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 100);
      const afterId = parseInt(body.after_id) || 0;
      const result = await _runBatch(env, { afterId, limit, retryFailed: true });
      return new Response(JSON.stringify(result), { headers });
    }

    // ── POST /admin/cast/override-save ────────────────────────
    // body: { original, hangul, cast_id? } — "Sam Kim"→"샘킴" 같은 통째 예외 등록/수정.
    // [rev.17] cast_id가 같이 오면(성공/미매칭 리스트에서 등록한 경우), 예외표 등록과
    // 동시에 해당 work_cast 행의 character_name_ko도 바로 이 값으로 갱신함.
    if (path === "/admin/cast/override-save" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const original = (body.original || "").trim();
      const hangul = (body.hangul || "").trim();
      const castId = parseInt(body.cast_id);
      if (!original || !hangul) {
        return new Response(JSON.stringify({ ok: false, message: "original과 hangul이 필요해요" }), { status: 400, headers });
      }
      const stmts = [
        env.DB.prepare(
          `INSERT INTO cast_name_overrides (original, hangul) VALUES (?, ?)
           ON CONFLICT(original) DO UPDATE SET hangul = excluded.hangul`
        ).bind(original, hangul),
      ];
      if (castId) {
        stmts.push(
          env.DB.prepare(
            `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'manual' WHERE id = ?`
          ).bind(hangul, castId)
        );
      }
      await env.DB.batch(stmts);
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
