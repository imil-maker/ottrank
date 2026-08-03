/* 2026-08-03 rev.9 — search.js (/persons/search 응답에 job_manual 추가 — 헤더 검색 드롭다운이
   배우/감독 자동판별 대신 관리자 수동입력 직업을 우선 표시할 수 있도록 함) */
/* 2026-08-02 rev.8 — search.js (OTT 미서비스 작품 감점(-7점) 신설 — work_ott에 등록이 하나도
   없는 작품은 총점에서 7점 차감. work_ott 전체 tmdb_id를 쿼리 1번으로 미리 가져와서 후보별로
   따로 조회하지 않으므로 속도 영향 없음. 100개 컷 전 시점(scoreMap 계산)에서 반영) */
/* 2026-08-02 rev.7 — search.js (한국작품 장르매칭 가산점 신설 — 키워드 태그가 없어 장르점수만
   받는 한국작품이, 키워드+장르 둘 다 태그된 해외작품에 밀려 CANDIDATE_CAP(100개) 밖으로
   통째로 잘려나가던 문제 수정. 장르매칭 시 원어(original_language)를 같이 조회해서, 한국작품이면
   장르점수(5점)에 2.2배(11점) 가산 — 100개로 추리기 전 시점에 반영해서 애초에 컷 밖으로
   안 밀리게 함. scoreMap 계산 한 곳만 고치면 최종 정렬/정렬버튼 카테고리까지 자동 반영됨) */
/* 2026-08-02 rev.6 — search.js (검색결과 순위배지 오표시 버그 수정 — 한 작품이 넷플릭스
   한국/월드 등 여러 카테고리에 동시에 순위가 있을 때, 정렬 기준 없이 마지막에 조회된 행이
   그냥 남아서 낮은 순위(예: 월드10위)가 높은 순위(한국1위) 대신 표시되던 문제. rankings.js의
   /rankings/platforms-batch와 동일하게 MIN(rank)+GROUP BY로 항상 최고 순위만 남도록 수정.
   /works/search 응답 2곳(페이지 조회, exists류 조회) 전부 동일하게 수정) */
/* 2026-07-30 rev.5 — search.js (키워드 매칭 부분일치→앞글자일치 복원 — "일드"가 "하드보일드"에
   걸리는 우연한 오매칭 수정. "일본공포"류 붙여쓴 키워드는 유사어 슬롯으로 개별 보완 필요) */
/* ══════════════════════════════════════════════════════════════
   검색 관련 API 라우트
   [2026-07-15 신설] videos.js에 있던 /works/search, /works/exists를
   분리 — 검색 기능이 자동완성/인기검색어 등으로 커질 것을 대비해
   별도 파일로 관리.

   GET    /works/search             작품 검색 (공개) — 제목+키워드(한글)+장르 점수제 통합검색, 15개 페이징(offset), 년도/평점/OTT순위 포함
                                     [2026-07-22 변경] 여러 단어 검색 시 키워드/장르가 반영 안 되던 문제 수정 —
                                     제목 완전일치=10점, 키워드 매칭 단어당 6점, 장르 매칭 단어당 5점을 합산해
                                     총점 내림차순으로 정렬 (§ 아래 /works/search 핸들러 주석 참고)
   GET    /persons/search           [2026-07-21 신설] 인물 이름 검색 (공개) — name_ko(한글)+name(TMDB 원본,주로 영어)
                                     앞부분 일치, 인기도순, 10개 페이징(offset). TMDB 실시간 조회 없이 persons 테이블만 조회(가벼움).
   GET    /works/exists             tmdb_id 목록 중 DB 등록 여부 확인 (공개) — 검색결과 TMDB 보충결과 중복필터용
   GET    /works/ott-map            [2026-07-18 신설] tmdb_id 목록 → 각각의 OTT 소속 매핑만 가볍게 반환 (OTT 필터 즉시반응용 사전조회)
   GET    /works/details            [2026-07-18 신설] tmdb_id 목록의 카드 상세정보 반환 (매칭 재실행 없이, 이미 확정된 id들만 조회)
   POST   /search-log               [2026-07-18 신설] 검색결과 페이지 도착 시 검색어 기록 (관리자 검색어 로그용, 자동완성 제외)
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

// [2026-07-21 추가] 사용자 입력을 LIKE 문법에 안전하게 쓸 수 있도록 와일드카드 문자(%, _)와
// 이스케이프 문자(\) 자체를 이스케이프. 인물 이름 검색(name_ko/name 앞부분 일치)에서 사용 —
// 이걸 안 하면 사용자가 "%"나 "_"를 입력했을 때 의도치 않게 전체/한글자 매칭으로 새는 문제가 생김.
function _escapeLikeTerm(term) {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// [2026-07-22 추가] 검색어를 "채점용 단어" 목록으로 쪼갠다 — 키워드/장르 점수 계산에 사용.
// 조사 등 1글자 우연매칭을 막기 위해 2글자 이상만 채택하고, 중복 단어는 한 번만 센다.
// 단어를 무한정 받으면 쿼리가 과도하게 늘어나므로 최대 5개까지만 사용.
function _splitScoreWords(term) {
  const seen = new Set();
  const words = [];
  for (const w of term.trim().split(/\s+/)) {
    if (w.length >= 2 && !seen.has(w)) {
      seen.add(w);
      words.push(w);
      if (words.length >= 5) break;
    }
  }
  return words;
}

// [2026-07-22 추가] 제목 매칭(10점) 쿼리 2종을 배열로 반환.
// ① FTS5(works_fts) 단어 시작 매칭 — 검색어의 모든 단어가 제목에 순서 상관없이 다 포함되면 매칭.
//    [2026-07-17] "sf" 사고 이후 안전하게 쓰고 있는 기존 방식 그대로 유지.
// ② 띄어쓰기 무시 부분일치 — 예: "멜로가체질"로 검색해도 실제 제목 "멜로가 체질"과 매칭.
//    [2026-07-22] 원래는 "다른 매칭이 하나도 없을 때만" 쓰는 최후 보조수단(matchType=3)이었는데,
//    이제 점수제 도입하면서 정식 10점 매칭으로 승격. 다만 이 방식은 부분일치(LIKE)라 "sf" 사고처럼
//    우연히 단어 경계를 넘나드는 오매칭 위험이 있어서, 검색어(공백 제거 기준) 4글자 미만이면
//    아예 실행하지 않는 안전장치를 둠 — 4글자 이상은 우연히 겹칠 확률이 사실상 없음.
function _titleMatchStatements(env, term) {
  const ftsQuery = _buildFtsQuery(term);
  const ftsStmt = ftsQuery
    ? env.DB.prepare(`
        SELECT w.tmdb_id FROM works_fts f
        JOIN works w ON w.id = f.rowid
        WHERE works_fts MATCH ?
        LIMIT 300
      `).bind(ftsQuery)
    : env.DB.prepare(`SELECT tmdb_id FROM works WHERE 0 LIMIT 0`);

  const noSpace = term.replace(/\s+/g, "");
  const noSpaceStmt = noSpace.length >= 4
    ? env.DB.prepare(`
        SELECT tmdb_id FROM works
        WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
        LIMIT 300
      `).bind(`%${noSpace}%`, `%${noSpace}%`)
    : env.DB.prepare(`SELECT tmdb_id FROM works WHERE 0 LIMIT 0`);

  return [ftsStmt, noSpaceStmt];
}

// [2026-07-22 추가] 단어 하나에 대한 키워드(6점)/장르(5점) 매칭 쿼리 2종을 배열로 반환.
// _splitScoreWords로 쪼갠 단어마다 각각 호출해서 몇 개 단어가 맞았는지 세는 데 사용.
//
// [2026-07-30 수정] 키워드 매칭을 부분일치(%검색어%) → 앞글자 일치(검색어%)로 변경.
// 배경: "일드" 검색 시 "하드보일드"(단어 중간에 우연히 "일드"가 낀 경우)까지 걸리는 오매칭
// 발견 — "행복"→"상행복종" 같은 케이스도 동일 원리로 걸러야 함이 확인되어 원칙을 "앞글자부터
// 시작하는 것만 매칭"으로 복원함(원래 원칙, 7/15에 "일본공포" 같은 붙여쓴 키워드를 잡으려고
// 잠시 부분일치로 풀어놨었음). "일본공포"류는 이제 이 방식으로 못 잡으므로, 필요하면 유사어
// 슬롯(keyword_ko_2/3)에 띄어쓴 버전("일본 공포")을 개별 등록해서 보완하는 방식으로 대응.
function _keywordGenreStatements(env, word, capLimit) {
  return [
    env.DB.prepare(`
      SELECT DISTINCT wk.tmdb_id
      FROM keyword_translation kt
      CROSS JOIN work_keywords wk ON wk.keyword = kt.keyword_en
      WHERE kt.keyword_ko LIKE (? || '%')
         OR kt.keyword_ko_2 LIKE (? || '%')
         OR kt.keyword_ko_3 LIKE (? || '%')
      LIMIT ?
    `).bind(word, word, word, capLimit),
    env.DB.prepare(`
      SELECT tmdb_id, original_language FROM works
      WHERE (',' || REPLACE(genre, ', ', ',') || ',') LIKE ('%,' || ? || ',%')
        AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
        AND poster_path IS NOT NULL AND poster_path != ''
      LIMIT ?
    `).bind(word, capLimit),
  ];
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
  //   ③ release_year, tmdb_rating 응답에 추가
  //   ④ 오늘자 rankings를 조인해서 이번 페이지에 뜬 작품들의 플랫폼별 순위(ott_ranks)를 같이 내려줌
  //   ④-2 work_ott(정규화 캐시 테이블)를 조인해서 "지금 이 작품이 어느 OTT에서 서비스되는지"(ott_keys)도
  //        같이 내려줌 — 미등록/미수집 작품은 빈 배열로 내려가고, 이 경우만 프론트가 TMDB로 보완한다.
  //   ⑤ /search/keyword와 동일하게 성인물(adult_flag=1,2) 제외
  //   ⑥ 상세조회 단계 진입 후보 상한 100개(D1 바인딩 변수 100개 제한 때문 — §CANDIDATE_CAP 참고)
  //   ⑦ 포스터 없는 작품은 상세조회 단계에서 미리 제외 — has_more/total이 실제 노출 개수와 항상 일치하도록 함
  //   ⑧ total(전체 매칭 개수), capped(상한 도달 여부) 응답에 포함
  //   ⑨ [2026-07-30 추가] release_dates(all_ids별 개봉일 맵) 응답에 포함 — 검색결과 페이지
  //      "날짜순" 정렬 버튼용, 추가 쿼리 없이 기존 상세조회 결과 재사용
  //   ⑩ [2026-07-30 추가, 테스트 단계] 검색어가 "스파이더맨"이고 제목매칭 2개 이상이면 그
  //      작품들만 개봉일 최신순으로 최상단에 우선 배치 (다른 검색어는 영향 없음, 추후 어드민
  //      관리 단어 목록으로 확장 예정)
  //
  //   [2026-07-22 전면 개편] 여러 단어 검색 시 키워드/장르가 사실상 반영이 안 되던 문제 수정.
  //   기존엔 "제목/키워드/장르" 중 어느 하나로 통짜 매칭을 먼저 시도하고, 결과가 빈약할 때만
  //   보조로 단어를 쪼개 재검색하는 2단계 구조였음 — 그런데 "섹시 로맨틱 코미디"처럼 실제 제목/
  //   키워드 문구와 정확히 일치할 리 없는 다중 단어 검색어는 항상 보조 단계로 넘어갔고, 그 보조
  //   단계는 "몇 단어가 맞았는지"는 안 따지고 평점순으로만 줄을 세워서, 단어 하나만 우연히 맞은
  //   작품(예: "코미디" 장르인 키즈물)이 평점 덕에 맨 위로 올라오는 문제가 있었음.
  //   → 처음부터 검색어를 단어로 쪼개서 "제목 완전일치=10점 / 키워드 매칭 단어당 6점 /
  //     장르 매칭 단어당 5점"을 합산하는 점수제로 교체. 여러 단어가 맞을수록, 그리고 제목보다
  //     키워드+장르 복수매칭이 더 셀수록 위로 올라오게 됨(예: 키워드 2개 매칭=12점이 제목
  //     완전일치=10점보다 위). 상세 배점 근거는 세션 대화 참고.
  if (path === "/works/search" && request.method === "GET") {
    const q      = url.searchParams.get("q") || "";
    const limit  = Math.min(parseInt(url.searchParams.get("limit") || "15"), 30);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
    // [2026-07-17 추가] OTT별 필터 — work_ott(정규화 캐시 테이블)에 있는 값만 허용.
    // 프론트가 검증 없이 아무 문자열이나 보내도 안전하게 무시되도록 화이트리스트 사용.
    const OTT_KEYS_WHITELIST = ["netflix", "tving", "disney", "coupang", "wavve", "watcha"];
    const ottParam = url.searchParams.get("ott") || "";
    const ottFilter = OTT_KEYS_WHITELIST.includes(ottParam) ? ottParam : "";
    // D1은 쿼리 1개당 바인딩 변수 최대 100개 제한이 있음. 상세조회 단계(WHERE tmdb_id IN (...))가
    // 이 상한에 걸리므로, 점수 계산까지 마친 뒤 "점수 높은 순으로 최대 100개"만 상세조회한다.
    const CANDIDATE_CAP = 100;
    // 단어 하나당(키워드/장르 매칭) 조회 상한 — 흔한 단어("코미디" 등) 검색 시 과도한 로우 방지.
    const WORD_MATCH_CAP = 200;
    // 배점표 — 세션에서 합의한 값. 제목 완전일치 10점, 키워드/장르는 매칭된 단어 개수만큼 누적.
    const SCORE_TITLE = 10;
    const SCORE_KEYWORD_PER_WORD = 6;
    const SCORE_GENRE_PER_WORD = 5;
    // [2026-08-02 신규] 한국작품 장르매칭 가산 배율 — 키워드 태그가 안 달려있어서 장르점수(5점)만
    // 받는 한국작품이, 키워드+장르 둘 다 태그된 해외작품(6+5=11점)에 밀려 CANDIDATE_CAP(100개)
    // 밖으로 통째로 잘려나가는 문제를 막기 위함. 5점 × 2.2 = 11점으로, 키워드+장르 둘 다
    // 걸린 작품과 동급 경쟁이 가능해짐.
    const GENRE_KOREAN_MULTIPLIER = 2.2;
    // [2026-08-02 신규] 지금 어느 OTT에서도 서비스 중이지 않은 작품 감점 — work_ott(정규화
    // 캐시 테이블)에 등록이 하나도 없으면 총점에서 7점을 뺀다.
    const OTT_MISSING_PENALTY = -7;

    if (!q.trim()) {
      return new Response(JSON.stringify({ ok: false, message: "q required" }), { status: 400, headers });
    }

    try {
      // ① 채점용 단어 쪼개기(2글자 이상, 최대 5개) + 제목/키워드/장르 쿼리를 전부 batch()로 한 번에 실행
      const scoreWords = _splitScoreWords(q);
      const titleStmts = _titleMatchStatements(env, q);
      const kgStmts = scoreWords.flatMap(w => _keywordGenreStatements(env, w, WORD_MATCH_CAP));
      // [2026-08-02 신규] OTT 미서비스 감점(-7점)용 — work_ott에 있는 tmdb_id 전체를 한 번에 가져옴
      // (후보마다 따로 조회하지 않고 쿼리 1번으로 끝내서 속도 영향 없게 함)
      const ottAllStmt = env.DB.prepare("SELECT DISTINCT tmdb_id FROM work_ott");
      const [titleFtsRes, titleNoSpaceRes, ottAllRes, ...kgResults] =
        await env.DB.batch([...titleStmts, ottAllStmt, ...kgStmts]);
      const hasOttSet = new Set(ottAllRes.results.map(r => r.tmdb_id));

      // ② 제목 매칭 집합(FTS 단어시작 매칭 ∪ 띄어쓰기무시 부분일치 — 둘 다 10점 취급)
      const titleHit = new Set();
      titleFtsRes.results.forEach(r => titleHit.add(r.tmdb_id));
      titleNoSpaceRes.results.forEach(r => titleHit.add(r.tmdb_id));

      // ③ 키워드/장르는 단어별로 몇 개 단어가 맞았는지 센다
      const keywordCount = new Map();
      const genreCount = new Map();
      const genreKoreanSet = new Set(); // 장르매칭된 후보 중 한국작품(original_language='ko') — 가산점 대상
      scoreWords.forEach((w, i) => {
        kgResults[i * 2].results.forEach(r => keywordCount.set(r.tmdb_id, (keywordCount.get(r.tmdb_id) || 0) + 1));
        kgResults[i * 2 + 1].results.forEach(r => {
          genreCount.set(r.tmdb_id, (genreCount.get(r.tmdb_id) || 0) + 1);
          if (r.original_language === 'ko') genreKoreanSet.add(r.tmdb_id);
        });
      });

      // ④ 총점 계산 + "정렬 우선순위(제목/키워드/장르)" 버튼용 대표 카테고리 계산.
      //    대표 카테고리는 세 항목 중 이번 작품의 점수 기여가 가장 큰 쪽(동점이면 제목>키워드>장르 순).
      //    category: 0=제목, 1=키워드, 2=장르 — 프론트(search-results.html)의 activePriority 값과 그대로 매핑.
      const scoreMap = new Map();
      const categoryMap = new Map();
      const candidateIds = new Set([...titleHit, ...keywordCount.keys(), ...genreCount.keys()]);
      candidateIds.forEach(id => {
        const titleScore = titleHit.has(id) ? SCORE_TITLE : 0;
        const keywordScore = (keywordCount.get(id) || 0) * SCORE_KEYWORD_PER_WORD;
        let genreScore = (genreCount.get(id) || 0) * SCORE_GENRE_PER_WORD;
        if (genreKoreanSet.has(id)) genreScore *= GENRE_KOREAN_MULTIPLIER; // 한국작품 장르매칭 가산
        let total = titleScore + keywordScore + genreScore;
        if (!hasOttSet.has(id)) total += OTT_MISSING_PENALTY; // 지금 서비스 중인 OTT가 하나도 없으면 감점
        scoreMap.set(id, total);

        let category = 0, best = titleScore;
        if (keywordScore > best) { best = keywordScore; category = 1; }
        if (genreScore > best) { best = genreScore; category = 2; }
        categoryMap.set(id, category);
      });

      // capped — 후보가 CANDIDATE_CAP(100)보다 많아서 상세조회 단계 진입 전에 이미 잘려나간 경우.
      // 이럴 땐 total이 "정확한 전체 개수"가 아니라 "적어도 이만큼은 있다"는 하한선.
      const capped = candidateIds.size > CANDIDATE_CAP;
      let allIds = [...candidateIds]
        .sort((a, b) => scoreMap.get(b) - scoreMap.get(a))
        .slice(0, CANDIDATE_CAP);

      // ⑤ OTT 필터 — work_ott에서 이 OTT로 확인된 것만 남김. tmdb_id를 SQL로 안 넘기고
      //    ott_key 하나만 바인딩해서 전체 tmdb_id를 받아온 뒤 자바스크립트에서 겹치는 것만 추림
      //    (바인딩 변수 100개 제한 회피 — 2026-07-17에 확인된 사고 재발 방지).
      if (ottFilter && allIds.length) {
        const { results: ottFilterRows } = await env.DB.prepare(`
          SELECT tmdb_id FROM work_ott WHERE ott_key = ?
        `).bind(ottFilter).all();
        const ottIdSet = new Set(ottFilterRows.map(r => r.tmdb_id));
        allIds = allIds.filter(id => ottIdSet.has(id));
      }

      // ⑥ 상세 정보 조회 (성인물 제외 + 포스터 없는 작품 제외)
      let workRows = [];
      if (allIds.length) {
        const idPlaceholders = allIds.map(() => "?").join(",");
        const res = await env.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, release_date, tmdb_rating, original_language
          FROM works
          WHERE tmdb_id IN (${idPlaceholders})
            AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
            AND poster_path IS NOT NULL AND poster_path != ''
        `).bind(...allIds).all();
        workRows = res.results;
      }

      // total — 포스터 필터링까지 반영한, 이번 검색어의 최종 노출 개수
      const total = workRows.length;

      // ⑦ 정렬: 총점 내림차순 → 한국작품 우선(/search/keyword와 동일 원칙) → 평점 내림차순
      //
      //   [2026-07-30 추가, 테스트 단계] "스파이더맨"처럼 제목매칭 작품이 2개 이상이면(=시리즈/
      //   프랜차이즈 검색) 그 제목매칭 작품들만 개봉일 최신순(내림차순)으로 맨 앞에 먼저 배치.
      //   (예: 스파이더맨 최신편 → ... → 1편 순으로 먼저 나오고, 그 아래에 키워드/장르로만
      //   걸린 나머지 작품들이 기존 점수순으로 이어짐)
      //
      //   ⚠️ 지금은 검증 단계라 검색어가 정확히 "스파이더맨"일 때만 이 규칙이 동작하도록
      //   임시로 고정해뒀다 — 그 외 모든 검색어는 이 조건에 안 걸려서 기존 방식(점수순) 그대로
      //   영향 없음. 나중에 관리자가 어드민 화면에서 이런 "시리즈 정렬 적용 단어"를 직접 등록/
      //   관리하는 기능으로 교체할 예정 (별도 테이블 + 어드민 UI 필요, 다음 단계에서 진행).
      const seriesTestWords = ["스파이더맨"]; // TODO: 어드민에서 관리하는 목록으로 교체 예정
      const seriesMode = seriesTestWords.includes(q.trim()) && titleHit.size >= 2;
      workRows.sort((a, b) => {
        if (seriesMode) {
          const aTitle = titleHit.has(a.tmdb_id);
          const bTitle = titleHit.has(b.tmdb_id);
          if (aTitle !== bTitle) return aTitle ? -1 : 1; // 제목매칭 작품을 항상 먼저
          if (aTitle && bTitle) {
            const da = a.release_date || '';
            const db = b.release_date || '';
            if (da && !db) return -1;
            if (!da && db) return 1;
            if (da && db && da !== db) return da < db ? 1 : -1; // 최신 개봉일 먼저
            // 둘 다 없거나 날짜가 같으면 아래 기존 기준으로 폴백
          }
        }
        const sa = scoreMap.get(a.tmdb_id) || 0;
        const sb = scoreMap.get(b.tmdb_id) || 0;
        if (sa !== sb) return sb - sa;
        const ka = a.original_language === 'ko' ? 0 : 1;
        const kb = b.original_language === 'ko' ? 0 : 1;
        if (ka !== kb) return ka - kb;
        return (b.tmdb_rating || 0) - (a.tmdb_rating || 0);
      });

      // ⑧ 페이징 (offset~offset+limit, 다음 페이지 존재 여부는 전체 길이로 판단)
      const pageRows = workRows.slice(offset, offset + limit);
      const hasMore  = workRows.length > offset + limit;

      // ⑨ 이번 페이지 작품들의 오늘자 플랫폼별 순위(ott_ranks) + 서비스중 OTT(ott_keys) —
      //    서로 관계없는 두 조회라 Promise.all로 동시에 던짐(느린 쪽 1번 왕복시간만 걸림).
      let data = [];
      if (pageRows.length) {
        const pageIds = pageRows.map(w => w.tmdb_id);
        const pagePlaceholders = pageIds.map(() => "?").join(",");

        const [{ results: rankRows }, { results: ottRows }] = await Promise.all([
          env.DB.prepare(`
            SELECT tmdb_id, platform, MIN(rank) as rank
            FROM rankings
            WHERE tmdb_id IN (${pagePlaceholders})
              AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
              AND NOT (platform = 'netflix' AND category_slot = 'category10')
            GROUP BY tmdb_id, platform
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

      // all_ids — 이번 검색어로 매칭된 전체 후보 tmdb_id 목록(점수순 정렬, 페이징 적용 전).
      // 프론트가 화면에 15개만 그린 뒤, 백그라운드로 이 목록 전체에 대해 "어느 OTT에 있는지"를
      // 미리 조회(/works/ott-map)해두는 데 사용.
      // match_types — all_ids 각각의 대표 매칭 카테고리(0=제목/1=키워드/2=장르). 프론트는
      // "정렬 우선순위" 버튼을 눌렀을 때 서버에 다시 안 물어보고 이 값 기준으로 그룹만 재배치한다.
      // release_dates — [2026-07-30 추가] all_ids 각각의 개봉일/방영일(works.release_date, 이미
      // 이번 조회에서 같이 가져온 값이라 추가 조회 없음). "날짜순" 정렬 버튼용 — 우리 DB 작품은
      // 이미 개봉일이 다 채워져 있으므로 별도 API 호출 없이 이 맵만으로 프론트에서 즉시 정렬 가능.
      // 값이 없으면(구작 중 미확인) null — 프론트에서 맨 뒤로 보낸다.
      return new Response(JSON.stringify({
        ok: true, data, has_more: hasMore, limit, offset, total, capped,
        all_ids: workRows.map(w => w.tmdb_id),
        match_types: Object.fromEntries(categoryMap),
        release_dates: Object.fromEntries(workRows.map(w => [w.tmdb_id, w.release_date || null])),
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /persons/search ──────────────────────────────────────
  // [2026-07-21 신설] 공개 API — 검색결과 페이지 하단 "인물" 섹션용.
  //   ① name_ko(한글 대표이름) + name(TMDB 원본, 배우에 따라 영어인 경우 많음) 둘 다 대상으로
  //      "앞부분 일치" 검색 (예: "김정" → "김정○"만 걸리고 "이김정수"처럼 중간에 있는 건 제외)
  //   ② TMDB 실시간 조회 없이 persons 테이블만 조회 — 매 검색마다 호출돼도 가볍도록 설계
  //   ③ 인기도(popularity) 내림차순 정렬, 10개씩 페이징(offset), 더보기 지원
  //   ④ total(전체 개수)은 따로 세지 않음 — limit보다 1개 더 가져와서 있으면 has_more=true로만 판단
  //      (COUNT 쿼리 한 번 더 안 도는 만큼 가벼움. 화면엔 "총 N명"을 안 보여주므로 필요도 없음)
  //   ⑤ 화면에 보여줄 이름은 name_ko가 있으면 그걸, 없으면(아직 미채움) name(영어 등)을 그대로 사용
  if (path === "/persons/search" && request.method === "GET") {
    const q      = (url.searchParams.get("q") || "").trim();
    const limit  = Math.min(parseInt(url.searchParams.get("limit") || "10"), 30);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

    if (!q) {
      return new Response(JSON.stringify({ ok: true, data: [], has_more: false }), { headers });
    }

    try {
      const likeTerm = _escapeLikeTerm(q) + "%";
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, name, name_ko, profile_path, job, job_manual, popularity
        FROM persons
        WHERE (name_ko LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
        ORDER BY popularity DESC
        LIMIT ? OFFSET ?
      `).bind(likeTerm, likeTerm, limit + 1, offset).all();

      const hasMore = results.length > limit;
      const data = results.slice(0, limit).map(p => ({
        tmdb_id: p.tmdb_id,
        name: (p.name_ko && p.name_ko.trim()) ? p.name_ko : p.name,
        profile_path: p.profile_path,
        job: p.job,
        job_manual: p.job_manual || null,
      }));

      return new Response(JSON.stringify({ ok: true, data, has_more: hasMore }), { headers });
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
          AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
          AND poster_path IS NOT NULL AND poster_path != ''
      `).bind(...ids).all();

      let data = [];
      if (workRows.length) {
        const foundIds = workRows.map(w => w.tmdb_id);
        const foundPlaceholders = foundIds.map(() => "?").join(",");
        const [{ results: rankRows }, { results: ottRows }] = await Promise.all([
          env.DB.prepare(`
            SELECT tmdb_id, platform, MIN(rank) as rank
            FROM rankings
            WHERE tmdb_id IN (${foundPlaceholders})
              AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
              AND NOT (platform = 'netflix' AND category_slot = 'category10')
            GROUP BY tmdb_id, platform
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

  // ── POST /search-log ──────────────────────────────────────────
  // [2026-07-18 신설] 검색결과 페이지(search-results.html)가 실제로 열릴 때(Enter/버튼으로
  // "진짜" 검색했을 때)만 호출하는 조용한 기록용 API. 헤더 자동완성처럼 타이핑할 때마다
  // 호출되는 게 아니라, 검색결과 페이지 도착 시 딱 한 번만 호출되도록 프론트에서 제어함
  // (자동완성 노이즈 없이 실제 검색 의도만 남기기 위함). 인물(배우) 검색은 브라우저에서
  // TMDB로 직접 나가는 구조라 이 API를 안 거침 — 이번 범위에서는 제외.
  // 실패해도 검색 자체엔 전혀 영향 없는 백그라운드 기록이라, 인증 없이 공개로 둠.
  if (path === "/search-log" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const query = (body.q || "").toString().trim().slice(0, 200);
      const resultCount = parseInt(body.total, 10) || 0;
      // [2026-07-18 추가] totalCount — DB+TMDB 합산 후 화면(#cntWorks)에 실제로 표시되는
      // 전체 검색결과 숫자. dbCapped인 경우 "135+"처럼 뒤에 +가 붙은 문자열로 올 수 있어서
      // 숫자(INTEGER)가 아니라 TEXT로 그대로 저장. 프론트가 아직 안 보내는 구버전 호출(과거
      // 캐시된 페이지 등)과의 호환을 위해 없으면 NULL 허용.
      const totalCountRaw = body.totalCount;
      const totalCount = (totalCountRaw === undefined || totalCountRaw === null)
        ? null
        : String(totalCountRaw).slice(0, 20);
      if (!query) {
        return new Response(JSON.stringify({ ok: true }), { headers }); // 빈 검색어는 조용히 무시
      }
      await env.DB.prepare(
        `INSERT INTO search_logs (query, result_count, total_count) VALUES (?, ?, ?)`
      ).bind(query, resultCount, totalCount).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
