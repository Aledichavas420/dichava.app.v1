-- ══════════════════════════════════════════════════════════════
-- dichava.app — Miniatura da foto do profissional (reduz egress)
-- A lista de profissionais passa a usar uma miniatura leve (poucos KB) em vez
-- da foto cheia (data URL grande). A foto cheia continua só na ficha aberta.
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- ══════════════════════════════════════════════════════════════

-- 1) Coluna da miniatura (data URL ~96px, bem comprimida)
alter table public.profissionais add column if not exists foto_mini text;

-- 2) Recria a view pública incluindo foto_mini (mesmas colunas seguras de antes)
drop view if exists public.profissionais_pub;
create view public.profissionais_pub as
select
  id, nome, tipo_prof, reg, bio, especialidades, modalidade, cidade,
  valor, duracao, disponibilidade, publicos, idiomas, foto, foto_mini, link, telefone,
  agenda_codigo, destaque, ativo, em_teste, oculto_diretorio, status,
  capa,
  case when plano in ('profissional','clinica') then agenda_config else null end as agenda_config,
  bio_links, bio_config,
  instagram, site, linkedin, estado, instituicao, ano_formacao, especializacao
from public.profissionais
where status = 'aprovado';

grant select on public.profissionais_pub to anon, authenticated;

notify pgrst, 'reload schema';
