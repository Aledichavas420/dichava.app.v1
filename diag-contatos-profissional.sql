-- ══════════════════════════════════════════════════════════════
-- dichava.app — Diagnóstico: essa profissional tem contatos de paciente?
--
-- Troque 'PARTE DO NOME' por um pedaço do nome dela (ex.: 'Gabriela').
-- Rode no SQL Editor. Só lê, não muda nada.
-- ══════════════════════════════════════════════════════════════

with prof as (
  select id, nome, plano
  from public.profissionais
  where nome ilike '%PARTE DO NOME%'
)

-- 1) Conversas iniciadas por pacientes com ela (é aqui que aparece "contato")
select
  c.id                              as conversa_id,
  c.user_nome                       as paciente,
  c.criado_em                       as iniciada_em,
  c.atualizado_em,
  c.ultima_msg,
  (select count(*) from public.mensagens m where m.conversa_id = c.id)                       as total_mensagens,
  (select count(*) from public.mensagens m where m.conversa_id = c.id and m.de_id = c.user_id) as mensagens_do_paciente
from public.conversas c
join prof p on p.id = c.prof_id
order by c.atualizado_em desc;

-- Como ler:
--   Nenhuma linha  -> ninguém iniciou conversa com ela (contato real ainda não houve).
--   Linhas com "mensagens_do_paciente" > 0 -> pacientes JÁ falaram com ela, e ela
--   não estava vendo porque a notificação de mensagem abria "/" (app do paciente)
--   em vez de "/clinica/". Isso foi corrigido na função push-msg.

-- 2) (Opcional) Ela tem aparelho registrado pra receber push?
--    Se vier 0, as "notificações" que ela recebe podem ser de outra conta/app.
-- select count(*) as aparelhos_push
-- from public.push_subs ps
-- join prof p on p.id = ps.user_id;
