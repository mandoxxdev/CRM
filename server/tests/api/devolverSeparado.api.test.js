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
 * T0: RN-00 (a tabela e a seta). Casos `[98 RN-xx]`.
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

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
