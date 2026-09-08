-- dichava.app — Consultas do painel admin: exclusões e vencidos ativos
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
--
-- Cria duas funções (security definer, só admin) usadas pelos novos
-- blocos do painel admin:
--   admin_conta_exclusoes()  → quem excluiu o próprio perfil
--   admin_vencidos_ativos()  → profissionais vencidos que ainda logam

-- ── Quem excluiu o próprio perfil ─────────────────────────────────
-- A exclusão é definitiva (apaga profissionais + dados + login). O único
-- rastro fica em conta_exclusoes. Só o painel da clínica tem o botão de
-- auto-exclusão, então tudo aqui é profissional.
create or replace function public.admin_conta_exclusoes()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select coalesce(json_agg(x order by x.criado_em desc), '[]'::json) into r from (
    select email, motivo, criado_em from public.conta_exclusoes
  ) x;
  return r;
end $$;
revoke all on function public.admin_conta_exclusoes() from public, anon;
grant execute on function public.admin_conta_exclusoes() to authenticated;

-- ── Vencidos que continuam ativos ─────────────────────────────────
-- Acesso vencido (respeitando os 5 dias de carência dos recorrentes) e
-- ainda com a conta liberada. last_sign_in_at vem do auth.users; o id do
-- profissional é o mesmo do login. logou_apos_vencer = seguem usando.
create or replace function public.admin_vencidos_ativos()
returns json language plpgsql security definer set search_path = public, auth as $$
declare r json;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select coalesce(json_agg(x order by x.ultimo_login desc nulls last), '[]'::json) into r from (
    select p.id, p.nome, u.email, p.plano,
           p.acesso_ate,
           u.last_sign_in_at as ultimo_login,
           (now()::date - p.acesso_ate::date) as dias_vencido,
           case when p.obs_admin ~* '♻️|recorrente'     then 'recorrente'
                when p.obs_admin ~* '🎁|teste gr|trial' then 'teste'
                else 'pix/avulso' end as tipo,
           (u.last_sign_in_at is not null and u.last_sign_in_at > p.acesso_ate) as logou_apos_vencer
    from public.profissionais p
    join auth.users u on u.id = p.id
    where p.ativo = true
      and p.acesso_ate is not null
      and p.acesso_ate
          + (case when p.obs_admin ~* '♻️|recorrente'
                  then interval '5 days' else interval '0 days' end) < now()
  ) x;
  return r;
end $$;
revoke all on function public.admin_vencidos_ativos() from public, anon;
grant execute on function public.admin_vencidos_ativos() to authenticated;

notify pgrst, 'reload schema';
