-- dichava.app — Lembrete AUTOMÁTICO de consulta (recurso Profissional/Clínica)
-- Roda no SQL Editor do Supabase. Idempotente (pode rodar mais de uma vez).
--
-- Pré-requisitos:
--   1) A Edge Function "lembrete-consulta" precisa estar publicada:
--        supabase functions deploy lembrete-consulta --no-verify-jwt
--      Secrets da função: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUB,
--      VAPID_PRIVATE e WEBHOOK_SECRET (uma senha qualquer que você escolhe).
--   2) Extensões pg_cron e pg_net ativas (Database > Extensions).

-- ─────────────────────────────────────────────────────────────
-- 1) Colunas de apoio em solicitacoes (agendamento online do paciente)
-- ─────────────────────────────────────────────────────────────
alter table public.solicitacoes add column if not exists user_id     uuid;         -- paciente logado
alter table public.solicitacoes add column if not exists presenca    text;         -- null | 'confirmada' | 'faltou'
alter table public.solicitacoes add column if not exists lembrete_em timestamptz;  -- quando o lembrete foi enviado

-- 2) RPC de solicitação captura o user_id do paciente (pra saber pra quem avisar)
create or replace function public.solicitar_agendamento(
  p_codigo text, p_nome text, p_tel text, p_data date, p_hora text, p_msg text,
  p_user_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cid uuid;
begin
  select id into v_cid from public.clinicas where codigo = upper(trim(p_codigo)) limit 1;
  if v_cid is null then raise exception 'clinica_nao_encontrada'; end if;
  insert into public.solicitacoes (clinica_id, nome, telefone, data_pref, hora_pref, mensagem, status, user_id)
  values (v_cid, p_nome, p_tel, p_data, nullif(p_hora,''), p_msg, 'nova', p_user_id);
end $$;
grant execute on function public.solicitar_agendamento(text,text,text,date,text,text,uuid) to anon, authenticated;

-- 3) RLS: o paciente lê e confirma presença nas PRÓPRIAS solicitações
alter table public.solicitacoes enable row level security;
drop policy if exists solic_user_read on public.solicitacoes;
create policy solic_user_read on public.solicitacoes for select using (auth.uid() = user_id);
drop policy if exists solic_user_presenca on public.solicitacoes;
create policy solic_user_presenca on public.solicitacoes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4) Agendamento automático: chama a Edge Function de hora em hora.
--    A função envia o lembrete ~1 dia antes das consultas confirmadas.
--    >>> TROQUE <PROJECT_REF> e <WEBHOOK_SECRET> pelos seus valores. <<<
--    (<WEBHOOK_SECRET> tem que ser o MESMO secret configurado na função.)
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove agendamento anterior (se já existir) pra não duplicar
select cron.unschedule('lembrete-consulta-hourly')
where exists (select 1 from cron.job where jobname = 'lembrete-consulta-hourly');

select cron.schedule(
  'lembrete-consulta-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/lembrete-consulta',
    headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret','<WEBHOOK_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- Conferir / remover depois:
--   select jobname, schedule from cron.job;
--   select cron.unschedule('lembrete-consulta-hourly');
