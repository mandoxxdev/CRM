# Almoxarifado Etapa 18 — Auditoria da conferência: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ciclo do inventário passa a deixar rastro (5 atos auditados), cancelar exige
motivo e grava autor, `aprovador_*` deixam de ser colunas mortas, três atos vizinhos ganham
auditoria e a rota de leitura do log ganha gate.

**Architecture:** auditoria **pós-escrita e best-effort** (`.catch` — nunca derruba o ato já
efetivado), no molde de `routes/almoxarifado.js:481-483` (try/catch com `console.error` e o
comentário dizendo por que silêncio total é ruim). Sem serviço novo: o bloco `/conferencias`
é inline na rota e esta etapa **não** o refatora (mudança de estrutura junto com mudança de
comportamento esconde defeito).

**Tech Stack:** Express + SQLite, `registrarAuditoria` (`services/almoxarifado/audit.js`),
`safeAlter` do schema, supertest; React CRA (só o fluxo de cancelar).

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa18-auditoria-conferencia-design.md`

## Global Constraints

- Os das etapas 16/17 (harness real com `requirePermission`, testes só em
  `server/tests/api/*.api.test.js`, controle positivo obrigatório, commits pt sem acento, um
  assunto por commit, `git add` explícito, `CI=true` sem warning).
- **O motor de estoque não é tocado.** A conclusão continua aplicando ajuste por
  `AJUSTE_INVENTARIO` exatamente como hoje.
- **Nada de refatorar o bloco `/conferencias` para service nesta etapa** — só acrescentar.
  Ampliar um `SELECT` existente e converter uma rota de callback para `async` **contam como
  acrescentar** (são exigidos pelos contratos abaixo).
- Toda auditoria nova é **pós-escrita**, envolvida em try/catch com `console.error` (RN-02).
  Nenhuma auditoria "de tentativa" (antes do efeito).
- Asserções de auditoria sempre por `entidade` + `acao` + `entidade_id`, nunca por contagem
  global da tabela.
- **Mensagens de API são ACENTUADAS** (a regra "sem acento" do CLAUDE.md vale para corpo de
  commit, não para texto de usuário — molde: `routes/almoxarifado.js:1072`).

## Regras de negócio (RN) — enunciado completo no design

| ID | Resumo |
|---|---|
| RN-01 | Criar (**inclusive conferência sem nenhum item**), contar, recontar, concluir e cancelar geram linha `entidade='conferencia'` com autor e `entidade_id` |
| RN-02 | Auditoria nunca derruba o ato (falha → o ato responde normal) |
| RN-03 | Cancelar exige `motivo` (≥5) e só vale em ABERTO; grava autor, data e motivo |
| RN-04 | Contagem que sobrescreve a anterior guarda o de/para em `dados_anteriores` |
| RN-05 | `aprovador_*` só preenchidos na conclusão COM `aplicar_ajustes` |
| RN-06 | `GET /auditoria` exige `configurar` |
| RN-07 | Desativar material, cancelar requisição e excluir requisição auditam |

## Contratos congelados

> **Todos os contratos abaixo foram conferidos contra o código pela revisão da Fase 2 e
> CORRIGIDOS.** A primeira versão listava campos "em escopo" que não estavam — o executor
> pode confiar nas notas de escopo daqui, mas continua obrigado a ler o handler antes de
> escrever cada teste.

### C0 — pré-requisito de import (achado 1 da revisão, BLOQUEANTE)

`routes/almoxarifado.js:38` hoje é `const { registrarAuditoria } = require('../services/almoxarifado/audit');`
— binding `const` resolvido no require e cacheado. **O teste de RN-02 não conseguiria stubar
nada** (passaria verde sem jamais derrubar auditoria: teste vazio).

**Passo obrigatório do Step 3 da Task 1:** trocar por
`const audit = require('../services/almoxarifado/audit');` e usar
`audit.registrarAuditoria(...)` **nas chamadas novas**. As chamadas antigas do arquivo podem
continuar com o binding desestruturado (mantendo `registrarAuditoria` também importado) — a
etapa não reescreve o que já funciona; o que importa é que os 5 pontos novos e os 3 do C6
sejam alcançáveis pelo stub.

### C1 — as 5 auditorias da conferência

`entidade: 'conferencia'`, `entidade_id`: id da conferência, `usuario_id`/`usuario_nome` do
`req.user`.

| `acao` | Ponto exato | `dados_anteriores` | `dados_novos` |
|---|---|---|---|
| `CRIACAO` | **ANTES do `return res.status(201)` do ramo "zero materiais"** (`routes/almoxarifado.js:925-934`) e também no ramo normal — na prática: extrair um ponto único depois do INSERT dos itens que os dois ramos alcancem (achado 4: o ponto original pulava a conferência sem itens, furando a RN-01) | — | `{ numero, escopo_descricao, modo_cego, dupla_contagem, tolerancia_percentual, total_itens }` — variáveis reais: `escopoDescricao`, `modoCegoValor`, `duplaContagemValor`, `toleranciaValor`, `materiais.length`. **`tipo` NÃO entra** (achado 3: é a 3ª coluna morta da tabela; ver "Achados vizinhos") |
| `CONTAGEM` | após o UPDATE do item (~1022), quando `!marcaRecontagem` | `{ quantidade_contada, contado_por_nome }` da linha antiga **quando havia contagem** (RN-04 — é o caso "correção", que só existe com `dupla_contagem`); senão `null` | `{ conferencia_numero, item_id, material_codigo, quantidade_sistema, quantidade_contada, divergencia }` |
| `RECONTAGEM` | mesmo ponto, quando `marcaRecontagem` | `{ quantidade_contada, contado_por_nome }` da linha antiga — **NÃO afirmar que é "de outra pessoa"**: sem `dupla_contagem`, a 2ª contagem do MESMO usuário cai aqui (achado 6) | idem `CONTAGEM` + `{ recontado_por_nome }` (variável `autorNome`) |
| `CONCLUSAO` | após o UPDATE final (~1207-1209), **antes** do gancho de alerta (~1211) | — | `{ numero, aplicar_ajustes, ajustesAplicados, impactoFinanceiro, itens_contados, itens_divergentes, tolerancia_percentual, modo_cego, dupla_contagem }`; `justificativa: justificativa_ajuste \|\| null`. **Todas as 9 já estão em escopo** (`conf` vem de `SELECT *`; `itens_contados` = `todosItens.length`; `itens_divergentes` = `ajustes.length`; `tolerancia_percentual` = a variável **`tolerancia`**, a efetiva que governou a decisão — achado 17b) |
| `CANCELAMENTO` | após o `dbRun` do UPDATE, na rota reescrita (ver C2) | `{ status: 'ABERTO' }` | `{ numero, itens_contados }` — **os dois exigem consulta**: `numero` vem do `dbGet` que o C2 já obriga; `itens_contados` de um `SELECT COUNT(*) ... WHERE quantidade_contada IS NOT NULL` (achado 7) |

**Ampliações de SELECT obrigatórias** (achado 5 — os campos NÃO estão em escopo hoje):
- `routes/almoxarifado.js:971` — `SELECT status, dupla_contagem` → acrescentar `, numero`.
- `routes/almoxarifado.js:977-980` — o JOIN com `materiais_almoxarifado` → acrescentar
  `, ma.codigo AS material_codigo`.

**Distinção de ramo, congelada do código** (`routes/almoxarifado.js:988, 1004-1012`):
`ehRecontagem = item.quantidade_contada !== null`;
`ehCorrecaoDoPrimeiro = conf.dupla_contagem && ehPrimeiroContador && !item.recontado`;
`marcaRecontagem = ehRecontagem && !ehCorrecaoDoPrimeiro`. **CONTAGEM = `!marcaRecontagem`,
RECONTAGEM = `marcaRecontagem`.** O `dados_anteriores` é obtível nos dois: `item` é lido na
977, antes do UPDATE da 1022 (o código já depende disso na 988).

Todas as chamadas em try/catch com `console.error` (RN-02).

### C2 — `PUT /conferencias/:id/cancelar` (rota reescrita)

Hoje (`routes/almoxarifado.js:1235-1242`) é um `db.run` de uma linha em estilo callback, com
`status='ABERTO'` embutido no WHERE e um 400 genérico cobrindo "não existe" e "não está
aberta" indistintamente. **Reescrever como `async`** (exigido pelo gate de status e pelos
campos do log):

1. `dbGet` da conferência (`SELECT id, numero, status`) → ausente: **404**
   `{ error: 'Conferência não encontrada' }` (literal já usado em 772/972/1078). *(Nota: hoje
   esse caso devolve 400; introduzir o 404 é mudança de comportamento **deliberada**, sem
   teste existente que a trave.)*
2. `motivo` ausente ou `String(motivo).trim().length < 5` → **400**
   `{ error: 'Motivo do cancelamento deve ter pelo menos 5 caracteres' }` (molde da régua
   irmã, `routes/almoxarifado.js:1072`; achado 9 — mensagem acentuada).
3. `status !== 'ABERTO'` → **400**
   `` { error: `Conferência não está aberta (status atual: ${conf.status})` } `` — **o mesmo
   literal e o mesmo código das duas rotas irmãs** (973-975 e 1083-1085, esta última com
   comentário dizendo que a padronização foi deliberada). **Descartado o 409** que a primeira
   versão deste plano propunha: no módulo, 409 é reservado a unicidade/corrida
   (`extended.js:130,228,280,301,885,894`) — seria um terceiro texto para a mesma semântica
   (achado 8).
4. `dbRun` do UPDATE: `status='CANCELADO'`, `cancelado_por_id`, `cancelado_por_nome`,
   `cancelado_em = CURRENT_TIMESTAMP`, `motivo_cancelamento`.
5. `SELECT COUNT(*)` dos itens com `quantidade_contada IS NOT NULL` (para o log).
6. Auditoria C1 `CANCELAMENTO` em try/catch.
7. `res.json({ success: true })` — resposta de sucesso **inalterada**.

**Chamadores existentes que quebram com o motivo obrigatório** (achado 2 — atualizar no
mesmo commit, mandando `{ motivo: '...' }`):
- `server/tests/api/conferenciaTolerancia.api.test.js:131-132` (`.send({})`, espera 200)
- `server/tests/api/conferenciaAcuracidade.api.test.js:250-251` (sem `.send`, espera 200)
- `server/tests/api/permissoesRotas.api.test.js:185-186` (GESTOR → 200, `.send({})`)
  *(o caso PRODUCAO → 403 das linhas 168-178 continua válido: o gate roda antes do handler)*

### C3 — colunas novas (`schema.js`, `safeAlter`, junto do bloco de conferência 1733-1763)

`cancelado_por_id INTEGER`, `cancelado_por_nome TEXT`, `cancelado_em DATETIME`,
`motivo_cancelamento TEXT`.

### C4 — `aprovador_*` na conclusão

O UPDATE final (1207-1209) é template string única com 3 params. Incluir condicionalmente com
o mesmo truque de fragmento que o arquivo já usa em `camposAutoria` (1018-1023):
`aplicar_ajustes ? ', aprovador_id = ?, aprovador_nome = ?' : ''` + 2 params. Sem ajustes, as
colunas **não são tocadas** (RN-05).

### C5 — gate do log

`GET /api/almoxarifado/auditoria` (`routes/almoxarifado/extended.js:1264`) hoje tem só `auth`.
Passa a ter `requirePermission('configurar')` (ADMINISTRADOR, `permissions.js:74`).
**Verificado pela revisão:** nenhuma tela do client e nenhuma rota interna consomem essa rota
— nada quebra. 403 = padrão do módulo.

**Junto (achado 13):** trocar `ORDER BY created_at DESC` por
`ORDER BY created_at DESC, id DESC` (`extended.js:1271`). `created_at` tem resolução de
segundo e as auditorias de um mesmo ato empatam — sem o desempate, a jornada da Task 4 seria
flaky **e o controle positivo dela não saberia falhar**.

### C6 — os três atos vizinhos (RN-07)

| Ato | Arquivo:linha | `entidade`/`acao` | Como obter os dados |
|---|---|---|---|
| `DELETE /materiais/:id` (soft-delete `ativo=0`) | `routes/almoxarifado.js:503-511` | `material` / `DESATIVACAO` | **`SELECT id, codigo, nome, ativo` ANTES do UPDATE** (achado 12): se não existir, **não audita** (hoje a rota responde `success:true` mesmo para id inexistente — auditar cegamente criaria linha fantasma); `dados_anteriores: { ativo: <o valor real lido> }`, `dados_novos: { ativo: 0, codigo, nome }` |
| `PUT /requisicoes/:id/cancelar` | `routes/almoxarifado.js:2725-2747` | `requisicao` / `CANCELAMENTO` | status literal é **`'CANCELADO'`** (achado 10 — a 1ª versão dizia `'CANCELADA'`, que não existe; ver `:2735`). **A rota é callback aninhado e responde dentro de um `.finally()`** (`:2742-2744`, achado 16): encadear a auditoria na MESMA promessa, antes do `.finally` — não converter o handler |
| `DELETE /requisicoes/:id` | `routes/almoxarifado.js:2751-2760` | `requisicao` / `EXCLUSAO` | **`dbGet` de `status`/`numero` ANTES de chamar o serviço** (achado 11: o serviço não os devolve, e depois da chamada o status já virou CANCELADO); `dados_novos: { estornos: result.estornos.length }` — **`estornos` é ARRAY**, não número (`requisitionService.js:456`) |

## Achados vizinhos a registrar no fechamento (não são task)

- **`conferencias_almoxarifado.tipo` é a 3ª coluna morta** da tabela (`schema.js:1733`,
  `DEFAULT 'GERAL'`, nunca escrita por ninguém) — junto de `aprovador_id`/`aprovador_nome`,
  que esta etapa ressuscita. Nomear na spec 17/23; ligá-la é decisão de negócio (o que
  significaria "tipo" de conferência?).
- **O design dizia "os 8 arquivos de teste de conferência"; são 7** (achado 17a).

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. C0 + colunas + cancelar reescrito + as 5 auditorias | **tronco** | — |
| 2. `aprovador_*`, gate+ordem do log e os 3 atos vizinhos | **tronco** | Task 1 (mesmo arquivo de rotas) |
| 3. Front: cancelar conferência pede motivo | **galho** | C2 (já congelado — pode ir em paralelo com T2) |
| 4. Jornada: o log conta a história inteira | integração | Tasks 1+2 |

T1 e T2 tocam o MESMO arquivo (`routes/almoxarifado.js`) — sequenciais de propósito. T3 é
client puro e pode rodar junto com T2.

---

### Task 1 (tronco): C0, colunas, cancelar e as 5 auditorias

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (C3), `server/routes/almoxarifado.js`
  (C0 + 2 ampliações de SELECT + 5 auditorias + cancelar reescrito),
  `server/tests/api/conferenciaTolerancia.api.test.js`,
  `server/tests/api/conferenciaAcuracidade.api.test.js`,
  `server/tests/api/permissoesRotas.api.test.js` (os 3 chamadores do C2)
- Test: `server/tests/api/conferenciaAuditoria.api.test.js`

**Interfaces:** Consumes: `audit.registrarAuditoria` (C0); moldes de setup dos testes de
conferência (`conferenciaTolerancia`, `conferenciaDuplaContagem`); molde de try/catch de
auditoria em `routes/almoxarifado.js:481-483`. Produces: C0, C1, C2, C3.

- [x] **Step 1: escrever o teste que falha** (`3893444`) — cenários:
  1. **RN-01 criar:** `POST /conferencias` → linha `conferencia`/`CRIACAO` com `entidade_id`,
     autor e `total_itens`. **E o ramo de ZERO itens** (escopo que não casa material nenhum)
     → também audita (achado 4).
  2. **RN-01 contar + RN-04:** conferência **com `dupla_contagem: true`** (obrigatório — o
     ramo de correção só existe assim, achado 6): contar → `CONTAGEM`; o MESMO usuário conta
     de novo → `CONTAGEM` com `dados_anteriores` trazendo a quantidade anterior.
  3. **RN-01 recontar:** outro usuário reconta → `RECONTAGEM` com o de/para e
     `recontado_por_nome`. **E o caso sem dupla contagem:** 2ª contagem do mesmo usuário cai
     em `RECONTAGEM` (não em CONTAGEM) — congelar o comportamento real, sem afirmar "colega".
  4. **RN-01 concluir:** com ajuste → `CONCLUSAO` com `ajustesAplicados`/`impactoFinanceiro`/
     `justificativa`; sem ajuste → linha igualmente presente com `aplicar_ajustes:false`.
  5. **RN-03 (C2):** sem motivo → 400 literal, status inalterado, zero linha; motivo com 3
     chars → 400; ABERTA com motivo → 200, as 4 colunas gravadas e linha `CANCELAMENTO` com
     `numero` e `itens_contados`; CONCLUIDA → **400** com
     `Conferência não está aberta (status atual: CONCLUIDO)`; id inexistente → 404 literal.
  6. **RN-02:** stubar `audit.registrarAuditoria` para lançar (guardar/restaurar no
     `finally`) e conferir que criar/contar/concluir/cancelar **respondem normal e gravam
     tudo**. *(Só funciona por causa do C0 — se o executor pular o C0, este teste passa sem
     provar nada: é o teste vazio que a revisão pegou.)*
- [x] **Step 2: rodar e ver falhar** (`3893444`) — **0 passaram, 14 falharam**. O vermelho foi
  o esperado em toda a linha: as auditorias não existiam (`esperava 1 CRIACAO, veio 0`), o
  cancelar respondia `{"success":true}` para `.send({})`, `no such column: cancelado_por_id`
  nas colunas do C3, e o literal antigo `Só é possível cancelar conferências abertas`
  aparecendo tanto para conferência CONCLUIDA quanto para id inexistente (o 400 genérico que
  o C2 desfaz).
- [x] **Step 3: implementar** (`3893444`) — na ordem: C0 (import `audit` ao lado do
  desestruturado, com o porquê no comentário) → C3 (4 colunas por `safeAlter`) → os 2 SELECTs
  (`numero` na 971, `ma.codigo AS material_codigo` na 977) → 5 auditorias → cancelar reescrito
  como `async` → os 3 chamadores do C2. **Divergência de implementação (menor, deliberada):**
  o ponto único da CRIACAO saiu invertendo a guarda (`if (materiais.length > 0) { INSERT }`),
  auditando em seguida e só então escolhendo entre os dois `res.status(201)` — os DOIS corpos
  de resposta ficam byte a byte iguais (o ramo zero continua mandando `itens: []`), o que uma
  unificação dos returns teria mudado.
- [x] **Step 4: verde + controle positivo** (`3893444`) — **14/14**. Sabotagem: `if (false &&
  conf.status !== 'ABERTO')` no cancelar → **13/14**, com o cenário 5 vermelho exatamente onde
  devia (`RN-03 cancelar: CONCLUIDA -> 400 ... esperava 400, veio 200: {"success":true}`);
  revertido, `grep "false &&"` vazio e 14/14 de novo. `npm run test:api` inteiro:
  **132/132 arquivos**. Os 3 tocados individualmente: `conferenciaTolerancia` 6/6,
  `conferenciaAcuracidade` 13/13, `permissoesRotas` 46/46. Extras pelas colunas novas:
  `test:safealter` 3/3, `test:almoxarifado` 42/42.
- [x] **Step 5: commit** (`3893444`) — `Almoxarifado Etapa 18 Task 1: a conferencia passa a deixar rastro`.

### Task 2 (tronco): `aprovador_*`, gate+ordem do log e os 3 atos vizinhos

**Files:**
- Modify: `server/routes/almoxarifado.js` (C4 + C6), `server/routes/almoxarifado/extended.js` (C5)
- Test: `server/tests/api/auditoriaAtosEGate.api.test.js`

- [x] **Step 1: teste que falha** (`395caf3`) — 19 casos em
  `server/tests/api/auditoriaAtosEGate.api.test.js`: RN-05 (com ajuste grava; sem ajuste fica
  nulo; **e sem ajuste não TOCA um `aprovador_*` já preenchido** — o terceiro caso é o que
  separa "não gravar" de "gravar null", que apagaria uma homologação anterior); RN-06 (matriz
  de 8 perfis — os 7 do `PERFIS` mais o usuário **sem perfil**, que cai no fallback PRODUCAO —
  todos com `role:'usuario'`); RN-07 (os três atos, mais "id inexistente não audita" no DELETE
  de material, "material já inativo registra `ativo: 0` real", "cancelamento recusado pela
  máquina de estados não audita" e "DELETE de requisição inexistente → 404 sem auditoria");
  ordem estável do C5 com **empate forçado** (`UPDATE ... SET created_at = '<literal>'` nas
  duas linhas) — sem forçar, o teste dependeria da sorte de os dois atos caírem no mesmo
  segundo.
- [x] **Step 2: rodar e ver falhar; implementar; verde** (`395caf3`) — vermelho inicial
  **6 passaram, 13 falharam**. Os 6 que já passavam passavam **vazios**: são as asserções de
  *"não audita"* (id inexistente, transição recusada, 404) e as de `aprovador_*` nulo — todas
  verdadeiras num mundo onde nada auditava e nada escrevia a coluna. É por isso que o controle
  positivo do Step 3 mira a matriz, que é o bloco que não passa de graça. Implementado C4
  (fragmento condicional no UPDATE final, molde do `camposAutoria`), C5 (gate + desempate) e
  C6 (os três atos). Verde **19/19**.
- [x] **Step 3: controle positivo** (`395caf3`) — removido o `requirePermission('configurar')`
  do `GET /auditoria` → **12/19**, com os 7 perfis não-ADMINISTRADOR da matriz vermelhos
  (`esperava 403, veio 200` trazendo o log inteiro no corpo — a própria exposição que o gate
  fecha). Revertido; `git diff` do `extended.js` mostra só as mudanças pretendidas e **19/19**
  de novo. `npm run test:api` inteiro: **133/133 arquivos** (132 + o arquivo novo).
  `test:almoxarifado` 42/42.
- [x] **Step 4: commit** (`395caf3`) — `Almoxarifado Etapa 18 Task 2: aprovador gravado, log gateado e tres atos vizinhos auditados`.

### Task 3 (galho): cancelar conferência pede motivo

**Files:**
- Modify: `client/src/components/almoxarifado/ConferenciaEstoque.js` (fluxo de cancelar,
  linhas ~246-255 — hoje `window.confirm` puro e `api.put` sem corpo; botão em ~560)
- Modify: `client/src/components/almoxarifado/ConferenciaEstoque.test.js` (**o arquivo EXISTE,
  707 linhas, e não tem nenhum caso de cancelar** — achado 14: estender, NÃO criar arquivo
  irmão)

**Padrão a seguir — o do PRÓPRIO arquivo, não o de fora:** `ConferenciaEstoque.js:449-482` já
tem modal com textarea de justificativa e botão desabilitado até 5 caracteres
(`:480 disabled={... justificativaAjuste.trim().length < 5}`), com teste em
`ConferenciaEstoque.test.js:278-299`. É esse que casa com a régua ≥5 do C2. *(A primeira
versão do plano mandava seguir o `confirm`+`prompt` da tela de Reposição, que barra só vazio
— um motivo de 3 caracteres passaria pela tela e tomaria 400 do servidor.)*

- [ ] **Step 1: teste que falha** (dentro do arquivo existente) — abrir o modal de cancelar;
  botão desabilitado com motivo vazio e com 3 caracteres; com ≥5, o `PUT` sai com
  `{ motivo }`; erro do servidor (400 do status) aparece para o usuário.
- [ ] **Step 2: implementar no molde das linhas 449-482; suíte client + build `CI=true`;
  commit** — `Almoxarifado Etapa 18 Task 3: cancelar conferencia pede motivo`.

### Task 4 (integração): a história inteira no log

**Files:** Test: `server/tests/api/conferenciaAuditoriaJornada.api.test.js`

- [x] **Step 1: jornada** (`bc4046a`) — 5 casos em
  `server/tests/api/conferenciaAuditoriaJornada.api.test.js`, **tudo por rota real, zero mock**.
  Três atores `role:'usuario'` com perfil de verdade (com `role:'admin'` todos virariam
  ADMINISTRADOR e a jornada não provaria autoria contra os gates reais): Ana e Bruno
  ALMOXARIFE (têm `inventario`, **não** têm `ajustar_estoque`), Gisele GESTOR (homologa), e um
  quarto usuário ADMINISTRADOR só para ler o log (o único que passa no `configurar` do C5).
  Ana abre com `dupla_contagem` (2 itens) → conta os dois → corrige um (ramo
  `ehCorrecaoDoPrimeiro`, que continua `CONTAGEM` com de/para) → Bruno reconta o outro →
  Gisele conclui aplicando ajuste → `GET /auditoria?entidade=conferencia&entidade_id=N` como
  ADMINISTRADOR devolve as 6 linhas. **A tradução DESC→cronológica está explícita**: a rota
  ordena `created_at DESC, id DESC`, então a sequência dos fatos é o array `.reverse()`ado —
  com asserção de controle sobre as pontas (a mais nova primeiro) para que uma troca da rota
  para ASC derrube o teste em vez de passar despercebida, e com os `id` conferidos crescentes.
  O motor: saldo 100→**95** e 50→**46** (os valores CORRIGIDO/RECONTADO, não a primeira
  contagem — se o ajuste usasse o primeiro valor, o log estaria certo e o estoque errado), dois
  `AJUSTE_INVENTARIO` no ledger assinados pelo homologador e `aprovador_*` do C4 gravado.
- [x] **Step 2: rodar; controle positivo** (`bc4046a`) — **5/5 de primeira**. Controle positivo
  obrigatório: removida **só a auditoria de RECONTAGEM** (a de CONTAGEM compartilha a mesma
  chamada, então a sabotagem entrou no ramo `marcaRecontagem`) → **2/5**, com os três testes de
  log vermelhos e a mensagem certa (`a jornada tem 6 atos auditados; veio 5:
  ["CONCLUSAO","CONTAGEM","CONTAGEM","CONTAGEM","CRIACAO"]`). **Os 2 que sobreviveram
  sobreviveram com razão**, e isso é parte do resultado: o da jornada só afere respostas HTTP
  (RN-02 — auditoria quebrada não derruba o ato) e o do motor afere estoque, que a sabotagem não
  toca. Sabotar o `ORDER BY` foi **descartado de propósito**: com o desempate do C5 a ordem
  continuaria correta e a sabotagem seria no-op — a lição da Task 2 da Etapa 17. Revertido,
  `git diff` limpo (`grep SABOTAGEM` = 0) e 5/5 de novo. `npm run test:api` inteiro:
  **134/134 arquivos**. Commit `bc4046a` —
  `Almoxarifado Etapa 18 Task 4: jornada da trilha do inventario`.

---

## Self-review do plano (feito na escrita, revisado na Fase 2)

- Cobertura: RN-01..07 têm task e teste nomeados. As correções das specs 03 e 23 ficam para a
  Fase 6 — **são o item mais importante do fechamento** (documentação que descreve bug morto).
- T1→T2 sequencial (mesmo arquivo); T3 paraleliza com T2 por contrato congelado.
- Risco declarado: o bloco `/conferencias` é inline e grande; **acrescentar, nunca
  reorganizar** — exceto as duas ampliações de SELECT e a reescrita da rota de cancelar, que
  os contratos exigem e estão nomeadas.
- Todos os literais deste plano foram LIDOS do código (a revisão da Fase 2 conferiu um a um);
  o executor ainda assim confere antes de escrever cada teste.

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): **17 achados, 6 bloqueantes,
  todos acatados.** Os que mudavam o plano de verdade: (1) o teste de RN-02 era **impossível**
  — o arquivo desestrutura o import e o stub nunca pegaria, teste vazio garantido (→ C0);
  (2) 3 testes existentes quebrariam com o motivo obrigatório e nenhuma task os mencionava;
  (3) `tipo` não existe em escopo — é a 3ª coluna morta da tabela; (4) o ponto da auditoria
  de criação **pulava a conferência sem itens** (furo na própria RN-01); (5) `conferencia_numero`
  e `material_codigo` exigem ampliar dois SELECTs; (6) o ramo "correção do primeiro contador"
  só existe com `dupla_contagem` — o cenário de teste cairia no ramo errado; (7) a rota de
  cancelar é callback e não tem `numero` nem contagem de itens; (8) o 409 proposto
  contradizia duas rotas irmãs que já usam 400 com literal padronizado; (10-12) `'CANCELADA'`
  não existe (é `'CANCELADO'`), os dois DELETEs precisam de SELECT prévio e `estornos` é
  array; (13) o `ORDER BY` empata por segundo e o controle positivo da jornada não saberia
  falhar; (14) o teste da tela **já existe** e o padrão de justificativa está no próprio
  arquivo, não na tela de Reposição. O revisor confirmou que **todas as afirmações medidas do
  design da Fase 0 são verdadeiras**.
- [x] Task 1 (tronco) — `3893444` (2026-08-28). Vermelho inicial **0/14**, verde **14/14**;
  controle positivo (guarda de status do cancelar aceitando qualquer status) derrubou o
  cenário 5 → **13/14**, revertido e limpo. Suíte: **132/132 arquivos** em `npm run test:api`;
  os 3 chamadores atualizados do C2 continuam verdes (6/6, 13/13, 46/46) e as colunas novas
  não abalaram `test:safealter` (3/3) nem `test:almoxarifado` (42/42). Os contratos C0-C3
  fecharam **sem divergência de literal ou de linha** — todos os pontos que a revisão da Fase 2
  citou (971, 977, 1022, 1207-1209, 1235-1242, e os 3 testes com arquivo:linha) estavam onde o
  plano dizia. Única diferença de forma, registrada no Step 3: o ponto único da CRIACAO nasceu
  de inverter a guarda `materiais.length === 0` em vez de unificar os dois `res.status(201)`,
  para preservar os dois corpos de resposta exatamente como estavam.
- [x] Task 2 (tronco) — `395caf3` (2026-08-28). Vermelho inicial **6/19**, verde **19/19**;
  controle positivo (gate removido do `GET /auditoria`) derrubou os 7 perfis não-ADMINISTRADOR
  da matriz → **12/19**, revertido e limpo. Suíte: **133/133 arquivos** em `npm run test:api`;
  `test:almoxarifado` 42/42. Os contratos C4, C5 e C6 fecharam **sem divergência de literal**
  — as quatro correções que a revisão da Fase 2 tinha feito estavam todas certas contra o
  código (`'CANCELADO'` e não `'CANCELADA'`; `result.estornos` é array; o cancelar de
  requisição responde dentro de um `.finally()`; o DELETE de material responde `success` para
  id inexistente). Duas notas de execução:
  - **`DELETE /requisicoes/:id` virou `async`** (o C6 pedia só "`dbGet` antes do serviço"). A
    rota era `.then()/.catch()` de uma linha; o `dbGet` prévio dentro dela produziria uma
    terceira cadeia aninhada. O contrato externo é idêntico: mesmo 403, mesmo `res.json(result)`
    e o mesmo `e.status || 500`. O cancelar de requisição, esse sim, **não** foi convertido —
    ali a auditoria entrou encadeada na promessa existente, como o C6 manda.
  - **O vermelho inicial foi 6/19, não 0/19, e os 6 passavam vazios**: as asserções de "não
    audita" e de `aprovador_*` nulo são verdadeiras enquanto nada audita e nada escreve a
    coluna. Registrado aqui porque é exatamente a armadilha de teste vazio do CLAUDE.md — quem
    ler só o placar poderia achar que 6 cenários já estavam cobertos.
- [ ] Task 3 (galho)
- [x] Task 4 (integração) — `bc4046a` (2026-08-28). **5/5 de primeira** (é teste de integração
  sobre implementação já pronta: não há vermelho inicial a reportar, e por isso o controle
  positivo era a única prova de que o arquivo sabe falhar). Sabotagem: removida só a auditoria
  de RECONTAGEM → **2/5**, os três testes de log vermelhos; revertido e limpo. Suíte:
  **134/134 arquivos** em `npm run test:api` (133 + o arquivo novo). Três notas de execução:
  - **A ordem só é aferível por causa do desempate `, id DESC` do C5** — os 6 atos da jornada
    caem no mesmo segundo com folga. A rota devolve DESC, então a asserção cronológica é sobre
    o array invertido, e o `.reverse()` está explícito no teste com controle nas duas pontas.
  - **Sabotar o `ORDER BY` foi descartado**: com o desempate ela seria no-op — exatamente o
    defeito da sabotagem prescrita na Task 2 da Etapa 17. A prova forte é a linha que some.
  - **Dois testes sobreviveram à sabotagem, e isso é resultado, não falha**: o da jornada só
    afere respostas HTTP (é a RN-02 em ação — auditoria quebrada não derruba o ato) e o do
    motor afere saldo/ledger. Registrado aqui para que ninguém leia `2/5` como cobertura frouxa.
- [x] Task 3 (galho) — commit `daf67fd`, merge `5bd36ac`. Base da worktree nasceu errada pela
  **quarta vez** nesta sessão e a checagem obrigatória pegou antes do código. Seguiu o padrão
  do PRÓPRIO arquivo (modal com gate de 5 caracteres), não o `prompt` de outra tela; controle
  positivo afrouxou a régua para o modo de falha que o plano nomeava (barrar só vazio) e o
  caso de 3 caracteres caiu. Client 530/530; build limpo. Decisões registradas pelo executor:
  o modal fica aberto na recusa do servidor (quem toma 400 não redigita), botão secundário
  "Voltar" (em modal de cancelamento, "Cancelar" é ambíguo).
- [x] Fase 4 — merge do galho (`5bd36ac`) + suíte completa serial na branch (2026-08-28):
  `test:api` **134/134**, `test:almoxarifado` **42/0**, `test:validation` **4/0**,
  `test:safealter` **3/0**, `test:sqlite` **3/0**; client **530 testes em 36 suítes**,
  build `CI=true` exit 0.
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro (**incluindo a correção das specs 03 e 23**)

## Retro (4 números — preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou (preencher na etapa seguinte): —
