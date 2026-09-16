/**
 * Etapa 32 / G1b — as opções que o formulário desenha como botão.
 * Executar: cd server && node tests/api/pedidoCompraOpcoes.api.test.js
 *
 * Pedido do P.O.: "todas as opções do formulário devem ser botões, não quero o usuário
 * escrevendo nada". Para virar botão, a opção precisa existir em algum lugar — e o risco é
 * o contrário do óbvio: a lista FIXA não cobrir o que a empresa já usa, e um pedido antigo
 * abrir na tela nova com um valor que nenhum botão representa. Por isso cada lista é a fixa
 * UNIDA ao que já foi gravado, e é isso que os cenários abaixo protegem.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { proximoNumeroSugerido } = require('../../services/compras/opcoesPedido');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const OPCOES = '/api/compras/pedidos-aux/opcoes';

(async () => {
  console.log('\n═══ Opções do formulário de pedido (API) ═══\n');
  const ctx = await createTestApp({ user: COMPRAS });
  const { app, db } = ctx;

  await dbRun(db, `INSERT INTO fornecedores (id, razao_social, cnpj)
    VALUES (1, 'TECNOPAR FIXADORES LTDA', '54.984.382/0001-64')`);

  // `configuracoes` é tabela CORE (index.js), fora do initSchema do almoxarifado — mesmo caso
  // de `clientes` e `fornecedores` no harness. Stub com as MESMAS colunas da produção.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE NOT NULL,
    valor TEXT,
    tipo TEXT DEFAULT 'text',
    categoria TEXT DEFAULT 'geral',
    descricao TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const [chave, valor] of [
    ['empresa_nome', 'GMP INDUSTRIAIS'],
    ['empresa_endereco', 'Av. Angelo Demarchi 130, Batistini'],
    ['empresa_cidade', 'São Bernardo do Campo'],
    ['empresa_estado', 'SP'],
  ]) {
    await dbRun(db, 'INSERT INTO configuracoes (chave, valor) VALUES (?,?)', [chave, valor]);
  }

  /* ── 1. as listas fixas ───────────────────────────────────────────── */
  console.log('Listas de botões');

  await test('devolve as listas que a tela precisa, sem nenhuma vazia', async () => {
    const r = await request(app).get(OPCOES);
    assert.strictEqual(r.status, 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    ['condicao_pagamento', 'frete_modalidade', 'via_transporte', 'unidades', 'ipi'].forEach((k) => {
      assert.ok(Array.isArray(r.body[k]), `${k} não é lista`);
      assert.ok(r.body[k].length > 0, `${k} veio vazia — a tela ficaria sem botão`);
    });
  });

  await test('frete traz as 6 modalidades da SEFAZ, com rótulo curto e valor completo', async () => {
    const r = await request(app).get(OPCOES);
    assert.strictEqual(r.body.frete_modalidade.length, 6);
    const terceiros = r.body.frete_modalidade.find((f) => f.valor.startsWith('2-'));
    // O valor gravado tem de continuar igual ao do ERP antigo: é o que sai no documento.
    assert.strictEqual(terceiros.valor, '2-Contratação do Frete por conta de Terceiros');
    assert.ok(terceiros.curto && terceiros.curto.length < terceiros.valor.length,
      'o rótulo curto tem de ser mais curto que o valor — é o que cabe no botão');
  });

  await test('endereço da empresa vem montado para o botão "entregar na GMP"', async () => {
    const r = await request(app).get(OPCOES);
    assert.strictEqual(r.body.empresa.nome, 'GMP INDUSTRIAIS');
    assert.strictEqual(r.body.empresa.endereco,
      'Av. Angelo Demarchi 130, Batistini - São Bernardo do Campo - SP');
  });

  await test('avisa quantos materiais existem (zero trava o pedido pela RN-09)', async () => {
    const r = await request(app).get(OPCOES);
    assert.strictEqual(r.body.total_materiais, 0);

    await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, quantidade_minima, quantidade_maxima,
       ponto_reposicao, lote_economico, prazo_reposicao_dias, controle_lote)
      VALUES ('OPC-1','Material opcoes','BR',0,1,0,0,0,0,0,0)`);

    const depois = await request(app).get(OPCOES);
    assert.strictEqual(depois.body.total_materiais, 1);
  });

  /* ── 2. a lista aprende com o uso ─────────────────────────────────── */
  console.log('\nAs listas crescem com o uso');

  await test('unidade usada num material entra na lista de unidades', async () => {
    const r = await request(app).get(OPCOES);
    // A lista mistura objetos (as fixas, com rótulo) e strings (as que vieram do banco);
    // o que importa é o VALOR, que é o que vai ser gravado no item.
    const valores = r.body.unidades.map((u) => (typeof u === 'object' ? u.valor : u));
    assert.ok(valores.includes('BR'), 'unidade do cadastro não apareceu');
    assert.ok(valores.includes('PC'), 'a lista fixa sumiu ao unir com a do banco');
  });

  await test('unidade ambígua tem rótulo explicativo, mas o valor gravado não muda', async () => {
    // A Gerente de Compras não conseguia distinguir G, M e L no botão. A correção é de
    // RÓTULO: se o valor mudasse para 'GR', todo material já cadastrado com 'G' deixaria de
    // casar com qualquer botão e a lista mostraria os dois como se fossem unidades diferentes.
    const r = await request(app).get(OPCOES);
    [['G', 'grama'], ['M', 'metro'], ['L', 'litro']].forEach(([valor, palavra]) => {
      const u = r.body.unidades.find((x) => typeof x === 'object' && x.valor === valor);
      assert.ok(u, `a unidade ${valor} sumiu da lista`);
      assert.ok(u.curto.toLowerCase().includes(palavra),
        `o botão de ${valor} voltou a ser ambíguo: "${u.curto}"`);
    });
  });

  await test('as condições que a Compras pediu estão na lista', async () => {
    const r = await request(app).get(OPCOES);
    ['PIX', 'Cartão de crédito', '30/60/60/90/120'].forEach((c) => {
      assert.ok(r.body.condicao_pagamento.includes(c), `"${c}" não virou botão`);
    });
  });

  await test('condição de pagamento nunca vista antes entra na lista', async () => {
    await request(app).post('/api/compras/pedidos').send({
      numero: '9001', fornecedor_id: 1, condicao_pagamento: '45/90/120 ESPECIAL',
      itens: [{ material_id: 1, quantidade: 1, valor_unitario: 10 }],
    });
    const r = await request(app).get(OPCOES);
    assert.ok(r.body.condicao_pagamento.includes('45/90/120 ESPECIAL'),
      'valor já gravado não virou botão — o pedido abriria com uma opção que a tela não mostra');
    assert.ok(r.body.condicao_pagamento.includes('28 D.D.L.'), 'a lista fixa sumiu');
  });

  await test('não duplica quando o valor usado já está na lista fixa', async () => {
    await request(app).post('/api/compras/pedidos').send({
      numero: '9002', fornecedor_id: 1, condicao_pagamento: '28 D.D.L.',
      itens: [{ material_id: 1, quantidade: 1, valor_unitario: 10 }],
    });
    const r = await request(app).get(OPCOES);
    const vezes = r.body.condicao_pagamento.filter((c) => c === '28 D.D.L.').length;
    assert.strictEqual(vezes, 1, `"28 D.D.L." apareceu ${vezes} vezes na lista de botões`);
  });

  /* ── 3. o número sugerido ─────────────────────────────────────────── */
  console.log('\nNúmero sugerido (RN-01: continua sendo escolha do comprador)');

  await test('sugere o maior número existente + 1, continuando a sequência da empresa', async () => {
    // 9002 é o maior gravado acima.
    assert.strictEqual(await proximoNumeroSugerido(db), '9003');
    const r = await request(app).get(OPCOES);
    assert.strictEqual(r.body.proximo_numero, '9003');
  });

  await test('número do ERP antigo continua a sequência (não reinicia em 1)', async () => {
    await request(app).post('/api/compras/pedidos').send({
      numero: '28433', fornecedor_id: 1,
      itens: [{ material_id: 1, quantidade: 1, valor_unitario: 10 }],
    });
    assert.strictEqual(await proximoNumeroSugerido(db), '28434');
  });

  await test('número com letras é ignorado na sugestão, não estoura a sequência', async () => {
    // DOIS casos, e o segundo é o que importa. 'PC-2025/ABC' castea para 0 e passa até SEM
    // filtro nenhum — foi esse caso fácil que escondeu o defeito na primeira versão desta
    // régua. '99999999-X' começa com dígito: castea para 99999999 e, com a régua errada
    // (`GLOB '[0-9]*'`, "começa com dígito"), empurraria a numeração da empresa para 10^8.
    await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id)
      VALUES ('PC-2025/ABC', 1)`);
    assert.strictEqual(await proximoNumeroSugerido(db), '28434');

    await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id)
      VALUES ('99999999-X', 1)`);
    assert.strictEqual(await proximoNumeroSugerido(db), '28434',
      'um número que COMEÇA com dígito entrou no MAX e estourou a sequência');
  });

  await test('a sugestão NÃO reserva nada: duas leituras devolvem o mesmo', async () => {
    // RN-01 mantém o número como escolha do comprador. Se isto passasse a reservar, dois
    // compradores abrindo a tela junto veriam números diferentes e um deles "perderia" o dele.
    const a = await request(app).get(OPCOES);
    const b = await request(app).get(OPCOES);
    assert.strictEqual(a.body.proximo_numero, b.body.proximo_numero);
    assert.strictEqual(a.body.proximo_numero, '28434');
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
