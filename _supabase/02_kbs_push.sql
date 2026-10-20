-- 김비서 아침 알림: 알림 받을 기기 목록 (SQL Editor에서 한 번 실행)
create table if not exists public.kbs_push (
  endpoint   text primary key,                 -- 기기(브라우저) 푸시 주소
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  hour       int  not null default 7 check (hour between 0 and 23),  -- 알림 시각(한국 시간)
  last_sent  date,                             -- 같은 날 두 번 보내지 않게
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists kbs_push_hour on public.kbs_push (hour);

alter table public.kbs_push enable row level security;
drop policy if exists kbs_push_own_select on public.kbs_push;
drop policy if exists kbs_push_own_insert on public.kbs_push;
drop policy if exists kbs_push_own_update on public.kbs_push;
drop policy if exists kbs_push_own_delete on public.kbs_push;
create policy kbs_push_own_select on public.kbs_push for select to authenticated using (user_id = auth.uid());
create policy kbs_push_own_insert on public.kbs_push for insert to authenticated with check (user_id = auth.uid());
create policy kbs_push_own_update on public.kbs_push for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy kbs_push_own_delete on public.kbs_push for delete to authenticated using (user_id = auth.uid());

revoke all on public.kbs_push from anon;
revoke all on public.kbs_push from authenticated;
grant select, insert, update, delete on public.kbs_push to authenticated;

-- 확인: kbs_push | true
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'kbs_push';
