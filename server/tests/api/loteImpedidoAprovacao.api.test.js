/**
 * Etapa 205 (T1) — a aprovacao reserva so o que pode sair (RN-205.03 a .07, parte da aprovacao).
 *
 * As tres portas (`/aprovar`, aprovacao automatica do `POST /requisicoes`, `/aprovar-valor`) passam por `prepararPosAprovacao`: o
 * `reservarItensAprovacao` le `disponivel_liberado` e o `calcularStatusPosAprovacao` desconta o lote impedido. Material com controle
 * de lote, lotes por Entrada v2 (nao distribui), status por `PUT /lotes/:id/status`, validades relativas (diaLocal).
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md (T1).
 *
 * Executar: cd server && node tests/api/loteImpedidoAprovacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { calcularStatusPosAprovacao } = require('../../services/almoxarifado/requisitionStateMachine');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 205a', role: 'admin', is_superadmin: 1, email: 'a205a@t.com' },
  SOL: { id: 20511, nome: 'Solic 205a', email: 's205a@t.com' },
  APRV: { id: 20512, nome: 'Aprovador valor 205a', perfil_almoxarifado: 'GESTOR', email: 'v205a@t.com' },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 205 (T1): a aprovacao reserva so o que pode sair ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of Object.values(USERS)) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM205A', nome: 'Almox 205a' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z205A-01', descricao: 'Z205A-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z205A-01'");

  const material = async ({ custo = 0.1, lote = 1 } = {}) => {
    const c = `E205A-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, ?, ?, 0, ?)`, [c, c, custo, lote, P01.id])).lastID;
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e205a', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;
  const status = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 205' }));
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const criar = async (m, q, k = 'SOL') => {
    const r = await como(k).post(`${API}/requisicoes`, { os_referencia: 'OS-205', itens: [{ material_id: m, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const aprovar = (R) => ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}));
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade, status FROM reservas_material_almoxarifado WHERE requisicao_id = ?
    ORDER BY id`, [R])).map((x) => [Number(x.quantidade), x.status]);
  const l1l2 = async (opcoes = {}) => {
    const m = await material(opcoes);
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    await status(m, 'L2', 'BLOQUEADO');
    return m;
  };

  // ── RN-205.03: as tres portas ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.03 /aprovar] L1 ATIVO 4, L2 BLOQUEADO 6, requisicao de 10 -> 200, reserva ATIVA de 4, PARCIALMENTE_RESERVADA', async () => {
    const m = await l1l2();
    const R = (await criar(m, 10)).id;
    const r = await aprovar(R);
    assert.strictEqual(r.body.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(r.body));
    assert.deepStrictEqual(await reservas(R), [[4, 'ATIVA']]);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
  });
  await test('[RN-205.03 automatica] POST /requisicoes com aprovacao automatica -> 201, reserva de 4, PARCIALMENTE_RESERVADA', async () => {
    const m = await l1l2();
    await cfg('aprovacao_automatica', '1');
    try {
      const b = await criar(m, 10);
      assert.strictEqual(b.aprovacao, 'automatica', JSON.stringify(b));
      assert.strictEqual(b.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(b));
      assert.deepStrictEqual(await reservas(b.id), [[4, 'ATIVA']]);
    } finally { await cfg('aprovacao_automatica', '0'); }
  });
  await test('[RN-205.03 /aprovar-valor] requisicao acima do limite -> 200, reserva de 4, PARCIALMENTE_RESERVADA', async () => {
    await cfg('liberacao_valor_ativo', '1');
    await cfg('liberacao_valor_limite', '100');
    await cfg('liberacao_valor_aprovadores', JSON.stringify([USERS.APRV.id]));
    try {
      const m = await l1l2({ custo: 100 });
      const b = await criar(m, 10);
      assert.strictEqual(b.status, 'AGUARDANDO_APROVACAO_VALOR', `premissa: ${JSON.stringify(b)}`);
      const r = await ok(como('APRV').put(`${API}/requisicoes/${b.id}/aprovar-valor`, {}));
      assert.strictEqual(r.body.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(r.body));
      assert.deepStrictEqual(await reservas(b.id), [[4, 'ATIVA']]);
    } finally { await cfg('liberacao_valor_ativo', '0'); }
  });

  // ── RN-205.04: so lote impedido ────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.04] so L2 BLOQUEADO 6, requisicao de 3, sem compra -> 200, nenhuma reserva, AGUARDANDO_ESTOQUE (unidade igual)', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const R = (await criar(m, 3)).id;
    assert.strictEqual(await calcularStatusPosAprovacao(db, R), 'AGUARDANDO_ESTOQUE', 'unidade: calcularStatusPosAprovacao');
    const r = await aprovar(R);
    assert.strictEqual(r.body.status, 'AGUARDANDO_ESTOQUE', JSON.stringify(r.body));
    assert.deepStrictEqual(await reservas(R), []);
  });
  await test('[RN-205.04] o mesmo com solicitacao de compra PENDENTE do material -> AGUARDANDO_COMPRA', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, "INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status) VALUES (?, 4, 'MANUAL', 'PENDENTE')", [m]);
    const R = (await criar(m, 3)).id;
    const r = await aprovar(R);
    assert.strictEqual(r.body.status, 'AGUARDANDO_COMPRA', JSON.stringify(r.body));
    assert.deepStrictEqual(await reservas(R), []);
  });

  // ── RN-205.05: vencido; liberado volta a contar ────────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.05] so L1 ATIVO 5 vencido ontem -> aprovacao de 5 sem reserva, AGUARDANDO_ESTOQUE; liberado o vencimento, R2 de 5 reserva 5', async () => {
    const m = await material(); await entrar(m, 5, 'L1'); await validade(m, 'L1', dia(-1));
    const R1 = (await criar(m, 5)).id;
    assert.strictEqual((await aprovar(R1)).body.status, 'AGUARDANDO_ESTOQUE');
    assert.deepStrictEqual(await reservas(R1), []);
    await ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, 'L1')}/liberar-vencimento`, { justificativa: 'teste 205' }));
    const R2 = (await criar(m, 5)).id;
    assert.strictEqual((await aprovar(R2)).body.status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(R2), [[5, 'ATIVA']]);
  });

  // ── RN-205.06: sem controle de lote nada muda ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.06] a montagem de RN-205.03 com controle_lote = 0 -> reserva 10, TOTALMENTE_RESERVADA (igual hoje)', async () => {
    const m = await l1l2();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    const R = (await criar(m, 10)).id;
    assert.strictEqual((await aprovar(R)).body.status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(R), [[10, 'ATIVA']]);
  });

  // ── RN-205.07: a reserva que ja existe fica ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.07] L1 10, R1 de 6 reservada; L1 -> BLOQUEADO: a reserva fica ATIVA 6, reaprovar nao mexe, R2 de 4 nao reserva (AGUARDANDO_ESTOQUE)', async () => {
    const m = await material(); await entrar(m, 10, 'L1');
    const R1 = (await criar(m, 6)).id;
    assert.strictEqual((await aprovar(R1)).body.status, 'TOTALMENTE_RESERVADA', 'premissa');
    await status(m, 'L1', 'BLOQUEADO');
    assert.deepStrictEqual(await reservas(R1), [[6, 'ATIVA']], 'bloquear o lote nao solta a reserva');
    const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R1]);
    const pos = await requisitionService.comTravaDaRequisicao(db, R1,
      () => requisitionService.prepararPosAprovacao(db, R1, USERS.ADMIN, reqRow));
    assert.deepStrictEqual(pos.reservas, [], 'idempotente: nada criado');
    assert.strictEqual(pos.status, 'TOTALMENTE_RESERVADA', JSON.stringify(pos));
    assert.deepStrictEqual(await reservas(R1), [[6, 'ATIVA']], 'nada solto');
    const R2 = (await criar(m, 4)).id;
    assert.strictEqual((await aprovar(R2)).body.status, 'AGUARDANDO_ESTOQUE');
    assert.deepStrictEqual(await reservas(R2), []);
  });

  // ── revisao "passaria quebrado?": a releitura depois da conversao da reserva da OS (Etapa 171) tambem le o liberado ────────────
  // Sem este cenario, voltar so a 2a leitura para `disponivel` passava verde (nenhum teste convertia reserva da OS).
  await test('[RN-205.03, conversao da OS] L1 4, L2 BLOQUEADO 6, reserva da OS 3: a requisicao da OS de 10 converte os 3 e reserva 4 (nao 10)', async () => {
    const m = await l1l2();
    const rid = (await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, quantidade, quantidade_utilizada, status, origem,
        os_id, os_referencia, recebimento_id) VALUES (?, 3, 0, 'ATIVA', 'MANUAL', 20599, 'OS-205X', 20599)`, [m])).lastID;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = COALESCE(quantidade_reservada,0) + 3 WHERE id = ?', [m]);
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-205X', itens: [{ material_id: m, quantidade: 10 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await aprovar(r.body.id)).body.status, 'PARCIALMENTE_RESERVADA');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [rid])).status, 'LIBERADA',
      'premissa: a reserva da OS foi convertida');
    assert.deepStrictEqual(await reservas(r.body.id), [[4, 'ATIVA']]);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
