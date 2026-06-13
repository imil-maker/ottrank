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
   GET    /works/:tmdb_id           작품 단건 조회
   GET    /kmrb/:tmdb_id            영상물등급위원회 시청가이드
══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";
import { _crawlYoutubeVideos, _saveTmdbVideos } from "../utils/youtube.js";

export async function handleVideos(path, request, env, ctx, url, headers) {

  // ── GET /videos/:tmdb_id ─────────────────────────────────────
  // DB 0개: TMDB 저장 + YouTube 크롤링 동시 실행
  // DB 1~2개 + is_main 없음: YouTube 보충 크롤링
  // is_main 있거나 DB 3개 이상: 크롤링 완전 스킵
  // DB 3개 이상: DB 영상만 표시
  if (path.startsWith("/videos/") && !path.includes("/admin") && request.method === "GET") {
    const tmdb_id = parseInt(path.split("/videos/")[1]);
    if (!tmdb_id) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id required" }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        "SELECT * FROM title_videos WHERE tmdb_id = ? ORDER BY is_main DESC, created_at DESC"
      ).bind(tmdb_id).all();

      const hasMain   = results.some(v => v.is_main === 1);
      const hasEnough = results.length >= 3; // 영상 3개 이상이면 충분

      if (results.length === 0) {
        // 영상 없음 → TMDB 저장 + YouTube 크롤링 동시 실행
        ctx.waitUntil(_saveTmdbVideos(tmdb_id, env));
        ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
      } else if (!hasEnough && !hasMain) {
        // 영상 1~2개 + 메인 없음 → YouTube 보충 크롤링
        ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
      }
      // is_main=1 있거나 영상 3개 이상 → 크롤링 완전 스킵 (매 접속마다 크롤링 방지)

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
  // 인증 없음 (공개 API, 조건부 업데이트로 안전)
  if (path === "/works/register" && request.method === "POST") {
    try {
      const body = await request.json();
      const { tmdb_id, title_ko, title_en, poster_path, media_type, genre } = body;

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

      await env.DB.prepare(`
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type, genre)
        VALUES (?, ?, ?, ?, ?, ?)
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
          END
      `).bind(
        parseInt(tmdb_id),
        title_ko       || null,
        validTitle_en  || null,
        poster_path    || null,
        media_type     || 'tv',
        genre          || null
      ).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
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

    return new Response(JSON.stringify({ ok: true, data: work }), { headers });
  }

  // ── GET /kmrb/:tmdb_id ───────────────────────────────────────
  // 영상물등급위원회 시청가이드 (30일 캐시)
  if (path.startsWith("/kmrb/") && request.method === "GET") {
    const tmdb_id  = parseInt(path.split("/kmrb/")[1]);
    const title_ko = url.searchParams.get("title_ko") || "";
    if (!tmdb_id || !title_ko) {
      return new Response(JSON.stringify({ ok: false, message: "tmdb_id and title_ko required" }), { status: 400, headers });
    }
    try {
      // D1 캐시 확인 (30일 이내)
      const cached = await env.DB.prepare(
        "SELECT * FROM kmrb_ratings WHERE tmdb_id = ?"
      ).bind(tmdb_id).first();
      if (cached) {
        const fetchedAt = new Date(cached.fetched_at || 0);
        const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
        // watch_grade가 있고 30일 이내면 캐시 반환
        // watch_grade가 비어있으면 재호출 (이전에 API 키 오류로 빈 값 저장된 경우 대비)
        if (daysSince < 30 && cached.watch_grade) {
          return new Response(JSON.stringify({ ok: true, source: "cache", data: cached }), { headers });
        }
      }

      // 영화진흥위원회 API 호출
      const kmrbUrl =
        `https://www.kmrb.or.kr/openapi/openApi.do` +
        `?serviceKey=${env.KMRB_MOVIE_API_KEY}` +
        `&searchType=MOVIE_NM` +
        `&searchNm=${encodeURIComponent(title_ko)}` +
        `&pageNo=1&numOfRows=5`;

      const kmrbRes  = await fetch(kmrbUrl);
      const kmrbText = await kmrbRes.text();

      // ── XML 파싱 (실제 KMRB API 태그명 기준) ──────────────
      // <item> 블록 단위로 분리 후 제목 일치하는 항목 선택
      const itemBlocks = kmrbText.match(/<item>([\s\S]*?)<\/item>/g) || [];

      // 특수문자/공백 제거 후 비교하는 정규화 함수
      const normalize = (s) => (s || "").replace(/[\s\(\)\[\]·\-\:\.]/g, "").toLowerCase();
      const titleNorm = normalize(title_ko);

      // 제목이 일치하는 item 블록 찾기
      // useTitle 또는 oriTitle이 검색 제목과 유사하면 채택
      let bestBlock = null;
      for (const block of itemBlocks) {
        const getItemTag = (tag) => {
          const m = block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
          return m ? m[1].trim() : "";
        };
        const useTitle = normalize(getItemTag("useTitle"));
        const oriTitle = normalize(getItemTag("oriTitle"));
        if (useTitle.includes(titleNorm) || titleNorm.includes(useTitle) ||
            oriTitle.includes(titleNorm) || titleNorm.includes(oriTitle)) {
          bestBlock = block;
          break;
        }
      }

      // 제목 일치 항목 없으면 빈 데이터 저장 (오매칭 방지)
      const getTag = (tag) => {
        if (!bestBlock) return "";
        const m = bestBlock.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
        return m ? m[1].trim() : "";
      };

      // Flag(Y/N) → 한글 레이블 변환
      const flagToLabel = (flag, grade) => {
        if (flag === "Y") return grade || "해당";
        return "없음";
      };

      // 관람등급: gradeName 태그
      const watchGrade = getTag("gradeName") || "";

      // 시청가이드 항목: Flag 기반 (Y=해당, N=없음)
      // 각 항목은 Flag가 Y일 때 등급(gradeName)을 표시
      const pokFlag    = getTag("pokFlag");     // 폭력성
      const yakDrkFlag = getTag("yakDrkFlag");  // 약물(음주)
      const yakSmkFlag = getTag("yakSmkFlag");  // 약물(흡연)
      const yakDrgFlag = getTag("yakDrgFlag");  // 약물(마약)
      const moSuiFlag  = getTag("moSuiFlag");   // 자살/자해
      const moHarmFlag = getTag("moHarmFlag");  // 신체노출
      const coreHarm   = getTag("coreHarmRsn"); // 핵심 해악사유

      const rating = {
        tmdb_id,
        title_ko,
        watch_grade: watchGrade,
        // 시청가이드: Flag Y/N 기반으로 해당 여부 표시
        subject:   coreHarm || "",                                    // 핵심 해악사유
        violence:  pokFlag    === "Y" ? watchGrade || "해당" : "없음", // 폭력성
        drug:      (yakDrkFlag === "Y" || yakSmkFlag === "Y" || yakDrgFlag === "Y")
                     ? watchGrade || "해당" : "없음",                  // 약물
        imitation: moSuiFlag  === "Y" ? watchGrade || "해당" : "없음", // 모방위험(자살/자해)
        sexuality: moHarmFlag === "Y" ? watchGrade || "해당" : "없음", // 선정성(신체노출)
        language:  "",  // KMRB API에 대사 관련 Flag 없음
        horror:    "",  // KMRB API에 공포 관련 Flag 없음
        source:    "kmrb_api",
        fetched_at: new Date().toISOString(),
      };

      // D1에 캐시 저장
      await env.DB.prepare(`
        INSERT INTO kmrb_ratings
          (tmdb_id, title_ko, watch_grade, subject, sexuality, violence,
           language, imitation, drug, horror, source, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tmdb_id) DO UPDATE SET
          watch_grade = excluded.watch_grade,
          subject     = excluded.subject,
          sexuality   = excluded.sexuality,
          violence    = excluded.violence,
          language    = excluded.language,
          imitation   = excluded.imitation,
          drug        = excluded.drug,
          horror      = excluded.horror,
          source      = excluded.source,
          fetched_at  = excluded.fetched_at
      `).bind(
        rating.tmdb_id, rating.title_ko, rating.watch_grade,
        rating.subject, rating.sexuality, rating.violence,
        rating.language, rating.imitation, rating.drug,
        rating.horror, rating.source, rating.fetched_at
      ).run();

      return new Response(JSON.stringify({ ok: true, source: "api", data: rating }), { headers });
    } catch (e) {
      console.error("[KMRB]", e.message);
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
