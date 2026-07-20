-- dichava.app — Pendências finais de SQL (idempotente, rode uma vez no SQL Editor)
-- Cobre: avaliações de profissionais + colunas foto/link/capa do perfil.

-- ══ 1) AVALIAÇÕES DE PROFISSIONAIS (estrelas + comentário) ══
create table if not exists public.avaliacoes_prof (
  id         uuid primary key default gen_random_uuid(),
  prof_id    uuid not null references public.profissionais(id) on delete cascade,
  user_id    uuid not null,
  user_nome  text,
  nota       int  not null check (nota between 1 and 5),
  comentario text,
  criado_em  timestamptz not null default now(),
  unique (prof_id, user_id)
);
alter table public.avaliacoes_prof enable row level security;

drop policy if exists avp_read   on public.avaliacoes_prof;
create policy avp_read   on public.avaliacoes_prof for select using (true);
drop policy if exists avp_insert on public.avaliacoes_prof;
create policy avp_insert on public.avaliacoes_prof for insert with check (auth.uid()::text = user_id::text);
drop policy if exists avp_update on public.avaliacoes_prof;
create policy avp_update on public.avaliacoes_prof for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);
drop policy if exists avp_delete on public.avaliacoes_prof;
create policy avp_delete on public.avaliacoes_prof for delete using (auth.uid()::text = user_id::text);

-- ══ 2) COLUNAS DO PERFIL DO PROFISSIONAL ══
alter table public.profissionais add column if not exists foto text;  -- foto (data URL redimensionada no cliente)
alter table public.profissionais add column if not exists link text;  -- @instagram ou site
alter table public.profissionais add column if not exists capa text;  -- tema da capa (verde/oceano/roxo/porsol/rosa/grafite)
