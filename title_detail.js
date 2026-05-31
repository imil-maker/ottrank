/* title_detail.js — 오뜨랑 작품 상세 페이지 로직 */

/* == Constants == */
const TMDB_PROXY='https://tmdb-proxy.tdidream.workers.dev/tmdb';
const OTTRANK_API='https://ottrank-api.tdidream.workers.dev';
const IMG='https://image.tmdb.org/t/p/w500';
const IMG_BACKDROP='https://image.tmdb.org/t/p/w1280';
const IMG_PROFILE='https://image.tmdb.org/t/p/w185';
const IMG_STILL='https://image.tmdb.org/t/p/w780';
const PC={netflix:'넷플릭스',tving:'티빙',disney:'디즈니+',coupang:'쿠팡플레이',wavve:'웨이브',boxoffice:'박스오피스'};
const CC={netflix:'#e50914',tving:'#ff153c',disney:'#06b6d4',coupang:'#1ac44d',wavve:'#0070f3',boxoffice:'#888'};
const OTT_SEARCH_URL={
  netflix :(t)=>`https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  tving   :(t)=>`https://www.tving.com/search?keyword=${encodeURIComponent(t)}`,
  disney  :(t)=>`https://www.disneyplus.com/ko-kr/search`,
  coupang :(t)=>`https://www.coupangplay.com/search?q=${encodeURIComponent(t)}`,
  wavve   :(t)=>`https://www.wavve.com/search?keyword=${encodeURIComponent(t)}`,
  boxoffice:(t)=>`https://www.cgv.co.kr/search/?query=${encodeURIComponent(t)}`,
};
const ETAG_EMOJI={'긴장감 넘침':'😰','몰입감 최고':'🔥','감동적':'🥹','슬프다':'😭','재미있음':'🤣','결말이 아쉬움':'😤','독특한 설정':'🤯','정주행 필수':'📺','연기력 최고':'👏','소름 돋음':'😱','지루했어요':'💤','설레는 로맨스':'💕'};
const COUNTRY_MAP={'KR':'한국','US':'미국','JP':'일본','GB':'영국','FR':'프랑스','DE':'독일','CN':'중국','TH':'태국','IN':'인도','IT':'이탈리아','ES':'스페인','AU':'호주','CA':'캐나다','MX':'멕시코','TW':'대만'};
const CERT_MAP={'ALL':'전체관람가','12':'12세이상','15':'15세이상','18':'청소년관람불가','G':'전체관람가','PG':'PG','PG-13':'13세이상','R':'17세이상','TV-Y':'전체','TV-G':'전체','TV-PG':'보호자지도','TV-14':'14세이상','TV-MA':'성인','NR':'등급없음'};

/* == Header Inject == */
(function(){
  const el=document.getElementById('ottrang-header');
  if(!el)return;
  fetch('/header.html')
    .then(r=>r.ok?r.text():Promise.reject())
    .then(h=>{
      el.innerHTML=h;
      el.querySelectorAll('script').forEach(s=>{
        const ns=document.createElement('script');ns.textContent=s.textContent;document.body.appendChild(ns);
      });
      if(typeof initHeader==='function')initHeader();
    }).catch(()=>{});
})();

/* == URL Parse == */
function parseSlug(pathname){
  const slug=pathname.replace(/^\/title\/?/,'').replace(/\.html$/,'');
  if(!slug)return null;
  const m=slug.match(/-(\d+)$/);
  if(!m)return null;
  const numStr=m[1];
  let season=1,year=new Date().getFullYear(),tmdb_id=null;
  if(numStr.length>=6){
    for(let sLen=1;sLen<=2;sLen++){
      const s=parseInt(numStr.slice(0,sLen));
      const y=parseInt(numStr.slice(sLen,sLen+4));
      const tid=numStr.slice(sLen+4);
      if(tid.length>=1&&y>=1900&&y<=2100&&s>=1){season=s;year=y;tmdb_id=parseInt(tid);break;}
    }
  }
  return{tmdb_id,season,year,titleSlug:slug.slice(0,m.index)};
}

/* == WORK Init == */
let WORK={tmdb_id:null,type:'tv',platform:'netflix',rank:'—',title:'작품명',season:1,year:null};
(function initWork(){
  try{
    const stored=sessionStorage.getItem('ottrang_work');
    if(stored){const d=JSON.parse(stored);if(d&&d.tmdb_id){Object.assign(WORK,d);sessionStorage.removeItem('ottrang_work');return;}}
  }catch(e){}
  const storedSlug=sessionStorage.getItem('ottrang_slug')||'';
  for(const p of [location.pathname,storedSlug]){
    if(!p||!p.includes('/title/'))continue;
    const parsed=parseSlug(p);
    if(parsed&&parsed.tmdb_id){
      WORK.tmdb_id=parsed.tmdb_id;WORK.season=parsed.season;WORK.year=parsed.year;
      WORK.title=decodeURIComponent(parsed.titleSlug.replace(/-/g,' '))||'작품명';
      sessionStorage.removeItem('ottrang_slug');return;
    }
  }
  const params=new URLSearchParams(location.search);
  WORK.tmdb_id=params.get('tmdb_id')?parseInt(params.get('tmdb_id')):null;
  WORK.type=params.get('type')||'tv';
  WORK.platform=params.get('platform')||'netflix';
  WORK.rank=params.get('rank')||'—';
  WORK.title=params.get('title')||'작품명';
  if(!WORK.tmdb_id&&document.referrer){
    try{
      const refUrl=new URL(document.referrer);
      if(refUrl.pathname.startsWith('/title/')){
        const parsed=parseSlug(refUrl.pathname);
        if(parsed&&parsed.tmdb_id){Object.assign(WORK,{tmdb_id:parsed.tmdb_id,season:parsed.season,year:parsed.year});WORK.title=decodeURIComponent(parsed.titleSlug.replace(/-/g,' '))||'작품명';}
      }
    }catch(e){}
  }
})();

/* == State == */
let myStars=0,curSort='latest',curPage=1;
const PER_PAGE=5;
let selectedEval='';
const REVIEW_API=OTTRANK_API;
let ALL_COMMENTS=[],MY_REVIEW=null;
let allYtVideos=[],ytPage=0;
const YT_PER_PAGE=3;
let _wishlisted=false;

/* == SEO == */
function updateSEO(title,overview,posterUrl,platform,rank){
  const t=title||WORK.title,pName=PC[platform]||platform||'OTT';
  const seoT=`${t} 평점·후기·해외반응 | ${pName} ${rank}위 | 오뜨랑`;
  const seoD=`${t} ${pName} ${rank}위. 사용자 평점, 한줄 후기, 해외반응을 오뜨랑에서 확인하세요.`;
  const s=WORK.season||1,y=WORK.year||(new Date().getFullYear()),tid=WORK.tmdb_id||'';
  const slug=`${s}-${y}${tid}`;
  const canonical=`https://ottrank.kr/title/${slug}`;
  document.title=seoT;
  setMeta('seoTitle','textContent',seoT);setMeta('seoDesc','content',seoD);
  setMeta('seoOgTitle','content',seoT);setMeta('seoOgDesc','content',seoD);setMeta('seoOgUrl','content',canonical);
  setMeta('seoTwTitle','content',seoT);setMeta('seoTwDesc','content',seoD);
  const canon=document.getElementById('seoCanonical');if(canon)canon.href=canonical;
  if(tid&&slug){
    const targetUrl=`/title/${slug}`;
    if(location.pathname!==targetUrl)history.replaceState(null,'',targetUrl);
    sessionStorage.setItem('ottrang_slug',targetUrl);
    sessionStorage.setItem('ottrang_work',JSON.stringify({tmdb_id:WORK.tmdb_id,type:WORK.type,platform:WORK.platform,rank:WORK.rank,title:WORK.title,season:WORK.season,year:WORK.year}));
  }
  if(posterUrl){const ogImg=`https://image.tmdb.org/t/p/w780${posterUrl}`;setMeta('seoOgImg','content',ogImg);setMeta('seoTwImg','content',ogImg);}
  const ld={'@context':'https://schema.org','@type':'TVSeries','name':t,'description':overview||seoD,'url':canonical};
  if(posterUrl)ld.image=`https://image.tmdb.org/t/p/w780${posterUrl}`;
  const ldEl=document.getElementById('ldJson');if(ldEl)ldEl.textContent=JSON.stringify(ld);
}
function setMeta(id,attr,val){const el=document.getElementById(id);if(!el)return;if(attr==='textContent')el.textContent=val;else el.setAttribute(attr,val);}

/* == Rank Row == */
function renderRankRow(){
  const row=document.getElementById('heroRankRow');if(!row)return;
  const rankVal=WORK.rank&&WORK.rank!=='—'&&WORK.rank!=='0'?WORK.rank:null;
  // boxoffice는 "박스오피스 ?위" 표시
  if(rankVal&&WORK.platform){
    const chip=document.createElement('span');
    chip.className='rank-info-chip chip-rank';
    chip.innerHTML=`<i class="ti ti-flame" style="font-size:11px"></i>${PC[WORK.platform]||WORK.platform} ${rankVal}위`;
    row.appendChild(chip);
  }
}

/* == Top10 Days == */
let WORK_CATEGORY_SLOT = null; // boxoffice category01 여부 판단용

async function loadTop10Days(){
  if(!WORK.tmdb_id)return;
  try{
    const res=await fetch(`${OTTRANK_API}/rankings/history?tmdb_id=${WORK.tmdb_id}`);
    const data=await res.json();
    if(data.ok&&data.data&&data.data.length){
      // category_slot 저장 (가장 최근 데이터 기준)
      const latest=data.data[data.data.length-1];
      if(latest&&latest.category_slot){WORK_CATEGORY_SLOT=latest.category_slot;}
      const days=new Set(data.data.map(r=>r.date)).size;
      if(days>0){
        const row=document.getElementById('heroRankRow');
        if(row){
          const chip=document.createElement('span');
          chip.className='rank-info-chip chip-top10';
          chip.innerHTML=`<i class="ti ti-chart-bar" style="font-size:11px"></i>${days}일간 TOP 10`;
          row.appendChild(chip);
        }
      }
    }
  }catch(e){}
}

/* ══ 수동 랭킹 배지 ══ */
async function loadManualBadges(){
  if(!WORK.tmdb_id)return;
  try{
    const res=await fetch(`${OTTRANK_API}/rankings/manual/${WORK.tmdb_id}`);
    const data=await res.json();
    if(data.ok&&data.data&&data.data.length){
      const row=document.getElementById('heroRankRow');if(!row)return;
      data.data.forEach(d=>{
        const label=d.display_name||d.category_slot;
        const chip=document.createElement('span');
        chip.className='rank-info-chip chip-manual';
        chip.innerHTML=`🏆 ${label} ${d.rank||''}위${d.memo?' · '+d.memo:''}`;
        row.appendChild(chip);
      });
    }
  }catch(e){}
}

/* == Gallery == */
async function loadGallery(){
  if(!WORK.tmdb_id)return;
  try{
    const res=await fetch(`${TMDB_PROXY}/${WORK.type}/${WORK.tmdb_id}/images`);
    const data=await res.json();
    const backdrops=(data.backdrops||[]).slice(0,4);
    if(!backdrops.length)return;
    document.getElementById('gallerySection').style.display='block';
    document.getElementById('galleryGrid').innerHTML=backdrops.map(img=>`
      <div class="gallery-item" onclick="window.open('${IMG_STILL}${img.file_path}','_blank')">
        <img src="${IMG_STILL}${img.file_path}" alt="작품 이미지" loading="lazy">
      </div>`).join('');
  }catch(e){}
}

/* == Watch Guide (boxoffice only) == */
async function loadWatchGuide(){
  if(WORK.platform!=='boxoffice'||!WORK.tmdb_id||!WORK.title)return;
  try{
    const res=await fetch(`${OTTRANK_API}/kmrb/${WORK.tmdb_id}?title_ko=${encodeURIComponent(WORK.title)}`);
    const data=await res.json();
    if(!data.ok||!data.data)return;
    const d=data.data;
    const gradeEl=document.getElementById('watchGradeLabel');
    if(gradeEl&&d.watch_grade)gradeEl.textContent=d.watch_grade;
    const items=[
      {key:'subject',  label:'주제',     emoji:'📖'},
      {key:'sexuality',label:'선정성',   emoji:'🔞'},
      {key:'violence', label:'폭력성',   emoji:'⚔️'},
      {key:'language', label:'대사',     emoji:'💬'},
      {key:'horror',   label:'공포',     emoji:'😱'},
      {key:'drug',     label:'약물',     emoji:'💊'},
      {key:'imitation',label:'모방위험', emoji:'⚠️'},
    ];
    const levelClass=(val)=>{
      if(!val||val==='없음'||val==='해당없음')return'none';
      if(val.includes('12세'))return'low';
      if(val.includes('15세'))return'mid';
      return'high';
    };
    const hasAny=items.some(i=>d[i.key]);
    if(!hasAny)return;
    document.getElementById('watchGuideGrid').innerHTML=items.map(i=>`
      <div class="wg-item">
        <div class="wg-emoji">${i.emoji}</div>
        <div class="wg-label">${i.label}</div>
        <span class="wg-level ${levelClass(d[i.key])}">${d[i.key]||'없음'}</span>
      </div>`).join('');
    document.getElementById('watchGuideSection').style.display='block';
    document.getElementById('wgOuter').style.display='flex';
    // 극장 연결 — boxoffice category01 (주간 박스오피스 현재 상영중)일 때만
    const isCategory01=WORK_CATEGORY_SLOT==='category01'||(WORK.rank&&WORK.rank!=='—'&&WORK.rank!=='0'&&WORK_CATEGORY_SLOT===null);
    if(isCategory01){
      const t=WORK.title;
      document.getElementById('watchNowBtns').innerHTML=[
        `<a class="watch-now-btn" href="https://www.cgv.co.kr/search/?query=${encodeURIComponent(t)}" target="_blank" rel="noopener">🎬 CGV</a>`,
        `<a class="watch-now-btn" href="https://www.lottecinema.co.kr/NLCHS/Movie/MovieList#/Search/${encodeURIComponent(t)}" target="_blank" rel="noopener">🎬 롯데시네마</a>`,
        `<a class="watch-now-btn" href="https://www.megabox.co.kr/movie?searchText=${encodeURIComponent(t)}" target="_blank" rel="noopener">🎬 메가박스</a>`,
      ].join('');
      document.getElementById('watchNowBox').style.display='block';
    }
  }catch(e){}
}

/* == TMDB Load (parallel) == */
async function loadTmdb(){
  if(!WORK.tmdb_id){
    document.getElementById('heroLoading').style.display='none';
    document.getElementById('heroContent').classList.add('visible');
    updateSEO(WORK.title,'',null,WORK.platform,WORK.rank);
    initWish(WORK.tmdb_id);return;
  }
  try{
    // ① works + TMDB 기본정보 병렬 조회
    const [worksRes, detTv, detMovie] = await Promise.allSettled([
      fetch(`${OTTRANK_API}/works/${WORK.tmdb_id}`).then(r=>r.json()).catch(()=>null),
      fetch(`${TMDB_PROXY}/tv/${WORK.tmdb_id}?language=ko-KR`).then(r=>r.json()).catch(()=>null),
      fetch(`${TMDB_PROXY}/movie/${WORK.tmdb_id}?language=ko-KR`).then(r=>r.json()).catch(()=>null),
    ]);

    // Extract media_type + title_en from works
    let worksData=null;
    if(worksRes.status==='fulfilled'&&worksRes.value?.ok){
      worksData=worksRes.value.data;
      if(worksData?.media_type)WORK.type=worksData.media_type;
    }

    // Select valid TV/Movie
    let det=null;
    const tvData=detTv.status==='fulfilled'?detTv.value:null;
    const movieData=detMovie.status==='fulfilled'?detMovie.value:null;

    if(WORK.type==='movie'){
      det=movieData?.id?movieData:(tvData?.id?tvData:null);
      if(det&&det===tvData)WORK.type='tv';
    }else{
      det=tvData?.id?tvData:(movieData?.id?movieData:null);
      if(det&&det===movieData)WORK.type='movie';
    }

    if(!det){
      document.getElementById('heroLoading').style.display='none';
      document.getElementById('heroContent').classList.add('visible');
      return;
    }

    // Render basic info immediately
    const title=worksData?.title_ko||det.name||det.title||WORK.title;
    // English title: works DB first, fallback TMDB
    const origTitle=worksData?.title_en||det.original_name||det.original_title||'';
    const year=(det.release_year||(det.first_air_date||det.release_date||'').slice(0,4))||'';
    const season=det.number_of_seasons||1;
    WORK.title=title;WORK.season=season;
    WORK.year=year||WORK.year||new Date().getFullYear();
    WORK.type=WORK.type||(det.number_of_seasons?'tv':'movie');

    // backdrop
    if(det.backdrop_path){
      const bdImg=document.getElementById('backdropImg');
      bdImg.src=IMG_BACKDROP+det.backdrop_path;
      bdImg.onload=()=>bdImg.classList.add('loaded');
      bdImg.style.display='block';
    }else if(det.poster_path){
      const bdImg=document.getElementById('backdropImg');
      bdImg.src=IMG+det.poster_path;bdImg.style.display='block';
      bdImg.style.filter='blur(20px) scale(1.1)';bdImg.style.opacity='.4';
      bdImg.classList.add('loaded');
    }

    // poster
    if(det.poster_path){
      const img=document.getElementById('posterImg');
      img.src=IMG+det.poster_path;img.alt=title;img.style.display='block';
      document.getElementById('posterPh').style.display='none';
    }

    // platform pill
    if(PC[WORK.platform]){
      const pill=document.getElementById('platformPill');
      pill.textContent=PC[WORK.platform];
      pill.style.background=CC[WORK.platform]||'#888';
      pill.style.display='block';
      const fn=OTT_SEARCH_URL[WORK.platform];
      if(fn)pill.href=fn(title);
    }

    // title/orig/genre
    document.getElementById('mainTitle').textContent=title;
    const countries=det.production_countries||det.origin_country||[];
    let countryStr='';
    if(Array.isArray(countries)&&countries.length){
      countryStr=countries.slice(0,2).map(c=>{const code=typeof c==='string'?c:(c.iso_3166_1||'');return COUNTRY_MAP[code]||code;}).filter(Boolean).join(' · ');
    }
    document.getElementById('origTitle').textContent=[origTitle,countryStr,year].filter(Boolean).join(' · ');

    const genreStr=det.genre||'';
    const genres=det.genres||(genreStr?genreStr.split(',').map(g=>({name:g.trim()})):[]);
    document.getElementById('genreTags').innerHTML=genres.map(g=>`<span class="hero-tag">${g.name||g}</span>`).join('');

    // TMDB rating
    const tmdbRating=det.tmdb_rating||det.vote_average||0;
    const tmdbVotes=det.vote_count||0;
    document.getElementById('tmdbScore').textContent=tmdbRating?parseFloat(tmdbRating).toFixed(1):'—';
    document.getElementById('tmdbVotes').textContent=tmdbVotes?`${tmdbVotes.toLocaleString()}명`:'—';

    // overview
    document.getElementById('overview').textContent=det.overview||'줄거리 정보가 없습니다.';

    // SEO + wish + rank row
    updateSEO(title,det.overview||'',det.poster_path,WORK.platform,WORK.rank);
    initWish(WORK.tmdb_id);
    renderRankRow();

    // Show hero immediately
    document.getElementById('heroLoading').style.display='none';
    document.getElementById('heroContent').classList.add('visible');

    // Parallel API calls after hero shown
    const [creditsRes, videosRes, ratingsRes, extIdsRes] = await Promise.allSettled([
      fetch(`${TMDB_PROXY}/${WORK.type}/${WORK.tmdb_id}/credits?language=ko-KR`).then(r=>r.json()),
      fetch(`${TMDB_PROXY}/${WORK.type}/${WORK.tmdb_id}/videos?language=ko-KR`).then(r=>r.json()),
      fetch(`${TMDB_PROXY}/${WORK.type}/${WORK.tmdb_id}/${det.number_of_seasons?'content_ratings':'release_dates'}?language=ko-KR`).then(r=>r.json()),
      fetch(`${TMDB_PROXY}/${WORK.type}/${WORK.tmdb_id}/external_ids`).then(r=>r.json()),
    ]);

    // Meta info
    let ratingHtml='';
    if(ratingsRes.status==='fulfilled'){
      const rData=ratingsRes.value;let cert='';
      if(det.number_of_seasons){
        const results=rData.results||[];
        const kr=results.find(r=>r.iso_3166_1==='KR');const us=results.find(r=>r.iso_3166_1==='US');
        cert=kr?.rating||us?.rating||'';
      }else{
        const results=rData.results||[];
        const kr=results.find(r=>r.iso_3166_1==='KR');const us=results.find(r=>r.iso_3166_1==='US');
        cert=kr?.release_dates?.find(d=>d.certification)?.certification||us?.release_dates?.find(d=>d.certification)?.certification||'';
      }
      if(cert)ratingHtml=`<span class="hero-meta-sep">·</span><span class="hero-meta-item">🔞 <b>${CERT_MAP[cert]||cert}</b></span>`;
    }
    const seasHtml=det.number_of_seasons?`<span class="hero-meta-item">시즌 <b>${det.number_of_seasons}</b></span><span class="hero-meta-sep">·</span>`:'';
    let episodeHtml='';
    if(det.number_of_episodes)episodeHtml=`<span class="hero-meta-item">총 <b>${det.number_of_episodes}부작</b></span><span class="hero-meta-sep">·</span>`;
    else if(det.runtime)episodeHtml=`<span class="hero-meta-item"><b>${det.runtime}분</b></span><span class="hero-meta-sep">·</span>`;
    const dateRaw=det.first_air_date||det.release_date||'';
    let dateHtml='';
    if(dateRaw){const d=new Date(dateRaw);const days=['일','월','화','수','목','금','토'];dateHtml=`<span class="hero-meta-item">개봉 <b>${dateRaw.replace(/-/g,'.')} (${days[d.getDay()]})</b></span>`;}
    document.getElementById('metaRow').innerHTML=`${seasHtml}${episodeHtml}${dateHtml}${ratingHtml}`;

    // Credits
    if(creditsRes.status==='fulfilled'){
      const cr=creditsRes.value;
      const tmdbPersonUrl='https://www.themoviedb.org/person/';
      const directors=(cr.crew||[]).filter(p=>p.job==='Director'||p.department==='Directing').slice(0,3);
      const cast=(cr.cast||[]).slice(0,12);
      if(directors.length||cast.length){
        document.getElementById('castSection').style.display='block';
        document.getElementById('directorRow').innerHTML=directors.map(p=>`
          <a class="director-chip" href="${tmdbPersonUrl}${p.id}" target="_blank" rel="noopener">
            <div class="director-photo">${p.profile_path?`<img src="${IMG_PROFILE}${p.profile_path}" alt="${p.name}" loading="lazy">`:`<div class="director-photo-ph">${(p.name||'?')[0]}</div>`}</div>
            <div><div class="director-name">${p.name}</div><div class="director-label">감독</div></div>
          </a>`).join('');
        document.getElementById('castScroll').innerHTML=cast.map(p=>`
          <a class="cast-card" href="${tmdbPersonUrl}${p.id}" target="_blank" rel="noopener">
            <div class="cast-photo">
              ${p.profile_path?`<img src="${IMG_PROFILE}${p.profile_path}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:''}
              <div class="cast-photo-ph" style="${p.profile_path?'display:none':'display:flex'}">${(p.name||'?')[0]}</div>
            </div>
            <div class="cast-name">${p.name}</div>
            <div class="cast-role">${p.character||''}</div>
          </a>`).join('');
      }
    }

    // Videos
    if(videosRes.status==='fulfilled'){
      let videos=videosRes.value?.results||[];
      if(!videos.length){
        try{
          const vEn=await fetch(`${TMDB_PROXY}/${WORK.type}/${WORK.tmdb_id}/videos?language=en-US`);
          videos=(await vEn.json()).results||[];
        }catch(e){}
      }
      const ytVideos=videos.filter(v=>v.site==='YouTube');
      allYtVideos=[...ytVideos.filter(v=>v.type==='Trailer'||v.type==='Teaser'),...ytVideos.filter(v=>v.type!=='Trailer'&&v.type!=='Teaser')];
      renderYtPage(0);
    }

    // IMDb
    if(extIdsRes.status==='fulfilled'&&extIdsRes.value?.imdb_id){
      const imdbId=extIdsRes.value.imdb_id;
      const imdbCard=document.getElementById('imdbScore').closest('.r-card');
      imdbCard.style.cursor='pointer';
      imdbCard.onclick=()=>window.open(`https://www.imdb.com/title/${imdbId}/`,'_blank');
      fetch(`${OTTRANK_API}/imdb/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdb_id:WORK.tmdb_id,imdb_id:imdbId})}).catch(()=>{});
      try{
        const omdbData=await fetch(`${OTTRANK_API}/imdb/${imdbId}`).then(r=>r.json());
        if(omdbData.ok&&omdbData.rating){
          document.getElementById('imdbScore').textContent=omdbData.rating;
          document.getElementById('imdbVotes').textContent=omdbData.votes?omdbData.votes.replace(/,/g,'')+' 명':'';
        }else{
          document.getElementById('imdbScore').innerHTML='<span style="font-size:20px">↗</span>';
          document.getElementById('imdbVotes').innerHTML='<span style="font-size:10px;color:#F5C518">IMDb 보기</span>';
        }
      }catch(e){}
    }

    // Gallery (lazy)
    loadGallery();

  }catch(e){
    console.error('[loadTmdb]',e);
    document.getElementById('heroLoading').style.display='none';
    document.getElementById('heroContent').classList.add('visible');
  }
}

/* == Load DB Videos == */
async function loadTitleVideos(){
  if(!WORK.tmdb_id)return;
  try{
    const res=await fetch(`${OTTRANK_API}/videos/${WORK.tmdb_id}`);
    const data=await res.json();
    if(data.ok&&data.data&&data.data.length){
      // DB videos take priority over TMDB
      const dbVideos=data.data.map(v=>({
        key:v.youtube_id,
        name:v.title||'관련 영상',
        type:'Clip',
        site:'YouTube',
        is_main:v.is_main,
      }));
      // Main video first
      dbVideos.sort((a,b)=>b.is_main-a.is_main);
      allYtVideos=[...dbVideos,...allYtVideos.filter(v=>!dbVideos.find(d=>d.key===v.key))];
      renderYtPage(0);
    }
  }catch(e){}
}

/* == YouTube Render == */
function renderYtPage(page){
  ytPage=page;
  const total=allYtVideos.length;
  if(!total){document.getElementById('ytArea').innerHTML='';document.getElementById('ytSubtitle').textContent='';return;}
  document.getElementById('ytSubtitle').textContent=`${total}개 영상`;
  const slice=allYtVideos.slice(page*YT_PER_PAGE,(page+1)*YT_PER_PAGE);
  document.getElementById('ytArea').innerHTML=`
    <div id="ytModal2" class="modal-wrap">
      <div class="modal-head"><span class="modal-ttl" id="ytModalTitle2"></span><button class="modal-close" onclick="closePlayer2()">✕</button></div>
      <div class="yt-player-wrap"><iframe id="ytFrame2" src="" allowfullscreen allow="autoplay;encrypted-media"></iframe></div>
    </div>
    <div class="yt-grid">${slice.map(v=>`
      <div class="yt-card${allYtVideos.indexOf(v)===0?' yt-featured':''}" onclick="openPlayer2('${v.key}','${(v.name||'').replace(/'/g,"\\'")}')">
        <div class="yt-thumb">
          <img src="https://img.youtube.com/vi/${v.key}/mqdefault.jpg" alt="${v.name||''}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="yt-thumb-ph" style="display:none"><i class="ti ti-brand-youtube" style="font-size:26px"></i></div>
          <div class="yt-play"><div class="yt-play-icon"><i class="ti ti-player-play" style="font-size:13px"></i></div></div>
          ${(v.type==='Trailer'||v.type==='Teaser')?`<div class="yt-badge">${v.type}</div>`:''}
        </div>
        <div class="yt-info"><div class="yt-title">${v.name||''}</div><div class="yt-meta"><span>${v.type||''}</span></div></div>
      </div>`).join('')}</div>`;

  const totalPages=Math.ceil(total/YT_PER_PAGE);
  const pgEl=document.getElementById('ytPagination');
  if(totalPages<=1){pgEl.style.display='none';return;}
  pgEl.style.display='flex';
  pgEl.innerHTML=Array.from({length:totalPages},(_,i)=>`<button class="yt-pg-btn${i===page?' on':''}" onclick="renderYtPage(${i})">${i+1}</button>`).join('');
}
function openPlayer2(id,title){
  document.getElementById('ytModalTitle2').textContent=title;
  document.getElementById('ytFrame2').src=`https://www.youtube.com/embed/${id}?autoplay=1`;
  document.getElementById('ytModal2').classList.add('show');
  document.getElementById('ytModal2').scrollIntoView({behavior:'smooth',block:'start'});
}
function closePlayer2(){document.getElementById('ytFrame2').src='';document.getElementById('ytModal2').classList.remove('show');}

/* == Feeling Buttons == */
function feelingClick(val){
  const sid=localStorage.getItem('ottrang_sid');
  if(!sid){location.href='/login.html?redirect='+encodeURIComponent(location.pathname);return;}
  goReview(0,val);
}

/* == Comments == */
function setSort(t){curSort=t;document.getElementById('sortLatest').classList.toggle('on',t==='latest');document.getElementById('sortLikes').classList.toggle('on',t==='likes');curPage=1;renderComments();}
function getSorted(){const a=[...ALL_COMMENTS];if(curSort==='likes')a.sort((a,b)=>b.likes-a.likes);else a.sort((a,b)=>b.id-a.id);return a;}
function renderHalfStars(score){let h='';for(let i=1;i<=5;i++){if(score>=i)h+=`<span class="c-star">★</span>`;else if(score>=i-0.5)h+=`<span class="c-star" style="position:relative;display:inline-block;overflow:hidden;width:.7em">★</span>`;else h+=`<span class="c-star off">★</span>`;}return h;}

function renderComments(){
  const el=document.getElementById('commentsArea');
  const sorted=getSorted();
  document.getElementById('commentCount').textContent=`${sorted.length}개`;
  // 댓글 0개면 섹션 전체 숨김
  const commentSection=document.getElementById('commentSection');
  if(commentSection)commentSection.style.display=sorted.length?'block':'none';
  if(!sorted.length){
    document.getElementById('pagination').innerHTML='';return;
  }
  const start=(curPage-1)*PER_PAGE,slice=sorted.slice(start,start+PER_PAGE);
  el.innerHTML=`<div class="comments-section">${slice.map(c=>`
    <div class="comment-item" id="cmt_${c.id}">
      <div class="comment-header">
        <div class="avatar" onclick="showProfile('${c.user}')">${c.init}</div>
        <div style="flex:1;min-width:0"><div class="c-name-wrap" onclick="showProfile('${c.user}')"><span class="c-name">${c.user}</span></div><div class="c-stars">${renderHalfStars(c.score)}</div></div>
        <span class="c-time">${c.time}</span>
      </div>
      ${c.spoiler?'<span class="sp-badge" style="display:inline-block;margin-bottom:8px">⚠ 스포일러</span>':''}
      <div class="c-text">${c.text}</div>
      <div class="c-footer">
        <span class="c-like" onclick="likeComment('${c.id}')"><i class="ti ti-heart" style="font-size:11px;vertical-align:-1px"></i> <span id="like_cmt_${c.id}">${c.likes}</span></span>
        <button class="c-share" onclick="shareComment('${c.id}','${c.user.replace(/'/g,"\\'")}')">🔗 이 후기 공유</button>
        ${c.emotions.map(e=>`<span class="c-ebadge">${ETAG_EMOJI[e]||''}${e}</span>`).join('')}
        ${c.isMe?`<button class="c-delete-btn" onclick="deleteMyReview(${c.id})">삭제</button>`:''}
      </div>
    </div>`).join('')}</div>`;
  renderPagination();
}

async function likeComment(id){
  const c=ALL_COMMENTS.find(x=>x.id===id);if(!c)return;
  try{await fetch(`${REVIEW_API}/reviews/${WORK.tmdb_id}/like/${id}`,{method:'POST'});c.likes++;const el=document.getElementById('like_cmt_'+id);if(el)el.textContent=c.likes;}catch(e){}
}
function shareComment(id,user){
  const url=`${getShareUrl()}#cmt_${id}`;
  if(navigator.share)navigator.share({title:`${WORK.title} 후기 | 오뜨랑`,text:`오뜨랑에서 "${WORK.title}" ${user}님의 후기를 확인해보세요!`,url}).catch(()=>{});
  else navigator.clipboard.writeText(url).then(()=>showToast('후기 링크가 복사됐어요!'));
}
function renderPagination(){
  const total=Math.ceil(ALL_COMMENTS.length/PER_PAGE);
  if(total<=1){document.getElementById('pagination').innerHTML='';return;}
  let html=`<button class="pg-btn" onclick="goPage(${curPage-1})" ${curPage===1?'disabled':''}>‹</button>`;
  const pages=total<=7?Array.from({length:total},(_,i)=>i+1):[1,...(curPage>3?['…']:[]),...Array.from({length:3},(_,i)=>Math.max(2,curPage-1)+i).filter(p=>p>1&&p<total),...(curPage<total-2?['…']:[]),total];
  pages.forEach(p=>p==='…'?html+=`<span class="pg-dots">···</span>`:html+=`<button class="pg-btn${p===curPage?' on':''}" onclick="goPage(${p})">${p}</button>`);
  html+=`<button class="pg-btn" onclick="goPage(${curPage+1})" ${curPage===total?'disabled':''}>›</button>`;
  document.getElementById('pagination').innerHTML=html;
}
function goPage(p){const t=Math.ceil(ALL_COMMENTS.length/PER_PAGE);if(p<1||p>t)return;curPage=p;renderComments();document.getElementById('commentsArea').scrollIntoView({behavior:'smooth',block:'start'});}

/* == Share == */
function getShareUrl(){const s=WORK.season||1,y=WORK.year||new Date().getFullYear(),tid=WORK.tmdb_id||'';return`https://ottrank.kr/title/${s}-${y}${tid}`;}
function shareNative(){
  const url=getShareUrl();const title=document.getElementById('mainTitle').textContent||WORK.title;
  if(navigator.share)navigator.share({title:`${title} | 오뜨랑`,text:`"${title}" OTT 평점·후기를 오뜨랑에서 확인해보세요!`,url}).catch(()=>{});
  else navigator.clipboard.writeText(url).then(()=>showToast('링크가 복사됐어요!'));
}
function showToast(msg){const t=document.getElementById('shareToast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}

/* == Go Review Page == */
function goReview(starVal,evalPreset){
  const sid=localStorage.getItem('ottrang_sid');
  if(!sid){location.href='/login.html?redirect='+encodeURIComponent(location.pathname);return;}
  const reviewData={
    tmdb_id:WORK.tmdb_id,type:WORK.type,platform:WORK.platform,
    title:WORK.title,season:WORK.season,year:WORK.year,rank:WORK.rank,
    poster_path:document.getElementById('posterImg')?.src||'',
    star:starVal||0,eval:evalPreset||'',
    back_url:getShareUrl().replace('https://ottrank.kr',''),
  };
  sessionStorage.setItem('ottrang_review_data',JSON.stringify(reviewData));
  sessionStorage.setItem('ottrang_work',JSON.stringify({tmdb_id:WORK.tmdb_id,type:WORK.type,platform:WORK.platform,rank:WORK.rank,title:WORK.title,season:WORK.season,year:WORK.year}));
  sessionStorage.setItem('ottrang_slug',reviewData.back_url);
  location.href='/review.html';
}
function scrollToRating(){goReview(0);}

/* == My Review == */
function renderMyReview(){
  if(!MY_REVIEW){
    document.getElementById('myReviewEmpty').style.display='block';
    document.getElementById('myReviewFilled').style.display='none';
    return;
  }
  document.getElementById('myReviewEmpty').style.display='none';
  document.getElementById('myReviewFilled').style.display='block';
  const score10=(MY_REVIEW.score*2).toFixed(1);
  const stars='★'.repeat(Math.round(MY_REVIEW.score))+'☆'.repeat(5-Math.round(MY_REVIEW.score));
  document.getElementById('myReviewStars').textContent=stars;
  document.getElementById('myReviewScore').textContent=score10+'점';
  const emotions=_safeParseArr(MY_REVIEW.emotions);
  const evalVal=emotions[0]||'';
  const evalColors={'강추해요':'rgba(240,180,41,.15)','추천해요':'rgba(52,211,153,.1)','평범해요':'rgba(160,160,188,.08)','별로예요':'rgba(230,57,70,.1)'};
  document.getElementById('myReviewEval').innerHTML=evalVal?`<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;background:${evalColors[evalVal]||'var(--bg3)'};margin-bottom:6px">${evalVal}</span>`:'';
  document.getElementById('myReviewText').textContent=MY_REVIEW.text||'';
  document.getElementById('myRatingDisplay').innerHTML=`
    <div style="font-size:18px;color:var(--gold);letter-spacing:2px">${stars}</div>
    <div style="font-size:13px;font-weight:700;color:var(--gold);font-family:var(--font-mono)">${score10}점</div>
    <div style="font-size:11px;color:var(--info);cursor:pointer;margin-top:2px" onclick="goReview(0)">수정하기</div>`;
}

/* == Load Reviews == */
async function loadReviews(tmdbId){
  if(!tmdbId)return;
  try{
    const sid=localStorage.getItem('ottrang_sid');
    const [reviewsRes,myRes]=await Promise.allSettled([
      fetch(`${REVIEW_API}/reviews/${tmdbId}`).then(r=>r.json()),
      sid?fetch(`${REVIEW_API}/reviews/${tmdbId}/me`,{headers:{Authorization:'Bearer '+sid}}).then(r=>r.json()):Promise.resolve(null),
    ]);
    if(reviewsRes.status==='fulfilled'&&reviewsRes.value?.ok){
      ALL_COMMENTS=(reviewsRes.value.data||[]).map(r=>({
        id:r.id,user:r.nickname||'익명',init:(r.nickname||'익')[0],
        score:r.score,emotions:_safeParseArr(r.emotions),customTags:_safeParseArr(r.custom_tags),
        text:r.text||'',time:formatTime(r.created_at),likes:r.likes||0,spoiler:!!r.spoiler,
        user_id:r.user_id,isMe:false,
      }));
    }
    if(myRes.status==='fulfilled'&&myRes.value?.data){
      MY_REVIEW=myRes.value.data;
      ALL_COMMENTS=ALL_COMMENTS.map(c=>({...c,isMe:c.id===MY_REVIEW.id}));
    }
    renderMyReview();
    curPage=1;renderComments();updateUserRatingCard();
  }catch(e){}
}

async function deleteMyReview(reviewId){
  if(!confirm('이 후기를 삭제할까요?'))return;
  const sid=localStorage.getItem('ottrang_sid');if(!sid)return;
  try{
    const res=await fetch(`${REVIEW_API}/reviews/${WORK.tmdb_id}`,{method:'DELETE',headers:{Authorization:'Bearer '+sid}});
    const data=await res.json();
    if(data.ok){MY_REVIEW=null;renderMyReview();await loadReviews(WORK.tmdb_id);showToast('후기가 삭제됐어요');}
    else showToast(data.message||'삭제 실패');
  }catch(e){showToast('네트워크 오류');}
}

function _safeParseArr(v){if(!v)return[];try{const r=JSON.parse(v);return Array.isArray(r)?r:[];}catch(e){return[];}}
function formatTime(isoStr){
  if(!isoStr)return'';
  const str=isoStr.endsWith('Z')||isoStr.includes('+')?isoStr:isoStr+' UTC';
  const d=new Date(str),now=new Date();
  const diff=Math.floor((now-d)/1000);
  if(diff<60)return'방금';if(diff<3600)return Math.floor(diff/60)+'분 전';
  if(diff<86400)return Math.floor(diff/3600)+'시간 전';return Math.floor(diff/86400)+'일 전';
}

function updateUserRatingCard(){
  if(!ALL_COMMENTS.length){
    document.getElementById('userRatingEmpty').style.display='flex';
    document.getElementById('userRatingFilled').style.display='none';return;
  }
  const avg5=ALL_COMMENTS.reduce((s,c)=>s+c.score,0)/ALL_COMMENTS.length;
  const avg10=(avg5*2).toFixed(1);const stars=Math.round(avg5);
  document.getElementById('userScore').textContent=avg10;
  document.getElementById('userVotes').textContent=`${ALL_COMMENTS.length}명 평가`;
  document.getElementById('userStarDisplay').textContent='★'.repeat(stars)+'☆'.repeat(5-stars);
  document.getElementById('userRatingEmpty').style.display='none';
  document.getElementById('userRatingFilled').style.display='flex';
}

/* == Wishlist == */
async function initWish(tmdbId){
  if(!tmdbId)return;
  const sid=localStorage.getItem('ottrang_sid');if(!sid)return;
  try{
    const res=await fetch(`${OTTRANK_API}/wishlist/check/${tmdbId}`,{headers:{Authorization:'Bearer '+sid}});
    const data=await res.json();_wishlisted=data.wishlisted;updateWishBtn();
  }catch(e){}
}
function updateWishBtn(){
  const btn=document.getElementById('wishBtn');if(!btn)return;
  if(_wishlisted){btn.textContent='♥ 찜한 작품';btn.classList.add('wished');}
  else{btn.textContent='♡ 찜하기';btn.classList.remove('wished');}
}
async function toggleWish(){
  const sid=localStorage.getItem('ottrang_sid');
  if(!sid){location.href='/login.html?redirect='+encodeURIComponent(location.pathname);return;}
  if(!WORK.tmdb_id)return;
  try{
    const res=await fetch(`${OTTRANK_API}/wishlist`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+sid},body:JSON.stringify({tmdb_id:WORK.tmdb_id,title_ko:WORK.title,poster_path:''})});
    const data=await res.json();if(data.ok){_wishlisted=data.wishlisted;updateWishBtn();}
  }catch(e){}
}

/* == Profile == */
function showProfile(username){
  const reviews=ALL_COMMENTS.filter(c=>c.user===username);
  document.getElementById('profileAvatar').textContent=(username||'?')[0];
  document.getElementById('profileName').textContent=username;
  document.getElementById('profileJoin').textContent='오뜨랑 회원';
  document.getElementById('pstatReviews').textContent=reviews.length;
  document.getElementById('pstatLikes').textContent=reviews.reduce((s,r)=>s+r.likes,0).toLocaleString();
  document.getElementById('profileBackLabel').textContent=`${document.getElementById('mainTitle').textContent||WORK.title}으로 돌아가기`;
  const avg=reviews.length?(reviews.reduce((s,r)=>s+r.score,0)/reviews.length).toFixed(1):'—';
  document.getElementById('pstatAvg').textContent=avg==='—'?'—':avg+'점';
  const dist={1:0,2:0,3:0,4:0,5:0};
  reviews.forEach(r=>dist[Math.round(r.score)]=(dist[Math.round(r.score)]||0)+1);
  const maxCnt=Math.max(...Object.values(dist),1);
  document.getElementById('distBars').innerHTML=[5,4,3,2,1].map(s=>`<div class="dist-row"><span class="dist-label">${s}★</span><div class="dist-bar-bg"><div class="dist-bar-fill" style="width:${Math.round((dist[s]/maxCnt)*100)}%"></div></div><span class="dist-count">${dist[s]}</span></div>`).join('');
  document.getElementById('profileReviewCount').textContent=`${reviews.length}개`;
  document.getElementById('userReviews').innerHTML=reviews.length
    ?reviews.map(r=>`<div class="review-card" onclick="showDetail()"><div class="review-poster"><div class="review-poster-ph">🎬</div></div><div class="review-body"><div class="review-title-row"><span class="review-title">${WORK.title||''}</span><div class="review-stars">${[1,2,3,4,5].map(i=>`<span class="review-star${i<=r.score?'':' off'}">★</span>`).join('')}<span class="review-score-num">${r.score*2}</span></div></div><div class="review-text">${r.text}</div><div class="review-footer"><span class="review-time">${r.time}</span>${r.emotions.map(e=>`<span class="c-ebadge">${ETAG_EMOJI[e]||''}${e}</span>`).join('')}</div></div></div>`).join('')
    :`<div style="padding:32px;text-align:center;font-size:14px;color:var(--muted)">아직 남긴 평점이 없어요</div>`;
  document.getElementById('detailPage').style.display='none';
  document.getElementById('profilePage').style.display='block';
}
function showDetail(){document.getElementById('profilePage').style.display='none';document.getElementById('detailPage').style.display='block';}

/* == Init == */
async function init(){
  // Load TMDB (includes hero render)
  await loadTmdb();

  // Parallel load remaining
  if(WORK.tmdb_id){
    await Promise.all([
      loadTop10Days(),
      loadManualBadges(),
      loadReviews(WORK.tmdb_id),
      loadWatchGuide(),
      loadTitleVideos(),
    ]);
  }else{
    renderComments();
    updateUserRatingCard();
  }

  if(location.hash){
    setTimeout(()=>{
      const el=document.querySelector(location.hash);
      if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
    },700);
  }
}
init();
