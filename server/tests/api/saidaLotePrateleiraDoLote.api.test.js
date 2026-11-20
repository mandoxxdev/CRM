/**
 * Etapa 239 (C543 no motor) — a saida COM LOTE e SEM ORIGEM confere o bloqueio no endereco de onde o lote sai, nao na localizacao padrao
 * do material. Antes: padrao bloqueada recusava a saida de um lote guardado em outro endereco livre ("Localizacao P esta bloqueada"), e o
 * lote guardado so num endereco bloqueado saia sem aviso (o claim drenava a linha bloqueada).
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa239-saida-lote-prateleira-do-lote.md (RN-239.01 a .05).
 * Executar: cd server && node tests/api/saidaLotePrateleiraDoLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stock = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 239', role: 'admin', is_superadmin: 1, email: 'a239@t.com' };
const API = '/api/almoxarifado';
const JUST = { motivo: 'e239', justificativa: 'teste 239' };
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 239: a saida com lote confere o bloqueio na prateleira do lote, nao na padrao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  // `projetos` e `ordens_servico` sao CORE; a posicao do cliente as le (molde: materialClientePosicaoLocalizacaoBloqueada).
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 239 LTDA'])).lastID;

  const loc = async () => {
    const codigo = `E239-L${++seq}`;
    return { id: (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e239', 1)", [codigo])).lastID, codigo };
  };
  const bloquear = (l, b = true) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = ? WHERE id = ?', [b ? 1 : 0, l.id]);
  const material = async (padrao, { cliente = null, negativo = 0 } = {}) => {
    const c = `E239-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, 1, 0, ?, ?, ?)`, [c, `Mat ${c}`, negativo, cliente, padrao ? padrao.id : null])).lastID;
  };
  const ok = async (p, st) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const entrar = (m, l, q, lote = 'L1') => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m, tipo: 'ENTRADA', quantidade: q, lote, localizacao_destino_id: l.id, motivo: 'e239' }), 201);
  const loteDe = async (m, cod = 'L1') => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, cod])).id;
  const sair = async (m, q, extra = {}) => request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m, tipo: 'SAIDA', quantidade: q, lote_id: await loteDe(m), ...JUST, ...extra });
  const em = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ?`, [m, l ? l.id : null])).q);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  const ultimaSaida = async (m) => (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo IN ('SAIDA',
    'DEVOLUCAO_CLIENTE') ORDER BY id DESC LIMIT 1`, [m])).id;

  await test('[RN-239.01/.02] padrao P bloqueada, lote so em A livre: a saida sem origem sai de A (antes: "Localizacao P esta bloqueada")', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P);
    await entrar(m, A, 5);
    await bloquear(P);
    await ok(sair(m, 2), 201);
    assert.strictEqual(await em(m, A), 3);
    assert.strictEqual(await em(m, P), 0);
    assert.strictEqual(await fisico(m), 3);
  });

  await test('[RN-239.01] padrao P livre, lote so em X bloqueada: 400 com o codigo de X, nada sai (antes: saia de X)', async () => {
    const P = await loc(); const X = await loc();
    const m = await material(P);
    await entrar(m, X, 5);
    await bloquear(X);
    const r = await sair(m, 2);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${X.codigo} está bloqueada`);
    assert.strictEqual(await em(m, X), 5);
    assert.strictEqual(await fisico(m), 5);
  });

  await test('[RN-239.01] lote so na padrao P bloqueada: 400 com o codigo de P (como antes)', async () => {
    const P = await loc();
    const m = await material(P);
    await entrar(m, P, 4);
    await bloquear(P);
    const r = await sair(m, 1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${P.codigo} está bloqueada`);
    assert.strictEqual(await em(m, P), 4);
  });

  await test('[RN-239.02] lote na padrao P bloqueada (5) e em A livre (5): a saida de 3 sai de A, P fica', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P);
    await entrar(m, P, 5);
    await entrar(m, A, 5);
    await bloquear(P);
    await ok(sair(m, 3), 201);
    assert.strictEqual(await em(m, A), 2);
    assert.strictEqual(await em(m, P), 5);
  });

  await test('[RN-239.02] padrao livre com o lote nela continua primeiro: P 5 e A 5, sai 3 de P', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P);
    await entrar(m, P, 5);
    await entrar(m, A, 5);
    await ok(sair(m, 3), 201);
    assert.strictEqual(await em(m, P), 2);
    assert.strictEqual(await em(m, A), 5);
  });

  await test('[RN-239.03] livres nao cobrem: X bloqueada 5 + A livre 2, saida de 6 -> A 0 e X 1 (a regra da Etapa 6, mantida)', async () => {
    const P = await loc(); const A = await loc(); const X = await loc();
    const m = await material(P);
    await entrar(m, X, 5);
    await entrar(m, A, 2);
    await bloquear(X);
    await ok(sair(m, 6), 201);
    assert.strictEqual(await em(m, A), 0);
    assert.strictEqual(await em(m, X), 1);
  });

  await test('[RN-239.04] com origem informada: valida a origem como antes (origem bloqueada -> 400; padrao bloqueada e origem livre -> 201)', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P);
    await entrar(m, A, 5);
    await bloquear(A);
    let r = await sair(m, 1, { localizacao_origem_id: A.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${A.codigo} está bloqueada`);
    await bloquear(A, false); await bloquear(P);
    r = await sair(m, 1, { localizacao_origem_id: A.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await em(m, A), 4);
  });

  await test('[RN-239.04] material que permite negativo, com lote e sem origem: continua validando a padrao', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P, { negativo: 1 });
    await entrar(m, A, 5);
    await bloquear(P);
    const r = await sair(m, 1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${P.codigo} está bloqueada`);
  });

  await test('[RN-239.01] o estorno da saida que saiu de A com a padrao bloqueada volta o fisico e o lote', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P);
    await entrar(m, A, 5);
    await bloquear(P);
    await ok(sair(m, 2), 201);
    await stock.cancelarMovimentacao(db, ADMIN, await ultimaSaida(m), 'estorno e239');
    assert.strictEqual(await fisico(m), 5);
    const doLote = Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?',
      [m, await loteDe(m)])).q);
    assert.strictEqual(doLote, 5);
    // Etapa 257 (C544, RN-257.02): o estorno devolve a A, de onde a saida tirou — esta linha afirmava "na linha da padrao" (P 2, A 3;
    // a pendencia da spec 10, "o enderecamento pode consolidar") e estava certa ate a 257. A padrao bloqueada nao recebe nada.
    assert.strictEqual(await em(m, A), 5);
    assert.strictEqual(await em(m, P), 0);
  });

  await test('[RN-239.05] integracao: material de cliente com lote, padrao bloqueada -> a devolucao ao cliente sai do endereco do lote; '
    + 'lote so em endereco bloqueado -> 400; a posicao continua dizendo a padrao bloqueada', async () => {
    const P = await loc(); const A = await loc(); const X = await loc();
    const m = await material(P, { cliente: cli });
    await entrar(m, A, 3);
    await bloquear(P);
    const devolver = async (q) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
      material_id: m, quantidade: q, documento_devolucao: `DEV-239-${++seq}`, lote_id: await loteDe(m) });
    await ok(devolver(1), 201);
    assert.strictEqual(await em(m, A), 2);
    const pos = (await ok(request(app).get(`${API}/materiais-cliente/posicao?cliente_id=${cli}`), 200)).body;
    const it = pos.itens.find((i) => i.material_id === m);
    assert.strictEqual(it.localizacao_padrao_bloqueada, true);
    assert.strictEqual(Number(it.saldo), 2);
    // o lote todo vai para X (transferencia) e X e bloqueada: a devolucao e recusada com o codigo de X
    await ok(request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'TRANSFERENCIA', quantidade: 2,
      lote_id: await loteDe(m), localizacao_origem_id: A.id, localizacao_destino_id: X.id, motivo: 'e239' }), 201);
    await bloquear(X);
    const r = await devolver(1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${X.codigo} está bloqueada`);
    assert.strictEqual(await em(m, X), 2);
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-239.06] a posicao diz permite_saldo_negativo (o efetivo); com ele, a devolucao com lote confere a padrao (Fase 5)', async () => {
    const P = await loc(); const A = await loc();
    const m = await material(P, { cliente: cli, negativo: 1 });
    const mN = await material(P, { cliente: cli });
    await entrar(m, A, 2);
    await bloquear(P);
    const itens = (await ok(request(app).get(`${API}/materiais-cliente/posicao?cliente_id=${cli}`), 200)).body.itens;
    assert.strictEqual(itens.find((i) => i.material_id === m).permite_saldo_negativo, true);
    assert.strictEqual(itens.find((i) => i.material_id === mN).permite_saldo_negativo, false);
    const r = await request(app).post(`${API}/materiais-cliente/devolucoes`).send({
      material_id: m, quantidade: 1, documento_devolucao: `DEV-239-${++seq}`, lote_id: await loteDe(m) });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Localização ${P.codigo} está bloqueada`);
    await dbRun(db, "INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('permite_saldo_negativo_global', '1')");
    try {
      const it2 = (await ok(request(app).get(`${API}/materiais-cliente/posicao?cliente_id=${cli}`), 200)).body.itens;
      assert.strictEqual(it2.find((i) => i.material_id === mN).permite_saldo_negativo, true, 'o global vale');
    } finally {
      await dbRun(db, "DELETE FROM configuracoes_almoxarifado WHERE chave = 'permite_saldo_negativo_global'");
    }
  });

  // ── RN-239.07 (Fase 2 B/C; Fase 5 achado 1): na entrega automatica o lote so em endereco bloqueado vai para o fim da fila ──────
  const requisitionService = require('../../services/almoxarifado/requisitionService');
  const reqDireta = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E239-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    return { R, item };
  };
  const cenarioEntrega = async () => {
    const P = await loc(); const A = await loc(); const X = await loc();
    const m = await material(P);
    await entrar(m, X, 3, 'L1');
    await entrar(m, A, 5, 'L2');
    // L1 vence primeiro (FEFO o escolheria) e esta todo em X, bloqueada
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = date('now', '+10 days') WHERE material_id = ? AND codigo = 'L1'", [m]);
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = date('now', '+20 days') WHERE material_id = ? AND codigo = 'L2'", [m]);
    await bloquear(X);
    return { m, A, X };
  };

  await test('[RN-239.07] lotesParaOAutomatico: o lote so em endereco bloqueado vai para o fim da fila (saldo inteiro; FEFO entre os outros)', async () => {
    const { m } = await cenarioEntrega();
    const lotes = await requisitionService.lotesParaOAutomatico(db, m, new Map(), new Map());
    const l1 = await loteDe(m, 'L1'); const l2 = await loteDe(m, 'L2');
    assert.deepStrictEqual(lotes.map((l) => [l.lote_id, l.saldo]), [[l2, 5], [l1, 3]], JSON.stringify(lotes));
  });

  await test('[RN-239.07] integracao: separar e entregar 3 sem origem -> sai de L2 em A; L1 em X bloqueada fica (antes: 400 "X esta bloqueada")', async () => {
    const { m, A, X } = await cenarioEntrega();
    const { R, item } = await reqDireta(m, 3);
    await ok(request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: [{ item_id: item, quantidade_separada: 3 }] }), 200);
    await ok(request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: item, quantidade_atendida: 3 }] }), 200);
    const saidas = await dbAll(db, `SELECT lt.codigo lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id WHERE mv.requisicao_id = ? AND mv.tipo = 'SAIDA'`, [R]);
    assert.deepStrictEqual(saidas.map((s) => [s.lote, Number(s.q)]), [['L2', 3]]);
    assert.strictEqual(await em(m, A), 2);
    assert.strictEqual(await em(m, X), 3);
  });

  await test('[RN-239.07] so o lote em endereco bloqueado: a entrega e recusada com o codigo do endereco; nada sai, nada vai para "sem lote" (Fase 5)', async () => {
    const P = await loc(); const X = await loc();
    const m = await material(P);
    await entrar(m, X, 3, 'L1');
    await bloquear(X);
    const { R, item } = await reqDireta(m, 3);
    await ok(request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: [{ item_id: item, quantidade_separada: 3 }] }), 200);
    const r = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [{ item_id: item, quantidade_atendida: 3 }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(String(r.body.error).endsWith(`Localização ${X.codigo} está bloqueada`), r.body.error);
    assert.strictEqual(await em(m, X), 3);
    assert.strictEqual(await em(m, null), 0, 'nada na linha sem endereco');
    assert.strictEqual(await em(m, P), 0, 'nada negativo na padrao');
    assert.strictEqual(await fisico(m), 3);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
