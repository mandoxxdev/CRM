/**
 * Etapa 250 (C517) — a sugestao da Fila de separacao ("Pegar em") le a conta do lote preso: material com controle por lote e sem serie,
 * lote com peca presa (retido + inspecao > folga, o gatilho da separacao — memoLotesComPecaPresa), o livre do par fica limitado por
 * livre do lote (retidoDoLote.situacaoDosLotes) − planejado no lote (todas as requisicoes) − sugerido aos irmaos no lote.
 *
 * Cobre: RN-250.10 (o lote preso que nao cobre deixa de ser sugerido), .11 (o que cobre continua), .12 (irmaos dividem o teto do lote),
 * .13 (caixa de outra requisicao no lote sai do teto), .14 (sem peca presa nada muda; o alerta do material continua), .15 (a rota por
 * requisicao devolve o mesmo).
 *
 * Plano: docs/superpowers/plans/2026-11-19-almoxarifado-etapa250-entrega-e-fila-sabem-do-lote-preso.md
 * Executar: cd server && node tests/api/sugestaoColetaLotePreso.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 250', role: 'admin', is_superadmin: 1, email: 'a250@t.com' };
const ALMOX = { id: 25022, nome: 'Almox 250', role: 'user', email: 'x250@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 250: a sugestao da Fila le a conta do lote preso (C517) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const adm = {
    get: (u) => request(app).get(u),
    post: (u, b = {}) => request(app).post(u).send(b),
  };
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const almox = (await dbRun(db, "INSERT INTO almoxarifados (codigo, nome, ativo) VALUES ('ALM250', 'Almox 250', 1)")).lastID;
  const loc = async (codigo) => {
    const id = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo, almoxarifado_id, tipo)
      VALUES (?, ?, 1, ?, 'Prateleira')`, [codigo, codigo, almox])).lastID;
    return { id, codigo };
  };
  const P01 = await loc('Z250-01');
  const P02 = await loc('Z250-02');

  const material = async ({ lote = 1 } = {}) => {
    const c = `E250-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote, destino) => {
    const r = await adm.post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e250',
      localizacao_destino_id: destino.id, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  // L1 4 em Z250-01 (validade antes: FEFO primeiro) e L2 4 em Z250-02.
  const cenario = async () => {
    const m = await material();
    await entrar(m, 4, 'L1', P01);
    await entrar(m, 4, 'L2', P02);
    const L1 = await loteId(m, 'L1'); const L2 = await loteId(m, 'L2');
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = '2030-01-31' WHERE id = ?", [L1]);
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = '2030-06-30' WHERE id = ?", [L2]);
    return { m, L1, L2 };
  };
  const bloquear = (m, q, lote) => ok(adm.post(`${API}/materiais/${m.id}/bloquear`, { quantidade: q, justificativa: 'avaria 250', lote_id: lote }));
  const req = async (m, ...qs) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, ativo)
      VALUES (?, 1, 'Sol', 'APROVADO', 'NORMAL', 1)`, [`REQ-E250-${++seq}`])).lastID;
    const itens = [];
    for (const q of qs) { // eslint-disable-line no-restricted-syntax
      // eslint-disable-next-line no-await-in-loop
      itens.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID);
    }
    return { R, itens };
  };
  const daFila = async (R) => {
    const r = await ok(adm.get(`${API}/fila-separacao`));
    const f = r.body.find((x) => Number(x.id) === Number(R));
    assert.ok(f, `a requisicao ${R} esta na fila`);
    return f;
  };
  const pegar = (linha) => (linha.pegar_em
    ? `${linha.pegar_em.localizacao_codigo}|${linha.pegar_em.lote_codigo}|${linha.pegar_em.quantidade_sugerida}|${linha.pegar_em.cobre}`
    : null);
  const itemDaFila = (f, itemId) => f.itens.find((i) => Number(i.item_id) === Number(itemId));

  // ---------------------------------------------------------------- RN-250.10
  await test('[RN-250.10] L1 4 (FEFO primeiro) com 3 bloqueadas nele e L2 4: requisicao de 2 -> Pegar em Z250-02/L2 (o L1 so tem 1 livre); separar 2 de L1 seria recusado', async () => {
    const { m, L1 } = await cenario();
    await bloquear(m, 3, L1);
    const { R, itens } = await req(m, 2);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.strictEqual(pegar(linha), 'Z250-02|L2|2|true', JSON.stringify(linha.pegar_em));
    assert.strictEqual(linha.pegar_em_aviso, null);
    assert.strictEqual(linha.pegar_em_alerta, 'RETENCAO_NO_MATERIAL', 'RN-250.14: o alerta do material continua');
    // a premissa: o que a dica antiga sugeria a separacao recusa (RN-218.01)
    let msg = null;
    try {
      await requisitionService.separarRequisicao(db, R, [{ item_id: itens[0], quantidade_separada: 2, localizacao_origem_id: P01.id, lote_id: L1 }], ALMOX);
    } catch (e) { msg = e.message; }
    assert.ok(msg && msg.includes('no lote L1 há 4 UN, mas só 1 pode sair'), `premissa: a separacao recusa 2 de L1 (${msg})`);
  });

  await test('[RN-250.10] nenhum par cobre (3 bloqueadas em L1 e 3 em L2): requisicao de 2 -> o de maior livre limitado pelo lote, NENHUM_ENDERECO_COBRE', async () => {
    const { m, L1, L2 } = await cenario();
    await bloquear(m, 3, L1);
    await bloquear(m, 3, L2);
    const { R, itens } = await req(m, 2);
    const linha = itemDaFila(await daFila(R), itens[0]);
    // L1 livre 1, L2 livre 1: empate pelo livre -> a ordem da RN-188.02 (FEFO): L1, 1 de 2
    assert.strictEqual(pegar(linha), 'Z250-01|L1|1|false', JSON.stringify(linha.pegar_em));
    assert.strictEqual(linha.pegar_em.quantidade_no_endereco, 1);
    assert.strictEqual(linha.pegar_em_aviso, 'NENHUM_ENDERECO_COBRE');
  });

  // ---------------------------------------------------------------- RN-250.11
  await test('[RN-250.11] o lote preso que ainda cobre continua sugerido: 3 bloqueadas em L1, requisicao de 1 -> Z250-01/L1 · 1 (no endereco: 1)', async () => {
    const { m, L1 } = await cenario();
    await bloquear(m, 3, L1);
    const { R, itens } = await req(m, 1);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.strictEqual(pegar(linha), 'Z250-01|L1|1|true', JSON.stringify(linha.pegar_em));
    assert.strictEqual(linha.pegar_em.quantidade_no_endereco, 1);
  });

  // ---------------------------------------------------------------- RN-250.12
  await test('[RN-250.12] irmaos do mesmo material dividem o teto do lote: 3 bloqueadas em L1, dois itens de 1 -> o primeiro L1, o segundo L2', async () => {
    const { m, L1 } = await cenario();
    await bloquear(m, 3, L1);
    const { R, itens } = await req(m, 1, 1);
    const f = await daFila(R);
    assert.deepStrictEqual(itens.map((i) => pegar(itemDaFila(f, i))), ['Z250-01|L1|1|true', 'Z250-02|L2|1|true']);
  });

  // ---------------------------------------------------------------- RN-250.13
  await test('[RN-250.13] a caixa de outra requisicao guardada no lote sai do teto: outra separou 1 de (Z250-01, L1), depois 3 bloqueadas em L1 -> requisicao de 1 -> L2', async () => {
    const { m, L1 } = await cenario();
    const outra = await req(m, 1);
    await requisitionService.separarRequisicao(db, outra.R, [{ item_id: outra.itens[0], quantidade_separada: 1, localizacao_origem_id: P01.id, lote_id: L1 }], ALMOX);
    await bloquear(m, 3, L1);
    const { R, itens } = await req(m, 1);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.strictEqual(pegar(linha), 'Z250-02|L2|1|true', JSON.stringify(linha.pegar_em));
  });

  // ---------------------------------------------------------------- Fase 5 (assercoes que faltavam)
  await test('[RN-250.10, Fase 5] lote preso so por inspecao (3 de 4 em inspecao no L1): pedido de 2 -> L2; pedido de 1 -> L1 · 1, e a separacao aceita', async () => {
    const { m, L1 } = await cenario();
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-250-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, 3, 3, ?, 3)`, [rec, m.id, L1]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 3 WHERE id = ?', [m.id]);
    const dois = await req(m, 2);
    assert.strictEqual(pegar(itemDaFila(await daFila(dois.R), dois.itens[0])), 'Z250-02|L2|2|true');
    const um = await req(m, 1);
    assert.strictEqual(pegar(itemDaFila(await daFila(um.R), um.itens[0])), 'Z250-01|L1|1|true');
    await requisitionService.separarRequisicao(db, um.R, [{ item_id: um.itens[0], quantidade_separada: 1, localizacao_origem_id: P01.id, lote_id: L1 }], ALMOX);
  });

  await test('[RN-250.10 + RN-188.01a, Fase 5] item com 1 ja separado de (Z250-01, L1) e depois 2 bloqueadas em L1: a dica e so a planejada, limitada pelo lote (1 de 2, PLANEJADA_NAO_COBRE), e a separacao aceita 1', async () => {
    const { m, L1 } = await cenario();
    const { R, itens } = await req(m, 3);
    await requisitionService.separarRequisicao(db, R, [{ item_id: itens[0], quantidade_separada: 1, localizacao_origem_id: P01.id, lote_id: L1 }], ALMOX);
    await bloquear(m, 2, L1);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.strictEqual(pegar(linha), 'Z250-01|L1|1|false', JSON.stringify(linha.pegar_em));
    assert.strictEqual(linha.pegar_em_aviso, 'PLANEJADA_NAO_COBRE');
    await requisitionService.separarRequisicao(db, R, [{ item_id: itens[0], quantidade_separada: 1, localizacao_origem_id: P01.id, lote_id: L1 }], ALMOX);
  });

  // ---------------------------------------------------------------- RN-250.14
  await test('[RN-250.14] sem peca presa nada muda: o bloqueio e do OUTRO lote (L2) -> requisicao de 4 -> Z250-01/L1 · 4 (o fisico inteiro do par)', async () => {
    const { m, L2 } = await cenario();
    await bloquear(m, 3, L2);
    const { R, itens } = await req(m, 4);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.strictEqual(pegar(linha), 'Z250-01|L1|4|true', JSON.stringify(linha.pegar_em));
  });

  await test('[RN-250.14, gatilho] lote SEM peca presa e sobrecomprometido no legado (outra caixa guardou 3 em (Z250-02, L1) com 1 la): requisicao de 4 -> Z250-01/L1 · 4, como antes (o teto do lote so vale com peca presa)', async () => {
    const m = await material();
    await entrar(m, 4, 'L1', P01); await entrar(m, 1, 'L1', P02); await entrar(m, 5, 'L2', P02);
    const L1 = await loteId(m, 'L1');
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = '2030-01-31' WHERE id = ?", [L1]);
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = '2030-06-30' WHERE id = ?", [await loteId(m, 'L2')]);
    const outra = await req(m, 3);
    await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 3, origem_separacao_id = ?, lote_separacao_id = ?,
      quantidade_origem_separacao = 3 WHERE id = ?`, [P02.id, L1, outra.itens[0]]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [outra.R]);
    const { R, itens } = await req(m, 4);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.strictEqual(pegar(linha), 'Z250-01|L1|4|true', JSON.stringify(linha.pegar_em));
  });

  await test('[RN-250.14] material sem controle por lote (o lote e so etiqueta): 3 bloqueadas sem lote -> o fisico do par, como antes', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, 4, 'L1', P01);
    await entrar(m, 4, 'L2', P02);
    await ok(adm.post(`${API}/materiais/${m.id}/bloquear`, { quantidade: 3, justificativa: 'avaria 250' }));
    const { R, itens } = await req(m, 4);
    const linha = itemDaFila(await daFila(R), itens[0]);
    assert.ok(linha.pegar_em && linha.pegar_em.quantidade_sugerida === 4 && linha.pegar_em.cobre === true, JSON.stringify(linha.pegar_em));
  });

  // ---------------------------------------------------------------- RN-250.15
  await test('[RN-250.15] a rota por requisicao devolve o mesmo que a fila (o cenario da RN-250.10)', async () => {
    const { m, L1 } = await cenario();
    await bloquear(m, 3, L1);
    const { R, itens } = await req(m, 2);
    const f = await daFila(R);
    const s = (await ok(adm.get(`${API}/requisicoes/${R}/sugestao-coleta`))).body;
    const it = s.itens.find((i) => Number(i.item_id) === Number(itens[0]));
    assert.strictEqual(pegar(it), 'Z250-02|L2|2|true');
    assert.deepStrictEqual(it.pegar_em, itemDaFila(f, itens[0]).pegar_em);
    assert.deepStrictEqual(s.ordem_coleta, f.ordem_coleta);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
