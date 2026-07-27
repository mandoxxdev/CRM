/**
 * REGRESSAO — peso do PDF da proposta (27/07/2026).
 *
 * CAUSA RAIZ do PDF de ~2.4MB: o Chrome copia um JPEG para dentro do PDF sem tocar nos
 * bytes (filtro DCTDecode), mas WebP e PNG ele decodifica e regrava como bitmap comprimido
 * em Flate — que nao comprime foto. Medido antes da correcao:
 *     industria40.webp  123 KB no disco -> 1161 KB dentro do PDF  (9.4x)
 *     projetos.webp      45 KB no disco ->  712 KB dentro do PDF (15.9x)
 * Essas duas imagens sozinhas eram 1.87MB dos 2.44MB do arquivo.
 *
 * CONTRATO TRAVADO AQUI:
 *   P1 — no PDF as fotos entram como JPEG (ha um gemeo .jpg no disco e ele e usado).
 *   P2 — o PREVIEW continua usando o WebP por URL (mais leve na rede; ganho do b8429e2).
 *   P3 — os logos NAO viram JPEG: precisam de transparencia.
 *   P4 — teto de peso do PDF gerado de fato, para pegar qualquer asset novo que infle.
 *
 * Executar: node tests/propostaPdfPesoImagens.test.js  (usa puppeteer)
 */
const fs = require('fs');
const path = require('path');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const ASSETS = path.join(__dirname, '..', 'assets', 'proposta');
// Fotos: devem ter gemeo .jpg, porque em Flate elas explodem o PDF.
const FOTOS = ['industria40', 'projetos'];
// Logos: transparencia; em JPEG ganhariam fundo solido. Nao podem ter gemeo .jpg.
const LOGOS = ['logo-gmp', 'logo-gmp-grande', 'logo-moinho-ypiranga'];
const TETO_PDF_MB = 1.3; // medido em 0.80MB apos a correcao; era 2.44MB antes

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

(async () => {
  // ---- P1/P3: gemeos .jpg existem para foto e NAO existem para logo ----
  FOTOS.forEach((nome) => {
    checar(fs.existsSync(path.join(ASSETS, nome + '.jpg')), `P1: existe o gemeo ${nome}.jpg (sem ele o PDF infla ~10x)`);
  });
  LOGOS.forEach((nome) => {
    checar(!fs.existsSync(path.join(ASSETS, nome + '.jpg')), `P3: ${nome} NAO tem gemeo .jpg (perderia a transparencia)`);
  });

  // ---- P1: o HTML do PDF embute as fotos como JPEG ----
  const htmlPdf = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, true, true);
  checar(htmlPdf.includes('data:image/jpeg;base64,'), 'P1: HTML do PDF embute imagem JPEG');
  checar(!htmlPdf.includes('data:image/webp;base64,'), 'P1: HTML do PDF nao embute nenhum WebP (viraria bitmap Flate)');

  // ---- P2: o preview segue no WebP por URL ----
  const htmlPreview = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, 'http://x', false, true);
  FOTOS.forEach((nome) => {
    checar(htmlPreview.includes(`/api/assets/proposta/${nome}.webp?v=`), `P2: preview referencia ${nome}.webp por URL`);
  });
  checar(!htmlPreview.includes('data:image/'), 'P2: preview nao embute imagem em base64');

  // ---- P4: peso real do PDF ----
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
  await page.setContent(htmlPdf, { waitUntil: ['load', 'domcontentloaded'], timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { if (window.paginateProposalContent) window.paginateProposalContent(); });
  await new Promise(r => setTimeout(r, 400));
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  await browser.close();

  const mb = pdf.length / 1048576;
  checar(mb <= TETO_PDF_MB, `P4: PDF com ${mb.toFixed(2)}MB (teto ${TETO_PDF_MB}MB)`);

  // Diagnostico util quando P4 falhar: qual filtro cada imagem usou.
  const s = Buffer.from(pdf).toString('latin1');
  const flateGrandes = (s.match(/\/Subtype\s*\/Image[\s\S]{0,400}?\/Length\s+(\d+)/g) || [])
    .filter(b => /FlateDecode/.test(b) && parseInt((/\/Length\s+(\d+)/.exec(b) || [])[1], 10) > 300 * 1024);
  checar(flateGrandes.length === 0, `P4: nenhuma imagem Flate acima de 300KB (${flateGrandes.length} encontrada(s) — provavel WebP/PNG fotografico sem gemeo .jpg)`);

  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
