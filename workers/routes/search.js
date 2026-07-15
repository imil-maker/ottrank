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
      //   2026-07-14 수정: 단순 LIKE '%공포%'는 "공포증"(phobia류, 캐릭터 설정 태그)까지 같이
      //   걸려서 "공포"(장르 태그)와 섞이는 문제 발견(사용자 확인). 한글은 띄어쓰기가 단어 경계이므로,
      //   keyword_ko/검색어 양쪽 앞뒤에 공백을 붙여 "독립된 단어로 일치할 때만" 매칭되도록 강제.
      //   예) "개 공포증" → " 개 공포증 " 안에 " 공포 "(공백포함)가 없어 제외됨 (원하는 동작)
      //       "오컬트 공포" → " 오컬트 공포 " 안에 " 공포 "가 있어 매칭됨
      //   한계: "일본공포"처럼 띄어쓰기 없이 합성된 키워드는 못 잡음 — 발견 시 어드민에서 띄어쓰기 보정
      const keywordMatch = await env.DB.prepare(`
        SELECT DISTINCT wk.tmdb_id
        FROM keyword_translation kt
        CROSS JOIN work_keywords wk ON wk.keyword = kt.keyword_en
        WHERE (' ' || kt.keyword_ko || ' ') LIKE ('% ' || ? || ' %')
        LIMIT ?
      `).bind(q, MAX_MATCH_IDS).all();

      // ③ 두 결과 합치기 (중복 제거). matchType: 0=제목매칭(우선), 1=키워드매칭
      const matchType = new Map();
      titleMatch.results.forEach(r => matchType.set(r.tmdb_id, 0));
      keywordMatch.results.forEach(r => { if (!matchType.has(r.tmdb_id)) matchType.set(r.tmdb_id, 1); });

      const allIds = [...matchType.keys()].slice(0, MAX_MATCH_IDS);
      if (!allIds.length) {
        return new Response(JSON.stringify({ ok: true, data: [], has_more: false, limit, offset }), { headers });
      }

      // ④ 상세 정보 조회 (성인물 제외 + 포스터 없는 작품 제외)
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

      // ⑤ 정렬: 제목매칭 우선 → 한국작품 우선(/search/keyword와 동일 원칙) → 평점 내림차순
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

      // ⑥ 페이징 (offset~offset+limit, 다음 페이지 존재 여부는 전체 길이로 판단)
      const pageRows = workRows.slice(offset, offset + limit);
      const hasMore  = workRows.length > offset + limit;

      if (!pageRows.length) {
        return new Response(JSON.stringify({ ok: true, data: [], has_more: false, limit, offset }), { headers });
      }

      // ⑦ 이번 페이지 작품들의 오늘자 플랫폼별 순위 (OTT별 순위) — rankings 조인
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

      return new Response(JSON.stringify({ ok: true, data, has_more: hasMore, limit, offset }), { headers });
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