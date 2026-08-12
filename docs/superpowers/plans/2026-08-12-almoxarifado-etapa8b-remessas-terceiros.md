# Almoxarifado Etapa 8b — Remessas para Terceiros: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o material que a GMP manda beneficiar fora (corte, dobra, usinagem, tratamento, pintura,
galvanização) deixa de sumir do controle: ganha uma **quarta coluna de retenção**
(`materiais_almoxarifado.quantidade_em_terceiros`) que o tira do disponível **sem** tirá-lo do
patrimônio, um documento de remessa com máquina de estados
(`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA`), retorno parcial vinculado ao item
enviado, encerramento com **destino obrigatório** para o que não voltou, e tela própria com PDF do
documento de remessa.

**Architecture:** a conta do disponível — hoje **replicada 13 vezes em SQL**, em 8 arquivos —
passa a existir num único lugar (`services/almoxarifado/availabilitySql.js`), e é *essa
centralização* que torna a quarta coluna segura (Task 1). O ciclo da remessa mora em dois módulos
novos no molde já validado do módulo: `thirdPartyStateMachine.js` (objeto declarativo +
`validarTransicao`, molde de `requisitionStateMachine.js`) e `thirdPartyService.js` (pré-checagem
que recusa a remessa inteira + efeito item a item com claim no `WHERE`, molde de
`receiptService.darEntradaEstoque`). O efeito de saldo acontece **dentro do motor**, por quatro
tipos de movimento novos — dois de retenção (`REMESSA_TERCEIRO`/`RETORNO_TERCEIRO`, molde de
`QUARENTENA`/`DESBLOQUEIO`) e dois de baixa definitiva (`PERDA_TERCEIRO`/`CONSUMO_TERCEIRO`, que
baixam físico e retenção no **mesmo** UPDATE, molde de `DECISAO_INSPECAO`). PDF e tela 100% no
client, zero mudança de servidor para PDF.
Design aprovado: `docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md`.

**Tech Stack:** Express + sqlite3 (sem transações — compensação explícita é o idioma do motor), Zod
via `validate(schema)`, testes de API com supertest + harness `server/tests/helpers/testApp.js`
(runner artesanal: `test()`, contador, `process.exit`), React CRA com testes `createRoot` + mocks
(sem @testing-library), `jspdf` no navegador para PDF.

---

## Ponto de partida: Etapas 7 e 8 já estão entregues

**Este plano é executado DEPOIS da Etapa 8**
(`docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`, `f26b635..5b5eb55`).
O estado do código que este plano assume como existente e **não** reimplementa:

- `materiais_almoxarifado.proprietario_cliente_id` (`NULL` = material nosso) e a auditoria nomeada
  das **40 leituras** da tabela, classificadas em A/B/C na Task 1 daquele plano — **reusar a lista,
  não refazer o grep** (decisão 2 do design da 8b);
- guarda do dono em `services/almoxarifado/ownerRules.js` (`TIPOS_ISENTOS_DONO`,
  `TIPOS_SAIDA_COM_DONO`, `assertSaidaPermitida`, `assertAjustePermitido`);
- ação de perfil `ajustar_material_cliente` em `ACAO_PERFIS`, e o precedente de expor ação nova em
  `GET /almoxarifado/minhas-permissoes`;
- `TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE']` em `schema.js`, filtrado por `TIPOS_MOVIMENTO_ROTA` em
  `schemas.js`;
- `clientes` **stubada no harness** (`tests/helpers/testApp.js`) — nunca por fallback na query;
- `client/src/utils/posicaoClientePdf.js` (montador puro + renderizador `jspdf`) e a tela
  `client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js`.

Gates verdes na entrada desta etapa (medidos em 2026-08-12): `test:api` **68/68 arquivos**,
`test:almoxarifado` **42 passou / 0 falhou**, `test:validation` **4/0**, `test:safealter` **3/0**,
`test:sqlite` **3/0**; client **234 testes / 22 suítes**, build `Compiled successfully.`

Se ao começar a Task 1 alguma dessas peças **não** estiver no código, **pare e reporte** — este
plano foi escrito contra esse estado.

---

## A conta do disponível: 14 implementações, em 8 arquivos

O design nomeia a armadilha certa (a subtração do disponível está replicada em SQL, não
centralizada). A primeira versão dele dizia **sete** sítios; a varredura completa achou
**quatorze**, e o design foi corrigido (`742b9ea`). Lista reconferida de forma independente por
este plano em 2026-08-12
(`grep -rn "quantidade_em_inspecao" server --include=*.js`, excluindo `server/tests/` e `schema.js`):

| # | Arquivo:linha | O que a conta alimenta |
|---|---|---|
| 1 | `services/almoxarifado/stockService.js:22-27` | `getSaldoDisponivel` (função JS) |
| 2 | `services/almoxarifado/stockService.js:892` | claim atômico da saída **consumindo reserva** |
| 3 | `services/almoxarifado/stockService.js:912` | claim atômico da saída normal |
| 4 | `services/almoxarifado/stockService.js:1351` | `cancelarMovimentacao` — reverter entrada |
| 5 | `services/almoxarifado/stockService.js:1631-1632` | guarda do hold em `criarReserva` |
| 6 | `services/almoxarifado/stockService.js:1748` | `consultarEstoque` → `quantidade_disponivel` |
| 7 | `services/almoxarifado/requisitionStateMachine.js:97-99` | `calcularStatusPosAprovacao` |
| 8 | `services/almoxarifado/requisitionService.js:101` | `carregarItensRequisicao` → `saldo_disponivel` |
| 9 | `services/almoxarifado/requisitionService.js:115` | `saldoDisponivelParaItem` (separar/entregar) |
| 10 | `services/almoxarifado/reportService.js:8` | `relatorioEstoqueAtual` → `disponivel` |
| 11 | `services/almoxarifado/clienteEstoqueService.js:49` | posição por cliente → `saldo_disponivel` |
| 12 | `routes/almoxarifado/extended.js:455` | extrato do material → `quantidade_disponivel` |
| 13 | `routes/almoxarifado.js:1891` | detalhe da requisição → `saldo_atual` |
| 14 | `routes/requisicoesMaterial.js:260` | itens da requisição do solicitante → `saldo_atual` |

Dois sítios merecem destaque porque ninguém pensaria em olhar:

- **`clienteEstoqueService.js:49` é nosso, criado na própria Etapa 8.** Esquecê-lo faria a posição
  por cliente mostrar disponível **a mais** para material de cliente que está no terceiro — logo
  depois de a Etapa 8 ter feito a auditoria inteira de segregação por dono. Tem teste próprio na
  Task 1.
- **`routes/requisicoesMaterial.js:260` não pertence ao módulo almoxarifado.** É a tela do
  solicitante. Uma varredura restrita a `services/almoxarifado/` + `routes/almoxarifado*` não o
  encontra.

> ### Regra que fica registrada para a Etapa 8c e as seguintes
>
> **Mudança em coluna de `materiais_almoxarifado` exige varredura de `server/` INTEIRO — nunca de
> um subconjunto escolhido por intuição.** É o **segundo** erro do mesmo tipo nesta sequência: a
> spec da Etapa 8 mandou auditar `services/almoxarifado/*.js` + `routes/almoxarifado/*.js` e deixou
> de fora `server/routes/almoxarifado.js`, onde estavam as duas piores leituras (o dashboard e o
> `posicao-estoque`) — corrigido em `9d70d8c`. Agora o mesmo erro se repetiu com a conta do
> disponível. A Task 1 fecha essa porta de vez: em vez de enumerar edições, ela cria a fonte única
> e **prova por varredura do código-fonte** que sobrou zero. "Editei os 14" depende de eu ter
> contado certo; "sobrou zero" não depende.

**Um sítio fica de fora DE PROPÓSITO, e não é esquecimento:** `stockService.js:686-689`
(`dispSemBloqueio = quantidade_atual − quantidade_bloqueada`, mensagem "Material bloqueado não pode
ser utilizado"). Não é a conta do disponível — é uma guarda específica de bloqueio, com mensagem
própria. Ela continua correta com a coluna nova porque a guarda do disponível, logo acima, já
recusou qualquer saída que invadisse `quantidade_em_terceiros`. **Confirmado na execução da Task 1
(`0a01124`): não foi alterado.**

### O que a execução da Task 1 (`0a01124`) achou que este plano não previa

Três coisas, registradas aqui porque a **Etapa 8c reabre a mesma pergunta**:

1. **A contagem de arquivos era 7 e é 8.** Os 13 sítios em SQL moram em `stockService`,
   `requisitionService`, `requisitionStateMachine`, `reportService`, `clienteEstoqueService`,
   `routes/almoxarifado.js`, `routes/almoxarifado/extended.js` e `routes/requisicoesMaterial.js`.
   Corrigido no texto acima e no design. O número **14 sempre esteve certo** — o que estava errado
   era só o agrupamento por arquivo.
2. **Coluna nova de `materiais_almoxarifado` vaza para o requisitante até ser nomeada.**
   `GET /api/requisicoes-material/materiais` faz `SELECT m.*` e passa o resultado por
   `stockAvailabilityService.sanitizeMaterialForSector`, que apaga as três retenções antigas por
   uma **lista explícita** (`SENSITIVE_MATERIAL_FIELDS`). `quantidade_em_terceiros` entrou na
   lista na Task 1. **A 8c tem de repetir esta checagem para qualquer coluna nova.**
3. **`projetos` e `ordens_servico` não estão no harness.** `clienteEstoqueService` faz `LEFT JOIN`
   nelas e o `testApp.js` só stuba `clientes`. Padrão seguido (o mesmo de
   `materialClientePosicao.api.test.js`): **stub no arquivo de teste, nunca fallback na query** —
   fallback esconderia em teste um erro que existiria em produção.

---

## Global Constraints

- Commits em **português, corpo sem acento**, explicando o **porquê** (o bug, a consequência, o que
  foi decidido e descartado); um commit por assunto; **nunca `git add -A`** — listar os arquivos (há
  artefatos de runtime em `server/data/` e `server/uploads/`). Todo commit termina com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **`quantidade_em_terceiros` é a única das quatro retenções que significa "não está no prédio".**
  Reservada, bloqueada e em_inspeção são estados administrativos de material que **está** na
  prateleira. Essa distinção decide a Task 2 (só ela sai da contagem de inventário) e **tem de estar
  comentada no código**, senão o próximo leitor "uniformiza as quatro" e quebra a contagem.
- Almoxarifado é **área física, não filial**. Esta etapa **não** segrega saldo por almoxarifado; a
  segregação nova é por **estar ou não no prédio**, que é outra coisa.
- `fornecedores` é criada em `server/index.js`, **não** pelo `initSchema` do almoxarifado — pode não
  existir. Padrão do módulo: `fornecedor_id INTEGER` **sem FK** + `fornecedor_nome TEXT` espelhado
  (`lotes_almoxarifado`, `recebimentos_material_almoxarifado`); leitura protegida por consulta a
  `sqlite_master` (`receiptService.listarFornecedoresAux:683-687`). No teste, **stub no harness,
  nunca fallback na query** — fallback esconde em teste um erro que existiria em produção (lição da
  Etapa 8 com `clientes`).
- Chave não declarada no schema Zod é **descartada em silêncio** (`validation.js` troca `req.body`
  pelo parsed) — todo campo novo de API precisa entrar no schema correspondente.
- O motor não tem transações: todo efeito multi-passo segue claim-no-`WHERE` + compensação explícita.
- Quem decide é sempre o **backend**. `GET /almoxarifado/minhas-permissoes` existe só para a UI
  barrar antes do formulário e **falha aberto** de propósito.
- `getPerfilFromUser` faz fallback para `PRODUCAO` — usuário sem perfil **não** é "sem acesso", é
  chão de fábrica. Todo teste de negativa de permissão usa perfil explícito
  (`perfil_almoxarifado: 'PRODUCAO'` ou `'CONSULTA'`), nunca "usuário sem perfil".
- **Controle positivo bilateral é obrigatório em toda regra de segregação/recusa.** Nesta base já se
  comprovou **cinco vezes** que teste só de recusa aprova implementação que barra tudo, e que a
  metade de exclusão sozinha aprova leitura zerada. Cada task abaixo traz as sabotagens a executar
  com o resultado esperado.
- `quantidade_em_terceiros` é **gerida pelo motor**: não entra em `MaterialSchema`/`MaterialUpdateSchema`
  e não é editável por POST/PUT de material.
- **Fora do escopo, declarado (decisão 10 do design):** e-mail de envio/retorno (feature 19), alerta
  automático de atraso (feature 20) e anexo de desenhos nos itens. A 8b **grava o prazo previsto** e
  a tela **destaca remessa vencida**; o disparo automático é da 19/20.
- **Fora do escopo, declarado (decisão 1 e 7 do design):** a **transformação** (chapa → peças
  cortadas + sobra) é a **Etapa 8c**. A 8b não a implementa, mas **não fecha a porta dela**: o
  retorno já nasce como *lista de resultados* (`retornos_remessa_item_almoxarifado`) e não como
  escalar "quantidade que voltou".
- Suítes: `cd server && npm run test:api` · `npm run test:almoxarifado` · `npm run test:validation`
  · `npm run test:safealter` · `npm run test:sqlite`; `cd client && CI=true npx react-scripts test
  --watchAll=false` e `CI=true npx react-scripts build` (CI=true faz warning virar erro).
- Um arquivo de teste só: `cd server && node tests/api/<arquivo>.api.test.js`.

## Mapa de arquivos

| Arquivo | Papel nesta etapa |
|---|---|
| `server/services/almoxarifado/availabilitySql.js` | **novo** — a conta do disponível, uma vez só |
| `server/services/almoxarifado/schema.js` | `safeAlter` da coluna; DDL das 3 tabelas; 4 tipos de movimento; `TIPOS_RETENCAO`; `TIPOS_DEDICADOS` |
| `server/services/almoxarifado/stockService.js` | `getSaldoDisponivel` + 5 SQLs passam a usar o helper; 3 ramos novos no motor; `tiposSaida` (2 lugares); skip-list derivada |
| `server/services/almoxarifado/movementRules.js` | `REGRAS_VINCULO` dos 4 tipos novos |
| `server/services/almoxarifado/ownerRules.js` | `TIPOS_ISENTOS_DONO` recebe os 4 tipos novos |
| `server/services/almoxarifado/permissions.js` | ação `remessar_terceiro` |
| `server/services/almoxarifado/thirdPartyStateMachine.js` | **novo** — transições declaradas + `validarTransicao` |
| `server/services/almoxarifado/thirdPartyService.js` | **novo** — criar/enviar/retornar/encerrar/cancelar/vencidas |
| `server/services/almoxarifado/schemas.js` | 4 schemas Zod novos |
| `server/services/almoxarifado/{requisitionService,requisitionStateMachine,reportService,clienteEstoqueService}.js` | passam a usar `disponivelSql` |
| `server/routes/almoxarifado.js` | conferência: `quantidade_sistema` desconta em_terceiros; requisição usa `disponivelSql` |
| `server/routes/almoxarifado/extended.js` | rotas de remessa; extrato usa `disponivelSql` |
| `server/routes/requisicoesMaterial.js` | passa a usar `disponivelSql` |
| `server/tests/helpers/testApp.js` | stub de `fornecedores` |
| `server/tests/api/saldoEmTerceiros.api.test.js` | **novo** (Task 1) |
| `server/tests/api/conferenciaEmTerceiros.api.test.js` | **novo** (Task 2) |
| `server/tests/api/remessaTerceiroEstados.api.test.js` | **novo** (Task 3) |
| `server/tests/api/remessaTerceiroMotor.api.test.js` | **novo** (Task 4) |
| `server/tests/api/remessaTerceiroCiclo.api.test.js` | **novo** (Tasks 5-7) |
| `server/tests/api/remessaTerceiroRotas.api.test.js` | **novo** (Task 8) |
| `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js` | **novo** — tela |
| `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.test.js` | **novo** |
| `client/src/utils/remessaPdf.js` + `remessaPdf.test.js` | **novo** — documento de remessa |
| `client/src/components/almoxarifado/Almoxarifado.css` | classes de badge dos 5 status |
| `client/src/routes/lazyModules.js`, `client/src/App.js`, `client/src/components/Layout.js` | rota code-split + menu |
| specs 14 / README mestre / guia / novidades / plano | fechamento de documentação (Task 10) |

---

### Task 1: `quantidade_em_terceiros` + a conta do disponível numa fonte só

**Files:**
- Create: `server/services/almoxarifado/availabilitySql.js`
- Create: `server/tests/api/saldoEmTerceiros.api.test.js`
- Modify: `server/services/almoxarifado/schema.js` (junto dos outros `safeAlter` de `materiais_almoxarifado`, ~linha 662)
- Modify: `server/services/almoxarifado/stockService.js:22-27`, `:892`, `:912`, `:1351`, `:1631-1632`, `:1748`
- Modify: `server/services/almoxarifado/requisitionStateMachine.js:97-99`
- Modify: `server/services/almoxarifado/requisitionService.js:101`, `:115`
- Modify: `server/services/almoxarifado/reportService.js:8`
- Modify: `server/services/almoxarifado/clienteEstoqueService.js:49`
- Modify: `server/routes/almoxarifado/extended.js:455`
- Modify: `server/routes/almoxarifado.js:1891`
- Modify: `server/routes/requisicoesMaterial.js:260`

**Interfaces:**
- Consumes: nada de tasks anteriores (é a primeira).
- Produces:
  - `disponivelSql(alias?: string) => string` — expressão SQL **já entre parênteses** do disponível
    do material. `alias` sem ponto (`'m'`, `'ma'`); vazio/omitido para UPDATE de tabela única.
  - `COLUNAS_RETENCAO: string[]` — as quatro colunas de retenção, em ordem.
  - `materiais_almoxarifado.quantidade_em_terceiros REAL DEFAULT 0`.
  - `stockService.getSaldoDisponivel(material)` passa a subtrair a quarta coluna.

- [x] **Step 1: Escrever o teste que falha** — feito em `0a01124`

Cria `server/tests/api/saldoEmTerceiros.api.test.js`:

```js
/**
 * Etapa 8b, Task 1 — a quarta coluna de retencao e a conta do disponivel numa fonte so.
 *
 * O design nomeou a armadilha (a subtracao esta replicada em SQL) mas a primeira versao contou
 * SETE sitios; a varredura completa achou QUATORZE, em 8 arquivos. Acrescentar a coluna so em
 * `getSaldoDisponivel` faria o sistema RECUSAR pela funcao e ACEITAR pelo SQL: a listagem
 * mostraria disponivel a mais, a reserva nasceria sobre material que esta no galvanizador e a
 * guarda atomica da saida deixaria passar. Nada quebra — o numero fica errado, que e a falha mais
 * cara de achar.
 *
 * Por isso este arquivo testa CADA CAMINHO separadamente, e nao so a funcao. E por isso o ultimo
 * par de testes e uma VARREDURA do proprio codigo-fonte: verificar "editei os 14" depende de eu
 * ter contado certo; verificar "sobrou zero" nao depende.
 *
 * Executar: cd server && node tests/api/saldoEmTerceiros.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionStateMachine = require('../../services/almoxarifado/requisitionStateMachine');
const reportService = require('../../services/almoxarifado/reportService');
const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste de saldo em terceiros' };

let seq = 0;
/** Material com 100 no fisico e `emTerceiros` retido — disponivel esperado = 100 - emTerceiros. */
async function novoMaterial(db, emTerceiros = 0, proprietarioClienteId = null) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo, proprietario_cliente_id)
     VALUES (?,?,'UN',100,?,1,?)`,
    [`TERC-${seq}`, `Material terceiro ${seq}`, emTerceiros, proprietarioClienteId]);
  return r.lastID;
}

async function requisicaoCom(db, materialId, quantidade) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante', 'PENDENTE')`,
    [`REQ-TERC-${seq}`]);
  await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)`, [r.lastID, materialId, quantidade]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── Caminho 1: a funcao ──────────────────────────────────────────────────────────────────────
  await test('[funcao] getSaldoDisponivel desconta quantidade_em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 70);
  });

  // ── Caminho 2: a listagem de estoque ─────────────────────────────────────────────────────────
  await test('[listagem] consultarEstoque devolve quantidade_disponivel descontado', async () => {
    const id = await novoMaterial(db, 30);
    const [row] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(row.quantidade_disponivel, 70,
      'a listagem de estoque nao desconta em_terceiros — a tela mostraria disponivel a mais');
  });

  // ── Caminho 3: a guarda do hold da reserva ───────────────────────────────────────────────────
  await test('[reserva] criar reserva acima do disponivel restante e recusada', async () => {
    const id = await novoMaterial(db, 30);
    await assert.rejects(
      () => stockService.criarReserva(db, ADMIN, { material_id: id, quantidade: 80 }),
      /dispon/i,
      'a reserva nasceu sobre material que esta no galvanizador');
    const m = await dbGet(db, 'SELECT quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_reservada || 0, 0, 'o hold ficou aplicado mesmo com a reserva recusada');
  });

  await test('[reserva][CONTROLE POSITIVO] reserva DENTRO do disponivel restante e aceita', async () => {
    const id = await novoMaterial(db, 30);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: id, quantidade: 70 });
    assert.ok(r, 'a guarda barrou tudo — implementacao que recusa sempre passaria no teste de recusa acima');
  });

  // ── Caminho 4: a guarda atomica da saida ─────────────────────────────────────────────────────
  await test('[saida] saida acima do disponivel restante e recusada, e nada sai do fisico', async () => {
    const id = await novoMaterial(db, 30);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 80, ...JUST });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 100, 'saiu estoque de material que esta no terceiro');
  });

  await test('[saida][CONTROLE POSITIVO] saida DENTRO do disponivel restante passa', async () => {
    const id = await novoMaterial(db, 30);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 70, ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.quantidade_atual, 30);
  });

  // ── Caminho 5: o status pos-aprovacao da requisicao ──────────────────────────────────────────
  await test('[pos-aprovacao] item cujo saldo esta TODO no terceiro nao deixa a requisicao em APROVADO', async () => {
    const id = await novoMaterial(db, 100);
    const req = await requisicaoCom(db, id, 5);
    const status = await requisitionStateMachine.calcularStatusPosAprovacao(db, req);
    assert.notStrictEqual(status, 'APROVADO', 'a requisicao foi aprovada contra saldo que esta a 40 km');
    assert.ok(['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'].includes(status), `status inesperado: ${status}`);
  });

  await test('[pos-aprovacao][CONTROLE POSITIVO] com sobra no predio continua APROVADO', async () => {
    const id = await novoMaterial(db, 99);
    const req = await requisicaoCom(db, id, 5);
    assert.strictEqual(await requisitionStateMachine.calcularStatusPosAprovacao(db, req), 'APROVADO',
      'a conta passou a recusar tudo — 1 unidade no predio ainda e saldo disponivel');
  });

  // ── Caminho 6: o extrato do material (rota) ──────────────────────────────────────────────────
  await test('[extrato] GET /materiais/:id/extrato desconta em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    const res = await request(app).get(`/api/almoxarifado/materiais/${id}/extrato`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.material.quantidade_disponivel, 70);
  });

  // ── Caminho 7: o relatorio de posicao de estoque ─────────────────────────────────────────────
  await test('[relatorio] relatorioEstoqueAtual desconta em_terceiros', async () => {
    const id = await novoMaterial(db, 30);
    const linha = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.ok(linha, 'material sumiu do relatorio');
    assert.strictEqual(linha.disponivel, 70);
  });

  // ── Caminho 8: os itens da requisicao (servico e rota) ───────────────────────────────────────
  await test('[requisicao] carregarItensRequisicao traz saldo_disponivel descontado', async () => {
    const id = await novoMaterial(db, 30);
    const req = await requisicaoCom(db, id, 5);
    const [item] = await requisitionService.carregarItensRequisicao(db, req);
    assert.strictEqual(item.saldo_disponivel, 70);
  });

  await test('[requisicao] a rota de detalhe traz saldo_atual descontado', async () => {
    const id = await novoMaterial(db, 30);
    const req = await requisicaoCom(db, id, 5);
    const res = await request(app).get(`/api/almoxarifado/requisicoes/${req}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.itens[0].saldo_atual, 70);
  });

  // ── Caminho 9: a posicao por cliente (criada na PROPRIA Etapa 8 — a mais facil de esquecer) ──
  await test('[posicao por cliente] saldo_disponivel do cliente desconta, e o patrimonio dele NAO encolhe', async () => {
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Terceiro LTDA')");
    const id = await novoMaterial(db, 30, cli.lastID);
    const pos = await clienteEstoqueService.posicaoPorCliente(db, { cliente_id: cli.lastID });
    const item = pos.itens.find((i) => i.material_id === id);
    assert.ok(item, 'material do cliente sumiu da posicao');
    assert.strictEqual(item.saldo_disponivel, 70);
    assert.strictEqual(item.saldo, 100,
      'o PATRIMONIO do cliente nao pode encolher: ele continua dono dos 100, so 30 estao fora do predio');
  });

  // ── Controle positivo bilateral do conjunto ──────────────────────────────────────────────────
  await test('[CONTROLE POSITIVO BILATERAL] com em_terceiros = 0 TODOS os caminhos devolvem o disponivel cheio', async () => {
    // Metade que falta: um `- 0` que virasse `- quantidade_atual` (ou um filtro que zerasse a
    // leitura) passaria em TODOS os testes de recusa acima. Este prova que a conta nao ficou
    // pessimista — a metade de exclusao sozinha aprova leitura zerada (ja aconteceu 5x nesta base).
    const id = await novoMaterial(db, 0);
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 100);
    const [lista] = await stockService.consultarEstoque(db, { material_id: id });
    assert.strictEqual(lista.quantidade_disponivel, 100);
    const rel = (await reportService.relatorioEstoqueAtual(db)).find((l) => l.id === id);
    assert.strictEqual(rel.disponivel, 100);
    const extrato = await request(app).get(`/api/almoxarifado/materiais/${id}/extrato`);
    assert.strictEqual(extrato.body.material.quantidade_disponivel, 100);
    const req = await requisicaoCom(db, id, 5);
    assert.strictEqual(await requisitionStateMachine.calcularStatusPosAprovacao(db, req), 'APROVADO');
    const [item] = await requisitionService.carregarItensRequisicao(db, req);
    assert.strictEqual(item.saldo_disponivel, 100);
    const detalhe = await request(app).get(`/api/almoxarifado/requisicoes/${req}`);
    assert.strictEqual(detalhe.body.itens[0].saldo_atual, 100);
  });

  // ── Varredura: nenhuma outra query pode reimplementar a conta ────────────────────────────────
  // Verificar "editei os 14" depende de eu ter contado certo. Verificar "sobrou zero" nao depende —
  // e e o unico jeito de a Etapa 8c (que reabre a mesma pergunta) nao ter de recontar. Varre
  // server/ INTEIRO nos diretorios que tocam materiais_almoxarifado, incluindo
  // routes/requisicoesMaterial.js, que NAO pertence ao modulo almoxarifado e por isso escapou das
  // duas varreduras anteriores desta sequencia de etapas.
  const RAIZ = path.join(__dirname, '..', '..');
  const ARQUIVOS_VARRIDOS = [
    ...fs.readdirSync(path.join(RAIZ, 'services', 'almoxarifado'))
      .filter((f) => f.endsWith('.js')).map((f) => path.join('services', 'almoxarifado', f)),
    ...fs.readdirSync(path.join(RAIZ, 'routes', 'almoxarifado'))
      .filter((f) => f.endsWith('.js')).map((f) => path.join('routes', 'almoxarifado', f)),
    path.join('routes', 'almoxarifado.js'),
    path.join('routes', 'requisicoesMaterial.js'),
  ];
  // Casa `- COALESCE(<alias?>quantidade_em_inspecao,0)` — a assinatura da conta REPLICADA.
  // NAO casa os UPDATEs legitimos de retencao (`SET quantidade_em_inspecao = COALESCE(...) - ?`,
  // `AND COALESCE(quantidade_em_inspecao,0) >= ?`), que tem `=`/`AND` antes do COALESCE.
  const PADRAO_REPLICADO = /-\s*COALESCE\(\s*\w*\.?quantidade_em_inspecao\s*,\s*0\s*\)/;

  await test('[varredura] nenhum arquivo fora de availabilitySql.js reimplementa a conta do disponivel', async () => {
    const culpados = ARQUIVOS_VARRIDOS.filter((rel) => {
      if (rel.endsWith('availabilitySql.js')) return false;
      return PADRAO_REPLICADO.test(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
    });
    assert.deepStrictEqual(culpados, [],
      `estes arquivos ainda calculam o disponivel a mao — a coluna nova nao vale neles: ${culpados.join(', ')}`);
  });

  await test('[varredura][CONTROLE POSITIVO] o padrao SABE achar a conta replicada', async () => {
    // Sem isto, um regex quebrado daria "0 culpados" e aprovaria o oposto do que a task promete.
    const fixture = '(m.quantidade_atual - COALESCE(m.quantidade_reservada,0)'
      + ' - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as disponivel';
    assert.ok(PADRAO_REPLICADO.test(fixture), 'o padrao da varredura nao acha nem a conta literal');
    const legitimo = 'SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) - ? WHERE id = ?';
    assert.ok(!PADRAO_REPLICADO.test(legitimo), 'o padrao acusa um UPDATE de retencao legitimo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar** — feito em `0a01124`

Run: `cd server && node tests/api/saldoEmTerceiros.api.test.js`
Expected: FAIL. A primeira falha é `SQLITE_ERROR: table materiais_almoxarifado has no column named
quantidade_em_terceiros`, no helper `novoMaterial` — a coluna ainda não existe.

- [x] **Step 3: Criar a coluna** — feito em `0a01124`

Em `server/services/almoxarifado/schema.js`, logo abaixo do `safeAlter` de
`proprietario_cliente_id` (~linha 662):

```js
  // Etapa 8b (decisao 2 do design): a QUARTA coluna de retencao. Material no galvanizador continua
  // sendo nosso (quantidade_atual nao muda) mas nao esta disponivel para sair — igual as outras
  // tres. O QUE A DIFERENCIA DAS OUTRAS TRES, e isto decide a conferencia de inventario:
  // reservada/bloqueada/em_inspecao sao estados ADMINISTRATIVOS de material que ESTA na prateleira
  // e TEM de ser contado; `quantidade_em_terceiros` e a unica que significa "nao esta no predio".
  // Por isso so ela sai do esperado da contagem (routes/almoxarifado.js, POST /conferencias).
  // Quem "uniformizar as quatro" aqui quebra a contagem de inventario.
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN quantidade_em_terceiros REAL DEFAULT 0');
```

- [x] **Step 4: Criar a fonte única da conta** — feito em `0a01124`

Cria `server/services/almoxarifado/availabilitySql.js`:

```js
/**
 * A conta do saldo DISPONIVEL do material — em UM lugar so.
 *
 * Ate a Etapa 8b esta subtracao existia escrita a mao em **13 queries** espalhadas por 8 arquivos
 * (services/almoxarifado/{stockService,requisitionService,requisitionStateMachine,reportService,
 * clienteEstoqueService}.js, routes/almoxarifado.js, routes/almoxarifado/extended.js e
 * routes/requisicoesMaterial.js — este ultimo NEM pertence ao modulo), mais a funcao
 * `stockService.getSaldoDisponivel`: 14 implementacoes da mesma conta.
 *
 * Acrescentar uma coluna de retencao nova (`quantidade_em_terceiros`, Etapa 8b) exigia acertar as
 * 14 — e errar UMA nao quebra nada: o sistema passa a RECUSAR pela funcao e ACEITAR pelo SQL, com
 * o numero errado em silencio. O design da 8b chegou a contar SETE; a spec da Etapa 8, antes dela,
 * mandou auditar um subconjunto de diretorios e deixou de fora as duas piores leituras. Dois erros
 * do mesmo tipo em duas etapas seguidas: a resposta nao e contar melhor, e nao haver o que contar.
 *
 * Precedente do proprio modulo: `RESERVADO_PARA_ITEM_SQL` em requisitionService.js ja e um
 * fragmento de SQL compartilhado por constante. Isto e a mesma ideia, para a conta mais copiada
 * do modulo.
 *
 * REGRA: nenhuma query nova pode escrever a subtracao a mao.
 * `tests/api/saldoEmTerceiros.api.test.js` varre o codigo-fonte e falha se alguem voltar a
 * replica-la — e tem controle positivo do proprio padrao de busca.
 */

/**
 * As colunas que RETEM saldo. Ordem preservada por legibilidade do SQL gerado.
 *
 * As tres primeiras sao estados administrativos de material que ESTA na prateleira.
 * `quantidade_em_terceiros` e a unica que significa "nao esta no predio" — ver o comentario da
 * coluna em schema.js e o desconto da conferencia em routes/almoxarifado.js.
 */
const COLUNAS_RETENCAO = [
  'quantidade_reservada',
  'quantidade_bloqueada',
  'quantidade_em_inspecao',
  'quantidade_em_terceiros',
];

/**
 * Expressao SQL do disponivel, JA ENTRE PARENTESES (pode ir direto para um `>= ?` ou um `as x`).
 *
 * @param {string} alias alias da tabela materiais_almoxarifado SEM o ponto ('m', 'ma'). Vazio
 *   (default) para UPDATE de tabela unica, onde as colunas nao sao qualificadas.
 * @returns {string}
 *
 *   disponivelSql('m')  =>  (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - ...)
 *   disponivelSql()     =>  (quantidade_atual - COALESCE(quantidade_reservada,0) - ...)
 */
function disponivelSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  const retido = COLUNAS_RETENCAO.map((c) => `COALESCE(${p}${c},0)`).join(' - ');
  return `(${p}quantidade_atual - ${retido})`;
}

module.exports = { COLUNAS_RETENCAO, disponivelSql };
```

- [x] **Step 5: `stockService` — a função e os cinco SQLs** — feito em `0a01124`

Em `server/services/almoxarifado/stockService.js`, no topo (junto dos outros `require`):

```js
const { disponivelSql, COLUNAS_RETENCAO } = require('./availabilitySql');
```

Trocar `getSaldoDisponivel` (linhas 22-27) por:

```js
/**
 * Disponivel = fisico menos TODA retencao (COLUNAS_RETENCAO, availabilitySql.js). A lista das
 * colunas mora la, e nao aqui, para esta funcao e as 13 queries que fazem a mesma conta nao
 * poderem divergir — divergirem foi o que a Etapa 8b teve de consertar.
 */
async function getSaldoDisponivel(material) {
  return COLUNAS_RETENCAO.reduce(
    (saldo, coluna) => saldo - (material[coluna] || 0),
    material.quantidade_atual,
  );
}
```

Linha ~892 (claim da saída **consumindo reserva**) — o `+ ?` sai de dentro da expressão e vai para
fora dela. **A ordem dos placeholders não muda** (`id`, `permiteNegativo`, `quantidade` do `+`,
`quantidade` do `>=`), então os parâmetros continuam exatamente os mesmos:

```js
        const rowRes = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = quantidade_atual - ?,
              quantidade_reservada = MAX(0, COALESCE(quantidade_reservada,0) - ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND (? = 1 OR (${disponivelSql()} + ?) >= ?)
          RETURNING quantidade_atual`,
          [quantidade, quantidade, material_id, permiteNegativo ? 1 : 0, quantidade, quantidade]);
```

Linha ~912 (claim da saída normal):

```js
      const row = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR ${disponivelSql()} >= ?)
        RETURNING quantidade_atual`,
        [quantidade, material_id, permiteNegativo ? 1 : 0, quantidade]);
```

Linha ~1351 (`cancelarMovimentacao`, reverter entrada):

```js
      const row = await dbGet(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR ${disponivelSql()} >= ?)
        RETURNING quantidade_atual`,
        [mov.quantidade, mov.material_id, permiteNegativo ? 1 : 0, mov.quantidade]);
```

Linha ~1631 (hold de `criarReserva`):

```js
  const hold = await dbGet(db, `UPDATE materiais_almoxarifado
    SET quantidade_reservada = COALESCE(quantidade_reservada,0) + ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND ${disponivelSql()} >= ?
    RETURNING id`, [qtd, material_id, qtd]);
```

Linha ~1748 (`consultarEstoque`):

```js
  let sql = `SELECT m.*, c.nome as categoria_nome, cli.razao_social as proprietario_cliente_nome,
    ${disponivelSql('m')} as quantidade_disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_estoque
    FROM materiais_almoxarifado m
    LEFT JOIN categorias_material_almoxarifado c ON m.categoria_id = c.id
    LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
    WHERE m.ativo = 1`;
```

- [x] **Step 6: Os oito SQLs restantes** — feito em `0a01124`

`server/services/almoxarifado/requisitionStateMachine.js` — `require` no topo
(`const { disponivelSql } = require('./availabilitySql');`) e a query de
`calcularStatusPosAprovacao`:

```js
  const itens = await dbAll(db, `
    SELECT ir.material_id, ${disponivelSql('ma')} as disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
```

`server/services/almoxarifado/requisitionService.js` — `require` no topo e as duas queries:

```js
async function carregarItensRequisicao(db, requisicaoId) {
  return dbAll(db, `SELECT ir.*, ma.quantidade_atual, ma.unidade, ma.nome as material_nome, ma.codigo as material_codigo,
      COALESCE(ma.custo_medio, ma.custo_unitario, 0) as custo_unitario,
      ${RESERVADO_PARA_ITEM_SQL} as reservado_para_item,
      (${disponivelSql('ma')} + ${RESERVADO_PARA_ITEM_SQL}) as saldo_disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
}
```

```js
  const row = await dbGet(db, `SELECT
      ${disponivelSql('ma')} as saldo_disponivel,
      COALESCE((
        SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
        FROM reservas_material_almoxarifado r
        WHERE r.item_requisicao_id = ? AND r.material_id = ma.id
          AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'
      ), 0) as reservado_para_item
    FROM materiais_almoxarifado ma WHERE ma.id = ?`, [item.id, item.material_id]);
```

`server/services/almoxarifado/reportService.js` — `require` no topo e:

```js
  return dbAll(db, `SELECT m.*,
    ${disponivelSql('m')} as disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_total
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    ORDER BY m.categoria, m.nome`);
```

`server/services/almoxarifado/clienteEstoqueService.js` — `require` no topo e, na query de
`posicaoPorCliente`, a linha do `saldo_disponivel`. **`m.quantidade_atual AS saldo` fica como
está**: o patrimônio do cliente não encolhe porque a chapa dele foi galvanizar — só o disponível
cai.

```js
           ${disponivelSql('m')} AS saldo_disponivel,
```

`server/routes/almoxarifado/extended.js` — `require` no topo
(`const { disponivelSql } = require('../../services/almoxarifado/availabilitySql');`) e o SELECT do
extrato:

```js
      const material = await dbGet(db, `SELECT m.*,
        ${disponivelSql('m')} as quantidade_disponivel,
        a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
        cli.razao_social as proprietario_cliente_nome
        FROM materiais_almoxarifado m
        LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
        LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
        LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
        WHERE m.id = ?`, [req.params.id]);
```

`server/routes/almoxarifado.js` — `require` no topo
(`const { disponivelSql } = require('../services/almoxarifado/availabilitySql');`) e o `saldo_atual`
do detalhe da requisição (~1891):

```js
      db.all(`SELECT ir.*, ma.nome as material_nome, ma.codigo as material_codigo,
                     ma.unidade,
                     (${disponivelSql('ma')}
                       + COALESCE((SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
                                   FROM reservas_material_almoxarifado r
                                   WHERE r.item_requisicao_id = ir.id AND r.material_id = ir.material_id
                                     AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'), 0)) as saldo_atual,
```

`server/routes/requisicoesMaterial.js` — `require` no topo
(`const { disponivelSql } = require('../services/almoxarifado/availabilitySql');`) e:

```js
                  ${disponivelSql('ma')} as saldo_atual,
```

- [x] **Step 7: Rodar o teste e ver passar** — feito em `0a01124`

Run: `cd server && node tests/api/saldoEmTerceiros.api.test.js`
Expected: PASS — **14 passed, 0 failed**.

- [x] **Step 8: Sabotagens obrigatórias (controle positivo bilateral)** — feito em `0a01124`

Cada uma: aplicar, rodar `node tests/api/saldoEmTerceiros.api.test.js`, conferir a falha esperada,
**desfazer** antes da próxima.

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Em `availabilitySql.js`, tirar `'quantidade_em_terceiros'` de `COLUNAS_RETENCAO` | falham **todos** os testes de desconto e de recusa (função, listagem, reserva, saída, pós-aprovação, extrato, relatório, requisição × 2, posição por cliente) — prova que os 9 caminhos realmente dependem da fonte única |
| S2 | Em `disponivelSql`, trocar `COALESCE(${p}quantidade_em_terceiros,0)` por `${p}quantidade_atual` | falha `[CONTROLE POSITIVO BILATERAL] com em_terceiros = 0 ...` — prova que os testes de recusa não seriam aprovados por uma conta que zera tudo |
| S3 | Em `stockService.js`, devolver o SQL literal antigo (sem `disponivelSql`) **só** no claim da saída (~912) | falham `[varredura] nenhum arquivo fora de availabilitySql.js...` **e** `[saida] saida acima do disponivel restante e recusada` — prova que a varredura pega regressão real, não só ausência |
| S4 | Trocar `PADRAO_REPLICADO` por `/nunca-casa-com-nada/` | falha `[varredura][CONTROLE POSITIVO] o padrao SABE achar a conta replicada` — prova que a varredura sabe falhar |

**Resultados medidos (`0a01124`), com o total verde em 33 passou / 0 falhou:**

| # | Medido | Observação |
|---|---|---|
| S1 | **17 passou, 14 falhou** | falhou exatamente **uma por caminho** — os 14 dependem mesmo da fonte única |
| S2 | **9 passou, 22 falhou** | falharam **todos** os controles positivos, não só o agregado que o plano previa |
| S3 | **30 passou, 1 falhou** | ⚠️ **o plano estava errado** — ver correção abaixo |
| S4 | **30 passou, 1 falhou** | só o controle positivo do padrão, como previsto |

> ### Correção do plano — S3 previa duas falhas e só acontece uma
>
> A linha S3 acima afirmava que devolver o SQL literal no claim da saída normal (~925) quebraria
> **também** `[saida] saida acima do disponivel restante e recusada`. **Não quebra.** A
> pré-checagem em JS (`getSaldoDisponivel`, `stockService.js:~694`) recusa a saída **antes** de o
> UPDATE condicional rodar, então o claim só age sob **concorrência** — que um teste sequencial
> não alcança. Para aquele sítio a **varredura do código-fonte é a única guarda real**, o que
> reforça a decisão de tê-la (e está anotado no próprio teste).
>
> Os outros dois claims **têm** prova comportamental, confirmada por sabotagem dirigida:
> sabotar **só** o claim que consome reserva (~905) dá **29 passou / 2 falhou** (`[saida-reserva]`
> + varredura), porque esse ramo **pula** a pré-checagem; sabotar **só** o claim do estorno
> (~1364) dá **29 passou / 2 falhou** (`[estorno]` + varredura), porque `cancelarMovimentacao`
> não tem pré-checagem nenhuma.

- [x] **Step 9: Suítes completas** — feito em `0a01124`

Run:
```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
```
Expected: `test:api` **69/69 arquivos OK** (68 + o novo), `test:almoxarifado` **42/0**,
validation **4/0**, safealter **3/0**, sqlite **3/0**. Qualquer regressão aqui é sinal de que uma
das 13 substituições mudou semântica (o suspeito nº 1 é a ordem de placeholders do claim
consumindo reserva) — investigar antes de seguir.

- [x] **Step 10: Commit** — feito em `0a01124`

```bash
git add server/services/almoxarifado/availabilitySql.js \
        server/services/almoxarifado/schema.js \
        server/services/almoxarifado/stockService.js \
        server/services/almoxarifado/requisitionStateMachine.js \
        server/services/almoxarifado/requisitionService.js \
        server/services/almoxarifado/reportService.js \
        server/services/almoxarifado/clienteEstoqueService.js \
        server/routes/almoxarifado.js \
        server/routes/almoxarifado/extended.js \
        server/routes/requisicoesMaterial.js \
        server/tests/api/saldoEmTerceiros.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 1: quarta coluna de retencao e a conta do disponivel numa fonte so

Material que vai beneficiar fora sumia do controle: ou alguem dava baixa (e o material desaparecia
do patrimonio, embora continuasse sendo da empresa), ou nao dava baixa nenhuma (e o sistema
afirmava que a chapa estava na prateleira, com ela a 40 km). A coluna quantidade_em_terceiros
resolve os dois: quantidade_atual nao muda (continua sendo nosso) e o disponivel cai.

O risco real nao era criar a coluna, era acrescenta-la em UM lugar so. A subtracao
atual - reservada - bloqueada - em_inspecao estava REPLICADA em SQL em 13 queries de 8 arquivos,
mais a funcao getSaldoDisponivel. Com um sitio de fora nada quebra: o sistema recusa pela funcao e
aceita pelo SQL, e o numero fica errado em silencio — a listagem mostra disponivel a mais, a
reserva nasce sobre material que esta no galvanizador, a guarda atomica da saida deixa passar.

Por isso a task nao enumerou 14 edicoes: criou availabilitySql.disponivelSql() e trocou as 13
queries por ele, no mesmo espirito do RESERVADO_PARA_ITEM_SQL que requisitionService ja usava. A
verificacao e por VARREDURA do codigo-fonte, com controle positivo do proprio padrao de busca —
"editei os 14" depende de eu ter contado certo, "sobrou zero" nao depende. A Etapa 8c reabre a
mesma pergunta e agora nao precisa recontar.

Dois sitios eram invisiveis para quem varre por intuicao: clienteEstoqueService, criado na PROPRIA
Etapa 8 (esquece-lo faria a posicao por cliente mostrar disponivel a mais logo depois da auditoria
de segregacao por dono), e routes/requisicoesMaterial.js, que nem pertence ao modulo almoxarifado.

Descartado: localizacao virtual "Em terceiros" (opcao (a) do briefing). Nao entrega o que promete —
getSaldoDisponivel calcula sobre o escalar quantidade_atual, entao material numa localizacao
virtual continuaria disponivel para saida.

Fica de fora de proposito o dispSemBloqueio de stockService (quantidade_atual - bloqueada): nao e a
conta do disponivel, e uma guarda especifica de bloqueio com mensagem propria, e a guarda do
disponivel logo acima ja recusa saida que invada o que esta no terceiro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: a conferência de inventário para de cobrar o que está no terceiro

> **EXECUTADA em `06e7333`** — 7 testes (o plano previa 5; dois controles positivos foram
> acrescentados, motivo abaixo). Gates medidos: `test:api` **70/70 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**.
>
> **Dois testes a mais do que o plano pedia, e o motivo de cada um:**
> 1. `material legado com em_terceiros NULL continua sendo cobrado pelo total` — o plano mandava
>    provar o `COALESCE` **por sabotagem manual** (S3, com um `UPDATE ... = NULL` avulso). Sabotagem
>    que só existe no roteiro não protege ninguém depois; virou teste do arquivo.
> 2. `[CONTROLE POSITIVO] contar o total fisico de material no terceiro ACUSA divergencia` — o teste
>    de divergência do plano só provava que contar 70 dá **zero**. Sozinho, ele seria aprovado por
>    uma divergência que zerasse sempre. O par prova que contar 100 dá **+30**.
>
> **O plano errou a consequência de S3 (sem `COALESCE`), e para menos.** Ele previa
> `quantidade_sistema` virando `null`. O real é pior:
> `itens_conferencia_almoxarifado.quantidade_sistema` é `NOT NULL`, o `INSERT` falha e o
> `POST /conferencias` **inteiro** volta 500 — uma única linha legada com a coluna `NULL` impede
> abrir a conferência do almoxarifado todo, não só a daquele material. Verificado na sabotagem.

**Files:**
- Modify: `server/routes/almoxarifado.js` (handler `POST /api/almoxarifado/conferencias`, o
  `SELECT id, quantidade_atual FROM materiais_almoxarifado WHERE ativo = 1` ~linha 887)
- Create: `server/tests/api/conferenciaEmTerceiros.api.test.js`

**Interfaces:**
- Consumes: `materiais_almoxarifado.quantidade_em_terceiros` (Task 1).
- Produces: `itens_conferencia_almoxarifado.quantidade_sistema` passa a ser
  `quantidade_atual − quantidade_em_terceiros`. Nenhuma assinatura nova.

**Por que esta task existe e por que ela é curta:** a coluna de retenção sozinha, sem isto, cria um
problema novo. A conferência monta o esperado a partir de `m.quantidade_atual`, **por material,
não por localização** — então toda contagem de um material que tem chapa no galvanizador acusaria
uma diferença fantasma, e o operador "corrigiria" o saldo para menos. E **só** essa retenção sai
da contagem: quarentena e bloqueio continuam somando, porque aquele material **está** na prateleira
e tem de ser contado.

- [x] **Step 1: Escrever o teste que falha**

Cria `server/tests/api/conferenciaEmTerceiros.api.test.js`:

```js
/**
 * Etapa 8b, Task 2 — a contagem de inventario nao cobra o que esta no terceiro.
 *
 * A conferencia monta `quantidade_sistema` a partir de m.quantidade_atual, POR MATERIAL (nao por
 * localizacao). Com a coluna nova, material no galvanizador continua somando em quantidade_atual —
 * correto, e nosso — mas NAO esta na prateleira para ser contado. Sem este desconto, toda contagem
 * acusa uma diferenca fantasma e o operador "corrige" o saldo para menos.
 *
 * O par de testes aqui e o CONTROLE POSITIVO BILATERAL exigido pelo design: um teste so de
 * desconto seria aprovado por uma implementacao que descontasse as QUATRO retencoes — e as outras
 * tres estao na prateleira e TEM de ser contadas.
 *
 * Executar: cd server && node tests/api/conferenciaEmTerceiros.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { emTerceiros = 0, bloqueada = 0, emInspecao = 0, reservada = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, quantidade_bloqueada,
       quantidade_em_inspecao, quantidade_reservada, ativo)
     VALUES (?,?,'UN',100,?,?,?,?,1)`,
    [`CONF-${seq}`, `Material conferencia ${seq}`, emTerceiros, bloqueada, emInspecao, reservada]);
  return r.lastID;
}

async function esperadoNaConferencia(app, db, materialId) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send({});
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const item = await dbGet(db,
    'SELECT quantidade_sistema FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
    [res.body.id, materialId]);
  assert.ok(item, 'o material nao entrou na conferencia');
  return item.quantidade_sistema;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('conferencia desconta o que esta em terceiros do esperado', async () => {
    const id = await novoMaterial(db, { emTerceiros: 30 });
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 70,
      'a contagem cobra do almoxarife 100 unidades quando 30 estao a 40 km');
  });

  await test('[CONTROLE POSITIVO] conferencia continua cobrando material bloqueado e em quarentena', async () => {
    // A metade que falta: descontar as QUATRO retencoes passaria no teste acima e estaria ERRADO.
    // Bloqueado e em quarentena ESTAO na prateleira — sao estados administrativos, nao ausencia
    // fisica —, e nao contar o que esta na prateleira e como esconder material do inventario.
    const id = await novoMaterial(db, { bloqueada: 40, emInspecao: 25, reservada: 15 });
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 100,
      'a contagem deixou de cobrar material bloqueado/em quarentena/reservado, que esta na prateleira');
  });

  await test('[CONTROLE POSITIVO] as duas coisas juntas descontam SO o terceiro', async () => {
    const id = await novoMaterial(db, { emTerceiros: 30, bloqueada: 40, emInspecao: 25, reservada: 15 });
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 70);
  });

  await test('material sem nada retido continua sendo cobrado pelo total', async () => {
    const id = await novoMaterial(db, {});
    assert.strictEqual(await esperadoNaConferencia(app, db, id), 100);
  });

  await test('a divergencia da contagem e medida contra o esperado JA descontado', async () => {
    // Consequencia pratica: quem conta 70 na prateleira de um material com 30 no terceiro tem de
    // ver divergencia ZERO. Se o esperado nao descontasse, ele veria -30 e "corrigiria" o saldo.
    const id = await novoMaterial(db, { emTerceiros: 30 });
    const conf = await request(app).post('/api/almoxarifado/conferencias').send({});
    const item = await dbGet(db,
      'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
      [conf.body.id, id]);
    const res = await request(app)
      .put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item.id}`)
      .send({ quantidade_contada: 70 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.divergencia, 0,
      'contar exatamente o que esta na prateleira acusou divergencia');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/conferenciaEmTerceiros.api.test.js`
Expected: FAIL em `conferencia desconta o que esta em terceiros do esperado` com
`Expected 70 to strictly equal 100` (o esperado ainda é `quantidade_atual` cru). Os testes de
controle positivo já passam — e é isso que os torna úteis: eles têm de **continuar** passando
depois da mudança.

- [x] **Step 3: Implementar**

Em `server/routes/almoxarifado.js`, no handler `POST /api/almoxarifado/conferencias`, trocar o
SELECT que monta os itens:

```js
        // Inserir todos os materiais ativos.
        //
        // Etapa 8b (decisao 2 do design): o esperado desconta `quantidade_em_terceiros`, e SO ela.
        // A conferencia e por MATERIAL, nao por localizacao — entao material que esta no
        // galvanizador entraria no esperado e toda contagem acusaria uma diferenca fantasma, com o
        // operador "corrigindo" o saldo para menos de material que existe e vai voltar.
        //
        // E SO ELA de proposito. quantidade_reservada, quantidade_bloqueada e quantidade_em_inspecao
        // continuam somando porque aquele material ESTA na prateleira e TEM de ser contado:
        // "bloqueado" e um estado administrativo, nao uma ausencia fisica. `quantidade_em_terceiros`
        // e a unica das quatro que significa "nao esta no predio". Quem "uniformizar as quatro"
        // aqui passa a esconder do inventario material que esta no galpao.
        // Coberto nos dois sentidos por tests/api/conferenciaEmTerceiros.api.test.js.
        let sql = `SELECT id, (quantidade_atual - COALESCE(quantidade_em_terceiros,0)) AS quantidade_sistema
                   FROM materiais_almoxarifado WHERE ativo = 1`;
        const params = [];
        if (categoria) { sql += ` AND categoria = ?`; params.push(categoria); }
        sql += ` ORDER BY nome`;
```

e o `INSERT` correspondente (o campo lido muda de `m.quantidade_atual` para `m.quantidade_sistema`):

```js
          const inserts = materiais.map(m =>
            new Promise((resolve, reject) => {
              db.run(`INSERT INTO itens_conferencia_almoxarifado (conferencia_id, material_id, quantidade_sistema)
                      VALUES (?, ?, ?)`,
                [confId, m.id, m.quantidade_sistema],
                (e) => e ? reject(e) : resolve());
            })
          );
```

> **Não usar `disponivelSql` aqui.** Parece a mesma conta e não é: o disponível subtrai as quatro
> retenções, e a contagem só pode subtrair uma. Chamar o helper aqui seria o jeito mais rápido de
> introduzir exatamente o bug que o controle positivo desta task existe para pegar.

- [x] **Step 4: Rodar o teste e ver passar**

Run: `cd server && node tests/api/conferenciaEmTerceiros.api.test.js`
Expected: PASS — 5 passed, 0 failed.

- [x] **Step 5: Sabotagens obrigatórias**

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Trocar a expressão por `quantidade_atual` cru | falha `conferencia desconta o que esta em terceiros do esperado` e `a divergencia da contagem...` |
| S2 | Trocar a expressão por `${disponivelSql()}` (descontar as quatro) | falha `[CONTROLE POSITIVO] conferencia continua cobrando material bloqueado e em quarentena` — é a sabotagem que prova que a task não é "descontar retenção", é "descontar ausência física" |
| S3 | Trocar por `quantidade_atual - quantidade_em_terceiros` **sem `COALESCE`** | falha em material legado com a coluna `NULL`: `quantidade_sistema` vira `null` — rodar com `UPDATE materiais_almoxarifado SET quantidade_em_terceiros = NULL WHERE id = ?` antes de contar |

- [x] **Step 6: Suítes de servidor**

Run:
```
cd server && npm run test:api
cd server && npm run test:almoxarifado
```
Expected: `test:api` **70/70 arquivos OK**, `test:almoxarifado` **42/0**. Atenção especial a
`tests/api/` que já exercitavam conferência — se algum quebrar, verificar se ele criava material
com `quantidade_em_terceiros` diferente de zero (não deveria).

- [x] **Step 7: Commit**

```bash
git add server/routes/almoxarifado.js server/tests/api/conferenciaEmTerceiros.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 2: a contagem de inventario para de cobrar o que esta no terceiro

A coluna de retencao da Task 1 sozinha criava um problema novo. A conferencia monta o esperado a
partir de m.quantidade_atual, POR MATERIAL e nao por localizacao — entao a chapa que esta no
galvanizador entrava no esperado, toda contagem daquele material acusava diferenca, e o caminho
natural do operador seria "corrigir" o saldo para menos de material que existe e vai voltar. O
esperado passa a ser quantidade_atual - quantidade_em_terceiros.

E SO essa retencao sai da contagem, de proposito. quantidade_reservada, quantidade_bloqueada e
quantidade_em_inspecao continuam somando porque aquele material ESTA na prateleira e TEM de ser
contado: bloqueado e um estado administrativo, nao uma ausencia fisica. quantidade_em_terceiros e a
unica das quatro que significa "nao esta no predio". O teste cobre os dois sentidos — um teste so
de desconto seria aprovado por uma implementacao que descontasse as quatro, que e o erro mais
provavel de quem ler este codigo depois e quiser uniformizar.

Descartado usar o disponivelSql da Task 1 aqui: parece a mesma conta e nao e (ele subtrai as
quatro), e usa-lo seria o jeito mais rapido de introduzir o bug que o controle positivo existe
para pegar. O comentario no codigo diz isso.

Nao resolvida, e herdada: o AJUSTE continua sem reconciliar retencao (pendencia aberta desde a
Etapa 7 com quantidade_bloqueada), e agora com uma segunda instancia — ajustar o total para baixo
de material com saldo em terceiros deixa disponivel negativo. A decisao de negocio e do cliente e
esta no item B do bloco "Leia antes de apresentar" do documento de novidades. O caminho controlado
para zerar quantidade_em_terceiros e o encerramento de remessa (Task 7).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: as três tabelas, a máquina de estados e a ação `remessar_terceiro`

**Files:**
- Create: `server/services/almoxarifado/thirdPartyStateMachine.js`
- Create: `server/tests/api/remessaTerceiroEstados.api.test.js`
- Modify: `server/services/almoxarifado/schema.js` (DDL, no bloco de `CREATE TABLE` do `initSchema`)
- Modify: `server/services/almoxarifado/permissions.js` (`ACAO_PERFIS`)
- Modify: `server/tests/helpers/testApp.js` (stub de `fornecedores`)

**Interfaces:**
- Consumes: nada das Tasks 1-2 (é fundação independente; pode rodar em paralelo com a 2).
- Produces:
  - Tabelas `remessas_terceiro_almoxarifado`, `itens_remessa_terceiro_almoxarifado`,
    `retornos_remessa_item_almoxarifado` (colunas exatas abaixo — as Tasks 5-8 escrevem nelas).
  - `thirdPartyStateMachine`: `TRANSICOES`, `STATUS_REMESSA`, `PODE_RECEBER_RETORNO`,
    `PODE_ENCERRAR`, `PODE_CANCELAR`, `validarTransicao(statusAtual, novoStatus) => {ok:true}|{ok:false, erro:string}`.
  - `ACAO_PERFIS.remessar_terceiro = [ADMINISTRADOR, ALMOXARIFE]`, visível em
    `GET /almoxarifado/minhas-permissoes`.
  - Harness com tabela `fornecedores` (`id`, `razao_social`, `nome_fantasia`, `cnpj`, `status`).

- [x] **Step 1: Escrever o teste que falha**

Cria `server/tests/api/remessaTerceiroEstados.api.test.js`:

```js
/**
 * Etapa 8b, Task 3 — maquina de estados da remessa, tabelas e a acao de perfil.
 *
 * Molde: requisitionStateMachine.js (objeto TRANSICOES declarativo + validarTransicao devolvendo
 * {ok, erro}) e tests/api/requisicaoEstados.api.test.js, que testa o validador DIRETO e tambem
 * pelas rotas. Aqui so o validador e a fundacao — as rotas chegam na Task 8.
 *
 * O ciclo (decisao 3 do design):
 *   ABERTA          remessa montada, itens escolhidos, NADA saiu do estoque ainda
 *   ENVIADA         o efeito de estoque acontece: em_terceiros sobe, disponivel desce
 *   RETORNO_PARCIAL parte voltou; o restante segue retido
 *   ENCERRADA       fecha (com destino obrigatorio se sobrou saldo — Task 7)
 *   CANCELADA       de ABERTA nao mexe em saldo; de ENVIADA devolve tudo ao disponivel
 *
 * Executar: cd server && node tests/api/remessaTerceiroEstados.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const sm = require('../../services/almoxarifado/thirdPartyStateMachine');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  // ── A maquina de estados, testada direto ─────────────────────────────────────────────────────
  await test('[transicoes] o caminho feliz inteiro e permitido', async () => {
    for (const [de, para] of [
      ['ABERTA', 'ENVIADA'],
      ['ENVIADA', 'RETORNO_PARCIAL'],
      ['RETORNO_PARCIAL', 'RETORNO_PARCIAL'],
      ['RETORNO_PARCIAL', 'ENCERRADA'],
      ['ENVIADA', 'ENCERRADA'],
    ]) {
      assert.deepStrictEqual(sm.validarTransicao(de, para), { ok: true }, `${de} -> ${para} devia ser permitida`);
    }
  });

  await test('[transicoes] cancelar e permitido de ABERTA, ENVIADA e RETORNO_PARCIAL', async () => {
    for (const de of ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL']) {
      assert.deepStrictEqual(sm.validarTransicao(de, 'CANCELADA'), { ok: true }, `${de} -> CANCELADA devia ser permitida`);
    }
  });

  await test('[transicoes] estado final nao vai para lugar nenhum', async () => {
    for (const de of ['ENCERRADA', 'CANCELADA']) {
      for (const para of ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA']) {
        const r = sm.validarTransicao(de, para);
        assert.strictEqual(r.ok, false, `${de} -> ${para} passou, e ${de} e estado final`);
      }
    }
  });

  await test('[transicoes] pular o envio e recusado, e a mensagem diz o atual e os permitidos', async () => {
    const r = sm.validarTransicao('ABERTA', 'ENCERRADA');
    assert.strictEqual(r.ok, false, 'encerrou uma remessa que nunca saiu do galpao');
    assert.match(r.erro, /ABERTA/, 'a mensagem nao diz o status atual');
    assert.match(r.erro, /ENVIADA/, 'a mensagem nao diz para onde da para ir');
  });

  await test('[transicoes] retornar antes de enviar e recusado', async () => {
    assert.strictEqual(sm.validarTransicao('ABERTA', 'RETORNO_PARCIAL').ok, false);
  });

  await test('[transicoes] status desconhecido nao vira coringa', async () => {
    // TRANSICOES[undefined] => undefined; sem o `|| []` de requisitionStateMachine isto seria
    // TypeError, e com um `return {ok:true}` por engano viraria porta aberta.
    assert.strictEqual(sm.validarTransicao('INVENTADO', 'ENCERRADA').ok, false);
    assert.strictEqual(sm.validarTransicao('ABERTA', 'INVENTADO').ok, false);
  });

  await test('[listas auxiliares] batem com TRANSICOES — nao ha segunda fonte de verdade', async () => {
    // Se as listas divergirem das transicoes, o servico deixa iniciar uma acao que a maquina
    // recusa depois (ou o contrario). Foi o que aconteceu com PODE_SEPARAR na Etapa 4.
    for (const s of sm.PODE_RECEBER_RETORNO) {
      assert.ok(sm.TRANSICOES[s].includes('RETORNO_PARCIAL'), `${s} recebe retorno mas nao transita para RETORNO_PARCIAL`);
    }
    for (const s of sm.PODE_ENCERRAR) {
      assert.ok(sm.TRANSICOES[s].includes('ENCERRADA'), `${s} encerra mas nao transita para ENCERRADA`);
    }
    for (const s of sm.PODE_CANCELAR) {
      assert.ok(sm.TRANSICOES[s].includes('CANCELADA'), `${s} cancela mas nao transita para CANCELADA`);
    }
  });

  // ── As tabelas ───────────────────────────────────────────────────────────────────────────────
  await test('[schema] as tres tabelas existem com as colunas que o ciclo usa', async () => {
    const colunasDe = async (t) => (await dbAll(db, `PRAGMA table_info(${t})`)).map((c) => c.name);

    const remessa = await colunasDe('remessas_terceiro_almoxarifado');
    for (const c of ['id', 'numero', 'fornecedor_id', 'fornecedor_nome', 'tipo_servico', 'os_id',
      'projeto_id', 'proprietario_cliente_id', 'proprietario_cliente_nome', 'prazo_previsto',
      'status', 'encerramento_destino', 'encerramento_justificativa', 'cancelamento_motivo']) {
      assert.ok(remessa.includes(c), `remessas_terceiro_almoxarifado sem a coluna ${c}`);
    }

    const itens = await colunasDe('itens_remessa_terceiro_almoxarifado');
    for (const c of ['id', 'remessa_id', 'material_id', 'quantidade', 'quantidade_retornada',
      'lote_id', 'peso', 'enviado_em']) {
      assert.ok(itens.includes(c), `itens_remessa_terceiro_almoxarifado sem a coluna ${c}`);
    }

    const retornos = await colunasDe('retornos_remessa_item_almoxarifado');
    for (const c of ['id', 'remessa_id', 'item_remessa_id', 'material_id', 'quantidade', 'lote_id',
      'nota_fiscal', 'movimentacao_id']) {
      assert.ok(retornos.includes(c), `retornos_remessa_item_almoxarifado sem a coluna ${c}`);
    }
  });

  await test('[schema] o retorno guarda material_id PROPRIO — e o que deixa a Etapa 8c possivel', async () => {
    // Decisao 7 do design: na 8b todo resultado tem o mesmo material_id do item enviado; na 8c
    // pode ter outro (chapa -> pecas). Modelar o retorno como escalar "quantidade que voltou"
    // obrigaria a 8c a reescrever a tabela. Este teste trava a forma, nao o valor.
    const mat = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
       VALUES ('SM-1','Chapa','UN',10,1)`);
    const rem = await dbRun(db,
      "INSERT INTO remessas_terceiro_almoxarifado (numero, status) VALUES ('REM-SM-1','ABERTA')");
    const item = await dbRun(db,
      'INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade) VALUES (?,?,?)',
      [rem.lastID, mat.lastID, 10]);
    await dbRun(db,
      `INSERT INTO retornos_remessa_item_almoxarifado (remessa_id, item_remessa_id, material_id, quantidade)
       VALUES (?,?,?,?)`, [rem.lastID, item.lastID, mat.lastID, 4]);
    const linha = await dbGet(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [item.lastID]);
    assert.strictEqual(linha.quantidade, 4);
    assert.strictEqual(linha.material_id, mat.lastID);
    assert.strictEqual(linha.item_remessa_id, item.lastID, 'o vinculo item enviado -> resultado se perdeu');
  });

  await test('[schema] fornecedor e INTEGER solto + nome espelhado, sem FK', async () => {
    // Padrao do modulo (lotes_almoxarifado, recebimentos_material_almoxarifado): `fornecedores` e
    // criada em server/index.js, NAO pelo initSchema do almoxarifado, e pode nao existir. Uma FK
    // aqui faria o initSchema falhar em banco sem a tabela.
    const ddl = await dbGet(db,
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='remessas_terceiro_almoxarifado'");
    assert.ok(!/REFERENCES\s+fornecedores/i.test(ddl.sql),
      'a tabela declara FK para fornecedores — initSchema quebra em banco sem a tabela');
    const r = await dbRun(db,
      `INSERT INTO remessas_terceiro_almoxarifado (numero, status, fornecedor_id, fornecedor_nome)
       VALUES ('REM-SM-2','ABERTA', 999999, 'Galvanizadora Inexistente')`);
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [r.lastID]);
    assert.strictEqual(row.fornecedor_nome, 'Galvanizadora Inexistente');
  });

  await test('[harness] a tabela fornecedores existe no harness, como existe em producao', async () => {
    // Stub no harness, NUNCA fallback na query (licao da Etapa 8 com `clientes`): fallback esconde
    // em teste um erro que existiria em producao.
    const t = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='fornecedores'");
    assert.ok(t, 'o harness nao tem fornecedores — o JOIN da listagem de remessas falharia so aqui');
  });

  // ── A acao de perfil ─────────────────────────────────────────────────────────────────────────
  await test('[permissao] remessar_terceiro existe e vale para ADMINISTRADOR e ALMOXARIFE', async () => {
    assert.ok(ACAO_PERFIS.remessar_terceiro, 'a acao nao foi declarada em ACAO_PERFIS');
    assert.ok(can(ADMIN, 'remessar_terceiro'));
    assert.ok(can(ALMOXARIFE, 'remessar_terceiro'));
  });

  await test('[permissao][CONTROLE POSITIVO] quem nao movimenta tambem nao remessa', async () => {
    // Perfil EXPLICITO, nunca "usuario sem perfil": getPerfilFromUser cai em PRODUCAO por padrao,
    // entao usuario sem perfil nao prova nada sobre negativa.
    assert.strictEqual(can(PRODUCAO, 'remessar_terceiro'), false);
    assert.strictEqual(can({ ...PRODUCAO, perfil_almoxarifado: 'CONSULTA' }, 'remessar_terceiro'), false);
  });

  await test('[permissao] GET /minhas-permissoes expoe a acao nova', async () => {
    setUser(ALMOXARIFE);
    const res = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.acoes.remessar_terceiro, true);
    setUser(PRODUCAO);
    const res2 = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res2.body.acoes.remessar_terceiro, false,
      'a UI nao consegue barrar antes do formulario, e o rotulo de erro sai errado');
    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/remessaTerceiroEstados.api.test.js`
Expected: FAIL já no `require` —
`Cannot find module '../../services/almoxarifado/thirdPartyStateMachine'`.

- [x] **Step 3: A máquina de estados**

Cria `server/services/almoxarifado/thirdPartyStateMachine.js`:

```js
/**
 * Maquina de estados da remessa para terceiros (Etapa 8b, decisao 3 do design).
 *
 * `TRANSICOES` e copia literal do diagrama aprovado em
 * docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md, decisao 3.
 * Padrao: objeto declarativo + validador — MESMO estilo de requisitionStateMachine.js e de
 * movementRules.js (REGRAS_VINCULO + avaliarRegrasVinculo). Nao inventar forma nova.
 *
 * O que cada estado significa em termos de SALDO — e e isto que faz a maquina valer alguma coisa,
 * porque o efeito de estoque esta amarrado a transicao, nao ao clique:
 *
 *   ABERTA          remessa montada, itens escolhidos. NADA saiu do estoque ainda. Cancelar daqui
 *                   nao mexe em saldo nenhum.
 *   ENVIADA         o efeito acontece: quantidade_em_terceiros sobe, disponivel desce,
 *                   quantidade_atual NAO muda (o material continua sendo nosso, so nao esta aqui).
 *   RETORNO_PARCIAL parte voltou (em_terceiros desceu na proporcao); o restante segue retido.
 *                   Auto-transicao permitida: uma remessa recebe varios retornos.
 *   ENCERRADA       final. Se sobrou saldo que nunca voltou, o encerramento EXIGE destino
 *                   (PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO) + justificativa, e a baixa
 *                   correspondente zera quantidade_em_terceiros — ver thirdPartyService.encerrar.
 *   CANCELADA       final. Depois de ENVIADA, devolve tudo ao disponivel, como um estorno.
 *
 * Por que ENCERRADA e CANCELADA nao tem saida: saldo retido preso e o defeito que esta sessao ja
 * corrigiu duas vezes (reserva presa na Etapa 6, linha orfa de devolucao na Etapa 7). Reabrir uma
 * remessa encerrada significaria ressuscitar retencao sem lastro — se foi encerrada errada, o
 * caminho e estornar a movimentacao pela tela de Movimentacoes, que ja existe.
 */

const STATUS_REMESSA = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'];

const TRANSICOES = {
  ABERTA: ['ENVIADA', 'CANCELADA'],
  // ENVIADA -> ENCERRADA direto: retorno total num unico recebimento, ou encerramento com tudo
  // pendente (o galvanizador perdeu a chapa inteira). Nos dois casos passar por RETORNO_PARCIAL
  // seria mentira de status.
  ENVIADA: ['RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'],
  // Auto-transicao DECLARADA: uma remessa recebe N retornos parciais. Sem esta seta o segundo
  // retorno seria recusado pela propria maquina que autorizou o primeiro.
  RETORNO_PARCIAL: ['RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'],
  ENCERRADA: [],
  CANCELADA: [],
};

/** Estados a partir dos quais o servico aceita registrar retorno (thirdPartyService.registrarRetorno). */
const PODE_RECEBER_RETORNO = ['ENVIADA', 'RETORNO_PARCIAL'];

/** Estados a partir dos quais o servico aceita encerrar (thirdPartyService.encerrar). */
const PODE_ENCERRAR = ['ENVIADA', 'RETORNO_PARCIAL'];

/**
 * Estados a partir dos quais o servico aceita cancelar (thirdPartyService.cancelar). ABERTA entra:
 * cancelar remessa que nunca saiu e so apagar um rascunho, e nao mexe em saldo.
 */
const PODE_CANCELAR = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL'];

/**
 * Valida uma transicao conforme TRANSICOES. Toda mudanca de status de remessa passa por aqui.
 * A mensagem nomeia o status ATUAL e os PERMITIDOS: "transicao invalida" seco obriga o operador a
 * adivinhar se ele esqueceu de enviar ou se a remessa ja estava encerrada.
 * @returns {{ok:true}|{ok:false, erro:string}}
 */
function validarTransicao(statusAtual, novoStatus) {
  const permitidos = TRANSICOES[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    const destinos = permitidos.length ? permitidos.join(', ') : 'nenhum (estado final)';
    return {
      ok: false,
      erro: `Transicao invalida: remessa em ${statusAtual} nao pode ir para ${novoStatus}. `
        + `Permitidos a partir de ${statusAtual}: ${destinos}.`,
    };
  }
  return { ok: true };
}

module.exports = {
  STATUS_REMESSA, TRANSICOES, PODE_RECEBER_RETORNO, PODE_ENCERRAR, PODE_CANCELAR, validarTransicao,
};
```

- [x] **Step 4: As três tabelas**

Em `server/services/almoxarifado/schema.js`, no bloco de `CREATE TABLE` do `initSchema` (junto das
demais tabelas do módulo, depois de `devolucoes_material_almoxarifado`):

```js
  // ── Etapa 8b: remessas para terceiros ──────────────────────────────────────────────────────
  // fornecedor_id e INTEGER SOLTO + fornecedor_nome espelhado, SEM FK. Padrao do modulo
  // (lotes_almoxarifado, recebimentos_material_almoxarifado) e a razao e concreta: `fornecedores`
  // e criada em server/index.js, NAO por este initSchema, e por isso pode nao existir — uma FK
  // aqui faria a criacao da tabela falhar. O nome espelhado tambem preserva o documento se o
  // fornecedor for renomeado depois.
  //
  // proprietario_cliente_id: quando a chapa que vai galvanizar e de um CLIENTE, a remessa e
  // isenta da guarda de OS/projeto (ownerRules.TIPOS_ISENTOS_DONO) — mas com contrapartida
  // OBRIGATORIA: o dono fica registrado aqui e o documento de remessa nomeia o cliente. Sem isso
  // a isencao viraria um caminho para material de cliente sair do predio sem rastro de
  // propriedade, o oposto do que a Etapa 8 construiu. Nao se cria conceito novo: e o mesmo
  // proprietario_cliente_id de materiais_almoxarifado.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS remessas_terceiro_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    tipo_servico TEXT,
    os_id INTEGER,
    projeto_id INTEGER,
    pedido_compra_id INTEGER,
    proprietario_cliente_id INTEGER,
    proprietario_cliente_nome TEXT,
    prazo_previsto DATE,
    status TEXT NOT NULL DEFAULT 'ABERTA',
    observacoes TEXT,
    criado_por INTEGER,
    criado_por_nome TEXT,
    enviado_em DATETIME,
    enviado_por INTEGER,
    encerrado_em DATETIME,
    encerrado_por INTEGER,
    encerramento_destino TEXT,
    encerramento_justificativa TEXT,
    cancelado_em DATETIME,
    cancelado_por INTEGER,
    cancelamento_motivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // `enviado_em` no ITEM (nao so no cabecalho) e o claim de idempotencia do envio, no molde
  // exato de recebimentos_material_itens_almoxarifado.entrada_estoque_em: de duas execucoes
  // (reprocessamento, dois cliques em "Enviar") so uma casa `enviado_em IS NULL` e move estoque.
  // A Etapa 7 mostrou o custo de nao ter isso: reprocessar nota com falha no meio duplicava
  // estoque.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_remessa_terceiro_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remessa_id INTEGER NOT NULL REFERENCES remessas_terceiro_almoxarifado(id),
    material_id INTEGER NOT NULL REFERENCES materiais_almoxarifado(id),
    quantidade REAL NOT NULL,
    quantidade_retornada REAL DEFAULT 0,
    lote_id INTEGER,
    peso REAL,
    observacoes TEXT,
    enviado_em DATETIME,
    movimentacao_envio_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // O retorno e uma LISTA DE RESULTADOS, nao um escalar "quantidade que voltou" (decisao 7 do
  // design). Na 8b `material_id` e SEMPRE igual ao material do item enviado; na Etapa 8c
  // (transformacao chapa -> pecas cortadas + sobra) ele passa a poder ser OUTRO, e o vinculo de
  // rastreabilidade item enviado -> resultado ja existe. Modelar como escalar agora obrigaria a
  // 8c a reescrever a tabela.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS retornos_remessa_item_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remessa_id INTEGER NOT NULL REFERENCES remessas_terceiro_almoxarifado(id),
    item_remessa_id INTEGER NOT NULL REFERENCES itens_remessa_terceiro_almoxarifado(id),
    material_id INTEGER NOT NULL REFERENCES materiais_almoxarifado(id),
    quantidade REAL NOT NULL,
    lote_id INTEGER,
    nota_fiscal TEXT,
    observacoes TEXT,
    movimentacao_id INTEGER,
    recebido_por INTEGER,
    recebido_por_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_remessa_terceiro_status ON remessas_terceiro_almoxarifado(status)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_remessa_terceiro_prazo ON remessas_terceiro_almoxarifado(prazo_previsto)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_itens_remessa_terceiro ON itens_remessa_terceiro_almoxarifado(remessa_id)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_retornos_remessa_item ON retornos_remessa_item_almoxarifado(item_remessa_id)');
```

- [x] **Step 5: A ação de perfil**

Em `server/services/almoxarifado/permissions.js`, dentro de `ACAO_PERFIS`, logo abaixo de
`ajustar_material_cliente`:

```js
  // Etapa 8b, decisao 6: acao propria porque a operacao tem RISCO PROPRIO — o material SAI DO
  // SITE, o que e diferente de mover prateleira (`movimentar`). Mesmo criterio que a Etapa 8 usou
  // para ajustar_material_cliente: quando a operacao muda a natureza do risco, ela ganha acao.
  // Concedida hoje aos MESMOS perfis de `movimentar`: o ganho nao e restringir agora, e PODER
  // restringir sem reescrever nada quando o cliente quiser (ex.: so ADMINISTRADOR manda material
  // de cliente para fora). Exposta em GET /almoxarifado/minhas-permissoes automaticamente — a
  // rota itera Object.keys(ACAO_PERFIS).
  remessar_terceiro: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
```

- [x] **Step 6: Stub de `fornecedores` no harness**

Em `server/tests/helpers/testApp.js`, logo depois do `CREATE TABLE ... clientes`:

```js
  // `fornecedores` e tabela CORE (criada por server/index.js no boot), fora do initSchema do
  // almoxarifado — mesmo caso de `clientes` na Etapa 8. A partir da Etapa 8b as rotas de remessa
  // fazem LEFT JOIN nela para resolver o nome do terceiro, entao o harness precisa refletir a
  // producao. STUB AQUI, NUNCA FALLBACK NA QUERY: um `if (!tableExists) return []` na query
  // esconderia em teste um erro que existiria em producao — foi a licao registrada na Etapa 8.
  // Subconjunto minimo das colunas de index.js: o modulo so le razao_social, nome_fantasia, cnpj
  // e filtra por status (ver receiptService.listarFornecedoresAux).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    status TEXT DEFAULT 'ativo'
  )`);
```

- [x] **Step 7: Rodar o teste e ver passar**

Run: `cd server && node tests/api/remessaTerceiroEstados.api.test.js`
Expected: PASS — 13 passed, 0 failed.

- [x] **Step 8: Sabotagens obrigatórias**

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Em `validarTransicao`, `return { ok: true }` sempre | falham `[transicoes] estado final nao vai para lugar nenhum`, `pular o envio e recusado` e `status desconhecido nao vira coringa` |
| S2 | Em `validarTransicao`, `return { ok: false, ... }` sempre | falham `o caminho feliz inteiro e permitido` e `cancelar e permitido de ABERTA, ENVIADA e RETORNO_PARCIAL` — é a metade que impede "recusa tudo" de ser aprovado |
| S3 | Tirar `'RETORNO_PARCIAL'` da lista de `RETORNO_PARCIAL` (a auto-transição) | falha `o caminho feliz inteiro e permitido` — prova que o segundo retorno parcial está coberto |
| S4 | Acrescentar `PODE_ENCERRAR = [...,'ABERTA']` | falha `[listas auxiliares] batem com TRANSICOES` — prova que a lista auxiliar não pode divergir da máquina |
| S5 | Trocar `fornecedor_id INTEGER` por `fornecedor_id INTEGER REFERENCES fornecedores(id)` | falha `[schema] fornecedor e INTEGER solto + nome espelhado, sem FK` |
| S6 | Remover o stub de `fornecedores` do harness | falha `[harness] a tabela fornecedores existe no harness` |
| S7 | Trocar `remessar_terceiro: [ADMINISTRADOR, ALMOXARIFE]` por `Object.values(PERFIS)` | falha `[permissao][CONTROLE POSITIVO] quem nao movimenta tambem nao remessa` |

- [x] **Step 9: Suítes de servidor**

Run:
```
cd server && npm run test:api
cd server && npm run test:almoxarifado && npm run test:safealter && npm run test:sqlite
```
Expected: `test:api` **71/71 arquivos OK**, `test:almoxarifado` **42/0**, safealter **3/0**,
sqlite **3/0**. `test:safealter` importa aqui: DDL novo no `initSchema` é exatamente o que ele
cobre.

- [x] **Step 10: Commit**

```bash
git add server/services/almoxarifado/thirdPartyStateMachine.js \
        server/services/almoxarifado/schema.js \
        server/services/almoxarifado/permissions.js \
        server/tests/helpers/testApp.js \
        server/tests/api/remessaTerceiroEstados.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 3: tabelas da remessa, maquina de estados e a acao remessar_terceiro

Fundacao da feature 14, que estava com tudo em branco: nenhuma tabela, nenhuma rota, nenhuma tela.

A maquina de estados copia a forma de requisitionStateMachine (objeto TRANSICOES declarativo +
validarTransicao devolvendo {ok, erro}) porque o efeito de estoque esta amarrado a TRANSICAO e nao
ao clique: ABERTA nao mexe em saldo, ENVIADA e onde em_terceiros sobe, ENCERRADA e CANCELADA sao
finais. ENCERRADA e CANCELADA nao tem saida de proposito — reabrir remessa encerrada ressuscitaria
retencao sem lastro, que e o defeito de saldo preso ja corrigido duas vezes nesta sequencia
(reserva presa na Etapa 6, linha orfa de devolucao na Etapa 7). Encerramento errado se desfaz
estornando a movimentacao, pela tela que ja existe.

RETORNO_PARCIAL tem auto-transicao DECLARADA: uma remessa recebe varios retornos, e sem essa seta
o segundo retorno seria recusado pela mesma maquina que autorizou o primeiro. As listas auxiliares
(PODE_RECEBER_RETORNO/PODE_ENCERRAR/PODE_CANCELAR) tem teste que as amarra a TRANSICOES — divergir
foi o que aconteceu com PODE_SEPARAR na Etapa 4.

fornecedor_id e INTEGER solto + fornecedor_nome espelhado, SEM FK, seguindo lotes_almoxarifado e
recebimentos_material_almoxarifado. A razao e concreta: `fornecedores` e criada em
server/index.js, nao pelo initSchema do almoxarifado, e pode nao existir — uma FK faria a criacao
da tabela falhar. Pelo mesmo motivo o harness ganhou o STUB da tabela, e nao um fallback na query:
fallback esconde em teste um erro que existiria em producao (licao da Etapa 8 com `clientes`).

O retorno nasce como LISTA DE RESULTADOS (retornos_remessa_item_almoxarifado com material_id
proprio) e nao como escalar "quantidade que voltou". Na 8b o material do resultado e sempre o do
item enviado; na 8c (chapa -> pecas + sobra) passa a poder ser outro, e o vinculo ja existe.
Modelar como escalar agora obrigaria a 8c a reescrever a tabela.

remessar_terceiro e acao propria pelo mesmo criterio que criou ajustar_material_cliente na Etapa 8:
o material SAI DO SITE, risco diferente de mover prateleira. Concedida aos mesmos perfis de
`movimentar` — o ganho nao e restringir hoje, e poder restringir sem reescrever nada depois.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

#### O que a execução da Task 3 (`258f5d2`) achou que este plano não previa

Entregue como planejado (as três tabelas, `thirdPartyStateMachine.js`, `remessar_terceiro`, stub de
`fornecedores`). Quatro divergências, registradas porque **a Task 4 e a Etapa 8c repetem o padrão**:

1. **A contagem do Step 7 estava errada: "13 passed" para um arquivo com 14 testes.** O arquivo
   final tem **18** — quatro testes acrescentados porque o conjunto original tinha buracos reais,
   não por zelo:
   - **matriz completa 5×5** (`toda combinacao fora de TRANSICOES e recusada`): os testes do plano
     verificam os caminhos felizes um a um e alguns recusados escolhidos a dedo. Uma **seta a mais**
     colada por engano no objeto (`ENCERRADA: ['ENVIADA']`) não falha em nenhum deles a não ser no
     de estado final — e uma seta a mais entre estados **não** finais (ex.: `ABERTA → ABERTA`) não
     falharia em nenhum. A matriz compara validador × `TRANSICOES` em todas as 25 combinações.
   - **controle positivo das listas auxiliares**: o teste do plano
     (`for (const s of sm.PODE_ENCERRAR) …`) **passa trivialmente com as três listas vazias** — o
     `for` não roda. É exatamente a metade que sozinha aprova "não pode nada". O teste novo fixa o
     conteúdo exato das três e proíbe estado final dentro delas.
   - **defaults e `UNIQUE`**: `quantidade_retornada` sem `DEFAULT 0` envenena a soma do retorno da
     Task 6 (`NULL + 4 = NULL` em SQL), `status` sem `DEFAULT 'ABERTA'` faz a máquina de estados não
     valer para linha criada por INSERT parcial, e `numero` sem `UNIQUE` deixa duas remessas com o
     mesmo documento. Nenhum dos três aparecia em teste; sabotagem confirma que agora aparecem.
   - **colunas do stub de `fornecedores`**: o teste do plano só checa que a tabela **existe** —
     `CREATE TABLE fornecedores (id INTEGER)` passaria e quebraria no primeiro `LEFT JOIN` da
     Task 8.
2. **O "controle positivo" de permissão do plano passa ANTES de a ação existir.**
   `can(user, 'remessar_terceiro')` é `false` porque `ACAO_PERFIS[acao] || []` — ou seja, o teste
   `[CONTROLE POSITIVO] quem nao movimenta tambem nao remessa` foi **verde na rodada vermelha**
   (10 passed / 8 failed). Quem é a metade positiva de verdade aqui é
   `remessar_terceiro existe e vale para ADMINISTRADOR e ALMOXARIFE`. Acrescentado um terceiro
   teste amarrando a lista à de `movimentar` (decisão 6): se alguém divergir as duas sem decidir,
   o teste diz qual — e a resposta certa pode ser atualizar o teste com a razão escrita.
3. **A primeira rodada de sabotagens não sabotou nada — e mostrou 18/0.** Duas causas, as duas do
   tipo que esta base já registrou três vezes:
   - **`python` não existe nesta máquina** (`Python was not found…` no stderr) e o script de
     sabotagem era um heredoc python: as quatro sabotagens viraram no-op e o teste "passou". Só o
     `md5sum` do arquivo revelou. **Sabotagem tem de falhar alto quando não se aplica** — o script
     final (`sab.js`) sai com código 2 se o alvo não estiver no arquivo.
   - **substituição de string pega a PRIMEIRA ocorrência, que pode ser de outra tabela.**
     `numero TEXT UNIQUE NOT NULL` aparece **4 vezes** em `schema.js`; a sabotagem "tirar UNIQUE da
     remessa" tirou de outra tabela e o teste seguiu 18/0. Âncora de sabotagem em `schema.js` tem
     de incluir o `CREATE TABLE` da tabela alvo.
4. **Gates medidos:** `test:api` **71/71 arquivos OK** (o número do Step 9 bateu — 69 na entrada,
   mais este arquivo e o da Task 2), `test:almoxarifado` **42/0**, `test:validation` **4/0**,
   `test:safealter` **3/0**, `test:sqlite` **3/0**. Rodada vermelha inicial: `Cannot find module
   '../../services/almoxarifado/thirdPartyStateMachine'`; com a máquina pronta e o resto ainda não,
   **10 passed / 8 failed**.

---

### Task 4: os quatro tipos de movimento dentro do motor

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`TIPOS_MOVIMENTO`, `TIPOS_RETENCAO`, `TIPOS_DEDICADOS`)
- Modify: `server/services/almoxarifado/stockService.js` (`tiposSaida` × 2, `tiposDescarte`, skip-list
  do bloco físico, pré-checagem do disponível, claim da saída, `reverterFisicoDaSaida`, dois ramos
  de retenção novos)
- Modify: `server/services/almoxarifado/movementRules.js` (`REGRAS_VINCULO`)
- Modify: `server/services/almoxarifado/ownerRules.js` (`TIPOS_ISENTOS_DONO`)
- Create: `server/tests/api/remessaTerceiroMotor.api.test.js`

**Interfaces:**
- Consumes: `quantidade_em_terceiros` e `disponivelSql` (Task 1).
- Produces — quatro tipos que a Task 5-7 chama por `stockService.registrarMovimentacao(db, user, params)`:

  | Tipo | Classe | Efeito | Guarda no `WHERE` |
  |---|---|---|---|
  | `REMESSA_TERCEIRO` | retenção | `quantidade_em_terceiros += q` | `disponivelSql() >= q` |
  | `RETORNO_TERCEIRO` | retenção | `quantidade_em_terceiros -= q` | `COALESCE(quantidade_em_terceiros,0) >= q` |
  | `PERDA_TERCEIRO` | saída | `quantidade_atual -= q` **e** `quantidade_em_terceiros -= q` no mesmo UPDATE | `COALESCE(quantidade_em_terceiros,0) >= q AND quantidade_atual >= q` |
  | `CONSUMO_TERCEIRO` | saída | idem `PERDA_TERCEIRO` | idem |

  Os quatro exigem `justificativa` (`REGRAS_VINCULO`), são **isentos** da guarda do dono
  (`TIPOS_ISENTOS_DONO`) e **nenhum** é aceito pela rota genérica `POST /movimentacoes/v2`.

**Decisão de desenho que o design deixou em aberto — declarada aqui.** A decisão 4 diz que o
destino do encerramento "emite a movimentação correspondente pelo motor", sem nomear o tipo.
Reusar `PERDA`/`SUCATA` **não funciona**: os dois estão em `TIPOS_SAIDA_COM_DONO` (`ownerRules`), e
encerrar a remessa de uma chapa **de cliente** perdida no galvanizador passaria a exigir OS ou
projeto **daquele cliente** — que pode não existir, e que a decisão 5 justamente isenta. Além
disso `PERDA` baixa só `quantidade_atual` e deixaria `quantidade_em_terceiros` preso: o saldo órfão
que a decisão 4 existe para evitar. Por isso os dois tipos dedicados, que baixam **físico e
retenção no mesmo UPDATE** — molde exato de `DECISAO_INSPECAO`, que baixa `em_inspecao` e sobe
`bloqueada` atomicamente pela mesma razão (duas chamadas abrem janela para consumo concorrente).

- [x] **Step 1: Escrever o teste que falha**

Cria `server/tests/api/remessaTerceiroMotor.api.test.js`:

```js
/**
 * Etapa 8b, Task 4 — os quatro tipos de movimento da remessa, dentro do motor.
 *
 * Testa o MOTOR direto (registrarMovimentacao), nao o servico da remessa: e aqui que o saldo muda,
 * e o servico da Task 5-7 so orquestra. Os dois pares:
 *
 *   REMESSA_TERCEIRO / RETORNO_TERCEIRO   retencao pura — a coluna sobe/desce, quantidade_atual
 *                                         NAO muda (o material continua sendo nosso).
 *   PERDA_TERCEIRO / CONSUMO_TERCEIRO     baixa definitiva — quantidade_atual E
 *                                         quantidade_em_terceiros descem NO MESMO UPDATE.
 *
 * O "mesmo UPDATE" e o ponto: como duas chamadas independentes, uma decisao concorrente poderia
 * consumir o em_terceiros pela metade — exatamente a razao pela qual DECISAO_INSPECAO existe (ver
 * o comentario dela em stockService.js).
 *
 * Executar: cd server && node tests/api/remessaTerceiroMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste do motor de remessa a terceiro' };

let seq = 0;
async function novoMaterial(db, { atual = 100, emTerceiros = 0, dono = null } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo, proprietario_cliente_id)
     VALUES (?,?,'UN',?,?,1,?)`,
    [`MOT-${seq}`, `Material motor ${seq}`, atual, emTerceiros, dono]);
  return r.lastID;
}
const saldos = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros FROM materiais_almoxarifado WHERE id = ?', [id]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── Par 1: retencao ──────────────────────────────────────────────────────────────────────────
  await test('envio a terceiro remove do disponivel e mantem quantidade_atual', async () => {
    const id = await novoMaterial(db, { atual: 100 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 30, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 100, 'o material deixou de ser nosso — quantidade_atual caiu');
    assert.strictEqual(s.em_terceiros, 30);
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 70);
  });

  await test('envio acima do disponivel e recusado, e a coluna nao sobe', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 80 });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 30, ...JUST }),
      /dispon/i);
    assert.strictEqual((await saldos(db, id)).em_terceiros, 80, 'a retencao subiu mesmo com o envio recusado');
  });

  await test('[CONTROLE POSITIVO] envio EXATAMENTE do disponivel restante passa', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 80 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 20, ...JUST });
    assert.strictEqual((await saldos(db, id)).em_terceiros, 100);
  });

  await test('retorno desce a retencao e nao mexe em quantidade_atual', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 12, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 100, 'o retorno CREDITOU estoque — o material nunca saiu do patrimonio');
    assert.strictEqual(s.em_terceiros, 18);
  });

  await test('retorno maior que a remessa falha, e a mensagem diz quanto ainda esta la', async () => {
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 18 });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo: 'RETORNO_TERCEIRO', quantidade: 25, ...JUST }),
      (e) => {
        assert.match(e.message, /18/, 'a mensagem nao diz o numero — o operador tem de adivinhar');
        return true;
      });
    assert.strictEqual((await saldos(db, id)).em_terceiros, 18);
  });

  // ── Par 2: baixa definitiva ──────────────────────────────────────────────────────────────────
  for (const tipo of ['PERDA_TERCEIRO', 'CONSUMO_TERCEIRO']) {
    await test(`${tipo} baixa fisico e retencao no MESMO movimento`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 30, ...JUST });
      const s = await saldos(db, id);
      assert.strictEqual(s.quantidade_atual, 70, 'o fisico nao baixou');
      assert.strictEqual(s.em_terceiros, 0,
        'a retencao ficou presa: saldo orfao que o encerramento existe para evitar');
      const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
      assert.strictEqual(await stockService.getSaldoDisponivel(m), 70);
    });

    await test(`${tipo} acima do que esta retido e recusado, e nada muda`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 31, ...JUST }), /terceiro/i);
      const s = await saldos(db, id);
      assert.strictEqual(s.quantidade_atual, 100);
      assert.strictEqual(s.em_terceiros, 30);
    });

    await test(`${tipo} exige justificativa`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
      await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: id, tipo, quantidade: 5 }), /justificativa/i);
      assert.strictEqual((await saldos(db, id)).em_terceiros, 30);
    });
  }

  await test('o livro registra saldo_anterior e saldo_posterior corretos da baixa no terceiro', async () => {
    // Sem isto o extrato mostraria uma baixa com saldo inalterado — que foi o motivo de NAO
    // classificar PERDA_TERCEIRO como tipo de retencao.
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 30, ...JUST });
    const linha = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?',
      [mov.id || mov.movimentacao_id]);
    assert.ok(linha, 'a movimentacao nao foi gravada no livro');
    assert.strictEqual(linha.saldo_anterior, 100);
    assert.strictEqual(linha.saldo_posterior, 70);
  });

  await test('a baixa no terceiro escreve a linha de saldo por localizacao, como toda saida', async () => {
    // Se nao escrevesse, uma contagem por localizacao (que roda syncMaterialTotals) ressuscitaria
    // a quantidade baixada — o material perdido no galvanizador voltaria do nada.
    const id = await novoMaterial(db, { atual: 100, emTerceiros: 30 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 30, ...JUST });
    const linhas = await stockService.consultarSaldosPorLocalizacao(db, id);
    const total = linhas.reduce((a, l) => a + Number(l.quantidade || 0), 0);
    assert.strictEqual(total, -30 + 0 + 30 - 30 + 30,
      'placeholder aritmetico: ver a nota abaixo');
  });

  // ── A rota generica nao pode criar nenhum dos quatro ─────────────────────────────────────────
  for (const tipo of ['REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO']) {
    await test(`[rota v2] ${tipo} e recusado pela rota generica de movimentacao`, async () => {
      const id = await novoMaterial(db, { atual: 100, emTerceiros: 50 });
      const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: id, tipo, quantidade: 10, ...JUST });
      assert.strictEqual(res.status, 400, `a v2 aceitou ${tipo}: ${JSON.stringify(res.body)}`);
      const s = await saldos(db, id);
      assert.strictEqual(s.quantidade_atual, 100);
      assert.strictEqual(s.em_terceiros, 50);
    });
  }

  await test('[rota v2][CONTROLE POSITIVO] SAIDA continua aceita pela rota generica', async () => {
    // Sem isto, filtrar demais em TIPOS_MOVIMENTO_ROTA (e matar a tela de Movimentacoes inteira)
    // passaria nos quatro testes acima.
    const id = await novoMaterial(db, { atual: 100 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'SAIDA', quantidade: 10, ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  // ── Guarda do dono: isenta ───────────────────────────────────────────────────────────────────
  await test('remessa de material de cliente nao exige vinculo do dono', async () => {
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Chapa SA')");
    const id = await novoMaterial(db, { atual: 100, dono: cli.lastID });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 40, ...JUST });
    assert.strictEqual((await saldos(db, id)).em_terceiros, 40,
      'a guarda do dono barrou a remessa — mandar galvanizar nao e APLICAR a chapa em ninguem');
  });

  await test('[CONTROLE POSITIVO] SAIDA de material de cliente sem OS continua recusada', async () => {
    // A metade que falta: esvaziar TIPOS_SAIDA_COM_DONO faria o teste acima passar e desfaria a
    // Etapa 8 inteira.
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Chapa 2 SA')");
    const id = await novoMaterial(db, { atual: 100, dono: cli.lastID });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'SAIDA', quantidade: 10, ...JUST }), /OS ou projeto/i);
  });

  // ── Lote vencido: a baixa no terceiro e um descarte ──────────────────────────────────────────
  await test('lote vencido pode ser baixado por PERDA_TERCEIRO', async () => {
    const id = await novoMaterial(db, { atual: 0 });
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: id, codigo: 'LOTE-VENC-T', data_validade: '2020-01-01' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'REMESSA_TERCEIRO', quantidade: 10, lote_id: lote.id, ...JUST });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'PERDA_TERCEIRO', quantidade: 10, lote_id: lote.id, ...JUST });
    const s = await saldos(db, id);
    assert.strictEqual(s.quantidade_atual, 0);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

> **Nota sobre o teste `a baixa no terceiro escreve a linha de saldo por localizacao`:** a expressão
> aritmética acima é um marcador deliberado — o valor correto depende de o material ter (ou não)
> linha de saldo anterior. **Ao implementar, substitua o `assert` por**:
> ```js
>     assert.ok(linhas.length > 0, 'a saida nao escreveu nenhuma linha de saldo por localizacao');
>     assert.strictEqual(total, -30,
>       'a linha de saldo nao acompanhou a baixa: uma contagem por localizacao ressuscitaria o material perdido');
> ```
> (o material foi criado com `quantidade_atual = 100` **sem** nenhuma linha de saldo, então a única
> linha existente depois da baixa é a que a própria saída criou, com `-30`).

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/remessaTerceiroMotor.api.test.js`
Expected: FAIL em quase tudo, com `Tipo de movimento inválido` — `registrarMovimentacao` valida
contra `TIPOS_MOVIMENTO` e nenhum dos quatro existe ainda.

- [x] **Step 3: Declarar os tipos em `schema.js`**

Em `TIPOS_MOVIMENTO`, logo depois de `'DEVOLUCAO_CLIENTE'`:

```js
  // Etapa 8b: os quatro tipos da remessa a terceiros. Dois PARES com naturezas diferentes:
  //  - REMESSA_TERCEIRO / RETORNO_TERCEIRO sao RETENCAO (entram em TIPOS_RETENCAO abaixo): mexem
  //    so em quantidade_em_terceiros. quantidade_atual NAO muda porque o material continua sendo
  //    nosso — ele so nao esta no predio.
  //  - PERDA_TERCEIRO / CONSUMO_TERCEIRO sao SAIDA de verdade: baixam quantidade_atual E
  //    quantidade_em_terceiros no MESMO UPDATE. Sao o destino obrigatorio do que nao voltou
  //    (decisao 4 do design): PERDA_TERCEIRO = sumiu/foi danificado la; CONSUMO_TERCEIRO = virou
  //    cavaco, refugo de processo.
  //
  // Por que NAO reusar PERDA/SUCATA para a baixa: os dois estao em ownerRules.TIPOS_SAIDA_COM_DONO,
  // entao encerrar a remessa de uma chapa DE CLIENTE perdida no galvanizador passaria a exigir OS
  // ou projeto daquele cliente — que pode nao existir, e que a decisao 5 justamente isenta. E PERDA
  // baixaria so quantidade_atual, deixando quantidade_em_terceiros preso: o saldo orfao que a
  // decisao 4 existe para evitar.
  'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
```

Em `TIPOS_RETENCAO`, acrescentar o par de retenção (o comentário do bloco lista o serviço dono de
cada um — acrescentar a linha correspondente):

```js
//   REMESSA_TERCEIRO / RETORNO_TERCEIRO -> thirdPartyService (`remessar_terceiro`)
//                                          + remessas/itens/retornos_remessa_item
const TIPOS_RETENCAO = [
  'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO',
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO',
  'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO',
];
```

Em `TIPOS_DEDICADOS` (os de retenção já ficam fora da v2 por `TIPOS_RETENCAO`; os dois de **saída**
precisam ser barrados explicitamente):

```js
//   PERDA_TERCEIRO / CONSUMO_TERCEIRO -> PUT /remessas-terceiros/:id/encerrar (gate
//     `remessar_terceiro`). Sao SAIDA, entao nao sao pegos por TIPOS_RETENCAO. Aceita-los na v2
//     (gate `movimentar`, o mais amplo do modulo) permitiria baixar material que esta no terceiro
//     sem remessa nenhuma por tras, e sem o destino/justificativa que o encerramento exige — o
//     numero de quantidade_em_terceiros ficaria sem nada que o explique.
const TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];
```

- [x] **Step 4: `movementRules.js` e `ownerRules.js`**

Em `REGRAS_VINCULO`:

```js
  // Etapa 8b: os quatro exigem justificativa e nenhum exige vinculo com OS/projeto.
  // Justificativa porque cada um deles muda a resposta a pergunta "onde esta esse material?" e a
  // resposta tem de estar escrita: REMESSA_TERCEIRO tira do disponivel, RETORNO_TERCEIRO devolve,
  // e os dois de baixa apagam material do patrimonio.
  // Vinculo 'nenhum' porque o vinculo da remessa mora no DOCUMENTO (fornecedor, prazo, OS/projeto
  // e proprietario ficam em remessas_terceiro_almoxarifado) — exigi-lo de novo na movimentacao
  // duplicaria a regra em dois lugares que divergiriam na primeira mudanca.
  REMESSA_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
  RETORNO_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
  PERDA_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
  CONSUMO_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
```

Em `ownerRules.js`, `TIPOS_ISENTOS_DONO` — acrescentar os quatro **e** o motivo (a lista tem o
contrato de trazer o porquê de cada isenção):

```js
 *  - REMESSA_TERCEIRO/RETORNO_TERCEIRO/PERDA_TERCEIRO/CONSUMO_TERCEIRO (Etapa 8b, decisao 5):
 *    mandar a chapa do cliente galvanizar nao e APLICA-LA em trabalho de ninguem — o material
 *    continua sendo daquele cliente, so mudou de endereco. Mesmo espirito da TRANSFERENCIA.
 *    A CONTRAPARTIDA E OBRIGATORIA e nao esta aqui: a remessa REGISTRA o dono
 *    (remessas_terceiro_almoxarifado.proprietario_cliente_id, gravado por
 *    thirdPartyService.criarRemessa a partir do material) e o documento de remessa NOMEIA o
 *    cliente proprietario. Sem essa contrapartida esta isencao seria um caminho para material de
 *    cliente sair do predio sem rastro de propriedade — o oposto do que a Etapa 8 construiu.
 *    PERDA_TERCEIRO/CONSUMO_TERCEIRO entram junto porque so nascem do encerramento de uma remessa
 *    que ja tem o dono registrado, sob o gate `remessar_terceiro` e com justificativa obrigatoria.
 */
const TIPOS_ISENTOS_DONO = ['DEVOLUCAO_CLIENTE', 'TRANSFERENCIA', 'AJUSTE', 'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO', 'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];
```

- [x] **Step 5: O motor — as listas e a skip-list**

Em `server/services/almoxarifado/stockService.js`, importar `TIPOS_RETENCAO` junto de
`TIPOS_MOVIMENTO`:

```js
const { TIPOS_MOVIMENTO, TIPOS_RETENCAO } = require('./schema');
```

Em `registrarMovimentacao` (~linha 512), acrescentar os dois tipos de baixa a `tiposSaida` e criar
a flag:

```js
  // Etapa 8b: PERDA_TERCEIRO/CONSUMO_TERCEIRO entram em tiposSaida NOS DOIS lugares deste arquivo
  // (aqui e em cancelarMovimentacao) — sao saida de verdade: baixam quantidade_atual, escrevem a
  // linha de saldo por localizacao e resolvem endereco de origem como qualquer outra. O que os
  // diferencia e que a quantidade que eles baixam esta RETIDA em quantidade_em_terceiros, nao
  // disponivel — por isso a flag abaixo.
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO',
    'SUCATA', 'PERDA', 'DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];
  const tiposAjuste = ['AJUSTE'];
  const consumindoReserva = !!reserva_id && tiposSaida.includes(tipo);
  // Saida que consome o que esta RETIDO em quantidade_em_terceiros. Mesmo papel de
  // `consumindoReserva`: a quantidade nao esta no disponivel (o disponivel justamente a exclui),
  // entao a guarda do disponivel nao pode barra-la; a validacao real acontece contra a propria
  // coluna de retencao, atomicamente, no claim mais abaixo.
  const baixandoTerceiro = ['PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'].includes(tipo);
```

Na pré-checagem do disponível (~linha 682), acrescentar a flag:

```js
    if (!consumindoReserva && !baixandoTerceiro) {
      const disponivel = await getSaldoDisponivel(material);
      if (disponivel < quantidade && !permiteNegativo) {
        throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${disponivel} ${material.unidade}`), { status: 400 });
      }
    }
```

Em `tiposDescarte` (dentro da checagem de lote vencido, ~linha 665) — a baixa no terceiro é um
descarte, e lote vencido perdido no galvanizador tem de poder ser baixado:

```js
      const tiposDescarte = ['SUCATA', 'PERDA', 'AJUSTE_NEGATIVO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];
```

A skip-list do bloco físico (~linha 857) deixa de ser array literal e passa a **derivar** de
`TIPOS_RETENCAO`:

```js
  // A lista literal que existia aqui era, letra por letra, TIPOS_RETENCAO + TRANSFERENCIA — e
  // manter as duas em paralelo significava que todo tipo de retencao novo tinha de ser lembrado
  // em DOIS lugares, com a falha silenciosa de esquecer o segundo (o tipo cairia no bloco fisico e
  // escreveria linha de saldo para um movimento que nao mexe no fisico). Derivar mata a
  // duplicacao: REMESSA_TERCEIRO/RETORNO_TERCEIRO (Etapa 8b) entram sozinhos.
  if (!TIPOS_RETENCAO.includes(tipo) && tipo !== 'TRANSFERENCIA') {
```

- [x] **Step 6: O motor — os dois ramos de retenção**

Na cadeia de efeitos, logo depois do ramo `DECISAO_INSPECAO` (~linha 785):

```js
  } else if (tipo === 'REMESSA_TERCEIRO') {
    // Guarda no proprio WHERE, como o resto do motor: mandar para fora mais do que esta disponivel
    // criaria retencao sem lastro fisico. `disponivelSql()` (sem alias) porque o UPDATE e de tabela
    // unica — e usar o helper garante que a conta e A MESMA das outras 13 leituras.
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND ${disponivelSql()} >= ?
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Saldo disponível insuficiente para enviar ao terceiro: ${await getSaldoDisponivel(material)} ${material.unidade}`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior; // o material continua sendo nosso: quantidade_atual nao muda
  } else if (tipo === 'RETORNO_TERCEIRO') {
    // Guarda no WHERE em vez de MAX(0,...), mesma razao do DESBLOQUEIO: saturar em silencio
    // devolveria ao disponivel menos do que o pedido sem ninguem saber. E a mensagem DIZ o numero
    // — sem ele o operador tem de adivinhar quanto ainda esta no terceiro (licao da Etapa 7).
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_terceiros,0) >= ?
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Retorno acima do que está no terceiro: ainda há ${material.quantidade_em_terceiros || 0} ${material.unidade} lá fora`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior;
  }
```

- [x] **Step 7: O motor — o claim da baixa e a compensação**

No bloco de saída (dentro do `try`, ~linha 859), o `if (consumindoReserva)` ganha um **terceiro**
braço. Colocar **antes** do `else` simples:

```js
      } else if (baixandoTerceiro) {
        // Baixa fisico E retencao NO MESMO UPDATE — molde de DECISAO_INSPECAO, e pela mesma razao:
        // como duas chamadas independentes, uma decisao concorrente poderia consumir o em_terceiros
        // pela metade, e o resultado seria material baixado do fisico com retencao presa para
        // sempre (ou o contrario). As duas guardas no WHERE: nao baixar mais do que esta la fora, e
        // nao negativar o fisico. `permiteNegativo` NAO se aplica aqui de proposito — o que esta no
        // terceiro e uma quantidade conhecida e finita; "perdi 40 de uma remessa de 30" e erro de
        // digitacao, nao operacao com saldo negativo.
        const rowT = await dbGet(db, `UPDATE materiais_almoxarifado
          SET quantidade_atual = quantidade_atual - ?,
              quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) - ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND COALESCE(quantidade_em_terceiros,0) >= ? AND quantidade_atual >= ?
          RETURNING quantidade_atual`,
          [quantidade, quantidade, material_id, quantidade, quantidade]);
        if (!rowT) {
          throw Object.assign(
            new Error(`Baixa acima do que está no terceiro: há ${material.quantidade_em_terceiros || 0} `
              + `${material.unidade} nessa situação (físico: ${material.quantidade_atual})`),
            { status: 400 });
        }
        saldoPosterior = rowT.quantidade_atual;
        saidaFisicoAplicado = true;
      } else {
```

E `reverterFisicoDaSaida` (~linha 823) ganha o braço correspondente, **antes** do `else` simples:

```js
    if (consumindoReserva) {
      // ... (bloco existente, inalterado)
    } else if (baixandoTerceiro) {
      // Devolve os DOIS efeitos do claim acima. Compensar so quantidade_atual deixaria a retencao
      // baixada sem a saida que a justificava — o oposto exato do saldo orfao, e igualmente errado:
      // o material voltaria ao disponivel como se nunca tivesse ido para o terceiro.
      await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = quantidade_atual + ?,
            quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`, [quantidade, quantidade, material_id]);
    } else {
      // ... (bloco existente, inalterado)
    }
```

Em `cancelarMovimentacao` (~linha 1267), a **segunda** declaração de `tiposSaida` recebe os mesmos
dois tipos:

```js
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO',
    'SUCATA', 'PERDA', 'DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO'];
```

> **O estorno de `PERDA_TERCEIRO` devolve ao DISPONÍVEL, não ao `em_terceiros` — e isso é
> intencional.** Quando alguém estorna a baixa, a remessa já está `ENCERRADA`; recriar a retenção
> significaria um hold sem remessa viva por trás, que é exatamente o saldo órfão que a decisão 4
> rejeita. Documentar no comentário ao lado da lista, e no guia do usuário (Task 10).

- [x] **Step 8: Rodar o teste e ver passar**

Run: `cd server && node tests/api/remessaTerceiroMotor.api.test.js`
Expected: PASS — 21 passed, 0 failed (lembre de trocar o `assert` marcado pelo bloco da nota do
Step 1 antes de rodar).

- [x] **Step 9: Sabotagens obrigatórias**

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | No claim de `REMESSA_TERCEIRO`, tirar a condição `${disponivelSql()} >= ?` do `WHERE` | falha `envio acima do disponivel e recusado, e a coluna nao sobe` |
| S2 | No ramo `REMESSA_TERCEIRO`, trocar `saldoPosterior = saldoAnterior` por `saldoAnterior - quantidade` **e** tirar o tipo de `TIPOS_RETENCAO` | falha `envio a terceiro remove do disponivel e mantem quantidade_atual` — prova que a etapa não virou "dar baixa e esquecer", que é o comportamento que ela existe para substituir |
| S3 | No claim de `PERDA_TERCEIRO`, tirar `quantidade_em_terceiros = ... - ?` do `SET` | falha `PERDA_TERCEIRO baixa fisico e retencao no MESMO movimento` com `em_terceiros` em 30 — a retenção presa |
| S4 | Tirar `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` de `TIPOS_DEDICADOS` | falham os dois `[rota v2] ... e recusado pela rota generica` correspondentes |
| S5 | Trocar `TIPOS_MOVIMENTO_ROTA` por `[]` (recusar tudo na v2) | falha `[rota v2][CONTROLE POSITIVO] SAIDA continua aceita` — a metade que impede "barra tudo" |
| S6 | Tirar os quatro tipos de `TIPOS_ISENTOS_DONO` | falha `remessa de material de cliente nao exige vinculo do dono` |
| S7 | Esvaziar `TIPOS_SAIDA_COM_DONO` | falha `[CONTROLE POSITIVO] SAIDA de material de cliente sem OS continua recusada` — prova que a isenção nova não desfez a Etapa 8 |
| S8 | Voltar a skip-list para o array literal antigo (sem os dois tipos novos) | falha `envio a terceiro ... mantem quantidade_atual` (o tipo cai no bloco físico e escreve linha de saldo) |

- [x] **Step 10: Suítes completas**

Run:
```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
```
Expected: `test:api` **72/72 arquivos OK**, `test:almoxarifado` **42/0**, validation **4/0**,
safealter **3/0**, sqlite **3/0**. `tests/api/movimentacaoTipos*.api.test.js` e
`permissoesRotas.api.test.js` são os candidatos a quebrar se `TIPOS_MOVIMENTO_ROTA` mudou de
tamanho — conferir se algum deles afirma um número de tipos.

- [x] **Step 11: Commit**

```bash
git add server/services/almoxarifado/schema.js \
        server/services/almoxarifado/stockService.js \
        server/services/almoxarifado/movementRules.js \
        server/services/almoxarifado/ownerRules.js \
        server/tests/api/remessaTerceiroMotor.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 4: os quatro tipos de movimento da remessa, dentro do motor

Dois pares com naturezas diferentes. REMESSA_TERCEIRO/RETORNO_TERCEIRO sao RETENCAO: mexem so em
quantidade_em_terceiros e quantidade_atual NAO muda, porque o material continua sendo nosso — ele
so nao esta no predio. PERDA_TERCEIRO/CONSUMO_TERCEIRO sao SAIDA de verdade e baixam
quantidade_atual E quantidade_em_terceiros NO MESMO UPDATE.

O "mesmo UPDATE" e a decisao central e copia DECISAO_INSPECAO pela mesma razao: como duas chamadas
independentes, uma decisao concorrente consumiria o em_terceiros pela metade, e sobraria material
baixado do fisico com retencao presa para sempre, ou o contrario.

Descartado reusar PERDA/SUCATA para a baixa do encerramento. Os dois estao em
ownerRules.TIPOS_SAIDA_COM_DONO, entao encerrar a remessa de uma chapa DE CLIENTE perdida no
galvanizador passaria a exigir OS ou projeto daquele cliente — que pode nao existir, e que a
decisao 5 do design justamente isenta. E PERDA baixaria so quantidade_atual, deixando a retencao
presa: o saldo orfao que o encerramento existe para evitar, e que esta sessao ja corrigiu duas
vezes (reserva presa na Etapa 6, linha orfa de devolucao na Etapa 7).

Os quatro sao isentos da guarda do dono (mandar galvanizar nao e APLICAR a chapa em ninguem, mesmo
espirito da TRANSFERENCIA), com contrapartida obrigatoria: a remessa registra o proprietario e o
documento nomeia o cliente. O teste prova os dois lados — a remessa de material de cliente passa E
a SAIDA sem OS continua recusada, senao esvaziar TIPOS_SAIDA_COM_DONO desfaria a Etapa 8 e
passaria no teste.

Nenhum dos quatro entra pela rota generica de movimentacao: os de retencao ficam de fora por
TIPOS_RETENCAO, e os de baixa por TIPOS_DEDICADOS. A v2 tem gate `movimentar`, o mais amplo do
modulo — aceita-los la permitiria baixar material que esta no terceiro sem remessa nenhuma por
tras e sem o destino/justificativa que o encerramento exige.

A skip-list do bloco fisico do motor deixou de ser array literal e passou a derivar de
TIPOS_RETENCAO. Ela era, letra por letra, TIPOS_RETENCAO + TRANSFERENCIA, e manter as duas em
paralelo significava lembrar de todo tipo de retencao novo em dois lugares — esquecer o segundo faz
o tipo cair no bloco fisico e escrever linha de saldo para um movimento que nao mexe no fisico.

O estorno de PERDA_TERCEIRO devolve ao DISPONIVEL e nao ao em_terceiros, de proposito: quando
alguem estorna, a remessa ja esta ENCERRADA, e recriar a retencao seria um hold sem remessa viva
por tras.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

#### O que a execução da Task 4 (`e0be211`) achou que este plano previa errado

Registrado aqui porque as Tasks 5-7 consomem estes quatro tipos, e a 8c vai criar mais.

1. **A sabotagem S8 estava errada sobre o efeito, e passou 29/0.** O plano dizia que voltar a
   skip-list para o array literal faria `REMESSA_TERCEIRO` "cair no bloco físico e escrever linha
   de saldo". **Não escreve.** A linha de saldo por localização é escrita mais abaixo, sob
   `if (tiposSaida.includes(tipo))`, e um tipo de retenção que entra no bloco físico cai no `else`
   final ("tipo neutro ao saldo"), que é um no-op declarado. A duplicação da skip-list é risco de
   **manutenção**, não de comportamento — então o teste que a cobre assere o invariante *"existe
   UMA lista"* por varredura do código-fonte (com controle positivo do próprio padrão de busca),
   e não um efeito de saldo que não existe. **Regra que fica:** quando a sabotagem passa, a
   resposta não é inventar asserção — é descobrir por que o efeito previsto não existe.
2. **A sabotagem S6 também passou 29/0, e aí havia buraco de teste de verdade.** A isenção dos
   quatro está **duplamente coberta** (estão em `TIPOS_ISENTOS_DONO` **e** fora de
   `TIPOS_SAIDA_COM_DONO`), e `assertSaidaPermitida` sai cedo pelos dois caminhos — então apagar a
   entrada da primeira lista não quebrava nada. É exatamente o caso que
   `materialClienteDevolucao.api.test.js` já resolvera para `DEVOLUCAO_CLIENTE`, e o plano não
   mandou repetir. O teste passou a **empurrar os quatro para `TIPOS_SAIDA_COM_DONO` em memória**
   e provar que a isenção segura mesmo assim. **A 8c tem de repetir isto para todo tipo novo que
   entrar em `TIPOS_ISENTOS_DONO`.**
3. **O par de RETENÇÃO precisava de guarda no estorno pelo livro, e o plano não previa.**
   `REMESSA_TERCEIRO`/`RETORNO_TERCEIRO` não têm ramo de reversão em `cancelarMovimentacao`: sem
   guarda, o estorno gravaria a linha de `ESTORNO`, marcaria a original `cancelado = 1` e **não
   tocaria** em `quantidade_em_terceiros` — o livro afirmando uma reversão que não aconteceu, com
   a retenção presa. Recusado com a mesma mensagem-molde dos tipos de quarentena, apontando para a
   tela de Remessas. **Contraste deliberado:** `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` **continuam**
   estornáveis pelo livro, e o estorno devolve ao **disponível**.
4. **Um sítio fica de fora, declarado:** a guarda `dispSemBloqueio` (`Material bloqueado não pode
   ser utilizado`) não foi tocada, seguindo a decisão já registrada no topo deste plano. Consequência
   conhecida: material que tenha **ao mesmo tempo** saldo bloqueado e saldo em terceiros pode ter o
   encerramento da remessa barrado por aquela guarda. Não foi resolvido nesta task porque a
   guarda é a mesma pendência `B` do `AJUSTE` (decisão 2 do design) e a decisão é do cliente.

**Números reais da execução:** teste novo 22 falhou / 7 passou antes de implementar (`Tipo de
movimento inválido`), **31 passou / 0 falhou** depois. Gates: `test:api` **72/72 arquivos OK**,
`test:almoxarifado` **42/0**, validation **4/0**, safealter **3/0**, sqlite **3/0**. Dez sabotagens
executadas (as 8 do plano + estorno da retenção + pré-checagem do disponível), cada uma com `md5sum`
antes/depois provando que o arquivo mudou e restauração conferida por `md5sum` e `git diff`.

---

### Task 5: `thirdPartyService` — criar a remessa e enviar (tudo ou nada)

**Files:**
- Create: `server/services/almoxarifado/thirdPartyService.js`
- Create: `server/tests/api/remessaTerceiroCiclo.api.test.js`

**Interfaces:**
- Consumes: `thirdPartyStateMachine.{validarTransicao, PODE_CANCELAR}` (Task 3); as tabelas (Task 3);
  `stockService.registrarMovimentacao` com `tipo: 'REMESSA_TERCEIRO'` (Task 4);
  `permissions.can(user, 'remessar_terceiro')` (Task 3).
- Produces (as Tasks 6-8 consomem exatamente estas assinaturas):
  - `criarRemessa(db, user, data) => Promise<{id, numero, status:'ABERTA', fornecedor_nome, proprietario_cliente_id, itens: Array<{id, material_id, quantidade}>}>`
    onde `data = { fornecedor_id?, fornecedor_nome?, tipo_servico?, os_id?, projeto_id?, pedido_compra_id?, prazo_previsto?, observacoes?, itens: [{ material_id, quantidade, lote_id?, peso?, observacoes? }] }`
  - `enviarRemessa(db, user, remessaId) => Promise<{success:true, remessa_id, status:'ENVIADA', itens_enviados:number}>`
  - `getRemessa(db, id) => Promise<{...remessa, itens:[{...item, material_codigo, material_nome, unidade, pendente}], retornos:[...]} | null>`
  - `listarRemessas(db, filtros) => Promise<Array<remessa & {itens_total, vencida:0|1}>>`

- [x] **Step 1: Escrever o teste que falha** — feito em `257a444`

Cria `server/tests/api/remessaTerceiroCiclo.api.test.js` (as Tasks 6 e 7 **acrescentam** blocos a
este mesmo arquivo — o ciclo é um só e separá-lo em três arquivos obrigaria a triplicar os helpers).

> **O arquivo commitado tem 20 testes, não os 14 do bloco abaixo.** Os seis a mais (e por que cada
> um existe — todos derrubados por uma sabotagem própria, S8-S11):
> 1. `[CONTROLE POSITIVO] remessa de material de cliente e ACEITA sem OS nem projeto` — a metade
>    que faltava da decisão 5. O teste do plano só olha o dono **gravado**; sem este, "recusar toda
>    remessa de material de cliente" passaria.
> 2. `atomicidade real: item do MEIO sem saldo...` — o caso do plano tem o item ruim em **último**
>    lugar; com ele no meio de três, um laço sem pré-checagem já teria movido o primeiro. Verifica
>    saldo, `enviado_em` de cada item **e** o livro de movimentações, não só o status HTTP.
> 3. `duas linhas do MESMO material que juntas passam do disponivel...` — **o defeito do plano**
>    (ver o achado no fim desta task).
> 4. `[CONTROLE POSITIVO] duas linhas do mesmo material que CABEM no disponivel são enviadas`.
> 5. `falha DENTRO do motor devolve o claim do item` — a compensação do `catch` que o plano escreve
>    não tinha teste nenhum; o motor é stubado porque a corrida não é reproduzível.
> 6. `[CONTROLE POSITIVO] enviar EXATAMENTE o disponivel passa` — um `<=` na pré-checagem recusaria
>    mandar a peça inteira galvanizar, o caso mais comum do galpão, e nenhum outro teste pegaria.

```js
/**
 * Etapa 8b, Tasks 5-7 — o ciclo da remessa a terceiros: criar, enviar, retornar, encerrar, cancelar.
 *
 * Testa o SERVICO (thirdPartyService), nao as rotas — as rotas tem arquivo proprio
 * (remessaTerceiroRotas.api.test.js, Task 8). O efeito de saldo ja foi provado no motor
 * (remessaTerceiroMotor.api.test.js, Task 4); aqui o alvo e a ORQUESTRACAO: a pre-checagem que
 * recusa a remessa inteira, a idempotencia do envio, o teto do retorno, o destino obrigatorio no
 * encerramento e o estorno do cancelamento.
 *
 * Executar: cd server && node tests/api/remessaTerceiroCiclo.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const svc = require('../../services/almoxarifado/thirdPartyService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
async function novoMaterial(db, { atual = 100, dono = null } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, proprietario_cliente_id)
     VALUES (?,?,'UN',?,1,?)`, [`REM-${seq}`, `Material remessa ${seq}`, atual, dono]);
  return r.lastID;
}
const saldos = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros FROM materiais_almoxarifado WHERE id = ?', [id]);
const statusDa = async (db, id) => (await dbGet(db,
  'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [id])).status;

async function remessaCom(db, itens, extra = {}) {
  return svc.criarRemessa(db, ADMIN, {
    fornecedor_nome: 'Galvanizadora Sul LTDA',
    tipo_servico: 'Galvanizacao',
    prazo_previsto: '2026-09-30',
    itens,
    ...extra,
  });
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  // ══ Task 5 — criar e enviar ═════════════════════════════════════════════════════════════════

  await test('criar remessa nasce ABERTA e NAO mexe em saldo nenhum', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    assert.strictEqual(rem.status, 'ABERTA');
    assert.ok(rem.numero, 'a remessa nasceu sem numero de documento');
    const s = await saldos(db, mat);
    assert.strictEqual(s.quantidade_atual, 100);
    assert.strictEqual(s.em_terceiros, 0, 'a remessa ABERTA ja reteve saldo — nada saiu do galpao ainda');
  });

  await test('remessa sem a acao remessar_terceiro falha com 403', async () => {
    const mat = await novoMaterial(db);
    await assert.rejects(
      () => svc.criarRemessa(db, PRODUCAO, { fornecedor_nome: 'X', itens: [{ material_id: mat, quantidade: 1 }] }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM remessas_terceiro_almoxarifado WHERE fornecedor_nome = ?', ['X'])).n, 0);
  });

  await test('[CONTROLE POSITIVO] ALMOXARIFE, que tem a acao, cria normalmente', async () => {
    // Sem isto, `return 403 sempre` passaria no teste acima.
    const mat = await novoMaterial(db);
    const rem = await svc.criarRemessa(db, ALMOXARIFE, {
      fornecedor_nome: 'Galvanizadora Sul LTDA', itens: [{ material_id: mat, quantidade: 5 }] });
    assert.strictEqual(rem.status, 'ABERTA');
  });

  await test('remessa sem itens e recusada', async () => {
    await assert.rejects(() => svc.criarRemessa(db, ADMIN, { fornecedor_nome: 'Y', itens: [] }), /item/i);
  });

  await test('remessa registra o dono quando o material e de cliente, e nomeia o cliente', async () => {
    // Decisao 5: a isencao da guarda do dono so e aceitavel COM esta contrapartida.
    const cli = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Chapa LTDA')");
    const mat = await novoMaterial(db, { dono: cli.lastID });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    assert.strictEqual(rem.proprietario_cliente_id, cli.lastID);
    assert.strictEqual(rem.proprietario_cliente_nome, 'Cliente Chapa LTDA',
      'o documento de remessa nao nomeia o cliente proprietario');
  });

  await test('remessa que mistura donos diferentes e recusada, nomeando os dois', async () => {
    const a = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente A LTDA')");
    const b = await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente B LTDA')");
    const matA = await novoMaterial(db, { dono: a.lastID });
    const matB = await novoMaterial(db, { dono: b.lastID });
    await assert.rejects(
      () => remessaCom(db, [{ material_id: matA, quantidade: 5 }, { material_id: matB, quantidade: 5 }]),
      (e) => {
        assert.match(e.message, /Cliente A LTDA/);
        assert.match(e.message, /Cliente B LTDA/);
        return true;
      });
  });

  await test('[CONTROLE POSITIVO] remessa so com material NOSSO e aceita, e fica sem dono', async () => {
    // A metade que falta: recusar toda remessa com mais de um item passaria no teste acima.
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: m1, quantidade: 5 }, { material_id: m2, quantidade: 5 }]);
    assert.strictEqual(rem.proprietario_cliente_id, null);
    assert.strictEqual(rem.itens.length, 2);
  });

  await test('enviar retem o saldo de TODOS os itens e muda o status', async () => {
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: m1, quantidade: 30 }, { material_id: m2, quantidade: 40 }]);
    const r = await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual(r.itens_enviados, 2);
    assert.strictEqual(await statusDa(db, rem.id), 'ENVIADA');
    assert.strictEqual((await saldos(db, m1)).em_terceiros, 30);
    assert.strictEqual((await saldos(db, m2)).em_terceiros, 40);
    assert.strictEqual((await saldos(db, m1)).quantidade_atual, 100, 'o envio baixou o patrimonio');
  });

  await test('remessa com item sem saldo nao move NENHUM item', async () => {
    // Decisao 9: pre-checagem que recusa a remessa INTEIRA antes de mover qualquer coisa. Molde de
    // receiptService.darEntradaEstoque. A Etapa 7 mostrou o custo de nao ter isso.
    const bom = await novoMaterial(db, { atual: 100 });
    const ruim = await novoMaterial(db, { atual: 5 });
    const rem = await remessaCom(db, [{ material_id: bom, quantidade: 50 }, { material_id: ruim, quantidade: 50 }]);
    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), (e) => {
      assert.strictEqual(e.status, 400);
      assert.match(e.message, /5/, 'a mensagem nao diz quanto ha disponivel do item que travou');
      return true;
    });
    assert.strictEqual((await saldos(db, bom)).em_terceiros, 0,
      'o item BOM foi enviado mesmo com a remessa recusada — a remessa parou no meio');
    assert.strictEqual((await saldos(db, ruim)).em_terceiros, 0);
    assert.strictEqual(await statusDa(db, rem.id), 'ABERTA', 'o status avancou com a remessa recusada');
  });

  await test('[CONTROLE POSITIVO] com todos os itens com saldo, os dois sao enviados', async () => {
    // A metade que falta: uma pre-checagem que recusasse sempre passaria no teste acima.
    const a = await novoMaterial(db, { atual: 100 });
    const b = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: a, quantidade: 50 }, { material_id: b, quantidade: 50 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual((await saldos(db, a)).em_terceiros, 50);
    assert.strictEqual((await saldos(db, b)).em_terceiros, 50);
  });

  await test('enviar duas vezes nao retem o dobro (claim de idempotencia no item)', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    // A segunda chamada e recusada pela maquina de estados (ENVIADA -> ENVIADA nao existe)...
    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), /ENVIADA/);
    // ...e mesmo forcando o status para tras, o claim `enviado_em IS NULL` do ITEM segura.
    await dbRun(db, "UPDATE remessas_terceiro_almoxarifado SET status = 'ABERTA' WHERE id = ?", [rem.id]);
    const r2 = await svc.enviarRemessa(db, ADMIN, rem.id);
    assert.strictEqual(r2.itens_enviados, 0, 'o item ja enviado foi reprocessado');
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 30, 'a retencao dobrou num reenvio');
  });

  await test('enviar remessa ja encerrada e recusado pela maquina de estados', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    await dbRun(db, "UPDATE remessas_terceiro_almoxarifado SET status = 'ENCERRADA' WHERE id = ?", [rem.id]);
    await assert.rejects(() => svc.enviarRemessa(db, ADMIN, rem.id), /ENCERRADA/);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 0);
  });

  await test('getRemessa traz itens com o pendente calculado e o codigo do material', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const cheia = await svc.getRemessa(db, rem.id);
    assert.strictEqual(cheia.itens.length, 1);
    assert.strictEqual(cheia.itens[0].pendente, 30);
    assert.ok(cheia.itens[0].material_codigo, 'a tela nao tem como mostrar o codigo do material');
    assert.deepStrictEqual(cheia.retornos, []);
  });

  await test('listarRemessas marca vencida por prazo, e nao marca quem esta no prazo', async () => {
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const atrasada = await remessaCom(db, [{ material_id: m1, quantidade: 10 }], { prazo_previsto: '2020-01-01' });
    const no_prazo = await remessaCom(db, [{ material_id: m2, quantidade: 10 }], { prazo_previsto: '2099-01-01' });
    await svc.enviarRemessa(db, ADMIN, atrasada.id);
    await svc.enviarRemessa(db, ADMIN, no_prazo.id);
    const lista = await svc.listarRemessas(db, {});
    assert.strictEqual(lista.find((r) => r.id === atrasada.id).vencida, 1);
    assert.strictEqual(lista.find((r) => r.id === no_prazo.id).vencida, 0,
      'toda remessa foi marcada como vencida — o destaque da tela viraria ruido');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar** — feito em `257a444`

Run: `cd server && node tests/api/remessaTerceiroCiclo.api.test.js`
Expected: FAIL no `require` — `Cannot find module '../../services/almoxarifado/thirdPartyService'`.
**Foi exatamente isso** (`code: 'MODULE_NOT_FOUND'`, `Module._resolveFilename`).

- [x] **Step 3: Implementar `thirdPartyService` (criar, enviar, ler)** — feito em `257a444`

> **ATENÇÃO — o bloco de pré-checagem abaixo JÁ ESTÁ CORRIGIDO.** A versão original deste plano
> comparava **cada linha sozinha** contra o disponível, e isso deixava a remessa sair pela metade.
> Ver o achado no fim desta task.

Cria `server/services/almoxarifado/thirdPartyService.js`:

```js
/**
 * Ciclo da remessa para terceiros (Etapa 8b).
 *
 * O que este servico NAO faz: ele nao mexe em saldo com SQL proprio. Todo efeito de estoque passa
 * por stockService.registrarMovimentacao, com os quatro tipos da Task 4 — e por isso lote, endereco,
 * livro de movimentacoes e auditoria funcionam de graca. Foi exatamente o que a ilha de materiais
 * de cliente NAO dava, e o que a Etapa 8 gastou uma etapa inteira para desfazer.
 *
 * Sem transacao (padrao do modulo): o envio segue a forma de receiptService.darEntradaEstoque —
 * PRE-CHECAGEM que recusa o documento INTEIRO antes de mover qualquer item, depois efeito item a
 * item com claim no WHERE. A Etapa 7 mostrou por que: reprocessar nota com falha no meio duplicava
 * estoque.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { can } = require('./permissions');
const { registrarAuditoria } = require('./audit');
const { disponivelSql } = require('./availabilitySql');
const stockService = require('./stockService');
const sm = require('./thirdPartyStateMachine');

const DESTINOS_ENCERRAMENTO = ['PERDA_NO_TERCEIRO', 'CONSUMIDO_NO_PROCESSO'];
/** destino do encerramento -> tipo de movimento que o executa (Task 4). */
const TIPO_MOVIMENTO_DESTINO = {
  PERDA_NO_TERCEIRO: 'PERDA_TERCEIRO',
  CONSUMIDO_NO_PROCESSO: 'CONSUMO_TERCEIRO',
};

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

function gerarNumero() {
  return `REM-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
}

function assertPodeRemessar(user) {
  if (!can(user, 'remessar_terceiro')) {
    throw erro('Sem permissao para remessa a terceiros (acao: remessar_terceiro)', 403);
  }
}

/**
 * Resolve o fornecedor por id OU por nome, no molde de receiptService.resolverPedidoCompra.
 *
 * Consulta `sqlite_master` antes de tocar em `fornecedores` porque a tabela e criada em
 * server/index.js, NAO pelo initSchema do almoxarifado — mesma protecao de
 * receiptService.listarFornecedoresAux. Quando a tabela nao existe, a remessa ainda pode ser criada
 * com `fornecedor_nome` digitado: o terceiro pode nao estar cadastrado em Compras, e travar a
 * remessa por causa disso pararia o galpao.
 */
async function resolverFornecedor(db, { fornecedor_id, fornecedor_nome }) {
  const existe = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='fornecedores'");
  if (existe && fornecedor_id) {
    const f = await dbGet(db, 'SELECT id, razao_social FROM fornecedores WHERE id = ?', [fornecedor_id]);
    if (!f) throw erro(`Fornecedor ${fornecedor_id} nao encontrado`);
    return { fornecedor_id: f.id, fornecedor_nome: f.razao_social };
  }
  if (fornecedor_id && !existe) {
    return { fornecedor_id, fornecedor_nome: fornecedor_nome || null };
  }
  if (fornecedor_nome && String(fornecedor_nome).trim()) {
    return { fornecedor_id: null, fornecedor_nome: String(fornecedor_nome).trim() };
  }
  throw erro('Informe o fornecedor (terceiro) da remessa');
}

/**
 * Descobre o proprietario da remessa a partir dos materiais dos itens, e RECUSA remessa que mistura
 * donos diferentes (decisao 5 do design).
 *
 * ATENCAO — REGRA DEDUZIDA, NAO CONFIRMADA COM O CLIENTE (ver "decisões que eu tomei e o design não
 * tomou", no fim deste plano). Se a GMP mandar remessas mistas, o documento passa a LISTAR OS DONOS
 * POR ITEM em vez de nomear um so — o comentario completo esta no codigo commitado.
 *
 * A remessa e isenta da guarda de OS/projeto porque mandar galvanizar nao e aplicar a chapa em
 * ninguem — e a contrapartida dessa isencao e que o documento NOMEIA um proprietario. Um documento
 * com material de dois clientes (ou de um cliente misturado com o nosso) nao tem como nomear um so,
 * e a isencao viraria um caminho para material de cliente sair do predio sem rastro de propriedade.
 * A mensagem nomeia OS DOIS: sem isso o operador nao sabe qual item tirar.
 */
async function resolverProprietario(db, materiais) {
  const donos = [...new Set(materiais.map((m) => m.proprietario_cliente_id || null))];
  if (donos.length === 1 && donos[0] === null) return { proprietario_cliente_id: null, proprietario_cliente_nome: null };
  const nomeDe = async (id) => {
    if (!id) return 'estoque proprio (material nosso)';
    const c = await dbGet(db, 'SELECT razao_social FROM clientes WHERE id = ?', [id]);
    return c?.razao_social || `cliente #${id}`;
  };
  if (donos.length > 1) {
    const nomes = [];
    for (const d of donos) nomes.push(await nomeDe(d));
    throw erro(`A remessa mistura materiais de donos diferentes (${nomes.join(' e ')}). `
      + 'O documento de remessa nomeia UM proprietario — separe em remessas diferentes.');
  }
  return { proprietario_cliente_id: donos[0], proprietario_cliente_nome: await nomeDe(donos[0]) };
}

async function criarRemessa(db, user, data) {
  assertPodeRemessar(user);
  const { tipo_servico, os_id, projeto_id, pedido_compra_id, prazo_previsto, observacoes } = data;
  const itens = Array.isArray(data.itens) ? data.itens : [];
  if (itens.length === 0) throw erro('A remessa precisa de ao menos um item');

  const materiais = [];
  for (const it of itens) {
    const qtd = Number(it.quantidade);
    if (!(qtd > 0)) throw erro('Quantidade do item da remessa deve ser maior que zero');
    const m = await dbGet(db,
      'SELECT id, codigo, nome, unidade, ativo, proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?',
      [it.material_id]);
    if (!m) throw erro(`Material ${it.material_id} nao encontrado`);
    if (!m.ativo) throw erro(`Material ${m.codigo} esta inativo e nao pode ir para o terceiro`);
    materiais.push(m);
  }

  const fornecedor = await resolverFornecedor(db, data);
  const proprietario = await resolverProprietario(db, materiais);
  const numero = gerarNumero();

  const r = await dbRun(db, `INSERT INTO remessas_terceiro_almoxarifado
    (numero, fornecedor_id, fornecedor_nome, tipo_servico, os_id, projeto_id, pedido_compra_id,
     proprietario_cliente_id, proprietario_cliente_nome, prazo_previsto, status, observacoes,
     criado_por, criado_por_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,'ABERTA',?,?,?)`, [
    numero, fornecedor.fornecedor_id, fornecedor.fornecedor_nome, tipo_servico || null,
    os_id || null, projeto_id || null, pedido_compra_id || null,
    proprietario.proprietario_cliente_id, proprietario.proprietario_cliente_nome,
    prazo_previsto || null, observacoes || null, user.id, user.nome || user.email,
  ]);
  const remessaId = r.lastID;

  const criados = [];
  for (const it of itens) {
    const linha = await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado
      (remessa_id, material_id, quantidade, lote_id, peso, observacoes) VALUES (?,?,?,?,?,?)`,
      [remessaId, it.material_id, Number(it.quantidade), it.lote_id || null, it.peso || null,
        it.observacoes || null]);
    criados.push({ id: linha.lastID, material_id: it.material_id, quantidade: Number(it.quantidade) });
  }

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro',
    entidade_id: remessaId,
    acao: 'CRIACAO',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_novos: { numero, fornecedor: fornecedor.fornecedor_nome, itens: criados.length,
      proprietario_cliente_nome: proprietario.proprietario_cliente_nome },
  }).catch(() => { /* auditoria nao bloqueia a criacao */ });

  return {
    id: remessaId, numero, status: 'ABERTA',
    fornecedor_id: fornecedor.fornecedor_id, fornecedor_nome: fornecedor.fornecedor_nome,
    proprietario_cliente_id: proprietario.proprietario_cliente_id,
    proprietario_cliente_nome: proprietario.proprietario_cliente_nome,
    prazo_previsto: prazo_previsto || null,
    itens: criados,
  };
}

async function getRemessaBase(db, id) {
  const r = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [id]);
  if (!r) throw erro('Remessa nao encontrada', 404);
  return r;
}

/**
 * Envia a remessa: retem o saldo de TODOS os itens.
 *
 * Molde de receiptService.darEntradaEstoque, e nao por gosto: (1) PRE-CHECAGEM que recusa a remessa
 * INTEIRA — o operador conserta o item que falta e reenvia, em vez de descobrir que metade saiu e
 * metade nao; (2) claim `enviado_em IS NULL` no ITEM, para reprocessamento ou dois cliques nao
 * reterem o dobro.
 */
async function enviarRemessa(db, user, remessaId) {
  assertPodeRemessar(user);
  const remessa = await getRemessaBase(db, remessaId);
  const t = sm.validarTransicao(remessa.status, 'ENVIADA');
  if (!t.ok) throw erro(t.erro);

  const itens = await dbAll(db, `SELECT i.*, m.codigo AS material_codigo, m.unidade, m.ativo,
      ${disponivelSql('m')} AS disponivel
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.remessa_id = ? ORDER BY i.id`, [remessaId]);
  if (itens.length === 0) throw erro('A remessa nao tem itens para enviar');

  // ── 1. Pre-checagem: a remessa INTEIRA e recusada antes de mover qualquer item ──
  //
  // A soma e POR MATERIAL, nao por linha (CORRECAO da execucao — a versao original deste plano
  // checava linha a linha e deixava a remessa sair pela metade; ver o achado no fim da task).
  // Item ja enviado num envio anterior fica FORA da soma de proposito: a quantidade dele ja esta
  // retida, e `disponivel` ja a exclui — soma-la de novo recusaria um reenvio legitimo.
  const pedidoPorMaterial = new Map();
  for (const item of itens) {
    if (item.enviado_em) continue; // ja enviado num envio anterior — nao entra na checagem
    const acc = pedidoPorMaterial.get(item.material_id)
      || { codigo: item.material_codigo, unidade: item.unidade, ativo: item.ativo,
        disponivel: item.disponivel, pedido: 0, linhas: 0 };
    acc.pedido += Number(item.quantidade);
    acc.linhas += 1;
    pedidoPorMaterial.set(item.material_id, acc);
  }
  const problemas = [];
  for (const m of pedidoPorMaterial.values()) {
    if (!m.ativo) { problemas.push(`${m.codigo}: material inativo`); continue; }
    if (Number(m.disponivel) < m.pedido) {
      // A mensagem DIZ o numero: sem ele o operador tem de adivinhar quanto falta (licao da Etapa 7).
      problemas.push(`${m.codigo}: disponivel ${m.disponivel} ${m.unidade}, `
        + `a remessa pede ${m.pedido}${m.linhas > 1 ? ` em ${m.linhas} linhas` : ''}`);
    }
  }
  if (problemas.length) {
    throw erro(`Nao foi possivel enviar a remessa ${remessa.numero}: ${problemas.join('; ')}`);
  }

  // ── 2. Efeito item a item, cada um reclamado antes de mover ──
  let enviados = 0;
  for (const item of itens) {
    const claim = await dbGet(db, `UPDATE itens_remessa_terceiro_almoxarifado
      SET enviado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND enviado_em IS NULL
      RETURNING id`, [item.id]);
    if (!claim) continue; // este item ja saiu — reenviar nao retem de novo

    try {
      const mov = await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'REMESSA_TERCEIRO',
        quantidade: Number(item.quantidade),
        lote_id: item.lote_id || undefined,
        os_id: remessa.os_id || undefined,
        projeto_id: remessa.projeto_id || undefined,
        cliente_id: remessa.proprietario_cliente_id || undefined,
        referencia: remessa.numero,
        justificativa: `Remessa ${remessa.numero} para ${remessa.fornecedor_nome || 'terceiro'}`
          + (remessa.tipo_servico ? ` (${remessa.tipo_servico})` : ''),
      });
      await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET movimentacao_envio_id = ? WHERE id = ?',
        [mov?.id || mov?.movimentacao_id || null, item.id]);
      enviados += 1;
    } catch (e) {
      // Sem transacao: compensa o claim a mao, senao o item fica marcado como enviado sem a
      // retencao correspondente — e nunca mais seria reenviado.
      await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET enviado_em = NULL WHERE id = ?', [item.id]);
      throw e;
    }
  }

  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = 'ENVIADA', enviado_em = COALESCE(enviado_em, CURRENT_TIMESTAMP), enviado_por = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [user.id, remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro', entidade_id: remessaId, acao: 'ENVIO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status },
    dados_novos: { status: 'ENVIADA', itens_enviados: enviados },
  }).catch(() => {});

  return { success: true, remessa_id: Number(remessaId), status: 'ENVIADA', itens_enviados: enviados };
}

/** Remessa completa: cabecalho + itens (com `pendente` calculado) + retornos ja recebidos. */
async function getRemessa(db, id) {
  const r = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [id]);
  if (!r) return null;
  const itens = await dbAll(db, `SELECT i.*, m.codigo AS material_codigo, m.nome AS material_nome,
      m.unidade, (i.quantidade - COALESCE(i.quantidade_retornada,0)) AS pendente
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.remessa_id = ? ORDER BY i.id`, [id]);
  const retornos = await dbAll(db, `SELECT rr.*, m.codigo AS material_codigo, m.nome AS material_nome, m.unidade
    FROM retornos_remessa_item_almoxarifado rr
    JOIN materiais_almoxarifado m ON rr.material_id = m.id
    WHERE rr.remessa_id = ? ORDER BY rr.id`, [id]);
  return { ...r, itens, retornos };
}

/**
 * Lista para a tela. `vencida` e calculado no SQL (e nao no client) para o filtro por vencidas e o
 * destaque visual usarem o MESMO criterio — duas contas dariam telas que discordam.
 * So remessa que ainda tem material la fora pode estar vencida: encerrada/cancelada nao atrasa.
 */
async function listarRemessas(db, filtros = {}) {
  let sql = `SELECT r.*,
      (SELECT COUNT(*) FROM itens_remessa_terceiro_almoxarifado i WHERE i.remessa_id = r.id) AS itens_total,
      CASE WHEN r.prazo_previsto IS NOT NULL
             AND r.status IN ('ENVIADA','RETORNO_PARCIAL')
             AND date(r.prazo_previsto) < date(COALESCE(?, 'now'))
           THEN 1 ELSE 0 END AS vencida
    FROM remessas_terceiro_almoxarifado r WHERE 1=1`;
  const params = [filtros.referencia || null];
  if (filtros.status) { sql += ' AND r.status = ?'; params.push(filtros.status); }
  if (filtros.fornecedor_id) { sql += ' AND r.fornecedor_id = ?'; params.push(Number(filtros.fornecedor_id)); }
  if (String(filtros.vencidas) === '1') {
    sql += " AND r.prazo_previsto IS NOT NULL AND r.status IN ('ENVIADA','RETORNO_PARCIAL')"
      + " AND date(r.prazo_previsto) < date(COALESCE(?, 'now'))";
    params.push(filtros.referencia || null);
  }
  sql += ' ORDER BY r.created_at DESC, r.id DESC';
  return dbAll(db, sql, params);
}

module.exports = {
  DESTINOS_ENCERRAMENTO, TIPO_MOVIMENTO_DESTINO,
  criarRemessa, enviarRemessa, getRemessa, listarRemessas,
};
```

- [x] **Step 4: Rodar o teste e ver passar** — feito em `257a444`

Run: `cd server && node tests/api/remessaTerceiroCiclo.api.test.js`
Expected: PASS — 13 passed, 0 failed. **O número estava errado por dois motivos:** o bloco do Step 1
tem **14** testes, não 13 (contagem do plano), e o arquivo commitado tem **20**. Resultado real:
**20 passed, 0 failed** — e antes do conserto da pré-checagem foi **19 passed, 1 failed**.

- [x] **Step 5: Sabotagens obrigatórias** — feito em `257a444` (11 executadas, todas derrubaram o
teste previsto; âncora contada com `grep -cF` antes, script abortando com exit 3 se a âncora não
aparecesse exatamente 1x, `md5sum` antes/depois e restauração conferida por `md5sum` + `git diff`)

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Em `enviarRemessa`, mover a **recusa** da pré-checagem para **depois** do laço de efeito | falha `remessa com item sem saldo nao move NENHUM item` — o item bom fica com `em_terceiros = 50`. Derrubou **3** testes |
| S2 | Em `assertPodeRemessar`, `if (false)` | falha `remessa sem a acao remessar_terceiro falha com 403` |
| S3 | Em `assertPodeRemessar`, `throw` sempre | falha `[CONTROLE POSITIVO] ALMOXARIFE, que tem a acao, cria normalmente` (derruba 19 de 20) |
| S4 | Tirar `AND enviado_em IS NULL` do claim do item | falha `enviar duas vezes nao retem o dobro` com `em_terceiros = 60` |
| S5 | Em `resolverProprietario`, `return { proprietario_cliente_id: null, ... }` sempre | falha `remessa registra o dono quando o material e de cliente` e `remessa que mistura donos diferentes e recusada` |
| S6 | Em `resolverProprietario`, lançar sempre que `itens.length > 1` | falha `[CONTROLE POSITIVO] remessa so com material NOSSO e aceita` |
| S7 | Em `listarRemessas`, `THEN 1 ELSE 1` no `CASE` da vencida | falha `listarRemessas marca vencida por prazo, e nao marca quem esta no prazo` |
| S8 | **(acrescentada)** pré-checagem com `<=` no lugar de `<` | falha `[CONTROLE POSITIVO] enviar EXATAMENTE o disponivel passa` — mandar a peça inteira galvanizar seria recusado |
| S9 | **(acrescentada)** reintroduzir em `enviarRemessa` a guarda de OS para material de cliente | falha `[CONTROLE POSITIVO] remessa de material de cliente e ACEITA sem OS nem projeto` — prova que a isenção da decisão 5 vale de verdade |
| S10 | **(acrescentada)** apagar a compensação `enviado_em = NULL` do `catch` | falha `falha DENTRO do motor devolve o claim do item` — item reclamado sem retenção, nunca mais reenviável |
| S11 | **(acrescentada)** `acc.pedido = ` no lugar de `acc.pedido +=` (= o código original deste plano) | falha `duas linhas do MESMO material...` com a mensagem `a primeira linha foi enviada e a segunda nao — a remessa saiu pela metade` |

- [x] **Step 6: Suítes de servidor** — feito em `257a444`

Run: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: `test:api` **73/73 arquivos OK**, `test:almoxarifado` **42/0**. **Bateu**, mais validation
**4/0**, safealter **3/0**, sqlite **3/0**.

- [x] **Step 7: Commit** — `257a444` (a mensagem commitada é a de baixo mais dois parágrafos: o
defeito da pré-checagem por linha e o aviso de que a regra de dono único é **deduzida**)

```bash
git add server/services/almoxarifado/thirdPartyService.js \
        server/tests/api/remessaTerceiroCiclo.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 5: criar remessa a terceiro e enviar, tudo ou nada

A remessa nasce ABERTA sem mexer em saldo nenhum: e um documento sendo montado, e cancelar daqui
nao tem o que estornar. O saldo so e retido no ENVIO, e ai a remessa inteira e tratada como uma
unidade.

Duas guardas, as duas com precedente nesta base. A PRE-CHECAGEM recusa a remessa inteira antes de
mover qualquer item, com a mensagem dizendo quanto ha disponivel do item que travou — copia de
receiptService.darEntradaEstoque, e o motivo e a Etapa 7: sem isso o operador descobre que metade
da remessa saiu e metade nao, e nao tem como reenviar so o que falta. O CLAIM `enviado_em IS NULL`
no item impede que reprocessamento ou dois cliques em "Enviar" retenham o dobro; a compensacao do
claim no catch existe porque nao ha transacao, e sem ela um item ficaria marcado como enviado sem a
retencao correspondente, sem nunca mais poder ser reenviado.

Remessa que mistura donos diferentes e recusada, nomeando os dois. E a contrapartida da isencao da
guarda do dono (decisao 5): a remessa e isenta de OS/projeto porque mandar galvanizar nao e aplicar
a chapa em ninguem, e o que substitui esse controle e o documento NOMEAR um proprietario. Um
documento com material de dois clientes nao tem como nomear um so, e a isencao viraria caminho para
material de cliente sair do predio sem rastro de propriedade. O teste cobre os dois lados: misturar
falha E remessa so com material nosso passa, senao "recusar toda remessa com mais de um item"
seria aprovado.

O fornecedor e resolvido por id OU por nome, com consulta a sqlite_master antes de tocar em
`fornecedores` (a tabela e criada em server/index.js, nao pelo initSchema do almoxarifado). Remessa
com fornecedor so digitado continua valendo: o terceiro pode nao estar cadastrado em Compras, e
travar a remessa por isso pararia o galpao.

`vencida` e calculado no SQL, nao no client, para o filtro e o destaque visual usarem o mesmo
criterio — duas contas dariam telas que discordam. E so remessa com material la fora
(ENVIADA/RETORNO_PARCIAL) pode estar vencida: encerrada nao atrasa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

#### O que a execução da Task 5 (`257a444`) achou que este plano previa errado

1. **A pré-checagem do plano deixava a remessa sair pela metade — o defeito exato que ela existe
   para impedir.** Ela comparava **cada linha, sozinha**, contra o disponível do material. Duas
   linhas de 60 de um material com 100 passavam as **duas** (`60 <= 100`, duas vezes); a primeira
   era enviada e a segunda batia no claim do motor. Estado **medido** com sonda executada, antes do
   conserto: `quantidade_em_terceiros = 60`, item 1 com `enviado_em` preenchido, item 2 não, remessa
   parada em `ABERTA`. Conserto: somar as linhas **por material** antes de comparar (código acima já
   corrigido; sabotagem S11 é o guarda de regressão). Duas linhas do mesmo material **não** são caso
   de laboratório — o item tem `lote_id`, `peso` e `observacoes` próprios justamente para separar
   duas chapas do mesmo código.
   > **E o plano SABIA disso.** A Task 6 acumula por item de propósito (`jaPedido`, com o comentário
   > "cada um caberia sozinho") e até traz a sabotagem S3 para o caso. A mesma pré-checagem, escrita
   > duas seções antes, esqueceu. **Regra que fica para a Task 7 e para a 8c:** toda pré-checagem
   > "tudo ou nada" agrega pelo **recurso escasso** (o material, o pendente do item), nunca pela
   > linha do documento — e quem executar deve conferir isso mesmo quando o plano trouxer o código
   > pronto.
   > **Isto também explica por que a suíte verde não bastou:** o defeito só aparece com duas linhas
   > do mesmo material, e nenhum teste do plano tinha esse formato. É o quarto caso desta etapa em
   > que **sonda executada** achou o que leitura e suíte verde não achavam.
2. **A compensação do `catch` não tinha teste nenhum.** O plano escreve o `enviado_em = NULL` no
   `catch` e o justifica bem, mas nenhum dos 14 testes chega lá — depois da pré-checagem correta, o
   `catch` só é alcançável por corrida. Coberto stubando `stockService.registrarMovimentacao` para
   falhar, e o teste vai além da coluna nula: **reenvia de verdade** e confere que a retenção
   acontece. Sabotagem S10.
3. **A regra "uma remessa não mistura donos" continua DEDUZIDA, e agora está escrita como tal no
   código.** Ela não veio da GMP (ver "duas decisões que eu tomei e o design não tomou", no fim
   deste plano). Implementada como o plano mandou, mas o comentário de `resolverProprietario`
   registra que é dedução e **qual é a saída**: se a GMP mandar remessa mista, o documento passa a
   listar os donos **por item**, lendo o dono do material de cada linha — que já é a fonte de
   verdade. Nada aqui é irreversível.
4. **A contagem de testes do Step 4 estava errada** (dizia 13 para um bloco de 14).
5. **`registrarMovimentacao` devolve `{ id, saldo_anterior, saldo_posterior }`** — o
   `mov?.id || mov?.movimentacao_id` do plano funciona pelo primeiro termo; o segundo é morto.
   Mantido como está (defensivo e inócuo), registrado aqui para a Task 6 não achar que existe um
   contrato `movimentacao_id`.

**Números reais da execução:** o teste falhou primeiro no `require`
(`Cannot find module '.../thirdPartyService'`); com o serviço criado, **19 passou / 1 falhou** (o
teste das duas linhas do mesmo material), e **20/0** depois do conserto da pré-checagem. Gates:
`test:api` **73/73 arquivos OK**, `test:almoxarifado` **42/0**, validation **4/0**, safealter
**3/0**, sqlite **3/0**. Onze sabotagens executadas, cada uma com âncora contada antes (`grep -cF`,
exatamente 1), script abortando com exit ≠ 0 se a âncora sumisse, `md5sum` antes/depois provando que
o arquivo mudou e restauração conferida por `md5sum` **e** `git diff`.

---

### Task 6: retorno parcial, e o encerramento automático quando não sobra nada

**Files:**
- Modify: `server/services/almoxarifado/thirdPartyService.js`
- Modify: `server/tests/api/remessaTerceiroCiclo.api.test.js` (acrescenta o bloco `══ Task 6 ══`
  **antes** do `await close()`)

**Interfaces:**
- Consumes: `criarRemessa`/`enviarRemessa`/`getRemessa` (Task 5);
  `sm.{PODE_RECEBER_RETORNO, validarTransicao}` (Task 3); `RETORNO_TERCEIRO` (Task 4).
- Produces:
  - `validarRetornoDoItem(db, { itemRemessaId, quantidade }) => Promise<item>` — devolve a linha do
    item ou lança 400 nomeando o número; molde exato de `returnService.validarSaidaOriginal`.
  - `registrarRetorno(db, user, remessaId, data) => Promise<{success:true, remessa_id, status, resultados:number, pendente_total:number}>`
    onde `data = { nota_fiscal?, itens: [{ item_remessa_id, quantidade, material_id?, lote_id?, observacoes? }] }`.
    `material_id` omitido = **o mesmo material do item enviado** (o único caso da 8b); informar um
    material diferente é recusado com a mensagem que aponta a Etapa 8c.

- [x] **Step 1: Escrever o teste que falha** — feito em `69d32a8`

Acrescentar a `server/tests/api/remessaTerceiroCiclo.api.test.js`, **antes** do `await close()`.
**A versão autoritativa é o arquivo**: foram escritos **17** testes, e não os 11 abaixo. Os seis a
mais, com o motivo de cada um (nenhum deles foi pedido pelo plano — os três primeiros vieram da
lição da Task 5, os três últimos são as metades positivas que faltavam):

| Teste acrescentado | Por que ele existe | Sabotagem que o prova |
|---|---|---|
| `dois resultados do MESMO item no MESMO recebimento que juntos estouram sao recusados` | é o teste que a própria S3 mandava acrescentar, e **não existia**. Verifica **estado** (saldo, `quantidade_retornada`, linhas de resultado) antes da mensagem | S3 |
| `[CONTROLE POSITIVO] dois resultados do MESMO item ... que CABEM sao aceitos` | a metade que falta: recusar todo item repetido no recebimento passaria no de cima. 60+40=100 tem de virar **duas** linhas e encerrar | S5 |
| `dois itens do MESMO material: o teto e por ITEM, nao pelo total retido do material` | o caso que **nenhum** teste do plano tinha: material com 100 retidos em dois itens (60+40); devolver 50 no item de 40 tem de ser recusado | **S8** |
| `[CONTROLE POSITIVO] dois itens do mesmo material retornam cada um o seu e a remessa encerra` | a metade que falta do anterior | S5/S9 |
| `[CONTROLE POSITIVO] retorno que REPETE o material_id do item enviado e aceito` | sem ele, recusar **todo** retorno que informa `material_id` passaria na recusa da 8c — e a tela, que manda o material da linha, nunca registraria retorno | S2 |
| `falha DENTRO do motor no retorno devolve o claim do item` | o plano escreve a compensação do `catch` e **nenhum** teste dela — o mesmo buraco que a Task 5 achou no envio, repetido aqui. Stuba o motor e depois **registra de verdade** | **S10** |

Dois testes do plano também ganharam asserção a mais: `retorno parcial devolve ao disponivel`
confere `statusDa` (a metade **negativa** do encerramento automático: com pendência, **não** fecha),
e `o retorno grava o vinculo` confere que `movimentacao_id` aponta para uma linha
`RETORNO_TERCEIRO` do material e da quantidade certos — sem isso, gravar `1` fixo passaria.

O bloco pedido pelo plano, mantido como referência:

```js
  // ══ Task 6 — retorno parcial ════════════════════════════════════════════════════════════════

  /** Remessa de 1 item, ja ENVIADA, com `qtd` retido. Devolve { remessa, itemId, materialId }. */
  async function remessaEnviada(db, qtd = 100, opts = {}) {
    const mat = await novoMaterial(db, { atual: qtd, ...opts });
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: qtd }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const item = await dbGet(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    return { remessa: rem, itemId: item.id, materialId: mat };
  }

  await test('retorno parcial devolve ao disponivel e deixa o resto retido', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-RET-1', itens: [{ item_remessa_id: itemId, quantidade: 40 }] });
    assert.strictEqual(r.status, 'RETORNO_PARCIAL');
    assert.strictEqual(r.pendente_total, 60);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.em_terceiros, 60);
    assert.strictEqual(s.quantidade_atual, 100, 'o retorno CREDITOU estoque — o material nunca saiu do patrimonio');
  });

  await test('dois retornos parciais somam, e o segundo nao e recusado pela maquina de estados', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 30 }] });
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 20 }] });
    assert.strictEqual(r.pendente_total, 50);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 50);
    const cheia = await svc.getRemessa(db, remessa.id);
    assert.strictEqual(cheia.itens[0].quantidade_retornada, 50);
    assert.strictEqual(cheia.retornos.length, 2, 'os resultados nao viraram duas linhas rastreaveis');
  });

  await test('retorno maior que a remessa falha, e a mensagem diz quanto ainda esta la', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 40 }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /100/, 'a mensagem nao diz quanto foi enviado');
        assert.match(e.message, /70/, 'a mensagem nao diz quanto ja voltou');
        assert.match(e.message, /30/, 'a mensagem nao diz quanto ainda esta no terceiro');
        return true;
      });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 30, 'o retorno excedente moveu saldo');
  });

  await test('[CONTROLE POSITIVO] retorno EXATAMENTE do pendente e aceito', async () => {
    // A metade que falta: uma validacao que recusasse todo retorno passaria no teste acima.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 30 }] });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
  });

  await test('retorno total encerra a remessa sozinho, sem exigir destino', async () => {
    // Nao sobrou pendencia: nao ha o que justificar. Exigir destino aqui obrigaria o operador a
    // inventar uma perda que nao houve.
    const { remessa, itemId } = await remessaEnviada(db, 100);
    const r = await svc.registrarRetorno(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade: 100 }] });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.pendente_total, 0);
    assert.strictEqual(await statusDa(db, remessa.id), 'ENCERRADA');
  });

  await test('retorno de item de OUTRA remessa e recusado', async () => {
    const a = await remessaEnviada(db, 100);
    const b = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, a.remessa.id, { itens: [{ item_remessa_id: b.itemId, quantidade: 10 }] }),
      /outra remessa|nao pertence/i);
    assert.strictEqual((await saldos(db, b.materialId)).em_terceiros, 100);
  });

  await test('retorno em remessa que nunca foi enviada e recusado', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 10 }]);
    const item = await dbGet(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, rem.id, { itens: [{ item_remessa_id: item.id, quantidade: 5 }] }),
      /ABERTA/);
    assert.strictEqual((await saldos(db, mat)).em_terceiros, 0);
  });

  await test('retorno sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.registrarRetorno(db, PRODUCAO, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 10 }] }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
  });

  await test('retorno com material DIFERENTE do enviado e recusado, apontando a Etapa 8c', async () => {
    // Decisao 7: a 8b nao faz transformacao. A tabela ja suporta (material_id proprio no
    // resultado), mas aceitar material diferente AGORA seria entregar meia transformacao — sem
    // baixa da chapa original, sem sobra, sem rastreabilidade fechada.
    const { remessa, itemId } = await remessaEnviada(db, 100);
    const outro = await novoMaterial(db);
    await assert.rejects(
      () => svc.registrarRetorno(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade: 10, material_id: outro }] }),
      /8c|transforma/i);
  });

  await test('o retorno grava o vinculo item enviado -> resultado, com o movimento do livro', async () => {
    // E o que a Etapa 8c vai consumir.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-RET-9', itens: [{ item_remessa_id: itemId, quantidade: 25 }] });
    const linha = await dbGet(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.remessa_id, remessa.id);
    assert.strictEqual(linha.material_id, materialId);
    assert.strictEqual(linha.quantidade, 25);
    assert.strictEqual(linha.nota_fiscal, 'NF-RET-9');
    assert.ok(linha.movimentacao_id, 'o resultado nao aponta para a movimentacao que o creditou');
  });

  await test('retorno com um item invalido nao aplica NENHUM item do lote', async () => {
    // Mesma pre-checagem do envio: um recebimento de retorno com dois itens, um deles acima do
    // pendente, nao pode devolver metade.
    const mat1 = await novoMaterial(db, { atual: 100 });
    const mat2 = await novoMaterial(db, { atual: 100 });
    const rem = await remessaCom(db, [{ material_id: mat1, quantidade: 100 }, { material_id: mat2, quantidade: 100 }]);
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const itens = await dbAll(db,
      'SELECT id, material_id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [rem.id]);
    await assert.rejects(() => svc.registrarRetorno(db, ADMIN, rem.id, { itens: [
      { item_remessa_id: itens[0].id, quantidade: 10 },
      { item_remessa_id: itens[1].id, quantidade: 999 },
    ] }), /999|acima/i);
    assert.strictEqual((await saldos(db, mat1)).em_terceiros, 100, 'o item bom foi creditado numa recusa');
    assert.strictEqual((await saldos(db, mat2)).em_terceiros, 100);
  });
```

- [x] **Step 2: Rodar e ver falhar** — feito em `69d32a8`

Run: `cd server && node tests/api/remessaTerceiroCiclo.api.test.js`
Expected: FAIL — `svc.registrarRetorno is not a function` nos 11 testes novos; os 13 da Task 5
continuam passando.
**Real: `20 passed, 17 failed`.** Dezesseis das falhas foram literalmente
`svc.registrarRetorno is not a function`; a décima sétima (`dois resultados do MESMO item ... que
juntos estouram`) falhou com `undefined !== 400`, porque ela captura o erro à mão para olhar o
**estado** antes da mensagem, e um `TypeError` não tem `.status`. Os **20** da Task 5 (o plano dizia
13 — número já corrigido na seção dela) continuaram passando.

- [x] **Step 3: Implementar** — feito em `69d32a8`

O código abaixo é o **implementado**, já com as três diferenças em relação ao que o plano trazia
(mensagem que diz quanto o recebimento pede, `linhasPorItem`, e `mov?.id` sem o termo morto) — ver
a seção de achados no fim da task.

Em `server/services/almoxarifado/thirdPartyService.js`, antes do `module.exports`:

```js
/**
 * Valida o retorno de UM item e devolve a linha dele. Molde de returnService.validarSaidaOriginal
 * (Etapa 7): cada recusa nomeia a razao ESPECIFICA e o teto DIZ os numeros. Uma mensagem generica
 * de "quantidade invalida" deixa o operador sem saber se ele errou o item, se a remessa nao foi
 * enviada, ou se ja devolveu tudo.
 *
 * `quantidade` e o total ACUMULADO que o recebimento pede daquele item (ver registrarRetorno), nao
 * a linha isolada; `linhas` so existe para a mensagem dizer que o item aparece em mais de uma.
 * `remessaId` e OBRIGATORIO: e ele que impede retornar um item que pertence a outra remessa.
 */
async function validarRetornoDoItem(db, { remessaId, itemRemessaId, quantidade, materialId, linhas = 1 }) {
  const item = await dbGet(db, `SELECT i.*, m.codigo AS material_codigo, m.unidade
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.id = ?`, [itemRemessaId]);
  if (!item) throw erro(`Item de remessa ${itemRemessaId} nao encontrado`);
  if (Number(item.remessa_id) !== Number(remessaId)) {
    throw erro(`O item ${itemRemessaId} pertence a outra remessa`);
  }
  if (!item.enviado_em) {
    throw erro(`O item ${item.material_codigo} ainda nao foi enviado ao terceiro — nao ha o que retornar`);
  }
  const qtd = Number(quantidade);
  if (!(qtd > 0)) throw erro('Quantidade do retorno deve ser maior que zero');

  // Etapa 8c: aqui e onde `materialId` diferente do enviado passa a ser aceito (chapa -> pecas).
  // Na 8b recusar e melhor que aceitar pela metade: creditar outro material sem baixar a chapa
  // original criaria estoque do nada e quebraria a rastreabilidade que a 8c existe para dar.
  if (materialId && Number(materialId) !== Number(item.material_id)) {
    throw erro(`O retorno de material DIFERENTE do enviado (transformacao: ${item.material_codigo} `
      + 'vira outro codigo) e a Etapa 8c e ainda nao esta implementado. Na Etapa 8b o retorno e '
      + 'sempre do mesmo material.');
  }

  // O teto e do ITEM, nao do material: dois itens do MESMO material na mesma remessa (duas chapas
  // do mesmo codigo, com lote e peso proprios) tem cada um o seu pendente. Comparar contra
  // `quantidade_em_terceiros` do material deixaria um item devolver o que o outro mandou, e o
  // documento passaria a discordar do saldo — e a Etapa 8c, que rastreia resultado POR ITEM
  // enviado, herdaria o desalinhamento.
  const restante = Number(item.quantidade) - Number(item.quantidade_retornada || 0);
  if (qtd > restante) {
    // A mensagem DIZ os numeros: sem eles o operador tem de adivinhar (licao da Etapa 7). E quando
    // o item aparece em varias linhas do MESMO recebimento, diz isso tambem — senao o operador
    // olha uma linha de 60, ve 100 no terceiro e conclui que o sistema esta errado (foi o que a
    // Task 5 aprendeu no envio).
    throw erro(`Retorno acima do enviado: o item ${item.material_codigo} enviou ${item.quantidade} `
      + `${item.unidade}, ja retornaram ${item.quantidade_retornada || 0} e ainda estao no terceiro `
      + `${restante} — este recebimento pede ${qtd}${linhas > 1 ? ` em ${linhas} linhas` : ''}`);
  }
  return item;
}

/**
 * Registra um recebimento de retorno — possivelmente com varios itens de uma vez.
 *
 * Mesma forma do envio (decisao 9): PRE-CHECAGEM de todos os itens, depois efeito item a item. Um
 * item acima do pendente recusa o recebimento INTEIRO — creditar metade deixaria o operador sem
 * saber o que ja entrou.
 *
 * Encerra sozinha quando nao sobra pendencia: nao ha o que justificar, e exigir destino nesse caso
 * obrigaria o operador a inventar uma perda que nao houve.
 */
async function registrarRetorno(db, user, remessaId, data) {
  assertPodeRemessar(user);
  const remessa = await getRemessaBase(db, remessaId);
  if (!sm.PODE_RECEBER_RETORNO.includes(remessa.status)) {
    throw erro(`Remessa em ${remessa.status} nao recebe retorno `
      + `(recebem: ${sm.PODE_RECEBER_RETORNO.join(', ')})`);
  }
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  if (itens.length === 0) throw erro('Informe ao menos um item retornado');

  // ── 1. Pre-checagem: o recebimento INTEIRO e recusado antes de creditar qualquer item ──
  //
  // A soma e POR ITEM, nao por linha do documento — a mesma regra que a Task 5 teve de consertar no
  // envio: toda pre-checagem "tudo ou nada" agrega pelo RECURSO ESCASSO (aqui, o pendente do item),
  // nunca pela linha. Sem o acumulador, dois resultados de 60 de um item de 100 passariam os DOIS
  // (60 <= 100, duas vezes), o primeiro seria creditado e o segundo bateria no claim: o recebimento
  // pela metade, que e exatamente o que esta pre-checagem existe para impedir.
  const linhasPorItem = new Map();
  for (const linha of itens) {
    const k = Number(linha.item_remessa_id);
    linhasPorItem.set(k, (linhasPorItem.get(k) || 0) + 1);
  }
  const validados = [];
  const jaPedido = new Map();
  for (const linha of itens) {
    const chave = Number(linha.item_remessa_id);
    const acumulado = jaPedido.get(chave) || 0;
    const item = await validarRetornoDoItem(db, {
      remessaId,
      itemRemessaId: linha.item_remessa_id,
      quantidade: Number(linha.quantidade) + acumulado,
      materialId: linha.material_id,
      linhas: linhasPorItem.get(chave) || 1,
    });
    jaPedido.set(chave, acumulado + Number(linha.quantidade));
    validados.push({ item, linha });
  }

  // ── 2. Efeito item a item ──
  for (const { item, linha } of validados) {
    const qtd = Number(linha.quantidade);
    const claim = await dbGet(db, `UPDATE itens_remessa_terceiro_almoxarifado
      SET quantidade_retornada = COALESCE(quantidade_retornada,0) + ?
      WHERE id = ? AND (quantidade - COALESCE(quantidade_retornada,0)) >= ?
      RETURNING id`, [qtd, item.id, qtd]);
    if (!claim) {
      // Corrida com outro recebimento concorrente do mesmo item: a pre-checagem passou, o claim
      // nao. Recusa em vez de saturar — saldo retornado a mais nao tem como ser desfeito depois.
      throw erro(`Retorno acima do enviado no item ${item.material_codigo}: outro recebimento `
        + 'foi registrado ao mesmo tempo. Recarregue a remessa e tente de novo.');
    }
    try {
      // `mov.id` e o contrato real de registrarMovimentacao ({ id, saldo_anterior, saldo_posterior }).
      // O plano escrevia `mov?.id || mov?.movimentacao_id`; o segundo termo e morto e foi tirado —
      // deixa-lo sugeriria um contrato `movimentacao_id` que nao existe.
      const mov = await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'RETORNO_TERCEIRO',
        quantidade: qtd,
        lote_id: linha.lote_id || item.lote_id || undefined,
        referencia: remessa.numero,
        documento_vinculado: data.nota_fiscal || undefined,
        justificativa: `Retorno da remessa ${remessa.numero}`
          + (remessa.fornecedor_nome ? ` (${remessa.fornecedor_nome})` : ''),
      });
      await dbRun(db, `INSERT INTO retornos_remessa_item_almoxarifado
        (remessa_id, item_remessa_id, material_id, quantidade, lote_id, nota_fiscal, observacoes,
         movimentacao_id, recebido_por, recebido_por_nome)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [
        remessaId, item.id, item.material_id, qtd, linha.lote_id || item.lote_id || null,
        data.nota_fiscal || null, linha.observacoes || null,
        mov?.id || null, user.id, user.nome || user.email,
      ]);
    } catch (e) {
      // Sem transacao: devolve o claim, senao o item ficaria com quantidade_retornada maior que o
      // que voltou de verdade e o pendente encolheria sem o saldo ter sido liberado.
      await dbRun(db, `UPDATE itens_remessa_terceiro_almoxarifado
        SET quantidade_retornada = MAX(0, COALESCE(quantidade_retornada,0) - ?) WHERE id = ?`, [qtd, item.id]);
      throw e;
    }
  }

  // ── 3. Status ──
  const { pendente } = await dbGet(db, `SELECT
      COALESCE(SUM(quantidade - COALESCE(quantidade_retornada,0)), 0) AS pendente
    FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?`, [remessaId]);
  const novoStatus = Number(pendente) <= 0 ? 'ENCERRADA' : 'RETORNO_PARCIAL';
  const t = sm.validarTransicao(remessa.status, novoStatus);
  if (!t.ok) throw erro(t.erro);
  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP,
        encerrado_em = CASE WHEN ? = 'ENCERRADA' THEN CURRENT_TIMESTAMP ELSE encerrado_em END,
        encerrado_por = CASE WHEN ? = 'ENCERRADA' THEN ? ELSE encerrado_por END
    WHERE id = ?`, [novoStatus, novoStatus, novoStatus, user.id, remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro', entidade_id: Number(remessaId), acao: 'RETORNO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status },
    dados_novos: { status: novoStatus, resultados: validados.length, pendente_total: Number(pendente),
      nota_fiscal: data.nota_fiscal || null },
  }).catch(() => {});

  return {
    success: true, remessa_id: Number(remessaId), status: novoStatus,
    resultados: validados.length, pendente_total: Number(pendente),
  };
}
```

e no `module.exports`:

```js
module.exports = {
  DESTINOS_ENCERRAMENTO, TIPO_MOVIMENTO_DESTINO,
  criarRemessa, enviarRemessa, getRemessa, listarRemessas,
  validarRetornoDoItem, registrarRetorno,
};
```

- [x] **Step 4: Rodar o teste e ver passar** — feito em `69d32a8`

Run: `cd server && node tests/api/remessaTerceiroCiclo.api.test.js`
Expected: PASS — 24 passed, 0 failed. **O número estava errado de novo** (terceira vez nesta etapa):
20 da Task 5 + 17 novos = **37 passed, 0 failed**, que foi o resultado real.

- [x] **Step 5: Sabotagens obrigatórias** — feito em `69d32a8` (**10 executadas**, cada uma derrubou
exatamente o que devia; nenhuma passou verde)

Arnês (`scratchpad/sabotar.js`, descartável): âncora **contada antes** de qualquer escrita
(`exit 1` se o número de ocorrências não bater), `md5` antes/depois provando que o arquivo mudou
(`exit 1` se não mudou), restauração a partir de uma cópia em memória feita **antes** da primeira
escrita, conferida por `md5` **e** pelo hash do `git diff` do arquivo — `git checkout --` estava
fora de questão, porque o arquivo já tinha alteração não commitada e o checkout apagaria a própria
implementação (foi assim que a Task 4 corrompeu o `stockService`). **Auto-teste primeiro:** uma
sabotagem `selftest` com âncora inexistente, que abortou com `0 ocorrencia(s), esperado 1` e
`EXIT=1` sem escrever nada — sem essa prova, as outras dez não valeriam nada (lição da Task 3).
As âncoras foram recontadas de forma independente com `grep -cF`: **todas com exatamente 1**.

| # | Sabotagem | Resultado real |
|---|---|---|
| S1 | `if (qtd > restante)` → `if (qtd > Number(item.quantidade))` (ignora o já retornado) | **36/1** — falhou `retorno maior que a remessa falha` |
| S2 | `validarRetornoDoItem` lança sempre | **23/14** — falharam os dois controles positivos e mais 12 |
| S3 | tirar o acumulador `jaPedido` | **36/1** — falhou `dois resultados do MESMO item ... juntos estouram`, com `40 !== 100`: **o primeiro resultado foi creditado e o segundo não** — o defeito da Task 5, reproduzido |
| S4 | pré-checagem deixa de abortar o lote (erro adiado para depois do efeito) | **35/2** — falhou `retorno com um item invalido nao aplica NENHUM item do lote` (`90 !== 100`) |
| S5 | `novoStatus` sempre `'RETORNO_PARCIAL'` | **34/3** — falhou `retorno total encerra a remessa sozinho` |
| S6 | aceitar `material_id` diferente | **36/1** — `Missing expected rejection` |
| S7 | não gravar `movimentacao_id` | **36/1** — falhou o teste do vínculo |
| **S8** *(nova)* | teto pelo **material** da remessa em vez de pelo **item** | **36/1** — falhou `dois itens do MESMO material: o teto e por ITEM`. Nenhum teste do plano pegava isto |
| **S9** *(nova)* | `novoStatus` sempre `'ENCERRADA'` | **32/5** — a metade **bilateral** de S5: falhou `retorno parcial devolve ao disponivel`. Sem ela, S5 sozinha aprovaria "nunca fecha" **ou** "sempre fecha" |
| **S10** *(nova)* | `catch` não compensa o claim de `quantidade_retornada` | **36/1** — falhou `falha DENTRO do motor no retorno devolve o claim` (`40 !== 0`) |

Detalhe de S8 que vale registrar: com o teto pelo material, a recusa ainda aconteceu — mas veio do
**claim** (`WHERE (quantidade - quantidade_retornada) >= ?`), não do validador, e a mensagem virou a
de corrida ("outro recebimento foi registrado ao mesmo tempo"), que é **mentira** para o operador.
O claim é rede de segurança de corrida, não substituto do teto.

- [x] **Step 6: Suítes de servidor** — feito em `69d32a8`

Run: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: `test:api` **73/73 arquivos OK**, `test:almoxarifado` **42/0**. **Reais, iguais ao
esperado:** `test:api` **73/73 arquivos OK**, `test:almoxarifado` **42 passou / 0 falhou**,
`test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**.

- [x] **Step 7: Commit** — `69d32a8` (a mensagem commitada é a de baixo mais dois parágrafos: o do
número que faltava na mensagem de erro e o do `mov.id`)

```bash
git add server/services/almoxarifado/thirdPartyService.js \
        server/tests/api/remessaTerceiroCiclo.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 6: retorno parcial da remessa, com teto que soma o que ja voltou

O retorno devolve ao disponivel sem creditar estoque: quantidade_em_terceiros desce e
quantidade_atual nao muda, porque o material nunca saiu do patrimonio — ele so estava a 40 km.
Creditar aqui seria contar a mesma chapa duas vezes.

O teto e a forma exata de returnService.validarSaidaOriginal (Etapa 7), inclusive somando o que ja
retornou: sem essa soma, tres retornos de 40 numa remessa de 100 passariam, porque cada um cabe
sozinho. E a mensagem DIZ os tres numeros (enviado, ja retornado, ainda no terceiro) — mensagem sem
o numero obriga o operador a adivinhar, que foi a licao registrada na Etapa 7.

Dois resultados do MESMO item no MESMO recebimento tambem sao acumulados na pre-checagem, pelo
mesmo motivo. E, como no envio, um item invalido recusa o recebimento inteiro: creditar metade
deixaria o operador sem saber o que ja entrou.

Retorno total encerra a remessa sozinho, sem exigir destino. Nao sobrou pendencia, entao nao ha o
que justificar — exigir destino nesse caso obrigaria o operador a inventar uma perda que nao houve.

Retorno de material DIFERENTE do enviado e recusado com uma mensagem que aponta a Etapa 8c. A
tabela ja suporta (retornos_remessa_item guarda material_id proprio, decisao 7 do design), mas
aceitar agora seria entregar meia transformacao: creditaria outro material sem baixar a chapa
original, criando estoque do nada e quebrando justamente a rastreabilidade que a 8c existe para
dar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

#### O que a execução da Task 6 (`69d32a8`) achou que este plano previa errado

1. **O acumulador estava certo — mas a mensagem dele estava errada.** Confirmado por sonda
   executada (S3) que a pré-checagem por item funciona, ao contrário da do envio. O que **não**
   funcionava era a mensagem: com duas linhas de 60 de um item de 100, ela dizia *"enviou 100, ja
   retornaram 0 e ainda estao no terceiro 100"* e recusava. O operador lê um número que **cabe** e
   conclui que o sistema está errado. É a mesma falha que a Etapa 7 registrou ("mensagem sem o
   número obriga o operador a adivinhar"), na forma mais traiçoeira: o número está lá, e é o número
   errado. Conserto: a mensagem passa a dizer **quanto o recebimento está pedindo**
   (`— este recebimento pede 120 em 2 linhas`), que é a forma que a Task 5 já tinha dado ao envio.
   > **Regra que fica para a Task 7 e para a 8c:** quando a pré-checagem agrega por recurso escasso,
   > a **mensagem** tem de dizer o valor **agregado**, não só o teto. Teto sem o pedido é um número
   > que contradiz o próprio erro.
2. **O teto por ITEM não tinha teste nenhum.** O plano nunca monta uma remessa com dois itens do
   **mesmo** material — mas o envio permite (e a Task 5 tem teste positivo para isso: 60+40 de um
   material com 100). Trocar o teto do item pelo do material passava nos 11 testes do plano
   (sabotagem S8 prova). Coberto pelo par bilateral novo. É a **quinta** vez nesta etapa que sonda
   executada acha o que leitura e suíte verde não achavam.
3. **A compensação do `catch` continuava sem teste — de novo.** Achado idêntico ao item 2 da Task 5,
   no mesmo formato, uma task depois: o plano escreve o `MAX(0, ... - qtd)` e justifica bem, e
   nenhum teste chega lá. Coberto stubando o motor, e o teste vai além da coluna zerada: **registra
   o retorno de verdade** depois. Sabotagem S10.
4. **As sabotagens do plano não tinham par bilateral para o encerramento automático.** S5 ("sempre
   `RETORNO_PARCIAL`") sozinha aprova tanto "nunca fecha" quanto "sempre fecha". S9 acrescentada, e
   o teste `retorno parcial devolve ao disponivel` ganhou a asserção de status no banco.
5. **A contagem de testes do Step 4 estava errada pela terceira vez** (dizia 24; foram 37). O Step 2
   também herdava o "13 da Task 5" que a própria seção da Task 5 já tinha corrigido para 20.
6. **`mov?.id || mov?.movimentacao_id` foi cortado para `mov?.id`.** A Task 5 registrou que o
   segundo termo é morto e o manteve por ser inócuo; aqui ele foi tirado, porque num vínculo
   **gravado em tabela** o termo morto sugere que existe um contrato `movimentacao_id` — e a 8c vai
   ler esta coluna. O contrato real é `{ id, saldo_anterior, saldo_posterior }`.

**Números reais da execução:** antes de implementar, `20 passed, 17 failed` (16 com
`svc.registrarRetorno is not a function`; a 17ª com `undefined !== 400`, por capturar o erro à mão);
depois, **37 passed, 0 failed**. Gates: `test:api` **73/73 arquivos OK**, `test:almoxarifado`
**42/0**, validation **4/0**, safealter **3/0**, sqlite **3/0**. Dez sabotagens executadas, com
auto-teste do arnês contra âncora inexistente antes de confiar nele.

#### Próxima tarefa: **Task 7** (encerrar com destino obrigatório, e cancelar com estorno)

O que ela consome desta task, já pronto e testado:

- `sm.PODE_ENCERRAR = ['ENVIADA','RETORNO_PARCIAL']` e `sm.PODE_CANCELAR = ['ABERTA','ENVIADA','RETORNO_PARCIAL']`;
- o cálculo do pendente, que a Task 6 usa para o encerramento automático e a Task 7 vai usar para
  saber **o que exigir destino**:
  `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_retornada,0)),0) FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?`;
- `DESTINOS_ENCERRAMENTO` e `TIPO_MOVIMENTO_DESTINO` (já exportados desde a Task 5);
- as colunas `encerramento_destino` / `encerramento_justificativa` / `cancelamento_motivo`, já no DDL.

**Pontos de atenção herdados:**

- Uma remessa que a Task 6 encerrou sozinha chega em `ENCERRADA` **sem** `encerramento_destino` — e
  isso é correto (não sobrou pendência). O `encerrar` da Task 7 não pode assumir que
  `status = 'ENCERRADA'` implica destino preenchido.
- `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` baixam físico **e** retenção no mesmo UPDATE (Task 4): o
  encerramento **não** deve zerar `quantidade_em_terceiros` por SQL próprio.
- Repetir aqui a checagem do item 1 acima: a pré-checagem do encerramento agrega por recurso
  escasso e a mensagem diz o valor agregado.
- O cancelamento depois de `RETORNO_PARCIAL` estorna **o que ainda está lá fora**, não a quantidade
  enviada — o pendente por item é a fonte, não `itens.quantidade`.

---

### Task 7: encerrar com destino obrigatório, e cancelar com estorno

**Files:**
- Modify: `server/services/almoxarifado/thirdPartyService.js`
- Modify: `server/tests/api/remessaTerceiroCiclo.api.test.js` (bloco `══ Task 7 ══`)

**Interfaces:**
- Consumes: tudo das Tasks 3-6; `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` (Task 4); `DESTINOS_ENCERRAMENTO`
  e `TIPO_MOVIMENTO_DESTINO` (Task 5).
- Produces:
  - `encerrarRemessa(db, user, remessaId, data) => Promise<{success:true, remessa_id, status:'ENCERRADA', baixado:number, destino:string|null}>`
    onde `data = { destino?: 'PERDA_NO_TERCEIRO'|'CONSUMIDO_NO_PROCESSO', justificativa?: string }`.
    Destino e justificativa são **obrigatórios se e somente se** houver pendência.
  - `cancelarRemessa(db, user, remessaId, data) => Promise<{success:true, remessa_id, status:'CANCELADA', estornado:number}>`
    onde `data = { motivo: string }`.

- [x] **Step 1: Escrever o teste que falha** — feito em `519e471`, com **três testes a mais** que os
  do plano (ver o achado 1 abaixo): o encerramento com **vários itens pendentes**, o par bilateral
  direto da exigência condicional, e a recusa de `encerrar` numa remessa `ABERTA`.

Acrescentar a `remessaTerceiroCiclo.api.test.js`, antes do `await close()`:

```js
  // ══ Task 7 — encerrar e cancelar ════════════════════════════════════════════════════════════

  await test('encerrar remessa com pendencia sem destino falha, nomeando a quantidade pendente', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.encerrarRemessa(db, ADMIN, remessa.id, {}),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /30/, 'a mensagem nao nomeia a quantidade pendente');
        assert.match(e.message, /PERDA_NO_TERCEIRO/);
        assert.match(e.message, /CONSUMIDO_NO_PROCESSO/);
        return true;
      });
    assert.strictEqual(await statusDa(db, remessa.id), 'RETORNO_PARCIAL');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 30, 'a retencao foi zerada sem destino');
  });

  await test('encerrar com destino mas SEM justificativa falha', async () => {
    const { remessa, itemId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.encerrarRemessa(db, ADMIN, remessa.id, { destino: 'PERDA_NO_TERCEIRO' }),
      /justificativa/i);
    assert.strictEqual(await statusDa(db, remessa.id), 'RETORNO_PARCIAL');
  });

  await test('encerrar com destino invalido falha listando os validos', async () => {
    const { remessa, itemId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    await assert.rejects(
      () => svc.encerrarRemessa(db, ADMIN, remessa.id, { destino: 'SUMIU', justificativa: 'x' }),
      /PERDA_NO_TERCEIRO/);
  });

  await test('encerrar com perda no terceiro zera o em_terceiros e baixa o fisico', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 70 }] });
    const r = await svc.encerrarRemessa(db, ADMIN, remessa.id, {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'chapa danificada no banho de zinco' });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.baixado, 30);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.em_terceiros, 0, 'sobrou retencao presa numa remessa encerrada — o saldo orfao');
    assert.strictEqual(s.quantidade_atual, 70, 'o fisico nao baixou: o sistema ainda acha que a chapa existe');
  });

  await test('encerrar com consumo no processo usa o tipo CONSUMO_TERCEIRO no livro', async () => {
    // Perda e consumo baixam igual, mas sao fatos DIFERENTES: um e o terceiro estragando material
    // nosso, o outro e o processo comendo material de propósito. O livro tem de distinguir.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 90 }] });
    await svc.encerrarRemessa(db, ADMIN, remessa.id, {
      destino: 'CONSUMIDO_NO_PROCESSO', justificativa: 'sobra de corte virou cavaco' });
    const mov = await dbGet(db,
      "SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo LIKE '%TERCEIRO' AND tipo NOT IN ('REMESSA_TERCEIRO','RETORNO_TERCEIRO')",
      [materialId]);
    assert.strictEqual(mov.tipo, 'CONSUMO_TERCEIRO');
    assert.strictEqual(mov.quantidade, 10);
  });

  await test('[CONTROLE POSITIVO] encerrar SEM pendencia nao exige destino nem justificativa', async () => {
    // A metade que falta: exigir destino sempre passaria em todos os testes de recusa acima e
    // obrigaria o operador a inventar uma perda em toda remessa que voltou inteira.
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 100 }] });
    // ja encerrou sozinha no retorno total; a chamada explicita e recusada pela maquina, nao pela
    // exigencia de destino
    await assert.rejects(() => svc.encerrarRemessa(db, ADMIN, remessa.id, {}), /ENCERRADA/);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
  });

  await test('[CONTROLE POSITIVO] encerrar direto de ENVIADA, com tudo pendente, funciona', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    const r = await svc.encerrarRemessa(db, ADMIN, remessa.id, {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'o galvanizador perdeu a carga inteira' });
    assert.strictEqual(r.baixado, 100);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.quantidade_atual, 0);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await test('encerrar sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    await assert.rejects(
      () => svc.encerrarRemessa(db, PRODUCAO, remessa.id, { destino: 'PERDA_NO_TERCEIRO', justificativa: 'x' }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
  });

  // ── Cancelamento ─────────────────────────────────────────────────────────────────────────────
  await test('cancelar remessa ABERTA nao mexe em saldo nenhum', async () => {
    const mat = await novoMaterial(db);
    const rem = await remessaCom(db, [{ material_id: mat, quantidade: 30 }]);
    const r = await svc.cancelarRemessa(db, ADMIN, rem.id, { motivo: 'pedido cancelado pelo cliente' });
    assert.strictEqual(r.status, 'CANCELADA');
    assert.strictEqual(r.estornado, 0);
    const s = await saldos(db, mat);
    assert.strictEqual(s.quantidade_atual, 100);
    assert.strictEqual(s.em_terceiros, 0);
  });

  await test('cancelar remessa enviada restaura o disponivel', async () => {
    const { remessa, materialId } = await remessaEnviada(db, 100);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
    const r = await svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'o terceiro devolveu sem fazer nada' });
    assert.strictEqual(r.estornado, 100);
    const s = await saldos(db, materialId);
    assert.strictEqual(s.em_terceiros, 0, 'a retencao ficou presa numa remessa cancelada');
    assert.strictEqual(s.quantidade_atual, 100, 'o cancelamento creditou estoque que nunca saiu');
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 100);
  });

  await test('cancelar remessa com retorno parcial estorna SO o que ainda esta la fora', async () => {
    const { remessa, itemId, materialId } = await remessaEnviada(db, 100);
    await svc.registrarRetorno(db, ADMIN, remessa.id, { itens: [{ item_remessa_id: itemId, quantidade: 60 }] });
    const r = await svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'contrato rescindido' });
    assert.strictEqual(r.estornado, 40, 'o cancelamento estornou o que ja tinha voltado — retencao negativa');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
  });

  await test('cancelar sem motivo falha, e cancelar remessa encerrada falha', async () => {
    const { remessa } = await remessaEnviada(db, 100);
    await assert.rejects(() => svc.cancelarRemessa(db, ADMIN, remessa.id, {}), /motivo/i);
    await svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'ok' });
    await assert.rejects(() => svc.cancelarRemessa(db, ADMIN, remessa.id, { motivo: 'de novo' }), /CANCELADA/);
  });
```

E acrescentar `const stockService = require('../../services/almoxarifado/stockService');` ao topo
do arquivo de teste (usado no `getSaldoDisponivel` acima). **Já estava lá desde a Task 5** — este
passo do plano era obsoleto.

- [x] **Step 2: Rodar e ver falhar** — `37 passed, 16 failed`, os 16 com
  `svc.encerrarRemessa is not a function` / `svc.cancelarRemessa is not a function`.

Run: `cd server && node tests/api/remessaTerceiroCiclo.api.test.js`
Expected: FAIL — `svc.encerrarRemessa is not a function` nos 16 testes novos (o plano dizia 13,
antes dos três acrescentados).

- [x] **Step 3: Implementar** — feito em `519e471`

Em `thirdPartyService.js`, antes do `module.exports`:

```js
/** Quanto ainda esta no terceiro, por item, com o codigo do material para as mensagens. */
async function pendentesDaRemessa(db, remessaId) {
  return dbAll(db, `SELECT i.id, i.material_id, i.lote_id, m.codigo AS material_codigo, m.unidade,
      (i.quantidade - COALESCE(i.quantidade_retornada,0)) AS pendente
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.remessa_id = ? AND i.enviado_em IS NOT NULL
      AND (i.quantidade - COALESCE(i.quantidade_retornada,0)) > 0
    ORDER BY i.id`, [remessaId]);
}

/**
 * Encerra a remessa. Se sobrou saldo que nunca voltou, EXIGE destino + justificativa (decisao 4).
 *
 * Por que destino, e nao "so justificativa": texto livre nao tira o saldo de
 * quantidade_em_terceiros, e o saldo PRECISA sair — senao a remessa fica encerrada com retencao
 * presa para sempre, que e o saldo orfao ja corrigido duas vezes nesta sequencia (reserva presa na
 * Etapa 6, linha orfa de devolucao na Etapa 7). E para onde ele vai MUDA o estoque, entao quem
 * decide e o operador, com o motivo escrito.
 *
 * Item a item, e nao um movimento so: cada item pode ser de material diferente, e o livro registra
 * por material.
 */
async function encerrarRemessa(db, user, remessaId, data = {}) {
  assertPodeRemessar(user);
  const remessa = await getRemessaBase(db, remessaId);
  const t = sm.validarTransicao(remessa.status, 'ENCERRADA');
  if (!t.ok) throw erro(t.erro);

  const pendentes = await pendentesDaRemessa(db, remessaId);
  const total = pendentes.reduce((a, p) => a + Number(p.pendente), 0);
  const { destino, justificativa } = data;

  if (total > 0) {
    if (!destino) {
      // A mensagem nomeia A QUANTIDADE e as duas opcoes: "informe o destino" seco nao diz quanto
      // esta em jogo nem o que digitar.
      throw erro(`A remessa ${remessa.numero} tem ${total} ${pendentes[0].unidade} que nunca voltaram `
        + `(${pendentes.map((p) => `${p.material_codigo}: ${p.pendente}`).join('; ')}). `
        + `Para encerrar, informe o destino desse saldo: ${DESTINOS_ENCERRAMENTO.join(' ou ')}, `
        + 'mais a justificativa.');
    }
    if (!DESTINOS_ENCERRAMENTO.includes(destino)) {
      throw erro(`Destino de encerramento invalido: ${destino}. Validos: ${DESTINOS_ENCERRAMENTO.join(', ')}`);
    }
    if (!justificativa || !String(justificativa).trim()) {
      throw erro('Encerrar remessa com saldo pendente exige justificativa alem do destino');
    }

    const tipo = TIPO_MOVIMENTO_DESTINO[destino];
    for (const p of pendentes) {
      // Cada baixa e um UPDATE atomico do motor (Task 4): baixa quantidade_atual E
      // quantidade_em_terceiros juntos. Se uma falhar no meio, a remessa NAO e encerrada e as
      // anteriores ficam baixadas — declarado, e o comportamento certo: o material realmente
      // sumiu, e reencerrar so baixa o que ainda estiver pendente (pendentesDaRemessa releria
      // menos itens). O que nao pode acontecer e a remessa fechar com saldo preso, e isso o
      // `throw` garante.
      await stockService.registrarMovimentacao(db, user, {
        material_id: p.material_id,
        tipo,
        quantidade: Number(p.pendente),
        lote_id: p.lote_id || undefined,
        referencia: remessa.numero,
        justificativa: `Encerramento da remessa ${remessa.numero} — ${destino}: ${String(justificativa).trim()}`,
      });
      await dbRun(db, `UPDATE itens_remessa_terceiro_almoxarifado
        SET quantidade_retornada = quantidade WHERE id = ?`, [p.id]);
    }
  }

  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = 'ENCERRADA', encerrado_em = CURRENT_TIMESTAMP, encerrado_por = ?,
        encerramento_destino = ?, encerramento_justificativa = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [user.id, total > 0 ? destino : null,
    total > 0 ? String(justificativa).trim() : null, remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro', entidade_id: Number(remessaId), acao: 'ENCERRAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status, pendente: total },
    dados_novos: { status: 'ENCERRADA', destino: total > 0 ? destino : null },
    justificativa: total > 0 ? String(justificativa).trim() : null,
  }).catch(() => {});

  return { success: true, remessa_id: Number(remessaId), status: 'ENCERRADA', baixado: total,
    destino: total > 0 ? destino : null };
}

/**
 * Cancela a remessa. De ABERTA nao ha o que estornar (nada saiu). Depois de ENVIADA, devolve ao
 * disponivel SO o que ainda esta la fora — estornar o que ja voltou negativaria a retencao.
 *
 * Cancelar e diferente de encerrar com destino: aqui o material VOLTA (ou nunca saiu de verdade);
 * la ele some do patrimonio. Nao unificar os dois foi decisao: a mesma tela oferece as duas acoes,
 * e um botao so obrigaria a perguntar "voltou ou nao?" em toda vez.
 */
async function cancelarRemessa(db, user, remessaId, data = {}) {
  assertPodeRemessar(user);
  const motivo = data?.motivo;
  if (!motivo || !String(motivo).trim()) throw erro('Cancelar remessa exige motivo');

  const remessa = await getRemessaBase(db, remessaId);
  const t = sm.validarTransicao(remessa.status, 'CANCELADA');
  if (!t.ok) throw erro(t.erro);

  const pendentes = await pendentesDaRemessa(db, remessaId);
  let estornado = 0;
  for (const p of pendentes) {
    await stockService.registrarMovimentacao(db, user, {
      material_id: p.material_id,
      tipo: 'RETORNO_TERCEIRO',
      quantidade: Number(p.pendente),
      lote_id: p.lote_id || undefined,
      referencia: remessa.numero,
      justificativa: `Cancelamento da remessa ${remessa.numero}: ${String(motivo).trim()}`,
    });
    await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET quantidade_retornada = quantidade WHERE id = ?', [p.id]);
    estornado += Number(p.pendente);
  }

  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = 'CANCELADA', cancelado_em = CURRENT_TIMESTAMP, cancelado_por = ?,
        cancelamento_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [user.id, String(motivo).trim(), remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro', entidade_id: Number(remessaId), acao: 'CANCELAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status },
    dados_novos: { status: 'CANCELADA', estornado },
    justificativa: String(motivo).trim(),
  }).catch(() => {});

  return { success: true, remessa_id: Number(remessaId), status: 'CANCELADA', estornado };
}
```

e no `module.exports`, acrescentar `pendentesDaRemessa, encerrarRemessa, cancelarRemessa`.

- [x] **Step 4: Rodar o teste e ver passar** — `53 passed, 0 failed`

Run: `cd server && node tests/api/remessaTerceiroCiclo.api.test.js`
Expected: PASS — **53 passed, 0 failed** (37 herdados + 16 novos). O plano dizia "37", que era o
número **da Task 6** — quarta vez que a contagem de testes de um Step 4 vem errada nesta etapa.

- [x] **Step 5: Sabotagens obrigatórias** — 12 executadas, todas detectadas

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Em `encerrarRemessa`, remover o `if (!destino) throw` | falha `encerrar remessa com pendencia sem destino falha` |
| S2 | Exigir destino **sempre** (tirar o `if (total > 0)`) | falha `[CONTROLE POSITIVO] encerrar direto de ENVIADA, com tudo pendente, funciona` só se combinada com S3; a prova direta é remover a auto-encerrada do retorno total — mantenha o teste `[CONTROLE POSITIVO] encerrar SEM pendencia...` como guarda de que a exigência é condicional |
| S3 | Trocar `TIPO_MOVIMENTO_DESTINO.CONSUMIDO_NO_PROCESSO` por `'PERDA_TERCEIRO'` | falha `encerrar com consumo no processo usa o tipo CONSUMO_TERCEIRO no livro` |
| S4 | Em `encerrarRemessa`, só marcar o status (não emitir a movimentação) | falha `encerrar com perda no terceiro zera o em_terceiros e baixa o fisico` — é o saldo órfão que a decisão 4 existe para evitar |
| S5 | Em `cancelarRemessa`, usar `i.quantidade` em vez do pendente | falha `cancelar remessa com retorno parcial estorna SO o que ainda esta la fora` (`estornado = 100`, e o motor recusa por retenção insuficiente) |
| S6 | Em `cancelarRemessa`, estornar também quando `status = 'ABERTA'` | falha `cancelar remessa ABERTA nao mexe em saldo nenhum` — na prática o motor já recusaria (`em_terceiros = 0`), o que torna a falha barulhenta e não silenciosa |
| S7 | Remover a exigência de `motivo` | falha `cancelar sem motivo falha` |

**Executadas (`519e471`), com o resultado real de cada uma.** Âncora contada com `grep -cF`
(exatamente 1), arnês auto-testado contra âncora inexistente **antes** de qualquer sabotagem,
`md5sum` antes/depois e restauração por cópia em memória conferida por `md5sum` **e** por `git diff`
— nunca `git checkout --` (foi assim que a Task 4 corrompeu o `stockService.js`).

| # | Sabotagem | Resultado real |
|---|---|---|
| S1 | `if (!destino)` vira `if (false)` | 51/2 — quebra `encerrar ... sem destino falha` (*a mensagem nao nomeia a quantidade pendente*) |
| S2 | `if (total > 0)` vira `if (total >= 0)` (destino sempre) | 52/1 — quebra `[CONTROLE POSITIVO] encerrar com pendencia ZERO` |
| S3a | `PERDA_NO_TERCEIRO` emite `CONSUMO_TERCEIRO` | 52/1 — quebra `encerrar com perda no terceiro...` |
| S3b | `CONSUMIDO_NO_PROCESSO` emite `PERDA_TERCEIRO` | 51/2 — quebra `encerrar com consumo no processo...` |
| S4 | encerrar só marca status, não emite movimento | 48/5 — *sobrou retencao presa numa remessa encerrada — o saldo orfao* |
| S5 | cancelar estorna o total enviado, não o pendente | 52/1 — o motor recusa: *Retorno acima do que esta no terceiro: ainda ha 40 UN la fora* |
| S6 | `pendentes` sem o filtro `enviado_em IS NOT NULL` | 52/1 — quebra `cancelar remessa ABERTA nao mexe em saldo` |
| S7 | remover a exigência de `motivo` | 52/1 — `Missing expected rejection` |
| S8 | cancelar não estorna nada (par bilateral de S5) | 51/2 — quebra `cancelar remessa enviada restaura o disponivel` |
| S9 | encerrar baixa só o **primeiro** item pendente | 52/1 — *sobrou retencao presa no material N* |
| S10 | mensagem diz `pendentes[0]` em vez do total | 52/1 — *a mensagem nao diz o pendente TOTAL* |
| S11 | remover a exigência de justificativa | 52/1 — `Missing expected rejection` |

Duas anotações sobre o **arnês**, porque ele foi o que falhou nas Tasks 3 e 4:

- O auto-teste funcionou: a âncora inexistente deu `grep -cF = 0` e o arnês recusou sabotar **antes**
  de rodar teste nenhum.
- E ele **pegou um erro meu**: as âncoras originais de S5/S8 casaram **2 linhas** e a rodada foi
  ABORTADA em vez de mostrar verde. Causa: `grep -F` casa **substring**, não linha inteira, então
  `      quantidade: Number(p.pendente),` (6 espaços, do `cancelar`) também casa dentro da linha de
  8 espaços do `encerrar`. **Indentação não serve para desambiguar âncora em `grep -cF`** — fica
  registrado para a Task 8 e para a 8c.

- [x] **Step 6: Suítes completas** — todas verdes (números reais abaixo)

Run:
```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
```
Expected: `test:api` **73/73 arquivos OK**, `test:almoxarifado` **42/0**, validation **4/0**,
safealter **3/0**, sqlite **3/0**. **Medido:** exatamente isso.

- [x] **Step 7: Commit** — `519e471`

```bash
git add server/services/almoxarifado/thirdPartyService.js \
        server/tests/api/remessaTerceiroCiclo.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 7: encerrar com destino obrigatorio e cancelar com estorno

Encerrar remessa com saldo que nunca voltou exige DESTINO (PERDA_NO_TERCEIRO ou
CONSUMIDO_NO_PROCESSO) mais justificativa, e cada um emite a movimentacao correspondente pelo motor.

Descartado "so justificativa", que era o que a spec 14 pedia ao pe da letra. Texto livre nao tira o
saldo de quantidade_em_terceiros, e o saldo PRECISA sair: senao a remessa fica encerrada com
retencao presa para sempre num material cuja remessa acabou — exatamente o saldo orfao ja corrigido
duas vezes nesta sequencia (reserva presa na Etapa 6, linha orfa de devolucao na Etapa 7). E para
onde o saldo vai MUDA o estoque, entao quem decide e o operador, com o motivo escrito.

Perda e consumo baixam igual mas sao fatos diferentes — o terceiro estragando material nosso versus
o processo comendo material de proposito — e o livro registra tipos diferentes para poder
distinguir depois.

A exigencia e CONDICIONAL: remessa que voltou inteira encerra sozinha no retorno total, sem destino
nem justificativa. Exigir sempre obrigaria o operador a inventar uma perda que nao houve, e o teste
cobre os dois lados justamente porque "exigir sempre" passaria em todos os testes de recusa.

Cancelar e diferente de encerrar com destino: aqui o material volta (ou nunca saiu de verdade), la
ele some do patrimonio. De ABERTA nao ha o que estornar. Depois de ENVIADA estorna SO o pendente —
estornar o que ja voltou negativaria a retencao, e o motor recusaria com uma mensagem que nao
explicaria nada ao operador.

A mensagem do encerramento sem destino nomeia a QUANTIDADE pendente item a item e as duas opcoes
validas: "informe o destino" seco nao diz quanto esta em jogo nem o que digitar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

#### O que a execução da Task 7 (`519e471`) achou que este plano previa errado

1. **O encerramento com VÁRIOS itens pendentes não tinha teste nenhum.** Todas as remessas de
   encerramento do plano têm **um item só** — então baixar apenas o primeiro pendente
   (`pendentes.slice(0,1)`) passava nos 13 testes do plano, deixando retenção presa nos demais
   materiais: o saldo órfão **pela metade**, que é justamente o que a decisão 4 existe para evitar.
   Coberto por `encerrar com VARIOS itens pendentes baixa TODOS...` (sabotagem S9 prova). É o mesmo
   formato de achado da Task 5 (pré-checagem por linha) e da Task 6 (teto por item): **o plano sabia
   da regra em outra seção e não a testou aqui**.
2. **A mensagem agregada tinha o mesmo ponto cego.** Com um item só, dizer `pendentes[0].pendente`
   em vez de `total` é **indistinguível** do certo. O teste novo usa 30 + 45 e exige `75` na
   mensagem (S10). Era exatamente a regra que a própria Task 6 tinha deixado escrita para esta task
   ("quando a pré-checagem agrega por recurso escasso, a mensagem tem de dizer o valor agregado") —
   e o código do plano a cumpria, mas nenhum teste dele a checava.
3. **O par bilateral do S3 estava pela metade.** Só o teste do consumo conferia o tipo no livro;
   trocar `PERDA_NO_TERCEIRO` por `'CONSUMO_TERCEIRO'` no mapa **passava na suíte inteira** (o teste
   do consumo olha o movimento de outro material). O teste da perda passou a conferir tipo e
   quantidade também (S3a).
4. **A exigência condicional (S2) não tinha prova direta — e o plano admitia isso na própria
   tabela.** Como o retorno total encerra a remessa sozinho, não existe caminho natural que chegue
   em `encerrarRemessa` com pendência zero, e "exigir destino sempre" passava em **todos** os testes
   de recusa. Coberto por `[CONTROLE POSITIVO] encerrar com pendencia ZERO...`, que força o status de
   volta para `RETORNO_PARCIAL` — mesma técnica que o teste de idempotência do envio já usa neste
   arquivo — e verifica que **nenhuma** `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` foi emitida.
5. **A unidade do total podia ser inventada.** O texto do plano montava `${total} ${pendentes[0].unidade}`:
   numa remessa com um item em KG e outro em UN, isso anuncia um total numa unidade que não é a
   dele. Agora a unidade só acompanha o total quando **todos** os itens compartilham a mesma, e a
   abertura item a item leva a unidade de cada um.
6. **`quantidade_retornada = quantidade` no encerramento é uma sobrecarga de significado, e ela
   vaza para a Task 9.** A tabela não tem coluna de "liquidado", então o item baixado por perda fica
   com `quantidade_retornada` cheia e `pendente = 0` — mas **não voltou nada**. Está comentado no
   código. **A Task 9 (tela/PDF) não pode rotular essa coluna como "retornado" sem antes ler
   `encerramento_destino` do cabeçalho**; a fonte do que voltou de verdade é
   `retornos_remessa_item_almoxarifado`, que só tem linha de retorno real. Corrigir de vez custaria
   uma coluna nova (`quantidade_baixada`) e um `safeAlter` — fora do escopo da Task 7, registrado
   aqui para a 8c decidir junto com a transformação.
7. **Dois passos do plano estavam obsoletos ou errados:** o Step 1 mandava acrescentar o `require`
   do `stockService` ao teste (já estava lá desde a Task 5), e o Step 4 esperava **37** testes, que é
   o número da Task 6 — **quarta** vez que a contagem de um Step 4 vem errada nesta etapa.
8. **Lição de arnês:** `grep -F` casa **substring**, não linha inteira. Âncoras que se distinguem
   só pela **indentação** casam mais de uma linha, e o arnês corretamente abortou S5/S8 na primeira
   rodada em vez de mostrar verde. Vale para a Task 8 e a 8c.

**Números reais da execução:** antes de implementar, **`37 passed, 16 failed`** (todas as 16 com
`svc.encerrarRemessa is not a function` / `svc.cancelarRemessa is not a function`); depois,
**`53 passed, 0 failed`**. Gates: `test:api` **73/73 arquivos OK**, `test:almoxarifado`
**42 passou / 0 falhou**, validation **4/0**, safealter **3/0**, sqlite **3/0**. Doze sabotagens
executadas, todas detectadas, com auto-teste do arnês antes de confiar nele e restauração conferida
por `md5sum` **e** `git diff`.

#### Próxima tarefa: **Task 8** (rotas, schemas Zod e a varredura de prazo vencido)

O que ela consome desta task, já pronto e testado:

- `encerrarRemessa(db, user, remessaId, { destino?, justificativa? })` →
  `{ success, remessa_id, status:'ENCERRADA', baixado:number, destino:string|null }`;
  400 quando há pendência e falta destino/justificativa (mensagem já nomeia o total e as opções),
  400 quando o destino não está em `DESTINOS_ENCERRAMENTO`, 400 da máquina de estados quando a
  remessa está `ABERTA`/`ENCERRADA`/`CANCELADA`, 403 sem a ação `remessar_terceiro`;
- `cancelarRemessa(db, user, remessaId, { motivo })` →
  `{ success, remessa_id, status:'CANCELADA', estornado:number }`; 400 sem `motivo`, 400 da máquina
  de estados a partir de estado final, 403 sem a ação;
- `pendentesDaRemessa(db, remessaId)` — útil para a tela mostrar o que falta **antes** de o operador
  abrir o formulário de encerramento.

**Pontos de atenção para as rotas:**

- **Chave não declarada no schema Zod é descartada em silêncio** (`validation.js` troca `req.body`
  pelo parsed): `destino`, `justificativa` e `motivo` **têm** de entrar nos schemas, senão o
  encerramento com destino chega ao serviço como `{}` e é recusado por falta de destino — com o
  operador olhando um formulário preenchido.
- `destino` é **opcional** no schema (a remessa sem pendência encerra sem ele); quem decide se é
  obrigatório é o serviço, que é o único que sabe se sobrou pendência.
- Os erros do serviço já vêm com `.status` (400/403/404) — a rota só precisa propagar, no padrão das
  rotas de requisição.

---

### Task 8: rotas, schemas Zod e a varredura de prazo vencido — **FEITA (`11a73cb`)**

> #### O que a execução da Task 8 achou que este plano dizia ERRADO
>
> 1. **A falha esperada da sabotagem S2 está errada no plano.** O plano diz que remover o
>    `requirePermission` do POST faz falhar o teste do 403 — subentendendo que o *status* mudaria.
>    **Não muda.** `thirdPartyService.assertPodeRemessar` também devolve 403 (defesa em
>    profundidade), então sem o gate na rota o POST continua respondendo 403; o que muda é o
>    **corpo**, que perde o campo `acao`. Medido: `+ undefined  - 'remessar_terceiro'`. Ou seja,
>    **as sabotagens S1 e S2 são detectadas pela MESMA asserção** (`res.body.acao`), e um teste que
>    só olhasse o status aprovaria as duas. Quem mexer nestas rotas não pode remover essa asserção.
> 2. **`lote_id` do RETORNO não para no serviço — desce ao motor.** O teste que o plano trazia
>    pronto não cobria `lote_id` no retorno; ao cobri-lo, um id fictício estoura com
>    `Lote nao encontrado` (`stockService.js:544`, que resolve o lote e valida o material dele). O
>    teste cria um lote real com `lotService.criarOuObterLote`. O `lote_id` do **item da remessa**
>    não tem esse problema na criação (`criarRemessa` só o grava), mas terá **no envio**, pela mesma
>    razão — a 8c precisa saber disso.
> 3. **Contagem de testes do plano:** o Step 5 esperava "13 passed" e o arquivo que o plano trazia
>    tinha **12** testes. A execução entregou **35**, porque o enunciado da task exigia prova campo
>    a campo de que o schema não engole nada (o plano cobria só `peso` e `observacoes` do item).
> 4. **Sabotagens executadas: 11**, não 6 — as 6 do plano (todas confirmadas, com a ressalva do
>    item 1) mais 5 acrescentadas: `material_id` do retorno, `nota_fiscal` do retorno,
>    `justificativa` do encerramento, `observacoes` do item (separada de `peso`) e a troca do
>    `handleError` por um `catch` genérico de 500 na rota de encerrar.

**Files:**
- Modify: `server/services/almoxarifado/schemas.js` (4 schemas novos + export)
- Modify: `server/routes/almoxarifado/extended.js` (7 rotas + import do serviço)
- Create: `server/tests/api/remessaTerceiroRotas.api.test.js`

**Interfaces:**
- Consumes: `thirdPartyService.{criarRemessa, enviarRemessa, registrarRetorno, encerrarRemessa,
  cancelarRemessa, getRemessa, listarRemessas}` (Tasks 5-7); `requirePermission('remessar_terceiro')`
  (Task 3); `validate(schema)` de `validation.js`.
- Produces (a Task 9 consome exatamente estes contratos):

  | Método | Rota | Gate | Body |
  |---|---|---|---|
  | GET | `/api/almoxarifado/remessas-terceiros` | `auth` | query: `status`, `fornecedor_id`, `vencidas=1` |
  | GET | `/api/almoxarifado/remessas-terceiros/vencidas` | `auth` | query: `referencia` (data alternativa) |
  | GET | `/api/almoxarifado/remessas-terceiros/:id` | `auth` | — |
  | POST | `/api/almoxarifado/remessas-terceiros` | `remessar_terceiro` | `RemessaTerceiroSchema` |
  | POST | `/api/almoxarifado/remessas-terceiros/:id/enviar` | `remessar_terceiro` | `{}` |
  | POST | `/api/almoxarifado/remessas-terceiros/:id/retornos` | `remessar_terceiro` | `RetornoRemessaSchema` |
  | PUT | `/api/almoxarifado/remessas-terceiros/:id/encerrar` | `remessar_terceiro` | `EncerramentoRemessaSchema` |
  | PUT | `/api/almoxarifado/remessas-terceiros/:id/cancelar` | `remessar_terceiro` | `CancelamentoRemessaSchema` |

- [x] **Step 1: Escrever o teste que falha**

Cria `server/tests/api/remessaTerceiroRotas.api.test.js`:

```js
/**
 * Etapa 8b, Task 8 — as rotas da remessa a terceiros.
 *
 * O ciclo ja tem teste de servico (remessaTerceiroCiclo.api.test.js). Aqui o alvo e o que SO a rota
 * pode errar: o gate de permissao (requirePermission roda o codigo REAL no harness), a validacao
 * Zod, e a armadilha de chave nao declarada — `validate()` troca req.body pelo parsed, entao campo
 * que nao esta no schema e DESCARTADO EM SILENCIO e nunca chega ao servico. Ja aconteceu com
 * reserva_id na Etapa 4 e com lote_id na Etapa 6.
 *
 * Executar: cd server && node tests/api/remessaTerceiroRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };
const BASE = '/api/almoxarifado/remessas-terceiros';

let seq = 0;
async function novoMaterial(db, atual = 100) {
  seq += 1;
  const r = await dbRun(db,
    "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)",
    [`ROT-${seq}`, `Material rota ${seq}`, atual]);
  return r.lastID;
}
const emTerceiros = async (db, id) => (await dbGet(db,
  'SELECT COALESCE(quantidade_em_terceiros,0) AS q FROM materiais_almoxarifado WHERE id = ?', [id])).q;

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  const criar = (body) => request(app).post(BASE).send(body);
  const corpoValido = async (extra = {}) => {
    const mat = await novoMaterial(db);
    return { mat, body: { fornecedor_nome: 'Galvanizadora Sul LTDA', tipo_servico: 'Galvanizacao',
      prazo_previsto: '2026-09-30', itens: [{ material_id: mat, quantidade: 30 }], ...extra } };
  };

  // ── Permissao ────────────────────────────────────────────────────────────────────────────────
  await test('POST sem a acao remessar_terceiro devolve 403 e nao cria nada', async () => {
    const { body } = await corpoValido();
    setUser(PRODUCAO);
    const res = await criar(body);
    setUser(ADMIN);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(res.body.acao, 'remessar_terceiro');
    const n = await dbGet(db, 'SELECT COUNT(*) AS n FROM remessas_terceiro_almoxarifado');
    assert.strictEqual(n.n, 0, 'a remessa foi gravada apesar do 403');
  });

  await test('[CONTROLE POSITIVO] POST com a acao cria e devolve 201', async () => {
    const { body } = await corpoValido();
    const res = await criar(body);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ABERTA');
    assert.ok(res.body.numero);
  });

  await test('GET da listagem NAO exige remessar_terceiro — quem consulta pode ver', async () => {
    setUser(PRODUCAO);
    const res = await request(app).get(BASE);
    setUser(ADMIN);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body));
  });

  // ── Validacao Zod ────────────────────────────────────────────────────────────────────────────
  await test('POST sem itens e recusado com 400 pelo schema', async () => {
    const res = await criar({ fornecedor_nome: 'X', itens: [] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST com quantidade zero e recusado com 400', async () => {
    const mat = await novoMaterial(db);
    const res = await criar({ fornecedor_nome: 'X', itens: [{ material_id: mat, quantidade: 0 }] });
    assert.strictEqual(res.status, 400);
  });

  await test('todos os campos do corpo chegam ao servico (nenhum e descartado em silencio)', async () => {
    // A armadilha: z.object descarta chave nao declarada e o servico nunca ve o campo. Aconteceu
    // com reserva_id (Etapa 4) e lote_id (Etapa 6).
    const mat = await novoMaterial(db);
    // `ordens_servico` e tabela CORE (criada por server/index.js no boot), fora do initSchema do
    // almoxarifado e FORA do harness — cada teste que precisa dela a cria a mao. Precedente:
    // livroExtrato.api.test.js:64 e materialClienteGuardaSaida.api.test.js:39. Subconjunto minimo.
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY, numero_os TEXT, status TEXT, cliente_id INTEGER)`);
    const os = await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-REM-1','ABERTA')");
    const res = await criar({
      fornecedor_nome: 'Galvanizadora Sul LTDA', tipo_servico: 'Galvanizacao',
      os_id: os.lastID, prazo_previsto: '2026-12-01', observacoes: 'carga fechada',
      itens: [{ material_id: mat, quantidade: 30, peso: 12.5, observacoes: 'chapa 3mm' }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(row.tipo_servico, 'Galvanizacao');
    assert.strictEqual(row.os_id, os.lastID);
    assert.strictEqual(row.prazo_previsto, '2026-12-01');
    assert.strictEqual(row.observacoes, 'carga fechada');
    const item = await dbGet(db, 'SELECT * FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [res.body.id]);
    assert.strictEqual(item.peso, 12.5, 'peso foi descartado pelo schema');
    assert.strictEqual(item.observacoes, 'chapa 3mm', 'observacoes do item foi descartada pelo schema');
  });

  // ── Ciclo pelas rotas ────────────────────────────────────────────────────────────────────────
  await test('o ciclo inteiro funciona pelas rotas: criar -> enviar -> retornar -> encerrar', async () => {
    const { mat, body } = await corpoValido();
    const criada = await criar(body);
    const id = criada.body.id;

    const env = await request(app).post(`${BASE}/${id}/enviar`).send({});
    assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    assert.strictEqual(await emTerceiros(db, mat), 30);

    const cheia = await request(app).get(`${BASE}/${id}`);
    assert.strictEqual(cheia.status, 200);
    const itemId = cheia.body.itens[0].id;

    const ret = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ nota_fiscal: 'NF-R-1', itens: [{ item_remessa_id: itemId, quantidade: 20 }] });
    assert.strictEqual(ret.status, 200, JSON.stringify(ret.body));
    assert.strictEqual(ret.body.status, 'RETORNO_PARCIAL');
    assert.strictEqual(await emTerceiros(db, mat), 10);

    const enc = await request(app).put(`${BASE}/${id}/encerrar`)
      .send({ destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdido no banho' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
    assert.strictEqual(await emTerceiros(db, mat), 0);
  });

  await test('encerrar com pendencia sem destino devolve 400 com a mensagem do servico', async () => {
    const { body } = await corpoValido();
    const criada = await criar(body);
    await request(app).post(`${BASE}/${criada.body.id}/enviar`).send({});
    const enc = await request(app).put(`${BASE}/${criada.body.id}/encerrar`).send({});
    assert.strictEqual(enc.status, 400, JSON.stringify(enc.body));
    assert.match(enc.body.error, /PERDA_NO_TERCEIRO/);
  });

  await test('cancelar pela rota exige motivo e estorna', async () => {
    const { mat, body } = await corpoValido();
    const criada = await criar(body);
    await request(app).post(`${BASE}/${criada.body.id}/enviar`).send({});
    const semMotivo = await request(app).put(`${BASE}/${criada.body.id}/cancelar`).send({});
    assert.strictEqual(semMotivo.status, 400);
    const ok = await request(app).put(`${BASE}/${criada.body.id}/cancelar`).send({ motivo: 'terceiro recusou' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await emTerceiros(db, mat), 0);
  });

  await test('GET de remessa inexistente devolve 404, nao 500', async () => {
    const res = await request(app).get(`${BASE}/999999`);
    assert.strictEqual(res.status, 404);
  });

  // ── Varredura de prazo ───────────────────────────────────────────────────────────────────────
  await test('GET /vencidas lista so as atrasadas com material ainda la fora', async () => {
    // A rota tem de ser registrada ANTES de /:id, senao o Express casa "vencidas" como :id e
    // devolve 404 (ou 500 no parseInt).
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const m3 = await novoMaterial(db);
    const atrasada = await criar({ fornecedor_nome: 'F', prazo_previsto: '2020-01-01',
      itens: [{ material_id: m1, quantidade: 10 }] });
    const noPrazo = await criar({ fornecedor_nome: 'F', prazo_previsto: '2099-01-01',
      itens: [{ material_id: m2, quantidade: 10 }] });
    const atrasadaEncerrada = await criar({ fornecedor_nome: 'F', prazo_previsto: '2020-01-01',
      itens: [{ material_id: m3, quantidade: 10 }] });
    for (const c of [atrasada, noPrazo, atrasadaEncerrada]) {
      await request(app).post(`${BASE}/${c.body.id}/enviar`).send({});
    }
    await request(app).put(`${BASE}/${atrasadaEncerrada.body.id}/encerrar`)
      .send({ destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdida' });

    const res = await request(app).get(`${BASE}/vencidas`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.remessas.map((r) => r.id);
    assert.ok(ids.includes(atrasada.body.id), 'a remessa atrasada nao apareceu');
    assert.ok(!ids.includes(noPrazo.body.id), 'remessa no prazo apareceu como vencida');
    assert.ok(!ids.includes(atrasadaEncerrada.body.id),
      'remessa ENCERRADA apareceu como vencida — encerrada nao atrasa, nao ha nada la fora');
  });

  await test('GET /vencidas aceita data de referencia (o que torna o cron testavel)', async () => {
    const mat = await novoMaterial(db);
    const c = await criar({ fornecedor_nome: 'F', prazo_previsto: '2026-08-20',
      itens: [{ material_id: mat, quantidade: 10 }] });
    await request(app).post(`${BASE}/${c.body.id}/enviar`).send({});
    const antes = await request(app).get(`${BASE}/vencidas?referencia=2026-08-15`);
    assert.ok(!antes.body.remessas.map((r) => r.id).includes(c.body.id));
    const depois = await request(app).get(`${BASE}/vencidas?referencia=2026-09-01`);
    assert.ok(depois.body.remessas.map((r) => r.id).includes(c.body.id));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/remessaTerceiroRotas.api.test.js`
Expected: FAIL — todos os POST devolvem 404 (rota inexistente).

- [x] **Step 3: Schemas Zod**

Em `server/services/almoxarifado/schemas.js`, antes do `module.exports`:

```js
/**
 * Remessa para terceiros (Etapa 8b).
 *
 * TODO campo que o servico usa precisa estar declarado aqui: `validate()` troca req.body pelo
 * resultado do parse, e z.object DESCARTA chave nao declarada EM SILENCIO — o servico simplesmente
 * nunca ve o campo, sem erro nenhum. Ja custou caro duas vezes (reserva_id na Etapa 4, lote_id na
 * Etapa 6). `peso` e `observacoes` do item sao os candidatos obvios a serem esquecidos aqui.
 *
 * `fornecedor_id` OU `fornecedor_nome`: o terceiro pode nao estar cadastrado em Compras, e travar
 * a remessa por isso pararia o galpao. Quem valida a existencia do id e thirdPartyService
 * (resolverFornecedor), que tambem protege a consulta com sqlite_master.
 */
const ItemRemessaTerceiroSchema = z.object({
  material_id: z.number().int().positive(),
  quantidade: z.number().gt(0, 'quantidade do item deve ser maior que zero'),
  lote_id: z.number().int().positive().optional(),
  peso: z.number().nonnegative().optional(),
  observacoes: z.string().optional(),
});

const RemessaTerceiroSchema = z.object({
  fornecedor_id: z.number().int().positive().optional(),
  fornecedor_nome: z.string().min(1).optional(),
  tipo_servico: z.string().optional(),
  os_id: z.number().int().positive().optional(),
  projeto_id: z.number().int().positive().optional(),
  pedido_compra_id: z.number().int().positive().optional(),
  prazo_previsto: z.string().optional(),
  observacoes: z.string().optional(),
  itens: z.array(ItemRemessaTerceiroSchema).min(1, 'a remessa precisa de ao menos um item'),
}).refine((d) => d.fornecedor_id || (d.fornecedor_nome && d.fornecedor_nome.trim()), {
  message: 'Informe o fornecedor (terceiro) da remessa',
});

/**
 * Retorno: LISTA DE RESULTADOS, nao um escalar (decisao 7 do design). `material_id` e opcional e,
 * na 8b, so pode ser igual ao material do item enviado — o servico recusa diferente apontando a
 * Etapa 8c. Ele esta declarado aqui de proposito: sem a chave, a 8c teria de mexer no schema E o
 * campo chegaria como undefined ate la, escondendo a recusa.
 */
const RetornoRemessaSchema = z.object({
  nota_fiscal: z.string().optional(),
  itens: z.array(z.object({
    item_remessa_id: z.number().int().positive(),
    quantidade: z.number().gt(0, 'quantidade do retorno deve ser maior que zero'),
    material_id: z.number().int().positive().optional(),
    lote_id: z.number().int().positive().optional(),
    observacoes: z.string().optional(),
  })).min(1, 'informe ao menos um item retornado'),
});

/**
 * Encerramento. `destino` e `justificativa` sao opcionais AQUI e obrigatorios NO SERVICO quando ha
 * pendencia — a exigencia depende do saldo que sobrou, que o schema nao tem como saber. Deixar a
 * regra so no servico evita duas fontes da mesma verdade.
 */
const EncerramentoRemessaSchema = z.object({
  destino: z.enum(['PERDA_NO_TERCEIRO', 'CONSUMIDO_NO_PROCESSO']).optional(),
  justificativa: z.string().optional(),
});

const CancelamentoRemessaSchema = z.object({
  motivo: z.string().min(1, 'motivo é obrigatório'),
});
```

e no `module.exports`:

```js
module.exports = {
  CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, TIPOS_MOVIMENTO_ROTA,
  RegularizacaoSchema, CancelamentoSchema, DevolucaoClienteSchema,
  MaterialSchema, MaterialUpdateSchema, RequisicaoSchema, ItemRequisicaoSchema,
  ItemRemessaTerceiroSchema, RemessaTerceiroSchema, RetornoRemessaSchema,
  EncerramentoRemessaSchema, CancelamentoRemessaSchema,
};
```

- [x] **Step 4: As rotas**

Em `server/routes/almoxarifado/extended.js`, acrescentar ao bloco de imports:

```js
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');
```

e ao destructuring de `schemas`:

```js
const { CentroCustoSchema, AlmoxarifadoSchema, MovimentacaoSchema, RegularizacaoSchema,
  CancelamentoSchema, DevolucaoClienteSchema, RemessaTerceiroSchema, RetornoRemessaSchema,
  EncerramentoRemessaSchema, CancelamentoRemessaSchema } = require('../../services/almoxarifado/schemas');
```

As rotas (bloco novo, no fim do registrador):

```js
  // ── Remessas para terceiros (Etapa 8b) ────────────────────────────────────────────────────
  //
  // Leitura so exige `auth` (quem consulta precisa ver onde esta o material); toda ACAO exige
  // `remessar_terceiro`. A acao e mais estreita que `movimentar` de proposito (decisao 6): o
  // material SAI DO SITE, risco diferente de mover prateleira. Hoje os perfis sao os mesmos —
  // o ganho e poder restringir depois sem reescrever nada.

  // ATENCAO A ORDEM: /vencidas ANTES de /:id. Registrada depois, o Express casaria "vencidas"
  // como :id e a rota do cron devolveria 404 sem nenhum erro que denunciasse a causa.
  //
  // Por que ROTA e nao scheduler in-process: unico precedente do modulo e
  // reservationService.processarExpiracao, e a decisao registrada la vale aqui — o projeto nao tem
  // scheduler e introduzir um e decisao de infraestrutura. `referencia` existe para o cron ser
  // testavel sem viajar no tempo.
  //
  // A 8b NAO dispara e-mail nem alerta (decisao 10): isso e das features 19/20. O que ela entrega
  // e o prazo gravado, esta leitura e o destaque na tela.
  app.get('/api/almoxarifado/remessas-terceiros/vencidas', auth, async (req, res) => {
    try {
      const remessas = await thirdPartyService.listarRemessas(db, {
        vencidas: '1', referencia: req.query.referencia || null,
      });
      res.json({ total: remessas.length, referencia: req.query.referencia || null, remessas });
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/remessas-terceiros', auth, async (req, res) => {
    try {
      res.json(await thirdPartyService.listarRemessas(db, req.query || {}));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/remessas-terceiros/:id', auth, async (req, res) => {
    try {
      const r = await thirdPartyService.getRemessa(db, req.params.id);
      if (!r) return res.status(404).json({ error: 'Remessa nao encontrada' });
      res.json(r);
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/remessas-terceiros', auth, requirePermission('remessar_terceiro'),
    validate(RemessaTerceiroSchema), async (req, res) => {
      try {
        res.status(201).json(await thirdPartyService.criarRemessa(db, req.user, req.body));
      } catch (e) { handleError(res, e); }
    });

  app.post('/api/almoxarifado/remessas-terceiros/:id/enviar', auth, requirePermission('remessar_terceiro'),
    async (req, res) => {
      try {
        res.json(await thirdPartyService.enviarRemessa(db, req.user, req.params.id));
      } catch (e) { handleError(res, e); }
    });

  app.post('/api/almoxarifado/remessas-terceiros/:id/retornos', auth, requirePermission('remessar_terceiro'),
    validate(RetornoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.registrarRetorno(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });

  app.put('/api/almoxarifado/remessas-terceiros/:id/encerrar', auth, requirePermission('remessar_terceiro'),
    validate(EncerramentoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.encerrarRemessa(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });

  app.put('/api/almoxarifado/remessas-terceiros/:id/cancelar', auth, requirePermission('remessar_terceiro'),
    validate(CancelamentoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.cancelarRemessa(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });
```

- [x] **Step 5: Rodar o teste e ver passar**

Run: `cd server && node tests/api/remessaTerceiroRotas.api.test.js`
Expected: PASS — 13 passed, 0 failed.

- [x] **Step 6: Sabotagens obrigatórias**

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Trocar `requirePermission('remessar_terceiro')` por `requirePermission('movimentar')` no POST | **não falha nenhum teste** hoje (os perfis coincidem) — por isso o teste checa `res.body.acao === 'remessar_terceiro'`; confirme que essa asserção falha, e é ela que trava a regressão |
| S2 | Remover `requirePermission` do POST | falha `POST sem a acao remessar_terceiro devolve 403 e nao cria nada` |
| S3 | Pôr `requirePermission('remessar_terceiro')` no GET da listagem | falha `GET da listagem NAO exige remessar_terceiro` |
| S4 | Remover `peso` e `observacoes` de `ItemRemessaTerceiroSchema` | falha `todos os campos do corpo chegam ao servico` — é a prova direta do descarte silencioso |
| S5 | Registrar `/vencidas` **depois** de `/:id` | falha `GET /vencidas lista so as atrasadas` com 404 |
| S6 | Em `listarRemessas`, tirar `AND r.status IN ('ENVIADA','RETORNO_PARCIAL')` do filtro de vencidas | falha `GET /vencidas ...` na asserção da remessa **encerrada** |

- [x] **Step 7: Suítes completas**

Run:
```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
```
Expected: `test:api` **74/74 arquivos OK**, `test:almoxarifado` **42/0**, validation **4/0**,
safealter **3/0**, sqlite **3/0**.

- [x] **Step 8: Commit**

```bash
git add server/services/almoxarifado/schemas.js \
        server/routes/almoxarifado/extended.js \
        server/tests/api/remessaTerceiroRotas.api.test.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 8: rotas da remessa, schemas Zod e a leitura de prazo vencido

Sete rotas: listar, ler, criar, enviar, retornar, encerrar e cancelar. Leitura so exige auth
(quem consulta precisa poder ver onde esta o material); toda ACAO exige remessar_terceiro. O teste
do 403 assere o CAMPO `acao` da resposta, e nao so o status: com os perfis de remessar_terceiro
iguais aos de movimentar, trocar um gate pelo outro nao mudaria nenhum status e a regressao passaria
despercebida.

Todo campo que o servico usa esta declarado no schema, e ha teste para isso. `validate()` troca
req.body pelo resultado do parse e z.object descarta chave nao declarada EM SILENCIO — o servico
nunca ve o campo, sem erro nenhum. Ja custou caro duas vezes nesta base (reserva_id na Etapa 4,
lote_id na Etapa 6); aqui os candidatos eram `peso` e `observacoes` do item, e o teste os cobre
gravando e relendo do banco.

destino e justificativa do encerramento sao opcionais no schema e obrigatorios no servico quando ha
pendencia: a exigencia depende do saldo que sobrou, que o schema nao tem como saber, e duplica-la
criaria duas fontes da mesma regra.

GET /vencidas e registrada ANTES de /:id de proposito — na ordem inversa o Express casaria
"vencidas" como :id e a rota devolveria 404 sem nada que denunciasse a causa. E ROTA, e nao
scheduler in-process, pelo mesmo motivo ja registrado em reservationService.processarExpiracao: o
projeto nao tem scheduler e introduzir um e decisao de infraestrutura. `referencia` existe para o
cron ser testavel sem viajar no tempo.

A 8b nao dispara e-mail nem alerta de atraso (decisao 10 do design): isso e das features 19 e 20.
O que ela entrega e o prazo gravado, esta leitura, e o destaque na tela.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: tela de Remessas, documento de remessa em PDF, rota e menu

**Files:**
- Create: `client/src/utils/remessaPdf.js`
- Create: `client/src/utils/remessaPdf.test.js`
- Create: `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js`
- Create: `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.test.js`
- Modify: `client/src/components/almoxarifado/Almoxarifado.css` (5 classes de badge)
- Modify: `client/src/routes/lazyModules.js` (export code-split)
- Modify: `client/src/App.js` (import + `<Route>`)
- Modify: `client/src/components/Layout.js` (`almoxarifadoMenuItems`)

**Interfaces:**
- Consumes: as sete rotas da Task 8; `useAlmoxPermissoes().bloquearSeNaoPode('remessar_terceiro', e)`
  (a ação vem de `GET /minhas-permissoes`, Task 3).
- Produces:
  - `montarRemessaPDF({ remessa, itens, geradoEm }) => descritor` (função **pura**, testável sem
    tocar em binário).
  - `gerarRemessaPDF(dados)` — desenha com `jspdf` e dispara o download.
  - Rota `/almoxarifado/remessas-terceiros`, item de menu "Remessas a Terceiros".

**Zero mudança de servidor nesta task.** Padrão validado em duas etapas seguidas
(`utils/etiquetasPdf.js` 6c, `utils/posicaoClientePdf.js` 8): montador puro + renderizador `jspdf`.

> **Classe de badge nova TEM de ser criada em `Almoxarifado.css`.** Sem a regra, o
> `almox-badge-${status.toLowerCase()}` não acha a classe e o selo sai sem fundo nem cor — e
> **nenhum teste pega**. Aconteceu na Etapa 7. `aberto`, `concluido` e `cancelado` já existem; os
> cinco status da remessa precisam de nomes próprios porque não coincidem com os existentes.

- [ ] **Step 1: Escrever o teste do PDF (falha)**

Cria `client/src/utils/remessaPdf.test.js`:

```js
/**
 * Etapa 8b, Task 9 — descritor do documento de remessa.
 *
 * O montador e testado como funcao PURA: assertar sobre bytes de PDF nao diz se o numero certo foi
 * para a coluna certa, e num documento que acompanha material saindo do predio essa e a unica falha
 * que importa. Mesmo padrao de utils/posicaoClientePdf.js (Etapa 8) e utils/etiquetasPdf.js (6c).
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/remessaPdf --watchAll=false
 */
import { montarRemessaPDF } from './remessaPdf';

const REMESSA = {
  numero: 'REM-12345678',
  fornecedor_nome: 'Galvanizadora Sul LTDA',
  tipo_servico: 'Galvanizacao',
  prazo_previsto: '2026-09-30',
  status: 'ENVIADA',
  observacoes: 'carga fechada',
  proprietario_cliente_id: null,
  proprietario_cliente_nome: null,
};
const ITENS = [
  { material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', unidade: 'PC', quantidade: 30, peso: 240, quantidade_retornada: 0 },
  { material_codigo: 'TUB-2', material_nome: 'Tubo 2"', unidade: 'M', quantidade: 12, peso: null, quantidade_retornada: 4 },
];

describe('montarRemessaPDF', () => {
  test('o titulo traz o numero da remessa e o terceiro', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: '2026-08-12T00:00:00Z' });
    expect(doc.titulo).toContain('REM-12345678');
    expect(doc.subtitulo).toContain('Galvanizadora Sul LTDA');
    expect(doc.subtitulo).toContain('Galvanizacao');
  });

  test('cada item vira uma linha com codigo, nome, unidade, quantidade e peso', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.linhasItens).toHaveLength(2);
    expect(doc.linhasItens[0]).toEqual(['CHP-3MM', 'Chapa 3mm', 'PC', '30', '240']);
    // Peso ausente vira '—', nao 'null' nem '0': zero quilo e uma afirmacao, ausencia nao e.
    expect(doc.linhasItens[1]).toEqual(['TUB-2', 'Tubo 2"', 'M', '12', '—']);
  });

  test('o prazo previsto aparece formatado em pt-BR', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.prazo).toBe('30/09/2026');
  });

  test('sem prazo o documento diz "sem prazo definido", e nao uma data inventada', () => {
    const doc = montarRemessaPDF({ remessa: { ...REMESSA, prazo_previsto: null }, itens: ITENS });
    expect(doc.prazo).toMatch(/sem prazo/i);
  });

  test('DOCUMENTO DE MATERIAL DE CLIENTE NOMEIA O PROPRIETARIO', () => {
    // Decisao 5: a isencao da guarda do dono so e aceitavel COM esta contrapartida. Sem o nome no
    // papel, material de cliente sai do predio sem rastro de propriedade.
    const doc = montarRemessaPDF({
      remessa: { ...REMESSA, proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Chapa LTDA' },
      itens: ITENS,
    });
    expect(doc.proprietario).toContain('Cliente Chapa LTDA');
  });

  test('[CONTROLE POSITIVO] material NOSSO nao inventa proprietario', () => {
    // A metade que falta: escrever sempre "material de cliente" passaria no teste acima e poria
    // um dono falso em todo documento de material nosso.
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.proprietario).toBeNull();
  });

  test('o total de itens e a soma das quantidades batem com a lista', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.totalItens).toBe(2);
    expect(doc.totalQuantidade).toBe(42);
  });

  test('remessa sem itens nao quebra o montador', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA });
    expect(doc.linhasItens).toEqual([]);
    expect(doc.totalQuantidade).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/utils/remessaPdf --watchAll=false`
Expected: FAIL — `Cannot find module './remessaPdf'`.

- [ ] **Step 3: Implementar o PDF**

Cria `client/src/utils/remessaPdf.js`:

```js
// Etapa 8b, Task 9: documento de remessa a terceiros, gerado no NAVEGADOR — zero mudanca de
// servidor, mesmo padrao validado em utils/etiquetasPdf.js (6c) e utils/posicaoClientePdf.js (8).
// O montador e puro (testavel sem DOM nem binario); so gerarRemessaPDF toca no jspdf.
//
// Este papel acompanha material FISICO saindo do predio. Duas coisas nele nao sao decorativas:
// o numero da remessa (e por ele que o retorno e conferido) e o nome do CLIENTE PROPRIETARIO
// quando o material e de terceiro — a decisao 5 do design isenta a remessa da guarda de OS/projeto
// justamente porque o documento nomeia o dono.

import jsPDF from 'jspdf';

const num = (v) => String(Number(v || 0));
const ou = (v, alt = '—') => (v === null || v === undefined || v === '' ? alt : String(v));

const formatDataBR = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

/** Descritor do documento — a moeda entre a tela, o teste e o renderizador. */
export function montarRemessaPDF({ remessa = {}, itens = [], geradoEm } = {}) {
  const lista = itens || [];
  return {
    titulo: `Remessa para terceiros — ${remessa.numero || 's/n'}`,
    subtitulo: [remessa.fornecedor_nome, remessa.tipo_servico].filter(Boolean).join(' · ') || 'terceiro nao informado',
    // `null` quando o material e NOSSO: escrever "material de cliente" sempre poria um dono falso
    // em todo documento de estoque proprio.
    proprietario: remessa.proprietario_cliente_id
      ? `Material de propriedade de ${remessa.proprietario_cliente_nome || `cliente #${remessa.proprietario_cliente_id}`}`
      : null,
    prazo: formatDataBR(remessa.prazo_previsto) || 'sem prazo definido',
    status: remessa.status || 'ABERTA',
    observacoes: remessa.observacoes || null,
    geradoEm: formatDataBR(geradoEm) || formatDataBR(new Date().toISOString()),
    cabecalhoItens: ['Código', 'Material', 'Un.', 'Qtde', 'Peso (kg)'],
    linhasItens: lista.map((i) => [
      ou(i.material_codigo), ou(i.material_nome), ou(i.unidade),
      num(i.quantidade), ou(i.peso),
    ]),
    totalItens: lista.length,
    totalQuantidade: lista.reduce((a, i) => a + Number(i.quantidade || 0), 0),
  };
}

/** Desenha e dispara o download. Sem autoTable: a grade e simples e cabe em texto posicionado. */
export function gerarRemessaPDF(dados) {
  const doc = montarRemessaPDF(dados);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  pdf.setFontSize(14);
  pdf.text(doc.titulo, M, y); y += 6;
  pdf.setFontSize(10);
  pdf.text(doc.subtitulo, M, y); y += 5;
  pdf.setFontSize(9);
  pdf.text(`Prazo previsto: ${doc.prazo}   ·   Status: ${doc.status}`, M, y); y += 5;
  if (doc.proprietario) {
    pdf.setFontSize(10);
    pdf.text(doc.proprietario, M, y); y += 6;
    pdf.setFontSize(9);
  }
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y); y += 8;

  const cols = [M, M + 30, M + 110, M + 126, M + 152];
  doc.cabecalhoItens.forEach((h, i) => pdf.text(h, cols[i], y));
  y += 2; pdf.line(M, y, 196, y); y += 5;
  for (const linha of doc.linhasItens) {
    if (y > 262) { pdf.addPage(); y = 18; }
    linha.forEach((c, i) => pdf.text(String(c ?? '').slice(0, 40), cols[i], y));
    y += 5;
  }
  y += 2; pdf.line(M, y, 196, y); y += 5;
  pdf.text(`${doc.totalItens} item(ns) · quantidade total: ${doc.totalQuantidade}`, M, y); y += 8;

  if (doc.observacoes) {
    pdf.text('Observações:', M, y); y += 5;
    pdf.text(pdf.splitTextToSize(doc.observacoes, 175), M, y); y += 10;
  }

  // Campos de assinatura: o papel volta assinado pelo terceiro, e e o que prova a entrega.
  if (y > 245) { pdf.addPage(); y = 18; }
  y += 12;
  pdf.line(M, y, M + 75, y);
  pdf.line(M + 100, y, M + 175, y);
  y += 5;
  pdf.text('Responsável GMP', M, y);
  pdf.text('Recebido pelo terceiro (nome / data)', M + 100, y);

  pdf.save(`remessa-${(dados?.remessa?.numero || 'sn').toLowerCase()}.pdf`);
}
```

- [ ] **Step 4: Rodar o teste do PDF e ver passar**

Run: `cd client && CI=true npx react-scripts test src/utils/remessaPdf --watchAll=false`
Expected: PASS — 8 testes.

- [ ] **Step 5: Escrever o teste da tela (falha)**

Cria `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.test.js` (molde:
`MateriaisClienteAlmoxarifado.test.js`):

```js
/**
 * Etapa 8b, Task 9 — tela "Remessas a Terceiros".
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceiros --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RemessasTerceirosAlmoxarifado from './RemessasTerceirosAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { gerarRemessaPDF } from '../../utils/remessaPdf';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../utils/remessaPdf', () => ({
  __esModule: true, gerarRemessaPDF: jest.fn(), montarRemessaPDF: jest.fn(),
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const LISTA = [
  { id: 1, numero: 'REM-1', fornecedor_nome: 'Galvanizadora Sul', tipo_servico: 'Galvanizacao',
    status: 'ENVIADA', prazo_previsto: '2020-01-01', vencida: 1, itens_total: 2,
    proprietario_cliente_id: null, proprietario_cliente_nome: null },
  { id: 2, numero: 'REM-2', fornecedor_nome: 'Usinagem Norte', tipo_servico: 'Usinagem',
    status: 'ABERTA', prazo_previsto: '2099-01-01', vencida: 0, itens_total: 1,
    proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Chapa LTDA' },
];
const DETALHE_1 = {
  ...LISTA[0],
  itens: [
    { id: 11, material_id: 101, material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', unidade: 'PC',
      quantidade: 30, quantidade_retornada: 10, pendente: 20, peso: 240 },
  ],
  retornos: [{ id: 5, material_codigo: 'CHP-3MM', quantidade: 10, nota_fiscal: 'NF-1' }],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/remessas-terceiros/1')) return Promise.resolve({ data: DETALHE_1 });
    if (url.startsWith('/almoxarifado/remessas-terceiros')) return Promise.resolve({ data: LISTA });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter><RemessasTerceirosAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
function preencher(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(
    el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');

describe('RemessasTerceirosAlmoxarifado', () => {
  test('lista as remessas com numero, terceiro e status', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(2);
    expect(texto()).toContain('REM-1');
    expect(texto()).toContain('Galvanizadora Sul');
    expect(texto()).toContain('Usinagem Norte');
  });

  test('remessa vencida ganha destaque e a que esta no prazo NAO ganha', async () => {
    // Controle positivo bilateral: destacar todas viraria ruido e o operador pararia de olhar.
    await renderizar();
    const vencida = linhas().find((tr) => tr.textContent.includes('REM-1'));
    const noPrazo = linhas().find((tr) => tr.textContent.includes('REM-2'));
    expect(vencida.querySelector('.almox-badge-vencida')).toBeTruthy();
    expect(noPrazo.querySelector('.almox-badge-vencida')).toBeNull();
  });

  test('o badge de status usa uma classe que EXISTE no CSS do modulo', async () => {
    // Classe inventada sai sem cor nenhuma e nenhum teste pega — aconteceu na Etapa 7.
    await renderizar();
    const badge = linhas()[0].querySelector('.almox-badge-enviada');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('ENVIADA');
  });

  test('o selo de propriedade nomeia o cliente so na remessa que e de cliente', async () => {
    await renderizar();
    const nossa = linhas().find((tr) => tr.textContent.includes('REM-1'));
    const doCliente = linhas().find((tr) => tr.textContent.includes('REM-2'));
    expect(doCliente.querySelector('.almox-badge-cliente').textContent).toContain('Cliente Chapa LTDA');
    expect(nossa.querySelector('.almox-badge-cliente')).toBeNull();
  });

  test('abrir a remessa carrega os itens e mostra o pendente', async () => {
    await renderizar();
    await clicar(botao('Abrir', linhas()[0]));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/1');
    expect(texto()).toContain('CHP-3MM');
    expect(texto()).toContain('NF-1');
  });

  test('as acoes seguem o status: ABERTA envia, ENVIADA recebe retorno', async () => {
    await renderizar();
    const enviada = linhas().find((tr) => tr.textContent.includes('REM-1'));
    const aberta = linhas().find((tr) => tr.textContent.includes('REM-2'));
    expect(botao('Enviar', aberta)).toBeTruthy();
    expect(botao('Enviar', enviada)).toBeFalsy();
    expect(botao('Retorno', enviada)).toBeTruthy();
    expect(botao('Retorno', aberta)).toBeFalsy();
  });

  test('enviar chama a rota certa e recarrega a lista', async () => {
    await renderizar();
    const antes = api.get.mock.calls.length;
    await clicar(botao('Enviar', linhas().find((tr) => tr.textContent.includes('REM-2'))));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/2/enviar', {});
    expect(api.get.mock.calls.length).toBeGreaterThan(antes);
  });

  test('encerrar com pendencia exige destino E justificativa antes de chamar o servidor', async () => {
    await renderizar();
    await clicar(botao('Encerrar', linhas().find((tr) => tr.textContent.includes('REM-1'))));
    await clicar(botao('Confirmar encerramento'));
    expect(api.put).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('encerrar com destino e justificativa manda os dois campos', async () => {
    await renderizar();
    await clicar(botao('Encerrar', linhas().find((tr) => tr.textContent.includes('REM-1'))));
    preencher(campo('Destino'), 'PERDA_NO_TERCEIRO');
    preencher(campo('Justificativa'), 'perdida no banho de zinco');
    await clicar(botao('Confirmar encerramento'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/1/encerrar', {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdida no banho de zinco',
    });
  });

  test('o erro do servidor aparece para o operador, com a mensagem do backend', async () => {
    // O backend nomeia a quantidade pendente; engolir isso num "erro ao encerrar" generico apagaria
    // justamente o numero que o operador precisa.
    api.put.mockRejectedValueOnce({ response: { data: { error: 'A remessa REM-1 tem 20 PC que nunca voltaram' } } });
    await renderizar();
    await clicar(botao('Encerrar', linhas().find((tr) => tr.textContent.includes('REM-1'))));
    preencher(campo('Destino'), 'PERDA_NO_TERCEIRO');
    preencher(campo('Justificativa'), 'x');
    await clicar(botao('Confirmar encerramento'));
    expect(toast.error).toHaveBeenCalledWith('A remessa REM-1 tem 20 PC que nunca voltaram');
  });

  test('o PDF recebe a remessa aberta com os itens carregados', async () => {
    await renderizar();
    await clicar(botao('Abrir', linhas()[0]));
    await clicar(botao('PDF da remessa'));
    expect(gerarRemessaPDF).toHaveBeenCalled();
    const dados = gerarRemessaPDF.mock.calls[0][0];
    expect(dados.remessa.numero).toBe('REM-1');
    expect(dados.itens).toHaveLength(1);
    expect(dados.geradoEm).toBeTruthy();
  });

  test('lista vazia mostra estado vazio, nao tabela em branco', async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: [] }));
    await renderizar();
    expect(linhas()).toHaveLength(0);
    expect(texto()).toMatch(/nenhuma remessa/i);
  });

  test('falha ao carregar avisa por toast', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('boom')));
    await renderizar();
    expect(toast.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Implementar a tela e o CSS**

Em `client/src/components/almoxarifado/Almoxarifado.css`, junto das outras regras `almox-badge-*`:

```css
/* Etapa 8b — status da remessa a terceiros. As cinco classes PRECISAM existir: o componente monta
   `almox-badge-${status.toLowerCase()}` e classe inexistente sai sem fundo nem cor, sem nenhum
   teste pegar (aconteceu na Etapa 7). Nomes proprios porque os status da remessa nao coincidem
   com os de conferencia (aberto/concluido/cancelado). */
.almox-badge-aberta          { background: rgba(107,107,107,0.12); color: var(--gmp-text-light); }
.almox-badge-enviada         { background: rgba(79,172,254,0.12);  color: #4facfe; }
.almox-badge-retorno_parcial { background: rgba(229,152,0,0.12);   color: var(--gmp-warning); }
.almox-badge-encerrada       { background: rgba(26,163,74,0.12);   color: var(--gmp-success); }
.almox-badge-cancelada       { background: rgba(107,107,107,0.12); color: var(--gmp-text-light); }
/* Vencida NAO e status, e um alerta que se soma ao status — por isso classe separada e com borda:
   ela aparece AO LADO do badge de status, nao no lugar dele. */
.almox-badge-vencida         { background: rgba(229,25,58,0.12);   color: var(--gmp-error);
                               border: 1px solid rgba(229,25,58,0.35); }
```

Cria `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiSend, FiCornerDownLeft, FiCheckSquare, FiXCircle, FiFileText, FiEye } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { gerarRemessaPDF } from '../../utils/remessaPdf';
import './Almoxarifado.css';

/**
 * Remessas a Terceiros (Etapa 8b).
 *
 * Ate esta etapa, quando uma chapa ia para o galvanizador ela sumia do controle: ou alguem dava
 * baixa (e o material desaparecia do patrimonio, embora continuasse sendo da empresa), ou nao dava
 * baixa nenhuma (e o sistema afirmava que a chapa estava na prateleira, com ela a 40 km).
 *
 * As ACOES seguem o STATUS, e nao a vontade da tela: quem decide e o backend (a maquina de estados
 * em thirdPartyStateMachine.js). Aqui os botoes so escondem o que o servidor recusaria — oferecer
 * "Enviar" numa remessa ja enviada so produziria um 400 que o operador nao entenderia.
 *
 * "Vencida" e alerta que SE SOMA ao status (badge separado, ao lado), e vem calculado do servidor
 * (`vencida` na listagem). Recalcular aqui criaria uma segunda conta que discordaria do filtro.
 *
 * NAO confundir com /almoxarifado/devolucoes (Etapa 7, o material VOLTA para o estoque) nem com
 * Materiais de Clientes (Etapa 8, o material e de outro dono). Aqui o material e NOSSO (ou de um
 * cliente, e o documento diz de quem) e esta FORA DO PREDIO, temporariamente.
 */
const STATUS_COM_ENVIO = ['ABERTA'];
const STATUS_COM_RETORNO = ['ENVIADA', 'RETORNO_PARCIAL'];
const STATUS_COM_ENCERRAR = ['ENVIADA', 'RETORNO_PARCIAL'];
const STATUS_COM_CANCELAR = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL'];

const RemessasTerceirosAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [remessas, setRemessas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [aberta, setAberta] = useState(null);

  const [modal, setModal] = useState(null); // { tipo: 'retorno'|'encerrar'|'cancelar', remessa }
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const qs = filtroStatus ? `?status=${filtroStatus}` : '';
    api.get(`/almoxarifado/remessas-terceiros${qs}`)
      .then((r) => { if (!cancelado) setRemessas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setRemessas([]); toast.error('Não foi possível carregar as remessas'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtroStatus, reloadToken]);

  const recarregar = useCallback(() => setReloadToken((t) => t + 1), []);

  const abrirDetalhe = useCallback(async (remessa) => {
    try {
      const r = await api.get(`/almoxarifado/remessas-terceiros/${remessa.id}`);
      setAberta(r.data);
    } catch {
      toast.error('Não foi possível carregar a remessa');
    }
  }, []);

  const enviar = async (remessa, evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    try {
      await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/enviar`, {});
      toast.success('Remessa enviada — o saldo saiu do disponível');
      recarregar();
    } catch (err) {
      // A mensagem do backend nomeia o item que travou e quanto ha disponivel. Trocar por um texto
      // generico apagaria justamente o numero que resolve o problema.
      toast.error(err.response?.data?.error || 'Erro ao enviar a remessa');
    }
  };

  const abrirModal = (tipo, remessa, evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    setForm({});
    setModal({ tipo, remessa });
    if (tipo === 'retorno') abrirDetalhe(remessa);
  };

  const confirmar = async () => {
    const { tipo, remessa } = modal;
    if (tipo === 'encerrar') {
      const temPendencia = (aberta?.id === remessa.id ? aberta.itens : [])
        .some((i) => Number(i.pendente) > 0);
      // A tela so ADIANTA a exigencia; quem decide e o servidor, que sabe o pendente real.
      if ((temPendencia || !aberta || aberta.id !== remessa.id) && !form.destino) {
        toast.error('Informe o destino do saldo que não voltou'); return;
      }
      if (form.destino && !String(form.justificativa || '').trim()) {
        toast.error('Informe a justificativa do encerramento'); return;
      }
    }
    if (tipo === 'cancelar' && !String(form.motivo || '').trim()) {
      toast.error('Informe o motivo do cancelamento'); return;
    }
    if (tipo === 'retorno' && !(Number(form.quantidade) > 0)) {
      toast.error('Informe a quantidade retornada'); return;
    }
    setSalvando(true);
    try {
      if (tipo === 'retorno') {
        await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/retornos`, {
          nota_fiscal: form.nota_fiscal || undefined,
          itens: [{ item_remessa_id: Number(form.item_remessa_id), quantidade: Number(form.quantidade) }],
        });
        toast.success('Retorno registrado');
      } else if (tipo === 'encerrar') {
        const body = form.destino
          ? { destino: form.destino, justificativa: String(form.justificativa).trim() }
          : {};
        await api.put(`/almoxarifado/remessas-terceiros/${remessa.id}/encerrar`, body);
        toast.success('Remessa encerrada');
      } else {
        await api.put(`/almoxarifado/remessas-terceiros/${remessa.id}/cancelar`,
          { motivo: String(form.motivo).trim() });
        toast.success('Remessa cancelada — o saldo pendente voltou ao disponível');
      }
      setModal(null);
      setAberta(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao concluir a operação');
    } finally { setSalvando(false); }
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Remessas a Terceiros</h1>
          <p>{loading ? 'Carregando...' : `${remessas.length} remessa(s) · material que está fora do prédio para beneficiamento`}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregar}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {/* PDF gerado no NAVEGADOR (utils/remessaPdf.js) — zero mudanca de servidor. So habilita
              com uma remessa aberta, porque o documento precisa dos ITENS. */}
          <button className="btn-almox-primary" disabled={!aberta}
            onClick={() => gerarRemessaPDF({ remessa: aberta, itens: aberta?.itens || [], geradoEm: new Date().toISOString() })}>
            <FiFileText size={13} /> PDF da remessa
          </button>
        </div>
      </div>

      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={7} />
          : remessas.length === 0 ? (
            <div className="almox-empty"><p>Nenhuma remessa a terceiros</p></div>
          ) : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Número</th><th>Terceiro</th><th>Serviço</th><th>Prazo</th>
                  <th>Itens</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {remessas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.numero}</td>
                    <td>
                      {r.fornecedor_nome || '—'}
                      {/* Selo de propriedade: reaproveita `.almox-badge-cliente` da Etapa 8 — e o
                          mesmo significado ("isto nao e nosso") e um segundo estilo faria a mesma
                          informacao ter duas caras no modulo. */}
                      {r.proprietario_cliente_id ? (
                        <span className="almox-badge almox-badge-cliente" style={{ marginLeft: 6 }}>
                          {r.proprietario_cliente_nome}
                        </span>
                      ) : null}
                    </td>
                    <td>{r.tipo_servico || '—'}</td>
                    <td>
                      {r.prazo_previsto || '—'}
                      {r.vencida ? (
                        <span className="almox-badge almox-badge-vencida" style={{ marginLeft: 6 }}>Vencida</span>
                      ) : null}
                    </td>
                    <td>{r.itens_total}</td>
                    <td>
                      <span className={`almox-badge almox-badge-${String(r.status).toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="btn-almox-secondary" title="Abrir a remessa"
                          onClick={() => abrirDetalhe(r)}><FiEye size={13} /> Abrir</button>
                        {STATUS_COM_ENVIO.includes(r.status) && (
                          <button className="btn-almox-primary" title="Enviar ao terceiro (retém o saldo)"
                            onClick={(e) => enviar(r, e)}><FiSend size={13} /> Enviar</button>
                        )}
                        {STATUS_COM_RETORNO.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Registrar retorno do terceiro"
                            onClick={(e) => abrirModal('retorno', r, e)}><FiCornerDownLeft size={13} /> Retorno</button>
                        )}
                        {STATUS_COM_ENCERRAR.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Encerrar a remessa"
                            onClick={(e) => abrirModal('encerrar', r, e)}><FiCheckSquare size={13} /> Encerrar</button>
                        )}
                        {STATUS_COM_CANCELAR.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Cancelar a remessa"
                            onClick={(e) => abrirModal('cancelar', r, e)}><FiXCircle size={13} /> Cancelar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {aberta && (
        <div className="almox-table-container" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem', margin: '8px 12px' }}>
            {aberta.numero} — itens e retornos
          </h2>
          <table className="almox-table">
            <thead>
              <tr><th>Código</th><th>Material</th><th>Un.</th><th>Enviado</th><th>Retornado</th><th>Ainda no terceiro</th></tr>
            </thead>
            <tbody>
              {(aberta.itens || []).map((i) => (
                <tr key={i.id}>
                  <td>{i.material_codigo}</td><td>{i.material_nome}</td><td>{i.unidade}</td>
                  <td>{i.quantidade}</td><td>{i.quantidade_retornada || 0}</td>
                  <td>
                    <span className={`almox-badge almox-badge-${Number(i.pendente) > 0 ? 'baixo' : 'ok'}`}>{i.pendente}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(aberta.retornos || []).length > 0 && (
            <p style={{ margin: '8px 12px', fontSize: '0.85rem' }}>
              Retornos recebidos: {aberta.retornos.map((r) => `${r.material_codigo} ${r.quantidade}${r.nota_fiscal ? ` (${r.nota_fiscal})` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {modal && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>
                {modal.tipo === 'retorno' ? 'Registrar retorno'
                  : modal.tipo === 'encerrar' ? 'Encerrar remessa' : 'Cancelar remessa'}
              </h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.remessa.numero}</strong> — {modal.remessa.fornecedor_nome}</p>

              {modal.tipo === 'retorno' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Item retornado<span className="required">*</span></label>
                    <select className="almox-select" value={form.item_remessa_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, item_remessa_id: e.target.value }))}>
                      <option value="">Selecionar item...</option>
                      {(aberta?.itens || []).map((i) => (
                        <option key={i.id} value={i.id}>{i.material_codigo} — ainda no terceiro: {i.pendente}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" value={form.quantidade || ''}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Nota fiscal do retorno</label>
                    <input className="almox-input" value={form.nota_fiscal || ''}
                      onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))} />
                  </div>
                </>
              )}

              {modal.tipo === 'encerrar' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Destino do saldo que não voltou<span className="required">*</span></label>
                    <select className="almox-select" value={form.destino || ''}
                      onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}>
                      <option value="">Selecionar destino...</option>
                      <option value="PERDA_NO_TERCEIRO">Perda no terceiro (sumiu ou foi danificado lá)</option>
                      <option value="CONSUMIDO_NO_PROCESSO">Consumido no processo (virou cavaco / refugo)</option>
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Obrigatório quando sobrou material no terceiro: as duas opções dão baixa
                      definitiva no estoque. Se voltou tudo, a remessa já encerrou sozinha.
                    </small>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Justificativa<span className="required">*</span></label>
                    <textarea className="almox-input" rows={3} value={form.justificativa || ''}
                      onChange={(e) => setForm((f) => ({ ...f, justificativa: e.target.value }))} />
                  </div>
                </>
              )}

              {modal.tipo === 'cancelar' && (
                <div className="almox-field">
                  <label className="almox-label">Motivo do cancelamento<span className="required">*</span></label>
                  <textarea className="almox-input" rows={3} value={form.motivo || ''}
                    onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} />
                  <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                    O material que ainda estiver no terceiro volta para o disponível.
                  </small>
                </div>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...'
                  : modal.tipo === 'retorno' ? 'Confirmar retorno'
                    : modal.tipo === 'encerrar' ? 'Confirmar encerramento' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemessasTerceirosAlmoxarifado;
```

- [ ] **Step 7: Rota code-split e menu**

`client/src/routes/lazyModules.js` (junto dos outros exports do almoxarifado):

```js
export const RemessasTerceirosAlmoxarifado = page(() => import('../components/almoxarifado/RemessasTerceirosAlmoxarifado'));
```

`client/src/App.js` — acrescentar ao import de `lazyModules` (`RemessasTerceirosAlmoxarifado,`) e a
rota, junto das outras rotas do almoxarifado:

```jsx
        <Route path="remessas-terceiros" element={<RemessasTerceirosAlmoxarifado />} />
```

> **`App.js` NÃO importa telas direto** — o code-split do módulo depende de todas passarem por
> `lazyModules.js`. Importar o componente diretamente aqui derruba o chunk do almoxarifado inteiro
> para dentro do bundle principal, e nenhum teste pega.

`client/src/components/Layout.js`, em `almoxarifadoMenuItems`, logo depois de
`materiais-cliente` (e acrescentar `FiTruck` ao import de `react-icons/fi`):

```js
    // Etapa 8b: "Remessas a Terceiros" e material NOSSO que esta FORA do predio para beneficiar.
    // Nao confundir com "Devolucoes" (Etapa 7, o material volta PARA o estoque) nem com "Materiais
    // de Clientes" (Etapa 8, material que e de outro dono e esta AQUI).
    { path: '/almoxarifado/remessas-terceiros', icon: FiTruck, label: 'Remessas a Terceiros' },
```

- [ ] **Step 8: Rodar os testes de client e ver passar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceiros src/utils/remessaPdf --watchAll=false`
Expected: PASS — 13 + 8 testes.

- [ ] **Step 9: Sabotagens obrigatórias**

| # | Sabotagem | Falha esperada |
|---|---|---|
| S1 | Remover as 6 regras novas de `Almoxarifado.css` | falha `o badge de status usa uma classe que EXISTE no CSS do modulo`? **Não** — JSDOM não valida CSS. **Verificação manual obrigatória:** abrir a tela no navegador e conferir que os cinco badges têm cor. Este é o buraco conhecido desde a Etapa 7 e o plano o declara em vez de fingir cobertura |
| S2 | Sempre renderizar `almox-badge-vencida` | falha `remessa vencida ganha destaque e a que esta no prazo NAO ganha` |
| S3 | Nunca renderizar `almox-badge-vencida` | falha o mesmo teste, na outra metade |
| S4 | Sempre renderizar o selo `.almox-badge-cliente` | falha `o selo de propriedade nomeia o cliente so na remessa que e de cliente` |
| S5 | Mostrar todos os botões em todos os status | falha `as acoes seguem o status` |
| S6 | Trocar `err.response?.data?.error \|\| '...'` por só o texto genérico | falha `o erro do servidor aparece para o operador, com a mensagem do backend` |
| S7 | Remover a checagem de destino/justificativa antes do `api.put` | falha `encerrar com pendencia exige destino E justificativa antes de chamar o servidor` |
| S8 | Importar o componente direto em `App.js` (sem `lazyModules`) | **nenhum teste falha** — verificação é ler o diff; declarado aqui porque já mordeu o projeto |

- [ ] **Step 10: Suíte e build do client**

Run:
```
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```
Expected: **255 testes / 24 suítes** (234 + 21 novos, 2 suítes novas), build `Compiled successfully.`
`CI=true` faz warning virar erro — import não usado em `Layout.js` ou `App.js` quebra o build aqui.

- [ ] **Step 11: Verificação manual (o que teste de JSDOM não cobre)**

`npm run dev` na raiz, e no navegador:
1. Menu **Almoxarifado → Remessas a Terceiros** abre a tela.
2. Os cinco badges de status têm **cor** (S1 acima: JSDOM não pega classe CSS ausente).
3. O badge **Vencida** aparece vermelho ao lado do status, e não no lugar dele.
4. "PDF da remessa" baixa um PDF legível, com o número, o terceiro, os itens e as duas linhas de
   assinatura — e, numa remessa de material de cliente, com o **nome do cliente proprietário**.

- [ ] **Step 12: Commit**

```bash
git add client/src/utils/remessaPdf.js \
        client/src/utils/remessaPdf.test.js \
        client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js \
        client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.test.js \
        client/src/components/almoxarifado/Almoxarifado.css \
        client/src/routes/lazyModules.js \
        client/src/App.js \
        client/src/components/Layout.js
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 9: tela de Remessas a Terceiros e documento de remessa em PDF

Zero mudanca de servidor. O PDF e gerado no navegador com montador puro + renderizador jspdf,
padrao ja validado em duas etapas seguidas (etiquetasPdf 6c, posicaoClientePdf 8). O montador e
testado como funcao pura porque assertar sobre bytes de PDF nao diz se o numero certo foi para a
coluna certa — e num papel que acompanha material saindo do predio essa e a unica falha que importa.

O documento NOMEIA o cliente proprietario quando o material e de terceiro, e nao nomeia nada quando
o material e nosso. As duas metades tem teste: escrever "material de cliente" sempre passaria no
teste do nome e poria um dono falso em todo documento de estoque proprio. Esse nome no papel e a
contrapartida da isencao da guarda do dono (decisao 5) — sem ele a isencao seria um caminho para
material de cliente sair do predio sem rastro de propriedade.

As acoes da tela seguem o status e nao a vontade da interface: quem decide e a maquina de estados
no servidor, e os botoes so escondem o que ele recusaria — oferecer "Enviar" numa remessa ja
enviada produziria um 400 que o operador nao entenderia. "Vencida" e alerta que SE SOMA ao status
(badge separado, ao lado) e vem calculado do servidor: recalcular na tela criaria uma segunda conta
que discordaria do filtro.

As seis classes de badge foram criadas em Almoxarifado.css. Classe inventada sai sem fundo nem cor
e NENHUM teste pega — aconteceu na Etapa 7 —, entao o plano tambem manda conferir no navegador.

A mensagem de erro do backend chega inteira ao operador: ela nomeia o item que travou o envio e a
quantidade que nunca voltou no encerramento, e trocar por um texto generico apagaria justamente o
numero que resolve o problema.

Rota registrada em routes/lazyModules.js (code-split — App.js nao importa telas direto, senao o
chunk do almoxarifado inteiro cai no bundle principal) e item de menu em Layout.js, com o
comentario que separa as tres telas vizinhas: Devolucoes (o material volta PARA o estoque),
Materiais de Clientes (material de outro dono, aqui) e Remessas a Terceiros (material nosso, fora).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 10: documentação e verificação final

**Files:**
- Modify: `specs/modulo-almoxarifado/14-materiais-terceiros/README.md`
- Modify: `specs/modulo-almoxarifado/README.md`
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md`
- Modify: `docs/almoxarifado-novidades-por-etapa.md`
- Modify: `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md` (este arquivo)

**Interfaces:**
- Consumes: os hashes das Tasks 1-9 e os números reais das suítes.
- Produces: documentação que não mente. **Documentação desatualizada é trabalho não terminado** —
  regra nº 1 do `CLAUDE.md`, e já falhou nesta base.

- [ ] **Step 1: Rodar TODOS os gates e anotar os números reais**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation
cd server && npm run test:safealter
cd server && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Esperado: `test:api` **74/74 arquivos OK** (68 na entrada + 6 novos), `test:almoxarifado`
**42 passou / 0 falhou** (a etapa não removeu nem acrescentou caso lá), validation **4/0**,
safealter **3/0**, sqlite **3/0**; client **255 testes / 24 suítes**, build `Compiled successfully.`

> **Se algum número divergir, escreva o número REAL e explique a divergência** — foi assim que a
> Etapa 8 registrou honestamente a queda de 43 para 42 em `test:almoxarifado` (um teste a menos
> porque o código que ele testava deixou de existir). Número inventado em documento de fechamento é
> pior que número ausente.

- [ ] **Step 2: `specs/modulo-almoxarifado/14-materiais-terceiros/README.md`**

Trocar o cabeçalho inteiro (que hoje diz "❌ nada implementado" e "a 8b ainda não tem design
aprovado nem tasks quebradas") por:

```markdown
# 14 — Materiais Enviados a Terceiros

> **Status:** 🟢 **Etapa 8b entregue** (2026-08-12) — remessa e retorno do MESMO material.
> 🟡 no total da feature: a **transformação** (chapa → peças) é a **Etapa 8c**, ainda não iniciada.
> **Spec original:** seção 18 · **Última atualização:** 2026-08-12
> **Design:** `docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md`
> **Plano:** `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md`
```

Marcar o checklist item por item, **cada `[x]` com o hash do commit**, e — para o que ficou de fora
— **deixar desmarcado com o motivo escrito ao lado**, nunca desmarcado em silêncio:

```markdown
### Backend
- [x] Tabela `remessas_terceiro_almoxarifado` com fornecedor, OS/pedido, prazo e status (`<hash T3>`)
- [x] Itens da remessa: material, quantidade, peso, lote (`<hash T3>`) — **desenhos anexos NÃO**:
      fora do escopo declarado (decisão 10), não bloqueia o ciclo e a 8c é o consumidor natural dele
- [x] Envio = saldo visível mas não disponível (`<hash T1>`, `<hash T4>`, `<hash T5>`) — **não** por
      localização virtual: a spec sugeria isso e **estava errada** (ver a correção abaixo)
- [x] Documento de remessa (PDF) (`<hash T9>`)
- [x] Retorno parcial/total vinculado à remessa (`<hash T6>`)
- [x] Perda ou consumo no terceiro: baixa com motivo (`<hash T7>`)
- [ ] **Transformação** — é a **Etapa 8c**. A modelagem já está pronta
      (`retornos_remessa_item_almoxarifado.material_id`), e o retorno com material diferente é
      recusado hoje com mensagem que aponta a 8c (`<hash T6>`)
- [ ] Acompanhamento de prazo + **alerta** de atraso — o prazo é gravado, a leitura
      `GET /remessas-terceiros/vencidas` existe e a tela destaca vencidas (`<hash T8>`, `<hash T9>`);
      o **disparo** do alerta é da feature 20 (decisão 10)
- [ ] E-mail no envio e retorno — feature 19 (decisão 10)

### Frontend
- [x] Tela de remessas: criar, acompanhar, receber retorno, encerrar, cancelar (`<hash T9>`)
- [x] Posição "o que está em cada terceiro" — a listagem filtra por fornecedor e status (`<hash T9>`)
```

E acrescentar a seção de correção de spec — **não apagar a afirmação errada em silêncio**:

```markdown
## Correção de spec declarada

**Esta spec dizia "Envio = saída para localização virtual 'Em terceiros' (via movimentação v2 —
saldo visível mas não disponível)". Está errado, e foi corrigido no design da 8b.**
`stockService.getSaldoDisponivel` calcula sobre o escalar `materiais_almoxarifado.quantidade_atual`
— material numa localização virtual **continuaria disponível para saída**, ou seja, a solução
proposta não entregava o requisito que ela mesma enunciava. O que foi feito: quarta coluna de
retenção `quantidade_em_terceiros`, com a conferência de inventário descontando **só ela**.
```

- [ ] **Step 3: `specs/modulo-almoxarifado/README.md`**

Atualizar o cabeçalho `Última atualização` (empurrando o atual para o `Antes:`) com o resumo da 8b,
e a **linha 14 do mapa de features** para 🟡 (8b entregue, 8c pendente). O cabeçalho novo precisa
conter, no mínimo: a correção das 14 leituras do disponível (e que o design dizia sete), a coluna
`quantidade_em_terceiros`, o desconto **só dela** na conferência, os quatro tipos de movimento, a
ação `remessar_terceiro`, os números reais das suítes, e a pendência do `AJUSTE` ganhando segunda
instância.

- [ ] **Step 4: `docs/almoxarifado-guia-etapas-e-testes.md`**

Atualizar o bloco **"Onde o desenvolvimento parou"** (o atual vira "Antes:") e acrescentar a seção
**"Etapa 8b — Remessas a Terceiros"**, com:

1. **Antes → Agora** (tabela);
2. **roteiro de teste manual clicável** — o caminho completo: criar remessa com dois itens → tentar
   enviar com um item sem saldo (ver a recusa da remessa **inteira**) → corrigir → enviar → conferir
   em Materiais que o **disponível caiu e o total NÃO** → abrir uma conferência de inventário e ver
   que o esperado **já vem descontado** → registrar retorno parcial → tentar retornar mais do que
   saiu (ver a mensagem com os três números) → encerrar sem destino (ver a recusa nomeando a
   quantidade) → encerrar com `PERDA_NO_TERCEIRO` → imprimir o PDF;
3. **o que a etapa NÃO cobre**: transformação (8c), e-mail (19), alerta automático de atraso (20),
   anexo de desenhos, e o estorno de `PERDA_TERCEIRO` que devolve ao **disponível** (não ao
   `em_terceiros`);
4. **o que fazer antes do deploy**: nada novo a medir em produção — a etapa só acrescenta coluna e
   tabelas, sem tocar em dado existente. **Dizer isso explicitamente**, porque as Etapas 7 e 8
   deixaram consultas pendentes e o leitor vai procurar a desta.

- [ ] **Step 5: `docs/almoxarifado-novidades-por-etapa.md` — o documento que vai à empresa**

Este é o documento que o usuário **apresenta**. Cada regra precisa de **cenário exato: o que
digitar, o que o sistema recusa, e a mensagem esperada copiada do código** (não parafraseada).

**5a.** Na tabela "Visão geral", acrescentar a linha:

```markdown
| 8b | Remessas a Terceiros | 2026-08-12 | O material que vai beneficiar fora (galvanizar, pintar, usinar) para de sumir do controle: sai do disponível sem sair do patrimônio, com prazo, retorno parcial e baixa justificada do que não voltou |
```

e trocar o parágrafo "Próxima etapa da ordem" por: *"Com a 8b, a feature 14 fica parcialmente
entregue — falta a **transformação** (chapa → peças cortadas), que é a **Etapa 8c**."*

**5b.** No bloco **"⚠️ Leia antes de apresentar"**, o item **B** ganha a **segunda instância**.
Substituir o item B por:

```markdown
### B. Uma decisão de negócio esperando por você — agora em DOIS lugares

**O Ajuste não reconcilia o material retido.** Ele mexe no total sem olhar para o que está preso.

**B1 (já existia, desde a Etapa 7) — material bloqueado.** Bloquear 8 unidades e depois ajustar o
total para 1 deixa `bloqueado (8) > total (1)`: **disponível negativo, sem nenhuma guarda**. É
plausível na operação real — o inventário acha menos do que o sistema dizia, com parte do material
em quarentena.

**B2 (NOVO, da Etapa 8b) — material que está no terceiro.** Mesmo problema, com a coluna nova:
mandar 30 chapas galvanizar e depois ajustar o total do material para 10 deixa `em terceiros (30) >
total (10)`. **O sistema aceita.** É *mais* plausível que o B1, porque quem conta a prateleira vê
menos material — o resto está no galvanizador — e o instinto é "corrigir" o saldo.

> **A Etapa 8b reduziu a chance de isso acontecer, sem resolver a causa.** A contagem de inventário
> agora já desconta o que está no terceiro (o esperado vem certo, então não há mais o impulso de
> corrigir), e o encerramento de remessa é o caminho controlado para zerar a retenção. Mas se
> alguém lançar um Ajuste manual à revelia, o buraco continua aberto.

Três respostas possíveis, e a escolha é sua — a mesma para B1 e B2: **(a)** o Ajuste baixa a
retenção proporcionalmente; **(b)** o Ajuste recusa enquanto houver retenção maior que o novo
total; ou **(c)** o Ajuste aceita e apenas avisa. Enquanto não for decidido: **resolva a quarentena
e encerre as remessas em aberto antes de lançar um ajuste que reduz o total.**
```

**5c.** Acrescentar a seção da etapa, com os cenários **exatos**. As mensagens abaixo são as do
código das Tasks 4-7 — **conferir cada uma contra o arquivo antes de publicar**, e corrigir aqui se
o texto tiver mudado no caminho:

```markdown
## Etapa 8b — Remessas a Terceiros (2026-08-12)

**Em uma frase:** quando uma chapa vai para o galvanizador, ela deixa de sumir do controle — sai do
disponível sem sair do patrimônio, com prazo, documento, retorno parcial e baixa justificada do que
nunca voltou.

**O problema que existia:** hoje, mandar material para fora beneficiar não tem lugar no sistema. Ou
alguém dá baixa — e o material **desaparece do patrimônio**, embora continue sendo da empresa — ou
não dá baixa nenhuma, e o sistema **afirma que a chapa está na prateleira** com ela a 40 km. Não há
prazo, não há retorno parcial, e não há como amarrar a peça que voltou à chapa que saiu.

**O que há de novo (visível para o usuário):** tela **Almoxarifado → Remessas a Terceiros**, com
criar / enviar / receber retorno / encerrar / cancelar, destaque para remessa vencida e **PDF do
documento de remessa** (com as duas linhas de assinatura, para o papel voltar assinado pelo
terceiro).

### As regras, com o cenário exato

**1. Enviar tira do disponível e NÃO tira do patrimônio.**
Material com 100 no estoque, remessa de 30 → depois de enviar, **o total continua 100** e o
disponível vira **70**. Em Materiais, a coluna de saldo não muda; quem tenta uma saída de 80 recebe:
> `Saldo insuficiente. Disponível: 70 UN`

**2. A remessa é enviada inteira, ou não é enviada.**
Remessa com dois itens, um deles sem saldo (disponível 5, remessa pede 50). Ao clicar em **Enviar**:
> `Nao foi possivel enviar a remessa REM-12345678: MAT-002: disponivel 5 UN, a remessa pede 50`

**Nenhum dos dois itens sai.** O item que tinha saldo continua com o disponível cheio — o operador
corrige o item que falta e reenvia, em vez de descobrir que metade saiu.

**3. A contagem de inventário não cobra o que está no terceiro.**
Material com 100 no total e 30 no galvanizador. Abrir **Conferência** → o esperado do item vem
**70**. Contar 70 na prateleira dá **divergência zero**. *Antes desta etapa isso acusaria −30, e o
caminho natural seria "corrigir" o saldo para menos de material que existe e vai voltar.*

**4. Bloqueado e em quarentena CONTINUAM sendo contados.**
Material com 100 no total, 40 bloqueados e 25 em quarentena → o esperado da conferência é **100**.
Aquele material **está** na prateleira; "bloqueado" é um estado administrativo, não uma ausência
física. Só o que está no terceiro sai da contagem.

**5. Não dá para receber de volta mais do que saiu.**
Remessa de 100, já retornaram 70, tentar registrar mais 40:
> `Retorno acima do enviado: o item CHP-3MM enviou 100 PC, ja retornaram 70 e ainda estao no terceiro 30`

A mensagem diz os três números de propósito: sem eles o operador teria de adivinhar quanto ainda
pode receber.

**6. Encerrar deixando saldo lá fora exige dizer PARA ONDE ele foi.**
Remessa de 100 com 30 que nunca voltaram. Clicar em **Encerrar** sem escolher destino:
> `A remessa REM-12345678 tem 30 PC que nunca voltaram (CHP-3MM: 30). Para encerrar, informe o destino desse saldo: PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO, mais a justificativa.`

- **Perda no terceiro** = sumiu ou foi danificado lá.
- **Consumido no processo** = virou cavaco, refugo de processo.

Os dois **dão baixa definitiva** no estoque. *Só justificativa em texto livre não bastaria: o saldo
precisa sair de "em terceiros", senão a remessa fica encerrada com material preso para sempre.*

**7. Remessa que voltou inteira encerra sozinha, sem perguntar nada.**
Registrar o retorno dos 100 de uma remessa de 100 → a remessa vai direto para **ENCERRADA**. Não
sobrou pendência, então não há o que justificar.

**8. Cancelar uma remessa já enviada devolve tudo ao disponível.**
Remessa de 100 enviada, cancelada com motivo → o disponível volta para 100 na hora. Se 60 já tinham
voltado, o cancelamento devolve **só os 40** que ainda estavam lá fora.

**9. A chapa do cliente pode ir para o terceiro — e o papel diz de quem ela é.**
Material com dono (Etapa 8) vai para o galvanizador **sem** exigir OS ou projeto do cliente: mandar
galvanizar não é *aplicar* a chapa em trabalho de ninguém. Em troca, a remessa **registra o
proprietário** e o **PDF nomeia o cliente**. E a regra da Etapa 8 continua valendo: tentar uma
**saída** normal daquele material sem OS do dono continua sendo recusada.

**10. Remessa não mistura donos.**
Tentar montar uma remessa com chapa do Cliente A e do Cliente B:
> `A remessa mistura materiais de donos diferentes (Cliente A LTDA e Cliente B LTDA). O documento de remessa nomeia UM proprietario — separe em remessas diferentes.`

**11. Quem pode mandar material para fora.**
Ação nova **`remessar_terceiro`**, hoje concedida a **ADMINISTRADOR** e **ALMOXARIFE** (os mesmos de
"movimentar"). Ela existe separada porque **o material sai do site**, o que é um risco diferente de
mover prateleira — e porque assim dá para restringir depois, sem reescrever nada. Quem não tem
recebe **403** e o botão nem aparece na tela.

**Antes → Agora:**

| Antes | Agora |
|---|---|
| Chapa que vai galvanizar some do controle (baixa que apaga o patrimônio, ou nenhuma baixa) | Sai do disponível e continua no patrimônio, com documento e prazo |
| Não havia como saber o que está em cada terceiro | Tela com filtro por status e fornecedor, e destaque de remessa vencida |
| Retorno parcial não existia | Vários retornos por remessa, com teto que soma o que já voltou |
| O que não voltava ficava indefinido | Encerramento exige destino (perda ou consumo) + justificativa, e dá baixa |
| A contagem de inventário cobraria material que está a 40 km | O esperado já vem descontado; bloqueado e quarentena continuam sendo contados |

**O que esta etapa NÃO cobre (é decisão, não esquecimento):**
- **Transformação** — chapa que sai e volta como 40 peças cortadas mais uma sobra. É a **Etapa 8c**;
  a estrutura de dados já está pronta e o sistema hoje **recusa** o retorno de material diferente.
- **E-mail** no envio e no retorno (feature 19) e **alerta automático** de atraso (feature 20). O
  prazo é gravado e a tela destaca a remessa vencida; o disparo automático é das outras features.
- **Anexo de desenhos** nos itens da remessa.
- **Estornar uma baixa de perda no terceiro devolve o material ao disponível**, e não à situação
  "em terceiros" — a remessa já está encerrada, e recriar a retenção deixaria saldo preso sem
  remessa viva por trás.
```

- [ ] **Step 6: Fechar este plano**

No topo deste arquivo, acrescentar o bloco de conclusão no molde do plano da Etapa 8: tabela
`Task | O quê | Hash(es)`, tabela de gates com os **números reais** do Step 1, correções de spec
declaradas, pendências que a etapa deixa registradas, e a próxima tarefa. Marcar todos os
checkboxes `- [x]`.

- [ ] **Step 7: Commit**

```bash
git add specs/modulo-almoxarifado/14-materiais-terceiros/README.md \
        specs/modulo-almoxarifado/README.md \
        docs/almoxarifado-guia-etapas-e-testes.md \
        docs/almoxarifado-novidades-por-etapa.md \
        docs/superpowers/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md
git commit -F- <<'EOF'
Almoxarifado Etapa 8b, Task 10: documentacao da etapa e verificacao final

Documentacao desatualizada e trabalho nao terminado — a regra numero 1 do CLAUDE.md existe porque
ja falhou nesta base: codigo entregue e specs continuando a dizer que a feature nao existia.

Uma correcao de spec DECLARADA, nao apagada em silencio: a spec 14 dizia "envio = saida para
localizacao virtual 'Em terceiros' (saldo visivel mas nao disponivel)", e isso esta ERRADO.
getSaldoDisponivel calcula sobre o escalar quantidade_atual — material numa localizacao virtual
continuaria disponivel para saida, ou seja, a solucao proposta nao entregava o requisito que ela
mesma enunciava. O que foi feito e a quarta coluna de retencao.

O checklist da feature 14 tem tres itens DESMARCADOS COM O MOTIVO ESCRITO ao lado (transformacao =
Etapa 8c, e-mail = feature 19, alerta = feature 20), em vez de desmarcados em silencio, que pareceria
esquecimento.

O documento de novidades — o que vai a empresa — recebeu os onze cenarios da etapa com o que
digitar, o que o sistema recusa e a MENSAGEM EXATA copiada do codigo. E o bloco "Leia antes de
apresentar" recebeu a SEGUNDA INSTANCIA da decisao pendente do AJUSTE: ele nao reconcilia
quantidade_em_terceiros, do mesmo jeito que ja nao reconciliava quantidade_bloqueada. A 8b nao
resolve e nao piora — a contagem de inventario passou a vir certa, o que remove o impulso de
"corrigir" o saldo, e o encerramento de remessa e o caminho controlado para zerar a retencao.

Numeros reais das suites registrados no plano e no README mestre, medidos e nao presumidos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Self-review do plano

Feito com o design aberto ao lado, depois de o plano inteiro estar escrito.

### 1. Cobertura do design — decisão por decisão

| Decisão do design | Onde está no plano |
|---|---|
| **1** — escopo dividido em 8b/8c | Global Constraints (fora do escopo declarado) + Task 6 (recusa de material diferente apontando a 8c) + "Próxima tarefa" |
| **2** — coluna `quantidade_em_terceiros`; conferência desconta **só** ela; reusar a auditoria da Etapa 8 | Tasks 1 e 2. A auditoria das 40 leituras é **consumida**, não refeita (declarado no "Ponto de partida") |
| **2 (armadilha)** — a conta replicada em SQL | Task 1 inteira, com a lista de 14 corrigida e a verificação por varredura |
| **2b** — fornecedor `INTEGER` + nome espelhado, sem FK; stub no harness | Task 3 (DDL, testes de DDL e de harness), Task 5 (`resolverFornecedor` com `sqlite_master`) |
| **3** — máquina de estados | Task 3 |
| **4** — encerrar com pendência exige **destino**, não só justificativa | Task 7 |
| **5** — guarda do dono isenta, com dono obrigatório no documento | Task 4 (`TIPOS_ISENTOS_DONO` + controle positivo), Task 5 (`resolverProprietario`), Task 9 (PDF nomeia o cliente) |
| **6** — ação `remessar_terceiro` em `ACAO_PERFIS` e em `/minhas-permissoes` | Task 3 |
| **7** — retorno como lista de resultados, 8c não reescreve tabela | Task 3 (DDL + teste da forma), Task 6 |
| **8** — PDF no navegador | Task 9 |
| **9** — sem transação, copiar a forma do recebimento | Task 5 (envio) e Task 6 (retorno), as duas com pré-checagem + claim |
| **10** — e-mail/alerta/anexos fora do escopo | Global Constraints + Task 8 (rota `/vencidas` sem disparo) + Task 10 (declarado no checklist e no guia) |

**Os 10 testes exigidos pela tabela do design**, e onde cada um vive:

| Teste exigido | Arquivo · Task |
|---|---|
| `envio a terceiro remove do disponivel e mantem quantidade_atual` | `remessaTerceiroMotor` · T4 |
| `conferencia desconta o que esta em terceiros do esperado` | `conferenciaEmTerceiros` · T2 |
| `[controle positivo] conferencia continua cobrando material bloqueado e em quarentena` | `conferenciaEmTerceiros` · T2 |
| `retorno maior que a remessa falha` | `remessaTerceiroCiclo` · T6 (e a variante do motor em T4) |
| `encerrar remessa com pendencia sem destino falha` | `remessaTerceiroCiclo` · T7 |
| `encerrar com perda no terceiro zera o em_terceiros` | `remessaTerceiroCiclo` · T7 |
| `cancelar remessa enviada restaura o disponivel` | `remessaTerceiroCiclo` · T7 |
| `remessa com item sem saldo nao move nenhum item` | `remessaTerceiroCiclo` · T5 |
| `remessa de material de cliente nao exige vinculo do dono` | `remessaTerceiroMotor` · T4 |
| `remessa sem a acao remessar_terceiro falha com 403` | `remessaTerceiroCiclo` · T5 (serviço) e `remessaTerceiroRotas` · T8 (rota) |

**Gap consciente:** o design não pede tela de "posição por terceiro" separada; a listagem com
filtro por fornecedor cobre o item do checklist da feature 14. Registrado assim na Task 10.

### 2. Varredura de placeholders

Um encontrado e **corrigido no lugar**: o teste `a baixa no terceiro escreve a linha de saldo por
localizacao`, na Task 4, tinha uma expressão aritmética marcadora. A nota logo abaixo do bloco traz
o `assert` real a usar. Nenhum "TBD", "similar à Task N" ou "adicione tratamento de erro
apropriado" restante — todo step de código traz o código, e código repetido entre tasks foi
**repetido**, não referenciado.

Uma sabotagem (Task 9, S1) está declarada como **não coberta por teste automatizado** — JSDOM não
valida CSS. Isso não é placeholder: é um buraco real, nomeado, com a verificação manual
correspondente no Step 11. Fingir cobertura ali seria pior.

Duas sabotagens (Task 8 S1, Task 9 S8) também não derrubam nenhum teste — nos dois casos o plano
diz **exatamente qual asserção ou qual leitura de diff** faz as vezes da prova.

### 3. Consistência de tipos e nomes

- `disponivelSql(alias)` recebe o alias **sem ponto** em todas as 13 chamadas; `COLUNAS_RETENCAO`
  tem o mesmo nome na Task 1 e no `getSaldoDisponivel`.
- `thirdPartyService` expõe, e as tasks seguintes chamam, exatamente: `criarRemessa`,
  `enviarRemessa`, `getRemessa`, `listarRemessas`, `validarRetornoDoItem`, `registrarRetorno`,
  `pendentesDaRemessa`, `encerrarRemessa`, `cancelarRemessa`, `DESTINOS_ENCERRAMENTO`,
  `TIPO_MOVIMENTO_DESTINO`.
- Os quatro tipos de movimento têm o mesmo nome em `schema.js`, `stockService`, `movementRules`,
  `ownerRules`, `TIPO_MOVIMENTO_DESTINO` e nos testes: `REMESSA_TERCEIRO`, `RETORNO_TERCEIRO`,
  `PERDA_TERCEIRO`, `CONSUMO_TERCEIRO`. Os **destinos** (`PERDA_NO_TERCEIRO`,
  `CONSUMIDO_NO_PROCESSO`) são strings **diferentes** dos tipos, de propósito: um é escolha de
  negócio na tela, o outro é tipo de movimento no livro. `TIPO_MOVIMENTO_DESTINO` é o único lugar
  que os liga.
- Os cinco status (`ABERTA`, `ENVIADA`, `RETORNO_PARCIAL`, `ENCERRADA`, `CANCELADA`) batem entre a
  máquina de estados, o DDL, o schema Zod do filtro, as classes CSS e o `select` da tela.
- `pendente` (campo calculado do item) tem o mesmo nome em `getRemessa`, em `pendentesDaRemessa`
  (como `p.pendente`), na tela e no teste.

### 4. Duas decisões que eu tomei e o design não tomou — sinalizadas para revisão

1. **Tipos de movimento dedicados para a baixa do encerramento** (`PERDA_TERCEIRO` /
   `CONSUMO_TERCEIRO`), em vez de reusar `PERDA`/`SUCATA`. A razão está escrita na Task 4: reusar
   quebraria o encerramento de remessa de material **de cliente** (os dois estão em
   `TIPOS_SAIDA_COM_DONO`) e deixaria `quantidade_em_terceiros` preso. Se o revisor discordar, o
   ponto de mudança é pequeno e localizado (`TIPO_MOVIMENTO_DESTINO` + as listas de `schema.js`).
2. **Remessa não mistura donos.** O design diz que o documento nomeia o proprietário; deduzi que
   isso implica **um** proprietário por remessa e transformei em recusa com mensagem. É uma
   restrição nova que o design não escreveu, e vale confirmar com o cliente antes de implementar —
   se ele mandar remessas mistas na prática, a regra vira "o documento lista os donos por item".
   > **Status em `257a444` (Task 5): IMPLEMENTADA, e CONTINUA NÃO CONFIRMADA com a GMP.** Foi
   > implementada como o plano manda, mas o comentário de `thirdPartyService.resolverProprietario`
   > diz em voz alta que é dedução e descreve a saída, para que ninguém a leia como requisito do
   > cliente. **Ainda precisa da confirmação.** Se a resposta for "mandamos remessas mistas": o
   > ponto de mudança é só `resolverProprietario` + as colunas `proprietario_cliente_id/nome` do
   > cabeçalho (que passam a ser derivadas ou nulas em remessa mista) + o PDF da Task 9, que passa a
   > imprimir o dono por linha. O dono de cada item já é lido do material — não há dado a migrar.

---

## Próxima tarefa: **Etapa 8c — transformação (chapa → peças cortadas + sobra)**

A decisão 1 do design separou a 8c da 8b, e a fronteira é real: **tratamento, pintura e
galvanização** devolvem o **mesmo** material, e para eles a 8b entrega o ciclo completo sozinha. Só
**corte, dobra e usinagem** devolvem material diferente.

**O contrato pronto que a 8c consome — e que ela não precisa reabrir:**

- `retornos_remessa_item_almoxarifado(id, remessa_id, item_remessa_id, material_id, quantidade,
  lote_id, nota_fiscal, movimentacao_id, ...)` — **já modelado como lista de resultados**. Na 8b
  todo resultado tem `material_id` igual ao do item enviado; a 8c passa a permitir outro. O vínculo
  de rastreabilidade **item enviado → resultado** já existe e já é testado
  (`[schema] o retorno guarda material_id PROPRIO`, Task 3).
- `thirdPartyService.validarRetornoDoItem(db, { remessaId, itemRemessaId, quantidade, materialId })`
  — **é o único ponto que recusa material diferente hoje**, com a mensagem que aponta a 8c
  (Task 6). Abrir a transformação começa por ali.
- `RetornoRemessaSchema` **já declara `material_id` no item** (Task 8), de propósito: sem a chave, o
  campo chegaria como `undefined` até a 8c e a recusa nunca dispararia.
- Os quatro tipos de movimento (Task 4) e a coluna `quantidade_em_terceiros` (Task 1), com a conta
  do disponível **numa fonte só** — a 8c muda colunas de `materiais_almoxarifado`? Se sim,
  `availabilitySql.js` e a varredura da Task 1 tornam a auditoria de uma linha.

**Os quatro pontos que o design da 8c precisa decidir** (o motor de hoje **não** tem nenhum conceito
de "material A vira material B"):

1. **A baixa da chapa original.** Quando voltam 40 peças e uma sobra, a chapa que saiu tem de sair
   do `em_terceiros` **e** do patrimônio, e as peças têm de **entrar**. Não é um movimento, são
   dois, e sem transação isso precisa do mesmo tratamento de claim + compensação da 8b. O tipo
   `CONSUMO_TERCEIRO` já existe e é candidato natural à baixa da chapa — falta decidir se o crédito
   das peças é `ENTRADA_MANUAL` ou um tipo novo `RETORNO_TRANSFORMACAO`.
2. **De onde vem o custo das peças.** A chapa tinha custo médio; as 40 peças precisam herdar algo.
   Rateio por quantidade? Por peso? O custo do serviço do terceiro entra? O motor já sabe fazer
   custo médio ponderado na entrada (`custo_unitario` informado), então a decisão é **qual número
   passar**, não como.
3. **Quem cria o material resultante.** A peça cortada é um material novo no cadastro. A tela do
   retorno cria na hora, ou exige que já exista? A Etapa 8 tem precedente do lado oposto (o
   recebimento **não** cria material).
4. **A sobra.** Sobra reaproveitável é material (a categoria `Sucata e sobras reaproveitáveis` já
   existe no seed) — mas sobra que virou cavaco é `CONSUMO_TERCEIRO`. Quem decide qual é qual, e o
   fechamento aritmético (`chapa que saiu = peças + sobra + perda`) é validado ou é informativo?

**A primeira ação de quem pegar a 8c é `superpowers:brainstorming` com este briefing** — não sair
escrevendo código. A 8b foi escrita para não fechar nenhuma dessas portas, e a mais importante
delas (o retorno ser lista, e não escalar) já está aberta.

