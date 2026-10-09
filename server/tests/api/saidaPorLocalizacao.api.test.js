/**
 * Etapa 51 — a saída baixa o endereço de onde o material sai.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa51-saida-por-localizacao.md
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa51-saida-por-localizacao-design.md
 *
 * Os cenários são os da sonda da Fase 0 (`scratchpad/e51-sonda-localizacao.js`) e os que a Fase 2
 * acrescentou. A invariante que cada um confere: a soma das linhas é igual a `quantidade_atual`, e
 * — em material sem lote que não permite negativo — nenhuma linha de ENDEREÇO fica com saldo que
 * não existe.
 *
 * Executar: cd server && node tests/api/saidaPorLocalizacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 51: a saida baixa o endereco ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (codigo) => (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES (?, ?)',
    [`E51-${codigo}-${++seq}`, codigo])).lastID;
  const material = async (extra = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, permite_saldo_negativo, localizacao_padrao_id)
      VALUES (?, ?, 'UN', 0, 1, ?, ?, ?)`,
  [`E51-M${++seq}`, 'Mat E51', extra.lote ? 1 : 0, extra.negativo ? 1 : 0, extra.padrao || null])).lastID;
  const entrada = async (m, locId, q, loteId = null) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: locId, motivo: 'e51',
      ...(loteId ? { lote_id: loteId } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  // A chamada EXATA da entrega de requisição (sem origem, sem lote).
  const entregaSemOrigem = (m, q) => stockService.registrarMovimentacao(db, ADMIN, {
    material_id: m, tipo: 'SAIDA', quantidade: q, motivo: 'entrega', justificativa: 'entrega',
  });
  const linhas = async (m) => Object.fromEntries((await dbAll(db, `SELECT COALESCE(l.descricao, 'NULL') ||
      CASE WHEN s.lote_id IS NULL THEN '' ELSE '/L' END as k, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id
    WHERE s.material_id = ? ORDER BY s.id`, [m])).map((r) => [r.k, r.q]));
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q;
  const invariante = async (m) => {
    const soma = Object.values(await linhas(m)).reduce((s, q) => s + q, 0);
    assert.ok(Math.abs(soma - await fisico(m)) < 1e-9, `soma das linhas ${soma} != fisico ${await fisico(m)}`);
  };

  await test('(1) entrada de 100 em A, entrega sem origem de 100 -> A:0, nenhuma linha negativa (RN-01)', async () => {
    const m = await material(); const A = await loc('A');
    await entrada(m, A, 100);
    await entregaSemOrigem(m, 100);
    assert.deepStrictEqual(await linhas(m), { A: 0 });
    assert.strictEqual(await fisico(m), 0);
  });

  await test('(2) saida com origem B vazia: B nao negativa, A cede (RN-02)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 40);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'SAIDA', quantidade: 5, localizacao_origem_id: B, motivo: 'x', justificativa: 'x',
    });
    const l = await linhas(m);
    assert.strictEqual(l.A, 35, JSON.stringify(l));
    assert.ok(!(l.B < 0), `a origem declarada vazia negativou: ${JSON.stringify(l)}`);
    await invariante(m);
  });

  await test('(3) A:60 e B:40, saida de 70 sem origem: a maior primeiro, nenhuma negativa', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 60); await entrada(m, B, 40);
    await entregaSemOrigem(m, 70);
    assert.deepStrictEqual(await linhas(m), { A: 0, B: 30 });
    await invariante(m);
  });

  await test('(4) com localizacao PADRAO: a padrao cede primeiro', async () => {
    const P = await loc('P'); const Q = await loc('Q');
    const m = await material({ padrao: P });
    await entrada(m, P, 20); await entrada(m, Q, 50);
    await entregaSemOrigem(m, 30);
    assert.deepStrictEqual(await linhas(m), { P: 0, Q: 40 });
    await invariante(m);
  });

  await test('(5) o que SOBRA sem endereco vai para a linha "sem localizacao atribuida" (material que permite negativo)', async () => {
    const m = await material({ negativo: 1 }); const A = await loc('A');
    await entrada(m, A, 10);
    await entregaSemOrigem(m, 15);
    assert.deepStrictEqual(await linhas(m), { A: 0, NULL: -5 });
    await invariante(m);
  });

  await test('(6) material LEGADO sem nenhuma linha: a saida sem origem se comporta como antes', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 50 WHERE id = ?', [m]);
    await entregaSemOrigem(m, 10);
    assert.strictEqual(await fisico(m), 40);
    assert.deepStrictEqual(await linhas(m), { NULL: -10 });
  });

  await test('(7) material com LOTE: a entrega sem lote NAO toca a linha de lote (B204) - declarado', async () => {
    const m = await material({ lote: 1 }); const A = await loc('A');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L' });
    await entrada(m, A, 100, L.id);
    await entregaSemOrigem(m, 100);
    assert.deepStrictEqual(await linhas(m), { 'A/L': 100, NULL: -100 });
    await invariante(m);
  });

  await test('(8) AJUSTE absoluto sem localizacao PARA BAIXO drena os enderecos (RN-03)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 30); await entrada(m, B, 20);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE', quantidade: 5, motivo: 'x', justificativa: 'x' });
    const l = await linhas(m);
    assert.ok(Object.values(l).every((q) => q >= 0), `linha negativa: ${JSON.stringify(l)}`);
    assert.strictEqual(await fisico(m), 5);
    await invariante(m);
  });

  await test('(9) AJUSTE absoluto PARA CIMA vai para a linha padrao/NULL, como antes', async () => {
    const m = await material(); const A = await loc('A');
    await entrada(m, A, 10);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE', quantidade: 25, motivo: 'x', justificativa: 'x' });
    assert.deepStrictEqual(await linhas(m), { A: 10, NULL: 15 });
    await invariante(m);
  });

  await test('(10) contagem "L em A = 0" do material com lote ABSORVE o sem-localizacao negativo (RN-04, Fase 2 CRITICAL)', async () => {
    const m = await material({ lote: 1 }); const A = await loc('A');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L2' });
    await entrada(m, A, 100, L.id);
    await entregaSemOrigem(m, 100); // A/L:100, NULL:-100, fisico 0
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: A, lote_id: L.id, motivo: 'contagem', justificativa: 'contagem',
    });
    assert.strictEqual(await fisico(m), 0, 'o fisico ficou negativo');
    assert.ok(Object.values(await linhas(m)).every((q) => Math.abs(q) < 1e-9), JSON.stringify(await linhas(m)));
  });

  await test('(11) transferencia de endereco ja esvaziado pela entrega e RECUSADA (antes: aceita, fantasma)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 100);
    await entregaSemOrigem(m, 100);
    const t = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: m, quantidade: 100, localizacao_origem_id: A, localizacao_destino_id: B, motivo: 'x' });
    assert.ok(t.status >= 400, `a transferencia de um endereco vazio foi aceita: ${t.status} ${JSON.stringify(t.body)}`);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('(12) concorrencia: duas saidas simultaneas de 60 com A:100 e B:50 -> A:0, B:30, sem fantasma', async () => {
    // Fase 2 (IMPORTANT 2): o claim copiado do lote PULAVA a linha quando o débito condicional não
    // casava — o perdedor mandava o resto para a linha negativa com A ainda em 40.
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 100); await entrada(m, B, 50);
    // mudado na Etapa 97 (Fase 2, I-3): o motor pega a trava do material fora de secao, e as duas saidas pela porta
    // SERIALIZAM. Este caso prova o CLAIM concorrente da linha, entao chama o corpo sem a trava (a serializacao pelo
    // motor travado e provada em portasAvulsasCaixa).
    const semTrava = (q) => stockService.registrarMovimentacaoSemTrava(db, ADMIN, {
      material_id: m, tipo: 'SAIDA', quantidade: q, motivo: 'entrega', justificativa: 'entrega',
    });
    await Promise.all([semTrava(60), semTrava(60)]);
    const l = await linhas(m);
    assert.deepStrictEqual(l, { A: 0, B: 30 }, `o perdedor pulou a linha com saldo: ${JSON.stringify(l)}`);
    await invariante(m);
  });

  // ═══ Fase 5 (força dos testes): as lacunas que 10 sabotagens verdes mostraram ═══
  const setLinha = (m, locId, loteId, q) => dbRun(db,
    'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,?,?)', [m, locId, loteId, q]);
  const setFisico = (m, q) => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [q, m]);
  const ajusteLoc = (m, locId, q, loteId = null) => stockService.registrarMovimentacao(db, ADMIN, {
    material_id: m, tipo: 'AJUSTE', quantidade: q, localizacao_destino_id: locId, motivo: 'c', justificativa: 'c',
    ...(loteId ? { lote_id: loteId } : {}),
  });

  await test('(14) RN-04 RECUSA quando nem absorvendo o total chega a 0 (linha de lote legada negativa)', async () => {
    const m = await material({ lote: 1 }); const A = await loc('A'); const B = await loc('B');
    const L1 = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L1' });
    const L2 = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L2' });
    await setLinha(m, A, L1.id, 100); await setLinha(m, B, L2.id, -50); await setFisico(m, 50);
    await assert.rejects(ajusteLoc(m, A, 0, L1.id), (e) => e.status === 400
      && e.message === 'Ajuste deixaria o saldo do material negativo (-50). O material não permite saldo negativo.');
    assert.strictEqual(await fisico(m), 50, 'a recusa deixou escrita pela metade');
  });

  await test('(15) saida COM lote de material que permite negativo continua baixando a linha do lote (!loteIdFinal)', async () => {
    const m = await material({ lote: 1, negativo: 1 }); const A = await loc('A');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L' });
    await entrada(m, A, 10, L.id);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'SAIDA', quantidade: 4, lote_id: L.id, localizacao_origem_id: A, motivo: 'x', justificativa: 'x',
    });
    assert.deepStrictEqual(await linhas(m), { 'A/L': 6 });
  });

  await test('(16) ledger falhando: a compensacao devolve TODAS as linhas, inclusive a do resto', async () => {
    const m = await material({ negativo: 1 }); const A = await loc('A');
    await entrada(m, A, 10);
    await dbRun(db, `CREATE TRIGGER e51_falha BEFORE INSERT ON movimentacoes_almoxarifado
      WHEN NEW.material_id = ${m} BEGIN SELECT RAISE(ABORT, 'falha proposital'); END`);
    try {
      await assert.rejects(entregaSemOrigem(m, 15));
    } finally {
      await dbRun(db, 'DROP TRIGGER e51_falha');
    }
    assert.strictEqual(await fisico(m), 10);
    assert.deepStrictEqual(await linhas(m), { A: 10, NULL: 0 });
    await invariante(m);
  });

  await test('(17) o ESTORNO do AJUSTE com localizacao tambem absorve (fisico nao fica negativo)', async () => {
    const m = await material(); const A = await loc('A');
    await setLinha(m, A, null, 50); await setLinha(m, null, null, -30); await setFisico(m, 20);
    const aj = await ajusteLoc(m, A, 80);
    await entregaSemOrigem(m, 50);
    const movId = aj?.id || aj?.movimentacao_id || (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE' ORDER BY id DESC LIMIT 1", [m])).id;
    // Fase 5 (MINOR): no estorno não há contagem — absorver faria o livro registrar quantidade que
    // não se moveu. Recusa, e nada muda.
    const antes = await linhas(m);
    await assert.rejects(stockService.cancelarMovimentacao(db, ADMIN, movId, 'estorno e51'),
      (e) => e.status === 400 && e.message === 'Não é possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)');
    assert.deepStrictEqual(await linhas(m), antes, 'a recusa deixou escrita pela metade');
    assert.ok(await fisico(m) >= 0, `fisico negativo depois do estorno: ${await fisico(m)}`);
    await invariante(m);
  });

  await test('(23) ESTORNO DE ENTRADA depois de saida que drenou o endereco dela: nenhum endereco negativo (Fase 5, IMPORTANT)', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 100); await entrada(m, B, 100);
    await entregaSemOrigem(m, 100); // drena A (desempate por id): A:0, B:100
    const entA = (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'ENTRADA' AND localizacao_destino_id = ?`, [m, A])).id;
    await stockService.cancelarMovimentacao(db, ADMIN, entA, 'entrada lancada errado');
    const l = await linhas(m);
    assert.ok(Object.values(l).every((q) => q >= -1e-9), `endereco negativo depois do estorno: ${JSON.stringify(l)}`);
    assert.strictEqual(await fisico(m), 0);
    assert.deepStrictEqual(l, { A: 0, B: 0 });
    await invariante(m);
  });

  await test('(18) material que PERMITE negativo nao absorve: a divida continua (-70)', async () => {
    const m = await material({ negativo: 1 }); const A = await loc('A');
    await setLinha(m, A, null, 50); await setLinha(m, null, null, -80); await setFisico(m, -30);
    await ajusteLoc(m, A, 10);
    assert.strictEqual(await fisico(m), -70);
  });

  await test('(19) absorcao na ORDEM: a NULL primeiro, e linha de lote nunca sobe', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'LX' });
    await setLinha(m, A, null, 50); await setLinha(m, B, null, -30); await setLinha(m, null, null, -10);
    await setLinha(m, null, L.id, -5); await setFisico(m, 5);
    await ajusteLoc(m, A, 40); // soma projetada 40-30-10-5 = -5 -> absorve 5: NULL primeiro
    const l = await linhas(m);
    assert.strictEqual(l.NULL, -5, JSON.stringify(l));
    assert.strictEqual(l.B, -30, JSON.stringify(l));
    assert.strictEqual(l['NULL/L'], -5, 'a absorcao subiu linha de lote');
    await invariante(m);
  });

  await test('(19b) a linha de LOTE sem endereco, que vem PRIMEIRO na ordem, nunca e absorvida', async () => {
    // Sabotagem Y7 do fix-round ficou verde no (19): lá a NULL sem lote cobria tudo antes de a
    // ordem chegar ao lote. Aqui o déficit precisa da linha B (com endereço), que ordena DEPOIS
    // da NULL/L — sem o filtro `lote_id IS NULL`, a NULL/L seria zerada primeiro.
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'LY' });
    await setLinha(m, A, null, 50); await setLinha(m, B, null, -30); await setLinha(m, null, L.id, -10);
    await setFisico(m, 10);
    await ajusteLoc(m, A, 20); // projetado 20-30-10 = -20; absorvível sem lote = 30
    const l = await linhas(m);
    assert.strictEqual(l['NULL/L'], -10, `a absorcao subiu a linha de lote: ${JSON.stringify(l)}`);
    assert.strictEqual(l.B, -10, JSON.stringify(l));
    await invariante(m);
  });

  await test('(20) AJUSTE de LOTE sem localizacao nao drena linha sem lote (drenar so com loteId nulo)', async () => {
    const m = await material({ lote: 1 }); const A = await loc('A'); const B = await loc('B');
    const L = await lotService.criarOuObterLote(db, ADMIN, { material_id: m, codigo: 'L' });
    await entrada(m, A, 30, L.id); await setLinha(m, B, null, 20); await setFisico(m, 50);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE', quantidade: 5, lote_id: L.id, motivo: 'x', justificativa: 'x' });
    assert.strictEqual((await linhas(m)).B, 20, JSON.stringify(await linhas(m)));
  });

  await test('(21) drenagem do AJUSTE na ordem (maior primeiro) e resto fracionario preservado', async () => {
    const m = await material(); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 30); await entrada(m, B, 20);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'AJUSTE', quantidade: 5, motivo: 'x', justificativa: 'x' });
    assert.deepStrictEqual(await linhas(m), { A: 0, B: 5, NULL: 0 });
    const m2 = await material({ negativo: 1 }); const C = await loc('C');
    await entrada(m2, C, 10);
    await entregaSemOrigem(m2, 10.3);
    await invariante(m2);
    assert.ok(Math.abs((await linhas(m2)).NULL - -0.3) < 1e-9, JSON.stringify(await linhas(m2)));
  });

  await test('(22) o resto vai para a ORIGEM DECLARADA, nao para a NULL (desenho, RN-01)', async () => {
    const m = await material({ negativo: 1 }); const A = await loc('A'); const B = await loc('B');
    await entrada(m, A, 10);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m, tipo: 'SAIDA', quantidade: 15, localizacao_origem_id: B, motivo: 'x', justificativa: 'x',
    });
    assert.deepStrictEqual(await linhas(m), { A: 0, B: -5 });
  });

  await test('(13) o mapa mostra o endereco VAZIO depois da entrega', async () => {
    const m = await material(); const A = await loc('MAPA');
    await entrada(m, A, 30);
    await entregaSemOrigem(m, 30);
    const r = await request(app).get('/api/almoxarifado/mapa/localizacoes');
    assert.strictEqual(r.status, 200);
    const lista = Array.isArray(r.body) ? r.body : (r.body.localizacoes || r.body.dados || []);
    const noMapa = lista.find((x) => x.id === A || x.localizacao_id === A);
    assert.ok(noMapa, `o endereco sumiu do mapa: ${JSON.stringify(lista).slice(0, 300)}`);
    assert.ok(!(Number(noMapa.qtd_itens) > 0), `o endereco vazio aparece ocupado: ${JSON.stringify(noMapa)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
