# Bug: PDF trunca na cláusula 5.5 / Botão download não funciona

**Reportado em:** 2026-06-26  
**Status:** [ ] pendente

---

## Sintomas

1. **PDF mostra "página 4 de 4" e corta no início da primeira linha da 5.5** — cláusulas 5.5 a 5.24 desaparecem do PDF
2. **Botão "Baixar PDF" na tela de preview não faz nada**
3. **PDF baixado pela lista de propostas abre com erro** — visualizador mostra documento incompleto/corrompido

---

## Diagnóstico — Causa raiz (Bug 1)

### Estrutura atual de `blocksHtml`

O template V2 monta o `#proposalSource` assim:

```
#proposalSource
  ├── <section> 4.0 DESCRITIVO DOS EQUIPAMENTOS   ← bloco 1
  ├── <section> 4.1 item...                        ← bloco 2
  ├── <section> [tabela de preços / outros]        ← bloco 3
  └── <section class="avoid-break">               ← bloco 4 — UM SÓ bloco
        <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
        <section> 5.1 PRAZO DE ENTREGA </section>
        <section> 5.2 TRANSPORTE E EMBALAGEM </section>
        ...
        <section> 5.24 CONSIDERAÇÃO FINAL </section>
        <section> [assinaturas] </section>
      </section>
```

### Por que o paginator falha

O paginator lê apenas **filhos diretos** de `#proposalSource`:
```js
const blocks = Array.from(source.children).filter(isElement);
```

Com 4 blocos no nível raiz, o paginator distribui um por página (4 páginas). O bloco 4 contém TODAS as 23+ cláusulas aninhadas dentro de um único `<section>`. Esse bloco gigante vai para a página 4 inteiro, mas a página tem altura fixa e `overflow: hidden` → só o que cabe na página aparece (até o início da 5.5).

### Bug secundário: `fits()` sem argumento

```js
// definição:
const fits = (limitPx) => pageContent.scrollHeight <= limitPx;

// chamadas (sem argumento!):
if (!fits()) { ... }  // linha ~13393 e ~13421
```

`fits()` sem argumento: `scrollHeight <= undefined` → sempre `false` em JS. Isso faz com que **qualquer bloco pareça que não cabe**, criando uma nova página para cada bloco. Resultado: os ~4 blocos raiz viram exatamente 4 páginas.

---

## Diagnóstico — Causa raiz (Bug 2)

Não existe botão "Download PDF" na toolbar de `PropostaPreviewEditavel`. O botão "Gerar PDF" dentro do iframe é bloqueado pelo `sandbox="allow-same-origin allow-scripts"` (não tem `allow-popups` nem `allow-downloads`).

---

## Diagnóstico — Causa raiz (Bug 3)

Mesma raiz do Bug 1: o PDF gerado pelo Puppeteer via `/pdf` usa o mesmo HTML truncado. O visualizador de PDF reporta erro porque o documento termina abruptamente no meio do conteúdo.

---

## Plano de correção

### Fix 1 — Flatten das cláusulas no `blocksHtml`

**Arquivo:** `server/index.js` — função `gerarHTMLPropostaPremiumV2`

Mudar a estrutura de `clausulasSection` (e cláusulas hardcoded) para que cada cláusula seja um **filho direto** de `blocksHtml`, não aninhado em um wrapper:

```
ANTES (1 bloco gigante):
  <section class="avoid-break">
    <h2>5. CONDIÇÕES GERAIS</h2>
    <section>5.1...</section>
    <section>5.2...</section>
    ...
  </section>

DEPOIS (N blocos independentes):
  <section class="avoid-break">
    <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
  </section>
  <section class="allow-break">5.1...</section>
  <section class="allow-break">5.2...</section>
  ...
  <section class="allow-break">[assinaturas]</section>
```

Impacto: o paginator passa a distribuir cada cláusula individualmente entre as páginas, sem clipar.

### Fix 2 — Corrigir `fits()` sem argumento

```js
// DE:
if (!fits()) {

// PARA:
if (!fits(pageContent.clientHeight)) {
```

Aplicar nas duas ocorrências (tabelas e blocos normais).

### Fix 3 — Remover `isItem55Block` (workaround obsoleto)

A lógica especial para cláusula 5.5 foi adicionada como workaround para o problema de clipping. Com o flatten das cláusulas, cada cláusula pagina corretamente — o workaround deixa de ser necessário e pode gerar comportamento inesperado.

### Fix 4 — Botão "Download PDF" na toolbar do preview

**Arquivo:** `client/src/components/proposta/PropostaPreviewEditavel.js`

Adicionar botão na toolbar que chama `GET /api/propostas/:id/pdf` e faz download via `<a download>` ou `window.open`.

---

## Ordem de execução sugerida

1. Fix 1 (flatten) — resolve o bug principal de paginação
2. Fix 2 (fits sem argumento) — corrige a lógica de distribuição de blocos
3. Fix 3 (remove isItem55Block) — limpeza do workaround
4. Fix 4 (botão download) — adiciona a funcionalidade ausente
5. Testar PDF end-to-end: preview → download → verificar todas as cláusulas presentes
