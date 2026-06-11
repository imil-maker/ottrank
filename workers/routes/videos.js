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
  // DB 1~2개: YouTube 크롤링 추가 실행
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

      if (results.length === 0) {
        ctx.waitUntil(_saveTmdbVideos(tmdb_id, env));
        ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
      } else if (results.length <= 2) {
        ctx.waitUntil(_crawlYoutubeVideos(tmdb_id, env));
      }

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
      const { tmdb_id, title_ko, title_en, poster_path, media_type } = body;

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
        INSERT INTO works (tmdb_id, title_ko, title_en, poster_path, media_type)
        VALUES (?, ?, ?, ?, ?)
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
          END
      `).bind(
        parseInt(tmdb_id),
        title_ko       || null,
        validTitle_en  || null,
        poster_path    || null,
        media_type     || 'tv'
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

      // XML 파싱 (정규식 기반)
      const getTag = (tag) => {
        const m = kmrbText.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
        return m ? m[1].trim() : "";
      };

      const rating = {
        tmdb_id,
        title_ko:    title_ko,
        watch_grade: getTag("watchGrade") || getTag("movieGrade") || "",
        subject:     getTag("subject")     || "",
        sexuality:   getTag("sexuality")   || "",
        violence:    getTag("violence")    || "",
        language:    getTag("language")    || "",
        imitation:   getTag("imitation")   || "",
        drug:        getTag("drug")        || "",
        horror:      getTag("horror")      || "",
        source:      "kmrb_api",
        fetched_at:  new Date().toISOString(),
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

  const GENRE_MBTI_MAP = {
    '드라마'      : ['ENFP','ENTJ','ISTJ','ISFP','INFJ'],
    '스릴러'      : ['INFJ','INTJ','INTP','ISTP'],
    '공포'        : ['ISTP','INTP'],
    '판타지'      : ['INFP','ENFJ','ENFP'],
    'SF'          : ['INTJ','INTP','ENTP','ENTJ'],
    '액션'        : ['ESTP','ESTJ','ESFJ'],
    '코미디'      : ['ESFP','ISFJ','ENFP'],
    '로맨스'      : ['ISFJ','ENFJ','ESFP'],
    '범죄'        : ['INTJ','ISTP','INFJ'],
    '모험'        : ['ESTP','ENTP','ENFP'],
    '애니메이션'  : ['ISFP','INFP'],
    '다큐멘터리'  : ['INTJ','INTP','ISTJ'],
    '미스터리'    : ['INFJ','INTP','INTJ','ISTP'],
    '전쟁'        : ['ISTJ','ESTJ','ISTP'],
    '역사'        : ['ISTJ','INTJ','INFJ'],
    '음악'        : ['ISFP','ENFP','ESFP'],
    '가족'        : ['ISFJ','ESFJ','ENFJ'],
    'Reality'     : ['ESFP','ESTP','ENFP'],
    'Drama'               : ['ENFP','ENTJ','ISTJ','ISFP','INFJ'],
    'Thriller'            : ['INFJ','INTJ','INTP','ISTP'],
    'Horror'              : ['ISTP','INTP'],
    'Fantasy'             : ['INFP','ENFJ','ENFP'],
    'Science Fiction'     : ['INTJ','INTP','ENTP','ENTJ'],
    'Sci-Fi & Fantasy'    : ['INTJ','INTP','ENTP','INFP'],
    'Action'              : ['ESTP','ESTJ','ESFJ'],
    'Action & Adventure'  : ['ESTP','ESTJ','ESFJ','ENTP'],
    'Comedy'              : ['ESFP','ISFJ','ENFP'],
    'Romance'             : ['ISFJ','ENFJ','ESFP'],
    'Crime'               : ['INTJ','ISTP','INFJ'],
    'Adventure'           : ['ESTP','ENTP','ENFP'],
    'Animation'           : ['ISFP','INFP'],
    'Documentary'         : ['INTJ','INTP','ISTJ'],
    'Mystery'             : ['INFJ','INTP','INTJ','ISTP'],
    'War'                 : ['ISTJ','ESTJ','ISTP'],
    'War & Politics'      : ['ISTJ','INTJ','INFJ'],
    'History'             : ['ISTJ','INTJ','INFJ'],
    'Music'               : ['ISFP','ENFP','ESFP'],
    'Family'              : ['ISFJ','ESFJ','ENFJ'],
    'Soap'                : ['ISFJ','ESFJ','ENFJ'],
    'Kids'                : ['ISFJ','ESFJ','ENFP'],
    'Western'             : ['ISTP','ESTP','ISTJ'],
  };

  const genres = genre.split(',').map(g => g.trim()).filter(Boolean);
  const scoreMap = {};
  for (const g of genres) {
    const mbtis = GENRE_MBTI_MAP[g];
    if (!mbtis) continue;
    mbtis.forEach((mbti, idx) => {
      const score = idx === 0 ? 3 : idx === 1 ? 2 : 1;
      scoreMap[mbti] = (scoreMap[mbti] || 0) + score;
    });
  }
  if (!Object.keys(scoreMap).length) return null;
  return Object.entries(scoreMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([mbti]) => mbti)
    .join(',');
}
