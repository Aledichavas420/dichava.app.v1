-- ══════════════════════════════════════════════════════════════
-- dichava.app — Correções da auditoria de segurança (Fase 1)
--
-- Fecha os dois achados CONFIRMADOS que dependem do banco:
--   #1 tabela crua "profissionais" legível sem login (dados internos)
--   #3 visitante (anon) com permissão de escrita em 3 tabelas
--
-- Seguro de rodar: o app público lê pela VIEW profissionais_pub, e o
-- profissional logado continua lendo/gravando o PRÓPRIO registro pelas
-- policies "dono edita"/admin. Nada no app lê a tabela crua sem login.
--
-- Rode INTEIRO no Supabase → SQL Editor. Idempotente.
-- ══════════════════════════════════════════════════════════════

-- ── #1 — Parar de vazar a tabela crua de profissionais ────────────
-- A policy real que ainda libera a linha inteira pro público é
-- "ler aprovados" (veio de docs/profissionais-fix.sql). A correção
-- anterior derrubou "ler aprova" (nome diferente), por isso não pegou.
drop policy if exists "ler aprovados" on public.profissionais;  -- a verdadeira
drop policy if exists "ler aprova"   on public.profissionais;  -- resquício, por garantia

-- Tira também o privilégio de leitura do visitante na tabela base.
-- A VIEW profissionais_pub roda com direitos do dono, então continua
-- funcionando para anon mesmo sem este grant.
revoke select on public.profissionais from anon;

-- Garante que a porta pública certa (a view, só com colunas seguras)
-- segue liberada para todo mundo.
grant select on public.profissionais_pub to anon, authenticated;

-- ── #3 — Tirar escrita anônima onde ela não deveria existir ───────
-- O RLS já barra por linha (as policies exigem dono/admin), mas o grant
-- de escrita pro visitante não deveria nem existir. Ninguém escreve
-- nessas tabelas sem estar logado: profissional e paciente são sempre
-- autenticados; notícia é só admin.
revoke insert, update, delete on public.profissionais    from anon;
revoke insert, update, delete on public.noticias         from anon;
revoke insert, update, delete on public.avaliacoes_prof  from anon;

notify pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════
-- CONFERÊNCIA (opcional) — rode como visitante e confira o esperado:
--
--   set local role anon;
--   select count(*) from public.profissionais_pub;            -- deve funcionar (diretório)
--   select count(*) from public.profissionais;                -- deve dar 0 (ou erro de permissão)
--   reset role;
--
-- E o teste de escrita anônima que o relatório deixou pendente deve
-- passar a responder vazio/negado depois deste script.
-- ══════════════════════════════════════════════════════════════
