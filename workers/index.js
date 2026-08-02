/* 2026-08-03 rev.13 — index.js (/admin/persons/sns-links* 라우팅 추가 — 인물 SNS 링크
   관리자 API가 12번 관리자 캐치올로 잘못 넘어가서 404 나는 것 방지, admin-persons.js로 위임) */
/* 2026-08-02 rev.12 — index.js (버그수정: 시즌 관리 라우팅이 /admin/works/backfill-season만
   걸려있어서 season-search/season-apply/season-alerts가 실제로는 연결 안 돼 있던 문제 수정.
   /admin/works/season-*까지 조건 확장) */
/* 2026-08-02 rev.11 — index.js (시즌 관리 라우팅 신규: /admin/works/backfill-season*
   — handleAdminSeason으로 위임, admin-season.js 신규 파일. 자동 시즌포스터 배치 첫 단계) */
/* 2026-08-02 rev.10 — index.js (박스오피스 이미지 업로드 라우팅 신규: /admin/boxoffice/*
   — handleBoxofficeAdmin으로 위임, boxoffice-admin.js 신규 파일. KOBIS 자동크롤러 연속
   실패 대비 수동 업로드 기능) */
/* 2026-07-31 rev.9 — index.js (필모그래피 수동 추가 라우팅 신규: /admin/persons/manual-credit*
   (관리자), /person-manual-credits/:id(공개) — handleAdminPersonManualCredits로 위임,
   admin-persons.js에 신설된 별도 함수) */
/* 2026-07-31 rev.8 — index.js (/admin/persons/videos* 라우팅 추가 — 인물 관련 영상 관리자
   API가 12번 관리자 캐치올로 잘못 넘어가서 "Not found"(404) 나던 문제 수정,
   admin-persons.js로 위임) */
/* 2026-07-29 rev.7 — index.js (대표이미지(custom_profile_path) 라우팅 추가: 관리자 업로드/조회/삭제 +
   공개 조회. admin-persons.js에 신설된 handleAdminPersonProfileImage/handlePersonCustomProfilePublic 위임) */
/* 2026-07-29 rev.6 — index.js (/person-featured-works/:id 공개 조회 라우팅 추가 — person.html
   대표작 실제 화면 반영용, admin-persons.js로 위임) */
/* 2026-07-29 rev.5 — index.js (/admin/persons/featured-works* 라우팅 추가 — 대표작 매칭 기능이
   404 나던 문제 수정, mbti-naver와 동일 파일 admin-persons.js로 위임) */
/* 2026-07-27 rev.4 — index.js (/admin/persons/mbti-naver-* 라우팅 추가 — admin-persons.js 신규 파일) */
/* ══════════════════════════════════════════════════════════════
   오뜨랑 Worker 진입점
   - CORS 처리
   - 경로별 라우트 모듈 위임
   - 404 처리

   라우트 모듈 목록:
   rankings.js  : /rankings/*, /latest-date, /platforms, /sitemap.xml
   videos.js    : /videos/*, /imdb/*, /youtube/*, /works/*(search,exists 제외), /kmrb/*, /search/*
   search.js    : /works/search, /works/exists, /works/ott-map, /works/details, /search-log, /persons/search  (2026-07-15 videos.js에서 분리, 2026-07-18 ott-map/details/search-log 추가, 2026-07-21 persons/search 추가)
   reactions.js : /reactions/*, /admin/reactions*
   auth.js      : /auth/*
   user.js      : /wishlist/*, /reviews/*, /mypage/*, /user/*, /grade-settings, /life-works/*, /pick-lists/*
   posts.js     : /posts/*
   admin.js     : /admin/* (reactions, videos, contents 제외)
   contents.js  : /contents/*, /admin/contents*
   blog.js      : /blog-gen/*
   inquiry.js   : /inquiry, /admin/inquiry*  (광고문의/오류신고 게시판)
   hot100.js    : /hot100, /admin/calc-hot100, /admin/hot100/boosts*, /admin/hot100/frontend-tabs*,
                  /admin/hot100/backfill-logos*  (HOT100 통합 랭킹 + 히어로 로고 백필)
   image-proxy.js : /tmdb-img/*  (TMDB 포스터 캐싱 프록시, poster.ottrank.kr, 2026-07-17 신설)
   person-wiki.js : /person-wiki/*  (인물 위키백과 보강 데이터, 테스트용, 2026-07-19 신설)
   track.js     : /track/view, /admin/track/logs, /admin/track/rank  (작품/인물 페이지 실시간 조회 이벤트 기록·조회 +
                  기간별 실시간 순위, 2026-07-21 신설, 2026-07-23 순위 라우트 추가)
   relationship.js : /admin/relationship-charts/*  (등장인물 관계도 — 공식 이미지 업로드, 2026-07-25 신설)
   admin-persons.js : /admin/persons/mbti-naver-*  (네이버 검색 기반 MBTI 수집 — admin.js와 별도,
                  인물 관련 신규 어드민 기능은 앞으로 여기 모음, 2026-07-27 신설)
   boxoffice-admin.js : /admin/boxoffice/*  (박스오피스 캡처 이미지 업로드 — KOBIS 자동크롤러
                  실패 대비 수동 반영, 2026-08-02 신설)
══════════════════════════════════════════════════════════════ */

import { handleRankings  } from "./routes/rankings.js";
import { handleVideos    } from "./routes/videos.js";
import { handleSearch    } from "./routes/search.js";
import { handleReactions } from "./routes/reactions.js";
import { handleAuth      } from "./routes/auth.js";
import { handleUser      } from "./routes/user.js";
import { handlePosts     } from "./routes/posts.js";
import { handleAdmin     } from "./routes/admin.js";
import { handleContents  } from "./routes/contents.js";
import { handleBlog      } from "./routes/blog.js";
import { handleInquiry   } from "./routes/inquiry.js";
import { handleImageProxy } from "./routes/image-proxy.js";
import { handlePersonWiki } from "./routes/person-wiki.js";
import { handleTrack      } from "./routes/track.js";
import { handleRelationship } from "./routes/relationship.js";
import { handleAdminPersons, handleAdminPersonProfileImage, handlePersonCustomProfilePublic, handleAdminPersonManualCredits } from "./routes/admin-persons.js";
import { handleBoxofficeAdmin } from "./routes/boxoffice-admin.js";
import { handleAdminSeason } from "./routes/admin-season.js";
import {
  calcHot100, getHot100,
  listAdminBoosts, searchWorksForBoost,
  upsertAdminBoost, deleteAdminBoost,
  listFrontendTabs, updateFrontendTab,
  getHeroTabs,
  backfillHeroLogos, getBackfillLogoStatus,
  listHot100PageDisplay, updateHot100PageDisplay, getHot100PageDisplay,
} from "./routes/hot100.js";

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const origin = request.headers.get("Origin") || "https://ottrank.kr";

    // ── CORS 허용 도메인 ─────────────────────────────────────
    const allowedOrigins = [
      "https://ottrank.kr",
      "http://localhost:8788",
      "http://localhost:3000",
    ];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "https://ottrank.kr";

    const headers = {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Credentials": "true",
    };

    // ── CORS preflight ────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin":  corsOrigin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ── 라우팅 ────────────────────────────────────────────────
    // 순서 중요: 더 구체적인 경로를 앞에 배치

    let res = null;

    // 0. TMDB 포스터 이미지 프록시(poster.ottrank.kr) — 이미지 바이너리를 그대로 반환해야
    //    해서, 다른 라우트가 공유하는 JSON용 headers를 안 쓰고 여기서 바로 반환하고 끝냄
    //    (다른 라우트와 경로가 겹칠 일이 없어 맨 앞에 둬도 안전)
    if (path.startsWith("/tmdb-img/")) {
      return await handleImageProxy(path, request, env, ctx);
    }

    // 1. OTT 콘텐츠 게시판 (예고편/신작, trailers → contents 대체)
    if (path.startsWith("/contents") || path.startsWith("/admin/contents")) {
      res = await handleContents(path, request, env, url, headers);
    }

    // 2. 인증
    if (!res && path.startsWith("/auth/")) {
      res = await handleAuth(path, request, env, headers);
    }

    // 3. 랭킹 (사이트맵 포함)
    if (!res && (
      path.startsWith("/rankings") ||
      path === "/latest-date" ||
      path === "/platforms" ||
      path === "/sitemap.xml"
    )) {
      res = await handleRankings(path, request, env, url, headers);
    }

    // 3-1. 검색 (search.js) — 4번 videos.js의 "/works/" 캐치올보다 반드시 앞에 있어야 함
    //      (안 그러면 handleVideos로 먼저 잡혀서 이 라우트에 도달 못 함)
    if (!res && (
      path === "/works/search" ||
      path === "/works/exists" ||
      path === "/works/ott-map" ||
      path === "/works/details" ||
      path === "/search-log" ||
      path === "/persons/search"
    )) {
      res = await handleSearch(path, request, env, url, headers);
    }

    // 3-2. 인물 위키백과 보강 데이터 (테스트용, 2026-07-19 신규)
    if (!res && path.startsWith("/person-wiki")) {
      res = await handlePersonWiki(path, request, env, url, headers);
    }

    // 3-3. 실시간 조회 이벤트 기록·조회 (작품/인물 페이지 조회 — 2026-07-21 신규,
    //      2026-07-23 실시간 순위 /admin/track/rank 추가)
    //      /admin/track/logs, /admin/track/rank는 12번 관리자 캐치올(handleAdmin)보다 반드시
    //      앞에 있어야 함 (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남 — 다른 /admin/* 예외 라우트들과 동일 패턴)
    if (!res && (
      path === "/track/view" ||
      path === "/admin/track/logs" ||
      path === "/admin/track/rank" ||
      path.startsWith("/admin/track/excluded-vids")
    )) {
      res = await handleTrack(path, request, env, url, headers);
    }

    // 3-4. 등장인물 관계도 (공식 이미지 업로드) — 2026-07-25 신규
    //      /admin/relationship-charts/*는 12번 관리자 캐치올(handleAdmin)보다 반드시 앞에 있어야 함
    //      (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남 — track.js/inquiry.js와 동일 패턴)
    //      /relationship-charts/:tmdb_id (공개 조회, 작품페이지용, 2026-07-25 추가)는 인증 없이도 통과되도록
    //      handleRelationship 안에서 자체적으로 구분함(경로가 /admin/으로 시작 안 해서 그냥 여기서 같이 처리).
    if (!res && (
      path.startsWith("/admin/relationship-charts") ||
      path.match(/^\/relationship-charts\/\d+$/)
    )) {
      res = await handleRelationship(path, request, env, url, headers);
    }

    // 3-5. 인물(persons) 관련 신규 어드민 기능 — admin.js와 별도 파일(2026-07-27 신규)
    //      /admin/persons/mbti-naver-*, /admin/persons/featured-works*, /admin/persons/videos*는
    //      12번 관리자 캐치올(handleAdmin)보다 반드시 앞에 있어야 함(안 그러면 handleAdmin으로
    //      잘못 넘어가서 404가 남 — track.js/relationship.js와 동일 패턴, 2026-07-29 대표작
    //      매칭 기능 추가하며 동일 문제 재발 확인 후 조건 확장, 2026-07-31 관련영상 기능
    //      추가하며 동일 문제 재재발 확인 후 조건 재확장)
    if (!res && (
      path.startsWith("/admin/persons/mbti-naver") ||
      path.startsWith("/admin/persons/featured-works") ||
      path.startsWith("/admin/persons/videos") ||
      path.startsWith("/admin/persons/sns-links")
    )) {
      res = await handleAdminPersons(path, request, env, url, headers);
    }

    // 3-6. 대표작(featured works) 공개 조회 — person.html에서 비로그인 방문자도 호출하는
    //      공개 API(인증 없음). /admin/으로 시작 안 해서 12번 캐치올과는 원래 안 겹치지만,
    //      다른 라우트가 먼저 잡아채지 않도록 위와 같은 자리에 명시적으로 둠(2026-07-29 신규)
    if (!res && path.match(/^\/person-featured-works\/\d+$/)) {
      res = await handleAdminPersons(path, request, env, url, headers);
    }

    // 3-7. 인물 대표이미지(custom_profile_path) — 관리자 업로드/조회/삭제.
    //      /admin/persons/:id/profile-image는 12번 관리자 캐치올보다 반드시 앞에 있어야 함
    //      (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남, 2026-07-29 신규)
    if (!res && path.match(/^\/admin\/persons\/\d+\/profile-image$/)) {
      res = await handleAdminPersonProfileImage(path, request, env, headers);
    }

    // 3-8. 인물 대표이미지 공개 조회 — person.html에서 비로그인 방문자도 호출(2026-07-29 신규)
    if (!res && path.match(/^\/person-custom-profile\/\d+$/)) {
      res = await handlePersonCustomProfilePublic(path, request, env, headers);
    }

    // 3-9. 필모그래피 수동 추가(person_manual_credits) — 관리자용. handleAdminPersons와
    //      별도 함수(handleAdminPersonManualCredits)라 여기서 새로 라우팅해야 함. 12번
    //      관리자 캐치올보다 반드시 앞에 있어야 함(2026-07-31 신규)
    if (!res && path.startsWith("/admin/persons/manual-credit")) {
      res = await handleAdminPersonManualCredits(path, request, env, url, headers);
    }

    // 3-10. 필모그래피 수동 추가 공개 조회 — person.html에서 비로그인 방문자도 호출
    //       (인증 없음, 2026-07-31 신규)
    if (!res && path.match(/^\/person-manual-credits\/\d+$/)) {
      res = await handleAdminPersonManualCredits(path, request, env, url, headers);
    }

    // 3-11. 박스오피스 캡처 이미지 업로드(KOBIS 자동크롤러 실패 대비 수동 반영) — 2026-08-02 신규
    //       /admin/boxoffice/*는 12번 관리자 캐치올(handleAdmin)보다 반드시 앞에 있어야 함
    //       (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남 — track.js/relationship.js와 동일 패턴)
    if (!res && path.startsWith("/admin/boxoffice/")) {
      res = await handleBoxofficeAdmin(path, request, env, url, headers);
    }

    // 3-12. 시즌 관리(자동배치/관리자지정/알림) — /admin/works/backfill-season,
    //       /admin/works/season-search, /admin/works/season-apply, /admin/works/season-alerts
    //       2026-08-02 신규, rev.12에서 season-* 경로 누락 수정(원래 backfill-season만 걸려있었음)
    //       12번 관리자 캐치올(handleAdmin)보다 반드시 앞에 있어야 함
    //       (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남 — boxoffice-admin.js와 동일 패턴)
    if (!res && (
      path.startsWith("/admin/works/backfill-season") ||
      path.startsWith("/admin/works/season-")
    )) {
      res = await handleAdminSeason(path, request, env, url, headers);
    }

    // 4. 영상 / IMDb / YouTube / works / kmrb / 키워드 검색
    if (!res && (
      path.startsWith("/videos/") ||
      path.startsWith("/admin/videos") ||
      path.startsWith("/imdb/") ||
      path.startsWith("/youtube/") ||
      path.startsWith("/works/") ||
      path.startsWith("/kmrb/") ||
      path.startsWith("/search/")
    )) {
      res = await handleVideos(path, request, env, ctx, url, headers);
    }

    // 5. 반응 (admin/reactions 포함)
    if (!res && (
      path.startsWith("/reactions") ||
      path.startsWith("/admin/reactions")
    )) {
      res = await handleReactions(path, request, env, ctx, headers);
    }

    // 6. 유저 활동 (찜/후기/마이페이지/등급/인생작품/추천작품)
    //    /admin/reviews도 여기 포함 — 관리자 캐치올(handleAdmin)보다 앞에서 가로채야
    //    reviews 스키마를 이미 알고 있는 handleUser로 정확히 라우팅됨
    if (!res && (
      path.startsWith("/wishlist") ||
      path.startsWith("/reviews") ||
      path.startsWith("/mypage") ||
      path.startsWith("/user/") ||
      path === "/grade-settings" ||
      path.startsWith("/life-works") ||
      path.startsWith("/pick-lists") ||
      path.startsWith("/admin/reviews")
    )) {
      res = await handleUser(path, request, env, ctx, headers);
    }

    // 7. 게시판
    if (!res && path.startsWith("/posts")) {
      res = await handlePosts(path, request, env, ctx, url, headers);
    }

    // 8. 블로그 포스팅 자동 생성 (관리자 전용)
    if (!res && path.startsWith("/blog-gen")) {
      res = await handleBlog(path, request, env, url, headers);
    }

    // 9. OTT 보러가기 수동 오버라이드 (GET은 인증 불필요, POST/DELETE는 admin.js에서 인증)
    if (!res && path.startsWith("/work-ott")) {
      res = await handleAdmin(path, request, env, url, headers);
    }

    // 10. 문의/신고 게시판 (광고문의/오류신고) — /admin/inquiry는 10번 뒤 관리자 캐치올보다
    //     반드시 앞에 있어야 함 (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남)
    if (!res && (
      path === "/inquiry" ||
      path.startsWith("/admin/inquiry")
    )) {
      res = await handleInquiry(path, request, env, ctx, url, headers);
    }

    // 11. HOT100 통합 랭킹 (계산은 관리자 전용, 조회는 공개)
    //     /admin/calc-hot100은 12번 관리자 캐치올보다 반드시 앞에 있어야 함
    //     (안 그러면 handleAdmin으로 잘못 넘어가서 404가 남)
    if (!res && path === "/admin/calc-hot100") {
      res = await calcHot100(request, env, headers);
    }
    if (!res && path === "/hot100") {
      res = await getHot100(request, env, headers);
    }
    if (!res && path === "/hot100/hero-tabs") {
      res = await getHeroTabs(request, env, headers);
    }

    // 11-1. HOT100 수동 부스트 관리 (search가 :tmdb_id 패턴보다 앞에 있어야 함)
    if (!res && path === "/admin/hot100/boosts/search" && request.method === "GET") {
      res = await searchWorksForBoost(request, env, headers);
    }
    if (!res && path === "/admin/hot100/boosts" && request.method === "GET") {
      res = await listAdminBoosts(request, env, headers);
    }
    if (!res && path === "/admin/hot100/boosts" && request.method === "POST") {
      res = await upsertAdminBoost(request, env, headers);
    }
    const boostDeleteMatch = path.match(/^\/admin\/hot100\/boosts\/(\d+)$/);
    if (!res && boostDeleteMatch && request.method === "DELETE") {
      res = await deleteAdminBoost(parseInt(boostDeleteMatch[1], 10), request, env, headers);
    }

    // 11-2. HOT100 프론트엔드 구성(메인페이지 히어로 캐러셀 탭 설정)
    if (!res && path === "/admin/hot100/frontend-tabs" && request.method === "GET") {
      res = await listFrontendTabs(request, env, headers);
    }
    const frontendTabMatch = path.match(/^\/admin\/hot100\/frontend-tabs\/([a-z]+)$/);
    if (!res && frontendTabMatch && request.method === "PATCH") {
      res = await updateFrontendTab(frontendTabMatch[1], request, env, headers);
    }

    // 11-3. HOT100 히어로 로고 백필 (2026-07-12 추가)
    //       /status가 :platform 같은 동적 패턴이 아니라 고정 경로라 순서는 상관없지만,
    //       12번 관리자 캐치올보다는 반드시 앞에 있어야 함(안 그러면 404)
    if (!res && path === "/admin/hot100/backfill-logos" && request.method === "POST") {
      res = await backfillHeroLogos(request, env, headers);
    }
    if (!res && path === "/admin/hot100/backfill-logos/status" && request.method === "GET") {
      res = await getBackfillLogoStatus(request, env, headers);
    }

    // 11-4. HOT100 페이지 노출 설정 (메인페이지/인물페이지에 캐러셀 노출할지) — 2026-07-12 추가
    if (!res && path === "/admin/hot100/page-display" && request.method === "GET") {
      res = await listHot100PageDisplay(request, env, headers);
    }
    const pageDisplayMatch = path.match(/^\/admin\/hot100\/page-display\/([a-z]+)$/);
    if (!res && pageDisplayMatch && request.method === "PATCH") {
      res = await updateHot100PageDisplay(pageDisplayMatch[1], request, env, headers);
    }
    if (!res && path === "/hot100/page-display" && request.method === "GET") {
      res = await getHot100PageDisplay(request, env, headers);
    }

    // 12. 관리자 (reactions, videos, contents, inquiry, hot100 제외한 나머지)
    if (!res && path.startsWith("/admin/")) {
      res = await handleAdmin(path, request, env, url, headers);
    }

    // 13. 404
    if (!res) {
      res = new Response(
        JSON.stringify({ ok: false, message: "Not found" }),
        { status: 404, headers }
      );
    }

    return res;
  },
};
