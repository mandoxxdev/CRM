/**
 * Proposta bilíngue — simetria das colunas e página de apresentação (pedido de 24/11/2026: "tem que sempre forçar a ficar parecido
 * ambos, para dar simetria"; "aqui daria para ser maior, ficar mais estético").
 *
 *   BI-S01 com a tradução 20% mais comprida (o espanhol): todo par cuja metade mais alta PODIA chegar na altura da outra (zoom acima
 *          do piso de 88%) termina junto dela (diferença ≤ 6px)
 *   BI-S02 o ajuste só diminui altura: nenhuma página transborda
 *   BI-S03 apresentação: com a imagem, sem passar do rodapé, letra ≥ 9,5pt (era 9pt fixo, com um terço da página vazio)
 *
 * Executar: node tests/propostaBilingueSimetria.test.js  (PUPPETEER_EXECUTABLE_PATH apontando para um Chrome, se preciso)
 */
const puppeteer = require('puppeteer');
const { htmlDoCaso } = require('./helpers/propostaBaseHtml');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

const desfazerEntidades = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&amp;/g, '&');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    // Traduções falsas 20% mais compridas que o PT, para todo texto pendente do documento.
    const cru = htmlDoCaso('projetoConceitual', { idioma: 'es' }, true);
    const chaves = new Set(); const re = /data-traduzir="([^"]*)"/g; let m;
    while ((m = re.exec(cru)) !== null) chaves.add(desfazerEntidades(m[1]));
    const traducoes = {};
    chaves.forEach((k) => { const w = k.split(' '); traducoes[k] = k + (w.length > 3 ? ' ' + w.slice(0, Math.ceil(w.length * 0.2)).join(' ') : ''); });

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1300 });
    await page.setContent(htmlDoCaso('projetoConceitual', { idioma: 'es', traducoes }, true), { waitUntil: 'load', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 1500));
    const r = await page.evaluate(() => {
      const alt = (el) => { const g = document.createRange(); g.selectNodeContents(el); return g.getBoundingClientRect().height; };
      const pares = [...document.querySelectorAll('.proposal-page[data-generated="1"] .bi-par, .proposal-page[data-generated="1"] .bi-h')]
        .filter((p) => !p.querySelector('table, img'));
      let desiguais = 0; let ajustados = 0; const exemplos = [];
      pares.forEach((p) => {
        const a = p.querySelector(':scope > .bi-pt'); const b = p.querySelector(':scope > .bi-tr');
        if (!a || !b) return;
        const ha = alt(a); const hb = alt(b); const dif = Math.abs(ha - hb);
        const z = Math.min(Number(a.style.zoom || 1), Number(b.style.zoom || 1));
        if (z < 1) ajustados++;
        if (dif <= 6 || z <= 0.881) return;
        // Desigual sem estar no piso: só é defeito se, NO PISO, a metade mais alta chegaria na altura da outra.
        const alto = ha > hb ? a : b; const antes = alto.style.zoom;
        alto.style.zoom = '0.88'; const podia = alt(alto) <= Math.min(ha, hb) + 1; alto.style.zoom = antes;
        if (podia) { desiguais++; if (exemplos.length < 3) exemplos.push(`${dif.toFixed(0)}px: ${a.textContent.trim().slice(0, 40)}`); }
      });
      const transbordam = [...document.querySelectorAll('.proposal-page .page-content')]
        .filter((c) => c.offsetParent !== null && c.scrollHeight > c.clientHeight + 1).length;
      const pres = document.querySelector('.bi-pres'); const pc = pres.closest('.page-content');
      return { total: pares.length, desiguais, ajustados, exemplos, transbordam,
        presFs: parseFloat(pres.style.getPropertyValue('--pres-fs')), presImg: !!pc.querySelector('img'), presCabe: pc.scrollHeight <= pc.clientHeight + 1 };
    });
    console.log(`projetoConceitual es, tradução 20% mais longa — ${r.total} pares, ${r.ajustados} ajustados`);
    checar(r.ajustados > 0, `BI-S01 o ajuste rodou (${r.ajustados} pares)`);
    checar(r.desiguais === 0, `BI-S01 nenhum par que podia igualar ficou desigual ${r.exemplos.join(' | ')}`);
    checar(r.transbordam === 0, `BI-S02 nenhuma página transborda (${r.transbordam})`);
    checar(r.presImg && r.presCabe && r.presFs >= 9.5, `BI-S03 apresentação com imagem, cabe, letra ${r.presFs}pt ≥ 9,5pt`);
  } finally {
    await browser.close();
  }
  console.log(`\n${falhas} failed`);
  process.exit(falhas ? 1 : 0);
})();
