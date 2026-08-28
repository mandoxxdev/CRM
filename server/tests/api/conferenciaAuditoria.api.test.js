/**
 * Etapa 18, Task 1 — RN-01/RN-02/RN-03/RN-04: a conferencia de inventario passa a deixar rastro.
 *
 * Ate aqui, abrir/contar/recontar/concluir/cancelar uma conferencia nao gerava UMA linha de
 * auditoria — o bloco `/conferencias` e o unico fluxo grande do modulo sem servico proprio e
 * `registrarAuditoria` nunca era chamado ali. O cancelamento era o pior: `UPDATE ... SET
 * status='CANCELADO'` sem autor, sem data, sem motivo.
 *
 * O que este arquivo congela:
 *  - RN-01: os 5 atos geram `entidade='conferencia'` com autor e `entidade_id` — INCLUSIVE a
 *    conferencia que nasce sem NENHUM item (o ramo "zero materiais" responde 201 antes do laco
 *    de itens; a versao original do design pulava esse caso e furava a propria RN-01).
 *  - RN-02: auditoria quebrada NAO derruba o ato. So e afericao de verdade porque a rota passou
 *    a usar `audit.registrarAuditoria(...)` (objeto do modulo) em vez do binding desestruturado:
 *    com `const { registrarAuditoria } = require(...)` o stub abaixo nunca pegaria e este teste
 *    passaria verde sem provar nada (teste vazio).
 *  - RN-03: cancelar exige motivo (>= 5), so vale em ABERTO (400 com o MESMO literal das duas
 *    rotas irmas — nao 409: no modulo 409 e reservado a unicidade/corrida) e id inexistente
 *    passa a devolver 404.
 *  - RN-04: a contagem que sobrescreve a anterior guarda o de/para em `dados_anteriores` — a
 *    unica memoria do valor que evapora. O ramo "correcao do proprio contador" SO existe com
 *    `dupla_contagem`; sem a flag, a segunda contagem do mesmo usuario cai em RECONTAGEM.
 *
 * Asserções sempre por entidade + acao + entidade_id, nunca por contagem global da tabela.
 *
 * Executar: cd server && node tests/api/conferenciaAuditoria.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const auditModule = require('../../services/almoxarifado/audit');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, categoria = null, custo = 10 } = {}) {
  seq += 1;
  const codigo = `AUD-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
     (codigo, nome, unidade, quantidade_atual, custo_unitario, categoria, ativo)
     VALUES (?,?,'UN',?,?,?,1)`, [codigo, `Material Auditoria ${seq}`, qtd, custo, categoria]);
  return { id: r.lastID, codigo };
}

async function abrirConferencia(app, body = {}) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function itemDoMaterial(db, confId, materialId) {
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
    [confId, materialId]);
  assert.ok(item, 'item nao encontrado na conferencia');
  return item;
}

// Sempre por entidade + acao + entidade_id (nunca contagem global): o banco do harness e
// compartilhado entre os casos deste arquivo.
async function auditorias(db, confId, acao) {
  const sql = `SELECT * FROM auditoria_log_almoxarifado
               WHERE entidade = 'conferencia' AND entidade_id = ?${acao ? ' AND acao = ?' : ''}
               ORDER BY id`;
  const rows = await dbAll(db, sql, acao ? [confId, acao] : [confId]);
  return rows.map((r) => ({
    ...r,
    dados_anteriores: r.dados_anteriores ? JSON.parse(r.dados_anteriores) : null,
    dados_novos: r.dados_novos ? JSON.parse(r.dados_novos) : null,
  }));
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // ── Cenario 1: RN-01 criar (ramo normal E ramo de ZERO materiais) ────────────────────────
  await test('RN-01 criar: POST /conferencias audita CRIACAO com autor, entidade_id e total_itens', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-CRIAR';
    await novoMaterial(db, { qtd: 100, categoria });
    await novoMaterial(db, { qtd: 50, categoria });

    const conf = await abrirConferencia(app, { categoria, modo_cego: true, tolerancia_percentual: 7 });

    const linhas = await auditorias(db, conf.id, 'CRIACAO');
    assert.strictEqual(linhas.length, 1, `esperava 1 CRIACAO, veio ${linhas.length}`);
    const [log] = linhas;
    assert.strictEqual(log.usuario_id, ADMIN.id);
    assert.strictEqual(log.usuario_nome, ADMIN.nome);
    assert.strictEqual(log.entidade_id, conf.id);
    assert.strictEqual(log.dados_novos.numero, conf.numero);
    assert.strictEqual(log.dados_novos.total_itens, 2);
    assert.strictEqual(log.dados_novos.escopo_descricao, `Categoria: ${categoria}`);
    assert.strictEqual(log.dados_novos.modo_cego, 1);
    assert.strictEqual(log.dados_novos.dupla_contagem, 0);
    assert.strictEqual(log.dados_novos.tolerancia_percentual, 7);
    // `tipo` e a 3a coluna morta da tabela (DEFAULT 'GERAL', nunca escrita) — nao entra no log.
    assert.ok(!('tipo' in log.dados_novos), 'tipo nao deve entrar no log (coluna morta)');
  });

  await test('RN-01 criar: conferencia com ZERO materiais tambem audita (ramo que retorna 201 antes do laco)', async () => {
    setUser(ADMIN);
    const conf = await abrirConferencia(app, { categoria: 'CAT-AUD-INEXISTENTE-XYZ' });
    assert.strictEqual(conf.totalItens, 0, 'o cenario exige o ramo de zero materiais');

    const linhas = await auditorias(db, conf.id, 'CRIACAO');
    assert.strictEqual(linhas.length, 1, 'o ramo de zero materiais tem de auditar (RN-01)');
    assert.strictEqual(linhas[0].dados_novos.total_itens, 0);
    assert.strictEqual(linhas[0].dados_novos.numero, conf.numero);
    assert.strictEqual(linhas[0].usuario_id, ADMIN.id);
  });

  // ── Cenario 2: RN-01 contar + RN-04 correcao guarda o de/para ────────────────────────────
  await test('RN-01/RN-04 contar: primeira contagem audita CONTAGEM sem de/para; correcao do proprio contador guarda o anterior', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-CONTAR';
    const mat = await novoMaterial(db, { qtd: 100, categoria });
    // dupla_contagem OBRIGATORIA: o ramo "correcao do primeiro contador" so existe com a flag
    // (ehCorrecaoDoPrimeiro = conf.dupla_contagem && ehPrimeiroContador && !item.recontado).
    const conf = await abrirConferencia(app, { categoria, dupla_contagem: true, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);

    const primeira = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 90 });
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));
    assert.strictEqual(primeira.body.recontagem, false);

    let contagens = await auditorias(db, conf.id, 'CONTAGEM');
    assert.strictEqual(contagens.length, 1, `esperava 1 CONTAGEM, veio ${contagens.length}`);
    assert.strictEqual(contagens[0].usuario_id, ADMIN.id);
    assert.strictEqual(contagens[0].dados_anteriores, null, 'primeira contagem nao tem de/para');
    assert.strictEqual(contagens[0].dados_novos.conferencia_numero, conf.numero);
    assert.strictEqual(contagens[0].dados_novos.material_codigo, mat.codigo);
    assert.strictEqual(contagens[0].dados_novos.item_id, item.id);
    assert.strictEqual(contagens[0].dados_novos.quantidade_sistema, 100);
    assert.strictEqual(contagens[0].dados_novos.quantidade_contada, 90);
    assert.strictEqual(contagens[0].dados_novos.divergencia, -10);

    // Correcao do PROPRIO contador (ninguem recontou ainda): continua CONTAGEM, agora com de/para.
    const correcao = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 95 });
    assert.strictEqual(correcao.status, 200, JSON.stringify(correcao.body));
    assert.strictEqual(correcao.body.recontagem, false, 'correcao do primeiro contador nao e recontagem');

    contagens = await auditorias(db, conf.id, 'CONTAGEM');
    assert.strictEqual(contagens.length, 2, `esperava 2 CONTAGEM, veio ${contagens.length}`);
    const corr = contagens[1];
    assert.ok(corr.dados_anteriores, 'RN-04: a correcao TEM de guardar o de/para');
    assert.strictEqual(corr.dados_anteriores.quantidade_contada, 90);
    assert.strictEqual(corr.dados_anteriores.contado_por_nome, ADMIN.nome);
    assert.strictEqual(corr.dados_novos.quantidade_contada, 95);
    assert.strictEqual(corr.dados_novos.divergencia, -5);
  });

  // ── Cenario 3: RN-01 recontar ────────────────────────────────────────────────────────────
  await test('RN-01 recontar: contagem de OUTRA pessoa audita RECONTAGEM com de/para e recontado_por_nome', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-RECONTAR';
    const mat = await novoMaterial(db, { qtd: 100, categoria });
    const conf = await abrirConferencia(app, { categoria, dupla_contagem: true, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);

    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 80 });

    setUser(GESTOR);
    const reconta = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 85 });
    assert.strictEqual(reconta.status, 200, JSON.stringify(reconta.body));
    assert.strictEqual(reconta.body.recontagem, true);

    const recontagens = await auditorias(db, conf.id, 'RECONTAGEM');
    assert.strictEqual(recontagens.length, 1, `esperava 1 RECONTAGEM, veio ${recontagens.length}`);
    const [log] = recontagens;
    assert.strictEqual(log.usuario_id, GESTOR.id);
    assert.strictEqual(log.usuario_nome, GESTOR.nome);
    assert.strictEqual(log.dados_anteriores.quantidade_contada, 80);
    assert.strictEqual(log.dados_anteriores.contado_por_nome, ADMIN.nome);
    assert.strictEqual(log.dados_novos.quantidade_contada, 85);
    assert.strictEqual(log.dados_novos.recontado_por_nome, GESTOR.nome);
    assert.strictEqual(log.dados_novos.material_codigo, mat.codigo);
    assert.strictEqual(log.dados_novos.conferencia_numero, conf.numero);
  });

  await test('RN-01 recontar: SEM dupla_contagem, a 2a contagem do MESMO usuario cai em RECONTAGEM (comportamento real)', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-RECONTAR-SEM-FLAG';
    const mat = await novoMaterial(db, { qtd: 100, categoria });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);

    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 70 });
    const segunda = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 75 });
    assert.strictEqual(segunda.body.recontagem, true, 'sem a flag, a 2a contagem do mesmo usuario JA e recontagem');

    const contagens = await auditorias(db, conf.id, 'CONTAGEM');
    const recontagens = await auditorias(db, conf.id, 'RECONTAGEM');
    assert.strictEqual(contagens.length, 1, 'so a primeira e CONTAGEM');
    assert.strictEqual(recontagens.length, 1, 'a segunda e RECONTAGEM — nao afirmar "colega": e o mesmo usuario');
    assert.strictEqual(recontagens[0].usuario_id, ADMIN.id);
    assert.strictEqual(recontagens[0].dados_novos.recontado_por_nome, ADMIN.nome);
    assert.strictEqual(recontagens[0].dados_anteriores.quantidade_contada, 70);
  });

  // ── Cenario 4: RN-01 concluir ────────────────────────────────────────────────────────────
  await test('RN-01 concluir COM ajuste: audita CONCLUSAO com ajustesAplicados, impactoFinanceiro e justificativa', async () => {
    setUser(GESTOR); // GESTOR tem ajustar_estoque
    const categoria = 'CAT-AUD-CONCLUIR-COM';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 90 });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Diferenca confirmada na contagem fisica' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await auditorias(db, conf.id, 'CONCLUSAO');
    assert.strictEqual(linhas.length, 1, `esperava 1 CONCLUSAO, veio ${linhas.length}`);
    const [log] = linhas;
    assert.strictEqual(log.usuario_id, GESTOR.id);
    assert.strictEqual(log.usuario_nome, GESTOR.nome);
    assert.strictEqual(log.dados_novos.numero, conf.numero);
    assert.strictEqual(log.dados_novos.aplicar_ajustes, true);
    assert.strictEqual(log.dados_novos.ajustesAplicados, 1);
    assert.strictEqual(log.dados_novos.impactoFinanceiro, 100); // |−10| * custo 10
    assert.strictEqual(log.dados_novos.itens_contados, 1);
    assert.strictEqual(log.dados_novos.itens_divergentes, 1);
    assert.strictEqual(log.dados_novos.tolerancia_percentual, 100000);
    assert.strictEqual(log.dados_novos.modo_cego, 0);
    assert.strictEqual(log.dados_novos.dupla_contagem, 0);
    assert.strictEqual(log.justificativa, 'Diferenca confirmada na contagem fisica');
  });

  await test('RN-01 concluir SEM ajuste: audita CONCLUSAO com aplicar_ajustes false e justificativa nula', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-CONCLUIR-SEM';
    const mat = await novoMaterial(db, { qtd: 100, categoria, custo: 10 });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const item = await itemDoMaterial(db, conf.id, mat.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
      .send({ quantidade_contada: 95 });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await auditorias(db, conf.id, 'CONCLUSAO');
    assert.strictEqual(linhas.length, 1, 'concluir sem ajuste TAMBEM deixa rastro (era o caso sem vestigio nenhum)');
    assert.strictEqual(linhas[0].dados_novos.aplicar_ajustes, false);
    assert.strictEqual(linhas[0].dados_novos.ajustesAplicados, 0);
    assert.strictEqual(linhas[0].dados_novos.itens_divergentes, 1, 'divergente contado mesmo sem aplicar');
    assert.strictEqual(linhas[0].justificativa, null);
    assert.strictEqual(linhas[0].usuario_id, ADMIN.id);
  });

  // ── Cenario 5: RN-03 cancelar ────────────────────────────────────────────────────────────
  await test('RN-03 cancelar: sem motivo -> 400 literal, status intacto e ZERO linha de auditoria', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-CANCELAR-SEM-MOTIVO';
    await novoMaterial(db, { qtd: 10, categoria });
    const conf = await abrirConferencia(app, { categoria });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/cancelar`).send({});
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Motivo do cancelamento deve ter pelo menos 5 caracteres');

    const depois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(depois.status, 'ABERTO', 'status nao pode mudar sem motivo');
    assert.strictEqual((await auditorias(db, conf.id, 'CANCELAMENTO')).length, 0, 'nenhuma auditoria "de tentativa"');
  });

  await test('RN-03 cancelar: motivo com 3 caracteres -> 400 (regua de 5, mesma da justificativa de ajuste)', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-CANCELAR-CURTO';
    await novoMaterial(db, { qtd: 10, categoria });
    const conf = await abrirConferencia(app, { categoria });

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/cancelar`).send({ motivo: 'abc' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Motivo do cancelamento deve ter pelo menos 5 caracteres');
    const depois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(depois.status, 'ABERTO');
  });

  await test('RN-03 cancelar: ABERTA com motivo -> 200, as 4 colunas gravadas e CANCELAMENTO com numero e itens_contados', async () => {
    setUser(GESTOR);
    const categoria = 'CAT-AUD-CANCELAR-OK';
    const matA = await novoMaterial(db, { qtd: 10, categoria });
    await novoMaterial(db, { qtd: 20, categoria });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const itemA = await itemDoMaterial(db, conf.id, matA.id);
    await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${itemA.id}`)
      .send({ quantidade_contada: 9 }); // so UM dos dois itens contado

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/cancelar`)
      .send({ motivo: 'Inventario refeito na proxima semana' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true, 'resposta de sucesso inalterada');

    const depois = await dbGet(db, `SELECT status, cancelado_por_id, cancelado_por_nome, cancelado_em, motivo_cancelamento
                                    FROM conferencias_almoxarifado WHERE id = ?`, [conf.id]);
    assert.strictEqual(depois.status, 'CANCELADO');
    assert.strictEqual(depois.cancelado_por_id, GESTOR.id);
    assert.strictEqual(depois.cancelado_por_nome, GESTOR.nome);
    assert.ok(depois.cancelado_em, 'cancelado_em tem de ser gravado');
    assert.strictEqual(depois.motivo_cancelamento, 'Inventario refeito na proxima semana');

    const linhas = await auditorias(db, conf.id, 'CANCELAMENTO');
    assert.strictEqual(linhas.length, 1, `esperava 1 CANCELAMENTO, veio ${linhas.length}`);
    const [log] = linhas;
    assert.strictEqual(log.usuario_id, GESTOR.id);
    assert.strictEqual(log.usuario_nome, GESTOR.nome);
    assert.strictEqual(log.dados_anteriores.status, 'ABERTO');
    assert.strictEqual(log.dados_novos.numero, conf.numero);
    assert.strictEqual(log.dados_novos.itens_contados, 1, 'so um dos dois itens foi contado');
    assert.strictEqual(log.justificativa, 'Inventario refeito na proxima semana');
  });

  await test('RN-03 cancelar: CONCLUIDA -> 400 com o MESMO literal das rotas irmas (nao 409)', async () => {
    setUser(ADMIN);
    const categoria = 'CAT-AUD-CANCELAR-CONCLUIDA';
    await novoMaterial(db, { qtd: 10, categoria });
    const conf = await abrirConferencia(app, { categoria, tolerancia_percentual: 100000 });
    const concluir = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
    assert.strictEqual(concluir.status, 200, JSON.stringify(concluir.body));

    const res = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/cancelar`)
      .send({ motivo: 'Tentando cancelar depois de concluir' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Conferência não está aberta (status atual: CONCLUIDO)');

    const depois = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
    assert.strictEqual(depois.status, 'CONCLUIDO', 'conferencia concluida nao pode ser cancelada');
    assert.strictEqual((await auditorias(db, conf.id, 'CANCELAMENTO')).length, 0);
  });

  await test('RN-03 cancelar: id inexistente -> 404 literal (hoje devolvia 400 generico)', async () => {
    setUser(ADMIN);
    const res = await request(app).put('/api/almoxarifado/conferencias/999888/cancelar')
      .send({ motivo: 'Conferencia que nao existe' });
    assert.strictEqual(res.status, 404, `esperava 404, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.error, 'Conferência não encontrada');
  });

  // ── Cenario 6: RN-02 auditoria quebrada nao derruba o ato ────────────────────────────────
  await test('RN-02: com registrarAuditoria lancando, criar/contar/concluir/cancelar respondem normal e gravam tudo', async () => {
    const original = auditModule.registrarAuditoria;
    // Substituicao no OBJETO do modulo: so alcanca as rotas que chamam `audit.registrarAuditoria`
    // (resolvido na chamada). Se o arquivo de rotas voltar ao binding desestruturado, este teste
    // vira vazio — passaria verde sem nunca derrubar auditoria nenhuma.
    auditModule.registrarAuditoria = () => { throw new Error('auditoria fora do ar (stub)'); };
    try {
      setUser(GESTOR);
      const categoria = 'CAT-AUD-RN02';
      const mat = await novoMaterial(db, { qtd: 100, categoria, custo: 10 });

      // criar
      const criar = await request(app).post('/api/almoxarifado/conferencias')
        .send({ categoria, tolerancia_percentual: 100000 });
      assert.strictEqual(criar.status, 201, `criar deveria responder 201: ${JSON.stringify(criar.body)}`);
      const conf = criar.body;
      const confDb = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
      assert.strictEqual(confDb.status, 'ABERTO', 'a conferencia tem de existir mesmo com auditoria quebrada');

      // contar
      const item = await itemDoMaterial(db, conf.id, mat.id);
      const contar = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/item/${item.id}`)
        .send({ quantidade_contada: 90 });
      assert.strictEqual(contar.status, 200, `contar deveria responder 200: ${JSON.stringify(contar.body)}`);
      const itemDb = await dbGet(db, 'SELECT quantidade_contada FROM itens_conferencia_almoxarifado WHERE id = ?', [item.id]);
      assert.strictEqual(Number(itemDb.quantidade_contada), 90, 'a contagem tem de ficar gravada');

      // concluir
      const concluir = await request(app).put(`/api/almoxarifado/conferencias/${conf.id}/concluir`).send({});
      assert.strictEqual(concluir.status, 200, `concluir deveria responder 200: ${JSON.stringify(concluir.body)}`);
      const confConcluida = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [conf.id]);
      assert.strictEqual(confConcluida.status, 'CONCLUIDO');

      // cancelar (outra conferencia, ainda ABERTO)
      const categoriaCancel = 'CAT-AUD-RN02-CANCEL';
      await novoMaterial(db, { qtd: 5, categoria: categoriaCancel });
      const outra = await request(app).post('/api/almoxarifado/conferencias').send({ categoria: categoriaCancel });
      assert.strictEqual(outra.status, 201, JSON.stringify(outra.body));
      const cancelar = await request(app).put(`/api/almoxarifado/conferencias/${outra.body.id}/cancelar`)
        .send({ motivo: 'Cancelada com auditoria fora do ar' });
      assert.strictEqual(cancelar.status, 200, `cancelar deveria responder 200: ${JSON.stringify(cancelar.body)}`);
      const canceladaDb = await dbGet(db, `SELECT status, cancelado_por_id, motivo_cancelamento
                                           FROM conferencias_almoxarifado WHERE id = ?`, [outra.body.id]);
      assert.strictEqual(canceladaDb.status, 'CANCELADO');
      assert.strictEqual(canceladaDb.cancelado_por_id, GESTOR.id, 'as colunas do cancelamento continuam gravadas');
      assert.strictEqual(canceladaDb.motivo_cancelamento, 'Cancelada com auditoria fora do ar');

      // E nenhuma auditoria foi parar no banco (o stub derrubou todas).
      assert.strictEqual((await auditorias(db, conf.id)).length, 0, 'stub tem de ter derrubado as auditorias');
      assert.strictEqual((await auditorias(db, outra.body.id)).length, 0);
    } finally {
      auditModule.registrarAuditoria = original;
    }
  });

  // Controle da restauracao: depois do finally, auditar volta a funcionar.
  await test('RN-02 (controle): restaurado o modulo, uma nova conferencia volta a auditar', async () => {
    setUser(ADMIN);
    const conf = await abrirConferencia(app, { categoria: 'CAT-AUD-POS-STUB-INEXISTENTE' });
    assert.strictEqual((await auditorias(db, conf.id, 'CRIACAO')).length, 1, 'o stub tem de ter sido restaurado');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})();
