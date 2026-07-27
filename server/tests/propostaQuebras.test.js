/**
 * I7 — marcos que iniciam em PAGINA NOVA: secao 4, secao 5, 5.23 e 5.24.
 *
 * A secao 4 (ESCOPO DE FORNECIMENTO) foi incluida em 27/07/2026: ela nao tinha quebra
 * forcada e comecava onde sobrasse espaco — numa proposta curta caia na mesma pagina das
 * secoes 1, 2 e 3. O `avoid-break` que ela ja tinha so impede o titulo de ficar orfao do
 * primeiro equipamento; nao abre pagina.
 *
 * A verificacao roda nos DOIS ramos do equipDescritivoHtml: com itens e sem nenhum item
 * (a secao 4 tem markup proprio para cada caso, e a quebra precisa valer nos dois).
 *
 * Executar: node tests/propostaQuebras.test.js  (usa puppeteer)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const comItens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '21/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

async function medir(browser, itens, rotulo) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  const tmp = path.join(os.tmpdir(), `quebras-${rotulo}.html`); fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    // Apenas páginas de conteúdo geradas pelo paginador (exclui capa, apresentação e o
    // SUMÁRIO estático, que lista TODOS os títulos e falsearia o findIndex).
    const vis = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]')).filter(p => p.style.display !== 'none');
    // primeira pagina de cada marco
    const pSecao4 = vis.findIndex(p => (p.textContent || '').includes('4. ESCOPO DE FORNECIMENTO'));
    const pSecao5 = vis.findIndex(p => (p.textContent || '').includes('CONDIÇÕES GERAIS DE FORNECIMENTO'));
    const p523 = vis.findIndex(p => (p.textContent || '').includes('5.23 PREÇO'));
    const p524 = vis.findIndex(p => (p.textContent || '').includes('5.24 CONSIDERAÇÃO FINAL'));
    // a pagina onde a 5.23 começa NAO deve conter uma clausula 5.22 (nao mistura)
    const pg523 = vis[p523];
    const misturou = pg523 ? /5\.22\s/.test(pg523.textContent) : true;
    // a pagina da secao 4 nao pode trazer junto nenhuma das secoes anteriores
    const pg4 = vis[pSecao4];
    const txt4 = pg4 ? (pg4.textContent || '') : '';
    const anterioresJunto = ['1. OBJETIVO DA PROPOSTA', '2. ELABORAÇÃO DA PROPOSTA', '3. OFERTA']
      .filter((t) => txt4.includes(t));
    return { pSecao4, pSecao5, p523, p524, misturou, anterioresJunto, totalPaginas: vis.length };
  });
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [itens, rotulo] of [[comItens, 'com-itens'], [[], 'sem-itens']]) {
    const r = await medir(browser, itens, rotulo);
    console.log(`\n[${rotulo}] ${r.totalPaginas} paginas geradas -> ${JSON.stringify(r)}`);
    checar(r.pSecao4 >= 0, 'secao 4 presente nas paginas geradas');
    checar(r.anterioresJunto.length === 0,
      `secao 4 inicia em pagina NOVA (secoes anteriores junto: ${JSON.stringify(r.anterioresJunto)})`);
    checar(r.pSecao5 > r.pSecao4, `secao 5 depois da secao 4 (pag ${r.pSecao5 + 1} vs ${r.pSecao4 + 1})`);
    checar(r.p523 > r.pSecao5, `5.23 depois da secao 5 (pag ${r.p523 + 1} vs ${r.pSecao5 + 1})`);
    checar(r.p524 > r.p523, `5.24 depois da 5.23 (pag ${r.p524 + 1} vs ${r.p523 + 1})`);
    checar(!r.misturou, 'pagina da 5.23 nao traz a 5.22 junto');
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
