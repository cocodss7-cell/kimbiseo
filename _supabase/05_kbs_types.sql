-- 김비서 v9: 기록 종류 추가 — gift(경조사 장부)·ref(회사 규정 참고)·link(바로가기)
alter table public.kbs_items drop constraint if exists kbs_items_type_check;
alter table public.kbs_items add constraint kbs_items_type_check check (type in ('event','memo','dday','gift','ref','link'));
-- 확인: 아래에 gift·ref·link가 보이면 정상
select pg_get_constraintdef(oid) from pg_constraint where conname = 'kbs_items_type_check';
