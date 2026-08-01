-- ══════════════════════════════════════════════════════════════
-- dichava.app — DIAGNÓSTICO DE SEGURANÇA (RLS e políticas)
-- Não altera NADA. Só lê o estado atual. Rode no SQL Editor do Supabase
-- e me mande os 3 resultados (pode ser print).
-- ══════════════════════════════════════════════════════════════

-- 1) RLS ligado ou desligado em cada tabela.
--    ATENÇÃO especial a: clinicas, clinica_membros, push_subs
--    (rls_ligado tem que ser TRUE nelas — é onde estão os prontuários).
select tablename, rowsecurity as rls_ligado
from pg_tables
where schemaname = 'public'
order by rowsecurity asc, tablename;

-- 2) Todas as políticas (o que cada uma libera — USING/WITH CHECK).
--    Procuramos por 'true' solto em tabelas com dado sensível.
select tablename, policyname, cmd,
       coalesce(qual, '—')       as using_expr,
       coalesce(with_check, '—') as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Tabelas SEM nenhuma política.
--    Se RLS estiver LIGADO e sem política → tabela fica 100% bloqueada (só via RPC).
--    Se RLS estiver DESLIGADO e sem política → tabela fica 100% ABERTA (perigo!).
select t.tablename
from pg_tables t
where t.schemaname = 'public'
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tablename
  )
order by t.tablename;
