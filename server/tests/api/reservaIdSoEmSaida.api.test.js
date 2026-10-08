/**
 * Etapa 91 (T4, D(77), B427) — `reserva_id` so vale numa saida que consome a reserva.
 *
 * Ate a 91 o motor (`stockService.registrarMovimentacao`) aceitava `reserva_id` em QUALQUER tipo: so a
 * saida olhava a coluna (`consumindoReserva`); uma ENTRADA, um AJUSTE ou uma DEVOLUCAO pela v2 com o
 * `reserva_id` de uma reserva gravavam a coluna no livro e deixavam a reserva intocada (sonda da Fase 0:
 * 201 nos tres) — o livro passava a dizer que o movimento "era da reserva" sem que nada tivesse
 * acontecido com ela. A `/transferencias` repassa o body cru, entao tinha a mesma porta.
 *
 * Agora o MOTOR recusa (400, literal M1) `reserva_id` em tipo que nao e saida, para qualquer origem de
 * reserva (requisicao ou manual), exceto os lancamentos internos RESERVA/LIBERACAO_RESERVA de
 * `criarReserva`/`liberarReserva` (que a v2 nem aceita — TIPOS_RETENCAO). A checagem vem DEPOIS da
 * validacao de tipo, do material inexistente e do material inativo (precedencia).
 *
 * RN-11. Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa91-inversao-inspecao-aprovar.md (T4)
 *
 * Executar: cd server && node tests/api/reservaIdSoEmSaida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { REGRAS_VINCULO } = require('../../services/almoxarifado/movementRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 91T4', role: 'admin', is_superadmin: 1, email: 'a91t4@t.com' };
const SOL = { id: 9141, nome: 'Sol 91T4', role: 'user', email: 's91t4@t.com' };
const ALMOXARIFE = { id: 9144, nome: 'Almox 91T4', role: 'user', perfil_almoxarifado: 'ALMOXARIFE', email: 'x91t4@t.com' };
const API = '/api/almoxarifado';
// Literal congelada do plano (Contrato, M1).
const M1 = (tipo) => `reserva_id só vale numa saída que consome a reserva — o tipo ${tipo} não consome reserva; tire o reserva_id do movimento`;
// A literal da Etapa 77 (reserva de requisicao numa saida avulsa) — continua valendo.
const M1_77 = (reservaId, numero) => `A reserva ${reservaId} é da requisição ${numero} — o material reservado para ela só sai pela entrega da requisição (tela Requisições), não por movimentação avulsa`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 91 (T4): reserva_id so numa saida (D(77)) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async (q, { ativo = 1 } = {}) => {
    const c = `E91T4-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, ?, 0)`, [c, `Mat ${c}`, q, ativo])).lastID;
  };
  const localizacao = async (p) => (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES (?,?)',
    [`${p}-${++seq}`, `${p} ${seq}`])).lastID;
  // Requisicao de 4 pedida por SOL e aprovada pelo ADMIN pela rota: a reserva nasce origem REQUISICAO.
  const reqAprovada = async ({ estoque = 4 } = {}) => {
    const m = await material(estoque);
    const numero = `REQ-E91T4-${++seq}`;
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, ?, 'PENDENTE', 'NORMAL', '2026-09-01 10:00:00', 1)`, [numero, SOL.id, SOL.nome])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?,?,4,0,0,0)`, [R, m]);
    setUser({ ...ADMIN });
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    const r = await dbGet(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [R]);
    assert.ok(r, 'a aprovacao tinha de criar a reserva');
    assert.strictEqual(r.origem, 'REQUISICAO');
    return { m, R, numero, r };
  };
  const reservaManual = async ({ estoque = 10 } = {}) => {
    const m = await material(estoque);
    const rr = await as(ALMOXARIFE, () => request(app).post(`${API}/reservas`)
      .send({ material_id: m, quantidade: 4, projeto_id: 7 }).then((x) => x));
    assert.strictEqual(rr.status, 201, JSON.stringify(rr.body));
    const r = await dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [rr.body.id]);
    assert.strictEqual(r.origem, 'MANUAL');
    return { m, r };
  };
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const mat = (id) => dbGet(db, `SELECT quantidade_atual, COALESCE(quantidade_reservada,0) AS reservada
    FROM materiais_almoxarifado WHERE id = ?`, [id]);
  const livro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
  const v2 = (body) => as(ALMOXARIFE, () => request(app).post(`${API}/movimentacoes/v2`)
    .send({ justificativa: 'teste 91', motivo: 'teste 91', ...body }).then((x) => x));
  const foto = async (m, rId) => {
    const rv = await reserva(rId);
    return { mat: await mat(m), livro: await livro(m), reserva: [rv.status, Number(rv.quantidade), Number(rv.quantidade_utilizada || 0)] };
  };
  const extra = (tipo) => (REGRAS_VINCULO[tipo] && REGRAS_VINCULO[tipo].vinculo === 'os_ou_projeto' ? { projeto_id: 7 } : {});

  // ══════════════ RN-11 — pela v2, reserva de REQUISICAO ══════════════
  for (const [tipo, quantidade] of [['ENTRADA', 2], ['AJUSTE', 6], ['DEVOLUCAO', 2]]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[91 RN-11] v2 ${tipo} com o reserva_id de uma reserva de requisicao: 400 M1, nada mudou`, async () => {
      const alvo = await reqAprovada();
      const antes = await foto(alvo.m, alvo.r.id);
      assert.deepStrictEqual(antes.reserva, ['ATIVA', 4, 0]);
      const s = await v2({ material_id: alvo.m, tipo, quantidade, reserva_id: alvo.r.id, ...extra(tipo) });
      assert.strictEqual(s.status, 400, `${tipo} aceitou reserva_id: ${s.status} ${JSON.stringify(s.body)}`);
      assert.strictEqual(s.body.error, M1(tipo));
      assert.deepStrictEqual(await foto(alvo.m, alvo.r.id), antes, 'algo mudou (livro, saldo ou reserva)');
    });
  }

  // ══════════════ RN-11 — reserva MANUAL: o mesmo 400 ══════════════
  await test('[91 RN-11] v2 ENTRADA com o reserva_id de uma reserva MANUAL: o mesmo 400 M1, nada mudou', async () => {
    const alvo = await reservaManual();
    const antes = await foto(alvo.m, alvo.r.id);
    const s = await v2({ material_id: alvo.m, tipo: 'ENTRADA', quantidade: 2, reserva_id: alvo.r.id });
    assert.strictEqual(s.status, 400, `ENTRADA citando reserva manual aceita: ${s.status} ${JSON.stringify(s.body)}`);
    assert.strictEqual(s.body.error, M1('ENTRADA'));
    assert.deepStrictEqual(await foto(alvo.m, alvo.r.id), antes);
  });

  // ══════════════ RN-11 — pela /transferencias (repassa o body cru) ══════════════
  await test('[91 RN-11] /transferencias com origem e destino validos + reserva_id: 400 M1, nada mudou', async () => {
    const alvo = await reqAprovada();
    const origem = await localizacao('E91T4-O');
    const destino = await localizacao('E91T4-D');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: alvo.m, tipo: 'ENTRADA', quantidade: 6, localizacao_destino_id: origem, motivo: 'setup' });
    // Controle de que a transferencia em si e valida: sem reserva_id ela passa.
    const ok = await as(ALMOXARIFE, () => request(app).post(`${API}/transferencias`)
      .send({ material_id: alvo.m, quantidade: 1, localizacao_origem_id: origem, localizacao_destino_id: destino }).then((x) => x));
    assert.strictEqual(ok.status, 201, `a transferencia sem reserva_id tinha de passar: ${JSON.stringify(ok.body)}`);
    const antes = await foto(alvo.m, alvo.r.id);
    const s = await as(ALMOXARIFE, () => request(app).post(`${API}/transferencias`)
      .send({ material_id: alvo.m, quantidade: 2, localizacao_origem_id: origem, localizacao_destino_id: destino,
        reserva_id: alvo.r.id }).then((x) => x));
    assert.strictEqual(s.status, 400, `TRANSFERENCIA aceitou reserva_id: ${s.status} ${JSON.stringify(s.body)}`);
    assert.strictEqual(s.body.error, M1('TRANSFERENCIA'));
    assert.deepStrictEqual(await foto(alvo.m, alvo.r.id), antes);
  });

  // ══════════════ RN-11 — pelo servico ══════════════
  await test('[91 RN-11] servico: registrarMovimentacao({ tipo: ENTRADA, reserva_id }) lanca 400 M1, nada mudou', async () => {
    const alvo = await reqAprovada();
    const antes = await foto(alvo.m, alvo.r.id);
    let erro = null;
    try {
      await stockService.registrarMovimentacao(db, ADMIN, {
        material_id: alvo.m, tipo: 'ENTRADA', quantidade: 2, reserva_id: alvo.r.id, motivo: 'teste 91' });
    } catch (e) { erro = e; }
    assert.ok(erro, 'o servico aceitou ENTRADA com reserva_id');
    assert.strictEqual(erro.status, 400, `${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, M1('ENTRADA'));
    assert.deepStrictEqual(await foto(alvo.m, alvo.r.id), antes);
  });

  // ══════════════ metade positiva ══════════════
  await test('[91 RN-11] metade positiva: criarReserva grava RESERVA e liberarReserva grava LIBERACAO_RESERVA, ambos COM reserva_id', async () => {
    const m = await material(10);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 3, projeto_id: 7 });
    const rid = Number(r.id || r.reserva_id || r.lastID);
    assert.ok(rid, `criarReserva nao devolveu o id: ${JSON.stringify(r)}`);
    const movR = await dbGet(db, `SELECT reserva_id, quantidade FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'RESERVA' ORDER BY id DESC LIMIT 1`, [m]);
    assert.ok(movR, 'sem linha RESERVA no livro');
    assert.deepStrictEqual([Number(movR.reserva_id), Number(movR.quantidade)], [rid, 3]);
    await stockService.liberarReserva(db, ADMIN, rid, null, { motivo: 'teste 91' });
    assert.strictEqual((await reserva(rid)).status, 'LIBERADA');
    const movL = await dbGet(db, `SELECT reserva_id, quantidade FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'LIBERACAO_RESERVA' ORDER BY id DESC LIMIT 1`, [m]);
    assert.ok(movL, 'sem linha LIBERACAO_RESERVA no livro');
    assert.deepStrictEqual([Number(movL.reserva_id), Number(movL.quantidade)], [rid, 3]);
    assert.deepStrictEqual(await mat(m), { quantidade_atual: 10, reservada: 0 });
  });

  await test('[91 RN-11] metade positiva: SAIDA com reserva MANUAL pela v2 continua consumindo (201); com a de requisicao, a M1 da 77', async () => {
    const man = await reservaManual();
    const s = await v2({ material_id: man.m, tipo: 'SAIDA', quantidade: 4, reserva_id: man.r.id });
    assert.strictEqual(s.status, 201, `a saida com reserva manual foi recusada: ${JSON.stringify(s.body)}`);
    assert.strictEqual((await reserva(man.r.id)).status, 'CONSUMIDA');
    const alvo = await reqAprovada();
    const s2 = await v2({ material_id: alvo.m, tipo: 'SAIDA', quantidade: 4, reserva_id: alvo.r.id });
    assert.strictEqual(s2.status, 400, JSON.stringify(s2.body));
    assert.strictEqual(s2.body.error, M1_77(alvo.r.id, alvo.numero));
  });

  // ══════════════ precedencia ══════════════
  const viaServico = async (params) => {
    try { await stockService.registrarMovimentacao(db, ADMIN, { quantidade: 2, motivo: 'teste 91', ...params }); }
    catch (e) { return e; }
    return null;
  };
  await test('[91 RN-11] precedencia: tipo invalido com reserva_id -> "Tipo de movimento inválido"', async () => {
    const alvo = await reqAprovada();
    const e = await viaServico({ material_id: alvo.m, tipo: 'TIPO_FORJADO', reserva_id: alvo.r.id });
    assert.ok(e, 'aceitou tipo forjado');
    assert.strictEqual(e.message, 'Tipo de movimento inválido');
  });
  await test('[91 RN-11] precedencia: material inexistente com reserva_id -> "Material não encontrado"', async () => {
    const alvo = await reqAprovada();
    const e = await viaServico({ material_id: 99999999, tipo: 'ENTRADA', reserva_id: alvo.r.id });
    assert.ok(e, 'aceitou material inexistente');
    assert.strictEqual(e.message, 'Material não encontrado');
  });
  await test('[91 RN-11] precedencia: material inativo com reserva_id -> "Material inativo não pode ser movimentado"', async () => {
    const alvo = await reqAprovada();
    const inativo = await material(4, { ativo: 0 });
    const e = await viaServico({ material_id: inativo, tipo: 'ENTRADA', reserva_id: alvo.r.id });
    assert.ok(e, 'aceitou material inativo');
    assert.strictEqual(e.message, 'Material inativo não pode ser movimentado');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  await close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
