// 2026-07-21 rev.1 — track.js (메인페이지+OTT 6종+커뮤니티 페이지 로그 지원 추가)
/* ══════════════════════════════════════════════════════════════
   track.js — 실시간 조회 이벤트 기록 + 조회 (2026-07-21 신설)
   - POST /track/view       : 작품/인물 페이지 + 메인/OTT/커뮤니티 페이지가 열릴 때마다 아주 짧게 신호를 받음
       body: { type: "work" | "person" | "main" | "netflix" | "tving" | "disney" | "wavve" | "coupang" | "boxoffice" | "community", id?: <tmdb_id 숫자, work/person만 필요> }
   - GET  /admin/track/logs : 관리자 전용 — 최근 조회 로그 목록 (Analytics Engine SQL API로 조회)
   - D1은 기록(쓰기) 시점엔 전혀 안 건드리고 Cloudflare Analytics Engine(PAGE_VIEWS 바인딩)에만
     기록. 조회(읽기) 시점에만 D1에서 제목/이름을 붙이기 위해 잠깐 조회함(work/person만 — 나머지
     페이지 종류는 고정된 이름이라 D1 조회 자체가 필요 없음, 아래 PAGE_META 참고).
   - 기록 자체가 실패해도 방문자 화면엔 아무 영향 없어야 하므로, 실패해도
     조용히 ok:false만 돌려주고 500 에러로 화면에 영향 주지 않음.
   - TOP10(같은 작품이 몇 번 조회됐는지 집계)은 다음 단계에서 이 파일에 추가 예정.
   ══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

// [2026-07-21 확장] "work"/"person"은 특정 작품/인물 하나를 가리키므로 번호(id)가 반드시 필요.
// 그 외(메인/OTT별/커뮤니티 페이지)는 페이지 자체가 대상이라 번호가 없음 — PAGE_META에 고정된
// 이름/링크를 미리 정의해두고, 조회 시 D1을 아예 안 건드리고 바로 붙여서 응답한다.
const ID_REQUIRED_TYPES = ["work", "person"];
const PAGE_META = {
  main:      { title: "메인페이지",   url: "/" },
  netflix:   { title: "넷플릭스",     url: "/netflix" },
  tving:     { title: "티빙",         url: "/tving" },
  disney:    { title: "디즈니+",     url: "/disneyplus" },
  wavve:     { title: "웨이브",       url: "/wavve" },
  coupang:   { title: "쿠팡플레이",   url: "/coupangplay" },
  boxoffice: { title: "박스오피스",   url: "/boxoffice" },
  community: { title: "커뮤니티",     url: "/community" },
};
const ALLOWED_TYPES = [...ID_REQUIRED_TYPES, ...Object.keys(PAGE_META)];

export async function handleTrack(path, request, env, url, headers) {
  // ── POST /track/view ─────────────────────────────────────────
  if (path === "/track/view" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const type = body.type;
      const idRequired = ID_REQUIRED_TYPES.includes(type);
      const id = idRequired ? parseInt(body.id, 10) : null;

      // 화이트리스트 검증 — 정해진 종류만 허용. work/person은 숫자 id까지 있어야 하고,
      // 그 외(메인/OTT/커뮤니티)는 type만 맞으면 id 없이도 통과.
      if (!ALLOWED_TYPES.includes(type) || (idRequired && !Number.isInteger(id))) {
        return new Response(
          JSON.stringify({ ok: false, message: "type/id가 올바르지 않아요" }),
          { status: 400, headers }
        );
      }

      // Analytics Engine 바인딩(PAGE_VIEWS)이 아직 없거나 오타났을 때를 대비한 안전장치
      if (env.PAGE_VIEWS && typeof env.PAGE_VIEWS.writeDataPoint === "function") {
        env.PAGE_VIEWS.writeDataPoint({
          // blobs: 문자열 필드 — blob1=종류, blob2=작품/인물 ID(문자열, 페이지 종류는 빈 문자열)
          blobs: [type, id != null ? String(id) : ""],
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
      // [2026-07-21 수정] 전체 개수(COUNT) 조회는 실패 가능성이 있고 API 호출도 1번 더 필요해서
      // 아예 제거 — 대신 "이번 페이지가 꽉 찼으면 다음 페이지도 있다"는 has_more만 판단.
      // 숫자 페이지 버튼(1,2,3...) 대신 이전/다음 버튼만 쓰는 방식으로 화면도 맞춰 변경함.
      const sql = `SELECT blob1 AS type, blob2 AS ref_id, timestamp FROM ottrank_page_views ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const aeRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_AE_API_TOKEN}`,
            "Content-Type": "text/plain",
          },
          body: sql,
        }
      );
      if (!aeRes.ok) {
        const errText = await aeRes.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false,
          message: `Analytics Engine 조회 실패 (HTTP ${aeRes.status}): ${errText.slice(0, 300)}`,
        }), { status: 500, headers });
      }
      const aeJson = await aeRes.json();
      const rows = aeJson.data || [];
      const hasMore = rows.length === limit; // 이번 페이지가 꽉 찼으면 다음 페이지도 있다고 판단

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
        if (r.type === "person") {
          const p = personMap[id];
          return {
            type: "person",
            id,
            title: p ? (p.name_ko || p.name) : `(D1에 없는 인물 #${id})`,
            url: `/person/${id}`,
            viewed_at: r.timestamp,
          };
        }
        // [2026-07-21 추가] 메인/OTT별/커뮤니티 페이지 — 고정된 이름/링크라 D1 조회 없이 바로 반환.
        // PAGE_META에 없는 값(과거 데이터나 예상 못한 값)이 와도 에러 안 나게 폴백 처리.
        const meta = PAGE_META[r.type];
        return {
          type: r.type,
          id: null,
          title: meta ? meta.title : r.type,
          url: meta ? meta.url : "#",
          viewed_at: r.timestamp,
        };
      });

      return new Response(JSON.stringify({
        ok: true, items, page, limit, has_more: hasMore,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
