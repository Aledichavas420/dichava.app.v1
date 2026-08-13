-- ══════════════════════════════════════════════════════════════
-- dichava.app — Gatilho no banco pra disparar a função push-msg
-- que JÁ EXISTE. Hoje a push-msg só é chamada pelo app de quem envia
-- (client-side, "fire and forget"): se o app fechar/perder rede logo
-- depois de enviar, o push não sai. Este gatilho roda no servidor a cada
-- mensagem inserida, então o aviso passa a sair SEMPRE, não importa o que
-- aconteça no aparelho de quem enviou.
--
-- Não precisa deployar função nenhuma: a push-msg já está no ar.
-- Mesmo padrão do push-agenda (push-triggers-setup.sql). Idempotente.
-- ══════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function public.notificar_push_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://gnpwaywyexcevtzbwiyq.supabase.co/functions/v1/push-msg',
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
