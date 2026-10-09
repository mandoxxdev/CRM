/**
 * Etapa 98 — devolver da caixa a prateleira: o almoxarife tira da caixa de uma requisicao o que nao vai sair
 * (B497, C189; com o C190). Feature 05 (separacao) com a 04 (status) e a 07 (reserva).
 *
 * Antes, o material separado (a "caixa") so saia pela entrega: quebrou ou se perdeu na caixa, o almoxarife nao
 * tinha gesto nenhum (a PERDA recusava pela caixa da 97, encerrar/cancelar/excluir nao eram dele) e so o
 * administrador soltava, excluindo a requisicao. A Etapa 98 cria o gesto `PUT /requisicoes/:id/devolver-separado`,
 * que diminui o separado ainda nao entregue SEM mover estoque (a separacao nunca moveu), com trilha propria
 * (`devolucoes_caixa_requisicao`) e a seta PRONTA_PARA_RETIRADA -> EM_SEPARACAO.
 *
 * Usuarios reais por header (molde 92-97): S sem perfil (PRODUCAO) cria pela rota; ADMIN superadmin aprova e
 * movimenta; ALMOX e ALMOX2 (ALMOXARIFE) separam, conferem, liberam e entregam.
 *
 * T0: RN-00 (a tabela e a seta). T1: RN-01..RN-08, RN-02b, RN-10 (o gesto). Casos `[98 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa98-devolver-da-caixa-a-prateleira.md
 *
 * Executar: cd server && node tests/api/devolverSeparado.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const maquina = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 98', role: 'admin', is_superadmin: 1, email: 'a98@t.com' },
  S: { id: 9801, nome: 'Solic 98', role: 'user', email: 's98@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9802, nome: 'Almox 98', role: 'user', email: 'x98@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9803, nome: 'Almox2 98', role: 'user', email: 'y98@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 98: devolver da caixa a prateleira ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const material = async (fisico = 0, critico = 0) => {
    const c = `E98-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', ?, 0, 1, 0.1, ?)`, [c, c, fisico, critico])).lastID;
  };
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-98',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const entrar = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e98' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  const status = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;
  // Montagem (Fase 0, `montarCaixa`): S pede 4; sem reserva = aprova sem saldo e entra 4 depois; ALMOX separa 4.
  const montagem = async ({ q = 4, comReserva = false, critico = 0 } = {}) => {
    const m = await material(0, critico);
    if (comReserva) await entrar(m, q);
    const a = await req([[m, q]]); await aprovar(a.R);
    if (!comReserva) await entrar(m, q);
    const s = await separar(a.R, [[a.ids[0], q]]);
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    return { m, ...a };
  };
  const liberar = (R, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/liberar-retirada`, {});

  // ── T0: a tabela e a seta (B504, B507) ────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-00] devolucoes_caixa_requisicao existe com as colunas do contrato, na ordem', async () => {
    const cols = (await dbAll(db, 'PRAGMA table_info(devolucoes_caixa_requisicao)')).map((c) => [c.name, c.type, c.notnull, c.pk]);
    assert.deepStrictEqual(cols, [
      ['id', 'INTEGER', 0, 1],
      ['requisicao_id', 'INTEGER', 1, 0], ['item_id', 'INTEGER', 1, 0], ['material_id', 'INTEGER', 1, 0],
      ['quantidade', 'REAL', 1, 0], ['separado_antes', 'REAL', 1, 0], ['separado_depois', 'REAL', 1, 0],
      ['entregue', 'REAL', 1, 0],
      ['localizacao_planejada_id', 'INTEGER', 0, 0], ['lote_planejado_id', 'INTEGER', 0, 0],
      ['motivo', 'TEXT', 1, 0], ['status_antes', 'TEXT', 0, 0], ['status_depois', 'TEXT', 0, 0],
      ['conferencia_limpa', 'INTEGER', 1, 0],
      ['usuario_id', 'INTEGER', 1, 0], ['usuario_nome', 'TEXT', 0, 0], ['created_at', 'TEXT', 1, 0],
    ]);
  });

  await test('[98 RN-00] o indice por requisicao existe; defaults de entregue, conferencia_limpa e created_at', async () => {
    const idx = await dbAll(db, 'PRAGMA index_list(devolucoes_caixa_requisicao)');
    const meu = idx.find((i) => i.name === 'idx_devolucoes_caixa_req');
    assert.ok(meu, `indice ausente: ${JSON.stringify(idx)}`);
    const colsIdx = (await dbAll(db, 'PRAGMA index_info(idx_devolucoes_caixa_req)')).map((c) => c.name);
    assert.deepStrictEqual(colsIdx, ['requisicao_id']);
    const ins = await dbRun(db, `INSERT INTO devolucoes_caixa_requisicao (requisicao_id, item_id, material_id, quantidade,
      separado_antes, separado_depois, motivo, usuario_id) VALUES (-98, -98, -98, 1, 2, 1, 't0', 1)`);
    const row = await dbGet(db, 'SELECT entregue, conferencia_limpa, created_at FROM devolucoes_caixa_requisicao WHERE id=?', [ins.lastID]);
    assert.strictEqual(row.entregue, 0);
    assert.strictEqual(row.conferencia_limpa, 0);
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.created_at), `created_at: ${row.created_at}`);
    await dbRun(db, 'DELETE FROM devolucoes_caixa_requisicao WHERE requisicao_id = -98');
  });

  await test('[98 RN-00] a seta nova PRONTA_PARA_RETIRADA -> EM_SEPARACAO; as de antes continuam; nenhuma outra', async () => {
    assert.strictEqual(maquina.validarTransicao('PRONTA_PARA_RETIRADA', 'EM_SEPARACAO').ok, true);
    assert.strictEqual(maquina.validarTransicao('PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA').ok, true);
    assert.strictEqual(maquina.validarTransicao('PRONTA_PARA_RETIRADA', 'ENTREGUE').ok, true);
    assert.deepStrictEqual([...maquina.TRANSICOES.PRONTA_PARA_RETIRADA].sort(),
      ['EM_SEPARACAO', 'ENTREGUE', 'PARCIALMENTE_ATENDIDA']);
    assert.deepStrictEqual(maquina.validarTransicao('PRONTA_PARA_RETIRADA', 'PRONTA_PARA_RETIRADA'),
      { ok: false, erro: 'Transição inválida: PRONTA_PARA_RETIRADA → PRONTA_PARA_RETIRADA' });
  });

  await test('[98 RN-00] STATUS_COM_CAIXA, PODE_SEPARAR e PODE_ENTREGAR nao mudam com a seta', async () => {
    assert.deepStrictEqual([...maquina.STATUS_COM_CAIXA].sort(), ['AGUARDANDO_APROVACAO_VALOR', 'AGUARDANDO_COMPRA',
      'AGUARDANDO_ESTOQUE', 'APROVADO', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA', 'PARCIALMENTE_RESERVADA',
      'PRONTA_PARA_RETIRADA', 'TOTALMENTE_RESERVADA']);
    assert.ok(!maquina.PODE_SEPARAR.includes('PRONTA_PARA_RETIRADA'), 'PRONTA continua fora de PODE_SEPARAR');
    assert.ok(maquina.PODE_ENTREGAR.includes('PRONTA_PARA_RETIRADA'));
  });

  await test('[98 RN-00] liberar-retirada: de EM_SEPARACAO continua 200; de PRONTA continua 400 com a literal', async () => {
    const c = await montagem();
    const l1 = await liberar(c.R);
    assert.strictEqual(l1.status, 200, JSON.stringify(l1.body));
    assert.strictEqual(await status(c.R), 'PRONTA_PARA_RETIRADA');
    const l2 = await liberar(c.R);
    assert.strictEqual(l2.status, 400);
    assert.strictEqual(l2.body.error, 'Transição inválida: PRONTA_PARA_RETIRADA → PRONTA_PARA_RETIRADA');
    assert.strictEqual(await status(c.R), 'PRONTA_PARA_RETIRADA');
  });

  // ── T1: o gesto (B502, B503, B505, B506, B511) ─────────────────────────────────────────────────────────────────────
  const requisitionService = require('../../services/almoxarifado/requisitionService');
  const trava = require('../../services/almoxarifado/travaPorMaterial');
  const { caixaSemReservaSql } = require('../../services/almoxarifado/caixaSql');
  const { ACAO_PERFIS } = require('../../services/almoxarifado/permissions');
  const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const estado = async (p) => {
    const marca = {};
    const r = await Promise.race([Promise.resolve(p).then(() => 'resolvida', () => 'rejeitada'), dormir(0).then(() => marca)]);
    return r === marca ? 'pendente' : r;
  };
  const MOTIVO = 'quebrou na caixa';
  const MSG_D409 = 'A caixa desta requisição mudou enquanto a devolução era registrada; recarregue e confira antes de devolver de novo.';
  const devolver = (R, pares, u = 'ALMOX', motivo = MOTIVO) => como(u).put(`${API}/requisicoes/${R}/devolver-separado`, {
    motivo, itens: pares.map(([item_id, quantidade]) => ({ item_id, quantidade })),
  });
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const conferir = (R, u = 'ALMOX2') => como(u).put(`${API}/requisicoes/${R}/conferir-separacao`, {});
  const mov = (m, tipo, q, u = 'ADMIN', extra = {}) => como(u).post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo, quantidade: q, motivo: 'e98', justificativa: 'teste e98', ...extra,
  });
  const item = (id) => dbGet(db, `SELECT quantidade_separada AS sep, quantidade_entregue AS ent,
    origem_separacao_id AS orig, lote_separacao_id AS lote FROM itens_requisicao_almoxarifado WHERE id=?`, [id]);
  const req1 = (R) => dbGet(db, 'SELECT status, conferido_por_id, COALESCE(ativo,1) AS ativo FROM requisicoes_almoxarifado WHERE id=?', [R]);
  const caixa = async (m) => Number((await dbGet(db, `SELECT ${caixaSemReservaSql('?')} AS c`, [m])).c);
  const resAtivas = async (R) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) AS q
    FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'`, [R])).q);
  const trilha = (R) => dbAll(db, 'SELECT * FROM devolucoes_caixa_requisicao WHERE requisicao_id=? ORDER BY id', [R]);
  const auditorias = (R) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade='requisicao' AND entidade_id=?
    AND acao='DEVOLUCAO_CAIXA' ORDER BY id`, [R]);
  const etapas = async (R) => {
    const f = (await como('ALMOX').get(`${API}/fila-separacao`)).body.find((l) => Number(l.id) === Number(R));
    return f ? f.etapas : null;
  };
  // O retrato do que uma recusa nao pode mudar: itens, requisicao, trilha, material, livro, saldo por endereco.
  const retrato = async (R, m) => ({
    itens: await dbAll(db, `SELECT id, quantidade_separada, quantidade_entregue, origem_separacao_id, lote_separacao_id
      FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id`, [R]),
    req: await dbGet(db, `SELECT status, conferido_por_id, conferido_por_nome, conferido_em, COALESCE(ativo,1) AS ativo
      FROM requisicoes_almoxarifado WHERE id=?`, [R]),
    trilha: (await trilha(R)).length,
    auditoria: (await auditorias(R)).length,
    mat: m ? await dbGet(db, `SELECT quantidade_atual, quantidade_reservada, quantidade_bloqueada FROM materiais_almoxarifado
      WHERE id=?`, [m]) : null,
    movs: m ? (await dbGet(db, 'SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n : null,
    saldoLoc: m ? await dbAll(db, `SELECT localizacao_id, lote_id, quantidade FROM estoque_saldo_almoxarifado
      WHERE material_id=? ORDER BY localizacao_id, lote_id`, [m]) : null,
  });
  const recusa = async (p, st, literal) => {
    const r = await p;
    assert.strictEqual(r.status, st, `status: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };
  const locSeq = async (c) => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e98', 1)",
    [`${c}-${++seq}`])).lastID;

  // RN-01 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-01] devolver 2 de 4: 200, separado 2, e NADA do estoque muda (fisico, reservas, bloqueio, enderecos, livro)', async () => {
    const c = await montagem();
    const antes = await retrato(c.R, c.m);
    const r = await devolver(c.R, [[c.ids[0], 2]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, {
      success: true, status: 'EM_SEPARACAO', conferencia_limpa: false,
      devolucoes: [{ item_id: c.ids[0], material_id: c.m, quantidade: 2, separado_antes: 4, separado_depois: 2, caixa_depois: 2, reserva_do_item: 0 }],
    });
    const it = await item(c.ids[0]);
    assert.strictEqual(it.sep, 2); assert.strictEqual(Number(it.ent || 0), 0);
    const depois = await retrato(c.R, c.m);
    assert.deepStrictEqual([depois.mat, depois.movs, depois.saldoLoc], [antes.mat, antes.movs, antes.saldoLoc]);
    assert.strictEqual(await caixa(c.m), 2);
  });

  await test('[98 RN-01] a quantidade e Q.qtd: 0,3333333 devolve 0,333333; dois itens numa chamada zeram os dois', async () => {
    const m = await material(0);
    const a = await req([[m, 1]]); await aprovar(a.R); await entrar(m, 1);
    assert.strictEqual((await separar(a.R, [[a.ids[0], 1]])).status, 200);
    const r = await devolver(a.R, [[a.ids[0], 0.3333333]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.devolucoes[0].quantidade, 0.333333);
    assert.strictEqual((await item(a.ids[0])).sep, 0.666667);
    const m1 = await material(0); const m2 = await material(0);
    const b = await req([[m1, 3], [m2, 2]]); await aprovar(b.R); await entrar(m1, 3); await entrar(m2, 2);
    assert.strictEqual((await separar(b.R, [[b.ids[0], 3], [b.ids[1], 2]])).status, 200);
    const r2 = await devolver(b.R, [[b.ids[0], 3], [b.ids[1], 2]]);
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.deepStrictEqual([(await item(b.ids[0])).sep, (await item(b.ids[1])).sep], [0, 0]);
    assert.strictEqual((await trilha(b.R)).length, 2);
  });

  await test('[98 RN-01] pelo servico: devolverSeparado direto devolve e grava a trilha', async () => {
    const c = await montagem();
    const r = await requisitionService.devolverSeparado(db, c.R, { motivo: MOTIVO, itens: [{ item_id: c.ids[0], quantidade: 1 }] }, USERS.ALMOX);
    assert.strictEqual(r.status, 'EM_SEPARACAO');
    assert.strictEqual(r.devolucoes[0].separado_depois, 3);
    assert.strictEqual((await item(c.ids[0])).sep, 3);
    assert.strictEqual((await trilha(c.R)).length, 1);
  });

  // RN-02 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-02] as recusas de payload: literal inteira e NADA muda (D2, D3, D4, D5, D6, D7)', async () => {
    const c = await montagem();
    const outra = await montagem();
    const nome = (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id=?', [c.m])).nome;
    const antes = await retrato(c.R, c.m);
    const put = (body) => como('ALMOX').put(`${API}/requisicoes/${c.R}/devolver-separado`, body);
    const it = c.ids[0];
    await recusa(put({ motivo: '', itens: [{ item_id: it, quantidade: 1 }] }), 400, 'Informe o motivo da devolução à prateleira');
    await recusa(put({ motivo: '   ', itens: [{ item_id: it, quantidade: 1 }] }), 400, 'Informe o motivo da devolução à prateleira');
    await recusa(put({ itens: [{ item_id: it, quantidade: 1 }] }), 400, 'Informe o motivo da devolução à prateleira');
    await recusa(put({ motivo: MOTIVO }), 400, 'Informe ao menos um item para devolver à prateleira');
    await recusa(put({ motivo: MOTIVO, itens: [] }), 400, 'Informe ao menos um item para devolver à prateleira');
    const D4 = `${nome}: informe uma quantidade maior que zero para devolver à prateleira`;
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 0 }] }), 400, D4);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: -1 }] }), 400, D4);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 'abc' }] }), 400, D4);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 0.0000001 }] }), 400, D4);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: outra.ids[0], quantidade: 1 }] }), 400,
      `Item ${outra.ids[0]} não pertence a esta requisição`);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: 'x', quantidade: 1 }] }), 400, 'Item x não pertence a esta requisição');
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 1 }, { item_id: it, quantidade: 1 }] }), 400,
      `Item ${it} repetido na devolução`);
    // a ordem por entrada: D5 antes de D4; D6 antes de D4; D4 (na segunda) antes do D7 (na primeira)
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: outra.ids[0], quantidade: 0 }] }), 400,
      `Item ${outra.ids[0]} não pertence a esta requisição`);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 1 }, { item_id: it, quantidade: 0 }] }), 400,
      `Item ${it} repetido na devolução`);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 99 }, { item_id: outra.ids[0], quantidade: 1 }] }), 400,
      `Item ${outra.ids[0]} não pertence a esta requisição`);
    await recusa(put({ motivo: MOTIVO, itens: [{ item_id: it, quantidade: 5 }] }), 400,
      `${nome}: não é possível devolver 5 PC à prateleira. Na caixa: 4 (separado: 4, entregue: 0)`);
    assert.deepStrictEqual(await retrato(c.R, c.m), antes);
  });

  await test('[98 RN-02] acima da caixa contando o ja entregue: separou 4, entregou 3, devolver 2 -> D7 "Na caixa: 1 (separado: 4, entregue: 3)"', async () => {
    const c = await montagem();
    assert.strictEqual((await entregar(c.R, [[c.ids[0], 3]])).status, 200);
    const nome = (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id=?', [c.m])).nome;
    const antes = await retrato(c.R, c.m);
    await recusa(devolver(c.R, [[c.ids[0], 2]]), 400,
      `${nome}: não é possível devolver 2 PC à prateleira. Na caixa: 1 (separado: 4, entregue: 3)`);
    assert.deepStrictEqual(await retrato(c.R, c.m), antes);
  });

  await test('[98 RN-02] dois itens, o segundo acima da caixa -> D7 e o PRIMEIRO tambem intacto', async () => {
    const m1 = await material(0); const m2 = await material(0);
    const b = await req([[m1, 3], [m2, 2]]); await aprovar(b.R); await entrar(m1, 3); await entrar(m2, 2);
    assert.strictEqual((await separar(b.R, [[b.ids[0], 3], [b.ids[1], 2]])).status, 200);
    const nome2 = (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id=?', [m2])).nome;
    const antes = await retrato(b.R, m1);
    await recusa(devolver(b.R, [[b.ids[0], 1], [b.ids[1], 3]]), 400,
      `${nome2}: não é possível devolver 3 PC à prateleira. Na caixa: 2 (separado: 2, entregue: 0)`);
    assert.deepStrictEqual(await retrato(b.R, m1), antes);
  });

  await test('[98 RN-02] status fora de STATUS_COM_CAIXA -> D1 (Entregue, Encerrada, Cancelado, Pendente); excluida e inexistente -> 404 D0', async () => {
    const D1 = (st) => `Só é possível devolver à prateleira o que está separado numa requisição em andamento (status atual: ${st})`;
    const e = await montagem();
    assert.strictEqual((await entregar(e.R, [[e.ids[0], 4]])).status, 200);
    await recusa(devolver(e.R, [[e.ids[0], 1]]), 400, D1('ENTREGUE'));
    const f = await montagem();
    assert.strictEqual((await entregar(f.R, [[f.ids[0], 2]])).status, 200);
    assert.strictEqual((await como('ADMIN').put(`${API}/requisicoes/${f.R}/encerrar`, { motivo: 'e98 encerra' })).status, 200);
    await recusa(devolver(f.R, [[f.ids[0], 1]]), 400, D1('ENCERRADA'));
    const m = await material(0);
    const g = await req([[m, 2]]); await aprovar(g.R);
    assert.strictEqual((await como('S').put(`/api/requisicoes-material/${g.R}/cancelar`, { motivo: 'e98' })).status, 200);
    await recusa(devolver(g.R, [[g.ids[0], 1]]), 400, D1('CANCELADO'));
    const p = await req([[m, 2]]);
    await recusa(devolver(p.R, [[p.ids[0], 1]]), 400, D1('PENDENTE'));
    const x = await montagem();
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 0 WHERE id = ?', [x.R]);
    const antes = await retrato(x.R, x.m);
    await recusa(devolver(x.R, [[x.ids[0], 1]]), 404, 'Requisição não encontrada');
    assert.deepStrictEqual(await retrato(x.R, x.m), antes);
    await recusa(devolver(99999999, [[x.ids[0], 1]]), 404, 'Requisição não encontrada');
  });

  await test('[98 RN-02] pelo servico: sem usuario identificado -> 400 D-1; motivo vazio -> D2; nada muda', async () => {
    const c = await montagem();
    const antes = await retrato(c.R, c.m);
    const tenta = async (args, user, literal) => {
      let erro = null;
      try { await requisitionService.devolverSeparado(db, c.R, args, user); } catch (err) { erro = err; }
      assert.ok(erro, 'deveria recusar');
      assert.deepStrictEqual([erro.status, erro.message], [400, literal]);
    };
    await tenta({ motivo: MOTIVO, itens: [{ item_id: c.ids[0], quantidade: 1 }] }, { nome: 'sem id' },
      'Devolução à prateleira exige usuário identificado');
    await tenta({ motivo: ' ', itens: [{ item_id: c.ids[0], quantidade: 1 }] }, USERS.ALMOX, 'Informe o motivo da devolução à prateleira');
    assert.deepStrictEqual(await retrato(c.R, c.m), antes);
  });

  // O claim e a garantia (molde do claimConferencia da 28): a pre-validacao le a caixa e o claim escreve depois. Um
  // escritor fora da trava (aqui simulado: entregue 3 gravado entre a leitura e o claim) faz o claim perder -> 409, e o
  // separado nunca fica menor que o entregue. (Execucao da T1: o controle s1 do plano apontava para o D7 de payload, que
  // a pre-validacao pega antes do claim — este e o teste que o s1 derruba.)
  await test('[98 RN-02] o claim confere a caixa no banco: entregue 3 gravado entre a leitura e o claim -> 409 D409, separado 4 intacto, sem trilha', async () => {
    const c = await montagem();
    const orig = db.all;
    let armado = true;
    db.all = function gancho(sql, ...args) {
      if (armado && /FROM itens_requisicao_almoxarifado ir\s+JOIN materiais_almoxarifado ma/.test(sql) && Number(args[0][0]) === Number(c.R)) {
        armado = false;
        const cb = args[args.length - 1];
        args[args.length - 1] = function aposLer(err, rows) {
          const ctx = this;
          dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 3 WHERE id = ?', [c.ids[0]])
            .then(() => cb.call(ctx, err, rows), () => cb.call(ctx, err, rows));
        };
      }
      return orig.call(this, sql, ...args);
    };
    let r;
    try { r = await devolver(c.R, [[c.ids[0], 2]]); } finally { db.all = orig; }
    assert.ok(!armado, 'premissa: o gancho disparou');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_D409);
    assert.strictEqual((await item(c.ids[0])).sep, 4);
    assert.strictEqual((await trilha(c.R)).length, 0);
  });

  // RN-02b ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-02b] o 409 no meio do laco: quem pediu cancela depois do 1o claim -> 409 D409; item 1 devolvido COM trilha e auditoria; item 2 intacto', async () => {
    const m1 = await material(0); const m2 = await material(0);
    await entrar(m1, 2); await entrar(m2, 2);
    const b = await req([[m1, 2], [m2, 2]]); await aprovar(b.R);
    assert.strictEqual(await status(b.R), 'TOTALMENTE_RESERVADA');
    // legado (escritor de legado, como a 97): caixa nos dois itens num status pre-separacao
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2 WHERE requisicao_id = ?', [b.R]);
    const orig = db.run;
    // O cancelamento troca o status ANTES de liberar as reservas, e a liberacao pega a trava do material que a devolucao
    // segura: o gancho espera so a troca do status (o resto do cancelamento termina depois que a devolucao solta a trava).
    let disparou = false; let cancelamento = null;
    db.run = function gancho(sql, ...args) {
      if (!disparou && /UPDATE itens_requisicao_almoxarifado SET quantidade_separada = ROUND/.test(sql)) {
        disparou = true;
        const cb = args[args.length - 1];
        args[args.length - 1] = function aposClaim(err) {
          const ctx = this;
          cancelamento = como('S').put(`/api/requisicoes-material/${b.R}/cancelar`, { motivo: 'e98 no meio' });
          const espera = async () => {
            for (let k = 0; k < 200 && (await status(b.R)) !== 'CANCELADO'; k++) await dormir(5); // eslint-disable-line no-await-in-loop
          };
          espera().then(() => cb.call(ctx, err), () => cb.call(ctx, err));
        };
      }
      return orig.call(this, sql, ...args);
    };
    let r;
    try { r = await devolver(b.R, [[b.ids[0], 2], [b.ids[1], 2]]); } finally { db.run = orig; }
    assert.ok(cancelamento, 'premissa: o gancho disparou');
    assert.strictEqual((await cancelamento).status, 200, 'premissa: o cancelamento pelos outros modulos passou no meio');
    assert.strictEqual(await status(b.R), 'CANCELADO');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, MSG_D409);
    assert.strictEqual((await item(b.ids[0])).sep, 0);
    assert.strictEqual((await item(b.ids[1])).sep, 2);
    const t = await trilha(b.R);
    assert.deepStrictEqual(t.map((x) => [x.item_id, x.quantidade, x.separado_antes, x.separado_depois]), [[b.ids[0], 2, 2, 0]]);
    assert.strictEqual((await auditorias(b.R)).length, 1);
  });

  // RN-03 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-03] EM_SEPARACAO: com resto fica; esvaziada fica (vazia, fila SEPARAR, separar 4 de novo 200)', async () => {
    const c = await montagem();
    assert.strictEqual((await devolver(c.R, [[c.ids[0], 1]])).body.status, 'EM_SEPARACAO');
    const r = await devolver(c.R, [[c.ids[0], 3]]);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'EM_SEPARACAO');
    assert.strictEqual((await item(c.ids[0])).sep, 0);
    assert.ok((await etapas(c.R)).includes('SEPARAR'), `fila: ${JSON.stringify(await etapas(c.R))}`);
    assert.strictEqual((await separar(c.R, [[c.ids[0], 4]])).status, 200);
  });

  await test('[98 RN-03] PRONTA_PARA_RETIRADA: devolver 1 -> 200 e EM_SEPARACAO; entregar o resto 200; devolver tudo tambem volta', async () => {
    const c = await montagem();
    assert.strictEqual((await liberar(c.R)).status, 200);
    const r = await devolver(c.R, [[c.ids[0], 1]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'EM_SEPARACAO');
    assert.strictEqual(await status(c.R), 'EM_SEPARACAO');
    const t = await trilha(c.R);
    assert.deepStrictEqual([t[0].status_antes, t[0].status_depois], ['PRONTA_PARA_RETIRADA', 'EM_SEPARACAO']);
    assert.strictEqual((await entregar(c.R, [[c.ids[0], 3]])).status, 200);
    const d = await montagem();
    assert.strictEqual((await liberar(d.R)).status, 200);
    assert.strictEqual((await devolver(d.R, [[d.ids[0], 4]])).body.status, 'EM_SEPARACAO');
    assert.strictEqual(await status(d.R), 'EM_SEPARACAO');
  });

  await test('[98 RN-03] PARCIALMENTE_ATENDIDA fica; encerrar depois -> 200', async () => {
    const c = await montagem();
    assert.strictEqual((await entregar(c.R, [[c.ids[0], 2]])).status, 200);
    const r = await devolver(c.R, [[c.ids[0], 2]]);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(await status(c.R), 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual((await como('ADMIN').put(`${API}/requisicoes/${c.R}/encerrar`, { motivo: 'e98 encerra' })).status, 200);
  });

  await test('[98 RN-03] legado pre-separacao com caixa e AGUARDANDO_APROVACAO_VALOR com caixa: devolver 200, status igual', async () => {
    const m = await material(0); await entrar(m, 4);
    const a = await req([[m, 4]]); await aprovar(a.R);
    assert.strictEqual(await status(a.R), 'TOTALMENTE_RESERVADA');
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 4 WHERE id = ?', [a.ids[0]]);
    const r = await devolver(a.R, [[a.ids[0], 4]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await status(a.R), 'TOTALMENTE_RESERVADA');
    const c = await montagem();
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'AGUARDANDO_APROVACAO_VALOR' WHERE id = ?", [c.R]);
    const r2 = await devolver(c.R, [[c.ids[0], 2]]);
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body)); assert.strictEqual(r2.body.status, 'AGUARDANDO_APROVACAO_VALOR');
  });

  await test('[98 RN-03] esvaziada a EM_SEPARACAO com o limite de valor abaixo do custo, separar de novo -> 403 V403b (a alcada vale de novo)', async () => {
    const chaves = ['liberacao_valor_ativo', 'liberacao_valor_limite', 'liberacao_valor_aprovadores'];
    const antes = await dbAll(db, `SELECT chave, valor FROM configuracoes_almoxarifado WHERE chave IN (${chaves.map(() => '?').join(',')})`, chaves);
    const config = async (ativo, limite) => {
      for (const [k, v] of [['liberacao_valor_ativo', String(ativo)], ['liberacao_valor_limite', String(limite)], ['liberacao_valor_aprovadores', '[1]']]) {
        // eslint-disable-next-line no-await-in-loop
        await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
          ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
      }
    };
    try {
      await config(1, 10);
      const c = await montagem();
      await config(1, 0.1);
      assert.strictEqual((await devolver(c.R, [[c.ids[0], 4]])).status, 200);
      const s = await separar(c.R, [[c.ids[0], 4]]);
      assert.strictEqual(s.status, 403, JSON.stringify(s.body));
      assert.match(s.body.error, /^Valor total \(R\$\s?[\d.,]+\) excede o limite de liberação automática \(R\$\s?[\d.,]+\)\. Aprovação de alto valor necessária\.$/);
    } finally {
      await dbRun(db, `DELETE FROM configuracoes_almoxarifado WHERE chave IN (${chaves.map(() => '?').join(',')})`, chaves);
      for (const { chave, valor } of antes) {
        // eslint-disable-next-line no-await-in-loop
        await dbRun(db, 'INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)', [chave, valor]);
      }
    }
  });

  // RN-04 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const C3 = 'Esta requisição tem material crítico separado e ainda não passou pela segunda conferência. Peça a outra '
    + 'pessoa do almoxarifado para conferir a separação antes de liberar ou entregar.';
  await test('[98 RN-04] critico conferido: ALMOX2 devolve 1 -> conferencia limpa; entregar 400 C3; ALMOX (separou) 403; ALMOX2 (devolveu) confere 200; entregar 3 200', async () => {
    const c = await montagem({ critico: 1 });
    assert.strictEqual((await conferir(c.R)).status, 200);
    const conf = await req1(c.R);
    assert.strictEqual(conf.conferido_por_id, USERS.ALMOX2.id);
    const r = await devolver(c.R, [[c.ids[0], 1]], 'ALMOX2');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.conferencia_limpa, true);
    assert.strictEqual((await req1(c.R)).conferido_por_id, null);
    assert.strictEqual((await trilha(c.R))[0].conferencia_limpa, 1);
    const aud = await auditorias(c.R);
    assert.strictEqual(aud.length, 1);
    assert.strictEqual(JSON.parse(aud[0].dados_anteriores).conferencia.usuario_id, USERS.ALMOX2.id);
    await recusa(entregar(c.R, [[c.ids[0], 3]]), 400, C3);
    assert.strictEqual((await conferir(c.R, 'ALMOX')).status, 403);
    assert.strictEqual((await conferir(c.R, 'ALMOX2')).status, 200);
    assert.strictEqual((await entregar(c.R, [[c.ids[0], 3]])).status, 200);
  });

  await test('[98 RN-04] PARCIALMENTE_ATENDIDA com critico na caixa: devolver limpa a conferencia e a fila inclui REABRIR_SEPARACAO', async () => {
    const c = await montagem({ critico: 1 });
    assert.strictEqual((await conferir(c.R)).status, 200);
    assert.strictEqual((await entregar(c.R, [[c.ids[0], 2]])).status, 200);
    assert.strictEqual(await status(c.R), 'PARCIALMENTE_ATENDIDA');
    assert.ok((await req1(c.R)).conferido_por_id, 'premissa: a conferencia da primeira rodada continua');
    const r = await devolver(c.R, [[c.ids[0], 1]]);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.conferencia_limpa, true);
    assert.strictEqual((await req1(c.R)).conferido_por_id, null);
    assert.ok((await etapas(c.R)).includes('REABRIR_SEPARACAO'), `fila: ${JSON.stringify(await etapas(c.R))}`);
  });

  await test('[98 RN-04] sem conferencia gravada: conferencia_limpa false e nenhuma conferencia em dados_anteriores', async () => {
    const c = await montagem();
    const r = await devolver(c.R, [[c.ids[0], 1]]);
    assert.strictEqual(r.body.conferencia_limpa, false);
    const aud = await auditorias(c.R);
    assert.strictEqual(aud[0].dados_anteriores, null);
  });

  // RN-05 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-05] com reserva: devolver 4 nao mexe na reserva; PERDA 400 sem sufixo; libera a reserva -> PERDA 201', async () => {
    const c = await montagem({ comReserva: true });
    const r = await devolver(c.R, [[c.ids[0], 4]]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.devolucoes[0].reserva_do_item, 4);
    assert.strictEqual(await resAtivas(c.R), 4);
    assert.strictEqual(await caixa(c.m), 0);
    assert.ok((await etapas(c.R)).includes('SEPARAR'), `fila: ${JSON.stringify(await etapas(c.R))}`);
    await recusa(mov(c.m, 'PERDA', 4, 'ALMOX'), 400, 'Saldo insuficiente. Disponível: 0 PC');
    const rid = (await dbGet(db, "SELECT id FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'", [c.R])).id;
    const lib = await como('ALMOX').post(`${API}/reservas/${rid}/liberar`, { motivo: 'e98 quebrou' });
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    const p = await mov(c.m, 'PERDA', 4, 'ALMOX');
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
  });

  // RN-06 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-06] origem/lote planejados: devolver parte mantem LA e L; devolver o resto zera; a entrega seguinte sai de LB sem troca', async () => {
    const m = await material(0);
    const LA = await locSeq('E98A'); const LB = await locSeq('E98B');
    const a = await req([[m, 4]]); await aprovar(a.R);
    const en = await mov(m, 'ENTRADA', 4, 'ADMIN', { localizacao_destino_id: LA, lote: `L98-${m}` });
    assert.strictEqual(en.status, 201, JSON.stringify(en.body));
    const L = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=?', [m])).id;
    const s = await como('ALMOX').put(`${API}/requisicoes/${a.R}/separar`, {
      itens_separados: [{ item_id: a.ids[0], quantidade_separada: 4, localizacao_origem_id: LA, lote_id: L }],
    });
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    assert.strictEqual((await devolver(a.R, [[a.ids[0], 2]])).status, 200);
    let it = await item(a.ids[0]);
    assert.deepStrictEqual([it.orig, it.lote], [LA, L]);
    assert.strictEqual((await devolver(a.R, [[a.ids[0], 2]])).status, 200);
    it = await item(a.ids[0]);
    assert.deepStrictEqual([it.orig, it.lote], [null, null]);
    const t = await trilha(a.R);
    assert.deepStrictEqual(t.map((x) => [x.localizacao_planejada_id, x.lote_planejado_id]), [[LA, L], [LA, L]]);
    const e2 = await mov(m, 'ENTRADA', 4, 'ADMIN', { localizacao_destino_id: LB });
    assert.strictEqual(e2.status, 201, JSON.stringify(e2.body));
    const s2 = await como('ALMOX').put(`${API}/requisicoes/${a.R}/separar`, {
      itens_separados: [{ item_id: a.ids[0], quantidade_separada: 4, localizacao_origem_id: LB }],
    });
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    const e = await entregar(a.R, [[a.ids[0], 4]]);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const subs = await dbGet(db, 'SELECT COUNT(*) AS n FROM substituicoes_origem_requisicao WHERE requisicao_id=?', [a.R]);
    assert.strictEqual(subs.n, 0);
    const lb = await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) AS q FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [m, LB]);
    assert.strictEqual(Number(lb.q), 0);
  });

  // RN-07 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-07] a trilha: uma linha por item, motivo trimado <= 500, uma auditoria por chamada; o detalhe devolve devolucoes_caixa na forma congelada', async () => {
    const m1 = await material(0); const m2 = await material(0);
    const b = await req([[m1, 3], [m2, 2]]); await aprovar(b.R); await entrar(m1, 3); await entrar(m2, 2);
    assert.strictEqual((await separar(b.R, [[b.ids[0], 3], [b.ids[1], 2]])).status, 200);
    const longo = `  ${'x'.repeat(600)}  `;
    assert.strictEqual((await devolver(b.R, [[b.ids[0], 1], [b.ids[1], 2]], 'ALMOX', longo)).status, 200);
    assert.strictEqual((await devolver(b.R, [[b.ids[0], 2]], 'ALMOX2', '  segunda  ')).status, 200);
    const t = await trilha(b.R);
    assert.strictEqual(t.length, 3);
    assert.deepStrictEqual(t.map((x) => [x.item_id, x.material_id, x.quantidade, x.separado_antes, x.separado_depois, x.entregue,
      x.status_antes, x.status_depois, x.conferencia_limpa, x.usuario_id, x.usuario_nome]), [
      [b.ids[0], m1, 1, 3, 2, 0, 'EM_SEPARACAO', 'EM_SEPARACAO', 0, USERS.ALMOX.id, USERS.ALMOX.nome],
      [b.ids[1], m2, 2, 2, 0, 0, 'EM_SEPARACAO', 'EM_SEPARACAO', 0, USERS.ALMOX.id, USERS.ALMOX.nome],
      [b.ids[0], m1, 2, 2, 0, 0, 'EM_SEPARACAO', 'EM_SEPARACAO', 0, USERS.ALMOX2.id, USERS.ALMOX2.nome],
    ]);
    assert.strictEqual(t[0].motivo, 'x'.repeat(500));
    assert.strictEqual(t[2].motivo, 'segunda');
    const aud = await auditorias(b.R);
    assert.strictEqual(aud.length, 2);
    const dn = JSON.parse(aud[0].dados_novos);
    assert.strictEqual(dn.itens.length, 2);
    const det = await como('ALMOX').get(`${API}/requisicoes/${b.R}`);
    assert.strictEqual(det.status, 200);
    const dc = det.body.devolucoes_caixa;
    assert.strictEqual(dc.length, 3);
    assert.deepStrictEqual(Object.keys(dc[0]), ['id', 'item_id', 'material_id', 'material_codigo', 'quantidade', 'separado_antes',
      'separado_depois', 'entregue', 'localizacao_planejada_codigo', 'lote_planejado_codigo', 'motivo', 'status_antes',
      'status_depois', 'conferencia_limpa', 'usuario_id', 'usuario_nome', 'created_at']);
    assert.deepStrictEqual(dc.map((x) => x.id), t.map((x) => x.id));
    assert.strictEqual(dc[0].conferencia_limpa, false);
    assert.strictEqual(dc[0].material_codigo, (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id=?', [m1])).codigo);
    // aditivo: o que o detalhe ja devolvia continua
    for (const k of ['itens', 'separacoes', 'substituicoes', 'conferencia', 'conferencia_obrigatoria']) assert.ok(k in det.body, k);
  });

  await test('[98 RN-07] auditoria que falha NAO desfaz: a devolucao responde 200 e a trilha da tabela existe', async () => {
    const c = await montagem();
    await dbRun(db, 'ALTER TABLE auditoria_log_almoxarifado RENAME TO auditoria_log_almoxarifado_e98');
    let r;
    try { r = await devolver(c.R, [[c.ids[0], 1]]); } finally {
      await dbRun(db, 'ALTER TABLE auditoria_log_almoxarifado_e98 RENAME TO auditoria_log_almoxarifado');
    }
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await item(c.ids[0])).sep, 3);
    assert.strictEqual((await trilha(c.R)).length, 1);
    assert.strictEqual((await auditorias(c.R)).length, 0);
  });

  // RN-08 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[98 RN-08] autorizacao: ALMOX, ADMINISTRADOR e superadmin 200; S, GESTOR, QUALIDADE, COMPRAS, ENGENHARIA, CONSULTA 403 antes de ler', async () => {
    Object.assign(USERS, {
      ADMPERFIL: { id: 9810, nome: 'AdmPerfil 98', role: 'user', email: 'ap98@t.com', perfil_almoxarifado: PERFIS.ADMINISTRADOR },
      GESTOR: { id: 9811, nome: 'Gestor 98', role: 'user', email: 'g98@t.com', perfil_almoxarifado: PERFIS.GESTOR },
      QUALIDADE: { id: 9812, nome: 'Qual 98', role: 'user', email: 'q98@t.com', perfil_almoxarifado: PERFIS.QUALIDADE },
      COMPRAS: { id: 9813, nome: 'Compras 98', role: 'user', email: 'c98@t.com', perfil_almoxarifado: PERFIS.COMPRAS },
      ENGENHARIA: { id: 9814, nome: 'Eng 98', role: 'user', email: 'e98@t.com', perfil_almoxarifado: PERFIS.ENGENHARIA },
      CONSULTA: { id: 9815, nome: 'Cons 98', role: 'user', email: 'k98@t.com', perfil_almoxarifado: PERFIS.CONSULTA },
    });
    const c = await montagem();
    const antes = await retrato(c.R, c.m);
    for (const u of ['S', 'GESTOR', 'QUALIDADE', 'COMPRAS', 'ENGENHARIA', 'CONSULTA']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await devolver(c.R, [[c.ids[0], 1]], u);
      assert.strictEqual(r.status, 403, `${u}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Sem permissão para esta operação');
      assert.strictEqual(r.body.acao, 'separar_emitir');
    }
    // o 403 sai antes de ler a requisicao: inexistente tambem e 403, nao 404
    assert.strictEqual((await devolver(99999999, [[c.ids[0], 1]], 'S')).status, 403);
    assert.deepStrictEqual(await retrato(c.R, c.m), antes);
    for (const u of ['ALMOX', 'ADMPERFIL', 'ADMIN']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await devolver(c.R, [[c.ids[0], 1]], u);
      assert.strictEqual(r.status, 200, `${u}: ${r.status} ${JSON.stringify(r.body)}`);
    }
    assert.strictEqual((await item(c.ids[0])).sep, 1);
    assert.deepStrictEqual(Object.keys(ACAO_PERFIS).filter((k) => /devol/.test(k) && /separ|caixa|prateleira/.test(k)), []);
  });

  // RN-10 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // (a) a corrida real (Fase 2, I-2): o liberar para retirada segura so a trava por requisicao; parado depois de contar os
  // separados, a devolucao tem de ESPERAR — senao ela esvazia a caixa e o liberar grava PRONTA vazia.
  await test('[98 RN-10] (a) liberar parado depois de contar os separados: a devolucao espera; nunca PRONTA com caixa 0 (0/10)', async () => {
    const errados = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const c = await montagem();
      const orig = db.get;
      let solta; const parado = new Promise((r) => { solta = r; });
      let chegou; const chegada = new Promise((r) => { chegou = r; });
      let armado = true;
      db.get = function gancho(sql, ...args) {
        if (armado && /SELECT COUNT\(\*\) as n FROM itens_requisicao_almoxarifado WHERE requisicao_id = \? AND quantidade_separada > 0/.test(sql)) {
          armado = false;
          const cb = args[args.length - 1];
          args[args.length - 1] = function aposContar(err, row) { const ctx = this; chegou(); parado.then(() => cb.call(ctx, err, row)); };
        }
        return orig.call(this, sql, ...args);
      };
      let lib; let dev; let pendente;
      try {
        lib = liberar(c.R);
        // eslint-disable-next-line no-await-in-loop
        await chegada;
        dev = requisitionService.devolverSeparado(db, c.R, { motivo: MOTIVO, itens: [{ item_id: c.ids[0], quantidade: 4 }] }, USERS.ALMOX)
          .then((x) => x, (e) => ({ erro: e.message }));
        // eslint-disable-next-line no-await-in-loop
        await dormir(30);
        // eslint-disable-next-line no-await-in-loop
        pendente = await estado(dev);
        solta();
        // eslint-disable-next-line no-await-in-loop
        lib = await lib; dev = await dev;
      } finally { db.get = orig; }
      // eslint-disable-next-line no-await-in-loop
      const fim = { st: await status(c.R), sep: (await item(c.ids[0])).sep };
      const certo = pendente === 'pendente' && lib.status === 200 && dev.status === 'EM_SEPARACAO'
        && fim.st === 'EM_SEPARACAO' && fim.sep === 0;
      if (!certo) errados.push({ pendente, lib: lib.status, dev, fim });
    }
    assert.deepStrictEqual(errados, []);
  });

  await test('[98 RN-10] (b) com a trava do material presa, a PERDA avulsa espera a devolucao e passa depois (a caixa caiu) (0/10)', async () => {
    const errados = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const c = await montagem();
      let solta;
      const segura = trava.comLockDoMaterial(c.m, () => new Promise((r) => { solta = r; }));
      // eslint-disable-next-line no-await-in-loop
      await dormir(5);
      const dev = requisitionService.devolverSeparado(db, c.R, { motivo: MOTIVO, itens: [{ item_id: c.ids[0], quantidade: 2 }] }, USERS.ALMOX)
        .then((x) => x, (e) => ({ erro: e.message }));
      // eslint-disable-next-line no-await-in-loop
      await dormir(30);
      const perda = mov(c.m, 'PERDA', 2, 'ALMOX');
      // eslint-disable-next-line no-await-in-loop
      await dormir(30);
      // eslint-disable-next-line no-await-in-loop
      const pend = [await estado(dev), await estado(perda)];
      solta();
      // eslint-disable-next-line no-await-in-loop
      await segura;
      // eslint-disable-next-line no-await-in-loop
      const [d, p] = await Promise.all([dev, perda]);
      const certo = pend[0] === 'pendente' && pend[1] === 'pendente' && d.status === 'EM_SEPARACAO' && p.status === 201;
      if (!certo) errados.push({ pend, d, p: [p.status, p.body.error] });
    }
    assert.deepStrictEqual(errados, []);
  });

  await test('[98 RN-10] (c) a separacao de OUTRA requisicao do mesmo material espera a devolucao e separa o que ela soltou (0/10)', async () => {
    const errados = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const c = await montagem();
      // eslint-disable-next-line no-await-in-loop
      const r2 = await req([[c.m, 2]]);
      // eslint-disable-next-line no-await-in-loop
      await aprovar(r2.R);
      const orig = db.all;
      let solta; const parado = new Promise((r) => { solta = r; });
      let chegou; const chegada = new Promise((r) => { chegou = r; });
      let armado = true;
      db.all = function gancho(sql, ...args) {
        if (armado && /FROM itens_requisicao_almoxarifado ir\s+JOIN materiais_almoxarifado ma/.test(sql) && Number(args[0][0]) === Number(c.R)) {
          armado = false;
          const cb = args[args.length - 1];
          args[args.length - 1] = function aposLer(err, rows) { const ctx = this; chegou(); parado.then(() => cb.call(ctx, err, rows)); };
        }
        return orig.call(this, sql, ...args);
      };
      let dev; let sep; let pend;
      try {
        dev = requisitionService.devolverSeparado(db, c.R, { motivo: MOTIVO, itens: [{ item_id: c.ids[0], quantidade: 2 }] }, USERS.ALMOX)
          .then((x) => x, (e) => ({ erro: e.message }));
        // eslint-disable-next-line no-await-in-loop
        await chegada;
        sep = requisitionService.separarRequisicao(db, r2.R, [{ item_id: r2.ids[0], quantidade_separada: 2 }], USERS.ALMOX2)
          .then((x) => x, (e) => ({ erro: e.message }));
        // eslint-disable-next-line no-await-in-loop
        await dormir(30);
        // eslint-disable-next-line no-await-in-loop
        pend = await estado(sep);
        solta();
        // eslint-disable-next-line no-await-in-loop
        dev = await dev; sep = await sep;
      } finally { db.all = orig; }
      // eslint-disable-next-line no-await-in-loop
      const sepR2 = (await item(r2.ids[0])).sep;
      const certo = pend === 'pendente' && dev.status === 'EM_SEPARACAO' && sep.success === true && sepR2 === 2;
      if (!certo) errados.push({ pend, dev, sep, sepR2 });
    }
    assert.deepStrictEqual(errados, []);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
