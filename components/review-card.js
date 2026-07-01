/* ══════════════════════════════════════════════
   오뜨랑 리뷰 카드 공통 컴포넌트
   사용처: index.html / mypage.html / community.html

   카드 구조:
     rc-card
       └── rc-poster (aspect-ratio:2/3, overflow:visible)
             ├── rc-poster-bg  (배경 이미지)
             ├── rc-poster-ph  (이미지 없을 때 🎬)
             ├── rc-poster-fade (45%부터 그라디언트)
             ├── rc-platform-badge (좌상단 플랫폼)
             ├── rc-poster-score   (우상단 별점)
             └── rc-content (position:absolute, top:50% — 50%부터 시작, 내용 길면 포스터 밖으로 늘어남)
   ══════════════════════════════════════════════ */

const ReviewCard = (() => {

  /* ── API 베이스 — community.html/index.html/mypage.html의 API 상수와 동일한 값
     (좋아요 요청은 컴포넌트 내부에서 직접 처리하므로 별도로 고정해둠) ── */
  const LIKE_API = 'https://ottrank-api.tdidream.workers.dev';

  /* ── 플랫폼 색상 맵 ── */
  const PF_COLOR = {
    netflix:  '#e50914',
    tving:    '#ff153c',
    disney:   '#06b6d4',
    coupang:  '#1ac44d',
    wavve:    '#0070f3',
    boxoffice:'#f0b429',
  };

  /* ── 플랫폼 한글명 ── */
  const PF_LABEL = {
    netflix:  'Netflix',
    tving:    'Tving',
    disney:   'Disney+',
    coupang:  'Coupang',
    wavve:    'Wavve',
    boxoffice:'극장',
  };

  /* ── 별점 렌더링 (★½☆) ── */
  function renderStars(score) {
    const s     = parseFloat(score) || 0;
    const full  = Math.floor(s);
    const half  = (s - full) >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  /* ── 상대 시간 포맷 ── */
  function relTime(dateStr) {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60)    return '방금';
    if (diff < 3600)  return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  }

  /* ── XSS 방어 ── */
  function esc(str) {
    return (str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 단일 카드 HTML 생성 ── */
  function render(rv) {
    const nick      = esc(rv.nickname || '익명');
    const title     = esc(rv.title_ko || '작품명 미확인');
    const score     = parseFloat(rv.score) || 0;
    const scoreNum  = score ? (score * 2).toFixed(1).replace(/\.0$/, '') : '';
    const stars     = renderStars(score);
    const time      = relTime(rv.created_at);
    const pfColor   = PF_COLOR[rv.platform] || (rv.media_type === 'movie' ? '#f0b429' : '#e50914');
    const pfLabel   = PF_LABEL[rv.platform] || '';

    // 포스터 URL — w300 사용
    const posterUrl = rv.poster_path && rv.poster_path.includes('image.tmdb.org')
      ? rv.poster_path.replace('/w92/', '/w300/').replace('/w500/', '/w300/').replace('/w780/', '/w300/')
      : '';

    // 평가 태그
    const evalTags  = ['강추해요','추천해요','평범해요','별로예요'];
    const evalBadge = rv.evaluation && evalTags.includes(rv.evaluation)
      ? `<span class="rc-tag eval">${esc(rv.evaluation)}</span>`
      : '';

    // 감정 태그 (최대 2개)
    const emoTags = (rv.emotions || []).slice(0, 2)
      .map(e => `<span class="rc-tag emo">${esc(e)}</span>`)
      .join('');

    // 한줄 감상
    const bodyHtml = rv.body
      ? `<div class="rc-body">"${esc(rv.body)}"</div>`
      : `<div class="rc-body rc-body-empty">평점만 남긴 후기</div>`;

    // 닉네임 클릭 시 해당 유저의 리뷰 목록 페이지로 이동 (작품 클릭과 별개)
    const nickUrl   = rv.user_id ? `/my_review.html?uid=${rv.user_id}` : '#';
    const nickLabel = `${nick} 리뷰`;

    // 카드 클릭 시 작품 상세로 이동
    const clickFn = rv.tmdb_id
      ? `ReviewCard.goDetail(${rv.tmdb_id},'${rv.media_type||'tv'}','${title.replace(/'/g,'')}',1,'')`
      : '';

    // 좋아요 상태 (백엔드가 likes/liked_by_me를 안 내려주는 구버전 API 대비 기본값 처리)
    const likeCount = rv.likes || 0;
    const likedByMe = !!rv.liked_by_me;

    return `
<div class="rc-card" onclick="${clickFn}">
  <div class="rc-poster">

    <!-- 포스터 배경 이미지 or 플레이스홀더 -->
    ${posterUrl
      ? `<div class="rc-poster-bg" style="background-image:url('${posterUrl}')"></div>`
      : `<div class="rc-poster-ph">🎬</div>`
    }

    <!-- 포스터 45%부터 그라디언트 -->
    <div class="rc-poster-fade"></div>

    <!-- 좌상단 닉네임 뱃지 — 클릭 시 해당 유저 리뷰 목록 이동 -->
    <a class="rc-nick-badge" href="${nickUrl}"
       onclick="event.stopPropagation()">${nickLabel}</a>

    <!-- 우상단 좋아요 버튼 (숫자는 2개 이상일 때만 표시) -->
    <button type="button" class="rc-like-badge${likedByMe ? ' liked' : ''}"
       id="rc_like_${rv.id}" data-pending="0"
       onclick="event.stopPropagation();ReviewCard.toggleLike(${rv.id},${rv.tmdb_id},this)">
      <span class="rc-like-icon">${likedByMe ? '♥' : '♡'}</span>
      <span class="rc-like-count"${likeCount < 2 ? ' style="display:none"' : ''}>${likeCount}</span>
    </button>

    <!-- 콘텐츠 — 포스터 50% 지점에서 시작 -->
    <div class="rc-content">
      <div class="rc-title">${title}</div>
      <div class="rc-stars-row">
        <span class="rc-stars">${stars}</span>
        ${scoreNum ? `<span class="rc-score-num">${scoreNum}/10</span>` : ''}
      </div>
      <div class="rc-divider"></div>
      ${bodyHtml}
      ${(evalBadge || emoTags)
        ? `<div class="rc-tags">${evalBadge}${emoTags}</div>`
        : ''
      }
    </div>

  </div>
</div>`;
  }

  /* ── 그리드 전체 렌더링 ── */
  function renderGrid(reviews, gridId = 'reviewGrid') {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    if (!reviews?.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = reviews.map(rv => render(rv)).join('');
  }

  /* ── 스켈레톤 n개 표시 ── */
  function skeleton(gridId = 'reviewGrid', count = 5) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = Array.from({ length: count }).map(() => `
<div class="rc-card" style="pointer-events:none">
  <div class="rc-poster">
    <div class="rc-skel" style="position:absolute;inset:0;border-radius:0"></div>
    <div class="rc-poster-fade"></div>
    <div class="rc-content">
      <div class="rc-skel" style="height:18px;width:75%"></div>
      <div class="rc-skel" style="height:13px;width:50%"></div>
      <div class="rc-divider"></div>
      <div class="rc-skel" style="height:13px;width:90%"></div>
      <div class="rc-skel" style="height:13px;width:70%"></div>
      <div class="rc-footer">
        <div class="rc-skel" style="height:12px;width:40%"></div>
        <div class="rc-skel" style="height:10px;width:22%"></div>
      </div>
    </div>
  </div>
</div>`).join('');
  }

  /* ── 작품 상세 + 유저 리뷰 섹션으로 이동 ── */
  function goDetail(tmdbId, type, title, season, year) {
    if (typeof goDetailReview === 'function') {
      goDetailReview(tmdbId, type, title, season, year);
      return;
    }
    const slug = `${title.replace(/[^\w가-힣]/g, '-').toLowerCase()}-${tmdbId}`;
    location.href = `/${type === 'movie' ? 'movie' : 'tv'}/${slug}#userReviews`;
  }

  /* ── 좋아요 뱃지 화면 갱신 ── */
  function _applyLikeUI(id, liked, likes) {
    const btn = document.getElementById('rc_like_' + id);
    if (!btn) return;
    btn.classList.toggle('liked', liked);
    const icon  = btn.querySelector('.rc-like-icon');
    if (icon) icon.textContent = liked ? '♥' : '♡';
    const count = btn.querySelector('.rc-like-count');
    if (count) {
      count.textContent = likes;
      count.style.display = likes < 2 ? 'none' : '';
    }
  }

  /* ── 좋아요 토글 (낙관적 업데이트 + 연타 방지 + 실패 시 롤백) ──
     _title_detail.html의 likeComment()와 동일한 패턴 ── */
  async function toggleLike(reviewId, tmdbId, btnEl) {
    if (!reviewId || !tmdbId) return;

    // 비로그인 시 로그인 페이지로 이동
    const sid = localStorage.getItem('ottrang_sid');
    if (!sid) {
      location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search);
      return;
    }

    const btn = btnEl || document.getElementById('rc_like_' + reviewId);
    if (btn) {
      if (btn.dataset.pending === '1') return; // 응답 오기 전 중복 클릭 방지
      btn.dataset.pending = '1';
    }

    const wasLiked = btn?.classList.contains('liked') || false;
    const countEl  = btn?.querySelector('.rc-like-count');
    const prevLikes = parseInt(countEl?.textContent || '0', 10) || 0;

    // 클릭 즉시 화면부터 토글 (낙관적 업데이트)
    const optimisticLiked = !wasLiked;
    const optimisticLikes = prevLikes + (optimisticLiked ? 1 : -1);
    _applyLikeUI(reviewId, optimisticLiked, optimisticLikes);

    try {
      const res  = await fetch(`${LIKE_API}/reviews/${tmdbId}/like/${reviewId}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sid },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        _applyLikeUI(reviewId, wasLiked, prevLikes); // 롤백
        return;
      }
      // 서버가 내려준 최종 값으로 동기화
      _applyLikeUI(reviewId, !!data.liked, data.likes);
    } catch (e) {
      _applyLikeUI(reviewId, wasLiked, prevLikes); // 네트워크 오류 — 롤백
    } finally {
      if (btn) btn.dataset.pending = '0';
    }
  }

  /* ── public API ── */
  return { render, renderGrid, skeleton, goDetail, renderStars, relTime, toggleLike };

})();
