/**
 * Etapa 10b, Task 5 — teste-jornada de integracao cruzando Task 1 (escopo combinavel RN-01),
 * Task 2 (dupla contagem RN-03/RN-04, validacao RN-08 e o complemento do modo cego) e Task 3
 * (impacto financeiro persistido RN-05 + relatorio de acuracidade RN-06/RN-07).
 *
 * Task 1, Task 2 e Task 3 ja tem cobertura unitaria/isolada propria
 * (conferenciaEscopo/conferenciaDuplaContagem/conferenciaAcuracidade .api.test.js) — este
 * arquivo NAO repete aquilo. O objetivo aqui e provar que as pecas se COMPOEM como UMA
 * jornada continua pela API HTTP real: criar com escopo -> contagem cega esconde o esperado E
 * a contagem do colega -> tolerancia estoura -> mesma pessoa barrada por dupla contagem ->
 * contagem invalida nao destrava o gate (RN-08) -> outra pessoa reconta -> autoria correta no
 * GET -> concluir aplica o motor real -> impacto financeiro persistido -> relatorio de
 * acuracidade -> vazamento de dinheiro continua fechado para quem nao tem perfil.
 *
 * custo_unitario=10 no M1 e DE PROPOSITO (mesma razao de inventarioIntegracao.api.test.js):
 * sem custo, o impactoFinanceiro fica 0 e a asercao final nao prova nada.
 *
 * Executar: cd server && node tests/api/inventarioEscopoJornada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const ALMOXARIFE2 = { id: 7, nome: 'Almoxarife Dois', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox2@test.com' };
const PRODUCAO = { id: 9, nome: 'Chao de Fabrica', role: 'usuario', email: 'prod@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('jornada: escopo combinado, dupla contagem, modo cego, acuracidade e vazamento fechado', async () => {
    // ── Passo 1: seed — 3 materiais categoria unica JORNADA-10B. M1/M2 classe A + criticos ──
    // (M1 com custo, para o impactoFinanceiro final provar algo de verdade). M3 classe B, NAO
    // critico — o fora-do-escopo de controle (RN-01).
    setUser(ADMIN);
    const insM1 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, custo_unitario, ativo, categoria, classe_abc, material_critico)
       VALUES ('JOR10B-M1','Material Jornada M1','UN',100,10,1,'JORNADA-10B','A',1)`);
    const m1Id = insM1.lastID;
    const insM2 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, categoria, classe_abc, material_critico)
       VALUES ('JOR10B-M2','Material Jornada M2','UN',50,1,'JORNADA-10B','A',1)`);
    const m2Id = insM2.lastID;
    const insM3 = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, categoria, classe_abc, material_critico)
       VALUES ('JOR10B-M3','Material Jornada M3 (fora do escopo)','UN',30,1,'JORNADA-10B','B',0)`);
    const m3Id = insM3.lastID;

    // ── Passo 2: POST /conferencias com escopo combinado (classe A + criticos) + dupla ──
    // contagem + modo cego + tolerancia 5%. M3 (classe B, nao critico) tem de ficar fora.
    const confRes = await request(app).post('/api/almoxarifado/conferencias').send({
      categoria: 'JORNADA-10B', classe_abc: 'A', apenas_criticos: true,
      dupla_contagem: true, modo_cego: true, tolerancia_percentual: 5,
    });
    assert.strictEqual(confRes.status, 201, JSON.stringify(confRes.body));
    const confId = confRes.body.id;
    assert.strictEqual(confRes.body.totalItens, 2, JSON.stringify(confRes.body));
    assert.strictEqual(confRes.body.escopo_descricao, 'Categoria: JORNADA-10B + Classe A + Somente críticos',
      JSON.stringify(confRes.body));
    assert.strictEqual(confRes.body.dupla_contagem, 1, JSON.stringify(confRes.body));
    assert.strictEqual(confRes.body.modo_cego, 1, JSON.stringify(confRes.body));
    assert.strictEqual(confRes.body.tolerancia_percentual, 5, JSON.stringify(confRes.body));

    const itensBanco = await dbAll(db,
      `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?`, [confId]);
    assert.strictEqual(itensBanco.length, 2, JSON.stringify(itensBanco));
    const idsNaConferencia = itensBanco.map((i) => i.material_id);
    assert.ok(idsNaConferencia.includes(m1Id), 'M1 (classe A, critico) tinha de entrar');
    assert.ok(idsNaConferencia.includes(m2Id), 'M2 (classe A, critico) tinha de entrar');
    assert.ok(!idsNaConferencia.includes(m3Id), 'M3 (classe B, nao critico) NAO podia entrar — controle de escopo (RN-01)');
    const itemM1Row = itensBanco.find((i) => i.material_id === m1Id);
    const itemM2Row = itensBanco.find((i) => i.material_id === m2Id);

    // ── Passo 3: GET como ALMOXARIFE (sem ajustar_estoque) — modo cego esconde o esperado, ──
    // nada foi contado ainda.
    setUser(ALMOXARIFE);
    const getInicial = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
    assert.strictEqual(getInicial.status, 200, JSON.stringify(getInicial.body));
    assert.strictEqual(getInicial.body.itens.length, 2, JSON.stringify(getInicial.body));
    const m1Inicial = getInicial.body.itens.find((i) => i.material_id === m1Id);
    const m2Inicial = getInicial.body.itens.find((i) => i.material_id === m2Id);
    assert.ok(!('quantidade_sistema' in m1Inicial), 'M1: modo cego tinha de esconder o esperado');
    assert.ok(!('quantidade_sistema' in m2Inicial), 'M2: modo cego tinha de esconder o esperado');

    // ── Passo 4: ALMOXARIFE conta M1 = 90 (divergencia -10, 10% > tolerancia 5%) e M2 = 50 ──
    // (exato).
    const contagemM1 = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemM1Row.id}`)
      .send({ quantidade_contada: 90 });
    assert.strictEqual(contagemM1.status, 200, JSON.stringify(contagemM1.body));
    assert.strictEqual(contagemM1.body.recontagem, false, JSON.stringify(contagemM1.body));

    const contagemM2 = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemM2Row.id}`)
      .send({ quantidade_contada: 50 });
    assert.strictEqual(contagemM2.status, 200, JSON.stringify(contagemM2.body));
    assert.strictEqual(contagemM2.body.recontagem, false, JSON.stringify(contagemM2.body));

    // Complemento de RN-03 (achado da revisao da Task 2): em modo cego + dupla contagem, um
    // SEGUNDO perfil de almoxarife (id 7, sem ajustar_estoque) que NAO foi o ultimo autor le o
    // item de M1 SEM quantidade_contada — os quatro olhos nao podem virar dois olhos e uma
    // copia. O proprio autor (ALMOXARIFE) continua vendo o que digitou.
    setUser(ALMOXARIFE2);
    const getColega = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
    assert.strictEqual(getColega.status, 200, JSON.stringify(getColega.body));
    const m1Colega = getColega.body.itens.find((i) => i.material_id === m1Id);
    assert.ok(!('quantidade_contada' in m1Colega),
      `ALMOXARIFE2 (nao e o autor) nao podia ver a contagem do colega: ${JSON.stringify(m1Colega)}`);

    setUser(ALMOXARIFE);
    const getAutor = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
    assert.strictEqual(getAutor.status, 200, JSON.stringify(getAutor.body));
    const m1Autor = getAutor.body.itens.find((i) => i.material_id === m1Id);
    assert.strictEqual(Number(m1Autor.quantidade_contada), 90, 'o proprio autor continua vendo o que digitou');

    // ── Passo 5: concluir (ADMIN) sem recontar M1 -> 400, "Recontagem necessária..." (RN-05 ──
    // da Etapa 10 compoe com o escopo/dupla contagem novos).
    setUser(ADMIN);
    const concluirSemRecontar = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`).send({});
    assert.strictEqual(concluirSemRecontar.status, 400, JSON.stringify(concluirSemRecontar.body));
    assert.ok(concluirSemRecontar.body.error.startsWith('Recontagem necessária antes de concluir:'),
      JSON.stringify(concluirSemRecontar.body));
    assert.ok(concluirSemRecontar.body.error.includes('JOR10B-M1'), JSON.stringify(concluirSemRecontar.body));

    // ── Passo 6: ALMOXARIFE (autor da primeira contagem) tenta recontar M1 -> 400 dupla ──
    // contagem, mensagem literal (RN-03).
    setUser(ALMOXARIFE);
    const recontagemPeloAutor = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemM1Row.id}`)
      .send({ quantidade_contada: 92 });
    assert.strictEqual(recontagemPeloAutor.status, 400, JSON.stringify(recontagemPeloAutor.body));
    assert.strictEqual(recontagemPeloAutor.body.error,
      'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Almoxarife)',
      JSON.stringify(recontagemPeloAutor.body));

    // ── Extra (RN-08, achado da revisao da Task 2): GESTOR manda quantidade_contada 'abc' -> ──
    // 400 literal, ANTES de qualquer gate de dupla contagem — e a contagem armazenada continua
    // 90 (sem isso "abc" viraria NULL via parseFloat e destravaria o primeiro contador).
    setUser(GESTOR);
    const contagemInvalida = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemM1Row.id}`)
      .send({ quantidade_contada: 'abc' });
    assert.strictEqual(contagemInvalida.status, 400, JSON.stringify(contagemInvalida.body));
    assert.strictEqual(contagemInvalida.body.error, 'Quantidade contada deve ser um número maior ou igual a zero',
      JSON.stringify(contagemInvalida.body));
    const itemM1AposInvalida = await dbGet(db,
      `SELECT quantidade_contada FROM itens_conferencia_almoxarifado WHERE id = ?`, [itemM1Row.id]);
    assert.strictEqual(Number(itemM1AposInvalida.quantidade_contada), 90,
      'contagem invalida nao podia ter mexido no valor gravado');

    // ── Passo 7: GESTOR (outra pessoa) reconta M1 = 90 -> 200, recontagem: true (RN-03/RN-04). ──
    const recontagemGestor = await request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemM1Row.id}`)
      .send({ quantidade_contada: 90 });
    assert.strictEqual(recontagemGestor.status, 200, JSON.stringify(recontagemGestor.body));
    assert.strictEqual(recontagemGestor.body.recontagem, true, JSON.stringify(recontagemGestor.body));

    // ── Passo 8: GET /:id (ADMIN, tem ajustar_estoque — ve tudo mesmo em modo cego) -> M1 com ──
    // contado_por_nome 'Almoxarife' e recontado_por_nome 'Gestor' (RN-04).
    setUser(ADMIN);
    const getAutoria = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
    assert.strictEqual(getAutoria.status, 200, JSON.stringify(getAutoria.body));
    const m1Autoria = getAutoria.body.itens.find((i) => i.material_id === m1Id);
    assert.strictEqual(m1Autoria.contado_por_nome, 'Almoxarife', JSON.stringify(m1Autoria));
    assert.strictEqual(m1Autoria.recontado_por_nome, 'Gestor', JSON.stringify(m1Autoria));

    // ── Passo 9: concluir com aplicar_ajustes -> 200, ajustesAplicados 1 (so M1 diverge; M2 e ──
    // exato), impactoFinanceiro 100 (custo_unitario 10 x |divergencia| 10).
    const concluirOk = await request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'jornada 10b' });
    assert.strictEqual(concluirOk.status, 200, JSON.stringify(concluirOk.body));
    assert.strictEqual(concluirOk.body.ajustesAplicados, 1, JSON.stringify(concluirOk.body));
    assert.strictEqual(concluirOk.body.impactoFinanceiro, 100, JSON.stringify(concluirOk.body));

    // ── Passo 10: banco — M1 ajustado pelo motor real, impacto financeiro persistido, ──
    // data_fim gravado.
    const m1Final = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [m1Id]);
    assert.strictEqual(Number(m1Final.quantidade_atual), 90, JSON.stringify(m1Final));
    const movsAjuste = await dbAll(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'AJUSTE_INVENTARIO' AND material_id = ?`, [m1Id]);
    assert.strictEqual(movsAjuste.length, 1, 'esperava exatamente uma movimentacao AJUSTE_INVENTARIO gravada pelo motor real');
    const confBanco = await dbGet(db,
      `SELECT impacto_financeiro, data_fim FROM conferencias_almoxarifado WHERE id = ?`, [confId]);
    assert.strictEqual(Number(confBanco.impacto_financeiro), 100, JSON.stringify(confBanco));
    assert.ok(confBanco.data_fim, 'data_fim tinha de ter sido gravado na conclusao');

    // ── Passo 11: GET /relatorio-acuracidade -> a linha desta conferencia com os numeros ──
    // conhecidos (RN-06).
    const relatorio = await request(app).get('/api/almoxarifado/conferencias/relatorio-acuracidade');
    assert.strictEqual(relatorio.status, 200, JSON.stringify(relatorio.body));
    const linha = relatorio.body.conferencias.find((c) => c.id === confId);
    assert.ok(linha, 'conferencia da jornada nao apareceu no relatorio de acuracidade');
    assert.strictEqual(linha.contados, 2, JSON.stringify(linha));
    assert.strictEqual(linha.exatos, 1, JSON.stringify(linha));
    assert.strictEqual(linha.divergentes, 1, JSON.stringify(linha));
    assert.strictEqual(linha.acuracidade, 50, JSON.stringify(linha));
    assert.strictEqual(linha.impacto_financeiro, 100, JSON.stringify(linha));
    assert.strictEqual(linha.dupla_contagem, 1, JSON.stringify(linha));
    assert.strictEqual(linha.escopo_descricao, 'Categoria: JORNADA-10B + Classe A + Somente críticos',
      JSON.stringify(linha));

    // ── Passo 12: PRODUCAO (sem perfil) -> 403 no relatorio (RN-07), mas CONTINUA vendo a ──
    // listagem geral de conferencias (sem gate de perfil, de proposito), e nela
    // impacto_financeiro (dinheiro) NAO vaza (achado da revisao da Task 3).
    setUser(PRODUCAO);
    const relatorioNegado = await request(app).get('/api/almoxarifado/conferencias/relatorio-acuracidade');
    assert.strictEqual(relatorioNegado.status, 403, JSON.stringify(relatorioNegado.body));

    const listaGeral = await request(app).get('/api/almoxarifado/conferencias');
    assert.strictEqual(listaGeral.status, 200, JSON.stringify(listaGeral.body).slice(0, 200));
    const linhaLista = listaGeral.body.find((c) => c.id === confId);
    assert.ok(linhaLista, 'conferencia da jornada nao apareceu na listagem geral');
    assert.strictEqual(linhaLista.impacto_financeiro, undefined,
      `impacto_financeiro nao podia vazar pela listagem para quem o relatorio recusa: ${JSON.stringify(linhaLista)}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
