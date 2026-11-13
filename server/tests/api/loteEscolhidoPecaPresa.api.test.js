/**
 * Etapa 218 (T0) — o lote escolhido a mao ("Sai de") deixa de fora a peca presa no lote (C513; B1443-B1451).
 *
 * Com lote escolhido na separacao ou na entrega, alem do fisico do par: pode sair = MAX(0, saldo_L - inspecao_L - retido_L) - guardado_L
 * - ja pedido_L. So quando o lote tem peca presa (retido + inspecao > folga), material com controle de lote e sem serie (B1443/B1445).
 * O retido e o da 217 (`retidoDoLote`). A janela (`GET /estoque/:id/saldos`) ganha `lote_livre`, `lote_bloqueado`, `lote_inspecao`.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa218-lote-escolhido-desconta-peca-presa.md
 * Executar: cd server && node tests/api/loteEscolhidoPecaPresa.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const returnService = require('../../services/almoxarifado/returnService');
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 218', role: 'admin', is_superadmin: 1, email: 'a218@t.com' },
  SOL: { id: 21831, nome: 'Solic 218', email: 's218@t.com' },
  ALMOX: { id: 21832, nome: 'Almox 218', role: 'user', email: 'x218@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const ADMIN = USERS.ADMIN;
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const PRESA = 'nele (quarentena, reprovação na inspeção ou com terceiro)';
const CONSELHO_SEP = 'Escolha outro lote ou separe menos';
const CONSELHO_ENT = 'Escolha outro lote ou deixe "Qualquer endereço (automático)"';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 218 (T0): o lote escolhido a mao deixa de fora a peca presa ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || ADMIN) }); next(); });
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

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM218', nome: 'Almox 218' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('Z218-B01'); const P01 = await loc('Z218-P01');

  const material = async ({ lote = 1, serie = 0 } = {}) => {
    const c = `E218-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, ?, ?)`, [c, c, lote, serie, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote, destino = P01.id) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e218', localizacao_destino_id: destino, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const sair = async (m, q, codigo, origem = P01.id) => {
    await ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q, motivo: 'e218',
      justificativa: 'teste 218', localizacao_origem_id: origem, lote_id: await loteId(m, codigo) }), 201);
    return dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC", [m.id]);
  };
  // quarentena de q pecas do lote: sai q do lote e volta para Quarentena citando a saida (o BLOQUEIO herda o lote, Etapa 209)
  const quarentena = async (m, q, codigo, local = P01.id) => {
    const s = await sair(m, q, codigo, local);
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: q, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: s.id, localizacao_id: local });
  };
  const inspecionar = async (m, codigo, aprovada, reprovada, destino = P01.id) => {
    const q = aprovada + reprovada;
    await entrar(m, q, codigo, destino);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'QUARENTENA', quantidade: q, motivo: 'e218' });
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-218-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, ?, ?, ?, ?)`, [rec, m.id, q, q, await loteId(m, codigo), q])).lastID;
    await inspectionService.decidirInspecao(db, ADMIN, item, { quantidade_aprovada: aprovada, quantidade_reprovada: reprovada,
      observacoes: 'teste 218' });
  };
  const remessa = async (m, codigo, q, { enviar = true } = {}) => {
    const r = await thirdPartyService.criarRemessa(db, ADMIN, { fornecedor_nome: 'Galvanizadora 218', tipo_servico: 'Galvanizacao',
      itens: [{ material_id: m.id, quantidade: q, lote_id: await loteId(m, codigo) }] });
    if (enviar) await thirdPartyService.enviarRemessa(db, ADMIN, r.id);
    return r.id;
  };
  const reqDireta = async (m, ...qs) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E218-${++seq}`])).lastID;
    const itens = [];
    for (const q of qs) { // eslint-disable-line no-restricted-syntax
      // eslint-disable-next-line no-await-in-loop
      itens.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID);
    }
    return { R, item: itens[0], itens };
  };
  const criar = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-218', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    return { R: r.body.id, item };
  };
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.lote || null, Number(x.q)]);
  const linhas = async (m) => (await dbAll(db, `SELECT lt.codigo as lote, SUM(s.quantidade) q FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id WHERE s.material_id = ? GROUP BY lt.codigo ORDER BY lt.codigo`, [m.id]))
    .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.lote || '-'}=${Number(x.q)}`);
  const separadoDoItem = async (item) => Number((await dbGet(db, 'SELECT quantidade_separada q FROM itens_requisicao_almoxarifado WHERE id = ?',
    [item])).q);
  const ultimaRodada = async (R) => {
    const a = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ?
      AND acao = 'SEPARACAO' ORDER BY id DESC`, [R]);
    return JSON.parse(a.dados_novos).itens[0];
  };
  // recusa do servico: devolve a mensagem (e confirma 400)
  const recusa = async (p) => {
    try { await p; } catch (e) { assert.strictEqual(e.status, 400, e.message); return e.message; }
    throw new Error('esperava 400, passou');
  };
  const sep = async (R, entradas) => requisitionService.separarRequisicao(db, R, entradas, USERS.ALMOX);
  const ent = async (R, entradas) => requisitionService.entregarRequisicao(db, R, entradas, USERS.ALMOX, null);
  // montagem da RN-218.01: L1 4 em B01 (1 em quarentena: L1 continua 4) e L2 5 em P01
  const montar01 = async () => {
    const m = await material();
    await entrar(m, 4, 'L1', B01.id); await entrar(m, 5, 'L2');
    await quarentena(m, 1, 'L1', B01.id);
    assert.deepStrictEqual(await linhas(m), ['L1=4', 'L2=5'], 'premissa: a peca da quarentena voltou para L1');
    return { m, L1: await loteId(m, 'L1'), L2: await loteId(m, 'L2') };
  };

  // ── RN-218.01: quarentena no lote escolhido (separacao) ───────────────────────────────────────────────────────────────────────
  await test('[RN-218.01] L1 4 em B01 com 1 em quarentena: separar 4 de (B01, L1) -> 400 (podem sair 3); 3 -> 200 sem divergencia', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 4);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 3 podem sair nesta separação: 1 un está bloqueada ${PRESA}; `
      + `não cobre a quantidade (4). ${CONSELHO_SEP}`);
    assert.strictEqual(await separadoDoItem(item), 0, 'nada separado');
    await sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.strictEqual(await separadoDoItem(item), 3);
    const rod = await ultimaRodada(R);
    assert.deepStrictEqual([rod.maximo, rod.divergente], [3, false], JSON.stringify(rod));
  });

  // ── RN-218.02: reprovacao da inspecao ────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.02] L1 5 com 2 reprovadas na inspecao (lote ATIVO): separar 4 de (P01, L1) -> 400 (podem 3, 2 bloqueadas); 3 -> 200', async () => {
    const m = await material();
    await inspecionar(m, 'L1', 3, 2);
    await entrar(m, 5, 'L2', B01.id);
    const L1 = await loteId(m, 'L1');
    const { R, item } = await reqDireta(m, 4);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 4, localizacao_origem_id: P01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 5 un, mas só 3 podem sair nesta separação: 2 un estão bloqueadas ${PRESA}; `
      + `não cobre a quantidade (4). ${CONSELHO_SEP}`);
    await sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: P01.id, lote_id: L1 }]);
    assert.strictEqual(await separadoDoItem(item), 3);
  });

  // ── RN-218.03: terceiros ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.03] L1 5 com remessa de 2 enviada: separar 4 -> 400 (podem 3); remessa nao enviada: separar 5 -> 200', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 5, 'L2', B01.id);
    await remessa(m, 'L1', 2);
    assert.deepStrictEqual(await linhas(m), ['L1=5', 'L2=5'], 'premissa: a remessa nao baixa o lote');
    const L1 = await loteId(m, 'L1');
    const { R, item } = await reqDireta(m, 4);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 4, localizacao_origem_id: P01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 5 un, mas só 3 podem sair nesta separação: 2 un estão bloqueadas ${PRESA}; `
      + `não cobre a quantidade (4). ${CONSELHO_SEP}`);
    const m2 = await material();
    await entrar(m2, 5, 'L1');
    await remessa(m2, 'L1', 2, { enviar: false });
    const r2 = await reqDireta(m2, 5);
    await sep(r2.R, [{ item_id: r2.item, quantidade_separada: 5, localizacao_origem_id: P01.id, lote_id: await loteId(m2, 'L1') }]);
    assert.strictEqual(await separadoDoItem(r2.item), 5);
  });

  // ── RN-218.04: em inspecao no lote ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.04] L1 5 com 2 em inspecao no lote: separar 4 -> 400 "2 un em inspeção"', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 5, 'L2', B01.id);
    const L1 = await loteId(m, 'L1');
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-218-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 2, 2, ?, 2)`, [rec, m.id, L1]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2 WHERE id = ?', [m.id]);
    const { R, item } = await reqDireta(m, 4);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 4, localizacao_origem_id: P01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 5 un, mas só 3 podem sair nesta separação: 2 un em inspeção; `
      + `não cobre a quantidade (4). ${CONSELHO_SEP}`);
  });

  // ── RN-218.05: guardado por outras requisicoes em outro endereco do lote ─────────────────────────────────────────────────────
  await test('[RN-218.05] L1 5 (B01 2, P01 3; 1 em quarentena) e R1 guardou 3 em (P01, L1): R2 separa 2 de (B01, L1) -> 400 (pode 1); 1 -> 200', async () => {
    const m = await material();
    await entrar(m, 2, 'L1', B01.id); await entrar(m, 3, 'L1'); await entrar(m, 5, 'L2', B01.id);
    await quarentena(m, 1, 'L1');
    const L1 = await loteId(m, 'L1');
    const r1 = await reqDireta(m, 3);
    await sep(r1.R, [{ item_id: r1.item, quantidade_separada: 3, localizacao_origem_id: P01.id, lote_id: L1 }]);
    const r2 = await reqDireta(m, 2);
    const msg = await recusa(sep(r2.R, [{ item_id: r2.item, quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 5 un, mas só 1 pode sair nesta separação: 1 un está bloqueada ${PRESA}; `
      + `3 un já separadas dele para outras requisições; não cobre a quantidade (2). ${CONSELHO_SEP}`);
    await sep(r2.R, [{ item_id: r2.item, quantidade_separada: 1, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.strictEqual(await separadoDoItem(r2.item), 1);
    const rod = await ultimaRodada(r2.R);
    assert.deepStrictEqual([rod.maximo, rod.divergente], [1, false], `divergencia: ${JSON.stringify(rod)}`);
  });

  // ── RN-218.06: so lote ───────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.06] so lote (sem endereco): separar 4 do L1 -> 400 com a mesma literal', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 4);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 4, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 3 podem sair nesta separação: 1 un está bloqueada ${PRESA}; `
      + `não cobre a quantidade (4). ${CONSELHO_SEP}`);
  });

  // ── RN-218.07: dois itens no mesmo lote somam ────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.07] livre 3: item A 2 de (B01, L1) e item B 2 de (P01, L1) -> 400 no B "2 un já pedidas nesta separação"', async () => {
    const m = await material();
    await entrar(m, 2, 'L1', B01.id); await entrar(m, 2, 'L1'); await entrar(m, 5, 'L2', B01.id);
    await quarentena(m, 1, 'L1', B01.id);
    const L1 = await loteId(m, 'L1');
    const { R, itens } = await reqDireta(m, 2, 2);
    const msg = await recusa(sep(R, [{ item_id: itens[0], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 },
      { item_id: itens[1], quantidade_separada: 2, localizacao_origem_id: P01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 1 pode sair nesta separação: 1 un está bloqueada ${PRESA}; `
      + `2 un já pedidas nesta separação; não cobre a quantidade (2). ${CONSELHO_SEP}`);
    assert.strictEqual(await separadoDoItem(itens[0]), 0, 'tudo ou nada');
  });

  // ── RN-218.08: entrega escolhendo o lote a mao ───────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.08] separado no automatico; entregar 4 escolhendo (B01, L1) -> 400 com o conselho da entrega, nada baixado; 3 -> sai L1 3', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 4);
    await sep(R, [{ item_id: item, quantidade_separada: 4 }]);
    const msg = await recusa(ent(R, [{ item_id: item, quantidade_atendida: 4, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 3 podem sair nesta entrega: 1 un está bloqueada ${PRESA}; `
      + `não cobre a quantidade (4). ${CONSELHO_ENT}`);
    assert.deepStrictEqual(await livro(R, m), [], 'nada baixado');
    await ent(R, [{ item_id: item, quantidade_atendida: 3, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 3]]);
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=5']);
  });

  // ── RN-218.09: a planejada que deixou de servir (B1446) ──────────────────────────────────────────────────────────────────────
  await test('[RN-218.09] caixa guardada em (B01, L1) 4 antes do deploy, 1 em quarentena: um clique -> "nao serve mais"; automatico -> 200 e a peca presa fica', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 4);
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 4, origem_separacao_id = ?, lote_separacao_id = ?,
      quantidade_origem_separacao = 4 WHERE id = ?`, [B01.id, L1, item]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [R]);
    const msg = await recusa(ent(R, [{ item_id: item, quantidade_atendida: 4 }]));
    assert.strictEqual(msg, `${m.nome}: a origem da separação (${B01.codigo}) não serve mais (no lote L1 há 4 un, mas só 3 podem sair `
      + `nesta entrega: 1 un está bloqueada ${PRESA}; não cobre a quantidade (4)) — entregue escolhendo de onde sai`);
    assert.deepStrictEqual(await livro(R, m), [], 'nada baixado');
    await ent(R, [{ item_id: item, quantidade_atendida: 4, origem_automatica: true }]);
    const sai = (await livro(R, m)).reduce((a, x) => a + x[2], 0);
    assert.strictEqual(sai, 4);
    assert.ok((await livro(R, m)).every((x) => x[1] !== null), 'nada sem lote');
    const l1 = Number((await dbGet(db, 'SELECT SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [L1])).q);
    assert.ok(l1 >= 1, `a peca presa fica no L1 (${l1})`);
  });

  // ── RN-218.10: a planejada que cabe passa ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.10] separado 3 de (B01, L1) com 1 em quarentena: a entrega num clique sai L1 3 (a guarda propria nao conta duas vezes)', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 3);
    await sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 }]);
    await ent(R, [{ item_id: item, quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 3]]);
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=5']);
  });

  // ── RN-218.11: nada muda sem peca presa ──────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.11 a] lote escolhido sem peca presa (a quarentena e de OUTRO lote): separar e entregar o fisico inteiro do par', async () => {
    const m = await material();
    await entrar(m, 3, 'L1', B01.id); await entrar(m, 3, 'L2');
    await quarentena(m, 1, 'L2');
    const L1 = await loteId(m, 'L1');
    const { R, item } = await reqDireta(m, 3);
    await sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 }]);
    await ent(R, [{ item_id: item, quantidade_atendida: 3 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 3]]);
  });

  // ── RN-218.12: a janela ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.12] GET /estoque/:id/saldos: (B01, L1) lote_livre/bloqueado/inspecao; L2 null; o requisicao_id tira a guarda propria', async () => {
    const m = await material();
    await entrar(m, 4, 'L1', B01.id); await entrar(m, 1, 'L1'); await entrar(m, 5, 'L2');
    await quarentena(m, 1, 'L1', B01.id);
    const L1 = await loteId(m, 'L1');
    const r1 = await reqDireta(m, 1);
    await sep(r1.R, [{ item_id: r1.item, quantidade_separada: 1, localizacao_origem_id: P01.id, lote_id: L1 }]);
    const r2 = await reqDireta(m, 1);
    const campos = (rows, locId, lote) => {
      const x = rows.find((s) => Number(s.localizacao_id) === Number(locId) && s.lote === lote);
      return [x.lote_livre, x.lote_bloqueado, x.lote_inspecao];
    };
    const para2 = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${r2.R}`))).body;
    assert.deepStrictEqual(campos(para2, B01.id, 'L1'), [3, 1, 0]);
    assert.deepStrictEqual(campos(para2, P01.id, 'L1'), [3, 1, 0], 'o numero e do lote: o mesmo nas duas linhas');
    assert.deepStrictEqual(campos(para2, P01.id, 'L2'), [null, null, null]);
    const para1 = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${r1.R}`))).body;
    assert.deepStrictEqual(campos(para1, B01.id, 'L1'), [4, 1, 0]);
    const todas = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos`))).body;
    assert.deepStrictEqual(campos(todas, B01.id, 'L1'), [3, 1, 0]);
  });

  // ── RN-218.13: integracao pela rota e pelo servico ───────────────────────────────────────────────────────────────────────────
  await test('[RN-218.13 a, rota] R1 entregue de L1 -> devolucao Quarentena -> R2 aprovada -> saldos -> separar acima do livre 400 -> no livre -> entregar num clique', async () => {
    const m = await material();
    await entrar(m, 5, 'L1', B01.id); await entrar(m, 3, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await criar(m, 3);
    await ok(como('ADMIN').put(`${API}/requisicoes/${r1.R}/aprovar`, {}));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r1.R}/separacao`, { itens_separados: [{ item_id: r1.item, quantidade_separada: 3 }] }));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r1.R}/entregar`, { itens_atendidos: [{ item_id: r1.item, quantidade_atendida: 3 }] }));
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'L1', 3]]);
    const saida = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r1.R]);
    await ok(como('ADMIN').post(`${API}/devolucoes`, { material_id: m.id, quantidade: 1, motivo: 'DEFEITO', condicao: 'SUSPEITA',
      destino: 'QUARENTENA', movimentacao_saida_id: saida.id, localizacao_id: B01.id }), 201);
    const L1 = await loteId(m, 'L1');
    const r2 = await criar(m, 3);
    await ok(como('ADMIN').put(`${API}/requisicoes/${r2.R}/aprovar`, {}));
    const saldos = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${r2.R}`))).body;
    const l1 = saldos.find((s) => s.lote === 'L1');
    assert.deepStrictEqual([l1.quantidade, l1.lote_livre, l1.lote_bloqueado], [3, 2, 1]);
    const r = await como('ALMOX').put(`${API}/requisicoes/${r2.R}/separacao`, { itens_separados: [{ item_id: r2.item, quantidade_separada: 3,
      localizacao_origem_id: B01.id, lote_id: L1 }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: no lote L1 há 3 un, mas só 2 podem sair nesta separação: 1 un está bloqueada ${PRESA}; `
      + `não cobre a quantidade (3). ${CONSELHO_SEP}`);
    await ok(como('ALMOX').put(`${API}/requisicoes/${r2.R}/separacao`, { itens_separados: [{ item_id: r2.item, quantidade_separada: 2,
      localizacao_origem_id: B01.id, lote_id: L1 }] }));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r2.R}/entregar`, { itens_atendidos: [{ item_id: r2.item, quantidade_atendida: 2 }] }));
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'L1', 2]]);
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=3'], 'a peca da quarentena fica no L1');
  });
  await test('[RN-218.13 b, servico] a mesma montagem por registrarDevolucao, separarRequisicao e entregarRequisicao', async () => {
    const m = await material();
    await entrar(m, 5, 'L1', B01.id); await entrar(m, 3, 'L2');
    await quarentena(m, 1, 'L1', B01.id);
    const L1 = await loteId(m, 'L1');
    const { R, item } = await reqDireta(m, 5);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 5, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.ok(msg.includes('mas só 4 podem sair nesta separação'), msg);
    await sep(R, [{ item_id: item, quantidade_separada: 4, localizacao_origem_id: B01.id, lote_id: L1 }]);
    await ent(R, [{ item_id: item, quantidade_atendida: 4 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 4]]);
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=3']);
  });

  // ── RN-218.14: a mesma regua do automatico ───────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.14] na montagem da RN-218.01, lote_livre da janela = o saldo do L1 em lotesParaOAutomatico', async () => {
    const { m, L1 } = await montar01();
    const rows = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos`))).body;
    const auto = await requisitionService.lotesParaOAutomatico(db, m.id, new Map(), new Map());
    const doAuto = auto.find((l) => Number(l.lote_id) === Number(L1));
    assert.strictEqual(rows.find((s) => s.lote === 'L1').lote_livre, Number(doAuto.saldo));
    assert.strictEqual(Number(doAuto.saldo), 3);
  });

  // ── Fase 2 (itens 2 e 6) e B1445 ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-218.15, Fase 2 item 2] a guarda desta requisicao de rodada anterior: "1 un já separada dele por esta requisição"', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 4);
    await sep(R, [{ item_id: item, quantidade_separada: 1, localizacao_origem_id: B01.id, lote_id: L1 }]);
    const msg = await recusa(sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 2 podem sair nesta separação: 1 un está bloqueada ${PRESA}; `
      + `1 un já separada dele por esta requisição; não cobre a quantidade (3). ${CONSELHO_SEP}`);
    await sep(R, [{ item_id: item, quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.strictEqual(await separadoDoItem(item), 3);
    const rod = await ultimaRodada(R);
    assert.deepStrictEqual([rod.maximo, rod.divergente], [2, false], `divergencia: ${JSON.stringify(rod)}`);
  });
  await test('[RN-218.16, Fase 2 item 6] irmao FORA da entrega guardou 3 no L1 (livre 3): o outro item entrega 1 a mao de (B01, L1) -> 400', async () => {
    const { m, L1 } = await montar01();
    const { R, itens } = await reqDireta(m, 3, 1);
    await sep(R, [{ item_id: itens[0], quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 },
      { item_id: itens[1], quantidade_separada: 1 }]);
    const msg = await recusa(ent(R, [{ item_id: itens[1], quantidade_atendida: 1, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 0 podem sair nesta entrega: 1 un está bloqueada ${PRESA}; `
      + `3 un já separadas dele para outras requisições ou outras peças desta; não cobre a quantidade (1). ${CONSELHO_ENT}`);
    await ent(R, [{ item_id: itens[0], quantidade_atendida: 3 }, { item_id: itens[1], quantidade_atendida: 1 }]);
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=4'], 'o irmao sai do L1 pela planejada; o outro no automatico (L2); a peca presa fica');
  });
  await test('[RN-218.11 c, B1443] lote SEM peca presa e sobrecomprometido no legado (outra caixa guardou 3 em (P01, L1) com 1 la): separar 2 de (B01, L1) passa como hoje', async () => {
    const m = await material();
    await entrar(m, 2, 'L1', B01.id); await entrar(m, 1, 'L1'); await entrar(m, 5, 'L2', B01.id);
    const L1 = await loteId(m, 'L1');
    const outra = await reqDireta(m, 3);
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 3, origem_separacao_id = ?, lote_separacao_id = ?,
      quantidade_origem_separacao = 3 WHERE id = ?`, [P01.id, L1, outra.item]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [outra.R]);
    const { R, item } = await reqDireta(m, 2);
    await sep(R, [{ item_id: item, quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.strictEqual(await separadoDoItem(item), 2);
  });
  await test('[RN-218.11 b, B1445] material com controle de serie: nada muda (separa 3 de (B01, L1) com 1 bloqueada no livro); janela null', async () => {
    const m = await material({ serie: 1 });
    const L1 = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?, 'L1', 'ATIVO')", [m.id])).lastID;
    const L2 = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?, 'L2', 'ATIVO')", [m.id])).lastID;
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,?,3), (?,?,?,3)',
      [m.id, B01.id, L1, m.id, P01.id, L2]);
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, lote_id, cancelado)
      VALUES (?, 'BLOQUEIO', 1, 0, 0, ?, 0)`, [m.id, L1]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 6, quantidade_bloqueada = 1 WHERE id = ?', [m.id]);
    const { R, item } = await reqDireta(m, 3);
    await sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 }]);
    assert.strictEqual(await separadoDoItem(item), 3);
    const rows = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos`))).body;
    assert.strictEqual(rows.find((s) => Number(s.lote_id) === Number(L1)).lote_livre, null);
  });

  // ── Fase 5 (revisores: regra e "o teste passaria com a feature quebrada?") ───────────────────────────────────────────────────
  await test('[RN-218.17, Fase 5 regra] a guarda que fica do PROPRIO item nao o recusa: separou 3 de (B01, L1), depois 2 do L1 a terceiro; entregar 1 num clique passa, o resto (2) recusa', async () => {
    const m = await material();
    await entrar(m, 5, 'L1', B01.id); await entrar(m, 5, 'L2');
    await quarentena(m, 1, 'L1', B01.id);
    const L1 = await loteId(m, 'L1');
    const { R, item } = await reqDireta(m, 3);
    await sep(R, [{ item_id: item, quantidade_separada: 3, localizacao_origem_id: B01.id, lote_id: L1 }]);
    await remessa(m, 'L1', 2);
    await ent(R, [{ item_id: item, quantidade_atendida: 1 }]);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 1]]);
    const msg = await recusa(ent(R, [{ item_id: item, quantidade_atendida: 2 }]));
    assert.strictEqual(msg, `${m.nome}: a origem da separação (${B01.codigo}) não serve mais (no lote L1 há 4 un, mas só 1 pode sair nesta `
      + `entrega: 3 un estão bloqueadas ${PRESA}; não cobre a quantidade (2)) — entregue escolhendo de onde sai`);
  });
  await test('[RN-218.18, Fase 5 teste] entrega: dois itens a mao no mesmo lote somam — "2 un já pedidas nesta entrega"', async () => {
    const { m, L1 } = await montar01();
    const { R, itens } = await reqDireta(m, 2, 2);
    await sep(R, [{ item_id: itens[0], quantidade_separada: 2 }, { item_id: itens[1], quantidade_separada: 2 }]);
    const msg = await recusa(ent(R, [{ item_id: itens[0], quantidade_atendida: 2, localizacao_origem_id: B01.id, lote_id: L1 },
      { item_id: itens[1], quantidade_atendida: 2, localizacao_origem_id: B01.id, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 1 pode sair nesta entrega: 1 un está bloqueada ${PRESA}; `
      + `2 un já pedidas nesta entrega; não cobre a quantidade (2). ${CONSELHO_ENT}`);
  });
  await test('[RN-218.19, Fase 5 teste, B1447] planejada que cabe + a mao no mesmo lote: a recusa cai no item a mao, com a frase simples', async () => {
    const m = await material();
    await entrar(m, 2, 'L1', B01.id); await entrar(m, 2, 'L1'); await entrar(m, 5, 'L2', B01.id);
    await quarentena(m, 1, 'L1');
    const L1 = await loteId(m, 'L1');
    const { R, itens } = await reqDireta(m, 2, 2);
    await sep(R, [{ item_id: itens[1], quantidade_separada: 2, localizacao_origem_id: B01.id, lote_id: L1 },
      { item_id: itens[0], quantidade_separada: 2 }]);
    const msg = await recusa(ent(R, [{ item_id: itens[0], quantidade_atendida: 2, localizacao_origem_id: P01.id, lote_id: L1 },
      { item_id: itens[1], quantidade_atendida: 2 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 1 pode sair nesta entrega: 1 un está bloqueada ${PRESA}; `
      + `2 un já pedidas nesta entrega; não cobre a quantidade (2). ${CONSELHO_ENT}`);
    assert.ok(!msg.includes('não serve mais'), msg);
    assert.ok(msg.includes('2 un já pedidas nesta entrega'), msg);
  });
  await test('[RN-218.20, Fase 5 teste] entrega so com o lote (sem endereco) tambem confere', async () => {
    const { m, L1 } = await montar01();
    const { R, item } = await reqDireta(m, 4);
    await sep(R, [{ item_id: item, quantidade_separada: 4 }]);
    const msg = await recusa(ent(R, [{ item_id: item, quantidade_atendida: 4, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 4 un, mas só 3 podem sair nesta entrega: 1 un está bloqueada ${PRESA}; `
      + `não cobre a quantidade (4). ${CONSELHO_ENT}`);
  });
  await test('[RN-218.21, Fase 5 teste] entrega: o separado por OUTRA requisicao em outro endereco do lote; so a PARTE viva conta (entregue e cancelada nao)', async () => {
    const m = await material();
    await entrar(m, 2, 'L1', B01.id); await entrar(m, 5, 'L1'); await entrar(m, 5, 'L2', B01.id);
    await quarentena(m, 1, 'L1');
    const L1 = await loteId(m, 'L1');
    const r1 = await reqDireta(m, 3); // guarda 3, entrega 2: parte viva 1
    await sep(r1.R, [{ item_id: r1.item, quantidade_separada: 3, localizacao_origem_id: P01.id, lote_id: L1 }]);
    await ent(r1.R, [{ item_id: r1.item, quantidade_atendida: 2 }]);
    const rc = await reqDireta(m, 2); // guarda 2 e e cancelada: nao conta
    await sep(rc.R, [{ item_id: rc.item, quantidade_separada: 2, localizacao_origem_id: P01.id, lote_id: L1 }]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'CANCELADA' WHERE id = ?", [rc.R]);
    const r2 = await reqDireta(m, 4);
    const rows = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos?requisicao_id=${r2.R}`))).body;
    // L1: 7 entradas - 1 saida da quarentena + 1 de volta - 2 entregues = 5; retido 1 -> livre 4; parte viva de R1 1 -> 3
    assert.strictEqual(rows.find((s) => Number(s.localizacao_id) === B01.id && s.lote === 'L1').lote_livre, 3);
    await sep(r2.R, [{ item_id: r2.item, quantidade_separada: 4 }]);
    const msg = await recusa(ent(r2.R, [{ item_id: r2.item, quantidade_atendida: 4, lote_id: L1 }]));
    assert.strictEqual(msg, `${m.nome}: no lote L1 há 5 un, mas só 3 podem sair nesta entrega: 1 un está bloqueada ${PRESA}; `
      + `1 un já separada dele para outras requisições ou outras peças desta; não cobre a quantidade (4). ${CONSELHO_ENT}`);
  });
  await test('[RN-218.04 b, Fase 5 teste] a janela com so inspecao no lote: lote_inspecao 2, lote_bloqueado 0, lote_livre 3', async () => {
    const m = await material();
    await entrar(m, 5, 'L1');
    const L1 = await loteId(m, 'L1');
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-218-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 2, 2, ?, 2)`, [rec, m.id, L1]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2 WHERE id = ?', [m.id]);
    const x = (await ok(como('ALMOX').get(`${API}/estoque/${m.id}/saldos`))).body.find((s) => s.lote === 'L1');
    assert.deepStrictEqual([x.lote_livre, x.lote_bloqueado, x.lote_inspecao], [3, 0, 2]);
  });

  // ── contrato: as funcoes exportadas ──────────────────────────────────────────────────────────────────────────────────────────
  await test('[B1451] fraseLivreDoLote: singular/plural, unidade vazia, parcelas so > 0 na ordem', async () => {
    const f = requisitionService.fraseLivreDoLote;
    assert.strictEqual(f({ gesto: 'entrega', lote: 'L9', saldo: 6, podeSair: 0, retido: 1, inspecao: 2, guardado: 1, jaPedido: 2, qty: 1, unidade: '' }),
      `no lote L9 há 6, mas só 0 podem sair nesta entrega: 1 está bloqueada ${PRESA}; 2 em inspeção; 1 já separada dele para outras `
      + 'requisições ou outras peças desta; 2 já pedidas nesta entrega; não cobre a quantidade (1)');
    assert.strictEqual(f({ gesto: 'separacao', lote: 'L9', saldo: 0.3, podeSair: 0.1, retido: 0.2, inspecao: 0, guardado: 0, jaPedido: 0, qty: 0.2, unidade: 'kg' }),
      `no lote L9 há 0.3 kg, mas só 0.1 pode sair nesta separação: 0.2 kg está bloqueada ${PRESA}; não cobre a quantidade (0.2)`);
  });

  console.log(`\n${passed} passou, ${failed} falhou\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
