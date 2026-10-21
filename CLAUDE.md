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
- 일정 `{id, type:'event', date:'YYYY-MM-DD', time:'HH:MM'|null, title, note, repeat?:'monthly', created, updated, src?}`
- 경조사 `{id, type:'gift', dir:'in'|'out', nm, a(원), ev, d:'YYYY-MM-DD'|null, rel, grp, memo}` / 회사 규정 `{type:'ref', cat, title, body, keys, ord}` / 바로가기 `{type:'link', title, url}` (v9)
- 메모 `{id, type:'memo', text, date|null, done, created, updated}`
- D-day `{id, type:'dday', title, date, kind:'since'|'until'|'yearly', lunar?, noYear?}` — since는 첫날=1일. yearly+lunar면 date = 음력 날짜(YYYY-MM-DD, 30일 가능 — `parseYmd` 쓰지 말고 `ymdParts`).
- 삭제는 `{id, type, created, deleted:true, updated}` 지움 표시로 남김(화면은 `live()`만 사용).
- 설정 백업/불러오기(JSON, id 기준 합치기 — 기존 항목 유지).

## 주요 함수
- `parseCommand(text)` — 규칙 기반 한국어 해석(날짜: YYYY-MM-DD·M월 D일·M/D·N일 뒤·오늘~글피·(이번/다음/다다음)주 X요일·D일 / 시간: HH:MM·오전/오후/저녁 H시 (반|M분)·정오, 오전·오후 없는 1~7시는 오후). 결과 kind = event/memo/find. 날짜 없으면 메모.
- `onAsk(fromVoice)` → 미리보기(`showPreview`) → `confirmPending`. 음성 입력이면 읽어 주고 8초 뒤 자동 저장(취소 가능 — 운전 중 화면 안 봐도 되게).
- `toggleMic()` — Chrome Web Speech(ko-KR), v7부터 말하는 동안 계속 듣기(2.2초 침묵 시 끝, v7.1부터 한 마디씩 듣고 이어 붙임 — 안드로이드 중복 방지). `?voice=1` 주소로 열면 바로 듣기 시도(빅스비 빠른 명령어용, 브라우저가 막으면 버튼).
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
- 원가툴 연결(2026-10-21): 운영자 요청으로 식용유 원가계산 툴을 **비공개 아티팩트**로 게시(본인만 열람 — 주소는 저장소에 적지 않음) → 김비서 서랍 › 바로가기에 운영자가 직접 등록. 김비서 코드·저장소에는 원가 데이터 넣지 않음. 매월 원가툴 갱신 작업이 이 URL로 재게시해야 폰에서도 최신(아티팩트의 브라우저 저장값은 PC 파일과 따로). 아티팩트 화면에선 CSV 내보내기(다운로드) 안 됨.
- v9-drawer (2026-10-21): 운영자 요청 '비서로 고도화 — 경조사 장부·회사 규정·원가툴을 한곳에'. 하단/상단 탭 '서랍'(`renderMore`·`renderDrawerBody`, 하위 [경조사 장부|회사 규정|바로가기]) ① 경조사 장부 = 새 기록 종류 `gift` {dir in/out, nm, a, ev, d, rel, grp, memo, src, ord} — 사람별 묶음(`giftPeople`, 이름 공백 무시), 받은/낸 합계, 검색(입력칸 유지), 정렬, `editGift`. 말로: "홍길동 장례식 10만원 냈어"·"김철수 결혼식 20만원 받았어" → gift(규칙 해석), "김철수 얼마 받았지?" → 찾기 + `giftSummary` 읽어 주기. 기존 경조사 장부 아티팩트((아티팩트, 주소 생략), BASE 367 + db entries 1·overrides 1 = 368건)에서 옮김 — 운영자: 앞으로 김비서에서만 기록(옛 아티팩트는 10-21 운영자 요청으로 삭제) ② 회사 규정 = `ref` {cat 경조사/휴가/복지/절차, title, body, keys(구어 동의어), ord, src} 24건(하이브 휴가·경조 규정 정리본 기준, 공유용 아티팩트 9FXZGdbaSxPdpvvbdLQhzr는 직원용으로 따로 유지) + 연차 계산기(`calcLeave`) ③ 바로가기 = `link` {title, url}(`editLink`) — 식용유 원가툴은 영업비밀이라 통합하지 않고 연결만(운영자 결정) ④ 일정 '매월 반복'(`repeat:'monthly'`, `monthlyHits` — 그달에 그날 없으면 말일, 말로 "매달 15일 …") — kbs-brief에도 같은 규칙(재배포 시 반영). 찾기·Claude 찾기가 gift·ref·link도 검색(`itemText`). DB: `05_kbs_types.sql`(type 체크에 gift·ref·link). 데이터(장부·규정)는 개인·사내 자료라 저장소에 넣지 않고 SQL로만 전달.
- v9.3-ask-gift (2026-10-21): 경조사 질문("홍길동한테 얼마 줬지?")은 어느 화면에서 물어도(맨 아래 입력칸·마이크는 모든 탭 공통) 찾기 탭이 아니라 **서랍 › 경조사 장부**로 이동해 그 사람으로 검색·펼침(`giftFind` → `giftQ`·`giftOpen`) + 미리보기 상자에 답, 말로 물으면 읽어 줌. 장부에 없는 이름은 예전처럼 찾기 탭.
- v9.2-ask-day (2026-10-21): 말로 묻고 듣기 — ① 날짜 질문 "10월 22일 무슨 일정 있지?"·"내일 뭐 있어?"·"다음 주 수요일 일정 있나?" → `parseCommand`가 kind 'day'(저장 단어 넣어·추가·등록 등이 없고 질문 꼴일 때만), "이번/다음 주 일정 알려줘" → kind 'week'(월요일부터 7일) → `onAsk`가 서버 해석 전에 `answerDay`: 그날 기념일·일정(시간순, 매월 반복 포함)·날짜 메모를 `dayAnswerText`로 읽어 주고 달력을 그날로 이동, 미리보기 상자에 답 표시. 예전엔 '무슨 있지'가 일정으로 저장될 뻔했음 ② 경조사 질문 "홍길동한테 얼마 줬지?"(기존 찾기) 답에 건수·최근 건 추가(`giftSummary` — '낸 돈 15만 원 (2번, 최근 2025년 장례식 5만 원)').
- v9.1-link-guard (2026-10-21): 서랍 바로가기에 PC 파일 주소(file:///·C:\…)를 넣으면 'https://file:///…'로 바뀌어 안 열리던 문제 → `saveLink`가 파일 주소면 저장하지 않고 안내(웹앱은 PC 파일을 못 엶). 원가툴은 비공개 아티팩트 주소로 연결.
- v8-pc-mini (2026-10-21): PC 작은 창 모드 — 마우스 기기(`(pointer: fine)`)에서 창 폭 560px 미만이면 자동(`applyMini`·`renderMini`, body.mini): 하단 탭·상단 탭 숨김, 오늘(음력 포함)·앞으로 7일 중 일정 있는 날·다가오는 기념일(7~30일)·날짜 없는 진행 중 메모 5개를 목록으로, 누르면 편집 창, 입력칸은 그대로. 머리글 [달력/목록] 버튼(`toggleMini`, 그 창에서만)으로 전환. 폰(터치)은 해당 없음. PC 설치: Chrome/Edge 주소창 설치 → 창을 좁게.
- v7.3-wispr-direct (2026-10-21): Wispr 모드 + '앱을 열면 바로 말하기'에서 큰 마이크 화면(눌러야 키보드) → Wispr 버튼으로 두 번 눌러야 했음 → 큰 마이크 화면 없이 바로 입력칸 선택(`focusAskForWispr`). 입력칸이 잡히면 Wispr 떠 있는 버튼이 바로 떠 한 번에 말할 수 있는지는 실기기 확인 필요(폰은 터치 없이 키보드를 안 띄움).
- v7.2-wispr (2026-10-21): 설정 '말로 입력' 방식 선택 [Chrome 음성 | Wispr Flow](localStorage `kbs_voice_mode`). Wispr 모드: 입력칸에 한 번에 6글자 이상 들어오면 받아쓰기로 보고 1.5초(WISPR_IDLE_MS) 더 안 바뀌면 자동 `onAsk(true)`(읽어 주기 + 8초 뒤 저장), 받아쓴 뒤 0.8초 넘어 손으로 고치면 자동 입력 취소, 손으로 치는 건 자동 입력 안 함. 마이크 버튼·큰 마이크 화면은 입력칸에 커서(`focusAskForWispr` — 키보드·Wispr 버튼이 뜨게), '앱을 열면 바로 말하기 화면'은 Wispr 모드에선 자동 듣기 없이 화면만(눌러야 키보드가 뜸). Wispr Flow는 공개 연동(API)이 없어(확인된 범위) 입력칸 방식이 유일한 연결.
- v7.1-voice-fix (2026-10-21): 폰에서 한 번 말했는데 '내일 내일 11시내일 11시…'처럼 여러 번 붙음 — 안드로이드 Chrome은 continuous 모드에서 중간 결과를 각각 final로 보냄 → continuous=false로 한 마디씩 듣고 이어 듣기(기존 재시작 로직), 마디마다 마지막 결과 하나만 사용, `joinSpeech`로 앞 말을 다시 포함해 오면 겹치지 않게 이어 붙임. ⚠️ continuous=true 다시 쓰지 말 것.
- v7-voice-find (2026-10-20): ① 로고를 v5(노랑 아이콘·코랄 밑줄·글자 --text)로 되돌림(운영자: 파란 버전 이상함) — 설치 앱 아래 바 색(manifest background/theme)은 흰색 유지 ② 찾기 입력 누르면 키패드가 바로 닫히던 문제: 키패드가 올라오며 resize → render() → 찾기 입력칸을 새로 그려 포커스 잃음 → resize는 가로폭이 바뀔 때만 다시 그림, render()는 찾기 탭이 열려 있으면 결과만 갱신(`renderFindResults`) ③ 음성 입력이 금방 꺼짐 → `toggleMic`/`spawnRec`/`endListening`/`finishListening`: continuous 듣기, 말이 2.2초 끊기면 끝(REC_SILENCE_MS), 말 시작 전 9초까지 기다림(REC_FIRST_WAIT_MS — 빅스비로 연 직후), 최대 30초, 폰 Chrome이 중간에 끊으면 이어서 다시 듣고 이어 붙임. 마이크 다시 누르면 바로 끝.
- v6.2-white-bar (2026-10-20): 폰 맨 아래 내비게이션 바가 파랗게 나옴(manifest background_color #2F6BFF가 설치 앱 바 색으로 쓰임) → 운영자 '이상해, 돌려줘' → background_color·theme_color 흰색. ⚠️ 설치 앱은 Chrome이 manifest 변경을 받아 갱신해야 바뀜(앱 다시 설치하면 즉시).
- v6.1-auto-voice (2026-10-20): 빅스비 '김비서' 빠른 명령어로 열었는데 듣기가 안 켜짐(?voice=1이 안 넘어온 것으로 추정) → 설정 '말로 입력 › 앱을 열면 바로 듣기'(localStorage `kbs_auto_voice`): 앱 시작 시, 다른 앱에 15초 넘게 있다 돌아올 때 큰 마이크 화면(`startVoiceGate`) + 자동 듣기 시도. 큰 마이크 화면에 '그냥 볼게요'.
- v6-bright-logo (2026-10-20): 아이콘을 밝게(운영자 요청 — 헤이딜러 참고): 파란 그라데이션(#2340F5→#2F6BFF, 아래 하늘색 빛 #7FE7FF) + 흰 손글씨 '김비서'·흰 밑줄 + 노랑 반짝이. 머리글 워드마크 = 파란 글씨(`--brand` #2340F5 / 다크 #8FB0FF) + 노랑 밑줄 #FFC93C. manifest background_color #2F6BFF(→ v6.2에서 흰색으로 되돌림 — 설치 앱 아래 바 색이 됨). ⚠️ 이미 설치한 홈 화면 아이콘·알림 아이콘은 앱 삭제 후 다시 설치해야 바뀜.
- v5.1-brief: [테스트 알림] 실패 시 원인 표시(404 함수 없음·401 Verify JWT·500 메시지), 긴 토스트 5초.
- v5-brief (2026-10-20): ① 아침 알림 — 설정 '아침 알림'(`renderPushBox`·`pushEnable`·`pushSetHour`·`pushDisable`·`pushTest`, 시각 선택 5~22시), 웹푸시 구독을 표 `kbs_push`(endpoint, hour 한국 시간, last_sent)에 저장, `VAPID_PUBLIC` 상수(공개키). 서버 `kbs-brief`(web-push 3.6.7 — HIVEOIL send-push와 같은 방식): pg_cron 매시 정각 호출(x-cron-secret) → 그 시각 기기에 '좋은 아침이에요 · M월 D일' + 오늘·내일 일정·오늘 날짜 메모·기념일(1주 전부터 매일, 2주·30일 전; 음력 포함 앱과 같은 계산) / 앱 [테스트 알림]은 로그인 토큰으로 즉시. 404·410 기기는 자동 삭제. sw.js에 push·notificationclick ② 로고 교체 — 식용유니버스(원자 궤도·딥그린)와 구분: 개구(Gaegu, OFL) 굵은 손글씨 '김비서'를 SVG 선으로 바꿔 넣은 낙서형 워드마크(코랄 밑줄 #FF6B6B + 노랑 반짝이 #FFD166, 글자는 currentColor) + 아이콘(노랑 바탕 #FFD166·남색 글씨 #22223B, 마스커블 안전영역 안). theme_color 흰색, --accent 남색/다크 노랑 ③ 말로 입력 바로가기(`?voice=1`): 큰 마이크 화면(`#voiceGate`) — 자동으로 못 켜면 한 번 누르면 시작, 열린 뒤 주소에서 ?voice=1 제거 ④ 부르는 말 '김비서(야)'로 시작하면 빼고 해석.

## 서버 (Supabase 프로젝트 `bqyepkbajnnguhhcixfv`, 조직 kimbiseo Free)
- 표 `kbs_items`(id, user_id, type, data jsonb, updated, deleted, server_at) — RLS 본인만, anon 권한 없음, 트리거 `kbs_items_before_write`(server_at 갱신 + 더 오래된 updated로 덮어쓰기 무시). SQL: `_supabase/01_kbs_items.sql`.
- Edge Function `kbs-ai`: `_supabase/functions/kbs-ai/index.ts`. 비밀값 `ANTHROPIC_API_KEY`(필수)·`OWNER_EMAIL`(선택). 로그인 토큰 확인 후에만 Claude 호출.
- 설치 순서: `_supabase/설치_안내.md`. `_supabase/`는 밑줄 폴더라 Pages에 안 올라감(공개 저장소에는 보임 — 비밀값 넣지 말 것).
- 앱 코드의 URL·publishable 키는 공개용(보호는 RLS).
- ⚠️ 프로젝트 생성 시 'Automatically expose new tables' 끔 → 새 표는 service_role에도 권한이 없음. 서버 함수가 쓰는 표는 `grant ... to service_role` 필요(`04_service_role_권한.sql`). 10-20 테스트 알림 500 '[object Object]' 원인(추정).

## 디자인 규칙
- 브랜드(v7, v5로 복귀): 낙서형 손글씨 워드마크(`.brand`, 인라인 SVG, 글자 currentColor=--text, 코랄 밑줄 #FF6B6B), 아이콘 노랑 바탕 #FFD166 + 남색 손글씨 #22223B. 설치 앱 바 색은 흰색(manifest) — 식용유니버스 색(딥그린·원자 궤도) 쓰지 않음.
- 이모지 쓰지 않음(아이콘은 인라인 SVG 선 아이콘 `IC`). 색 토큰: `--ev-*`(일정)·`--mm-*`(메모)·`--dd-*`(D-day), 다크모드 토큰 별도.
