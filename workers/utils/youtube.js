/* ══════════════════════════════════════════════════════════════
   YouTube / TMDB 영상 관련 유틸리티
   - _crawlYoutubeVideos      : YouTube 검색으로 추가 영상 수집
   - _saveTmdbVideos          : TMDB API 영상 DB 저장
   - collectAndTranslateComments : YouTube 댓글 수집 + Claude 번역
══════════════════════════════════════════════════════════════ */

/** YouTube 추가 영상 크롤링 (관리자 수동 실행)
 *  - TMDB 영상 외에 YouTube에서 추가 관련 영상 수집
 *  - works 테이블에서 title_ko 조회 후 YouTube Data API v3 검색
 *  - 1차: "{title_ko} 예고편" / 2차: "{title_ko}" 인기순 폴백
 *  - 기존 DB에 있는 영상은 중복 저장 안 함
 */
export async function _crawlYoutubeVideos(tmdb_id, env) {
  try {
    // ① works 테이블에서 한글 작품명 조회
    //    rankings 테이블에서 최근 등록 플랫폼도 함께 조회 (검색 쿼리 정확도 향상)
    const work = await env.DB.prepare(
      "SELECT title_ko FROM works WHERE tmdb_id = ?"
    ).bind(tmdb_id).first();

    if (!work?.title_ko) {
      console.log(`[YT_CRAWL] tmdb_id=${tmdb_id} works 없음 — 스킵`);
      return 0;
    }
    const title_ko = work.title_ko;

    // 플랫폼 조회 — 가장 최근 랭킹 데이터 기준 (한 작품이 여러 플랫폼일 수 있으므로 1개만)
    const platformRow = await env.DB.prepare(
      "SELECT platform FROM rankings WHERE tmdb_id = ? ORDER BY date DESC LIMIT 1"
    ).bind(tmdb_id).first();

    // 플랫폼 → YouTube 검색 접두어 매핑
    const PLATFORM_PREFIX = {
      netflix   : '넷플릭스',
      tving     : '티빙',
      disney    : '디즈니플러스',
      wavve     : '웨이브',
      coupang   : '쿠팡플레이',
      boxoffice : '영화',   // 박스오피스는 "영화 {제목}" 형식
    };
    const prefix = platformRow?.platform
      ? (PLATFORM_PREFIX[platformRow.platform] || '')
      : '';

    // 검색에 사용할 제목 (접두어 포함)
    // - 플랫폼 있으면: "넷플릭스 끝까지 살아남아라: 더 정글"
    // - 플랫폼 없으면: "끝까지 살아남아라: 더 정글" (기존 방식)
    const searchTitle = prefix ? `${prefix} ${title_ko}` : title_ko;

    // ② DB에 이미 있는 youtube_id 목록 (중복 저장 방지)
    const { results: existingVideos } = await env.DB.prepare(
      "SELECT youtube_id FROM title_videos WHERE tmdb_id = ?"
    ).bind(tmdb_id).all();
    const existingIds = new Set(existingVideos.map(v => v.youtube_id));

    // ③ YouTube Data API v3 검색 — 정확도 우선 다단계 전략
    //
    // 검색 쿼리 순서 (앞쪽일수록 정확도 높음):
    //   1차: "{플랫폼} {title_ko} 공식 예고편"  — 플랫폼 공식 예고편 (가장 정확)
    //   2차: "{플랫폼} {title_ko} 예고편"        — 플랫폼 일반 예고편
    //   3차: "{title_ko} 리뷰"                   — 리뷰/분석 영상 (플랫폼 없이)
    //   4차: "{title_ko} 후기"                   — 시청 후기 영상 (플랫폼 없이)
    const searchQueries = [
      `${searchTitle} 공식 예고편`,
      `${searchTitle} 예고편`,
      `${title_ko} 리뷰`,
      `${title_ko} 후기`,
    ];

    // 제목 필터링용 핵심 단어 추출
    // - 콜론(:) 등 부제 구분자 제거 후 분리
    // - 2글자 이상 단어만 사용 (조사/단음절 제거)
    // - 예) "끝까지 살아남아라: 더 정글" → ["끝까지", "살아남아라", "정글"]
    const titleWords = title_ko
      .replace(/[:\-·|]/g, ' ')            // 부제 구분자 → 공백
      .replace(/[^\uAC00-\uD7A3a-zA-Z0-9\s]/g, '') // 나머지 특수문자 제거
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // 영상 제목이 작품명과 관련 있는지 확인
    // - 제목 단어 수에 따라 매칭 임계값 동적 조정
    //   단어 1~2개 → 1개 이상 포함 (짧은 제목은 관대하게)
    //   단어 3개   → 2개 이상 포함
    //   단어 4개~  → 3개 이상 포함 (긴 제목은 엄격하게)
    // - 이렇게 하면 "끝까지"처럼 흔한 단어 하나만 겹쳐서 통과되는 오매칭 방지
    function isRelatedVideo(videoTitle) {
      if (!videoTitle || !titleWords.length) return true;
      const vt        = videoTitle.toLowerCase();
      const matchCount = titleWords.filter(w => vt.includes(w.toLowerCase())).length;
      const threshold  = titleWords.length <= 2 ? 1
                       : titleWords.length === 3 ? 2
                       : 3; // 4단어 이상
      return matchCount >= threshold;
    }

    const items        = []; // 필터 통과한 영상
    const fallbackItems = []; // 필터 미통과 (폴백용)

    for (const query of searchQueries) {
      if (items.length >= 3) break;

      const ytUrl =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&type=video&order=relevance&maxResults=8` +
        `&relevanceLanguage=ko` +
        `&q=${encodeURIComponent(query)}` +
        `&key=${env.YOUTUBE_API_KEY}`;

      const ytRes  = await fetch(ytUrl);
      const ytData = await ytRes.json();

      if (!ytRes.ok || !ytData.items?.length) continue;

      for (const item of ytData.items) {
        if (items.length >= 3) break;
        const videoId    = item.id?.videoId;
        const videoTitle = item.snippet?.title || '';
        if (!videoId || existingIds.has(videoId)) continue;

        const entry = {
          youtube_id:  videoId,
          title:       videoTitle || title_ko,
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        };

        if (isRelatedVideo(videoTitle)) {
          // 필터 통과 — 바로 채택
          items.push(entry);
          existingIds.add(videoId);
        } else if (fallbackItems.length < 3) {
          // 필터 미통과 — 폴백 후보로 보관 (영상 0개 방지)
          fallbackItems.push(entry);
          existingIds.add(videoId);
        }
      }
    }

    // 필터 통과 영상이 부족하면 폴백으로 채움 (최대 3개)
    if (items.length < 3 && fallbackItems.length) {
      const need = 3 - items.length;
      items.push(...fallbackItems.slice(0, need));
      console.log(`[YT_CRAWL] tmdb_id=${tmdb_id} "${searchTitle}" 폴백 ${Math.min(need, fallbackItems.length)}개 포함`);
    }

    if (!items.length) {
      console.log(`[YT_CRAWL] tmdb_id=${tmdb_id} "${searchTitle}" 결과 없음`);
      return 0;
    }

    // ④ title_videos 저장
    for (const v of items) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, 0)
      `).bind(tmdb_id, v.youtube_url, v.youtube_id, v.title).run();
    }

    console.log(`[YT_CRAWL] ✅ tmdb_id=${tmdb_id} "${searchTitle}" ${items.length}개 저장`);
    return items.length;

  } catch (e) {
    console.error(`[YT_CRAWL] tmdb_id=${tmdb_id} 오류:`, e.message);
    return 0;
  }
}

/** TMDB 영상 DB 저장
 *  - 첫 접속 시 TMDB API에서 영상을 가져와 title_videos에 저장
 *  - Trailer/Teaser 우선, 나머지 뒤에
 *  - 첫 번째 영상을 is_main=1로 저장
 */
export async function _saveTmdbVideos(tmdb_id, env) {
  try {
    // ① works 테이블에서 media_type 조회
    const work = await env.DB.prepare(
      "SELECT media_type FROM works WHERE tmdb_id = ?"
    ).bind(tmdb_id).first();
    const mediaType = work?.media_type || "tv";

    // ② TMDB 영상 조회 (한국어 우선, 없으면 영어 폴백)
    let videos = [];
    try {
      const koRes = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${tmdb_id}/videos?language=ko-KR&api_key=${env.TMDB_API_KEY}`
      );
      videos = (await koRes.json()).results || [];
    } catch (e) {}

    if (!videos.length) {
      try {
        const enRes = await fetch(
          `https://api.themoviedb.org/3/${mediaType}/${tmdb_id}/videos?language=en-US&api_key=${env.TMDB_API_KEY}`
        );
        videos = (await enRes.json()).results || [];
      } catch (e) {}
    }

    // ③ YouTube 영상만 필터, Trailer/Teaser 우선 정렬
    const ytVideos = videos.filter(v => v.site === "YouTube");
    const sorted   = [
      ...ytVideos.filter(v => v.type === "Trailer" || v.type === "Teaser"),
      ...ytVideos.filter(v => v.type !== "Trailer" && v.type !== "Teaser"),
    ];

    if (!sorted.length) {
      console.log(`[TMDB_SAVE] tmdb_id=${tmdb_id} TMDB 영상 없음`);
      return 0;
    }

    // ④ title_videos에 저장 (첫 번째만 is_main=1)
    for (let i = 0; i < sorted.length; i++) {
      const v      = sorted[i];
      const isMain = i === 0 ? 1 : 0;
      await env.DB.prepare(`
        INSERT OR IGNORE INTO title_videos (tmdb_id, youtube_url, youtube_id, title, is_main)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        tmdb_id,
        `https://www.youtube.com/watch?v=${v.key}`,
        v.key,
        v.name || "",
        isMain
      ).run();
    }

    console.log(`[TMDB_SAVE] ✅ tmdb_id=${tmdb_id} ${sorted.length}개 저장`);
    return sorted.length;

  } catch (e) {
    console.error(`[TMDB_SAVE] tmdb_id=${tmdb_id} 오류:`, e.message);
    return 0;
  }
}

/** YouTube 댓글 수집 + Claude 번역
 *  - YouTube Data API v3로 인기 댓글 최대 50개 수집
 *  - Claude Haiku로 한국어 번역
 *  - reaction_comments 테이블에 저장
 */
export async function collectAndTranslateComments(reactionId, videoId, tmdbId, env) {
  try {
    console.log(`[REACTION] 댓글 수집 시작: reaction=${reactionId} video=${videoId}`);

    const ytUrl =
      "https://www.googleapis.com/youtube/v3/commentThreads" +
      "?part=snippet&videoId=" + videoId +
      "&maxResults=100&order=relevance&key=" + env.YOUTUBE_API_KEY;

    const ytRes  = await fetch(ytUrl);
    const ytData = await ytRes.json();

    if (!ytRes.ok || !ytData.items?.length) {
      console.error("[REACTION] YouTube API 오류:", JSON.stringify(ytData).slice(0, 200));
      return;
    }

    const allComments = ytData.items
      .map(item => {
        const s = item.snippet.topLevelComment.snippet;
        return {
          author:    (s.authorDisplayName || "익명").replace(/^@/, ""),
          text:      (s.textDisplay || "").replace(/<[^>]*>/g, "").trim(),
          likes:     s.likeCount || 0,
          published: s.publishedAt || "",
        };
      })
      .filter(cm => cm.text.length > 5);

    const comments = allComments
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 50);

    if (!comments.length) return;

    const commentList = comments
      .map((cm, i) => (i + 1) + ". " + cm.text.slice(0, 300))
      .join("\n");

    const prompt =
      "아래는 YouTube 영상의 해외 댓글 목록입니다.\n" +
      "각 댓글을 자연스러운 한국어로 번역하세요.\n\n" +
      "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n" +
      '[\n  {"idx": 0, "translated": "번역된 댓글"},\n  ...\n]\n\n' +
      "댓글 목록:\n" + commentList;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText    = claudeData.content?.[0]?.text || "[]";

    let translations = [];
    try {
      const cleaned = rawText.split("```json").join("").split("```").join("").trim();
      const parsed  = JSON.parse(cleaned);
      translations  = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("[REACTION] Claude 응답 파싱 실패:", rawText.slice(0, 300));
      translations = [];
    }

    await env.DB.prepare(
      "DELETE FROM reaction_comments WHERE reaction_id = ?"
    ).bind(reactionId).run();

    for (let i = 0; i < comments.length; i++) {
      const cm = comments[i];
      const tr =
        translations.find(t => t.idx === i) ||
        translations.find(t => t.idx === i + 1) ||
        translations[i] ||
        {};
      const text = tr.translated || "";
      await env.DB.prepare(`
        INSERT INTO reaction_comments
          (reaction_id, tmdb_id, original_text, translated_text, author, like_count, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        reactionId, tmdbId,
        cm.text.slice(0, 1000),
        text.slice(0, 1000),
        cm.author.slice(0, 100),
        cm.likes,
        "neutral"
      ).run();
    }

    console.log(`[REACTION] ✅ 완료: reaction=${reactionId} 댓글 ${comments.length}개 저장`);
  } catch (e) {
    console.error("[REACTION] 오류:", e.message);
  }
}
