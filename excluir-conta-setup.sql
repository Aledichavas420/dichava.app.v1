-- dichava.app — Exclusão de conta pelo PRÓPRIO usuário (LGPD, direito de eliminação)
-- Rode uma vez no Supabase → SQL Editor. Idempotente.
--
-- Segurança: a função NÃO recebe id. Ela sempre usa auth.uid(), então um usuário
-- só consegue apagar a PRÓPRIA conta. Impossível apagar a conta de outra pessoa.

-- Registro do motivo (fica mesmo depois da conta sumir, pra feedback/auditoria).
create table if not exists public.conta_exclusoes (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid,
  email     text,
  motivo    text,
  criado_em timestamptz not null default now()
);
alter table public.conta_exclusoes enable row level security;
-- Sem policies de leitura: ninguém lê pelo cliente. A função (security definer)
-- insere ignorando RLS. Você consulta pelo painel do Supabase quando quiser.

create or replace function public.excluir_minha_conta(p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare uid uuid := auth.uid();
declare em  text;
begin
  if uid is null then raise exception 'nao_autenticado'; end if;

  select email into em from auth.users where id = uid;
  insert into public.conta_exclusoes(user_id, email, motivo)
    values (uid, em, nullif(btrim(coalesce(p_motivo,'')), ''));

  -- Clínicas das quais a pessoa é DONA: apaga o registro inteiro, incluindo o
  -- blob de dados (pacientes, prontuários, financeiro, documentos). Os membros
  -- caem por cascade (clinica_membros referencia clinicas on delete cascade).
  begin delete from public.clinicas          where dono_id = uid; exception when others then null; end;

  -- Dados ligados ao usuário (mesma lista do admin_deletar_usuario + extras).
  begin delete from public.clinica_membros   where user_id = uid; exception when others then null; end;
  begin delete from public.mensagens         where conversa_id in (select id from public.conversas where user_id=uid or prof_id=uid); exception when others then null; end;
  begin delete from public.conversas         where user_id=uid or prof_id=uid; exception when others then null; end;
  begin delete from public.suporte_mensagens where prof_id=uid; exception when others then null; end;
  begin delete from public.registros         where user_id=uid; exception when others then null; end;
  begin delete from public.solicitacoes      where user_id=uid; exception when others then null; end;
  begin delete from public.avaliacoes_prof   where user_id=uid or prof_id=uid; exception when others then null; end;
  begin delete from public.contratos         where prof_id=uid; exception when others then null; end;
  begin delete from public.codigos_premium   where prof_id=uid; exception when others then null; end;
  begin delete from public.push_subs         where user_id=uid; exception when others then null; end;
  begin delete from public.perfis            where user_id=uid; exception when others then null; end;
  begin delete from public.profissionais     where id=uid; exception when others then null; end;
  begin delete from public.cadastro_lembrete where user_id=uid; exception when others then null; end;
  begin delete from public.pagamentos        where user_id=uid; exception when others then null; end;

  -- Por fim, a conta de autenticação.
  delete from auth.users where id = uid;
end $$;

revoke all on function public.excluir_minha_conta(text) from public, anon;
grant execute on function public.excluir_minha_conta(text) to authenticated;

notify pgrst, 'reload schema';
