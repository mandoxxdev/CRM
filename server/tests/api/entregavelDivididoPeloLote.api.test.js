/**
 * Etapa 251 (C489; C491, C518) — o entregável do detalhe e da Fila quando os itens dividem o mesmo lote e quando o lote da separação deixou
 * de servir. O teto da B1395 era o de cada item SOZINHO (dois irmãos no mesmo lote bom mostravam o máximo cada um) e somava a parte guardada
 * sem olhar o lote dela (lote impedido depois da separação: o detalhe oferecia o que a entrega recusava). E a caixa separada de um lote que
 * ganhou peça presa ia para o um clique, que a entrega recusa ("não serve mais").
 *
 * Cobre: RN-251.01 (os campos do teto no detalhe), .04 (a guarda própria não divide), .05 (a Fila divide na ordem do pedido), .06 (sem lote
 * impedido nada muda), .10 (lote da separação impedido: a parte não conta), .11 (peça presa que não cobre: o campo do detalhe), .13 (cobre:
 * nada muda). Em cada cenário o número mostrado é ENTREGUE pela porta real (a prova de que bate) e o número de antes é recusado.
 * Plano: docs/superpowers/plans/2026-11-19-almoxarifado-etapa251-entregavel-dividido-e-lote-da-separacao.md
 *
 * Executar: cd server && node tests/api/entregavelDivididoPeloLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const returnService = require('../../services/almoxarifado/returnService');
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 251', role: 'admin', is_superadmin: 1, email: 'a251@t.com' },
  ALMOX: { id: 25122, nome: 'Almox 251', role: 'user', email: 'x251@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const ADMIN = USERS.ADMIN;
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 251: o entregavel dividido pelo lote (C489) e o lote da separacao que deixou de servir (C491, C518) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || ADMIN) }); next(); });
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM251', nome: 'Almox 251' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z251A-01'); const B01 = await loc('Z251B-01'); const P01 = await loc('Z251P-01');

  const material = async ({ lote = 1, serie = 0 } = {}) => {
    const c = `E251-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, ?, ?)`, [c, c, lote, serie, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e251', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const vencer = async (m, codigo) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?', [dia(-1), await loteId(m, codigo)]);
  const statusLote = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 251' }));
  const reqDireta = async (m, ...qs) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E251-${++seq}`])).lastID;
    const ids = [];
    for (const q of qs) { // eslint-disable-line no-restricted-syntax
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID);
    }
    return { R, ids };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const detalhe = async (R) => (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens;
  const fila = async (R) => {
    const f = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((x) => Number(x.id) === Number(R));
    assert.ok(f, `a requisicao ${R} na fila`);
    return f;
  };
  const livro = async (R, m) => (await dbAll(db, `SELECT lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [R, m.id]))
    .map((x) => `${x.lote || '-'}:${Number(x.q)}`);
  // quarentena de q pecas do lote (sai e volta para Quarentena citando a saida — o BLOQUEIO herda o lote, Etapa 209)
  const quarentena = async (m, q, codigo, local) => {
    await ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q, motivo: 'e251',
      justificativa: 'teste 251', localizacao_origem_id: local, lote_id: await loteId(m, codigo) }), 201);
    const s = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC", [m.id]);
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: q, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: s.id, localizacao_id: local });
  };
  const remessa = async (m, codigo, q) => {
    const r = await thirdPartyService.criarRemessa(db, ADMIN, { fornecedor_nome: 'Galvanizadora 251', tipo_servico: 'Galvanizacao',
      itens: [{ material_id: m.id, quantidade: q, lote_id: await loteId(m, codigo) }] });
    await thirdPartyService.enviarRemessa(db, ADMIN, r.id);
  };
  const campos = (d) => d.map((x) => [x.quantidade_entregavel, x.saldo_entregavel_lote, x.saldo_entregavel_lote_proprio]);

  // ── Item 20 (C489) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-251.01, RN-251.05] L1 5 vencido, L2 3; dois itens de 3 sem origem: detalhe com o teto de cada um sozinho (3, proprio 0), Fila 3 e 0 — e a porta aceita os 3 do primeiro e recusa 3 + 3', async () => {
    const m = await material();
    await entrar(m, P01.id, 5, 'L1'); await entrar(m, B01.id, 3, 'L2');
    const { R, ids } = await reqDireta(m, 3, 3);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }, { item_id: ids[1], quantidade_separada: 3 }]);
    await vencer(m, 'L1');
    assert.deepStrictEqual(campos(await detalhe(R)), [[3, 3, 0], [3, 3, 0]]);
    const f = await fila(R);
    assert.deepStrictEqual(f.itens.map((x) => x.entregavel), [3, 0], JSON.stringify(f.itens));
    assert.ok(f.etapas.includes('ENTREGAR'), JSON.stringify(f.etapas));
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }, { item_id: ids[1], quantidade_atendida: 3 }]);
    assert.strictEqual(r.status, 400, 'o numero de antes (3 + 3) a porta recusa');
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await livro(R, m), ['L2:3']);
  });

  await test('[RN-251.04, RN-251.05] a guarda propria nao divide: item 1 guardado 2 em (B, L2), itens 2 e 3 de 2 sem origem, L2 4, L1 bloqueado -> Fila 2, 2, 0; a porta aceita 2 + 2 + 0', async () => {
    const m = await material();
    await entrar(m, P01.id, 5, 'L1'); await entrar(m, B01.id, 4, 'L2');
    const { R, ids } = await reqDireta(m, 2, 2, 2);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L2') }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2 }, { item_id: ids[2], quantidade_separada: 2 }]);
    await statusLote(m, 'L1', 'BLOQUEADO');
    assert.deepStrictEqual(campos(await detalhe(R)), [[2, 4, 2], [2, 2, 0], [2, 2, 0]]);
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [2, 2, 0]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 2 }]));
    assert.deepStrictEqual((await livro(R, m)).sort(), ['L2:2', 'L2:2']);
  });

  await test('[RN-251.06] sem lote impedido nada muda: L2 6, dois itens de 3 -> campos ausentes e Fila 3 e 3 (e a porta aceita 3 + 3)', async () => {
    const m = await material();
    await entrar(m, B01.id, 6, 'L2');
    const { R, ids } = await reqDireta(m, 3, 3);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }, { item_id: ids[1], quantidade_separada: 3 }]);
    const d = await detalhe(R);
    assert.deepStrictEqual(campos(d), [[3, undefined, undefined], [3, undefined, undefined]]);
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [3, 3]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }, { item_id: ids[1], quantidade_atendida: 3 }]));
  });

  await test('[RN-251.05] dividirTetoDoLote: so divide os itens com teto, por material, na ordem; a parte propria nao tira do automatico', async () => {
    const d = requisitionService.dividirTetoDoLote([
      { id: 1, material_id: 7, entregavel: 3, teto: 3, proprio: 0 },
      { id: 2, material_id: 8, entregavel: 3, teto: 3, proprio: 0 },
      { id: 3, material_id: 7, entregavel: 3, teto: 3, proprio: 0 },
      { id: 4, material_id: 7, entregavel: 5, teto: null, proprio: null },
      { id: 5, material_id: 9, entregavel: 2, teto: 4, proprio: 2 },
      { id: 6, material_id: 9, entregavel: 2, teto: 2, proprio: 0 },
    ]);
    assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((i) => d.get(i)), [3, 3, 0, 5, 2, 2]);
  });

  // ── Item 21 (C491, C518) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-251.10] C491: R1 guardou 3 em (A, L1), R2 guardou 2 em (B, L2), L1 bloqueado -> detalhe e Fila de R1 0 (antes 2; a porta recusa o automatico); L1 de volta -> 3 e o um clique entrega', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, B01.id, 2, 'L2');
    const r1 = await reqDireta(m, 3); const r2 = await reqDireta(m, 2);
    await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: await loteId(m, 'L1') }]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L2') }]);
    await statusLote(m, 'L1', 'BLOQUEADO');
    assert.deepStrictEqual(campos(await detalhe(r1.R)), [[0, 0, 0]]);
    const f = await fila(r1.R);
    assert.deepStrictEqual(f.itens.map((x) => x.entregavel), [0]);
    assert.ok(!f.etapas.includes('ENTREGAR'), JSON.stringify(f.etapas));
    const r = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 1, origem_automatica: true }]);
    assert.strictEqual(r.status, 400, 'o automatico nao tem de onde tirar (o numero de antes era 2)');
    await statusLote(m, 'L1', 'ATIVO');
    assert.deepStrictEqual((await detalhe(r1.R)).map((x) => x.quantidade_entregavel), [3]);
    await ok(entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await livro(r1.R, m), ['L1:3']);
  });

  await test('[RN-251.10] C491 com livre fora da guarda: L1 bloqueado com a guarda de 3, L2 1 livre -> o entregavel e 1 (o automatico) e a porta entrega 1 pelo automatico', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, B01.id, 1, 'L2');
    const { R, ids } = await reqDireta(m, 3);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: await loteId(m, 'L1') }]);
    await statusLote(m, 'L1', 'BLOQUEADO');
    const d = await detalhe(R);
    assert.deepStrictEqual(campos(d), [[1, 1, 0]]);
    assert.strictEqual(d[0].lote_separacao_esta_impedido, true);
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [1]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, origem_automatica: true }]));
    assert.deepStrictEqual(await livro(R, m), ['L2:1']);
  });

  // C518: L1 5 em B (1 em quarentena), L2 5 na padrao; item de 3 separado de (B, L1); depois 2 de L1 a terceiro -> do L1 so 2 podem sair
  const montarC518 = async ({ impedidoNoMaterial = false } = {}) => {
    const m = await material();
    await entrar(m, B01.id, 5, 'L1'); await entrar(m, P01.id, 5, 'L2');
    if (impedidoNoMaterial) { await entrar(m, A01.id, 2, 'L3'); await vencer(m, 'L3'); }
    await quarentena(m, 1, 'L1', B01.id);
    const { R, ids } = await reqDireta(m, 3);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    return { m, R, ids };
  };
  await test('[RN-251.11, RN-251.13] C518: antes da remessa o lote cobre (nao_cobre false); depois, nao_cobre true e pode_sair 2; o numero continua 3 e a porta entrega os 3 pelo automatico', async () => {
    const { m, R, ids } = await montarC518();
    let d = await detalhe(R);
    assert.strictEqual(d[0].lote_separacao_nao_cobre, false, JSON.stringify(d[0]));
    assert.strictEqual(d[0].lote_separacao_pode_sair, undefined);
    await remessa(m, 'L1', 2);
    d = await detalhe(R);
    assert.deepStrictEqual([d[0].lote_separacao_nao_cobre, d[0].lote_separacao_pode_sair, d[0].quantidade_entregavel], [true, 2, 3]);
    assert.strictEqual(d[0].saldo_entregavel_lote, undefined, 'sem lote impedido no material, sem o teto');
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [3]);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.strictEqual(r.status, 400, 'o um clique recusa (B1446)');
    assert.ok(r.body.error.includes('não serve mais'), r.body.error);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 3, origem_automatica: true }]));
    assert.strictEqual((await livro(R, m)).length > 0, true);
  });

  await test('[RN-251.11] C518 com lote impedido no material: o teto e o do automatico (proprio 0) e a porta entrega exatamente ele pelo automatico', async () => {
    const { m, R, ids } = await montarC518({ impedidoNoMaterial: true });
    await remessa(m, 'L1', 2);
    const d = await detalhe(R);
    assert.deepStrictEqual([d[0].lote_separacao_nao_cobre, d[0].lote_separacao_pode_sair], [true, 2]);
    assert.strictEqual(d[0].saldo_entregavel_lote_proprio, 0, JSON.stringify(d[0]));
    const n = d[0].quantidade_entregavel;
    assert.ok(n > 0, `entregavel ${n}`);
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [n]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: n, origem_automatica: true }]));
  });

  await test('[RN-251.11] a guarda do irmao desta requisicao no mesmo lote conta (a regua da entrega): dois itens de 2 guardados em (B, L1), 1 de L1 a terceiro -> os dois nao_cobre (pode sair 1) e o um clique do primeiro recusa', async () => {
    const m = await material();
    await entrar(m, B01.id, 5, 'L1'); await entrar(m, P01.id, 5, 'L2');
    await quarentena(m, 1, 'L1', B01.id);
    const { R, ids } = await reqDireta(m, 2, 2);
    const L1 = await loteId(m, 'L1');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.deepStrictEqual((await detalhe(R)).map((x) => x.lote_separacao_nao_cobre), [false, false]);
    await remessa(m, 'L1', 1);
    const d = await detalhe(R);
    assert.deepStrictEqual(d.map((x) => [x.lote_separacao_nao_cobre, x.lote_separacao_pode_sair]), [[true, 1], [true, 1]]);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes('não serve mais'), r.body.error);
  });

  await test('[RN-251.14, Fase 5] C518 com lote impedido e nada fora do L1 que cubra: o teto e o que a origem deixa sair (2), sem apagar o um clique — e o um clique de 2 entrega (antes da correcao: janela no automatico com 2, recusado)', async () => {
    const m = await material();
    await entrar(m, B01.id, 5, 'L1'); await entrar(m, A01.id, 2, 'L3'); await vencer(m, 'L3');
    await quarentena(m, 1, 'L1', B01.id);
    const { R, ids } = await reqDireta(m, 3);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await remessa(m, 'L1', 2);
    const d = await detalhe(R);
    assert.deepStrictEqual([d[0].quantidade_entregavel, d[0].saldo_entregavel_lote, d[0].saldo_entregavel_lote_proprio,
      d[0].lote_separacao_nao_cobre], [2, 2, 2, false], JSON.stringify(d[0]));
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [2]);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, origem_automatica: true }]);
    assert.strictEqual(r.status, 400, 'o automatico de 2 a porta recusa (a guarda que fica no L1)');
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await livro(R, m), ['L1:2']);
  });

  await test('[RN-251.14, Fase 5] o automatico com a guarda solta (3) nao cobre a caixa (4): vale o que cabe com a guarda inteira (1), menor que a origem (2) -> teto 2 pelo um clique; o automatico de 3 a porta recusa', async () => {
    const m = await material();
    await entrar(m, B01.id, 6, 'L1'); await entrar(m, P01.id, 1, 'L2'); await entrar(m, A01.id, 2, 'L3'); await vencer(m, 'L3');
    await quarentena(m, 1, 'L1', B01.id);
    const { R, ids } = await reqDireta(m, 4);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') }]);
    await remessa(m, 'L1', 3);
    const d = await detalhe(R);
    assert.deepStrictEqual([d[0].quantidade_entregavel, d[0].saldo_entregavel_lote, d[0].lote_separacao_nao_cobre], [2, 2, false],
      JSON.stringify(d[0]));
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3, origem_automatica: true }]);
    assert.strictEqual(r.status, 400, 'o automatico de 3 (o teto sem a guarda que fica) a porta recusa');
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await livro(R, m), ['L1:2']);
  });

  await test('[RN-251.14, Fase 5] com irmao guardado em outro lote (S6): X (L1 nao cobre) 2 e Y 2 pelo um clique -> 200', async () => {
    const m = await material();
    await entrar(m, B01.id, 5, 'L1'); await entrar(m, P01.id, 2, 'L2'); await entrar(m, A01.id, 2, 'L3'); await vencer(m, 'L3');
    await quarentena(m, 1, 'L1', B01.id);
    const { R, ids } = await reqDireta(m, 3, 2);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L1') },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: P01.id, lote_id: await loteId(m, 'L2') }]);
    await remessa(m, 'L1', 2);
    const d = await detalhe(R);
    assert.deepStrictEqual(d.map((x) => [x.quantidade_entregavel, x.lote_separacao_nao_cobre]), [[2, false], [2, false]], JSON.stringify(d));
    assert.deepStrictEqual((await fila(R)).itens.map((x) => x.entregavel), [2, 2]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 2 }]));
    assert.deepStrictEqual((await livro(R, m)).sort(), ['L1:2', 'L2:2']);
  });

  await test('[RN-251.13] caixa sem origem guardada e material sem lote: lote_separacao_nao_cobre false', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, B01.id, 3);
    const { R, ids } = await reqDireta(m, 2);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }]);
    const d = await detalhe(R);
    assert.strictEqual(d[0].lote_separacao_nao_cobre, false);
    assert.strictEqual(d[0].quantidade_entregavel, 2);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
