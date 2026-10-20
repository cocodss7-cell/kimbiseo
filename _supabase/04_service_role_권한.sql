-- 김비서: 서버 함수(kbs-brief 등)가 표를 읽고 쓸 수 있게 service_role 권한 부여
-- (프로젝트 생성 때 'Automatically expose new tables'를 꺼서 자동 부여가 안 됨 — 앱 사용자 권한은 그대로)
grant usage on schema public to service_role;
grant select, insert, update, delete on public.kbs_items to service_role;
grant select, insert, update, delete on public.kbs_push  to service_role;

-- 확인: 두 표 모두 service_role 줄이 보이면 정상
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('kbs_items','kbs_push') and grantee = 'service_role'
group by table_name, grantee;
