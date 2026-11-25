/**
 * Tela de grupos de Produtos com o CSS do SISTEMA (25/11/2026: "essa parte de produtos está um lixo, tudo bugado" — nomes brancos sobre
 * branco e cartões uns por cima dos outros).
 *
 *   GP-01 nenhum cartão invade o vizinho e nenhum é mais largo que a coluna da grade (era 373px numa coluna de 254px)
 *   GP-02 a foto cobre o cartão inteiro
 *   GP-03 o nome é branco sobre o escurecimento do pé (era branco sobre fundo branco)
 *   GP-04 o lápis é um círculo visível no canto de cima à direita, dentro do cartão
 *   Em 1600px, 1100px e 390px (celular), claro e escuro.
 *
 * Executar: node tests/gruposProdutosVitrine.test.js  (PUPPETEER_EXECUTABLE_PATH apontando para um Chrome, se preciso)
 */
const path = require('path');
const puppeteer = require('puppeteer');
const { htmlGruposProdutos } = require('./helpers/gruposProdutosHtml');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };
const A = (f) => path.join(__dirname, '..', 'assets', 'proposta', f);
const GRUPOS = [['10', 'Moinhos', 'fabrica-gmp.jpeg'], ['20', 'Masseiras', 'industria40.jpg'], ['30', 'Dosagens', 'projetos.jpg'],
  ['40', 'Hélices e Acessórios', 'fabrica-gmp.jpeg'], ['50', 'Estocagem', 'industria40.jpg'], ['60', 'Dispersores', 'projetos.jpg'],
  ['70', 'Tanques e Reatores', 'fabrica-gmp.jpeg'], ['80', 'Tachos Fixos/Móveis', null]]
  .map(([numero, nome, f]) => ({ numero, nome, foto: f ? A(f) : null }));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const tema of ['light', 'dark']) {
      for (const largura of [1600, 1100, 390]) {
        const page = await browser.newPage();
        await page.setViewport({ width: largura, height: 1000 });
        await page.setContent(htmlGruposProdutos(GRUPOS, { tema }), { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 300));
        const r = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('.grupo-card')];
          const rects = cards.map((c) => c.getBoundingClientRect());
          const cols = getComputedStyle(document.querySelector('.grupos-grid')).gridTemplateColumns.split(' ').map(parseFloat);
          const sobre = [];
          rects.forEach((a, i) => rects.forEach((b, j) => {
            if (i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) sobre.push(`${i}x${j}`);
          }));
          const largos = rects.filter((x) => x.width > Math.max(...cols) + 2).length;
          const fotoCobre = cards.filter((c) => c.querySelector('img')).every((c) => {
            const f = c.querySelector('.grupo-card-foto-img').getBoundingClientRect(); const k = c.getBoundingClientRect();
            return f.width >= k.width - 4 && f.height >= k.height - 4;
          });
          const nomes = cards.map((c) => {
            const n = c.querySelector('.grupo-card-nome'); const body = c.querySelector('.grupo-card-body');
            const cor = getComputedStyle(n).webkitTextFillColor || getComputedStyle(n).color;
            return { branco: /rgb\(255, 255, 255\)/.test(cor), escurece: /linear-gradient/.test(getComputedStyle(body).backgroundImage) && !/rgb\(255, 255, 255\)/.test(getComputedStyle(body).backgroundColor) };
          });
          const lapis = cards.map((c) => {
            const b = c.querySelector('.btn-icon-grupo').getBoundingClientRect(); const k = c.getBoundingClientRect(); const cs = getComputedStyle(c.querySelector('.btn-icon-grupo'));
            return b.width >= 28 && b.right <= k.right && b.top >= k.top && b.top - k.top < 20 && k.right - b.right < 20 && parseFloat(cs.borderTopLeftRadius) >= b.width / 2 - 1 && cs.opacity === '1';
          });
          return { sobre, largos, fotoCobre, nomesOk: nomes.every((x) => x.branco && x.escurece), lapisOk: lapis.every(Boolean), nomes };
        });
        const rot = `${tema} ${largura}px`;
        checar(r.sobre.length === 0 && r.largos === 0, `GP-01 ${rot}: nenhum cartão invade o vizinho nem passa da coluna (${r.sobre.join(',') || 'ok'}, ${r.largos} largos)`);
        checar(r.fotoCobre, `GP-02 ${rot}: a foto cobre o cartão`);
        checar(r.nomesOk, `GP-03 ${rot}: nome branco sobre o escurecimento ${r.nomesOk ? '' : JSON.stringify(r.nomes[0])}`);
        checar(r.lapisOk, `GP-04 ${rot}: lápis redondo e visível no canto`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${falhas} failed`);
  process.exit(falhas ? 1 : 0);
})();
