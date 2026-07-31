/* 2026-08-01 rev.9 — admin-persons.js (구글 더블체크 링크에 직업(배우/감독) 포함시키기 위해
   개별검색/확정리스트/미확정리스트 응답에 job 필드 추가) */
/* 2026-08-01 rev.8 — admin-persons.js (확정 리스트 API에 자동/수동 필터 파라미터(source) 추가:
   all(기본)/auto/manual 세 가지, NULL(예전 데이터)은 auto로 취급) */
/* 2026-08-01 rev.7 — admin-persons.js (MBTI 네이버수집 자동/수동 구분 추가:
   mbti_naver_source 컬럼(auto/manual) 채우기, 확정/미확정/개별검색 응답에 birthday+
   mbti_naver_source 포함 — 화면에서 자동/수동 뱃지 + 구글 검색 링크 만드는 데 사용) */
/* 2026-07-31 rev.6 — admin-persons.js (공개조회 API 응답에 credit_kind 필드 누락 발견,
   추가 — person.html의 cast/crew 병합 로직이 출연/연출을 명시적으로 구분할 수 있게 함) */
/* 2026-07-31 rev.5 — admin-persons.js (필모그래피 수동 추가 기능 신규: person_manual_credits
   관리자용 API 4종(목록조회/작품검색/추가/삭제) + 공개조회 API 1종(handleAdminPersonManualCredits
   함수로 분리, index.js에서 별도 라우팅 필요) — TMDB 필모에 없는 작품을 우리 DB 기준으로
   이 인물 필모그래피에 이어붙임, 대표작 자동계산에는 관여 안 함) */
/* 2026-07-31 rev.4 — admin-persons.js (인물 관련 영상 기능 신규: person_videos 관리자용 API
   3종 추가 — 목록조회 GET /admin/persons/videos, 추가 POST /admin/persons/videos-add,
   삭제 DELETE /admin/persons/videos/:id. title_videos의 유튜브ID추출/중복체크/oEmbed
   제목자동조회 패턴 재사용) */
/* 2026-07-29 rev.3 — admin-persons.js (인물 대표이미지 기능 신규: R2 업로드/조회/삭제 API +
   공개 조회 API. relationship.js의 IMAGES 바인딩/img.ottrank.kr 패턴 재사용) */
/* 2026-07-29 rev.2 — admin-persons.js (공개 조회 API 신규: GET /person-featured-works/:id —
   person.html이 인증 없이 호출, 대표작 실제 화면 반영용) */
/* 2026-07-29 rev.1 — admin-persons.js (대표작 수동 지정 기능 신규: featured-works API 3종 추가 —
   조회/작품검색(DB우선+TMDB보완)/저장(최대5개 교체), person_featured_works 테이블 사용) */
/* 2026-07-27 rev.10 — admin-persons.js ("공개안함/비공개/모름" 등을 다수결 후보에 정식 포함 — 이런 부정 표현을 만나면 그 즉시 UNDISCLOSED로 확정 판정하고 뒤쪽 상관없는 글자를 계속 찾아 헤매지 않게 함(박찬욱 오탐 사례 수정). 나무위키에서 "공개안함" 발견 시 블로그 단계로 안 넘어가고 바로 미확정 처리) */
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

  // [2026-07-27 9차 수정] "MBTI (공개안함)" 같은 문장을 만나면, 정규식이 그걸 건너뛰고
  // 텍스트 뒤쪽의 상관없는 4글자를 잘못 주워오는 문제가 실사용 중 확인됨(관리자 발견,
  // 박찬욱 사례). "MBTI" 등장 지점마다 순서대로 검사해서 ① "공개안함/비공개/모름" 같은
  // 명시적 부정 표현을 먼저 찾고, 있으면 그 즉시 UNDISCLOSED로 확정 판정(뒤쪽 다른 글자를
  // 계속 찾아 헤매지 않음) ② 없으면 10자 이내에 유효한 4글자 유형이 있는지 확인.
  // 둘 다 아니면 이 "MBTI" 등장은 무시하고 다음 등장으로 넘어감(애매한 신호는 집계 안 함).
  // ⚠️ "공개안함"도 다수결 후보에 정식으로 포함됨 — 실제로 "MBTI 없음"이라고 밝힌 사람에
  // 대해, 엉뚱한 글자를 억지로 채택하는 것보다 "공개안함"이 다수면 그게 곧 정답임(관리자 판단).
  const negativePattern = "공개안함|비공개|밝히지\\s*않|알려지지\\s*않|안\\s*밝힘|불명|모름";
  const extractMbtiSignal = (body) => {
    const mbtiIdxRe = /MBTI/gi;
    let idxMatch;
    while ((idxMatch = mbtiIdxRe.exec(body)) !== null) {
      const after = body.slice(idxMatch.index + 4, idxMatch.index + 4 + 20);
      const negMatch = after.match(new RegExp(`^[^A-Za-z가-힣]{0,10}(${negativePattern})`));
      if (negMatch) return "UNDISCLOSED";
      const typeMatch = after.match(/^[^A-Za-z]{0,10}([EI][SN][FT][JP])\b/i);
      if (typeMatch) return typeMatch[1].toUpperCase();
    }
    return null;
  };

  // ① 나무위키(웹문서) — 이름 언급 위치 기준 앞뒤 40자 이내에 MBTI 신호가 있을 때만 채택.
  // 나무위키가 "공개안함"이라고 명시했으면 그 자체를 확정 답으로 보고 블로그 단계로 안 넘어감
  // (제일 신뢰도 높은 출처가 이미 "정보 없음"을 확인해준 것이므로).
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
        const nameIdx = text.indexOf(displayName);
        const signal = extractMbtiSignal(text);
        if (signal) {
          // 신호가 이름 근처(40자 이내)에서 나온 게 맞는지 재확인
          const mbtiWordIdx = text.indexOf("MBTI");
          if (mbtiWordIdx !== -1 && Math.abs(mbtiWordIdx - nameIdx) <= 40) {
            if (signal === "UNDISCLOSED") return { mbti: null, reason: "namuwiki_undisclosed" };
            return { mbti: signal, reason: "ok_namuwiki" };
          }
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

    // 제목에 "이름"+"프로필"이 둘 다 있고, 본문에 태어난 연도까지 같이 언급된 항목만 후보로
    // 모음(postdate: YYYYMMDD 문자열). 동명이인(일반인 등)의 "프로필" 글이 그냥 이름만 같아서
    // 잘못 채택되는 걸 막기 위해 연도 확인(생년월일 전체 아니라 연도만). birthYear 정보가
    // 없으면(드묾) 검증 자체가 불가능하므로 그 경우만 조건 생략.
    const candidates = [];
    for (const it of items) {
      const title = stripText(it.title);
      if (!title.includes(displayName) || !title.includes("프로필")) continue;
      const body = stripText(`${it.title} ${it.description}`);
      // 태그 제거 과정에서 <b>가 연도 숫자 중간에 걸쳐있으면 "199 3"처럼 공백이 껴서
      // 그냥 문자열 비교(includes)로는 못 찾는 경우가 있음 — 공백 허용 정규식으로 비교.
      const birthYearPattern = birthYear ? new RegExp(birthYear.split("").join("\\s*")) : null;
      if (birthYearPattern && !birthYearPattern.test(body)) continue; // 연도가 같이 언급 안 되면 동명이인 의심, 스킵
      const signal = extractMbtiSignal(body);
      if (signal) candidates.push({ mbti: signal, postdate: it.postdate || "" });
    }
    if (!candidates.length) return { mbti: null, reason: "profile_title_not_found" };

    // 다수결 — 가장 많이 나온 값(UNDISCLOSED 포함). 동점이면 postdate가 가장 최근인 쪽 채택.
    const voteCount = {};
    candidates.forEach((c) => { voteCount[c.mbti] = (voteCount[c.mbti] || 0) + 1; });
    const maxVotes = Math.max(...Object.values(voteCount));
    const tied = Object.keys(voteCount).filter((k) => voteCount[k] === maxVotes);

    let winner;
    if (tied.length === 1) {
      winner = tied[0];
    } else {
      const tiedCandidates = candidates.filter((c) => tied.includes(c.mbti));
      tiedCandidates.sort((a, b) => (b.postdate || "").localeCompare(a.postdate || ""));
      winner = tiedCandidates[0].mbti;
    }

    if (winner === "UNDISCLOSED") return { mbti: null, reason: "blog_profile_undisclosed_majority" };
    return { mbti: winner, reason: tied.length === 1 ? "ok_blog_profile" : "ok_blog_profile_tiebreak" };
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
          `UPDATE persons SET mbti_naver = ?, mbti_naver_checked_at = datetime('now'), mbti_naver_source = 'auto' WHERE tmdb_id = ?`
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
          `SELECT tmdb_id, name, name_ko, birthday, job, mbti_naver, mbti_naver_source FROM persons WHERE tmdb_id = ?`
        ).bind(parseInt(q, 10)).first();
        items = row ? [row] : [];
      } else {
        const { results } = await env.DB.prepare(`
          SELECT tmdb_id, name, name_ko, birthday, job, mbti_naver, mbti_naver_source FROM persons
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

      // [2026-08-01 신규] 자동/수동 필터 — all(기본)/auto/manual.
      // 예전에 채워진 데이터는 mbti_naver_source가 NULL인데, 이건 전부 자동수집이었으므로 auto로 취급.
      const filter = url.searchParams.get("source") || "all";
      let filterSql = "";
      if (filter === "manual") filterSql = "AND mbti_naver_source = 'manual'";
      else if (filter === "auto") filterSql = "AND (mbti_naver_source = 'auto' OR mbti_naver_source IS NULL)";

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, COALESCE(name_ko, name) AS display_name, birthday, job,
               mbti_naver AS mbti, mbti_naver_checked_at, mbti_naver_source
        FROM persons
        WHERE mbti_naver IS NOT NULL ${filterSql}
        ORDER BY mbti_naver_checked_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();

      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM persons WHERE mbti_naver IS NOT NULL ${filterSql}`
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
        SELECT tmdb_id, COALESCE(name_ko, name) AS display_name, birthday, job, mbti_naver_checked_at
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

      // 값을 넣으면(관리자 직접 저장) source='manual', 빈 값으로 삭제하면 source도 같이 비움
      await env.DB.prepare(
        `UPDATE persons SET mbti_naver = ?, mbti_naver_checked_at = datetime('now'), mbti_naver_source = ? WHERE tmdb_id = ?`
      ).bind(mbtiRaw || null, mbtiRaw ? "manual" : null, tmdbId).run();

      return new Response(JSON.stringify({ ok: true, tmdb_id: tmdbId, mbti: mbtiRaw || null, source: mbtiRaw ? "manual" : null }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // [2026-07-29 신규] 대표작 수동 지정 — person_featured_works 테이블
  // 인물 1명당 최대 5개까지, 관리자가 지정한 작품을 순서대로 저장.
  // person.html은 이 목록을 앞쪽에 고정 배치하고, 남은 자리는 기존
  // 자동 알고리즘(popularity+게스트감점 등)으로 채운다.
  // ══════════════════════════════════════════════════════════════

  const TMDB_KEY = env.TMDB_API_KEY;

  // TMDB 상세정보 1건 조회(영화/TV 자동 판별용) — 제목/포스터만 필요
  async function _fetchTmdbWorkDetail(tmdbId, mediaType) {
    try {
      const resp = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ko-KR`
      );
      if (!resp.ok) return null;
      const d = await resp.json();
      const title = mediaType === "movie" ? d.title : d.name;
      if (!title) return null;
      return { tmdb_id: tmdbId, media_type: mediaType, title, poster_path: d.poster_path || null };
    } catch (e) {
      return null;
    }
  }

  // ── GET /admin/persons/featured-works ───────────────────────────
  // 특정 인물의 현재 지정된 대표작 목록(최대 5개, 순서대로) 조회.
  // DB엔 tmdb_id/media_type/순서만 있으므로, 화면 표시용 제목/포스터는
  // 그때그때 TMDB에서 가져옴(최대 5건이라 부담 적음).
  if (path === "/admin/persons/featured-works" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const personId = parseInt(url.searchParams.get("tmdb_person_id"));
      if (!personId) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_person_id가 필요해요" }), { status: 400, headers });
      }

      const { results: rows } = await env.DB.prepare(
        `SELECT work_tmdb_id, work_media_type, sort_order FROM person_featured_works
         WHERE tmdb_person_id = ? ORDER BY sort_order ASC`
      ).bind(personId).all();

      const items = await Promise.all(
        (rows || []).map(async (r) => {
          const detail = await _fetchTmdbWorkDetail(r.work_tmdb_id, r.work_media_type);
          return {
            sort_order: r.sort_order,
            tmdb_id: r.work_tmdb_id,
            media_type: r.work_media_type,
            title: detail ? detail.title : null,
            poster_path: detail ? detail.poster_path : null,
          };
        })
      );

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/featured-works-work-search ────────────────
  // 작품 검색: 숫자만 입력하면 tmdb_id로 간주(우리DB 우선 조회 → 없으면
  // TMDB에서 영화/TV 둘 다 시도), 글자면 제목 검색(우리DB 우선 → 부족하면
  // TMDB 검색으로 나머지 채움, 최대 8개).
  if (path === "/admin/persons/featured-works-work-search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: true, items: [] }), { headers });
      }

      // ① 숫자만 입력 — tmdb_id 직접 조회
      if (/^\d+$/.test(q)) {
        const tmdbId = parseInt(q, 10);
        const { results: dbRows } = await env.DB.prepare(
          `SELECT tmdb_id, media_type, COALESCE(title_ko, title_en) AS title, poster_path
           FROM works WHERE tmdb_id = ?`
        ).bind(tmdbId).all();

        const found = new Set((dbRows || []).map((r) => r.media_type));
        const items = [...(dbRows || [])];

        // 우리DB에 없는 타입(영화/TV)은 TMDB에서 추가로 확인
        for (const mt of ["movie", "tv"]) {
          if (found.has(mt)) continue;
          const detail = await _fetchTmdbWorkDetail(tmdbId, mt);
          if (detail) items.push(detail);
        }

        return new Response(JSON.stringify({ ok: true, items }), { headers });
      }

      // ② 제목 검색 — 우리DB 먼저
      const { results: dbRows } = await env.DB.prepare(
        `SELECT tmdb_id, media_type, COALESCE(title_ko, title_en) AS title, poster_path
         FROM works WHERE title_ko LIKE ? OR title_en LIKE ? LIMIT 8`
      ).bind(`%${q}%`, `%${q}%`).all();

      const items = [...(dbRows || [])];
      const seen = new Set(items.map((it) => `${it.tmdb_id}_${it.media_type}`));

      // 부족하면 TMDB 검색(search/multi)으로 나머지 채움
      if (items.length < 8 && TMDB_KEY) {
        try {
          const resp = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=ko-KR&query=${encodeURIComponent(q)}`
          );
          if (resp.ok) {
            const data = await resp.json();
            for (const it of (data.results || [])) {
              if (items.length >= 8) break;
              if (it.media_type !== "movie" && it.media_type !== "tv") continue;
              const title = it.media_type === "movie" ? it.title : it.name;
              if (!title) continue;
              const key = `${it.id}_${it.media_type}`;
              if (seen.has(key)) continue;
              seen.add(key);
              items.push({ tmdb_id: it.id, media_type: it.media_type, title, poster_path: it.poster_path || null });
            }
          }
        } catch (e) { /* TMDB 실패해도 우리DB 결과는 그대로 반환 */ }
      }

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/featured-works-set ────────────────────────
  // 대표작 전체 교체 저장. body: { tmdb_person_id, works: [{tmdb_id, media_type}, ...] }
  // 최대 5개, 배열 순서 그대로 sort_order 1~N 부여. 기존 지정 전부 삭제 후 재삽입.
  if (path === "/admin/persons/featured-works-set" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const personId = parseInt(body.tmdb_person_id);
      const works = Array.isArray(body.works) ? body.works : [];

      if (!personId) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_person_id가 필요해요" }), { status: 400, headers });
      }
      if (works.length > 5) {
        return new Response(JSON.stringify({ ok: false, message: "대표작은 최대 5개까지예요" }), { status: 400, headers });
      }
      for (const w of works) {
        if (!w.tmdb_id || (w.media_type !== "movie" && w.media_type !== "tv")) {
          return new Response(JSON.stringify({ ok: false, message: "작품 정보가 올바르지 않아요" }), { status: 400, headers });
        }
      }

      const person = await env.DB.prepare(`SELECT tmdb_id FROM persons WHERE tmdb_id = ?`).bind(personId).first();
      if (!person) {
        return new Response(JSON.stringify({ ok: false, message: "인물을 찾을 수 없어요" }), { status: 404, headers });
      }

      const stmts = [
        env.DB.prepare(`DELETE FROM person_featured_works WHERE tmdb_person_id = ?`).bind(personId),
      ];
      works.forEach((w, idx) => {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO person_featured_works (tmdb_person_id, work_tmdb_id, work_media_type, sort_order)
             VALUES (?, ?, ?, ?)`
          ).bind(personId, parseInt(w.tmdb_id), w.media_type, idx + 1)
        );
      });
      await env.DB.batch(stmts);

      return new Response(JSON.stringify({ ok: true, tmdb_person_id: personId, count: works.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /person-featured-works/:tmdb_person_id ──────────────────
  // [2026-07-29 신규] 공개(비인증) 조회 — person.html에서 사용. 인증 없음(비로그인 방문자도
  // 호출). 가볍게 tmdb_id/media_type/순서만 반환 — 포스터/제목은 person.html이 이미 갖고
  // 있는 TMDB 크레딧 데이터에서 직접 찾아 쓰므로 여기서 TMDB를 다시 호출하지 않음.
  const publicMatch = path.match(/^\/person-featured-works\/(\d+)$/);
  if (publicMatch && request.method === "GET") {
    try {
      const personId = parseInt(publicMatch[1], 10);
      const { results: rows } = await env.DB.prepare(
        `SELECT work_tmdb_id, work_media_type, sort_order FROM person_featured_works
         WHERE tmdb_person_id = ? ORDER BY sort_order ASC`
      ).bind(personId).all();

      const items = (rows || []).map((r) => ({
        tmdb_id: r.work_tmdb_id,
        media_type: r.work_media_type,
        sort_order: r.sort_order,
      }));

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // [2026-07-31 신규] 인물 관련 영상(person_videos) — 관리자용 3종
  // 인물페이지 랭킹위젯 자리에 노출할 유튜브 영상. 작품페이지 title_videos의
  // youtube_id 추출/중복체크/oEmbed 제목자동조회 패턴을 그대로 재사용.
  // ══════════════════════════════════════════════════════════════

  // ── GET /admin/persons/videos?tmdb_person_id= ────────────────────
  if (path === "/admin/persons/videos" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const personId = parseInt(url.searchParams.get("tmdb_person_id"));
      if (!personId) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_person_id가 필요해요" }), { status: 400, headers });
      }
      const { results } = await env.DB.prepare(
        `SELECT id, youtube_id, title, sort_order, created_at FROM person_videos
         WHERE tmdb_person_id = ? ORDER BY sort_order ASC, created_at ASC`
      ).bind(personId).all();

      return new Response(JSON.stringify({ ok: true, items: results || [] }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/videos-add ────────────────────────────────
  // body: { tmdb_person_id, youtube_url, title? }
  if (path === "/admin/persons/videos-add" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const personId = parseInt(body.tmdb_person_id);
      const youtubeUrl = (body.youtube_url || "").trim();
      let title = (body.title || "").trim();

      if (!personId || !youtubeUrl) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_person_id, youtube_url이 필요해요" }), { status: 400, headers });
      }

      // youtube_id 추출 (title_videos와 동일한 정규식)
      const ytMatch = youtubeUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (!ytMatch) {
        return new Response(JSON.stringify({ ok: false, message: "유효하지 않은 유튜브 URL이에요" }), { status: 400, headers });
      }
      const youtubeId = ytMatch[1];

      const person = await env.DB.prepare(`SELECT tmdb_id FROM persons WHERE tmdb_id = ?`).bind(personId).first();
      if (!person) {
        return new Response(JSON.stringify({ ok: false, message: "인물을 찾을 수 없어요" }), { status: 404, headers });
      }

      // 중복 체크: 같은 인물에 동일 youtube_id가 이미 있는지
      const existing = await env.DB.prepare(
        `SELECT id, title FROM person_videos WHERE tmdb_person_id = ? AND youtube_id = ? LIMIT 1`
      ).bind(personId, youtubeId).first();
      if (existing) {
        return new Response(JSON.stringify({
          ok: false,
          message: `이미 등록된 영상이에요. (제목: "${existing.title || youtubeId}")`,
        }), { status: 409, headers });
      }

      // 제목 비어있으면 유튜브 oEmbed로 자동 조회
      if (!title) {
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`);
          const oembedData = await oembedRes.json();
          title = oembedData.title || "";
        } catch (e) { title = ""; }
      }

      // sort_order = 현재 최대값 + 1 (등록 순서대로 뒤에 붙음)
      const maxRow = await env.DB.prepare(
        `SELECT MAX(sort_order) as maxOrder FROM person_videos WHERE tmdb_person_id = ?`
      ).bind(personId).first();
      const nextOrder = ((maxRow && maxRow.maxOrder) || 0) + 1;

      await env.DB.prepare(
        `INSERT INTO person_videos (tmdb_person_id, youtube_id, title, sort_order) VALUES (?, ?, ?, ?)`
      ).bind(personId, youtubeId, title, nextOrder).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/persons/videos/:id ──────────────────────────────
  const videoDeleteMatch = path.match(/^\/admin\/persons\/videos\/(\d+)$/);
  if (videoDeleteMatch && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id = parseInt(videoDeleteMatch[1], 10);
      await env.DB.prepare(`DELETE FROM person_videos WHERE id = ?`).bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null; // 해당하는 라우트 없음 — index.js가 다음 라우트로 넘어감
}

// ══════════════════════════════════════════════════════════════
// [2026-07-31 신규] 필모그래피 수동 추가(person_manual_credits) — 관리자용 3종 + 공개용 1종.
// TMDB 필모(combined_credits)에 없는 작품을, 우리 DB(works)에 있는 것만 골라 이 인물의
// 필모그래피에 이어붙임. 대표작 자동계산 알고리즘에는 관여하지 않고, 관리자가 대표작으로
// 수동 지정할 때 매칭될 후보 풀(person.html의 allCredits)에만 합류시키는 용도.
// export async function handleAdminPersonManualCredits는 index.js에서 별도 라우팅.
// ══════════════════════════════════════════════════════════════
export async function handleAdminPersonManualCredits(path, request, env, url, headers) {
  // ── GET /admin/persons/manual-credits?tmdb_person_id= ────────────
  if (path === "/admin/persons/manual-credits" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const personId = parseInt(url.searchParams.get("tmdb_person_id"));
      if (!personId) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_person_id가 필요해요" }), { status: 400, headers });
      }
      const { results } = await env.DB.prepare(
        `SELECT pmc.id, pmc.work_tmdb_id, pmc.work_media_type, pmc.credit_kind, pmc.role_text,
                COALESCE(w.title_ko, w.title_en) AS title, w.poster_path
         FROM person_manual_credits pmc
         LEFT JOIN works w ON w.tmdb_id = pmc.work_tmdb_id AND w.media_type = pmc.work_media_type
         WHERE pmc.tmdb_person_id = ? ORDER BY pmc.created_at DESC`
      ).bind(personId).all();

      return new Response(JSON.stringify({ ok: true, items: results || [] }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/manual-credit-work-search?q= ──────────────
  // 우리 DB(works)에 있는 작품만 검색 — TMDB 보완 없음(요청사항: "우리 DB에 있는 작품만")
  if (path === "/admin/persons/manual-credit-work-search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: true, items: [] }), { headers });
      }

      if (/^\d+$/.test(q)) {
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, media_type, COALESCE(title_ko, title_en) AS title, poster_path
           FROM works WHERE tmdb_id = ?`
        ).bind(parseInt(q, 10)).all();
        return new Response(JSON.stringify({ ok: true, items: results || [] }), { headers });
      }

      const { results } = await env.DB.prepare(
        `SELECT tmdb_id, media_type, COALESCE(title_ko, title_en) AS title, poster_path
         FROM works WHERE title_ko LIKE ? OR title_en LIKE ? LIMIT 8`
      ).bind(`%${q}%`, `%${q}%`).all();

      return new Response(JSON.stringify({ ok: true, items: results || [] }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/manual-credits-add ────────────────────────
  // body: { tmdb_person_id, work_tmdb_id, work_media_type, credit_kind('act'|'direct'), role_text }
  if (path === "/admin/persons/manual-credits-add" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const personId  = parseInt(body.tmdb_person_id);
      const workId    = parseInt(body.work_tmdb_id);
      const mediaType = (body.work_media_type || "").trim();
      const kind      = (body.credit_kind || "").trim();
      const roleText  = (body.role_text || "").trim();

      if (!personId || !workId || !mediaType || (kind !== "act" && kind !== "direct")) {
        return new Response(JSON.stringify({ ok: false, message: "필수 항목이 비어있어요" }), { status: 400, headers });
      }

      const work = await env.DB.prepare(
        `SELECT tmdb_id FROM works WHERE tmdb_id = ? AND media_type = ?`
      ).bind(workId, mediaType).first();
      if (!work) {
        return new Response(JSON.stringify({ ok: false, message: "우리 DB에 없는 작품이에요. 작품페이지에서 먼저 등록해주세요." }), { status: 404, headers });
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM person_manual_credits WHERE tmdb_person_id = ? AND work_tmdb_id = ? AND work_media_type = ? LIMIT 1`
      ).bind(personId, workId, mediaType).first();
      if (existing) {
        return new Response(JSON.stringify({ ok: false, message: "이미 추가된 작품이에요." }), { status: 409, headers });
      }

      await env.DB.prepare(
        `INSERT INTO person_manual_credits (tmdb_person_id, work_tmdb_id, work_media_type, credit_kind, role_text)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(personId, workId, mediaType, kind, roleText || null).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/persons/manual-credits/:id ──────────────────────
  const deleteMatch = path.match(/^\/admin\/persons\/manual-credits\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id = parseInt(deleteMatch[1], 10);
      await env.DB.prepare(`DELETE FROM person_manual_credits WHERE id = ?`).bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /person-manual-credits/:tmdb_person_id ────────────────────
  // 공개(비인증) 조회 — person.html에서 사용. works 테이블과 조인해서 카드 렌더에
  // 바로 쓸 수 있는 형태(title/poster_path/release_date/vote_average)로 내려줌.
  const publicCreditsMatch = path.match(/^\/person-manual-credits\/(\d+)$/);
  if (publicCreditsMatch && request.method === "GET") {
    try {
      const personId = parseInt(publicCreditsMatch[1], 10);
      const { results } = await env.DB.prepare(
        `SELECT pmc.work_tmdb_id AS id, pmc.work_media_type AS media_type, pmc.credit_kind, pmc.role_text,
                COALESCE(w.title_ko, w.title_en) AS title, w.poster_path, w.release_date,
                w.release_year, w.tmdb_rating AS vote_average
         FROM person_manual_credits pmc
         JOIN works w ON w.tmdb_id = pmc.work_tmdb_id AND w.media_type = pmc.work_media_type
         WHERE pmc.tmdb_person_id = ?`
      ).bind(personId).all();

      const items = (results || []).map((r) => ({
        id: r.id,
        media_type: r.media_type,
        credit_kind: r.credit_kind, // 'act' | 'direct' — person.html이 cast/crew 병합 시 사용
        title: r.title,
        name: r.title, // TV는 name 필드를 보는 코드도 있어 동일값으로 함께 채움
        poster_path: r.poster_path,
        release_date: r.release_date || (r.release_year ? `${r.release_year}-01-01` : ""),
        first_air_date: r.media_type === "tv" ? (r.release_date || (r.release_year ? `${r.release_year}-01-01` : "")) : "",
        vote_average: r.vote_average,
        character: r.credit_kind === "act" ? (r.role_text || "") : "",
        job: r.credit_kind === "direct" ? (r.role_text || "감독") : "",
      }));

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null; // 해당하는 라우트 없음 — index.js가 다음 라우트로 넘어감
}

// ══════════════════════════════════════════════════════════════
// [2026-07-29 신규] 인물 대표이미지(custom_profile_path) — R2 업로드로 TMDB 사진을
// 관리자가 올린 이미지로 교체. relationship.js의 R2 업로드 패턴(IMAGES 바인딩,
// img.ottrank.kr 서빙)을 그대로 재사용. 값이 있으면 person.html이 TMDB 대신 이걸 씀.
// ══════════════════════════════════════════════════════════════

// ── GET /admin/persons/:tmdb_id/profile-image ────────────────────
// 현재 지정된 대표이미지 URL 조회(없으면 null). "대표작 매칭" 탭에서 인물 선택 시 같이 조회.
export async function handleAdminPersonProfileImage(path, request, env, headers) {
  const m = path.match(/^\/admin\/persons\/(\d+)\/profile-image$/);
  if (!m) return null;
  const tmdbId = parseInt(m[1], 10);

  if (!_checkAuth(request, env)) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
  }

  if (request.method === "GET") {
    try {
      const row = await env.DB.prepare(
        `SELECT custom_profile_path FROM persons WHERE tmdb_id = ?`
      ).bind(tmdbId).first();
      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "인물을 찾을 수 없어요" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true, custom_profile_path: row.custom_profile_path || null }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  if (request.method === "PUT") {
    try {
      const contentType = request.headers.get("Content-Type") || "image/jpeg";
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const key = `profile/${tmdbId}-${Date.now()}.${ext}`;

      const body = await request.arrayBuffer();
      await env.IMAGES.put(key, body, { httpMetadata: { contentType } });

      const publicUrl = `https://img.ottrank.kr/${key}`;
      await env.DB.prepare(
        `UPDATE persons SET custom_profile_path = ? WHERE tmdb_id = ?`
      ).bind(publicUrl, tmdbId).run();

      return new Response(JSON.stringify({ ok: true, custom_profile_path: publicUrl }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  if (request.method === "DELETE") {
    try {
      // R2 파일 자체를 지우진 않음(경로만 알면 되는 단순 구조 — relationship.js처럼
      // 삭제 시점에 key를 따로 안 들고 있어서, 여기선 DB 값만 비움. 용량 부담 크지 않음).
      await env.DB.prepare(
        `UPDATE persons SET custom_profile_path = NULL WHERE tmdb_id = ?`
      ).bind(tmdbId).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ ok: false, message: "Method not allowed" }), { status: 405, headers });
}

// ── GET /person-custom-profile/:tmdb_id ───────────────────────────
// [2026-07-29 신규] 공개(비인증) 조회 — person.html에서 사용. custom_profile_path만 반환.
export async function handlePersonCustomProfilePublic(path, request, env, headers) {
  const m = path.match(/^\/person-custom-profile\/(\d+)$/);
  if (!m || request.method !== "GET") return null;
  try {
    const tmdbId = parseInt(m[1], 10);
    const row = await env.DB.prepare(
      `SELECT custom_profile_path FROM persons WHERE tmdb_id = ?`
    ).bind(tmdbId).first();
    return new Response(JSON.stringify({ ok: true, custom_profile_path: (row && row.custom_profile_path) || null }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
  }
}
