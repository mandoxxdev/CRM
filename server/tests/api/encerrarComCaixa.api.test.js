/**
 * Etapa 102 (T1, C204, RN-01..RN-05, B700) — encerrar com material na caixa e recusado em qualquer status que a retem.
 *
 * Antes (Fase 0, sonda Q1): pede 4, separa 4, entrega 1 -> PARCIALMENTE_ATENDIDA com 3 na caixa -> `PUT /encerrar` 200,
 * ENCERRADA, reserva LIBERADA: as 3 pecas deixavam de ser caixa sem movimento. A 101 ja recusava isso na EM_SEPARACAO (E1);
 * agora a PARCIALMENTE_ATENDIDA tambem. ENTREGUE (fora de STATUS_COM_CAIXA, sem devolucao) encerra sempre (RN-02). A saida
 * e devolver a prateleira (ou entregar) e encerrar (RN-05). A nova tentativa do compare-and-set confere a caixa (RN-03).
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa102-encerrar-com-caixa-recusa.md (T1)
 * Executar: cd server && node tests/api/encerrarComCaixa.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const travaPorRequisicao = require('../../services/almoxarifado/travaPorRequisicao');
const maquina = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 102', role: 'admin', is_superadmin: 1, email: 'a102@t.com' };
const S = { id: 10211, nome: 'Solic 102', role: 'user', email: 's102@t.com' }; // sem perfil = PRODUCAO
const ALMOX = { id: 10213, nome: 'Almox 102', role: 'user', email: 'x102@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
// Literais congeladas (plano, Contrato).
const E1 = 'Esta requisição tem material separado na caixa; entregue-o ou devolva-o à prateleira antes de encerrar.';
const E2 = 'Nada foi entregue nesta requisição; em vez de encerrar, ela deve ser cancelada por quem pediu ou pelo administrador do sistema.';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 102 (T1): encerrar com material na caixa e recusado (C204) ===\n');
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const API = '/api/almoxarifado';

  // Ganchos no db.run: (a) pausa — segura o SQL que casar ate `soltar()`; (b) escritor — roda `fn` antes do SQL que
  // casar (o escritor "de fora" do compare-and-set do encerramento).
  const origRun = db.run;
  let pausa = null;
  let escritor = null;
  db.run = function (sql, ...rest) {
    const s = String(sql);
    if (pausa && pausa.re.test(s)) {
      const p = pausa; pausa = null;
      p.avisar();
      p.segura.then(() => origRun.call(db, sql, ...rest));
      return this;
    }
    if (escritor && escritor.re.test(s)) {
      const e = escritor; e.emitidos++;
      if (e.emitidos === 1) {
        Promise.resolve(e.fn()).catch((err) => { e.erro = err; }).then(() => origRun.call(db, sql, ...rest));
        return this;
      }
    }
    return origRun.call(this, sql, ...rest);
  };
  const armarPausa = (re) => {
    let soltar; let avisar;
    const segura = new Promise((r) => { soltar = r; });
    const chegou = new Promise((r) => { avisar = r; });
    pausa = { re, segura, chegou, avisar };
    return { soltar, chegou };
  };
  const armarEscritor = (re, fn) => { escritor = { re, fn, emitidos: 0, erro: null }; return escritor; };
  const RE_ENC = /SET\s+status\s*=\s*'ENCERRADA'/;
  const raw = (sql, p) => new Promise((ok, ko) => origRun.call(db, sql, p, (err) => (err ? ko(err) : ok())));

  const material = async (q) => {
    const c = `E102T1-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  // S pede (um item por quantidade de `pedes`); ADMIN aprova. Devolve { R, numero, itens: [{ id, m }] }.
  const montarN = async (pedes, fisico = 10) => {
    const ms = [];
    for (let i = 0; i < pedes.length; i++) ms.push(await material(fisico)); // eslint-disable-line no-await-in-loop
    const cr = await as(S, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-102',
      itens: pedes.map((q, i) => ({ material_id: ms[i], quantidade: q })),
    }).then((x) => x));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const linhas = await dbAll(db, 'SELECT id, material_id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
    return { R, itens: linhas.map((l) => ({ id: l.id, m: l.material_id })) };
  };
  const montar = async (pede = 4) => { const x = await montarN([pede]); return { ...x, item: x.itens[0].id, m: x.itens[0].m }; };
  const separar = (x, lista) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/separar`)
    .send({ itens_separados: lista.map(([id, q]) => ({ item_id: id, quantidade_separada: q })) }).then((r) => r));
  const entregar = (x, lista) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/entregar`)
    .send({ itens_atendidos: lista.map(([id, q]) => ({ item_id: id, quantidade_atendida: q })) }).then((r) => r));
  const devolver = (x, id, q) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/devolver-separado`)
    .send({ motivo: 'nao vai sair', itens: [{ item_id: id, quantidade: q }] }).then((r) => r));
  const encerrar = (u, x) => as(u, () => request(app).put(`${API}/requisicoes/${x.R}/encerrar`).send({}).then((r) => r));
  const ok = (r, rot) => assert.strictEqual(r.status, 200, `${rot}: ${r.status} ${JSON.stringify(r.body)}`);
  const foto = async (x) => {
    const r = await dbGet(db, 'SELECT status, encerrado_por FROM requisicoes_almoxarifado WHERE id = ?', [x.R]);
    const reservas = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [x.R]);
    const it = await dbAll(db, 'SELECT quantidade_separada s, quantidade_entregue e FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [x.R]);
    const trilha = await dbAll(db, `SELECT id FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'ENCERRAMENTO'`, [x.R]);
    return { status: r.status, encerrado_por: r.encerrado_por, reservas: reservas.map((v) => v.status), itens: it.map((i) => [Number(i.s), Number(i.e)]), trilha: trilha.length };
  };
  const reservado = async (m) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [m])).r);
  // A Q1 da Fase 0: pede 4, separa 4, entrega 1 -> PARCIALMENTE_ATENDIDA com 3 na caixa.
  const Q1 = async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 4]]), 'separar');
    const e = await entregar(x, [[x.item, 1]]);
    ok(e, 'entregar'); assert.strictEqual(e.body.status, 'PARCIALMENTE_ATENDIDA');
    return x;
  };
  const recusaNadaMuda = async (x, r, msg, statusEsperado = 'PARCIALMENTE_ATENDIDA') => {
    assert.strictEqual(r.status, 400, `encerrar: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, msg);
    const f = await foto(x);
    assert.strictEqual(f.status, statusEsperado);
    // A reserva do que ainda falta continua ATIVA; a de item entregue por inteiro ja era CONSUMIDA. Nenhuma LIBERADA.
    assert.ok(f.reservas.includes('ATIVA') && !f.reservas.includes('LIBERADA'), `reservas ${f.reservas}`);
    assert.strictEqual(f.trilha, 0, 'trilha ENCERRAMENTO gravada');
    assert.strictEqual(f.encerrado_por, null, 'encerrado_por gravado');
  };

  // ══════════════ RN-01 — a recusa ══════════════
  await test('[102 RN-01] Q1 (Parcialmente Atendida, 3 na caixa): o administrador encerra -> 400 E1; nada muda (status, reserva ATIVA, sem trilha, encerrado_por nulo, reservado 3)', async () => {
    const x = await Q1();
    assert.strictEqual(await reservado(x.m), 3);
    await recusaNadaMuda(x, await encerrar(ADMIN, x), E1);
    assert.deepStrictEqual((await foto(x)).itens, [[4, 1]]);
    assert.strictEqual(await reservado(x.m), 3, 'a reserva foi solta');
  });

  await test('[102 RN-01] o almoxarife (aprovar_requisicao) tambem recebe E1; quem pediu (sem perfil) continua com o 403 de antes', async () => {
    const x = await Q1();
    await recusaNadaMuda(x, await encerrar(ALMOX, x), E1);
    const s = await encerrar(S, x);
    assert.strictEqual(s.status, 403); assert.strictEqual(s.body.error, 'Sem permissão para encerrar requisições');
  });

  await test('[102 RN-01] dois itens, a caixa so no SEGUNDO (o primeiro entregue por inteiro): E1; nada muda', async () => {
    const x = await montarN([2, 4]);
    const [a, b] = x.itens;
    assert.notStrictEqual(b.id, x.R);
    ok(await separar(x, [[a.id, 2], [b.id, 3]]), 'separar');
    ok(await entregar(x, [[a.id, 2], [b.id, 1]]), 'entregar');
    await recusaNadaMuda(x, await encerrar(ADMIN, x), E1);
    assert.deepStrictEqual((await foto(x)).itens, [[2, 2], [3, 1]]);
  });

  await test('[102 RN-01] a regua e a da B524 (arredondada a 6 casas): separado 2,000001 / entregue 1 e caixa (E1); resto de legado separado 2,0000001 / entregue 2 encerra (200)', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 2]]), 'separar'); ok(await entregar(x, [[x.item, 1]]), 'entregar');
    await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 1.000001 WHERE id = ?', [x.item]);
    await recusaNadaMuda(x, await encerrar(ADMIN, x), E1);
    await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 1.0000001 WHERE id = ?', [x.item]);
    ok(await encerrar(ADMIN, x), 'encerrar com resto');
    assert.strictEqual((await foto(x)).status, 'ENCERRADA');
  });

  await test('[102 RN-01] o arredondamento e da CAIXA, nao do separado: entregue 1,9999999 (legado) com separado 2 -> caixa vazia -> 200', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 2]]), 'separar'); ok(await entregar(x, [[x.item, 2]]), 'entregar');
    await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 1.9999999, quantidade_atendida = 1.9999999 WHERE id = ?', [x.item]);
    ok(await encerrar(ADMIN, x), 'encerrar');
  });

  await test('[102 RN-01] o entregue so em quantidade_atendida (legado): separado 2, atendida 2, entregue NULL -> caixa vazia -> 200 (metade: atendida 1 -> E1)', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 2]]), 'separar'); ok(await entregar(x, [[x.item, 2]]), 'entregar');
    await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = NULL, quantidade_atendida = 1 WHERE id = ?', [x.item]);
    await recusaNadaMuda(x, await encerrar(ADMIN, x), E1);
    await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_atendida = 2 WHERE id = ?', [x.item]);
    ok(await encerrar(ADMIN, x), 'encerrar');
  });

  await test('[102 RN-01] Parcialmente Atendida com a caixa VAZIA (Q5: pede 4, separa 2, entrega 2) encerra: 200, ENCERRADA, reserva LIBERADA, reservado 0, trilha', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 2]]), 'separar'); ok(await entregar(x, [[x.item, 2]]), 'entregar');
    const r = await encerrar(ADMIN, x);
    ok(r, 'encerrar'); assert.deepStrictEqual(r.body, { success: true, status: 'ENCERRADA' });
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.reservas, f.trilha], ['ENCERRADA', ['LIBERADA'], 1]);
    assert.strictEqual(f.encerrado_por, ADMIN.id);
    assert.strictEqual(await reservado(x.m), 0);
  });

  // ══════════════ RN-02 — Entregue encerra sempre ══════════════
  await test('[102 RN-02] Entregue (pelos gestos, sem caixa) e o legado Entregue com separado 5 / entregue 4 encerram: 200', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 4]]), 'separar');
    const e = await entregar(x, [[x.item, 4]]); assert.strictEqual(e.body.status, 'ENTREGUE');
    await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 5 WHERE id = ?', [x.item]);
    ok(await encerrar(ADMIN, x), 'encerrar');
    assert.strictEqual((await foto(x)).status, 'ENCERRADA');
    assert.strictEqual(maquina.STATUS_COM_CAIXA.includes('ENTREGUE'), false, 'premissa: ENTREGUE nao retem caixa');
  });

  // ══════════════ RN-04 — a Em Separacao da 101 intacta ══════════════
  await test('[102 RN-04] Em Separacao: com caixa E1; vazia sem entrega E2; vazia com entrega 200', async () => {
    const a = await montar(2);
    ok(await separar(a, [[a.item, 2]]), 'separar');
    await recusaNadaMuda(a, await encerrar(ADMIN, a), E1, 'EM_SEPARACAO');
    const b = await montar(2);
    ok(await separar(b, []), 'separar []');
    await recusaNadaMuda(b, await encerrar(ADMIN, b), E2, 'EM_SEPARACAO');
    const c = await montar(4);
    ok(await separar(c, [[c.item, 2]]), 'separar'); ok(await entregar(c, [[c.item, 2]]), 'entregar'); ok(await separar(c, []), 'separar []');
    assert.strictEqual((await foto(c)).status, 'EM_SEPARACAO');
    ok(await encerrar(ADMIN, c), 'encerrar');
  });

  // ══════════════ RN-05 — a saida ══════════════
  await test('[102 RN-05] Q1 -> E1 -> devolver os 3 a prateleira -> encerrar 200: ENCERRADA, reserva LIBERADA, reservado 0, trilha ENCERRAMENTO', async () => {
    const x = await Q1();
    await recusaNadaMuda(x, await encerrar(ADMIN, x), E1);
    ok(await devolver(x, x.item, 3), 'devolver');
    ok(await encerrar(ADMIN, x), 'encerrar');
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.reservas, f.trilha, f.itens], ['ENCERRADA', ['LIBERADA'], 1, [[1, 1]]]);
    assert.strictEqual(await reservado(x.m), 0);
  });

  await test('[102 RN-05] Q1 -> entregar os 3 -> Entregue -> encerrar 200', async () => {
    const x = await Q1();
    const e = await entregar(x, [[x.item, 3]]); assert.strictEqual(e.body.status, 'ENTREGUE');
    ok(await encerrar(ADMIN, x), 'encerrar');
  });

  // ══════════════ RN-03 — a nova tentativa ══════════════
  await test('[102 RN-03] a nova tentativa confere a caixa: Entregue (4/4) -> o escritor poe PARCIALMENTE_ATENDIDA com 3 na caixa antes do UPDATE -> 400 E1; UPDATE emitido 1 vez; nada encerrado', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 4]]), 'separar'); ok(await entregar(x, [[x.item, 4]]), 'entregar');
    const g = armarEscritor(RE_ENC, async () => {
      await raw('UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 1, quantidade_atendida = 1 WHERE id = ?', [x.item]);
      await raw("UPDATE requisicoes_almoxarifado SET status = 'PARCIALMENTE_ATENDIDA' WHERE id = ?", [x.R]);
    });
    const r = await encerrar(ADMIN, x);
    escritor = null;
    assert.ok(!g.erro, g.erro && g.erro.message);
    assert.strictEqual(g.emitidos, 1, `UPDATE emitido ${g.emitidos} vez(es)`);
    assert.strictEqual(r.status, 400, `encerrar: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E1);
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.trilha, f.encerrado_por], ['PARCIALMENTE_ATENDIDA', 0, null]);
  });

  await test('[102 RN-03] metade positiva: o mesmo escritor com a caixa vazia (entregue 4) -> a nova tentativa vence: 200, UPDATE emitido 2 vezes', async () => {
    const x = await montar(4);
    ok(await separar(x, [[x.item, 4]]), 'separar'); ok(await entregar(x, [[x.item, 4]]), 'entregar');
    const g = armarEscritor(RE_ENC, () => raw("UPDATE requisicoes_almoxarifado SET status = 'PARCIALMENTE_ATENDIDA' WHERE id = ?", [x.R]));
    const r = await encerrar(ADMIN, x);
    escritor = null;
    assert.ok(!g.erro, g.erro && g.erro.message);
    ok(r, 'encerrar'); assert.strictEqual(g.emitidos, 2);
    assert.strictEqual((await foto(x)).status, 'ENCERRADA');
  });

  // ══════════════ RN-08 — a trava de sempre ══════════════
  await test('[102 RN-08] entregar o resto x encerrar: a entrega segura a trava (pausada no UPDATE do entregue); o encerramento ESPERA e depois encerra a Entregue (200)', async () => {
    const x = await Q1();
    const p = armarPausa(/UPDATE itens_requisicao_almoxarifado SET quantidade_entregue/);
    const ent = entregar(x, [[x.item, 3]]);
    await p.chegou;
    const enc = encerrar(ADMIN, x);
    const ate = Date.now() + 3000;
    while (travaPorRequisicao.esperandoNaRequisicao(x.R) < 1 && Date.now() < ate) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.strictEqual(travaPorRequisicao.esperandoNaRequisicao(x.R), 1, 'o encerramento nao entrou na fila da requisicao');
    p.soltar();
    ok(await ent, 'entregar');
    ok(await enc, 'encerrar');
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.itens], ['ENCERRADA', [[4, 4]]]);
  });

  await test('[102 RN-08] devolver x encerrar: a devolucao segura a trava; o encerramento espera e encerra com a caixa vazia (200) — sem ela, E1', async () => {
    const x = await Q1();
    const p = armarPausa(/UPDATE itens_requisicao_almoxarifado SET quantidade_separada = /);
    const dev = devolver(x, x.item, 3);
    await p.chegou;
    const enc = encerrar(ADMIN, x);
    const ate = Date.now() + 3000;
    while (travaPorRequisicao.esperandoNaRequisicao(x.R) < 1 && Date.now() < ate) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.strictEqual(travaPorRequisicao.esperandoNaRequisicao(x.R), 1, 'o encerramento nao entrou na fila da requisicao');
    p.soltar();
    ok(await dev, 'devolver');
    ok(await enc, 'encerrar');
    assert.strictEqual((await foto(x)).status, 'ENCERRADA');
  });

  // ══════════════ o contrato puro ══════════════
  await test('[102 contrato] recusaEncerrar: tabela status x itens', async () => {
    assert.strictEqual(typeof maquina.recusaEncerrar, 'function');
    const caixa = [{ quantidade_separada: 4, quantidade_entregue: 1 }];
    const vaziaComEntrega = [{ quantidade_separada: 2, quantidade_entregue: 2 }];
    const vaziaSem = [{ quantidade_separada: 0, quantidade_entregue: 0 }];
    const casos = [
      ['PARCIALMENTE_ATENDIDA', caixa, E1], ['PARCIALMENTE_ATENDIDA', vaziaComEntrega, null],
      ['EM_SEPARACAO', caixa, E1], ['EM_SEPARACAO', vaziaComEntrega, null], ['EM_SEPARACAO', vaziaSem, E2],
      ['ENTREGUE', caixa, null], ['ENCERRADA', caixa, null], ['CANCELADO', caixa, null],
      ['PARCIALMENTE_ATENDIDA', [{ quantidade_separada: 2, quantidade_entregue: null, quantidade_atendida: 2 }], null],
      ['PARCIALMENTE_ATENDIDA', [], null], ['PARCIALMENTE_ATENDIDA', null, null],
    ];
    for (const [s, it, esperado] of casos) assert.strictEqual(maquina.recusaEncerrar(s, it), esperado, `${s} ${JSON.stringify(it)}`);
  });

  db.run = origRun;
  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
