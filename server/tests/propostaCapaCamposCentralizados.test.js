/**
 * Campos do cliente CENTRALIZADOS na capa — 27/07/2026.
 *
 * Armadilha que este teste existe para pegar: centralizar so no container
 * (.cover-client-info { text-align: center }) NAO funciona. A regra global
 * "p, li { text-align: justify }" casa DIRETAMENTE com cada <p> do bloco, e valor
 * herdado sempre perde para uma regra que casa direto — o center pegava apenas no
 * <span> do nome do cliente, e os demais campos continuavam a esquerda.
 *
 * Por isso a verificacao mede a POSICAO renderizada, e nao a presenca da regra CSS:
 *   C1 — text-align computado = center em todos os campos
 *   C2 — o centro de cada campo coincide com o centro do bloco (tolerancia 2px)
 *   C3 — formato rotulo em cima / valor embaixo: o .cover-field-rotulo e display:block
 *        (e o que força a quebra) e o campo ocupa 2 linhas de fato
 *   C4 — nenhum <p> aninhado dentro de outro <p> no bloco: era o markup do campo
 *        "EMPRESA CONTRATANTE", invalido, e o parser jogava o nome do cliente para fora
 *        do campo — o alinhamento quebrava so naquele item
 *   C7 — a data de emissao vem logo abaixo dos demais campos, com o MESMO espacamento
 *        entre eles (antes tinha um padding-top de 80px que a descolava do bloco)
 *   C6 — a capa NAO tem rodape (e folha de rosto: sem dados da empresa e sem "Pag. X/Y"),
 *        e isso nao desloca a numeracao das demais paginas — a capa continua contando no
 *        total, entao a pagina seguinte segue sendo a 2 de N
 *   C5 — a LOGO DO CLIENTE alinhada com os campos. Mesma armadilha por outro caminho: a
 *        regra global "img { display: block }" faz da logo um bloco, e bloco nao e
 *        centralizado por text-align — precisa de margin auto. A CAIXA da logo ja vinha
 *        centrada pelo align-items do .cover-info-area, o que disfarcava a imagem torta
 *        dentro dela (media 19px a esquerda). Por isso o teste mede a IMAGEM, nao a caixa.
 *
 * Roda nos dois caminhos (PDF e preview) porque a capa e a mesma nos dois.
 *
 * Executar: node tests/propostaCapaCamposCentralizados.test.js  (usa puppeteer)
 */
const fs = require('fs');
const path = require('path');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const { uploadsLogosDir } = require('../config/paths');
const puppeteer = require('puppeteer');

const CAMPOS = ['contratante', 'cnpj', 'email', 'telefone', 'emissao'];
const TOL_PX = 2;

// Logo de teste gravada no disco (o template le do uploadsLogosDir e embute em base64).
// Retangular de proposito: com a imagem quadrada e pequena o desalinhamento fica
// dentro da tolerancia e passaria despercebido.
const LOGO_ARQUIVO = '__test_logo_capa_centralizada.png';
const LOGO_CAMINHO = path.join(uploadsLogosDir, LOGO_ARQUIVO);
function criarLogo() {
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 240, height: 90 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 11; png.data[i + 1] = 58; png.data[i + 2] = 102; png.data[i + 3] = 255;
  }
  fs.mkdirSync(uploadsLogosDir, { recursive: true });
  fs.writeFileSync(LOGO_CAMINHO, PNG.sync.write(png));
}
// Chamado ANTES de cada process.exit, e não num .finally: process.exit encerra o processo
// na hora, sem esperar a microtask do finally — a logo de teste ficava para trás no volume.
function limparLogo() {
  try { fs.unlinkSync(LOGO_CAMINHO); } catch (_) { /* já removida */ }
}

const proposta = {
  numero_proposta: '058-02-MH-2026-REV00', titulo: 'TESTT',
  razao_social: 'CLIENTE TESTE LTDA', cnpj: '12.345.678/0001-90',
  cliente_email: 'contato@cliente.com.br', cliente_telefone: '(11) 98888-7777',
  cliente_logo_url: LOGO_ARQUIVO,
};
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

async function medir(browser, forPdfServer) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, 'http://localhost:5000', forPdfServer, true);
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.setContent(html, { waitUntil: ['load', 'domcontentloaded'], timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate((campos) => {
    const bloco = document.querySelector('.cover-client-info');
    if (!bloco) return null;
    const cb = bloco.getBoundingClientRect();
    const centroBloco = cb.left + cb.width / 2;
    return campos.map((k) => {
      const el = document.querySelector('.cover-field-' + k);
      if (!el) return { campo: k, ausente: true };
      const b = el.getBoundingClientRect();
      const rot = el.querySelector('.cover-field-rotulo');
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 0;
      return {
        campo: k,
        align: getComputedStyle(el).textAlign,
        desvio: Math.abs((b.left + b.width / 2) - centroBloco),
        rotuloDisplay: rot ? getComputedStyle(rot).display : null,
        linhas: lh > 0 ? Math.round(b.height / lh) : 0,
        pAninhado: !!el.querySelector('p'),
      };
    });
  }, CAMPOS);

  // C5 — a IMAGEM da logo (não a caixa dela) alinhada ao centro dos campos
  const logo = await page.evaluate(() => {
    const bloco = document.querySelector('.cover-client-info');
    const img = document.querySelector('.cover-client-logo img');
    if (!bloco || !img) return { ausente: true };
    const bb = bloco.getBoundingClientRect();
    const ib = img.getBoundingClientRect();
    return {
      ausente: false,
      largura: Math.round(ib.width),
      desvio: Math.abs((ib.left + ib.width / 2) - (bb.left + bb.width / 2)),
    };
  });

  // C7 — espacamento vertical entre campos consecutivos, na ordem do documento.
  // Mede entre as CAIXAS DE CONTEUDO, descontando o padding: getBoundingClientRect inclui o
  // padding, entao um padding-top no elemento empurra o TEXTO para baixo sem mexer no topo da
  // caixa — medindo so o rect, um espaco de 80px passaria batido.
  const espacos = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.cover-client-info > p'));
    const topoTexto = (el) => el.getBoundingClientRect().top + (parseFloat(getComputedStyle(el).paddingTop) || 0);
    const baseTexto = (el) => el.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(el).paddingBottom) || 0);
    const out = [];
    for (let i = 1; i < ps.length; i++) {
      out.push({
        campo: ps[i].className.replace('cover-field-', ''),
        gap: topoTexto(ps[i]) - baseTexto(ps[i - 1]),
      });
    }
    return out;
  });

  // C6 — capa sem rodape, sem quebrar a numeracao das outras paginas
  const capa = await page.evaluate(() => {
    const cp = document.querySelector('.cover-page');
    const vis = Array.from(document.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
    const seg = vis[1];
    const n = seg && seg.querySelector('.js-page-number');
    const t = seg && seg.querySelector('.js-page-count');
    return {
      temRodape: !!cp.querySelector('.page-footer'),
      temTextoDeRodape: /MOINHO YPIRANGA \| CNPJ|Pág\./.test(cp.textContent || ''),
      totalVisiveis: vis.length,
      numeroDaSegunda: n ? n.textContent : null,
      totalNaSegunda: t ? t.textContent : null,
    };
  });

  await page.close();
  return { campos: r, logo, capa, espacos };
}

(async () => {
  criarLogo();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [forPdfServer, rotulo] of [[false, 'preview'], [true, 'PDF']]) {
    const { campos: r, logo, capa, espacos } = await medir(browser, forPdfServer);
    console.log(`\n[${rotulo}]`);
    checar(!!r, `${rotulo}: bloco .cover-client-info existe`);
    if (!r) continue;
    const ausentes = r.filter(x => x.ausente).map(x => x.campo);
    checar(ausentes.length === 0, `${rotulo}: todos os campos presentes (faltando: ${ausentes.join(', ') || 'nenhum'})`);
    const naoCentro = r.filter(x => !x.ausente && x.align !== 'center').map(x => `${x.campo}=${x.align}`);
    checar(naoCentro.length === 0, `C1 [${rotulo}]: text-align center em todos (fora: ${naoCentro.join(', ') || 'nenhum'})`);
    const fora = r.filter(x => !x.ausente && x.desvio > TOL_PX).map(x => `${x.campo} (${x.desvio.toFixed(1)}px)`);
    checar(fora.length === 0, `C2 [${rotulo}]: centro alinhado ao do bloco (desalinhados: ${fora.join(', ') || 'nenhum'})`);

    // C3 — so os 4 campos de cliente tem rotulo proprio; a data de emissao segue em 1 linha
    const comRotulo = CAMPOS.filter(k => k !== 'emissao');
    const semBloco = r.filter(x => comRotulo.includes(x.campo) && x.rotuloDisplay !== 'block')
      .map(x => `${x.campo}=${x.rotuloDisplay}`);
    checar(semBloco.length === 0, `C3 [${rotulo}]: rotulo em display:block (fora: ${semBloco.join(', ') || 'nenhum'})`);
    const umaLinha = r.filter(x => comRotulo.includes(x.campo) && x.linhas < 2).map(x => `${x.campo} (${x.linhas})`);
    checar(umaLinha.length === 0, `C3 [${rotulo}]: rotulo em cima, valor embaixo — 2 linhas (fora: ${umaLinha.join(', ') || 'nenhum'})`);

    const aninhados = r.filter(x => x.pAninhado).map(x => x.campo);
    checar(aninhados.length === 0, `C4 [${rotulo}]: nenhum <p> dentro de <p> (achado em: ${aninhados.join(', ') || 'nenhum'})`);

    checar(!logo.ausente, `C5 [${rotulo}]: logo do cliente renderizada`);
    if (!logo.ausente) {
      checar(logo.desvio <= TOL_PX,
        `C5 [${rotulo}]: logo alinhada ao centro dos campos (desvio ${logo.desvio.toFixed(1)}px, largura ${logo.largura}px)`);
    }

    // C7 — a data de emissao segue os demais na mesma cadencia (o gap do container),
    // sem o antigo padding-top de 80px que a descolava do bloco.
    const gapEmissao = espacos.find(e => e.campo === 'emissao');
    const gapsAnteriores = espacos.filter(e => e.campo !== 'emissao').map(e => e.gap);
    const maiorAnterior = Math.max(...gapsAnteriores);
    checar(!!gapEmissao, `C7 [${rotulo}]: data de emissao e o ultimo campo do bloco`);
    checar(gapEmissao && Math.abs(gapEmissao.gap - maiorAnterior) <= TOL_PX,
      `C7 [${rotulo}]: mesmo espacamento dos demais (emissao ${gapEmissao ? Math.round(gapEmissao.gap) : '?'}px vs ${Math.round(maiorAnterior)}px)`);

    checar(!capa.temRodape, `C6 [${rotulo}]: capa sem .page-footer`);
    checar(!capa.temTextoDeRodape, `C6 [${rotulo}]: capa sem dados da empresa nem "Pág."`);
    checar(capa.numeroDaSegunda === '2' && capa.totalNaSegunda === String(capa.totalVisiveis),
      `C6 [${rotulo}]: numeracao intacta — 2a pagina marca ${capa.numeroDaSegunda}/${capa.totalNaSegunda} de ${capa.totalVisiveis} visiveis`);
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  limparLogo();
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); limparLogo(); process.exit(1); });
