/**
 * #2 — Quando a tabela de precos da 5.23 quebra entre paginas, cada fragmento
 * deve repetir o cabecalho (thead ITEM/DESCRICAO/...).
 * Executar: node tests/proposta523TheadRepetido.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
// MUITOS itens para forçar a tabela de precos da 5.23 a quebrar em 2+ paginas
const itens = Array.from({ length: 60 }, (_, i) => ({
  produto_nome: `Equipamento de teste numero ${i + 1} com descricao razoavelmente longa para ocupar altura`,
  quantidade: 1, unidade: 'UN', valor_unitario: 1000 + i, valor_total: 1000 + i,
}));
const totais = { total: itens.reduce((s, i) => s + i.valor_total, 0), dataEmissao: '22/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  const tmp = path.join(os.tmpdir(), 'thead523.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const r = await page.evaluate(() => {
    // fragmentos da tabela de precos = tabelas em paginas geradas cujo tbody tem
    // linha com "TOTAL DA PROPOSTA" OU que estejam na secao da 5.23
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'));
    const frags = [];
    gen.forEach((p, pi) => {
      p.querySelectorAll('table').forEach((t) => {
        const txt = t.textContent || '';
        // tabela de precos: colunas PRECO UNITARIO / TOTAL
        if (/PRE[ÇC]O UNIT/i.test(txt) || /TOTAL DA PROPOSTA/.test(txt)) {
          frags.push({ page: pi + 1, hasThead: !!t.querySelector('thead'), rows: t.querySelectorAll('tbody > tr').length });
        }
      });
    });
    return { fragmentos: frags };
  });
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
  const frags = r.fragmentos;
  let failed = 0;
  if (frags.length < 2) { console.error(`✗ esperado 2+ fragmentos da tabela de precos (60 itens), veio ${frags.length}`); failed++; }
  const semThead = frags.filter(f => !f.hasThead);
  if (semThead.length > 0) { console.error(`✗ ${semThead.length} fragmento(s) sem thead (paginas ${semThead.map(f => f.page).join(',')})`); failed++; }
  if (!failed) console.log(`✓ ${frags.length} fragmentos, todos com thead`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
