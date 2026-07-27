# 2026-07-27 rev.2 — test_tving_screenshot.py (티빙 메인화면 접속/스크린샷 테스트)
# rev.2 변경: networkidle 대기 방식이 30초 타임아웃으로 실패 → domcontentloaded로 완화하고
#            고정 대기(5초)로 교체. 진짜 차단인지 아닌지 스크린샷으로 직접 눈으로 확인하기 위함.
#
# 목적: 실제 크롤링 코드(daily_crawl.yml)는 건드리지 않고,
#       "Playwright로 tving.com 메인화면 접속이 되는지" 딱 그것만 확인하는 1회성 테스트.
# 결과: 성공하면 tving_main.png 스크린샷 파일이 생성됨 (GitHub Actions에서 다운로드 가능)
#       실패하면 에러 메시지가 로그에 그대로 남음 (캡차/차단/타임아웃 등 원인 구분용)

from playwright.sync_api import sync_playwright
import sys

def main():
    with sync_playwright() as p:
        # 실제 사람이 쓰는 것처럼 보이도록 일반적인 User-Agent 지정
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = context.new_page()

        try:
            print("=== tving.com 접속 시도 ===")
            # 화면 뼈대(HTML)만 로드되면 넘어감 — 백그라운드 통신(광고/통계 등)이
            # 계속 도는 사이트라 networkidle을 쓰면 끝없이 대기하다 타임아웃 남
            page.goto("https://www.tving.com", timeout=30000, wait_until="domcontentloaded")
            print(f"접속 성공 — 페이지 제목: {page.title()}")

            # 화면에 순위 콘텐츠(JS로 그려지는 부분)가 렌더링될 시간을 넉넉히 줌
            page.wait_for_timeout(5000)

            page.screenshot(path="tving_main.png", full_page=False)
            print("스크린샷 저장 완료: tving_main.png")

            # 참고용으로 현재 페이지 텍스트 일부도 로그에 남김 (순위 텍스트가 실제로 로드됐는지 확인용)
            body_text = page.inner_text("body")
            preview = body_text[:500].replace("\n", " ")
            print(f"--- 페이지 텍스트 미리보기(500자) ---\n{preview}")

        except Exception as e:
            print(f"접속/스크린샷 실패: {type(e).__name__} — {e}")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
