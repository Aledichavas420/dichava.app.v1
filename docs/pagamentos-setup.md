# Ativar pagamento real (PagBank + CPF) — passo a passo

O app já está pronto. Enquanto `PAGAMENTO_ATIVO=false` (no index.html), a
assinatura continua **simulada**. Depois de fazer os passos abaixo, é só
mudar pra `true` e dar deploy.

## 1. Conta e token do PagBank
1. Crie/entre na conta **PagBank** (pode ser CPF).
2. Gere um **token de API** (Vendas → Integrações → Token de API / Chave).
   - Tenha o de **sandbox** (testes) e o de **produção**.

## 2. Banco de dados (Supabase → SQL Editor)
```sql
-- garante as colunas que o app já lê em `perfis`
alter table perfis add column if not exists plano text;
alter table perfis add column if not exists plano_expira timestamptz;

-- log de pagamentos
create table if not exists pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  plano text,
  order_id text,
  status text,
  criado_at timestamptz default now()
);
alter table pagamentos enable row level security;
-- sem policies p/ anon: só as Edge Functions (service role) escrevem/leem
```
> `perfis.user_id` precisa ser **único** (é o que o upsert usa). Se ainda não for:
> `create unique index if not exists perfis_user_id_key on perfis(user_id);`

## 3. Deploy das Edge Functions
```
supabase functions deploy pagamento-criar   --no-verify-jwt
supabase functions deploy pagamento-webhook  --no-verify-jwt
```
(ou cole o conteúdo de `pagamentos/criar/index.ts` e `pagamentos/webhook/index.ts`
no editor de Functions do painel.)

## 4. Secrets das funções (Supabase → Edge Functions → Secrets)
```
PAGBANK_TOKEN=<seu token do PagBank>
PAGBANK_BASE=https://api.pagseguro.com          # sandbox: https://sandbox.api.pagseguro.com
SITE_URL=https://dichava.app
PAGBANK_WEBHOOK_URL=https://<seu-projeto>.supabase.co/functions/v1/pagamento-webhook
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente das functions
```

## 5. Webhook no PagBank
Aponte a URL de notificação para:
`https://<seu-projeto>.supabase.co/functions/v1/pagamento-webhook`
(a função `pagamento-criar` já manda essa URL em cada pedido via `notification_urls`,
então pode ser automático — mas confirme no painel do PagBank.)

## 6. Preços (já batem com o app)
| plano | valor | validade |
|---|---|---|
| mensal | R$ 12,90 | 30 dias |
| anual | R$ 99,90 | 365 dias |
| vita | R$ 189,90 | vitalício (sem expiração) |
Para mudar, edite `PLANOS` em `pagamentos/criar/index.ts` (centavos) e `DIAS` no webhook.

## 7. Testar (sandbox)
1. Deixe `PAGBANK_BASE` = sandbox e use o token de sandbox.
2. No app, temporariamente `PAGAMENTO_ATIVO=true`.
3. Assine um plano → paga no sandbox → o webhook grava `perfis.plano='premium'`
   → o app libera sozinho ao voltar (`?pago=1` fica conferindo por ~25s).
4. Confira em `select * from pagamentos;` e `select plano,plano_expira from perfis where user_id=...`.

## 8. Ir pra produção
- Troque `PAGBANK_BASE` e o token para **produção**.
- `PAGAMENTO_ATIVO=true` no index.html + deploy do app.
- Tire o aviso "modo teste" se ainda estiver (a tela de planos já mostra os Termos).

## Observações
- **Reembolso 7 dias (CDC):** por enquanto é manual — estorne pelo painel do PagBank
  e, se quiser, rode `update perfis set plano=null, plano_expira=null where user_id=...`.
- **Renovação:** não é automática (combina com os Termos). Quando a pessoa paga de novo,
  o webhook **estende** a validade a partir da data atual.
- **Segurança:** o `user_id` vai do app pro checkout; o webhook sempre **reconfere**
  o pagamento na API do PagBank antes de liberar. Dá pra endurecer depois exigindo JWT.
