/**
 * Etapa 27, Task 4 (Step 1) — INTEGRACAO: o plano de inspecao atravessa as tres camadas.
 *
 * Plano:  docs/superpowers/plans/2026-08-29-almoxarifado-etapa27-plano-de-inspecao.md
 * Design: docs/superpowers/specs/2026-08-29-almoxarifado-etapa27-plano-de-inspecao-design.md
 *
 * As tasks 1 (regua pura), 2 (CRUD do plano) e 3 (medidas na decisao) provaram cada camada
 * isolada, e quase sempre chamando o SERVICO direto. Este arquivo prova o CAMINHO INTEIRO pela
 * PORTA DA FRENTE — so HTTP —, na ordem em que o usuario o percorre:
 *
 *   a qualidade cadastra a caracteristica no plano do material (POST /planos-inspecao)
 *     -> ela aparece no GET que a tela de inspecao leria para saber o que medir
 *       -> o material critico e recebido e aprovado, e o item fica RETIDO
 *         -> o inspetor decide pela rota mandando a MEDIDA, e NENHUMA flag
 *           -> `divergencia_dimensional` sai 1 sozinha, derivada do numero (RN-03)
 *             -> as medidas ficam gravadas com os valores CONGELADOS do plano (RN-05),
 *                e editar o plano depois nao reescreve a inspecao antiga
 *               -> e o CADASTRO DO PLANO deixou rastro, lido pela TELA-CONTRATO da auditoria
 *                  (`GET /auditoria?entidade=plano_inspecao`), com o rotulo "Plano de inspeção".
 *
 * ── POR QUE A AUDITORIA CONFERIDA E A DO PLANO, E NAO A DA INSPECAO ─────────────────────────
 * `inspectionService.js` NAO AUDITA NADA (verificado: nao ha `registrarAuditoria` nem `auditar`
 * entre os `require` dele — a decisao de inspecao nunca teve trilha, e ampliar isso seria
 * mudanca de escopo propria, declarada no design). O unico ato auditavel desta etapa e o CRUD do
 * plano. Uma versao anterior deste plano mandava "conferir que o ato da inspecao aparece na
 * trilha" — teria sido um cenario impossivel de passar, ou pior, um cenario reescrito para
 * afirmar outra coisa.
 *
 * ── NADA DE TOTAL FIXO ──────────────────────────────────────────────────────────────────────
 * Este arquivo NUNCA afirma "a trilha tem N atos". O banco e compartilhado entre os cenarios;
 * um numero fixo quebraria por motivo alheio e esconderia o achado atras de um vermelho de
 * contagem. O que se afirma e a COMPOSICAO: os atos DESTE plano estao la, com estas acoes, com
 * este rotulo, com este autor e com o de/para certo.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ─────────────────────────────────────────────────────────────────
 * Toda afirmacao sobre CONTEUDO e precedida da afirmacao de que a LEITURA TROUXE ALGUMA COISA.
 * `[].every(...)` e `undefined === undefined` sao verdadeiros: um filtro errado, uma entidade
 * gravada com outro nome ou uma lista vazia fariam este arquivo passar inteiro sem ter lido nada.
 *
 * Executar: cd server && node tests/api/inspecaoIntegracao.api.test.js
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

// `is_superadmin: 1` => `getPerfilFromUser` resolve ADMINISTRADOR, que tem as tres permissoes
// que este caminho exige: `gerenciar_plano_inspecao` (Etapa 27), `receber_material` e
// `inspecionar`. O harness roda o `requirePermission` REAL.
const ADMIN = {
  id: 271, nome: 'Admin Integracao E27', role: 'admin', is_superadmin: 1, email: 'e27int@test.com',
};

const sufixo = `${Date.now() % 1000000}`;

(async () => {
  console.log('\n=== Etapa 27 Task 4: integracao do plano de inspecao com medidas ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  // Estado compartilhado entre os cenarios: o caminho e UM so, percorrido em ordem.
  const ctx = {};

  await test('(1) a caracteristica cadastrada pela rota aparece no GET que a tela de inspecao le', async () => {
    // Material critico e a condicao de retencao — sem ele o recebimento entra direto no
    // disponivel e nao ha o que inspecionar.
    await dbRun(db,
      `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico','1')
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);

    const fam = await request(app).post('/api/almoxarifado/familias').send({ nome: `Fam Int E27 ${sufixo}` });
    assert.strictEqual(fam.status, 201, `setup da familia falhou: ${fam.status} ${JSON.stringify(fam.body)}`);

    const codigo = `MAT-INT-E27-${sufixo}`;
    const mat = await request(app).post('/api/almoxarifado/materiais').send({
      codigo, nome: `Eixo usinado ${codigo}`, unidade: 'UN', familia_id: fam.body.id, material_critico: 1,
    });
    assert.strictEqual(mat.status, 201, `POST material falhou: ${mat.status} ${JSON.stringify(mat.body)}`);
    ctx.materialId = mat.body.id;
    assert.ok(ctx.materialId, `o 201 do material nao trouxe id: ${JSON.stringify(mat.body)}`);

    const antes = await request(app).get('/api/almoxarifado/planos-inspecao').query({ material_id: ctx.materialId });
    assert.strictEqual(antes.status, 200, `GET planos falhou: ${antes.status} ${JSON.stringify(antes.body)}`);
    assert.ok(Array.isArray(antes.body), `GET planos nao devolveu array: ${JSON.stringify(antes.body)}`);
    assert.strictEqual(antes.body.length, 0, 'material recem-criado nao pode ja ter plano');

    // Tolerancia UNILATERAL DESLOCADA (ISO 286, eixo): os DOIS limites acima do nominal. E o caso
    // que o modelo de "magnitudes nao-negativas" da primeira versao do design nao representava —
    // aqui ele atravessa a rota inteira.
    ctx.caracteristica = `Diametro externo ${sufixo}`;
    ctx.nominalAto = 25;
    ctx.infAto = 0.005;
    ctx.supAto = 0.021;
    const criada = await request(app).post('/api/almoxarifado/planos-inspecao').send({
      material_id: ctx.materialId, caracteristica: ctx.caracteristica, unidade: 'mm',
      valor_nominal: ctx.nominalAto, desvio_inferior: ctx.infAto, desvio_superior: ctx.supAto,
    });
    assert.strictEqual(criada.status, 201,
      `POST plano falhou: ${criada.status} ${JSON.stringify(criada.body)}`);
    ctx.planoId = criada.body.id;
    assert.ok(ctx.planoId, `o 201 do plano nao trouxe id: ${JSON.stringify(criada.body)}`);

    // A MESMA rota que a tela de inspecao consumira para saber o que medir. Se o plano nao
    // aparecesse aqui, a caracteristica existiria no banco e ninguem teria como escolhe-la.
    const depois = await request(app).get('/api/almoxarifado/planos-inspecao').query({ material_id: ctx.materialId });
    assert.strictEqual(depois.status, 200, `GET planos (depois) falhou: ${depois.status}`);
    assert.ok(depois.body.length > 0,
      'o GET voltou vazio depois do POST 201 — toda assercao abaixo passaria por vacuidade');
    const encontrada = depois.body.find((p) => p.id === ctx.planoId);
    assert.ok(encontrada,
      `a caracteristica ${ctx.planoId} nao aparece no GET: ${JSON.stringify(depois.body)}`);
    assert.strictEqual(encontrada.caracteristica, ctx.caracteristica);
    assert.strictEqual(encontrada.desvio_inferior, ctx.infAto,
      `desvio inferior deslocado nao sobreviveu a rota: ${JSON.stringify(encontrada)}`);
    assert.strictEqual(encontrada.desvio_superior, ctx.supAto);
    assert.strictEqual(encontrada.ativo, 1, `caracteristica nova tinha de nascer ativa: ${JSON.stringify(encontrada)}`);
  });

  await test('(2) o material critico recebido e aprovado deixa o item RETIDO, pronto para inspecao', async () => {
    assert.ok(ctx.materialId, 'guarda: o cenario (1) precisa ter criado o material');

    ctx.qtd = 12;
    const rec = await request(app).post('/api/almoxarifado/recebimentos').send({
      nota_fiscal: `NF-INT-E27-${sufixo}`,
      itens: [{ material_id: ctx.materialId, quantidade: ctx.qtd }],
    });
    assert.strictEqual(rec.status, 201, `POST recebimento falhou: ${rec.status} ${JSON.stringify(rec.body)}`);

    const aprov = await request(app).post(`/api/almoxarifado/recebimentos/${rec.body.id}/aprovar`).send({});
    assert.strictEqual(aprov.status, 200, `aprovar falhou: ${aprov.status} ${JSON.stringify(aprov.body)}`);

    const it = await dbGet(db,
      'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.body.id]);
    assert.ok(it, 'o recebimento aprovado tinha de ter item gravado');
    ctx.itemId = it.id;
    assert.strictEqual(it.quantidade_em_inspecao, ctx.qtd,
      `o item nao ficou retido (${it.quantidade_em_inspecao} de ${ctx.qtd}) — sem retencao o cenario (3) `
      + 'nao estaria medindo a decisao de inspecao de verdade');

    // A fila que a tela de inspecao le: o item PRECISA estar la antes de ser decidido. E a
    // metade positiva da afirmacao negativa do cenario (6) ("depois de decidido, some da fila").
    const fila = await request(app).get('/api/almoxarifado/inspecoes/pendentes');
    assert.strictEqual(fila.status, 200, `GET pendentes falhou: ${fila.status}`);
    const lista = Array.isArray(fila.body) ? fila.body : (fila.body.itens || []);
    assert.ok(lista.some((p) => p.id === ctx.itemId || p.item_id === ctx.itemId),
      `o item ${ctx.itemId} nao esta na fila de inspecao pendente: ${JSON.stringify(lista).slice(0, 400)}`);
  });

  await test('(3) RN-03 pela ROTA: medida fora da tolerancia liga a divergencia SEM o payload marcar', async () => {
    assert.ok(ctx.itemId, 'guarda: o cenario (2) precisa ter deixado o item retido');

    // Faixa do ato: [25.005, 25.021]. 24.998 e o NOMINAL PURO menos um fio — num plano unilateral
    // deslocado, ate a peca "no nominal" reprova, que e o ponto do modelo com sinal.
    ctx.medido = 24.998;
    const dec = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${ctx.itemId}/inspecionar`)
      .send({
        quantidade_aprovada: ctx.qtd,
        quantidade_reprovada: 0,
        // NENHUMA flag no payload. E o ponto do cenario: a divergencia tem de nascer do numero.
        medidas: [{ plano_id: ctx.planoId, valor_medido: ctx.medido }],
      });
    assert.strictEqual(dec.status, 201,
      `inspecionar falhou: ${dec.status} ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.divergencia_dimensional, 1,
      `o RETORNO da rota tem de expor a flag derivada (veio ${JSON.stringify(dec.body.divergencia_dimensional)}) — `
      + 'sem isso a tela nao tem como saber que a marcacao manual foi ignorada');
    assert.strictEqual(dec.body.medidas_registradas, 1,
      `medidas_registradas errado: ${JSON.stringify(dec.body)}`);

    // E o que ficou GRAVADO, nao o que a resposta ecoou.
    const insp = await dbGet(db,
      'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ?', [ctx.itemId]);
    assert.ok(insp, `nenhuma inspecao gravada para o item ${ctx.itemId}`);
    ctx.inspecaoId = insp.id;
    assert.strictEqual(insp.divergencia_dimensional, 1,
      `medida ${ctx.medido} fora de [${ctx.nominalAto + ctx.infAto}, ${ctx.nominalAto + ctx.supAto}] tinha de ligar `
      + 'a flag sozinha — a divergencia nao foi derivada pela rota');
  });

  await test('(4) RN-05 a medida gravada traz os valores CONGELADOS do plano no ato', async () => {
    assert.ok(ctx.inspecaoId, 'guarda: o cenario (3) precisa ter gravado a inspecao');

    const medidas = await dbAll(db,
      'SELECT * FROM medidas_inspecao_almoxarifado WHERE inspecao_id = ? ORDER BY id', [ctx.inspecaoId]);
    assert.strictEqual(medidas.length, 1,
      `esperava 1 medida gravada, veio ${medidas.length} — a prova da reprovacao tem de estar no banco`);
    const [m] = medidas;
    assert.strictEqual(m.plano_id, ctx.planoId);
    assert.strictEqual(m.valor_medido, ctx.medido);
    assert.strictEqual(m.conforme, 0, 'a medida fora da faixa tinha de ficar gravada como NAO conforme');
    // Os cinco valores copiados do plano — e nao referenciados.
    assert.strictEqual(m.caracteristica, ctx.caracteristica, `caracteristica nao congelada: ${JSON.stringify(m)}`);
    assert.strictEqual(m.unidade, 'mm', `unidade nao congelada: ${JSON.stringify(m)}`);
    assert.strictEqual(m.valor_nominal, ctx.nominalAto);
    assert.strictEqual(m.desvio_inferior, ctx.infAto);
    assert.strictEqual(m.desvio_superior, ctx.supAto);
    // `ferramenta_id` e OPCIONAL (coluna nullable): a RN-04 garante "instrumento DECLARADO e
    // vencido nao mede", nao "toda medida tem instrumento". Aqui nenhum foi declarado.
    assert.strictEqual(m.ferramenta_id, null, `ferramenta_id tinha de ser null: ${JSON.stringify(m)}`);
  });

  await test('(5) RN-05 editar o plano DEPOIS nao reescreve a inspecao ja gravada', async () => {
    assert.ok(ctx.inspecaoId && ctx.planoId, 'guarda: os cenarios (1) e (3) precisam ter rodado');

    const novoNominal = 30;
    const put = await request(app).put(`/api/almoxarifado/planos-inspecao/${ctx.planoId}`).send({
      valor_nominal: novoNominal, desvio_inferior: -0.5, desvio_superior: 0.5,
    });
    assert.strictEqual(put.status, 200, `PUT plano falhou: ${put.status} ${JSON.stringify(put.body)}`);

    // O plano MUDOU de verdade (metade positiva: sem isto, o `strictEqual` abaixo passaria mesmo
    // que o PUT nao tivesse feito nada).
    const planoAgora = await dbGet(db,
      'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [ctx.planoId]);
    assert.strictEqual(planoAgora.valor_nominal, novoNominal,
      `o PUT nao mudou o plano (${planoAgora.valor_nominal}) — o cenario nao estaria provando congelamento`);

    const [m] = await dbAll(db,
      'SELECT * FROM medidas_inspecao_almoxarifado WHERE inspecao_id = ?', [ctx.inspecaoId]);
    assert.strictEqual(m.valor_nominal, ctx.nominalAto,
      `o nominal da medida virou ${m.valor_nominal}: o plano reescreveu a historia da inspecao antiga`);
    assert.strictEqual(m.desvio_inferior, ctx.infAto);
    assert.strictEqual(m.desvio_superior, ctx.supAto);
    assert.strictEqual(m.conforme, 0,
      'com o plano novo a medida seria conforme — o veredito congelado tambem nao pode mudar');

    const insp = await dbGet(db,
      'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [ctx.inspecaoId]);
    assert.strictEqual(insp.divergencia_dimensional, 1,
      'a divergencia derivada no ato nao pode ser apagada por uma edicao posterior do plano');
  });

  await test('(6) o saldo andou: o item saiu da fila e o retido foi baixado', async () => {
    assert.ok(ctx.itemId, 'guarda: o cenario (2) precisa ter deixado o item retido');

    const it = await dbGet(db,
      'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [ctx.itemId]);
    assert.strictEqual(it.quantidade_em_inspecao, 0,
      `o retido do item continua em ${it.quantidade_em_inspecao} — a decisao nao reivindicou o saldo`);

    const fila = await request(app).get('/api/almoxarifado/inspecoes/pendentes');
    const lista = Array.isArray(fila.body) ? fila.body : (fila.body.itens || []);
    assert.ok(!lista.some((p) => p.id === ctx.itemId || p.item_id === ctx.itemId),
      `o item ${ctx.itemId} continua na fila depois de decidido`);
  });

  await test('(7) o CADASTRO DO PLANO deixou rastro na TELA-CONTRATO da auditoria, com o rotulo certo', async () => {
    assert.ok(ctx.planoId, 'guarda: o cenario (1) precisa ter criado a caracteristica');

    // A leitura da TELA: filtro por entidade, sem `entidade_id`. So acha se o valor gravado na
    // coluna `entidade` for exatamente `plano_inspecao`.
    const trilha = await request(app).get('/api/almoxarifado/auditoria').query({ entidade: 'plano_inspecao' });
    assert.strictEqual(trilha.status, 200,
      `GET auditoria falhou: ${trilha.status} ${JSON.stringify(trilha.body)}`);

    const itens = trilha.body.itens;
    assert.ok(Array.isArray(itens),
      `a resposta nao tem \`itens\`: ${JSON.stringify(Object.keys(trilha.body))}`);
    assert.ok(itens.length > 0,
      'a trilha de `entidade=plano_inspecao` voltou VAZIA — ou a entidade foi gravada com outro '
      + 'nome, ou a auditoria nao rodou; toda assercao abaixo passaria por vacuidade');

    // COMPOSICAO, nunca total fixo: os atos DESTA caracteristica.
    const meus = itens.filter((i) => i.entidade_id === ctx.planoId);
    assert.ok(meus.length > 0,
      `nenhum ato do plano ${ctx.planoId} na trilha (${itens.length} atos lidos) — entidade_ids: `
      + JSON.stringify([...new Set(itens.map((i) => i.entidade_id))].slice(0, 10)));
    const acoes = meus.map((i) => i.acao).sort();
    assert.deepStrictEqual(acoes, ['CRIACAO', 'EDICAO'],
      `esperava exatamente a CRIACAO do cenario (1) e a EDICAO do cenario (5); veio ${JSON.stringify(acoes)}`);

    const criacao = meus.find((i) => i.acao === 'CRIACAO');
    assert.strictEqual(criacao.entidade, 'plano_inspecao',
      `entidade gravada como ${JSON.stringify(criacao.entidade)} — o filtro da tela nao a acharia`);
    assert.strictEqual(criacao.entidade_rotulo, 'Plano de inspeção',
      `entidade_rotulo cru na tela de auditoria: ${JSON.stringify(criacao.entidade_rotulo)}`);
    assert.strictEqual(criacao.usuario_id, ADMIN.id,
      `autor errado na trilha: ${JSON.stringify({ id: criacao.usuario_id, nome: criacao.usuario_nome })}`);
    const dadosNovos = JSON.parse(criacao.dados_novos || '{}');
    assert.strictEqual(dadosNovos.caracteristica, ctx.caracteristica,
      `dados_novos da CRIACAO sem a caracteristica: ${criacao.dados_novos}`);
    assert.strictEqual(dadosNovos.valor_nominal, ctx.nominalAto,
      `dados_novos da CRIACAO sem o nominal do ato: ${criacao.dados_novos}`);

    // O de/para da edicao: quem le a trilha precisa ver que o nominal MUDOU — e por que a
    // inspecao antiga, congelada, ficou diferente do plano de hoje.
    const alteracao = meus.find((i) => i.acao === 'EDICAO');
    const antes = JSON.parse(alteracao.dados_anteriores || '{}');
    const depois = JSON.parse(alteracao.dados_novos || '{}');
    assert.strictEqual(antes.valor_nominal, ctx.nominalAto,
      `dados_anteriores da EDICAO nao trazem o nominal antigo: ${alteracao.dados_anteriores}`);
    assert.strictEqual(depois.valor_nominal, 30,
      `dados_novos da EDICAO nao trazem o nominal novo: ${alteracao.dados_novos}`);
  });

  await test('(8) a decisao de inspecao NAO deixa rastro na auditoria — declarado, nao esquecido', async () => {
    assert.ok(ctx.inspecaoId, 'guarda: o cenario (3) precisa ter gravado a inspecao');

    // Metade positiva: a trilha do PLANO existe (cenario 7), entao a auditoria esta viva neste
    // banco. So depois disso a ausencia abaixo significa alguma coisa.
    const doPlano = await dbAll(db,
      "SELECT id FROM auditoria_log_almoxarifado WHERE entidade = 'plano_inspecao'");
    assert.ok(doPlano.length > 0,
      'guarda: sem nenhum ato de plano na trilha, a ausencia de ato de inspecao nao prova nada');

    const daInspecao = await dbAll(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade LIKE '%inspec%' AND entidade <> 'plano_inspecao'");
    assert.strictEqual(daInspecao.length, 0,
      'apareceu rastro de inspecao na trilha: `inspectionService` passou a auditar e a documentacao '
      + `da Etapa 27 ficou desatualizada — ${JSON.stringify(daInspecao.map((a) => a.entidade))}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
