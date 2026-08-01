-- ══════════════════════════════════════════════════════════════
-- dichava.app — Controle de "lembrete de lançamento já enviado"
-- Registra a data em que o lembrete foi enviado pra cada cadastro da
-- lista de espera, pra você poder reenviar SÓ pra quem ainda não recebeu.
--
-- Rode no SQL Editor do Supabase (uma vez).
-- Depende de public.eh_admin() e da tabela public.pro_waitlist.
-- ══════════════════════════════════════════════════════════════

-- 1) Coluna que guarda quando o lembrete foi enviado (null = nunca)
alter table public.pro_waitlist add column if not exists lembrete_em timestamptz;

-- 2) admin_waitlist agora também devolve lembrete_em
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
           coalesce(status,'pendente') as status, obs_admin, criado_em, lembrete_em
    from public.pro_waitlist
  ) x;
  return r;
end $$;

revoke all on function public.admin_waitlist() from public, anon;
grant execute on function public.admin_waitlist() to authenticated;

-- 3) Marca (ou desmarca) o lembrete como enviado, em lote
--    p_ids: lista de ids;  p_marcar: true = agora, false = limpa a marca
create or replace function public.admin_waitlist_lembrete(p_ids uuid[], p_marcar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'not authorized';
  end if;
  update public.pro_waitlist
     set lembrete_em = case when p_marcar then now() else null end
   where id = any(p_ids);
end $$;

revoke all on function public.admin_waitlist_lembrete(uuid[], boolean) from public, anon;
grant execute on function public.admin_waitlist_lembrete(uuid[], boolean) to authenticated;

-- Recarrega o cache de schema do PostgREST
notify pgrst, 'reload schema';
