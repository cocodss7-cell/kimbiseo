-- 김비서 DB 준비 (Supabase SQL Editor에서 한 번 실행)
-- 일정·메모·D-day를 한 표에 저장. 본인 로그인 계정만 자기 기록을 읽고 쓸 수 있음.

create table if not exists public.kbs_items (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type       text not null check (type in ('event','memo','dday')),
  data       jsonb not null,
  updated    bigint not null,              -- 기기에서 고친 시각(ms) — 더 늦은 쪽이 이김
  deleted    boolean not null default false,
  server_at  timestamptz not null default now()  -- 서버에 들어온 시각 — 동기화 기준
);
create index if not exists kbs_items_user_server_at on public.kbs_items (user_id, server_at);

-- 서버 시각 기록 + 옛 기기가 더 최신 기록을 덮어쓰지 못하게
create or replace function public.kbs_items_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot change';
    end if;
    if new.updated < old.updated then
      return old;                  -- 더 오래된 수정은 무시
    end if;
  end if;
  new.server_at := now();
  return new;
end $$;
drop trigger if exists kbs_items_bw on public.kbs_items;
create trigger kbs_items_bw before insert or update on public.kbs_items
  for each row execute function public.kbs_items_before_write();

-- 보안: 본인 것만
alter table public.kbs_items enable row level security;
drop policy if exists kbs_own_select on public.kbs_items;
drop policy if exists kbs_own_insert on public.kbs_items;
drop policy if exists kbs_own_update on public.kbs_items;
drop policy if exists kbs_own_delete on public.kbs_items;
create policy kbs_own_select on public.kbs_items for select to authenticated using (user_id = auth.uid());
create policy kbs_own_insert on public.kbs_items for insert to authenticated with check (user_id = auth.uid());
create policy kbs_own_update on public.kbs_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy kbs_own_delete on public.kbs_items for delete to authenticated using (user_id = auth.uid());

-- 권한: 로그인 사용자만 (비로그인 anon은 아무것도 못 함)
revoke all on public.kbs_items from anon;
revoke all on public.kbs_items from authenticated;
grant select, insert, update, delete on public.kbs_items to authenticated;
grant select, insert, update, delete on public.kbs_items to service_role;  -- 서버 함수용

-- 확인: 아래가 1줄(rowsecurity = true) 나오면 정상
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'kbs_items';
