/**
 * Etapa 127 (T4, RN-19) — integracao: o que a fila diz e o que a porta aceita, entrando pela ROTA e pelo SERVICO.
 *
 * Para os tres estados da sonda da Fase 0 (C1 sem reserva, C2 reservados 4+4, C3 reserva parcial + livre), na ordem do pedido:
 *  - `GET /fila-separacao` e `listarFilaSeparacao` chamado direto dizem o MESMO `separavel` por item;
 *  - o detalhe (`saldo_separavel`, `saldo_separavel_reserva`) reproduz essa divisao pela conta de `dividirSeparavel` (a que o
 *    modal faz);
 *  - a porta (`PUT /separacao`, a da tela) aceita exatamente esses numeros, e um centesimo a mais num item com pendente recusa.
 *
 * Executar: cd server && node tests/api/separavelDivididoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 127i', role: 'admin', is_superadmin: 1, email: 'a127i@t.com' },
  S: { id: 12711, nome: 'Solic 127i', role: 'user', email: 's127i@t.com' },
  ALMOX: { id: 12712, nome: 'Almox 127i', role: 'user', email: 'x127i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 127 (T4): a fila, o detalhe e a porta dizem o mesmo numero ===\n');
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
  const material = async (fisico) => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual,
      quantidade_minima, ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0, 0.1)`, [`E127I-${++seq}`, `E127I-${seq}`, fisico])).lastID;
  const montar = async ({ fisico, entrada }) => {
    const m = await material(fisico);
    const cr = await como('S').post('/api/requisicoes-material', { setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-127i',
      itens: [{ material_id: m, quantidade: 4 }, { material_id: m, quantidade: 4 }] });
    assert.ok(cr.body.id, JSON.stringify(cr.body));
    const R = cr.body.id;
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    if (entrada) {
      const en = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: entrada, motivo: 'e127i' });
      assert.strictEqual(en.status, 201, JSON.stringify(en.body));
    }
    nomeDe[R] = `E127I-${seq}`;
    return { R, ids };
  };
  const nomeDe = {};
  const pelaRota = async (R, ids) => {
    const l = (await como('ALMOX').get(`${API}/fila-separacao`)).body.find((x) => Number(x.id) === Number(R));
    return ids.map((id) => (l.itens.find((i) => i.item_id === id) || { separavel: 0 }).separavel);
  };
  const peloServico = async (R, ids) => {
    const l = (await requisitionService.listarFilaSeparacao(db, { ...USERS.ALMOX })).find((x) => Number(x.id) === Number(R));
    return ids.map((id) => (l.itens.find((i) => i.item_id === id) || { separavel: 0 }).separavel);
  };
  const doDetalhe = async (R, ids) => {
    const d = (await como('ALMOX').get(`${API}/requisicoes/${R}`)).body;
    const itens = ids.map((id) => d.itens.find((i) => i.id === id));
    const m = requisitionService.dividirSeparavel(itens.map((i) => ({ id: i.id, material_id: i.material_id,
      pendente: Number(i.quantidade_solicitada) - Number(i.quantidade_separada || 0), teto: i.saldo_separavel, propria: i.saldo_separavel_reserva })));
    return ids.map((id) => m.get(id));
  };
  const porta = (R, pares) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, {
    itens_separados: pares.filter(([, q]) => q > 0).map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });

  const casos = [
    { nome: 'C1 sem reserva, +4 livres', fisico: 0, entrada: 4, esperado: [4, 0] },
    { nome: 'C2 reservados 4+4', fisico: 8, entrada: 0, esperado: [4, 4] },
    { nome: 'C3 reserva 4 no primeiro, +2 livres', fisico: 4, entrada: 2, esperado: [4, 2] },
  ];
  for (const c of casos) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[127 RN-19] ${c.nome}: rota = servico = detalhe = ${JSON.stringify(c.esperado)}; a porta aceita isso e recusa um centesimo a mais`, async () => {
      const { R, ids } = await montar(c);
      const rota = await pelaRota(R, ids);
      assert.deepStrictEqual(rota, c.esperado, 'a fila pela rota');
      assert.deepStrictEqual(await peloServico(R, ids), rota, 'a fila pelo servico');
      assert.deepStrictEqual(await doDetalhe(R, ids), rota, 'o detalhe pela conta do modal');
      // um centesimo a mais no ultimo item com pendente: recusa (nada gravado), e o numero exato passa
      const mais = rota.map((q, i) => (i === rota.length - 1 ? q + 0.01 : q));
      const r1 = await porta(R, ids.map((id, i) => [id, mais[i]]));
      assert.strictEqual(r1.status, 400, `um centesimo a mais: ${r1.status} ${JSON.stringify(r1.body)}`);
      const s = rota[rota.length - 1];
      assert.strictEqual(r1.body.error, `${nomeDe[R]}: não é possível separar ${Math.round((s + 0.01) * 1e6) / 1e6} PC. Máximo: ${s} (pendente: 4, disponível: ${s})`);
      const r2 = await porta(R, ids.map((id, i) => [id, rota[i]]));
      assert.strictEqual(r2.status, 200, `o numero da fila: ${JSON.stringify(r2.body)}`);
      const gravado = (await dbAll(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R]))
        .map((x) => Number(x.q || 0));
      assert.deepStrictEqual(gravado, c.esperado);
    });
  }

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
