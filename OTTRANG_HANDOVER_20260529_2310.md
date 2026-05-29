# 오뜨랑 (ottrank.kr) 작업 인수인계 문서
> 작성일: 2026-05-29 23:10  
> **다음 작업 시 이 문서를 반드시 먼저 읽고 시작할 것**

---

## 핵심 철학 (절대 잊지 말 것)

> **크롤러는 멍청하게 — 있는 그대로 전부 수집**
> **판단은 Admin이 한 번만 — 사람이 설정한 것이 영원히 우선**
> **works 테이블은 크롤러가 절대 수정/삭제 불가 — Admin만 가능**
> **프론트엔드는 판단 로직 없음 — Admin 설정만 그대로 렌더링**
> **수동 랭킹(date='manual')은 크롤링이 절대 덮어쓰지 못함**

---

## 기술 스택

| 구분 | 내용 |
|------|------|
| **프론트** | Cloudflare Pages (`imil-maker/ottrank` GitHub 레포) |
| **API** | Cloudflare Workers `ottrank-api.tdidream.workers.dev` |
| **worker.js** | ⚠️ Cloudflare 대시보드에서 직접 편집 (GitHub에 없음!) |
| **DB** | Cloudflare D1 `ottrank-db` (SQLite 기반) |
| **TMDB 프록시** | `tmdb-proxy.tdidream.workers.dev/tmdb` |
| **크롤러** | GitHub Actions → 매일 09:00 KST 자동 실행 |
| **Claude API** | `claude-haiku-4-5-20251001` (번역용) |

---

## 사이트 전체 파일 구조

### GitHub 레포 루트 (`imil-maker/ottrank`)

```
index.html            ← 메인 랭킹 페이지
admin.html            ← 관리자 페이지
boxoffice.html        ← 박스오피스 OTT 페이지 (신규)
_title_detail.html    ← 작품 상세 페이지
reactions.html        ← 해외반응 페이지
mypage.html           ← 마이페이지 (찜/리뷰)
header.html           ← 공용 헤더 (모든 페이지에서 fetch로 로드)
login.html            ← 로그인 페이지

db.py                 ← 크롤러 DB + TMDB 매칭 핵심 모듈 ⚠️ 건드릴 때 주의
sync_works.py         ← D1 → 로컬 동기화 ⚠️ 절대 삭제 금지!
upload_to_d1.py       ← D1 REST API 직접 업로드 (wrangler-action 대체)
run_all.py            ← 전체 크롤러 실행
rankings.db           ← 로컬 SQLite (GitHub Actions에서 사용)

_redirects            ← Cloudflare Pages URL 리다이렉트 규칙
_headers              ← Cloudflare Pages 응답 헤더 설정

migrations/
  migration_v2_ottrang_redesign.sql  ← 적용 완료

.github/workflows/
  daily_crawl.yml     ← 크롤링 자동 실행

crawlers/
  flixpatrol_base.py  ← FlixPatrol 기반 크롤러 (넷플릭스/디즈니/웨이브/쿠팡)
  netflix.py
  disney.py
  wavve.py
  coupang.py          ← URL: coupang-play (coupang 아님!)
  tving.py            ← category01: 키노라이츠, 기존 유지
  boxoffice.py        ← 기존 유지
```

### Cloudflare Workers (대시보드에서 직접 편집)
```
worker.js  ← 모든 API 로직. GitHub에 없으므로 수정 후 반드시 백업!
```

---

## URL 라우팅 규칙 (`_redirects`)

```
/title/:slug  /_title_detail.html  200
/title/*      /_title_detail.html  200
/reaction/:id /_reaction_detail.html  200
/reaction/*   /_reaction_detail.html  200
/auth/*       https://ottrank-api.tdidream.workers.dev/auth/:splat  200
```

---

## 작품 상세 페이지 URL 형식

**새 형식 (2026-05-29 변경):**
```
/title/{시즌}-{연도}{tmdbId}

예시:
  명량 (2014, tmdb_id=297561, 시즌1) → /title/1-2014297561
  골드랜드 (2026, tmdb_id=278113)   → /title/1-2026278113
```

**변경 이유:** 기존 한글 제목 포함 URL(`/title/명량-12014297561`)이 인코딩 문제로 작품 페이지 에러 다발 → 숫자만으로 변경

**⚠️ 주의:**
- `_title_detail.html`의 `parseSlug()`가 새 형식 + 구 형식 둘 다 파싱 (하위호환)
- `goDetail()` 함수가 있는 모든 파일에서 일관성 있게 사용해야 함
- `_title_detail.html`의 `history.replaceState()`도 새 형식으로 URL을 교체함

**수정된 파일 목록:**
- `index.html` — `goDetail()` 함수
- `header.html` — 검색 결과 클릭 시 URL 생성
- `reactions.html` — `goDetail()` 함수
- `mypage.html` — `goTitle()` 함수 (data-* 속성 방식)
- `_title_detail.html` — `parseSlug()`, `history.replaceState()`, `getShareUrl()`
- `boxoffice.html` — `goDetail()` 함수

---

## D1 데이터베이스 스키마

### 핵심 테이블

#### `works` — 작품 마스터 데이터 (Admin만 수정 가능)
```sql
id, tmdb_id, title_ko, title_en, poster_path, genre, overview,
release_year, tmdb_rating, match_source, confidence_score, first_matched_date
```
- **크롤러는 INSERT만 가능, UPDATE/DELETE 절대 금지**
- Admin이 수정한 데이터가 영원히 우선

#### `rankings` — 크롤링 순위 데이터
```sql
id, date, platform, category, category_slot, source_name, rank,
title_ko, title_en, tmdb_id, poster_path, genre, overview,
release_year, tmdb_rating, is_manual, memo
```
- `date='manual'` → 수동 랭킹 (크롤링이 절대 덮어쓰지 못함)
- UNIQUE(date, platform, category, rank)
- `is_manual=1` → Admin이 직접 입력한 데이터

#### `ott_categories` — OTT 카테고리 슬롯 관리 (핵심!)
```sql
id, platform, category_slot, table_index, source_name, display_name,
crawl_limit, main_limit, platform_limit, is_active,
main_section, main_order,        ← 메인페이지 노출 설정
platform_section, platform_order, ← OTT 페이지 노출 설정
memo_label                        ← 수동 랭킹 메모 컬럼 이름 (예: 역대 관객수)
```

#### `review_queue` — TMDB 자동 매칭 실패 검토 큐
```sql
id, platform, category_slot, rank, title_en, title_ko_guess,
fail_reason, crawled_date, status
```

#### `admin_logs` — Admin 작업 감사 로그
```sql
id, action, platform, category_slot, target_id, before_value, after_value, created_at
```

### 현재 `ott_categories` 슬롯 현황

| 플랫폼 | 슬롯 | source_name | 비고 |
|--------|------|-------------|------|
| netflix | category01 | TOP 10 Movies | |
| netflix | category02 | TOP 10 TV Shows | |
| netflix | category03 | TOP 10 Kids Movies | is_active=0 |
| netflix | category04 | TOP 10 Kids TV Shows | is_active=0 |
| disney | category01 | TOP 10 Overall | |
| disney | category02 | TOP 10 Movies | |
| disney | category03 | TOP 10 TV Shows | |
| wavve | category01 | TOP 10 Overall | |
| wavve | category02 | TOP 10 Movies | |
| wavve | category03 | TOP 10 TV Shows | **is_active=0** (중국드라마 오매칭) |
| wavve | category04 | TOP 10 TV Shows (in Korean) | |
| wavve | category05 | TOP 10 Entertainment Shows | |
| coupang | category01 | TOP 10 Overall | |
| coupang | category02 | TOP 10 Movies | |
| coupang | category03 | TOP 10 TV Shows | |
| tving | category01 | TOP 10 Overall | 키노라이츠 크롤링 |
| boxoffice | category01 | 주간 박스오피스 | |
| boxoffice | category02 | 역대 한국영화 관객수 TOP20 | 수동 랭킹 |

---

## API 엔드포인트 목록 (worker.js)

### Public API
```
GET  /rankings              ← 전체 랭킹 조회
GET  /rankings/main         ← 메인페이지용 (main_section 설정 기반, 수동 랭킹 포함)
GET  /rankings/platform     ← OTT 페이지용 (platform_section 설정 기반, 수동 랭킹 포함)
GET  /rankings/weekly       ← 주간 랭킹
GET  /rankings/monthly      ← 월간 랭킹
GET  /rankings/history      ← 순위 변동 히스토리
GET  /works/:tmdb_id        ← 작품 상세
GET  /reviews/:tmdb_id      ← 작품 리뷰
POST /reviews/:tmdb_id      ← 리뷰 작성
GET  /wishlist              ← 찜 목록
POST /wishlist              ← 찜 토글
GET  /auth/me               ← 로그인 상태 확인
```

### Admin API (ADMIN_SECRET 필요)
```
GET    /admin/rankings             ← 랭킹 조회
PATCH  /admin/rankings/:id         ← 랭킹 수정
GET    /admin/works                ← works 조회
PATCH  /admin/works/:tmdb_id       ← works 수정
DELETE /admin/works/:tmdb_id       ← works 삭제
GET    /admin/categories           ← ott_categories 조회
PATCH  /admin/categories/:id       ← 카테고리 설정 수정 (memo_label 포함)
POST   /admin/categories           ← 신규 카테고리 슬롯 생성
GET    /admin/manual-rankings      ← 수동 랭킹 조회 (date='manual')
POST   /admin/manual-rankings      ← 수동 랭킹 작품 추가
PATCH  /admin/manual-rankings/reorder ← 수동 랭킹 순위 재정렬
DELETE /admin/manual-rankings/:id  ← 수동 랭킹 항목 삭제
GET    /admin/review-queue         ← 검토 큐 조회
POST   /admin/review-queue/:id/resolve ← 검토 큐 수동 매칭
GET    /admin/new-match-count      ← 신규 매칭 건수
```

---

## Admin 페이지 탭 구성 (`admin.html`)

```
📊 랭킹 관리
📋 페이지 카테고리 설정   ← 메인/OTT 페이지 노출 설정, 전체 저장 버튼
⚙️ 카테고리 관리
✏️ 수동 랭킹 관리         ← 신규: Admin 직접 입력 랭킹 (date='manual')
🎬 works 관리
🌍 해외반응 관리
🏅 회원등급 설정
👥 회원 관리
```

### ✏️ 수동 랭킹 관리 — 주요 기능
- 새 카테고리 슬롯 생성 (예: boxoffice category02)
- TMDB URL 붙여넣기로 작품 추가 (`https://www.themoviedb.org/movie/1255`)
- ▲▼ 버튼으로 순위 조정
- 메모 입력 (예: `1900만명`)
- 메모 컬럼 이름 설정 (예: `역대 관객수`) → `ott_categories.memo_label`에 저장
- 💾 순위 저장 버튼 (상단/하단 모두 있음)

**⚠️ 수동 랭킹 작품 추가 시 주의:**
- TMDB ID 숫자만 입력하면 movie/tv 혼동 오매칭 위험
- **반드시 TMDB URL 전체 붙여넣기 권장** (`/movie/` 또는 `/tv/` 포함)
- 예) `https://www.themoviedb.org/movie/297561`

### 📋 페이지 카테고리 설정 — 주의사항
- **메인페이지 설정**과 **OTT 페이지 설정**이 같은 `ott_categories.id`를 공유
- 개별 저장 버튼: 해당 섹션 필드만 저장 (다른 섹션 덮어쓰지 않음)
- 전체 저장 버튼: 메인/OTT 테이블 분리해서 저장 (섞이면 서로 덮어씀 버그 수정됨)

---

## 크롤러 구조

### 실행 순서 (`run_all.py`)
```
1. sync_works.py     — D1 works + ott_categories → 로컬 동기화 ⚠️ 절대 삭제 금지
2. FlixPatrol 크롤링 — netflix, disney, wavve, coupang (배치 처리)
3. 티빙 크롤링       — 키노라이츠 (Playwright)
4. 박스오피스 크롤링
5. upload_to_d1.py   — 로컬 rankings.db → D1 업로드
```

### TMDB 매칭 파이프라인 (db.py)
```
① works DB 우선 조회 (title_en 기준)
   → title_en 없으면 title_ko로 2차 조회 (웨이브/티빙 한글 제목 보호)
   → 있으면 바로 저장 (Claude/TMDB 호출 없음)

② TMDB 영어 원제 검색 (strict=True, 결과 1개만)

③ Claude API 번역 (신규 작품만)
   → 한글 제목이면 번역 스킵

④ TMDB 한글 검색
   → 우선순위: 최신 연도 우선 (popularity 기준 → 오래된 명작이 신작 이기는 문제 수정)

⑤ 실패 시 review_queue 저장 → Admin 수동 처리
```

**⚠️ 중요 변경 (2026-05-29):**
- `lookup_works()`에 `title_ko` 2차 조회 추가 → 한글 크롤러(웨이브/티빙)가 Admin 데이터를 못 찾아 덮어쓰는 버그 수정
- TMDB 검색 우선순위: `popularity(all-time)` → **`최신 연도` 기준**으로 변경

### GitHub Actions 스케줄 주의
- 레포에 60일 이상 커밋이 없으면 GitHub이 스케줄 자동 중단
- 중단됐으면 아무 파일이나 커밋 push하면 재활성화됨

---

## 수동 랭킹 시스템 (date='manual')

### 개념
```
크롤링 랭킹: date='2026-05-29'  → 매일 새로 덮어씌워짐
수동 랭킹:   date='manual'      → 크롤링과 완전히 분리, 영구 유지
```

### 작동 방식
1. Admin에서 작품 추가 → `rankings` 테이블에 `date='manual'`로 저장
2. `/rankings/platform` API → 크롤링 데이터 + 수동 데이터 합쳐서 반환
3. 프론트에서 `category_slot`별로 그룹핑해서 렌더링

### memo 시스템
- `rankings.memo` → 각 작품별 자유 입력값 (예: `1900만명`)
- `ott_categories.memo_label` → 메모 컬럼 이름 (예: `역대 관객수`)
- 프론트에서 `{memo_label}: {memo}` 형태로 표시 (예: `역대 관객수: 1900만명`)
- 작품 상세 페이지에서도 이 정보를 별도 노출 예정

### D1 UNIQUE 제약 주의
```sql
UNIQUE(date, platform, category, rank)
-- category_slot이 아닌 category 컬럼임!
-- reorder 시 임시 음수 rank → 정상 rank 순서로 처리
```

---

## 페이지별 max-width 기준

| 페이지 | max-width |
|--------|-----------|
| 메인 (`index.html`) | 1200px |
| OTT 페이지 (`boxoffice.html` 등) | 1200px |
| 작품 상세 (`_title_detail.html`) | 900px |
| 해외반응 (`reactions.html`) | 900px |
| 마이페이지 (`mypage.html`) | 900px |

---

## 절대 건드리면 안 되는 것

```
⚠️ sync_works.py — daily_crawl.yml에서 제거 절대 금지
⚠️ works 테이블 크롤러 UPDATE/DELETE — 크롤러 코드에서 완전 금지
⚠️ D1_DATABASE_ID GitHub Secret — 없으면 sync_works 스킵됨
⚠️ wavve category03 — is_active=0 유지 (중국드라마 오매칭)
⚠️ tving 크롤러 (키노라이츠 category01) — 기존 유지
⚠️ boxoffice 크롤러 — 기존 유지
⚠️ worker.js — GitHub에 없으므로 수정 후 로컬 백업 필수
⚠️ rankings UNIQUE 제약 — (date, platform, category, rank) / category_slot 아님!
```

---

## GitHub Secrets

```
ANTHROPIC_API_KEY       ← Claude API (번역용)
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
D1_DATABASE_ID          ← 없으면 sync_works 스킵!
GOOGLE_SEARCH_API_KEY   ← 설정했지만 미사용 (403 오류)
GOOGLE_SEARCH_CX        ← 설정했지만 미사용
```

## Cloudflare Workers 환경변수

```
위치: Workers & Pages → ottrank-api → Settings → Variables and Secrets

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

## 남은 작업 목록

### 🔴 긴급
1. **나머지 OTT 페이지 제작** — netflix, tving, disney, wavve, coupang 페이지
   - `boxoffice.html` 참고해서 동일한 구조로 제작
   - `/rankings/platform?platform={플랫폼명}` API 연결

### 🟡 중요
2. **주간/월간 랭킹** — weekly/monthly API도 category_slot 기반으로 수정 필요
3. **검토 큐 UI 개선** — Admin 랭킹 관리 탭 하단 review_queue 확인
4. **작품 상세 페이지 수동 랭킹 정보 노출** — `한국 영화 [역대 관객수] 1위, 1900만` 형태

### 🟢 나중에
5. **에디터 글쓰기** — 커뮤니티 게시판 에디터 기능
6. **순위 오버라이드** — ▲▼ 화살표로 순위 조정 (`rank_overrides` 테이블 이미 있음)
7. **수동 큐레이션** — "넷플릭스 역대 흥행 TOP 10" 같은 Admin 직접 입력 카테고리

---

## 오늘(2026-05-29) 작업 요약

### 오전 작업 (HANDOVER_1444 기준)
- D1 스키마 재구성 (ott_categories, review_queue, rank_overrides, admin_logs 신규)
- 크롤러 전면 재구성 (category_slot 방식)
- TMDB 매칭 파이프라인 v3
- Admin 페이지 강화
- worker.js 신규 API 다수 추가

### 오후 작업 (이 문서 기준)
- `db.py`: `lookup_works()` title_ko 2차 조회 추가 (한글 크롤러 Admin 데이터 보호)
- `db.py`: TMDB 검색 우선순위 popularity → **최신 연도** 기준으로 변경
- `admin.html`: **✏️ 수동 랭킹 관리 탭** 신규 추가
- `admin.html`: 페이지 카테고리 **전체 저장 버튼** 추가
- `admin.html`: 페이지 카테고리 저장 시 메인/OTT 섹션 **서로 덮어쓰는 버그** 수정
- `worker.js`: PATCH /admin/categories에 **`__SKIP__` 패턴** 적용 (필드 미전송 시 기존값 유지)
- `worker.js`: 수동 랭킹 CRUD API 추가 (GET/POST/PATCH reorder/DELETE)
- `worker.js`: `/rankings/platform`, `/rankings/main` — 수동 랭킹 포함
- `worker.js`: 수동 랭킹 POST 시 TMDB 재조회 로직 제거 (movie/tv 오매칭 방지)
- `worker.js`: reorder 시 임시 음수 rank → UNIQUE 충돌 방지
- `rankings` 테이블: `memo` 컬럼 추가 (`ALTER TABLE`)
- `ott_categories` 테이블: `memo_label` 컬럼 추가 (`ALTER TABLE`)
- `boxoffice.html`: OTT 페이지 신규 제작
- **작품 URL 형식 전면 변경**: 한글 포함 → 숫자만 (`/title/{시즌}-{연도}{tmdbId}`)
- `_title_detail.html`: parseSlug() 새 형식 + 하위호환, history.replaceState 수정
- `index.html`, `header.html`, `reactions.html`, `mypage.html`, `boxoffice.html`: URL 수정
- `mypage.html`: `<a href>` → `goTitle()`+sessionStorage 방식으로 변경 (빈 화면 버그 수정)
- `daily_crawl.yml`: `beautifulsoup4` 의존성 추가
