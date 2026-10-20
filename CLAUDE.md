# CLAUDE.md — 김비서(kimbiseo) 작업 가이드

> 김기봉 개인 전용 음성 비서 PWA. 식용유니버스(HIVEOIL)와 **완전히 분리**된 프로젝트(저장소·DB 모두 별도).

## 목표
- 음성(또는 Wispr Flow 키보드)으로 "10월 16일 18시 면접 넣어줘" → 일정 저장.
- 📅 일정(날짜·시간) / 📝 메모(날짜 없는 생각, 선택적으로 날짜에 붙임) / 💕 D-day(사귄 지·아이 N일·매년 기념일) 구분 관리.
- 🔍 기억 찾기: 정확한 단어가 아니어도 비슷한 뜻으로 찾기(2단계 Claude).
- 🌅 매일 아침 브리핑 푸시(3단계).

## 기술 스택
- 단일 `index.html`(인라인 CSS·JS) + `manifest.json` + `sw.js` + GitHub Pages. 서버는 Supabase(김비서 전용 프로젝트, 무료 조직 권장 — HIVEOIL 프로젝트와 섞지 않음).
- 버전: `index.html`의 `<meta name="app-build-version">`과 `window.APP_BUILD`를 **둘 다 동일하게** 올린다. `sw.js`의 `CACHE` 이름도 같이.
- 문법 검증: 인라인 `<script>` 추출 후 `node --check`.

## 작업 규칙
- 부분 수정 기본, 전체 재작성은 요청 시만.
- 작업 브랜치에 커밋·푸시 후 버전·수정 위치·영향 범위 보고. 운영자가 **"올려줘"** 할 때만 main 반영.
- 개인 데이터: 저장소는 Public(GitHub Pages)이므로 **데이터·API 키를 절대 커밋하지 않는다.** Claude API 키는 Supabase Edge Function 비밀값으로만.

## 데이터 구조 (v1: localStorage `kbs_data_v1` = `{ver, items:[]}`)
- 일정 `{id, type:'event', date:'YYYY-MM-DD', time:'HH:MM'|null, title, note, created, updated, src?}`
- 메모 `{id, type:'memo', text, date|null, done, created, updated}`
- D-day `{id, type:'dday', title, date, kind:'since'|'until'|'yearly'}` — since는 첫날=1일.
- 설정 백업/불러오기(JSON, id 기준 합치기 — 기존 항목 유지).

## 주요 함수
- `parseCommand(text)` — 규칙 기반 한국어 해석(날짜: YYYY-MM-DD·M월 D일·M/D·N일 뒤·오늘~글피·(이번/다음/다다음)주 X요일·D일 / 시간: HH:MM·오전/오후/저녁 H시 (반|M분)·정오, 오전·오후 없는 1~7시는 오후). 결과 kind = event/memo/find. 날짜 없으면 메모.
- `onAsk(fromVoice)` → 미리보기(`showPreview`) → `confirmPending`. 음성 입력이면 읽어 주고 8초 뒤 자동 저장(취소 가능 — 운전 중 화면 안 봐도 되게).
- `toggleMic()` — Chrome Web Speech(ko-KR). `?voice=1` 주소로 열면 바로 듣기 시도(빅스비 빠른 명령어용, 브라우저가 막으면 버튼).
- `ddayInfo(x)` — 표시값·다음 기념일(100일 단위/N주년)·남은 날.

## 단계
- **v1 (완료)**: 화면 뼈대(달력·메모·D-day·찾기), 이 기기 저장, 규칙 해석, 음성 입력·읽어 주기, 백업.
- **2단계**: Supabase 동기화(PC↔폰), Claude(Haiku) 해석·비슷한 뜻 찾기(Edge Function, 실패 시 규칙 해석 폴백), 음력 기념일.
- **3단계**: 아침 브리핑 웹푸시(pg_cron + Edge Function), 빅스비 빠른 명령어 연결 안내.

## 이력
- v1-skeleton (2026-10-20): 최초 뼈대.
- v2-clean-ui (2026-10-20): 깔끔한 화면으로 정리(이모지 최소화) — 흰 머리글 + PC 상단 탭(폰은 하단 탭, 선 아이콘), 큰 흰 패널, 달력 칸 = 둥근 회색 상자 + 종류별 색 라벨(일정 초록·메모 노랑·D-day 주황), 체크 칩으로 종류 켜고 끄기(`calShow`), PC 오른쪽/폰 아래 '선택한 날' 패널(`sideHtml` — 그날 항목 + 30일 안 D-day). 오늘 = 날짜 숫자 검은 배지. 로직·저장 구조 불변.

## 디자인 규칙
- 이모지 쓰지 않음(아이콘은 인라인 SVG 선 아이콘 `IC`). 색 토큰: `--ev-*`(일정)·`--mm-*`(메모)·`--dd-*`(D-day), 다크모드 토큰 별도.
