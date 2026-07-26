-- ══════════════════════════════════════════════════════════════
-- dichava.app — Iniciar conversa via função no servidor (à prova de RLS)
-- Cria (ou recupera) a conversa paciente↔profissional definindo o user_id
-- como o PRÓPRIO usuário logado (auth.uid()). Por ser SECURITY DEFINER,
-- ignora as policies de RLS com segurança — o user_id nunca é forjável.
--
-- Rode no SQL Editor do Supabase. Pode rodar de novo por cima.
-- ══════════════════════════════════════════════════════════════

create or replace function public.iniciar_conversa(
  p_prof_id   uuid,
  p_user_nome text default '',
  p_prof_nome text default ''
)
returns public.conversas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conv public.conversas;
begin
  if v_uid is null then
    raise exception 'login_required';
  end if;

  -- já existe uma conversa entre esse usuário e esse profissional?
  select * into v_conv
    from public.conversas
    where user_id = v_uid and prof_id = p_prof_id
    limit 1;
  if found then
    return v_conv;
  end if;

  -- cria nova
  insert into public.conversas (id, user_id, prof_id, user_nome, prof_nome)
    values (gen_random_uuid(), v_uid, p_prof_id, p_user_nome, p_prof_nome)
    returning * into v_conv;

  return v_conv;
end $$;

grant execute on function public.iniciar_conversa(uuid,text,text) to authenticated;

-- ── Corrige o aviso CRITICAL do Supabase sobre a view newsletter_ativos ──
-- (a função de envio usa a tabela direto com service_role; a view não é
--  necessária e o linter reclama de "security definer view").
drop view if exists public.newsletter_ativos;
