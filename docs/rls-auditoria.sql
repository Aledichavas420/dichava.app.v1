-- ════════════════════════════════════════════════════════════
-- dichava.app — AUDITORIA de RLS (Row-Level Security)
-- Rode no Supabase → SQL Editor e me mande os resultados.
-- Objetivo: garantir que NENHUMA tabela com dados pessoais está aberta.
-- ════════════════════════════════════════════════════════════

-- 1) Tabelas do schema public: RLS está LIGADO?
--    rls_enabled = false  →  ⚠️ TABELA ABERTA (precisa ligar RLS)
select
  c.relname                as tabela,
  c.relrowsecurity         as rls_enabled,
  c.relforcerowsecurity    as rls_forcado,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as qtd_politicas
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
order by c.relrowsecurity asc, c.relname;

-- 2) Detalhe de todas as políticas (o que cada uma libera)
select tablename, policyname, cmd, roles, qual::text as usando, with_check::text as com_check
from pg_policies
where schemaname='public'
order by tablename, cmd;

-- 3) ALERTA: tabelas SEM nenhuma política (mesmo com RLS ligado, ficam inacessíveis;
--    com RLS desligado, ficam TOTALMENTE abertas)
select c.relname as tabela_sem_politica, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
order by c.relname;

-- ────────────────────────────────────────────────────────────
-- Tabelas esperadas do dichava e o que cada uma deve ter:
--   registros        → RLS on, dono lê/escreve o próprio (user_id = auth.uid())
--   perfis           → RLS on, dono lê/escreve o próprio
--   profissionais    → RLS on, público lê aprovados, dono edita o seu, admin tudo
--   pagamentos       → RLS on, dono lê o seu (webhook grava via service role)
--   clinicas         → RLS on, membro lê/edita; dono cria
--   clinica_membros  → RLS on, membro lê; self insert; delete dono/self
--   pro_waitlist     → RLS on, insert público, select só admin/service
-- Se aparecer QUALQUER tabela com rls_enabled=false na consulta 1, me avise.
-- ────────────────────────────────────────────────────────────
