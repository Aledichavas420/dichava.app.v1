-- ════════════════════════════════════════════════════════════
-- dichava.app — Agendamento online pelo paciente
-- Página pública /agendar/?c=CODIGO envia uma solicitação;
-- o profissional confirma no Painel da Clínica.
-- Rode no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null,
  telefone text,
  data_pref date,
  hora_pref text,
  mensagem text,
  status text default 'nova',        -- 'nova' | 'confirmada' | 'recusada'
  criado_em timestamptz default now()
);
create index if not exists idx_solic_clinica on public.solicitacoes(clinica_id, status);

alter table public.solicitacoes enable row level security;

-- membros da clínica leem e atualizam as solicitações dela
drop policy if exists "solic membros select" on public.solicitacoes;
create policy "solic membros select" on public.solicitacoes
  for select using (public.is_clinica_member(clinica_id));
drop policy if exists "solic membros update" on public.solicitacoes;
create policy "solic membros update" on public.solicitacoes
  for update using (public.is_clinica_member(clinica_id));
-- (inserção é feita pela RPC abaixo, com security definer — o público não acessa a tabela direto)

-- RPC pública: nome da clínica pelo código (pra a página de agendamento mostrar)
create or replace function public.clinica_nome(p_codigo text)
returns text language sql security definer stable as $$
  select nome from public.clinicas where codigo = upper(p_codigo);
$$;
grant execute on function public.clinica_nome(text) to anon, authenticated;

-- RPC pública: cria a solicitação de agendamento
create or replace function public.solicitar_agendamento(
  p_codigo text, p_nome text, p_tel text, p_data date, p_hora text, p_msg text
) returns text language plpgsql security definer as $$
declare cid uuid; cnome text;
begin
  select id, nome into cid, cnome from public.clinicas where codigo = upper(p_codigo);
  if cid is null then raise exception 'codigo invalido'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome obrigatorio'; end if;
  insert into public.solicitacoes(clinica_id, nome, telefone, data_pref, hora_pref, mensagem)
    values (cid, p_nome, p_tel, p_data, p_hora, p_msg);
  return cnome;
end; $$;
grant execute on function public.solicitar_agendamento(text,text,text,date,text,text) to anon, authenticated;
