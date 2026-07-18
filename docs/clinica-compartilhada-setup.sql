-- ════════════════════════════════════════════════════════════
-- dichava.app — Painel da Clínica COMPARTILHADO (coletivos)
-- Rode este SQL no Supabase → SQL Editor (uma vez).
-- ════════════════════════════════════════════════════════════

-- 1) TABELAS
create table if not exists public.clinicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono_id uuid not null,
  codigo text unique not null,
  dados jsonb default '{}'::jsonb,          -- agenda, pacientes, prontuários, caixa
  atualizado_em timestamptz default now(),
  criado_em timestamptz default now()
);

create table if not exists public.clinica_membros (
  clinica_id uuid references public.clinicas(id) on delete cascade,
  user_id uuid not null,
  nome text,
  papel text default 'membro',              -- 'dono' | 'membro'
  criado_em timestamptz default now(),
  primary key (clinica_id, user_id)
);

alter table public.clinicas enable row level security;
alter table public.clinica_membros enable row level security;

-- 2) FUNÇÃO auxiliar: o usuário é membro desta clínica?
--    (security definer evita recursão de RLS ao checar a associação)
create or replace function public.is_clinica_member(cid uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.clinica_membros m
    where m.clinica_id = cid and m.user_id = auth.uid()
  );
$$;

-- 3) POLÍTICAS — clinicas
drop policy if exists "clinica select" on public.clinicas;
create policy "clinica select" on public.clinicas
  for select using (public.is_clinica_member(id));

drop policy if exists "clinica insert" on public.clinicas;
create policy "clinica insert" on public.clinicas
  for insert with check (dono_id = auth.uid());

drop policy if exists "clinica update" on public.clinicas;
create policy "clinica update" on public.clinicas
  for update using (public.is_clinica_member(id));

-- 4) POLÍTICAS — clinica_membros
drop policy if exists "membros select" on public.clinica_membros;
create policy "membros select" on public.clinica_membros
  for select using (public.is_clinica_member(clinica_id));

drop policy if exists "membros self insert" on public.clinica_membros;
create policy "membros self insert" on public.clinica_membros
  for insert with check (user_id = auth.uid());

-- dono remove qualquer um; membro pode remover a si mesmo (sair)
drop policy if exists "membros delete" on public.clinica_membros;
create policy "membros delete" on public.clinica_membros
  for delete using (
    user_id = auth.uid()
    or exists(select 1 from public.clinicas c where c.id = clinica_id and c.dono_id = auth.uid())
  );

-- 5) RPC — entrar numa clínica pelo CÓDIGO
--    (security definer: acha a clínica pelo código mesmo sem ser membro ainda)
create or replace function public.entrar_clinica(p_codigo text, p_nome text)
returns uuid language plpgsql security definer as $$
declare cid uuid;
begin
  select id into cid from public.clinicas where codigo = upper(p_codigo);
  if cid is null then raise exception 'codigo invalido'; end if;
  insert into public.clinica_membros(clinica_id, user_id, nome, papel)
    values (cid, auth.uid(), p_nome, 'membro')
    on conflict (clinica_id, user_id) do nothing;
  return cid;
end; $$;

grant execute on function public.entrar_clinica(text, text) to authenticated;
