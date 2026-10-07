/**
 * Etapa 44, T2 — o EFEITO NO SALDO chega pela porta HTTP.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao.md (T2)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao-design.md (secao 5)
 *
 * O servico (T1) ja tem suite propria e mede a REGRA. Aqui o alvo e o que SO a rota pode errar:
 * o campo `liberacao` sendo comido pela serializacao ou pelo `res.json` de um objeto montado por
 * fora; a FORMA congelada do campo (`quantidade`/`material_id` em `null` quando nao libera), que
 * e o contrato contra o qual a tela da T3 foi escrita em paralelo; e o 403 que tem de acontecer
 * ANTES de qualquer efeito de saldo.
 *
 * ── POR QUE A FORMA IMPORTA MAIS QUE O VALOR ─────────────────────────────────────────────────
 * T2 e T3 foram escritas contra o contrato congelado, sem se esperarem. Se o servidor devolvesse
 * `quantidade: 0` em vez de `null` — ou omitisse o campo —, a tela mostraria "0 liberado(s)" ou
 * `undefined` e os dois lados continuariam "passando" nas proprias suites. E o modo de falha que
 * a Fase 2 nomeou (achado 14).
 *
 * ── CONTROLE POSITIVO ────────────────────────────────────────────────────────────────────────
 * Assercao NEGATIVA de permissao nao fica vermelha na rodada TDD. O cenario (5) foi provado
 * concedendo `decidir_nao_conformidade` ao ALMOXARIFE em `permissions.js`: ele cai nomeando o
 * perfil E o saldo que se mexeu. Medido nesta task.
 *
 * Executar: cd server && node tests/api/naoConformidadeLiberacaoRotas.api.test.js
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

const ADMIN = { id: 440, nome: 'Admin E44', role: 'admin', is_superadmin: 1, email: 'admin44@test.com' };
const QUALIDADE = { id: 442, nome: 'Qualidade E44', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'qual44@test.com' };
const ALMOXARIFE = { id: 441, nome: 'Almoxarife E44', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox44@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 44 T2: o efeito no saldo pela porta HTTP ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const bloqueadaDe = async (materialId) => {
    const m = await dbGet(db, 'SELECT quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    return Number(m.quantidade_bloqueada) || 0;
  };

  async function novaInspecaoReprovada({ reprovada = 3, esperada = 10, bloqueioDeOutraOrigem = 0 } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo) VALUES (?,?,?,?,?,1)`,
      [uniq('MAT-T2E44'), 'Material da T2 da 44', 'KG', esperada, reprovada + bloqueioDeOutraOrigem]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-T2E44'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, esperada]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada) VALUES (?,0,?,?)`,
      [item.lastID, esperada - reprovada, reprovada]);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, insp.lastID);
    return { materialId: mat.lastID, itemId: item.lastID, inspecaoId: insp.lastID, nc: doc };
  }

  const decidirHttp = (id, decisao) => request(app).post(`${BASE}/${id}/decidir`)
    .send({ decisao, justificativa: 'laudo da engenharia anexo' });

  /**
   * A FORMA congelada de um efeito que NAO libera, aplicada a TODOS eles.
   *
   * ⚠️ Achado da revisao adversarial: antes, so `NENHUMA` era medido assim. Trocar o retorno de
   * `JA_LIBERADA` para devolver quantidade e material passava verde em quatro suites — e a tela,
   * que le `liberacao.mensagem` e pode um dia ler os outros campos, receberia numeros de uma
   * liberacao que NAO aconteceu.
   */
  function formaDeQuemNaoLibera(liberacao, rotulo) {
    assert.ok('quantidade' in liberacao, `${rotulo}: o campo \`quantidade\` sumiu do JSON`);
    assert.ok('material_id' in liberacao, `${rotulo}: o campo \`material_id\` sumiu do JSON`);
    assert.strictEqual(liberacao.quantidade, null,
      `${rotulo}: quantidade veio ${JSON.stringify(liberacao.quantidade)} — tem de ser null, nunca 0 nem ausente`);
    assert.strictEqual(liberacao.material_id, null,
      `${rotulo}: material_id veio ${JSON.stringify(liberacao.material_id)}`);
  }

  // ── (1) LIBERADA — o efeito chega inteiro, com a forma congelada ──────────────────────────
  await test('(1) LIBERADA chega pelo HTTP com efeito, quantidade, material_id e a literal', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    setUser({ ...QUALIDADE });

    const r = await decidirHttp(f.nc.id, 'ACEITAR_SOB_DESVIO');

    assert.strictEqual(r.status, 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.liberacao, 'a resposta nao trouxe o campo `liberacao` — a rota comeu o aditivo');
    assert.strictEqual(r.body.liberacao.efeito, 'LIBERADA', `efeito ${r.body.liberacao.efeito}`);
    assert.strictEqual(r.body.liberacao.quantidade, 3, `quantidade ${r.body.liberacao.quantidade}`);
    assert.strictEqual(r.body.liberacao.material_id, f.materialId, 'material_id errado');
    assert.strictEqual(r.body.liberacao.mensagem, '3 liberado(s) do bloqueio', `mensagem: ${r.body.liberacao.mensagem}`);
    // O documento continua vindo inteiro ao lado do aditivo — o campo novo nao pode ter
    // substituido a NC na resposta.
    assert.strictEqual(r.body.status, 'DECIDIDA', `status da NC: ${r.body.status}`);
    assert.strictEqual(r.body.numero, f.nc.numero, 'a resposta perdeu o numero do documento');
    assert.strictEqual(await bloqueadaDe(f.materialId), 10, 'o saldo nao caiu pela reprovada');
  });

  // ── (2) NENHUMA — a FORMA, que e o contrato contra o qual a tela foi escrita ──────────────
  await test('(2) NENHUMA vem com quantidade e material_id em null (forma congelada)', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3 });
    setUser({ ...QUALIDADE });

    const r = await decidirHttp(f.nc.id, 'DEVOLVER');

    assert.strictEqual(r.status, 200, `status ${r.status}`);
    assert.strictEqual(r.body.liberacao.efeito, 'NENHUMA', `efeito ${r.body.liberacao.efeito}`);
    assert.strictEqual(r.body.liberacao.mensagem, 'Esta decisão não altera o saldo', `mensagem: ${r.body.liberacao.mensagem}`);
    // `null`, nunca `0` nem ausente: com `0` a tela mostraria "0 liberado(s)"; ausente, `undefined`.
    formaDeQuemNaoLibera(r.body.liberacao, 'NENHUMA');
  });

  // ── (3) SEM_BLOQUEIO e JA_LIBERADA pelo HTTP ──────────────────────────────────────────────
  await test('(3) SEM_BLOQUEIO e JA_LIBERADA chegam com as literais do contrato', async () => {
    // SEM_BLOQUEIO pela RN-09 (NC manual), que e a mais facil de montar por HTTP.
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    setUser({ ...QUALIDADE });
    const manual = await request(app).post(BASE).send({
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: f.inspecaoId,
      tipo: 'OUTRO', descricao: 'aberta a mao',
    });
    assert.strictEqual(manual.status, 201, `abertura manual falhou: ${manual.status} ${JSON.stringify(manual.body)}`);

    const rManual = await decidirHttp(manual.body.id, 'ACEITAR');
    assert.strictEqual(rManual.body.liberacao.efeito, 'SEM_BLOQUEIO', `efeito ${rManual.body.liberacao.efeito}`);
    assert.strictEqual(rManual.body.liberacao.mensagem, 'Não conformidade aberta manualmente não libera saldo',
      `mensagem: ${rManual.body.liberacao.mensagem}`);
    formaDeQuemNaoLibera(rManual.body.liberacao, 'SEM_BLOQUEIO');
    assert.strictEqual(await bloqueadaDe(f.materialId), 13, 'a NC manual mexeu no saldo pela porta HTTP');

    // JA_LIBERADA: a automatica libera primeiro, e uma segunda automatica da MESMA inspecao nao.
    const rAuto = await decidirHttp(f.nc.id, 'ACEITAR');
    assert.strictEqual(rAuto.body.liberacao.efeito, 'LIBERADA', 'a automatica tinha de liberar');
    const segunda = await nc.abrirNaoConformidade(db, QUALIDADE, {
      origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: f.inspecaoId,
      tipo: 'DANO_FISICO', aberto_automaticamente: 1, descricao: 'segunda automatica',
    });
    const rSegunda = await decidirHttp(segunda.id, 'ACEITAR');
    assert.strictEqual(rSegunda.body.liberacao.efeito, 'JA_LIBERADA', `efeito ${rSegunda.body.liberacao.efeito}`);
    assert.strictEqual(rSegunda.body.liberacao.mensagem, 'O material desta inspeção já havia sido liberado',
      `mensagem: ${rSegunda.body.liberacao.mensagem}`);
    formaDeQuemNaoLibera(rSegunda.body.liberacao, 'JA_LIBERADA');
    assert.strictEqual(await bloqueadaDe(f.materialId), 10, 'a segunda liberou de novo pela porta HTTP');
  });

  // ── (4) o 400 do motor sobe com a literal, e a decisao nao fica gravada ───────────────────
  await test('(4) o 400 do motor sobe com a literal e a NC volta a ABERTA', async () => {
    // ⚠️ O GATILHO DESTE CENARIO MUDOU NO FIX-ROUND. Ele drenava o pool (bloqueada 1 < reprovada
    // 3) para provocar o 400 do teto — e esse caminho deixou de ser recusa: virou a RN-11, que
    // GRAVA a decisao e devolve SEM_BLOQUEIO. Se o cenario tivesse ficado, mediria a regra errada.
    // Agora injeta uma falha REAL do motor, que e o unico caso em que a rota ainda devolve 400.
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    const stock = require('../../services/almoxarifado/stockService');
    const original = stock.registrarMovimentacao;
    stock.registrarMovimentacao = async () => {
      throw Object.assign(new Error('Quantidade bloqueada insuficiente: 1'), { status: 400 });
    };
    setUser({ ...QUALIDADE });

    const r = await decidirHttp(f.nc.id, 'ACEITAR');
    stock.registrarMovimentacao = original;

    assert.strictEqual(r.status, 400, `status ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Quantidade bloqueada insuficiente: 1', `mensagem: ${r.body.error}`);
    const depois = await dbGet(db, 'SELECT status, decisao FROM nao_conformidades_almoxarifado WHERE id = ?', [f.nc.id]);
    assert.strictEqual(depois.status, 'ABERTA', `a NC ficou ${depois.status} depois do 400`);
    assert.strictEqual(depois.decisao, null, `a decisao ${depois.decisao} ficou gravada`);
    assert.strictEqual(await bloqueadaDe(f.materialId), 13, 'o 400 mexeu no saldo');
  });

  // ── (4b) — RN-11 pela porta: o pool drenado por fora NAO devolve erro ─────────────────────
  await test('(4b) RN-11 pelo HTTP: pool drenado por fora responde 200 com SEM_BLOQUEIO', async () => {
    // O contraponto do (4), no mesmo arquivo: o que ANTES era 400 e hoje e 200 com efeito
    // explicito. Sem este cenario, alguem "restaurando" a recusa reabriria o beco do documento
    // que nunca fecha sem nenhum teste avisar.
    const f = await novaInspecaoReprovada({ reprovada: 3 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 1 WHERE id = ?', [f.materialId]);
    setUser({ ...QUALIDADE });

    const r = await decidirHttp(f.nc.id, 'ACEITAR');

    assert.strictEqual(r.status, 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.liberacao.efeito, 'SEM_BLOQUEIO', `efeito ${r.body.liberacao.efeito}`);
    assert.strictEqual(r.body.liberacao.mensagem,
      'O material já havia sido desbloqueado fora do documento — a decisão foi registrada sem liberar saldo',
      `mensagem: ${r.body.liberacao.mensagem}`);
    formaDeQuemNaoLibera(r.body.liberacao, 'SEM_BLOQUEIO_DRENADO');
    assert.strictEqual(r.body.status, 'DECIDIDA', 'o documento nao fechou — o beco voltou');
    assert.strictEqual(await bloqueadaDe(f.materialId), 1, 'o saldo mudou');
  });

  // ── (5) o 403 acontece ANTES de qualquer efeito de saldo ──────────────────────────────────
  await test('(5) perfil sem decidir_nao_conformidade toma 403 e o saldo nao se move', async () => {
    const f = await novaInspecaoReprovada({ reprovada: 3, bloqueioDeOutraOrigem: 10 });
    setUser({ ...ALMOXARIFE });

    const r = await decidirHttp(f.nc.id, 'ACEITAR');

    assert.strictEqual(r.status, 403, `status ${r.status}: ${JSON.stringify(r.body)}`);
    // A metade POSITIVA, no mesmo cenario: sem ela, "o saldo nao mudou" passaria identico com a
    // rota morta, com 404, ou com o fixture sem bloqueio nenhum.
    assert.strictEqual(await bloqueadaDe(f.materialId), 13, 'o 403 mexeu no saldo');
    setUser({ ...QUALIDADE });
    const permitido = await decidirHttp(f.nc.id, 'ACEITAR');
    assert.strictEqual(permitido.status, 200, `o perfil PERMITIDO tomou ${permitido.status}`);
    assert.strictEqual(await bloqueadaDe(f.materialId), 10, 'o perfil permitido nao liberou');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
