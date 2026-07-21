// 2026-07-22 rev.4 — admin.js (사용자 프로필 수정요청 목록조회+승인/거절 API 신규)
/* ══════════════════════════════════════════════════════════════
   관리자 전용 API 라우트
   GET    /admin/title-map
   GET    /admin/rankings
   POST   /admin/fix
   POST   /admin/unfix
   GET    /admin/categories
   PATCH  /admin/categories/:id
   POST   /admin/categories
   GET    /admin/review-queue
   GET    /admin/review-queue/count
   POST   /admin/review-queue/:id/resolve
   POST   /admin/rank-override
   DELETE /admin/rank-override
   GET    /admin/works                (?sort=recent 기본값=created_at DESC, ?sort=updated=updated_at DESC)
                                       (?filter=adult_confirmed → adult_flag=1 확정 성인물만, 2026-07-13 신설)
   POST   /admin/works/register                         ← works 관리 "➕ 작품 등록" 전용 수동 등록, 성인물 필터 없음(2026-07-21 신설)
   PATCH  /admin/works/:tmdb_id
   PATCH  /admin/works/:tmdb_id/hero-backdrop  ← 핫100 히어로 캐러셀 배경이미지 수동 선택(2026-07-11 신설, 다른 필드는 안 건드리는 격리된 엔드포인트)
   PATCH  /admin/works/:tmdb_id/adult-flag     ← works 관리 19금 체크박스(2026-07-13 신설, adult_flag만 건드리는 격리된 엔드포인트)
   PUT    /admin/works/:tmdb_id/hero-upload    ← 커스텀 히어로 이미지 업로드(R2, 2026-07-12 신설)
   DELETE /admin/works/:tmdb_id/hero-upload    ← 커스텀 히어로 이미지 삭제(R2, 2026-07-12 신설)
   DELETE /admin/works/:tmdb_id
   GET    /admin/new-match-count
   GET    /admin/manual-rankings
   POST   /admin/manual-rankings
   PATCH  /admin/manual-rankings/reorder
   DELETE /admin/manual-rankings/:id
   POST   /admin/manual-rankings/save-page-category
   GET    /admin/rankings/main
   PATCH  /admin/rankings/reorder
   PATCH  /admin/sync-ratings
   GET    /admin/works/:tmdb_id/rating-status   ← 특정 작품 works↔rankings 평점 불일치 미리보기(2026-07-13 신설)
   POST   /admin/works/sync-rating-single       ← 특정 작품 평점 강제 동기화(2026-07-13 신설)
   GET    /admin/rankings/rating-check          ← 카테고리별 평점 비교 리스트(2026-07-14 신설, "OTT 평점 반영" 탭)
   GET    /admin/search-logs                    ← 검색어 로그 목록(2026-07-18 신설)
   GET    /admin/grade-settings
   PUT    /admin/grade-settings
   POST   /admin/grade-settings/assign
   GET    /admin/users
   POST   /admin/ott-points/adjust
   POST   /admin/works/collect-keywords
   POST   /admin/works/backfill-normalize-keywords   ← work_keywords/keyword_translation 정규화 백필
   POST   /admin/keywords/translate                  ← 영→한 키워드 AI 초벌 번역 (Claude Haiku)
   GET    /admin/keywords/review                     ← 키워드 번역 검토 대기(source='auto') 목록
   POST   /admin/keywords/review                     ← 키워드 번역 관리자 확정 저장(source='admin')
   GET    /admin/keywords/search                     ← 키워드 en/ko 검색 (오탐 발견 시 수동 수정용)
   POST   /admin/keywords/update                      ← 특정 키워드 한글 번역 개별 수정
   GET    /admin/works/keywords                       ← 작품 제목/tmdb_id로 검색해 그 작품의 키워드 전체 조회(2026-07-15 신설)
   POST   /admin/works/:tmdb_id/reset-keyword-cache    ← 특정 작품 키워드 캐시(keyword_ko_map) 초기화(2026-07-15 신설)
   POST   /admin/works/collect-ott                     ← OTT 서비스현황 일괄 수집(work_ott 정규화 테이블, 15일 주기 갱신, 2026-07-17 신설)
   GET    /admin/works/ott-stuck                       ← OTT 수집 계속 실패 중인(ott_updated_at NULL) 작품 목록(2026-07-17 신설)
   POST   /admin/works/verify-type                     ← media_type 반대 저장 의심 작품 TMDB로 실제 타입 확인(2026-07-17 신설)
   POST   /admin/works/apply-type-fix                   ← 확인된 media_type 일괄 수정(2026-07-17 신설)
   POST   /admin/works/discover-collect
   POST   /admin/works/classify-variety
   GET    /admin/variety-genre-options
   GET    /admin/works/variety-review
   POST   /admin/works/variety-review
   POST   /admin/works/variety-review/skip
   POST   /admin/works/pinned-similar
   GET    /admin/works/pinned-similar/:tmdb_id
   DELETE /admin/works/pinned-similar
   POST   /admin/persons/collect
   POST   /admin/persons/backfill-meta  ← 생년월일/인기도/사진 백필(2026-07-20 신설, 2026-07-22 name_ko_checked_at 기록 추가)
   POST   /admin/persons/refill-korean-name ← 한글이름만 재확인(격리, 2026-07-20 신설, 2026-07-22 1년 주기 재확인으로 변경)
   GET    /admin/persons/like-ranking ← 인물 좋아요 기간별 순위(오늘/어제/1주일/1개월/1년, 2026-07-22 신설)
   GET    /admin/persons/profile-edits ← 사용자 제출 프로필(약력) 수정요청 대기목록(2026-07-22 신설)
   POST   /admin/persons/profile-edits/:id ← 수정요청 승인/거절(2026-07-22 신설)
   GET    /admin/persons/wiki-candidates ← 위키 매칭 후보 목록(2026-07-20 신설)
   POST   /admin/persons/wiki-match-attempt ← 실제 위키 검색+매칭 시도(2026-07-20 신설)
   POST   /admin/persons/wiki-approve   ← 매칭 확정 승인, person_wiki_cache 반영(2026-07-20 신설)
   GET    /admin/persons/wiki-detail/:tmdb_id ← 인물 1명 위키 상세(매칭여부+항목별 숨김여부)(2026-07-20 신설)
   POST   /admin/persons/wiki-hidden-fields   ← 항목별 숨김/복구 저장(2026-07-20 신설)
   POST   /admin/persons/wiki-manual-save     ← 10개 항목 직접 입력/수정 저장(2026-07-20 신설)
   POST   /admin/persons/ai-draft             ← AI(웹서치) 프로필 초안 생성, 저장 안 함(2026-07-20 신설)
   GET    /admin/persons/search        ← 이름으로 persons 검색(2026-07-12 신설, 2026-07-20 name_ko/matched 추가)
   DELETE /admin/persons/:tmdb_id      ← 인물 삭제(2026-07-12 신설)
   POST   /admin/works/backfill-language
   POST   /admin/works/backfill-release-year
   POST   /admin/works/backfill-rating
   POST   /admin/works/batch-imdb-search   ← IMDb 매칭 배치 (OMDB 제목검색)
   POST   /admin/works/imdb-manual         ← IMDb 평점 수동 입력 (OMDB 반영 지연 대응)
   GET    /admin/works/missing-media-type
   POST   /admin/works/bulk-set-media-type
   GET    /admin/works/adult-search    ← 성인물 의심 작품 검색(제목/줄거리/키워드 단어매칭, 2026-07-12 신설)
   POST   /admin/works/adult-review    ← 성인물 일괄삭제 + 오탐 항목 정리완료 표시(2026-07-12 신설)
   GET    /work-ott/:tmdb_id          ← OTT 오버라이드 조회 (인증 불필요 — 작품 페이지 호출)
   POST   /work-ott                   ← OTT 오버라이드 추가/수정 (관리자 전용, 저장 직후 즉시 재수집으로 work_ott 반영, 2026-07-17 수정)
   DELETE /work-ott/:id               ← OTT 오버라이드 삭제/복원 (관리자 전용, 삭제 직후 즉시 재수집으로 work_ott 반영, 2026-07-17 수정)
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

// [2026-07-17 추가] 특정 작품 하나만 즉시 OTT 재수집 — POST /work-ott(오버라이드 저장/삭제) 직후 호출.
// collect-ott 배치(아래쪽 POST /admin/works/collect-ott)와 동일한 4단계 우선순위를 단일 작품
// 기준으로 재실행해서 work_ott에 바로 반영한다.
// [문제 배경] 배치는 ott_updated_at이 15일 안 지나면 대상에서 자동 제외되는데, override
// 저장/삭제는 이 값을 전혀 안 건드려서 — 이미 한 번 수집됐던 작품은 override를 바꿔도
// work_ott(검색결과가 실제로 보는 테이블)엔 최대 15일간 반영이 안 되는 버그가 있었음.
// 저장/삭제 시점에 그 작품 하나만 바로 재수집해서 이 문제를 근본적으로 없앤다.
async function _recollectOttForWork(env, tmdbId) {
  const work = await env.DB.prepare(
    `SELECT media_type FROM works WHERE tmdb_id = ?`
  ).bind(tmdbId).first();
  if (!work) return; // works에 없는(미등록) 작품이면 재수집 대상 아님

  const mtype = work.media_type === "movie" ? "movie" : "tv";
  const keys  = new Set();

  // Priority 1 — 오늘자 랭킹
  const { results: rankRows } = await env.DB.prepare(`
    SELECT platform FROM rankings
    WHERE tmdb_id = ?
      AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
  `).bind(tmdbId).all();
  rankRows.forEach(r => keys.add(r.platform));

  const OTT_NAME_MATCH = [
    [/netflix/i,  "netflix"],
    [/tving/i,    "tving"],
    [/disney/i,   "disney"],
    [/coupang/i,  "coupang"],
    [/wavve/i,    "wavve"],
    [/watcha/i,   "watcha"],
  ];

  try {
    // Priority 2 — 쿠팡플레이 Network 보완 (TV만)
    if (mtype === "tv" && !keys.has("coupang")) {
      const detResp = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${env.TMDB_API_KEY}`);
      if (detResp.ok) {
        const det = await detResp.json();
        if ((det.networks || []).some(n => n.id === 5169)) keys.add("coupang");
      }
    }
    // Priority 3 — TMDB Watch Providers (flatrate+rent+buy, collect-ott 배치와 동일 기준)
    const wpResp = await fetch(`https://api.themoviedb.org/3/${mtype}/${tmdbId}/watch/providers?api_key=${env.TMDB_API_KEY}`);
    if (wpResp.ok) {
      const wp = await wpResp.json();
      const kr = (wp.results && wp.results.KR) || {};
      const providers = [...(kr.flatrate || []), ...(kr.rent || []), ...(kr.buy || [])];
      providers.forEach(p => {
        const match = OTT_NAME_MATCH.find(([re]) => re.test(p.provider_name || ""));
        if (match) keys.add(match[1]);
      });
    }
  } catch (e) {
    // TMDB 호출 실패해도 아래 Priority 4(오버라이드)는 반영 — 재수집 자체를 막지 않음
  }

  // Priority 4 — 어드민 수동 오버라이드 (최우선 적용, 방금 저장/삭제한 내용까지 포함해서 재조회)
  const { results: overrideRows } = await env.DB.prepare(
    `SELECT ott_key, action FROM work_ott_overrides WHERE tmdb_id = ?`
  ).bind(tmdbId).all();
  overrideRows.forEach(o => {
    if (o.action === "add") keys.add(o.ott_key);
    else if (o.action === "remove") keys.delete(o.ott_key);
  });

  // 기존 값 지우고 새로 씀 (collect-ott 배치와 동일 원칙)
  const stmts = [env.DB.prepare("DELETE FROM work_ott WHERE tmdb_id = ?").bind(tmdbId)];
  keys.forEach(k => {
    stmts.push(env.DB.prepare("INSERT INTO work_ott (tmdb_id, ott_key) VALUES (?, ?)").bind(tmdbId, k));
  });
  stmts.push(env.DB.prepare(`UPDATE works SET ott_updated_at = datetime('now') WHERE tmdb_id = ?`).bind(tmdbId));
  await env.DB.batch(stmts);
}

export async function handleAdmin(path, request, env, url, headers) {

  /* ══════════════════════════════════════════════════════════════
     OTT 보러가기 수동 오버라이드 API
     ── GET  /work-ott/:tmdb_id  → 조회 (인증 불필요, 작품 페이지용)
     ── POST /work-ott           → 추가/수정 (관리자 전용)
     ── DELETE /work-ott/:id     → 삭제/복원 (관리자 전용)
  ══════════════════════════════════════════════════════════════ */

  // ── GET /work-ott/:tmdb_id ─────────────────────────────────
  // 작품 페이지에서 인증 없이 호출 → _checkAuth 불필요
  const workOttGetMatch = path.match(/^\/work-ott\/(\d+)$/);
  if (workOttGetMatch && request.method === "GET") {
    const tmdbId = parseInt(workOttGetMatch[1]);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, tmdb_id, ott_key, action, created_at
         FROM work_ott_overrides
         WHERE tmdb_id = ?
         ORDER BY created_at DESC`
      ).bind(tmdbId).all();
      return new Response(JSON.stringify({ ok: true, data: results || [] }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  // ── POST /work-ott ─────────────────────────────────────────
  // 관리자 전용 — 오버라이드 추가 또는 action 변경 (UPSERT)
  if (path === "/work-ott" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { tmdb_id, ott_key, action } = body;

      // 유효성 검사
      if (!tmdb_id || !ott_key || !action) {
        return new Response(JSON.stringify({
          ok: false, error: "tmdb_id, ott_key, action 필수"
        }), { status: 400, headers });
      }
      if (!["add", "remove"].includes(action)) {
        return new Response(JSON.stringify({
          ok: false, error: "action은 'add' 또는 'remove'만 허용"
        }), { status: 400, headers });
      }

      // UPSERT: 동일 tmdb_id+ott_key면 action 업데이트
      await env.DB.prepare(
        `INSERT INTO work_ott_overrides (tmdb_id, ott_key, action)
         VALUES (?, ?, ?)
         ON CONFLICT(tmdb_id, ott_key)
         DO UPDATE SET action = excluded.action,
                       created_at = datetime('now')`
      ).bind(tmdb_id, ott_key, action).run();

      // [2026-07-17 추가] 저장 직후 그 작품만 즉시 재수집 — work_ott(검색결과가 실제로 보는
      // 테이블)에 바로 반영해서, 정기 자동수집(15일 주기)을 기다리지 않아도 되게 함.
      // 재수집이 실패해도 오버라이드 저장 자체는 이미 성공했으므로 에러를 삼키고 넘어감
      // (다음 정기 자동수집 때 결국은 반영됨).
      try {
        await _recollectOttForWork(env, tmdb_id);
      } catch (e) {
        // 재수집 실패 — 저장은 성공했으니 응답은 그대로 ok:true로 내려감
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /work-ott/:id ───────────────────────────────────
  // 관리자 전용 — 오버라이드 삭제 (자동 로직으로 복원)
  const workOttDelMatch = path.match(/^\/work-ott\/(\d+)$/);
  if (workOttDelMatch && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers });
    }
    const id = parseInt(workOttDelMatch[1]);
    try {
      // 삭제 전에 tmdb_id 확보 — 삭제 후 즉시 재수집에 필요
      const row = await env.DB.prepare(
        `SELECT tmdb_id FROM work_ott_overrides WHERE id = ?`
      ).bind(id).first();

      await env.DB.prepare(
        `DELETE FROM work_ott_overrides WHERE id = ?`
      ).bind(id).run();

      // [2026-07-17 추가] 오버라이드 복원(삭제) 직후에도 저장 때와 동일하게 즉시 재수집
      if (row && row.tmdb_id) {
        try {
          await _recollectOttForWork(env, row.tmdb_id);
        } catch (e) {
          // 재수집 실패 — 삭제는 성공했으니 응답은 그대로 ok:true로 내려감
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/title-map ──────────────────────────────────
  if (path === "/admin/title-map" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const page   = parseInt(url.searchParams.get("page") || "1");
      const limit  = 50;
      const offset = (page - 1) * limit;
      const { results } = await env.DB.prepare(
        "SELECT * FROM title_map ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(limit, offset).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/rankings ─────────────────────────────────────
  // 랭킹 카테고리 섹션에 작품 신규 추가
  // works upsert → rankings INSERT → title_map upsert
  if (path === "/admin/rankings" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, date, tmdb_id, rank,
              title_ko, title_en, media_type, is_manual } = body;

      if (!platform || !category_slot || !date || !tmdb_id || !title_ko) {
        return new Response(JSON.stringify({
          ok: false, message: "platform, category_slot, date, tmdb_id, title_ko 필수"
        }), { status: 400, headers });
      }

      let finalPoster  = null;
      let finalTitleKo = title_ko || null;
      let finalTitleEn = title_en || null;
      let finalYear    = null;
      let finalGenre   = null;
      let finalRating  = null;
      let finalMtype   = (media_type === "tv" || media_type === "movie") ? media_type : null;

      // ① TMDB API 조회 (포스터/연도/장르/평점/영문제목)
      try {
        const mtypes = finalMtype ? [finalMtype] : ["tv", "movie"];
        for (const mtype of mtypes) {
          const tmdbResp = await fetch(
            `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
          );
          if (!tmdbResp.ok) continue;
          const tmdbData = await tmdbResp.json();
          if (!tmdbData.poster_path && !tmdbData.name && !tmdbData.title) continue;

          finalPoster = tmdbData.poster_path || null;
          finalYear   = parseInt((tmdbData.first_air_date || tmdbData.release_date || "").slice(0, 4)) || null;
          finalRating = tmdbData.vote_average ? parseFloat(tmdbData.vote_average.toFixed(1)) : null;
          finalGenre  = (tmdbData.genres || []).map(g => g.name).join(", ") || null;
          if (!finalMtype) finalMtype = mtype;
          if (!finalTitleKo) finalTitleKo = tmdbData.name || tmdbData.title || null;

          if (!finalTitleEn) {
            const enResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
            );
            if (enResp.ok) {
              const enData = await enResp.json();
              const orig   = enData.original_title || enData.original_name || "";
              const en     = enData.title || enData.name || "";
              finalTitleEn = /[\uAC00-\uD7A3]/.test(orig) ? en : (orig || en);
            }
          }
          break;
        }
      } catch (e) { /* TMDB 실패 시 기존 값으로 진행 */ }

      // ② works upsert (마스터 데이터 보장)
      await env.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type, match_source, confidence_score)
        VALUES (?, ?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          media_type       = COALESCE(?, media_type),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(
        parseInt(tmdb_id), finalTitleKo || "", finalTitleEn || "", finalPoster, finalMtype,
        finalTitleKo || null, finalTitleEn || null, finalPoster, finalMtype
      ).run();

      // ③ 마지막 순위 계산 (rank 미지정 시 자동)
      let finalRank = parseInt(rank) || null;
      if (!finalRank) {
        const lastRow = await env.DB.prepare(
          "SELECT MAX(rank) as max_rank FROM rankings WHERE platform = ? AND category_slot = ? AND date = ?"
        ).bind(platform, category_slot, date).first();
        finalRank = (lastRow?.max_rank || 0) + 1;
      }

      // ④ rankings INSERT (음수 임시 삽입 → 양수 확정, UNIQUE 충돌 방지)
      await env.DB.prepare(`
        INSERT INTO rankings
          (platform, category_slot, category, date, rank, tmdb_id,
           title_ko, title_en, poster_path, release_year, genre, tmdb_rating,
           is_manual, source_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        platform, category_slot, category_slot, date,
        -(finalRank), parseInt(tmdb_id),
        finalTitleKo || "", finalTitleEn || "", finalPoster,
        finalYear, finalGenre, finalRating,
        is_manual ? 1 : 0, category_slot
      ).run();

      await env.DB.prepare(
        "UPDATE rankings SET rank = ? WHERE platform = ? AND category_slot = ? AND date = ? AND rank = ?"
      ).bind(finalRank, platform, category_slot, date, -(finalRank)).run();

      // ⑤ title_map upsert
      if (finalTitleEn && finalTitleKo) {
        await env.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(finalTitleEn.trim(), finalTitleKo.trim(), parseInt(tmdb_id)).run();
      }

      // ⑥ admin_logs
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_add', ?, ?, ?, ?)"
      ).bind(platform, category_slot, String(tmdb_id),
        JSON.stringify({ rank: finalRank, title_ko: finalTitleKo, date })).run();

      return new Response(JSON.stringify({
        ok: true, rank: finalRank,
        poster_path: finalPoster, title_ko: finalTitleKo, title_en: finalTitleEn,
      }), { headers });

    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/rankings ───────────────────────────────────
  if (path === "/admin/rankings" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    const date   = url.searchParams.get("date");
    const manual = url.searchParams.get("manual");
    let query, bindVal;
    if (manual === "true") {
      // 수동 데이터 전용
      query    = "SELECT * FROM rankings WHERE date = 'manual' ORDER BY platform, category_slot, rank";
      bindVal  = null;
    } else if (date) {
      query    = "SELECT * FROM rankings WHERE date = ? ORDER BY platform, category_slot, rank";
      bindVal  = date;
    } else {
      query    = "SELECT * FROM rankings WHERE date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date') ORDER BY platform, category_slot, rank";
      bindVal  = null;
    }
    const { results } = bindVal
      ? await env.DB.prepare(query).bind(bindVal).all()
      : await env.DB.prepare(query).all();
    return new Response(JSON.stringify({ ok: true, data: results }), { headers });
  }

  // ── POST /admin/fix ───────────────────────────────────────
  if (path === "/admin/fix" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { id, tmdb_id, title_ko, title_en, delete_duplicates, media_type } = body;
      // 시즌 번호 + 프론트에서 직접 전송한 시즌 포스터 (rankings에만 저장, works 건드리지 않음)
      const season          = body.season !== undefined ? body.season : undefined;
      const frontPosterPath = body.poster_path || null; // 시즌 포스터 (프론트에서 전송)

      if (!id) return new Response(JSON.stringify({ ok: false, message: "id required" }), { status: 400, headers });

      let finalPoster  = null;
      let finalTitleKo = title_ko || null;
      let finalTitleEn = title_en || null;

      const rankRow = await env.DB.prepare(
        "SELECT title_ko, title_en, poster_path FROM rankings WHERE id = ?"
      ).bind(parseInt(id)).first();

      if (tmdb_id) {
        try {
          const mtypes = media_type === "movie" ? ["movie"] :
                         media_type === "tv"    ? ["tv"]    :
                         ["tv", "movie"];
          for (const mtype of mtypes) {
            const tmdbResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
            );
            if (!tmdbResp.ok) continue;
            const tmdbData = await tmdbResp.json();
            if (!tmdbData.poster_path && !tmdbData.name && !tmdbData.title) continue;

            finalPoster = tmdbData.poster_path || null;
            if (!finalTitleKo) finalTitleKo = tmdbData.name || tmdbData.title || null;

            if (!finalTitleEn) {
              const tmdbEnResp = await fetch(
                `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
              );
              if (tmdbEnResp.ok) {
                const tmdbEnData    = await tmdbEnResp.json();
                const originalTitle = tmdbEnData.original_title || tmdbEnData.original_name || "";
                const enTitle       = tmdbEnData.title || tmdbEnData.name || "";
                const isKorean      = /[\uAC00-\uD7A3]/.test(originalTitle);
                finalTitleEn = isKorean ? enTitle : (originalTitle || enTitle);
              }
            }
            break;
          }
        } catch (e) {}
      }

      // 시즌 포스터가 프론트에서 전송된 경우 최우선 적용 (TMDB 기본 포스터 덮어쓰기)
      if (frontPosterPath) finalPoster = frontPosterPath;

      // ① rankings 업데이트 (season 컬럼 포함 — undefined면 기존값 유지)
      const seasonBind = season !== undefined
        ? (season !== null ? parseInt(season) : null)
        : undefined; // undefined → COALESCE로 기존값 유지

      await env.DB.prepare(`
        UPDATE rankings
        SET tmdb_id     = COALESCE(?, tmdb_id),
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(?, title_en),
            poster_path = COALESCE(?, poster_path),
            season      = ${seasonBind !== undefined ? '?' : 'season'},
            is_manual   = 1
        WHERE id = ?
      `).bind(
        ...[
          tmdb_id ? parseInt(tmdb_id) : null,
          finalTitleKo, finalTitleEn, finalPoster,
          ...(seasonBind !== undefined ? [seasonBind] : []),
          parseInt(id),
        ]
      ).run();

      // ② works 테이블 upsert
      if (tmdb_id) {
        if (delete_duplicates) {
          if (finalTitleEn) {
            await env.DB.prepare(
              "DELETE FROM works WHERE title_en = ? AND tmdb_id != ?"
            ).bind(finalTitleEn, parseInt(tmdb_id)).run();
          }
          if (finalTitleKo && /[\uAC00-\uD7A3]/.test(finalTitleKo)) {
            await env.DB.prepare(
              "DELETE FROM works WHERE title_ko = ? AND tmdb_id != ?"
            ).bind(finalTitleKo, parseInt(tmdb_id)).run();
          }
          await env.DB.prepare(
            "INSERT INTO admin_logs (action, target_id, memo) VALUES ('works_delete', ?, ?)"
          ).bind(
            String(tmdb_id),
            `중복 삭제: title_en="${finalTitleEn}" title_ko="${finalTitleKo}"`
          ).run();
        }
        const mediaTypeVal = (media_type === "tv" || media_type === "movie") ? media_type : null;
        // 시즌 포스터(frontPosterPath)는 rankings에만 저장 — works 포스터는 기본 포스터 유지
        const worksPoserPath = frontPosterPath ? null : finalPoster;
        await env.DB.prepare(`
          INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko    = COALESCE(?, title_ko),
            title_en    = COALESCE(NULLIF(?, ''), title_en),
            poster_path = COALESCE(?, poster_path),
            media_type  = COALESCE(?, media_type),
            updated_at  = datetime('now')
        `).bind(
          parseInt(tmdb_id), finalTitleKo || "", finalTitleEn || "", worksPoserPath, mediaTypeVal,
          finalTitleKo || null, finalTitleEn || null, worksPoserPath, mediaTypeVal
        ).run();
      }

      // ③ title_map 저장
      const mapTitleEn = finalTitleEn || finalTitleKo || "";
      const mapTitleKo = finalTitleKo || finalTitleEn || "";
      if (mapTitleEn && mapTitleKo && tmdb_id) {
        await env.DB.prepare(`
          INSERT INTO title_map (title_en, title_ko, tmdb_id)
          VALUES (?, ?, ?)
          ON CONFLICT(title_en) DO UPDATE SET
            title_ko = excluded.title_ko,
            tmdb_id  = COALESCE(excluded.tmdb_id, tmdb_id)
        `).bind(mapTitleEn.trim(), mapTitleKo.trim(), parseInt(tmdb_id)).run();
      }

      return new Response(JSON.stringify({
        ok: true, poster_path: finalPoster,
        title_ko: finalTitleKo, title_en: finalTitleEn,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/unfix ─────────────────────────────────────
  if (path === "/admin/unfix" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    const body = await request.json();
    const { id } = body;
    await env.DB.prepare("UPDATE rankings SET is_manual = 0 WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  // ── PATCH /admin/rankings/:id ─────────────────────────────
  // 체크박스 크롤링 고정(is_manual=2) / 해제(is_manual=0) 전용
  // POST /admin/fix(is_manual=1) 와 완전히 별도 — works/title_map 수정 없음
  const crawlLockMatch = path.match(/^\/admin\/rankings\/(\d+)$/);
  if (crawlLockMatch && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const rankingId = parseInt(crawlLockMatch[1]);
      const { is_manual } = await request.json();

      // is_manual 값 검증: 0(해제) 또는 2(크롤링 고정)만 허용
      if (is_manual !== 0 && is_manual !== 2) {
        return new Response(JSON.stringify({
          ok: false, message: "is_manual 값은 0(해제) 또는 2(크롤링고정)만 허용됩니다."
        }), { status: 400, headers });
      }

      // 대상 행 존재 여부 확인
      const row = await env.DB.prepare(
        "SELECT id, platform, category_slot, title_ko FROM rankings WHERE id = ?"
      ).bind(rankingId).first();

      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "해당 랭킹을 찾을 수 없습니다." }), { status: 404, headers });
      }

      // is_manual 업데이트 (1=수동고정은 건드리지 않음 — PATCH 전용이라 명시적 값만 세팅)
      await env.DB.prepare(
        "UPDATE rankings SET is_manual = ? WHERE id = ?"
      ).bind(is_manual, rankingId).run();

      // 관리자 로그 기록
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('crawl_lock', ?, ?, ?, ?)"
      ).bind(
        row.platform, row.category_slot, String(rankingId),
        JSON.stringify({ is_manual, title_ko: row.title_ko })
      ).run();

      return new Response(JSON.stringify({ ok: true, is_manual }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/rankings/:id ────────────────────────────
  // [2026-07-14 신설] "랭킹 관리" 표에서 개별 항목 즉시 삭제.
  // upload_to_d1.py::upload_rankings()가 크롤링 개수를 초과하는 옛 순위(예:
  // 티빙 16~20위)를 지우지 않고 그대로 두는 구조적 문제의 임시 대응책 —
  // 관리자가 눈에 보이는 찌꺼기 데이터를 손으로 바로 정리할 수 있게 함.
  const rankingDeleteMatch = path.match(/^\/admin\/rankings\/(\d+)$/);
  if (rankingDeleteMatch && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const rankingId = parseInt(rankingDeleteMatch[1]);

      // 대상 행 존재 여부 확인 (로그 기록용 정보 + tmdb_id도 같이 확보 — 날짜고정 중복 확인에 필요)
      const row = await env.DB.prepare(
        "SELECT id, tmdb_id, platform, category_slot, title_ko, rank, is_manual FROM rankings WHERE id = ?"
      ).bind(rankingId).first();

      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "해당 랭킹을 찾을 수 없습니다." }), { status: 404, headers });
      }

      await env.DB.prepare("DELETE FROM rankings WHERE id = ?").bind(rankingId).run();

      // 관리자 로그 기록
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('ranking_delete', ?, ?, ?, ?)"
      ).bind(
        row.platform, row.category_slot, String(rankingId),
        JSON.stringify({ title_ko: row.title_ko, rank: row.rank, is_manual: row.is_manual })
      ).run();

      // [2026-07-17 추가] 같은 작품(tmdb_id)이 같은 플랫폼·카테고리에 날짜고정(is_manual=2)된
      // 채로 남아있는지 확인 — 남아있으면 크롤링 때마다 계속 복사되어 재등장하기 때문에, 지금
      // 삭제만으로는 근본적으로 안 끝난다는 걸 관리자에게 미리 알려줌(삭제 자체는 정상 진행됨).
      let pinnedWarning = null;
      if (row.tmdb_id) {
        const { results: pinnedRows } = await env.DB.prepare(`
          SELECT id, date FROM rankings
          WHERE tmdb_id = ? AND platform = ? AND category_slot = ? AND is_manual = 2
          ORDER BY date DESC
        `).bind(row.tmdb_id, row.platform, row.category_slot).all();
        if (pinnedRows.length) {
          pinnedWarning = {
            count: pinnedRows.length,
            latest_date: pinnedRows[0].date,
            message: `이 작품은 날짜고정(📌)된 버전이 ${pinnedRows.length}건 더 남아있어, 다음 크롤링 때 다시 나타날 수 있습니다. 완전히 막으려면 해당 행의 날짜고정을 해제하세요(기록은 삭제되지 않고 남습니다).`,
          };
        }
      }

      return new Response(JSON.stringify({ ok: true, pinned_warning: pinnedWarning }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/categories ────────────────────────────────────
  if (path === "/admin/categories" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const platform = url.searchParams.get("platform");
      let query      = "SELECT * FROM ott_categories";
      const params   = [];
      if (platform) { query += " WHERE platform = ?"; params.push(platform); }
      query += " ORDER BY platform, category_slot";
      const { results } = params.length
        ? await env.DB.prepare(query).bind(...params).all()
        : await env.DB.prepare(query).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/categories/:id ───────────────────────────────
  if (path.match(/^\/admin\/categories\/\d+$/) && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id   = parseInt(path.split("/")[3]);
      const body = await request.json();
      const { display_name, crawl_limit, main_limit, platform_limit,
              is_active, main_section, main_order,
              platform_section, platform_order, memo_label,
              hot100_eligible, hot100_weight,
              person_section, person_order, person_limit } = body;

      await env.DB.prepare(`
        UPDATE ott_categories SET
          display_name     = COALESCE(?, display_name),
          crawl_limit      = COALESCE(?, crawl_limit),
          main_limit       = COALESCE(?, main_limit),
          platform_limit   = COALESCE(?, platform_limit),
          is_active        = COALESCE(?, is_active),
          main_section     = CASE WHEN ? = '__SKIP__' THEN main_section     ELSE ? END,
          main_order       = CASE WHEN ? = '__SKIP__' THEN main_order       ELSE ? END,
          platform_section = CASE WHEN ? = '__SKIP__' THEN platform_section ELSE ? END,
          platform_order   = CASE WHEN ? = '__SKIP__' THEN platform_order   ELSE ? END,
          memo_label       = CASE WHEN ? = '__SKIP__' THEN memo_label       ELSE ? END,
          hot100_eligible  = CASE WHEN ? = '__SKIP__' THEN hot100_eligible  ELSE ? END,
          hot100_weight    = COALESCE(?, hot100_weight),
          person_section   = CASE WHEN ? = '__SKIP__' THEN person_section   ELSE ? END,
          person_order     = CASE WHEN ? = '__SKIP__' THEN person_order     ELSE ? END,
          person_limit     = COALESCE(?, person_limit),
          updated_at       = datetime('now')
        WHERE id = ?
      `).bind(
        display_name ?? null, crawl_limit ?? null, main_limit ?? null,
        platform_limit ?? null, is_active ?? null,
        main_section   === undefined ? "__SKIP__" : "__SET__", main_section   === undefined ? null : (main_section   || null),
        main_order     === undefined ? "__SKIP__" : "__SET__", main_order     === undefined ? null : (main_order     ?? 0),
        platform_section === undefined ? "__SKIP__" : "__SET__", platform_section === undefined ? null : (platform_section || null),
        platform_order === undefined ? "__SKIP__" : "__SET__", platform_order === undefined ? null : (platform_order ?? 0),
        memo_label     === undefined ? "__SKIP__" : "__SET__", memo_label     === undefined ? null : (memo_label     || null),
        hot100_eligible === undefined ? "__SKIP__" : "__SET__", hot100_eligible === undefined ? null : (hot100_eligible ?? 0),
        hot100_weight ?? null,
        person_section === undefined ? "__SKIP__" : "__SET__", person_section === undefined ? null : (person_section || null),
        person_order   === undefined ? "__SKIP__" : "__SET__", person_order   === undefined ? null : (person_order   ?? 0),
        person_limit ?? null,
        id
      ).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, after_value) VALUES ('category_setting', ?, ?)"
      ).bind(String(id), JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/categories ────────────────────────────────────
  if (path === "/admin/categories" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, source_name, display_name,
              crawl_limit, main_limit, platform_limit, is_active } = body;
      if (!platform || !category_slot || !source_name) {
        return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, source_name required" }), { status: 400, headers });
      }
      const maxRow = await env.DB.prepare(
        "SELECT MAX(table_index) as max_idx FROM ott_categories WHERE platform = ?"
      ).bind(platform).first();
      const table_index = (maxRow?.max_idx ?? -1) + 1;

      await env.DB.prepare(`
        INSERT INTO ott_categories
          (platform, category_slot, table_index, source_name, display_name,
           crawl_limit, main_limit, platform_limit, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot) DO NOTHING
      `).bind(
        platform, category_slot, table_index,
        source_name, display_name || source_name,
        crawl_limit || 20, main_limit || 10, platform_limit || 20,
        is_active ?? 1
      ).run();

      const newRow = await env.DB.prepare(
        "SELECT * FROM ott_categories WHERE platform = ? AND category_slot = ?"
      ).bind(platform, category_slot).first();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('category_create', ?, ?, ?)"
      ).bind(platform, category_slot, JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true, data: newRow }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/review-queue/count ─────────────────────────────
  if (path === "/admin/review-queue/count" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'"
      ).first();
      return new Response(JSON.stringify({ ok: true, count: row?.count || 0 }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/review-queue ───────────────────────────────────
  if (path === "/admin/review-queue" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const status   = url.searchParams.get("status") || "pending";
      const platform = url.searchParams.get("platform");
      let query      = "SELECT * FROM review_queue WHERE status = ?";
      const params   = [status];
      if (platform) { query += " AND platform = ?"; params.push(platform); }
      query += " ORDER BY crawled_date DESC, platform, category_slot, rank";
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/review-queue/:id/resolve ──────────────────────
  if (path.match(/^\/admin\/review-queue\/\d+\/resolve$/) && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id   = parseInt(path.split("/")[3]);
      const body = await request.json();
      const { tmdb_id, title_ko, title_en } = body;
      if (!tmdb_id) return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });

      const queueItem = await env.DB.prepare(
        "SELECT * FROM review_queue WHERE id = ?"
      ).bind(id).first();
      if (!queueItem) {
        return new Response(JSON.stringify({ ok: false, message: "Queue item not found" }), { status: 404, headers });
      }

      let finalPoster = null, finalTitleKo = title_ko, finalTitleEn = title_en;
      try {
        for (const mtype of ["tv", "movie"]) {
          const tmdbResp = await fetch(
            `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
          );
          if (tmdbResp.ok) {
            const tmdbData = await tmdbResp.json();
            if (tmdbData.name || tmdbData.title) {
              finalPoster  = tmdbData.poster_path || null;
              if (!finalTitleKo) finalTitleKo = tmdbData.name || tmdbData.title;
              break;
            }
          }
        }
        if (!finalTitleEn) {
          for (const mtype of ["tv", "movie"]) {
            const enResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
            );
            if (enResp.ok) {
              const enData = await enResp.json();
              if (enData.name || enData.title) { finalTitleEn = enData.title || enData.name; break; }
            }
          }
        }
      } catch (e) {}

      const deleteDuplicates = body.delete_duplicates === true;
      if (deleteDuplicates && (finalTitleEn || queueItem.title_en)) {
        const searchTitle = finalTitleEn || queueItem.title_en;
        await env.DB.prepare(
          "DELETE FROM works WHERE title_en = ? AND tmdb_id != ?"
        ).bind(searchTitle, parseInt(tmdb_id)).run();
        await env.DB.prepare(
          "INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)"
        ).bind(String(tmdb_id), JSON.stringify({ title_en: searchTitle }), `중복 삭제: title_en="${searchTitle}" tmdb_id!=${tmdb_id}`).run();
      }

      await env.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, match_source, confidence_score)
        VALUES (?, ?, ?, ?, 'admin', 100)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(NULLIF(?, ''), title_en),
          poster_path      = COALESCE(?, poster_path),
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
      `).bind(
        parseInt(tmdb_id), finalTitleKo || "", finalTitleEn || "", finalPoster,
        finalTitleKo || null, finalTitleEn || null, finalPoster
      ).run();

      await env.DB.prepare(`
        UPDATE rankings SET
          tmdb_id     = ?,
          title_ko    = COALESCE(?, title_ko),
          title_en    = COALESCE(?, title_en),
          poster_path = COALESCE(?, poster_path),
          is_manual   = 1
        WHERE platform = ? AND category_slot = ? AND rank = ? AND date = ?
      `).bind(
        parseInt(tmdb_id), finalTitleKo || null, finalTitleEn || null, finalPoster,
        queueItem.platform, queueItem.category_slot, queueItem.rank, queueItem.crawled_date
      ).run();

      await env.DB.prepare(`
        UPDATE review_queue SET
          status           = 'resolved',
          resolved_tmdb_id = ?,
          resolved_at      = datetime('now')
        WHERE id = ?
      `).bind(parseInt(tmdb_id), id).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('queue_resolve', ?, ?, ?, ?)"
      ).bind(queueItem.platform, queueItem.category_slot, String(tmdb_id),
        JSON.stringify({ tmdb_id, title_ko: finalTitleKo, title_en: finalTitleEn })).run();

      return new Response(JSON.stringify({
        ok: true, poster_path: finalPoster,
        title_ko: finalTitleKo, title_en: finalTitleEn,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/rank-override ────────────────────────────────
  if (path === "/admin/rank-override" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, date, tmdb_id, original_rank, override_rank, reason } = body;
      if (!platform || !category_slot || !date || !tmdb_id || !override_rank) {
        return new Response(JSON.stringify({ ok: false, message: "필수 파라미터 누락" }), { status: 400, headers });
      }
      await env.DB.prepare(`
        INSERT INTO rank_overrides
          (platform, category_slot, date, tmdb_id, original_rank, override_rank, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, category_slot, date, tmdb_id) DO UPDATE SET
          override_rank = excluded.override_rank,
          reason        = excluded.reason,
          updated_at    = datetime('now')
      `).bind(platform, category_slot, date, parseInt(tmdb_id), original_rank || 0, parseInt(override_rank), reason || null).run();
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value, after_value) VALUES ('rank_override', ?, ?, ?, ?, ?)"
      ).bind(platform, category_slot, String(tmdb_id),
        JSON.stringify({ rank: original_rank }), JSON.stringify({ rank: override_rank, reason })).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/rank-override ───────────────────────────────
  if (path === "/admin/rank-override" && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, date, tmdb_id } = body;
      await env.DB.prepare(
        "DELETE FROM rank_overrides WHERE platform = ? AND category_slot = ? AND date = ? AND tmdb_id = ?"
      ).bind(platform, category_slot, date, parseInt(tmdb_id)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/:tmdb_id (단건 조회) ─────────────────────
  if (path.match(/^\/admin\/works\/\d+$/) && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const row = await env.DB.prepare(
        "SELECT * FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();
      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true, data: row }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works ─────────────────────────────────────────
  if (path === "/admin/works" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q      = url.searchParams.get("q") || "";
      const filter = url.searchParams.get("filter") || "";
      const date   = url.searchParams.get("date") || "";
      const sort   = url.searchParams.get("sort") || "recent"; // 'recent'=최근 등록순(기본) | 'updated'=최근 수정순
      const page   = parseInt(url.searchParams.get("page") || "1");
      const limit  = 50;
      const offset = (page - 1) * limit;

      // 정렬 기준 컬럼 — created_at이 없는(마이그레이션 전) 초기 상태를 대비해 COALESCE로 안전하게 폴백
      // 2차 정렬 기준(id DESC): 기존 데이터는 마이그레이션 시점 일괄 백필로 created_at이 전부 동점이라,
      // 이 경우 실제 PK(id, AUTOINCREMENT)가 큰(=테이블에 더 나중에 INSERT된) 행을 우선 노출
      // ⚠️ id는 tmdb_id와 무관한 별도 PK 컬럼 — sqlite_master 스키마 확인으로 검증됨
      const orderBy = sort === "updated"
        ? "updated_at DESC, id DESC"
        : "COALESCE(created_at, updated_at) DESC, id DESC";

      let query, params;
      if (filter === "new_match" && date) {
        query  = `SELECT * FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude', 'auto_tmdb') ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [date, limit, offset];
      } else if (filter === "adult_confirmed" && q) {
        // [2026-07-13 추가] "확정된 성인물 리스트"용 — adult_flag=1로 확정된 것만, 제목 검색도 함께 지원
        query  = `SELECT * FROM works WHERE adult_flag = 1 AND (title_ko LIKE ? OR title_en LIKE ?) ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [`%${q}%`, `%${q}%`, limit, offset];
      } else if (filter === "adult_confirmed") {
        // [2026-07-13 추가] admin.html works 관리 왼쪽 체크박스로 표시한 adult_flag=1 작품 전체 목록
        query  = `SELECT * FROM works WHERE adult_flag = 1 ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [limit, offset];
      } else if (q) {
        query  = `SELECT * FROM works WHERE title_ko LIKE ? OR title_en LIKE ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [`%${q}%`, `%${q}%`, limit, offset];
      } else {
        query  = `SELECT * FROM works ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        params = [limit, offset];
      }
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/register ──────────────────────────────────
  // [2026-07-21 신규] works 관리 "➕ 작품 등록" 버튼 전용. 공개 등록 경로(videos.js의
  // POST /works/register)와 달리 성인물(softcore) 필터를 거치지 않음 — 관리자가 직접
  // 골라서 등록하는 것이므로 자동판별이 불필요하다고 판단(사용자 확인).
  // 이미 등록된 tmdb_id면 덮어쓰지 않고 안내만 반환.
  if (path === "/admin/works/register" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbId    = parseInt(body.tmdb_id) || null;
      const titleKo   = (body.title_ko || "").trim();
      const titleEn   = (body.title_en || "").trim();
      const poster    = body.poster_path || null;
      const mediaType = ["movie", "tv"].includes(body.media_type) ? body.media_type : null;

      if (!tmdbId || !titleKo) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id, title_ko는 필수예요" }), { status: 400, headers });
      }

      const existing = await env.DB.prepare(
        "SELECT tmdb_id, title_ko FROM works WHERE tmdb_id = ?"
      ).bind(tmdbId).first();
      if (existing) {
        return new Response(JSON.stringify({
          ok: false, message: `이미 등록된 작품이에요 (${existing.title_ko || tmdbId})`,
        }), { status: 409, headers });
      }

      await env.DB.prepare(`
        INSERT INTO works
          (tmdb_id, title_ko, title_en, poster_path, media_type, match_source, confidence_score, first_matched_date)
        VALUES (?, ?, ?, ?, ?, 'admin', 100, date('now'))
      `).bind(tmdbId, titleKo, titleEn || "", poster, mediaType).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/works/:tmdb_id ───────────────────────────────
  if (path.match(/^\/admin\/works\/\d+$/) && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const body    = await request.json();
      const { title_ko, title_en, poster_path, delete_duplicates, media_type, mbti_tags } = body;

      // media_type 유효값만 허용 (tv / movie / null)
      const finalMediaType = (media_type === 'tv' || media_type === 'movie') ? media_type : null;

      // mbti_tags: "ENFP:95,ENTJ:80,ISTJ:75" 형식 또는 null
      // undefined면 기존값 유지 (COALESCE), null이면 명시적 초기화
      const mbtiTagsProvided = mbti_tags !== undefined;
      const finalMbtiTags    = mbtiTagsProvided
        ? (mbti_tags || null)   // 빈 문자열은 null로 저장
        : undefined;

      const before = await env.DB.prepare(
        "SELECT title_ko, title_en, poster_path, media_type FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      if (delete_duplicates && (title_en || before?.title_en)) {
        const searchTitle = title_en || before?.title_en;
        await env.DB.prepare("DELETE FROM works WHERE title_en = ? AND tmdb_id != ?")
          .bind(searchTitle, tmdb_id).run();
        await env.DB.prepare(
          "INSERT INTO admin_logs (action, target_id, before_value, memo) VALUES ('works_delete', ?, ?, ?)"
        ).bind(String(tmdb_id), JSON.stringify({ title_en: searchTitle }), `중복 삭제: title_en="${searchTitle}" tmdb_id!=${tmdb_id}`).run();
      }

      await env.DB.prepare(`
        UPDATE works SET
          title_ko         = COALESCE(?, title_ko),
          title_en         = COALESCE(?, title_en),
          poster_path      = COALESCE(?, poster_path),
          media_type       = ?,
          mbti_tags        = ${mbtiTagsProvided ? '?' : 'mbti_tags'},
          match_source     = 'admin',
          confidence_score = 100,
          updated_at       = datetime('now')
        WHERE tmdb_id = ?
      `).bind(
        title_ko || null,
        title_en || null,
        poster_path || null,
        finalMediaType,
        ...(mbtiTagsProvided ? [finalMbtiTags] : []),
        tmdb_id
      ).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, before_value, after_value) VALUES ('works_update', ?, ?, ?)"
      ).bind(String(tmdb_id), JSON.stringify(before), JSON.stringify(body)).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/works/:tmdb_id/hero-backdrop ──────────────────
  // [2026-07-11 신설] 핫100 히어로 캐러셀용 배경이미지 수동 선택.
  // ⚠️ 기존 PATCH /admin/works/:tmdb_id는 media_type을 안 보내면 null로 덮어써버리는
  // 문제가 있어서(TMDB ID 충돌 방지에 중요한 필드), 배경이미지 하나만 딱 격리해서
  // 건드리는 별도 엔드포인트로 분리함. hero_backdrop_path 외 다른 컬럼은 전혀 안 건드림.
  if (path.match(/^\/admin\/works\/\d+\/hero-backdrop$/) && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const body    = await request.json();
      const { backdrop_path, hero_title_baked_in } = body; // backdrop_path: null이면 선택 해제(기본 이미지로 되돌림)

      // hero_title_baked_in이 요청에 아예 없으면(undefined) 기존 값 유지 — 배경이미지만
      // 바꾸는 호출이 체크박스 상태를 실수로 0으로 초기화하지 않도록 방어
      const bakedInValue = hero_title_baked_in === undefined ? null : (hero_title_baked_in ? 1 : 0);

      await env.DB.prepare(
        "UPDATE works SET hero_backdrop_path = ?, hero_title_baked_in = COALESCE(?, hero_title_baked_in) WHERE tmdb_id = ?"
      ).bind(backdrop_path || null, bakedInValue, tmdb_id).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PUT /admin/works/:tmdb_id/hero-upload ───────────────────────
  // [2026-07-12 신설] 커스텀 히어로 이미지 직접 업로드 (R2 저장).
  // 파일을 멀티파트가 아니라 요청 body에 그대로(raw binary) 받음 — Content-Type 헤더로 확장자 결정.
  // "?baked_in=0" 쿼리로 명시적으로 끄지 않는 한, 커스텀 이미지는 기본적으로 제목이 이미
  // 들어있다고 간주해 hero_title_baked_in을 자동으로 켬(사용자 요청사항).
  if (path.match(/^\/admin\/works\/\d+\/hero-upload$/) && request.method === "PUT") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const contentType = request.headers.get("Content-Type") || "image/jpeg";
      const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
      const ext = extMap[contentType] || "jpg";
      const key = `hero/${tmdb_id}-${Date.now()}.${ext}`;

      await env.IMAGES.put(key, request.body, {
        httpMetadata: { contentType },
      });

      const publicUrl = `https://img.ottrank.kr/${key}`;

      const url = new URL(request.url);
      const autoBakedIn = url.searchParams.get("baked_in") !== "0";

      await env.DB.prepare(
        "UPDATE works SET hero_custom_image_url = ?, hero_title_baked_in = ? WHERE tmdb_id = ?"
      ).bind(publicUrl, autoBakedIn ? 1 : 0, tmdb_id).run();

      return new Response(JSON.stringify({ ok: true, url: publicUrl }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/works/:tmdb_id/hero-upload ─────────────────────
  // 커스텀 이미지 삭제 — R2 오브젝트도 같이 지우고(용량 낭비 방지), works 컬럼은 비움
  // (TMDB 백드롭 선택/기본 포스터로 자동 되돌아감). hero_title_baked_in은 그대로 둠 —
  // TMDB 백드롭으로 되돌아간 뒤에도 admin이 원하면 계속 유지/해제할 수 있게.
  if (path.match(/^\/admin\/works\/\d+\/hero-upload$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const existing = await env.DB.prepare(
        "SELECT hero_custom_image_url FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      if (existing?.hero_custom_image_url) {
        const key = existing.hero_custom_image_url.replace("https://img.ottrank.kr/", "");
        try { await env.IMAGES.delete(key); } catch (e) { /* R2 삭제 실패해도 DB는 정리 진행 */ }
      }

      await env.DB.prepare(
        "UPDATE works SET hero_custom_image_url = NULL WHERE tmdb_id = ?"
      ).bind(tmdb_id).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/works/:tmdb_id/adult-flag ──────────────────────
  // [2026-07-13 신설] works 관리 표의 19금 체크박스용. adult_flag 컬럼 하나만 딱 건드리는
  // 격리된 엔드포인트 — hero-backdrop과 동일한 패턴(범용 PATCH가 다른 필드를 실수로
  // 덮어쓰는 걸 방지). adult_flag: 1(19금 확정) 또는 null(체크 해제=미검토로 되돌림)만 허용.
  if (path.match(/^\/admin\/works\/\d+\/adult-flag$/) && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const body    = await request.json();
      const finalValue = body.adult_flag === 1 ? 1 : null; // 1 이외에는 전부 null로 취급(안전한 기본값)

      // [2026-07-18 추가] 19금으로 체크(1)되는 순간 media_type도 자동으로 'movie'로 고정.
      // 성인물은 TV 시리즈로 등록될 일이 거의 없고, 영화로 통일해두면 이후 필터/집계에서
      // 예외 처리를 안 해도 됨. 체크 해제(null)일 때는 media_type을 건드리지 않음 —
      // 되돌릴 원래 타입을 알 방법이 없어 잘못된 값을 덮어쓸 수 있기 때문.
      if (finalValue === 1) {
        await env.DB.prepare(
          "UPDATE works SET adult_flag = ?, media_type = 'movie' WHERE tmdb_id = ?"
        ).bind(finalValue, tmdb_id).run();
      } else {
        await env.DB.prepare(
          "UPDATE works SET adult_flag = ? WHERE tmdb_id = ?"
        ).bind(finalValue, tmdb_id).run();
      }

      return new Response(JSON.stringify({ ok: true, adult_flag: finalValue }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/works/:tmdb_id ──────────────────────────────
  if (path.match(/^\/admin\/works\/\d+$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/")[3]);
      const before  = await env.DB.prepare("SELECT * FROM works WHERE tmdb_id = ?").bind(tmdb_id).first();
      await env.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(tmdb_id).run();
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, target_id, before_value) VALUES ('works_delete', ?, ?)"
      ).bind(String(tmdb_id), JSON.stringify(before)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/new-match-count ────────────────────────────────
  if (path === "/admin/new-match-count" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const row  = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM works WHERE first_matched_date = ? AND match_source IN ('auto_claude','auto_tmdb')"
      ).bind(date).first();
      return new Response(JSON.stringify({ ok: true, count: row?.count || 0, date }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/manual-rankings ───────────────────────────────
  if (path === "/admin/manual-rankings" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const platform      = url.searchParams.get("platform");
      const category_slot = url.searchParams.get("category_slot");
      if (!platform || !category_slot) {
        return new Response(JSON.stringify({ ok: false, message: "platform, category_slot required" }), { status: 400, headers });
      }
      const { results } = await env.DB.prepare(`
        SELECT id, rank, title_ko, title_en, tmdb_id, poster_path,
               genre, overview, release_year, tmdb_rating, source_name, memo, season
        FROM rankings
        WHERE date = 'manual' AND platform = ? AND category_slot = ?
        ORDER BY rank ASC
      `).bind(platform, category_slot).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/manual-rankings ───────────────────────────────
  if (path === "/admin/manual-rankings" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, source_name, tmdb_id, rank, memo } = body;
      const season = body.season !== undefined ? body.season : null; // 시즌 번호 (NULL 허용)
      if (!platform || !category_slot || !tmdb_id || !rank) {
        return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, tmdb_id, rank required" }), { status: 400, headers });
      }

      let title_ko = body.title_ko || "", title_en = body.title_en || "";
      let poster_path  = body.poster_path  || null;
      let genre        = body.genre        || null;
      let overview     = body.overview     || null;
      let release_year = body.release_year || null;
      // tmdb_rating은 0점(투표수 부족)도 유효한 값이므로 ?? 사용
      // (|| 사용 시 0이 null로 사라지는 버그 — admin.html 프론트에서 이미 한 번 고쳤는데
      //  백엔드에서 다시 걸러지고 있던 것을 여기서 함께 수정)
      let tmdb_rating  = body.tmdb_rating  ?? null;
      const media_type = (body.media_type === "tv" || body.media_type === "movie") ? body.media_type : null;

      // works 테이블에서 부족한 필드 보완 — title_en도 title_ko/poster_path와 별개로 반드시 확인
      // (기존엔 title_ko·poster_path가 이미 있으면 이 조회 자체를 건너뛰어서 title_en이 계속 빈 값으로 저장되던 버그)
      if (!title_ko || !poster_path || !title_en) {
        const existing = await env.DB.prepare(
          "SELECT * FROM works WHERE tmdb_id = ?"
        ).bind(parseInt(tmdb_id)).first();
        if (existing) {
          title_ko     = title_ko     || existing.title_ko     || "";
          title_en     = title_en     || existing.title_en     || "";
          poster_path  = poster_path  || existing.poster_path  || null;
          genre        = genre        || existing.genre        || null;
          overview     = overview     || existing.overview     || null;
          release_year = release_year || existing.release_year || null;
          // tmdb_rating도 동일하게 ?? — 요청에 값이 없을 때만(undefined/null) works 기존값으로 보완
          tmdb_rating  = tmdb_rating  ?? existing.tmdb_rating  ?? null;
        }
      }

      // works에도 없으면 TMDB에서 영문 제목 직접 조회 (/admin/fix와 동일 패턴)
      if (!title_en) {
        try {
          const mtypes = media_type ? [media_type] : ["tv", "movie"];
          for (const mtype of mtypes) {
            const tmdbEnResp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?language=en-US&api_key=${env.TMDB_API_KEY}`
            );
            if (!tmdbEnResp.ok) continue;
            const tmdbEnData = await tmdbEnResp.json();
            if (!tmdbEnData.name && !tmdbEnData.title) continue;
            const originalTitle = tmdbEnData.original_title || tmdbEnData.original_name || "";
            const enTitle       = tmdbEnData.title || tmdbEnData.name || "";
            const isKorean      = /[\uAC00-\uD7A3]/.test(originalTitle);
            title_en = isKorean ? enTitle : (originalTitle || enTitle);
            break;
          }
        } catch (e) { /* TMDB 조회 실패 시 title_en 빈 값 유지 — 저장 자체는 계속 진행 */ }
      }

      await env.DB.prepare(`
        INSERT INTO rankings
          (date, platform, category, category_slot, source_name, rank,
           title_ko, title_en, tmdb_id, poster_path,
           genre, overview, release_year, tmdb_rating, is_manual, memo, season)
        VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(date, platform, category, rank) DO UPDATE SET
          tmdb_id      = excluded.tmdb_id,
          title_ko     = excluded.title_ko,
          title_en     = excluded.title_en,
          poster_path  = excluded.poster_path,
          genre        = excluded.genre,
          overview     = excluded.overview,
          release_year = excluded.release_year,
          tmdb_rating  = excluded.tmdb_rating,
          source_name  = excluded.source_name,
          category_slot = excluded.category_slot,
          is_manual    = 1,
          memo         = excluded.memo,
          season       = excluded.season
      `).bind(
        platform, category_slot, category_slot, source_name || "", parseInt(rank),
        title_ko, title_en, parseInt(tmdb_id), poster_path,
        genre, overview, release_year, tmdb_rating, memo || null,
        season !== null ? parseInt(season) : null
      ).run();

      // works 테이블에도 title_en·평점 보완 (COALESCE로 3키 원칙 보호 — 이미 값이 있으면 덮어쓰지 않음)
      // 이걸 안 하면 다음에 또 같은 tmdb_id로 등록할 때마다 매번 TMDB를 다시 조회해야 함
      //
      // tmdb_rating: title_en과 달리 "보호 대상 아님" 원칙에 따라 항상 최신값으로 덮어씀
      //   (COALESCE(excluded.값, works.기존값) — 0점도 유효한 값이라 그대로 반영됨)
      // rating_updated_at: 이 저장 시점에 이미 관리자가 TMDB에서 최신 평점을 확인해온 것이므로
      //   현재 시각으로 기록 → 방문 시 자동 새로고침 로직이 "최근에 확인함"으로 인식해
      //   불필요한 재조회를 하지 않게 됨
      // title_en이 비어있어도(TMDB 조회 실패 등) 평점 동기화는 별도로 계속 진행되도록,
      // 기존의 `if (title_en)` 조건 밖으로 빼서 tmdb_id만 있으면 항상 실행되게 함
      const nowIsoManual = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, tmdb_rating, rating_updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          title_en          = CASE
            WHEN excluded.title_en IS NULL OR excluded.title_en = '' THEN works.title_en
            ELSE COALESCE(NULLIF(works.title_en, ''), excluded.title_en)
          END,
          tmdb_rating       = COALESCE(excluded.tmdb_rating, works.tmdb_rating),
          rating_updated_at = excluded.rating_updated_at,
          updated_at        = datetime('now')
      `).bind(
        parseInt(tmdb_id), title_ko || "", title_en || "", poster_path,
        tmdb_rating, nowIsoManual
      ).run();

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, after_value) VALUES ('manual_ranking_add', ?, ?, ?, ?)"
      ).bind(platform, category_slot, String(tmdb_id), JSON.stringify({ rank, title_ko, title_en, memo })).run();

      return new Response(JSON.stringify({
        ok: true,
        data: { title_ko, title_en, poster_path, genre, release_year, tmdb_rating }
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/manual-rankings/reorder ──────────────────────
  if (path === "/admin/manual-rankings/reorder" && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { platform, category_slot, items } = body;
      if (!platform || !category_slot || !Array.isArray(items)) {
        return new Response(JSON.stringify({ ok: false, message: "platform, category_slot, items required" }), { status: 400, headers });
      }
      // 충돌 방지: ① 임시 음수 rank → ② 정상 rank
      const step1 = items.map(item =>
        env.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = 'manual'")
          .bind(-parseInt(item.rank), parseInt(item.id))
      );
      await env.DB.batch(step1);
      const step2 = items.map(item =>
        env.DB.prepare("UPDATE rankings SET rank = ?, memo = ?, season = ? WHERE id = ? AND date = 'manual'")
          .bind(parseInt(item.rank), item.memo ?? null,
                item.season !== undefined && item.season !== null ? parseInt(item.season) : null,
                parseInt(item.id))
      );
      await env.DB.batch(step2);
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('manual_ranking_reorder', ?, ?, ?)"
      ).bind(platform, category_slot, JSON.stringify(items)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/manual-rankings/:id ─────────────────────────
  if (path.match(/^\/admin\/manual-rankings\/\d+$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id  = parseInt(path.split("/")[3]);
      const row = await env.DB.prepare(
        "SELECT * FROM rankings WHERE id = ? AND date = 'manual'"
      ).bind(id).first();
      if (!row) {
        return new Response(JSON.stringify({ ok: false, message: "Not found or not a manual ranking" }), { status: 404, headers });
      }
      await env.DB.prepare("DELETE FROM rankings WHERE id = ? AND date = 'manual'").bind(id).run();
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, target_id, before_value) VALUES ('manual_ranking_delete', ?, ?, ?, ?)"
      ).bind(row.platform, row.category_slot, String(row.tmdb_id),
        JSON.stringify({ rank: row.rank, title_ko: row.title_ko, memo: row.memo })).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/rankings/reorder ────────────────────────────
  if (path === "/admin/rankings/reorder" && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { date, platform, category_slot, items } = body;
      if (!date || !platform || !category_slot || !Array.isArray(items)) {
        return new Response(JSON.stringify({ ok: false, message: "date, platform, category_slot, items required" }), { status: 400, headers });
      }
      // [2026-07-17 수정] 기존엔 "①전부 마이너스로 피신 → ②원래 순위로 복귀"를 완전히 별개인
      // batch() 두 번으로 나눠서 실행했음. 문제는 이 둘이 서로 다른 트랜잭션이라, ①은 성공하고
      // ②만 실패하는 경우(예: 클라이언트가 보낸 items에 실제 행 개수와 안 맞는 rank가 섞여
      // UNIQUE 제약 충돌 등) ①의 "마이너스 피신" 상태가 영구히 DB에 남아버리는 버그가 있었음
      // (실제로 티빙 카테고리에서 순위가 전부 마이너스로 뒤집혀 보이는 사고 발생, 2026-07-17).
      // 두 단계를 하나의 batch()로 합치면 D1이 전체를 하나의 트랜잭션으로 실행하기 때문에,
      // 중간에 어느 한 문장이라도 실패하면 전체가 롤백되어 "마이너스에 갇히는" 상태 자체가
      // 구조적으로 불가능해짐 — 순위 오염 없이 항상 저장 전 상태 그대로 남거나, 전부 성공한다.
      const stmts = [
        ...items.map(item =>
          env.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?")
            .bind(-parseInt(item.rank), parseInt(item.id), date, platform, category_slot)
        ),
        ...items.map(item =>
          env.DB.prepare("UPDATE rankings SET rank = ? WHERE id = ? AND date = ? AND platform = ? AND category_slot = ?")
            .bind(parseInt(item.rank), parseInt(item.id), date, platform, category_slot)
        ),
      ];
      await env.DB.batch(stmts);
      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('ranking_reorder', ?, ?, ?)"
      ).bind(platform, category_slot, JSON.stringify(items)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/sync-ratings ────────────────────────────────
  if (path === "/admin/sync-ratings" && request.method === "PATCH") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT r.id, r.tmdb_id
        FROM rankings r
        JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.tmdb_rating IS NULL AND r.tmdb_id IS NOT NULL AND w.tmdb_rating IS NOT NULL
        LIMIT 500
      `).all();
      if (!results.length) {
        return new Response(JSON.stringify({ ok: true, updated: 0, message: "동기화할 데이터 없음" }), { headers });
      }
      const updates = results.map(row =>
        env.DB.prepare("UPDATE rankings SET tmdb_rating = (SELECT tmdb_rating FROM works WHERE tmdb_id = ?) WHERE id = ?")
          .bind(row.tmdb_id, row.id)
      );
      await env.DB.batch(updates);
      return new Response(JSON.stringify({ ok: true, updated: results.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/:tmdb_id/rating-status ────────────────────
  // [2026-07-13 신설] 특정 작품 하나의 works.tmdb_rating과, rankings에 흩어진
  // 행들(플랫폼/날짜별로 여러 개일 수 있음)의 tmdb_rating을 나란히 보여줌.
  // sync-rating-single로 실제 반영하기 전에 "뭐가 얼마나 다른지" 미리 확인하는 용도.
  // 읽기 전용이라 _checkAuth 없이도 큰 문제는 없으나, 어드민 화면 전용이므로 통일성 위해 체크함.
  if (path.startsWith("/admin/works/") && path.endsWith("/rating-status") && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/admin/works/")[1].split("/rating-status")[0]);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }

      const work = await env.DB.prepare(
        "SELECT tmdb_id, title_ko, title_en, tmdb_rating, rating_updated_at FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      if (!work) {
        return new Response(JSON.stringify({ ok: false, message: "works에 없는 작품입니다" }), { status: 404, headers });
      }

      const { results: rankingRows } = await env.DB.prepare(`
        SELECT id, platform, category_slot, date, tmdb_rating
        FROM rankings
        WHERE tmdb_id = ?
        ORDER BY date DESC, platform ASC
        LIMIT 50
      `).bind(tmdb_id).all();

      return new Response(JSON.stringify({
        ok: true,
        works: {
          tmdb_id: work.tmdb_id,
          title_ko: work.title_ko,
          title_en: work.title_en,
          tmdb_rating: work.tmdb_rating,
          rating_updated_at: work.rating_updated_at,
        },
        rankings: rankingRows, // 각 행: { id, platform, category_slot, date, tmdb_rating }
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/sync-rating-single ───────────────────────
  // [2026-07-13 신설] 특정 작품 하나만 급하게 맞춰야 할 때 쓰는 수동 동기화.
  // 기존 /admin/sync-ratings(PATCH)는 "rankings.tmdb_rating이 NULL인 것만" 채우는
  // 대량 배치용이라, 이미 값이 들어있는데 "값이 틀린" 경우는 못 고침 — 그 사각지대를 메움.
  // body.refresh=true면 TMDB에서 강제로 새로 조회해 works부터 갱신한 뒤(방문 시 자동
  // 새로고침의 1일/5일 주기 제한을 무시하고 즉시 실행), 그 works 값을 rankings 전체 행에
  // 조건 없이(NULL 여부 무관) 강제로 덮어씀. refresh=false/생략이면 TMDB 재조회 없이
  // 지금 works에 있는 값을 그대로 rankings에 반영만 함(가장 빠른 경로).
  if (path === "/admin/works/sync-rating-single" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdb_id = parseInt(body.tmdb_id);
      const refresh = !!body.refresh;

      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }

      const work = await env.DB.prepare(
        "SELECT tmdb_id, media_type, tmdb_rating FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      if (!work) {
        return new Response(JSON.stringify({ ok: false, message: "works에 없는 작품입니다" }), { status: 404, headers });
      }

      let finalRating = work.tmdb_rating ?? null;

      // ── refresh=true: TMDB에서 강제로 새로 조회 (backfill-rating과 동일한 tv/movie 폴백 패턴) ──
      if (refresh) {
        const mtypes = work.media_type ? [work.media_type] : ["tv", "movie"];
        let matched = false;
        let rating = null;
        let releaseDate = null;

        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            matched = true;
            rating      = data.vote_average ?? null; // 0점(투표수 부족)도 유효값 — ?? 사용
            releaseDate = data.release_date || data.first_air_date || null;
            break;
          } catch (e) { /* 다음 media_type 시도 */ }
        }

        if (!matched) {
          return new Response(JSON.stringify({
            ok: false, message: "TMDB 조회 실패 — 잠시 후 다시 시도해주세요",
          }), { status: 502, headers });
        }

        const nowIso = new Date().toISOString();
        await env.DB.prepare(
          "UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?"
        ).bind(rating, releaseDate, nowIso, tmdb_id).run();

        finalRating = rating;
      }

      // ── rankings 전체 행에 강제 반영 (NULL 조건 없음 — 값이 있어도 무조건 덮어씀) ──
      const result = await env.DB.prepare(
        "UPDATE rankings SET tmdb_rating = ? WHERE tmdb_id = ?"
      ).bind(finalRating, tmdb_id).run();

      return new Response(JSON.stringify({
        ok: true,
        tmdb_rating: finalRating,
        rankings_updated: result.meta?.changes ?? 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/rankings/rating-check ────────────────────────────
  // [2026-07-14 신설] "OTT 평점 반영" 탭 전용 — 특정 플랫폼+카테고리의
  // 가장 최근 크롤링 날짜 순위 리스트를 뽑아서, 각 행마다 rankings.tmdb_rating과
  // works.tmdb_rating을 나란히 붙여서 반환. 프론트가 이 응답 하나로 "뭐가 몇 개나
  // 다른지"를 한 번에 렌더링할 수 있음(작품마다 별도 API 호출 불필요).
  // 날짜는 항상 "가장 최근 크롤링 날짜"(date < 'manual' 중 MAX) 고정 — 수동고정(is_manual=2)
  // 작품도 크롤링 시점에 그날 날짜로 복사되는 기존 구조라 별도 처리 불필요.
  if (path === "/admin/rankings/rating-check" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const platform      = url.searchParams.get("platform");
      const category_slot = url.searchParams.get("category_slot");
      if (!platform || !category_slot) {
        return new Response(JSON.stringify({ ok: false, message: "platform, category_slot required" }), { status: 400, headers });
      }

      const { results } = await env.DB.prepare(`
        SELECT r.tmdb_id, r.rank, r.title_ko,
               r.tmdb_rating   AS rankings_rating,
               w.tmdb_rating   AS works_rating,
               w.rating_updated_at
        FROM rankings r
        LEFT JOIN works w ON r.tmdb_id = w.tmdb_id
        WHERE r.platform = ? AND r.category_slot = ?
          AND r.date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        ORDER BY r.rank ASC
      `).bind(platform, category_slot).all();

      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/collect-keywords ────────────────────
  // keywords가 비어있는 works를 대상으로 TMDB에서 일괄 수집
  // Workers 실행시간 제한 때문에 요청당 limit(기본 20, 최대 50)개씩만 처리 —
  // 어드민 화면에서 remaining이 0이 될 때까지 반복 호출하는 방식으로 사용
  // [2026-07-14 추가] adult_flag=1(성인물로 표시됨) 작품은 수집 대상에서 제외.
  //   대상 조회 + remaining 카운트 두 쿼리 모두 동일 조건 적용(안 맞추면 remaining이
  //   실제보다 부풀려져서 배치를 반복 호출해도 안 줄어드는 상태가 됨).
  if (path === "/admin/works/collect-keywords" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 20, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE (keywords IS NULL OR keywords = '')
        AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({ ok: true, processed: 0, attempted: 0, remaining: 0, message: "수집할 작품 없음" }), { headers });
      }

      let processed = 0;
      let skippedRetry = 0; // 이번 배치에서 응답 실패로 재시도 대기 상태로 남긴 개수
      const updates = [];
      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let keywords  = "";
        let anySuccess = false; // TMDB로부터 정상 응답을 한 번이라도 받았는지
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}/keywords?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue; // 이 media_type 실패 — 다음 타입 시도 (anySuccess는 그대로)
            anySuccess = true;
            const data   = await resp.json();
            const kwList = data.keywords || data.results || []; // 영화: keywords, TV: results
            if (kwList.length) {
              keywords = kwList.map(k => k.name).filter(Boolean).join(",");
              break;
            }
          } catch (e) { /* 네트워크 오류 — 다음 media_type으로 계속 시도 */ }
        }

        if (keywords) {
          // [2026-07-19] softcore 자동 성인물 지정 로직 제거함.
          // 성인물 자동판별은 이제 videos.js의 POST /works/register(등록 시점)에서 처리하므로,
          // 이 배치는 원래 목적(일반 작품 keywords 수집·번역용)만 수행하고 adult_flag는 건드리지 않음.
          updates.push(
            env.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind(keywords, row.tmdb_id)
          );
          processed++;
        } else if (anySuccess) {
          // TMDB가 정상 응답했는데 진짜로 키워드가 없는 경우만 '__NONE__' 확정
          // (프론트/검색 쪽에서 keywords==='__NONE__'이면 빈 배열로 취급)
          updates.push(
            env.DB.prepare("UPDATE works SET keywords = ? WHERE tmdb_id = ?").bind("__NONE__", row.tmdb_id)
          );
        } else {
          // 응답 자체를 한 번도 못 받음(네트워크 오류/TMDB 일시 오류) — __NONE__로 마킹하지 않고
          // keywords를 그대로 둬서(NULL/'') 다음 배치에서 자동 재시도되게 함
          skippedRetry++;
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE (keywords IS NULL OR keywords = '') AND (adult_flag IS NULL OR adult_flag NOT IN (1, 2))"
      ).first();

      return new Response(JSON.stringify({
        ok: true, processed, attempted: targets.length, skippedRetry, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/collect-ott ───────────────────────────
  // work_ott(정규화 테이블)를 채우는 배치 — 원래 search-results.html이 브라우저에서
  // 실시간으로 하던 4단계 OTT 판정 로직을 서버로 그대로 옮긴 것.
  //   Priority 1: 오뜨랑 DB 랭킹(오늘자 rankings) — 가장 신뢰도 높음
  //   Priority 2: 쿠팡플레이는 TMDB Watch Providers에 데이터가 거의 없어 TMDB Networks(id=5169)로 보완 (TV만)
  //   Priority 3: TMDB Watch Providers — 위 두 개로 못 채운 나머지 보완
  //   Priority 4: 어드민 "OTT 보러가기" 수동 오버라이드(work_ott_overrides) — 항상 최우선 적용
  // 대상: ott_updated_at이 없거나(한 번도 수집 안 함) 15일 넘게 지난 작품.
  // TMDB 응답을 하나도 못 받았고 랭킹으로도 확인 안 된 작품은 __NONE__ 같은 확정 마킹 없이
  // ott_updated_at을 그대로 둬서 다음 배치에서 자동 재시도되게 함 (collect-keywords와 동일 원칙).
  if (path === "/admin/works/collect-ott" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 30); // TMDB 호출 2회/건이라 키워드 수집보다 작게 잡음
      const CUTOFF_DAYS = 15;

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, media_type FROM works
        WHERE (ott_updated_at IS NULL OR ott_updated_at < datetime('now', '-${CUTOFF_DAYS} days'))
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({ ok: true, processed: 0, attempted: 0, remaining: 0, message: "수집할 작품 없음" }), { headers });
      }

      const tmdbIds      = targets.map(t => t.tmdb_id);
      const placeholders = tmdbIds.map(() => "?").join(",");

      // Priority 1 — 오늘자 랭킹을 한 번에 조회 (건마다 따로 안 물어봄)
      const { results: rankRows } = await env.DB.prepare(`
        SELECT tmdb_id, platform FROM rankings
        WHERE tmdb_id IN (${placeholders})
          AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
      `).bind(...tmdbIds).all();
      const rankMap = {};
      rankRows.forEach(r => {
        (rankMap[r.tmdb_id] ||= new Set()).add(r.platform);
      });

      // Priority 4 — 어드민 수동 오버라이드도 한 번에 조회
      const { results: overrideRows } = await env.DB.prepare(`
        SELECT tmdb_id, ott_key, action FROM work_ott_overrides
        WHERE tmdb_id IN (${placeholders})
      `).bind(...tmdbIds).all();
      const overrideMap = {};
      overrideRows.forEach(o => {
        (overrideMap[o.tmdb_id] ||= []).push(o);
      });

      const OTT_NAME_MATCH = [
        [/netflix/i,  "netflix"],
        [/tving/i,    "tving"],
        [/disney/i,   "disney"],
        [/coupang/i,  "coupang"],
        [/wavve/i,    "wavve"],
        [/watcha/i,   "watcha"],
      ];

      let processed     = 0;
      let skippedRetry  = 0;
      const stmts       = [];
      const touchedIds  = [];
      const failures     = []; // [2026-07-21 추가] 실패 사유를 실제로 기록 — 왜 계속 재시도 대상으로 남는지 눈으로 확인하기 위함

      for (const row of targets) {
        const tmdbId = row.tmdb_id;
        const mtype  = row.media_type === "movie" ? "movie" : "tv";
        const keys   = new Set(rankMap[tmdbId] || []); // Priority 1
        let anySuccess = false;
        let lastReason  = null; // 이번 건에서 마지막으로 확인된 실패 사유(성공하면 null로 안 씀)

        try {
          // Priority 2 — 쿠팡플레이 Network 보완 (TV만 해당)
          if (mtype === "tv" && !keys.has("coupang")) {
            const detResp = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${env.TMDB_API_KEY}`);
            if (detResp.ok) {
              anySuccess = true;
              const det = await detResp.json();
              if ((det.networks || []).some(n => n.id === 5169)) keys.add("coupang");
            } else {
              lastReason = `tv detail ${detResp.status}`;
            }
          }
          // Priority 3 — TMDB Watch Providers
          // [2026-07-17 수정] 원래 flatrate(구독형)만 봤는데, 우리 사이트는 구매/구독을
          // 구분하지 않는 원칙이라 rent(대여)/buy(구매)도 같이 인정하도록 변경.
          // Top Gun: Maverick 같은 대작 영화가 구독형 없이 대여/구매로만 걸려있어서
          // "OTT 없음"으로 잘못 저장되던 문제 발견 후 수정.
          const wpResp = await fetch(`https://api.themoviedb.org/3/${mtype}/${tmdbId}/watch/providers?api_key=${env.TMDB_API_KEY}`);
          if (wpResp.ok) {
            anySuccess = true;
            const wp = await wpResp.json();
            const kr = (wp.results && wp.results.KR) || {};
            const providers = [...(kr.flatrate || []), ...(kr.rent || []), ...(kr.buy || [])];
            providers.forEach(p => {
              const match = OTT_NAME_MATCH.find(([re]) => re.test(p.provider_name || ""));
              if (match) keys.add(match[1]);
            });
          } else if (wpResp.status === 404) {
            // [2026-07-21 추가] 404는 TMDB가 "이 작품엔 provider 데이터 자체가 없다"고 확정적으로
            // 답하는 것 — 429(rate limit)/5xx(TMDB 서버 일시 문제)와 달리 재시도해도 안 바뀜.
            // "확인했지만 OTT 없음"으로 확정 처리해서 재시도 대상에서 뺌.
            anySuccess = true;
          } else {
            lastReason = `watch/providers ${wpResp.status}`;
          }
        } catch (e) { lastReason = `예외: ${e.message}`; }

        if (!anySuccess && keys.size === 0) {
          // TMDB 응답도 못 받았고 랭킹으로도 확인 안 됨 — 재시도 대상으로 남김 (ott_updated_at 안 건드림)
          skippedRetry++;
          failures.push({ tmdb_id: tmdbId, title_ko: row.title_ko, reason: lastReason || "알 수 없음" });
          continue;
        }

        // Priority 4 — 어드민 수동 오버라이드 (최우선 적용)
        (overrideMap[tmdbId] || []).forEach(o => {
          if (o.action === "add") keys.add(o.ott_key);
          else if (o.action === "remove") keys.delete(o.ott_key);
        });

        // 기존 값 지우고 새로 씀 — 서비스 종료된 OTT는 자연스럽게 빠짐
        stmts.push(env.DB.prepare("DELETE FROM work_ott WHERE tmdb_id = ?").bind(tmdbId));
        [...keys].forEach(k => {
          stmts.push(env.DB.prepare("INSERT INTO work_ott (tmdb_id, ott_key) VALUES (?, ?)").bind(tmdbId, k));
        });
        touchedIds.push(tmdbId);
        processed++;
      }

      if (touchedIds.length) {
        const tp = touchedIds.map(() => "?").join(",");
        stmts.push(
          env.DB.prepare(`UPDATE works SET ott_updated_at = datetime('now') WHERE tmdb_id IN (${tp})`).bind(...touchedIds)
        );
      }
      if (stmts.length) await env.DB.batch(stmts);

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE (ott_updated_at IS NULL OR ott_updated_at < datetime('now', '-${CUTOFF_DAYS} days'))
      `).first();

      return new Response(JSON.stringify({
        ok: true, processed, attempted: targets.length, skippedRetry, remaining: remainRow?.cnt || 0, failures,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/ott-stuck ───────────────────────────────
  // OTT 수집 대상(ott_updated_at IS NULL)으로 계속 남아있는 작품 목록.
  // "계속 실패 중"인지 "아직 순서가 안 왔을 뿐"인지는 이 API만으로 구분 못 하므로,
  // 어드민 화면에서 일괄 수집을 여러 번 돌려 남은 게 이 정도로 줄어든 뒤에 확인하는 용도.
  if (path === "/admin/works/ott-stuck" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(new URL(request.url).searchParams.get("limit")) || 30, 50);
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, media_type FROM works
        WHERE ott_updated_at IS NULL
        ORDER BY tmdb_id DESC
        LIMIT ?
      `).bind(limit).all();
      return new Response(JSON.stringify({ ok: true, items: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/verify-type ────────────────────────────
  // media_type이 반대로 저장돼서 계속 404나는 작품들을 위한 확인용.
  // movie/tv 둘 다 TMDB에 직접 물어봐서, 실제로 존재하는 쪽을 찾아 알려줌 (자동 수정은 안 함).
  if (path === "/admin/works/verify-type" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body     = await request.json().catch(() => ({}));
      const tmdbIds  = (body.tmdb_ids || []).slice(0, 50);
      if (!tmdbIds.length) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_ids 필요해요" }), { status: 400, headers });
      }

      const results = await Promise.all(tmdbIds.map(async tmdbId => {
        const [movieResp, tvResp] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${env.TMDB_API_KEY}`),
          fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${env.TMDB_API_KEY}`),
        ]);
        const movieOk = movieResp.ok;
        const tvOk    = tvResp.ok;

        let suggested = null; // 'movie' | 'tv' | 'both'(모호해서 자동판단 불가) | 'none'(둘 다 없음)
        if (movieOk && tvOk) suggested = "both";
        else if (movieOk) suggested = "movie";
        else if (tvOk) suggested = "tv";
        else suggested = "none";

        return { tmdb_id: tmdbId, movie_ok: movieOk, tv_ok: tvOk, suggested };
      }));

      return new Response(JSON.stringify({ ok: true, results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/apply-type-fix ─────────────────────────
  // verify-type에서 확인된 결과를 관리자가 검토 후 실제로 media_type을 고칠 때 사용.
  // ott_updated_at은 건드리지 않음 — 어차피 NULL 상태라 다음 OTT 수집 배치가 바뀐 타입으로 자동 재시도함.
  if (path === "/admin/works/apply-type-fix" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const fixes = (body.fixes || []).filter(f => f.tmdb_id && ["movie", "tv"].includes(f.media_type));
      if (!fixes.length) {
        return new Response(JSON.stringify({ ok: false, message: "fixes 필요해요 (tmdb_id, media_type)" }), { status: 400, headers });
      }

      const stmts = fixes.map(f =>
        env.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?").bind(f.media_type, f.tmdb_id)
      );
      await env.DB.batch(stmts);

      return new Response(JSON.stringify({ ok: true, updated: fixes.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/adult-search ─────────────────────────────
  // 제목/줄거리/TMDB키워드에 성인물 의심 단어가 포함된 작품을 검색.
  // adult_flag(NULL=미검토)가 아직 안 매겨진 것만 대상으로 하여, 한 번 검토(삭제 또는
  // "정상으로 확인됨" 처리)한 작품은 다음 배치 조회에서 자동으로 빠짐.
  // ?word= 파라미터가 오면 기본 단어 목록 대신 그 단어 하나로만 검색(어드민 화면 검색창용).
  // ⚠️ 단어 매칭 방식이라 오탐/누락 둘 다 있을 수 있음 — 어드민 화면에서 사람이
  // 포스터·제목 보고 최종 판단하는 용도의 "후보 목록"일 뿐, 자동 확정 아님.
  if (path === "/admin/works/adult-search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 100);
      const customWord = (url.searchParams.get("word") || "").trim();

      let whereSql, allParams;

      if (customWord) {
        // 검색창에서 단어를 직접 넣은 경우 — 그 단어 하나로만 검색
        whereSql = `adult_flag IS NULL AND (title_ko LIKE ? OR title_en LIKE ? OR overview LIKE ? OR keywords LIKE ?)`;
        allParams = [`%${customWord}%`, `%${customWord}%`, `%${customWord}%`, `%${customWord}%`];
      } else {
        // 기본 의심 단어 목록 — 강한 신호/약한 신호 구분 없이 전부 OR 매칭(1차 후보군 넓게 잡기 목적)
        const SUSPECT_WORDS = [
          "정사", "야한",
          "계모", "새엄마", "처제", "형수", "동서", "유혹", "불륜", "외도", "몸매", "하룻밤",
        ];
        const suspectClause = SUSPECT_WORDS
          .map(() => "(title_ko LIKE ? OR overview LIKE ?)")
          .join(" OR ");
        const suspectParams = SUSPECT_WORDS.flatMap(w => [`%${w}%`, `%${w}%`]);

        const KEYWORD_TAGS = ["softcore", "erotica", "pinku eiga", "sexploitation"];
        const keywordClause = KEYWORD_TAGS.map(() => "keywords LIKE ?").join(" OR ");
        const keywordParams = KEYWORD_TAGS.map(t => `%${t}%`);

        whereSql = `adult_flag IS NULL AND (${suspectClause} OR ${keywordClause})`;
        allParams = [...suspectParams, ...keywordParams];
      }

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type
        FROM works
        WHERE ${whereSql}
        LIMIT ?
      `).bind(...allParams, limit).all();

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works WHERE ${whereSql}
      `).bind(...allParams).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/adult-review ────────────────────────────
  // 어드민이 화면에서 검토한 결과를 반영:
  //   delete_ids → 성인물로 확정, 바로 삭제
  //   clear_ids  → 성인물 아님으로 확인됨, adult_flag=0으로 표시만(삭제 안 함) →
  //                다음 adult-search 조회부터 후보 목록에서 제외됨
  if (path === "/admin/works/adult-review" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const deleteIds = Array.isArray(body.delete_ids) ? body.delete_ids.map(Number).filter(Boolean) : [];
      const clearIds  = Array.isArray(body.clear_ids)  ? body.clear_ids.map(Number).filter(Boolean)  : [];

      let deleted = 0;
      let cleared = 0;

      if (deleteIds.length) {
        const deletes = deleteIds.map(tmdbId =>
          env.DB.prepare("DELETE FROM works WHERE tmdb_id = ?").bind(tmdbId)
        );
        await env.DB.batch(deletes);
        deleted = deleteIds.length;
      }

      if (clearIds.length) {
        const updates = clearIds.map(tmdbId =>
          env.DB.prepare("UPDATE works SET adult_flag = 0 WHERE tmdb_id = ?").bind(tmdbId)
        );
        await env.DB.batch(updates);
        cleared = clearIds.length;
      }

      return new Response(JSON.stringify({
        ok: true, deleted, cleared,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-normalize-keywords ────────────
  // works.keywords(콤마 문자열)를 work_keywords(정규화 테이블)로 분해해서 옮기고,
  // 등장하는 영문 키워드를 keyword_translation에도 함께 등록(keyword_ko는 NULL로 남겨두고,
  // 이후 별도 AI 번역 배치가 채움 — 예능 태그 자동분류와 동일한 "auto 초안 → admin 확정" 구조 예정).
  // 외부 API 호출이 전혀 없는 순수 D1 내부 작업이라, collect-keywords류(외부 API 호출, 30~50개)보다
  // 훨씬 큰 단위(기본 200, 최대 300)로 처리 가능.
  // works.keywords_normalized_at으로 처리 여부를 추적 — 키워드가 없는/'__NONE__'인 작품도
  // "시도함"으로 마킹해서 매 배치마다 헛되이 다시 후보로 잡히지 않게 함
  // (release_year=0, original_language='unknown'과 동일한 센티널 원칙).
  // ⚠️ 2026-07-09 수정: 초기 버전은 "keywords가 아직 비어있는(=수집 전) 작품"까지 도장을 찍어버려서,
  //    이후 collect-keywords로 키워드가 채워져도 정규화 후보에서 영구 제외되는 버그가 있었음.
  //    → keywords IS NOT NULL AND keywords != '' 조건을 추가해, "수집 전이라 아직 모름"과
  //      "__NONE__(TMDB가 확인해줬는데 진짜 없음, 확정값)"을 구분해서, 확정된 것만 도장 찍도록 수정.
  if (path === "/admin/works/backfill-normalize-keywords" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 200, 300);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, keywords FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({ ok: true, processed: 0, attempted: 0, remaining: 0, message: "정규화할 작품 없음" }), { headers });
      }

      const statements = [];
      let processed = 0;
      const nowIso = new Date().toISOString();

      for (const row of targets) {
        // '__NONE__'은 "TMDB에 키워드 자체가 없어서 시도했지만 결과 없음" 센티널 —
        // collect-keywords와 동일하게, 글자 그대로 정규화 대상에 넣지 않도록 명시적으로 제외
        if (row.keywords && row.keywords !== '__NONE__') {
          // 같은 작품 안에서 키워드가 중복되는 경우 대비 Set으로 dedupe
          // (work_keywords에 tmdb_id+keyword UNIQUE 인덱스가 있어 중복 INSERT는 어차피 막히지만,
          //  batch 문 개수 자체를 줄여서 가볍게 처리하기 위함)
          const kwSet = new Set(
            row.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
          );
          if (kwSet.size) {
            for (const kw of kwSet) {
              statements.push(
                env.DB.prepare(
                  "INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)"
                ).bind(row.tmdb_id, kw)
              );
              statements.push(
                env.DB.prepare(
                  "INSERT OR IGNORE INTO keyword_translation (keyword_en) VALUES (?)"
                ).bind(kw)
              );
            }
            processed++;
          }
        }
        // 키워드 유무와 무관하게 항상 "시도함" 마킹 (무한 재대상화 방지)
        statements.push(
          env.DB.prepare(
            "UPDATE works SET keywords_normalized_at = ? WHERE tmdb_id = ?"
          ).bind(nowIso, row.tmdb_id)
        );
      }

      if (statements.length) await env.DB.batch(statements);

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE keywords_normalized_at IS NULL
          AND keywords IS NOT NULL AND keywords != ''
      `).first();

      return new Response(JSON.stringify({
        ok: true, processed, attempted: targets.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      // batch()는 실패 시 통째로 롤백되므로(부분 반영 없음), 안전하게 그대로 재시도 가능
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/keywords/translate ─────────────────────────
  // keyword_translation.keyword_ko가 비어있는(source IS NULL) 영문 키워드를
  // Claude API(Haiku)로 일괄 초벌 번역해 source='auto'로 저장.
  // 예능 태그 자동분류(classify-variety)와 동일한 "auto 초안 → admin 검토/확정" 구조 —
  // admin/keywords/review(POST)에서 source='admin'으로 확정되면 이 배치가 다시 건드리지 않음.
  // 짧은 단어/구 단위라 예능 태그(줄거리 포함)보다 프롬프트 부담이 적어 배치를 더 크게(기본 40, 최대 60) 잡음.
  //
  // ⚠️ 2026-07-11 수정 — "Claude가 요청받은 키워드를 응답에서 빠뜨리는" 경우 무한루프 방지
  // 기존엔 Claude 응답에 없는 키워드를 그냥 continue로 넘기고 아무 기록도 안 남겼음.
  // source가 계속 NULL로 남아있으니 다음 배치에서 다시 뽑히고, Claude가 같은 이유로
  // 또 빠뜨리면 영원히 반복(실제로 'pacific ocean' 1개가 이 패턴으로 무한루프 발생 확인됨).
  // collect-keywords의 __NONE__ 오탐 버그(2026-07-02)와 같은 계열 — "응답 실패"와
  // "아직 처리 안 함"을 구분 안 해서 생기는 문제. translate_attempts로 시도 횟수를
  // 추적해서, 일정 횟수(3회) 넘게 계속 빠지면 자동배치 대상에서 제외(관리자 수동 처리로 전환).
  if (path === "/admin/keywords/translate" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        ok: false, message: "ANTHROPIC_API_KEY가 Workers Secrets에 설정되어 있지 않습니다"
      }), { status: 500, headers });
    }

    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 40, 60);

      const { results: targets } = await env.DB.prepare(`
        SELECT keyword_en FROM keyword_translation
        WHERE source IS NULL
          AND (translate_attempts IS NULL OR translate_attempts < 3)
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, translated: 0, remaining: 0, message: "번역할 키워드 없음"
        }), { headers });
      }

      const kwListText = targets.map(t => `- ${t.keyword_en}`).join("\n");

      const systemPrompt =
        "너는 TMDB 영문 작품 키워드(테마/분위기 태그)를 한국 OTT 서비스 사용자용으로 번역하는 도우미다. " +
        "각 영문 키워드를 자연스럽고 간결한 한국어 명사구(대략 2~8자)로 번역해라. " +
        "직역보다 한국 시청자에게 익숙한 표현을 우선해라(예: revenge→복수, chaebol→재벌, coming of age→성장). " +
        "설명이나 부연 없이, 요청받은 키워드 전부에 대해 1:1로 번역해라. " +
        "반드시 JSON 배열만 출력하고, 다른 설명이나 코드블록(```)은 절대 포함하지 마라. " +
        "출력 형식: [{\"keyword_en\":\"revenge\",\"keyword_ko\":\"복수\"}, ...]";

      const userPrompt = `번역할 키워드 목록:\n${kwListText}`;

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!claudeResp.ok) {
        const errText = await claudeResp.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false, message: `Claude API 오류 (status ${claudeResp.status})`, detail: errText.slice(0, 300),
        }), { status: 502, headers });
      }

      const claudeData = await claudeResp.json();
      const rawText = (claudeData.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      let parsed;
      try {
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false, message: "Claude 응답 파싱 실패 — 다시 시도해주세요", raw: rawText.slice(0, 300),
        }), { status: 502, headers });
      }
      if (!Array.isArray(parsed)) parsed = [];

      // 이번 배치에 실제로 요청한 키워드만 반영(할루시네이션/다른 키워드 오염 방지)
      const targetSet = new Set(targets.map(t => t.keyword_en));
      const resultMap = new Map();
      for (const item of parsed) {
        const en = (item.keyword_en || "").trim().toLowerCase();
        const ko = (item.keyword_ko || "").trim();
        if (!en || !ko || !targetSet.has(en)) continue;
        resultMap.set(en, ko);
      }

      const updates = [];
      let translated = 0;
      for (const t of targets) {
        if (!resultMap.has(t.keyword_en)) {
          // Claude 응답에 없음 — 그냥 넘어가면 다음 배치에서 계속 같은 이유로
          // 빠질 수 있어 무한루프가 됨. 시도 횟수를 기록해서, 3회 넘게 반복되면
          // 자동배치 조회 조건(WHERE translate_attempts < 3)에서 자연스럽게 빠지게 함.
          updates.push(
            env.DB.prepare(
              "UPDATE keyword_translation SET translate_attempts = COALESCE(translate_attempts, 0) + 1 " +
              "WHERE keyword_en = ? AND source IS NULL"
            ).bind(t.keyword_en)
          );
          continue;
        }
        updates.push(
          env.DB.prepare(
            "UPDATE keyword_translation SET keyword_ko = ?, source = 'auto' WHERE keyword_en = ? AND source IS NULL"
          ).bind(resultMap.get(t.keyword_en), t.keyword_en)
        );
        translated++;
      }
      if (updates.length) await env.DB.batch(updates);

      // remaining: 자동배치가 다음에 실제로 집어들 수 있는 개수 (translate_attempts < 3 조건 동일 적용)
      // stuck: 3회 넘게 실패해서 자동배치에서 제외된 개수 — 관리자 수동 처리 필요
      const remainRow = await env.DB.prepare(`
        SELECT
          SUM(CASE WHEN source IS NULL AND (translate_attempts IS NULL OR translate_attempts < 3) THEN 1 ELSE 0 END) AS remaining,
          SUM(CASE WHEN source IS NULL AND translate_attempts >= 3 THEN 1 ELSE 0 END) AS stuck
        FROM keyword_translation
      `).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, translated,
        remaining: remainRow?.remaining || 0,
        stuck: remainRow?.stuck || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/keywords/review ──────────────────────────────
  // admin_videos.html "🔤 키워드 번역 검토" 그리드용 — AI 초안(source='auto') 목록 조회
  if (path === "/admin/keywords/review" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 30, 60);

      const { results: items } = await env.DB.prepare(`
        SELECT id, keyword_en, keyword_ko
        FROM keyword_translation
        WHERE source = 'auto'
        ORDER BY id ASC
        LIMIT ?
      `).bind(limit).all();

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/keywords/review ─────────────────────────────
  // 관리자가 검토 그리드에서 확인/수정한 한글 번역을 최종 확정 저장.
  // source를 'admin'으로 바꿔서 이후 keywords/translate 배치가 절대 다시 건드리지 않음
  // (variety_genre_source와 동일한 관리자 확정값 보호 원칙)
  if (path === "/admin/keywords/review" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      const valid = items.filter(it => it && it.id && typeof it.keyword_ko === "string" && it.keyword_ko.trim());

      if (!valid.length) {
        return new Response(JSON.stringify({ ok: false, message: "유효한 항목이 없어요" }), { status: 400, headers });
      }

      const updates = valid.map(it =>
        env.DB.prepare(
          "UPDATE keyword_translation SET keyword_ko = ?, source = 'admin' WHERE id = ?"
        ).bind(it.keyword_ko.trim(), parseInt(it.id))
      );
      await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM keyword_translation WHERE source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, updated: valid.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/keywords/search ──────────────────────────────
  // admin_videos.html "④ 키워드 검색/수정"용 — 영문(keyword_en) 또는 한글(keyword_ko/
  // keyword_ko_2/keyword_ko_3) 중 어디든 검색어가 포함되면 조회. 서로 다른 영문이 같은
  // 한글로 번역돼 중복 노출되는 것 같은 오탐을 발견했을 때 수동으로 찾아 고치는 용도.
  // [2026-07-18 수정] keyword_ko_2/keyword_ko_3는 검색 조건에서 빠져있어서, 2·3번에만
  // 들어있는 감정 키워드 등을 검색해도 안 걸리던 버그 수정.
  // keyword_translation은 규모가 작은 테이블(~4,500행)이라 LIKE 풀스캔도 부담 없음
  // (관리자가 가끔 수동 호출하는 용도라 트래픽상으로도 문제 없음).
  if (path === "/admin/keywords/search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: false, message: "검색어(q)가 필요해요" }), { status: 400, headers });
      }
      const like = `%${q}%`;
      const { results: items } = await env.DB.prepare(`
        SELECT id, keyword_en, keyword_ko, keyword_ko_2, keyword_ko_3, source
        FROM keyword_translation
        WHERE keyword_en LIKE ? OR keyword_ko LIKE ? OR keyword_ko_2 LIKE ? OR keyword_ko_3 LIKE ?
        ORDER BY keyword_en ASC
        LIMIT 50
      `).bind(like, like, like, like).all();

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/keywords/update ─────────────────────────────
  // 검색 결과에서 개별 키워드의 한글 번역만 수정. source는 항상 'admin'으로 고정
  // (검토 대기 중이던 항목을 여기서 먼저 고쳐도 확정 처리되도록).
  // 주의: 이 API로 수정해도 이미 캐싱된 작품페이지(keyword_ko_map, 5~100일 TTL)엔
  // 즉시 반영 안 됨 — 특정 작품에 바로 반영하려면 어드민 화면 ③번 SQL로 그 작품 캐시를 초기화할 것.
  if (path === "/admin/keywords/update" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const keyword_en = (body.keyword_en || "").trim();
      const keyword_ko = (body.keyword_ko || "").trim();
      // 2·3번은 선택 입력 — 빈 값이면 NULL로 저장 (1번만 필수)
      const keyword_ko_2 = (body.keyword_ko_2 || "").trim() || null;
      const keyword_ko_3 = (body.keyword_ko_3 || "").trim() || null;
      if (!keyword_en || !keyword_ko) {
        return new Response(JSON.stringify({ ok: false, message: "keyword_en, keyword_ko 모두 필요해요" }), { status: 400, headers });
      }
      const result = await env.DB.prepare(
        "UPDATE keyword_translation SET keyword_ko = ?, keyword_ko_2 = ?, keyword_ko_3 = ?, source = 'admin' WHERE keyword_en = ?"
      ).bind(keyword_ko, keyword_ko_2, keyword_ko_3, keyword_en).run();

      if (!result.meta || result.meta.changes === 0) {
        return new Response(JSON.stringify({ ok: false, message: "해당 keyword_en을 찾지 못했어요" }), { status: 404, headers });
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/keywords ────────────────────────────────
  // [2026-07-15 신설] admin_videos.html "④ 작품 검색으로 키워드 수정"용 —
  // 작품 제목(부분일치) 또는 tmdb_id(완전일치)로 작품을 찾고, 그 작품(들)에 붙은
  // 키워드 전체를 keyword_translation과 조인해서 반환. 특정 작품에 왜 이 키워드가
  // 붙었는지 확인하고 그 자리에서 한글 번역(최대 3개)을 고칠 때 사용.
  // 응답 items는 /admin/keywords/search와 완전히 동일한 필드 형태라 프론트에서
  // 같은 렌더링/저장 로직을 그대로 재사용할 수 있음.
  if (path === "/admin/works/keywords" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: false, message: "검색어(q)가 필요해요" }), { status: 400, headers });
      }

      let works;
      if (/^\d+$/.test(q)) {
        // 숫자만 입력하면 tmdb_id 완전일치로 우선 취급
        const row = await env.DB.prepare(
          "SELECT tmdb_id, title_ko, title_en FROM works WHERE tmdb_id = ?"
        ).bind(parseInt(q)).first();
        works = row ? [row] : [];
      } else {
        const { results } = await env.DB.prepare(`
          SELECT tmdb_id, title_ko, title_en FROM works
          WHERE title_ko LIKE ? OR title_en LIKE ?
          ORDER BY tmdb_rating DESC
          LIMIT 5
        `).bind(`%${q}%`, `%${q}%`).all();
        works = results;
      }

      if (!works.length) {
        return new Response(JSON.stringify({ ok: true, works: [], items: [] }), { headers });
      }

      const tmdbIds = works.map(w => w.tmdb_id);
      const placeholders = tmdbIds.map(() => "?").join(",");
      const { results: items } = await env.DB.prepare(`
        SELECT DISTINCT kt.id, kt.keyword_en, kt.keyword_ko, kt.keyword_ko_2, kt.keyword_ko_3, kt.source
        FROM work_keywords wk
        JOIN keyword_translation kt ON kt.keyword_en = wk.keyword
        WHERE wk.tmdb_id IN (${placeholders})
        ORDER BY kt.keyword_en ASC
      `).bind(...tmdbIds).all();

      return new Response(JSON.stringify({ ok: true, works, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/:tmdb_id/reset-keyword-cache ───────────
  // [2026-07-15 신설] 키워드 번역을 고쳐도 작품페이지 캐시(keyword_ko_map, 5~100일 TTL) 때문에
  // 바로 반영 안 되는 문제 — 예전엔 D1 콘솔에서 SQL을 직접 실행해야 했는데, 자주 쓰는
  // 작업이라 버튼 하나로 처리할 수 있게 API로 분리.
  const resetCacheMatch = path.match(/^\/admin\/works\/(\d+)\/reset-keyword-cache$/);
  if (resetCacheMatch && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(resetCacheMatch[1]);
      const result = await env.DB.prepare(
        "UPDATE works SET keyword_ko_map_updated_at = NULL WHERE tmdb_id = ?"
      ).bind(tmdb_id).run();

      if (!result.meta || result.meta.changes === 0) {
        return new Response(JSON.stringify({ ok: false, message: "해당 tmdb_id를 찾지 못했어요" }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }
  // TMDB discover API로 인기순 한국 작품을 조회해 works 테이블에 신규 등록
  // (랭킹에는 올리지 않음 — 검색/키워드 매칭 대상 풀만 넓히는 용도)
  // 이미 works에 있는 tmdb_id는 절대 덮어쓰지 않고 건너뜀 (기존 데이터 보호)
  // 어드민 화면에서 media_type을 번갈아가며 page를 1씩 증가시켜 반복 호출하는 방식으로 사용
  if (path === "/admin/works/discover-collect" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const mediaType = body.media_type;
      const page = Math.max(parseInt(body.page) || 1, 1);
      const year = parseInt(body.year) || null; // [2026-07-21 추가] 연도 지정 시 그 해 작품만 조회

      if (!["movie", "tv"].includes(mediaType)) {
        return new Response(JSON.stringify({
          ok: false, message: "media_type은 'movie' 또는 'tv'만 허용"
        }), { status: 400, headers });
      }

      // ① TMDB discover — 인기순 한국 작품 목록 조회
      // [2026-07-21 수정] 연도 미지정 시 인기순 정렬만으로는 1960년대 등 무명 구작이 많이
      // 섞여 들어오는 문제가 있어, year가 오면 그 연도로 좁혀서(그 안에서는 인기순 유지) 조회.
      const yearParam = year
        ? (mediaType === "movie" ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`)
        : "";
      const discoverUrl = mediaType === "movie"
        ? `https://api.themoviedb.org/3/discover/movie?api_key=${env.TMDB_API_KEY}&language=ko-KR&region=KR&with_original_language=ko&sort_by=popularity.desc${yearParam}&page=${page}`
        : `https://api.themoviedb.org/3/discover/tv?api_key=${env.TMDB_API_KEY}&language=ko-KR&with_origin_country=KR&sort_by=popularity.desc${yearParam}&page=${page}`;

      const discoverResp = await fetch(discoverUrl);
      if (!discoverResp.ok) {
        return new Response(JSON.stringify({
          ok: false, message: `TMDB discover 조회 실패 (status ${discoverResp.status})`
        }), { status: 502, headers });
      }
      const discoverData = await discoverResp.json();
      const results     = discoverData.results || [];
      const totalPages  = discoverData.total_pages || 1;

      if (!results.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, inserted: 0, skipped: 0, conflicts: [],
          hasNextPage: false, nextPage: page + 1, totalPages,
        }), { headers });
      }

      // ② 이미 works에 있는 tmdb_id는 제외 (기존 데이터 보호 — 절대 덮어쓰지 않음)
      // [2026-07-21 수정] 기존엔 tmdb_id만 보고 무조건 건너뛰었음. 이제 media_type까지 같이 조회해서,
      // "이미 같은 타입으로 등록된 정상 중복"과 "다른 타입으로 이미 등록돼 있어 저장 자체가 불가능한
      // 충돌(예: movie로 등록된 199인데 tv 199도 존재)"을 구분함 — 충돌은 조용히 버리지 않고 목록으로 반환.
      const ids = results.map(r => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const { results: existingRows } = await env.DB.prepare(
        `SELECT tmdb_id, title_ko, media_type, poster_path FROM works WHERE tmdb_id IN (${placeholders})`
      ).bind(...ids).all();
      const existingMap = new Map((existingRows || []).map(r => [r.tmdb_id, r]));
      const newItems  = results.filter(r => !existingMap.has(r.id));
      const conflicts = results
        .filter(r => existingMap.has(r.id) && existingMap.get(r.id).media_type && existingMap.get(r.id).media_type !== mediaType)
        .map(r => ({
          tmdb_id: r.id,
          existing_title: existingMap.get(r.id).title_ko,
          existing_media_type: existingMap.get(r.id).media_type,
          existing_poster: existingMap.get(r.id).poster_path,
          requested_title: r.name || r.title || "",
          requested_media_type: mediaType,
          requested_poster: r.poster_path || null,
        }));
      const skippedDup = existingMap.size - conflicts.length; // 같은 타입으로 이미 있는 정상 중복

      // ③ 신규 작품만 상세정보 조회 후 works INSERT (기존 랭킹 등록 로직과 동일한 TMDB 조회 패턴)
      const updates = [];
      let inserted = 0;
      let skippedAdult = 0;
      for (const item of newItems) {
        let titleKo = null, titleEn = null, poster = null, genre = null,
            rating  = null, year = null, overview = "";

        try {
          const koResp = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${item.id}?language=ko-KR&api_key=${env.TMDB_API_KEY}`
          );
          if (koResp.ok) {
            const ko = await koResp.json();
            titleKo  = ko.name || ko.title || item.name || item.title || null;
            poster   = ko.poster_path || item.poster_path || null;
            genre    = (ko.genres || []).map(g => g.name).join(", ") || null;
            rating   = ko.vote_average ? parseFloat(ko.vote_average.toFixed(1)) : null;
            year     = parseInt((ko.first_air_date || ko.release_date || "").slice(0, 4)) || null;
            overview = ko.overview || item.overview || "";
          }
        } catch (e) { /* ko 상세조회 실패 시 discover 목록값으로 폴백 */ }

        if (!titleKo) continue; // 제목조차 못 가져오면 등록 스킵 (불완전 데이터 방지)

        // [2026-07-21 추가] softcore 키워드 체크 — 걸리면 등록 자체를 건너뜀.
        // discover API는 TMDB adult 필드에 의존하는데, 마이너/구작 국내 콘텐츠는 이 필드
        // 신뢰도가 낮아 성인물이 그대로 섞여 들어오는 문제가 실제로 있었음(videos.js와 동일 원칙).
        let isSoftcore = false;
        try {
          const kwResp = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${item.id}/keywords?api_key=${env.TMDB_API_KEY}`
          );
          if (kwResp.ok) {
            const kwData = await kwResp.json();
            const kwList = kwData.keywords || kwData.results || []; // 영화: keywords, TV: results
            isSoftcore = kwList.some(k => k.name === "softcore");
          }
        } catch (e) { /* 키워드 조회 실패해도 등록 자체는 진행 (오탐 방지 — 응답실패와 진짜없음 구분 원칙) */ }
        if (isSoftcore) { skippedAdult++; continue; }

        try {
          const enResp = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${item.id}?language=en-US&api_key=${env.TMDB_API_KEY}`
          );
          if (enResp.ok) {
            const en    = await enResp.json();
            const orig  = en.original_title || en.original_name || "";
            const enTxt = en.title || en.name || "";
            // 원어 제목이 한글이면(즉 영문 없으면) en 언어 응답값으로 대체
            titleEn = /[\uAC00-\uD7A3]/.test(orig) ? enTxt : (orig || enTxt);
          }
        } catch (e) { /* en 상세조회 실패해도 title_en 없이 진행 (나중에 보완 가능) */ }

        updates.push(
          env.DB.prepare(`
            INSERT INTO works
              (tmdb_id, title_ko, title_en, overview, genre, release_year,
               tmdb_rating, poster_path, media_type, match_source, confidence_score, first_matched_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discover', 90, date('now'))
            ON CONFLICT(tmdb_id) DO NOTHING
          `).bind(
            item.id, titleKo, titleEn || "", overview || "", genre || "",
            year, rating, poster, mediaType
          )
        );
        inserted++;
      }
      if (updates.length) await env.DB.batch(updates);

      return new Response(JSON.stringify({
        ok: true,
        attempted: results.length,
        inserted,
        skipped: skippedDup,
        skippedAdult,
        conflicts,
        hasNextPage: page < totalPages,
        nextPage: page + 1,
        totalPages,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/classify-variety ───────────────────────
  // 예능(Reality/Talk 등) 한국 작품 중 아직 예능 태그가 없는 작품을
  // Claude API로 일괄 분류해 variety_genre에 초안 저장(source='auto')
  // 관리자가 admin_videos.html 검토 그리드에서 확인/수정 후 source='admin'으로
  // 확정하면 이후 이 배치의 재처리 대상에서 영구 제외됨
  // (genre/keywords 컬럼과 동일한 "관리자 확정값 보호" 원칙)
  if (path === "/admin/works/classify-variety" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        ok: false, message: "ANTHROPIC_API_KEY가 Workers Secrets에 설정되어 있지 않습니다"
      }), { status: 500, headers });
    }

    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 10, 15); // 프롬프트 길이 관리를 위해 최대 15개로 제한

      // ① 태그 마스터 목록 조회 — 하드코딩 아님, DB가 최신 소스 (어드민에서 태그 추가 시 바로 반영)
      const { results: options } = await env.DB.prepare(
        "SELECT label FROM variety_genre_options ORDER BY sort_order ASC"
      ).all();
      if (!options.length) {
        return new Response(JSON.stringify({
          ok: false, message: "variety_genre_options에 태그가 하나도 없습니다. 먼저 태그를 등록해주세요."
        }), { status: 400, headers });
      }
      const labelList = options.map(o => o.label);

      // ② 분류 대상 조회 — Reality/Talk류 장르 + 한국작품 + 아직 미분류(source IS NULL)인 것만
      //    (관리자가 이미 확정(source='admin')했거나, 이전 배치에서 이미 처리(source='auto')한 것은 재처리 안 함)
      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, overview, genre
        FROM works
        WHERE original_language = 'ko'
          AND variety_genre_source IS NULL
          AND (
            genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR
            genre LIKE '%다큐멘터리%' OR genre LIKE '%리얼리티%' OR genre LIKE '%토크%'
          )
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, classified: 0, remaining: 0, message: "분류할 작품 없음"
        }), { headers });
      }

      // ③ Claude API 프롬프트 구성 — JSON만 출력하도록 강하게 명시 (파싱 실패 방지)
      const workListText = targets.map(t =>
        `- tmdb_id:${t.tmdb_id} / 제목:"${t.title_ko || ""}" / 줄거리:"${(t.overview || "").slice(0, 200)}"`
      ).join("\n");

      const systemPrompt =
        "너는 한국 예능 프로그램을 분류하는 도우미다. " +
        "아래 태그 목록 중에서만 골라야 하며, 목록에 없는 태그는 절대 만들어내지 마라. " +
        "각 작품마다 가장 어울리는 태그를 최대 2개까지 고르고, 애매하면 1개만 고르거나 \"일반 예능\"을 선택해라. " +
        "예능이 아니라고 판단되면(드라마/영화/다큐 등) tags를 빈 배열로 남겨라. " +
        "반드시 JSON 배열만 출력하고, 다른 설명이나 코드블록(```)은 절대 포함하지 마라. " +
        "출력 형식: [{\"tmdb_id\":123,\"tags\":[\"여행 예능\"]}, ...]";

      const userPrompt = `태그 목록: ${labelList.join(", ")}\n\n작품 목록:\n${workListText}`;

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", // 단순 분류 작업이라 가벼운 모델로 충분 (비용 절감)
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!claudeResp.ok) {
        // API 호출 자체가 실패 — 아무것도 업데이트하지 않고 다음 배치에서 재시도되게 둠
        const errText = await claudeResp.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false, message: `Claude API 오류 (status ${claudeResp.status})`, detail: errText.slice(0, 300),
        }), { status: 502, headers });
      }

      const claudeData = await claudeResp.json();
      const rawText = (claudeData.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      // ④ JSON 파싱 — 코드펜스(```json ... ```)가 섞여 나올 경우 대비해 방어적으로 추출
      let parsed;
      try {
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // 파싱 실패 — 이번 배치는 전부 재시도 대상으로 남김 (source 건드리지 않음)
        return new Response(JSON.stringify({
          ok: false, message: "Claude 응답 파싱 실패 — 다시 시도해주세요", raw: rawText.slice(0, 300),
        }), { status: 502, headers });
      }
      if (!Array.isArray(parsed)) parsed = [];

      // ⑤ 결과를 tmdb_id 기준 맵으로 정리 + 목록에 없는 태그(할루시네이션) 방어적 필터링
      const labelSet  = new Set(labelList);
      const resultMap = new Map();
      for (const item of parsed) {
        const tid = parseInt(item.tmdb_id);
        if (!tid) continue;
        const tags = Array.isArray(item.tags)
          ? item.tags.filter(t => labelSet.has(t)).slice(0, 2)
          : [];
        resultMap.set(tid, tags);
      }

      // ⑥ D1 batch UPDATE — 응답에 포함된 작품만 처리, 응답에서 누락된 작품은 다음 배치 재시도 대상으로 남김
      const updates = [];
      let classified = 0;
      for (const t of targets) {
        if (!resultMap.has(t.tmdb_id)) continue; // Claude 응답에 없음 — 다음 배치에서 재시도
        const tags = resultMap.get(t.tmdb_id);
        updates.push(
          env.DB.prepare(
            "UPDATE works SET variety_genre = ?, variety_genre_source = 'auto' WHERE tmdb_id = ?"
          ).bind(tags.length ? tags.join(",") : null, t.tmdb_id)
        );
        classified++;
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM works
        WHERE original_language = 'ko' AND variety_genre_source IS NULL
          AND (genre LIKE '%Reality%' OR genre LIKE '%Talk%' OR genre LIKE '%다큐멘터리%' OR genre LIKE '%리얼리티%' OR genre LIKE '%토크%')
      `).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, classified, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/variety-genre-options ──────────────────────────
  // admin_videos.html "🎭 예능 태그" 탭에서 태그 칩 버튼을 그리기 위한 목록 조회
  // (classify-variety 내부에서도 동일 테이블을 참조하므로, 여기서 태그를 추가/삭제하면
  //  자동분류 결과에도 곧바로 반영됨)
  if (path === "/admin/variety-genre-options" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        "SELECT id, label, sort_order FROM variety_genre_options ORDER BY sort_order ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/variety-review ───────────────────────────
  // Claude가 자동분류(variety_genre_source='auto')했지만 아직 관리자 확정 전인 작품 조회
  // 2026-07-07 변경: "건너뛰기"한 항목이 계속 최상단에 남아 새 항목을 가리던 문제 수정.
  // variety_review_skipped_at이 NULL인(=한 번도 안 건너뛴) 항목을 항상 최우선으로 보여주고,
  // 건너뛴 항목은 완전히 빼지 않고 "가장 오래전에 건너뛴 순"으로 뒤로 밀어서 계속 순환 노출됨
  // media_type도 함께 내려줘서 프론트가 TMDB 상세페이지로 바로 링크 걸 수 있게 함
  if (path === "/admin/works/variety-review" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 12, 30);

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path, variety_genre, media_type
        FROM works
        WHERE variety_genre_source = 'auto'
        ORDER BY (variety_review_skipped_at IS NULL) DESC, variety_review_skipped_at ASC, tmdb_id ASC
        LIMIT ?
      `).bind(limit).all();

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/variety-review ──────────────────────────
  // 관리자가 검토 그리드에서 확인/수정한 태그를 최종 확정 저장
  // variety_genre_source를 'admin'으로 바꿔서 이후 classify-variety 배치가
  // 이 작품을 절대 다시 건드리지 않도록 함 (genre/keywords와 동일한 보호 원칙)
  // tags를 빈 배열로 보내면 "이 작품은 예능 아님/태그 없음"으로 확정 저장됨
  if (path === "/admin/works/variety-review" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      const valid = items.filter(it => it && it.tmdb_id && Array.isArray(it.tags));

      if (!valid.length) {
        return new Response(JSON.stringify({ ok: false, message: "유효한 항목이 없어요" }), { status: 400, headers });
      }

      const updates = valid.map(it => {
        const tags = it.tags.filter(Boolean).slice(0, 2); // 최대 2개로 방어적 제한
        return env.DB.prepare(
          "UPDATE works SET variety_genre = ?, variety_genre_source = 'admin' WHERE tmdb_id = ?"
        ).bind(tags.length ? tags.join(",") : null, parseInt(it.tmdb_id));
      });
      await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE variety_genre_source = 'auto'"
      ).first();

      return new Response(JSON.stringify({
        ok: true, updated: valid.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/variety-review/skip ───────────────────────
  // "건너뛰기"한 작품을 완전히 빼는 게 아니라 variety_review_skipped_at에 현재 시각만 기록.
  // GET 쪽 ORDER BY가 이 값을 기준으로 순환시키므로, 저장은 이 컬럼 업데이트뿐 — 별도 상태 컬럼 불필요
  if (path === "/admin/works/variety-review/skip" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbIds = Array.isArray(body.tmdb_ids)
        ? body.tmdb_ids.map(v => parseInt(v)).filter(v => Number.isInteger(v))
        : [];

      if (!tmdbIds.length) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_ids required" }), { status: 400, headers });
      }

      const nowIso = new Date().toISOString();
      const updates = tmdbIds.map(id =>
        env.DB.prepare(
          "UPDATE works SET variety_review_skipped_at = ? WHERE tmdb_id = ?"
        ).bind(nowIso, id)
      );
      await env.DB.batch(updates);

      return new Response(JSON.stringify({ ok: true, skipped: tmdbIds.length }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/pinned-similar ──────────────────────────
  // "🔗 작품 연결" — 관리자가 지정한 두 작품을 "비슷한 취향의 작품" 최우선(Priority -1)으로 고정
  // 양방향 저장(A→B, B→A) — 어느 작품 페이지에서 봐도 서로 뜨게 하기 위함
  // 이미 연결돼있으면(UNIQUE 제약) 덮어쓰기(% 갱신)로 처리
  if (path === "/admin/works/pinned-similar" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbA = parseInt(body.tmdb_id);
      const tmdbB = parseInt(body.related_tmdb_id);
      let pct = parseInt(body.pinned_pct);
      if (!pct || pct < 1 || pct > 99) pct = 99; // 범위 밖이거나 미입력 시 기본값 99

      if (!tmdbA || !tmdbB) {
        return new Response(JSON.stringify({ ok: false, message: "두 작품의 tmdb_id가 모두 필요합니다" }), { status: 400, headers });
      }
      if (tmdbA === tmdbB) {
        return new Response(JSON.stringify({ ok: false, message: "같은 작품끼리는 연결할 수 없어요" }), { status: 400, headers });
      }

      // 두 작품 다 works 테이블에 존재하는지 먼저 확인 (없는 작품끼리 연결되는 것 방지)
      const { results: existCheck } = await env.DB.prepare(
        "SELECT tmdb_id FROM works WHERE tmdb_id IN (?, ?)"
      ).bind(tmdbA, tmdbB).all();
      if (existCheck.length < 2) {
        return new Response(JSON.stringify({ ok: false, message: "works 테이블에 없는 작품이 포함되어 있어요" }), { status: 400, headers });
      }

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(tmdbA, tmdbB, pct),
        env.DB.prepare(`
          INSERT INTO work_pinned_similar (tmdb_id, related_tmdb_id, pinned_pct)
          VALUES (?, ?, ?)
          ON CONFLICT(tmdb_id, related_tmdb_id) DO UPDATE SET pinned_pct = excluded.pinned_pct
        `).bind(tmdbB, tmdbA, pct),
      ]);

      return new Response(JSON.stringify({ ok: true, pinned_pct: pct }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/pinned-similar/:tmdb_id ──────────────────
  // 특정 작품의 현재 연결 목록 조회 — 어드민 "🔗 작품 연결" 섹션에서 작품 A 선택 시 표시
  if (path.startsWith("/admin/works/pinned-similar/") && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id = parseInt(path.split("/admin/works/pinned-similar/")[1]);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }
      const { results } = await env.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(tmdb_id).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/works/pinned-similar ─────────────────────────
  // 연결 해제 — 별도 id 추적 없이 (tmdb_id, related_tmdb_id) 쌍으로 양방향을 한 번에 삭제
  if (path === "/admin/works/pinned-similar" && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const tmdbA = parseInt(body.tmdb_id);
      const tmdbB = parseInt(body.related_tmdb_id);
      if (!tmdbA || !tmdbB) {
        return new Response(JSON.stringify({ ok: false, message: "두 작품의 tmdb_id가 모두 필요합니다" }), { status: 400, headers });
      }
      await env.DB.prepare(`
        DELETE FROM work_pinned_similar
        WHERE (tmdb_id = ? AND related_tmdb_id = ?) OR (tmdb_id = ? AND related_tmdb_id = ?)
      `).bind(tmdbA, tmdbB, tmdbB, tmdbA).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/collect ─────────────────────────────
  // works의 크레딧(출연진/감독)에서 person id를 추출해 persons 테이블에 등록
  // TMDB에는 "한국 인물만 인기순" 조회가 없어서, 이미 한국 작품으로 필터된
  // works의 크레딧에서 역으로 뽑는 방식 — person.html이 tmdb_id만으로 라이브 렌더링하므로
  // 여기서는 이름/직업 정도만 참고용으로 저장하고 상세정보는 캐싱하지 않음
  // works.credits_scanned=0인 작품을 대상으로 하며, 처리 후 1로 마킹해 재스캔 방지
  if (path === "/admin/persons/collect" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 20, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE credits_scanned IS NULL OR credits_scanned = 0
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, worksScanned: 0, personsFound: 0, remaining: 0, message: "스캔할 작품 없음"
        }), { headers });
      }

      const personRows = new Map(); // tmdb_id → { name, job, popularity, profile_path }  (배치 내 중복 제거용)
      const scannedIds  = [];

      for (const row of targets) {
        scannedIds.push(row.tmdb_id);
        const mtype = row.media_type === "tv" ? "tv" : "movie";
        // TV는 시즌 전체 출연진을 보려면 aggregate_credits가 필요 (§ 캐스트 표시 수정과 동일 원칙)
        const endpoint = mtype === "tv" ? "aggregate_credits" : "credits";

        try {
          const resp = await fetch(
            `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}/${endpoint}?api_key=${env.TMDB_API_KEY}`
          );
          if (!resp.ok) continue;
          const data = await resp.json();

          // 출연진 — 너무 많으면 의미 없는 단역까지 다 들어가니 상위 15명만
          // [2026-07-20 수정] popularity/profile_path는 이 응답에 이미 포함돼 있어서
          // 추가 API 호출 없이 같이 저장 (생년월일만 별도 백필 배치에서 처리)
          for (const c of (data.cast || []).slice(0, 15)) {
            if (c.id && c.name && !personRows.has(c.id)) {
              personRows.set(c.id, { name: c.name, job: "act", popularity: c.popularity || null, profile_path: c.profile_path || null });
            }
          }
          // 감독/크리에이터만 crew에서 추출
          for (const c of (data.crew || [])) {
            const isDirector = c.job === "Director" || c.job === "Creator" || c.department === "Directing"
              || (c.jobs || []).some(j => j.job === "Director" || j.job === "Creator"); // aggregate_credits는 jobs 배열 형태
            if (isDirector && c.id && c.name) {
              personRows.set(c.id, { name: c.name, job: "direct", popularity: c.popularity || null, profile_path: c.profile_path || null });
            }
          }
        } catch (e) { /* 이 작품만 스킵, 다음 작품 계속 */ }
      }

      const updates = [];
      for (const [tmdbId, info] of personRows) {
        updates.push(
          env.DB.prepare(
            `INSERT INTO persons (tmdb_id, name, job, popularity, profile_path) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(tmdb_id) DO NOTHING`
          ).bind(tmdbId, info.name, info.job, info.popularity, info.profile_path)
        );
      }
      // 스캔 완료 마킹 (person 발견 여부와 무관하게 항상 마킹 — 재시도 방지)
      for (const id of scannedIds) {
        updates.push(
          env.DB.prepare(`UPDATE works SET credits_scanned = 1 WHERE tmdb_id = ?`).bind(id)
        );
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE credits_scanned IS NULL OR credits_scanned = 0"
      ).first();

      return new Response(JSON.stringify({
        ok: true,
        worksScanned: targets.length,
        personsFound: personRows.size,
        remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/backfill-meta ────────────────────────
  // [2026-07-20 신규] persons 테이블에 생년월일이 없는 인물들을 TMDB 인물상세 API로
  // 채워넣는 배치. 신규 등록된 인물(생년월일 없음)뿐 아니라, 이 컬럼 추가 이전에
  // 등록됐던 기존 인물도 같이 대상이 됨 — 인물별로 1번씩 API 호출 필요해서
  // /admin/persons/collect보다 인원수를 작게 잡음(기본 20, 최대 50).
  // 생년월일이 TMDB에도 없는 인물은 NULL로 남기지 않고 빈 문자열('')로 표시해서
  // "조회 안 함"과 "조회했지만 값 없음"을 구분(sentinel 원칙, 무한 재시도 방지).
  // [2026-07-20 수정] has_korean_name(한국 배우 여부)/gender/place_of_birth 추가.
  // TMDB 인물상세 응답에 also_known_as(다른이름 목록)·gender·place_of_birth가
  // 이미 다 포함돼 있어서 추가 API 호출 없이 같이 채움. WHERE 조건에
  // has_korean_name IS NULL도 추가해서, 이 컬럼 생기기 전에 이미 생년월일까지
  // 끝났던 인물도 자동으로 다시 대상에 포함(생년월일은 이미 있으니 재조회만 함).
  // [2026-07-20 재수정] name_ko(한글 대표이름) 추가 — person.html이 이미 쓰고 있는
  // "also_known_as에서 한글 포함된 첫 이름을 대표이름으로" 로직을 그대로 재사용.
  // WHERE 조건에 name_ko IS NULL도 추가해서, 이전 배치에서 이미 처리됐지만
  // 한글 이름은 못 뽑았던 인물도 다시 대상에 포함.
  if (path === "/admin/persons/backfill-meta" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 20, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id FROM persons
        WHERE birthday IS NULL OR has_korean_name IS NULL OR name_ko IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, processed: 0, updated: 0, remaining: 0, message: "채울 인물 없음"
        }), { headers });
      }

      const updates = [];
      let updatedCount = 0;

      for (const row of targets) {
        try {
          // [2026-07-20 수정] language=ko-KR 추가 — TMDB는 also_known_as(팬 등록 별칭)와
          // 별개로, 유명인의 경우 커뮤니티가 등록한 "공식 번역 이름"이 language=ko-KR을
          // 붙였을 때만 name 필드에 통째로 담겨 나옴(예: 조지 루카스 — also_known_as엔
          // 한글이 아예 없지만 language=ko-KR로 조회하면 name="조지 루카스"로 옴).
          // 이 파라미터 없이는 이 번역 이름을 놓치게 되어 커버리지가 크게 줄어들었음.
          const resp = await fetch(
            `https://api.themoviedb.org/3/person/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}&language=ko-KR`
          );
          if (!resp.ok) {
            // 인물 자체가 TMDB에서 삭제/비공개 등 — 마킹해 재시도 안 하게
            // [2026-07-22 추가] name_ko_checked_at도 같이 남겨서, "한글이름 재채우기"
            // 배치가 방금 처리한 이 사람을 곧바로 또 대상으로 잡는 걸 방지
            updates.push(
              env.DB.prepare(`UPDATE persons SET birthday = '', has_korean_name = 0, name_ko = '', name_ko_checked_at = datetime('now') WHERE tmdb_id = ?`).bind(row.tmdb_id)
            );
            continue;
          }
          const data = await resp.json();
          const alsoKnown     = data.also_known_as || [];
          const placeOfBirth  = data.place_of_birth || "";
          // [2026-07-20 수정] 유명 외국 배우는 팬들이 등록한 한글 번역명이 also_known_as에
          // 섞여있어서(예: Julianne Moore → "줄리안 무어"), 한글 존재만으로 판정하면
          // 인기 많은 외국 배우일수록 오탐이 늘어남. 출생지로 교차검증 — 출생지가 있는데
          // 한국/서울이 아니면 한글 이름이 있어도 외국인으로 판정.
          // [2026-07-20 재수정] name 필드 자체가 language=ko-KR로 번역되어 오는 경우도
          // "한글 존재"로 같이 판정 대상에 포함 (조지 루카스 케이스).
          const nameIsKorean    = /[가-힣]/.test(data.name || "");
          const hasKoreanInList = nameIsKorean || alsoKnown.some(n => /[가-힣]/.test(n));
          const looksNonKorean   = placeOfBirth && !/Korea|한국|Seoul|서울/i.test(placeOfBirth);
          const hasKorean = (hasKoreanInList && !looksNonKorean) ? 1 : 0;
          // [2026-07-20 신규] 한글 대표이름 — person.html과 동일 로직(also_known_as에서
          // 한글 포함된 첫 항목). has_korean_name 판정과 무관하게, 한글이 실제로 있으면
          // 그냥 저장(오탐 방지용 출생지 교차검증은 "한국인 여부" 판정에만 적용하고,
          // 이름 자체는 있는 그대로 보여주는 게 맞음). 없으면 빈 문자열로 마킹.
          // [2026-07-20 재수정] name 필드가 번역된 경우 그 값을 우선 사용(person.html과 동일 우선순위).
          const koName = nameIsKorean ? data.name : (alsoKnown.find(n => /[가-힣]/.test(n)) || "");
          // [2026-07-22 추가] name_ko_checked_at — 이 배치가 "언제 확인했는지" 남겨야
          // "한글이름 재채우기"(refill-korean-name)가 방금 처리된 사람을 또 대상으로
          // 잡는 중복 확인 버그가 안 생김(원인 발견 후 수정, 2026-07-22).
          updates.push(
            env.DB.prepare(
              `UPDATE persons SET birthday = ?, popularity = ?, profile_path = ?, has_korean_name = ?, gender = ?, place_of_birth = ?, name_ko = ?, name_ko_checked_at = datetime('now') WHERE tmdb_id = ?`
            ).bind(
              data.birthday || "", data.popularity || null, data.profile_path || null,
              hasKorean, data.gender || null, placeOfBirth || null, koName,
              row.tmdb_id
            )
          );
          updatedCount++;
        } catch (e) {
          // 네트워크 오류 등 — 이번엔 스킵, 다음 배치에서 재시도(마킹 안 함)
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM persons WHERE birthday IS NULL OR has_korean_name IS NULL OR name_ko IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true,
        processed: targets.length,
        updated: updatedCount,
        remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/refill-korean-name ────────────────────
  // [2026-07-20 신설, 2026-07-22 수정] "인물 상세정보 채우기"(backfill-meta)와 완전히 분리된 전용 배치.
  // 예전엔 TMDB에 한글 이름이 없었지만(또는 그 당시 코드 버그로) '' 확정 마킹됐다가,
  // 나중에 TMDB에 한글 이름이 생긴 사람들을 복구하기 위한 목적 (예수정 케이스에서 발견).
  // birthday/popularity 등 다른 필드는 절대 안 건드림 — name_ko/has_korean_name만 격리해서 갱신.
  // ⚠️ [2026-07-22 버그 수정] backfill-meta가 name_ko_checked_at을 안 남기고 있어서, 이 배치가
  // backfill-meta 직후 실행되면 "방금 막 처리된 사람"을 곧바로 또 대상으로 잡아 똑같은 TMDB
  // 재조회를 반복하던 버그가 있었음(1107명 재확인, 신규 0명 — 실사용 중 발견). backfill-meta에도
  // name_ko_checked_at을 남기도록 고치고, 여기 조건도 "확인 이력 없음" 단독이 아니라
  // "확인 이력 없음 OR 확인한 지 1년 넘음"으로 바꿔서, 진짜 오래돼서 재확인이 필요한
  // 사람만 대상이 되도록 함(관리자님 결정 — 재확인 주기 1년).
  if (path === "/admin/persons/refill-korean-name" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 20, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id FROM persons
        WHERE name_ko = '' AND has_korean_name = 0
          AND (name_ko_checked_at IS NULL OR name_ko_checked_at < datetime('now', '-365 days'))
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, processed: 0, updated: 0, remaining: 0, message: "재확인할 인물 없음"
        }), { headers });
      }

      const updates = [];
      let updatedCount = 0;

      for (const row of targets) {
        try {
          // [2026-07-20 수정] language=ko-KR 추가 — TMDB 공식 번역 이름(name 필드)이
          // 이 파라미터 없이는 안 옴 (조지 루카스 케이스에서 발견된 원인)
          const resp = await fetch(
            `https://api.themoviedb.org/3/person/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}&language=ko-KR`
          );
          if (!resp.ok) {
            // 조회 자체가 실패 — 재확인은 했다는 표시만 남기고 값은 그대로 둠(다음날 재시도 가능하게)
            updates.push(
              env.DB.prepare(`UPDATE persons SET name_ko_checked_at = datetime('now') WHERE tmdb_id = ?`).bind(row.tmdb_id)
            );
            continue;
          }
          const data = await resp.json();
          const alsoKnown    = data.also_known_as || [];
          const placeOfBirth = data.place_of_birth || "";
          // person.html이 이름 표시에 쓰는 것과 완전히 동일한 로직 —
          // [2026-07-20 재수정] name 필드가 language=ko-KR로 번역되어 왔으면 그걸 우선 사용하고,
          // 없으면 also_known_as에서 한글 포함된 첫 항목 사용 (person.html과 완전히 동일한 우선순위)
          const nameIsKorean = /[가-힣]/.test(data.name || "");
          const koName = nameIsKorean ? data.name : (alsoKnown.find(n => /[가-힣]/.test(n)) || "");
          // has_korean_name 판정도 backfill-meta와 동일한 출생지 교차검증 유지
          const hasKoreanInList = koName !== "";
          const looksNonKorean  = placeOfBirth && !/Korea|한국|Seoul|서울/i.test(placeOfBirth);
          const hasKorean = (hasKoreanInList && !looksNonKorean) ? 1 : 0;

          updates.push(
            env.DB.prepare(
              `UPDATE persons SET name_ko = ?, has_korean_name = ?, name_ko_checked_at = datetime('now') WHERE tmdb_id = ?`
            ).bind(koName, hasKorean, row.tmdb_id)
          );
          if (koName) updatedCount++;
        } catch (e) {
          // 네트워크 오류 — 이번엔 스킵, 다음 배치에서 재시도(재확인 표시 안 남김)
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM persons
         WHERE name_ko = '' AND has_korean_name = 0
           AND (name_ko_checked_at IS NULL OR name_ko_checked_at < datetime('now', '-365 days'))`
      ).first();

      return new Response(JSON.stringify({
        ok: true,
        processed: targets.length,
        updated: updatedCount,
        remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/like-ranking ────────────────────────────
  // [2026-07-22 신설, 2026-07-22 수정] 인물 좋아요 순위 — 어드민 "인물 좋아요 순위" 탭용.
  // period="all"(전체)은 날짜별 집계(person_like_daily)가 아니라 persons.like_count를
  // 바로 정렬해서 보여줌 — 날짜별 집계는 이 기능을 만든 시점부터만 쌓이기 시작해서,
  // 그 전에 눌린 좋아요는 기간별(오늘/어제/1주일 등)엔 안 잡히지만 총합엔 이미 반영돼
  // 있으므로, "전체"에서만큼은 총합을 그대로 보여줘야 누락 없이 다 나옴.
  // 그 외 기간은 person_like_daily(날짜별 집계)를 기간별로 합산해서 순위를 매김. 50개씩,
  // "이전/다음"만 있는 단순 페이지네이션(전체 개수 세는 COUNT 쿼리 없음 —
  // limit+1개를 가져와서 남았으면 has_more=true로만 판단, 페이지 로그 탭과 동일 패턴).
  // 기간은 전부 "오늘 포함 최근 N일" 롤링 방식(달력상 이번달/올해가 아님) — 계산이 단순하고
  // "최근 인기"라는 목적에 더 잘 맞음.
  if (path === "/admin/persons/like-ranking" && request.method === "GET") {
    try {
      const period = url.searchParams.get("period") || "today";
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const limit  = 50;
      const offset = (page - 1) * limit;

      // [2026-07-22 추가] "전체"는 날짜별 집계를 아예 안 거치고 persons.like_count를 직접 정렬
      if (period === "all") {
        const { results } = await env.DB.prepare(`
          SELECT tmdb_id, name, name_ko, profile_path, like_count as total
          FROM persons
          WHERE like_count > 0
          ORDER BY like_count DESC
          LIMIT ? OFFSET ?
        `).bind(limit + 1, offset).all();

        const hasMore = results.length > limit;
        const items = results.slice(0, limit).map((r) => ({
          tmdb_id: r.tmdb_id,
          name: (r.name_ko && r.name_ko.trim()) ? r.name_ko : (r.name || `#${r.tmdb_id}`),
          profile_path: r.profile_path,
          like_count: r.total,
        }));

        return new Response(JSON.stringify({
          ok: true, items, page, has_more: hasMore, period,
        }), { headers });
      }

      const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const daysAgo = (n) => new Date(Date.now() + 9 * 60 * 60 * 1000 - n * 86400000).toISOString().slice(0, 10);

      let startDate;
      if (period === "today") startDate = kstToday;
      else if (period === "yesterday") startDate = daysAgo(1);
      else if (period === "week") startDate = daysAgo(6);
      else if (period === "month") startDate = daysAgo(29);
      else if (period === "year") startDate = daysAgo(364);
      else startDate = kstToday; // 알 수 없는 값이면 안전하게 "오늘"로 폴백

      const endDate = (period === "yesterday") ? daysAgo(1) : kstToday;

      const { results } = await env.DB.prepare(`
        SELECT d.tmdb_id, SUM(d.count) as total, p.name, p.name_ko, p.profile_path
        FROM person_like_daily d
        LEFT JOIN persons p ON p.tmdb_id = d.tmdb_id
        WHERE d.like_date >= ? AND d.like_date <= ?
        GROUP BY d.tmdb_id
        ORDER BY total DESC
        LIMIT ? OFFSET ?
      `).bind(startDate, endDate, limit + 1, offset).all();

      const hasMore = results.length > limit;
      const items = results.slice(0, limit).map((r) => ({
        tmdb_id: r.tmdb_id,
        name: (r.name_ko && r.name_ko.trim()) ? r.name_ko : (r.name || `#${r.tmdb_id}`),
        profile_path: r.profile_path,
        like_count: r.total,
      }));

      return new Response(JSON.stringify({
        ok: true, items, page, has_more: hasMore, period,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }


  // ── GET /admin/persons/profile-edits ────────────────────────────
  // [2026-07-22 신규] 사용자가 제출한 프로필(약력) 수정요청 대기 목록 — 어드민
  // "프로필 수정요청" 탭용. 대기중(pending)인 것만 보여줌(승인/거절 끝난 건 제외).
  // 50개씩, "이전/다음"만 있는 단순 페이지네이션(다른 탭들과 동일 패턴).
  if (path === "/admin/persons/profile-edits" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const limit  = 50;
      const offset = (page - 1) * limit;

      const { results } = await env.DB.prepare(`
        SELECT e.id, e.tmdb_id, e.old_bio, e.new_bio, e.created_at,
               p.name, p.name_ko, u.nickname
        FROM person_profile_edits e
        LEFT JOIN persons p ON p.tmdb_id = e.tmdb_id
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.status = 'pending'
        ORDER BY e.created_at ASC
        LIMIT ? OFFSET ?
      `).bind(limit + 1, offset).all();

      const hasMore = results.length > limit;
      const items = results.slice(0, limit).map((r) => ({
        id: r.id,
        tmdb_id: r.tmdb_id,
        person_name: (r.name_ko && r.name_ko.trim()) ? r.name_ko : (r.name || `#${r.tmdb_id}`),
        submitter: r.nickname || "(닉네임 없음)",
        old_bio: r.old_bio || "",
        new_bio: r.new_bio,
        created_at: r.created_at,
      }));

      return new Response(JSON.stringify({ ok: true, items, page, has_more: hasMore }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/profile-edits/:id ───────────────────────
  // [2026-07-22 신규] 프로필 수정요청 승인/거절 처리.
  // body: { action: "approve" | "reject", bio: "..." (approve일 때만 사용 — 관리자가
  //        최종 다듬은 내용을 그대로 저장. 요청 원문을 그대로 승인해도, 고쳐서 승인해도 됨) }
  // 승인 시 person_wiki_cache.bio_summary만 딱 갱신 — career_history/awards_text 등
  // 다른 위키 필드는 절대 안 건드림(필드별 독립 저장 원칙, wiki-manual-save와는 별개 쿼리).
  const profileEditActionMatch = path.match(/^\/admin\/persons\/profile-edits\/(\d+)$/);
  if (profileEditActionMatch && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const editId = parseInt(profileEditActionMatch[1], 10);
      const body   = await request.json().catch(() => ({}));
      const action = body.action;

      if (!["approve", "reject"].includes(action)) {
        return new Response(JSON.stringify({ ok: false, message: "action이 올바르지 않아요" }), { status: 400, headers });
      }

      const editRow = await env.DB.prepare(
        `SELECT tmdb_id FROM person_profile_edits WHERE id = ? AND status = 'pending'`
      ).bind(editId).first();
      if (!editRow) {
        return new Response(JSON.stringify({ ok: false, message: "대기중인 요청을 찾을 수 없어요(이미 처리됐을 수 있어요)" }), { status: 404, headers });
      }

      if (action === "approve") {
        const finalBio = (body.bio || "").trim();
        if (!finalBio) {
          return new Response(JSON.stringify({ ok: false, message: "승인할 내용이 비어있어요" }), { status: 400, headers });
        }
        // bio_summary 한 필드만 독립적으로 갱신 — 다른 위키 필드는 그대로 유지됨
        await env.DB.prepare(`
          INSERT INTO person_wiki_cache (tmdb_person_id, bio_summary) VALUES (?, ?)
          ON CONFLICT(tmdb_person_id) DO UPDATE SET bio_summary = excluded.bio_summary
        `).bind(editRow.tmdb_id, finalBio).run();
      }

      await env.DB.prepare(
        `UPDATE person_profile_edits SET status = ?, reviewed_at = datetime('now') WHERE id = ?`
      ).bind(action === "approve" ? "approved" : "rejected", editId).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }


  // [2026-07-20 신규] 위키 매칭 대상 후보 목록 — person_wiki_cache에 아직 없는
  // 인물만, 인기순 또는 이름순으로 50개씩. 여기선 위키 검색을 전혀 안 하고
  // DB 조회만 하므로 빠름 — "매칭 시도" 버튼은 다음 단계에서 별도로 만듦.
  // [2026-07-20 수정] nationality 파라미터로 전체/한국인/외국인 선택 가능
  // (all|korean|foreign, 기본값 all) — TMDB 인기도가 전세계 기준이라 필터 없이
  // 인기순 정렬하면 할리우드 배우들이 상위를 다 차지하는 문제가 있어서,
  // 관리자가 직접 고를 수 있게 탭으로 분리함.
  if (path === "/admin/persons/wiki-candidates" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const sort   = url.searchParams.get("sort") === "name" ? "name" : "popularity";
      const limit  = Math.min(parseInt(url.searchParams.get("limit")) || 50, 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset")) || 0, 0);
      const nationality = url.searchParams.get("nationality") || "all"; // all | korean | foreign
      const orderBy = sort === "name"
        ? "p.name ASC"
        : "p.popularity DESC NULLS LAST"; // D1(SQLite)은 NULLS LAST 지원 — 인기도 없는 인물은 뒤로

      let nationalityCond = "";
      if (nationality === "korean")  nationalityCond = "AND p.has_korean_name = 1";
      if (nationality === "foreign") nationalityCond = "AND p.has_korean_name = 0";
      // all이면 조건 없음 — has_korean_name이 아직 안 채워진(NULL) 인물도 포함됨

      const { results } = await env.DB.prepare(`
        SELECT p.tmdb_id, p.name, p.job, p.birthday, p.popularity, p.profile_path,
               p.gender, p.place_of_birth, p.has_korean_name, p.name_ko
        FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE w.tmdb_person_id IS NULL ${nationalityCond}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();

      const totalRow = await env.DB.prepare(`
        SELECT COUNT(*) as cnt FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE w.tmdb_person_id IS NULL ${nationalityCond}
      `).first();

      return new Response(JSON.stringify({
        ok: true,
        items: results,
        total: totalRow?.cnt || 0,
        offset, limit,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/wiki-match-attempt ───────────────────
  // [2026-07-20 신규] 선택된 인물들 실제 위키백과 검색 + 생년도 대조 매칭 시도.
  // 가벼운 정보만(제목/생년/짧은 요약/링크) person_wiki_match_queue에 저장 —
  // 수상내역·전체이력 같은 무거운 파싱은 여기서 안 하고, 나중에 "승인" 시점에
  // person_wiki_cache로 확정 이동하면서 별도로 처리할 예정(A안, 이전에 합의됨).
  // ⚠️ 인물 1명당 위키 요청이 최대 6번(검색 1 + 후보별 본문조회 최대 5) 나갈 수 있어서,
  // 한 번에 너무 많이 선택하면 느려지거나 타임아웃 위험 있음 — 실사용하며 적정 인원 확인 필요.
  if (path === "/admin/persons/wiki-match-attempt" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbIds = Array.isArray(body.tmdb_ids)
        ? body.tmdb_ids.map(n => parseInt(n)).filter(n => Number.isInteger(n)).slice(0, 50)
        : [];
      if (!tmdbIds.length) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_ids가 필요해요" }), { status: 400, headers });
      }

      const placeholders = tmdbIds.map(() => "?").join(",");
      const { results: people } = await env.DB.prepare(
        `SELECT tmdb_id, name, name_ko, birthday, popularity, profile_path FROM persons WHERE tmdb_id IN (${placeholders})`
      ).bind(...tmdbIds).all();

      const results = [];
      const updates = [];

      // [2026-07-20 신규] 위키백과(Wikimedia) API는 User-Agent 헤더 없는 요청을
      // 차단/제한하는 정책이 있음 — 이게 빠져있어서 전체 매칭이 실패했던 원인.
      const WIKI_UA = { "User-Agent": "OttrankBot/1.0 (https://ottrank.kr; 오뜨랑 인물 위키매칭)" };

      for (const p of people) {
        const searchName = p.name_ko || p.name;
        const tmdbYear   = (p.birthday || "").slice(0, 4);
        let matched = null;
        let debugInfo = null; // [2026-07-20 신규] 실패 이유를 화면에서 바로 볼 수 있게

        try {
          // 1단계: 위키백과 검색 — 후보 최대 5개
          const searchRes = await fetch(
            `https://ko.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchName)}&limit=5&namespace=0&format=json`,
            { headers: WIKI_UA }
          );
          if (!searchRes.ok) {
            debugInfo = `검색 요청 실패 (HTTP ${searchRes.status})`;
          } else {
            const searchData = await searchRes.json();
            const titles = searchData[1] || [];
            const urls   = searchData[3] || [];

          if (!titles.length) {
            debugInfo = "위키백과 검색 결과 자체가 없음";
          }

          // [2026-07-20 신규] "공유"처럼 흔한 단어인 이름은 위키백과에서
          // "이름 (배우)"로 동음이의 구분돼 있어서, 일반 검색 상위 5개 안에
          // 아예 안 들어올 수 있음 — 검색 결과와 무관하게 "{이름} (배우)" 문서를
          // 항상 후보 맨 앞에 직접 추가로 확인
          const disambigTitle = `${searchName} (배우)`;
          if (!titles.includes(disambigTitle)) {
            titles.unshift(disambigTitle);
            urls.unshift(`https://ko.wikipedia.org/wiki/${encodeURIComponent(disambigTitle.replace(/ /g, "_"))}`);
          }

          for (let i = 0; i < titles.length; i++) {
              const title   = titles[i];
              const pageUrl = urls[i];

              // 2단계: 후보 문서 요약(첫 문단) 조회 — 생년도 대조용
              const extractRes = await fetch(
                `https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=1&explaintext=1&format=json`,
                { headers: WIKI_UA }
              );
              if (!extractRes.ok) {
                debugInfo = `본문 조회 실패 (HTTP ${extractRes.status}, 후보: ${title})`;
                continue;
              }
              const extractData = await extractRes.json();
              const pages    = (extractData.query && extractData.query.pages) || {};
              const pageObj  = Object.values(pages)[0];
              const extract  = (pageObj && pageObj.extract) || "";
              const pageMissing = !pageObj || ("missing" in pageObj) || !extract;

              // [2026-07-20 수정] 위키 표기 방식이 다양함 — "이름(YYYY년 ~)", "이름(예명, YYYY년 ~)",
              // "이름(영어: Name; YYYY년 ~)"처럼 부가정보가 연도보다 먼저 나오는 경우도 있어서,
              // 괄호 안 전체를 먼저 확인. 1900~현재 연도 범위를 벗어나면 오탐(전화번호/작품연도 등)으로
              // 보고 무시. 괄호 안에서 못 찾으면 본문 전체 첫 "YYYY년"으로 폴백.
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
              const wikiYear = extractBirthYear(extract);

              // 3단계: 생년도 일치 → 확정. 생년월일 정보가 없고 후보 1명뿐이면 잠정 채택.
              const isYearMatch = tmdbYear && wikiYear && tmdbYear === wikiYear;
              // [2026-07-20 신규] 생년도가 서로 "다른 것으로 확인"되면(둘 다 값이 있고 불일치)
              // 동음이의 구분 문서("{이름} (배우)")라도 이 후보는 완전히 제외하고 다음 후보로 —
              // 동명이인 오매칭(예: 김미경 1965년생에 김미경 1963년생 위키가 붙는 사고) 방지.
              const isYearConflict = tmdbYear && wikiYear && tmdbYear !== wikiYear;
              const isOnlyCandidate = !tmdbYear && titles.length === 1;
              // [2026-07-20 신규] 매칭 기준 완화(관리자 판단) — "{이름} (배우)"로 명시적으로
              // 분리된 위키 문서가 실제 존재하면, 생년 정보가 아예 없을 때는 일단 매칭시킴.
              // 단, 생년이 서로 다르다고 "확인된" 경우는 위 isYearConflict에서 걸러지고 여기까지
              // 오지 않음 — "정보 없음"과 "다른 사람으로 확인됨"을 구분해서 처리.
              const isDisambigPageExists = title === disambigTitle && !pageMissing;
              if (isYearConflict) {
                if (i === titles.length - 1 && !matched) {
                  debugInfo = `후보 ${titles.length}개 확인함(${titles.join(', ')}) — 생년도가 달라 제외됨(TMDB: ${tmdbYear}, 위키: ${wikiYear})`;
                }
                continue;
              }
              if (isYearMatch || isOnlyCandidate || isDisambigPageExists) {
                matched = {
                  wiki_title: title,
                  wiki_birth_year: wikiYear || "",
                  wiki_summary: extract.slice(0, 200),
                  wiki_source_url: pageUrl,
                };
                break;
              }
              // 마지막 후보까지 다 봤는데 매칭 안 됐을 때를 위한 디버그 정보
              if (i === titles.length - 1 && !matched) {
                debugInfo = `후보 ${titles.length}개 확인함(${titles.join(', ')}) — 생년도 일치하는 후보 없음(TMDB: ${tmdbYear || '없음'})`;
              }
            }
          }
        } catch (e) {
          debugInfo = `요청 중 오류: ${e.message}`;
        }

        results.push({
          tmdb_id: p.tmdb_id,
          name_ko: p.name_ko || p.name,
          found: !!matched,
          wiki_title: matched ? matched.wiki_title : null,
          wiki_birth_year: matched ? matched.wiki_birth_year : null,
          wiki_summary: matched ? matched.wiki_summary : null,
          wiki_source_url: matched ? matched.wiki_source_url : null,
          debug: matched ? null : debugInfo,
        });

        updates.push(
          env.DB.prepare(`
            INSERT INTO person_wiki_match_queue
              (tmdb_person_id, person_name, popularity, profile_path, tmdb_birthday,
               wiki_title, wiki_birth_year, wiki_summary, wiki_source_url, match_found)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tmdb_person_id) DO UPDATE SET
              wiki_title = excluded.wiki_title,
              wiki_birth_year = excluded.wiki_birth_year,
              wiki_summary = excluded.wiki_summary,
              wiki_source_url = excluded.wiki_source_url,
              match_found = excluded.match_found
          `).bind(
            p.tmdb_id, p.name_ko || p.name, p.popularity || null, p.profile_path || null, p.birthday || null,
            matched ? matched.wiki_title : null,
            matched ? matched.wiki_birth_year : null,
            matched ? matched.wiki_summary : null,
            matched ? matched.wiki_source_url : null,
            matched ? 1 : 0
          )
        );
      }

      if (updates.length) await env.DB.batch(updates);

      return new Response(JSON.stringify({ ok: true, results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/wiki-approve ─────────────────────────
  // [2026-07-20 신규] person_wiki_match_queue에서 매칭된(match_found=1) 인물들을
  // 확정 승인 — 위키 문서를 다시 한 번 열어서 이번엔 전체 데이터를 긁어와
  // person_wiki_cache에 저장. 이 순간부터 실제 /person/{id} 페이지에 반영됨.
  //
  // 데이터 소스가 3가지로 나뉨 (한 번의 API 호출로 다 같이 조회):
  //  1) prop=extracts(explaintext) — 본문 줄글. 요약/전체이력/수상내역 추출용.
  //     ⚠️ 인포박스(데뷔작/학력 등)는 여기 안 나옴 — 위키 텍스트 추출 API는
  //     본문 산문만 뽑고 인포박스 템플릿은 원래 제외함.
  //  2) prop=revisions(rvprop=content) — 원본 wikitext. {{배우 정보 ...}} 인포박스
  //     템플릿 안의 |데뷔작=, |학력= 같은 필드를 정규식으로 직접 파싱.
  //  3) prop=extlinks — 외부링크 목록. kmdb.or.kr, imdb.com 링크에서 ID 추출.
  //
  // ⚠️ 데뷔작/학력은 배우마다 위키 문서 작성 방식이 달라서 100% 정확히 안 뽑힐 수
  // 있음 — 인포박스 필드명이 없거나 형식이 다르면 그냥 빈 값으로 남김(억지 추측 안 함).
  if (path === "/admin/persons/wiki-approve" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbIds = Array.isArray(body.tmdb_ids)
        ? body.tmdb_ids.map(n => parseInt(n)).filter(n => Number.isInteger(n)).slice(0, 50)
        : [];
      if (!tmdbIds.length) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_ids가 필요해요" }), { status: 400, headers });
      }

      const placeholders = tmdbIds.map(() => "?").join(",");
      const { results: queued } = await env.DB.prepare(
        `SELECT tmdb_person_id, person_name, wiki_title, wiki_source_url
         FROM person_wiki_match_queue
         WHERE tmdb_person_id IN (${placeholders}) AND match_found = 1`
      ).bind(...tmdbIds).all();

      const approved = [];
      const failed = [];
      const updates = [];

      // wikitext 마크업 잔여물 정리용 헬퍼 — [[링크|표시]] → 표시, '''굵게''' → 굵게, <ref>...</ref> 제거 등
      const cleanWikitext = (s) => {
        if (!s) return "";
        return s
          .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")   // 각주 통째로 제거
          .replace(/<ref[^>]*\/>/g, "")
          .replace(/\[\[([^\|\]]+)\|([^\]]+)\]\]/g, "$2") // [[문서명|표시]] → 표시
          .replace(/\[\[([^\]]+)\]\]/g, "$1")              // [[문서명]] → 문서명
          .replace(/'''?/g, "")                             // '''굵게''' / ''기울임''
          .replace(/<[^>]+>/g, "")                          // 남은 HTML 태그
          .replace(/\{\{[^}]*\}\}/g, "")                    // 남은 소형 템플릿({{efn}} 등)
          .trim();
      };

      // [2026-07-20 신규] 전체이력(career_history) 정제 헬퍼.
      // 위키 본문 줄글에는 "== 웹예능 ==" 처럼 제목만 있고 내용이 없는 섹션이 많고,
      // "== 학력 ==" / "== 수상 ==" 처럼 이미 전용 칸(education/awardsText)으로
      // 따로 뽑아낸 섹션도 그대로 남아있어서 중복으로 보임 — 둘 다 걸러냄.
      // 섹션 헤더가 하나도 없는 문서(도입부만 있는 경우)는 원문 그대로 반환.
      const stripSectionsAndEmpties = (text) => {
        if (!text) return text;
        const headerRe = /^(={2,6})\s*([^=\n]+?)\s*\1[ \t]*$/gm;
        const matches = [];
        let m;
        while ((m = headerRe.exec(text)) !== null) {
          matches.push({ index: m.index, headerEnd: m.index + m[0].length, level: m[1].length, title: m[2].trim() });
        }
        if (!matches.length) return text.trim();

        // 첫 섹션 헤더 이전의 도입부 문단은 항상 유지
        const intro = text.slice(0, matches[0].index).trim();

        const kept = [];
        for (let i = 0; i < matches.length; i++) {
          const cur = matches[i];
          const next = matches[i + 1];
          const content = text.slice(cur.headerEnd, next ? next.index : text.length).trim();

          const isDuplicateSection = /^(학력|수상|수상내역|수상 경력)/.test(cur.title);
          if (!content || isDuplicateSection) continue; // 내용 없는 섹션 또는 이미 뽑아낸 섹션은 제외

          const headerMark = "=".repeat(cur.level);
          kept.push(`${headerMark} ${cur.title} ${headerMark}\n${content}`);
        }

        return [intro, ...kept].filter(Boolean).join("\n\n");
      };

      const WIKI_UA_APPROVE = { "User-Agent": "OttrankBot/1.0 (https://ottrank.kr; 오뜨랑 인물 위키매칭)" };

      for (const q of queued) {
        try {
          const res = await fetch(
            `https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(q.wiki_title)}` +
            `&prop=extracts|revisions|extlinks&explaintext=1&rvprop=content&rvslots=main&ellimit=500&format=json`,
            { headers: WIKI_UA_APPROVE }
          );
          const data = await res.json();
          const pages   = (data.query && data.query.pages) || {};
          const pageObj = Object.values(pages)[0];
          const fullText = (pageObj && pageObj.extract) || "";

          if (!fullText) {
            failed.push({ tmdb_id: q.tmdb_person_id, reason: "본문 조회 실패" });
            continue;
          }

          // ① 요약(bio_summary) = 첫 문단(첫 줄바꿈 전까지)
          const bioSummary = fullText.split("\n")[0].slice(0, 500);

          // ③ 수상내역(awards_text) = "== 수상" 포함 섹션 헤더 다음 텍스트, 다음 섹션 헤더 전까지
          // [2026-07-20 수정] \n+(탐욕적)가 섹션 사이 줄바꿈을 한번에 다 삼켜버려서,
          // 수상 섹션에 실제 내용이 없을 때 다음 섹션 제목("== 각주 ==")까지 그대로
          // 캡처되던 버그. \n*로 바꾸고, 내용이 비어있으면(수상 항목이 실제로 없으면) null 처리.
          const awardsMatch = fullText.match(/==+\s*수상[^=\n]*==+\n*([\s\S]*?)(?=\n==+\s|$)/);
          const awardsRaw = awardsMatch ? awardsMatch[1].trim() : "";
          const awardsText = (awardsRaw && !/^==/.test(awardsRaw)) ? awardsRaw.slice(0, 2000) : null;

          // ④⑤ 데뷔작/학력 — 원본 wikitext의 인포박스 템플릿에서 파싱.
          // [2026-07-20 수정] 배우 인포박스가 "배우 정보" 하나가 아니라 3종류임을
          // 위키백과 틀 문서로 확인함 — 3개 다 확인. 필드명도 틀마다 달라서
          // ("데뷔작" vs "데뷔작(곡)") 괄호 변형까지 허용하도록 정규식 수정.
          //  · {{배우 정보}}   — 데뷔작 있음, 학력 없음
          //  · {{연예인 정보}} — 데뷔작(곡) 있음, 학력 있음
          //  · {{영화인 정보}} — 데뷔작/학력 둘 다 없음(그래서 그냥 못 찾는 게 정상)
          const revisions = (pageObj && pageObj.revisions) || [];
          const wikitext = (revisions[0] && revisions[0].slots && revisions[0].slots.main &&
                             revisions[0].slots.main["*"]) || "";
          const infoboxMatch = wikitext.match(/\{\{(?:배우 정보|연예인 정보|영화인 정보)[\s\S]*?\n\}\}/);
          const infobox = infoboxMatch ? infoboxMatch[0] : "";

          let debutWork = null, debutYear = null, education = null;
          if (infobox) {
            // "데뷔작 =" 또는 "데뷔작(곡) =" 둘 다 매칭 — 필드명 뒤에 괄호가 붙어도 허용
            const debutField = infobox.match(/\|\s*데뷔(?:작|년도)?(?:\([^)]*\))?\s*=\s*([^\|\n]+)/);
            if (debutField) {
              const raw = cleanWikitext(debutField[1]);
              const yearInDebut = raw.match(/(\d{4})/);
              debutYear = yearInDebut ? yearInDebut[1] : null;
              // 연도·괄호 빼고 작품명만 남기기
              debutWork = raw.replace(/\(?\d{4}\)?[년,\s]*/g, "").trim().slice(0, 100) || null;
            }
            const eduField = infobox.match(/\|\s*학력(?:\([^)]*\))?\s*=\s*([^\|\n]+)/);
            if (eduField) {
              education = cleanWikitext(eduField[1]).slice(0, 200) || null;
            }
          }

          // [2026-07-20 신규] 인포박스에 학력이 없는 배우(예: {{영화인 정보}} 틀을 쓰거나,
          // 틀 안에 그냥 필드가 비어있는 경우) — 본문 "== 학력 ==" 섹션에서 대신 찾음.
          // 수상내역과 동일한 방식(섹션 헤더~다음 섹션 헤더 전까지). 본문 학력 섹션은
          // 보통 줄바꿈으로 나열된 리스트라 " · "로 이어붙여서 한 줄로 정리.
          if (!education) {
            const eduMatch = fullText.match(/==+\s*학력[^=\n]*==+\n*([\s\S]*?)(?=\n==+\s|$)/);
            const eduRaw = eduMatch ? eduMatch[1].trim() : "";
            if (eduRaw && !/^==/.test(eduRaw)) {
              education = cleanWikitext(eduRaw.replace(/\n+/g, " · ")).slice(0, 300) || null;
            }
          }

          // ② 전체이력(career_history) = 본문에서 빈 섹션·중복 섹션(학력/수상) 걸러낸 뒤 저장
          // (person.html에서 "더보기"로 접어서 보여줌)
          const careerHistory = stripSectionsAndEmpties(fullText).slice(0, 8000); // 너무 길면 잘라냄(안전장치)

          // ⑥⑦ KMDb / IMDb ID — 외부링크 목록에서 추출 (HTML 파싱 없이 API로 바로)
          const extlinks = (pageObj && pageObj.extlinks) || [];
          let kmdbId = null, imdbId = null;
          for (const link of extlinks) {
            const url = link["*"] || "";
            const kmdbMatch = url.match(/kmdb\.or\.kr\/db\/per\/(\d+)/);
            if (kmdbMatch) kmdbId = kmdbMatch[1];
            const imdbMatch = url.match(/imdb\.com\/name\/(nm\d+)/);
            if (imdbMatch) imdbId = imdbMatch[1];
          }

          updates.push(
            env.DB.prepare(`
              INSERT INTO person_wiki_cache
                (tmdb_person_id, wiki_title, bio_summary, career_history, awards_text,
                 debut_work, debut_year, education, kmdb_id, imdb_id, source_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(tmdb_person_id) DO UPDATE SET
                wiki_title = excluded.wiki_title,
                bio_summary = excluded.bio_summary,
                career_history = excluded.career_history,
                awards_text = excluded.awards_text,
                debut_work = excluded.debut_work,
                debut_year = excluded.debut_year,
                education = excluded.education,
                kmdb_id = excluded.kmdb_id,
                imdb_id = excluded.imdb_id,
                source_url = excluded.source_url
            `).bind(
              q.tmdb_person_id, q.wiki_title, bioSummary, careerHistory, awardsText,
              debutWork, debutYear, education, kmdbId, imdbId, q.wiki_source_url
            )
          );
          approved.push({
            tmdb_id: q.tmdb_person_id, person_name: q.person_name, wiki_title: q.wiki_title,
            debut_work: debutWork, education: education, kmdb_id: kmdbId, imdb_id: imdbId,
          });
        } catch (e) {
          failed.push({ tmdb_id: q.tmdb_person_id, reason: e.message });
        }
      }

      if (updates.length) await env.DB.batch(updates);

      return new Response(JSON.stringify({
        ok: true,
        approved,
        failed,
        approvedCount: approved.length,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/search ────────────────────────────────
  // persons 테이블에서 이름으로 검색 (인물 사전등록 탭 — 삭제 대상 찾기용)
  // [2026-07-20 수정] "인물 개별 검색"(위키 연동) 화면에서 재사용하기 위해
  // name_ko(한글 대표이름)와 matched(위키백과 매칭 여부)를 추가로 내려줌.
  // 기존 name/job 필드는 그대로 유지되므로 기존 화면(인물 사전등록)엔 영향 없음.
  if (path === "/admin/persons/search" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: true, items: [] }), { headers });
      }
      // [2026-07-20 수정] 동명이인 구분용으로 birthday/gender/place_of_birth 추가.
      // 이름만으로는 서로 다른 사람인지 구분이 안 돼서(예: 황정민 배우 2명),
      // 검색 결과 목록에서 바로 구분할 수 있게 화면에 같이 내려줌.
      const { results: items } = await env.DB.prepare(`
        SELECT p.tmdb_id, p.name, p.name_ko, p.job, p.birthday, p.gender, p.place_of_birth,
               CASE WHEN w.tmdb_person_id IS NULL THEN 0 ELSE 1 END AS matched
        FROM persons p
        LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
        WHERE p.name LIKE ? OR p.name_ko LIKE ?
        ORDER BY p.name LIMIT 30
      `).bind(`%${q}%`, `%${q}%`).all();
      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/persons/wiki-detail/:tmdb_id ───────────────────
  // [2026-07-20 신규] "인물 개별 검색"에서 인물 1명 클릭했을 때 상세 조회.
  // - 아직 위키랑 안 이어진 사람: matched:false + persons 기본정보만 반환
  //   (프론트는 이걸 받으면 wiki-match-attempt를 그 사람 1명한테 호출)
  // - 이미 이어진 사람: matched:true + person_wiki_cache 전체 값 + 항목별
  //   숨김여부(hiddenFields 배열)까지 반환 → 프론트가 체크박스 초기 상태를 맞춤
  if (path.match(/^\/admin\/persons\/wiki-detail\/\d+$/) && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdbId = parseInt(path.split("/")[4]);
      const person = await env.DB.prepare(
        `SELECT tmdb_id, name, name_ko, birthday, popularity, profile_path FROM persons WHERE tmdb_id = ?`
      ).bind(tmdbId).first();
      if (!person) {
        return new Response(JSON.stringify({ ok: false, message: "인물을 찾을 수 없어요" }), { status: 404, headers });
      }

      const wiki = await env.DB.prepare(
        `SELECT tmdb_person_id, wiki_title, bio_summary, career_history, awards_text,
                debut_work, debut_year, education, kmdb_id, imdb_id, source_url, hidden_fields
         FROM person_wiki_cache WHERE tmdb_person_id = ?`
      ).bind(tmdbId).first();

      if (!wiki) {
        // [2026-07-20 수정] 미매칭이어도 프론트에서 10개 항목을 전부 입력폼으로
        // 보여줄 수 있게, null로 채운 wiki 객체를 항상 내려줌 (매칭 여부는 matched로 구분)
        return new Response(JSON.stringify({
          ok: true, matched: false, person,
          wiki: {
            wiki_title: null, bio_summary: null, career_history: null, awards_text: null,
            debut_work: null, debut_year: null, education: null,
            kmdb_id: null, imdb_id: null, source_url: null,
          },
          hiddenFields: [],
        }), { headers });
      }

      const hiddenFields = (wiki.hidden_fields || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      delete wiki.hidden_fields; // hiddenFields 배열로 이미 내려주므로 원본 컬럼은 응답에서 뺌

      return new Response(JSON.stringify({
        ok: true, matched: true, person, wiki, hiddenFields,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/wiki-manual-save ──────────────────────
  // [2026-07-20 신규] "인물 개별 검색"에서 10개 항목을 관리자가 직접 입력/수정해서
  // 저장. 위키 매칭 여부와 무관하게 항상 사용 가능 — 매칭 안 된 사람도 이 API로
  // person_wiki_cache에 행을 새로 만들 수 있음(위키에서 온 것처럼 취급).
  // wiki-approve(자동 매칭 승인)와 동일한 테이블에 동일한 방식(UPSERT)으로 저장하므로,
  // 이후에는 person.html/person-wiki.js 입장에서 자동매칭 데이터와 완전히 동일하게 동작함.
  if (path === "/admin/persons/wiki-manual-save" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const ALLOWED_HIDDEN_FIELDS = [
        "bio_summary", "career_history", "awards_text",
        "debut_work", "education", "kmdb_id", "imdb_id",
      ];
      const body = await request.json().catch(() => ({}));
      const tmdbId = parseInt(body.tmdb_id);
      if (!Number.isInteger(tmdbId)) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id가 필요해요" }), { status: 400, headers });
      }

      // 빈 문자열은 null로 정리(sentinel 원칙 — "입력 안 함"을 명확히 구분)
      const norm = (v) => (typeof v === "string" && v.trim() !== "") ? v.trim() : null;
      const wikiTitle    = norm(body.wiki_title);
      const bioSummary   = norm(body.bio_summary);
      const careerHistory= norm(body.career_history);
      const awardsText   = norm(body.awards_text);
      const debutWork    = norm(body.debut_work);
      const debutYear    = norm(body.debut_year);
      const education    = norm(body.education);
      const kmdbId       = norm(body.kmdb_id);
      const imdbId       = norm(body.imdb_id);
      const sourceUrl    = norm(body.source_url);

      const hiddenFields = Array.isArray(body.hidden_fields)
        ? body.hidden_fields.filter((f) => ALLOWED_HIDDEN_FIELDS.includes(f))
        : [];

      await env.DB.prepare(`
        INSERT INTO person_wiki_cache
          (tmdb_person_id, wiki_title, bio_summary, career_history, awards_text,
           debut_work, debut_year, education, kmdb_id, imdb_id, source_url, hidden_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_person_id) DO UPDATE SET
          wiki_title = excluded.wiki_title,
          bio_summary = excluded.bio_summary,
          career_history = excluded.career_history,
          awards_text = excluded.awards_text,
          debut_work = excluded.debut_work,
          debut_year = excluded.debut_year,
          education = excluded.education,
          kmdb_id = excluded.kmdb_id,
          imdb_id = excluded.imdb_id,
          source_url = excluded.source_url,
          hidden_fields = excluded.hidden_fields
      `).bind(
        tmdbId, wikiTitle, bioSummary, careerHistory, awardsText,
        debutWork, debutYear, education, kmdbId, imdbId, sourceUrl, hiddenFields.join(",")
      ).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/persons/ai-draft ───────────────────────────────
  // [2026-07-20 신규] "인물 개별 검색"에서 AI(Claude + 웹서치)로 프로필 초안을 생성.
  // ⚠️ DB에 절대 저장하지 않음 — 입력폼에 초안 텍스트만 채워주고, 관리자가 눈으로
  // 검증한 뒤 직접 "저장" 버튼을 눌러야 실제 반영됨(wiki-manual-save 재사용).
  // 전체이력(career_history)은 대상에서 제외 — 분량이 많아 오류 가능성이 커서
  // 관리자 판단으로 뺌. KMDb/IMDb ID도 대상 아님 — AI가 지어낼 위험이 있는 식별자라
  // AI 추측이 아니라 검증 가능한 조회(위키 매칭 등)로만 채워야 함.
  if (path === "/admin/persons/ai-draft" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        ok: false, message: "ANTHROPIC_API_KEY가 Workers Secrets에 설정되어 있지 않습니다"
      }), { status: 500, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const tmdbId = parseInt(body.tmdb_id);
      if (!Number.isInteger(tmdbId)) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id가 필요해요" }), { status: 400, headers });
      }

      const person = await env.DB.prepare(
        `SELECT tmdb_id, name, name_ko, job, birthday, gender, place_of_birth FROM persons WHERE tmdb_id = ?`
      ).bind(tmdbId).first();
      if (!person) {
        return new Response(JSON.stringify({ ok: false, message: "인물을 찾을 수 없어요" }), { status: 404, headers });
      }

      const displayName = person.name_ko || person.name;
      const jobLabel = person.job === "direct" ? "감독" : "배우";

      // [2026-07-20 신규] 동명이인 오조사 방지용 — 생년월일/성별/출생지를 같이 알려줘서
      // "그 이름을 가진 여러 사람 중 정확히 이 사람"을 찾도록 함 (황정민 배우 2명 케이스에서 발견)
      const identifiers = [];
      if (person.birthday && !person.birthday.includes("00-00")) identifiers.push(`생년월일 ${person.birthday}`);
      if (person.gender === 1) identifiers.push("여성");
      if (person.gender === 2) identifiers.push("남성");
      if (person.place_of_birth) identifiers.push(`출생지 ${person.place_of_birth}`);
      const identifierText = identifiers.length ? ` (${identifiers.join(", ")})` : "";

      const systemPrompt =
        "너는 한국 OTT 서비스에 등록할 배우/감독 인물 정보를 조사하는 리서처다. " +
        "web_search로 이 인물에 대한 신뢰할 수 있는 정보(위키백과, 뉴스, 공식 프로필 등)를 찾아서 정리해라. " +
        "⚠️ 동명이인 주의: 같은 이름을 가진 사람이 여러 명일 수 있다. 반드시 함께 제공되는 " +
        "생년월일/성별/출생지와 일치하는 사람의 정보만 사용해라. 일치하는 사람을 못 찾겠으면 " +
        "모든 필드를 빈 문자열로 남겨라(다른 동명이인 정보를 절대 섞지 마라). " +
        "가장 중요한 원칙: 검색으로 확인 안 된 내용은 절대 추측하거나 지어내지 마라. " +
        "특히 수상 이름·연도, 학교 이름, 데뷔작 제목·연도처럼 사실관계가 명확해야 하는 항목은 " +
        "검색 결과로 명확히 확인된 것만 적고, 확실하지 않으면 그 필드는 빈 문자열로 남겨라. " +
        // [2026-07-20 재수정] "대표작 중심으로" 지시가 AI를 "출연작 나열"로 유도했음(문제 사례로 확인됨).
        // 나열이 아니라 이 인물의 스타일·평판·강점을 설명하는 소개글로 방향을 명확히 바꿈.
        // 단, 커리어 전환점이 된 작품까지 무조건 금지하면 오히려 부자연스러우니 그건 허용.
        "요약(profile)은 500~700자 분량의 한국어 문장으로 작성해라. 이 배우/감독이 어떤 스타일과 " +
        "강점을 가졌는지, 업계에서 어떤 평가를 받는지, 어떤 매력으로 알려져 있는지를 중심으로 " +
        "서술해라(예: '섬세한 감정 표현으로 신뢰받는다', '명품 조연으로 꼽힌다'). 커리어에 중요한 " +
        "전환점이 된 작품이 있다면 자연스럽게 언급해도 되지만, 출연작을 단순히 줄줄이 나열하는 " +
        "것은 피해라. " +
        // [2026-07-20 신규] 수상내역은 한두 개만 찾고 멈추지 말고 최대한 빠짐없이 모으도록 명시.
        // 한 줄에 하나씩 줄바꿈으로 구분(awards_text 화면 표시가 이미 줄바꿈을 그대로 보존하도록
        // 되어 있음 — white-space:pre-line 적용됨, person.html 참고).
        "수상내역(awards)은 검색으로 확인되는 것을 최대한 빠짐없이 모아라. 한두 개만 찾고 멈추지 " +
        "말고 여러 차례 검색해서 이 인물이 받은 상을 가능한 한 많이 찾아라. 각 수상 내역은 " +
        "한 줄에 하나씩, 줄바꿈(\\n)으로 구분해서 나열해라. 각 줄은 " +
        "'연도 시상식명 부문(작품명)' 형식으로 통일해라(예: '2009년 제18회 부일영화상 남우조연상(해운대)'). " +
        "확인 안 된 항목은 절대 지어내지 말고 실제 검색으로 찾은 것만 적어라. " +
        "검색과 조사 과정은 네 안에서만 하고, 최종 답변 메시지에는 다른 설명·인사말·검색 과정 서술을 " +
        "일절 남기지 말고 아래 JSON 객체 하나만 정확히 출력해라(코드블록 금지). " +
        '출력 형식: {"profile":"...", "education":"...", "awards":"...", "debut_work":"...", "debut_year":"..."}';

      const userPrompt = `인물: ${displayName}${identifierText} — 직업: ${jobLabel}\n이 인물의 프로필/학력/수상내역/데뷔작 정보를 조사해줘.`;

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      if (!claudeResp.ok) {
        const errText = await claudeResp.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false, message: `Claude API 오류 (status ${claudeResp.status})`, detail: errText.slice(0, 300),
        }), { status: 502, headers });
      }

      const claudeData = await claudeResp.json();
      // [2026-07-20 수정] web_search 사용 시 중간에 "~를 검색해볼게요" 같은 서술이 섞인
      // 텍스트 블록이 여러 개 나올 수 있어서, 전부 이어붙이면 JSON.parse가 깨짐.
      // ① 텍스트 블록 중 마지막 것(최종 답변)만 사용 ② 그 안에서도 첫 '{'부터 마지막
      // '}'까지만 정규식으로 잘라내서, 앞뒤에 설명이 섞여 있어도 JSON만 뽑아냄.
      const textBlocks = (claudeData.content || []).filter((b) => b.type === "text");
      const rawText = textBlocks.length ? textBlocks[textBlocks.length - 1].text : "";

      let parsed;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("JSON 형식을 찾을 수 없음");
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false, message: "AI 응답 파싱 실패 — 다시 시도해주세요", raw: rawText.slice(0, 300),
        }), { status: 502, headers });
      }

      return new Response(JSON.stringify({
        ok: true,
        draft: {
          bio_summary: parsed.profile || "",
          education: parsed.education || "",
          awards_text: parsed.awards || "",
          debut_work: parsed.debut_work || "",
          debut_year: parsed.debut_year || "",
        },
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }
  // [2026-07-20 신규] "인물 개별 검색"에서 체크 해제한 항목 저장.
  // 데이터는 절대 지우지 않고 hidden_fields 컬럼에 콤마로 목록만 남김 —
  // person-wiki.js(공개 API)가 응답 시점에 해당 항목만 걸러서 안 보여줌.
  // 다시 체크해서 저장하면 hidden_fields에서 빠지므로 즉시 복구됨.
  if (path === "/admin/persons/wiki-hidden-fields" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const ALLOWED_HIDDEN_FIELDS = [
        "bio_summary", "career_history", "awards_text",
        "debut_work", "education", "kmdb_id", "imdb_id",
      ];
      const body = await request.json().catch(() => ({}));
      const tmdbId = parseInt(body.tmdb_id);
      if (!Number.isInteger(tmdbId)) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id가 필요해요" }), { status: 400, headers });
      }
      const hiddenFields = Array.isArray(body.hidden_fields)
        ? body.hidden_fields.filter((f) => ALLOWED_HIDDEN_FIELDS.includes(f))
        : [];

      const result = await env.DB.prepare(
        `UPDATE person_wiki_cache SET hidden_fields = ? WHERE tmdb_person_id = ?`
      ).bind(hiddenFields.join(","), tmdbId).run();

      if (!result.meta || result.meta.changes === 0) {
        return new Response(JSON.stringify({ ok: false, message: "매칭된 위키 데이터가 없는 인물이에요" }), { status: 404, headers });
      }

      return new Response(JSON.stringify({ ok: true, hidden_fields: hiddenFields }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/persons/:tmdb_id ───────────────────────────
  // persons 테이블에서 인물 1명 삭제. persons는 이름표만 저장하는 테이블이라
  // (상세정보는 person.html 방문 시 TMDB에서 실시간 조회) 다른 데이터에 영향 없음.
  // 실수로 지워도 "인물 수집" 재실행하면 다시 채워지므로 별도 복구 로직 없이 바로 삭제.
  if (path.match(/^\/admin\/persons\/\d+$/) && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdbId = parseInt(path.split("/")[3]);
      await env.DB.prepare("DELETE FROM persons WHERE tmdb_id = ?").bind(tmdbId).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-language ─────────────────────
  // 기존 works 중 original_language가 비어있는 작품에 TMDB 원어 정보를 채워넣음
  // (키워드 수집 탭 등과 동일한 배치+반복 패턴 — 앞으로 신규 등록되는 작품은
  //  works/register가 자동으로 채우므로, 이건 과거분 일회성 백필용)
  if (path === "/admin/works/backfill-language" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE original_language IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let lang = null;
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data.original_language) { lang = data.original_language; break; }
          } catch (e) { /* 다음 media_type으로 계속 시도 */ }
        }
        if (lang) {
          updates.push(
            env.DB.prepare("UPDATE works SET original_language = ? WHERE tmdb_id = ?")
              .bind(lang, row.tmdb_id)
          );
          filled++;
        } else {
          // TMDB에서 못 가져와도 무한 재시도 방지를 위해 'unknown' 센티널로 마킹
          // (빈 문자열로 저장하면 위 WHERE IS NULL 조건은 피하지만 나중에 실수로
          //  IS NULL OR = '' 조건을 쓰면 재시도 루프 생길 수 있어 명확히 구분)
          updates.push(
            env.DB.prepare("UPDATE works SET original_language = 'unknown' WHERE tmdb_id = ?")
              .bind(row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE original_language IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-release-year ───────────────────
  // release_year가 비어있는 작품에 TMDB 원어 정보를 채워넣음 (backfill-language와 동일 패턴)
  // 계기: variety-similar 정렬에서 release_year가 NULL인 작품이 "0년(||0)"으로 취급되어
  //       오히려 가장 오래된 작품으로 오판되던 버그 발견 → 근본 해결은 데이터를 채우는 것
  if (path === "/admin/works/backfill-release-year" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE release_year IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let year = null;
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            const dateStr = data.release_date || data.first_air_date || "";
            const y = parseInt(dateStr.slice(0, 4));
            if (y) { year = y; break; }
          } catch (e) { /* 다음 media_type으로 계속 시도 */ }
        }
        if (year) {
          updates.push(
            env.DB.prepare("UPDATE works SET release_year = ? WHERE tmdb_id = ?")
              .bind(year, row.tmdb_id)
          );
          filled++;
        } else {
          // TMDB에서도 못 찾으면 무한 재시도 방지를 위해 0(=조회 시도했지만 실패) 센티널로 마킹
          // NULL로 남기면 매 배치마다 계속 대상에 걸림 — original_language의 'unknown'과 동일 원칙
          // (release_year는 정수 컬럼이라 'unknown' 대신 0을 사용, 정렬 로직에서도 0=가장 오래됨으로
          //  자연스럽게 처리되어 별도 예외 분기 불필요)
          updates.push(
            env.DB.prepare("UPDATE works SET release_year = 0 WHERE tmdb_id = ?")
              .bind(row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE release_year IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/backfill-rating ───────────────────────
  // tmdb_rating이 비어있는 작품에 TMDB 평점(vote_average)과 개봉/방영일(release_date)을
  // 한 번에 채워넣음 (backfill-language / backfill-release-year와 동일한 배치+반복 패턴)
  // 계기: 메인 슬라이더(수동 고정 랭킹, rankings 테이블)는 정규 크롤러 대상이 아니라
  //       works.tmdb_rating이 영구 결번되는 문제 발견 → 일회성 배치로 과거분을 채움
  //       (release_date는 "6개월 이내 신작 여부" 판별용으로 방문 시 자동 새로고침 로직에서 사용)
  //
  // 센티널 값을 쓰지 않는 이유: tmdb_rating은 화면에서 "값이 있으면 표시"하는 방식으로
  // 여러 곳(index.html, _title_detail.html)에서 체크하고 있어서, 예를 들어 release_year처럼
  // 0을 센티널로 쓰면 0점(투표수 부족)인 정상 데이터와 구분이 안 됨. 그래서 여기서는
  // "시도했는지" 여부를 rating_updated_at 컬럼으로 별도 추적하고, tmdb_rating은 진짜 값이
  // 있을 때만 채우고 없으면 NULL을 그대로 유지함 (화면 표시 로직을 안 건드려도 안전).
  if (path === "/admin/works/backfill-rating" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 50);

      // "한 번도 시도 안 한" 작품만 대상 (rating_updated_at IS NULL)
      // → 시도했지만 TMDB에 값이 없었던 작품은 rating_updated_at이 찍혀 있어 여기서 자동 제외됨
      //   (무한 재시도 방지. 이후 재시도는 방문 시 자동 새로고침 로직이 담당)
      const { results: targets } = await env.DB.prepare(`
        SELECT tmdb_id, media_type FROM works
        WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL
        LIMIT ?
      `).bind(limit).all();

      if (!targets.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0, message: "채울 작품 없음"
        }), { headers });
      }

      const updates = [];
      let filled = 0;
      const nowIso = new Date().toISOString();

      for (const row of targets) {
        const mtypes = row.media_type ? [row.media_type] : ["tv", "movie"];
        let rating      = null;
        let releaseDate = null;
        let matched     = false; // TMDB로부터 정상 응답을 한 번이라도 받았는지

        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${row.tmdb_id}?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            matched = true;
            // 0점(투표수 부족)도 유효한 값이므로 ?? 사용 — || 사용 시 0이 사라지는 버그 재발 방지
            rating      = data.vote_average ?? null;
            releaseDate = data.release_date || data.first_air_date || null;
            break;
          } catch (e) { /* 다음 media_type으로 계속 시도 */ }
        }

        if (matched) {
          // TMDB가 정상 응답을 줬으므로, 평점이 실제로 없더라도(신작 투표수 0 등) 시도 시각은 기록
          updates.push(
            env.DB.prepare(
              "UPDATE works SET tmdb_rating = ?, release_date = ?, rating_updated_at = ? WHERE tmdb_id = ?"
            ).bind(rating, releaseDate, nowIso, row.tmdb_id)
          );
          if (rating !== null) filled++;
        } else {
          // 네트워크 오류 등으로 TMDB 응답 자체를 못 받음 — 그래도 rating_updated_at은 찍어서
          // 이번 배치 루프에서 같은 행을 무한 반복 조회하지 않게 함 (미래 재시도는 방문 시 자동
          // 새로고침 로직이 담당하므로 완전히 누락되지는 않음)
          updates.push(
            env.DB.prepare(
              "UPDATE works SET rating_updated_at = ? WHERE tmdb_id = ?"
            ).bind(nowIso, row.tmdb_id)
          );
        }
      }
      if (updates.length) await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE tmdb_rating IS NULL AND rating_updated_at IS NULL"
      ).first();

      return new Response(JSON.stringify({
        ok: true, attempted: targets.length, filled, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/batch-imdb-search ───────────────────────
  // [2026-07-08 신설] IMDb 매칭률 개선 — 관리자 수동 배치(반복 호출) 방식.
  //   배경: TMDB external_ids에 imdb_id가 없는 작품(한국 드라마 다수)은
  //         지금까지 IMDb 카드가 영원히 "—"로 남았음. OMDB 제목검색
  //         (?t=&y=&type=)으로 imdb_id를 직접 찾아 보완.
  //   ⚠️ 방문 트리거 방식은 절대 사용하지 않음 — 2026-07-08 YouTube
  //      quota 소진 사고(실패를 기록 안 하는 무한 재시도)의 재발을 막기
  //      위해, 반드시 관리자가 수동으로 실행하는 배치로만 동작하고
  //      성공/실패 관계없이 imdb_search_attempted_at을 기록해 재시도를
  //      7일 쿨다운으로 제한함.
  //   대상: imdb_id 없음 AND (attempted_at NULL 또는 7일 경과)
  //   우선순위: 오늘 rankings에 있는 작품(인기작) → created_at 최신순
  //   예산: body.limit (기본 30)
  if (path === "/admin/works/batch-imdb-search" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      let limit = 30;
      try {
        const body = await request.json();
        if (body?.limit && Number.isInteger(body.limit) && body.limit > 0) {
          limit = body.limit;
        }
      } catch (e) {
        // body 없이 호출된 경우 기본값(30) 사용 — 정상 케이스이므로 무시
      }

      const omdbKey = env.OMDB_API_KEY;
      if (!omdbKey) {
        return new Response(JSON.stringify({ ok: false, message: "OMDB key not configured" }), { status: 500, headers });
      }

      // 오늘 기준 최신 크롤링 날짜 조회 (batch-crawl과 동일 패턴)
      const latestDateRow = await env.DB.prepare(
        "SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'"
      ).first();
      const latestDate = latestDateRow?.latest_date || null;

      const { results: candidates } = await env.DB.prepare(`
        SELECT w.tmdb_id, w.title_en, w.release_year, w.media_type
        FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
        ORDER BY
          (
            EXISTS (
              SELECT 1 FROM rankings r
              WHERE r.tmdb_id = w.tmdb_id AND r.date = ?
            )
          ) DESC,
          w.created_at DESC
        LIMIT ?
      `).bind(latestDate, limit).all();

      if (!candidates.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0,
          message: "대상 작품 없음 (모두 매칭 완료됐거나 쿨다운 중)"
        }), { headers });
      }

      let filled = 0;
      const now = new Date().toISOString();

      // 순차 처리 (레이트리밋 회피 목적, 병렬 처리 안 함 — batch-crawl과 동일 원칙)
      for (const c of candidates) {
        try {
          if (!c.title_en) {
            // 영문 제목이 없으면 OMDB 제목검색 자체가 불가능 — 시도 기록만 남기고 스킵
            await env.DB.prepare(
              "UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?"
            ).bind(now, c.tmdb_id).run();
            continue;
          }

          const omdbType = c.media_type === "movie" ? "movie" : "series";
          const params = new URLSearchParams({ t: c.title_en, type: omdbType, apikey: omdbKey });
          if (c.release_year) params.set("y", String(c.release_year));

          const omdbRes  = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
          const omdbData = await omdbRes.json();

          if (omdbData.Response !== "False" && /^tt\d+$/.test(omdbData.imdbID || "")) {
            const r = parseFloat(omdbData.imdbRating);
            if (!isNaN(r)) {
              const v = omdbData.imdbVotes || "";
              await env.DB.prepare(
                "UPDATE works SET imdb_id = ?, imdb_rating = ?, imdb_votes = ?, imdb_updated = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?"
              ).bind(omdbData.imdbID, r, v, now, now, c.tmdb_id).run();
            } else {
              // imdb_id는 찾았지만 평점이 아직 없는 경우 — id만 저장, 평점은 기존 /imdb/:id 실시간 캐시 로직이 이후 채움
              await env.DB.prepare(
                "UPDATE works SET imdb_id = ?, imdb_search_attempted_at = ? WHERE tmdb_id = ?"
              ).bind(omdbData.imdbID, now, c.tmdb_id).run();
            }
            filled++;
          } else {
            // 매칭 실패 — 반드시 attempted_at 기록 (무한 재시도 방지, 오늘 확립한 핵심 원칙)
            await env.DB.prepare(
              "UPDATE works SET imdb_search_attempted_at = ? WHERE tmdb_id = ?"
            ).bind(now, c.tmdb_id).run();
          }
        } catch (e) {
          // 개별 작품 네트워크/예외 오류는 attempted_at 기록 없이 스킵
          // → 다음 배치에서 자동 재시도됨 (진짜 "실패"와 "일시적 오류"를 구분)
          console.error(`[IMDB_BATCH_SEARCH] tmdb_id=${c.tmdb_id} 오류:`, e.message);
        }
      }

      // 남은 대상 개수 재조회
      const remainRow = await env.DB.prepare(`
        SELECT COUNT(*) AS cnt FROM works w
        WHERE (w.imdb_id IS NULL OR w.imdb_id = '')
        AND (
          w.imdb_search_attempted_at IS NULL
          OR w.imdb_search_attempted_at < datetime('now', '-7 days')
        )
      `).first();

      console.log(`[IMDB_BATCH_SEARCH] ✅ 완료: 시도 ${candidates.length}건, 매칭 ${filled}개`);
      return new Response(JSON.stringify({
        ok: true, attempted: candidates.length, filled, remaining: remainRow?.cnt || 0
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/imdb-manual ─────────────────────────────
  // [2026-07-08 신설] IMDb 평점 수동 입력 — OMDB 반영 지연 대응.
  //   배경: 김부장(tmdb_id=296206)처럼 imdb_id는 이미 매칭됐지만 OMDB가
  //         아직 평점을 못 채운 신작을, 검색 유입이 많을 때 관리자가
  //         직접 IMDb 사이트에서 확인한 값을 넣어 즉시 반영하기 위함.
  //   ⚠️ 주의: 프론트(_title_detail.html)는 works.imdb_rating이 있으면
  //      OMDB를 다시 호출하지 않고 그 값을 그대로 표시함 → 여기서 넣은
  //      값은 나중에 실제 OMDB 데이터로 자동으로 안 바뀌고 고정됨.
  //      (사용자 확인 및 동의됨 — 필요시 나중에 다시 이 API로 갱신)
  //   ⚠️ imdb_id 자체가 없는 작품(TMDB external_ids 미매핑)은 평점을
  //      넣어도 화면에 카드 자체가 안 뜸 — 응답에 warning으로 안내.
  if (path === "/admin/works/imdb-manual" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const tmdb_id = parseInt(body?.tmdb_id);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }

      const rating = body?.imdb_rating === "" || body?.imdb_rating == null
        ? null : parseFloat(body.imdb_rating);
      if (rating !== null && (isNaN(rating) || rating < 0 || rating > 10)) {
        return new Response(JSON.stringify({ ok: false, message: "imdb_rating은 0~10 사이 숫자여야 합니다" }), { status: 400, headers });
      }
      const votes = (body?.imdb_votes || "").toString().trim() || null;

      const existing = await env.DB.prepare(
        "SELECT imdb_id FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();
      if (!existing) {
        return new Response(JSON.stringify({ ok: false, message: "해당 tmdb_id 작품을 찾을 수 없습니다" }), { status: 404, headers });
      }

      await env.DB.prepare(
        "UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = datetime('now') WHERE tmdb_id = ?"
      ).bind(rating, votes, tmdb_id).run();

      return new Response(JSON.stringify({
        ok: true,
        warning: existing.imdb_id ? null : "imdb_id가 없는 작품이라 화면에 카드가 안 뜰 수 있습니다 (IMDb 매칭 배치 선행 필요)",
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/works/missing-media-type ──────────────────────
  // media_type이 비어있는 작품을 포스터와 함께 조회 (관리자가 눈으로 보고 직접 판정하는 용도)
  // offset 없이 항상 최신 10개를 가져옴 — 채워지는 즉시 쿼리에서 빠지므로 건너뛴 항목은
  // 자연스럽게 다음 배치들에서 계속 다시 보이게 됨 (별도 skip 추적 불필요)
  if (path === "/admin/works/missing-media-type" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 10, 30);

      const { results: items } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, poster_path
        FROM works
        WHERE media_type IS NULL OR media_type = ''
        ORDER BY tmdb_id
        LIMIT ?
      `).bind(limit).all();

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''"
      ).first();

      return new Response(JSON.stringify({
        ok: true, items, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/works/bulk-set-media-type ─────────────────────
  // 관리자가 화면에서 영화/TV로 직접 판정한 작품들을 한 번에 저장
  if (path === "/admin/works/bulk-set-media-type" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      const valid = items.filter(it =>
        it && it.tmdb_id && (it.media_type === "movie" || it.media_type === "tv")
      );
      if (!valid.length) {
        return new Response(JSON.stringify({ ok: false, message: "유효한 항목이 없어요 (media_type은 'movie' 또는 'tv'만 허용)" }), { status: 400, headers });
      }

      const updates = valid.map(it =>
        env.DB.prepare("UPDATE works SET media_type = ? WHERE tmdb_id = ?")
          .bind(it.media_type, parseInt(it.tmdb_id))
      );
      await env.DB.batch(updates);

      const remainRow = await env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM works WHERE media_type IS NULL OR media_type = ''"
      ).first();

      return new Response(JSON.stringify({
        ok: true, updated: valid.length, remaining: remainRow?.cnt || 0,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /grade-settings (admin) ───────────────────────────
  if (path === "/admin/grade-settings" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    // 공개용 /grade-settings와 동일 데이터, admin 접근용 별도 경로
    try {
      const { results } = await env.DB.prepare(
        "SELECT * FROM grade_settings ORDER BY sort_order ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PUT /admin/grade-settings ─────────────────────────────
  if (path === "/admin/grade-settings" && request.method === "PUT") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const grades = await request.json();
      if (!Array.isArray(grades)) {
        return new Response(JSON.stringify({ ok: false, message: "Array required" }), { status: 400, headers });
      }
      for (const g of grades) {
        await env.DB.prepare(`
          INSERT INTO grade_settings
            (grade_key, grade_name, emoji_url, min_ott_points, is_special, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(grade_key) DO UPDATE SET
            grade_name     = excluded.grade_name,
            emoji_url      = excluded.emoji_url,
            min_ott_points = excluded.min_ott_points,
            is_special     = excluded.is_special,
            sort_order     = excluded.sort_order
        `).bind(
          g.grade_key, g.grade_name, g.emoji_url || "",
          g.min_ott_points || 0,
          g.is_special ? 1 : 0, g.sort_order || 0
        ).run();
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/grade-settings/assign ─────────────────────
  if (path === "/admin/grade-settings/assign" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { user_id, grade_key } = await request.json();
      if (!user_id || !grade_key) {
        return new Response(JSON.stringify({ ok: false, message: "user_id, grade_key required" }), { status: 400, headers });
      }
      await env.DB.prepare("UPDATE users SET grade = ? WHERE id = ?").bind(grade_key, user_id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/users ──────────────────────────────────────
  if (path === "/admin/users" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const page   = parseInt(url.searchParams.get("page") || "1");
      const limit  = 50;
      const offset = (page - 1) * limit;
      const search = url.searchParams.get("q") || "";

      let query = `
        SELECT u.id, u.nickname, u.provider, u.grade, u.total_likes_received,
          u.created_at, u.last_login, u.ott_points,
          gs.grade_name, gs.emoji_url as grade_emoji_url,
          (SELECT COUNT(*) FROM reviews  WHERE user_id = u.id) as review_count,
          (SELECT COUNT(*) FROM wishlist WHERE user_id = u.id) as wishlist_count,
          (SELECT COUNT(*) FROM posts    WHERE user_id = u.id) as post_count
        FROM users u
        LEFT JOIN grade_settings gs ON gs.grade_key = u.grade
      `;
      const params = [];
      if (search) { query += " WHERE u.nickname LIKE ?"; params.push(`%${search}%`); }
      query += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const { results } = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/ott-points/adjust ─────────────────────────
  // 관리자 수동 오뜨 조정 (지급/차감)
  if (path === "/admin/ott-points/adjust" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { user_id, points, reason } = await request.json();
      if (!user_id || points === undefined || !reason) {
        return new Response(JSON.stringify({ ok: false, message: "user_id, points, reason 필수" }), { status: 400, headers });
      }
      // 1. 내역 로그 기록
      await env.DB.prepare(
        `INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)`
      ).bind(user_id, points, reason).run();
      // 2. users.ott_points 캐시 업데이트
      await env.DB.prepare(
        `UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?`
      ).bind(points, user_id).run();
      // 3. 레벨 자동 재계산
      const user = await env.DB.prepare(
        `SELECT ott_points FROM users WHERE id = ?`
      ).bind(user_id).first();
      if (user) {
        const newGrade = await _calcGrade(user.ott_points, env);
        if (newGrade) {
          await env.DB.prepare(
            `UPDATE users SET grade = ? WHERE id = ? AND (grade IS NULL OR grade NOT IN (SELECT grade_key FROM grade_settings WHERE is_special = 1))`
          ).bind(newGrade, user_id).run();
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/search-logs ──────────────────────────────────
  // [2026-07-18 신설] 검색어 로그 목록 조회 (관리자 전용). 최신순, 페이지네이션.
  if (path === "/admin/search-logs" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
      const offset = (page - 1) * limit;

      const [{ results }, totalRow] = await Promise.all([
        env.DB.prepare(
          `SELECT id, query, result_count, total_count, created_at FROM search_logs
           ORDER BY created_at DESC LIMIT ? OFFSET ?`
        ).bind(limit, offset).all(),
        env.DB.prepare(`SELECT COUNT(*) AS cnt FROM search_logs`).first(),
      ]);

      const total = totalRow?.cnt || 0;
      return new Response(JSON.stringify({
        ok: true, data: results, page, limit, total,
        has_more: offset + results.length < total,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}

// ════════════════════════════════════════════════════
// 오뜨 포인트 공용 유틸 함수
// 다른 Worker 파일(auth.js, user.js 등)에서 import해서 사용
// ════════════════════════════════════════════════════

// 오뜨 적립/차감 + 레벨 자동 재계산
export async function _addOttPoints(userId, points, reason, env) {
  try {
    // 1. 내역 로그 기록
    await env.DB.prepare(
      `INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)`
    ).bind(userId, points, reason).run();
    // 2. users.ott_points 캐시 업데이트 (0 미만으로 내려가지 않도록)
    await env.DB.prepare(
      `UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?`
    ).bind(points, userId).run();
    // 3. 레벨 자동 재계산 (특별 등급 보호)
    const user = await env.DB.prepare(
      `SELECT ott_points FROM users WHERE id = ?`
    ).bind(userId).first();
    if (user) {
      const newGrade = await _calcGrade(user.ott_points, env);
      if (newGrade) {
        await env.DB.prepare(
          `UPDATE users SET grade = ? WHERE id = ?
           AND (grade IS NULL OR grade NOT IN
             (SELECT grade_key FROM grade_settings WHERE is_special = 1))`
        ).bind(newGrade, userId).run();
      }
    }
    return true;
  } catch (e) {
    console.error("[_addOttPoints] 오류:", e.message);
    return false;
  }
}

// 오뜨 점수 기준으로 해당 등급 key 계산
async function _calcGrade(ottPoints, env) {
  try {
    // min_ott_points 내림차순 → 가장 높은 달성 등급 반환
    const { results } = await env.DB.prepare(
      `SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`
    ).bind(ottPoints).all();
    return results[0]?.grade_key || null;
  } catch (e) {
    return null;
  }
}
