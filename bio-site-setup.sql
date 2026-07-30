-- dichava.app — Link na bio da comunidade (Dichavando), editável só pelo admin.
-- Página pública: dichava.app/dichavando  · Rode no SQL Editor. Idempotente.

create table if not exists public.bio_site (
  id            int primary key default 1,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  constraint bio_site_single check (id = 1)
);

alter table public.bio_site enable row level security;

-- Qualquer um lê (é uma página pública)
drop policy if exists bio_site_read on public.bio_site;
create policy bio_site_read on public.bio_site for select using (true);

-- Só admin edita
drop policy if exists bio_site_admin on public.bio_site;
create policy bio_site_admin on public.bio_site
  for all using (public.eh_admin()) with check (public.eh_admin());

insert into public.bio_site(id, dados) values (1, '{}'::jsonb) on conflict (id) do nothing;

notify pgrst, 'reload schema';
