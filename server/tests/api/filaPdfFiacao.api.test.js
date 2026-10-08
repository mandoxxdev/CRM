/**
 * Etapa 80 / T1 — fiacao da fila do Chromium no `server/index.js` (B32).
 *
 * Teste de TEXTO, nao de comportamento: `server/index.js` tem 23 mil linhas, abre banco em disco e
 * faz `listen` no import; nao ha harness de core (mesmo precedente de
 * propostaPdfExigeLogin.api.test.js). O comportamento da fila em si e testado em
 * filaPdf.api.test.js; a corrida real (antes/depois) foi provada com o servidor de pe (plano da
 * Etapa 80, linha "> Estado").
 *
 * Regua (RN-80.01/03/06): toda CHAMADA de `obterNavegadorPdf(` e `fecharNavegadorPdf(` no
 * index.js (fora as definicoes) esta dentro de um bloco `enfileirarPdf( ... )` — ou dentro do
 * corpo do proprio `obterNavegadorPdf` (a reciclagem), que so e chamado de dentro da fila.
 * Chamar fora da fila (ex.: o catch externo da rota da proposta voltar a fechar o navegador, ou o
 * temporizador de ociosidade fechar direto) derruba o teste.
 *
 * Limite conhecido do scanner: pula strings, template literals e comentarios ao casar parenteses,
 * mas NAO entende regex literal. Os blocos da fila hoje nao tem regex literal; se um dia tiverem
 * e o casamento errar, o teste falha (bloco desbalanceado) em vez de passar calado.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const fonte = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');

/** Indice do fechamento que casa com o abridor em `ini` (`(` ou `{`), pulando strings/comentarios. */
function fechamento(src, ini) {
  const abre = src[ini]; const fecha = abre === '(' ? ')' : '}';
  let prof = 0;
  for (let i = ini; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === abre) prof++;
    else if (c === fecha) { prof--; if (prof === 0) return i; }
  }
  throw new Error(`bloco aberto em ${ini} nao fecha`);
}

const linhaDe = (src, idx) => src.slice(0, idx).split('\n').length;

/** Linha de comentario (`//`, ` * ` de JSDoc) ou depois de `//` na mesma linha. */
function emComentario(src, idx) {
  const antes = src.slice(src.lastIndexOf('\n', idx) + 1, idx);
  return /^\s*(\/\/|\*|\/\*)/.test(antes) || antes.includes('//');
}

/** Analisa a fiacao; devolve { blocos, chamadas: [{nome, linha, ok, onde}] }. */
function analisar(src) {
  const blocos = [];
  const reFila = /enfileirarPdf\(/g; let m;
  while ((m = reFila.exec(src))) {
    if (src.slice(Math.max(0, m.index - 9), m.index) === 'function ') continue; // a definicao
    if (emComentario(src, m.index)) continue;
    const ini = m.index + 'enfileirarPdf'.length;
    blocos.push([ini, fechamento(src, ini)]);
  }
  const defObter = src.indexOf('async function obterNavegadorPdf(');
  const corpoObter = defObter >= 0
    ? [src.indexOf('{', defObter), fechamento(src, src.indexOf('{', defObter))] : [-1, -1];
  const chamadas = [];
  const reCall = /\b(obterNavegadorPdf|fecharNavegadorPdf)\(/g;
  while ((m = reCall.exec(src))) {
    if (emComentario(src, m.index)) continue;
    const antes = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
    if (/function\s+$/.test(antes)) continue; // definicao
    const naFila = blocos.some(([a, b]) => m.index > a && m.index < b);
    const noObter = m.index > corpoObter[0] && m.index < corpoObter[1];
    chamadas.push({ nome: m[1], linha: linhaDe(src, m.index), ok: naFila || noObter,
      onde: naFila ? 'fila' : (noObter ? 'obterNavegadorPdf' : 'FORA'), idx: m.index });
  }
  return { blocos, chamadas, corpoObter };
}

const { blocos, chamadas, corpoObter } = analisar(fonte);

test('controle: o analisador acusa uma chamada fora da fila (fonte sintetica)', () => {
  const sint = [
    'function enfileirarPdf(t) { return t(); }',
    'async function obterNavegadorPdf() { await fecharNavegadorPdf("reciclagem"); }',
    'async function a() { await enfileirarPdf(async () => { await obterNavegadorPdf(); }); }',
    'async function b() { try { await enfileirarPdf(() => x(")")); } catch (e) { await fecharNavegadorPdf("erro"); } }',
  ].join('\n');
  const r = analisar(sint);
  assert.strictEqual(r.blocos.length, 2);
  const fora = r.chamadas.filter((c) => !c.ok);
  assert.strictEqual(fora.length, 1, JSON.stringify(r.chamadas));
  assert.strictEqual(fora[0].linha, 4);
});

test('acha os 3 blocos da fila (ocioso, gerarPdfDeHtml, rota da proposta)', () => {
  assert.strictEqual(blocos.length, 3, `blocos enfileirarPdf( = ${blocos.length}`);
});

test('obterNavegadorPdf e chamado 2x (proposta + gerarPdfDeHtml), as duas dentro da fila', () => {
  const obter = chamadas.filter((c) => c.nome === 'obterNavegadorPdf');
  assert.strictEqual(obter.length, 2, JSON.stringify(obter));
  obter.forEach((c) => assert.strictEqual(c.onde, 'fila', `obterNavegadorPdf fora da fila na linha ${c.linha}`));
});

test('fecharNavegadorPdf e chamado 4x e nenhuma fora da fila (reciclagem, ocioso, 2 erros)', () => {
  const fechar = chamadas.filter((c) => c.nome === 'fecharNavegadorPdf');
  assert.strictEqual(fechar.length, 4, JSON.stringify(fechar));
  const fora = fechar.filter((c) => !c.ok);
  assert.deepStrictEqual(fora.map((c) => c.linha), [],
    'fecharNavegadorPdf fora da fila — fecha o navegador de quem esta gerando (B32)');
  assert.strictEqual(fechar.filter((c) => c.onde === 'obterNavegadorPdf').length, 1,
    'so a reciclagem pode estar no corpo de obterNavegadorPdf');
});

test("RN-80.06: o fechamento 'ocioso' passa pela fila", () => {
  const i = fonte.indexOf("fecharNavegadorPdf('ocioso')");
  assert.ok(i > 0, "fecharNavegadorPdf('ocioso') sumiu");
  assert.ok(blocos.some(([a, b]) => i > a && i < b), "o fechamento por ociosidade esta fora da fila");
});

test('RN-80.06: toda tarefa da fila comeca cancelando o temporizador de ociosidade', () => {
  const def = fonte.indexOf('function enfileirarPdf(');
  assert.ok(def > 0, 'function enfileirarPdf( sumiu');
  const corpo = fonte.slice(def, fechamento(fonte, fonte.indexOf('{', def)));
  const iClear = corpo.indexOf('clearTimeout(timerOciosoPdf)');
  const iTarefa = corpo.indexOf('tarefa()');
  assert.ok(iClear > 0 && iTarefa > iClear, 'clearTimeout(timerOciosoPdf) tem de vir antes de rodar a tarefa');
});

test('RN-80.07: obterNavegadorPdf lanca com protocolTimeout: 60000', () => {
  assert.ok(fonte.slice(corpoObter[0], corpoObter[1]).includes('protocolTimeout: 60000'));
});

test('rota da proposta: snapshot e resposta HTTP ficam FORA da fila; espera medida em fila=', () => {
  const dentro = (txt) => { const i = fonte.indexOf(txt); assert.ok(i > 0, `${txt} sumiu`); return blocos.some(([a, b]) => i > a && i < b); };
  assert.strictEqual(dentro('res.end(pdfBuffer)'), false, 'a resposta HTTP nao pode segurar a fila');
  assert.strictEqual(dentro('INSERT INTO proposta_snapshot'), false, 'o snapshot nao pode segurar a fila');
  assert.strictEqual(dentro('fila=${Date.now() - tEnfileirou}ms'), true, 'a marca fila= tem de ser medida no inicio da tarefa');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
