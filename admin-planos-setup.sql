-- dichava.app — Admin v2: planos, comprovante, agendamentos e crescimento
-- Rode DEPOIS do admin-setup.sql. Idempotente.

-- 1) NOVAS COLUNAS
alter table public.profissionais add column if not exists plano       text;  -- plano que o profissional assina (essencial/pro/clinica...)
alter table public.profissionais add column if not exists comprovante text;  -- imagem do comprovante de pagamento (data URL)

-- 2) STATS (agora com agendamentos + crescimento de usuários por mês)
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare r json; has_sol boolean := to_regclass('public.solicitacoes') is not null;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select json_build_object(
    'usuarios_total',      (select count(*) from auth.users),
    'usuarios_confirmados',(select count(*) from auth.users where email_confirmed_at is not null),
    'usuarios_7d',         (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'usuarios_novos_30d',  (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'prof_total',          (select count(*) from public.profissionais),
    'prof_pendentes',      (select count(*) from public.profissionais where coalesce(status,'pendente')='pendente'),
    'prof_aprovados',      (select count(*) from public.profissionais where status='aprovado'),
    'prof_ativos',         (select count(*) from public.profissionais where ativo=true and (acesso_ate is null or acesso_ate > now())),
    'prof_expirados',      (select count(*) from public.profissionais where ativo=true and acesso_ate is not null and acesso_ate <= now()),
    'avaliacoes_total',    (select count(*) from public.avaliacoes_prof),
    'avaliacoes_media',    (select round(avg(nota)::numeric,2) from public.avaliacoes_prof),
    'agend_total',         (case when has_sol then (select count(*) from public.solicitacoes) else 0 end),
    'agend_30d',           (case when has_sol then (select count(*) from public.solicitacoes where criado_em > now() - interval '30 days') else 0 end),
    'agend_novas',         (case when has_sol then (select count(*) from public.solicitacoes where status='nova') else 0 end),
    'usuarios_por_mes',    (
      select coalesce(json_agg(json_build_object('mes', to_char(m,'YYYY-MM'), 'n', cnt) order by m), '[]'::json)
      from (
        select gs as m,
          (select count(*) from auth.users where date_trunc('month',created_at)=gs) as cnt
        from generate_series(date_trunc('month',now()) - interval '5 months', date_trunc('month',now()), interval '1 month') gs
      ) t
    )
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- 3) LISTA (inclui plano + comprovante)
create or replace function public.admin_profissionais()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select coalesce(json_agg(x order by x.criado desc), '[]'::json) into r from (
    select p.id, p.nome, p.tipo_prof, p.reg, p.cidade, p.telefone, p.link,
           coalesce(p.status,'pendente') as status, p.ativo, p.acesso_ate, p.liberado_em, p.obs_admin,
           p.plano, (p.comprovante is not null) as tem_comprovante,
           coalesce(u.created_at, p.liberado_em, now()) as criado, u.email,
           (select count(*) from public.avaliacoes_prof a where a.prof_id=p.id) as n_aval,
           (select round(avg(a.nota)::numeric,1) from public.avaliacoes_prof a where a.prof_id=p.id) as media_aval
    from public.profissionais p
    left join auth.users u on u.id = p.id
  ) x;
  return r;
end $$;
revoke all on function public.admin_profissionais() from public, anon;
grant execute on function public.admin_profissionais() to authenticated;

-- 3b) Buscar o comprovante de UM profissional (imagem pode ser grande — busca sob demanda)
create or replace function public.admin_comprovante(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select comprovante into c from public.profissionais where id=p_id;
  return c;
end $$;
revoke all on function public.admin_comprovante(uuid) from public, anon;
grant execute on function public.admin_comprovante(uuid) to authenticated;

-- 4) AÇÃO (agora aceita p_plano). Removemos a versão antiga pra não gerar ambiguidade.
drop function if exists public.admin_prof_acao(uuid,text,int,text);
create or replace function public.admin_prof_acao(p_id uuid, p_acao text, p_meses int default null, p_obs text default null, p_plano text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  if p_acao = 'aprovar' then
    update public.profissionais set status='aprovado' where id=p_id;
  elsif p_acao = 'rejeitar' then
    update public.profissionais set status='rejeitado', ativo=false where id=p_id;
  elsif p_acao = 'liberar' then
    update public.profissionais
      set ativo=true, status='aprovado', liberado_em=now(),
          acesso_ate = case when coalesce(p_meses,0) > 0 then now() + (p_meses || ' months')::interval else null end,
          obs_admin = coalesce(p_obs, obs_admin),
          plano = coalesce(p_plano, plano)
      where id=p_id;
  elsif p_acao = 'bloquear' then
    update public.profissionais set ativo=false where id=p_id;
  else raise exception 'ação inválida'; end if;
  if p_obs is not null then update public.profissionais set obs_admin=p_obs where id=p_id; end if;
end $$;
revoke all on function public.admin_prof_acao(uuid,text,int,text,text) from public, anon;
grant execute on function public.admin_prof_acao(uuid,text,int,text,text) to authenticated;

notify pgrst, 'reload schema';
