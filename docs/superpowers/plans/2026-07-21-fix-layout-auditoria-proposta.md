# Fix Layout + Auditoria da Proposta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 8 cenários de layout/auditoria da proposta editável (spec: `specs/proposta-editavel/fix-layout-auditoria-2026-07-21.md`).

**Architecture:** Dois subsistemas independentes. **Grupo A** — todas as mudanças de renderização em `server/templates/propostaPremiumV2.js` (+ numeração em `client/src/components/proposta/clausulasInlineEditor.js`); tocam o mesmo template, executar em série. **Grupo B** — auditoria de itens em `server/index.js` + labels em `client/src/components/proposta/HistoricoEdicoes.js`; arquivos disjuntos do Grupo A, pode rodar em paralelo.

**Tech Stack:** Node.js (Express, template literals no template), Puppeteer (validação headless), Jest/jsdom (client), scripts `node` puros (server tests).

## Global Constraints

- Não regredir a Task C anterior: foto do equipamento permanece `float:right` (`.equip-photo-float`), container `.equip-specs-kv` permanece `display:block` com clearfix.
- Toda imagem embutida no template usa base64 via helper `uploadToDataUrl(dir, filename)` — nunca URL HTTP (para o PDF funcionar offline).
- Após qualquer mudança de layout que afete altura (Grupo A), reconfirmar **zero overflow do rodapé** com o script headless (`headless_taskB.js` do scratchpad da sessão anterior, adaptável).
- Rodar `node --check` nos arquivos server alterados antes de commit.
- Cada tarefa termina com commit próprio. Prefixos: `fix(proposta): …`.
- Testes server são scripts `node` puros em `server/tests/*.test.js` (padrão: função `test(name, fn)` com `assert`, imprime `N passed, M failed`). Testes client são Jest via `react-scripts test`.
- Não commitar em `main`. Trabalhar na branch `fix/proposta-layout-auditoria` (já criada, contém a spec).

---

# GRUPO A — Layout do template (subagente 1, série)

Arquivo central: `server/templates/propostaPremiumV2.js`. Função `gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, baseURLOverride, forPdfServer, omitPrintBar)` (linha 37). Assinatura de teste — reusar `render_test.js`/`headless_taskB.js` do scratchpad como base para os testes headless.

## Task A1: Seção 5.23 fixa (preço dinâmico + FINAME/fiscal) nos dois caminhos

**Contexto:** hoje a 5.23 + tabela de preços + FINAME + fiscais existem só no bloco hardcoded (linhas ~787–912). No caminho `clausulasSection` (custom/inline, linhas ~455–516) somem. Extrair para uma constante única e injetar nos dois caminhos.

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` (extrair `sec523PrecoHtml`; usar em `clausulasSection` e no fallback hardcoded)
- Test: `server/tests/proposta523Fixa.test.js` (Create)

**Interfaces:**
- Consumes: `tabelaPrecosRows` (linha ~435), `totais.total`, `moedaBRL`, `esc` — já no escopo da função.
- Produces: constante `sec523PrecoHtml` (string HTML) contendo `<h3>5.23 PREÇO…</h3>` + tabela de preços dinâmica + tabela FINAME/BNDES + tabelas fiscais. Marcada com `data-page-break="before"` no elemento raiz (usada pela Task A3).

- [ ] **Step 1: Escrever o teste que falha**

Create `server/tests/proposta523Fixa.test.js`:
```javascript
/**
 * A seção 5.23 (preço + FINAME + fiscais) deve renderizar TAMBÉM no caminho
 * de cláusulas customizadas/inline (não só no hardcoded).
 * Executar: node tests/proposta523Fixa.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); } }

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '21/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

test('caminho custom/inline contém a 5.23 PREÇO', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  assert(html.includes('5.23 PREÇO'), 'faltou título 5.23 no caminho custom');
});
test('caminho custom/inline contém a tabela FINAME/BNDES', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  assert(html.includes('Ref. FINAME') && html.includes('04051088'), 'faltou tabela FINAME no caminho custom');
});
test('caminho custom/inline contém a tabela de preços com o total', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  assert(html.includes('TOTAL DA PROPOSTA'), 'faltou tabela de preços no caminho custom');
});
test('caminho hardcoded (sem custom) mantém a 5.23', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, null, null, false, true);
  assert(html.includes('5.23 PREÇO'), 'regrediu a 5.23 no hardcoded');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/proposta523Fixa.test.js`
Expected: FAIL nos 3 primeiros testes (5.23 ausente no caminho custom).

- [ ] **Step 3: Extrair `sec523PrecoHtml` e injetar nos dois caminhos**

Antes do bloco `blocksHtml` (linha ~518), definir a constante `sec523PrecoHtml` movendo o HTML atual das linhas ~787–912 (o `<section class="… five-23-preco-group">` de PREÇO/pagamento + a section FINAME + a section de fiscais). Adicionar `data-page-break="before"` no elemento raiz da 5.23:
```javascript
const sec523PrecoHtml = `
  <section class="block stack-md" data-page-break="before">
    <section class="block stack-md allow-break">
      <h3>5.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS</h3>
      <p>A CONTRATANTE pagará … (texto atual das linhas 790)</p>
    </section>
    <section class="block stack-md allow-break">
      <div class="table-caption">Tabela de Preços</div>
      <table class="table"> … thead atual … <tbody>
        ${tabelaPrecosRows || '<tr><td colspan="5" class="muted">Nenhum item cadastrado.</td></tr>'}
        <tr><td class="col-center" colspan="4"><strong>TOTAL DA PROPOSTA</strong></td>
            <td class="col-right"><strong>${esc(moedaBRL(totais.total))}</strong></td></tr>
      </tbody></table>
    </section>
    <section class="block stack-md allow-break"> … condição de pagamento (linhas 816-819) … </section>
    <section class="block stack-md allow-break finame-compact"> … tabela FINAME (linhas 823-849) … </section>
    <section class="block stack-md allow-break"> … impostos/fiscais (linhas 851-912) … </section>
  </section>`;
```
(Copiar o conteúdo interno **verbatim** das linhas atuais 787–912. Preservar classes e dados.)

No caminho `clausulasSection` (custom, retorno na linha ~507–513): inserir `${sec523PrecoHtml}` **entre** as `demaisClausulas` (5.1–5.22) e a `<section>` de assinaturas. Como a 5.24 vem das cláusulas custom (getClausulasDefault tem 5.24), garantir a ordem: cláusulas 5.1–5.22 → `sec523PrecoHtml` → cláusula 5.24 → assinaturas. Para isso, separar da lista custom a cláusula cujo `numero === '5.24'` e emiti-la depois da 5.23.

No fallback hardcoded (`blocksHtml`, linhas ~556–952): substituir o bloco inline atual das linhas 787–912 por `${sec523PrecoHtml}` (mantém render idêntico, agora com o marcador de quebra).

- [ ] **Step 4: Rodar e ver passar + `node --check`**

Run: `cd server && node tests/proposta523Fixa.test.js && node --check templates/propostaPremiumV2.js`
Expected: `4 passed, 0 failed` e sem erro de sintaxe.

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/proposta523Fixa.test.js
git commit -m "fix(proposta): 5.23 (preco/FINAME/fiscais) sempre visivel no caminho inline, em pagina propria"
```

## Task A2: Reservar slot 5.23 na renumeração (client)

**Files:**
- Modify: `client/src/components/proposta/clausulasInlineEditor.js:183-197` (`renumerarClausulas`)
- Test: `client/src/components/proposta/clausulasInlineEditor.test.js` (adicionar casos)

**Interfaces:**
- Consumes: DOM `#proposalSource [data-clausula-key]` (jsdom).
- Produces: `renumerarClausulas(doc)` numera 5.1…5.22 e, da 23ª cláusula em diante, **pula 23** (23ª → 5.24, 24ª → 5.25…).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `describe`/corpo de `clausulasInlineEditor.test.js`:
```javascript
test('renumerarClausulas reserva o slot 23 (23a clausula vira 5.24)', () => {
  const doc = criarSourceComN(24); // helper: cria #proposalSource com 24 secoes data-clausula-key
  renumerarClausulas(doc);
  const titulos = Array.from(doc.querySelectorAll('[data-clausula-campo="titulo"]')).map(e => e.textContent.split(' ')[0]);
  expect(titulos[21]).toBe('5.22'); // 22a
  expect(titulos[22]).toBe('5.24'); // 23a pula o 23
  expect(titulos[23]).toBe('5.25'); // 24a
});
```
Se não existir helper `criarSourceComN`, criá-lo no topo do arquivo de teste:
```javascript
function criarSourceComN(n) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="proposalSource"></div>');
  const doc = dom.window.document;
  const src = doc.getElementById('proposalSource');
  for (let i = 0; i < n; i++) {
    const s = doc.createElement('section');
    s.setAttribute('data-clausula-key', `k${i}`);
    const h = doc.createElement('h3');
    h.setAttribute('data-clausula-campo', 'titulo');
    h.textContent = `5.${i + 1} TITULO`;
    s.appendChild(h);
    src.appendChild(s);
  }
  return doc;
}
```
(Se o arquivo de teste já roda em ambiente jsdom pelo Jest, usar `document.implementation.createHTMLDocument` em vez de exigir `jsdom` — seguir o padrão já usado nos testes existentes do arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/components/proposta/clausulasInlineEditor.test.js --watchAll=false`
Expected: FAIL no caso novo (23ª vira 5.23, esperado 5.24).

- [ ] **Step 3: Implementar a reserva do slot 23**

Em `renumerarClausulas` (linha ~193), trocar o cálculo do número:
```javascript
  secoes.forEach((secao, i) => {
    const tituloEl = secao.querySelector('[data-clausula-campo="titulo"]');
    if (!tituloEl) return;
    const atual = tituloEl.textContent || '';
    const semPrefixo = atual.replace(/^\s*\d+\.\d+\s*/, '').trimStart();
    const n = (i + 1) < 23 ? (i + 1) : (i + 2); // reserva o slot 23 para a 5.23 fixa
    const novoTitulo = `5.${n} ${semPrefixo}`.trimEnd();
    if (tituloEl.textContent !== novoTitulo) tituloEl.textContent = novoTitulo;
  });
```

- [ ] **Step 4: Rodar e ver passar (suite inteira)**

Run: `cd client && CI=true npx react-scripts test src/components/proposta/clausulasInlineEditor.test.js --watchAll=false`
Expected: PASS em todos (os 27 anteriores + os novos).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/proposta/clausulasInlineEditor.js client/src/components/proposta/clausulasInlineEditor.test.js
git commit -m "fix(proposta): renumeracao reserva o slot 5.23 para a secao fixa de preco"
```

## Task A3: Quebra de página antes da seção 5, da 5.23 e da 5.24

**Contexto:** o paginador embutido (`paginateProposalContent`, região ~1590–1740) percorre os filhos-raiz de `#proposalSource` e os posiciona em páginas de altura fixa. Adicionar suporte a `data-page-break="before"`: quando um bloco tem esse atributo e a página corrente já recebeu ≥1 bloco, fechar a página e abrir uma nova antes de posicioná-lo.

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` — (a) marcar os 3 blocos; (b) lógica no paginador.
- Test: `server/tests/propostaQuebras.test.js` (Create) — headless via Puppeteer.

**Interfaces:**
- Consumes: `data-page-break="before"` já posto na 5.23 (Task A1). Adicionar o mesmo atributo no wrapper de abertura da seção 5 (`five-intro-group`, tanto no caminho custom linha ~508 quanto hardcoded linha ~556) e na 5.24 (custom: a `<section>` da cláusula 5.24; hardcoded: linha ~914).
- Produces: paginação onde a seção 5, a 5.23 e a 5.24 iniciam em páginas distintas.

- [ ] **Step 1: Escrever o teste headless que falha**

Create `server/tests/propostaQuebras.test.js`:
```javascript
/**
 * Verifica que a secao 5, a 5.23 e a 5.24 iniciam em paginas diferentes.
 * Executar: node tests/propostaQuebras.test.js  (usa puppeteer)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');
const puppeteer = require('puppeteer');

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '21/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

(async () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  const tmp = path.join(os.tmpdir(), 'quebras.html'); fs.writeFileSync(tmp, html);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300 });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    const vis = Array.from(document.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
    const idxDe = (txt) => vis.findIndex(p => (p.textContent || '').includes(txt));
    // primeira pagina de cada marco
    const pSecao5 = vis.findIndex(p => (p.textContent || '').includes('CONDIÇÕES GERAIS DE FORNECIMENTO'));
    const p523 = vis.findIndex(p => (p.textContent || '').includes('5.23 PREÇO'));
    const p524 = vis.findIndex(p => (p.textContent || '').includes('5.24 CONSIDERAÇÃO FINAL'));
    // a pagina onde a 5.23 começa NAO deve conter uma clausula 5.22 (nao mistura)
    const pg523 = vis[p523];
    const misturou = pg523 ? /5\.22\s/.test(pg523.textContent) : true;
    return { pSecao5, p523, p524, misturou };
  });
  await browser.close();
  const ok = r.pSecao5 >= 0 && r.p523 > r.pSecao5 && r.p524 > r.p523 && !r.misturou;
  console.log(JSON.stringify(r));
  console.log(ok ? '✓ quebras corretas' : '✗ quebras incorretas');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/propostaQuebras.test.js`
Expected: FAIL (5.23 compartilha página com 5.22, ou marcos não estão em páginas distintas).

- [ ] **Step 3: Marcar os blocos + implementar a quebra no paginador**

(a) Adicionar `data-page-break="before"` em: wrapper `five-intro-group` (custom ~508 e hardcoded ~556) e na `<section>` da 5.24 (custom: identificar a cláusula `numero==='5.24'` e adicionar o atributo no seu `<section>`; hardcoded ~914). A 5.23 já tem (Task A1).

(b) No paginador (`paginateProposalContent`), no loop que move cada `block` para a `pageContent` corrente, antes de anexar o bloco:
```javascript
// força página nova quando o bloco pede quebra e a página atual já tem conteúdo
if (block.getAttribute && block.getAttribute('data-page-break') === 'before'
    && pageContent.children.length > 0) {
  page = novaPagina();            // usar a mesma rotina que cria/append de página do loop
  pageContent = page.querySelector('.page-content');
}
```
Adaptar aos nomes reais das variáveis/funções do loop (ler a região ~1590–1740 antes de editar). O atributo deve ser lido do clone visível (é preservado por `cloneNode`).

- [ ] **Step 4: Rodar e ver passar + re-checar overflow**

Run: `cd server && node tests/propostaQuebras.test.js && node --check templates/propostaPremiumV2.js`
Expected: `✓ quebras corretas`. Depois rodar o `headless_taskB.js` adaptado para confirmar **zero overflow** do rodapé.

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaQuebras.test.js
git commit -m "fix(proposta): secao 5, 5.23 e 5.24 iniciam em pagina nova (data-page-break)"
```

## Task A4: "Descritivo técnico" como primeiro item do bloco 4.x

**Files:**
- Modify: `server/templates/propostaPremiumV2.js:401-414` (bloco `equip-specs-kv`)
- Test: `server/tests/propostaDescritivoOrdem.test.js` (Create)

**Interfaces:**
- Consumes: `descritivoTec`, `nome`, `fotoHtml`, `specRowsHtml` (já no escopo do `.map` de itens).
- Produces: ordem no `equip-specs-kv`: foto (float) → **Descritivo técnico** → Equipamento → Código → Quantidade → Modelo → Família → Categoria → NCM → specs.

- [ ] **Step 1: Escrever o teste que falha**

Create `server/tests/propostaDescritivoOrdem.test.js`:
```javascript
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed = 0, failed = 0;
function test(n, f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

const itens = [{ produto_nome: 'Masseira XPTO', quantidade: 2, unidade: 'UN', valor_unitario: 1, valor_total: 2,
  descritivo_tecnico: 'DESCRITIVO_MARCADOR' }];
const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '1' }, itens, { total: 2 }, null, null, false, true);

test('Descritivo técnico aparece antes de "Equipamento:"', () => {
  const iDesc = html.indexOf('DESCRITIVO_MARCADOR');
  const iEquip = html.indexOf('<strong>Equipamento:</strong>');
  assert(iDesc > -1 && iEquip > -1, 'marcadores ausentes');
  assert(iDesc < iEquip, 'descritivo deveria vir antes de Equipamento');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/propostaDescritivoOrdem.test.js`
Expected: FAIL (descritivo vem depois hoje).

- [ ] **Step 3: Reordenar o bloco**

No `return` do `.map` de itens (linhas ~401–414), mover o trecho do descritivo técnico para logo após `${fotoHtml}` (primeiro item textual), antes do `<p><strong>Equipamento:</strong>…`:
```javascript
return `
  <h3>${itemNo} ${nome}</h3>
  <div class="equip-specs-kv">
    ${fotoHtml}
    ${descritivoTec ? `<p><strong>Descritivo técnico:</strong></p><div class="equip-descritivo">${descritivoTec}</div>` : ''}
    <p><strong>Equipamento:</strong> ${nome}</p>
    ${codigo !== '—' ? `<p><strong>Código:</strong> ${codigo}</p>` : ''}
    <p><strong>Quantidade:</strong> ${qtd} ${und}</p>
    ${modelo !== '—' ? `<p><strong>Modelo:</strong> ${modelo}</p>` : ''}
    ${familia !== '—' ? `<p><strong>Família:</strong> ${familia}</p>` : ''}
    ${categoria !== '—' ? `<p><strong>Categoria:</strong> ${categoria}</p>` : ''}
    ${ncm !== '—' ? `<p><strong>NCM:</strong> ${ncm}</p>` : ''}
    ${specRowsHtml}
  </div>`;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/propostaDescritivoOrdem.test.js && node --check templates/propostaPremiumV2.js`
Expected: `1 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaDescritivoOrdem.test.js
git commit -m "fix(proposta): descritivo tecnico como primeiro item do bloco de equipamento"
```

## Task A5: Mais espaçamento entre linhas do descritivo técnico

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` (CSS `.equip-descritivo` / `.equip-specs-kv > p`, região ~1282–1284)
- Test: sem unit test dedicado; validação por presença de CSS + re-check de overflow.

- [ ] **Step 1: Ajustar o CSS**

Na região do CSS `.equip-specs-kv`, adicionar/ajustar:
```css
.equip-specs-kv > p { margin: 0 0 3px 0; font-size: 10pt; line-height: 1.6; }
.equip-descritivo { line-height: 1.6; }
.equip-descritivo p { margin: 0 0 4px 0; line-height: 1.6; }
```

- [ ] **Step 2: `node --check` + re-check de overflow**

Run: `cd server && node --check templates/propostaPremiumV2.js`
Depois: rodar `headless_taskB.js` adaptado — confirmar **0 overflow** do rodapé em todas as páginas (o aumento de entrelinha não pode reintroduzir corte).
Expected: sem erro de sintaxe; `Task B: ✓ NENHUM bloco ultrapassa o rodapé`.

- [ ] **Step 3: Commit**

```bash
git add server/templates/propostaPremiumV2.js
git commit -m "fix(proposta): aumentar entrelinha dos descritivos tecnicos (leitura)"
```

## Task A6: Número da proposta no header (2 linhas) + diagnóstico prod

**Files:**
- Modify: `server/templates/propostaPremiumV2.js:960-963` (header center box) + CSS
- Test: `server/tests/propostaHeaderNumero.test.js` (Create)

**Interfaces:**
- Consumes: `numero` (linha 109).
- Produces: header com título e número em elementos/linhas separados.

- [ ] **Step 1: Escrever o teste que falha**

Create `server/tests/propostaHeaderNumero.test.js`:
```javascript
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}
const html = gerarHTMLPropostaPremiumV2({ numero_proposta: 'PROP-777' }, [], { total: 0 }, null, null, false, true);
test('header tem o titulo e o numero em linhas separadas', () => {
  assert(html.includes('PROPOSTA TÉCNICA COMERCIAL'), 'faltou titulo');
  assert(html.includes('page-header-num') && html.includes('Nº PROP-777'), 'faltou numero em elemento proprio');
  // o numero NAO deve estar colado na mesma <p> do titulo (linha separada)
  assert(!/PROPOSTA TÉCNICA COMERCIAL Nº PROP-777/.test(html), 'numero ainda inline na mesma linha do titulo');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/propostaHeaderNumero.test.js`
Expected: FAIL (hoje é `PROPOSTA TÉCNICA COMERCIAL Nº ${numero}` numa linha só).

- [ ] **Step 3: Separar em duas linhas**

Linha ~961, trocar por:
```javascript
<p class="page-header-title">PROPOSTA TÉCNICA COMERCIAL</p>
<p class="page-header-num">Nº ${numero}</p>
```
Adicionar CSS perto de `.page-header-title` (~1143):
```css
.page-header-num { font-size: 9pt; font-weight: 700; color: var(--blue-900); margin: 0 0 1mm 0; line-height: 1.15; text-align: center; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/propostaHeaderNumero.test.js && node --check templates/propostaPremiumV2.js`
Expected: `1 passed, 0 failed`.

- [ ] **Step 5: Diagnóstico prod (documentar, não bloquear)**

Adicionar nota ao final de `specs/proposta-editavel/fix-layout-auditoria-2026-07-21.md` na seção #6: o header padrão agora tem o número em linha própria; se em prod o número continuar ausente, a causa é `proposta_template_config.header_image_url` apontando para imagem custom (esconde `.page-header-inner`). Ação recomendada: anular `header_image_url` no registro de prod. **Não** alterar dados de prod nesta tarefa.

- [ ] **Step 6: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaHeaderNumero.test.js specs/proposta-editavel/fix-layout-auditoria-2026-07-21.md
git commit -m "fix(proposta): numero da proposta em linha propria no header + nota de diagnostico prod"
```

## Task A7: Logo do cliente na capa

**Files:**
- Modify: `server/templates/propostaPremiumV2.js` (embed do logo perto da linha 88–109; render na capa ~1338–1347) + CSS
- Test: `server/tests/propostaCapaLogoCliente.test.js` (Create)

**Interfaces:**
- Consumes: `proposta.cliente_logo_url` (já vem de `/premium` e `/pdf`); helper `uploadToDataUrl(uploadsLogosDir, file)`; `uploadsLogosDir` — confirmar import no topo do módulo (é exportado por `config/paths.js`; se não estiver importado aqui, adicionar).
- Produces: `<div class="cover-client-logo"><img …></div>` acima de `.cover-client-info` quando há logo.

- [ ] **Step 1: Escrever o teste que falha**

Create `server/tests/propostaCapaLogoCliente.test.js`:
```javascript
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

test('sem cliente_logo_url: não renderiza cover-client-logo', () => {
  const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '1' }, [], { total: 0 }, null, null, false, true);
  assert(!html.includes('cover-client-logo'), 'não deveria ter logo do cliente');
});
test('com cliente_logo_url inexistente no disco: degrada sem quebrar (sem <img> quebrada)', () => {
  const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '1', cliente_logo_url: 'nao-existe.png' }, [], { total: 0 }, null, null, false, true);
  // aceitável: ou não renderiza o bloco, ou renderiza com onerror. Não deve lançar.
  assert(typeof html === 'string' && html.length > 0);
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
```
(Teste de presença positiva do `<img>` com base64 é coberto na validação manual/headless, pois exige um arquivo real em `uploads/logos`.)

- [ ] **Step 2: Rodar e ver o baseline**

Run: `cd server && node tests/propostaCapaLogoCliente.test.js`
Expected: 1º teste PASSA (ainda não existe `cover-client-logo`); serve de guarda de regressão. Prosseguir para implementar o render positivo.

- [ ] **Step 3: Embed do logo + render na capa**

Perto do bloco onde outras imagens viram base64 (após linha ~109), adicionar:
```javascript
const clienteLogoB64 = (proposta.cliente_logo_url && String(proposta.cliente_logo_url).trim())
  ? (uploadToDataUrl(uploadsLogosDir, String(proposta.cliente_logo_url).trim()) || null)
  : null;
```
Garantir que `uploadsLogosDir` esteja acessível (importar de `config/paths.js` se necessário, seguindo o padrão dos outros dirs no topo do arquivo).

Na capa, logo antes de `<div class="cover-client-info">` (linha ~1341):
```javascript
${clienteLogoB64 ? `<div class="cover-client-logo"><img src="${clienteLogoB64}" alt="Logo do cliente" /></div>` : ''}
```
CSS perto de `.cover-client-info` (~1251):
```css
.cover-client-logo { text-align: center; margin: 0 0 4mm 0; }
.cover-client-logo img { max-height: 25mm; max-width: 60%; object-fit: contain; }
```

- [ ] **Step 4: Rodar testes de guarda + `node --check`**

Run: `cd server && node tests/propostaCapaLogoCliente.test.js && node --check templates/propostaPremiumV2.js`
Expected: `2 passed, 0 failed`. (Presença visual do logo real fica para validação no Chrome.)

- [ ] **Step 5: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaCapaLogoCliente.test.js
git commit -m "fix(proposta): logo do cliente na capa acima do nome (quando cadastrada)"
```

---

# GRUPO B — Auditoria de itens (subagente 2, paralelo ao Grupo A)

## Task B1: Diff de itens no save → registrarEdicaoLog

**Contexto:** o PUT de proposta (`server/index.js`, região ~7639–7770) já carrega `itensAtuais` (linha 7639) e os `itensNovos` (`itens`). Antes do `DELETE FROM proposta_itens` (linha 7746), computar diff e registrar no log.

**Files:**
- Modify: `server/index.js` (adicionar função `diffItensParaLog` + chamadas de log na região ~7686–7746; `registrarEdicaoLog` já existe na 5443)
- Test: `server/tests/propostaDiffItens.test.js` (Create) — testa a função pura de diff

**Interfaces:**
- Consumes: `itensAtuais` (rows do banco), `itensNovos` (payload), `registrarEdicaoLog(propostaId, usuarioId, usuarioNome, tipo, campo, clausulaId, valorAnterior, valorNovo)`.
- Produces: função exportável/testável `diffItensParaLog(itensAtuais, itensNovos)` → `{ adicionados: [...], removidos: [...], editados: [{campo, antes, depois, nome}] }`. Tipos de log: `item_adicionado`, `item_removido`, `item_editado`.

- [ ] **Step 1: Escrever o teste que falha**

Create `server/tests/propostaDiffItens.test.js`:
```javascript
const assert = require('assert');
// A função é exportada de um módulo dedicado para ser testável sem subir o servidor.
const { diffItensParaLog } = require('../propostaItensDiff');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

const chave = (i) => i.codigo_produto || i.descricao;

test('detecta item adicionado', () => {
  const d = diffItensParaLog([], [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }]);
  assert.strictEqual(d.adicionados.length, 1);
  assert.strictEqual(d.removidos.length, 0);
});
test('detecta item removido', () => {
  const d = diffItensParaLog([{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }], []);
  assert.strictEqual(d.removidos.length, 1);
});
test('detecta item editado (quantidade)', () => {
  const antes = [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }];
  const depois = [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 3, valor_unitario: 10 }];
  const d = diffItensParaLog(antes, depois);
  assert.strictEqual(d.adicionados.length, 0);
  assert.strictEqual(d.removidos.length, 0);
  assert.strictEqual(d.editados.length, 1);
  assert.strictEqual(d.editados[0].campo, 'quantidade');
  assert.strictEqual(String(d.editados[0].antes), '1');
  assert.strictEqual(String(d.editados[0].depois), '3');
});
test('sem mudança: nada', () => {
  const x = [{ codigo_produto: 'A', descricao: 'M', quantidade: 1, valor_unitario: 10 }];
  const d = diffItensParaLog(x, x.map(o => ({ ...o })));
  assert.strictEqual(d.adicionados.length + d.removidos.length + d.editados.length, 0);
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/propostaDiffItens.test.js`
Expected: FAIL (`Cannot find module '../propostaItensDiff'`).

- [ ] **Step 3: Criar o módulo de diff**

Create `server/propostaItensDiff.js`:
```javascript
// Diff de itens de proposta para auditoria (add/edit/remove). Puro, testável.
function chaveDe(item) {
  return String(item.codigo_produto || item.descricao || item.nome || '').trim();
}
function nomeDe(item) {
  return String(item.descricao || item.nome || item.codigo_produto || 'item').trim();
}
const CAMPOS = ['quantidade', 'valor_unitario', 'valor_total', 'modelo', 'descritivo_tecnico'];

function diffItensParaLog(itensAtuais, itensNovos) {
  const antesMap = new Map((itensAtuais || []).map((i) => [chaveDe(i), i]));
  const depoisMap = new Map((itensNovos || []).map((i) => [chaveDe(i), i]));
  const adicionados = [], removidos = [], editados = [];

  for (const [k, novo] of depoisMap) {
    if (!antesMap.has(k)) { adicionados.push(novo); continue; }
    const antigo = antesMap.get(k);
    for (const campo of CAMPOS) {
      const a = antigo[campo] == null ? '' : String(antigo[campo]);
      const b = novo[campo] == null ? '' : String(novo[campo]);
      if (a !== b) editados.push({ campo, antes: antigo[campo], depois: novo[campo], nome: nomeDe(novo) });
    }
  }
  for (const [k, antigo] of antesMap) {
    if (!depoisMap.has(k)) removidos.push(antigo);
  }
  return { adicionados, removidos, editados };
}
module.exports = { diffItensParaLog, chaveDe, nomeDe };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/propostaDiffItens.test.js`
Expected: `4 passed, 0 failed`.

- [ ] **Step 5: Ligar no endpoint de update**

Em `server/index.js`: importar no topo (`const { diffItensParaLog, nomeDe } = require('./propostaItensDiff');`). Na região ~7686 (após ter `itensAtuais` e `itensNovos`, antes/junto do fluxo de update), obter usuário (`const usuarioId = req.user?.id; const usuarioNome = req.user?.nome || 'N/A';` — seguir o padrão exato de como os outros logs pegam o usuário neste arquivo) e:
```javascript
const diffItens = diffItensParaLog(itensAtuais || [], itensNovos);
diffItens.adicionados.forEach((it) => registrarEdicaoLog(id, usuarioId, usuarioNome, 'item_adicionado', 'item', null, null, nomeDe(it)));
diffItens.removidos.forEach((it) => registrarEdicaoLog(id, usuarioId, usuarioNome, 'item_removido', 'item', null, nomeDe(it), null));
diffItens.editados.forEach((e) => registrarEdicaoLog(id, usuarioId, usuarioNome, 'item_editado', e.campo, null, e.antes == null ? null : String(e.antes), e.depois == null ? null : String(e.depois)));
```
Posicionar as chamadas onde `id`, `req.user` e `registrarEdicaoLog` estão em escopo. Não alterar a lógica de revisão existente.

- [ ] **Step 6: `node --check` + commit**

Run: `cd server && node --check index.js && node tests/propostaDiffItens.test.js`
Expected: sem erro; `4 passed`.
```bash
git add server/propostaItensDiff.js server/tests/propostaDiffItens.test.js server/index.js
git commit -m "feat(proposta): auditoria de inclusao/edicao/remocao de itens no historico"
```

## Task B2: Humanizar novos tipos no HistoricoEdicoes + doc

**Files:**
- Modify: `client/src/components/proposta/HistoricoEdicoes.js:6` (mapa `LABELS`)
- Modify: `specs/proposta-editavel/auditoria.md` (tabela de tipos)
- Test: sem unit test (mapa estático); validação visual.

- [ ] **Step 1: Adicionar labels**

No objeto `LABELS` (linha ~6), acrescentar:
```javascript
  item_adicionado: 'Produto adicionado',
  item_editado: 'Produto editado',
  item_removido: 'Produto removido',
```

- [ ] **Step 2: Atualizar `auditoria.md`**

Adicionar à tabela "O que é registrado" as três linhas: `item_adicionado` / `item_editado` (com `campo`, `valor_anterior`, `valor_novo`) / `item_removido`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/proposta/HistoricoEdicoes.js specs/proposta-editavel/auditoria.md
git commit -m "feat(proposta): humanizar tipos de auditoria de itens no historico"
```

---

## Ordem de execução e delegação

- **Grupo A** (Tasks A1→A7) — um subagente, **em série** (mesmo arquivo `propostaPremiumV2.js`). A2 (client) pode ir junto pois é o par lógico da A1.
- **Grupo B** (Tasks B1→B2) — um subagente, **em paralelo** ao Grupo A (arquivos disjuntos).
- Ao final, integrar: rodar toda a bateria de testes server (`node tests/*.test.js`) + client (`react-scripts test`) + headless de overflow, e a validação manual no Chrome dos itens visuais (#6 header, #8 logo, aparência da 5.23).
