/* 2026-07-25 rev.2 — relationship.js (후보 정렬 기준 수정: 랭킹 우선 → 한국작품 우선 → 최근등록순, popularity/tmdb_rating 미사용) */
/* ══════════════════════════════════════════════════════════════
   relationship.js — 등장인물 관계도 (2026-07-25 신설)
   - 인터넷에 이미 돌고 있는 방송사/제작사 공식 관계도 이미지를 관리자가 직접 찾아서
     업로드하는 방식. AI초안 방식(노드/관계선 자동 생성)은 추후 별도 구현 예정 — 이 파일은
     "공식 이미지 업로드" 경로만 우선 담당함.

   GET /admin/relationship-charts/candidates
     - 아직 관계도(relationship_charts 행)가 없는 작품을 10개씩 조회.
     - 정렬: ① 지금 HOT100(hot100_scores)에 있는 작품 먼저(순위 높은 순),
             ② 랭킹 없는 작품 중에서는 한국 작품(original_language='ko') 먼저,
             ③ 그 안에서는 최근 등록순(first_matched_date DESC).
       (주의: works 테이블엔 popularity 컬럼이 없음 — persons 테이블에만 있음. 처음에
        w.popularity로 잘못 짰다가 SQLITE_ERROR로 발견해서 위 기준으로 수정함, 2026-07-25)
     - ?page=1부터 시작, ?limit=10 기본값.

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
  // ── GET /admin/relationship-charts/candidates ──────────────────
  if (path === "/admin/relationship-charts/candidates" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10), 1), 30);
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const offset = (page - 1) * limit;

      // 관계도가 이미 있는 작품(work_tmdb_id + work_media_type 조합)은 후보에서 제외.
      // hot100_scores에 있으면 그 순위(total_score DESC)를 우선 정렬키로 쓰고,
      // 없는 작품은 뒤로 밀리게(랭킹 있는 작품이 항상 위) CASE로 그룹을 먼저 나눔.
      const sql = `
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.media_type, w.poster_path,
               w.original_language, w.first_matched_date, hs.total_score
        FROM works w
        LEFT JOIN hot100_scores hs ON hs.tmdb_id = w.tmdb_id
        WHERE NOT EXISTS (
          SELECT 1 FROM relationship_charts rc
          WHERE rc.work_tmdb_id = w.tmdb_id AND rc.work_media_type = w.media_type
        )
        ORDER BY
          CASE WHEN hs.total_score IS NOT NULL THEN 0 ELSE 1 END,
          hs.total_score DESC,
          CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
          w.first_matched_date DESC
        LIMIT ? OFFSET ?
      `;
      const { results } = await env.DB.prepare(sql).bind(limit + 1, offset).all();

      const hasMore = results.length > limit;
      const items = results.slice(0, limit).map(r => ({
        tmdb_id: r.tmdb_id,
        title: r.title_ko || r.title_en,
        media_type: r.media_type,
        poster_path: r.poster_path,
        in_hot100: r.total_score != null,
      }));

      return new Response(JSON.stringify({ ok: true, items, page, limit, has_more: hasMore }), { headers });
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
