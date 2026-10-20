-- 김비서 아침 알림 예약: 매시 정각 kbs-brief 함수를 부름 (함수가 그 시각 알림 받을 기기만 골라 보냄)
-- ⚠️ 이 파일은 틀입니다. 실제 실행본은 CRON_SECRET 값이 채워진 것을 채팅으로 받아 실행 (비밀값은 저장소에 올리지 않음)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('kbs-brief-hourly') where exists (select 1 from cron.job where jobname = 'kbs-brief-hourly');
select cron.schedule(
  'kbs-brief-hourly',
  '0 * * * *',
  $$ select net.http_post(
       url     := 'https://bqyepkbajnnguhhcixfv.supabase.co/functions/v1/kbs-brief',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body    := '{}'::jsonb
     ); $$
);

-- 확인: kbs-brief-hourly | 0 * * * * | true
select jobname, schedule, active from cron.job where jobname = 'kbs-brief-hourly';
-- 되돌리기: select cron.unschedule('kbs-brief-hourly');
