-- dichava.app — Avaliações de profissionais pelos pacientes (estrelas + comentário)
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists public.avaliacoes_prof (
  id         uuid primary key default gen_random_uuid(),
  prof_id    uuid not null references public.profissionais(id) on delete cascade,
  user_id    uuid not null,
  user_nome  text,
  nota       int  not null check (nota between 1 and 5),
  comentario text,
  criado_em  timestamptz not null default now(),
  unique (prof_id, user_id)            -- 1 avaliação por paciente por profissional (atualizável)
);

alter table public.avaliacoes_prof enable row level security;

-- Qualquer pessoa pode LER avaliações (aparecem na ficha pública do profissional)
drop policy if exists avp_read on public.avaliacoes_prof;
create policy avp_read on public.avaliacoes_prof for select using (true);

-- O paciente só escreve/edita/apaga a PRÓPRIA avaliação (user_id = auth.uid())
drop policy if exists avp_insert on public.avaliacoes_prof;
create policy avp_insert on public.avaliacoes_prof for insert with check (auth.uid() = user_id);
drop policy if exists avp_update on public.avaliacoes_prof;
create policy avp_update on public.avaliacoes_prof for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists avp_delete on public.avaliacoes_prof;
create policy avp_delete on public.avaliacoes_prof for delete using (auth.uid() = user_id);
