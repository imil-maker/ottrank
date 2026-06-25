/* ══════════════════════════════════════════════
   오뜨랑 리뷰 카드 공통 컴포넌트
   사용처: index.html / mypage.html / community.html

   사용법:
     // 그리드 전체 렌더링
     ReviewCard.renderGrid(reviews, 'reviewGrid');

     // 단일 카드 HTML 반환
     const html = ReviewCard.render(review);
     
     // 스켈레톤 n개 생성
     ReviewCard.skeleton('reviewGrid', 5);
   ══════════════════════════════════════════════ */

const ReviewCard = (() => {

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

  /* ── 단일 카드 HTML 생성 ──
     rv: {
       tmdb_id, media_type, title_ko, platform, poster_path,
       score, evaluation, emotions, body, nickname, created_at
     }
     구조:
       rc-card (aspect-ratio:2/3, position:relative)
         └── rc-poster (position:absolute, inset:0)
               ├── rc-poster-bg  (배경 이미지)
               ├── rc-poster-ph  (이미지 없을 때)
               ├── rc-poster-fade (50%부터 그라디언트)
               ├── rc-platform-badge (좌상단 플랫폼)
               ├── rc-poster-score   (우상단 별점)
               └── rc-content (position:absolute, top:50%, 오버레이)
  ── */
  function render(rv) {
    const nick      = esc(rv.nickname || '익명');
    const title     = esc(rv.title_ko || '작품명 미확인');
    const score     = parseFloat(rv.score) || 0;
    const scoreNum  = score ? (score * 2).toFixed(1).replace(/\.0$/, '') : '';
    const stars     = renderStars(score);
    const time      = relTime(rv.created_at);
    const pfColor   = PF_COLOR[rv.platform] || (rv.media_type === 'movie' ? '#f0b429' : '#e50914');
    const pfLabel   = PF_LABEL[rv.platform] || '';

    // 포스터 URL — w300 사용 (200~300px 카드에 충분)
    const posterUrl = rv.poster_path && rv.poster_path.includes('image.tmdb.org')
      ? rv.poster_path.replace('/w92/', '/w300/').replace('/w500/', '/w300/').replace('/w780/', '/w300/')
      : '';

    // 평가 태그
    const evalTags = ['강추해요','추천해요','평범해요','별로예요'];
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

    // 클릭 시 작품 상세 → 유저 리뷰 섹션으로 이동
    const clickFn = rv.tmdb_id
      ? `ReviewCard.goDetail(${rv.tmdb_id},'${rv.media_type||'tv'}','${title.replace(/'/g,'')}',1,'')`
      : '';

    return `
<div class="rc-card" onclick="${clickFn}">
  <div class="rc-poster">

    <!-- 포스터 배경 이미지 or 플레이스홀더 -->
    ${posterUrl
      ? `<div class="rc-poster-bg" style="background-image:url('${posterUrl}')"></div>`
      : `<div class="rc-poster-ph">🎬</div>`
    }

    <!-- 50% 지점부터 하단까지 그라디언트 -->
    <div class="rc-poster-fade"></div>

    <!-- 좌상단 플랫폼 뱃지 -->
    ${pfLabel ? `<div class="rc-platform-badge" style="background:${pfColor}">${pfLabel}</div>` : ''}

    <!-- 우상단 별점 -->
    ${scoreNum ? `<div class="rc-poster-score">★ ${scoreNum}</div>` : ''}

    <!-- 콘텐츠 오버레이 (포스터 하단 50% 위치) -->
    <div class="rc-content">

      <!-- 작품명 -->
      <div class="rc-title">${title}</div>

      <!-- 별점 -->
      <div class="rc-stars-row">
        <span class="rc-stars">${stars}</span>
        ${scoreNum ? `<span class="rc-score-num">${scoreNum}/10</span>` : ''}
      </div>

      <div class="rc-divider"></div>

      <!-- 한줄 감상 -->
      ${bodyHtml}

      <!-- 태그 -->
      ${(evalBadge || emoTags)
        ? `<div class="rc-tags">${evalBadge}${emoTags}</div>`
        : ''
      }

      <!-- 푸터: 닉네임 + 시간 -->
      <div class="rc-footer">
        <span class="rc-nick">${nick}</span>
        <span class="rc-time">${time}</span>
      </div>

    </div><!-- /rc-content -->

  </div><!-- /rc-poster -->
</div>`;
  }

  /* ── 그리드 전체 렌더링 ──
     reviews: 리뷰 배열
     gridId:  대상 DOM id (기본값 'reviewGrid')
  ── */
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
      <div class="rc-skel" style="height:14px;width:90%"></div>
      <div class="rc-skel" style="height:14px;width:70%"></div>
      <div class="rc-footer">
        <div class="rc-skel" style="height:13px;width:40%"></div>
        <div class="rc-skel" style="height:11px;width:22%"></div>
      </div>
    </div>
  </div>
</div>`).join('');
  }

  /* ── 작품 상세 + 유저 리뷰 섹션으로 이동 ── */
  function goDetail(tmdbId, type, title, season, year) {
    // goDetailReview가 전역에 있으면 사용, 없으면 직접 구현
    if (typeof goDetailReview === 'function') {
      goDetailReview(tmdbId, type, title, season, year);
      return;
    }
    // 폴백: 직접 작품 상세 URL로 이동
    const slug = `${title.replace(/[^\w가-힣]/g, '-').toLowerCase()}-${tmdbId}`;
    location.href = `/${type === 'movie' ? 'movie' : 'tv'}/${slug}#userReviews`;
  }

  /* ── public API ── */
  return { render, renderGrid, skeleton, goDetail, renderStars, relTime };

})();
