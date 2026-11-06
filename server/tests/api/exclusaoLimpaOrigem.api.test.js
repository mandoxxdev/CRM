/**
 * Etapa 203 (C467) — a exclusao da requisicao limpa o local separado dos itens.
 *
 * Antes a exclusao estornava as entregas e marcava a requisicao (ativo 0, CANCELADO), mas cada item continuava com
 * `origem_separacao_id`, `lote_separacao_id` e `quantidade_origem_separacao`. Nenhuma conta le isso (todas filtram `caixaVivaSql`),
 * mas era dado morto. Agora as tres colunas zeram logo depois do UPDATE que exclui, dentro das travas (B1358); falha na limpeza e
 * best-effort, sem nova tentativa (B1359); a caixa e o historico das rodadas ficam (B1360).
 *
 * Usuarios reais por header (molde da separacaoSeparadoDeOutras): S sem perfil cria; ADMIN superadmin aprova, da entrada e exclui;
 * ALMOX separa e entrega.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa203-exclusao-limpa-a-origem.md
 *
 * Executar: cd server && node tests/api/exclusaoLimpaOrigem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 203', role: 'admin', is_superadmin: 1, email: 'a203@t.com' },
  S: { id: 20321, nome: 'Solic 203', role: 'user', email: 's203@t.com' },
  ALMOX: { id: 20322, nome: 'Almox 203', role: 'user', email: 'x203@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 203: a exclusao limpa o local separado ===\n');
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
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  // gancho no db.run: devolve erro para o UPDATE de limpeza (RN-203.05). Casa so a limpeza por requisicao_id.
  const origRun = db.run.bind(db);
  const RE_LIMPEZA = /UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = NULL[\s\S]*WHERE requisicao_id = \?/;
  let falharLimpeza = 0; let disparos = 0;
  db.run = function (sql, ...rest) {
    if (RE_LIMPEZA.test(String(sql))) {
      disparos++;
      if (falharLimpeza > 0) {
        falharLimpeza--;
        const cb = rest.find((x) => typeof x === 'function');
        setImmediate(() => cb.call({ lastID: 0, changes: 0 }, new Error('falha simulada na limpeza (e203)')));
        return this;
      }
    }
    return origRun(sql, ...rest);
  };

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM203', nome: 'Almox 203' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('YXB-01'); const P01 = await loc('YXP-01');

  const material = async () => {
    const c = `E203-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, 1, ?)`,
    [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e203',
      localizacao_destino_id: destino, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-203',
      itens: itens.map(([mid, q]) => ({ material_id: mid, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    return { R: cr.body.id, ids };
  };
  const separar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: linhas });
  const sepOk = async (R, linhas) => { const r = await separar(R, linhas); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); };
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const doPar = (item, q, L1) => ({ item_id: item, quantidade_separada: q, localizacao_origem_id: B01.id, lote_id: L1 });
  const itemDe = async (id) => {
    const i = await dbGet(db, `SELECT quantidade_separada, quantidade_entregue, origem_separacao_id, lote_separacao_id, quantidade_origem_separacao
      FROM itens_requisicao_almoxarifado WHERE id = ?`, [id]);
    return [Number(i.quantidade_separada || 0), Number(i.quantidade_entregue || 0), i.origem_separacao_id, i.lote_separacao_id,
      i.quantidade_origem_separacao === null ? null : Number(i.quantidade_origem_separacao)];
  };
  const rodadasJson = async (R) => (await dbAll(db, 'SELECT itens_json FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id',
    [R])).map((r) => r.itens_json);
  const linha = async (R) => dbGet(db, 'SELECT ativo, status FROM requisicoes_almoxarifado WHERE id = ?', [R]);
  const saldoDe = async (m, locId, lid) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [m.id, locId, lid])).q);
  const entradasDaReq = async (R) => (await dbAll(db, `SELECT quantidade FROM movimentacoes_almoxarifado
    WHERE requisicao_id = ? AND tipo = 'ENTRADA' ORDER BY id`, [R])).map((x) => Number(x.quantidade));

  // L1 6 em YXB-01, L2 9 na padrao YXP-01.
  const cenario = async () => {
    const m = await material();
    await entrar(m, B01.id, 6, 'L1'); await entrar(m, P01.id, 9, 'L2');
    return { m, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2') };
  };

  // ---------------------------------------------------------------- RN-203.01
  await test('[RN-203.01 rota almoxarifado] separou 4 de YXB-01/L1 e excluiu: as tres colunas NULL; caixa 4, rodadas e saldo iguais; R2 separa os 4', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 0, B01.id, L1, 4], 'premissa: a origem gravada');
    const rod = await rodadasJson(r1.R);
    assert.ok(rod.length === 1 && rod[0].includes(String(B01.id)), `premissa: a rodada guarda a origem ${JSON.stringify(rod)}`);
    const d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'exclusao 203' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(Object.keys(d.body).sort(), ['estornos', 'reservas_liberadas', 'success'], 'a resposta nao muda de forma');
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 0, null, null, null], 'a exclusao limpa a origem (C467)');
    assert.deepStrictEqual(await rodadasJson(r1.R), rod, 'o historico das rodadas fica (B1360)');
    const l = await linha(r1.R);
    assert.deepStrictEqual([Number(l.ativo), l.status], [0, 'CANCELADO']);
    assert.strictEqual(await saldoDe(m, B01.id, L1), 6, 'nada mexeu no estoque (nada entregue)');
    await sepOk(r2.R, [doPar(r2.ids[0], 4, L1)]);
  });

  // ---------------------------------------------------------------- RN-203.02
  await test('[RN-203.02 rota requisicoes-material] a mesma limpeza pela rota dos outros modulos', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const d = await como('ADMIN').del(`/api/requisicoes-material/${r1.R}`, { justificativa: 'exclusao 203 rm' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 0, null, null, null]);
    assert.strictEqual(Number((await linha(r1.R)).ativo), 0);
  });

  // ---------------------------------------------------------------- RN-203.03
  await test('[RN-203.03] dois itens (um com origem, um no automatico) e entrega parcial: estorno de antes (1), so a excluida limpa', async () => {
    const { m, L1 } = await cenario();
    const m2 = await material(); await entrar(m2, P01.id, 5, 'M1');
    const r1 = await req([[m.id, 4], [m2.id, 2]]);
    const outra = await req([[m.id, 1]]);
    await sepOk(outra.R, [doPar(outra.ids[0], 1, L1)]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1), { item_id: r1.ids[1], quantidade_separada: 2 }]);
    const e = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 1 }]);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 1, B01.id, L1, 3], 'premissa: parte 3 depois de entregar 1 da origem');
    assert.deepStrictEqual(await itemDe(r1.ids[1]), [2, 0, null, null, null], 'premissa: o automatico nao tem origem');
    assert.strictEqual(await saldoDe(m, B01.id, L1), 5, 'premissa: saiu 1 de YXB-01/L1');
    const d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'exclusao 203 parcial' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(d.body.estornos, [{ material_id: m.id, quantidade: 1 }]);
    assert.deepStrictEqual(await entradasDaReq(r1.R), [1], 'uma ENTRADA de 1, como antes');
    assert.strictEqual(await saldoDe(m, B01.id, L1), 6, 'o 1 voltou a YXB-01/L1');
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 1, null, null, null], 'limpa; caixa e entregue ficam');
    assert.deepStrictEqual(await itemDe(r1.ids[1]), [2, 0, null, null, null]);
    assert.deepStrictEqual(await itemDe(outra.ids[0]), [1, 0, B01.id, L1, 1], 'a outra requisicao no mesmo par nao e tocada');
  });

  // ---------------------------------------------------------------- RN-203.04
  await test('[RN-203.04] exclusao recusada nao limpa: sem perfil 403; destino do estorno bloqueado 400; a origem fica', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const e = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 1 }]);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const antes = await itemDe(r1.ids[0]);
    assert.deepStrictEqual(antes, [4, 1, B01.id, L1, 3]);
    const negado = await como('ALMOX').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'e203 sem perfil' });
    assert.strictEqual(negado.status, 403, JSON.stringify(negado.body));
    assert.deepStrictEqual(await itemDe(r1.ids[0]), antes, '403 nao limpa');
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id IN (?, ?)', [B01.id, P01.id]);
    try {
      const rec = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'e203 destino bloqueado' });
      assert.strictEqual(rec.status, 400, JSON.stringify(rec.body));
      assert.deepStrictEqual(await itemDe(r1.ids[0]), antes, '400 nao limpa (tudo ou nada)');
      assert.deepStrictEqual([Number((await linha(r1.R)).ativo), await entradasDaReq(r1.R)], [1, []], 'nada estornado, ativa');
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id IN (?, ?)', [B01.id, P01.id]);
    }
    const d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'e203 agora vai' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 1, null, null, null]);
  });

  // ---------------------------------------------------------------- RN-203.05
  await test('[RN-203.05] a limpeza falha -> 200 assim mesmo, excluida, estorno uma vez, a origem fica e nada tenta de novo', async () => {
    const { m, L1 } = await cenario();
    const r1 = await req([[m.id, 4]]);
    await sepOk(r1.R, [doPar(r1.ids[0], 4, L1)]);
    const e = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 1 }]);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    falharLimpeza = 1; disparos = 0;
    const warn = console.warn; const avisos = [];
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    let d;
    try {
      d = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'e203 falha' });
    } finally { console.warn = warn; falharLimpeza = 0; }
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual(disparos, 1, `a limpeza rodou ${disparos} vez(es) — uma, sem nova tentativa`);
    assert.ok(avisos.some((a) => a.includes('falha simulada na limpeza')), `o aviso no log: ${JSON.stringify(avisos)}`);
    assert.strictEqual(Number((await linha(r1.R)).ativo), 0);
    assert.deepStrictEqual(await entradasDaReq(r1.R), [1], 'estornado uma vez');
    assert.deepStrictEqual(await itemDe(r1.ids[0]), [4, 1, B01.id, L1, 3], 'a origem ficou (best-effort, B1359)');
    const de = await como('ADMIN').del(`${API}/requisicoes/${r1.R}`, { justificativa: 'e203 de novo' });
    assert.strictEqual(de.status, 404, 'a segunda exclusao e 404, sem estornar de novo');
    assert.deepStrictEqual(await entradasDaReq(r1.R), [1]);
  });

  db.run = origRun;
  await close();
  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
