/* 2026-07-27 rev.5 — functions/person/[id].js (MBTI SEO 반영 — persons.mbti_naver 조회해서
   MBTI 확정된 사람만 title/description/keywords에 "MBTI" 단어 추가(실제 값은 절대 안 넣음 —
   검색결과에서 다 보여주면 클릭 안 하고 넘어가버리니까 단어만 노출, 값은 페이지 안에서만
   확인 가능). 인스타 계정 있으면 title에 "·인스타"도 추가. 그리고 봇이 "{이름} MBTI"로
   검색해서 들어왔을 때 실제 페이지 본문에서도 MBTI를 확인할 수 있어야 색인에 유리하므로,
   personMetaRow(메타 칩 자리)에 MBTI 칩을 서버에서 미리 심어둠 — bioText/personName과
   동일한 SSR 프리필 패턴) */
/* functions/person/[id].js - 오뜨랑 인물 상세 페이지 라우팅 + SSR SEO */

const TMDB_PROXY = 'https://tmdb-proxy.tdidream.workers.dev/tmdb';
const IMG_PROFILE = 'https://image.tmdb.org/t/p/w342';

/* ── 특수문자 이스케이프 ── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* [2026-07-27 신규] <script> 태그 안에 값을 안전하게 심기 위한 JS 문자열 리터럴 이스케이프.
   JSON.stringify로 따옴표/역슬래시를 안전하게 처리하고, "</script>"로 오인될 수 있는
   < > 문자는 유니코드 이스케이프로 한 번 더 감싸서 태그가 중간에 끊기지 않게 함. */
function jsStr(str) {
  return JSON.stringify(str || '')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

export async function onRequest(context) {
  const { params, env } = context;
  const personId = params.id;

  /* ── 1. person.html 원본 로드 ── */
  const response = await env.ASSETS.fetch('https://ottrank.kr/person.html');
  let html = await response.text();

  /* ── 2. 기본 SEO값 ── */
  let seoTitle     = '인물 정보 | 오뜨랑 — 배우·감독 프로필·필모그래피';
  let seoDesc      = '배우·감독 프로필, 출연작, 필모그래피를 오뜨랑에서 확인하세요.';
  let seoKeywords  = '배우 프로필, 감독 필모그래피, 출연작, 드라마 배우, OTT 배우';
  let seoOgImage   = 'https://ottrank.kr/og-image.png';
  let seoCanonical = `https://ottrank.kr/person/${personId}`;
  let jsonLd       = '{}';
  let bioSource    = ''; // [2026-07-25 신규] D1 약력(bio_summary/auto_filmography_text) 우선, 없으면 TMDB로 폴백
  let ssrDisplayName = ''; // [2026-07-27 신규] 화면 personName 칸에 미리 채워넣을 최종 확정 이름(DB name_ko 우선, 없으면 TMDB)
  let hasMbti      = false; // [2026-07-27 신규] MBTI 확정 여부만 — 실제 타입 값은 SSR에서 절대 안 다룸(person-wiki.js API로만 노출)

  /* ── 3. TMDB Person API 호출 ── */
  if (personId) {
    try {
      const res  = await fetch(
        `${TMDB_PROXY}/person/${personId}?language=ko-KR&append_to_response=combined_credits,external_ids`
      );
      const data = await res.json();

      if (data && data.id) {
        /* 한국어 이름 추출 */
        const alsoKnown = data.also_known_as || [];
        const koName    = alsoKnown.find(n => /[가-힣]/.test(n)) || '';
        let   name      = koName || data.name || '';
        const enName    = koName ? data.name : '';

        /* 대표 직업 (배우/감독) */
        const dept      = data.known_for_department || '';
        const jobLabel  = dept === 'Directing' ? '감독' : '배우';

        /* [2026-07-27 신규] 인스타 계정 여부 — title에 "·인스타" 추가할지 판단에 필요해서
           앞으로 끌어옴(기존엔 파일 뒷부분 sameAs 만들 때만 썼음). external_ids를
           append_to_response에 새로 추가해야 값이 채워짐(위 TMDB 호출 부분 참고). */
        const instaId = data.external_ids?.instagram_id || '';

        /* [2026-07-25 신규] D1 약력 프리필 — bio_summary(진짜 약력) 100자 이상이면 그것만,
           100자 미만(또는 없음)이면 auto_filmography_text(자동생성 필모문장)를 이어붙임.
           D1 조회 실패해도 TMDB biography로 그대로 폴백 — 페이지가 깨지는 일은 없음.
           [2026-07-26 수정] korean_confirmed로 국적 분기 추가.
           - 한국인(=1): 기존 로직 그대로(TMDB 약력 사용 안 함 — 한국 배우 TMDB 약력은
             부실하거나 영어인 경우가 많아서 위키+필모문장만 씀).
           - 외국인/미확인(0 또는 NULL): 위키 있으면 위키, 없으면 TMDB 약력을 기본으로 삼고,
             그게 100자 미만으로 부실할 때만 필모문장을 보충으로 붙임(한국인과 동일한
             "부실할 때만 보충" 규칙, 재료만 다름). TMDB 약력이 이미 충분히 좋으면
             필모문장 없이 TMDB 약력 그대로 노출됨.
           [2026-07-27 추가] p.name_ko도 같이 조회 — TMDB 자동탐색 이름보다 우리 DB
           name_ko를 우선시함(예명으로 알려진 인물 등, 화면 person.html과 동일한 우선순위). */
        if (env.DB) {
          try {
            const wikiRow = await env.DB.prepare(
              `SELECT w.bio_summary, w.auto_filmography_text, p.korean_confirmed, p.name_ko, p.mbti_naver
               FROM persons p LEFT JOIN person_wiki_cache w ON w.tmdb_person_id = p.tmdb_id
               WHERE p.tmdb_id = ?`
            ).bind(personId).first();

            if (wikiRow && wikiRow.name_ko) name = wikiRow.name_ko; // DB 이름 우선(있을 때만)
            // [2026-07-27 신규] MBTI 확정 여부만 판단 — person-wiki.js와 동일한 기준
            // (값 있고, "공개안함" 확정이 아닐 때만 확정으로 취급). 실제 타입 값은 여기서
            // 변수에도 안 담음 — SSR이 절대 값을 노출하지 않게 하기 위함.
            if (wikiRow && wikiRow.mbti_naver && wikiRow.mbti_naver !== 'UNDISCLOSED') {
              hasMbti = true;
            }
            if (wikiRow) {
              const manualBio = (wikiRow.bio_summary || '').trim();
              const autoRaw   = (wikiRow.auto_filmography_text || '').trim();
              const autoText  = (autoRaw && autoRaw !== '__NONE__') ? autoRaw : '';
              const koreanConfirmed = wikiRow.korean_confirmed;

              if (koreanConfirmed === 1) {
                bioSource = manualBio.length >= 100
                  ? manualBio
                  : [manualBio, autoText].filter(Boolean).join(' ');
              } else {
                const base = manualBio || data.biography || '';
                bioSource = base.length < 100
                  ? [base, autoText].filter(Boolean).join(' ')
                  : base;
              }
            }
          } catch (e) {
            bioSource = ''; // 조회 실패 시 아래에서 TMDB biography로 폴백
          }
        }
        ssrDisplayName = name; // [2026-07-27 신규] 여기까지 오면 name은 최종 확정값(DB name_ko 우선, 없으면 TMDB 자동탐색)

        if (!bioSource) bioSource = data.biography || '';

        /* 약력 앞 100자 */
        const bio       = bioSource.slice(0, 100).replace(/\n/g, ' ');

        /* 출연작 상위 3개 (최신순) */
        const credits   = data.combined_credits || {};
        const topWorks  = [...(credits.cast || []), ...(credits.crew || [])]
          .filter(w => w.poster_path)
          .sort((a, b) => {
            const da = a.release_date || a.first_air_date || '0000';
            const db = b.release_date || b.first_air_date || '0000';
            return db.localeCompare(da);
          })
          .slice(0, 3)
          .map(w => w.title || w.name || '')
          .filter(Boolean);

        /* 프로필 이미지 */
        if (data.profile_path) {
          seoOgImage = `${IMG_PROFILE}${data.profile_path}`;
        }

        /* title */
        // [2026-07-27 신규] 인스타 계정 있으면 "·인스타", MBTI 확정이면 "·MBTI" 단어만
        // 뒤에 덧붙임(핵심 키워드인 프로필·출연작·필모그래피보다 뒤 순서 유지, 실제 값은
        // 절대 안 넣음 — 검색결과에서 값까지 다 보이면 클릭 없이 넘어가버리기 때문).
        let titleExtras = '';
        if (instaId) titleExtras += '·인스타';
        if (hasMbti) titleExtras += '·MBTI';
        seoTitle = `${name} 프로필·출연작·필모그래피${titleExtras} | ${jobLabel} 정보 | 오뜨랑`;

        /* description */
        const worksSnippet = topWorks.length
          ? `대표작: ${topWorks.join(', ')}. `
          : '';
        // [2026-07-27 신규] MBTI 확정이면 "나이" 다음에 "MBTI" 단어만 추가(값 없음).
        // 인스타는 원래도 "인스타그램 정보를"이 무조건 들어가 있어서 별도 추가 불필요.
        const mbtiDescWord = hasMbti ? ', MBTI' : '';
        seoDesc = `${name} ${jobLabel} 나이${mbtiDescWord}, 출연 드라마·영화, 인스타그램 정보를 오뜨랑에서 확인하세요. ${worksSnippet}${bio ? bio + '...' : ''}`.trim();

        /* keywords */
        seoKeywords = [
          name,
          `${name} 드라마`,
          `${name} 영화`,
          `${name} 나이`,
          `${name} 프로필`,
          `${name} 인스타`,
          `${name} 출연작`,
          hasMbti ? `${name} MBTI` : '', // [2026-07-27 신규]
          enName,
          `${jobLabel} 필모그래피`,
          'OTT 배우',
          '드라마 배우 프로필',
        ].filter(Boolean).join(', ');

        /* JSON-LD — Person 스키마 */
        const ld = {
          '@context': 'https://schema.org',
          '@type':    'Person',
          name,
          url:        seoCanonical,
          image:      seoOgImage,
          jobTitle:   jobLabel,
        };
        if (bioSource)          ld.description    = bioSource.slice(0, 200);
        if (data.birthday)     ld.birthDate      = data.birthday;
        if (data.place_of_birth) ld.birthPlace   = data.place_of_birth;
        if (enName)            ld.alternateName  = enName;

        /* sameAs — 인스타 링크 (instaId는 위에서 이미 계산해둠) */
        if (instaId) ld.sameAs = [`https://www.instagram.com/${instaId}/`];

        /* knowsAbout — 대표작 */
        if (topWorks.length) ld.knowsAbout = topWorks;

        jsonLd = JSON.stringify(ld);
      }
    } catch (e) {
      /* TMDB 실패 시 기본값 유지 */
    }
  }

  /* ── 4. HTML에 메타태그 SSR 주입 ── */
  const metaInject = `
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(seoDesc)}">
<meta name="keywords" content="${esc(seoKeywords)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(seoCanonical)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="오뜨랑">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(seoDesc)}">
<meta property="og:url" content="${esc(seoCanonical)}">
<meta property="og:image" content="${esc(seoOgImage)}">
<meta property="og:image:width" content="342">
<meta property="og:image:height" content="513">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(seoDesc)}">
<meta name="twitter:image" content="${esc(seoOgImage)}">
<script type="application/ld+json">${jsonLd}</script>
<script>window.__PERSON_ID__="${personId}";window.__PERSON_NAME__=${jsStr(ssrDisplayName)};</script>`;

  /* 기존 id 기반 메타태그 제거 후 교체 */
  html = html
    .replace(/<title[^>]*>.*?<\/title>/is, '')
    .replace(/<meta[^>]+id="seoTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoKw"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgDesc"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgUrl"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoOgImg"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwTitle"[^>]*>/i, '')
    .replace(/<meta[^>]+id="seoTwDesc"[^>]*>/i, '')
    .replace(/<link[^>]+id="seoCanonical"[^>]*>/i, '')
    .replace('<head>', `<head>\n${metaInject}`);

  /* [2026-07-25 신규] 본문 약력 자리(id="bioText")도 미리 채움 — 화면에는 자바스크립트가
     로드 후 다시 자기 로직(위키 우선 등)으로 덮어쓰므로 사람 눈엔 영향 없음. bioSource가
     비어있으면(D1도 TMDB도 없음) 건드리지 않고 기존 빈 상태 그대로 둠. */
  if (bioSource) {
    html = html.replace(
      /(<div class="bio-text" id="bioText">)[\s\S]*?(<\/div>)/,
      (_, pre, post) => `${pre}${esc(bioSource)}${post}`
    );
  }

  /* [2026-07-27 신규] 화면 이름 칸도 bioText와 동일한 방식으로 미리 채움 — 브라우저 JS가
     TMDB를 먼저 그렸다가 우리 DB이름으로 뒤늦게 덮어쓰며 이름이 "두 번 뜨는" 깜빡임 방지.
     person.html은 이후 SNS아이콘/영문이름 등을 이 텍스트 뒤에 이어붙이기만 함(값 자체는
     안 바뀜). ssrDisplayName이 비어있으면(개인정보 조회 실패 등) 기존 placeholder("—")를
     그대로 두고, 클라이언트가 원래 하던 대로 TMDB 이름으로 채움(안전한 폴백). */
  if (ssrDisplayName) {
    html = html.replace(
      /(<div class="person-name" id="personName">)[\s\S]*?(<\/div>)/,
      (_, pre, post) => `${pre}${esc(ssrDisplayName)}${post}`
    );
  }

  /* [2026-07-27 신규] MBTI 칩 — 값(ENFP 등)은 절대 안 넣고 "MBTI"라는 라벨만 미리 심어둠.
     JS를 실행 안 하는 봇도 "이 사람 페이지엔 MBTI 정보가 있다"는 걸 본문에서 확인할 수
     있게 하기 위함(SEO 목적). 실제 값은 페이지가 로드된 뒤 person.html이 person-wiki.js
     API를 호출해서 받아와야만 채워짐 — 소스 보기만으로는 값을 알 수 없음.
     person.html의 renderMetaChips()가 TMDB 응답 도착 즉시 personMetaRow를 통째로 다시
     그리므로, 이 라벨만 있는 칩은 잠깐 보였다가 실제 값이 채워진 칩으로 자연스럽게
     교체됨(다른 메타 칩들도 원래 이런 단계적 로딩 방식이라 위화감 없음). */
  if (hasMbti) {
    html = html.replace(
      /(<div class="person-meta-row" id="personMetaRow">)[\s\S]*?(<\/div>)/,
      (_, pre, post) => `${pre}<span class="person-meta-chip mbti-chip"><span class="chip-label">MBTI</span></span>${post}`
    );
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      /* 인물 정보는 자주 안 바뀌므로 10분 캐시 */
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=120',
    },
  });
}
