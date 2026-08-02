-- ══════════════════════════════════════════════════════════════
-- dichava.app — Fecha vazamento de colunas sensíveis em profissionais
--
-- Problema: a policy "ler aprova" (SELECT público em status='aprovado')
-- liberava a LINHA INTEIRA — incluindo obs_admin (anotações internas),
-- comprovante (imagem de pagamento) e email — pra qualquer visitante.
--
-- Correção: remover essa leitura pública da tabela base e expor o
-- diretório por uma VIEW só com colunas seguras. Dono e admin continuam
-- lendo a tabela base normalmente (policies "dono edita" e admin).
--
-- Rode no SQL Editor do Supabase (uma vez).
-- ══════════════════════════════════════════════════════════════

-- 1) Remove a leitura pública que vazava a linha inteira
drop policy if exists "ler aprova" on public.profissionais;

-- 2) View pública com APENAS colunas seguras (nunca obs_admin, comprovante,
--    email, plano, acesso_ate, liberado_em). A view roda como dona (bypassa
--    o RLS da base de forma controlada) e só devolve profissionais aprovados.
drop view if exists public.profissionais_pub;
create view public.profissionais_pub as
select
  id, nome, tipo_prof, reg, bio, especialidades, modalidade, cidade,
  valor, duracao, disponibilidade, publicos, idiomas, foto, link, telefone,
  agenda_codigo, destaque, ativo, em_teste, oculto_diretorio, status,
  capa, agenda_config, bio_links, bio_config,
  instagram, site, linkedin, estado, instituicao, ano_formacao, especializacao
from public.profissionais
where status = 'aprovado';

-- 3) Libera leitura da VIEW pro público (o app e a landing leem daqui)
grant select on public.profissionais_pub to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Conferência (opcional): como visitante, tentar ler colunas sensíveis
--    pela VIEW deve FALHAR (a coluna nem existe lá); pela tabela base deve
--    vir VAZIO (sem a policy pública).
-- set local role anon;
-- select count(*) from public.profissionais_pub;              -- deve funcionar
-- select count(*) from public.profissionais where status='aprovado'; -- deve dar 0
-- reset role;
