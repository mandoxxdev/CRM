/**
 * Etapa 92 (T5) — integracao cruzando os galhos: T0 x T1 x T2 x T3 x 74 x 76, pela rota e pelo servico.
 *
 * Os testes da T0-T3 provam cada porta com o concorrente SIMULADO (status trocado por UPDATE direto, reserva
 * montada pelo motor, status posto a mao). Este arquivo prova que as portas compoem com os escritores REAIS,
 * todos pelas rotas e com usuarios reais por header: S (sem perfil = PRODUCAO) pede e cancela pela porta dos
 * outros modulos; S2 (sem perfil) pede depois; o ALMOXARIFE separa, libera reserva e entrega; o GESTOR aprova
 * (a aprovacao e quem reserva); o ADMIN recebe a nota.
 *
 *  A (T1 x 76): o cancelamento perde o compare-and-set para o RECALCULO REAL da 76 (liberacao manual de uma das
 *    duas reservas leva a requisicao a PARCIALMENTE_RESERVADA), rele, vence, e a trilha conta o que trocou.
 *  B (T0 x T1 x T2): cancelamento no instante da reivindicacao da separacao (nada gravado); e a ordem inversa
 *    pela rota do almoxarifado, seguida ate a ENTREGA (a reserva vira CONSUMIDA — compoe com a 77).
 *  C (T1 x 74): a distribuicao da nota reserva para uma requisicao que S cancela no meio; a releitura da RN-09
 *    da 74 desfaz a reserva — vale tambem pela porta nova dos outros modulos (que antes nao aceitava AGUARDANDO).
 *  D (RN-08, B441): o material solto pelo cancelamento NAO e redistribuido para quem espera.
 *  E (T3): RN-05 (a) entre rotas reais — o /aprovar do GESTOR perde para o cancelamento de S sem acusar falha.
 *  Servico: separarRequisicao chamado direto contra o cancelamento — a guarda mora no servico.
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md (T5; a Fase 2 vale).
 *
 * Executar: cd server && node tests/api/cancelarOutrosModulosIntegracao.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 92T5', role: 'admin', is_superadmin: 1, email: 'a92t5@t.com' },
  S: { id: 9251, nome: 'Solicitante 92T5', role: 'user', email: 's92t5@t.com' }, // sem perfil = PRODUCAO
  S2: { id: 9252, nome: 'Solicitante2 92T5', role: 'user', email: 's292t5@t.com' }, // sem perfil
  ALMOX: { id: 9253, nome: 'Almox 92T5', role: 'user', email: 'x92t5@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  GESTOR: { id: 9254, nome: 'Gestor 92T5', role: 'user', email: 'g92t5@t.com', perfil_almoxarifado: PERFIS.GESTOR },
};
// Literais congeladas do plano (Contrato).
const S1 = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';
const R2 = 'Não é possível cancelar neste status';
const W1_PREFIXO = '[almoxarifado-aprovar] Falha ao desfazer reserva';
const I1 = (id, status) => `[almoxarifado-aprovar] Reserva ${id} ja estava ${status} — nada a desfazer`;
const RE_EM_SEPARACAO = /SET\s+status\s*=\s*'EM_SEPARACAO'/;
const RE_CANCELADO = /SET\s+status\s*=\s*'CANCELADO'/;
const RE_APROVAR = /SET\s+status\s*=\s*\?,\s*aprovador_id/;
const API = '/api/almoxarifado';

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);

(async () => {
  console.log('\n=== Etapa 92 (T5): integracao — cancelar pelos outros modulos x separacao x 74 x 76 x aprovar ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (sem header: ADMIN) — molde da 91/92.
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, body = {}) => request(app).post(u).set('x-teste-usuario', k).send(body).then((x) => x),
    put: (u, body = {}) => request(app).put(u).set('x-teste-usuario', k).send(body).then((x) => x),
  });

  // ── gancho no SQL: retém o comando, roda o gesto concorrente ATE A RESPOSTA, so entao emite ──
  const origRun = db.run.bind(db);
  let ganchos = []; // { re, fn, disparos, emissoes, armado, erro }
  db.run = function (sql, ...rest) {
    const s = String(sql);
    let retido = null;
    for (const g of ganchos) {
      if (!g.re.test(s)) continue;
      g.emissoes++;
      if (g.armado && !retido) { g.armado = false; g.disparos++; retido = g; }
    }
    if (retido) {
      retido.fn().then(() => origRun(sql, ...rest), (e) => { retido.erro = e; origRun(sql, ...rest); });
      return this;
    }
    return origRun(sql, ...rest);
  };
  const armar = (re, fn) => { const g = { re, fn, disparos: 0, emissoes: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };
  const afirmarGancho = (g, rotulo) => {
    assert.strictEqual(g.disparos, 1, `${rotulo}: o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, `${rotulo}: o gesto do gancho lancou: ${g.erro && g.erro.message}`);
  };

  // ── fixtures ──
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E92T5','92500000000175','ativo')")).lastID;
  const material = async (q, { critico = 0 } = {}) => {
    const c = `E92T5-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, material_critico, fornecedor_id)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?, ?)`, [c, `Mat ${c}`, critico, forn])).lastID;
    if (q > 0) {
      // Saldo pela porta de sempre (movimentacao v2 ENTRADA), como o plano descreve.
      const e = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: id, tipo: 'ENTRADA', quantidade: q, motivo: 'Ajuste', justificativa: 'e92t5 saldo' });
      assert.strictEqual(e.status, 201, `ENTRADA: ${e.status} ${JSON.stringify(e.body)}`);
    }
    return id;
  };
  const criarDe = async (k, itens) => {
    const cr = await como(k).post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-92T5',
      itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })),
    });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    assert.strictEqual(Number((await dbGet(db, 'SELECT solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [cr.body.id])).solicitante_id), USERS[k].id);
    return cr.body.id;
  };
  const aprovarComoGestor = async (R) => {
    const r = await como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
    assert.strictEqual(r.status, 200, `aprovar: ${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(db, 'SELECT status, aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(Number(row.aprovador_id), USERS.GESTOR.id, 'quem aprovou foi o GESTOR');
    return row.status;
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const itensDe = (R) => dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const reservasDe = (R) => dbAll(db, 'SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const mat = async (m) => dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r,
    quantidade_atual - COALESCE(quantidade_reservada,0) d FROM materiais_almoxarifado WHERE id = ?`, [m]);
  const rodadas = (R) => dbAll(db, 'SELECT * FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [R]);
  const trocas = (R) => dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE requisicao_id = ?', [R]);
  const trilha = (R, acao) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = ?`, [R, acao]);
  const cancelarOutros = (k, R) => como(k).put(`/api/requisicoes-material/${R}/cancelar`);
  const cancelarAlmox = (k, R) => como(k).put(`${API}/requisicoes/${R}/cancelar`);
  const separarRota = (R, pares) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, quantidade_separada]) => ({ item_id, quantidade_separada })),
  });
  const silenciar = async (fn) => {
    const oi = console.info; const ow = console.warn; const infos = []; const warns = [];
    console.info = (...a) => { infos.push(a.map(String).join(' ')); };
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    try { return { out: await fn(), infos, warns }; } finally { console.info = oi; console.warn = ow; }
  };
  /** A trilha CANCELAMENTO unica: quem, de onde, pela porta. */
  const afirmarTrilhaCancel = async (R, anterior, via) => {
    const tc = await trilha(R, 'CANCELAMENTO');
    assert.strictEqual(tc.length, 1, `trilha CANCELAMENTO: ${tc.length}`);
    assert.strictEqual(Number(tc[0].usuario_id), USERS.S.id, 'quem cancelou foi S');
    assert.strictEqual(JSON.parse(tc[0].dados_anteriores).status, anterior, 'a trilha tem de gravar o status que o UPDATE trocou');
    if (via) assert.strictEqual(JSON.parse(tc[0].dados_novos).via, via);
  };
  /** O cancelamento no instante da reivindicacao: a separacao nao gravou nada. */
  const afirmarNadaGravado = async (R, m, rids) => {
    assert.strictEqual(await st(R), 'CANCELADO', 'status CANCELADO (a separacao ressuscitou a requisicao)');
    for (const it of await itensDe(R)) {
      assert.strictEqual(Number(it.quantidade_separada || 0), 0, 'nada gravado: quantidade_separada');
      assert.strictEqual(it.origem_separacao_id, null, 'nada gravado: origem_separacao_id');
      assert.strictEqual(it.lote_separacao_id, null, 'nada gravado: lote_separacao_id');
    }
    assert.strictEqual((await rodadas(R)).length, 0, 'nada gravado: rodada');
    assert.strictEqual((await trocas(R)).length, 0, 'nada gravado: troca de origem');
    assert.strictEqual((await trilha(R, 'SEPARACAO')).length, 0, 'nada gravado: trilha SEPARACAO');
    for (const rid of rids) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [rid])).status, 'LIBERADA', 'reserva solta pelo cancelamento');
    }
    assert.strictEqual(Number((await mat(m)).r), 0, 'r=0');
    await afirmarTrilhaCancel(R, 'TOTALMENTE_RESERVADA', 'requisicoes-material');
  };

  // ── a nota pelas seis portas (molde: recebimentoReservaChegadaIntegracao) ──
  const pedidoAvulso = async (m, quantidade) => {
    const p = await como('ADMIN').post('/api/compras/pedidos', { fornecedor_id: forn, status: 'pendente',
      itens: [{ material_id: m, quantidade, valor_unitario: 1 }] });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    return { id: p.body.id, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [p.body.id])).id };
  };
  let nf = 0;
  const receber = async (pedido, m, quantidade) => {
    nf += 1;
    const { d } = await dbGet(db, "SELECT date('now', '-1 day') AS d");
    const itens = [{ material_id: m, pedido_item_id: pedido.linha, quantidade, quantidade_recebida: quantidade }];
    const A = como('ADMIN');
    const c = await A.post(`${API}/recebimentos`, { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    const conf = await A.put(`${API}/recebimentos/${id}/conferir`, { itens });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await A.post(`${API}/recebimentos/${id}/workflow`, { acao });
      assert.strictEqual(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`);
    }
    const f = await A.put(`${API}/recebimentos/${id}/fiscal`, {
      nota_fiscal: `NF-E92T5-${nf}`, fornecedor_id: forn, fornecedor_nome: 'Forn E92T5',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await A.post(`${API}/recebimentos/${id}/workflow`, { acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return id;
  };

  // ══════════════ Jornada A (T1 x 76): o compare-and-set contra o recalculo REAL ══════════════
  await test('[92 T5 A] S cancela uma TOTALMENTE de dois materiais; no instante do UPDATE o ALMOXARIFE libera a reserva de M2 (recalculo real da 76 -> PARCIALMENTE) -> o cancelamento rele e vence: 200, trilha PARCIALMENTE, as duas LIBERADA, r=0', async () => {
    const m1 = await material(4); const m2 = await material(4);
    const R1 = await criarDe('S', [[m1, 4], [m2, 4]]);
    assert.strictEqual(await aprovarComoGestor(R1), 'TOTALMENTE_RESERVADA');
    const rs0 = await reservasDe(R1);
    assert.strictEqual(rs0.filter((r) => r.status === 'ATIVA').length, 2, `premissa: duas reservas ATIVA: ${JSON.stringify(rs0)}`);
    const rM2 = rs0.find((r) => Number(r.material_id) === m2);
    let lib = null; let stNoGancho = null;
    const g = armar(RE_CANCELADO, async () => {
      lib = await comPrazo(como('ALMOX').post(`${API}/reservas/${rM2.id}/liberar`, { motivo: 'e92t5 A' }), 5000, 'liberar no gancho');
      stNoGancho = await st(R1);
    });
    let c;
    try { c = await comPrazo(cancelarOutros('S', R1), 15000, 'cancelamento'); } finally { desarmar(); }
    afirmarGancho(g, 'A');
    assert.strictEqual(lib.status, 200, `liberar: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.strictEqual(stNoGancho, 'PARCIALMENTE_RESERVADA', 'premissa: o recalculo real da 76 trocou o status no instante');
    assert.strictEqual(c.status, 200, `cancelamento: ${c.status} ${JSON.stringify(c.body)}`);
    assert.deepStrictEqual(c.body, { success: true });
    assert.strictEqual(await st(R1), 'CANCELADO');
    await afirmarTrilhaCancel(R1, 'PARCIALMENTE_RESERVADA', 'requisicoes-material');
    assert.strictEqual(g.emissoes, 2, `UPDATE do cancelamento emitido ${g.emissoes} vez(es) (perde, rele, vence)`);
    assert.deepStrictEqual((await reservasDe(R1)).map((r) => r.status), ['LIBERADA', 'LIBERADA']);
    assert.strictEqual(Number((await mat(m1)).r), 0, 'M1 r=0');
    assert.strictEqual(Number((await mat(m2)).r), 0, 'M2 r=0');
  });

  // ══════════════ Jornada B (T0 x T1 x T2): separacao x cancelamento, ate a entrega ══════════════
  await test('[92 T5 B1] R2 TOTALMENTE: o ALMOXARIFE separa 1 e S cancela pelos outros modulos no instante da reivindicacao -> separacao 400 S1, CANCELADO, nada gravado', async () => {
    const m = await material(4);
    const R = await criarDe('S', [[m, 4]]);
    assert.strictEqual(await aprovarComoGestor(R), 'TOTALMENTE_RESERVADA');
    const rids = (await reservasDe(R)).map((r) => r.id);
    const item = (await itensDe(R))[0].id;
    let cancel = null;
    const g = armar(RE_EM_SEPARACAO, async () => { cancel = await comPrazo(cancelarOutros('S', R), 5000, 'cancelamento no gancho'); });
    let sep;
    try { ({ out: sep } = await silenciar(() => comPrazo(separarRota(R, [[item, 1]]), 10000, 'separacao'))); } finally { desarmar(); }
    afirmarGancho(g, 'B1');
    assert.strictEqual(cancel && cancel.status, 200, `cancelamento: ${cancel && JSON.stringify(cancel.body)}`);
    assert.strictEqual(sep.status, 400, `separação 400: veio ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.error, S1);
    await afirmarNadaGravado(R, m, rids);
  });

  await test('[92 T5 B2] R3 TOTALMENTE (pede 1, nao critico): S cancela PELO ALMOXARIFADO e a separacao inteira roda no instante do UPDATE -> cancelamento 400 R2, EM_SEPARACAO, separado 1, reserva ATIVA; o ALMOXARIFE entrega -> ENTREGUE, reserva CONSUMIDA', async () => {
    const m = await material(4);
    const R = await criarDe('S', [[m, 1]]);
    assert.strictEqual(await aprovarComoGestor(R), 'TOTALMENTE_RESERVADA');
    const rs = await reservasDe(R);
    assert.strictEqual(rs.length, 1);
    const item = (await itensDe(R))[0].id;
    let sep = null;
    const g = armar(RE_CANCELADO, async () => { sep = await comPrazo(separarRota(R, [[item, 1]]), 10000, 'separacao no gancho'); });
    let cancel;
    try { cancel = await comPrazo(cancelarAlmox('S', R), 15000, 'cancelamento'); } finally { desarmar(); }
    afirmarGancho(g, 'B2');
    assert.strictEqual(sep && sep.status, 200, `separacao: ${sep && JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');
    assert.strictEqual(cancel.status, 400, `cancelamento: ${cancel.status} ${JSON.stringify(cancel.body)}`);
    assert.strictEqual(cancel.body.error, R2);
    assert.strictEqual(await st(R), 'EM_SEPARACAO', 'o cancelamento passou por cima da separacao');
    assert.strictEqual(Number((await itensDe(R))[0].quantidade_separada), 1);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [rs[0].id])).status, 'ATIVA');
    assert.strictEqual((await trilha(R, 'CANCELAMENTO')).length, 0);
    const rod = await rodadas(R);
    assert.strictEqual(rod.length, 1);
    assert.strictEqual(Number(rod[0].usuario_id), USERS.ALMOX.id, 'quem separou foi o ALMOXARIFE');
    // ... e a requisicao segue: o ALMOXARIFE entrega pela rota (a 77 consome a reserva).
    const e = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 1 }] });
    assert.strictEqual(e.status, 200, `entregar: ${e.status} ${JSON.stringify(e.body)}`);
    assert.strictEqual(await st(R), 'ENTREGUE');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [rs[0].id])).status, 'CONSUMIDA');
    assert.deepStrictEqual(await mat(m), { q: 3, r: 0, d: 3 });
  });

  // ══════════════ Jornada C (T1 x 74): a distribuicao da nota x o cancelamento de AGUARDANDO ══════════════
  await test('[92 T5 C] R4 AGUARDANDO_ESTOQUE: a nota de 4 chega e S cancela pelos outros modulos no instante do criarReserva da distribuicao -> nota 200, cancelamento 200, CANCELADO, nenhuma reserva ATIVA, q=4 r=0', async () => {
    const m3 = await material(0);
    const ped = await pedidoAvulso(m3, 4);
    const R4 = await criarDe('S', [[m3, 4]]);
    assert.strictEqual(await aprovarComoGestor(R4), 'AGUARDANDO_ESTOQUE');
    assert.strictEqual((await reservasDe(R4)).length, 0, 'premissa: sem reserva antes da nota');
    const original = stockService.criarReserva;
    let cancel = null; let chamadas = 0; let erroEspiao = null;
    stockService.criarReserva = async (dbx, user, data, opcoes) => {
      if (opcoes && Number(opcoes.requisicao_id) === R4 && chamadas++ === 0) {
        try { cancel = await comPrazo(cancelarOutros('S', R4), 5000, 'cancelamento no espiao'); } catch (e) { erroEspiao = e; }
      }
      return original(dbx, user, data, opcoes);
    };
    try { await silenciar(() => receber(ped, m3, 4)); } finally { stockService.criarReserva = original; }
    assert.strictEqual(chamadas, 1, `o espiao foi chamado ${chamadas} vez(es) para R4 — a distribuicao nao passou por criarReserva pelo objeto`);
    assert.ok(!erroEspiao, `o cancelamento no espiao lancou: ${erroEspiao && erroEspiao.message}`);
    assert.strictEqual(cancel && cancel.status, 200, `cancelamento: ${cancel && JSON.stringify(cancel.body)}`);
    assert.strictEqual(await st(R4), 'CANCELADO', 'nao ressuscita');
    const rs = await reservasDe(R4);
    assert.strictEqual(rs.filter((r) => r.status === 'ATIVA').length, 0, `reserva ATIVA presa na cancelada: ${JSON.stringify(rs.map((r) => [r.id, r.status]))}`);
    // A reserva nasceu (o espiao estava antes do criarReserva) e a releitura da RN-09 da 74 a desfez.
    assert.deepStrictEqual(rs.map((r) => r.status), ['LIBERADA'], 'a janela foi exercida: uma reserva nascida e desfeita');
    assert.deepStrictEqual(await mat(m3), { q: 4, r: 0, d: 4 });
    await afirmarTrilhaCancel(R4, 'AGUARDANDO_ESTOQUE', 'requisicoes-material');
  });

  // ══════════════ Jornada D (RN-08, B441): o solto nao e redistribuido ══════════════
  await test('[92 T5 D] R5 de S TOTALMENTE (4), R6 de S2 aprovada depois e esperando: S cancela R5 -> CANCELADO, r=0, R6 continua esperando sem reserva', async () => {
    const m4 = await material(4);
    const R5 = await criarDe('S', [[m4, 4]]);
    assert.strictEqual(await aprovarComoGestor(R5), 'TOTALMENTE_RESERVADA');
    const R6 = await criarDe('S2', [[m4, 4]]);
    const st6 = await aprovarComoGestor(R6);
    assert.strictEqual(st6, 'AGUARDANDO_ESTOQUE', `premissa: R6 esperando (veio ${st6})`);
    const c = await cancelarOutros('S', R5);
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await st(R5), 'CANCELADO');
    await afirmarTrilhaCancel(R5, 'TOTALMENTE_RESERVADA', 'requisicoes-material');
    assert.deepStrictEqual(await mat(m4), { q: 4, r: 0, d: 4 }, 'o material voltou solto');
    assert.strictEqual(await st(R6), 'AGUARDANDO_ESTOQUE', 'o cancelamento nao distribui (B441)');
    assert.strictEqual((await reservasDe(R6)).length, 0, 'R6 sem reserva');
  });

  // ══════════════ Jornada E (T3): o /aprovar do GESTOR perde para o cancelamento de S ══════════════
  await test('[92 T5 E] S cancela no instante do UPDATE guardado do /aprovar do GESTOR -> aprovar 400, CANCELADO, 0 ATIVA, uma LIBERACAO_RESERVA, nenhum W1, um I1', async () => {
    const m = await material(4);
    const R = await criarDe('S', [[m, 4]]);
    assert.strictEqual(await st(R), 'PENDENTE');
    let cancel = null;
    const g = armar(RE_APROVAR, async () => { cancel = await comPrazo(cancelarOutros('S', R), 5000, 'cancelamento no gancho'); });
    let res;
    try { res = await silenciar(() => comPrazo(como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`), 10000, 'aprovar')); } finally { desarmar(); }
    const { out: ap, warns, infos } = res;
    afirmarGancho(g, 'E');
    assert.strictEqual(cancel && cancel.status, 200, `cancelamento: ${cancel && JSON.stringify(cancel.body)}`);
    assert.strictEqual(ap.status, 400, `aprovar: ${ap.status} ${JSON.stringify(ap.body)}`);
    assert.strictEqual(ap.body.error, 'Transição inválida: CANCELADO → APROVADO');
    assert.strictEqual(await st(R), 'CANCELADO');
    await afirmarTrilhaCancel(R, 'PENDENTE', 'requisicoes-material');
    const rs = await reservasDe(R);
    assert.strictEqual(rs.length, 1, `reservas: ${JSON.stringify(rs)}`);
    assert.strictEqual(rs[0].status, 'LIBERADA');
    assert.strictEqual(Number((await mat(m)).r), 0);
    const libs = await dbAll(db, "SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'LIBERACAO_RESERVA'", [m]);
    assert.strictEqual(libs.length, 1, `LIBERACAO_RESERVA: ${libs.length}`);
    const w1 = warns.filter((l) => l.startsWith(W1_PREFIXO));
    assert.strictEqual(w1.length, 0, `W1 enganoso: ${JSON.stringify(w1)}`);
    const esperado = I1(rs[0].id, 'LIBERADA');
    assert.strictEqual(infos.filter((l) => l === esperado).length, 1, `sem a linha I1 "${esperado}": ${JSON.stringify(infos)}`);
  });

  // ══════════════ Pelo servico: a guarda e do servico, vale para qualquer chamador ══════════════
  await test('[92 T5 servico] separarRequisicao direto (ALMOXARIFE) numa TOTALMENTE aprovada pelo GESTOR, S cancela pelos outros modulos no instante -> lanca 400 S1, CANCELADO, nada gravado', async () => {
    const m = await material(4);
    const R = await criarDe('S', [[m, 4]]);
    assert.strictEqual(await aprovarComoGestor(R), 'TOTALMENTE_RESERVADA');
    const rids = (await reservasDe(R)).map((r) => r.id);
    const item = (await itensDe(R))[0].id;
    let cancel = null;
    const g = armar(RE_EM_SEPARACAO, async () => { cancel = await comPrazo(cancelarOutros('S', R), 5000, 'cancelamento no gancho'); });
    let erro = null; let ok = null;
    try {
      await silenciar(async () => {
        try {
          ok = await comPrazo(requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 1 }], { ...USERS.ALMOX }), 10000, 'servico');
        } catch (e) { erro = e; }
      });
    } finally { desarmar(); }
    afirmarGancho(g, 'servico');
    assert.strictEqual(cancel && cancel.status, 200, `cancelamento: ${cancel && JSON.stringify(cancel.body)}`);
    assert.ok(erro, `o servico nao recusou: ${JSON.stringify(ok)}`);
    assert.strictEqual(erro.status, 400, `status do erro: ${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, S1);
    await afirmarNadaGravado(R, m, rids);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
