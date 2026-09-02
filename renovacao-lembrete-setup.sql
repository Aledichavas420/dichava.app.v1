-- ══════════════════════════════════════════════════════════════
-- dichava.app — Lembrete de renovação da assinatura do profissional
--
-- Avisa perto do vencimento (acesso_ate) por e-mail e push, nos marcos
-- 5 dias antes, no dia e 3 dias depois. Quem faz o envio é a Edge Function
-- "lembrete-renovacao"; este SQL cria o controle de "já avisado" e agenda
-- o job diário que chama a função.
--
-- PRÉ-REQUISITOS
--   1) Publicar a função:
--        supabase functions deploy lembrete-renovacao --no-verify-jwt
--      Secrets da função (Project Settings > Edge Functions > Secrets):
--        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
--        EMAIL_FROM, VAPID_PUB, VAPID_PRIVATE, CRON_SECRET
--   2) Extensões pg_cron e pg_net ativas (Database > Extensions).
--   3) Requer public.eh_admin() (admin-setup.sql).
--
-- Rode INTEIRO no SQL Editor. Idempotente.
-- ══════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Controle: um registro por profissional + marco + ciclo (data de venc).
--    Se a pessoa renova, a acesso_ate muda, o "venc" muda, e no próximo ciclo
--    os avisos podem sair de novo. Nada se repete dentro do mesmo ciclo.
create table if not exists public.renovacao_lembrete (
  prof_id    uuid not null,
  marco      text not null,           -- 'antes5' | 'dia' | 'depois3'
  venc       date not null,           -- acesso_ate do ciclo avisado
  enviado_em timestamptz not null default now(),
  primary key (prof_id, marco, venc)
);

alter table public.renovacao_lembrete enable row level security;

-- Leitura só do admin (pra você conferir no futuro). A função grava via
-- service_role, que ignora RLS, então não precisa de policy de escrita.
grant select on public.renovacao_lembrete to authenticated;
drop policy if exists "admin le renov" on public.renovacao_lembrete;
create policy "admin le renov" on public.renovacao_lembrete
  for select to authenticated using (public.eh_admin());

-- 2) Agenda diária: chama a função todo dia às 12:10 UTC (09:10 de Brasília).
--    TROQUE <CRON_SECRET> pelo mesmo valor que você pôs no secret da função.
select cron.schedule(
  'dichava-lembrete-renovacao',
  '10 12 * * *',
  $$
  select net.http_post(
    url     := 'https://gnpwaywyexcevtzbwiyq.supabase.co/functions/v1/lembrete-renovacao',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

notify pgrst, 'reload schema';

-- ── Conferência / operação (opcional) ─────────────────────────
--   select * from cron.job;                          -- ver o agendamento
--   select * from public.renovacao_lembrete order by enviado_em desc;  -- ver o que já saiu
--   select cron.unschedule('dichava-lembrete-renovacao');             -- desligar
--
-- Testar sem esperar o cron: chame a função uma vez pela linha de comando,
-- com o header x-cron-secret, ou dispare manualmente pelo painel da função.
-- Ela devolve um JSON com quantos avisos foram enviados.
--
-- ENVIAR PARA TODO O CICLO ATUAL AGORA (este mês, mesmo quem falta mais de 5
-- dias): chame a função uma vez com o corpo {"modo":"agora"}. Ela antecipa o
-- aviso pra todos que ainda vão vencer; o "no dia" e o "3 dias depois" seguem
-- saindo pelo cron normalmente. Exemplo (troque o segredo):
--   curl -X POST 'https://gnpwaywyexcevtzbwiyq.supabase.co/functions/v1/lembrete-renovacao' \
--        -H 'x-cron-secret: <CRON_SECRET>' -H 'Content-Type: application/json' \
--        -d '{"modo":"agora"}'
