const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarFamilia(app, nome, overrides = {}) {
  const res = await request(app).post('/api/almoxarifado/familias').send({ nome, ...overrides });
  if (res.status !== 201) throw new Error(`Falha ao criar família ${nome}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function ultimaAuditoria(db, entidadeId) {
  return dbGet(db,
    `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'material' AND entidade_id = ?
     ORDER BY id DESC LIMIT 1`, [entidadeId]);
}

(async () => {
  // Rotas de famílias (POST) usam canConfigureAlmox — exige is_superadmin (mesmo motivo dos
  // demais testes de almoxarifado). Rotas de materiais aceitam o admin default do harness.
  const { app, db, close } = await createTestApp({
    user: { id: 7, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 },
  });

  let familia;

  await test('setup: cria família para os materiais de teste', async () => {
    familia = await criarFamilia(app, 'Família Completo');
  });

  await test('POST material com payload completo → 201 e todos os campos novos persistidos', async () => {
    const payload = {
      codigo: 'MAT-FULL-001',
      nome: 'Material Completo',
      familia_id: familia.id,
      unidade: 'UN',
      fabricante: 'ACME Ltda',
      codigo_fabricante: 'ACME-XPTO-1',
      peso_unitario: 12.5,
      dimensoes: '100x50x30mm',
      material_construtivo: 'Aço inox 304',
      norma: 'NBR 1234',
      marca: 'MarcaX',
      modelo: 'ModeloY',
      aplicacao: 'Vedação hidráulica',
      ponto_reposicao: 15,
      lote_economico: 50,
      controle_serie: 1,
      controle_validade: 1,
      controle_corrida: 1,
      requer_inspecao: 1,
      requer_foto: 1,
      classe_abc: 'A',
      unidade_compra: 'CX',
      fator_conversao_compra: 12,
      unidade_consumo: 'UN',
      fator_conversao_consumo: 1,
    };
    const res = await request(app).post('/api/almoxarifado/materiais').send(payload);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(row.fabricante, 'ACME Ltda');
    assert.strictEqual(row.codigo_fabricante, 'ACME-XPTO-1');
    assert.strictEqual(row.peso_unitario, 12.5);
    assert.strictEqual(row.dimensoes, '100x50x30mm');
    assert.strictEqual(row.material_construtivo, 'Aço inox 304');
    assert.strictEqual(row.norma, 'NBR 1234');
    assert.strictEqual(row.marca, 'MarcaX');
    assert.strictEqual(row.modelo, 'ModeloY');
    assert.strictEqual(row.aplicacao, 'Vedação hidráulica');
    assert.strictEqual(row.ponto_reposicao, 15);
    assert.strictEqual(row.lote_economico, 50);
    assert.strictEqual(row.controle_serie, 1);
    assert.strictEqual(row.controle_validade, 1);
    assert.strictEqual(row.controle_corrida, 1);
    assert.strictEqual(row.requer_inspecao, 1);
    assert.strictEqual(row.requer_foto, 1);
    assert.strictEqual(row.classe_abc, 'A');
    assert.strictEqual(row.unidade_compra, 'CX');
    assert.strictEqual(row.fator_conversao_compra, 12);
    assert.strictEqual(row.unidade_consumo, 'UN');
    assert.strictEqual(row.fator_conversao_consumo, 1);
  });

  await test('POST registra auditoria de CRIACAO', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-FULL-002', nome: 'Material Auditado', familia_id: familia.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const log = await ultimaAuditoria(db, res.body.id);
    assert.ok(log, 'deveria existir linha de auditoria para o material criado');
    assert.strictEqual(log.acao, 'CRIACAO');
    const dadosNovos = JSON.parse(log.dados_novos);
    assert.strictEqual(dadosNovos.codigo, 'MAT-FULL-002');
    assert.strictEqual(dadosNovos.nome, 'Material Auditado');
    assert.strictEqual(dadosNovos.familia_id, familia.id);
  });

  await test('POST fator_conversao_compra: 0 com unidade_compra informada → 400 citando fator', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-003', nome: 'Material Fator Zero', familia_id: familia.id,
      unidade_compra: 'CX', fator_conversao_compra: 0,
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/fator/i.test(res.body.error), `mensagem deveria citar "fator": ${res.body.error}`);
  });

  await test('POST unidade_consumo sem fator_conversao_consumo → 400 citando fator', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-003B', nome: 'Material Sem Fator Consumo', familia_id: familia.id,
      unidade_consumo: 'UN',
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/fator_conversao_consumo/i.test(res.body.error), `mensagem deveria citar o campo: ${res.body.error}`);
  });

  await test('POST classe_abc inválida (X) → 400', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-004', nome: 'Material Classe Invalida', familia_id: familia.id, classe_abc: 'X',
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST peso_unitario como string → 400 Zod (shape inválido)', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-005', nome: 'Material Peso String', familia_id: familia.id, peso_unitario: 'abc',
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('REGRESSÃO: POST sem familia_id → 400', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-FULL-006', nome: 'Material Sem Familia' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('REGRESSÃO: POST código duplicado → 400 Código já existe', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-FULL-001', nome: 'Material Duplicado', familia_id: familia.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Código já existe');
  });

  await test('REGRESSÃO: POST payload mínimo (codigo/nome/familia_id/unidade) → 201', async () => {
    const res = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-FULL-007', nome: 'Material Minimo', familia_id: familia.id, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('PUT altera nome+marca → auditoria com dados_anteriores/dados_novos SÓ dos campos alterados', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-008', nome: 'Nome Original', familia_id: familia.id, marca: 'Marca Original',
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`).send({
      codigo: 'MAT-FULL-008', nome: 'Nome Novo', familia_id: familia.id, marca: 'Marca Nova',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const log = await ultimaAuditoria(db, criado.body.id);
    assert.ok(log, 'deveria existir linha de auditoria da edição');
    assert.strictEqual(log.acao, 'ATUALIZACAO');
    const antes = JSON.parse(log.dados_anteriores);
    const depois = JSON.parse(log.dados_novos);
    assert.strictEqual(antes.nome, 'Nome Original');
    assert.strictEqual(depois.nome, 'Nome Novo');
    assert.strictEqual(antes.marca, 'Marca Original');
    assert.strictEqual(depois.marca, 'Marca Nova');
    // Só os campos alterados — codigo e familia_id foram reenviados mas não mudaram.
    assert.ok(!('codigo' in antes), `dados_anteriores não deveria conter codigo inalterado: ${log.dados_anteriores}`);
    assert.ok(!('familia_id' in antes), `dados_anteriores não deveria conter familia_id inalterado: ${log.dados_anteriores}`);
  });

  await test('PUT sem alterações → não grava nova linha de auditoria', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-009', nome: 'Material Estavel', familia_id: familia.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const antesCount = await dbAll(db,
      `SELECT id FROM auditoria_log_almoxarifado WHERE entidade='material' AND entidade_id=?`, [criado.body.id]);

    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`).send({
      codigo: 'MAT-FULL-009', nome: 'Material Estavel', familia_id: familia.id,
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const depoisCount = await dbAll(db,
      `SELECT id FROM auditoria_log_almoxarifado WHERE entidade='material' AND entidade_id=?`, [criado.body.id]);
    assert.strictEqual(depoisCount.length, antesCount.length, 'PUT sem mudanças não deveria gravar auditoria nova');
  });

  await test('PUT no formato da UI atual (sem campos novos) preserva fabricante/classe_abc/unidade_compra setados via API', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-010', nome: 'Material Preservar Campos Novos', familia_id: familia.id,
      fabricante: 'Fabricante API', classe_abc: 'B', unidade_compra: 'CX', fator_conversao_compra: 10,
      peso_unitario: 3.2, controle_serie: 1,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    // Fix pós-review (Critical): o comentário anterior deste teste presumia que o form "limpa"
    // strings vazias antes de mandar o PUT — ERRADO. `handleSubmit` espalha `...form` inteiro;
    // os únicos campos convertidos são familia_id/localizacao_padrao_id (parseInt/null
    // explícitos no próprio handleSubmit). Os demais — incluindo os numéricos
    // quantidade_atual/minima/maxima e custo_unitario — vão exatamente como estão no `form`
    // state: string vinda de `e.target.value`, ou (quando carregados via loadMaterial() e nunca
    // editados) o valor numérico bruto devolvido pela API. Este payload reproduz fielmente o
    // que handleSubmit manda ao reeditar MAT-FULL-010 (criado com os numéricos zerados por
    // default e os textuais em branco) mudando só nome/categoria — prova que a preservação dos
    // campos novos do Task 4 funciona com o shape REAL da tela, não uma versão idealizada dele.
    const payloadUiAtual = {
      codigo: 'MAT-FULL-010',
      nome: 'Material Renomeado pela UI',
      descricao: '',
      categoria: 'CONSUMÍVEL',
      unidade: 'UN',
      familia_id: familia.id,
      localizacao_padrao_id: null,
      quantidade_atual: 0,
      quantidade_minima: 0,
      quantidade_maxima: 0,
      custo_unitario: 0,
      fornecedor_principal: '',
      codigo_fornecedor: '',
      ncm: '',
      especificacoes: '',
      observacoes: '',
    };
    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`).send(payloadUiAtual);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.nome, 'Material Renomeado pela UI');
    assert.strictEqual(res.body.fabricante, 'Fabricante API', 'fabricante deveria ter sido preservado');
    assert.strictEqual(res.body.classe_abc, 'B', 'classe_abc deveria ter sido preservado');
    assert.strictEqual(res.body.unidade_compra, 'CX', 'unidade_compra deveria ter sido preservado');
    assert.strictEqual(res.body.fator_conversao_compra, 10, 'fator_conversao_compra deveria ter sido preservado');
    assert.strictEqual(res.body.peso_unitario, 3.2, 'peso_unitario deveria ter sido preservado');
    assert.strictEqual(res.body.controle_serie, 1, 'controle_serie deveria ter sido preservado');

    const row = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.fabricante, 'Fabricante API');
    assert.strictEqual(row.classe_abc, 'B');
    assert.strictEqual(row.unidade_compra, 'CX');
    assert.strictEqual(row.fator_conversao_compra, 10);
    assert.strictEqual(row.peso_unitario, 3.2);
    assert.strictEqual(row.controle_serie, 1);
    assert.strictEqual(row.nome, 'Material Renomeado pela UI');
  });

  await test('PUT classe_abc inválida (X) → 400', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'MAT-FULL-011', nome: 'Material PUT Classe', familia_id: familia.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`)
      .send({ classe_abc: 'X' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // ── Fix pós-review (Critical): MaterialAlmoxarifadoForm.js espalha `form` inteiro no
  // submit — inputs de texto/número guardam STRING no state (`e.target.value`), nunca number.
  // Um campo nunca tocado chega como `''`; um campo preenchido chega como `'10'`. Sem coerção
  // no schema, `z.number()` rejeitava os dois casos — qualquer submit do formulário real
  // (criar OU editar material) quebrava com 400. Os dois testes abaixo reproduzem o payload
  // EXATO que a tela manda (strings, incluindo vazias), não uma versão já tipada pelo teste. ──

  await test('POST com payload exatamente como o form atual envia (strings/vazios) → 201 e números coagidos corretamente', async () => {
    const payloadFormReal = {
      codigo: 'FORM-1',
      nome: 'Via Form',
      descricao: '',
      categoria: 'CONSUMÍVEL',
      unidade: 'UN',
      familia_id: String(familia.id), // <select> guarda string no state do form
      localizacao_padrao_id: null, // já convertido por handleSubmit (parseInt/null explícitos)
      quantidade_atual: '',
      quantidade_minima: '10',
      quantidade_maxima: '',
      custo_unitario: '',
      fornecedor_principal: '',
      codigo_fornecedor: '',
      ncm: '',
      especificacoes: '',
      observacoes: '',
    };
    const res = await request(app).post('/api/almoxarifado/materiais').send(payloadFormReal);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const row = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(row.familia_id, familia.id, 'familia_id "3" (string) deveria ter sido coagido para número');
    assert.strictEqual(row.quantidade_minima, 10, 'string "10" deveria ter sido coagida para número 10');
    assert.strictEqual(row.quantidade_atual, 0, 'string vazia deveria cair no default 0 (nunca NaN)');
    assert.strictEqual(row.quantidade_maxima, 0);
    assert.strictEqual(row.custo_unitario, 0);
  });

  await test('PUT com payload no mesmo formato do form (strings/vazios) → 200 e números coagidos corretamente', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'FORM-2', nome: 'Via Form Original', familia_id: familia.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`).send({
      codigo: 'FORM-2',
      nome: 'Via Form Editado',
      descricao: '',
      categoria: 'CONSUMÍVEL',
      unidade: 'UN',
      familia_id: String(familia.id),
      localizacao_padrao_id: null,
      quantidade_minima: '20',
      quantidade_maxima: '',
      custo_unitario: '15.5',
      fornecedor_principal: '',
      codigo_fornecedor: '',
      ncm: '',
      especificacoes: '',
      observacoes: '',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.quantidade_minima, 20);
    assert.strictEqual(res.body.custo_unitario, 15.5);
    assert.strictEqual(res.body.nome, 'Via Form Editado');

    const row = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.quantidade_minima, 20);
    assert.strictEqual(row.custo_unitario, 15.5);
  });

  await test('subfamilia_id: null explícito continua limpando o vínculo mesmo com a coerção nova (não vira "preservar")', async () => {
    const raiz = await criarFamilia(app, 'Raiz Coercao Null');
    const sub = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Sub Coercao Null', parent_id: raiz.id });
    assert.strictEqual(sub.status, 201, JSON.stringify(sub.body));

    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'FORM-3', nome: 'Material Sub Null', familia_id: raiz.id, subfamilia_id: sub.body.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    assert.strictEqual(criado.body.subfamilia_id, sub.body.id);

    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`)
      .send({ codigo: 'FORM-3', nome: 'Material Sub Null', familia_id: raiz.id, subfamilia_id: null });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.subfamilia_id, null, 'null explícito ainda precisa limpar o vínculo (não pode virar undefined/preservar)');
  });

  await test('MINOR: PUT ativo:false (boolean) é normalizado para 0 na coluna (FlagSchema tolerante)', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'FORM-4', nome: 'Material Ativo Bool', familia_id: familia.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`).send({ ativo: false });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ativo, 0);

    const row = await dbGet(db, 'SELECT ativo FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.ativo, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
