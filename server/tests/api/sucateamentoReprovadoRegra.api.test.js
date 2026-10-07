/**
 * Etapa 69, T2 — o lado da NC do sucateamento do reprovado.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa69-sucatear-reprovado.md (T2 e a secao
 * "Fase 2 — revisao do plano", que PREVALECE sobre o texto de cima).
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1)  RN-03: `sucateamentoDoReprovadoPrevisto` — a precedencia INTEIRA, descascada nivel a
 *        nivel a partir de um estado com TODAS as condicoes ruins (a ordem e contrato: trocar dois
 *        niveis derruba este cenario), com a literal e o status de cada nivel, ate SUCEATEAVEL
 *   (2)  RN-08: `/executar` de SUCATEAR viavel -> 409 que ensina o caminho; NC continua PENDENTE
 *        (prova tambem que a inspecao/lote sao CARREGADOS para SUCATEAR — sem isso seria NENHUMA)
 *   (3)  RN-08: `motivo_sem_baixa` NAO abre a porta do viavel
 *   (4)  RN-08: ha SOLICITADO aberto -> 409 com o SUC-id
 *   (5)  RN-08: lote BLOQUEADO (o tipico com controle_certificado) -> 409; com `motivo_sem_baixa`
 *        registra SEM_BAIXA, sem mover saldo, e o motivo fica gravado
 *   (6)  RN-08 sem beco: drenado (desbloqueio avulso) -> 200 EXECUTADA SEM_SALDO, pela ROTA
 *   (7)  RN-08: as outras tres decisoes e a NC manual: como hoje
 *   (8)  RN-07 (45): inspecao sucateada -> a devolucao de outra NC registra SEM_SALDO_JA_SUCATEADA
 *   (9)  RN-07 (45, claim): o carimbo chega ENTRE a precedencia e o claim -> a devolucao NAO baixa
 *   (10) RN-07 (44): inspecao devolvida/sucateada -> ACEITAR registra sem liberar; metade positiva
 *   (11) RN-07 (44, claim): o carimbo chega ENTRE a precedencia e o claim -> a liberacao NAO solta
 *   (12) RN-10: o cartao MATERIAL_REPROVADO exclui a inspecao sucateada; antes dela, lista
 *   (13) origem de entrada extraida (`origemDaEntradaDaInspecao`) — o endereco do item
 *
 * Executar: cd server && node tests/api/sucateamentoReprovadoRegra.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 6920, nome: 'Admin E69', role: 'admin', is_superadmin: 1, email: 'admin69r@test.com' };
const QUALIDADE = { id: 6921, nome: 'Fulana Qualidade 69', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'q69@test.com' };
const COMPRAS = { id: 6922, nome: 'Beltrano Compras 69', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'c69@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;
async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

const PEDE = 'Esta não conformidade pede sucateamento: o almoxarifado registra em "Solicitar sucateamento" (duas aprovações) — a execução fica registrada na segunda aprovação.';
const SEM_SALDO_JA_SUCATEADA = 'O material desta inspeção já havia sido sucateado — a execução foi registrada sem mover saldo';
const SEM_BLOQUEIO_JA_SAIU = 'O material desta inspeção já saiu do estoque — a decisão foi registrada sem liberar saldo';

(async () => {
  console.log('\n=== Etapa 69 T2: o lado da NC do sucateamento do reprovado ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const saldos = (id) => dbGet(db, 'SELECT quantidade_atual, quantidade_bloqueada FROM materiais_almoxarifado WHERE id = ?', [id]);
  const inspecaoDe = (id) => dbGet(db, `SELECT liberacao_nc_em, devolucao_fornecedor_em, sucateamento_em
    FROM inspecoes_recebimento_almoxarifado WHERE id = ?`, [id]);
  const linhaNc = (id) => dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);

  async function novaInspecaoReprovada({
    reprovada = 3, esperada = 10, atual = null, bloqueioExtra = 0, controleLote = 0, controleSerie = 0,
    loteStatus = null, loteMotivo = null, critico = 1,
  } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, controle_lote, controle_serie,
       material_critico, controle_certificado)
      VALUES (?,?,?,?,?,1,?,?,?,?)`,
      [uniq('MAT-E69R'), 'Chapa critica 69', 'KG', atual == null ? esperada : atual,
        reprovada + bloqueioExtra, controleLote, controleSerie, critico, controleLote ? 1 : 0]);
    let loteId = null; let loteCodigo = null;
    if (loteStatus) {
      loteCodigo = uniq('L69');
      loteId = (await dbRun(db, `INSERT INTO lotes_almoxarifado (material_id, codigo, status, status_motivo)
        VALUES (?,?,?,?)`, [mat.lastID, loteCodigo, loteStatus, loteMotivo])).lastID;
    }
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal)
      VALUES (?,?,?)`, [uniq('REC-E69'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote_id, lote)
      VALUES (?,?,?,?,?,?)`, [rec.lastID, mat.lastID, esperada, esperada, loteId, loteCodigo]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,?,?,?,?,?)`, [item.lastID, 0, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    return { materialId: mat.lastID, recebimentoId: rec.lastID, itemId: item.lastID, inspecaoId: insp.lastID, loteId, loteCodigo };
  }

  async function ncDecidida(decisao, opcoes = {}, ctxPronto = null) {
    const ctx = ctxPronto || await novaInspecaoReprovada(opcoes);
    let doc;
    if (opcoes.manual) {
      doc = await nc.abrirNaoConformidadeManual(db, QUALIDADE, {
        origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: ctx.inspecaoId, tipo: 'OUTRO',
        descricao: 'aberta a mao',
      });
    } else {
      doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    }
    await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao, justificativa: 'laudo anexo' });
    return { ...ctx, ncId: doc.id, numero: doc.numero };
  }

  const executar = (id, dados = {}, user = COMPRAS) => nc.registrarExecucao(db, user, id, { observacoes: 'cacamba', ...dados });

  // ── (1) a precedencia inteira ─────────────────────────────────────────────────────────────
  await test('(1) RN-03 a precedencia, descascada nivel a nivel, com a literal de cada um', async () => {
    const f = nc.sucateamentoDoReprovadoPrevisto;
    assert.strictEqual(typeof f, 'function', 'sucateamentoDoReprovadoPrevisto nao exportada');
    // TODAS as condicoes ruins ao mesmo tempo; cada passo conserta o nivel de cima.
    const n = {
      id: 1, numero: 'NC-1', status: 'CANCELADA', decisao: 'DEVOLVER', execucao_movimentacao_id: 9,
      aberto_automaticamente: 0, origem: 'INSPECAO', referencia_tipo: 'INSPECAO',
    };
    const i = { id: 1, material_id: 10, quantidade_reprovada: 0, sucateamento_em: 'x', devolucao_fornecedor_em: 'x', liberacao_nc_em: 'x' };
    const m = { id: 10, codigo: 'M1', unidade: 'KG', ativo: 0, controle_serie: 1, controle_lote: 1, quantidade_atual: 2, quantidade_bloqueada: 2 };
    let lote = null;
    let solic = { id: 77 };
    const passos = [
      [() => {}, null, 404, 'Não conformidade não encontrada'],
      [() => {}, n, 400, 'Esta não conformidade foi cancelada — não há sucateamento a solicitar'],
      [() => { n.status = 'ABERTA'; }, n, 400, 'Só é possível sucatear o material de uma não conformidade decidida'],
      [() => { n.status = 'DECIDIDA'; }, n, 400, 'A decisão desta não conformidade não é Sucatear — o material reprovado só vai para o sucateamento por essa decisão'],
      [() => { n.decisao = 'SUCATEAR'; }, n, 409, 'O material desta não conformidade já saiu do estoque'],
      [() => { n.execucao_movimentacao_id = null; }, n, 400, 'Só a não conformidade aberta pela reprovação da inspeção sucateia material reprovado'],
      [() => { n.aberto_automaticamente = 1; }, n, 400, 'Esta não conformidade não tem material reprovado para sucatear'],
      [() => { i.quantidade_reprovada = 3; }, n, 409, 'O material desta inspeção já foi sucateado'],
      [() => { i.sucateamento_em = null; }, n, 400, 'O material desta inspeção já havia sido devolvido ao fornecedor'],
      [() => { i.devolucao_fornecedor_em = null; }, n, 400, 'O material desta inspeção já havia sido liberado por outra não conformidade'],
      [() => { i.liberacao_nc_em = null; }, n, 400, 'O material M1 esta inativo e nao pode ser movimentado — reative o cadastro antes de sucatear'],
      [() => { m.ativo = 1; }, n, 400, 'Material com controle de série não pode ser sucateado por aqui — dê baixa pela tela de Movimentações'],
      [() => { m.controle_serie = 0; }, n, 400, 'Não foi possível identificar o lote do material reprovado'],
      [() => { lote = { id: 5, codigo: 'L1', status: 'BLOQUEADO' }; }, n, 400, 'O lote L1 está bloqueado — o estoque não baixa lote fora de ATIVO, nem para sucata. Mude o status do lote antes de sucatear'],
      [() => { lote.status = 'ATIVO'; }, n, 400, 'O material já havia saído do bloqueio — há 2 KG bloqueado(s), a reprovação foi de 3'],
      [() => { m.quantidade_bloqueada = 3; }, n, 400, 'Não há saldo físico deste material para sucatear — físico 2 KG, reprovado 3'],
      [() => { m.quantidade_atual = 10; }, n, 409, 'Já existe um sucateamento solicitado para esta não conformidade (SUC-77) — aprove ou rejeite esse antes'],
    ];
    let nivel = 0;
    for (const [conserta, doc, status, mensagem] of passos) {
      nivel++;
      conserta();
      const r = f(doc, i, m, lote, solic);
      assert.strictEqual(r.efeito, 'RECUSA', `nivel ${nivel}: ${JSON.stringify(r)}`);
      assert.strictEqual(r.mensagem, mensagem, `nivel ${nivel}`);
      assert.strictEqual(r.status, status, `nivel ${nivel} status`);
    }
    solic = null;
    const ok = f(n, i, m, lote, solic);
    assert.deepStrictEqual(ok, { efeito: 'SUCATEAVEL', quantidade: 3, material_id: 10, lote_id: 5 });
    // Sem lote e sem controle_lote: SUCATEAVEL com lote_id null (metade positiva do nivel 13).
    m.controle_lote = 0;
    assert.deepStrictEqual(f(n, i, m, null, null), { efeito: 'SUCATEAVEL', quantidade: 3, material_id: 10, lote_id: null });
    // Epsilon: bloqueado 2.9999999999999996 nao e "menos que 3".
    m.quantidade_bloqueada = 2.9999999999999996;
    assert.strictEqual(f(n, i, m, null, null).efeito, 'SUCATEAVEL', 'ruido de IEEE-754 virou recusa');
  });

  // ── (2) e (3) — o viavel recusa ───────────────────────────────────────────────────────────
  await test('(2) RN-08 /executar de SUCATEAR viavel -> 409 que ensina o caminho; nada muda', async () => {
    const ctx = await ncDecidida('SUCATEAR');
    const e = await erroDe(() => executar(ctx.ncId));
    assert.ok(e, 'o /executar registrou um SUCATEAR viavel sem baixar nada');
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message, PEDE);
    const doc = await linhaNc(ctx.ncId);
    assert.strictEqual(doc.execucao_estado, 'PENDENTE', 'a NC saiu da fila');
    assert.strictEqual(doc.execucao_em, null);
    const s = await saldos(ctx.materialId);
    assert.strictEqual(s.quantidade_atual, 10);
    assert.strictEqual(s.quantidade_bloqueada, 3);

    // Pela ROTA, com a mesma literal.
    setUser({ ...COMPRAS });
    const r = await request(app).post(`/api/almoxarifado/nao-conformidades/${ctx.ncId}/executar`).send({ observacoes: 'x' });
    setUser({ ...ADMIN });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, PEDE);
  });

  await test('(3) RN-08 motivo_sem_baixa NAO abre a porta do SUCATEAR viavel', async () => {
    const ctx = await ncDecidida('SUCATEAR');
    const e = await erroDe(() => executar(ctx.ncId, { motivo_sem_baixa: 'ja foi para a cacamba' }));
    assert.ok(e && e.status === 409 && e.message === PEDE, JSON.stringify(e));
    assert.strictEqual((await linhaNc(ctx.ncId)).execucao_estado, 'PENDENTE');
  });

  // ── (4) ───────────────────────────────────────────────────────────────────────────────────
  await test('(4) RN-08 ha sucateamento SOLICITADO aberto -> 409 com o SUC-id; rejeitado, volta a pedir o caminho', async () => {
    const ctx = await ncDecidida('SUCATEAR');
    const suc = await dbRun(db, `INSERT INTO sucateamentos_almoxarifado
      (material_id, quantidade, justificativa, status, solicitante_id, nao_conformidade_id)
      VALUES (?,?,?,?,?,?)`, [ctx.materialId, 3, 'reprovado', 'SOLICITADO', 1, ctx.ncId]);
    const e = await erroDe(() => executar(ctx.ncId));
    assert.ok(e, 'o /executar fechou a NC com sucateamento aberto');
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message, `Já existe o sucateamento SUC-${suc.lastID} desta não conformidade aguardando aprovação no almoxarifado.`);
    // Metade positiva: o REJEITADO nao conta como aberto.
    await dbRun(db, "UPDATE sucateamentos_almoxarifado SET status = 'REJEITADO' WHERE id = ?", [suc.lastID]);
    const e2 = await erroDe(() => executar(ctx.ncId));
    assert.strictEqual(e2 && e2.message, PEDE);
  });

  // ── (5) ───────────────────────────────────────────────────────────────────────────────────
  await test('(5) RN-08 lote BLOQUEADO -> 409; com motivo_sem_baixa registra SEM_BAIXA sem mover', async () => {
    const ctx = await ncDecidida('SUCATEAR', {
      controleLote: 1, loteStatus: 'BLOQUEADO', loteMotivo: 'Certificado do fornecedor nao anexado',
    });
    const e = await erroDe(() => executar(ctx.ncId));
    assert.ok(e, 'o /executar fechou calado com o lote bloqueado');
    assert.strictEqual(e.status, 409);
    assert.strictEqual(e.message,
      `O lote ${ctx.loteCodigo} está bloqueado (Certificado do fornecedor nao anexado): libere o lote para sucatear o reprovado, ou registre a execução sem baixa informando o motivo.`);
    assert.strictEqual((await linhaNc(ctx.ncId)).execucao_estado, 'PENDENTE');

    // motivo so com espacos nao vale.
    const e2 = await erroDe(() => executar(ctx.ncId, { motivo_sem_baixa: '   ' }));
    assert.ok(e2 && e2.status === 409, 'motivo em branco fechou o documento');

    setUser({ ...COMPRAS });
    const r = await request(app).post(`/api/almoxarifado/nao-conformidades/${ctx.ncId}/executar`)
      .send({ observacoes: 'coleta', motivo_sem_baixa: 'lote segregado e destruido pelo fornecedor no local' });
    setUser({ ...ADMIN });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.execucao_estado, 'EXECUTADA');
    assert.strictEqual(r.body.execucao.efeito, 'SEM_BAIXA');
    assert.strictEqual(r.body.execucao.mensagem, 'A execução foi registrada sem baixa, pelo motivo informado — o material continua bloqueado');
    assert.ok(/lote segregado e destruido/.test(r.body.execucao_observacoes || ''), `motivo nao gravado: ${r.body.execucao_observacoes}`);
    const s = await saldos(ctx.materialId);
    assert.strictEqual(s.quantidade_atual, 10);
    assert.strictEqual(s.quantidade_bloqueada, 3);
  });

  // ── (6) — sem beco ────────────────────────────────────────────────────────────────────────
  await test('(6) RN-08 drenado por desbloqueio avulso -> 200 EXECUTADA SEM_SALDO (sem beco), pela rota', async () => {
    const ctx = await ncDecidida('SUCATEAR');
    const d = await request(app).post(`/api/almoxarifado/materiais/${ctx.materialId}/desbloquear`)
      .send({ quantidade: 3, justificativa: 'liberado pela gestao' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    setUser({ ...COMPRAS });
    const r = await request(app).post(`/api/almoxarifado/nao-conformidades/${ctx.ncId}/executar`).send({ observacoes: 'x' });
    setUser({ ...ADMIN });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.execucao_estado, 'EXECUTADA');
    assert.strictEqual(r.body.execucao.efeito, 'SEM_SALDO');
    assert.strictEqual(r.body.execucao.mensagem, 'O material já havia saído do bloqueio — a execução foi registrada sem mover saldo');
    const s = await saldos(ctx.materialId);
    assert.strictEqual(s.quantidade_atual, 10);
    assert.strictEqual(s.quantidade_bloqueada, 0);
  });

  // ── (7) ───────────────────────────────────────────────────────────────────────────────────
  await test('(7) RN-08 SUBSTITUICAO/ANALISE_ENGENHARIA e o SUCATEAR de NC manual: como hoje', async () => {
    for (const decisao of ['SUBSTITUICAO', 'ANALISE_ENGENHARIA']) {
      const ctx = await ncDecidida(decisao);
      const res = await executar(ctx.ncId);
      assert.strictEqual(res.execucao.efeito, 'NENHUMA', decisao);
      assert.strictEqual(res.execucao.mensagem, 'Esta execução não altera o saldo');
      assert.strictEqual(res.execucao_estado, 'EXECUTADA');
    }
    const manual = await ncDecidida('SUCATEAR', { manual: true });
    const res = await executar(manual.ncId);
    assert.strictEqual(res.execucao.efeito, 'NENHUMA');
    assert.strictEqual(res.execucao.mensagem, 'Esta execução não altera o saldo');
    const s = await saldos(manual.materialId);
    assert.strictEqual(s.quantidade_bloqueada, 3, 'a NC manual mexeu no bloqueado');
    // Serie e lote nao identificavel: NENHUMA (contrato), sem mover.
    const serie = await ncDecidida('SUCATEAR', { controleSerie: 1 });
    assert.strictEqual((await executar(serie.ncId)).execucao.efeito, 'NENHUMA');
    const semLote = await ncDecidida('SUCATEAR', { controleLote: 1 });
    assert.strictEqual((await executar(semLote.ncId)).execucao.efeito, 'NENHUMA');
  });

  // ── (8) e (9) — a porta da 45 olha o carimbo novo ─────────────────────────────────────────
  await test('(8) RN-07 inspecao sucateada: a devolucao de outra NC registra SEM_SALDO_JA_SUCATEADA, nada move', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3, bloqueioExtra: 5 });
    const dev = await ncDecidida('DEVOLVER', {}, ctx);
    await dbRun(db, 'UPDATE inspecoes_recebimento_almoxarifado SET sucateamento_em = CURRENT_TIMESTAMP WHERE id = ?', [ctx.inspecaoId]);
    const res = await executar(dev.ncId);
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO');
    assert.strictEqual(res.execucao.mensagem, SEM_SALDO_JA_SUCATEADA);
    const s = await saldos(ctx.materialId);
    assert.strictEqual(s.quantidade_atual, 10, 'a devolucao baixou depois do sucateamento');
    assert.strictEqual(s.quantidade_bloqueada, 8);
  });

  await test('(9) RN-07 o carimbo chega ENTRE a precedencia e o claim: a devolucao NAO baixa', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3, bloqueioExtra: 5 });
    const dev = await ncDecidida('DEVOLVER', {}, ctx);
    // Injecao natural da corrida: o claim da EXECUCAO (passo 2) dispara o carimbo de sucateamento.
    await dbRun(db, `CREATE TRIGGER trg_e69_corrida_45 AFTER UPDATE OF execucao_em ON nao_conformidades_almoxarifado
      WHEN NEW.id = ${dev.ncId} AND NEW.execucao_em IS NOT NULL
      BEGIN UPDATE inspecoes_recebimento_almoxarifado SET sucateamento_em = CURRENT_TIMESTAMP WHERE id = ${ctx.inspecaoId}; END`);
    let res;
    try { res = await executar(dev.ncId); } finally { await dbRun(db, 'DROP TRIGGER trg_e69_corrida_45'); }
    const s = await saldos(ctx.materialId);
    assert.strictEqual(s.quantidade_atual, 10, 'a devolucao baixou contra a retencao alheia depois do sucateamento');
    assert.strictEqual(s.quantidade_bloqueada, 8);
    assert.strictEqual(res.execucao.mensagem, SEM_SALDO_JA_SUCATEADA, `a causa nao foi nomeada: ${res.execucao.mensagem}`);
    assert.strictEqual((await inspecaoDe(ctx.inspecaoId)).devolucao_fornecedor_em, null);
  });

  // ── (10) e (11) — a porta da 44 olha os carimbos da 45 e da 69 ────────────────────────────
  await test('(10) RN-07 inspecao devolvida ou sucateada: ACEITAR registra sem liberar; sem carimbo, libera', async () => {
    for (const col of ['devolucao_fornecedor_em', 'sucateamento_em']) {
      const ctx = await novaInspecaoReprovada({ reprovada: 3, bloqueioExtra: 5 });
      await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET ${col} = CURRENT_TIMESTAMP WHERE id = ?`, [ctx.inspecaoId]);
      const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
      const r = await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'ACEITAR', justificativa: 'ok' });
      assert.strictEqual(r.liberacao.efeito, 'SEM_BLOQUEIO', `${col}: ${JSON.stringify(r.liberacao)}`);
      assert.strictEqual(r.liberacao.mensagem, SEM_BLOQUEIO_JA_SAIU, col);
      assert.strictEqual((await saldos(ctx.materialId)).quantidade_bloqueada, 8, `${col}: liberou a retencao alheia`);
      assert.strictEqual((await inspecaoDe(ctx.inspecaoId)).liberacao_nc_em, null, `${col}: carimbou a liberacao`);
    }
    // Metade positiva: sem carimbo nenhum, a aceitacao libera os 3.
    const ok = await novaInspecaoReprovada({ reprovada: 3, bloqueioExtra: 5 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ok.inspecaoId);
    const r = await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'ACEITAR', justificativa: 'ok' });
    assert.strictEqual(r.liberacao.efeito, 'LIBERADA');
    assert.strictEqual((await saldos(ok.materialId)).quantidade_bloqueada, 5);
  });

  await test('(11) RN-07 o carimbo chega ENTRE a precedencia e o claim: a liberacao NAO solta', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3, bloqueioExtra: 5 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, ctx.inspecaoId);
    await dbRun(db, `CREATE TRIGGER trg_e69_corrida_44 AFTER UPDATE OF status ON nao_conformidades_almoxarifado
      WHEN NEW.id = ${doc.id} AND NEW.status = 'DECIDIDA'
      BEGIN UPDATE inspecoes_recebimento_almoxarifado SET sucateamento_em = CURRENT_TIMESTAMP WHERE id = ${ctx.inspecaoId}; END`);
    let r;
    try {
      r = await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'ACEITAR', justificativa: 'ok' });
    } finally { await dbRun(db, 'DROP TRIGGER trg_e69_corrida_44'); }
    assert.strictEqual((await saldos(ctx.materialId)).quantidade_bloqueada, 8, 'a liberacao soltou a retencao alheia');
    assert.strictEqual(r.liberacao.efeito, 'SEM_BLOQUEIO', JSON.stringify(r.liberacao));
    assert.strictEqual(r.liberacao.mensagem, SEM_BLOQUEIO_JA_SAIU);
    assert.strictEqual((await inspecaoDe(ctx.inspecaoId)).liberacao_nc_em, null);
  });

  // ── (12) RN-10 ────────────────────────────────────────────────────────────────────────────
  await test('(12) RN-10 o cartao MATERIAL_REPROVADO lista a inspecao antes, e a exclui depois do sucateamento', async () => {
    const ctx = await novaInspecaoReprovada({ reprovada: 3 });
    const antes = await alertRegistry.listarReprovados(db, { inspecaoId: ctx.inspecaoId, excluirComExecucao: true });
    assert.strictEqual(antes.length, 1, 'a inspecao reprovada nao estava no cartao (cenario nao mede nada)');
    await dbRun(db, 'UPDATE inspecoes_recebimento_almoxarifado SET sucateamento_em = CURRENT_TIMESTAMP WHERE id = ?', [ctx.inspecaoId]);
    const depois = await alertRegistry.listarReprovados(db, { inspecaoId: ctx.inspecaoId, excluirComExecucao: true });
    assert.strictEqual(depois.length, 0, 'o cartao continua cobrando material que ja foi para a cacamba');
  });

  // ── (13) a origem de entrada, extraida ────────────────────────────────────────────────────
  await test('(13) origemDaEntradaDaInspecao: endereco gravado no item; inativo = sem origem', async () => {
    assert.strictEqual(typeof nc.origemDaEntradaDaInspecao, 'function', 'helper nao exportado');
    const ctx = await novaInspecaoReprovada({ reprovada: 3 });
    const E = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, tipo, ativo) VALUES (?, 'Prateleira', 1)", [uniq('E69')])).lastID;
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET localizacao_entrada_id = ? WHERE id = ?', [E, ctx.itemId]);
    const insp = await dbGet(db, 'SELECT i.*, ri.recebimento_id FROM inspecoes_recebimento_almoxarifado i JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = i.recebimento_item_id WHERE i.id = ?', [ctx.inspecaoId]);
    const o = await nc.origemDaEntradaDaInspecao(db, insp, { recebimento_id: ctx.recebimentoId }, ctx.materialId, null);
    assert.deepStrictEqual(o, { id: E });
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?', [E]);
    assert.strictEqual(await nc.origemDaEntradaDaInspecao(db, insp, { recebimento_id: ctx.recebimentoId }, ctx.materialId, null), null);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
