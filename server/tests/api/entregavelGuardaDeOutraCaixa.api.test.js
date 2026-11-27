/**
 * Etapa 274 (D (273) 2) — o entregavel do detalhe e da Fila mostra o que a entrega aceita no caso da E2 da 273 (a guarda de outra caixa).
 *
 * Antes: L1 3 em A01 (guardadas pela R1) e 1 em B01 bloqueada; R2 de 1 separada sem origem -> o detalhe (`quantidade_entregavel`) e a Fila
 * (`entregavel`) da R2 diziam 1 e a entrega recusava com a E2 ("... nada sai deste material"). O teto da conferencia (`tetoDaEntregaPeloLote`)
 * so era calculado com saldo em lote impedido. Agora: o mesmo gatilho da E2 (`outrasCaixasNoMaterial`, o item entregando sozinho) abre o teto.
 *
 * Cobre: RN-274.01 (0 no detalhe e na Fila), .02 (o que cabe: 1), .03 (sem o gatilho, o numero de antes), .04 (a guarda da propria), e o
 * cruzamento detalhe -> porta (o numero mostrado passa; um a mais recusa).
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa274-entregavel-do-detalhe-e-nao-conformidade.md
 * Executar: cd server && node tests/api/entregavelGuardaDeOutraCaixa.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 274', role: 'admin', is_superadmin: 1, email: 'a274@t.com' },
  S: { id: 27421, nome: 'Solic 274', role: 'user', email: 's274@t.com' },
  ALMOX: { id: 27422, nome: 'Almox 274', role: 'user', email: 'x274@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const tela = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Espioes (RN-206.10 b): a alcada de valor e a notificacao, pelo objeto do modulo — a entrega chama `valueApprovalService.verificarBloqueioLiberacao`.
const alcadas = [];
const verificarOriginal = valueApprovalService.verificarBloqueioLiberacao;
valueApprovalService.verificarBloqueioLiberacao = async (db, id) => { alcadas.push(Number(id)); return verificarOriginal(db, id); };
const notificados = [];
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };

(async () => {
  console.log('\n=== Etapa 274: o entregavel do detalhe e da Fila com a guarda de outra caixa (D (273) 2) ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM274', nome: 'Almox 274' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z274A-01'); const B01 = await loc('Z274B-01'); const P01 = await loc('Z274P-01');

  const material = async ({ lote = true, negativo = false } = {}) => {
    const c = `E274-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote ? 1 : 0, negativo ? 1 : 0, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e273', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 273' }));
  // requisicao gravada direto (APROVADO, sem reserva) — para varios itens do mesmo material
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E274-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
        WHERE s.material_id = ? ORDER BY l.codigo, lt.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return { linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc}/${x.lote || '-'}=${Number(x.q)}`), fisico: Number(fis.q) };
  };
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, l.codigo as loc, lt.codigo as lote, mv.quantidade q
      FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = COALESCE(mv.localizacao_origem_id, mv.localizacao_destino_id)
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.loc || null, x.lote || null, Number(x.q)]);
  const negativas = async (m) => (await dbAll(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade < -1e-9',
    [m.id])).length;
  // "nada baixado": livro, retrato, entregue, status e substituicoes
  const foto = async (R, m) => ({
    livro: await livro(R, m),
    retrato: await retrato(m),
    entregue: (await dbAll(db, 'SELECT COALESCE(quantidade_entregue, 0) q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]))
      .map((x) => Number(x.q)),
    status: (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status,
    subs: (await dbGet(db, 'SELECT COUNT(*) n FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R])).n,
  });
  const recusa = async (R, m, linhas, esperado) => {
    const antes = await foto(R, m);
    const r = await entregar(R, linhas);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    const depois = await foto(R, m);
    assert.deepStrictEqual(depois, antes, 'nada baixado');
    assert.deepStrictEqual(depois.livro, [], 'livro vazio');
    return r;
  };
  // E2 (contrato congelado no plano)
  const E2 = (mat, n, f, lotes, reqs, nada) => `${mat}: não é possível entregar ${n} un — faltam ${f} un em lote que pode sair. O resto `
    + `${lotes.length > 1 ? 'dos lotes' : 'do lote'} ${lotes.join(', ')} está separado ${reqs.length > 1 ? 'nas caixas de' : 'na caixa de'} `
    + `${reqs.join(', ')} ou em prateleira bloqueada ou sem endereço. Desbloqueie a prateleira ou transfira as peças para uma prateleira `
    + `livre, ou ${nada ? 'nada sai deste material' : `entregue ${f} un a menos`}.`;
  const numero = async (R) => (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
  const bloquearLoc = (L, v) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = ? WHERE id = ?', [v, L.id]);
  // L1 3 em A01 (a R1 guarda as 3) e 1 em B01; R2 (q) separada sem origem
  const montar = async ({ q = 1, l2 = 0 } = {}) => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1');
    await entrar(m, B01.id, 1, 'L1');
    if (l2) await entrar(m, P01.id, l2, 'L2');
    const l1 = await loteId(m, 'L1');
    const a = await reqDireta([[m.id, 3]]);
    await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    const b = await reqDireta([[m.id, q]]);
    await separar(b.R, [{ item_id: b.ids[0], quantidade_separada: q }]);
    return { m, l1, R1: a.R, R2: b.R, item: b.ids[0], item1: a.ids[0], n1: await numero(a.R) };
  };
  const detalhe = async (R, itemId) => {
    const d = await ok(como('ALMOX').get(`${API}/requisicoes/${R}`));
    const it = (d.body.itens || []).find((x) => Number(x.id) === Number(itemId));
    assert.ok(it, `item ${itemId} no detalhe`);
    return [Number(it.quantidade_entregavel), Number(it.saldo_entregavel)];
  };
  const naFila = async (R, itemId) => {
    const r = await ok(como('ALMOX').get(`${API}/fila-separacao`));
    const f = (Array.isArray(r.body) ? r.body : []).find((l) => Number(l.id) === Number(R));
    assert.ok(f, `requisicao ${R} na Fila`);
    const l = (f.itens || []).find((x) => Number(x.item_id) === Number(itemId));
    assert.ok(l, `item ${itemId} na Fila`);
    return { entregavel: Number(l.entregavel), etapas: f.etapas || null };
  };

  // ---------------------------------------------------------------- RN-274.01
  await test('[RN-274.01 detalhe] L1 3 em A01 (R1) + 1 em B01 bloqueada: o detalhe da R2 mostra 0 — e a porta recusa 1 com a E2', async () => {
    const { m, R2, item, n1 } = await montar();
    await bloquearLoc(B01, 1);
    try {
      assert.deepStrictEqual(await detalhe(R2, item), [0, 0]);
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [n1], true));
    } finally { await bloquearLoc(B01, 0); }
  });
  await test('[RN-274.01 Fila] o mesmo na Fila: entregavel 0 e a etapa ENTREGAR some', async () => {
    const { R2, item } = await montar();
    await bloquearLoc(B01, 1);
    try {
      const f = await naFila(R2, item);
      assert.strictEqual(f.entregavel, 0);
      assert.ok(Array.isArray(f.etapas) && !f.etapas.includes('ENTREGAR'), JSON.stringify(f.etapas));
    } finally { await bloquearLoc(B01, 0); }
  });
  await test('[RN-274.01 sem endereco] o resto do L1 numa linha sem endereco: detalhe e Fila 0', async () => {
    const { m, R2, item } = await montar();
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET localizacao_id = NULL WHERE material_id = ? AND localizacao_id = ?', [m.id, B01.id]);
    assert.deepStrictEqual(await detalhe(R2, item), [0, 0]);
    assert.strictEqual((await naFila(R2, item)).entregavel, 0);
  });

  // ---------------------------------------------------------------- RN-274.02
  await test('[RN-274.02] R2 pede 2, o L2 tem 1 livre: detalhe e Fila 1 — entregar 1 passa (do L2); 2 recusa com a E2', async () => {
    const { m, R2, item, n1 } = await montar({ q: 2, l2: 1 });
    await bloquearLoc(B01, 1);
    try {
      assert.deepStrictEqual(await detalhe(R2, item), [1, 1]);
      assert.strictEqual((await naFila(R2, item)).entregavel, 1);
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 2 }], E2(m.nome, 2, 1, ['L1'], [n1], false));
      await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
      assert.deepStrictEqual(await livro(R2, m), [['SAIDA', null, 'L2', 1]]);
      assert.strictEqual(await negativas(m), 0);
    } finally { await bloquearLoc(B01, 0); }
  });

  // ---------------------------------------------------------------- RN-274.03
  await test('[RN-274.03 controle] B01 livre: detalhe e Fila 1 (o numero de antes) e a entrega passa de B01', async () => {
    const { m, R2, item } = await montar();
    assert.deepStrictEqual(await detalhe(R2, item), [1, 1]);
    assert.strictEqual((await naFila(R2, item)).entregavel, 1);
    await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
    assert.deepStrictEqual(await livro(R2, m), [['SAIDA', 'Z274B-01', 'L1', 1]]);
  });
  await test('[RN-274.03 B1640] guarda da R1 num lote sem prateleira bloqueada nem linha sem endereco: o numero de antes (1) e a entrega passa', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, P01.id, 1, 'L2');
    const l1 = await loteId(m, 'L1');
    const a = await reqDireta([[m.id, 3]]);
    await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    const b = await reqDireta([[m.id, 1]]);
    await separar(b.R, [{ item_id: b.ids[0], quantidade_separada: 1 }]);
    assert.deepStrictEqual(await detalhe(b.R, b.ids[0]), [1, 1]);
    assert.strictEqual((await naFila(b.R, b.ids[0])).entregavel, 1);
    await ok(entregar(b.R, [{ item_id: b.ids[0], quantidade_atendida: 1 }]));
  });
  await test('[RN-274.03 dona] a R1 (dona da guarda) com B01 bloqueada: detalhe e Fila 3 e a entrega das 3 de A01 passa', async () => {
    const { m, R1, item1 } = await montar();
    await bloquearLoc(B01, 1);
    try {
      assert.deepStrictEqual(await detalhe(R1, item1), [3, 3]);
      assert.strictEqual((await naFila(R1, item1)).entregavel, 3);
      await ok(entregar(R1, [{ item_id: item1, quantidade_atendida: 3 }]));
      assert.deepStrictEqual(await livro(R1, m), [['SAIDA', 'Z274A-01', 'L1', 3]]);
    } finally { await bloquearLoc(B01, 0); }
  });

  // ---------------------------------------------------------------- RN-274.04
  await test('[RN-274.04 a propria] item 1 com 3 de (A01, L1), item 2 de 1 sem origem, B01 bloqueada: detalhe 3 e 0; a porta aceita o 1 e recusa o 2', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, B01.id, 1, 'L1');
    const l1 = await loteId(m, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 1]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 1 }]);
    await bloquearLoc(B01, 1);
    try {
      assert.deepStrictEqual([await detalhe(R, ids[0]), await detalhe(R, ids[1])], [[3, 3], [0, 0]]);
      assert.deepStrictEqual([(await naFila(R, ids[0])).entregavel, (await naFila(R, ids[1])).entregavel], [3, 0]);
      await recusa(R, m, [{ item_id: ids[1], quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [await numero(R)], true));
      await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    } finally { await bloquearLoc(B01, 0); }
    assert.strictEqual(await negativas(m), 0);
  });

  // ---------------------------------------------------------------- fluxo
  await test('[fluxo] B01 bloqueada (0) -> desbloquear B01 -> detalhe 1 -> a R2 entrega 1 de B01', async () => {
    const { m, R2, item } = await montar();
    await bloquearLoc(B01, 1);
    assert.deepStrictEqual(await detalhe(R2, item), [0, 0]);
    await bloquearLoc(B01, 0);
    assert.deepStrictEqual(await detalhe(R2, item), [1, 1]);
    await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
    assert.deepStrictEqual(await livro(R2, m), [['SAIDA', 'Z274B-01', 'L1', 1]]);
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
