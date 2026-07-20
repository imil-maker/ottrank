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
              kmdb_id, imdb_id, source_url, hidden_fields
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
    const person = await env.DB.prepare(
      `SELECT birthday, gender, place_of_birth FROM persons WHERE tmdb_id = ?`
    )
      .bind(tmdbPersonId)
      .first();

    let manual = null;
    if (person) {
      const hasBirthday = person.birthday && person.birthday !== "";
      const hasGender = !!person.gender;
      const hasPlace = person.place_of_birth && person.place_of_birth !== "";
      if (hasBirthday || hasGender || hasPlace) {
        manual = {
          birthday: hasBirthday ? person.birthday : null,
          gender: hasGender ? person.gender : null,
          place_of_birth: hasPlace ? person.place_of_birth : null,
        };
      }
    }

    // row/person이 둘 다 없어도(캐시·수동값 없음) 정상 응답 — ok:true, data:null, manual:null
    return new Response(JSON.stringify({ ok: true, data, manual }), {
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
