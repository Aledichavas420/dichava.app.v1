-- ══════════════════════════════════════════════════════════════
-- dichava.app — Contrato terapêutico com aceite do paciente
-- O profissional cria o contrato no painel e envia um link. O paciente abre,
-- lê, informa o nome e marca "li e aceito" — o aceite fica registrado com
-- data/hora, gerando um documento validado e imprimível pros dois.
--
-- Rode no SQL Editor do Supabase (uma vez).
-- ══════════════════════════════════════════════════════════════

create table if not exists public.contratos (
  id            uuid primary key default gen_random_uuid(),
  prof_id       uuid not null references auth.users(id) on delete cascade,
  titulo        text not null,
  texto         text not null,
  paciente_nome text,
  status        text not null default 'pendente',   -- 'pendente' | 'aceito'
  aceite_nome   text,
  aceite_em     timestamptz,
  criado_em     timestamptz not null default now()
);

alter table public.contratos enable row level security;

-- O profissional gerencia (cria, lê, edita, apaga) apenas os SEUS contratos
drop policy if exists "contratos_own_all" on public.contratos;
create policy "contratos_own_all" on public.contratos
  for all using (auth.uid() = prof_id) with check (auth.uid() = prof_id);

-- ── Leitura pública do contrato (paciente, via link) ──
create or replace function public.contrato_ver(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  select json_build_object(
    'id', c.id, 'titulo', c.titulo, 'texto', c.texto,
    'paciente_nome', c.paciente_nome, 'status', c.status,
    'aceite_nome', c.aceite_nome, 'aceite_em', c.aceite_em, 'criado_em', c.criado_em,
    'prof_nome', coalesce(p.nome, 'Profissional'),
    'prof_reg', p.reg, 'prof_tipo', p.tipo_prof
  ) into r
  from public.contratos c
  left join public.profissionais p on p.id = c.prof_id
  where c.id = p_id;
  return r;  -- null se não existir
end $$;
grant execute on function public.contrato_ver(uuid) to anon, authenticated;

-- ── Aceite público do contrato ──
create or replace function public.contrato_aceitar(p_id uuid, p_nome text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'nome obrigatorio';
  end if;
  -- só aceita se ainda estiver pendente (não sobrescreve um aceite anterior)
  update public.contratos
     set status = 'aceito', aceite_nome = p_nome, aceite_em = now()
   where id = p_id and status = 'pendente';
  return public.contrato_ver(p_id);
end $$;
grant execute on function public.contrato_aceitar(uuid, text) to anon, authenticated;
