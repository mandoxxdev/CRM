/**
 * A cláusula 5.23 (ITENS EXCLUSOS DO FORNECIMENTO) precisa caber INTEIRA em uma única
 * página — título + os 15 itens. Ela foi condensada exatamente para isso; qualquer texto
 * acrescentado depois a faz transbordar e o paginador a divide em duas páginas de novo.
 *
 * Roda no cenário do PDF (forPdfServer=true), onde a Century Gothic é embutida em base64:
 * é a métrica de texto que vale no documento final — com a fonte de fallback o resultado
 * seria otimista demais.
 *
 * Executar: node tests/proposta523UmaPagina.test.js  (usa puppeteer)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');

// Um trecho curto e único de cada um dos 15 itens: prova que nenhuma exclusão sumiu na
// condensação (o risco real de "resumir" um texto jurídico).
const MARCOS = [
  'Transporte, frete e seguro dos equipamentos',
  'Movimentação e içamento: munck',
  'infraestrutura de instalação: elétrica',
  'Obras civis e adequações estruturais: fundações',
  'Translado, hospedagem, alimentação e logística',
  'Sapatas, brocas, bases, reforços',
  'Consultoria química, industrial',
  'Laudos, certificados, ensaios e calibrações',
  'periféricos complementares: compressor',
  'Consumíveis e utilidades operacionais',
  'Mão de obra de terceiros: eletricistas',
  'Adequações normativas do local: NR-10',
  'Manutenção preventiva, corretiva ou preditiva',
  'Custos de paralisações, improdutividade',
  'Quaisquer outros itens, serviços, materiais',
];

let falhas = 0;
const checar = (cond, msg) => {
  if (cond) console.log('  ✓ ' + msg);
  else { console.error('  ✗ ' + msg); falhas++; }
};

async function medir(browser, rotulo, clausulasCustom) {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'T-01', titulo: 'Teste', razao_social: 'Cliente X' },
    [{ id: 1, produto_nome: 'Masseira', quantidade: 1, valor_unitario: 1000, valor_total: 1000 }],
    { total: 1000, dataEmissao: '28/07/2026' },
    clausulasCustom ? { clausulas_custom: clausulasCustom } : null,
    null,
    true,  // forPdfServer: fontes embutidas (métrica real do PDF)
    true
  );
  const tmp = path.join(os.tmpdir(), `c523-1pag-${rotulo}.html`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
  await page.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: ['load', 'domcontentloaded'] });
  await new Promise((r) => setTimeout(r, 1800));
  await page.evaluate(() => { if (window.paginateProposalContent) window.paginateProposalContent(); });
  await new Promise((r) => setTimeout(r, 500));
  const r = await page.evaluate((MARCOS) => {
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'))
      .filter((p) => p.style.display !== 'none');
    const paginaDoMarco = MARCOS.map((m) => {
      const i = gen.findIndex((p) => (p.textContent || '').includes(m));
      return i >= 0 ? i + 1 : null;
    });
    const faltando = MARCOS.filter((m, i) => paginaDoMarco[i] === null);
    const paginasUsadas = [...new Set(paginaDoMarco.filter(Boolean))].sort((a, b) => a - b);
    const pagTitulo = gen.findIndex((p) => /5\.23 ITENS EXCLUSOS DO FORNECIMENTO/.test(p.textContent || '')) + 1;
    let folga = null;
    if (paginasUsadas.length === 1) {
      const pg = gen[paginasUsadas[0] - 1];
      const pc = pg.querySelector('.page-content');
      const cs = getComputedStyle(pc);
      const areaUtil = pc.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const usado = Array.from(pg.querySelector('.page-stack').children)
        .reduce((acc, c) => acc + c.getBoundingClientRect().height, 0);
      folga = Math.round(areaUtil - usado);
    }
    let overflow = 0;
    gen.forEach((pg) => {
      const pc = pg.querySelector('.page-content');
      if (!pc) return;
      const bottom = pc.getBoundingClientRect().bottom;
      Array.from(pc.children).forEach((ch) => { if (ch.getBoundingClientRect().bottom > bottom + 1) overflow++; });
    });
    return { paginasUsadas, faltando, pagTitulo, folga, overflow };
  }, MARCOS);
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const comoBanco = getClausulasDefault().map((c, i) => ({
    id: 100 + i, ordem: i, ativo: 1, titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo,
  }));

  for (const [rotulo, custom] of [['default', getClausulasDefault()], ['banco', comoBanco], ['estatico', null]]) {
    const r = await medir(browser, rotulo, custom);
    console.log(`\n[${rotulo}] título na pág ${r.pagTitulo}; itens nas páginas ${JSON.stringify(r.paginasUsadas)}; folga ${r.folga}px`);
    checar(r.faltando.length === 0, `[${rotulo}] os 15 itens estão no documento (faltando: ${r.faltando.length})`);
    checar(r.paginasUsadas.length === 1, `[${rotulo}] os 15 itens numa ÚNICA página (${JSON.stringify(r.paginasUsadas)})`);
    checar(r.pagTitulo === r.paginasUsadas[0], `[${rotulo}] o título 5.23 está na mesma página dos itens`);
    checar(r.overflow === 0, `[${rotulo}] nenhum bloco sobre o rodapé (${r.overflow})`);
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
