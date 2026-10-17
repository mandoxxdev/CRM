/**
 * #1 — Sumário que estoura a página deve ser escondido (display:none) e a
 * numeração Pág. X/Y deve permanecer consistente. Sumário pequeno permanece.
 *
 * Etapa 139 (RN-139.02): este teste ficou vermelho em a33dfca1 (28/07/2026) e o motivo NAO era o sumário: as
 * cláusulas 5.25+ que não são a CONSIDERAÇÃO FINAL deixaram de ser renderizadas (I1), o caso grande caiu de 40
 * para 19 páginas e o sumário passou a caber. Por isso o caso grande agora confere também que todo título da
 * entrada aparece nas páginas — um sumário "certo" sobre um documento que perdeu cláusulas não vale.
 * E serve os próprios assets (helpers/servirAssetsProposta.js): sem isso as fontes não carregavam (vinham de
 * http://localhost:5000) e a medição do sumário era feita com a fonte de reserva.
 * Executar: node tests/propostaSumarioOverflow.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const { servirAssetsProposta } = require('./helpers/servirAssetsProposta');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '22/07/2026' };

let assets = null;
async function render(clausulas) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: clausulas }, assets.baseURL, false, true);
  const tmp = path.join(os.tmpdir(), `sumario-${clausulas.length}.html`);
  fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  // Sem o número: os blocos de texto da seção de preço depois do primeiro imprimem o número num atributo
  // (data-titulo-prefixo), não no texto. Os títulos deste teste são únicos pelo sufixo VARIANTE k-i.
  const titulosEntrada = clausulas.map(c => String(c.titulo).replace(/^\s*\d+(\.\d+)*\.?\s+/, '').trim());
  const r = await page.evaluate((titulosEntrada) => {
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
    // I1 — todo título da ENTRADA aparece nas páginas geradas (não no #proposalSource: o que o template
    // deixa de renderizar some dos dois, e comparar um com o outro não vê nada)
    const textoPaginas = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]')).map(p => p.textContent || '').join('\n');
    const sumidos = titulosEntrada.filter(t => !textoPaginas.includes(t));
    return { tocVisivel, tocOverflow, totalVisiveis: vis.length, numeracaoOk, sumidos: sumidos.length, exemploSumido: sumidos[0] || null };
  }, titulosEntrada);
  await browser.close();
  return r;
}

(async () => {
  assets = await servirAssetsProposta();
  let failed = 0;
  // Caso 1: MUITAS cláusulas (3x as default, com títulos únicos) -> sumário estoura -> escondido
  const muitas = [];
  for (let k = 0; k < 3; k++) {
    getClausulasDefault().forEach((c, i) => muitas.push({ numero: `5.${muitas.length + 1}`, titulo: `${c.titulo} VARIANTE ${k}-${i}`, conteudo: c.conteudo }));
  }
  const grande = await render(muitas);
  console.log('grande:', JSON.stringify(grande));
  if (grande.sumidos) { console.error(`✗ I1: ${grande.sumidos} cláusula(s) da entrada sumiram do documento (ex.: ${grande.exemploSumido})`); failed++; }
  else console.log('  ✓ I1: todas as cláusulas da entrada estão nas páginas');
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

  await assets.fechar();
  console.log(failed ? `\n${failed} FALHA(S)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
