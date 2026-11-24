/**
 * Memória de tradução: a tradução AUTOMÁTICA que perdeu um termo fixo ("✓ Excel;" -> "✓ Sobresalir;", 24/11/2026) é apagada ao
 * subir o servidor e refeita pela tela; a correção manual nunca é apagada.
 *
 * Executar: node tests/traducoesTermoFixo.test.js
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { criarTabelaTraducoes, limparTraducoesSemTermoFixo } = require('../services/traducoes');

const db = new sqlite3.Database(':memory:');
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));

(async () => {
  let falhas = 0;
  const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };
  await new Promise((res, rej) => criarTabelaTraducoes(db, (e) => (e ? rej(e) : res())));
  const ins = (o, t, origem) => run('INSERT INTO traducoes (idioma, texto_origem, texto_traduzido, origem) VALUES (?, ?, ?, ?)', ['es', o, t, origem]);
  await ins('✓ Excel;', '✓ Sobresalir;', 'auto');               // perdeu o termo: apaga
  await ins('✓ PDF;', '✓PDF;', 'auto');                         // manteve (sem espaço, mas manteve): fica
  await ins('Excelência Operacional', 'Excelencia Operacional', 'auto'); // não é o termo: fica
  await ins('Planilha em Excel', 'Hoja de cálculo en Sobresalir', 'manual'); // manual: nunca apaga
  const n = await new Promise((res, rej) => limparTraducoesSemTermoFixo(db, (e, k) => (e ? rej(e) : res(k))));
  const ficaram = (await all('SELECT texto_origem FROM traducoes ORDER BY id')).map((r) => r.texto_origem);
  checar(n === 1, `apagou só a automática que perdeu o termo (${n})`);
  checar(JSON.stringify(ficaram) === JSON.stringify(['✓ PDF;', 'Excelência Operacional', 'Planilha em Excel']), `ficaram: ${ficaram.join(' | ')}`);
  const n2 = await new Promise((res, rej) => limparTraducoesSemTermoFixo(db, (e, k) => (e ? rej(e) : res(k))));
  checar(n2 === 0, 'rodar de novo não apaga mais nada');
  console.log(`\n${falhas} failed`);
  process.exit(falhas ? 1 : 0);
})();
