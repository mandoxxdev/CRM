/**
 * Etapa 45, T3 — a EXECUÇÃO pela porta HTTP, e a FILA do que falta executar.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor.md (T3)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md (secao 5)
 *
 * O servico (T2) ja tem suite propria e mede a REGRA. Aqui o alvo e o que SO a rota pode errar: o
 * gate, a forma congelada do campo `execucao`, e o filtro da fila.
 *
 * ── A LINHA QUE IMPORTA E "COMPRAS PODE" ─────────────────────────────────────────────────────
 * E ela que distingue esta acao de `decidir_nao_conformidade`, de onde COMPRAS foi excluido de
 * proposito (B169). Sem esse cenario, a suite passaria com a rota pendurada no gate ERRADO — e
 * ninguem notaria, porque ADMINISTRADOR e QUALIDADE estao nos dois.
 *
 * E a contrapartida, no mesmo lugar: COMPRAS executando uma NC aberta A MAO recebe 200 com
 * `NENHUMA` e o saldo NAO se move. E a linha que prova que a B169 continua valendo depois de a
 * Etapa 45 dar uma acao nova ao COMPRAS — sem ela, a concessao teria alargado o alcance dele em
 * silencio (ver o comentario de `executar_encaminhamento` em permissions.js).
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) a matriz de perfis INTEIRA — COMPRAS PODE; ALMOXARIFE, PRODUCAO e CONSULTA nao
 *   (2) o 403 acontece ANTES de qualquer efeito de saldo
 *   (3) COMPRAS executando NC manual: 200, `NENHUMA`, saldo intacto (a B169 continua valendo)
 *   (4) a FORMA congelada do campo `execucao` — `null` e nao `0` quando nao move saldo
 *   (5) os codigos de erro atravessam a rota: 404, 409 e 400
 *   (6) a projecao da listagem carrega `execucao_estado` e `execucao_em`
 *   (7) `?execucao=PENDENTE` traz o pendente e NAO traz o executado, nem ABERTA, nem CANCELADA
 *
 * ── CONTROLE POSITIVO ────────────────────────────────────────────────────────────────────────
 * Assercao NEGATIVA de permissao NAO fica vermelha na rodada TDD: `can()` devolve `false` para o
 * que nao conhece, entao "ALMOXARIFE nao pode" passaria verde ate com a acao inexistente. Os
 * cenarios (1) e (2) foram provados CONCEDENDO `executar_encaminhamento` ao ALMOXARIFE em
 * `permissions.js` — medido nesta task, e anotado no plano.
 *
 * Executar: cd server && node tests/api/encaminhamentoRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const BASE = '/api/almoxarifado/nao-conformidades';

const ADMIN = { id: 4530, nome: 'Admin E45T3', role: 'admin', is_superadmin: 1, email: 'admin45t3@test.com' };
const QUALIDADE = { id: 4531, nome: 'Qualidade E45', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'qual45@test.com' };
const COMPRAS = { id: 4532, nome: 'Compras E45', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'comp45@test.com' };
const ALMOXARIFE = { id: 4533, nome: 'Almoxarife E45', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox45@test.com' };
const PRODUCAO = { id: 4534, nome: 'Producao E45', role: 'usuario', perfil_almoxarifado: 'PRODUCAO', email: 'prod45@test.com' };
const CONSULTA = { id: 4535, nome: 'Consulta E45', role: 'usuario', perfil_almoxarifado: 'CONSULTA', email: 'cons45@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 45 T3: a execucao pela porta HTTP, e a fila ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada
    FROM materiais_almoxarifado WHERE id = ?`, [id]);

  async function novaInspecaoReprovada({ reprovada = 3, esperada = 10, bloqueioDeOutraOrigem = 0 } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo) VALUES (?,?,?,?,?,1)`,
      [uniq('MAT-T3E45'), 'Material da T3 da 45', 'KG', esperada, reprovada + bloqueioDeOutraOrigem]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-T3E45'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, esperada]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada) VALUES (?,0,?,?)`,
      [item.lastID, esperada - reprovada, reprovada]);
    return { materialId: mat.lastID, itemId: item.lastID, inspecaoId: insp.lastID };
  }

  /** Inspeção reprovada -> NC automática -> decidida por QUALIDADE. */
  async function ncDecidida(decisao = 'DEVOLVER', opcoes = {}) {
    const ctx = await novaInspecaoReprovada(opcoes);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao, justificativa: 'laudo anexo' });
    return { ...ctx, ncId: doc.id, numero: doc.numero };
  }

  const executarHttp = (id, corpo = {}) => request(app).post(`${BASE}/${id}/executar`).send(corpo);

  /** A FORMA congelada de um efeito que NAO move saldo — `null`, nunca `0` nem campo ausente. */
  const afirmaFormaSemSaldo = (execucao, efeitoEsperado) => {
    assert.strictEqual(execucao.efeito, efeitoEsperado, JSON.stringify(execucao));
    assert.strictEqual(execucao.quantidade, null, `quantidade deveria ser null, veio ${execucao.quantidade}`);
    assert.strictEqual(execucao.material_id, null, `material_id deveria ser null, veio ${execucao.material_id}`);
    assert.strictEqual(typeof execucao.mensagem, 'string', 'mensagem sumiu na serializacao');
    assert.ok(execucao.mensagem.length > 0, 'mensagem veio vazia');
  };

  // ── (1) a matriz de perfis INTEIRA ─────────────────────────────────────────────────────────
  await test('(1) COMPRAS PODE executar — e e a linha que distingue esta acao de decidir', async () => {
    const ctx = await ncDecidida('DEVOLVER');
    setUser({ ...COMPRAS });
    const res = await executarHttp(ctx.ncId, { observacoes: 'coleta da transportadora' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.execucao.efeito, 'BAIXADA', JSON.stringify(res.body.execucao));
    assert.strictEqual(res.body.execucao_por_id, COMPRAS.id);
    // A prova de que e a acao NOVA, e nao carona em `decidir_nao_conformidade`: COMPRAS nao pode
    // decidir, e continua nao podendo.
    const outra = await ncDecidida('DEVOLVER');
    const negado = await request(app).post(`${BASE}/${outra.ncId}/decidir`)
      .send({ decisao: 'ACEITAR', justificativa: 'tentativa' });
    assert.strictEqual(negado.status, 403, 'COMPRAS passou a DECIDIR — a B169 caiu junto');
  });

  await test('(1b) ADMINISTRADOR e QUALIDADE podem; ALMOXARIFE, PRODUCAO e CONSULTA nao', async () => {
    for (const user of [ADMIN, QUALIDADE]) {
      const ctx = await ncDecidida('SUBSTITUICAO');
      setUser({ ...user });
      const res = await executarHttp(ctx.ncId);
      assert.strictEqual(res.status, 200, `${user.perfil_almoxarifado || 'ADMIN'}: ${JSON.stringify(res.body)}`);
    }
    for (const user of [ALMOXARIFE, PRODUCAO, CONSULTA]) {
      const ctx = await ncDecidida('SUBSTITUICAO');
      setUser({ ...user });
      const res = await executarHttp(ctx.ncId);
      assert.strictEqual(res.status, 403,
        `${user.perfil_almoxarifado} conseguiu registrar execucao: ${JSON.stringify(res.body)}`);
      // E a metade que prova que o 403 nao foi "id nao existe": a NC continua PENDENTE.
      const doc = await nc.obterNaoConformidade(db, ctx.ncId);
      assert.strictEqual(doc.execucao_estado, nc.EXECUCAO_PENDENTE,
        `${user.perfil_almoxarifado} gravou execucao apesar do 403`);
    }
  });

  // ── (2) o 403 vem ANTES de qualquer efeito ─────────────────────────────────────────────────
  await test('(2) o 403 acontece ANTES do efeito: o saldo nao se move', async () => {
    const ctx = await ncDecidida('DEVOLVER');
    const antes = await saldos(ctx.materialId);
    setUser({ ...ALMOXARIFE });
    const res = await executarHttp(ctx.ncId, { observacoes: 'tentativa' });
    assert.strictEqual(res.status, 403);
    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual),
      'o 403 mexeu no fisico — o gate esta DEPOIS do efeito');
    assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada),
      'o 403 mexeu no bloqueado');
    const insp = await dbGet(db,
      'SELECT devolucao_fornecedor_em FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [ctx.inspecaoId]);
    assert.strictEqual(insp.devolucao_fornecedor_em, null, 'o 403 carimbou a inspecao');
  });

  // ── (3) a B169 continua valendo ────────────────────────────────────────────────────────────
  await test('(3) COMPRAS executando NC aberta A MAO: 200, NENHUMA, e o saldo NAO se move', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3, esperada: 10 });
    setUser({ ...COMPRAS });
    // A porta que COMPRAS de fato tem: `registrar_nao_conformidade`.
    const aberta = await request(app).post(BASE).send({
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: ctx.inspecaoId,
      tipo: 'OUTRO', descricao: 'aberta a mao pelo comprador',
    });
    assert.strictEqual(aberta.status, 201, JSON.stringify(aberta.body));
    setUser({ ...QUALIDADE });
    await request(app).post(`${BASE}/${aberta.body.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'devolver ao fornecedor' });

    const antes = await saldos(ctx.materialId);
    setUser({ ...COMPRAS });
    const res = await executarHttp(aberta.body.id);

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    afirmaFormaSemSaldo(res.body.execucao, 'NENHUMA');
    assert.strictEqual(res.body.execucao.mensagem,
      'Só a não conformidade aberta pela reprovação da inspeção devolve material');
    const depois = await saldos(ctx.materialId);
    assert.strictEqual(Number(depois.quantidade_atual), Number(antes.quantidade_atual),
      'a soma registrar+executar deu a COMPRAS poder de apagar estoque');
    assert.strictEqual(Number(depois.quantidade_bloqueada), Number(antes.quantidade_bloqueada));
  });

  // ── (4) a FORMA congelada ──────────────────────────────────────────────────────────────────
  await test('(4) a forma de `execucao` atravessa o res.json — null, nunca 0 nem campo ausente', async () => {
    setUser({ ...ADMIN });
    // Um de cada familia que nao move saldo.
    const semSaldo = await ncDecidida('DEVOLVER');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 0 WHERE id = ?', [semSaldo.materialId]);
    const r1 = await executarHttp(semSaldo.ncId);
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    afirmaFormaSemSaldo(r1.body.execucao, 'SEM_SALDO');

    const nenhuma = await ncDecidida('ANALISE_ENGENHARIA');
    const r2 = await executarHttp(nenhuma.ncId);
    afirmaFormaSemSaldo(r2.body.execucao, 'NENHUMA');

    // E a metade positiva: quando MOVE, os campos vem preenchidos.
    const baixada = await ncDecidida('DEVOLVER');
    const r3 = await executarHttp(baixada.ncId);
    assert.strictEqual(r3.body.execucao.efeito, 'BAIXADA');
    assert.strictEqual(r3.body.execucao.quantidade, 3);
    assert.strictEqual(Number(r3.body.execucao.material_id), baixada.materialId);
    assert.ok(r3.body.execucao.movimentacao_id, 'a rota comeu o elo com o livro');
  });

  // ── (5) os codigos de erro atravessam ──────────────────────────────────────────────────────
  await test('(5) 404, 409 e 400 chegam pela rota com a literal certa', async () => {
    setUser({ ...ADMIN });
    const naoExiste = await executarHttp(99999);
    assert.strictEqual(naoExiste.status, 404);
    assert.strictEqual(naoExiste.body.error, 'Não conformidade não encontrada');

    const ctx = await ncDecidida('DEVOLVER');
    await executarHttp(ctx.ncId);
    const repetida = await executarHttp(ctx.ncId);
    assert.strictEqual(repetida.status, 409, JSON.stringify(repetida.body));
    assert.strictEqual(repetida.body.error, 'A execução desta não conformidade já foi registrada');

    const aceita = await ncDecidida('ACEITAR');
    const semExecucao = await executarHttp(aceita.ncId);
    assert.strictEqual(semExecucao.status, 400);
    assert.strictEqual(semExecucao.body.error, 'Esta decisão não tem execução a registrar');
  });

  // ── (6) e (7) a projecao e a fila ──────────────────────────────────────────────────────────
  await test('(6) a listagem carrega execucao_estado e execucao_em', async () => {
    setUser({ ...ADMIN });
    const ctx = await ncDecidida('DEVOLVER');
    const antes = await request(app).get(`${BASE}?limite=500`);
    const linhaAntes = antes.body.itens.find((i) => i.id === ctx.ncId);
    assert.ok(linhaAntes, 'a NC sumiu da listagem');
    assert.strictEqual(linhaAntes.execucao_estado, nc.EXECUCAO_PENDENTE);
    assert.strictEqual(linhaAntes.execucao_em, null);

    await executarHttp(ctx.ncId);
    const depois = await request(app).get(`${BASE}?limite=500`);
    const linhaDepois = depois.body.itens.find((i) => i.id === ctx.ncId);
    assert.strictEqual(linhaDepois.execucao_estado, nc.EXECUCAO_EXECUTADA);
    assert.ok(linhaDepois.execucao_em, 'execucao_em nao chegou na listagem');
  });

  await test('(7) ?execucao=PENDENTE traz o pendente e NAO traz executada, ABERTA nem CANCELADA', async () => {
    setUser({ ...ADMIN });
    const pendente = await ncDecidida('DEVOLVER');
    // Etapa 69: era 'SUCATEAR' — o SUCATEAR viavel passou a recusar o `/executar` (D6). O cenario prova
    // "executada sai da fila", nao o SUCATEAR: SUBSTITUICAO serve igual.
    const executada = await ncDecidida('SUBSTITUICAO');
    await executarHttp(executada.ncId);

    const semDecidir = await novaInspecaoReprovada({ reprovada: 2, esperada: 9 });
    const aberta = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, semDecidir.inspecaoId);

    // A NC CANCELADA **depois de decidida** e o caso que a clausula de status existe para pegar:
    // cancelar nao limpa `execucao_estado`, entao sem ela este documento morto voltaria para a
    // fila cobrando execucao.
    const cancelada = await ncDecidida('DEVOLVER');
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado
      SET status = 'CANCELADA', cancelado_em = CURRENT_TIMESTAMP WHERE id = ?`, [cancelada.ncId]);
    const conferida = await dbGet(db,
      'SELECT execucao_estado FROM nao_conformidades_almoxarifado WHERE id = ?', [cancelada.ncId]);
    assert.strictEqual(conferida.execucao_estado, nc.EXECUCAO_PENDENTE,
      'o cenario deixou de medir o que queria: a cancelada perdeu o PENDENTE por outro caminho');

    const res = await request(app).get(`${BASE}?execucao=PENDENTE&limite=500`);
    assert.strictEqual(res.status, 200);
    const ids = res.body.itens.map((i) => i.id);
    assert.ok(ids.includes(pendente.ncId), 'o pendente NAO veio na fila — a fila esta vazia de verdade?');
    assert.ok(!ids.includes(executada.ncId), 'a executada continua cobrando na fila');
    assert.ok(!ids.includes(aberta.id), 'NC ABERTA entrou na fila de execucao');
    assert.ok(!ids.includes(cancelada.ncId), 'NC CANCELADA depois de decidida entrou na fila');
    // Toda linha da fila tem de estar DECIDIDA e PENDENTE — a guarda contra o filtro virar no-op.
    for (const item of res.body.itens) {
      assert.strictEqual(item.execucao_estado, nc.EXECUCAO_PENDENTE, JSON.stringify(item));
      assert.strictEqual(item.status, 'DECIDIDA', JSON.stringify(item));
    }
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
