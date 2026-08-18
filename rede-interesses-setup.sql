-- dichava.app — Rede: "Tenho interesse" nos ENCONTROS do mural (seleção múltipla)
-- O profissional escolhe um ou mais encontros (intervisão, rodas, eventos) e registra
-- interesse por cada um. Você lê a lista pelo painel do Supabase (service role ignora RLS).
-- Rode uma vez no SQL Editor. Idempotente (pode rodar de novo sem quebrar).

create table if not exists public.rede_interesses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  area       text not null,          -- 'interv' | 'rodas' | 'eventos'
  area_nome  text,                   -- rótulo da área ("Grupos de intervisão")
  nome       text,                   -- nome do profissional (denormalizado)
  criado_em  timestamptz not null default now()
);

-- Colunas do encontro específico (adicionadas de forma segura)
alter table public.rede_interesses add column if not exists item      text not null default '';  -- título do encontro
alter table public.rede_interesses add column if not exists item_data date;                       -- data do encontro

-- 1 interesse por (pessoa, área, encontro) — permite vários encontros por pessoa e upsert
alter table public.rede_interesses drop constraint if exists rede_interesses_user_id_area_key;         -- unique antigo (por área)
alter table public.rede_interesses drop constraint if exists rede_interesses_user_id_area_item_key;
alter table public.rede_interesses add  constraint rede_interesses_user_id_area_item_key unique (user_id, area, item);

alter table public.rede_interesses enable row level security;

-- Cada profissional insere/atualiza/lê SÓ o próprio interesse.
drop policy if exists "inserir proprio interesse" on public.rede_interesses;
create policy "inserir proprio interesse" on public.rede_interesses
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "atualizar proprio interesse" on public.rede_interesses;
create policy "atualizar proprio interesse" on public.rede_interesses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ler proprio interesse" on public.rede_interesses;
create policy "ler proprio interesse" on public.rede_interesses
  for select to authenticated using (user_id = auth.uid());

grant insert, update, select on public.rede_interesses to authenticated;

notify pgrst, 'reload schema';

-- Pra ver quem tem interesse em cada encontro (rode quando quiser):
-- select area_nome, item, to_char(item_data,'DD/MM') as data, nome, criado_em
-- from public.rede_interesses order by item_data, criado_em;

-- ── Admin (você) lê TODOS os interesses, pra saber quem vai a cada encontro ──
drop policy if exists "admin le interesses" on public.rede_interesses;
create policy "admin le interesses" on public.rede_interesses
  for select to authenticated using (public.eh_admin());

notify pgrst, 'reload schema';
