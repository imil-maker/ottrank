"""
D1의 works + title_map 데이터를 로컬 rankings.db로 동기화
크롤링 전에 실행해서 Admin에서 수동 저장한 데이터를 로컬에 반영
"""
import sqlite3
import requests
import os
import json

DB_PATH = "rankings.db"

# Cloudflare D1 REST API
CF_ACCOUNT_ID  = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN   = os.environ.get("CLOUDFLARE_API_TOKEN", "")
D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "")

D1_API_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"

def d1_query(sql, params=None):
    """D1 REST API로 SQL 실행"""
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json",
    }
    body = {"sql": sql}
    if params:
        body["params"] = params

    resp = requests.post(D1_API_URL, headers=headers, json=body, timeout=30)
    if resp.status_code != 200:
        raise Exception(f"D1 API 오류: {resp.status_code} {resp.text[:200]}")

    data = resp.json()
    if not data.get("success"):
        raise Exception(f"D1 쿼리 실패: {data}")

    return data["result"][0].get("results", [])

def sync():
    if not CF_ACCOUNT_ID or not CF_API_TOKEN or not D1_DATABASE_ID:
        print("⚠️  Cloudflare 환경변수 없음 — sync_works 스킵")
        return

    conn = sqlite3.connect(DB_PATH)

    # ── 1. works 동기화 ──────────────────────────────────────
    print("  D1 → 로컬: works 동기화 중...")
    try:
        rows = d1_query("SELECT tmdb_id, category, title_ko, title_en, poster_path, genre, overview, release_year, tmdb_rating FROM works WHERE tmdb_id IS NOT NULL")
        count = 0
        for row in rows:
            conn.execute("""
                INSERT INTO works
                    (tmdb_id, category, title_ko, title_en, poster_path,
                     genre, overview, release_year, tmdb_rating, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
                ON CONFLICT(tmdb_id) DO UPDATE SET
                    title_ko     = CASE WHEN ? != '' THEN ? ELSE title_ko END,
                    title_en     = CASE WHEN ? != '' THEN ? ELSE title_en END,
                    poster_path  = COALESCE(?, poster_path),
                    genre        = COALESCE(?, genre),
                    overview     = COALESCE(?, overview),
                    release_year = COALESCE(?, release_year),
                    tmdb_rating  = COALESCE(?, tmdb_rating),
                    updated_at   = datetime('now','localtime')
            """, (
                row["tmdb_id"], row["category"], row["title_ko"] or "", row["title_en"] or "",
                row["poster_path"], row["genre"], row["overview"], row["release_year"], row["tmdb_rating"],
                row["title_ko"] or "", row["title_ko"] or "",
                row["title_en"] or "", row["title_en"] or "",
                row["poster_path"], row["genre"], row["overview"], row["release_year"], row["tmdb_rating"],
            ))
            count += 1
        conn.commit()
        print(f"  ✅ works 동기화 완료: {count}개")
    except Exception as e:
        print(f"  ⚠️  works 동기화 실패: {e}")

    # ── 2. title_map 동기화 ──────────────────────────────────
    print("  D1 → 로컬: title_map 동기화 중...")
    try:
        rows = d1_query("SELECT title_en, title_ko, tmdb_id, category FROM title_map WHERE title_en IS NOT NULL")
        count = 0
        for row in rows:
            conn.execute("""
                INSERT OR REPLACE INTO title_map (title_en, title_ko, tmdb_id, category)
                VALUES (?, ?, ?, ?)
            """, (row["title_en"], row["title_ko"], row["tmdb_id"], row["category"]))
            count += 1
        conn.commit()
        print(f"  ✅ title_map 동기화 완료: {count}개")
    except Exception as e:
        print(f"  ⚠️  title_map 동기화 실패: {e}")

    conn.close()

if __name__ == "__main__":
    sync()
