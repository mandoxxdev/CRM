const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
const JUST = { justificativa: 'teste de guarda de lote' };

let seq = 0;
async function novoMaterial(db, extra = '') {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo${extra ? ', ' + extra : ''})
     VALUES (?,?,'UN',0,1${extra ? ', 1' : ''})`,
    [`GRD-${seq}`, `Material guarda ${seq}`]);
  return r.lastID;
}
async function entrar(db, materialId, loteId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'ENTRADA', quantidade: qtd, lote_id: loteId, motivo: 'setup' });
}
const saldoDoLote = (db, materialId, loteId) => dbGet(db,
  'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?', [materialId, loteId]);
const linhasDeSaldo = (db, materialId) => dbAll(db,
  'SELECT localizacao_id, lote_id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? ORDER BY id', [materialId]);
const totalDoMaterial = async (db, materialId) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId])).quantidade_atual;
const somaDasLinhas = async (db, materialId) => (await dbGet(db,
  'SELECT COALESCE(SUM(quantidade),0) as total FROM estoque_saldo_almoxarifado WHERE material_id = ?', [materialId])).total;
const novaLocalizacao = async (db, codigo) =>
  (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES (?,?)', [codigo, codigo])).lastID;

// Movimentação LEGADA: gravada direto no livro, sem passar pelo motor — é o formato de TODAS as
// movimentações que já estão no banco de produção (o dump tem 3 linhas de saldo no total). Elas
// nunca escreveram linha em `estoque_saldo_almoxarifado`, porque a criação incondicional da linha
// só existe a partir desta etapa. Estornar uma delas é o cenário do round 4.
async function movimentacaoLegada(db, materialId, tipo, quantidade, saldoAnterior, saldoPosterior) {
  const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome, unidade)
    VALUES (?,?,?,?,?,'movimento anterior a Etapa 6',1,'Admin Teste','UN')`,
    [materialId, tipo, quantidade, saldoAnterior, saldoPosterior]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('saida acima do saldo do lote falha e nao deixa a linha negativa', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'A' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'B' });
    await entrar(db, mat, loteA.id, 100);
    await entrar(db, mat, loteB.id, 2);

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: loteB.id, ...JUST }),
      /saldo/i, 'o motor aceitou tirar 10 de um lote que tem 2');

    const b = await saldoDoLote(db, mat, loteB.id);
    assert.strictEqual(b.quantidade, 2, `lote B ficou em ${b.quantidade} — a linha do lote foi negativada`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 102, 'o total do material foi alterado por uma saida recusada');
  });

  await test('saida dentro do saldo do lote passa e debita o lote certo', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'A2' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'B2' });
    await entrar(db, mat, loteA.id, 100);
    await entrar(db, mat, loteB.id, 10);

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, lote_id: loteB.id, ...JUST });

    assert.strictEqual((await saldoDoLote(db, mat, loteB.id)).quantidade, 6);
    assert.strictEqual((await saldoDoLote(db, mat, loteA.id)).quantidade, 100, 'debitou o lote errado');
  });

  await test('saida de lote vencido falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'VENCIDO', data_validade: '2020-01-01' });
    await entrar(db, mat, lote.id, 50);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /vencid/i);
  });

  await test('saida de lote reprovado falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'REPROVADO' });
    await entrar(db, mat, lote.id, 50);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'REPROVADO', 'falhou no ensaio');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /reprovad|bloquead/i);
  });

  await test('saida de lote bloqueado falha, e liberar o lote destrava', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'BLOQ' });
    await entrar(db, mat, lote.id, 50);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'aguardando certificado');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /bloquead/i);

    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'ATIVO', 'certificado anexado');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 49);
  });

  await test('a movimentacao guarda lote_id e o codigo do lote', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'LEDGER-1' });
    await entrar(db, mat, lote.id, 5);
    const mov = await dbGet(db,
      'SELECT lote_id, lote FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.lote_id, lote.id);
    assert.strictEqual(mov.lote, 'LEDGER-1', 'o ledger precisa guardar o codigo, nao so o id');
  });

  await test('aceita o codigo do lote no lugar do id', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'POR-CODIGO' });
    await entrar(db, mat, lote.id, 20);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 5, lote: 'POR-CODIGO', ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 15);
  });

  await test('codigo de lote inexistente na saida falha', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote: 'NAO-EXISTE', ...JUST }),
      /lote/i);
  });

  await test('material que permite saldo negativo continua podendo ficar negativo no lote', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [mat]);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'NEG' });
    await entrar(db, mat, lote.id, 2);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, -8,
      'a guarda por lote nao pode valer para material que permite saldo negativo');
  });

  // ── Fix round 1 (review) ──────────────────────────────────────────────────────

  await test('estornar ENTRADA com lote devolve a linha do lote (sem isso vira lote fantasma)', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'EST-ENT' });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');

    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 0,
      'a linha do lote continuou positiva depois do estorno da entrada — lote fantasma');
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0);
  });

  await test('estornar SAIDA com lote devolve a linha do lote', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'EST-SAI' });
    await entrar(db, mat, lote.id, 20);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 8, lote_id: lote.id, ...JUST });

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');

    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 20,
      'a linha do lote nao voltou ao valor original depois do estorno da saida');
  });

  await test('saida com reserva e lote: claim do lote falha, e material/reserva/utilizada voltam exatamente como estavam', async () => {
    const mat = await novoMaterial(db);
    // 100 sem lote (agora tambem cria linha, ver fix do syncMaterialTotals) + 3 no lote-alvo:
    // total 103 de disponivel para a reserva, mas o LOTE em si so tem 3.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 100, motivo: 'setup sem lote' });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'RES-LOTE' });
    await entrar(db, mat, lote.id, 3);

    const reserva = await stockService.criarReserva(db, ADMIN, { material_id: mat, quantidade: 10 });

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, reserva_id: reserva.id, ...JUST }),
      /saldo/i, 'o motor aceitou consumir 10 de um lote que so tem 3, mesmo com reserva de 10');

    const m = await dbGet(db, 'SELECT quantidade_atual, quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 103, 'o fisico do material nao voltou ao valor original');
    assert.strictEqual(m.quantidade_reservada, 10, 'o hold da reserva nao voltou ao material');

    const resAfter = await dbGet(db, 'SELECT quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE id = ?', [reserva.id]);
    assert.strictEqual(resAfter.quantidade_utilizada, 0, 'a reserva ficou com utilizada > 0 sem nenhuma saida real');
    assert.strictEqual(resAfter.status, 'ATIVA', 'a reserva nao voltou para ATIVA depois do claim do lote falhar');

    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 3, 'a linha do lote foi tocada apesar do claim ter falhado');
  });

  await test('material misto (entrada sem lote + entrada com lote) nao perde quantidade num AJUSTE com localizacao', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup sem lote' });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'MISTO' });
    await entrar(db, mat, lote.id, 5);
    const antes = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(antes.quantidade_atual, 15);

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('MISTO-LOC','loc misto')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: loc, justificativa: 'contagem' });

    const depois = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(depois.quantidade_atual, 22,
      `quantidade evaporou: esperado 22 (10 sem lote + 5 do lote + 7 da nova localizacao), ficou ${depois.quantidade_atual}`);
  });

  await test('TRANSFERENCIA move a linha do lote certo entre localizacoes', async () => {
    const mat = await novoMaterial(db);
    const locOrigem = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('TRF-O','origem')`)).lastID;
    const locDestino = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('TRF-D','destino')`)).lastID;
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'TRF-LOTE' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 20, lote_id: lote.id, localizacao_destino_id: locOrigem, motivo: 'setup' });

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'TRANSFERENCIA', quantidade: 8, lote_id: lote.id,
      localizacao_origem_id: locOrigem, localizacao_destino_id: locDestino, justificativa: 'reorganizacao' });

    const origemSaldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id = ?', [mat, locOrigem, lote.id]);
    const destinoSaldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id = ?', [mat, locDestino, lote.id]);
    assert.strictEqual(origemSaldo.quantidade, 12);
    assert.strictEqual(destinoSaldo.quantidade, 8, 'a linha do lote na localizacao destino nao foi criada/creditada');
  });

  await test('TRANSFERENCIA acima do saldo do lote na origem falha (guarda atomica, nao read-then-write)', async () => {
    const mat = await novoMaterial(db);
    const locOrigem = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('TRF-O2','origem2')`)).lastID;
    const locDestino = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('TRF-D2','destino2')`)).lastID;
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'TRF-LOTE2' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 3, lote_id: lote.id, localizacao_destino_id: locOrigem, motivo: 'setup' });

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'TRANSFERENCIA', quantidade: 10, lote_id: lote.id,
      localizacao_origem_id: locOrigem, localizacao_destino_id: locDestino, justificativa: 'reorganizacao' }),
      /saldo/i);
  });

  await test('AJUSTE com localizacao e lote define o saldo daquela linha especifica do lote', async () => {
    const mat = await novoMaterial(db);
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('ADJ-LOTE','adjloc')`)).lastID;
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'ADJ-LOTE-1' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, localizacao_destino_id: loc, motivo: 'setup' });

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 6, localizacao_destino_id: loc, lote_id: lote.id, justificativa: 'contagem do lote' });

    const saldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ? AND lote_id = ?', [mat, loc, lote.id]);
    assert.strictEqual(saldo.quantidade, 6);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 6);
  });

  await test('SUCATA de lote vencido passa (descarte nao e bloqueado pela validade)', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'VENC-SUCATA', data_validade: '2020-01-01' });
    await entrar(db, mat, lote.id, 10);

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SUCATA', quantidade: 10, lote_id: lote.id, ...JUST });

    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 0);
  });

  // ── Fix round 2 (review): syncMaterialTotals somava parcial em material sem localizacao/lote ──
  // Os tres cenarios abaixo reproduzem, com os numeros exatos, o achado do re-review: o fix
  // round 1 (linha de saldo criada sempre) so era mantida em registrarMovimentacao. Em
  // cancelarMovimentacao (estorno sem localizacao/lote) e no AJUSTE-sem-localizacao, a linha
  // "fantasma" (NULL,NULL) nao acompanhava, e a soma de todas as linhas (que virava a fonte de
  // verdade assim que a PRIMEIRA linha existia) ressuscitava ou evaporava quantidade real assim
  // que um AJUSTE com localizacao rodava depois.
  // O round 2 fechou isso trocando a soma por um delta local; o round 3 DESFEZ essa troca (o
  // cliente decidiu que contagem por localizacao REDEFINE o saldo, que e a semantica da soma) e
  // fechou os mesmos tres cenarios pelo outro lado: a linha passou a ser mantida tambem no estorno
  // e no AJUSTE-sem-localizacao. Hoje, portanto, AJUSTE com localizacao chama `syncMaterialTotals`
  // e soma TUDO — o comentario anterior aqui, que dizia "aplica o DELTA local ... nao mais uma
  // soma de tudo", esta desatualizado desde `c2e31dc`. As assercoes abaixo nao mudaram: os tres
  // numeros (7, 10, 3) sao os mesmos nas duas arquiteturas.

  await test('estorno de ENTRADA sem localizacao/lote + AJUSTE numa localizacao nao ressuscita quantidade fantasma', async () => {
    const mat = await novoMaterial(db);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup sem lote nem localizacao' });
    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R2-A','loc A')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: loc, justificativa: 'contagem' });

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 7,
      `esperado 7, ficou ${m.quantidade_atual} — a linha fantasma da entrada estornada ressuscitou quantidade (bug media 17)`);
  });

  await test('estorno de SAIDA sem localizacao/lote + AJUSTE zerando localizacao nova nao evapora quantidade', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup' });
    const movSaida = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, ...JUST });
    await stockService.cancelarMovimentacao(db, ADMIN, movSaida.id, 'estorno de teste');

    const antes = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(antes.quantidade_atual, 10, 'o total antes do AJUSTE deveria estar correto (10) mesmo com a linha fantasma em 6');

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R2-B','loc B')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: loc, justificativa: 'contagem: nada aqui ainda' });

    const depois = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(depois.quantidade_atual, 10,
      `esperado 10, ficou ${depois.quantidade_atual} — a linha fantasma da saida estornada evaporou quantidade (bug media 6)`);
  });

  await test('AJUSTE global + AJUSTE numa localizacao nova nao ressuscita o valor pre-ajuste', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 3, justificativa: 'contagem geral' });

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R2-C','loc C')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: loc, justificativa: 'contagem: nada aqui ainda' });

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 3,
      `esperado 3, ficou ${m.quantidade_atual} — ressuscitou o valor pre-ajuste (bug media 10)`);
  });

  // ── Fix round 3 (review): decisão de negócio do cliente — contagem por localização REDEFINE ──
  // o saldo do material, não soma ao que já existia sem endereço. A soma de todas as linhas
  // (`syncMaterialTotals`) volta a ser a reconciliação certa; os dois testes abaixo são os que o
  // coordenador pediu explicitamente.

  await test('AJUSTE por localizacao REDEFINE o saldo do material (decisao de negocio do cliente)', async () => {
    const mat = await novoMaterial(db);
    // Material "legado": tem saldo no sistema, mas nenhuma linha de saldo e nenhuma
    // localizacao_padrao_id — exatamente o perfil que o cliente descreveu ("praticamente todo o
    // estoque legado dele").
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100 WHERE id = ?', [mat]);

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R3-A','loc A')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 40, localizacao_destino_id: loc, justificativa: 'primeira contagem da prateleira' });

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 40,
      `esperado 40 (a contagem REDEFINE o saldo), ficou ${m.quantidade_atual} — somou ao saldo sem endereco em vez de redefinir (bug do delta: 140)`);
  });

  await test('dois AJUSTEs concorrentes na mesma linha nao divergem do resultado sequencial', async () => {
    const mat = await novoMaterial(db);
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R3-B','loc B')`)).lastID;

    await Promise.all([
      stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: loc, justificativa: 'contagem concorrente 1' }),
      stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: loc, justificativa: 'contagem concorrente 2' }),
    ]);

    const saldo = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [mat, loc]);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(saldo.quantidade, 7,
      `a linha deveria ficar em 7 (mesmo valor que uma execucao sequencial daria), ficou ${saldo.quantidade}`);
    assert.strictEqual(m.quantidade_atual, 7,
      `o total deveria ficar em 7 (mesmo valor que uma execucao sequencial daria), ficou ${m.quantidade_atual}`);
  });

  // ── Fix round 4 (review): estorno NUNCA cria linha de saldo ────────────────────
  // O round 3 tirou o gate dos dois ramos de estorno (reversão de ENTRADA/SAIDA) e passou a
  // chamar `getOrCreateSaldo` incondicionalmente. Para movimentação LEGADA — que nunca escreveu
  // linha — isso CRIAVA a linha em 0 e gravava ±quantidade: uma linha fantasma que a soma de
  // `syncMaterialTotals` depois trata como verdade. Como o discriminador certo não é a
  // localização e sim "a movimentação original chegou a escrever linha?", o estorno passou a só
  // AJUSTAR linha existente.

  await test('estorno de ENTRADA legada nao cria linha de saldo negativa fantasma', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 10 WHERE id = ?', [mat]);
    const mov = await movimentacaoLegada(db, mat, 'ENTRADA', 10, 0, 10);

    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'estorno de teste');

    assert.strictEqual(await totalDoMaterial(db, mat), 0);
    const linhas = await linhasDeSaldo(db, mat);
    assert.strictEqual(linhas.length, 0,
      `o estorno criou linha de saldo do nada: ${JSON.stringify(linhas)} (esperado nenhuma linha)`);
  });

  await test('primeira contagem numa localizacao depois de estornar ENTRADA legada devolve a contagem, nao o negativo', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 10 WHERE id = ?', [mat]);
    const mov = await movimentacaoLegada(db, mat, 'ENTRADA', 10, 0, 10);
    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'estorno de teste');

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R4-A','loc A')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 5, localizacao_destino_id: loc, justificativa: 'primeira contagem da prateleira' });

    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 5,
      `esperado 5 (a contagem REDEFINE o saldo), ficou ${total} — a linha fantasma do estorno legado inverteu a regra de negocio (bug media -5)`);
  });

  await test('estorno de SAIDA legada nao cria linha de saldo fantasma, e a contagem seguinte manda', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 10 WHERE id = ?', [mat]);
    const mov = await movimentacaoLegada(db, mat, 'SAIDA', 4, 14, 10);

    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'estorno de teste');

    assert.strictEqual(await totalDoMaterial(db, mat), 14);
    const linhas = await linhasDeSaldo(db, mat);
    assert.strictEqual(linhas.length, 0,
      `o estorno criou linha de saldo do nada: ${JSON.stringify(linhas)} (esperado nenhuma linha)`);

    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R4-B','loc B')`)).lastID;
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 5, localizacao_destino_id: loc, justificativa: 'primeira contagem da prateleira' });
    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 5,
      `esperado 5 (a contagem REDEFINE o saldo), ficou ${total} — a linha fantasma do estorno legado somou 4 a mais (bug media 9)`);
  });

  await test('estorno de ENTRADA desta etapa continua debitando a linha que a entrada criou', async () => {
    // Contra-prova do teste acima: quando a movimentação original ESCREVEU linha, o estorno tem
    // de achá-la e debitar — "não criar" não pode virar "não fazer nada".
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'R4-LOTE' });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 10);

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');

    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 0,
      'o estorno de um movimento COM linha deixou a linha intacta');
    assert.strictEqual(await totalDoMaterial(db, mat), 0);
  });

  await test('material com saldo sem endereco continua visivel no mapa depois de ganhar localizacao padrao', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 5 WHERE id = ?', [mat]);
    // AJUSTE sem localização: `syncSaldoLocalizacaoPadrao` grava o residual na linha (NULL,NULL)
    // — material com saldo e NENHUM endereço, o perfil do estoque legado do cliente.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 100, justificativa: 'saldo inicial sem endereco' });
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('R4-MAPA','loc mapa')`)).lastID;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [loc, mat]);

    const linha = (await stockService.consultarMapaLocalizacoes(db)).find((l) => l.id === loc);
    assert.strictEqual(linha.quantidade_total, 100,
      `esperado 100 no mapa, veio ${linha.quantidade_total} — a linha residual (NULL,NULL) derrubou o fallback e o saldo sumiu do mapa (bug media 0); 200 seria duplicacao`);
    assert.strictEqual(linha.qtd_itens, 1, 'o material sumiu da contagem de itens da localizacao');
    assert.strictEqual(linha.itens_criticos, 0,
      'o material com 100 em estoque foi contado como critico porque o mapa leu a linha sem endereco como "tem endereco"');
  });

  // ── Fix round 5 (review): o discriminador do estorno e "o MATERIAL ja tem linha?" ────────────
  // O round 4 usou "existe linha para ESTA chave?" e tratou o miss como no-op sempre. Errado por
  // dois motivos, que sao a mesma raiz: (a) a chave do estorno resolve
  // `material.localizacao_padrao_id` de HOJE, enquanto o forward escreveu com o padrao vigente na
  // epoca — mudou o padrao no meio, o WHERE erra uma linha que EXISTE e o miss vira indistinguivel
  // do caso legado; (b) num material que ja esta sob o regime soma-e-verdade (ja tem linha), o
  // no-op faz `quantidade_atual` desgarrar da soma e a contagem seguinte apaga o estorno.
  // Correcao: no miss, material com ZERO linhas continua no-op (Critical do round 4 fechado);
  // material que JA TEM linha reconcilia o residual por `syncSaldoLocalizacaoPadrao`.

  await test('estorno de ENTRADA depois de o material GANHAR localizacao padrao nao perde o estorno', async () => {
    const mat = await novoMaterial(db);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'entrada antes de ter endereco' });
    // O rollout da Etapa 6 e exatamente isto: o material so ganha endereco depois de ja ter saldo.
    const padrao = await novaLocalizacao(db, 'R5-PAD-A');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [padrao, mat]);

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');
    assert.strictEqual(await totalDoMaterial(db, mat), 0);
    assert.strictEqual(await somaDasLinhas(db, mat), 0,
      'a soma das linhas desgarrou de quantidade_atual depois do estorno');

    const loc = await novaLocalizacao(db, 'R5-A');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: loc, justificativa: 'contagem' });
    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 7,
      `esperado 7, ficou ${total} — o estorno errou a chave da linha (padrao de hoje != padrao da epoca) e foi engolido pelo no-op (bug media 17)`);
  });

  await test('estorno de SAIDA depois de o material GANHAR localizacao padrao nao evapora quantidade', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup' });
    const movSaida = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, ...JUST });
    const padrao = await novaLocalizacao(db, 'R5-PAD-B');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [padrao, mat]);

    await stockService.cancelarMovimentacao(db, ADMIN, movSaida.id, 'estorno de teste');
    assert.strictEqual(await totalDoMaterial(db, mat), 10);
    assert.strictEqual(await somaDasLinhas(db, mat), 10,
      'a soma das linhas desgarrou de quantidade_atual depois do estorno');

    const loc = await novaLocalizacao(db, 'R5-B');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: loc, justificativa: 'contagem: nada aqui ainda' });
    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 10,
      `esperado 10, ficou ${total} — o estorno da saida foi engolido pelo no-op (bug media 6)`);
  });

  await test('estorno depois de a localizacao padrao MUDAR (L1 para L2) nao perde o estorno', async () => {
    const mat = await novoMaterial(db);
    const l1 = await novaLocalizacao(db, 'R5-L1');
    const l2 = await novaLocalizacao(db, 'R5-L2');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [l1, mat]);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'entrada com padrao L1' });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [l2, mat]);

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');
    assert.strictEqual(await somaDasLinhas(db, mat), await totalDoMaterial(db, mat),
      'a soma das linhas desgarrou de quantidade_atual depois do estorno');

    const loc = await novaLocalizacao(db, 'R5-C');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 7, localizacao_destino_id: loc, justificativa: 'contagem' });
    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 7,
      `esperado 7, ficou ${total} — o estorno procurou a linha em L2 e a entrada tinha escrito em L1 (bug media 17)`);
  });

  await test('estorno de ENTRADA legada em material JA CONTADO reconcilia o residual', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 10 WHERE id = ?', [mat]);
    const mov = await movimentacaoLegada(db, mat, 'ENTRADA', 10, 0, 10);
    // A contagem coloca o material sob o regime soma-e-verdade: a partir daqui, ignorar o estorno
    // nao e mais "nao mexer em nada", e sim deixar quantidade_atual sem lastro na soma.
    const locA = await novaLocalizacao(db, 'R5-D1');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 40, localizacao_destino_id: locA, justificativa: 'primeira contagem' });
    assert.strictEqual(await totalDoMaterial(db, mat), 40);

    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'estorno de teste');
    assert.strictEqual(await totalDoMaterial(db, mat), 30);
    assert.strictEqual(await somaDasLinhas(db, mat), 30,
      'a soma das linhas ficou em 40 enquanto quantidade_atual foi para 30 — o estorno nao aterrissou em lugar nenhum');

    const locB = await novaLocalizacao(db, 'R5-D2');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 5, localizacao_destino_id: locB, justificativa: 'segunda contagem' });
    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 35,
      `esperado 35 (40 contados em A - 10 do estorno + 5 contados em B), ficou ${total} — a contagem seguinte apagou o estorno (bug media 45)`);
  });

  await test('estorno de SAIDA legada em material JA CONTADO reconcilia o residual', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 10 WHERE id = ?', [mat]);
    const mov = await movimentacaoLegada(db, mat, 'SAIDA', 4, 14, 10);
    const locA = await novaLocalizacao(db, 'R5-E1');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 40, localizacao_destino_id: locA, justificativa: 'primeira contagem' });

    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'estorno de teste');
    assert.strictEqual(await totalDoMaterial(db, mat), 44);
    assert.strictEqual(await somaDasLinhas(db, mat), 44,
      'a soma das linhas ficou em 40 enquanto quantidade_atual foi para 44 — o estorno nao aterrissou em lugar nenhum');

    const locB = await novaLocalizacao(db, 'R5-E2');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 5, localizacao_destino_id: locB, justificativa: 'segunda contagem' });
    const total = await totalDoMaterial(db, mat);
    assert.strictEqual(total, 49,
      `esperado 49 (40 em A + 5 em B + os 4 devolvidos pelo estorno, que nao tem endereco), ficou ${total} — a contagem seguinte apagou o estorno (bug media 45)`);
  });

  // ── Review final da Etapa 6 (2026-08-10) ────────────────────────────────────────────────────

  // Achado 3: a tela oferece saldo AGREGADO (lotService soma todas as localizacoes), o motor
  // reivindicava contra UMA linha. Quando a localizacao resolvida da saida nao e onde o lote esta,
  // a tela mostrava "saldo 25" e o motor respondia "Disponivel: 0".
  await test('saida consome o saldo do LOTE inteiro, mesmo endereçado em outra localizacao', async () => {
    const mat = await novoMaterial(db);
    const loc = await novaLocalizacao(db, 'AGR-1');
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'AGREGADO' });
    // O lote entra endereçado em `loc`; a saida NAO cita localizacao (e o material nao tem padrao),
    // entao a localizacao resolvida da saida e NULL — chave diferente da linha que tem o saldo.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 25, lote_id: lote.id,
      localizacao_destino_id: loc, motivo: 'setup endereçado' });

    const lotes = await lotService.listarLotesDoMaterial(db, mat);
    assert.strictEqual(lotes[0].saldo, 25, 'a tela precisa mostrar 25 para o cenario fazer sentido');

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST });

    assert.strictEqual(await totalDoMaterial(db, mat), 15);
    assert.strictEqual(await somaDasLinhas(db, mat), 15,
      'a soma das linhas desgarrou do total do material');
    const depois = await lotService.listarLotesDoMaterial(db, mat);
    assert.strictEqual(depois[0].saldo, 15, 'o saldo agregado do lote nao acompanhou a saida');
  });

  await test('saida acima do saldo AGREGADO do lote falha, com o numero que a tela mostra', async () => {
    const mat = await novoMaterial(db);
    const locA = await novaLocalizacao(db, 'AGR-2A');
    const locB = await novaLocalizacao(db, 'AGR-2B');
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'AGREGADO-2' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 6, lote_id: lote.id, localizacao_destino_id: locA, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 4, lote_id: lote.id, localizacao_destino_id: locB, motivo: 'setup' });

    // 10 no lote, espalhados em duas localizacoes: 8 tem de passar drenando as duas.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 8, lote_id: lote.id, localizacao_origem_id: locA, ...JUST });
    assert.strictEqual(await somaDasLinhas(db, mat), 2);
    assert.strictEqual(await totalDoMaterial(db, mat), 2);

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 5, lote_id: lote.id, ...JUST }),
      /Disponível: 2/, 'a mensagem tem de citar o saldo AGREGADO do lote, que e o numero da tela');
    assert.strictEqual(await somaDasLinhas(db, mat), 2, 'a recusa nao devolveu o que ja tinha drenado');
    assert.strictEqual(await totalDoMaterial(db, mat), 2);
  });

  // Achado 3, segunda metade + achado 14: getOrCreateSaldo criava a linha ANTES do claim, entao
  // toda saida recusada deixava um (loc, lote, 0) para tras — e o discriminador do estorno conta
  // linhas, inclusive zeradas, tirando do no-op um material que era legado ate a tentativa.
  await test('saida recusada por lote NAO deixa linha zerada para tras', async () => {
    const mat = await novoMaterial(db);
    const loc = await novaLocalizacao(db, 'ZERO-1');
    // Um lote GORDO garante que a guarda de saldo do MATERIAL deixe passar — senao a recusa
    // aconteceria antes de o claim por lote sequer rodar, e o teste passaria pelo motivo errado.
    const gordo = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'ZERO-GORDO' });
    await entrar(db, mat, gordo.id, 100);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'ZERO' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 2, lote_id: lote.id, localizacao_destino_id: loc, motivo: 'setup' });
    const antes = (await linhasDeSaldo(db, mat)).length;

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST }), /saldo/i);

    const linhas = await linhasDeSaldo(db, mat);
    assert.strictEqual(linhas.length, antes,
      `a saida recusada criou linha nova: ${JSON.stringify(linhas)}`);
    assert.ok(!linhas.some((l) => l.quantidade === 0),
      `sobrou linha zerada de uma operacao recusada: ${JSON.stringify(linhas)}`);
  });

  await test('material legado continua no no-op do estorno depois de uma saida RECUSADA', async () => {
    // O discriminador de `reconciliarEstornoSemLinha` e "o material ja tem alguma linha?". Uma
    // saida recusada nao pode ser o que tira o material do regime legado — era o achado 14.
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100 WHERE id = ?', [mat]);
    const mov = await movimentacaoLegada(db, mat, 'ENTRADA', 10, 90, 100);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'LEGADO-REC' });

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 5, lote_id: lote.id, ...JUST }), /saldo/i);
    assert.strictEqual((await linhasDeSaldo(db, mat)).length, 0,
      'a tentativa recusada materializou linha e tirou o material do regime legado');

    await stockService.cancelarMovimentacao(db, ADMIN, mov, 'estorno de teste');
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
    assert.strictEqual((await linhasDeSaldo(db, mat)).length, 0,
      'o estorno de movimento legado criou linha — no-op quebrado');

    const loc = await novaLocalizacao(db, 'LEG-REC-1');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 40, localizacao_destino_id: loc, justificativa: 'primeira contagem' });
    assert.strictEqual(await totalDoMaterial(db, mat), 40,
      'a primeira contagem deveria REDEFINIR o saldo (regra do cliente); a saida recusada furou o no-op');
  });

  // Achado 4: o estorno de ENTRADA guardava o disponivel do MATERIAL e aplicava o delta na linha
  // do LOTE sem guarda nenhuma — o -8 na direcao inversa.
  await test('estorno de ENTRADA nao pode negativar a linha do lote (o -8 na direcao inversa)', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'INV-A' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'INV-B' });
    await entrar(db, mat, loteA.id, 100);
    const entradaB = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: loteB.id, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: loteB.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, loteB.id)).quantidade, 0);

    // O material tem 100 disponiveis (do lote A), entao a guarda do MATERIAL deixa passar. Quem
    // tem de recusar e a guarda da LINHA do lote B, que esta em 0.
    await assert.rejects(() => stockService.cancelarMovimentacao(db, ADMIN, entradaB.id, 'estorno de teste'),
      /lote/i, 'o estorno aceitou tirar 10 de uma linha de lote que esta em 0');

    assert.strictEqual((await saldoDoLote(db, mat, loteB.id)).quantidade, 0,
      'a linha do lote B ficou negativa depois do estorno recusado');
    assert.strictEqual(await totalDoMaterial(db, mat), 100,
      'o estorno recusado deixou quantidade_atual debitado sem contrapartida');
    assert.strictEqual(await somaDasLinhas(db, mat), 100, 'soma das linhas desgarrou do total');
    const original = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [entradaB.id]);
    assert.strictEqual(original.cancelado, 0, 'o movimento ficou preso como cancelado sem ter revertido nada');
  });

  await test('estorno de ENTRADA com lote passa quando a linha comporta a reversao', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'INV-OK' });
    await entrar(db, mat, lote.id, 30);
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'segunda entrada' });

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 30);
    assert.strictEqual(await totalDoMaterial(db, mat), 30);
  });

  await test('material que permite negativo continua podendo negativar a linha no estorno', async () => {
    // A guarda 10 do plano: `permite_saldo_negativo` continua mandando, inclusive por lote.
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [mat]);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'INV-NEG' });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST });

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'estorno de teste');
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, -10,
      'a guarda nova nao pode valer para material que permite saldo negativo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
