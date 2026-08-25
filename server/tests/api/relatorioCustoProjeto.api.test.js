/**
 * Etapa 14, Task 3 — RN-05: relatorio de custo por projeto.
 * GET /api/almoxarifado/relatorios/custo-por-projeto (e /export) — gate gerenciar_reposicao (D6).
 *
 * MOLDE DO HARNESS (Global Constraints da Etapa 14): `projetos` e tabela CORE, fora do
 * initSchema do almoxarifado — stub MOLDE clientePosicaoTipos.api.test.js:99 (o JOIN so precisa
 * de id/nome).
 *
 * FIXTURE DE CUSTO POR VIAS DIFERENTES (Fase 2, I4 — duas saidas do MESMO material tem sempre o
 * MESMO custo e nao provam nada que a fonte unica e usada de verdade): M1 custo_medio=8 (>0,
 * MANDA) / custo_unitario=99 (decoy) -> vale 8; M2 custo_medio=0 (cai para custo_unitario) /
 * custo_unitario=5 -> vale 5.
 *
 * DEVOLUCAO PELA ROTA REAL (Fase 2, I2 — uma fixture SQL fingiria que funciona): o payload de
 * teste replica EXATAMENTE o shape que DevolucoesAlmoxarifado.js:160-170 manda — material_id,
 * quantidade, motivo, destino, condicao, observacoes, movimentacao_saida_id, lote_id, series —
 * NUNCA origem_projeto_id/origem_os_id (a tela nao os envia). Sem a heranca em returnService.js
 * (returnService.js:88-89), a devolucao nao carregaria projeto_id nenhum e `devolvido` ficaria
 * ESTRUTURALMENTE ZERO em producao.
 *
 * Executar: cd server && node tests/api/relatorioCustoProjeto.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };
const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };
const GESTOR = { id: 7, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };

let seq = 0;
async function novoMaterial(db, over = {}) {
  seq += 1;
  const m = { codigo: `RCP-${seq}`, nome: `Material RCP ${seq}`, unidade: 'UN',
    custo_unitario: 0, custo_medio: 0, cliente_id: null, ...over };
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, custo_unitario, custo_medio,
       proprietario_cliente_id)
     VALUES (?,?,?,0,1,?,?,?)`,
    [m.codigo, m.nome, m.unidade, m.custo_unitario, m.custo_medio, m.cliente_id]);
  return r.lastID;
}

async function novoProjeto(db, nome) {
  const r = await dbRun(db, 'INSERT INTO projetos (nome) VALUES (?)', [nome]);
  return r.lastID;
}

// Fixture crua no livro — MESMO padrao de compraContextoMaterial.api.test.js (saidaNoLivro) e
// clientePosicaoTipos.api.test.js (lancar): a movimentacao SAIDA/DEVOLUCAO nao precisa passar
// pelo motor para o RELATORIO ser exercitado (ele so LE o livro) — so a devolucao com heranca
// (I2) precisa da rota real, feito abaixo com supertest.
async function movimento(db, materialId, tipo, quantidade, projetoId, { cancelado = 0, createdAt = null } = {}) {
  const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id, cancelado, projeto_id, created_at)
     VALUES (?,?,?,0,0,1,?,?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [materialId, tipo, quantidade, cancelado, projetoId, createdAt]);
  return r.lastID;
}

function relatorio(app, qs = '') {
  return request(app).get(`/api/almoxarifado/relatorios/custo-por-projeto${qs}`);
}

// binaryParser/getBinary — mesmo molde de relatoriosRegistro.api.test.js (supertest nao
// reconhece o content-type de xlsx como binario por padrao).
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

  // MOLDE DO HARNESS (Global Constraints): `projetos` e tabela CORE (index.js), fora do
  // initSchema do almoxarifado. Molde clientePosicaoTipos.api.test.js:99 — o JOIN so precisa de
  // id/nome.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);

  setUser(ADMIN);

  await test('(1) DOIS projetos, custo por VIAS DIFERENTES, devolucao PELA ROTA REAL reduz o liquido; sem-projeto/cliente/cancelada nao vazam; outro projeto nao vaza', async () => {
    const alfa = await novoProjeto(db, 'Projeto Alfa');
    const beta = await novoProjeto(db, 'Projeto Beta');

    const m1 = await novoMaterial(db, { custo_medio: 8, custo_unitario: 99 }); // custo_medio MANDA -> vale 8
    const m2 = await novoMaterial(db, { custo_medio: 0, custo_unitario: 5 });  // cai para custo_unitario -> vale 5
    const m3 = await novoMaterial(db, { custo_medio: 0, custo_unitario: 7 });  // Beta, isolado

    const saidaM1 = await movimento(db, m1, 'SAIDA', 3, alfa); // 3*8 = 24
    await movimento(db, m2, 'SAIDA', 2, alfa);                 // 2*5 = 10  -> Alfa consumido = 34
    await movimento(db, m3, 'SAIDA', 5, beta);                 // 5*7 = 35  -> Beta consumido = 35

    // Movimentacao SEM projeto (projeto_id NULL): nao pode vazar para lugar nenhum.
    await movimento(db, m1, 'SAIDA', 100, null);

    // Movimentacao de material de CLIENTE, MESMO projeto Alfa: patrimonio alheio, fora.
    const mCliente = await novoMaterial(db, { custo_medio: 0, custo_unitario: 1000, cliente_id: (
      await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente RCP Ltda')")).lastID });
    await movimento(db, mCliente, 'SAIDA', 1000, alfa);

    // Movimentacao CANCELADA, mesmo projeto/material: fora.
    await movimento(db, m1, 'SAIDA', 500, alfa, { cancelado: 1 });

    // Devolucao PELA ROTA REAL (I2): payload IDENTICO ao que a tela manda (sem
    // origem_projeto_id/origem_os_id) — a heranca em returnService.js precisa puxar o projeto_id
    // da saida CITADA (saidaM1, projeto Alfa).
    const devRes = await request(app).post('/api/almoxarifado/devolucoes').send({
      material_id: m1, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE',
      movimentacao_saida_id: saidaM1,
    });
    assert.strictEqual(devRes.status, 201, JSON.stringify(devRes.body));
    // devolvido = 1 * custo(m1) = 1 * 8 = 8

    const res = await relatorio(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body), JSON.stringify(res.body));

    const linhaAlfa = res.body.find((r) => r.projeto_id === alfa);
    assert.ok(linhaAlfa, `projeto Alfa deveria aparecer: ${JSON.stringify(res.body)}`);
    assert.strictEqual(linhaAlfa.projeto_nome, 'Projeto Alfa', JSON.stringify(linhaAlfa));
    assert.strictEqual(linhaAlfa.consumido, 34, JSON.stringify(linhaAlfa));
    assert.strictEqual(linhaAlfa.devolvido, 8, JSON.stringify(linhaAlfa));
    assert.strictEqual(linhaAlfa.liquido, 26, JSON.stringify(linhaAlfa));
    assert.strictEqual(linhaAlfa.movimentacoes, 3, JSON.stringify(linhaAlfa)); // 2 saidas + 1 devolucao

    const linhaBeta = res.body.find((r) => r.projeto_id === beta);
    assert.ok(linhaBeta, `projeto Beta deveria aparecer: ${JSON.stringify(res.body)}`);
    assert.strictEqual(linhaBeta.consumido, 35, JSON.stringify(linhaBeta));
    assert.strictEqual(linhaBeta.devolvido, 0, JSON.stringify(linhaBeta));
    assert.strictEqual(linhaBeta.liquido, 35, JSON.stringify(linhaBeta));
    assert.strictEqual(linhaBeta.movimentacoes, 1, JSON.stringify(linhaBeta));

    assert.ok(!res.body.some((r) => r.projeto_id === null), 'movimentacao sem projeto nao pode gerar linha');
  });

  await test('(2) tipos de devolucao: DEVOLUCAO legado soma devolvido; DEVOLUCAO_CLIENTE e SAIDA e NAO soma devolvido (soma consumido)', async () => {
    const delta = await novoProjeto(db, 'Projeto Delta');
    const gama = await novoProjeto(db, 'Projeto Gama');
    const m5 = await novoMaterial(db, { custo_medio: 0, custo_unitario: 3 });
    const m4 = await novoMaterial(db, { custo_medio: 0, custo_unitario: 6 });

    // DEVOLUCAO (legado, TIPOS_DEVOLUCAO): entra em devolvido.
    await movimento(db, m5, 'SAIDA', 10, delta);       // consumido 30
    await movimento(db, m5, 'DEVOLUCAO', 4, delta);    // devolvido 12 -> liquido 18

    // DEVOLUCAO_CLIENTE (TIPOS_SAIDA): apesar do nome, e SAIDA — soma em consumido, NUNCA em
    // devolvido (design RN-05).
    await movimento(db, m4, 'DEVOLUCAO_CLIENTE', 2, gama); // consumido 12, devolvido 0

    const res = await relatorio(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhaDelta = res.body.find((r) => r.projeto_id === delta);
    assert.strictEqual(linhaDelta.consumido, 30, JSON.stringify(linhaDelta));
    assert.strictEqual(linhaDelta.devolvido, 12, JSON.stringify(linhaDelta));
    assert.strictEqual(linhaDelta.liquido, 18, JSON.stringify(linhaDelta));
    assert.strictEqual(linhaDelta.movimentacoes, 2, JSON.stringify(linhaDelta));

    const linhaGama = res.body.find((r) => r.projeto_id === gama);
    assert.strictEqual(linhaGama.consumido, 12,
      `DEVOLUCAO_CLIENTE e SAIDA — deveria contar em consumido: ${JSON.stringify(linhaGama)}`);
    assert.strictEqual(linhaGama.devolvido, 0,
      `DEVOLUCAO_CLIENTE nao pode contar em devolvido (apesar do nome): ${JSON.stringify(linhaGama)}`);
  });

  await test('(3) projeto NAO cadastrado -> rotulo "Projeto #<id>"', async () => {
    const m6 = await novoMaterial(db, { custo_unitario: 10 });
    const projetoFantasma = 888888; // nunca inserido em `projetos`
    await movimento(db, m6, 'SAIDA', 1, projetoFantasma);

    const res = await relatorio(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linha = res.body.find((r) => r.projeto_id === projetoFantasma);
    assert.ok(linha, JSON.stringify(res.body));
    assert.strictEqual(linha.projeto_nome, 'Projeto #888888', JSON.stringify(linha));
  });

  await test('(4) data_inicio corta movimentacao antiga', async () => {
    const epsilon = await novoProjeto(db, 'Projeto Epsilon');
    const m7 = await novoMaterial(db, { custo_unitario: 2 });
    await movimento(db, m7, 'SAIDA', 5, epsilon, { createdAt: '2020-01-01 00:00:00' });

    const semFiltro = await relatorio(app);
    assert.strictEqual(semFiltro.status, 200, JSON.stringify(semFiltro.body));
    const antes = semFiltro.body.find((r) => r.projeto_id === epsilon);
    assert.ok(antes, 'sem filtro, o projeto Epsilon deveria aparecer');
    assert.strictEqual(antes.consumido, 10, JSON.stringify(antes));

    const comFiltro = await relatorio(app, '?data_inicio=2026-01-01');
    assert.strictEqual(comFiltro.status, 200, JSON.stringify(comFiltro.body));
    const depois = comFiltro.body.find((r) => r.projeto_id === epsilon);
    assert.strictEqual(depois, undefined,
      `data_inicio deveria cortar a movimentacao de 2020 e a linha do projeto sumir: ${JSON.stringify(comFiltro.body)}`);
  });

  await test('(5) gate gerenciar_reposicao: ALMOXARIFE 403 literal, COMPRAS 200, GESTOR 200', async () => {
    setUser(ALMOXARIFE);
    let res = await relatorio(app);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { error: 'Sem permissão para este relatório', acao: 'gerenciar_reposicao' });

    setUser(COMPRAS);
    res = await relatorio(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(GESTOR);
    res = await relatorio(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    setUser(ADMIN);
  });

  await test('(6) export: cabecalho xlsx bate EXATAMENTE com as colunas declaradas no registro', async () => {
    const zeta = await novoProjeto(db, 'Projeto Zeta');
    const m8 = await novoMaterial(db, { custo_unitario: 9 });
    await movimento(db, m8, 'SAIDA', 1, zeta);

    const exportRes = await getBinary(request(app).get('/api/almoxarifado/relatorios/custo-por-projeto/export'));
    assert.strictEqual(exportRes.status, 200, 'export deveria responder 200');
    assert.strictEqual(exportRes.headers['content-type'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', JSON.stringify(exportRes.headers));

    const wb = XLSX.read(exportRes.body, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const cabecalho = linhas[0];
    const rotulosDeclarados = RELATORIOS['custo-por-projeto'].colunas.map((c) => c.rotulo);
    assert.deepStrictEqual(cabecalho, rotulosDeclarados,
      `cabecalho (${JSON.stringify(cabecalho)}) deveria bater com os rotulos declarados`);
  });

  await test('(7) registro: nota usa o texto PRONTO da Fase 2 (custo ATUAL retroativo) e o gate NASCE fechado (D6)', async () => {
    const entrada = RELATORIOS['custo-por-projeto'];
    assert.strictEqual(entrada.acao, 'gerenciar_reposicao', JSON.stringify(entrada));
    assert.strictEqual(entrada.exportavel, true, JSON.stringify(entrada));
    assert.strictEqual(entrada.limite, null, JSON.stringify(entrada));
    assert.ok(entrada.nota && entrada.nota.includes('ATUAL'), entrada.nota);
    assert.ok(entrada.nota.includes('retroativo'), entrada.nota);
    assert.ok(entrada.nota.includes('DEVOLUCAO_CLIENTE'), entrada.nota);

    setUser(ADMIN);
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    const item = lista.body.relatorios.find((r) => r.tipo === 'custo-por-projeto');
    assert.ok(item, JSON.stringify(lista.body.relatorios.map((r) => r.tipo)));
    assert.ok(!('acao' in item), 'acao nao pode vazar na lista');
    assert.deepStrictEqual(item.params, entrada.params, JSON.stringify(item));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
