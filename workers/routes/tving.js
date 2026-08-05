/* 2026-08-06 rev.5 — tving.js (버그수정 — rankings.category 컬럼에 SLOT("category01")을
   그대로 넣고 있어서 관리자 화면 TMDB 링크가 항상 movie로 연결되던 문제. works.media_type을
   같이 조회해서 실제 값(tv/movie)을 저장하도록 수정, 못 찾으면 'tv'로 폴백(이 카테고리 자체가
   "오늘의 TV 시리즈"라 대부분 tv). 자동 매칭·수동 매칭(pending/match) 둘 다 수정) */
/* 2026-08-06 rev.4 — tving.js (rankings.updated_at 컬럼 신규 반영 — 저장할 때마다 갱신
   시각 기록. 관리자모드에서 "마지막 갱신 시각" 표시용) */
/* 2026-08-06 rev.3 — tving.js (매칭 대기 4건 원인 분석 결과 반영 — 띄어쓰기/"시즌" 글자
   표기 차이로 제목 완전일치에 실패하던 문제. 공백+"시즌" 글자만 제거(숫자는 유지)한
   정규화 비교 단계를 우리 DB 검색과 TMDB 검색 양쪽에 추가) */
/* 2026-08-06 rev.2 — tving.js (포스터 안 뜨던 버그 수정 — 랭킹 저장 시 poster_path를
   전혀 안 채우고 있었음. 매칭된 작품의 poster_path를 같이 조회해서 rankings.poster_path에
   저장하도록 수정. 수동 매칭(POST /admin/tving/pending/:id/match)도 동일하게 수정) */
/* 2026-08-06 rev.1 — tving.js (신규 파일) — 티빙 category01 자동 랭킹 수집 전용.
   PC(관리자님 컴퓨터)에서 Playwright로 추출한 오늘의 티빙 TOP20 목록을 받아서:
   ① tving_code로 이미 연결된 작품인지 먼저 확인 ② 없으면 제목으로 우리 works에서 검색
   ③ 그래도 없으면 TMDB 검색 ④ 다 실패하면 tving_pending_matches에 보류(관리자 수동 매칭 대기).
   다른 플랫폼/기존 파일(admin.js, relationship.js 등)과 완전히 분리 — 티빙만 건드림. */

/* ══════════════════════════════════════════════════════════════
   라우트 목록
   POST /admin/tving/save-ranking        ← PC 크롤러가 오늘의 TOP20 보낼 때 호출
   GET  /admin/tving/pending             ← 매칭 대기 목록 조회 (어드민 화면용)
   POST /admin/tving/pending/:id/match   ← 대기 항목을 실제 작품(tmdb_id)에 수동 연결
   DELETE /admin/tving/pending/:id       ← 대기 항목 삭제 (예: 쇼츠/광고 등 작품이 아닌 항목)
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

const PLATFORM = "tving";
const SLOT     = "category01";

function _todayKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 티빙 콘텐츠 URL(예: https://www.tving.com/contents/P001788898)에서 코드만 추출
function _extractTvingCode(url) {
  const m = String(url || "").match(/\/contents\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// [2026-08-06 신규] 한글 제목 표기 차이(띄어쓰기, "시즌" 글자 유무) 흡수용 정규화.
// 숫자는 그대로 둠 — TMDB는 "하트시그널5"처럼 숫자를 붙여쓰지만 "시즌"이라는 단어 자체를
// 안 쓰기 때문에, 숫자까지 지우면 오히려 안 맞음(예: 심야괴담회6 vs 심야괴담회 매칭 실패).
function _normalizeTitle(s) {
  return String(s || "").replace(/\s+/g, "").replace(/시즌/g, "");
}

// TMDB 제목 검색 — 여러 매체(tv/movie)를 한글 제목으로 검색해서 가장 그럴듯한 첫 결과 반환
async function _searchTmdbByTitle(env, title) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}&language=ko-KR&api_key=${env.TMDB_API_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.results || []).find(r => r.media_type === "tv" || r.media_type === "movie");
    if (!hit) return null;
    return { tmdb_id: hit.id, media_type: hit.media_type, poster_path: hit.poster_path || null };
  } catch (e) {
    return null;
  }
}

export async function handleTving(path, request, env, url, headers) {
  // ── POST /admin/tving/save-ranking ────────────────────────────
  if (path === "/admin/tving/save-ranking" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body  = await request.json();
      const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
      if (!items.length) {
        return new Response(JSON.stringify({ ok: false, message: "items required" }), { status: 400, headers });
      }

      const today = _todayKST();
      const matchedRows = []; // { rank, tmdb_id, title_ko }
      const pendingRows  = []; // { rank, tving_code, title }

      for (const raw of items) {
        const rank        = parseInt(raw.rank);
        const title        = String(raw.title || "").trim();
        const tving_code  = raw.tving_code || _extractTvingCode(raw.url);
        if (!rank || !title || !tving_code) continue;

        // ① tving_code로 이미 연결된 작품인지 확인
        let matched = await env.DB.prepare(
          "SELECT tmdb_id, poster_path, media_type FROM works WHERE tving_code = ?"
        ).bind(tving_code).first();

        // ② 제목으로 우리 works에서 검색
        if (!matched) {
          matched = await env.DB.prepare(
            "SELECT tmdb_id, poster_path, media_type FROM works WHERE title_ko = ? LIMIT 1"
          ).bind(title).first();
        }

        // ③ [2026-08-06 신규] 공백·"시즌" 글자만 지우고(숫자는 유지) 비교 —
        //    "하트시그널 시즌5" ↔ "하트시그널5", "언니네 산지직송3" ↔ "언니네 산지직송 3" 매칭용
        if (!matched) {
          const normTitle = _normalizeTitle(title);
          matched = await env.DB.prepare(`
            SELECT tmdb_id, poster_path, media_type FROM works
            WHERE REPLACE(REPLACE(title_ko, ' ', ''), '시즌', '') = ?
            LIMIT 1
          `).bind(normTitle).first();
        }

        // ④ TMDB 제목 검색
        if (!matched) {
          const tmdbHit = await _searchTmdbByTitle(env, title);
          if (tmdbHit) matched = { tmdb_id: tmdbHit.tmdb_id, poster_path: tmdbHit.poster_path || null, media_type: tmdbHit.media_type || null };
        }

        // ⑤ [2026-08-06 신규] 정규화한 제목으로 TMDB 재검색 (④가 실패했을 때만)
        if (!matched) {
          const normTitle = _normalizeTitle(title);
          if (normTitle !== title) {
            const tmdbHit2 = await _searchTmdbByTitle(env, normTitle);
            if (tmdbHit2) matched = { tmdb_id: tmdbHit2.tmdb_id, poster_path: tmdbHit2.poster_path || null, media_type: tmdbHit2.media_type || null };
          }
        }

        if (matched) {
          // tving_code를 works에 저장(다음부터는 ①에서 바로 잡히도록)
          await env.DB.prepare(
            "UPDATE works SET tving_code = ? WHERE tmdb_id = ? AND (tving_code IS NULL OR tving_code != ?)"
          ).bind(tving_code, matched.tmdb_id, tving_code).run();

          matchedRows.push({
            rank, tmdb_id: matched.tmdb_id, title_ko: title,
            poster_path: matched.poster_path || null,
            // [2026-08-06 버그수정] category 컬럼에 SLOT("category01")을 그대로 넣고 있어서
            // 관리자 화면 TMDB 링크가 항상 movie로 연결되던 문제 — 실제 media_type 사용,
            // 못 찾으면 이 카테고리(오늘의 TV 시리즈)의 기본값인 'tv'로 폴백
            media_type: matched.media_type || 'tv',
          });

          // 매칭됐으니 혹시 대기 목록에 같은 코드가 남아있었다면 정리
          await env.DB.prepare(
            "DELETE FROM tving_pending_matches WHERE tving_code = ?"
          ).bind(tving_code).run();
        } else {
          pendingRows.push({ rank, tving_code, title });
        }
      }

      // ── 랭킹 저장: 오늘자 티빙 category01을 통째로 지우고 새로 채움
      //    (is_manual = 2 로 수동 고정된 행은 절대 안 건드림 — 관리자 지정 값 보호)
      await env.DB.prepare(
        "DELETE FROM rankings WHERE platform = ? AND category_slot = ? AND date = ? AND is_manual != 2"
      ).bind(PLATFORM, SLOT, today).run();

      if (matchedRows.length) {
        const stmts = matchedRows.map(r =>
          env.DB.prepare(`
            INSERT INTO rankings (platform, category_slot, category, date, rank, tmdb_id, title_ko, poster_path, is_manual, source_name, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'tving_auto', datetime('now'))
          `).bind(PLATFORM, SLOT, r.media_type, today, r.rank, r.tmdb_id, r.title_ko, r.poster_path)
        );
        await env.DB.batch(stmts);
      }

      // ── 매칭 실패 항목은 대기 테이블에 upsert
      for (const p of pendingRows) {
        await env.DB.prepare(`
          INSERT INTO tving_pending_matches (tving_code, title, rank)
          VALUES (?, ?, ?)
          ON CONFLICT(tving_code) DO UPDATE SET
            title = excluded.title, rank = excluded.rank, updated_at = datetime('now')
        `).bind(p.tving_code, p.title, p.rank).run();
      }

      return new Response(JSON.stringify({
        ok: true,
        matched: matchedRows.length,
        pending: pendingRows.length,
        pendingItems: pendingRows,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/tving/pending ────────────────────────────────
  if (path === "/admin/tving/pending" && request.method === "GET") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        "SELECT id, tving_code, title, rank, created_at, updated_at FROM tving_pending_matches ORDER BY rank ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, items: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/tving/pending/:id/match ─────────────────────
  const matchMatch = path.match(/^\/admin\/tving\/pending\/(\d+)\/match$/);
  if (matchMatch && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const id = parseInt(matchMatch[1]);
      const body = await request.json();
      const tmdb_id = parseInt(body.tmdb_id);
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }

      const pending = await env.DB.prepare(
        "SELECT * FROM tving_pending_matches WHERE id = ?"
      ).bind(id).first();
      if (!pending) {
        return new Response(JSON.stringify({ ok: false, message: "대기 항목을 찾을 수 없습니다" }), { status: 404, headers });
      }

      await env.DB.prepare(
        "UPDATE works SET tving_code = ? WHERE tmdb_id = ?"
      ).bind(pending.tving_code, tmdb_id).run();

      const workRow = await env.DB.prepare(
        "SELECT poster_path, media_type FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      const today = _todayKST();
      await env.DB.prepare(`
        INSERT INTO rankings (platform, category_slot, category, date, rank, tmdb_id, title_ko, poster_path, is_manual, source_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'tving_auto', datetime('now'))
      `).bind(PLATFORM, SLOT, workRow?.media_type || 'tv', today, pending.rank, tmdb_id, pending.title, workRow?.poster_path || null).run();

      await env.DB.prepare(
        "DELETE FROM tving_pending_matches WHERE id = ?"
      ).bind(id).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/tving/pending/:id ─────────────────────────
  const deleteMatch = path.match(/^\/admin\/tving\/pending\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      await env.DB.prepare(
        "DELETE FROM tving_pending_matches WHERE id = ?"
      ).bind(parseInt(deleteMatch[1])).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
}
