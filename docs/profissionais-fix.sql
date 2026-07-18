-- ════════════════════════════════════════════════════════════
-- dichava.app — CONSERTA a tabela profissionais (idempotente)
-- Garante todas as colunas que o app usa + permissões. Não apaga dados.
-- Rode inteiro no Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════

-- 1) tabela (se não existir, cria com a PK)
create table if not exists public.profissionais ( id uuid primary key );

-- 2) garante TODAS as colunas que o app grava
alter table public.profissionais
  add column if not exists nome text,
  add column if not exists email text,
  add column if not exists reg text,
  add column if not exists tipo_prof text,
  add column if not exists bio text,
  add column if not exists especialidades text,
  add column if not exists modalidade text,
  add column if not exists cidade text,
  add column if not exists valor text,
  add column if not exists duracao text,
  add column if not exists disponibilidade text,
  add column if not exists status text default 'pendente',
  add column if not exists criado_em timestamptz default now();

-- 3) segurança
alter table public.profissionais enable row level security;

-- 4) qualquer pessoa lê os APROVADOS (lista dos usuários)
drop policy if exists "ler aprovados" on public.profissionais;
create policy "ler aprovados" on public.profissionais
  for select using (status = 'aprovado');

-- 5) o próprio profissional cria/edita/lê o SEU registro
drop policy if exists "dono edita" on public.profissionais;
create policy "dono edita" on public.profissionais
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 6) admin (você) lê e edita TODOS
drop policy if exists "admin le tudo" on public.profissionais;
create policy "admin le tudo" on public.profissionais
  for select using ( (auth.jwt() ->> 'email') = 'alex.mnteir@gmail.com' );

drop policy if exists "admin edita tudo" on public.profissionais;
create policy "admin edita tudo" on public.profissionais
  for update using ( (auth.jwt() ->> 'email') = 'alex.mnteir@gmail.com' )
  with check ( true );

-- 7) CONFERIR: ver as colunas atuais da tabela
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='profissionais' order by ordinal_position;
