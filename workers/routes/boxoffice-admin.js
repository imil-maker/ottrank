// 2026-08-02 rev.1 — boxoffice-admin.js (신규 — 박스오피스 캡처 이미지 업로드 기능
// 자동 KOBIS 크롤러가 연속 실패할 때, 관리자가 박스오피스 캡처 이미지를 업로드하면
// Claude Vision이 표를 읽어서 오늘 날짜 랭킹으로 반영하는 기능. admin.js가 이미
// 7,000줄 가까이 커서 완전히 새 파일로 분리함 (relationship.js/track.js와 같은 패턴).
//
// 엔드포인트:
//   POST /admin/boxoffice/parse-image  ← 이미지 → AI 인식 → works/TMDB 매칭 → 미리보기 반환 (저장 안 함)
//   POST /admin/boxoffice/save         ← 관리자가 확인한 목록을 실제 랭킹/통계로 저장
//
// 저장 대상 테이블: rankings(date=오늘KST, platform='boxoffice', category_slot='category01'),
//   boxoffice_stats(tmdb_id+date 기준 UPSERT), works(마스터 데이터 보완)
// ── 기존 crawlers/boxoffice.py, admin.js의 POST /admin/rankings·/admin/manual-rankings와
//    동일한 저장 패턴을 재사용함 (COALESCE 보호, ON CONFLICT 등)

import { _checkAuth } from "../utils/authUtils.js";

const PLATFORM      = "boxoffice";
const CATEGORY_SLOT = "category01";
const SOURCE_NAME   = "일별 박스오피스";

function _todayKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════
// Claude Vision으로 이미지 속 박스오피스 표 읽기
// ══════════════════════════════════════════════════════════════
async function _extractRowsFromImage(env, imageBase64, imageMediaType) {
  const prompt = `이 이미지는 한국 극장 박스오피스 순위표 캡처입니다. 표에 보이는 모든 행을 아래 JSON 형식으로만 정확히 추출해줘. 다른 설명 문장은 절대 쓰지 말고 JSON 배열만 출력해.

각 행 객체 형식:
{
  "rank": 순위(숫자),
  "rank_change": 전일대비 순위변동(숫자, 상승은 양수, 하락은 음수, 변동없음은 0, 신규진입이면 "NEW" 문자열),
  "title": "영화 제목(한글 그대로)",
  "sales_amt": 매출액(숫자만, 쉼표/원 표시 제거),
  "sales_share": 매출액점유율(숫자만, % 기호 제거),
  "audi_cnt": 관객수(숫자만, 쉼표 제거),
  "audi_change": 관객수 전일대비 증감율(숫자만, %기호 제거, 감소는 음수),
  "audi_acc": 누적관객수(숫자만, 쉼표 제거),
  "scrn_cnt": 스크린수(숫자만),
  "show_cnt": 상영횟수(숫자만)
}

값이 이미지에 없으면 null로 넣어줘. 반드시 순수 JSON 배열만 응답해.`;

  const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!claudeResp.ok) {
    const errText = await claudeResp.text();
    throw new Error(`Claude API 오류: ${claudeResp.status} ${errText}`);
  }

  const claudeData = await claudeResp.json();
  const textBlock = (claudeData.content || []).find(b => b.type === "text");
  if (!textBlock) throw new Error("Claude 응답에서 텍스트를 찾을 수 없음");

  // 코드펜스(```json ... ```)가 섞여 오는 경우 대비해서 순수 JSON만 추출
  let raw = textBlock.text.trim();
  raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (e) {
    // 앞뒤에 서술이 섞였을 경우 대비 — 첫 [ 부터 마지막 ] 까지만 재시도
    const start = raw.indexOf("[");
    const end   = raw.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("이미지 인식 결과를 JSON으로 해석할 수 없음");
    rows = JSON.parse(raw.slice(start, end + 1));
  }
  if (!Array.isArray(rows)) throw new Error("이미지 인식 결과가 배열 형식이 아님");
  return rows;
}

// ══════════════════════════════════════════════════════════════
// 제목 → works 우선 조회, 없으면 TMDB 영화 검색
// ══════════════════════════════════════════════════════════════
async function _matchTitle(env, title) {
  if (!title) return null;

  // ① works 테이블 우선 조회 (정확히 일치)
  const existing = await env.DB.prepare(
    "SELECT tmdb_id, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating FROM works WHERE title_ko = ?"
  ).bind(title).first();
  if (existing) {
    return { ...existing, matched: true, match_source: "works" };
  }

  // ② TMDB 한글 영화 검색
  try {
    const searchResp = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&language=ko-KR&region=KR&api_key=${env.TMDB_API_KEY}`
    );
    if (!searchResp.ok) return null;
    const searchData = await searchResp.json();
    const top = (searchData.results || [])[0];
    if (!top) return null;

    // 영문 제목 별도 조회
    let titleEn = "";
    try {
      const enResp = await fetch(
        `https://api.themoviedb.org/3/movie/${top.id}?language=en-US&api_key=${env.TMDB_API_KEY}`
      );
      if (enResp.ok) {
        const enData = await enResp.json();
        const orig = enData.original_title || "";
        const en   = enData.title || "";
        titleEn = /[\uAC00-\uD7A3]/.test(orig) ? en : (orig || en);
      }
    } catch (e) { /* 영문 제목 실패해도 계속 진행 */ }

    return {
      tmdb_id: top.id,
      title_ko: top.title || title,
      title_en: titleEn,
      poster_path: top.poster_path || null,
      genre: null,
      overview: top.overview || null,
      release_year: parseInt((top.release_date || "").slice(0, 4)) || null,
      tmdb_rating: top.vote_average ? parseFloat(top.vote_average.toFixed(1)) : null,
      matched: true,
      match_source: "tmdb_search",
    };
  } catch (e) {
    return null;
  }
}

export async function handleBoxofficeAdmin(path, request, env, url, headers) {
  // ── POST /admin/boxoffice/parse-image ──────────────────────────
  if (path === "/admin/boxoffice/parse-image" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        ok: false, message: "ANTHROPIC_API_KEY가 Workers Secrets에 설정되어 있지 않습니다"
      }), { status: 500, headers });
    }
    try {
      const body = await request.json();
      const { image, media_type } = body;
      if (!image) {
        return new Response(JSON.stringify({ ok: false, message: "image(base64) 필수" }), { status: 400, headers });
      }
      const imgMediaType = media_type || "image/jpeg";

      const extracted = await _extractRowsFromImage(env, image, imgMediaType);

      const rows = [];
      for (const item of extracted) {
        const title = (item.title || "").trim();
        const match = await _matchTitle(env, title);
        rows.push({
          rank: parseInt(item.rank) || null,
          rank_change: item.rank_change ?? null,
          title,
          sales_amt: item.sales_amt != null ? parseInt(item.sales_amt) : null,
          sales_share: item.sales_share != null ? parseFloat(item.sales_share) : null,
          audi_cnt: item.audi_cnt != null ? parseInt(item.audi_cnt) : null,
          audi_change: item.audi_change != null ? parseFloat(item.audi_change) : null,
          audi_acc: item.audi_acc != null ? parseInt(item.audi_acc) : null,
          scrn_cnt: item.scrn_cnt != null ? parseInt(item.scrn_cnt) : null,
          show_cnt: item.show_cnt != null ? parseInt(item.show_cnt) : null,
          matched: !!match,
          tmdb_id: match?.tmdb_id || null,
          title_ko: match?.title_ko || title,
          title_en: match?.title_en || "",
          poster_path: match?.poster_path || null,
          genre: match?.genre || null,
          overview: match?.overview || null,
          release_year: match?.release_year || null,
          tmdb_rating: match?.tmdb_rating ?? null,
          match_source: match?.match_source || null,
        });
      }

      return new Response(JSON.stringify({ ok: true, date: _todayKST(), rows }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/boxoffice/save ─────────────────────────────────
  if (path === "/admin/boxoffice/save" && request.method === "POST") {
    if (!_checkAuth(request, env)) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const rows = body.rows || [];
      const date = body.date || _todayKST();

      let savedCount = 0;
      const skipped = [];

      for (const r of rows) {
        const tmdbId = parseInt(r.tmdb_id);
        if (!tmdbId || !r.rank) {
          skipped.push(r.title || `순위 ${r.rank}`);
          continue;
        }

        // ① works upsert (마스터 데이터 보완, 기존 값은 COALESCE로 보호)
        await env.DB.prepare(`
          INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type, tmdb_rating, rating_updated_at)
          VALUES (?, ?, ?, ?, 'movie', ?, ?)
          ON CONFLICT(tmdb_id) DO UPDATE SET
            title_ko          = COALESCE(NULLIF(works.title_ko, ''), excluded.title_ko),
            title_en          = COALESCE(NULLIF(works.title_en, ''), excluded.title_en),
            poster_path       = COALESCE(works.poster_path, excluded.poster_path),
            tmdb_rating       = COALESCE(excluded.tmdb_rating, works.tmdb_rating),
            rating_updated_at = excluded.rating_updated_at,
            updated_at        = datetime('now')
        `).bind(
          tmdbId, r.title_ko || r.title || "", r.title_en || "", r.poster_path || null,
          r.tmdb_rating ?? null, new Date().toISOString()
        ).run();

        // ② rankings upsert (오늘 날짜, 박스오피스 고정 슬롯)
        await env.DB.prepare(`
          INSERT INTO rankings
            (date, platform, category, category_slot, source_name, rank,
             title_ko, title_en, tmdb_id, poster_path,
             genre, overview, release_year, tmdb_rating)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, platform, category, rank) DO UPDATE SET
            title_ko      = excluded.title_ko,
            title_en      = excluded.title_en,
            tmdb_id       = excluded.tmdb_id,
            poster_path   = excluded.poster_path,
            genre         = excluded.genre,
            overview      = excluded.overview,
            release_year  = excluded.release_year,
            tmdb_rating   = excluded.tmdb_rating,
            category_slot = excluded.category_slot,
            source_name   = excluded.source_name
        `).bind(
          date, PLATFORM, CATEGORY_SLOT, CATEGORY_SLOT, SOURCE_NAME, r.rank,
          r.title_ko || r.title || "", r.title_en || "", tmdbId, r.poster_path || null,
          r.genre || null, r.overview || null, r.release_year || null, r.tmdb_rating ?? null
        ).run();

        // ③ boxoffice_stats upsert (관객수/매출/스크린수 등 상세 지표)
        const rankInten = (r.rank_change === "NEW" || r.rank_change == null) ? null : parseInt(r.rank_change) || 0;
        const rankOldAndNew = r.rank_change === "NEW" ? "NEW" : "OLD";
        await env.DB.prepare(`
          INSERT INTO boxoffice_stats
            (tmdb_id, movie_cd, date, rank, rank_inten, rank_old_and_new,
             audi_cnt, audi_acc, audi_change, sales_amt, sales_share, scrn_cnt, show_cnt)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tmdb_id, date) DO UPDATE SET
            rank             = excluded.rank,
            rank_inten       = excluded.rank_inten,
            rank_old_and_new = excluded.rank_old_and_new,
            audi_cnt         = excluded.audi_cnt,
            audi_acc         = excluded.audi_acc,
            audi_change      = excluded.audi_change,
            sales_amt        = excluded.sales_amt,
            sales_share      = excluded.sales_share,
            scrn_cnt         = excluded.scrn_cnt,
            show_cnt         = excluded.show_cnt
        `).bind(
          tmdbId, date, r.rank, rankInten, rankOldAndNew,
          r.audi_cnt ?? null, r.audi_acc ?? null, r.audi_change ?? null,
          r.sales_amt ?? null, r.sales_share ?? null, r.scrn_cnt ?? null, r.show_cnt ?? null
        ).run();

        savedCount++;
      }

      await env.DB.prepare(
        "INSERT INTO admin_logs (action, platform, category_slot, after_value) VALUES ('boxoffice_image_upload', ?, ?, ?)"
      ).bind(PLATFORM, CATEGORY_SLOT, JSON.stringify({ date, saved: savedCount, skipped })).run();

      return new Response(JSON.stringify({ ok: true, date, saved: savedCount, skipped }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}