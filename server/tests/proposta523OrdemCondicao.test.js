/**
 * Bug reportado: com muitos itens, a tabela de precos da 5.23 quebrava no meio,
 * a CONDICAO DE PAGAMENTO aparecia junto do 1o fragmento e a tabela CONTINUAVA
 * depois dela. Regra: a tabela deve ser montada COMPLETA (em quantas paginas
 * precisar) e so DEPOIS vem a condicao de pagamento.
 * Executar: node tests/proposta523OrdemCondicao.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = Array.from({ length: 60 }, (_, i) => ({
  produto_nome: `Equipamento de teste numero ${i + 1} com descricao razoavelmente longa para ocupar altura`,
  quantidade: 1, unidade: 'UN', valor_unitario: 1000 + i, valor_total: 1000 + i,
}));
const totais = { total: itens.reduce((s, i) => s + i.valor_total, 0), dataEmissao: '22/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  const tmp = path.join(os.tmpdir(), 'ordem523.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const r = await page.evaluate(() => {
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'));
    const paginasComTabela = [];   // paginas (1-based) com fragmento da tabela de precos
    let paginaCondicao = -1;       // pagina com o texto CONDICAO DE PAGAMENTO
    let condicaoAposTabelaNaMesmaPagina = true;
    let totalLinhas = 0;
    gen.forEach((p, i) => {
      const tabelas = Array.from(p.querySelectorAll('table')).filter(t => /PRE[ÇC]O UNIT/i.test(t.textContent || ''));
      if (tabelas.length) {
        paginasComTabela.push(i + 1);
        tabelas.forEach(t => { totalLinhas += t.querySelectorAll('tbody > tr').length; });
      }
      // "Primeira Parcela/Entrada" é texto exclusivo da condição de pagamento da 5.23
      if (/Primeira Parcela\/Entrada/.test(p.textContent || '') && paginaCondicao === -1) {
        paginaCondicao = i + 1;
        // se ha fragmento de tabela NESTA pagina, a condicao deve vir DEPOIS dele no DOM
        const tab = tabelas[tabelas.length - 1];
        if (tab) {
          const nodos = Array.from(p.querySelectorAll('*'));
          const idxTab = nodos.indexOf(tab);
          const condEl = nodos.find(el => el.children.length === 0 && /Primeira Parcela\/Entrada/.test(el.textContent || ''));
          if (condEl && nodos.indexOf(condEl) < idxTab) condicaoAposTabelaNaMesmaPagina = false;
        }
      }
    });
    return { paginasComTabela, paginaCondicao, condicaoAposTabelaNaMesmaPagina, totalLinhas };
  });
  await browser.close();
  console.log(JSON.stringify(r));
  let failed = 0;
  const ultimaPaginaTabela = r.paginasComTabela[r.paginasComTabela.length - 1];
  if (r.paginasComTabela.length < 2) { console.error('✗ esperado 2+ fragmentos (60 itens)'); failed++; }
  if (r.paginaCondicao === -1) { console.error('✗ condição de pagamento (Primeira Parcela/Entrada) não encontrada'); failed++; }
  // A condição não pode aparecer ANTES do 1º fragmento da tabela
  if (r.paginaCondicao !== -1 && r.paginasComTabela.length && r.paginaCondicao < r.paginasComTabela[0]) {
    console.error(`✗ condição (pág. ${r.paginaCondicao}) aparece ANTES do 1º fragmento da tabela (pág. ${r.paginasComTabela[0]})`); failed++;
  }
  // Regra central: nenhum fragmento da tabela pode vir DEPOIS da pagina da condicao
  if (r.paginaCondicao !== -1 && ultimaPaginaTabela > r.paginaCondicao) {
    console.error(`✗ tabela continua na pág. ${ultimaPaginaTabela}, DEPOIS da condição (pág. ${r.paginaCondicao})`); failed++;
  }
  if (!r.condicaoAposTabelaNaMesmaPagina) { console.error('✗ na mesma página, condição aparece ANTES do fragmento de tabela'); failed++; }
  // Integridade: as 60 linhas (+1 do TOTAL DA PROPOSTA) devem estar presentes
  if (r.totalLinhas < 61) { console.error(`✗ linhas perdidas: ${r.totalLinhas} < 61`); failed++; }
  console.log(failed ? `\n${failed} FALHA(S)` : '\n✓ tabela completa antes da condição de pagamento');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
