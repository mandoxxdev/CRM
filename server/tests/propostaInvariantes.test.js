/**
 * INVARIANTES DA PROPOSTA — regras que NUNCA podem quebrar, validadas contra
 * os DOIS formatos de dados: (a) cláusulas default e (b) cláusulas customizadas
 * NO FORMATO REAL DO BANCO (id/titulo/conteudo/ordem — SEM campo `numero`;
 * o número vive no prefixo do título, ex.: "5.24 CONSIDERAÇÃO FINAL").
 *
 * Regras (ver specs/proposta-editavel/review-proposta.md):
 *  I1 — Toda cláusula 5.x da fonte aparece nas páginas geradas (nada some).
 *  I2 — 5.24 (CONSIDERAÇÃO FINAL) aparece DEPOIS da 5.23 (tabela + condição).
 *  I3 — Assinaturas na ÚLTIMA página gerada.
 *  I4 — Tabela da 5.23 completa (todas as linhas) antes da condição de pagamento;
 *       todo fragmento de tabela tem thead.
 *  I5 — Numeração Pág. X/Y contínua e consistente (com ou sem sumário).
 *  I6 — Nenhum bloco ultrapassa o rodapé (overflow zero na área útil).
 *
 * Executar: node tests/propostaInvariantes.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = Array.from({ length: 30 }, (_, i) => ({
  produto_nome: `Equipamento ${i + 1} com descricao longa o bastante para ocupar altura de linha`,
  quantidade: 1, unidade: 'UN', valor_unitario: 1000 + i, valor_total: 1000 + i,
}));
const totais = { total: itens.reduce((s, i) => s + i.valor_total, 0), dataEmissao: '22/07/2026' };

// (b) formato REAL do banco: sem `numero`, número no prefixo do título
const clausulasFormatoBanco = getClausulasDefault().map((c, i) => ({
  id: 100 + i, proposta_id: 288, ordem: i, ativo: 1,
  titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo,
}));
// (a) formato default (com `numero`)
const clausulasFormatoDefault = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

async function medirInvariantes(browser, clausulas, rotulo) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: clausulas }, null, false, true);
  const tmp = path.join(os.tmpdir(), `invariantes-${rotulo}.html`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const r = await page.evaluate(() => {
    const TOL = 3;
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'));
    const vis = Array.from(document.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
    const src = document.getElementById('proposalSource');
    const pagCom = (txt) => gen.map((p, i) => (p.textContent || '').includes(txt) ? i + 1 : null).filter(Boolean);

    // I1 — títulos de cláusula da fonte presentes nas páginas
    const titulosFonte = Array.from(src.querySelectorAll('[data-clausula-campo="titulo"]')).map(h => (h.textContent || '').trim()).filter(Boolean);
    const textoPaginas = gen.map(p => p.textContent || '').join('\n');
    const titulosSumidos = titulosFonte.filter(t => !textoPaginas.includes(t));

    // I2/I4 — tabela 5.23 / condição / 5.24
    const paginasTabela = [];
    let fragsSemThead = 0, totalLinhas = 0;
    gen.forEach((p, i) => {
      Array.from(p.querySelectorAll('table')).filter(t => /PRE[ÇC]O UNIT/i.test(t.textContent || '')).forEach(t => {
        paginasTabela.push(i + 1);
        if (!t.querySelector('thead')) fragsSemThead++;
        totalLinhas += t.querySelectorAll('tbody > tr').length;
      });
    });
    const pag524 = pagCom('CONSIDERAÇÃO FINAL');
    const pagCondicao = pagCom('Primeira Parcela/Entrada');
    const pagAssin = pagCom('Junior Machado');

    // I5 — numeração
    let numeracaoOk = true;
    vis.forEach((p, i) => {
      const n = p.querySelector('.js-page-number'); const c = p.querySelector('.js-page-count');
      if (n && String(i + 1) !== n.textContent) numeracaoOk = false;
      if (c && String(vis.length) !== c.textContent) numeracaoOk = false;
    });

    // I6 — overflow do rodapé
    let overflowCount = 0;
    gen.forEach((pg) => {
      const pc = pg.querySelector('.page-content'); if (!pc) return;
      const bottom = pc.getBoundingClientRect().bottom;
      Array.from(pc.children).forEach((ch) => { if (ch.getBoundingClientRect().bottom > bottom + TOL) overflowCount++; });
    });

    return { totalPaginasGeradas: gen.length, titulosSumidos, paginasTabela, fragsSemThead, totalLinhas, pag524, pagCondicao, pagAssin, numeracaoOk, overflowCount };
  });
  await page.close();
  return r;
}

(async () => {
  let failed = 0;
  const check = (rotulo, cond, msg) => { if (cond) console.log(`  ✓ [${rotulo}] ${msg}`); else { console.error(`  ✗ [${rotulo}] ${msg}`); failed++; } };
  const browser = await puppeteer.launch({ headless: 'new' });

  for (const [rotulo, clausulas] of [['default', clausulasFormatoDefault], ['banco', clausulasFormatoBanco]]) {
    const r = await medirInvariantes(browser, clausulas, rotulo);
    console.log(`\n=== cenário "${rotulo}" ===`);
    console.log(JSON.stringify({ ...r, titulosSumidos: r.titulosSumidos.slice(0, 3) }));
    const ultima = r.totalPaginasGeradas;
    const ultimaTabela = r.paginasTabela[r.paginasTabela.length - 1] || -1;
    check(rotulo, r.titulosSumidos.length === 0, `I1: nenhuma cláusula some (sumidas: ${r.titulosSumidos.length})`);
    check(rotulo, r.pag524.length > 0, 'I2: 5.24 CONSIDERAÇÃO FINAL presente');
    check(rotulo, r.pag524.length === 0 || Math.min(...r.pag524) > ultimaTabela, `I2: 5.24 (pág. ${r.pag524}) depois da tabela 5.23 completa (última pág. ${ultimaTabela})`);
    check(rotulo, r.pag524.length === 0 || r.pagCondicao.length === 0 || Math.min(...r.pag524) >= Math.max(...r.pagCondicao), 'I2: 5.24 depois da condição de pagamento');
    check(rotulo, r.pagAssin.includes(ultima), `I3: assinaturas na última página (${r.pagAssin} vs ${ultima})`);
    check(rotulo, r.paginasTabela.length >= 2, 'I4: tabela quebrou em 2+ fragmentos (cenário força)');
    check(rotulo, r.fragsSemThead === 0, 'I4: todo fragmento tem thead');
    check(rotulo, r.totalLinhas === itens.length + 1, `I4: tabela íntegra (${r.totalLinhas} linhas = ${itens.length}+TOTAL)`);
    check(rotulo, r.pagCondicao.length === 0 || Math.min(...r.pagCondicao) >= ultimaTabela, 'I4: condição só após a tabela completa');
    check(rotulo, r.numeracaoOk, 'I5: numeração Pág. X/Y consistente');
    check(rotulo, r.overflowCount === 0, `I6: overflow zero (${r.overflowCount} bloco(s) sobre o rodapé)`);
  }

  await browser.close();
  console.log(failed ? `\n${failed} FALHA(S)` : '\nTODOS OS INVARIANTES OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
