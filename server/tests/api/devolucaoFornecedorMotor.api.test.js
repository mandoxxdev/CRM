/**
 * Etapa 45, T1 — `DEVOLUCAO_FORNECEDOR` no MOTOR de estoque.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor.md (T1)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md
 *
 * O tipo novo e a IRMA de `DEVOLUCAO_CLIENTE` — as duas mandam o material de volta para a origem
 * dele —, e a diferenca esta em DE ONDE ele sai: a devolucao ao fornecedor tira do BLOQUEADO (a
 * inspecao reprovou e reteve), baixando `quantidade_atual` e `quantidade_bloqueada` no MESMO
 * UPDATE. Molde de `PERDA_TERCEIRO`, que faz o mesmo com `quantidade_em_terceiros`.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) a baixa tira dos DOIS lugares, exatamente
 *   (2) bloqueado insuficiente recusa, e a mensagem diz os DOIS numeros
 *   (3) fisico insuficiente recusa (estado alcancavel: `bloqueada > atual`)
 *   (4) a guarda "Material bloqueado nao pode ser utilizado" NAO barra este tipo — e CONTINUA
 *       barrando `SAIDA_PRODUCAO` (a metade positiva, sem a qual o cenario passaria com a guarda
 *       apagada para todo mundo)
 *   (5) a rota generica /movimentacoes/v2 RECUSA o tipo, e a mensagem nomeia a tela de NC
 *   (6) o estorno pelo livro e recusado
 *   (7) falha DEPOIS do claim devolve o estado ANTERIOR, com igualdade EXATA
 *   (8) material de cliente: a devolucao ao fornecedor aparece na posicao do cliente
 *
 * ── POR QUE O (7) EXIGE IGUALDADE EXATA, E NAO `>=` ──────────────────────────────────────────
 * Achado da revisao do plano: o plano pedia `retencaoAplicada` E o claim dentro do `try`, que sao
 * mutuamente exclusivos — juntos compensam EM DOBRO (`bloqueada` voltaria a 6 para uma reprovacao
 * de 3). Com `>=`, a compensacao dupla passaria VERDE. A assercao e `=== o valor de antes`.
 *
 * Executar: cd server && node tests/api/devolucaoFornecedorMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stock = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 450, nome: 'Admin E45', role: 'admin', is_superadmin: 1, email: 'admin45@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

(async () => {
  console.log('\n=== Etapa 45 T1: DEVOLUCAO_FORNECEDOR no motor ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  async function novoMaterial({ atual = 10, bloqueada = 3, clienteId = null } = {}) {
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, proprietario_cliente_id)
      VALUES (?,?,'KG',?,?,1,?)`,
      [uniq('MAT-E45'), 'Chapa da Etapa 45', atual, bloqueada, clienteId]);
    return r.lastID;
  }

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada
    FROM materiais_almoxarifado WHERE id = ?`, [id]);

  const devolver = (materialId, quantidade, extra = {}) => stock.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'DEVOLUCAO_FORNECEDOR', quantidade,
    justificativa: 'material reprovado na inspecao, devolvido ao fornecedor',
    motivo: 'Devolução ao fornecedor', ...extra,
  });

  // ── (1) ───────────────────────────────────────────────────────────────────────────────────
  await test('(1) a baixa tira do fisico E do bloqueado, exatamente', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3 });

    await devolver(id, 3);

    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 7, `fisico ${s.quantidade_atual}`);
    assert.strictEqual(s.quantidade_bloqueada, 0, `bloqueado ${s.quantidade_bloqueada}`);
  });

  // ── (2) e (3) — as duas guardas do claim ──────────────────────────────────────────────────
  await test('(2) bloqueado insuficiente recusa, e a mensagem diz os dois numeros', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 1 });

    const e = await erroDe(() => devolver(id, 3));

    assert.ok(e, 'a devolucao passou com bloqueado menor que o pedido');
    assert.strictEqual(e.status, 400, `status ${e.status}`);
    // Os DOIS numeros: sem eles o operador nao sabe qual das duas condicoes falhou.
    assert.ok(/bloqueado\(s\)/.test(e.message) && /físico: 10/.test(e.message),
      `a mensagem nao diz os dois numeros: ${e.message}`);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 10, 'a recusa mexeu no fisico');
    assert.strictEqual(s.quantidade_bloqueada, 1, 'a recusa mexeu no bloqueado');
  });

  await test('(3) fisico insuficiente recusa, mesmo com bloqueado suficiente', async () => {
    // `bloqueada > atual` e estado alcancavel neste modulo — o proprio motor documenta isso.
    const id = await novoMaterial({ atual: 2, bloqueada: 5 });

    const e = await erroDe(() => devolver(id, 4));

    assert.ok(e, 'a devolucao passou com fisico menor que o pedido');
    assert.strictEqual(e.status, 400, `status ${e.status}`);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 2, 'a recusa mexeu no fisico');
    assert.strictEqual(s.quantidade_bloqueada, 5, 'a recusa mexeu no bloqueado');
  });

  // ── (4) — a guarda que este tipo desliga, e que continua valendo para os outros ────────────
  await test('(4) a guarda de material bloqueado nao barra este tipo, e CONTINUA barrando saida', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 10 });

    // A metade POSITIVA primeiro: material 100% bloqueado SAI por devolucao ao fornecedor.
    await devolver(id, 4);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 6, `fisico ${s.quantidade_atual}`);
    assert.strictEqual(s.quantidade_bloqueada, 6, `bloqueado ${s.quantidade_bloqueada}`);

    // E a NEGATIVA, sem a qual o cenario passaria com a guarda apagada para todo mundo.
    const e = await erroDe(() => stock.registrarMovimentacao(db, ADMIN, {
      material_id: id, tipo: 'SAIDA_PRODUCAO', quantidade: 1,
      motivo: 'consumo', emergencial: true, justificativa: 'linha parada',
    }));
    assert.ok(e, 'SAIDA_PRODUCAO passou num material todo bloqueado');
    assert.strictEqual(e.status, 400, `status ${e.status}`);
    // ⚠️ MEDICAO, e ela corrige o que este cenario afirmava na primeira escrita: a recusa NAO vem
    // da guarda "Material bloqueado nao pode ser utilizado", e sim da do DISPONIVEL — porque
    // `disponivelSql` ja subtrai o bloqueado, entao no caminho simples o disponivel chega a zero
    // antes de a guarda explicita ser consultada. Ela so e alcancavel quando a do disponivel e
    // pulada, isto e, numa saida que CONSOME RESERVA (`consumindoReserva`, stockService.js:790).
    // Escrito aqui porque quem ler a guarda explicita vai supor que ela e o que barra o caso
    // comum, e nao e — o que barra e a conta do disponivel.
    assert.ok(/Saldo insuficiente|Material bloqueado/.test(e.message), `mensagem: ${e.message}`);
  });

  // ── (5) — o tipo e DEDICADO: a rota generica recusa ───────────────────────────────────────
  await test('(5) a v2 recusa o tipo, e a mensagem nomeia a tela de Nao Conformidades', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3 });

    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: id, tipo: 'DEVOLUCAO_FORNECEDOR', quantidade: 3,
      justificativa: 'tentando por fora do documento', motivo: 'Devolução ao fornecedor',
    });

    assert.strictEqual(r.status, 400, `status ${r.status}: ${JSON.stringify(r.body)}`);
    // ⚠️ A literal ENSINA o caminho. Sem a entrada em CAMINHO_TIPO_DEDICADO, a recusa sairia com a
    // mensagem generica, que manda o operador para "as telas de Reservas e Inspeções" — e o manual
    // do sistema cita estas mensagens literalmente.
    const texto = JSON.stringify(r.body);
    assert.ok(/Não Conformidades/.test(texto),
      `a recusa nao nomeia a tela dona do tipo: ${texto}`);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 10, 'a recusa da rota mexeu no saldo');
    assert.strictEqual(s.quantidade_bloqueada, 3, 'a recusa da rota mexeu no bloqueado');
  });

  // ── (6) — nao estornavel ──────────────────────────────────────────────────────────────────
  await test('(6) estornar a devolucao pelo livro e recusado', async () => {
    const id = await novoMaterial({ atual: 10, bloqueada: 3 });
    await devolver(id, 3);
    const mov = await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado
      WHERE material_id = ? AND tipo = 'DEVOLUCAO_FORNECEDOR' ORDER BY id DESC LIMIT 1`, [id]);
    assert.ok(mov, 'a devolucao nao deixou linha no livro');

    const e = await erroDe(() => stock.cancelarMovimentacao(db, ADMIN, mov.id, 'engano'));

    assert.ok(e, 'o estorno passou');
    assert.strictEqual(e.message,
      'Devolução ao fornecedor não pode ser estornada pelo livro — o material voltaria bloqueado com o documento dizendo que foi devolvido',
      `mensagem: ${e.message}`);
    const s = await saldos(id);
    assert.strictEqual(s.quantidade_atual, 7, 'o estorno recusado mexeu no saldo');
  });

  // ── (7) — ⚠️ a compensacao, com igualdade EXATA ───────────────────────────────────────────
  await test('(7) falha DEPOIS do claim devolve o estado anterior — sem compensar em dobro', async () => {
    const id = await novoMaterial({ atual: 100, bloqueada: 3 });
    // O gatilho aborta o INSERT do ledger: o ponto exato entre o claim e o livro.
    await dbRun(db, `CREATE TRIGGER trg_e45_falha_ledger BEFORE INSERT ON movimentacoes_almoxarifado
      WHEN NEW.tipo = 'DEVOLUCAO_FORNECEDOR' AND NEW.material_id = ${id}
      BEGIN SELECT RAISE(ABORT, 'disco cheio'); END`);

    const e = await erroDe(() => devolver(id, 3));
    await dbRun(db, 'DROP TRIGGER trg_e45_falha_ledger');

    assert.ok(e, 'a devolucao passou com o ledger abortando');
    const s = await saldos(id);
    // IGUALDADE EXATA, nunca `>=`: com `>=`, a compensacao DUPLA (fisico 100 e bloqueada 6)
    // passaria verde. Foi o achado 2 da revisao do plano.
    assert.strictEqual(s.quantidade_atual, 100, `fisico ${s.quantidade_atual}, esperava exatamente 100`);
    assert.strictEqual(s.quantidade_bloqueada, 3, `bloqueado ${s.quantidade_bloqueada}, esperava exatamente 3`);
  });

  // ── (8) — material de cliente continua visivel na posicao dele ────────────────────────────
  await test('(8) devolucao ao fornecedor de material DE CLIENTE aparece na posicao do cliente', async () => {
    // ⚠️ Este cenario existe porque eu decidi o CONTRARIO no plano e dois testes desta base me
    // derrubaram. Tirar o tipo da conta de consumo nao o "separa": o torna INVISIVEL, e a equacao
    // `recebido - consumido - devolvido = saldo` deixa de fechar. Rotulo impreciso e visivel vale
    // mais que rotulo exato e invisivel — a coluna propria e outra etapa.
    const clienteEstoque = require('../../services/almoxarifado/clienteEstoqueService');
    const movementTypes = require('../../services/almoxarifado/movementTypes');

    // As duas asserções são a régua inteira, e elas prendem a decisão nos DOIS lados da derivação.
    assert.ok(movementTypes.TIPOS_SAIDA.includes('DEVOLUCAO_FORNECEDOR'),
      'o tipo saiu de TIPOS_SAIDA — a posicao por cliente pararia de ve-lo');
    assert.ok(clienteEstoque.TIPOS_CONSUMO.includes('DEVOLUCAO_FORNECEDOR'),
      'o tipo saiu da conta de consumo: o material some da posicao do cliente e a equacao '
      + '`recebido - consumido - devolvido = saldo` deixa de fechar');
    // E a metade que impede a leitura oposta: ele NAO e "devolvido ao dono". A coluna `devolvido`
    // e so DEVOLUCAO_CLIENTE, onde o cliente RECEBE o material de volta.
    assert.ok(!clienteEstoque.TIPOS_CONSUMO.includes('DEVOLUCAO_CLIENTE'),
      'DEVOLUCAO_CLIENTE entrou no consumo — as duas devolucoes sao coisas diferentes');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
