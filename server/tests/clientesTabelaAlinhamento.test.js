/**
 * Lista de Clientes com o CSS do SISTEMA (25/11/2026: "a diagramação deve ser a mesma, ex: A.A começa um pouco para esquerda e Acor mais
 * para direita, você deve seguir padrão de espaçamentos em todas as páginas").
 *
 *   CT-01 o nome da razão social começa no MESMO x em toda linha, com logo ou com a inicial (era 24px de diferença: 48 x 72px)
 *   CT-02 o CNPJ cabe numa linha (quebrava em "26.747.054/0001-" / "09")
 *   CT-03 os botões de ação (editar, desativar) do mesmo tamanho, lado a lado, com o ícone inteiro (o de editar tinha 4px de largura: o
 *         padding de 12px da regra geral dentro dos 30px forçados pelo tema — vale para todas as tabelas com .action-buttons)
 *
 * Executar: node tests/clientesTabelaAlinhamento.test.js  (PUPPETEER_EXECUTABLE_PATH apontando para um Chrome, se preciso)
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { htmlClientes } = require('./helpers/clientesHtml');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };
const logo = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'assets', 'proposta', 'logo-gmp.png')).toString('base64')}`;
const CLIENTES = [
  { razao_social: 'A.A.DE J.CORDEIRO TINTAS', nome_fantasia: 'SINALEX', cnpj: '06.147.058/0001-49', segmento: 'TINTAS & VERNIZES', contato_principal: 'ERIVALDO', email: 'erivaldo@sinalex.com.br' },
  { razao_social: 'ACOR INDUSTRIA DE TINTAS LTDA', nome_fantasia: 'ACOR', cnpj: '26.747.054/0001-09', segmento: 'TINTAS & VERNIZES', contato_principal: 'MAGALI', email: 'acortintas@acortintas.com.br', logo },
  { razao_social: 'ARCANJO TINTAS E REVESTIMENTOS LTDA', nome_fantasia: 'ARCANJO TINTAS E REVESTIMENTOS', cnpj: '46.270.936/0001-33', segmento: 'TINTAS & VERNIZES', contato_principal: 'WILL', email: 'willy@arcanjotintas.com.br' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const tema of ['light', 'dark']) {
      for (const largura of [1600, 1366]) {
        const page = await browser.newPage();
        await page.setViewport({ width: largura, height: 900 });
        await page.setContent(htmlClientes(CLIENTES, { tema }), { waitUntil: 'load' });
        const r = await page.evaluate(() => {
          const linhas = [...document.querySelectorAll('tbody tr')];
          const inicio = linhas.map((l) => Math.round(l.querySelector('.cli-td-nome > span:last-child').getBoundingClientRect().left));
          const cnpj = linhas.map((l) => { const td = l.children[2]; const rg = document.createRange(); rg.selectNodeContents(td); return rg.getClientRects().length; });
          const botoes = linhas.map((l) => [...l.querySelectorAll('.action-buttons .btn-icon')].map((b) => {
            const q = b.getBoundingClientRect(); const s = b.querySelector('svg').getBoundingClientRect();
            return { w: Math.round(q.width), h: Math.round(q.height), top: Math.round(q.top), svgW: Math.round(s.width), svgH: Math.round(s.height) };
          }));
          return { inicio, cnpj, botoes };
        });
        const rot = `${tema} ${largura}px`;
        checar(new Set(r.inicio).size === 1, `CT-01 ${rot}: o nome começa no mesmo x em toda linha (${r.inicio.join(', ')})`);
        checar(r.cnpj.every((n) => n === 1), `CT-02 ${rot}: CNPJ numa linha (${r.cnpj.join(', ')} linhas)`);
        const ok = r.botoes.every(([a, b]) => a && b && a.w === b.w && a.h === b.h && a.top === b.top && a.svgW >= 14 && a.svgH >= 14 && b.svgW >= 14);
        checar(ok, `CT-03 ${rot}: editar e desativar do mesmo tamanho, lado a lado, ícone inteiro ${ok ? '' : JSON.stringify(r.botoes[0])}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${falhas} failed`);
  process.exit(falhas ? 1 : 0);
})();
