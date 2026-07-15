/* ══════════════════════════════════════════════════════════════
   검색 관련 API 라우트
   [2026-07-15 신설] videos.js에 있던 /works/search, /works/exists를
   분리 — 검색 기능이 자동완성/인기검색어 등으로 커질 것을 대비해
   별도 파일로 관리.

   GET    /works/search             작품 검색 (공개) — 제목+키워드(한글) 통합검색, 15개 페이징(offset), 년도/평점/OTT순위 포함
   GET    /works/exists             tmdb_id 목록 중 DB 등록 여부 확인 (공개) — 검색결과 TMDB 보충결과 중복필터용
══════════════════════════════════════════════════════════════ */

export async function handleSearch(path, request, env, url, headers) {

  // ── GET /works/search ────────────────────────────────────────
  // 공개 API — 인증 없이 works 검색 가능 (헤더 검색창, 검색결과 페이지 등에서 사용)
  // 2026-07-14 확장: 검색 결과 페이지(search-results.html) 신설에 맞춰 기능 추가
  //   ① 제목(title_ko/title_en) 매칭 + 키워드(한글) 매칭을 합쳐서 검색
  //      - 키워드는 work_keywords(영문, 정규화 테이블)에 저장되어 있어서,
  //        한글 검색어는 keyword_translation.keyword_ko로 먼저 영문 키워드를 찾은 뒤 조인한다.
  //   ② limit 기본값 10→15, offset 페이징 추가 ("더보기" 버튼용). has_more로 다음 페이지 존재 여부 알려줌
  //   ③ release_year, tmdb_rating 응답에 추가 (기존엔 응답에서 빠져있어 프론트에서 년도 표시가 안 되던 문제)
  //   ④ 오늘자 rankings를 조인해서 이번 페이지에 뜬 작품들의 플랫폼별 순위(ott_ranks)를 같이 내려줌
  //      - "지금 이 작품이 이 OTT에서 서비스되는지"는 이 API로는 알 수 없음(순위표 = 랭킹 데이터일 뿐).
  //        서비스 여부는 TMDB Watch Providers를 프론트에서 별도로 조회해서 보완한다 (트래픽 이슈로 캐싱은 추후 과제).
  //   ⑤ /search/keyword와 동일하게 성인물(adult_flag=1) 제외
  //   ⑥ 매칭 대상이 과도하게 많아지는 것(흔한 단어 검색 등) 방지 위해 매칭 tmdb_id 상한 300개
  //   ⑦ [2026-07-15 버그수정] 포스터 없는 작품까지 개수에 포함되던 문제 수정 —
  //      상세조회 단계에서 poster_path 없는 행을 미리 제외해서, has_more/페이징 개수가
  //      "실제 화면에 보이는 개수"와 항상 일치하도록 함(검색결과 페이지의 "더보기" 버그 원인).
  if (path === "/works/search" && request.method === "GET") {
    const q      = url.searchParams.get("q") || "";
    const limit  = Math.min(parseInt(url.searchParams.get("limit") || "15"), 30);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
    // 2026-07-14 수정: D1은 쿼리 1개당 바인딩 변수 최대 100개 제한이 있음.
    //   흔한 검색어(예: "로맨스")는 매칭 tmdb_id가 300개 가까이 나와서
    //   WHERE tmdb_id IN (...) 300개 바인딩 시 "too many SQL variables" 에러 발생 확인됨.
    //   화면엔 15개씩만 보여주므로 100개로도 충분 — 안전하게 축소.
    const MAX_MATCH_IDS = 100;

    if (!q.trim()) {
      return new Response(JSON.stringify({ ok: false, message: "q required" }), { status: 400, headers });
    }
    // 2026-07-08 수정: 띄어쓰기 무시 검색 (기존 유지)
    const qNoSpace = q.replace(/\s+/g, "");

    try {
      // ① 제목 매칭 tmdb_id (기존 로직과 동일한 WHERE, id만 우선 추출)
      const titleMatch = await env.DB.prepare(`
        SELECT tmdb_id
        FROM works
        WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
        LIMIT ?
      `).bind(`%${qNoSpace}%`, `%${qNoSpace}%`, MAX_MATCH_IDS).all();

      // ② 키워드(한글) 매칭 tmdb_id — keyword_translation.keyword_ko로 검색 → work_keywords 조인
      //   2026-07-14 수정: 일반 JOIN이면 SQLite가 큰 테이블(work_keywords, 13,710행)을 바깥 루프로
      //   잘못 선택해 검색어와 무관하게 매번 거의 전체를 스캔하는 문제 발견(D1 Rows read로 확인,
      //   EXPLAIN QUERY PLAN으로 원인 확정). CROSS JOIN은 SQLite에게 "적은 순서 그대로 실행"을
      //   강제하므로, 작은 테이블(keyword_translation, 4,443행)을 먼저 훑도록 고정.
      //   [2026-07-15 제거] 이전엔 "공포증"이 "공포"에 같이 걸리는 오탐을 막으려고 양쪽에
      //   공백을 붙여 "독립된 단어일 때만" 매칭되도록 강제했었음. 하지만 그 방식은
      //   "일본공포"처럼 띄어쓰기 없이 합성된 키워드를 못 잡는 부작용이 있었고, 이제
      //   영어 키워드 1개당 한글 번역을 최대 3개(keyword_ko/ko_2/ko_3)까지 등록할 수
      //   있게 되면서 오탐 케이스는 어드민에서 개별적으로 정리할 수 있게 됐으므로,
      //   자동 단어경계 강제는 없애고 단순 부분일치(LIKE '%검색어%')로 전환.
      //   [2026-07-15 확장] 영어 키워드 1개당 한글 번역을 최대 3개(keyword_ko/ko_2/ko_3)까지 등록 가능.
      //   예) romantic comedy → "로맨틱 코미디"(1) / "로코"(2) / "로맨틱코미디"(3) — 셋 중 뭘 검색해도 매칭.
      //   ko_2/ko_3가 비어있는(NULL) 행은 그 조건이 자연히 매칭 안 되므로 별도 분기 불필요.
      const keywordMatch = await env.DB.prepare(`
        SELECT DISTINCT wk.tmdb_id
        FROM keyword_translation kt
        CROSS JOIN work_keywords wk ON wk.keyword = kt.keyword_en
        WHERE kt.keyword_ko LIKE ('%' || ? || '%')
           OR kt.keyword_ko_2 LIKE ('%' || ? || '%')
           OR kt.keyword_ko_3 LIKE ('%' || ? || '%')
        LIMIT ?
      `).bind(q, q, q, MAX_MATCH_IDS).all();

      // ③ 장르 매칭 tmdb_id — works.genre는 TMDB를 language=ko-KR로 조회해서 채운 컬럼이라
      //   이미 한글로 저장되어 있음("액션, 드라마, 스릴러" 형태의 콤마 구분 문자열, 실측 27종).
      //   [2026-07-15 추가] 지금까지는 제목/키워드만 매칭 대상이라, "액션"처럼 장르 자체를
      //   검색하면 제목에 "액션"이 실제로 들어간 작품만 잡히던 문제 해결.
      //   TMDB 장르는 고정된 짧은 목록(액션/코미디/드라마/스릴러 등)이라 "공포증" 같은
      //   부분일치 오탐 걱정이 적지만, 안전하게 콤마로 감싸서 완전 일치만 매칭.
      //   [2026-07-15 추가] "드라마"(1,460개) 같은 큰 장르는 MAX_MATCH_IDS(100) 상한에
      //   바로 걸리는데, 정렬 없이 자르면 SQLite가 우연히 먼저 돌려주는 100개(대략 저장
      //   순서)만 담기고 정작 좋은 작품이 정렬 적용도 못 받고 잘려나감. 그래서 이 쿼리
      //   자체에 성인물/포스터없음을 미리 걸러내고, 한국작품 우선 → 평점 내림차순으로
      //   정렬해서 100개 예산 안에 품질 좋은 작품부터 채워지도록 함.
      const genreMatch = await env.DB.prepare(`
        SELECT tmdb_id
        FROM works
        WHERE (',' || REPLACE(genre, ', ', ',') || ',') LIKE ('%,' || ? || ',%')
          AND (adult_flag IS NULL OR adult_flag != 1)
          AND poster_path IS NOT NULL AND poster_path != ''
        ORDER BY (original_language = 'ko') DESC, tmdb_rating DESC
        LIMIT ?
      `).bind(q, MAX_MATCH_IDS).all();

      // ④ 세 결과 합치기 (중복 제거). matchType: 0=제목매칭(우선), 1=키워드/장르매칭
      const matchType = new Map();
      titleMatch.results.forEach(r => matchType.set(r.tmdb_id, 0));
      keywordMatch.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 1); });
      genreMatch.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 1); });

      // [2026-07-15 추가] capped — MAX_MATCH_IDS(100) 상한에 걸려서 실제로는 더 있는데
      // 여기서부터 이미 잘려나간 경우. 이럴 땐 total이 "정확한 전체 개수"가 아니라
      // "적어도 이만큼은 있다"는 하한선이라는 걸 프론트에 알려주기 위한 플래그.
      const capped = matchType.size > MAX_MATCH_IDS;
      const allIds = [...matchType.keys()].slice(0, MAX_MATCH_IDS);
      if (!allIds.length) {
        return new Response(JSON.stringify({ ok: true, data: [], has_more: false, limit, offset, total: 0, capped: false }), { headers });
      }

      // ⑤ 상세 정보 조회 (성인물 제외 + 포스터 없는 작품 제외)
      //    2026-07-15 추가: poster_path 조건 — 화면에서 어차피 안 보여줄 작품을
      //    개수/페이징 계산에서부터 제외해야 has_more가 실제 노출 개수와 일치함
      const idPlaceholders = allIds.map(() => "?").join(",");
      const { results: workRows } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
        FROM works
        WHERE tmdb_id IN (${idPlaceholders})
          AND (adult_flag IS NULL OR adult_flag != 1)
          AND poster_path IS NOT NULL AND poster_path != ''
      `).bind(...allIds).all();

      // [2026-07-15 추가] total — 포스터 필터링까지 반영한, 이번 검색어의 전체 매칭 개수
      // (capped=true면 MAX_MATCH_IDS 상한 안에서만 집계된 것이라 실제로는 더 있을 수 있음)
      const total = workRows.length;

      // ⑥ 정렬: 제목매칭 우선 → 한국작품 우선(/search/keyword와 동일 원칙) → 평점 내림차순
      //   (결과 규모가 작아 JS 정렬로 처리)
      workRows.sort((a, b) => {
        const ta = matchType.get(a.tmdb_id) ?? 1;
        const tb = matchType.get(b.tmdb_id) ?? 1;
        if (ta !== tb) return ta - tb;
        const ka = a.original_language === 'ko' ? 0 : 1;
        const kb = b.original_language === 'ko' ? 0 : 1;
        if (ka !== kb) return ka - kb;
        return (b.tmdb_rating || 0) - (a.tmdb_rating || 0);
      });

      // ⑦ 페이징 (offset~offset+limit, 다음 페이지 존재 여부는 전체 길이로 판단)
      const pageRows = workRows.slice(offset, offset + limit);
      const hasMore  = workRows.length > offset + limit;

      if (!pageRows.length) {
        return new Response(JSON.stringify({ ok: true, data: [], has_more: false, limit, offset, total, capped }), { headers });
      }

      // ⑧ 이번 페이지 작품들의 오늘자 플랫폼별 순위 (OTT별 순위) — rankings 조인
      const pageIds = pageRows.map(w => w.tmdb_id);
      const pagePlaceholders = pageIds.map(() => "?").join(",");
      const { results: rankRows } = await env.DB.prepare(`
        SELECT tmdb_id, platform, rank
        FROM rankings
        WHERE tmdb_id IN (${pagePlaceholders})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
      `).bind(...pageIds).all();

      const rankMap = {};
      rankRows.forEach(r => {
        if (!rankMap[r.tmdb_id]) rankMap[r.tmdb_id] = {};
        rankMap[r.tmdb_id][r.platform] = r.rank;
      });

      const data = pageRows.map(w => ({
        ...w,
        ott_ranks: rankMap[w.tmdb_id] || {},
      }));

      return new Response(JSON.stringify({ ok: true, data, has_more: hasMore, limit, offset, total, capped }), { headers });
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

  return null;
}
