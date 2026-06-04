/* ══════════════════════════════════════════════════════════════
   오뜨랑 Worker 진입점
   - CORS 처리
   - 경로별 라우트 모듈 위임
   - 404 처리

   라우트 모듈 목록:
   rankings.js  : /rankings/*, /latest-date, /platforms
   videos.js    : /videos/*, /imdb/*, /youtube/*, /works/*, /kmrb/*
   reactions.js : /reactions/*, /admin/reactions*
   auth.js      : /auth/*
   user.js      : /wishlist/*, /reviews/*, /mypage/*, /user/*, /grade-settings
   posts.js     : /posts/*
   admin.js     : /admin/* (reactions 제외)
   trailers.js  : /trailers/*, /admin/trailers*
══════════════════════════════════════════════════════════════ */

import { handleRankings  } from "./routes/rankings.js";
import { handleVideos    } from "./routes/videos.js";
import { handleReactions } from "./routes/reactions.js";
import { handleAuth      } from "./routes/auth.js";
import { handleUser      } from "./routes/user.js";
import { handlePosts     } from "./routes/posts.js";
import { handleAdmin     } from "./routes/admin.js";
import { handleTrailers  } from "./routes/trailers.js";

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

    // 1. 예고편 게시판 (신규)
    if (path.startsWith("/trailers") || path.startsWith("/admin/trailers")) {
      res = await handleTrailers(path, request, env, url, headers);
    }

    // 2. 인증
    if (!res && path.startsWith("/auth/")) {
      res = await handleAuth(path, request, env, headers);
    }

    // 3. 랭킹
    if (!res && (
      path.startsWith("/rankings") ||
      path === "/latest-date" ||
      path === "/platforms"
    )) {
      res = await handleRankings(path, request, env, url, headers);
    }

    // 4. 영상 / IMDb / YouTube / works / kmrb
    if (!res && (
      path.startsWith("/videos/") ||
      path.startsWith("/admin/videos") ||
      path.startsWith("/imdb/") ||
      path.startsWith("/youtube/") ||
      path.startsWith("/works/") ||
      path.startsWith("/kmrb/")
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

    // 6. 유저 활동 (찜/후기/마이페이지/등급)
    if (!res && (
      path.startsWith("/wishlist") ||
      path.startsWith("/reviews") ||
      path.startsWith("/mypage") ||
      path.startsWith("/user/") ||
      path === "/grade-settings"
    )) {
      res = await handleUser(path, request, env, ctx, headers);
    }

    // 7. 게시판
    if (!res && path.startsWith("/posts")) {
      res = await handlePosts(path, request, env, ctx, url, headers);
    }

    // 8. 관리자 (reactions, videos, trailers 제외한 나머지)
    if (!res && path.startsWith("/admin/")) {
      res = await handleAdmin(path, request, env, url, headers);
    }

    // 9. 404
    if (!res) {
      res = new Response(
        JSON.stringify({ ok: false, message: "Not found" }),
        { status: 404, headers }
      );
    }

    return res;
  },
};
