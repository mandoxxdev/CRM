# Almoxarifado Etapa 5 — Quarentena e Bloqueio Efetivos no Saldo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Material que exige inspeção entra retido (fora do disponível), e aprovar/reprovar/bloquear passam a ser movimentações auditadas com efeito correto no saldo.

**Architecture:** Três tipos de movimentação novos no motor (`QUARENTENA`, `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO`), seguindo a simetria que `BLOQUEIO`/`DESBLOQUEIO` já usam — movimento que mexe em coluna de retenção sem tocar o físico. A lógica de inspeção sai de `receiptService.js` para um `inspectionService.js` novo, como `reservationService.js` foi separado na Etapa 4. Toda mutação de saldo usa `UPDATE` condicional com guarda, o padrão de atomicidade do módulo.

**Tech Stack:** Node + Express + SQLite (`sqlite3`), Zod para validação, React CRA no client. Testes de API com `supertest` sobre `server/tests/helpers/testApp.js`; testes de componente com `react-scripts test`.

## Global Constraints

- **Design de referência:** `docs/superpowers/specs/2026-08-07-almoxarifado-etapa5-quarentena-design.md`. Toda decisão discutível já está resolvida lá — leia antes de começar.
- **Regra de ouro do módulo:** toda regra essencial nasce com teste de API. Nada é marcado como feito sem teste passando.
- **TDD obrigatório:** escreva o teste, veja falhar pelo motivo certo, implemente. Se um teste passar de primeira, rode um controle positivo (mute o código e confirme que ele acusa) — já houve três testes vazios nesta base.
- **Atomicidade:** o módulo não usa transação. O padrão é `UPDATE` condicional com `RETURNING` que valida no próprio `WHERE`, mais compensação explícita se um passo posterior falhar. Nunca leia-depois-escreva.
- **Saldo é global por material** (almoxarifado é área física do mesmo site, não filial). Não segregar saldo por almoxarifado.
- **Commits:** mensagem em português, sem acento no corpo. Explique o porquê, não só o quê. Um commit por assunto. Nunca `git add -A` na raiz — há artefatos de runtime em `server/data/`.
- **Suítes que precisam ficar verdes:** `cd server && npm run test:api && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`, e `cd client && CI=true npx react-scripts test --watchAll=false && CI=true npx react-scripts build`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `server/services/almoxarifado/stockService.js` (modificar) | Motor: ganha os três tipos novos e a guarda atômica do `DESBLOQUEIO` |
| `server/services/almoxarifado/schema.js` (modificar) | `TIPOS_MOVIMENTO` + colunas novas da inspeção |
| `server/services/almoxarifado/movementRules.js` (modificar) | Justificativa obrigatória em bloqueio/reprovação |
| `server/services/almoxarifado/inspectionService.js` (**criar**) | Aprovar/reprovar/parcial, encaminhamento, bloqueio avulso |
| `server/services/almoxarifado/receiptService.js` (modificar) | Entrada retida; `inspecionarItem` sai daqui |
| `server/services/almoxarifado/returnService.js` (modificar) | Passa a informar justificativa no `BLOQUEIO` |
| `server/routes/almoxarifado/extended.js` (modificar) | Rotas de inspeção e bloqueio avulso |
| `client/src/components/almoxarifado/InspecoesAlmoxarifado.js` (**criar**) | Fila de inspeções pendentes |

`inspectionService.js` é novo em vez de crescer `receiptService.js` (511 linhas, já responsável pelo workflow fiscal de 4 etapas e 11 status). Recebimento e inspeção mudam por razões diferentes.

---

### Task 1: Motor — os três tipos de movimentação da quarentena

**Files:**
- Modify: `server/services/almoxarifado/schema.js:47-52` (`TIPOS_MOVIMENTO`)
- Modify: `server/services/almoxarifado/stockService.js:279-291`
- Test: `server/tests/api/quarentenaMotor.api.test.js` (criar)

**Interfaces:**
- Consumes: `registrarMovimentacao(db, user, params)` — já existente.
- Produces: três tipos aceitos por `registrarMovimentacao`: `QUARENTENA` (`em_inspecao += q`), `LIBERACAO_INSPECAO` (`em_inspecao −= q`), `REPROVACAO_INSPECAO` (`em_inspecao −= q` e `bloqueada += q`). Nenhum altera `quantidade_atual`; todos gravam linha no livro com `saldo_anterior === saldo_posterior`.

- [x] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/quarentenaMotor.api.test.js` no padrão dos outros arquivos de `tests/api/` (runner próprio com `test()`, contador e `process.exit`; veja `reservaConsumo.api.test.js` como modelo):

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`QUAR-${seq}`, `Material quarentena ${seq}`, qtd]);
  return r.lastID;
}
const material = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => stockService.getSaldoDisponivel(await material(db, id));

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('QUARENTENA retem sem mexer no fisico', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 30, justificativa: 'Aguardando inspecao',
    });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 100, 'fisico nao pode mudar');
    assert.strictEqual(m.quantidade_em_inspecao, 30);
    assert.strictEqual(await disponivel(db, mat), 70);
  });

  await test('material em quarentena nao pode sair', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 100, justificativa: 'Aguardando inspecao',
    });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'SAIDA', quantidade: 1, justificativa: 'tentativa',
      }),
      /insuficiente|disponivel|disponível/i,
      'quarentena que nao barra saida e decorativa');
  });

  await test('LIBERACAO_INSPECAO devolve ao disponivel', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 40, justificativa: 'x' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'LIBERACAO_INSPECAO', quantidade: 40, justificativa: 'aprovado' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_atual, 100, 'liberar nao cria material');
    assert.strictEqual(await disponivel(db, mat), 100);
  });

  await test('liberar mais do que esta retido falha e nao muda nada', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 10, justificativa: 'x' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'LIBERACAO_INSPECAO', quantidade: 25, justificativa: 'demais' }),
      /inspe/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'saturou em vez de recusar');
  });

  await test('REPROVACAO_INSPECAO move de em_inspecao para bloqueada num movimento so', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 25, justificativa: 'x' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'REPROVACAO_INSPECAO', quantidade: 25, justificativa: 'fora de medida' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_bloqueada, 25);
    assert.strictEqual(m.quantidade_atual, 100, 'reprovar nao tira o material do galpao');
    assert.strictEqual(await disponivel(db, mat), 75);
  });

  await test('os tres tipos deixam rastro no livro sem alterar o saldo fisico', async () => {
    const mat = await novoMaterial(db, 50);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 5, justificativa: 'x' });
    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'QUARENTENA'`, [mat]);
    assert.ok(mov, 'quarentena tem de existir no livro');
    assert.strictEqual(mov.saldo_anterior, mov.saldo_posterior, 'nao mexe no fisico');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e confirmar que falha pelo motivo certo**

Run: `cd server && node tests/api/quarentenaMotor.api.test.js`
Expected: FAIL com "Tipo de movimento inválido" — os tipos ainda não existem em `TIPOS_MOVIMENTO`. Se falhar por erro de setup (coluna NOT NULL, tabela ausente), conserte o setup e rode de novo até falhar pelo motivo acima.

- [x] **Step 3: Registrar os tipos**

Em `server/services/almoxarifado/schema.js`, `TIPOS_MOVIMENTO`:

```js
const TIPOS_MOVIMENTO = [
  'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'SAIDA_PRODUCAO',
  'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'TRANSFERENCIA', 'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'RETRABALHO',
  // Etapa 5 — quarentena. Simetria de BLOQUEIO/DESBLOQUEIO: mexem em coluna de retencao
  // sem tocar o fisico, porque o material esta no galpao o tempo todo.
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO',
  'ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO', 'ESTORNO',
];
```

- [x] **Step 4: Implementar o efeito no motor**

Em `stockService.js`, logo após o bloco `else if (tipo === 'DESBLOQUEIO')` (linha ~286), acrescente:

```js
  } else if (tipo === 'QUARENTENA') {
    await dbRun(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [quantidade, material_id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'LIBERACAO_INSPECAO' || tipo === 'REPROVACAO_INSPECAO') {
    // Guarda no proprio WHERE, como o resto do motor: liberar/reprovar mais do que esta retido
    // criaria saldo do nada (na liberacao) ou bloqueio sem lastro (na reprovacao). MAX(0,...)
    // saturaria em silencio e esconderia o erro — e o "aprovar duas vezes nao duplica" que a
    // spec 09 cobra sai justamente deste UPDATE nao casar na segunda vez.
    const bloqueiaTambem = tipo === 'REPROVACAO_INSPECAO' ? quantidade : 0;
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) - ?,
          quantidade_bloqueada   = COALESCE(quantidade_bloqueada,0) + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_em_inspecao,0) >= ?
      RETURNING id`, [quantidade, bloqueiaTambem, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade em inspeção insuficiente: ${material.quantidade_em_inspecao || 0}`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior;
  }
```

E inclua os três na lista de tipos que não mexem no físico (linha ~291):

```js
  if (!['TRANSFERENCIA', 'BLOQUEIO', 'DESBLOQUEIO', 'RESERVA', 'LIBERACAO_RESERVA',
        'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO'].includes(tipo)) {
```

- [x] **Step 5: Rodar e confirmar verde**

Run: `cd server && node tests/api/quarentenaMotor.api.test.js`
Expected: PASS, 6 casos.

Depois: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: tudo verde. Se algum teste existente quebrar, **não relaxe a asserção** — entenda por que quebrou e corrija a causa, ou ajuste o teste explicando no comentário o que mudou de propósito.

- [x] **Step 6: Commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/stockService.js server/tests/api/quarentenaMotor.api.test.js
git commit -m "Almoxarifado Etapa 5: motor ganha os tres tipos da quarentena"
```

---

### Task 2: `DESBLOQUEIO` com guarda e justificativa obrigatória no bloqueio

**Files:**
- Modify: `server/services/almoxarifado/stockService.js:283-286` (`DESBLOQUEIO`)
- Modify: `server/services/almoxarifado/movementRules.js:11-21`
- Modify: `server/services/almoxarifado/returnService.js:31`
- Test: `server/tests/api/bloqueioGuardas.api.test.js` (criar)

**Interfaces:**
- Consumes: `registrarMovimentacao` com os tipos da Task 1.
- Produces: `BLOQUEIO`, `DESBLOQUEIO` e `REPROVACAO_INSPECAO` passam a exigir `justificativa`; `DESBLOQUEIO` recusa quantidade acima do bloqueado em vez de saturar.

**Por que:** `DESBLOQUEIO` usa `MAX(0, bloqueada − q)`, que satura em silêncio — desbloquear 100 de um bloqueio de 10 "funciona" e devolve 10 ao disponível sem avisar. É o mesmo defeito que a Etapa 4 corrigiu em `liberarReserva` ("liberar acima do que a reserva segurava roubava o hold de outras reservas"). E bloquear material sem dizer por quê é estorno sem motivo.

- [x] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/bloqueioGuardas.api.test.js` com o mesmo cabeçalho de runner da Task 1 e estes casos:

```js
  await test('BLOQUEIO sem justificativa e recusado', async () => {
    const mat = await novoMaterial(db, 50);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 5 }), /justificativa/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_bloqueada || 0, 0, 'bloqueou mesmo recusando');
  });

  await test('DESBLOQUEIO acima do bloqueado falha em vez de saturar', async () => {
    const mat = await novoMaterial(db, 50);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 10, justificativa: 'peca amassada' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'DESBLOQUEIO', quantidade: 30, justificativa: 'engano' }),
      /bloquead/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_bloqueada, 10, 'saturou e perdeu o bloqueio');
  });

  await test('DESBLOQUEIO no valor exato devolve ao disponivel', async () => {
    const mat = await novoMaterial(db, 50);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 10, justificativa: 'avaria' });
    assert.strictEqual(await disponivel(db, mat), 40);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'DESBLOQUEIO', quantidade: 10, justificativa: 'recuperada' });
    assert.strictEqual(await disponivel(db, mat), 50);
  });

  // REGRESSAO: returnService.js:31 e o unico chamador existente de BLOQUEIO. Ele passava
  // `motivo` e nao `justificativa` — sem o ajuste, a devolucao para quarentena quebra aqui.
  await test('devolucao para quarentena continua bloqueando (regressao returnService)', async () => {
    const returnService = require('../../services/almoxarifado/returnService');
    const mat = await novoMaterial(db, 50);
    await returnService.devolverParaQuarentena(db, ADMIN, { material_id: mat, quantidade: 8 });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_bloqueada, 8);
  });
```

> **Antes de escrever o último caso:** abra `server/services/almoxarifado/returnService.js` e use o nome e a assinatura reais da função que contém o `BLOQUEIO` da linha 31. O nome `devolverParaQuarentena` acima é ilustrativo — se divergir, corrija o teste para a função real, não invente uma nova.

- [x] **Step 2: Rodar e confirmar que falha pelo motivo certo**

Run: `cd server && node tests/api/bloqueioGuardas.api.test.js`
Expected: os dois primeiros falham (bloqueio sem justificativa passa; desbloqueio satura). O de regressão deve **passar** agora — é comportamento existente, e o valor dele aparece no Step 4.

- [x] **Step 3: Implementar as guardas**

Em `movementRules.js`, dentro de `REGRAS_VINCULO`:

```js
  // Etapa 5: tirar material do disponivel sem dizer por que e estorno sem motivo. Vale para o
  // bloqueio avulso, o desbloqueio e a reprovacao de inspecao.
  BLOQUEIO: { vinculo: 'nenhum', justificativa: true },
  DESBLOQUEIO: { vinculo: 'nenhum', justificativa: true },
  REPROVACAO_INSPECAO: { vinculo: 'nenhum', justificativa: true },
```

Em `stockService.js`, substitua o ramo `DESBLOQUEIO`:

```js
  } else if (tipo === 'DESBLOQUEIO') {
    // Guarda no WHERE em vez de MAX(0,...): saturar em silencio devolve ao disponivel menos do
    // que o pedido sem ninguem saber, e foi exatamente o bug corrigido em liberarReserva.
    const claim = await dbGet(db, `UPDATE materiais_almoxarifado
      SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(quantidade_bloqueada,0) >= ?
      RETURNING id`, [quantidade, material_id, quantidade]);
    if (!claim) {
      throw Object.assign(
        new Error(`Quantidade bloqueada insuficiente: ${material.quantidade_bloqueada || 0}`),
        { status: 400 });
    }
    saldoPosterior = saldoAnterior;
```

- [x] **Step 4: Ajustar o chamador existente**

Em `returnService.js:31`, acrescente `justificativa` ao payload (mantendo o `motivo`, que alimenta o livro):

```js
        material_id, tipo: 'BLOQUEIO', quantidade, motivo: 'Devolução para quarentena',
        justificativa: 'Devolução recebida em quarentena para inspeção',
```

- [x] **Step 5: Rodar e confirmar verde**

Run: `cd server && node tests/api/bloqueioGuardas.api.test.js`
Expected: PASS, 4 casos — inclusive o de regressão, que prova que o chamador antigo sobreviveu.

Depois: `cd server && npm run test:api && npm run test:almoxarifado`

- [x] **Step 6: Commit**

```bash
git add server/services/almoxarifado/stockService.js server/services/almoxarifado/movementRules.js server/services/almoxarifado/returnService.js server/tests/api/bloqueioGuardas.api.test.js
git commit -m "Almoxarifado Etapa 5: desbloqueio com guarda e justificativa obrigatoria no bloqueio"
```

---

### Task 3: Entrada retida — material inspecionável entra em quarentena

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js:308-340` (`darEntradaEstoque`)
- Test: `server/tests/api/recebimentoQuarentena.api.test.js` (criar)

**Interfaces:**
- Consumes: `registrarMovimentacao` com `QUARENTENA` (Task 1).
- Produces: item com `material_critico = 1` e config `inspecao_material_critico = '1'` entra no físico e sai do disponível; item comum entra direto no disponível.

**Por que:** hoje `darEntradaEstoque` **recusa** aprovar recebimento com item crítico sem inspeção (linhas 315-322), e pula o item se a inspeção disse `DEVOLVER` (linha 321). Isso inverte: entra sempre, retido quando aplicável. A linha do `DEVOLVER` some daqui — vira decisão da inspeção, na Task 4.

- [x] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/recebimentoQuarentena.api.test.js`. Monte um recebimento com dois itens — um material crítico e um comum — e aprove:

```js
  await test('item critico entra no fisico mas fora do disponivel', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 20);

    await receiptService.aprovarRecebimento(db, ADMIN, recId);

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 20, 'o material esta no galpao, o fisico tem de subir');
    assert.strictEqual(m.quantidade_em_inspecao, 20, 'deveria ter entrado retido');
    assert.strictEqual(await disponivel(db, mat), 0, 'material a inspecionar nao pode estar disponivel');
  });

  await test('aprovar recebimento de item critico NAO exige inspecao previa (mudanca da Etapa 5)', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 5);
    // Antes da Etapa 5 isto lancava "Item critico #N requer inspecao".
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 5);
  });

  await test('item NAO critico entra direto no disponivel (regressao)', async () => {
    const mat = await novoMaterial(db, 0, { critico: false });
    const recId = await recebimentoComItem(db, mat, 12);
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao || 0, 0, 'material comum nao pode ser retido');
    assert.strictEqual(await disponivel(db, mat), 12);
  });

  await test('com a config desligada, material critico entra direto', async () => {
    await setConfig(db, 'inspecao_material_critico', '0');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 7);
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    assert.strictEqual(await disponivel(db, mat), 7);
  });

  await test('a retencao aparece no livro como QUARENTENA vinculada ao recebimento', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 9);
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'QUARENTENA'`, [mat]);
    assert.ok(mov, 'retencao sem rastro no livro');
    assert.strictEqual(mov.recebimento_id, recId);
  });
```

> Escreva os helpers `novoMaterial(db, qtd, { critico })`, `recebimentoComItem(db, materialId, qtd)` e `setConfig` no próprio arquivo. Para o recebimento, insira direto em `recebimentos_material_almoxarifado` e `recebimentos_material_itens_almoxarifado` — inspecione o schema (`schema.js:419-502`) para as colunas `NOT NULL`, e confira o status inicial que `aprovarRecebimento` aceita (não pode ser `PROCESSADO`/`APROVADO`, nem `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO`, que desviam para `processarNota`).

- [x] **Step 2: Rodar e confirmar que falha pelo motivo certo**

Run: `cd server && node tests/api/recebimentoQuarentena.api.test.js`
Expected: o primeiro e o segundo falham com "Item crítico #N requer inspeção" — o gate antigo. O terceiro (regressão do material comum) deve passar.

- [x] **Step 3: Implementar a entrada retida**

Em `receiptService.js`, substitua o bloco `if (item.material_critico) { ... }` (linhas 315-322) e acrescente a retenção após a entrada:

```js
  for (const item of itens) {
    // Etapa 5: a inspecao deixou de ser PRE-REQUISITO da entrada e passou a ser passo posterior.
    // O material esta fisicamente no galpao desde o descarregamento — barrar a entrada fazia o
    // sistema negar o que existe, e o bloqueio da inspecao recaia sobre saldo que ainda nao
    // tinha entrado. Agora entra sempre; o que exige inspecao entra RETIDO.
    const cfg = await getConfig(db, 'inspecao_material_critico');
    const reter = !!item.material_critico && cfg === '1';

    const qtd = item.quantidade_recebida || item.quantidade_esperada;
    if (qtd > 0) {
      await registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'ENTRADA_COMPRA',
        quantidade: qtd,
        motivo: `Recebimento ${rec.numero}`,
        referencia: rec.nota_fiscal,
        recebimento_id: recebimentoId,
        localizacao_destino_id: localizacao_id,
        lote: item.lote,
        documento_vinculado: rec.numero,
      });

      if (reter) {
        await registrarMovimentacao(db, user, {
          material_id: item.material_id,
          tipo: 'QUARENTENA',
          quantidade: qtd,
          motivo: `Retido para inspeção — recebimento ${rec.numero}`,
          justificativa: `Material crítico aguardando inspeção (recebimento ${rec.numero})`,
          recebimento_id: recebimentoId,
        });
      }
    }
  }
```

> Use o helper de config que o arquivo já usa. Se `getConfig` não estiver disponível em `receiptService.js`, siga o padrão da linha 319 original (`SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?`) em vez de importar algo novo.

- [x] **Step 4: Rodar e confirmar verde**

Run: `cd server && node tests/api/recebimentoQuarentena.api.test.js`
Expected: PASS, 5 casos.

Depois: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: verde. **Espere quebra aqui** — algum teste existente pode assertar que aprovar recebimento crítico sem inspeção falha. Se acontecer, esse teste está codificando o comportamento que esta task substitui de propósito: atualize-o com um comentário explicando a mudança, e mantenha nele uma asserção nova provando que agora entra retido.

- [x] **Step 5: Commit**

```bash
git add server/services/almoxarifado/receiptService.js server/tests/api/recebimentoQuarentena.api.test.js
git commit -m "Almoxarifado Etapa 5: material que exige inspecao entra retido em vez de barrar a entrada"
```

---

### Task 4: `inspectionService` — aprovar, reprovar, parcial e encaminhamento

**Files:**
- Create: `server/services/almoxarifado/inspectionService.js`
- Modify: `server/services/almoxarifado/receiptService.js` (remover `inspecionarItem`, linhas ~398-418)
- Modify: `server/services/almoxarifado/schema.js` (colunas novas via `safeAlter`)
- Test: `server/tests/api/inspecaoDecisao.api.test.js` (criar)

**Interfaces:**
- Consumes: `registrarMovimentacao` com `LIBERACAO_INSPECAO` e `REPROVACAO_INSPECAO` (Task 1).
- Produces:
  - `decidirInspecao(db, user, itemId, data) → { id, quantidade_aprovada, quantidade_reprovada }`
    onde `data = { quantidade_aprovada, quantidade_reprovada, encaminhamento?, observacoes?, ...flags }`
  - `bloquearMaterial(db, user, materialId, { quantidade, justificativa }) → { success }`
  - `desbloquearMaterial(db, user, materialId, { quantidade, justificativa }) → { success }`
  - `listarInspecoesPendentes(db, filtros) → linhas com material, recebimento, quantidade retida e data de entrada`

**Por que arquivo novo:** `receiptService.js` tem 511 linhas e já responde pelo workflow fiscal de 4 etapas com 11 status. Recebimento e inspeção mudam por razões diferentes — mesma separação que `reservationService.js` recebeu na Etapa 4.

- [x] **Step 1: Adicionar as colunas**

Em `schema.js`, junto dos outros `safeAlter` de `inspecoes_recebimento_almoxarifado`:

```js
  // Etapa 5 — a decisao da inspecao passa a ter quantidade, porque "aprovar parcialmente" e
  // requisito original (secao 9). `encaminhamento` registra o destino pretendido do material
  // reprovado (requisito "Solicitar devolucao ao fornecedor / analise da Engenharia /
  // substituicao"); a SAIDA em si e da feature 12.
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN quantidade_aprovada REAL');
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN quantidade_reprovada REAL');
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN encaminhamento TEXT');
```

- [x] **Step 2: Escrever o teste que falha**

Crie `server/tests/api/inspecaoDecisao.api.test.js`:

```js
  await test('aprovar tudo move o retido para o disponivel', async () => {
    const { mat, itemId } = await itemRetido(db, 20);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, { quantidade_aprovada: 20, quantidade_reprovada: 0 });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(await disponivel(db, mat), 20);
  });

  await test('aprovar duas vezes nao duplica saldo', async () => {
    const { mat, itemId } = await itemRetido(db, 20);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, { quantidade_aprovada: 20, quantidade_reprovada: 0 });
    await assert.rejects(() => inspectionService.decidirInspecao(db, ADMIN, itemId,
      { quantidade_aprovada: 20, quantidade_reprovada: 0 }), /inspe|decid/i);
    assert.strictEqual(await disponivel(db, mat), 20, 'a segunda aprovacao criou saldo do nada');
  });

  await test('reprovar move o retido para bloqueado, sem tirar do galpao', async () => {
    const { mat, itemId } = await itemRetido(db, 20);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 0, quantidade_reprovada: 20, observacoes: 'fora de medida' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_bloqueada, 20);
    assert.strictEqual(m.quantidade_atual, 20);
    assert.strictEqual(await disponivel(db, mat), 0);
  });

  await test('aprovacao parcial divide entre disponivel e bloqueado', async () => {
    const { mat, itemId } = await itemRetido(db, 100);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 90, quantidade_reprovada: 10, observacoes: '10 amassadas' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0, 'sobrou saldo preso em quarentena');
    assert.strictEqual(m.quantidade_bloqueada, 10);
    assert.strictEqual(await disponivel(db, mat), 90);
  });

  await test('aprovado + reprovado tem de fechar com o retido', async () => {
    const { mat, itemId } = await itemRetido(db, 100);
    await assert.rejects(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 50, quantidade_reprovada: 10 }), /confer|fecha|retid/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 100, 'mexeu no saldo apesar de recusar');
  });

  await test('reprovar registra o encaminhamento pretendido', async () => {
    const { itemId } = await itemRetido(db, 10);
    const r = await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 0, quantidade_reprovada: 10, encaminhamento: 'DEVOLVER' });
    const insp = await dbGet(db, 'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(insp.encaminhamento, 'DEVOLVER');
    assert.strictEqual(insp.quantidade_reprovada, 10);
  });

  await test('encaminhamento invalido e recusado', async () => {
    const { itemId } = await itemRetido(db, 10);
    await assert.rejects(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 0, quantidade_reprovada: 10, encaminhamento: 'SUMIR_COM_ELE' }),
      /encaminhamento/i);
  });

  await test('bloqueio avulso tira do disponivel e deixa rastro', async () => {
    const mat = await novoMaterial(db, 50);
    await inspectionService.bloquearMaterial(db, ADMIN, mat, { quantidade: 8, justificativa: 'avaria na prateleira' });
    assert.strictEqual(await disponivel(db, mat), 42);
    const mov = await dbGet(db, `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO'`, [mat]);
    assert.ok(mov, 'bloqueio avulso sem movimentacao no livro');
  });

  await test('desbloqueio avulso devolve ao disponivel', async () => {
    const mat = await novoMaterial(db, 50);
    await inspectionService.bloquearMaterial(db, ADMIN, mat, { quantidade: 8, justificativa: 'avaria' });
    await inspectionService.desbloquearMaterial(db, ADMIN, mat, { quantidade: 8, justificativa: 'recuperada' });
    assert.strictEqual(await disponivel(db, mat), 50);
  });

  await test('a fila de pendentes lista o que esta retido', async () => {
    const { mat } = await itemRetido(db, 15);
    const fila = await inspectionService.listarInspecoesPendentes(db, {});
    assert.ok(fila.some((l) => l.material_id === mat), 'item retido fora da fila');
  });
```

> `itemRetido(db, qtd)` deve criar material crítico, recebimento com item e aprovar o recebimento (reaproveitando o caminho da Task 3), devolvendo `{ mat, itemId, recId }`. Assim o teste exercita o fluxo real em vez de fabricar `quantidade_em_inspecao` na mão.

- [x] **Step 3: Rodar e confirmar que falha**

Run: `cd server && node tests/api/inspecaoDecisao.api.test.js`
Expected: FAIL com "Cannot find module '../../services/almoxarifado/inspectionService'".

- [x] **Step 4: Implementar o serviço**

Crie `server/services/almoxarifado/inspectionService.js`. Pontos obrigatórios:

```js
const ENCAMINHAMENTOS = ['DEVOLVER', 'ANALISE_ENGENHARIA', 'SUBSTITUICAO'];

async function decidirInspecao(db, user, itemId, data = {}) {
  const item = await dbGet(db, `SELECT ri.*, m.material_critico
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id WHERE ri.id = ?`, [itemId]);
  if (!item) throw Object.assign(new Error('Item não encontrado'), { status: 404 });

  const aprovada = Number(data.quantidade_aprovada || 0);
  const reprovada = Number(data.quantidade_reprovada || 0);
  const retido = item.quantidade_recebida || item.quantidade_esperada || 0;

  // Fechar a conta e obrigatorio: se aprovado + reprovado for menor que o retido, sobra saldo
  // presoem quarentena que ninguem mais vai olhar — a reserva zumbi da Etapa 4 em outra roupa.
  if (aprovada + reprovada !== retido) {
    throw Object.assign(
      new Error(`Aprovado + reprovado (${aprovada + reprovada}) tem de fechar com o retido (${retido})`),
      { status: 400 });
  }
  if (data.encaminhamento && !ENCAMINHAMENTOS.includes(data.encaminhamento)) {
    throw Object.assign(new Error(`Encaminhamento inválido: ${data.encaminhamento}`), { status: 400 });
  }

  const ins = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
    (recebimento_item_id, conforme, divergencia_quantidade, divergencia_dimensional,
     certificado_ausente, dano_fisico, material_incorreto, acao, responsavel_id, responsavel_nome,
     observacoes, quantidade_aprovada, quantidade_reprovada, encaminhamento)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    itemId,
    reprovada === 0 ? 1 : 0,
    data.divergencia_quantidade ? 1 : 0, data.divergencia_dimensional ? 1 : 0,
    data.certificado_ausente ? 1 : 0, data.dano_fisico ? 1 : 0, data.material_incorreto ? 1 : 0,
    data.acao || null, user.id, user.nome || user.email, data.observacoes || null,
    aprovada, reprovada, data.encaminhamento || null,
  ]);
  const inspecaoId = ins.lastID;

  if (aprovada > 0) {
    await registrarMovimentacao(db, user, {
      material_id: item.material_id, tipo: 'LIBERACAO_INSPECAO', quantidade: aprovada,
      motivo: 'Inspeção aprovada', justificativa: data.observacoes || 'Inspeção aprovada',
      recebimento_id: item.recebimento_id,
    });
  }
  if (reprovada > 0) {
    await registrarMovimentacao(db, user, {
      material_id: item.material_id, tipo: 'REPROVACAO_INSPECAO', quantidade: reprovada,
      motivo: 'Inspeção reprovada',
      justificativa: data.observacoes || `Inspeção reprovada${data.encaminhamento ? ` — ${data.encaminhamento}` : ''}`,
      recebimento_id: item.recebimento_id,
    });
  }
  return { id: inspecaoId, quantidade_aprovada: aprovada, quantidade_reprovada: reprovada };
}
```

A guarda contra decidir duas vezes vem do motor: na segunda chamada `quantidade_em_inspecao` já é 0 e o `UPDATE` condicional da Task 1 não casa. **Não** adicione uma flag `ja_decidido` — seria uma segunda fonte de verdade que pode divergir do saldo real.

`bloquearMaterial` e `desbloquearMaterial` são casca fina sobre `registrarMovimentacao` com `BLOQUEIO`/`DESBLOQUEIO`, exigindo `justificativa` (a Task 2 já obriga no motor; valide antes para devolver 400 com mensagem clara).

- [x] **Step 5: Remover `inspecionarItem` do `receiptService`**

Apague a função (linhas ~398-418), **inclusive** o `UPDATE` direto que somava `bloqueada` e `em_inspecao` — é o defeito central que a etapa fecha. Ajuste a rota da Task 5 para o serviço novo. Confira que nada mais importa `inspecionarItem`:

```bash
grep -rn "inspecionarItem" server/ client/src --include=*.js | grep -v node_modules
```

- [x] **Step 6: Rodar e confirmar verde**

Run: `cd server && node tests/api/inspecaoDecisao.api.test.js`
Expected: PASS, 10 casos. Depois as suítes todas.

- [x] **Step 7: Commit**

```bash
git add server/services/almoxarifado/inspectionService.js server/services/almoxarifado/receiptService.js server/services/almoxarifado/schema.js server/tests/api/inspecaoDecisao.api.test.js
git commit -m "Almoxarifado Etapa 5: inspectionService decide a inspecao pelo motor"
```

---

### Task 5: Rotas de inspeção e bloqueio avulso

**Files:**
- Modify: `server/routes/almoxarifado/extended.js` (rota `inspecionar` na linha ~450; acrescentar as novas ao lado)
- Test: `server/tests/api/inspecaoRotas.api.test.js` (criar)

**Interfaces:**
- Consumes: `inspectionService` (Task 4).
- Produces:
  - `GET /api/almoxarifado/inspecoes/pendentes` (auth)
  - `POST /api/almoxarifado/recebimentos/itens/:itemId/inspecionar` (`inspecionar`) — passa a chamar `decidirInspecao`
  - `POST /api/almoxarifado/materiais/:id/bloquear` (`ajustar_estoque`)
  - `POST /api/almoxarifado/materiais/:id/desbloquear` (`ajustar_estoque`)

- [x] **Step 1: Escrever o teste que falha**

Use `createTestApp` + `supertest`, como `reservaTransferenciaExpiracao.api.test.js`.

> **Cada arquivo de teste desta base é autocontido** — runner próprio, sem `beforeEach` compartilhado e sem helpers importados de outro arquivo de teste. Então **copie** `novoMaterial`, `material`, `disponivel` e `itemRetido` para dentro deste arquivo em vez de importá-los das Tasks 1 e 4. É duplicação deliberada: o runner do projeto descobre `tests/api/*.api.test.js` e roda cada um em processo próprio.

```js
  const PRODUCAO = { id: 77, nome: 'Chao de Fabrica', role: 'user', email: 'prod@test.com' };

  await test('POST inspecionar sem permissao retorna 403 e nao mexe no saldo', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    setUser(PRODUCAO);
    try {
      const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
        .send({ quantidade_aprovada: 10, quantidade_reprovada: 0 });
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    } finally { setUser(ADMIN); }
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'liberou apesar do 403');
  });

  await test('POST inspecionar aprova e o disponivel sobe', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 10, quantidade_reprovada: 0 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 10);
  });

  await test('POST inspecionar com conta que nao fecha retorna 400', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    const res = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 4, quantidade_reprovada: 2 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'mexeu no saldo apesar do 400');
  });

  await test('POST bloquear sem justificativa retorna 400', async () => {
    const mat = await novoMaterial(db, 50);
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 50);
  });

  await test('POST bloquear com justificativa tira do disponivel', async () => {
    const mat = await novoMaterial(db, 50);
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria na prateleira' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 45);
  });

  await test('POST desbloquear acima do bloqueado retorna 400', async () => {
    const mat = await novoMaterial(db, 50);
    await request(app).post(`/api/almoxarifado/materiais/${mat}/bloquear`)
      .send({ quantidade: 5, justificativa: 'avaria' });
    const res = await request(app).post(`/api/almoxarifado/materiais/${mat}/desbloquear`)
      .send({ quantidade: 40, justificativa: 'engano' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 45, 'saturou e devolveu saldo errado');
  });

  await test('GET inspecoes/pendentes lista o retido com material e recebimento', async () => {
    const { mat, recId } = await itemRetido(db, 15);
    const res = await request(app).get('/api/almoxarifado/inspecoes/pendentes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linha = res.body.find((l) => l.material_id === mat);
    assert.ok(linha, 'item retido fora da fila');
    assert.strictEqual(linha.recebimento_id, recId);
  });
```

> O harness roda o `requirePermission` **real**: `setUser` com usuário sem perfil retorna 403 (o fallback de perfil é `PRODUCAO`, que não tem `inspecionar`). Siga o padrão de `permissoesRotas.api.test.js`.

- [x] **Step 2: Rodar e confirmar que falha** — `cd server && node tests/api/inspecaoRotas.api.test.js` → 404 nas rotas novas.

- [x] **Step 3: Implementar as rotas** em `extended.js`, ao lado da rota de inspecionar existente, seguindo o padrão do arquivo (`auth`, `requirePermission`, `handleError`):

```js
  app.get('/api/almoxarifado/inspecoes/pendentes', auth, async (req, res) => {
    try { res.json(await inspectionService.listarInspecoesPendentes(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/materiais/:id/bloquear', auth, requirePermission('ajustar_estoque'), async (req, res) => {
    try { res.json(await inspectionService.bloquearMaterial(db, req.user, req.params.id, req.body)); }
    catch (e) { handleError(res, e); }
  });
```

E troque o corpo da rota `inspecionar` para `inspectionService.decidirInspecao`.

- [x] **Step 4: Verde + suítes completas.**
- [x] **Step 5: Commit** — `"Almoxarifado Etapa 5: rotas de inspecao e bloqueio avulso"`

---

### Task 6: Tela da fila de inspeções e bloqueio no material

**Files:**
- Create: `client/src/components/almoxarifado/InspecoesAlmoxarifado.js`
- Create: `client/src/components/almoxarifado/InspecoesAlmoxarifado.test.js`
- Modify: `client/src/routes/lazyModules.js`, `client/src/App.js`, `client/src/components/Layout.js`

**Interfaces:**
- Consumes: as rotas da Task 5.
- Produces: rota `/almoxarifado/inspecoes` e entrada "Inspeções" no menu do módulo.

**Padrões obrigatórios** (copie de `ReservasAlmoxarifado.js`, que é a tela mais recente e mais próxima):
- `useAlmoxPermissoes` com `bloquearSeNaoPode('inspecionar', e)`; botão visível, toast no clique.
- Classes `almox-page`, `almox-header`, `almox-filters`, `almox-table`, `almox-modal-*`, `btn-almox-primary`.
- `SkeletonTable` no carregamento, `almox-empty` na lista vazia.

- [x] **Step 1: Escrever o teste que falha** — `InspecoesAlmoxarifado.test.js`, no padrão de `ReservasAlmoxarifado.test.js` (mock de `services/api`, de `react-toastify` e do hook de permissões). Cubra as regras, não o layout:

```js
const PENDENTE = {
  item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', quantidade_retida: 100, recebimento_id: 55,
  recebimento_numero: 'REC-55', data_entrada: '2026-08-08T10:00:00Z',
};

// api.get('/almoxarifado/inspecoes/pendentes') devolve [PENDENTE] no beforeEach.

test('mostra a quantidade retida', async () => {
  await renderizar();
  expect(linhas()[0].textContent).toContain('100 PC');
});

test('aprovado + reprovado que não fecha com o retido não chama a API', async () => {
  await renderizar();
  await abrirDecisao(0);
  preencher(campoPorLabel('Quantidade aprovada'), '50');
  preencher(campoPorLabel('Quantidade reprovada'), '10');   // 60 ≠ 100
  await clicarBotaoModal('Salvar');
  // Deixar passar mandaria 40 unidades para o limbo: saem da fila e ficam retidas para sempre.
  expect(api.post).not.toHaveBeenCalled();
});

test('a conta fechando envia aprovado e reprovado', async () => {
  await renderizar();
  await abrirDecisao(0);
  preencher(campoPorLabel('Quantidade aprovada'), '90');
  preencher(campoPorLabel('Quantidade reprovada'), '10');
  preencher(campoPorLabel('Observações'), '10 amassadas');
  await clicarBotaoModal('Salvar');
  expect(api.post).toHaveBeenCalledWith(
    '/almoxarifado/recebimentos/itens/1/inspecionar',
    expect.objectContaining({ quantidade_aprovada: 90, quantidade_reprovada: 10 }));
});

test('reprovar sem observação não chama a API', async () => {
  await renderizar();
  await abrirDecisao(0);
  preencher(campoPorLabel('Quantidade aprovada'), '0');
  preencher(campoPorLabel('Quantidade reprovada'), '100');
  await clicarBotaoModal('Salvar');
  expect(api.post).not.toHaveBeenCalled();
});

test('encaminhamento só aparece quando há quantidade reprovada', async () => {
  await renderizar();
  await abrirDecisao(0);
  preencher(campoPorLabel('Quantidade aprovada'), '100');
  preencher(campoPorLabel('Quantidade reprovada'), '0');
  expect(campoPorLabelOuNull('Encaminhamento')).toBeNull();
  preencher(campoPorLabel('Quantidade reprovada'), '5');
  expect(campoPorLabelOuNull('Encaminhamento')).not.toBeNull();
});
```

> `renderizar`, `linhas`, `campoPorLabel`, `preencher` e `clicarBotaoModal` são os mesmos helpers de `ReservasAlmoxarifado.test.js` — copie-os. `campoPorLabelOuNull` é a variante que devolve `null` em vez de estourar quando o campo não existe.

- [x] **Step 2: Rodar e ver falhar** — `cd client && CI=true npx react-scripts test src/components/almoxarifado/InspecoesAlmoxarifado --watchAll=false`
- [x] **Step 3: Implementar a tela e ligar rota + menu** (o menu usa `FiCheckSquare` ou outro ícone já importado em `Layout.js`; se importar um novo, acrescente à lista do `react-icons/fi`).
- [x] **Step 4: Verde + `CI=true npx react-scripts build`** (CI=true faz warning virar erro).
- [x] **Step 5: Controle positivo** — mute uma das regras (ex.: deixe passar quando aprovado + reprovado não fecha) e confirme que o teste correspondente acusa. Restaure.
- [x] **Step 6: Commit** — `"Almoxarifado Etapa 5: tela da fila de inspecoes e bloqueio de material"`

---

### Task 7: Documentação (obrigatória antes de dizer que acabou)

**Files:**
- Modify: `specs/modulo-almoxarifado/08-recebimento/README.md`
- Modify: `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md`
- Modify: `specs/modulo-almoxarifado/README.md`
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md`
- Modify: `docs/superpowers/plans/2026-08-08-almoxarifado-etapa5-quarentena.md` (este arquivo)

- [x] **Step 1: Specs 08 e 09** — status no topo, checklist marcado item por item com o hash do commit correspondente, e o que ficou de fora **com o motivo**. Corrija qualquer afirmação que a implementação provou errada, dizendo que estava errada — não apague em silêncio. Feito: `specs/modulo-almoxarifado/08-recebimento/README.md` e `specs/modulo-almoxarifado/09-inspecao-qualidade/README.md` reescritos com hash por item; correção registrada na spec 09 ("entrada inspecionável nasce em_inspecao" não era verdade antes desta etapa — o gate antigo recusava a entrada em vez de reter); `controle_qualidade` reverificada como ainda órfã (grep confirmado, nenhum INSERT/UPDATE em todo o repositório).
- [x] **Step 2: Registrar a pendência criada** na spec 09: material reprovado fica bloqueado até desbloqueio + baixa manual, sem vínculo ao recebimento de origem; o `encaminhamento` é o que permitirá à feature 12 montar a fila. Feito em seção própria "Pendência criada por esta etapa" da spec 09, mais as três limitações verificadas em código (backfill ambíguo, split perdido no livro, estorno não reverte os tipos novos).
- [x] **Step 3: Planejamento mestre** — linhas das features 08 e 09 no mapa de status. Feito em `specs/modulo-almoxarifado/README.md`.
- [x] **Step 4: Guia do usuário** — seção da Etapa 5 em linguagem de usuário, tabela "Antes → Agora", roteiro de teste manual clicável, e o cabeçalho "onde o desenvolvimento parou". **Destaque a mudança visível:** aprovar recebimento de material crítico deixou de exigir inspeção prévia — o material entra e fica retido. Feito em `docs/almoxarifado-guia-etapas-e-testes.md`: seção "Etapa 5" completa com roteiro de 13 passos (A a E), tabela consolidada atualizada, pendências e "o que não cobre" no rodapé.
- [x] **Step 5: Este plano** — tasks marcadas, e a próxima etapa apontada. Ver abaixo.
- [x] **Step 6: Commit** — `"Almoxarifado: documentacao da Etapa 5"`

**Próxima etapa: Etapa 6 — Lotes e Séries** (`10-lotes-series-etiquetas`, ver
`specs/modulo-almoxarifado/README.md`). Ainda não tem plano detalhado nesta pasta. Contrato que ela
herda desta etapa: `recebimentos_material_itens_almoxarifado.quantidade_em_inspecao` (por item,
não pelo pool do material) é o padrão a seguir se lote precisar de retenção por item também;
`cancelarMovimentacao` continua sem saber estornar `QUARENTENA`/`LIBERACAO_INSPECAO`/
`REPROVACAO_INSPECAO`/`DECISAO_INSPECAO` — vale conferir se a Etapa 6 esbarra nisso antes de
assumir que estornar qualquer movimentação é seguro.

---

## Verificação final

- [x] `cd server && npm run test:api` — todos os arquivos OK
- [x] `cd server && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`
- [x] `cd client && CI=true npx react-scripts test --watchAll=false`
- [x] `cd client && CI=true npx react-scripts build`
- [x] Nenhum teste passou de primeira sem controle positivo — confirmado nos commits `91184ca` (3 rodadas de controle positivo na Task 4) e `dcee909` (controle positivo na Task 6, com correção do próprio controle antes de restaurar)
- [x] `git status` limpo fora dos artefatos de runtime conhecidos
