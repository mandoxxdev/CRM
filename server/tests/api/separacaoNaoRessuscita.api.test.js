/**
 * Etapa 92 (T0, D (91), B436) — a separacao nao ressuscita requisicao cancelada.
 *
 * A separacao lia o status, validava, gravava `quantidade_separada`, a rodada e a troca de origem, e so
 * no fim gravava `status='EM_SEPARACAO'` com `WHERE id=?` (sem guarda). Um cancelamento que entrasse
 * nessa janela respondia 200 e a separacao passava por cima: a requisicao terminava EM_SEPARACAO com a
 * reserva LIBERADA, a trilha CANCELAMENTO gravada e as duas respostas 200 (sonda da Fase 0: 50/50 pela
 * rota do almoxarifado, 10/10 pela dos outros modulos em APROVADO). E EM_SEPARACAO nao se cancela mais.
 *
 * Agora a separacao REIVINDICA a requisicao (`UPDATE ... SET status='EM_SEPARACAO' WHERE id=? AND
 * status IN (PODE_SEPARAR)`) depois da validacao e ANTES de gravar qualquer coisa; perdeu -> o 400 de
 * sempre (S1), I2 no console e nada gravado. E se uma gravacao falhar depois da reivindicacao sem a
 * rodada ter sido inserida, o status lido volta (RN-09) — senao quem pediu perderia o Cancelar.
 *
 * RN-03 e RN-09. Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md
 * A T1/T2 acrescentam casos NO FIM deste arquivo (sem renumerar os da T0).
 *
 * Executar: cd server && node tests/api/separacaoNaoRessuscita.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 92', role: 'admin', is_superadmin: 1, email: 'a92@t.com' },
  S: { id: 9201, nome: 'Solicitante 92', role: 'user', email: 's92@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9202, nome: 'Almox 92', role: 'user', email: 'x92@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
// Literais congeladas do plano (Contrato).
const S1 = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';
const R1 = 'Requisição não encontrada ou não pode ser cancelada';
const I2 = (id, status) => `[almoxarifado-separacao] Requisicao ${id} saiu de ${status} antes da separacao gravar — recusada`;
const RE_EM_SEPARACAO = /SET\s+status\s*=\s*'EM_SEPARACAO'/;
const RE_UPDATE_ITEM = /UPDATE\s+itens_requisicao_almoxarifado\s+SET\s+quantidade_separada\s*=/;
const RE_COMPARE_AND_CLEAR = /SET\s+status\s*=\s*'EM_SEPARACAO'[\s\S]*conferido_por_id\s*=\s*NULL[\s\S]*WHERE\s+id\s*=\s*\?\s+AND\s+conferido_por_id\s+IS\s+\?/;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);

(async () => {
  console.log('\n=== Etapa 92 (T0): a separacao nao ressuscita requisicao cancelada ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (sem header: ADMIN) — S cancela, ALMOX separa, no mesmo teste.
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, body = {}) => request(app).post(u).set('x-teste-usuario', k).send(body).then((x) => x),
    put: (u, body = {}) => request(app).put(u).set('x-teste-usuario', k).send(body).then((x) => x),
  });

  // ── gancho no SQL (molde: reservaRecalculoRevisaoFase5 / sonda92-medir) ──
  const origRun = db.run.bind(db);
  let ganchos = []; // { re, fn, disparos, falhar }
  db.run = function (sql, ...rest) {
    const s = String(sql);
    for (const g of ganchos) {
      if (g.armado && g.re.test(s)) {
        g.armado = false; g.disparos++;
        if (g.falhar) {
          const cb = rest.find((x) => typeof x === 'function');
          process.nextTick(() => cb && cb.call({}, new Error(g.falhar)));
          return this;
        }
        g.fn().then(() => origRun(sql, ...rest), (e) => { g.erro = e; origRun(sql, ...rest); });
        return this;
      }
    }
    return origRun(sql, ...rest);
  };
  const armar = (re, fn) => { const g = { re, fn, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const armarFalha = (re, msg) => { const g = { re, falhar: msg, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };

  const material = async (q) => {
    const c = `E92T0-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  // Requisicao criada por S pela rota dos outros modulos; status e reserva de 4 montados (estado da tela).
  const montar = async (status, { reservar } = {}) => {
    const m = await material(4);
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-92T0', itens: [{ material_id: m, quantidade: 4 }],
    });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    assert.strictEqual(Number((await dbGet(db, 'SELECT solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [R])).solicitante_id), USERS.S.id);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    let rid = null;
    if (reservar) {
      rid = (await stockService.criarReserva(db, USERS.ADMIN, { material_id: m, quantidade: 4 }, { requisicao_id: R, item_requisicao_id: item })).id;
    }
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', [status, R]);
    return { m, R, item, rid };
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const itemRow = (id) => dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [id]);
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const reservada = async (m) => Number((await dbGet(db, 'SELECT COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [m])).r);
  const rodadas = (R) => dbAll(db, 'SELECT * FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [R]);
  const trocas = (R) => dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R]);
  const trilha = (R, acao) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = ?`, [R, acao]);
  const rotaCancelar = (rota, R) => (rota === 'outros' ? `/api/requisicoes-material/${R}/cancelar` : `/api/almoxarifado/requisicoes/${R}/cancelar`);
  const comInfo = async (fn) => {
    const orig = console.info; const linhas = [];
    console.info = (...a) => { linhas.push(a.map(String).join(' ')); };
    try { return { out: await fn(), linhas }; } finally { console.info = orig; }
  };

  // Afirmacoes comuns de RN-03: a cancelada continua cancelada e a separacao nao gravou nada.
  const afirmarNadaGravado = async ({ m, R, item, rid }, cancel, g) => {
    assert.strictEqual(g.disparos, 1, `o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, `o gesto do gancho lancou: ${g.erro && g.erro.message}`);
    assert.ok(cancel, 'o cancelamento nao rodou no gancho');
    assert.strictEqual(cancel.status, 200, `cancelamento: ${cancel.status} ${JSON.stringify(cancel.body)}`);
    assert.strictEqual(await st(R), 'CANCELADO', 'status CANCELADO (a separacao ressuscitou a requisicao)');
    const it = await itemRow(item);
    assert.strictEqual(Number(it.quantidade_separada || 0), 0, 'nada gravado: quantidade_separada');
    assert.strictEqual(it.origem_separacao_id, null, 'nada gravado: origem_separacao_id');
    assert.strictEqual(it.lote_separacao_id, null, 'nada gravado: lote_separacao_id');
    assert.strictEqual((await rodadas(R)).length, 0, 'nada gravado: rodada');
    assert.strictEqual((await trocas(R)).length, 0, 'nada gravado: troca de origem');
    assert.strictEqual((await trilha(R, 'SEPARACAO')).length, 0, 'nada gravado: trilha SEPARACAO');
    const tc = await trilha(R, 'CANCELAMENTO');
    assert.strictEqual(tc.length, 1, `trilha CANCELAMENTO: ${tc.length}`);
    assert.strictEqual(Number(tc[0].usuario_id), USERS.S.id, 'quem cancelou foi S');
    if (rid) assert.strictEqual((await reserva(rid)).status, 'LIBERADA', 'reserva solta pelo cancelamento');
    assert.strictEqual(await reservada(m), 0);
  };

  // ══════════════ RN-03 pela rota — almoxarifado (5 status) e outros modulos (APROVADO) ══════════════
  const STATUS_CORRIDA = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'];
  const COM_RESERVA = ['APROVADO', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'];
  const combinacoes = [];
  for (const s of STATUS_CORRIDA) for (const comQtd of [true, false]) combinacoes.push(['almox', s, comQtd]);
  for (const comQtd of [true, false]) combinacoes.push(['outros', 'APROVADO', comQtd]);
  let primeiroComInfo = true;
  for (const [rota, status, comQtd] of combinacoes) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-03] rota ${rota} ${status} ${comQtd ? 'com' : 'sem'} quantidade: cancelamento no instante da reivindicacao -> separacao 400 S1, CANCELADO, nada gravado`, async () => {
      const ctx = await montar(status, { reservar: COM_RESERVA.includes(status) });
      let cancel = null;
      const g = armar(RE_EM_SEPARACAO, async () => {
        cancel = await comPrazo(como('S').put(rotaCancelar(rota, ctx.R)), 5000, 'cancelamento no gancho');
      });
      let sep; let linhas = [];
      try {
        ({ out: sep, linhas } = await comInfo(() => comPrazo(como('ALMOX').put(`/api/almoxarifado/requisicoes/${ctx.R}/separar`, {
          itens_separados: comQtd ? [{ item_id: ctx.item, quantidade_separada: 1 }] : [],
        }), 10000, 'separacao')));
      } finally { desarmar(); }
      assert.strictEqual(sep.status, 400, `separação 400: veio ${sep.status} ${JSON.stringify(sep.body)}`);
      assert.strictEqual(sep.body.error, S1);
      await afirmarNadaGravado(ctx, cancel, g);
      if (primeiroComInfo) {
        primeiroComInfo = false;
        const esperado = I2(ctx.R, status);
        assert.strictEqual(linhas.filter((l) => l === esperado).length, 1, `sem a linha I2 "${esperado}": ${JSON.stringify(linhas)}`);
      }
    });
  }

  // ══════════════ RN-03 pelo servico — a guarda mora no servico, nao na rota ══════════════
  for (const comQtd of [true, false]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-03] servico separarRequisicao APROVADO ${comQtd ? 'com' : 'sem'} quantidade: cancelamento (outros modulos) no instante -> lanca 400 S1, CANCELADO, nada gravado`, async () => {
      const ctx = await montar('APROVADO', { reservar: true });
      let cancel = null;
      const g = armar(RE_EM_SEPARACAO, async () => {
        cancel = await comPrazo(como('S').put(rotaCancelar('outros', ctx.R)), 5000, 'cancelamento no gancho');
      });
      let erro = null; let ok = null;
      try {
        ok = await comPrazo(requisitionService.separarRequisicao(db, ctx.R,
          comQtd ? [{ item_id: ctx.item, quantidade_separada: 1 }] : [], { ...USERS.ALMOX }), 10000, 'servico');
      } catch (e) { erro = e; } finally { desarmar(); }
      assert.ok(erro, `o servico nao recusou: ${JSON.stringify(ok)}`);
      assert.strictEqual(erro.status, 400, `status do erro: ${erro.status} ${erro.message}`);
      assert.strictEqual(erro.message, S1);
      await afirmarNadaGravado(ctx, cancel, g);
    });
  }

  // ══════════════ RN-09 — a gravacao que falha depois da reivindicacao devolve o status ══════════════
  // (a) de APROVADO e de PARCIALMENTE_ATENDIDA: falha no UPDATE do item (a primeira gravacao).
  for (const status of ['APROVADO', 'PARCIALMENTE_ATENDIDA']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-09] (a) ${status}: o UPDATE do item falha depois da reivindicacao -> erro, status volta a ${status}, 0 rodadas${status === 'APROVADO' ? ', S ainda cancela' : ''}`, async () => {
      const ctx = await montar(status, { reservar: false });
      if (status === 'PARCIALMENTE_ATENDIDA') {
        // 4 pedidos, 1 separado e entregue: pendente de separacao 3.
        await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 1, quantidade_entregue = 1, quantidade_atendida = 1 WHERE id = ?', [ctx.item]);
      }
      const g = armarFalha(RE_UPDATE_ITEM, 'falha injetada 92T0');
      let sep;
      const ow = console.warn; console.warn = () => {};
      try {
        sep = await comPrazo(como('ALMOX').put(`/api/almoxarifado/requisicoes/${ctx.R}/separar`, {
          itens_separados: [{ item_id: ctx.item, quantidade_separada: 1 }],
        }), 10000, 'separacao');
      } finally { desarmar(); console.warn = ow; }
      assert.strictEqual(g.disparos, 1, `o gancho de falha disparou ${g.disparos} vez(es)`);
      assert.strictEqual(sep.status, 500, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
      assert.strictEqual(sep.body.error, 'falha injetada 92T0');
      assert.strictEqual(await st(ctx.R), status, 'o status nao voltou (requisicao presa em EM_SEPARACAO)');
      assert.strictEqual((await rodadas(ctx.R)).length, 0);
      if (status === 'APROVADO') {
        const c = await como('S').put(rotaCancelar('outros', ctx.R));
        assert.strictEqual(c.status, 200, `S nao conseguiu cancelar: ${c.status} ${JSON.stringify(c.body)}`);
        assert.strictEqual(await st(ctx.R), 'CANCELADO');
      }
    });
  }

  await test('[92 RN-09] (b) EM_SEPARACAO (Iniciar Separacao ja feito): a mesma falha -> erro, continua EM_SEPARACAO', async () => {
    const ctx = await montar('EM_SEPARACAO', { reservar: false });
    const g = armarFalha(RE_UPDATE_ITEM, 'falha injetada 92T0b');
    let sep;
    const ow = console.warn; console.warn = () => {};
    try {
      sep = await comPrazo(como('ALMOX').put(`/api/almoxarifado/requisicoes/${ctx.R}/separar`, {
        itens_separados: [{ item_id: ctx.item, quantidade_separada: 1 }],
      }), 10000, 'separacao');
    } finally { desarmar(); console.warn = ow; }
    assert.strictEqual(g.disparos, 1);
    assert.strictEqual(sep.status, 500, JSON.stringify(sep.body));
    assert.strictEqual(await st(ctx.R), 'EM_SEPARACAO');
    assert.strictEqual((await rodadas(ctx.R)).length, 0);
  });

  await test('[92 RN-09] (c) APROVADO: a falha vem DEPOIS da rodada (compare-and-clear) -> erro, EM_SEPARACAO, rodada gravada, nada devolvido', async () => {
    const ctx = await montar('APROVADO', { reservar: false });
    const g = armarFalha(RE_COMPARE_AND_CLEAR, 'falha injetada 92T0c');
    let sep;
    const ow = console.warn; console.warn = () => {};
    try {
      sep = await comPrazo(como('ALMOX').put(`/api/almoxarifado/requisicoes/${ctx.R}/separar`, {
        itens_separados: [{ item_id: ctx.item, quantidade_separada: 1 }],
      }), 10000, 'separacao');
    } finally { desarmar(); console.warn = ow; }
    assert.strictEqual(g.disparos, 1, `o gancho de falha disparou ${g.disparos} vez(es)`);
    assert.strictEqual(sep.status, 500, JSON.stringify(sep.body));
    assert.strictEqual(await st(ctx.R), 'EM_SEPARACAO', 'com a rodada gravada o status nao pode voltar');
    const rs = await rodadas(ctx.R);
    assert.strictEqual(rs.length, 1);
    assert.strictEqual(Number(rs[0].usuario_id), USERS.ALMOX.id, 'quem separou foi o ALMOXARIFE');
  });


  // ══════════════ T1 — os quatro status novos pela rota dos outros modulos (RN-03) e a ordem inversa (RN-04) ══════════════
  for (const status of ['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']) {
    for (const comQtd of [true, false]) {
      // eslint-disable-next-line no-await-in-loop
      await test(`[92 RN-03] rota outros ${status} ${comQtd ? 'com' : 'sem'} quantidade: cancelamento no instante da reivindicacao -> separacao 400 S1, CANCELADO, nada gravado`, async () => {
        const ctx = await montar(status, { reservar: COM_RESERVA.includes(status) });
        let cancel = null;
        const g = armar(RE_EM_SEPARACAO, async () => {
          cancel = await comPrazo(como('S').put(rotaCancelar('outros', ctx.R)), 5000, 'cancelamento no gancho');
        });
        let sep;
        const oi = console.info; console.info = () => {};
        try {
          sep = await comPrazo(como('ALMOX').put(`/api/almoxarifado/requisicoes/${ctx.R}/separar`, {
            itens_separados: comQtd ? [{ item_id: ctx.item, quantidade_separada: 1 }] : [],
          }), 10000, 'separacao');
        } finally { desarmar(); console.info = oi; }
        assert.strictEqual(sep.status, 400, `separação 400: veio ${sep.status} ${JSON.stringify(sep.body)}`);
        assert.strictEqual(sep.body.error, S1);
        await afirmarNadaGravado(ctx, cancel, g);
      });
    }
  }

  // RN-04 (ordem inversa): a separacao inteira roda no instante do UPDATE do cancelamento.
  const RE_CANCELADO = /SET\s+status\s*=\s*'CANCELADO'/;
  const R2 = 'Não é possível cancelar neste status';
  const ordemInversa = async (rota, status) => {
    const ctx = await montar(status, { reservar: true });
    let sep = null;
    const g = armar(RE_CANCELADO, async () => {
      sep = await comPrazo(como('ALMOX').put(`/api/almoxarifado/requisicoes/${ctx.R}/separar`, {
        itens_separados: [{ item_id: ctx.item, quantidade_separada: 1 }],
      }), 10000, 'separacao no gancho');
    });
    let cancel;
    try {
      cancel = await comPrazo(como('S').put(rotaCancelar(rota, ctx.R)), 15000, 'cancelamento');
    } finally { desarmar(); }
    assert.strictEqual(g.disparos, 1, `o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, `a separacao no gancho lancou: ${g.erro && g.erro.message}`);
    assert.ok(sep, 'a separacao nao rodou no gancho');
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');
    assert.strictEqual(cancel.status, 400, `cancelamento: ${cancel.status} ${JSON.stringify(cancel.body)}`);
    assert.strictEqual(cancel.body.error, rota === 'outros' ? R1 : R2);
    assert.strictEqual(await st(ctx.R), 'EM_SEPARACAO', 'o cancelamento passou por cima da separacao');
    assert.strictEqual((await reserva(ctx.rid)).status, 'ATIVA');
    assert.strictEqual(Number((await itemRow(ctx.item)).quantidade_separada), 1);
    assert.strictEqual((await trilha(ctx.R, 'CANCELAMENTO')).length, 0);
    const rs = await rodadas(ctx.R);
    assert.strictEqual(rs.length, 1);
    assert.strictEqual(Number(rs[0].usuario_id), USERS.ALMOX.id, 'quem separou foi o ALMOXARIFE');
  };
  for (const status of ['APROVADO', 'TOTALMENTE_RESERVADA']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-04] rota outros ${status}: a separacao inteira no instante do UPDATE do cancelamento -> separacao 200, cancelamento 400 R1, EM_SEPARACAO, reserva ATIVA`, () => ordemInversa('outros', status));
  }


  // ══════════════ T2 (C153, B437) — o cancelamento do almoxarifado com compare-and-set ══════════════
  for (const status of ['APROVADO', 'TOTALMENTE_RESERVADA']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[92 RN-04] rota almox ${status}: a separacao inteira no instante do UPDATE do cancelamento -> separacao 200, cancelamento 400 R2, EM_SEPARACAO, reserva ATIVA`, () => ordemInversa('almox', status));
  }

  await test('[92 RN-04] (b) rota almox: TOTALMENTE -> PARCIALMENTE no instante do UPDATE -> 200, CANCELADO, trilha PARCIALMENTE_RESERVADA (a nova tentativa)', async () => {
    const ctx = await montar('TOTALMENTE_RESERVADA', { reservar: true });
    let emissoes = 0;
    const origRunLocal = db.run;
    // Por cima do gancho geral: conta as emissoes e troca o status na primeira (simula o recalculo da 76).
    db.run = function (sql, ...rest) {
      if (RE_CANCELADO.test(String(sql))) {
        emissoes++;
        if (emissoes === 1) {
          origRun('UPDATE requisicoes_almoxarifado SET status = ? WHERE id = ?', ['PARCIALMENTE_RESERVADA', ctx.R],
            () => origRunLocal.call(db, sql, ...rest));
          return this;
        }
      }
      return origRunLocal.call(db, sql, ...rest);
    };
    let c;
    try {
      c = await comPrazo(como('S').put(rotaCancelar('almox', ctx.R)), 10000, 'cancelamento');
    } finally { db.run = origRunLocal; }
    assert.strictEqual(c.status, 200, `cancelamento: ${c.status} ${JSON.stringify(c.body)}`);
    assert.deepStrictEqual(c.body, { success: true });
    assert.strictEqual(emissoes, 2, `UPDATE emitido ${emissoes} vez(es)`);
    assert.strictEqual(await st(ctx.R), 'CANCELADO');
    const tc = await trilha(ctx.R, 'CANCELAMENTO');
    assert.strictEqual(tc.length, 1);
    assert.strictEqual(JSON.parse(tc[0].dados_anteriores).status, 'PARCIALMENTE_RESERVADA', 'a trilha tem de gravar o status que o UPDATE trocou');
    assert.strictEqual(Number(tc[0].usuario_id), USERS.S.id);
    assert.strictEqual((await reserva(ctx.rid)).status, 'LIBERADA');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
