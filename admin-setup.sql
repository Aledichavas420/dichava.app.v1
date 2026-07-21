-- dichava.app — Painel ADMIN (acesso restrito ao dono)
-- Rode uma vez no SQL Editor do Supabase. Idempotente.
-- ⚠️ Ajuste o e-mail de admin abaixo se precisar (pode listar mais de um).

-- ══════════════════════════════════════════════════════════════
-- 0) QUEM É ADMIN
-- Uma função central pra decidir se o usuário logado é admin.
-- Troque/adicione e-mails na lista.
-- ══════════════════════════════════════════════════════════════
create or replace function public.eh_admin()
returns boolean
language sql stable
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = any (array[
      'alex.mnteir@gmail.com'
    ]),
  false);
$$;

-- ══════════════════════════════════════════════════════════════
-- 1) CONTROLE DE ACESSO PAGO DO PROFISSIONAL
-- ativo       = true quando você libera (após pagamento)
-- acesso_ate  = data de validade da assinatura (null = sem validade/único)
-- liberado_em = quando foi liberado (histórico)
-- obs_admin   = anotação sua (ex: "pagou Pix 24/07, plano mensal")
-- ══════════════════════════════════════════════════════════════
alter table public.profissionais add column if not exists ativo       boolean not null default false;
alter table public.profissionais add column if not exists acesso_ate  timestamptz;
alter table public.profissionais add column if not exists liberado_em timestamptz;
alter table public.profissionais add column if not exists obs_admin   text;

-- ══════════════════════════════════════════════════════════════
-- 2) RLS: o admin pode LER e ATUALIZAR todos os profissionais
-- (sem quebrar as políticas que já existem pro próprio profissional)
-- ══════════════════════════════════════════════════════════════
alter table public.profissionais enable row level security;

drop policy if exists prof_admin_all on public.profissionais;
create policy prof_admin_all on public.profissionais
  for all using (public.eh_admin()) with check (public.eh_admin());

-- admin lê todas as avaliações e solicitações (se as tabelas existirem)
do $$ begin
  if to_regclass('public.avaliacoes_prof') is not null then
    execute 'drop policy if exists avp_admin_read on public.avaliacoes_prof';
    execute 'create policy avp_admin_read on public.avaliacoes_prof for select using (public.eh_admin())';
  end if;
  if to_regclass('public.solicitacoes') is not null then
    execute 'alter table public.solicitacoes enable row level security';
    execute 'drop policy if exists sol_admin_read on public.solicitacoes';
    execute 'create policy sol_admin_read on public.solicitacoes for select using (public.eh_admin())';
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════
-- 3) ESTATÍSTICAS DO DASHBOARD
-- SECURITY DEFINER: roda com privilégio elevado (lê auth.users),
-- mas SÓ responde se quem chamou for admin. Seguro pro cliente.
-- ══════════════════════════════════════════════════════════════
create or replace function public.admin_stats()
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
  select json_build_object(
    'usuarios_total',      (select count(*) from auth.users),
    'usuarios_confirmados', (select count(*) from auth.users where email_confirmed_at is not null),
    'usuarios_7d',         (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'usuarios_novos_30d',  (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'prof_total',          (select count(*) from public.profissionais),
    'prof_pendentes',      (select count(*) from public.profissionais where coalesce(status,'pendente')='pendente'),
    'prof_aprovados',      (select count(*) from public.profissionais where status='aprovado'),
    'prof_ativos',         (select count(*) from public.profissionais where ativo=true and (acesso_ate is null or acesso_ate > now())),
    'prof_expirados',      (select count(*) from public.profissionais where ativo=true and acesso_ate is not null and acesso_ate <= now()),
    'avaliacoes_total',    (select count(*) from public.avaliacoes_prof),
    'avaliacoes_media',    (select round(avg(nota)::numeric,2) from public.avaliacoes_prof)
  ) into r;
  return r;
end $$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 4) LISTA DE PROFISSIONAIS PRO ADMIN (com agregados)
-- ══════════════════════════════════════════════════════════════
create or replace function public.admin_profissionais()
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
  select coalesce(json_agg(x order by x.criado desc), '[]'::json) into r from (
    select p.id, p.nome, p.tipo_prof, p.reg, p.cidade, p.telefone, p.link,
           coalesce(p.status,'pendente') as status, p.ativo, p.acesso_ate, p.liberado_em, p.obs_admin,
           coalesce(u.created_at, p.liberado_em, now()) as criado,
           u.email,
           (select count(*) from public.avaliacoes_prof a where a.prof_id=p.id) as n_aval,
           (select round(avg(a.nota)::numeric,1) from public.avaliacoes_prof a where a.prof_id=p.id) as media_aval
    from public.profissionais p
    left join auth.users u on u.id = p.id
  ) x;
  return r;
end $$;

revoke all on function public.admin_profissionais() from public, anon;
grant execute on function public.admin_profissionais() to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 5) AÇÕES DO ADMIN (aprovar / liberar acesso / rejeitar)
-- p_acao: 'aprovar' | 'rejeitar' | 'liberar' | 'bloquear'
-- p_meses: pra 'liberar' — quantos meses de acesso (null/0 = sem validade)
-- ══════════════════════════════════════════════════════════════
create or replace function public.admin_prof_acao(p_id uuid, p_acao text, p_meses int default null, p_obs text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'not authorized';
  end if;
  if p_acao = 'aprovar' then
    update public.profissionais set status='aprovado' where id=p_id;
  elsif p_acao = 'rejeitar' then
    update public.profissionais set status='rejeitado', ativo=false where id=p_id;
  elsif p_acao = 'liberar' then
    update public.profissionais
      set ativo=true, status='aprovado', liberado_em=now(),
          acesso_ate = case when coalesce(p_meses,0) > 0 then now() + (p_meses || ' months')::interval else null end,
          obs_admin = coalesce(p_obs, obs_admin)
      where id=p_id;
  elsif p_acao = 'bloquear' then
    update public.profissionais set ativo=false where id=p_id;
  else
    raise exception 'ação inválida';
  end if;
  if p_obs is not null then
    update public.profissionais set obs_admin=p_obs where id=p_id;
  end if;
end $$;

revoke all on function public.admin_prof_acao(uuid,text,int,text) from public, anon;
grant execute on function public.admin_prof_acao(uuid,text,int,text) to authenticated;

-- Recarrega o cache de schema do PostgREST
notify pgrst, 'reload schema';
