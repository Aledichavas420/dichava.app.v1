-- dichava.app — Recursos por plano (destaque, códigos premium, limite de equipe, suporte prioritário)
-- Rode DEPOIS de admin-setup.sql, admin-planos-setup.sql e suporte-setup.sql. Idempotente.

-- ═══════════════════════════════════════════════════════════════
-- Capacidades de cada plano (fonte da verdade no banco)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.plano_caps(p text)
returns table(destaque boolean, codigos int, equipe_max int)
language sql immutable as $$
  select case coalesce(p,'essencial')
    when 'profissional' then true
    when 'clinica'      then true
    else false end as destaque,
  case coalesce(p,'essencial')
    when 'profissional' then 10
    when 'clinica'      then 25
    else 0 end as codigos,
  case coalesce(p,'essencial')
    when 'clinica' then 5
    else 1 end as equipe_max;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 1) DESTAQUE NO DIRETÓRIO
-- Coluna booleana pública (paciente vê o selo, não vê o nome do plano).
-- É setada automaticamente ao liberar o acesso, conforme o plano.
-- ═══════════════════════════════════════════════════════════════
alter table public.profissionais add column if not exists destaque boolean not null default false;

-- ao liberar, recalcula destaque pelo plano
create or replace function public.admin_prof_acao(p_id uuid, p_acao text, p_meses int default null, p_obs text default null, p_plano text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_plano text;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  if p_acao = 'aprovar' then update public.profissionais set status='aprovado' where id=p_id;
  elsif p_acao = 'rejeitar' then update public.profissionais set status='rejeitado', ativo=false, destaque=false where id=p_id;
  elsif p_acao = 'liberar' then
    v_plano := coalesce(p_plano, (select plano from public.profissionais where id=p_id));
    update public.profissionais set ativo=true, status='aprovado', liberado_em=now(),
      acesso_ate = case when coalesce(p_meses,0) > 0 then now() + (p_meses || ' months')::interval else null end,
      obs_admin = coalesce(p_obs, obs_admin), plano = coalesce(p_plano, plano),
      destaque = (select destaque from public.plano_caps(v_plano))
      where id=p_id;
  elsif p_acao = 'bloquear' then update public.profissionais set ativo=false where id=p_id;
  else raise exception 'ação inválida'; end if;
  if p_obs is not null then update public.profissionais set obs_admin=p_obs where id=p_id; end if;
end $$;
revoke all on function public.admin_prof_acao(uuid,text,int,text,text) from public, anon;
grant execute on function public.admin_prof_acao(uuid,text,int,text,text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2) CÓDIGOS PREMIUM (presentear pacientes)
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.codigos_premium (
  codigo    text primary key,
  prof_id   uuid not null,
  plano     text,
  dias      int  not null default 365,   -- validade concedida ao paciente
  criado_em timestamptz not null default now(),
  usado_por uuid,
  usado_em  timestamptz
);
create index if not exists cod_prem_prof_idx on public.codigos_premium(prof_id);
alter table public.codigos_premium enable row level security;

-- profissional vê os próprios códigos; admin vê todos
drop policy if exists cod_read on public.codigos_premium;
create policy cod_read on public.codigos_premium for select using (auth.uid() = prof_id or public.eh_admin());

-- gera os códigos que faltam pro profissional atingir a cota do plano dele
create or replace function public.gerar_codigos_premium()
returns json language plpgsql security definer set search_path = public as $$
declare v_plano text; v_cota int; v_tem int; v_falta int; i int; v_cod text; v_out json;
begin
  select plano into v_plano from public.profissionais where id = auth.uid();
  select codigos into v_cota from public.plano_caps(v_plano);
  if coalesce(v_cota,0) = 0 then raise exception 'Seu plano não inclui códigos premium.'; end if;
  select count(*) into v_tem from public.codigos_premium where prof_id = auth.uid();
  v_falta := v_cota - v_tem;
  i := 0;
  while i < v_falta loop
    v_cod := 'DICHA-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    begin
      insert into public.codigos_premium(codigo, prof_id, plano) values (v_cod, auth.uid(), v_plano);
      i := i + 1;
    exception when unique_violation then null; -- tenta outro código
    end;
  end loop;
  select coalesce(json_agg(json_build_object('codigo',codigo,'usado_por',usado_por,'usado_em',usado_em) order by criado_em), '[]'::json)
    into v_out from public.codigos_premium where prof_id = auth.uid();
  return json_build_object('cota', v_cota, 'codigos', v_out);
end $$;
revoke all on function public.gerar_codigos_premium() from public, anon;
grant execute on function public.gerar_codigos_premium() to authenticated;

-- paciente resgata um código → vira premium por N dias
create or replace function public.resgatar_codigo_premium(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare v_cod record; v_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'Faça login pra resgatar.'; end if;
  select * into v_cod from public.codigos_premium where codigo = upper(trim(p_codigo));
  if v_cod.codigo is null then raise exception 'Código não encontrado.'; end if;
  if v_cod.usado_por is not null then raise exception 'Este código já foi usado.'; end if;
  v_exp := now() + (v_cod.dias || ' days')::interval;
  update public.codigos_premium set usado_por = auth.uid(), usado_em = now() where codigo = v_cod.codigo;
  -- concede premium no perfil do usuário
  insert into public.perfis (user_id, plano, plano_expira, plano_tipo)
    values (auth.uid(), 'premium', v_exp, 'cortesia')
  on conflict (user_id) do update set plano='premium',
    plano_expira = greatest(coalesce(perfis.plano_expira, now()), v_exp),
    plano_tipo = 'cortesia';
  return json_build_object('ok', true, 'expira', v_exp);
end $$;
revoke all on function public.resgatar_codigo_premium(text) from public, anon;
grant execute on function public.resgatar_codigo_premium(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3) LIMITE DE EQUIPE (via trigger — não depende do entrar_clinica)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.check_equipe_limite()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dono uuid; v_plano text; v_max int; v_atual int;
begin
  select dono_id into v_dono from public.clinicas where id = NEW.clinica_id;
  select plano into v_plano from public.profissionais where id = v_dono;
  select equipe_max into v_max from public.plano_caps(v_plano);
  select count(*) into v_atual from public.clinica_membros where clinica_id = NEW.clinica_id;
  if v_atual >= coalesce(v_max,1) then
    raise exception 'Limite de profissionais do plano atingido (máx %). O plano Clínica permite equipe.', coalesce(v_max,1);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_equipe_limite on public.clinica_membros;
create trigger trg_equipe_limite before insert on public.clinica_membros
  for each row execute function public.check_equipe_limite();

-- ═══════════════════════════════════════════════════════════════
-- 4) SUPORTE PRIORITÁRIO (Profissional/Clínica no topo)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.admin_suporte_conversas()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select coalesce(json_agg(x order by x.prioridade desc, x.ultima desc), '[]'::json) into r from (
    select m.prof_id,
           (select nome  from public.profissionais p where p.id=m.prof_id) as nome,
           (select plano from public.profissionais p where p.id=m.prof_id) as plano,
           case (select plano from public.profissionais p where p.id=m.prof_id)
             when 'clinica' then 2 when 'profissional' then 1 else 0 end as prioridade,
           max(m.criado_em) as ultima,
           (array_agg(m.texto order by m.criado_em desc))[1] as ultima_msg,
           count(*) filter (where m.remetente='prof' and not m.lida_admin) as nao_lidas
    from public.suporte_mensagens m group by m.prof_id) x;
  return r;
end $$;
revoke all on function public.admin_suporte_conversas() from public, anon;
grant execute on function public.admin_suporte_conversas() to authenticated;

notify pgrst, 'reload schema';
