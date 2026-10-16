/**
 * Etapa 129 (C266; RN-01..RN-07) — a conferencia do recebimento depois da entrada no estoque.
 *
 * Medido na Fase 0 (sonda e129fase0): `PUT /recebimentos/:id/conferir` nao lia a situacao do recebimento. Num *Aprovado* aceitava
 * mudar a quantidade de um item que nao entrou (nunca mais entrava) e trocar a situacao (para REPROVADO o /aprovar dava entrada de
 * novo; para APROVADO a nota que falhou no meio ficava pronta sem o item que faltava); de RECEBIDO marcava APROVADO sem estoque
 * nenhum; num id inexistente respondia 200; e gravava com a marca de processamento viva. Agora recusa antes de gravar, e o comando
 * de cada gravacao repete a condicao (a corrida com o processamento).
 *
 * Executar: cd server && node tests/api/conferenciaDepoisDaEntrada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const API = '/api/almoxarifado';

const L2 = 'Recebimento já deu entrada no estoque — a conferência não pode mais mudar quantidade nem situação; '
  + 'se a contagem estava errada, corrija o estoque por um ajuste';
const L3 = 'Esta nota já está sendo processada';
const L4 = 'A conferência não aprova o recebimento — use "Aprovar", que dá a entrada no estoque';
const L5 = (s) => `A conferência já foi encerrada (situação atual: ${s}) — a situação segue pelo fluxo do recebimento`;
const L7 = "Item já deu entrada no estoque — a quantidade dele não muda mais; se a contagem estava errada, corrija o estoque por um ajuste";
const L6 = 'O recebimento mudou de situação enquanto a conferência era salva — recarregue e confira de novo';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  setUser(SUPER);

  let seq = 0;
  const material = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES (?, ?, 'UN', 0, 1)`, [`CDE129-${++seq}`, `CDE129-${seq}`])).lastID;
  /** Recebimento pela porta real; `qtds` = [{ esp, rec }]. */
  const receber = async (qtds) => {
    const mats = []; const itens = [];
    for (const q of qtds) {
      const m = await material(); mats.push(m);
      itens.push({ material_id: m, quantidade: q.esp, ...(q.rec !== undefined ? { quantidade_recebida: q.rec } : {}) });
    }
    setUser(SUPER);
    const r = await request(app).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-CDE129-${++seq}`, fornecedor_nome: 'FORN-CDE129', itens });
    assert.strictEqual(r.status, 201, `POST /recebimentos: ${JSON.stringify(r.body)}`);
    const its = await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [r.body.id]);
    return { id: r.body.id, its: its.map((i) => i.id), mats };
  };
  const conferir = (id, body) => request(app).put(`${API}/recebimentos/${id}/conferir`).send(body);
  const aprovar = (id) => request(app).post(`${API}/recebimentos/${id}/aprovar`).send({});
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q;
  const cab = (id) => dbGet(db, 'SELECT status, processando_em FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
  const item = (id) => dbGet(db, 'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [id]);
  const ncs = async (itemId) => (await dbGet(db, `SELECT COUNT(*) n FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?`, [itemId])).n;
  const trilhasExcedente = async (itemId) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND entidade_id = ? AND acao = 'EXCEDENTE_AUTORIZADO'`, [itemId])).n;
  const recusa = (r, status, literal) => {
    assert.strictEqual(r.status, status, `esperava ${status}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };
  /** Erro esperado do servico (entra pelo servico, nao pela rota). */
  const recusaServico = async (fn, status, literal) => {
    let erro = null;
    try { await fn(); } catch (e) { erro = e; }
    assert.ok(erro, 'o servico nao recusou');
    assert.strictEqual(erro.status, status, `status do erro: ${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, literal);
  };
  /** Gancho em db.run: antes do PRIMEIRO comando que casa `casa(sql)`, roda `antes` (com o run original). */
  const comGancho = async (casa, antes, fn, vez = 1) => {
    const original = db.run;
    let disparou = false; let vistos = 0;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && casa(sql) && ++vistos === vez) {
        disparou = true;
        antes(original).then(() => original.call(db, sql, params, cb), (e) => cb.call({}, e));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    try { return await fn(); } finally { db.run = original; assert.ok(disparou, 'o gancho nao disparou'); }
  };
  const runOriginal = (original, sql, params = []) => new Promise((res, rej) => {
    original.call(db, sql, params, function (e) { if (e) rej(e); else res(this); });
  });
  const ehUpdateDoItem = (sql) => sql.includes('UPDATE recebimentos_material_itens_almoxarifado SET')
    && sql.includes('conferencia_quantidade = COALESCE');
  const ehUpdateDoStatus = (sql) => sql.includes('UPDATE recebimentos_material_almoxarifado') && /SET\s+status = \?, etapa_atual = \?/.test(sql);

  console.log('\n=== Etapa 129: a conferencia depois da entrada (C266) ===\n');

  await test('[RN-01] recebimento inexistente: 404 pela rota e pelo servico (era 200 {success:true})', async () => {
    recusa(await conferir(999999, { status: 'EM_CONFERENCIA', itens: [{ id: 1, quantidade_recebida: 3 }] }), 404, 'Recebimento não encontrado');
    await recusaServico(() => receiptService.conferirRecebimento(db, SUPER, 999998, { itens: [] }), 404, 'Recebimento não encontrado');
  });

  await test('[RN-02 a] Aprovado com item de 0: conferir 5 recusa 409, o item continua 0 e nenhuma NC nova', async () => {
    const r = await receber([{ esp: 5, rec: 0 }, { esp: 2, rec: 2 }]);
    assert.strictEqual((await aprovar(r.id)).status, 200);
    const ncAntes = await ncs(r.its[0]);
    recusa(await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 5 }] }), 409, L2);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 0);
    assert.strictEqual(await ncs(r.its[0]), ncAntes, 'a recusa abriu NC');
    assert.strictEqual(await fisico(r.mats[0]), 0);
  });

  await test('[RN-02 b] Aprovado -> REPROVADO recusa 409: o status fica, o /aprovar recusa e o fisico nao muda', async () => {
    const r = await receber([{ esp: 5, rec: 0 }, { esp: 2, rec: 2 }]);
    await aprovar(r.id);
    recusa(await conferir(r.id, { status: 'REPROVADO', itens: [{ id: r.its[0], quantidade_recebida: 5 }] }), 409, L2);
    assert.strictEqual((await cab(r.id)).status, 'APROVADO');
    const ap = await aprovar(r.id);
    assert.strictEqual(ap.status, 400, JSON.stringify(ap.body));
    assert.strictEqual(await fisico(r.mats[0]), 0, 'o item de 0 entrou numa segunda aprovacao');
    assert.strictEqual(await fisico(r.mats[1]), 2);
  });

  await test('[RN-02] PROCESSADO (sem item entrado) tambem recusa — pela rota e pelo servico', async () => {
    const r = await receber([{ esp: 3, rec: 3 }]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'PROCESSADO' WHERE id = ?", [r.id]);
    recusa(await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }), 409, L2);
    await recusaServico(() => receiptService.conferirRecebimento(db, SUPER, r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }), 409, L2);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 3);
  });

  await test('[RN-02 c] nota parcial (EM_ENTRADA_NF, um item entrou): status e itens recusam 409; o /processar da entrada do que faltava', async () => {
    const r = await receber([{ esp: 2, rec: 2 }, { esp: 3, rec: 3 }]);
    await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET status = 'EM_ENTRADA_NF', data_emissao_nf = date('now'),
      data_entrada_nf = date('now'), valor_total_nota = 100 WHERE id = ?`, [r.id]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[0]]);
    recusa(await conferir(r.id, { status: 'EM_CONFERENCIA' }), 409, L2);
    recusa(await conferir(r.id, { itens: [{ id: r.its[1], quantidade_recebida: 1 }] }), 409, L2);
    assert.strictEqual((await cab(r.id)).status, 'EM_ENTRADA_NF');
    assert.strictEqual((await item(r.its[1])).quantidade_recebida, 3);
    const proc = await request(app).post(`${API}/recebimentos/${r.id}/processar`).send({});
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await fisico(r.mats[1]), 3, 'o item que faltava entrou');
    assert.strictEqual(await fisico(r.mats[0]), 0, 'o que ja tinha entrado (marcado) nao entrou de novo');
  });

  await test('[RN-02] a recusa vem antes do excedente e nao grava trilha (autorizar_excedente, acima da esperada)', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    await aprovar(r.id);
    recusa(await conferir(r.id, { autorizar_excedente: true, itens: [{ id: r.its[0], quantidade_recebida: 9 }] }), 409, L2);
    assert.strictEqual(await trilhasExcedente(r.its[0]), 0);
    // e como Almoxarife (sem a permissao do excedente) a resposta e a da situacao, nao 403
    setUser(ALMOXARIFE);
    try {
      recusa(await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 9 }] }), 409, L2);
    } finally { setUser(SUPER); }
  });

  await test('[RN-03] marca de processamento viva recusa 409; vencida (11 min) nao recusa', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET processando_em = strftime('%Y-%m-%d %H:%M:%S','now') || ' #outro' WHERE id = ?", [r.id]);
    recusa(await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }), 409, L3);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 2);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET processando_em = strftime('%Y-%m-%d %H:%M:%S','now','-11 minutes') || ' #velho' WHERE id = ?", [r.id]);
    const ok = await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 1);
  });

  await test('[RN-04 d] status APROVADO recusa 400 (antes do 404 e em qualquer situacao); o /aprovar da entrada', async () => {
    recusa(await conferir(999997, { status: 'APROVADO' }), 400, L4);
    const r = await receber([{ esp: 2, rec: 2 }]);
    recusa(await conferir(r.id, { status: 'APROVADO' }), 400, L4);
    assert.strictEqual((await cab(r.id)).status, 'RECEBIDO');
    const ap = await aprovar(r.id);
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual(await fisico(r.mats[0]), 2);
    await recusaServico(() => receiptService.conferirRecebimento(db, SUPER, r.id, { status: 'APROVADO' }), 400, L4);
  });

  await test('[RN-05] status depois da conferencia (EM_COMPRAS, ENCAMINHADO_FATURAMENTO, EM_ENTRADA_NF) recusa 409; quantidade sem status passa', async () => {
    for (const s of ['EM_COMPRAS', 'ENCAMINHADO_FATURAMENTO', 'EM_ENTRADA_NF']) {
      const r = await receber([{ esp: 5, rec: 5 }]);
      await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET status = ? WHERE id = ?', [s, r.id]);
      recusa(await conferir(r.id, { status: 'EM_CONFERENCIA', itens: [{ id: r.its[0], quantidade_recebida: 1 }] }), 409, L5(s));
      assert.strictEqual((await cab(r.id)).status, s);
      assert.strictEqual((await item(r.its[0])).quantidade_recebida, 5, `${s}: a recusa gravou o item`);
      const ok = await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 4 }] });
      assert.strictEqual(ok.status, 200, `${s}: ${JSON.stringify(ok.body)}`);
      assert.strictEqual((await item(r.its[0])).quantidade_recebida, 4);
    }
  });

  await test('[RN-05] os status de conferencia aceitam mudar a situacao (BLOQUEADO -> EM_CONFERENCIA, REPROVADO, PARCIALMENTE_APROVADO, CONFERIDO_ALMOX)', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    for (const [de, para] of [['RECEBIDO', 'BLOQUEADO'], ['BLOQUEADO', 'EM_CONFERENCIA'], ['EM_CONFERENCIA', 'REPROVADO'],
      ['REPROVADO', 'PARCIALMENTE_APROVADO'], ['PARCIALMENTE_APROVADO', 'CONFERIDO_ALMOX'], ['CONFERIDO_ALMOX', 'EM_CONFERENCIA']]) {
      assert.strictEqual((await cab(r.id)).status, de);
      const x = await conferir(r.id, { status: para });
      assert.strictEqual(x.status, 200, `${de} -> ${para}: ${JSON.stringify(x.body)}`);
      assert.strictEqual((await cab(r.id)).status, para);
    }
  });

  await test('[RN-06] corrida: o item ganha a entrada logo antes do UPDATE dele -> 409 L2 e a quantidade nao muda', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const res = await comGancho(ehUpdateDoItem,
      (orig) => runOriginal(orig, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[0]]),
      () => conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }));
    recusa(res, 409, L2);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 2);
  });

  await test('[RN-06] corrida: a marca de processamento chega logo antes do UPDATE do item -> 409 L3 e nada gravado', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const res = await comGancho(ehUpdateDoItem,
      (orig) => runOriginal(orig, "UPDATE recebimentos_material_almoxarifado SET processando_em = strftime('%Y-%m-%d %H:%M:%S','now') || ' #corrida' WHERE id = ?", [r.id]),
      () => conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }));
    recusa(res, 409, L3);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 2);
  });

  await test('[RN-06] corrida: o recebimento vira PROCESSADO logo antes do UPDATE do status -> 409 L2 e o status fica', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const res = await comGancho(ehUpdateDoStatus,
      (orig) => runOriginal(orig, "UPDATE recebimentos_material_almoxarifado SET status = 'PROCESSADO' WHERE id = ?", [r.id]),
      () => conferir(r.id, { status: 'EM_CONFERENCIA', itens: [{ id: r.its[0], quantidade_recebida: 1 }] }));
    recusa(res, 409, L2);
    assert.strictEqual((await cab(r.id)).status, 'PROCESSADO');
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 2, 'o item foi gravado depois do status recusado');
  });

  await test('[RN-06] corrida: um item entra logo antes do UPDATE do status -> 409 L2 e o status fica', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const res = await comGancho(ehUpdateDoStatus,
      (orig) => runOriginal(orig, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[0]]),
      () => conferir(r.id, { status: 'BLOQUEADO' }));
    recusa(res, 409, L2);
    assert.strictEqual((await cab(r.id)).status, 'RECEBIDO');
  });

  await test('[RN-06] corrida: outra conferencia troca o status antes do UPDATE -> 409 L6 (pelo servico tambem)', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const res = await comGancho(ehUpdateDoStatus,
      (orig) => runOriginal(orig, "UPDATE recebimentos_material_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [r.id]),
      () => conferir(r.id, { status: 'CONFERIDO_ALMOX' }));
    recusa(res, 409, L6);
    assert.strictEqual((await cab(r.id)).status, 'BLOQUEADO');
    const r2 = await receber([{ esp: 2, rec: 2 }]);
    await comGancho(ehUpdateDoStatus,
      (orig) => runOriginal(orig, "UPDATE recebimentos_material_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [r2.id]),
      () => recusaServico(() => receiptService.conferirRecebimento(db, SUPER, r2.id, { status: 'CONFERIDO_ALMOX' }), 409, L6));
  });

  await test('[RN-06] o item que nao e deste recebimento continua ignorado (200, o outro item intacto)', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const outro = await receber([{ esp: 7, rec: 7 }]);
    const res = await conferir(r.id, { itens: [{ id: outro.its[0], quantidade_recebida: 1 }, { id: r.its[0], quantidade_recebida: 1 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await item(outro.its[0])).quantidade_recebida, 7);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 1);
  });

  await test('[RN-06 M7] corrida: OUTRO item do recebimento entra logo antes do UPDATE deste -> 409 L2 e este nao muda', async () => {
    const r = await receber([{ esp: 2, rec: 2 }, { esp: 3, rec: 3 }]);
    const res = await comGancho(ehUpdateDoItem,
      (orig) => runOriginal(orig, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[1]]),
      () => conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }));
    recusa(res, 409, L2);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 2);
  });

  await test('[RN-06] corrida: o recebimento vira PROCESSADO logo antes do UPDATE do item (sem status no payload) -> 409 L2', async () => {
    const r = await receber([{ esp: 2, rec: 2 }]);
    const res = await comGancho(ehUpdateDoItem,
      (orig) => runOriginal(orig, "UPDATE recebimentos_material_almoxarifado SET status = 'PROCESSADO' WHERE id = ?", [r.id]),
      () => conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 1 }] }));
    recusa(res, 409, L2);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 2);
  });

  await test('[RN-06 M6] corrida no SEGUNDO item: 409 L3; o primeiro ficou gravado e o gancho de NC rodou para ele', async () => {
    const r = await receber([{ esp: 5, rec: 5 }, { esp: 5, rec: 5 }]);
    const res = await comGancho(ehUpdateDoItem,
      (orig) => runOriginal(orig, "UPDATE recebimentos_material_almoxarifado SET processando_em = strftime('%Y-%m-%d %H:%M:%S','now') || ' #corrida2' WHERE id = ?", [r.id]),
      () => conferir(r.id, { status: 'EM_CONFERENCIA', itens: [{ id: r.its[0], quantidade_recebida: 3 }, { id: r.its[1], quantidade_recebida: 4 }] }), 2);
    recusa(res, 409, L3);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 3, 'o primeiro item (antes da marca) foi gravado');
    assert.strictEqual((await item(r.its[1])).quantidade_recebida, 5, 'o segundo nao');
    assert.strictEqual(await ncs(r.its[0]), 1, 'o item gravado ficou sem a NC da divergencia');
    assert.strictEqual(await ncs(r.its[1]), 0);
    assert.strictEqual((await cab(r.id)).status, 'EM_CONFERENCIA', 'o status gravado antes fica (declarado)');
  });

  await test('[RN-09] /fiscal: item entrado com quantidade diferente recusa 409 L7 antes de gravar; o eco do mesmo valor passa', async () => {
    const r = await receber([{ esp: 5, rec: 5 }, { esp: 3, rec: 3 }]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'EM_ENTRADA_NF' WHERE id = ?", [r.id]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[0]]);
    const fiscal = (body) => request(app).put(`${API}/recebimentos/${r.id}/fiscal`).send(body);
    recusa(await fiscal({ nota_serie: 'S-TROCADA', itens: [{ id: r.its[1], quantidade_recebida: 1 }, { id: r.its[0], quantidade_recebida: 2 }] }), 409, L7);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 5);
    assert.strictEqual((await item(r.its[1])).quantidade_recebida, 3, 'o outro item foi gravado antes da recusa');
    assert.notStrictEqual((await dbGet(db, 'SELECT nota_serie s FROM recebimentos_material_almoxarifado WHERE id = ?', [r.id])).s, 'S-TROCADA', 'o cabecalho foi gravado');
    const eco = await fiscal({ nota_serie: 'S-OK', itens: [{ id: r.its[0], quantidade_recebida: 5 }, { id: r.its[1], quantidade_recebida: 2 }] });
    assert.strictEqual(eco.status, 200, JSON.stringify(eco.body));
    assert.strictEqual((await item(r.its[1])).quantidade_recebida, 2, 'o item que nao entrou continua editavel');
    // o legado: item entrado com a recebida NULL (entrou pela esperada) — o eco da esperada passa e a coluna fica NULL
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = NULL WHERE id = ?', [r.its[0]]);
    assert.strictEqual((await fiscal({ itens: [{ id: r.its[0], quantidade_recebida: 5 }] })).status, 200);
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, null);
    recusa(await fiscal({ itens: [{ id: r.its[0], quantidade_recebida: 4 }] }), 409, L7);
  });

  await test('[RN-09] /fiscal: corrida — o item ganha a entrada logo antes do UPDATE dele: a quantidade nao muda (o comando defende)', async () => {
    const r = await receber([{ esp: 5, rec: 5 }]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET status = 'EM_ENTRADA_NF' WHERE id = ?", [r.id]);
    const ehItemFiscal = (sql) => sql.includes('UPDATE recebimentos_material_itens_almoxarifado SET') && sql.includes('reducao_icms_percent');
    await comGancho(ehItemFiscal,
      (orig) => runOriginal(orig, 'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = CURRENT_TIMESTAMP WHERE id = ?', [r.its[0]]),
      () => request(app).put(`${API}/recebimentos/${r.id}/fiscal`).send({ itens: [{ id: r.its[0], quantidade_recebida: 2 }] }));
    assert.strictEqual((await item(r.its[0])).quantidade_recebida, 5);
  });

  await test('[RN-07] o que nao muda: conferencia normal abre a NC, CONFERIDO_ALMOX nao grava a finalizacao, excedente sem flag 400', async () => {
    const r = await receber([{ esp: 5, rec: 5 }]);
    const c = await conferir(r.id, { status: 'EM_CONFERENCIA', itens: [{ id: r.its[0], quantidade_recebida: 3 }] });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await ncs(r.its[0]), 1, 'a divergencia da conferencia abre a NC');
    const f = await conferir(r.id, { status: 'CONFERIDO_ALMOX' });
    assert.strictEqual(f.status, 200);
    assert.strictEqual((await dbGet(db, 'SELECT conferencia_finalizada_em c FROM recebimentos_material_almoxarifado WHERE id = ?', [r.id])).c, null);
    const ex = await conferir(r.id, { itens: [{ id: r.its[0], quantidade_recebida: 9 }] });
    assert.strictEqual(ex.status, 400, JSON.stringify(ex.body));
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
