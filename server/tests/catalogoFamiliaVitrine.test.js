/**
 * Catálogo de produtos, passo "Escolher família": layout VITRINE.
 *
 * Conceito escolhido pelo usuário em 31/07/2026, entre três apresentados: "vitrine escura
 * para o tema escuro, vitrine clara para o tema claro".
 *
 * POR QUE ESTE TESTE EXISTE: o layout desta tela quebrou TRÊS VEZES antes de acertar, sempre
 * do mesmo jeito — cartões desencontrados e nomes cortados quando a fileira misturava famílias
 * COM e SEM foto, e o estrago mudava conforme a largura da tela. Conferir num tamanho só, no
 * olho, não pegava. Então este teste mede, na combinação que quebrava: foto em pé, foto
 * deitada e família sem foto na mesma fileira, em três larguras e nos dois temas.
 *
 * O QUE ELE PEGA E O QUE NÃO PEGA (verificado por mutação, para não virar teste decorativo):
 *   - tirar o dimensionamento da foto (ela volta ao tamanho natural e vaza da placa): PEGA,
 *     12 checagens falham;
 *   - trocar o offset por width/height 100%: NÃO pega — e está certo não pegar, porque nesta
 *     estrutura a placa é bloco com altura definida e o percentual resolve igual. O offset é
 *     preferido por continuar valendo se a placa um dia virar flex ou grid.
 * O que sustenta o alinhamento é a ALTURA FIXA da placa, e é isso que as checagens vigiam.
 *
 * Executar: node tests/catalogoFamiliaVitrine.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const puppeteer = require('puppeteer');

const CSS = path.join(__dirname, '..', '..', 'client', 'src', 'components', 'SelecaoProdutosPremium.css');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// Famílias como as reais: nomes longos e curtos, com e sem código, e DUAS sem foto.
const FAMILIAS = [
  ['Disco Dispersor', '', 'deitada'],
  ['Dispersor Hidropneumático', 'DHY', 'em pe'],
  ['Moinho Vertical de Alto Impacto', 'MPY', 'deitada'],
  ['Moinho de Bolas', 'MBY', null],
  ['Unidade Derivadora de Dosagem', 'UDD', 'em pe'],
  ['Silos', 'SL', 'deitada'],
  ['Tacho Móvel Aço Carbono', '', null],
  ['Tanque Dispersor', 'TQY', 'em pe'],
];

async function montarHtml() {
  const css = fs.readFileSync(CSS, 'utf8');
  // Fotos SINTÉTICAS com proporções reais: a em pé é a que provocava o vazamento.
  const jpeg = async (w, h, cor) => 'data:image/jpeg;base64,' + (await sharp({
    create: { width: w, height: h, channels: 3, background: cor },
  }).jpeg().toBuffer()).toString('base64');
  const fotos = { deitada: await jpeg(260, 195, { r: 90, g: 100, b: 115 }),
                  'em pe': await jpeg(195, 260, { r: 120, g: 90, b: 70 }) };

  const tiles = FAMILIAS.map(([nome, cod, forma]) =>
    '<div class="catalogo-familia-card"><div class="catalogo-familia-foto">' +
    (forma ? '<img src="' + fotos[forma] + '" alt="">'
           : '<div class="catalogo-familia-inicial">' + nome[0] + '</div>') +
    '</div><div class="catalogo-familia-info">' +
    '<span class="catalogo-familia-nome">' + nome + '</span>' +
    (cod ? '<span class="catalogo-familia-codigo">' + cod + '</span>' : '') +
    '</div></div>').join('');

  return '<!doctype html><style>body{margin:0;font-family:system-ui}' + css +
    '</style><div class="catalogo-familias-grid">' + tiles + '</div>';
}

function medir() {
  const cards = [...document.querySelectorAll('.catalogo-familia-card')];
  // Uma foto NUNCA pode ultrapassar a placa que a contém.
  const vazando = [...document.querySelectorAll('.catalogo-familia-foto img')].filter((im) => {
    const a = im.getBoundingClientRect(), c = im.parentElement.getBoundingClientRect();
    return a.bottom > c.bottom + 1 || a.top < c.top - 1 || a.right > c.right + 1 || a.left < c.left - 1;
  }).length;
  // Cartões na mesma fileira precisam ter a MESMA altura.
  const fileiras = {};
  cards.forEach((c) => {
    const r = c.getBoundingClientRect();
    (fileiras[Math.round(r.top)] = fileiras[Math.round(r.top)] || []).push(Math.round(r.height));
  });
  const desencontradas = Object.values(fileiras).filter((hs) => new Set(hs).size > 1).length;
  const grade = document.querySelector('.catalogo-familias-grid');
  const cs = getComputedStyle(grade);
  return {
    vazando,
    desencontradas,
    alturas: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height)))],
    // A placa é clara nos dois temas de propósito: as fotos são renders sobre fundo branco.
    placa: getComputedStyle(document.querySelector('.catalogo-familia-foto')).backgroundColor,
    tile: cs.getPropertyValue('--vitrine-tile').trim(),
    nome: cs.getPropertyValue('--vitrine-nome').trim(),
    rolaDeLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}

// Luminância relativa, para afirmar "clara"/"escura" sem depender do valor exato.
// Aceita as duas formas: backgroundColor sai computado como rgb(), mas o valor de uma
// custom property volta como foi escrito no CSS — aqui, hexadecimal.
function brilho(cor) {
  let r, g, b;
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cor);
  const hex = /^#([0-9a-f]{6})$/i.exec(String(cor).trim());
  if (rgb) { [, r, g, b] = rgb.map(Number); }
  else if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    throw new Error('cor não reconhecida: ' + cor);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

(async () => {
  const html = await montarHtml();
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const resultados = {};

  for (const tema of ['claro', 'escuro']) {
    for (const [tela, w, h] of [['1280x600', 1280, 600], ['1366x768', 1366, 768], ['1920x1080', 1920, 1080]]) {
      const pg = await navegador.newPage();
      await pg.setViewport({ width: w, height: h });
      await pg.setContent(html, { waitUntil: 'load' });
      if (tema === 'escuro') await pg.evaluate(() => document.body.classList.add('dark-theme'));
      resultados[tema + ' ' + tela] = await pg.evaluate(medir);
      await pg.close();
    }
  }
  await navegador.close();

  console.log('\n[o defeito que derrubou as duas tentativas anteriores]');
  Object.entries(resultados).forEach(([caso, r]) => {
    t(`${caso}: nenhuma foto vaza da placa`, () => assert.strictEqual(r.vazando, 0));
    t(`${caso}: nenhuma fileira desencontrada`, () => assert.strictEqual(r.desencontradas, 0));
  });

  console.log('\n[consistência entre telas]');
  const todasAlturas = new Set();
  Object.values(resultados).forEach((r) => r.alturas.forEach((a) => todasAlturas.add(a)));
  t('a altura do cartão é a MESMA em toda tela e nos dois temas',
    () => assert.strictEqual(todasAlturas.size, 1, 'alturas encontradas: ' + [...todasAlturas].join(', ')));
  t('a página nunca rola de lado',
    () => assert(Object.values(resultados).every((r) => !r.rolaDeLado)));

  console.log('\n[os dois temas]');
  const claro = resultados['claro 1366x768'], escuro = resultados['escuro 1366x768'];
  t('o tema escuro troca os tokens (body.dark-theme chega na grade)',
    () => assert.notStrictEqual(claro.tile, escuro.tile, 'tokens iguais: dark-theme não pegou'));
  t('vitrine clara: cartão claro, texto escuro', () => {
    assert(brilho(claro.tile) > 0.8, 'cartão do tema claro deveria ser claro: ' + claro.tile);
    assert(brilho(claro.nome) < 0.4, 'nome do tema claro deveria ser escuro: ' + claro.nome);
  });
  t('vitrine escura: cartão escuro, texto claro', () => {
    assert(brilho(escuro.tile) < 0.25, 'cartão do tema escuro deveria ser escuro: ' + escuro.tile);
    assert(brilho(escuro.nome) > 0.85, 'nome do tema escuro deveria ser claro: ' + escuro.nome);
  });
  // Decisão deliberada, não descuido: as fotos das famílias são renders sobre fundo branco,
  // então placa escura no tema escuro sumiria com o produto.
  t('a placa da foto continua CLARA no tema escuro',
    () => assert(brilho(escuro.placa) > 0.8, 'placa do tema escuro: ' + escuro.placa));

  console.log('\n[o seletor de tema é o que o app realmente usa]');
  const css = fs.readFileSync(CSS, 'utf8');
  t('usa body.dark-theme (ThemeContext) e não [data-theme], que não existe neste app', () => {
    assert(/body\.dark-theme\s+\.catalogo-familias-grid/.test(css), 'falta a regra body.dark-theme');
    assert(!/\[data-theme="dark"\]\s+\.catalogo-familia/.test(css),
      '[data-theme] é seletor morto aqui: o app aplica a classe dark-theme no body');
  });

  console.log(`\n${ok}/${total} checagens`);
  console.log(ok === total ? '0 failed' : `${total - ok} failed`);
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
