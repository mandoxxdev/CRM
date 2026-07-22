/**
 * Verifica que a secao 5, a 5.23 e a 5.24 iniciam em paginas diferentes.
 * Executar: node tests/propostaQuebras.test.js  (usa puppeteer)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '21/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  const tmp = path.join(os.tmpdir(), 'quebras.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    // Apenas páginas de conteúdo geradas pelo paginador (exclui capa, apresentação e o
    // SUMÁRIO estático, que lista TODOS os títulos e falsearia o findIndex).
    const vis = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]')).filter(p => p.style.display !== 'none');
    // primeira pagina de cada marco
    const pSecao5 = vis.findIndex(p => (p.textContent || '').includes('CONDIÇÕES GERAIS DE FORNECIMENTO'));
    const p523 = vis.findIndex(p => (p.textContent || '').includes('5.23 PREÇO'));
    const p524 = vis.findIndex(p => (p.textContent || '').includes('5.24 CONSIDERAÇÃO FINAL'));
    // a pagina onde a 5.23 começa NAO deve conter uma clausula 5.22 (nao mistura)
    const pg523 = vis[p523];
    const misturou = pg523 ? /5\.22\s/.test(pg523.textContent) : true;
    return { pSecao5, p523, p524, misturou };
  });
  await browser.close();
  const ok = r.pSecao5 >= 0 && r.p523 > r.pSecao5 && r.p524 > r.p523 && !r.misturou;
  console.log(JSON.stringify(r));
  console.log(ok ? '✓ quebras corretas' : '✗ quebras incorretas');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
