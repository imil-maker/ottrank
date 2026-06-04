/* ══════════════════════════════════════════════════════════════
   공통 인증 유틸리티
   - _checkAuth      : ADMIN_SECRET Bearer 토큰 검증
   - _getSessionCookie : 쿠키에서 세션 ID 추출
   - _recalcGrade    : 회원 활동 기반 등급 자동 재계산
══════════════════════════════════════════════════════════════ */

/** 관리자 토큰 검증 */
export function _checkAuth(request, env) {
  const auth  = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token === env.ADMIN_SECRET;
}

/** 쿠키에서 session ID 추출 */
export function _getSessionCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match  = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

/** 회원 등급 자동 재계산
 *  - 평점 + 게시글 수, 찜 수, 받은 좋아요 기준
 *  - is_special 등급(연출부 등)은 건드리지 않음
 */
export async function _recalcGrade(userId, env) {
  try {
    const user = await env.DB.prepare(
      "SELECT grade, total_likes_received FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!user) return;

    // 특별 등급이면 자동계산 안 함
    const currentGrade = await env.DB.prepare(
      "SELECT is_special FROM grade_settings WHERE grade_key = ?"
    ).bind(user.grade || "rookie").first();
    if (currentGrade?.is_special) return;

    // 활동 집계
    const reviewCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM reviews WHERE user_id = ?"
    ).bind(userId).first();
    const postCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM posts WHERE user_id = ?"
    ).bind(userId).first();
    const wishlistCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM wishlist WHERE user_id = ?"
    ).bind(userId).first();

    const activityCount = (reviewCountRow?.cnt || 0) + (postCountRow?.cnt || 0);
    const wishlistCount = wishlistCountRow?.cnt || 0;
    const likesReceived = user.total_likes_received || 0;

    // 일반 등급 목록 (sort_order 내림차순 = 높은 등급부터)
    const { results: grades } = await env.DB.prepare(
      "SELECT * FROM grade_settings WHERE is_special = 0 ORDER BY sort_order DESC"
    ).all();

    let newGrade = "rookie";
    for (const g of grades) {
      const ok =
        activityCount >= (g.min_reviews  || 0) &&
        wishlistCount >= (g.min_wishlist || 0) &&
        likesReceived >= (g.min_likes    || 0);
      if (ok) { newGrade = g.grade_key; break; }
    }

    if (newGrade !== user.grade) {
      await env.DB.prepare(
        "UPDATE users SET grade = ? WHERE id = ?"
      ).bind(newGrade, userId).run();
    }
  } catch (e) {
    console.error("[GRADE]", e.message);
  }
}
