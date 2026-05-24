import sqlite3
import requests
import time
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
DB_PATH = "rankings.db"
TMDB_PROXY = "https://tmdb-proxy.tdidream.workers.dev/tmdb"


def _fetch_detail(tmdb_id: int, media_type: str):
    """tmdb_id로 상세정보 조회 → (title_ko, poster, genre, overview, release_year, tmdb_rating)"""
    try:
        url = f"{TMDB_PROXY}/{media_type}/{tmdb_id}"
        resp = requests.get(url, params={"language": "ko-KR"}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            title_ko     = data.get("name") or data.get("title") or ""
            poster        = data.get("poster_path") or ""
            # 장르: 한국어 장르명 리스트 → 쉼표 구분 문자열
            genres        = data.get("genres", [])
            genre_str     = ",".join(g.get("name", "") for g in genres if g.get("name"))
            # 줄거리
            overview      = data.get("overview") or ""
            # 개봉연도
            date_str      = data.get("release_date") or data.get("first_air_date") or ""
            release_year  = int(date_str[:4]) if date_str and len(date_str) >= 4 else None
            # TMDB 평점
            tmdb_rating   = data.get("vote_average") or None
            return title_ko, poster, genre_str, overview, release_year, tmdb_rating
    except Exception:
        pass
    return "", "", "", "", None, None


def search_tmdb(title_ko, title_en="", media_type="tv"):
    """
    TMDB 검색 → (tmdb_id, poster_path, title_ko_korean) 반환
    - 검색 후 반드시 tmdb_id로 ko-KR 상세 재조회 → 한국어 제목 확보
    """
    tmdb_type = "tv" if media_type == "tv" else "movie"

    # 검색 쿼리 우선순위
    queries = []
    if title_ko and title_ko.strip():
        queries.append(title_ko.strip())
    if title_en and title_en.strip() and title_en.strip() != title_ko.strip():
        words = title_en.strip().split()
        if len(words) >= 2:
            queries.append(title_en.strip())

    for query in queries:
        try:
            url = f"{TMDB_PROXY}/search/{tmdb_type}"
            # 검색은 en-US로 (범위 넓음) + ko-KR로도 시도
            for lang in ["ko-KR", "en-US"]:
                resp = requests.get(url, params={"query": query, "language": lang}, timeout=10)
                if resp.status_code != 200:
                    continue

                results = resp.json().get("results", [])

                # 1순위: 제목 정확 일치 + poster
                q_lower = query.lower()
                exact = [
                    r for r in results
                    if r.get("poster_path")
                    and (r.get("title", "") or r.get("name", "")).lower() == q_lower
                ]
                if exact:
                    best = sorted(exact, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                    tmdb_id = best.get("id")
                    # 반드시 ko-KR 상세 재조회
                    ko_title, poster, _, _, _, _ = _fetch_detail(tmdb_id, tmdb_type)
                    poster = poster or best.get("poster_path", "")
                    print(f"    → 정확매칭({lang}): {ko_title or query}")
                    return tmdb_id, poster, ko_title

                # 2순위: popularity 10 이상 + poster + 최근 10년 이내
                import datetime
                current_year = datetime.datetime.now().year
                popular = [
                    r for r in results
                    if r.get("poster_path")
                    and r.get("popularity", 0) >= 10
                    and _is_recent(r, current_year, 10)
                ]
                if popular:
                    best = sorted(popular, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                    tmdb_id = best.get("id")
                    ko_title, poster, _, _, _, _ = _fetch_detail(tmdb_id, tmdb_type)
                    poster = poster or best.get("poster_path", "")
                    # 한국어 제목이 확인된 경우만 신뢰 (오매핑 방지)
                    if _is_korean(ko_title):
                        print(f"    → 인기매칭({lang}): {ko_title}")
                        return tmdb_id, poster, ko_title
                    else:
                        print(f"    → 인기매칭 불신뢰(한국어 제목 없음): {ko_title or query} → 스킵")

                # 3순위: poster 있는 것 중 최고 (최근 10년 이내 우선, 한국어 제목 필수)
                with_poster = [r for r in results if r.get("poster_path")]
                recent = [r for r in with_poster if _is_recent(r, current_year, 10)]
                candidates = recent if recent else with_poster
                if candidates:
                    best = sorted(candidates, key=lambda x: x.get("popularity", 0), reverse=True)[0]
                    tmdb_id = best.get("id")
                    ko_title, poster, _, _, _, _ = _fetch_detail(tmdb_id, tmdb_type)
                    poster = poster or best.get("poster_path", "")
                    # 한국어 제목이 확인된 경우만 신뢰
                    if _is_korean(ko_title):
                        print(f"    → 폴백매칭({lang}): {ko_title}")
                        return tmdb_id, poster, ko_title
                    else:
                        print(f"    → 폴백 불신뢰(한국어 제목 없음): {ko_title or query} → 스킵")

                time.sleep(0.2)

        except Exception as e:
            print(f"  TMDB 오류 ({query}): {e}")

    return None, None, None


def get_today():
    return datetime.now(KST).strftime("%Y-%m-%d")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rankings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,
            platform    TEXT    NOT NULL,
            category    TEXT    NOT NULL,
            rank        INTEGER NOT NULL,
            title_ko    TEXT    NOT NULL,
            title_en    TEXT    DEFAULT '',
            score       REAL    DEFAULT 0.0,
            created_at  TEXT    DEFAULT (datetime('now','localtime')),
            tmdb_id     INTEGER DEFAULT NULL,
            poster_path TEXT    DEFAULT NULL,
            UNIQUE(date, platform, category, rank)
        )
    """)
    conn.commit()
    return conn


def save(conn, platform, category, rank, title_ko, title_en="", score=0.0,
         tmdb_id_override=None, poster_override=None):
    today = get_today()
    media_type = "tv" if category == "tv" else "movie"

    # is_manual=1인 행은 크롤러가 덮어쓰지 않음
    existing = conn.execute("""
        SELECT is_manual, tmdb_id, poster_path, title_ko
        FROM rankings
        WHERE date = ? AND platform = ? AND category = ? AND rank = ?
    """, (today, platform, category, rank)).fetchone()

    if existing and existing[0] == 1:
        print(f"  [{platform}][{category}] {rank:2d}. {existing[3]} → 수동고정, 스킵")
        return

    genre = overview = release_year = tmdb_rating = None

    if tmdb_id_override and poster_override:
        tmdb_id = tmdb_id_override
        poster_path = poster_override
        ko_title, _, genre, overview, release_year, tmdb_rating = _fetch_detail(tmdb_id, media_type)
        title_ko_final = ko_title or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(직접)")

    elif tmdb_id_override:
        tmdb_id = tmdb_id_override
        ko_title, poster_path, genre, overview, release_year, tmdb_rating = _fetch_detail(tmdb_id, media_type)
        title_ko_final = ko_title or title_ko
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} ✓(ID조회)")

    else:
        tmdb_id, poster_path, ko_title = search_tmdb(title_ko, title_en, media_type=category)
        if ko_title and _is_korean(ko_title):
            title_ko_final = ko_title
        else:
            title_ko_final = title_ko
        # tmdb_id 있으면 추가 상세정보 조회
        if tmdb_id:
            _, _, genre, overview, release_year, tmdb_rating = _fetch_detail(tmdb_id, media_type)
        status = "✓" if poster_path else "✗ 포스터 없음"
        print(f"  [{platform}][{category}] {rank:2d}. {title_ko_final} → tmdb_id={tmdb_id} {status}")

    conn.execute("""
        INSERT OR REPLACE INTO rankings
            (date, platform, category, rank, title_ko, title_en, score,
             tmdb_id, poster_path, genre, overview, release_year, tmdb_rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (today, platform, category, rank, title_ko_final, title_en, score,
          tmdb_id, poster_path, genre or None, overview or None, release_year, tmdb_rating))
    conn.commit()

    # works 테이블에도 저장 (작품 마스터 — tmdb_id 기준 upsert)
    if tmdb_id:
        _upsert_work(conn, tmdb_id, media_type, title_ko_final, title_en,
                     poster_path, genre, overview, release_year, tmdb_rating)


def _is_recent(r: dict, current_year: int, years: int) -> bool:
    """TMDB 결과가 최근 N년 이내인지 확인"""
    date_str = r.get("release_date") or r.get("first_air_date") or ""
    if not date_str:
        return True  # 날짜 없으면 통과
    try:
        year = int(date_str[:4])
        return year >= current_year - years
    except Exception:
        return True

def _is_korean(text: str) -> bool:
    """문자열에 한글이 포함되어 있는지 확인"""
    return any('\uAC00' <= c <= '\uD7A3' or '\u1100' <= c <= '\u11FF' for c in text)


def _get_poster_by_id(tmdb_id: int, media_type: str):
    _, poster = _fetch_detail(tmdb_id, media_type)
    return poster or None


def _upsert_work(conn, tmdb_id, category, title_ko, title_en,
                 poster_path, genre, overview, release_year, tmdb_rating):
    """works 테이블에 작품 정보 upsert (tmdb_id 기준)"""
    try:
        conn.execute("""
            INSERT INTO works
                (tmdb_id, category, title_ko, title_en, poster_path,
                 genre, overview, release_year, tmdb_rating, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
            ON CONFLICT(tmdb_id) DO UPDATE SET
                title_ko     = excluded.title_ko,
                title_en     = excluded.title_en,
                poster_path  = COALESCE(excluded.poster_path, poster_path),
                genre        = COALESCE(excluded.genre, genre),
                overview     = COALESCE(excluded.overview, overview),
                release_year = COALESCE(excluded.release_year, release_year),
                tmdb_rating  = COALESCE(excluded.tmdb_rating, tmdb_rating),
                updated_at   = datetime('now','localtime')
        """, (tmdb_id, category, title_ko, title_en or '',
              poster_path or None, genre or None, overview or None,
              release_year, tmdb_rating))
        conn.commit()
    except Exception as e:
        print(f"  works upsert 오류: {e}")
