/**
 * Etapa 44, T4 — INTEGRACAO: o ciclo inteiro, pelas ROTAS HTTP reais.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao.md (T4)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao-design.md
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────────────────────
 * T1 mediu a regra chamando o servico com fixtures montados por SQL; T2 mediu a porta. Nenhum dos
 * dois prova que o ciclo COMPOE: que o material critico entra retido, que a inspecao reprovada
 * abre o documento sozinha, que o bloqueio que ela cria e o MESMO que a decisao libera, e que o
 * disponivel sobe exatamente por isso. Nesta base ja houve etapa com toda a unidade verde e a
 * feature morta em producao, por fiacao.
 *
 *   (1) O CICLO DO C57: receber critico -> reprovar -> a NC nasce -> a QUALIDADE decide
 *       ACEITAR_SOB_DESVIO -> o material sai do bloqueado e volta ao DISPONIVEL, e o livro aponta
 *       para o documento. E a prova literal do furo fechado.
 *   (2) O SEGUNDO PORTAO: o lote. Achado da Fase 2 — a liberacao devolve o material ao pool e a
 *       SAIDA continua recusando, porque o status do lote e outra guarda que esta etapa NAO abre.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * O cenario (2) afirma AUSENCIA de permissao para sair, entao ele afirma antes, no MESMO cenario,
 * que o bloqueado caiu e que o disponivel subiu — sem isso, um 400 por qualquer outro motivo
 * (material inexistente, saldo zero, rota morta) passaria como se fosse a guarda do lote. E a
 * literal do erro e conferida por texto, nao so o status.
 *
 * Executar: cd server && node tests/api/naoConformidadeLiberacaoIntegracao.api.test.js
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

const ADMIN = { id: 440, nome: 'Admin E44 T4', role: 'admin', is_superadmin: 1, email: 'admin44t4@test.com' };
const QUALIDADE = { id: 443, nome: 'Qualidade E44 T4', role: 'usuario', perfil_almoxarifado: 'QUALIDADE' };

(async () => {
  console.log('\n=== Etapa 44 T4: integracao da liberacao, pelas rotas HTTP ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const fornecedor = (await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj, status)
    VALUES ('Acos Integra E44','44.440.440/0001-44','ativo')`)).lastID;

  let seq = 0;
  async function novoMaterialCritico({ controleLote = false } = {}) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, material_critico, controle_lote)
      VALUES (?,?,'KG',0,1,1,?)`,
      [`NCL-${String(seq).padStart(3, '0')}`, `Chapa integracao 44 ${seq}`, controleLote ? 1 : 0]);
    return r.lastID;
  }

  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  const saldosDe = async (materialId) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada,
    quantidade_em_inspecao FROM materiais_almoxarifado WHERE id = ?`, [materialId]);

  /** Recebe 10 de um material critico pela ROTA, e devolve o item ja retido em inspecao. */
  async function receberCriticoRetido(materialId, loteCodigo = null) {
    seq += 1;
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-NCL-${seq}`,
      fornecedor_id: fornecedor, fornecedor_nome: 'Acos Integra E44',
      itens: [{ material_id: materialId, quantidade: 10, ...(loteCodigo ? { lote: loteCodigo } : {}) }],
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const item = await dbGet(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [criado.body.id]);
    const ap = await request(app).post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `POST /aprovar: ${JSON.stringify(ap.body)}`);
    const retido = await dbGet(db,
      'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [item.id]);
    assert.strictEqual(retido.quantidade_em_inspecao, 10,
      `fixture: o critico tinha de entrar retido, veio ${retido.quantidade_em_inspecao}`);
    return { recebimentoId: criado.body.id, itemId: item.id };
  }

  await setConfig('inspecao_material_critico', '1');

  // ── (1) O CICLO DO C57, ponta a ponta ──────────────────────────────────────────────────────
  await test('(1) receber critico -> reprovar 3 -> a QUALIDADE aceita sob desvio -> os 3 voltam ao disponivel', async () => {
    const materialId = await novoMaterialCritico();
    const { itemId } = await receberCriticoRetido(materialId);

    // A QUALIDADE inspeciona e reprova 3 de 10. O motor move os 10 de `em_inspecao`, soma 3 em
    // `bloqueada` e devolve 7 ao disponivel — e e esse bloqueio de 3 que a NC vai liberar.
    setUser({ ...QUALIDADE });
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, dano_fisico: 1, encaminhamento: 'ANALISE_ENGENHARIA' });
    assert.strictEqual(insp.status, 201, `POST /inspecionar: ${JSON.stringify(insp.body)}`);

    const aposInspecao = await saldosDe(materialId);
    assert.strictEqual(aposInspecao.quantidade_bloqueada, 3, `bloqueada apos inspecao: ${aposInspecao.quantidade_bloqueada}`);
    assert.strictEqual(aposInspecao.quantidade_em_inspecao, 0, `em_inspecao apos inspecao: ${aposInspecao.quantidade_em_inspecao}`);
    const disponivelAntes = aposInspecao.quantidade_atual - aposInspecao.quantidade_bloqueada
      - aposInspecao.quantidade_em_inspecao;
    assert.strictEqual(disponivelAntes, 7, `disponivel apos inspecao: ${disponivelAntes}`);

    // O documento nasceu SOZINHO — ninguem o abriu por rota.
    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO');
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id && n.referencia_tipo === 'INSPECAO');
    assert.ok(doc, `a reprovacao nao abriu documento: ${JSON.stringify(lista.body.itens.map((n) => n.numero))}`);
    assert.strictEqual(doc.status, 'ABERTA', `a NC nasceu ${doc.status}`);

    // E A DECISAO EXECUTA — o gesto que o C57 dizia nao existir.
    const dec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/decidir`)
      .send({ decisao: 'ACEITAR_SOB_DESVIO', justificativa: 'desvio autorizado pela engenharia, laudo em anexo' });
    assert.strictEqual(dec.status, 200, `POST /decidir: ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.liberacao.efeito, 'LIBERADA', `efeito ${dec.body.liberacao.efeito}`);
    assert.strictEqual(dec.body.liberacao.mensagem, '3 liberado(s) do bloqueio', dec.body.liberacao.mensagem);
    assert.strictEqual(dec.body.decidido_por_nome, QUALIDADE.nome, 'o autor da decisao nao e quem decidiu');

    const aposDecisao = await saldosDe(materialId);
    assert.strictEqual(aposDecisao.quantidade_bloqueada, 0, `bloqueada apos decisao: ${aposDecisao.quantidade_bloqueada}`);
    // O FISICO NAO MUDA — liberar nao cria nem consome material, so tira a retencao.
    assert.strictEqual(aposDecisao.quantidade_atual, aposInspecao.quantidade_atual,
      'a liberacao mexeu no fisico, e nao podia');
    const disponivelDepois = aposDecisao.quantidade_atual - aposDecisao.quantidade_bloqueada
      - aposDecisao.quantidade_em_inspecao;
    assert.strictEqual(disponivelDepois, 10, `disponivel apos decisao: ${disponivelDepois}`);

    // E o livro aponta para o documento — antes desta etapa so havia "Desbloqueio avulso".
    const movs = await dbAll(db, `SELECT tipo, quantidade, motivo, documento_vinculado
      FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'`, [materialId]);
    assert.strictEqual(movs.length, 1, `esperava 1 DESBLOQUEIO, veio ${movs.length}`);
    assert.strictEqual(movs[0].documento_vinculado, doc.numero,
      `o livro nao aponta para a NC: ${movs[0].documento_vinculado}`);
    assert.strictEqual(movs[0].motivo, 'Liberação por não conformidade', movs[0].motivo);
    setUser({ ...ADMIN });
  });

  // ── (2) O SEGUNDO PORTAO: o status do LOTE, que esta etapa NAO abre ────────────────────────
  await test('(2) lote REPROVADO: a NC libera o pool e a saida continua recusando — o portao do lote nao e desta etapa', async () => {
    const materialId = await novoMaterialCritico({ controleLote: true });
    const loteCodigo = `LOTE-NCL-${Date.now() % 100000}`;
    const { itemId } = await receberCriticoRetido(materialId, loteCodigo);
    setUser({ ...QUALIDADE });
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, encaminhamento: 'ANALISE_ENGENHARIA' });
    assert.strictEqual(insp.status, 201, JSON.stringify(insp.body));

    // O lote nasceu na entrada (o material tem controle por lote). A QUALIDADE o reprova — ela
    // TEM `inspecionar`, entao este gesto e dela.
    const lote = await dbGet(db, 'SELECT id, codigo FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
      [materialId, loteCodigo]);
    assert.ok(lote, `o lote ${loteCodigo} nao nasceu na entrada — o fixture perdeu o sentido`);
    const st = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'REPROVADO', justificativa: 'lote inteiro suspeito, aguardando laudo' });
    assert.strictEqual(st.status, 200, `PUT /lotes/:id/status: ${JSON.stringify(st.body)}`);

    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO');
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id && n.referencia_tipo === 'INSPECAO');
    assert.ok(doc, 'a reprovacao nao abriu documento');
    const dec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/decidir`)
      .send({ decisao: 'ACEITAR', justificativa: 'material aceito, laudo favoravel' });

    // AS METADES POSITIVAS, antes da negativa: a liberacao ACONTECEU de verdade.
    assert.strictEqual(dec.status, 200, JSON.stringify(dec.body));
    assert.strictEqual(dec.body.liberacao.efeito, 'LIBERADA', `efeito ${dec.body.liberacao.efeito}`);
    const saldos = await saldosDe(materialId);
    assert.strictEqual(saldos.quantidade_bloqueada, 0, `bloqueada: ${saldos.quantidade_bloqueada}`);
    const disponivel = saldos.quantidade_atual - saldos.quantidade_bloqueada - saldos.quantidade_em_inspecao;
    assert.strictEqual(disponivel, 10, `disponivel: ${disponivel}`);

    // E A NEGATIVA, que e o achado da Fase 2: a tela diz "3 liberado(s) do bloqueio" e a producao
    // NAO consegue retirar, porque o status do lote e outro portao. E comportamento CORRETO do
    // codigo; esta fixado por teste para ninguem "consertar" como regressao, e esta no guia do
    // usuario como passo separado (reabilitar o lote e outro gesto, na tela de lotes).
    setUser({ ...ADMIN });
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: materialId, tipo: 'SAIDA_PRODUCAO', quantidade: 2,
      lote_id: lote.id, motivo: 'consumo de producao',
      emergencial: true, justificativa: 'consumo emergencial de linha parada',
    });
    assert.strictEqual(saida.status, 400, `a saida passou: ${saida.status} ${JSON.stringify(saida.body)}`);
    assert.ok(/lote .* esta reprovado e nao pode ser utilizado/i.test(saida.body.error || ''),
      `a recusa nao veio da guarda do lote: ${saida.body.error}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
