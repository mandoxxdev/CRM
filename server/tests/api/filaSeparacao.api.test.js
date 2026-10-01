/**
 * Etapa 64 — a fila de separação do almoxarife (GET /api/almoxarifado/fila-separacao). Só leitura.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa64-fila-de-separacao.md
 *
 * Executar: cd server && node tests/api/filaSeparacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX_A = { id: 6401, nome: 'Almox A', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const ALMOX_B = { id: 6402, nome: 'Almox B', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 6403, nome: 'Chao', role: 'usuario' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 64: fila de separacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const material = async ({ qtd = 0, critico = 0 } = {}) => {
    const c = `E64-M${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
      VALUES (?, ?, 'UN', ?, 1, ?)`, [c, `Mat ${c}`, qtd, critico])).lastID;
  };
  const req = async (itens, extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, data_necessidade, created_at, ativo, requer_aprovacao_valor)
      VALUES (?, 1, 'Sol', ?, ?, ?, ?, ?, ?)`,
    [`REQ-E64-${++seq}`, extra.status || 'APROVADO', extra.urgencia || 'NORMAL', extra.data || null,
      extra.criado || `2026-09-01 10:00:${String(seq).padStart(2, '0')}`, extra.ativo ?? 1, extra.valor ? 1 : 0])).lastID;
    const ids = [];
    for (const [m, q, sep = 0, ent = 0] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,?,?,?)`, [r, m, q, sep, ent, ent])).lastID);
    }
    return { id: r, ids };
  };
  const fila = async (user = ADMIN) => {
    setUser(user);
    const r = await request(app).get('/api/almoxarifado/fila-separacao');
    setUser(ADMIN);
    return r;
  };
  const daFila = (lista, id) => lista.find((x) => x.id === id);

  await test('Entra/nao entra: com saldo -> SEPARAR; sem saldo -> AGUARDANDO_SALDO; ENTREGUE, PENDENTE e inativa fora', async () => {
    const comSaldo = await material({ qtd: 10 }); const semSaldo = await material({ qtd: 0 });
    const a = await req([[comSaldo, 5]]);
    const b = await req([[semSaldo, 5]], { status: 'AGUARDANDO_COMPRA' });
    const fora1 = await req([[comSaldo, 1, 1, 1]], { status: 'ENTREGUE' });
    const fora2 = await req([[comSaldo, 1]], { status: 'PENDENTE' });
    const fora3 = await req([[comSaldo, 1]], { ativo: 0 });
    const r = await fila();
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(daFila(r.body, a.id).etapas, ['SEPARAR']);
    assert.deepStrictEqual(daFila(r.body, b.id).etapas, ['AGUARDANDO_SALDO']);
    assert.strictEqual(daFila(r.body, b.id).acionavel, false);
    for (const f of [fora1, fora2, fora3]) assert.strictEqual(daFila(r.body, f.id), undefined);
    const it = daFila(r.body, a.id).itens[0];
    assert.strictEqual(it.a_separar, 5); assert.strictEqual(it.separavel, 5); assert.strictEqual(it.disponivel, 10);
  });

  await test('Ordem: acionavel primeiro; urgencia (minusculo tambem); data de necessidade (sem data por ultimo); FIFO', async () => {
    const m = await material({ qtd: 100 }); const vazio = await material({ qtd: 0 });
    const parada = await req([[vazio, 1]], { urgencia: 'CRITICO' });
    const normalVelha = await req([[m, 1]], { criado: '2026-08-01 08:00:00' });
    const normalNova = await req([[m, 1]], { criado: '2026-08-02 08:00:00' });
    const urgente = await req([[m, 1]], { urgencia: 'urgente', criado: '2026-08-05 08:00:00' });
    const critCedo = await req([[m, 1]], { urgencia: 'CRITICO', data: '2026-10-02' });
    const critTarde = await req([[m, 1]], { urgencia: 'CRITICO', data: '2026-10-09' });
    const critSemData = await req([[m, 1]], { urgencia: 'CRITICO' });
    const ids = (await fila()).body.map((x) => x.id);
    const ordem = [critCedo.id, critTarde.id, critSemData.id, urgente.id, normalVelha.id, normalNova.id, parada.id];
    const posicoes = ordem.map((i) => ids.indexOf(i));
    assert.deepStrictEqual(posicoes, [...posicoes].sort((x, y) => x - y), `ordem errada: ${JSON.stringify(ordem.map((i) => ids.indexOf(i)))}`);
  });

  await test('CONFERIR: critico separado sem conferencia; quem separou nao pode conferir (posso_conferir), outro pode', async () => {
    const m = await material({ qtd: 10, critico: 1 });
    const { id, ids } = await req([[m, 3]]);
    await requisitionService.separarRequisicao(db, id, [{ item_id: ids[0], quantidade_separada: 3 }], ALMOX_A);
    let r = await fila(ALMOX_A);
    const linhaA = daFila(r.body, id);
    assert.ok(linhaA.etapas.includes('CONFERIR'), JSON.stringify(linhaA.etapas));
    assert.ok(!linhaA.etapas.includes('ENTREGAR'), 'entregar antes da conferencia');
    assert.strictEqual(linhaA.posso_conferir, false);
    assert.deepStrictEqual(linhaA.separadores.map((s) => s.nome), ['Almox A']);
    r = await fila(ALMOX_B);
    assert.strictEqual(daFila(r.body, id).posso_conferir, true);
    // Conferida: vira ENTREGAR.
    await requisitionService.conferirSeparacao(db, id, ALMOX_B);
    r = await fila();
    assert.deepStrictEqual(daFila(r.body, id).etapas, ['ENTREGAR']);
  });

  await test('REABRIR_SEPARACAO: critico na caixa sem conferencia fora de EM_SEPARACAO (o conferir recusaria)', async () => {
    const m = await material({ qtd: 10, critico: 1 });
    const { id } = await req([[m, 4, 3, 1]], { status: 'PARCIALMENTE_ATENDIDA' });
    const linha = daFila((await fila()).body, id);
    assert.ok(linha.etapas.includes('REABRIR_SEPARACAO'), JSON.stringify(linha.etapas));
    assert.ok(!linha.etapas.includes('CONFERIR') && !linha.etapas.includes('ENTREGAR'));
  });

  await test('SEPARAR e ENTREGAR juntos; itens sem nada a fazer ficam fora da linha', async () => {
    const m1 = await material({ qtd: 10 }); const m2 = await material({ qtd: 10 }); const m3 = await material({ qtd: 10 });
    const { id } = await req([[m1, 5, 2, 0], [m2, 4, 0, 0], [m3, 2, 2, 2]], { status: 'EM_SEPARACAO' });
    const linha = daFila((await fila()).body, id);
    assert.deepStrictEqual(linha.etapas, ['SEPARAR', 'ENTREGAR']);
    assert.deepStrictEqual(linha.itens.map((i) => [i.a_separar, i.a_entregar]), [[3, 2], [4, 0]]);
  });

  await test('APROVACAO_VALOR no lugar de SEPARAR quando a aprovacao de valor esta pendente (pelo gravado)', async () => {
    const m = await material({ qtd: 10 });
    const { id } = await req([[m, 2]], { valor: true });
    assert.deepStrictEqual(daFila((await fila()).body, id).etapas, ['APROVACAO_VALOR']);
  });

  await test('Gate: chao de fabrica (sem separar_emitir) recebe 403', async () => {
    const r = await fila(PRODUCAO);
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual((await fila(ALMOX_A)).status, 200);
  });

  await test('Fila e leitura: listar nao muda status nem nada da requisicao', async () => {
    const m = await material({ qtd: 10 });
    const { id } = await req([[m, 2]], { valor: true });
    const antes = await dbGet(db, 'SELECT status, updated_at FROM requisicoes_almoxarifado WHERE id = ?', [id]);
    await fila();
    const depois = await dbGet(db, 'SELECT status, updated_at FROM requisicoes_almoxarifado WHERE id = ?', [id]);
    assert.deepStrictEqual(depois, antes);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
