-- ══════════════════════════════════════════════════════════════
-- dichava.app — Indicações (indique um amigo / crescimento)
-- Cada pessoa que entra pelo link de alguém (dichava.app/?ref=CODE) fica
-- registrada uma única vez. Quem indicou vê quantas pessoas entraram pelo
-- SEU código através de uma função de contagem (respeitando privacidade:
-- ninguém vê quem são as pessoas, só o número).
--
-- Rode no SQL Editor do Supabase (uma vez). Idempotente.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.indicacoes (
  id            uuid primary key default gen_random_uuid(),
  indicado_id   uuid not null default auth.uid() unique,  -- quem entrou (1x por pessoa, pra sempre)
  referrer_code text not null,                             -- código de quem indicou
  criado_em     timestamptz not null default now()
);

-- Índice pra contar rápido por código
create index if not exists indicacoes_referrer_code_idx on public.indicacoes (referrer_code);

alter table public.indicacoes enable row level security;

-- O indicado registra a própria entrada (indicado_id = auth.uid() por padrão).
drop policy if exists "inserir propria indicacao" on public.indicacoes;
create policy "inserir propria indicacao" on public.indicacoes
  for insert to authenticated with check (indicado_id = auth.uid());

-- Contagem por código: qualquer usuário logado consulta quantas pessoas
-- entraram pelo SEU código. Não expõe identidades — só o total.
create or replace function public.indicacoes_contar(p_code text)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.indicacoes where referrer_code = p_code;
$$;
grant execute on function public.indicacoes_contar(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Ranking de quem mais indicou (rode quando quiser, no painel do Supabase):
-- select referrer_code, count(*) as entradas
-- from public.indicacoes group by referrer_code order by entradas desc;
