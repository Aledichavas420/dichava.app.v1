-- ════════════════════════════════════════════════════════════
-- Agendamento diário da função (rodar no SQL Editor do Supabase)
-- Requer as extensões pg_cron e pg_net (ative em Database > Extensions)
-- ════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Troque <PROJECT_REF> e <CRON_SECRET> pelos seus valores.
-- Dispara todo dia às 12:00 UTC (=09:00 no horário de Brasília).
-- Ajuste o horário se quiser (formato cron: min hora * * *).
select cron.schedule(
  'dichava-notificar-diario',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/notificar',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver/remover depois:
--   select * from cron.job;
--   select cron.unschedule('dichava-notificar-diario');
