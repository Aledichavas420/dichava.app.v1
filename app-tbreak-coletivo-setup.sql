-- ════════════════════════════════════════════════════════════
-- dichava.app · Pausa coletiva (Pausa de Tolerância)
-- Conta quem está com uma pausa de tolerância ATIVA agora, pra mostrar
-- a quem está começando "você não está sozinho".
-- Ativa = dentro da janela da trilha (inicio..inicio+trilha) E com
-- atividade nos últimos 3 dias (auto-limpa quem abandonou).
-- Rode isto no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════

create table if not exists public.app_tbreak_ativos (
  user_id       uuid        primary key default auth.uid(),
  inicio        date        not null,
  trilha        int         not null,
  atualizado_em timestamptz not null default now()
);

-- RLS ligada e SEM políticas: só as funções SECURITY DEFINER abaixo acessam.
alter table public.app_tbreak_ativos enable row level security;

-- Quantas pessoas estão com uma pausa ativa agora.
create or replace function public.tbreak_ativos()
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.app_tbreak_ativos
  where current_date < inicio + trilha
    and atualizado_em > now() - interval '3 days';
$$;

-- Marca/atualiza a pausa ativa da pessoa e devolve a contagem atual.
create or replace function public.tbreak_ping(p_inicio date, p_trilha int)
returns int
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
  if p_trilha is null or p_trilha not in (7, 14, 31) then
    raise exception 'trilha inválida';
  end if;
  insert into public.app_tbreak_ativos (user_id, inicio, trilha, atualizado_em)
  values (uid, p_inicio, p_trilha, now())
  on conflict (user_id)
  do update set inicio = excluded.inicio, trilha = excluded.trilha, atualizado_em = now();
  return public.tbreak_ativos();
end;
$$;

-- Remove a pessoa da contagem (ao recomeçar ou concluir a pausa).
create or replace function public.tbreak_fim()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.app_tbreak_ativos where user_id = auth.uid();
$$;

grant execute on function public.tbreak_ativos()            to authenticated, anon;
grant execute on function public.tbreak_ping(date, int)     to authenticated;
grant execute on function public.tbreak_fim()               to authenticated;
