/* 2026-07-27 rev.7 — admin-persons.js (블로그 검색을 "이름 프로필 MBTI"로 전면 교체 — 관리자 실사용 테스트로 찾은 방식. 제목에 이름+프로필이 둘 다 있는 글만 신뢰, 5개까지 확인해서 다수결, 동점이면 최신글 우선. 나무위키는 근접성 체크 유지) */
/* ══════════════════════════════════════════════════════════════
   인물(persons) 관련 어드민 기능 — admin.js와 별개 파일
   ─────────────────────────────────────────────────────────────
   [2026-07-27 신규] MBTI 수집 2번째 방식(네이버 검색 기반) — 기존 admin.js의
   AI 웹서치 방식(mbti-auto-step)은 절대 건드리지 않고, 완전히 새로운 파이프라인으로 비교
   검증해보기 위해 별도 파일/별도 컬럼(persons.mbti_naver)으로 분리함.

   기존 AI 방식과의 차이:
   - AI(Claude)가 검색결과를 읽고 판단하는 과정 없음 — 네이버 검색 API 결과 텍스트에서
     "MBTI" 근처의 4글자 유형을 정규식으로 그대로 추출(나무위키 크롤링 때와 같은 원리)
   - 검색 API 자체가 무료(하루 25,000회 한도) — AI 토큰 비용이 전혀 안 듦
   - 그만큼 "판단"은 없음 — 검색결과에 나오면 그대로 채택, 없으면 미확정

   흐름: ① 대상자 선정(korean_confirmed=1 + mbti_naver_checked_at 없음)
        ② 무료 위키 사전확인 — 이름+생년 일치 확인. 이 단계가 동명이인 방지뿐 아니라
           "위키백과에 문서가 없는 사람(성인물 출연자 등)을 걸러주는 안전장치" 역할도 함
           (관리자 판단, 매우 중요 — 절대 생략하지 말 것)
        ③ 위키 매칭 안 되면 AI 방식과 동일하게 스킵(체크만 하고 넘어감)
        ④ 매칭되면 네이버 검색(블로그) API로 "이름 생년 MBTI" 검색 → 결과 텍스트에서
           MBTI 패턴 정규식 추출 → 있으면 저장, 없으면 미확정
   ══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

// [2026-07-27 신규] 무료 위키 사전확인 — admin.js의 _checkWikiMatch와 동일한 로직을
// 그대로 복제(admin.js는 이번 작업에서 건드리지 않기로 했으므로 import 대신 중복 보유).
// 이름+생년이 일치하는 한국어 위키백과 문서가 있는지만 확인(무료, 가벼움).
async function _checkWikiMatchForMbti(displayName, tmdbYear) {
  const WIKI_UA = { "User-Agent": "OttrankBot/1.0 (https://ottrank.kr; 오뜨랑 인물 위키매칭)" };
  try {
    const searchRes = await fetch(
      `https://ko.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(displayName)}&limit=5&namespace=0&format=json`,
      { headers: WIKI_UA }
    );
    if (!searchRes.ok) return { matched: false };
    const searchData = await searchRes.json();
    const titles = searchData[1] || [];

    const disambigTitle = `${displayName} (배우)`;
    if (!titles.includes(disambigTitle)) {
      titles.unshift(disambigTitle);
    }

    const CURRENT_YEAR = new Date().getFullYear();
    const isPlausibleYear = (y) => { const n = parseInt(y, 10); return n >= 1900 && n <= CURRENT_YEAR; };
    const extractBirthYear = (text) => {
      const parenMatch = text.match(/\(([^)]{0,80})\)/);
      if (parenMatch) {
        const y = parenMatch[1].match(/(\d{4})년/);
        if (y && isPlausibleYear(y[1])) return y[1];
      }
      const loose = text.match(/(\d{4})년/);
      if (loose && isPlausibleYear(loose[1])) return loose[1];
      return null;
    };

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      const extractRes = await fetch(
        `https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=1&explaintext=1&format=json`,
        { headers: WIKI_UA }
      );
      if (!extractRes.ok) continue;
      const extractData = await extractRes.json();
      const pages   = (extractData.query && extractData.query.pages) || {};
      const pageObj = Object.values(pages)[0];
      const extract = (pageObj && pageObj.extract) || "";
      const pageMissing = !pageObj || ("missing" in pageObj) || !extract;
      if (pageMissing) continue;

      const wikiYear = extractBirthYear(extract);
      const isYearMatch = tmdbYear && wikiYear && tmdbYear === wikiYear;
      const isYearConflict = tmdbYear && wikiYear && tmdbYear !== wikiYear;
      const isDisambigPageExists = title === disambigTitle && !pageMissing;
      if (isYearConflict) continue;
      if (isYearMatch || (isDisambigPageExists && !tmdbYear)) {
        return { matched: true };
      }
    }
    return { matched: false };
  } catch (e) {
    return { matched: false };
  }
}

// [2026-07-27 6차 수정] 블로그 검색 방식 전면 교체 — 관리자가 실사용 테스트로 찾은 핵심:
// "이름 MBTI"로만 검색하면 글쓴이 본인 MBTI나 "이 영화는 ISFP들이 좋아함" 같은 무관한
// 문장이 섞여서 오탐이 심함. 반면 "이름 프로필 MBTI"로 검색하면 그 배우 신상정보만 정리한
// 프로필형 블로그 글로 대부분 연결되고, 이런 글은 다른 사람 MBTI가 섞일 일이 없어 정확함.
// → 제목에 "이름"과 "프로필"이 둘 다 있는 글만 신뢰하고(본문 근접성 체크 불필요), 5개까지
// 확인해서 여러 개 나오면 다수결로 채택, 동점이면 최신 글(postdate) 우선.
async function _fetchNaverMbti(displayName, birthYear, jobLabel, env) {
  if (!env.NAVER_DATALAB_CLIENT_ID || !env.NAVER_DATALAB_CLIENT_SECRET) {
    return { mbti: null, reason: "no_naver_key" };
  }
  const namuQuery = `${displayName} 나무위키 MBTI`;
  const profileQuery = `${displayName} 프로필 MBTI`;

  const stripText = (raw) => raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  const mbtiRegex = /MBTI[^A-Za-z]{0,15}([EI][SN][FT][JP])\b/i;

  // ① 나무위키(웹문서) — 이름 언급 위치 기준 앞뒤 40자 이내에 MBTI가 있을 때만 채택
  try {
    const resp = await fetch(
      `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(namuQuery)}&display=10`,
      {
        headers: {
          "X-Naver-Client-Id": env.NAVER_DATALAB_CLIENT_ID,
          "X-Naver-Client-Secret": env.NAVER_DATALAB_CLIENT_SECRET,
        },
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      for (const it of (data.items || [])) {
        const text = stripText(`${it.title} ${it.description}`);
        if (!text.includes(displayName)) continue;
        const pattern = /MBTI[^A-Za-z]{0,15}([EI][SN][FT][JP])\b/gi;
        let mm;
        while ((mm = pattern.exec(text)) !== null) {
          let searchFrom = 0, closeEnough = false;
          while (true) {
            const idx = text.indexOf(displayName, searchFrom);
            if (idx === -1) break;
            if (Math.abs(idx - mm.index) <= 40) { closeEnough = true; break; }
            searchFrom = idx + displayName.length;
          }
          if (closeEnough) return { mbti: mm[1].toUpperCase(), reason: "ok_namuwiki" };
        }
      }
    }
  } catch (e) { /* 나무위키 실패해도 블로그로 계속 진행 */ }

  // ② 블로그 "이름 프로필 MBTI" — 제목에 이름+프로필이 둘 다 있는 글만 신뢰, 5개까지 확인
  try {
    const resp = await fetch(
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(profileQuery)}&display=5`,
      {
        headers: {
          "X-Naver-Client-Id": env.NAVER_DATALAB_CLIENT_ID,
          "X-Naver-Client-Secret": env.NAVER_DATALAB_CLIENT_SECRET,
        },
      }
    );
    if (!resp.ok) return { mbti: null, reason: `http_${resp.status}` };
    const data = await resp.json();
    const items = data.items || [];
    if (!items.length) return { mbti: null, reason: "no_results" };

    // 제목에 "이름"+"프로필"이 둘 다 있는 항목만 후보로 모음(postdate: YYYYMMDD 문자열)
    const candidates = [];
    for (const it of items) {
      const title = stripText(it.title);
      if (!title.includes(displayName) || !title.includes("프로필")) continue;
      const body = stripText(`${it.title} ${it.description}`);
      const m = body.match(mbtiRegex);
      if (m) candidates.push({ mbti: m[1].toUpperCase(), postdate: it.postdate || "" });
    }
    if (!candidates.length) return { mbti: null, reason: "profile_title_not_found" };

    // 다수결 — 가장 많이 나온 값. 동점이면 그 값들 중 postdate가 가장 최근인 쪽 채택.
    const voteCount = {};
    candidates.forEach((c) => { voteCount[c.mbti] = (voteCount[c.mbti] || 0) + 1; });
    const maxVotes = Math.max(...Object.values(voteCount));
    const tied = Object.keys(voteCount).filter((k) => voteCount[k] === maxVotes);

    if (tied.length === 1) {
      return { mbti: tied[0], reason: "ok_blog_profile" };
    }
    // 동점 — 해당 값들 중 가장 최근 postdate를 가진 후보의 값 채택
    const tiedCandidates = candidates.filter((c) => tied.includes(c.mbti));
    tiedCandidates.sort((a, b) => (b.postdate || "").localeCompare(a.postdate || ""));
    return { mbti: tiedCandidates[0].mbti, reason: "ok_blog_profile_tiebreak" };
  } catch (e) {
    return { mbti: null, reason: `fetch_error_${e.message}` };
  }
}

export async function handleAdminPersons(path, request, env, url, headers) {
  // ── POST /admin/persons/mbti-naver-step ────────────────────────
  // "MBTI 수집(네이버)" 탭 — 버튼 한 번에 1명만 처리. admin.js의 mbti-auto-step과
  // 동일한 반복 호출 패턴(done:true 받을 때까지 프론트가 계속 호출).
  if (path === "/admin/persons/mbti-naver-step" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const candidate = await env.DB.prepare(`
        SELECT tmdb_id, name, name_ko, job, birthday, popularity
        FROM persons
        WHERE korean_confirmed = 1
          AND mbti_naver_checked_at IS NULL
        ORDER BY popularity DESC
        LIMIT 1
      `).first();

      if (!candidate) {
        return new Response(JSON.stringify({ ok: true, done: true }), { headers });
      }

      const displayName = candidate.name_ko || candidate.name;
      const jobLabel = candidate.job === "direct" ? "감독" : "배우";
      let birthYear = "";
      if (candidate.birthday && /^\d{4}/.test(candidate.birthday)) {
        birthYear = candidate.birthday.slice(0, 4);
      }

      // ② 무료 위키 사전확인 — 동명이인 방지 + 성인물 출연자 등 필터링 역할
      const wikiCheck = await _checkWikiMatchForMbti(displayName, birthYear);
      if (!wikiCheck.matched) {
        await env.DB.prepare(
          `UPDATE persons SET mbti_naver_checked_at = datetime('now') WHERE tmdb_id = ?`
        ).bind(candidate.tmdb_id).run();
        return new Response(JSON.stringify({
          ok: true, done: false,
          person: { tmdb_id: candidate.tmdb_id, name: displayName },
          result: "skipped", reason: "wiki_no_match",
        }), { headers });
      }

      // ③ 네이버 검색 API로 MBTI 패턴 추출(무료, AI 없음)
      // 초당 요청 제한(10회) 방어용 짧은 대기
      await new Promise((r) => setTimeout(r, 300));
      const naverResult = await _fetchNaverMbti(displayName, birthYear, jobLabel, env);

      if (naverResult.mbti) {
        await env.DB.prepare(
          `UPDATE persons SET mbti_naver = ?, mbti_naver_checked_at = datetime('now') WHERE tmdb_id = ?`
        ).bind(naverResult.mbti, candidate.tmdb_id).run();
        return new Response(JSON.stringify({
          ok: true, done: false,
          person: { tmdb_id: candidate.tmdb_id, name: displayName },
          result: "found", mbti: naverResult.mbti,
        }), { headers });
      }

      await env.DB.prepare(
        `UPDATE persons SET mbti_naver_checked_at = datetime('now') WHERE tmdb_id = ?`
      ).bind(candidate.tmdb_id).run();
      return new Response(JSON.stringify({
        ok: true, done: false,
        person: { tmdb_id: candidate.tmdb_id, name: displayName },
        result: "skipped", reason: naverResult.reason,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/mbti-naver-search ───────────────────────
  // 개별 검색(이름/tmdb_id) — admin.js의 /admin/persons/search와 별개(그 파일 안 건드리기 위해
  // 이 파일 안에서 자체적으로 구현). 결과에 mbti_naver 값도 같이 내려줌.
  if (path === "/admin/persons/mbti-naver-search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: true, items: [] }), { headers });
      }

      let items;
      if (/^\d+$/.test(q)) {
        const row = await env.DB.prepare(
          `SELECT tmdb_id, name, name_ko, mbti_naver FROM persons WHERE tmdb_id = ?`
        ).bind(parseInt(q, 10)).first();
        items = row ? [row] : [];
      } else {
        const { results } = await env.DB.prepare(`
          SELECT tmdb_id, name, name_ko, mbti_naver FROM persons
          WHERE name LIKE ? OR name_ko LIKE ?
          ORDER BY name LIMIT 30
        `).bind(`%${q}%`, `%${q}%`).all();
        items = results;
      }

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/mbti-naver-confirmed-list ───────────────
  // 네이버 방식으로 찾은 확정 리스트, 50명씩. AI 버전(admin.js)과 동일한 응답 형태로
  // 맞춰서 프론트가 같은 렌더링 코드를 재사용할 수 있게 함(source만 다름).
  if (path === "/admin/persons/mbti-naver-confirmed-list" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const page  = Math.max(1, parseInt(url.searchParams.get("page")) || 1);
      const limit = 50;
      const offset = (page - 1) * limit;

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, COALESCE(name_ko, name) AS display_name, mbti_naver AS mbti, mbti_naver_checked_at
        FROM persons
        WHERE mbti_naver IS NOT NULL
        ORDER BY mbti_naver_checked_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();

      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM persons WHERE mbti_naver IS NOT NULL`
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, total: totalRow?.cnt || 0, page, pageSize: limit,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/mbti-naver-pending-list ──────────────────
  // 네이버 방식으로 확인은 했지만 못 찾은 리스트, 50명씩.
  if (path === "/admin/persons/mbti-naver-pending-list" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const page  = Math.max(1, parseInt(url.searchParams.get("page")) || 1);
      const limit = 50;
      const offset = (page - 1) * limit;

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, COALESCE(name_ko, name) AS display_name, mbti_naver_checked_at
        FROM persons
        WHERE mbti_naver_checked_at IS NOT NULL AND mbti_naver IS NULL
        ORDER BY mbti_naver_checked_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();

      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM persons WHERE mbti_naver_checked_at IS NOT NULL AND mbti_naver IS NULL`
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, total: totalRow?.cnt || 0, page, pageSize: limit,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/mbti-naver-set ─────────────────────────
  // 개별 수정/삭제(빈 문자열로 저장하면 삭제). admin.js의 mbti-set과 동일한 패턴이나
  // 대상 컬럼만 mbti_naver.
  if (path === "/admin/persons/mbti-naver-set" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbId = parseInt(body.tmdb_id);
      const mbtiRaw = (body.mbti || "").trim().toUpperCase();
      if (!tmdbId) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id가 필요해요" }), { status: 400, headers });
      }
      if (mbtiRaw && !/^[EI][SN][FT][JP]$/.test(mbtiRaw)) {
        return new Response(JSON.stringify({ ok: false, message: "MBTI는 ENFP처럼 4글자 형식이어야 해요" }), { status: 400, headers });
      }

      const person = await env.DB.prepare(`SELECT tmdb_id FROM persons WHERE tmdb_id = ?`).bind(tmdbId).first();
      if (!person) {
        return new Response(JSON.stringify({ ok: false, message: "인물을 찾을 수 없어요" }), { status: 404, headers });
      }

      await env.DB.prepare(
        `UPDATE persons SET mbti_naver = ?, mbti_naver_checked_at = datetime('now') WHERE tmdb_id = ?`
      ).bind(mbtiRaw || null, tmdbId).run();

      return new Response(JSON.stringify({ ok: true, tmdb_id: tmdbId, mbti: mbtiRaw || null }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null; // 해당하는 라우트 없음 — index.js가 다음 라우트로 넘어감
}
