/**
 * Etapa 76 (Fase 5, revisao) — o recalculo das portas da 74/75 e do estorno tambem roda SOB A TRAVA.
 *
 * A 76 pos sob a trava por material (B394) so o recalculo das portas novas (liberar a mao, expiracao) e
 * declarou a janela da 74/75 e do estorno (D3/B398). A revisao (sonda76f-tocadas) mostrou que a janela
 * tinha agora um caminho novo e deterministico: a nota reserva +4 para R (hold 8 de 8), solta a trava e o
 * `recalcularTocadas` (fora da trava) le hold 8 e vai gravar TOTALMENTE_RESERVADA; antes do UPDATE dele o
 * operador libera a reserva antiga pela tela: hold 4, o recalculo da rota (sob a trava) le PARCIALMENTE ==
 * atual e nao grava; o UPDATE atrasado da nota (WHERE status = PARCIALMENTE) passa -> TOTALMENTE_RESERVADA
 * com hold 4 de 8. Com o recalculo das tocadas sob a trava, a rota espera a nota terminar de gravar e o
 * ultimo a escrever leu o hold certo.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa76-liberar-expirar-recalcula-status.md (Fase 5).
 *
 * Executar: cd server && node tests/api/reservaRecalculoRevisaoFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const rcs = require('../../services/almoxarifado/reservaChegadaService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 76f5', role: 'admin', is_superadmin: 1, email: 'a76f5@t.com' };
const API = '/api/almoxarifado';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 76 (Fase 5): o recalculo da 74/75 e do estorno sob a trava ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F76F5','76000000000590','ativo')")).lastID;
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');

  // Toda espera concorrente tem limite, com timer VIVO (um timer .unref() deixaria o event loop esvaziar
  // e o arquivo sair com 0 no meio — o run-all agora pega isso, mas o limite continua dizendo ONDE prendeu).
  const comLimite = (p, ms = 15000) => {
    let t;
    const limite = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`PRESA: passou de ${ms} ms (a trava do material nao soltou?)`)), ms);
    });
    return Promise.race([p, limite]).finally(() => clearTimeout(t));
  };
  const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const material = async (q) => {
    const c = `E76F5-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, ?, 0)`, [c, `Mat ${c}`, q, forn])).lastID;
  };
  const reqPend = async (itens) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, 99, 'Sol 76f5', 'PENDENTE', 'NORMAL', '2026-09-01 10:00:00', 1, '2026-09-01 10:00:00')`,
    [`REQ-E76F5-${++seq}`])).lastID;
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [id, m, q]);
    }
    return id;
  };
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (rid) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'
    ORDER BY material_id, id`, [rid]);
  const hold = async (rid) => (await reservas(rid))
    .reduce((s, x) => s + Number(x.quantidade) - Number(x.quantidade_utilizada || 0), 0);
  const notaSemProcessar = async (m, q) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F76F5', '2026-09-01', '2026-09-02', 10)`, [`REC-E76F5-${++seq}`, `NF-E76F5-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m, q, q]);
    return r;
  };
  // supertest so dispara a requisicao no `.then`: `.then((x) => x)` a poe no ar sem esperar.
  const processar = (rec) => request(app).post(`${API}/recebimentos/${rec}/processar`).send({}).then((x) => x);
  const liberarRota = (id) => request(app).post(`${API}/reservas/${id}/liberar`).send({}).then((x) => x);
  const espiao = () => {
    const orig = rcs.recalcularStatusSobTrava;
    const chamadas = [];
    rcs.recalcularStatusSobTrava = (dbx, id) => { chamadas.push(Number(id)); return orig(dbx, id); };
    return { chamadas, restaurar: () => { rcs.recalcularStatusSobTrava = orig; } };
  };

  await test('(a) a nota (recalculo das tocadas) x liberar pela tela no meio: R fica PARCIALMENTE_RESERVADA com hold 4, nunca TOTALMENTE com metade', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 8]]);
    await aprovar(R);
    const [r1] = await reservas(R);
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 4], 'premissa: aprovada com 4 de 8');
    const rec = await notaSemProcessar(m, 4);

    // Segura o PRIMEIRO UPDATE de status de requisicao (o do recalculo das tocadas da nota, ja com hold 8).
    const origRun = db.run.bind(db);
    let abrir; const portao = new Promise((r) => { abrir = r; });
    let chegou; const noPortao = new Promise((r) => { chegou = r; });
    let segurou = false;
    db.run = function (sql, params, cb) {
      if (!segurou && /UPDATE requisicoes_almoxarifado SET status/.test(sql)) {
        segurou = true; chegou(params);
        portao.then(() => origRun(sql, params, cb));
        return this;
      }
      return origRun(sql, params, cb);
    };
    let pNota; let pLib;
    try {
      pNota = processar(rec);
      const seguro = await comLimite(noPortao, 5000);
      assert.deepStrictEqual([seguro[0], Number(seguro[1])], ['TOTALMENTE_RESERVADA', R], 'premissa: o UPDATE segurado e o da nota, com hold 8');
      assert.strictEqual(await hold(R), 8, 'premissa: a distribuicao ja reservou +4');
      // O operador libera r1 pela tela enquanto o UPDATE da nota esta no ar.
      pLib = liberarRota(r1.id);
      const limite = Date.now() + 5000;
      // eslint-disable-next-line no-await-in-loop
      while ((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [r1.id])).status === 'ATIVA') {
        if (Date.now() > limite) throw new Error('a liberacao pela rota nao aconteceu em 5 s');
        // eslint-disable-next-line no-await-in-loop
        await dormir(10);
      }
      await dormir(50); // da tempo ao recalculo da rota (sem a trava, ele roda e nao grava nada aqui)
    } finally {
      abrir();
    }
    const [p, l] = await comLimite(Promise.all([pNota, pLib]));
    db.run = origRun;
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 4],
      'o recalculo das tocadas rodou FORA da trava e o UPDATE atrasado gravou a leitura velha');
  });

  await test('(b) a nota sem corrida: o recalculo das tocadas passa por recalcularStatusSobTrava (e termina)', async () => {
    const m = await material(0);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'AGUARDANDO_ESTOQUE');
    const spy = espiao();
    let p;
    try { p = await comLimite(processar(await notaSemProcessar(m, 4)), 5000); } finally { spy.restaurar(); }
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.deepStrictEqual(spy.chamadas, [R]);
    assert.deepStrictEqual([await st(R), await hold(R)], ['TOTALMENTE_RESERVADA', 4]);
  });

  await test('(c) o estorno da nota que reservou para R: o recalculo passa por recalcularStatusSobTrava e R volta a AGUARDANDO_ESTOQUE', async () => {
    const m = await material(0);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const rec = await notaSemProcessar(m, 4);
    const p = await processar(rec);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA', 'premissa: a chegada reservou os 4');
    const mov = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'", [rec]);
    assert.ok(mov, 'premissa: a nota gerou a ENTRADA_COMPRA');
    const spy = espiao();
    let e;
    try {
      e = await comLimite(request(app).post(`${API}/movimentacoes/${mov.id}/cancelar`).send({ motivo: 'estorno e76f5' }).then((x) => x), 5000);
    } finally { spy.restaurar(); }
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(spy.chamadas, [R], 'o estorno recalcula sob a trava');
    assert.deepStrictEqual([await st(R), await hold(R)], ['AGUARDANDO_ESTOQUE', 0]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
