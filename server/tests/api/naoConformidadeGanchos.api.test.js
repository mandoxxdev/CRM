/**
 * Etapa 43, T3 — os GANCHOS que fazem a nao conformidade nascer sozinha, e a derivacao da RN-07.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada.md (T3)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md
 *         (D3, D4, D9, D10 / RN-03, RN-04, RN-05, RN-07, RN-08, RN-10, RN-11)
 *
 * A T1 provou o SERVICO chamado direto. Este arquivo prova o que acontece quando alguem CLICA:
 * cada cenario entra pela ROTA real, porque o gancho so vale se disparar no caminho do usuario.
 *
 * ── POR QUE A ROTA `/fiscal` TEM CENARIO PROPRIO (e e o mais importante do arquivo) ───────────
 * Quem escreve `quantidade_recebida` sao DOIS servicos — `conferirRecebimento` e
 * `salvarDadosFiscal` — e **a UI de producao nunca chama `/conferir`**: ela escreve a quantidade
 * pelo modal de NF. Isso esta no cabecalho de `receiptService.js:43-45` como achado Critico da
 * Etapa 17 e congelado em `alertaEventoGanchos.api.test.js:160`. Com o gancho so na conferencia a
 * feature nasceria com a suite VERDE e invisivel no unico caminho que o cliente usa — e o controle
 * positivo (1) desta task removeu o gancho do `/fiscal` para provar que este cenario o pega.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Todo cenario de "NAO acontece" tem irmao positivo NO MESMO cenario: um "nenhuma NC foi aberta"
 * passa identico com o gancho morto, com a rota errada ou com o fixture sem divergencia.
 *   - (1) confere 10 de 10 depois de afirmar que 8 de 10 abriu;
 *   - (5) afirma que o fato MUDADO reabre, depois que o fato IGUAL nao reabre;
 *   - (6) afirma que o item novo do recebimento PROCESSADO ABRE, depois que a correcao nao cancela;
 *   - (7) afirma que a aprovacao total nao abre, depois que a reprovacao abriu;
 *   - (9) afirma que o item COM divergencia grava 1 com o payload mandando `false`, depois que o
 *         item SEM divergencia grava 0 com o payload mandando `true`.
 *
 * ── OS TRES CONTROLES POSITIVOS DESTA TASK (medidos, nao prometidos) ─────────────────────────
 *   1. tirar o gancho de `salvarDadosFiscal`      -> cai (2) "a rota /fiscal TAMBEM abre a NC"
 *   2. `divergencia_quantidade` voltar a ler o payload -> cai (9) "payload ignorado"
 *   3. `console.warn` virar `throw` no gancho     -> cai (8) "gancho que explode nao derruba"
 *
 * Executar: cd server && node tests/api/naoConformidadeGanchos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const nonConformityService = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 43, nome: 'Admin Etapa43 T3', role: 'admin', is_superadmin: 1, email: 'e43t3@test.com' };

let seq = 0;

(async () => {
  console.log('\n=== Etapa 43 T3: ganchos da nao conformidade + derivacao da RN-07 ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  async function novoMaterial({ critico = false } = {}) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
       VALUES (?,?,'UN',0,1,?)`,
      [`NCG-${seq}`, `Material gancho NC ${seq}`, critico ? 1 : 0]);
    return { id: r.lastID, codigo: `NCG-${seq}` };
  }

  /** Recebimento REAL pelo servico de producao (fica em RECEBIDO), com N itens de 10. */
  async function novoRecebimento(quantidades = [10], opcoes = {}) {
    const materiais = [];
    for (let i = 0; i < quantidades.length; i += 1) materiais.push(await novoMaterial(opcoes));
    seq += 1;
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      nota_fiscal: `NF-NCG-${seq}`,
      itens: quantidades.map((q, i) => ({ material_id: materiais[i].id, quantidade: q })),
    });
    const itens = await dbAll(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id',
      [rec.id]);
    return { recId: rec.id, itemIds: itens.map((i) => i.id), itemId: itens[0].id, materiais };
  }

  const conferir = (recId, itens) => request(app)
    .put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens });

  /** A porta que a UI REALMENTE usa. `/fiscal` so aceita a partir de EM_CONFERENCIA. */
  async function fiscal(recId, itens, nf) {
    const wf = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(wf.status, 200, JSON.stringify(wf.body));
    seq += 1;
    return request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`)
      .send({ nota_fiscal: nf || `NF-FISCAL-NCG-${seq}`, itens });
  }

  const ncsDoItem = (itemId) => dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? ORDER BY id`, [itemId]);

  const ncsDaInspecao = (inspecaoId) => dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = 'INSPECAO' AND referencia_id = ? ORDER BY id`, [inspecaoId]);

  const itemGravado = (itemId) => dbGet(db,
    'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);

  /** Item com saldo RETIDO de verdade (material critico + entrada real pelo motor). */
  async function itemRetido(qtd = 10) {
    await setConfig('inspecao_material_critico', '1');
    const { recId, itemId, materiais } = await novoRecebimento([qtd], { critico: true });
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    return { recId, itemId, mat: materiais[0], qtd };
  }

  /**
   * A divergencia do item fabricada DIRETO na coluna: os fixtures nascem com
   * `quantidade_recebida = quantidade_esperada` (`receiptService.js:425`), e a RN-07 le o FATO.
   */
  const fabricarDivergencia = (itemId, recebida) => dbRun(db,
    'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = ? WHERE id = ?',
    [recebida, itemId]);

  const inspecionar = (itemId, payload) => request(app)
    .post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`).send(payload);

  /** Captura os `console.warn` de um trecho — e o que prova que o gancho FALHOU e avisou. */
  async function comWarnCapturado(fn) {
    const original = console.warn;
    const linhas = [];
    console.warn = (...args) => { linhas.push(args.map(String).join(' ')); };
    try { return { resultado: await fn(), warns: linhas }; } finally { console.warn = original; }
  }

  // ── (1) A conferencia abre o documento ──────────────────────────────────────────────────────
  await test('(1) conferir 8 de 10 abre a NC pela ROTA; conferir 10 de 10 nao abre nada', async () => {
    const { recId, itemId } = await novoRecebimento([10]);
    const res = await conferir(recId, [{ id: itemId, quantidade_recebida: 8, conferencia_quantidade: 1 }]);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 1, `conferir 8 de 10 TINHA de abrir UMA NC; abriu ${ncs.length}`);
    const nc = ncs[0];
    assert.strictEqual(nc.status, 'ABERTA');
    assert.strictEqual(nc.origem, 'RECEBIMENTO');
    assert.strictEqual(nc.tipo, 'QUANTIDADE');
    assert.strictEqual(nc.aberto_automaticamente, 1, 'a NC do gancho e automatica');
    assert.ok(/^NC-/.test(nc.numero), `o numero tem de ter o prefixo NC-: ${nc.numero}`);
    assert.strictEqual(nc.quantidade_esperada, 10);
    assert.strictEqual(nc.quantidade_recebida, 8);
    assert.strictEqual(nc.divergencia, -2);
    assert.strictEqual(nc.recebimento_id, recId, 'o recebimento fica CONGELADO na propria NC (D2)');

    // Metade negativa: sem divergencia, nenhum documento (RN-03).
    const sem = await novoRecebimento([10]);
    const res2 = await conferir(sem.recId, [{ id: sem.itemId, quantidade_recebida: 10, conferencia_quantidade: 1 }]);
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual((await ncsDoItem(sem.itemId)).length, 0,
      'recebida igual a esperada NAO pode abrir documento');
  });

  // ── (2) A rota /fiscal — O CAMINHO DA UI REAL ───────────────────────────────────────────────
  await test('(2) a rota /fiscal TAMBEM abre a NC (a UI de producao nunca chama /conferir)', async () => {
    const { recId, itemId } = await novoRecebimento([10]);
    const res = await fiscal(recId, [{ id: itemId, quantidade_recebida: 7 }]);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 1,
      'registrar 7 de 10 PELA ROTA FISCAL tinha de abrir a NC — sem este gancho a feature nasce '
      + `invisivel em producao; abriu ${ncs.length}`);
    assert.strictEqual(ncs[0].divergencia, -3);
    assert.strictEqual(ncs[0].status, 'ABERTA');

    // Metade negativa pela MESMA rota.
    const sem = await novoRecebimento([10]);
    const res2 = await fiscal(sem.recId, [{ id: sem.itemId, quantidade_recebida: 10 }]);
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual((await ncsDoItem(sem.itemId)).length, 0,
      'rota fiscal sem divergencia NAO pode abrir documento');
  });

  // ── (3) RN-08 / RN-04 — reconferir nao duplica, e atualiza o fato ───────────────────────────
  await test('(3) RN-08/RN-04: reconferir nao duplica a NC ABERTA e atualiza o fato congelado', async () => {
    const { recId, itemId } = await novoRecebimento([10]);
    await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    const [primeira] = await ncsDoItem(itemId);
    assert.ok(primeira, 'a primeira conferencia tinha de abrir a NC');

    // Mesmo valor, de novo: nada de documento novo.
    await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    let ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 1, `reconferir o MESMO valor duplicou o documento (${ncs.length})`);
    assert.strictEqual(ncs[0].id, primeira.id, 'tem de ser a MESMA NC, nao uma nova');

    // Valor pior: continua UMA NC, com o fato atualizado (RN-04).
    await conferir(recId, [{ id: itemId, quantidade_recebida: 6 }]);
    ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 1, 'errar PIOR nao abre segundo documento enquanto o primeiro esta ABERTO');
    assert.strictEqual(ncs[0].id, primeira.id);
    assert.strictEqual(ncs[0].quantidade_recebida, 6, 'o fato da NC ABERTA tinha de ser atualizado');
    assert.strictEqual(ncs[0].divergencia, -4);
  });

  // ── (4) RN-05 — corrigir a quantidade CANCELA ───────────────────────────────────────────────
  await test('(4) RN-05: corrigir a quantidade cancela a NC, com motivo e sem apagar o fato', async () => {
    const { recId, itemId } = await novoRecebimento([10]);
    await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    const [aberta] = await ncsDoItem(itemId);
    assert.strictEqual(aberta.status, 'ABERTA');

    await conferir(recId, [{ id: itemId, quantidade_recebida: 10 }]);
    const ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 1, 'cancelar nao pode criar documento novo');
    assert.strictEqual(ncs[0].status, 'CANCELADA', 'a divergencia sumiu: a NC tinha de ser cancelada');
    assert.ok(/corrigida/i.test(ncs[0].motivo_cancelamento || ''),
      `o motivo automatico tinha de contar o que mudou: ${ncs[0].motivo_cancelamento}`);
    assert.ok(ncs[0].cancelado_em, 'cancelado_em tinha de ser preenchido');
    assert.strictEqual(ncs[0].quantidade_recebida, 8,
      'o FATO congelado nao e reescrito no cancelamento — o documento continua contando o que se observou');

    const trilha = await dbAll(db, `SELECT acao FROM auditoria_log_almoxarifado
      WHERE entidade = 'nao_conformidade' AND entidade_id = ? ORDER BY id`, [ncs[0].id]);
    assert.deepStrictEqual(trilha.map((t) => t.acao), ['NC_ABERTA', 'NC_CANCELADA']);
  });

  // ── (5) RN-10 — salvar sem mudar nada NAO reabre documento encerrado ────────────────────────
  await test('(5) RN-10: depois de DECIDIDA, salvar o mesmo fato nao reabre; fato MUDADO reabre', async () => {
    const { recId, itemId } = await novoRecebimento([10]);
    await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    const [aberta] = await ncsDoItem(itemId);
    await nonConformityService.decidirNaoConformidade(db, ADMIN, aberta.id, {
      decisao: 'ACEITAR_SOB_DESVIO', justificativa: 'Faltou 2, a producao aceita assim.',
    });
    assert.strictEqual((await ncsDoItem(itemId))[0].status, 'DECIDIDA');

    // O modal de NF reenvia a quantidade de TODOS os itens: salvar de novo NAO pode ressuscitar
    // um documento ja decidido para um fato que ninguem reobservou.
    const res = await fiscal(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await ncsDoItem(itemId)).length, 1,
      'salvar o MESMO fato depois de decidido reabriu documento (RN-10)');

    // Metade positiva: o fato MUDOU, entao ha o que documentar de novo.
    await conferir(recId, [{ id: itemId, quantidade_recebida: 5 }]);
    const ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 2, 'errar DE NOVO, diferente, tinha de abrir documento novo');
    assert.strictEqual(ncs[1].status, 'ABERTA');
    assert.strictEqual(ncs[1].divergencia, -5);
  });

  // ── (6) RN-11 / D10 — com o recebimento PROCESSADO, abre mas nao destroi ────────────────────
  await test('(6) RN-11: recebimento PROCESSADO nao cancela nem atualiza — mas ainda ABRE', async () => {
    const { recId, itemIds } = await novoRecebimento([10, 10]);
    const [itemA, itemB] = itemIds;
    await conferir(recId, [{ id: itemA, quantidade_recebida: 8 }]);
    const [antes] = await ncsDoItem(itemA);
    assert.strictEqual(antes.status, 'ABERTA');

    // O estoque ja foi creditado, a conta a pagar gerada e o pedido fechado COM ESTE FATO.
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'PROCESSADO' WHERE id = ?", [recId]);

    // Uma reconferencia posterior "corrige" para 10: destruir o documento seria irreversivel.
    const res = await conferir(recId, [{ id: itemA, quantidade_recebida: 10 }]);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = (await ncsDoItem(itemA))[0];
    assert.strictEqual(depois.status, 'ABERTA', 'com o recebimento PROCESSADO a NC nao pode ser cancelada');
    assert.strictEqual(depois.quantidade_recebida, 8, 'nem atualizada: o fato fica como estava');

    // Metade positiva da ASSIMETRIA (D10): criar nao e destruir — uma divergencia descoberta
    // depois do processamento e justamente o que precisa de documento.
    await conferir(recId, [{ id: itemB, quantidade_recebida: 7 }]);
    const doB = await ncsDoItem(itemB);
    assert.strictEqual(doB.length, 1, 'recebimento processado tem de continuar ABRINDO NC nova');
    assert.strictEqual(doB[0].status, 'ABERTA');
    assert.strictEqual(doB[0].divergencia, -3);
  });

  // ── (7) D9 — a inspecao reprovada abre a NC, com o tipo da prioridade ───────────────────────
  await test('(7) D9: inspecao reprovada abre NC de origem INSPECAO com o tipo da prioridade', async () => {
    const { itemId } = await itemRetido(10);
    const res = await inspecionar(itemId, {
      quantidade_aprovada: 6, quantidade_reprovada: 4,
      dano_fisico: 1, certificado_ausente: 1, encaminhamento: 'DEVOLVER',
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const ncs = await ncsDaInspecao(res.body.id);
    assert.strictEqual(ncs.length, 1, `reprovar TINHA de abrir UMA NC; abriu ${ncs.length}`);
    assert.strictEqual(ncs[0].origem, 'INSPECAO');
    assert.strictEqual(ncs[0].referencia_tipo, 'INSPECAO');
    assert.strictEqual(ncs[0].referencia_id, res.body.id);
    assert.strictEqual(ncs[0].tipo, 'DANO_FISICO',
      `a prioridade do D9 poe DANO_FISICO acima de CERTIFICADO_AUSENTE; veio ${ncs[0].tipo}`);
    assert.ok(/certificado/i.test(ncs[0].descricao),
      `TODAS as flags ligadas entram na descricao (nada se perde): ${ncs[0].descricao}`);
    assert.strictEqual(ncs[0].aberto_automaticamente, 1);

    // Metade negativa: aprovar tudo nao abre documento nenhum.
    const ok = await itemRetido(10);
    const resOk = await inspecionar(ok.itemId, { quantidade_aprovada: 10, quantidade_reprovada: 0 });
    assert.strictEqual(resOk.status, 201, JSON.stringify(resOk.body));
    assert.strictEqual((await ncsDaInspecao(resOk.body.id)).length, 0,
      'aprovacao total NAO pode abrir nao conformidade');
  });

  // ── (8) O gancho que explode NAO derruba a porta ────────────────────────────────────────────
  await test('(8) gancho que explode nao derruba a conferencia nem a inspecao, e deixa o warn', async () => {
    // O monkeypatch substitui a funcao INTEIRA: a falha acontece DEPOIS de qualquer guarda
    // interna do servico, que e a armadilha que deixou um teste VAZIO na Etapa 42 (a guarda de
    // tabela ausente saia limpa antes de o erro poder acontecer).
    const originalSync = nonConformityService.sincronizarNaoConformidadeQuantidade;
    const originalInsp = nonConformityService.abrirNaoConformidadeDeInspecao;
    let chamouSync = false; let chamouInsp = false;
    nonConformityService.sincronizarNaoConformidadeQuantidade = async () => {
      chamouSync = true; throw new Error('boom da NC de quantidade');
    };
    nonConformityService.abrirNaoConformidadeDeInspecao = async () => {
      chamouInsp = true; throw new Error('boom da NC de inspecao');
    };

    try {
      const { recId, itemId } = await novoRecebimento([10]);
      const conf = await comWarnCapturado(() => conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]));
      assert.ok(chamouSync, 'o gancho nem chegou a ser chamado — o cenario nao prova nada');
      assert.strictEqual(conf.resultado.status, 200,
        `a conferencia tinha de responder 200 mesmo com o gancho explodindo, veio ${conf.resultado.status}`);
      assert.strictEqual((await itemGravado(itemId)).quantidade_recebida, 8,
        'a quantidade TINHA de continuar gravada: o gancho e posterior ao ato');
      assert.ok(conf.warns.some((l) => /nao conformidade de quantidade falhou/.test(l) && /boom/.test(l)),
        `a falha do gancho tinha de virar console.warn; warns: ${JSON.stringify(conf.warns)}`);

      const { itemId: retido } = await itemRetido(10);
      const insp = await comWarnCapturado(() => inspecionar(retido, {
        quantidade_aprovada: 7, quantidade_reprovada: 3,
      }));
      assert.ok(chamouInsp, 'o gancho da inspecao nem chegou a ser chamado');
      assert.strictEqual(insp.resultado.status, 201,
        `a decisao de inspecao tinha de responder 201, veio ${insp.resultado.status}: ${JSON.stringify(insp.resultado.body)}`);
      assert.ok(insp.warns.some((l) => /nao conformidade pos-inspecao/.test(l) && /boom/.test(l)),
        `a falha do gancho da inspecao tinha de virar console.warn; warns: ${JSON.stringify(insp.warns)}`);
      const gravada = await dbGet(db,
        'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [insp.resultado.body.id]);
      assert.ok(gravada, 'a inspecao TINHA de continuar gravada');
      assert.strictEqual(gravada.quantidade_reprovada, 3);
    } finally {
      nonConformityService.sincronizarNaoConformidadeQuantidade = originalSync;
      nonConformityService.abrirNaoConformidadeDeInspecao = originalInsp;
    }
  });

  // ── (9) RN-07 — a flag da inspecao e DERIVADA; o payload e ignorado ─────────────────────────
  await test('(9) RN-07: `divergencia_quantidade: true` em item SEM divergencia grava 0 (e o contrario)', async () => {
    const semDiv = await itemRetido(10);
    const res = await inspecionar(semDiv.itemId, {
      quantidade_aprovada: 10, quantidade_reprovada: 0, divergencia_quantidade: true,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.divergencia_quantidade, 0,
      'o payload mandou `true` num item sem divergencia: a resposta tinha de trazer o DERIVADO 0');
    const gravadaZero = await dbGet(db,
      'SELECT divergencia_quantidade FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(gravadaZero.divergencia_quantidade, 0,
      'a coluna tinha de gravar o derivado, nao a caixa marcada pelo inspetor');

    // Metade positiva, e ela e o oposto exato: o payload diz `false` e o FATO diz 1.
    const comDiv = await itemRetido(10);
    await fabricarDivergencia(comDiv.itemId, 8);
    const res2 = await inspecionar(comDiv.itemId, {
      quantidade_aprovada: 10, quantidade_reprovada: 0, divergencia_quantidade: false,
    });
    assert.strictEqual(res2.status, 201, JSON.stringify(res2.body));
    assert.strictEqual(res2.body.divergencia_quantidade, 1,
      'recebida 8 de 10: a derivada tinha de dar 1 mesmo com o payload mandando `false`');
    const gravadaUm = await dbGet(db,
      'SELECT divergencia_quantidade FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [res2.body.id]);
    assert.strictEqual(gravadaUm.divergencia_quantidade, 1);
  });

  // ── (10) O aditivo da fila de pendentes (desbloqueia a T5) ──────────────────────────────────
  await test('(10) /inspecoes/pendentes devolve quantidade_esperada, recebida e a flag derivada', async () => {
    const comDiv = await itemRetido(10);
    await fabricarDivergencia(comDiv.itemId, 6);
    const semDiv = await itemRetido(10);

    const res = await request(app).get('/api/almoxarifado/inspecoes/pendentes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhaDiv = res.body.find((l) => l.item_id === comDiv.itemId);
    const linhaOk = res.body.find((l) => l.item_id === semDiv.itemId);
    assert.ok(linhaDiv && linhaOk, 'os dois itens retidos tinham de estar na fila');

    assert.strictEqual(linhaDiv.quantidade_esperada, 10);
    assert.strictEqual(linhaDiv.quantidade_recebida, 6);
    assert.strictEqual(linhaDiv.divergencia_quantidade, 1,
      'a flag vem DERIVADA DO SERVIDOR — a tela le, nao recalcula (a B60 vetou a segunda copia da regua)');

    assert.strictEqual(linhaOk.quantidade_esperada, 10);
    assert.strictEqual(linhaOk.quantidade_recebida, 10);
    assert.strictEqual(linhaOk.divergencia_quantidade, 0,
      'item sem divergencia tem de vir com a flag 0 — uma caixa marcada aqui mentiria na tela');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
