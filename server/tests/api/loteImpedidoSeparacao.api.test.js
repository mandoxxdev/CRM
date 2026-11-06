/**
 * Etapa 205 (T2) — a separacao limita pelo que pode sair, e a fila e o detalhe batem com a porta (RN-205.07 o separavel, .08, .09;
 * Fase 2 I3 a frase com o que o lote CORTOU, I4 `lote_impedido` no detalhe, M1 reserva/caixa como direito).
 *
 * As quatro leituras do separavel: a porta (`PUT /requisicoes/:id/separacao`, `saldoDisponivelParaItem.disponivel_liberado`), a fila
 * (`GET /fila-separacao`) e o detalhe (`GET /requisicoes/:id`, `normalizarItem`). `disponivel` da fila, `saldo_atual` do detalhe e os
 * entregaveis ficam como hoje (B1374). Validades relativas; lotes por Entrada v2 (nao distribui).
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md (T2).
 *
 * Executar: cd server && node tests/api/loteImpedidoSeparacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { fraseLoteImpedido } = require('../../services/almoxarifado/loteImpedido');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 205s', role: 'admin', is_superadmin: 1, email: 'a205s@t.com' },
  SOL: { id: 20521, nome: 'Solic 205s', email: 's205s@t.com' },
  ALMOX: { id: 20522, nome: 'Almox 205s', role: 'user', email: 'x205s@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 205 (T2): a separacao, a fila e o detalhe descontam o lote impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM205S', nome: 'Almox 205s' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z205S-01', descricao: 'Z205S-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z205S-01'");

  const material = async () => {
    const c = `E205S-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e205s', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const status = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 205' }));
  const criar = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-205', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    return { R: r.body.id, item };
  };
  const aprovar = async (R) => (await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}))).body.status;
  const reqDireta = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E205S-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    return { R, item };
  };
  const separar = (R, item, q, extra = {}) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`,
    { itens_separados: [{ item_id: item, quantidade_separada: q, ...extra }] });
  const daFila = async (R) => {
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body;
    return fila.find((f) => Number(f.id) === Number(R)) || null;
  };
  const doDetalhe = async (R) => (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];

  // RN-205.08: L1 ATIVO 4, L2 BLOQUEADO 6, R de 5 AGUARDANDO_ESTOQUE sem reserva (aprovada com estoque 0, os lotes entraram depois)
  const montagem08 = async ({ q2 = 6, bloquear = true } = {}) => {
    const m = await material();
    const { R, item } = await criar(m, 5);
    assert.strictEqual(await aprovar(R), 'AGUARDANDO_ESTOQUE', 'premissa');
    await entrar(m, 4, 'L1');
    if (q2) { await entrar(m, q2, 'L2'); if (bloquear) await status(m, 'L2', 'BLOQUEADO'); }
    return { m, R, item };
  };

  // ── RN-205.08: a porta ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.08 a/b] separar 5 -> 400 com a literal + "Nao entram 6 un ..."; separar 4 -> 200', async () => {
    const { m, R, item } = await montagem08();
    const r = await separar(R, item, 5);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: não é possível separar 5 un. Máximo: 4 (pendente: 5, disponível: 4). `
      + 'Não entram 6 un em lote bloqueado, reprovado ou vencido.');
    assert.strictEqual(fraseLoteImpedido(6, 'un'), 'Não entram 6 un em lote bloqueado, reprovado ou vencido.');
    await ok(separar(R, item, 4));
    const it = await dbGet(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE id = ?', [item]);
    assert.strictEqual(Number(it.q), 4);
  });
  await test('[RN-205.08 b] sem lote impedido a literal e a de hoje, byte a byte (sem a 2a frase)', async () => {
    const { m, R, item } = await montagem08({ q2: 0 });
    const r = await separar(R, item, 5);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: não é possível separar 5 un. Máximo: 4 (pendente: 5, disponível: 4)`);
  });
  await test('[Fase 2 I3 a] R1 de 10 com reserva 6, L1 (10) bloqueado, pede 7 -> "Maximo: 6 ... Nao entram 4 un" (o que o lote cortou)', async () => {
    const m = await material(); await entrar(m, 6, 'L1');
    const { R, item } = await criar(m, 10);
    assert.strictEqual(await aprovar(R), 'PARCIALMENTE_RESERVADA', 'premissa: reserva 6');
    await entrar(m, 4, 'L1'); await status(m, 'L1', 'BLOQUEADO');
    const r = await separar(R, item, 7);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: não é possível separar 7 un. Máximo: 6 (pendente: 10, disponível: 6). `
      + 'Não entram 4 un em lote bloqueado, reprovado ou vencido.');
  });
  await test('[Fase 2 I3 b] pendente 3, liberado 20, impedido 6, pede 4 -> a mensagem de hoje, sem a 2a frase (o lote nao cortou o maximo)', async () => {
    const m = await material();
    const { R, item } = await criar(m, 3);
    assert.strictEqual(await aprovar(R), 'AGUARDANDO_ESTOQUE', 'premissa');
    await entrar(m, 20, 'L1'); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const r = await separar(R, item, 4);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: não é possível separar 4 un. Máximo: 3 (pendente: 3, disponível: 20)`);
  });

  // ── RN-205.09: a fila e o detalhe batem com a porta ────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.09] fila: separavel 4, etapa SEPARAR, disponivel 10; detalhe: saldo_separavel 4, quantidade_separavel 4, saldo_atual 10, lote_impedido 6', async () => {
    const { R } = await montagem08();
    const f = await daFila(R);
    assert.ok(f, 'na fila');
    assert.strictEqual(f.itens[0].separavel, 4, JSON.stringify(f.itens[0]));
    assert.ok(f.etapas.includes('SEPARAR') && !f.etapas.includes('AGUARDANDO_SALDO'), JSON.stringify(f.etapas));
    assert.strictEqual(f.itens[0].disponivel, 10, 'B1374: o disponivel da fila fica');
    const d = await doDetalhe(R);
    assert.strictEqual(d.saldo_separavel, 4, JSON.stringify(d));
    assert.strictEqual(d.quantidade_separavel, 4);
    assert.strictEqual(d.saldo_atual, 10, 'B1374: o saldo_atual do detalhe fica');
    assert.strictEqual(d.lote_impedido, 6, 'Fase 2 I4: lote_impedido no JSON do detalhe');
    const s = await requisitionService.sugestaoDeColetaDaRequisicao(db, USERS.ALMOX, R);
    assert.strictEqual(s.itens[0].separavel, 4, 'a sugestao de coleta e o recorte da fila');
  });
  await test('[RN-205.09] so L2 BLOQUEADO 6: fila separavel 0 e etapa AGUARDANDO_SALDO; detalhe separavel 0', async () => {
    const m = await material();
    const { R } = await criar(m, 5);
    assert.strictEqual(await aprovar(R), 'AGUARDANDO_ESTOQUE', 'premissa');
    await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const f = await daFila(R);
    assert.ok(f, 'na fila');
    assert.strictEqual(f.itens[0].separavel, 0);
    assert.deepStrictEqual(f.etapas, ['AGUARDANDO_SALDO']);
    const d = await doDetalhe(R);
    assert.strictEqual(d.saldo_separavel, 0); assert.strictEqual(d.quantidade_separavel, 0);
  });
  await test('[RN-205.09] sem lote impedido o detalhe traz lote_impedido 0 e o separavel de hoje', async () => {
    const { R } = await montagem08({ q2: 0 });
    const d = await doDetalhe(R);
    assert.strictEqual(d.lote_impedido, 0); assert.strictEqual(d.saldo_separavel, 4);
  });

  // ── RN-205.07: o separavel da reserva que ja existe ────────────────────────────────────────────────────────────────────────────
  await test('[RN-205.07] L1 10, R1 de 6 reservada, L1 -> BLOQUEADO: separavel 6 na fila, no detalhe e na porta (a parte propria)', async () => {
    const m = await material(); await entrar(m, 10, 'L1');
    const { R, item } = await criar(m, 6);
    assert.strictEqual(await aprovar(R), 'TOTALMENTE_RESERVADA', 'premissa');
    await status(m, 'L1', 'BLOQUEADO');
    assert.strictEqual((await daFila(R)).itens[0].separavel, 6);
    const d = await doDetalhe(R);
    assert.strictEqual(d.saldo_separavel, 6); assert.strictEqual(d.quantidade_separavel, 6);
    await ok(separar(R, item, 6));
  });

  // ── Fase 2 M1: a reserva e a caixa contam como direito sobre o que pode sair ───────────────────────────────────────────────────
  await test('[Fase 2 M1] L1 ATIVO 4, L2 ATIVO 6; outra separou 6 de L2 sem reserva; L2 -> BLOQUEADO: R separa 0 (hoje 4), fila e detalhe 0', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    const outra = await reqDireta(m, 6);
    await ok(separar(outra.R, outra.item, 6, { localizacao_origem_id: P01.id, lote_id: await loteId(m, 'L2') }));
    await status(m, 'L2', 'BLOQUEADO');
    const { R, item } = await reqDireta(m, 4);
    const r = await separar(R, item, 1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes('Máximo: 0 '), r.body.error);
    assert.strictEqual((await daFila(R)).itens[0].separavel, 0);
    assert.strictEqual((await doDetalhe(R)).saldo_separavel, 0);
  });

  // ── o tempo da fila com 200 itens (o fragmento roda por linha) ─────────────────────────────────────────────────────────────────
  await test('[ponto de atencao] fila com 200 itens de material com lote impedido responde em menos de 5 s', async () => {
    const m = await material(); await entrar(m, 300, 'L1'); await entrar(m, 50, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    for (let i = 0; i < 200; i += 1) await reqDireta(m, 1); // eslint-disable-line no-await-in-loop
    const t0 = Date.now();
    const fila = await requisitionService.listarFilaSeparacao(db, USERS.ALMOX);
    const ms = Date.now() - t0;
    console.log(`    (fila com ${fila.length} requisicoes: ${ms} ms)`);
    assert.ok(ms < 5000, `${ms} ms`);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
