-- ══════════════════════════════════════════════════════════════
-- dichava.app — Gravação confiável da lista de espera
-- Insere via função SECURITY DEFINER (ignora o RLS com segurança), evitando
-- o problema de o insert direto ser desfeito quando o RLS bloqueia a leitura
-- da linha de volta. Chamada pública (anon) — só insere, não lê nada.
--
-- Inclui proteção anti-spam (rate limit) já que é um endpoint público:
--   • limite de tamanho por campo (evita payloads gigantes);
--   • deduplicação (mesmo e-mail/WhatsApp nos últimos 10 min → ignora, sem erro);
--   • teto de rajada (máx. 20 cadastros/minuto no total → bloqueia flood).
--
-- Rode no SQL Editor do Supabase (pode rodar de novo por cima — usa CREATE OR REPLACE).
-- Requer a coluna criado_em (vem do admin-waitlist-setup.sql).
-- ══════════════════════════════════════════════════════════════

create or replace function public.pro_waitlist_add(
  p_nome         text,
  p_registro     text,
  p_especialidade text,
  p_cidade       text default null,
  p_atendimento  text default null,
  p_email        text default null,
  p_whatsapp     text default null,
  p_plano        text default null,
  p_mensagem     text default null
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
  -- validação mínima (evita lixo)
  if coalesce(trim(p_nome),'') = '' then
    raise exception 'nome obrigatorio';
  end if;

  -- limite de tamanho por campo (corta payloads absurdos)
  if length(p_nome) > 120 or length(coalesce(p_registro,'')) > 60
     or length(coalesce(p_especialidade,'')) > 120 or length(coalesce(p_cidade,'')) > 120
     or length(coalesce(p_atendimento,'')) > 60 or length(coalesce(p_email,'')) > 160
     or length(coalesce(p_whatsapp,'')) > 40 or length(coalesce(p_plano,'')) > 60
     or length(coalesce(p_mensagem,'')) > 2000 then
    raise exception 'dados muito longos';
  end if;

  -- teto de rajada: no máximo 20 cadastros no último minuto (anti-flood)
  select count(*) into v_burst
  from public.pro_waitlist
  where criado_em > now() - interval '1 minute';
  if v_burst >= 20 then
    raise exception 'muitas tentativas, tente em instantes';
  end if;

  -- deduplicação: se o mesmo e-mail ou WhatsApp já entrou nos últimos 10 min,
  -- não cria duplicata (retorna como sucesso — experiência tranquila pro usuário).
  if (v_email is not null or v_wpp is not null) and exists (
    select 1 from public.pro_waitlist
    where criado_em > now() - interval '10 minutes'
      and (
        (v_email is not null and lower(trim(email)) = v_email)
        or (v_wpp is not null and regexp_replace(coalesce(whatsapp,''), '\D', '', 'g') = v_wpp)
      )
  ) then
    return;
  end if;

  insert into public.pro_waitlist
    (nome, registro, especialidade, cidade, atendimento, email, whatsapp, plano, mensagem)
  values
    (p_nome, p_registro, p_especialidade, p_cidade, p_atendimento, p_email, p_whatsapp, p_plano, p_mensagem);
end $$;

-- Qualquer visitante (não logado) pode enviar o cadastro
grant execute on function public.pro_waitlist_add(text,text,text,text,text,text,text,text,text) to anon, authenticated;
