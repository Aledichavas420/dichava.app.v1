-- dichava.app — Teste grátis de 7 dias para profissionais (Opção B: liberado na curadoria)
-- Rode DEPOIS de planos-recursos-setup.sql. Idempotente.
--
-- Acrescenta a ação 'trial' ao admin_prof_acao SEM mudar a assinatura da função
-- (então os grants existentes continuam valendo). Para o teste, p_meses carrega
-- o número de DIAS (padrão 7). O acesso é cortado automaticamente pelo checarAcesso
-- do painel quando acesso_ate vence — igual a uma assinatura normal.
--
-- Coluna em_teste: marca quem está no teste grátis. O diretório público do app
-- só mostra profissionais PAGANTES (em_teste = false), então quem está testando
-- usa o painel por 7 dias mas ainda não aparece pra os pacientes.

alter table public.profissionais add column if not exists em_teste boolean not null default false;

create or replace function public.admin_prof_acao(p_id uuid, p_acao text, p_meses int default null, p_obs text default null, p_plano text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_plano text;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  if p_acao = 'aprovar' then
    update public.profissionais set status='aprovado' where id=p_id;
  elsif p_acao = 'rejeitar' then
    update public.profissionais set status='rejeitado', ativo=false, destaque=false, em_teste=false where id=p_id;
  elsif p_acao = 'liberar' then
    -- Assinatura paga: aparece no diretório (em_teste = false).
    v_plano := coalesce(p_plano, (select plano from public.profissionais where id=p_id));
    update public.profissionais set ativo=true, status='aprovado', liberado_em=now(), em_teste=false,
      acesso_ate = case when coalesce(p_meses,0) > 0 then now() + (p_meses || ' months')::interval else null end,
      obs_admin = coalesce(p_obs, obs_admin), plano = coalesce(p_plano, plano),
      destaque = (select destaque from public.plano_caps(v_plano))
      where id=p_id;
  elsif p_acao = 'trial' then
    -- Teste grátis: p_meses = nº de DIAS (padrão 7). Acesso completo ao painel,
    -- mas em_teste = true → NÃO aparece no diretório público até virar pagante.
    v_plano := coalesce(p_plano, (select plano from public.profissionais where id=p_id));
    update public.profissionais set ativo=true, status='aprovado', liberado_em=now(), em_teste=true,
      acesso_ate = now() + (coalesce(nullif(p_meses,0),7) || ' days')::interval,
      obs_admin = coalesce(p_obs, obs_admin), plano = coalesce(p_plano, plano),
      destaque = (select destaque from public.plano_caps(v_plano))
      where id=p_id;
  elsif p_acao = 'bloquear' then
    update public.profissionais set ativo=false where id=p_id;
  else
    raise exception 'ação inválida';
  end if;
  if p_obs is not null then update public.profissionais set obs_admin=p_obs where id=p_id; end if;
end $$;
revoke all on function public.admin_prof_acao(uuid,text,int,text,text) from public, anon;
grant execute on function public.admin_prof_acao(uuid,text,int,text,text) to authenticated;

notify pgrst, 'reload schema';
