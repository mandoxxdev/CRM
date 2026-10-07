/**
 * Etapa 39 (T1) — o pedido de compra ganha o DOCUMENTO da Etapa 32: conta (`pedidoTotais`),
 * condicoes comerciais, snapshot fiscal do fornecedor, opcoes do formulario, calculadora e o painel
 * do recebimento. RN-39.01 a RN-39.09.
 *
 * Os cenarios marcados [P] sao PORTADOS de `b3abc723:server/tests/api/pedidoCompra.api.test.js` e
 * `pedidoCompraFormulario.api.test.js` (Etapa 32 da main, descartada no merge B18) — mesmos numeros
 * do pedido REAL TECNOPAR 28433 (198,70 / 12,91 / 211,61). O que NAO foi portado, de proposito
 * (B19): numero digitado (RN-01), enum de 4 status/409 por `finalizado` (RN-07), `data_entrega`
 * por item (Etapa 33) e o `DELETE` proprio (a 38 ja tem o dela, com a regua de recebimento).
 *
 * ⚠️ MODOS DE FALHA QUE ESTE ARQUIVO SE PROIBE:
 * - afirmar so o status: todo total e LIDO do banco (`valor_total`) ou da resposta e comparado com
 *   o numero do ERP, nunca "existe a chave";
 * - teste que nao sabe falhar: a nao-regressao de `valor_total` com inteiros passaria com a conta
 *   antiga e com a nova — por isso ha o caso de 4 casas (`49 x 0.1063`) que SO a conta nova da;
 * - `custo_medio` afirmado sem entrada fisica: a RN-39.09 roda o recebimento REAL ate `processar`.
 *
 * Executar: cd server && node tests/api/comprasPedidoDocumento.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { arred2 } = require('../../services/compras/pedidoTotais');
const { EMPRESA_PADRAO, CONDICOES_PAGAMENTO } = require('../../services/compras/opcoesPedido');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Numeracao propria (nenhum id de fixture escrito a mao para pedido/material/fornecedor).
const ADMIN = { id: 90, nome: 'Admin E39', role: 'admin' };
const SEM_PERFIL = { id: 94, nome: 'Chao de Fabrica E39', role: 'usuario' }; // cai em PRODUCAO

const ERRO_IPI = 'Dados inválidos — itens.0.ipi_percentual: ipi_percentual deve estar entre 0 e 100';
const NAO_ENCONTRADO = 'Pedido de compra não encontrado';

(async () => {
  console.log('\n═══ Etapa 39 — o documento do pedido de compra (API) ═══\n');
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `gerarContaPagar` insere aqui no `processar` (RN-39.09). Mesmo subconjunto de
  // `recebimentoContraPedidoIntegracao.api.test.js`.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  const tecnopar = (await dbRun(db, `INSERT INTO fornecedores
    (razao_social, nome_fantasia, cnpj, inscricao_estadual, endereco, cidade, estado, cep, telefone, celular, email, status)
    VALUES ('TECNOPAR FIXADORES LTDA', 'TECNOPAR', '54.984.382/0001-64', '799850123110',
            'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS', 'SAO BERNARDO DO CAMPO', 'SP',
            '09720-000', '(11) 4177-2311', '(11) 99999-0000', 'contato@tecnopar.com.br', 'ativo')`)).lastID;
  const outroForn = (await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj, cidade, estado, status)
    VALUES ('OUTRO FORNECEDOR SA', '11.111.111/0001-11', 'DIADEMA', 'SP', 'ativo')`)).lastID;

  let seq = 0;
  async function novoMaterial(over = {}) {
    seq += 1;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, ncm, peso_unitario, quantidade_atual, custo_medio, ativo)
      VALUES (?,?,?,?,?,0,0,1)`,
    [over.codigo || `E39-${seq}`, over.nome || `Material E39 ${seq}`, over.unidade || 'PC',
      over.ncm === undefined ? '73181500' : over.ncm, over.peso_unitario === undefined ? 0.012 : over.peso_unitario]);
    return r.lastID;
  }

  /** [P] Corpo com os numeros REAIS do pedido TECNOPAR 28433 (duas das 24 linhas). */
  function corpoPedido(materialId, over = {}) {
    return {
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
      itens: [
        { material_id: materialId, ncm: '73181500', quantidade: 13, valor_unitario: 2.191, ipi_percentual: 6.5, observacao: 'PARAFUSO SEXTAVADO M10 X 35' },
        { material_id: materialId, ncm: '73181500', quantidade: 2, valor_unitario: 85.11, ipi_percentual: 6.5 },
      ],
      ...over,
    };
  }

  const post = (body) => request(app).post('/api/compras/pedidos').send(body);
  const put = (id, body) => request(app).put(`/api/compras/pedidos/${id}`).send(body);
  const get = (id) => request(app).get(`/api/compras/pedidos/${id}`);
  const calcular = (body) => request(app).post('/api/compras/pedidos/calcular').send(body);
  const aux = (id) => request(app).get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${id}`);
  const valorTotalGravado = async (id) => (await dbGet(db, 'SELECT valor_total FROM pedidos_compra WHERE id = ?', [id])).valor_total;

  const matA = await novoMaterial({ codigo: 'MP-936', nome: 'PARAFUSO SEXTAVADO M10 X 35 INOX 304' });

  /* ── 1. criacao, totais e o que volta na leitura ─────────────────────────────────────────── */
  console.log('Criação — a conta do documento (RN-39.02) e o que a leitura devolve (RN-39.03)');
  let criadoId = null;

  await test('[P] POST cria o pedido e devolve os seis totais: 198,70 / 12,91 / 211,61', async () => {
    const r = await post(corpoPedido(matA));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    criadoId = r.body.id;
    assert.ok(/^PC-/.test(r.body.numero), 'o numero continua GERADO (B19)');
    // 13 x 2,191 = 28,48 e 2 x 85,11 = 170,22 -> 198,70; IPI 6,5% = 1,85 + 11,06 = 12,91
    assert.strictEqual(r.body.totais.total_produtos, 198.70);
    assert.strictEqual(r.body.totais.total_ipi, 12.91);
    assert.strictEqual(r.body.totais.total_icms_st, 0);
    assert.strictEqual(r.body.totais.valor_frete, 0);
    assert.strictEqual(r.body.totais.total_desconto, 0);
    assert.strictEqual(r.body.totais.total_geral, 211.61);
  });

  await test('[P] RN-10: valor_total e os 5 totais sao GRAVADOS (valor_total = total_geral)', async () => {
    const row = await dbGet(db, `SELECT valor_total, total_produtos, total_ipi, total_icms_st, total_desconto, valor_frete
      FROM pedidos_compra WHERE id = ?`, [criadoId]);
    assert.strictEqual(row.valor_total, 211.61);
    assert.strictEqual(row.total_produtos, 198.70);
    assert.strictEqual(row.total_ipi, 12.91);
    assert.strictEqual(row.total_icms_st, 0);
    assert.strictEqual(row.valor_frete, 0);
  });

  await test('[P] os dados complementares do documento voltam gravados (as 9 condicoes)', async () => {
    const r = await get(criadoId);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.condicao_pagamento, '28 D.D.L.');
    assert.strictEqual(r.body.via_transporte, 'Rodoviário');
    assert.ok(String(r.body.frete_modalidade).startsWith('2-Contrata'));
    assert.strictEqual(r.body.transportadora, 'TRANSPORTES ABC');
    assert.strictEqual(r.body.transportadora_telefone, '(11) 4000-0000');
    assert.strictEqual(r.body.tabela_preco, 'Tabela 2025');
    assert.strictEqual(r.body.contato, 'Matheus');
    assert.strictEqual(r.body.local_entrega, 'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP');
    assert.strictEqual(r.body.local_cobranca, 'Mesmo endereço');
    assert.strictEqual(r.body.observacoes, 'OS 1714 TQVS-4_INOX 304');
  });

  await test('[P] os itens voltam com item_numero, NCM, IPI, observacao e os derivados por linha', async () => {
    const r = await get(criadoId);
    const [a, b] = r.body.itens;
    assert.strictEqual(a.item_numero, 1);
    assert.strictEqual(b.item_numero, 2);
    assert.strictEqual(a.ncm, '73181500');
    assert.strictEqual(a.ipi_percentual, 6.5);
    assert.strictEqual(a.observacao, 'PARAFUSO SEXTAVADO M10 X 35');
    assert.strictEqual(b.observacao, null);
    assert.strictEqual(a.valor_linha, 28.48);
    assert.strictEqual(a.ipi_linha, 1.85);
    assert.strictEqual(b.valor_linha, 170.22);
    assert.strictEqual(b.ipi_linha, 11.06);
    assert.strictEqual(a.peso_unitario, 0.012, 'peso ausente no payload -> o do material');
    // RN-33.03: data_entrega por item NAO volta.
    assert.strictEqual(a.data_entrega, undefined);
  });

  await test('RN-39.03: fornecedor_nome e teve_recebimento CONTINUAM; snap_fornecedor_* NAO saem', async () => {
    const r = await get(criadoId);
    assert.strictEqual(r.body.fornecedor_nome, 'TECNOPAR FIXADORES LTDA', 'contrato da 38 (PedidoCompraForm.js:200)');
    assert.strictEqual(r.body.teve_recebimento, 0, 'contrato da onda F4 da 39');
    const cruas = Object.keys(r.body).filter((k) => k.startsWith('snap_fornecedor_') || k.startsWith('forn_'));
    assert.deepStrictEqual(cruas, [], `colunas cruas vazaram: ${cruas.join(',')}`);
    assert.strictEqual(r.body.valor_total, 211.61);
  });

  await test('[P] a lista traz total_itens e total_geral sem perder as colunas antigas', async () => {
    const r = await request(app).get('/api/compras/pedidos');
    const linha = r.body.find((p) => p.id === criadoId);
    assert.ok(linha, 'o pedido nao esta na lista');
    assert.strictEqual(linha.total_itens, 2);
    assert.strictEqual(linha.total_geral, 211.61);
    assert.strictEqual(linha.valor_total, 211.61, 'a lista perdeu valor_total (Compras.js le)');
    assert.ok('fornecedor_nome' in linha, 'a lista perdeu fornecedor_nome');
    assert.ok('atrasado' in linha, 'a lista perdeu o derivado de atraso da 39');
  });

  /* ── 2. RN-39.01: ncm/peso do material, item_numero do servidor, validacoes ──────────────── */
  console.log('\nRN-39.01 — NCM/peso do material por padrao, item_numero e a posicao, IPI 0–100');

  await test('ncm e peso_unitario: ausente, "" e null caem no MATERIAL; valor preenchido sobrescreve', async () => {
    const mat = await novoMaterial({ ncm: '84829900', peso_unitario: 1.5 });
    const r = await post(corpoPedido(mat, { itens: [
      { material_id: mat, quantidade: 1, valor_unitario: 10 },
      { material_id: mat, quantidade: 1, valor_unitario: 10, ncm: '', peso_unitario: '' },
      { material_id: mat, quantidade: 1, valor_unitario: 10, ncm: null, peso_unitario: null },
      { material_id: mat, quantidade: 1, valor_unitario: 10, ncm: '7318.15.00', peso_unitario: 2.25 },
    ] }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const [i1, i2, i3, i4] = r.body.itens;
    for (const i of [i1, i2, i3]) {
      assert.strictEqual(i.ncm, '84829900', `ncm devia vir do material: ${JSON.stringify(i)}`);
      assert.strictEqual(i.peso_unitario, 1.5, `peso devia vir do material: ${JSON.stringify(i)}`);
    }
    assert.strictEqual(i4.ncm, '7318.15.00');
    assert.strictEqual(i4.peso_unitario, 2.25);
    // E o banco diz o mesmo (a resposta nao e a unica prova).
    const rows = await dbAll(db, 'SELECT ncm, peso_unitario FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY item_numero', [r.body.id]);
    assert.deepStrictEqual(rows.map((x) => x.ncm), ['84829900', '84829900', '84829900', '7318.15.00']);
  });

  await test('item_numero do payload e IGNORADO: a posicao 1..n e do servidor, e a leitura ordena por ela', async () => {
    const r = await post(corpoPedido(matA, { itens: [
      { material_id: matA, quantidade: 1, valor_unitario: 1, item_numero: 99 },
      { material_id: matA, quantidade: 2, valor_unitario: 1, item_numero: 1 },
      { material_id: matA, quantidade: 3, valor_unitario: 1, item_numero: -5 },
    ] }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.itens.map((i) => i.item_numero), [1, 2, 3]);
    assert.deepStrictEqual(r.body.itens.map((i) => i.quantidade), [1, 2, 3], 'a ordem e a digitada');
  });

  await test('ipi_percentual: 101 -> 400 com a literal; "" -> 0; 100 passa', async () => {
    const r = await post(corpoPedido(matA, { itens: [{ material_id: matA, quantidade: 1, valor_unitario: 1, ipi_percentual: 101 }] }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ERRO_IPI);
    const neg = await post(corpoPedido(matA, { itens: [{ material_id: matA, quantidade: 1, valor_unitario: 1, ipi_percentual: -1 }] }));
    assert.strictEqual(neg.status, 400);
    assert.strictEqual(neg.body.error, ERRO_IPI);
    const ok = await post(corpoPedido(matA, { itens: [
      { material_id: matA, quantidade: 1, valor_unitario: 10, ipi_percentual: '' },
      { material_id: matA, quantidade: 1, valor_unitario: 10, ipi_percentual: 100 },
    ] }));
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.itens[0].ipi_percentual, 0);
    assert.strictEqual(ok.body.itens[1].ipi_linha, 10);
    assert.strictEqual(ok.body.totais.total_geral, 30);
  });

  await test('encargos entram na conta: ICMS-ST + frete - desconto; "" vira 0; no PUT, ausente MANTEM o gravado', async () => {
    const r = await post(corpoPedido(matA, { total_icms_st: 10, valor_frete: 20, total_desconto: 5 }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.totais.total_geral, arred2(198.70 + 12.91 + 10 + 20 - 5));
    assert.strictEqual(await valorTotalGravado(r.body.id), 236.61);
    // PUT sem os encargos: os tres ficam como estavam.
    const p1 = await put(r.body.id, { fornecedor_id: tecnopar, itens: r.body.itens });
    assert.strictEqual(p1.status, 200, JSON.stringify(p1.body));
    assert.strictEqual(p1.body.totais.valor_frete, 20, 'frete ausente no PUT apagou o gravado');
    assert.strictEqual(p1.body.totais.total_geral, 236.61);
    // PUT com `''`: limpar o campo e zerar.
    const p2 = await put(r.body.id, { fornecedor_id: tecnopar, itens: r.body.itens, valor_frete: '', total_icms_st: '', total_desconto: '' });
    assert.strictEqual(p2.status, 200, JSON.stringify(p2.body));
    assert.strictEqual(p2.body.totais.total_geral, 211.61);
    assert.strictEqual(await valorTotalGravado(r.body.id), 211.61);
  });

  /* ── 3. RN-39.04: snapshot fiscal ────────────────────────────────────────────────────────── */
  console.log('\nRN-39.04 — snapshot fiscal do fornecedor (B21)');

  await test('[P] o pedido congela o bloco fiscal do fornecedor na criacao (10 campos, celular incluido)', async () => {
    const r = await get(criadoId);
    const f = r.body.fornecedor;
    assert.strictEqual(f.nome, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(f.cnpj, '54.984.382/0001-64');
    assert.strictEqual(f.ie, '799850123110');
    assert.strictEqual(f.endereco, 'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS');
    assert.strictEqual(f.municipio, 'SAO BERNARDO DO CAMPO');
    assert.strictEqual(f.uf, 'SP');
    assert.strictEqual(f.cep, '09720-000');
    assert.strictEqual(f.telefone, '(11) 4177-2311');
    assert.strictEqual(f.celular, '(11) 99999-0000');
    assert.strictEqual(f.email, 'contato@tecnopar.com.br');
    assert.strictEqual(f.origem, 'snapshot');
    const row = await dbGet(db, 'SELECT snap_fornecedor_nome, snap_fornecedor_celular FROM pedidos_compra WHERE id = ?', [criadoId]);
    assert.strictEqual(row.snap_fornecedor_nome, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(row.snap_fornecedor_celular, '(11) 99999-0000');
  });

  await test('[P] renomear o fornecedor NAO reescreve o pedido ja emitido (nem o celular)', async () => {
    await dbRun(db, "UPDATE fornecedores SET razao_social = 'TECNOPAR RENOMEADA SA', celular = '(11) 00000-0000' WHERE id = ?", [tecnopar]);
    const r = await get(criadoId);
    assert.strictEqual(r.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA',
      'o snapshot foi sobrescrito pelo JOIN vivo — e a colisao de nome que a RN-06 previne');
    assert.strictEqual(r.body.fornecedor.celular, '(11) 99999-0000', 'B21: celular e do snapshot');
    assert.strictEqual(r.body.fornecedor_nome, 'TECNOPAR RENOMEADA SA', 'fornecedor_nome continua VIVO (contrato da 38)');
  });

  await test('PUT SEM trocar o fornecedor NAO toca o snapshot (o documento continua o emitido)', async () => {
    const atual = await get(criadoId);
    const r = await put(criadoId, { fornecedor_id: tecnopar, itens: atual.body.itens, condicao_pagamento: '30 D.D.L.' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.condicao_pagamento, '30 D.D.L.');
    assert.strictEqual(r.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA', 'editar sem trocar fornecedor reescreveu o snapshot');
    assert.strictEqual(r.body.fornecedor.origem, 'snapshot');
  });

  await test('PUT TROCANDO o fornecedor REESCREVE o snapshot (B21 — a 32 nunca reescrevia)', async () => {
    const atual = await get(criadoId);
    const r = await put(criadoId, { fornecedor_id: outroForn, itens: atual.body.itens });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.fornecedor_id, outroForn);
    assert.strictEqual(r.body.fornecedor.nome, 'OUTRO FORNECEDOR SA');
    assert.strictEqual(r.body.fornecedor.cnpj, '11.111.111/0001-11');
    assert.strictEqual(r.body.fornecedor.municipio, 'DIADEMA');
    assert.strictEqual(r.body.fornecedor.celular, null, 'o novo fornecedor nao tem celular: o antigo nao pode sobrar');
    assert.strictEqual(r.body.fornecedor.origem, 'snapshot');
    // volta para o TECNOPAR para os cenarios seguintes — o nome ANTES do PUT, porque o PUT trocando
    // o fornecedor congela o cadastro como esta naquele instante (e o B21 em acao).
    await dbRun(db, "UPDATE fornecedores SET razao_social = 'TECNOPAR FIXADORES LTDA', celular = '(11) 99999-0000' WHERE id = ?", [tecnopar]);
    const volta = await put(criadoId, { fornecedor_id: tecnopar, itens: atual.body.itens });
    assert.strictEqual(volta.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
  });

  let legadoId = null;
  await test('[P] pedido legado SEM snapshot (anterior a etapa) cai no cadastro vivo, origem cadastro, totais zero', async () => {
    const r = await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES ('PC-LEGADO-E39', ?, 'pendente')", [tecnopar]);
    legadoId = r.lastID;
    const resp = await get(legadoId);
    assert.strictEqual(resp.status, 200, JSON.stringify(resp.body));
    assert.strictEqual(resp.body.fornecedor.origem, 'cadastro');
    assert.strictEqual(resp.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(resp.body.fornecedor.ie, '799850123110');
    assert.strictEqual(resp.body.totais.total_geral, 0, 'pedido legado sem itens deve dar zero, nao NaN');
    assert.deepStrictEqual(resp.body.itens, []);
  });

  await test('legado EDITADO sem trocar o fornecedor GANHA snapshot (deixa de ser cadastro para sempre)', async () => {
    const r = await put(legadoId, { fornecedor_id: tecnopar, itens: [{ material_id: matA, quantidade: 1, valor_unitario: 1 }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.fornecedor.origem, 'snapshot');
    assert.strictEqual(r.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
    // Agora e snapshot de verdade: renomear nao o alcanca mais.
    await dbRun(db, "UPDATE fornecedores SET razao_social = 'TECNOPAR RENOMEADA SA' WHERE id = ?", [tecnopar]);
    assert.strictEqual((await get(legadoId)).body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
    await dbRun(db, "UPDATE fornecedores SET razao_social = 'TECNOPAR FIXADORES LTDA' WHERE id = ?", [tecnopar]);
  });

  /* ── 4. RN-39.05: a calculadora ──────────────────────────────────────────────────────────── */
  console.log('\nRN-39.05 — POST /pedidos/calcular (calculadora, nao porta de gravacao)');

  await test('[P] calcular devolve os totais e os derivados de cada linha', async () => {
    const r = await calcular({
      valor_frete: 120,
      itens: [
        { quantidade: 13, valor_unitario: 2.191, ipi_percentual: 6.5 },
        { quantidade: 2, valor_unitario: 85.11, ipi_percentual: 6.5 },
      ],
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.totais.total_produtos, 198.70);
    assert.strictEqual(r.body.totais.total_ipi, 12.91);
    assert.strictEqual(r.body.totais.valor_frete, 120);
    assert.strictEqual(r.body.totais.total_geral, 331.61);
    assert.strictEqual(r.body.itens[0].valor_linha, 28.48);
    assert.strictEqual(r.body.itens[1].valor_linha, 170.22);
  });

  await test('[P] calcular NAO grava nada', async () => {
    const antes = (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;
    await calcular({ itens: [{ quantidade: 5, valor_unitario: 10 }] });
    const depois = (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;
    assert.strictEqual(depois, antes, 'a calculadora criou pedido');
  });

  await test('[P] calcular com lista vazia devolve zeros, nao erro', async () => {
    const r = await calcular({ itens: [] });
    assert.strictEqual(r.status, 200);
    Object.entries(r.body.totais).forEach(([k, v]) => assert.strictEqual(v, 0, `${k} = ${v}`));
    const semItens = await calcular({});
    assert.strictEqual(semItens.status, 200);
    assert.strictEqual(semItens.body.totais.total_geral, 0);
  });

  await test('calcular e TOLERANTE: quantidade "" / lixo / sem material_id -> 200 (o form chama a cada tecla)', async () => {
    const r = await calcular({ itens: [
      { quantidade: '', valor_unitario: 2.191, ipi_percentual: '' },
      { quantidade: 'abc', valor_unitario: null },
      { quantidade: 2, valor_unitario: 85.11, ipi_percentual: 6.5 },
    ], valor_frete: '' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.itens[0].valor_linha, 0);
    assert.strictEqual(r.body.itens[1].valor_linha, 0);
    assert.strictEqual(r.body.totais.total_produtos, 170.22);
    assert.strictEqual(r.body.totais.total_ipi, 11.06);
    // Controle positivo: o schema de GRAVACAO recusa o mesmo corpo — a tolerancia e so da calculadora.
    const gravacao = await post({ fornecedor_id: tecnopar, itens: [{ material_id: matA, quantidade: '', valor_unitario: 1 }] });
    assert.strictEqual(gravacao.status, 400);
  });

  await test('calcular recusa SO ipi_percentual fora de 0–100, com a mesma literal da gravacao', async () => {
    const r = await calcular({ itens: [{ quantidade: 1, valor_unitario: 1, ipi_percentual: 101 }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ERRO_IPI);
  });

  await test('[P] invariante: 40 pedidos aleatorios, previa (calcular) === gravado (POST), e valor_total === total_geral', async () => {
    // Gerador deterministico: falha reproduzivel.
    let semente = 20261007;
    const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    for (let n = 0; n < 40; n++) {
      const itens = [];
      const qtdLinhas = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < qtdLinhas; i++) {
        itens.push({
          material_id: matA,
          quantidade: 1 + Math.floor(rnd() * 999),
          valor_unitario: Math.round(rnd() * 1000000) / 10000, // 4 casas (RN-12 da 32)
          ipi_percentual: [0, 3.25, 6.5, 10, 15][Math.floor(rnd() * 5)],
        });
      }
      const encargos = {
        valor_frete: Math.round(rnd() * 50000) / 100,
        total_icms_st: Math.round(rnd() * 30000) / 100,
        total_desconto: Math.round(rnd() * 10000) / 100,
      };
      const previa = await calcular({ ...encargos, itens });
      assert.strictEqual(previa.status, 200, JSON.stringify(previa.body));
      const salvo = await post({ ...encargos, itens, fornecedor_id: tecnopar });
      assert.strictEqual(salvo.status, 201, JSON.stringify(salvo.body));
      assert.deepStrictEqual(salvo.body.totais, previa.body.totais,
        `a previa divergiu do gravado no caso ${n}: ${JSON.stringify(itens)}`);
      assert.strictEqual(salvo.body.valor_total, previa.body.totais.total_geral, 'valor_total (lido pela lista) divergiu da previa');
      assert.strictEqual(await valorTotalGravado(salvo.body.id), previa.body.totais.total_geral, 'o banco divergiu da previa');
    }
  });

  /* ── 5. nao-regressao: pedido sem IPI/encargos ───────────────────────────────────────────── */
  console.log('\nNão-regressão — pedido sem IPI e sem encargos tem o valor_total de antes');

  await test('sem IPI/encargos, valor_total == soma crua ate o centavo (tolerancia < 0,005) — e o caso de 4 casas prova que a conta nova arredonda por linha', async () => {
    // Inteiros e 2 casas: identico (e com estes o teste NAO sabe falhar — por isso o segundo bloco).
    const r1 = await post({ fornecedor_id: tecnopar, itens: [
      { material_id: matA, quantidade: 4, valor_unitario: 2.5 },
      { material_id: matA, quantidade: 3, valor_unitario: 0.1 },
    ] });
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    const cru1 = 4 * 2.5 + 3 * 0.1; // 10.3 (em double, 10.299999…)
    assert.ok(Math.abs(r1.body.valor_total - cru1) < 0.005, `${r1.body.valor_total} vs ${cru1}`);
    assert.strictEqual(r1.body.valor_total, 10.3, 'e sem o lixo de ponto flutuante que a soma crua gravava');
    assert.deepStrictEqual(r1.body.totais, { total_produtos: 10.3, total_ipi: 0, total_icms_st: 0, total_desconto: 0, valor_frete: 0, total_geral: 10.3 });

    // Controle positivo — 4 casas (RN-12 da 32): a linha e arredondada, entao o numero MUDA alem da
    // 2a casa. 49 x 0,1063 = 5,2087 cru; o documento diz 5,21 (igual ao ERP).
    const r2 = await post({ fornecedor_id: tecnopar, itens: [{ material_id: matA, quantidade: 49, valor_unitario: 0.1063 }] });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.valor_total, 5.21);
    assert.notStrictEqual(r2.body.valor_total, 49 * 0.1063, 'se isto passar a ser igual, a conta voltou a ser a soma crua');
    assert.ok(Math.abs(r2.body.valor_total - 49 * 0.1063) < 0.005, 'ainda assim dentro do centavo');
  });

  await test('cotacao 1 x 1,005 em duas linhas: cotacoes.valor_total == valor_total do pedido gerado (2,02 nos dois)', async () => {
    const mat = await novoMaterial();
    const c = await request(app).post('/api/compras/cotacoes').send({
      numero: 'COT-E39-1005', fornecedor_id: tecnopar,
      itens: [{ material_id: mat, quantidade: 1, valor_unitario: 1.005 }, { material_id: mat, quantidade: 1, valor_unitario: 1.005 }],
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    // Linha arredondada ANTES de somar: 1,005 -> 1,01, x2 = 2,02. Arredondar a soma daria 2,01.
    assert.strictEqual(c.body.valor_total, 2.02, 'a cotacao voltou a arredondar a SOMA (somaItens antigo)');
    const g = await request(app).post(`/api/compras/cotacoes/${c.body.id}/gerar-pedido`).send();
    assert.strictEqual(g.status, 201, JSON.stringify(g.body));
    assert.strictEqual(g.body.valor_total, 2.02);
    const cot = await dbGet(db, 'SELECT valor_total FROM cotacoes WHERE id = ?', [c.body.id]);
    const ped = await dbGet(db, 'SELECT valor_total FROM pedidos_compra WHERE id = ?', [g.body.id]);
    assert.strictEqual(cot.valor_total, ped.valor_total, `cotacao ${cot.valor_total} x pedido ${ped.valor_total}`);
    // O pedido gerado pela cotacao tambem ganha snapshot (RN-39.04: gravado no SERVICO, nao na rota).
    assert.strictEqual(g.body.fornecedor.origem, 'snapshot');
    assert.strictEqual(g.body.itens[0].item_numero, 1);
  });

  /* ── 6. RN-39.06: opcoes ─────────────────────────────────────────────────────────────────── */
  console.log('\nRN-39.06 — GET /pedidos-aux/opcoes: listas fixas ∪ DISTINCT do uso');

  await test('as 8 chaves vem; "A combinar F39" digitada num pedido vira opcao; a fixa continua na frente', async () => {
    const criado = await post(corpoPedido(matA, { condicao_pagamento: 'A combinar F39', via_transporte: 'Drone', transportadora: 'TRANSP XYZ', tabela_preco: 'Tabela Z', frete_modalidade: 'Combinado F39' }));
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const r = await request(app).get('/api/compras/pedidos-aux/opcoes');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    for (const k of ['frete_modalidades', 'condicoes_pagamento', 'vias_transporte', 'unidades', 'ipi_sugerido', 'transportadoras', 'tabelas_preco', 'empresa']) {
      assert.ok(k in r.body, `falta a chave ${k}`);
    }
    assert.ok(!('proximo_numero' in r.body), 'proximo_numero e do numero digitado da 32 — nao volta (B19)');
    assert.deepStrictEqual(r.body.condicoes_pagamento.slice(0, CONDICOES_PAGAMENTO.length), CONDICOES_PAGAMENTO);
    assert.ok(r.body.condicoes_pagamento.includes('A combinar F39'), JSON.stringify(r.body.condicoes_pagamento));
    assert.ok(r.body.condicoes_pagamento.includes('28 D.D.L.'));
    assert.strictEqual(r.body.condicoes_pagamento.filter((c) => c === '28 D.D.L.').length, 1, 'a fixa usada nao duplica');
    assert.ok(r.body.vias_transporte.includes('Drone'));
    assert.ok(r.body.transportadoras.includes('TRANSP XYZ'));
    assert.ok(r.body.tabelas_preco.includes('Tabela Z'));
    assert.strictEqual(r.body.frete_modalidades.length, 7, '6 da SEFAZ + 1 usada');
    assert.deepStrictEqual(r.body.frete_modalidades[6], { valor: 'Combinado F39', curto: 'Combinado F39' });
    assert.deepStrictEqual(r.body.ipi_sugerido, [0, 3.25, 5, 6.5, 10, 15]);
    assert.ok(r.body.unidades.some((u) => u.valor === 'PC'));
  });

  await test('empresa: sem a tabela core `configuracoes` (o harness) vem o FALLBACK; com ela, vem o cadastro', async () => {
    const semTabela = await request(app).get('/api/compras/pedidos-aux/opcoes');
    assert.deepStrictEqual(semTabela.body.empresa, EMPRESA_PADRAO, 'o fallback declarado e { nome: "Nossa empresa", endereco: "" }');
    assert.deepStrictEqual(EMPRESA_PADRAO, { nome: 'Nossa empresa', endereco: '' });
    // Controle positivo: criando a tabela como `index.js` a cria, o cadastro e lido.
    await dbRun(db, 'CREATE TABLE configuracoes (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT UNIQUE NOT NULL, valor TEXT)');
    for (const [k, v] of [['empresa_nome', 'GMP Industriais'], ['empresa_endereco', 'Av. Angelo Demarchi, 130'], ['empresa_cidade', 'São Bernardo do Campo'], ['empresa_estado', 'SP'], ['empresa_cep', '09820-000']]) {
      await dbRun(db, 'INSERT INTO configuracoes (chave, valor) VALUES (?, ?)', [k, v]);
    }
    const comTabela = await request(app).get('/api/compras/pedidos-aux/opcoes');
    assert.deepStrictEqual(comTabela.body.empresa, { nome: 'GMP Industriais', endereco: 'Av. Angelo Demarchi, 130 - São Bernardo do Campo - SP - 09820-000' });
  });

  /* ── 7. RN-39.08 / B22 / B23: o painel do recebimento ────────────────────────────────────── */
  console.log('\nRN-39.08 — GET /almoxarifado/recebimentos-aux/pedidos-compra/:id (painel do recebimento)');

  await test('PRODUCAO (sem perfil) ve fornecedor e condicoes; NAO ve valor_unitario, totais, observacoes nem itens', async () => {
    setUser(SEM_PERFIL);
    try {
      const r = await aux(criadoId);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.id, criadoId);
      assert.ok(/^PC-/.test(r.body.numero));
      assert.strictEqual(r.body.data_pedido, '2025-12-16');
      assert.strictEqual(r.body.previsao_entrega, '2025-12-18');
      assert.strictEqual(r.body.fornecedor.nome, 'TECNOPAR FIXADORES LTDA');
      assert.strictEqual(r.body.fornecedor.cnpj, '54.984.382/0001-64');
      assert.strictEqual(r.body.fornecedor.ie, '799850123110');
      assert.strictEqual(r.body.fornecedor.origem, 'snapshot');
      assert.strictEqual(r.body.condicoes.condicao_pagamento, '30 D.D.L.');
      assert.ok(String(r.body.condicoes.frete_modalidade).startsWith('2-Contrata'));
      assert.strictEqual(r.body.condicoes.transportadora, 'TRANSPORTES ABC');
      assert.strictEqual(r.body.condicoes.via_transporte, 'Rodoviário');
      assert.strictEqual(r.body.condicoes.contato, 'Matheus');
      assert.strictEqual(r.body.condicoes.local_entrega, 'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP');
      const texto = JSON.stringify(r.body);
      assert.ok(!('totais' in r.body), 'B22: totais nao saem para quem recebe');
      assert.ok(!('observacoes' in r.body), 'B23: observacoes do pedido e negociacao com fornecedor');
      assert.ok(!('itens' in r.body), 'os itens tem rota propria (/:id/itens)');
      assert.ok(!('valor_total' in r.body) && !texto.includes('valor_unitario') && !texto.includes('211.61'),
        `preco vazou no painel do recebimento: ${texto}`);
      assert.ok(!texto.includes('snap_fornecedor_'), 'colunas cruas vazaram');
      const nao = await aux(987654);
      assert.strictEqual(nao.status, 404);
      assert.strictEqual(nao.body.error, NAO_ENCONTRADO);
      // E a rota de itens, registrada ANTES, continua respondendo por /:id/itens.
      const itens = await request(app).get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${criadoId}/itens`);
      assert.strictEqual(itens.status, 200, JSON.stringify(itens.body));
      assert.ok(Array.isArray(itens.body));
    } finally { setUser(ADMIN); }
  });

  await test('legado sem snapshot no painel: origem cadastro, condicoes todas null', async () => {
    const r = await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES ('PC-LEGADO-AUX-E39', ?, 'pendente')", [outroForn]);
    const resp = await aux(r.lastID);
    assert.strictEqual(resp.status, 200, JSON.stringify(resp.body));
    assert.strictEqual(resp.body.fornecedor.origem, 'cadastro');
    assert.strictEqual(resp.body.fornecedor.nome, 'OUTRO FORNECEDOR SA');
    assert.deepStrictEqual(Object.values(resp.body.condicoes), Array(9).fill(null));
  });

  /* ── 8. RN-39.09: o recebimento continua sem IPI ─────────────────────────────────────────── */
  console.log('\nRN-39.09 — o recebimento REAL: custo medio pelo valor_unitario, SEM IPI');

  await test('material com IPI 10%: o pedido diz 55,00, a entrada fisica grava custo_medio = 5,00 (valor_unitario sem IPI)', async () => {
    const mat = await novoMaterial({ codigo: 'E39-IPI' });
    const pedido = await post({ fornecedor_id: tecnopar, status: 'aprovado', itens: [
      { material_id: mat, quantidade: 10, valor_unitario: 5, ipi_percentual: 10 },
    ] });
    assert.strictEqual(pedido.status, 201, JSON.stringify(pedido.body));
    assert.strictEqual(pedido.body.totais.total_ipi, 5);
    assert.strictEqual(pedido.body.totais.total_geral, 55);
    const linha = pedido.body.itens[0];

    // O caminho REAL: POST da tela, conferir, 3 avancos de workflow, fiscal, processar.
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.body.id,
      itens: [{ material_id: mat, pedido_item_id: linha.id, quantidade: 10, quantidade_recebida: 10 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;
    const [item] = await dbAll(db, 'SELECT id, valor_unitario, valor_total FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
    assert.strictEqual(item.valor_unitario, 5, 'o item do recebimento herda o valor_unitario da linha (U1 da 37), SEM IPI');
    assert.strictEqual(item.valor_total, 50, 'RN-11 da 32: a soma do recebimento e sem IPI (55 seria com)');

    const itensEco = [{ id: item.id, quantidade_recebida: 10 }];
    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens: itensEco });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const w = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(w.status, 200, `workflow ${acao}: ${JSON.stringify(w.body)}`);
    }
    const nf = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E39-${recId}`, fornecedor_id: tecnopar, fornecedor_nome: 'TECNOPAR FIXADORES LTDA',
      data_emissao_nf: '2026-10-01', data_entrada_nf: '2026-10-02', valor_total_nota: 55, itens: itensEco,
    });
    assert.strictEqual(nf.status, 200, JSON.stringify(nf.body));
    const proc = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));

    const m = await dbGet(db, 'SELECT quantidade_atual, custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 10, 'a entrada fisica aconteceu');
    assert.strictEqual(m.custo_medio, 5, `custo_medio = valor_unitario sem IPI; 5,5 seria com IPI: ${JSON.stringify(m)}`);
    assert.notStrictEqual(m.custo_medio, 5.5);
    const recebida = await dbGet(db, 'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linha.id]);
    assert.strictEqual(recebida.quantidade_recebida, 10, 'o acumulador da 37 continua achando a linha pelo id');
    // O pedido recebido continua com o documento intacto (totais com IPI) — o recebimento nao reescreve.
    const depois = await get(pedido.body.id);
    assert.strictEqual(depois.body.totais.total_geral, 55);
    assert.strictEqual(depois.body.teve_recebimento, 1);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
