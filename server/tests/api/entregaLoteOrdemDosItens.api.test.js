/**
 * Etapa 272 (C555; B1636, D (268)) — a conferencia do lote com peca presa na entrega da o mesmo resultado em qualquer ordem dos itens.
 *
 * Antes: lote L com 9 (4 em inspecao — podem sair 5); item i separado no automatico, item k com 4 separadas de (ZA, L); a entrega de i 3 de
 * (ZB, L) e k 2 de (ZC, L) passava com i pedido antes de k e era recusada com k antes. A conta de cada item somava a guarda que FICA dos
 * outros itens (todos), mas so o que os itens ANTERIORES pedem. Agora, depois da conferencia de sempre (que decide QUEM recebe a recusa nas
 * entregas sem guarda que fica — B1447), uma segunda passada confere cada item contra o que TODOS os outros itens da entrega pedem do lote.
 *
 * Cobre: RN-272.07 (as duas ordens, a mesma recusa no item i), .08 (o que cabe passa nas duas ordens), .09 (sem guarda que fica, nada muda:
 * a recusa continua no mesmo item — RN-218.18/19 ficam no arquivo deles), .10 (um item por vez) e o fluxo pela rota (T2).
 *
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa272-estorno-desbloqueio-e-lote-na-entrega.md
 * Executar: cd server && node tests/api/entregaLoteOrdemDosItens.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 272', role: 'admin', is_superadmin: 1, email: 'b272@t.com' };
const ALMOX = { id: 27232, nome: 'Almox 272', role: 'user', email: 'x272@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const API = '/api/almoxarifado';
const CONSELHO_ENT = 'Escolha outro lote ou deixe "Qualquer endereço (automático)"';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 272: a conferencia do lote na entrega nao depende da ordem dos itens (C555) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM272B', nome: 'Almox 272 B' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  const loc = async (codigo) => {
    const r = await post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const ZA = await loc('Z272-A'); const ZB = await loc('Z272-B'); const ZC = await loc('Z272-C'); const P01 = await loc('Z272-P');

  const material = async () => {
    const c = `E272B-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 1, 0, ?)`, [c, c, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote, destino) => ok(post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e272', localizacao_destino_id: destino, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const linhas = async (m) => (await dbAll(db, `SELECT lc.codigo AS loc, lt.codigo AS lote, s.quantidade q FROM estoque_saldo_almoxarifado s
      JOIN localizacoes_almoxarifado lc ON lc.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
      WHERE s.material_id = ? ORDER BY lc.codigo, lt.codigo`, [m.id]))
    .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc}/${x.lote || '-'}=${Number(x.q)}`);
  const saidas = async (R) => (await dbAll(db, `SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'`,
    [R]))[0].n;
  const recusa = async (p) => {
    try { await p; } catch (e) { assert.strictEqual(e.status, 400, e.message); return e.message; }
    throw new Error('esperava 400, passou');
  };
  // A montagem do C555: L 9 (ZA 4, ZB 3, ZC 2) com 4 em inspecao no lote (podem sair 5); L2 5 em P01. Itens criados na ordem `ordem`
  // ('ik' = i antes de k); i separado 3 no automatico, k separado 4 de (ZA, L).
  const montar = async (ordem, { qi = 3, qk = 4 } = {}) => {
    const m = await material();
    await entrar(m, 4, 'L', ZA.id); await entrar(m, 3, 'L', ZB.id); await entrar(m, 2, 'L', ZC.id); await entrar(m, 5, 'L2', P01.id);
    const L = await loteId(m, 'L');
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-272-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 4, 4, ?, 4)`, [rec, m.id, L]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 4 WHERE id = ?', [m.id]);
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E272B-${++seq}`])).lastID;
    const novo = async (q) => (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    const ids = {};
    for (const x of ordem) { ids[x] = await novo(x === 'i' ? qi : qk); } // eslint-disable-line no-await-in-loop, no-restricted-syntax
    assert.ok(ordem === 'ik' ? ids.i < ids.k : ids.k < ids.i, 'premissa: a ordem dos itens');
    await requisitionService.separarRequisicao(db, R, [{ item_id: ids.k, quantidade_separada: qk, localizacao_origem_id: ZA.id, lote_id: L },
      { item_id: ids.i, quantidade_separada: qi }], ALMOX);
    return { m, L, R, i: ids.i, k: ids.k };
  };
  const ent = (R, entradas) => requisitionService.entregarRequisicao(db, R, entradas, ALMOX, null);
  const aMao = (x, q, origem, L) => ({ item_id: x, quantidade_atendida: q, localizacao_origem_id: origem.id, lote_id: L });
  const FRASE_I = (nome) => `${nome}: no lote L há 9 un, mas só 1 pode sair nesta entrega: 4 un em inspeção; 2 un já separadas dele para `
    + `outras requisições ou outras peças desta; 2 un já pedidas nesta entrega; não cobre a quantidade (3). ${CONSELHO_ENT}`;

  // ---------------------------------------------------------------- RN-272.07
  for (const ordem of ['ik', 'ki']) { // eslint-disable-line no-restricted-syntax
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-272.07 ${ordem}] i 3 de (ZB, L) e k 2 de (ZC, L): 400 no item i com a mesma frase; nada baixado`, async () => {
      const { m, L, R, i, k } = await montar(ordem);
      const antes = await linhas(m);
      const msg = await recusa(ent(R, [aMao(i, 3, ZB, L), aMao(k, 2, ZC, L)]));
      assert.strictEqual(msg, FRASE_I(m.nome));
      assert.deepStrictEqual([await linhas(m), await saidas(R)], [antes, 0], 'nada baixado');
    });
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-272.07 ${ordem} entradas invertidas] a ordem das linhas da entrega tambem nao muda: k primeiro no corpo -> a mesma recusa`, async () => {
      const { m, L, R, i, k } = await montar(ordem);
      const msg = await recusa(ent(R, [aMao(k, 2, ZC, L), aMao(i, 3, ZB, L)]));
      assert.strictEqual(msg, FRASE_I(m.nome));
    });
    // ------------------------------------------------------------ RN-272.08
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-272.08 ${ordem}] o que cabe passa: i 1 de (ZB, L) e k 2 de (ZC, L) -> 200; o lote fica com a caixa de k (2) e o livre 0`, async () => {
      const { m, L, R, i, k } = await montar(ordem, { qi: 1 });
      await ent(R, [aMao(i, 1, ZB, L), aMao(k, 2, ZC, L)]);
      assert.deepStrictEqual(await linhas(m), ['Z272-A/L=4', 'Z272-B/L=2', 'Z272-P/L2=5'].sort());
      assert.strictEqual(await saidas(R), 2);
    });
  }

  // ---------------------------------------------------------------- RN-272.10
  await test('[RN-272.10] um item por vez: k 2 de (ZC, L) passa; depois i 3 de (ZB, L) -> 400 (a caixa de k fica, "só 1"); i 1 -> 200', async () => {
    const { m, L, R, i, k } = await montar('ik');
    await ent(R, [aMao(k, 2, ZC, L)]);
    const msg = await recusa(ent(R, [aMao(i, 3, ZB, L)]));
    assert.ok(msg.startsWith(`${m.nome}: no lote L há 7 un, mas só 1 pode sair nesta entrega: 4 un em inspeção; 2 un já separadas`), msg);
    await ent(R, [aMao(i, 1, ZB, L)]);
  });

  // ---------------------------------------------------------------- Fase 2 (achado 3)
  await test('[RN-272.07 culpado, Fase 2 achado 3] j tira a propria caixa, k sai de fora da caixa, i sem caixa: a recusa cai em i, nao em j', async () => {
    const ZD = await loc(`Z272-D${++seq}`);
    const m = await material();
    await entrar(m, 4, 'L', ZA.id); await entrar(m, 3, 'L', ZB.id); await entrar(m, 2, 'L', ZC.id); await entrar(m, 2, 'L', ZD.id);
    await entrar(m, 5, 'L2', P01.id);
    const L = await loteId(m, 'L');
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-272-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 4, 4, ?, 4)`, [rec, m.id, L]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 4 WHERE id = ?', [m.id]);
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E272C-${++seq}`])).lastID;
    const novo = async (q) => (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    const j = await novo(3); const i = await novo(1); const k = await novo(4);
    await requisitionService.separarRequisicao(db, R, [{ item_id: j, quantidade_separada: 3, localizacao_origem_id: ZB.id, lote_id: L },
      { item_id: k, quantidade_separada: 4, localizacao_origem_id: ZA.id, lote_id: L }, { item_id: i, quantidade_separada: 1 }], ALMOX);
    const msg = await recusa(ent(R, [aMao(j, 3, ZB, L), aMao(i, 1, ZD, L), aMao(k, 2, ZC, L)]));
    assert.strictEqual(msg, `${m.nome}: no lote L há 11 un, mas só 0 podem sair nesta entrega: 4 un em inspeção; 2 un já separadas dele para `
      + `outras requisições ou outras peças desta; 5 un já pedidas nesta entrega; não cobre a quantidade (1). ${CONSELHO_ENT}`);
    assert.strictEqual(await saidas(R), 0);
  });

  // ---------------------------------------------------------------- T2 rota
  await test('[T2 rota] PUT /requisicoes/:id/entregar nas duas ordens -> 400 com a mesma frase no item i', async () => {
    setUser({ ...ALMOX });
    try {
      for (const ordem of ['ik', 'ki']) { // eslint-disable-line no-restricted-syntax
        // eslint-disable-next-line no-await-in-loop
        const { m, L, R, i, k } = await montar(ordem);
        // eslint-disable-next-line no-await-in-loop
        const r = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: [aMao(i, 3, ZB, L), aMao(k, 2, ZC, L)] }).then((x) => x);
        assert.strictEqual(r.status, 400, `${ordem}: ${JSON.stringify(r.body)}`);
        assert.strictEqual(r.body.error, FRASE_I(m.nome), ordem);
      }
    } finally { setUser({ ...ADMIN }); }
  });

  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
