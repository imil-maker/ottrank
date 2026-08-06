// 2026-08-06 rev.6 — track.js (인물 핫100 공개페이지(hot100-persons.html)용 신규 API 추가)
// - PERIOD_WHITELIST/_periodBounds에 "week"(1주일 롤링) 추가
// - GET /hot100/persons 신규: 인증 불필요(공개), blob1='person'만 걸러서 집계하고 프로필사진까지
//   같이 내려줌. /admin/track/rank와 동일한 봇/제외방문자 필터링 원칙 재사용
// ⚠️ index.js 라우팅 화이트리스트에 "/hot100/persons"를 추가해야 실제로 동작함(다른 track.js
//   라우트 추가 때마다 반복됐던 실수 — 이번엔 미리 남겨둠)
// 2026-08-03 rev.5 — track.js (실시간 순위 집계 방식 변경: 조회 건수 총합(SUM) 대신
// 같은 기간 안에서 방문자(vid) 중복 제거 후 세기(COUNT DISTINCT)로 변경 —
// 같은 사람이 새로고침 여러 번 해도 순위엔 1로만 반영됨. "최근 조회" 로그 목록은 변경 없음)
// 2026-07-31 rev.4 — track.js (실시간 순위 기간에 30분/1시간/6시간/12시간 롤링 기간 추가 —
// 기존 24시간과 동일한 "지금 - N" 방식, PERIOD_WHITELIST에도 추가)
// 2026-07-30 rev.3 — track.js (GET /admin/track/logs에 ?hideExcludedVids=1 추가 — 순위 집계에서
// 빼둔 excluded_vids 목록을 페이지 로그 목록에서도 안 보이게 필터링. 기존 excludeBot과 동일한
// 패턴, 켤 때만 D1을 한 번 더 조회함)
/* ══════════════════════════════════════════════════════════════
   track.js — 실시간 조회 이벤트 기록 + 조회 (2026-07-21 신설)
   - POST /track/view       : 작품/인물 페이지 + 메인/OTT/커뮤니티 페이지가 열릴 때마다 아주 짧게 신호를 받음
       body: { type: "work" | "person" | "main" | "netflix" | "tving" | "disney" | "wavve" | "coupang" | "boxoffice" | "community", id?: <tmdb_id 숫자, work/person만 필요>, vid?: <익명 방문자 ID 문자열, 2026-07-23 추가> }
       요청 헤더의 User-Agent로 검색엔진 크롤러(봇) 여부도 같이 판별해서 기록 (2026-07-23 추가, BOT_UA_PATTERN 참고)
   - GET  /admin/track/logs : 관리자 전용 — 최근 조회 로그 목록 (Analytics Engine SQL API로 조회, vid·is_bot 포함, 봇도 목록엔 그대로 나옴 — 표시만 해두고 지우진 않음).
       ?vid=<값>을 주면 그 방문자 것만 필터링 + 1페이지 응답에 재방문 여부(visit_info) 같이 내려줌 (2026-07-23 추가)
       ?excludeBot=1을 주면 봇으로 판별된 기록을 아예 빼고 조회(2026-07-23 추가) — vid 필터와 동시 사용 가능
       ?hideExcludedVids=1을 주면 excluded_vids(D1)에 등록된 방문자 로그도 빼고 조회(2026-07-30 추가)
         — excludeBot/vid 필터와 동시 사용 가능
   - GET  /admin/track/rank : [2026-07-22 신규] 관리자 전용 — 기간별(어제/오늘/24시간) 조회수 순위.
       작품/인물뿐 아니라 메인/OTT별/커뮤니티 페이지까지 전부 포함해서 종류+ID별로 집계 후 내림차순 정렬.
       봇 트래픽은 여기선 제외하고 집계함(2026-07-23 추가) — "실제로 사람들이 많이 보는 것"을 보려는
       목적이라, 로그 목록(위)과 달리 순위는 봇을 아예 빼고 계산.
       [2026-07-25 추가] 봇뿐 아니라 excluded_vids(D1)에 등록된 vid(관리자 자신 등)도 같이 제외.
   - GET/POST/DELETE /admin/track/excluded-vids : [2026-07-25 신규] "실시간 순위" 집계에서
       뺄 vid 목록 관리(D1 excluded_vids 테이블). 관리자 본인 브라우저처럼, 실제 방문자
       트래픽이 아닌 조회를 순위에서 걸러내고 싶을 때 씀.
   - D1은 기록(쓰기) 시점엔 전혀 안 건드리고 Cloudflare Analytics Engine(PAGE_VIEWS 바인딩)에만
     기록. 조회(읽기) 시점에만 D1에서 제목/이름을 붙이기 위해 잠깐 조회함(work/person만 — 나머지
     페이지 종류는 고정된 이름이라 D1 조회 자체가 필요 없음, 아래 PAGE_META 참고). excluded_vids
     관리 엔드포인트만 예외적으로 D1을 직접 읽고 씀(설정값이라 Analytics Engine에 안 어울림).
   - 기록 자체가 실패해도 방문자 화면엔 아무 영향 없어야 하므로, 실패해도
     조용히 ok:false만 돌려주고 500 에러로 화면에 영향 주지 않음.
   ══════════════════════════════════════════════════════════════ */

import { _checkAuth } from "../utils/authUtils.js";

// [2026-07-21 확장] "work"/"person"은 특정 작품/인물 하나를 가리키므로 번호(id)가 반드시 필요.
// 그 외(메인/OTT별/커뮤니티 페이지)는 페이지 자체가 대상이라 번호가 없음 — PAGE_META에 고정된
// 이름/링크를 미리 정의해두고, 조회 시 D1을 아예 안 건드리고 바로 붙여서 응답한다.
const ID_REQUIRED_TYPES = ["work", "person"];
const PAGE_META = {
  main:      { title: "메인페이지",   url: "/" },
  netflix:   { title: "넷플릭스",     url: "/netflix" },
  tving:     { title: "티빙",         url: "/tving" },
  disney:    { title: "디즈니+",     url: "/disneyplus" },
  wavve:     { title: "웨이브",       url: "/wavve" },
  coupang:   { title: "쿠팡플레이",   url: "/coupangplay" },
  boxoffice: { title: "박스오피스",   url: "/boxoffice" },
  community: { title: "커뮤니티",     url: "/community" },
};
const ALLOWED_TYPES = [...ID_REQUIRED_TYPES, ...Object.keys(PAGE_META)];

// [2026-07-23 추가, 2026-07-26 확장] 검색엔진 크롤러(봇) 판별 — User-Agent에 알려진 봇 이름이
// 들어있는지 확인. 완벽하게 모든 봇을 잡아내진 못하지만(신원을 숨기는 악성 봇 등), 사이트맵을
// 순회하는 구글/네이버/빙 등 "정상적으로 신원을 밝히는" 크롤러는 대부분 여기 걸림.
// [2026-07-26] 기존엔 "봇이다/아니다"만 구분했는데, 어느 봇인지(네이버/구글 등)까지 화면에서
// 구분하고 싶다는 요청으로 이름까지 반환하도록 확장. 구체적인 이름을 먼저 확인하고, 어디에도
// 안 걸리면 마지막에 일반 패턴(bot|crawl|spider|slurp)으로 "기타 크롤러"까지만 잡음.
const NAMED_BOT_PATTERNS = [
  { name: "Googlebot",      re: /googlebot/i },
  { name: "네이버(Yeti)",    re: /yeti/i },
  { name: "다음",            re: /daumoa/i },
  { name: "Bing",            re: /bingbot/i },
  { name: "Yandex",          re: /yandex/i },
  { name: "Baidu",           re: /baidu/i },
  { name: "DuckDuckGo",      re: /duckduckbot/i },
  { name: "Ahrefs",          re: /ahrefsbot/i },
  { name: "Semrush",         re: /semrushbot/i },
  { name: "MJ12bot",         re: /mj12bot/i },
  { name: "Petalbot",        re: /petalbot/i },
  { name: "Bytespider",      re: /bytespider/i },
  { name: "Facebook",        re: /facebookexternalhit/i },
  { name: "미리보기봇",       re: /preview/i },
  { name: "기타 크롤러",      re: /bot|crawl|spider|slurp/i }, // 위 어디에도 안 걸린 나머지
];
// 봇 이름까지 알아냄 — 못 찾으면 빈 문자열(=봇 아님)
function _detectBotName(ua) {
  if (!ua) return "";
  for (const p of NAMED_BOT_PATTERNS) {
    if (p.re.test(ua)) return p.name;
  }
  return "";
}
// 기존 boolean 판별 — 이름 판별 결과가 있으면 봇으로 취급(기존 호출부 그대로 재사용 가능)
function _isBotUserAgent(ua) {
  return !!_detectBotName(ua);
}

// [2026-07-22 추가] "실시간 순위"용 기간 계산. Analytics Engine의 timestamp는 UTC로 저장돼 있음.
// - 24h: 지금 시각 기준 -24시간(롤링) — 시간대 계산이 필요 없어 제일 간단.
// - today/yesterday: 한국시간(KST=UTC+9) 자정 기준으로 하루를 딱 끊음.
//   "오늘 KST 0시"를 UTC ms로 구하려면: (KST로 본 오늘 날짜의 UTC 자정) - 9시간.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PERIOD_WHITELIST = ["30min", "1h", "6h", "12h", "today", "yesterday", "24h", "week"];

function _periodBounds(period) {
  const now = Date.now();
  // [2026-07-31 추가] 30분/1시간/6시간/12시간 — 24h와 동일하게 "지금 - N" 롤링 방식
  // [2026-08-06 추가] week(1주일) — 인물 핫100용, 마찬가지로 "지금 - 7일" 롤링 방식
  const ROLLING_MS = {
    "30min": 30 * 60 * 1000, "1h": 60 * 60 * 1000, "6h": 6 * 60 * 60 * 1000, "12h": 12 * 60 * 60 * 1000,
    "week": 7 * 24 * 60 * 60 * 1000,
  };
  if (ROLLING_MS[period]) {
    return { sinceMs: now - ROLLING_MS[period], untilMs: null };
  }
  if (period === "24h") {
    return { sinceMs: now - 24 * 60 * 60 * 1000, untilMs: null };
  }
  const kstNow = new Date(now + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear(), mo = kstNow.getUTCMonth(), d = kstNow.getUTCDate();
  const todayStartMs = Date.UTC(y, mo, d, 0, 0, 0) - KST_OFFSET_MS; // 오늘 KST 0시 → UTC ms
  if (period === "yesterday") {
    return { sinceMs: todayStartMs - 24 * 60 * 60 * 1000, untilMs: todayStartMs };
  }
  return { sinceMs: todayStartMs, untilMs: null }; // 기본값: today
}

// Analytics Engine SQL(ClickHouse 문법)에 쓸 'YYYY-MM-DD HH:MM:SS' 형식(UTC 기준)으로 변환
function _toSqlDatetime(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export async function handleTrack(path, request, env, url, headers) {
  // ── POST /track/view ─────────────────────────────────────────
  if (path === "/track/view" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const type = body.type;
      const idRequired = ID_REQUIRED_TYPES.includes(type);
      const id = idRequired ? parseInt(body.id, 10) : null;
      // [2026-07-23 추가] 익명 방문자 ID(vid) — 로그인과 무관, 같은 브라우저를 구분하기 위한 값.
      // 프론트가 안 보내는 구버전 호출(vid 기능 배포 전 페이지)과의 호환을 위해 없으면 빈 문자열.
      // 혹시 모를 비정상 값 대비 길이만 방어적으로 제한(64자).
      const vid = typeof body.vid === "string" ? body.vid.slice(0, 64) : "";
      // [2026-07-23 추가] 봇 여부 — 요청 헤더의 User-Agent로 판별. 목록에서 지우지 않고
      // "봇이었다"는 표시만 남기기 위한 용도(관리자 요청사항).
      // [2026-07-26 추가] 어느 봇인지(네이버/구글 등) 이름도 함께 기록.
      const botName = _detectBotName(request.headers.get("User-Agent"));
      const isBot = !!botName;

      // 화이트리스트 검증 — 정해진 종류만 허용. work/person은 숫자 id까지 있어야 하고,
      // 그 외(메인/OTT/커뮤니티)는 type만 맞으면 id 없이도 통과.
      if (!ALLOWED_TYPES.includes(type) || (idRequired && !Number.isInteger(id))) {
        return new Response(
          JSON.stringify({ ok: false, message: "type/id가 올바르지 않아요" }),
          { status: 400, headers }
        );
      }

      // Analytics Engine 바인딩(PAGE_VIEWS)이 아직 없거나 오타났을 때를 대비한 안전장치
      if (env.PAGE_VIEWS && typeof env.PAGE_VIEWS.writeDataPoint === "function") {
        env.PAGE_VIEWS.writeDataPoint({
          // blobs: 문자열 필드 — blob1=종류, blob2=작품/인물 ID(문자열, 페이지 종류는 빈 문자열),
          // blob3=익명 방문자 ID(vid, 2026-07-23 추가, 없으면 빈 문자열),
          // blob4=봇 여부('1'=봇, ''=일반, 2026-07-23 추가)
          // blob5=봇 이름('네이버(Yeti)' 등, 봇 아니면 빈 문자열, 2026-07-26 추가)
          blobs: [type, id != null ? String(id) : "", vid, isBot ? "1" : "", botName],
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

  // ── GET /admin/track/logs ─────────────────────────────────────
  // [2026-07-21 신설] 실시간 조회 로그 목록 (관리자 전용). Analytics Engine에 기록해둔
  // 최근 조회 이벤트(작품/인물)를 최신순으로 가져와서, D1에서 제목/이름을 붙여 반환.
  if (path === "/admin/track/logs" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      if (!env.CF_ACCOUNT_ID || !env.CF_AE_API_TOKEN) {
        return new Response(JSON.stringify({
          ok: false,
          message: "CF_ACCOUNT_ID / CF_AE_API_TOKEN 환경변수가 설정되지 않았어요 (Settings → Variables and Secrets 확인)",
        }), { status: 500, headers });
      }
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const offset = (page - 1) * limit;

      // [2026-07-23 추가] vid 필터 — 특정 방문자만 모아서 보기. SQL 문자열에 직접 끼워 넣으므로
      // 영숫자만 통과시키는 화이트리스트로 방어(우리가 만드는 vid는 base36 소문자+숫자뿐이라
      // 이 형식과 안 맞으면 애초에 우리가 발급한 값이 아니라는 뜻 — 조용히 필터 없이 처리).
      const vidParam = url.searchParams.get("vid") || "";
      const vidFilter = /^[a-z0-9]{1,64}$/.test(vidParam) ? vidParam : "";

      // [2026-07-23 추가] 봇 제외 토글 — "실제 사용자만" 보고 싶을 때. vid 필터와 동시에 걸 수 있음.
      const excludeBot = url.searchParams.get("excludeBot") === "1";

      // [2026-07-30 추가] 제외 방문자(excluded_vids) 숨기기 토글 — "실시간 순위" 집계에서 이미
      // 빼고 있는 방문자(관리자 본인 등)를, 페이지 로그 목록에서도 안 보이게 함. 켤 때만 D1을
      // 한 번 더 조회(평소엔 조회 안 함), vid는 저장 시점에 이미 영숫자만 통과하는 형식으로
      // 검증돼 있지만 SQL 문자열에 직접 끼워 넣는 구조라 여기서도 같은 형식 재검증 후 사용.
      const hideExcludedVids = url.searchParams.get("hideExcludedVids") === "1";
      let excludedVidList = [];
      if (hideExcludedVids) {
        try {
          const { results } = await env.DB.prepare("SELECT vid FROM excluded_vids").all();
          excludedVidList = (results || [])
            .map(r => r.vid)
            .filter(v => /^[a-z0-9]{1,64}$/.test(v));
        } catch (e) { /* 조회 실패해도 목록 자체는 정상 반환 — 필터만 안 걸림 */ }
      }

      const whereClauses = [];
      if (vidFilter) whereClauses.push(`blob3 = '${vidFilter}'`);
      if (excludeBot) whereClauses.push(`blob4 != '1'`);
      if (excludedVidList.length) {
        whereClauses.push(`blob3 NOT IN (${excludedVidList.map(v => `'${v}'`).join(",")})`);
      }
      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

      // Analytics Engine SQL API — writeDataPoint(blobs:[type, id]) 그대로 조회.
      // 데이터셋 이름은 바인딩 만들 때 정한 "ottrank_page_views" (바인딩 변수명 PAGE_VIEWS와는 별개).
      // [2026-07-21 수정] 전체 개수(COUNT) 조회는 실패 가능성이 있고 API 호출도 1번 더 필요해서
      // 아예 제거 — 대신 "이번 페이지가 꽉 찼으면 다음 페이지도 있다"는 has_more만 판단.
      // 숫자 페이지 버튼(1,2,3...) 대신 이전/다음 버튼만 쓰는 방식으로 화면도 맞춰 변경함.
      const sql = `SELECT blob1 AS type, blob2 AS ref_id, blob3 AS vid, blob4 AS is_bot, blob5 AS bot_name, timestamp FROM ottrank_page_views ${whereSql} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;
      const aeRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_AE_API_TOKEN}`,
            "Content-Type": "text/plain",
          },
          body: sql,
        }
      );
      if (!aeRes.ok) {
        const errText = await aeRes.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false,
          message: `Analytics Engine 조회 실패 (HTTP ${aeRes.status}): ${errText.slice(0, 300)}`,
        }), { status: 500, headers });
      }
      const aeJson = await aeRes.json();
      const rows = aeJson.data || [];
      const hasMore = rows.length === limit; // 이번 페이지가 꽉 찼으면 다음 페이지도 있다고 판단

      // 작품/인물 제목을 D1에서 한 번에 조회해서 붙임 (건마다 조회하지 않고 IN절로 한 번에)
      const workIds   = [...new Set(rows.filter(r => r.type === "work").map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];
      const personIds = [...new Set(rows.filter(r => r.type === "person").map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];

      const workMap = {};
      if (workIds.length) {
        const ph = workIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, title_ko, media_type, release_year FROM works WHERE tmdb_id IN (${ph})`
        ).bind(...workIds).all();
        results.forEach(w => { workMap[w.tmdb_id] = w; });
      }
      const personMap = {};
      if (personIds.length) {
        const ph = personIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, name, name_ko FROM persons WHERE tmdb_id IN (${ph})`
        ).bind(...personIds).all();
        results.forEach(p => { personMap[p.tmdb_id] = p; });
      }

      const currentYear = new Date().getFullYear();
      const items = rows.map(r => {
        const id = parseInt(r.ref_id, 10);
        const vid = r.vid || ""; // [2026-07-23 추가] vid 기능 배포 전 기록은 빈 값 — 정상
        const isBot = r.is_bot === "1"; // [2026-07-23 추가] 봇 여부 배포 전 기록은 빈 값 → false로 처리됨(정상)
        const botName = r.bot_name || ""; // [2026-07-26 추가] 봇 이름 배포 전 기록은 빈 값(정상)
        if (r.type === "work") {
          const w = workMap[id];
          const year = (w && w.release_year) || currentYear;
          return {
            type: "work",
            id,
            title: w ? w.title_ko : `(D1에 없는 작품 #${id})`,
            url: `/title/1-${year}${id}`,
            viewed_at: r.timestamp,
            vid,
            is_bot: isBot,
            bot_name: botName,
          };
        }
        if (r.type === "person") {
          const p = personMap[id];
          return {
            type: "person",
            id,
            title: p ? (p.name_ko || p.name) : `(D1에 없는 인물 #${id})`,
            url: `/person/${id}`,
            viewed_at: r.timestamp,
            vid,
            is_bot: isBot,
            bot_name: botName,
          };
        }
        // [2026-07-21 추가] 메인/OTT별/커뮤니티 페이지 — 고정된 이름/링크라 D1 조회 없이 바로 반환.
        // PAGE_META에 없는 값(과거 데이터나 예상 못한 값)이 와도 에러 안 나게 폴백 처리.
        const meta = PAGE_META[r.type];
        return {
          type: r.type,
          id: null,
          title: meta ? meta.title : r.type,
          url: meta ? meta.url : "#",
          viewed_at: r.timestamp,
          vid,
          is_bot: isBot,
          bot_name: botName,
        };
      });

      // [2026-07-23 추가] vid 필터 중일 때만, 그 방문자의 "첫 조회 시각"을 한 번 더 조회해서
      // 오늘 처음 온 건지(is_first_time_today) 재방문인지 판단. 페이지 넘길 때마다 다시 물어볼
      // 필요 없어서 1페이지에서만 조회 — 프론트가 그 값을 기억해뒀다가 계속 씀.
      let visitInfo = null;
      if (vidFilter && page === 1) {
        try {
          const firstSeenSql = `SELECT MIN(timestamp) AS first_seen FROM ottrank_page_views WHERE blob3 = '${vidFilter}'`;
          const fsRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.CF_AE_API_TOKEN}`,
                "Content-Type": "text/plain",
              },
              body: firstSeenSql,
            }
          );
          if (fsRes.ok) {
            const fsJson = await fsRes.json();
            const firstSeen = fsJson.data?.[0]?.first_seen || null;
            if (firstSeen) {
              const { sinceMs: todayStartMs } = _periodBounds("today");
              const isFirstTimeToday = new Date(firstSeen).getTime() >= todayStartMs;
              visitInfo = { first_seen: firstSeen, is_first_time_today: isFirstTimeToday };
            }
          }
        } catch (e) { /* 재방문 정보는 부가 정보라, 실패해도 목록 자체는 정상 반환 */ }
      }

      return new Response(JSON.stringify({
        ok: true, items, page, limit, has_more: hasMore, vid_filter: vidFilter || null, visit_info: visitInfo, exclude_bot: excludeBot, hide_excluded_vids: hideExcludedVids,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/track/excluded-vids ───────────────────────────
  // [2026-07-25 신규] "실시간 순위" 집계에서 뺄 vid(관리자 자신 등) 목록 조회.
  if (path === "/admin/track/excluded-vids" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        "SELECT vid, note, created_at FROM excluded_vids ORDER BY created_at DESC"
      ).all();
      return new Response(JSON.stringify({ ok: true, items: results }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── POST /admin/track/excluded-vids ──────────────────────────
  // [2026-07-25 신규] vid 하나를 제외 목록에 추가(예: 관리자 본인 브라우저).
  if (path === "/admin/track/excluded-vids" && request.method === "POST") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const body = await request.json().catch(() => ({}));
      const vid  = (body.vid || "").trim();
      const note = (body.note || "").trim() || null;
      if (!/^[a-z0-9]{1,64}$/.test(vid)) {
        return new Response(JSON.stringify({ ok: false, message: "vid 형식이 올바르지 않아요" }), { status: 400, headers });
      }
      await env.DB.prepare(
        "INSERT INTO excluded_vids (vid, note) VALUES (?, ?) ON CONFLICT(vid) DO UPDATE SET note = excluded.note"
      ).bind(vid, note).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── DELETE /admin/track/excluded-vids/:vid ───────────────────
  // [2026-07-25 신규] 제외 목록에서 vid 하나 제거(다시 순위 집계에 포함시킴).
  if (path.match(/^\/admin\/track\/excluded-vids\/[a-z0-9]{1,64}$/) && request.method === "DELETE") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      const vid = path.split("/").pop();
      await env.DB.prepare("DELETE FROM excluded_vids WHERE vid = ?").bind(vid).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /admin/track/rank ─────────────────────────────────────
  // [2026-07-22 신규] 실시간 순위 — 기간(어제/오늘/24시간) 동안 종류+ID별 조회수를 집계해서
  // 내림차순으로 반환. 작품/인물뿐 아니라 메인/OTT별/커뮤니티 페이지까지 전부 포함(요청사항).
  if (path === "/admin/track/rank" && request.method === "GET") {
    const isAuthed = await _checkAuth(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
    }
    try {
      if (!env.CF_ACCOUNT_ID || !env.CF_AE_API_TOKEN) {
        return new Response(JSON.stringify({
          ok: false,
          message: "CF_ACCOUNT_ID / CF_AE_API_TOKEN 환경변수가 설정되지 않았어요 (Settings → Variables and Secrets 확인)",
        }), { status: 500, headers });
      }
      const periodParam = url.searchParams.get("period") || "today";
      const period = PERIOD_WHITELIST.includes(periodParam) ? periodParam : "today";
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10), 1), 100);
      const page   = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
      const offset = (page - 1) * limit;

      const { sinceMs, untilMs } = _periodBounds(period);
      let whereSql = `timestamp >= toDateTime('${_toSqlDatetime(sinceMs)}')`;
      if (untilMs != null) whereSql += ` AND timestamp < toDateTime('${_toSqlDatetime(untilMs)}')`;
      // [2026-07-23 추가] 봇(검색엔진 크롤러) 제외 — blob4='1'이면 봇으로 기록된 것.
      // 봇 판별 기능 배포 전 기록은 blob4가 빈 문자열이라 정상적으로 포함됨(오탐 없음).
      whereSql += ` AND blob4 != '1'`;

      // [2026-07-25 추가] 관리자 자신처럼 "제외 목록"에 등록해둔 vid도 순위 집계에서 뺌
      // (D1 excluded_vids 테이블, /admin/track/excluded-vids로 관리). vid는 저장 시점에
      // 이미 영숫자만 통과하는 화이트리스트를 거쳤지만, SQL 문자열에 다시 끼워 넣는 자리라
      // 여기서도 한 번 더 검증해서 이중으로 방어함.
      const { results: excludedRows } = await env.DB.prepare(
        "SELECT vid FROM excluded_vids"
      ).all();
      const excludedVids = excludedRows.map(r => r.vid).filter(v => /^[a-z0-9]{1,64}$/.test(v));
      if (excludedVids.length) {
        whereSql += ` AND blob3 NOT IN (${excludedVids.map(v => `'${v}'`).join(",")})`;
      }

      // 종류(blob1)+ID(blob2)별로 묶어서 집계 후 내림차순. has_more 판단을 위해
      // limit보다 1개 더(limit+1) 가져와서, 실제로 그만큼 있으면 다음 페이지도 있다고 판단.
      // [2026-08-03 변경] 조회 건수 총합(SUM)이 아니라, 같은 기간 안 방문자(vid) 중복 제거
      // 후 세기(COUNT DISTINCT blob3)로 변경 — 같은 사람이 새로고침을 여러 번 해도 1로만 반영됨.
      const sql = `
        SELECT blob1 AS type, blob2 AS ref_id, COUNT(DISTINCT blob3) AS cnt
        FROM ottrank_page_views
        WHERE ${whereSql}
        GROUP BY blob1, blob2
        ORDER BY cnt DESC
        LIMIT ${limit + 1} OFFSET ${offset}
      `;
      const aeRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_AE_API_TOKEN}`,
            "Content-Type": "text/plain",
          },
          body: sql,
        }
      );
      if (!aeRes.ok) {
        const errText = await aeRes.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false,
          message: `Analytics Engine 조회 실패 (HTTP ${aeRes.status}): ${errText.slice(0, 300)}`,
        }), { status: 500, headers });
      }
      const aeJson = await aeRes.json();
      const allRows = aeJson.data || [];
      const hasMore = allRows.length > limit; // limit+1개 요청해서 그만큼 왔으면 다음 페이지 있음
      const rows = allRows.slice(0, limit);

      // 작품/인물 제목을 D1에서 한 번에 조회해서 붙임 (/admin/track/logs와 동일 패턴)
      const workIds   = [...new Set(rows.filter(r => r.type === "work").map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];
      const personIds = [...new Set(rows.filter(r => r.type === "person").map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];

      const workMap = {};
      if (workIds.length) {
        const ph = workIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, title_ko, media_type, release_year FROM works WHERE tmdb_id IN (${ph})`
        ).bind(...workIds).all();
        results.forEach(w => { workMap[w.tmdb_id] = w; });
      }
      const personMap = {};
      if (personIds.length) {
        const ph = personIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, name, name_ko FROM persons WHERE tmdb_id IN (${ph})`
        ).bind(...personIds).all();
        results.forEach(p => { personMap[p.tmdb_id] = p; });
      }

      const currentYear = new Date().getFullYear();
      const items = rows.map((r, i) => {
        const rank = offset + i + 1;
        const count = Math.round(Number(r.cnt) || 0);
        if (r.type === "work") {
          const id = parseInt(r.ref_id, 10);
          const w = workMap[id];
          const year = (w && w.release_year) || currentYear;
          return {
            rank, type: "work", id, count,
            title: w ? w.title_ko : `(D1에 없는 작품 #${id})`,
            url: `/title/1-${year}${id}`,
          };
        }
        if (r.type === "person") {
          const id = parseInt(r.ref_id, 10);
          const p = personMap[id];
          return {
            rank, type: "person", id, count,
            title: p ? (p.name_ko || p.name) : `(D1에 없는 인물 #${id})`,
            url: `/person/${id}`,
          };
        }
        // 메인/OTT별/커뮤니티 페이지 — 고정된 이름/링크라 D1 조회 없이 바로 반환
        const meta = PAGE_META[r.type];
        return {
          rank, type: r.type, id: null, count,
          title: meta ? meta.title : r.type,
          url: meta ? meta.url : "#",
        };
      });

      return new Response(JSON.stringify({
        ok: true, items, page, limit, period, has_more: hasMore,
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  // ── GET /hot100/persons ────────────────────────────────────────
  // [2026-08-06 신규] 인물 핫100 전용 페이지(hot100-persons.html)가 쓰는 공개 API — 인증 불필요.
  // /admin/track/rank와 같은 Analytics Engine 집계 방식을 그대로 쓰되, blob1='person'만 걸러서
  // 조회하고(작품/메인/OTT 페이지는 아예 안 봄), 인물 프로필 사진까지 같이 내려줌.
  // 기본 기간은 1주일(week) — 관리자와 상의해서 확정한 기준(하루 단위 실시간 순위는 너무 흔들려서
  // 안정적인 주간 집계로 시작).
  if (path === "/hot100/persons" && request.method === "GET") {
    try {
      if (!env.CF_ACCOUNT_ID || !env.CF_AE_API_TOKEN) {
        return new Response(JSON.stringify({
          ok: false,
          message: "CF_ACCOUNT_ID / CF_AE_API_TOKEN 환경변수가 설정되지 않았어요 (Settings → Variables and Secrets 확인)",
        }), { status: 500, headers });
      }
      const periodParam = url.searchParams.get("period") || "week";
      const period = PERIOD_WHITELIST.includes(periodParam) ? periodParam : "week";
      const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10), 1), 100);

      const { sinceMs, untilMs } = _periodBounds(period);
      let whereSql = `blob1 = 'person' AND timestamp >= toDateTime('${_toSqlDatetime(sinceMs)}')`;
      if (untilMs != null) whereSql += ` AND timestamp < toDateTime('${_toSqlDatetime(untilMs)}')`;
      whereSql += ` AND blob4 != '1'`; // 봇 제외(/admin/track/rank와 동일 원칙)

      const { results: excludedRows } = await env.DB.prepare(
        "SELECT vid FROM excluded_vids"
      ).all();
      const excludedVids = excludedRows.map(r => r.vid).filter(v => /^[a-z0-9]{1,64}$/.test(v));
      if (excludedVids.length) {
        whereSql += ` AND blob3 NOT IN (${excludedVids.map(v => `'${v}'`).join(",")})`;
      }

      const sql = `
        SELECT blob2 AS ref_id, COUNT(DISTINCT blob3) AS cnt
        FROM ottrank_page_views
        WHERE ${whereSql}
        GROUP BY blob2
        ORDER BY cnt DESC
        LIMIT ${limit}
      `;
      const aeRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_AE_API_TOKEN}`,
            "Content-Type": "text/plain",
          },
          body: sql,
        }
      );
      if (!aeRes.ok) {
        const errText = await aeRes.text().catch(() => "");
        return new Response(JSON.stringify({
          ok: false,
          message: `Analytics Engine 조회 실패 (HTTP ${aeRes.status}): ${errText.slice(0, 300)}`,
        }), { status: 500, headers });
      }
      const aeJson = await aeRes.json();
      const rows = aeJson.data || [];

      const personIds = [...new Set(rows.map(r => parseInt(r.ref_id, 10)).filter(Number.isInteger))];
      const personMap = {};
      if (personIds.length) {
        const ph = personIds.map(() => "?").join(",");
        const { results } = await env.DB.prepare(
          `SELECT tmdb_id, name, name_ko, profile_path FROM persons WHERE tmdb_id IN (${ph})`
        ).bind(...personIds).all();
        results.forEach(p => { personMap[p.tmdb_id] = p; });
      }

      // D1에 없는(아직 한 번도 안 채워진) 인물 id는 목록에서 조용히 제외 — 이름/사진이 없으면
      // 화면에 보여줄 게 없어서, 관리자 화면(/admin/track/rank)과 달리 여긴 그냥 건너뜀.
      const data = rows
        .map(r => {
          const id = parseInt(r.ref_id, 10);
          const p = personMap[id];
          if (!p) return null;
          return {
            tmdb_id: id,
            name: p.name_ko || p.name || "",
            profile_path: p.profile_path || null,
            view_count: Math.round(Number(r.cnt) || 0),
          };
        })
        .filter(Boolean)
        .map((item, idx) => ({ hot_rank: idx + 1, ...item }));

      return new Response(JSON.stringify({ ok: true, data, period }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
    }
  }

  return null;
}
