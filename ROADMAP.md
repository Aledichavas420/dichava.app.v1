# Roadmap — dichava.app

Documento de planejamento. **Não afeta o app** — é só registro de decisões e ideias
pra não se perder no futuro.

---

## Formato do app: manter PWA

**Decisão (jul/2026):** manter como **PWA** (Progressive Web App) — um único
`index.html` + `sw.js` + `manifest.webmanifest`, servido pelo GitHub Pages.

Motivos:
- **Um código só**, atualização instantânea (push na `main` → no ar em ~1 min).
- **Distribuição por link direto** (Instagram, WhatsApp, grupos) — onde o público está.
- **Sem risco de rejeição** pelas políticas de "drogas" da App Store / Play Store.
- Instala na tela inicial e funciona offline, como um app nativo.

### Lojas (App Store / Play Store) — adiado, provavelmente desnecessário
- A loja só agrega **descoberta**, **selo de confiança** e **push mais confiável no iOS**.
  Nada disso é essencial agora.
- Se um dia quiser Play Store: empacotar via **TWA** (Bubblewrap ou PWABuilder) —
  barato (US$ 25 único) e reaproveita 100% do PWA.
- App Store: Apple **não aceita PWA puro**; precisaria de casca nativa (**Capacitor**).
  Custo US$ 99/ano + **risco real de política** por ser tema de substâncias.
- ⚠️ Enquadrar sempre como **saúde / redução de danos / autoconhecimento**, com
  disclaimers médicos visíveis (já fazemos: "sem julgamento", CVV 188, etc.).

**Se for empacotar pra loja no futuro**, preparar antes (sem quebrar nada):
- [ ] Ícones adaptáveis (maskable) no manifest
- [ ] `assetlinks.json` (Digital Asset Links) pra TWA
- [ ] Revisar `manifest.webmanifest` (name, short_name, theme_color, screenshots)

---

## Monetização: premium sem loja (sem comissão de 30%)

**Ideia central:** cobrar acesso a partes exclusivas **sem passar pela loja**,
usando pagamento próprio. Fora das lojas, **não há obrigação de usar o pagamento
delas** (que fica com 15–30%) — ficamos com quase 100%.

### Meios de pagamento (Brasil)
- **Pix** — taxa quase zero, ideal pra pagamento avulso / anual.
- **Mercado Pago / Stripe / Pagar.me** — assinatura recorrente (cartão) + Pix.
- **Hotmart / Kiwify** — alternativa "pronta" com checkout e área de membros.

### Arquitetura (reaproveita o Supabase que já usamos)
1. Campo no perfil do usuário: `plano: 'free' | 'premium'` (+ `plano_expira` se recorrente).
2. Fluxo:
   - Usuário toca em **"Desbloquear premium"** → vai pro checkout (Pix/cartão).
   - Pagamento confirmado → **webhook** do provedor marca `plano='premium'` no Supabase.
   - App relê o perfil e libera o conteúdo (gating por `plano`).
3. Gating no app: funções/telas premium checam `gPlano()` antes de abrir.

### Pontos de atenção (quando chegar a hora)
- [ ] Nota fiscal / tributação — falar com **contador** antes de cobrar.
- [ ] Termos de uso e política de reembolso claros.
- [ ] LGPD: dados de pagamento tratados pelo provedor (não guardar cartão no app).
- [ ] Definir **o que é free x premium** (o núcleo de redução de danos deve seguir
      gratuito — premium só pra recursos "extras", pra não criar barreira ao cuidado).

### Candidatos a "premium" (a decidir)
- Relatórios/estatísticas avançadas, exportação (PDF/CSV).
- Conteúdos guiados extras (mais áudios, trilhas, artigos).
- Backup na nuvem / multi-dispositivo.
- Temas/personalização.

---

## Checklist de lançamento (do fim do teste até ir ao ar)

### Fase 1 — Fechar o ciclo de testes
- [ ] Consolidar feedback dos testers numa lista única
- [ ] Priorizar: bug crítico → confuso → "seria legal"
- [ ] Corrigir bugs que travam ou confundem (foco em **confiável**, não perfeito)
- [ ] Definir a **linha free × premium** (ver regra de ouro abaixo)

### Fase 2 — Preparar pro público geral
- [ ] **Domínio próprio** (ex: dichava.app) apontando pro app (~R$ 40–60/ano)
- [ ] HTTPS no domínio (automático no GitHub/Cloudflare Pages)
- [ ] **Analytics privacy-friendly** (Plausible ou Umami — sem cookies, LGPD ok)
- [ ] **Política de Privacidade** e **Termos de Uso** publicados e linkados no app
- [ ] Revisar segurança e backup do Supabase (Fase infra abaixo)

### Fase 3 — Infra pra aguentar acessos
- [ ] **RLS ativo em TODAS as tabelas** do Supabase (cada user só vê o próprio dado) 🔒
- [ ] **Índices** nas colunas mais consultadas (`user_id`, data)
- [ ] **Confirmação de e-mail + rate limiting** no Supabase Auth
- [ ] Decidir **Supabase Pro** (US$ 25/mês) antes do pico — principalmente pelo **backup diário**
- [ ] (Futuro) Avaliar migrar hospedagem do app pra **Cloudflare Pages** (banda ilimitada, grátis)

### Fase 4 — Monetização (quando o público já responde)
- [ ] Campo `plano: free|premium` (+ `plano_expira`) no perfil (Supabase)
- [ ] Checkout **Pix / Mercado Pago** (ou Stripe/Hotmart)
- [ ] **Webhook** que marca `plano='premium'` após pagamento confirmado
- [ ] *Gating* no app: telas/funções premium checam o plano antes de abrir
- [ ] **Contador / nota fiscal / tributação** acertados antes de cobrar

### Fase 5 — Lançamento e pós
- [ ] Landing com CTA claro (✅ já pronta em `/landing/`)
- [ ] Plano de divulgação (Instagram, grupos, coletivos de redução de danos)
- [ ] Monitorar aceitação por 1–3 meses
- [ ] Só então: abrir o **módulo profissionais**

### Regra de ouro do free × premium
O **núcleo de redução de danos é sempre gratuito** (registro, modo SOS, respiração,
informação de segurança) — cobrar por isso criaria barreira ao cuidado. Premium só
nos **extras**: relatórios avançados, exportação, backup na nuvem, mais conteúdos
guiados, temas.

---

## Histórico rápido de infra
- Deploy: **GitHub Pages** a partir da branch `main`.
- Já houve travamento da fila de deploy do Pages (jul/2026) — resolvido deletando o
  environment `github-pages` e reconfigurando a source. Se travar de novo, esse é o caminho.
- Service worker: **network-first** com `cache: 'no-store'` pra HTML, evitando
  versões antigas travadas. Botão **"Forçar atualização"** em Config → Grupo de testes.
- Backend: **Supabase** (projeto `gnpwaywiyq...`). Muito dado fica em **localStorage**
  no aparelho — o backend cuida sobretudo de **auth** e do que for sincronizado, o que
  mantém a carga do banco leve.
