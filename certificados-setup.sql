-- ════════════════════════════════════════════════════════════
-- dichava.app · Certificados de participação (rodas de conversa)
-- Eventos + presenças (registro) + emissão + validação pública.
-- Rode isto no SQL Editor do Supabase.
-- Requer a função public.eh_admin() (já usada no painel admin).
-- ════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Eventos certificáveis (rodas de conversa) ──
create table if not exists public.cert_eventos (
  id             uuid        primary key default gen_random_uuid(),
  titulo         text        not null,
  data_evento    date        not null,
  carga_horaria  text,                 -- ex: "1 hora", "1h30"
  modalidade     text        default 'Online',
  local_emissao  text        default 'Vitória/ES',
  modelo         text        default 'b',   -- 'a' clássico | 'b' moderno
  ativo          boolean     default true,  -- aceita novas presenças?
  criado_em      timestamptz not null default now()
);

-- ── Presenças / solicitações de certificado ──
create table if not exists public.cert_presencas (
  id          uuid        primary key default gen_random_uuid(),
  evento_id   uuid        not null references public.cert_eventos(id) on delete cascade,
  nome        text        not null,
  email       text        not null,
  profissao   text,
  cidade      text,
  codigo      text        unique,      -- código do certificado (null até emitir)
  emitido_em  timestamptz,
  enviado_em  timestamptz,
  criado_em   timestamptz not null default now(),
  unique (evento_id, email)
);

create index if not exists cert_presencas_evento on public.cert_presencas (evento_id);

alter table public.cert_eventos   enable row level security;
alter table public.cert_presencas enable row level security;

-- ── Admin: acesso total via eh_admin() (painel autenticado) ──
drop policy if exists cert_eventos_admin on public.cert_eventos;
create policy cert_eventos_admin on public.cert_eventos
  for all using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists cert_presencas_admin on public.cert_presencas;
create policy cert_presencas_admin on public.cert_presencas
  for all using (public.eh_admin()) with check (public.eh_admin());

-- ════════════════════════════════════════════════════════════
-- RPCs públicas (SECURITY DEFINER) — a página pública não lê as tabelas direto.
-- ════════════════════════════════════════════════════════════

-- Dados do evento pra montar o formulário de presença.
create or replace function public.cert_evento_info(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when e.id is null then null else jsonb_build_object(
    'titulo', e.titulo,
    'data_evento', e.data_evento,
    'ativo', e.ativo
  ) end
  from (select 1) x
  left join public.cert_eventos e on e.id = p_id;
$$;

-- Participante registra presença (idempotente por evento+email).
create or replace function public.cert_presenca_add(
  p_evento uuid, p_nome text, p_email text, p_profissao text default null, p_cidade text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select ativo into ok from public.cert_eventos where id = p_evento;
  if ok is null then return jsonb_build_object('erro','evento não encontrado'); end if;
  if ok = false then return jsonb_build_object('erro','inscrições encerradas'); end if;
  if coalesce(trim(p_nome),'')='' or coalesce(trim(p_email),'') !~ '.+@.+\..+' then
    return jsonb_build_object('erro','preencha nome e e-mail válidos');
  end if;
  insert into public.cert_presencas (evento_id, nome, email, profissao, cidade)
  values (p_evento, trim(p_nome), lower(trim(p_email)), nullif(trim(p_profissao),''), nullif(trim(p_cidade),''))
  on conflict (evento_id, email)
  do update set nome = excluded.nome, profissao = excluded.profissao, cidade = excluded.cidade;
  return jsonb_build_object('ok', true);
end;
$$;

-- Valida um certificado pelo código (página pública de validação).
create or replace function public.cert_validar(p_codigo text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'valido', true,
    'nome', p.nome,
    'profissao', p.profissao,
    'cidade', p.cidade,
    'codigo', p.codigo,
    'emitido_em', p.emitido_em,
    'evento', e.titulo,
    'data_evento', e.data_evento,
    'carga_horaria', e.carga_horaria,
    'modalidade', e.modalidade,
    'local_emissao', e.local_emissao,
    'modelo', e.modelo
  )
  from public.cert_presencas p
  join public.cert_eventos  e on e.id = p.evento_id
  where p.codigo = upper(trim(p_codigo)) and p.emitido_em is not null;
$$;

-- Admin emite o certificado de uma presença: gera código único e marca emitido.
create or replace function public.cert_emitir(p_presenca uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cod text; p record; e record; tries int := 0;
begin
  if not public.eh_admin() then raise exception 'sem permissão'; end if;
  select * into p from public.cert_presencas where id = p_presenca;
  if p.id is null then return jsonb_build_object('erro','presença não encontrada'); end if;
  if p.codigo is not null then
    cod := p.codigo;
  else
    loop
      cod := 'DICH-'||to_char(now(),'YYYY')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
      tries := tries + 1;
      exit when not exists (select 1 from public.cert_presencas where codigo = cod);
      if tries > 8 then raise exception 'não gerei código único'; end if;
    end loop;
    update public.cert_presencas
       set codigo = cod, emitido_em = coalesce(emitido_em, now())
     where id = p_presenca;
  end if;
  select * into e from public.cert_eventos where id = p.evento_id;
  return jsonb_build_object('ok',true,'codigo',cod,'nome',p.nome,'email',p.email,
    'evento',e.titulo,'data_evento',e.data_evento);
end;
$$;

grant execute on function public.cert_evento_info(uuid)                         to anon, authenticated;
grant execute on function public.cert_presenca_add(uuid,text,text,text,text)    to anon, authenticated;
grant execute on function public.cert_validar(text)                             to anon, authenticated;
grant execute on function public.cert_emitir(uuid)                              to authenticated;
