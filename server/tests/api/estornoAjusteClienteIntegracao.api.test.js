/**
 * Etapa 106 (T4) — integracao: o estorno do ajuste de material de cliente ate o ultimo gesto, pela ROTA e pelo SERVICO
 * (C211, B707, B710).
 *
 * (K1) material de CLIENTE com 4 na caixa sem reserva: o Administrador conta "0 no A" -> 201 com a A1 que nomeia so o
 * Administrador; a entrega presa em "Maximo: 0"; o Gestor estorna -> 403 E1; o almoxarife -> 403 do gate; o Administrador
 * estorna -> 200 com a auditoria ESTORNO_AJUSTE; a entrega 4 passa. (K2) pelo servico: cancelarMovimentacao com o Gestor
 * -> 403 E1 sem efeito; com o Administrador -> 200. (K3) o material NOSSO no mesmo fluxo: A1 com "Administrador ou
 * Gestor", o Gestor estorna 200 e a entrega passa (a metade positiva).
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa106-estorno-ajuste-cliente.md
 * Executar: cd server && node tests/api/estornoAjusteClienteIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const caixaSql = require('../../services/almoxarifado/caixaSql');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 106i', role: 'admin', is_superadmin: 1, email: 'a106i@t.com' },
  S: { id: 10621, nome: 'Solic 106i', role: 'user', email: 's106i@t.com' }, // sem perfil = PRODUCAO
  GESTOR: { id: 10623, nome: 'Gestor 106i', role: 'user', email: 'g106i@t.com', perfil_almoxarifado: PERFIS.GESTOR },
  ALMOX: { id: 10622, nome: 'Almox 106i', role: 'user', email: 'x106i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Literal A1 (plano, "Contrato congelado").
const A1 = (cod, total, caixa, lista) => `Ajuste gravado, mas o disponível de ${cod} ficou em ${total} PC, abaixo dos ${caixa} PC `
  + `separados para ${lista}: a entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu `
  + '— estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o '
  + 'à prateleira na requisição.';
// RN-08: com material de cliente o parentese nomeia so o Administrador.
const A1_CLIENTE = (...a) => A1(...a).replace('(perfil Administrador ou Gestor do almoxarifado)',
  () => '(perfil Administrador do almoxarifado)');
// E1 (plano, "Contrato congelado").
const E1 = (cod, dono, perfil) => `Estornar o ajuste do material ${cod}, que pertence ao cliente ${dono}, exige a permissao `
  + `"ajustar_material_cliente" (seu perfil: ${perfil}). Estornar ajuste de estoque de terceiro mexe no numero que o cliente `
  + 'vai cobrar.';

(async () => {
  console.log('\n=== Etapa 106 (T4): o estorno do ajuste de material de cliente ate o ultimo gesto ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const material = async () => {
    const c = `E106I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario) VALUES (?, ?, 'PC', 0, 0, 1, 0.1)`, [c, c])).lastID;
    return { id, codigo: c };
  };
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e106i', 1)",
    [`L106I-${++seq}`])).lastID;
  const req = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-104', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const { numero } = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    return { R: cr.body.id, ids, numero };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const mov = (b, u = 'ADMIN') => como(u).post(`${API}/movimentacoes/v2`, { motivo: 'e104', justificativa: 'contagem e104', ...b });
  const entrar = async (m, q, l) => {
    const r = await mov({ material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: l });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const ajuste = (m, q, l, u) => mov({ material_id: m, tipo: 'AJUSTE', quantidade: q, localizacao_destino_id: l }, u);
  const separar = async (R, item, q) => {
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
  };
  const entregar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: [{ item_id: item, quantidade_atendida: q }],
  });
  const estornar = (id, u) => como(u).post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'a contagem nao viu a caixa' });
  const total = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q;
  const statusReq = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;
  const semAviso = (r, rotulo) => {
    assert.strictEqual(r.status, 201, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(!('aviso_caixa' in r.body), `${rotulo}: nao devia ter aviso_caixa: ${JSON.stringify(r.body)}`);
  };
  // caixa sem reserva `pede` no endereco A com `fisico` (a ENTRADA vem DEPOIS da aprovacao: sem reserva)
  const montagem = async ({ fisico = 4, pede = 4 } = {}) => {
    const mat = await material(); const A = await loc();
    const a = await req(mat.id, pede); await aprovar(a.R);
    await entrar(mat.id, fisico, A);
    await separar(a.R, a.ids[0], pede);
    return { ...mat, m: mat.id, A, ...a };
  };


  // Material de cliente so sai com OS/projeto DESSE cliente (Etapa 8): a requisicao leva o projeto do dono. `projetos` e
  // tabela CORE, fora do harness (o mesmo precedente de materialClienteGuardaSaida).
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Caldeiraria Beta SA'])).lastID;
  const proj = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cli, 'Projeto Beta'])).lastID;
  const doCliente = async (x) => {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ? WHERE id = ?', [cli, x.m]);
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET projeto_id = ? WHERE id = ?', [proj, x.R]);
    return x;
  };
  const auditoriaEstorno = (m) => dbGet(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'material_cliente' AND acao = 'ESTORNO_AJUSTE' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [m]);

  await test('[106 K1] pela ROTA, material de CLIENTE: A1 so Administrador; Gestor estorna -> 403 E1; almoxarife -> 403 do gate; Administrador estorna -> 200 auditado; a entrega 4 passa', async () => {
    const x = await doCliente(await montagem());
    const r = await ajuste(x.m, 0, x.A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_caixa, A1_CLIENTE(x.codigo, 0, 4, `a requisição ${x.numero}`));
    const presa = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(presa.status, 400, JSON.stringify(presa.body));
    assert.ok(/Máximo: 0/.test(presa.body.error), presa.body.error);

    const g = await estornar(r.body.id, 'GESTOR');
    assert.strictEqual(g.status, 403, JSON.stringify(g.body));
    assert.strictEqual(g.body.error, E1(x.codigo, 'Caldeiraria Beta SA', 'GESTOR'));
    assert.strictEqual(await total(x.m), 0, 'a recusa do Gestor mexeu no total');
    const a = await estornar(r.body.id, 'ALMOX');
    assert.strictEqual(a.status, 403, JSON.stringify(a.body));
    assert.strictEqual(a.body.error, 'Sem permissão para esta operação');

    const est = await estornar(r.body.id, 'ADMIN');
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await total(x.m), 4);
    const aud = await auditoriaEstorno(x.m);
    assert.ok(aud, 'sem auditoria ESTORNO_AJUSTE');
    assert.strictEqual(JSON.parse(aud.dados_novos).proprietario_cliente_nome, 'Caldeiraria Beta SA');
    assert.strictEqual(aud.usuario_id, USERS.ADMIN.id);

    const e = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(await statusReq(x.R), 'ENTREGUE');
  });

  await test('[106 K2] pelo SERVICO, material de CLIENTE: cancelarMovimentacao com o Gestor -> 403 E1 sem efeito; com o Administrador -> estornado', async () => {
    const x = await doCliente(await montagem());
    const r = await stockService.registrarMovimentacao(db, { ...USERS.ADMIN },
      { material_id: x.m, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A, motivo: 'e106', justificativa: 'contagem e106' });
    assert.strictEqual(r.aviso_caixa, A1_CLIENTE(x.codigo, 0, 4, `a requisição ${x.numero}`));
    await assert.rejects(() => stockService.cancelarMovimentacao(db, { ...USERS.GESTOR }, r.id, 'a contagem nao viu a caixa'),
      (err) => err.status === 403 && err.message === E1(x.codigo, 'Caldeiraria Beta SA', 'GESTOR'));
    const orig = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(orig.cancelado, 0);
    assert.strictEqual(await total(x.m), 0);
    const ok = await stockService.cancelarMovimentacao(db, { ...USERS.ADMIN }, r.id, 'a contagem nao viu a caixa');
    assert.ok(ok.estorno_id, JSON.stringify(ok));
    assert.strictEqual(await total(x.m), 4);
    assert.strictEqual((await caixaSql.lerCaixa(db, x.m)).caixa, 4, 'a caixa continua la para a entrega');
  });

  await test('[106 K3] metade positiva, material NOSSO: A1 com "Administrador ou Gestor"; o Gestor estorna 200; a entrega passa; sem ESTORNO_AJUSTE', async () => {
    const x = await montagem();
    const r = await ajuste(x.m, 0, x.A);
    assert.strictEqual(r.body.aviso_caixa, A1(x.codigo, 0, 4, `a requisição ${x.numero}`));
    const g = await estornar(r.body.id, 'GESTOR');
    assert.strictEqual(g.status, 200, JSON.stringify(g.body));
    assert.strictEqual(await total(x.m), 4);
    assert.strictEqual(await auditoriaEstorno(x.m), undefined);
    const e = await entregar(x.R, x.ids[0], 4);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
