-- ════════════════════════════════════════════════════════════
-- dichava.rd — Notificações push (rodar no SQL Editor do Supabase)
-- ════════════════════════════════════════════════════════════

-- 1) Assinaturas de push (um registro por aparelho/navegador)
create table if not exists public.push_subs (
  endpoint    text primary key,
  user_id     text not null,
  p256dh      text not null,
  auth        text not null,
  goal        text,
  tz          text default 'America/Sao_Paulo',
  updated_at  timestamptz default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);

-- 2) Log de envios — evita mandar a mesma mensagem duas vezes
create table if not exists public.push_log (
  id        bigint generated always as identity primary key,
  user_id   text not null,
  k         text not null,                 -- chave única da mensagem (ex: tl:Cannabis:3)
  sent_at   timestamptz default now(),
  unique (user_id, k)
);

-- 3) RLS: o app (cliente) só mexe nas próprias assinaturas.
--    A Edge Function usa a service_role e ignora RLS.
alter table public.push_subs enable row level security;

-- o app pode estar logado via Supabase Auth (papel `authenticated`) OU usar a
-- chave anônima (papel `anon`) — por isso liberamos os dois. A Edge Function usa
-- a service_role e ignora RLS de qualquer forma.
drop policy if exists "push_subs_anon_rw" on public.push_subs;
drop policy if exists "push_subs_rw" on public.push_subs;
create policy "push_subs_rw" on public.push_subs
  for all to anon, authenticated using (true) with check (true);

-- push_log é só do servidor — sem políticas para anon (fica bloqueado p/ cliente).
alter table public.push_log enable row level security;
