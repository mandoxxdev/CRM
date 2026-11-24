/**
 * Proposta bilíngue — a paginação no navegador (RN-BI.02/03). Spec: specs/proposta-bilingue/README.md.
 *
 *   BI-P01 todo par (.bi-par) da fonte aparece UMA vez nas páginas, inteiro (as duas metades juntas) — RN-BI.03
 *   BI-P02 nenhuma página transborda na altura; nada (tabela, par, título) passa da margem direita; nenhuma célula da tabela de
 *          preços vaza (com valor de 7 dígitos) — o defeito visto em 24/11/2026: a tabela de 10 colunas cortava o total
 *   BI-P03 nenhuma linha de tabela é partida entre páginas (a linha bilíngue tem 10 células e o divisor a escolhia)
 *   BI-P04 todo texto do corpo está numa metade (.bi-pt/.bi-tr) ou numa exceção (tabela, assinatura, campos, números) — RN-BI.02
 *   BI-P05 um parágrafo maior que uma página fica INTEIRO num par (não é cortado entre páginas) — o caso extremo declarado
 *   BI-P06 o sumário continua visível e lista os títulos só pela metade PT
 *
 * Executar: node tests/propostaBilinguePaginacao.test.js  (usa puppeteer; sem o Chrome do puppeteer, aponte para um Chrome
 * instalado: PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe")
 */
const puppeteer = require('puppeteer');
const { CASOS, htmlDoCaso } = require('./helpers/propostaBaseHtml');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

CASOS.milhao = { ...CASOS.equipamento, itens: CASOS.equipamento.itens.map((i) => ({ ...i, valor_unitario: 1250000, valor_total: 1250000 })) };
// 30 itens: a tabela de preços OBRIGATORIAMENTE atravessa páginas — é o caso em que o divisor podia partir uma linha (BI-P03).
// Com um item só a tabela cabe numa página e a guarda da linha nunca é exercitada (controle positivo de 24/11/2026).
CASOS.muitos = {
  ...CASOS.pecas,
  itens: Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, produto_nome: `Disco Dispersor ${200 + i * 10}mm`, quantidade: 1 + (i % 3), unidade: 'UN',
    valor_unitario: 900 + i * 37, valor_total: (900 + i * 37) * (1 + (i % 3)), familia_produto: 'DISCOS', especificacoes_tecnicas: '{}' })),
};
const paragrafoGigante = Array.from({ length: 140 }, (_, i) => `Frase ${i + 1} de um paragrafo unico e muito longo da clausula.`).join(' ');
CASOS.gigante = {
  ...CASOS.projetoConceitual,
  config: () => {
    const c = CASOS.projetoConceitual.config();
    c.clausulas_custom = c.clausulas_custom.map((cl, i) => (i === 5 ? { ...cl, conteudo: `<p>${paragrafoGigante}</p>` } : cl));
    return c;
  },
};

async function medir(browser, html) {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.setContent(html, { waitUntil: ['load', 'domcontentloaded'], timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await page.evaluate(() => {
    const pgs = [...document.querySelectorAll('.proposal-page[data-generated="1"]')];
    const fonte = document.querySelectorAll('#proposalSource .bi-par').length;
    const nasPaginas = pgs.reduce((s, p) => s + p.querySelectorAll('.bi-par').length, 0);
    const quebrados = pgs.reduce((s, p) => s + [...p.querySelectorAll('.bi-par')].filter((x) => !x.querySelector(':scope > .bi-pt') || !x.querySelector(':scope > .bi-tr')).length, 0);
    const altura = pgs.map((p, i) => { const c = p.querySelector('.page-content'); return c.scrollHeight > c.clientHeight + 1 ? i + 1 : null; }).filter(Boolean);
    // As páginas FIXAS (fora do paginador) também: a apresentação em duas colunas passava do rodapé e este teste só olhava as
    // geradas — o usuário viu no PDF em espanhol (24/11/2026).
    const fixasTransbordando = [...document.querySelectorAll('.proposal-page:not([data-generated]) .page-content')]
      .filter((c) => c.offsetParent !== null && c.scrollHeight > c.clientHeight + 1)
      .map((c) => (c.classList.contains('pres-page-content') ? 'apresentacao' : (c.closest('.proposal-page').id || 'fixa')));
    const largura = [];
    pgs.forEach((p, i) => { const lim = p.querySelector('.page-content').getBoundingClientRect().right + 1; p.querySelectorAll('table, .bi-par, h2, h3').forEach((el) => { if (el.getBoundingClientRect().right > lim) largura.push(`p${i + 1} ${el.tagName}`); }); });
    const celulas = [...document.querySelectorAll('.proposal-page[data-generated="1"] .bi-tabela td, .proposal-page[data-generated="1"] .bi-tabela th')]
      .filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent.trim().slice(0, 25));
    const linhasPartidas = [];
    pgs.forEach((p, i) => p.querySelectorAll('.bi-tabela tbody tr').forEach((tr) => {
      const cols = [...tr.querySelectorAll('td')].reduce((s, td) => s + (Number(td.getAttribute('colspan')) || 1), 0);
      const esperado = tr.closest('.bi-tabela-precos') ? 10 : 4;
      if (cols !== esperado) linhasPartidas.push(`p${i + 1}: ${cols}`);
    }));
    const fora = [];
    pgs.forEach((p, i) => {
      const w = document.createTreeWalker(p.querySelector('.page-stack') || p.querySelector('.page-content'), NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) {
        const t = n.textContent.trim(); if (!t) continue;
        if (n.parentElement.closest('.bi-pt, .bi-tr, table, .signature-grid, .campo-manual, .cover-strip-titulo')) continue;
        if (/^[\d\s.,/%:–-]+$/.test(t)) continue;
        fora.push(`p${i + 1}: ${t.slice(0, 50)}`);
      }
    });
    const textoPt = pgs.map((p) => [...p.querySelectorAll('.bi-pt')].map((e) => e.textContent).join(' ')).join(' ');
    const posicoes = Array.from({ length: 140 }, (_, i) => textoPt.indexOf(`Frase ${i + 1} de um`));
    const frasesNaOrdem = posicoes.every((p, i) => p >= 0 && (i === 0 || p > posicoes[i - 1]))
      && Array.from({ length: 140 }, (_, i) => textoPt.split(`Frase ${i + 1} de um`).length - 1).every((n) => n === 1);
    const gigantes = [...document.querySelectorAll('.proposal-page[data-generated="1"] .bi-par')].filter((x) => x.textContent.includes('Frase 140 de um'));
    const toc = document.getElementById('tocPage');
    const titulosToc = [...document.querySelectorAll('#tocList .toc-title')].map((e) => e.textContent);
    const paginasDaTabelaDePrecos = new Set([...document.querySelectorAll('.proposal-page[data-generated="1"] .bi-tabela-precos')]
      .map((t) => t.closest('.proposal-page'))).size;
    return {
      paginas: pgs.length, fonte, nasPaginas, quebrados, altura, fixasTransbordando, largura, celulas, linhasPartidas, fora, paginasDaTabelaDePrecos, frasesNaOrdem,
      gigante: gigantes.map((g) => ({ tem140: g.textContent.includes('Frase 140 de um'), tem1: g.textContent.includes('Frase 1 de um') })),
      tocVisivel: toc && getComputedStyle(toc).display !== 'none', titulosToc,
    };
  });
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const casos = [
      ['projetoConceitual', { idioma: 'en', moeda: 'USD', incoterm: 'FOB – Porto de Santos' }],
      ['equipamento', { idioma: 'es', moeda: 'EUR' }],
      ['pecas', { idioma: 'en' }],
      ['milhao', { idioma: 'en', moeda: 'USD' }],
      ['milhao', { idioma: 'es', moeda: 'EUR' }],
      ['muitos', { idioma: 'en', moeda: 'USD' }],
    ];
    for (const [nome, extra] of casos) {
      console.log(`\n${nome} ${extra.idioma}/${extra.moeda || 'BRL'}`);
      const r = await medir(browser, htmlDoCaso(nome, extra, true));
      checar(r.paginas > 3, `paginou (${r.paginas} páginas)`);
      checar(r.fonte > 10 && r.fonte === r.nasPaginas && r.quebrados === 0, `BI-P01 ${r.fonte} pares na fonte, ${r.nasPaginas} nas páginas, ${r.quebrados} partidos`);
      checar(r.altura.length === 0, `BI-P02 nenhuma página transborda na altura ${r.altura.join(',')}`);
      checar(r.fixasTransbordando.length === 0, `BI-P02 nenhuma página fixa (apresentação, sumário) passa do rodapé ${r.fixasTransbordando.join(',')}`);
      checar(r.largura.length === 0, `BI-P02 nada passa da margem direita ${r.largura.slice(0, 3).join(',')}`);
      checar(r.celulas.length === 0, `BI-P02 nenhuma célula vaza ${r.celulas.slice(0, 3).join(' | ')}`);
      checar(r.linhasPartidas.length === 0, `BI-P03 nenhuma linha de tabela partida ${r.linhasPartidas.join(',')}`);
      if (nome === 'muitos') checar(r.paginasDaTabelaDePrecos > 1, `BI-P03 a tabela de preços atravessou ${r.paginasDaTabelaDePrecos} páginas (o caso existe)`);
      checar(r.fora.length === 0, `BI-P04 todo texto numa metade ${r.fora.slice(0, 3).join(' | ')}`);
      checar(r.titulosToc.length > 3 && r.titulosToc.every((t) => !/SCOPE|GENERAL TERMS|ALCANCE|CONDICIONES/.test(t)), `BI-P06 sumário só com a metade PT (${r.titulosToc.length} linhas)`);
      // Sumário maior que a página é escondido pela regra que já existia (não é do bilíngue): visível no bilíngue = visível no pt-BR.
      const rPt = await medir(browser, htmlDoCaso(nome, { moeda: extra.moeda }, true));
      checar(r.tocVisivel === rPt.tocVisivel, `BI-P06 sumário ${r.tocVisivel ? 'visível' : 'escondido'} como no pt-BR (${rPt.titulosToc.length} linhas lá)`);
    }
    console.log('\ngigante en (um parágrafo maior que uma página)');
    const g = await medir(browser, htmlDoCaso('gigante', { idioma: 'en' }, true));
    // Fase 5, 6: um par maior que a página ficava inteiro e o overflow da página CORTAVA o texto. Agora o parágrafo longo vira vários
    // pares (por frase): todas as frases aparecem, em ordem, e nenhuma página transborda.
    checar(g.altura.length === 0, `BI-P05 nenhuma página transborda com o parágrafo gigante ${g.altura.join(',')}`);
    checar(g.frasesNaOrdem, 'BI-P05 as 140 frases aparecem nas páginas, em ordem, cada uma uma vez');
    checar(g.fonte === g.nasPaginas && g.quebrados === 0, `BI-P01 ${g.fonte} pares, todos inteiros`);
  } finally {
    await browser.close();
  }
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
