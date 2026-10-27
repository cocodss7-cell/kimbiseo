-- 김비서 v10: 기록 종류 추가 — insta(인스타 예약)·trade(하이브 매입매출)·cfg(설정: 폐유 면세 업체 등)
alter table public.kbs_items drop constraint if exists kbs_items_type_check;
alter table public.kbs_items add constraint kbs_items_type_check check (type in ('event','memo','dday','gift','ref','link','insta','trade','cfg'));
-- 확인: 아래에 insta·trade·cfg가 보이면 정상
select pg_get_constraintdef(oid) from pg_constraint where conname = 'kbs_items_type_check';
