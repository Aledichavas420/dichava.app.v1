-- dichava.app — Triggers de PUSH pro profissional (via pg_net, sem Database Webhooks)
-- Rode DEPOIS de deployar as funções push-agenda e push-codigo (com Verify JWT OFF).
-- Idempotente.

create extension if not exists pg_net;

-- ── 1) Novo agendamento → avisa a clínica ───────────────────
create or replace function public.notificar_push_agenda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://gnpwaywyexcevtzbwiyq.supabase.co/functions/v1/push-agenda',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
end $$;

drop trigger if exists on_solicitacao_push on public.solicitacoes;
create trigger on_solicitacao_push
after insert on public.solicitacoes
for each row execute function public.notificar_push_agenda();

-- ── 2) Código premium resgatado → avisa o profissional ──────
create or replace function public.notificar_push_codigo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- só quando ACABOU de ser usado (usado_por saiu de null pra um valor)
  if NEW.usado_por is not null and OLD.usado_por is null then
    perform net.http_post(
      url := 'https://gnpwaywyexcevtzbwiyq.supabase.co/functions/v1/push-codigo',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('record', to_jsonb(NEW), 'old_record', to_jsonb(OLD))
    );
  end if;
  return NEW;
end $$;

drop trigger if exists on_codigo_usado_push on public.codigos_premium;
create trigger on_codigo_usado_push
after update on public.codigos_premium
for each row execute function public.notificar_push_codigo();
