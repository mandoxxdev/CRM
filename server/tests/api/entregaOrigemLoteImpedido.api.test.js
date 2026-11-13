/**
 * Etapa 231 (C532; B1517) — o detalhe da requisicao diz a situacao do lote da separacao, para a tela nao pre-escolher a origem impedida e
 * apagar o botao de um clique ANTES do clique. E o caminho que a tela oferece (escolher outro endereco / automatico) passa; o um clique, que
 * a tela apaga, e recusado como sempre.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa231-entrega-origem-lote-impedido.md (RN-231.01, RN-231.09).
 * Executar: cd server && node tests/api/entregaOrigemLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 231', role: 'admin', is_superadmin: 1, email: 'a231@t.com' },
  ALMOX: { id: 23122, nome: 'Almox 231', role: 'user', email: 'x231@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 231: o detalhe diz a situacao do lote da separacao ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM231', nome: 'Almox 231' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const XB = await loc('X231-01'); const Z = await loc('Z231-02'); const P = await loc('P231-01');

  const material = async () => {
    const c = `E231-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, 0, ?)`, [c, c, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e231', localizacao_destino_id: destino, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusLote = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 231' }));
  const reqDireta = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E231-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    return { R, item };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const detalhe = async (R) => (await ok(como('ALMOX').get(`${API}/requisicoes/${R}`))).body.itens[0];
  const situacao = (i) => ({
    status: i.lote_separacao_status, impedido: i.lote_separacao_esta_impedido, vencido: i.lote_separacao_vencido_sem_liberacao,
  });

  // A montagem: L1 em XB (4, ATIVO), L2 em Z (6); requisicao de 3 separada de Z/L2; L2 bloqueado depois.
  const montar = async () => {
    const m = await material();
    await entrar(m, XB.id, 4, 'L1');
    await entrar(m, Z.id, 6, 'L2');
    const { R, item } = await reqDireta(m, 3);
    await separar(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: Z.id, lote_id: await loteId(m, 'L2') }]);
    return { m, R, item };
  };

  // ── RN-231.01 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-231.01] L2 bloqueado depois de separar -> o detalhe diz BLOQUEADO, impedido true, vencido false', async () => {
    const { m, R } = await montar();
    const antes = await detalhe(R);
    assert.deepStrictEqual(situacao(antes), { status: 'ATIVO', impedido: false, vencido: false }, 'controle: L2 ATIVO');
    await statusLote(m, 'L2', 'BLOQUEADO');
    const i = await detalhe(R);
    assert.strictEqual(i.lote_separacao_codigo, 'L2');
    assert.deepStrictEqual(situacao(i), { status: 'BLOQUEADO', impedido: true, vencido: false });
    await statusLote(m, 'L2', 'ATIVO');
    assert.deepStrictEqual(situacao(await detalhe(R)), { status: 'ATIVO', impedido: false, vencido: false }, 'liberado: volta');
  });
  await test('[RN-231.01] L2 ATIVO vencido ontem -> impedido e vencido true, a validade crua', async () => {
    const { m, R } = await montar();
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), await loteId(m, 'L2')]);
    const i = await detalhe(R);
    assert.deepStrictEqual(situacao(i), { status: 'ATIVO', impedido: true, vencido: true });
    assert.strictEqual(String(i.lote_separacao_validade).slice(0, 10), dia(-1));
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(0), await loteId(m, 'L2')]);
    assert.deepStrictEqual(situacao(await detalhe(R)), { status: 'ATIVO', impedido: false, vencido: false }, 'vence hoje: ainda sai');
  });
  await test('[RN-231.01, Fase 5] L2 REPROVADO -> impedido true; vencido ontem COM o vencimento liberado -> false (a regua da 224)', async () => {
    const { m, R } = await montar();
    await statusLote(m, 'L2', 'REPROVADO');
    assert.deepStrictEqual(situacao(await detalhe(R)), { status: 'REPROVADO', impedido: true, vencido: false });
    await statusLote(m, 'L2', 'ATIVO');
    await dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [dia(-1), await loteId(m, 'L2')]);
    assert.deepStrictEqual(situacao(await detalhe(R)), { status: 'ATIVO', impedido: false, vencido: false }, 'vencimento liberado: sai');
  });
  await test('[RN-231.01] item sem lote da separacao (separado no automatico) -> false, false, status null', async () => {
    const m = await material();
    await entrar(m, XB.id, 4, 'L1');
    const { R, item } = await reqDireta(m, 2);
    await separar(R, [{ item_id: item, quantidade_separada: 2 }]);
    const i = await detalhe(R);
    assert.strictEqual(i.lote_separacao_id ?? null, null, 'premissa: sem lote da separacao');
    assert.deepStrictEqual(situacao(i), { status: null, impedido: false, vencido: false });
    assert.strictEqual(i.lote_separacao_validade, null);
  });

  // ── RN-231.09 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-231.09] L2 bloqueado: o um clique (sem chave) e recusado e nada baixa; a troca (automatico) entrega de XB/L1 e grava a substituicao', async () => {
    const { m, R, item } = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    const r = await entregar(R, [{ item_id: item, quantidade_atendida: 3 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, m.nome + ': a origem da separação (Z231-02) não serve mais (Lote L2 esta bloqueado e nao pode ser utilizado) — entregue escolhendo de onde sai');
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_entregue q FROM itens_requisicao_almoxarifado WHERE id = ?', [item])).q), 0);
    await ok(entregar(R, [{ item_id: item, quantidade_atendida: 3, origem_automatica: true }]));
    const saidas = await dbAll(db, `SELECT l.codigo loc, lt.codigo lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_origem_id LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.tipo = 'SAIDA'`, [R]);
    assert.deepStrictEqual(saidas.map((s) => [s.lote, Number(s.q)]), [['L1', 3]]);
    const linhas = await dbAll(db, 'SELECT l.codigo loc, lt.codigo lote, s.quantidade q FROM estoque_saldo_almoxarifado s JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id JOIN lotes_almoxarifado lt ON lt.id = s.lote_id WHERE s.material_id = ? ORDER BY l.codigo', [m.id]);
    assert.deepStrictEqual(linhas.map((x) => [x.loc, x.lote, Number(x.q)]), [['X231-01', 'L1', 1], ['Z231-02', 'L2', 6]], 'saiu de XB/L1, Z/L2 intacto');
    const subs = await dbGet(db, 'SELECT COUNT(*) n FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R]);
    assert.strictEqual(subs.n, 1, 'a troca registrada');
  });
  await test('[RN-231.09] L2 bloqueado: escolher XB/L1 tambem entrega (o outro caminho que a janela oferece)', async () => {
    const { m, R, item } = await montar();
    await statusLote(m, 'L2', 'BLOQUEADO');
    await ok(entregar(R, [{ item_id: item, quantidade_atendida: 3, localizacao_origem_id: XB.id, lote_id: await loteId(m, 'L1') }]));
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_entregue q FROM itens_requisicao_almoxarifado WHERE id = ?', [item])).q), 3);
  });
  await test('[RN-231.09 controle] L2 ATIVO: o um clique entrega de Z/L2', async () => {
    const { R, item } = await montar();
    await ok(entregar(R, [{ item_id: item, quantidade_atendida: 3 }]));
    const s = await dbAll(db, `SELECT l.codigo loc FROM movimentacoes_almoxarifado mv JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_origem_id
      WHERE mv.requisicao_id = ? AND mv.tipo = 'SAIDA'`, [R]);
    assert.deepStrictEqual(s.map((x) => x.loc), ['Z231-02']);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
