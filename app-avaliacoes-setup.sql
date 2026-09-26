-- dichava.app — Avaliação do app pelos usuários (pacientes)
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
--
-- Um card no app pergunta "Como está sendo o dichava pra você?" com nota de
-- 1 a 5 e um comentário opcional. Cada usuário tem uma avaliação (atualizável).
-- O admin vê a média e os comentários no painel.

create table if not exists public.app_avaliacoes (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  nota          int,
  comentario    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- mantém atualizado_em em dia
create or replace function public.app_aval_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
drop trigger if exists trg_app_aval_touch on public.app_avaliacoes;
create trigger trg_app_aval_touch before update on public.app_avaliacoes
for each row execute function public.app_aval_touch();

alter table public.app_avaliacoes enable row level security;
grant select, insert, update on public.app_avaliacoes to authenticated;

-- cada usuário escreve/atualiza/lê a PRÓPRIA avaliação
drop policy if exists "aval dono" on public.app_avaliacoes;
create policy "aval dono" on public.app_avaliacoes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- admin lê todas
drop policy if exists "aval admin le" on public.app_avaliacoes;
create policy "aval admin le" on public.app_avaliacoes
  for select to authenticated using (public.eh_admin());

notify pgrst, 'reload schema';
