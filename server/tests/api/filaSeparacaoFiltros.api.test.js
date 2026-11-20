/**
 * Etapa 255 (T1) — a fila de separacao devolve o que os filtros da tela precisam: o projeto da requisicao (RN-255.01) e o caminho da
 * origem separada de cada item (RN-255.02). So leitura; nada muda nos campos que ja existiam.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa255-fila-separacao-filtros.md
 *
 * O harness nao cria `projetos` nem `ordens_servico` (tabelas core). O primeiro bloco roda SEM elas: a fila tem de continuar
 * respondendo (projeto sem nome). Depois o teste as cria e prova a resolucao (requisicao, senao OS).
 *
 * Executar: cd server && node tests/api/filaSeparacaoFiltros.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOX = { id: 25501, nome: 'Almox 255', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const API = '/api/almoxarifado';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 255 (T1): a fila devolve o projeto e o caminho da origem ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);

  const almox = (await dbRun(db, "INSERT INTO almoxarifados (codigo, nome, ativo) VALUES ('ALM255', 'Almox 255', 1)")).lastID;
  const loc = async (codigo, parent = null) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado
      (codigo, descricao, ativo, almoxarifado_id, parent_id, tipo) VALUES (?, ?, 1, ?, ?, 'Prateleira')`,
  [codigo, codigo, almox, parent])).lastID;
  const PAI = await loc('Z255-A');
  const FILHO = await loc('Z255-A-01', PAI);

  const material = async (qtd = 10) => {
    const c = `E255-M${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
      VALUES (?, ?, 'UN', ?, 1)`, [c, `Mat ${c}`, qtd])).lastID;
  };
  const req = async (extra = {}) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia,
        created_at, ativo, setor, projeto_id, os_id) VALUES (?, 1, 'Sol', ?, 'NORMAL', ?, 1, ?, ?, ?)`,
    [`REQ-E255-${++seq}`, extra.status || 'APROVADO', `2026-09-01 10:00:${String(seq % 60).padStart(2, '0')}`, extra.setor || null,
      extra.projeto ?? null, extra.os ?? null])).lastID;
    const m = await material();
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida, origem_separacao_id) VALUES (?,?,?,?,0,0,?)`,
    [r, m, 2, extra.separado || 0, extra.origem || null])).lastID;
    return { id: r, item };
  };
  const fila = async (user = ADMIN) => {
    setUser(user);
    const r = await request(app).get(`${API}/fila-separacao`);
    setUser(ADMIN);
    assert.strictEqual(r.status, 200, `fila: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const daFila = (lista, id) => {
    const r = lista.find((x) => x.id === id);
    assert.ok(r, `requisicao ${id} fora da fila`);
    return r;
  };

  // ── Sem as tabelas core ────────────────────────────────────────────────────────────────────────────────────────────────
  const semTabelas = await req({ projeto: 31, os: 41 });
  await test('RN-255.01 sem `projetos`/`ordens_servico` (harness): a fila responde 200 e o projeto da requisicao vem sem nome', async () => {
    const r = daFila(await fila(ALMOX), semTabelas.id);
    assert.strictEqual(r.projeto_id, 31, `projeto_id: ${r.projeto_id}`);
    assert.strictEqual(r.projeto_nome, null, `projeto_nome: ${r.projeto_nome}`);
  });

  // ── Com as tabelas ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL,
    cliente_id INTEGER, projeto_id INTEGER, status TEXT DEFAULT 'pendente')`);
  const P1 = (await dbRun(db, "INSERT INTO projetos (nome) VALUES ('Ampliacao Linha 2')")).lastID;
  const P2 = (await dbRun(db, "INSERT INTO projetos (nome) VALUES ('Retrofit Forno')")).lastID;
  const OS_P2 = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, projeto_id) VALUES ('E255-OS1', ?)", [P2])).lastID;
  const OS_SEM = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, projeto_id) VALUES ('E255-OS2', NULL)")).lastID;

  const doProjeto = await req({ projeto: P1 });
  const daOs = await req({ os: OS_P2 });
  const osem = await req({ os: OS_SEM });
  const osInexistente = await req({ os: 987654 });
  const osDeOutro = await req({ projeto: P1, os: OS_P2 });
  const nenhum = await req({});
  const apagado = await req({ projeto: 99999 });
  const comOrigem = await req({ status: 'EM_SEPARACAO', separado: 2, origem: FILHO });

  await test('RN-255.01 projeto gravado na requisicao -> id e nome', async () => {
    const r = daFila(await fila(ALMOX), doProjeto.id);
    assert.deepStrictEqual([r.projeto_id, r.projeto_nome], [P1, 'Ampliacao Linha 2']);
  });
  await test('RN-255.01 sem projeto na requisicao -> o projeto da OS cadastrada', async () => {
    const r = daFila(await fila(ALMOX), daOs.id);
    assert.deepStrictEqual([r.projeto_id, r.projeto_nome], [P2, 'Retrofit Forno']);
  });
  await test('RN-255.01 projeto da requisicao vence o da OS', async () => {
    const r = daFila(await fila(ALMOX), osDeOutro.id);
    assert.deepStrictEqual([r.projeto_id, r.projeto_nome], [P1, 'Ampliacao Linha 2']);
  });
  await test('RN-255.01 nenhum (sem projeto, OS sem projeto, OS inexistente) -> null/null', async () => {
    const lista = await fila(ALMOX);
    for (const x of [nenhum, osem, osInexistente]) {
      const r = daFila(lista, x.id);
      assert.deepStrictEqual([r.projeto_id, r.projeto_nome], [null, null], `req ${x.id}`);
    }
  });
  await test('RN-255.01 projeto apagado -> id mantido, nome null', async () => {
    const r = daFila(await fila(ALMOX), apagado.id);
    assert.deepStrictEqual([r.projeto_id, r.projeto_nome], [99999, null]);
  });
  await test('RN-255.02 caminho da origem separada (com o pai e o almoxarifado); sem origem -> null', async () => {
    const lista = await fila(ALMOX);
    const it = daFila(lista, comOrigem.id).itens.find((i) => i.item_id === comOrigem.item);
    assert.ok(it, 'item com origem fora da fila');
    assert.strictEqual(it.origem_separacao_caminho, 'ALM255 / Z255-A / Z255-A-01');
    assert.strictEqual(it.origem_separacao_codigo, 'Z255-A-01', 'o campo de antes continua');
    const sem = daFila(lista, doProjeto.id).itens.find((i) => i.item_id === doProjeto.item);
    assert.ok(sem, 'item sem origem fora da fila');
    assert.strictEqual(sem.origem_separacao_caminho, null);
  });
  await test('Pelo SERVICO (listarFilaSeparacao): os mesmos campos; o recorte sugestao-coleta continua respondendo', async () => {
    const lista = await requisitionService.listarFilaSeparacao(db, ALMOX);
    const r = daFila(lista, daOs.id);
    assert.deepStrictEqual([r.projeto_id, r.projeto_nome], [P2, 'Retrofit Forno']);
    const it = daFila(lista, comOrigem.id).itens.find((i) => i.item_id === comOrigem.item);
    assert.strictEqual(it.origem_separacao_caminho, 'ALM255 / Z255-A / Z255-A-01');
    setUser(ALMOX);
    const s = await request(app).get(`${API}/requisicoes/${comOrigem.id}/sugestao-coleta`);
    setUser(ADMIN);
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
  });
  await test('Fase 2: `ordens_servico` e `projetos` sem a coluna lida (como em ~25 suites) -> 200; o projeto da OS e o nome somem', async () => {
    await dbRun(db, 'DROP TABLE projetos');
    await dbRun(db, 'CREATE TABLE projetos (id INTEGER PRIMARY KEY, outra TEXT)'); // sem `nome`
    await dbRun(db, 'DROP TABLE ordens_servico');
    await dbRun(db, 'CREATE TABLE ordens_servico (id INTEGER PRIMARY KEY, numero_os TEXT)'); // sem `projeto_id`
    await dbRun(db, 'INSERT INTO ordens_servico (id, numero_os) VALUES (?, ?)', [OS_P2, 'E255-OS1']);
    const lista = await fila(ALMOX);
    const a = daFila(lista, daOs.id); const b = daFila(lista, doProjeto.id);
    assert.deepStrictEqual([a.projeto_id, a.projeto_nome], [null, null], 'projeto da OS sem a coluna');
    assert.deepStrictEqual([b.projeto_id, b.projeto_nome], [P1, null], 'nome sem a coluna');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
