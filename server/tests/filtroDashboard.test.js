/**
 * Filtros do dashboard: periodo e usuario.
 *
 * Pedido (31/07/2026): "O botao filtro no dashboard nao funciona" e, na sequencia, "o botao
 * filtrar deve poder filtrar por usuario tmb". O botao existia no cabecalho desde sempre,
 * mas sem onClick - nao havia estado, nem painel, nem parametro chegando na API.
 *
 * POR QUE ESTE TESTE PESA A MAO NA VALIDACAO: as consultas do dashboard sao montadas por
 * template literal e todas passam [] fixo como parametro, entao o filtro entra INLINE no
 * SQL. A escolha e defensavel - costurar parametros em uma duzia de call sites seria mais
 * arriscado - mas so se a validacao segurar. Se ela vazar, vira injecao de SQL num endpoint
 * autenticado. Por isso metade das checagens e entrada malformada, e no fim um payload de
 * injecao real roda contra um banco de verdade para confirmar que a tabela continua de pe.
 *
 * Executar: node tests/filtroDashboard.test.js
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sqlite3 = require('sqlite3');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

/**
 * A FUNCAO DE VERDADE, extraida do index.js - nao uma copia.
 *
 * A primeira versao deste teste trazia uma copia da funcao, escrita a mao. A copia estava
 * certa e passou em 26 checagens; o codigo que rodava estava QUEBRADO. As contrabarras dos
 * regex tinham sido comidas na geracao do arquivo (/^\d{4}/ virou /^d{4}/, que casa a letra
 * "d"), entao nenhum valor passava na validacao e o filtro saia sempre vazio. O teste verde
 * escondeu isso ate o usuario reclamar que o filtro nao funcionava.
 *
 * Nao da para require('../index.js'): o modulo sobe o servidor inteiro. Entao recortamos o
 * texto da funcao e avaliamos - assim qualquer estrago no arquivo real reprova aqui.
 */
function carregarFuncaoReal() {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const inicio = fonte.indexOf('function filtroDashboardSql(req, alias) {');
  if (inicio < 0) throw new Error('filtroDashboardSql nao encontrada no index.js');
  const fim = fonte.indexOf('\n}\n', inicio);
  if (fim < 0) throw new Error('fim da funcao nao encontrado');
  const corpo = fonte.slice(inicio, fim + 2);
  // eslint-disable-next-line no-new-func
  return new Function(corpo + '\nreturn filtroDashboardSql;')();
}
const filtroDashboardSql = carregarFuncaoReal();
const req = (query) => ({ query });

console.log('\n[o filtro se monta]');
t('sem nada preenchido, nao filtra nada',
  () => assert.strictEqual(filtroDashboardSql(req({}), 'p'), ''));
t('so inicio', () => assert.strictEqual(
  filtroDashboardSql(req({ inicio: '2026-01-01' }), 'p'),
  " AND date(p.created_at) >= '2026-01-01'"));
t('periodo completo + usuario', () => assert.strictEqual(
  filtroDashboardSql(req({ inicio: '2026-01-01', fim: '2026-03-31', usuario: '7' }), 'p'),
  " AND date(p.created_at) >= '2026-01-01' AND date(p.created_at) <= '2026-03-31'"
  + ' AND p.responsavel_id = 7'));
t('sem alias, sem prefixo de tabela', () => assert.strictEqual(
  filtroDashboardSql(req({ usuario: '3' })), ' AND responsavel_id = 3'));

console.log('\n[entrada malformada e DESCARTADA, nao repassada]');
[
  ['data pela metade', { inicio: '2026-01' }],
  ['data em outro formato', { inicio: '01/01/2026' }],
  ['texto no lugar da data', { fim: 'ontem' }],
  ['usuario nao numerico', { usuario: 'admin' }],
  ['usuario negativo', { usuario: '-1' }],
  ['usuario decimal', { usuario: '1.5' }],
  ['valores vazios', { inicio: '', fim: '', usuario: '' }],
  ['null', { inicio: null, usuario: null }],
  ['array (query string repetida)', { usuario: ['1', '2'] }],
].forEach(([nome, q]) => t(nome + ' -> filtro vazio',
  () => assert.strictEqual(filtroDashboardSql(req(q), 'p'), '')));

console.log('\n[injecao de SQL]');
[
  "2026-01-01'; DROP TABLE propostas; --",
  '1 OR 1=1',
  '1; DELETE FROM propostas',
  "' UNION SELECT senha FROM usuarios --",
].forEach((payload) => {
  t('payload rejeitado: ' + payload.slice(0, 30),
    () => assert.strictEqual(
      filtroDashboardSql(req({ inicio: payload, usuario: payload }), 'p'), ''));
});

// Nao basta o filtro sair vazio na string: rodar de verdade e a unica prova de que nada
// escapou. Banco real, payload real.
const arq = path.join(os.tmpdir(), `filtro-${Date.now()}.sqlite`);
const db = new sqlite3.Database(arq);
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

(async () => {
  await run(`CREATE TABLE propostas (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT,
    valor_total REAL, responsavel_id INTEGER, created_at TEXT, ativo INTEGER DEFAULT 1)`);
  const add = (valor, resp, data) => run(
    "INSERT INTO propostas (status, valor_total, responsavel_id, created_at) VALUES ('aprovada', ?, ?, ?)",
    [valor, resp, data]);
  await add(1000, 1, '2026-01-15 10:00:00');
  await add(2000, 1, '2026-02-20 10:00:00');
  await add(4000, 2, '2026-02-25 10:00:00');
  await add(8000, 2, '2025-12-31 10:00:00');

  const somar = (q) => get(
    `SELECT COALESCE(SUM(valor_total), 0) AS total FROM propostas
      WHERE status = 'aprovada' AND (ativo IS NULL OR ativo = 1)${filtroDashboardSql(req(q), null)}`);

  console.log('\n[o filtro recorta de verdade]');
  const tudo = await somar({});
  t('sem filtro soma tudo (15000)', () => assert.strictEqual(tudo.total, 15000));

  const fev = await somar({ inicio: '2026-02-01', fim: '2026-02-28' });
  t('so fevereiro/2026 (2000 + 4000)', () => assert.strictEqual(fev.total, 6000));

  const user1 = await somar({ usuario: '1' });
  t('so o responsavel 1 (1000 + 2000)', () => assert.strictEqual(user1.total, 3000));

  const combinado = await somar({ inicio: '2026-02-01', fim: '2026-02-28', usuario: '2' });
  t('fevereiro E responsavel 2 (4000)', () => assert.strictEqual(combinado.total, 4000));

  const ano = await somar({ inicio: '2026-01-01' });
  t('de 2026 em diante exclui a de dezembro (7000)', () => assert.strictEqual(ano.total, 7000));

  console.log('\n[injecao contra o banco de verdade]');
  const atacado = await somar({ inicio: "2026-01-01'; DROP TABLE propostas; --", usuario: '1 OR 1=1' });
  t('payload nao filtra nem quebra: a soma volta cheia',
    () => assert.strictEqual(atacado.total, 15000));
  const viva = await get("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='propostas'");
  t('a tabela propostas continua existindo', () => assert.strictEqual(viva.n, 1));

  console.log('\n[o servidor usa mesmo o helper]');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  t('o helper existe', () => assert(idx.includes('function filtroDashboardSql')));
  t('esta aplicado em varias consultas do dashboard', () => {
    const n = (idx.match(/filtroDashboardSql\(req/g) || []).length;
    assert(n >= 10, 'aplicacoes encontradas: ' + n);
  });

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch((e) => { console.error(e); process.exit(1); });
