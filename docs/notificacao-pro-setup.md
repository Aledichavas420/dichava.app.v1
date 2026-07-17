# Notificação por e-mail: novo profissional

Envia um e-mail pra você toda vez que alguém envia um cadastro profissional.

## Peças
- Edge Function `pro-novo` (`notificacoes/pro-novo/index.ts`) — monta e envia o e-mail via Resend.
- Database Webhook do Supabase — dispara a função no INSERT da tabela `profissionais`.
- Resend — serviço de envio de e-mail (plano gratuito).

## Passo 1 — Conta no Resend
1. Crie conta em https://resend.com (grátis).
2. Em **API Keys**, gere uma chave (começa com `re_...`). Guarde.
3. Remetente:
   - **Rápido (teste):** use `onboarding@resend.dev` como remetente. Ele só entrega para o **e-mail dono da conta Resend** — então crie a conta Resend com o **mesmo e-mail** que vai receber (alex.mnteir@gmail.com). Assim já funciona.
   - **Definitivo:** verifique um domínio (ex.: `dichava.app`) em **Domains** e use algo como `avisos@dichava.app`. Aí entrega pra qualquer destinatário.

## Passo 2 — Deploy da função
No Supabase → Edge Functions → **Deploy a new function** → nome `pro-novo` → cole o conteúdo de `notificacoes/pro-novo/index.ts` → Deploy.
Deixe **Verify JWT = OFF** (o webhook chama sem sessão de usuário).

Secrets (Edge Functions → Secrets):
- `RESEND_API_KEY` = a chave `re_...`
- `ADMIN_EMAIL` = alex.mnteir@gmail.com  (opcional; já é o padrão)
- `MAIL_FROM` = `dichava <onboarding@resend.dev>`  (ou seu remetente verificado)

## Passo 3 — Database Webhook
Supabase → **Database → Webhooks → Create a new hook**:
- **Name:** pro-novo
- **Table:** `profissionais`
- **Events:** marque **Insert**
- **Type:** Supabase Edge Functions → selecione **pro-novo**
- (método POST, com o corpo `{ type, record, ... }` — a função já entende)
- Create.

## Testar
Cadastre um perfil profissional no app (ele entra como `pendente`).
Em segundos você recebe o e-mail. Se não chegar:
- Veja os **Logs** da função `pro-novo` (linha `Resend status: ...`).
- Confirme que o remetente `onboarding@resend.dev` entrega pro e-mail dono da conta Resend (senão verifique um domínio).
