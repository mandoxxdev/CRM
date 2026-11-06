/**
 * Etapa 204 (C465; B1363-B1366) — a Devolucao acha as entregas antigas.
 *
 * Ate a 204 a lista de "Entrega de origem" (`GET /devolucoes/saidas-elegiveis`) trazia so as 30 entregas mais recentes do
 * material, sem jeito de ir alem: material que sai todo dia passava de 30 em poucas semanas e a entrega de tres semanas
 * atras sumia — a pessoa caia na devolucao avulsa (sem vinculo, sem limite, sem herdar o lote). Agora `antes_de=<id da
 * ultima entrega mostrada>` traz as 30 anteriores, por cursor composto (`COALESCE(created_at,'')` + id), na mesma ordem.
 * Sem `antes_de`, a resposta e a de sempre.
 *
 * Executar: cd server && node tests/api/devolucaoEntregasAntigas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const returnService = require('../../services/almoxarifado/returnService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const API = '/api/almoxarifado';
const MSG_INVALIDO = 'antes_de inválido — informe o id da última entrega da lista';
const MSG_NAO_ACHOU = (id) => `Entrega ${id} não encontrada neste material`;

let seq = 0;
async function novoMaterial(db, { lote = false, qtd = 0 } = {}) {
  seq += 1;
  return (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, controle_serie)
     VALUES (?,?,'UN',?,1,?,0)`, [`DEA204-${seq}`, `Material entregas antigas ${seq}`, qtd, lote ? 1 : 0])).lastID;
}
async function entregar(db, materialId, qtd, extra = {}) {
  return (await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: qtd, justificativa: 'entrega para a producao', ...extra })).id;
}
/** Regrava o created_at das saidas em minutos crescentes, na ordem do array (a primeira e a mais antiga). */
async function datar(db, ids) {
  for (let i = 0; i < ids.length; i++) {
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = datetime('2026-01-01 08:00:00', ?) WHERE id = ?",
      [`+${i} minutes`, ids[i]]);
  }
}
const lista = (app, m, antes) => request(app).get(`${API}/devolucoes/saidas-elegiveis?material_id=${m}`
  + (antes === undefined ? '' : `&antes_de=${antes}`));

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  console.log('\n=== Etapa 204: a Devolucao acha as entregas antigas ===\n');

  // ── Cenario de .01/.02: 35 elegiveis + 3 nao elegiveis mais antigas que tudo ───────────────────────────────────────
  const M1 = await novoMaterial(db, { qtd: 1000 });
  const xCancel = await entregar(db, M1, 1);
  const xReqExcl = await entregar(db, M1, 1);
  const xEpi = await entregar(db, M1, 1);
  const E = [];
  for (let i = 0; i < 35; i++) E.push(await entregar(db, M1, 5)); // E[0] a mais antiga
  await datar(db, [xCancel, xReqExcl, xEpi, ...E]);
  // estornada; de requisicao excluida; de entrega de EPI
  const est = await request(app).post(`${API}/movimentacoes/${xCancel}/cancelar`).send({ motivo: 'errada' });
  assert.ok([200, 201].includes(est.status), `estorno de premissa: ${est.status} ${JSON.stringify(est.body)}`);
  const rqx = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, ativo)
    VALUES ('REQ-DEA204-X', 1, 'Admin', 0)`)).lastID;
  await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [rqx, xReqExcl]);
  await dbRun(db, `INSERT INTO entregas_epi_almoxarifado (numero, colaborador_id, colaborador_nome, material_id, material_codigo,
    material_nome, ca_numero, quantidade, movimentacao_id, criado_em) VALUES ('EPI-DEA204', 1, 'Colab', ?, 'C', 'N', 'CA1', 1, ?,
    '2026-01-01')`, [M1, xEpi]);
  // E[1] (pagina 2) com devolucao parcial viva de 2; E[29] (pagina 1) devolvida por inteiro.
  for (const [s, q] of [[E[1], 2], [E[29], 5]]) {
    const d = await request(app).post(`${API}/devolucoes`).send({ material_id: M1, quantidade: q, motivo: 'SOBRA_PROJETO',
      destino: 'ESTOQUE', movimentacao_saida_id: s });
    assert.strictEqual(d.status, 201, `devolucao de premissa: ${JSON.stringify(d.body)}`);
  }
  const desc = [...E].reverse(); // a ordem esperada (created_at DESC)
  let pag1;

  await test('RN-204.01 sem antes_de: 30 linhas, as 30 mais recentes, inclusive a zerada, mesmos campos', async () => {
    const r = await lista(app, M1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body), 'a resposta deixou de ser array');
    pag1 = r.body;
    assert.deepStrictEqual(r.body.map((x) => x.id), desc.slice(0, 30));
    const z = r.body.find((x) => x.id === E[29]);
    assert.strictEqual(z.saldo_devolvivel, 0, 'a zerada sumiu ou mudou');
    assert.deepStrictEqual(Object.keys(r.body[0]).sort(), ['created_at', 'id', 'lote', 'lote_id', 'os_id', 'projeto_id',
      'quantidade', 'quantidade_devolvida', 'quantidade_reentrada', 'requisicao_id', 'requisicao_numero', 'saldo_devolvivel',
      'series', 'tipo', 'usuario_nome'].sort());
    const vazio = await request(app).get(`${API}/devolucoes/saidas-elegiveis?material_id=${M1}&antes_de=`);
    assert.deepStrictEqual(vazio.body, r.body, '?antes_de= vazio tem de ser igual a ausente');
    assert.deepStrictEqual((await returnService.listarSaidasElegiveis(db, M1)).map((x) => x.id), desc.slice(0, 30));
  });

  await test('RN-204.02 antes_de = a 30a: as 31-35, sem cancelada/excluida/EPI, e o saldo que a validacao aplica', async () => {
    assert.ok(pag1, 'premissa: .01');
    const r = await lista(app, M1, pag1[29].id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.map((x) => x.id), desc.slice(30), 'a pagina 2 nao e a continuacao');
    for (const x of [xCancel, xReqExcl, xEpi]) assert.ok(!r.body.some((l) => l.id === x), `nao elegivel ${x} apareceu`);
    const p = r.body.find((x) => x.id === E[1]);
    assert.deepStrictEqual({ dev: p.quantidade_devolvida, saldo: p.saldo_devolvivel }, { dev: 2, saldo: 3 });
    const d = await request(app).post(`${API}/devolucoes`).send({ material_id: M1, quantidade: p.saldo_devolvivel + 1,
      motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: E[1] });
    assert.strictEqual(d.status, 400, JSON.stringify(d.body));
    assert.strictEqual(d.body.error, `Devolução acima do entregue: a saída ${E[1]} entregou 5, já foram devolvidos 2 e restam `
      + `${p.saldo_devolvivel}`);
  });

  // ── Cenario de .03: 65 saidas, 12 no mesmo segundo na divisa, uma com created_at NULL ─────────────────────────────
  const M2 = await novoMaterial(db, { qtd: 1000 });
  const F = [];
  for (let i = 0; i < 65; i++) F.push(await entregar(db, M2, 1));
  await datar(db, F);
  // Na ordem DESC (F[64] primeiro), as posicoes 24..35 (divisa em 30) caem no mesmo segundo: F[40]..F[29].
  for (let i = 29; i <= 40; i++) {
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET created_at = '2026-01-01 08:35:00' WHERE id = ?", [F[i]]);
  }
  const nula = F[10];
  await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET created_at = NULL WHERE id = ?', [nula]);

  await test('RN-204.03 percorrer ate o fim: 30 + 30 + 5, cada uma uma vez, a NULL por ultimo, depois []', async () => {
    const paginas = [];
    let antes;
    for (let k = 0; k < 4; k++) {
      const r = await lista(app, M2, antes);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      paginas.push(r.body.map((x) => x.id));
      if (!r.body.length) break;
      antes = r.body[r.body.length - 1].id;
    }
    assert.deepStrictEqual(paginas.map((p) => p.length), [30, 30, 5, 0], `tamanhos ${paginas.map((p) => p.length)}`);
    const todas = paginas.flat();
    assert.strictEqual(new Set(todas).size, todas.length, 'id repetido entre paginas');
    assert.deepStrictEqual([...todas].sort((a, b) => a - b), [...F].sort((a, b) => a - b), 'faltou ou sobrou entrega');
    assert.strictEqual(todas[todas.length - 1], nula, 'a de created_at NULL nao veio por ultimo');
    // A do mesmo segundo atravessa a divisa: a pagina 1 termina no meio do grupo e a 2 continua por id.
    const grupo = F.slice(29, 41).reverse();
    assert.deepStrictEqual(todas.slice(24, 36), grupo, 'o empate no mesmo segundo nao foi costurado por id');
  });

  await test('RN-204.04 recusas do cursor pela rota, na ordem do contrato; cursor estornado serve de ancora', async () => {
    for (const v of ['abc', '0', '-3', '1.5', '1&antes_de=2']) {
      const r = await lista(app, M1, v);
      assert.strictEqual(r.status, 400, `antes_de=${v}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, MSG_INVALIDO, `antes_de=${v}`);
    }
    for (const v of [99999999, F[0]]) {
      const r = await lista(app, M1, v);
      assert.strictEqual(r.status, 400, `antes_de=${v}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, MSG_NAO_ACHOU(v));
    }
    const semMat = await request(app).get(`${API}/devolucoes/saidas-elegiveis?antes_de=abc`);
    assert.deepStrictEqual([semMat.status, semMat.body.error], [400, 'material_id é obrigatório']);
    const matInex = await request(app).get(`${API}/devolucoes/saidas-elegiveis?material_id=99999999&antes_de=abc`);
    assert.deepStrictEqual([matInex.status, matInex.body.error], [400, 'Material não encontrado']);
    // Cursor estornado entre dois cliques (B1365): E[10] some da lista, mas ancora.
    const c = await request(app).post(`${API}/movimentacoes/${E[10]}/cancelar`).send({ motivo: 'errada' });
    assert.ok([200, 201].includes(c.status), `estorno: ${c.status} ${JSON.stringify(c.body)}`);
    const r = await lista(app, M1, E[10]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.map((x) => x.id), E.slice(0, 10).reverse());
  });

  await test('RN-204.04 pelo servico: mesmas literais, numero aceito, ausente = sem cursor', async () => {
    for (const v of ['abc', 0, -3, '1.5', 1.5, '0x10', ['1', '2']]) {
      await assert.rejects(() => returnService.listarSaidasElegiveis(db, M1, { antesDeId: v }), (e) => {
        assert.strictEqual(e.status, 400); assert.strictEqual(e.message, MSG_INVALIDO, `antesDeId=${v}`); return true;
      });
    }
    assert.strictEqual(returnService.MSG_ANTES_DE_INVALIDO, MSG_INVALIDO);
    assert.strictEqual(returnService.msgEntregaNaoEncontrada(7), MSG_NAO_ACHOU(7));
    await assert.rejects(() => returnService.listarSaidasElegiveis(db, M1, { antesDeId: F[0] }), (e) => {
      assert.strictEqual(e.status, 400); assert.strictEqual(e.message, MSG_NAO_ACHOU(F[0])); return true;
    });
    await assert.rejects(() => returnService.listarSaidasElegiveis(db, 99999999, { antesDeId: 'abc' }),
      (e) => { assert.strictEqual(e.message, 'Material não encontrado'); return true; });
    const p2 = await returnService.listarSaidasElegiveis(db, M2, { antesDeId: F[50] });
    assert.deepStrictEqual(p2.map((x) => x.id).slice(0, 3), [F[49], F[48], F[47]]);
    for (const v of [undefined, null, '']) {
      const r = await returnService.listarSaidasElegiveis(db, M2, { antesDeId: v });
      assert.strictEqual(r[0].id, F[64], `antesDeId=${v} nao e ausente`);
    }
  });
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
