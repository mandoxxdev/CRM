/**
 * Etapa 197 (T2) — integracao cruzando T0 (a parte automatica da entrega baixa do lote que vence primeiro, uma SAIDA por lote) e
 * T1 (a fila diz `controle_lote`), ponta a ponta, e os gestos que vem depois da entrega: devolucao citando uma saida por lote,
 * estorno pelo livro, exclusao da requisicao. Cada cenario confere o livro, o retrato das linhas de saldo, o resumo da tela de Lotes,
 * o relatorio Saldo por lote e o extrato (rastreio do lote: o movimento do lote leva a requisicao).
 *
 * Cada cenario tem o CONTROLE "sem a feature": o mesmo fluxo com material SEM controle_lote da os numeros de antes (a parte
 * automatica sai sem lote e a linha sem lote fica negativa) — a diferenca vem da regra, nao do cenario.
 *
 * Validades RELATIVAS a hoje. Usuarios reais por header (molde da 196 T5 e do T0 desta etapa).
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa197-entrega-automatica-pelo-lote.md (T2).
 *
 * Executar: cd server && node tests/api/entregaAutomaticaPeloLoteIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 197i', role: 'admin', is_superadmin: 1, email: 'a197i@t.com' },
  S: { id: 19731, nome: 'Solic 197i', role: 'user', email: 's197i@t.com' },
  ALMOX: { id: 19732, nome: 'Almox 197i', role: 'user', email: 'x197i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 197 (T2): integracao — entrega automatica pelo lote, devolucao, estorno, exclusao ===\n');

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
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM197I', nome: 'Almox 197 I' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('WB-01'); const P01 = await loc('WP-01');

  const material = async ({ lote = true } = {}) => {
    const c = `E197I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, ?)`,
    [c, c, lote ? 1 : 0, P01.id])).lastID;
    return { id, nome: c, codigo: c };
  };
  const entrar = async (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id,
    tipo: 'ENTRADA', quantidade: q, motivo: 'e197i', localizacao_destino_id: destino, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-197I',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    await ok(como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}));
    return { R: cr.body.id, ids };
  };
  const separar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas }));
  const entregar = (R, linhas) => ok(como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas }));
  const excluir = (R) => ok(como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'e197i' }));
  const itemDaFila = async (R) => {
    const f = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((x) => x.id === R);
    assert.ok(f, `requisicao ${R} na fila`);
    return f.itens[0];
  };

  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
        WHERE s.material_id = ? ORDER BY l.codigo, lt.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc}/${x.lote || '-'}=${Number(x.q)}`),
      fisico: Number(fis.q),
    };
  };
  // o livro da requisicao: [tipo, endereco, lote, quantidade]
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, l.codigo as loc, lt.codigo as lote, mv.quantidade q
      FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = COALESCE(mv.localizacao_origem_id, mv.localizacao_destino_id)
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.loc || null, x.lote || null, Number(x.q)]);
  const resumo = async (m) => (await ok(como('ADMIN').get(`${API}/materiais/${m.id}/lotes/resumo`))).body;
  // relatorio Saldo por lote, so as linhas do material: [lote (ou o rotulo da linha sem lote), quantidade]
  const relatorio = async (m) => (await ok(como('ADMIN').get(`${API}/relatorios/saldo-por-lote`))).body
    .filter((x) => x.material_codigo === m.codigo).map((x) => [x.lote, Number(x.quantidade)]);
  // rastreio do lote pelo extrato do material: os movimentos daquele lote, com a requisicao de cada um
  const rastreio = async (m, loteCod) => {
    const lid = await loteId(m, loteCod);
    const ex = (await ok(como('ADMIN').get(`${API}/materiais/${m.id}/extrato`))).body;
    return ex.movimentacoes.filter((x) => x.lote_id === lid).map((x) => [x.tipo, Number(x.quantidade), x.requisicao_id || null]).reverse();
  };
  // o extrato bate com o fisico: o saldo_posterior do ultimo movimento e o fisico do material
  const extratoBate = async (m) => {
    const ex = (await ok(como('ADMIN').get(`${API}/materiais/${m.id}/extrato`))).body;
    assert.strictEqual(Number(ex.movimentacoes[0].saldo_posterior), Number(ex.material.quantidade_atual),
      `extrato x fisico: ${JSON.stringify(ex.movimentacoes[0])}`);
    const somaLinhas = ex.saldos_localizacao.reduce((a, s) => a + Number(s.quantidade || 0), 0);
    assert.ok(Math.abs(somaLinhas - Number(ex.material.quantidade_atual)) < 1e-9, `linhas ${somaLinhas} != fisico ${ex.material.quantidade_atual}`);
  };

  // ── Pela rota: o fluxo inteiro ──────────────────────────────────────────────────────────────────────────────────────────────
  // L1 3 em WB-01 (vence em +5). Requisicao de 8, aprovada com 3 (reserva 3). Fila -> pegar_em WB-01/L1 3, controle_lote true.
  // 1a rodada do par sugerido (3). Chegam L2 1 (+20) e L3 4 (+45) na padrao WP-01. Fila -> PLANEJADA_NAO_COBRE. 2a rodada sem
  // "Sai de" (5). Entrega de um clique (8): WB-01/L1 3 estrita (o excedente sem reserva sai primeiro: 3 dos 5) + o automatico em dois
  // pedacos — excedente 2 (L2 1 + L3 1, dividido dentro do pedaco) e reserva 3 (L3 3).
  const fluxoRota = async ({ lote }) => {
    const m = await material({ lote });
    await entrar(m, B01.id, 3, 'L1');
    await validade(m, 'L1', dia(5));
    const { R, ids } = await req([[m.id, 8]]);
    const it1 = await itemDaFila(R);
    assert.strictEqual(it1.controle_lote, lote, 'T1: a fila diz se o material controla lote');
    assert.deepStrictEqual([it1.pegar_em.localizacao_codigo, it1.pegar_em.lote_codigo, it1.pegar_em.quantidade_sugerida],
      ['WB-01', 'L1', 3]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: it1.pegar_em.quantidade_sugerida,
      localizacao_origem_id: it1.pegar_em.localizacao_id, lote_id: it1.pegar_em.lote_id }]);
    await entrar(m, P01.id, 1, 'L2'); await entrar(m, P01.id, 4, 'L3');
    await validade(m, 'L2', dia(20)); await validade(m, 'L3', dia(45));
    const it2 = await itemDaFila(R);
    assert.deepStrictEqual([it2.controle_lote, it2.pegar_em_aviso, it2.origem_separacao_codigo], [lote, 'PLANEJADA_NAO_COBRE', 'WB-01']);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 5 }]);
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['WB-01/L1=3', 'WP-01/L2=1', 'WP-01/L3=4'], fisico: 8 }, 'premissa');
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 8 }]);
    return { m, R, ids, antes };
  };
  const saidaDoLote = async (R, m, cod, q) => dbGet(db, `SELECT id, quantidade FROM movimentacoes_almoxarifado
    WHERE requisicao_id = ? AND tipo = 'SAIDA' AND lote_id = ? AND quantidade = ?`, [R, await loteId(m, cod), q]);
  const saidaSemLote = async (R, q) => dbGet(db, `SELECT id, quantidade FROM movimentacoes_almoxarifado
    WHERE requisicao_id = ? AND tipo = 'SAIDA' AND lote_id IS NULL AND quantidade = ?`, [R, q]);
  const devolver = async (m, saidaId, q) => {
    await ok(como('ADMIN').post(`${API}/devolucoes`, { material_id: m.id, quantidade: q, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
      movimentacao_saida_id: saidaId, localizacao_id: P01.id }), 201);
    return dbGet(db, `SELECT mv.id, lt.codigo lote, mv.quantidade q FROM movimentacoes_almoxarifado mv LEFT JOIN lotes_almoxarifado lt
      ON lt.id = mv.lote_id WHERE mv.material_id = ? AND mv.tipo = 'ENTRADA_DEVOLUCAO' ORDER BY mv.id DESC LIMIT 1`, [m.id]);
  };
  const MSG_ESTORNO_REQ = 'Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)';
  const estornar = (id, st) => ok(como('ADMIN').post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'e197i estorno' }), st);

  await test('[T2 rota] fila (controle_lote, pegar_em, PLANEJADA_NAO_COBRE) -> entrega de um clique: WB-01/L1 3 estrita + L2 1 + L3 1 + L3 3 (FEFO, uma SAIDA por lote e pedaco); resumo sem_lote 0; relatorio sem linha nao zero; rastreio de L2 mostra a requisicao; extrato bate', async () => {
    const { m, R } = await fluxoRota({ lote: true });
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'WB-01', 'L1', 3], ['SAIDA', null, 'L2', 1], ['SAIDA', null, 'L3', 1],
      ['SAIDA', null, 'L3', 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
    assert.deepStrictEqual(await resumo(m), { fisico: 0, soma_lotes: 0, sem_lote_atribuido: 0 });
    assert.deepStrictEqual((await relatorio(m)).filter(([, q]) => Math.abs(q) > 1e-9), [], 'nenhuma linha nao zero no relatorio');
    assert.deepStrictEqual(await rastreio(m, 'L2'), [['ENTRADA', 1, null], ['SAIDA', 1, R]]);
    await extratoBate(m);
  });

  await test('[T2 rota, controle sem a feature] o mesmo fluxo com material SEM controle_lote: o automatico sai sem lote (2 + 3); L2 1 e L3 4 intactos, sem lote -5; resumo e relatorio mostram o -5; o lote nao ve a requisicao', async () => {
    const { m, R } = await fluxoRota({ lote: false });
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'WB-01', 'L1', 3], ['SAIDA', null, null, 2], ['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WP-01/-=-5', 'WP-01/L2=1', 'WP-01/L3=4'], fisico: 0 });
    assert.deepStrictEqual(await resumo(m), { fisico: 0, soma_lotes: 5, sem_lote_atribuido: -5 });
    const rel = await relatorio(m);
    assert.ok(rel.some(([, q]) => q === -5), `o relatorio mostra o -5: ${JSON.stringify(rel)}`);
    assert.deepStrictEqual(await rastreio(m, 'L2'), [['ENTRADA', 1, null]]);
    await extratoBate(m);
  });

  await test('[T2 rota] devolucao de 1 citando a SAIDA de L3 (3) volta ao L3; o estorno pelo livro da SAIDA de L2 recusa (vinculada a requisicao); a exclusao devolve cada saida ao seu lote, liquida da devolucao: saldos = os de antes da entrega', async () => {
    const { m, R, antes } = await fluxoRota({ lote: true });
    const s3 = await saidaDoLote(R, m, 'L3', 3);
    const dv = await devolver(m, s3.id, 1);
    assert.deepStrictEqual([dv.lote, Number(dv.q)], ['L3', 1]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WP-01/L3=1'], fisico: 1 });
    const s2 = await saidaDoLote(R, m, 'L2', 1);
    const e = await estornar(s2.id, 400);
    assert.strictEqual(e.body.error, MSG_ESTORNO_REQ);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WP-01/L3=1'], fisico: 1 }, 'o estorno recusado nao mexeu');
    await excluir(R);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'WB-01', 'L1', 3], ['SAIDA', null, 'L2', 1], ['SAIDA', null, 'L3', 1],
      ['SAIDA', null, 'L3', 3], ['ENTRADA', 'WB-01', 'L1', 3], ['ENTRADA', null, 'L2', 1], ['ENTRADA', null, 'L3', 1],
      ['ENTRADA', null, 'L3', 2]], 'a saida de L3 3: 3 menos o 1 ja devolvido');
    assert.deepStrictEqual(await retrato(m), antes);
    assert.deepStrictEqual(await resumo(m), { fisico: 8, soma_lotes: 8, sem_lote_atribuido: 0 });
    assert.deepStrictEqual(await rastreio(m, 'L3'), [['ENTRADA', 4, null], ['SAIDA', 1, R], ['SAIDA', 3, R], ['ENTRADA_DEVOLUCAO', 1, null],
      ['ENTRADA', 1, R], ['ENTRADA', 2, R]]);
    await extratoBate(m);
  });

  await test('[T2 rota, controle sem a feature] o mesmo com material SEM controle_lote: a devolucao citando a SAIDA sem lote volta sem lote; a exclusao zera o -5 sem tocar L2/L3', async () => {
    const { m, R, antes } = await fluxoRota({ lote: false });
    const s = await saidaSemLote(R, 3);
    const dv = await devolver(m, s.id, 1);
    assert.deepStrictEqual([dv.lote, Number(dv.q)], [null, 1]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WP-01/-=-4', 'WP-01/L2=1', 'WP-01/L3=4'], fisico: 1 });
    await excluir(R);
    assert.deepStrictEqual(await retrato(m), antes);
    assert.deepStrictEqual(await resumo(m), { fisico: 8, soma_lotes: 8, sem_lote_atribuido: 0 });
    await extratoBate(m);
  });

  await test('[T2 rota] estorno pelo livro da DEVOLUCAO (ENTRADA_DEVOLUCAO de L3) tira do L3; a devolucao morre e a exclusao devolve a saida de L3 inteira: saldos = os de antes', async () => {
    const { m, R, antes } = await fluxoRota({ lote: true });
    const s3 = await saidaDoLote(R, m, 'L3', 3);
    const dv = await devolver(m, s3.id, 1);
    await estornar(dv.id, 200);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
    await excluir(R);
    assert.deepStrictEqual((await livro(R, m)).slice(4), [['ENTRADA', 'WB-01', 'L1', 3], ['ENTRADA', null, 'L2', 1],
      ['ENTRADA', null, 'L3', 1], ['ENTRADA', null, 'L3', 3]]);
    assert.deepStrictEqual(await retrato(m), antes);
    assert.deepStrictEqual(await resumo(m), { fisico: 8, soma_lotes: 8, sem_lote_atribuido: 0 });
    await extratoBate(m);
  });

  await test('[T2 rota, controle sem a feature] o mesmo com material SEM controle_lote: o estorno da devolucao tira da linha sem lote (-5 de novo) e a exclusao zera; L2/L3 intactos', async () => {
    const { m, R, antes } = await fluxoRota({ lote: false });
    const s = await saidaSemLote(R, 3);
    const dv = await devolver(m, s.id, 1);
    await estornar(dv.id, 200);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WP-01/-=-5', 'WP-01/L2=1', 'WP-01/L3=4'], fisico: 0 });
    await excluir(R);
    assert.deepStrictEqual(await retrato(m), antes);
    await extratoBate(m);
  });

  // ── Pelo servico: reserva parcial (RN-197.07) + dois lotes (RN-197.02) ─────────────────────────────────────────────────────────
  // L1 3 em WB-01 (+5), L2 1 em WP-01 (+45). Requisicao de 6 aprovada com 4 (reserva 4); chegam mais 2 de L2 (excedente 2).
  // separarRequisicao 6 sem origem + entregarRequisicao 6 + excluirRequisicao, direto.
  const fluxoServico = async ({ lote }) => {
    const m = await material({ lote });
    await entrar(m, B01.id, 3, 'L1'); await entrar(m, P01.id, 1, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const { R, ids } = await req([[m.id, 6]]);
    const rz = await dbGet(db, "SELECT id, quantidade FROM reservas_material_almoxarifado WHERE item_requisicao_id = ? AND status = 'ATIVA'", [ids[0]]);
    assert.strictEqual(Number(rz.quantidade), 4, 'premissa: reserva parcial 4');
    await entrar(m, P01.id, 2, 'L2');
    const antes = await retrato(m);
    assert.deepStrictEqual(antes, { linhas: ['WB-01/L1=3', 'WP-01/L2=3'], fisico: 6 }, 'premissa');
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids[0], quantidade_separada: 6 }], { ...USERS.ADMIN });
    await requisitionService.entregarRequisicao(db, R, [{ item_id: ids[0], quantidade_atendida: 6 }], { ...USERS.ADMIN });
    const saidas = await dbAll(db, `SELECT lt.codigo lote, mv.quantidade q, mv.reserva_id FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id WHERE mv.requisicao_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [R]);
    const rz2 = await dbGet(db, 'SELECT quantidade_utilizada u FROM reservas_material_almoxarifado WHERE id = ?', [rz.id]);
    const mat = await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return { m, R, ids, antes, rz, saidas: saidas.map((x) => [x.lote, Number(x.q), x.reserva_id === rz.id ? 'R' : (x.reserva_id || null)]),
      utilizada: Number(rz2.u), reservada: Number(mat.q || 0) };
  };

  await test('[T2 servico, RN-197.07 + .02] reserva 4 + excedente 2, L1 3 e L2 3: excedente L1 2; reserva L1 1 + L2 3; reserva 4/4; nenhuma linha sem lote; exclusao devolve por lote (L1 na padrao, D (51))', async () => {
    const { m, R, saidas, utilizada, reservada } = await fluxoServico({ lote: true });
    assert.deepStrictEqual(saidas, [['L1', 2, null], ['L1', 1, 'R'], ['L2', 3, 'R']]);
    assert.deepStrictEqual([utilizada, reservada], [4, 0]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
    assert.deepStrictEqual(await resumo(m), { fisico: 0, soma_lotes: 0, sem_lote_atribuido: 0 });
    await requisitionService.excluirRequisicao(db, R, { ...USERS.ADMIN }, 'e197i', null);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 2], ['SAIDA', null, 'L1', 1], ['SAIDA', null, 'L2', 3],
      ['ENTRADA', null, 'L1', 2], ['ENTRADA', null, 'L1', 1], ['ENTRADA', null, 'L2', 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WP-01/L1=3', 'WP-01/L2=3'], fisico: 6 },
      'o lote volta inteiro; o endereco da saida automatica e a padrao (D (51))');
    assert.deepStrictEqual(await resumo(m), { fisico: 6, soma_lotes: 6, sem_lote_atribuido: 0 });
    await extratoBate(m);
  });

  await test('[T2 servico, controle sem a feature] o mesmo com material SEM controle_lote: excedente 2 + reserva 4 sem lote; L1 3 e L2 3 intactos, sem lote -6; exclusao zera o -6', async () => {
    const { m, R, antes, saidas, utilizada, reservada } = await fluxoServico({ lote: false });
    assert.deepStrictEqual(saidas, [[null, 2, null], [null, 4, 'R']]);
    assert.deepStrictEqual([utilizada, reservada], [4, 0]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['WB-01/L1=3', 'WP-01/-=-6', 'WP-01/L2=3'], fisico: 0 });
    assert.deepStrictEqual(await resumo(m), { fisico: 0, soma_lotes: 6, sem_lote_atribuido: -6 });
    await requisitionService.excluirRequisicao(db, R, { ...USERS.ADMIN }, 'e197i', null);
    assert.deepStrictEqual(await retrato(m), antes);
    await extratoBate(m);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
