/**
 * Etapa 69, T3 — o sucateamento do material REPROVADO: a rota nova da NC e as duas assinaturas que
 * baixam do BLOQUEADO.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa69-sucatear-reprovado.md (T3, RN-04, RN-05,
 * RN-06, RN-09, RN-11; e a secao "Fase 2 — revisao do plano", que PREVALECE).
 *
 * Usuarios DISTINTOS em cada papel (a segregacao da Etapa 9 e o que o processo e): a QUALIDADE
 * decide, ALMOX1 solicita, ALMOX2 assina a perna do almoxarifado, GESTOR a da gestao.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1)  RN-04 o tipico: material critico com controle_certificado e LOTE — o lote nasce BLOQUEADO,
 *        a solicitacao recusa (nivel 14) antes de gastar assinatura; liberado o lote, 201 com
 *        material/quantidade/lote DERIVADOS (o body nao manda neles), nada move; segunda -> 409
 *   (2)  RN-05 pernas gestao -> almoxarifado: baixa do BLOQUEADO (o aprovado intacto), a linha do
 *        lote debitada, livro com motivo/NC/SUC-id, NC EXECUTADA com a movimentacao, fora da fila,
 *        a inspecao carimbada, a fila de sucateamentos com o numero da NC (RN-11)
 *   (3)  RN-05 pernas na ordem inversa (almoxarifado -> gestao); quem fecha e quem executa
 *   (4)  as barreiras da Etapa 9 intactas (solicitante nao assina; mesma pessoa nas duas)
 *   (5)  RN-06 desbloqueio avulso no meio: 400 do motor, compensacao, carimbo nulo, NC pendente; e a
 *        RETENTATIVA (re-bloqueado) baixa — sem beco
 *   (6)  RN-06 NC cancelada: antes da 1a perna (literal da Fase 2) e entre as pernas (literal do
 *        contrato, com compensacao)
 *   (7)  RN-09 origem: area de sucata sem lote (estrita), endereco de entrada, area de sucata COM lote
 *   (8)  gate e recusas da rota: 403 COMPRAS/QUALIDADE, 404, Zod, e as portas 44/45 (niveis 9 e 10)
 *   (9)  pelo SERVICO (o chamador direto tambem baixa do bloqueado)
 *   (10) D7 legado: NC EXECUTADA sem movimentacao e aceita; a baixa preserva execucao_em/por
 *   (11) RN-07: depois do sucateamento, a devolucao de outra NC da mesma inspecao nao baixa
 *   (12) RN-02 pela rota do livro: o estorno da SUCATA do reprovado e recusado
 *   (13) D12: o sucateamento COMUM nao muda (baixa do disponivel; o (sem NC) da fila traz null)
 *
 * Executar: cd server && node tests/api/sucateamentoReprovado.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');
const scrap = require('../../services/almoxarifado/scrapDisposalService');
const stock = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 6930, nome: 'Admin E69', role: 'admin', is_superadmin: 1, email: 'admin69s@test.com' };
const QUALIDADE = { id: 6931, nome: 'Qualidade 69', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'q69s@test.com' };
const ALMOX1 = { id: 6932, nome: 'Almox Um 69', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'a1@test.com' };
const ALMOX2 = { id: 6933, nome: 'Almox Dois 69', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'a2@test.com' };
const GESTOR = { id: 6934, nome: 'Gestor 69', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'g69@test.com' };
const COMPRAS = { id: 6935, nome: 'Compras 69', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'c69s@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;
async function erroDe(fn) {
  try { await fn(); return null; } catch (e) { return { message: e.message, status: e.status }; }
}

(async () => {
  console.log('\n=== Etapa 69 T3: sucatear o reprovado pela NC ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });
  const como = (u) => setUser({ ...u });
  const API = '/api/almoxarifado';

  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn 69','69.693.690/0001-69','ativo')")).lastID;
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico','1')
    ON CONFLICT(chave) DO UPDATE SET valor='1'`);

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada,
      quantidade_atual - COALESCE(quantidade_bloqueada,0) AS livre FROM materiais_almoxarifado WHERE id = ?`, [id]);
  const linhaNc = (id) => dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);
  const linhaSuc = (id) => dbGet(db, 'SELECT * FROM sucateamentos_almoxarifado WHERE id = ?', [id]);
  const carimbo = async (inspId) => (await dbGet(db, 'SELECT sucateamento_em FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [inspId])).sucateamento_em;
  const sucatasDo = (materialId) => dbAll(db, "SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SUCATA' ORDER BY id", [materialId]);
  const saldoLote = async (materialId, loteId) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?`, [materialId, loteId])).q);
  const saldoEm = async (materialId, locId) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q
    FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?`, [materialId, locId])).q);

  /** O caminho REAL pelas rotas: recebe 10 de material critico, a QUALIDADE reprova `reprovada`. */
  async function reprovadoPelaRota({ reprovada = 3, comLote = false } = {}) {
    como(ADMIN);
    const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo,
      material_critico, controle_lote, controle_certificado) VALUES (?,?,'KG',0,1,1,?,?)`,
    [uniq('S69'), 'Chapa critica', comLote ? 1 : 0, comLote ? 1 : 0])).lastID;
    const loteCod = comLote ? uniq('L69') : undefined;
    const rec = await request(app).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: uniq('NF'), fornecedor_id: forn, fornecedor_nome: 'Forn 69',
      itens: [{ material_id: mat, quantidade: 10, ...(comLote ? { lote: loteCod } : {}) }],
    });
    assert.strictEqual(rec.status, 201, `receber: ${JSON.stringify(rec.body)}`);
    const ap = await request(app).post(`${API}/recebimentos/${rec.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const item = await dbGet(db, 'SELECT id, lote_id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.body.id]);
    como(QUALIDADE);
    const insp = await request(app).post(`${API}/recebimentos/itens/${item.id}/inspecionar`)
      .send({ quantidade_aprovada: 10 - reprovada, quantidade_reprovada: reprovada, dano_fisico: 1 });
    assert.strictEqual(insp.status, 201, `inspecionar: ${JSON.stringify(insp.body)}`);
    const lista = await request(app).get(`${API}/nao-conformidades?origem=INSPECAO&limite=500`);
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id);
    assert.ok(doc, 'a NC automatica nao nasceu');
    const dec = await request(app).post(`${API}/nao-conformidades/${doc.id}/decidir`)
      .send({ decisao: 'SUCATEAR', justificativa: 'trinca, sem recuperacao' });
    assert.strictEqual(dec.status, 200, `decidir: ${JSON.stringify(dec.body)}`);
    como(ADMIN);
    return { materialId: mat, inspecaoId: insp.body.id, ncId: doc.id, numero: doc.numero, loteId: item.lote_id, loteCod, recebimentoId: rec.body.id };
  }

  /** Fixture direta (para origem e casos de borda): inspecao e NC automatica sem passar pelo recebimento. */
  async function reprovadoDireto({ reprovada = 3, esperada = 10, comLote = false, entradaEm = null } = {}) {
    const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
      VALUES (?,?,'KG',0,1,?)`, [uniq('S69D'), 'Chapa', comLote ? 1 : 0])).lastID;
    const loteCod = comLote ? uniq('LD') : null;
    await stock.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: esperada, justificativa: 'carga',
      ...(loteCod ? { lote: loteCod } : {}), ...(entradaEm ? { localizacao_destino_id: entradaEm } : {}),
    });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'BLOQUEIO', quantidade: reprovada, justificativa: 'reprovado' });
    const loteId = loteCod ? (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [mat])).id : null;
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal) VALUES (?,?,?)',
      [uniq('REC69'), 'RECEBIDO', uniq('NF')])).lastID;
    const item = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote_id, lote, localizacao_entrada_id)
      VALUES (?,?,?,?,?,?,?)`, [rec, mat, esperada, esperada, loteId, loteCod, entradaEm])).lastID;
    const insp = (await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,0,?,?,?,?)`, [item, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome])).lastID;
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, insp);
    await nc.decidirNaoConformidade(db, QUALIDADE, doc.id, { decisao: 'SUCATEAR', justificativa: 'laudo' });
    return { materialId: mat, inspecaoId: insp, ncId: doc.id, numero: doc.numero, loteId, itemId: item, recebimentoId: rec };
  }

  async function solicitarRota(ncId, body = {}, user = ALMOX1) {
    como(user);
    const r = await request(app).post(`${API}/nao-conformidades/${ncId}/solicitar-sucateamento`)
      .send({ justificativa: 'reprovado na inspecao, sem recuperacao', ...body });
    como(ADMIN);
    return r;
  }
  async function perna(sucId, qual, user) {
    como(user);
    const r = await request(app).post(`${API}/sucateamentos/${sucId}/aprovar-${qual}`).send({});
    como(ADMIN);
    return r;
  }

  // ── (1) e (2) — o tipico, inteiro ─────────────────────────────────────────────────────────
  let tipico;
  await test('(1) RN-04 o tipico (critico, certificado, lote): recusa o lote bloqueado; liberado, 201 derivado e nada move', async () => {
    tipico = await reprovadoPelaRota({ comLote: true });
    const lote = await dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [tipico.loteId]);
    assert.strictEqual(lote.status, 'BLOQUEADO', 'o lote do critico com certificado nao nasceu bloqueado — o cenario nao e o tipico');
    const s0 = await saldos(tipico.materialId);
    assert.strictEqual(s0.quantidade_atual, 10);
    assert.strictEqual(s0.quantidade_bloqueada, 3);

    const r0 = await solicitarRota(tipico.ncId);
    assert.strictEqual(r0.status, 400, JSON.stringify(r0.body));
    assert.strictEqual(r0.body.error, `O lote ${tipico.loteCod} está bloqueado — o estoque não baixa lote fora de ATIVO, nem para sucata. Mude o status do lote antes de sucatear`);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM sucateamentos_almoxarifado WHERE nao_conformidade_id = ?', [tipico.ncId])).n, 0);

    como(QUALIDADE);
    const st = await request(app).put(`${API}/lotes/${tipico.loteId}/status`).send({ status: 'ATIVO', justificativa: 'certificado conferido' });
    assert.strictEqual(st.status, 200, JSON.stringify(st.body));

    // O body tenta mandar no material/quantidade/lote/status: tudo descartado.
    const r = await solicitarRota(tipico.ncId, {
      material_id: 1, quantidade: 99, lote_id: 1, status: 'APROVADO', aprovador_almox_id: 1, classificacao: 'aco carbono',
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.quantidade, 3, 'a quantidade nao e a reprovada inteira');
    assert.strictEqual(r.body.material_id, tipico.materialId);
    assert.strictEqual(r.body.lote_id, tipico.loteId);
    assert.strictEqual(r.body.nao_conformidade_id, tipico.ncId);
    assert.strictEqual(r.body.status, 'SOLICITADO');
    assert.strictEqual(r.body.aprovador_almox_id, null);
    assert.strictEqual(r.body.solicitante_id, ALMOX1.id);
    assert.strictEqual(r.body.classificacao, 'aco carbono');
    tipico.sucId = r.body.id;
    const s1 = await saldos(tipico.materialId);
    assert.strictEqual(s1.quantidade_atual, 10, 'a solicitacao moveu o fisico');
    assert.strictEqual(s1.quantidade_bloqueada, 3, 'a solicitacao moveu o bloqueado');

    const r2 = await solicitarRota(tipico.ncId, {}, ALMOX2);
    assert.strictEqual(r2.status, 409, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, `Já existe um sucateamento solicitado para esta não conformidade (SUC-${tipico.sucId}) — aprove ou rejeite esse antes`);
    const aud = await dbGet(db, "SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'sucateamento' AND entidade_id = ? AND acao = 'solicitar'", [tipico.sucId]);
    const dn = JSON.parse(aud.dados_novos);
    assert.strictEqual(dn.nao_conformidade_id, tipico.ncId);
    assert.strictEqual(dn.inspecao_id, tipico.inspecaoId);
    assert.strictEqual(dn.bloqueado_na_solicitacao, 3);
  });

  await test('(2) RN-05 gestao -> almoxarifado: baixa do bloqueado, lote, livro, NC executada, carimbo, fila', async () => {
    assert.ok(tipico && tipico.sucId, 'depende do (1)');
    const linhaLoteAntes = await saldoLote(tipico.materialId, tipico.loteId);
    const g = await perna(tipico.sucId, 'gestao', GESTOR);
    assert.strictEqual(g.status, 200, JSON.stringify(g.body));
    assert.strictEqual(g.body.baixa_emitida, false);
    assert.strictEqual((await saldos(tipico.materialId)).quantidade_bloqueada, 3, 'a primeira perna moveu');

    const a = await perna(tipico.sucId, 'almoxarifado', ALMOX2);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.strictEqual(a.body.baixa_emitida, true);
    const s = await saldos(tipico.materialId);
    assert.strictEqual(s.quantidade_bloqueada, 0, 'o reprovado continua bloqueado');
    assert.strictEqual(s.quantidade_atual, 7);
    assert.strictEqual(s.livre, 7, 'o APROVADO foi tocado');
    assert.strictEqual(await saldoLote(tipico.materialId, tipico.loteId), linhaLoteAntes - 3, 'a linha do lote nao foi debitada');

    const movs = await sucatasDo(tipico.materialId);
    assert.strictEqual(movs.length, 1);
    const m = movs[0];
    assert.strictEqual(m.quantidade, 3);
    assert.strictEqual(m.motivo, 'Sucateamento de material reprovado');
    assert.strictEqual(m.documento_vinculado, tipico.numero);
    assert.strictEqual(m.referencia, `SUC-${tipico.sucId}`);
    assert.strictEqual(m.lote_id, tipico.loteId);
    assert.strictEqual(m.id, a.body.movimentacao_sucata_id);

    const doc = await linhaNc(tipico.ncId);
    assert.strictEqual(doc.execucao_estado, 'EXECUTADA');
    assert.strictEqual(doc.execucao_movimentacao_id, m.id);
    assert.strictEqual(doc.execucao_por_id, ALMOX2.id, 'execucao_por = quem fechou a segunda perna');
    assert.ok(doc.execucao_em);
    assert.ok(await carimbo(tipico.inspecaoId), 'a inspecao nao foi carimbada');

    const fila = await request(app).get(`${API}/nao-conformidades?execucao=PENDENTE&limite=500`);
    assert.ok(!fila.body.itens.some((n) => n.id === tipico.ncId), 'a NC continua na fila de pendentes');
    const trilha = await dbGet(db, "SELECT dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'nao_conformidade' AND entidade_id = ? AND acao = 'NC_EXECUTADA'", [tipico.ncId]);
    assert.ok(trilha, 'sem trilha NC_EXECUTADA');

    const lista = await request(app).get(`${API}/sucateamentos`);
    const linha = lista.body.find((x) => x.id === tipico.sucId);
    assert.strictEqual(linha.nao_conformidade_id, tipico.ncId);
    assert.strictEqual(linha.nao_conformidade_numero, tipico.numero, 'RN-11: a fila nao traz o numero da NC');
  });

  await test('(2b) o destino final aceita o sucateamento ligado como o comum, e nao move saldo', async () => {
    assert.ok(tipico && tipico.sucId, 'depende do (2)');
    como(GESTOR);
    const d = await request(app).post(`${API}/sucateamentos/${tipico.sucId}/destino`).send({ destino: 'DESCARTADA' });
    como(ADMIN);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual(d.body.status, 'DESCARTADA');
    const s = await saldos(tipico.materialId);
    assert.strictEqual(s.quantidade_atual, 7);
    assert.strictEqual(s.quantidade_bloqueada, 0);
  });

  // ── (3) ───────────────────────────────────────────────────────────────────────────────────
  await test('(3) RN-05 almoxarifado -> gestao (ordem inversa): baixa igual, executado por quem fechou', async () => {
    const c = await reprovadoPelaRota({ reprovada: 4 });
    const r = await solicitarRota(c.ncId);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await perna(r.body.id, 'almoxarifado', ALMOX2)).status, 200);
    const g = await perna(r.body.id, 'gestao', GESTOR);
    assert.strictEqual(g.status, 200, JSON.stringify(g.body));
    assert.strictEqual(g.body.baixa_emitida, true);
    const s = await saldos(c.materialId);
    assert.strictEqual(s.quantidade_atual, 6);
    assert.strictEqual(s.quantidade_bloqueada, 0);
    assert.strictEqual((await linhaNc(c.ncId)).execucao_por_id, GESTOR.id);
  });

  // ── (4) ───────────────────────────────────────────────────────────────────────────────────
  await test('(4) as tres barreiras da Etapa 9 continuam (solicitante; mesma pessoa nas duas)', async () => {
    const c = await reprovadoPelaRota();
    const r = await solicitarRota(c.ncId, {}, ADMIN);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const proprio = await perna(r.body.id, 'gestao', ADMIN);
    assert.strictEqual(proprio.status, 403, `o solicitante assinou: ${JSON.stringify(proprio.body)}`);
    const c2 = await reprovadoPelaRota();
    const r2 = await solicitarRota(c2.ncId);
    const ADMIN2 = { id: 6939, nome: 'Admin Dois', role: 'admin', is_superadmin: 1, email: 'ad2@test.com' };
    assert.strictEqual((await perna(r2.body.id, 'gestao', ADMIN2)).status, 200);
    const dupla = await perna(r2.body.id, 'almoxarifado', ADMIN2);
    assert.strictEqual(dupla.status, 403, `a mesma pessoa assinou as duas: ${JSON.stringify(dupla.body)}`);
    assert.strictEqual((await saldos(c2.materialId)).quantidade_bloqueada, 3);
  });

  // ── (5) ───────────────────────────────────────────────────────────────────────────────────
  await test('(5) RN-06 desbloqueio avulso no meio: recusa, compensa, carimbo nulo; a retentativa baixa (sem beco)', async () => {
    const c = await reprovadoPelaRota();
    const r = await solicitarRota(c.ncId);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const d = await request(app).post(`${API}/materiais/${c.materialId}/desbloquear`).send({ quantidade: 2, justificativa: 'gestao liberou' });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual((await perna(r.body.id, 'gestao', GESTOR)).status, 200);
    const a = await perna(r.body.id, 'almoxarifado', ALMOX2);
    assert.strictEqual(a.status, 400, JSON.stringify(a.body));
    assert.strictEqual(a.body.error, 'Sucateamento acima do que está bloqueado: há 1 KG bloqueado(s) (físico: 10)');
    const suc = await linhaSuc(r.body.id);
    assert.strictEqual(suc.status, 'SOLICITADO', 'a assinatura nao foi desfeita');
    assert.strictEqual(suc.aprovador_almox_id, null);
    assert.strictEqual(suc.aprovador_gestao_id, GESTOR.id, 'a perna que nao errou foi apagada');
    assert.strictEqual(await carimbo(c.inspecaoId), null, 'o carimbo ficou — a retentativa toma 409 (beco)');
    assert.strictEqual((await linhaNc(c.ncId)).execucao_estado, 'PENDENTE');
    assert.strictEqual((await sucatasDo(c.materialId)).length, 0, 'o livro ganhou linha');
    const s = await saldos(c.materialId);
    assert.strictEqual(s.quantidade_atual, 10);
    assert.strictEqual(s.quantidade_bloqueada, 1);

    // Sem beco: re-bloqueado, a retentativa da mesma perna baixa.
    const b = await request(app).post(`${API}/materiais/${c.materialId}/bloquear`).send({ quantidade: 2, justificativa: 'volta ao bloqueio' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    const a2 = await perna(r.body.id, 'almoxarifado', ALMOX2);
    assert.strictEqual(a2.status, 200, `retentativa: ${JSON.stringify(a2.body)}`);
    assert.strictEqual((await saldos(c.materialId)).quantidade_bloqueada, 0);
  });

  // ── (6) ───────────────────────────────────────────────────────────────────────────────────
  await test('(6) RN-06 NC cancelada antes da 1a perna e entre as pernas: recusa, nada baixa', async () => {
    const c = await reprovadoPelaRota();
    const r = await solicitarRota(c.ncId);
    como(QUALIDADE);
    const canc = await request(app).post(`${API}/nao-conformidades/${c.ncId}/cancelar`).send({ motivo: 'decisao revista pela engenharia' });
    como(ADMIN);
    assert.strictEqual(canc.status, 200, JSON.stringify(canc.body));
    const p1 = await perna(r.body.id, 'gestao', GESTOR);
    assert.strictEqual(p1.status, 400, JSON.stringify(p1.body));
    assert.strictEqual(p1.body.error, 'A não conformidade foi cancelada — recuse este sucateamento.');
    assert.strictEqual((await linhaSuc(r.body.id)).aprovador_gestao_id, null);

    const c2 = await reprovadoPelaRota();
    const r2 = await solicitarRota(c2.ncId);
    assert.strictEqual((await perna(r2.body.id, 'gestao', GESTOR)).status, 200);
    como(QUALIDADE);
    assert.strictEqual((await request(app).post(`${API}/nao-conformidades/${c2.ncId}/cancelar`).send({ motivo: 'decisao revista pela engenharia' })).status, 200);
    como(ADMIN);
    const p2 = await perna(r2.body.id, 'almoxarifado', ALMOX2);
    assert.strictEqual(p2.status, 400, JSON.stringify(p2.body));
    assert.strictEqual(p2.body.error, `A não conformidade ${c2.numero} foi cancelada — o sucateamento não baixa material de documento cancelado`);
    const suc = await linhaSuc(r2.body.id);
    assert.strictEqual(suc.status, 'SOLICITADO');
    assert.strictEqual(suc.aprovador_almox_id, null);
    assert.strictEqual(await carimbo(c2.inspecaoId), null);
    assert.strictEqual((await saldos(c2.materialId)).quantidade_bloqueada, 3);
    const comp = await dbGet(db, "SELECT justificativa FROM auditoria_log_almoxarifado WHERE entidade = 'sucateamento' AND entidade_id = ? AND acao = 'compensacao'", [r2.body.id]);
    assert.ok(comp && /cancelada/.test(comp.justificativa), `a compensacao nao diz a causa real: ${comp && comp.justificativa}`);
    // E a saida: rejeitar o sucateamento continua possivel.
    como(GESTOR);
    assert.strictEqual((await request(app).post(`${API}/sucateamentos/${r2.body.id}/rejeitar`).send({ motivo: 'NC cancelada' })).status, 200);
    como(ADMIN);
  });

  // ── (7) RN-09 origem ──────────────────────────────────────────────────────────────────────
  const loc = async (tipo) => (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, tipo, ativo) VALUES (?,?,1)', [uniq('LOC69'), tipo])).lastID;
  async function sucatearDireto(c) {
    const s = await scrap.solicitarDoReprovado(db, ALMOX1, c.ncId, { justificativa: 'reprovado' });
    await scrap.aprovar(db, GESTOR, s.id, 'gestao');
    const r = await scrap.aprovar(db, ALMOX2, s.id, 'almoxarifado');
    return dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [r.movimentacao_sucata_id]);
  }
  await test('(7a) RN-09 sem lote, reprovado transferido inteiro para a area de sucata S: origem S (estrita)', async () => {
    const E = await loc('Prateleira'); const S = await loc('Área de sucata');
    const c = await reprovadoDireto({ entradaEm: E });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'TRANSFERENCIA', quantidade: 3,
      localizacao_origem_id: E, localizacao_destino_id: S, justificativa: 'para a cacamba' });
    const m = await sucatearDireto(c);
    assert.strictEqual(m.localizacao_origem_id, S, `origem ${m.localizacao_origem_id}`);
    assert.strictEqual(await saldoEm(c.materialId, S), 0);
    assert.strictEqual(await saldoEm(c.materialId, E), 7);
  });
  await test('(7b) RN-09 sem area, entrada do item no endereco E: origem E', async () => {
    const outro = await loc('Prateleira'); const E = await loc('Prateleira');
    const c = await reprovadoDireto({ entradaEm: E });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'ENTRADA', quantidade: 5,
      localizacao_destino_id: outro, justificativa: 'outro endereco' });
    const m = await sucatearDireto(c);
    assert.strictEqual(m.localizacao_origem_id, E, `origem ${m.localizacao_origem_id}`);
    assert.strictEqual(await saldoEm(c.materialId, E), 7);
    assert.strictEqual(await saldoEm(c.materialId, outro), 5);
  });
  await test('(7c) RN-09 com lote: transferido para a area S, a baixa sai de S (a area considera o lote); sem transferir, de E', async () => {
    const E = await loc('Prateleira'); const S = await loc('Área de sucata');
    const c = await reprovadoDireto({ comLote: true, entradaEm: E });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'TRANSFERENCIA', quantidade: 3, lote_id: c.loteId,
      localizacao_origem_id: E, localizacao_destino_id: S, justificativa: 'para a cacamba' }, { exigeLote: true });
    const m = await sucatearDireto(c);
    assert.strictEqual(m.localizacao_origem_id, S, `origem ${m.localizacao_origem_id}`);
    assert.strictEqual(m.lote_id, c.loteId);
    assert.strictEqual(await saldoEm(c.materialId, S), 0, 'o saldo do lote na area de sucata nao saiu');
    assert.strictEqual(await saldoEm(c.materialId, E), 7);

    const E2 = await loc('Prateleira');
    const c2 = await reprovadoDireto({ comLote: true, entradaEm: E2 });
    const m2 = await sucatearDireto(c2);
    assert.strictEqual(m2.localizacao_origem_id, E2);
  });

  // ── (8) gate e recusas pela rota ──────────────────────────────────────────────────────────
  await test('(8) a rota: 403 COMPRAS/QUALIDADE, 404, Zod; portas 44/45 (devolvido, liberado)', async () => {
    const c = await reprovadoDireto();
    for (const u of [COMPRAS, QUALIDADE]) {
      const r = await solicitarRota(c.ncId, {}, u);
      assert.strictEqual(r.status, 403, `${u.perfil_almoxarifado}: ${r.status}`);
    }
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM sucateamentos_almoxarifado WHERE nao_conformidade_id = ?', [c.ncId])).n, 0);
    const r404 = await solicitarRota(999999);
    assert.strictEqual(r404.status, 404);
    assert.strictEqual(r404.body.error, 'Não conformidade não encontrada');
    const rAbc = await solicitarRota('abc');
    assert.strictEqual(rAbc.status, 404);
    const rz = await solicitarRota(c.ncId, { justificativa: '   ' });
    assert.strictEqual(rz.status, 400);
    assert.ok(/justificativa é obrigatória para sucatear/.test(JSON.stringify(rz.body)), JSON.stringify(rz.body));

    await dbRun(db, 'UPDATE inspecoes_recebimento_almoxarifado SET devolucao_fornecedor_em = CURRENT_TIMESTAMP WHERE id = ?', [c.inspecaoId]);
    const rd = await solicitarRota(c.ncId);
    assert.strictEqual(rd.status, 400);
    assert.strictEqual(rd.body.error, 'O material desta inspeção já havia sido devolvido ao fornecedor');
    await dbRun(db, 'UPDATE inspecoes_recebimento_almoxarifado SET devolucao_fornecedor_em = NULL, liberacao_nc_em = CURRENT_TIMESTAMP WHERE id = ?', [c.inspecaoId]);
    const rl = await solicitarRota(c.ncId);
    assert.strictEqual(rl.status, 400);
    assert.strictEqual(rl.body.error, 'O material desta inspeção já havia sido liberado por outra não conformidade');
    // Metade positiva: limpo o carimbo, aceita.
    await dbRun(db, 'UPDATE inspecoes_recebimento_almoxarifado SET liberacao_nc_em = NULL WHERE id = ?', [c.inspecaoId]);
    assert.strictEqual((await solicitarRota(c.ncId)).status, 201);
  });

  // ── (9) pelo servico ──────────────────────────────────────────────────────────────────────
  await test('(9) pelo SERVICO: solicitarDoReprovado + aprovar baixam do bloqueado; justificativa vazia recusa', async () => {
    const c = await reprovadoDireto({ reprovada: 2 });
    const e = await erroDe(() => scrap.solicitarDoReprovado(db, ALMOX1, c.ncId, { justificativa: ' ' }));
    assert.ok(e && e.status === 400 && /Justificativa e obrigatoria para sucatear/.test(e.message), JSON.stringify(e));
    await sucatearDireto(c);
    const s = await saldos(c.materialId);
    assert.strictEqual(s.quantidade_atual, 8);
    assert.strictEqual(s.quantidade_bloqueada, 0);
    assert.strictEqual((await linhaNc(c.ncId)).execucao_estado, 'EXECUTADA');
  });

  // ── (10) D7 legado ────────────────────────────────────────────────────────────────────────
  await test('(10) D7 NC legada EXECUTADA sem movimentacao: aceita; a baixa preserva execucao_em e execucao_por', async () => {
    const c = await reprovadoDireto();
    await dbRun(db, `UPDATE nao_conformidades_almoxarifado SET execucao_estado = 'EXECUTADA',
      execucao_em = '2026-01-02 03:04:05', execucao_por_id = 4242, execucao_por_nome = 'Quem registrou antes' WHERE id = ?`, [c.ncId]);
    const r = await solicitarRota(c.ncId);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await perna(r.body.id, 'gestao', GESTOR)).status, 200);
    assert.strictEqual((await perna(r.body.id, 'almoxarifado', ALMOX2)).status, 200);
    const doc = await linhaNc(c.ncId);
    assert.strictEqual(doc.execucao_em, '2026-01-02 03:04:05', 'o legado perdeu a data');
    assert.strictEqual(doc.execucao_por_id, 4242, 'o legado perdeu o autor');
    assert.strictEqual(doc.execucao_por_nome, 'Quem registrou antes');
    assert.ok(doc.execucao_movimentacao_id, 'a movimentacao nao foi gravada');
    assert.strictEqual((await saldos(c.materialId)).quantidade_bloqueada, 0);
    // E agora a solicitacao recusa (nivel 5).
    const r2 = await solicitarRota(c.ncId);
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.body.error, 'O material desta não conformidade já saiu do estoque');
  });

  // ── (11) RN-07 ────────────────────────────────────────────────────────────────────────────
  await test('(11) RN-07 depois do sucateamento, a devolucao de outra NC da mesma inspecao nao baixa', async () => {
    const c = await reprovadoDireto({ reprovada: 3 });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'ENTRADA', quantidade: 5, justificativa: 'outra carga' });
    await stock.registrarMovimentacao(db, ADMIN, { material_id: c.materialId, tipo: 'BLOQUEIO', quantidade: 5, justificativa: 'outra origem' });
    // A segunda NC da mesma inspecao (tipo diferente, aberta como automatica), decidida DEVOLVER.
    const dev = await dbRun(db, `INSERT INTO nao_conformidades_almoxarifado (numero, origem, referencia_tipo, referencia_id,
      tipo, status, material_id, recebimento_id, aberto_automaticamente, decisao, justificativa, decidido_em, execucao_estado)
      VALUES (?, 'INSPECAO', 'INSPECAO', ?, 'MATERIAL_INCORRETO', 'DECIDIDA', ?, ?, 1, 'DEVOLVER', 'x', CURRENT_TIMESTAMP, 'PENDENTE')`,
    [uniq('NC-69X'), c.inspecaoId, c.materialId, c.recebimentoId]);
    await sucatearDireto(c);
    const antes = await saldos(c.materialId);
    assert.strictEqual(antes.quantidade_bloqueada, 5);
    const res = await nc.registrarExecucao(db, COMPRAS, dev.lastID, { observacoes: 'coleta' });
    assert.strictEqual(res.execucao.efeito, 'SEM_SALDO');
    assert.strictEqual(res.execucao.mensagem, 'O material desta inspeção já havia sido sucateado — a execução foi registrada sem mover saldo');
    const depois = await saldos(c.materialId);
    assert.strictEqual(depois.quantidade_atual, antes.quantidade_atual, 'a devolucao baixou de novo o que ja foi para a cacamba');
    assert.strictEqual(depois.quantidade_bloqueada, 5, 'a devolucao consumiu a retencao de outra origem');
  });

  // ── (12) ──────────────────────────────────────────────────────────────────────────────────
  await test('(12) RN-02 o estorno da SUCATA do reprovado pela rota do livro e recusado', async () => {
    assert.ok(tipico && tipico.sucId, 'depende do (2)');
    const suc = await linhaSuc(tipico.sucId);
    const r = await request(app).post(`${API}/movimentacoes/${suc.movimentacao_sucata_id}/cancelar`).send({ motivo: 'engano' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/Sucateamento de material reprovado não pode ser estornado pelo livro/.test(r.body.error), r.body.error);
    const s = await saldos(tipico.materialId);
    assert.strictEqual(s.quantidade_atual, 7);
    assert.strictEqual(s.quantidade_bloqueada, 0);
  });

  // ── (13) D12 ──────────────────────────────────────────────────────────────────────────────
  await test('(13) D12 o sucateamento COMUM nao muda: baixa do disponivel e a fila traz NC null', async () => {
    const c = await reprovadoDireto({ reprovada: 3 });
    como(ALMOX1);
    const r = await request(app).post(`${API}/sucateamentos`).send({ material_id: c.materialId, quantidade: 2, justificativa: 'sobra' });
    como(ADMIN);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.nao_conformidade_id, null);
    await perna(r.body.id, 'gestao', GESTOR);
    await perna(r.body.id, 'almoxarifado', ALMOX2);
    const s = await saldos(c.materialId);
    assert.strictEqual(s.quantidade_atual, 8);
    assert.strictEqual(s.quantidade_bloqueada, 3, 'o comum baixou do bloqueado');
    const lista = await request(app).get(`${API}/sucateamentos`);
    const linha = lista.body.find((x) => x.id === r.body.id);
    assert.strictEqual(linha.nao_conformidade_numero, null);
    assert.strictEqual(linha.nao_conformidade_id, null);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
