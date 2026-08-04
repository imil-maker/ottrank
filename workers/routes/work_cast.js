/* 2026-08-04 rev.29 — work_cast.js (2가지 수정 — ① 대괄호 "[...]"는 소괄호와 똑같이 안쪽
   내용을 정상적으로 번역 시도(매칭표에 있으면 번역됨), 대괄호 기호만 유지. 앞/뒤 텍스트와
   대괄호 안쪽을 각각 따로(재귀) 번역해서 합치는 방식으로 처리 — 대괄호까지 한 토큰
   묶음으로 취급하면 글자 수가 늘어나며 "4글자 이상 띄어쓰기" 규칙이 잘못 걸려 "Jang Guk
   Han"같은 실제 이름까지 "장 국 한"처럼 음절이 벌어지는 부작용이 있어서, 이름 부분은
   원래 로직대로 따로 처리. ② _findRawOverrideMatch에 단어 경계 체크 추가 — "man"이
   예외등록돼 있어도 "Commander"/"Department" 안에 낀 "man"은 더 이상 안 걸리고,
   "Delivery Man"처럼 진짜 독립된 단어일 때만 매칭(Com남자der, Depart남자들t 같은 결과
   방지)) */
/* 2026-08-04 rev.28 — work_cast.js (미매칭 재시도(partialMode) 한정 — 배역명에 예외등록
   문구가 낀 경우("Biru (segment "I Saw You")"), 예외문구 앞/뒤 중 한쪽이라도 완전히
   실패하면 beforeR.ok && afterR.ok 조건에 걸려 앞쪽 성공분(Biru)까지 통째로 버려지던
   문제. partialMode에서는 실패한 쪽만 원문 그대로 대체해서 쓰고, 성공한 쪽(앞부분+
   예외등록문구)은 번역된 채로 저장하도록 분기 추가. 일반 자동번역 배치 버튼은 기존
   동작(전체 실패 처리) 그대로 유지) */
/* 2026-08-04 rev.27 — work_cast.js (둥근따옴표(’, U+2019 등) 정규화 추가 — "Cha Do Hyun’s"처럼
   일반 따옴표(')가 아니라 둥근 스마트따옴표가 쓰인 경우, 기존 코드가 이를 인식 못 해서
   "Hyun's"가 "Hyuns"라는 한 단어로 뭉쳐버리고 매칭 실패하던 문제. _translatePlainSegment
   시작 시 둥근따옴표를 전부 일반 따옴표로 바꿔치기해서, 이후 's 분리/붙여쓰기 로직이
   그대로 정상 적용되도록 수정) */
/* 2026-08-04 rev.26 — work_cast.js (3가지 수정 — ① "↻ 미매칭 재시도" 버튼에서만: 앞부분부터
   번역하다 막히면 3글자 이상이어야 인정하던 기준을 없애고, 막힌 지점부터 끝까지 원문(영어)
   그대로 이어붙여 저장(예: "Kang Detective"→"강 Detective"). "▶ 자동번역 배치 실행" 버튼은
   기존 동작 그대로 유지. ② 괄호 버그 수정: 배역명 정리 과정(symbolsCleaned)이 한글까지
   지워버려서 "Kyeong-soo (경수)"의 괄호 안 "경수"가 사라지고 빈 "()"만 남아 미매칭 처리되던
   문제 — 정리 과정에 한글(가-힣) 허용 추가, _translateToken에 "이미 한글인 토큰은 매칭표
   조회 없이 그대로 통과" 분기 추가. ③ 괄호 앞부분 번역 결과와 괄호 안 내용이 같으면
   중복이니 괄호 쪽 제거(예: "경수 (경수)"가 아니라 "경수"만 저장) — 하이픈으로 여러
   토큰으로 쪼개진 이름("Kyeong-soo"→"경"+"수")도 앞쪽 전체를 이어붙여서 비교하도록 처리) */
/* 2026-08-04 rev.25 — work_cast.js (GET /admin/cast/unmatched-list 신규 — 번역을 다시 시도하지
   않고, 지금 character_name_ko_attempted=1이면서 아직 안 채워진 미매칭 배역을 조회만 하는
   API. 재시도 버튼은 실제로 번역을 다시 돌리느라 오래 걸리는데, "지금 뭐가 막혀있는지만 빨리
   보고 싶다"는 요청으로 신설 — id 커서 페이지네이션(after_id/limit)) */
/* 2026-08-04 rev.24 — work_cast.js (속도개선 — 지금까지 배역 한 명 번역할 때마다 단어 하나
   하나를 매번 D1에 물어봤고(안 풀리는 단어는 2조각 분해까지 시도하며 최대 수십 번), 예외
   등록표도 매번 통째로 다시 불러왔음. 배치 시작할 때 romanization_map(3,300여개)과
   cast_name_overrides(90여개)를 딱 한 번만 통째로 가져와 메모리(Map)에 올려두고, 이후
   30명(5명씩 묶음) 처리하는 동안은 D1 안 거치고 메모리에서만 조회하도록 전면 개편. 관련
   함수들(_trySegment, _lookupToken, _translateToken, _translateTokenSequence,
   _findRawOverrideMatch, _translatePlainSegment, _translateName)이 env 대신 미리 불러온
   dicts(romanMap, overrides)를 받도록 시그니처 변경) */
/* 2026-08-04 rev.23 — work_cast.js (cast_name_overrides 매칭 방식 전면 개편 — 예전엔 배역명을
   기호 정리+토큰화한 뒤에 비교해서, 하이픈처럼 토큰 구분자로 쓰이는 기호가 낀 예외문구
   ("Man-" 등)는 등록해도 매칭이 안 됐음(rev.22에서 이 케이스만 코드로 별도 처리해야 했음).
   이제 예외문구를 배역명 원문 그대로(기호 하나도 안 지우고, 대소문자만 무시)에서 부분매칭
   먼저 찾고, 매칭된 자리 앞뒤 원문 조각만 따로 번역해서 이어붙임 — 이때 원문에서 실제로
   공백이 있던 자리만 띄어쓰고, 하이픈처럼 공백이 없던 자리는 그대로 붙여씀("Go Man-geun"
   → "고 만근"). 앞으로 이런 케이스는 코드 수정 없이 예외등록만으로 처리 가능해짐) */
/* 2026-08-04 rev.22 — work_cast.js ("Man-soo"처럼 단어 뒤에 하이픈이 바로 붙어있으면(예:
   "Man-"), romanization_map에서 그 단어 자체("man")가 아니라 하이픈 붙은 전용 항목("man-")을
   먼저 찾아보도록 수정 — 예전에는 cast_name_overrides에 "Man-"/"man-"을 등록해서 구분하려
   했는데, 예외표는 하이픈을 구분자로 없애버리는 구조라 "man"과 충돌했음(35/65번 삭제,
   romanization_map에 "man-"→"만" 신규 등록으로 이전). 원문에서 실제로 하이픈이 바로
   뒤따르는 토큰만 이 우선조회 대상이 되도록 rev.16의 구분자 정보(공백/하이픈 강제 처리 전
   원본)를 그대로 활용) */
/* 2026-08-04 rev.21 — work_cast.js (rev.20에서 예외문구 비교할 때 양쪽 다 괄호를 벗겨버려서,
   괄호 없는 "young"(→영, 이름음절)까지 "(young)"(→어린시절) 예외에 걸려버리던 문제 수정 —
   "young"과 "(young)"은 서로 다른 의미라 구분돼야 함. 괄호를 벗기지 않고 있는 그대로(괄호
   포함) 비교하도록 되돌려서, 배역명에 괄호가 있을 때만 괄호 있는 예외문구와 매칭되게 함) */
/* 2026-08-04 rev.20 — work_cast.js (_findOverrideSpan이 예외문구 비교할 때 괄호를 안 벗겨서,
   "(young)"으로 등록해둔 예외가 배역명 안의 "(Young)"과 매칭 안 되던 문제 수정 — 배역명
   토큰(tokensLower)은 이미 괄호를 벗기고 비교하는데 예외문구 쪽만 괄호 포함 상태로 비교하고
   있었음. 예외문구 토큰도 동일하게 괄호 벗겨서 비교하도록 통일(치환값 자체는 괄호 그대로
   유지되어 "(어린시절)"처럼 정상 출력됨)) */
/* 2026-08-04 rev.19 — work_cast.js (rev.18은 's 바로 앞 토큰 하나만 붙여썼는데, 이름이
   여러 단어로 쪼개진 경우(예: "Kim Min Jun's Mother")는 's 앞의 이름 전체를 다 붙여야 함 —
   's 앞에 있는 모든 구분자를 붙여쓰기(hyphen)로 강제 처리) */
/* 2026-08-04 rev.18 — work_cast.js ("Young-tak's Mother" → "영탁 의 엄마"처럼 소유격 's가
   붙는 자리까지 rev.15의 4글자 이상 띄어쓰기 규칙이 적용되던 문제 수정 — 's는 원래 별도
   토큰으로 분리하기 위해 앞에 공백을 강제로 넣어놨던 내부 처리였을 뿐, 실제로는 항상 앞
   단어에 그대로 붙어야 함. 's 앞 구분자를 무조건 hyphen(붙여쓰기) 취급하도록 수정
   ("영탁의 엄마")) */
/* 2026-08-04 rev.17 — work_cast.js (POST /admin/cast/override-save에 cast_id(선택) 추가 —
   성공/미매칭 리스트에서 "예외등록" 누르면 예외표 등록만 되고 그 배역 자체의 저장값은
   안 고쳐지던 문제 수정. cast_id 있으면 예외표 등록과 동시에 work_cast.character_name_ko도
   바로 갱신(source='manual')) */
/* 2026-08-04 rev.16 — work_cast.js ("Secretary Sun-hee"처럼 설명단어+사람이름이 섞인 경우,
   rev.15가 공백/하이픈 구분 없이 모든 토큰 사이에 무조건 띄어쓰기를 넣어서 "비서 선 희"처럼
   이름 음절까지 쪼개버리던 문제 수정 — 원문에서 공백으로 나뉜 자리만 띄어쓰고, 하이픈으로
   나뉜 자리(이름 음절)는 그대로 붙여쓰도록 구분자 종류를 기억해서 재현("비서 선희")) */
/* 2026-08-04 rev.15 — work_cast.js (일반 토큰번역(_translateTokenSequence) 결과가 4글자
   이상이면 영어 원문의 단어 구분(공백/하이픈)을 그대로 살려서 띄어쓰기 적용
   ("Company senior" → "회사시니어"가 아니라 "회사 시니어"). 3글자 이하(대부분 사람 이름)는
   기존처럼 붙여쓰기 유지. 예외단어(cast_name_overrides)가 다른 토큰이랑 합쳐질 때 무조건
   띄어쓰는 규칙(rev.14)은 글자수 상관없이 그대로 유지됨) */
/* 2026-08-04 rev.14 — work_cast.js (cast_name_overrides 예외등록 로직 개편 — ① 대소문자
   구분 없이 비교하도록 수정("middle School" 등록해놨는데 "Middle School"은 안 걸리던 문제)
   ② 배역명 전체가 예외문구와 완전히 같을 때만 적용하던 것을, 배역명 "일부"에 예외문구가
   포함돼 있어도 그 부분만 바꿔치기하도록 확장("middle School girl" → "중학교" + 나머지는
   기존 토큰번역으로 "소녀" → 공백으로 이어붙여 "중학교 소녀") */
/* 2026-08-04 rev.13 — work_cast.js (숫자만 있는 토큰(예: "8")은 romanization_map 조회 없이
   그대로 통과시키도록 수정 — "Student 8" 같은 배역명이 숫자에서 막혀 미매칭 처리되던 문제 해결) */
/* 2026-08-04 rev.12 — work_cast.js (속도개선 — 행별 번역을 완전 순차 대신 "5개씩 묶어서
   동시처리"로 변경. 완전 동시(rev.8)는 D1 과부하로 멈춘 적 있고, 완전 순차(rev.10)는
   안전하지만 느려서, 절충안으로 5개 단위 청크만 Promise.all 병렬 처리하고 청크끼리는
   순서대로 진행하도록 함) */
/* 2026-08-04 rev.11 — work_cast.js (work_cast.character_name_ko_attempted 컬럼 연동 —
   실패하면 attempted=1로 표시해두고, /admin/cast/translate-batch는 "한 번도 시도 안 한 것"만,
   신규 /admin/cast/retry-failed는 "예전에 실패한 것"만 대상으로 분리. 배치 반복할 때마다
   실패건까지 처음부터 다시 도는 문제 해결. 공용 로직은 _runBatch()로 정리) */
/* 2026-08-04 rev.10 — work_cast.js (rev.8의 병렬처리가 D1에 순간적으로 요청이 너무 많이
   몰려서 배치가 아예 멈추는 문제를 일으켜서, 안정성 위해 행별 처리·2조각 분해 둘 다
   순차 처리로 되돌림. UPDATE는 env.DB.batch()로 모아서 쓰는 것만 유지) */
/* 2026-08-04 rev.9 — work_cast.js ("Jang 'Woo-gi' Wook"처럼 닉네임을 감싸는 작은따옴표 때문에
   매칭 실패하던 문제 수정 — 토큰 앞뒤 따옴표를 벗겨냄. "'s"(의) 토큰은 그대로 보호) */
/* 2026-08-04 rev.8 — work_cast.js (① self/himself/herself 규칙을 코드에 반영 — work_cast.name
   (배우이름) 그대로 사용, SQL 임시처리 대신 배치 돌릴 때마다 자동 적용됨 ② 속도개선 — 행별
   번역/2조각분해 조회를 순차 대기 대신 Promise.all로 병렬 처리, UPDATE도 env.DB.batch()로
   한번에 ③ id 커서(after_id) 도입 — 같은 회차 안에서 미매칭 30건을 무한 재조회하던 버그
   수정, 응답에 last_id 추가) */
/* 2026-08-04 rev.7 — work_cast.js (분해 로직을 "정확히 2조각"으로 제한 — 재귀적으로 여러
   조각 시도하던 방식이 "Reason"→"레아손"처럼 일반 영어 단어까지 억지로 끼워맞추는 문제가
   있어서, 앞+뒤 둘 다 매칭표에 있는 딱 2음절짜리 케이스("Munju"→문+주)만 구제하도록 축소) */
/* 2026-08-04 rev.6 — work_cast.js (① 기호 처리 방식 전면 개편 — 괄호( )는 유지하고 안쪽도
   번역, 그 외 기호(마침표·대괄호·물음표·콤마 등)는 전부 제거하는 방식으로 통일(마침표/대괄호
   전용 처리 제거) ② "Munju"처럼 음절 경계 없이 붙은 토큰을 앞에서부터 긴 조각 우선으로
   분해 시도하는 _trySegment 신규 — romanization_map 조합으로 재구성 가능하면 매칭 성공 처리) */
/* 2026-08-04 rev.5 — work_cast.js (앞부분 번역이 한글 3글자 이상 나오면, 뒤에 막히는 토큰이
   있어도 거기서 끊고 성공 처리하도록 변경 — "Kim Hyun Seok [2018 - serial killer]"처럼
   이름 뒤에 부가설명이 붙는 경우, 이름만 번역되면 충분하다고 판단) */
/* 2026-08-04 rev.4 — work_cast.js ("[Panelist]"처럼 대괄호가 단어에 붙어 매칭 실패하던 문제
   수정 — 쪼개기 전에 대괄호 제거 */
/* 2026-08-04 rev.3 — work_cast.js ("Bak's"처럼 어퍼스트로피로 붙은 's가 통째로 한 토큰이 되어
   매칭 실패하던 문제 수정 — 쪼개기 전에 "'s" 앞에 공백을 넣어 별도 토큰으로 분리 */
/* 2026-08-04 rev.2 — work_cast.js (cast_name_overrides 예외표 신규 연동 — 음절 쪼개기 전에
   통째 이름 예외 먼저 확인. POST /admin/cast/override-save 신규(예외 등록/수정)) */
/* 2026-08-04 rev.1 — work_cast.js (신규 — 배역명(character_name) 한글화 전용 어드민 API.
   ① POST /admin/cast/translate-batch: 미번역 한국작품 배역을 romanization_map으로 자동매칭,
      성공/실패 리스트 반환 ② POST /admin/cast/save: 관리자 수동 입력 저장(source=manual)
      ③ GET /admin/cast/search: 영어 배역명 검색(작품명·배우명·현재 번역상태 같이 반환) */
import { _checkAuth } from "../utils/authUtils.js";

// [2026-08-04 신규/rev.24] "Munju"(문+주)처럼 딱 2음절이 붙어있는 케이스만 조심스럽게 구제.
// 여러 조각으로 자유롭게 재귀 분해하면 "Reason"→"레아손"처럼 엉뚱한 영어 단어까지
// 억지로 끼워맞춰지는 문제가 있어서, "정확히 2조각(앞+뒤 둘 다 매칭표에 있어야 함)"으로만
// 제한. 3조각 이상 분해는 시도하지 않음. [rev.24] romanMap은 미리 불러온 Map — D1 조회 없음.
function _trySegment(token, romanMap) {
  if (token.length < 2) return null;
  for (let i = token.length - 1; i >= 1; i--) {
    const first = token.slice(0, i);
    const second = token.slice(i);
    const h1 = romanMap.get(first);
    const h2 = romanMap.get(second);
    if (h1 !== undefined && h2 !== undefined) return h1 + h2;
  }
  return null;
}

// 순수 로마자 토큰(괄호 없는 상태) 하나 번역 — [rev.22] hyphenSuffix가 true면(원문에서 이
// 토큰 바로 뒤에 하이픈이 있었으면) "단어-" 항목을 먼저 찾아보고, 없으면 원래처럼 통째
// 매칭 → 분해 순서로 진행. [rev.24] romanMap(Map)에서 바로 조회 — D1 조회 없음.
function _lookupToken(token, romanMap, hyphenSuffix) {
  if (hyphenSuffix) {
    const hyphenHangul = romanMap.get(token + "-");
    if (hyphenHangul !== undefined) return hyphenHangul;
  }
  const hangul = romanMap.get(token);
  if (hangul !== undefined) return hangul;
  return _trySegment(token, romanMap);
}

// [2026-08-04 신규] 토큰 하나를 처리 — 괄호로 감싸져 있으면(예: "(voice)") 괄호는 유지하고
// 안쪽 내용만 번역해서 다시 괄호로 감싸 반환. 괄호 없으면 토큰 자체를 번역.
// [신규] 대괄호 "[ ]"도 소괄호와 완전히 동일하게 처리 — 안쪽 내용은 정상적으로 번역
// 시도하고, 대괄호 기호만 유지해서 다시 감쌈("[Chairman]" → "[회장]").
function _translateToken(rawToken, romanMap, hyphenSuffix) {
  const openParen = rawToken.startsWith("(");
  const closeParen = rawToken.endsWith(")");
  const openBracket = rawToken.startsWith("[");
  const closeBracket = rawToken.endsWith("]");
  let inner = rawToken;
  if (openParen) inner = inner.replace(/^\(/, "");
  if (closeParen) inner = inner.replace(/\)$/, "");
  if (openBracket) inner = inner.replace(/^\[/, "");
  if (closeBracket) inner = inner.replace(/\]$/, "");
  if (!inner) return null;
  const wrap = (s) =>
    (openParen ? "(" : "") + (openBracket ? "[" : "") +
    s +
    (closeBracket ? "]" : "") + (closeParen ? ")" : "");
  // [신규] 이미 한글인 토큰(예: 괄호 안 "경수")은 로마자 매칭표에 애초에 없으니 조회 없이
  // 그대로 통과. "Kyeong-soo (경수)"의 "(경수)"가 여기 해당.
  if (/^[가-힣]+$/.test(inner)) {
    return wrap(inner);
  }
  // [rev.13] 숫자만 있는 토큰(예: "8")은 매칭표에서 찾을 필요 없이 그대로 통과
  if (/^\d+$/.test(inner)) {
    return wrap(inner);
  }
  const hangul = _lookupToken(inner, romanMap, hyphenSuffix);
  if (hangul === null) return null;
  return wrap(hangul);
}

// [rev.16] 토큰 배열 하나를 이어붙여 번역 — delimTypes[i]는 tokens[i]와 tokens[i+1] 사이의
// 원문 구분자 종류('space' | 'hyphen'). 4글자 이상일 때 'space' 자리만 띄우고 'hyphen'
// 자리(이름 음절 구분용)는 그대로 붙여써서 원문 구분을 재현함.
// [rev.22] hyphenFlags[i]가 true면 tokens[i]는 원문에서 바로 뒤에 하이픈이 붙어있던
// 토큰이라, 조회할 때 "단어-" 전용 항목을 우선 찾아봄("Man-"→"만" vs "man"→"남자" 구분).
// [rev.24] romanMap은 미리 불러온 Map — D1 조회 없이 동기로 처리.
// [신규] partialMode(=true일 때, "미매칭 재시도" 버튼에서만 사용): 앞부분이 막히기 전까지
// 이미 3글자 이상이라는 조건 없이, 막힌 지점부터 끝까지는 원문(영어) 그대로 이어붙여서
// 저장. "▶ 자동번역 배치 실행"(partialMode=false)에서는 기존 동작(3글자 미만이면 실패
// 처리) 그대로 유지.
function _translateTokenSequence(tokens, delimTypes, hyphenFlags, romanMap, partialMode) {
  if (tokens.length === 0) return { ok: true, hangul: "" };

  const results = tokens.map((t, i) =>
    _translateToken(t.toLowerCase(), romanMap, hyphenFlags && hyphenFlags[i])
  );

  // 앞에서부터 순서대로 이어붙이다가 막히는 토큰이 나오면 거기서 멈춤. 거기까지 이어붙인
  // 한글이 이미 3글자 이상이면(=사람 이름 정도는 나온 걸로 판단) 그걸로 성공 처리하고
  // 나머지(예: "[2018 - serial killer]" 같은 부가설명)는 그냥 버림.
  const pieces = [];
  let stopIndex = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    if (results[i] === null) { stopIndex = i; break; }
    pieces.push(results[i]);
  }

  // [신규] 바로 앞 조각이 괄호 안 내용과 똑같으면(예: "경수" 다음에 "(경수)") 중복이니
  // 괄호 조각과 그 앞 구분자를 제거. "Kyeong-soo (경수)" → "경수 (경수)"가 아니라 "경수"만.
  // (원본 pieces/delimTypes는 아래 partialMode 꼬리 이어붙이기에서 그대로 써야 하므로,
  // 복사본에서만 dedup 처리)
  const dedupPieces = pieces.slice();
  const dedupDelims = delimTypes.slice(0, pieces.length - 1);
  for (let i = dedupPieces.length - 1; i >= 1; i--) {
    const m = /^\((.+)\)$/.exec(dedupPieces[i]);
    if (m && dedupPieces.slice(0, i).join("") === m[1]) {
      dedupPieces.splice(i, 1);
      dedupDelims.splice(i - 1, 1);
    }
  }

  const concatenated = dedupPieces.join("");
  const fullMatch = stopIndex === tokens.length;
  if (fullMatch || concatenated.length >= 3) {
    let hangul;
    if (concatenated.length >= 4) {
      // [rev.15/16] 4글자 이상이면 설명형 배역명으로 보고, 원문에서 공백이었던 자리만
      // 띄어씀. 하이픈이었던 자리(이름 음절 구분용)는 그대로 붙여씀.
      hangul = dedupPieces.reduce((acc, piece, i) => {
        if (i === 0) return piece;
        const delim = dedupDelims[i - 1];
        return acc + (delim === "space" ? " " : "") + piece;
      }, "");
    } else {
      hangul = concatenated;
    }
    return { ok: true, hangul };
  }

  // [신규] 미매칭 재시도(partialMode)에서만: 앞부분이 최소 한 토큰이라도 번역됐으면
  // (3글자 기준 없이) 그걸 인정하고, 막힌 지점부터 끝까지는 원문 토큰을 구분자 살려서
  // 그대로 이어붙임. 예: "Kang Detective" → "강 Detective"
  if (partialMode && pieces.length > 0) {
    let hangul = dedupPieces.reduce((acc, piece, i) => {
      if (i === 0) return piece;
      const delim = dedupDelims[i - 1];
      return acc + (delim === "space" ? " " : "") + piece;
    }, "");
    const remainderRaw = tokens.slice(stopIndex).reduce((acc, t, idx) => {
      if (idx === 0) return t;
      const delim = delimTypes[stopIndex + idx - 1];
      return acc + (delim === "space" ? " " : "") + t;
    }, "");
    const sepBeforeRemainder = delimTypes[stopIndex - 1] === "space" ? " " : "";
    hangul += sepBeforeRemainder + remainderRaw;
    return { ok: true, hangul };
  }

  const failedTokens = tokens.filter((t, i) => results[i] === null);
  if (failedTokens.length > 0) {
    return { ok: false, tokens: failedTokens };
  }
  return { ok: true, hangul: concatenated };
}

// [신규] 문자 하나가 "단어를 이루는 글자"(영문/숫자/한글)인지 판별 — 경계 체크용
function _isWordChar(ch) {
  return ch !== undefined && /[A-Za-z0-9가-힣]/.test(ch);
}

// [rev.23] cast_name_overrides에 등록된 문구를 배역명 원문(rawName) 그대로 — 기호 하나도
// 지우지 않고 대소문자만 무시 — 부분매칭. 여러 개 걸리면 가장 긴 문구를 우선 채택.
// [신규] 단어 경계에서만 매칭 — "man"이 등록돼 있어도 "Commander"나 "Department" 안에
// 낀 "man"은 안 걸리고, "Delivery Man"처럼 진짜 독립된 단어일 때만 걸림.
// 찾으면 { start, end, hangul } 반환(end는 배타적, 원문 인덱스 기준), 없으면 null.
// [rev.24] overrides는 미리 불러온 배열 — D1 조회 없이 동기로 처리.
function _findRawOverrideMatch(rawName, overrides) {
  if (!overrides || overrides.length === 0) return null;

  const lowerName = rawName.toLowerCase();
  let best = null;
  for (const r of overrides) {
    const needle = r.original.toLowerCase();
    if (!needle) continue;
    let searchFrom = 0;
    while (true) {
      const idx = lowerName.indexOf(needle, searchFrom);
      if (idx === -1) break;
      const beforeChar = idx > 0 ? lowerName[idx - 1] : undefined;
      const afterChar = idx + needle.length < lowerName.length ? lowerName[idx + needle.length] : undefined;
      if (!_isWordChar(beforeChar) && !_isWordChar(afterChar)) {
        if (!best || needle.length > best.original.length) {
          best = { start: idx, end: idx + needle.length, hangul: r.hangul, original: r.original };
        }
        break;
      }
      searchFrom = idx + 1;
    }
  }
  return best;
}

// [rev.23] 예외문구 없이 순수 토큰 번역만 수행 — 기존 _translateName 본문에 있던 토큰화+
// 번역 로직을 재사용 가능하게 분리(예외문구 앞/뒤로 남는 원문 조각도 이 함수로 각각 번역)
// [rev.24] romanMap은 미리 불러온 Map — D1 조회 없이 동기로 처리.
function _translatePlainSegment(rawSegment, romanMap, partialMode) {
  // [신규] 둥근따옴표(’, U+2019 등)를 일반 작은따옴표(')로 통일 — 안 그러면 "Hyun's"의
  // 's가 앞 단어에 안 붙고("Hyuns"로 뭉쳐서 매칭 실패) 't까지 다 밀려버림.
  const trimmed = rawSegment.trim().replace(/[\u2018\u2019\u02BC]/g, "'");
  if (!trimmed) return { ok: true, hangul: "" };

  // 괄호( )는 유지, 그 외 기호(마침표·대괄호·물음표·콤마 등)는 전부 제거.
  // [신규] 한글(가-힣)도 지우지 않고 유지 — 배역명에 "Kyeong-soo (경수)"처럼 이미 한글이
  // 괄호 안에 들어있는 경우, 예전엔 여기서 한글이 통째로 지워져서 빈 "()"만 남고 그게
  // 매칭 실패로 떴었음(막힌 음절: "()"). 한글을 살려두면 아래 _translateToken에서
  // "이미 한글인 토큰"으로 판별해 그대로 통과시킬 수 있음.
  // 어퍼스트로피 's는 "Bak's"처럼 붙어오므로 별도 토큰으로 분리(앞에 공백 삽입).
  const symbolsCleaned = trimmed.replace(/[^A-Za-z0-9가-힣\s\-'()\[\]]/g, "");
  const normalized = symbolsCleaned.replace(/'s\b/gi, " 's");

  // [rev.16] 공백/하이픈 구분자를 캡처 그룹으로 살려서 쪼갬 — 짝수 인덱스는 토큰,
  // 홀수 인덱스는 그 앞뒤 토큰을 나눈 구분자 원문(공백묶음 또는 하이픈묶음)
  const rawParts = normalized.split(/([\s-]+)/).filter((p) => p !== "");
  const tokens = [];
  const delimTypes = []; // delimTypes[i] = tokens[i]와 tokens[i+1] 사이 구분자 종류

  for (let i = 0; i < rawParts.length; i++) {
    if (i % 2 === 0) {
      let t = rawParts[i];
      // [2026-08-04 신규] "'Woo-gi'"처럼 닉네임을 감싸는 따옴표는 벗겨냄. "'s" 토큰 자체는 보호.
      if (t !== "'s") {
        t = t.replace(/^'+/, "").replace(/'+$/, "");
      }
      if (t) {
        tokens.push(t);
      } else if (delimTypes.length > 0) {
        // 정리 후 빈 토큰이 되면(드문 케이스) 앞뒤 구분자를 하나로 합침(공백 우선)
        delimTypes[delimTypes.length - 1] = "space";
      }
    } else {
      // 하이픈이 하나라도 섞여있으면 공백은 무시하고 hyphen으로 판단하지 않고,
      // 반대로 공백이 하나라도 섞여있으면 무조건 'space'로 취급(단어 구분 우선)
      delimTypes.push(rawParts[i].includes(" ") ? "space" : "hyphen");
    }
  }
  if (tokens.length === 0) return { ok: false, tokens: [] };

  // [rev.22] 's 강제처리(아래)로 delimTypes가 바뀌기 전에, "이 토큰 바로 뒤에 실제로
  // 하이픈이 있었는지"를 hyphenFlags로 미리 스냅샷 떠둠(조회용, 화면 띄어쓰기용 delimTypes와
  // 별개로 유지)
  const hyphenFlags = tokens.map((_, i) => delimTypes[i] === "hyphen");

  // [rev.18/19] 's는 "Bak's"처럼 항상 앞 이름에 그대로 붙어야 하는 소유격 — 별도 토큰으로
  // 분리하기 위해 넣었던 공백은 실제 띄어쓰기가 아님. 's가 나오면 그 앞에 있는 이름 전체
  // (여러 단어로 쪼개져 있어도 전부)를 붙여쓰기(hyphen)로 강제해서 "영탁 의 엄마"가 아니라
  // "영탁의 엄마"가 되도록 함.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "'s" && i > 0) {
      for (let k = 0; k < i; k++) {
        delimTypes[k] = "hyphen";
      }
    }
  }

  return _translateTokenSequence(tokens, delimTypes, hyphenFlags, romanMap, partialMode);
}

// [신규/rev.23] 배역명 문자열 하나를 번역 — ① cast_name_overrides에서 원문(rawName) 그대로
// (기호 하나도 안 지우고, 대소문자만 무시) 부분매칭되는 문구를 먼저 찾음. 찾으면 매칭된
// 자리 앞/뒤 원문 조각을 각각 _translatePlainSegment로 번역하고, 매칭 자리 바로 앞/뒤에
// 원문에 실제 공백이 있었으면 그 자리만 띄우고(하이픈처럼 공백이 없던 자리는 그대로 붙임)
// 이어붙임("Go Man-geun" → "고 만근", "middle School girl" → "중학교 소녀").
// ② 매칭이 아예 없으면 전체를 _translatePlainSegment로 번역.
// [rev.24] dicts = { romanMap, overrides } — 배치 시작할 때 미리 불러온 것. D1 조회 없음.
function _translateName(rawName, dicts, partialMode) {
  // [신규] 대괄호 "[...]"는 앞/뒤 텍스트와 안쪽 내용을 각각 따로(재귀적으로) 번역한 뒤
  // "[안쪽번역]" 형태로 다시 합침. 대괄호를 포함해서 통째로 토큰화하면 글자 수가 늘어나며
  // rev.15/16의 "4글자 이상이면 띄어쓰기" 규칙이 잘못 걸려 "Jang Guk Han"같은 실제
  // 이름까지 "장 국 한"처럼 음절이 벌어지는 부작용이 있어서, 이름 부분은 원래 로직대로
  // 따로 처리하고 대괄호 안쪽만 별도로 번역해 붙임.
  const bracketMatch = /\[([^\]]*)\]/.exec(rawName);
  if (bracketMatch) {
    const bStart = bracketMatch.index;
    const bEnd = bStart + bracketMatch[0].length;
    const innerContent = bracketMatch[1];
    const rawPrefix = rawName.slice(0, bStart);
    const rawSuffix = rawName.slice(bEnd);
    const beforeB = _translateName(rawPrefix, dicts, partialMode);
    const afterB = _translateName(rawSuffix, dicts, partialMode);
    const innerB = _translateName(innerContent, dicts, partialMode);
    const leftSepB = bStart > 0 ? rawName[bStart - 1] : null;
    const rightSepB = bEnd < rawName.length ? rawName[bEnd] : null;

    if (beforeB.ok && afterB.ok && innerB.ok) {
      let hangul = "";
      if (beforeB.hangul) hangul += beforeB.hangul + (leftSepB === " " ? " " : "");
      hangul += `[${innerB.hangul}]`;
      if (afterB.hangul) hangul += (rightSepB === " " ? " " : "") + afterB.hangul;
      return { ok: true, hangul };
    }
    if (partialMode) {
      const beforeHangulB = beforeB.ok ? beforeB.hangul : rawPrefix.trim();
      const afterHangulB = afterB.ok ? afterB.hangul : rawSuffix.trim();
      const innerHangulB = innerB.ok ? innerB.hangul : innerContent.trim();
      let hangul = "";
      if (beforeHangulB) hangul += beforeHangulB + (leftSepB === " " ? " " : "");
      hangul += `[${innerHangulB}]`;
      if (afterHangulB) hangul += (rightSepB === " " ? " " : "") + afterHangulB;
      return { ok: true, hangul };
    }
    const failedTokensB = [
      ...(beforeB.ok ? [] : beforeB.tokens || []),
      ...(innerB.ok ? [] : innerB.tokens || []),
      ...(afterB.ok ? [] : afterB.tokens || []),
    ];
    return { ok: false, tokens: failedTokensB };
  }

  const match = _findRawOverrideMatch(rawName, dicts.overrides);
  if (match) {
    const rawPrefix = rawName.slice(0, match.start);
    const rawSuffix = rawName.slice(match.end);
    const beforeR = _translatePlainSegment(rawPrefix, dicts.romanMap, partialMode);
    const afterR = _translatePlainSegment(rawSuffix, dicts.romanMap, partialMode);
    const leftSep = match.start > 0 ? rawName[match.start - 1] : null;
    const rightSep = match.end < rawName.length ? rawName[match.end] : null;

    if (beforeR.ok && afterR.ok) {
      let hangul = "";
      if (beforeR.hangul) {
        hangul += beforeR.hangul + (leftSep === " " ? " " : "");
      }
      hangul += match.hangul;
      if (afterR.hangul) {
        hangul += (rightSep === " " ? " " : "") + afterR.hangul;
      }
      return { ok: true, hangul };
    }

    // [신규] partialMode(미매칭 재시도)에서는, 예외등록 문구(match) 앞/뒤 중 한쪽이
    // 완전히 실패해도 통째로 버리지 않음 — 성공한 쪽은 번역된 걸로, 실패한 쪽은 원문
    // 그대로 붙여서 최소한 match(예외등록된 부분)와 성공한 쪽은 살려서 저장.
    // 예: "Biru (segment "I Saw You")" — "I Saw You"가 실패해도 "Biru"랑 "segment"
    // 번역된 건 살아남음.
    if (partialMode) {
      const beforeHangul = beforeR.ok ? beforeR.hangul : rawPrefix.trim();
      const afterHangul = afterR.ok ? afterR.hangul : rawSuffix.trim();
      let hangul = "";
      if (beforeHangul) {
        hangul += beforeHangul + (leftSep === " " ? " " : "");
      }
      hangul += match.hangul;
      if (afterHangul) {
        hangul += (rightSep === " " ? " " : "") + afterHangul;
      }
      return { ok: true, hangul };
    }

    const failedTokens = [
      ...(beforeR.ok ? [] : beforeR.tokens),
      ...(afterR.ok ? [] : afterR.tokens),
    ];
    return { ok: false, tokens: failedTokens };
  }

  return _translatePlainSegment(rawName, dicts.romanMap, partialMode);
}

// [rev.24] 배치 시작할 때 romanization_map·cast_name_overrides를 딱 한 번만 통째로 불러와
// 메모리에 올려둠 — 이후 배역 하나하나 번역할 때 D1을 더 이상 거치지 않도록 함
async function _loadDicts(env) {
  const [romanResult, overrideResult] = await Promise.all([
    env.DB.prepare(`SELECT roman, hangul FROM romanization_map`).all(),
    env.DB.prepare(`SELECT original, hangul FROM cast_name_overrides`).all(),
  ]);
  const romanMap = new Map();
  for (const row of romanResult.results || []) {
    romanMap.set(row.roman.toLowerCase(), row.hangul);
  }
  return { romanMap, overrides: overrideResult.results || [] };
}

// [2026-08-04 신규] 배치 실행 공용 함수 — retryFailed=false면 "한 번도 시도 안 한 것"만,
// true면 "예전에 실패해서 character_name_ko_attempted=1로 표시된 것"만 대상으로 함.
// 실패하면 character_name_ko_attempted=1로 표시해둬서, 다음부터 "자동번역배치"(미시도용)
// 에는 안 걸리고 "미매칭 재시도" 버튼에서만 다시 만나도록 분리함.
// [rev.24] 대상 목록 조회와 동시에 매칭표/예외표를 한 번만 불러오고(_loadDicts), 그 이후
// 번역은 D1 조회 없이 메모리에서 동기로 처리 — 예전 5개씩 청크 병렬처리(rev.12)는 D1 왕복이
// 없어져서 더 이상 필요 없어짐(청크 로직 제거, 그냥 한 번에 map)
async function _runBatch(env, { afterId, limit, retryFailed }) {
  const attemptedCond = retryFailed
    ? "wc.character_name_ko_attempted = 1"
    : "wc.character_name_ko_attempted IS NULL";

  const [{ results }, dicts] = await Promise.all([
    env.DB.prepare(
      `SELECT wc.id, wc.character_name, wc.name AS actor_name, w.title_ko
       FROM work_cast wc
       JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
       WHERE w.original_language = 'ko'
         AND wc.character_name_ko IS NULL
         AND ${attemptedCond}
         AND wc.character_name IS NOT NULL AND wc.character_name != ''
         AND wc.id > ?
       ORDER BY wc.id ASC
       LIMIT ?`
    ).bind(afterId, limit).all(),
    _loadDicts(env),
  ]);

  const rows = results || [];
  const succeeded = [];
  const failed = [];
  let lastId = afterId;

  // [rev.24] 매칭표/예외표가 이미 메모리에 있어서 D1 왕복 없이 동기로 바로 처리
  const translations = rows.map((row) => {
    if (/self|himself|herself/i.test(row.character_name)) {
      return row.actor_name
        ? { ok: true, hangul: row.actor_name }
        : { ok: false, tokens: ["(배우 한글이름 없음)"] };
    }
    return _translateName(row.character_name, dicts, retryFailed);
  });

  const updateStmts = [];
  rows.forEach((row, i) => {
    if (row.id > lastId) lastId = row.id;
    const r = translations[i];
    if (r.ok) {
      updateStmts.push(
        env.DB.prepare(
          `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'auto' WHERE id = ?`
        ).bind(r.hangul, row.id)
      );
      succeeded.push({
        id: row.id, work: row.title_ko, actor: row.actor_name,
        original: row.character_name, translated: r.hangul,
      });
    } else {
      updateStmts.push(
        env.DB.prepare(
          `UPDATE work_cast SET character_name_ko_attempted = 1 WHERE id = ?`
        ).bind(row.id)
      );
      failed.push({
        id: row.id, work: row.title_ko, actor: row.actor_name,
        original: row.character_name, missing_tokens: r.tokens,
      });
    }
  });
  if (updateStmts.length > 0) {
    await env.DB.batch(updateStmts);
  }

  const remainRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM work_cast wc
     JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
     WHERE w.original_language = 'ko' AND wc.character_name_ko IS NULL
       AND ${attemptedCond}
       AND wc.character_name IS NOT NULL AND wc.character_name != ''`
  ).first();

  return { ok: true, succeeded, failed, remaining: remainRow?.cnt || 0, last_id: lastId };
}

export async function handleWorkCast(path, request, env, url, headers) {
  try {
    // ── POST /admin/cast/translate-batch ──────────────────────
    // body: { limit?, after_id? }  기본 30, 최대 100
    // "한 번도 시도 안 한 것"만 대상(character_name_ko_attempted가 아직 NULL인 것)
    if (path === "/admin/cast/translate-batch" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 100);
      const afterId = parseInt(body.after_id) || 0;
      const result = await _runBatch(env, { afterId, limit, retryFailed: false });
      return new Response(JSON.stringify(result), { headers });
    }

    // ── POST /admin/cast/retry-failed ──────────────────────────
    // body: { limit?, after_id? }  — "예전에 실패해서 attempted=1로 표시된 것"만 재시도.
    // 매칭표(romanization_map)에 단어를 추가한 뒤, 실패했던 것만 다시 돌려보는 용도.
    if (path === "/admin/cast/retry-failed" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(parseInt(body.limit) || 30, 100);
      const afterId = parseInt(body.after_id) || 0;
      const result = await _runBatch(env, { afterId, limit, retryFailed: true });
      return new Response(JSON.stringify(result), { headers });
    }

    // ── POST /admin/cast/override-save ────────────────────────
    // body: { original, hangul, cast_id? } — "Sam Kim"→"샘킴" 같은 통째 예외 등록/수정.
    // [rev.17] cast_id가 같이 오면(성공/미매칭 리스트에서 등록한 경우), 예외표 등록과
    // 동시에 해당 work_cast 행의 character_name_ko도 바로 이 값으로 갱신함.
    if (path === "/admin/cast/override-save" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const original = (body.original || "").trim();
      const hangul = (body.hangul || "").trim();
      const castId = parseInt(body.cast_id);
      if (!original || !hangul) {
        return new Response(JSON.stringify({ ok: false, message: "original과 hangul이 필요해요" }), { status: 400, headers });
      }
      const stmts = [
        env.DB.prepare(
          `INSERT INTO cast_name_overrides (original, hangul) VALUES (?, ?)
           ON CONFLICT(original) DO UPDATE SET hangul = excluded.hangul`
        ).bind(original, hangul),
      ];
      if (castId) {
        stmts.push(
          env.DB.prepare(
            `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'manual' WHERE id = ?`
          ).bind(hangul, castId)
        );
      }
      await env.DB.batch(stmts);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── POST /admin/cast/save ─────────────────────────────────
    // body: { id, character_name_ko }  — 관리자 수동 입력/수정
    if (path === "/admin/cast/save" && request.method === "POST") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const body = await request.json().catch(() => ({}));
      const id = parseInt(body.id);
      const ko = (body.character_name_ko || "").trim();
      if (!id || !ko) {
        return new Response(JSON.stringify({ ok: false, message: "id와 character_name_ko가 필요해요" }), { status: 400, headers });
      }
      await env.DB.prepare(
        `UPDATE work_cast SET character_name_ko = ?, character_name_ko_source = 'manual' WHERE id = ?`
      ).bind(ko, id).run();
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // ── GET /admin/cast/search?q=... ──────────────────────────
    // 영어 배역명(character_name) 검색 — 앞부분 일치, 최대 50건
    if (path === "/admin/cast/search" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ ok: true, data: [] }), { headers });
      }
      const { results } = await env.DB.prepare(
        `SELECT wc.id, wc.character_name, wc.character_name_ko, wc.character_name_ko_source,
                wc.name AS actor_name, w.title_ko
         FROM work_cast wc
         JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
         WHERE w.original_language = 'ko' AND wc.character_name LIKE ? ESCAPE '\\'
         ORDER BY wc.billing_order ASC
         LIMIT 50`
      ).bind(q + "%").all();

      return new Response(JSON.stringify({ ok: true, data: results || [] }), { headers });
    }

    // ── GET /admin/cast/unmatched-list?after_id=&limit= ────────
    // 번역을 다시 시도하지 않고, 지금 미매칭으로 남아있는 배역만 빠르게 조회.
    // (예전에 실패해서 attempted=1로 표시됐고, 아직 character_name_ko가 안 채워진 것)
    if (path === "/admin/cast/unmatched-list" && request.method === "GET") {
      if (!_checkAuth(request, env)) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers });
      }
      const limit = Math.min(parseInt(url.searchParams.get("limit")) || 50, 100);
      const afterId = parseInt(url.searchParams.get("after_id")) || 0;

      const { results } = await env.DB.prepare(
        `SELECT wc.id, wc.character_name AS original, wc.name AS actor, w.title_ko AS work
         FROM work_cast wc
         JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
         WHERE w.original_language = 'ko' AND wc.character_name_ko IS NULL
           AND wc.character_name_ko_attempted = 1
           AND wc.character_name IS NOT NULL AND wc.character_name != ''
           AND wc.id > ?
         ORDER BY wc.id ASC
         LIMIT ?`
      ).bind(afterId, limit).all();

      const lastId = results.length ? results[results.length - 1].id : afterId;

      const remainRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM work_cast wc
         JOIN works w ON w.tmdb_id = wc.tmdb_id AND w.media_type = wc.media_type
         WHERE w.original_language = 'ko' AND wc.character_name_ko IS NULL
           AND wc.character_name_ko_attempted = 1
           AND wc.character_name IS NOT NULL AND wc.character_name != ''
           AND wc.id > ?`
      ).bind(lastId).first();

      return new Response(JSON.stringify({
        ok: true, items: results || [], last_id: lastId, remaining: remainRow?.cnt || 0,
      }), { headers });
    }

    return new Response(JSON.stringify({ ok: false, message: "Not found" }), { status: 404, headers });
  } catch (e) {
    console.log("[work_cast] error:", e.message);
    return new Response(JSON.stringify({ ok: false, message: e.message }), { status: 500, headers });
  }
}
