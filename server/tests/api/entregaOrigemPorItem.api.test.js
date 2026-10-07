/**
 * Etapa 58 — a entrega de requisição diz de onde cada item sai (endereço, lote, leitura), e o
 * estorno da exclusão e a devolução devolvem ao lote/endereço de onde saiu.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa58-origem-na-entrega.md
 *
 * Executar: cd server && node tests/api/entregaOrigemPorItem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 58: origem por item na entrega ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome, extra = {}) => {
    const c = `E58-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo, bloqueada) VALUES (?,?,1,?)',
      [c, nome, extra.bloqueada || 0])).lastID, codigo: c };
  };
  const material = async (padrao = null) => {
    const c = `E58-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, localizacao_padrao_id)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, padrao])).lastID, codigo: c, nome: `Mat ${c}` };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e58', localizacao_destino_id: destino, ...(lote ? { lote } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const req = async (itens, status = 'EM_SEPARACAO') => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', ?)`, [`REQ-E58-${++seq}`, status])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,?,0,0)`, [r, m, q, q])).lastID); // ja separado: o teto da entrega e o separado
    }
    return { id: r, ids };
  };
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const saldoEm = async (m, l, lote) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ? ${lote !== undefined ? 'AND lote_id IS ?' : ''}`, [m, l, ...(lote !== undefined ? [lote] : [])])).q);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const entregue = async (itemId) => (await dbGet(db, 'SELECT quantidade_entregue q FROM itens_requisicao_almoxarifado WHERE id = ?', [itemId])).q;

  await test('RN-01 sai do endereco INFORMADO (A:10, B:50, entrega 5 de A) e o livro diz A', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material(B.id);
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 50);
    const { id, ids } = await req([[m.id, 5]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 5, localizacao_origem_id: A.id }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 5); assert.strictEqual(await saldoEm(m.id, B.id), 50);
    const mov = await dbGet(db, "SELECT localizacao_origem_id o FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m.id]);
    assert.strictEqual(mov.o, A.id);
  });

  await test('Fase 2 critico 1: origem que NAO cobre e recusada (antes drenava B e o livro dizia A); nada sai', async () => {
    const A = await loc('CA'); const B = await loc('CB'); const m = await material();
    await entrar(m.id, A.id, 3); await entrar(m.id, B.id, 50);
    const { id, ids } = await req([[m.id, 5]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 5, localizacao_origem_id: A.id }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: O saldo em ${A.codigo} (3) não cobre a quantidade (5) — a saída tiraria de outros endereços`);
    assert.strictEqual(await saldoEm(m.id, A.id), 3); assert.strictEqual(await saldoEm(m.id, B.id), 50);
    assert.strictEqual(await entregue(ids[0]), 0);
  });

  await test('Fase 2 critico 2: com RESERVA (excedente + reservada) e origem curta, recusa ANTES da 1a baixa', async () => {
    const A = await loc('RA'); const B = await loc('RB'); const m = await material();
    await entrar(m.id, A.id, 8); await entrar(m.id, B.id, 20);
    const { id, ids } = await req([[m.id, 10]], 'APROVADO');
    await requisitionService.reservarItensAprovacao(db, id, ADMIN, {});
    // Reserva PARCIAL (6 de 10): a entrega vira duas baixas — excedente sem reserva + a reservada.
    await dbRun(db, "UPDATE reservas_material_almoxarifado SET quantidade = 6 WHERE item_requisicao_id = ?", [ids[0]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 6 WHERE id = ?', [m.id]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [id]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 10, localizacao_origem_id: A.id }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(await entregue(ids[0]), 0, 'a primeira baixa saiu antes da recusa');
    assert.strictEqual(await saldoEm(m.id, A.id), 8);
    // Metade positiva: 8 cabem em A — as duas baixas (excedente 2 + reservada 6) saem de A.
    const ok = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 8, localizacao_origem_id: A.id }]);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 0); assert.strictEqual(await saldoEm(m.id, B.id), 20);
    const baixas = await dbAll(db, "SELECT reserva_id, localizacao_origem_id o FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id", [m.id]);
    assert.strictEqual(baixas.length, 2, 'fixture: tinham de ser duas baixas (excedente + reservada)');
    assert.ok(baixas.every((b) => b.o === A.id)); assert.ok(baixas.some((b) => b.reserva_id) && baixas.some((b) => !b.reserva_id));
  });

  await test('Lote: a entrega baixa DAQUELE lote no endereco; lote curto e lote de outro material recusados', async () => {
    const A = await loc('LA'); const m = await material(); const outro = await material();
    const codL1 = `L1-${seq}`;
    await entrar(m.id, A.id, 4, codL1); await entrar(m.id, A.id, 30);
    await entrar(outro.id, A.id, 5, `LX-${seq}`);
    const l1 = await loteId(m.id, codL1);
    const lx = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [outro.id])).id;
    const { id, ids } = await req([[m.id, 10]]);
    let r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 6, localizacao_origem_id: A.id, lote_id: l1 }]);
    assert.strictEqual(r.status, 400); assert.ok(/não cobre a quantidade \(6\)/.test(r.body.error), r.body.error);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, lote_id: lx }]);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, `${m.nome}: Lote não pertence a este material`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 4, localizacao_origem_id: A.id, lote_id: l1 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id, l1), 0); assert.strictEqual(await saldoEm(m.id, A.id, null), 30);
  });

  await test('Endereco bloqueado/inexistente e leitura que nao confere: recusa com prefixo, nada sai', async () => {
    const A = await loc('BA'); const X = await loc('BX', { bloqueada: 1 }); const m = await material();
    await entrar(m.id, A.id, 10);
    const { id, ids } = await req([[m.id, 2]]);
    let r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, localizacao_origem_id: X.id }]);
    assert.strictEqual(r.body.error, `${m.nome}: Localização ${X.codigo} está bloqueada`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, localizacao_origem_id: 999999 }]);
    assert.strictEqual(r.body.error, `${m.nome}: Localização de origem não encontrada`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, localizacao_origem_id: A.id, codigo_lido_origem: 'OUTRO' }]);
    assert.strictEqual(r.body.error, `${m.nome}: Endereço lido (OUTRO) não confere com a localização de origem (${A.codigo}) — se a etiqueta é antiga, reimprima`);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 1, codigo_lido_origem: A.codigo }]);
    assert.strictEqual(r.body.error, `${m.nome}: Para confirmar a origem pela leitura, informe a localização de origem`);
    assert.strictEqual(await entregue(ids[0]), 0);
    r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id, codigo_lido_origem: A.codigo.toLowerCase() }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const mov = await dbGet(db, "SELECT codigo_lido_origem c FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m.id]);
    assert.strictEqual(mov.c, A.codigo);
  });

  await test('Tudo antes: o 2o item com origem invalida recusa a entrega SEM baixar o 1o', async () => {
    const A = await loc('TA'); const m1 = await material(); const m2 = await material();
    await entrar(m1.id, A.id, 10); await entrar(m2.id, A.id, 1);
    const { id, ids } = await req([[m1.id, 3], [m2.id, 5]]);
    const r = await entregar(id, [
      { item_id: ids[0], quantidade_atendida: 3 },
      { item_id: ids[1], quantidade_atendida: 5, localizacao_origem_id: A.id },
    ]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(await entregue(ids[0]), 0); assert.strictEqual(await saldoEm(m1.id, A.id), 10);
  });

  await test('Concorrencia: duas entregas de 10 saindo de A (A:10, B:50) ao mesmo tempo — uma recusada, B intacto', async () => {
    const A = await loc('KA'); const B = await loc('KB'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 50);
    const r1 = await req([[m.id, 10]]); const r2 = await req([[m.id, 10]]);
    const rs = await Promise.all([
      entregar(r1.id, [{ item_id: r1.ids[0], quantidade_atendida: 10, localizacao_origem_id: A.id }]),
      entregar(r2.id, [{ item_id: r2.ids[0], quantidade_atendida: 10, localizacao_origem_id: A.id }]),
    ]);
    assert.deepStrictEqual(rs.map((r) => r.status).sort(), [200, 400], JSON.stringify(rs.map((r) => r.body)));
    assert.strictEqual(await saldoEm(m.id, B.id), 50, 'a segunda entrega drenou B dizendo que saiu de A');
  });

  await test('Ausente: o comportamento de hoje (drena a padrao primeiro)', async () => {
    const P = await loc('HP'); const A = await loc('HA'); const m = await material(P.id);
    await entrar(m.id, P.id, 5); await entrar(m.id, A.id, 5);
    const { id, ids } = await req([[m.id, 3]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, P.id), 2);
  });

  await test('Fase 2 critico 3: excluir a requisicao devolve ao LOTE e ao endereco de onde saiu', async () => {
    const A = await loc('XA'); const P = await loc('XP'); const m = await material(P.id);
    await entrar(m.id, A.id, 6, `LE-${seq}`);
    const le = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id])).id;
    const { id, ids } = await req([[m.id, 4]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 4, localizacao_origem_id: A.id, lote_id: le }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id, le), 2);
    const del = await request(app).delete(`/api/almoxarifado/requisicoes/${id}`).send({ justificativa: 'e58 teste' });
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    assert.strictEqual(await saldoEm(m.id, A.id, le), 6, 'o estorno nao voltou ao lote/endereco');
    assert.strictEqual(await saldoEm(m.id, P.id), 0, 'o estorno foi para a padrao sem lote');
  });

  await test('Devolucao citando a saida herda o LOTE dela (material sem controle_lote)', async () => {
    const A = await loc('DA'); const m = await material();
    await entrar(m.id, A.id, 5, `LD-${seq}`);
    const ld = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id])).id;
    const { id, ids } = await req([[m.id, 3]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id, lote_id: ld }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const saida = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m.id]);
    const dev = await request(app).post('/api/almoxarifado/devolucoes').send({
      material_id: m.id, quantidade: 1, motivo: 'sobra', destino: 'ESTOQUE', localizacao_id: A.id, movimentacao_saida_id: saida.id,
    });
    assert.ok(dev.status === 201 || dev.status === 200, JSON.stringify(dev.body));
    assert.strictEqual(await saldoEm(m.id, A.id, ld), 3);
  });

  // ── Fase 5 ────────────────────────────────────────────────────────────────────────────────
  const tipoRestrito = (locId) => dbRun(db, "UPDATE localizacoes_almoxarifado SET tipos_material_permitidos = '[\"EPI\"]' WHERE id = ?", [locId]);
  const excluir = (reqId) => request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`).send({ justificativa: 'e58 teste' });

  await test('Fase 5: excluir com a origem que agora NAO aceita o tipo — volta para a padrao, nao trava', async () => {
    const A = await loc('TXA'); const P = await loc('TXP'); const m = await material(P.id);
    await entrar(m.id, A.id, 5);
    const { id, ids } = await req([[m.id, 3]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    await tipoRestrito(A.id);
    const del = await excluir(id);
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    assert.strictEqual(await saldoEm(m.id, P.id), 3); assert.strictEqual(await saldoEm(m.id, A.id), 2);
  });

  await test('Fase 5: excluir com DUAS partes e a padrao bloqueada — recusa ANTES de creditar qualquer parte', async () => {
    const A = await loc('DPA'); const B = await loc('DPB'); const P = await loc('DPP'); const m = await material(P.id);
    await entrar(m.id, A.id, 5); await entrar(m.id, B.id, 5);
    const { id, ids } = await req([[m.id, 4]]);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id }])).status, 200);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: B.id }])).status, 200);
    await tipoRestrito(B.id); // a 2a parte cai na padrão...
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [P.id]); // ...que está bloqueada
    const del = await excluir(id);
    assert.strictEqual(del.status, 400, JSON.stringify(del.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 3, 'a 1a parte foi creditada antes da recusa da 2a');
    // Metade positiva: desbloqueada a padrão, exclui — e uma vez só.
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [P.id]);
    assert.strictEqual((await excluir(id)).status, 200);
    assert.strictEqual(await saldoEm(m.id, A.id), 5); assert.strictEqual(await saldoEm(m.id, P.id), 2);
  });

  await test('Fase 5: lote BLOQUEADO no 2o item recusa a entrega SEM baixar o 1o', async () => {
    const A = await loc('LBA'); const m1 = await material(); const m2 = await material();
    await entrar(m1.id, A.id, 10); const cod = `LB-${seq}`; await entrar(m2.id, A.id, 5, cod);
    const lb = await loteId(m2.id, cod);
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [lb]);
    const { id, ids } = await req([[m1.id, 3], [m2.id, 2]]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3 }, { item_id: ids[1], quantidade_atendida: 2, lote_id: lb }]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m2.nome}: Lote ${cod} esta bloqueado e nao pode ser utilizado`);
    assert.strictEqual(await entregue(ids[0]), 0);
  });

  await test('Fase 5: dois itens do MESMO material saindo de A (A:10, 6+6) — recusa antes, nada sai; e a exclusao devolve ao lote', async () => {
    const A = await loc('MMA'); const m = await material(); const cod = `MM-${seq}`;
    await entrar(m.id, A.id, 10, cod); const lm = await loteId(m.id, cod);
    const { id, ids } = await req([[m.id, 6], [m.id, 6]]);
    let r = await entregar(id, [
      { item_id: ids[0], quantidade_atendida: 6, localizacao_origem_id: A.id, lote_id: lm },
      { item_id: ids[1], quantidade_atendida: 6, localizacao_origem_id: A.id, lote_id: lm },
    ]);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id, lm), 10);
    r = await entregar(id, [
      { item_id: ids[0], quantidade_atendida: 6, localizacao_origem_id: A.id, lote_id: lm },
      { item_id: ids[1], quantidade_atendida: 4, localizacao_origem_id: A.id, lote_id: lm },
    ]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await excluir(id)).status, 200);
    assert.strictEqual(await saldoEm(m.id, A.id, lm), 10, 'dois itens do mesmo material: o estorno nao voltou ao lote');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
