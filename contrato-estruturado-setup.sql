-- ══════════════════════════════════════════════════════════════
-- dichava.app — Contrato terapêutico ESTRUTURADO (campos + aceite do paciente)
-- Evolui o contrato de texto único pra um formato por campos: o profissional
-- preenche o atendimento/honorários/cancelamento; o paciente preenche a
-- identificação e marca os aceites, com data/hora automática.
--
-- Compatível com o contrato antigo (texto livre) — os dois convivem.
-- Rode no SQL Editor do Supabase (uma vez). Idempotente.
-- ══════════════════════════════════════════════════════════════

-- Guarda os campos estruturados (prof, paciente, aceites). Contrato antigo fica com dados = null.
alter table public.contratos add column if not exists dados jsonb;

-- Leitura pública (paciente via link) — agora inclui 'dados'.
create or replace function public.contrato_ver(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  select json_build_object(
    'id', c.id, 'titulo', c.titulo, 'texto', c.texto, 'dados', c.dados,
    'paciente_nome', c.paciente_nome, 'status', c.status,
    'aceite_nome', c.aceite_nome, 'aceite_em', c.aceite_em, 'criado_em', c.criado_em,
    'prof_nome', coalesce(p.nome, 'Profissional'),
    'prof_reg', p.reg, 'prof_tipo', p.tipo_prof
  ) into r
  from public.contratos c
  left join public.profissionais p on p.id = c.prof_id
  where c.id = p_id;
  return r;
end $$;
grant execute on function public.contrato_ver(uuid) to anon, authenticated;

-- Aceite público — agora aceita os dados preenchidos pelo paciente (identificação + aceites).
-- p_dados = { "pac": {...}, "aceites": {...} }. Mantém compatível com a chamada antiga (2 args).
drop function if exists public.contrato_aceitar(uuid, text);
create or replace function public.contrato_aceitar(p_id uuid, p_nome text, p_dados jsonb default '{}'::jsonb)
returns json language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome obrigatorio';
  end if;
  update public.contratos
     set status = 'aceito',
         aceite_nome = p_nome,
         aceite_em = now(),
         dados = case
                   when p_dados is null or p_dados = '{}'::jsonb then dados
                   else coalesce(dados, '{}'::jsonb) || jsonb_build_object(
                          'pac',     coalesce(p_dados->'pac',     coalesce(dados->'pac',     '{}'::jsonb)),
                          'aceites', coalesce(p_dados->'aceites', coalesce(dados->'aceites', '{}'::jsonb))
                        )
                 end
   where id = p_id and status = 'pendente';
  return public.contrato_ver(p_id);
end $$;
grant execute on function public.contrato_aceitar(uuid, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
