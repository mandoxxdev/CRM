/**
 * Pagina da clausula 5.24 — 27/07/2026.
 *
 * Layout em TRES faixas na altura da pagina:
 *   A1 — texto da 5.24 no topo
 *   A2 — campos de preenchimento manual no meio
 *   A3 — assinaturas junto ao rodape
 *   A4 — os dois campos manuais existem e estao em NEGRITO
 *   A5 — o filete de "Assinatura e carimbo" corre ate a margem direita
 *
 * Roda nos DOIS ramos (clausulas do banco e secoes fixas do template), que antes
 * divergiam: o ramo do banco nem tinha os campos de preenchimento manual.
 *
 * Executar: node tests/proposta524PaginaAssinatura.test.js  (usa puppeteer)
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

async function medir(browser, templateConfig) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, true, true);
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.setContent(html, { waitUntil: ['load', 'domcontentloaded'], timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const r = await page.evaluate(() => {
    const pgs = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'));
    const idx = pgs.findIndex(p => p.querySelector('.pagina-assinatura'));
    if (idx < 0) return { ausente: true };
    const pg = pgs[idx];
    const cont = pg.querySelector('.page-content').getBoundingClientRect();
    const zona = (sel) => {
      const el = pg.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { doTopo: b.top - cont.top, doRodape: cont.bottom - b.bottom };
    };
    // A margem util e a CAIXA DE CONTEUDO: getBoundingClientRect do .page-content inclui o
    // padding lateral (14mm ~ 53px), entao medir contra cont.right acusaria 53px de sobra
    // mesmo com o filete encostado na margem.
    const padDir = parseFloat(getComputedStyle(pg.querySelector('.page-content')).paddingRight) || 0;
    const margemDireita = cont.right - padDir;
    const campos = Array.from(pg.querySelectorAll('.campo-manual')).map(el => ({
      texto: (el.textContent || '').trim(),
      peso: Number(getComputedStyle(el).fontWeight),
      direita: margemDireita - el.getBoundingClientRect().right,
    }));
    return {
      ausente: false,
      pagina: idx + 1, ultima: idx === pgs.length - 1,
      alturaUtil: cont.height,
      topo: zona('.assinatura-topo'), meio: zona('.assinatura-meio'), rodape: zona('.assinatura-rodape'),
      campos,
      temAssinaturas: !!pg.querySelector('.signature-grid'),
    };
  });
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [cfg, rotulo] of [[{ clausulas_custom: custom }, 'clausulas do banco'], [null, 'secoes fixas do template']]) {
    const r = await medir(browser, cfg);
    console.log(`\n[${rotulo}]`);
    checar(!r.ausente, `${rotulo}: pagina .pagina-assinatura existe`);
    if (r.ausente) continue;

    // A1/A2/A3 — as tres faixas na ordem e nas posicoes certas
    const terco = r.alturaUtil / 3;
    checar(r.topo && r.topo.doTopo < terco, `A1: texto da 5.24 no topo (${Math.round(r.topo.doTopo)}px do topo)`);
    checar(r.meio && r.meio.doTopo > terco * 0.5 && r.meio.doRodape > terco * 0.3,
      `A2: campos manuais no meio (${Math.round(r.meio.doTopo)}px do topo, ${Math.round(r.meio.doRodape)}px do rodape)`);
    checar(r.rodape && r.rodape.doRodape < terco * 0.5,
      `A3: assinaturas junto ao rodape (${Math.round(r.rodape.doRodape)}px do rodape)`);
    checar(r.temAssinaturas && r.ultima, `A3: bloco de assinaturas presente e na ULTIMA pagina`);

    // A4 — os dois campos, em negrito
    checar(r.campos.length === 2, `A4: os dois campos manuais presentes (achados: ${r.campos.length})`);
    const temData = r.campos.some(c => /^Data da assinatura:/.test(c.texto));
    const temCarimbo = r.campos.some(c => /^Assinatura e carimbo da empresa CONTRATANTE:/.test(c.texto));
    checar(temData, 'A4: campo "Data da assinatura"');
    checar(temCarimbo, 'A4: campo "Assinatura e carimbo da empresa CONTRATANTE"');
    const leves = r.campos.filter(c => c.peso < 700).map(c => `${c.texto.slice(0, 22)} (${c.peso})`);
    checar(leves.length === 0, `A4: ambos em negrito >=700 (fora: ${leves.join(', ') || 'nenhum'})`);

    // A5 — o filete vai ate a margem
    const carimbo = r.campos.find(c => /carimbo/.test(c.texto));
    checar(carimbo && Math.abs(carimbo.direita) <= 2,
      `A5: filete da assinatura chega a margem direita (sobra ${carimbo ? Math.round(carimbo.direita) : '?'}px)`);
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
