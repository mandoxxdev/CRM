/**
 * #3 — O hero da capa (industria40.png) deve preencher 100% da largura, sem
 * faixa branca vertical a esquerda. Verifica por pixel no screenshot.
 * Executar: node tests/propostaCapaHero.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const puppeteer = require('puppeteer');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, [], { total: 0, dataEmissao: '22/07/2026' }, null, null, false, true);
  const tmp = path.join(os.tmpdir(), 'capahero.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 1 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // geometria: img do hero deve comecar no x da pagina e ter a mesma largura
  const geo = await page.evaluate(() => {
    const pageEl = document.querySelector('.proposal-page.cover-page');
    const hero = document.querySelector('.cover-hero');
    const img = document.querySelector('.cover-hero img');
    if (!pageEl || !hero || !img) return null;
    const pr = pageEl.getBoundingClientRect(), hr = hero.getBoundingClientRect(), ir = img.getBoundingClientRect();
    return { pageX: pr.x, pageW: pr.width, heroX: hr.x, heroW: hr.width, imgX: ir.x, imgW: ir.width };
  });
  console.log('geometria:', JSON.stringify(geo));
  let failed = 0;
  if (!geo) { console.error('✗ capa/hero/img nao encontrados'); process.exit(1); }
  if (Math.abs(geo.imgX - geo.pageX) > 0.6) { console.error(`✗ img comeca ${(geo.imgX - geo.pageX).toFixed(2)}px depois da borda da pagina`); failed++; }
  if (Math.abs((geo.imgX + geo.imgW) - (geo.pageX + geo.pageW)) > 0.6) { console.error('✗ img nao alcanca a borda direita'); failed++; }

  // screenshot do hero para inspecao (e pixel-check se pngjs disponivel)
  const heroEl = await page.$('.cover-hero');
  const shot = path.join(os.tmpdir(), 'capahero.png');
  await heroEl.screenshot({ path: shot });
  console.log('screenshot:', shot);
  if (PNG) {
    const png = PNG.sync.read(fs.readFileSync(shot));
    let brancoX0 = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (png.width * y) * 4;
      if (png.data[i] > 245 && png.data[i + 1] > 245 && png.data[i + 2] > 245) brancoX0++;
    }
    const frac = brancoX0 / png.height;
    console.log(`pixels brancos na coluna x=0: ${(frac * 100).toFixed(1)}%`);
    if (frac > 0.5) { console.error('✗ coluna x=0 majoritariamente branca (linha branca presente)'); failed++; }
  } else {
    console.log('(pngjs indisponivel — geometria + inspecao visual do screenshot)');
  }
  await browser.close();
  console.log(failed ? `\n${failed} FALHA(S)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
