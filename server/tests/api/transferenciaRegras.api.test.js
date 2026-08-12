/**
 * Etapa 7, Task 2 — as duas lacunas da transferencia, nomeadas na auditoria de 2026-08-11.
 *
 * 1. `POST /transferencias` nao declarava `exigeLote`: material com controle_lote transferia sem
 *    citar de qual lote saiu — o oposto do que a flag promete.
 * 2. `TRANSFERENCIA` nao estava em REGRAS_VINCULO: a ausencia de exigencia era omissao, nao
 *    decisao. Passa a ser `{ vinculo: 'nenhum' }` — declarado. Mover material de prateleira e
 *    rotina; operador obrigado a justificar rotina escreve "ok".
 *
 * ARMADILHA que este arquivo existe para travar: TRANSFERENCIA e um ramo PROPRIO do
 * stockService, fora de tiposEntrada/tiposSaida — a guarda do exigeLote so alcancava esses dois
 * conjuntos. Declarar exigeLote na rota NAO basta; a condicao do if tem de citar TRANSFERENCIA.
 *
 * Decisao 8 do design, tambem travada aqui: transferencia NAO checa status nem vencimento do
 * lote. Mover um lote reprovado de prateleira e legitimo — e assim que ele vai parar na area de
 * bloqueados. A guarda de status fica so na saida, que e onde ela protege alguma coisa.
 *
 * Executar: cd server && node tests/api/transferenciaRegras.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, controlado) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',0,1,?)`, [`TRF-${seq}`, `Material transferencia ${seq}`, controlado ? 1 : 0]);
  return r.lastID;
}
async function novaLocalizacao(db, prefixo) {
  seq += 1;
  const r = await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES (?,?)',
    [`${prefixo}-${seq}`, `${prefixo} ${seq}`]);
  return r.lastID;
}
const saldoDaLinha = (db, materialId, locId, loteId) => dbGet(db,
  `SELECT quantidade FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [materialId, locId, loteId]);

/** Cenario padrao: material (controlado ou nao), duas localizacoes e 20 unidades na origem. */
async function cenario(db, { controlado = true, comLote = true } = {}) {
  const mat = await novoMaterial(db, controlado);
  const origem = await novaLocalizacao(db, 'TRF-O');
  const destino = await novaLocalizacao(db, 'TRF-D');
  const lote = comLote ? await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: `L-${seq}` }) : null;
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: mat, tipo: 'ENTRADA', quantidade: 20,
    lote_id: lote ? lote.id : undefined, localizacao_destino_id: origem, motivo: 'setup' });
  return { mat, origem, destino, lote };
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('transferencia de material com controle de lote sem lote falha', async () => {
    const { mat, origem, destino } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 5, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 400,
      `esperava 400 (TRANSFERENCIA e ramo proprio do motor: a guarda do exigeLote precisa cita-lo`
      + ` explicitamente), veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
  });

  // O cliente nao pode desligar a exigencia pelo corpo: exigeLote mora no 4o argumento de
  // registrarMovimentacao, nunca em `params` (que e req.body inteiro).
  //
  // ATENCAO ao 400 deste teste: sem a guarda de lote a transferencia sem `lote_id` de um material
  // controlado JA falhava com 400 "Saldo insuficiente na localizacao de origem" — porque a linha
  // de saldo procurada (lote_id NULL) simplesmente nao existe, o estoque esta na linha do lote.
  // Medido na execucao de 2026-08-12, ANTES de qualquer implementacao: este teste passava com
  // `assert.strictEqual(res.status, 400)` sozinho, provando nada. Por isso a mensagem TAMBEM e
  // verificada: so a guarda de lote produz um 400 que fala de lote.
  await test('o corpo nao consegue desligar a exigencia de lote na transferencia', async () => {
    const { mat, origem, destino } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 5, localizacao_origem_id: origem, localizacao_destino_id: destino, exigeLote: false });
    assert.strictEqual(res.status, 400, `o cliente desligou a guarda pelo body: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i,
      `400 veio de outra guarda (saldo), nao da exigencia de lote: ${res.body.error}`);
  });

  await test('transferencia com lote move a linha do lote entre localizacoes', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 8, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    assert.strictEqual((await saldoDaLinha(db, mat, origem, lote.id)).quantidade, 12);
    assert.strictEqual((await saldoDaLinha(db, mat, destino, lote.id)).quantidade, 8,
      'a linha do lote na localizacao de destino nao foi creditada');
    const total = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(total.quantidade_atual, 20, 'transferencia mexeu no total do material (nao deveria)');
  });

  await test('transferencia acima do saldo da origem falha', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 50, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /saldo/i);
    assert.strictEqual((await saldoDaLinha(db, mat, origem, lote.id)).quantidade, 20,
      'a origem foi debitada por uma transferencia recusada');
  });

  // DECISAO 8 do design, fixada como intencao: mover um lote bloqueado de prateleira e legitimo —
  // e assim que ele vai parar na area de bloqueados. Se um dia alguem "consertar" isto achando
  // que e um furo, este teste explica que nao e.
  await test('transferencia de lote bloqueado e permitida (decisao 8)', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO', status_motivo = 'ensaio pendente' WHERE id = ?", [lote.id]);
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 4, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201,
      `lote bloqueado tem de poder ser movido de prateleira: ${JSON.stringify(res.body)}`);
    assert.strictEqual((await saldoDaLinha(db, mat, destino, lote.id)).quantidade, 4);
  });

  await test('transferencia de lote vencido e permitida (decisao 8)', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    await dbRun(db, "UPDATE lotes_almoxarifado SET data_validade = '2020-01-01' WHERE id = ?", [lote.id]);
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 4, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  // Decisao 5: `{ vinculo: 'nenhum' }` — declarado, nao omisso. Sem OS, projeto, centro de custo
  // nem justificativa, a transferencia passa.
  await test('transferencia nao exige vinculo nem justificativa (decisao 5)', async () => {
    const { mat, origem, destino, lote } = await cenario(db, {});
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 2, lote_id: lote.id, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const { REGRAS_VINCULO } = require('../../services/almoxarifado/movementRules');
    assert.deepStrictEqual(REGRAS_VINCULO.TRANSFERENCIA, { vinculo: 'nenhum' },
      'TRANSFERENCIA tem de estar DECLARADA em REGRAS_VINCULO — ausencia e omissao, nao decisao');
  });

  // CONTROLE POSITIVO da guarda de lote: se o `if` tivesse sido estendido de forma grosseira
  // (por exemplo exigindo lote em TODO tipo), este teste falharia.
  await test('[controle positivo] material SEM controle de lote continua transferindo sem lote', async () => {
    const { mat, origem, destino } = await cenario(db, { controlado: false, comLote: false });
    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 5, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual((await saldoDaLinha(db, mat, destino, null)).quantidade, 5);
  });

  // DECISAO 9: serie na transferencia esta fora do escopo, e isso vale DE GRACA porque
  // `serieObrigatoria` (stockService) tambem exige tiposEntrada||tiposSaida. Este teste registra
  // o fato: quem estender o if do exigeLote NAO pode copiar a mesma mudanca para o exigeSerie.
  await test('transferencia de material com controle de serie nao exige series (decisao 9)', async () => {
    seq += 1;
    const mat = (await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
       VALUES (?,?,'UN',0,1,1)`, [`TRF-SER-${seq}`, `Material serie ${seq}`])).lastID;
    const origem = await novaLocalizacao(db, 'TRF-SO');
    const destino = await novaLocalizacao(db, 'TRF-SD');
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, series: ['SN-T1', 'SN-T2'], localizacao_destino_id: origem, motivo: 'setup' });

    const res = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 2, localizacao_origem_id: origem, localizacao_destino_id: destino });
    assert.strictEqual(res.status, 201,
      `a transferencia passou a exigir serie — a decisao 9 diz o contrario: ${JSON.stringify(res.body)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
