-- dichava.app — Confirmação de presença + lembrete automático de consulta
-- Rode uma vez no SQL Editor do Supabase.

-- 1) Colunas novas em solicitacoes
alter table public.solicitacoes add column if not exists user_id     uuid;         -- paciente logado (se houver)
alter table public.solicitacoes add column if not exists presenca    text;         -- null | 'confirmada' | 'faltou'
alter table public.solicitacoes add column if not exists lembrete_em timestamptz;  -- quando o push de lembrete foi enviado

-- 2) RPC solicitar_agendamento agora captura o user_id do paciente
--    (security definer p/ funcionar mesmo com RLS; anon e authenticated podem chamar)
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

-- 4) (opcional) Agendamento automático do lembrete — requer extensões pg_cron + pg_net.
--    Ative-as em Database > Extensions. Substitua <PROJECT_REF> e <ANON_KEY>.
--    Roda a cada hora e chama a Edge Function "lembrete-consulta".
-- select cron.schedule('lembrete-consulta-hourly','0 * * * *', $$
--   select net.http_post(
--     url:='https://<PROJECT_REF>.functions.supabase.co/lembrete-consulta',
--     headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON_KEY>')
--   );
-- $$);
