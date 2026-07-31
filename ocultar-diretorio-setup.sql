-- ══════════════════════════════════════════════════════════════
-- dichava.app — Ocultar perfil no diretório
-- Adiciona a coluna que permite ao profissional (ou ao admin) tirar o
-- perfil do diretório público SEM perder o acesso ao painel.
--
-- Diretório público (app do paciente e /landing/rede.html) passa a
-- esconder quem tiver oculto_diretorio = true. O acesso ao painel
-- (ativo / acesso_ate) não é afetado.
--
-- Como rodar: cole no SQL Editor do Supabase e execute.
-- ══════════════════════════════════════════════════════════════

alter table public.profissionais
  add column if not exists oculto_diretorio boolean not null default false;

-- Recarrega o cache de schema do PostgREST (senão a coluna demora a aparecer)
notify pgrst, 'reload schema';
