/**
 * Etapa 206 (T1/T2) — a entrega recusa lote impedido. Quando a parte AUTOMATICA da entrega de um material com controle de lote passa do que
 * os lotes elegiveis (e o saldo sem lote positivo) cobrem, e o material tem saldo em lote bloqueado, reprovado ou vencido, a entrega recusa
 * ANTES de baixar qualquer coisa (antes da alcada de valor), nomeando o lote, o motivo e quanto — antes ela saia "sem lote", a linha sem lote
 * ficava negativa e o lote ruim continuava cheio (C484). O detalhe e a fila passam a oferecer so o que da para entregar (RN-206.11).
 *
 * Montagem padrao: material COM controle de lote, nao critico, sem serie, unidade `un`; lotes por Entrada v2; status pela rota
 * `PUT /lotes/:id/status`; validade relativa a hoje; requisicao separada SEM origem antes de tornar o lote impedido (o caso que chega a
 * entrega). "Nada baixado" = livro vazio, retrato igual, entregue 0, status igual, nenhuma substituicao.
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa206-entrega-recusa-lote-impedido.md (T1, T2; Fase 2 manda).
 *
 * Executar: cd server && node tests/api/entregaLoteImpedido.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 206', role: 'admin', is_superadmin: 1, email: 'a206@t.com' },
  S: { id: 20621, nome: 'Solic 206', role: 'user', email: 's206@t.com' },
  ALMOX: { id: 20622, nome: 'Almox 206', role: 'user', email: 'x206@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
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
  console.log('\n=== Etapa 206: a entrega recusa lote impedido ===\n');
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM206', nome: 'Almox 206' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('Z206A-01'); const B01 = await loc('Z206B-01'); const P01 = await loc('Z206P-01');

  const material = async ({ lote = true, negativo = false } = {}) => {
    const c = `E206-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, c, lote ? 1 : 0, negativo ? 1 : 0, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, destino, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e206', localizacao_destino_id: destino, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const statusRota = async (m, codigo, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 206' }));
  // requisicao gravada direto (APROVADO, sem reserva) — para varios itens do mesmo material
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E206-${++seq}`])).lastID;
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
  const L = (codigo, status, quantidade, data_validade = null) => ({ codigo, status, data_validade, quantidade });

  // L1 ATIVO 2 em A, L2 3 na padrao; requisicao de 4 separada sem origem; depois L2 fica impedido (`tornar`)
  const montagem = async (tornar, opts = {}) => {
    const m = await material(opts);
    await entrar(m, A01.id, 2, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await tornar(m);
    return { m, R, ids };
  };
  const bloquearL2 = (m) => statusRota(m, 'L2', 'BLOQUEADO');

  // ── RN-206.01 / .02 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-206.01] L1 ATIVO 2, L2 BLOQUEADO 3, entrega de 4 -> 400 com a literal (faltam 2 un, L2 bloqueado 3 un), nada baixado', async () => {
    const { m, R, ids } = await montagem(bloquearL2);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }],
      `${m.nome}: não é possível entregar 4 un — faltam 2 un em lote que pode sair. Em lote impedido: L2 (bloqueado, 3 un). `
      + 'Libere o lote (mude o status ou libere o vencimento) ou entregue 2 un a menos.');
    assert.strictEqual(await negativas(m), 0);
  });
  await test('[RN-206.02] a mesma montagem, entrega de 2 -> 200, SAIDA L1 2, L2 3 intacto, nenhuma linha negativa', async () => {
    const { m, R, ids } = await montagem(bloquearL2);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L1', 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z206P-01/L2=3'], fisico: 3 });
  });

  // ── RN-206.03: vencido, reprovado, status primeiro, liberacao, dois lotes ──────────────────────────────────────────────────────
  await test('[RN-206.03 a] L2 ATIVO vencido ha 3 dias sem liberacao -> "L2 (vencido em DD/MM/AAAA, 3 un)"', async () => {
    const { m, R, ids } = await montagem(async (mm) => { await validade(mm, 'L1', dia(30)); await validade(mm, 'L2', dia(-3)); });
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], frase(m.nome, 4, 'un', 2, [L('L2', 'ATIVO', 3, dia(-3))]));
    assert.ok(r.body.error.includes(`L2 (vencido em ${tela(dia(-3))}, 3 un)`), r.body.error);
  });
  await test('[RN-206.03 b] L2 REPROVADO -> "L2 (reprovado, 3 un)"', async () => {
    const { m, R, ids } = await montagem((mm) => statusRota(mm, 'L2', 'REPROVADO'));
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], frase(m.nome, 4, 'un', 2, [L('L2', 'REPROVADO', 3)]));
    assert.ok(r.body.error.includes('L2 (reprovado, 3 un)'), r.body.error);
  });
  await test('[RN-206.03 c] L2 BLOQUEADO e vencido -> "bloqueado" (o status primeiro, a regua do motor)', async () => {
    const { m, R, ids } = await montagem(async (mm) => { await validade(mm, 'L2', dia(-3)); await bloquearL2(mm); });
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], frase(m.nome, 4, 'un', 2, [L('L2', 'BLOQUEADO', 3, dia(-3))]));
    assert.ok(r.body.error.includes('L2 (bloqueado, 3 un)') && !r.body.error.includes('vencido'), r.body.error);
  });
  await test('[RN-206.03 d] vencido COM liberacao -> 200, sai de L2 primeiro (vence antes) e de L1', async () => {
    const { m, R, ids } = await montagem(async (mm) => {
      await validade(mm, 'L1', dia(30)); await validade(mm, 'L2', dia(-3));
      await dbRun(db, 'UPDATE lotes_almoxarifado SET vencimento_liberado_em = CURRENT_TIMESTAMP WHERE id = ?', [await loteId(mm, 'L2')]);
    });
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 4 }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, 'L2', 3], ['SAIDA', null, 'L1', 1]]);
    assert.strictEqual(await negativas(m), 0);
  });
  await test('[RN-206.03 e] dois lotes impedidos -> os dois, na ordem de listarLotesDoMaterial (validade, nao o codigo), separados por ", "', async () => {
    const m = await material();
    await entrar(m, A01.id, 1, 'L1'); await entrar(m, P01.id, 3, 'L2'); await entrar(m, P01.id, 2, 'L3');
    await validade(m, 'L3', dia(60));
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    await bloquearL2(m); await statusRota(m, 'L3', 'REPROVADO');
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }],
      frase(m.nome, 4, 'un', 3, [L('L3', 'REPROVADO', 2, dia(60)), L('L2', 'BLOQUEADO', 3)]));
    assert.ok(r.body.error.includes('Em lote impedido: L3 (reprovado, 2 un), L2 (bloqueado, 3 un).'), r.body.error);
  });

  // ── RN-206.04: o sem lote positivo continua saindo (B1385) ─────────────────────────────────────────────────────────────────────
  const comSemLote = async (q) => {
    const m = await material({ lote: false });
    await entrar(m, P01.id, 2, null); // entrada com o controle desligado: a linha sem lote +2
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    await entrar(m, P01.id, 3, 'L2');
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z206P-01/-=2', 'Z206P-01/L2=3'], fisico: 5 }, 'premissa');
    const { R, ids } = await reqDireta([[m.id, q]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: q }]);
    await bloquearL2(m);
    return { m, R, ids };
  };
  await test('[RN-206.04] L2 BLOQUEADO 3 + sem lote +2: entrega de 2 -> 200, SAIDA sem lote 2, sem lote 0 (nao negativo)', async () => {
    const { m, R, ids } = await comSemLote(2);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 2]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z206P-01/L2=3'], fisico: 3 });
  });
  await test('[RN-206.04] a mesma montagem, entrega de 3 -> 400 "faltam 1 un"', async () => {
    const { m, R, ids } = await comSemLote(3);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 3 }], frase(m.nome, 3, 'un', 1, [L('L2', 'BLOQUEADO', 3)]));
  });

  // ── RN-206.05: sem controle de lote nada muda ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-206.05] material SEM controle_lote com saldo em lote bloqueado: a entrega continua sem lote (B204), L1 intacto, sem lote -3', async () => {
    const m = await material({ lote: false });
    await entrar(m, B01.id, 3, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await statusRota(m, 'L1', 'BLOQUEADO');
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', null, null, 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z206B-01/L1=3', 'Z206P-01/-=-3'], fisico: 0 });
  });

  // ── RN-206.07: a origem planejada em lote impedido (B1389) ────────────────────────────────────────────────────────────────────
  const planejada = async (comL2) => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A01.id, lote_id: await loteId(m, 'L1') }]);
    await statusRota(m, 'L1', 'BLOQUEADO');
    if (comL2) await entrar(m, B01.id, 4, 'L2');
    return { m, R, ids };
  };
  await test('[RN-206.07 a] separa 4 de (A, L1), L1 BLOQUEADO, L2 4 em B: um clique -> 400 com a literal de hoje (a origem nao serve mais), nada baixado', async () => {
    const { m, R, ids } = await planejada(true);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }],
      `${m.nome}: a origem da separação (Z206A-01) não serve mais (Lote L1 esta bloqueado e nao pode ser utilizado) — entregue escolhendo de onde sai`);
  });
  await test('[RN-206.07 b] o mesmo com origem_automatica -> 200, sai de L2, a substituicao registrada', async () => {
    const { m, R, ids } = await planejada(true);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 4, origem_automatica: true }]));
    assert.deepStrictEqual((await livro(R, m)).map((x) => [x[0], x[2], x[3]]), [['SAIDA', 'L2', 4]]);
    assert.strictEqual((await foto(R, m)).subs, 1);
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z206A-01/L1=4'], fisico: 4 });
  });
  await test('[RN-206.07 c] sem L2: origem_automatica -> 400 com a literal nova (L1 bloqueado, 4 un) e "nada sai deste material"', async () => {
    const { m, R, ids } = await planejada(false);
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4, origem_automatica: true }],
      frase(m.nome, 4, 'un', 4, [L('L1', 'BLOQUEADO', 4)]));
    assert.ok(r.body.error.endsWith('Libere o lote (mude o status ou libere o vencimento) ou nada sai deste material.'), r.body.error);
    assert.ok(r.body.error.includes('L1 (bloqueado, 4 un)'), r.body.error);
  });

  // ── RN-206.08: irmaos do mesmo material ───────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-206.08] dois itens, 2 e 3, L1 ATIVO 3, L2 BLOQUEADO 3 -> 400 no SEGUNDO item ("entregar 3 un — faltam 2 un"), nada baixado — nem o primeiro', async () => {
    const m = await material();
    await entrar(m, P01.id, 3, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }, { item_id: ids[1], quantidade_separada: 3 }]);
    await bloquearL2(m);
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 3 }],
      frase(m.nome, 3, 'un', 2, [L('L2', 'BLOQUEADO', 3)]));
    assert.ok(r.body.error.includes('entregar 3 un — faltam 2 un') && r.body.error.includes('entregue 2 un a menos'), r.body.error);
  });

  // Revisao "passaria com a feature quebrada?" (Fase 2 item 5): a falta e o TOTAL do material, com o PRIMEIRO item que cruza. Aqui o
  // primeiro item ja cruza (2 > 1) e a falta do material e 3 — com a falta do item a frase diria "faltam 1" e a pessoa reenviaria 3 (recusa de novo).
  await test('[RN-206.08b] dois itens, 2 e 2, L1 ATIVO 1, L2 BLOQUEADO 4 -> 400 no PRIMEIRO item com a falta do material ("entregar 2 un — faltam 3 un", "entregue 3 un a menos")', async () => {
    const m = await material();
    await entrar(m, P01.id, 1, 'L1'); await entrar(m, P01.id, 4, 'L2');
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }, { item_id: ids[1], quantidade_separada: 2 }]);
    await bloquearL2(m);
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 2 }],
      frase(m.nome, 2, 'un', 3, [L('L2', 'BLOQUEADO', 4)]));
    assert.ok(r.body.error.includes('entregue 3 un a menos'), r.body.error);
  });
  // Revisao "passaria com a feature quebrada?": o saldo do lote impedido na frase desconta o que esta EM INSPECAO no lote (a regua da 197).
  await test('[RN-206.01b] L2 BLOQUEADO 5 com 2 em inspecao no lote -> a frase diz "L2 (bloqueado, 3 un)"', async () => {
    const m = await material();
    await entrar(m, A01.id, 2, 'L1'); await entrar(m, P01.id, 5, 'L2');
    const { R, ids } = await reqDireta([[m.id, 4]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status) VALUES (?, 'CONFERIDO')", [`REC-E206-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
      lote_id, quantidade_em_inspecao) VALUES (?, ?, 5, 5, ?, 2)`, [rec, m.id, await loteId(m, 'L2')]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2 WHERE id = ?', [m.id]);
    await bloquearL2(m);
    const r = await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], frase(m.nome, 4, 'un', 2, [L('L2', 'BLOQUEADO', 3)]));
    assert.ok(r.body.error.includes('L2 (bloqueado, 3 un)'), r.body.error);
  });

  // ── RN-206.09: origem a mao no mesmo lote (Achado 2) ──────────────────────────────────────────────────────────────────────────
  await test('[RN-206.09] L1 ATIVO 4 em A, L2 BLOQUEADO 5: item 1 sai de (A, L1) 3 a mao, item 2 automatico 2 -> 400 no item 2 ("faltam 1 un")', async () => {
    const m = await material();
    await entrar(m, A01.id, 4, 'L1'); await entrar(m, P01.id, 5, 'L2');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }, { item_id: ids[1], quantidade_separada: 2 }]);
    await bloquearL2(m);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A01.id, lote_id: await loteId(m, 'L1') },
      { item_id: ids[1], quantidade_atendida: 2 }], frase(m.nome, 2, 'un', 1, [L('L2', 'BLOQUEADO', 5)]));
  });
  // Fase 2 item 1 (b): a entrega sai da origem guardada (o mesmo par) com mais que a parte — depois da passada 0 a guarda vira 0 e o livre do
  // lote e 1. Com o `new Map()` no lugar do `saiuSimulado`, a conferencia le a guarda inteira (2) e erra a falta.
  await test('[RN-206.09b (b)] caixa 4 com parte 2 em (A, L1), A/L1 5, L2 BLOQUEADO 3: item 1 sai de (A, L1) os 4, item 2 automatico 2 -> 400 "faltam 1 un"', async () => {
    const m = await material();
    await entrar(m, A01.id, 5, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const { R, ids } = await reqDireta([[m.id, 4], [m.id, 2]]);
    const l1 = await loteId(m, 'L1');
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A01.id, lote_id: l1 }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }, { item_id: ids[1], quantidade_separada: 2 }]);
    const it = await dbGet(db, 'SELECT quantidade_separada s, quantidade_origem_separacao p, origem_separacao_id o FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[0]]);
    assert.deepStrictEqual([Number(it.s), Number(it.p), Number(it.o)], [4, 2, A01.id], 'premissa: caixa 4, parte 2 em A');
    await bloquearL2(m);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4, localizacao_origem_id: A01.id, lote_id: l1 },
      { item_id: ids[1], quantidade_atendida: 2 }], frase(m.nome, 2, 'un', 1, [L('L2', 'BLOQUEADO', 3)]));
  });
  // Fase 2 item 1 (a): partir do `pedidoPorOrigem` contava em dobro a semeadura do "so lote" (a chave m|null|L soma os estritos) e recusava
  // o item 3, que a baixa cumpre — regressao.
  await test('[RN-206.09b (a), regressao] item 1 tira 2 de (A, L1) a mao + item 2 "so lote" L1 2 + item 3 automatico 1; L1 5, L2 BLOQUEADO 3 -> 200, nada negativo', async () => {
    const m = await material();
    await entrar(m, A01.id, 5, 'L1'); await entrar(m, P01.id, 3, 'L2');
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2], [m.id, 1]]);
    await separar(R, ids.map((id, i) => ({ item_id: id, quantidade_separada: [2, 2, 1][i] })));
    await bloquearL2(m);
    const l1 = await loteId(m, 'L1');
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A01.id, lote_id: l1 },
      { item_id: ids[1], quantidade_atendida: 2, lote_id: l1 }, { item_id: ids[2], quantidade_atendida: 1 }]));
    const lv = await livro(R, m);
    assert.ok(lv.every((x) => x[0] === 'SAIDA' && x[2] === 'L1'), JSON.stringify(lv));
    assert.strictEqual(lv.reduce((s, x) => s + x[3], 0), 5);
    assert.deepStrictEqual(await retrato(m), { linhas: ['Z206P-01/L2=3'], fisico: 3 });
  });

  // ── RN-206.10: precedencia e alcada ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-206.10 a] pedido acima do maximo do E1 -> a literal E1 de hoje, byte a byte (a nova nao aparece)', async () => {
    const { m, R, ids } = await montagem(bloquearL2);
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 5 }],
      `${m.nome}: não é possível entregar 5 un. Máximo: 4 (pendente: 4, disponível: 5)`);
  });
  // A alcada so reavalia sem nada separado nem entregue (Etapa 94) — e sem caixa o E1 ja recusa: pela entrega ela nunca grava hoje. O que a
  // RN fixa e a ORDEM (a conferencia antes de `verificarBloqueioLiberacao`, B464): o espiao prova que ela nem foi chamada.
  await test('[RN-206.10 b] alcada ligada (limite 0,01) na montagem da RN-206.01 -> 400 da literal nova, a alcada NAO e chamada, status igual, nenhuma notificacao', async () => {
    const { m, R, ids } = await montagem(bloquearL2);
    await cfg('liberacao_valor_ativo', '1'); await cfg('liberacao_valor_limite', '0.01'); await cfg('liberacao_valor_aprovadores', '[1]');
    try {
      const n0 = alcadas.length; const k0 = notificados.length;
      await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], frase(m.nome, 4, 'un', 2, [L('L2', 'BLOQUEADO', 3)]));
      assert.strictEqual(alcadas.length - n0, 0, 'a conferencia vem antes da alcada');
      assert.strictEqual(notificados.length - k0, 0);
      assert.notStrictEqual((await foto(R, m)).status, 'AGUARDANDO_APROVACAO_VALOR');
      // controle: a entrega que passa chama a alcada (o espiao funciona)
      await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }]));
      assert.strictEqual(alcadas.length - n0, 1, 'premissa: o espiao ve a alcada');
    } finally { await cfg('liberacao_valor_ativo', '0'); }
  });

  // ── RN-206.11: detalhe e fila batem com a porta (B1390) ───────────────────────────────────────────────────────────────────────
  // (a RN-206.06 bloqueada — 0 e 0 — e a segunda rodada com o lote impedido — caixa + tetoSeparavel — estao em loteImpedidoIntegracao)
  const detalhe = async (R) => (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens;
  const fila = async (R) => {
    const f = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((x) => Number(x.id) === Number(R));
    assert.ok(f, `a requisicao ${R} na fila`);
    return f.itens;
  };
  await test('[RN-206.11] montagem da RN-206.01: detalhe quantidade_entregavel 2 e saldo_entregavel 2; fila entregavel 2 — e a porta aceita os 2', async () => {
    const { R, ids } = await montagem(bloquearL2);
    const [d] = await detalhe(R);
    assert.deepStrictEqual([d.quantidade_entregavel, d.saldo_entregavel, d.lote_impedido], [2, 2, 3], JSON.stringify(d));
    const [f] = await fila(R);
    assert.strictEqual(f.entregavel, 2, JSON.stringify(f));
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: d.quantidade_entregavel }]));
  });
  await test('[RN-206.11 d] o negativo legado do C484 (sem lote -10 por SQL) com L1 BLOQUEADO 10: o entregavel e 0 (piso), nao -10', async () => {
    const m = await material();
    await entrar(m, P01.id, 10, 'L1');
    const { R } = await reqDireta([[m.id, 6]]);
    await separar(R, [{ item_id: (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id, quantidade_separada: 6 }]);
    await statusRota(m, 'L1', 'BLOQUEADO');
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, NULL, -10)', [m.id, P01.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual - 10 WHERE id = ?', [m.id]);
    const [d] = await detalhe(R);
    assert.deepStrictEqual([d.quantidade_entregavel, d.saldo_entregavel], [0, 0], JSON.stringify(d));
    const [f] = await fila(R);
    assert.strictEqual(f.entregavel, 0, JSON.stringify(f));
  });
  await test('[RN-206.11] sem lote impedido os numeros de hoje: primeira rodada 4/4 e fila 4; segunda rodada (caixa 4 + teto 3) 7/7 e fila 4', async () => {
    const m = await material();
    await entrar(m, P01.id, 5, 'L1');
    const { R, ids } = await reqDireta([[m.id, 10]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 4 }]);
    let [d] = await detalhe(R);
    assert.deepStrictEqual([d.quantidade_entregavel, d.saldo_entregavel, d.lote_impedido], [4, 4, 0], JSON.stringify(d));
    assert.strictEqual((await fila(R))[0].entregavel, 4);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 1 }]));
    await entrar(m, P01.id, 3, 'L2');
    [d] = await detalhe(R);
    // entregue 1, caixa 4, saldo 7: teto = tetoSeparacao(7, 0, 4, 0) = 3 -> saldo_entregavel 4 + 3; entregavel min(9, 7, 7)
    assert.deepStrictEqual([d.quantidade_entregavel, d.saldo_entregavel], [7, 7], JSON.stringify(d));
    assert.strictEqual((await fila(R))[0].entregavel, 4);
  });

  // ── RN-206.12: permite_saldo_negativo nao isenta (B1391) ──────────────────────────────────────────────────────────────────────
  await test('[RN-206.12] a RN-206.01 com permite_saldo_negativo = 1 -> o mesmo 400', async () => {
    const { m, R, ids } = await montagem(bloquearL2, { negativo: true });
    await recusa(R, m, [{ item_id: ids[0], quantidade_atendida: 4 }], frase(m.nome, 4, 'un', 2, [L('L2', 'BLOQUEADO', 3)]));
  });

  // ── Fase 5 (fix-round): R1 — o detalhe e a fila usam a regua da conferencia (a parte guardada de um irmao no lote bom) ───────────
  // L1 5 vencido na padrao, L2 3 em B; item 1 separado 3 de (B, L2), item 2 separado 3 sem origem. A conferencia desconta a guarda do
  // item 1 (lotesParaOAutomatico) e recusa os 3 do item 2; o detalhe e a fila descontavam so o lote impedido e ofereciam 3.
  await test('[RN-206.13] guarda do irmao no lote bom: detalhe e fila oferecem 0 ao item sem origem (a porta recusa) e 3 ao item guardado (a porta aceita)', async () => {
    const m = await material();
    await entrar(m, P01.id, 5, 'L1'); await entrar(m, B01.id, 3, 'L2');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L2') }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 3 }]);
    await validade(m, 'L1', dia(-1));
    const d = await detalhe(R);
    assert.deepStrictEqual(d.map((x) => [x.saldo_entregavel, x.quantidade_entregavel]), [[3, 3], [0, 0]], JSON.stringify(d));
    const f = await fila(R);
    assert.deepStrictEqual(f.map((x) => x.entregavel), [3, 0], JSON.stringify(f));
    // a porta: os 3 do item 2 recusam (o numero antigo da tela); os 3 do item 1 saem da guarda
    await recusa(R, m, [{ item_id: ids[1], quantidade_atendida: 3 }], frase(m.nome, 3, 'un', 3, [L('L1', 'ATIVO', 5, dia(-1))]));
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: d[0].saldo_entregavel }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'Z206B-01', 'L2', 3]]);
  });

  // ── Fase 5 (fix-round): R2 — a passada 2 desconta UMA vez a parte guardada do proprio item (ler antes = ler depois) ────────────────
  // B/L2 4, B sem lote 3; item 1 separado 3 de (B, L2), item 2 separado 3 sem origem. Entrega: item 1 2 (um clique), item 2 3 automatico.
  // A guarda do item 1 que fica e 1. A passada 2 lia a parte DEPOIS da baixa (min(parte, caixa) ja com o entregue novo = 1) e ainda tirava
  // o que saiu (2): via guarda 0, o automatico do item 2 levava 2 de B/L2 e a segunda entrega do item 1 tomava 400 "nao serve mais".
  const guardaDoProprio = async (comImpedido) => {
    const m = await material({ lote: false });
    await entrar(m, B01.id, 3, null); // sem lote +3 (controle desligado), depois o controle liga
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    await entrar(m, B01.id, 4, 'L2');
    if (comImpedido) await entrar(m, P01.id, 5, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: await loteId(m, 'L2') }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 3 }]);
    if (comImpedido) await validade(m, 'L1', dia(-1));
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 3, origem_automatica: true }]));
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'Z206B-01', 'L2', 2], ['SAIDA', 'Z206B-01', 'L2', 1], ['SAIDA', null, null, 2]]);
    const g = await dbGet(db, 'SELECT origem_separacao_id o, quantidade_origem_separacao p FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[0]]);
    assert.deepStrictEqual([Number(g.o), Number(g.p)], [B01.id, 1], 'a guarda do item 1 que fica');
    await ok(entregar(R, [{ item_id: ids[0], quantidade_atendida: 1 }]));
    assert.strictEqual(await negativas(m), 0);
    assert.deepStrictEqual(await retrato(m), { linhas: comImpedido ? ['Z206B-01/-=1', 'Z206P-01/L1=5'] : ['Z206B-01/-=1'], fisico: comImpedido ? 6 : 1 });
  };
  await test('[RN-206.14 a] guarda do proprio item na passada 2, com lote impedido: 200, a guarda que fica (1) nao e tomada, a segunda entrega do item 1 sai', () => guardaDoProprio(true));
  await test('[RN-206.14 b] o mesmo SEM lote impedido (o defeito era anterior a 206): 200 e a segunda entrega sai', () => guardaDoProprio(false));

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
