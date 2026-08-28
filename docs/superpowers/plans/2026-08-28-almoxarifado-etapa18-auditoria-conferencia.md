# Almoxarifado Etapa 18 — Auditoria da conferência: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ciclo do inventário passa a deixar rastro (5 atos auditados), cancelar exige
motivo e grava autor, `aprovador_*` deixam de ser colunas mortas, três atos vizinhos ganham
auditoria e a rota de leitura do log ganha gate.

**Architecture:** auditoria **pós-escrita e best-effort** (`.catch` — nunca derruba o ato já
efetivado), no molde de `scrapDisposalService.compensarAssinatura`. Sem serviço novo: o bloco
`/conferencias` é inline na rota e esta etapa **não** o refatora (mudança de estrutura junto
com mudança de comportamento esconderia defeito).

**Tech Stack:** Express + SQLite, `registrarAuditoria` (`services/almoxarifado/audit.js`),
`safeAlter` do schema, supertest; React CRA (só o formulário de cancelar).

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa18-auditoria-conferencia-design.md`

## Global Constraints

- Os das etapas 16/17 (harness real com `requirePermission`, testes só em
  `server/tests/api/*.api.test.js`, controle positivo obrigatório, commits pt sem acento, um
  assunto por commit, `git add` explícito, `CI=true` sem warning).
- **O motor de estoque não é tocado.** A conclusão continua aplicando ajuste por
  `AJUSTE_INVENTARIO` exatamente como hoje.
- **Nada de refatorar o bloco `/conferencias` para service nesta etapa** — só acrescentar.
- Toda auditoria nova é **pós-escrita** e envolvida em `.catch` (RN-02). Nenhuma auditoria
  "de tentativa" (antes do efeito).
- Asserções de auditoria sempre por `entidade` + `acao` + `entidade_id`, nunca por contagem
  global da tabela (a mesma lição de "asserção por evento" das etapas 16/17).

## Regras de negócio (RN) — enunciado completo no design

| ID | Resumo |
|---|---|
| RN-01 | Criar, contar, recontar, concluir e cancelar geram linha `entidade='conferencia'` com autor e `entidade_id` |
| RN-02 | Auditoria nunca derruba o ato (falha → o ato responde normal) |
| RN-03 | Cancelar exige `motivo` (≥5) e só vale em ABERTO; grava autor, data e motivo |
| RN-04 | Correção da própria contagem guarda o de/para em `dados_anteriores` |
| RN-05 | `aprovador_*` só preenchidos na conclusão COM `aplicar_ajustes` |
| RN-06 | `GET /auditoria` exige `configurar` |
| RN-07 | Desativar material, cancelar requisição e excluir requisição auditam |

## Contratos congelados

### C1 — as 5 auditorias da conferência

`entidade: 'conferencia'`, `entidade_id`: id da conferência, `usuario_id`/`usuario_nome` do
`req.user`. Ações e cargas (campos exatos):

| `acao` | Ponto exato | `dados_anteriores` | `dados_novos` |
|---|---|---|---|
| `CRIACAO` | após o laço de INSERT dos itens em `POST /conferencias` (`routes/almoxarifado.js` ~936), antes do `res` | — | `{ numero, tipo, escopo_descricao, modo_cego, dupla_contagem, tolerancia_percentual, total_itens }` |
| `CONTAGEM` | após o UPDATE do item (~1022) quando NÃO é recontagem | `{ quantidade_contada }` anterior **apenas quando havia contagem** (correção do próprio contador — RN-04); senão null | `{ conferencia_numero, item_id, material_codigo, quantidade_sistema, quantidade_contada, divergencia }` |
| `RECONTAGEM` | mesmo ponto, ramo `marcaRecontagem` | `{ quantidade_contada, contado_por_nome }` do colega | idem `CONTAGEM` + `{ recontado_por_nome }` |
| `CONCLUSAO` | após o UPDATE final (~1209), **antes** do gancho de alerta da ~1211 | — | `{ numero, aplicar_ajustes, ajustesAplicados, impactoFinanceiro, itens_contados, itens_divergentes, tolerancia_percentual, modo_cego, dupla_contagem }`; `justificativa: justificativa_ajuste \|\| null` |
| `CANCELAMENTO` | após o UPDATE do cancelar (~1235) | `{ status: 'ABERTO' }` | `{ numero, itens_contados }`; `justificativa: motivo` |

Todas envolvidas em `.catch((e) => console.warn(...))` — RN-02.

### C2 — `PUT /conferencias/:id/cancelar` (contrato novo)

Body: `{ motivo: string }`. Gate atual mantido (`requirePermission('inventario')`).

| Caso | Status | Corpo |
|---|---|---|
| ok | 200 | `{ success: true }` (mesma resposta de hoje) |
| sem motivo / < 5 chars | 400 | `{ error: "Motivo do cancelamento e obrigatorio (minimo 5 caracteres)" }` |
| status ≠ ABERTO | 409 | `{ error: "Só é possível cancelar conferência em andamento. Status atual: <STATUS>." }` |
| id inexistente | 404 | `{ error: "Conferência não encontrada" }` (mensagem já usada no bloco — conferir o literal exato antes de escrever o teste) |

Grava `cancelado_por_id`, `cancelado_por_nome`, `cancelado_em = CURRENT_TIMESTAMP`,
`motivo_cancelamento`.

### C3 — colunas novas (`schema.js`, por `safeAlter`, junto das outras de conferência ~1736-1763)

`cancelado_por_id INTEGER`, `cancelado_por_nome TEXT`, `cancelado_em DATETIME`,
`motivo_cancelamento TEXT`.

### C4 — `aprovador_*` na conclusão

No UPDATE final (~1207), quando `aplicar_ajustes` for verdadeiro, incluir
`aprovador_id = ?`, `aprovador_nome = ?` com o usuário do ato. Sem ajustes, **não** tocar as
colunas (RN-05).

### C5 — gate do log

`GET /api/almoxarifado/auditoria` (`routes/almoxarifado/extended.js` ~1264) passa a ter
`requirePermission('configurar')` entre `auth` e o handler. 403 = padrão do módulo.

### C6 — os três atos vizinhos (RN-07)

| Ato | Arquivo:linha | `entidade` / `acao` | Carga |
|---|---|---|---|
| `DELETE /materiais/:id` (soft-delete) | `routes/almoxarifado.js` ~504 | `material` / `DESATIVACAO` | `dados_anteriores: { ativo: 1 }`, `dados_novos: { ativo: 0, codigo, nome }` |
| `PUT /requisicoes/:id/cancelar` | ~2725 | `requisicao` / `CANCELAMENTO` | `dados_anteriores: { status }`, `dados_novos: { status: 'CANCELADA', numero }`, `justificativa` se o body tiver |
| `DELETE /requisicoes/:id` | ~2751 | `requisicao` / `EXCLUSAO` | `dados_anteriores: { status, numero }`, `dados_novos: { estornos: N }` (a rota já sabe quantas entregas estornou) |

**Atenção:** confirmar os literais de status e os nomes de campo lendo o handler — o plano
cita linhas aproximadas de propósito; o executor confere.

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. Colunas + cancelar (motivo/status/autor) + as 5 auditorias da conferência | **tronco** | — |
| 2. `aprovador_*`, gate do log e os 3 atos vizinhos | **tronco** | Task 1 (mesmo arquivo de rotas) |
| 3. Front: cancelar conferência pede motivo | **galho** | contrato C2 |
| 4. Jornada: o log conta a história inteira | integração | Tasks 1+2 |

T1 e T2 tocam o MESMO arquivo (`routes/almoxarifado.js`) — sequenciais de propósito, não
paralelizáveis. T3 é client puro.

---

### Task 1 (tronco): colunas, cancelar e as 5 auditorias

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (C3),
  `server/routes/almoxarifado.js` (bloco `/conferencias`: 5 auditorias + cancelar novo)
- Test: `server/tests/api/conferenciaAuditoria.api.test.js`

**Interfaces:** Consumes: `registrarAuditoria(db, {...})` de `services/almoxarifado/audit.js`;
molde de auditoria best-effort de `scrapDisposalService.compensarAssinatura`; moldes de setup
dos testes de conferência existentes (`conferenciaTolerancia.api.test.js`,
`conferenciaDuplaContagem.api.test.js`). Produces: C1, C2, C3.

- [ ] **Step 1: escrever o teste que falha** — cenários:
  1. **RN-01 criar:** `POST /conferencias` → 1 linha `conferencia`/`CRIACAO` com
     `entidade_id` = id da conferência, autor certo e `total_itens` batendo.
  2. **RN-01 contar:** contar um item → 1 linha `CONTAGEM` com material, quantidade e
     divergência; **RN-04:** contar de novo o MESMO item (correção do próprio contador) →
     `dados_anteriores` traz a quantidade anterior.
  3. **RN-01 recontar:** com `dupla_contagem`, outro usuário reconta → linha `RECONTAGEM`
     com o de/para e os dois nomes.
  4. **RN-01 concluir:** concluir com ajuste → linha `CONCLUSAO` com
     `ajustesAplicados`/`impactoFinanceiro`/`justificativa`; concluir sem ajuste → linha
     igualmente presente com `aplicar_ajustes:false`.
  5. **RN-03:** cancelar sem motivo → 400 literal e **nenhuma** linha nem mudança de status;
     motivo curto → 400; cancelar ABERTA com motivo → 200, colunas gravadas
     (`cancelado_por_id/nome`, `cancelado_em`, `motivo_cancelamento`) e linha
     `CANCELAMENTO`; cancelar CONCLUIDA → 409 literal.
  6. **RN-02:** stubar `audit.registrarAuditoria` para lançar (guardar/restaurar no
     `finally`) e conferir que criar/contar/concluir/cancelar **respondem normal** e gravam
     tudo; fila de log vazia. (Os handlers chamam pelo objeto do módulo — se alguém
     desestruturar, este teste denuncia.)
- [ ] **Step 2: rodar e ver falhar** (`cd server && node tests/api/conferenciaAuditoria.api.test.js`).
- [ ] **Step 3: implementar** — colunas por `safeAlter`; cancelar com motivo/status/autor; as
  5 auditorias nos pontos do C1, cada uma com `.catch`.
- [ ] **Step 4: verde + controle positivo** — sabotar a guarda de status do cancelar
  (aceitar qualquer status) e ver o cenário 5 falhar; reverter. Rodar `npm run test:api`.
- [ ] **Step 5: commit** — `Almoxarifado Etapa 18 Task 1: a conferencia passa a deixar rastro`.

### Task 2 (tronco): `aprovador_*`, gate do log e os 3 atos vizinhos

**Files:**
- Modify: `server/routes/almoxarifado.js` (C4 + C6), `server/routes/almoxarifado/extended.js` (C5)
- Test: `server/tests/api/auditoriaAtosEGate.api.test.js`

**Interfaces:** Consumes: C1 (padrão já estabelecido pela T1), `requirePermission`.

- [ ] **Step 1: teste que falha** — RN-05 (`aprovador_*` preenchidos SÓ com ajuste; sem
  ajuste ficam nulos); RN-06 (matriz de 8 perfis no `GET /auditoria`, usuários com
  `role:'usuario'` e `perfil_almoxarifado` — NUNCA `role:'admin'`, senão a matriz passa
  vazia); RN-07 (os três atos, cada um com sua linha e o de/para do C6).
- [ ] **Step 2: rodar e ver falhar; implementar; verde.**
- [ ] **Step 3: controle positivo** — remover `requirePermission('configurar')` do
  `GET /auditoria` e ver a matriz falhar; reverter. `npm run test:api` inteiro.
- [ ] **Step 4: commit** — `Almoxarifado Etapa 18 Task 2: aprovador gravado, log gateado e tres atos vizinhos auditados`.

### Task 3 (galho): cancelar conferência pede motivo

**Files:**
- Modify: `client/src/components/almoxarifado/ConferenciaEstoque.js` (o botão/fluxo de
  cancelar) + o teste correspondente (achar o arquivo de teste da tela; se não houver,
  criar `ConferenciaEstoque.cancelar.test.js` no padrão das telas vizinhas)

**Interfaces:** Consumes: C2 (mock de fronteira HTTP legítimo).

- [ ] **Step 1: teste que falha** — cancelar sem motivo não chama a API e mostra o aviso;
  com motivo, o `PUT` sai com `{ motivo }`; erro 409 do servidor aparece para o usuário.
- [ ] **Step 2: implementar no padrão da casa** (o módulo já tem cancelamentos com
  justificativa — ex.: solicitação de compra na tela de Reposição: confirmação + prompt de
  justificativa, com o vazio barrado ANTES da chamada). Seguir aquele padrão, não inventar.
- [ ] **Step 3: suíte client + build `CI=true`; commit** —
  `Almoxarifado Etapa 18 Task 3: cancelar conferencia pede motivo`.

### Task 4 (integração): a história inteira no log

**Files:** Test: `server/tests/api/conferenciaAuditoriaJornada.api.test.js`

- [ ] **Step 1: jornada** — abrir conferência (2 itens) → contar os dois → corrigir um →
  recontar o outro com segundo usuário → concluir aplicando ajuste → `GET /auditoria?
  entidade=conferencia&entidade_id=N` (como ADMIN) devolve a sequência **em ordem**
  (`CRIACAO`, `CONTAGEM`×2, `CONTAGEM` de correção com de/para, `RECONTAGEM`, `CONCLUSAO`),
  com autores corretos; e o saldo do material bate com o ajuste (o motor rodou de verdade).
- [ ] **Step 2: rodar; controle positivo** (sabotar a ordem do `ORDER BY` da rota de
  auditoria, ou remover uma das 5 auditorias, e ver a jornada falhar); reverter;
  `npm run test:api`; commit — `Almoxarifado Etapa 18 Task 4: jornada da trilha do inventario`.

---

## Self-review do plano (feito na escrita)

- Cobertura: RN-01..07 têm task e teste nomeados. As correções das specs 03 e 23 ficam para a
  Fase 6 (fechar-etapa) — não são task de executor, mas **não podem ser esquecidas**: são o
  item mais importante do fechamento desta etapa (documentação que descreve bug morto).
- T1→T2 sequencial porque tocam o mesmo arquivo; T3 é o único paralelizável e é client puro.
- Risco declarado: o bloco `/conferencias` é inline e grande; o executor deve **acrescentar**
  e nunca reorganizar — refatoração junto com mudança de comportamento esconde defeito.
- Ponto de atenção do C2: o literal do 404 do bloco de conferências precisa ser LIDO do
  código antes de virar teste (o plano não o congela de memória — lição das etapas anteriores,
  em que literais escritos de cabeça não existiam).

## Execução (estado)

- [ ] Fase 2 — revisão do plano por agente fresco
- [ ] Task 1 (tronco)
- [ ] Task 2 (tronco)
- [ ] Task 3 (galho)
- [ ] Task 4 (integração)
- [ ] Fase 4 — suíte completa serial
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro (**incluindo a correção das specs 03 e 23**)

## Retro (4 números — preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou (preencher na etapa seguinte): —
