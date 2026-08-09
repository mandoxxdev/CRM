const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
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
  // que um AJUSTE com localizacao rodava depois. O fix e a raiz: AJUSTE com localizacao agora
  // aplica o DELTA local da propria linha em quantidade_atual, nao mais uma soma de tudo.

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

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
