-- ══════════════════════════════════════════════════════════════
-- dichava.app — Gatilho de PUSH pra mensagem nova no chat
-- A cada mensagem inserida em public.mensagens, chama a Edge Function
-- push-mensagem, que descobre o destinatário e envia a notificação.
--
-- Rode DEPOIS de deployar a função:
--   supabase functions deploy push-mensagem --no-verify-jwt
-- E de garantir o secret VAPID_PRIVATE_KEY (a mesma chave do push-agenda).
--
-- Idempotente (pode rodar de novo por cima). Segue o mesmo padrão do
-- push-triggers-setup.sql (notificar_push_agenda).
-- ══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notificar_push_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://gnpwaywyexcevtzbwiyq.supabase.co/functions/v1/push-mensagem',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
end $$;

drop trigger if exists on_mensagem_push on public.mensagens;
create trigger on_mensagem_push
after insert on public.mensagens
for each row execute function public.notificar_push_mensagem();

notify pgrst, 'reload schema';
