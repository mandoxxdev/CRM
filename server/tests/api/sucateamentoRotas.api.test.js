/**
 * Etapa 9, Task 7 — a camada HTTP do sucateamento (rotas, upload do comprovante, relatorio
 * financeiro) sobre o servico que a Task 6 ja entregou e testou por dentro
 * (sucateamento.api.test.js, sucateamentoAprovacao.api.test.js). Este arquivo NAO reprova a
 * regra de negocio — prova que a ROTA fez a coisa certa: qual gate cada rota usa (ou nao usa, de
 * proposito), e o caso concreto que motivou cada excecao ao padrao `requirePermission`.
 *
 * ── OS TRES GATES QUE NAO SAO `requirePermission` ────────────────────────────────────────────
 *
 * `/rejeitar` e `/destino` sao gateados por "aprova QUALQUER uma das duas pernas" — um OU de duas
 * acoes que `requirePermission` (uma acao so) nao exprime. `/destino` fica SO com `auth`: o
 * plano original previa `requirePermission('movimentar')`, mas a Task 6 entregou o servico
 * gateando pela UNIAO das duas acoes de aprovacao (ADMINISTRADOR, ALMOXARIFE, GESTOR) — a
 * interseccao que `movimentar` daria excluiria o GESTOR EM SILENCIO. `/cancelar` fica com
 * `requirePermission('movimentar')` porque o UNICO caminho HTTP para solicitar
 * (`POST /sucateamentos`) ja exige `movimentar` — todo solicitante real ja tem o gate.
 *
 * ── O TESTE QUE PROVA A COERCAO DO MULTIPART ──────────────────────────────────────────────────
 *
 * `POST /:id/destino` e multipart (multer): TODO campo chega como STRING, `valor_venda`
 * incluso. `SucateamentoDestinoFormSchema` (schemas.js) usa `numFromForm` para isso — sem a
 * coercao, `valor_venda: '1500.50'` cairia no `z.number()` puro e devolveria 400 em QUALQUER
 * venda de sucata anexando comprovante, que e o caso comum.
 *
 * ── ORFAO EM DISCO ─────────────────────────────────────────────────────────────────────────────
 *
 * `/destino` nao tem `requirePermission` na frente do multer (nao tem como ter — o gate e uma
 * uniao de acoes), entao o arquivo e gravado em disco ANTES de sabermos se o pedido vai ser
 * aceito. Toda saida que nao for 200 tem de limpar o arquivo. `contarComprovantes()` mede isso
 * contando arquivos em disco antes/depois — nao confia so no corpo da resposta.
 *
 * Executar: cd server && node tests/api/sucateamentoRotas.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const returnService = require('../../services/almoxarifado/returnService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Ana Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const ALMOXARIFE2 = { id: 5, nome: 'Bia Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 3, nome: 'Gil Gestor', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 4, nome: 'Pedro Producao', perfil_almoxarifado: 'PRODUCAO' };

const JUST = 'chapa oxidada no patio, sem recuperacao';

let seq = 0;
async function novoMaterial(db, { atual = 100 } = {}) {
  seq += 1;
  const codigo = `SUCR-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, tipo_material, ativo)
    VALUES (?,?,'UN',?,'ACO',1)`, [codigo, `Material rota sucata ${seq}`, atual]);
  return { id: r.lastID, codigo };
}

/** Material com custo controlado — a lição da 8c (custoUnitarioFonteUnica): um SO com
 * `custo_unitario` (custo_medio fica no DEFAULT 0, a classe que o COALESCE antigo zerava) e um
 * COM `custo_medio > 0` (para o CASE morder o outro braço). */
async function novoMaterialCusto(db, { custo_unitario = 10, custo_medio = null, atual = 100 } = {}) {
  seq += 1;
  const cols = ['codigo', 'nome', 'unidade', 'quantidade_atual', 'custo_unitario', 'tipo_material', 'ativo'];
  const vals = [`SUCF-${seq}`, `Material financeiro ${seq}`, 'UN', atual, custo_unitario, 'ACO', 1];
  if (custo_medio !== null) { cols.push('custo_medio'); vals.push(custo_medio); }
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);
  return { id: r.lastID, codigo: vals[0] };
}

const linha = async (db, id) => dbGet(db, 'SELECT * FROM sucateamentos_almoxarifado WHERE id = ?', [id]);

(async () => {
  const { app, db, setUser, close, uploadsAlmoxDir } = await createTestApp({ user: ADMIN });

  const contarComprovantes = () => {
    try { return fs.readdirSync(uploadsAlmoxDir).filter((f) => f.startsWith('comprovante-sucata-')).length; }
    catch (e) { return 0; }
  };

  /** Solicita (ALMOXARIFE) e aprova as DUAS pernas (ALMOXARIFE2 + GESTOR — nenhum deles é o
   * solicitante, senão a barreira 2 do serviço recusaria). Devolve o id, já APROVADO com baixa
   * emitida. */
  async function novoAprovado(materialId, quantidade = 10, classificacao = null) {
    setUser(ALMOXARIFE);
    const criado = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: materialId, quantidade, justificativa: JUST, classificacao });
    assert.strictEqual(criado.status, 201, `solicitacao de apoio falhou: ${JSON.stringify(criado.body)}`);
    const id = criado.body.id;
    setUser(ALMOXARIFE2);
    const almox = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-almoxarifado`).send({});
    assert.strictEqual(almox.status, 200, `aprovacao almoxarifado de apoio falhou: ${JSON.stringify(almox.body)}`);
    setUser(GESTOR);
    const gestao = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-gestao`).send({});
    assert.strictEqual(gestao.status, 200, `aprovacao gestao de apoio falhou: ${JSON.stringify(gestao.body)}`);
    // `aprovar()` devolve { sucateamento, baixa_emitida, movimentacao_sucata_id }, nao a linha crua.
    assert.strictEqual(gestao.body.sucateamento.status, 'APROVADO');
    assert.strictEqual(gestao.body.baixa_emitida, true);
    return id;
  }

  // ── POST /sucateamentos ──────────────────────────────────────────────────────────────────────
  await test('[POST /sucateamentos] ALMOXARIFE (movimentar) solicita -> 201 SOLICITADO', async () => {
    const m = await novoMaterial(db);
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 15, justificativa: JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'SOLICITADO');
    assert.strictEqual(res.body.material_id, m.id);
    assert.strictEqual(res.body.solicitante_id, ALMOXARIFE.id);
  });

  await test('[POST /sucateamentos] GESTOR nao tem movimentar -> 403, nada criado', async () => {
    const m = await novoMaterial(db);
    const antes = await dbGet(db, 'SELECT COUNT(*) AS c FROM sucateamentos_almoxarifado WHERE material_id = ?', [m.id]);
    setUser(GESTOR);
    const res = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 15, justificativa: JUST });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    const depois = await dbGet(db, 'SELECT COUNT(*) AS c FROM sucateamentos_almoxarifado WHERE material_id = ?', [m.id]);
    assert.strictEqual(depois.c, antes.c, 'criou sucateamento apesar do 403');
  });

  await test('[POST /sucateamentos] payload invalido (sem justificativa) -> 400 do validate()', async () => {
    const m = await novoMaterial(db);
    setUser(ALMOXARIFE);
    const res = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 15 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /justificativa/i);
  });

  // ── GET /sucateamentos ───────────────────────────────────────────────────────────────────────
  await test('[GET /sucateamentos] so auth (CONSULTA/PRODUCAO ve) e filtra por status e material_id', async () => {
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    setUser(ALMOXARIFE);
    await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m1.id, quantidade: 5, justificativa: JUST });
    await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m2.id, quantidade: 5, justificativa: JUST });

    setUser(PRODUCAO);
    const todos = await request(app).get('/api/almoxarifado/sucateamentos');
    assert.strictEqual(todos.status, 200, JSON.stringify(todos.body));
    assert.ok(todos.body.length >= 2);

    const filtrado = await request(app).get(`/api/almoxarifado/sucateamentos?status=SOLICITADO&material_id=${m1.id}`);
    assert.strictEqual(filtrado.status, 200);
    assert.ok(filtrado.body.length >= 1);
    for (const row of filtrado.body) {
      assert.strictEqual(row.status, 'SOLICITADO');
      assert.strictEqual(row.material_id, m1.id);
    }
  });

  // ── Aprovacao: as duas pernas gateadas por requirePermission de UMA acao so ────────────────────
  await test('[POST /:id/aprovar-almoxarifado] PRODUCAO -> 403', async () => {
    const m = await novoMaterial(db);
    setUser(ALMOXARIFE);
    const criado = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 5, justificativa: JUST });
    setUser(PRODUCAO);
    const res = await request(app).post(`/api/almoxarifado/sucateamentos/${criado.body.id}/aprovar-almoxarifado`).send({});
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual((await linha(db, criado.body.id)).status, 'SOLICITADO');
  });

  await test('[POST /:id/aprovar-gestao] ALMOXARIFE (perna errada) -> 403; GESTOR (perna certa) -> 200', async () => {
    const m = await novoMaterial(db);
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 5, justificativa: JUST });

    setUser(ALMOXARIFE);
    const errado = await request(app).post(`/api/almoxarifado/sucateamentos/${criado.body.id}/aprovar-gestao`).send({});
    assert.strictEqual(errado.status, 403, JSON.stringify(errado.body));
    assert.strictEqual((await linha(db, criado.body.id)).aprovador_gestao_id, null);

    // CONTROLE POSITIVO: a perna certa funciona — sem ele, um gate escrito largo demais (ex.:
    // recusar TODO mundo) passaria no teste acima e a rota estaria simplesmente quebrada.
    setUser(GESTOR);
    const certo = await request(app).post(`/api/almoxarifado/sucateamentos/${criado.body.id}/aprovar-gestao`).send({});
    assert.strictEqual(certo.status, 200, JSON.stringify(certo.body));
    assert.strictEqual(certo.body.sucateamento.aprovador_gestao_id, GESTOR.id);
  });

  await test('[fluxo completo via HTTP] as duas pernas fecham o processo e emitem a baixa', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const id = await novoAprovado(m.id, 30);
    const row = await linha(db, id);
    assert.strictEqual(row.status, 'APROVADO');
    assert.ok(row.movimentacao_sucata_id, 'a baixa nao foi emitida pelo fluxo HTTP');
    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(mat.quantidade_atual, 70);
  });

  // ── Rejeitar: OR de duas acoes, middleware inline ───────────────────────────────────────────
  await test('[POST /:id/rejeitar] quem nao aprova NENHUMA perna -> 403; sem motivo -> 400; com motivo -> 200', async () => {
    const m = await novoMaterial(db);
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 5, justificativa: JUST });
    const id = criado.body.id;

    setUser(PRODUCAO);
    const semPermissao = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/rejeitar`).send({ motivo: 'nao quero' });
    assert.strictEqual(semPermissao.status, 403, JSON.stringify(semPermissao.body));

    setUser(ALMOXARIFE);
    const semMotivo = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/rejeitar`).send({});
    assert.strictEqual(semMotivo.status, 400, JSON.stringify(semMotivo.body));
    assert.match(semMotivo.body.error, /motivo/i);

    const comMotivo = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/rejeitar`)
      .send({ motivo: 'material ainda util, achou comprador interno' });
    assert.strictEqual(comMotivo.status, 200, JSON.stringify(comMotivo.body));
    assert.strictEqual(comMotivo.body.status, 'REJEITADO');
  });

  // ── Cancelar: requirePermission('movimentar') que nao bloqueia ninguem legitimo ─────────────────
  await test('[POST /:id/cancelar] so o solicitante cancela — outro ALMOXARIFE leva 403 do SERVICO', async () => {
    const m = await novoMaterial(db);
    setUser(ALMOXARIFE);
    const criado = await request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 5, justificativa: JUST });
    const id = criado.body.id;

    setUser(ALMOXARIFE2);
    const outroUsuario = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/cancelar`).send({});
    assert.strictEqual(outroUsuario.status, 403, JSON.stringify(outroUsuario.body));
    assert.match(outroUsuario.body.error, /solicitante/i);

    setUser(ALMOXARIFE);
    const proprioSolicitante = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/cancelar`).send({});
    assert.strictEqual(proprioSolicitante.status, 200, JSON.stringify(proprioSolicitante.body));
    assert.strictEqual(proprioSolicitante.body.status, 'CANCELADO');
  });

  // ── Destino: so auth, multipart, coercao numFromForm, e limpeza de orfao ───────────────────────
  await test('[POST /:id/destino] VENDIDA sem valor_venda -> 400, e o comprovante anexado NAO fica orfao', async () => {
    const m = await novoMaterial(db);
    const id = await novoAprovado(m.id, 10);
    setUser(ALMOXARIFE2);
    const antes = contarComprovantes();
    const res = await request(app)
      .post(`/api/almoxarifado/sucateamentos/${id}/destino`)
      .field('destino', 'VENDIDA')
      .attach('comprovante', Buffer.from('%PDF-1.4 sem valor'), 'sem-valor.pdf');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /valor/i);
    assert.strictEqual(contarComprovantes(), antes, 'o 400 do Zod deixou o comprovante orfao em disco');
    assert.strictEqual((await linha(db, id)).status, 'APROVADO', 'mudou o status mesmo recusando');
  });

  await test('[POST /:id/destino] multipart VENDIDA com valor_venda em STRING funciona (numFromForm)', async () => {
    const m = await novoMaterial(db);
    const id = await novoAprovado(m.id, 10);
    setUser(ALMOXARIFE2);
    const antes = contarComprovantes();
    const res = await request(app)
      .post(`/api/almoxarifado/sucateamentos/${id}/destino`)
      .field('destino', 'VENDIDA')
      .field('valor_venda', '1500.50')
      .attach('comprovante', Buffer.from('%PDF-1.4 nf sucata'), 'nf.pdf');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'VENDIDA');
    assert.strictEqual(res.body.valor_venda, 1500.5, 'valor_venda em string (multipart) nao foi coagido para numero');
    assert.match(res.body.comprovante_arquivo, /^comprovante-sucata-\d+-\d+\.pdf$/);
    assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, res.body.comprovante_arquivo)),
      'o comprovante nao foi gravado em disco');
    assert.strictEqual(contarComprovantes(), antes + 1);
  });

  await test('[POST /:id/destino] DESCARTADA sem valor nem comprovante funciona (os dois sao opcionais)', async () => {
    const m = await novoMaterial(db);
    const id = await novoAprovado(m.id, 10);
    setUser(GESTOR);
    const res = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/destino`).field('destino', 'DESCARTADA');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'DESCARTADA');
    assert.strictEqual(res.body.comprovante_arquivo, null);
  });

  await test('[POST /:id/destino] PRODUCAO nao aprova nenhuma perna -> 403 do SERVICO, sem orfao', async () => {
    const m = await novoMaterial(db);
    const id = await novoAprovado(m.id, 10);
    setUser(PRODUCAO);
    const antes = contarComprovantes();
    const res = await request(app)
      .post(`/api/almoxarifado/sucateamentos/${id}/destino`)
      .field('destino', 'DESCARTADA')
      .attach('comprovante', Buffer.from('%PDF-1.4 producao tentando'), 'x.pdf');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.strictEqual(contarComprovantes(), antes, 'o 403 do servico deixou o comprovante orfao em disco');
    assert.strictEqual((await linha(db, id)).status, 'APROVADO');
  });

  await test('[POST /:id/destino] registrar destino DUAS vezes: a segunda cai na maquina de estados (400) e nao deixa orfao', async () => {
    // DESCARTADA/VENDIDA sao estados FINAIS (scrapDisposalStateMachine.TRANSICOES): a segunda
    // chamada sequencial encontra o sucateamento ja fora de APROVADO e cai em
    // `validarTransicao`, que devolve 400 (nao 409 — 409 e so o CLAIM perdendo uma corrida
    // concorrente, cenario diferente deste, ja coberto a nivel de servico em
    // sucateamentoAprovacao.api.test.js).
    const m = await novoMaterial(db);
    const id = await novoAprovado(m.id, 10);
    setUser(GESTOR);
    const primeira = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/destino`).field('destino', 'DESCARTADA');
    assert.strictEqual(primeira.status, 200, JSON.stringify(primeira.body));

    const antes = contarComprovantes();
    const segunda = await request(app)
      .post(`/api/almoxarifado/sucateamentos/${id}/destino`)
      .field('destino', 'DESCARTADA')
      .attach('comprovante', Buffer.from('%PDF-1.4 segunda tentativa'), 'y.pdf');
    assert.strictEqual(segunda.status, 400, JSON.stringify(segunda.body));
    assert.match(segunda.body.error, /transi[cç][aã]o/i);
    assert.strictEqual(contarComprovantes(), antes, 'a tentativa recusada deixou o comprovante orfao em disco');
  });

  // ── Relatorio financeiro (dispatcher 'sucata-financeiro') ───────────────────────────────────────
  //
  // Instancia PROPRIA (app2/db2), isolada da bateria acima: o relatorio soma SUCATA do modulo
  // INTEIRO (nao aceita material_id) e os testes anteriores ja lancaram varias sucatas no `db`
  // compartilhado — somar totais exatos ali contaria fixture de OUTRO teste. Isolar e mais simples
  // e mais honesto que tentar subtrair o que ja existia.
  await test('[GET /relatorios/sucata-financeiro] le o LIVRO: soma sucata do processo E da devolucao', async () => {
    const iso = await createTestApp({ user: ADMIN });
    try {
      // Material A: custo_medio > 0 (o CASE morde o braco custo_medio).
      const matA = await novoMaterialCusto(iso.db, { custo_unitario: 10, custo_medio: 15, atual: 100 });
      // Material B: SO custo_unitario, custo_medio no DEFAULT 0 — a classe que o COALESCE antigo
      // zerava (custoUnitarioFonteUnica.api.test.js).
      const matB = await novoMaterialCusto(iso.db, { custo_unitario: 8, custo_medio: null, atual: 50 });

      // Origem 1: o PROCESSO de dupla aprovacao (Task 6/7), com classificacao e depois VENDIDA.
      iso.setUser(ALMOXARIFE);
      const criado = await request(iso.app).post('/api/almoxarifado/sucateamentos')
        .send({ material_id: matA.id, quantidade: 20, justificativa: JUST, classificacao: 'aço carbono' });
      assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
      const idA = criado.body.id;
      iso.setUser(ALMOXARIFE2);
      const almox = await request(iso.app).post(`/api/almoxarifado/sucateamentos/${idA}/aprovar-almoxarifado`).send({});
      assert.strictEqual(almox.status, 200, JSON.stringify(almox.body));
      iso.setUser(GESTOR);
      const gestao = await request(iso.app).post(`/api/almoxarifado/sucateamentos/${idA}/aprovar-gestao`).send({});
      assert.strictEqual(gestao.status, 200, JSON.stringify(gestao.body));
      assert.strictEqual(gestao.body.sucateamento.status, 'APROVADO');

      iso.setUser(ALMOXARIFE2);
      const venda = await request(iso.app)
        .post(`/api/almoxarifado/sucateamentos/${idA}/destino`)
        .field('destino', 'VENDIDA').field('valor_venda', '250');
      assert.strictEqual(venda.status, 200, JSON.stringify(venda.body));

      // Origem 2: devolucao ao cliente com destino SUCATA (Etapa 7) — SEM processo de aprovacao,
      // sem classificacao, e MESMO ASSIM tem de aparecer no relatorio (e o ponto da spec 12).
      await returnService.registrarDevolucao(iso.db, ADMIN, {
        material_id: matB.id, quantidade: 5, motivo: 'DANIFICADO', destino: 'SUCATA',
        observacoes: 'devolvido quebrado, sem conserto possivel',
      });

      iso.setUser(ADMIN);
      const res = await request(iso.app).get('/api/almoxarifado/relatorios/sucata-financeiro');
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));

      const movA = res.body.movimentacoes.find((m) => m.material_id === matA.id);
      const movB = res.body.movimentacoes.find((m) => m.material_id === matB.id);
      assert.ok(movA, 'a sucata do PROCESSO nao apareceu no relatorio');
      assert.ok(movB, 'a sucata da DEVOLUCAO nao apareceu no relatorio — o relatorio nao esta lendo o livro');
      assert.strictEqual(movA.quantidade, 20);
      assert.strictEqual(movA.valor_estimado, 300, 'custo_medio (15) deveria mandar: 20 * 15');
      assert.strictEqual(movA.classificacao, 'aço carbono');
      assert.strictEqual(movB.quantidade, 5);
      assert.strictEqual(movB.valor_estimado, 40, 'sem custo_medio, deveria cair para custo_unitario (8): 5 * 8, nao zero');
      assert.strictEqual(movB.classificacao, null, 'devolucao-destino-sucata nao tem classificacao de processo');

      const vendaA = res.body.vendas.find((v) => v.material_id === matA.id);
      assert.ok(vendaA, 'a venda registrada nao apareceu em vendas');
      assert.strictEqual(vendaA.valor_venda, 250);

      assert.strictEqual(res.body.totais.quantidade_sucateada, 25);
      assert.strictEqual(res.body.totais.valor_estimado_total, 340, '300 (A) + 40 (B)');
      assert.strictEqual(res.body.totais.valor_vendido_total, 250);

      const bucketAco = res.body.por_classificacao.find((c) => c.classificacao === 'aço carbono');
      assert.ok(bucketAco);
      assert.strictEqual(bucketAco.quantidade, 20);
      assert.strictEqual(bucketAco.valor_estimado, 300);
      assert.strictEqual(bucketAco.valor_vendido, 250);

      const bucketSemClass = res.body.por_classificacao.find((c) => c.classificacao === 'SEM CLASSIFICACAO');
      assert.ok(bucketSemClass, 'a sucata sem classificacao (devolucao) nao ficou agrupada');
      assert.strictEqual(bucketSemClass.quantidade, 5);
      assert.strictEqual(bucketSemClass.valor_estimado, 40);
      assert.strictEqual(bucketSemClass.valor_vendido, 0);

      assert.match(res.body.nota, /custo atual/i, 'o relatorio nao declara a limitacao da valoracao (decisao 10 da 8c)');

      // Filtro de periodo: uma data-fim no passado exclui TUDO — prova que `ate` filtra de verdade.
      const filtrado = await request(iso.app).get('/api/almoxarifado/relatorios/sucata-financeiro?ate=2020-01-01');
      assert.strictEqual(filtrado.status, 200);
      assert.strictEqual(filtrado.body.movimentacoes.length, 0);
      assert.strictEqual(filtrado.body.totais.valor_estimado_total, 0);
    } finally {
      await iso.close();
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
