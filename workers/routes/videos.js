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
   GET    /works/search             작품 검색 (공개) — 제목+키워드(한글) 통합검색, 15개 페이징(offset), 년도/평점/OTT순위 포함
   GET    /works/exists             tmdb_id 목록 중 DB 등록 여부 확인 (공개) — 검색결과 TMDB 보충결과 중복필터용
   GET    /works/variety-similar/:tmdb_id  예능 태그 기반 비슷한 작품 (공개, % 계산 포함)
   GET    /works/:tmdb_id           작품 단건 조회
   GET    /search/keyword           키워드로 작품 검색 (공개, 한국작품 우선)
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";
import { _crawlYoutubeVideos, _batchCrawlYoutubeVideos, _saveTmdbVideos } from "../utils/youtube.js";

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
        "SELECT MAX(date) AS latest_date FROM rankings WHERE date < 'manual'"
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

      // ④ 상세 정보 조회 (성인물 제외)
      const idPlaceholders = allIds.map(() => "?").join(",");
      const { results: workRows } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type, release_year, tmdb_rating, original_language
        FROM works
        WHERE tmdb_id IN (${idPlaceholders})
          AND (adult_flag IS NULL OR adult_flag != 1)
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
          AND date = (SELECT MAX(date) FROM rankings WHERE date < 'manual')
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

      await env.DB.prepare(`
        INSERT INTO works (
          tmdb_id, title_ko, title_en, poster_path, media_type, genre, original_language,
          tmdb_rating, release_date, rating_updated_at, match_source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
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
        media_type     || null,
        genre          || null,
        original_language || null,
        ratingVal,
        releaseDateVal,
        nowIso
      ).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /works/variety-similar/:tmdb_id ───────────────────
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
          "SELECT MAX(date) as d FROM rankings WHERE date < 'manual'"
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
        WHERE tmdb_id = ? AND date = (SELECT MAX(date) FROM rankings WHERE date < 'manual')
        LIMIT 1
      `).bind(parseInt(tmdb_id)).all();
      isRanked = !!(rankCheck && rankCheck.length);
    } catch (e) {
      isRanked = false; // 조회 실패 시 보수적으로 100일(더 긴 캐시) 쪽으로 처리
    }
    const ACTIVE_TTL_MS = isRanked ? KEYWORD_TTL_RANKED_MS : KEYWORD_TTL_DEFAULT_MS;

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
