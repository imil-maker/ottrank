/* ══════════════════════════════════════════════════════════════
   track.js — 실시간 조회 이벤트 기록 (2026-07-21 신설)
   - POST /track/view : 작품페이지/인물페이지가 열릴 때마다 아주 짧게 신호를 받음
       body: { type: "work" | "person", id: <tmdb_id 숫자> }
   - D1은 전혀 안 건드리고 Cloudflare Analytics Engine(PAGE_VIEWS 바인딩)에만 기록.
     D1 트래픽/용량에 영향 없음 — 완전히 분리된 저장소.
   - 기록 자체가 실패해도 방문자 화면엔 아무 영향 없어야 하므로, 실패해도
     조용히 ok:false만 돌려주고 500 에러로 화면에 영향 주지 않음.
   - 다음 단계(관리자 실시간 화면)에서 이 데이터를 Analytics Engine SQL API로
     조회해서 "최근 N분간 가장 많이 본 작품/인물 TOP 10"을 보여줄 예정.
   ══════════════════════════════════════════════════════════════ */

const ALLOWED_TYPES = ["work", "person"];

export async function handleTrack(path, request, env, headers) {
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

  return null;
}