/**
 * Etapa 32 — o pedido de compra visto por QUEM RECEBE.
 * Executar: cd server && node tests/api/pedidoCompraRecebimento.api.test.js
 *
 * O pedido de recurso foi literal: "todas as informações do Pedido de compra tem que aparecer
 * aqui para quando o pessoal for receber já conseguir dar baixa". Duas coisas precisam ser
 * provadas, e nenhuma delas por teste de unidade:
 *
 *  1. AUTORIZAÇÃO — o almoxarife não tem o módulo `compras`. Se a tela buscasse
 *     `GET /api/compras/pedidos/:id`, levaria 403 no meio do lançamento. O harness libera a
 *     camada 2 (`fakeCheckModulePermission`), então o 403 é IMPOSSÍVEL de reproduzir aqui —
 *     por isso a prova é de FONTE (guarda de regressão lendo os dois arquivos). Sem ela, alguém
 *     "simplifica" a rota aux e o bug volta invisível.
 *  2. IGUALDADE — comprador e almoxarife leem o MESMO pedido. Divergir em centavos entre as
 *     duas telas é a falha que o implementador único (services/compras/pedidoLeitura) existe
 *     para impedir; o invariante abaixo é o que trava isso.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

const AUX = '/api/almoxarifado/recebimentos-aux/pedidos-compra';

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
     VALUES (?,?,?,0,1,0,0,0,0,0,0)`, [`REC-E32-${seq}`, `Material recebimento ${seq}`, 'PC']);
  return r.lastID;
}

/** Mesmos números do pedido TECNOPAR 28433 usados em pedidoCompra.api.test.js. */
function corpoPedido(materialId, over = {}) {
  seq += 1;
  return {
    numero: `28433-R${seq}`,
    fornecedor_id: 1,
    data_pedido: '2025-12-16',
    previsao_entrega: '2025-12-18',
    condicao_pagamento: '28 D.D.L.',
    frete_modalidade: '2-Contratação do Frete por conta de Terceiros',
    transportadora: 'TRANSPORTADORA EXEMPLO LTDA',
    transportadora_telefone: '(11) 4000-0000',
    via_transporte: 'Rodoviário',
    tabela_preco: 'PADRÃO',
    contato: 'MARCOS',
    observacoes: 'OS 1714 TQVS-4_INOX 304',
    local_entrega: 'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP',
    local_cobranca: 'MESMO ENDEREÇO',
    valor_frete: 120,
    itens: [
      { material_id: materialId, codigo: 'MP-936', descricao: 'PARAFUSO SEXTAVADO M10 X 35 INOX 304',
        ncm: '73181500', quantidade: 13, unidade: 'PC', valor_unitario: 2.191, ipi_percentual: 6.5,
        peso_unitario: 0.035, data_entrega: '2025-12-18', observacao: 'entregar com a NF' },
      { material_id: materialId, codigo: 'MP-952', descricao: 'PARAFUSO ALLEN C/C M20 X 150 INOX 304',
        ncm: '73181500', quantidade: 2, unidade: 'PC', valor_unitario: 85.11, ipi_percentual: 6.5 },
    ],
    ...over,
  };
}

(async () => {
  console.log('\n═══ Pedido de compra na tela de recebimento (API) ═══\n');
  const ctx = await createTestApp({ user: COMPRAS });
  const { app, db, setUser } = ctx;

  await dbRun(db, `INSERT INTO fornecedores
    (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, endereco, cidade, estado, cep,
     telefone, celular, email)
    VALUES (1, 'TECNOPAR FIXADORES LTDA', 'TECNOPAR', '54.984.382/0001-64', '799850123110',
            'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS', 'SAO BERNARDO DO CAMPO', 'SP',
            '09720-000', '(11) 4177-2311', '(11) 99999-0000', 'contato@tecnopar.com.br')`);

  const materialId = await novoMaterial(db);
  const criado = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId));
  assert.strictEqual(criado.status, 201, `setup falhou: ${JSON.stringify(criado.body)}`);
  const pedidoId = criado.body.id;

  /* ── 1. o que a tela precisa ler ──────────────────────────────────── */
  console.log('O almoxarife enxerga o pedido inteiro');

  await test('cabeçalho: todas as condições comerciais chegam na rota do almoxarifado', async () => {
    setUser(ALMOXARIFE);
    const r = await request(app).get(`${AUX}/${pedidoId}`);
    assert.strictEqual(r.status, 200, `status ${r.status}: ${JSON.stringify(r.body)}`);

    // Uma a uma, e não um `deepStrictEqual` do objeto: o que se prova aqui é que NENHUM
    // campo do pedido some no caminho até quem dá baixa.
    assert.strictEqual(r.body.numero, criado.body.numero);
    assert.strictEqual(r.body.condicao_pagamento, '28 D.D.L.');
    assert.strictEqual(r.body.frete_modalidade, '2-Contratação do Frete por conta de Terceiros');
    assert.strictEqual(r.body.transportadora, 'TRANSPORTADORA EXEMPLO LTDA');
    assert.strictEqual(r.body.transportadora_telefone, '(11) 4000-0000');
    assert.strictEqual(r.body.via_transporte, 'Rodoviário');
    assert.strictEqual(r.body.tabela_preco, 'PADRÃO');
    assert.strictEqual(r.body.contato, 'MARCOS');
    assert.strictEqual(r.body.data_pedido, '2025-12-16');
    assert.strictEqual(r.body.previsao_entrega, '2025-12-18');
    assert.strictEqual(r.body.local_entrega,
      'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP');
    assert.strictEqual(r.body.local_cobranca, 'MESMO ENDEREÇO');
    assert.strictEqual(r.body.observacoes, 'OS 1714 TQVS-4_INOX 304');
    assert.strictEqual(r.body.status, 'pendente');
  });

  await test('fornecedor: bloco fiscal completo, marcado como snapshot', async () => {
    const r = await request(app).get(`${AUX}/${pedidoId}`);
    const f = r.body.fornecedor;
    assert.strictEqual(f.nome, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(f.cnpj, '54.984.382/0001-64');
    assert.strictEqual(f.inscricao_estadual, '799850123110');
    assert.strictEqual(f.endereco, 'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS');
    assert.strictEqual(f.municipio, 'SAO BERNARDO DO CAMPO');
    assert.strictEqual(f.uf, 'SP');
    assert.strictEqual(f.telefone, '(11) 4177-2311');
    assert.strictEqual(f.email, 'contato@tecnopar.com.br');
    assert.strictEqual(f.origem, 'snapshot', 'RN-06: a leitura tem de vir do documento');
  });

  await test('itens: código, descrição, NCM, quantidade, unidade e valores', async () => {
    const r = await request(app).get(`${AUX}/${pedidoId}`);
    assert.strictEqual(r.body.itens.length, 2);
    const [i1, i2] = r.body.itens;

    assert.strictEqual(i1.item_numero, 1);
    assert.strictEqual(i1.codigo, 'MP-936');
    assert.strictEqual(i1.descricao, 'PARAFUSO SEXTAVADO M10 X 35 INOX 304');
    assert.strictEqual(i1.ncm, '73181500');
    assert.strictEqual(i1.quantidade, 13);
    assert.strictEqual(i1.unidade, 'PC');
    assert.strictEqual(i1.valor_unitario, 2.191,
      'RN-12: o unitário guarda mais de 2 casas e não pode ser arredondado na leitura');
    assert.strictEqual(i1.ipi_percentual, 6.5);
    assert.strictEqual(i1.data_entrega, '2025-12-18');
    assert.strictEqual(i1.observacao, 'entregar com a NF');
    assert.strictEqual(i1.valor_linha, 28.48);
    assert.strictEqual(i1.material_nome, `Material recebimento 1`);

    assert.strictEqual(i2.codigo, 'MP-952');
    assert.strictEqual(i2.valor_linha, 170.22);
  });

  await test('totais: com frete e IPI, iguais aos do pedido criado', async () => {
    const r = await request(app).get(`${AUX}/${pedidoId}`);
    assert.deepStrictEqual(r.body.totais, criado.body.totais);
    assert.strictEqual(r.body.totais.valor_frete, 120);
    assert.strictEqual(r.body.totais.total_produtos, 198.70);
  });

  /* ── 2. o invariante que impede as duas telas de divergirem ───────── */
  console.log('\nInvariante — comprador e almoxarife leem o mesmo pedido');

  await test('invariante: as duas rotas devolvem fornecedor, itens e totais idênticos', async () => {
    // 40 pedidos com números aleatórios — inclusive os que quebram em ponto flutuante.
    for (let n = 0; n < 40; n++) {
      const qtd = 1 + Math.floor(Math.random() * 999);
      const unit = Math.round(Math.random() * 1000000) / 1000; // 3 casas, como o ERP imprime
      const ipi = [0, 3.25, 6.5, 10, 15][Math.floor(Math.random() * 5)];

      setUser(COMPRAS);
      const novo = await request(app).post('/api/compras/pedidos').send(corpoPedido(materialId, {
        itens: [{ material_id: materialId, codigo: 'X', descricao: 'Y', quantidade: qtd,
          unidade: 'PC', valor_unitario: unit, ipi_percentual: ipi }],
        valor_frete: Math.round(Math.random() * 50000) / 100,
      }));
      assert.strictEqual(novo.status, 201, JSON.stringify(novo.body));

      const doComprador = await request(app).get(`/api/compras/pedidos/${novo.body.id}`);
      setUser(ALMOXARIFE);
      const doAlmoxarife = await request(app).get(`${AUX}/${novo.body.id}`);

      assert.deepStrictEqual(doAlmoxarife.body.totais, doComprador.body.totais,
        `totais divergiram (qtd=${qtd} unit=${unit} ipi=${ipi})`);
      assert.deepStrictEqual(doAlmoxarife.body.fornecedor, doComprador.body.fornecedor);
      assert.deepStrictEqual(
        doAlmoxarife.body.itens.map((i) => [i.codigo, i.quantidade, i.valor_unitario, i.valor_linha, i.ipi_linha]),
        doComprador.body.itens.map((i) => [i.codigo, i.quantidade, i.valor_unitario, i.valor_linha, i.ipi_linha])
      );
    }
    setUser(COMPRAS);
  });

  /* ── 3. o item que o recebimento vai descartar ────────────────────── */
  console.log('\nItem sem material — o que o lançamento descarta');

  await test('item legado sem material_id vem marcado recebivel=false e contado', async () => {
    // Entra por INSERT direto DE PROPÓSITO: o POST barra isto desde a RN-09. O caso existe
    // só para pedidos anteriores à Etapa 32 — e é exatamente onde o almoxarife veria 2 itens
    // na tela e receberia 1, sem nada explicando qual sumiu.
    await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, codigo, descricao, quantidade, unidade, valor_unitario, item_numero)
      VALUES (?, NULL, 'LEGADO-1', 'ITEM SEM CADASTRO', 5, 'PC', 10, 99)`, [pedidoId]);

    setUser(ALMOXARIFE);
    const r = await request(app).get(`${AUX}/${pedidoId}`);
    assert.strictEqual(r.body.itens.length, 3);
    assert.strictEqual(r.body.itens_sem_material, 1);

    const legado = r.body.itens.find((i) => i.codigo === 'LEGADO-1');
    assert.strictEqual(legado.recebivel, false);
    assert.strictEqual(r.body.itens.filter((i) => i.recebivel).length, 2);
    setUser(COMPRAS);
  });

  await test('pedido inexistente responde 404 com a literal compartilhada', async () => {
    setUser(ALMOXARIFE);
    const r = await request(app).get(`${AUX}/999999`);
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Pedido de compra não encontrado');
    setUser(COMPRAS);
  });

  /* ── 4. guardas de fonte: por que a rota mora no almoxarifado ─────── */
  console.log('\nGuardas de regressão (fonte)');

  const extendedSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'almoxarifado', 'extended.js'), 'utf8');
  const comprasSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'compras', 'pedidos.js'), 'utf8');

  await test('a rota aux NÃO é guardada por checkModulePermission', async () => {
    const linha = extendedSrc.split(/\r?\n/).find((l) =>
      l.includes("recebimentos-aux/pedidos-compra/:id"));
    assert.ok(linha, 'a rota aux de detalhe sumiu de extended.js');
    assert.ok(/,\s*auth\s*,/.test(linha), `a rota perdeu o auth: ${linha}`);
    assert.ok(!linha.includes('checkModulePermission'),
      'a rota aux ganhou guarda de módulo — o almoxarife volta a tomar 403 ao receber');
  });

  await test('controle positivo: a guarda acima reprova a rota do comprador', async () => {
    // Se a régua não distingue as duas rotas, ela não prova nada. A do comprador TEM guarda
    // de módulo (é o motivo de a aux existir) e precisa reprovar nesta mesma régua.
    const usaGuard = /app\.get\('\/api\/compras\/pedidos\/:id',\s*\.\.\.guard/.test(comprasSrc);
    assert.ok(usaGuard, 'GET /api/compras/pedidos/:id parou de usar ...guard');
    assert.ok(/const guard = \[authenticateToken, checkModulePermission\('compras'\)\]/.test(comprasSrc),
      'o guard de compras mudou — reveja se a rota aux ainda é necessária');
  });

  await test('a leitura é implementada UMA vez só (pedidoLeitura)', async () => {
    assert.ok(comprasSrc.includes("require('../../services/compras/pedidoLeitura')"),
      'a rota do comprador voltou a implementar a leitura por conta própria');
    const receiptSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'services', 'almoxarifado', 'receiptService.js'), 'utf8');
    assert.ok(receiptSrc.includes("require('../compras/pedidoLeitura')"),
      'o receiptService voltou a implementar a leitura por conta própria');
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
