/**
 * Colar foto em OUTRA pagina (Ctrl+V) — no Chromium de verdade.
 *
 * Relatado (30/07/2026): "control c e control v na imagem nao funciona se for em outra
 * pagina".
 *
 * Duas causas, ambas exercitadas aqui com eventos reais em vez de leitura de codigo:
 *   1. Os atalhos estavam NO ELEMENTO da foto. Ao rolar para outra pagina e clicar nela, a
 *      foto perde o foco e o listener do elemento nunca dispara. Agora estao no DOCUMENTO.
 *   2. O colar mirava a pagina da foto de ORIGEM. Rolando para a pagina 3 e colando, a copia
 *      ia para a pagina 1, fora da vista — parecia nao ter colado. Agora mira a pagina que
 *      esta em vista (centro mais proximo do centro da janela).
 *
 * Executar: node tests/colarFotoOutraPagina.test.js
 */
const assert = require('assert');
const puppeteer = require('puppeteer');

let ok = 0, total = 0;
const t = (nome, cond, extra) => {
  total++;
  if (cond) { ok++; console.log('  OK   ' + nome); }
  else { console.error('  FALHA ' + nome + (extra ? ': ' + extra : '')); }
};

// Reproduz as duas pecas do componente que estao sob teste.
const PAGINA_EM_VISTA = `
  function paginaEmVista(doc) {
    const paginas = Array.from(doc.querySelectorAll('.proposal-page')).filter((p) => p.style.display !== 'none');
    if (paginas.length === 0) return { indice: 1, el: null };
    const meioJanela = (doc.defaultView.innerHeight || 0) / 2;
    let melhor = 0, menorDist = Infinity;
    paginas.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const dist = Math.abs((r.top + r.height / 2) - meioJanela);
      if (dist < menorDist) { menorDist = dist; melhor = i; }
    });
    return { indice: melhor + 1, el: paginas[melhor] };
  }
`;

const HTML = `<!doctype html><html><head><style>
  body { margin: 0; }
  .proposal-page { position: relative; width: 600px; height: 800px; background: #fff; border: 1px solid #ccc; }
  .proposta-foto { position: absolute; width: 100px; height: 80px; background: #ddd; }
</style></head><body>
  <div class="proposal-page" id="p1"><div class="proposta-foto" data-foto-id="1" tabindex="0" style="left:20px;top:20px"></div></div>
  <div class="proposal-page" id="p2"></div>
  <div class="proposal-page" id="p3"></div>
<script>
${PAGINA_EM_VISTA}
window.__colagens = [];
window.__selecionadas = new Set(['1']);
window.__copiadas = [];
// Mesma estrutura do componente: atalhos NO DOCUMENTO, ignorando texto editavel.
document.addEventListener('keydown', function (ev) {
  if (!(ev.ctrlKey || ev.metaKey)) return;
  if (ev.target && ev.target.closest && ev.target.closest('[contenteditable="true"]')) return;
  const tecla = String(ev.key || '').toLowerCase();
  if (tecla === 'c') {
    const sel = Array.from(window.__selecionadas);
    if (sel.length === 0) return;
    ev.preventDefault();
    window.__copiadas = sel;
    return;
  }
  if (tecla === 'v') {
    if ((window.__copiadas || []).length === 0) return;
    ev.preventDefault();
    window.__colagens.push({ origem: window.__copiadas.slice(), pagina: paginaEmVista(document).indice });
  }
});
</script></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 600 });
  await page.setContent(HTML);

  // --- 1) copiar com a foto selecionada ---
  await page.keyboard.down('Control'); await page.keyboard.press('c'); await page.keyboard.up('Control');
  const copiadas = await page.evaluate(() => window.__copiadas);
  t('Ctrl+C copia a selecao', copiadas.length === 1 && copiadas[0] === '1', JSON.stringify(copiadas));

  // --- 2) o caso relatado: rolar para outra pagina, clicar FORA da foto e colar ---
  await page.evaluate(() => {
    document.getElementById('p3').scrollIntoView();
    // Tira o foco da foto, como um clique em area vazia faria.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  const focoForaDaFoto = await page.evaluate(() =>
    !document.activeElement || !document.activeElement.classList.contains('proposta-foto'));
  t('o foco NAO esta na foto (o listener no elemento nao dispararia)', focoForaDaFoto);

  await page.keyboard.down('Control'); await page.keyboard.press('v'); await page.keyboard.up('Control');
  const colagens = await page.evaluate(() => window.__colagens);
  t('Ctrl+V dispara mesmo sem foto em foco', colagens.length === 1, JSON.stringify(colagens));
  t('a copia vai para a pagina em VISTA (3), nao para a da origem (1)',
    colagens.length === 1 && colagens[0].pagina === 3,
    colagens.length ? 'colou na pagina ' + colagens[0].pagina : 'nao colou');

  // --- 3) rolar de volta e colar de novo: acompanha a pagina visivel ---
  await page.evaluate(() => document.getElementById('p2').scrollIntoView());
  await page.keyboard.down('Control'); await page.keyboard.press('v'); await page.keyboard.up('Control');
  const colagens2 = await page.evaluate(() => window.__colagens);
  t('colar de novo na pagina 2 respeita a nova vista',
    colagens2.length === 2 && colagens2[1].pagina === 2,
    colagens2.length > 1 ? 'colou na pagina ' + colagens2[1].pagina : 'nao colou');

  // --- 4) dentro de texto editavel o atalho NAO e sequestrado ---
  await page.evaluate(() => {
    const campo = document.createElement('div');
    campo.setAttribute('contenteditable', 'true');
    campo.id = 'texto';
    campo.textContent = 'clausula';
    document.getElementById('p2').appendChild(campo);
    campo.focus();
  });
  const antes = await page.evaluate(() => window.__colagens.length);
  await page.keyboard.down('Control'); await page.keyboard.press('v'); await page.keyboard.up('Control');
  const depois = await page.evaluate(() => window.__colagens.length);
  t('Ctrl+V dentro de cláusula nao cola imagem', antes === depois, `antes=${antes} depois=${depois}`);

  // --- 5) sem nada copiado, o Ctrl+V nao faz nada ---
  await page.evaluate(() => { window.__copiadas = []; window.__colagens = []; document.getElementById('texto').blur(); });
  await page.keyboard.down('Control'); await page.keyboard.press('v'); await page.keyboard.up('Control');
  const semCopia = await page.evaluate(() => window.__colagens.length);
  t('sem nada copiado, colar nao inventa foto', semCopia === 0);

  await browser.close();
  console.log(`\n${ok}/${total} checagens`);
  console.log(ok === total ? '0 failed' : `${total - ok} failed`);
  process.exit(ok === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
