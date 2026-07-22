# Fix Sumário/5.23/Capa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 correções no template da proposta (spec: `specs/proposta-editavel/fix-sumario-523-capa-2026-07-22.md`): sumário some quando estoura, `thead` repetido na quebra de tabela aninhada, hero da capa sem linha branca, e telefone/email do cadastro na capa.

**Architecture:** Dois grupos. **Grupo A** (#1 sumário + #2 thead) mexe no script do paginador embutido em `server/templates/propostaPremiumV2.js` (~linhas 1440–1820) — em série. **Grupo B** (#3 hero + #4 campos da capa) mexe na região da capa do mesmo arquivo (~1218/1281/1354–1377) + SELECTs em `server/index.js` — regiões disjuntas do Grupo A, pode rodar em paralelo (worktrees).

**Tech Stack:** Node.js, Puppeteer (testes headless — já em `server/node_modules`), scripts `node` puros em `server/tests/`.

## Global Constraints

- Testes server = scripts `node` puros (`cd server && node tests/<x>.test.js`), padrão `test(nome, fn)` + `assert`, resumo `N passed, M failed`, exit code ≠ 0 em falha (copiar o padrão de `server/tests/proposta523Fixa.test.js`).
- `node --check` em todo arquivo server alterado antes de commitar.
- **O script do paginador é um template literal** dentro de `gerarHTMLPropostaPremiumV2` — regex no script precisa de `\\d` (escape duplo) e `content: "\\2713"` etc.; cuidado ao editar.
- Não regredir: quebras de página da seção 5/5.23/5.24 (`data-page-break`), overflow zero do rodapé, foto flutuante do equipamento. Ao final de cada grupo, rodar `server/tests/propostaQuebras.test.js` e a validação de overflow.
- Um commit por task, mensagens `fix(proposta): …`.
- Branch de trabalho: worktree criado a partir de `main` (`a322e4f` ou posterior). Não tocar `main` diretamente.

---

# GRUPO A — Paginador: sumário + thead (subagente 1, em série)

## Task A1 (#1): Esconder o sumário quando estourar + renumerar

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` (script do paginador, região 1769–1815)
- Test: `server/tests/propostaSumarioOverflow.test.js` (Create)

**Interfaces:**
- Consumes: `#tocPage`, `#tocList`, bloco de numeração existente (1780–1786), filtro `p.style.display !== 'none'`.
- Produces: função interna `preencherSumario(pages)` (extraída do bloco atual) + lógica: preencher → medir overflow do `.page-content` do tocPage → `tocPage.style.display = overflow ? 'none' : ''` → recoletar páginas visíveis → numerar → repreencher sumário se visível.

- [ ] **Step 1: Escrever o teste headless que falha**

Create `server/tests/propostaSumarioOverflow.test.js`:
```javascript
/**
 * #1 — Sumário que estoura a página deve ser escondido (display:none) e a
 * numeração Pág. X/Y deve permanecer consistente. Sumário pequeno permanece.
 * Executar: node tests/propostaSumarioOverflow.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '22/07/2026' };

async function render(clausulas) {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: clausulas }, null, false, true);
  const tmp = path.join(os.tmpdir(), `sumario-${clausulas.length}.html`);
  fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    const toc = document.getElementById('tocPage');
    const pc = toc ? toc.querySelector('.page-content') : null;
    const tocVisivel = !!toc && toc.style.display !== 'none';
    const tocOverflow = pc ? pc.scrollHeight > pc.clientHeight + 2 : false;
    const vis = Array.from(document.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
    // numeração consistente: página i (1-based) mostra js-page-number == i e count == vis.length
    let numeracaoOk = true;
    vis.forEach((p, i) => {
      const n = p.querySelector('.js-page-number');
      const c = p.querySelector('.js-page-count');
      if (n && String(i + 1) !== n.textContent) numeracaoOk = false;
      if (c && String(vis.length) !== c.textContent) numeracaoOk = false;
    });
    return { tocVisivel, tocOverflow, totalVisiveis: vis.length, numeracaoOk };
  });
  await browser.close();
  return r;
}

(async () => {
  let failed = 0;
  // Caso 1: MUITAS cláusulas (3x as default, com títulos únicos) -> sumário estoura -> escondido
  const muitas = [];
  for (let k = 0; k < 3; k++) {
    getClausulasDefault().forEach((c, i) => muitas.push({ numero: `5.${muitas.length + 1}`, titulo: `${c.titulo} VARIANTE ${k}-${i}`, conteudo: c.conteudo }));
  }
  const grande = await render(muitas);
  console.log('grande:', JSON.stringify(grande));
  if (grande.tocVisivel) { console.error('✗ sumário estourado deveria estar escondido'); failed++; }
  else console.log('  ✓ sumário estourado escondido');
  if (!grande.numeracaoOk) { console.error('✗ numeração inconsistente após esconder sumário'); failed++; }
  else console.log('  ✓ numeração consistente sem o sumário');

  // Caso 2: poucas cláusulas -> sumário cabe -> visível e numerado
  const poucas = getClausulasDefault().slice(0, 5).map((c, i) => ({ numero: `5.${i + 1}`, titulo: c.titulo, conteudo: c.conteudo }));
  const pequeno = await render(poucas);
  console.log('pequeno:', JSON.stringify(pequeno));
  if (!pequeno.tocVisivel) { console.error('✗ sumário pequeno deveria permanecer visível'); failed++; }
  else console.log('  ✓ sumário pequeno visível');
  if (pequeno.tocOverflow) { console.error('✗ sumário pequeno não deveria ter overflow'); failed++; }
  else console.log('  ✓ sem overflow no sumário pequeno');
  if (!pequeno.numeracaoOk) { console.error('✗ numeração inconsistente com sumário visível'); failed++; }
  else console.log('  ✓ numeração consistente com sumário');

  console.log(failed ? `\n${failed} FALHA(S)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/propostaSumarioOverflow.test.js`
Expected: FAIL no caso 1 (sumário estourado continua visível hoje).

- [ ] **Step 3: Implementar no script do paginador**

Na região 1780–1814, reestruturar (dentro do template literal — atenção aos escapes existentes, ex. `/^\\d+(\\.\\d+)?[.\\s]/`):

```javascript
        function numerarPaginas() {
          const pages = Array.from(doc.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
          const total = pages.length;
          pages.forEach((p, idx) => {
            const n = idx + 1;
            p.querySelectorAll('.js-page-number').forEach(el => { el.textContent = String(n); });
            p.querySelectorAll('.js-page-count').forEach(el => { el.textContent = String(total); });
          });
          return pages;
        }
        function preencherSumario(pages) {
          const tocList = document.getElementById('tocList');
          if (!tocList) return;
          tocList.innerHTML = '';
          pages.forEach((p, idx) => {
            if (p.id === 'tocPage') return;
            // ... (mover o corpo atual do preenchimento, inalterado, para cá)
          });
        }
        // #1 — sumário que estoura a área útil sai da proposta (reversível):
        const tocPage = document.getElementById('tocPage');
        if (tocPage) {
          tocPage.style.display = '';                    // re-testa a cada repaginação
          preencherSumario(numerarPaginas());            // provisório, para medir
          const pc = tocPage.querySelector('.page-content');
          if (pc && pc.scrollHeight > pc.clientHeight) tocPage.style.display = 'none';
        }
        const paginasFinais = numerarPaginas();          // renumera já sem (ou com) o sumário
        if (!tocPage || tocPage.style.display !== 'none') preencherSumario(paginasFinais);
```
Substituindo o bloco atual de numeração+sumário por essa estrutura (não duplicar o código de preenchimento — extrair pra função).

- [ ] **Step 4: Rodar e ver passar + regressões**

Run: `cd server && node tests/propostaSumarioOverflow.test.js && node tests/propostaQuebras.test.js && node --check templates/propostaPremiumV2.js`
Expected: OK nos dois casos; quebras seguem corretas.

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaSumarioOverflow.test.js
git commit -m "fix(proposta): sumario que estoura a pagina e ocultado e a numeracao renumera"
```

## Task A2 (#2): Repetir `thead` quando `splitBlockByChildren` divide tabela aninhada

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` (`splitBlockByChildren`, ~1494+)
- Test: `server/tests/proposta523TheadRepetido.test.js` (Create)

**Interfaces:**
- Consumes: `splitBlockByChildren(blockEl, pageContentEl)` — divide pelo container com mais filhos; reconstrói cadeia de ancestrais por parte.
- Produces: mesmo contrato; quando o container escolhido é um `tbody`, cada parte reconstruída inclui clone do `thead` (e `colgroup`) da `<table>` ancestral.

- [ ] **Step 1: Escrever o teste headless que falha**

Create `server/tests/proposta523TheadRepetido.test.js`:
```javascript
/**
 * #2 — Quando a tabela de precos da 5.23 quebra entre paginas, cada fragmento
 * deve repetir o cabecalho (thead ITEM/DESCRICAO/...).
 * Executar: node tests/proposta523TheadRepetido.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
// MUITOS itens para forçar a tabela de precos da 5.23 a quebrar em 2+ paginas
const itens = Array.from({ length: 60 }, (_, i) => ({
  produto_nome: `Equipamento de teste numero ${i + 1} com descricao razoavelmente longa para ocupar altura`,
  quantidade: 1, unidade: 'UN', valor_unitario: 1000 + i, valor_total: 1000 + i,
}));
const totais = { total: itens.reduce((s, i) => s + i.valor_total, 0), dataEmissao: '22/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  const tmp = path.join(os.tmpdir(), 'thead523.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const r = await page.evaluate(() => {
    // fragmentos da tabela de precos = tabelas em paginas geradas cujo tbody tem
    // linha com "TOTAL DA PROPOSTA" OU que estejam na secao da 5.23
    const gen = Array.from(document.querySelectorAll('.proposal-page[data-generated="1"]'));
    const frags = [];
    gen.forEach((p, pi) => {
      p.querySelectorAll('table').forEach((t) => {
        const txt = t.textContent || '';
        // tabela de precos: colunas PRECO UNITARIO / TOTAL
        if (/PRE[ÇC]O UNIT/i.test(txt) || /TOTAL DA PROPOSTA/.test(txt)) {
          frags.push({ page: pi + 1, hasThead: !!t.querySelector('thead'), rows: t.querySelectorAll('tbody > tr').length });
        }
      });
    });
    return { fragmentos: frags };
  });
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
  const frags = r.fragmentos;
  let failed = 0;
  if (frags.length < 2) { console.error(`✗ esperado 2+ fragmentos da tabela de precos (60 itens), veio ${frags.length}`); failed++; }
  const semThead = frags.filter(f => !f.hasThead);
  if (semThead.length > 0) { console.error(`✗ ${semThead.length} fragmento(s) sem thead (paginas ${semThead.map(f => f.page).join(',')})`); failed++; }
  if (!failed) console.log(`✓ ${frags.length} fragmentos, todos com thead`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/proposta523TheadRepetido.test.js`
Expected: FAIL — fragmentos de continuação sem `thead`. (Se falhar por "menos de 2 fragmentos", aumentar a lista de itens até quebrar.)

- [ ] **Step 3: Implementar em `splitBlockByChildren`**

Ler a função inteira antes (1494 até o fim dela). Na reconstrução da cadeia de ancestrais por parte, adicionar: se `container.tagName === 'TBODY'`, localizar `table = container.closest('table')` e, em **cada parte** (não só na primeira), inserir clones de `table.querySelector('colgroup')` e `table.querySelector('thead')` antes do `tbody` reconstruído. Conceito:

```javascript
        // Se o container dividido é um tbody, cada parte precisa repetir o
        // cabecalho da tabela (colgroup/thead), como faz splitTableByRows.
        const tabelaAncestral = container.tagName === 'TBODY' ? container.closest('table') : null;
        // ... ao reconstruir a cadeia de cada parte (i >= 0):
        if (tabelaAncestral) {
          const cloneTable = /* o clone da <table> na cadeia desta parte */;
          const cg = tabelaAncestral.querySelector('colgroup');
          const th = tabelaAncestral.querySelector('thead');
          const tbodyClone = cloneTable.querySelector('tbody');
          if (cg && !cloneTable.querySelector('colgroup')) cloneTable.insertBefore(cg.cloneNode(true), tbodyClone);
          if (th && !cloneTable.querySelector('thead')) cloneTable.insertBefore(th.cloneNode(true), tbodyClone);
        }
```
Adaptar aos nomes reais da reconstrução (a função clona a cadeia com `cloneNode(false)` — localizar onde o clone da `<table>` é criado por parte). O comportamento para blocos não-tabela não muda.

- [ ] **Step 4: Rodar e ver passar + regressões**

Run: `cd server && node tests/proposta523TheadRepetido.test.js && node tests/propostaQuebras.test.js && node tests/proposta523Fixa.test.js && node --check templates/propostaPremiumV2.js`
Expected: todos verdes.

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/proposta523TheadRepetido.test.js
git commit -m "fix(proposta): repetir thead/colgroup ao dividir tabela aninhada entre paginas"
```

---

# GRUPO B — Capa: hero + campos do cadastro (subagente 2, paralelo)

## Task B1 (#3): Hero `industria40.png` sem linha branca à esquerda

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` (CSS `.cover-hero` ~1218–1219 e/ou HTML ~1354)
- Test: `server/tests/propostaCapaHero.test.js` (Create)

- [ ] **Step 1: Reproduzir com screenshot + teste de pixel**

Create `server/tests/propostaCapaHero.test.js`:
```javascript
/**
 * #3 — O hero da capa (industria40.png) deve preencher 100% da largura, sem
 * faixa branca vertical a esquerda. Verifica por pixel no screenshot.
 * Executar: node tests/propostaCapaHero.test.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const puppeteer = require('puppeteer');
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, [], { total: 0, dataEmissao: '22/07/2026' }, null, null, false, true);
  const tmp = path.join(os.tmpdir(), 'capahero.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 1 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // geometria: img do hero deve comecar no x da pagina e ter a mesma largura
  const geo = await page.evaluate(() => {
    const pageEl = document.querySelector('.proposal-page.cover-page');
    const hero = document.querySelector('.cover-hero');
    const img = document.querySelector('.cover-hero img');
    if (!pageEl || !hero || !img) return null;
    const pr = pageEl.getBoundingClientRect(), hr = hero.getBoundingClientRect(), ir = img.getBoundingClientRect();
    return { pageX: pr.x, pageW: pr.width, heroX: hr.x, heroW: hr.width, imgX: ir.x, imgW: ir.width };
  });
  console.log('geometria:', JSON.stringify(geo));
  let failed = 0;
  if (!geo) { console.error('✗ capa/hero/img nao encontrados'); process.exit(1); }
  if (Math.abs(geo.imgX - geo.pageX) > 0.6) { console.error(`✗ img comeca ${(geo.imgX - geo.pageX).toFixed(2)}px depois da borda da pagina`); failed++; }
  if (Math.abs((geo.imgX + geo.imgW) - (geo.pageX + geo.pageW)) > 0.6) { console.error('✗ img nao alcanca a borda direita'); failed++; }

  // screenshot do hero para inspecao (e pixel-check se pngjs disponivel)
  const heroEl = await page.$('.cover-hero');
  const shot = path.join(os.tmpdir(), 'capahero.png');
  await heroEl.screenshot({ path: shot });
  console.log('screenshot:', shot);
  if (PNG) {
    const png = PNG.sync.read(fs.readFileSync(shot));
    let brancoX0 = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (png.width * y) * 4;
      if (png.data[i] > 245 && png.data[i + 1] > 245 && png.data[i + 2] > 245) brancoX0++;
    }
    const frac = brancoX0 / png.height;
    console.log(`pixels brancos na coluna x=0: ${(frac * 100).toFixed(1)}%`);
    if (frac > 0.5) { console.error('✗ coluna x=0 majoritariamente branca (linha branca presente)'); failed++; }
  } else {
    console.log('(pngjs indisponivel — geometria + inspecao visual do screenshot)');
  }
  await browser.close();
  console.log(failed ? `\n${failed} FALHA(S)` : '\nOK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar, ver falhar e diagnosticar**

Run: `cd server && node tests/propostaCapaHero.test.js`
Expected: FAIL (geometria e/ou pixel). **Ler o screenshot** (`Read` no PNG) e a geometria impressa para identificar a causa exata (deslocamento do img? padding do hero? object-position?). Ajustar o CSS conforme a causa — candidatos: `object-position: left center` no `.cover-hero img`; garantir `margin/padding 0` e `font-size: 0`/`line-height: 0` no `.cover-hero`; `width: 100%` sem gap no flex.

- [ ] **Step 3: Implementar o fix CSS e ver passar**

Run: `cd server && node tests/propostaCapaHero.test.js && node --check templates/propostaPremiumV2.js`
Expected: OK. Conferir visualmente o screenshot final (deve preencher a horizontal completa).

- [ ] **Step 4: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaCapaHero.test.js
git commit -m "fix(proposta): hero industria40 preenche toda a largura da capa (sem linha branca)"
```

## Task B2 (#4): Telefone/email do cadastro na capa

**Files:**
- Modify: `server/index.js` — SELECTs das rotas `GET /api/propostas/:id/premium` e `GET /api/propostas/:id/pdf` (buscar por `cliente_logo_url` para achá-los; adicionar `c.telefone as cliente_telefone_cadastro, c.email as cliente_email_cadastro`)
- Modify: `server/templates/propostaPremiumV2.js` (~1373–1377, `cover-client-info`)
- Test: `server/tests/propostaCapaContatoCadastro.test.js` (Create)

**Interfaces:**
- Consumes: `proposta.cliente_telefone` / `proposta.cliente_email` (overrides), `proposta.cliente_telefone_cadastro` / `proposta.cliente_email_cadastro` (novos, do JOIN com clientes).
- Produces: linha de Telefone na capa; email com fallback do cadastro.

- [ ] **Step 1: Escrever o teste que falha**

Create `server/tests/propostaCapaContatoCadastro.test.js`:
```javascript
/**
 * #4 — Capa mostra telefone/email vindos do cadastro do cliente (com override
 * da proposta tendo prioridade). Executar: node tests/propostaCapaContatoCadastro.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + ': ' + e.message); } }

const base = { numero_proposta: '1', razao_social: 'ACME' };

test('telefone do cadastro aparece na capa quando nao ha override', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_telefone_cadastro: '(11) 4513-9570' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('cover-field-telefone'), 'faltou a linha de telefone');
  assert(html.includes('(11) 4513-9570'), 'faltou o telefone do cadastro');
});
test('override da proposta tem prioridade sobre o cadastro (telefone)', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_telefone: '(11) 99999-0000', cliente_telefone_cadastro: '(11) 4513-9570' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('(11) 99999-0000'));
});
test('sem telefone em lugar nenhum: mostra travessao', () => {
  const html = gerarHTMLPropostaPremiumV2(base, [], { total: 0 }, null, null, false, true);
  assert(/cover-field-telefone[\s\S]{0,200}—/.test(html), 'esperado fallback —');
});
test('email cai para o cadastro quando a proposta nao tem override', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_email_cadastro: 'cadastro@acme.com' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('cadastro@acme.com'));
});
test('email da proposta (override) tem prioridade', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_email: 'override@acme.com', cliente_email_cadastro: 'cadastro@acme.com' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('override@acme.com'));
  assert(!html.includes('cadastro@acme.com'));
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/propostaCapaContatoCadastro.test.js`
Expected: FAIL (não existe `cover-field-telefone`).

- [ ] **Step 3: Implementar template + SELECTs**

Template (região 1373–1377): após a linha do Email, adicionar:
```javascript
          <p class="cover-field-telefone"><strong>Telefone:</strong> ${esc(proposta.cliente_telefone || proposta.cliente_telefone_cadastro || '—')}</p>
```
E na linha do Email, trocar o fallback:
```javascript
          <p class="cover-field-email"><strong>Email:</strong> <span data-edit="cliente_email">${esc(proposta.cliente_email || proposta.cliente_email_cadastro || '—')}</span></p>
```
`server/index.js`: nos DOIS SELECTs (premium e pdf) que já têm `c.logo_url as cliente_logo_url`, adicionar `c.telefone as cliente_telefone_cadastro, c.email as cliente_email_cadastro`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/propostaCapaContatoCadastro.test.js && node --check templates/propostaPremiumV2.js && node --check index.js`
Expected: `5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/index.js server/tests/propostaCapaContatoCadastro.test.js
git commit -m "fix(proposta): capa mostra telefone e email do cadastro do cliente (override da proposta prevalece)"
```

---

## Integração e revisão (sessão principal)

1. Merge dos dois worktrees na branch de fix (regiões disjuntas; conflitos improváveis).
2. Bateria completa: todos os `server/tests/*.test.js` + jsdom client + overflow do rodapé.
3. **Code review completo** (skill `code-review`) sobre o diff da branch antes de qualquer merge para `main`.
4. Validação visual: screenshots capa/sumário/5.23 quebrada.
