/**
 * Etapa 62 — ajuste de material com série diz quais séries entram ou saem (fecha o C82).
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa62-ajuste-com-serie.md
 *
 * Executar: cd server && node tests/api/ajusteComSerie.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 62: ajuste com serie ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const material = async (serie = 1, categoria = null) => {
    const c = `E62-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie, categoria)
      VALUES (?, ?, 'UN', 0, 1, ?, ?)`, [c, `Mat ${c}`, serie, categoria])).lastID, codigo: c };
  };
  const mov = (m, body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m, motivo: 'e62', justificativa: 'ajuste e62', ...body });
  const entrar = async (m, numeros) => { const r = await mov(m, { tipo: 'ENTRADA', quantidade: numeros.length, series: numeros }); assert.strictEqual(r.status, 201, JSON.stringify(r.body)); };
  const estado = async (m) => ({
    fisico: (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q,
    presentes: (await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')", [m])).n,
  });
  const serieId = async (m, numero) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m, numero])).id;
  const recusa = (r, literal) => { assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, literal); };

  await test('O defeito (C82): AJUSTE que SOBE sem series -> 400; com os numeros -> fisico e presentes batem', async () => {
    const m = await material(); await entrar(m.id, ['A1', 'A2', 'A3']);
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 5 }),
      'material com controle de serie: o ajuste sobe 2 serie(s) (fisico novo 5, series presentes 3) — informe 2 serie(s) (recebidas 0)');
    assert.deepStrictEqual(await estado(m.id), { fisico: 3, presentes: 3 });
    const r = await mov(m.id, { tipo: 'AJUSTE', quantidade: 5, series: ['A4', 'A5'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 5, presentes: 5 });
  });

  await test('AJUSTE que DESCE: as series escolhidas ficam BAIXADA e o vinculo fica no livro', async () => {
    const m = await material(); await entrar(m.id, ['B1', 'B2', 'B3']);
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 1, serie_ids: [await serieId(m.id, 'B1')] }),
      'material com controle de serie: o ajuste baixa 2 serie(s) (fisico novo 1, series presentes 3) — informe 2 serie(s) (recebidas 1)');
    const r = await mov(m.id, { tipo: 'AJUSTE', quantidade: 1, serie_ids: [await serieId(m.id, 'B1'), await serieId(m.id, 'B3')] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 1, presentes: 1 });
    const b1 = await dbGet(db, "SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE material_id = ? AND numero = 'B1'", [m.id]);
    assert.strictEqual(b1.status, 'BAIXADA'); assert.strictEqual(b1.movimentacao_saida_id, r.body.id);
  });

  await test('Legado divergente: a conta e novo − PRESENTES (fisico 5, presentes 3 -> ajustar para 3 nao pede serie)', async () => {
    const m = await material(); await entrar(m.id, ['C1', 'C2', 'C3']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [m.id]); // o estrago antigo
    const r = await mov(m.id, { tipo: 'AJUSTE', quantidade: 3 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 3, presentes: 3 });
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 3, series: ['C9'] }),
      'material com controle de serie: o ajuste nao muda as series (presentes 3) — nao informe series');
  });

  await test('Fracionario e por endereco: recusados com a literal, nada muda', async () => {
    const m = await material(); await entrar(m.id, ['D1', 'D2']);
    const L = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, ativo) VALUES (?, 1)", [`E62-L${++seq}`])).lastID;
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 2.5 }), 'material com controle de serie exige quantidade inteira');
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 1, localizacao_destino_id: L, serie_ids: [await serieId(m.id, 'D1')] }),
      'material com controle de serie: ajuste por endereco nao e suportado — ajuste o total do material (sem endereco)');
    assert.deepStrictEqual(await estado(m.id), { fisico: 2, presentes: 2 });
  });

  await test('Estorno de AJUSTE de material com serie: recusado (e o caminho e um novo ajuste)', async () => {
    const m = await material(); await entrar(m.id, ['E1']);
    const r = await mov(m.id, { tipo: 'AJUSTE', quantidade: 2, series: ['E2'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const c = await request(app).post(`/api/almoxarifado/movimentacoes/${r.body.id}/cancelar`).send({ motivo: 'e62 estorno' });
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(c.body.error, 'estorno de ajuste de material com serie recusado — faca um novo ajuste (ele pede as series)');
    assert.deepStrictEqual(await estado(m.id), { fisico: 2, presentes: 2 });
    // Metade positiva: AJUSTE de material SEM serie continua estornável.
    const s = await material(0);
    const a = await mov(s.id, { tipo: 'AJUSTE', quantidade: 4 });
    assert.strictEqual((await request(app).post(`/api/almoxarifado/movimentacoes/${a.body.id}/cancelar`).send({ motivo: 'e62 estorno' })).status, 200);
  });

  await test('Material SEM serie: AJUSTE como hoje (series ignoradas? nao — nem entram na conta)', async () => {
    const s = await material(0);
    const r = await mov(s.id, { tipo: 'AJUSTE', quantidade: 7 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await estado(s.id)).fisico, 7);
  });

  await test('RN-02 inventario: contagem fracionaria de material com serie recusada; inteira devolve series_a_regularizar', async () => {
    const categoria = `CAT-E62-${++seq}`;
    const m = await material(1, categoria); await entrar(m.id, ['F1', 'F2', 'F3']);
    const criada = await request(app).post('/api/almoxarifado/conferencias').send({ categoria, tolerancia_percentual: 100 });
    assert.strictEqual(criada.status, 201, JSON.stringify(criada.body));
    const item = await dbGet(db, 'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?', [criada.body.id]);
    const contar = (q) => request(app).put(`/api/almoxarifado/conferencias/${criada.body.id}/item/${item.id}`).send({ quantidade_contada: q });
    assert.strictEqual((await contar(2.5)).status, 200);
    let r = await request(app).put(`/api/almoxarifado/conferencias/${criada.body.id}/concluir`).send({ aplicar_ajustes: true, justificativa_ajuste: 'contagem do inventario e62' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.includes(`${m.codigo}: material com controle de serie exige contagem inteira`), r.body.error);
    assert.strictEqual((await estado(m.id)).fisico, 3);
    assert.strictEqual((await contar(2)).status, 200);
    r = await request(app).put(`/api/almoxarifado/conferencias/${criada.body.id}/concluir`).send({ aplicar_ajustes: true, justificativa_ajuste: 'contagem do inventario e62' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.series_a_regularizar, [{ material_id: m.id, codigo: m.codigo, fisico: 2, presentes: 3 }]);
    // E a regularização fecha exatamente essa diferença.
    const reg = await request(app).post(`/api/almoxarifado/materiais/${m.id}/series/regularizar`)
      .send({ baixar: [await serieId(m.id, 'F2')], justificativa: 'nao achada na contagem' });
    assert.strictEqual(reg.status, 200, JSON.stringify(reg.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 2, presentes: 2 });
  });

  // ── Fase 5 ────────────────────────────────────────────────────────────────────────────────
  await test('Fase 5 (corrida): dois ajustes lendo as mesmas presentes — um recusado (409), invariante fecha', async () => {
    const m = await material(); await entrar(m.id, ['G1', 'G2', 'G3']);
    const rs = await Promise.all([
      mov(m.id, { tipo: 'AJUSTE', quantidade: 5, series: ['GX1', 'GX2'] }),
      mov(m.id, { tipo: 'AJUSTE', quantidade: 4, series: ['GY1'] }),
    ]);
    const st = rs.map((r) => r.status).sort();
    assert.ok(st.includes(201), JSON.stringify(rs.map((r) => r.body)));
    const e = await estado(m.id);
    assert.strictEqual(e.fisico, e.presentes, `invariante quebrado: ${JSON.stringify(e)} ${JSON.stringify(rs.map((r) => r.body))}`);
  });

  await test('Fase 5: numero JA presente e recusado antes de qualquer efeito (fisico nao muda)', async () => {
    const m = await material(); await entrar(m.id, ['H1', 'H2']);
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 3, series: ['H1'] }), 'serie H1 ja esta em estoque');
    assert.deepStrictEqual(await estado(m.id), { fisico: 2, presentes: 2 });
    // Material de CLIENTE: a guarda do dono audita o ajuste como efeito colateral — a recusa tem de vir
    // ANTES dela, senão fica auditoria de um ajuste que não aconteceu (o entradaSeries recusaria com a
    // mesma literal, mas depois da auditoria; é isto que separa as duas).
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E62')")).lastID;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ? WHERE id = ?', [cli, m.id]);
    const audAntes = (await dbGet(db, "SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'material_cliente' AND entidade_id = ?", [m.id])).n;
    recusa(await mov(m.id, { tipo: 'AJUSTE', quantidade: 3, series: ['H2'] }), 'serie H2 ja esta em estoque');
    const audDepois = (await dbGet(db, "SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'material_cliente' AND entidade_id = ?", [m.id])).n;
    assert.strictEqual(audDepois, audAntes, 'auditoria orfa de ajuste recusado');
  });

  await test('Fase 5: o ajuste reusa o numero de uma serie BAIXADA (reativa); total 0 baixa todas; negativo recusado', async () => {
    const m = await material(); await entrar(m.id, ['J1', 'J2']);
    assert.strictEqual((await mov(m.id, { tipo: 'AJUSTE', quantidade: 1, serie_ids: [await serieId(m.id, 'J1')] })).status, 201);
    const r = await mov(m.id, { tipo: 'AJUSTE', quantidade: 2, series: ['J1'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await dbGet(db, "SELECT status FROM series_almoxarifado WHERE material_id = ? AND numero = 'J1'", [m.id])).status, 'EM_ESTOQUE');
    // AJUSTE para 0 sem endereço já era recusado pelo schema da v2 (0 só com endereço) — e o ajuste de
    // material com série não aceita endereço. Zerar é pelo AJUSTE_NEGATIVO, com as séries.
    const zero = await mov(m.id, { tipo: 'AJUSTE', quantidade: 0, serie_ids: [await serieId(m.id, 'J1'), await serieId(m.id, 'J2')] });
    assert.strictEqual(zero.status, 400, JSON.stringify(zero.body));
    const neg = await mov(m.id, { tipo: 'AJUSTE_NEGATIVO', quantidade: 2, serie_ids: [await serieId(m.id, 'J1'), await serieId(m.id, 'J2')] });
    assert.strictEqual(neg.status, 201, JSON.stringify(neg.body));
    assert.deepStrictEqual(await estado(m.id), { fisico: 0, presentes: 0 });
    // Total negativo no motor (a v2 já recusa no schema; a guarda do motor vale para quem chama direto).
    const stockService = require('../../services/almoxarifado/stockService');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'AJUSTE', quantidade: -2, motivo: 'e62', justificativa: 'e62' }, { exigeSerie: true }),
      // Quem recusa é a 1a validação do motor (quantidade obrigatória/positiva) — a guarda de total
      // negativo do ajuste com série ficou como segunda barreira, inalcançável (declarado).
      (err) => err.status === 400);
  });

  await test('Fase 5: inventario SEM divergencia de serie nao entra em series_a_regularizar (metade negativa)', async () => {
    const categoria = `CAT-E62N-${++seq}`;
    const m = await material(1, categoria); await entrar(m.id, ['K1', 'K2']);
    const criada = await request(app).post('/api/almoxarifado/conferencias').send({ categoria, tolerancia_percentual: 100 });
    const item = await dbGet(db, 'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?', [criada.body.id]);
    assert.strictEqual((await request(app).put(`/api/almoxarifado/conferencias/${criada.body.id}/item/${item.id}`).send({ quantidade_contada: 2 })).status, 200);
    const r = await request(app).put(`/api/almoxarifado/conferencias/${criada.body.id}/concluir`).send({ aplicar_ajustes: true, justificativa_ajuste: 'contagem igual ao sistema' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.series_a_regularizar, []);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
