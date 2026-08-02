-- ══════════════════════════════════════════════════════════════
-- dichava.app — Bloqueia AUTO-ESCALAÇÃO de privilégio em profissionais
--
-- Problema: a policy "dono edita" (FOR ALL, auth.uid()=id) deixa o
-- profissional gravar QUALQUER coluna na própria linha. Pelo console do
-- navegador ele poderia se auto-liberar:
--   update profissionais set ativo=true, status='aprovado',
--     acesso_ate='2099-12-31', destaque=true, em_teste=false where id=<self>
-- → acesso pago grátis, sem curadoria, em destaque no diretório.
--
-- Correção: um trigger que, para quem NÃO é admin, congela as colunas de
-- controle (ativo, acesso_ate, liberado_em, destaque, em_teste, obs_admin,
-- plano) e só permite status 'pendente'/'reaprovar'. O admin (via
-- admin_prof_acao / eh_admin) continua podendo tudo.
--
-- Não quebra o app: o profissional segue editando bio, nome, telefone,
-- foto, agenda, oculto_diretorio e enviando comprovante normalmente.
--
-- Rode no SQL Editor do Supabase (uma vez). Seguro rodar de novo.
-- ══════════════════════════════════════════════════════════════

create or replace function public.protege_profissional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- admin pode tudo (inclui as RPCs admin_prof_acao, que rodam com o JWT do admin)
  if public.eh_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- cadastro novo entra sempre "cru": sem acesso, sem destaque, em análise
    new.ativo       := false;
    new.acesso_ate  := null;
    new.liberado_em := null;
    new.destaque    := false;
    new.em_teste    := false;
    new.obs_admin   := null;
    if coalesce(new.status,'') <> 'pendente' then
      new.status := 'pendente';
    end if;

  elsif tg_op = 'UPDATE' then
    -- dono não pode mexer nas colunas de controle: mantém o valor antigo
    new.ativo       := old.ativo;
    new.acesso_ate  := old.acesso_ate;
    new.liberado_em := old.liberado_em;
    new.destaque    := old.destaque;
    new.em_teste    := old.em_teste;
    new.obs_admin   := old.obs_admin;
    new.plano       := old.plano;
    -- dono só pode reenviar o perfil pra análise, nunca se auto-aprovar
    if coalesce(new.status,'') not in ('pendente','reaprovar') then
      new.status := old.status;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_protege_profissional on public.profissionais;
create trigger trg_protege_profissional
  before insert or update on public.profissionais
  for each row execute function public.protege_profissional();

-- ── Conferência (opcional): como um profissional comum, a auto-liberação
--    deve ser IGNORADA (as colunas voltam ao valor de controle).
--    Rode logado como o profissional (não como postgres) pra testar de verdade.
