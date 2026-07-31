/**
 * Otimizacao de imagem no upload.
 *
 * Medido numa proposta real (30/07/2026): 21 imagens, 25,71 MB de HTML, 13,7 s por PDF -
 * 8,8 s so para carregar o HTML e 4,0 s para renderizar. 94% do tempo era peso de imagem.
 * O PDF saia com 17,4 MB.
 *
 * A pergunta que este teste responde e a que o usuario fez: "o sharp nao vai cagar nada das
 * minhas regras para o pdf?". A resposta so vale com prova, porque o tamanho na pagina vem
 * do CSS (largura em mm ou %) com height: auto - ou seja, a ALTURA renderizada e derivada da
 * PROPORCAO da imagem. Se a proporcao mudasse, a altura mudaria, e a paginacao junto.
 *
 * Por isso os dois grupos de checagem: (1) a proporcao sobrevive ao redimensionamento, e
 * (2) o documento sai com as MESMAS paginas e o MESMO texto usando a imagem otimizada.
 *
 * Executar: node tests/otimizarImagem.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { otimizarImagem, LARGURA_MAXIMA, SUFIXO_ORIGINAL } = require('../services/otimizarImagem');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otim-img-'));
const arq = (n) => path.join(dir, n);

// Foto "de camera": grande e com conteudo variado, para o JPEG nao comprimir a nada.
async function criarFoto(nome, largura, altura) {
  const canal = Buffer.alloc(largura * altura * 3);
  for (let i = 0; i < canal.length; i += 3) {
    const p = i / 3;
    canal[i] = (p * 7) % 256;
    canal[i + 1] = (p * 13) % 256;
    canal[i + 2] = ((p % largura) * 3) % 256;
  }
  const destino = arq(nome);
  await sharp(canal, { raw: { width: largura, height: altura, channels: 3 } })
    .jpeg({ quality: 95 }).toFile(destino);
  return destino;
}

(async () => {
  console.log('\n[reducao] foto grande encolhe de verdade');
  const foto = await criarFoto('foto.jpg', 3000, 2000);
  const antes = fs.statSync(foto).size;
  const metaAntes = await sharp(foto).metadata();
  const r = await otimizarImagem(foto);
  const metaDepois = await sharp(foto).metadata();

  t('a imagem foi otimizada', () => assert(r.otimizada, r.motivo || 'nao otimizou'));
  t(`largura cai para o teto de ${LARGURA_MAXIMA}px`,
    () => assert.strictEqual(metaDepois.width, LARGURA_MAXIMA));
  t('o arquivo fica menor', () => assert(fs.statSync(foto).size < antes,
    `${fs.statSync(foto).size} deveria ser < ${antes}`));

  console.log('\n[proporcao] e o que garante que a paginacao nao muda');
  const propAntes = metaAntes.width / metaAntes.height;
  const propDepois = metaDepois.width / metaDepois.height;
  t('proporcao preservada (altura em height:auto nao muda)',
    () => assert(Math.abs(propAntes - propDepois) < 0.001,
      `antes ${propAntes.toFixed(6)} x depois ${propDepois.toFixed(6)}`));
  // Traduzindo para o documento: uma foto com 80mm de largura renderiza a MESMA altura.
  const alturaAntes = 80 / propAntes;
  const alturaDepois = 80 / propDepois;
  t('a 80mm de largura, a altura renderizada muda menos de 0,05mm',
    () => assert(Math.abs(alturaAntes - alturaDepois) < 0.05,
      `${alturaAntes.toFixed(4)}mm x ${alturaDepois.toFixed(4)}mm`));

  console.log('\n[original] nunca e destruido');
  t('o original fica ao lado, com sufixo .original',
    () => assert(fs.existsSync(foto + SUFIXO_ORIGINAL)));
  t('e continua sendo o arquivo grande',
    () => assert.strictEqual(fs.statSync(foto + SUFIXO_ORIGINAL).size, antes));
  const metaOriginal = await sharp(foto + SUFIXO_ORIGINAL).metadata();
  t('com a resolucao original intacta', () => assert.strictEqual(metaOriginal.width, 3000));

  console.log('\n[idempotencia] rodar de novo nao degrada a imagem');
  const tamanho1 = fs.statSync(foto).size;
  const r2 = await otimizarImagem(foto);
  t('a segunda passada nao mexe no arquivo', () => {
    assert(!r2.otimizada, 'otimizou de novo');
    assert.strictEqual(fs.statSync(foto).size, tamanho1);
  });

  console.log('\n[bom senso] nao mexe no que nao precisa');
  const pequena = await criarFoto('pequena.jpg', 600, 400);
  const tamPequena = fs.statSync(pequena).size;
  const rp = await otimizarImagem(pequena);
  t('imagem ja pequena e deixada em paz', () => {
    assert(!rp.otimizada, 'mexeu numa imagem pequena');
    assert.strictEqual(fs.statSync(pequena).size, tamPequena);
  });
  t('e nao cria .original para ela', () => assert(!fs.existsSync(pequena + SUFIXO_ORIGINAL)));

  console.log('\n[robustez] falhar em otimizar nao pode derrubar o upload');
  const naoImagem = arq('arquivo.txt');
  fs.writeFileSync(naoImagem, 'nao sou imagem');
  const rt = await otimizarImagem(naoImagem);
  t('arquivo que nao e imagem: devolve motivo, sem lancar', () => assert(!rt.otimizada && rt.motivo));
  const inexistente = await otimizarImagem(arq('nao-existe.jpg'));
  t('arquivo inexistente: devolve motivo, sem lancar', () => assert(!inexistente.otimizada && inexistente.motivo));
  t('o arquivo que nao e imagem continua intacto',
    () => assert.strictEqual(fs.readFileSync(naoImagem, 'utf8'), 'nao sou imagem'));

  console.log('\n[documento] o PDF sai com as MESMAS paginas e o MESMO texto');
  const puppeteer = require('puppeteer');
  const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
  const { getClausulasDefault } = require('../clausulasDefault');
  const comoDataUrl = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');

  const montar = (dataUrl) => {
    const itens = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1, produto_nome: `EQ ${i + 1}`, descricao: `EQ ${i + 1}`, quantidade: 1, unidade: 'UN',
      valor_unitario: 1000, valor_total: 1000, familia_produto: 'TESTE',
      produto_imagem: dataUrl,
      especificacoes_tecnicas: JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, j) => [`k${j}`, `V${j}`]))),
    }));
    const labels = Object.fromEntries(Array.from({ length: 30 }, (_, j) => [`k${j}`, { nome: `VAR ${j}` }]));
    return gerarHTMLPropostaPremiumV2(
      { numero_proposta: 'X', titulo: 'T', razao_social: 'C' }, itens,
      { total: 3000, dataEmissao: '30/07/2026' },
      { clausulas_custom: getClausulasDefault(), variaveis_proposta_por_familia: { TESTE: Object.keys(labels) }, variaveis_proposta_labels: labels },
      null, true, true
    );
  };

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  const medir = async (html) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((i) => (i.complete ? 0 : new Promise((r) => {
        i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true });
      }))));
    });
    await page.evaluate(() => window.paginateProposalContent && window.paginateProposalContent());
    const dados = await page.evaluate(() => ({
      paginas: document.querySelectorAll('.proposal-page[data-generated="1"]').length,
      texto: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
    }));
    await page.close();
    return dados;
  };

  const comOriginal = await medir(montar(comoDataUrl(foto + SUFIXO_ORIGINAL)));
  const comOtimizada = await medir(montar(comoDataUrl(foto)));
  await browser.close();

  t('mesmo numero de paginas', () => assert.strictEqual(comOtimizada.paginas, comOriginal.paginas,
    `original ${comOriginal.paginas} x otimizada ${comOtimizada.paginas}`));
  t('mesmo texto renderizado', () => assert.strictEqual(comOtimizada.texto, comOriginal.texto));
  console.log(`       (${comOriginal.paginas} paginas, ${comOriginal.texto.length} caracteres nos dois)`);

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n${ok}/${total} checagens`);
  console.log(ok === total ? '0 failed' : `${total - ok} failed`);
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
