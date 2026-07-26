-- ══════════════════════════════════════════════════════════════
-- dichava.app — RLS do chat paciente ↔ profissional
-- Corrige o erro "new row violates row-level security policy for table
-- conversas" quando um usuário logado tenta iniciar uma conversa.
--
-- É ADITIVO e SEGURO: cria policies PERMISSIVAS com nomes próprios
-- (as políticas permissivas se somam por OR — não quebra o que já existe
-- pro lado do profissional). Pode rodar de novo por cima (drop if exists).
--
-- Usa ::text nos comparativos pra funcionar independentemente de user_id/
-- prof_id/de_id serem uuid ou text.
-- Rode no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════

-- ───────────── conversas ─────────────
alter table public.conversas enable row level security;

-- Criar a conversa: só quem é o próprio paciente (user_id = eu)
drop policy if exists conversas_insert_own on public.conversas;
create policy conversas_insert_own on public.conversas
  for insert to authenticated
  with check ( auth.uid()::text = user_id::text );

-- Ler a conversa: qualquer um dos dois participantes
drop policy if exists conversas_select_parties on public.conversas;
create policy conversas_select_parties on public.conversas
  for select to authenticated
  using ( auth.uid()::text = user_id::text or auth.uid()::text = prof_id::text );

-- Atualizar (lida, acompanhamento, resumo, última msg): qualquer participante
drop policy if exists conversas_update_parties on public.conversas;
create policy conversas_update_parties on public.conversas
  for update to authenticated
  using ( auth.uid()::text = user_id::text or auth.uid()::text = prof_id::text )
  with check ( auth.uid()::text = user_id::text or auth.uid()::text = prof_id::text );

-- ───────────── mensagens ─────────────
alter table public.mensagens enable row level security;

-- Enviar mensagem: precisa ser o autor (de_id = eu) E participante da conversa
drop policy if exists mensagens_insert_author on public.mensagens;
create policy mensagens_insert_author on public.mensagens
  for insert to authenticated
  with check (
    auth.uid()::text = de_id::text
    and exists (
      select 1 from public.conversas c
      where c.id::text = conversa_id::text
        and ( auth.uid()::text = c.user_id::text or auth.uid()::text = c.prof_id::text )
    )
  );

-- Ler mensagens: só participantes da conversa
drop policy if exists mensagens_select_parties on public.mensagens;
create policy mensagens_select_parties on public.mensagens
  for select to authenticated
  using (
    exists (
      select 1 from public.conversas c
      where c.id::text = conversa_id::text
        and ( auth.uid()::text = c.user_id::text or auth.uid()::text = c.prof_id::text )
    )
  );
