/**
 * REGRESSAO — bug relatado na proposta 87 (27/07/2026):
 *   "a clausula 1 esta na mesma pagina da tabela de dados cadastrais da contratada,
 *    sumindo no rodape, e a proxima pagina ja pula pra clausula 5"
 *
 * CAUSA RAIZ: a altura do bloco DADOS DA CONTRATADA vinha inteiramente da imagem
 * dados-contratada.png, que no preview e carregada por URL (nao base64). Enquanto a
 * imagem nao chega — ou se ela 404 — o <img> mede ~0px, o bloco "cabe" numa fracao da
 * pagina e o paginador puxa as secoes 1..4 para junto dele. Quando a imagem materializa
 * sua altura real, esse conteudo e empurrado para baixo do rodape e o overflow:hidden da
 * pagina o corta: as secoes somem e a pagina seguinte parece "pular" para a secao 5.
 *
 * CONTRATO TRAVADO AQUI:
 *   T1 — a tabela DADOS DA CONTRATADA ocupa uma pagina inteira, sozinha.
 *   T2 — nenhum bloco ultrapassa o rodape (nada e cortado por overflow:hidden).
 *   T3 — todo titulo da fonte fica VISIVEL em alguma pagina (nada some).
 * Os tres sao verificados nos DOIS estados da imagem: carregada e indisponivel (404),
 * porque so o segundo reproduz a condicao do bug.
 *
 * Executar: node tests/propostaTabelaContratadaPaginaPropria.test.js  (usa puppeteer)
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '058-02-MH-2026-REV00', titulo: 'TESTT', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'TEST', descricao: 'TEST', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

const ALVO_IMG = /dados-contratada\.(png|webp|jpe?g)/;

async function medir(browser, { imagem }) {
  // baseURL fixa: no preview os assets vao por URL, que e exatamente o cenario do bug.
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, 'http://localhost:5000', false, true);
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1400 });
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (ALVO_IMG.test(req.url())) {
      if (imagem === 'ausente') return req.respond({ status: 404, body: 'indisponivel' }).catch(() => {});
      // 'tardia': a resposta so chega depois que a paginacao ja mediu as alturas.
      if (imagem === 'tardia') await new Promise(r => setTimeout(r, 3000));
    }
    req.continue().catch(() => {});
  });

  if (imagem === 'tardia') {
    // Nao esperar 'load' (que aguardaria a imagem): pagina com ela ainda pendente,
    // exatamente como acontece quando o asset demora a chegar pela rede.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => { if (window.paginateProposalContent) window.paginateProposalContent(); });
    await new Promise(r => setTimeout(r, 5000)); // imagem chega e o layout assenta
  } else {
    await page.setContent(html, { waitUntil: ['load', 'domcontentloaded'], timeout: 60000 });
    await new Promise(r => setTimeout(r, 1500));
  }

  const r = await page.evaluate(() => {
    const TOL = 3;
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'))
      .filter(p => p.style.display !== 'none');
    const src = document.getElementById('proposalSource');
    const titulosFonte = Array.from(src.querySelectorAll('h2, h3'))
      .map(h => (h.textContent || '').trim()).filter(Boolean);

    let acompanhantesDaTabela = null;
    const foraDoRodape = [];
    const titulosVisiveis = [];

    gen.forEach((pg, i) => {
      const c = pg.querySelector('.page-content');
      if (!c) return;
      const cr = c.getBoundingClientRect();
      Array.from(c.querySelectorAll('h2, h3, p, img, table, li')).forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.height > 0 && b.bottom > cr.bottom + TOL) {
          foraDoRodape.push(`pag${i + 1} ${el.tagName}: ${(el.textContent || el.alt || '').trim().slice(0, 45)}`);
        }
      });
      Array.from(c.querySelectorAll('h2, h3')).forEach((el) => {
        if (el.getBoundingClientRect().bottom <= cr.bottom + TOL) titulosVisiveis.push((el.textContent || '').trim());
      });
      if (c.querySelector('img[alt*="Dados Cadastrais"], p.cover-strip-titulo')) {
        const juntos = Array.from(c.querySelectorAll('h2, h3')).map(h => (h.textContent || '').trim());
        if (acompanhantesDaTabela === null) acompanhantesDaTabela = juntos;
      }
    });

    return {
      paginas: gen.length,
      acompanhantesDaTabela,
      foraDoRodape,
      titulosSumidos: titulosFonte.filter(t => !titulosVisiveis.includes(t)),
    };
  });
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let falhas = 0;
  const checar = (cond, msg) => { if (cond) { console.log('  ✓ ' + msg); } else { console.log('  ✗ ' + msg); falhas++; } };

  const cenarios = [
    ['presente', 'imagem carregada (controle)'],
    ['ausente', 'imagem INDISPONIVEL / 404 (condicao do bug)'],
    ['tardia', 'imagem chega DEPOIS da paginacao (condicao do bug)'],
  ];
  for (const [imagem, rotulo] of cenarios) {
    const r = await medir(browser, { imagem });
    console.log(`\n[${rotulo}] ${r.paginas} paginas geradas`);

    checar(r.acompanhantesDaTabela !== null, 'T0: a pagina da tabela DADOS DA CONTRATADA existe');
    checar(
      Array.isArray(r.acompanhantesDaTabela) && r.acompanhantesDaTabela.length === 0,
      `T1: tabela DADOS DA CONTRATADA sozinha na pagina (encontrado junto: ${JSON.stringify(r.acompanhantesDaTabela)})`
    );
    checar(
      r.foraDoRodape.length === 0,
      `T2: nada ultrapassa o rodape (${r.foraDoRodape.length} elemento(s): ${r.foraDoRodape.slice(0, 3).join(' /// ')})`
    );
    checar(
      r.titulosSumidos.length === 0,
      `T3: nenhum titulo some (${r.titulosSumidos.length} sumido(s): ${r.titulosSumidos.slice(0, 6).join(' | ')})`
    );
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
