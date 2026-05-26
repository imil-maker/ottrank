# 오뜨랑 (ottrank.kr) 프로젝트 인수인계

## 스택
- **프론트:** Cloudflare Pages (`imil-maker/ottrank` GitHub 레포)
- **API:** Cloudflare Workers `ottrank-api.tdidream.workers.dev`
- **DB:** Cloudflare D1 `ottrank-db`
- **TMDB 프록시:** `tmdb-proxy.tdidream.workers.dev/tmdb`
- **크롤러:** GitHub Actions → 매일 09:00 KST 자동 실행

---

## ⚠️ 절대 건드리면 안 되는 핵심 로직
> 잘못 수정하면 Admin 수동 수정 데이터가 날아가고 복구가 매우 어려움

### Admin 수동 수정 영구 유지 흐름
```
Admin에서 작품 수정 (한글제목 + 영어제목 + TMDB ID 저장)
→ worker.js /admin/fix
  → D1 rankings 업데이트 (is_manual=1)
  → D1 works 테이블에 영구 저장           ← 핵심!
  → D1 title_map에 영어↔한글 매핑 저장
  → 기존 잘못된 works 데이터 자동 삭제

크롤링 시작 (daily_crawl.yml)
  → sync_works.py 먼저 실행
    → D1 works + title_map → 로컬 SQLite 동기화  ← 핵심!
  → run_all.py 실행
    → db.py 매칭 순서:
      -1순위: FlixPatrol 직접 추출 + works 한글 매핑 우선 (Admin수동우선)
       0순위: works 테이블 (한글 title_ko 우선)
       1순위: rankings 이전 날짜 캐시
       2순위: title_map
       3순위: TMDB 검색 + Claude 검증
       4순위: None (오매칭 방지)
```

### ⚠️ 주의사항
- `sync_works.py` 절대 삭제하거나 `daily_crawl.yml`에서 제거하지 말 것
- `db.py`의 `Admin수동우선` 로직 건드리지 말 것
- `worker.js /admin/fix`의 works upsert + 잘못된 데이터 삭제 로직 건드리지 말 것
- works 테이블에서 tmdb_id 함부로 DELETE하지 말 것
- D1_DATABASE_ID Secret 없으면 sync_works 스킵되어 Admin 수정 날아감!

---

## 파일 구조

### GitHub 레포 루트
```
index.html            ← 메인 랭킹 페이지
header.html           ← 공용 헤더
login.html            ← 소셜 로그인 (카카오/네이버/구글)
signup.html           ← 닉네임 설정 (신규 가입)
mypage.html           ← 마이페이지 (내 페이지 + 외부 프로필)
admin.html            ← 관리자 페이지
_title_detail.html    ← 작품 상세 페이지
_reaction_detail.html ← 해외반응 상세
reactions.html        ← 해외반응 목록
db.py                 ← 크롤러 DB + TMDB 매칭 핵심 모듈 ⚠️
export_to_sql.py      ← rankings.db → D1 업로드용 SQL 변환
sync_works.py         ← D1 works+title_map → 로컬 동기화 ⚠️
run_all.py            ← 전체 크롤러 실행

.github/workflows/
  daily_crawl.yml     ← 크롤링 자동 실행 (순서 중요!) ⚠️
  deploy.yml          ← Cloudflare Pages 배포

crawlers/
  flixpatrol_base.py  ← FlixPatrol 공통 크롤링 (테이블 인덱스 중요!)
  netflix.py
  tving.py            ← TV 시리즈만, category='tv' 고정
  wavve.py
  coupang.py
  disney.py
  boxoffice.py
```

### Cloudflare Workers
```
worker.js  ← 단일 파일, Cloudflare 대시보드에서 직접 편집
```

---

## FlixPatrol 테이블 인덱스 (0부터 시작)
```
넷플릭스: movie=0, tv=1
쿠팡:    movie=1, tv=2
웨이브:   movie=1, tv=3  ← TV Shows (in korean)
디즈니:   movie=1, tv=2
```

---

## D1 테이블 구조
```sql
rankings      ← 날짜별 OTT 랭킹
              date, platform, category, rank,
              title_ko, title_en, tmdb_id, poster_path,
              genre, overview, release_year, tmdb_rating, is_manual

works         ← 작품 마스터 DB (tmdb_id 기준 누적) ⚠️ 핵심!
              tmdb_id, category, title_ko, title_en,
              poster_path, genre, overview, release_year, tmdb_rating

title_map     ← 영어↔한글 제목 매핑 DB
              title_en, title_ko, tmdb_id, category

users         ← 회원 (카카오/구글/네이버)
              id, provider, provider_id, nickname, email,
              grade, total_likes_received, wishlist_public

sessions      ← 로그인 세션
grade_settings ← 회원등급 설정 (막내~제작자 10단계)
reviews       ← 평점/후기
wishlist      ← 찜한 작품
posts         ← 게시판 (recommend/free/community)
reactions     ← 해외반응
reaction_comments ← 번역 댓글
```

---

## 세션 관리
```js
// localStorage 방식 (크로스 도메인 쿠키 문제)
localStorage.setItem('ottrang_sid', sessionId);
// API 호출 시
headers: { Authorization: 'Bearer ' + localStorage.getItem('ottrang_sid') }
```

---

## 작품 URL 형식 (중요!)
```
/title/{작품명}-{시즌}{연도}{tmdb_id}
예: /title/허수아비-120261375646
    시즌1 + 2026 + tmdb_id
```
`_title_detail.html`의 `parseSlug()`가 이 형식으로 파싱함

---

## GitHub Secrets 필수
```
ANTHROPIC_API_KEY       ← Claude API (댓글 번역 + TMDB 매칭 검증)
CLOUDFLARE_ACCOUNT_ID   ← Cloudflare 계정 ID
CLOUDFLARE_API_TOKEN    ← Cloudflare API 토큰
D1_DATABASE_ID          ← D1 ottrank-db의 Database ID ⚠️ 없으면 sync_works 스킵!
```

---

## Cloudflare Workers 환경변수
```
Workers & Pages → ottrank-api → Settings → Variables and Secrets
ADMIN_SECRET
TMDB_API_KEY
OMDB_API_KEY
YOUTUBE_API_KEY
ANTHROPIC_API_KEY
KAKAO_CLIENT_ID / KAKAO_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
```

---

## Admin 작품 수동 수정 방법
1. `admin.html` 접속 → 랭킹 관리 탭
2. 날짜 입력 → 불러오기
3. **⚠️ TMDB없음** 필터 → 미매칭 작품 목록
4. 수정 버튼 클릭
5. 한글 제목 + 영어 원제 + TMDB ID 입력
   - TMDB ID: `themoviedb.org/tv/XXXXX` 또는 `/movie/XXXXX` URL에서 숫자
6. 저장 → works + title_map에 영구 저장됨
7. 다음 크롤링부터 자동 매칭!

---

## 다음 작업 예정
1. 메인페이지 개편 (한글+영어 제목, 실제 업데이트 시각)
2. 작품 상세페이지 히스토리 차트 실제 데이터 연동
3. 게시판 페이지 제작 (추천/자유/커뮤니티)
4. 마이페이지 후기 작품명+포스터 연동
