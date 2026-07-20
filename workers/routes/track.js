/* ══════════════════════════════════════════════════════════════
   track.js — 실시간 조회 이벤트 기록 + 조회 (2026-07-21 신설)
   - POST /track/view       : 작품페이지/인물페이지가 열릴 때마다 아주 짧게 신호를 받음
       body: { type: "work" | "person", id: <tmdb_id 숫자> }
   - GET  /admin/track/logs : 관리자 전용 — 최근 조회 로그 목록 (Analytics Engine SQL API로 조회)
   - D1은 기록(쓰기) 시점엔 전혀 안 건드리고 Cloudflare Analytics Engine(PAGE_VIEWS 바인딩)에만
     기록. 조회(읽기) 시점에만 D1에서 제목/이름을 붙이기 위해 잠깐 조회함.
   - 기록 자체가 실패해도 방문자 화면엔 아무 영향 없어야 하므로, 실패해도
     조용히 ok:false만 돌려주고 500 에러로 화면에 영향 주지 않음.
   - TOP10(같은 작품이 몇 번 조회됐는지 집계)은 다음 단계에서 이 파일에 추가 예정.
   ══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

const ALLOWED_TYPES = ["work", "person"];

export async function handleTrack(path, request, env, url, headers) {
  // ── POST /track/view ─────────────────────────────────────────
  if (path === "/track/view" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const type = body.type;
      const id   = parseInt(body.id, 10);

      // 화이트리스트 검증 — 정해진 타입("work"/"person")과 숫자 ID만 허용
      if (!ALLOWED_TYPES.includes(type) || !Number.isInteger(id)) {
        return new Response(
          JSON.stringify({ ok: false, message: "type/id가 올바르지 않아요" }),
          { status: 400, headers }
        );
      }

      // Analytics Engine 바인딩(PAGE_VIEWS)이 아직 없거나 오타났을 때를 대비한 안전장치
      if (env.PAGE_VIEWS && typeof env.PAGE_VIEWS.writeDataPoint === "function") {
        env.PAGE_VIEWS.writeDataPoint({
          // blobs: 문자열 필드 — blob1=타입("work"/"person"), blob2=작품/인물 ID(문자열)
          blobs: [type, String(id)],
          // doubles: 숫자 필드 — 조회 1회당 1로 고정(나중에 count/sum 집계용)
          doubles: [1],
          // indexes: 빠른 필터링용 — 타입별로 묶어서 조회할 때 씀(최대 1개)
          indexes: [type],
        });
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      // 기록 실패해도 사용자 경험엔 영향 주면 안 되므로 500 대신 조용히 처리
      return new Response(JSON.stringify({ ok: false, message: e.message }), { headers });
    }
  }

  // ── GET /admin/track/logs ─────────────────────────────────────
  // [2026-07-21 신설] 실시간 조회 로그 목록 (관리자 전용). Analytics Engine에 기록해둔
  // 최근 조회 이벤트(작품/인물)를 최신순으로 가져와서, D1에서 제목/이름을 붙여 반환.
  if (path === "/admin/track/logs" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      if (!env.CF_ACCOUNT_ID || !env.CF_AE_API_TOKEN) {
        return new Response(JSON.stringify({
          ok: false,
          message: "CF_ACCOUNT_ID / CF_AE_API_TOKEN 환경변수가 설정되지 않았어요 (Settings → Variables and Secrets 확인)",
        }), { status: 500, headers });
      }
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const offset = (page - 1) * limit;

      // Analytics Engine SQL API — writeDataPoint(blobs:[type, id]) 그대로 조회.
      // 데이터셋 이름은 바인딩 만들 때 정한 "ottrank_page_views" (바인딩 변수명 PAGE_VIEWS와는 별개).
      // [2026-07-21 수정] 페이지네이션 지원 — OFFSET 추가 + 전체 개수(total)도 별도 쿼리로 조회.
      const sql = `SELECT blob1 AS type, blob2 AS ref_id, timestamp FROM ottrank_page_views ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const countSql = `SELECT COUNT(*) AS cnt FROM ottrank_page_views`;

      const aeQuery = (query) => fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_AE_API_TOKEN}`,
            "Content-Type": "text/plain",
          },
          body: query,
        }
      );

      const [aeRes, aeCountRes] = await Promise.all([aeQuery(sql), aeQuery(countSql)]);
      if (!aeRes.ok) {
        const errText = await aeRes.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false,
          message: `Analytics Engine 조회 실패 (HTTP ${aeRes.status}): ${errText.slice(0, 300)}`,
        }), { status: 500, headers });
      }
      const aeJson = await aeRes.json();
      const rows = aeJson.data || [];

      let total = rows.length + offset; // 전체 개수 조회 실패해도 최소한 이 페이지만큼은 있다고 표시
      if (aeCountRes.ok) {
        const countJson = await aeCountRes.json().catch(() => null);
        const cnt = countJson?.data?.[0]?.cnt;
        if (typeof cnt === "number") total = cnt;
      }

      // 작품/인물 제목을 D1에서 한 번에 조회해서 붙임 (건마다 조회하지 않고 IN절로 한 번에)
      const workIds   = [...new Set(rows.filter(r => r.type === "work").map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];
      const personIds = [...new Set(rows.filter(r => r.type === "person").map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];

      const workMap = {};
      if (workIds.length) {
        const ph = workIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, title_ko, media_type, release_year FROM works WHERE tmdb_id IN (${ph})`
        ).bind(...workIds).all();
        results.forEach(w => { workMap[w.tmdb_id] = w; });
      }
      const personMap = {};
      if (personIds.length) {
        const ph = personIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, name, name_ko FROM persons WHERE tmdb_id IN (${ph})`
        ).bind(...personIds).all();
        results.forEach(p => { personMap[p.tmdb_id] = p; });
      }

      const currentYear = new Date().getFullYear();
      const items = rows.map(r => {
        const id = parseInt(r.ref_id, 10);
        if (r.type === "work") {
          const w = workMap[id];
          const year = (w && w.release_year) || currentYear;
          return {
            type: "work",
            id,
            title: w ? w.title_ko : `(D1에 없는 작품 #${id})`,
            url: `/title/1-${year}${id}`,
            viewed_at: r.timestamp,
          };
        }
        const p = personMap[id];
        return {
          type: "person",
          id,
          title: p ? (p.name_ko || p.name) : `(D1에 없는 인물 #${id})`,
          url: `/person/${id}`,
          viewed_at: r.timestamp,
        };
      });

      return new Response(JSON.stringify({
        ok: true, items, page, limit, total,
        has_more: offset + items.length < total,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
