// 김비서 AI 함수 (Supabase Edge Function: kbs-ai)
// - parse : 말한 문장 → 일정/메모/D-day/찾기 로 해석
// - search: 기억나는 말 → 비슷한 뜻의 일정·메모 찾기
// 비밀값: ANTHROPIC_API_KEY (필수), OWNER_EMAIL (선택 — 넣으면 그 이메일 로그인만 허용)
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.130.0/helpers/zod";
import { z } from "npm:zod@4.6.5";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const MODEL = "claude-haiku-5-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const ParseSchema = z.object({
  kind: z.enum(["event", "memo", "dday", "find"]),
  date: z.string().nullable(),       // YYYY-MM-DD
  time: z.string().nullable(),       // HH:MM (24시간)
  title: z.string().nullable(),      // 일정·D-day 제목
  text: z.string().nullable(),       // 메모 본문
  dday_kind: z.enum(["since", "until", "yearly"]).nullable(),
  lunar: z.boolean().nullable(),     // yearly가 음력 기념일이면 true (date는 음력 날짜)
  no_year: z.boolean().nullable(),   // 연도를 말하지 않은 매년 기념일
  query: z.string().nullable(),      // 찾기 검색어
  note: z.string().nullable(),       // 애매해서 추정한 부분 (짧게)
});

const SearchSchema = z.object({
  answer: z.string(),                // 한두 문장 답 (읽어 주기용)
  ids: z.array(z.string()),          // 관련 높은 순
});

const PARSE_SYSTEM = `너는 한국어 개인 일정 비서다. 사용자가 말한 한 문장을 분류해 JSON으로만 답한다.
- event: 날짜가 있는 일정. date(YYYY-MM-DD) 필수, 시간이 있으면 time(HH:MM, 24시간). title은 "입력해줘/넣어줘/추가해줘" 같은 명령어를 뺀 짧은 제목.
- memo: 날짜 없는 생각·아이디어·"메모해줘/기억해줘". text에 명령어를 뺀 본문. 날짜가 언급되면 date도.
- dday: 기념일·D-day 등록("사귄 날 2024년 3월 1일", "아이 생일 등록", "시험 D-day"). title·date 필수. dday_kind: 그날부터 며칠째 세기=since(사귄 날, 아이 태어난 날), 그날까지 남은 날=until(시험·여행), 매년 반복=yearly(생일·결혼기념일). "음력"이라고 하면 lunar=true이고 date에는 음력 날짜를 그대로 적는다. 연도를 말하지 않은 매년 기념일은 올해 연도를 넣고 no_year=true.
- find: 예전 기록을 찾는 질문("~언제였지?", "~있었나?", "~찾아줘"). query에 핵심 단어.
규칙: 날짜는 기준일(오늘) 기준으로 계산. "다음 주 화요일"은 다음 주(월요일 시작)의 화요일. 연도가 없고 이미 60일 넘게 지난 날짜면 내년. 오전/오후 표시가 없는 1~7시는 오후로 보고 note에 "오후로 이해"라고 적는다. 해당 없는 칸은 null.`;

const SEARCH_SYSTEM = `너는 한국어 개인 기록 검색 비서다. 기록 목록(한 줄에 id|종류|날짜|내용)에서 질문과 관련 있는 것을 찾는다.
정확히 같은 단어가 아니어도 뜻이 비슷하거나 관련 있으면 포함한다(예: "지게차" ↔ "포크리프트", "명함" ↔ "명함 디자인").
ids에는 관련 높은 순으로 최대 8개 id만. 없으면 빈 배열.
answer는 운전 중 귀로 들을 수 있게 한두 문장(예: "10월 20일 메모에 신규 지게차 얘기가 있어요."). 없으면 "관련 기록을 찾지 못했어요."`;

async function ownerOf(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  const owner = (Deno.env.get("OWNER_EMAIL") ?? "").trim().toLowerCase();
  if (owner && (data.user.email ?? "").toLowerCase() !== owner) return null;
  return data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const user = await ownerOf(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { action?: string; text?: string; today?: string; query?: string; items?: string[] };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  try {
    if (body.action === "parse") {
      const text = String(body.text ?? "").slice(0, 500);
      if (!text.trim()) return json({ error: "empty" }, 400);
      const res = await anthropic.messages.parse({
        model: MODEL,
        max_tokens: 2000,
        system: PARSE_SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(ParseSchema) },
        messages: [{ role: "user", content: `기준일(오늘): ${String(body.today ?? "").slice(0, 40)}\n문장: ${text}` }],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return json({ error: "no_result" }, 200);
      return json({ result: res.parsed_output });
    }

    if (body.action === "search") {
      const query = String(body.query ?? "").slice(0, 200);
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 600).map((s) => String(s).slice(0, 200));
      if (!query.trim()) return json({ error: "empty" }, 400);
      if (!items.length) return json({ result: { answer: "기록이 아직 없어요.", ids: [] } });
      const res = await anthropic.messages.parse({
        model: MODEL,
        max_tokens: 2000,
        system: SEARCH_SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(SearchSchema) },
        messages: [{ role: "user", content: `질문: ${query}\n\n기록 목록:\n${items.join("\n")}` }],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) return json({ error: "no_result" }, 200);
      return json({ result: res.parsed_output });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limit" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "anthropic_key" }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: "anthropic", status: e.status }, 502);
    return json({ error: "server", message: String(e) }, 500);
  }
});
