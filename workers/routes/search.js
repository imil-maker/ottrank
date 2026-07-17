/* ══════════════════════════════════════════════════════════════
   검색 관련 API 라우트
   [2026-07-15 신설] videos.js에 있던 /works/search, /works/exists를
   분리 — 검색 기능이 자동완성/인기검색어 등으로 커질 것을 대비해
   별도 파일로 관리.

   GET    /works/search             작품 검색 (공개) — 제목+키워드(한글)+장르 통합검색, 15개 페이징(offset), 년도/평점/OTT순위 포함
   GET    /works/exists             tmdb_id 목록 중 DB 등록 여부 확인 (공개) — 검색결과 TMDB 보충결과 중복필터용
   GET    /works/ott-map            [2026-07-18 신설] tmdb_id 목록 → 각각의 OTT 소속 매핑만 가볍게 반환 (OTT 필터 즉시반응용 사전조회)
   GET    /works/details            [2026-07-18 신설] tmdb_id 목록의 카드 상세정보 반환 (매칭 재실행 없이, 이미 확정된 id들만 조회)
══════════════════════════════════════════════════════════════ */

// [2026-07-17 추가] 사용자 입력을 FTS5 MATCH 문법에 안전하게 쓸 수 있는 쿼리 문자열로 변환.
// 각 단어를 큰따옴표로 감싸서(따옴표 자체가 있으면 "" 로 이스케이프) 특수문자로 인한 문법
// 에러를 막고, 뒤에 *를 붙여 "이 단어로 시작하는 토큰"만 매칭되게 함(=단어 중간 우연매칭 차단).
// 여러 단어를 띄어쓰기로 이으면 FTS5 기본 문법상 AND(전부 만족)로 처리됨.
function _buildFtsQuery(term) {
  const words = term.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return words.map(w => `"${w.replace(/"/g, '""')}"*`).join(" ");
}

// 제목/키워드/장르 매칭 3종 쿼리를 하나의 배열로 묶어서 반환 — env.DB.batch()로 한 번에 실행하기 위함
// (메인 검색과 "관련 작품 추천" 단어별 재검색 양쪽에서 재사용)
// [2026-07-17 수정] 제목매칭을 REPLACE(공백제거)+LIKE 방식에서 FTS5 색인 테이블(works_fts) 기반
// "단어 시작" 매칭으로 교체. 기존 방식은 공백을 지우고 비교하다 보니 서로 다른 두 단어가 우연히
// 붙어서(예: "Dex's Fridge Interview" → "dex'sfridgeinterview") 전혀 상관없는 검색어에 걸리는
// 오검색이 있었음(2026-07-17 "sf" 검색 사고). works_fts는 원문 그대로(공백 유지) 단어 단위로
// 색인되어 있어서, 이런 단어 경계를 넘나드는 우연매칭이 구조적으로 불가능함.
function _dbMatchStatements(env, term, capLimit) {
  const ftsQuery = _buildFtsQuery(term);
  const titleStmt = ftsQuery
    ? env.DB.prepare(`
        SELECT w.tmdb_id FROM works_fts f
        JOIN works w ON w.id = f.rowid
        WHERE works_fts MATCH ?
        LIMIT ?
      `).bind(ftsQuery, capLimit)
    // 공백만 입력하는 등 극단적인 경우 대비 가드 — 매칭 결과 없이 안전하게 빈 배열 반환
    : env.DB.prepare(`SELECT tmdb_id FROM works WHERE 0 LIMIT 0`);

  return [
    titleStmt,
    env.DB.prepare(`
      SELECT DISTINCT wk.tmdb_id
      FROM keyword_translation kt
      CROSS JOIN work_keywords wk ON wk.keyword = kt.keyword_en
      WHERE kt.keyword_ko LIKE ('%' || ? || '%')
         OR kt.keyword_ko_2 LIKE ('%' || ? || '%')
         OR kt.keyword_ko_3 LIKE ('%' || ? || '%')
      LIMIT ?
    `).bind(term, term, term, capLimit),
    env.DB.prepare(`
      SELECT tmdb_id FROM works
      WHERE (',' || REPLACE(genre, ', ', ',') || ',') LIKE ('%,' || ? || ',%')
        AND (adult_flag IS NULL OR adult_flag != 1)
        AND poster_path IS NOT NULL AND poster_path != ''
      ORDER BY (original_language = 'ko') DESC, tmdb_rating DESC
      LIMIT ?
    `).bind(term, capLimit),
  ];
}

// [2026-07-17 삭제] TMDB 서버-서버 직접 호출 함수(_tmdbSearchDirect) — 관련검색(_fetchRelated)에서만
// 쓰였는데, 프론트(search-results.html)가 이미 동일한 검색어로 TMDB 보충 검색을 자체적으로 하고
// 있어서 서버에서 또 호출하는 건 중복이었음. 검색 응답속도 개선을 위해 서버 쪽 TMDB 호출은 제거.

// [2026-07-15 추가, 2026-07-17 단순화] 관련 작품 추천 — 메인 검색 결과가 빈약하고(RELATED_THRESHOLD 미만)
// 검색어가 여러 단어로 쪼개질 때("우울한 하루" → "우울한"/"하루"), 단어별로 우리 DB만 재조회해서
// 메인 결과와 안 겹치는 것만 골라 반환.
// [2026-07-17] 원래는 TMDB도 같이 단어별로 재조회했었는데, 프론트(search-results.html)가 이미
// 동일 검색어로 TMDB 보충 검색을 자체 수행하고 있어 서버 쪽 TMDB 호출은 중복이었음 + TMDB 응답을
// 최대 3초까지 기다리는 구간이라 검색 응답속도(체감 2초 이상)의 가장 큰 원인이었음. 제거 후에는
// 우리 DB 안에서만 빠르게 찾고, TMDB 보충은 전적으로 프론트에 맡긴다(포스터는 즉시, OTT 뱃지는
// 약간 늦게 뜨는 기존 프론트 동작은 그대로 유지되므로 사용자 체감 차이 없음).
async function _fetchRelated(env, words, excludeIds, cap) {
  const perWordCap = 30;
  const dbStatements = words.flatMap(w => _dbMatchStatements(env, w, perWordCap));

  const dbBatchResults = await env.DB.batch(dbStatements);

  const dbIds = new Set();
  dbBatchResults.forEach(r => (r.results || []).forEach(row => dbIds.add(row.tmdb_id)));
  const dbIdList = [...dbIds].filter(id => !excludeIds.has(id));

  let dbDetail = [];
  if (dbIdList.length) {
    const placeholders = dbIdList.map(() => "?").join(",");
    const res = await env.DB.prepare(`
      SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
      FROM works
      WHERE tmdb_id IN (${placeholders})
        AND (adult_flag IS NULL OR adult_flag != 1)
        AND poster_path IS NOT NULL AND poster_path != ''
    `).bind(...dbIdList).all();
    dbDetail = res.results;
  }

  // 정렬: 한국작품 우선(/search/keyword와 동일 원칙) → 평점 내림차순
  dbDetail.sort((a, b) => {
    const ka = a.original_language === "ko" ? 0 : 1;
    const kb = b.original_language === "ko" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return (b.tmdb_rating || 0) - (a.tmdb_rating || 0);
  });

  return dbDetail.slice(0, cap);
}

export async function handleSearch(path, request, env, url, headers) {

  // ── GET /works/search ────────────────────────────────────────
  // 공개 API — 인증 없이 works 검색 가능 (헤더 검색창, 검색결과 페이지 등에서 사용)
  // 2026-07-14 확장: 검색 결과 페이지(search-results.html) 신설에 맞춰 기능 추가
  //   ① 제목(title_ko/title_en) + 키워드(한글) + 장르(한글) 매칭을 합쳐서 검색
  //      - 키워드는 work_keywords(영문, 정규화 테이블)에 저장되어 있어서,
  //        한글 검색어는 keyword_translation.keyword_ko(/ko_2/ko_3)로 먼저 영문 키워드를 찾은 뒤 조인한다.
  //      - 장르(works.genre)는 TMDB를 language=ko-KR로 조회해서 채운 컬럼이라 이미 한글로 저장돼 있음.
  //   ② limit 기본값 10→15, offset 페이징 추가 ("더보기" 버튼용). has_more로 다음 페이지 존재 여부 알려줌
  //   ③ release_year, tmdb_rating 응답에 추가 (기존엔 응답에서 빠져있어 프론트에서 년도 표시가 안 되던 문제)
  //   ④ 오늘자 rankings를 조인해서 이번 페이지에 뜬 작품들의 플랫폼별 순위(ott_ranks)를 같이 내려줌
  //   ④-2 [2026-07-17 추가] work_ott(정규화 캐시 테이블)를 조인해서 "지금 이 작품이 어느 OTT에서
  //        서비스되는지"(ott_keys)도 같이 내려줌 — 예전엔 이걸 몰라서 프론트가 카드마다 TMDB를
  //        실시간으로 물어봤는데(검색결과 로딩이 느려지는 주된 원인이었음), 이제 D1 조인 한 번으로 끝남.
  //        미등록/미수집 작품(work_ott에 아직 없음)은 빈 배열로 내려가고, 이 경우만 프론트가
  //        TMDB 실시간 조회로 보완한다.
  //   ⑤ /search/keyword와 동일하게 성인물(adult_flag=1) 제외
  //   ⑥ 매칭 대상이 과도하게 많아지는 것(흔한 단어 검색 등) 방지 위해 매칭 tmdb_id 상한 100개
  //   ⑦ 포스터 없는 작품은 상세조회 단계에서 미리 제외 — has_more/total이 실제 노출 개수와 항상 일치하도록 함
  //   ⑧ [2026-07-15 추가] total(전체 매칭 개수), capped(100개 상한 도달 여부) 응답에 포함
  //   ⑨ [2026-07-15 추가] 결과가 빈약하고(RELATED_THRESHOLD 미만) 검색어가 여러 단어면,
  //      단어별로 DB+TMDB를 서버에서 병렬 재조회해서 메인 결과(data/total)에 자연스럽게
  //      합침 — "검색결과 0개" 같은 문구로 재검색을 막지 않기 위해 별도 섹션으로 분리하지 않음
  //   ⑩ [2026-07-15 추가] 제목/키워드/장르 매칭 3개 쿼리를 env.DB.batch()로 묶어서 한 번에 실행
  //      (기존엔 순차 await 3번 — D1 왕복 3회였던 걸 1회로 줄여서 검색 응답속도 개선)
  if (path === "/works/search" && request.method === "GET") {
    const q      = url.searchParams.get("q") || "";
    const limit  = Math.min(parseInt(url.searchParams.get("limit") || "15"), 30);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
    // [2026-07-17 추가] OTT별 필터 — work_ott(정규화 캐시 테이블)에 있는 값만 허용.
    // 프론트가 검증 없이 아무 문자열이나 보내도 안전하게 무시되도록 화이트리스트 사용.
    const OTT_KEYS_WHITELIST = ["netflix", "tving", "disney", "coupang", "wavve", "watcha"];
    const ottParam = url.searchParams.get("ott") || "";
    const ottFilter = OTT_KEYS_WHITELIST.includes(ottParam) ? ottParam : "";
    // 2026-07-14 수정: D1은 쿼리 1개당 바인딩 변수 최대 100개 제한이 있음.
    //   흔한 검색어(예: "로맨스")는 매칭 tmdb_id가 300개 가까이 나와서
    //   WHERE tmdb_id IN (...) 300개 바인딩 시 "too many SQL variables" 에러 발생 확인됨.
    //   화면엔 15개씩만 보여주므로 100개로도 충분 — 안전하게 축소.
    const MAX_MATCH_IDS = 100;
    const RELATED_THRESHOLD = 15;
    const MAX_RELATED = 24;

    if (!q.trim()) {
      return new Response(JSON.stringify({ ok: false, message: "q required" }), { status: 400, headers });
    }

    try {
      // ① 제목/키워드/장르 매칭 — 3개 쿼리를 batch()로 한 번에 실행
      const [titleRes, keywordRes, genreRes] = await env.DB.batch(_dbMatchStatements(env, q, MAX_MATCH_IDS));

      // ② 세 결과 합치기 (중복 제거).
      // [2026-07-18 수정] 검색결과 페이지에 "정렬 우선순위 선택(제목/키워드/장르)" 기능을
      // 붙이기 위해, 예전엔 하나로 합쳐져 있던 키워드매칭·장르매칭을 서로 다른 값으로 분리.
      // matchType: 0=제목매칭, 1=키워드매칭, 2=장르매칭, 3=띄어쓰기무시 보조매칭, 4=단어분리 관련매칭
      const matchType = new Map();
      titleRes.results.forEach(r => matchType.set(r.tmdb_id, 0));
      keywordRes.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 1); });
      genreRes.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 2); });

      // [2026-07-17 추가] ②-2 위 세 가지 매칭이 하나도 없을 때만 보조로 "띄어쓰기 무시" 매칭 시도
      // (예: "멜로가체질"로 검색 → 실제 제목 "멜로가 체질"). FTS5(works_fts)는 원문 그대로
      // 단어 단위로 색인돼 있어서 사용자가 띄어쓰기를 다르게 입력하면 못 찾는 경우가 있음.
      // 이 보조 매칭은 matchType=3(최하 순위권)으로만 취급하고, 1~3순위 결과가 하나라도 있으면
      // 아예 실행조차 안 해서 — 과거 "sf" 사고처럼 가짜매칭이 진짜 결과를 밀어낼 여지가 없음.
      if (matchType.size === 0) {
        const qNoSpace = q.replace(/\s+/g, "");
        const { results: fallbackRes } = await env.DB.prepare(`
          SELECT tmdb_id FROM works
          WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
          LIMIT ?
        `).bind(`%${qNoSpace}%`, `%${qNoSpace}%`, MAX_MATCH_IDS).all();
        fallbackRes.forEach(r => matchType.set(r.tmdb_id, 3));
      }

      // capped — MAX_MATCH_IDS(100) 상한에 걸려서 실제로는 더 있는데 여기서부터 이미
      // 잘려나간 경우. 이럴 땐 total이 "정확한 전체 개수"가 아니라 "적어도 이만큼은
      // 있다"는 하한선이라는 걸 프론트에 알려주기 위한 플래그.
      const capped = matchType.size > MAX_MATCH_IDS;
      let allIds = [...matchType.keys()].slice(0, MAX_MATCH_IDS);

      // ①-2 [2026-07-17 추가, 같은 날 재수정] OTT 필터 — work_ott에서 이 OTT로 확인된 것만 남김.
      // 처음엔 "ott_key=? AND tmdb_id IN (매칭된 최대 100개)"로 짰었는데, 매칭 개수가 100개(상한)
      // 꽉 찰 때 바인딩 변수가 101개(ott_key 1 + tmdb_id 100)가 되면서 D1의 바인딩 100개 제한에
      // 걸려 조용히 500 에러가 났음(예외가 잡혀서 프론트엔 "결과 없음"으로만 보였음).
      // tmdb_id를 SQL로 안 넘기고, ott_key 하나만 바인딩해서 그 OTT의 전체 tmdb_id를 받아온 뒤
      // 자바스크립트에서 겹치는 것만 추려내는 방식으로 변경 — 바인딩 변수가 항상 1개뿐이라 안전.
      if (ottFilter && allIds.length) {
        const { results: ottFilterRows } = await env.DB.prepare(`
          SELECT tmdb_id FROM work_ott WHERE ott_key = ?
        `).bind(ottFilter).all();
        const ottIdSet = new Set(ottFilterRows.map(r => r.tmdb_id));
        allIds = allIds.filter(id => ottIdSet.has(id));
      }

      // ③ 상세 정보 조회 (성인물 제외 + 포스터 없는 작품 제외)
      let workRows = [];
      if (allIds.length) {
        const idPlaceholders = allIds.map(() => "?").join(",");
        const res = await env.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
          FROM works
          WHERE tmdb_id IN (${idPlaceholders})
            AND (adult_flag IS NULL OR adult_flag != 1)
            AND poster_path IS NOT NULL AND poster_path != ''
        `).bind(...allIds).all();
        workRows = res.results;
      }

      // ④ [2026-07-15 변경] 결과가 빈약하고 검색어가 여러 단어로 쪼개질 때, 단어별
      //   재검색 결과를 "관련 작품 추천"이라는 별도 섹션이 아니라 메인 결과 자체에
      //   자연스럽게 합친다 — "검색결과 0개"라는 문구가 재검색을 막는 걸 방지하기 위함.
      //   matchType에 4(=검색어 단어분리 매칭)로 표시해서, 정렬 시 정확매칭보다는
      //   뒤로 가되 화면상으로는 구분 없이 하나의 결과 목록으로 보이게 함.
      if (!ottFilter && workRows.length < RELATED_THRESHOLD) {
        const words = [...new Set(q.split(/\s+/).filter(w => w.length >= 2))].slice(0, 3);
        if (words.length >= 2) {
          const related = await _fetchRelated(env, words, new Set(matchType.keys()), MAX_RELATED);
          related.forEach(w => {
            matchType.set(w.tmdb_id, 4);
            workRows.push(w);
          });
        }
      }

      // total — 포스터 필터링 + 관련 작품 병합까지 반영한, 이번 검색어의 최종 노출 개수
      const total = workRows.length;

      // ⑤ 정렬: 제목매칭 우선 → 키워드/장르매칭 → 단어분리 관련매칭 순 → 그 안에서
      //   한국작품 우선(/search/keyword와 동일 원칙) → 평점 내림차순
      workRows.sort((a, b) => {
        const ta = matchType.get(a.tmdb_id) ?? 1;
        const tb = matchType.get(b.tmdb_id) ?? 1;
        if (ta !== tb) return ta - tb;
        const ka = a.original_language === 'ko' ? 0 : 1;
        const kb = b.original_language === 'ko' ? 0 : 1;
        if (ka !== kb) return ka - kb;
        return (b.tmdb_rating || 0) - (a.tmdb_rating || 0);
      });

      // ⑥ 페이징 (offset~offset+limit, 다음 페이지 존재 여부는 전체 길이로 판단)
      const pageRows = workRows.slice(offset, offset + limit);
      const hasMore  = workRows.length > offset + limit;

      // ⑦ 이번 페이지 작품들의 오늘자 플랫폼별 순위(ott_ranks) + 서비스중 OTT(ott_keys) —
      //    [2026-07-17 수정] 서로 관계없는 두 조회인데 예전엔 순서대로 하나씩 기다렸음(fetchOttKeys와
      //    동일한 실수). Promise.all로 동시에 던지도록 변경 — 둘 중 느린 쪽 1번 왕복시간만 걸림.
      let data = [];
      if (pageRows.length) {
        const pageIds = pageRows.map(w => w.tmdb_id);
        const pagePlaceholders = pageIds.map(() => "?").join(",");

        const [{ results: rankRows }, { results: ottRows }] = await Promise.all([
          env.DB.prepare(`
            SELECT tmdb_id, platform, rank
            FROM rankings
            WHERE tmdb_id IN (${pagePlaceholders})
              AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          `).bind(...pageIds).all(),
          env.DB.prepare(`
            SELECT tmdb_id, ott_key FROM work_ott
            WHERE tmdb_id IN (${pagePlaceholders})
          `).bind(...pageIds).all(),
        ]);

        const rankMap = {};
        rankRows.forEach(r => {
          if (!rankMap[r.tmdb_id]) rankMap[r.tmdb_id] = {};
          rankMap[r.tmdb_id][r.platform] = r.rank;
        });

        const ottMap = {};
        ottRows.forEach(r => {
          (ottMap[r.tmdb_id] ||= []).push(r.ott_key);
        });

        data = pageRows.map(w => ({
          ...w,
          ott_ranks: rankMap[w.tmdb_id] || {},
          ott_keys: ottMap[w.tmdb_id] || [],
        }));
      }

      // [2026-07-18 추가] all_ids — 이번 검색어로 매칭된 전체 후보 tmdb_id 목록(정렬된 순서,
      // 페이징 적용 전). 프론트가 화면에 15개만 그린 뒤, 백그라운드로 이 목록 전체에 대해
      // "어느 OTT에 있는지"를 미리 조회(/works/ott-map)해두는 데 사용 — OTT 버튼 클릭 시
      // 서버에 다시 안 물어보고 즉시 반응하기 위한 사전 준비용 목록.
      // match_types — all_ids 각각이 제목(0)/키워드(1)/장르(2)/기타(3,4) 중 뭘로 매칭됐는지.
      // 이미 서버가 계산을 마친 값을 그대로 노출하는 것뿐이라 별도 조회가 필요 없음(OTT와의
      // 차이점 — OTT는 매칭 과정과 무관한 정보라 따로 물어봐야 했지만, 이건 이미 다 알고 있음).
      // 프론트는 "정렬 우선순위(제목/키워드/장르)" 버튼을 눌렀을 때, 서버에 다시 안 물어보고
      // 이 값을 기준으로 기존 순서를 안정정렬(stable)로 그룹만 재배치한다.
      return new Response(JSON.stringify({
        ok: true, data, has_more: hasMore, limit, offset, total, capped,
        all_ids: workRows.map(w => w.tmdb_id),
        match_types: Object.fromEntries(matchType),
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/exists ────────────────────────────────────────
  // 공개 API — tmdb_id 목록을 받아 그중 우리 DB(works)에 이미 등록된 것만 반환
  // 2026-07-14 신설: 검색결과 페이지(search-results.html)가 TMDB 보충 검색 결과를 보여줄 때,
  //   "이미 우리 DB에 등록된 작품인데 이번 검색어로는 안 걸린 것"까지 TMDB 줄거리 매칭으로
  //   새어 들어오는 문제 발견 (예: "닥터 섬보이"가 실제 키워드/제목엔 "공포"가 없는데도
  //   TMDB 검색이 overview의 "공포이자"를 잡아서 "공포" 검색 결과에 섞여 나옴).
  //   이미 등록된 작품은 우리 키워드 시스템이 "관련 없음"으로 이미 판단을 마친 것이므로,
  //   TMDB 보충 결과에서는 무조건 제외한다 — 순수 미등록 신작만 보충 결과로 노출.
  // tmdb_id는 기본키(PK)라 인덱스 조회라 트래픽 부담 거의 없음.
  if (path === "/works/exists" && request.method === "GET") {
    const idsParam = url.searchParams.get("ids") || "";
    const ids = idsParam.split(",").map(s => parseInt(s.trim())).filter(n => Number.isInteger(n)).slice(0, 100);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, existing_ids: [] }), { headers });
    }
    try {
      const placeholders = ids.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id FROM works WHERE tmdb_id IN (${placeholders})
      `).bind(...ids).all();
      return new Response(JSON.stringify({ ok: true, existing_ids: results.map(r => r.tmdb_id) }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/ott-map ────────────────────────────────────────
  // [2026-07-18 신설] 검색결과 페이지의 OTT 필터 즉시반응화용. 특정 tmdb_id 목록에 대해
  // "각각 어느 OTT에 있는지"만 가볍게 반환한다(포스터/평점 등 상세정보는 포함 안 함).
  // 프론트는 검색 완료 후 화면이 이미 뜬 뒤 백그라운드로 이걸 미리 호출해두고,
  // OTT 버튼을 클릭하면 이 매핑을 그대로 써서 서버에 다시 안 물어보고 즉시 필터링한다.
  if (path === "/works/ott-map" && request.method === "GET") {
    const idsParam = url.searchParams.get("tmdb_ids") || "";
    const ids = idsParam.split(",").map(s => parseInt(s.trim())).filter(n => Number.isInteger(n)).slice(0, 100);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, map: {} }), { headers });
    }
    try {
      const placeholders = ids.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, ott_key FROM work_ott WHERE tmdb_id IN (${placeholders})
      `).bind(...ids).all();
      const map = {};
      results.forEach(r => { (map[r.tmdb_id] ||= []).push(r.ott_key); });
      return new Response(JSON.stringify({ ok: true, map }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/details ────────────────────────────────────────
  // [2026-07-18 신설] 특정 tmdb_id 목록의 카드 상세정보(포스터/평점/랭킹뱃지/OTT뱃지)를
  // /works/search와 동일한 형태로 반환. OTT 필터 클릭 시, ott-map으로 이미 알고 있는
  // 작품 중 "아직 카드 정보를 안 받아온 것"만 이걸로 가볍게 보충 조회한다 —
  // 매칭(제목/키워드/장르 검색)을 처음부터 다시 하지 않으므로 /works/search보다 훨씬 가벼움.
  if (path === "/works/details" && request.method === "GET") {
    const idsParam = url.searchParams.get("tmdb_ids") || "";
    const ids = idsParam.split(",").map(s => parseInt(s.trim())).filter(n => Number.isInteger(n)).slice(0, 100);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, data: [] }), { headers });
    }
    try {
      const placeholders = ids.map(() => "?").join(",");
      const { results: workRows } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
        FROM works
        WHERE tmdb_id IN (${placeholders})
          AND (adult_flag IS NULL OR adult_flag != 1)
          AND poster_path IS NOT NULL AND poster_path != ''
      `).bind(...ids).all();

      let data = [];
      if (workRows.length) {
        const foundIds = workRows.map(w => w.tmdb_id);
        const foundPlaceholders = foundIds.map(() => "?").join(",");
        const [{ results: rankRows }, { results: ottRows }] = await Promise.all([
          env.DB.prepare(`
            SELECT tmdb_id, platform, rank
            FROM rankings
            WHERE tmdb_id IN (${foundPlaceholders})
              AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
          `).bind(...foundIds).all(),
          env.DB.prepare(`
            SELECT tmdb_id, ott_key FROM work_ott WHERE tmdb_id IN (${foundPlaceholders})
          `).bind(...foundIds).all(),
        ]);

        const rankMap = {};
        rankRows.forEach(r => {
          if (!rankMap[r.tmdb_id]) rankMap[r.tmdb_id] = {};
          rankMap[r.tmdb_id][r.platform] = r.rank;
        });
        const ottMap = {};
        ottRows.forEach(r => { (ottMap[r.tmdb_id] ||= []).push(r.ott_key); });

        data = workRows.map(w => ({
          ...w,
          ott_ranks: rankMap[w.tmdb_id] || {},
          ott_keys: ottMap[w.tmdb_id] || [],
        }));
      }

      return new Response(JSON.stringify({ ok: true, data }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
