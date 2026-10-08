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
  // Revisao da Etapa 80 (P3): `//` dentro de string ('http://x') nao e comentario — sem tirar as
  // strings antes, `const u = 'http://x'; await fecharNavegadorPdf()` era pulada calada.
  const semStrings = antes.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
  return /^\s*(\/\/|\*|\/\*)/.test(antes) || semStrings.includes('//');
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

// Etapa 87 (B35): a rota do PDF da OS entrou na fila — eram 3 blocos, 2 obter, 4 fechar.
test('acha os 4 blocos da fila (ocioso, gerarPdfDeHtml, rota da proposta, rota da OS)', () => {
  assert.strictEqual(blocos.length, 4, `blocos enfileirarPdf( = ${blocos.length}`);
});

test('obterNavegadorPdf e chamado 3x (proposta + gerarPdfDeHtml + OS), todas dentro da fila', () => {
  const obter = chamadas.filter((c) => c.nome === 'obterNavegadorPdf');
  assert.strictEqual(obter.length, 3, JSON.stringify(obter));
  obter.forEach((c) => assert.strictEqual(c.onde, 'fila', `obterNavegadorPdf fora da fila na linha ${c.linha}`));
});

test('fecharNavegadorPdf e chamado 5x e nenhuma fora da fila (reciclagem, ocioso, 3 erros)', () => {
  const fechar = chamadas.filter((c) => c.nome === 'fecharNavegadorPdf');
  assert.strictEqual(fechar.length, 5, JSON.stringify(fechar));
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

// Revisao da Etapa 80 (F1): sem este teste, trocar o corpo de enfileirarPdf por
// `clearTimeout(...); return tarefa();` (sem fila nenhuma) deixava a suite inteira verde.
test('RN-80.01: enfileirarPdf passa DE FATO pela fila serial de services/filaPdf', () => {
  assert.ok(/const \{ criarFilaSerial \} = require\('\.\/services\/filaPdf'\)/.test(fonte),
    'index.js parou de importar criarFilaSerial de services/filaPdf');
  assert.ok(/const filaPdfSerial = criarFilaSerial\(\);/.test(fonte), 'filaPdfSerial nao e mais uma criarFilaSerial()');
  const def = fonte.indexOf('function enfileirarPdf(');
  const corpo = fonte.slice(def, fechamento(fonte, fonte.indexOf('{', def)));
  assert.ok(/return filaPdfSerial\(/.test(corpo), 'enfileirarPdf nao devolve filaPdfSerial(...) — a tarefa roda fora da fila');
  const iFila = corpo.indexOf('filaPdfSerial(');
  assert.ok(corpo.indexOf('tarefa()') > iFila, 'tarefa() tem de rodar DENTRO do filaPdfSerial(...)');
});

// Revisao da Etapa 80 (F2): fechar o navegador por outro caminho que nao fecharNavegadorPdf, ou
// tirar page.pdf/agendarFechamentoOcioso da tarefa, passava pelo scanner das duas funcoes.
test('RN-80.03: ninguem fecha o navegadorPdf direto; page.pdf e agendarFechamentoOcioso so dentro da fila', () => {
  assert.ok(!/navegadorPdf\s*(\?\.|\.)\s*close\s*\(/.test(fonte), 'navegadorPdf.close() direto — use fecharNavegadorPdf dentro da fila');
  assert.ok(!/navegadorPdf\s*&&\s*navegadorPdf\.close/.test(fonte), 'navegadorPdf && navegadorPdf.close() direto');
  const naFila = (re) => {
    const out = []; let m; const r = new RegExp(re, 'g');
    while ((m = r.exec(fonte))) {
      if (emComentario(fonte, m.index)) continue;
      const antes = fonte.slice(fonte.lastIndexOf('\n', m.index) + 1, m.index);
      if (/function\s+$/.test(antes)) continue;
      out.push({ linha: linhaDe(fonte, m.index), ok: blocos.some(([a, b]) => m.index > a && m.index < b) });
    }
    return out;
  };
  const agendar = naFila('\\bagendarFechamentoOcioso\\(');
  assert.strictEqual(agendar.length, 3, JSON.stringify(agendar));
  assert.deepStrictEqual(agendar.filter((c) => !c.ok).map((c) => c.linha), [], 'agendarFechamentoOcioso fora da fila');
  // 3 page.pdf no arquivo (proposta, gerarPdfDeHtml, rota da OS) e os 3 dentro da fila. Ate a
  // Etapa 87 a OS tinha Chromium proprio e ficava fora (B35).
  const pdfs = naFila('\\bpage\\.pdf\\(');
  assert.strictEqual(pdfs.length, 3, JSON.stringify(pdfs));
  assert.deepStrictEqual(pdfs.filter((c) => !c.ok).map((c) => c.linha), [], 'page.pdf fora da fila');
});

// Etapa 87 (RN-87.01): o unico Chromium do servidor e o de obterNavegadorPdf. Sem este teste, uma
// rota nova (ou a OS de volta) podia abrir navegador proprio e fechar com browser.close() sem
// passar por nenhuma das reguas acima.
test('RN-87.01: um unico puppeteer.launch( no arquivo, dentro de obterNavegadorPdf; nenhum browser.close(', () => {
  const launches = []; let m; const r = /\bpuppeteer\.launch\(/g;
  while ((m = r.exec(fonte))) { if (!emComentario(fonte, m.index)) launches.push(m.index); }
  assert.strictEqual(launches.length, 1, `puppeteer.launch( = ${launches.length} (linhas ${launches.map((i) => linhaDe(fonte, i)).join(', ')})`);
  assert.ok(launches[0] > corpoObter[0] && launches[0] < corpoObter[1], 'puppeteer.launch( fora de obterNavegadorPdf');
  const fechaDireto = []; const rc = /\bbrowser\.close\(/g;
  while ((m = rc.exec(fonte))) { if (!emComentario(fonte, m.index)) fechaDireto.push(linhaDe(fonte, m.index)); }
  assert.deepStrictEqual(fechaDireto, [], 'browser.close( fecha o navegador compartilhado por fora de fecharNavegadorPdf');
});

// Etapa 87 (RN-87.01/02/03): a rota da OS tem UM bloco na fila com o navegador, o page.pdf e o
// fechamento por erro; arquivo, UPDATE e resposta ficam DEPOIS (fora), para nao segurar a fila
// com disco e banco. O contrato de erro (500 'Erro ao gerar PDF') continua na rota.
test('rota da OS: navegador e page.pdf na fila; arquivo, UPDATE pdf_url e resposta fora; fila= medida', () => {
  const ini = fonte.indexOf("app.post('/api/operacional/ordens-servico/:id/gerar-pdf'");
  assert.ok(ini > 0, 'rota gerar-pdf da OS sumiu');
  const fim = fechamento(fonte, ini + 'app.post'.length);
  const rota = [ini, fim];
  const blocosRota = blocos.filter(([a, b]) => a > rota[0] && b < rota[1]);
  assert.strictEqual(blocosRota.length, 1, `blocos enfileirarPdf( na rota da OS = ${blocosRota.length}`);
  const [a, b] = blocosRota[0];
  const posicoes = (txt) => {
    const out = []; let i = fonte.indexOf(txt, rota[0]);
    while (i > 0 && i < rota[1]) { if (!emComentario(fonte, i)) out.push(i); i = fonte.indexOf(txt, i + 1); }
    assert.ok(out.length > 0, `${txt} sumiu da rota da OS`);
    return out;
  };
  const dentro = (i) => i > a && i < b;
  ['obterNavegadorPdf(', 'page.pdf(', "fecharNavegadorPdf('erro na geração')", 'agendarFechamentoOcioso(', 'fila=${']
    .forEach((txt) => posicoes(txt).forEach((i) => assert.ok(dentro(i), `${txt} fora da fila na linha ${linhaDe(fonte, i)}`)));
  ['writeFileSync(', 'UPDATE ordens_servico SET pdf_url', 'res.json(', "error: 'Erro ao gerar PDF'", 'gerarHTMLOS(']
    .forEach((txt) => posicoes(txt).forEach((i) => assert.ok(!dentro(i), `${txt} dentro da fila na linha ${linhaDe(fonte, i)} — segura a fila`)));
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
