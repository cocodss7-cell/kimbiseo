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

## 데이터 구조 (localStorage `kbs_data_v1` = `{ver, items:[], dirty:[], lastPull, syncUser}`)
- 일정 `{id, type:'event', date:'YYYY-MM-DD', time:'HH:MM'|null, title, note, created, updated, src?}`
- 메모 `{id, type:'memo', text, date|null, done, created, updated}`
- D-day `{id, type:'dday', title, date, kind:'since'|'until'|'yearly', lunar?, noYear?}` — since는 첫날=1일. yearly+lunar면 date = 음력 날짜(YYYY-MM-DD, 30일 가능 — `parseYmd` 쓰지 말고 `ymdParts`).
- 삭제는 `{id, type, created, deleted:true, updated}` 지움 표시로 남김(화면은 `live()`만 사용).
- 설정 백업/불러오기(JSON, id 기준 합치기 — 기존 항목 유지).

## 주요 함수
- `parseCommand(text)` — 규칙 기반 한국어 해석(날짜: YYYY-MM-DD·M월 D일·M/D·N일 뒤·오늘~글피·(이번/다음/다다음)주 X요일·D일 / 시간: HH:MM·오전/오후/저녁 H시 (반|M분)·정오, 오전·오후 없는 1~7시는 오후). 결과 kind = event/memo/find. 날짜 없으면 메모.
- `onAsk(fromVoice)` → 미리보기(`showPreview`) → `confirmPending`. 음성 입력이면 읽어 주고 8초 뒤 자동 저장(취소 가능 — 운전 중 화면 안 봐도 되게).
- `toggleMic()` — Chrome Web Speech(ko-KR). `?voice=1` 주소로 열면 바로 듣기 시도(빅스비 빠른 명령어용, 브라우저가 막으면 버튼).
- `ddayInfo(x)` — 표시값·다음 기념일(100일 단위/N주년)·남은 날.

## 단계
- **v1 (완료)**: 화면 뼈대(달력·메모·D-day·찾기), 이 기기 저장, 규칙 해석, 음성 입력·읽어 주기, 백업.
- **2단계 (v3 완료)**: Supabase 동기화(PC↔폰), Claude(Haiku) 해석·비슷한 뜻 찾기(Edge Function, 실패 시 규칙 해석 폴백). 음력은 v4에서 완료.
- **3단계 (v5)**: 아침 브리핑 웹푸시(pg_cron + Edge Function `kbs-brief`), 빅스비 빠른 명령어 연결 안내.

## 이력
- v1-skeleton (2026-10-20): 최초 뼈대.
- v2-clean-ui (2026-10-20): 깔끔한 화면으로 정리(이모지 최소화) — 흰 머리글 + PC 상단 탭(폰은 하단 탭, 선 아이콘), 큰 흰 패널, 달력 칸 = 둥근 회색 상자 + 종류별 색 라벨(일정 초록·메모 노랑·D-day 주황), 체크 칩으로 종류 켜고 끄기(`calShow`), PC 오른쪽/폰 아래 '선택한 날' 패널(`sideHtml` — 그날 항목 + 30일 안 D-day). 오늘 = 날짜 숫자 검은 배지. 로직·저장 구조 불변.

- v3-sync-ai (2026-10-20): 서버 연결. ① 본인 로그인(Supabase Auth 이메일·비번, 대시보드에서 만든 계정만 — 가입 차단) ② PC↔폰 동기화 `syncNow`(올리기: `DB.dirty` upsert → 내리기: `server_at` > `DB.lastPull`−5초, 1,000건씩), 병합 = `updated`(ms) 큰 쪽(`mergeRemote`), 삭제 = 지움 표시(`deleted`) 동기화, 첫 로그인 시 이 기기 기록 전부 올림(`DB.syncUser`). 수정 1.2초 뒤·화면 복귀·온라인 복귀·1분마다 동기화. 머리글 상태 표시(`#syncState`) ③ Claude 해석 `onAsk` → Edge Function `kbs-ai`(action parse, Haiku 5.5, structured outputs) → `fromAi` 검증 → 실패·7초 초과면 규칙 해석. D-day 등록도 말로 가능 ④ 찾기 Enter/음성 = Claude 비슷한 뜻 찾기(`runAiSearch`, action search — 최근 600건 요약 줄 전송) + 글자 일치 결과. supabase-js는 시작 후 비동기 로드(`sbLoad`) — 못 받아도 이 기기 모드로 동작.
- v4-lunar (2026-10-20): 음력. korean-lunar-calendar 0.4.0(MIT, 한국천문연구원 기준, 1000~2050년)을 index.html 안에 포함(인터넷 없이 계산) — `solarToLunar`·`lunarToSolar`(30일 없는 달은 29일)·`lunarLabel`. D-day '매년 양력'/'매년 음력'(`kind:'yearly'` + `lunar`, 음력은 `date`에 음력 날짜 그대로, `noYear` = 연도 모름) → `yearlyNext`가 해마다 그해 양력 날짜를 새로 계산(운영자 요청: 기념일은 양력·음력 맞춰 매년 갱신), 카드에 양력 날짜·음력 같이 표시. 달력 PC 칸에 음력 날짜, 선택한 날 패널에 '음력 M월 D일'. 규칙 해석: '생일·생신·기념일' + 날짜 → 매년 기념일('음력'이면 음력, 연도 없으면 noYear), '사귄·태어난' + 연도 → 그날부터, '음력 9월 15일 제사' → 그해 양력 일정. kbs-ai 스키마에 lunar·no_year 추가(재배포 시 반영).
- 캡처 일정 옮기기: 채팅으로 받은 캡처를 백업 형식 JSON으로 만들어 설정 → 백업 불러오기, 또는 SQL Editor용 insert(`kbs_items`에 `auth.users` 첫 계정으로, `on conflict (id) do nothing`)로 한 번에 — 앱은 server_at 기준으로 자동 수신. 개인 데이터라 저장소에 커밋하지 않음. 10-20 운영자 실행: id `imp1020*` 일정 38·메모 6·D-day 8(가족 생일 — 아빠 음력 9/7, 엄마 음력 4/11, 장인어른 음력 1/7, 장모님 음력 5/8, 나머지 양력).
- v6.1-auto-voice (2026-10-20): 빅스비 '김비서' 빠른 명령어로 열었는데 듣기가 안 켜짐(?voice=1이 안 넘어온 것으로 추정) → 설정 '말로 입력 › 앱을 열면 바로 듣기'(localStorage `kbs_auto_voice`): 앱 시작 시, 다른 앱에 15초 넘게 있다 돌아올 때 큰 마이크 화면(`startVoiceGate`) + 자동 듣기 시도. 큰 마이크 화면에 '그냥 볼게요'.
- v6-bright-logo (2026-10-20): 아이콘을 밝게(운영자 요청 — 헤이딜러 참고): 파란 그라데이션(#2340F5→#2F6BFF, 아래 하늘색 빛 #7FE7FF) + 흰 손글씨 '김비서'·흰 밑줄 + 노랑 반짝이. 머리글 워드마크 = 파란 글씨(`--brand` #2340F5 / 다크 #8FB0FF) + 노랑 밑줄 #FFC93C. manifest background_color #2F6BFF. ⚠️ 이미 설치한 홈 화면 아이콘·알림 아이콘은 앱 삭제 후 다시 설치해야 바뀜.
- v5.1-brief: [테스트 알림] 실패 시 원인 표시(404 함수 없음·401 Verify JWT·500 메시지), 긴 토스트 5초.
- v5-brief (2026-10-20): ① 아침 알림 — 설정 '아침 알림'(`renderPushBox`·`pushEnable`·`pushSetHour`·`pushDisable`·`pushTest`, 시각 선택 5~22시), 웹푸시 구독을 표 `kbs_push`(endpoint, hour 한국 시간, last_sent)에 저장, `VAPID_PUBLIC` 상수(공개키). 서버 `kbs-brief`(web-push 3.6.7 — HIVEOIL send-push와 같은 방식): pg_cron 매시 정각 호출(x-cron-secret) → 그 시각 기기에 '좋은 아침이에요 · M월 D일' + 오늘·내일 일정·오늘 날짜 메모·기념일(1주 전부터 매일, 2주·30일 전; 음력 포함 앱과 같은 계산) / 앱 [테스트 알림]은 로그인 토큰으로 즉시. 404·410 기기는 자동 삭제. sw.js에 push·notificationclick ② 로고 교체 — 식용유니버스(원자 궤도·딥그린)와 구분: 개구(Gaegu, OFL) 굵은 손글씨 '김비서'를 SVG 선으로 바꿔 넣은 낙서형 워드마크(코랄 밑줄 #FF6B6B + 노랑 반짝이 #FFD166, 글자는 currentColor) + 아이콘(노랑 바탕 #FFD166·남색 글씨 #22223B, 마스커블 안전영역 안). theme_color 흰색, --accent 남색/다크 노랑 ③ 말로 입력 바로가기(`?voice=1`): 큰 마이크 화면(`#voiceGate`) — 자동으로 못 켜면 한 번 누르면 시작, 열린 뒤 주소에서 ?voice=1 제거 ④ 부르는 말 '김비서(야)'로 시작하면 빼고 해석.

## 서버 (Supabase 프로젝트 `bqyepkbajnnguhhcixfv`, 조직 kimbiseo Free)
- 표 `kbs_items`(id, user_id, type, data jsonb, updated, deleted, server_at) — RLS 본인만, anon 권한 없음, 트리거 `kbs_items_before_write`(server_at 갱신 + 더 오래된 updated로 덮어쓰기 무시). SQL: `_supabase/01_kbs_items.sql`.
- Edge Function `kbs-ai`: `_supabase/functions/kbs-ai/index.ts`. 비밀값 `ANTHROPIC_API_KEY`(필수)·`OWNER_EMAIL`(선택). 로그인 토큰 확인 후에만 Claude 호출.
- 설치 순서: `_supabase/설치_안내.md`. `_supabase/`는 밑줄 폴더라 Pages에 안 올라감(공개 저장소에는 보임 — 비밀값 넣지 말 것).
- 앱 코드의 URL·publishable 키는 공개용(보호는 RLS).
- ⚠️ 프로젝트 생성 시 'Automatically expose new tables' 끔 → 새 표는 service_role에도 권한이 없음. 서버 함수가 쓰는 표는 `grant ... to service_role` 필요(`04_service_role_권한.sql`). 10-20 테스트 알림 500 '[object Object]' 원인(추정).

## 디자인 규칙
- 브랜드(v6): 낙서형 손글씨 워드마크(`.brand`, 인라인 SVG, 색 `--brand`), 아이콘 파란 그라데이션 + 흰 글씨 + 노랑 반짝이 — 식용유니버스 색(딥그린·원자 궤도) 쓰지 않음.
- 이모지 쓰지 않음(아이콘은 인라인 SVG 선 아이콘 `IC`). 색 토큰: `--ev-*`(일정)·`--mm-*`(메모)·`--dd-*`(D-day), 다크모드 토큰 별도.
