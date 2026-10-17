/**
 * #3 — O hero da capa (industria40) deve preencher 100% da largura, sem
 * faixa branca vertical a esquerda. Verifica por geometria e por pixel no screenshot,
 * nos DOIS caminhos: preview (imagem por URL) e PDF (JPEG embutido, forPdfServer).
 *
 * Etapa 139 (RN-139.03): este teste estava ERRADO desde o b8429e2d (22/07/2026). O preview passou a pedir
 * o hero por URL de http://localhost:5000 e o teste abria o HTML como arquivo sem servidor: sem `npm run dev`
 * de pé a imagem não carregava, o screenshot era o texto alternativo sobre branco e o teste acusava
 * "linha branca" (94,6% da coluna 0) num documento certo — mandando alguém aparar a imagem de novo
 * (armadilha 6). Agora ele serve os próprios assets (helpers/servirAssetsProposta.js) e diz
 * "não carregou" quando é isso. A régua do pixel (<= 50% de brancos na coluna 0) não mudou.
 * Executar: node tests/propostaCapaHero.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { servirAssetsProposta } = require('./helpers/servirAssetsProposta');
const puppeteer = require('puppeteer');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };

async function medir(browser, baseURL, forPdfServer, rotulo) {
  let failed = 0;
  const falha = (msg) => { console.error(`✗ [${rotulo}] ${msg}`); failed++; };
  const html = gerarHTMLPropostaPremiumV2(proposta, [], { total: 0, dataEmissao: '22/07/2026' }, null, baseURL, forPdfServer, true);
  const tmp = path.join(os.tmpdir(), `capahero-${rotulo}.html`); fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 1 });
  await page.goto('file:///' + tmp.split(path.sep).join('/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // geometria: img do hero deve comecar no x da pagina e ter a mesma largura
  const geo = await page.evaluate(() => {
    const pageEl = document.querySelector('.proposal-page.cover-page');
    const hero = document.querySelector('.cover-hero');
    const img = document.querySelector('.cover-hero img');
    if (!pageEl || !hero || !img) return null;
    const pr = pageEl.getBoundingClientRect(), hr = hero.getBoundingClientRect(), ir = img.getBoundingClientRect();
    return { pageX: pr.x, pageW: pr.width, heroX: hr.x, heroW: hr.width, imgX: ir.x, imgW: ir.width,
      carregou: img.complete && img.naturalWidth > 0, naturalWidth: img.naturalWidth, src: String(img.getAttribute('src') || '').slice(0, 60) };
  });
  console.log(`[${rotulo}] geometria:`, JSON.stringify(geo));
  if (!geo) { falha('capa/hero/img nao encontrados'); await page.close(); return failed; }
  if (!geo.carregou) { falha(`imagem do hero não carregou (naturalWidth ${geo.naturalWidth}, src ${geo.src})`); await page.close(); return failed; }
  if (Math.abs(geo.imgX - geo.pageX) > 0.6) falha(`img comeca ${(geo.imgX - geo.pageX).toFixed(2)}px depois da borda da pagina`);
  if (Math.abs((geo.imgX + geo.imgW) - (geo.pageX + geo.pageW)) > 0.6) falha('img nao alcanca a borda direita');

  // screenshot do hero para inspecao (e pixel-check se pngjs disponivel)
  const heroEl = await page.$('.cover-hero');
  const shot = path.join(os.tmpdir(), `capahero-${rotulo}.png`);
  await heroEl.screenshot({ path: shot });
  console.log(`[${rotulo}] screenshot:`, shot);
  if (PNG) {
    const png = PNG.sync.read(fs.readFileSync(shot));
    let brancoX0 = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (png.width * y) * 4;
      if (png.data[i] > 245 && png.data[i + 1] > 245 && png.data[i + 2] > 245) brancoX0++;
    }
    const frac = brancoX0 / png.height;
    console.log(`[${rotulo}] pixels brancos na coluna x=0: ${(frac * 100).toFixed(1)}%`);
    if (frac > 0.5) falha('coluna x=0 majoritariamente branca (linha branca presente)');
  } else {
    console.log('(pngjs indisponivel — geometria + inspecao visual do screenshot)');
  }
  await page.close();
  return failed;
}

(async () => {
  const assets = await servirAssetsProposta();
  const browser = await puppeteer.launch({ headless: 'new' });
  let failed = 0;
  try {
    failed += await medir(browser, assets.baseURL, false, 'preview');
    failed += await medir(browser, assets.baseURL, true, 'pdf');
  } finally {
    await browser.close();
    await assets.fechar();
  }
  console.log(failed ? `\n${failed} FALHA(S)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
