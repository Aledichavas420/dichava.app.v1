-- ══════════════════════════════════════════════════════════════
-- dichava.app — Newsletter (inscrição com consentimento LGPD)
-- Tabela + RPC público (anon) pra captar e-mails de quem QUER receber
-- novidades. Inclui anti-spam (rate limit), dedup e opção de descadastro.
--
-- Rode no SQL Editor do Supabase (uma vez). Seguro rodar de novo por cima.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.newsletter (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  consent     boolean not null default false,   -- marcou o "aceito receber"
  origem      text,                              -- de onde veio (landing, app, etc.)
  ativo       boolean not null default true,     -- false = descadastrou
  unsub_token uuid not null default gen_random_uuid(), -- token do link "descadastrar"
  criado_em   timestamptz not null default now()
);
-- e-mail único (case-insensitive)
create unique index if not exists newsletter_email_uidx on public.newsletter (lower(email));

alter table public.newsletter enable row level security;
-- sem policies = ninguém lê/escreve direto via anon; tudo passa pelas RPCs abaixo.

-- ── Inscrever (público) ──────────────────────────────────────
create or replace function public.newsletter_add(
  p_email   text,
  p_consent boolean default true,
  p_origem  text default 'landing'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(trim(lower(p_email)), '');
  v_burst int;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email invalido';
  end if;
  if coalesce(p_consent, false) = false then
    raise exception 'consentimento obrigatorio';
  end if;
  if length(coalesce(p_origem,'')) > 40 then p_origem := left(p_origem, 40); end if;

  -- anti-flood: no máximo 30 inscrições no último minuto
  select count(*) into v_burst from public.newsletter where criado_em > now() - interval '1 minute';
  if v_burst >= 30 then
    raise exception 'muitas tentativas, tente em instantes';
  end if;

  -- upsert: se já existe, reativa (idempotente, sem erro pro usuário)
  insert into public.newsletter (email, consent, origem, ativo)
  values (v_email, true, coalesce(p_origem,'landing'), true)
  on conflict (lower(email)) do update
    set ativo = true, consent = true;
end $$;

grant execute on function public.newsletter_add(text,boolean,text) to anon, authenticated;

-- ── Descadastrar (público, via token do link) ────────────────
create or replace function public.newsletter_unsub(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.newsletter set ativo = false where unsub_token = p_token;
end $$;

grant execute on function public.newsletter_unsub(uuid) to anon, authenticated;

-- ── Listar inscritos ativos (SÓ admin — usado pela função de envio) ──
-- A função de envio usa o service_role, que ignora RLS; esta view ajuda
-- caso você queira consultar no SQL Editor.
create or replace view public.newsletter_ativos as
  select email, origem, criado_em from public.newsletter where ativo = true and consent = true;
