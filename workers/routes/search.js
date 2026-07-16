/* ══════════════════════════════════════════════════════════════
   검색 관련 API 라우트
   [2026-07-15 신설] videos.js에 있던 /works/search, /works/exists를
   분리 — 검색 기능이 자동완성/인기검색어 등으로 커질 것을 대비해
   별도 파일로 관리.

   GET    /works/search             작품 검색 (공개) — 제목+키워드(한글)+장르 통합검색, 15개 페이징(offset), 년도/평점/OTT순위 포함
   GET    /works/exists             tmdb_id 목록 중 DB 등록 여부 확인 (공개) — 검색결과 TMDB 보충결과 중복필터용
══════════════════════════════════════════════════════════════ */

// 제목/키워드/장르 매칭 3종 쿼리를 하나의 배열로 묶어서 반환 — env.DB.batch()로 한 번에 실행하기 위함
// (메인 검색과 "관련 작품 추천" 단어별 재검색 양쪽에서 재사용)
function _dbMatchStatements(env, term, capLimit) {
  const termNoSpace = term.replace(/\s+/g, "");
  return [
    env.DB.prepare(`
      SELECT tmdb_id FROM works
      WHERE REPLACE(title_ko, ' ', '') LIKE ? OR REPLACE(title_en, ' ', '') LIKE ?
      LIMIT ?
    `).bind(`%${termNoSpace}%`, `%${termNoSpace}%`, capLimit),
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

// TMDB 서버-서버 직접 호출 — 브라우저 프록시(tmdb-proxy) 대신 api.themoviedb.org를
// env.TMDB_API_KEY로 직접 호출 (Worker-to-Worker 프록시 호출은 항상 실패하는 알려진 문제 회피)
async function _tmdbSearchDirect(env, mediaType, term) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(term)}&language=ko-KR&include_adult=false&api_key=${env.TMDB_API_KEY}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return [];
    const j = await res.json();
    return (j.results || []).filter(r => !r.adult).map(r => ({ ...r, _type: mediaType, tmdb_id: r.id }));
  } catch (e) {
    return []; // 3초 안에 응답 없으면(타임아웃) 또는 그 외 오류 시 그냥 빈 배열 — 검색 자체는 막지 않음
  } finally {
    clearTimeout(timer);
  }
}

// [2026-07-15 추가] 관련 작품 추천 — 메인 검색 결과가 빈약하고(RELATED_THRESHOLD 미만)
// 검색어가 여러 단어로 쪼개질 때("우울한 하루" → "우울한"/"하루"), 단어별로 DB+TMDB를
// 전부 병렬로 재조회해서 메인 결과와 안 겹치는 것만 골라 반환.
// - DB 쪽: 단어 수만큼의 매칭 statement를 전부 모아 batch() 한 번으로 실행 (왕복 1회)
// - TMDB 쪽: 단어 수 × 2(tv/movie) 호출을 전부 Promise.all로 동시에 실행
// → 단어가 몇 개든 전체가 항상 "가장 느린 호출 1개" 시간 안에 끝남
async function _fetchRelated(env, words, excludeIds, cap) {
  const perWordCap = 30;
  const dbStatements = words.flatMap(w => _dbMatchStatements(env, w, perWordCap));

  const [dbBatchResults, ...tmdbLists] = await Promise.all([
    env.DB.batch(dbStatements),
    ...words.flatMap(w => [_tmdbSearchDirect(env, "tv", w), _tmdbSearchDirect(env, "movie", w)]),
  ]);

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

  const merged = [];
  const seen = new Set();
  dbDetail.forEach(w => {
    if (seen.has(w.tmdb_id) || excludeIds.has(w.tmdb_id)) return;
    seen.add(w.tmdb_id);
    merged.push(w);
  });

  // TMDB 결과 중 "이미 우리 DB(works)에 등록된 작품"은 제외 — 초창기부터 있던 원칙.
  // TMDB는 제목뿐 아니라 줄거리(overview) 매칭으로도 걸리기 때문에, 검색어와 실제
  // 관련 없는 작품이 새어 들어올 수 있음. 이미 등록된 작품은 우리 키워드/장르 시스템이
  // "이 단어와는 관련없다"고 이미 판단을 마친 것이므로, TMDB 보충 결과에서는 무조건 제외.
  const tmdbFlat = tmdbLists.flat();
  const tmdbCandidateIds = [...new Set(tmdbFlat.map(w => w.tmdb_id).filter(Boolean))];
  let registeredIds = new Set();
  if (tmdbCandidateIds.length) {
    const placeholders = tmdbCandidateIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT tmdb_id FROM works WHERE tmdb_id IN (${placeholders})`
    ).bind(...tmdbCandidateIds).all();
    registeredIds = new Set(results.map(r => r.tmdb_id));
  }

  tmdbFlat.forEach(w => {
    const id = w.tmdb_id;
    if (!id || seen.has(id) || excludeIds.has(id) || registeredIds.has(id) || !w.poster_path) return;
    seen.add(id);
    // DB 결과와 동일한 필드 형태로 정규화 — 프론트에서 출처 구분 없이 그대로 렌더링 가능
    merged.push({
      tmdb_id: id,
      title_ko: w.name || w.title || "",
      title_en: w.original_name || w.original_title || "",
      poster_path: w.poster_path,
      media_type: w._type,
      release_year: parseInt((w.first_air_date || w.release_date || "").slice(0, 4)) || null,
      tmdb_rating: w.vote_average || null,
      original_language: w.original_language || null,
    });
  });

  merged.sort((a, b) => {
    const ka = a.original_language === "ko" ? 0 : 1;
    const kb = b.original_language === "ko" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return (b.tmdb_rating || 0) - (a.tmdb_rating || 0);
  });

  return merged.slice(0, cap);
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

      // ② 세 결과 합치기 (중복 제거). matchType: 0=제목매칭(우선), 1=키워드/장르매칭
      const matchType = new Map();
      titleRes.results.forEach(r => matchType.set(r.tmdb_id, 0));
      keywordRes.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 1); });
      genreRes.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 1); });

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
      //   matchType에 3(=검색어 단어분리 매칭)으로 표시해서, 정렬 시 정확매칭(0,1)
      //   보다는 뒤로 가되 화면상으로는 구분 없이 하나의 결과 목록으로 보이게 함.
      if (!ottFilter && workRows.length < RELATED_THRESHOLD) {
        const words = [...new Set(q.split(/\s+/).filter(w => w.length >= 2))].slice(0, 3);
        if (words.length >= 2) {
          const related = await _fetchRelated(env, words, new Set(matchType.keys()), MAX_RELATED);
          related.forEach(w => {
            matchType.set(w.tmdb_id, 3);
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
