-- ══════════════════════════════════════════════════════════════
-- dichava.app — Lista de espera de profissionais no Painel Admin
-- Mostra os cadastros vindos de /landing/profissionais.html (tabela
-- pro_waitlist) e permite marcar o andamento de cada um.
--
-- Rode este arquivo no SQL Editor do Supabase (uma vez).
-- Depende de public.eh_admin() (já criado no admin-setup.sql).
-- ══════════════════════════════════════════════════════════════

-- 1) Garante as colunas de acompanhamento (não quebra se já existirem)
alter table public.pro_waitlist add column if not exists status     text not null default 'pendente';
alter table public.pro_waitlist add column if not exists obs_admin  text;
alter table public.pro_waitlist add column if not exists criado_em  timestamptz not null default now();
--   status: 'pendente' | 'contato' | 'liberado' | 'recusado'

-- 2) Leitura da lista de espera (só admin) — SECURITY DEFINER contorna o RLS
create or replace function public.admin_waitlist()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare r json;
begin
  if not public.eh_admin() then
    raise exception 'not authorized';
  end if;
  select coalesce(json_agg(x order by x.criado_em desc), '[]'::json) into r from (
    select id, nome, registro, especialidade, cidade, atendimento,
           email, whatsapp, plano, mensagem,
           coalesce(status,'pendente') as status, obs_admin, criado_em
    from public.pro_waitlist
  ) x;
  return r;
end $$;

revoke all on function public.admin_waitlist() from public, anon;
grant execute on function public.admin_waitlist() to authenticated;

-- 3) Atualiza o status/observação de um cadastro (só admin)
create or replace function public.admin_waitlist_status(p_id uuid, p_status text, p_obs text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('pendente','contato','liberado','recusado') then
    raise exception 'status invalido';
  end if;
  update public.pro_waitlist
     set status = p_status,
         obs_admin = coalesce(p_obs, obs_admin)
   where id = p_id;
end $$;

revoke all on function public.admin_waitlist_status(uuid, text, text) from public, anon;
grant execute on function public.admin_waitlist_status(uuid, text, text) to authenticated;
