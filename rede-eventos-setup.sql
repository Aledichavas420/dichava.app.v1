-- ══════════════════════════════════════════════════════════════
-- dichava.app — Eventos da Rede (mural: intervisão, rodas, eventos)
-- Você cadastra os encontros reais pelo painel admin; a aba Rede da clínica
-- lê daqui. Sem datas fictícias: área sem evento aparece como "Em breve".
--
-- Requer a função public.eh_admin() (do admin-setup.sql).
-- Rode no SQL Editor do Supabase. Idempotente.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.rede_eventos (
  id        uuid primary key default gen_random_uuid(),
  area      text not null check (area in ('interv','rodas','eventos')),  -- qual card do mural
  titulo    text not null,
  sub       text,
  data      date,
  hora      text,
  link      text,
  tag       text,        -- ex.: Online, Presencial
  ativo     boolean not null default true,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists rede_eventos_area_idx on public.rede_eventos (area, data);

alter table public.rede_eventos enable row level security;

-- Profissionais logados leem os encontros ativos (é o que aparece no mural).
drop policy if exists "rede_eventos_read" on public.rede_eventos;
create policy "rede_eventos_read" on public.rede_eventos
  for select to authenticated using (ativo = true);

-- Admin (você) faz tudo.
drop policy if exists "rede_eventos_admin" on public.rede_eventos;
create policy "rede_eventos_admin" on public.rede_eventos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

grant select, insert, update, delete on public.rede_eventos to authenticated;

notify pgrst, 'reload schema';
