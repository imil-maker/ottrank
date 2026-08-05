/* 2026-08-05 rev.8 — relationship.js (candidates — sort=registered일 때 media_type을 tv뿐 아니라
   movie까지 포함(한국 영화도 등록순 목록에 노출). sort=release는 기존대로 tv(드라마)만 유지) */
/* 2026-08-05 rev.7 — relationship.js (candidates에 ?sort=release|registered 파라미터 추가 —
   기본값은 release(기존과 동일, 방영일 최신순). registered면 first_matched_date DESC로 정렬 —
   관리자가 "우리 DB에 최근 등록된 순서"로도 후보 목록을 볼 수 있게 함) */
/* 2026-07-25 rev.6 — relationship.js (candidates 응답에 release_year 추가 — 어드민에서 작품페이지 링크 생성용) */
/* ══════════════════════════════════════════════════════════════
   relationship.js — 등장인물 관계도 (2026-07-25 신설)
   - 인터넷에 이미 돌고 있는 방송사/제작사 공식 관계도 이미지를 관리자가 직접 찾아서
     업로드하는 방식. AI초안 방식(노드/관계선 자동 생성)은 추후 별도 구현 예정 — 이 파일은
     "공식 이미지 업로드" 경로만 우선 담당함.

   GET /relationship-charts/:tmdb_id            ← 공개(비로그인) 조회, 작품페이지용(2026-07-25 신설)
     - ?media_type=movie|tv 필수. status='approved'인 관계도가 있으면 image_url 반환.

   GET /admin/relationship-charts/candidates
     - 아직 관계도(relationship_charts 행)가 없는 작품을 10개씩 조회.
     - 정렬: ① 지금 HOT100(hot100_scores)에 있는 작품 먼저(순위 높은 순),
             ② 랭킹 없는 작품 중에서는 한국 작품(original_language='ko') 먼저,
             ③ 그 안에서는 최근 등록순(first_matched_date DESC).
       (주의: works 테이블엔 popularity 컬럼이 없음 — persons 테이블에만 있음. 처음에
        w.popularity로 잘못 짰다가 SQLITE_ERROR로 발견해서 위 기준으로 수정함, 2026-07-25)
     - ?page=1부터 시작, ?limit=10 기본값.

   GET /admin/relationship-charts/search          ← 2026-07-25 신규
     - ?q= 필수(제목 또는 tmdb_id). candidates와 달리 이미 관계도가 있는 작품도 결과에 포함되며,
       has_chart/image_url을 같이 반환해서 프론트에서 "교체/삭제" 버튼을 보여줄 수 있게 함.
       (업로드/삭제 자체는 아래 PUT/DELETE 엔드포인트를 그대로 재사용 — 업로드가 곧 교체임)

   PUT /admin/relationship-charts/:tmdb_id/upload
     - 관계도 이미지를 R2(ottrank-images 버킷)에 업로드하고, relationship_charts에
       source_type='official_image'로 기록(이미 있으면 갱신, 없으면 새로 생성).
     - 파일은 hero-upload와 동일하게 요청 body에 raw binary로 받음(Content-Type 헤더로 확장자 결정).
     - 쿼리 파라미터로 media_type(movie|tv)을 반드시 받아야 함(works.media_type 충돌 버그 방지 —
       tmdb_id만으로는 영화/TV가 같은 번호를 가질 수 있어서 media_type 없이는 어떤 작품인지
       확정할 수 없음, 2026-07-20 발견된 media_type 충돌 버그와 동일한 이유로 필수 파라미터로 둠).
     - 관리자가 직접 눈으로 확인하고 고른 이미지이므로 별도 승인 단계 없이 업로드 즉시 노출.

   DELETE /admin/relationship-charts/:tmdb_id
     - 잘못 올린 관계도 삭제(R2 오브젝트도 함께 삭제). media_type 쿼리 파라미터 필수.
   ══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

export async function handleRelationship(path, request, env, url, headers) {
  // ── GET /relationship-charts/:tmdb_id ───────────────────────────
  // [2026-07-25 신규] 공개(비로그인) 조회 — 작품페이지에서 "인물관계도 보기" 박스 노출 여부와
  // 이미지 주소를 확인할 때 씀. status='approved'인 것만 응답(초안/미승인은 절대 노출 안 함).
  if (path.match(/^\/relationship-charts\/\d+$/) && request.method === "GET") {
    try {
      const tmdb_id   = parseInt(path.split("/")[2], 10);
      const mediaType = url.searchParams.get("media_type");
      if (mediaType !== "movie" && mediaType !== "tv") {
        return new Response(JSON.stringify({ ok: true, has_chart: false }), { headers });
      }
      const row = await env.DB.prepare(
        `SELECT image_url, source_type FROM relationship_charts
         WHERE work_tmdb_id = ? AND work_media_type = ? AND status = 'approved'`
      ).bind(tmdb_id, mediaType).first();

      if (!row || !row.image_url) {
        return new Response(JSON.stringify({ ok: true, has_chart: false }), { headers });
      }
      return new Response(JSON.stringify({
        ok: true, has_chart: true, image_url: row.image_url, source_type: row.source_type,
      }), { headers });
    } catch (e) {
      // 실패해도 작품페이지 본 기능엔 영향 없어야 하므로 has_chart:false로 조용히 처리
      return new Response(JSON.stringify({ ok: true, has_chart: false }), { headers });
    }
  }

  // ── GET /admin/relationship-charts/candidates ──────────────────
  // [2026-07-25 수정] 정렬 기준을 HOT100 랭킹 우선에서 "실제 방영일 최신순"으로 변경.
  // 관리자님 요청 — 랭킹과 무관하게 최근 방영한 드라마부터 관계도를 채우고 싶어서.
  // 대상도 TV+한국 작품+드라마만으로 좁힘(영화 제외, 예능/리얼리티/토크/다큐 제외 —
  // variety-similar 분류에 쓰던 것과 같은 genre 키워드 패턴 재사용).
  // release_date가 없는 작품은 release_year로 대략 보정(YYYY-01-01)해서 순서에 반영하고,
  // 그것도 없으면 맨 뒤로 밀림(SQLite에서 NULL은 DESC 정렬 시 가장 마지막).
  if (path === "/admin/relationship-charts/candidates" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10), 1), 30);
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const offset = (page - 1) * limit;
      // [2026-08-05 신규] sort=release(기본, 방영일 최신순) | sort=registered(우리 DB 등록 최신순)
      const sortMode = url.searchParams.get("sort") === "registered" ? "registered" : "release";
      const orderBy = sortMode === "registered"
        ? "w.first_matched_date DESC"
        : "COALESCE(w.release_date, w.release_year || '-01-01') DESC";
      // [2026-08-05 신규] 릴리즈순은 기존대로 TV(드라마)만, 등록순은 한국 영화까지 포함
      const mediaTypeCond = sortMode === "registered"
        ? "w.media_type IN ('tv','movie')"
        : "w.media_type = 'tv'";

      // 관계도가 이미 있는 작품(work_tmdb_id + work_media_type 조합)은 후보에서 제외.
      // HOT100 여부(hs.total_score)는 더 이상 정렬에 안 쓰고, 화면에 "🔥랭킹중" 배지
      // 표시용으로만 같이 내려줌(참고 정보).
      const sql = `
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.media_type, w.poster_path,
               w.original_language, w.first_matched_date, w.release_year, hs.total_score
        FROM works w
        LEFT JOIN hot100_scores hs ON hs.tmdb_id = w.tmdb_id
        WHERE ${mediaTypeCond}
          AND w.original_language = 'ko'
          AND NOT (
            w.genre LIKE '%Reality%' OR w.genre LIKE '%Talk%' OR
            w.genre LIKE '%다큐멘터리%' OR w.genre LIKE '%리얼리티%' OR w.genre LIKE '%토크%'
          )
          AND NOT EXISTS (
            SELECT 1 FROM relationship_charts rc
            WHERE rc.work_tmdb_id = w.tmdb_id AND rc.work_media_type = w.media_type
          )
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;
      const { results } = await env.DB.prepare(sql).bind(limit + 1, offset).all();

      const hasMore = results.length > limit;
      const items = results.slice(0, limit).map(r => ({
        tmdb_id: r.tmdb_id,
        title: r.title_ko || r.title_en,
        media_type: r.media_type,
        poster_path: r.poster_path,
        release_year: r.release_year || null,
        in_hot100: r.total_score != null,
      }));

      return new Response(JSON.stringify({ ok: true, items, page, limit, has_more: hasMore }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/relationship-charts/search ───────────────────────
  // [2026-07-25 신규] 이미 등록된 관계도를 수정/삭제하거나, 특정 작품을 직접 찾아서
  // 업로드하고 싶을 때 쓰는 검색. candidates와 달리 이미 관계도가 있는 작품도 결과에 포함됨
  // (있으면 has_chart:true + 기존 image_url을 같이 줘서, 프론트에서 "교체/삭제" 버튼을 보여줄 수 있게 함).
  if (path === "/admin/relationship-charts/search" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: false, message: "q required" }), { status: 400, headers });
      }
      const isNumeric = /^\d+$/.test(q);

      const sql = isNumeric
        ? `SELECT w.tmdb_id, w.title_ko, w.title_en, w.media_type, w.poster_path,
                  rc.image_url, rc.status
           FROM works w
           LEFT JOIN relationship_charts rc
             ON rc.work_tmdb_id = w.tmdb_id AND rc.work_media_type = w.media_type
           WHERE w.tmdb_id = ?
           LIMIT 10`
        : `SELECT w.tmdb_id, w.title_ko, w.title_en, w.media_type, w.poster_path,
                  rc.image_url, rc.status
           FROM works w
           LEFT JOIN relationship_charts rc
             ON rc.work_tmdb_id = w.tmdb_id AND rc.work_media_type = w.media_type
           WHERE w.title_ko LIKE ? OR w.title_en LIKE ?
           ORDER BY (w.original_language = 'ko') DESC, w.first_matched_date DESC
           LIMIT 10`;

      const { results } = isNumeric
        ? await env.DB.prepare(sql).bind(parseInt(q, 10)).all()
        : await env.DB.prepare(sql).bind(`%${q}%`, `%${q}%`).all();

      const items = results.map(r => ({
        tmdb_id: r.tmdb_id,
        title: r.title_ko || r.title_en,
        media_type: r.media_type,
        poster_path: r.poster_path,
        has_chart: !!(r.image_url && r.status === "approved"),
        image_url: r.image_url || null,
      }));

      return new Response(JSON.stringify({ ok: true, items }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PUT /admin/relationship-charts/:tmdb_id/upload ──────────────
  if (path.match(/^\/admin\/relationship-charts\/\d+\/upload$/) && request.method === "PUT") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id    = parseInt(path.split("/")[3], 10);
      const mediaType  = url.searchParams.get("media_type");
      if (mediaType !== "movie" && mediaType !== "tv") {
        return new Response(JSON.stringify({
          ok: false, message: "media_type 쿼리 파라미터가 필요해요 (movie 또는 tv)",
        }), { status: 400, headers });
      }

      const contentType = request.headers.get("Content-Type") || "image/jpeg";
      const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
      const ext = extMap[contentType] || "jpg";
      const key = `relationship/${tmdb_id}-${Date.now()}.${ext}`;

      await env.IMAGES.put(key, request.body, {
        httpMetadata: { contentType },
      });

      const publicUrl = `https://img.ottrank.kr/${key}`;

      const existing = await env.DB.prepare(
        "SELECT id FROM relationship_charts WHERE work_tmdb_id = ? AND work_media_type = ?"
      ).bind(tmdb_id, mediaType).first();

      if (existing) {
        await env.DB.prepare(
          `UPDATE relationship_charts
           SET image_url = ?, source_type = 'official_image', status = 'approved',
               approved_at = datetime('now')
           WHERE id = ?`
        ).bind(publicUrl, existing.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO relationship_charts
             (work_tmdb_id, work_media_type, image_url, source_type, status, ai_generated, approved_at)
           VALUES (?, ?, ?, 'official_image', 'approved', 0, datetime('now'))`
        ).bind(tmdb_id, mediaType, publicUrl).run();
      }

      return new Response(JSON.stringify({ ok: true, url: publicUrl }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/relationship-charts/:tmdb_id ───────────────────
  if (path.match(/^\/admin\/relationship-charts\/\d+$/) && request.method === "DELETE") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const tmdb_id   = parseInt(path.split("/")[3], 10);
      const mediaType = url.searchParams.get("media_type");
      if (mediaType !== "movie" && mediaType !== "tv") {
        return new Response(JSON.stringify({
          ok: false, message: "media_type 쿼리 파라미터가 필요해요 (movie 또는 tv)",
        }), { status: 400, headers });
      }

      const existing = await env.DB.prepare(
        "SELECT id, image_url FROM relationship_charts WHERE work_tmdb_id = ? AND work_media_type = ?"
      ).bind(tmdb_id, mediaType).first();

      if (existing?.image_url) {
        const key = existing.image_url.replace("https://img.ottrank.kr/", "");
        try { await env.IMAGES.delete(key); } catch (e) { /* R2 삭제 실패해도 DB는 정리 진행 */ }
      }
      if (existing) {
        await env.DB.prepare("DELETE FROM relationship_charts WHERE id = ?").bind(existing.id).run();
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
