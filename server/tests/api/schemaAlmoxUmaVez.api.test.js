/**
 * Etapa 107 (G16) — RN-107.01..04: o schema do almoxarifado roda UMA vez por conexao ao mesmo tempo.
 *
 * O defeito que este arquivo guarda: no boot, `routes/almoxarifado.js` dispara `initSchema(db)` sem
 * `await` e a extended (`runInitSchemaWithRetry`) dispara OUTRA logo depois. As duas compartilham a
 * conexao e intercalam comando a comando; todo seed do schema e "conta e, se for zero, insere", entao as
 * duas veem zero e semeiam. Onde a tabela tem UNIQUE (familias.codigo, setores.nome) a perdedora cai e a
 * 2a tentativa da extended acerta; onde NAO tem — categorias — as duas entram: 27 categorias em dobro, e
 * o `CREATE UNIQUE INDEX idx_categorias_almox_nome` (Etapa 26) falha para sempre. Medido na Fase 0 da 107:
 * 6 de 14 boots em pasta nova.
 *
 * Os cenarios usam banco em ARQUIVO novo (temporario), como o boot — nao o `:memory:` do harness, que ja
 * chega com o schema pronto (`createTestApp` faz `await initSchema` antes de registrar as rotas e por isso
 * nunca viu a corrida).
 *
 * Executar: cd server && node tests/api/run-all.js tests/api/schemaAlmoxUmaVez.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const express = require('express');
const schemaMod = require('../../services/almoxarifado/schema');
const { dbGet, dbAll } = require('../../services/almoxarifado/db');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-almoxarifado';

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e107-schema-'));
let nArq = 0;
function bancoNovo() {
  const arq = path.join(tmpRoot, `db${++nArq}.sqlite`);
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(arq, (err) => (err ? reject(err) : resolve(db)));
  });
}
const fechar = (db) => new Promise((r) => db.close(() => r()));

// Captura o que o schema e a extended logam: o aviso do indice e o "Erro schema ... tentativa" sao a
// assinatura da corrida no log do boot.
function capturarConsole() {
  const linhas = [];
  const orig = { warn: console.warn, error: console.error, log: console.log };
  console.warn = (...a) => linhas.push(['warn', a.join(' ')]);
  console.error = (...a) => linhas.push(['error', a.join(' ')]);
  console.log = (...a) => linhas.push(['log', a.join(' ')]);
  return {
    linhas,
    restaurar() { Object.assign(console, orig); },
    problemas: () => linhas.filter(([k, t]) => k !== 'log' || /UNIQUE|tentativa|Nao foi possivel/.test(t)).map(([, t]) => t),
  };
}

async function contagens(db) {
  const par = async (tabela, chave) => {
    const r = await dbGet(db, `SELECT COUNT(*) AS total, COUNT(DISTINCT ${chave}) AS distintos FROM ${tabela}`);
    return `${r.total}/${r.distintos}`;
  };
  return {
    categorias: await par('categorias_material_almoxarifado', 'nome'),
    familias: await par('familias_material_almoxarifado', 'codigo'),
    unidades: await par('unidades_medida_almoxarifado', 'sigla'),
    tipos: await par('tipos_material_almoxarifado', 'nome'),
    localizacoes: await par('localizacoes_almoxarifado', 'codigo'),
    setores: await par('setores_almoxarifado', 'nome'),
    almoxarifados: await par('almoxarifados', 'codigo'),
  };
}
const ESPERADO = {
  categorias: '27/27', familias: '3/3', unidades: '12/12', tipos: '8/8',
  localizacoes: '8/8', setores: '8/8', almoxarifados: '1/1',
};
async function indiceCategorias(db) {
  const r = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_categorias_almox_nome'`);
  return r.length === 1;
}

(async () => {
  await test('RN-107.01 duas chamadas simultaneas em banco novo: uma execucao, seed uma vez, indice criado', async () => {
    const db = await bancoNovo();
    const cap = capturarConsole();
    let p1; let p2; let resultados;
    try {
      p1 = schemaMod.initSchema(db);
      p2 = schemaMod.initSchema(db);
      // allSettled (revisao da Fase 2): com Promise.all o codigo antigo caia pela rejeicao da perdedora
      // ANTES de chegar as contagens, e o controle nao mostrava o 54/27 — que e o dano real.
      resultados = await Promise.allSettled([p1, p2]);
    } finally { cap.restaurar(); }
    assert.deepStrictEqual(await contagens(db), ESPERADO, 'o seed entrou mais de uma vez (ou faltou)');
    assert.deepStrictEqual(resultados.map((r) => r.status), ['fulfilled', 'fulfilled'],
      `uma das chamadas falhou: ${resultados.map((r) => r.reason && r.reason.message).join(' | ')}`);
    assert.strictEqual(await indiceCategorias(db), true, 'idx_categorias_almox_nome nao foi criado');
    assert.deepStrictEqual(cap.problemas(), [], 'o schema logou erro/aviso de corrida');
    assert.strictEqual(p1, p2, 'a segunda chamada em voo nao recebeu a mesma execucao');
    await fechar(db);
  });

  await test('RN-107.02 chamada depois de terminada roda de novo e nao muda o banco existente', async () => {
    const db = await bancoNovo();
    const p1 = schemaMod.initSchema(db);
    await p1;
    const antes = await contagens(db);
    const cap = capturarConsole();
    let p2;
    try {
      p2 = schemaMod.initSchema(db);
      await p2;
    } finally { cap.restaurar(); }
    assert.notStrictEqual(p2, p1, 'a vaga nao foi solta: a chamada seguinte devolveu a execucao antiga');
    assert.deepStrictEqual(await contagens(db), antes, 'o segundo initSchema mudou contagens do banco existente');
    assert.deepStrictEqual(antes, ESPERADO);
    assert.deepStrictEqual(cap.problemas(), [], 'o segundo initSchema logou erro/aviso');
    await fechar(db);
  });

  await test('RN-107.03 execucao que falha nao fica guardada: as caronas veem o erro, a proxima roda nova e completa', async () => {
    const real = await bancoNovo();
    let falhar = true;
    // Proxy da conexao: o primeiro CREATE de setores falha uma vez (como uma falha transitoria no boot).
    const db = new Proxy(real, {
      get(t, k) {
        if (k === 'run') {
          return (sql, ...rest) => {
            if (falhar && /CREATE TABLE IF NOT EXISTS setores_almoxarifado/.test(sql)) {
              falhar = false;
              const cb = rest.find((x) => typeof x === 'function');
              setImmediate(() => cb.call({}, new Error('falha transitoria simulada')));
              return t;
            }
            return t.run(sql, ...rest);
          };
        }
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const cap = capturarConsole();
    let r1; let r2;
    try {
      r1 = schemaMod.initSchema(db).then(() => 'ok', (e) => e.message);
      r2 = schemaMod.initSchema(db).then(() => 'ok', (e) => e.message);
      [r1, r2] = await Promise.all([r1, r2]);
    } finally { cap.restaurar(); }
    assert.strictEqual(r1, 'falha transitoria simulada', `a 1a chamada nao viu a falha: ${r1}`);
    assert.strictEqual(r2, 'falha transitoria simulada', `a carona nao viu a mesma falha: ${r2}`);
    await schemaMod.initSchema(db); // nova execucao — tem de completar
    assert.deepStrictEqual(await contagens(real), ESPERADO, 'a execucao nova depois da falha nao completou o banco');
    assert.strictEqual(await indiceCategorias(real), true);
    await fechar(real);
  });

  await test('RN-107.04 (fiacao do boot) registrar o almoxarifado em banco novo: uma execucao, log limpo, banco completo', async () => {
    const db = await bancoNovo();
    const dataDir = fs.mkdtempSync(path.join(tmpRoot, 'data-'));
    // Conta as execucoes REAIS: cada chamada passa por aqui; promises distintas = execucoes distintas.
    // Tem de ser trocado ANTES de requerer as rotas: a extended desestrutura o `initSchema` no require.
    const orig = schemaMod.initSchema;
    const promessas = [];
    schemaMod.initSchema = (d) => { const p = orig(d); promessas.push(p); return p; };
    const cap = capturarConsole();
    try {
      const router = express.Router();
      const fakeAuth = (req, res, next) => next();
      const fakeCheck = () => (req, res, next) => next();
      require('../../routes/almoxarifado')(router, db, fakeAuth, dataDir, fakeCheck);
      // Espera a extended registrar e TODAS as execucoes (inclusive retries de 400/800 ms) assentarem.
      const t0 = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, 200));
        const registrou = cap.linhas.some(([, t]) => /Módulo Almoxarifado registrado/.test(t));
        const n = promessas.length;
        await Promise.allSettled(promessas);
        await new Promise((r) => setTimeout(r, 1500));
        if (registrou && promessas.length === n) break;
        if (Date.now() - t0 > 30000) throw new Error('o registro nao assentou em 30 s');
      }
    } finally { cap.restaurar(); schemaMod.initSchema = orig; }
    const distintas = new Set(promessas).size;
    assert.ok(promessas.length >= 2, `o boot deveria chamar initSchema duas vezes (direta + extended): ${promessas.length}`);
    assert.strictEqual(distintas, 1, `${distintas} execucoes do schema no boot (esperado 1)`);
    assert.deepStrictEqual(cap.problemas().filter((t) => /schema|UNIQUE|idx_|tentativa/i.test(t)), [],
      'o boot logou erro de schema');
    assert.deepStrictEqual(await contagens(db), ESPERADO, 'banco do boot incompleto ou com seed duplicado');
    assert.strictEqual(await indiceCategorias(db), true, 'idx_categorias_almox_nome nao foi criado no boot');
    await fechar(db);
  });

  // Fase 5 da 107 (achado 2): "por conexao" nao estava preso — uma chave global (single-flight para TODAS as
  // conexoes) passava os quatro cenarios acima. Duas conexoes ao mesmo tempo: duas execucoes, dois bancos completos.
  await test('RN-107.01 duas CONEXOES diferentes ao mesmo tempo: uma execucao para cada, os dois bancos completos', async () => {
    const a = await bancoNovo();
    const b = await bancoNovo();
    const cap = capturarConsole();
    let pa; let pb;
    try {
      pa = schemaMod.initSchema(a);
      pb = schemaMod.initSchema(b);
      await Promise.all([pa, pb]);
    } finally { cap.restaurar(); }
    assert.notStrictEqual(pa, pb, 'a segunda conexao pegou carona na execucao da primeira');
    assert.deepStrictEqual(await contagens(a), ESPERADO, 'banco A incompleto');
    assert.deepStrictEqual(await contagens(b), ESPERADO, 'banco B incompleto (nao rodou o proprio schema)');
    assert.strictEqual(await indiceCategorias(b), true);
    await fechar(a); await fechar(b);
  });

  // Fase 5 da 107 (achado 1): o harness devolvia o app com a execucao de fundo (registrador + extended) ainda
  // em voo; um teste de migracao que mexesse no schema logo no comeco e chamasse initSchema pegava carona nela
  // e a migracao nao era reaplicada. createTestApp agora espera a execucao de fundo assentar.
  await test('(harness) logo depois de createTestApp nao ha execucao em voo: DROP COLUMN + initSchema recria a coluna', async () => {
    const { createTestApp } = require('../helpers/testApp');
    const { dbRun } = require('../../services/almoxarifado/db');
    const cap = capturarConsole();
    let app;
    try {
      app = await createTestApp({ user: { id: 1, nome: 'x', role: 'admin', is_superadmin: 1 } });
      // A prova deterministica: nada em voo quando o app volta (o DROP abaixo e a consequencia, mas depende de
      // onde a execucao de fundo estaria — sozinho ele passava verde no codigo sem a correcao).
      assert.strictEqual(schemaMod.initSchemaEmVoo(app.db), null, 'createTestApp devolveu o app com o initSchema de fundo em voo');
      await dbRun(app.db, 'ALTER TABLE materiais_almoxarifado DROP COLUMN ponto_pedido');
      await schemaMod.initSchema(app.db);
    } finally { cap.restaurar(); }
    const cols = await dbAll(app.db, 'PRAGMA table_info(materiais_almoxarifado)');
    assert.ok(cols.some((c) => c.name === 'ponto_pedido'),
      'a coluna nao voltou: o initSchema pegou carona numa execucao de fundo que ja tinha passado do ALTER');
    if (app.close) await app.close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) { /* Windows segura o arquivo as vezes */ }
  process.exit(failed ? 1 : 0);
})();
