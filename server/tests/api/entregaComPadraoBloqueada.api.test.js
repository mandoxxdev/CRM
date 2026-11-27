/**
 * Etapa 277 (C561) — a entrega com a localizacao padrao de um material bloqueada recusa ANTES de baixar qualquer item.
 *
 * Medido (Fase 5 da 276, reproduzido aqui sobre 16c32c21): numa requisicao com X (padrao livre) e Y (padrao PB-01 bloqueada, saldo sem
 * lote em P01), entregar os dois respondia 400 "Y: Localizacao PB-01 esta bloqueada" DEPOIS de baixar X (fisico 5 -> 3, item entregue).
 * O motor confere a padrao na SAIDA sem origem e sem lote (a recusa e a de sempre, e a saida avulsa faz igual); a entrega passa a fazer a
 * mesma conferencia antes da primeira baixa, com a mesma frase.
 *
 * Cobre: RN-277.01 (dois materiais), RN-277.02 (um material em dois itens), RN-277.03 (so o outro item: sem recusa), RN-277.04/.04b (Y que
 * sai por endereco — origem da separacao ou fatias da guarda de outra caixa: sem recusa nova), RN-277.05 (o controle, padrao livre).
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa277-entrega-com-prateleira-padrao-bloqueada.md
 * Executar: cd server && node tests/api/entregaComPadraoBloqueada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 277', role: 'admin', is_superadmin: 1, email: 'a277@t.com' },
  S: { id: 27761, nome: 'Solic 277', role: 'user', email: 's277@t.com' },
  ALMOX: { id: 27762, nome: 'Almox 277', role: 'user', email: 'x277@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
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
  console.log('\n=== Etapa 277: a entrega com a padrao bloqueada recusa antes de baixar (C561) ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM277', nome: 'Almox 277' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z277A-01'); const B01 = await loc('Z277B-01'); const P01 = await loc('Z277P-01');

  const material = async ({ lote = true, negativo = false } = {}) => {
    const c = `P277-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote ? 1 : 0, negativo ? 1 : 0, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e277', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  // requisicao gravada direto (APROVADO, sem reserva) — para varios itens do mesmo material
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-P277-${++seq}`])).lastID;
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
  const bloquearLoc = (L, v) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = ? WHERE id = ?', [v, L.id]);
  const PB = await loc('Z277PB-01');
  const matPB = async () => {
    const m = await material({ lote: false });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [PB.id, m.id]);
    return m;
  };
  const MSG = `Localização ${PB.codigo} está bloqueada`;
  const quanto = async (R) => (await dbAll(db, 'SELECT COALESCE(quantidade_entregue, 0) q FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]))
    .map((x) => Number(x.q));
  const fotoReq = async (R, ms) => ({ porMaterial: await Promise.all(ms.map(async (m) => ({ livro: await livro(R, m), retrato: await retrato(m) }))),
    entregue: await quanto(R), status: (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status });
  const recusaAntes = async (R, ms, linhas) => {
    const antes = await fotoReq(R, ms);
    const r = await entregar(R, linhas);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${ms[ms.length - 1].nome}: ${MSG}`);
    assert.deepStrictEqual(await fotoReq(R, ms), antes, 'nada baixado');
  };
  // X: 5 sem lote em P01 (padrao P01 livre). Y: 3 sem lote em P01, padrao PB-01 bloqueada.
  const montar = async ({ separarY = {} } = {}) => {
    const X = await material({ lote: false });
    await entrar(X, P01.id, 5);
    const Y = await matPB();
    await entrar(Y, P01.id, 3);
    const q = await reqDireta([[X.id, 2], [Y.id, 1]]);
    await separar(q.R, [{ item_id: q.ids[0], quantidade_separada: 2 }, { item_id: q.ids[1], quantidade_separada: 1, ...separarY }]);
    await bloquearLoc(PB, 1);
    return { X, Y, ...q };
  };

  await test('[RN-277.01] dois materiais, a padrao de Y bloqueada: 400 com a frase do motor, NADA baixado (C561)', async () => {
    const { X, Y, R, ids } = await montar();
    try {
      await recusaAntes(R, [X, Y], [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 1 }]);
      assert.deepStrictEqual(await retrato(X), { linhas: ['Z277P-01/-=5'], fisico: 5 }, 'X intacto (antes: 5 -> 3)');
    } finally { await bloquearLoc(PB, 0); }
  });

  await test('[RN-277.02] um material em dois itens, a padrao bloqueada: 400, nada baixado', async () => {
    const Y = await matPB();
    await entrar(Y, P01.id, 4);
    const q = await reqDireta([[Y.id, 1], [Y.id, 2]]);
    await separar(q.R, [{ item_id: q.ids[0], quantidade_separada: 1 }, { item_id: q.ids[1], quantidade_separada: 2 }]);
    await bloquearLoc(PB, 1);
    try {
      await recusaAntes(q.R, [Y], [{ item_id: q.ids[0], quantidade_atendida: 1 }, { item_id: q.ids[1], quantidade_atendida: 2 }]);
    } finally { await bloquearLoc(PB, 0); }
  });

  await test('[RN-277.03] so o item de X entregue (Y fica): 200, a padrao bloqueada de Y nao barra', async () => {
    const { X, R, ids } = await montar();
    try {
      await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]));
      assert.deepStrictEqual(await retrato(X), { linhas: ['Z277P-01/-=3'], fisico: 3 });
      assert.deepStrictEqual(await quanto(R), [2, 0]);
    } finally { await bloquearLoc(PB, 0); }
  });

  await test('[RN-277.04] Y separado COM origem P01 (sai de P01): 200 com os dois, sem recusa nova', async () => {
    const { X, Y, R, ids } = await montar({ separarY: { localizacao_origem_id: P01.id } });
    try {
      await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 1 }]));
      assert.deepStrictEqual(await quanto(R), [2, 1]);
      assert.deepStrictEqual(await retrato(Y), { linhas: ['Z277P-01/-=2'], fisico: 2 });
      assert.deepStrictEqual((await retrato(X)).fisico, 3);
    } finally { await bloquearLoc(PB, 0); }
  });

  await test('[RN-277.04b] Y com a guarda de outra caixa (sai por endereco, B1396): 200 com os dois, sem recusa nova', async () => {
    const X = await material({ lote: false });
    await entrar(X, P01.id, 5);
    const Y = await matPB();
    await entrar(Y, P01.id, 2);
    await entrar(Y, A01.id, 2);
    const g = await reqDireta([[Y.id, 2]]);
    await separar(g.R, [{ item_id: g.ids[0], quantidade_separada: 2, localizacao_origem_id: P01.id }]);
    const q = await reqDireta([[X.id, 2], [Y.id, 1]]);
    await separar(q.R, [{ item_id: q.ids[0], quantidade_separada: 2 }, { item_id: q.ids[1], quantidade_separada: 1 }]);
    await bloquearLoc(PB, 1);
    try {
      await ok(entregar(q.R, [{ item_id: q.ids[0], quantidade_atendida: 2 }, { item_id: q.ids[1], quantidade_atendida: 1 }]));
      assert.deepStrictEqual(await livro(q.R, Y), [['SAIDA', 'Z277A-01', null, 1]], 'Y sai de A01, a guarda da outra caixa fica');
      assert.deepStrictEqual(await quanto(q.R), [2, 1]);
    } finally { await bloquearLoc(PB, 0); }
  });

  // Fase 5 (achado 1): a previa lida antes de qualquer baixa dava null (P01 com 3 livres cobria sem a guarda) e recusava; na hora da baixa o
  // "Sai de" P01 do item 2 ja tinha saido e o automatico sai por fatias com endereco (P01 1, A01 2) — 200 antes e depois.
  await test('[RN-277.04c] Y com "Sai de" num item e automatico no outro (a baixa de antes muda as fatias): 200, sem recusa nova', async () => {
    const X = await material({ lote: false }); await entrar(X, P01.id, 5);
    const Y = await matPB(); await entrar(Y, P01.id, 5); await entrar(Y, A01.id, 2);
    const g = await reqDireta([[Y.id, 2]]);
    await separar(g.R, [{ item_id: g.ids[0], quantidade_separada: 2, localizacao_origem_id: P01.id }]);
    const q = await reqDireta([[X.id, 2], [Y.id, 2], [Y.id, 3]]);
    await separar(q.R, [{ item_id: q.ids[0], quantidade_separada: 2 }, { item_id: q.ids[1], quantidade_separada: 2 },
      { item_id: q.ids[2], quantidade_separada: 3 }]);
    await bloquearLoc(PB, 1);
    try {
      await ok(entregar(q.R, [{ item_id: q.ids[0], quantidade_atendida: 2 },
        { item_id: q.ids[1], quantidade_atendida: 2, localizacao_origem_id: P01.id }, { item_id: q.ids[2], quantidade_atendida: 3 }]));
      assert.deepStrictEqual(await livro(q.R, Y), [['SAIDA', 'Z277P-01', null, 2], ['SAIDA', 'Z277P-01', null, 1], ['SAIDA', 'Z277A-01', null, 2]]);
      assert.deepStrictEqual(await quanto(q.R), [2, 2, 3]);
    } finally { await bloquearLoc(PB, 0); }
  });

  await test('[RN-277.05] padrao desbloqueada: os dois saem (o controle)', async () => {
    const { X, Y, R, ids } = await montar();
    await bloquearLoc(PB, 0);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 1 }]));
    assert.deepStrictEqual([(await retrato(X)).fisico, (await retrato(Y)).fisico], [3, 2]);
  });

  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
