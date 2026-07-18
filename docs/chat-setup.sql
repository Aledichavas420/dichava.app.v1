-- ════════════════════════════════════════════════════════════
-- dichava.app — Chat usuário ↔ profissional
-- Rode no Supabase → SQL Editor (uma vez).
-- ════════════════════════════════════════════════════════════

-- 0) coluna de WhatsApp no perfil profissional (se ainda não existir)
alter table public.profissionais add column if not exists telefone text;

-- 1) CONVERSAS (uma por par usuário+profissional)
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,          -- o usuário
  prof_id uuid not null,          -- o profissional (auth.uid do profissional)
  user_nome text,
  prof_nome text,
  ultima_msg text,
  atualizado_em timestamptz default now(),
  criado_em timestamptz default now(),
  unique (user_id, prof_id)
);

-- 2) MENSAGENS
create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references public.conversas(id) on delete cascade,
  de_id uuid not null,            -- quem enviou (auth.uid)
  texto text not null,
  criado_em timestamptz default now()
);
create index if not exists idx_msg_conversa on public.mensagens(conversa_id, criado_em);

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

-- 3) helper: sou participante desta conversa? (security definer evita recursão)
create or replace function public.sou_participante(cid uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.conversas c
    where c.id = cid and (c.user_id = auth.uid() or c.prof_id = auth.uid())
  );
$$;

-- 4) POLÍTICAS — conversas (só os dois participantes)
drop policy if exists "conversa participante select" on public.conversas;
create policy "conversa participante select" on public.conversas
  for select using (user_id = auth.uid() or prof_id = auth.uid());

drop policy if exists "conversa insert" on public.conversas;
create policy "conversa insert" on public.conversas
  for insert with check (user_id = auth.uid() or prof_id = auth.uid());

drop policy if exists "conversa update" on public.conversas;
create policy "conversa update" on public.conversas
  for update using (user_id = auth.uid() or prof_id = auth.uid());

-- 5) POLÍTICAS — mensagens
drop policy if exists "msg select" on public.mensagens;
create policy "msg select" on public.mensagens
  for select using (public.sou_participante(conversa_id));

drop policy if exists "msg insert" on public.mensagens;
create policy "msg insert" on public.mensagens
  for insert with check (de_id = auth.uid() and public.sou_participante(conversa_id));
