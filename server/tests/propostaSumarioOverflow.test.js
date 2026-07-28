/**
 * #1 — Sumário que estoura a página deve ser escondido (display:none) e a
 * numeração Pág. X/Y deve permanecer consistente. Sumário pequeno permanece.
 * Executar: node tests/propostaSumarioOverflow.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '22/07/2026' };

async function render(clausulas) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: clausulas }, null, false, true);
  const tmp = path.join(os.tmpdir(), `sumario-${clausulas.length}.html`);
  fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    const toc = document.getElementById('tocPage');
    const pc = toc ? toc.querySelector('.page-content') : null;
    const tocVisivel = !!toc && toc.style.display !== 'none';
    const tocOverflow = pc ? pc.scrollHeight > pc.clientHeight + 2 : false;
    const vis = Array.from(document.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
    // numeração consistente: a capa NÃO conta — a página numerável i (1-based, sem
    // .cover-page) mostra js-page-number == i e count == total de numeráveis
    let numeracaoOk = true;
    const numeraveis = vis.filter(p => !p.classList.contains('cover-page'));
    numeraveis.forEach((p, i) => {
      const n = p.querySelector('.js-page-number');
      const c = p.querySelector('.js-page-count');
      if (n && String(i + 1) !== n.textContent) numeracaoOk = false;
      if (c && String(numeraveis.length) !== c.textContent) numeracaoOk = false;
    });
    return { tocVisivel, tocOverflow, totalVisiveis: vis.length, numeracaoOk };
  });
  await browser.close();
  return r;
}

(async () => {
  let failed = 0;
  // Caso 1: MUITAS cláusulas (3x as default, com títulos únicos) -> sumário estoura -> escondido
  const muitas = [];
  for (let k = 0; k < 3; k++) {
    getClausulasDefault().forEach((c, i) => muitas.push({ numero: `5.${muitas.length + 1}`, titulo: `${c.titulo} VARIANTE ${k}-${i}`, conteudo: c.conteudo }));
  }
  const grande = await render(muitas);
  console.log('grande:', JSON.stringify(grande));
  if (grande.tocVisivel) { console.error('✗ sumário estourado deveria estar escondido'); failed++; }
  else console.log('  ✓ sumário estourado escondido');
  if (!grande.numeracaoOk) { console.error('✗ numeração inconsistente após esconder sumário'); failed++; }
  else console.log('  ✓ numeração consistente sem o sumário');

  // Caso 2: poucas cláusulas -> sumário cabe -> visível e numerado
  const poucas = getClausulasDefault().slice(0, 5).map((c, i) => ({ numero: `5.${i + 1}`, titulo: c.titulo, conteudo: c.conteudo }));
  const pequeno = await render(poucas);
  console.log('pequeno:', JSON.stringify(pequeno));
  if (!pequeno.tocVisivel) { console.error('✗ sumário pequeno deveria permanecer visível'); failed++; }
  else console.log('  ✓ sumário pequeno visível');
  if (pequeno.tocOverflow) { console.error('✗ sumário pequeno não deveria ter overflow'); failed++; }
  else console.log('  ✓ sem overflow no sumário pequeno');
  if (!pequeno.numeracaoOk) { console.error('✗ numeração inconsistente com sumário visível'); failed++; }
  else console.log('  ✓ numeração consistente com sumário');

  console.log(failed ? `\n${failed} FALHA(S)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
