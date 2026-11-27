/**
 * Etapa 269 (T1, item 18 — C485, B1386) — a entrega com a parte que falta em INSPECAO. Com a inspecao gravada pelo sistema (o item do
 * recebimento e o material), a conferencia do disponivel (E1) ja recusava antes de baixar, mas sem dizer que a parte que falta esta em
 * inspecao: a recusa ganha o sufixo (B1639). Com o dado antigo (a inspecao so no item do recebimento), a entrega saia "sem lote" e deixava
 * a linha negativa: a conferencia do automatico por lote (Etapa 206) passa a contar a inspecao do lote que pode sair (B1640).
 * Montagem: a da Etapa 206 (entregaLoteImpedido.api.test.js) — material com lote, requisicao gravada direto e separada sem origem.
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa269-lote-em-inspecao-e-lote-vencido.md (RN-269.01 a 05).
 *
 * Executar: cd server && node tests/api/entregaLoteEmInspecao.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 269', role: 'admin', is_superadmin: 1, email: 'a269@t.com' },
  S: { id: 26921, nome: 'Solic 269', role: 'user', email: 's269@t.com' },
  ALMOX: { id: 26922, nome: 'Almox 269', role: 'user', email: 'x269@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const tela = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const { fraseEntregaLoteImpedido: frase } = requisitionService;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Espioes (como na Etapa 206): a alcada de valor e a notificacao, pelo objeto do modulo — a entrega chama `valueApprovalService.verificarBloqueioLiberacao`.
const alcadas = [];
const verificarOriginal = valueApprovalService.verificarBloqueioLiberacao;
valueApprovalService.verificarBloqueioLiberacao = async (db, id) => { alcadas.push(Number(id)); return verificarOriginal(db, id); };
const notificados = [];
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };

(async () => {
  console.log('\n=== Etapa 269: entrega com o lote ainda em inspecao ===\n');
  assert.strictEqual(typeof frase, 'function', 'fraseEntregaLoteImpedido exportada');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM269', nome: 'Almox 269' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z269A-01'); const B01 = await loc('Z269B-01'); const P01 = await loc('Z269P-01');

  const material = async ({ lote = true, negativo = false } = {}) => {
    const c = `E269-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote ? 1 : 0, negativo ? 1 : 0, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e269', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 269' }));
  // requisicao gravada direto (APROVADO, sem reserva) — para varios itens do mesmo material
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E269-${++seq}`])).lastID;
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
  // inspecao no item do recebimento e, com `pool`, no material — como o recebimento grava (QUARENTENA + item); sem `pool` e o dado
  // antigo do C485 (o RN-206.15 c montava assim)
  const insp = async (m, lote, q, { pool = true } = {}) => {
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E269-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, ?, ?, ?, ?)`, [rec, m.id, q, q, lote ? await loteId(m, lote) : null, q]);
    if (pool) await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao, 0) + ? WHERE id = ?', [q, m.id]);
  };
  const L = (codigo, status, quantidade, data_validade = null) => ({ codigo, status, data_validade, quantidade });
  const e1 = (m, qtd, max, pend, disp) => `${m.nome}: não é possível entregar ${qtd} un. Máximo: ${max} (pendente: ${pend}, disponível: ${disp})`;
  const SUF_L1 = ' — 3 un em inspeção (lote L1) só saem depois de decidida a inspeção';
  const detalheEntregavel = async (R, itemId) => {
    const d = await ok(como('ALMOX').get(`${API}/requisicoes/${R}`));
    return Number((d.body.itens || []).find((x) => x.id === itemId).quantidade_entregavel);
  };
  const cenarioPool = async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await insp(m, 'L1', 3);
    return { m, R, ids };
  };

  await test('[RN-269.01] L1 4, 3 em inspecao (item + material): entregar 4 -> 400 com o sufixo da inspecao, nada baixado; detalhe 1; entregar 1 -> 200 de L1', async () => {
    const { m, R, ids } = await cenarioPool();
    assert.strictEqual(await detalheEntregavel(R, ids[0]), 1);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], `${e1(m, 4, 1, 4, 1)}${SUF_L1}`);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 1 }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 1]]);
    assert.strictEqual(await negativas(m), 0);
  });
  await test('[RN-269.01 servico] o mesmo pelo servico: recusa com o sufixo, nada baixado', async () => {
    const { m, R, ids } = await cenarioPool();
    const antes = await foto(R, m);
    await assert.rejects(requisitionService.entregarRequisicao(db, R, [{ item_id: ids[0], quantidade_atendida: 4 }], { ...USERS.ALMOX }),
      (e) => e.status === 400 && e.message === `${e1(m, 4, 1, 4, 1)}${SUF_L1}`);
    assert.deepStrictEqual(await foto(R, m), antes);
  });
  await test('[RN-269.02] inspecao sem lote no item -> sem o parentese; em dois lotes -> "(lotes L1 2, L2 1)"; lote e sem lote -> "(lote L1 2, sem lote 1)"', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await insp(m, null, 3);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], `${e1(m, 4, 1, 4, 1)} — 3 un em inspeção só saem depois de decidida a inspeção`);
    const m2 = await material();
    await entrar(m2, A01.id, 4, 'L1'); await entrar(m2, B01.id, 1, 'L2');
    const r2 = await reqDireta([[m2.id, 5]]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 5 }]);
    await insp(m2, 'L2', 1); await insp(m2, 'L1', 2);
    await recusa(r2.R, m2, [{ item_id: r2.ids[0], quantidade_atendida: 5 }],
      `${e1(m2, 5, 2, 5, 2)} — 3 un em inspeção (lotes L1 2, L2 1) só saem depois de decidida a inspeção`);
    const m3 = await material();
    await entrar(m3, A01.id, 4, 'L1');
    const r3 = await reqDireta([[m3.id, 4]]);
    await separar(r3.R, [{ item_id: r3.ids[0], quantidade_separada: 4 }]);
    await insp(m3, 'L1', 2); await insp(m3, null, 1);
    await recusa(r3.R, m3, [{ item_id: r3.ids[0], quantidade_atendida: 4 }],
      `${e1(m3, 4, 1, 4, 1)} — 3 un em inspeção (lote L1 2, sem lote 1) só saem depois de decidida a inspeção`);
  });
  await test('[RN-269.03] sem inspecao a E1 de antes, byte a byte; inspecao com o disponivel cobrindo -> 200, nenhuma recusa', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    // o fisico cai para 1 por baixo (a caixa nao tem reserva: a E1 recusa pelo disponivel, sem inspecao)
    await dbRun(db, "UPDATE estoque_saldo_almoxarifado SET quantidade = 1 WHERE material_id = ? AND lote_id IS NOT NULL", [m.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1 WHERE id = ?', [m.id]);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], e1(m, 4, 1, 4, 1));
    const m2 = await material();
    await entrar(m2, A01.id, 7, 'L1');
    const r2 = await reqDireta([[m2.id, 4]]);
    await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 4 }]);
    await insp(m2, 'L1', 3);
    await ok(entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]));
    assert.deepStrictEqual(await livro(r2.R, m2), [['SAIDA', null, 'L1', 4]]);
  });
  await test('[RN-269.03 b] o sufixo pela funcao pura: sem inspecao, disponivel cobrindo, disponivel negativo (E190 vence), sem unidade', async () => {
    const s = requisitionService.sufixoInspecaoNaEntrega;
    assert.strictEqual(typeof s, 'function', 'sufixoInspecaoNaEntrega exportada');
    const base = { disponivel_material: 1, em_inspecao: 3, permite_negativo: 0, reservado_para_item: 0 };
    assert.strictEqual(s('un', base, 1, 4, [{ codigo: 'L1', q: 3 }]), SUF_L1);
    assert.strictEqual(s('un', { ...base, em_inspecao: 0 }, 1, 4, []), '');
    assert.strictEqual(s('un', base, 1, 1, [{ codigo: 'L1', q: 3 }]), '');
    assert.strictEqual(s('un', { ...base, disponivel_material: -1 }, 0, 4, [{ codigo: 'L1', q: 3 }]), '');
    assert.strictEqual(s('', base, 1, 4, [{ codigo: 'L1', q: 3 }]), ' — 3 em inspeção (lote L1) só saem depois de decidida a inspeção');
  });
  await test('[RN-269.04] dois itens do mesmo material: o segundo, sem disponivel depois do primeiro, recusa com o sufixo; nada baixado', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }, { item_id: ids[1], quantidade_separada: 2 }]);
    await insp(m, 'L1', 3);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 1 }, { item_id: ids[1], quantidade_atendida: 2 }],
      `${e1(m, 2, 0, 2, 0)}${SUF_L1}`);
  });
  await test('[RN-269.05] o limite e o pendente, nao o disponivel: nenhum sufixo (decidir a inspecao nao muda o maximo)', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 1]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await insp(m, 'L1', 3);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], e1(m, 4, 1, 1, 1));
  });
  await test('[RN-269.07] o caminho da operacao: 1 livre + 3 recebidas em inspecao no L1; separa 1, entrega 1, a 2a rodada de 3 -> 400 com o sufixo', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    await insp(m, 'L1', 3); // as 3 que chegaram e ficaram em inspecao (o recebimento grava o item e o material)
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 1 }]));
    const antes = await foto(R, m);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${e1(m, 3, 0, 3, 0)}${SUF_L1}`);
    assert.deepStrictEqual(await foto(R, m), antes, "nada baixado na 2a rodada");
    assert.strictEqual(await detalheEntregavel(R, ids[0]), 0);
  });
  await test('[RN-269.06] dado antigo (inspecao so no item do recebimento): como antes — 200 (o C485 continua so para ele, B1640)', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await insp(m, 'L1', 3, { pool: false });
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }]));
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
