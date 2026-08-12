# Almoxarifado Etapa 7 — Transferências e Devoluções: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar tela e regra às duas rotas que só existiam por API — transferência passa a exigir lote e a estar declarada em `REGRAS_VINCULO`; devolução passa a citar a saída original (com validação de quantidade e herança de lote) e a ter tela dedicada; e o **bug do SUCATA** (baixa dupla de estoque) é corrigido em commit próprio, antes de tudo.

**Architecture:** backend primeiro, em camadas que já existem — `movementRules.js` (declaração de vínculo), `stockService.js` (alcance da guarda de `exigeLote`), `returnService.js` (orquestração por destino, validação do vínculo, herança de lote e série) —, mais 2 colunas via `safeAlter` e 1 rota de leitura agregada (`GET /devolucoes/saidas-elegiveis`). Só então o cliente: `TRANSFERENCIA` entra no formulário de Movimentações (que já tem origem, destino e seletor de lote), `DEVOLUCAO` sai dele, e nasce a tela `/almoxarifado/devolucoes`. Design aprovado: `docs/superpowers/specs/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes-design.md` (11 decisões numeradas).

**Tech Stack:** Express + SQLite (`server/`), testes de API com runner próprio por arquivo (`supertest` + `createTestApp`); React CRA (`client/`) com testes `createRoot`/`act`/`MemoryRouter` e mocks de `api`/`react-toastify`/`useAlmoxPermissoes` (sem @testing-library).

## Global Constraints

- **`exigeLote`/`exigeSerie` vivem SEMPRE no 4º argumento de `registrarMovimentacao`, nunca no body.** A rota repassa `req.body` inteiro como `params`; ler a exigência de lá deixaria o cliente desligá-la mandando `exigeLote: false` no JSON. Há teste que trava isso: `server/tests/api/loteControleObrigatorio.api.test.js`.
- **Almoxarifado é área física, não filial** (regra do `CLAUDE.md`): saldo global por material é correto e intencional. Não segregar saldo por almoxarifado.
- **"Em trânsito" foi CORTADO** (decisão 1): a transferência continua atômica origem→destino. Não implementar máquina de estados.
- **Transferência NÃO checa status nem vencimento do lote** (decisão 8) — a guarda de status fica só na saída. Isto é intenção, com teste que a fixa.
- **Série na transferência: fora do escopo** (decisão 9). **Série no descarte de devolução: fora do escopo** (decisão 10) — devolução com série cobre destino `ESTOQUE`/`QUARENTENA` apenas.
- **A sugestão condição→destino vive só na tela** (decisão 6): o backend aceita qualquer combinação.
- Flags de material comparadas com `=== 1` no cliente (padrão do módulo). CRA `CI=true`: warning = erro. Toasts, não `alert`.
- Commits em **português, corpo sem acento**, explicando o **porquê** (qual era o bug, qual a consequência, o que foi decidido e descartado); um commit por assunto; **sem `git add -A`** — listar os arquivos. Todo commit termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Teste que passa de primeira exige **controle positivo** (regra da casa; já enganou três vezes nesta base).
- Gates de servidor: `cd server && npm run test:api` · `npm run test:almoxarifado` · `npm run test:validation` · `npm run test:safealter` · `npm run test:sqlite`. Um arquivo só: `cd server && node tests/api/<arquivo>.api.test.js`.
- Gates de cliente: `cd client && CI=true npx react-scripts test --watchAll=false` e `cd client && CI=true npx react-scripts build`.

## Armadilhas que este plano nomeia de propósito

1. **`TRANSFERENCIA` não está em `tiposEntrada` nem em `tiposSaida`** (`stockService.js`: é um ramo próprio, ~linhas 595 e 654). A guarda de `exigeLote` (~linha 552) só dispara para esses dois conjuntos. **Declarar `exigeLote: true` na rota não basta** — é preciso estender a condição do `if`. Quem não notar vai ver o teste passar sem lote e concluir errado que funcionou. Por isso a Task 2 manda **rodar o teste e VER FALHAR** antes de tocar em `stockService`.
2. **O destino `SUCATA` passa a fazer entrada e depois saída.** Se o lote herdado estiver `BLOQUEADO`/`REPROVADO`, a **entrada passa e a saída falha**, deixando estado parcial (o material entrou e não saiu). A guarda de status está no ramo `tiposSaida` (`loteResolvido.status !== 'ATIVO'`); `tiposDescarte` isenta só o **vencimento**, não o status. Por isso a Task 3 **pré-valida o status do lote antes da entrada** quando `destino === 'SUCATA'`.
3. **`exigeSerie` não dispara para `TRANSFERENCIA`** pela mesma razão do item 1 (`serieObrigatoria` exige `tiposEntrada || tiposSaida`). É o que torna a decisão 9 verdadeira **de graça** — a Task 2 tem teste que confirma e registra isso, e a mudança do `if` do `exigeLote` **não** pode ser copiada para o `serieObrigatoria`.
4. **`TRANSFERENCIA` já é aceita pelo `MovimentacaoSchema`** da rota v2 (`schemas.js`: `TIPOS_MOVIMENTO_ROTA` filtra só `ESTORNO` e os tipos de retenção). Nenhuma mudança de schema é necessária para o formulário postar em `/movimentacoes/v2`. Mas `POST /transferencias` **também** tem de declarar `exigeLote: true`, senão vira um bypass da guarda.
5. **Dois testes existentes vão quebrar de propósito** — achado deste plano, não erro de quem implementa:
   - `tests/api/loteControleObrigatorio.api.test.js`, `[devolucao] SUCATA em material com controle_lote passa SEM lote`: hoje afirma saldo `7` depois da devolução; com a correção do bug (Task 1) o saldo fecha em `10`. **A Task 1 corrige essa asserção.**
   - os **dois** testes de devolução do mesmo arquivo (`ENTRADA_DEVOLUCAO ... passa SEM lote` e `SUCATA ... passa SEM lote`) afirmam a **isenção** de `exigeLote`. A Task 3 declara `exigeLote: true` na devolução (a spec manda: "a entrada de devolução passa a declarar `exigeLote: true` honestamente, saindo da lista de fluxos internos isentos da spec 10"). **A Task 3 move os dois do "lado 2: isentos" para o "lado 1: exige".**
6. **`series_almoxarifado` já tem `movimentacao_saida_id`** (Etapa 6b) e `seriesService.entradaSeries` reativa série `ENTREGUE`/`SUCATEADA`/`ESTORNADA` para `EM_ESTOQUE` com guarda no `WHERE`. A rota `saidas-elegiveis` e a Task 5 se apoiam nisso — é **query**, não estrutura nova.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `server/services/almoxarifado/returnService.js` | coração da etapa: SUCATA entra+sai, `referencia` em todos os destinos, validação do vínculo, herança de lote, série, `listarSaidasElegiveis` |
| `server/services/almoxarifado/movementRules.js` | `TRANSFERENCIA: { vinculo: 'nenhum' }` |
| `server/services/almoxarifado/stockService.js` | guarda de `exigeLote` passa a alcançar o ramo `TRANSFERENCIA` |
| `server/services/almoxarifado/schema.js` | `safeAlter` de `movimentacao_saida_id` e `lote_id` em `devolucoes_material_almoxarifado` |
| `server/routes/almoxarifado/extended.js` | `POST /transferencias` com `{ exigeLote: true }`; `GET /devolucoes/saidas-elegiveis` |
| `server/tests/api/devolucaoDestinos.api.test.js` | **novo** (Task 1) — o bug do SUCATA, com controle positivo |
| `server/tests/api/transferenciaRegras.api.test.js` | **novo** (Task 2) |
| `server/tests/api/devolucaoVinculo.api.test.js` | **novo** (Tasks 3-5) |
| `server/tests/api/loteControleObrigatorio.api.test.js` | corrigido em T1 (saldo) e T3 (isenção vira exigência) |
| `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` + `.test.js` | ganha `TRANSFERENCIA`, perde `DEVOLUCAO` do formulário |
| `client/src/components/almoxarifado/DevolucoesAlmoxarifado.js` + `.test.js` | **novos** — tela dedicada |
| `client/src/App.js`, `client/src/components/Layout.js` | rota e item de menu |
| specs 10/11/12 + README mestre + guia + este plano | Task 8 |

---

### Task 1: o bug do SUCATA — devolução para sucata baixava o estoque duas vezes

**Files:**
- Modify: `server/services/almoxarifado/returnService.js` (bloco de movimentação por destino, linhas 22-44)
- Modify: `server/tests/api/loteControleObrigatorio.api.test.js` (asserção do teste `[devolucao] SUCATA em material com controle_lote passa SEM lote`, linhas 160-169)
- Test: `server/tests/api/devolucaoDestinos.api.test.js` (**novo**)

**Interfaces:**
- Produces: `returnService.registrarDevolucao(db, user, data)` continua com a mesma assinatura e o mesmo retorno `{ id }`. Muda o **efeito**: destino `SUCATA` emite duas movimentações (`ENTRADA_DEVOLUCAO` e depois `SUCATA`) em vez de uma; **todos** os destinos gravam `referencia: 'DEV-<id>'` em cada movimentação que emitem.
- Consumes: `stockService.registrarMovimentacao` (existente, 4 argumentos).

> **Por que esta task vem primeiro e sozinha:** é conserto de bug com causa e consequência próprias
> (decisão da spec). Misturar com as features da etapa tornaria impossível reverter só o conserto —
> ou só a feature — se algum deles der problema em produção.

- [x] **Step 1: escrever o teste que falha** — `server/tests/api/devolucaoDestinos.api.test.js`:

```js
/**
 * Etapa 7, Task 1 — o bug do SUCATA na devolucao.
 *
 * Devolver material para sucata baixava o estoque DUAS vezes: o material ja tinha saido na
 * entrega, e o returnService emitia um SUCATA (tipo de saida para o motor), que descontava de
 * novo um saldo que nunca voltou. Nenhum teste existente pegava isso — a leitura do codigo nao
 * mostrava o problema, so a execucao.
 *
 * Correcao adotada: destino SUCATA emite ENTRADA_DEVOLUCAO seguida de SUCATA (entra e sai). O
 * saldo fecha certo e o livro conta as duas coisas: voltou, e foi sucateada. A alternativa
 * descartada era nao movimentar nada no destino SUCATA — o saldo tambem ficaria certo, mas a
 * sucata sumiria do livro, e a feature 15 (retalhos e sucatas) vai precisar dela la.
 *
 * CONTROLE POSITIVO OBRIGATORIO: o teste 'devolucao para ESTOQUE soma ao saldo' existe para
 * provar que esta medicao SABE falhar. Teste de saldo que passa de primeira nesta base ja
 * enganou tres vezes.
 *
 * Executar: cd server && node tests/api/devolucaoDestinos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, qtd = 0) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',?,1,0)`, [`DEVD-${seq}`, `Material devolucao ${seq}`, qtd]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const movimentosDoMaterial = (db, id) => dbAll(db,
  'SELECT tipo, quantidade, referencia FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [id]);

async function entregar(db, materialId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: qtd, justificativa: 'entrega para a producao' });
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // A sonda exata do design: 100 -> saida 10 -> 90 -> devolucao 3 para SUCATA -> tem de continuar
  // 90 (o material ja tinha saido; a sucata nao pode descontar de novo).
  await test('devolucao para SUCATA nao baixa estoque duas vezes', async () => {
    const mat = await novoMaterial(db, 100);
    await entregar(db, mat, 10);
    assert.strictEqual(await totalDoMaterial(db, mat), 90, 'setup errado: a saida nao baixou 10');

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'DANIFICADO', destino: 'SUCATA' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90,
      'o estoque foi baixado duas vezes: a entrega ja tinha descontado, e o SUCATA descontou de novo');
  });

  // CONTROLE POSITIVO: se a medicao acima estivesse cega (por exemplo lendo a coluna errada ou
  // um material que nunca se move), este teste passaria igual. Ele so passa se o numero mudar.
  await test('[controle positivo] devolucao para ESTOQUE soma ao saldo', async () => {
    const mat = await novoMaterial(db, 100);
    await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 92,
      'a devolucao ao estoque nao somou — a medicao deste arquivo esta cega');
  });

  await test('devolucao para SUCATA registra ENTRADA_DEVOLUCAO e SUCATA no livro', async () => {
    const mat = await novoMaterial(db, 50);
    await entregar(db, mat, 5);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'DANIFICADO', destino: 'SUCATA' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const movs = await movimentosDoMaterial(db, mat);
    const tipos = movs.map((m) => m.tipo);
    assert.deepStrictEqual(tipos, ['SAIDA', 'ENTRADA_DEVOLUCAO', 'SUCATA'],
      `a sucata precisa aparecer no livro como entrada seguida de saida, veio ${tipos.join(',')}`);
  });

  // Sem `referencia`, a devolucao que virou sucata fica sem NENHUM fio ligando o lancamento do
  // livro ao registro da devolucao. Ate esta task so ESTOQUE/QUARENTENA gravavam.
  await test('todos os destinos gravam referencia DEV-<id> nas movimentacoes que emitem', async () => {
    for (const destino of ['ESTOQUE', 'QUARENTENA', 'SUCATA', 'RETRABALHO']) {
      const mat = await novoMaterial(db, 50);
      await entregar(db, mat, 5);
      const res = await request(app).post('/api/almoxarifado/devolucoes')
        .send({ material_id: mat, quantidade: 5, motivo: 'DANIFICADO', destino });
      assert.strictEqual(res.status, 201, `${destino}: ${JSON.stringify(res.body)}`);

      const movs = (await movimentosDoMaterial(db, mat)).filter((m) => m.tipo !== 'SAIDA');
      assert.ok(movs.length > 0, `${destino} nao emitiu movimentacao nenhuma`);
      for (const m of movs) {
        assert.strictEqual(m.referencia, `DEV-${res.body.id}`,
          `${destino}/${m.tipo}: referencia veio ${m.referencia}, esperava DEV-${res.body.id}`);
      }
    }
  });

  // Regressao: RETRABALHO ja estava correto (tipo neutro ao saldo desde a Etapa 6). Se alguem
  // "consertar" o RETRABALHO junto com o SUCATA, este teste pega.
  await test('devolucao para RETRABALHO continua neutra ao saldo', async () => {
    const mat = await novoMaterial(db, 50);
    await entregar(db, mat, 5);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'RECUPERAVEL', destino: 'RETRABALHO' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 45, 'RETRABALHO mexeu no saldo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: rodar e VER FALHAR**

Run: `cd server && node tests/api/devolucaoDestinos.api.test.js`
Expected: **3 falhas** — `devolucao para SUCATA nao baixa estoque duas vezes` (saldo 87, esperado 90), `devolucao para SUCATA registra ENTRADA_DEVOLUCAO e SUCATA no livro` (veio `SAIDA,SUCATA`) e `todos os destinos gravam referencia DEV-<id>` (SUCATA e RETRABALHO com `referencia` nula). Os dois de controle (`ESTOQUE` soma, `RETRABALHO` neutro) **passam desde já** — é exatamente o que os torna controle: eles provam que o arquivo sabe medir.

- [x] **Step 3: implementar** — substituir o bloco de destinos em `server/services/almoxarifado/returnService.js` (linhas 22-44) por:

```js
  // `referencia` em TODAS as movimentacoes de TODOS os destinos (Etapa 7, Task 1). Ate aqui so
  // ESTOQUE/QUARENTENA gravavam: a devolucao que virava sucata ficava sem nenhum fio ligando o
  // lancamento do livro ao registro da devolucao.
  const referencia = `DEV-${r.lastID}`;

  if (destino === 'ESTOQUE' || destino === 'QUARENTENA') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id,
      justificativa: observacoes, referencia,
    });
    if (destino === 'QUARENTENA') {
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'BLOQUEIO', quantidade, motivo: 'Devolução para quarentena',
        justificativa: 'Devolução recebida em quarentena para inspeção', referencia,
      });
    }
  } else if (destino === 'SUCATA') {
    // BUG CORRIGIDO NA ETAPA 7 (medido com sonda executada, 2026-08-12): o material devolvido
    // para sucata JA tinha saido do estoque na entrega. Emitir so o SUCATA (que e um tipo de
    // SAIDA para o motor) descontava de novo um saldo que nunca voltou — 100 -> saida 10 -> 90
    // -> devolucao 3 para sucata dava 87, quando o certo e 90. Agora entra e sai: o saldo fecha,
    // e o livro conta as duas coisas (voltou, e foi sucateada). Descartado: nao movimentar nada
    // no destino SUCATA — o saldo tambem ficaria certo, mas a sucata sumiria do livro, e a
    // feature 15 (retalhos e sucatas) vai precisar dela la.
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id,
      justificativa: observacoes, referencia,
    });
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'SUCATA', quantidade, motivo, os_id: origem_os_id,
      localizacao_origem_id: localizacao_id,
      justificativa: observacoes || motivo, referencia,
    });
  } else if (destino === 'RETRABALHO') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'RETRABALHO', quantidade, motivo, os_id: origem_os_id, referencia,
    });
  }
```

> Nota sobre `localizacao_origem_id: localizacao_id` na saída de sucata: sem isso, a entrada
> creditaria a linha de saldo de uma localização (`resolveLocalizacaoEntrada`) e a saída debitaria
> outra se o chamador tivesse informado `localizacao_id` — o total do material fecharia, mas as
> linhas por endereço ficariam torcidas. Passar a mesma localização nas duas mantém a simetria;
> quando `localizacao_id` é nulo, os dois lados caem no mesmo fallback (`localizacao_padrao_id`).

- [x] **Step 4: rodar e ver passar**

Run: `cd server && node tests/api/devolucaoDestinos.api.test.js`
Expected: `5 passed, 0 failed`.

- [x] **Step 5: corrigir o teste existente que a correção invalida**

`server/tests/api/loteControleObrigatorio.api.test.js` afirma hoje que a devolução para sucata deixa
o saldo em `7`. Com a correção o saldo fecha em `10`. Trocar o teste inteiro (linhas 160-169) por:

```js
  // Etapa 7, Task 1: o destino SUCATA passa a emitir ENTRADA_DEVOLUCAO seguida de SUCATA — o
  // material devolvido para sucata JA tinha saido na entrega, e emitir so a saida descontava
  // duas vezes. Por isso o saldo aqui fecha em 10 (10 + 3 - 3), nao mais em 7. O ponto deste
  // teste nao mudou: nenhum dos dois movimentos exige lote (ate a Task 3 desta etapa).
  await test('[devolucao] SUCATA em material com controle_lote passa SEM lote', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-SUC' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });

    await returnService.registrarDevolucao(db, ADMIN, {
      material_id: mat, quantidade: 3, motivo: 'DANIFICADO', destino: 'SUCATA' });
    assert.strictEqual(await totalDoMaterial(db, mat), 10);
  });
```

- [x] **Step 6: rodar as suítes de servidor inteiras**

Run: `cd server && npm run test:api` — esperado: todos os arquivos OK, com `devolucaoDestinos` novo na lista.
Run: `cd server && npm run test:almoxarifado` — esperado: OK (o teste `Devolução ao estoque` usa destino `ESTOQUE`, não afetado).
Run: `cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite` — esperado: OK.
Anotar os números reais no relatório da task.

- [x] **Step 7: commit** — `29524fc`

```bash
git add server/services/almoxarifado/returnService.js \
        server/tests/api/devolucaoDestinos.api.test.js \
        server/tests/api/loteControleObrigatorio.api.test.js
git commit -m "$(cat <<'EOF'
Almoxarifado: corrige devolucao para sucata que baixava o estoque duas vezes

Devolver material para o destino SUCATA descontava o saldo de novo. O material
ja tinha saido do estoque na entrega; o returnService emitia um SUCATA, que e um
tipo de SAIDA para o motor, e o estoque caia outra vez. Medido com sonda
executada: 100 -> saida 10 -> 90 -> devolucao 3 para sucata dava 87 em vez de 90.
Nenhum teste pegava, e a leitura do codigo nao mostrava — so a execucao.

Agora o destino SUCATA emite ENTRADA_DEVOLUCAO seguida de SUCATA: entra e sai. O
saldo fecha certo e o livro continua contando as duas coisas (voltou, e foi
sucateada). Descartado nao movimentar nada no destino SUCATA: o saldo tambem
ficaria certo, mas a sucata sumiria do livro e a feature 15 (retalhos e sucatas)
vai precisar dela la.

Junto: `referencia: DEV-<id>` passa a ser gravada em TODAS as movimentacoes de
TODOS os destinos. Antes so ESTOQUE/QUARENTENA gravavam, entao a devolucao que
virava sucata ficava sem nenhum fio ligando o lancamento do livro ao registro da
devolucao.

O teste de sucata em loteControleObrigatorio passa a esperar 10 em vez de 7 —
mesma consequencia da correcao, nao mudanca de regra de lote.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: transferência — regra de vínculo declarada e exigência de lote que realmente alcança o ramo `TRANSFERENCIA`

**Files:**
- Modify: `server/services/almoxarifado/movementRules.js` (objeto `REGRAS_VINCULO`, linhas 11-28)
- Modify: `server/services/almoxarifado/stockService.js` (guarda de `exigeLote`, ~linha 552)
- Modify: `server/routes/almoxarifado/extended.js` (`POST /api/almoxarifado/transferencias`, linhas 340-345)
- Test: `server/tests/api/transferenciaRegras.api.test.js` (**novo**)

**Interfaces:**
- Consumes: `stockService.registrarMovimentacao(db, user, params, opcoes)` — 4º argumento `{ exigeLote }` (existente).
- Produces: `REGRAS_VINCULO.TRANSFERENCIA === { vinculo: 'nenhum' }`; a guarda de `exigeLote` passa a valer para `tipo === 'TRANSFERENCIA'`; `POST /transferencias` passa `{ exigeLote: true }`.

> **A armadilha desta task, escrita antes de qualquer código:** `TRANSFERENCIA` **não está** em
> `tiposEntrada` nem em `tiposSaida` — é um ramo próprio no `stockService` (~linhas 595 e 654). A
> guarda do `exigeLote` (~linha 552) hoje só dispara para esses dois conjuntos. Se você só
> acrescentar `{ exigeLote: true }` na rota, **nada muda** e o teste continua deixando passar
> transferência sem lote. É por isso que o Step 3 abaixo manda rodar o teste e VER FALHAR **depois**
> de mexer na rota e **antes** de mexer no motor.

- [x] **Step 1: escrever o teste que falha** — `server/tests/api/transferenciaRegras.api.test.js`:

```js
/**
 * Etapa 7, Task 2 — as duas lacunas da transferencia, nomeadas na auditoria de 2026-08-11.
 *
 * 1. `POST /transferencias` nao declarava `exigeLote`: material com controle_lote transferia sem
 *    citar de qual lote saiu — o oposto do que a flag promete.
 * 2. `TRANSFERENCIA` nao estava em REGRAS_VINCULO: a ausencia de exigencia era omissao, nao
 *    decisao. Passa a ser `{ vinculo: 'nenhum' }` — declarado. Mover material de prateleira e
 *    rotina; operador obrigado a justificar rotina escreve "ok".
 *
 * ARMADILHA que este arquivo existe para travar: TRANSFERENCIA e um ramo PROPRIO do
 * stockService, fora de tiposEntrada/tiposSaida — a guarda do exigeLote so alcancava esses dois
 * conjuntos. Declarar exigeLote na rota NAO basta; a condicao do if tem de citar TRANSFERENCIA.
 *
 * Decisao 8 do design, tambem travada aqui: transferencia NAO checa status nem vencimento do
 * lote. Mover um lote reprovado de prateleira e legitimo — e assim que ele vai parar na area de
 * bloqueados. A guarda de status fica so na saida, que e onde ela protege alguma coisa.
 *
 * Executar: cd server && node tests/api/transferenciaRegras.api.test.js
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

let seq = 0;
async function novoMaterial(db, controlado) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',0,1,?)`, [`TRF-${seq}`, `Material transferencia ${seq}`, controlado ? 1 : 0]);
  return r.lastID;
}
async function novaLocalizacao(db, prefixo) {
  seq += 1;
  const r = await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES (?,?)',
    [`${prefixo}-${seq}`, `${prefixo} ${seq}`]);
  return r.lastID;
}
const saldoDaLinha = (db, materialId, locId, loteId) => dbGet(db,
  `SELECT quantidade FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [materialId, locId, loteId]);

/** Cenario padrao: material (controlado ou nao), duas localizacoes e 20 unidades na origem. */
async function cenario(db, { controlado = true, comLote = true } = {}) {
  const mat = await novoMaterial(db, controlado);
  const origem = await novaLocalizacao(db, 'TRF-O');
  const destino = await novaLocalizacao(db, 'TRF-D');
  const lote = comLote ? await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: `L-${seq}` }) : null;
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: mat, tipo: 'ENTRADA', quantidade: 20,
    lote_id: lote ? lote.id : undefined, localizacao_destino_id: origem, motivo: 'setup' });
  return { mat, origem, destino, lote };
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('transferencia de material com controle de lote sem lote falha', async () => {
    const { mat, origem, destino } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 5, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 400,
      `esperava 400 (TRANSFERENCIA e ramo proprio do motor: a guarda do exigeLote precisa cita-lo`
      + ` explicitamente), veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
  });

  // O cliente nao pode desligar a exigencia pelo corpo: exigeLote mora no 4o argumento de
  // registrarMovimentacao, nunca em `params` (que e req.body inteiro).
  //
  // ATENCAO ao 400 deste teste: sem a guarda de lote a transferencia sem `lote_id` de um material
  // controlado JA falhava com 400 "Saldo insuficiente na localizacao de origem" — porque a linha
  // de saldo procurada (lote_id NULL) simplesmente nao existe, o estoque esta na linha do lote.
  // Medido na execucao de 2026-08-12, ANTES de qualquer implementacao: este teste passava com
  // `assert.strictEqual(res.status, 400)` sozinho, provando nada. Por isso a mensagem TAMBEM e
  // verificada: so a guarda de lote produz um 400 que fala de lote.
  await test('o corpo nao consegue desligar a exigencia de lote na transferencia', async () => {
    const { mat, origem, destino } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 5, localizacao_origem_id: origem, localizacao_destino_id: destino, exigeLote: false });
    assert.strictEqual(res.status, 400, `o cliente desligou a guarda pelo body: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i,
      `400 veio de outra guarda (saldo), nao da exigencia de lote: ${res.body.error}`);
  });

  await test('transferencia com lote move a linha do lote entre localizacoes', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 8, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    assert.strictEqual((await saldoDaLinha(db, mat, origem, lote.id)).quantidade, 12);
    assert.strictEqual((await saldoDaLinha(db, mat, destino, lote.id)).quantidade, 8,
      'a linha do lote na localizacao de destino nao foi creditada');
    const total = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(total.quantidade_atual, 20, 'transferencia mexeu no total do material (nao deveria)');
  });

  await test('transferencia acima do saldo da origem falha', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 50, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /saldo/i);
    assert.strictEqual((await saldoDaLinha(db, mat, origem, lote.id)).quantidade, 20,
      'a origem foi debitada por uma transferencia recusada');
  });

  // DECISAO 8 do design, fixada como intencao: mover um lote bloqueado de prateleira e legitimo —
  // e assim que ele vai parar na area de bloqueados. Se um dia alguem "consertar" isto achando
  // que e um furo, este teste explica que nao e.
  await test('transferencia de lote bloqueado e permitida (decisao 8)', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO', status_motivo = 'ensaio pendente' WHERE id = ?", [lote.id]);
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 4, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201,
      `lote bloqueado tem de poder ser movido de prateleira: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await saldoDaLinha(db, mat, destino, lote.id)).quantidade, 4);
  });

  await test('transferencia de lote vencido e permitida (decisao 8)', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = '2020-01-01' WHERE id = ?", [lote.id]);
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 4, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  // Decisao 5: `{ vinculo: 'nenhum' }` — declarado, nao omisso. Sem OS, projeto, centro de custo
  // nem justificativa, a transferencia passa.
  await test('transferencia nao exige vinculo nem justificativa (decisao 5)', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 2, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const { REGRAS_VINCULO } = require('../../services/almoxarifado/movementRules');
    assert.deepStrictEqual(REGRAS_VINCULO.TRANSFERENCIA, { vinculo: 'nenhum' },
      'TRANSFERENCIA tem de estar DECLARADA em REGRAS_VINCULO — ausencia e omissao, nao decisao');
  });

  // CONTROLE POSITIVO da guarda de lote: se o `if` tivesse sido estendido de forma grosseira
  // (por exemplo exigindo lote em TODO tipo), este teste falharia.
  await test('[controle positivo] material SEM controle de lote continua transferindo sem lote', async () => {
    const { mat, origem, destino } = await cenario(db, { controlado: false, comLote: false });
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 5, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual((await saldoDaLinha(db, mat, destino, null)).quantidade, 5);
  });

  // DECISAO 9: serie na transferencia esta fora do escopo, e isso vale DE GRACA porque
  // `serieObrigatoria` (stockService) tambem exige tiposEntrada||tiposSaida. Este teste registra
  // o fato: quem estender o if do exigeLote NAO pode copiar a mesma mudanca para o exigeSerie.
  await test('transferencia de material com controle de serie nao exige series (decisao 9)', async () => {
    seq += 1;
    const mat = (await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
       VALUES (?,?,'UN',0,1,1)`, [`TRF-SER-${seq}`, `Material serie ${seq}`])).lastID;
    const origem = await novaLocalizacao(db, 'TRF-SO');
    const destino = await novaLocalizacao(db, 'TRF-SD');
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, series: ['SN-T1', 'SN-T2'], localizacao_destino_id: origem, motivo: 'setup' });

    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 2, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201,
      `a transferencia passou a exigir serie — a decisao 9 diz o contrario: ${JSON.stringify(res.body)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: rodar e ver falhar (estado inicial)**

Run: `cd server && node tests/api/transferenciaRegras.api.test.js`
Expected: falham `transferencia de material com controle de lote sem lote falha`, `o corpo nao consegue desligar a exigencia de lote na transferencia` (os dois retornam 201) e `transferencia nao exige vinculo nem justificativa` (o `deepStrictEqual` de `REGRAS_VINCULO.TRANSFERENCIA` bate contra `undefined`). Os demais passam — são o comportamento que a task **preserva**.

> **CORREÇÃO — o plano estava errado aqui (medido na execução de 2026-08-12).** Os dois primeiros
> testes **não** retornam 201 no estado inicial: retornam **400 `Saldo insuficiente na localização
> de origem`**. Motivo: a entrada de setup credita a linha `(material, origem, lote_id)`, e a
> transferência sem `lote_id` procura a linha `(material, origem, NULL)`, que não existe. Ou seja,
> a transferência sem lote de material controlado já falhava — **por saldo, não por lote**.
> Consequência prática: `assert.strictEqual(res.status, 400)` sozinho **passa provando nada** — é
> exatamente a armadilha de "teste vazio" do `CLAUDE.md`, e ela morava dentro do próprio plano. Por
> isso o teste do Step 1 acima foi ajustado para checar **também a mensagem** (`assert.match(...,
> /lote/i)`) nos dois casos. Com o ajuste, o estado inicial dá **6 passed, 3 failed** e as três
> falhas são pelas razões certas.

- [x] **Step 3: declarar `exigeLote` na rota — e rodar de novo para VER QUE NÃO BASTA**

Em `server/routes/almoxarifado/extended.js`, substituir o corpo de `POST /api/almoxarifado/transferencias` (linhas 340-345):

```js
  app.post('/api/almoxarifado/transferencias', auth, requirePermission('movimentar'), async (req, res) => {
    try {
      // `exigeLote` no 4o argumento, NAO no body — mesma razao da rota /movimentacoes/v2: esta
      // rota repassa `req.body` inteiro, entao qualquer chave lida dele seria forjavel pelo
      // cliente. A transferencia TEM onde informar o lote (o formulario de Movimentacoes mostra
      // o seletor de lote quando o tipo e TRANSFERENCIA), logo a exigencia vale aqui — e precisa
      // valer TAMBEM nesta rota, senao ela vira um bypass da guarda da rota v2.
      const result = await stockService.registrarMovimentacao(db, req.user,
        { ...req.body, tipo: 'TRANSFERENCIA' }, { exigeLote: true });
      res.status(201).json(result);
    } catch (e) { handleError(res, e); }
  });
```

Run: `cd server && node tests/api/transferenciaRegras.api.test.js`
Expected: **`transferencia de material com controle de lote sem lote falha` CONTINUA FALHANDO** (ainda 201). Este passo existe só para você ver com os próprios olhos que declarar na rota não muda nada — é a armadilha nomeada no topo desta task. Se ele passar aqui, pare: alguém já mexeu no motor e o estado do repositório não é o que este plano assume.

> **Executado em 2026-08-12:** saída **byte a byte idêntica** à do Step 2 (`6 passed, 3 failed`,
> mesmas mensagens — `Saldo insuficiente na localização de origem`, não 201, ver correção acima).
> A prova da armadilha é justamente essa identidade: declarar `exigeLote` na rota não moveu **um
> único** resultado.

- [x] **Step 4: estender a guarda no motor**

Em `server/services/almoxarifado/stockService.js`, substituir o `if` da guarda de `controle_lote` (~linha 552):

```js
  // Etapa 7: `tipo === 'TRANSFERENCIA'` entrou na condicao porque TRANSFERENCIA e um ramo
  // PROPRIO deste motor — nao esta em tiposEntrada nem em tiposSaida. Sem cita-lo aqui,
  // declarar `exigeLote: true` na rota /transferencias nao tinha efeito nenhum: o material com
  // controle_lote continuava transferindo sem dizer de qual lote saiu, e quem testasse veria o
  // 201 e concluiria errado que a guarda funcionava. NAO copiar esta mudanca para o
  // `serieObrigatoria` mais abaixo: serie na transferencia esta declarada FORA de escopo
  // (decisao 9 do design da Etapa 7) justamente porque o claim de serie so existe para entrada
  // e saida, e a transferencia nao tem caminho no motor para mover o vinculo da serie.
  if (opcoes.exigeLote && material.controle_lote && !loteIdFinal
      && (tiposEntrada.includes(tipo) || tiposSaida.includes(tipo) || tipo === 'TRANSFERENCIA')) {
    throw Object.assign(
      new Error(`O material ${material.codigo} exige lote nesta movimentacao (controle por lote ligado)`),
      { status: 400 });
  }
```

- [x] **Step 5: declarar a regra de vínculo**

Em `server/services/almoxarifado/movementRules.js`, acrescentar dentro de `REGRAS_VINCULO`, depois da linha de `DECISAO_INSPECAO`:

```js
  // Etapa 7 (decisao 5 do design): TRANSFERENCIA passa a estar DECLARADA aqui com 'nenhum'. Nao
  // exige nada — mas a ausencia deixa de ser omissao e vira decisao escrita. Exigir
  // justificativa em toda transferencia foi descartado: mover material de prateleira e rotina, e
  // operador obrigado a justificar rotina escreve "ok". Exigir so quando muda de almoxarifado
  // foi descartado por ser mais regra para explicar e testar do que valor entregue — a tela tem
  // campo de motivo OPCIONAL, que vai para o livro.
  TRANSFERENCIA: { vinculo: 'nenhum' },
```

- [x] **Step 6: rodar e ver passar**

Run: `cd server && node tests/api/transferenciaRegras.api.test.js`
Expected: `9 passed, 0 failed`.

Controle positivo do motor (obrigatório, e desfazer depois): trocar temporariamente `tipo === 'TRANSFERENCIA'` por `tipo === 'TRANSFERENCIA_XX'` na condição do `if` e confirmar que `transferencia de material com controle de lote sem lote falha` volta a falhar; restaurar.

- [x] **Step 7: suítes inteiras**

Run: `cd server && npm run test:api` — atenção especial a `loteGuardasSaida.api.test.js` (tem dois testes de `TRANSFERENCIA` com lote, que continuam passando) e a `tests/almoxarifado.test.js` (`Transferência entre locais`, material sem `controle_lote`, não afetado).
Run: `cd server && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`.

> **Executado em 2026-08-12 (números reais):** `test:api` **58/58 arquivos de teste OK**
> (`transferenciaRegras` entrou como 9 passed, 0 failed); `test:almoxarifado` **43 passou, 0
> falhou**; `test:validation` **4 passed, 0 failed**; `test:safealter` **3 passed, 0 failed**;
> `test:sqlite` **3 passed, 0 failed**. Controle positivo do motor executado e desfeito: trocar
> `tipo === 'TRANSFERENCIA'` por `TRANSFERENCIA_XX` derruba os dois testes de lote (7 passed, 3
> failed → 2 failed no arquivo), provando que a guarda é o que os sustenta.

- [x] **Step 8: commit**

```bash
git add server/services/almoxarifado/movementRules.js \
        server/services/almoxarifado/stockService.js \
        server/routes/almoxarifado/extended.js \
        server/tests/api/transferenciaRegras.api.test.js
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: transferencia passa a exigir lote e a declarar regra de vinculo

Duas lacunas nomeadas na auditoria de 2026-08-11. A rota POST /transferencias nao
declarava exigeLote: material com controle_lote transferia sem dizer de qual lote
saiu, o oposto do que a flag promete — e o saldo por lote na localizacao de
destino ficava sem lastro. E TRANSFERENCIA nao estava em REGRAS_VINCULO, entao a
ausencia de exigencia era omissao, nao decisao.

A parte que nao sai de graca: TRANSFERENCIA e um ramo PROPRIO do stockService,
fora de tiposEntrada e tiposSaida, e a guarda do exigeLote so alcancava esses
dois conjuntos. Declarar exigeLote na rota nao mudava nada — o teste continuava
passando sem lote. A condicao do if passou a citar TRANSFERENCIA explicitamente.
A mesma mudanca NAO foi feita no exigeSerie de proposito: serie na transferencia
esta declarada fora de escopo (o claim de serie so existe para entrada e saida).

REGRAS_VINCULO ganha TRANSFERENCIA com vinculo 'nenhum': declarado, sem exigir
nada. Descartado exigir justificativa em toda transferencia (mover material de
prateleira e rotina; quem e obrigado a justificar rotina escreve "ok") e exigir
so quando muda de almoxarifado (mais regra para explicar e testar do que valor).

Teste novo fixa tambem a decisao 8: transferencia NAO checa status nem
vencimento do lote. Mover um lote reprovado de prateleira e legitimo — e assim
que ele vai parar na area de bloqueados.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: devolução — colunas de vínculo, validação da saída original e herança de lote

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (depois do `CREATE TABLE ... devolucoes_material_almoxarifado`, linha ~1026)
- Modify: `server/services/almoxarifado/returnService.js` (arquivo quase inteiro)
- Modify: `server/tests/api/loteControleObrigatorio.api.test.js` (os dois testes de devolução saem do "lado 2: isentos")
- Test: `server/tests/api/devolucaoVinculo.api.test.js` (**novo**)

**Interfaces:**
- Produces: `returnService.registrarDevolucao(db, user, data)` passa a aceitar `movimentacao_saida_id` (number, opcional) e `lote_id` (number, opcional) em `data`, e a gravar as duas colunas homônimas em `devolucoes_material_almoxarifado`. Passa a declarar `{ exigeLote: true }` no 4º argumento das movimentações que emite.
- Produces: `returnService.TIPOS_SAIDA_DEVOLVIVEL = ['SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA']` — a Task 4 consome esta constante.
- Consumes: `stockService.registrarMovimentacao` e `lotService.getLote(db, id)` (existentes).

> **A armadilha desta task:** com a Task 1, o destino `SUCATA` faz **entrada e depois saída**. Se o
> lote herdado estiver `BLOQUEADO`/`REPROVADO`, a **entrada passa e a saída falha** — o material
> entrou e não saiu, estado parcial que ninguém desfaz (não há transação neste módulo). A guarda de
> status vive no ramo `tiposSaida` do `stockService` (`loteResolvido.status !== 'ATIVO'`);
> `tiposDescarte` isenta só o **vencimento**, não o status. Por isso a implementação abaixo
> **pré-valida o status do lote antes da entrada** quando `destino === 'SUCATA'`.

- [x] **Step 1: escrever o teste que falha** — `server/tests/api/devolucaoVinculo.api.test.js`:

```js
/**
 * Etapa 7, Tasks 3/4/5 — devolucao vinculada a saida original.
 *
 * Ate esta etapa a devolucao aceitava qualquer quantidade de qualquer material, sem dizer de qual
 * entrega veio: nao havia "nao devolver mais do que foi entregue" nem rastro da saida que estava
 * sendo desfeita. E a entrada de devolucao gravava lote_id NULL mesmo em material controlado,
 * criando saldo que a saida seguinte nao conseguia consumir (a saida exige lote e nao achava
 * nenhum).
 *
 * Decisao 2 do design: o vinculo e OPCIONAL, mas VALIDADO quando informado. Devolucao avulsa
 * continua possivel (sobra antiga, material entregue antes do sistema, entrega sem registro);
 * obrigatorio foi descartado porque tornaria impossivel devolver o que saiu por um caminho sem
 * registro.
 *
 * Executar: cd server && node tests/api/devolucaoVinculo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { lote = false, serie = false, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, controle_serie)
     VALUES (?,?,'UN',?,1,?,?)`,
    [`DEVV-${seq}`, `Material vinculo ${seq}`, qtd, lote ? 1 : 0, serie ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const materialRow = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const devolucaoRow = (db, id) => dbGet(db, 'SELECT * FROM devolucoes_material_almoxarifado WHERE id = ?', [id]);
const movimentosDoMaterial = (db, id) => dbAll(db,
  'SELECT id, tipo, quantidade, lote_id, referencia FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [id]);

/** Entrega N unidades e devolve o id da movimentacao de saida (o que a devolucao vai citar). */
async function entregar(db, materialId, qtd, extra = {}) {
  const mov = await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: qtd,
    justificativa: 'entrega para a producao', ...extra });
  return mov.id;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── Validacao do vinculo ────────────────────────────────────────────────────────────────────

  await test('devolucao acima da quantidade entregue falha', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 11, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    // A mensagem TEM de dizer quanto resta — mensagem que nao diz o numero obriga o operador a adivinhar.
    assert.match(res.body.error || '', /10/, `a mensagem nao diz o saldo devolvivel: ${res.body.error}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 90, 'devolucao recusada mexeu no saldo');
  });

  await test('devolucao parcial soma com a anterior no limite do entregue', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const a = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 6, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    const b = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(b.status, 400, `6 + 5 > 10 e passou: ${JSON.stringify(b.body)}`);
    const c = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(c.status, 201, `6 + 4 = 10 tinha de passar: ${JSON.stringify(c.body)}`);
  });

  await test('devolucao sem saida original valida falha', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const outro = await novoMaterial(db, { qtd: 100 });

    // (a) id inexistente
    const inexistente = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: 999999 });
    assert.strictEqual(inexistente.status, 400, JSON.stringify(inexistente.body));
    assert.match(inexistente.body.error || '', /encontrada/i);

    // (b) saida de OUTRO material
    const saidaOutro = await entregar(db, outro, 5);
    const materialErrado = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaOutro });
    assert.strictEqual(materialErrado.status, 400, JSON.stringify(materialErrado.body));
    assert.match(materialErrado.body.error || '', /outro material/i);

    // (c) saida CANCELADA (estornada)
    const saidaId = await entregar(db, mat, 5);
    await request(app).post(`/api/almoxarifado/movimentacoes/${saidaId}/cancelar`).send({ motivo: 'entrega errada' });
    const cancelada = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(cancelada.status, 400, JSON.stringify(cancelada.body));
    assert.match(cancelada.body.error || '', /cancelada/i);

    // (d) movimentacao que NAO e uma entrega devolvivel (uma ENTRADA)
    const entrada = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 5, motivo: 'compra' });
    const tipoErrado = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: entrada.id });
    assert.strictEqual(tipoErrado.status, 400, JSON.stringify(tipoErrado.body));
    assert.match(tipoErrado.body.error || '', /ENTRADA/);
  });

  // ── Efeito no saldo (regras essenciais da spec 12) ──────────────────────────────────────────

  await test('devolucao boa aumenta saldo com movimentacao vinculada', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', condicao: 'BOA', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 94);

    const row = await devolucaoRow(db, res.body.id);
    assert.strictEqual(row.movimentacao_saida_id, saidaId, 'o vinculo com a saida nao foi gravado');
    const entradaDev = (await movimentosDoMaterial(db, mat)).find((m) => m.tipo === 'ENTRADA_DEVOLUCAO');
    assert.strictEqual(entradaDev.referencia, `DEV-${res.body.id}`);
  });

  await test('devolucao para quarentena nao aumenta disponivel', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 6, motivo: 'ITEM_ERRADO', condicao: 'SUSPEITA', destino: 'QUARENTENA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const m = await materialRow(db, mat);
    assert.strictEqual(m.quantidade_atual, 96, 'o fisico tem de voltar (o material esta no galpao)');
    assert.strictEqual(m.quantidade_bloqueada, 6, 'a quarentena precisa bloquear o que voltou');
    const disponivel = m.quantidade_atual - (m.quantidade_reservada || 0) - (m.quantidade_bloqueada || 0) - (m.quantidade_em_inspecao || 0);
    assert.strictEqual(disponivel, 90, 'a devolucao suspeita entrou no disponivel');
  });

  await test('devolucao para sucata nao baixa estoque duas vezes (regressao do bug da Task 1)', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'DANIFICADO', condicao: 'DANIFICADA', destino: 'SUCATA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
  });

  await test('[controle positivo] devolucao para estoque no mesmo arquivo soma', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(await totalDoMaterial(db, mat), 92,
      'a medicao de saldo deste arquivo esta cega — nenhum numero se moveu');
  });

  // ── Lote (decisao 4) ────────────────────────────────────────────────────────────────────────

  await test('devolucao herda o lote da saida original', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-LOTE-1' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 20, lote_id: lote.id, motivo: 'setup' });
    const saidaId = await entregar(db, mat, 8, { lote_id: lote.id });

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const row = await devolucaoRow(db, res.body.id);
    assert.strictEqual(row.lote_id, lote.id, 'a devolucao nao herdou o lote da saida');
    const entradaDev = (await movimentosDoMaterial(db, mat)).find((m) => m.tipo === 'ENTRADA_DEVOLUCAO');
    assert.strictEqual(entradaDev.lote_id, lote.id,
      'o saldo devolvido entrou sem lote — a saida seguinte nao vai conseguir consumi-lo');
  });

  await test('devolucao avulsa de material com controle de lote exige lote informado', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' });
    assert.strictEqual(res.status, 400,
      `agora existe onde informar o lote nos dois caminhos, entao a devolucao nao e mais isenta: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrou saldo de uma devolucao recusada');
  });

  await test('devolucao avulsa COM lote informado passa', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-LOTE-2' });
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', lote_id: lote.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual((await devolucaoRow(db, res.body.id)).lote_id, lote.id);
  });

  // ARMADILHA da Task 3: SUCATA faz entrada e depois saida. Sem pre-validacao, um lote bloqueado
  // deixaria a entrada passar e a saida falhar — o material entrava e nao saia (estado parcial,
  // e nao ha transacao neste modulo).
  await test('devolucao para sucata com lote bloqueado falha ANTES de creditar o estoque', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-LOTE-BLOQ' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    const saidaId = await entregar(db, mat, 5, { lote_id: lote.id });
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO', status_motivo = 'ensaio' WHERE id = ?", [lote.id]);

    const antes = await totalDoMaterial(db, mat);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'DANIFICADO', destino: 'SUCATA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /bloqueado/i);
    assert.strictEqual(await totalDoMaterial(db, mat), antes,
      'estado parcial: a entrada da sucata creditou o estoque e a saida falhou depois');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/devolucaoVinculo.api.test.js`
Expected: todos os testes de vínculo/lote falham (`movimentacao_saida_id` é ignorado hoje; a coluna nem existe, então `devolucaoRow(...).movimentacao_saida_id` vem `undefined`), e os de saldo puro (`quarentena`, `sucata`, controle positivo) passam. **Se `devolucao acima da quantidade entregue falha` passar aqui, pare** — significa que a validação já existia e o plano não corresponde ao repositório.

> **Executado em 2026-08-12: `3 passed, 8 failed`**, exatamente a divisão prevista. As oito falhas,
> textualmente: `devolucao acima da quantidade entregue falha: {"id":1}` / `201 !== 400`;
> `devolucao parcial soma com a anterior no limite do entregue: 6 + 5 > 10 e passou: {"id":3}`;
> `devolucao sem saida original valida falha: {"id":4}` / `201 !== 400`; `devolucao boa aumenta
> saldo com movimentacao vinculada: o vinculo com a saida nao foi gravado` / `undefined !== 7`;
> `devolucao herda o lote da saida original: a devolucao nao herdou o lote da saida` / `undefined
> !== 1`; `devolucao avulsa de material com controle de lote exige lote informado` (veio 201);
> `devolucao avulsa COM lote informado passa` / `undefined !== 2`; `devolucao para sucata com lote
> bloqueado falha ANTES de creditar o estoque` (veio 201). Os três verdes eram `quarentena`,
> `sucata` (regressão da Task 1) e o controle positivo — a medição do arquivo já sabia medir.

- [x] **Step 3: criar as duas colunas** — em `server/services/almoxarifado/schema.js`, logo depois do `CREATE TABLE IF NOT EXISTS devolucoes_material_almoxarifado (...)` (fecha na linha ~1026):

```js
  // Etapa 7: vinculo da devolucao a entrega que ela desfaz, e o lote que voltou. Via safeAlter
  // porque a tabela ja existe em producao. `movimentacao_saida_id` e o que permite validar
  // "nao devolver mais do que foi entregue" e dar rastro; `lote_id` e o lote herdado da saida
  // (ou informado a mao numa devolucao avulsa) — sem ele, o saldo devolvido de material
  // controlado ficava preso: entrava com lote NULL e a saida seguinte, que exige lote, nao
  // achava nenhum.
  await safeAlter(db, 'ALTER TABLE devolucoes_material_almoxarifado ADD COLUMN movimentacao_saida_id INTEGER');
  await safeAlter(db, 'ALTER TABLE devolucoes_material_almoxarifado ADD COLUMN lote_id INTEGER');
```

- [x] **Step 4: implementar as validações e a herança** — substituir o topo de `server/services/almoxarifado/returnService.js` (linhas 1-48, ou seja imports, constantes e a `registrarDevolucao` inteira) por:

```js
const { dbRun, dbAll, dbGet } = require('./db');
const { registrarMovimentacao } = require('./stockService');
const lotService = require('./lotService');
const { registrarAuditoria } = require('./audit');

const MOTIVOS = ['SOBRA_PROJETO', 'NAO_UTILIZADO', 'ITEM_ERRADO', 'DANIFICADO', 'RECUPERAVEL', 'SUCATA'];
const DESTINOS = ['ESTOQUE', 'QUARENTENA', 'SUCATA', 'RETRABALHO'];

// Etapa 7: os tipos de saida que uma devolucao pode desfazer. SUCATA, PERDA e AJUSTE_NEGATIVO
// ficam FORA de proposito — nao se devolve o que foi descartado nem o que foi corrigido por
// ajuste. A rota /devolucoes/saidas-elegiveis (Task 4) usa a mesma lista, para que a tela nunca
// ofereca uma saida que o servico vai recusar.
const TIPOS_SAIDA_DEVOLVIVEL = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA'];

const erro400 = (msg) => Object.assign(new Error(msg), { status: 400 });

/**
 * Valida a saida citada por uma devolucao e devolve a linha da movimentacao.
 * Cada recusa nomeia a razao ESPECIFICA: uma mensagem generica de "saida invalida" deixa o
 * operador sem saber se errou o material, se a entrega foi estornada ou se ja devolveu tudo.
 */
async function validarSaidaOriginal(db, { movimentacaoSaidaId, materialId, quantidade }) {
  const saida = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movimentacaoSaidaId]);
  if (!saida) throw erro400(`Movimentação de saída ${movimentacaoSaidaId} não encontrada`);
  if (saida.cancelado) {
    throw erro400(`A saída ${movimentacaoSaidaId} foi cancelada (estornada) — o estorno já devolveu o material`);
  }
  if (Number(saida.material_id) !== Number(materialId)) {
    throw erro400(`A saída ${movimentacaoSaidaId} é de outro material`);
  }
  if (!TIPOS_SAIDA_DEVOLVIVEL.includes(saida.tipo)) {
    throw erro400(`A movimentação ${movimentacaoSaidaId} é do tipo ${saida.tipo} e não é uma entrega devolvível `
      + `(devolvíveis: ${TIPOS_SAIDA_DEVOLVIVEL.join(', ')})`);
  }
  const { devolvida } = await dbGet(db,
    `SELECT COALESCE(SUM(quantidade),0) AS devolvida FROM devolucoes_material_almoxarifado
      WHERE movimentacao_saida_id = ?`, [movimentacaoSaidaId]);
  const restante = saida.quantidade - devolvida;
  if (Number(quantidade) > restante) {
    // A mensagem DIZ o numero: sem ele o operador tem de adivinhar quanto ainda pode devolver.
    throw erro400(`Devolução acima do entregue: a saída ${movimentacaoSaidaId} entregou ${saida.quantidade}, `
      + `já foram devolvidos ${devolvida} e restam ${restante}`);
  }
  return saida;
}

async function registrarDevolucao(db, user, data) {
  const {
    material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id,
    observacoes, localizacao_id, movimentacao_saida_id, lote_id,
  } = data;
  if (!material_id || !quantidade || !motivo) {
    throw Object.assign(new Error('material_id, quantidade e motivo são obrigatórios'), { status: 400 });
  }

  const material = await dbGet(db,
    'SELECT id, codigo, controle_lote, controle_serie FROM materiais_almoxarifado WHERE id = ?', [material_id]);
  if (!material) throw erro400('Material não encontrado');

  const destinoFinal = destino || 'ESTOQUE';

  // Vinculo OPCIONAL, mas VALIDADO quando informado (decisao 2 do design). Obrigatorio foi
  // descartado porque tornaria impossivel devolver o que saiu por um caminho sem registro
  // (sobra antiga, material entregue antes do sistema); "continua avulso" foi descartado porque
  // e justamente o buraco que a spec 12 mais cita.
  let saidaOriginal = null;
  if (movimentacao_saida_id) {
    saidaOriginal = await validarSaidaOriginal(db, {
      movimentacaoSaidaId: movimentacao_saida_id, materialId: material_id, quantidade });
  }

  // Heranca de lote (decisao 4): o lote informado a mao ganha do herdado. So herda em material
  // com controle_lote — herdar num material sem controle criaria linhas de saldo quebradas por
  // lote sem que ninguem tenha pedido isso.
  const loteFinalId = lote_id || (material.controle_lote && saidaOriginal ? saidaOriginal.lote_id : null) || null;

  // ARMADILHA do destino SUCATA: ele faz ENTRADA_DEVOLUCAO e DEPOIS SUCATA (correcao do bug de
  // saldo). A guarda de status do lote vive no ramo de SAIDA do motor, entao um lote
  // BLOQUEADO/REPROVADO deixaria a ENTRADA passar e a SAIDA falhar — o material entraria e nao
  // sairia, e nao ha transacao neste modulo para desfazer. Pre-validar aqui e o que impede o
  // estado parcial. (tiposDescarte, no motor, isenta o VENCIMENTO, nao o status — por isso a
  // checagem abaixo olha so `status`.)
  if (destinoFinal === 'SUCATA' && loteFinalId) {
    const loteDaSucata = await lotService.getLote(db, loteFinalId);
    if (!loteDaSucata) throw erro400('Lote informado não encontrado');
    if (loteDaSucata.status !== 'ATIVO') {
      throw erro400(`Lote ${loteDaSucata.codigo} está ${loteDaSucata.status.toLowerCase()} e não pode ser sucateado `
        + 'por devolução. Resolva o status do lote primeiro (tela Lotes e Séries) e repita a devolução.');
    }
  }

  const r = await dbRun(db, `INSERT INTO devolucoes_material_almoxarifado
    (material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id,
     responsavel_id, responsavel_nome, observacoes, movimentacao_saida_id, lote_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
    material_id, quantidade, motivo, condicao || null, destinoFinal,
    origem_os_id || null, origem_projeto_id || null,
    user.id, user.nome || user.email, observacoes || null,
    movimentacao_saida_id || null, loteFinalId,
  ]);

  const referencia = `DEV-${r.lastID}`;
  // `exigeLote: true` (Etapa 7): a devolucao SAI da lista de fluxos internos isentos da spec 10.
  // A isencao existia porque nao havia DE ONDE tirar um lote — agora ha nos dois caminhos (herda
  // da saida quando ha vinculo, seletor na tela quando e avulsa). Continua no 4o argumento,
  // nunca no body.
  const opcoes = { exigeLote: true };

  if (destinoFinal === 'ESTOQUE' || destinoFinal === 'QUARENTENA') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id, lote_id: loteFinalId,
      justificativa: observacoes, referencia,
    }, opcoes);
    if (destinoFinal === 'QUARENTENA') {
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'BLOQUEIO', quantidade, motivo: 'Devolução para quarentena',
        justificativa: 'Devolução recebida em quarentena para inspeção', referencia,
      });
    }
  } else if (destinoFinal === 'SUCATA') {
    // Entra e sai — ver a nota do bug corrigido na Etapa 7: o material ja tinha saido na
    // entrega, entao emitir so a saida descontava o estoque duas vezes.
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id, lote_id: loteFinalId,
      justificativa: observacoes, referencia,
    }, opcoes);
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'SUCATA', quantidade, motivo, os_id: origem_os_id,
      localizacao_origem_id: localizacao_id, lote_id: loteFinalId,
      justificativa: observacoes || motivo, referencia,
    }, opcoes);
  } else if (destinoFinal === 'RETRABALHO') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'RETRABALHO', quantidade, motivo, os_id: origem_os_id,
      lote_id: loteFinalId, referencia,
    });
  }

  await registrarAuditoria(db, { entidade: 'devolucao', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID };
}
```

E no `module.exports` do fim do arquivo, acrescentar a constante que a Task 4 consome:

```js
module.exports = { MOTIVOS, DESTINOS, TIPOS_SAIDA_DEVOLVIVEL, registrarDevolucao, listarDevolucoes };
```

- [x] **Step 5: rodar e ver passar**

Run: `cd server && node tests/api/devolucaoVinculo.api.test.js`
Expected: `11 passed, 0 failed`.

Controle positivo (obrigatório, e desfazer depois): comentar a linha `if (Number(quantidade) > restante)` e confirmar que `devolucao acima da quantidade entregue falha` e `devolucao parcial soma com a anterior no limite do entregue` falham; restaurar.

> **Executado em 2026-08-12: `11 passed, 0 failed`.** Os **dois** controles positivos rodaram e
> foram desfeitos:
> 1. neutralizando `if (Number(quantidade) > restante)` → `9 passed, 2 failed`, exatamente os dois
>    testes de quantidade previstos.
> 2. **o que prova a pré-validação do lote na sucata** (não estava pedido no plano, e é o que
>    torna a armadilha desta task verificável): neutralizando o `if (destinoFinal === 'SUCATA' &&
>    loteFinalId)` → `10 passed, 1 failed`, com a mensagem `estado parcial: a entrada da sucata
>    creditou o estoque e a saida falhou depois` e `7 !== 5`. O 7 é o estado parcial em números: a
>    `ENTRADA_DEVOLUCAO` de 2 creditou e a `SUCATA` seguinte foi recusada pela guarda de status do
>    motor. Sem a pré-validação, esse material entrava no estoque e nunca saía.
>
> O teste do Step 1 foi reforçado em relação ao plano: além do saldo, ele compara o **livro**
> (lista de tipos em `movimentacoes_almoxarifado`) antes e depois da recusa e checa que nenhuma
> linha ficou em `devolucoes_material_almoxarifado`. Só o saldo não bastaria — estado parcial é
> justamente meia perna do par gravada no livro, e alguém poderia "consertar" o número sem
> consertar o registro.

- [x] **Step 6: mover os dois testes de devolução de `loteControleObrigatorio` para o lado da exigência**

O arquivo tem uma seção "Lado 2: os quatro fluxos internos ISENTOS". A devolução deixa de ser um deles.
Remover os dois testes `[devolucao] ENTRADA_DEVOLUCAO em material com controle_lote passa SEM lote` e
`[devolucao] SUCATA em material com controle_lote passa SEM lote` de lá e colocar, na seção
"Lado 1: onde a exigencia TEM de continuar valendo", este par:

```js
  // Etapa 7: a devolucao SAIU da lista de fluxos internos isentos. A isencao existia porque nao
  // havia DE ONDE tirar um lote na devolucao — agora ha nos dois caminhos: herda da saida
  // original quando a devolucao cita a entrega, e a tela de Devolucoes tem seletor de lote
  // quando e avulsa. Estes dois testes eram exatamente o oposto disto ate 2026-08-12.
  await test('[devolucao] devolucao avulsa sem lote em material com controle_lote e recusada', async () => {
    const mat = await novoMaterial(db, true, 0);
    await assert.rejects(
      () => returnService.registrarDevolucao(db, ADMIN, {
        material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' }),
      /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrou estoque de uma devolucao recusada');
  });

  await test('[devolucao] devolucao com lote informado passa e o saldo entra COM lote', async () => {
    const mat = await novoMaterial(db, true, 0);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-DEV' });
    const r = await returnService.registrarDevolucao(db, ADMIN, {
      material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', lote_id: lote.id });
    assert.ok(r.id);
    assert.strictEqual(await totalDoMaterial(db, mat), 4);
    const mov = await dbGet(db,
      "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'", [mat]);
    assert.strictEqual(mov.lote_id, lote.id, 'o saldo devolvido entrou sem lote e ficaria preso');
  });
```

Atualizar também o cabeçalho de comentário do arquivo: onde ele diz "quatro chamadores internos ... returnService ENTRADA_DEVOLUCAO/SUCATA", acrescentar *"(a devolucao saiu desta lista na Etapa 7 — ver os testes marcados [devolucao] no lado 1)"*.

- [x] **Step 7: suítes inteiras**

Run: `cd server && npm run test:api` — conferir em especial `loteControleObrigatorio`, `devolucaoDestinos` (Task 1 — o material dele **não** tem `controle_lote`, então continua verde), `bloqueioGuardas` (devolução para quarentena, material sem `controle_lote`) e `tests/almoxarifado.test.js`.
Run: `cd server && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`.
`test:safealter` é o gate específico das duas colunas novas — se ele reclamar, é sinal de `ALTER` mal formado.

> **Executado em 2026-08-12 (números reais):** `test:api` **59/59 arquivos de teste OK**
> (`devolucaoVinculo` novo com 11 passed, 0 failed; `loteControleObrigatorio` 12 passed, 0 failed;
> `devolucaoDestinos` 5 passed, 0 failed; `transferenciaRegras` da Task 2 já verde, 9 passed);
> `test:almoxarifado` **43 passou, 0 falhou**; `test:safealter` **3 passed, 0 failed**;
> `test:validation` **4 passed, 0 failed**; `test:sqlite` **3 passed, 0 failed**.

> **Achado desta task que o plano não previa — mudança de comportamento embutida no `destinoFinal`.**
> O código antigo comparava `destino` (o valor cru do body) nos `if` de destino, mas gravava
> `destino || 'ESTOQUE'` na tabela. Logo, uma devolução **sem `destino`** gravava a linha dizendo
> `ESTOQUE` e **não emitia movimentação nenhuma**: o material constava devolvido e o saldo nunca
> voltava. Trocar os `if` para `destinoFinal` (como o plano manda, sem comentar o efeito) conserta
> isso de passagem. Fica registrado aqui porque é conserto de bug entrando junto com feature —
> nenhum teste cobria o caso, e a suíte inteira continua verde depois da mudança.

- [x] **Step 8: commit** — `38d2391`

```bash
git add server/services/almoxarifado/schema.js \
        server/services/almoxarifado/returnService.js \
        server/tests/api/devolucaoVinculo.api.test.js \
        server/tests/api/loteControleObrigatorio.api.test.js
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: devolucao passa a citar a saida original e a herdar o lote

A devolucao aceitava qualquer quantidade de qualquer material sem dizer de qual
entrega veio: nao havia "nao devolver mais do que foi entregue" nem rastro da
saida que estava sendo desfeita. E a entrada de devolucao gravava lote_id NULL
mesmo em material controlado, criando saldo que a saida seguinte nao conseguia
consumir — a saida exige lote e nao achava nenhum, entao o material voltava para
o estoque e ficava preso.

Duas colunas por safeAlter (movimentacao_saida_id, lote_id) e validacao no
returnService: a saida tem de existir, nao estar cancelada, ser do mesmo
material e de um tipo de entrega devolvivel; e quantidade + ja devolvido nao
pode passar do que saiu — a mensagem de erro diz quanto resta, porque mensagem
sem numero obriga o operador a adivinhar.

O vinculo e OPCIONAL de proposito. Obrigatorio foi descartado: tornaria
impossivel devolver o que saiu por um caminho sem registro (sobra antiga,
entrega anterior ao sistema). "Continua avulso" foi descartado porque e o buraco
que a spec 12 mais cita.

Com lote herdado da saida e seletor de lote na devolucao avulsa, a devolucao sai
da lista de fluxos internos isentos de exigeLote (spec 10) e passa a declarar
exigeLote: true — no 4o argumento, nunca no body. Os dois testes de
loteControleObrigatorio que provavam a isencao mudaram de lado no arquivo.

Ponto que quase virou bug: o destino SUCATA agora faz entrada e depois saida, e
a guarda de status do lote vive no ramo de saida do motor. Com lote bloqueado a
entrada passaria e a saida falharia, deixando o material dentro do estoque sem
nunca sair. Por isso o status do lote e pre-validado antes da entrada quando o
destino e SUCATA.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `GET /almoxarifado/devolucoes/saidas-elegiveis?material_id=X`

**Files:**
- Modify: `server/services/almoxarifado/returnService.js` (função nova `listarSaidasElegiveis` + export)
- Modify: `server/routes/almoxarifado/extended.js` (rota nova, logo depois de `GET /api/almoxarifado/devolucoes`, linha ~572)
- Test: `server/tests/api/devolucaoVinculo.api.test.js` (describe novo no **mesmo arquivo** da Task 3)

**Escolha justificada do arquivo de teste:** fica no mesmo `devolucaoVinculo.api.test.js`. A rota
existe **para alimentar** a validação da Task 3 — o `saldo_devolvivel` que ela devolve tem de ser
exatamente o número que `validarSaidaOriginal` usa para recusar. Um arquivo separado deixaria os
dois lados livres para divergir sem que nenhum teste percebesse; juntos, o mesmo cenário prova a
leitura e a escrita. (O runner de API descobre por arquivo, então isso não muda a cobertura.)

**Interfaces:**
- Consumes: `TIPOS_SAIDA_DEVOLVIVEL` (Task 3).
- Produces: `returnService.listarSaidasElegiveis(db, materialId, { limite = 30 })` → array de
  `{ id, tipo, quantidade, created_at, lote_id, lote, requisicao_id, requisicao_numero, os_id, projeto_id, usuario_nome, quantidade_devolvida, saldo_devolvivel, series: [{ id, numero, status }] }`.
  A tela da Task 7 consome exatamente estes nomes.

- [x] **Step 1: escrever os testes que falham** — acrescentar em `server/tests/api/devolucaoVinculo.api.test.js`, antes do `await close();`:

> **O plano estava INCOMPLETO aqui (executado em 2026-08-12).** A justificativa de arquivo logo
> acima diz que os dois lados moram juntos porque "o `saldo_devolvivel` que ela devolve tem de ser
> exatamente o número que `validarSaidaOriginal` usa para recusar" — mas **nenhum** dos 5 testes
> abaixo amarra os dois lados: todos comparam o `saldo_devolvivel` contra um **literal escrito à
> mão** (`7`, `4`, `0`). Um literal em cada lado é exatamente o que deixa as duas pontas
> divergirem em silêncio: bastaria alguém mudar a conta de um lado e ajustar o literal do teste.
> Foram acrescentados **3 testes** aos 5 do plano (por isso o Step 5 fecha em **19**, não em 16):
>
> 1. `[duas pontas] o saldo_devolvivel da rota e exatamente o limite que a validacao aplica` — lê o
>    número **da rota** e o usa contra `POST /devolucoes` na mesma execução: `saldo+1` recusado,
>    `saldo` aceito, depois saldo 0 e mais 1 recusado. É o teste que a justificativa do arquivo
>    prometia e não existia.
> 2. `saidas-elegiveis identifica a entrega: lote, requisicao, OS, projeto e quem retirou` — o
>    bloco **Interfaces** promete `lote`, `requisicao_numero`, `os_id`, `projeto_id`,
>    `usuario_nome`, `created_at`, e nenhum teste do plano lia esses campos. A tela da Task 7
>    depende deles pelo nome; sem teste, um `SELECT` incompleto passaria a suíte inteira.
> 3. `[controle positivo] devolucao de uma saida nao baixa o saldo da outra` — todos os testes do
>    plano usam material com **uma** saída devolvida, então um `SUM` sem `WHERE
>    movimentacao_saida_id` passaria em todos eles.

```js
  // ── Rota de leitura: as saidas que uma devolucao pode citar (Task 4) ────────────────────────

  await test('saidas-elegiveis lista as entregas do material com o saldo devolvivel', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaA = await entregar(db, mat, 10);
    const saidaB = await entregar(db, mat, 4);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaA });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const porId = Object.fromEntries(res.body.map((s) => [s.id, s]));
    assert.strictEqual(porId[saidaA].quantidade_devolvida, 3);
    assert.strictEqual(porId[saidaA].saldo_devolvivel, 7);
    assert.strictEqual(porId[saidaB].quantidade_devolvida, 0);
    assert.strictEqual(porId[saidaB].saldo_devolvivel, 4);
    assert.ok(res.body[0].id > res.body[1].id, 'a lista tem de vir da mais recente para a mais antiga');
  });

  // Linha zerada VOLTA na lista de proposito — "ja devolvido por inteiro" e informacao util, nao
  // ruido; a tela a mostra desabilitada. Se ela sumisse, o operador procuraria uma entrega que o
  // sistema decidiu esconder.
  await test('saidas-elegiveis mantem a saida ja devolvida por inteiro, com saldo 0', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 5);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    const linha = res.body.find((s) => s.id === saidaId);
    assert.ok(linha, 'a saida totalmente devolvida sumiu da lista');
    assert.strictEqual(linha.saldo_devolvivel, 0);
  });

  await test('saidas-elegiveis nao oferece descarte, ajuste, entrada nem saida cancelada', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaBoa = await entregar(db, mat, 5);
    const cancelada = await entregar(db, mat, 5);
    await request(app).post(`/api/almoxarifado/movimentacoes/${cancelada}/cancelar`).send({ motivo: 'errada' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'SUCATA', quantidade: 2, justificativa: 'quebrou' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'PERDA', quantidade: 1, justificativa: 'sumiu' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'ENTRADA', quantidade: 9, motivo: 'compra' });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    assert.deepStrictEqual(res.body.map((s) => s.id), [saidaBoa],
      `a lista precisa conter so a entrega devolvivel, veio ${JSON.stringify(res.body.map((s) => `${s.id}:${s.tipo}`))}`);
  });

  await test('saidas-elegiveis traz as series entregues naquela saida', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, series: ['SN-EL-1', 'SN-EL-2'], motivo: 'setup' });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
    const series = await dbAll(db, 'SELECT id, numero FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [mat]);
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, serie_ids: [series[0].id], justificativa: 'entregue ao tecnico' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    const linha = res.body.find((s) => s.id === saida.body.id);
    assert.deepStrictEqual(linha.series.map((s) => s.numero), ['SN-EL-1']);
    assert.strictEqual(linha.series[0].id, series[0].id);
  });

  await test('saidas-elegiveis sem material_id responde 400', async () => {
    const res = await request(app).get('/api/almoxarifado/devolucoes/saidas-elegiveis');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });
```

- [x] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/devolucaoVinculo.api.test.js`
Expected: os 5 testes novos falham com 404 (rota inexistente) — `res.body` vem vazio e os `assert` de campo estouram.

> **Executado em 2026-08-12: `11 passed, 8 failed`** (8 e não 5 por causa dos 3 testes
> acrescentados no Step 1). Duas formas de falha, ambas pela razão certa — rota inexistente:
> os 3 que checam `res.status` (`... lista as entregas ...`, `[duas pontas] ...`, `... sem
> material_id responde 400`) estouram em `404 !== 200` / `404 !== 400`; os outros 5 estouram
> antes, em **`res.body.find is not a function` / `res.body.map is not a function`** — o corpo do
> 404 é um objeto, não o array que a rota vai devolver. O plano previa "os `assert` de campo
> estouram"; na prática eles nem chegam a rodar.

- [x] **Step 3: implementar a leitura** — acrescentar em `server/services/almoxarifado/returnService.js`, depois de `listarDevolucoes`:

```js
/**
 * As entregas daquele material que uma devolucao pode citar (Etapa 7, Task 4).
 *
 * Leitura agregada de tres tabelas: a movimentacao (a entrega), a soma das devolucoes que ja
 * citam aquela movimentacao, e as series que sairam nela. Linha ja devolvida por inteiro VOLTA
 * na lista, com saldo 0 — "ja devolvido por inteiro" e informacao util, nao ruido, e a tela a
 * mostra desabilitada. As 30 mais recentes: quem devolve devolve o que saiu ha pouco; lista
 * infinita rolando no modal atrapalha mais do que ajuda.
 */
async function listarSaidasElegiveis(db, materialId, { limite = 30 } = {}) {
  const material = await dbGet(db,
    'SELECT id, controle_serie FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!material) throw erro400('Material não encontrado');

  const marcadores = TIPOS_SAIDA_DEVOLVIVEL.map(() => '?').join(',');
  const saidas = await dbAll(db, `
    SELECT mv.id, mv.tipo, mv.quantidade, mv.created_at, mv.lote_id, mv.lote,
           mv.requisicao_id, mv.os_id, mv.projeto_id, mv.usuario_nome,
           req.numero AS requisicao_numero,
           COALESCE((SELECT SUM(d.quantidade) FROM devolucoes_material_almoxarifado d
                      WHERE d.movimentacao_saida_id = mv.id), 0) AS quantidade_devolvida
      FROM movimentacoes_almoxarifado mv
      LEFT JOIN requisicoes_almoxarifado req ON req.id = mv.requisicao_id
     WHERE mv.material_id = ? AND COALESCE(mv.cancelado,0) = 0 AND mv.tipo IN (${marcadores})
     ORDER BY mv.created_at DESC, mv.id DESC
     LIMIT ?`, [materialId, ...TIPOS_SAIDA_DEVOLVIVEL, limite]);

  const out = [];
  for (const s of saidas) {
    // Serie por saida e uma QUERY, nao estrutura nova: series_almoxarifado ja tem
    // movimentacao_saida_id desde a Etapa 6b. Status ENTREGUE porque e o que a saida deixou —
    // uma serie ja reentrada por outro caminho nao esta la fora para ser devolvida.
    const series = material.controle_serie
      ? await dbAll(db, `SELECT id, numero, status FROM series_almoxarifado
                          WHERE movimentacao_saida_id = ? AND status = 'ENTREGUE' ORDER BY numero`, [s.id])
      : [];
    out.push({
      ...s,
      saldo_devolvivel: Number((s.quantidade - s.quantidade_devolvida).toFixed(4)),
      series,
    });
  }
  return out;
}
```

E no `module.exports`:

```js
module.exports = {
  MOTIVOS, DESTINOS, TIPOS_SAIDA_DEVOLVIVEL,
  registrarDevolucao, listarDevolucoes, listarSaidasElegiveis,
};
```

- [x] **Step 4: registrar a rota** — em `server/routes/almoxarifado/extended.js`, **logo depois** de `app.get('/api/almoxarifado/devolucoes', ...)` (linha ~572):

```js
  // Leitura, so `auth` — mesmo gate do GET /devolucoes logo acima. Precisa ser registrada perto
  // dele para que nenhuma rota `/devolucoes/:id` futura capture este caminho antes.
  app.get('/api/almoxarifado/devolucoes/saidas-elegiveis', auth, async (req, res) => {
    try {
      const materialId = Number(req.query.material_id);
      if (!materialId) return res.status(400).json({ error: 'material_id é obrigatório' });
      res.json(await returnService.listarSaidasElegiveis(db, materialId));
    } catch (e) { handleError(res, e); }
  });
```

- [x] **Step 5: rodar e ver passar**

Run: `cd server && node tests/api/devolucaoVinculo.api.test.js`
Expected: `16 passed, 0 failed`.

Controle positivo (obrigatório, e desfazer depois): trocar `COALESCE(mv.cancelado,0) = 0` por `1=1` e confirmar que `saidas-elegiveis nao oferece descarte, ajuste, entrada nem saida cancelada` falha; restaurar.

> **Executado em 2026-08-12: `19 passed, 0 failed`** (16 do plano + os 3 testes acrescentados no
> Step 1). **Dois** controles positivos, os dois desfeitos e o arquivo conferido byte a byte
> contra a cópia de antes (`diff` sem saída):
>
> - `COALESCE(mv.cancelado,0) = 0` → `1=1`: **18 passed, 1 failed** — `saidas-elegiveis nao oferece
>   descarte, ajuste, entrada nem saida cancelada` cai com `[+34, 33]`, a saída estornada
>   aparecendo na lista. É o controle que o plano pedia.
> - `saldo_devolvivel: quantidade - quantidade_devolvida` → `quantidade` (a divergência que esta
>   task inteira existe para impedir): **15 passed, 4 failed**, e o `[duas pontas]` cai com a
>   mensagem exata do problema de produção — *"a rota publicou saldo 9 e a validacao recusou esse
>   mesmo numero: Devolução acima do entregue: a saída 28 entregou 9, já foram devolvidos 2 e
>   restam 7"*. Os 3 testes com literal escrito à mão também caem, mas dizem só `Expected values to
>   be strictly equal` — nenhum deles **nomeia** a divergência entre as duas pontas.

**Gates de servidor executados em 2026-08-12 (números reais):** `test:api` **59/59 arquivos de
teste OK**; `test:almoxarifado` **43 passou, 0 falhou**; `test:validation` **4 passed, 0 failed**;
`test:safealter` **3 passed, 0 failed**; `test:sqlite` **3 passed, 0 failed**.

- [x] **Step 6: commit**

```bash
git add server/services/almoxarifado/returnService.js \
        server/routes/almoxarifado/extended.js \
        server/tests/api/devolucaoVinculo.api.test.js
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: rota que lista as entregas devolviveis de um material

A tela de devolucao comeca pelo material e precisa mostrar de qual entrega o
operador esta devolvendo — data, quantidade, quem retirou, requisicao/OS, quanto
ja foi devolvido e quanto ainda pode ser. Sem isso o vinculo criado na task
anterior seria inutilizavel pela interface: o operador teria de saber de cabeca o
id de uma movimentacao.

Comecar pela requisicao foi descartado no design: nao alcanca saida manual sem
requisicao, e SAIDA_PRODUCAO/MONTAGEM/ASSISTENCIA existem exatamente para isso.

A rota usa a MESMA lista de tipos devolviveis que a validacao do returnService,
para que a tela nunca ofereca uma saida que o servico vai recusar. SUCATA, PERDA
e AJUSTE_NEGATIVO ficam fora de proposito: nao se devolve o que foi descartado
ou corrigido. Saida cancelada tambem fica fora — o estorno ja devolveu.

Linha com saldo zero continua na lista, com saldo_devolvivel 0: "ja devolvido
por inteiro" e informacao util, nao ruido, e a tela a desabilita. Esconde-la
faria o operador procurar uma entrega que o sistema decidiu nao mostrar.

As series de cada saida sao query, nao estrutura nova: series_almoxarifado ja
tem movimentacao_saida_id desde a Etapa 6b.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: série na devolução — destinos `ESTOQUE` e `QUARENTENA` apenas

**Files:**
- Modify: `server/services/almoxarifado/returnService.js` (`registrarDevolucao`)
- Test: `server/tests/api/devolucaoVinculo.api.test.js` (describe novo)

**Interfaces:**
- Consumes: `registrarMovimentacao(..., { exigeLote, exigeSerie })` e, por dentro dele, `seriesService.entradaSeries`, que reativa série `ENTREGUE`/`SUCATEADA`/`ESTORNADA` para `EM_ESTOQUE` com guarda no `WHERE` (Etapa 6b).
- Produces: `registrarDevolucao` passa a aceitar `series: string[]` em `data` (números de série, um por item devolvido).

> **Decisão 10 do design, e o que ela implica no código:** devolução com série cobre destino
> `ESTOQUE` e `QUARENTENA`. Para sucatear uma peça serializada devolvida, o caminho é devolver ao
> estoque e depois sucatear em **Movimentações**, que já tem seletor de série. Suportar direto
> exigiria encadear entrada+saída de série com compensação no meio — risco desproporcional, e os
> dois passos já funcionam hoje. Consequência prática: `exigeSerie` **não pode** ser declarado nos
> destinos `SUCATA`/`RETRABALHO`, e mandar `series` para eles tem de dar 400 **explicando o
> caminho** — silenciosamente ignorar deixaria o operador achando que registrou a série.

- [ ] **Step 1: escrever os testes que falham** — acrescentar em `server/tests/api/devolucaoVinculo.api.test.js`, antes do `await close();`:

```js
  // ── Serie na devolucao (Task 5, decisao 10) ─────────────────────────────────────────────────

  /** Entra com N series, entrega a primeira e devolve { saidaId, series }. */
  async function entregarComSerie(materialId, numeros) {
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: numeros.length, series: numeros, motivo: 'setup' });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
    const series = await dbAll(db, 'SELECT id, numero FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [materialId]);
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: materialId, tipo: 'SAIDA', quantidade: 1, serie_ids: [series[0].id], justificativa: 'entregue' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
    return { saidaId: saida.body.id, series };
  }
  const statusDaSerie = async (id) => (await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [id])).status;

  await test('devolucao de material com serie reativa a serie da saida', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId, series } = await entregarComSerie(mat, ['SN-DEV-1', 'SN-DEV-2']);
    assert.strictEqual(await statusDaSerie(series[0].id), 'ENTREGUE');

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-1'] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await statusDaSerie(series[0].id), 'EM_ESTOQUE',
      'a serie devolvida continuou ENTREGUE — o saldo voltou sem a peca correspondente');
  });

  await test('devolucao ao estoque de material com serie sem informar a serie e recusada', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId } = await entregarComSerie(mat, ['SN-DEV-3']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /serie/i);
  });

  await test('devolucao para quarentena tambem aceita serie', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId, series } = await entregarComSerie(mat, ['SN-DEV-4']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'ITEM_ERRADO', condicao: 'SUSPEITA', destino: 'QUARENTENA',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-4'] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await statusDaSerie(series[0].id), 'EM_ESTOQUE');
  });

  // Decisao 10: sucatear peca serializada direto na devolucao esta FORA de escopo. O erro tem de
  // ensinar o caminho de dois passos, nao so recusar.
  await test('devolucao para sucata de material com serie recusa e explica o caminho', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId } = await entregarComSerie(mat, ['SN-DEV-5']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'DANIFICADO', destino: 'SUCATA',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-5'] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /Movimenta/i,
      `o erro tem de apontar a tela de Movimentacoes como caminho: ${res.body.error}`);
  });

  // CONTROLE POSITIVO da guarda de serie: material SEM controle_serie continua devolvendo sem
  // nada disso — se a exigencia tivesse ficado ampla demais, este teste falharia.
  await test('[controle positivo] material sem controle de serie devolve sem informar serie', async () => {
    const mat = await novoMaterial(db, { qtd: 20 });
    const saidaId = await entregar(db, mat, 5);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd server && node tests/api/devolucaoVinculo.api.test.js`
Expected: falham `devolucao de material com serie reativa a serie da saida` (a série continua `ENTREGUE` — o `series` do body hoje é ignorado pelo `returnService`), `devolucao ao estoque ... sem informar a serie e recusada` (vem 201) e `devolucao para sucata ... recusa e explica o caminho` (vem 201).

- [ ] **Step 3: implementar** — em `server/services/almoxarifado/returnService.js`:

3a. acrescentar `series` à desestruturação de `data` no topo de `registrarDevolucao`:

```js
  const {
    material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id,
    observacoes, localizacao_id, movimentacao_saida_id, lote_id, series,
  } = data;
```

3b. logo depois do cálculo de `loteFinalId` (e antes da pré-validação do lote de sucata), acrescentar:

```js
  // Serie na devolucao (decisao 10 do design): coberta so nos destinos ESTOQUE e QUARENTENA, onde
  // o motor sabe reativar a serie ENTREGUE de volta a EM_ESTOQUE (seriesService.entradaSeries).
  // SUCATA e RETRABALHO ficariam precisando encadear entrada+saida de serie com compensacao no
  // meio — risco desproporcional ao ganho, sendo que o caminho de dois passos ja funciona hoje.
  // Recusar com a explicacao (em vez de ignorar `series` em silencio) e o que impede o operador
  // de achar que registrou a peca.
  const destinoAceitaSerie = destinoFinal === 'ESTOQUE' || destinoFinal === 'QUARENTENA';
  const seriesInformadas = Array.isArray(series) ? series.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!destinoAceitaSerie && seriesInformadas.length > 0) {
    throw erro400(`Devolução com número de série não é suportada no destino ${destinoFinal}. `
      + 'Devolva ao estoque e, em seguida, registre a baixa na tela Movimentações, que tem seletor de série.');
  }
  // Nota sobre o invariante COUNT(serie presente) == quantidade_atual: no destino SUCATA de um
  // material serializado a ENTRADA entra sem serie e a SUCATA sai sem serie logo depois — o
  // saldo liquido nao muda e o invariante fecha no fim da operacao. E a limitacao declarada
  // acima, nao um furo silencioso.
```

3c. trocar as `opcoes` da entrada de devolução (hoje `const opcoes = { exigeLote: true };`) por:

```js
  const opcoes = { exigeLote: true };
  // `exigeSerie` so onde a serie e suportada — declarar nos outros destinos travaria a devolucao
  // de material serializado para sucata/retrabalho sem oferecer caminho nenhum. Continua no 4o
  // argumento, nunca no body.
  const opcoesEntrada = { exigeLote: true, exigeSerie: destinoAceitaSerie };
```

3d. nas duas chamadas de `ENTRADA_DEVOLUCAO` (destino `ESTOQUE`/`QUARENTENA` e destino `SUCATA`),
acrescentar `series: seriesInformadas` ao objeto de params e trocar o 4º argumento:

```js
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id, lote_id: loteFinalId,
      series: seriesInformadas,
      justificativa: observacoes, referencia,
    }, opcoesEntrada);
```

(na do destino `SUCATA`, `opcoesEntrada` tem `exigeSerie: false` porque `destinoAceitaSerie` é
falso ali — é a mesma constante, calculada uma vez; a saída `SUCATA` continua com `opcoes`.)

- [ ] **Step 4: rodar e ver passar**

Run: `cd server && node tests/api/devolucaoVinculo.api.test.js`
Expected: `21 passed, 0 failed`.

Controle positivo (obrigatório, e desfazer depois): trocar `exigeSerie: destinoAceitaSerie` por `exigeSerie: false` e confirmar que `devolucao ao estoque de material com serie sem informar a serie e recusada` falha; restaurar.

- [ ] **Step 5: suítes de servidor inteiras**

Run: `cd server && npm run test:api` — atenção a `serieEstornoDevolucao.api.test.js` e `serieControleObrigatorio.api.test.js` (nenhum deles chama `returnService`, confirmado em 2026-08-12; se algum quebrar, é sinal de que o alcance de `exigeSerie` ficou maior do que esta task pediu).
Run: `cd server && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`.

- [ ] **Step 6: commit**

```bash
git add server/services/almoxarifado/returnService.js \
        server/tests/api/devolucaoVinculo.api.test.js
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: devolucao de material serializado reativa a serie entregue

Devolver material com controle de serie voltava o saldo sem voltar a peca: a
serie continuava ENTREGUE, entao o material aparecia no estoque e nenhuma serie
correspondia a ele — o invariante que a Etapa 6b criou (contagem de series
presentes igual ao saldo) quebrava a cada devolucao.

A entrada de devolucao passa a aceitar `series` e a declarar exigeSerie no 4o
argumento; o motor reativa ENTREGUE -> EM_ESTOQUE pelo caminho que ja existe
(seriesService.entradaSeries, com guarda no WHERE).

Cobre so os destinos ESTOQUE e QUARENTENA, e isso e decisao declarada. Sucatear
peca serializada direto na devolucao exigiria encadear entrada e saida de serie
com compensacao no meio, risco desproporcional ao ganho — o caminho de dois
passos (devolver ao estoque e baixar em Movimentacoes, que ja tem seletor de
serie) funciona hoje. Mandar series para SUCATA/RETRABALHO devolve 400
explicando esse caminho, em vez de ignorar o campo em silencio e deixar o
operador achando que registrou a peca.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Movimentações — `TRANSFERENCIA` entra no formulário, `DEVOLUCAO` sai

**Files:**
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`
- Test: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.test.js` (describe novo)

**Interfaces:**
- Consumes: `POST /almoxarifado/movimentacoes/v2` com `{ tipo: 'TRANSFERENCIA', material_id, quantidade, localizacao_origem_id, localizacao_destino_id, lote_id, motivo }`. **Nenhuma mudança de schema é necessária** — `TRANSFERENCIA` já está em `TIPOS_MOVIMENTO_ROTA` (`server/services/almoxarifado/schemas.js`), que só filtra `ESTORNO` e os tipos de retenção.
- Produces: constantes novas no topo do arquivo — `TIPOS_COM_LOTE_EXISTENTE`, `TIPOS_COM_ORIGEM`, `TIPOS_COM_DESTINO` — e `TIPOS_SAIDA_LOTE` passa a governar **só a série**.

> **Por que não reutilizar `TIPOS_SAIDA_LOTE` cru:** hoje essa única constante dirige quatro coisas
> ao mesmo tempo (seletor de lote, localização de origem, seletor de série e o rótulo "Disponível").
> A transferência precisa de origem **e** destino **e** seletor de lote, mas **sem** seletor de
> série (decisão 9). Enfiar `TRANSFERENCIA` na constante existente ligaria o seletor de série
> junto, e o formulário exigiria séries que o motor nem lê nesse tipo.

- [x] **Step 1: escrever os testes que falham** — acrescentar ao fim de `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.test.js`:

```js
/**
 * Etapa 7, Task 6: TRANSFERENCIA entra no formulario (a rota existia desde sempre e nunca teve
 * tela) e DEVOLUCAO sai dele — registrar "Devolucao" aqui criava uma movimentacao solta, sem
 * motivo, sem condicao e sem destino, e NAO criava registro nenhum na tabela de devolucoes.
 * DEVOLUCAO continua em TIPOS (a lista completa), senao o livro para de exibir os lancamentos
 * antigos e o filtro perde a opcao.
 */
const LOTES_TRANSFERENCIA = [
  { id: 41, codigo: 'L-OK', status: 'ATIVO', saldo: 10, elegivel: true, vencido: false, vencimento_liberado: false },
  { id: 42, codigo: 'L-BLOQ', status: 'BLOQUEADO', saldo: 5, elegivel: false, vencido: false, vencimento_liberado: false },
  { id: 43, codigo: 'L-VENC', status: 'ATIVO', saldo: 3, elegivel: false, vencido: true, vencimento_liberado: false },
];

describe('MovimentacoesAlmoxarifado — TRANSFERENCIA no formulário e DEVOLUCAO fora dele', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', controle_lote: 1 }] });
      }
      if (url.startsWith('/almoxarifado/materiais/10/lotes')) return Promise.resolve({ data: LOTES_TRANSFERENCIA });
      if (url === '/almoxarifado/localizacoes') {
        return Promise.resolve({ data: [{ id: 1, codigo: 'A-01', descricao: 'Prateleira A' }, { id: 2, codigo: 'B-01', descricao: 'Prateleira B' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('Transferência é opção do formulário e Devolução não é', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('TRANSFERENCIA');
    expect(valores).not.toContain('DEVOLUCAO');
  });

  test('o filtro do livro continua oferecendo Devolução (TIPOS mantém o tipo)', async () => {
    await renderizar();
    const filtro = container.querySelector('.almox-filters select.almox-select');
    const valores = [...filtro.querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('DEVOLUCAO');
  });

  test('Transferência mostra origem E destino e o seletor de lote', async () => {
    await abrirModalNovaMovimentacao();
    const selectMaterial = container.querySelector('.almox-modal select.almox-form-select');
    preencher(selectMaterial, '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const rotulos = [...container.querySelectorAll('.almox-modal .almox-field label')].map((l) => l.textContent);
    expect(rotulos).toEqual(expect.arrayContaining(['Localização de origem', 'Localização de destino']));
    expect(container.querySelector('#mov-lote').tagName).toBe('SELECT');
  });

  test('Transferência NÃO mostra seletor de série (decisão 9: fora do escopo)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Motor 5cv', unidade: 'PC', controle_serie: 1 }] });
      }
      return Promise.resolve({ data: [] });
    });
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const rotulos = [...container.querySelectorAll('.almox-modal label')].map((l) => l.textContent);
    expect(rotulos.some((t) => t.startsWith('Séries a '))).toBe(false);
  });

  // Decisão 8: transferência não checa status nem vencimento — TODOS os lotes servem.
  test('na Transferência todos os lotes ficam selecionáveis, inclusive bloqueado e vencido', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const opcoes = [...container.querySelector('#mov-lote').querySelectorAll('option')].filter((o) => o.value);
    expect(opcoes).toHaveLength(3);
    expect(opcoes.map((o) => o.disabled)).toEqual([false, false, false]);
  });

  // Controle positivo do disabled: numa SAIDA os mesmos três lotes NÃO ficam todos habilitados.
  test('[controle positivo] na Saída o lote bloqueado e o vencido continuam desabilitados', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'SAIDA');
    await esperarEfeitos();

    const opcoes = [...container.querySelector('#mov-lote').querySelectorAll('option')].filter((o) => o.value);
    expect(opcoes.map((o) => o.disabled)).toEqual([false, true, true]);
  });

  test('Transferência posta origem, destino e lote no payload', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const inputs = [...container.querySelectorAll('.almox-modal input.almox-input')];
    preencher(inputs.find((i) => i.type === 'number'), '5');
    const selects = [...container.querySelectorAll('.almox-modal select.almox-form-select')];
    const origem = selects.find((s) => s.previousElementSibling?.textContent === 'Localização de origem')
      || selects[selects.length - 2];
    const destino = selects.find((s) => s.previousElementSibling?.textContent === 'Localização de destino')
      || selects[selects.length - 1];
    preencher(origem, '1');
    preencher(destino, '2');

    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/movimentacoes/v2', expect.objectContaining({
      tipo: 'TRANSFERENCIA', material_id: 10, quantidade: 5,
      localizacao_origem_id: 1, localizacao_destino_id: 2, lote_id: 41,
    }));
  });

  test('um hint aponta a tela nova de Devoluções', async () => {
    await abrirModalNovaMovimentacao();
    expect(container.querySelector('.almox-modal').textContent).toMatch(/Devolu/);
    expect(container.querySelector('.almox-modal').textContent).toMatch(/\/almoxarifado\/devolucoes|tela de Devolu/i);
  });
});
```

- [x] **Step 2: rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesAlmoxarifado --watchAll=false`
Expected: falham `Transferência é opção do formulário e Devolução não é`, os três de campos/lote da transferência, o do payload e o do hint. `o filtro do livro continua oferecendo Devolução` e o controle positivo da Saída **passam desde já** — é o comportamento que a task preserva.

> **Executado em 2026-08-12 (números reais): `5 failed, 10 passed, 15 total`.** As 5 falhas:
> `Transferência é opção do formulário e Devolução não é` (o select não tem a opção),
> `Transferência mostra origem E destino e o seletor de lote` (rótulos vieram sem nenhuma
> localização — o tipo virou `""` porque a opção não existe), `na Transferência todos os lotes
> ficam selecionáveis` (`#mov-lote` é `null`), `Transferência posta origem, destino e lote no
> payload` (recebido `{material_id: 10, quantidade: 5, tipo: ""}`) e `um hint aponta a tela nova
> de Devoluções`.
>
> **O plano previu 6 falhas e deu 5 — a diferença é informativa, não erro.** `Transferência NÃO
> mostra seletor de série` passa desde já: como `TRANSFERENCIA` nem era opção do select, o tipo
> ficava `""` e nenhum bloco de série renderizava. Ele é um teste de **regressão** (trava a
> decisão 9 contra quem depois quiser enfiar `TRANSFERENCIA` em `TIPOS_SAIDA_LOTE`), não um teste
> que a implementação faz virar verde. Quem contar só "falhou/passou" pode achar que o teste
> mede algo que ele ainda não mede — ele só passa a medir de verdade **depois** do Step 3.

- [x] **Step 3: implementar as constantes** — em `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`, substituir o bloco `TIPOS_FORM`/`TIPOS` (linhas 16-30) por:

```js
const TIPOS_FORM = [
  { value: 'ENTRADA', label: 'Entrada', cls: 'entrada' },
  { value: 'SAIDA', label: 'Saída', cls: 'saida' },
  { value: 'TRANSFERENCIA', label: 'Transferência', cls: 'transferencia' },
  { value: 'AJUSTE', label: 'Ajuste', cls: 'ajuste' },
  { value: 'SUCATA', label: 'Sucata', cls: 'saida' },
  { value: 'PERDA', label: 'Perda', cls: 'saida' },
];

// Lista completa para filtro e exibição no livro. Inclui ESTORNO (gerado pelo servidor ao
// cancelar) e DEVOLUCAO, que SAIU do formulário na Etapa 7 mas continua aqui: registrar
// "Devolução" no formulário genérico criava uma movimentação solta — sem motivo, sem condição,
// sem destino — e não criava registro nenhum em devolucoes_material_almoxarifado. O caminho certo
// é a tela /almoxarifado/devolucoes. Tirar DEVOLUCAO desta lista faria o livro parar de exibir os
// lançamentos antigos e o filtro perder a opção.
const TIPOS = [
  ...TIPOS_FORM,
  { value: 'DEVOLUCAO', label: 'Devolução', cls: 'devolucao' },
  { value: 'ESTORNO', label: 'Estorno', cls: 'estorno' },
];
```

Depois, substituir a definição de `TIPOS_SAIDA_LOTE` e `loteDisponivelParaTipo` (linhas 32-51) por:

```js
// SUCATA e PERDA são saídas para o motor (stockService.tiposSaida): baixam do disponível,
// respeitam controle_lote e o guard de status do lote — mas ficam de fora da guarda de
// vencimento (tiposDescarte), que é exatamente o ponto delas.
//
// Etapa 7: esta constante governa AGORA SÓ A SÉRIE (o seletor de séries a entregar/baixar e a
// validação de cardinalidade). Antes ela dirigia quatro coisas ao mesmo tempo — lote, origem,
// série e o rótulo "Disponível" —, e TRANSFERENCIA precisa de três delas mas NÃO da série
// (decisão 9 do design: o claim de série só existe para entrada e saída no motor; a transferência
// não tem caminho para mover o vínculo da série). Por isso os três conjuntos separados abaixo.
const TIPOS_SAIDA_LOTE = ['SAIDA', 'SUCATA', 'PERDA'];
const TIPOS_COM_LOTE_EXISTENTE = ['SAIDA', 'SUCATA', 'PERDA', 'TRANSFERENCIA'];
const TIPOS_COM_ORIGEM = ['SAIDA', 'SUCATA', 'PERDA', 'TRANSFERENCIA'];
const TIPOS_COM_DESTINO = ['ENTRADA', 'TRANSFERENCIA'];

// Fix round 1 (review da Task 9 da Etapa 6): `elegivel`, que a API devolve por lote, é calculado
// SÓ a partir do lote (status ATIVO && (!vencido || vencimento_liberado)) — o servidor não sabe
// qual tipo de movimento a tela está montando. Certo para SAIDA, errado para SUCATA/PERDA, que o
// motor isenta da guarda de vencimento de propósito.
//
// Etapa 7: TRANSFERENCIA aceita TODOS os lotes — nem status nem vencimento (decisão 8). Mover um
// lote reprovado de prateleira é legítimo: é assim que ele vai parar na área de bloqueados.
const TIPOS_DESCARTE_LOTE = ['SUCATA', 'PERDA'];
const loteDisponivelParaTipo = (lote, tipo) => {
  if (tipo === 'TRANSFERENCIA') return true;
  return TIPOS_DESCARTE_LOTE.includes(tipo) ? lote.status === 'ATIVO' : lote.elegivel;
};
```

- [x] **Step 4: trocar cada uso de `TIPOS_SAIDA_LOTE` pelo conjunto certo**

Substituições exatas, uma a uma (as linhas se movem conforme você edita — case pelo texto, não pelo número):

| Onde | De | Para |
|---|---|---|
| efeito que carrega lotes (~147) | `!TIPOS_SAIDA_LOTE.includes(form.tipo)` | `!TIPOS_COM_LOTE_EXISTENTE.includes(form.tipo)` |
| efeito que carrega séries (~169) | `!TIPOS_SAIDA_LOTE.includes(form.tipo)` | **não mexer** (série) |
| validação de cardinalidade (~267) | `TIPOS_SAIDA_LOTE.includes(form.tipo)` | **não mexer** (série) |
| payload origem (~292) | `TIPOS_SAIDA_LOTE.includes(form.tipo) && form.localizacao_origem_id` | `TIPOS_COM_ORIGEM.includes(form.tipo) && form.localizacao_origem_id` |
| payload destino (~293) | `form.tipo === 'ENTRADA' && form.localizacao_destino_id` | `TIPOS_COM_DESTINO.includes(form.tipo) && form.localizacao_destino_id` |
| payload lote_id (~298) | `TIPOS_SAIDA_LOTE.includes(form.tipo) && form.lote_id` | `TIPOS_COM_LOTE_EXISTENTE.includes(form.tipo) && form.lote_id` |
| payload serie_ids (~303) | `TIPOS_SAIDA_LOTE.includes(form.tipo)` | **não mexer** (série) |
| `mostraLote` no onChange (~543) | `novoTipo === 'ENTRADA' \|\| TIPOS_SAIDA_LOTE.includes(novoTipo)` | `novoTipo === 'ENTRADA' \|\| TIPOS_COM_LOTE_EXISTENTE.includes(novoTipo)` |
| reset de destino (~551) | `novoTipo === 'ENTRADA' ? f.localizacao_destino_id : ''` | `TIPOS_COM_DESTINO.includes(novoTipo) ? f.localizacao_destino_id : ''` |
| reset de origem (~553) | `TIPOS_SAIDA_LOTE.includes(novoTipo) ? f.localizacao_origem_id : ''` | `TIPOS_COM_ORIGEM.includes(novoTipo) ? f.localizacao_origem_id : ''` |
| reset de serie_ids (~557) | `TIPOS_SAIDA_LOTE.includes(novoTipo)` | **não mexer** (série) |
| rótulo "Disponível" (~571) | `TIPOS_SAIDA_LOTE.includes(form.tipo)` | `TIPOS_COM_ORIGEM.includes(form.tipo)` |
| campo de destino (~640) | `{form.tipo === 'ENTRADA' && (` | `{TIPOS_COM_DESTINO.includes(form.tipo) && (` |
| custo unitário (~655) | `{form.tipo === 'ENTRADA' && (` | **não mexer** (custo só na entrada) |
| campo de origem (~663) | `{TIPOS_SAIDA_LOTE.includes(form.tipo) && (` | `{TIPOS_COM_ORIGEM.includes(form.tipo) && (` |
| bloco do lote (~678) | `{(form.tipo === 'ENTRADA' \|\| TIPOS_SAIDA_LOTE.includes(form.tipo)) && (` | `{(form.tipo === 'ENTRADA' \|\| TIPOS_COM_LOTE_EXISTENTE.includes(form.tipo)) && (` |
| select vs input do lote (~681) | `{TIPOS_SAIDA_LOTE.includes(form.tipo) ? (` | `{TIPOS_COM_LOTE_EXISTENTE.includes(form.tipo) ? (` |
| seletor de séries (~738) | `TIPOS_SAIDA_LOTE.includes(form.tipo)` | **não mexer** (série) |

- [x] **Step 5: acrescentar o hint da tela nova**

No JSX do modal, logo abaixo do `<div className="almox-field">` do campo Tipo (depois do `</select>` de tipos e antes do fechamento daquele `div`), acrescentar:

```jsx
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Devolução de material entregue é registrada na tela de{' '}
                      <a href="/almoxarifado/devolucoes">Devoluções</a> — lá a devolução fica ligada
                      à entrega de origem, com condição, destino e lote.
                    </small>
```

> **CORREÇÃO — o plano se contradizia aqui (achado da execução de 2026-08-12).** O texto original
> deste Step era `na tela{' '}<a>Devoluções</a>`, cujo `textContent` é `"na tela Devoluções"`. O
> teste do Step 1 exige `/\/almoxarifado\/devolucoes|tela de Devolu/i`: o `href` **não** entra no
> `textContent`, e `"na tela Devoluções"` **não** casa com `"tela de Devolu"` (falta o "de"). Ou
> seja, seguir o Step 5 ao pé da letra deixava o Step 6 vermelho. Resolvido pelo lado da
> implementação (`na tela de{' '}<a>Devoluções</a>`) e não afrouxando o teste: a asserção existe
> para garantir que o operador leia **para onde ir**, e "na tela de Devoluções" é a frase que ele
> lê. O bloco de código acima já está corrigido.

- [x] **Step 6: rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesAlmoxarifado --watchAll=false`
Expected: todos os testes do arquivo passam (os antigos de estorno/SUCATA/PERDA inclusive).

Controle positivo (obrigatório, e desfazer depois): remover `'TRANSFERENCIA'` de `TIPOS_COM_DESTINO` e confirmar que `Transferência mostra origem E destino e o seletor de lote` falha; restaurar.

- [x] **Step 7: gates de cliente**

Run: `cd client && CI=true npx react-scripts test --watchAll=false` — suíte inteira.
Run: `cd client && CI=true npx react-scripts build` — `CI=true` faz warning virar erro (constante não usada quebra o build; se você deixou `TIPOS_SAIDA_LOTE` sem uso, este passo pega).

> **Executado em 2026-08-12 (números reais):** arquivo só — `15 passed, 15 total` (era `5 failed,
> 10 passed`). Suíte inteira do cliente — **185 passed em 16 suítes**, 0 falhas (linha de base
> antes desta task: 177 em 16; os 8 novos são os desta task). Build — `Compiled successfully.` com
> `CI=true`, nenhum warning. Controle positivo executado e desfeito: remover `'TRANSFERENCIA'` de
> `TIPOS_COM_DESTINO` derruba **2** testes (`Transferência mostra origem E destino e o seletor de
> lote` e `Transferência posta origem, destino e lote no payload` → `2 failed, 13 passed`),
> provando que é a constante que os sustenta. `TIPOS_SAIDA_LOTE` continua em uso (série: efeito de
> busca, cardinalidade, `payload.serie_ids`, reset no onChange e o bloco de checkboxes), então o
> build não acusa constante morta.

- [x] **Step 8: commit**

```bash
git add client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js \
        client/src/components/almoxarifado/MovimentacoesAlmoxarifado.test.js
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: Transferencia entra no formulario de Movimentacoes e Devolucao sai

A transferencia existia so por API desde sempre — nenhuma tela chamava
POST /transferencias. E o formulario de Movimentacoes ja tinha 90% dela pronta:
os dois campos de localizacao e o seletor de lote. Duas telas dedicadas foi
descartado por duplicar seletor de material, de localizacao e de lote.

DEVOLUCAO sai do formulario porque registrar "Devolucao" ali criava uma
movimentacao solta — sem motivo, sem condicao, sem destino — e nao criava
registro nenhum em devolucoes_material_almoxarifado. Continua em TIPOS, a lista
completa: tira-la de la faria o livro parar de exibir os lancamentos antigos e o
filtro perder a opcao. Um hint aponta a tela nova.

TIPOS_SAIDA_LOTE dirigia quatro coisas ao mesmo tempo (lote, localizacao de
origem, serie e o rotulo Disponivel). A transferencia precisa de tres delas mas
NAO da serie — serie na transferencia esta fora de escopo, porque o claim de
serie no motor so existe para entrada e saida. Enfiar TRANSFERENCIA na constante
existente ligaria o seletor de serie junto e o formulario passaria a exigir
series que o motor nem le nesse tipo. Por isso tres conjuntos separados, e
TIPOS_SAIDA_LOTE fica governando so a serie.

Na transferencia todos os lotes ficam selecionaveis, inclusive bloqueado e
vencido: mover um lote reprovado de prateleira e legitimo, e assim que ele vai
parar na area de bloqueados. Na saida os dois continuam desabilitados.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: tela nova `/almoxarifado/devolucoes`

**Files:**
- Create: `client/src/components/almoxarifado/DevolucoesAlmoxarifado.js`
- Create: `client/src/components/almoxarifado/DevolucoesAlmoxarifado.test.js`
- Modify: `client/src/App.js` (bloco `path="/almoxarifado"`, junto de `<Route path="lotes" ... />`)
- Modify: `client/src/components/Layout.js` (array `almoxarifadoMenuItems`, vizinho de `Lotes e Séries`)

**Interfaces:**
- Consumes: `GET /almoxarifado/devolucoes`, `GET /almoxarifado/devolucoes/saidas-elegiveis?material_id=X` (Task 4), `GET /almoxarifado/materiais`, `GET /almoxarifado/materiais/:id/lotes?com_saldo=1`, `POST /almoxarifado/devolucoes` com `{ material_id, quantidade, motivo, condicao, destino, movimentacao_saida_id?, lote_id?, series?, observacoes? }` (Tasks 3-5).
- Produces: componente `DevolucoesAlmoxarifado` (default export), rota `/almoxarifado/devolucoes`, item de menu.
- Permissão: `movimentar` (a mesma que a rota já exige). `useAlmoxPermissoes`/`bloquearSeNaoPode` só barram antes do formulário — quem decide é o backend.

- [ ] **Step 1: escrever o teste que falha** — `client/src/components/almoxarifado/DevolucoesAlmoxarifado.test.js`:

```js
/**
 * Etapa 7, Task 7 — tela de devoluções.
 *
 * A rota POST /devolucoes existia desde sempre sem nenhuma tela: só era alcançável por chamada
 * direta à API. Estes testes cobrem as duas regras de UX que o design marca como essenciais — a
 * sugestão condição→destino (que existe SÓ na tela; o backend aceita qualquer combinação) e o
 * limite de quantidade pelo saldo devolvível da entrega escolhida — mais o caminho avulso, que é
 * o que impede a tela de travar quem devolve material sem registro de saída.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/DevolucoesAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DevolucoesAlmoxarifado from './DevolucoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const MATERIAL = { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', controle_lote: 0, controle_serie: 0 };
const MATERIAL_LOTE = { id: 11, codigo: 'MAT-2', nome: 'Perfil L', unidade: 'PC', controle_lote: 1, controle_serie: 0 };
const MATERIAL_SERIE = { id: 12, codigo: 'MAT-3', nome: 'Motor 5cv', unidade: 'PC', controle_lote: 0, controle_serie: 1 };

const SAIDA_COM_SALDO = {
  id: 501, tipo: 'SAIDA_PRODUCAO', quantidade: 10, quantidade_devolvida: 3, saldo_devolvivel: 7,
  created_at: '2026-08-10T10:00:00Z', lote_id: null, lote: null,
  requisicao_id: 77, requisicao_numero: 'REQ-77', os_id: null, projeto_id: null,
  usuario_nome: 'Maria', series: [],
};
const SAIDA_ZERADA = {
  id: 502, tipo: 'SAIDA', quantidade: 4, quantidade_devolvida: 4, saldo_devolvivel: 0,
  created_at: '2026-08-09T10:00:00Z', lote_id: null, lote: null,
  requisicao_id: null, requisicao_numero: null, os_id: null, projeto_id: null,
  usuario_nome: 'João', series: [],
};
const DEVOLUCOES = [{
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  quantidade: 3, motivo: 'SOBRA_PROJETO', condicao: 'BOA', destino: 'ESTOQUE',
  movimentacao_saida_id: 501, responsavel_nome: 'Maria', created_at: '2026-08-11T10:00:00Z',
}];

let container;
let root;
let saidasDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saidasDoBanco = [SAIDA_COM_SALDO, SAIDA_ZERADA];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL, MATERIAL_LOTE, MATERIAL_SERIE] });
    if (url === '/almoxarifado/devolucoes') return Promise.resolve({ data: DEVOLUCOES });
    if (url.startsWith('/almoxarifado/devolucoes/saidas-elegiveis')) return Promise.resolve({ data: saidasDoBanco });
    if (url.includes('/lotes')) {
      return Promise.resolve({ data: [{ id: 90, codigo: 'L-1', status: 'ATIVO', saldo: 12, elegivel: true }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 9 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><DevolucoesAlmoxarifado /></MemoryRouter>);
  });
}

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function abrirModal() {
  await renderizar();
  await esperarEfeitos();
  const botao = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Devolução'));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const campo = (id) => container.querySelector(`#${id}`);

async function escolherMaterial(id) {
  preencher(campo('dev-material'), String(id));
  await esperarEfeitos();
}

describe('DevolucoesAlmoxarifado — lista', () => {
  test('lista as devoluções com material, destino e a saída de origem', async () => {
    await renderizar();
    await esperarEfeitos();
    const linha = container.querySelector('.almox-table tbody tr');
    expect(linha.textContent).toContain('MAT-1');
    expect(linha.textContent).toContain('Estoque');
    expect(linha.textContent).toContain('501');
  });
});

describe('DevolucoesAlmoxarifado — sugestão condição→destino', () => {
  test('Boa sugere Estoque, Suspeita sugere Quarentena, Danificada sugere Sucata', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);

    preencher(campo('dev-condicao'), 'BOA');
    expect(campo('dev-destino').value).toBe('ESTOQUE');
    preencher(campo('dev-condicao'), 'SUSPEITA');
    expect(campo('dev-destino').value).toBe('QUARENTENA');
    preencher(campo('dev-condicao'), 'DANIFICADA');
    expect(campo('dev-destino').value).toBe('SUCATA');
  });

  test('a sugestão não trava: o operador troca o destino e a condição não o desfaz', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-condicao'), 'DANIFICADA');
    preencher(campo('dev-destino'), 'RETRABALHO');
    expect(campo('dev-destino').value).toBe('RETRABALHO');
  });
});

describe('DevolucoesAlmoxarifado — saída de origem e limite de quantidade', () => {
  test('oferece as saídas do material e desabilita a já devolvida por inteiro', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    const opcoes = [...campo('dev-saida').querySelectorAll('option')];
    const zerada = opcoes.find((o) => o.value === '502');
    expect(opcoes.find((o) => o.value === '501').disabled).toBe(false);
    expect(zerada.disabled).toBe(true);
    expect(zerada.textContent).toMatch(/devolvid/i);
  });

  test('escolhida a saída, a quantidade fica limitada ao saldo devolvível', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '501');
    expect(campo('dev-quantidade').getAttribute('max')).toBe('7');
  });

  test('quantidade acima do devolvível não chega a ser enviada', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '501');
    preencher(campo('dev-quantidade'), '9');
    preencher(campo('dev-motivo'), 'SOBRA_PROJETO');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('devolução avulsa (sem saída) é permitida e não manda movimentacao_saida_id', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-quantidade'), '2');
    preencher(campo('dev-motivo'), 'NAO_UTILIZADO');
    preencher(campo('dev-condicao'), 'BOA');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/devolucoes', expect.objectContaining({
      material_id: 10, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
    }));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('movimentacao_saida_id');
  });
});

describe('DevolucoesAlmoxarifado — lote e série', () => {
  test('lote herdado da saída aparece em leitura, sem seletor', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, lote_id: 90, lote: 'L-1' }];
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    preencher(campo('dev-saida'), '501');
    await esperarEfeitos();
    expect(container.querySelector('.almox-modal').textContent).toContain('L-1');
    expect(campo('dev-lote')).toBeNull();
  });

  test('sem lote a herdar, material com controle de lote ganha seletor', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    await esperarEfeitos();
    expect(campo('dev-lote')).not.toBeNull();
    expect([...campo('dev-lote').querySelectorAll('option')].map((o) => o.textContent).join(' ')).toContain('L-1');
  });

  test('material com série: checkboxes das séries entregues naquela saída', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, series: [{ id: 1, numero: 'SN-1', status: 'ENTREGUE' }, { id: 2, numero: 'SN-2', status: 'ENTREGUE' }] }];
    await abrirModal();
    await escolherMaterial(MATERIAL_SERIE.id);
    preencher(campo('dev-saida'), '501');
    await esperarEfeitos();
    const numeros = [...container.querySelectorAll('.almox-modal input[type="checkbox"]')].map((c) => c.value);
    expect(numeros).toEqual(['SN-1', 'SN-2']);
  });

  // Decisão 10: a tela EXPLICA o caminho de dois passos em vez de deixar o envio falhar.
  test('destino Sucata em material com série não oferece as séries e explica o caminho', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, series: [{ id: 1, numero: 'SN-1', status: 'ENTREGUE' }] }];
    await abrirModal();
    await escolherMaterial(MATERIAL_SERIE.id);
    preencher(campo('dev-saida'), '501');
    preencher(campo('dev-destino'), 'SUCATA');
    await esperarEfeitos();
    expect(container.querySelectorAll('.almox-modal input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('.almox-modal').textContent).toMatch(/Movimenta/);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/DevolucoesAlmoxarifado --watchAll=false`
Expected: falha na importação — `Cannot find module './DevolucoesAlmoxarifado'`.

- [ ] **Step 3: implementar a tela** — `client/src/components/almoxarifado/DevolucoesAlmoxarifado.js`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiCornerUpLeft, FiRefreshCw } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Tela de devoluções (Etapa 7, Task 7).
 *
 * `POST /devolucoes` existia desde sempre sem nenhuma tela — só era alcançável por chamada direta
 * à API. O fluxo desta tela é material → saídas daquele material → devolver com herança de lote, e
 * não cabia no formulário genérico de Movimentações (por isso `DEVOLUCAO` saiu de lá na Task 6:
 * registrar ali criava movimentação solta e nenhum registro de devolução).
 *
 * Começar pelo MATERIAL, e não pela requisição, é decisão do design: pela requisição não se
 * alcança saída manual sem requisição, e SAIDA_PRODUCAO/MONTAGEM/ASSISTENCIA existem exatamente
 * para isso.
 *
 * A sugestão condição→destino vive SÓ aqui. O backend aceita qualquer combinação de propósito —
 * uma regra rígida no motor criaria um caso sem saída (material bom que precisa ir para inspeção
 * por outro motivo). A sugestão guia quem está aprendendo sem travar o caso fora da regra.
 */

// A lista que `returnService.MOTIVOS` já exporta no servidor, com rótulo legível.
const MOTIVOS = [
  { value: 'SOBRA_PROJETO', label: 'Sobra de projeto' },
  { value: 'NAO_UTILIZADO', label: 'Não utilizado' },
  { value: 'ITEM_ERRADO', label: 'Item errado' },
  { value: 'DANIFICADO', label: 'Danificado' },
  { value: 'RECUPERAVEL', label: 'Recuperável' },
  { value: 'SUCATA', label: 'Sucata' },
];

const CONDICOES = [
  { value: 'BOA', label: 'Boa', destino: 'ESTOQUE' },
  { value: 'SUSPEITA', label: 'Suspeita', destino: 'QUARENTENA' },
  { value: 'DANIFICADA', label: 'Danificada', destino: 'SUCATA' },
];

const DESTINOS = [
  { value: 'ESTOQUE', label: 'Estoque', cls: 'ok', ajuda: 'Volta ao saldo disponível.' },
  { value: 'QUARENTENA', label: 'Quarentena', cls: 'baixo', ajuda: 'Volta ao saldo, mas bloqueado até a inspeção decidir.' },
  { value: 'SUCATA', label: 'Sucata', cls: 'critico', ajuda: 'Entra e sai: o saldo não muda e o descarte fica no livro.' },
  { value: 'RETRABALHO', label: 'Retrabalho', cls: 'vazio', ajuda: 'Só registra no livro — não altera saldo nenhum.' },
];
const destinoInfo = (d) => DESTINOS.find((x) => x.value === d) || { label: d || '—', cls: 'vazio', ajuda: '' };

// Decisão 10 do design: devolução com série cobre só ESTOQUE e QUARENTENA. Para sucatear peça
// serializada devolvida, o caminho é devolver ao estoque e depois baixar em Movimentações, que
// tem seletor de série. A tela explica isso em vez de deixar o envio falhar no servidor.
const DESTINOS_COM_SERIE = ['ESTOQUE', 'QUARENTENA'];

const FORM_VAZIO = {
  material_id: '', movimentacao_saida_id: '', quantidade: '', motivo: '',
  condicao: '', destino: 'ESTOQUE', observacoes: '', lote_id: '', series: [], seriesTexto: '',
};

const formatData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

const DevolucoesAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [devolucoes, setDevolucoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const materialSelecionado = materiais.find((m) => m.id === parseInt(form.material_id, 10));
  const saidaSelecionada = saidas.find((s) => String(s.id) === String(form.movimentacao_saida_id));
  const maxDevolvivel = saidaSelecionada ? saidaSelecionada.saldo_devolvivel : null;
  const loteHerdado = saidaSelecionada && saidaSelecionada.lote_id ? saidaSelecionada : null;
  const precisaSeletorDeLote = materialSelecionado?.controle_lote === 1 && !loteHerdado;
  const aceitaSerie = materialSelecionado?.controle_serie === 1 && DESTINOS_COM_SERIE.includes(form.destino);

  const loadDevolucoes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/devolucoes');
      setDevolucoes(res.data || []);
    } catch (e) {
      toast.error('Erro ao carregar devoluções');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get('/almoxarifado/materiais').then((res) => setMateriais(res.data || [])).catch(() => setMateriais([]));
    loadDevolucoes();
  }, [loadDevolucoes]);

  // Guarda `cancelado` (molde de LotesAlmoxarifado): trocar de material antes da resposta chegar
  // precisa descartá-la, senão a lista de saídas do material anterior pinta a do atual.
  useEffect(() => {
    if (!form.material_id) { setSaidas([]); return undefined; }
    let cancelado = false;
    api.get(`/almoxarifado/devolucoes/saidas-elegiveis?material_id=${form.material_id}`)
      .then((res) => { if (!cancelado) setSaidas(res.data || []); })
      .catch(() => { if (!cancelado) setSaidas([]); });
    return () => { cancelado = true; };
  }, [form.material_id]);

  useEffect(() => {
    if (!form.material_id) { setLotes([]); return undefined; }
    let cancelado = false;
    api.get(`/almoxarifado/materiais/${form.material_id}/lotes?com_saldo=1`)
      .then((res) => { if (!cancelado) setLotes(res.data || []); })
      .catch(() => { if (!cancelado) setLotes([]); });
    return () => { cancelado = true; };
  }, [form.material_id]);

  const abrirModal = (e) => {
    if (!bloquearSeNaoPode('movimentar', e)) return;
    setForm(FORM_VAZIO);
    setShowModal(true);
  };

  // Condição SUGERE o destino (decisão 6). Trocar a condição repropõe; trocar o destino direto
  // manda — a sugestão nunca desfaz uma escolha explícita, porque quem decide o destino é quem
  // está com a peça na mão.
  const escolherCondicao = (valor) => {
    const sugestao = CONDICOES.find((c) => c.value === valor);
    setForm((f) => ({ ...f, condicao: valor, destino: sugestao ? sugestao.destino : f.destino }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const quantidade = parseFloat(form.quantidade);
    if (!form.material_id || !quantidade || quantidade <= 0) {
      toast.error('Selecione o material e informe a quantidade');
      return;
    }
    if (!form.motivo) { toast.error('Informe o motivo da devolução'); return; }
    // O servidor é a autoridade sobre o limite (validarSaidaOriginal). Esta checagem só evita a
    // ida a ele quando o resultado já é sabido.
    if (maxDevolvivel !== null && quantidade > maxDevolvivel) {
      toast.error(`Esta entrega ainda aceita ${maxDevolvivel} de devolução`);
      return;
    }
    if (precisaSeletorDeLote && !form.lote_id) {
      toast.error('Material com controle por lote: informe de qual lote é a devolução');
      return;
    }
    const seriesFinal = saidaSelecionada
      ? form.series
      : String(form.seriesTexto || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (aceitaSerie && seriesFinal.length !== quantidade) {
      toast.error('Selecione exatamente a quantidade de séries informada');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        material_id: Number(form.material_id),
        quantidade,
        motivo: form.motivo,
        destino: form.destino,
      };
      if (form.condicao) payload.condicao = form.condicao;
      if (form.observacoes) payload.observacoes = form.observacoes;
      if (form.movimentacao_saida_id) payload.movimentacao_saida_id = Number(form.movimentacao_saida_id);
      if (precisaSeletorDeLote && form.lote_id) payload.lote_id = Number(form.lote_id);
      if (aceitaSerie) payload.series = seriesFinal;

      await api.post('/almoxarifado/devolucoes', payload);
      toast.success('Devolução registrada!');
      setShowModal(false);
      loadDevolucoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar devolução');
    } finally {
      setSaving(false);
    }
  };

  const rotuloSaida = (s) => {
    const partes = [formatData(s.created_at), s.tipo, `${s.quantidade} un`];
    if (s.requisicao_numero) partes.push(s.requisicao_numero);
    else if (s.os_id) partes.push(`OS ${s.os_id}`);
    if (s.usuario_nome) partes.push(s.usuario_nome);
    if (s.lote) partes.push(`lote ${s.lote}`);
    partes.push(s.saldo_devolvivel > 0 ? `devolvível ${s.saldo_devolvivel}` : 'já devolvido por inteiro');
    return partes.join(' · ');
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiCornerUpLeft size={20} /> Devoluções</h1>
          <p>Material que voltou do chão de fábrica, ligado à entrega que o originou.</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadDevolucoes}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-primary" onClick={abrirModal}>Nova Devolução</button>
        </div>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={8} /> : devolucoes.length === 0 ? (
          <div className="almox-empty"><p>Nenhuma devolução registrada</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Data</th><th>Material</th><th>Qtd</th><th>Motivo</th>
                <th>Condição</th><th>Destino</th><th>Saída de origem</th><th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {devolucoes.map((d) => {
                const info = destinoInfo(d.destino);
                const motivo = MOTIVOS.find((m) => m.value === d.motivo);
                return (
                  <tr key={d.id}>
                    <td>{formatData(d.created_at)}</td>
                    <td>{d.material_codigo} — {d.material_nome}</td>
                    <td>{d.quantidade}</td>
                    <td>{motivo ? motivo.label : d.motivo}</td>
                    <td>{d.condicao || '—'}</td>
                    <td><span className={`almox-badge almox-badge-${info.cls}`}>{info.label}</span></td>
                    <td>{d.movimentacao_saida_id ? `#${d.movimentacao_saida_id}` : 'avulsa'}</td>
                    <td>{d.responsavel_nome || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="almox-modal-overlay" onClick={() => { if (!saving) setShowModal(false); }}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Nova devolução</h2>
              <button className="almox-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="almox-modal-body">
                <div className="almox-form-grid">
                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-material">Material<span className="required">*</span></label>
                    <select id="dev-material" className="almox-form-select" value={form.material_id}
                      onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value, movimentacao_saida_id: '', lote_id: '', series: [] }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
                    </select>
                  </div>

                  <div className="almox-field almox-form-full">
                    <label className="almox-label" htmlFor="dev-saida">Entrega de origem</label>
                    <select id="dev-saida" className="almox-form-select" value={form.movimentacao_saida_id}
                      onChange={(e) => setForm((f) => ({ ...f, movimentacao_saida_id: e.target.value, series: [] }))}>
                      <option value="">Devolução avulsa (sem entrega registrada)</option>
                      {saidas.map((s) => (
                        <option key={s.id} value={s.id} disabled={s.saldo_devolvivel <= 0}>{rotuloSaida(s)}</option>
                      ))}
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Avulsa serve para sobra antiga ou material entregue antes do sistema — sem entrega, não há
                      limite de quantidade nem lote a herdar.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-quantidade">Quantidade<span className="required">*</span></label>
                    <input id="dev-quantidade" className="almox-input" type="number" min="0" step="1"
                      max={maxDevolvivel !== null ? String(maxDevolvivel) : undefined}
                      value={form.quantidade}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                    {maxDevolvivel !== null && (
                      <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                        Devolvível nesta entrega: {maxDevolvivel} {materialSelecionado?.unidade || ''}
                      </small>
                    )}
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-motivo">Motivo<span className="required">*</span></label>
                    <select id="dev-motivo" className="almox-form-select" value={form.motivo}
                      onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}>
                      <option value="">Selecionar...</option>
                      {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-condicao">Condição</label>
                    <select id="dev-condicao" className="almox-form-select" value={form.condicao}
                      onChange={(e) => escolherCondicao(e.target.value)}>
                      <option value="">Não avaliada</option>
                      {CONDICOES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      A condição sugere o destino — você pode trocar.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-destino">Destino<span className="required">*</span></label>
                    <select id="dev-destino" className="almox-form-select" value={form.destino}
                      onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}>
                      {DESTINOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      {destinoInfo(form.destino).ajuda}
                    </small>
                  </div>

                  {loteHerdado && (
                    <div className="almox-field">
                      <label className="almox-label">Lote (herdado da entrega)</label>
                      <div className="almox-badge almox-badge-ok">{loteHerdado.lote || `#${loteHerdado.lote_id}`}</div>
                    </div>
                  )}
                  {precisaSeletorDeLote && (
                    <div className="almox-field">
                      <label className="almox-label" htmlFor="dev-lote">Lote<span className="required">*</span></label>
                      <select id="dev-lote" className="almox-form-select" value={form.lote_id}
                        onChange={(e) => setForm((f) => ({ ...f, lote_id: e.target.value }))}>
                        <option value="">Selecionar lote...</option>
                        {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo} — saldo {l.saldo}</option>)}
                      </select>
                    </div>
                  )}

                  {aceitaSerie && saidaSelecionada && (
                    <div className="almox-field almox-form-full">
                      <label className="almox-label">Séries devolvidas<span className="required">*</span></label>
                      <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: 6 }}>
                        {saidaSelecionada.series.map((s) => (
                          <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                            <input type="checkbox" value={s.numero} checked={form.series.includes(s.numero)}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                series: e.target.checked ? [...f.series, s.numero] : f.series.filter((n) => n !== s.numero),
                              }))} />
                            {s.numero}
                          </label>
                        ))}
                        {saidaSelecionada.series.length === 0 && <small>Nenhuma série em aberto nesta entrega.</small>}
                      </div>
                      <small>{form.series.length}/{form.quantidade || 0} série(s) selecionada(s)</small>
                    </div>
                  )}
                  {aceitaSerie && !saidaSelecionada && (
                    <div className="almox-field almox-form-full">
                      <label className="almox-label">Números de série (um por linha)<span className="required">*</span></label>
                      <textarea className="almox-textarea" rows={3} value={form.seriesTexto}
                        onChange={(e) => setForm((f) => ({ ...f, seriesTexto: e.target.value }))} />
                    </div>
                  )}
                  {materialSelecionado?.controle_serie === 1 && !DESTINOS_COM_SERIE.includes(form.destino) && (
                    <div className="almox-field almox-form-full">
                      <small style={{ color: 'var(--gmp-warning)', fontSize: '0.78rem' }}>
                        Peça com número de série não pode ir direto para {destinoInfo(form.destino).label} por aqui.
                        Devolva ao Estoque e registre a baixa na tela Movimentações, que tem seletor de série.
                      </small>
                    </div>
                  )}

                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Observações</label>
                    <textarea className="almox-textarea" rows={2} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Registrar devolução'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevolucoesAlmoxarifado;
```

- [ ] **Step 4: registrar a rota e o menu**

Em `client/src/App.js`, junto do import dos outros componentes do almoxarifado:

```js
import DevolucoesAlmoxarifado from './components/almoxarifado/DevolucoesAlmoxarifado';
```

e, no bloco `path="/almoxarifado"`, logo depois de `<Route path="lotes" element={<LotesAlmoxarifado />} />`:

```jsx
        <Route path="devolucoes" element={<DevolucoesAlmoxarifado />} />
```

Em `client/src/components/Layout.js`, no array `almoxarifadoMenuItems`, logo depois da linha de
`/almoxarifado/lotes`:

```js
    { path: '/almoxarifado/devolucoes', icon: FiCornerUpLeft, label: 'Devoluções' },
```

e acrescentar `FiCornerUpLeft` ao import de `react-icons/fi` do arquivo.

- [ ] **Step 5: rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/DevolucoesAlmoxarifado --watchAll=false`
Expected: `11 passed`.

Controle positivo (obrigatório, e desfazer depois): trocar `destino: sugestao ? sugestao.destino : f.destino` por `destino: f.destino` em `escolherCondicao` e confirmar que `Boa sugere Estoque, Suspeita sugere Quarentena, Danificada sugere Sucata` falha; restaurar.

- [ ] **Step 6: gates de cliente**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Run: `cd client && CI=true npx react-scripts build`

- [ ] **Step 7: commit**

```bash
git add client/src/components/almoxarifado/DevolucoesAlmoxarifado.js \
        client/src/components/almoxarifado/DevolucoesAlmoxarifado.test.js \
        client/src/App.js \
        client/src/components/Layout.js
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: tela de devolucoes ligada a entrega de origem

POST /devolucoes existia desde sempre e nao tinha tela nenhuma: so era alcancavel
por chamada direta a API. O fluxo dela — material, depois as entregas daquele
material, depois devolver herdando o lote — nao cabe num formulario generico, e e
por isso que DEVOLUCAO saiu do formulario de Movimentacoes na task anterior.

Comeca pelo MATERIAL e nao pela requisicao: pela requisicao nao se alcanca saida
manual sem requisicao, e SAIDA_PRODUCAO/MONTAGEM/ASSISTENCIA existem exatamente
para esse caso. Tela unica com abas junto de transferencias foi descartada por
juntar dois assuntos que nao compartilham nada alem de "mexem em material".

A sugestao condicao->destino (boa/estoque, suspeita/quarentena,
danificada/sucata) vive SO na tela: o backend aceita qualquer combinacao de
proposito, porque uma regra rigida no motor criaria caso sem saida (material bom
que precisa ir para inspecao por outro motivo). Trocar o destino a mao nao e
desfeito pela sugestao — quem decide e quem esta com a peca na mao.

Entrega ja devolvida por inteiro continua listada, desabilitada: esconde-la faria
o operador procurar uma entrega que o sistema decidiu nao mostrar.

Peca com numero de serie indo para sucata: a tela nao oferece as series e explica
o caminho de dois passos, em vez de deixar o envio falhar no servidor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: documentação e verificação final da etapa

**Files:** os **6 documentos** listados na seção final da spec de design, cada um com o que muda:

1. **`specs/modulo-almoxarifado/11-transferencias/README.md`**
   - Status no topo: 🟡 → 🟢 nas colunas de backend/regra, com a data e o range de hashes.
   - Checklist: marcar `[x]` com hash os dois itens da auditoria — "Declarar `exigeLote` na rota `POST /transferencias`" e "Incluir `TRANSFERENCIA` em `REGRAS_VINCULO`" (Task 2) — e o item de tela, que passa a ser o formulário de Movimentações (Task 6), **não** uma tela dedicada.
   - Os itens de trânsito (`transferencias_almoxarifado` com máquina de estados, localização virtual "em trânsito", recebimento com conferência, aprovação, e-mail/alerta) mudam de `[ ]` para **`[~] CORTADO por decisão do cliente (2026-08-12)`**, com o motivo escrito: **os almoxarifados são áreas físicas do mesmo site, o cliente tem uma filial só; alguém pega a caixa e leva na hora.** Escrever explicitamente: *"isto é corte deliberado, não pendência esquecida — se um dia o cliente passar a ter obra externa ou segundo prédio, o item volta com justificativa nova"*.
   - Acrescentar a pendência declarada: **série na transferência fora de escopo** (decisão 9) — o `localizacao_id` da série é informativo; o saldo real vive em `estoque_saldo_almoxarifado`, que a transferência move corretamente.
   - Acrescentar a decisão 8 como comportamento intencional testado: transferência não checa status nem vencimento do lote.
   - Corrigir a tabela "Regras essenciais + testes exigidos": as linhas de trânsito/recebimento/cancelamento saem (cortadas); entram as quatro de `transferenciaRegras.api.test.js`.

2. **`specs/modulo-almoxarifado/12-devolucoes/README.md`**
   - Status e checklist: `[x]` com hash em "Vincular devolução à movimentação de saída original" e "Devolução com lote" (Tasks 3-5); "Condição → destino" marcado como **entregue na tela** (sugestão), com a nota de que o backend não valida a combinação de propósito.
   - **Corrigir a spec, dizendo que estava errada:** a seção "O que já existe" descreve o destino `SUCATA` como se estivesse correto ("destino SUCATA emite `SUCATA`"). **Estava errado e escondia um bug de saldo** — o material já tinha saído na entrega e o `SUCATA` descontava de novo. Registrar a medição (100 → saída 10 → 90 → devolução 3 para sucata dava 87) e a correção. Não apagar a afirmação errada em silêncio: escrever que estava errada, como o `CLAUDE.md` exige.
   - Declarar a limitação de série no descarte (decisão 10) e os itens que continuam fora: fotos/anexos, devolução ao fornecedor, estorno de custo de projeto (feature 22), tipos de devolução por origem (ferramenta → 16, cliente → 13).

3. **`specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`**
   - A **devolução sai da lista de fluxos internos isentos de `exigeLote`** — a lista passa de quatro para três (requisição entrega, requisição estorno de exclusão, recebimento sem lote digitado). Mesma correção para `exigeSerie` nos destinos `ESTOQUE`/`QUARENTENA`.
   - A pendência "lote/série automáticos nos 4 fluxos internos + transferência" encolhe: transferência e devolução saíram dela nesta etapa.

4. **`specs/modulo-almoxarifado/README.md`**
   - Linha 42 (feature 11) e linha 43 (feature 12): de 🟡 para 🟢, com o texto do que a Etapa 7 entregou e o corte do trânsito declarado.
   - Bloco de "Última atualização" no topo: Etapa 7 ✅ com o range de hashes.
   - Seção "Ordem de desenvolvimento sugerida": Etapa 7 marcada ✅; **próxima etapa da ordem: Etapa 8 — materiais de clientes e terceiros (specs 13 e 14)**.

5. **`docs/almoxarifado-guia-etapas-e-testes.md`**
   - Cabeçalho "Onde o desenvolvimento parou": Etapa 7 entregue, próxima é a Etapa 8.
   - Seção "Etapa 7" nova, em linguagem de usuário, com tabela **Antes → Agora**:
     | Antes | Agora |
     |---|---|
     | Transferir material só por API — nenhuma tela | "Transferência" é um tipo no formulário de Movimentações, com origem, destino e lote |
     | Material com controle de lote transferia sem dizer de qual lote | A transferência exige o lote; todos os lotes servem, inclusive bloqueado e vencido |
     | Devolução por API, sem dizer de qual entrega veio | Tela "Devoluções": escolhe o material, vê as entregas dele e devolve com limite pelo que ainda resta |
     | Devolução de material com lote entrava sem lote e ficava presa | O lote é herdado da entrega (ou escolhido, na devolução avulsa) |
     | Devolução de peça com número de série voltava o saldo sem voltar a peça | A série volta para "em estoque" junto |
     | "Devolução" no formulário de Movimentações criava lançamento solto | Saiu do formulário; um aviso aponta a tela nova (continua no filtro do livro) |
   - Roteiro de teste manual clicável: (a) transferir um lote entre duas prateleiras e ver o saldo mudar de endereço no Mapa; (b) tentar transferir material com controle de lote sem escolher lote e ver a recusa; (c) devolver parte de uma entrega e ver a mesma entrega reaparecer com o devolvível menor; (d) tentar devolver mais do que resta e ler a mensagem que diz quanto resta; (e) devolver para Quarentena e conferir que o saldo voltou mas não está disponível; (f) devolver para Sucata e conferir que o saldo **não muda** e que o livro mostra as duas linhas; (g) devolver peça serializada ao estoque e ver a série voltar em "Lotes e Séries".
   - **O bug do SUCATA precisa estar no guia**, com destaque: quem já usou o sistema pode ter saldo errado em casa. Explicar como identificar (devoluções antigas com destino Sucata) e que a correção **não** reprocessa o passado — o ajuste do saldo histórico é uma contagem/`AJUSTE`, decisão do usuário.
   - O que a etapa **não** cobre: trânsito (cortado), aprovação de transferência, e-mail/alerta, fotos da devolução, devolução ao fornecedor, estorno de custo de projeto, série na transferência, série no descarte de devolução.

6. **`docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md`** (este arquivo)
   - Cabeçalho `✅ ETAPA CONCLUÍDA` com tabela task → hash, range de hashes da etapa e a **verificação final com números reais**.
   - Seção "Próxima tarefa da ordem do plano mestre" atualizada com o que a Etapa 7 deixou de contrato para a Etapa 8.

- [ ] **Step 1: rodar TUDO e anotar os números reais** (não escrever "passou" — escrever `N/N`)

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation
cd server && npm run test:safealter
cd server && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

- [ ] **Step 2: atualizar os 6 documentos** conforme a lista acima.

- [ ] **Step 3: commit**

```bash
git add specs/modulo-almoxarifado/11-transferencias/README.md \
        specs/modulo-almoxarifado/12-devolucoes/README.md \
        specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md \
        specs/modulo-almoxarifado/README.md \
        docs/almoxarifado-guia-etapas-e-testes.md \
        docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md
git commit -m "$(cat <<'EOF'
Almoxarifado Etapa 7: atualiza specs, guia e plano com o que a etapa entregou

A spec 12 descrevia o destino SUCATA da devolucao como se estivesse correto — e
estava errada: escondia um bug de saldo que so a execucao mostrou (100 -> saida
10 -> 90 -> devolucao 3 para sucata dava 87). A afirmacao errada nao foi apagada
em silencio; ficou registrado que estava errada e por que, para o proximo nao
confiar nela de novo.

A spec 11 passa a dizer com todas as letras que o estado "em transito" foi
CORTADO por decisao do cliente, nao esquecido: os almoxarifados sao areas
fisicas do mesmo site, o cliente tem uma filial so, e alguem pega a caixa e leva
na hora. Quem ler o checklist depois nao pode achar que ficou pendente por
descuido. Serie na transferencia e serie no descarte de devolucao ficam
declaradas como fora de escopo, com o motivo.

A spec 10 perde a devolucao da lista de fluxos internos isentos de exigeLote —
sao tres agora, nao quatro.

O guia ganha a secao da Etapa 7 com Antes -> Agora e roteiro clicavel, e um
aviso sobre o bug do SUCATA: quem ja usou o sistema pode ter saldo errado em
casa, e a correcao nao reprocessa o passado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review do plano (2026-08-12)

**1. Cobertura da spec — decisão por decisão:**

| Decisão / requisito da spec | Onde |
|---|---|
| 1. "Em trânsito" cortado, declarado na spec 11 | T8 (é documentação por definição — não há código a escrever para um corte) |
| 2. Vínculo opcional mas validado | T3 (`validarSaidaOriginal`) + T7 (opção "avulsa" na tela) |
| 3. Tela começa pelo material | T4 (rota por `material_id`) + T7 |
| 4. Devolução herda lote; transferência exige lote | T3 (herança) + T2 (exigência) |
| 5. `TRANSFERENCIA` em `REGRAS_VINCULO` com `'nenhum'` | T2 |
| 6. Condição sugere destino, não determina | T7 (só tela; teste que a sugestão não trava) |
| 7. Transferência dentro de Movimentações, devolução em tela dedicada | T6 + T7 |
| 8. Transferência não checa status do lote | T2 (backend, 2 testes) + T6 (`loteDisponivelParaTipo`) |
| 9. Série na transferência fora do escopo | T2 (teste que registra) + T6 (sem seletor) + T8 |
| 10. Série no descarte de devolução fora do escopo | T5 (400 explicativo) + T7 (aviso) + T8 |
| 11. Fora de escopo declarado nas specs 11/12 | T8 |
| O bug do SUCATA, com controle positivo | T1 |
| `referencia: DEV-<id>` em todos os destinos | T1 |
| 2 colunas via `safeAlter` | T3 |
| `GET /devolucoes/saidas-elegiveis` (incl. `series`, `saldo_devolvivel`, linhas zeradas) | T4 |
| Tratamento de erro: 400 nomeando o devolvível restante | T3 (`validarSaidaOriginal`, teste que exige o número na mensagem) |
| Tratamento de erro: razão específica por tipo de recusa | T3 (4 casos distintos no mesmo teste) |
| Tabela de testes de `devolucaoVinculo.api.test.js` (7 linhas) | T3 (5) + T5 (1: série) + T3 (1: sucata sem baixa dupla) |
| Tabela de testes de `transferenciaRegras.api.test.js` (4 linhas) | T2, todas |
| Teste de client cobrindo sugestão e limite de quantidade | T7 |
| Documentação (6 documentos) | T8 |

**Requisito da spec sem task? Nenhum encontrado.** O único item que não gerou código foi a decisão
1 (corte do trânsito), que por natureza só existe como texto — está na T8, e o plano diz
explicitamente que é corte, não omissão.

**2. Varredura de placeholder:** cada step de código traz o código real; nenhum "similar à Task N",
nenhum "adicione validação apropriada", nenhum "escreva os testes". As tabelas de substituição da
T6 citam o texto exato a trocar em vez de mandar "ajustar os usos". O código foi repetido entre
tasks onde necessário (o bloco de destinos aparece completo em T1 e de novo, já com lote e série,
em T3/T5) — de propósito: quem implementa lê as tasks fora de ordem.

**3. Consistência de tipos e nomes entre tasks:**
`TIPOS_SAIDA_DEVOLVIVEL` (T3) é a mesma constante consumida em T4. `listarSaidasElegiveis` devolve
`saldo_devolvivel`/`quantidade_devolvida`/`series` — exatamente os nomes lidos pela tela em T7 e
pelos testes em T4. `movimentacao_saida_id` e `lote_id` têm o mesmo nome na coluna, no body, no
serviço e no payload da tela. `destinoAceitaSerie` (T5) e `DESTINOS_COM_SERIE` (T7) descrevem a
mesma regra nos dois lados. `TIPOS_COM_LOTE_EXISTENTE`/`TIPOS_COM_ORIGEM`/`TIPOS_COM_DESTINO` (T6)
não colidem com `TIPOS_SAIDA_LOTE`, que continua existindo e passa a governar só série.

**4. Riscos que o plano assume conscientemente:**
- A T3 muda dois testes existentes de sentido (isenção → exigência). Se o revisor achar que a
  devolução deveria continuar isenta, é uma discussão de **design**, não de implementação — a spec
  aprovada manda declarar `exigeLote: true`, e o plano nomeia a consequência em vez de escondê-la.
- Não há transação no módulo. A pré-validação do lote no destino `SUCATA` (T3) fecha a janela
  conhecida, mas a compensação genérica do motor continua sendo débito arquitetural declarado (a
  resolver na migração para Postgres) — a Etapa 7 não o ataca, e não deve.

---

## Próxima tarefa da ordem do plano mestre: Etapa 8 — materiais de clientes e terceiros

Com a Etapa 7 fechada, as features 11 (transferências) e 12 (devoluções) ficam 🟢 no que esta etapa
se propôs, e a **ordem do plano mestre** (`specs/modulo-almoxarifado/README.md`, seção "Ordem de
desenvolvimento sugerida") segue para a **Etapa 8: `13-materiais-clientes` + `14-materiais-terceiros`**.
Isso já estava decidido antes desta etapa — não é escolha nova, é seguir a sequência.

### O contrato que a Etapa 7 deixa pronto para a 8

- **`GET /almoxarifado/devolucoes/saidas-elegiveis?material_id=X`** devolve as entregas devolvíveis
  de um material com `saldo_devolvivel`, `quantidade_devolvida` e `series`. A feature 13 (devolução
  **de cliente**) e a 14 (retorno **de terceiro**) precisam do mesmo tipo de leitura — provavelmente
  filtrando por `cliente_id`. A movimentação já tem coluna `cliente_id` (`movCols` em `schema.js`),
  hoje sem escritor nas rotas de saída.
- **`devolucoes_material_almoxarifado`** tem agora `movimentacao_saida_id` e `lote_id`. Um "tipo de
  devolução por origem" (produção / cliente / terceiro / fornecedor) é uma coluna a mais nessa
  tabela, não uma tabela nova — a spec 12 lista isso explicitamente como pendência dela que a
  feature 13/16 vai resolver.
- **`returnService.TIPOS_SAIDA_DEVOLVIVEL`** é a lista única do que pode ser devolvido. Se a Etapa 8
  criar tipos de saída para cliente/terceiro, é essa constante que precisa crescer — e a rota de
  leitura acompanha sozinha, porque as duas usam a mesma lista.
- **`REGRAS_VINCULO`** agora declara `TRANSFERENCIA`. Transferência para "estoque de cliente" ou
  "estoque de terceiro" (destinos especiais da spec 15) entra como **regra de destino**, não como
  tipo novo de movimento.

### Pontos de atenção para quem pegar a Etapa 8

- **Saldo de material de cliente não é saldo próprio.** A regra de negócio fixada no `CLAUDE.md`
  ("almoxarifado é área física, não filial") **não** se aplica aqui: material de cliente e material
  em terceiros são propriedades diferentes, e misturá-los no `quantidade_atual` do material
  inflaria o estoque próprio. A primeira pergunta de design da etapa é se isso é uma flag no
  material, uma dimensão na linha de saldo (como `lote_id` virou na Etapa 6) ou entidade separada.
- **A feature 14 está ❌ em tudo** no mapa de status — é a primeira feature da ordem sem nenhuma
  base pronta. Vale checar se a spec 14 descreve algo que a 13 já resolve.
- **Devolução ao fornecedor continua fora**: é fluxo próprio com documento, declarado fora de
  escopo na Etapa 7 e não pertence à 8 automaticamente.

### O que já está decidido (não reabrir)

- **"Em trânsito" da transferência está CORTADO** por decisão do cliente (site único). Se a Etapa 8
  trouxer material que sai para terceiro e volta, isso **não** é o trânsito cortado — é o ciclo de
  remessa/retorno da feature 14, com documento e prazo próprios. Não ressuscitar a máquina de
  estados da spec 11 por semelhança.
- **`exigeLote`/`exigeSerie` no 4º argumento**, nunca no body. Padrão fixado nas Etapas 6/6b e
  reforçado na 7 (transferência e devolução).
- **Sugestão de UX no cliente, validação no servidor.** A condição→destino da devolução é o
  precedente: o backend aceita a combinação, a tela orienta.
