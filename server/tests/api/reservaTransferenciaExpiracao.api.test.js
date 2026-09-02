/**
 * Transferência de reserva entre projetos + expiração de reservas (Etapa 4, decisões 3 e 4).
 *
 * Transferir é troca de DONO, não movimentação: nenhum saldo se move — o material continua
 * com o mesmo físico e o mesmo reservado, só muda para quem aquele hold está apontado. Por
 * isso a rota exige `reservar_outra_os` (segregação: quem reserva para si não redireciona a
 * reserva de outro projeto) e deixa rastro na auditoria.
 *
 * Expiração é por endpoint chamado por cron externo (não há scheduler in-process no projeto).
 * Reserva vencida devolve o saldo ao disponível e vira EXPIRADA — status distinto de LIBERADA
 * porque "venceu sozinha" e "alguém liberou" são fatos diferentes no relatório.
 *
 * Nota: quem popula `expira_em` na criação da reserva é outra frente (criarReserva ainda não
 * persiste o campo), então aqui a data é gravada por SQL direto — o alvo do teste é o job.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
// Sem role/perfil => getPerfilFromUser cai no fallback PRODUCAO: pode `reservar`,
// NÃO pode `reservar_outra_os` nem `configurar`.
const PRODUCAO = { id: 42, nome: 'Produção Teste' };

async function novoMaterial(db, codigo, qtd) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,?,1)`,
    [codigo, `Material ${codigo}`, 'UN', qtd]);
  return r.lastID;
}
const material = (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(quantidade_reservada,0) as reservada FROM materiais_almoxarifado WHERE id = ?', [id]);
const reserva = (db, id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
  return stockService.getSaldoDisponivel(m);
};

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  async function criarReserva(mat, body = {}) {
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 10, projeto_id: 1, ...body });
    assert.strictEqual(r.status, 201, `falha ao criar reserva: ${JSON.stringify(r.body)}`);
    return r.body.id;
  }
  const setExpiraEm = (id, data) => dbRun(db,
    'UPDATE reservas_material_almoxarifado SET expira_em = ? WHERE id = ?', [data, id]);

  // ── Transferência ──

  await test('transferir muda o dono da reserva e NÃO move saldo nenhum', async () => {
    const mat = await novoMaterial(db, 'TRF-001', 100);
    const id = await criarReserva(mat, { quantidade: 30, projeto_id: 10, os_id: 500, os_referencia: 'OS-500', cliente_id: 7 });
    const antes = await material(db, mat);
    const dispAntes = await disponivel(db, mat);

    const res = await request(app).put(`/api/almoxarifado/reservas/${id}/transferir`)
      .send({ projeto_id: 20, os_id: 600, os_referencia: 'OS-600', cliente_id: 8, motivo: 'projeto 10 cancelado' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rr = await reserva(db, id);
    assert.strictEqual(rr.projeto_id, 20);
    assert.strictEqual(rr.os_id, 600);
    assert.strictEqual(rr.os_referencia, 'OS-600');
    assert.strictEqual(rr.cliente_id, 8);
    assert.strictEqual(rr.status, 'ATIVA', 'transferir não muda o status');
    assert.strictEqual(rr.quantidade, 30, 'transferir não muda a quantidade reservada');

    const depois = await material(db, mat);
    assert.deepStrictEqual(depois, antes, 'transferência mexeu no saldo do material');
    assert.strictEqual(await disponivel(db, mat), dispAntes, 'disponível mudou numa troca de dono');
  });

  await test('transferir deixa rastro na auditoria (de → para)', async () => {
    const mat = await novoMaterial(db, 'TRF-002', 50);
    const id = await criarReserva(mat, { quantidade: 5, projeto_id: 11 });
    const res = await request(app).put(`/api/almoxarifado/reservas/${id}/transferir`)
      .send({ projeto_id: 12, motivo: 'realocação' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'reserva' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [id]);
    assert.ok(log, 'nenhum registro de auditoria para a transferência');
    assert.strictEqual(JSON.parse(log.dados_anteriores).projeto_id, 11);
    assert.strictEqual(JSON.parse(log.dados_novos).projeto_id, 12);
    assert.strictEqual(log.usuario_id, ADMIN.id);
  });

  await test('transferir exige reservar_outra_os: perfil sem a permissão → 403 e nada muda', async () => {
    const mat = await novoMaterial(db, 'TRF-003', 50);
    const id = await criarReserva(mat, { quantidade: 8, projeto_id: 30 });

    setUser(PRODUCAO);
    const res = await request(app).put(`/api/almoxarifado/reservas/${id}/transferir`).send({ projeto_id: 31 });
    setUser(ADMIN);

    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const rr = await reserva(db, id);
    assert.strictEqual(rr.projeto_id, 30, 'dono trocou apesar do 403');
  });

  await test('transferir reserva não-ATIVA → 400', async () => {
    const mat = await novoMaterial(db, 'TRF-004', 50);
    const id = await criarReserva(mat, { quantidade: 9, projeto_id: 40 });
    const lib = await request(app).post(`/api/almoxarifado/reservas/${id}/liberar`).send({ motivo: 'não vai mais' });
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));

    const res = await request(app).put(`/api/almoxarifado/reservas/${id}/transferir`).send({ projeto_id: 41 });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const rr = await reserva(db, id);
    assert.strictEqual(rr.projeto_id, 40, 'reserva liberada foi transferida');
  });

  await test('transferir reserva inexistente → 404', async () => {
    const res = await request(app).put('/api/almoxarifado/reservas/999999/transferir').send({ projeto_id: 1 });
    assert.strictEqual(res.status, 404, `esperava 404, veio ${res.status}`);
  });

  // ── Liberação com rastro ──

  await test('liberar grava liberado_por, liberado_em e motivo_liberacao', async () => {
    const mat = await novoMaterial(db, 'LIB-001', 100);
    const id = await criarReserva(mat, { quantidade: 25, projeto_id: 50 });
    assert.strictEqual(await disponivel(db, mat), 75);

    const res = await request(app).post(`/api/almoxarifado/reservas/${id}/liberar`)
      .send({ motivo: 'cliente suspendeu o projeto' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rr = await reserva(db, id);
    assert.strictEqual(rr.status, 'LIBERADA');
    assert.strictEqual(rr.liberado_por, ADMIN.id);
    assert.ok(rr.liberado_em, 'liberado_em ficou nulo');
    assert.strictEqual(rr.motivo_liberacao, 'cliente suspendeu o projeto');
    assert.strictEqual(await disponivel(db, mat), 100, 'liberar não devolveu ao disponível');
  });

  await test('liberação parcial devolve só a parte e deixa a reserva coerente com o hold', async () => {
    const mat = await novoMaterial(db, 'LIB-002', 100);
    const id = await criarReserva(mat, { quantidade: 30, projeto_id: 51 });

    const res = await request(app).post(`/api/almoxarifado/reservas/${id}/liberar`)
      .send({ quantidade: 10, motivo: 'sobrou material' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const rr = await reserva(db, id);
    assert.strictEqual(rr.status, 'ATIVA', 'liberação parcial não deveria fechar a reserva');
    // o hold da reserva tem de bater com o que o material tem reservado, senão a tela mostra
    // 30 separados enquanto só 20 estão realmente presos
    assert.strictEqual(rr.quantidade - (rr.quantidade_utilizada || 0), 20);
    assert.strictEqual((await material(db, mat)).reservada, 20);
    assert.strictEqual(await disponivel(db, mat), 80);
  });

  await test('liberar mais do que a reserva segura → 400 e nada muda', async () => {
    const mat = await novoMaterial(db, 'LIB-003', 100);
    const id = await criarReserva(mat, { quantidade: 20, projeto_id: 52 });

    const res = await request(app).post(`/api/almoxarifado/reservas/${id}/liberar`).send({ quantidade: 21 });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await material(db, mat)).reservada, 20, 'reservado mudou apesar do 400');
    assert.strictEqual((await reserva(db, id)).status, 'ATIVA');
  });

  await test('liberar reserva já liberada → 400 (idempotência)', async () => {
    const mat = await novoMaterial(db, 'LIB-004', 50);
    const id = await criarReserva(mat, { quantidade: 10, projeto_id: 53 });
    const primeira = await request(app).post(`/api/almoxarifado/reservas/${id}/liberar`).send({ motivo: 'ok' });
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));

    const segunda = await request(app).post(`/api/almoxarifado/reservas/${id}/liberar`).send({ motivo: 'de novo' });
    assert.strictEqual(segunda.status, 400, `esperava 400, veio ${segunda.status}: ${JSON.stringify(segunda.body)}`);
    assert.strictEqual((await material(db, mat)).reservada, 0, 'segunda liberação descontou de novo');
  });

  // ── Expiração ──

  await test('expiração libera só as vencidas, marca EXPIRADA e devolve ao disponível', async () => {
    const mat = await novoMaterial(db, 'EXP-001', 100);
    const vencida = await criarReserva(mat, { quantidade: 30, projeto_id: 60 });
    const futura = await criarReserva(mat, { quantidade: 20, projeto_id: 61 });
    const semData = await criarReserva(mat, { quantidade: 10, projeto_id: 62 });
    await setExpiraEm(vencida, '2020-01-01');
    await setExpiraEm(futura, '2999-12-31');

    assert.strictEqual((await material(db, mat)).reservada, 60);
    assert.strictEqual(await disponivel(db, mat), 40);

    const res = await request(app).post('/api/almoxarifado/reservas/processar-expiracao').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.processadas, 1, `processadas: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.liberadas), 'resposta sem a lista liberadas');
    assert.strictEqual(res.body.liberadas.length, 1);
    assert.strictEqual(res.body.liberadas[0].id, vencida);

    assert.strictEqual((await reserva(db, vencida)).status, 'EXPIRADA', 'vencida deveria virar EXPIRADA (não LIBERADA)');
    assert.strictEqual((await reserva(db, futura)).status, 'ATIVA', 'reserva no prazo foi expirada');
    assert.strictEqual((await reserva(db, semData)).status, 'ATIVA', 'reserva sem expira_em foi expirada');

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 100, 'expiração mexeu no físico');
    assert.strictEqual(m.reservada, 30, 'reservado não voltou apenas o da vencida');
    assert.strictEqual(await disponivel(db, mat), 70);
  });

  await test('expiração é idempotente: rodar de novo não libera nem desconta duas vezes', async () => {
    const mat = await novoMaterial(db, 'EXP-002', 80);
    const vencida = await criarReserva(mat, { quantidade: 40, projeto_id: 70 });
    await setExpiraEm(vencida, '2020-06-15');

    const r1 = await request(app).post('/api/almoxarifado/reservas/processar-expiracao').send({});
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    const depoisPrimeira = await material(db, mat);
    assert.strictEqual(depoisPrimeira.reservada, 0);

    const r2 = await request(app).post('/api/almoxarifado/reservas/processar-expiracao').send({});
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.processadas, 0, 'segunda rodada reprocessou a mesma reserva');
    assert.deepStrictEqual(await material(db, mat), depoisPrimeira, 'segunda rodada mexeu no saldo');
    assert.strictEqual((await reserva(db, vencida)).status, 'EXPIRADA');

    // e não gerou duas movimentações de liberação para a mesma reserva
    const movs = await dbAll(db,
      `SELECT id FROM movimentacoes_almoxarifado WHERE reserva_id = ? AND tipo = 'LIBERACAO_RESERVA'`, [vencida]);
    assert.strictEqual(movs.length, 1, `esperava 1 movimentação de liberação, veio ${movs.length}`);
  });

  await test('reserva já consumida não é expirada nem tem saldo devolvido', async () => {
    const mat = await novoMaterial(db, 'EXP-003', 60);
    const id = await criarReserva(mat, { quantidade: 20, projeto_id: 80 });
    await setExpiraEm(id, '2020-01-01');
    const consumo = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 20, projeto_id: 80, reserva_id: id, motivo: 'consumo total' });
    assert.strictEqual(consumo.status, 201, JSON.stringify(consumo.body));
    const antes = await material(db, mat);

    const res = await request(app).post('/api/almoxarifado/reservas/processar-expiracao').send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await reserva(db, id)).status, 'CONSUMIDA');
    assert.deepStrictEqual(await material(db, mat), antes, 'reserva consumida teve saldo devolvido');
  });

  await test('processar-expiracao é restrito a administrador do módulo', async () => {
    setUser(PRODUCAO);
    const res = await request(app).post('/api/almoxarifado/reservas/processar-expiracao').send({});
    setUser(ADMIN);
    assert.strictEqual(res.status, 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
  });

  // ── GET /reservas: filtros e saldo derivado ──

  await test('GET /reservas filtra por status, projeto_id e material_id', async () => {
    const matA = await novoMaterial(db, 'FIL-001', 100);
    const matB = await novoMaterial(db, 'FIL-002', 100);
    const ativaA = await criarReserva(matA, { quantidade: 10, projeto_id: 900 });
    const liberadaA = await criarReserva(matA, { quantidade: 10, projeto_id: 900 });
    await request(app).post(`/api/almoxarifado/reservas/${liberadaA}/liberar`).send({ motivo: 'x' });
    const ativaB = await criarReserva(matB, { quantidade: 10, projeto_id: 901 });

    const porStatus = await request(app).get('/api/almoxarifado/reservas?status=LIBERADA');
    assert.strictEqual(porStatus.status, 200, JSON.stringify(porStatus.body));
    assert.ok(porStatus.body.every((r) => r.status === 'LIBERADA'), 'filtro de status vazou outros status');
    assert.ok(porStatus.body.some((r) => r.id === liberadaA), 'liberada não veio no filtro');

    const porProjeto = await request(app).get('/api/almoxarifado/reservas?projeto_id=901');
    assert.deepStrictEqual(porProjeto.body.map((r) => r.id), [ativaB], 'filtro por projeto_id errado');

    const porMaterial = await request(app).get(`/api/almoxarifado/reservas?material_id=${matA}`);
    assert.deepStrictEqual(porMaterial.body.map((r) => r.id).sort((a, b) => a - b), [ativaA, liberadaA].sort((a, b) => a - b));

    const combinado = await request(app).get(`/api/almoxarifado/reservas?material_id=${matA}&status=ATIVA&projeto_id=900`);
    assert.deepStrictEqual(combinado.body.map((r) => r.id), [ativaA], 'filtros combinados erraram');
  });

  await test('GET /reservas traz saldo (quantidade - utilizada) e dados do material', async () => {
    const mat = await novoMaterial(db, 'FIL-003', 100);
    const id = await criarReserva(mat, { quantidade: 40, projeto_id: 910 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 15, projeto_id: 910, reserva_id: id, motivo: 'consumo parcial' });

    const res = await request(app).get(`/api/almoxarifado/reservas?material_id=${mat}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const row = res.body.find((r) => r.id === id);
    assert.ok(row, 'reserva não veio na listagem');
    assert.strictEqual(row.saldo, 25, `saldo derivado errado: ${row.saldo}`);
    assert.strictEqual(row.material_codigo, 'FIL-003');
    assert.strictEqual(row.material_nome, 'Material FIL-003');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
