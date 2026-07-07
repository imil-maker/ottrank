/* ══════════════════════════════════════════════════════════════
   영상 관련 API 라우트
   GET    /videos/:tmdb_id          작품별 영상 목록
   POST   /admin/videos/crawl       관리자 YouTube 크롤링
   POST   /admin/videos             관리자 영상 수동 추가
   PATCH  /admin/videos/:id/main    메인 영상 지정
   DELETE /admin/videos/:id         영상 삭제
   GET    /imdb/:imdbId             IMDb 평점 조회
   POST   /imdb/save                IMDb ID 저장
   GET    /youtube/trending         YouTube 한국 급상승 TOP50
   GET    /works/search             작품 검색 (공개)
   GET    /works/variety-similar/:tmdb_id  예능 태그 기반 비슷한 작품 (공개, % 계산 포함)
   GET    /works/:tmdb_id           작품 단건 조회
   GET    /search/keyword           키워드로 작품 검색 (공개, 한국작품 우선)
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";
import { _crawlYoutubeVideos, _saveTmdbVideos } from "../utils/youtube.js";

export async function handleVideos(path, request, env, ctx, url, headers) {

  // ── GET /videos/:tmdb_id ─────────────────────────────────────
  // DB 0개: TMDB 저장 + YouTube 크롤링 동시 실행
  // DB 1개: YouTube 보충 크롤링 (메인 영상 유무는 더 이상 따지지 않음)
  // DB 2개 이상: 크롤링 완전 스킵, DB 영상만 표시
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
        // 영상 없음 → TMDB 저장 + YouTube 크롤링 동시 실행
        ctx.waitUntil(_saveTmdbVideos(tmdb_id, env));
        ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
      } else if (results.length === 1) {
        // 영상 1개 → YouTube 보충 크롤링
        ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
      }
      // 영상 2개 이상 → 크롤링 완전 스킵 (매 접속마다 크롤링 방지)

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
  // 공개 API — 인증 없이 works 검색 가능 (헤더 검색창 등에서 사용)
  if (path === "/works/search" && request.method === "GET") {
    const q     = url.searchParams.get("q") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 20);
    if (!q.trim()) {
      return new Response(JSON.stringify({ ok: false, message: "q required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, media_type
        FROM works
        WHERE title_ko LIKE ? OR title_en LIKE ?
        ORDER BY
          CASE WHEN title_ko LIKE ? THEN 0 ELSE 1 END,
          title_ko ASC
        LIMIT ?
      `).bind(`%${q}%`, `%${q}%`, `${q}%`, limit).all();
      return new Response(JSON.stringify({ ok: true, data: results }), { headers });
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
          tmdb_rating, release_date, rating_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id) DO UPDATE SET
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
        media_type     || 'tv',
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
  //   + 오늘(date != 'manual') 랭킹에 걸린 플랫폼 개수만큼 1%p씩 가산
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
          "SELECT MAX(date) as d FROM rankings WHERE date != 'manual'"
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
    const KEYWORD_PREVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
    const kwStale = !work.keyword_preview_updated_at ||
      (Date.now() - new Date(work.keyword_preview_updated_at).getTime()) > KEYWORD_PREVIEW_TTL_MS;

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
            // — /search/keyword와 동일한 LIKE 매칭 규칙(LOWER 통일) + 자기 자신 제외를 SQL에서 직접 처리
            const statements = kwList.map(kw =>
              env.DB.prepare(`
                SELECT tmdb_id, title_ko, title_en, poster_path
                FROM works
                WHERE (',' || LOWER(keywords) || ',') LIKE ('%,' || ? || ',%')
                  AND tmdb_id != ?
                LIMIT 20
              `).bind(kw.toLowerCase(), parseInt(tmdb_id))
            );
            const batchResults = await env.DB.batch(statements);
            for (let i = 0; i < kwList.length; i++) {
              const rows = batchResults[i]?.results || [];
              if (rows.length >= 2) {           // 관련 작품이 2개 이상인 첫 키워드를 채택
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

    return new Response(JSON.stringify({ ok: true, data: work }), { headers });
  }

  // ── GET /search/keyword ───────────────────────────────────
  // 공개 API — 작품 상세페이지의 키워드 태그 클릭 시 호출
  // works.keywords(콤마구분 문자열)에서 정확히 일치하는 키워드를 가진 작품 조회
  // 한국 작품(original_language='ko') 우선 정렬 — "비슷한 취향의 작품" 섹션과 동일 원칙
  // ⚠️ 알려진 한계: TMDB 키워드 이름 자체에 콤마가 포함된 경우(예: "Paris, France")는
  //    콤마 join 특성상 정확매칭이 안 될 수 있음 (극소수 사례, 추후 개선 여지로 남겨둠)
  if (path === "/search/keyword" && request.method === "GET") {
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
    const limit   = Math.min(parseInt(url.searchParams.get("limit") || "20"), 40);
    if (!keyword) {
      return new Response(JSON.stringify({ ok: false, message: "keyword required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(`
        SELECT tmdb_id, title_ko, title_en, poster_path, genre, tmdb_rating, media_type, original_language
        FROM works
        WHERE (',' || LOWER(keywords) || ',') LIKE ('%,' || ? || ',%')
        ORDER BY
          CASE WHEN original_language = 'ko' THEN 0 ELSE 1 END,
          tmdb_rating DESC
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
