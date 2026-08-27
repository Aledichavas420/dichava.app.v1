-- ══════════════════════════════════════════════════════════════
-- dichava.app — Contador de visitas das páginas públicas
--
-- Privacidade em primeiro lugar: guardamos SÓ a página e o dia, com um
-- total. Nada de IP, user-agent ou qualquer dado que identifique alguém.
-- A visita entra por uma função controlada (registrar_visita); ninguém
-- lê a tabela direto — só o admin (eh_admin).
--
-- Requer public.eh_admin() (admin-setup.sql). Rode no SQL Editor. Idempotente.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.visitas (
  path  text not null,
  dia   date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  total integer not null default 0,
  primary key (path, dia)
);

alter table public.visitas enable row level security;

-- Leitura só do admin (a policy roda sobre o grant abaixo).
grant select on public.visitas to authenticated;
drop policy if exists "admin le visitas" on public.visitas;
create policy "admin le visitas" on public.visitas
  for select to authenticated using (public.eh_admin());
-- Sem policy de insert/update: ninguém escreve direto. Só a RPC (security definer).

-- RPC pública que soma +1 na página do dia (upsert atômico).
create or replace function public.registrar_visita(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_path text := left(coalesce(nullif(trim(p_path), ''), '/'), 120);
begin
  insert into public.visitas (path, dia, total)
  values (v_path, (now() at time zone 'America/Sao_Paulo')::date, 1)
  on conflict (path, dia) do update set total = public.visitas.total + 1;
end $$;

grant execute on function public.registrar_visita(text) to anon, authenticated;

notify pgrst, 'reload schema';
