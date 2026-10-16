/**
 * Etapa 122 (D (121), B791; RN-13..RN-13d) — a trilha do excedente autorizado na conferencia e no fiscal vem DEPOIS do ato.
 *
 * Medido na Fase 0 (sonda e122fase0): `/conferir` com dois itens acima do esperado (autorizado) e a trilha EXCEDENTE_AUTORIZADO
 * do 2o falhando -> 500, NENHUM item gravado e a trilha do 1o gravada — o registro de um excedente que nao aconteceu. A trilha
 * rodava em `assertExcedentePermitido`, antes do UPDATE, item a item. Agora a funcao so DECIDE (as recusas 400/403 continuam
 * antes de qualquer escrita) e devolve os excedentes; `conferirRecebimento` e `salvarDadosFiscal` gravam a trilha de cada item
 * logo depois do UPDATE dele, nao-fatal (`registrarAuditoriaDoAto`, B784).
 *
 * Executar: cd server && node tests/api/excedenteDaConferenciaDepoisDoAto.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ALMOXARIFE = { id: 65, nome: 'Almoxarife E122', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const API = '/api/almoxarifado';
const SUFIXO = ' — a autorização de excedente é de Compras ou do Administrador';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });

  /** O comando que casa `pred(sql, params)` falha uma vez; devolve a resposta e os avisos do console. */
  async function comFalha(pred, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && pred(sql, Array.isArray(params) ? params : [])) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error('falha forcada (teste)')));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    const avisos = []; const warn = console.warn; console.warn = (...a) => avisos.push(a.join(' '));
    let r;
    try { r = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.ok(disparou, 'o gancho nao disparou');
    return { r, avisos };
  }
  const trilhaDoItem = (itemId) => (s, p) => s.includes('INSERT INTO auditoria_log_almoxarifado')
    && p[0] === 'recebimento_item' && p[1] === itemId && p[2] === 'EXCEDENTE_AUTORIZADO';

  let seq = 0;
  const material = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES (?, ?, 'UN', 0, 1)`, [`EXC122-${++seq}`, `EXC122-${seq}`])).lastID;
  /** Recebimento com `n` itens de 2 esperados, no `status` pedido. Devolve { id, itens }. */
  const recebimento = async (n, status = 'EM_CONFERENCIA') => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome)
      VALUES (?, ?, ?, 'F-EXC122')`, [`REC-EXC122-${seq}`, status, `NF-EXC122-${seq}`])).lastID;
    const itens = [];
    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      itens.push((await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id,
        quantidade_esperada, quantidade_recebida) VALUES (?, ?, 2, 2)`, [id, await material()])).lastID);
    }
    return { id, itens };
  };
  const recebidas = async (recId) => (await dbAll(db, `SELECT quantidade_recebida q FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id`, [recId])).map((x) => x.q);
  const trilhas = async (itens) => (await dbAll(db, `SELECT entidade_id FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id IN (${itens.map(() => '?').join(',')})
    ORDER BY entidade_id`, itens)).map((x) => x.entidade_id);
  const conferir = (recId, body) => request(app).put(`${API}/recebimentos/${recId}/conferir`).send(body);

  console.log('\n=== Etapa 122: a trilha do excedente depois do ato (D (121)) ===\n');

  await test('[RN-13] /conferir, dois excedentes, a trilha do 2o falhando -> 200, os dois gravados, a trilha so do 1o, o log do helper', async () => {
    setUser(SUPER);
    const { id, itens } = await recebimento(2);
    const { r, avisos } = await comFalha(trilhaDoItem(itens[1]), () => conferir(id, { autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }, { id: itens[1], quantidade_recebida: 6 }] }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(await recebidas(id), [5, 6]);
    assert.deepStrictEqual(await trilhas(itens), [itens[0]]);
    assert.ok(avisos.some((l) => l.includes(`[almoxarifado] auditoria do ato falhou (recebimento_item ${itens[1]}, EXCEDENTE_AUTORIZADO)`)),
      JSON.stringify(avisos));
  });

  await test('[RN-13b] o UPDATE do 2o item lanca -> 500, o 1o gravado COM a trilha, o 2o sem item e sem trilha', async () => {
    setUser(SUPER);
    const { id, itens } = await recebimento(2);
    const { r } = await comFalha((s, p) => s.includes('UPDATE recebimentos_material_itens_almoxarifado SET')
      && p.includes(itens[1]) && p.includes(6), () => conferir(id, { autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }, { id: itens[1], quantidade_recebida: 6 }] }));
    assert.strictEqual(r.status, 500, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(await recebidas(id), [5, 2]);
    assert.deepStrictEqual(await trilhas(itens), [itens[0]], 'a trilha nao pode existir sem o ato');
  });

  await test('[RN-13b2] o mesmo item duas vezes no payload: uma trilha por posicao decidida, como antes', async () => {
    setUser(SUPER);
    const { id, itens } = await recebimento(1);
    const r = await conferir(id, { autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }, { id: itens[0], quantidade_recebida: 5 }] });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    // O mesmo de antes da etapa (medido): a decisao ve as duas posicoes contra a quantidade gravada (2) e as duas sao
    // excedentes decididos; cada uma tem a sua trilha, depois do UPDATE da sua posicao.
    assert.deepStrictEqual(await trilhas(itens), [itens[0], itens[0]]);
  });

  await test('[RN-13c] /fiscal, um excedente, a trilha falhando -> 200 e o item gravado', async () => {
    setUser(SUPER);
    const { id, itens } = await recebimento(1);
    const { r } = await comFalha(trilhaDoItem(itens[0]), () => request(app).put(`${API}/recebimentos/${id}/fiscal`)
      .send({ autorizar_excedente: true, itens: [{ id: itens[0], quantidade_recebida: 4 }] }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(await recebidas(id), [4]);
    assert.deepStrictEqual(await trilhas(itens), []);
  });

  await test('[RN-13c2] /fiscal reenviando a quantidade ja gravada nao gera trilha; aumentando com a caixa gera depois do item', async () => {
    setUser(SUPER);
    const { id, itens } = await recebimento(1);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = 4 WHERE id = ?', [itens[0]]);
    const eco = await request(app).put(`${API}/recebimentos/${id}/fiscal`).send({ itens: [{ id: itens[0], quantidade_recebida: 4 }] });
    assert.strictEqual(eco.status, 200, JSON.stringify(eco.body));
    assert.deepStrictEqual(await trilhas(itens), []);
    const sobe = await request(app).put(`${API}/recebimentos/${id}/fiscal`)
      .send({ autorizar_excedente: true, itens: [{ id: itens[0], quantidade_recebida: 7 }] });
    assert.strictEqual(sobe.status, 200, JSON.stringify(sobe.body));
    assert.deepStrictEqual(await recebidas(id), [7]);
    assert.deepStrictEqual(await trilhas(itens), [itens[0]]);
  });

  await test('[RN-13d] guarda: sem a caixa -> 400 com a literal, nada gravado; ALMOXARIFE com a caixa -> 403, nada gravado', async () => {
    setUser(SUPER);
    const { id, itens } = await recebimento(1);
    const r400 = await conferir(id, { status: 'CONFERIDO_ALMOX', itens: [{ id: itens[0], quantidade_recebida: 5 }] });
    assert.strictEqual(r400.status, 400, JSON.stringify(r400.body));
    assert.strictEqual(r400.body.error, `Quantidade recebida (5) maior que a esperada (2) no item #${itens[0]}${SUFIXO}`);
    setUser(ALMOXARIFE);
    const r403 = await conferir(id, { status: 'CONFERIDO_ALMOX', autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }] });
    setUser(SUPER);
    assert.strictEqual(r403.status, 403, JSON.stringify(r403.body));
    assert.strictEqual(r403.body.error,
      'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente" (seu perfil: ALMOXARIFE).');
    assert.deepStrictEqual(await recebidas(id), [2]);
    assert.deepStrictEqual(await trilhas(itens), []);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).status,
      'EM_CONFERENCIA', 'a recusa gravou o status');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
