-- ══════════════════════════════════════════════════════════════
-- dichava.app — RPCs de admin: métricas, gestão de usuários e moderação
-- Todas checam se quem chama é o admin (e-mail em ADMIN). SECURITY DEFINER.
-- Rode no SQL Editor do Supabase. Seguro rodar de novo por cima.
-- ══════════════════════════════════════════════════════════════

-- quem é admin (ajuste o e-mail se precisar de mais de um)
create or replace function public.is_dichava_admin()
returns boolean language sql security definer stable set search_path = public, auth as $$
  select coalesce((select lower(email) from auth.users where id = auth.uid()), '') = 'alex.mnteir@gmail.com';
$$;
grant execute on function public.is_dichava_admin() to authenticated;

-- ── Métrica: inscritos ativos na newsletter ──
create or replace function public.admin_newsletter_count()
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dichava_admin() then raise exception 'forbidden'; end if;
  return (select count(*)::int from public.newsletter where ativo = true and consent = true);
end $$;
grant execute on function public.admin_newsletter_count() to authenticated;

-- ── Gestão: buscar usuário por e-mail (parcial) ──
create or replace function public.admin_buscar_usuario(p_email text)
returns table(id uuid, email text, tipo text, criado timestamptz, confirmado boolean)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_dichava_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_email),'') = '' then return; end if;
  return query
    select u.id, u.email::text,
           coalesce(u.raw_user_meta_data->>'tipo','user') as tipo,
           u.created_at,
           (u.email_confirmed_at is not null) as confirmado
    from auth.users u
    where u.email ilike '%'||p_email||'%'
    order by u.created_at desc
    limit 20;
end $$;
grant execute on function public.admin_buscar_usuario(text) to authenticated;

-- ── Gestão: deletar usuário + dados relacionados ──
create or replace function public.admin_deletar_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_dichava_admin() then raise exception 'forbidden'; end if;
  if p_id is null then raise exception 'id obrigatorio'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_deletar_a_si_mesmo'; end if;
  begin delete from public.mensagens where conversa_id in (select id from public.conversas where user_id=p_id or prof_id=p_id); exception when others then null; end;
  begin delete from public.conversas where user_id=p_id or prof_id=p_id; exception when others then null; end;
  begin delete from public.registros where user_id=p_id; exception when others then null; end;
  begin delete from public.solicitacoes where user_id=p_id; exception when others then null; end;
  begin delete from public.avaliacoes_prof where user_id=p_id; exception when others then null; end;
  begin delete from public.contratos where prof_id=p_id; exception when others then null; end;
  begin delete from public.push_subs where user_id=p_id; exception when others then null; end;
  begin delete from public.perfis where user_id=p_id; exception when others then null; end;
  begin delete from public.profissionais where id=p_id; exception when others then null; end;
  begin delete from public.clinica_membros where user_id=p_id; exception when others then null; end;
  begin delete from public.cadastro_lembrete where user_id=p_id; exception when others then null; end;
  begin delete from public.pagamentos where user_id=p_id; exception when others then null; end;
  delete from auth.users where id = p_id;
end $$;
grant execute on function public.admin_deletar_usuario(uuid) to authenticated;

-- ── Moderação: listar avaliações ──
create or replace function public.admin_avaliacoes()
returns setof public.avaliacoes_prof
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dichava_admin() then raise exception 'forbidden'; end if;
  return query select * from public.avaliacoes_prof order by criado_em desc nulls last limit 200;
end $$;
grant execute on function public.admin_avaliacoes() to authenticated;

-- ── Moderação: remover avaliação ──
create or replace function public.admin_avaliacao_remover(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dichava_admin() then raise exception 'forbidden'; end if;
  delete from public.avaliacoes_prof where id = p_id;
end $$;
grant execute on function public.admin_avaliacao_remover(uuid) to authenticated;
