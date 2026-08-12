# Almoxarifado Etapa 8 — Materiais de Clientes: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** material de cliente deixa de ser uma ilha sem motor e vira material normal com dono
(`materiais_almoxarifado.proprietario_cliente_id`), ganhando lote, série, endereço, extrato,
etiqueta e livro de movimentações — com saldo do cliente **fora** de toda leitura de estoque
próprio, saída travada em OS/projeto do próprio dono, ajuste sob permissão dedicada, devolução ao
cliente como tipo de movimento, tela de posição por cliente com PDF e selo de propriedade nas
listagens que misturam.

**Architecture:** uma coluna nova em `materiais_almoxarifado` (`proprietario_cliente_id INTEGER`,
`NULL` = material nosso) via `safeAlter`; auditoria nomeada de **todas** as leituras da tabela,
cada uma classificada e tratada (Task 1); guarda do dono num módulo próprio
`services/almoxarifado/ownerRules.js`, chamado pelo motor logo depois de `avaliarRegrasVinculo`
(Task 3); ajuste sob a ação nova `ajustar_material_cliente` verificada **dentro do motor** (não só
na rota, porque duas rotas chegam ao AJUSTE); `DEVOLUCAO_CLIENTE` como tipo de saída criável só por
rota dedicada; a ilha (`clientMaterialService` + 3 rotas) é removida, a tabela fica marcada como
aposentada; telas e PDF 100% no client, zero mudança de servidor para PDF.
Design aprovado: `docs/superpowers/specs/2026-08-12-almoxarifado-etapa8-materiais-clientes-design.md`.

**Tech Stack:** Express + sqlite3 (sem transações — compensação explícita é o idioma do motor), Zod
via `validate(schema)`, testes de API com supertest + harness `server/tests/helpers/testApp.js`
(runner artesanal: `test()`, contador, `process.exit`), React CRA com testes `createRoot` + mocks
(sem @testing-library), `jspdf` no navegador para PDF.

---

## Ponto de partida: a Etapa 7 já está entregue

**Este plano é executado DEPOIS da Etapa 7** (`docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md`).
O estado do código que este plano assume como existente, e que **não** deve ser reimplementado
aqui:

- tipo `TRANSFERENCIA` disponível no formulário da tela de Movimentações;
- tela `/almoxarifado/devolucoes` (devolução **para** o estoque — o material volta ao galpão);
- colunas `movimentacao_saida_id` e `lote_id` em `devolucoes_material_almoxarifado`;
- entrada de `TRANSFERENCIA` em `REGRAS_VINCULO` (`server/services/almoxarifado/movementRules.js`);
- correção do destino SUCATA na devolução: passa a emitir `ENTRADA_DEVOLUCAO` **+** `SUCATA`.

**Não confundir a devolução da Etapa 7 com a desta etapa.** Na 7 o material **volta** para o
estoque (entrada). Aqui, `DEVOLUCAO_CLIENTE` é **saída**: o material sai do prédio de volta para
quem é dele (decisão 9 da spec). São dois fluxos com direções opostas — a Task 6 cria um tipo novo
justamente para não sequestrar a tela da 7.

Se ao começar a Task 1 alguma dessas peças da Etapa 7 **não** estiver no código, **pare e reporte**
— este plano foi escrito contra esse estado, e a Task 6 (que mexe em `REGRAS_VINCULO` e em
`tiposSaida`) colide com a 7 se as duas rodarem fora de ordem.

---

## Global Constraints

- Commits em **português, corpo sem acento**, explicando o **porquê** (o bug, a consequência, o que
  foi decidido e descartado); um commit por assunto; **nunca `git add -A`** — listar os arquivos
  (há artefatos de runtime em `server/data/` e `server/uploads/`).
- `proprietario_cliente_id IS NULL` **é** "material nosso". Não existe flag booleana paralela, não
  existe `0` como "nosso" — só `NULL`. Qualquer código que teste propriedade testa `IS NULL` /
  `IS NOT NULL`.
- Chave não declarada no schema Zod é **descartada em silêncio** (`validation.js` troca `req.body`
  pelo parsed) — todo campo novo de API precisa entrar no schema correspondente.
- O motor não tem transações: todo efeito multi-passo segue claim-no-WHERE + compensação explícita.
- Quem decide é sempre o **backend**. `GET /almoxarifado/minhas-permissoes` existe só para a UI
  barrar antes do formulário e **falha aberto** de propósito.
- `getPerfilFromUser` faz fallback para `PRODUCAO` — usuário sem perfil **não** é "sem acesso", é
  chão de fábrica. Todo teste de negativa de permissão precisa usar um perfil explícito
  (`perfil_almoxarifado: 'PRODUCAO'` ou `'CONSULTA'`), nunca "usuário sem perfil".
- Almoxarifado é **área física, não filial**: saldo global por material é correto e intencional.
  Esta etapa **não** segrega saldo por almoxarifado — segrega por **dono**, que é outra coisa.
- Teste que passa de primeira exige **controle positivo** (regra da casa — já falhou 3x no
  projeto). Na Task 2 o controle positivo é **obrigatório e explícito**.
- Suítes: `cd server && npm run test:api` · `npm run test:almoxarifado` · `npm run test:validation`
  · `npm run test:safealter` · `npm run test:sqlite`; `cd client && CI=true npx react-scripts test
  --watchAll=false` e `CI=true npx react-scripts build` (CI=true faz warning virar erro).
- Um arquivo de teste só: `cd server && node tests/api/<arquivo>.api.test.js`.
- Exibição do cliente usa **`clientes.razao_social`** (é o que `clientMaterialService.listarMateriaisCliente`
  já usava e o que existe garantidamente na tabela).

## Mapa de arquivos

| Arquivo | Papel nesta etapa |
|---|---|
| `server/services/almoxarifado/schema.js` | `safeAlter` da coluna; `DEVOLUCAO_CLIENTE` em `TIPOS_MOVIMENTO`; `TIPOS_DEDICADOS`; comentário de aposentadoria em `materiais_cliente_almoxarifado` |
| `server/services/almoxarifado/ownerRules.js` | **novo** — guarda do dono (saída, emergencial, ajuste) |
| `server/services/almoxarifado/clienteEstoqueService.js` | **novo** — posição consolidada por cliente |
| `server/services/almoxarifado/stockService.js` | chama a guarda; `DEVOLUCAO_CLIENTE` em `tiposSaida` (2 lugares); `consultarEstoque` filtra dono |
| `server/services/almoxarifado/alertService.js` | 3 leituras: 2 filtram, 1 filtra por semântica de reposição |
| `server/services/almoxarifado/purchaseService.js` | reposição automática filtra dono |
| `server/services/almoxarifado/reportService.js` | relatórios de estoque próprio filtram dono |
| `server/services/almoxarifado/receiptService.js` | recebimento de material com dono exige documento |
| `server/services/almoxarifado/movementRules.js` | `DEVOLUCAO_CLIENTE` em `REGRAS_VINCULO` |
| `server/services/almoxarifado/permissions.js` | ação `ajustar_material_cliente` |
| `server/services/almoxarifado/schemas.js` | `proprietario_cliente_id` no `MaterialShape`; `TIPOS_MOVIMENTO_ROTA` exclui os dedicados; `DevolucaoClienteSchema` |
| `server/services/almoxarifado/clientMaterialService.js` | **removido** (Task 7) |
| `server/routes/almoxarifado.js` | dashboard/posição-estoque filtram dono; coluna no POST/PUT de material |
| `server/routes/almoxarifado/extended.js` | rotas da ilha removidas; rotas novas de materiais-cliente; devolução ao cliente |
| `server/tests/helpers/clienteInvariante.js` | **novo** — helper da invariante |
| `server/tests/api/materialCliente*.api.test.js` | 4 arquivos novos |
| `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` | seção "Propriedade" |
| `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` | selo de propriedade |
| `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` | selo de propriedade |
| `client/src/components/almoxarifado/ExtratoMaterialModal.js` | selo de propriedade |
| `client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js` | **novo** — tela |
| `client/src/utils/posicaoClientePdf.js` | **novo** — PDF de posição por cliente |
| `client/src/App.js`, `client/src/components/Layout.js` | rota + menu |
| specs/guia/novidades/plano | fechamento de documentação (Task 10) |

---

### Task 1: coluna `proprietario_cliente_id` + auditoria nomeada das leituras

> **Esta é a task de maior risco da etapa.** Não quebra nada — é pior: nada quebra e o número fica
> errado. Uma leitura esquecida faz a chapa do Cliente X contar como nossa em reposição de mínimo,
> sugestão de compra, relatório de posição, valor total do estoque no dashboard e seletor de
> requisição. Nenhum teste existente pega. Por isso a segregação **não** é "lembrar de filtrar":
> é a auditoria abaixo, uma leitura por vez, com a classificação escrita.

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (bloco de `safeAlter` de `materiais_almoxarifado`, junto de `tipo_material_id`/`ponto_pedido`, ~linha 629)
- Modify: `server/services/almoxarifado/alertService.js` (3 leituras)
- Modify: `server/services/almoxarifado/purchaseService.js` (1)
- Modify: `server/services/almoxarifado/reportService.js` (2)
- Modify: `server/services/almoxarifado/stockService.js` (2: contador do mapa, `consultarEstoque`)
- Modify: `server/routes/almoxarifado.js` (6: dashboard × 5, posição-estoque × 1)
- Test: `server/tests/api/materialClienteColuna.api.test.js`

**Interfaces:**
- Produces: coluna `materiais_almoxarifado.proprietario_cliente_id INTEGER` (NULL = nosso);
  `stockService.consultarEstoque(db, filters)` passa a aceitar
  `filters.proprietario_cliente_id` (número) e `filters.incluir_clientes` ('1') além dos filtros
  que já tinha.

#### A auditoria — as 19 leituras que a spec contou

`grep -rn "FROM materiais_almoxarifado" server/services/almoxarifado/*.js server/routes/almoxarifado/*.js`
devolve exatamente 19 linhas. Classificação de cada uma:

**Classe A — leitura de estoque PRÓPRIO → filtra `proprietario_cliente_id IS NULL`:**

| # | Local | O que lê | Por que filtra |
|---|---|---|---|
| 1 | `alertService.js:537` (`sincronizarEstadoAcimaMinimo`) | materiais que voltaram a ficar acima do mínimo | é máquina de estado de alerta de **reposição**; material de cliente não se repõe |
| 2 | `alertService.js:598` (`verificarAlertasEstoque`) | materiais abaixo do mínimo, para disparar e-mail/WhatsApp | avisar "acabando, compre mais" sobre chapa que não é nossa é o alerta errado para a pessoa errada |
| 4 | `purchaseService.js:4` (`verificarEstoqueMinimo`) | críticos → cria `solicitacoes_compra_almoxarifado` | **o pior dos casos**: o sistema abriria pedido de compra para repor material de terceiro |
| 5 | `reportService.js:7` (`relatorioEstoqueAtual`) | posição + `valor_total` de todo material ativo | somar patrimônio do cliente ao nosso |
| 6 | `reportService.js:11` (`relatorioAbaixoMinimo`) | abaixo do mínimo | mesma semântica de reposição da #2 |
| 14 | `stockService.js:440` (2º subselect do `MAPA_LOCALIZACOES_SQL`) | contadores `itens_baixo_minimo` / `itens_criticos` por localização | são contadores de **reposição**, não de ocupação física |
| 17 | `stockService.js:1692` (`consultarEstoque`) | `GET /api/almoxarifado/estoque` — a consulta genérica de estoque | é a leitura de "o que temos"; ganha opt-in explícito (ver implementação) |

**Classe B — leitura de UM material específico por id → NÃO filtra** (quem pediu aquele material
quer aquele material, seja de quem for; filtrar aqui quebraria o motor para material de cliente,
que é justamente o ponto da etapa):

| # | Local | O que lê |
|---|---|---|
| 3 | `alertService.js:609` (`verificarAlertaPorMaterialId`) | **exceção declarada — veja abaixo** |
| 8 | `requisitionCreateService.js:105` | valida que os ids da requisição existem e estão ativos |
| 9 | `requisitionService.js:122` | saldo disponível de UM item de requisição |
| 10 | `sectorMaterialService.js:313` | valida ids permitidos para o setor |
| 11 | `stockAvailabilityService.js:91` (`checkDisponibilidadeBatch`) | disponibilidade de uma lista de ids conhecidos |
| 12 | `stockService.js:16` (`getMaterial`) | o material da movimentação — **filtrar aqui inutilizaria o motor inteiro para material de cliente** |
| 15 | `stockService.js:939` | relê `quantidade_atual` depois do AJUSTE |
| 16 | `stockService.js:1425` | relê `quantidade_atual` no cancelamento |
| 18 | `routes/almoxarifado/extended.js:397` | extrato do item (`GET /materiais/:id/extrato`) — ganha o **selo** na Task 9, não filtro |

> **Exceção declarada, #3 (`alertService.js:609`).** É leitura por id (classe B pela forma), mas o
> consumidor é o alerta de reposição (classe A pela semântica) — é chamada depois de editar
> material, em `routes/almoxarifado.js` (~linha 573). **Decisão: filtra**, acrescentando
> `AND proprietario_cliente_id IS NULL` ao `WHERE id = ?`; a função devolve `null` e nenhum alerta
> sai. Está escrito aqui porque é o único caso onde forma e semântica discordam, e alguém que
> reveja o código por grep vai estranhar um `IS NULL` numa busca por id.

**Classe C — leitura operacional de conjunto onde MISTURAR é o comportamento correto → NÃO filtra,
mas passa a expor o dono** (a chapa do cliente ocupa prateleira de verdade, é bloqueada de
verdade, precisa de endereço de verdade):

| # | Local | O que lê | Por que não filtra |
|---|---|---|---|
| 7 | `reportService.js:46` (`relatorioMateriaisBloqueados`) | tudo com `quantidade_bloqueada > 0` | é relatório de **qualidade**; material do cliente bloqueado é exatamente o que o almoxarife precisa ver |
| 13 | `stockService.js:413` (1º subselect do `MAPA_LOCALIZACOES_SQL`) | soma física por localização | o material do cliente **está** naquela prateleira; escondê-lo faria o mapa mentir sobre ocupação |
| 19 | `routes/almoxarifado/extended.js:721` (relatório `materiais-sem-endereco`) | ativos sem endereço | endereçar material do cliente é tão necessário quanto endereçar o nosso |

> **Classe C é um desvio consciente da classificação binária da spec** (que previa só A e B). Sem
> ela, três leituras teriam de ser forçadas para A ou B e ficariam erradas nos dois casos. Está
> registrada aqui, e volta na Task 10 como correção declarada da spec de design.

#### As leituras que a contagem de 19 NÃO cobriu — e por que importam mais que várias das 19

A spec contou `services/almoxarifado/*.js` + `routes/almoxarifado/*.js` (**subdiretório**). Ficou de
fora `server/routes/almoxarifado.js` — o arquivo de rotas v1, que não está no subdiretório e onde
moram o **dashboard** e o **relatório de posição de estoque**. `grep -n "FROM materiais_almoxarifado"
server/routes/almoxarifado.js` devolve mais 16 ocorrências. As que mudam de comportamento nesta
task:

| Local | O que lê | Classe |
|---|---|---|
| `routes/almoxarifado.js:217` | `totalMateriais` do dashboard | **A — filtra** |
| `routes/almoxarifado.js:221` | `materiaisCriticos` do dashboard | **A — filtra** |
| `routes/almoxarifado.js:225` | `materiaisZerados` do dashboard | **A — filtra** |
| `routes/almoxarifado.js:229` | `valorTotalEstoque` (`SUM(quantidade_atual * custo_unitario)`) | **A — filtra.** Sem isso o sistema contabiliza patrimônio de terceiro como nosso |
| `routes/almoxarifado.js:239` | `listaMateriaisCriticos` (top 10 do dashboard) | **A — filtra** |
| `routes/almoxarifado.js:993` | `GET /relatorio/posicao-estoque` (`valor_total`) | **A — filtra.** É literalmente o que o teste `posicao de estoque proprio exclui material de cliente` nomeia — e não estava na contagem de 19 |

As outras 10 de `routes/almoxarifado.js` **não mudam**, e a razão de cada uma está aqui para quem
auditar depois não achar que foram esquecidas: `:173` (lista da tela de Materiais) e `:1450`
(itens da família) são **classe C** — misturam de propósito e ganham o selo na Task 9; `:275`,
`:449`, `:567` são leituras por id (classe B); `:676` e `:696` geram o próximo código sequencial e
não têm nada a ver com propriedade; `:1420`, `:1437` e `:1572` contam itens por família (classe C).

> **Pendência declarada, fora do escopo desta etapa:** `routes/almoxarifado.js:851` insere **todos**
> os materiais ativos numa conferência de inventário (classe C — a contagem física inclui o
> material do cliente, que está lá), mas o caminho `aplicar_ajustes` (~linha 941) faz
> `UPDATE materiais_almoxarifado SET quantidade_atual = ?` **direto, fora do motor** — logo, fora
> da permissão `ajustar_material_cliente` da Task 4. Fechar isso significa reescrever a aplicação
> de ajustes da conferência para passar pelo motor, que é uma etapa própria. **Registrar como
> pendência na spec 13 e no guia (Task 10), não corrigir aqui.**

#### Correções à própria auditoria, feitas ao EXECUTAR a Task 1 (2026-08-12)

A auditoria acima estava certa na classificação e **errada em duas contagens**. Registrado aqui em
vez de corrigido em silêncio, porque a Task 2 percorre esta mesma lista e o próximo leitor precisa
saber que os números originais não fecham.

1. **O grep do subdiretório devolve 21 linhas, não 19.** Faltavam na tabela
   `returnService.js:57` (`SELECT id, codigo, controle_lote, controle_serie ... WHERE id = ?`) e
   `returnService.js:292` (`listarSaidasElegiveis`). **Ambas classe B** — leitura por id, não
   filtram, nenhuma mudança de código. Provavelmente entraram com a Etapa 7, depois de a spec ter
   contado.
2. **`routes/almoxarifado.js` tem 19 ocorrências, não 16.** A enumeração acima cobre 17 (6 que
   mudam + 10 declaradas inalteradas + a pendência da conferência). Faltavam duas, **as duas
   classe B**, sem mudança: `:473` (`SELECT *` do material no PUT, para o diff de edição) e
   `:603` (`SELECT foto`, para apagar a foto antiga no upload).
3. **Total real auditado: 40 leituras** (21 + 19), todas classificadas. Nenhuma leitura de classe A
   ficou de fora — as 4 achadas a mais são todas classe B.

**Duas armadilhas de fixture que o plano não previu** (as duas custaram falha de suíte se
ignoradas, e a Task 2 esbarraria nas mesmas):

- **`clientes` não existe no harness.** `tests/helpers/testApp.js` monta o banco só com o
  `initSchema` do almoxarifado, e `clientes` é tabela **core** (criada por `server/index.js` no
  boot) — o próprio código do módulo já documentava isso em `extended.js`, na rota
  `aux/ordens-servico`, com um fallback para `no such table: clientes`. Como o `consultarEstoque`
  desta task passa a fazer `LEFT JOIN clientes`, **todo** teste que bate em `GET /estoque`
  quebraria por um erro que não existe em produção. Corrigido no harness (stub mínimo com
  `razao_social`), não com fallback na query — a Task 2 depende disso para `INSERT INTO clientes`.
- **`tests/almoxarifado.test.js` monta `materiais_almoxarifado` à mão**, sem `initSchema`. A coluna
  nova precisou ser declarada lá também, senão `purchaseService`/`reportService`/`alertService`
  estouram com `no such column: proprietario_cliente_id` na suíte `test:almoxarifado`.

**Sonda executada** (script temporário, apagado depois): material de cliente e material próprio
equivalentes lado a lado, 22 verificações — 15 de classe A (todas com controle positivo: o próprio
aparece), 3 de classe B e 4 de classe C. `22/22 OK`. Sabotada em seguida nos dois pontos mais
perigosos: remover o filtro do `purchaseService` (a sonda acusou `material_ids=1,2` — pedido de
compra para material de terceiro) e trocar o do `valorTotalEstoque` por `= NULL` (a sonda acusou
`total=0`, ou seja, **a metade do controle positivo é que pegou** — a checagem de exclusão sozinha
teria aprovado a leitura zerada). A Task 2 transforma essa sonda em teste versionado.

- [x] **Step 1: `safeAlter` da coluna**

Em `server/services/almoxarifado/schema.js`, logo depois das três linhas de `safeAlter` de
`materiais_almoxarifado` que já existem (`tipo_material_id`, `ponto_pedido`,
`prazo_reposicao_dias`, ~linha 629-631):

```js
  // Etapa 8: proprietario_cliente_id — o dono do material mora na linha do MATERIAL, nao na
  // linha de saldo. NULL = material nosso; preenchido = material de cliente.
  //
  // Por que na linha do material e nao no saldo: o disponivel deriva de
  // materiais_almoxarifado.quantidade_atual, um escalar POR MATERIAL
  // (stockService.getSaldoDisponivel). Repartir propriedade dentro do saldo faria esse escalar
  // misturar donos, e toda guarda de "saldo insuficiente" viraria cirurgia no nucleo do motor.
  // Razao semantica, igualmente forte: a chapa do Cliente X tem certificado e corrida proprios e
  // NAO pode ser trocada pela do Cliente Y — duas linhas de catalogo e o modelo correto.
  // Custo aceito: o catalogo ganha uma linha por cliente do mesmo item fisico.
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN proprietario_cliente_id INTEGER REFERENCES clientes(id)');
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_materiais_almox_proprietario
    ON materiais_almoxarifado (proprietario_cliente_id)`);
```

- [x] **Step 2: teste que falha — `materialClienteColuna.api.test.js`**

Cria `server/tests/api/materialClienteColuna.api.test.js`:

```js
/**
 * Etapa 8, Task 1: a coluna proprietario_cliente_id existe, aceita NULL (material nosso) e
 * numero (material de cliente), e o indice foi criado. Teste de fundacao — as leituras
 * auditadas sao cobertas pelo materialClienteSegregacao.api.test.js (Task 2).
 *
 * Executar: cd server && node tests/api/materialClienteColuna.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 0, proprietario_cliente_id = null, minima = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, ?, 10, 1, ?)`,
  [`T8-COL-${seq}`, `Material T8 ${seq}`, qtd, minima, proprietario_cliente_id]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('a coluna proprietario_cliente_id existe em materiais_almoxarifado', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(materiais_almoxarifado)');
    const col = cols.find((c) => c.name === 'proprietario_cliente_id');
    assert.ok(col, 'coluna proprietario_cliente_id ausente');
    assert.strictEqual(col.type, 'INTEGER');
  });

  await test('material sem dono nasce com proprietario_cliente_id NULL', async () => {
    const id = await novoMaterial(db, { qtd: 5 });
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.proprietario_cliente_id, null);
  });

  await test('material com dono guarda o cliente_id', async () => {
    const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA']);
    const id = await novoMaterial(db, { qtd: 5, proprietario_cliente_id: cli.lastID });
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.proprietario_cliente_id, cli.lastID);
  });

  await test('o indice idx_materiais_almox_proprietario existe', async () => {
    const idx = await dbAll(db, 'PRAGMA index_list(materiais_almoxarifado)');
    assert.ok(idx.some((i) => i.name === 'idx_materiais_almox_proprietario'), 'indice ausente');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 3: rodar e ver falhar**

Run: `cd server && node tests/api/materialClienteColuna.api.test.js`
Expected: FAIL — `coluna proprietario_cliente_id ausente` e o INSERT com a coluna estoura
`SQLITE_ERROR: table materiais_almoxarifado has no column named proprietario_cliente_id`.

- [x] **Step 4: rodar e ver passar (só o Step 1 já resolve este arquivo)**

Run: `cd server && node tests/api/materialClienteColuna.api.test.js`
Expected: `4 passed, 0 failed`.

- [x] **Step 5: aplicar a classe A em `alertService.js` (3 leituras)**

`sincronizarEstadoAcimaMinimo` (~linha 537) — o subselect ganha o filtro:

```js
      SELECT m.id FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.quantidade_minima > 0 AND m.quantidade_atual > m.quantidade_minima
        -- Etapa 8: alerta de estoque e maquina de REPOSICAO. Material de cliente
        -- (proprietario_cliente_id NOT NULL) nao se repoe: quem manda mais chapa e o dono dela.
        AND m.proprietario_cliente_id IS NULL
```

`verificarAlertasEstoque` (~linha 598):

```js
  const materiais = await dbAll(db, `SELECT id, codigo, nome, localizacao, unidade, quantidade_atual, quantidade_minima
    FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_minima > 0 AND quantidade_atual <= quantidade_minima
      -- Etapa 8: ver a nota em sincronizarEstadoAcimaMinimo. Disparar "acabando, compre mais"
      -- sobre material de terceiro manda o alerta errado para a pessoa errada.
      AND proprietario_cliente_id IS NULL`);
```

`verificarAlertaPorMaterialId` (~linha 609) — **a exceção declarada da auditoria**:

```js
async function verificarAlertaPorMaterialId(db, materialId, opts = {}) {
  // Etapa 8, excecao declarada da auditoria da Task 1: pela FORMA esta e uma leitura por id
  // (classe B, nao filtraria). Pela SEMANTICA e alerta de reposicao (classe A). Quem manda
  // aqui e a semantica: chamada depois de editar material (routes/almoxarifado.js), ela existe
  // so para disparar o alerta de minimo. Material de cliente devolve null e nenhum alerta sai.
  const material = await dbGet(db, `SELECT id, codigo, nome, localizacao, unidade, quantidade_atual, quantidade_minima
    FROM materiais_almoxarifado WHERE id = ? AND proprietario_cliente_id IS NULL`, [materialId]);
  if (!material) return null;
  return processarAlertaMaterial(db, material, opts);
}
```

- [x] **Step 6: aplicar a classe A em `purchaseService.js` e `reportService.js`**

`purchaseService.js` (~linha 4):

```js
  const criticos = await dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      -- Etapa 8: sem este filtro o sistema abriria solicitacao de COMPRA para repor material
      -- que nao e nosso. E o pior caso da falha silenciosa que a auditoria da Task 1 caca.
      AND proprietario_cliente_id IS NULL`);
```

`reportService.js` — `relatorioEstoqueAtual` (~linha 7) e `relatorioAbaixoMinimo` (~linha 11):

```js
async function relatorioEstoqueAtual(db) {
  // Etapa 8: relatorio de posicao do estoque PROPRIO. valor_total somando material de cliente
  // contabilizaria patrimonio de terceiro como nosso. A posicao POR CLIENTE tem tela e rota
  // proprias (clienteEstoqueService, Task 8).
  return dbAll(db, `SELECT m.*,
    (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_total
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    ORDER BY m.categoria, m.nome`);
}

async function relatorioAbaixoMinimo(db) {
  // Etapa 8: mesma semantica de reposicao do alertService — material de cliente nao se repoe.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      AND proprietario_cliente_id IS NULL
    ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0))`);
}
```

`relatorioMateriaisBloqueados` (~linha 46) **fica como está** — classe C. Acrescentar só o
comentário, para que a ausência de filtro seja legível como decisão:

```js
async function relatorioMateriaisBloqueados(db) {
  // Etapa 8, classe C da auditoria: NAO filtra o dono de proposito. E relatorio de QUALIDADE —
  // material de cliente bloqueado e exatamente o que o almoxarife precisa ver. O selo de
  // propriedade (Task 9) e o que evita a confusao, nao o filtro.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND COALESCE(quantidade_bloqueada,0) > 0 ORDER BY nome`);
}
```

- [x] **Step 7: aplicar a classe A em `stockService.js` (contador do mapa + `consultarEstoque`)**

No `MAPA_LOCALIZACOES_SQL`, **segundo** subselect (o de `itens_baixo_minimo`/`itens_criticos`,
~linha 440) — a última linha do `FROM materiais_almoxarifado m` daquele bloco:

```js
      FROM materiais_almoxarifado m
      WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NOT NULL
        -- Etapa 8, Task 1: este subselect conta REPOSICAO (abaixo do minimo / critico), nao
        -- ocupacao fisica. O subselect de cima (soma de quantidade por localizacao) NAO filtra
        -- o dono de proposito — a chapa do cliente ocupa a prateleira de verdade. Os dois blocos
        -- discordam porque medem coisas diferentes; nao "uniformizar".
        AND m.proprietario_cliente_id IS NULL
```

`consultarEstoque` (~linha 1688) — a leitura genérica de estoque, com opt-in explícito:

```js
async function consultarEstoque(db, filters = {}) {
  let sql = `SELECT m.*, c.nome as categoria_nome, cli.razao_social as proprietario_cliente_nome,
    (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_estoque
    FROM materiais_almoxarifado m
    LEFT JOIN categorias_material_almoxarifado c ON m.categoria_id = c.id
    LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
    WHERE m.ativo = 1`;
  const params = [];
  // ── Etapa 8, Task 1 (classe A com opt-in) ────────────────────────────────────────────────
  // Default = estoque PROPRIO. Quem quiser material de cliente pede explicitamente:
  //   proprietario_cliente_id=N -> so daquele cliente (tela de Materiais de Clientes, Task 8)
  //   incluir_clientes=1        -> tudo junto (a tela que mistura mostra o selo, Task 9)
  //   material_id=N             -> leitura de UM material (classe B): nao filtra o dono, senao
  //                                consultar o extrato de material de cliente devolveria vazio.
  if (filters.proprietario_cliente_id) {
    sql += ' AND m.proprietario_cliente_id = ?';
    params.push(Number(filters.proprietario_cliente_id));
  } else if (!filters.material_id && String(filters.incluir_clientes) !== '1') {
    sql += ' AND m.proprietario_cliente_id IS NULL';
  }
  if (filters.categoria_id) { sql += ' AND m.categoria_id = ?'; params.push(filters.categoria_id); }
  if (filters.below_minimum) { sql += ' AND m.quantidade_atual <= m.quantidade_minima AND m.quantidade_minima > 0'; }
  if (filters.material_id) { sql += ' AND m.id = ?'; params.push(filters.material_id); }
  sql += ' ORDER BY m.nome';
  return dbAll(db, sql, params);
}
```

- [x] **Step 8: aplicar a classe A no `routes/almoxarifado.js` (dashboard × 5 + posição-estoque)**

As cinco queries do dashboard (~linhas 217-241). Substituir cada `WHERE ativo = 1` por
`WHERE ativo = 1 AND proprietario_cliente_id IS NULL`, com um comentário acima do bloco inteiro:

```js
    // ── Etapa 8, Task 1 ──────────────────────────────────────────────────────────────────
    // Todas as cinco leituras deste dashboard sao de estoque PROPRIO (classe A da auditoria).
    // valorTotalEstoque e a mais grave: sem o filtro, SUM(quantidade_atual * custo_unitario)
    // contabiliza o patrimonio do cliente como nosso. Estas cinco NAO estavam na contagem de 19
    // da spec de design (que varreu routes/almoxarifado/ — o subdiretorio — e nao este arquivo).
    db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL`, [], (err, row) => {
```

```js
      db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0`, [], (err2, row2) => {
```

```js
        db.get(`SELECT COUNT(*) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL AND quantidade_atual = 0`, [], (err3, row3) => {
```

```js
          db.get(`SELECT COALESCE(SUM(quantidade_atual * custo_unitario), 0) as total FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL`, [], (err4, row4) => {
```

```js
              db.all(`SELECT id, codigo, nome, quantidade_atual, quantidade_minima, unidade, categoria
                      FROM materiais_almoxarifado
                      WHERE ativo = 1 AND proprietario_cliente_id IS NULL
                        AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
                      ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0)) ASC LIMIT 10`, [], (err6, criticos) => {
```

`GET /api/almoxarifado/relatorio/posicao-estoque` (~linha 991):

```js
  app.get('/api/almoxarifado/relatorio/posicao-estoque',(req, res) => {
    // Etapa 8, Task 1: esta e a rota que o teste `posicao de estoque proprio exclui material de
    // cliente` (spec 13) nomeia — e tambem nao estava na contagem de 19 da spec de design.
    db.all(`SELECT *, (quantidade_atual * custo_unitario) as valor_total
            FROM materiais_almoxarifado
            WHERE ativo = 1 AND proprietario_cliente_id IS NULL
            ORDER BY categoria, nome`, [], (err, rows) => {
```

- [x] **Step 9: rodar a suíte inteira (regressão)**

Run: `cd server && npm run test:api && npm run test:almoxarifado && npm run test:safealter`
Expected: PASS em tudo. Se algum teste existente quebrar aqui, é porque ele criava material
esperando vê-lo numa leitura de classe A — leia o teste antes de mudá-lo: material criado por
INSERT direto sem a coluna nasce com `proprietario_cliente_id NULL` e **deve** continuar
aparecendo. Se não aparecer, o filtro foi escrito errado (ex.: `= NULL` em vez de `IS NULL`, que
nunca casa).

- [x] **Step 10: commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/alertService.js server/services/almoxarifado/purchaseService.js server/services/almoxarifado/reportService.js server/services/almoxarifado/stockService.js server/routes/almoxarifado.js server/tests/api/materialClienteColuna.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: coluna proprietario_cliente_id e auditoria das leituras de estoque proprio

Material de cliente vivia numa ilha (materiais_cliente_almoxarifado) fora do motor: sem lote,
serie, endereco, extrato nem livro de movimentacoes — justamente o que industrializar material de
terceiro exige. A decisao 2 do design unifica: material de cliente vira material normal com dono,
numa coluna nova em materiais_almoxarifado. NULL = nosso.

O dono mora na linha do MATERIAL, nao na de saldo (decisao 3): o disponivel deriva de
quantidade_atual, um escalar por material, e repartir propriedade no saldo faria toda guarda de
"saldo insuficiente" virar cirurgia no nucleo do motor. Descartado tambem porque a chapa do
Cliente X tem certificado e corrida proprios e nao pode ser trocada pela do Cliente Y.

O risco desta mudanca nao e quebrar: e nao quebrar e o numero ficar errado. Por isso a auditoria
nomeada de cada leitura da tabela, classificada em (A) estoque proprio, que filtra; (B) leitura de
um material por id, que nao filtra; e (C) leitura operacional onde misturar e correto, que nao
filtra mas expoe o dono. A classificacao esta escrita no plano da etapa, nao como comentario solto.

Achado da auditoria: a contagem de 19 queries do design varreu routes/almoxarifado/ (o
subdiretorio) e deixou de fora routes/almoxarifado.js, onde moram o dashboard e o relatorio de
posicao de estoque — inclusive o SUM(quantidade_atual * custo_unitario) que contabilizaria
patrimonio de terceiro como nosso, e a rota que o teste "posicao de estoque proprio exclui material
de cliente" nomeia. Mais seis leituras filtradas por causa disso.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: helper de invariante + teste que percorre as leituras auditadas

**Files:**
- Create: `server/tests/helpers/clienteInvariante.js`
- Test: `server/tests/api/materialClienteSegregacao.api.test.js`

**Interfaces:**
- Consumes: coluna e filtros da Task 1; `stockService.consultarEstoque`,
  `reportService.relatorioEstoqueAtual`/`relatorioAbaixoMinimo`,
  `purchaseService.verificarEstoqueMinimo`, `alertService.verificarAlertasEstoque`.
- Produces: `assertSegregado(rows, { materialClienteId, materialProprioId, contexto })` —
  a asserção dupla (exclusão **e** controle positivo) usada em toda leitura de classe A.

#### Correções feitas ao EXECUTAR a Task 2 (2026-08-12, commit `faf20e7`)

Registrado aqui em vez de corrigido em silêncio — duas destas mudam o que o plano mandava fazer.

1. **A ordem das asserções do dashboard estava errada no plano, e a sabotagem 2 é que mostrou.**
   Como escrito abaixo, o `strictEqual` do `valorTotalEstoque` roda **antes** do controle
   positivo. Com o filtro sabotado para `= NULL`, o total vai a zero e as duas asserções falham —
   mas quem fala primeiro é a da igualdade, com a mensagem `valorTotalEstoque contabilizou
   patrimonio de cliente como nosso`. **Diagnóstico invertido:** a leitura não contabilizou nada,
   ela zerou; quem fosse consertar procuraria o bug oposto. O teste commitado põe o **controle
   positivo primeiro**. Verificado com as duas sabotagens do mesmo ponto: `= NULL` → "os numeros
   do dashboard zeraram"; filtro removido de vez → "contabilizou patrimonio de cliente como nosso".
   O plano previa a segunda mensagem para a primeira sabotagem — não era o que acontecia.
2. **O plano diz `11 passed`; o teste dele tem 10 casos.** O arquivo commitado tem **14**: os 10
   do plano, mais `a fixture e valida` (usa o `assertDono`, que o plano criava e nunca chamava),
   `incluir_clientes=1` (o terceiro ramo do `consultarEstoque` da Task 1 não tinha teste nenhum) e
   mais duas de classe C — ver o item 3.
3. **Classe C ganhou duas leituras além do relatório de bloqueados**, porque o risco simétrico
   (alguém "consertar" filtrando) vale para as três da auditoria: `materiais-sem-endereco` e o
   **par discordante do `MAPA_LOCALIZACOES_SQL`** — a soma de ocupação física inclui a chapa do
   cliente e o contador de reposição no **mesmo SQL** a exclui. Esse é o ponto mais fácil de
   "uniformizar" por engano, e agora um único teste prende os dois lados.
4. **Quatro sabotagens executadas, não três.** As três do plano, mais o filtro do
   `materiais-sem-endereco` (a classe C nova). Todas falharam com a mensagem certa e foram
   restauradas byte a byte (`git diff` vazio).
   **A do `MAPA_LOCALIZACOES_SQL` não foi executada**: `stockService.js` estava sendo editado em
   paralelo pela Task 3 e sabotar arquivo em voo destruiria o trabalho do outro. Fica como
   **verificação pendente** — quem tocar naquele SQL depois deve rodar as duas sabotagens do par
   (filtrar o 1º subselect → `qtd_itens`/`quantidade_total` caem para 1/100; tirar o filtro do 2º
   → `itens_baixo_minimo` sobe para 2).

- [x] **Step 1: escrever o helper**

`server/tests/helpers/clienteInvariante.js` — molde exato de `serieInvariante.js` (arquivo curto,
`assert`, docstring dizendo qual invariante defende, um `module.exports`):

```js
const assert = require('assert');
const { dbGet } = require('../../services/almoxarifado/db');

/**
 * A invariante da Etapa 8: nenhuma leitura de estoque PROPRIO enxerga material de cliente.
 *
 * A falha que este helper caca e silenciosa — nada quebra, o numero so fica errado (reposicao
 * de minimo, sugestao de compra, valor total do estoque, posicao). Por isso as duas asserces
 * andam SEMPRE juntas: so provar a ausencia do material de cliente deixaria passar um filtro
 * escrito errado que nao devolve NADA (ex.: `= NULL` em vez de `IS NULL`, que nunca casa) —
 * ele "segregaria" perfeitamente por estar vazio. O controle positivo e o que separa
 * "filtrou certo" de "quebrou tudo".
 *
 * `rows` e o array devolvido pela leitura; `idOf` extrai o id do material de cada linha
 * (default `r.id`, mas relatorios agregados podem usar `material_id`).
 */
function assertSegregado(rows, { materialClienteId, materialProprioId, contexto, idOf = (r) => r.id }) {
  const ids = (rows || []).map(idOf).map(Number);
  assert.ok(!ids.includes(Number(materialClienteId)),
    `[${contexto}] material de cliente (id ${materialClienteId}) vazou para leitura de estoque proprio`);
  assert.ok(ids.includes(Number(materialProprioId)),
    `[${contexto}] CONTROLE POSITIVO FALHOU: o material proprio equivalente (id ${materialProprioId}) `
    + 'tambem sumiu — o filtro nao esta segregando, esta zerando a leitura');
}

/** Material de cliente tem dono; material nosso tem NULL. Guarda contra "0 = nosso". */
async function assertDono(db, materialId, clienteIdEsperado) {
  const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  assert.strictEqual(m.proprietario_cliente_id, clienteIdEsperado,
    `dono errado no material ${materialId}: esperado ${clienteIdEsperado}, veio ${m.proprietario_cliente_id}`);
}

module.exports = { assertSegregado, assertDono };
```

- [x] **Step 2: escrever o teste que falha — `materialClienteSegregacao.api.test.js`**

```js
/**
 * Etapa 8, Task 2 — a INVARIANTE da etapa (decisao 3 do design).
 *
 * Um material de cliente e um material proprio EQUIVALENTES (mesma quantidade, mesmo minimo,
 * mesmo custo) sao criados lado a lado. Toda leitura de estoque proprio auditada na Task 1 tem
 * de mostrar o proprio e esconder o do cliente. As duas metades sao obrigatorias: sem o
 * controle positivo, um filtro escrito errado que nao devolve nada passaria como se estivesse
 * segregando.
 *
 * Executar: cd server && node tests/api/materialClienteSegregacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { assertSegregado } = require('../helpers/clienteInvariante');
const stockService = require('../../services/almoxarifado/stockService');
const reportService = require('../../services/almoxarifado/reportService');
const purchaseService = require('../../services/almoxarifado/purchaseService');
const alertService = require('../../services/almoxarifado/alertService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, minima = 200, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, categoria, quantidade_atual, quantidade_minima, quantidade_maxima,
     custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', 'Chapas', ?, ?, 500, 25, 1, ?)`,
  [`T8-SEG-${seq}`, `Chapa 3mm ${seq}`, qtd, minima, proprietario_cliente_id]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA']);
  const clienteId = cli.lastID;

  // Os dois lados da invariante: equivalentes em TUDO menos o dono. Ambos abaixo do minimo
  // (100 < 200) de proposito — e o que faz os dois entrarem nas leituras de reposicao.
  const matProprio = await novoMaterial(db);
  const matCliente = await novoMaterial(db, { proprietario_cliente_id: clienteId });

  await test('posicao de estoque proprio exclui material de cliente [GET /relatorio/posicao-estoque]', async () => {
    const res = await request(app).get('/api/almoxarifado/relatorio/posicao-estoque');
    assert.strictEqual(res.status, 200);
    assertSegregado(res.body, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'relatorio/posicao-estoque' });
  });

  await test('dashboard nao conta material de cliente em nenhum dos cinco numeros', async () => {
    const res = await request(app).get('/api/almoxarifado/dashboard');
    assert.strictEqual(res.status, 200);
    // Controle positivo dos escalares: o proprio esta na lista de criticos, o do cliente nao.
    assertSegregado(res.body.listaMateriaisCriticos,
      { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'dashboard/listaMateriaisCriticos' });
    // valorTotalEstoque: o material do cliente vale 100 * 25 = 2500. Provar que esse valor NAO
    // esta no total — comparando com o total recalculado so do que e nosso.
    const soNosso = await dbGet(db, `SELECT COALESCE(SUM(quantidade_atual * custo_unitario), 0) as total
      FROM materiais_almoxarifado WHERE ativo = 1 AND proprietario_cliente_id IS NULL`);
    assert.strictEqual(Math.round(res.body.valorTotalEstoque), Math.round(soNosso.total),
      'valorTotalEstoque contabilizou patrimonio de cliente como nosso');
    assert.ok(res.body.valorTotalEstoque > 0, 'CONTROLE POSITIVO: o total zerou — o filtro apagou tudo');
  });

  await test('GET /almoxarifado/estoque exclui material de cliente por default', async () => {
    const res = await request(app).get('/api/almoxarifado/estoque');
    assert.strictEqual(res.status, 200);
    assertSegregado(res.body, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'GET /estoque' });
  });

  await test('GET /almoxarifado/estoque?proprietario_cliente_id=N traz SO os do cliente', async () => {
    const res = await request(app).get(`/api/almoxarifado/estoque?proprietario_cliente_id=${clienteId}`);
    assert.strictEqual(res.status, 200);
    const ids = res.body.map((r) => r.id);
    assert.ok(ids.includes(matCliente), 'o opt-in por cliente nao trouxe o material do cliente');
    assert.ok(!ids.includes(matProprio), 'o opt-in por cliente trouxe material proprio junto');
    assert.strictEqual(res.body.find((r) => r.id === matCliente).proprietario_cliente_nome, 'Cliente Alfa LTDA');
  });

  await test('GET /almoxarifado/estoque?material_id=N (leitura por id) enxerga material de cliente', async () => {
    // Classe B da auditoria: quem pede AQUELE material quer aquele material. Se esta leitura
    // filtrasse, o extrato de material de cliente devolveria vazio.
    const res = await request(app).get(`/api/almoxarifado/estoque?material_id=${matCliente}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, matCliente);
  });

  await test('relatorioEstoqueAtual e relatorioAbaixoMinimo excluem material de cliente', async () => {
    const atual = await reportService.relatorioEstoqueAtual(db);
    assertSegregado(atual, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'relatorioEstoqueAtual' });
    const abaixo = await reportService.relatorioAbaixoMinimo(db);
    assertSegregado(abaixo, { materialClienteId: matCliente, materialProprioId: matProprio, contexto: 'relatorioAbaixoMinimo' });
  });

  await test('reposicao automatica nao abre solicitacao de compra para material de cliente', async () => {
    const criadas = await purchaseService.verificarEstoqueMinimo(db);
    const ids = criadas.map((c) => c.material_id);
    assert.ok(!ids.includes(matCliente), 'o sistema abriu pedido de compra para repor material de terceiro');
    assert.ok(ids.includes(matProprio), 'CONTROLE POSITIVO FALHOU: nem o material proprio gerou solicitacao');
    const doCliente = await dbGet(db,
      'SELECT id FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [matCliente]);
    assert.strictEqual(doCliente, undefined, 'sobrou solicitacao de compra de material de cliente na tabela');
  });

  await test('alerta de estoque minimo nao dispara para material de cliente', async () => {
    const resultados = await alertService.verificarAlertasEstoque(db, { teste: true });
    const ids = resultados.map((r) => r.material_id ?? r.material?.id).filter(Boolean);
    assert.ok(!ids.includes(matCliente), 'alerta de reposicao disparou para material de terceiro');
    assert.ok(ids.includes(matProprio), 'CONTROLE POSITIVO FALHOU: nem o material proprio alertou');
    // A excecao declarada da auditoria (leitura por id com semantica de reposicao):
    assert.strictEqual(await alertService.verificarAlertaPorMaterialId(db, matCliente, { teste: true }), null);
    assert.ok(await alertService.verificarAlertaPorMaterialId(db, matProprio, { teste: true }),
      'CONTROLE POSITIVO FALHOU: o material proprio tambem devolveu null');
  });

  await test('classe C: relatorio de materiais bloqueados MOSTRA material de cliente (de proposito)', async () => {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 10 WHERE id IN (?, ?)', [matProprio, matCliente]);
    const rows = await reportService.relatorioMateriaisBloqueados(db);
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(matCliente), 'material de cliente bloqueado sumiu do relatorio de qualidade');
    assert.ok(ids.includes(matProprio));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 0 WHERE id IN (?, ?)', [matProprio, matCliente]);
  });

  await test('material de cliente aceita lote e serie como qualquer outro (o ganho da unificacao)', async () => {
    const lotService = require('../../services/almoxarifado/lotService');
    const seriesService = require('../../services/almoxarifado/seriesService');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1, controle_serie = 1 WHERE id = ?', [matCliente]);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: matCliente, codigo: 'L-CLI-1', corrida: 'COR-CLI' });
    assert.ok(lote.id, 'material de cliente nao aceitou lote');
    const afetadas = await seriesService.entradaSeries(db, ADMIN, {
      material_id: matCliente, numeros: ['SN-CLI-1'], lote_id: lote.id,
    });
    assert.strictEqual(afetadas.length, 1);
    const s = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [matCliente, 'SN-CLI-1']);
    assert.strictEqual(s.status, 'EM_ESTOQUE');
    assert.strictEqual(s.lote_id, lote.id);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0, controle_serie = 0 WHERE id = ?', [matCliente]);
    await dbRun(db, 'DELETE FROM series_almoxarifado WHERE material_id = ?', [matCliente]);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 3: rodar e ver falhar ANTES de confiar**

Run: `cd server && node tests/api/materialClienteSegregacao.api.test.js`
Executado: falhou antes do helper existir (`Cannot find module '../helpers/clienteInvariante'`,
exit 1, zero casos rodados) e, com o helper no lugar, **passa de primeira** — porque a Task 1 já
implementou os filtros. **É exatamente o caso
que a regra da casa manda desconfiar.** Não siga adiante sem o Step 4.

- [x] **Step 4: controle positivo do próprio teste — provar que ele sabe falhar**

Faça as três sabotagens abaixo, uma de cada vez, rodando o arquivo e **restaurando** depois:

1. Em `purchaseService.js`, remover `AND proprietario_cliente_id IS NULL`.
   Esperado: `✗ reposicao automatica nao abre solicitacao de compra... o sistema abriu pedido de
   compra para repor material de terceiro`.
2. Em `routes/almoxarifado.js`, trocar o filtro do `valorTotalEstoque` por
   `AND proprietario_cliente_id = NULL` (a forma **errada** — `= NULL` nunca casa em SQL).
   Esperado: `✗ dashboard... CONTROLE POSITIVO: o total zerou — o filtro apagou tudo`.
   **Esta é a sabotagem mais importante do plano**: é a única que prova que o teste distingue
   "filtrou certo" de "zerou a leitura".
3. Em `reportService.js`, filtrar também o `relatorioMateriaisBloqueados`.
   Esperado: `✗ classe C... material de cliente bloqueado sumiu do relatorio de qualidade`.

Se qualquer uma das três **passar** com a sabotagem no lugar, o teste está cego — conserte o teste
antes de continuar.

- [x] **Step 5: rodar limpo e a suíte inteira**

Run: `cd server && node tests/api/materialClienteSegregacao.api.test.js && npm run test:api`
Executado: `14 passed, 0 failed` no arquivo; `62/62 arquivos de teste OK` no `test:api`
(60 antes da etapa + este + o da Task 3, em voo na mesma sessao); `test:almoxarifado` 43/0,
`test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0.

- [x] **Step 6: commit** — `faf20e7`

```bash
git add server/tests/helpers/clienteInvariante.js server/tests/api/materialClienteSegregacao.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: invariante de segregacao do material de cliente, com controle positivo

A falha que esta etapa arrisca introduzir e silenciosa: nada quebra, o numero so fica errado em
reposicao de minimo, sugestao de compra, valor total do estoque e posicao. Nenhum teste existente
pegaria. Este arquivo cria um material de cliente e um material proprio EQUIVALENTES lado a lado e
percorre cada leitura de estoque proprio auditada na Task 1.

As duas asserces andam sempre juntas, e o helper as impoe: provar so a AUSENCIA do material de
cliente deixaria passar um filtro escrito errado que nao devolve nada — `= NULL` em vez de
`IS NULL` nunca casa em SQL e "segregaria" perfeitamente por estar vazio. O controle positivo (o
material proprio equivalente que APARECE) e o que separa filtrou-certo de zerou-a-leitura. Foi
verificado por sabotagem: as tres sabotagens do plano fazem o teste falhar com a mensagem certa.

Coberto tambem o ganho medido da unificacao: material de cliente aceita lote e serie como qualquer
outro — era exatamente o que a ilha nao dava.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: guarda do dono na saída (decisões 5 e 6)

**Files:**
- Create: `server/services/almoxarifado/ownerRules.js`
- Modify: `server/services/almoxarifado/stockService.js` (logo depois do bloco `avaliarRegrasVinculo`, ~linha 583)
- Test: `server/tests/api/materialClienteGuardaSaida.api.test.js`

**Interfaces:**
- Consumes: coluna da Task 1.
- Produces: `ownerRules.TIPOS_ISENTOS_DONO` (array), `ownerRules.assertSaidaPermitida(db, material, tipo, params)` — **não devolve valor**, lança `Error` com `.status` 400 quando barra.

> **Por que arquivo novo e não `movementRules.js`:** `movementRules.js` é puro (não recebe `db`) e
> a guarda do dono precisa consultar `projetos`/`ordens_servico`/`clientes` para saber de quem é a
> OS e para nomear os dois clientes na mensagem de erro. Misturar db num módulo puro derrubaria a
> testabilidade que ele tem hoje.

- [x] **Step 1: escrever os testes que falham — `materialClienteGuardaSaida.api.test.js`**

```js
/**
 * Etapa 8, Task 3 — decisoes 5 e 6 do design.
 *
 * (5) Material de cliente so sai com OS ou projeto DAQUELE cliente. `projetos` e `ordens_servico`
 *     tem cliente_id, entao a checagem e real. E o primeiro teste que a spec 13 lista.
 * (6) A saida emergencial NAO fura essa guarda — unica excecao ao padrao do modulo, de proposito:
 *     o emergencial existe para urgencia no NOSSO estoque; consumir material de outra empresa sem
 *     dizer onde e problema contratual, nao de pressa.
 *
 * Executar: cd server && node tests/api/materialClienteGuardaSaida.api.test.js
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
async function novoMaterial(db, { qtd = 100, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-GRD-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) =>
  (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const cliB = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Beta SA'])).lastID;
  const projA = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliA, 'Projeto Alfa'])).lastID;
  const projB = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliB, 'Projeto Beta'])).lastID;
  const osA = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-ALFA-1', cliA, projA])).lastID;
  const osB = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-BETA-1', cliB, projB])).lastID;

  await test('consumir material do cliente A em projeto do cliente B falha', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste', projeto_id: projB });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    // A mensagem tem de NOMEAR OS DOIS clientes: generica obrigaria o operador a adivinhar qual
    // das duas pontas esta errada (o material ou o vinculo).
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.ok(/Cliente Beta SA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'a saida recusada nao podia debitar');
  });

  await test('consumir material do cliente A em OS de outro cliente falha', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_MONTAGEM', quantidade: 5, motivo: 'teste', os_id: osB });
    assert.strictEqual(res.status, 400);
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error) && /Cliente Beta SA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('consumir material do cliente A em projeto do proprio cliente A funciona', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste', projeto_id: projA });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
  });

  await test('consumir material do cliente A em OS do proprio cliente A funciona', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_ASSISTENCIA', quantidade: 4, motivo: 'teste', os_id: osA });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 96);
  });

  await test('SAIDA generica de material de cliente sem OS nem projeto falha (mesmo com justificativa)', async () => {
    // SAIDA tem vinculo 'qualquer' em REGRAS_VINCULO: justificativa sozinha basta para o material
    // NOSSO. Para material de cliente nao basta — a guarda do dono e mais estreita.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 3, motivo: 'teste', justificativa: 'preciso agora' });
    assert.strictEqual(res.status, 400);
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.ok(/OS ou projeto/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('saida emergencial nao fura a guarda do dono', async () => {
    // Em avaliarRegrasVinculo o emergencial BYPASSA a exigencia de vinculo. Aqui nao.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste',
        emergencial: true, justificativa: 'linha parada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/emergencial/i.test(res.body.error), res.body.error);
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('emergencial com o vinculo CERTO tambem falha — o emergencial nao existe para material de cliente', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste',
        projeto_id: projA, emergencial: true, justificativa: 'linha parada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/emergencial/i.test(res.body.error), res.body.error);
  });

  await test('CONTROLE POSITIVO: material NOSSO continua saindo emergencial e sem vinculo', async () => {
    const mat = await novoMaterial(db); // proprietario_cliente_id NULL
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 10, motivo: 'teste',
        emergencial: true, justificativa: 'linha parada' });
    assert.strictEqual(res.status, 201, `a guarda vazou para material proprio: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
    const mov = await dbGet(db, 'SELECT regularizacao_pendente FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.regularizacao_pendente, 1, 'o emergencial de material proprio deixou de marcar regularizacao');
  });

  await test('SUCATA de material de cliente tambem exige o vinculo do dono', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 2, motivo: 'teste', justificativa: 'peca danificada' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    const ok = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 2, motivo: 'teste',
        justificativa: 'peca danificada', projeto_id: projA });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  });

  await test('TRANSFERENCIA de material de cliente e isenta (mover de prateleira nao e aplicar)', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const l1 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, nome, ativo) VALUES ('T8-L1','Rua 1',1)")).lastID;
    const l2 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, nome, ativo) VALUES ('T8-L2','Rua 2',1)")).lastID;
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,?)', [mat, l1, 100]);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'TRANSFERENCIA', quantidade: 10, motivo: 'teste',
        localizacao_origem_id: l1, localizacao_destino_id: l2 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('entrada de material de cliente nao passa pela guarda de saida', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 0 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 50, motivo: 'remessa do cliente' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 50);
  });

  await test('consumo acima do saldo falha (regra da spec 13, agora pelo motor)', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 10 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 40, motivo: 'teste', projeto_id: projA });
    assert.strictEqual(res.status, 400);
    assert.ok(/Saldo insuficiente/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 10);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/materialClienteGuardaSaida.api.test.js`
Expected: FAIL nos casos de recusa (devolvem 201 em vez de 400 — a guarda não existe). Os controles
positivos e as isenções passam desde já; é isso que prova que o cenário está montado certo antes da
implementação.

- [x] **Step 3: implementar `ownerRules.js`**

```js
/**
 * Guarda do dono — Etapa 8, decisoes 5 e 6 do design.
 *
 * Material com `proprietario_cliente_id` so sai com OS ou projeto CUJO cliente_id seja o mesmo
 * dono. `projetos` e `ordens_servico` tem cliente_id, entao a checagem e real, nao heuristica.
 *
 * Por que arquivo separado de movementRules.js: aquele modulo e PURO (nao recebe db) e esta
 * guarda precisa consultar projetos/ordens_servico/clientes — inclusive para NOMEAR os dois
 * clientes na mensagem de erro, sem o que o operador teria de adivinhar qual das duas pontas
 * esta errada (o material ou o vinculo).
 */
const { dbGet } = require('./db');

/**
 * Tipos ISENTOS da regra de OS/projeto para material de cliente. Cada um com o motivo, porque
 * uma lista de isencoes sem motivo vira lixo que ninguem ousa mexer:
 *  - DEVOLUCAO_CLIENTE: o destino E o proprio proprietario (decisao 9). Exigir OS do dono para
 *    devolver ao dono nao faz sentido.
 *  - TRANSFERENCIA: mover a chapa do cliente de prateleira nao e aplica-la.
 *  - AJUSTE/AJUSTE_POSITIVO/AJUSTE_NEGATIVO: isentos da regra de VINCULO, mas caem na permissao
 *    dedicada `ajustar_material_cliente` (decisao 7, Task 4).
 */
const TIPOS_ISENTOS_DONO = ['DEVOLUCAO_CLIENTE', 'TRANSFERENCIA', 'AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];

/** Tipos de saida que a guarda cobre. Espelha `tiposSaida` do stockService menos os isentos. */
const TIPOS_SAIDA_COM_DONO = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'SUCATA', 'PERDA'];

function erro(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

async function nomeDoCliente(db, clienteId) {
  if (!clienteId) return null;
  const c = await dbGet(db, 'SELECT razao_social FROM clientes WHERE id = ?', [clienteId]);
  return c?.razao_social || `cliente #${clienteId}`;
}

/**
 * Descobre de qual cliente e o vinculo informado. Precedencia: projeto_id primeiro (mais
 * especifico), depois os_id. Devolve { cliente_id, rotulo } ou null quando nenhum foi informado.
 */
async function resolverClienteDoVinculo(db, { os_id, projeto_id }) {
  if (projeto_id) {
    const p = await dbGet(db, 'SELECT cliente_id, nome FROM projetos WHERE id = ?', [projeto_id]);
    if (!p) throw erro('Projeto informado nao existe');
    return { cliente_id: p.cliente_id, rotulo: `o projeto ${p.nome || projeto_id}` };
  }
  if (os_id) {
    const o = await dbGet(db, 'SELECT cliente_id, numero_os FROM ordens_servico WHERE id = ?', [os_id]);
    if (!o) throw erro('OS informada nao existe');
    return { cliente_id: o.cliente_id, rotulo: `a OS ${o.numero_os || os_id}` };
  }
  return null;
}

/**
 * Barra a saida quando ela nao respeita o dono. Nao devolve valor — lanca quando barra.
 * Chamada pelo motor DEPOIS de avaliarRegrasVinculo e ANTES de qualquer efeito de saldo.
 */
async function assertSaidaPermitida(db, material, tipo, params) {
  if (!material?.proprietario_cliente_id) return;            // material nosso: nada muda
  if (TIPOS_ISENTOS_DONO.includes(tipo)) return;
  if (!TIPOS_SAIDA_COM_DONO.includes(tipo)) return;          // entradas e tipos neutros

  const donoNome = await nomeDoCliente(db, material.proprietario_cliente_id);

  // ── A EXCECAO DELIBERADA AO PADRAO DO MODULO (decisao 6 do design) ────────────────────────
  // Em `avaliarRegrasVinculo` (movementRules.js) `emergencial: true` + justificativa BYPASSA a
  // exigencia de vinculo e marca regularizacao_pendente. AQUI NAO BYPASSA — e de proposito, nao
  // e esquecimento de espelhar aquele comportamento.
  // Motivo: o emergencial existe para urgencia no NOSSO estoque, onde o vinculo pode ser
  // regularizado depois porque o material e nosso e o prejuizo de errar e interno. Consumir
  // material de OUTRA EMPRESA sem dizer onde nao e problema de pressa, e problema contratual: o
  // cliente cobra onde foi aplicada a chapa dele, e "regularizo depois" nao e resposta. Quem
  // mexer aqui querendo "uniformizar com o resto do modulo" esta desfazendo uma decisao tomada,
  // nao corrigindo um bug.
  if (params.emergencial) {
    throw erro(`Material ${material.codigo} pertence ao cliente ${donoNome}: saida emergencial nao e `
      + 'permitida para material de terceiro. O emergencial regulariza o vinculo depois, e material '
      + 'de cliente exige saber na hora em qual OS ou projeto DESSE cliente ele foi aplicado. '
      + 'Informe a OS ou o projeto do proprio cliente.');
  }

  const vinculo = await resolverClienteDoVinculo(db, params);
  if (!vinculo) {
    throw erro(`Material ${material.codigo} pertence ao cliente ${donoNome} e so pode sair com OS ou `
      + `projeto DESSE cliente. Informe a OS ou o projeto de ${donoNome}.`);
  }
  if (Number(vinculo.cliente_id) !== Number(material.proprietario_cliente_id)) {
    const vinculoNome = await nomeDoCliente(db, vinculo.cliente_id) || 'nenhum cliente';
    throw erro(`Material ${material.codigo} pertence ao cliente ${donoNome}, mas ${vinculo.rotulo} `
      + `e do cliente ${vinculoNome}. Material de cliente so pode ser aplicado em trabalho do proprio `
      + 'dono — troque o vinculo, ou use o material equivalente do estoque proprio.');
  }
}

module.exports = { TIPOS_ISENTOS_DONO, TIPOS_SAIDA_COM_DONO, assertSaidaPermitida };
```

- [x] **Step 4: ligar a guarda no motor**

Em `server/services/almoxarifado/stockService.js`, no topo junto dos outros requires:

```js
const ownerRules = require('./ownerRules');
```

E em `registrarMovimentacao`, **imediatamente depois** do bloco de `avaliarRegrasVinculo` (as três
linhas `const regras = ...` / `if (!regras.ok) ...` / `const regularizacaoPendente = ...`,
~linha 583-585) e **antes** das restrições de endereço:

```js
  // ── Guarda do dono (Etapa 8, decisoes 5 e 6) ────────────────────────────────────────────────
  // Depois de avaliarRegrasVinculo de proposito: as duas regras se somam, nao se substituem — um
  // SAIDA_PRODUCAO de material de cliente precisa passar nas DUAS (ter vinculo, e o vinculo ser
  // do dono). Antes de qualquer efeito de saldo, como todas as guardas deste motor.
  await ownerRules.assertSaidaPermitida(db, material, tipo, { os_id, projeto_id, emergencial });
```

- [x] **Step 5: rodar e ver passar**

Run: `cd server && node tests/api/materialClienteGuardaSaida.api.test.js`
Expected: `12 passed, 0 failed`.

Depois: `cd server && npm run test:api`. **Regressão esperada em zero testes** — nenhum teste
existente cria material com dono, então `material.proprietario_cliente_id` é sempre `null` e a
guarda retorna na primeira linha.

- [x] **Step 6: controle positivo da guarda**

Trocar temporariamente, em `ownerRules.js`, `if (!material?.proprietario_cliente_id) return;` por
`return;` (guarda desligada). Rodar o arquivo: esperado **6 falhas** (os casos de recusa).
Restaurar e rodar de novo: 12 passed.

- [x] **Step 7: commit**

```bash
git add server/services/almoxarifado/ownerRules.js server/services/almoxarifado/stockService.js server/tests/api/materialClienteGuardaSaida.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: saida de material de cliente exige OS ou projeto do proprio dono

O primeiro item do checklist da spec 13 — "consumo so no projeto/cliente proprietario, enforcement"
— nao existia em nenhuma forma: clientMaterialService.consumirMaterialCliente nao validava cliente
nem projeto. O erro que isso deixava passar e o mais caro possivel: aplicar a chapa do Cliente A no
equipamento do Cliente B. Como projetos e ordens_servico tem cliente_id, a checagem e real.

Descartado "exigir vinculo sem checar o dono" (deixa passar exatamente o erro caro) e "so a tela
avisa" (quem decide neste modulo e o backend, regra fixada no CLAUDE.md).

A saida emergencial NAO fura esta guarda, e essa e a unica excecao ao padrao do modulo: em
avaliarRegrasVinculo o emergencial bypassa o vinculo e marca regularizacao_pendente. Aqui nao. O
emergencial existe para urgencia no NOSSO estoque, onde regularizar depois e aceitavel porque o
material e nosso; consumir material de outra empresa sem dizer onde nao e problema de pressa, e
problema contratual. A diferenca esta comentada no codigo — sem isso pareceria bug para quem ler
depois e resolvesse "uniformizar".

A mensagem de erro nomeia OS DOIS clientes (o dono e o do vinculo): generica, obrigaria o operador
a adivinhar qual das duas pontas esta errada.

Isentos, com o motivo em cada um: DEVOLUCAO_CLIENTE (o destino e o proprio dono), TRANSFERENCIA
(mover de prateleira nao e aplicar) e AJUSTE (isento do vinculo, mas cai na permissao dedicada).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: ajuste de material de cliente com permissão dedicada (decisão 7)

**Files:**
- Modify: `server/services/almoxarifado/permissions.js` (`ACAO_PERFIS`, ~linha 16)
- Modify: `server/services/almoxarifado/ownerRules.js` (função nova)
- Modify: `server/services/almoxarifado/stockService.js` (uma linha na chamada da Task 3)
- Test: `server/tests/api/materialClienteAjuste.api.test.js`

**Interfaces:**
- Consumes: `ownerRules.assertSaidaPermitida` (Task 3); `permissions.can(user, acao)`.
- Produces: ação `ajustar_material_cliente` em `ACAO_PERFIS` (aparece automaticamente em
  `GET /almoxarifado/minhas-permissoes`, que itera `Object.keys(ACAO_PERFIS)`);
  `ownerRules.assertAjustePermitido(db, material, tipo, { quantidade, justificativa }, user)`.

> **Por que a checagem vai no MOTOR e não só em `requirePermission` na rota:** o AJUSTE chega ao
> motor por **duas** rotas (`POST /movimentacoes` v1 e `POST /movimentacoes/v2`), e as duas têm
> gate `movimentar` — o mais amplo. Um `requirePermission('ajustar_material_cliente')` na v2
> deixaria a v1 aberta, e travar a rota inteira barraria ajuste de material **nosso**, que segue
> sendo `ajustar_estoque`. A decisão é por material, e só o motor tem o material em mãos.

- [ ] **Step 1: escrever o teste que falha — `materialClienteAjuste.api.test.js`**

```js
/**
 * Etapa 8, Task 4 — decisao 7 do design: ajuste de material de cliente exige a acao dedicada
 * `ajustar_material_cliente`, mais estreita que `ajustar_estoque` (ja ADMINISTRADOR/GESTOR).
 *
 * CUIDADO com o harness: getPerfilFromUser faz fallback para PRODUCAO, entao "usuario sem perfil"
 * NAO e "sem acesso" — e chao de fabrica. Todo teste de negativa aqui usa perfil EXPLICITO.
 *
 * Executar: cd server && node tests/api/materialClienteAjuste.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor Teste', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-AJU-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) =>
  (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;

  await test('a acao ajustar_material_cliente existe e e mais estreita que ajustar_estoque', async () => {
    assert.ok(ACAO_PERFIS.ajustar_material_cliente, 'acao ajustar_material_cliente ausente de ACAO_PERFIS');
    assert.ok(ACAO_PERFIS.ajustar_material_cliente.length < ACAO_PERFIS.ajustar_estoque.length,
      'ajustar_material_cliente nao ficou mais estreita que ajustar_estoque');
    assert.strictEqual(can(GESTOR, 'ajustar_estoque'), true, 'GESTOR perdeu ajustar_estoque');
    assert.strictEqual(can(GESTOR, 'ajustar_material_cliente'), false, 'GESTOR nao devia ajustar material de cliente');
    assert.strictEqual(can(ADMIN, 'ajustar_material_cliente'), true);
  });

  await test('GET /minhas-permissoes publica a acao nova (a UI barra antes do formulario)', async () => {
    setUser(GESTOR);
    const res = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.acoes.ajustar_material_cliente, false);
    setUser(ADMIN);
    const res2 = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res2.body.acoes.ajustar_material_cliente, true);
  });

  await test('ajuste de material de cliente sem permissao falha com 403', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, motivo: 'inventario',
        justificativa: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.ok(/Cliente Alfa LTDA/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'o ajuste recusado nao podia mudar o saldo');
    setUser(ADMIN);
  });

  await test('ajuste de material de cliente sem justificativa falha mesmo com permissao', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, motivo: 'inventario' });
    assert.strictEqual(res.status, 400);
    assert.ok(/justificativa/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('ajuste com permissao e justificativa funciona e audita nomeando o cliente', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, motivo: 'inventario',
        justificativa: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 55);
    const aud = await dbGet(db, `SELECT * FROM auditoria_log_almoxarifado
      WHERE entidade = 'material_cliente' AND acao = 'AJUSTE' ORDER BY id DESC LIMIT 1`);
    assert.ok(aud, 'auditoria nomeada do ajuste de material de cliente ausente');
    assert.ok(/Cliente Alfa LTDA/.test(JSON.stringify(aud)), 'a auditoria nao nomeou o cliente proprietario');
  });

  await test('CONTROLE POSITIVO: GESTOR continua ajustando material NOSSO', async () => {
    // Sem isto, uma acao nova aplicada larga demais passaria como se estivesse "protegendo" tudo.
    const mat = await novoMaterial(db); // material nosso
    setUser(GESTOR);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 77, motivo: 'inventario',
        justificativa: 'contagem fisica divergente' });
    assert.strictEqual(res.status, 201, `a guarda nova vazou para material proprio: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 77);
    setUser(ADMIN);
  });

  await test('AJUSTE de material de cliente e isento da regra de OS/projeto (mas nao da permissao)', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(ADMIN);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE_NEGATIVO', quantidade: 5, motivo: 'perda de processo',
        justificativa: 'sobra de corte descartada' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/materialClienteAjuste.api.test.js`
Expected: FAIL já no primeiro caso — `acao ajustar_material_cliente ausente de ACAO_PERFIS`.

- [ ] **Step 3: criar a ação em `permissions.js`**

Em `ACAO_PERFIS`, logo abaixo de `ajustar_estoque`:

```js
  ajustar_estoque: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  // Etapa 8, decisao 7: ajustar saldo de material que NAO e nosso mexe no numero que o cliente
  // vai cobrar. Mais estreita que ajustar_estoque de proposito — GESTOR ajusta o nosso, so
  // ADMINISTRADOR ajusta o de terceiro. Fluxo de aprovacao assincrono (solicita -> pendente ->
  // alguem aprova -> efetiva) foi DESCARTADO no design: e maquina de estados nova com tela de
  // pendencias e notificacao, do tamanho de uma etapa inteira (fica com a feature 06).
  // A checagem real acontece no MOTOR (ownerRules.assertAjustePermitido), nao em requirePermission
  // na rota: o AJUSTE chega por duas rotas (v1 e v2) e as duas tem gate `movimentar`, o mais amplo.
  ajustar_material_cliente: [PERFIS.ADMINISTRADOR],
```

- [ ] **Step 4: implementar `assertAjustePermitido` em `ownerRules.js`**

Acrescentar aos requires do topo:

```js
const { can, getPerfilFromUser } = require('./permissions');
const { registrarAuditoria } = require('./audit');
```

E a função, junto das demais:

```js
const TIPOS_AJUSTE_DONO = ['AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];

/**
 * Ajuste de material de cliente (Etapa 8, decisao 7). Isento da regra de OS/projeto — ajustar
 * saldo nao e aplicar material —, mas exige a acao dedicada `ajustar_material_cliente` e deixa
 * auditoria NOMEANDO o cliente proprietario: o numero ajustado e o que o cliente vai cobrar, e
 * "quem mexeu" precisa ficar legivel sem cruzar tabela.
 *
 * A justificativa ja e obrigatoria por REGRAS_VINCULO (AJUSTE* tem justificativa: true) — nao se
 * repete a checagem aqui para nao existirem duas fontes da mesma regra.
 */
async function assertAjustePermitido(db, material, tipo, params, user) {
  if (!material?.proprietario_cliente_id) return;
  if (!TIPOS_AJUSTE_DONO.includes(tipo)) return;

  const donoNome = await nomeDoCliente(db, material.proprietario_cliente_id);
  if (!can(user, 'ajustar_material_cliente')) {
    throw erro(`Ajustar o saldo do material ${material.codigo}, que pertence ao cliente ${donoNome}, `
      + `exige a permissao "ajustar_material_cliente" (seu perfil: ${getPerfilFromUser(user)}). `
      + 'Ajustar estoque de terceiro mexe no numero que o cliente vai cobrar.', 403);
  }
  await registrarAuditoria(db, {
    entidade: 'material_cliente',
    entidade_id: material.id,
    acao: 'AJUSTE',
    usuario_id: user?.id,
    usuario_nome: user?.nome || user?.email,
    dados_anteriores: { quantidade_atual: material.quantidade_atual },
    dados_novos: {
      tipo,
      quantidade: params.quantidade,
      proprietario_cliente_id: material.proprietario_cliente_id,
      proprietario_cliente_nome: donoNome,
    },
    justificativa: params.justificativa || null,
  });
}
```

`module.exports` passa a ser:

```js
module.exports = {
  TIPOS_ISENTOS_DONO, TIPOS_SAIDA_COM_DONO, TIPOS_AJUSTE_DONO,
  assertSaidaPermitida, assertAjustePermitido,
};
```

- [ ] **Step 5: ligar no motor**

Em `stockService.js`, o bloco da Task 3 passa a ter duas chamadas:

```js
  // ── Guarda do dono (Etapa 8, decisoes 5, 6 e 7) ──────────────────────────────────────────────
  // Depois de avaliarRegrasVinculo de proposito: as regras se somam, nao se substituem. Antes de
  // qualquer efeito de saldo, como todas as guardas deste motor.
  await ownerRules.assertSaidaPermitida(db, material, tipo, { os_id, projeto_id, emergencial });
  await ownerRules.assertAjustePermitido(db, material, tipo, { quantidade, justificativa }, user);
```

- [ ] **Step 6: rodar e ver passar**

Run: `cd server && node tests/api/materialClienteAjuste.api.test.js`
Expected: `7 passed, 0 failed`. Depois `cd server && npm run test:api` inteiro.

- [ ] **Step 7: controle positivo**

Trocar temporariamente `ajustar_material_cliente: [PERFIS.ADMINISTRADOR]` por
`ajustar_material_cliente: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE]` e rodar: esperado falhar em
`ajuste de material de cliente sem permissao falha com 403` (vira 201). Restaurar.

- [ ] **Step 8: commit**

```bash
git add server/services/almoxarifado/permissions.js server/services/almoxarifado/ownerRules.js server/services/almoxarifado/stockService.js server/tests/api/materialClienteAjuste.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: ajuste de material de cliente exige a acao dedicada ajustar_material_cliente

Ajustar o saldo de material que nao e nosso mexe no numero que o cliente vai cobrar, entao a
permissao tem de ser mais estreita que ajustar_estoque (que ja e ADMINISTRADOR/GESTOR): a acao nova
e so ADMINISTRADOR. O checklist da spec 13 pedia "autorizacao especial" e nao existia nada.

Descartado o fluxo de aprovacao assincrono (solicita -> pendente -> alguem aprova -> efetiva): e
maquina de estados nova com tela de pendencias e notificacao, do tamanho de uma etapa inteira, e
empurraria a Etapa 8 para ser dividida de novo. Fica com a feature 06.

A checagem vive no MOTOR, nao em requirePermission na rota, e o motivo importa: o AJUSTE chega por
duas rotas (v1 e v2) e as duas tem gate `movimentar`, o mais amplo — proteger so a v2 deixaria a v1
aberta, e travar a rota inteira barraria ajuste de material NOSSO, que segue sendo ajustar_estoque.
A decisao e por material, e so o motor tem o material em maos.

A acao aparece automaticamente em GET /almoxarifado/minhas-permissoes (que itera ACAO_PERFIS), e o
teste garante isso — e por ali que a UI barra antes do formulario. Auditoria com entidade
material_cliente nomeando o proprietario: quem mexeu no numero do cliente precisa ficar legivel sem
cruzar tabela.

Pendencia declarada nesta task, fora do escopo: o caminho aplicar_ajustes da conferencia de
inventario (routes/almoxarifado.js) faz UPDATE direto em quantidade_atual, fora do motor, logo fora
desta permissao. Fechar isso significa reescrever a aplicacao de ajustes da conferencia para passar
pelo motor — etapa propria. Registrado na spec 13 e no guia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: entrada — seção "Propriedade" no cadastro + documento obrigatório no recebimento (decisão 8)

> **A spec 13 está ERRADA neste item e a correção é parte da entrega.** O checklist diz "entrada
> exige cliente + projeto + documento". Prender o **projeto na entrada** está errado: um cliente
> manda a mesma chapa para dois projetos, e exigir projeto na entrada obrigaria a criar dois
> materiais idênticos para o mesmo item físico do mesmo dono. O projeto é exigido na **saída**,
> onde a aplicação importa e onde a guarda do dono (Task 3) já atua. A Task 10 corrige a spec
> **dizendo que estava errada** — não apagar o item em silêncio.

**Files:**
- Modify: `server/services/almoxarifado/schemas.js` (`MaterialShape`)
- Modify: `server/routes/almoxarifado.js` (`MATERIAL_UPDATE_COLUMNS` ~linha 320; `insertValues` do POST ~linha 405)
- Modify: `server/services/almoxarifado/receiptService.js` (`darEntradaEstoque`: SELECT dos itens ~linha 364 e pré-checagem ~linha 380)
- Modify: `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js`
- Test: `server/tests/api/materialClienteEntrada.api.test.js`

**Interfaces:**
- Consumes: coluna da Task 1.
- Produces: `proprietario_cliente_id` aceito e persistido por `POST`/`PUT /api/almoxarifado/materiais`
  e devolvido no GET; recebimento com item de material com dono recusa a nota inteira sem
  `nota_fiscal`.

- [ ] **Step 1: escrever o teste que falha — `materialClienteEntrada.api.test.js`**

```js
/**
 * Etapa 8, Task 5 — decisao 8 do design: a entrada exige CLIENTE e DOCUMENTO, mas NAO projeto.
 * O cliente vem da linha do material (cadastro) e o documento e a nota do recebimento. Exigir
 * projeto na entrada obrigaria a criar dois materiais identicos quando o mesmo cliente manda a
 * mesma chapa para dois projetos — a spec 13 estava errada nesse item.
 *
 * Executar: cd server && node tests/api/materialClienteEntrada.api.test.js
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
const codigo = () => { seq += 1; return `T8-ENT-${seq}`; };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const familia = (await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('T8F','Familia T8',1)")).lastID;

  await test('POST /materiais persiste proprietario_cliente_id', async () => {
    const c = codigo();
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa do cliente', familia_id: familia, unidade: 'PC',
        proprietario_cliente_id: cliA });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE codigo = ?', [c]);
    assert.strictEqual(m.proprietario_cliente_id, cliA,
      'o Zod descartou a chave em silencio (falta declarar no MaterialShape) ou o INSERT nao a gravou');
  });

  await test('PUT /materiais/:id troca e limpa o proprietario', async () => {
    const c = codigo();
    const cr = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa nossa', familia_id: familia, unidade: 'PC' });
    const id = cr.body.id;
    await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ proprietario_cliente_id: cliA });
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id])).proprietario_cliente_id, cliA);
    await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ proprietario_cliente_id: null });
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id])).proprietario_cliente_id, null);
  });

  await test('GET /materiais/:id devolve proprietario_cliente_id (a tela precisa dele para o selo)', async () => {
    const c = codigo();
    const cr = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa do cliente', familia_id: familia, unidade: 'PC', proprietario_cliente_id: cliA });
    const res = await request(app).get(`/api/almoxarifado/materiais/${cr.body.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.proprietario_cliente_id, cliA);
  });

  // ── Recebimento ────────────────────────────────────────────────────────────────────────────
  async function recebimentoCom(materialId, { nota_fiscal }) {
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, tipo_recebimento, nota_fiscal, status) VALUES (?, 'MATERIAL', ?, 'RECEBIDO')`,
    [`REC-T8-${materialId}`, nota_fiscal]);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
    [rec.lastID, materialId, 10, 10]);
    return rec.lastID;
  }

  await test('entrada de material de cliente sem documento falha', async () => {
    const c = codigo();
    const cr = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa do cliente', familia_id: familia, unidade: 'PC', proprietario_cliente_id: cliA });
    const matId = cr.body.id;
    const recId = await recebimentoCom(matId, { nota_fiscal: null });
    const receiptService = require('../../services/almoxarifado/receiptService');
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await assert.rejects(
      () => receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {}),
      (e) => /documento/i.test(e.message) && /Cliente Alfa LTDA/.test(e.message) && e.status === 400,
    );
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 0, 'a nota recusada nao podia creditar');
  });

  await test('entrada de material de cliente COM documento funciona', async () => {
    const c = codigo();
    const cr = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa do cliente', familia_id: familia, unidade: 'PC', proprietario_cliente_id: cliA });
    const matId = cr.body.id;
    const recId = await recebimentoCom(matId, { nota_fiscal: 'NF-REMESSA-123' });
    const receiptService = require('../../services/almoxarifado/receiptService');
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 10);
  });

  await test('CONTROLE POSITIVO: material NOSSO continua entrando sem nota', async () => {
    // Sem isto, a guarda escrita larga demais (exigir documento sempre) passaria como se
    // estivesse cobrindo so material de cliente — e travaria todo recebimento do modulo.
    const c = codigo();
    const cr = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa nossa', familia_id: familia, unidade: 'PC' });
    const matId = cr.body.id;
    const recId = await recebimentoCom(matId, { nota_fiscal: null });
    const receiptService = require('../../services/almoxarifado/receiptService');
    const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 10, 'a guarda de documento vazou para material proprio');
  });

  await test('a entrada NAO exige projeto (decisao 8 — a spec 13 estava errada)', async () => {
    // O mesmo cliente manda a mesma chapa para dois projetos: um unico material, duas entradas.
    const c = codigo();
    const cr = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: c, nome: 'Chapa do cliente', familia_id: familia, unidade: 'PC', proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: cr.body.id, tipo: 'ENTRADA_MANUAL', quantidade: 30, motivo: 'remessa do cliente' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/materialClienteEntrada.api.test.js`
Expected: FAIL — `o Zod descartou a chave em silencio (...)`; e o caso do documento passa sem
recusar (a guarda não existe).

- [ ] **Step 3: declarar o campo no Zod e nas colunas da rota**

`server/services/almoxarifado/schemas.js`, em `MaterialShape`, logo depois de `fornecedor_id`:

```js
  // Etapa 8: sem declarar aqui, o z.object descarta a chave em SILENCIO (validation.js troca
  // req.body pelo parsed) e o dono do material nunca chega a rota. Mesma familia de bug do
  // reserva_id na Etapa 4 e do lote_id na Etapa 6.
  proprietario_cliente_id: numFromForm(z.number().int().positive().nullable().optional()),
```

`server/routes/almoxarifado.js`, em `MATERIAL_UPDATE_COLUMNS`, junto de `fornecedor_id`:

```js
    'fornecedor_id', 'proprietario_cliente_id', 'tipo_material', 'material_critico',
```

E no `insertValues` do `POST /api/almoxarifado/materiais` (o objeto que monta o INSERT, ~linha 405)
— acrescentar ao final, antes do fechamento do objeto:

```js
      // Etapa 8: NULL = material nosso. O select da secao "Propriedade" manda '' quando ninguem
      // e escolhido; `|| null` normaliza para o unico valor que significa "nosso".
      proprietario_cliente_id: proprietario_cliente_id || null,
```

Lembrar de acrescentar `proprietario_cliente_id` à desestruturação do `req.body` no início do
handler (a mesma lista de onde saem `codigo`, `nome`, `fornecedor_id`).

- [ ] **Step 4: guarda de documento no recebimento**

`server/services/almoxarifado/receiptService.js`, em `darEntradaEstoque`. Primeiro o SELECT dos
itens (~linha 364) precisa trazer o dono e o nome dele:

```js
  const itens = await dbAll(db, `SELECT ri.*, m.material_critico, m.controle_certificado,
      m.controle_lote, m.controle_serie, m.ativo as material_ativo, m.codigo as material_codigo,
      m.tipo_material, m.localizacao_padrao_id,
      -- Etapa 8: o dono do material entra na pre-checagem (recebimento de material de cliente
      -- exige numero de documento) e a razao social entra na MENSAGEM de recusa.
      m.proprietario_cliente_id, cli.razao_social as proprietario_cliente_nome
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
    WHERE ri.recebimento_id = ?`, [recebimentoId]);
```

Depois, na pré-checagem (o laço `for (const item of itens)`), logo **antes** do bloco de
`controle_lote`:

```js
    // Etapa 8, decisao 8: material de cliente entra pelo Recebimento normal — a nota de remessa
    // e o campo de nota que ja existe. O que muda e que para ele o documento e OBRIGATORIO: e o
    // papel que prova que a chapa chegou, de quem, e em que quantidade. Material NOSSO continua
    // podendo entrar sem nota (entrada manual, devolucao, ajuste de inventario) — travar isso
    // para todo mundo quebraria todo recebimento do modulo.
    // Projeto NAO e exigido aqui: o mesmo cliente manda a mesma chapa para dois projetos, e
    // exigir projeto na entrada obrigaria a criar dois materiais identicos para o mesmo item
    // fisico do mesmo dono. O projeto e exigido na SAIDA (ownerRules.assertSaidaPermitida).
    if (item.proprietario_cliente_id && !(rec.nota_fiscal && String(rec.nota_fiscal).trim())) {
      problemas.push(`${item.material_codigo}: material do cliente `
        + `${item.proprietario_cliente_nome || `#${item.proprietario_cliente_id}`} exige numero de `
        + 'documento (nota de remessa) para dar entrada');
      continue;
    }
```

- [ ] **Step 5: rodar e ver passar**

Run: `cd server && node tests/api/materialClienteEntrada.api.test.js`
Expected: `7 passed, 0 failed`. Depois `cd server && npm run test:api`.

Controle positivo da guarda: remover temporariamente `item.proprietario_cliente_id &&` da condição
(guarda larga demais) e rodar — esperado falhar em `CONTROLE POSITIVO: material NOSSO continua
entrando sem nota`. Restaurar.

- [ ] **Step 6: seção "Propriedade" no formulário de material**

`client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js`.

6a. Estado — no objeto do `useState` do form, logo depois de `material_critico`:

```js
    // ── Propriedade (Etapa 8) ──
    proprietario_cliente_id: '',
```

6b. Lista de clientes — estado e carga, junto dos carregamentos que já existem (`loadLocalizacoes`,
`loadAlmoxarifados`):

```js
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    let cancelado = false;
    api.get('/clientes')
      .then((r) => { if (!cancelado) setClientes(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) setClientes([]); });
    return () => { cancelado = true; };
  }, []);
```

6c. A seção nova, entre "Classificação" e "Dados Técnicos" (mesmo `sectionCardStyle` das outras
seis seções):

```jsx
            {/* Propriedade (Etapa 8) */}
            <div style={sectionCardStyle}>
              <div className="almox-section-title">Propriedade</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Proprietário</label>
                  <select className="almox-form-select"
                    value={form.proprietario_cliente_id}
                    onChange={e => set('proprietario_cliente_id', e.target.value)}>
                    <option value="">GMP (estoque próprio)</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia}</option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
                    Material de cliente só sai com OS ou projeto desse mesmo cliente, exige número
                    de documento no recebimento e não entra na reposição, na sugestão de compra
                    nem no valor do estoque próprio.
                  </small>
                </div>
              </div>
            </div>
```

6d. Payload — onde o form monta o corpo do POST/PUT, mandar `null` em vez de `''` (o Zod aceita
`null` para limpar; `''` viraria `undefined` e o PUT preservaria o valor antigo, que é o oposto do
que o usuário pediu ao escolher "GMP"):

```js
      proprietario_cliente_id: form.proprietario_cliente_id ? Number(form.proprietario_cliente_id) : null,
```

6e. Carga na edição — onde o form popula `form` a partir do material carregado:

```js
      proprietario_cliente_id: m.proprietario_cliente_id ?? '',
```

- [ ] **Step 7: verificar o client**

Run: `cd client && CI=true npx react-scripts test --watchAll=false && CI=true npx react-scripts build`
Expected: suíte verde e build sem warning (CI=true transforma warning em erro — variável não usada
quebra o build).

- [ ] **Step 8: commit**

```bash
git add server/services/almoxarifado/schemas.js server/services/almoxarifado/receiptService.js server/routes/almoxarifado.js client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js server/tests/api/materialClienteEntrada.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: cadastro define o dono e recebimento de material de cliente exige documento

O material de cliente nasce no cadastro, numa secao "Propriedade" nova (select com "GMP (estoque
proprio)" como default), e entra pelo Recebimento normal — a nota de remessa e o campo de nota que
ja existe. O que muda e que, para material com dono, o documento e OBRIGATORIO: e o papel que prova
que a chapa chegou, de quem e em que quantidade. Material nosso continua entrando sem nota, e ha
teste de controle positivo para isso — a guarda escrita larga demais travaria todo recebimento.

A spec 13 estava ERRADA ao pedir "entrada exige cliente + projeto + documento". Prender o PROJETO na
entrada obriga a criar dois materiais identicos quando o mesmo cliente manda a mesma chapa para dois
projetos. O projeto e exigido na SAIDA, onde a aplicacao importa e onde a guarda do dono ja atua. A
spec e corrigida dizendo que estava errada, nao em silencio — apagar a afirmacao errada faz o
proximo confiar nela de novo.

proprietario_cliente_id precisou ser declarado no MaterialShape: chave nao declarada e descartada em
silencio pelo validate(), mesma familia de bug do reserva_id na Etapa 4 e do lote_id na Etapa 6.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: tipo de movimento `DEVOLUCAO_CLIENTE` (decisão 9)

> **Não confundir com a devolução da Etapa 7.** Lá o material **volta** para o estoque (entrada,
> tela `/almoxarifado/devolucoes`). Aqui ele **sai** do prédio de volta para quem é dele — é
> saída, pelo motor, então lote, série e endereço funcionam.

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`TIPOS_MOVIMENTO` ~linha 48; `TIPOS_DEDICADOS` novo)
- Modify: `server/services/almoxarifado/schemas.js` (`TIPOS_MOVIMENTO_ROTA`, `DevolucaoClienteSchema`)
- Modify: `server/services/almoxarifado/movementRules.js` (`REGRAS_VINCULO`)
- Modify: `server/services/almoxarifado/stockService.js` (`tiposSaida`, **dois** lugares: ~linha 497 e ~linha 1209)
- Modify: `server/routes/almoxarifado/extended.js` (rota dedicada)
- Test: `server/tests/api/materialClienteDevolucao.api.test.js`

**Interfaces:**
- Consumes: `ownerRules.TIPOS_ISENTOS_DONO` já contém `DEVOLUCAO_CLIENTE` (Task 3).
- Produces: tipo `DEVOLUCAO_CLIENTE`; `POST /api/almoxarifado/materiais-cliente/devolucoes`
  com corpo `{ material_id, quantidade, documento_devolucao, lote_id?, serie_ids?, observacoes? }`.

> **Decisão: `DEVOLUCAO_CLIENTE` NÃO é criável pela rota v2 genérica — só pela rota dedicada.**
> Justificativa: a v2 tem gate `movimentar` (o mais amplo do módulo) e valida com
> `MovimentacaoSchema`, onde `documento_vinculado` é **opcional**. Deixar o tipo entrar por lá
> significaria ou tornar o documento obrigatório para todo mundo (quebra tudo), ou fazer o motor
> validar campo que só existe para um tipo (regra de um tipo espalhada em dois lugares). A rota
> dedicada tem schema próprio com `documento_devolucao` obrigatório e é o lugar natural para a
> guarda "só material com dono". O precedente do módulo é exatamente esse: `TIPOS_RETENCAO` já é
> excluído de `TIPOS_MOVIMENTO_ROTA` porque cada um tem serviço dono com gate próprio.

- [ ] **Step 1: escrever o teste que falha — `materialClienteDevolucao.api.test.js`**

```js
/**
 * Etapa 8, Task 6 — decisao 9 do design: devolver ao cliente e SAIDA (o material sai do predio de
 * volta para quem e dele), nao a devolucao da Etapa 7 (onde o material VOLTA para o estoque).
 * Tipo novo DEVOLUCAO_CLIENTE, pelo motor — entao lote, serie e endereco funcionam —, exigindo
 * material com dono e numero do documento, e ISENTO da regra de OS/projeto porque o destino e o
 * proprio proprietario.
 *
 * Executar: cd server && node tests/api/materialClienteDevolucao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const CONSULTA = { id: 4, nome: 'Consulta', role: 'user', email: 'c@test.com', perfil_almoxarifado: 'CONSULTA' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-DEV-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) =>
  (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;

  await test('DEVOLUCAO_CLIENTE nao e criavel pela rota v2 generica', async () => {
    assert.ok(!TIPOS_MOVIMENTO_ROTA.includes('DEVOLUCAO_CLIENTE'),
      'DEVOLUCAO_CLIENTE vazou para a lista da rota generica — ela tem gate movimentar e nao exige documento');
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'DEVOLUCAO_CLIENTE', quantidade: 10, motivo: 'teste' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('devolucao ao cliente baixa o saldo e exige documento', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const semDoc = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 10 });
    assert.strictEqual(semDoc.status, 400, JSON.stringify(semDoc.body));
    assert.ok(/documento/i.test(semDoc.body.error), semDoc.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'a devolucao recusada nao podia debitar');

    const comDoc = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 10, documento_devolucao: 'DEV-2026-001' });
    assert.strictEqual(comDoc.status, 201, JSON.stringify(comDoc.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
    const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.tipo, 'DEVOLUCAO_CLIENTE');
    assert.strictEqual(mov.documento_vinculado, 'DEV-2026-001');
  });

  await test('devolucao de material SEM dono e recusada', async () => {
    const mat = await novoMaterial(db); // material nosso
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 10, documento_devolucao: 'DEV-2026-002' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/nao pertence a nenhum cliente/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 100);
  });

  await test('devolucao e ISENTA da regra de OS/projeto (o destino e o proprio dono)', async () => {
    // Sem a isencao, a guarda da Task 3 pediria OS do cliente para devolver ao cliente.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 5, documento_devolucao: 'DEV-2026-003' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('devolucao acima do saldo falha', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 8 });
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 20, documento_devolucao: 'DEV-2026-004' });
    assert.strictEqual(res.status, 400);
    assert.ok(/Saldo insuficiente/i.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 8);
  });

  await test('devolucao sem a permissao movimentar falha com 403', async () => {
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    setUser(CONSULTA);
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 5, documento_devolucao: 'DEV-2026-005' });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    setUser(ADMIN);
  });

  await test('devolucao de material com controle de serie consome as series informadas', async () => {
    const seriesService = require('../../services/almoxarifado/seriesService');
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA, qtd: 0 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [mat]);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 2, motivo: 'remessa', series: ['SN-D1', 'SN-D2'] });
    const s1 = await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [mat, 'SN-D1']);
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
      .send({ material_id: mat, quantidade: 1, documento_devolucao: 'DEV-2026-006', serie_ids: [s1.id] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const s = await seriesService.getSerie(db, s1.id);
    assert.strictEqual(s.status, 'ENTREGUE', 'a serie devolvida ao cliente devia sair do estoque');
    assert.strictEqual(await totalDoMaterial(db, mat), 1);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/materialClienteDevolucao.api.test.js`
Expected: FAIL — a rota `/materiais-cliente/devolucoes` devolve 404 em todos os casos.

- [ ] **Step 3: declarar o tipo em `schema.js`**

Em `TIPOS_MOVIMENTO`, junto de `SUCATA`/`PERDA`:

```js
  'BLOQUEIO', 'DESBLOQUEIO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'RETRABALHO',
  // Etapa 8, decisao 9: devolver ao cliente e SAIDA — o material sai do predio de volta para quem
  // e dele. Nao confundir com a devolucao da Etapa 7 (ENTRADA_DEVOLUCAO), onde o material VOLTA
  // para o estoque. Passa pelo motor de proposito: assim lote, serie e endereco funcionam.
  'DEVOLUCAO_CLIENTE',
```

E, logo depois do bloco de `TIPOS_RETENCAO`, a lista nova:

```js
// Tipos que exigem ROTA DEDICADA e por isso NAO entram na rota generica de movimentacao (mesma
// logica de TIPOS_RETENCAO acima, motivo diferente): DEVOLUCAO_CLIENTE exige numero de documento
// de devolucao, que MovimentacaoSchema nao tem como campo obrigatorio, e so vale para material
// com proprietario. Entrar pela v2 significaria ou tornar o documento obrigatorio para todos os
// tipos (quebra tudo), ou espalhar a regra de UM tipo pelo motor inteiro.
const TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE'];
```

Exportar `TIPOS_DEDICADOS` junto de `TIPOS_MOVIMENTO`/`TIPOS_RETENCAO`.

- [ ] **Step 4: excluir da rota genérica e criar o schema dedicado (`schemas.js`)**

```js
const TIPOS_MOVIMENTO_ROTA = TIPOS_MOVIMENTO.filter(
  (t) => t !== 'ESTORNO' && !TIPOS_RETENCAO.includes(t) && !TIPOS_DEDICADOS.includes(t),
);
```

(`TIPOS_DEDICADOS` entra no require do topo, junto de `TIPOS_MOVIMENTO`/`TIPOS_RETENCAO`.)

E o schema da rota nova, junto dos outros:

```js
// Etapa 8, Task 6. `documento_devolucao` e obrigatorio aqui e so aqui — e a razao de esta rota
// existir separada da v2 generica.
const DevolucaoClienteSchema = z.object({
  material_id: z.number().int().positive(),
  quantidade: z.number().gt(0, 'quantidade deve ser maior que zero'),
  documento_devolucao: z.string().trim().min(1, 'informe o numero do documento de devolucao'),
  lote_id: z.number().int().positive().optional(),
  serie_ids: z.array(z.coerce.number().int().positive()).max(1000).optional(),
  localizacao_origem_id: z.number().int().optional(),
  observacoes: z.string().optional(),
});
```

Exportar `DevolucaoClienteSchema` no `module.exports`.

- [ ] **Step 5: regra de vínculo e lista de saída**

`movementRules.js`, em `REGRAS_VINCULO`, junto de `SUCATA`/`PERDA`:

```js
  // Etapa 8, decisao 9: isenta de vinculo com OS/projeto — o destino da devolucao E o proprio
  // proprietario. A guarda do dono (ownerRules.TIPOS_ISENTOS_DONO) tambem a isenta, pelo mesmo
  // motivo. O que a substitui como controle e o documento de devolucao, obrigatorio na rota.
  DEVOLUCAO_CLIENTE: { vinculo: 'nenhum' },
```

`stockService.js` — `DEVOLUCAO_CLIENTE` precisa entrar em `tiposSaida` **nos dois lugares** onde a
lista é declarada (~linha 497, em `registrarMovimentacao`; ~linha 1209, em `cancelarMovimentacao`),
senão a devolução credita em vez de debitar num deles e o estorno fica assimétrico:

```js
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'DEVOLUCAO_CLIENTE'];
```

- [ ] **Step 6: rota dedicada em `extended.js`**

Junto das outras rotas de movimentação:

```js
  // ── Devolucao ao cliente (Etapa 8, decisao 9) ────────────────────────────────────────────────
  // Rota DEDICADA, nao a v2 generica: o documento de devolucao e obrigatorio (MovimentacaoSchema
  // nao tem como exigi-lo sem exigir de todos os tipos) e a operacao so faz sentido para material
  // com proprietario. Mesmo precedente dos TIPOS_RETENCAO, que tambem sao barrados na rota
  // generica porque cada um tem servico dono com gate proprio.
  app.post('/api/almoxarifado/materiais-cliente/devolucoes', auth, requirePermission('movimentar'),
    validate(DevolucaoClienteSchema), async (req, res) => {
      try {
        const { material_id, quantidade, documento_devolucao, lote_id, serie_ids,
          localizacao_origem_id, observacoes } = req.body;
        const material = await dbGet(db,
          `SELECT m.id, m.codigo, m.nome, m.proprietario_cliente_id, cli.razao_social as proprietario_cliente_nome
             FROM materiais_almoxarifado m
             LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
            WHERE m.id = ?`, [material_id]);
        if (!material) return res.status(404).json({ error: 'Material nao encontrado' });
        if (!material.proprietario_cliente_id) {
          return res.status(400).json({
            error: `O material ${material.codigo} nao pertence a nenhum cliente — nao ha para quem `
              + 'devolver. Para tirar material proprio do estoque use Movimentacoes (saida, sucata '
              + 'ou perda).',
          });
        }
        const resultado = await stockService.registrarMovimentacao(db, req.user, {
          material_id,
          tipo: 'DEVOLUCAO_CLIENTE',
          quantidade,
          motivo: `Devolucao ao cliente ${material.proprietario_cliente_nome}`,
          documento_vinculado: documento_devolucao,
          cliente_id: material.proprietario_cliente_id,
          lote_id: lote_id || null,
          serie_ids: serie_ids || [],
          localizacao_origem_id: localizacao_origem_id || null,
          observacoes: observacoes || null,
        // exigeLote/exigeSerie: esta rota tem como informar os dois (a tela da Task 8 oferece
        // seletor de lote e de serie), entao declara a exigencia igual as rotas v1/v2.
        }, { exigeLote: true, exigeSerie: true });
        res.status(201).json(resultado);
      } catch (e) { handleError(res, e); }
    });
```

`DevolucaoClienteSchema` entra no require dos schemas no topo de `extended.js`.

- [ ] **Step 7: rodar e ver passar**

Run: `cd server && node tests/api/materialClienteDevolucao.api.test.js`
Expected: `7 passed, 0 failed`. Depois `cd server && npm run test:api`.

Controle positivo: remover temporariamente `!TIPOS_DEDICADOS.includes(t)` do filtro de
`TIPOS_MOVIMENTO_ROTA` e rodar — esperado falhar em `DEVOLUCAO_CLIENTE nao e criavel pela rota v2
generica`. Restaurar.

- [ ] **Step 8: commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/schemas.js server/services/almoxarifado/movementRules.js server/services/almoxarifado/stockService.js server/routes/almoxarifado/extended.js server/tests/api/materialClienteDevolucao.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: DEVOLUCAO_CLIENTE, tipo de saida com documento e rota dedicada

Devolver material ao cliente nao e a devolucao da Etapa 7: la o material VOLTA para o estoque
(entrada); aqui ele SAI do predio de volta para quem e dele. Reaproveitar a tela da 7 significaria
um fluxo com duas direcoes opostas no mesmo lugar. Tipo novo, passando pelo motor de proposito —
assim lote, serie e endereco funcionam, que e justamente o que a ilha nao dava.

O tipo NAO e criavel pela rota v2 generica, e a decisao foi tomada, nao herdada: a v2 tem gate
`movimentar` (o mais amplo do modulo) e valida com MovimentacaoSchema, onde documento_vinculado e
opcional. Deixar o tipo entrar por la exigiria tornar o documento obrigatorio para todos os tipos
(quebra tudo) ou fazer o motor validar campo que so existe para um tipo (regra de um tipo espalhada
pelo motor inteiro). A rota dedicada tem schema proprio com documento_devolucao obrigatorio e a
guarda "so material com dono". Mesmo precedente dos TIPOS_RETENCAO, ja excluidos da rota generica.

Isenta da regra de OS/projeto porque o destino E o proprio proprietario — o que a substitui como
controle e o documento. Entrou em tiposSaida nos DOIS lugares onde a lista e declarada
(registrarMovimentacao e cancelarMovimentacao): so num deles, a devolucao creditaria em vez de
debitar em algum caminho e o estorno ficaria assimetrico.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: aposentadoria da ilha (decisão 4)

> **A tabela FICA.** A medição de 0 linhas cobriu só o banco de desenvolvimento
> (`server/data/database.sqlite`), e apagar tabela com base em medição que não cobre produção não
> tem volta. O que sai são as **rotas** e o **serviço** — porque enquanto vivos são um caminho
> paralelo que **escapa de todas as guardas desta etapa**: `consumirMaterialCliente` não valida
> cliente, não valida projeto, não passa pelo motor e não conhece
> `ownerRules.assertSaidaPermitida`.

**Files:**
- Delete: `server/services/almoxarifado/clientMaterialService.js`
- Modify: `server/routes/almoxarifado/extended.js` (require do topo ~linha 20; rotas ~linhas 626-641; entrada `'materiais-cliente'` do mapa de relatórios ~linha 714)
- Modify: `server/services/almoxarifado/schema.js` (comentário de aposentadoria em `materiais_cliente_almoxarifado`, ~linha 1078)
- Modify: `server/tests/almoxarifado.test.js` (remover o caso que exercita o serviço, ~linhas 205-209)
- Test: `server/tests/api/materialClienteIlhaAposentada.api.test.js`

**Interfaces:**
- Consumes: nada — é remoção.
- Produces: as três rotas passam a responder 404; a entrada `'materiais-cliente'` do mapa de
  relatórios passa a apontar para `clienteEstoqueService.posicaoPorCliente` (Task 8). **Enquanto a
  Task 8 não existir**, a entrada é removida do mapa (o relatório responde 404, que é o
  comportamento correto de um relatório que ainda não existe) e a Task 8 a recria.

- [ ] **Step 1: CONFIRMAR PRODUÇÃO VAZIA — antes de qualquer remoção**

Esta é uma pergunta ao **usuário**, não uma medição que o executor possa fazer sozinho: consultar o
banco de produção é dele. Pergunte, literalmente:

> "Antes de aposentar a ilha de materiais de cliente, preciso confirmar em **produção** (não no
> banco de dev):
> `SELECT COUNT(*) FROM materiais_cliente_almoxarifado;` e
> `SELECT COUNT(*) FROM materiais_cliente_almoxarifado WHERE ativo = 1;`
> Qual o resultado?"

**Se vier 0 (as duas):** siga o plano como escrito.

**Se vier qualquer coisa > 0:** **PARE e reporte.** Não remova nada. O que muda:
1. A tabela deixa de ser "ilha vazia" e passa a ser **dado real sem migração** — e a decisão 4 do
   design foi tomada sobre a premissa de que estava vazia.
2. As rotas de **leitura** (`GET /materiais-cliente`) continuam vivas até os dados serem migrados,
   porque removê-las esconderia dado real de quem depende dele.
3. As rotas de **escrita** (`POST /materiais-cliente` e `POST /materiais-cliente/:id/consumir`)
   saem mesmo assim — são o caminho paralelo sem guarda, e é justamente com dado real em jogo que
   isso vira perigoso.
4. Uma task de migração (linha da ilha → material com `proprietario_cliente_id` + movimentação de
   entrada correspondente) entra no plano **antes** da remoção da leitura, e o `descricao` em texto
   livre da ilha vira `nome` do material novo — sem FK, não há como casar automaticamente com
   material existente, então a migração é **assistida**, não automática.

Registre a resposta recebida (o número e a data) na Task 10, no checklist da spec 13.

- [ ] **Step 2: escrever o teste que falha — `materialClienteIlhaAposentada.api.test.js`**

```js
/**
 * Etapa 8, Task 7 — decisao 4 do design: as rotas da ilha somem. Enquanto vivas, sao um caminho
 * paralelo que ESCAPA de todas as guardas desta etapa — consumirMaterialCliente nao valida
 * cliente, nao valida projeto e nao passa pelo motor. A TABELA fica (a medicao de 0 linhas cobriu
 * so o banco de dev; apagar tabela com base em medicao que nao cobre producao nao tem volta).
 *
 * Executar: cd server && node tests/api/materialClienteIlhaAposentada.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('rotas da ilha nao existem mais', async () => {
    const get = await request(app).get('/api/almoxarifado/materiais-cliente');
    assert.strictEqual(get.status, 404, `GET /materiais-cliente ainda responde ${get.status}`);
    const post = await request(app).post('/api/almoxarifado/materiais-cliente')
      .send({ cliente_id: 1, descricao: 'chapa', quantidade_recebida: 10 });
    assert.strictEqual(post.status, 404, `POST /materiais-cliente ainda responde ${post.status}`);
    const consumir = await request(app).post('/api/almoxarifado/materiais-cliente/1/consumir')
      .send({ quantidade: 1 });
    assert.strictEqual(consumir.status, 404, `POST /materiais-cliente/:id/consumir ainda responde ${consumir.status}`);
  });

  await test('o clientMaterialService.js foi removido do disco', async () => {
    const p = path.join(__dirname, '..', '..', 'services', 'almoxarifado', 'clientMaterialService.js');
    assert.ok(!fs.existsSync(p), 'clientMaterialService.js ainda existe — o caminho paralelo continua importavel');
  });

  await test('a TABELA materiais_cliente_almoxarifado continua existindo (aposentada, nao apagada)', async () => {
    const t = await dbAll(db,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'materiais_cliente_almoxarifado'");
    assert.strictEqual(t.length, 1,
      'a tabela sumiu — a decisao 4 e aposentar, nao apagar: a medicao de 0 linhas nao cobriu producao');
  });

  await test('CONTROLE POSITIVO: a rota de devolucao ao cliente (Task 6) continua viva', async () => {
    // Se o 404 acima viesse de o modulo de rotas ter quebrado inteiro, este teste tambem falharia.
    const res = await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes').send({});
    assert.notStrictEqual(res.status, 404,
      'a rota de devolucao tambem sumiu — o 404 dos testes acima nao prova nada, o modulo quebrou');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

> O **controle positivo** deste arquivo é diferente dos outros e vale explicar: um teste que só
> exige 404 passaria se o arquivo de rotas inteiro tivesse quebrado (tudo vira 404). O caso final
> prova que o resto do módulo continua respondendo.

- [ ] **Step 3: rodar e ver falhar**

Run: `cd server && node tests/api/materialClienteIlhaAposentada.api.test.js`
Expected: FAIL nos três primeiros casos (as rotas respondem 200/201/404-de-registro, e o arquivo
existe).

- [ ] **Step 4: remover as rotas e o serviço**

Em `server/routes/almoxarifado/extended.js`:
- apagar `const clientMaterialService = require('../../services/almoxarifado/clientMaterialService');` (~linha 20);
- apagar as três rotas (`GET /materiais-cliente`, `POST /materiais-cliente`,
  `POST /materiais-cliente/:id/consumir`, ~linhas 626-641) e pôr no lugar:

```js
  // ── Materiais de cliente: a ILHA foi aposentada na Etapa 8 (decisao 4) ───────────────────────
  // Existiam aqui GET/POST /materiais-cliente e POST /materiais-cliente/:id/consumir, sobre
  // materiais_cliente_almoxarifado — tabela separada, com descricao em texto livre, sem FK para
  // materiais_almoxarifado e FORA do motor de estoque: sem lote, serie, endereco, extrato,
  // etiqueta, livro de movimentacoes, requisicao nem reserva. consumirMaterialCliente nao validava
  // cliente nem projeto, entao o primeiro item do checklist da spec 13 nao existia em forma
  // nenhuma. Material de cliente agora e material normal com dono
  // (materiais_almoxarifado.proprietario_cliente_id) e passa pelas mesmas guardas de todo o resto.
  // As rotas sairam porque, vivas, seriam um caminho paralelo que ESCAPA dessas guardas.
  // A TABELA continua no schema.js, marcada como aposentada: a medicao de 0 linhas cobriu so o
  // banco de desenvolvimento. Ver a Task 7 do plano da Etapa 8.
```

- apagar a entrada `'materiais-cliente': (db, q) => clientMaterialService.listarMateriaisCliente(db, q),`
  do mapa `reports` (~linha 714). **A Task 8 recria essa chave** apontando para
  `clienteEstoqueService.posicaoPorCliente`.

Apagar o arquivo:

```bash
git rm server/services/almoxarifado/clientMaterialService.js
```

- [ ] **Step 5: marcar a tabela como aposentada em `schema.js`**

Acima do `CREATE TABLE IF NOT EXISTS materiais_cliente_almoxarifado` (~linha 1078):

```js
  // ── APOSENTADA na Etapa 8 (decisao 4 do design, 2026-08-12) ──────────────────────────────────
  // NAO tem escritor nem leitor no codigo: o clientMaterialService.js foi removido e as tres rotas
  // /materiais-cliente sairam junto. Material de cliente virou material normal com dono
  // (materiais_almoxarifado.proprietario_cliente_id).
  //
  // Por que o CREATE TABLE continua aqui em vez de um DROP: a medicao de "0 linhas" foi feita no
  // banco de DESENVOLVIMENTO, e apagar tabela com base em medicao que nao cobre producao nao tem
  // volta. O CREATE IF NOT EXISTS e inofensivo (cria vazia num banco novo, nao toca num existente).
  //
  // Quem for remover de vez: (1) confirme COUNT(*) = 0 em PRODUCAO; (2) se houver linha, migre
  // para materiais_almoxarifado + movimentacao de entrada ANTES — o `descricao` e texto livre sem
  // FK, entao a migracao e assistida, nao automatica; (3) so entao o DROP.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS materiais_cliente_almoxarifado (
```

- [ ] **Step 6: limpar o teste de serviço que exercitava a ilha**

`server/tests/almoxarifado.test.js` (~linhas 205-209) — o caso que chama
`clientMaterialService.registrarMaterialCliente`/`consumirMaterialCliente` e o `require` do topo
(linha 11) saem. No lugar do caso, um comentário para quem for procurar o teste que sumiu:

```js
  // Etapa 8, Task 7: o teste de clientMaterialService saiu junto com o servico. O comportamento
  // que ele cobria ("consumir baixa o saldo") virou saida pelo motor, coberta por
  // tests/api/materialClienteGuardaSaida.api.test.js — que testa tambem o que a ilha NAO testava:
  // que o consumo respeita o cliente proprietario.
```

- [ ] **Step 7: rodar e ver passar**

Run: `cd server && node tests/api/materialClienteIlhaAposentada.api.test.js && npm run test:api && npm run test:almoxarifado`
Expected: `4 passed, 0 failed` no arquivo; `test:almoxarifado` verde com **um caso a menos**
(citar o número real no commit).

- [ ] **Step 8: commit**

```bash
git add server/routes/almoxarifado/extended.js server/services/almoxarifado/schema.js server/tests/almoxarifado.test.js server/tests/api/materialClienteIlhaAposentada.api.test.js
git rm --cached server/services/almoxarifado/clientMaterialService.js 2>/dev/null || true
git commit -F - <<'MSG'
Almoxarifado Etapa 8: aposenta a ilha de materiais de cliente (rotas e servico saem, tabela fica)

materiais_cliente_almoxarifado era uma ilha: tabela separada, descricao em texto livre, sem FK para
materiais_almoxarifado e fora do motor — sem lote, serie, endereco, extrato, etiqueta, livro de
movimentacoes, requisicao nem reserva. Exatamente o conjunto que as Etapas 1 a 7 construiram e que
industrializar material de terceiro exige. consumirMaterialCliente nao validava cliente nem projeto,
entao o primeiro item do checklist da spec 13 nao existia em forma nenhuma.

As tres rotas e o clientMaterialService.js saem porque, vivos, seriam um caminho paralelo que ESCAPA
de todas as guardas desta etapa: quem chamasse POST /materiais-cliente/:id/consumir continuaria
baixando material de terceiro sem dizer em qual OS. Manter a ilha e melhora-la foi descartado no
design (dar-lhe lote, serie, endereco e extrato seria reconstruir o motor inteiro), e "ilha agora,
unificar depois" tambem (a tela feita sobre a ilha seria jogada fora na unificacao — paga-se duas
vezes).

A TABELA fica, marcada como aposentada no schema.js com o roteiro de remocao. A medicao de 0 linhas
cobriu so o banco de desenvolvimento, e apagar tabela com base em medicao que nao cobre producao nao
tem volta. Producao foi confirmada vazia antes desta remocao (ver o registro na spec 13).

O teste de servico da ilha saiu junto; o comportamento que ele cobria virou saida pelo motor em
tests/api/materialClienteGuardaSaida.api.test.js, que testa tambem o que a ilha nao testava.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 8: tela `/almoxarifado/materiais-cliente` + PDF de posição por cliente

**Files:**
- Create: `server/services/almoxarifado/clienteEstoqueService.js`
- Modify: `server/routes/almoxarifado/extended.js` (2 rotas novas + recria a chave `'materiais-cliente'` do mapa de relatórios)
- Create: `client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js`
- Create: `client/src/utils/posicaoClientePdf.js`
- Modify: `client/src/App.js` (rota no bloco `path="/almoxarifado"`)
- Modify: `client/src/components/Layout.js` (`almoxarifadoMenuItems`, ~linha 326)
- Test: `server/tests/api/materialClientePosicao.api.test.js`
- Test: `client/src/utils/posicaoClientePdf.test.js`

**Interfaces:**
- Consumes: coluna (Task 1), `DEVOLUCAO_CLIENTE` (Task 6).
- Produces:
  - `clienteEstoqueService.listarClientesComMaterial(db) → [{ cliente_id, cliente_nome, materiais, saldo_total }]`
  - `clienteEstoqueService.posicaoPorCliente(db, { cliente_id }) → { cliente, itens[], aplicacoes[] }`
    onde `itens[] = { material_id, codigo, nome, unidade, recebido, consumido, devolvido, saldo, saldo_disponivel }`
    e `aplicacoes[] = { material_id, codigo, os_id, numero_os, projeto_id, projeto_nome, quantidade }`
  - `GET /api/almoxarifado/materiais-cliente/clientes`
  - `GET /api/almoxarifado/materiais-cliente/posicao?cliente_id=N`
  - `montarPosicaoClientePDF({ cliente, itens, aplicacoes, geradoEm })` (função pura) e
    `gerarPosicaoClientePDF(dados)` (renderizador `jspdf`) em `client/src/utils/posicaoClientePdf.js`

- [ ] **Step 1: escrever o teste que falha — `materialClientePosicao.api.test.js`**

```js
/**
 * Etapa 8, Task 8: posicao consolidada por cliente (recebido, consumido, devolvido, saldo) e o
 * detalhamento por OS/projeto. Os numeros saem do LIVRO DE MOVIMENTACOES, nao de colunas
 * acumuladoras — a ilha tinha quantidade_recebida/consumida/saldo como colunas que so ela
 * atualizava, e colunas acumuladoras que divergem em silencio ja custaram caro neste projeto.
 *
 * Executar: cd server && node tests/api/materialClientePosicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 0, proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, 0, 25, 1, ?)`,
  [`T8-POS-${seq}`, `Chapa 3mm ${seq}`, qtd, proprietario_cliente_id]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const cliB = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Beta SA'])).lastID;
  const projA = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cliA, 'Projeto Alfa'])).lastID;
  const osA = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)',
    ['OS-ALFA-1', cliA, projA])).lastID;

  const matA = await novoMaterial(db, { proprietario_cliente_id: cliA });
  const matB = await novoMaterial(db, { proprietario_cliente_id: cliB });
  const matNosso = await novoMaterial(db);

  // Ciclo completo do material do cliente A: recebe 100, consome 30 no projeto e 20 na OS,
  // devolve 10. Saldo esperado: 40.
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matA, tipo: 'ENTRADA_MANUAL', quantidade: 100, motivo: 'remessa do cliente' });
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matA, tipo: 'SAIDA_PRODUCAO', quantidade: 30, motivo: 'corte', projeto_id: projA });
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matA, tipo: 'SAIDA_MONTAGEM', quantidade: 20, motivo: 'montagem', os_id: osA });
  await request(app).post('/api/almoxarifado/materiais-cliente/devolucoes')
    .send({ material_id: matA, quantidade: 10, documento_devolucao: 'DEV-POS-1' });
  // Material proprio movimentado no MESMO projeto — nao pode aparecer na posicao do cliente.
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: matNosso, tipo: 'ENTRADA_MANUAL', quantidade: 50, motivo: 'compra' });

  await test('GET /materiais-cliente/clientes lista so quem tem material, com contagem', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais-cliente/clientes');
    assert.strictEqual(res.status, 200);
    const alfa = res.body.find((c) => c.cliente_id === cliA);
    assert.ok(alfa, 'Cliente Alfa nao apareceu na lista');
    assert.strictEqual(alfa.cliente_nome, 'Cliente Alfa LTDA');
    assert.strictEqual(alfa.materiais, 1);
    assert.ok(res.body.find((c) => c.cliente_id === cliB), 'Cliente Beta (com material, saldo 0) sumiu');
  });

  await test('posicao consolidada: recebido, consumido, devolvido e saldo batem com o livro', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.cliente.razao_social, 'Cliente Alfa LTDA');
    assert.strictEqual(res.body.itens.length, 1);
    const item = res.body.itens[0];
    assert.strictEqual(item.material_id, matA);
    assert.strictEqual(item.recebido, 100);
    assert.strictEqual(item.consumido, 50);
    assert.strictEqual(item.devolvido, 10);
    assert.strictEqual(item.saldo, 40);
  });

  await test('a posicao de um cliente nao mostra material de outro cliente nem material nosso', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    const ids = res.body.itens.map((i) => i.material_id);
    assert.ok(!ids.includes(matB), 'material do Cliente Beta vazou para a posicao do Cliente Alfa');
    assert.ok(!ids.includes(matNosso), 'material proprio vazou para a posicao do cliente');
    assert.ok(ids.includes(matA), 'CONTROLE POSITIVO FALHOU: o material do proprio cliente sumiu');
  });

  await test('detalhamento por OS/projeto separa as duas aplicacoes', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    const porProjeto = res.body.aplicacoes.find((a) => a.projeto_id === projA && !a.os_id);
    const porOs = res.body.aplicacoes.find((a) => a.os_id === osA);
    assert.ok(porProjeto, 'aplicacao por projeto ausente');
    assert.strictEqual(porProjeto.quantidade, 30);
    assert.ok(porOs, 'aplicacao por OS ausente');
    assert.strictEqual(porOs.quantidade, 20);
    assert.strictEqual(porOs.numero_os, 'OS-ALFA-1');
  });

  await test('movimentacao cancelada nao entra na posicao', async () => {
    // O livro guarda a linha cancelada; a posicao tem de ignora-la, senao o cliente ve consumo
    // que foi estornado.
    const mat = await novoMaterial(db, { proprietario_cliente_id: cliA });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 40, motivo: 'remessa' });
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 15, motivo: 'corte', projeto_id: projA });
    await request(app).post(`/api/almoxarifado/movimentacoes/${saida.body.movimentacao_id || saida.body.id}/cancelar`)
      .send({ justificativa: 'lancamento errado' });
    const res = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cliA}`);
    const item = res.body.itens.find((i) => i.material_id === mat);
    assert.strictEqual(item.consumido, 0, 'consumo cancelado continuou contando na posicao do cliente');
    assert.strictEqual(item.saldo, 40);
  });

  await test('posicao sem cliente_id devolve 400', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais-cliente/posicao');
    assert.strictEqual(res.status, 400);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/materialClientePosicao.api.test.js`
Expected: FAIL — as duas rotas devolvem 404.

- [ ] **Step 3: implementar `clienteEstoqueService.js`**

```js
/**
 * Posicao de estoque POR CLIENTE (Etapa 8, Task 8).
 *
 * Os numeros saem do LIVRO DE MOVIMENTACOES (movimentacoes_almoxarifado), nao de colunas
 * acumuladoras. A ilha aposentada tinha quantidade_recebida/quantidade_consumida/quantidade_saldo
 * como colunas que so ela atualizava — coluna acumuladora que diverge em silencio ja custou caro
 * neste projeto mais de uma vez. Aqui, recebido/consumido/devolvido sao SOMAS do livro, e `saldo`
 * e a diferenca; `saldo_disponivel` vem da linha do material (a mesma conta do
 * stockService.getSaldoDisponivel), que e a fonte de verdade do motor.
 *
 * `cancelado = 0` em toda soma: a linha cancelada continua no livro (e imutavel), mas nao pode
 * contar como consumo — senao o cliente ve baixa que foi estornada.
 */
const { dbAll, dbGet } = require('./db');

const TIPOS_ENTRADA = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
const TIPOS_CONSUMO = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'SUCATA', 'PERDA', 'AJUSTE_NEGATIVO'];

const listaSql = (arr) => arr.map(() => '?').join(',');

/** Clientes que TEM material cadastrado no almoxarifado. Cliente sem material nao aparece. */
async function listarClientesComMaterial(db) {
  return dbAll(db, `
    SELECT c.id AS cliente_id, c.razao_social AS cliente_nome,
           COUNT(m.id) AS materiais,
           COALESCE(SUM(m.quantidade_atual), 0) AS saldo_total
      FROM materiais_almoxarifado m
      JOIN clientes c ON c.id = m.proprietario_cliente_id
     WHERE m.proprietario_cliente_id IS NOT NULL AND m.ativo = 1
     GROUP BY c.id, c.razao_social
     ORDER BY c.razao_social`);
}

async function posicaoPorCliente(db, { cliente_id } = {}) {
  if (!cliente_id) {
    throw Object.assign(new Error('informe o cliente_id'), { status: 400 });
  }
  const cliente = await dbGet(db, 'SELECT id, razao_social, nome_fantasia FROM clientes WHERE id = ?', [cliente_id]);
  if (!cliente) throw Object.assign(new Error('Cliente nao encontrado'), { status: 404 });

  const itens = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_atual AS saldo,
           (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0)
            - COALESCE(m.quantidade_em_inspecao,0)) AS saldo_disponivel,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                      WHERE mv.material_id = m.id AND mv.cancelado = 0
                        AND mv.tipo IN (${listaSql(TIPOS_ENTRADA)})), 0) AS recebido,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                      WHERE mv.material_id = m.id AND mv.cancelado = 0
                        AND mv.tipo IN (${listaSql(TIPOS_CONSUMO)})), 0) AS consumido,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                      WHERE mv.material_id = m.id AND mv.cancelado = 0
                        AND mv.tipo = 'DEVOLUCAO_CLIENTE'), 0) AS devolvido
      FROM materiais_almoxarifado m
     WHERE m.proprietario_cliente_id = ? AND m.ativo = 1
     ORDER BY m.codigo`,
  [...TIPOS_ENTRADA, ...TIPOS_CONSUMO, cliente_id]);

  // Onde cada material foi aplicado. Sem os_id nem projeto_id a linha nao entra: a guarda do dono
  // (Task 3) impede saida de material de cliente sem um dos dois, entao consumo sem vinculo aqui
  // so pode ser lancamento anterior a esta etapa — e mostra-lo como "aplicado em nada" mentiria.
  const aplicacoes = await dbAll(db, `
    SELECT mv.material_id, m.codigo, m.nome,
           mv.os_id, os.numero_os, mv.projeto_id, p.nome AS projeto_nome,
           SUM(mv.quantidade) AS quantidade
      FROM movimentacoes_almoxarifado mv
      JOIN materiais_almoxarifado m ON m.id = mv.material_id
      LEFT JOIN ordens_servico os ON os.id = mv.os_id
      LEFT JOIN projetos p ON p.id = mv.projeto_id
     WHERE m.proprietario_cliente_id = ? AND mv.cancelado = 0
       AND mv.tipo IN (${listaSql(TIPOS_CONSUMO)})
       AND (mv.os_id IS NOT NULL OR mv.projeto_id IS NOT NULL)
     GROUP BY mv.material_id, mv.os_id, mv.projeto_id
     ORDER BY m.codigo, os.numero_os, p.nome`,
  [cliente_id, ...TIPOS_CONSUMO]);

  return { cliente, itens, aplicacoes };
}

module.exports = { listarClientesComMaterial, posicaoPorCliente, TIPOS_ENTRADA, TIPOS_CONSUMO };
```

- [ ] **Step 4: rotas em `extended.js`**

Junto da rota de devolução (Task 6), e recriando a chave do mapa de relatórios que a Task 7 removeu:

```js
  app.get('/api/almoxarifado/materiais-cliente/clientes', auth, async (req, res) => {
    try { res.json(await clienteEstoqueService.listarClientesComMaterial(db)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/materiais-cliente/posicao', auth, async (req, res) => {
    try { res.json(await clienteEstoqueService.posicaoPorCliente(db, req.query)); }
    catch (e) { handleError(res, e); }
  });
```

No mapa `reports`, no lugar da linha que a Task 7 apagou:

```js
    // Etapa 8: substitui o antigo clientMaterialService.listarMateriaisCliente (ilha aposentada).
    // Agora exige cliente_id — posicao "de todos os clientes de uma vez" nao e relatorio, e lista.
    'materiais-cliente': (db, q) => clienteEstoqueService.posicaoPorCliente(db, q),
```

`const clienteEstoqueService = require('../../services/almoxarifado/clienteEstoqueService');` no
topo, no lugar do require do `clientMaterialService` removido.

- [ ] **Step 5: rodar e ver passar**

Run: `cd server && node tests/api/materialClientePosicao.api.test.js && npm run test:api`
Expected: `6 passed, 0 failed`; suíte verde.

- [ ] **Step 6: commit do backend da posição**

```bash
git add server/services/almoxarifado/clienteEstoqueService.js server/routes/almoxarifado/extended.js server/tests/api/materialClientePosicao.api.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: posicao de estoque por cliente calculada a partir do livro

A spec 13 pede posicao por cliente (recebido, consumido, saldo, por OS/projeto) e nao existia nada.
Os numeros saem do livro de movimentacoes, nao de colunas acumuladoras: a ilha aposentada tinha
quantidade_recebida/consumida/saldo como colunas que so ela atualizava, e coluna acumuladora que
diverge em silencio ja custou caro neste projeto mais de uma vez.

cancelado = 0 em toda soma: a linha cancelada continua no livro porque movimentacao e imutavel, mas
contar consumo estornado faria o cliente ver baixa que nao aconteceu — coberto por teste.

O detalhamento por OS/projeto ignora consumo sem vinculo: a guarda do dono impede saida de material
de cliente sem OS nem projeto, entao consumo sem vinculo so pode ser lancamento anterior a esta
etapa, e mostra-lo como "aplicado em nada" mentiria sobre onde a chapa foi parar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

- [ ] **Step 7: PDF de posição — teste da função pura primeiro**

`client/src/utils/posicaoClientePdf.test.js`:

```js
/**
 * Etapa 8, Task 8. Molde: utils/etiquetasPdf.js (Etapa 6c) — montadores PUROS testaveis sem DOM
 * nem binario de PDF, e um renderizador jspdf separado. Zero mudanca de servidor.
 */
import { montarPosicaoClientePDF } from './posicaoClientePdf';

const CLIENTE = { id: 7, razao_social: 'Cliente Alfa LTDA' };
const ITENS = [
  { material_id: 1, codigo: 'CHP-001', nome: 'Chapa 3mm', unidade: 'PC', recebido: 100, consumido: 50, devolvido: 10, saldo: 40 },
  { material_id: 2, codigo: 'TUB-002', nome: 'Tubo 2"', unidade: 'M', recebido: 30, consumido: 0, devolvido: 0, saldo: 30 },
];
const APLICACOES = [
  { material_id: 1, codigo: 'CHP-001', os_id: null, numero_os: null, projeto_id: 9, projeto_nome: 'Projeto Alfa', quantidade: 30 },
  { material_id: 1, codigo: 'CHP-001', os_id: 5, numero_os: 'OS-ALFA-1', projeto_id: null, projeto_nome: null, quantidade: 20 },
];

test('o cabecalho nomeia o cliente e a data de geracao', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: APLICACOES, geradoEm: '2026-08-12T10:00:00Z' });
  expect(doc.titulo).toBe('Posição de materiais — Cliente Alfa LTDA');
  expect(doc.geradoEm).toBe('12/08/2026');
});

test('as linhas de item trazem recebido, consumido, devolvido e saldo', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: [] });
  expect(doc.linhasItens).toEqual([
    ['CHP-001', 'Chapa 3mm', 'PC', '100', '50', '10', '40'],
    ['TUB-002', 'Tubo 2"', 'M', '30', '0', '0', '30'],
  ]);
});

test('o total do rodape soma os saldos', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: [] });
  expect(doc.totalSaldo).toBe(70);
});

test('a aplicacao mostra OS quando ha OS e projeto quando so ha projeto', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: APLICACOES });
  expect(doc.linhasAplicacoes).toEqual([
    ['CHP-001', 'Projeto Alfa', '30'],
    ['CHP-001', 'OS OS-ALFA-1', '20'],
  ]);
});

test('sem aplicacoes o bloco sai vazio, nao quebra', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: undefined });
  expect(doc.linhasAplicacoes).toEqual([]);
});

test('item sem saldo continua na lista (o cliente precisa ver o que zerou)', () => {
  const doc = montarPosicaoClientePDF({
    cliente: CLIENTE,
    itens: [{ material_id: 3, codigo: 'X', nome: 'Zerado', unidade: 'PC', recebido: 10, consumido: 10, devolvido: 0, saldo: 0 }],
    aplicacoes: [],
  });
  expect(doc.linhasItens).toHaveLength(1);
  expect(doc.totalSaldo).toBe(0);
});
```

- [ ] **Step 8: rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/utils/posicaoClientePdf --watchAll=false`
Expected: FAIL — `Cannot find module './posicaoClientePdf'`.

- [ ] **Step 9: implementar `posicaoClientePdf.js`**

```js
// Etapa 8, Task 8: PDF de posicao por cliente, gerado no NAVEGADOR — zero mudanca de servidor,
// mesmo padrao validado em utils/etiquetasPdf.js (Etapa 6c). O montador e puro (testavel sem DOM
// nem binario); so gerarPosicaoClientePDF toca no jspdf.

import jsPDF from 'jspdf';

const num = (v) => String(Number(v || 0));

const formatDataBR = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

/** Descritor do documento — a moeda entre a tela, o teste e o renderizador. */
export function montarPosicaoClientePDF({ cliente, itens = [], aplicacoes = [], geradoEm } = {}) {
  const linhasItens = itens.map((i) => [
    i.codigo, i.nome, i.unidade, num(i.recebido), num(i.consumido), num(i.devolvido), num(i.saldo),
  ]);
  const linhasAplicacoes = (aplicacoes || []).map((a) => [
    a.codigo,
    a.numero_os ? `OS ${a.numero_os}` : (a.projeto_nome || '—'),
    num(a.quantidade),
  ]);
  return {
    titulo: `Posição de materiais — ${cliente?.razao_social || 'cliente'}`,
    geradoEm: formatDataBR(geradoEm),
    cabecalhoItens: ['Código', 'Material', 'Un.', 'Recebido', 'Consumido', 'Devolvido', 'Saldo'],
    linhasItens,
    cabecalhoAplicacoes: ['Código', 'Aplicado em', 'Quantidade'],
    linhasAplicacoes,
    totalSaldo: itens.reduce((acc, i) => acc + Number(i.saldo || 0), 0),
  };
}

/** Desenha e dispara o download. Sem autoTable: a grade e simples e cabe em texto posicionado. */
export function gerarPosicaoClientePDF(dados) {
  const doc = montarPosicaoClientePDF(dados);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  pdf.setFontSize(14);
  pdf.text(doc.titulo, M, y);
  y += 6;
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y);
  y += 8;

  const colsItens = [M, M + 26, M + 84, M + 96, M + 116, M + 140, M + 164];
  pdf.setFontSize(9);
  doc.cabecalhoItens.forEach((h, i) => pdf.text(h, colsItens[i], y));
  y += 2;
  pdf.line(M, y, 196, y);
  y += 5;
  for (const linha of doc.linhasItens) {
    if (y > 275) { pdf.addPage(); y = 18; }
    linha.forEach((c, i) => pdf.text(String(c).slice(0, 34), colsItens[i], y));
    y += 5;
  }
  y += 2;
  pdf.line(M, y, 196, y);
  y += 5;
  pdf.text(`Saldo total: ${doc.totalSaldo}`, M, y);
  y += 10;

  if (doc.linhasAplicacoes.length > 0) {
    if (y > 250) { pdf.addPage(); y = 18; }
    pdf.setFontSize(11);
    pdf.text('Aplicações por OS / projeto', M, y);
    y += 6;
    pdf.setFontSize(9);
    const colsAp = [M, M + 30, M + 130];
    doc.cabecalhoAplicacoes.forEach((h, i) => pdf.text(h, colsAp[i], y));
    y += 2;
    pdf.line(M, y, 196, y);
    y += 5;
    for (const linha of doc.linhasAplicacoes) {
      if (y > 280) { pdf.addPage(); y = 18; }
      linha.forEach((c, i) => pdf.text(String(c).slice(0, 60), colsAp[i], y));
      y += 5;
    }
  }

  pdf.save(`posicao-${(dados?.cliente?.razao_social || 'cliente').replace(/\W+/g, '-').toLowerCase()}.pdf`);
}
```

- [ ] **Step 10: rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test src/utils/posicaoClientePdf --watchAll=false`
Expected: 6 testes verdes.

- [ ] **Step 11: a tela `MateriaisClienteAlmoxarifado.js`**

Molde: `LotesAlmoxarifado.js` — escolher a entidade primeiro (aqui o **cliente**), depois listar,
com `useEffect` de flag `cancelado` contra resposta atrasada.

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiFileText, FiCornerUpLeft } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { gerarPosicaoClientePDF } from '../../utils/posicaoClientePdf';
import './Almoxarifado.css';

/**
 * Materiais de Clientes (Etapa 8, Task 8).
 *
 * Ate a Etapa 8 material de cliente vivia numa ilha sem tela nenhuma. Aqui ele e material normal
 * com dono: escolher o cliente traz a posicao consolidada (recebido, consumido, devolvido, saldo)
 * e onde cada item foi aplicado, com PDF e o botao de devolver ao cliente.
 *
 * Escolher o cliente primeiro, depois listar — mesma forma de LotesAlmoxarifado (o GET e por
 * cliente). O `useEffect` da posicao carrega com flag `cancelado`: trocar de cliente antes da
 * resposta chegar precisa descartar a anterior, senao a resposta atrasada pinta os numeros do
 * cliente errado — e neste ecra isso e pior que um bug de UI, e mostrar o saldo de um cliente
 * sob o nome de outro.
 */
export default function MateriaisClienteAlmoxarifado() {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [posicao, setPosicao] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [devTarget, setDevTarget] = useState(null);
  const [devQtd, setDevQtd] = useState('');
  const [devDoc, setDevDoc] = useState('');
  const [devSaving, setDevSaving] = useState(false);

  useEffect(() => {
    let cancelado = false;
    api.get('/almoxarifado/materiais-cliente/clientes')
      .then((r) => { if (!cancelado) setClientes(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) toast.error('Não foi possível carregar os clientes'); });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!clienteId) { setPosicao(null); return undefined; }
    let cancelado = false;
    setLoading(true);
    api.get(`/almoxarifado/materiais-cliente/posicao?cliente_id=${clienteId}`)
      .then((r) => { if (!cancelado) setPosicao(r.data); })
      .catch(() => { if (!cancelado) { setPosicao(null); toast.error('Não foi possível carregar a posição'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [clienteId, reloadToken]);

  const abrirDevolucao = useCallback((item) => {
    if (!bloquearSeNaoPode('movimentar')) return;
    setDevTarget(item); setDevQtd(''); setDevDoc('');
  }, [bloquearSeNaoPode]);

  const confirmarDevolucao = async () => {
    const qtd = Number(devQtd);
    if (!(qtd > 0)) { toast.error('Informe a quantidade a devolver'); return; }
    if (!devDoc.trim()) { toast.error('Informe o número do documento de devolução'); return; }
    setDevSaving(true);
    try {
      await api.post('/almoxarifado/materiais-cliente/devolucoes', {
        material_id: devTarget.material_id, quantidade: qtd, documento_devolucao: devDoc.trim(),
      });
      toast.success('Devolução registrada');
      setDevTarget(null);
      setReloadToken((t) => t + 1);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Falha ao registrar a devolução');
    } finally { setDevSaving(false); }
  };

  const aplicacoesDo = (materialId) =>
    (posicao?.aplicacoes || []).filter((a) => a.material_id === materialId);

  return (
    <div className="almox-page">
      <div className="almox-page-header">
        <h1>Materiais de Clientes</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-almox-secondary" onClick={() => setReloadToken((t) => t + 1)} disabled={!clienteId}>
            <FiRefreshCw /> Atualizar
          </button>
          <button className="btn-almox-primary" disabled={!posicao}
            onClick={() => gerarPosicaoClientePDF({ ...posicao, geradoEm: new Date().toISOString() })}>
            <FiFileText /> PDF da posição
          </button>
        </div>
      </div>

      <div className="almox-field" style={{ maxWidth: 420 }}>
        <label className="almox-label">Cliente</label>
        <select className="almox-form-select" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">— escolha o cliente —</option>
          {clientes.map((c) => (
            <option key={c.cliente_id} value={c.cliente_id}>
              {c.cliente_nome} ({c.materiais} {c.materiais === 1 ? 'item' : 'itens'})
            </option>
          ))}
        </select>
      </div>

      {loading && <SkeletonTable rows={5} />}

      {!loading && posicao && (
        <table className="almox-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Código</th><th>Material</th><th>Un.</th>
              <th>Recebido</th><th>Consumido</th><th>Devolvido</th><th>Saldo</th>
              <th>Aplicado em</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {posicao.itens.length === 0 && (
              <tr><td colSpan={9}>Este cliente não tem material no almoxarifado.</td></tr>
            )}
            {posicao.itens.map((i) => (
              <tr key={i.material_id}>
                <td>{i.codigo}</td>
                <td>{i.nome}</td>
                <td>{i.unidade}</td>
                <td>{i.recebido}</td>
                <td>{i.consumido}</td>
                <td>{i.devolvido}</td>
                <td><span className={`almox-badge almox-badge-${i.saldo > 0 ? 'ok' : 'zerado'}`}>{i.saldo}</span></td>
                <td>
                  {aplicacoesDo(i.material_id).length === 0 ? '—' : aplicacoesDo(i.material_id).map((a, k) => (
                    <div key={k} style={{ fontSize: '0.8rem' }}>
                      {a.numero_os ? `OS ${a.numero_os}` : a.projeto_nome} — {a.quantidade}
                    </div>
                  ))}
                </td>
                <td>
                  <button className="btn-almox-secondary" disabled={!(i.saldo > 0)}
                    title={i.saldo > 0 ? 'Devolver ao cliente' : 'Sem saldo para devolver'}
                    onClick={() => abrirDevolucao(i)}>
                    <FiCornerUpLeft /> Devolver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {devTarget && (
        <div className="almox-modal-overlay" onClick={() => !devSaving && setDevTarget(null)}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">Devolver ao cliente — {devTarget.codigo}</div>
            <div className="almox-modal-body">
              <div className="almox-field">
                <label className="almox-label">Quantidade (saldo: {devTarget.saldo} {devTarget.unidade})</label>
                <input className="almox-input" type="number" min="0" value={devQtd}
                  onChange={(e) => setDevQtd(e.target.value)} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Número do documento de devolução *</label>
                <input className="almox-input" value={devDoc} onChange={(e) => setDevDoc(e.target.value)} />
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                  Obrigatório: é o papel que prova que o material voltou para o dono.
                </small>
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setDevTarget(null)} disabled={devSaving}>Cancelar</button>
              <button className="btn-almox-primary" onClick={confirmarDevolucao} disabled={devSaving}>
                {devSaving ? 'Registrando...' : 'Confirmar devolução'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 12: rota e menu**

`client/src/App.js`, no bloco `path="/almoxarifado"`, junto de `lotes`:

```jsx
        <Route path="materiais-cliente" element={<MateriaisClienteAlmoxarifado />} />
```

(mais o `import MateriaisClienteAlmoxarifado from './components/almoxarifado/MateriaisClienteAlmoxarifado';`
no topo, no mesmo estilo dos demais imports do módulo).

`client/src/components/Layout.js`, em `almoxarifadoMenuItems`, depois de "Lotes e Séries":

```js
    { path: '/almoxarifado/materiais-cliente', icon: FiBriefcase, label: 'Materiais de Clientes' },
```

(`FiBriefcase` já é importado de `react-icons/fi` neste arquivo — se não estiver, acrescentar ao
import existente.)

- [ ] **Step 13: verificar o client**

Run: `cd client && CI=true npx react-scripts test --watchAll=false && CI=true npx react-scripts build`
Expected: suíte verde, build limpo.

- [ ] **Step 14: commit**

```bash
git add client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js client/src/utils/posicaoClientePdf.js client/src/utils/posicaoClientePdf.test.js client/src/App.js client/src/components/Layout.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: tela de Materiais de Clientes com posicao, devolucao e PDF

A feature 13 nunca teve tela — a ilha so tinha rotas, e nem interface para alimenta-la existiu. A
tela escolhe o cliente primeiro e depois lista (o GET e por cliente), mesma forma de LotesAlmoxarifado.

O useEffect da posicao carrega com flag `cancelado`, e aqui isso vale mais que o de costume: trocar
de cliente antes da resposta chegar, sem a guarda, pinta o saldo de um cliente sob o nome de outro —
nao e bug de UI, e informacao errada sobre patrimonio de terceiro.

O PDF e gerado no NAVEGADOR, zero mudanca de servidor, no padrao ja validado em utils/etiquetasPdf.js
(Etapa 6c): montador puro testavel sem DOM nem binario de PDF, renderizador jspdf separado. jspdf ja
era dependencia.

O botao "Devolver" fica desabilitado com saldo zero e o title explica por que — botao que some deixa
o operador procurando a acao.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 9: selo de propriedade em Materiais, Movimentações e Extrato

> Sem o selo, a unificação cria justamente a confusão que a spec 13 quer evitar: a chapa do cliente
> passa a aparecer na mesma lista que a nossa, indistinguível. O selo é a contrapartida visual da
> decisão de misturar (classe C da auditoria da Task 1).

**Files:**
- Modify: `server/routes/almoxarifado.js` (lista de materiais e detalhe trazem o nome do proprietário)
- Modify: `server/routes/almoxarifado/extended.js` (extrato traz o nome do proprietário)
- Modify: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js`
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`
- Modify: `client/src/components/almoxarifado/ExtratoMaterialModal.js`
- Modify: `client/src/components/almoxarifado/Almoxarifado.css` (classe do selo)
- Test: `client/src/components/almoxarifado/MateriaisAlmoxarifado.test.js` (describe novo; criar o arquivo com o molde de `LotesAlmoxarifado.test.js` se ainda não existir)

**Interfaces:**
- Consumes: `proprietario_cliente_id` (Task 1); `proprietario_cliente_nome` passa a vir nas três
  respostas.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: backend — o nome do proprietário nas três respostas**

`routes/almoxarifado.js`, na lista `GET /api/almoxarifado/materiais` (~linha 171), acrescentar ao
SELECT e ao JOIN:

```js
      let sql = `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo,
                        a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
                        -- Etapa 8: esta lista MISTURA material nosso e de cliente de proposito
                        -- (classe C da auditoria da Task 1) — o selo e o que evita a confusao.
                        cli.razao_social as proprietario_cliente_nome
                 FROM materiais_almoxarifado m
                 LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
                 LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
                 LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
                 LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
                 WHERE 1=1`;
```

Mesma adição em `GET /api/almoxarifado/materiais/:id` (~linha 273).

`routes/almoxarifado/extended.js`, no `GET /materiais/:id/extrato` (~linha 395):

```js
      const material = await dbGet(db, `SELECT m.*,
        (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel,
        a.codigo as almoxarifado_codigo, a.nome as almoxarifado_nome,
        cli.razao_social as proprietario_cliente_nome
        FROM materiais_almoxarifado m
        LEFT JOIN localizacoes_almoxarifado l ON m.localizacao_padrao_id = l.id
        LEFT JOIN almoxarifados a ON l.almoxarifado_id = a.id
        LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
        WHERE m.id = ?`, [req.params.id]);
```

- [ ] **Step 2: CSS do selo**

Em `client/src/components/almoxarifado/Almoxarifado.css`, junto das outras `almox-badge-*`:

```css
/* Etapa 8: selo de propriedade. Cor propria (nao reaproveita ok/critico) porque nao e status —
   e uma informacao de outra natureza, e usar a paleta de status faria material de cliente parecer
   um material com problema. */
.almox-badge-cliente { background: rgba(139,92,246,0.14); color: #7c3aed; }
```

- [ ] **Step 3: teste de client que falha**

`client/src/components/almoxarifado/MateriaisAlmoxarifado.test.js` — novo `describe` (ou arquivo
novo no molde de `LotesAlmoxarifado.test.js`: `jest.mock` de `../../services/api`,
`react-toastify` e `../../hooks/useAlmoxPermissoes`; `createRoot` + `act` + `MemoryRouter`):

```js
const MATERIAL_NOSSO = {
  id: 1, codigo: 'CHP-001', nome: 'Chapa 3mm nossa', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, proprietario_cliente_id: null,
  proprietario_cliente_nome: null,
};
const MATERIAL_CLIENTE = {
  id: 2, codigo: 'CHP-002', nome: 'Chapa 3mm do cliente', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, proprietario_cliente_id: 7,
  proprietario_cliente_nome: 'Cliente Alfa LTDA',
};

test('material de cliente mostra o selo com a razao social', async () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/materiais')) return Promise.resolve({ data: [MATERIAL_NOSSO, MATERIAL_CLIENTE] });
    return Promise.resolve({ data: [] });
  });
  await act(async () => { root.render(<MemoryRouter><MateriaisAlmoxarifado /></MemoryRouter>); });
  const linhas = container.querySelectorAll('tbody tr');
  const linhaCliente = Array.from(linhas).find((tr) => tr.textContent.includes('CHP-002'));
  const linhaNossa = Array.from(linhas).find((tr) => tr.textContent.includes('CHP-001'));
  expect(linhaCliente.querySelector('.almox-badge-cliente')).not.toBeNull();
  expect(linhaCliente.textContent).toContain('Cliente Alfa LTDA');
  // CONTROLE POSITIVO: sem isto, um selo pintado em TODA linha passaria como se identificasse
  // propriedade.
  expect(linhaNossa.querySelector('.almox-badge-cliente')).toBeNull();
});
```

- [ ] **Step 4: rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisAlmoxarifado --watchAll=false`
Expected: FAIL — `expect(received).not.toBeNull()` (o selo não existe).

- [ ] **Step 5: implementar o selo nas três telas**

`MateriaisAlmoxarifado.js` — na célula do código (a que já renderiza `{m.codigo}`, ~linha 249),
logo depois do código:

```jsx
                        {m.codigo}
                        {m.proprietario_cliente_id && (
                          <span className="almox-badge almox-badge-cliente"
                            title={`Material do cliente ${m.proprietario_cliente_nome} — só sai com OS ou projeto desse cliente`}
                            style={{ marginLeft: 6 }}>
                            {m.proprietario_cliente_nome}
                          </span>
                        )}
```

`MovimentacoesAlmoxarifado.js` — no ponto onde a tela exibe o material escolhido/selecionado (a
opção do select de material e a coluna "Material" da tabela de movimentações), o mesmo bloco. No
select, como as `<option>` não aceitam markup, o rótulo passa a incluir o dono em texto:

```jsx
  const rotuloMaterial = (m) => (
    m.proprietario_cliente_nome
      ? `${m.codigo} — ${m.nome} [cliente: ${m.proprietario_cliente_nome}]`
      : `${m.codigo} — ${m.nome}`
  );
```

e na coluna da tabela (que recebe o objeto do material, não só o texto), o `<span>` com
`almox-badge-cliente` igual ao de Materiais.

`ExtratoMaterialModal.js` — no cabeçalho do modal, ao lado do código/nome do material:

```jsx
        {material.proprietario_cliente_id && (
          <span className="almox-badge almox-badge-cliente"
            title="Material de propriedade do cliente — não entra no estoque próprio">
            {material.proprietario_cliente_nome}
          </span>
        )}
```

- [ ] **Step 6: rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false && CI=true npx react-scripts build`
Expected: suíte verde (incluindo o teste novo), build limpo.

Controle positivo: remover temporariamente a condição `{m.proprietario_cliente_id && ...}` (selo em
toda linha) e rodar — esperado falhar no `expect(linhaNossa.querySelector(...)).toBeNull()`.
Restaurar.

- [ ] **Step 7: commit**

```bash
git add server/routes/almoxarifado.js server/routes/almoxarifado/extended.js client/src/components/almoxarifado/MateriaisAlmoxarifado.js client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js client/src/components/almoxarifado/ExtratoMaterialModal.js client/src/components/almoxarifado/Almoxarifado.css client/src/components/almoxarifado/MateriaisAlmoxarifado.test.js
git commit -F - <<'MSG'
Almoxarifado Etapa 8: selo de propriedade em Materiais, Movimentacoes e Extrato

A spec 13 pede "identificacao visual de propriedade em todas as listagens que misturam materiais", e
sem isso a unificacao desta etapa cria exatamente a confusao que ela quer evitar: a chapa do cliente
passa a aparecer na mesma lista que a nossa, indistinguivel. Tres leituras foram classificadas como
"misturar e correto" na auditoria da Task 1 justamente porque o selo cobre o risco — o filtro seria
a solucao errada ali (esconderia material que esta fisicamente no galpao).

O selo tem cor propria em vez de reaproveitar a paleta de status ok/critico: propriedade nao e
status, e pintar material de cliente com cor de status o faria parecer material com problema.

O title de cada selo diz a consequencia pratica ("so sai com OS ou projeto desse cliente"), nao so o
nome — quem ve o selo pela primeira vez precisa saber o que ele muda.

Teste de client com controle positivo: alem de exigir o selo na linha do material de cliente, exige
a AUSENCIA dele na linha do material proprio. Sem isso, um selo pintado em toda linha passaria como
se identificasse propriedade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 10: documentação e verificação final da etapa

> Regra do `CLAUDE.md`: **documentação desatualizada é trabalho não terminado.** Uma sessão nova
> lê os documentos primeiro e é ativamente enganada por eles. Item não entregue fica desmarcado
> **com o porquê ao lado** — desmarcado e mudo parece esquecimento.

**Files:**
- Modify: `specs/modulo-almoxarifado/13-materiais-clientes/README.md`
- Modify: `specs/modulo-almoxarifado/14-materiais-terceiros/README.md`
- Modify: `specs/modulo-almoxarifado/README.md`
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md`
- Modify: `docs/almoxarifado-novidades-por-etapa.md`
- Modify: `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md` (este arquivo)

- [ ] **Step 1: rodar TUDO e anotar os números REAIS**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation
cd server && npm run test:safealter
cd server && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Anotar o número real de cada uma (ex.: `test:api` 61/61 arquivos, `test:almoxarifado` 42/0 — **um
caso a menos** que antes, porque o teste da ilha saiu na Task 7). **Não escrever "todos passaram"
sem o número**: o guia e o plano da 6b citam os números reais, e é assim que se detecta uma suíte
que parou de descobrir arquivos.

- [ ] **Step 2: `specs/modulo-almoxarifado/13-materiais-clientes/README.md`**

Status no topo → `🟢` com a data e o range de commits da etapa. Cada item do checklist marcado
`[x]` **com o hash do commit ao lado**. Os que ficam desmarcados levam o porquê na própria linha:

- `[x] Consumo só no projeto/cliente proprietário — enforcement` → hash da Task 3.
- **`[ ] Entrada exige cliente + projeto + documento`** → reescrever a linha assim:
  > `[x]` Entrada exige cliente + documento — hash da Task 5. **Este item da spec estava ERRADO e
  > foi corrigido na Etapa 8 (decisão 8 do design):** exigir **projeto** na entrada obrigaria a
  > criar dois materiais idênticos quando o mesmo cliente manda a mesma chapa para dois projetos.
  > O projeto é exigido na **saída**, onde a aplicação importa. Registrado aqui em vez de apagado
  > em silêncio porque a afirmação errada, apagada, faz o próximo confiar nela de novo — foi o que
  > já aconteceu duas vezes neste módulo (a feature 07 afirmava "consumo baixa reserva" quando
  > `reserva_id` era só uma coluna).
- `[x] Saída exige aplicação (OS/equipamento)` → hash da Task 3.
- `[x] Ajuste exige autorização especial` → hash da Task 4, **com a ressalva**: o caminho
  `aplicar_ajustes` da conferência de inventário (`routes/almoxarifado.js`) faz UPDATE direto em
  `quantidade_atual`, fora do motor, logo fora desta permissão — **pendência declarada**, fechar
  exige reescrever a aplicação de ajustes da conferência para passar pelo motor.
- `[ ] Sobras permanecem vinculadas ao proprietário` → **fora do escopo, feature 15** (declarado na
  spec de design, decisão 11).
- `[x] Devolução ao cliente documentada` → hash da Task 6; **o e-mail continua fora** (feature 19).
- `[x] Integração com o motor: decisão de arquitetura na Etapa 8` → hash da Task 1, citando a
  decisão 2/3 (dono na linha do material) e o motivo técnico (`getSaldoDisponivel` é escalar por
  material).
- `[ ] Custo não se mistura ao estoque próprio` → **parcialmente**: `valorTotalEstoque` do
  dashboard, `relatorioEstoqueAtual` e `posicao-estoque` já excluem (Task 1, hash). O que falta é
  custo médio/valorização própria por cliente — não entregue, feature 21.
- `[ ] Relatórios (spec 17)` → **parcialmente**: recebidos/consumidos/saldo por cliente e por
  OS/projeto entregues (Task 8, hash). Reservados, sobras, perdas e não conformes por cliente
  **não** — features 15 e 21.
- `[ ] E-mails específicos` → **fora do escopo, feature 19**.
- `[x] Tela de materiais de cliente` → hash da Task 8.
- `[x] Identificação visual de propriedade` → hash da Task 9.

Na tabela "Regras essenciais + testes de API exigidos", cada linha ganha o **arquivo de teste real**
que a cobre. Acrescentar a linha `ajuste de material de cliente sem aprovacao falha` → renomeada
para `ajuste de material de cliente sem permissao falha`, **dizendo que o nome mudou** porque a
decisão 7 descartou o fluxo de aprovação assíncrono.

Registrar também: (a) o **resultado da consulta de produção** da Task 7 (o número e a data em que o
usuário respondeu); (b) a **classe C** da auditoria (leituras que misturam de propósito) e quais
são; (c) as 6 leituras de `routes/almoxarifado.js` que a contagem de 19 da spec de design não
cobria.

- [ ] **Step 3: `specs/modulo-almoxarifado/14-materiais-terceiros/README.md`**

No topo: status continua `❌`, mas acrescentar
> **Virou Etapa 8b.** A Etapa 8 do plano mestre cobria as features 13 e 14; foi dividida em
> 2026-08-12 (mesmo precedente da Etapa 6 → 6/6b/6c). **Etapa 8 = clientes (feature 13, entregue)**,
> **Etapa 8b = terceiros (esta feature)**. Briefing de origem no fim de
> `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`.

- [ ] **Step 4: `specs/modulo-almoxarifado/README.md`**

Linha da feature 13 → `🟢`, com o range de commits. Linha da feature 14 → `❌ (Etapa 8b)`. Na
seção de etapas, registrar a divisão 8/8b com o motivo (subsistemas independentes; terceiros é
construção do zero com máquina de estados, documento de remessa, retorno parcial e transformação).

- [ ] **Step 5: `docs/almoxarifado-guia-etapas-e-testes.md`**

Cabeçalho "Onde o desenvolvimento parou" atualizado (Etapa 8 entregue; próxima é a 8b) e seção
nova "Etapa 8 — Materiais de Clientes" no molde das existentes, contendo:

- **Antes → Agora** (tabela): *Material de cliente ficava numa lista à parte, sem lote, sem série,
  sem endereço, sem extrato, sem etiqueta* → *é material normal com dono, e tudo o que as Etapas 1
  a 7 entregaram vale para ele*; *nada impedia usar a chapa do Cliente A no equipamento do Cliente
  B* → *o sistema recusa*; *o material do cliente entrava no valor do estoque e na sugestão de
  compra* → *não entra em nenhum dos dois*; *não havia tela* → *tela com posição por cliente e PDF*.
- **Roteiro de teste manual clicável**, na ordem: (1) cadastrar material com Proprietário = cliente
  X; (2) receber uma nota **sem** número de nota → ver a recusa; (3) preencher a nota e processar →
  saldo entra; (4) Movimentações → saída em projeto de outro cliente → ver a recusa **nomeando os
  dois**; (5) mesma saída marcando "emergencial" → ver que continua recusando; (6) saída no projeto
  do próprio cliente → funciona; (7) tentar AJUSTE com usuário GESTOR → 403; (8) Materiais de
  Clientes → escolher o cliente, conferir os números, gerar o PDF; (9) devolver ao cliente sem
  documento → recusa; com documento → saldo baixa; (10) conferir que o dashboard e o relatório de
  posição **não** mudaram de número por causa desse material.
- **O que a Etapa 8 NÃO cobre**: materiais **em terceiros** (feature 14 = Etapa 8b); e-mails
  (feature 19); sobras vinculadas ao proprietário (feature 15); relatórios de perdas/não conformes
  por cliente (feature 21); aprovação assíncrona de ajuste (feature 06); e a pendência do
  `aplicar_ajustes` da conferência de inventário, que ajusta fora do motor.

- [ ] **Step 6: `docs/almoxarifado-novidades-por-etapa.md` — o documento apresentado na empresa**

Seção `## Etapa 8 — Materiais de Clientes (2026-08-12)` no molde das existentes (que vão da Etapa 0
à 6c). **Exigência específica desta task: cada regra de negócio nova aparece em linguagem de
negócio COM O CENÁRIO EXATO que a demonstra — o que digitar, o que o sistema recusa, e a mensagem
esperada. Texto genérico do tipo "o sistema agora valida a propriedade do material" não vale** e
deve ser reescrito.

As seis regras e seus cenários, escritos assim:

1. **Material de cliente só é aplicado em trabalho do próprio cliente.**
   *Cenário:* cadastre a chapa com Proprietário = "Cliente Alfa LTDA". Em Movimentações, lance
   Saída para Produção de 10 PC informando o **projeto do Cliente Beta**.
   *O sistema recusa*, com: "Material CHP-002 pertence ao cliente Cliente Alfa LTDA, mas o projeto
   Projeto Beta é do cliente Cliente Beta SA. Material de cliente só pode ser aplicado em trabalho
   do próprio dono."
   *Por que importa:* aplicar a chapa de um cliente no equipamento de outro é o erro mais caro
   possível — o cliente cobra onde foi parar o material dele.

2. **A saída emergencial não vale para material de cliente.**
   *Cenário:* mesma saída, agora marcando "Emergencial" e escrevendo a justificativa.
   *O sistema recusa*, com: "Material CHP-002 pertence ao cliente Cliente Alfa LTDA: saída
   emergencial não é permitida para material de terceiro. (…) Informe a OS ou o projeto do próprio
   cliente."
   *Por que importa:* o emergencial existe para urgência no nosso estoque, onde dá para regularizar
   depois. Com material de terceiro, "regularizo depois" não é resposta para o dono.

3. **Recebimento de material de cliente exige número de documento.**
   *Cenário:* crie um recebimento com o material do cliente e **deixe o campo de nota em branco**;
   clique em processar.
   *O sistema recusa a nota inteira*, com: "Não foi possível dar entrada no estoque: CHP-002:
   material do cliente Cliente Alfa LTDA exige numero de documento (nota de remessa) para dar
   entrada."
   *E o contrário também é verdade:* material **nosso** continua entrando sem nota — isso não mudou.

4. **Ajustar o saldo de material de cliente exige permissão própria.**
   *Cenário:* com um usuário de perfil **GESTOR** (que ajusta o estoque próprio normalmente), lance
   um AJUSTE no material do cliente.
   *O sistema recusa*, com: "Ajustar o saldo do material CHP-002, que pertence ao cliente Cliente
   Alfa LTDA, exige a permissão \"ajustar_material_cliente\" (seu perfil: GESTOR)."
   Só ADMINISTRADOR ajusta. Toda alteração fica auditada nomeando o cliente.

5. **Devolver ao cliente exige o número do documento de devolução.**
   *Cenário:* em Materiais de Clientes, escolha o cliente, clique em "Devolver", informe 10 e
   **deixe o documento em branco**.
   *O sistema recusa*, com: "informe o numero do documento de devolucao". Com o documento
   preenchido, o saldo baixa e a devolução fica no extrato do material.

6. **O material do cliente não entra em nenhum número do estoque próprio.**
   *Cenário:* anote o "Valor total do estoque" do Dashboard. Dê entrada de 100 PC de material de
   cliente com custo de R$ 25. Volte ao Dashboard.
   *O número não muda* — nem o valor total, nem "materiais críticos", nem "materiais zerados", nem
   o relatório de posição de estoque, nem a sugestão automática de compra.
   *Por que importa:* antes, um material de terceiro na base contaria como patrimônio nosso e o
   sistema chegaria a abrir pedido de compra para repor a chapa de outra empresa.

Fechar a seção com o parágrafo "O que ainda não faz" (mesma lista do Step 5) e, no bloco final
"Onde estamos e o que vem a seguir", trocar a próxima etapa para **8b — materiais enviados a
terceiros**.

- [ ] **Step 7: fechar este plano**

No topo deste arquivo, o bloco de conclusão no molde do plano da 6b: `✅ ETAPA CONCLUÍDA`, range
completo de commits, números reais das suítes, e a tabela `Task | O quê | Hash(es) | Fix round`.
**Reconferir cada hash com `git log -1 --format='%s' <hash>`** antes de escrever a tabela — foi
exatamente uma atribuição task→hash errada, herdada de documentação anterior, que a Task 12 da 6b
teve de corrigir.

Marcar todos os steps `[x]`.

- [ ] **Step 8: commit**

```bash
git add specs/modulo-almoxarifado docs/almoxarifado-guia-etapas-e-testes.md docs/almoxarifado-novidades-por-etapa.md docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md
git commit -F - <<'MSG'
Almoxarifado Etapa 8: atualiza specs, guia, novidades e plano com o que a etapa entregou

Documentacao desatualizada e trabalho nao terminado: uma sessao nova le os documentos primeiro e e
ativamente enganada por eles. Fechado o checklist da spec 13 item por item com hash, e o que ficou
de fora esta desmarcado COM o porque na propria linha — desmarcado e mudo parece esquecimento.

Correcao declarada na spec 13: o item "entrada exige cliente + projeto + documento" estava ERRADO
quanto ao projeto, e a linha diz isso em vez de sumir. Prender o projeto na entrada obrigaria a
criar dois materiais identicos quando o mesmo cliente manda a mesma chapa para dois projetos; o
projeto e exigido na saida. Apagar a afirmacao errada em silencio faz o proximo confiar nela de
novo — ja aconteceu duas vezes neste modulo.

Registradas tambem duas coisas que a auditoria da Task 1 achou e a spec de design nao previa: a
classe C de leituras (onde misturar dono e o comportamento correto, e o selo cobre o risco) e as
seis leituras de routes/almoxarifado.js que a contagem de 19 nao cobria, incluindo o valor total do
estoque no dashboard.

Feature 14 marcada como Etapa 8b, com o briefing de origem no fim do plano.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Self-review do plano (feito em 2026-08-12)

**1. Cobertura da spec de design — decisão por decisão:**

| Decisão | Onde | Observação |
|---|---|---|
| 1 — Etapa 8 dividida (8 = clientes, 8b = terceiros) | header + Task 10 (specs 13/14 e README mestre) | briefing da 8b no fim deste arquivo |
| 2 — material de cliente vira material normal com dono | Task 1 (coluna) | |
| 3 — dono na linha do MATERIAL, não na de saldo | Task 1 (comentário do `safeAlter` com a razão técnica e a semântica) + Task 2 (invariante) | |
| 4 — ilha aposentada, tabela fica | Task 7, com o step de confirmação de produção e o que fazer se não estiver vazia | |
| 5 — saída exige OS/projeto do dono | Task 3 | |
| 6 — emergencial não fura | Task 3, comentado no código como exceção deliberada | |
| 7 — `ajustar_material_cliente` | Task 4 | |
| 8 — entrada exige cliente + documento, **não** projeto; spec 13 errada | Task 5 (código + teste) e Task 10 (correção declarada da spec) | |
| 9 — `DEVOLUCAO_CLIENTE` | Task 6, com a justificativa de rota dedicada vs. v2 | |
| 10 — PDFs no navegador | Task 8 (`posicaoClientePdf.js`, molde `etiquetasPdf.js`) | **Ver a divergência (a) abaixo** |
| 11 — escopo confirmado / o que fica fora | Task 10 (specs e guia listam o que ficou fora e a feature dona) | |

Arquitetura: coluna + invariante (Tasks 1-2), enforcement na saída (3), entrada (5), telas (8-9),
devolução (6), PDF (8), ajuste (4). Tratamento de erro: as 6 mensagens da seção "Tratamento de
erro" da spec têm teste que casa o texto (`/Cliente Alfa LTDA/`, `/emergencial/i`, `/documento/i`,
403 do ajuste, `/nao pertence a nenhum cliente/i`). Tabela de testes exigidos: os 9 nomes da spec
estão cobertos — `consumir material do cliente A em projeto do cliente B falha` (T3),
`saida emergencial nao fura a guarda do dono` (T3), `consumo acima do saldo falha` (T3),
`entrada de material de cliente sem documento falha` (T5),
`posicao de estoque proprio exclui material de cliente` (T2),
`ajuste de material de cliente sem permissao falha` (T4),
`devolucao ao cliente baixa o saldo e exige documento` (T6),
`rotas da ilha nao existem mais` (T7),
`material de cliente aceita lote e serie como qualquer outro` (T2). Testes de client: T8 (PDF puro)
e T9 (selo).

**2. Varredura de placeholders:** nenhum "TBD", "similar à Task N", "adicione validação
apropriada" ou "escreva os testes". Todo corpo de teste está escrito por extenso; todo step de
código traz o código. Os únicos textos em prosa são a Task 10 (documentação, onde o conteúdo *é*
prosa) e os pontos 6c/6e da Task 5, que descrevem edições de uma linha em pontos nomeados do
arquivo, com o código da linha.

**3. Consistência de tipos e nomes** (checado contra os arquivos reais):
`proprietario_cliente_id` — mesmo nome em coluna, Zod, `MATERIAL_UPDATE_COLUMNS`, `insertValues`,
form e queries. `proprietario_cliente_nome` — o campo derivado, mesmo nome nas 5 respostas que o
expõem (lista, detalhe, extrato, `consultarEstoque`, itens do recebimento).
`ownerRules.assertSaidaPermitida(db, material, tipo, params)` e
`assertAjustePermitido(db, material, tipo, params, user)` — mesmas assinaturas na definição (T3/T4)
e na chamada do motor. `assertSegregado(rows, { materialClienteId, materialProprioId, contexto,
idOf })` — mesma forma no helper (T2) e nos 4 usos. `clienteEstoqueService.posicaoPorCliente(db,
{ cliente_id })` — mesma no serviço, nas 2 rotas e no mapa de relatórios.
`montarPosicaoClientePDF` / `gerarPosicaoClientePDF` — mesmas no util, no teste e na tela.
`DEVOLUCAO_CLIENTE` — mesma string em `TIPOS_MOVIMENTO`, `TIPOS_DEDICADOS`, `REGRAS_VINCULO`,
`tiposSaida` (**2 lugares**), `TIPOS_ISENTOS_DONO` e na rota.

**4. Onde este plano DIVERGE do briefing ou do design — declarado, não escondido:**

- **(a) O PDF "de posição por cliente" é UM, não dois.** A decisão 10 da spec fala em "os dois
  PDFs" mas o escopo da decisão 11 nomeia só "PDF de posição por cliente"; o segundo PDF plausível
  seria o **documento de devolução**, que a spec 13 lista como item da feature 12/19. Este plano
  entrega **um** PDF (posição) e registra o documento de devolução como **não entregue**, na Task
  10. Se o usuário quiser os dois, é um step a mais na Task 8 — não uma reestruturação.
- **(b) A classificação da auditoria tem TRÊS classes, não duas.** A spec previa "estoque próprio"
  e "material por id". Três leituras (relatório de bloqueados, soma física do mapa de localizações,
  relatório de materiais-sem-endereço) não cabem em nenhuma das duas sem ficarem erradas: são
  conjuntos onde **misturar é o comportamento correto**, e o que cobre o risco é o selo da Task 9,
  não um filtro. Classe C está declarada na Task 1 e volta na documentação.
- **(c) A contagem de "19 queries" está incompleta.** Ela varreu `routes/almoxarifado/` (o
  subdiretório) e deixou de fora `server/routes/almoxarifado.js`, que tem mais 16 ocorrências —
  entre elas as **cinco do dashboard** (incluindo `SUM(quantidade_atual * custo_unitario)`) e o
  **relatório de posição de estoque**, que é literalmente a rota nomeada pelo teste
  `posicao de estoque proprio exclui material de cliente`. A Task 1 audita as 19 **e** as 16, e
  filtra 6 destas últimas.
- **(d) Uma pendência nova, achada ao auditar e declarada como fora de escopo:** o caminho
  `aplicar_ajustes` da conferência de inventário (`routes/almoxarifado.js` ~linha 941) faz
  `UPDATE materiais_almoxarifado SET quantidade_atual = ?` **direto, fora do motor** — logo fora da
  permissão `ajustar_material_cliente` da Task 4. Fechar isso é reescrever a aplicação de ajustes
  da conferência para passar pelo motor: etapa própria. Registrado na Task 4 (commit), na Task 10
  (spec e guia) e aqui.

**5. Riscos apontados ao executor:**

1. **Números de linha envelhecem** — este plano cita `~linha N` só como pista. Use as **âncoras
   nomeadas** (o bloco de `avaliarRegrasVinculo`, a lista `MATERIAL_UPDATE_COLUMNS`, o mapa
   `reports`, o segundo subselect do `MAPA_LOCALIZACOES_SQL`), não o número.
2. **`= NULL` nunca casa em SQL.** É o erro que faz um filtro "segregar" zerando a leitura, e é
   exatamente o que o controle positivo da Task 2 (sabotagem 2) existe para pegar.
3. **`tiposSaida` é declarado DUAS vezes** em `stockService.js` (`registrarMovimentacao` e
   `cancelarMovimentacao`). Esquecer a segunda faz o estorno da devolução ficar assimétrico.
4. **Chave não declarada no Zod some em silêncio** — `proprietario_cliente_id` (T5) e
   `DevolucaoClienteSchema` (T6). É a terceira vez que este bug aparece no módulo (`reserva_id` na
   Etapa 4, `lote_id`/`series` na Etapa 6/6b).
5. **`getPerfilFromUser` cai em `PRODUCAO`** — teste de negativa de permissão precisa de perfil
   explícito, nunca "usuário sem perfil".
6. **CRA com `CI=true` transforma warning em erro** — variável não usada quebra o build.
7. **A ordem 7 → 8 importa.** Se a Etapa 7 não estiver entregue, as Tasks 3 e 6 colidem com ela em
   `REGRAS_VINCULO` e em `tiposSaida`.

---

# Próxima tarefa da ordem do plano mestre: Etapa 8b — Materiais Enviados a Terceiros

> **Escrito ao fechar a Etapa 8, para quem pegar a 8b.** Ainda **não tem design aprovado nem tasks
> quebradas** — isto é o *briefing de origem*, no mesmo formato que a seção final do plano da 6b
> gerou o design da 6c. A primeira ação de quem pegar a 8b é abrir `superpowers:brainstorming` com
> este briefing, **não** sair escrevendo código.
>
> Feature: `specs/modulo-almoxarifado/14-materiais-terceiros` (status `❌` — nada implementado).

## Por que já está decidida como etapa própria

A Etapa 8 do plano mestre cobria as features **13 e 14**. Foi dividida em 2026-08-12, na sessão de
design da 8 (decisão 1), pelo mesmo precedente da Etapa 6 → 6/6b/6c: são **subsistemas
independentes**, cada um fecha com testes passando por conta própria, e juntos dariam uma etapa
grande demais para revisar. Clientes é *unificação* (o material já existe, ganha um dono);
terceiros é *construção do zero* — máquina de estados, documento de remessa, retorno parcial e
transformação de material.

## O problema

Hoje **não existe nada**. Quando uma chapa sai para corte, dobra, usinagem, tratamento ou
galvanização num fornecedor externo, o sistema não tem como dizer que ela saiu para beneficiamento:
ou ela é dada como consumida (e some do estoque, embora vá voltar), ou não é lançada (e o estoque
mente sobre o que está no galpão). Não há prazo, não há retorno parcial, e não há como amarrar a
peça que voltou à chapa que saiu.

## Contrato que a 8b consome (já pronto, não precisa reabrir)

- **Motor de estoque** (`stockService.registrarMovimentacao`) com `TRANSFERENCIA` — a Etapa 7
  entregou o tipo no formulário. O checklist da feature 14 já aponta "envio = saída para
  localização virtual 'Em terceiros'": o tipo de localização está previsto no enum
  `TIPOS_LOCALIZACAO` (`schema.js`) como "Área externa", e localização virtual já é conceito que o
  motor suporta (`estoque_saldo_almoxarifado` aceita qualquer `localizacao_id`).
- **Lote e série** (`lotService`, `seriesService`, Etapas 6/6b) — a chapa que sai para corte tem
  lote e corrida, e a rastreabilidade da transformação depende de carregar isso para a peça
  resultante.
- **Guarda do dono** (`ownerRules.assertSaidaPermitida`, Etapa 8) — **ponto de atenção real**: se a
  chapa que vai para o terceiro for **de um cliente**, a remessa é uma saída, e a guarda vai
  exigir OS/projeto do dono. Decidir no design se remessa a terceiro entra em
  `TIPOS_ISENTOS_DONO` (o material continua sendo do cliente, só mudou de endereço) ou se exige o
  vínculo (o beneficiamento é feito *para* um trabalho). A resposta provável é **isento com
  registro**, no mesmo espírito da `TRANSFERENCIA` — mas é decisão de design.
- **Fornecedores** (`fornecedores`, módulo Compras) — o terceiro é um fornecedor cadastrado;
  `receiptService.resolverPedidoCompra` mostra o padrão de resolução por id ou número.
- **Permissões** (`ACAO_PERFIS`, `requirePermission`) — decidir se remessa/retorno reaproveitam
  `movimentar` ou ganham ação própria (a Etapa 8 abriu o precedente de ação nova com
  `ajustar_material_cliente`; o critério usado lá foi "a operação mexe em algo que não é nosso").
- **PDF no navegador** (`utils/etiquetasPdf.js`, `utils/posicaoClientePdf.js`) — o "documento de
  remessa (PDF)" do checklist tem dois moldes prontos e `jspdf` já é dependência. **Zero mudança
  de servidor** para o PDF é o padrão validado em duas etapas seguidas.
- **Alerta de atraso** — `alertService` já tem a estrutura de verificação periódica + envio
  (`verificarAlertasEstoque`, `processarAlertaMaterial`, e-mail/WhatsApp) que o "acompanhamento de
  prazo + alerta de atraso" do checklist consumiria.

## Pontos de atenção (para o design decidir, não para o implementador chutar)

1. **A transformação é o item mais difícil e não tem precedente no módulo.** "Chapa → peças
   cortadas" significa que o material que volta **não é** o material que saiu: sai 1 chapa, voltam
   40 peças e uma sobra. O motor de hoje não tem nenhum conceito de "material A vira material B" —
   toda movimentação é sobre **um** `material_id`. Decidir: tabela de vínculo
   (`origem_material_id` → `resultado_material_id` + quantidades) ou par de movimentações amarradas
   por um id de transformação. Isto é modelagem nova, e é o que separa a 8b de "mais uma tela".
2. **Retorno parcial + encerramento com pendência.** A máquina de estados do checklist
   (`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA`) precisa dizer o que acontece com
   o saldo que nunca voltou: perda no terceiro? consumo? sucata? O teste exigido
   (`encerrar remessa com pendencia sem justificativa falha`) diz que **alguma coisa** tem de ser
   registrada — o design decide o quê.
3. **Saldo "em terceiros" visível mas não disponível.** O checklist pede isso explicitamente. Há
   dois caminhos: (a) localização virtual, e o material continua em `quantidade_atual` mas numa
   linha de saldo que a disponibilidade ignora; (b) coluna de retenção nova em
   `materiais_almoxarifado`, no padrão de `quantidade_reservada`/`bloqueada`/`em_inspecao`. O (b)
   é mais fiel ao "não disponível" (`getSaldoDisponivel` subtrai as três colunas e subtrairia a
   quarta), mas mexe no núcleo do motor; o (a) é mais barato e não segrega o disponível de
   verdade. **Esta é a primeira decisão do brainstorming**, porque decide todo o resto.
4. **Sem transação, de novo.** Remessa com N itens que move estoque item a item é exatamente o
   padrão claim-no-WHERE + compensação explícita do `receiptService.darEntradaEstoque` — copiar a
   forma dele (pré-checagem que recusa a remessa inteira, depois efeito item a item com claim),
   não inventar outra.
5. **A auditoria da Etapa 8 vale para a 8b.** Se a 8b criar coluna nova em
   `materiais_almoxarifado` (ponto 3b), a mesma pergunta se repete para **todas** as leituras da
   tabela — e a lista já está levantada e classificada na Task 1 deste plano. Reusar a lista, não
   refazer o grep do zero.
6. **E-mails ficam de fora** (feature 19), como ficaram na Etapa 8 — não travar a 8b esperando.

## O que já está decidido (não reabrir)

- Terceiros é **Etapa 8b**, etapa própria — decisão de 2026-08-12, reafirmada aqui.
- Material de cliente **enviado a terceiro** é um caso que existe e precisa ser tratado (a chapa do
  cliente vai para galvanizar), mas o modelo de propriedade já está pronto: é
  `proprietario_cliente_id`, e não se cria conceito novo para isso.
- O PDF do documento de remessa é gerado no **navegador**, no padrão das Etapas 6c e 8 — não é
  decisão a reabrir, só a escrever.
- `jspdf` já é dependência; nenhuma biblioteca nova é necessária para o PDF.
