-- ════════════════════════════════════════════════════════════
-- dichava.app · Passa adiante
-- Corrente de cuidado anônima. A pessoa escolhe uma FRASE PRONTA (índice),
-- que chega anônima pra outra pessoa. Nada de texto livre: guarda só o
-- índice da frase. Rode isto no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════

create table if not exists public.app_passa (
  id        bigserial   primary key,
  user_id   uuid        default auth.uid(),
  frase     int         not null,
  criado_em timestamptz not null default now()
);

create index if not exists app_passa_recentes on public.app_passa (criado_em);

-- RLS ligada e SEM políticas: só as funções SECURITY DEFINER abaixo acessam.
alter table public.app_passa enable row level security;

-- Deixa uma frase pra próxima pessoa (com limite diário simples anti-abuso).
create or replace function public.passa_enviar(p_frase int)
returns void
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
  if p_frase is null or p_frase < 0 or p_frase > 99 then
    raise exception 'frase inválida';
  end if;
  if (select count(*) from public.app_passa
      where user_id = uid and criado_em > now() - interval '1 day') >= 10 then
    return; -- limite diário atingido: ignora em silêncio
  end if;
  insert into public.app_passa (user_id, frase) values (uid, p_frase);
end;
$$;

-- Recebe uma frase que alguém deixou (recente, nunca a sua própria).
-- Devolve o índice da frase, ou null se não houver.
create or replace function public.passa_receber()
returns int
language sql
security definer
set search_path = public
as $$
  select frase
  from public.app_passa
  where criado_em > now() - interval '7 days'
    and (user_id is null or user_id <> auth.uid())
  order by random()
  limit 1;
$$;

grant execute on function public.passa_enviar(int) to authenticated;
grant execute on function public.passa_receber()   to authenticated;
