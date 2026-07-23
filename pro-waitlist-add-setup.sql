-- ══════════════════════════════════════════════════════════════
-- dichava.app — Gravação confiável da lista de espera
-- Insere via função SECURITY DEFINER (ignora o RLS com segurança), evitando
-- o problema de o insert direto ser desfeito quando o RLS bloqueia a leitura
-- da linha de volta. Chamada pública (anon) — só insere, não lê nada.
--
-- Rode no SQL Editor do Supabase (uma vez).
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
begin
  -- validação mínima (evita lixo)
  if coalesce(trim(p_nome),'') = '' then
    raise exception 'nome obrigatorio';
  end if;

  insert into public.pro_waitlist
    (nome, registro, especialidade, cidade, atendimento, email, whatsapp, plano, mensagem)
  values
    (p_nome, p_registro, p_especialidade, p_cidade, p_atendimento, p_email, p_whatsapp, p_plano, p_mensagem);
end $$;

-- Qualquer visitante (não logado) pode enviar o cadastro
grant execute on function public.pro_waitlist_add(text,text,text,text,text,text,text,text,text) to anon, authenticated;
