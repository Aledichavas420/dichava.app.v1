# Plano — Isolamento real (LGPD) dos dados privados da Clínica

> **Status:** planejado (fast-follow pós-lançamento). NÃO iniciar antes do lançamento.
>
> **Contexto:** hoje os dados da clínica ficam todos num único JSON (`clinicas.dados`)
> e a RLS libera a linha inteira para qualquer membro da clínica. A privacidade de
> **prontuários, escalas e financeiro** é feita **no app** (filtro por `profId`) —
> protege a tela, mas o dado bruto ainda está no mesmo pacote (alcançável via DevTools).
> Este plano descreve como mover esses 3 domínios para isolamento **no banco**.

## Objetivo
Prontuários, escalas (avaliações) e financeiro visíveis **só** para o profissional
que os criou — recusado pelo próprio Postgres (RLS por linha), não só pelo front.
Agenda e pacientes continuam **compartilhados** com a equipe.

## Passos

1. **Tabelas próprias** (tirar do JSON):
   - `public.prontuarios(id, clinica_id, paciente_id, prof_id, ...campos, criado_em)`
   - `public.avaliacoes(id, clinica_id, paciente_id, prof_id, escala, score, respostas, subs, data, criado_em)`
   - `public.financeiro(id, clinica_id, prof_id, tipo, categoria, descricao, valor, data, forma_pagamento, paciente_id, agendamento_id, criado_em)`
   - Índices por `(clinica_id, prof_id)` e por `paciente_id`.

2. **RLS por linha** (a blindagem de verdade):
   - `enable row level security` nas 3 tabelas.
   - SELECT/INSERT/UPDATE/DELETE `using (prof_id = auth.uid())`.
   - (Decidir: o `dono` NÃO deve ver prontuário alheio — manter estritamente `prof_id = auth.uid()`.)
   - Conferir que `is_clinica_member` NÃO é usado para liberar leitura destes 3 domínios.

3. **Migração dos dados existentes** (com backup antes):
   - `create table backup_clinicas_dados as select id, dados, now() as em from public.clinicas;`
   - Para cada clínica, explodir `dados->'prontuarios' | 'avaliacoes' | 'financeiro'` (via `jsonb_array_elements`) para as novas tabelas.
   - `prof_id`: usar o `profId` do registro; se ausente (legado), atribuir ao `dono_id` da clínica.
   - Depois de validar contagens, **remover** essas 3 chaves de `clinicas.dados` (deixar só agenda/pacientes/config/documentos/lixeira/auditoria).

4. **Reescrever no painel** (`clinica/index.html`) leitura/gravação dos 3 domínios:
   - De arrays em `DB.*` → consultas Supabase (`_SB.from('prontuarios')...`).
   - Carregar no boot junto com a clínica; salvar por operação (não no blob).
   - Manter os helpers `meuReg`/`prontsDoPac` como fallback do modo local/demo.
   - Ajustar `sincronizarCaixa` (lançamento automático) para inserir na tabela `financeiro` com `prof_id = agendamento.profId`.

5. **Testes**:
   - 2 profissionais na mesma clínica não enxergam prontuário/escala/financeiro um do outro nem via API direta.
   - Solo continua vendo tudo.
   - Agenda e pacientes continuam compartilhados.
   - Export de prontuário/CSV traz só os do profissional logado.

## Riscos
- Migração de dados reais → **sempre** rodar o backup do passo 3 antes.
- Rollback: restaurar `clinicas.dados` a partir de `backup_clinicas_dados`.

## Referências no código (estado atual, app-side)
- `clinica/index.html`: `ehEquipe()`, `meuReg()`, `meuPront()`, `prontsDoPac()`.
- Filtros aplicados em: `viewProntuarios`, `viewProntuarioPaciente`, `exportarProntuario`,
  `exportarTodosProntuarios`, `escalasSecao`, `viewDash`, `viewCaixa`,
  `relatorioFinanceiro`, `viewProjecao`, `saveProntuario`, `salvarEscala`,
  `saveFinanceiro`, `sincronizarCaixa`.
- Modelo de equipe atual: `docs/clinica-compartilhada-setup.sql`.
