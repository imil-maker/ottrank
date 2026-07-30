/* 2026-07-30 rev.7 — videos.js (POST /works/register 신규 등록 시, 일본어 TV 작품에
   "japan drama"/"japan animation" 키워드 자동 연결 — 애니메이션 장르 여부로 분기) */
/* ══════════════════════════════════════════════════════════════
   영상 관련 API 라우트
   GET    /videos/:tmdb_id          작품별 영상 목록
   POST   /admin/videos/crawl       관리자 YouTube 크롤링 (단건, 수동)
   POST   /admin/videos/batch-crawl 관리자 YouTube 크롤링 (배치, 어드민 수동 반복호출 + 하루 예산 상한)
   POST   /admin/videos             관리자 영상 수동 추가
   PATCH  /admin/videos/:id/main    메인 영상 지정
   DELETE /admin/videos/:id         영상 삭제
   GET    /imdb/:imdbId             IMDb 평점 조회
   POST   /imdb/save                IMDb ID 저장
   GET    /youtube/trending         YouTube 한국 급상승 TOP50
   GET    /works/variety-similar/:tmdb_id  예능 태그 기반 비슷한 작품 (공개, % 계산 포함)
   GET    /works/:tmdb_id/cast      우리 DB(work_cast) 출연진 조회 (공개, 2026-07-26 신설)
   POST   /works/:tmdb_id/cast-sync 우리 DB에 없을 때만 호출 — 서버가 TMDB에서 받아와 저장 (공개, 2026-07-26 신설)
   GET    /works/:tmdb_id           작품 단건 조회
   GET    /search/keyword           키워드로 작품 검색 (공개, 한국작품 우선)

   [2026-07-15] /works/search, /works/exists는 search.js로 이전됨 (index.js에서 라우팅)
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";
import { _crawlYoutubeVideos, _batchCrawlYoutubeVideos, _saveTmdbVideos } from "../utils/youtube.js";

// [2026-07-26 신규] 신규 작품 등록 시 출연진/감독을 work_cast에 조용히 저장 (SEO 서버사이드 프리필용)
// admin.js의 POST /admin/works/backfill-cast(기존 작품 일괄 채우기)와 완전히 동일한 로직의
// "단건 버전". 신규 등록되는 작품은 이 함수가 자동으로 채워주므로, 앞으로 어드민 배치는
// "이 기능이 생기기 전에 등록된 기존 작품"만 채우면 됨 — 매번 수동으로 안 돌려도 됨.
// POST /works/register 응답을 막지 않도록 ctx.waitUntil()로 완전히 분리해서 백그라운드 처리하고,
// 실패해도 조용히 넘어감(작품 등록 자체는 이미 끝난 뒤라 사용자에게 영향 없음, 다음에 어드민
// 배치("🎭 출연진 채우기")로도 다시 채울 수 있음).
// [2026-07-26 수정] originalLanguage 파라미터 추가 — 한국 작품('ko')만 출연진 무제한 저장,
// 그 외(외국작품/원어 미확인)는 상위 10명만 저장. 미국 장수 수사물(NCIS, CSI 등)이 시즌
// 15~25개씩 누적되며 작품당 최대 7,613명까지 쌓이던 문제를 admin.js와 동일하게 방지.
async function _saveCastForWork(tmdbId, mediaType, env, originalLanguage) {
  const mtypes  = mediaType ? [mediaType] : ["movie", "tv"];
  const castCap = originalLanguage === "ko" ? Infinity : 10;
  for (const mtype of mtypes) {
    try {
      const endpoint = mtype === "tv" ? "aggregate_credits" : "credits";
      const resp = await fetch(
        `https://api.themoviedb.org/3/${mtype}/${tmdbId}/${endpoint}?api_key=${env.TMDB_API_KEY}&language=ko-KR`
      );
      if (!resp.ok) continue;
      const data = await resp.json();

      const directors = (data.crew || [])
        .filter(p => p.job === "Director" || p.department === "Directing")
        .slice(0, 3);
      const castList = (data.cast || []).slice(0, castCap);
      if (!directors.length && !castList.length) continue; // 못 찾았으면 다음 media_type 시도

      const stmts = [
        env.DB.prepare("DELETE FROM work_cast WHERE tmdb_id = ? AND media_type = ?").bind(tmdbId, mtype),
      ];
      directors.forEach((p, idx) => {
        stmts.push(env.DB.prepare(`
          INSERT INTO work_cast (tmdb_id, media_type, person_tmdb_id, name, role, character_name, profile_path, billing_order)
          VALUES (?, ?, ?, ?, 'director', NULL, ?, ?)
        `).bind(tmdbId, mtype, p.id, p.name || "", p.profile_path || null, idx));
      });
      castList.forEach((p, idx) => {
        // TV(aggregate_credits)는 캐릭터명이 roles 배열 안에, 영화(credits)는 바로 character에 있음
        const characterName = mtype === "tv"
          ? ((p.roles && p.roles[0] && p.roles[0].character) || "")
          : (p.character || "");
        const order = (p.order !== undefined && p.order !== null) ? p.order : idx;
        stmts.push(env.DB.prepare(`
          INSERT INTO work_cast (tmdb_id, media_type, person_tmdb_id, name, role, character_name, profile_path, billing_order)
          VALUES (?, ?, ?, ?, 'cast', ?, ?, ?)
        `).bind(tmdbId, mtype, p.id, p.name || "", characterName, p.profile_path || null, order));
      });
      stmts.push(
        env.DB.prepare("UPDATE works SET cast_synced_at = ? WHERE tmdb_id = ?")
          .bind(new Date().toISOString(), tmdbId)
      );

      await env.DB.batch(stmts);
      return; // 성공했으면 다른 media_type은 시도할 필요 없음
    } catch (e) { /* 다음 media_type으로 계속 시도 — 둘 다 실패하면 조용히 포기 */ }
  }
}

// [2026-07-26 신규] 봇 판별 — track.js의 _isBotUserAgent와 동일한 패턴을 재사용(중복 정의).
// 목적: 봇(특히 자바스크립트까지 실행하는 크롤러)이 우리 사이트에 없는 TMDB ID를 계속
// 방문하면서 /works/register를 자동 호출해 저품질 작품이 우리 DB에 계속 새로 등록되는 걸
// 막기 위함(2026-07-26 대량 데이터 정리 작업 직후 발견된 문제).
// ⚠️ track.js와 다른 파일에 따로 정의돼 있어 나중에 목록이 어긋날 위험 있음 — 봇 이름을
// 새로 추가/변경할 일이 생기면 track.js와 이 파일 둘 다 같이 확인할 것.
function _isBotUserAgent(ua) {
  if (!ua) return false;
  return /bot|crawl|spider|slurp|yeti|daumoa|naver|yandex|baidu|duckduckbot|ahrefsbot|semrushbot|mj12bot|petalbot|bytespider|facebookexternalhit|preview/i.test(ua);
}

export async function handleVideos(path, request, env, ctx, url, headers) {

  // ── GET /videos/:tmdb_id ─────────────────────────────────────
  // [2026-07-08 구조 변경] YouTube 실시간 방문 트리거 완전 제거.
  //   과거: 방문자가 접속할 때마다 DB 영상 개수를 보고 YouTube Data API
  //         search.list를 호출해 보충 크롤링을 시도했음.
  //   문제: search.list는 2026-06-01부로 하루 약 100회 전용 버킷으로
  //         분리됐는데, 실패(관련 영상 못 찾음)해도 DB에 기록을 안 남겨서
  //         같은 작품을 재방문/새로고침할 때마다 무한 재시도가 발생 →
  //         트래픽이 적어도 하루 100회 버킷이 순식간에 소진되어
  //         quotaExceeded(403)로 전체 크롤링이 마비되는 사고가 반복됨.
  //   변경: YouTube 보충 크롤링은 이 엔드포인트에서 완전히 분리하고,
  //         daily_crawl.yml 배치(POST /admin/videos/batch-crawl, 추후 작업)
  //         에서 일일 예산 상한 + 쿨다운을 두고 실행하도록 이전.
  //   유지: TMDB 트레일러 저장(_saveTmdbVideos)은 TMDB API라
  //         YouTube 할당량과 무관하므로 그대로 최초 방문 시 실행.
  if (path.startsWith("/videos/") && !path.includes("/admin") && request.method === "GET") {
    const tmdb_id = parseInt(path.split("/videos/")[1]);
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        "SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC"
      ).bind(tmdb_id).all();

      if (results.length === 0) {
        // 영상 없음 → TMDB 트레일러만 저장 (YouTube 보충 크롤링은 배치로 이전)
        ctx.waitUntil(_saveTmdbVideos(tmdb_id, env));
      }
      // 영상 1개 이상 → 방문 트리거로는 아무것도 하지 않음
      //   (YouTube 보충 크롤링은 daily_crawl.yml 배치가 전담)

      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/videos/crawl ─────────────────────────────────
  if (path === "/admin/videos/crawl" && request.method === "POST") {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { tmdb_id } = body;
      if (!tmdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
      }
      const saved = await _crawlYoutubeVideos(parseInt(tmdb_id), env);
      return new Response(JSON.stringify({ ok: true, saved }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/videos/batch-crawl ───────────────────────────
  // [2026-07-08 신설 / 2026-07-09 수정 / 2026-07-13 수정]
  //   대상: title_videos 개수 0~1개 AND (yt_crawl_attempted_at NULL 또는 3일 경과)
  //         AND adult_flag != 1 (2026-07-13 추가 — 성인물로 표시된 작품은
  //         관련영상 자동수집 대상에서 제외. 이미 저장된 영상은 안 건드림,
  //         앞으로의 신규 크롤링만 막음)
  //   우선순위: 오늘 rankings에 존재하는 작품 → works.created_at 최신순
  //   개별 작품 실패가 배치 전체를 중단시키지 않도록 각 건마다 try/catch
  //
  //   [2026-07-09 변경] 호출 주체가 daily_crawl.yml(자동 크론, 하루 4회)에서
  //   어드민 "🎥 관련영상 채우기" 탭(사람이 remaining:0까지 반복 클릭)으로
  //   바뀜에 따라, 하루 총 예산 상한을 신설함.
  //     - YouTube search.list는 2026-06-01부로 하루 약 100회 전용 버킷
  //       (10,000 unit 풀과 별개, 공식 문서로 확인됨)
  //     - 작품 1개당 검색 2회 소모 → 하루 30개 작품(=최대 60회)까지만 이
  //       배치로 처리, 나머지 40회는 관리자 단건 수동 크롤링
  //       (POST /admin/videos/crawl) 여유분으로 남겨둠
  //     - 예산 초과 시 attempted:0으로 응답 → 프론트의 "attempted 없으면
  //       중단" 반복 호출 로직이 자연스럽게 멈춤 (다른 배치 탭들과 동일 패턴)
  //   응답 필드도 다른 배치 탭들(attempted/filled/remaining)과 통일함
  //   (기존 processed/totalSaved에서 변경 — admin_videos.html 신규 탭과
  //   호환 위해 반드시 필요)
  if (path === "/admin/videos/batch-crawl" && request.method === "POST") {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      let limit = 20;
      try {
        const body = await request.json();
        if (body?.limit && Number.isInteger(body.limit) && body.limit > 0) {
          limit = body.limit;
        }
      } catch (e) {
        // body 없이 호출된 경우 기본값(20) 사용 — 정상 케이스이므로 무시
      }

      // ── 하루 총 예산 상한 체크 ──────────────────────────────
      const DAILY_BUDGET  = 30;
      const todayCountRow = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM works WHERE yt_crawl_attempted_at >= date('now')"
      ).first();
      const todayCount = todayCountRow?.cnt || 0;

      if (todayCount >= DAILY_BUDGET) {
        // 예산 소진 — 남은 대상 개수만 조회해서 알려주고 attempted:0으로 응답
        const eligibleRow = await env.DB.prepare(`
          SELECT COUNT(*) AS cnt
          FROM works w
          WHERE (
            SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
          ) <= 1
          AND (
            w.yt_crawl_attempted_at IS NULL
            OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
          )
          AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        `).first();
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: eligibleRow?.cnt || 0,
          message: `오늘 예산(${DAILY_BUDGET}개) 소진 — 내일 다시 시도해주세요`
        }), { headers });
      }

      // 오늘 남은 예산과 요청 limit 중 작은 값만 처리
      const effectiveLimit = Math.min(limit, DAILY_BUDGET - todayCount);

      // 오늘 기준 최신 크롤링 날짜 조회 (rankings.date < 'manual' 중 최댓값)
      const latestDateRow = await env.DB.prepare(
        "SELECT value AS latest_date FROM app_settings WHERE key = 'latest_ranking_date'"
      ).first();
      const latestDate = latestDateRow?.latest_date || null;

      // 대상 작품 조회 (기존 로직 그대로, LIMIT만 effectiveLimit으로 교체)
      //   - title_videos 개수는 상관관계 서브쿼리로 계산 (works 규모가
      //     수천 건 수준이고 반복 호출돼도 성능 여유 있음)
      //   - latestDate가 없으면(신규 DB 등) 우선순위 없이 최신 등록순만 적용
      const { results: candidates } = await env.DB.prepare(`
        SELECT w.tmdb_id
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
        )
        AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        ORDER BY
          (
            EXISTS (
              SELECT 1 FROM rankings r
              WHERE r.tmdb_id = w.tmdb_id AND r.date = ?
            )
          ) DESC,
          w.created_at DESC
        LIMIT ?
      `).bind(latestDate, effectiveLimit).all();

      if (!candidates.length) {
        return new Response(JSON.stringify({
          ok: true, attempted: 0, filled: 0, remaining: 0,
          message: "대상 작품 없음 (모두 쿨다운 중이거나 영상이 이미 충분함)"
        }), { headers });
      }

      // 순차 처리 (레이트리밋 위험 회피 목적, 병렬 처리 안 함)
      const results = [];
      let totalSaved = 0;
      for (const c of candidates) {
        try {
          const saved = await _batchCrawlYoutubeVideos(c.tmdb_id, env);
          totalSaved += saved;
          results.push({ tmdb_id: c.tmdb_id, saved, ok: true });
        } catch (e) {
          // 개별 작품 실패는 로그만 남기고 다음 작품으로 계속 진행
          console.error(`[BATCH_CRAWL] tmdb_id=${c.tmdb_id} 오류:`, e.message);
          results.push({ tmdb_id: c.tmdb_id, saved: 0, ok: false, error: e.message });
        }
      }

      // 처리 후 실제 남은 대상 개수 재조회
      //   방금 처리한 건들은 _batchCrawlYoutubeVideos가 성공/실패 관계없이
      //   yt_crawl_attempted_at을 갱신했기 때문에 이미 쿨다운에 들어가
      //   아래 COUNT에서 자동으로 제외됨 (추가 UPDATE 불필요)
      const afterRow = await env.DB.prepare(`
        SELECT COUNT(*) AS cnt
        FROM works w
        WHERE (
          SELECT COUNT(*) FROM title_videos tv WHERE tv.tmdb_id = w.tmdb_id
        ) <= 1
        AND (
          w.yt_crawl_attempted_at IS NULL
          OR w.yt_crawl_attempted_at < datetime('now', '-3 days')
        )
        AND (w.adult_flag IS NULL OR w.adult_flag != 1)
      `).first();
      const remaining = afterRow?.cnt || 0;

      console.log(`[BATCH_CRAWL] ✅ 완료: 시도 ${candidates.length}건, 저장 ${totalSaved}개, 남음 ${remaining}`);
      return new Response(JSON.stringify({
        ok: true, attempted: candidates.length, filled: totalSaved, remaining, results
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/videos ───────────────────────────────────────
  // title 빈칸이면 YouTube oEmbed API로 제목 자동 조회
  if (path === "/admin/videos" && request.method === "POST") {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json();
      const { tmdb_id, youtube_url } = body;
      let { title } = body;
      if (!tmdb_id || !youtube_url) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id, youtube_url required" }), { status: 400, headers });
      }
      // youtube_id 추출
      const ytMatch = youtube_url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (!ytMatch) {
        return new Response(JSON.stringify({ ok: false, message: "유효하지 않은 유튜브 URL" }), { status: 400, headers });
      }
      const youtube_id = ytMatch[1];

      // ── 중복 체크: 같은 작품에 동일 youtube_id가 이미 등록되어 있는지 확인
      const existing = await env.DB.prepare(
        "SELECT id, title FROM title_videos WHERE tmdb_id = ? AND youtube_id = ? LIMIT 1"
      ).bind(tmdb_id, youtube_id).first();

      if (existing) {
        return new Response(JSON.stringify({
          ok: false,
          message: `이미 등록된 영상입니다. (제목: "${existing.title || youtube_id}")`
        }), { status: 409, headers });
      }

      // title 빈칸이면 oEmbed API로 유튜브 제목 자동 조회
      if (!title) {
        try {
          const oembedRes  = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtube_id}&format=json`);
          const oembedData = await oembedRes.json();
          title = oembedData.title || "";
        } catch (e) { title = ""; }
      }
      await env.DB.prepare(
        "INSERT INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main) VALUES (?, ?, ?, ?, 0)"
      ).bind(tmdb_id, youtube_url, youtube_id, title).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── PATCH /admin/videos/:id/main ────────────────────────────
  if (path.match(/\/admin\/videos\/(\d+)\/main/) && request.method === "PATCH") {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    const id = parseInt(path.match(/\/admin\/videos\/(\d+)\/main/)[1]);
    try {
      const { results } = await env.DB.prepare(
        "SELECT tmdb_id FROM title_videos WHERE id = ?"
      ).bind(id).all();
      if (!results.length) {
        return new Response(JSON.stringify({ ok: false, message: "없음" }), { status: 404, headers });
      }
      const tmdb_id = results[0].tmdb_id;
      await env.DB.batch([
        env.DB.prepare("UPDATE title_videos SET is_main = 0 WHERE tmdb_id = ?").bind(tmdb_id),
        env.DB.prepare("UPDATE title_videos SET is_main = 1 WHERE id = ?").bind(id),
      ]);
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/videos/:id ─────────────────────────────────
  if (path.match(/\/admin\/videos\/(\d+)$/) && request.method === "DELETE") {
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    const id = parseInt(path.match(/\/admin\/videos\/(\d+)$/)[1]);
    try {
      await env.DB.prepare("DELETE FROM title_videos WHERE id = ?").bind(id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /imdb/:imdbId ─────────────────────────────────────
  if (path.startsWith("/imdb/") && path !== "/imdb/save" && request.method === "GET") {
    const imdbId = path.split("/imdb/")[1];
    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
      return new Response(JSON.stringify({ ok: false, message: "invalid imdb_id" }), { status: 400, headers });
    }
    try {
      const cached = await env.DB.prepare(
        "SELECT imdb_rating, imdb_votes, imdb_updated FROM works WHERE imdb_id = ? LIMIT 1"
      ).bind(imdbId).first();

      if (cached?.imdb_rating) {
        const updatedAt = new Date(cached.imdb_updated || 0);
        const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          return new Response(JSON.stringify({
            ok: true, source: "cache",
            rating: cached.imdb_rating.toFixed(1),
            votes:  cached.imdb_votes || "",
          }), { headers });
        }
      }

      const omdbKey = env.OMDB_API_KEY;
      if (!omdbKey) {
        return new Response(JSON.stringify({ ok: false, message: "OMDB key not configured" }), { status: 500, headers });
      }

      const omdbRes  = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${omdbKey}`);
      const omdbData = await omdbRes.json();

      if (omdbData.Response !== "False") {
        const r = parseFloat(omdbData.imdbRating);
        if (!isNaN(r)) {
          const v   = omdbData.imdbVotes || "";
          const now = new Date().toISOString();
          await env.DB.prepare(
            "UPDATE works SET imdb_rating = ?, imdb_votes = ?, imdb_updated = ? WHERE imdb_id = ?"
          ).bind(r, v, now, imdbId).run();
          return new Response(JSON.stringify({ ok: true, source: "omdb", rating: r.toFixed(1), votes: v }), { headers });
        }
      }

      return new Response(JSON.stringify({ ok: false, message: "rating not available" }), { status: 404, headers });
    } catch (e) {
      console.error("[IMDB GET]", e);
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /imdb/save ───────────────────────────────────────
  if (path === "/imdb/save" && request.method === "POST") {
    try {
      const body = await request.json();
      const { tmdb_id, imdb_id } = body;
      if (!tmdb_id || !imdb_id) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id and imdb_id required" }), { status: 400, headers });
      }
      if (!/^tt\d+$/.test(imdb_id)) {
        return new Response(JSON.stringify({ ok: false, message: "invalid imdb_id format" }), { status: 400, headers });
      }
      await env.DB.prepare(
        "UPDATE works SET imdb_id = ? WHERE tmdb_id = ?"
      ).bind(imdb_id, parseInt(tmdb_id)).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      console.error("[IMDB SAVE]", e);
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /youtube/trending ─────────────────────────────────────
  // 유튜브 한국 급상승 TOP 50 (6시간 캐시)
  if (path === "/youtube/trending" && request.method === "GET") {
    try {
      const { results: cached } = await env.DB.prepare(
        "SELECT * FROM youtube_trending ORDER BY rank ASC"
      ).all();

      if (cached.length > 0) {
        const collectedAt = new Date(cached[0].collected_at);
        const diffHours   = (Date.now() - collectedAt.getTime()) / (1000 * 60 * 60);
        if (diffHours < 6) {
          return new Response(JSON.stringify({ ok: true, data: cached, cached: true }), { headers });
        }
      }

      // YouTube Data API v3 호출 — 한국 급상승 TOP 50
      const ytUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=snippet,statistics` +
        `&chart=mostPopular` +
        `&regionCode=KR` +
        `&maxResults=50` +
        `&key=${env.YOUTUBE_API_KEY}`;

      const ytRes  = await fetch(ytUrl);
      const ytData = await ytRes.json();

      if (!ytRes.ok || !ytData.items?.length) {
        if (cached.length > 0) {
          return new Response(JSON.stringify({ ok: true, data: cached, cached: true }), { headers });
        }
        return new Response(JSON.stringify({ ok: false, message: "YouTube API 오류" }), { status: 500, headers });
      }

      const now   = new Date().toISOString();
      const items = ytData.items.map((item, i) => ({
        rank:         i + 1,
        video_id:     item.id,
        title:        item.snippet?.title || "",
        channel:      item.snippet?.channelTitle || "",
        thumbnail:    item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
        view_count:   parseInt(item.statistics?.viewCount || 0),
        collected_at: now,
      }));

      // 기존 데이터 삭제 후 새 데이터 저장
      await env.DB.prepare("DELETE FROM youtube_trending").run();
      const inserts = items.map(v =>
        env.DB.prepare(`
          INSERT INTO youtube_trending (rank, video_id, title, channel, thumbnail, view_count, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(v.rank, v.video_id, v.title, v.channel, v.thumbnail, v.view_count, v.collected_at)
      );
      await env.DB.batch(inserts);

      return new Response(JSON.stringify({ ok: true, data: items, cached: false }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/search, /works/exists ─────────────────────────
  // [2026-07-15] search.js로 이전됨 (index.js에서 먼저 라우팅되므로 이 지점에 도달하지 않음)

  // ── POST /works/register ─────────────────────────────────────
  // 인물 페이지 등 크롤러 미수집 작품을 첫 방문 시 자동 등록
  // - 미등록 작품: 전체 INSERT
  // - 이미 등록된 작품: title_en이 비어있거나 한글일 때만 업데이트
  //   (flixpatrol 기준 영어 제목이 있으면 절대 건드리지 않음)
  // - tmdb_rating/release_date: title_en과 달리 "비어있을 때만"이 아니라 항상 최신값으로 덮어씀
  //   (tmdb_rating은 크롤러 대상이든 아니든 항상 최신화해야 하는 "보호되지 않는 필드" 원칙)
  //   0점(투표수 부족)도 유효한 값이므로 COALESCE로 처리 — 0을 NULL로 오인하는 버그 방지
  // - rating_updated_at: 이 API가 호출되는 시점(=방문 시 TMDB를 이미 조회한 시점)의 서버 시각으로
  //   항상 기록 → _title_detail.html의 "N일 지나면 자동 새로고침" 로직이 이 값을 기준으로 판단함
  // - match_source: [2026-07-08 추가] 최초 INSERT 시에만 'user'로 고정 저장
  //   (매칭 출처 5분류 중 "사용자가 사이트에 들어와서 페이지가 만들어진 경우" — 기존엔 이 컬럼
  //   자체가 빠져있어 전부 NULL로 남아 분류가 안 되던 버그. ON CONFLICT 절에는 넣지 않음 —
  //   이미 admin/crawler로 등록된 작품이 나중에 이 API를 다시 타도 매칭 출처가 덮어써지면 안 됨)
  // 인증 없음 (공개 API, 조건부 업데이트로 안전)
  if (path === "/works/register" && request.method === "POST") {
    try {
      // [2026-07-26 신규] 봇이 보낸 요청이면 등록 자체를 건너뜀. 자바스크립트까지 실행하는
      // 크롤러가 우리 사이트에 없는 TMDB ID를 계속 방문하면서 저품질 작품을 자동 등록시키는
      // 걸 막기 위함 — 실제 사람 방문자가 나중에 같은 작품을 보면 그때 정상 등록됨(서비스
      // 영향 없음). 응답은 정상 ok:true로 돌려줘서 클라이언트 쪽 에러 처리에 영향 없게 함.
      const ua = request.headers.get("user-agent") || "";
      if (_isBotUserAgent(ua)) {
        return new Response(JSON.stringify({ ok: true, skipped: "bot" }), { headers });
      }

      const body = await request.json();
      const {
        tmdb_id, title_ko, title_en, poster_path, media_type, genre, original_language,
        tmdb_rating, release_date,
      } = body;

      // 필수값 검증
      if (!tmdb_id || !title_ko) {
        return new Response(JSON.stringify({ ok: false, message: "tmdb_id, title_ko required" }), { status: 400, headers });
      }

      // JS에서 title_en 유효성 판단
      // 라틴 문자(영어)가 포함된 경우만 유효한 영어 제목으로 인정
      const hasKorean = title_en && /[\uAC00-\uD7A3]/.test(title_en); // 한글 포함 여부
      const hasLatin  = title_en && /[a-zA-Z]/.test(title_en);        // 영어 포함 여부
      // 영어가 있고 한글이 없을 때만 유효한 title_en으로 사용
      const validTitle_en = (hasLatin && !hasKorean) ? title_en : null;

      // tmdb_rating은 0도 유효한 값이므로 ?? 사용 (|| 사용 시 0이 null로 사라지는 버그 재발 방지)
      const ratingVal      = tmdb_rating ?? null;
      const releaseDateVal = release_date || null;
      const nowIso         = new Date().toISOString(); // rating_updated_at은 서버 시각 기준(클라이언트 시각 신뢰 안 함)

      // [2026-07-19 추가] 신규 작품 등록 시 softcore 키워드 자동 성인물 판별
      // - "신규 등록"일 때만 실행 (기존에 이미 있는 작품은 재방문마다 이 API를 다시 타므로,
      //   그때마다 조회하면 관리자가 수동으로 해제한 작품이 재방문 시 다시 성인물로 잡히는
      //   무한반복 문제가 생김 — 그래서 최초 1회, INSERT 시점에만 실행)
      // - admin.js의 collect-keywords 배치는 이 로직을 더 이상 하지 않음(2026-07-19 제거) —
      //   성인물 자동판별은 이제 이 지점 하나로 일원화됨
      const existing = await env.DB.prepare(
        "SELECT tmdb_id FROM works WHERE tmdb_id = ?"
      ).bind(parseInt(tmdb_id)).first();

      let keywordsVal  = null;
      let adultFlagVal = null;
      let mediaTypeForInsert = media_type || null;

      if (!existing) {
        const mtypes = media_type ? [media_type] : ["movie", "tv"];
        for (const mtype of mtypes) {
          try {
            const resp = await fetch(
              `https://api.themoviedb.org/3/${mtype}/${parseInt(tmdb_id)}/keywords?api_key=${env.TMDB_API_KEY}`
            );
            if (!resp.ok) continue;
            const data   = await resp.json();
            const kwList = data.keywords || data.results || []; // 영화: keywords, TV: results
            if (kwList.length) {
              keywordsVal = kwList.map(k => k.name).filter(Boolean).join(",");
              break;
            }
          } catch (e) { /* 네트워크 오류 — 다음 media_type으로 계속 시도, 실패해도 등록 자체는 진행 */ }
        }
        // [2026-07-19 추가 → 2026-07-21 수정] "키워드 없음 = 성인물" 조건 제거함.
        // 사유: 실측 결과 전체 works 3,360건 중 634건(약 19%)이 TMDB에 원래부터 키워드가 없는
        // 정상 작품(주로 국내 구작/마이너 작품)이었음. "정상 작품은 keywords 없는 경우가 0건"이라던
        // 기존 실측은 keywords_collect 배치로 __NONE__ 처리가 다 끝난 뒤의 IS NULL 카운트였고,
        // __NONE__(확인 후 진짜 없음)은 그 카운트에 안 잡혀서 생긴 착시였음. 그래서 이 조건 하나로
        // 신석기 블루스, 아들, 우리 선희 등 정상 국내 영화 다수가 오탐으로 성인물 처리됐음.
        const isSoftcore = keywordsVal && keywordsVal.split(",").includes("softcore");

        // [2026-07-20 추가] 포르노그라피 자동 판별 (adult_flag=2, 일반 성인물=1보다 강한 차단 대상)
        // 실측으로 검증된 3가지 신호만 사용 — 셋 중 하나라도 걸리면 포르노로 확정:
        //   ① title_ko에 일본어 문자 + 35자 이상 (JAV 특유의 긴 설명형 제목)
        //   ② title_ko에 노골적 단어(SEX는 대문자만 — "섹스 앤 더 시티" 등 한글 표기 정상작품과 구분하기 위함)
        //   ③ TMDB keywords에 노골적 하드코어 전용 단어
        // [2026-07-25 수정] 일본어+길이 기준 오탐 발견 — 일본 소극장 연극 녹화본처럼 정상적인
        // 작품인데도 제목이 길다는 이유만으로 차단되는 사례("城山羊の会「평화에 의한...」" 21자)가
        // 실제로 있었음(_title_detail.html에서 먼저 발견). 20자→28자→35자로 순차 완화하고, 대신 AV 전용
        // 단어 목록을 늘려서(길이와 무관하게 걸리는 2차 신호 강화) 놓치는 진짜 위험작이 없도록
        // 보완 — _title_detail.html의 즉시차단 로직과 반드시 동일 기준으로 맞출 것.
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(title_ko || "");
        const isLongJapaneseTitle = hasJapanese && title_ko.length >= 35;
        // SEX는 ESSEX 등 일반 단어에 포함될 위험이 커서 제외.
        // NTR은 CONTROL/COUNTRY 등에 우연히 포함될 수 있어 \b(단어 경계)로 "독립된 단어"일 때만 매칭.
        const JP_PORN_WORDS = ["中出し", "手コキ", "人妻", "巨乳", "爆乳", "素人", "痴女", "熟女"];
        const hasPornTitleWord = /\bNTR\b/.test(title_ko || "") ||
          JP_PORN_WORDS.some(w => (title_ko || "").includes(w));
        const PORN_KEYWORDS = ["creampie", "orgy", "gang rape", "netorare", "cuckold", "big tits", "handjob"];
        const hasPornKeyword = !!(keywordsVal && PORN_KEYWORDS.some(w => keywordsVal.includes(w)));

        if (isLongJapaneseTitle || hasPornTitleWord || hasPornKeyword) {
          adultFlagVal = 2; // 포르노그라피 — 검색/키워드수집 제외 + 화면 이미지 비노출 대상
          mediaTypeForInsert = "movie";
        } else if (isSoftcore) {
          adultFlagVal = 1;
          mediaTypeForInsert = "movie"; // 성인물은 movie로 통일 (기존 원칙과 동일)
        }
      }

      await env.DB.prepare(`
        INSERT INTO works (
          tmdb_id, title_ko, title_en, poster_path, media_type, genre, original_language,
          tmdb_rating, release_date, rating_updated_at, match_source, keywords, adult_flag
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          -- media_type: title_en과 달리 "보호 대상 아님" — 확신 있는 값(NULL 아님)이 오면 항상 최신화.
          -- movie/tv tmdb_id가 우연히 겹쳐 한 번 잘못 저장돼도, 이후 신뢰 가능한 값이 들어오면
          -- 자동으로 스스로 고쳐지는 자가치유(self-healing) 구조 (2026-07-07)
          media_type = CASE
            WHEN excluded.media_type IS NOT NULL AND excluded.media_type != ''
              THEN excluded.media_type
            ELSE works.media_type
          END,
          -- title_en 업데이트 조건:
          --   1) 현재 title_en이 비어있을 때
          --   2) 현재 title_en이 한글일 때 (잘못 입력된 경우)
          -- 현재 title_en이 이미 영어면 절대 건드리지 않음 (flixpatrol 기준 보호)
          title_en = CASE
            WHEN excluded.title_en IS NULL OR excluded.title_en = ''
              THEN works.title_en
            WHEN works.title_en IS NULL OR works.title_en = ''
              THEN excluded.title_en
            WHEN works.title_en = works.title_ko
              THEN excluded.title_en
            ELSE works.title_en
          END,
          -- genre: 비어있을 때만 업데이트 (기존 데이터 보호)
          genre = CASE
            WHEN works.genre IS NULL OR works.genre = ''
              THEN excluded.genre
            ELSE works.genre
          END,
          -- original_language: 비어있을 때만 업데이트 (genre와 동일 원칙)
          original_language = CASE
            WHEN works.original_language IS NULL OR works.original_language = ''
              THEN excluded.original_language
            ELSE works.original_language
          END,
          -- tmdb_rating / release_date: title_en과 달리 "보호 대상 아님" — 값이 오면 항상 최신화
          -- COALESCE(excluded.값, works.기존값): 프론트가 값을 못 보냈을 때만 기존 값 보존,
          -- 0은 NULL이 아니므로 COALESCE가 정상값으로 그대로 반영함
          tmdb_rating = COALESCE(excluded.tmdb_rating, works.tmdb_rating),
          release_date = COALESCE(excluded.release_date, works.release_date),
          -- rating_updated_at: 이 등록 요청이 들어온 시점 = 방문자가 TMDB를 조회해온 시점이므로
          -- 매 호출마다 무조건 최신 시각으로 갱신 (신작 1일 / 구작 5일 주기 판단의 기준값)
          rating_updated_at = excluded.rating_updated_at
      `).bind(
        parseInt(tmdb_id),
        title_ko       || null,
        validTitle_en  || null,
        poster_path    || null,
        mediaTypeForInsert,
        genre          || null,
        original_language || null,
        ratingVal,
        releaseDateVal,
        nowIso,
        keywordsVal,
        adultFlagVal
      ).run();

      // [2026-07-26 신규] 신규 등록된 작품만 출연진/감독을 조용히 저장 (기존 작품은 어드민 배치가 담당)
      // 키워드/성인물 판별과 동일하게 "최초 1회, INSERT 시점에만" — 재방문마다 반복 호출되지 않게
      if (!existing) {
        ctx.waitUntil(_saveCastForWork(parseInt(tmdb_id), mediaTypeForInsert, env, original_language));
      }

      // [2026-07-30 신규] 신규 등록된 일본어 TV 작품에 "japan drama"/"japan animation" 키워드
      // 자동 연결 — 위 출연진 저장과 동일하게 "최초 1회, INSERT 시점에만" 실행. keyword_translation
      // 사전에는 이미 두 키워드 다 등록돼 있어서(어드민이 직접 만든 것, source='admin') 여기선
      // work_keywords 연결만 하면 됨. 일본 영화나 비일본 작품은 대상 아님(요청 범위 그대로).
      if (!existing && original_language === 'ja' && mediaTypeForInsert === 'tv') {
        const isJapanAnimation = (genre || '').includes('애니메이션');
        const autoKeyword = isJapanAnimation ? 'japan animation' : 'japan drama';
        ctx.waitUntil(
          env.DB.prepare(
            "INSERT OR IGNORE INTO work_keywords (tmdb_id, keyword) VALUES (?, ?)"
          ).bind(parseInt(tmdb_id), autoKeyword).run()
        );
      }

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/:tmdb_id/cast ───────────────────────────────
  // 공개 API — 우리 DB(work_cast)에 저장된 출연진/감독을 그대로 돌려줌(2026-07-26 신설).
  // 목적: 작품페이지가 매번 TMDB를 다시 부르지 않고 여기부터 먼저 확인해서, 있으면 TMDB
  // 호출 자체를 건너뛰게 하기 위함. 저장된 게 없으면 data:null을 돌려주고, 그걸 신호로
  // 프론트가 지금처럼 TMDB로 폴백함(§POST cast-sync 참고).
  // ⚠️ 반드시 아래 범용 "GET /works/:tmdb_id"보다 앞에 있어야 함 — 안 그러면 그쪽이 먼저
  // "12345/cast" 전체를 tmdb_id로 잘못 파싱해서 가로챔(정규식 매칭이라 그 위험 자체가 없음).
  if (/^\/works\/\d+\/cast$/.test(path) && request.method === "GET") {
    const tmdbId    = parseInt(path.match(/^\/works\/(\d+)\/cast$/)[1]);
    const mediaType = url.searchParams.get("media_type") || "";
    try {
      const { results } = await env.DB.prepare(`
        SELECT person_tmdb_id, name, role, character_name, profile_path
        FROM work_cast
        WHERE tmdb_id = ? AND media_type = ?
        ORDER BY billing_order ASC
      `).bind(tmdbId, mediaType).all();

      if (!results.length) {
        return new Response(JSON.stringify({ ok: true, data: null }), { headers });
      }

      const directors = results.filter(p => p.role === "director").map(p => ({
        id: p.person_tmdb_id, name: p.name, profile_path: p.profile_path,
      }));
      const cast = results.filter(p => p.role === "cast").map(p => ({
        id: p.person_tmdb_id, name: p.name, profile_path: p.profile_path, character: p.character_name,
      }));

      return new Response(JSON.stringify({ ok: true, data: { directors, cast } }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /works/:tmdb_id/cast-sync ──────────────────────────
  // 공개 API — 위 GET에서 data:null(우리 DB에 없음)을 받은 프론트가 TMDB 폴백 조회를 한 직후
  // 호출. 서버가 TMDB에서 다시 받아와 저장(_saveCastForWork 재사용)하는 동안 응답을 기다리지
  // 않고 바로 돌려줌(ctx.waitUntil) — 방문자 화면엔 전혀 영향 없이, "다음 방문자부터는 이
  // 작품도 우리 DB로 바로 나가게" 조용히 채워두는 용도(2026-07-26 신설).
  // [2026-07-26 수정] 외국작품 상위 10명 제한을 위해 original_language가 필요한데, 클라이언트
  // 입력을 그대로 믿지 않고 D1 works에서 직접 조회해서 사용(신뢰 가능한 값만 사용).
  if (/^\/works\/\d+\/cast-sync$/.test(path) && request.method === "POST") {
    const tmdbId = parseInt(path.match(/^\/works\/(\d+)\/cast-sync$/)[1]);
    const body   = await request.json().catch(() => ({}));
    ctx.waitUntil((async () => {
      const w = await env.DB.prepare(
        "SELECT original_language FROM works WHERE tmdb_id = ?"
      ).bind(tmdbId).first();
      await _saveCastForWork(tmdbId, body.media_type || null, env, w?.original_language || null);
    })());
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  // 공개 API — 작품 상세페이지 "비슷한 취향의 작품" 섹션에서 최우선 후보로 사용
  // TMDB엔 없는 국내 예능 세부장르(works.variety_genre, 관리자 큐레이션)가 겹치는 작품을 찾아
  // 매칭 % 까지 서버에서 계산해서 내려줌 — 프론트는 받은 숫자를 뱃지에 그대로 사용
  //
  // % 계산 (고정 티어 + 오늘 랭킹 가산점, 랜덤 아님 — 방문할 때마다 % 흔들리는 걸 방지):
  //   기본 티어: 태그 2개 중 2개 일치 → 92%   |   태그 2개 중 1개 일치 → 82%
  //             태그 1개 중 1개 일치 → 87%   |   일치 0개 → 후보에서 제외
  //   + 오늘(date < 'manual') 랭킹에 걸린 플랫폼 개수만큼 1%p씩 가산
  //     예) "나는 솔로"가 오늘 넷플릭스·웨이브·티빙 3곳에 랭킹 → 92%+3 = 98%
  //   상한선 99% (100%는 "완전히 동일한 작품"이라는 오해를 줄 수 있어 안 씀)
  //   랭킹 가산점 계산이 실패해도 기본 % 매칭 자체는 죽지 않도록 별도 try/catch로 분리
  // 동점(같은 %)은 tmdb_rating 높은 순으로 2차 정렬
  if (path.startsWith("/works/variety-similar/") && request.method === "GET") {
    const tmdb_id = parseInt(path.split("/works/variety-similar/")[1]);
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 20);

    try {
      const current = await env.DB.prepare(
        "SELECT variety_genre FROM works WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();

      const myTags = (current?.variety_genre || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!myTags.length) {
        // 예능 태그가 없는(일반 드라마/영화) 작품은 후보 조회 자체를 스킵 — 불필요한 풀스캔 방지
        return new Response(JSON.stringify({ ok: true, data: [] }), { headers });
      }

      const { results: candidates } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, tmdb_rating, release_year, variety_genre, media_type
        FROM works
        WHERE variety_genre IS NOT NULL AND variety_genre != '' AND tmdb_id != ?
      `).bind(tmdb_id).all();

      // 오늘 랭킹에 걸린 플랫폼 개수 맵 — 후보마다 개별 조회하지 않고 쿼리 2번으로 전체를 한 번에 가져옴
      // (date='manual' 수동고정 제외 — 크롤러가 실제로 잡아낸 "진짜 지금 핫함"만 가산점 대상)
      // 실패해도 기본 % 매칭은 계속 동작해야 하므로 별도 try/catch
      const rankBonusMap = new Map();
      try {
        const latestRow = await env.DB.prepare(
          "SELECT value as d FROM app_settings WHERE key = 'latest_ranking_date'"
        ).first();
        if (latestRow?.d) {
          const { results: rankRows } = await env.DB.prepare(`
            SELECT tmdb_id, COUNT(DISTINCT platform) as cnt
            FROM rankings
            WHERE date = ?
            GROUP BY tmdb_id
          `).bind(latestRow.d).all();
          for (const r of rankRows) rankBonusMap.set(r.tmdb_id, r.cnt);
        }
      } catch (e) { /* 가산점 계산 실패 — rankBonusMap 빈 상태로 계속 진행 (기본 %만 적용됨) */ }

      const scored = [];
      for (const c of candidates) {
        const candTags = (c.variety_genre || "").split(",").map(s => s.trim()).filter(Boolean);
        const matched  = myTags.filter(t => candTags.includes(t)).length;
        if (!matched) continue; // 겹치는 태그 없으면 후보 아님

        let basePct = null;
        if (myTags.length === 2) {
          basePct = matched === 2 ? 92 : 82;
        } else if (myTags.length === 1) {
          basePct = matched === 1 ? 87 : null;
        }
        if (!basePct) continue;

        const bonus = rankBonusMap.get(c.tmdb_id) || 0;
        const pct = Math.min(basePct + bonus, 99); // 99% 상한선

        scored.push({
          tmdb_id: c.tmdb_id, title_ko: c.title_ko, title_en: c.title_en,
          poster_path: c.poster_path, tmdb_rating: c.tmdb_rating,
          release_year: c.release_year, match_pct: pct,
          media_type: c.media_type || null, // 프론트에서 클릭 시 movie/tv 오판 방지용 — 없으면 null 그대로 전달
        });
      }

      // 동점(같은 %)이면 최신 연도 우선, 그래도 동점이면 tmdb_rating 순
      // (예능은 장수 프로/시즌제가 많아 같은 % 후보가 몰리기 쉬움 — 최신순으로 "요즘 핫한 것"이 앞에 오게)
      scored.sort((a, b) =>
        b.match_pct - a.match_pct ||
        (b.release_year || 0) - (a.release_year || 0) ||
        (b.tmdb_rating || 0) - (a.tmdb_rating || 0)
      );

      return new Response(JSON.stringify({ ok: true, data: scored.slice(0, limit) }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/:tmdb_id ───────────────────────────────────
  if (path.startsWith("/works/") && request.method === "GET") {
    const tmdb_id = path.split("/works/")[1];
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    const { results } = await env.DB.prepare(
      "SELECT * FROM works WHERE tmdb_id = ?"
    ).bind(parseInt(tmdb_id)).all();
    if (!results.length) {
      return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
    }

    const work = { ...results[0] };

    // mbti_tags 없으면 장르 기반 자동 계산 후 백그라운드 캐싱
    if (!work.mbti_tags && work.genre) {
      const computed = _computeMbtiTags(work.genre);
      if (computed) {
        ctx.waitUntil(
          env.DB.prepare("UPDATE works SET mbti_tags = ? WHERE tmdb_id = ?")
            .bind(computed, parseInt(tmdb_id)).run()
        );
        work.mbti_tags = computed;
      }
    }

    // ── 관련 키워드 작품 미리보기 캐싱 (30일 TTL) ──────────────
    // 작품페이지 "관련 키워드 작품 검색" 섹션에서 첫 번째로 보여줄 기본 결과를
    // 매 방문마다 재계산하지 않고 works.keyword_preview에 캐싱해서 재사용한다.
    // mbti_tags와 동일한 "지연 계산 + 캐싱" 패턴:
    //   - 캐시 없거나 30일 지났으면 → 즉시 재계산해서 응답에 바로 반영
    //   - DB 저장은 ctx.waitUntil()로 응답을 막지 않고 백그라운드 처리
    // "조건(2개 이상) 맞는 키워드가 하나도 없음"도 { keyword:null, items:[] }로 캐싱해서
    // 매 방문마다 헛수고로 재계산하지 않도록 함.
    const KEYWORD_TTL_RANKED_MS  = 5   * 24 * 60 * 60 * 1000; // 랭킹 진입작: 5일
    const KEYWORD_TTL_DEFAULT_MS = 100 * 24 * 60 * 60 * 1000; // 그 외: 100일

    let isRanked = false;
    try {
      const { results: rankCheck } = await env.DB.prepare(`
        SELECT 1 FROM rankings
        WHERE tmdb_id = ? AND date = (SELECT value FROM app_settings WHERE key = 'latest_ranking_date')
        LIMIT 1
      `).bind(parseInt(tmdb_id)).all();
      isRanked = !!(rankCheck && rankCheck.length);
    } catch (e) {
      isRanked = false; // 조회 실패 시 보수적으로 100일(더 긴 캐시) 쪽으로 처리
    }
    const ACTIVE_TTL_MS = isRanked ? KEYWORD_TTL_RANKED_MS : KEYWORD_TTL_DEFAULT_MS;

    // [2026-07-30 신규] 우리 키워드 DB(work_keywords, 어드민이 직접 추가/삭제 관리)에 이 작품
    // 키워드가 있으면 그걸 우선 사용 — TMDB 원본 캐시(work.keywords)보다 정확하고, 어드민이
    // 고친 내용이 바로 반영됨. 없으면(아직 손 안 댄 대부분의 작품) 기존 TMDB 원본 그대로 폴백.
    // 바로 아래 "관련 작품 미리보기"/"한글 번역 매핑" 두 블록이 공통으로 work.keywords를
    // 읽으므로, 여기서 한 번만 바꿔치기해두면 두 블록 모두 자동으로 우리 DB 기준으로 동작함.
    try {
      const { results: curatedKw } = await env.DB.prepare(
        "SELECT keyword FROM work_keywords WHERE tmdb_id = ?"
      ).bind(parseInt(tmdb_id)).all();
      if (curatedKw && curatedKw.length) {
        work.keywords = curatedKw.map(r => r.keyword).join(",");
      }
    } catch (e) {
      // 조회 실패 시 work.keywords(TMDB 원본) 그대로 사용 — 안전한 폴백
    }

    const kwStale = !work.keyword_preview_updated_at ||
      (Date.now() - new Date(work.keyword_preview_updated_at).getTime()) > ACTIVE_TTL_MS;

    if (kwStale) {
      let preview = { keyword: null, items: [] };

      // '__NONE__'은 "TMDB에 키워드 자체가 없어서 시도했지만 결과 없음" 센티널
      // → collect-keywords 배치작업에서 겪었던 것과 동일한 실수(__NONE__을 글자 그대로 검색)를
      //   반복하지 않도록 여기서도 명시적으로 걸러냄
      if (work.keywords && work.keywords !== '__NONE__') {
        const kwList = work.keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 10);
        if (kwList.length) {
          try {
            // 키워드 최대 10개를 env.DB.batch()로 한 번에 조회 (Workers 호출 1건, D1 트랜잭션 1번)
            // 2026-07-09: 풀스캔 LIKE(LOWER(keywords) LIKE '%,kw,%') → work_keywords 정규화 테이블
            // 색인(idx_work_keywords_keyword) 조회로 교체. 자기 자신 제외는 그대로 SQL에서 처리.
            // 2026-07-10: /search/keyword(클릭 시 검색)와 동일한 원칙으로 한국 작품 우선 정렬 추가
            //   (원어 정보 없는 구작은 CASE 분기상 외국작품과 함께 뒤로 밀림 — 의도된 동작)
            // 2026-07-14: adult_flag=1(성인물) 작품은 일반 작품의 "관련 키워드 작품"에 안 뜨도록 제외.
            //   지금 보는 작품이 성인물이어도 상관없이 무조건 제외(성인물끼리 매칭은 굳이 안 함).
            const statements = kwList.map(kw =>
              env.DB.prepare(`
                SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.original_language, w.tmdb_rating
                FROM work_keywords wk
                JOIN works w ON w.tmdb_id = wk.tmdb_id
                WHERE wk.keyword = ?
                  AND wk.tmdb_id != ?
                  AND (w.adult_flag IS NULL OR w.adult_flag != 1)
                ORDER BY
                  CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
                  w.tmdb_rating DESC
                LIMIT 20
              `).bind(kw.toLowerCase(), parseInt(tmdb_id))
            );
            const batchResults = await env.DB.batch(statements);
            for (let i = 0; i < kwList.length; i++) {
              const rows = batchResults[i]?.results || [];
              if (rows.length >= 3) {           // 관련 작품이 3개 이상인 첫 키워드를 채택
                preview = { keyword: kwList[i], items: rows };
                break;
              }
            }
          } catch (e) {
            // 조회 실패해도 no-result로 캐싱해서 무한 재시도(매 방문마다 재계산) 방지
          }
        }
      }

      const kwNowIso = new Date().toISOString();
      work.keyword_preview = JSON.stringify(preview);
      work.keyword_preview_updated_at = kwNowIso;

      ctx.waitUntil(
        env.DB.prepare(
          "UPDATE works SET keyword_preview = ?, keyword_preview_updated_at = ? WHERE tmdb_id = ?"
        ).bind(work.keyword_preview, kwNowIso, parseInt(tmdb_id)).run()
      );
    }

    // ── 관리자 수동 연결(pinned_similar) 조인 ──────────────────
    // "비슷한 취향의 작품" 최우선(Priority -1) 후보 — 예능 태그·TMDB 추천과 무관하게
    // 관리자가 "이 둘은 항상 연결"이라고 지정한 작품 (예: 나는 SOLO ↔ 나는 SOLO 그 이후)
    // 실패해도 works 단건 조회 자체는 죽지 않도록 별도 try/catch로 분리
    try {
      const { results: pinned } = await env.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.release_year, w.media_type, p.pinned_pct
        FROM work_pinned_similar p
        JOIN works w ON w.tmdb_id = p.related_tmdb_id
        WHERE p.tmdb_id = ?
        ORDER BY p.pinned_pct DESC
      `).bind(parseInt(tmdb_id)).all();
      work.pinned_similar = pinned || [];
    } catch (e) {
      // work_pinned_similar 테이블이 아직 없거나(마이그레이션 전) 조회 실패 시 빈 배열로 안전하게 진행
      work.pinned_similar = [];
    }

    // ── 키워드 한글 번역 매핑 (관리자 확정본만, 랭킹 여부 따라 5일/100일 캐싱) ──
    // _title_detail.html이 키워드 태그를 영문 대신 한글로 표시하기 위해 사용.
    // 위에서 계산한 ACTIVE_TTL_MS(랭킹 여부 기반)를 그대로 재사용 — 쿼리 추가 없음.
    const kwKoStale = !work.keyword_ko_map_updated_at ||
      (Date.now() - new Date(work.keyword_ko_map_updated_at).getTime()) > ACTIVE_TTL_MS;

    if (kwKoStale) {
      let kwKoMap = {};
      let kwKoFailed = false;
      if (work.keywords && work.keywords !== '__NONE__') {
        const allKwList = work.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (allKwList.length) {
          try {
            const placeholders = allKwList.map(() => '?').join(',');
            const { results: kwTrans } = await env.DB.prepare(
              `SELECT keyword_en, keyword_ko FROM keyword_translation WHERE keyword_en IN (${placeholders}) AND source = 'admin'`
            ).bind(...allKwList).all();
            for (const row of (kwTrans || [])) {
              kwKoMap[row.keyword_en] = row.keyword_ko;
            }
          } catch (e) {
            kwKoFailed = true; // 실패 시 캐시에 남기지 않고 다음 요청에서 재시도
          }
        }
      }

      work.keyword_ko_map = kwKoMap;

      if (!kwKoFailed) {
        const kwKoNowIso = new Date().toISOString();
        ctx.waitUntil(
          env.DB.prepare(
            "UPDATE works SET keyword_ko_map = ?, keyword_ko_map_updated_at = ? WHERE tmdb_id = ?"
          ).bind(JSON.stringify(kwKoMap), kwKoNowIso, parseInt(tmdb_id)).run()
        );
      }
    } else {
      try {
        work.keyword_ko_map = work.keyword_ko_map ? JSON.parse(work.keyword_ko_map) : {};
      } catch (e) {
        work.keyword_ko_map = {};
      }
    }

    return new Response(JSON.stringify({ ok: true, data: work }), { headers });
  }

  // ── GET /search/keyword ───────────────────────────────────
  // 공개 API — 작품 상세페이지의 키워드 태그 클릭 시 호출
  // work_keywords(정규화 테이블)에서 정확히 일치하는 키워드를 가진 작품 조회
  // 한국 작품(original_language='ko') 우선 정렬 — "비슷한 취향의 작품" 섹션과 동일 원칙
  // 2026-07-09: works.keywords 풀스캔 LIKE → work_keywords 색인(idx_work_keywords_keyword) 조회로 교체.
  //   부수 효과: 콤마 join 방식의 "키워드 이름 자체에 콤마 포함 시 오매칭" 한계도 함께 해소됨
  //   (정규화 시점에 이미 개별 키워드 단위로 분리 저장하기 때문).
  //   단, work_keywords는 배치로 채워지는 테이블이라, 정규화 전 작품의 키워드는 아직 검색에 안 잡힐 수 있음
  //   (어드민 "🔤 키워드 정규화" 배치가 다 돌고 나면 자연히 해소됨).
  // 2026-07-14: adult_flag=1(성인물) 작품은 결과에서 제외 — keyword_preview와 동일 원칙.
  if (path === "/search/keyword" && request.method === "GET") {
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
    const limit   = Math.min(parseInt(url.searchParams.get("limit") || "20"), 40);
    if (!keyword) {
      return new Response(JSON.stringify({ ok: false, message: "keyword required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT w.tmdb_id, w.title_ko, w.title_en, w.poster_path, w.genre, w.tmdb_rating, w.media_type, w.original_language
        FROM work_keywords wk
        JOIN works w ON w.tmdb_id = wk.tmdb_id
        WHERE wk.keyword = ?
          AND (w.adult_flag IS NULL OR w.adult_flag != 1)
        ORDER BY
          CASE WHEN w.original_language = 'ko' THEN 0 ELSE 1 END,
          w.tmdb_rating DESC
        LIMIT ?
      `).bind(keyword, limit).all();
      return new Response(JSON.stringify({ ok: true, keyword, data: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }


  return null;
}

/* ══════════════════════════════════════════════════════════════
   장르 → MBTI 태그 자동 매핑 함수
   works.genre 컬럼(콤마 구분 문자열)을 받아서
   MBTI 목록을 콤마 구분 문자열로 반환
   예) "드라마,스릴러" → "INFJ,INTJ,INTP,ENFP,ENTJ,ISTJ,ISFP"
══════════════════════════════════════════════════════════════ */
export function _computeMbtiTags(genre) {
  if (!genre) return null;

  // 비서사 장르 목록 — 단독으로만 있으면 MBTI 섹션 숨김
  const NON_NARRATIVE = new Set([
    'Reality','Talk','News','Soap','Documentary','Kids',
    '다큐멘터리','리얼리티',
  ]);

  // 장르 파싱 (콤마 구분, 순서 유지)
  const genres = genre.split(',').map(g => g.trim()).filter(Boolean);
  if (!genres.length) return null;

  // 비서사 장르만 있으면 null 반환 (섹션 숨김)
  const narrativeGenres = genres.filter(g => !NON_NARRATIVE.has(g));
  if (!narrativeGenres.length) return null;

  // 장르 순서 가중치 (앞에 있을수록 높음)
  // 1번째=5점, 2번째=3점, 3번째=2점, 4번째~=1점
  const genreWeight = (idx) => idx === 0 ? 5 : idx === 1 ? 3 : idx === 2 ? 2 : 1;

  // MBTI별 선호 장르 매핑
  // primary: 1순위 장르 목록 (가중치 3점)
  // secondary: 2순위 장르 목록 (가중치 1점)
  const MBTI_PREF = {
    'INTJ': {
      primary  : ['Science Fiction','Sci-Fi & Fantasy','SF'],
      secondary: ['Drama','드라마','Thriller','스릴러'],
    },
    'INTP': {
      primary  : ['Science Fiction','Sci-Fi & Fantasy','SF'],
      secondary: ['Thriller','Mystery','스릴러','미스터리'],
    },
    'ENTJ': {
      primary  : ['Drama','드라마'],
      secondary: ['Science Fiction','Sci-Fi & Fantasy','SF'],
    },
    'ENTP': {
      primary  : ['Science Fiction','Sci-Fi & Fantasy','SF'],
      secondary: ['Action','Action & Adventure','액션','Adventure','모험'],
    },
    'INFJ': {
      primary  : ['Thriller','Mystery','스릴러','미스터리'],
      secondary: ['Drama','드라마','Crime','범죄'],
    },
    'INFP': {
      primary  : ['Fantasy','Sci-Fi & Fantasy','판타지'],
      secondary: ['Drama','드라마','Animation','애니메이션'],
    },
    'ENFJ': {
      primary  : ['Fantasy','Sci-Fi & Fantasy','판타지'],
      secondary: ['Drama','드라마','Family','가족'],
    },
    'ENFP': {
      primary  : ['Drama','드라마'],
      secondary: ['Comedy','코미디','Fantasy','판타지'],
    },
    'ISTJ': {
      primary  : ['Drama','드라마'],
      secondary: ['Action','Action & Adventure','액션','History','역사','War','War & Politics','전쟁'],
    },
    'ISFJ': {
      primary  : ['Comedy','코미디'],
      secondary: ['Romance','로맨스','Family','가족','Drama','드라마'],
    },
    'ESTJ': {
      primary  : ['Action','Action & Adventure','액션'],
      secondary: ['Drama','드라마','History','역사','War','War & Politics','전쟁'],
    },
    'ESFJ': {
      primary  : ['Action','Action & Adventure','액션'],
      secondary: ['Comedy','코미디','Family','가족','Romance','로맨스'],
    },
    'ISTP': {
      primary  : ['Horror','Thriller','공포','스릴러'],
      secondary: ['Action','Action & Adventure','액션','Crime','범죄'],
    },
    'ISFP': {
      primary  : ['Drama','드라마'],
      secondary: ['Animation','애니메이션','Romance','로맨스','Music','음악'],
    },
    'ESTP': {
      primary  : ['Action','Action & Adventure','액션'],
      secondary: ['Thriller','Mystery','Crime','스릴러','미스터리','범죄'],
    },
    'ESFP': {
      primary  : ['Comedy','코미디'],
      secondary: ['Action','Action & Adventure','액션','Romance','로맨스'],
    },
  };

  // 각 MBTI 점수 계산
  // 점수 = Σ (장르순서가중치 × MBTI매핑가중치)
  const scoreMap = {};

  for (const [mbti, pref] of Object.entries(MBTI_PREF)) {
    let total = 0;
    genres.forEach((g, idx) => {
      const gw = genreWeight(idx); // 장르 순서 가중치
      if (pref.primary.includes(g)) {
        total += gw * 3; // 1순위 매핑 가중치
      } else if (pref.secondary.includes(g)) {
        total += gw * 1; // 2순위 매핑 가중치
      }
    });
    if (total > 0) scoreMap[mbti] = total;
  }

  if (!Object.keys(scoreMap).length) return null;

  // 점수 내림차순 정렬 → 동점 시 tmdb_id 기반 seed로 셔플 (작품마다 다른 순서)
  // seed 방식: 새로고침해도 같은 작품은 항상 같은 순서 유지
  const tmdbId = parseInt(genre.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
  const seededRandom = (idx) => {
    const x = Math.sin(tmdbId + idx * 127) * 43758.5453;
    return x - Math.floor(x);
  };

  const entries = Object.entries(scoreMap);
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // 점수 다르면 점수순
    // 동점이면 seed 기반 랜덤 (작품마다 다른 순서, 새로고침해도 일관)
    const idxA = entries.indexOf(a);
    const idxB = entries.indexOf(b);
    return seededRandom(idxA) - seededRandom(idxB);
  });

  return entries
    .slice(0, 5)
    .map(([mbti]) => mbti)
    .join(',');
}
