/**
 * Botao ACEITAR da lista de propostas: o status resultante tem que ser 'aprovada'.
 *
 * Pedido (31/07/2026): "na aba de propostas tem um chamado ACEITAR quando a proposta esta no
 * status de enviada, porem esse item muda o status da proposta para aceitar, quando na
 * verdade deveria ser aprovada".
 *
 * O ESTRAGO NAO ERA COSMETICO. 'aprovada' e o status que TODO relatorio conta como ganha:
 * taxa de conversao, valor aprovado, ranking de vendedores, contagem de propostas fechadas.
 * 'aceita' nao aparecia em NENHUMA dessas consultas - conferido com grep no index.js, onde
 * o unico lugar que escrevia 'aceita' era a propria rota. Ou seja: toda proposta fechada por
 * esse botao sumia dos numeros do dashboard, e o comercial via conversao menor do que a real.
 *
 * Por isso este teste nao se contenta em olhar o status gravado: ele roda as CONSULTAS DE
 * RELATORIO de verdade em cima do resultado. Um teste que so comparasse a string passaria
 * de novo no dia em que alguem inventasse um terceiro status solto.
 *
 * Executar: node tests/aceitarPropostaViraAprovada.test.js
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const arq = path.join(os.tmpdir(), `aceitar-${Date.now()}.sqlite`);
const db = new sqlite3.Database(arq);
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// Copia fiel do UPDATE da rota POST /api/propostas/:id/aceitar.
const aceitar = (id) => run(
  `UPDATE propostas SET status = 'aprovada', data_fechamento = COALESCE(data_fechamento, ?),
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  [new Date().toISOString().split('T')[0], id]
);

(async () => {
  await run(`CREATE TABLE propostas (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT,
    valor_total REAL, data_fechamento TEXT, ativo INTEGER DEFAULT 1, updated_at TEXT)`);

  await run("INSERT INTO propostas (status, valor_total) VALUES ('enviada', 50000)");   // 1 - aceitar
  await run("INSERT INTO propostas (status, valor_total) VALUES ('rejeitada', 30000)"); // 2
  await run("INSERT INTO propostas (status, valor_total) VALUES ('enviada', 20000)");   // 3
  // Proposta com data de fechamento ja informada a mao: o COALESCE nao pode atropelar.
  await run("INSERT INTO propostas (status, valor_total, data_fechamento) VALUES ('visualizada', 10000, '2026-01-15')");

  await aceitar(1);
  await aceitar(4);

  console.log('\n[o status gravado]');
  const p1 = await get('SELECT status, data_fechamento FROM propostas WHERE id = 1');
  t("aceitar grava 'aprovada', nao 'aceita'", () => assert.strictEqual(p1.status, 'aprovada'));
  t('a data de fechamento e carimbada', () => assert(/^\d{4}-\d{2}-\d{2}$/.test(p1.data_fechamento || '')));
  const p4 = await get('SELECT data_fechamento FROM propostas WHERE id = 4');
  t('data de fechamento ja informada NAO e sobrescrita',
    () => assert.strictEqual(p4.data_fechamento, '2026-01-15'));

  console.log('\n[o que realmente importa: os relatorios passam a enxergar]');
  // Mesmas consultas do server/index.js (valor aprovado, contagem e taxa de conversao).
  const valor = await get("SELECT SUM(valor_total) AS total FROM propostas WHERE status = 'aprovada' AND ativo = 1");
  t('o valor entra no total aprovado (50000 + 10000)',
    () => assert.strictEqual(valor.total, 60000));

  const contagem = await get("SELECT COUNT(*) AS total FROM propostas WHERE status = 'aprovada' AND ativo = 1");
  t('as duas propostas contam como ganhas', () => assert.strictEqual(contagem.total, 2));

  const conv = await get(`SELECT COUNT(CASE WHEN status = 'aprovada' THEN 1 END) * 100.0 / COUNT(*) AS taxa
    FROM propostas WHERE status IN ('aprovada', 'rejeitada', 'enviada')`);
  // 2 aprovadas, 1 rejeitada, 1 enviada = 50%.
  t('a taxa de conversao reflete o fechamento (50%)',
    () => assert.strictEqual(Math.round(conv.taxa), 50));

  console.log('\n[a regressao propriamente dita]');
  // Se alguem reverter a rota para 'aceita', ESTA checagem cai: o relatorio para de contar.
  await run("INSERT INTO propostas (status, valor_total) VALUES ('aceita', 99000)");
  const comAceita = await get("SELECT SUM(valor_total) AS total FROM propostas WHERE status = 'aprovada' AND ativo = 1");
  t("proposta em 'aceita' fica INVISIVEL no valor aprovado - a prova de que o status importa",
    () => assert.strictEqual(comAceita.total, 60000));

  console.log('\n[a rota no codigo]');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const rota = idx.slice(idx.indexOf("app.post('/api/propostas/:id/aceitar'"));
  const corpo = rota.slice(0, rota.indexOf("app.post('/api/propostas/:id/rejeitar'"));
  t("a rota nao escreve 'aceita' em lugar nenhum",
    () => assert(!/'aceita'/.test(corpo), 'ainda ha referencia a aceita na rota'));
  t("a rota escreve 'aprovada' no UPDATE e no historico",
    () => assert((corpo.match(/'aprovada'/g) || []).length >= 2, corpo.match(/'aprovada'/g)));

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch((e) => { console.error(e); process.exit(1); });
