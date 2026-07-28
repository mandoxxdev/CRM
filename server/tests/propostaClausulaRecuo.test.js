/**
 * Recuo de primeira linha (text-indent) no CORPO das clausulas — 27/07/2026.
 *
 * As clausulas tem DUAS origens no template e as duas precisam do recuo, senao o PDF
 * (que usa as secoes 5.x fixas quando a proposta nao tem clausulas salvas) sai diferente
 * do preview (que usa o corpo editavel vindo do banco/clausulasDefault.js):
 *   R1 — ramo fixo do template: paragrafo de clausula recuado
 *   R2 — ramo editavel: paragrafo de clausula recuado
 *   R3 — o recuo NAO vaza para onde nao deve (capa, rodape, tabelas, specs de equipamento)
 *   R4 — as secoes 1 (OBJETIVO) e 2 (ELABORACAO) tambem sao texto corrido e levam o recuo;
 *        ficaram de fora na primeira versao e passaram despercebidas ate revisao manual
 *
 * Medido no DOM renderizado, e nao no CSS-fonte: e o recuo efetivo que importa.
 *
 * Executar: node tests/propostaClausulaRecuo.test.js  (usa puppeteer)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const RECUO = '48px';
const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

async function medir(browser, templateConfig, rotulo) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  const tmp = path.join(os.tmpdir(), `recuo-${rotulo}.html`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'));
    const recuoDe = (el) => getComputedStyle(el).textIndent;
    // paragrafos de clausula: filhos diretos de .clausula-corpo ou do corpo editavel
    const pClausula = [];
    gen.forEach((pg) => {
      pg.querySelectorAll('.clausula-corpo > p, [data-clausula-campo="conteudo"] > p').forEach(p => {
        if (p.getBoundingClientRect().height > 0) pClausula.push(recuoDe(p));
      });
    });
    // paragrafos que NAO sao de clausula (secoes 1-3, escopo, rodape, capa)
    const pOutros = [];
    document.querySelectorAll('.cover-page p, .page-footer p, .page-footer div, .equip-specs-kv > p').forEach(p => {
      pOutros.push(recuoDe(p));
    });
    gen.forEach((pg) => {
      pg.querySelectorAll('table p, td, th').forEach(p => pOutros.push(recuoDe(p)));
    });
    // R4 — secoes 1 e 2 (texto corrido, mesmo tratamento das clausulas)
    const secoes12 = [];
    gen.forEach((pg) => {
      Array.from(pg.querySelectorAll('.page-content section')).forEach((sec) => {
        const h2 = sec.querySelector(':scope > h2');
        if (!h2) return;
        const t = (h2.textContent || '').trim();
        if (!/^(1\. OBJETIVO|2\. ELABORA)/.test(t)) return;
        // As seções 1–3 viraram cláusulas editáveis: os <p> moram no wrapper
        // [data-clausula-campo="conteudo"] (e não mais como filhos diretos da section).
        Array.from(sec.querySelectorAll(':scope > p, :scope > [data-clausula-campo="conteudo"] > p')).forEach((p) => {
          if (p.getBoundingClientRect().height > 0) secoes12.push({ secao: t.slice(0, 14), recuo: recuoDe(p) });
        });
      });
    });
    return { pClausula, pOutros, secoes12 };
  });
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [cfg, rotulo, titulo] of [
    [null, 'fixo', 'R1 ramo fixo do template'],
    [{ clausulas_custom: custom }, 'editavel', 'R2 ramo editavel'],
  ]) {
    const r = await medir(browser, cfg, rotulo);
    console.log(`\n[${titulo}] ${r.pClausula.length} paragrafos de clausula, ${r.pOutros.length} de fora`);
    checar(r.pClausula.length > 0, `${titulo}: encontrou paragrafos de clausula`);
    const semRecuo = r.pClausula.filter(v => v !== RECUO);
    checar(semRecuo.length === 0, `${titulo}: todos com text-indent ${RECUO} (${semRecuo.length} fora do padrao: ${[...new Set(semRecuo)].slice(0, 3).join(', ')})`);
    const vazou = r.pOutros.filter(v => v === RECUO);
    checar(vazou.length === 0, `R3: recuo nao vaza para capa/rodape/tabelas (${vazou.length} elemento(s) indevidamente recuado(s))`);

    checar(r.secoes12.length > 0, 'R4: encontrou paragrafos das secoes 1 e 2');
    const s12SemRecuo = r.secoes12.filter(x => x.recuo !== RECUO);
    checar(s12SemRecuo.length === 0,
      `R4: secoes 1 e 2 com recuo ${RECUO} (${s12SemRecuo.length} sem: ${s12SemRecuo.map(x => x.secao).join(', ')})`);
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
