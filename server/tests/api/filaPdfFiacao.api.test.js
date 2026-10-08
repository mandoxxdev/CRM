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

// ---------------------------------------------------------------------------------------------
// Etapa 87 — fix-round da revisao adversarial. Cinco mutacoes passavam 12/12 nas reguas acima:
//   M1 apagar `await page.close()` de um bloco (a aba vaza; so a contagem global de page.pdf via);
//   M2 abrir Chromium por outra grafia: `require("puppeteer").launch(`, `const {launch}=puppeteer`,
//      `puppeteer.connect(` (a regua so procurava `puppeteer.launch(`);
//   M3 `enfileirarPdf(` sem await/return (a tarefa roda, mas a rota segue sem o PDF e o erro some);
//   M4 fechar por apelido: `{ const nb = navegadorPdf; if (nb) await nb.close(); }` (a regua so
//      procurava `navegadorPdf.close`);
//   M5 `browser = null` antes do page.pdf (o catch deixa de fechar o navegador no erro).
// E um deadlock nao tinha regua: chamar gerarPdfDeHtml( de dentro de uma tarefa da fila.
// ---------------------------------------------------------------------------------------------

/** Indices (fora de comentario) de `re` em [a, b). */
function ocorrencias(src, re, a = 0, b = src.length) {
  const out = []; let m; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((m = r.exec(src))) {
    if (m.index < a) continue;
    if (m.index >= b) break;
    if (!emComentario(src, m.index)) out.push(m.index);
  }
  return out;
}

/** [abre, fecha] do corpo da funcao `assinatura` (ex.: 'async function obterNavegadorPdf('). */
function corpoDe(src, assinatura) {
  const def = src.indexOf(assinatura);
  if (def < 0) throw new Error(`${assinatura} sumiu`);
  const abre = src.indexOf('{', fechamento(src, def + assinatura.length - 1));
  return [abre, fechamento(src, abre)];
}

/** As tarefas da fila que geram PDF (as que tem page.pdf), cada uma com um nome legivel. */
function blocosDeGeracao(src, blocosDaFila) {
  const corpoHtml = corpoDe(src, 'async function gerarPdfDeHtml(');
  const iRotaOs = src.indexOf("app.post('/api/operacional/ordens-servico/:id/gerar-pdf'");
  return blocosDaFila
    .filter(([a, b]) => ocorrencias(src, /\bpage\.pdf\(/, a, b).length > 0)
    .map(([a, b]) => {
      let nome = 'rota da proposta';
      if (a > corpoHtml[0] && b < corpoHtml[1]) nome = 'gerarPdfDeHtml';
      else if (iRotaOs > 0 && a > iRotaOs && a < fechamento(src, iRotaOs + 'app.post'.length)) nome = 'rota da OS';
      return { nome, a, b, linha: linhaDe(src, a) };
    });
}

/**
 * M1/M5 — por bloco de geracao: exatamente um de cada, NESTA ordem:
 * page.pdf( -> await page.close() -> pdfsGerados += 1 -> agendarFechamentoOcioso().
 * `browser`: so `let browser = null` / `[const ]browser = await obterNavegadorPdf()` / no maximo um
 * `browser = null` DEPOIS do page.close() (antes, o catch nao fecha o navegador no erro).
 * Devolve a lista de problemas (vazia = ok) — usada no controle sintetico e no index.js.
 */
function problemasDoCicloDaAba(src, bloco) {
  const { nome, a, b } = bloco; const probs = [];
  const passos = [
    ['page.pdf(', /\bpage\.pdf\(/],
    ['await page.close()', /\bawait\s+page\.close\(\s*\)/],
    ['pdfsGerados += 1', /\bpdfsGerados\s*\+=\s*1\b/],
    ['agendarFechamentoOcioso()', /\bagendarFechamentoOcioso\(\s*\)/],
  ];
  const pos = passos.map(([txt, re]) => {
    const oc = ocorrencias(src, re, a, b);
    if (oc.length !== 1) probs.push(`${nome}: ${txt} aparece ${oc.length}x (esperado 1)`);
    return oc[0];
  });
  for (let i = 1; i < pos.length; i++) {
    if (pos[i] !== undefined && pos[i - 1] !== undefined && !(pos[i] > pos[i - 1])) {
      probs.push(`${nome}: ${passos[i][0]} tem de vir DEPOIS de ${passos[i - 1][0]}`);
    }
  }
  const iClose = pos[1];
  ocorrencias(src, /\bbrowser\s*=(?!=)/, a, b).forEach((i) => {
    const linha = src.slice(src.lastIndexOf('\n', i) + 1, src.indexOf('\n', i));
    const depois = src.slice(i, src.indexOf('\n', i));
    const antes = src.slice(src.lastIndexOf('\n', i) + 1, i);
    if (/^\s*let\s+$/.test(antes) && /^browser\s*=\s*null\s*;/.test(depois)) return;
    if (/^\s*(const\s+)?$/.test(antes) && /^browser\s*=\s*await\s+obterNavegadorPdf\(\)\s*;/.test(depois)) return;
    if (/^\s*$/.test(antes) && /^browser\s*=\s*null\s*;\s*$/.test(depois)) {
      if (!(iClose !== undefined && i > iClose)) probs.push(`${nome}: browser = null antes do await page.close() (linha ${linhaDe(src, i)})`);
      return;
    }
    probs.push(`${nome}: atribuicao a browser nao prevista na linha ${linhaDe(src, i)}: ${linha.trim()}`);
  });
  const nulos = ocorrencias(src, /^\s*browser\s*=\s*null\s*;/m, a, b).length;
  if (nulos > 1) probs.push(`${nome}: browser = null aparece ${nulos}x`);
  return probs;
}

const geracao = blocosDeGeracao(fonte, blocos);

test('controle: o ciclo da aba acusa page.close() ausente e browser = null antes do page.pdf (fonte sintetica)', () => {
  const ok = [
    'async function gerarPdfDeHtml() {}',
    'x(enfileirarPdf(async () => {',
    '  let browser = null;',
    '  try {',
    '  browser = await obterNavegadorPdf();',
    '  const r = await page.pdf({});',
    '  await page.close();',
    '  browser = null;',
    '  pdfsGerados += 1;',
    '  agendarFechamentoOcioso(); } catch (e) { } }));',
  ];
  const blocoDe = (src) => blocosDeGeracao(src, analisar(src).blocos)[0];
  const src = ok.join('\n');
  assert.deepStrictEqual(problemasDoCicloDaAba(src, blocoDe(src)), []);
  const semClose = ok.filter((l) => !l.includes('page.close')).join('\n');
  assert.ok(problemasDoCicloDaAba(semClose, blocoDe(semClose)).some((p) => p.includes('await page.close() aparece 0x')));
  const nuloCedo = [...ok.slice(0, 5), '  browser = null;', ...ok.slice(5)].join('\n');
  assert.ok(problemasDoCicloDaAba(nuloCedo, blocoDe(nuloCedo)).some((p) => p.includes('antes do await page.close()')));
  const foraDeOrdem = [...ok.slice(0, 6), ok[8], ok[6], ok[7], ok[9]].join('\n');
  assert.ok(problemasDoCicloDaAba(foraDeOrdem, blocoDe(foraDeOrdem)).some((p) => p.includes('tem de vir DEPOIS')));
});

test('M1/M5: cada bloco de geracao (proposta, gerarPdfDeHtml, OS) fecha a aba, conta e agenda o ocioso, nesta ordem', () => {
  assert.deepStrictEqual(geracao.map((g) => g.nome).sort(), ['gerarPdfDeHtml', 'rota da OS', 'rota da proposta'],
    `blocos de geracao achados: ${JSON.stringify(geracao.map((g) => [g.nome, g.linha]))}`);
  const probs = geracao.flatMap((g) => problemasDoCicloDaAba(fonte, g));
  assert.deepStrictEqual(probs, []);
});

test('M2: Chromium so por obterNavegadorPdf — nenhum outro uso de puppeteer, .launch( ou .connect(', () => {
  // `puppeteer` (minusculo, como substring: pega puppeteer-core) fora de comentario: so a
  // importacao do topo (2x na mesma linha) e o puppeteer.launch( dentro de obterNavegadorPdf.
  const imp = fonte.indexOf("const puppeteer = require('puppeteer');");
  assert.ok(imp > 0, "a importacao const puppeteer = require('puppeteer'); sumiu");
  const usos = ocorrencias(fonte, /puppeteer/);
  const iLaunch = fonte.indexOf('puppeteer.launch(', corpoObter[0]);
  const permitidos = [imp + 'const '.length, imp + "const puppeteer = require('".length, iLaunch];
  const extras = usos.filter((i) => !permitidos.includes(i)).map((i) => linhaDe(fonte, i));
  assert.deepStrictEqual(extras, [], 'puppeteer usado fora da importacao e de obterNavegadorPdf (outro Chromium?)');
  assert.strictEqual(usos.length, 3, `ocorrencias de puppeteer = ${usos.length}`);
  assert.ok(iLaunch > corpoObter[0] && iLaunch < corpoObter[1], 'puppeteer.launch( saiu de obterNavegadorPdf');
  // Qualquer launch/connect por outra grafia (apelido, require inline, colchete).
  const lancadores = ocorrencias(fonte, /(\blaunch|\bconnect)\s*\(|\[\s*['"`](launch|connect)['"`]\s*\]/);
  assert.deepStrictEqual(lancadores.map((i) => linhaDe(fonte, i)), [linhaDe(fonte, iLaunch)],
    'launch(/connect( fora do unico puppeteer.launch( de obterNavegadorPdf');
});

test('M3: toda chamada de enfileirarPdf( e await/return (so o ocioso, no setTimeout, e dispara-e-esquece)', () => {
  const corpoAgendar = corpoDe(fonte, 'function agendarFechamentoOcioso(');
  const soltas = [];
  ocorrencias(fonte, /\benfileirarPdf\(/).forEach((i) => {
    const antes = fonte.slice(fonte.lastIndexOf('\n', i) + 1, i);
    if (/function\s+$/.test(antes)) return; // a definicao
    if (/\b(await|return)\s+$/.test(antes)) return;
    const ocioso = i > corpoAgendar[0] && i < corpoAgendar[1]
      && fonte.startsWith("enfileirarPdf(() => fecharNavegadorPdf('ocioso'))", i);
    if (!ocioso) soltas.push(linhaDe(fonte, i));
  });
  assert.deepStrictEqual(soltas, [], 'enfileirarPdf( sem await/return — o resultado e o erro da tarefa se perdem');
  // gerarPdfDeHtml injetado nas rotas: tambem esperado.
  const rotas = fs.readdirSync(path.join(__dirname, '../../routes')).filter((f) => f.endsWith('.js'));
  rotas.forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes', f), 'utf8');
    ocorrencias(src, /\bgerarPdfDeHtml\(/).forEach((i) => {
      const antes = src.slice(src.lastIndexOf('\n', i) + 1, i);
      assert.ok(/\b(await|return)\s+$/.test(antes) || /function\s+$/.test(antes),
        `routes/${f}:${linhaDe(src, i)} chama gerarPdfDeHtml( sem await/return`);
    });
  });
});

test('M4: navegadorPdf so no ciclo de vida (declaracao, fechar, obter) e nas leituras !!navegadorPdf', () => {
  const corpoFechar = corpoDe(fonte, 'async function fecharNavegadorPdf(');
  const dentro = ([a, b]) => (i) => i > a && i < b;
  const usos = ocorrencias(fonte, /\bnavegadorPdf\b/);
  const noFechar = usos.filter(dentro(corpoFechar));
  const noObter = usos.filter(dentro(corpoObter));
  const resto = usos.filter((i) => !noFechar.includes(i) && !noObter.includes(i));
  const linhaToda = (i) => fonte.slice(fonte.lastIndexOf('\n', i) + 1, fonte.indexOf('\n', i)).trim();
  // fecharNavegadorPdf: pega e zera — e so (o fechamento vai pelo helper com prazo).
  assert.deepStrictEqual(noFechar.map(linhaToda), ['const b = navegadorPdf;', 'navegadorPdf = null;'],
    'fecharNavegadorPdf mexe em navegadorPdf de um jeito nao previsto');
  assert.strictEqual(noObter.length, 7, `obterNavegadorPdf: navegadorPdf ${noObter.length}x (esperado 7)`);
  assert.deepStrictEqual(ocorrencias(fonte, /\.close\(/, corpoObter[0], corpoObter[1]).map((i) => linhaDe(fonte, i)), [],
    'obterNavegadorPdf chama .close( direto — a reciclagem fecha por fecharNavegadorPdf');
  const outros = resto.map(linhaToda);
  assert.deepStrictEqual(outros, [
    'let navegadorPdf = null;',
    'const navegadorJaEstavaDePe = !!navegadorPdf;',
    'const navegadorJaEstavaDePe = !!navegadorPdf;',
  ], 'navegadorPdf usado fora do ciclo de vida (apelido para fechar/usar o navegador por fora?)');
  resto.slice(1).forEach((i) => assert.ok(blocos.some(([a, b]) => i > a && i < b), `!!navegadorPdf fora da fila na linha ${linhaDe(fonte, i)}`));
  // O fechamento e com prazo (close pendurado travaria a fila): helper, sem .close( direto.
  const corpo = fonte.slice(corpoFechar[0], corpoFechar[1]);
  assert.ok(/await fecharNavegadorComPrazo\(b,/.test(corpo), 'fecharNavegadorPdf nao fecha pelo fecharNavegadorComPrazo');
  assert.deepStrictEqual(ocorrencias(fonte, /\.close\(/, corpoFechar[0], corpoFechar[1]).map((i) => linhaDe(fonte, i)), [],
    'fecharNavegadorPdf chama .close( direto — sem prazo, um close pendurado trava a fila');
  assert.ok(/const \{ fecharNavegadorComPrazo \} = require\('\.\/services\/filaPdf'\)/.test(fonte), 'fecharNavegadorComPrazo nao vem de services/filaPdf');
});

test('deadlock: nenhuma tarefa da fila chama gerarPdfDeHtml( nem abre outro enfileirarPdf(', () => {
  const chamadasHtml = ocorrencias(fonte, /\bgerarPdfDeHtml\(/).filter((i) => {
    const antes = fonte.slice(fonte.lastIndexOf('\n', i) + 1, i);
    return !/function\s+$/.test(antes);
  });
  const naFila = chamadasHtml.filter((i) => blocos.some(([a, b]) => i > a && i < b)).map((i) => linhaDe(fonte, i));
  assert.deepStrictEqual(naFila, [], 'gerarPdfDeHtml( dentro de uma tarefa da fila — ela espera a si mesma (deadlock)');
  const aninhados = blocos.filter(([a]) => blocos.some(([x, y]) => a > x && a < y)).map(([a]) => linhaDe(fonte, a));
  assert.deepStrictEqual(aninhados, [], 'enfileirarPdf( dentro de outra tarefa da fila (deadlock)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
