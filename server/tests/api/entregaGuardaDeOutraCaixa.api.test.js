/**
 * Etapa 273 (C485, a metade da outra caixa) — a entrega com o lote que falta na parte guardada da caixa de OUTRA requisicao nao deixa mais
 * linha "sem lote" negativa.
 *
 * Antes: L1 3 em A01 (guardadas pela R1) e 1 em B01; R2 separada sem origem; B01 bloqueada (ou a linha de B01 sem endereco) -> a entrega de
 * R2 respondia 200, a SAIDA ia "sem lote" e a linha sem lote ficava -1, com o L1 ainda com 4. O automatico pula a parte guardada das outras
 * caixas e as linhas do lote com guarda em prateleira bloqueada ou sem endereco; o que sobrava ia para o resto sem lote — e a conferencia
 * da 206 so recusava com lote impedido (B1386). Agora: falta sem lote impedido, com parte guardada de outra requisicao num lote do
 * material -> 400 E2 antes de qualquer baixa. Sem guarda de outra (a inspecao antiga, B1640): como antes.
 *
 * Cobre: RN-273.06 (as sondas da Fase 0 sem negativo), RN-273.07 (a recusa E2: prateleira bloqueada, linha sem endereco, parte que cabe,
 * pelo servico), RN-273.08 (o que cabe passa; o fluxo desbloquear -> entregar).
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa273-estorno-entrada-lote-e-guarda-de-outra-caixa.md
 * Executar: cd server && node tests/api/entregaGuardaDeOutraCaixa.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 273', role: 'admin', is_superadmin: 1, email: 'a273@t.com' },
  S: { id: 27321, nome: 'Solic 273', role: 'user', email: 's273@t.com' },
  ALMOX: { id: 27322, nome: 'Almox 273', role: 'user', email: 'x273@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
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

// Espioes (RN-206.10 b): a alcada de valor e a notificacao, pelo objeto do modulo — a entrega chama `valueApprovalService.verificarBloqueioLiberacao`.
const alcadas = [];
const verificarOriginal = valueApprovalService.verificarBloqueioLiberacao;
valueApprovalService.verificarBloqueioLiberacao = async (db, id) => { alcadas.push(Number(id)); return verificarOriginal(db, id); };
const notificados = [];
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };

(async () => {
  console.log('\n=== Etapa 273: a entrega com o lote na parte guardada de outra caixa (C485) ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM273', nome: 'Almox 273' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z273A-01'); const B01 = await loc('Z273B-01'); const P01 = await loc('Z273P-01');

  const material = async ({ lote = true, negativo = false } = {}) => {
    const c = `E273-${++seq}`;
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
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E273-${++seq}`])).lastID;
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
    return { m, l1, R1: a.R, R2: b.R, item: b.ids[0], n1: await numero(a.R) };
  };

  // ---------------------------------------------------------------- RN-273.06 (as sondas da Fase 0)
  await test('[RN-273.06 a] a R1 guarda o L1 inteiro: a R2 nem separa (disponivel 0) — nenhum negativo nasce', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const l1 = await loteId(m, 'L1');
    const a = await reqDireta([[m.id, 4]]);
    await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 4, localizacao_origem_id: A01.id, lote_id: l1 }]);
    const b = await reqDireta([[m.id, 2]]);
    const s = await como('ALMOX').put(`${API}/requisicoes/${b.R}/separacao`, { itens_separados: [{ item_id: b.ids[0], quantidade_separada: 2 }] });
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.ok(s.body.error.startsWith(`${m.nome}: não é possível separar 2 un. Máximo: 0`), s.body.error);
    assert.strictEqual(await negativas(m), 0);
  });
  await test('[RN-273.06 b] R2 separada antes, R1 guarda depois, Transferencia de 2 do L1: a entrega da R2 sai do que nao esta guardado', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const l1 = await loteId(m, 'L1');
    const b = await reqDireta([[m.id, 2]]);
    await separar(b.R, [{ item_id: b.ids[0], quantidade_separada: 2 }]);
    const a = await reqDireta([[m.id, 2]]);
    await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 2, localizacao_origem_id: A01.id, lote_id: l1 }]);
    await ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: 2, motivo: 't273',
      localizacao_origem_id: A01.id, localizacao_destino_id: B01.id, lote_id: l1 }), 201);
    await ok(entregar(b.R, [{ item_id: b.ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await livro(b.R, m), [['SAIDA', 'Z273B-01', 'L1', 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z273A-01/L1=2'], fisico: 2 });
  });
  await test('[RN-273.06 c] R2 separou 1 de 2, R1 guarda 3 do L1 4: a entrega de 2 da R2 -> 400 E1 antes de baixar', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const l1 = await loteId(m, 'L1');
    const b = await reqDireta([[m.id, 2]]);
    await separar(b.R, [{ item_id: b.ids[0], quantidade_separada: 1 }]);
    const a = await reqDireta([[m.id, 3]]);
    await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    await recusa(b.R, m, [{ item_id: b.ids[0], quantidade_atendida: 2 }],
      `${m.nome}: não é possível entregar 2 un. Máximo: 1 (pendente: 2, disponível: 4)`);
  });

  // ---------------------------------------------------------------- RN-273.07 (a recusa E2)
  await test('[RN-273.07 bloqueada] o resto do L1 em prateleira bloqueada -> 400 E2 (nada sai), nada baixado, nenhum negativo', async () => {
    const { m, R2, item, n1 } = await montar();
    await bloquearLoc(B01, 1);
    try {
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [n1], true));
      assert.strictEqual(await negativas(m), 0);
    } finally { await bloquearLoc(B01, 0); }
  });
  await test('[RN-273.07 automatico] o mesmo com origem_automatica -> 400 E2', async () => {
    const { m, R2, item, n1 } = await montar();
    await bloquearLoc(B01, 1);
    try {
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 1, origem_automatica: true }], E2(m.nome, 1, 1, ['L1'], [n1], true));
    } finally { await bloquearLoc(B01, 0); }
  });
  await test('[RN-273.07 sem endereco] o resto do L1 numa linha sem endereco -> 400 E2', async () => {
    const { m, R2, item, n1 } = await montar();
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET localizacao_id = NULL WHERE material_id = ? AND localizacao_id = ?', [m.id, B01.id]);
    await recusa(R2, m, [{ item_id: item, quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [n1], true));
  });
  await test('[RN-273.07 parte] R2 pede 2, o L2 cobre 1: -> 400 E2 "entregue 1 un a menos"; entregar 1 -> 200 do L2', async () => {
    const { m, R2, item, n1 } = await montar({ q: 2, l2: 1 });
    await bloquearLoc(B01, 1);
    try {
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 2 }], E2(m.nome, 2, 1, ['L1'], [n1], false));
      await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
      assert.deepStrictEqual(await livro(R2, m), [['SAIDA', null, 'L2', 1]]);
      assert.strictEqual(await negativas(m), 0);
    } finally { await bloquearLoc(B01, 0); }
  });
  await test('[RN-273.07 impedido vazio] com um L3 bloqueado todo em inspecao (registro antigo, nada a liberar): ainda E2', async () => {
    const { m, R2, item, n1 } = await montar();
    await entrar(m, P01.id, 2, 'L3');
    await statusRota(m, 'L3', 'BLOQUEADO');
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E273-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 2, 2, ?, 2)`, [rec, m.id, await loteId(m, 'L3')]);
    await bloquearLoc(B01, 1);
    try {
      await recusa(R2, m, [{ item_id: item, quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [n1], true));
    } finally { await bloquearLoc(B01, 0); }
  });
  await test('[RN-273.09 a propria] a guarda de um item DESTA requisicao que fica (item 1 3 de (A01, L1), so o item 2 entrega 1) -> E2 com o numero dela', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, B01.id, 1, 'L1');
    const l1 = await loteId(m, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 1]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 1 }]);
    await bloquearLoc(B01, 1);
    try {
      await recusa(R, m, [{ item_id: ids[1], quantidade_atendida: 1 }], E2(m.nome, 1, 1, ['L1'], [await numero(R)], true));
      // a metade positiva: o item 1 entrega a propria caixa (3 de A01) -> 200
      const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    } finally { await bloquearLoc(B01, 0); }
    assert.strictEqual(await negativas(m), 0);
  });
  await test('[RN-273.09 B1640] a guarda da propria que SAI inteira nesta entrega nao conta: com a falta vinda da inspecao antiga -> 200 como antes', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, B01.id, 1, 'L1');
    const l1 = await loteId(m, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 1]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 1 }]);
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E273-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 1, 1, ?, 1)`, [rec, m.id, l1]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }, { item_id: ids[1], quantidade_atendida: 1 }]));
  });
  await test('[RN-273.09 Fase 5] guarda da R1 num lote SEM prateleira bloqueada nem linha sem endereco; a falta vem da inspecao antiga do L2 -> 200 como antes (B1640)', async () => {
    const m = await material();
    await entrar(m, A01.id, 3, 'L1'); await entrar(m, P01.id, 1, 'L2');
    const l1 = await loteId(m, 'L1');
    const a = await reqDireta([[m.id, 3]]);
    await separar(a.R, [{ item_id: a.ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id, lote_id: l1 }]);
    const b = await reqDireta([[m.id, 1]]);
    await separar(b.R, [{ item_id: b.ids[0], quantidade_separada: 1 }]);
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E273-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 1, 1, ?, 1)`, [rec, m.id, await loteId(m, 'L2')]);
    await ok(entregar(b.R, [{ item_id: b.ids[0], quantidade_atendida: 1 }]));
  });
  await test('[RN-273.07 servico] pelo servico (entregarRequisicao): 400 E2', async () => {
    const { m, R2, item, n1 } = await montar();
    await bloquearLoc(B01, 1);
    let erro = null;
    try {
      await requisitionService.entregarRequisicao(db, R2, [{ item_id: item, quantidade_atendida: 1 }], { ...USERS.ALMOX }, null);
    } catch (e) { erro = e; } finally { await bloquearLoc(B01, 0); }
    assert.ok(erro, 'esperava a recusa');
    assert.deepStrictEqual([erro.status, erro.message], [400, E2(m.nome, 1, 1, ['L1'], [n1], true)]);
    assert.strictEqual(await negativas(m), 0);
  });

  // ---------------------------------------------------------------- RN-273.08
  await test('[RN-273.08 controle] B01 livre: a entrega da R2 sai de B01 (L1), sem negativo', async () => {
    const { m, R2, item } = await montar();
    await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
    assert.deepStrictEqual(await livro(R2, m), [['SAIDA', 'Z273B-01', 'L1', 1]]);
    assert.strictEqual(await negativas(m), 0);
  });
  await test('[RN-273.08 fluxo] recusa com B01 bloqueada -> desbloquear B01 -> a R2 entrega de B01 -> a R1 entrega a caixa de A01', async () => {
    const { m, R1, R2, item } = await montar();
    await bloquearLoc(B01, 1);
    const r = await entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]);
    await bloquearLoc(B01, 0);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    await ok(entregar(R2, [{ item_id: item, quantidade_atendida: 1 }]));
    const i1 = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R1])).id;
    await ok(entregar(R1, [{ item_id: i1, quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await livro(R1, m), [['SAIDA', 'Z273A-01', 'L1', 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
