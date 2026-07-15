# dichava.app — Área de Profissionais (spec para construção)

> Status: **planejado / dormente**. No lançamento vai só a página de waitlist
> (`landing/profissionais.html`). Esta spec é o mapa para construir a função
> completa quando a demanda justificar.

## 1. Visão
Uma área **separada do app do consumidor**, só para profissionais de saúde, que
usam o dichava para **aparecer para pacientes e captar novos**. O profissional
NÃO acessa diário, SOS, etc. — só um **painel** com o próprio perfil e os leads.

- **Painel do profissional** → na **web** (`dichava.app/profissionais/painel`).
- **Diretório (onde o paciente escolhe)** → **dentro do app** (aba liberada a
  todos os usuários). Gancho já existe: `abrirProfs()` / quick-action escondida.

## 2. Onboarding "Sou profissional da saúde"
Fluxo separado do cadastro comum:
1. Cadastro (nome, e-mail, senha) marcado como `tipo=profissional`.
2. Preenche o perfil (ver §3).
3. Envia **comprovante de registro** (CRP/CRM) → status `pendente`.
4. **Verificação manual** (equipe confere o registro no conselho) → `verificado`.
5. Escolhe plano e paga → `ativo` → passa a **aparecer no diretório**.
   - Perfil pode ser criado **grátis**, mas só fica **visível após pagamento**.

## 3. Perfil do profissional (dados)
- nome, registro (CRP/CRM + UF), especialidade, abordagem/metodologia
- mini-currículo / formação, temas que atende
- valor médio de sessão, formas de atendimento (online/presencial), cidade/UF
- foto, contato (WhatsApp/e-mail/link), redes
- status: `pendente` | `verificado` | `ativo` | `pausado`

## 4. Planos (2 níveis)
| | Parceiro | Parceiro Destaque |
|---|---|---|
| Perfil verificado no diretório | ✅ | ✅ |
| Selo de parceiro | ✅ | ✅ |
| Destaque/prioridade na listagem | — | ✅ |
| Divulgação ativa (landing + @dichavandoard 143k) | — | ✅ |
| 10 códigos premium p/ pacientes | — | ✅ |
| **Preço lançamento** | **R$ 149/mês** | **R$ 249/mês** |
- Plano **anual** com desconto (pros pensam a longo prazo).
- Sem fidelidade; direito de arrependimento 7 dias (CDC), como no premium.

## 5. Códigos premium (só no Destaque)
- Cada Destaque gera até **10 códigos**.
- Paciente resgata em Config → "Tenho um código" → vira premium enquanto o
  profissional mantiver o plano ativo.
- Modelo `codigos`: `codigo`, `profissional_id`, `usado_por (user_id|null)`,
  `ativo`. Limite de 10 por profissional. Revalidar acesso do paciente se o
  profissional cancelar.

## 6. Diretório no app (lado do paciente)
- Aba/tela listando profissionais `ativos`, Destaque primeiro.
- Filtro por especialidade, cidade, online/presencial.
- Card → perfil completo → botão de contato (WhatsApp/link).
- Deixar claro: o dichava **conecta**, não é responsável pelo atendimento.

## 7. Modelo de dados (Supabase, esboço)
- `profissionais` (1:1 com auth user tipo profissional): dados do §3 + status + plano.
- `pro_waitlist` (**já criar p/ o lançamento**): captações da landing.
- `codigos`: §5.
- `pro_leads` (futuro): quem clicou/contatou, p/ o painel mostrar métricas.
- RLS: profissional só lê/edita o próprio; diretório expõe só campos públicos de `ativo`.

### SQL da waitlist (rodar agora)
```sql
create table if not exists pro_waitlist (
  id uuid primary key default gen_random_uuid(),
  nome text, registro text, especialidade text, cidade text,
  atendimento text, email text, whatsapp text, plano text, mensagem text,
  criado_at timestamptz default now()
);
alter table pro_waitlist enable row level security;
create policy "anon insert waitlist" on pro_waitlist
  for insert to anon with check (true);
-- leitura só p/ você (service role / dashboard). Sem policy de select p/ anon.
```

## 8. Pré-requisitos antes de ativar cobrança
1. **Pagamento real do consumidor** funcionando primeiro.
2. Fluxo de **verificação de registro** (mesmo que manual).
3. **Revisão jurídica**: contrato de parceria + regras dos códigos + termos.
4. Moderação/qualidade do diretório (evitar perfil falso).

## 9. Ordem sugerida de construção (pós-lançamento)
1. Waitlist (feito) → medir demanda.
2. Diretório read-only no app com 3–5 parceiros curados **na mão** (sem self-service).
3. Onboarding + perfil self-service + verificação.
4. Pagamento dos planos.
5. Códigos premium.
6. Painel de leads/métricas.
