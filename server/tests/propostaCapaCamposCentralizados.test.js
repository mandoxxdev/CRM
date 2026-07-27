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
 *
 * Roda nos dois caminhos (PDF e preview) porque a capa e a mesma nos dois.
 *
 * Executar: node tests/propostaCapaCamposCentralizados.test.js  (usa puppeteer)
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const CAMPOS = ['contratante', 'cnpj', 'email', 'telefone', 'emissao'];
const TOL_PX = 2;

const proposta = {
  numero_proposta: '058-02-MH-2026-REV00', titulo: 'TESTT',
  razao_social: 'CLIENTE TESTE LTDA', cnpj: '12.345.678/0001-90',
  cliente_email: 'contato@cliente.com.br', cliente_telefone: '(11) 98888-7777',
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
  await page.close();
  return r;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (const [forPdfServer, rotulo] of [[false, 'preview'], [true, 'PDF']]) {
    const r = await medir(browser, forPdfServer);
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
  }

  await browser.close();
  console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
