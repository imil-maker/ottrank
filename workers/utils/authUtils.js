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

/** 오뜨 포인트 적립/차감 + 레벨 자동 재계산
 *  @param {number} userId - 유저 ID
 *  @param {number} points - 적립(+) 또는 차감(-) 포인트
 *  @param {string} reason - 적립 사유 (signup, mbti_register, review, share 등)
 *  @param {object} env   - Cloudflare env (env.DB 포함)
 */
export async function _addOttPoints(userId, points, reason, env) {
  try {
    // 1. 내역 로그 기록
    await env.DB.prepare(
      "INSERT INTO user_point_logs (user_id, points, reason) VALUES (?, ?, ?)"
    ).bind(userId, points, reason).run();

    // 2. users.ott_points 캐시 업데이트 (0 미만으로 내려가지 않도록)
    await env.DB.prepare(
      "UPDATE users SET ott_points = MAX(0, COALESCE(ott_points, 0) + ?) WHERE id = ?"
    ).bind(points, userId).run();

    // 3. 레벨 자동 재계산
    await _recalcGrade(userId, env);
    return true;
  } catch (e) {
    console.error("[_addOttPoints] 오류:", e.message);
    return false;
  }
}

/** 오뜨 포인트 기준 등급 자동 재계산
 *  - users.ott_points 기준으로 grade_settings.min_ott_points 비교
 *  - is_special 등급(관리자 수동 지정)은 건드리지 않음
 */
export async function _recalcGrade(userId, env) {
  try {
    const user = await env.DB.prepare(
      "SELECT grade, ott_points FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!user) return;

    // 특별 등급이면 자동계산 안 함
    const currentGrade = await env.DB.prepare(
      "SELECT is_special FROM grade_settings WHERE grade_key = ?"
    ).bind(user.grade || "rookie").first();
    if (currentGrade?.is_special) return;

    // 오뜨 포인트 기준으로 달성 가능한 가장 높은 등급 조회
    const { results: grades } = await env.DB.prepare(
      `SELECT grade_key FROM grade_settings
       WHERE is_special = 0 AND min_ott_points <= ?
       ORDER BY min_ott_points DESC LIMIT 1`
    ).bind(user.ott_points || 0).all();

    const newGrade = grades[0]?.grade_key || null;
    if (newGrade && newGrade !== user.grade) {
      await env.DB.prepare(
        "UPDATE users SET grade = ? WHERE id = ?"
      ).bind(newGrade, userId).run();
    }
  } catch (e) {
    console.error("[GRADE]", e.message);
  }
}
