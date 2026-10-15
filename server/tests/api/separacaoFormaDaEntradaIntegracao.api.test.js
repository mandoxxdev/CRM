/**
 * Etapa 99 (T3) — a integracao: cada documento ate o ultimo gesto, pela rota E pelo servico.
 *
 * A forma da separacao (T1) muda a porta que tres gestos usam depois — a devolucao da 98 (que esvazia a caixa), o
 * `[]` (modal zerado / "Reabrir separacao") e a conferencia (T2) — e a alcada de valor (94) fica no meio do caminho.
 * Cada porta certa sozinha nao prova o documento: so seguindo separar invalido -> separar -> conferir -> entregar
 * parcial -> separar invalido na Parcialmente Atendida -> devolver -> [] -> conferir vazio -> liberar -> separar ->
 * conferir -> entregar se ve que nenhum gesto posterior recusa o que o anterior deixou, e que a recusa nova nao prende
 * ninguem. A RN-06 depende de ORDEM dentro do servico (forma -> alcada -> reivindicacao).
 *
 * I1 critico pela rota; I2 serie pela rota (com o legado e a A50, e o caminho de saida do C202 ate o encerramento);
 * I3 alcada pela rota; I4 pelo servico. Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa99-separacao-recusa-o-inseparavel.md
 *
 * Executar: cd server && node tests/api/separacaoFormaDaEntradaIntegracao.api.test.js
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
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 99i', role: 'admin', is_superadmin: 1, email: 'a99i@t.com' },
  S: { id: 9921, nome: 'Solic 99i', role: 'user', email: 's99i@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9922, nome: 'Almox 99i', role: 'user', email: 'x99i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9923, nome: 'Almox2 99i', role: 'user', email: 'y99i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const SEP_SVC = { id: 9924, nome: 'Sep svc 99i', role: 'user', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const CONF_SVC = { id: 9925, nome: 'Conf svc 99i', role: 'user', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const API = '/api/almoxarifado';
const VAZIA = 'Nenhum item separado';
const q1 = (nome, bruto) => `${nome}: quantidade inválida para separar (${bruto}) — informe um número positivo, ou 0 para não separar este item`;
const q2 = (id) => `Item ${id} não pertence a esta requisição`;
const q3 = (nome, q) => `${nome}: material com controle de série exige quantidade inteira na separação (informado: ${q})`;

// A50 — o texto do plano (letra A), lido como esta: requisicoes com caixa fracionaria em material com serie.
const A50 = `SELECT r.id AS requisicao_id, r.numero, r.status, ir.id AS item_id, m.codigo, m.nome,
       ir.quantidade_separada AS separado,
       COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) AS entregue,
       ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6) AS caixa
  FROM itens_requisicao_almoxarifado ir
  JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id AND COALESCE(r.ativo, 1) = 1
  JOIN materiais_almoxarifado m ON m.id = ir.material_id AND COALESCE(m.controle_serie, 0) = 1
 WHERE r.status IN ('APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA',
                    'TOTALMENTE_RESERVADA', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA', 'PRONTA_PARA_RETIRADA',
                    'AGUARDANDO_APROVACAO_VALOR')
   AND ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6) > 0.000001
   AND ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6)
       <> CAST(ROUND(COALESCE(ir.quantidade_separada, 0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 6) AS INTEGER)
 ORDER BY r.id, ir.id;`;

const notificados = [];
const notificarOriginal = valueApprovalService.notificarAprovadoresValor;
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 99 T3: integracao — cada documento ate o ultimo gesto ===\n');
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

  const material = async ({ critico = 0, serie = 0, custo = 0.1 } = {}) => {
    const c = `E99I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico, controle_serie) VALUES (?, ?, 'PC', 0, 0, 1, ?, ?, ?)`,
    [c, `Mat ${c}`, custo, critico, serie])).lastID;
    return { id, nome: `Mat ${c}`, codigo: c };
  };
  const entrar = async (m, q, series) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e99i', ...(series ? { series } : {}),
    });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const criar = async (pares) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-99i',
      itens: pares.map(([m, q]) => ({ material_id: m.id, quantidade: q })),
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const separar = (R, itens, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, { itens_separados: itens });
  const conferir = (R, u = 'ALMOX2') => como(u).put(`${API}/requisicoes/${R}/conferir-separacao`, {});
  const liberar = (R) => como('ALMOX').put(`${API}/requisicoes/${R}/liberar-retirada`, {});
  const entregar = (R, itens) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: itens });
  const devolver = (R, pares) => como('ALMOX').put(`${API}/requisicoes/${R}/devolver-separado`, {
    motivo: 'quebrou na caixa', itens: pares.map(([item_id, quantidade]) => ({ item_id, quantidade })),
  });
  const status = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;
  const ok = (r, rotulo, cod = 200) => assert.strictEqual(r.status, cod, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
  const recusa = (r, cod, literal, rotulo) => {
    assert.strictEqual(r.status, cod, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal, `${rotulo}: literal`);
  };
  const svc = async (fn) => {
    try { return { status: 200, body: await fn() }; } catch (e) { return { status: e.status || 500, body: { error: e.message } }; }
  };
  const serieIds = async (m, n) => (await dbAll(db, "SELECT id FROM series_almoxarifado WHERE material_id=? AND status='EM_ESTOQUE' ORDER BY id LIMIT ?", [m.id, n])).map((r) => r.id);
  const naFila = async (R) => ((await como('ALMOX').get(`${API}/fila-separacao`)).body || []).some((f) => f.id === R);
  const a50 = async () => (await dbAll(db, A50)).map((r) => r.requisicao_id);

  await test('[99 I1] critico pela rota: -2 recusado, separa, confere, entrega 2, -1 na Parcialmente Atendida recusado, devolve, [] , conferir vazio e liberar recusam, separa 2, confere, entrega -> Entregue', async () => {
    const m = await material({ critico: 1 });
    const a = await criar([[m, 4]]);
    await aprovar(a.R);
    await entrar(m, 4);
    const st0 = await status(a.R);
    recusa(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: -2 }]), 400, q1(m.nome, '-2'), 'separa -2');
    assert.strictEqual(await status(a.R), st0, 'o status de antes fica');
    ok(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }]), 'separa 4');
    ok(await conferir(a.R), 'confere');
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 2 }]), 'entrega 2');
    assert.strictEqual(await status(a.R), 'PARCIALMENTE_ATENDIDA');
    recusa(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: -1 }]), 400, q1(m.nome, '-1'), 'separa -1 na parcial');
    assert.strictEqual(await status(a.R), 'PARCIALMENTE_ATENDIDA', 'a recusa nao reivindica');
    assert.ok(await naFila(a.R), 'a fila ainda a mostra');
    ok(await devolver(a.R, [[a.ids[0], 2]]), 'devolve 2');
    ok(await separar(a.R, []), '[] pela API (= modal zerado)');
    assert.strictEqual(await status(a.R), 'EM_SEPARACAO');
    recusa(await conferir(a.R), 400, VAZIA, 'conferir a caixa vazia (C200)');
    recusa(await liberar(a.R), 400, VAZIA, 'liberar a caixa vazia (B512)');
    assert.ok(await naFila(a.R), 'a Em Separacao vazia continua na fila');
    ok(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 2 }]), 'separa 2');
    ok(await conferir(a.R), 'confere 2');
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 2 }]), 'entrega 2');
    assert.strictEqual(await status(a.R), 'ENTREGUE');
    const sep = (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade='requisicao' AND entidade_id=? AND acao='SEPARACAO'`, [a.R])).n;
    assert.strictEqual(sep, 2, 'duas SEPARACAO na trilha');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_caixa_requisicao WHERE requisicao_id=?', [a.R])).n, 1, 'uma devolucao');
    const saidas = (await dbGet(db, "SELECT COALESCE(SUM(quantidade),0) q FROM movimentacoes_almoxarifado WHERE material_id=? AND tipo='SAIDA'", [m.id])).q;
    assert.strictEqual(Number(saidas), 4, 'saiu 4 no total (2 + 2)');
  });

  await test('[99 I2] serie pela rota: 1,5 recusado, 2 separa e entrega com as series -> Entregue', async () => {
    const m = await material({ serie: 1 });
    await entrar(m, 2, [`I2A-${seq}`, `I2B-${seq}`]);
    const a = await criar([[m, 2]]);
    await aprovar(a.R);
    recusa(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 1.5 }]), 400, q3(m.nome, '1.5'), 'separa 1,5');
    ok(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 2 }]), 'separa 2');
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 2, serie_ids: await serieIds(m, 2) }]), 'entrega 2');
    assert.strictEqual(await status(a.R), 'ENTREGUE');
  });

  await test('[99 I2] legado: caixa 0,5 de serie -> a A50 acha; separa 1 (1,5), entrega 1, devolve 0,5 -> a A50 nao acha; separa 1, entrega 1 -> Entregue', async () => {
    const m = await material({ serie: 1 });
    await entrar(m, 2, [`I2L-${seq}-1`, `I2L-${seq}-2`]);
    const a = await criar([[m, 2]]);
    await aprovar(a.R);
    await dbRun(db, "UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 0.5 WHERE id = ?", [a.ids[0]]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [a.R]);
    assert.ok((await a50()).includes(a.R), 'a A50 acha a caixa 0,5');
    ok(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 1 }]), 'separa 1 sobre o legado');
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE id=?', [a.ids[0]])).q), 1.5);
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 1, serie_ids: await serieIds(m, 1) }]), 'entrega 1');
    assert.ok((await a50()).includes(a.R), 'ainda 0,5 na caixa');
    ok(await devolver(a.R, [[a.ids[0], 0.5]]), 'devolve 0,5');
    assert.ok(!(await a50()).includes(a.R), 'a A50 nao acha mais');
    ok(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 1 }]), 'separa 1');
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 1, serie_ids: await serieIds(m, 1) }]), 'entrega 1');
    assert.strictEqual(await status(a.R), 'ENTREGUE');
  });

  await test('[99 I2] o C202 ate o ultimo gesto: legado 1,5 de serie (a criacao recusa), separa e entrega 1, o 0,5 recusa Q3 e a requisicao continua Parcialmente Atendida e encerra', async () => {
    const m = await material({ serie: 1 });
    await entrar(m, 2, [`I2C-${seq}-1`, `I2C-${seq}-2`]);
    // Etapa 101 (C202, RN-08): a criacao recusa a fracao; o legado e montado por SQL.
    const pedido15 = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-99i', itens: [{ material_id: m.id, quantidade: 1.5 }],
    });
    recusa(pedido15, 400,
      `${m.nome}: material com controle de série exige quantidade inteira na requisição (informado: 1.5)`, 'criar 1,5 pela rota');
    const a = await criar([[m, 2]]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_solicitada = 1.5 WHERE id = ?', [a.ids[0]]);
    await aprovar(a.R);
    ok(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 1 }]), 'separa 1');
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 1, serie_ids: await serieIds(m, 1) }]), 'entrega 1');
    assert.strictEqual(await status(a.R), 'PARCIALMENTE_ATENDIDA');
    recusa(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 0.5 }]), 400, q3(m.nome, '0.5'), 'o 0,5 pre-preenchido');
    assert.strictEqual(await status(a.R), 'PARCIALMENTE_ATENDIDA', 'a recusa nao leva a Em Separacao');
    ok(await como('ADMIN').put(`${API}/requisicoes/${a.R}/encerrar`, { motivo: 'fracao de serie (C202)' }), 'encerrar');
    assert.strictEqual(await status(a.R), 'ENCERRADA');
  });

  await test('[99 I3] alcada pela rota: [A 2, B -1] -> 400 Q1, nada gravado, espiao zero; [A 4] -> 403 (a alcada vale para o valido)', async () => {
    const mA = await material({ custo: 5 }); const mB = await material({ custo: 5 });
    await entrar(mA, 4); await entrar(mB, 4);
    const a = await criar([[mA, 4], [mB, 4]]);
    await aprovar(a.R);
    for (const [k, v] of [['liberacao_valor_ativo', '1'], ['liberacao_valor_limite', '1'], ['liberacao_valor_aprovadores', '[2]']]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    }
    try {
      notificados.length = 0;
      const antes = await dbGet(db, 'SELECT status, requer_aprovacao_valor, valor_total FROM requisicoes_almoxarifado WHERE id=?', [a.R]);
      recusa(await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 2 }, { item_id: a.ids[1], quantidade_separada: -1 }]),
        400, q1(mB.nome, '-1'), '[A 2, B -1]');
      assert.deepStrictEqual(await dbGet(db, 'SELECT status, requer_aprovacao_valor, valor_total FROM requisicoes_almoxarifado WHERE id=?', [a.R]), antes);
      assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE id=?', [a.ids[0]])).q || 0), 0);
      await new Promise((r) => setImmediate(r));
      assert.deepStrictEqual(notificados, [], 'nenhum e-mail');
      const r = await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }]);
      assert.strictEqual(r.status, 403, JSON.stringify(r.body));
      assert.strictEqual(r.body.code, 'AGUARDANDO_APROVACAO_VALOR');
    } finally {
      await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor = '0' WHERE chave = 'liberacao_valor_ativo'");
    }
  });

  await test('[99 I4] pelo servico: -2 recusado, separa 4, confere, entrega 2, devolve 2, [] e conferir vazio recusa; entrada null -> Q2 (nao TypeError)', async () => {
    const m = await material({ critico: 1 });
    await entrar(m, 4);
    const a = await criar([[m, 4]]);
    await aprovar(a.R);
    const st0 = await status(a.R);
    recusa(await svc(() => requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: -2 }], SEP_SVC)),
      400, q1(m.nome, '-2'), 'svc -2');
    assert.strictEqual(await status(a.R), st0);
    recusa(await svc(() => requisitionService.separarRequisicao(db, a.R, [null], SEP_SVC)), 400, q2('null'), 'svc null');
    ok(await svc(() => requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], SEP_SVC)), 'svc separa 4');
    ok(await svc(() => requisitionService.conferirSeparacao(db, a.R, CONF_SVC)), 'svc confere');
    ok(await entregar(a.R, [{ item_id: a.ids[0], quantidade_atendida: 2 }]), 'entrega 2');
    ok(await devolver(a.R, [[a.ids[0], 2]]), 'devolve 2');
    ok(await svc(() => requisitionService.separarRequisicao(db, a.R, [], SEP_SVC)), 'svc []');
    assert.strictEqual(await status(a.R), 'EM_SEPARACAO');
    recusa(await svc(() => requisitionService.conferirSeparacao(db, a.R, CONF_SVC)), 400, VAZIA, 'svc conferir vazio');
    assert.strictEqual((await dbGet(db, 'SELECT conferido_por_id c FROM requisicoes_almoxarifado WHERE id=?', [a.R])).c, null);
  });

  valueApprovalService.notificarAprovadoresValor = notificarOriginal;
  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
