-- dichava.app — Banner de notícias (matérias de parceiros, ex.: Cannabis Monitor)
-- Rode no SQL Editor do Supabase. Idempotente. Requer eh_admin() (admin-setup.sql).

create table if not exists public.noticias (
  id        uuid primary key default gen_random_uuid(),
  manchete  text not null,
  link      text not null,          -- URL da matéria (abre no site do parceiro)
  fonte     text,                   -- ex.: 'Cannabis Monitor'
  imagem    text,                   -- URL de imagem (opcional)
  ativo     boolean not null default true,
  ordem     int not null default 0, -- menor = aparece primeiro
  criado_em timestamptz not null default now()
);

alter table public.noticias enable row level security;

-- Público (app) lê só as ativas; admin vê todas
drop policy if exists noticias_read on public.noticias;
create policy noticias_read on public.noticias
  for select using (ativo = true or public.eh_admin());

-- Só admin cria / edita / remove
drop policy if exists noticias_admin on public.noticias;
create policy noticias_admin on public.noticias
  for all using (public.eh_admin()) with check (public.eh_admin());

notify pgrst, 'reload schema';
