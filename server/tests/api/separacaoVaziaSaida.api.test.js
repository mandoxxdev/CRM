/**
 * Etapa 101 (T1, C195, RN-01..RN-06, B525-B528) — a Em Separacao vazia tem saida.
 *
 * Antes (Fase 0, sonda P1-P4): a requisicao que entrava em separacao e ficava sem nada na caixa ("Iniciar Separacao"
 * sem quantidade; separar e devolver tudo; entrega parcial + "Iniciar Separacao"; entrega parcial, separar e devolver)
 * nao cancelava por ninguem (400 nas duas rotas) nem encerrava ("Transicao invalida: EM_SEPARACAO -> ENCERRADA"), e a
 * reserva ficava ATIVA. Agora: caixa vazia e nada entregue -> cancela (as duas rotas, a autorizacao de hoje); caixa
 * vazia com entrega -> encerra (`aprovar_requisicao`); material na caixa -> nenhum dos dois (M1/E1). Os cancelamentos
 * correm dentro da trava por requisicao (RN-05). O dono continua sem liberar a reserva na Em Separacao (RN-06).
 *
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa101-em-separacao-vazia-tem-saida.md (T1)
 * Executar: cd server && node tests/api/separacaoVaziaSaida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const travaPorRequisicao = require('../../services/almoxarifado/travaPorRequisicao');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 101', role: 'admin', is_superadmin: 1, email: 'a101@t.com' };
const S = { id: 10101, nome: 'Solic 101', role: 'user', email: 's101@t.com' }; // sem perfil = PRODUCAO
const OUTRO = { id: 10102, nome: 'Outro 101', role: 'user', email: 'o101@t.com' };
const ALMOX = { id: 10103, nome: 'Almox 101', role: 'user', email: 'x101@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE };
// Literais congeladas (plano, Contrato).
const M1 = 'Esta requisição tem material separado na caixa; para cancelar, o almoxarifado precisa devolvê-lo à prateleira primeiro.';
const M2 = 'Esta requisição já teve material entregue e não pode ser cancelada; o almoxarifado pode encerrá-la.';
const E1 = 'Esta requisição tem material separado na caixa; entregue-o ou devolva-o à prateleira antes de encerrar.';
const E2 = 'Nada foi entregue nesta requisição; em vez de encerrar, ela deve ser cancelada por quem pediu ou pelo administrador do sistema.';
const RECUSA_OUTROS = 'Requisição não encontrada ou não pode ser cancelada';
const M3 = (numero) => `Sem permissão para liberar a reserva da requisição ${numero}: ela já está em separação — só o almoxarife ou o administrador liberam agora`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 101 (T1): a Em Separacao vazia tem saida (C195) ===\n');
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const API = '/api/almoxarifado';

  // Gancho de pausa no db.run: segura o SQL que casar ate `soltar()` (para a corrida separar x cancelar).
  const origRun = db.run;
  let pausa = null; // { re, segura: Promise, chegou: Promise, avisar }
  db.run = function (sql, ...rest) {
    if (pausa && pausa.re.test(String(sql))) {
      const p = pausa; pausa = null;
      p.avisar();
      p.segura.then(() => origRun.call(db, sql, ...rest));
      return this;
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

  const material = async (q) => {
    const c = `E101T1-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  // S pede `pede` de um material com `fisico`; ADMIN aprova (reserva). Devolve { m, R, item, numero }.
  const montar = async (pede = 2, fisico = 4) => {
    const m = await material(fisico);
    const cr = await as(S, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-101', itens: [{ material_id: m, quantidade: pede }],
    }).then((x) => x));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const numero = (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [R])).numero;
    return { m, R, item, numero };
  };
  const separar = (x, q, u = ALMOX) => as(u, () => request(app).put(`${API}/requisicoes/${x.R}/separar`)
    .send({ itens_separados: q == null ? [] : [{ item_id: x.item, quantidade_separada: q }] }).then((r) => r));
  const entregar = (x, q) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/entregar`)
    .send({ itens_atendidos: [{ item_id: x.item, quantidade_atendida: q }] }).then((r) => r));
  const devolver = (x, q) => as(ALMOX, () => request(app).put(`${API}/requisicoes/${x.R}/devolver-separado`)
    .send({ motivo: 'volta', itens: [{ item_id: x.item, quantidade: q }] }).then((r) => r));
  const cancelarOutros = (u, x) => as(u, () => request(app).put(`/api/requisicoes-material/${x.R}/cancelar`).send({}).then((r) => r));
  const cancelarAlmox = (u, x) => as(u, () => request(app).put(`${API}/requisicoes/${x.R}/cancelar`).send({}).then((r) => r));
  const encerrar = (u, x) => as(u, () => request(app).put(`${API}/requisicoes/${x.R}/encerrar`).send({}).then((r) => r));
  const ok = (r, rot) => assert.strictEqual(r.status, 200, `${rot}: ${r.status} ${JSON.stringify(r.body)}`);
  const foto = async (x) => {
    const r = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [x.R]);
    const reservas = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [x.R]);
    const mat = await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) AS r FROM materiais_almoxarifado WHERE id = ?', [x.m]);
    const it = await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [x.item]);
    return { status: r.status, reservas: reservas.map((v) => v.status), reservada: Number(mat.r), separado: Number(it.quantidade_separada || 0) };
  };
  const trilha = (x, acao) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = ?`, [x.R, acao]);

  // Os quatro caminhos da Fase 0 ate a Em Separacao vazia.
  const P1 = async () => { const x = await montar(2); ok(await separar(x, null), 'separar []'); return x; };
  const P2 = async () => { const x = await montar(2); ok(await separar(x, 2), 'separar'); ok(await devolver(x, 2), 'devolver'); return x; };
  const P3 = async () => {
    const x = await montar(4); ok(await separar(x, 2), 'separar'); ok(await entregar(x, 2), 'entregar');
    assert.strictEqual((await foto(x)).status, 'PARCIALMENTE_ATENDIDA'); ok(await separar(x, null), 'separar []'); return x;
  };
  const P4 = async () => {
    const x = await montar(4); ok(await separar(x, 2), 'separar'); ok(await entregar(x, 2), 'entregar');
    ok(await separar(x, 1), 'separar 1'); ok(await devolver(x, 1), 'devolver'); return x;
  };
  const comCaixa = async () => { const x = await montar(2); ok(await separar(x, 2), 'separar'); return x; };

  // ══════════════ RN-01 — cancelar a vazia sem entrega ══════════════
  await test('[101 RN-01] P1 (Iniciar Separacao sem quantidade): quem pediu cancela pelos outros modulos -> 200 {success:true}, CANCELADO, reserva LIBERADA, reservado 0, trilha de EM_SEPARACAO', async () => {
    const x = await P1();
    const antes = await foto(x);
    assert.deepStrictEqual([antes.status, antes.reservas, antes.reservada], ['EM_SEPARACAO', ['ATIVA'], 2]);
    const c = await cancelarOutros(S, x);
    ok(c, 'cancelar');
    assert.deepStrictEqual(c.body, { success: true });
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.reservas, f.reservada], ['CANCELADO', ['LIBERADA'], 0]);
    const t = await trilha(x, 'CANCELAMENTO');
    assert.strictEqual(t.length, 1);
    assert.strictEqual(JSON.parse(t[0].dados_anteriores).status, 'EM_SEPARACAO');
    assert.strictEqual(JSON.parse(t[0].dados_novos).via, 'requisicoes-material');
  });

  await test('[101 RN-01] P2 (separa e devolve tudo): quem pediu cancela pela rota do almoxarifado -> 200, CANCELADO, reserva LIBERADA, trilha de EM_SEPARACAO', async () => {
    const x = await P2();
    assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
    const c = await cancelarAlmox(S, x);
    ok(c, 'cancelar');
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.reservas, f.reservada], ['CANCELADO', ['LIBERADA'], 0]);
    const t = await trilha(x, 'CANCELAMENTO');
    assert.strictEqual(t.length, 1);
    assert.strictEqual(JSON.parse(t[0].dados_anteriores).status, 'EM_SEPARACAO');
  });

  await test('[101 RN-01] P1: o administrador do sistema (nao pediu) cancela pela rota do almoxarifado -> 200, CANCELADO', async () => {
    const x = await P1();
    ok(await cancelarAlmox(ADMIN, x), 'cancelar');
    assert.strictEqual((await foto(x)).status, 'CANCELADO');
  });

  await test('[101 RN-01] P1: quem nao pediu continua barrado — outros modulos: a recusa generica (nao ve o estado); almoxarifado: 403; nada muda', async () => {
    const x = await P1();
    const a = await cancelarOutros(OUTRO, x);
    assert.strictEqual(a.status, 400); assert.strictEqual(a.body.error, RECUSA_OUTROS);
    const b = await cancelarAlmox(ALMOX, x);
    assert.strictEqual(b.status, 403, JSON.stringify(b.body));
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.reservas], ['EM_SEPARACAO', ['ATIVA']]);
    assert.strictEqual((await trilha(x, 'CANCELAMENTO')).length, 0);
  });

  // ══════════════ RN-02 — as recusas do cancelamento ══════════════
  await test('[101 RN-02] material na caixa (separado 2): as duas rotas -> 400 M1; EM_SEPARACAO, separado 2, reserva ATIVA, sem trilha', async () => {
    const x = await comCaixa();
    for (const c of [await cancelarOutros(S, x), await cancelarAlmox(S, x), await cancelarAlmox(ADMIN, x)]) {
      assert.strictEqual(c.status, 400, JSON.stringify(c.body));
      assert.strictEqual(c.body.error, M1);
    }
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.separado, f.reservas], ['EM_SEPARACAO', 2, ['ATIVA']]);
    assert.strictEqual((await trilha(x, 'CANCELAMENTO')).length, 0);
  });

  await test('[101 RN-02] P3 (entrega parcial + separar []): as duas rotas -> 400 M2; EM_SEPARACAO, reserva ATIVA, sem trilha', async () => {
    const x = await P3();
    for (const c of [await cancelarOutros(S, x), await cancelarAlmox(S, x)]) {
      assert.strictEqual(c.status, 400, JSON.stringify(c.body));
      assert.strictEqual(c.body.error, M2);
    }
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.reservas], ['EM_SEPARACAO', ['ATIVA']]);
    assert.strictEqual((await trilha(x, 'CANCELAMENTO')).length, 0);
  });

  await test('[101 RN-02] status que nao cancela continua com a recusa de sempre (PARCIALMENTE_ATENDIDA): outros -> generica, almoxarifado -> "Não é possível cancelar neste status"', async () => {
    const x = await montar(4); ok(await separar(x, 2), 'separar'); ok(await entregar(x, 2), 'entregar');
    const a = await cancelarOutros(S, x);
    assert.strictEqual(a.status, 400); assert.strictEqual(a.body.error, RECUSA_OUTROS);
    const b = await cancelarAlmox(S, x);
    assert.strictEqual(b.status, 400); assert.strictEqual(b.body.error, 'Não é possível cancelar neste status');
  });

  // ══════════════ RN-03 / RN-04 — encerrar ══════════════
  for (const [rot, montarP] of [['P3 (entrega parcial + separar [])', P3], ['P4 (entrega parcial, separa e devolve)', P4]]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[101 RN-03] ${rot}: o almoxarife encerra -> 200 {success,status:ENCERRADA}, reserva LIBERADA, reservado 0, trilha ENCERRAMENTO`, async () => {
      const x = await montarP();
      assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
      const e = await encerrar(ALMOX, x);
      ok(e, 'encerrar');
      assert.deepStrictEqual(e.body, { success: true, status: 'ENCERRADA' });
      const f = await foto(x);
      assert.deepStrictEqual([f.status, f.reservas, f.reservada], ['ENCERRADA', ['LIBERADA'], 0]);
      assert.strictEqual((await trilha(x, 'ENCERRAMENTO')).length, 1);
    });
  }

  await test('[101 RN-04] material na caixa: encerrar -> 400 E1; nada muda', async () => {
    const x = await comCaixa();
    const e = await encerrar(ALMOX, x);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body)); assert.strictEqual(e.body.error, E1);
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.separado, f.reservas], ['EM_SEPARACAO', 2, ['ATIVA']]);
    assert.strictEqual((await trilha(x, 'ENCERRAMENTO')).length, 0);
  });

  await test('[101 RN-04] P1 e P2 (nada entregue): encerrar -> 400 E2; nada muda', async () => {
    for (const montarP of [P1, P2]) {
      // eslint-disable-next-line no-await-in-loop
      const x = await montarP();
      // eslint-disable-next-line no-await-in-loop
      const e = await encerrar(ALMOX, x);
      assert.strictEqual(e.status, 400, JSON.stringify(e.body)); assert.strictEqual(e.body.error, E2);
      // eslint-disable-next-line no-await-in-loop
      const f = await foto(x);
      assert.deepStrictEqual([f.status, f.reservas], ['EM_SEPARACAO', ['ATIVA']]);
    }
  });

  await test('[101 RN-04] quem pediu (sem perfil) continua sem encerrar: 403 de hoje', async () => {
    const x = await P3();
    const e = await encerrar(S, x);
    assert.strictEqual(e.status, 403, JSON.stringify(e.body));
    assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
  });

  await test('[101 RN-03] a caixa e a regua da B524 (arredondada): resto de legado 2,0000001 - 2 encerra; 2,000001 - 2 e caixa (E1)', async () => {
    const x = await P3();
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2.000001 WHERE id = ?', [x.item]);
    const e1 = await encerrar(ALMOX, x);
    assert.strictEqual(e1.status, 400, JSON.stringify(e1.body)); assert.strictEqual(e1.body.error, E1);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2.0000001 WHERE id = ?', [x.item]);
    ok(await encerrar(ALMOX, x), 'encerrar com resto');
    assert.strictEqual((await foto(x)).status, 'ENCERRADA');
  });

  await test('[101 RN-01] o entregue so em quantidade_atendida (legado) conta como entrega: cancelar -> M2, encerrar -> 200', async () => {
    const x = await P1();
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 1, quantidade_entregue = NULL, quantidade_atendida = 1 WHERE id = ?', [x.item]);
    const c = await cancelarOutros(S, x);
    assert.strictEqual(c.status, 400); assert.strictEqual(c.body.error, M2);
    ok(await encerrar(ALMOX, x), 'encerrar');
  });

  // ══════════════ Fase 5 (revisor 2) — os testes que faltavam ══════════════
  await test('[101 RN-03] (Fase 5) o arredondamento e da CAIXA, nao do separado: entregue 1,9999999 (legado) com separado 2 -> caixa vazia: cancelar M2, encerrar 200', async () => {
    const x = await P3();
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 2, quantidade_entregue = 1.9999999 WHERE id = ?', [x.item]);
    const c = await cancelarOutros(S, x);
    assert.strictEqual(c.status, 400); assert.strictEqual(c.body.error, M2);
    ok(await encerrar(ALMOX, x), 'encerrar');
    assert.strictEqual((await foto(x)).status, 'ENCERRADA');
  });

  await test('[101 RN-02/RN-04] (Fase 5) dois itens (um vazio, outro com 1 na caixa; ids de item diferentes do da requisicao): as duas rotas M1, encerrar E1; devolvido o 1, cancela 200 e as duas reservas saem', async () => {
    const m1 = await material(4); const m2 = await material(4);
    const cr = await as(S, () => request(app).post('/api/requisicoes-material').send({
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-101', itens: [{ material_id: m1, quantidade: 2 }, { material_id: m2, quantidade: 2 }],
    }).then((r) => r));
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    ok(await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({}), 'aprovar');
    const its = await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
    // premissa: o item com caixa nao tem o id da requisicao (uma leitura `WHERE id = R` leria outro item e aceitaria).
    assert.ok(Number(its[1].id) !== Number(R), `premissa: id do item com caixa igual ao da requisicao ${JSON.stringify(its)} R=${R}`);
    const x = { R, item: its[1].id, m: m2 };
    ok(await separar({ R, item: its[1].id }, 1), 'separar 1 do item 2');
    for (const c of [await cancelarOutros(S, x), await cancelarAlmox(S, x)]) {
      assert.strictEqual(c.status, 400, JSON.stringify(c.body)); assert.strictEqual(c.body.error, M1);
    }
    const e = await encerrar(ALMOX, x);
    assert.strictEqual(e.status, 400); assert.strictEqual(e.body.error, E1);
    ok(await devolver({ R, item: its[1].id }, 1), 'devolver');
    ok(await cancelarOutros(S, x), 'cancelar');
    const rs = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [R]);
    assert.deepStrictEqual(rs.map((r) => r.status), ['LIBERADA', 'LIBERADA']);
  });

  await test('[101 B530] (Fase 5) quem nao pediu, pelos outros modulos, recebe a recusa generica tambem com material na caixa e com entrega (nao ve o estado)', async () => {
    for (const montarP of [comCaixa, P3]) {
      // eslint-disable-next-line no-await-in-loop
      const x = await montarP();
      // eslint-disable-next-line no-await-in-loop
      const c = await cancelarOutros(OUTRO, x);
      assert.strictEqual(c.status, 400); assert.strictEqual(c.body.error, RECUSA_OUTROS);
      // metade positiva: o dono recebe a recusa especifica
      // eslint-disable-next-line no-await-in-loop
      const d = await cancelarOutros(S, x);
      assert.ok([M1, M2].includes(d.body.error), JSON.stringify(d.body));
    }
  });

  // ══════════════ RN-06 — a reserva do dono ══════════════
  await test('[101 RN-06] P1: o dono (sem a acao) continua sem liberar a reserva na Em Separacao vazia -> 403 M3, reserva ATIVA (metade positiva: o almoxarife libera)', async () => {
    const x = await P1();
    const rid = (await dbGet(db, 'SELECT id FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [x.R])).id;
    const lib = await as(S, () => request(app).post(`${API}/reservas/${rid}/liberar`).send({}).then((r) => r));
    assert.strictEqual(lib.status, 403, JSON.stringify(lib.body));
    assert.strictEqual(lib.body.error, M3(x.numero));
    assert.deepStrictEqual((await foto(x)).reservas, ['ATIVA']);
    const lib2 = await as(ALMOX, () => request(app).post(`${API}/reservas/${rid}/liberar`).send({}).then((r) => r));
    ok(lib2, 'almoxarife libera');
  });

  // ══════════════ RN-05 — a trava por requisicao ══════════════
  await test('[101 RN-05] separar x cancelar: a separacao segura a trava (pausada no UPDATE do item); o cancelamento ESPERA na fila e depois recebe M1; EM_SEPARACAO com separado 2', async () => {
    const x = await P1();
    const p = armarPausa(/UPDATE itens_requisicao_almoxarifado SET quantidade_separada = \?/);
    const sep = separar(x, 2);
    await p.chegou;
    assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
    const canc = cancelarOutros(S, x);
    const ate = Date.now() + 3000;
    while (travaPorRequisicao.esperandoNaRequisicao(x.R) < 1 && Date.now() < ate) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.strictEqual(travaPorRequisicao.esperandoNaRequisicao(x.R), 1, 'o cancelamento nao entrou na fila da requisicao');
    p.soltar();
    ok(await sep, 'separar');
    const c = await canc;
    assert.strictEqual(c.status, 400, `cancelar: ${c.status} ${JSON.stringify(c.body)}`);
    assert.strictEqual(c.body.error, M1);
    const f = await foto(x);
    assert.deepStrictEqual([f.status, f.separado, f.reservas], ['EM_SEPARACAO', 2, ['ATIVA']]);
  });

  await test('[101 RN-05] separar x cancelar pela rota do almoxarifado: idem (espera, M1)', async () => {
    const x = await P1();
    const p = armarPausa(/UPDATE itens_requisicao_almoxarifado SET quantidade_separada = \?/);
    const sep = separar(x, 2);
    await p.chegou;
    const canc = cancelarAlmox(S, x);
    const ate = Date.now() + 3000;
    while (travaPorRequisicao.esperandoNaRequisicao(x.R) < 1 && Date.now() < ate) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.strictEqual(travaPorRequisicao.esperandoNaRequisicao(x.R), 1, 'o cancelamento nao entrou na fila da requisicao');
    p.soltar();
    ok(await sep, 'separar');
    const c = await canc;
    assert.strictEqual(c.status, 400, `cancelar: ${c.status} ${JSON.stringify(c.body)}`);
    assert.strictEqual(c.body.error, M1);
    assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
  });

  // ══════════════ RN-10 (parte da T1) — depois do fim ══════════════
  await test('[101 RN-10] cancelada a P1, a separacao seguinte recusa pelo status e o encerramento tambem', async () => {
    const x = await P1();
    ok(await cancelarOutros(S, x), 'cancelar');
    const s2 = await separar(x, 1);
    assert.strictEqual(s2.status, 400, JSON.stringify(s2.body));
    const e = await encerrar(ALMOX, x);
    assert.strictEqual(e.status, 400); assert.strictEqual(e.body.error, 'Transição inválida: CANCELADO → ENCERRADA');
    assert.strictEqual((await foto(x)).separado, 0);
  });

  db.run = origRun;
  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
