/**
 * Etapa 29, Task 4 — INTEGRACAO: o fluxo das medidas INTEIRO pela porta da frente (so HTTP).
 *
 * Plano: docs/superpowers/plans/2026-08-29-almoxarifado-etapa29-tela-das-medidas.md
 *
 * A Task 1 provou a LEITURA (C1/C2) montando o cenario metade por servico, metade por INSERT. Este
 * arquivo percorre, SO PELA ROTA e na ordem em que o usuario percorre, tudo o que a tela da Etapa
 * 29 assume do backend — e e o unico lugar em que as tres pontas (cadastro do plano e do
 * instrumento, decisao com medidas, historico) se encontram no mesmo banco:
 *
 *   configuracao (PUT /configuracoes) + material critico (POST /materiais)
 *     -> plano com DUAS caracteristicas (POST /planos-inspecao): uma simetrica `12.3 ±0.1` e uma
 *        unilateral `10 +0.005/+0.021` (ISO 286 — a que o modelo "magnitude" nao representava)
 *       -> dois instrumentos que EXIGEM calibracao (POST /ferramentas + POST /:id/calibracoes):
 *          um com calibracao vigente, outro com calibracao VENCIDA — e `GET /ferramentas` tem de
 *          rotular `calibracao_vigente` true/false, porque e isso que o modal usa para desabilitar
 *         -> recebimento aprovado deixa o item RETIDO (POST /recebimentos, POST /:id/aprovar)
 *           -> decidir com 2 medidas (1 dentro, 1 fora com o instrumento vigente) SEM
 *              `divergencia_dimensional` no payload -> a resposta traz a flag derivada e
 *              `medidas_registradas: 2`
 *             -> `GET /inspecoes/historico` conta 2 medidas / 1 nao conforme / divergencia 1
 *               -> `GET /inspecoes/:id/medidas` traz as 2 linhas com `conforme` e `ferramenta_nome`
 *                 -> `PUT /planos-inspecao/:id` muda nominal E caracteristica, e as DUAS leituras
 *                    saem BYTE A BYTE iguais ao snapshot de antes (congelado)
 *                   -> segundo item: instrumento VENCIDO recusa com a literal, e o historico NAO
 *                      ganha linha (nada gravado); '12,4' recusa com a literal, nada gravado;
 *                      e sem medidas a flag MANUAL vale (`divergencia_dimensional 1`, `medidas_total 0`).
 *
 * ── GUARDA ANTI-TESTE-VAZIO ─────────────────────────────────────────────────────────────────
 * Cada cenario le o que o anterior deixou por `ctx` e comeca afirmando que ele existe. As
 * afirmacoes de "inalterado" comparam com um SNAPSHOT tirado ANTES do PUT, e o PUT e conferido
 * pelo GET do plano (metade positiva) — senao um PUT que nao fizesse nada passaria o congelamento.
 * As afirmacoes de "nada gravado" comparam a CONTAGEM do historico do material antes e depois.
 *
 * Executar: cd server && node tests/api/inspecaoFluxoMedidas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// `is_superadmin: 1` => ADMINISTRADOR: `gerenciar_plano_inspecao`, `gerenciar_ferramentas`,
// `receber_material`, `inspecionar` e o gate de configuracao. O harness roda o `requirePermission` REAL.
const ADMIN = {
  id: 294, nome: 'Admin Fluxo E29', role: 'admin', is_superadmin: 1, email: 'e29fluxo@test.com',
};

const HISTORICO = '/api/almoxarifado/inspecoes/historico';
const medidasDe = (id) => `/api/almoxarifado/inspecoes/${id}/medidas`;
const inspecionar = (itemId) => `/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`;

const sufixo = `${Date.now() % 1000000}`;
const LITERAL_VENCIDA = (nome) => `Ferramenta com calibração vencida ou sem calibração registrada (${nome})`;
const LITERAL_VIRGULA = (car) => `Valor medido inválido para "${car}": informe um número (use ponto decimal)`;

(async () => {
  console.log('\n=== Etapa 29 Task 4: o fluxo das medidas inteiro pela rota ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  // Estado compartilhado: o caminho e UM so, percorrido em ordem.
  const ctx = {};

  // Item retido PELA ROTA: recebimento do material critico + aprovacao, e o id do item vem da
  // fila que a tela de Pendentes le (`item_id`), nao de SELECT.
  async function itemRetidoPelaRota(qtd) {
    ctx.seqRec = (ctx.seqRec || 0) + 1;
    const rec = await request(app).post('/api/almoxarifado/recebimentos').send({
      nota_fiscal: `NF-FLX-E29-${sufixo}-${ctx.seqRec}`,
      itens: [{ material_id: ctx.materialId, quantidade: qtd }],
    });
    assert.strictEqual(rec.status, 201, `POST recebimento falhou: ${rec.status} ${JSON.stringify(rec.body)}`);
    const aprov = await request(app).post(`/api/almoxarifado/recebimentos/${rec.body.id}/aprovar`).send({});
    assert.strictEqual(aprov.status, 200, `aprovar falhou: ${aprov.status} ${JSON.stringify(aprov.body)}`);

    const fila = await request(app).get('/api/almoxarifado/inspecoes/pendentes').query({ material_id: ctx.materialId });
    assert.strictEqual(fila.status, 200, `GET pendentes falhou: ${fila.status}`);
    const lista = Array.isArray(fila.body) ? fila.body : (fila.body.itens || []);
    const pend = lista.find((p) => p.recebimento_id === rec.body.id);
    assert.ok(pend, `o item do recebimento ${rec.body.id} nao esta na fila de pendentes: ${JSON.stringify(lista).slice(0, 400)}`);
    assert.strictEqual(Number(pend.quantidade_retida), qtd,
      `o item nao ficou retido (${pend.quantidade_retida} de ${qtd}) — sem retencao nao ha decisao de inspecao de verdade`);
    return { itemId: pend.item_id, recebimentoId: rec.body.id, qtd };
  }

  const historicoDoMaterial = async () => {
    const res = await request(app).get(HISTORICO).query({ material_id: ctx.materialId });
    assert.strictEqual(res.status, 200, `historico deu ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body), 'historico e array');
    return res.body;
  };

  await test('[setup] configuracao, material critico e o plano com duas caracteristicas, tudo pela rota', async () => {
    const cfg = await request(app).put('/api/almoxarifado/configuracoes').send({ inspecao_material_critico: '1' });
    assert.strictEqual(cfg.status, 200, `PUT configuracoes falhou: ${cfg.status} ${JSON.stringify(cfg.body)}`);

    const fam = await request(app).post('/api/almoxarifado/familias').send({ nome: `Fam Fluxo E29 ${sufixo}` });
    assert.strictEqual(fam.status, 201, `POST familia falhou: ${fam.status} ${JSON.stringify(fam.body)}`);
    const codigo = `MAT-FLX-E29-${sufixo}`;
    const mat = await request(app).post('/api/almoxarifado/materiais').send({
      codigo, nome: `Eixo retificado ${codigo}`, unidade: 'UN', familia_id: fam.body.id, material_critico: 1,
    });
    assert.strictEqual(mat.status, 201, `POST material falhou: ${mat.status} ${JSON.stringify(mat.body)}`);
    ctx.materialId = mat.body.id;
    assert.ok(ctx.materialId, 'o 201 do material nao trouxe id');

    // Simetrica: [12.2 ; 12.4]. Unilateral deslocada (ISO 286): [10.005 ; 10.021].
    ctx.carSim = `Diametro ${sufixo}`;
    ctx.carUni = `Eixo h7 ${sufixo}`;
    const sim = await request(app).post('/api/almoxarifado/planos-inspecao').send({
      material_id: ctx.materialId, caracteristica: ctx.carSim, unidade: 'mm',
      valor_nominal: 12.3, desvio_inferior: -0.1, desvio_superior: 0.1,
    });
    assert.strictEqual(sim.status, 201, `POST plano simetrico falhou: ${sim.status} ${JSON.stringify(sim.body)}`);
    ctx.planoSim = sim.body.id;
    const uni = await request(app).post('/api/almoxarifado/planos-inspecao').send({
      material_id: ctx.materialId, caracteristica: ctx.carUni, unidade: 'mm',
      valor_nominal: 10, desvio_inferior: 0.005, desvio_superior: 0.021,
    });
    assert.strictEqual(uni.status, 201, `POST plano unilateral falhou: ${uni.status} ${JSON.stringify(uni.body)}`);
    ctx.planoUni = uni.body.id;
    assert.ok(ctx.planoSim && ctx.planoUni, 'os dois POST do plano tinham de trazer id');

    // O GET que o modal le para saber o que medir: as duas, com os desvios COM SINAL.
    const planos = await request(app).get('/api/almoxarifado/planos-inspecao').query({ material_id: ctx.materialId });
    assert.strictEqual(planos.status, 200);
    assert.strictEqual(planos.body.length, 2, `o modal veria ${planos.body.length} caracteristicas, esperava 2`);
    const pUni = planos.body.find((p) => p.id === ctx.planoUni);
    assert.strictEqual(pUni.desvio_inferior, 0.005, `desvio inferior positivo nao sobreviveu a rota: ${JSON.stringify(pUni)}`);
    assert.strictEqual(pUni.desvio_superior, 0.021);
    assert.strictEqual(pUni.valor_nominal, 10);
  });

  await test('[RN-04] dois instrumentos que exigem calibracao: GET /ferramentas rotula vigente true e vencida false', async () => {
    assert.ok(ctx.materialId, 'guarda: o setup precisa ter rodado');

    const criarFerr = async (rotulo) => {
      const r = await request(app).post('/api/almoxarifado/ferramentas').send({
        codigo_patrimonio: `FLX-${rotulo}-${sufixo}`, nome: `${rotulo} ${sufixo}`, tipo: 'MEDICAO', exige_calibracao: true,
      });
      assert.strictEqual(r.status, 201, `POST ferramenta ${rotulo} falhou: ${r.status} ${JSON.stringify(r.body)}`);
      assert.ok(r.body.id, `o 201 da ferramenta ${rotulo} nao trouxe id: ${JSON.stringify(r.body)}`);
      return { id: r.body.id, nome: `${rotulo} ${sufixo}` };
    };
    ctx.ferrVigente = await criarFerr('Micrometro');
    ctx.ferrVencida = await criarFerr('Paquimetro');

    // A rota de calibracao e multipart (certificado opcional) — `.field`, nao `.send`.
    const vig = await request(app).post(`/api/almoxarifado/ferramentas/${ctx.ferrVigente.id}/calibracoes`)
      .field('data_calibracao', '2026-01-15').field('data_validade', '2031-01-15');
    assert.strictEqual(vig.status, 201, `calibracao vigente falhou: ${vig.status} ${JSON.stringify(vig.body)}`);
    // Calibracao REGISTRADA mas ja VENCIDA: e o caso "vencida" da literal, distinto de "sem
    // calibracao registrada" (que o medidasInspecao ja cobre).
    const venc = await request(app).post(`/api/almoxarifado/ferramentas/${ctx.ferrVencida.id}/calibracoes`)
      .field('data_calibracao', '2024-01-15').field('data_validade', '2025-01-15');
    assert.strictEqual(venc.status, 201, `calibracao vencida falhou ao registrar: ${venc.status} ${JSON.stringify(venc.body)}`);

    // O que o modal (RN-04 da Etapa 29) usa para desabilitar a opcao: `calibracao_vigente`.
    const lista = await request(app).get('/api/almoxarifado/ferramentas');
    assert.strictEqual(lista.status, 200);
    const fv = lista.body.find((f) => f.id === ctx.ferrVigente.id);
    const fx = lista.body.find((f) => f.id === ctx.ferrVencida.id);
    assert.ok(fv && fx, 'as duas ferramentas tinham de aparecer no GET /ferramentas');
    assert.strictEqual(fv.calibracao_vigente, true, `vigente tinha de vir true: ${JSON.stringify(fv.calibracao_vigente)}`);
    assert.strictEqual(fx.calibracao_vigente, false, `vencida tinha de vir false (nao null): ${JSON.stringify(fx.calibracao_vigente)}`);
  });

  await test('[E27 RN-03] decidir com 2 medidas (1 fora, com o instrumento vigente) SEM a flag no payload -> flag derivada 1 e medidas_registradas 2', async () => {
    assert.ok(ctx.planoSim && ctx.ferrVigente, 'guarda: setup e instrumentos precisam existir');
    const it = await itemRetidoPelaRota(10);
    ctx.item1 = it;
    ctx.antes = (await historicoDoMaterial()).length;
    assert.strictEqual(ctx.antes, 0, 'material novo: historico vazio antes da primeira decisao');

    const dec = await request(app).post(inspecionar(it.itemId)).send({
      quantidade_aprovada: 8, quantidade_reprovada: 2, encaminhamento: 'DEVOLVER',
      observacoes: 'eixo acima do campo h7',
      // NENHUMA `divergencia_dimensional` no payload: a flag tem de nascer do numero.
      medidas: [
        { plano_id: ctx.planoSim, valor_medido: '12.35' },                                // dentro de [12.2 ; 12.4]
        { plano_id: ctx.planoUni, valor_medido: '10.03', ferramenta_id: ctx.ferrVigente.id }, // fora de [10.005 ; 10.021]
      ],
    });
    assert.strictEqual(dec.status, 201, `inspecionar falhou: ${dec.status} ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.divergencia_dimensional, 1,
      `a resposta tem de trazer a flag derivada (o toast RN-07 le daqui): ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.medidas_registradas, 2, `medidas_registradas: ${JSON.stringify(dec.body)}`);
    ctx.inspecaoId = dec.body.id;
    assert.ok(ctx.inspecaoId, `o 201 nao trouxe o id da inspecao: ${JSON.stringify(dec.body)}`);
  });

  await test('[RN-05] GET /inspecoes/historico traz a decidida com medidas_total 2, nao_conformes 1 e divergencia 1', async () => {
    assert.ok(ctx.inspecaoId, 'guarda: a decisao precisa ter gravado');
    const hist = await historicoDoMaterial();
    assert.strictEqual(hist.length, 1, `o historico do material tinha de ter 1 linha, veio ${hist.length}`);
    const linha = hist[0];
    assert.strictEqual(linha.id, ctx.inspecaoId);
    assert.strictEqual(linha.recebimento_item_id, ctx.item1.itemId);
    assert.strictEqual(linha.recebimento_id, ctx.item1.recebimentoId);
    assert.strictEqual(linha.medidas_total, 2, `medidas_total: ${JSON.stringify(linha)}`);
    assert.strictEqual(linha.medidas_nao_conformes, 1, `medidas_nao_conformes: ${JSON.stringify(linha)}`);
    assert.strictEqual(linha.divergencia_dimensional, 1, 'a flag derivada ficou GRAVADA, nao so ecoada');
    assert.strictEqual(linha.conforme, 0);
    assert.strictEqual(linha.quantidade_aprovada, 8);
    assert.strictEqual(linha.quantidade_reprovada, 2);
    assert.strictEqual(linha.encaminhamento, 'DEVOLVER');
    assert.strictEqual(linha.responsavel_nome, ADMIN.nome);
    assert.ok(linha.data_inspecao, 'data_inspecao vem');
    ctx.snapshotHistorico = JSON.stringify(hist);
  });

  await test('[RN-05] GET /inspecoes/:id/medidas traz as 2 linhas com conforme 1/0 e ferramenta_nome na medida fora', async () => {
    assert.ok(ctx.inspecaoId, 'guarda');
    const res = await request(app).get(medidasDe(ctx.inspecaoId));
    assert.strictEqual(res.status, 200, `medidas deu ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.length, 2, `esperava 2 medidas, veio ${res.body.length}`);
    const mSim = res.body.find((m) => m.plano_id === ctx.planoSim);
    const mUni = res.body.find((m) => m.plano_id === ctx.planoUni);
    assert.ok(mSim && mUni, `as duas caracteristicas tinham de estar la: ${JSON.stringify(res.body)}`);

    assert.strictEqual(mSim.caracteristica, ctx.carSim);
    assert.strictEqual(mSim.valor_medido, 12.35);
    assert.strictEqual(mSim.conforme, 1, '12.35 esta dentro de [12.2 ; 12.4]');
    assert.strictEqual(mSim.ferramenta_id, null);
    assert.strictEqual(mSim.ferramenta_nome, null);

    assert.strictEqual(mUni.caracteristica, ctx.carUni);
    assert.strictEqual(mUni.valor_nominal, 10);
    assert.strictEqual(mUni.desvio_inferior, 0.005);
    assert.strictEqual(mUni.desvio_superior, 0.021);
    assert.strictEqual(mUni.valor_medido, 10.03);
    assert.strictEqual(mUni.conforme, 0, '10.03 esta acima de 10.021');
    assert.strictEqual(mUni.ferramenta_id, ctx.ferrVigente.id);
    assert.strictEqual(mUni.ferramenta_nome, ctx.ferrVigente.nome, `ferramenta_nome: ${JSON.stringify(mUni)}`);
    ctx.snapshotMedidas = JSON.stringify(res.body);
  });

  await test('[RN-05] PUT no plano (nominal E caracteristica) depois da decisao: historico e medidas saem IGUAIS ao snapshot', async () => {
    assert.ok(ctx.snapshotHistorico && ctx.snapshotMedidas, 'guarda: os snapshots precisam existir');

    // Com o plano novo, 10.03 estaria DENTRO — se qualquer leitura olhasse o plano atual, o
    // veredito mudaria. O nome muda tambem, para pegar um JOIN so na caracteristica.
    const put = await request(app).put(`/api/almoxarifado/planos-inspecao/${ctx.planoUni}`).send({
      caracteristica: `${ctx.carUni} REVISADO`, valor_nominal: 10.03, desvio_inferior: -0.01, desvio_superior: 0.01,
    });
    assert.strictEqual(put.status, 200, `PUT plano falhou: ${put.status} ${JSON.stringify(put.body)}`);
    // Metade positiva: o plano MUDOU de verdade, lido pela rota.
    const planos = await request(app).get('/api/almoxarifado/planos-inspecao').query({ material_id: ctx.materialId });
    const agora = planos.body.find((p) => p.id === ctx.planoUni);
    assert.strictEqual(agora.valor_nominal, 10.03, `o PUT nao mudou o nominal (${agora.valor_nominal}) — o cenario nao provaria congelamento`);
    assert.strictEqual(agora.caracteristica, `${ctx.carUni} REVISADO`);

    const hist = await historicoDoMaterial();
    assert.strictEqual(JSON.stringify(hist), ctx.snapshotHistorico,
      `o historico mudou depois do PUT no plano:\n antes ${ctx.snapshotHistorico}\n agora ${JSON.stringify(hist)}`);
    const med = await request(app).get(medidasDe(ctx.inspecaoId));
    assert.strictEqual(med.status, 200);
    assert.strictEqual(JSON.stringify(med.body), ctx.snapshotMedidas,
      `as medidas mudaram depois do PUT no plano:\n antes ${ctx.snapshotMedidas}\n agora ${JSON.stringify(med.body)}`);
    const mUni = med.body.find((m) => m.plano_id === ctx.planoUni);
    assert.strictEqual(mUni.conforme, 0, 'o veredito congelado nao acompanha o plano novo');
    assert.strictEqual(mUni.caracteristica, ctx.carUni, 'a caracteristica congelada e a do ato, nao a REVISADA');
  });

  await test('[E27 RN-04] segundo item: medida com o instrumento VENCIDO recusa com a literal e o historico NAO ganha linha', async () => {
    assert.ok(ctx.ferrVencida, 'guarda');
    ctx.item2 = await itemRetidoPelaRota(5);
    const antes = (await historicoDoMaterial()).length;
    assert.strictEqual(antes, 1, 'setup: so a primeira decisao esta no historico');

    const dec = await request(app).post(inspecionar(ctx.item2.itemId)).send({
      quantidade_aprovada: 5, quantidade_reprovada: 0,
      medidas: [{ plano_id: ctx.planoSim, valor_medido: '12.3', ferramenta_id: ctx.ferrVencida.id }],
    });
    assert.strictEqual(dec.status, 400, `esperava 400, veio ${dec.status}: ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.error, LITERAL_VENCIDA(ctx.ferrVencida.nome),
      `a mensagem vai literal ao toast (RN-03 da Etapa 29): ${JSON.stringify(dec.body)}`);

    assert.strictEqual((await historicoDoMaterial()).length, antes, 'recusa nao pode deixar inspecao gravada');
    // E o item continua RETIDO na fila (a recusa roda ANTES do claim de saldo).
    const fila = await request(app).get('/api/almoxarifado/inspecoes/pendentes').query({ material_id: ctx.materialId });
    const pend = fila.body.find((p) => p.item_id === ctx.item2.itemId);
    assert.ok(pend, 'o item recusado tem de continuar na fila de pendentes');
    assert.strictEqual(Number(pend.quantidade_retida), 5, 'o retido nao pode ter se movido numa recusa');
  });

  await test("[E27 RN-07] '12,4' (virgula) recusa com a literal e nada e gravado", async () => {
    assert.ok(ctx.item2, 'guarda');
    const antes = (await historicoDoMaterial()).length;

    const dec = await request(app).post(inspecionar(ctx.item2.itemId)).send({
      quantidade_aprovada: 5, quantidade_reprovada: 0,
      medidas: [{ plano_id: ctx.planoSim, valor_medido: '12,4' }],
    });
    assert.strictEqual(dec.status, 400, `virgula decimal tinha de dar 400, veio ${dec.status}: ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.error, LITERAL_VIRGULA(ctx.carSim), `mensagem literal: ${JSON.stringify(dec.body)}`);
    assert.strictEqual((await historicoDoMaterial()).length, antes, 'recusa por virgula nao grava inspecao');
  });

  await test('[E27 RN-03/A6] sem medidas, a flag MANUAL vale: historico mostra divergencia_dimensional 1 e medidas_total 0', async () => {
    assert.ok(ctx.item2, 'guarda');
    const dec = await request(app).post(inspecionar(ctx.item2.itemId)).send({
      quantidade_aprovada: 4, quantidade_reprovada: 1, encaminhamento: 'ANALISE_ENGENHARIA',
      divergencia_dimensional: true,
    });
    assert.strictEqual(dec.status, 201, `decisao manual falhou: ${dec.status} ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.divergencia_dimensional, 1, 'a flag manual volta na resposta');
    assert.strictEqual(dec.body.medidas_registradas, 0, 'sem medidas, 0 registradas (o toast fica "Inspeção registrada!")');

    const hist = await historicoDoMaterial();
    assert.strictEqual(hist.length, 2, `agora sao duas decididas, veio ${hist.length}`);
    assert.strictEqual(hist[0].id, dec.body.id, 'a mais recente vem primeiro');
    assert.strictEqual(hist[0].divergencia_dimensional, 1, 'a marcacao manual vale sem medidas');
    assert.strictEqual(hist[0].medidas_total, 0);
    assert.strictEqual(hist[0].medidas_nao_conformes, 0);
    assert.strictEqual(hist[0].encaminhamento, 'ANALISE_ENGENHARIA');
    // E a primeira continua contando a historia dela.
    assert.strictEqual(hist[1].id, ctx.inspecaoId);
    assert.strictEqual(hist[1].medidas_total, 2);

    const med = await request(app).get(medidasDe(dec.body.id));
    assert.strictEqual(med.status, 200);
    assert.deepStrictEqual(med.body, [], 'decidida sem medida responde [] (a tela mostra "Sem medidas registradas" sem chamar C2)');
    // O item decidido SAI da fila.
    const fila = await request(app).get('/api/almoxarifado/inspecoes/pendentes').query({ material_id: ctx.materialId });
    assert.ok(!fila.body.some((p) => p.item_id === ctx.item2.itemId), 'decidido some da fila de pendentes');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
