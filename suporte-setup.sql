-- dichava.app — Chat de SUPORTE (profissional ⇄ admin)
-- Rode uma vez no SQL Editor. Idempotente. Depende de eh_admin() (admin-setup.sql).

create table if not exists public.suporte_mensagens (
  id         uuid primary key default gen_random_uuid(),
  prof_id    uuid not null,                 -- profissional dono da conversa (= auth.uid do prof)
  remetente  text not null,                 -- 'prof' | 'suporte'
  texto      text not null,
  criado_em  timestamptz not null default now(),
  lida_admin boolean not null default false,
  lida_prof  boolean not null default false
);
create index if not exists suporte_prof_idx on public.suporte_mensagens(prof_id, criado_em);

alter table public.suporte_mensagens enable row level security;

-- profissional lê/escreve só a própria conversa
drop policy if exists sup_prof_read on public.suporte_mensagens;
create policy sup_prof_read on public.suporte_mensagens
  for select using (auth.uid() = prof_id or public.eh_admin());

drop policy if exists sup_prof_insert on public.suporte_mensagens;
create policy sup_prof_insert on public.suporte_mensagens
  for insert with check (
    (auth.uid() = prof_id and remetente = 'prof') or
    (public.eh_admin() and remetente = 'suporte')
  );

drop policy if exists sup_update on public.suporte_mensagens;
create policy sup_update on public.suporte_mensagens
  for update using (auth.uid() = prof_id or public.eh_admin());

-- Lista de conversas de suporte pro admin (uma por profissional, com última msg e não-lidas)
create or replace function public.admin_suporte_conversas()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.eh_admin() then raise exception 'not authorized'; end if;
  select coalesce(json_agg(x order by x.ultima desc), '[]'::json) into r from (
    select m.prof_id,
           (select nome from public.profissionais p where p.id=m.prof_id) as nome,
           max(m.criado_em) as ultima,
           (array_agg(m.texto order by m.criado_em desc))[1] as ultima_msg,
           count(*) filter (where m.remetente='prof' and not m.lida_admin) as nao_lidas
    from public.suporte_mensagens m
    group by m.prof_id
  ) x;
  return r;
end $$;
revoke all on function public.admin_suporte_conversas() from public, anon;
grant execute on function public.admin_suporte_conversas() to authenticated;

notify pgrst, 'reload schema';
