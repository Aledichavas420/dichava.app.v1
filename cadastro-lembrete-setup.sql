-- ══════════════════════════════════════════════════════════════
-- dichava.app — Lembrete de cadastro incompleto
-- Tabela pra registrar a quem já enviamos o lembrete de "confirme seu
-- e-mail", evitando mandar duas vezes. Preenchida pela Edge Function
-- "cadastro-lembrete" (que roda por cron e usa o service_role).
--
-- Rode no SQL Editor do Supabase (uma vez).
-- ══════════════════════════════════════════════════════════════

create table if not exists public.cadastro_lembrete (
  user_id    uuid primary key,
  email      text,
  enviado_em timestamptz not null default now()
);

alter table public.cadastro_lembrete enable row level security;
-- sem policies = travada pro anon; só o service_role (Edge Function) acessa.
