# Edição Inline das Cláusulas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o painel lateral `EditorClausulas.js` por edição direta da seção 5 (Condições Gerais de Fornecimento) no próprio preview da proposta, mantendo granularidade por cláusula (título/conteúdo/ordem individuais, auditável) e sem quebrar o paginador client-side existente.

**Architecture:** O HTML gerado por `gerarHTMLPropostaPremiumV2` já contém um container oculto `#proposalSource` (fonte da verdade, sem paginação) e um paginador (`paginateProposalContent()`) que recria as páginas visíveis clonando esse container. A edição inline torna os blocos de cláusula (já identificados por `data-clausula-key`/`data-clausula-campo`) editáveis nas páginas visíveis; toda edição é sincronizada de volta para `#proposalSource` antes de repaginar (debounced para texto, síncrono para ações estruturais), preservando o WYSIWYG sem perder o que o usuário digitou. `PropostaPreviewEditavel.js` unifica o salvamento das cláusulas no fluxo existente de "Alterações pendentes".

**Tech Stack:** React (CRA/`react-scripts`), Node/Express + sqlite3, Puppeteer (server), Jest + jsdom (via `react-scripts test`, client).

## Global Constraints

- Spec de referência: `specs/proposta-editavel/edicao-inline-clausulas-design.md` — qualquer dúvida de comportamento remete a ela.
- Escopo: só a seção 5 (cláusulas). Seções 1-4 e a tabela FINAME continuam fixas — não tocar.
- Não introduzir rich-text/formatação nova; cláusulas continuam texto simples convertido em parágrafos (`\n\n` → `<p>`), como hoje.
- Não usar drag-and-drop; reordenar é só pelos botões ↑/↓.
- `proposta_clausulas.titulo` já armazena `"{numero} {titulo}"` concatenado (ex.: `"5.4 GARANTIA"`) — ver Task 2 para o porquê disso importar.
- Manter compatibilidade com `/premium` (sem `embed=1`) e `/pdf`, que não devem mudar de comportamento.
- Commits pequenos e frequentes, um por task, seguindo o padrão de mensagens já usado neste branch (`feat(proposta): ...`, `test(proposta): ...`).

---

### Task 1: Atributos `data-clausula-key`/`data-clausula-campo` no template

**Files:**
- Modify: `server/templates/propostaPremiumV2.js:478-502` (função `renderClausulaCustom` e o `return` de `clausulasSection`)
- Test: `server/tests/propostaClausulasInline.test.js` (novo)

**Interfaces:**
- Produces: cada `<section>` de cláusula em `clausulasSection` passa a ter `data-clausula-key="{id}"` (cláusula persistida, com `id` numérico) ou `data-clausula-key="default-{numero}"` (cláusula vinda de `getClausulasDefault()`, sem `id`); o `<h3>` interno tem `data-clausula-campo="titulo"`; o `<div class="stack-sm">` de conteúdo tem `data-clausula-campo="conteudo"`. Esses atributos são consumidos pelo módulo `clausulasInlineEditor.js` (Task 3) e pelos testes deste projeto.

- [ ] **Step 1: Escrever o teste (vai falhar, os atributos ainda não existem)**

Criar `server/tests/propostaClausulasInline.test.js`:

```js
/**
 * Testa os atributos data-clausula-key/data-clausula-campo usados pela edição inline
 * da seção 5 (cláusulas). Executar: node tests/propostaClausulasInline.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

const proposta = {
  numero_proposta: '01260508/R00',
  razao_social: 'Empresa Teste Ltda',
  cnpj: '12.345.678/0001-99',
  cliente_email: 'teste@exemplo.com.br',
  responsavel_nome: 'Fulano de Tal',
};
const itens = [{
  produto_nome: 'Equipamento Teste',
  quantidade: 1, unidade: 'UN', modelo: 'MOD-1',
  valor_unitario: 1000, valor_total: 1000,
}];
const totais = { subtotal: 1000, icms: 0, ipi: 0, total: 1000, dataEmissao: '01/01/2026', dataValidade: '15/01/2026' };

test('cláusula persistida (com id) gera data-clausula-key igual ao id', () => {
  const templateConfig = {
    clausulas_custom: [
      { id: 42, titulo: '5.21 FORO', conteudo: 'Texto do foro.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('data-clausula-key="42"'), 'esperava data-clausula-key="42"');
  assert.ok(/data-clausula-key="42"[^>]*>\s*<h3 data-clausula-campo="titulo">/.test(html)
    || html.includes('<h3 data-clausula-campo="titulo">5.21 FORO'), 'esperava <h3 data-clausula-campo="titulo"> com o título');
  assert.ok(html.includes('data-clausula-campo="conteudo"'), 'esperava data-clausula-campo="conteudo" no container do texto');
});

test('cláusula default (sem id, com numero) gera data-clausula-key="default-{numero}"', () => {
  const templateConfig = {
    clausulas_custom: [
      { numero: '5.4', titulo: 'GARANTIA', conteudo: 'Texto da garantia.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('data-clausula-key="default-5.4"'), 'esperava data-clausula-key="default-5.4"');
});

test('primeira cláusula da lista também recebe os atributos (fica aninhada no wrapper five-intro-group)', () => {
  const templateConfig = {
    clausulas_custom: [
      { id: 1, titulo: '5.1 PRAZO DE ENTREGA', conteudo: 'Texto 1.' },
      { id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'Texto 2.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('data-clausula-key="1"'), 'primeira cláusula (id 1) deveria ter data-clausula-key="1"');
  assert.ok(html.includes('data-clausula-key="2"'), 'segunda cláusula (id 2) deveria ter data-clausula-key="2"');
  const idxWrapper = html.indexOf('five-intro-group');
  const idxKey1 = html.indexOf('data-clausula-key="1"');
  assert.ok(idxKey1 > idxWrapper && idxKey1 < html.indexOf('data-clausula-key="2"'), 'data-clausula-key="1" deveria aparecer dentro do wrapper five-intro-group, antes da key="2"');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd server && node tests/propostaClausulasInline.test.js`
Expected: FAIL nas duas primeiras asserções (`data-clausula-key` ainda não existe no HTML gerado).

- [ ] **Step 3: Implementar os atributos em `propostaPremiumV2.js`**

Localizar o bloco (por volta da linha 478) e substituir:

```js
        const renderClausulaCustom = (c) => {
          const raw = c.conteudo || '';
          // If content has no HTML tags, treat as plain text: wrap each paragraph in <p>
          const html = /<[a-z][\s\S]*>/i.test(raw)
            ? raw
            : raw.split(/\n{2,}/).map(p => `<p>${esc(p.trim())}</p>`).join('') || '<p></p>';
          return `<section class="block stack-md allow-break">
            <h3>${esc(c.titulo)}</h3>
            <div class="stack-sm">${html}</div>
          </section>`;
        };
```

por:

```js
        const clausulaKey = (c, idx) => (c.id != null ? String(c.id) : `default-${c.numero || idx}`);
        const renderClausulaCustom = (c, idx) => {
          const raw = c.conteudo || '';
          // If content has no HTML tags, treat as plain text: wrap each paragraph in <p>
          const html = /<[a-z][\s\S]*>/i.test(raw)
            ? raw
            : raw.split(/\n{2,}/).map(p => `<p>${esc(p.trim())}</p>`).join('') || '<p></p>';
          return `<section class="block stack-md allow-break" data-clausula-key="${esc(clausulaKey(c, idx))}">
            <h3 data-clausula-campo="titulo">${esc(c.titulo)}</h3>
            <div class="stack-sm" data-clausula-campo="conteudo">${html}</div>
          </section>`;
        };
```

E, alguns blocos abaixo, substituir:

```js
        return `
          <section class="block stack-md avoid-break five-intro-group">
            <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
            ${primeiraClausula ? renderClausulaCustom(primeiraClausula) : ''}
          </section>
          ${demaisClausulas.map(renderClausulaCustom).join('')}
          <section class="block stack-md allow-break">${assinaturasHtml}</section>`;
```

por:

```js
        return `
          <section class="block stack-md avoid-break five-intro-group">
            <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
            ${primeiraClausula ? renderClausulaCustom(primeiraClausula, 0) : ''}
          </section>
          ${demaisClausulas.map(renderClausulaCustom).join('')}
          <section class="block stack-md allow-break">${assinaturasHtml}</section>`;
```

- [ ] **Step 4: Rodar o teste de novo e confirmar que passa**

Run: `cd server && node tests/propostaClausulasInline.test.js`
Expected: `3 passed, 0 failed`

- [ ] **Step 5: Checar sintaxe do arquivo modificado**

Run: `cd server && node --check templates/propostaPremiumV2.js`
Expected: sem output (sucesso silencioso)

- [ ] **Step 6: Commit**

```bash
git add server/templates/propostaPremiumV2.js server/tests/propostaClausulasInline.test.js
git commit -m "feat(proposta): adicionar data-clausula-key/campo na secao 5 do template"
```

---

### Task 2: Preview do editor sempre estruturado (`getClausulasDefault()` como fallback)

**Files:**
- Modify: `server/clausulasDefault.js`
- Modify: `server/index.js:26` (import) e `server/index.js:8445-8448` (uso)
- Test: `server/tests/clausulasDefault.test.js` (novo)

**Interfaces:**
- Consumes: `getClausulasDefault()` (já existe em `server/clausulasDefault.js`), atributos de Task 1.
- Produces: `resolverClausulasParaPreview(clausulasAtivas, embedPreview)`, exportada de `server/clausulasDefault.js`, usada por `server/index.js`. Assinatura: recebe o array de linhas ativas de `proposta_clausulas` (pode ser `[]`, `null` ou `undefined`) e um booleano `embedPreview`; retorna um array (para atribuir a `templateConfig.clausulas_custom`) ou `null` (para manter o comportamento atual — HTML fixo do template).

- [ ] **Step 1: Escrever o teste (vai falhar, a função ainda não existe)**

Criar `server/tests/clausulasDefault.test.js`:

```js
/**
 * Testa resolverClausulasParaPreview — decide o que o preview do editor usa como
 * seção 5 (clausulas ativas da proposta, ou os defaults quando ainda não customizada).
 * Executar: node tests/clausulasDefault.test.js
 */
const assert = require('assert');
const { resolverClausulasParaPreview, getClausulasDefault } = require('../clausulasDefault');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

test('retorna as clausulas ativas quando existem (independente de embedPreview)', () => {
  const ativas = [{ id: 1, titulo: '5.1 X', conteudo: 'Y' }];
  assert.strictEqual(resolverClausulasParaPreview(ativas, true), ativas);
  assert.strictEqual(resolverClausulasParaPreview(ativas, false), ativas);
});

test('sem clausulas ativas + embedPreview=true → retorna getClausulasDefault()', () => {
  const result = resolverClausulasParaPreview([], true);
  assert.deepStrictEqual(result, getClausulasDefault());
});

test('sem clausulas ativas + embedPreview=false → retorna null (mantém HTML fixo do template)', () => {
  assert.strictEqual(resolverClausulasParaPreview([], false), null);
});

test('trata lista ausente (null/undefined) como vazia', () => {
  assert.deepStrictEqual(resolverClausulasParaPreview(null, true), getClausulasDefault());
  assert.deepStrictEqual(resolverClausulasParaPreview(undefined, true), getClausulasDefault());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `cd server && node tests/clausulasDefault.test.js`
Expected: erro `resolverClausulasParaPreview is not a function`

- [ ] **Step 3: Implementar `resolverClausulasParaPreview` em `server/clausulasDefault.js`**

No fim do arquivo, onde hoje está (verificar o `module.exports` atual antes de editar — ele hoje só exporta `getClausulasDefault`):

```js
module.exports = { getClausulasDefault };
```

substituir por:

```js
function resolverClausulasParaPreview(clausulasAtivas, embedPreview) {
  if (Array.isArray(clausulasAtivas) && clausulasAtivas.length > 0) return clausulasAtivas;
  if (embedPreview) return getClausulasDefault();
  return null;
}

module.exports = { getClausulasDefault, resolverClausulasParaPreview };
```

- [ ] **Step 4: Rodar o teste de novo e confirmar que passa**

Run: `cd server && node tests/clausulasDefault.test.js`
Expected: `4 passed, 0 failed`

- [ ] **Step 5: Usar a função na rota `/premium`**

Em `server/index.js:26`, trocar:

```js
const { getClausulasDefault } = require('./clausulasDefault');
```

por:

```js
const { getClausulasDefault, resolverClausulasParaPreview } = require('./clausulasDefault');
```

Em `server/index.js`, dentro da rota `GET /api/propostas/:id/premium` (por volta da linha 8445), trocar:

```js
          db.all('SELECT * FROM proposta_clausulas WHERE proposta_id = ? AND ativo = 1 ORDER BY ordem ASC', [id], (errCl, clausulas) => {
          if (!errCl && clausulas && clausulas.length > 0) {
            templateConfig.clausulas_custom = clausulas;
          }
```

por:

```js
          db.all('SELECT * FROM proposta_clausulas WHERE proposta_id = ? AND ativo = 1 ORDER BY ordem ASC', [id], (errCl, clausulas) => {
          const clausulasParaTemplate = resolverClausulasParaPreview(errCl ? [] : clausulas, omitPrintBar);
          if (clausulasParaTemplate) {
            templateConfig.clausulas_custom = clausulasParaTemplate;
          }
```

(`omitPrintBar` já está em escopo — foi definido na linha 8413 dentro do mesmo fechamento de callbacks, e é `true` exatamente quando a requisição veio com `embed=1`, ou seja, do preview do editor.)

- [ ] **Step 6: Checar sintaxe**

Run: `cd server && node --check index.js && node --check clausulasDefault.js`
Expected: sem output

- [ ] **Step 7: Commit**

```bash
git add server/clausulasDefault.js server/index.js server/tests/clausulasDefault.test.js
git commit -m "feat(proposta): preview do editor sempre usa clausulas estruturadas (custom ou default)"
```

---

### Task 3: Módulo de manipulação DOM `clausulasInlineEditor.js`

**Files:**
- Create: `client/src/components/proposta/clausulasInlineEditor.js`
- Test: `client/src/components/proposta/clausulasInlineEditor.test.js`

**Interfaces:**
- Consumes: estrutura DOM produzida por Task 1 (`#proposalSource` contendo `<section data-clausula-key>` com filhos `[data-clausula-campo="titulo"]`/`[data-clausula-campo="conteudo"]`, e um wrapper `.five-intro-group` cujo primeiro filho com `data-clausula-key` é sempre a cláusula logicamente "primeira").
- Produces (usadas por Task 4/5 em `PropostaPreviewEditavel.js`):
  - `lerClausulasDoSource(doc): Array<{ key: string, titulo: string, conteudo: string }>` — `conteudo` é o `innerHTML` bruto do elemento de conteúdo (sem conversão para texto).
  - `sincronizarCampoParaSource(doc, key, campo, valor): boolean` — `campo` é `'titulo'` ou `'conteudo'`; para `'titulo'` grava `textContent`, para `'conteudo'` grava `innerHTML`.
  - `moverClausulaNoSource(doc, key, direcao): boolean` — `direcao` é `-1` (cima) ou `1` (baixo).
  - `removerClausulaDoSource(doc, key): boolean`
  - `adicionarClausulaAoSource(doc, apósKey): string` — retorna a `data-clausula-key` gerada (`temp-{timestamp}`).
  - `diffClausulas(snapshotOriginal, listaAtual): { novas, alteradas, removidas, ordemMudou, ordemFinal }` — `snapshotOriginal` é `Array<{id, titulo, conteudo}>` (formato da API); `listaAtual` é o formato de `lerClausulasDoSource` já com `conteudo` convertido para texto pelo chamador.
  - `htmlParaTexto(html): string` — mesma conversão que `EditorClausulas.js` já fazia (HTML simples → texto com parágrafos separados por linha em branco).

- [ ] **Step 1: Escrever os testes (vão falhar, o módulo ainda não existe)**

Criar `client/src/components/proposta/clausulasInlineEditor.test.js`:

```js
import {
  lerClausulasDoSource,
  sincronizarCampoParaSource,
  moverClausulaNoSource,
  removerClausulaDoSource,
  adicionarClausulaAoSource,
  diffClausulas,
  htmlParaTexto,
} from './clausulasInlineEditor';

// Fixture equivalente ao HTML gerado por clausulasSection (propostaPremiumV2.js, Task 1):
// wrapper .five-intro-group contém a "primeira" cláusula; as demais são irmãs de #proposalSource.
function montarFixture(doc, chaves) {
  const root = doc.createElement('div');
  root.id = 'proposalSource';
  const wrapper = doc.createElement('section');
  wrapper.className = 'block stack-md avoid-break five-intro-group';
  const h2 = doc.createElement('h2');
  h2.textContent = '5. CONDIÇÕES GERAIS DE FORNECIMENTO';
  wrapper.appendChild(h2);
  root.appendChild(wrapper);

  function criarSecao(key, titulo, conteudoHtml) {
    const secao = doc.createElement('section');
    secao.className = 'block stack-md allow-break';
    secao.setAttribute('data-clausula-key', key);
    const h3 = doc.createElement('h3');
    h3.setAttribute('data-clausula-campo', 'titulo');
    h3.textContent = titulo;
    const div = doc.createElement('div');
    div.className = 'stack-sm';
    div.setAttribute('data-clausula-campo', 'conteudo');
    div.innerHTML = conteudoHtml;
    secao.appendChild(h3);
    secao.appendChild(div);
    return secao;
  }

  chaves.forEach(([key, titulo, conteudo], idx) => {
    const secao = criarSecao(key, titulo, conteudo);
    if (idx === 0) wrapper.appendChild(secao);
    else root.appendChild(secao);
  });

  doc.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

test('lerClausulasDoSource lê as clausulas na ordem do documento, incluindo a que está no wrapper', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>Texto 1.</p>'],
    ['2', '5.2 TRANSPORTE', '<p>Texto 2.</p>'],
  ]);
  const lista = lerClausulasDoSource(document);
  expect(lista).toEqual([
    { key: '1', titulo: '5.1 PRAZO', conteudo: '<p>Texto 1.</p>' },
    { key: '2', titulo: '5.2 TRANSPORTE', conteudo: '<p>Texto 2.</p>' },
  ]);
});

test('sincronizarCampoParaSource atualiza titulo (textContent) e conteudo (innerHTML)', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>Texto 1.</p>']]);
  expect(sincronizarCampoParaSource(document, '1', 'titulo', '5.1 NOVO TITULO')).toBe(true);
  expect(sincronizarCampoParaSource(document, '1', 'conteudo', '<p>Texto editado.</p>')).toBe(true);
  const lista = lerClausulasDoSource(document);
  expect(lista[0].titulo).toBe('5.1 NOVO TITULO');
  expect(lista[0].conteudo).toBe('<p>Texto editado.</p>');
});

test('sincronizarCampoParaSource retorna false para key inexistente', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>Texto 1.</p>']]);
  expect(sincronizarCampoParaSource(document, '999', 'titulo', 'X')).toBe(false);
});

test('moverClausulaNoSource troca a ordem, inclusive quando envolve a clausula do wrapper', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
    ['3', '5.3 GARANTIA', '<p>C</p>'],
  ]);
  expect(moverClausulaNoSource(document, '2', -1)).toBe(true); // 2 sobe, vira primeira (entra no wrapper)
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['2', '1', '3']);
  const wrapper = document.querySelector('.five-intro-group');
  expect(wrapper.querySelector('[data-clausula-key]').getAttribute('data-clausula-key')).toBe('2');
});

test('moverClausulaNoSource não faz nada além dos limites da lista', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
  ]);
  expect(moverClausulaNoSource(document, '1', -1)).toBe(false);
  expect(moverClausulaNoSource(document, '2', 1)).toBe(false);
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['1', '2']);
});

test('removerClausulaDoSource remove, inclusive a clausula que está no wrapper (a próxima assume o lugar)', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
  ]);
  expect(removerClausulaDoSource(document, '1')).toBe(true);
  const lista = lerClausulasDoSource(document);
  expect(lista.map((c) => c.key)).toEqual(['2']);
  const wrapper = document.querySelector('.five-intro-group');
  expect(wrapper.querySelector('[data-clausula-key]').getAttribute('data-clausula-key')).toBe('2');
});

test('removerClausulaDoSource retorna false para key inexistente', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>A</p>']]);
  expect(removerClausulaDoSource(document, '999')).toBe(false);
});

test('adicionarClausulaAoSource insere depois da key indicada, com key temp-*', () => {
  montarFixture(document, [
    ['1', '5.1 PRAZO', '<p>A</p>'],
    ['2', '5.2 TRANSPORTE', '<p>B</p>'],
  ]);
  const novaKey = adicionarClausulaAoSource(document, '1');
  expect(novaKey).toMatch(/^temp-\d+$/);
  const chaves = lerClausulasDoSource(document).map((c) => c.key);
  expect(chaves).toEqual(['1', novaKey, '2']);
});

test('adicionarClausulaAoSource sem apósKey adiciona no fim', () => {
  montarFixture(document, [['1', '5.1 PRAZO', '<p>A</p>']]);
  const novaKey = adicionarClausulaAoSource(document, null);
  expect(lerClausulasDoSource(document).map((c) => c.key)).toEqual(['1', novaKey]);
});

test('htmlParaTexto converte paragrafos em texto separado por linha em branco', () => {
  expect(htmlParaTexto('<p>Primeiro.</p><p>Segundo.</p>')).toBe('Primeiro.\n\nSegundo.');
  expect(htmlParaTexto('')).toBe('');
});

test('diffClausulas identifica novas, alteradas, removidas e mudanca de ordem', () => {
  const snapshot = [
    { id: 1, titulo: '5.1 PRAZO', conteudo: 'A' },
    { id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'B' },
  ];
  const listaAtual = [
    { key: '2', titulo: '5.2 TRANSPORTE', conteudo: 'B alterado' },
    { key: '1', titulo: '5.1 PRAZO', conteudo: 'A' },
    { key: 'temp-123', titulo: '5.3 NOVA', conteudo: 'C' },
  ];
  const diff = diffClausulas(snapshot, listaAtual);
  expect(diff.novas).toEqual([{ key: 'temp-123', titulo: '5.3 NOVA', conteudo: 'C' }]);
  expect(diff.alteradas).toEqual([{ key: '2', titulo: '5.2 TRANSPORTE', conteudo: 'B alterado' }]);
  expect(diff.removidas).toEqual([]);
  expect(diff.ordemMudou).toBe(true);
});

test('diffClausulas detecta remocao quando uma key do snapshot nao esta mais na lista atual', () => {
  const snapshot = [
    { id: 1, titulo: '5.1 PRAZO', conteudo: 'A' },
    { id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'B' },
  ];
  const listaAtual = [{ key: '1', titulo: '5.1 PRAZO', conteudo: 'A' }];
  const diff = diffClausulas(snapshot, listaAtual);
  expect(diff.removidas).toEqual([{ id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'B' }]);
  expect(diff.ordemMudou).toBe(false);
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `cd client && CI=true npx react-scripts test clausulasInlineEditor --watchAll=false`
Expected: falha ao importar `./clausulasInlineEditor` (módulo não existe)

- [ ] **Step 3: Implementar `client/src/components/proposta/clausulasInlineEditor.js`**

```js
const SOURCE_SELECTOR = '#proposalSource';
const CLAUSULA_SELECTOR = '[data-clausula-key]';
const WRAPPER_SELECTOR = '.five-intro-group';

function escapeAttrValue(v) {
  return String(v).replace(/"/g, '\\"');
}

function getSource(doc) {
  return doc.querySelector(SOURCE_SELECTOR);
}

function getWrapper(doc) {
  const source = getSource(doc);
  return source ? source.querySelector(WRAPPER_SELECTOR) : null;
}

function buscarSecao(doc, key) {
  const source = getSource(doc);
  if (!source) return null;
  return source.querySelector(`${CLAUSULA_SELECTOR}[data-clausula-key="${escapeAttrValue(key)}"]`);
}

// A "primeira" cláusula sempre precisa estar fisicamente dentro do wrapper
// .five-intro-group (junto do <h2>), para o paginador não deixar o título órfão
// no fim de uma página (ver comentário original em propostaPremiumV2.js).
// Para mover/remover/adicionar sem se importar com essa regra, toda operação
// estrutural "desempacota" a cláusula do wrapper antes de mexer, e "reempacota"
// a nova primeira cláusula depois.
function desempacotarPrimeiraClausula(doc) {
  const wrapper = getWrapper(doc);
  if (!wrapper) return;
  const clausulaNoWrapper = wrapper.querySelector(CLAUSULA_SELECTOR);
  if (clausulaNoWrapper) wrapper.insertAdjacentElement('afterend', clausulaNoWrapper);
}

function reempacotarPrimeiraClausula(doc) {
  const source = getSource(doc);
  const wrapper = getWrapper(doc);
  if (!source || !wrapper) return;
  const primeira = source.querySelector(CLAUSULA_SELECTOR);
  if (primeira) wrapper.appendChild(primeira);
}

function comWrapperNormalizado(doc, fn) {
  desempacotarPrimeiraClausula(doc);
  const resultado = fn();
  reempacotarPrimeiraClausula(doc);
  return resultado;
}

export function lerClausulasDoSource(doc) {
  const source = getSource(doc);
  if (!source) return [];
  return Array.from(source.querySelectorAll(CLAUSULA_SELECTOR)).map((secao) => {
    const tituloEl = secao.querySelector('[data-clausula-campo="titulo"]');
    const conteudoEl = secao.querySelector('[data-clausula-campo="conteudo"]');
    return {
      key: secao.getAttribute('data-clausula-key'),
      titulo: tituloEl ? tituloEl.textContent.trim() : '',
      conteudo: conteudoEl ? conteudoEl.innerHTML : '',
    };
  });
}

export function sincronizarCampoParaSource(doc, key, campo, valor) {
  const secao = buscarSecao(doc, key);
  if (!secao) return false;
  const alvo = secao.querySelector(`[data-clausula-campo="${campo}"]`);
  if (!alvo) return false;
  if (campo === 'titulo') alvo.textContent = valor;
  else alvo.innerHTML = valor;
  return true;
}

export function moverClausulaNoSource(doc, key, direcao) {
  return comWrapperNormalizado(doc, () => {
    const source = getSource(doc);
    const secoes = Array.from(source.querySelectorAll(CLAUSULA_SELECTOR));
    const idx = secoes.findIndex((el) => el.getAttribute('data-clausula-key') === key);
    const alvo = idx + direcao;
    if (idx === -1 || alvo < 0 || alvo >= secoes.length) return false;
    const atual = secoes[idx];
    const vizinho = secoes[alvo];
    if (direcao < 0) vizinho.insertAdjacentElement('beforebegin', atual);
    else vizinho.insertAdjacentElement('afterend', atual);
    return true;
  });
}

export function removerClausulaDoSource(doc, key) {
  return comWrapperNormalizado(doc, () => {
    const secao = buscarSecao(doc, key);
    if (!secao) return false;
    secao.remove();
    return true;
  });
}

export function adicionarClausulaAoSource(doc, apósKey) {
  return comWrapperNormalizado(doc, () => {
    const source = getSource(doc);
    const key = `temp-${Date.now()}`;
    const secao = doc.createElement('section');
    secao.className = 'block stack-md allow-break';
    secao.setAttribute('data-clausula-key', key);
    const h3 = doc.createElement('h3');
    h3.setAttribute('data-clausula-campo', 'titulo');
    h3.textContent = 'Nova Cláusula';
    const div = doc.createElement('div');
    div.className = 'stack-sm';
    div.setAttribute('data-clausula-campo', 'conteudo');
    div.innerHTML = '<p></p>';
    secao.appendChild(h3);
    secao.appendChild(div);
    const referencia = apósKey ? buscarSecao(doc, apósKey) : null;
    if (referencia) referencia.insertAdjacentElement('afterend', secao);
    else source.appendChild(secao);
    return key;
  });
}

export function htmlParaTexto(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\/p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<\/div>/gi, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function diffClausulas(snapshotOriginal, listaAtual) {
  const porIdOriginal = new Map(snapshotOriginal.map((c) => [String(c.id), c]));
  const keysAtuais = new Set(listaAtual.map((c) => c.key));

  const novas = listaAtual.filter((c) => c.key.startsWith('temp-'));
  const alteradas = listaAtual.filter((c) => {
    if (c.key.startsWith('temp-') || c.key.startsWith('default-')) return false;
    const original = porIdOriginal.get(c.key);
    return !!original && (original.titulo !== c.titulo || original.conteudo !== c.conteudo);
  });
  const removidas = snapshotOriginal.filter((c) => !keysAtuais.has(String(c.id)));

  const ordemOriginal = snapshotOriginal.map((c) => String(c.id));
  const ordemAtual = listaAtual
    .filter((c) => !c.key.startsWith('temp-') && !c.key.startsWith('default-'))
    .map((c) => c.key);
  const ordemMudou = ordemOriginal.filter((k) => ordemAtual.includes(k)).join(',') !== ordemAtual.join(',');

  return { novas, alteradas, removidas, ordemMudou, ordemFinal: listaAtual.map((c) => c.key) };
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd client && CI=true npx react-scripts test clausulasInlineEditor --watchAll=false`
Expected: todos os testes passando (13 testes)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/proposta/clausulasInlineEditor.js client/src/components/proposta/clausulasInlineEditor.test.js
git commit -m "feat(proposta): modulo clausulasInlineEditor com manipulacao de #proposalSource"
```

---

### Task 4: Ativar edição inline no iframe (`ativarEdicaoClausulas`)

**Files:**
- Modify: `client/src/components/proposta/PropostaPreviewEditavel.js`

**Interfaces:**
- Consumes: `lerClausulasDoSource`, `sincronizarCampoParaSource`, `moverClausulaNoSource`, `removerClausulaDoSource`, `adicionarClausulaAoSource` de `./clausulasInlineEditor` (Task 3); `paginateProposalContent()` exposta em `window` pelo HTML gerado (Task 1/já existente); `setMudancasPendentes` (estado já existente no componente).
- Produces: função `ativarEdicaoClausulas(doc)` chamada no `onLoad` do iframe; nenhuma interface nova exposta para fora do componente (Task 5 usa as mesmas funções de `clausulasInlineEditor` diretamente, não esta função).

**Nota sobre testes deste task:** a lógica aqui depende de medidas reais de layout (`scrollHeight`/`clientHeight`, usadas por `paginateProposalContent()`), que o ambiente jsdom (usado pelos testes de Task 3) sempre retorna como `0` — ou seja, não dá para testar a repaginação de forma significativa em jsdom, e montar um harness Puppeteer completo do componente React dentro de um iframe seria desproporcional ao valor para este projeto. Este task é verificado manualmente no navegador (checklist no Step 3); não há teste automatizado novo.

- [ ] **Step 1: Adicionar os imports e refs necessários**

No topo de `client/src/components/proposta/PropostaPreviewEditavel.js`, adicionar ao lado dos imports existentes:

```js
import {
  lerClausulasDoSource,
  sincronizarCampoParaSource,
  moverClausulaNoSource,
  removerClausulaDoSource,
  adicionarClausulaAoSource,
} from './clausulasInlineEditor';
```

Dentro do componente, ao lado dos `useRef` existentes (`iframeRef`, `previewDesatualizadoRef`), adicionar:

```js
  const repaginacaoTimerRef = useRef(null);
  const edicaoEmAndamentoRef = useRef(null); // { key, campo, cursorOffset }
```

(`previewDesatualizadoRef` será removido no Task 6, junto do painel — não mexer nele agora.)

- [ ] **Step 2: Implementar `ativarEdicaoClausulas` e as funções auxiliares**

Adicionar, depois da função `ativarEdicao()` existente:

```js
  function getCursorOffset(el) {
    const sel = el.ownerDocument.defaultView.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  }

  function setCursorOffset(el, offset) {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const range = doc.createRange();
    let restante = offset;
    let node = null;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const len = walker.currentNode.textContent.length;
      if (restante <= len) { node = walker.currentNode; break; }
      restante -= len;
    }
    if (node) {
      range.setStart(node, restante);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function injetarControlesClausula(doc, secao) {
    const existente = secao.querySelector(':scope > .ppe-clausula-controles');
    if (existente) existente.remove();
    const key = secao.getAttribute('data-clausula-key');
    const barra = doc.createElement('div');
    barra.className = 'ppe-clausula-controles';
    barra.setAttribute('contenteditable', 'false');
    barra.style.cssText = 'display:flex;gap:4px;justify-content:flex-end;margin-bottom:2px;';
    const botao = (texto, titulo, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      b.title = titulo;
      b.style.cssText = 'font-size:11px;padding:2px 6px;border:1px solid #f59e0b;background:#fffde7;border-radius:4px;cursor:pointer;';
      b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); };
      return b;
    };
    barra.appendChild(botao('↑', 'Mover para cima', () => aplicarMudancaEstrutural(doc, () => moverClausulaNoSource(doc, key, -1))));
    barra.appendChild(botao('↓', 'Mover para baixo', () => aplicarMudancaEstrutural(doc, () => moverClausulaNoSource(doc, key, 1))));
    barra.appendChild(botao('+ cláusula', 'Adicionar cláusula depois desta', () => aplicarMudancaEstrutural(doc, () => adicionarClausulaAoSource(doc, key))));
    barra.appendChild(botao('🗑', 'Remover cláusula', () => aplicarMudancaEstrutural(doc, () => removerClausulaDoSource(doc, key))));
    secao.insertAdjacentElement('afterbegin', barra);
  }

  function ativarEdicaoClausulas(doc) {
    const paginasGeradas = doc.querySelectorAll('.proposal-page[data-generated="1"] [data-clausula-campo]');
    paginasGeradas.forEach((el) => {
      el.contentEditable = 'true';
      el.style.outline = '2px dashed #f59e0b';
      el.style.background = '#fffde7';
      el.style.borderRadius = '3px';
      el.style.cursor = 'text';
      el.oninput = () => {
        const secao = el.closest('[data-clausula-key]');
        if (!secao) return;
        const key = secao.getAttribute('data-clausula-key');
        const campo = el.getAttribute('data-clausula-campo');
        const valor = campo === 'titulo' ? el.textContent : el.innerHTML;
        sincronizarCampoParaSource(doc, key, campo, valor);
        setMudancasPendentes(true);
        const pagina = el.closest('.proposal-page');
        if (pagina) pagina.style.overflow = 'visible';
        edicaoEmAndamentoRef.current = { key, campo, cursorOffset: getCursorOffset(el) };
        clearTimeout(repaginacaoTimerRef.current);
        repaginacaoTimerRef.current = setTimeout(() => repaginarERestaurar(doc), 500);
      };
    });
    doc.querySelectorAll('.proposal-page[data-generated="1"] [data-clausula-key]').forEach((secao) => {
      injetarControlesClausula(doc, secao);
    });
  }

  function repaginarERestaurar(doc) {
    const win = doc.defaultView;
    try { win.paginateProposalContent(); } catch (_) { /* preview segue com o layout anterior */ }
    ativarEdicaoClausulas(doc);
    const pendente = edicaoEmAndamentoRef.current;
    if (pendente) {
      const secao = doc.querySelector(`.proposal-page[data-generated="1"] [data-clausula-key="${pendente.key}"]`);
      const alvo = secao && secao.querySelector(`[data-clausula-campo="${pendente.campo}"]`);
      if (alvo) {
        alvo.focus();
        setCursorOffset(alvo, pendente.cursorOffset);
      }
    }
  }

  function aplicarMudancaEstrutural(doc, mutacao) {
    clearTimeout(repaginacaoTimerRef.current);
    edicaoEmAndamentoRef.current = null;
    mutacao();
    const win = doc.defaultView;
    try { win.paginateProposalContent(); } catch (_) { /* preview segue com o layout anterior */ }
    ativarEdicaoClausulas(doc);
    setMudancasPendentes(true);
  }
```

- [ ] **Step 3: Chamar `ativarEdicaoClausulas` no `onLoad` do iframe e testar manualmente**

No JSX do `<iframe>`, trocar:

```jsx
            onLoad={() => {
              const doc = iframeRef.current?.contentDocument;
              if (doc) injetarAtributosEdicao(doc);
              ativarEdicao();
            }}
```

por:

```jsx
            onLoad={() => {
              const doc = iframeRef.current?.contentDocument;
              if (doc) {
                injetarAtributosEdicao(doc);
                ativarEdicaoClausulas(doc);
              }
              ativarEdicao();
            }}
```

Checklist manual (com o servidor rodando, `npm run dev` na raiz do projeto, abrindo `/comercial/propostas/:id/preview-editavel` de uma proposta de teste):

- [ ] O texto de cada cláusula da seção 5 aparece com borda amarela pontilhada (mesmo visual dos campos de contato) e é editável ao clicar.
- [ ] Digitar um parágrafo longo o suficiente para estourar a altura da página: o texto nunca fica invisível/cortado durante a digitação; ~500ms depois de parar de digitar, a página é repaginada e o cursor continua no lugar certo.
- [ ] Clicar ↑/↓ em uma cláusula move ela imediatamente (sem esperar debounce); a numeração/título continuam corretos.
- [ ] Clicar "+ cláusula" insere uma nova cláusula vazia logo depois; ela também fica editável.
- [ ] Clicar 🗑 remove a cláusula correspondente imediatamente.
- [ ] Mover ou remover a cláusula que originalmente era a primeira da seção 5 não quebra o layout (o título "5. CONDIÇÕES GERAIS DE FORNECIMENTO" continua junto de alguma cláusula, sem ficar sozinho no fim de uma página).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/proposta/PropostaPreviewEditavel.js
git commit -m "feat(proposta): edicao inline das clausulas no iframe (contentEditable + controles)"
```

---

### Task 5: Salvar cláusulas no fluxo unificado de "Alterações pendentes"

**Files:**
- Modify: `client/src/components/proposta/PropostaPreviewEditavel.js`

**Interfaces:**
- Consumes: `lerClausulasDoSource`, `diffClausulas`, `htmlParaTexto` de `./clausulasInlineEditor` (Task 3); estado `clausulas`/`clausulasIsDefault` (já carregado por `carregarPreview()`); endpoints existentes `POST /clausulas/inicializar`, `GET /clausulas`, `POST /clausulas`, `PUT /clausulas/:id`, `DELETE /clausulas/:id`, `PUT /clausulas/reordenar`.
- Produces: `salvar()` (já existe, será reescrita) passa a persistir também as mudanças de cláusula.

- [ ] **Step 1: Adicionar o import de `diffClausulas`/`htmlParaTexto`**

No import já adicionado no Task 4, incluir também:

```js
import {
  lerClausulasDoSource,
  sincronizarCampoParaSource,
  moverClausulaNoSource,
  removerClausulaDoSource,
  adicionarClausulaAoSource,
  diffClausulas,
  htmlParaTexto,
} from './clausulasInlineEditor';
```

- [ ] **Step 2: Implementar `salvarClausulas` e plugar em `salvar()`**

Adicionar, antes da função `salvar()` existente:

```js
  async function salvarClausulas(doc) {
    const snapshotOriginal = clausulas; // carregado por carregarPreview() ao abrir a proposta
    let listaAtual = lerClausulasDoSource(doc)
      .map((c) => ({ ...c, titulo: (c.titulo || '').trim(), conteudo: htmlParaTexto(c.conteudo) }))
      .filter((c) => c.titulo || c.conteudo); // titulo+conteudo vazios = remoção implícita

    if (clausulasIsDefault) {
      const houveMudanca = listaAtual.length !== snapshotOriginal.length
        || listaAtual.some((c, i) => {
          const original = snapshotOriginal[i];
          if (!original) return true;
          const tituloOriginal = `${original.numero} ${original.titulo}`;
          return c.titulo !== tituloOriginal || c.conteudo !== original.conteudo;
        });
      if (!houveMudanca) return;

      await api.post(`/propostas/${id}/clausulas/inicializar`);
      const res = await api.get(`/propostas/${id}/clausulas`);
      const frescas = res.data?.clausulas || [];

      // As linhas recém-criadas preservam a mesma ordem de getClausulasDefault() (ordem = índice),
      // que é a mesma ordem de snapshotOriginal — então relaciona por posição, não por texto
      // (o usuário pode ter editado o título antes deste primeiro save).
      const indicePorDefaultKey = new Map(snapshotOriginal.map((c, i) => [`default-${c.numero}`, i]));
      listaAtual = listaAtual.map((c) => {
        if (!c.key.startsWith('default-')) return c;
        const indice = indicePorDefaultKey.get(c.key);
        const fresca = indice != null ? frescas[indice] : null;
        return fresca ? { ...c, key: String(fresca.id) } : c;
      });

      const diff = diffClausulas(frescas.map((c) => ({ id: c.id, titulo: c.titulo, conteudo: c.conteudo })), listaAtual);
      await aplicarDiffClausulas(diff, listaAtual);
      return;
    }

    const diff = diffClausulas(snapshotOriginal.map((c) => ({ id: c.id, titulo: c.titulo, conteudo: c.conteudo })), listaAtual);
    await aplicarDiffClausulas(diff, listaAtual);
  }

  async function aplicarDiffClausulas(diff, listaAtual) {
    for (const nova of diff.novas) {
      await api.post(`/propostas/${id}/clausulas`, { titulo: nova.titulo, conteudo: nova.conteudo });
    }
    for (const alterada of diff.alteradas) {
      await api.put(`/propostas/${id}/clausulas/${alterada.key}`, { titulo: alterada.titulo, conteudo: alterada.conteudo });
    }
    for (const removida of diff.removidas) {
      await api.delete(`/propostas/${id}/clausulas/${removida.id}`);
    }
    if (diff.ordemMudou) {
      const idsFinais = listaAtual.filter((c) => !c.key.startsWith('temp-')).map((c) => c.key);
      if (idsFinais.length > 0) {
        await api.put(`/propostas/${id}/clausulas/reordenar`, { ordem: idsFinais });
      }
    }
  }
```

Depois, trocar a função `salvar()` existente:

```js
  async function salvar() {
    if (!mudancasPendentes) return;
    setSalvando(true);
    try {
      if (Object.keys(camposEditados).length > 0) {
        await api.put(`/propostas/${id}/customizacoes`, camposEditados);
      }
      setMudancasPendentes(false);
      toast.success('Alterações salvas com sucesso.');
      carregarPreview();
    } catch (e) {
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSalvando(false);
    }
  }
```

por:

```js
  async function salvar() {
    if (!mudancasPendentes) return;
    setSalvando(true);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        await salvarClausulas(doc);
      }
      if (Object.keys(camposEditados).length > 0) {
        await api.put(`/propostas/${id}/customizacoes`, camposEditados);
      }
      setMudancasPendentes(false);
      toast.success('Alterações salvas com sucesso.');
      carregarPreview();
    } catch (e) {
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSalvando(false);
    }
  }
```

- [ ] **Step 3: Testar manualmente o fluxo completo de salvamento**

Checklist manual (mesma proposta de teste do Task 4):

- [ ] Abrir uma proposta que NUNCA foi customizada (cláusulas padrão) → editar o texto de uma cláusula → clicar "Salvar alterações" → recarregar a página → confirmar que a edição persistiu e que a proposta saiu do modo "padrão" (`GET /clausulas` agora retorna `isDefault: false`).
- [ ] Adicionar uma cláusula nova, remover uma existente, mover outra de posição → salvar → recarregar → conferir que a lista final bate (ordem, títulos, conteúdos).
- [ ] Editar o título de uma cláusula (não só o conteúdo) → salvar → recarregar → confirmar que o novo título persistiu.
- [ ] Fazer uma edição de cláusula e cancelar (recarregar a página sem salvar) → confirmar que a edição não foi persistida.
- [ ] Gerar PDF (`Baixar PDF` na toolbar) depois de salvar → abrir o PDF e conferir que reflete as edições salvas na seção 5.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/proposta/PropostaPreviewEditavel.js
git commit -m "feat(proposta): salvar clausulas editadas inline no fluxo unificado de salvamento"
```

---

### Task 6: Toolbar — remover botão/painel "Cláusulas", adicionar "Resetar cláusulas"

**Files:**
- Modify: `client/src/components/proposta/PropostaPreviewEditavel.js`

**Interfaces:**
- Consumes: `POST /propostas/:id/clausulas/resetar` (endpoint já existente).
- Produces: nenhuma interface nova — apenas remove UI/estado do painel antigo e adiciona o botão de reset.

- [ ] **Step 1: Remover o import de `EditorClausulas` e o estado/handlers do painel**

Remover a linha:

```js
import EditorClausulas from './EditorClausulas';
```

Remover do topo do componente:

```js
  const [mostrarClausulas, setMostrarClausulas] = useState(false);
```

e:

```js
  // Signals that the preview HTML needs a server reload (clause content changed)
  const previewDesatualizadoRef = useRef(false);
```

Remover as funções:

```js
  // Clause changes are already persisted by EditorClausulas on each blur.
  // We only mark that the preview HTML is stale — the reload happens when the panel closes.
  function handleClausulasAlteradas() {
    previewDesatualizadoRef.current = true;
  }

  function fecharClausulas() {
    setMostrarClausulas(false);
    if (previewDesatualizadoRef.current) {
      carregarPreview();
    }
  }
```

Em `carregarPreview()`, remover a linha `previewDesatualizadoRef.current = false;` (referência ao ref removido).

- [ ] **Step 2: Adicionar `resetarClausulas` e trocar o botão na toolbar**

Adicionar, próximo de `baixarPdf()`:

```js
  async function resetarClausulas() {
    if (!window.confirm('Tem certeza? Todas as edições feitas nas cláusulas desta proposta serão perdidas.')) return;
    try {
      await api.post(`/propostas/${id}/clausulas/resetar`);
      toast.success('Cláusulas voltaram ao padrão.');
      carregarPreview();
    } catch (e) {
      toast.error('Erro ao resetar cláusulas.');
    }
  }
```

No JSX da toolbar, trocar:

```jsx
          <button
            className="ppe-btn"
            onClick={() => setMostrarClausulas(true)}
            title="Editar cláusulas"
          >
            <FiEdit2 /> Cláusulas
          </button>
```

por:

```jsx
          <button
            className="ppe-btn"
            onClick={resetarClausulas}
            title="Resetar cláusulas para o padrão"
          >
            <FiRefreshCw /> Resetar cláusulas
          </button>
```

Atualizar o import de ícones — trocar:

```js
import { FiEdit2, FiSave, FiClock, FiX, FiDownload } from 'react-icons/fi';
```

por:

```js
import { FiSave, FiClock, FiX, FiDownload, FiRefreshCw } from 'react-icons/fi';
```

- [ ] **Step 3: Remover o painel de cláusulas do JSX**

Remover o bloco inteiro:

```jsx
      {/* Painel de cláusulas */}
      {mostrarClausulas && (
        <div className="ppe-painel-overlay">
          <div className="ppe-painel">
            <div className="ppe-painel-header">
              <h2>Editor de Cláusulas</h2>
              <button className="ppe-painel-fechar" onClick={fecharClausulas}>
                <FiX />
              </button>
            </div>
            <EditorClausulas
              propostaId={id}
              clausulas={clausulas}
              isDefault={clausulasIsDefault}
              onAlterado={handleClausulasAlteradas}
            />
          </div>
        </div>
      )}
```

(O painel de Histórico, logo abaixo, continua igual — não mexer.)

- [ ] **Step 4: Verificar que o app compila e testar manualmente**

Run: `cd client && CI=true npx react-scripts build 2>&1 | tail -n 40`
Expected: build sem erros (pode haver warnings de lint pré-existentes não relacionados a este arquivo — conferir que nenhum novo warning cita `PropostaPreviewEditavel.js`)

Checklist manual:
- [ ] A toolbar não mostra mais o botão "Cláusulas"; mostra "Resetar cláusulas".
- [ ] Clicar "Resetar cláusulas" pede confirmação; ao confirmar, volta a proposta para o padrão e recarrega o preview.
- [ ] O botão "Histórico" continua funcionando normalmente.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/proposta/PropostaPreviewEditavel.js
git commit -m "feat(proposta): remover painel de clausulas da toolbar, adicionar resetar clausulas"
```

---

### Task 7: Remover código morto (`EditorClausulas`)

**Files:**
- Delete: `client/src/components/proposta/EditorClausulas.js`
- Delete: `client/src/components/proposta/EditorClausulas.css`

**Interfaces:** nenhuma — este task só é seguro depois que Task 4-6 foram validados manualmente em uso real (não só nesta sessão de implementação), conforme a spec: "não antes, para permitir reverter facilmente se algo não funcionar como esperado".

- [ ] **Step 1: Confirmar que não há mais nenhuma referência a `EditorClausulas`**

Run: `cd client && grep -rn "EditorClausulas" src/`
Expected: nenhum resultado (Task 6 já removeu o único import)

- [ ] **Step 2: Aguardar confirmação explícita do usuário de que o fluxo novo foi validado em uso real antes de prosseguir com a remoção.** Não apagar os arquivos automaticamente ao final de Task 6 — este é um gate manual.

- [ ] **Step 3: Remover os arquivos**

```bash
git rm client/src/components/proposta/EditorClausulas.js client/src/components/proposta/EditorClausulas.css
```

- [ ] **Step 4: Confirmar que o build ainda passa**

Run: `cd client && CI=true npx react-scripts build 2>&1 | tail -n 40`
Expected: build sem erros

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(proposta): remover EditorClausulas.js (substituido pela edicao inline)"
```

---

## Fora de escopo (não implementar neste plano)

- Editar seções 1-4 ou a tabela FINAME diretamente no documento.
- Rich-text/formatação nas cláusulas.
- Drag-and-drop para reordenar.
- Migração/limpeza de dados legados em `proposta_template_config` (já mapeado como pendência separada em `specs/proposta-editavel/tasks.md`).
