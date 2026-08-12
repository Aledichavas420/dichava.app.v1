-- dichava.app — Rede: registro de "Tenho interesse" (mural: intervisão, rodas, eventos)
-- Rode uma vez no Supabase → SQL Editor. Idempotente.
--
-- O profissional registra o próprio interesse por uma área do mural. Você lê a
-- lista pelo painel do Supabase (Table editor / SQL) — o service role ignora RLS.

create table if not exists public.rede_interesses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  area       text not null,          -- 'interv' | 'rodas' | 'eventos'
  area_nome  text,                   -- rótulo amigável ("Grupos de intervisão")
  nome       text,                   -- nome do profissional (denormalizado, pra facilitar)
  criado_em  timestamptz not null default now(),
  unique (user_id, area)             -- 1 interesse por área por pessoa (permite upsert)
);

alter table public.rede_interesses enable row level security;

-- Cada profissional insere/atualiza SÓ o próprio interesse.
drop policy if exists "inserir proprio interesse" on public.rede_interesses;
create policy "inserir proprio interesse" on public.rede_interesses
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "atualizar proprio interesse" on public.rede_interesses;
create policy "atualizar proprio interesse" on public.rede_interesses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cada profissional lê só o próprio (você lê todos pelo painel do Supabase).
drop policy if exists "ler proprio interesse" on public.rede_interesses;
create policy "ler proprio interesse" on public.rede_interesses
  for select to authenticated using (user_id = auth.uid());

grant insert, update, select on public.rede_interesses to authenticated;

notify pgrst, 'reload schema';

-- Consulta pra você ver quem tem interesse (rode quando quiser):
-- select area_nome, nome, criado_em from public.rede_interesses order by criado_em desc;
