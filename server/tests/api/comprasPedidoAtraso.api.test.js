/**
 * Etapa 39, Task 1 (RN-D04, RN-D05, RN-D06, RN-D13) — o atraso DERIVADO na leitura de
 * GET /api/compras/pedidos.
 *
 * ⚠️ NENHUMA DATA LITERAL NESTE ARQUIVO. Todas derivam de `hojeLocalISO()`, a MESMA funcao que a
 * rota usa: um fixture com '2026-09-15' escrito a mao e atrasado hoje e nao e amanha, e o arquivo
 * viraria falso-verde sem ninguem notar (R3 do design).
 *
 * ⚠️ O QUE ESTE ARQUIVO PROVA QUE NENHUM `assert` DE STATUS PEGA: a derivacao acontece na LEITURA e
 * NAO GRAVA NADA. O cenario (1) le a linha do banco antes e depois da listagem e afirma que a
 * coluna `atrasado` NAO existe e que `updated_at` nao mudou — sem isso, alguem "otimizaria" a
 * feature para um `UPDATE` e a suite continuaria verde ate a virada da meia-noite em producao.
 *
 * Executar: cd server && node tests/api/comprasPedidoAtraso.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { hojeLocalISO } = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 64, nome: 'Admin E39', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 66, nome: 'Chao de Fabrica E39', role: 'user', email: 'prod@test.com' };

// hoje + N dias, em data LOCAL, pela MESMA regua do servidor. Nao usa toISOString (UTC).
function diasDeHoje(n) {
  const [a, m, d] = hojeLocalISO().split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Acos Vale E39','79.779.779/0001-79')`);

  let seq = 0;
  async function novoPedido({ previsao, status = 'pendente', criadoEm = null }) {
    seq += 1;
    // ⚠️ O sufixo e PADDED com 3 digitos de proposito: o `?search=` da rota e `numero LIKE '%x%'`,
    // entao um `PC-E39-1` casaria tambem com `PC-E39-10` e o "exatamente 1 linha" do cenario (8)
    // viraria 2 assim que a suite passasse de nove pedidos. (Divergencia declarada do brief, que
    // escrevia `PC-E39-${seq}`.)
    const numero = `PC-E39-${String(seq).padStart(3, '0')}`;
    // `criadoEm` so e passado pelo cenario (8), e o motivo esta escrito la: `created_at DATETIME
    // DEFAULT CURRENT_TIMESTAMP` tem resolucao de UM SEGUNDO, entao todos os fixtures de um
    // arquivo empatam e o `ORDER BY created_at DESC` nao ordena nada de verificavel.
    const p = criadoEm
      ? await dbRun(db, `INSERT INTO pedidos_compra
          (numero, fornecedor_id, previsao_entrega, status, created_at) VALUES (?,?,?,?,?)`,
      [numero, forn.lastID, previsao, status, criadoEm])
      : await dbRun(db, `INSERT INTO pedidos_compra
          (numero, fornecedor_id, previsao_entrega, status) VALUES (?,?,?,?)`,
      [numero, forn.lastID, previsao, status]);
    return { id: p.lastID, numero };
  }
  const listar = (qs) => request(app).get(`/api/compras/pedidos${qs || ''}`);
  const naLista = async (qs, id) => (await listar(qs)).body.find((p) => p.id === id);

  await test('(1) RN-D04 previsao de ontem e status pendente -> atrasado 1, dias_atraso 1, e nada e gravado', async () => {
    const p = await novoPedido({ previsao: diasDeHoje(-1), status: 'pendente' });
    const antes = await dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [p.id]);

    const linha = await naLista('', p.id);
    assert.ok(linha, `o pedido ${p.numero} sumiu da listagem`);
    assert.strictEqual(linha.atrasado, 1, `esperava atrasado 1, veio ${JSON.stringify(linha.atrasado)}`);
    assert.strictEqual(typeof linha.atrasado, 'number',
      `atrasado tem de ser NUMERO (0|1), veio ${typeof linha.atrasado}`);
    assert.strictEqual(linha.dias_atraso, 1, `esperava dias_atraso 1, veio ${JSON.stringify(linha.dias_atraso)}`);

    // O QUE MEDE O DANO: leitura nao escreve.
    const depois = await dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [p.id]);
    assert.ok(!('atrasado' in depois), 'a coluna `atrasado` passou a existir em pedidos_compra — a derivacao virou gravacao');
    assert.ok(!('dias_atraso' in depois), 'a coluna `dias_atraso` passou a existir em pedidos_compra');
    assert.strictEqual(depois.updated_at, antes.updated_at,
      'listar pedidos ESCREVEU na linha (updated_at mudou) — a derivacao tem de ser so leitura');
  });

  await test('(2) RN-D05b vence hoje NAO esta atrasado', async () => {
    const p = await novoPedido({ previsao: hojeLocalISO(), status: 'pendente' });
    const linha = await naLista('', p.id);
    assert.ok(linha, `o pedido ${p.numero} sumiu da listagem`);
    assert.strictEqual(linha.atrasado, 0,
      `vence hoje virou atrasado: esperava atrasado 0, veio ${JSON.stringify(linha.atrasado)} (`
      + '`<=` no lugar de `<`?)');
    assert.strictEqual(linha.dias_atraso, null,
      `esperava dias_atraso null, veio ${JSON.stringify(linha.dias_atraso)}`);
  });

  await test('(3) RN-D05c previsao de amanha -> atrasado 0', async () => {
    const p = await novoPedido({ previsao: diasDeHoje(1), status: 'pendente' });
    const linha = await naLista('', p.id);
    assert.ok(linha, `o pedido ${p.numero} sumiu da listagem`);
    assert.strictEqual(linha.atrasado, 0, `esperava atrasado 0, veio ${JSON.stringify(linha.atrasado)}`);
    assert.strictEqual(linha.dias_atraso, null,
      `esperava dias_atraso null, veio ${JSON.stringify(linha.dias_atraso)}`);
  });

  await test('(4) RN-D05a previsao NULL nunca atrasa', async () => {
    const nulo = await novoPedido({ previsao: null, status: 'pendente' });
    const lNulo = await naLista('', nulo.id);
    assert.ok(lNulo, `o pedido ${nulo.numero} sumiu da listagem`);
    assert.strictEqual(lNulo.atrasado, 0, `previsao NULL: esperava atrasado 0, veio ${JSON.stringify(lNulo.atrasado)}`);
    assert.strictEqual(lNulo.dias_atraso, null,
      `previsao NULL: dias_atraso tem de ser null e NUNCA 0, veio ${JSON.stringify(lNulo.dias_atraso)}`);

    // Metade positiva no MESMO test(): a string VAZIA, que a base tem de verdade (linhas gravadas
    // antes do F3 da Etapa 38). O guarda e a REGEX de `derivarAtraso`, nao um `IS NOT NULL`.
    const vazio = await novoPedido({ previsao: '', status: 'pendente' });
    const lVazio = await naLista('', vazio.id);
    assert.ok(lVazio, `o pedido ${vazio.numero} sumiu da listagem`);
    assert.strictEqual(lVazio.atrasado, 0, `previsao '': esperava atrasado 0, veio ${JSON.stringify(lVazio.atrasado)}`);
    assert.strictEqual(lVazio.dias_atraso, null,
      `previsao '': dias_atraso tem de ser null e NUNCA 0, veio ${JSON.stringify(lVazio.dias_atraso)}`);
  });

  await test('(5) RN-D05d recebido/cancelado/rejeitado nao atrasam', async () => {
    for (const status of ['recebido', 'cancelado', 'rejeitado']) {
      const p = await novoPedido({ previsao: diasDeHoje(-2), status });
      const linha = await naLista('', p.id);
      assert.ok(linha, `o pedido ${p.numero} (${status}) sumiu da listagem`);
      assert.strictEqual(linha.atrasado, 0,
        `status '${status}' com previsao de anteontem devia ficar FORA do atraso, veio atrasado ${JSON.stringify(linha.atrasado)}`);
      assert.strictEqual(linha.dias_atraso, null,
        `status '${status}': esperava dias_atraso null, veio ${JSON.stringify(linha.dias_atraso)}`);
    }
  });

  await test('(6) RN-D05 metade positiva: os quatro status restantes atrasam', async () => {
    // SEM ESTA METADE, uma lista de exclusao VAZIA (ou um `NOT IN ('%')`) passaria no (5) por
    // acidente: e ela que distingue "lista vazia" de "lista errada".
    for (const status of ['pendente', 'aprovado', 'em_analise', 'enviado']) {
      const p = await novoPedido({ previsao: diasDeHoje(-2), status });
      const linha = await naLista('', p.id);
      assert.ok(linha, `o pedido ${p.numero} (${status}) sumiu da listagem`);
      assert.strictEqual(linha.atrasado, 1,
        `status '${status}' com previsao de anteontem TEM de atrasar, veio atrasado ${JSON.stringify(linha.atrasado)}`);
      assert.strictEqual(linha.dias_atraso, 2,
        `status '${status}': esperava dias_atraso 2, veio ${JSON.stringify(linha.dias_atraso)}`);
    }
  });

  await test('(7) RN-D04 aritmetica: previsao = hoje-3 -> dias_atraso 3', async () => {
    const tres = await novoPedido({ previsao: diasDeHoje(-3), status: 'pendente' });
    const lTres = await naLista('', tres.id);
    assert.ok(lTres, `o pedido ${tres.numero} sumiu da listagem`);
    assert.strictEqual(lTres.dias_atraso, 3, `hoje-3: esperava 3, veio ${JSON.stringify(lTres.dias_atraso)}`);

    // O controle de fuso: hoje-1 e UM dia, nunca 0 (arredondamento para baixo) e nunca 2
    // (subtracao com horas de fusos diferentes nas duas pontas).
    const um = await novoPedido({ previsao: diasDeHoje(-1), status: 'pendente' });
    const lUm = await naLista('', um.id);
    assert.ok(lUm, `o pedido ${um.numero} sumiu da listagem`);
    assert.strictEqual(lUm.dias_atraso, 1,
      `hoje-1: esperava 1 (nunca 0, nunca 2), veio ${JSON.stringify(lUm.dias_atraso)}`);
  });

  await test('(8) RN-D06 o filtro ?atrasados=1 e a composicao', async () => {
    // Os `created_at` sao EXPLICITOS e DISTINTOS (o primeiro inserido e o mais VELHO), de
    // proposito — ver a assercao de ordem no fim deste cenario.
    const atrasado = await novoPedido({ previsao: diasDeHoje(-4), status: 'pendente', criadoEm: `${diasDeHoje(-40)} 08:00:00` });
    const noPrazo = await novoPedido({ previsao: diasDeHoje(2), status: 'pendente', criadoEm: `${diasDeHoje(-39)} 08:00:00` });
    const semPrevisao = await novoPedido({ previsao: null, status: 'pendente', criadoEm: `${diasDeHoje(-38)} 08:00:00` });
    const atrasadoAprovado = await novoPedido({ previsao: diasDeHoje(-4), status: 'aprovado', criadoEm: `${diasDeHoje(-37)} 08:00:00` });

    // Filtra SEMPRE por id, nunca por `length` global: os test() anteriores ja inseriram pedidos
    // neste mesmo banco.
    const idsDe = async (qs) => (await listar(qs)).body.map((p) => p.id);
    const tem = (ids, alvo) => ids.includes(alvo.id);

    const todos = await idsDe('');
    for (const p of [atrasado, noPrazo, semPrevisao]) {
      assert.ok(tem(todos, p), `sem filtro, ${p.numero} tinha de estar na resposta`);
    }

    const so1 = await idsDe('?atrasados=1');
    assert.ok(tem(so1, atrasado), `?atrasados=1 perdeu o atrasado ${atrasado.numero}`);
    assert.ok(!tem(so1, noPrazo), `?atrasados=1 devolveu ${noPrazo.numero}, que esta no prazo`);
    assert.ok(!tem(so1, semPrevisao), `?atrasados=1 devolveu ${semPrevisao.numero}, que nao tem previsao`);

    // So a string '1' liga o filtro: `if (req.query.atrasados)` ligaria com '0' e com 'sim'.
    for (const qs of ['?atrasados=0', '?atrasados=', '?atrasados=sim']) {
      const ids = await idsDe(qs);
      for (const p of [atrasado, noPrazo, semPrevisao]) {
        assert.ok(tem(ids, p), `'${qs}' NAO liga o filtro, mas ${p.numero} sumiu da resposta`);
      }
    }

    // Composicao com `status`
    const comStatus = await idsDe('?atrasados=1&status=pendente');
    assert.ok(tem(comStatus, atrasado), 'atrasados=1&status=pendente perdeu o atrasado pendente');
    assert.ok(!tem(comStatus, atrasadoAprovado),
      `atrasados=1&status=pendente devolveu ${atrasadoAprovado.numero}, que e 'aprovado'`);

    // Composicao com `search`
    const comSearch = (await listar(`?atrasados=1&search=${atrasado.numero}`)).body;
    assert.strictEqual(comSearch.length, 1,
      `atrasados=1&search=${atrasado.numero}: esperava exatamente 1 linha, vieram ${comSearch.length}`);
    assert.strictEqual(comSearch[0].id, atrasado.id, 'a linha devolvida nao e a do numero buscado');

    // `?atrasados=1` filtra DEPOIS do SQL, entao o `ORDER BY p.created_at DESC` da 38 tem de
    // sobreviver nas DUAS respostas.
    //
    // ⚠️ MEDIDO, e e por isso que esta assercao NAO compara ids com `[...ids].sort((a,b)=>b-a)`
    // como o plano previa: `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` tem resolucao de UM
    // SEGUNDO. Todos os fixtures de um arquivo de teste nascem no MESMO segundo, empatam no
    // `ORDER BY`, e o SQLite devolve o desempate em ordem de rowid — ou seja, id CRESCENTE. A
    // assercao "id decrescente" caia com a rota CORRETA (foi o unico vermelho do primeiro GREEN
    // desta task). Por isso os quatro pedidos deste cenario tem `created_at` EXPLICITO e
    // DISTINTO, crescente com o id: a resposta tem de traze-los na ordem INVERSA da de insercao,
    // o que so acontece se o `ORDER BY created_at DESC` estiver la de verdade.
    const idsTodos = await idsDe('');
    const idsAtrasados = await idsDe('?atrasados=1');
    const meus = [atrasadoAprovado, semPrevisao, noPrazo, atrasado]; // created_at DESC
    assert.deepStrictEqual(idsTodos.filter((id) => meus.some((p) => p.id === id)), meus.map((p) => p.id),
      'ORDER BY p.created_at DESC quebrou na lista completa: ' + idsTodos.join(','));
    const meusAtrasados = [atrasadoAprovado, atrasado];
    assert.deepStrictEqual(idsAtrasados.filter((id) => meusAtrasados.some((p) => p.id === id)),
      meusAtrasados.map((p) => p.id),
      'a derivacao reordenou a resposta filtrada: ' + idsAtrasados.join(','));
  });

  await test('(9) RN-D13 401 sem token, 200 com o modulo', async () => {
    // NOTA: o 403 "sem o modulo" NAO e exercitavel neste harness —
    // `fakeCheckModulePermission = () => (req,res,next) => next()` (testApp.js). Esta escrito aqui
    // para ninguem escrever um cenario que so pode passar por acidente.
    setUser(null);
    const semToken = await listar('');
    assert.strictEqual(semToken.status, 401, `sem usuario: esperava 401, veio ${semToken.status}`);

    // O core Compras tem UMA camada: perfil nao decide. Chao de fabrica LE a lista.
    setUser(PRODUCAO);
    const producao = await listar('');
    assert.strictEqual(producao.status, 200, `PRODUCAO: esperava 200, veio ${producao.status}`);
    assert.ok(producao.body.length > 0, 'fixture vazia: este cenario nao mediria os campos novos');
    for (const linha of producao.body) {
      assert.ok('atrasado' in linha, `a linha ${linha.numero} veio sem o campo atrasado`);
      assert.ok('dias_atraso' in linha, `a linha ${linha.numero} veio sem o campo dias_atraso`);
    }

    // Metade positiva, e restaura o usuario para os cenarios seguintes.
    setUser(ADMIN);
    const admin = await listar('');
    assert.strictEqual(admin.status, 200, `ADMIN: esperava 200, veio ${admin.status}`);
  });

  await test('(10) RN-D06 ?pendentes=1 nao ganhou os campos da Etapa 39', async () => {
    // ⚠️ ESTE CENARIO NAO PROVA "identico antes e depois da etapa" — nenhum teste em execucao
    // consegue comparar com o codigo de HEAD~. As reguas que de fato guardam o `?pendentes=1` sao
    // TRES: (i) R12, NENHUM arquivo da Etapa 37 e tocado (`git diff --name-only` no fim da task);
    // (ii) `recebimentoContraPedidoIntegracao.api.test.js` e `pedidosCompraSaldoAux.api.test.js`
    // continuam verdes; (iii) o que ESTE cenario mede: os campos NOVOS nao VAZARAM para a rota aux.
    const linhas = (await request(app)
      .get('/api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1')).body;
    assert.ok(linhas.length > 0, 'fixture vazia: este cenario nao mediria nada');
    for (const l of linhas) {
      assert.ok(!('atrasado' in l), 'a rota aux da 37 ganhou `atrasado` — R12 violado');
      assert.ok(!('dias_atraso' in l), 'a rota aux da 37 ganhou `dias_atraso` — R12 violado');
      assert.ok(!('previsao_entrega' in l), 'a rota aux da 37 passou a devolver previsao_entrega');
    }
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
