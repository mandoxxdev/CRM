/**
 * Etapa 13, Task 1 — RN-01 (registro unico com gate declarado), RN-02 (lista fail-closed),
 * RN-03 (dispatcher e export com o MESMO gate e a MESMA funcao).
 *
 * Plano: docs/superpowers/plans/2026-08-24-almoxarifado-etapa13-relatorios.md, Task 1, Step 1.
 * Design: docs/superpowers/specs/2026-08-24-almoxarifado-etapa13-relatorios-design.md, RN-01/02/03.
 *
 * Executar: cd server && node tests/api/relatoriosRegistro.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');
// Mesmo objeto de modulo requerido por routes/almoxarifado.js (cache do require do node) —
// `.__reportKeys` so existe depois que createTestApp() tiver rodado (o registrador principal
// agenda a extended num callback do sqlite; testApp.js faz o roundtrip que garante isso).
const registerExtendedRoutes = require('../../routes/almoxarifado/extended');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 };
const PRODUCAO = { id: 9, nome: 'Producao', role: 'usuario' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR' };

const CATEGORIAS_VALIDAS = ['Estoque', 'Movimentações', 'Gestão', 'Terceiros e clientes'];

// Le o corpo binario da resposta como Buffer — supertest/superagent nao reconhece o content-type
// de xlsx como binario por padrao e devolveria texto corrompido sem este parser.
function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}
function getBinary(req) {
  return req.buffer().parse(binaryParser);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `projetos` e `ordens_servico` sao tabelas CORE (index.js no boot), fora do initSchema do
  // almoxarifado — clienteEstoqueService.posicaoPorCliente faz LEFT JOIN nelas (query de
  // `aplicacoes`, que roda mesmo com resultado vazio). Molde: clientePosicaoTipos.api.test.js:101.
  // Sem isto, `materiais-cliente` com cliente_id valido responde 500 no harness, e um assert
  // fraco ("!= 404") aprovaria isso por engano (Fase 2, I3).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);

  const cliente = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Teste LTDA']);
  const clienteId = cliente.lastID;

  await test('[1] registro: 17 chaves, TODA entrada declara acao (nem que seja null), categorias validas', async () => {
    const chaves = Object.keys(RELATORIOS);
    assert.strictEqual(chaves.length, 17, JSON.stringify(chaves));
    for (const tipo of chaves) {
      const entrada = RELATORIOS[tipo];
      assert.ok('acao' in entrada, `${tipo}: entrada sem campo 'acao' declarado`);
      assert.ok(CATEGORIAS_VALIDAS.includes(entrada.categoria),
        `${tipo}: categoria '${entrada.categoria}' fora do enum`);
      assert.ok(Array.isArray(entrada.params), `${tipo}: params deveria ser array`);
      if (entrada.exportavel) {
        assert.ok(Array.isArray(entrada.colunas) && entrada.colunas.length > 0,
          `${tipo}: exportavel:true exige colunas declaradas`);
      } else {
        assert.strictEqual(entrada.colunas, null, `${tipo}: exportavel:false deveria ter colunas:null`);
      }
    }
    // Gates ATUAIS preservados (comportamento de antes do refactor).
    assert.strictEqual(RELATORIOS['inventario-divergencias'].acao, 'inventario');
    assert.strictEqual(RELATORIOS['solicitacoes-compra'].acao, 'gerenciar_reposicao');

    // fn ligada: prova que o wiring em extended.js (RELATORIOS[tipo].fn = reports[tipo]) rodou
    // para as 17 chaves — sem isto o dispatcher chamaria undefined().
    for (const tipo of chaves) {
      assert.strictEqual(typeof RELATORIOS[tipo].fn, 'function', `${tipo}: fn nao foi ligada`);
    }
  });

  await test('[3] PAR INVERSO: toda chave do mapa `reports` (extended.js) existe no registro', async () => {
    const reportKeys = registerExtendedRoutes.__reportKeys;
    assert.ok(Array.isArray(reportKeys) && reportKeys.length === 17, JSON.stringify(reportKeys));
    for (const tipo of reportKeys) {
      assert.ok(RELATORIOS[tipo], `chave '${tipo}' do dispatcher nao existe no registro`);
    }
    // E o par direto: toda chave do registro esta no mapa `reports`.
    for (const tipo of Object.keys(RELATORIOS)) {
      assert.ok(reportKeys.includes(tipo), `chave '${tipo}' do registro nao existe no dispatcher`);
    }
  });

  await test('[2] lista: ADMIN traz as 17 chaves, sem o campo acao', async () => {
    setUser(ADMIN);
    const res = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.relatorios), JSON.stringify(res.body));
    assert.strictEqual(res.body.relatorios.length, 17, JSON.stringify(res.body.relatorios.map((r) => r.tipo)));
    for (const item of res.body.relatorios) {
      assert.ok(!('acao' in item), `item '${item.tipo}' vazou o campo acao: ${JSON.stringify(item)}`);
      assert.ok(item.tipo && item.titulo && item.categoria, JSON.stringify(item));
      assert.ok(Array.isArray(item.params), JSON.stringify(item));
    }
  });

  await test('[2] lista: PRODUCAO (sem perfil) nao traz os 2 gated e traz os 15 sem gate', async () => {
    setUser(PRODUCAO);
    const res = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const tipos = res.body.relatorios.map((r) => r.tipo);
    assert.strictEqual(tipos.length, 15, JSON.stringify(tipos));
    assert.ok(!tipos.includes('inventario-divergencias'), JSON.stringify(tipos));
    assert.ok(!tipos.includes('solicitacoes-compra'), JSON.stringify(tipos));
    const semGate = Object.keys(RELATORIOS).filter((t) => RELATORIOS[t].acao === null);
    assert.deepStrictEqual([...tipos].sort(), [...semGate].sort(), JSON.stringify({ tipos, semGate }));
    for (const item of res.body.relatorios) {
      assert.ok(!('acao' in item), `item '${item.tipo}' vazou o campo acao`);
    }
  });

  await test('[3] paridade dispatcher x lista: todo tipo listado responde 200 ou 400 (nunca 404, nunca >=500)', async () => {
    setUser(ADMIN);
    const lista = (await request(app).get('/api/almoxarifado/relatorios')).body.relatorios;
    assert.strictEqual(lista.length, 17, JSON.stringify(lista.map((r) => r.tipo)));
    for (const { tipo } of lista) {
      const qs = tipo === 'materiais-cliente' ? `?cliente_id=${clienteId}` : '';
      const res = await request(app).get(`/api/almoxarifado/relatorios/${tipo}${qs}`);
      assert.ok([200, 400].includes(res.status),
        `${tipo}: status ${res.status} fora de {200,400} — ${JSON.stringify(res.body)}`);
      assert.notStrictEqual(res.status, 404, `${tipo}: 404 nao deveria acontecer para tipo listado`);
      // materiais-cliente com cliente_id valido tem de ser 200 de verdade (prova que os stubs
      // ordens_servico/projetos resolvem a query de aplicacoes) — 400 aqui seria regressao.
      if (tipo === 'materiais-cliente') {
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      }
    }
  });

  await test('[4] gate inventario-divergencias: PRODUCAO 403 literal, ADMIN 200 (par positivo+negativo)', async () => {
    setUser(PRODUCAO);
    let res = await request(app).get('/api/almoxarifado/relatorios/inventario-divergencias');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Sem permissão para este relatório', acao: 'inventario' });

    setUser(ADMIN);
    res = await request(app).get('/api/almoxarifado/relatorios/inventario-divergencias');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('[4] gate solicitacoes-compra: PRODUCAO 403 literal, COMPRAS 200 (par positivo+negativo)', async () => {
    setUser(PRODUCAO);
    let res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Sem permissão para este relatório', acao: 'gerenciar_reposicao' });

    setUser(COMPRAS);
    res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(GESTOR);
    res = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('[404] tipo inexistente: dispatcher e export', async () => {
    setUser(ADMIN);
    let res = await request(app).get('/api/almoxarifado/relatorios/tipo-que-nao-existe');
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Relatório não encontrado' });

    res = await request(app).get('/api/almoxarifado/relatorios/tipo-que-nao-existe/export');
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Relatório não encontrado' });
  });

  await test('[400] materiais-cliente sem cliente_id: dispatcher e export com o MESMO literal', async () => {
    setUser(ADMIN);
    let res = await request(app).get('/api/almoxarifado/relatorios/materiais-cliente');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'informe o cliente_id');

    res = await request(app).get('/api/almoxarifado/relatorios/materiais-cliente/export');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'informe o cliente_id');
  });

  await test('[404] materiais-cliente com cliente_id inexistente: "Cliente nao encontrado" (segundo 404 da familia)', async () => {
    setUser(ADMIN);
    const res = await request(app).get('/api/almoxarifado/relatorios/materiais-cliente?cliente_id=999999');
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Cliente nao encontrado');
  });

  await test('[5] export estoque-atual: 200, content-type/attachment corretos, PARIDADE de linhas E cabecalho por deepStrictEqual', async () => {
    await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, categoria, unidade, quantidade_atual, custo_unitario, ativo, proprietario_cliente_id)
      VALUES ('EXP-1','Chapa de teste','METAL','UN',10,2.5,1,NULL)`);

    setUser(ADMIN);
    const jsonRes = await request(app).get('/api/almoxarifado/relatorios/estoque-atual');
    assert.strictEqual(jsonRes.status, 200, JSON.stringify(jsonRes.body));
    assert.ok(jsonRes.body.length >= 1, JSON.stringify(jsonRes.body));

    const exportRes = await getBinary(request(app).get('/api/almoxarifado/relatorios/estoque-atual/export'));
    assert.strictEqual(exportRes.status, 200, 'export deveria responder 200');
    assert.strictEqual(exportRes.headers['content-type'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', JSON.stringify(exportRes.headers));
    const hoje = new Date().toISOString().slice(0, 10);
    assert.strictEqual(exportRes.headers['content-disposition'],
      `attachment; filename="estoque-atual-${hoje}.xlsx"`, JSON.stringify(exportRes.headers));

    const XLSX = require('xlsx');
    const wb = XLSX.read(exportRes.body, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const cabecalho = linhas[0];
    const rotulosDeclarados = RELATORIOS['estoque-atual'].colunas.map((c) => c.rotulo);
    assert.deepStrictEqual(cabecalho, rotulosDeclarados,
      `cabecalho do xlsx (${JSON.stringify(cabecalho)}) deveria bater EXATAMENTE com os rotulos declarados`);
    // Paridade de LINHAS: mesmo numero de linhas de dados no xlsx e no JSON do dispatcher.
    assert.strictEqual(linhas.length - 1, jsonRes.body.length,
      `xlsx tem ${linhas.length - 1} linhas de dados, JSON tem ${jsonRes.body.length}`);
  });

  await test('[5][C3] exportar o MESMO tipo DUAS vezes no mesmo processo: cabecalhos identicos, registro/lista inalterados', async () => {
    setUser(ADMIN);
    const colunasAntes = JSON.parse(JSON.stringify(RELATORIOS['estoque-atual'].colunas));

    const primeira = await getBinary(request(app).get('/api/almoxarifado/relatorios/estoque-atual/export'));
    const segunda = await getBinary(request(app).get('/api/almoxarifado/relatorios/estoque-atual/export'));

    const XLSX = require('xlsx');
    const cabecalho = (buf) => {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
    };
    assert.deepStrictEqual(cabecalho(primeira.body), cabecalho(segunda.body),
      'dois exports seguidos do mesmo tipo deveriam ter cabecalhos identicos');

    // O registro em memoria (o mesmo objeto que a rota de lista le) tem de continuar EXATAMENTE
    // como estava — se json_to_sheet tivesse recebido o array do registro direto, a lib teria
    // dado PUSH nele (medido: ['A','B'] vira ['A','B','EXTRA']) e este assert cairia.
    assert.deepStrictEqual(RELATORIOS['estoque-atual'].colunas, colunasAntes,
      'RELATORIOS.estoque-atual.colunas mudou depois do export — o singleton foi corrompido');

    const listaDepois = await request(app).get('/api/almoxarifado/relatorios');
    const itemDepois = listaDepois.body.relatorios.find((r) => r.tipo === 'estoque-atual');
    assert.ok(itemDepois, 'estoque-atual deveria continuar na lista');
    assert.deepStrictEqual(itemDepois.params, RELATORIOS['estoque-atual'].params,
      'params da lista divergiram do registro depois do export');
  });

  await test('[5][C1] export de sucata-financeiro e de materiais-cliente (objeto, nao array): 400 "Relatório sem exportação tabular"', async () => {
    setUser(ADMIN);
    let res = await request(app).get('/api/almoxarifado/relatorios/sucata-financeiro/export');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Relatório sem exportação tabular');

    res = await request(app).get(`/api/almoxarifado/relatorios/materiais-cliente/export?cliente_id=${clienteId}`);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Relatório sem exportação tabular');
  });

  await test('[5] export de tipo gated sem perfil: 403 igual ao dispatcher', async () => {
    setUser(PRODUCAO);
    const res = await request(app).get('/api/almoxarifado/relatorios/inventario-divergencias/export');
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Sem permissão para este relatório', acao: 'inventario' });
  });

  await test('[6] sucata-financeiro filtra por `de` (nome REAL do param) — corta uma sucata de duas', async () => {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, categoria, unidade, quantidade_atual, custo_unitario, ativo)
      VALUES ('SUC-1','Retalho sucateado','METAL','UN',0,5,1)`);
    const materialId = mat.lastID;

    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, cancelado, created_at)
      VALUES (?, 'SUCATA', 3, 3, 0, 0, '2025-01-10 10:00:00')`, [materialId]);
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, cancelado, created_at)
      VALUES (?, 'SUCATA', 7, 10, 3, 0, '2025-06-20 10:00:00')`, [materialId]);

    setUser(ADMIN);
    const semFiltro = await request(app).get('/api/almoxarifado/relatorios/sucata-financeiro');
    assert.strictEqual(semFiltro.status, 200, JSON.stringify(semFiltro.body));
    const totalSemFiltro = semFiltro.body.movimentacoes.filter((m) => m.material_id === materialId).length;
    assert.strictEqual(totalSemFiltro, 2, JSON.stringify(semFiltro.body.movimentacoes));

    // `de` (nao data_inicio) e o nome REAL do parametro (Fase 2, I6) — corta a de janeiro,
    // mantem a de junho.
    const comFiltro = await request(app).get('/api/almoxarifado/relatorios/sucata-financeiro?de=2025-06-01');
    assert.strictEqual(comFiltro.status, 200, JSON.stringify(comFiltro.body));
    const doMaterial = comFiltro.body.movimentacoes.filter((m) => m.material_id === materialId);
    assert.strictEqual(doMaterial.length, 1, JSON.stringify(doMaterial));
    assert.strictEqual(doMaterial[0].quantidade, 7, JSON.stringify(doMaterial));

    // Nome ERRADO (data_inicio) tem de ser IGNORADO, nao filtrar — devolve as duas de novo.
    const nomeErrado = await request(app).get('/api/almoxarifado/relatorios/sucata-financeiro?data_inicio=2025-06-01');
    assert.strictEqual(nomeErrado.status, 200, JSON.stringify(nomeErrado.body));
    const doMaterialErrado = nomeErrado.body.movimentacoes.filter((m) => m.material_id === materialId);
    assert.strictEqual(doMaterialErrado.length, 2,
      'nome errado do parametro deveria ser ignorado (periodo inteiro), nao filtrar');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
