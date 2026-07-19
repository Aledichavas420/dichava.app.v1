# Push de nova mensagem no chat

Avisa o destinatário (profissional ou paciente) quando chega mensagem, mesmo com o app fechado. Usa a infra de push que já existe (VAPID, tabela `push_subs`, service worker).

## Peças
- Edge Function `push-msg` (`notificacoes/push-msg/index.ts`) — envia o Web Push.
- Database Webhook — dispara a função no INSERT da tabela `mensagens`.

## Passo 1 — Chave VAPID privada
A função precisa da **chave privada VAPID** que faz par com a pública do app
(`VAPID_PUB = BHsXMrwzV3w79-Poc...`, em index.html). Você já gerou esse par quando
configurou as notificações de cuidado — use a **mesma** chave privada.

> Se não tiver mais a privada, gere um NOVO par (ex.: `npx web-push generate-vapid-keys`),
> troque a `VAPID_PUB` no index.html pela nova pública **e** use a nova privada aqui.
> (Trocar o par exige que os usuários reativem as notificações.)

## Passo 2 — Deploy da função
Supabase → Edge Functions → **Deploy new function** → nome `push-msg` → cole o
conteúdo de `notificacoes/push-msg/index.ts` → Deploy. **Verify JWT = OFF**.

Secrets (Edge Functions → Secrets):
- `VAPID_PUB` = a mesma pública do app (BHsXMrwz...)
- `VAPID_PRIVATE` = a chave privada correspondente
- (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` normalmente já existem)

## Passo 3 — Database Webhook
Supabase → **Database → Webhooks → Create a new hook**:
- **Name:** push-msg
- **Table:** `mensagens`
- **Events:** marque **Insert**
- **Type:** Supabase Edge Functions → **push-msg**
- Create.

## Testar
1. Nas duas contas, ative as notificações (o app pede, ou Config → notificações).
2. Feche o app numa conta.
3. Mande uma mensagem da outra conta.
4. A notificação **💬 [nome]** deve chegar no aparelho.

Se não chegar, veja os **Logs** da função `push-msg`. Causas comuns:
- `VAPID_PRIVATE` não bate com a `VAPID_PUB` → erro de assinatura.
- O destinatário não tem push ativo (sem linha em `push_subs`).
- No iPhone, o app precisa estar **instalado na Tela de Início** para receber push.
