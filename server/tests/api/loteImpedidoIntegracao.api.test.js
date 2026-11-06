/**
 * Etapa 205 (T3) — integracao: o lote impedido do comeco ao fim, pela ROTA e pelo SERVICO, com os mesmos numeros; e a entrega
 * inalterada (RN-205.10, fixada de proposito para o item 7 encontra-la vermelha).
 *
 * Fluxo: Entrada v2 em L1 (4) e L2 (6) -> L2 BLOQUEADO -> requisicao de 10 -> aprovar (reserva 4, PARCIALMENTE_RESERVADA) -> fila
 * (separavel 4) -> detalhe (quantidade_separavel 4) -> separar 5 (400, a literal com "Nao entram 6 un") -> separar 4 (200) -> entregar 4
 * (200, sai de L1 pelo automatico da 197) -> L2 volta a ATIVO -> R2 de 6 reserva 6.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md (T3).
 *
 * Executar: cd server && node tests/api/loteImpedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 205i', role: 'admin', is_superadmin: 1, email: 'a205i@t.com' },
  SOL: { id: 20531, nome: 'Solic 205i', email: 's205i@t.com' },
  ALMOX: { id: 20532, nome: 'Almox 205i', role: 'user', email: 'x205i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const MSG_5 = (nome) => `${nome}: não é possível separar 5 un. Máximo: 4 (pendente: 10, disponível: 4). `
  + 'Não entram 6 un em lote bloqueado, reprovado ou vencido.';

(async () => {
  console.log('\n=== Etapa 205 (T3): integracao pela rota e pelo servico ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM205I', nome: 'Almox 205i' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z205I-01', descricao: 'Z205I-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z205I-01'");

  const material = async () => {
    const c = `E205I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e205i', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 205' }));
  const criar = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-205', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    return { R: r.body.id, item };
  };
  const st = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade, quantidade_utilizada u, status FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? ORDER BY id`, [R])).map((x) => [Number(x.quantidade), x.status]);
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.lote || null, Number(x.q)]);
  const linhas = async (m) => (await dbAll(db, `SELECT lt.codigo as lote, SUM(s.quantidade) q FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id WHERE s.material_id = ? GROUP BY lt.codigo ORDER BY lt.codigo`, [m.id]))
    .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.lote || '-'}=${Number(x.q)}`);
  // Fase 5 (P3): a regua da divergencia da ultima rodada — quem separou tudo o que o LIBERADO deixa nao e divergente.
  const ultimaRodada = async (R, item) => {
    const r = await dbGet(db, "SELECT itens_json FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id DESC LIMIT 1", [R]);
    const x = JSON.parse(r.itens_json).find((i) => Number(i.item_id) === Number(item));
    return { maximo: x.maximo, divergente: x.divergente };
  };
  const montar = async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };

  // ── pela ROTA ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 rota] Entrada -> bloquear L2 -> requisicao 10 -> aprovar 4 -> fila 4 -> detalhe 4 -> separar 5 (400) / 4 -> entregar 4 de L1 -> L2 ATIVO -> R2 reserva 6', async () => {
    const m = await montar();
    await statusRota(m, 'L2', 'BLOQUEADO');
    const { R, item } = await criar(m, 10);
    const ap = await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}));
    assert.strictEqual(ap.body.status, 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(R), [[4, 'ATIVA']]);
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((f) => Number(f.id) === Number(R));
    assert.strictEqual(fila.itens[0].separavel, 4, JSON.stringify(fila.itens[0]));
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.quantidade_separavel, 4); assert.strictEqual(det.lote_impedido, 6);
    const r5 = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 5 }] });
    assert.strictEqual(r5.status, 400, JSON.stringify(r5.body));
    assert.strictEqual(r5.body.error, MSG_5(m.nome));
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 4 }] }));
    assert.deepStrictEqual(await ultimaRodada(R, item), { maximo: 4, divergente: false }, 'a regua e o liberado (4), nao o disponivel (10)');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 4 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 4]], 'saiu de L1 (o automatico da 197 nao toca L2)');
    assert.deepStrictEqual(await linhas(m), ['L2=6']);
    await statusRota(m, 'L2', 'ATIVO');
    const r2 = await criar(m, 6);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${r2.R}/aprovar`, {}))).body.status, 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(r2.R), [[6, 'ATIVA']]);
  });

  // ── pelo SERVICO ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T3 servico] o mesmo fluxo por prepararPosAprovacao (na trava), listarFilaSeparacao, separarRequisicao e entregarRequisicao — mesmos numeros', async () => {
    const m = await montar();
    await lotService.mudarStatusLote(db, USERS.ADMIN, await loteId(m, 'L2'), 'BLOQUEADO', 'teste 205');
    const { R, item } = await criar(m, 10);
    const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    const pos = await requisitionService.comTravaDaRequisicao(db, R, async () => {
      const p = await requisitionService.prepararPosAprovacao(db, R, USERS.ADMIN, reqRow);
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = ?, aprovador_id = 1 WHERE id = ? AND status = 'PENDENTE'", [p.status, R]);
      return p;
    });
    assert.strictEqual(pos.status, 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(pos.reservas.map((x) => x.quantidade), [4]);
    const [f] = await requisitionService.listarFilaSeparacao(db, USERS.ALMOX, { requisicaoId: R });
    assert.strictEqual(f.itens[0].separavel, 4);
    await assert.rejects(requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 5 }], USERS.ALMOX),
      (e) => e.status === 400 && e.message === MSG_5(m.nome));
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 4 }], USERS.ALMOX);
    assert.deepStrictEqual(await ultimaRodada(R, item), { maximo: 4, divergente: false });
    await requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 4 }], USERS.ALMOX, null);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 4]]);
    assert.deepStrictEqual(await linhas(m), ['L2=6']);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
  });

  // ── RN-205.10: a entrega nao muda (fixada para o item 7) ───────────────────────────────────────────────────────────────────────
  await test('[RN-205.10] R1 reserva 6, L1 (10) bloqueado depois: separa 6 (a propria), o entregavel do detalhe e o de hoje e a entrega de 6 sai SEM lote (L1 10, sem lote -6)', async () => {
    const m = await material(); await entrar(m, 10, 'L1');
    const { R, item } = await criar(m, 6);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}))).body.status, 'TOTALMENTE_RESERVADA');
    await statusRota(m, 'L1', 'BLOQUEADO');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 6 }] }));
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    // o entregavel com o teto de hoje: o mesmo item com lote_impedido 0 pela mesma normalizarItem
    const cru = await dbGet(db, `SELECT ir.*, 0 as caixa_sem_reserva_outros, 0 as motor_permite_negativo, 1 as material_ativo,
        0 as material_critico, ? as saldo_atual, 6 as quantidade_reservada_item FROM itens_requisicao_almoxarifado ir WHERE ir.id = ?`,
    [det.saldo_atual, item]);
    const hoje = requisitionService.normalizarItem({ ...cru, lote_impedido: 0 });
    assert.strictEqual(det.quantidade_entregavel, hoje.quantidade_entregavel, JSON.stringify(det));
    assert.strictEqual(det.saldo_entregavel, hoje.saldo_entregavel);
    assert.strictEqual(det.quantidade_entregavel, 6, 'premissa do item 7: o detalhe promete entregar 6');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 6 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 6]], 'a parte que nenhum lote elegivel cobre sai sem lote (B1323)');
    assert.deepStrictEqual(await linhas(m), ['-=-6', 'L1=10'], '"Sem lote atribuido" -6 — o defeito que o item 7 conserta');
  });

  // A segunda rodada e o unico lugar em que o `teto` do normalizarItem limita a entrega (maxEntregar e saldo_entregavel): trocar o teto
  // inteiro pelo separavel (com o lote impedido) mudaria a entrega — o ponto de atencao do plano. Revisao "passaria quebrado?": sem
  // este cenario a sabotagem passava verde.
  await test('[RN-205.10, segunda rodada] R1 de 10 com reserva 6, L1 10 bloqueado, separa 6, entrega 2: o detalhe promete 8 (caixa 4 + teto 4, o de hoje) e a entrega de 8 sai sem lote', async () => {
    const m = await material(); await entrar(m, 6, 'L1');
    const { R, item } = await criar(m, 10);
    assert.strictEqual((await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}))).body.status, 'PARCIALMENTE_RESERVADA');
    await entrar(m, 4, 'L1'); await statusRota(m, 'L1', 'BLOQUEADO');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 6 }] }));
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 2 }] }));
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.saldo_entregavel, 8, JSON.stringify(det));
    assert.strictEqual(det.quantidade_entregavel, 8);
    assert.strictEqual(det.saldo_separavel, 0, 'o separavel desconta o lote impedido (a parte propria esta na caixa)');
    await ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 8 }] }));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 2], ['SAIDA', null, 4], ['SAIDA', null, 4]]);
    assert.deepStrictEqual(await linhas(m), ['-=-10', 'L1=10']);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
