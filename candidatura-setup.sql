-- ══════════════════════════════════════════════════════════════
-- dichava.app — Entrada na rede por CANDIDATURA + ENTREVISTA
-- Substitui o "crie sua conta e teste 7 dias grátis" por um processo seletivo:
--   1) candidatura (formação + percurso) em /landing/profissionais.html
--   2) análise inicial → aprovado(a) para a entrevista
--   3) entrevista → aprovado(a) na rede → convite pra criar a conta e assinar
--
-- Reaproveita a tabela pro_waitlist (as candidaturas aparecem na mesma aba
-- do painel admin). Etapas (status):
--   'pendente'   candidatura recebida, em análise
--   'entrevista' aprovado(a) na análise inicial → agendar/realizar entrevista
--   'aprovado'   aprovado(a) na entrevista → convite pra criar conta
--   'liberado'   já criou conta / entrou na rede
--   'recusado'   não seguiu
--   'contato'    (legado da lista de espera antiga)
--
-- Também expõe os próximos encontros da rede (intervisão, rodas de conversa)
-- pra landing pública, SEM os links de acesso (esses são só pra quem é da rede).
--
-- Rode DEPOIS de admin-waitlist-setup.sql e waitlist-lembrete-setup.sql
-- (e de rede-eventos-setup.sql pra parte dos eventos). Idempotente.
-- ══════════════════════════════════════════════════════════════

-- 1) Campos da candidatura
alter table public.pro_waitlist add column if not exists formacao       text;  -- graduação, pós, formações
alter table public.pro_waitlist add column if not exists percurso       text;  -- trajetória profissional
alter table public.pro_waitlist add column if not exists experiencia_rd text;  -- relação com redução de danos
alter table public.pro_waitlist add column if not exists motivacao      text;  -- por que quer entrar na rede
alter table public.pro_waitlist add column if not exists links          text;  -- Lattes, LinkedIn, Instagram, site
alter table public.pro_waitlist add column if not exists disponibilidade text; -- melhores dias/horários p/ entrevista
alter table public.pro_waitlist add column if not exists entrevista_em  timestamptz; -- data marcada da entrevista

-- 2) Envio público da candidatura (anon) — mesmas proteções do pro_waitlist_add
create or replace function public.pro_candidatura_add(
  p_nome            text,
  p_registro        text,
  p_especialidade   text,
  p_cidade          text default null,
  p_atendimento     text default null,
  p_email           text default null,
  p_whatsapp        text default null,
  p_formacao        text default null,
  p_percurso        text default null,
  p_experiencia_rd  text default null,
  p_motivacao       text default null,
  p_links           text default null,
  p_disponibilidade text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(trim(lower(p_email)), '');
  v_wpp   text := nullif(regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g'), '');
  v_burst int;
begin
  if coalesce(trim(p_nome),'') = '' then raise exception 'nome obrigatorio'; end if;
  if v_email is null and v_wpp is null then raise exception 'contato obrigatorio'; end if;
  if coalesce(trim(p_formacao),'') = '' or coalesce(trim(p_percurso),'') = '' then
    raise exception 'formacao e percurso obrigatorios';
  end if;

  if length(p_nome) > 120 or length(coalesce(p_registro,'')) > 60
     or length(coalesce(p_especialidade,'')) > 120 or length(coalesce(p_cidade,'')) > 120
     or length(coalesce(p_atendimento,'')) > 60 or length(coalesce(p_email,'')) > 160
     or length(coalesce(p_whatsapp,'')) > 40
     or length(coalesce(p_formacao,'')) > 3000 or length(coalesce(p_percurso,'')) > 3000
     or length(coalesce(p_experiencia_rd,'')) > 3000 or length(coalesce(p_motivacao,'')) > 3000
     or length(coalesce(p_links,'')) > 600 or length(coalesce(p_disponibilidade,'')) > 300 then
    raise exception 'dados muito longos';
  end if;

  select count(*) into v_burst from public.pro_waitlist where criado_em > now() - interval '1 minute';
  if v_burst >= 20 then raise exception 'muitas tentativas, tente em instantes'; end if;

  -- mesma pessoa reenviando em 10 min → não duplica (responde como sucesso)
  if exists (
    select 1 from public.pro_waitlist
    where criado_em > now() - interval '10 minutes'
      and ((v_email is not null and lower(trim(email)) = v_email)
        or (v_wpp is not null and regexp_replace(coalesce(whatsapp,''), '\D', '', 'g') = v_wpp))
  ) then
    return;
  end if;

  insert into public.pro_waitlist
    (nome, registro, especialidade, cidade, atendimento, email, whatsapp, plano, mensagem,
     formacao, percurso, experiencia_rd, motivacao, links, disponibilidade, status)
  values
    (p_nome, p_registro, p_especialidade, p_cidade, p_atendimento, p_email, p_whatsapp, 'candidatura', null,
     p_formacao, p_percurso, p_experiencia_rd, p_motivacao, p_links, p_disponibilidade, 'pendente');
end $$;

grant execute on function public.pro_candidatura_add(text,text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- 3) Leitura no admin agora devolve os campos da candidatura
create or replace function public.admin_waitlist()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare r json;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select coalesce(json_agg(x order by x.criado_em desc), '[]'::json) into r from (
    select id, nome, registro, especialidade, cidade, atendimento,
           email, whatsapp, plano, mensagem,
           coalesce(status,'pendente') as status, obs_admin, criado_em, lembrete_em,
           formacao, percurso, experiencia_rd, motivacao, links, disponibilidade, entrevista_em
    from public.pro_waitlist
  ) x;
  return r;
end $$;
revoke all on function public.admin_waitlist() from public, anon;
grant execute on function public.admin_waitlist() to authenticated;

-- 4) Status aceita as novas etapas
create or replace function public.admin_waitlist_status(p_id uuid, p_status text, p_obs text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  if p_status not in ('pendente','entrevista','aprovado','contato','liberado','recusado') then
    raise exception 'status invalido';
  end if;
  update public.pro_waitlist
     set status = p_status,
         obs_admin = coalesce(p_obs, obs_admin)
   where id = p_id;
end $$;
revoke all on function public.admin_waitlist_status(uuid, text, text) from public, anon;
grant execute on function public.admin_waitlist_status(uuid, text, text) to authenticated;

-- 5) Marca (ou limpa, com null) a data da entrevista
create or replace function public.admin_waitlist_entrevista(p_id uuid, p_quando timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  update public.pro_waitlist
     set entrevista_em = p_quando,
         status = case when p_quando is not null and coalesce(status,'pendente') in ('pendente','contato') then 'entrevista' else status end
   where id = p_id;
end $$;
revoke all on function public.admin_waitlist_entrevista(uuid, timestamptz) from public, anon;
grant execute on function public.admin_waitlist_entrevista(uuid, timestamptz) to authenticated;

-- 6) Próximos encontros da rede pra landing pública (sem link de acesso)
create or replace function public.rede_eventos_pub()
returns table (area text, titulo text, sub text, data date, hora text, tag text)
language sql
stable
security definer
set search_path = public
as $$
  select area, titulo, sub, data, hora, tag
  from public.rede_eventos
  where ativo = true and area in ('interv','rodas','eventos')
    and (data is null or data >= current_date)
  order by data nulls last, ordem
  limit 6;
$$;
grant execute on function public.rede_eventos_pub() to anon, authenticated;

notify pgrst, 'reload schema';
