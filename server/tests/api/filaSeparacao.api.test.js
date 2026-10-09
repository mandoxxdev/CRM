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

  await test('APROVACAO_VALOR pela avaliacao AO VIVO (limite ativo e custo acima); com a aprovacao dada, SEPARAR', async () => {
    const setCfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    await setCfg('liberacao_valor_ativo', '1'); await setCfg('liberacao_valor_limite', '100');
    const m = await material({ qtd: 10 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_unitario = 80, custo_medio = 80 WHERE id = ?', [m]);
    const caro = await req([[m, 2]]); // 160 > 100
    const aprovada = await req([[m, 2]]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET data_aprovacao_valor = '2026-09-30 10:00:00' WHERE id = ?", [aprovada.id]);
    const r = (await fila()).body;
    assert.deepStrictEqual(daFila(r, caro.id).etapas, ['APROVACAO_VALOR']);
    assert.strictEqual(daFila(r, caro.id).acionavel, false);
    assert.deepStrictEqual(daFila(r, aprovada.id).etapas, ['SEPARAR']);
    await setCfg('liberacao_valor_ativo', '0');
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

  // ── Fase 5 ────────────────────────────────────────────────────────────────────────────────
  await test('Fase 5 (critico): separado mas o saldo foi embora (outra requisicao levou) — nao e ENTREGAR, e AGUARDANDO_SALDO', async () => {
    const m = await material({ qtd: 10 });
    const a = await req([[m, 10]]); const b = await req([[m, 10]]);
    await requisitionService.separarRequisicao(db, a.id, [{ item_id: a.ids[0], quantidade_separada: 10 }], ADMIN);
    // Mudado na Etapa 95 — a regra mudou: a separacao de B (10 com os 10 fisicos na caixa de A) agora e recusada
    // (RN-01, M2 em separacaoTetoFisico.api.test.js). O estado que este teste prova continua existindo no LEGADO
    // (separado antes da 95, achado pela A46), entao a caixa de B e posta por escritor direto, como a separacao antiga.
    await dbRun(db, "UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 10 WHERE id = ?", [b.ids[0]]);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [b.id]);
    await requisitionService.entregarRequisicao(db, a.id, [{ item_id: a.ids[0], quantidade_atendida: 10 }], ADMIN, null);
    const linha = daFila((await fila()).body, b.id);
    assert.deepStrictEqual(linha.etapas, ['AGUARDANDO_SALDO']);
    assert.strictEqual(linha.acionavel, false);
    assert.strictEqual(linha.itens[0].entregavel, 0);
  });

  await test('Fase 5 (critico): conferencia pendente em PRONTA_PARA_RETIRADA — CONFERENCIA_SEM_SAIDA, nao acionavel', async () => {
    const m = await material({ qtd: 10, critico: 1 });
    const { id } = await req([[m, 3, 3, 0]], { status: 'PRONTA_PARA_RETIRADA' });
    const linha = daFila((await fila()).body, id);
    assert.deepStrictEqual(linha.etapas, ['CONFERENCIA_SEM_SAIDA']);
    assert.strictEqual(linha.acionavel, false);
  });

  await test('Fase 5: a RESERVA da propria requisicao conta como separavel (totalmente reservada segurando todo o saldo)', async () => {
    const m = await material({ qtd: 5 });
    const { id } = await req([[m, 5]]);
    await requisitionService.reservarItensAprovacao(db, id, ADMIN, {});
    const r = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id]);
    const linha = daFila((await fila()).body, id);
    assert.deepStrictEqual(linha.etapas, ['SEPARAR'], `status ${r.status}: ${JSON.stringify(linha)}`);
    assert.strictEqual(linha.itens[0].separavel, 5);
    // E a reserva de OUTRA requisicao tira do separavel desta.
    const outra = await req([[m, 5]]);
    assert.deepStrictEqual(daFila((await fila()).body, outra.id).etapas, ['AGUARDANDO_SALDO']);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
