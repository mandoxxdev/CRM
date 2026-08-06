/**
 * Etapa 4, Task 6 — os dois caminhos que mexiam na requisição sem passar pelo hold.
 *
 * A Etapa 4 fez a aprovação reservar e o cancelamento liberar. Sobraram duas rotas que
 * chegam ao mesmo lugar por fora:
 *
 * 1. `/aprovar-valor` gravava `status = 'APROVADO'` direto, sem reservar. Justamente as
 *    requisições de valor alto — as que passam pela liberação por valor — ficavam sem o hold,
 *    e o material aprovado podia ser levado por outra saída antes da entrega. É a mesma
 *    corrida que a Etapa 4 fechou na lane comum.
 *
 * 2. Excluir requisição (soft delete) não soltava as reservas. `/cancelar` soltava; o DELETE
 *    não. Duas rotas, mesmo status final `CANCELADO`, efeitos diferentes no saldo — e como a
 *    expiração é opt-in, na configuração padrão o hold ficava preso para sempre.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionStateMachine = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const APROVADOR_VALOR = { id: 66, nome: 'Aprovador Valor', role: 'user', email: 'aprov@test.com' };
const SOLICITANTE_ID = 42;

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`PONTA-${seq}`, `Material ponta ${seq}`, qtd]);
  return r.lastID;
}

const disponivel = async (db, id) => {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
  return stockService.getSaldoDisponivel(m);
};

const reservasDa = (db, reqId) => dbAll(db,
  `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ?`, [reqId]);

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  async function setupLiberacaoValor(aprovadorIds = [APROVADOR_VALOR.id]) {
    await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_ativo', '1')`);
    await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_limite', '100')`);
    await dbRun(db, `INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('liberacao_valor_aprovadores', ?)`,
      [JSON.stringify(aprovadorIds)]);
  }

  let numeroSeq = 0;
  /** Requisição já parada em AGUARDANDO_APROVACAO_VALOR, pronta para o /aprovar-valor. */
  async function requisicaoAguardandoValor(materialId, quantidade) {
    numeroSeq += 1;
    const r = await dbRun(db,
      `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, valor_total, requer_aprovacao_valor)
       VALUES (?,?,'Solicitante Teste','AGUARDANDO_APROVACAO_VALOR',500,1)`,
      [`REQ-PONTA-${numeroSeq}`, SOLICITANTE_ID]);
    const reqId = r.lastID;
    await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)`,
      [reqId, materialId, quantidade]);
    return reqId;
  }

  async function aprovarPorValor(reqId) {
    setUser(APROVADOR_VALOR);
    try {
      return await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar-valor`).send({});
    } finally {
      setUser(ADMIN);
    }
  }

  // ══════════════ 1. /aprovar-valor tem de reservar, como o /aprovar ══════════════

  await test('[aprovar-valor] com saldo total reserva os itens e derruba o disponível', async () => {
    await setupLiberacaoValor();
    const mat = await novoMaterial(db, 100);
    const reqId = await requisicaoAguardandoValor(mat, 30);

    const res = await aprovarPorValor(reqId);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const reservas = await reservasDa(db, reqId);
    assert.strictEqual(reservas.length, 1, `esperava 1 reserva, veio ${reservas.length}`);
    assert.strictEqual(reservas[0].quantidade, 30);
    assert.strictEqual(reservas[0].origem, 'REQUISICAO');
    assert.strictEqual(await disponivel(db, mat), 70, 'o hold não saiu do disponível');
  });

  await test('[aprovar-valor] com saldo total assume TOTALMENTE_RESERVADA', async () => {
    await setupLiberacaoValor();
    const mat = await novoMaterial(db, 100);
    const reqId = await requisicaoAguardandoValor(mat, 10);

    await aprovarPorValor(reqId);

    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    // Mesma semântica da lane comum: deixar APROVADO aqui faria o mesmo fato (aprovada COM
    // hold) ter dois status diferentes conforme a rota que aprovou.
    assert.strictEqual(row.status, 'TOTALMENTE_RESERVADA');
  });

  await test('[aprovar-valor] com saldo parcial reserva só o disponível e assume PARCIALMENTE_RESERVADA', async () => {
    await setupLiberacaoValor();
    const mat = await novoMaterial(db, 10);
    const reqId = await requisicaoAguardandoValor(mat, 25);   // pede mais do que existe

    await aprovarPorValor(reqId);

    const reservas = await reservasDa(db, reqId);
    assert.strictEqual(reservas.length, 1);
    assert.strictEqual(reservas[0].quantidade, 10, 'reservou além do disponível');
    assert.strictEqual(await disponivel(db, mat), 0);
    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'PARCIALMENTE_RESERVADA');
  });

  await test('[aprovar-valor] sem saldo nenhum continua APROVADO e não cria reserva (regressão)', async () => {
    await setupLiberacaoValor();
    const mat = await novoMaterial(db, 0);
    const reqId = await requisicaoAguardandoValor(mat, 5);

    const res = await aprovarPorValor(reqId);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    assert.strictEqual((await reservasDa(db, reqId)).length, 0, 'criou reserva sem saldo');
    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId]);
    assert.strictEqual(row.status, 'APROVADO', 'o comportamento antigo tem de sobreviver quando não há o que reservar');
  });

  await test('[aprovar-valor] a resposta informa as reservas criadas', async () => {
    await setupLiberacaoValor();
    const mat = await novoMaterial(db, 50);
    const reqId = await requisicaoAguardandoValor(mat, 20);

    const res = await aprovarPorValor(reqId);
    assert.strictEqual(res.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.reservas) && res.body.reservas.length === 1,
      `resposta sem as reservas: ${JSON.stringify(res.body)}`);
  });

  await test('[máquina] AGUARDANDO_APROVACAO_VALOR aceita os dois status de reserva', async () => {
    assert.ok(requisitionStateMachine.validarTransicao('AGUARDANDO_APROVACAO_VALOR', 'TOTALMENTE_RESERVADA').ok);
    assert.ok(requisitionStateMachine.validarTransicao('AGUARDANDO_APROVACAO_VALOR', 'PARCIALMENTE_RESERVADA').ok);
    // APROVADO continua válido: é o destino quando não há nada para reservar.
    assert.ok(requisitionStateMachine.validarTransicao('AGUARDANDO_APROVACAO_VALOR', 'APROVADO').ok);
  });

  // ══════════════ 2. Excluir requisição tem de soltar o hold, como o /cancelar ══════════════

  /** Requisição aprovada pela lane comum, já com reserva ativa. */
  async function requisicaoAprovadaComReserva(materialId, quantidade) {
    numeroSeq += 1;
    const r = await dbRun(db,
      `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
       VALUES (?,?,'Solicitante Teste','PENDENTE')`,
      [`REQ-EXC-${numeroSeq}`, SOLICITANTE_ID]);
    const reqId = r.lastID;
    await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,?)`,
      [reqId, materialId, quantidade]);
    const apr = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(apr.status, 200, `setup: aprovação falhou ${JSON.stringify(apr.body)}`);
    return reqId;
  }

  await test('excluir requisição libera as reservas dela e devolve ao disponível', async () => {
    const mat = await novoMaterial(db, 100);
    const reqId = await requisicaoAprovadaComReserva(mat, 30);
    assert.strictEqual(await disponivel(db, mat), 70, 'setup: a aprovação deveria ter reservado');

    const res = await request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`)
      .send({ justificativa: 'duplicada' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    assert.strictEqual(await disponivel(db, mat), 100, 'hold ficou preso após a exclusão');
    const depois = await reservasDa(db, reqId);
    depois.forEach((row) => {
      assert.strictEqual(row.status, 'LIBERADA', `reserva ficou ${row.status}`);
      assert.ok(row.motivo_liberacao, 'liberação sem motivo registrado');
    });
  });

  await test('excluir NÃO mexe em reserva manual de outro dono do mesmo material', async () => {
    const mat = await novoMaterial(db, 100);
    const manual = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 10, projeto_id: 99 });
    assert.strictEqual(manual.status, 201, JSON.stringify(manual.body));
    const reqId = await requisicaoAprovadaComReserva(mat, 20);
    assert.strictEqual(await disponivel(db, mat), 70, 'setup: 10 manual + 20 da requisição');

    await request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`).send({ justificativa: 'x' });

    assert.strictEqual(await disponivel(db, mat), 90, 'deveria devolver só os 20 da requisição');
    const m = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [manual.body.id]);
    assert.strictEqual(m.status, 'ATIVA', 'a reserva manual de terceiro foi liberada indevidamente');
  });

  await test('a justificativa da exclusão vai para o motivo da liberação', async () => {
    const mat = await novoMaterial(db, 100);
    const reqId = await requisicaoAprovadaComReserva(mat, 15);

    await request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`)
      .send({ justificativa: 'pedido em duplicidade' });

    const [reserva] = await reservasDa(db, reqId);
    assert.match(reserva.motivo_liberacao, /duplicidade/,
      `motivo não veio da justificativa: ${reserva.motivo_liberacao}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
