# 🔔 Notificações push — dichava.rd

Sistema de notificações **automáticas e personalizadas** via Web Push + Supabase.
O app inscreve o aparelho; uma Edge Function roda 1x/dia e envia mensagens de
cuidado conforme a substância, os dias desde o último uso e a meta da pessoa.

> O lado do **app** (toggle nas Configurações, inscrição e service worker) **já está pronto**.
> Falta só você fazer os 5 passos abaixo no Supabase (uma vez).

---

## 🔑 Chaves VAPID

```
VAPID_PUBLIC  = BNWG_B7SsJFIhvTO-aJAX8WzdvDyixqKhAF6qc17vYzpUWu0OzZjJ2IIJgK6sASfHrfvZ4WbzDrndFOqXa1FsPU
VAPID_PRIVATE = <SUA_CHAVE_PRIVADA_VAPID>   # NUNCA commitar — só nos secrets da função
```

- A **pública** já está embutida no app (`index.html`, const `VAPID_PUB`). É pública por natureza.
- A **privada** é **segredo**: fica **apenas** nos secrets da Edge Function (passo 3). Nunca exponha no front nem no repositório.

> ⚠️ **Segurança:** uma versão anterior deste README continha a chave privada em texto.
> Ela foi **removida** e **deve ser rotacionada** (gere um novo par VAPID e atualize os
> secrets `VAPID_PUBLIC`/`VAPID_PRIVATE` na função + o `VAPID_PUB` no `index.html`).
> Remover do arquivo **não** apaga do histórico do Git — por isso a rotação é obrigatória.

---

## Passo a passo (Supabase)

### 1) Criar as tabelas
No painel → **SQL Editor** → cole e rode o conteúdo de **`schema.sql`**.

### 2) Criar a função
No seu computador, com a [CLI do Supabase](https://supabase.com/docs/guides/cli):

```bash
supabase functions new notificar
# substitua o arquivo criado por notificacoes/funcao/index.ts
supabase functions deploy notificar --no-verify-jwt
```

> `--no-verify-jwt` porque quem chama é o cron (autenticado pelo CRON_SECRET), não um usuário logado.

### 3) Configurar os secrets da função
```bash
supabase secrets set \
  VAPID_PUBLIC=<SUA_CHAVE_PUBLICA_VAPID> \
  VAPID_PRIVATE=<SUA_CHAVE_PRIVADA_VAPID> \
  VAPID_SUBJECT=mailto:seu-email@exemplo.com \
  CRON_SECRET=troque-por-uma-senha-aleatoria
```
(`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente no ambiente da função.)

### 4) Agendar o envio diário
No **SQL Editor**, ative as extensões e rode **`cron.sql`** — trocando `<PROJECT_REF>`
(o id do seu projeto, ex: `gnpwaywyexcevtzbwiyq`) e `<CRON_SECRET>` (o mesmo do passo 3).

### 5) Testar agora (sem esperar o cron)
```bash
curl -X POST "https://<PROJECT_REF>.functions.supabase.co/notificar" \
  -H "x-cron-secret: <CRON_SECRET>"
# resposta: {"ok":true,"enviados":N}
```

---

## 📱 Como o usuário ativa

1. Abre o app pelo link.
2. **iPhone:** toca em Compartilhar → **"Adicionar à Tela de Início"** e abre pelo ícone
   (no iOS, push só funciona com o app instalado — limitação da Apple).
   **Android:** funciona direto, mas instalar é melhor.
3. Vai em **Configurações → Notificações de cuidado** e ativa (aceita a permissão).

A partir daí, mesmo com o app fechado, ele recebe os avisos.

---

## 🧠 O que é enviado (motor de conteúdo)

- **Linha do tempo por substância** (em `funcao/index.ts`, objeto `TL`): mensagens
  de acolhimento nos dias-chave após o último uso — cobrindo **todas as 14 substâncias**
  do app (Álcool, Cannabis, Tabaco, Cocaína, Crack, MDMA, LSD, Cogumelo, Ketamina,
  Opioide, Benzodiazepínicos, Ayahuasca, Cafeína e "Outra").
- **Mensagens por meta** (objeto `META_MSG`): reforço conforme o objetivo
  (acompanhar / reduzir / parar / redução de danos) quando não há marco de substância no dia.
- **Lembrete de registro**: se a pessoa não registrou no dia, um convite gentil
  (no máx. ~1 a cada 3 dias, sem encher).
- **Sem repetição**: cada marco é enviado só uma vez (tabela `push_log`).
- **No máximo 1 notificação por pessoa por dia** — nada de spam.

Para editar textos, mexa nos objetos `TL` e `META_MSG` e rode o deploy de novo.

---

## Observações

- Os textos são **acolhedores e não-prescritivos**, no tom de redução de danos do app.
  Em casos sensíveis (álcool, opioides, benzodiazepínicos) as mensagens reforçam
  **procurar apoio profissional** e **não parar de supetão** quando for o caso.
- Privacidade: tudo roda no **seu** Supabase. Nenhum dado de uso vai pra terceiros.
- Fuso horário: o app salva o fuso do aparelho; a função calcula "hoje" por usuário.
