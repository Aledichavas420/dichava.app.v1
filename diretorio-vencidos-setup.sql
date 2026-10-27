-- ══════════════════════════════════════════════════════════════
-- dichava.app — Tira do diretório quem está com a assinatura VENCIDA
--
-- Problema: quando acesso_ate vence, o painel corta o acesso (checarAcesso),
-- mas a coluna ativo continua true no banco. O diretório (landing/rede.html e
-- a aba de profissionais do app) só olhava ativo, então quem não renovou
-- seguia aparecendo pros pacientes.
--
-- Correção: a view pública passa a devolver ativo = false quando o acesso
-- venceu, com a mesma regra do painel/admin (recorrente tem 5 dias de
-- carência). Não altera nenhum dado: se a pessoa renovar, volta sozinha.
-- acesso_ate continua fora da view (não é exposto ao público).
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- ══════════════════════════════════════════════════════════════

-- 0) CONFERÊNCIA (rode antes, se quiser ver a lista): quem aparecia no
--    diretório mesmo com o acesso vencido.
-- select nome, email, plano, acesso_ate, obs_admin
-- from public.profissionais
-- where status = 'aprovado' and ativo = true
--   and coalesce(em_teste,false) = false and coalesce(oculto_diretorio,false) = false
--   and acesso_ate is not null
--   and acesso_ate + case when coalesce(obs_admin,'') ~* '♻️|recorrente' then interval '5 days' else interval '0' end <= now()
-- order by acesso_ate;

drop view if exists public.profissionais_pub;
create view public.profissionais_pub as
select
  id, nome, tipo_prof, reg, bio, especialidades, modalidade, cidade,
  valor, duracao, disponibilidade, publicos, idiomas, foto, foto_mini, link, telefone,
  case when plano in ('profissional','clinica') then agenda_codigo else null end as agenda_codigo,
  destaque,
  (ativo is true and (
     acesso_ate is null
     or acesso_ate + case when coalesce(obs_admin,'') ~* '♻️|recorrente' then interval '5 days' else interval '0' end > now()
  )) as ativo,
  em_teste, oculto_diretorio, status,
  capa,
  case when plano in ('profissional','clinica') then agenda_config else null end as agenda_config,
  bio_links, bio_config,
  instagram, site, linkedin, estado, instituicao, ano_formacao, especializacao
from public.profissionais
where status = 'aprovado';

grant select on public.profissionais_pub to anon, authenticated;

notify pgrst, 'reload schema';
