-- ════════════════════════════════════════════════════════════
-- dichava.app · Termômetro da comunidade
-- Voto diário anônimo-agregado de humor. 1 voto por pessoa por dia.
-- Ninguém lê voto de ninguém: a leitura é só o agregado, via RPC.
-- Rode isto no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════

create table if not exists public.app_termometro (
  user_id   uuid        not null default auth.uid(),
  dia       date        not null default current_date,
  opcao     text        not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

-- RLS ligada e SEM políticas: só as funções SECURITY DEFINER abaixo acessam a tabela.
alter table public.app_termometro enable row level security;

-- Agregado de hoje (sem expor votos individuais): { total, counts:{opcao:n} }
create or replace function public.termometro_hoje()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',  coalesce((select count(*) from public.app_termometro where dia = current_date), 0),
    'counts', coalesce((
      select jsonb_object_agg(opcao, n) from (
        select opcao, count(*)::int as n
        from public.app_termometro
        where dia = current_date
        group by opcao
      ) q
    ), '{}'::jsonb)
  );
$$;

-- Registra (ou troca) o voto do dia e já devolve o agregado atualizado.
create or replace function public.termometro_votar(p_opcao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'não autenticado';
  end if;
  if p_opcao is null or length(p_opcao) = 0 or length(p_opcao) > 40 then
    raise exception 'opção inválida';
  end if;
  insert into public.app_termometro (user_id, dia, opcao)
  values (uid, current_date, p_opcao)
  on conflict (user_id, dia)
  do update set opcao = excluded.opcao, criado_em = now();
  return public.termometro_hoje();
end;
$$;

grant execute on function public.termometro_votar(text) to authenticated;
grant execute on function public.termometro_hoje()      to authenticated, anon;
