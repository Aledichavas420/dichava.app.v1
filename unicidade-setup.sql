-- dichava.app — Garante unicidade (1 linha por usuário) e evita conflitos
-- Rode uma vez no SQL Editor. Idempotente.

-- ══════════════════════════════════════════════════════════════
-- 1) PERFIS: no máximo 1 linha por user_id
-- Primeiro remove duplicatas (mantendo a de maior validade premium),
-- depois cria o índice único.
-- ══════════════════════════════════════════════════════════════
delete from public.perfis a
using public.perfis b
where a.user_id = b.user_id
  and (
    coalesce(a.plano_expira,'-infinity') < coalesce(b.plano_expira,'-infinity')
    or (coalesce(a.plano_expira,'-infinity') = coalesce(b.plano_expira,'-infinity') and a.ctid < b.ctid)
  );

create unique index if not exists perfis_user_id_key on public.perfis(user_id);

-- ══════════════════════════════════════════════════════════════
-- 2) PROFISSIONAIS: no máximo 1 linha por id (= id do auth.users)
-- (normalmente o id já é PK; o índice único é uma garantia extra.)
-- ══════════════════════════════════════════════════════════════
do $$ begin
  -- remove duplicatas por id, se houver (mantém a linha liberada/ativa preferencialmente)
  delete from public.profissionais a
  using public.profissionais b
  where a.id = b.id
    and (
      (coalesce(a.ativo,false)::int) < (coalesce(b.ativo,false)::int)
      or ((coalesce(a.ativo,false)) = (coalesce(b.ativo,false)) and a.ctid < b.ctid)
    );
exception when others then null; -- se id já é PK, não há o que deduplicar
end $$;

create unique index if not exists profissionais_id_key on public.profissionais(id);

-- ══════════════════════════════════════════════════════════════
-- 3) CÓDIGOS PREMIUM: código já é PK (único). Garantia extra:
--    um mesmo usuário não resgata dois códigos gerando duas linhas premium.
--    (A unicidade de perfis.user_id no passo 1 já cobre isso.)
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 4) E-MAIL único: é garantido pelo próprio Supabase Auth.
--    Confira em Authentication → Providers que a opção
--    "Allow multiple accounts with the same email" está DESLIGADA.
-- ══════════════════════════════════════════════════════════════

notify pgrst, 'reload schema';
