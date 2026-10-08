/**
 * Etapa 88 (B43, RN-88.01..03) — rodape "Pagina X de Y" do PDF da OS.
 *
 * O bug: `gerarHTMLOS` escrevia "Pagina 1 de N" num `div` no fim do HTML, com N estimado pela
 * quantidade de itens. A OS de 3 itens saia com 3 paginas e "Pagina 1 de 1" so na ultima; a de 12
 * itens, com 6 paginas e o mesmo "1 de 1" (prova real no plano da Etapa 88).
 *
 * Parte pura: `services/pdfOs` (opcoes do page.pdf + @page). Parte de TEXTO no index.js (23 mil
 * linhas, abre banco e faz listen no import — mesmo precedente de filaPdfFiacao.api.test.js):
 * gerarHTMLOS nao estima mais paginas e usa o @page do servico; a rota usa opcoesPdfOs().
 * O comportamento (o Chromium numerando cada pagina) foi provado com o servidor de pe.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MARGEM_INFERIOR_OS_MM, CSS_PAGE_OS, rodapePaginasOs, opcoesPdfOs } = require('../../services/pdfOs');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const fonte = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');

/** Tira comentarios `//` e `/* *\/` (o trecho analisado nao tem `//` dentro de string relevante). */
const semComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

/** Problemas do corpo de gerarHTMLOS (RN-88.03). */
function problemasDoHtmlOs(src) {
  const ini = src.indexOf('function gerarHTMLOS(');
  if (ini < 0) return ['gerarHTMLOS sumiu'];
  const fim = src.indexOf('Erro na função gerarHTMLOS', ini);
  if (fim < 0) return ['fim de gerarHTMLOS nao achado'];
  const corpo = semComentarios(src.slice(ini, fim));
  const probs = [];
  if (/P[áa]gina\s/.test(corpo)) probs.push('gerarHTMLOS ainda escreve "Pagina ..." no HTML');
  if (/totalPages/.test(corpo)) probs.push('gerarHTMLOS ainda estima totalPages');
  if (/class="page-number"/.test(corpo)) probs.push('div .page-number voltou ao HTML');
  if (!/\$\{CSS_PAGE_OS\}/.test(corpo)) probs.push('gerarHTMLOS nao usa o @page de services/pdfOs');
  // Revisao da 88: `@page :first { margin: 0 }` (padrao copiavel da proposta) apagaria o rodape da
  // pagina 1 e escapava do `/@page\s*\{/`; qualquer @page proprio e recusado.
  if (/@page[\s:{]/.test(corpo)) probs.push('gerarHTMLOS tem @page proprio (o de services/pdfOs e o que tem a margem do rodape)');
  // Revisao da 88: a estimativa podia voltar com outra palavra ("Folha 1 de ${n}", "Pag. 1/${n}").
  if (/\b(folha|p[áa]g\.?)\s*\d+\s*(de|\/)\s*\$\{/i.test(corpo)) probs.push('contagem de paginas estimada voltou com outro texto');
  return probs;
}

console.log('pdfOsRodape (Etapa 88)');

test('controle: o verificador acusa o div estimado e o @page margin 0 (fonte sintetica)', () => {
  const velho = "function gerarHTMLOS(os, osItens = []) {\n  const totalPages = 1;\n  let html = `<style>@page { size: A4; margin: 0; }</style>\n"
    + '  <div class="page-number">Página 1 de ${totalPages}</div>`;\n'
    + "  console.error('Erro na função gerarHTMLOS:', e);\n}";
  const p = problemasDoHtmlOs(velho);
  assert.strictEqual(p.length, 5, JSON.stringify(p));
});

test('RN-88.03: gerarHTMLOS nao estima paginas nem escreve "Pagina N de M"', () => {
  const p = problemasDoHtmlOs(fonte);
  assert.deepStrictEqual(p, []);
});

test('RN-88.01: opcoes do page.pdf da OS ligam o rodape com pageNumber/totalPages', () => {
  const o = opcoesPdfOs();
  assert.strictEqual(o.displayHeaderFooter, true, 'displayHeaderFooter');
  assert.strictEqual(o.headerTemplate, '<span></span>', 'sem cabecalho vazio o Chromium imprime data+titulo');
  assert.ok(/<span class="pageNumber"><\/span>/.test(o.footerTemplate), 'footerTemplate sem pageNumber');
  assert.ok(/<span class="totalPages"><\/span>/.test(o.footerTemplate), 'footerTemplate sem totalPages');
  assert.ok(/Página <span class="pageNumber"><\/span> de <span class="totalPages"><\/span>/.test(o.footerTemplate), 'texto "Pagina X de Y"');
  assert.strictEqual(o.footerTemplate, rodapePaginasOs());
  assert.strictEqual(o.format, 'A4');
  assert.strictEqual(o.printBackground, true);
  assert.strictEqual(o.preferCSSPageSize, true);
});

test('rodape: estilo INLINE com font-size explicito, centralizado e cinza (nao herda o CSS do documento)', () => {
  const r = rodapePaginasOs();
  assert.ok(/style="[^"]*font-size:\s*10px/.test(r), 'font-size 10px inline');
  assert.ok(/style="[^"]*text-align:\s*center/.test(r), 'centralizado');
  assert.ok(/style="[^"]*color:\s*#999/.test(r), 'cinza #999');
  // Revisao da 88: um estilo que esconde o rodape passava (o teste so olhava tamanho/cor/alinhamento).
  assert.ok(!/display:\s*none|visibility:\s*hidden|opacity:\s*0(?![.\d])/.test(r), 'rodape escondido pelo estilo');
});

test('margem inferior do @page = a do page.pdf, e > 0 (@page margin 0 apaga o rodape — Etapa 78)', () => {
  // Revisao da 88: `> 0` deixava passar 1-2 mm, que cortam o texto de 10px — exigir espaco real.
  assert.ok(MARGEM_INFERIOR_OS_MM >= 8, `margem inferior ${MARGEM_INFERIOR_OS_MM}mm corta o rodape`);
  const m = CSS_PAGE_OS.match(/margin:\s*0\s+0\s+(\d+(?:\.\d+)?)mm\s+0\s*;/);
  assert.ok(m, `@page sem margem inferior: ${CSS_PAGE_OS}`);
  assert.strictEqual(Number(m[1]), MARGEM_INFERIOR_OS_MM);
  assert.ok(/size:\s*A4\s*;/.test(CSS_PAGE_OS), 'size: A4 (retrato) exato');
  assert.strictEqual(opcoesPdfOs().margin.bottom, `${MARGEM_INFERIOR_OS_MM}mm`);
});

test('rota gerar-pdf da OS: page.pdf(opcoesPdfOs()) e sem displayHeaderFooter: false', () => {
  const ini = fonte.indexOf("app.post('/api/operacional/ordens-servico/:id/gerar-pdf'");
  assert.ok(ini > 0, 'rota gerar-pdf da OS sumiu');
  const fim = fonte.indexOf('\napp.', ini + 10);
  const rota = semComentarios(fonte.slice(ini, fim));
  const chamadas = rota.match(/page\.pdf\(/g) || [];
  assert.strictEqual(chamadas.length, 1, `page.pdf( na rota = ${chamadas.length}`);
  assert.ok(/page\.pdf\(opcoesPdfOs\(\)\)/.test(rota), 'a rota nao usa opcoesPdfOs()');
  assert.ok(!/displayHeaderFooter:\s*false/.test(rota), 'displayHeaderFooter: false voltou na rota');
  assert.ok(/const \{ CSS_PAGE_OS, opcoesPdfOs \} = require\('\.\/services\/pdfOs'\);/.test(fonte), 'require de services/pdfOs');
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
