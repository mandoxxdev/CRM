/**
 * Etapa 78 (T1) — o documento IMPRESSO do pedido de compra: `GET /api/compras/pedidos/:id/documento`
 * (HTML) e `/documento.pdf` (PDF pelo Chromium da proposta). RN-78.01, RN-78.04, RN-78.05.
 *
 * ⚠️ `comprasPedidoDocumento.api.test.js` e o da Etapa 39 (o documento como DADOS); este e o da 78
 * (o documento como PAPEL). Nao fundir.
 *
 * O que este arquivo prova e o que se proibe de fingir:
 * - a FIACAO do PDF (status, `Content-Type`, `Content-Disposition`, corpo `%PDF`), nao o Chromium:
 *   o harness injeta um `gerarPdfDeHtml` FALSO que devolve `%PDF-FAKE\n` + o HTML. A prova real
 *   (Chromium de verdade) e a do curl da T3, registrada no plano — nunca neste arquivo;
 * - `lerEmpresa(db)` tolera "no such table" (o harness NAO cria `configuracoes`; o teste da 39
 *   afirma esse fallback por escrito). A tabela minima e criada AQUI, num cenario proprio, e o
 *   cabecalho passa a sair com o CNPJ/IE da empresa;
 * - 503 quando o 5o argumento do registrador nao traz `gerarPdfDeHtml` (harness antigo): montado
 *   um segundo app, sem a chave, no proprio arquivo;
 * - o 403 do modulo nao e testavel (o `fakeCheckModulePermission` e no-op): prova-se 401 e leitura.
 *
 * Executar: cd server && node tests/api/comprasPedidoImpresso.api.test.js
 */
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const multer = require('multer');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { lerEmpresa, EMPRESA_PADRAO } = require('../../services/compras/opcoesPedido');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRADOR = { id: 78, nome: 'Comprador <E78> & Cia', role: 'admin' };
const NAO_ENCONTRADO = 'Pedido de compra não encontrado';
const VAZAMENTO = /\b(undefined|null|NaN)\b/;
const semBase64 = (html) => html.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'LOGO');

(async () => {
  console.log('\n═══ Etapa 78 — o documento impresso do pedido de compra (API) ═══\n');
  const { app, db, setUser, close } = await createTestApp({ user: COMPRADOR });

  const tecnopar = (await dbRun(db, `INSERT INTO fornecedores
    (razao_social, nome_fantasia, cnpj, inscricao_estadual, endereco, cidade, estado, cep, telefone, celular, email, status)
    VALUES ('TECNOPAR FIXADORES LTDA', 'TECNOPAR', '54.984.382/0001-64', '799850123110',
            'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS', 'SAO BERNARDO DO CAMPO', 'SP',
            '09720-000', '(11) 4177-2311', '(11) 99999-0000', 'contato@tecnopar.com.br', 'ativo')`)).lastID;
  const material = (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, ncm, peso_unitario, quantidade_atual, custo_medio, ativo)
    VALUES ('MP-936', 'PARAFUSO SEXTAVADO M10 X 35 INOX 304', 'PC', '73181500', 0.012, 0, 0, 1)`)).lastID;

  // Os numeros do 28433 (duas linhas, como a 39): 198,70 de produtos, 12,91 de IPI; mais frete 10,00
  // e ICMS-ST 1,50 para o documento ter encargo a imprimir -> total geral 223,11.
  const corpo = {
    fornecedor_id: tecnopar,
    data_pedido: '2025-12-16',
    previsao_entrega: '2025-12-18',
    condicao_pagamento: '28 D.D.L.',
    frete_modalidade: '2-Contratação do Frete por conta de Terceiros',
    via_transporte: 'Rodoviário',
    transportadora: 'TRANSPORTES ABC',
    transportadora_telefone: '(11) 4000-0000',
    tabela_preco: 'Tabela 2025',
    contato: 'Matheus',
    observacoes: 'OS 1714 TQVS-4_INOX 304',
    local_entrega: 'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP',
    local_cobranca: 'Mesmo endereço',
    valor_frete: 10,
    total_icms_st: 1.5,
    itens: [
      { material_id: material, ncm: '73181500', quantidade: 13, valor_unitario: 2.191, ipi_percentual: 6.5, observacao: 'PARAFUSO SEXTAVADO M10 X 35' },
      { material_id: material, ncm: '73181500', quantidade: 2, valor_unitario: 85.11, ipi_percentual: 6.5 },
    ],
  };

  const criado = await request(app).post('/api/compras/pedidos').send(corpo);
  assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
  const pedidoId = criado.body.id;
  const numero = criado.body.numero;
  assert.strictEqual(criado.body.totais.total_geral, 223.11, 'fixture: 198,70 + 12,91 + 1,50 + 10,00');

  const getHtml = (id) => request(app).get(`/api/compras/pedidos/${id}/documento`);
  const getPdf = (id) => request(app).get(`/api/compras/pedidos/${id}/documento.pdf`).buffer(true)
    .parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });

  /* ── 1. lerEmpresa sem a tabela ───────────────────────────────────────────────────────────── */
  console.log('RN-78.04 — lerEmpresa(db) sem a tabela `configuracoes` (o harness)');
  await test('lerEmpresa tolera "no such table": todas as chaves vazias, shape completo', async () => {
    const e = await lerEmpresa(db);
    assert.deepStrictEqual(Object.keys(e).sort(),
      ['cep', 'cidade', 'cnpj', 'email', 'endereco', 'estado', 'ie', 'nome', 'nota_pedido_compra', 'telefone']);
    for (const k of Object.keys(e)) assert.strictEqual(e[k], '', `chave ${k} vazia no fallback`);
  });
  await test('o fallback de `/opcoes` NAO mudou de shape (o form da 39 le { nome, endereco })', async () => {
    assert.deepStrictEqual(EMPRESA_PADRAO, { nome: 'Nossa empresa', endereco: '' });
    const r = await request(app).get('/api/compras/pedidos-aux/opcoes');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.empresa, EMPRESA_PADRAO);
  });

  /* ── 2. HTML ──────────────────────────────────────────────────────────────────────────────── */
  console.log('\nRN-78.01 — GET /documento (HTML)');
  await test('200 text/html com o numero, o fornecedor do snapshot e o total geral formatado', async () => {
    const r = await getHtml(pedidoId);
    assert.strictEqual(r.status, 200);
    assert.ok(/^text\/html; charset=utf-8/i.test(r.headers['content-type']), r.headers['content-type']);
    const html = r.text;
    assert.ok(html.includes(`PEDIDO DE COMPRA <span class="numero">${numero}</span>`), 'numero no titulo');
    assert.ok(html.includes('TECNOPAR FIXADORES LTDA') && html.includes('54.984.382/0001-64'), 'fornecedor do snapshot');
    assert.ok(html.includes('223,11'), 'total geral');
    assert.ok(html.includes('198,70') && html.includes('12,91') && html.includes('10,00') && html.includes('1,50'));
    assert.ok(html.includes('2,191') && html.includes('85,11'), 'unitarios com as casas necessarias');
    assert.ok(html.includes('PARAFUSO SEXTAVADO M10 X 35'));
    assert.ok(html.includes('16/12/2025') && html.includes('18/12/2025'));
    assert.ok(html.includes('data:image/png;base64,'), 'logo embutido');
    assert.ok(!VAZAMENTO.test(semBase64(html)), 'nenhum undefined/null/NaN');
  });
  await test('sem a tabela `configuracoes` o cabecalho da empresa sai com "—" (e nao quebra)', async () => {
    const r = await getHtml(pedidoId);
    assert.strictEqual(r.status, 200);
    assert.ok(/CNPJ — &middot; IE —/.test(r.text), 'CNPJ e IE vazios viram travessao');
    assert.ok(!r.text.includes('class="nota-legal"'), 'sem nota configurada, sem bloco');
  });
  await test('o usuario da impressao e escapado no HTML (req.user.nome com < e &)', async () => {
    const r = await getHtml(pedidoId);
    assert.ok(r.text.includes('Comprador &lt;E78&gt; &amp; Cia'));
    assert.ok(!r.text.includes('<E78>'));
  });
  await test('404 literal para pedido inexistente', async () => {
    const r = await getHtml(999999);
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, NAO_ENCONTRADO);
  });
  await test('401 sem usuario', async () => {
    setUser(null);
    const r = await getHtml(pedidoId);
    assert.strictEqual(r.status, 401);
    const pdf = await getPdf(pedidoId);
    assert.strictEqual(pdf.status, 401);
    setUser(COMPRADOR);
  });

  /* ── 3. PDF (fiacao, Chromium falso) ──────────────────────────────────────────────────────── */
  console.log('\nRN-78.05 — GET /documento.pdf (fiacao com o gerarPdfDeHtml falso do harness)');
  await test('200 application/pdf, Content-Disposition attachment; filename="pedido-compra-<numero>.pdf", corpo %PDF', async () => {
    const r = await getPdf(pedidoId);
    assert.strictEqual(r.status, 200, r.body && r.body.toString().slice(0, 200));
    assert.strictEqual(r.headers['content-type'], 'application/pdf');
    assert.strictEqual(r.headers['content-disposition'], `attachment; filename="pedido-compra-${numero}.pdf"`);
    assert.ok(Buffer.isBuffer(r.body));
    assert.ok(r.body.slice(0, 4).toString() === '%PDF', 'corpo comeca com %PDF');
    assert.strictEqual(String(r.body.length), r.headers['content-length'], 'Content-Length bate com o corpo');
  });
  await test('o HTML entregue ao gerador e o do pedido, e o rodape leva o usuario escapado e "Folha"', async () => {
    const r = await getPdf(pedidoId);
    const entregue = r.body.toString();
    assert.ok(entregue.includes('TECNOPAR FIXADORES LTDA') && entregue.includes('223,11'));
    // O fake grava as opcoes no fim do buffer, para o teste afirmar o footerTemplate.
    const opcoes = JSON.parse(entregue.slice(entregue.lastIndexOf('\n%OPCOES%') + 9));
    assert.strictEqual(opcoes.nomeArquivo, `pedido-compra-${numero}.pdf`);
    assert.ok(opcoes.footerTemplate.includes('class="pageNumber"') && opcoes.footerTemplate.includes('class="totalPages"'));
    assert.ok(/Folha/.test(opcoes.footerTemplate));
    assert.ok(opcoes.footerTemplate.includes('Comprador &lt;E78&gt; &amp; Cia'), 'usuario escapado no rodape');
    assert.ok(!opcoes.footerTemplate.includes('<E78>'));
    assert.ok(/font-size:\s*\d/.test(opcoes.footerTemplate), 'font-size explicito (o <style> do documento nao chega ao rodape)');
    assert.ok(/Impresso por .* em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(opcoes.footerTemplate));
    assert.strictEqual(opcoes.headerTemplate, '<span></span>');
    assert.deepStrictEqual(opcoes.margin, { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' });
  });
  await test('404 literal no PDF tambem', async () => {
    const r = await getPdf(999999);
    assert.strictEqual(r.status, 404);
    assert.strictEqual(JSON.parse(r.body.toString()).error, NAO_ENCONTRADO);
  });
  await test('500 {error} quando o gerador lanca (Chromium caiu) — sem vazar stack', async () => {
    const quebrado = express();
    quebrado.use(express.json());
    const auth = (req, res, next) => { req.user = { ...COMPRADOR }; next(); };
    require('../../routes/compras')(quebrado, db, auth, () => (req, res, next) => next(), {
      uploadGrupoCompras: multer(), uploadFornecedor: multer(), uploadsGruposComprasDir: '', uploadsFornecedoresDir: '',
      gerarPdfDeHtml: async () => { throw new Error('Target closed'); },
    });
    const r = await request(quebrado).get(`/api/compras/pedidos/${pedidoId}/documento.pdf`);
    assert.strictEqual(r.status, 500);
    assert.ok(r.body.error && /PDF/.test(r.body.error), JSON.stringify(r.body));
    assert.ok(!JSON.stringify(r.body).includes('at '), 'sem stack');
  });

  /* ── 4. 503 sem a chave ───────────────────────────────────────────────────────────────────── */
  console.log('\nRN-78.05 — 503 quando o registrador nao recebe gerarPdfDeHtml');
  await test('app montado sem a chave: /documento.pdf -> 503 "Geração de PDF indisponível"; /documento continua 200', async () => {
    const semPdf = express();
    semPdf.use(express.json());
    const auth = (req, res, next) => { req.user = { ...COMPRADOR }; next(); };
    require('../../routes/compras')(semPdf, db, auth, () => (req, res, next) => next(), {
      uploadGrupoCompras: multer(), uploadFornecedor: multer(), uploadsGruposComprasDir: '', uploadsFornecedoresDir: '',
    });
    const r = await request(semPdf).get(`/api/compras/pedidos/${pedidoId}/documento.pdf`);
    assert.strictEqual(r.status, 503);
    assert.deepStrictEqual(r.body, { error: 'Geração de PDF indisponível' });
    const html = await request(semPdf).get(`/api/compras/pedidos/${pedidoId}/documento`);
    assert.strictEqual(html.status, 200);
  });

  /* ── 5. com a tabela configuracoes ────────────────────────────────────────────────────────── */
  console.log('\nRN-78.04 — com a tabela `configuracoes` (criada AQUI, minima)');
  await dbRun(db, `CREATE TABLE configuracoes (
    chave TEXT PRIMARY KEY, valor TEXT, tipo TEXT, categoria TEXT, descricao TEXT)`);
  const config = {
    empresa_nome: 'GMP INDUSTRIAIS', empresa_cnpj: '12.345.678/0001-90', empresa_ie: '799.890.695.115',
    empresa_endereco: 'Av. Angelo Demarchi 130, Batistini', empresa_cidade: 'São Bernardo do Campo',
    empresa_estado: 'SP', empresa_cep: '09844-100', empresa_telefone: '(11) 4513-9570',
    empresa_email: 'compras@gmp.ind.br', empresa_nota_pedido_compra: '',
  };
  for (const [k, v] of Object.entries(config)) {
    await dbRun(db, 'INSERT INTO configuracoes (chave, valor, tipo, categoria) VALUES (?, ?, ?, ?)', [k, v, 'text', 'empresa']);
  }

  await test('lerEmpresa le as 10 chaves (as 9 empresa_* + ie + nota)', async () => {
    const e = await lerEmpresa(db);
    assert.deepStrictEqual(e, {
      nome: 'GMP INDUSTRIAIS', cnpj: '12.345.678/0001-90', ie: '799.890.695.115',
      endereco: 'Av. Angelo Demarchi 130, Batistini', cidade: 'São Bernardo do Campo', estado: 'SP',
      cep: '09844-100', telefone: '(11) 4513-9570', email: 'compras@gmp.ind.br', nota_pedido_compra: '',
    });
  });
  await test('chave ausente na tabela (ex.: base antiga sem o seed da IE) vem vazia, nao undefined', async () => {
    await dbRun(db, "DELETE FROM configuracoes WHERE chave = 'empresa_ie'");
    const e = await lerEmpresa(db);
    assert.strictEqual(e.ie, '');
    await dbRun(db, "INSERT INTO configuracoes (chave, valor) VALUES ('empresa_ie', '799.890.695.115')");
  });
  await test('o cabecalho do documento sai com CNPJ e IE da empresa, e o faturamento repete', async () => {
    const r = await getHtml(pedidoId);
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('CNPJ 12.345.678/0001-90 &middot; IE 799.890.695.115'), 'cabecalho');
    assert.ok((r.text.match(/12\.345\.678\/0001-90/g) || []).length >= 2, 'cabecalho + faturamento');
    assert.ok(r.text.includes('compras@gmp.ind.br'));
    assert.ok(!r.text.includes('class="nota-legal"'), 'nota vazia -> bloco ausente');
  });
  await test('nota legal configurada aparece no documento (B29)', async () => {
    await dbRun(db, "UPDATE configuracoes SET valor = 'Nota de ICMS do ERP' WHERE chave = 'empresa_nota_pedido_compra'");
    const r = await getHtml(pedidoId);
    assert.ok(r.text.includes('class="nota-legal"') && r.text.includes('Nota de ICMS do ERP'));
  });
  await test('`/opcoes` com a tabela continua { nome, endereco } — sem ie/cnpj no shape da 39', async () => {
    const r = await request(app).get('/api/compras/pedidos-aux/opcoes');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.body.empresa).sort(), ['endereco', 'nome']);
    assert.strictEqual(r.body.empresa.nome, 'GMP INDUSTRIAIS');
  });

  /* ── controle positivo ────────────────────────────────────────────────────────────────────── */
  console.log('\nControle positivo');
  await test('a varredura de vazamento pega um HTML sabotado', async () => {
    const r = await getHtml(pedidoId);
    assert.ok(VAZAMENTO.test(semBase64(r.text.replace('223,11', 'NaN'))));
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
