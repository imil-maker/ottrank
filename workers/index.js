/* ══════════════════════════════════════════════════════════════
   오뜨랑 Worker 진입점
   - CORS 처리
   - 경로별 라우트 모듈 위임
   - 404 처리

   라우트 모듈 목록:
   rankings.js  : /rankings/*, /latest-date, /platforms, /sitemap.xml
   videos.js    : /videos/*, /imdb/*, /youtube/*, /works/*, /kmrb/*, /search/*
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
══════════════════════════════════════════════════════════════ */

import { handleRankings  } from "./routes/rankings.js";
import { handleVideos    } from "./routes/videos.js";
import { handleReactions } from "./routes/reactions.js";
import { handleAuth      } from "./routes/auth.js";
import { handleUser      } from "./routes/user.js";
import { handlePosts     } from "./routes/posts.js";
import { handleAdmin     } from "./routes/admin.js";
import { handleContents  } from "./routes/contents.js";
import { handleBlog      } from "./routes/blog.js";
import { handleInquiry   } from "./routes/inquiry.js";
import {
  calcHot100, getHot100,
  listAdminBoosts, searchWorksForBoost,
  upsertAdminBoost, deleteAdminBoost,
  listFrontendTabs, updateFrontendTab,
  getHeroTabs,
  backfillHeroLogos, getBackfillLogoStatus,
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
