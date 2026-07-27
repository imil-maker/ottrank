// 2026-07-27 rev.3 — person-wiki.js (manual 객체에 display_name 추가 — 예명 등 관리자 수동 지정 이름을 TMDB 자동탐색 이름보다 우선 사용)
// workers/routes/person-wiki.js
// ============================================================
// [2026-07-19 신규] 인물 위키백과 보강 데이터 — 테스트용 최소 버전
//
// 지금은 자동 매칭 로직 없이, person_wiki_cache에 "수동으로 넣어둔 데이터"를
// 그냥 조회만 하는 역할만 함. 자동 매칭/캐시 갱신 로직은 이후 세션에서 별도 설계.
//
// person.html에서 ?wikitest=1 파라미터가 있을 때만 이 API를 호출하도록
// 프론트에서 조건 분기하므로, 이 API 자체는 항상 열려있어도 무해함
// (캐시에 없는 tmdb_person_id는 그냥 data:null만 반환).
//
// index.js의 다른 라우트 모듈과 동일한 시그니처를 사용:
// (path, request, env, url, headers) → Response 반환
// CORS/Content-Type 헤더는 index.js가 이미 만들어서 넘겨줌 (여기서 새로 안 만듦)
// ============================================================

import { _getSessionCookie } from "../utils/authUtils.js";

/**
 * GET /person-wiki/:tmdb_person_id
 * → { ok: true, data: {...} | null, manual: {...} | null }
 *   - data: person_wiki_cache 매칭 데이터(요약/전체이력/수상내역 등). 매칭 없으면 null.
 *   - manual: persons 테이블에 관리자가 직접 채워둔 생년월일/성별/출생지.
 *     [2026-07-20 재수정] 이 세 항목은 평생 거의 안 바뀌는 정보라, 프론트에서
 *     "한 번 확정한 이 값(manual)을 우선 쓰고, manual이 없을 때만 TMDB 값을 쓰는"
 *     방식으로 처리함 — 위키 매칭 여부와 무관하게 항상 조회해서 내려줌.
 */
export async function handlePersonWiki(path, request, env, url, headers) {
  try {
    // /person-wiki/122408 형태에서 마지막 세그먼트를 tmdb_person_id로 사용
    const segments = path.split("/").filter(Boolean);

    // [2026-07-22 신규] POST /person-wiki/:id/like — 좋아요 전용 분기. 마지막 세그먼트가
    // "like"면 그 앞 세그먼트가 tmdb_person_id. 기존 GET 상세조회 로직과 완전히 분리.
    if (request.method === "POST" && segments[segments.length - 1] === "like") {
      const likeId = parseInt(segments[segments.length - 2], 10);
      if (!Number.isInteger(likeId) || likeId <= 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "invalid tmdb_person_id" }),
          { status: 400, headers }
        );
      }
      return await handlePersonLike(likeId, env, headers);
    }

    // [2026-07-22 신규] POST /person-wiki/:id/profile-edit — 사용자 프로필(약력) 수정 제출.
    // 로그인 필요, 제출 즉시 반영 안 됨 — person_profile_edits에 대기(pending) 상태로 쌓이고
    // 관리자가 어드민 "프로필 수정요청" 탭에서 승인해야만 실제 person_wiki_cache.bio_summary에 반영됨.
    if (request.method === "POST" && segments[segments.length - 1] === "profile-edit") {
      const editId = parseInt(segments[segments.length - 2], 10);
      if (!Number.isInteger(editId) || editId <= 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "invalid tmdb_person_id" }),
          { status: 400, headers }
        );
      }
      return await handleProfileEditSubmit(editId, request, env, headers);
    }

    const rawId = segments[segments.length - 1];
    const tmdbPersonId = parseInt(rawId, 10);

    // 방어적 처리 — 숫자가 아니면 400
    if (!Number.isInteger(tmdbPersonId) || tmdbPersonId <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid tmdb_person_id" }),
        { status: 400, headers }
      );
    }

    // Prepared Statement 사용 (SQL 인젝션 방지)
    // [2026-07-20 신규] hidden_fields도 같이 조회 — 어드민 "인물 개별 검색"에서
    // 체크 해제한 항목이 있으면 아래에서 걸러냄
    const row = await env.DB.prepare(
      `SELECT tmdb_person_id, wiki_title, bio_summary, career_history,
              debut_work, debut_year, education, awards_text,
              kmdb_id, imdb_id, source_url, hidden_fields, auto_filmography_text
       FROM person_wiki_cache
       WHERE tmdb_person_id = ?`
    )
      .bind(tmdbPersonId)
      .first();

    // [2026-07-20 신규] 숨김 처리된 항목은 데이터를 지우지 않고 컬럼에만 기록해두는
    // 방식이라(관리자가 다시 체크하면 복구 가능), 여기 공개 API 응답 단계에서
    // 걸러내야 실제로 화면에 안 보이게 됨. 데이터 자체는 D1에 그대로 남아있음.
    let data = row || null;
    if (data) {
      data = { ...data };
      const hidden = (data.hidden_fields || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      delete data.hidden_fields; // 관리용 내부 필드라 공개 응답엔 안 내려줌

      if (hidden.includes("bio_summary")) data.bio_summary = null;
      if (hidden.includes("career_history")) data.career_history = null;
      if (hidden.includes("awards_text")) data.awards_text = null;
      if (hidden.includes("debut_work")) {
        data.debut_work = null;
        data.debut_year = null;
      }
      if (hidden.includes("education")) data.education = null;
      if (hidden.includes("kmdb_id")) data.kmdb_id = null;
      if (hidden.includes("imdb_id")) data.imdb_id = null;
    }

    // [2026-07-20 신규] persons 테이블의 수동 입력값 — 위키 매칭 여부와 무관하게
    // 항상 조회. TMDB에 없는 생년월일/성별/출생지를 관리자가 직접 채워둔 경우
    // (예: 최정규 감독). [2026-07-20 재수정] 프론트에서 이 값을 "우선" 쓰고,
    // 없을 때만 TMDB 값을 쓰도록 처리함 (생년월일 등은 평생 안 바뀌는 정보라서).
    // 값이 하나도 없으면 그냥 manual:null로 내려서 프론트가 신경 안 써도 되게 함.
    // [2026-07-22 추가] like_count도 같이 조회 — 인물 좋아요 숫자, 페이지 로드 시 바로 표시.
    // [2026-07-22 rev.4 추가] poster_badge — 관리자가 수동 지정한 포스터 배지(추모 국화 등).
    // TMDB에 사망일자가 없어도 관리자가 판단해서 배지를 붙일 수 있게 하는 용도.
    // [2026-07-27 추가] display_name — 인물페이지 상단에 크게 뜨는 이름을 관리자가 직접
    // 지정. 화면 이름이 TMDB also_known_as(한글 이름 자동 탐색)에서 바로 가져오는 구조라,
    // 본명이 아니라 활동명(예명)으로 알려진 인물(예: 아이유=이지은)은 자동 탐색 결과가
    // 실제로 통용되는 이름과 다를 수 있음 — 이럴 때만 관리자가 수동으로 덮어씀.
    const person = await env.DB.prepare(
      `SELECT birthday, gender, place_of_birth, like_count, poster_badge, korean_confirmed, display_name FROM persons WHERE tmdb_id = ?`
    )
      .bind(tmdbPersonId)
      .first();

    let manual = null;
    if (person) {
      const hasBirthday = person.birthday && person.birthday !== "";
      const hasGender = !!person.gender;
      const hasPlace = person.place_of_birth && person.place_of_birth !== "";
      const hasBadge = person.poster_badge && person.poster_badge !== "";
      const hasDisplayName = person.display_name && person.display_name !== "";
      if (hasBirthday || hasGender || hasPlace || hasBadge || hasDisplayName) {
        manual = {
          birthday: hasBirthday ? person.birthday : null,
          gender: hasGender ? person.gender : null,
          place_of_birth: hasPlace ? person.place_of_birth : null,
          poster_badge: hasBadge ? person.poster_badge : null,
          display_name: hasDisplayName ? person.display_name : null,
        };
      }
    }

    // [2026-07-22 추가] like_count — persons에 행 자체가 없는 인물(예: TMDB에만 있고 우리
    // DB엔 아직 등록 안 된 경우)은 0으로 내려서, 프론트가 항상 숫자 다루듯 처리할 수 있게 함.
    const likeCount = person && person.like_count != null ? person.like_count : 0;

    // [2026-07-26 신규] korean_confirmed — 필모문장(auto_filmography_text) 노출 여부/방식을
    // 프론트(person.html)와 SSR([id].js)에서 국적별로 분기하는 데 사용. persons 행 자체가
    // 없으면(TMDB에만 있고 우리 DB 미등록) null로 내려서 "미확인"과 동일하게 처리되게 함.
    const koreanConfirmed = person && typeof person.korean_confirmed !== "undefined"
      ? person.korean_confirmed
      : null;

    // row/person이 둘 다 없어도(캐시·수동값 없음) 정상 응답 — ok:true, data:null, manual:null
    return new Response(JSON.stringify({
      ok: true, data, manual, like_count: likeCount, korean_confirmed: koreanConfirmed,
    }), {
      status: 200,
      headers,
    });
  } catch (e) {
    // DB 오류 등 예외 상황 — 500이지만 프론트는 이 실패를 조용히 무시하도록 설계됨
    console.log("[person-wiki] error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: "internal error" }),
      { status: 500, headers }
    );
  }
}

// [2026-07-22 rev.2 추가] 기간별 좋아요 랭킹(오늘/어제/1주일/1개월/1년)을 위한
// 날짜별 집계 저장 — 클릭마다 로그를 한 줄씩 쌓지 않고, "인물+날짜" 조합으로
// 하루치를 하나의 숫자에 뭉쳐서 저장(저장공간 절약, 조회도 가벼움).
// KST(한국시간) 기준 날짜로 통일 — UTC 그대로 쓰면 자정 근처에 하루씩 밀리는
//버그가 생기는 걸 이 프로젝트에서 이미 몇 번 겪었음(로그인 적립/마이페이지 날짜 등).
function kstDateString(offsetDays = 0) {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400000);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * POST /person-wiki/:tmdb_person_id/like
 * [2026-07-22 신규] 인물페이지 하트 좋아요 — 로그인/횟수 제한 없음(관리자님 결정,
 * "많이 눌러도 좋다"). 버튼이 클릭당 2초간 비활성화되는 프론트 쪽 구조 덕분에
 * 한 브라우저에서 초당 여러 번 요청이 쏟아지는 일은 자연스럽게 방지됨.
 * persons에 아직 행이 없는 인물(TMDB에만 있고 우리 DB 미등록)이어도 좋아요를 누르면
 * 그 순간 최소한의 행(tmdb_id + like_count)을 새로 만듦 — 다른 컬럼(name 등)은 건드리지
 * 않고 그대로 NULL로 둠(나중에 인물수집/백필 배치가 채움).
 * → { ok:true, like_count: N }
 */
async function handlePersonLike(tmdbPersonId, env, headers) {
  try {
    await env.DB.prepare(
      `INSERT INTO persons (tmdb_id, like_count) VALUES (?, 1)
       ON CONFLICT(tmdb_id) DO UPDATE SET like_count = COALESCE(like_count, 0) + 1`
    ).bind(tmdbPersonId).run();

    // [2026-07-22 rev.2 추가] 기간별 랭킹용 날짜별 집계도 같이 기록
    const today = kstDateString();
    await env.DB.prepare(
      `INSERT INTO person_like_daily (tmdb_id, like_date, count) VALUES (?, ?, 1)
       ON CONFLICT(tmdb_id, like_date) DO UPDATE SET count = count + 1`
    ).bind(tmdbPersonId, today).run();

    const row = await env.DB.prepare(
      `SELECT like_count FROM persons WHERE tmdb_id = ?`
    ).bind(tmdbPersonId).first();

    return new Response(
      JSON.stringify({ ok: true, like_count: row?.like_count || 0 }),
      { status: 200, headers }
    );
  } catch (e) {
    console.log("[person-wiki] like error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: "internal error" }),
      { status: 500, headers }
    );
  }
}

/**
 * POST /person-wiki/:tmdb_person_id/profile-edit
 * [2026-07-22 신규] 사용자 프로필(약력) 수정 제출 — 로그인 필요.
 * body: { bio: "새로 쓸 약력 내용" }
 * 제출 즉시 반영되지 않음 — person_profile_edits에 대기(pending)로 쌓이고,
 * 어드민 "프로필 수정요청" 탭에서 관리자가 승인해야만 실제 반영됨.
 * 로그인 확인은 user.js의 다른 로그인 필요 엔드포인트들과 동일한 방식
 * (Authorization 헤더의 Bearer 세션ID 또는 쿠키 → sessions 테이블 조회).
 * → { ok:true } | { ok:false, message:"로그인 필요" | "세션 만료" | ... }
 */
async function handleProfileEditSubmit(tmdbPersonId, request, env, headers) {
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

    const body = await request.json().catch(() => ({}));
    const newBio = (body.bio || "").trim();
    if (!newBio) {
      return new Response(JSON.stringify({ ok: false, message: "내용을 입력해주세요" }), { status: 400, headers });
    }
    // 너무 긴 제출 방지(악의적 대용량 텍스트 등) — 약력 성격상 이 정도면 충분히 넉넉함
    if (newBio.length > 2000) {
      return new Response(JSON.stringify({ ok: false, message: "2000자 이내로 작성해주세요" }), { status: 400, headers });
    }

    // 비교용으로 지금 저장돼 있는 약력을 같이 남겨둠(관리자 승인화면에서 기존/신규 나란히 비교)
    const cache = await env.DB.prepare(
      `SELECT bio_summary FROM person_wiki_cache WHERE tmdb_person_id = ?`
    ).bind(tmdbPersonId).first();
    const oldBio = cache?.bio_summary || "";

    await env.DB.prepare(
      `INSERT INTO person_profile_edits (tmdb_id, user_id, old_bio, new_bio, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).bind(tmdbPersonId, session.user_id, oldBio, newBio).run();

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    console.log("[person-wiki] profile-edit error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: "internal error" }),
      { status: 500, headers }
    );
  }
}
