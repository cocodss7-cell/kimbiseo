// 김비서 아침 브리핑 (Supabase Edge Function: kbs-brief)
// - 매시 정각 pg_cron이 호출(x-cron-secret) → 알림 시각(hour, 한국 시간)이 지금인 기기에 오늘 브리핑 푸시
// - 앱의 [테스트 알림](로그인 토큰) → 그 사람 기기에 바로 한 번 보냄
// 비밀값: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET  (SUPABASE_URL·SERVICE_ROLE_KEY는 자동)
// 함수 설정에서 Verify JWT 끔 — 크론 호출에는 로그인 토큰이 없음(대신 CRON_SECRET 확인, 테스트는 함수가 직접 토큰 확인)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import KoreanLunarCalendar from "npm:korean-lunar-calendar@0.4.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const LUNAR = new KoreanLunarCalendar();
// 비밀값은 앞뒤 빈칸·줄바꿈을 지우고 씀(붙여넣기 실수 대비). 문제가 있으면 함수가 죽지 않고 원인을 돌려줌
const env = (k: string) => (Deno.env.get(k) ?? "").trim();
let vapidError = "";
try {
  if (!env("VAPID_PUBLIC_KEY") || !env("VAPID_PRIVATE_KEY")) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 비밀값이 없어요");
  webpush.setVapidDetails("https://cocodss7-cell.github.io/kimbiseo/", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
} catch (e) { vapidError = "VAPID 키 오류: " + String((e as Error).message ?? e); }

// ---------- 한국 날짜 (UTC 자정 Date 하나 = 한국 날짜 하루) ----------
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 86400000;
function kstToday(): Date { const k = new Date(Date.now() + 9 * 3600000); return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate())); }
function kstHour(): number { return new Date(Date.now() + 9 * 3600000).getUTCHours(); }
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parts = (s: string) => { const [y, m, d] = String(s).split("-").map(Number); return { y, m, d }; };
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const diff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const md = (d: Date) => `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`;
function lunarToSolar(y: number, m: number, d: number): Date | null {
  let ok = LUNAR.setLunarDate(y, m, d, false);
  if (!ok && d === 30) ok = LUNAR.setLunarDate(y, m, 29, false);
  if (!ok) return null;
  const c = LUNAR.getSolarCalendar();
  return utc(c.year, c.month, c.day);
}

type Item = { id: string; type: string; date?: string | null; time?: string | null; title?: string; text?: string; done?: boolean; kind?: string; lunar?: boolean; noYear?: boolean; repeat?: string | null };

// 앱(ddayInfo·yearlyNext)과 같은 계산: 다가오는 기념일까지 남은 날
function ddayNext(x: Item, today: Date): { left: number; label: string } | null {
  if (!x.date) return null;
  const b = parts(x.date);
  if (x.kind === "yearly") {
    let nx: Date | null = null;
    if (x.lunar) {
      for (let y = today.getUTCFullYear() - 1; y <= today.getUTCFullYear() + 1 && !nx; y++) {
        const s = lunarToSolar(y, b.m, b.d);
        if (s && s >= today) nx = s;
      }
    } else {
      nx = utc(today.getUTCFullYear(), b.m, b.d);
      if (nx < today) nx = utc(today.getUTCFullYear() + 1, b.m, b.d);
    }
    if (!nx) return null;
    return { left: diff(today, nx), label: x.title ?? "" };
  }
  const base = utc(b.y, b.m, b.d);
  if (x.kind === "since") {
    const n = diff(base, today) + 1;
    if (n < 1) return { left: 1 - n, label: `${x.title} 시작` };
    const n100 = n % 100 === 0 ? n : Math.ceil(n / 100) * 100;
    const c: { left: number; label: string }[] = [{ left: n100 - n, label: `${x.title} ${n100}일` }];
    let yr = today.getUTCFullYear() - b.y;
    let ann = utc(b.y + yr, b.m, b.d);
    if (ann < today) ann = utc(b.y + (++yr), b.m, b.d);
    if (yr >= 1) c.push({ left: diff(today, ann), label: `${x.title} ${yr}주년` });
    return c.sort((p, q) => p.left - q.left)[0];
  }
  const left = diff(today, base);
  return left >= 0 ? { left, label: x.title ?? "" } : null;
}
// 알려 줄 날: 1주 전부터 매일, 그리고 2주·30일 전
const remind = (left: number) => left <= 7 || left === 14 || left === 30;

function brief(items: Item[], today: Date) {
  const t = ymd(today), tm = ymd(new Date(today.getTime() + DAY));
  // 매월 반복 일정(앱 monthlyHits와 같은 규칙: 시작일 이후 매달 같은 날, 그날이 없으면 말일)
  const monthly = (x: Item, d: string) => {
    if (x.repeat !== "monthly" || !x.date || d < x.date) return false;
    const b = parts(x.date), p = parts(d);
    return p.d === Math.min(b.d, new Date(Date.UTC(p.y, p.m, 0)).getUTCDate());
  };
  const evLine = (d: string) => items.filter((x) => x.type === "event" && (x.date === d || monthly(x, d)))
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"))
    .map((x) => (x.time ? x.time + " " : "") + (x.title ?? ""));
  const today_ = evLine(t), tomorrow = evLine(tm);
  const memo = items.filter((x) => x.type === "memo" && x.date === t && !x.done).map((x) => String(x.text ?? "").split("\n")[0]);
  const dd = items.filter((x) => x.type === "dday").map((x) => ddayNext(x, today)).filter((o): o is { left: number; label: string } => !!o && remind(o.left))
    .sort((a, b) => a.left - b.left).map((o) => o.label + (o.left === 0 ? " 오늘!" : ` D-${o.left}`));
  const lines = [
    "오늘 · " + (today_.length ? today_.join(" · ") : "일정 없음"),
    ...(tomorrow.length ? ["내일 · " + tomorrow.join(" · ")] : []),
    ...(memo.length ? ["메모 · " + memo.join(" · ")] : []),
    ...(dd.length ? ["기념일 · " + dd.join(" · ")] : []),
  ];
  let body = lines.join("\n");
  if (body.length > 360) body = body.slice(0, 357) + "…";
  return { title: `좋은 아침이에요 · ${md(today)}`, body, url: "./", tag: "kbs-brief-" + t };
}

async function sendTo(userId: string, subs: { endpoint: string; p256dh: string; auth: string }[], today: Date) {
  const { data: rows, error } = await sb.from("kbs_items").select("data").eq("user_id", userId).eq("deleted", false);
  if (error) throw error;
  const payload = JSON.stringify(brief((rows ?? []).map((r) => r.data as Item), today));
  let sent = 0, gone = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await sb.from("kbs_push").delete().eq("endpoint", s.endpoint); gone++; }
    }
  }
  return { sent, gone };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const today = kstToday();
  if (vapidError) return json({ error: "vapid", message: vapidError }, 500);

  try {
    // 1) 매시 정각 예약 실행
    const secret = env("CRON_SECRET");
    if (secret && (req.headers.get("x-cron-secret") ?? "").trim() === secret) {
      const hour = kstHour();
      const { data: subs, error } = await sb.from("kbs_push").select("endpoint,p256dh,auth,user_id,last_sent").eq("hour", hour);
      if (error) throw error;
      const due = (subs ?? []).filter((s) => s.last_sent !== ymd(today));
      const byUser = new Map<string, typeof due>();
      due.forEach((s) => byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]));
      let sent = 0, gone = 0;
      for (const [uid, list] of byUser) {
        const r = await sendTo(uid, list, today);
        sent += r.sent; gone += r.gone;
        await sb.from("kbs_push").update({ last_sent: ymd(today) }).in("endpoint", list.map((s) => s.endpoint));
      }
      return json({ ok: true, hour, sent, gone });
    }

    // 2) 앱의 테스트 알림 (로그인 토큰)
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const { data: u, error: ue } = await sb.auth.getUser(auth.slice(7));
    if (ue || !u.user) return json({ error: "unauthorized" }, 401);
    const { data: subs, error } = await sb.from("kbs_push").select("endpoint,p256dh,auth").eq("user_id", u.user.id);
    if (error) throw error;
    if (!subs?.length) return json({ ok: true, sent: 0, gone: 0, note: "no_subscription" });
    return json({ ok: true, ...(await sendTo(u.user.id, subs, today)) });
  } catch (e) {
    const m = e instanceof Error ? e.message : (e && typeof e === "object" ? [(e as Record<string, unknown>).code, (e as Record<string, unknown>).message].filter(Boolean).join(" ") || JSON.stringify(e) : String(e));
    return json({ error: "server", message: m }, 500);
  }
});
