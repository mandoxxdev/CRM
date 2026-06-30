# Bug: PDF trunca na cláusula 5.5 / Botão download não funciona

**Reportado em:** 2026-06-26  
**Status:** [x] corrigido — Fix 1-4 aplicados

---

## Sintomas originais

1. **PDF mostrava "página 4 de 4" e cortava no início da primeira linha da 5.5** — cláusulas 5.5 a 5.24 desapareciam do PDF
2. **Botão "Baixar PDF" na tela de preview não faz nada** — ainda pendente
3. **PDF baixado pela lista de propostas abria com erro** — resolvido como efeito do Fix 1

---

## Diagnóstico — Causa raiz (Bug 1)

### Estrutura original de `blocksHtml`

O template V2 montava o `#proposalSource` assim:

```
#proposalSource
  ├── <section> 4.0 DESCRITIVO DOS EQUIPAMENTOS   ← bloco 1
  ├── <section> 4.1 item...                        ← bloco 2
  ├── <section> [tabela de preços / outros]        ← bloco 3
  └── <section class="avoid-break">               ← bloco 4 — UM SÓ bloco gigante
        <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
        <section> 5.1 PRAZO DE ENTREGA </section>
        <section> 5.2 TRANSPORTE E EMBALAGEM </section>
        ...
        <section> 5.24 CONSIDERAÇÃO FINAL </section>
        <section> [assinaturas] </section>
      </section>
```

### Por que o paginator falhava

O paginator lê apenas **filhos diretos** de `#proposalSource`:
```js
const blocks = Array.from(source.children).filter(isElement);
```

Com 4 blocos no nível raiz, o paginator distribuía um por página (4 páginas). O bloco 4 continha TODAS as 23+ cláusulas aninhadas dentro de um único `<section>`. Esse bloco gigante ia para a página 4 inteiro, mas a página tem altura fixa e `overflow: hidden` → só o que cabia na página aparecia (até o início da 5.5).

### Bug secundário: `fits()` sem argumento (ainda presente)

```js
// definição:
const fits = (limitPx) => pageContent.scrollHeight <= limitPx;

// chamadas sem argumento — linhas 13705 e 13733 do server/index.js (paginator V2):
if (!fits()) { ... }
```

`fits()` sem argumento: `scrollHeight <= undefined` → sempre `false` em JS. Isso faz com que **qualquer bloco pareça que não cabe**, criando uma nova página para cada bloco. Efeito atual: cada cláusula/grupo ocupa sua própria página (todas visíveis, mas layout não ideal — cláusulas curtas desperdiçam páginas inteiras).

---

## Diagnóstico — Causa raiz (Bug 2)

Não existe botão "Download PDF" na toolbar de `PropostaPreviewEditavel`. O botão "Gerar PDF" dentro do iframe é bloqueado pelo `sandbox="allow-same-origin allow-scripts"` (não tem `allow-popups` nem `allow-downloads`).

---

## Diagnóstico — Causa raiz (Bug 3)

Mesma raiz do Bug 1: o PDF gerado pelo Puppeteer via `/pdf` usava o mesmo HTML truncado. **Resolvido como efeito do Fix 1.**

---

## Histórico de correções

### Fix 1 — Flatten de `clausulasSection` (cláusulas customizadas)
**Commit:** `598cf75` — 26/06/2026 09:03  
**Status:** ✅ FEITO (apenas para o caminho de cláusulas customizadas)

Antes: todas as cláusulas custom aninhadas num único `<section avoid-break>` → 1 bloco gigante.  
Depois: h2 + 1ª cláusula num `<section avoid-break five-intro-group>`, demais cláusulas como seções irmãs com `allow-break`, assinaturas como seção irmã final.

```
ANTES (1 bloco gigante):
  <section class="avoid-break">
    <h2>5. CONDIÇÕES GERAIS</h2>
    <section>5.1...</section> ... <section>5.24...</section>
  </section>

DEPOIS (N blocos independentes):
  <section class="avoid-break five-intro-group">
    <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
    <section>5.1...</section>   ← 1ª cláusula dentro do grupo
  </section>
  <section class="allow-break">5.2...</section>
  ...
  <section class="allow-break">[assinaturas]</section>
```

**Nota:** o caminho das cláusulas **hardcoded** (quando não há customizações) ainda usa grupos aninhados (`five-intro-group` com 5.1+5.2+5.3, `five-6-7-group` com 5.6+5.7, `five-8-ate-14-group` com 5.8-5.14, etc.). Os grupos são filhos diretos do `#proposalSource`, então todas as cláusulas aparecem (sem truncamento), mas a distribuição por página fica por grupo, não por cláusula.

---

## Histórico completo de correções

### Fix 2 — Corrigir `fits()` sem argumento
**Commit:** aplicado junto com simplify  
**Status:** ✅ FEITO

Todas as chamadas `fits()` sem argumento foram substituídas por `fits(pageLimitPx)`. `pageLimitPx` é uma constante capturada uma vez do `clientHeight` da primeira página (todas as páginas são clones do mesmo template, então o valor é idêntico para todas).

### Fix 3 — Remover `isItem55Block` (workaround obsoleto)
**Commit:** aplicado junto com simplify  
**Status:** ✅ FEITO

Removidos: `footerEl`, `footerHeightPx`, `safety55Px`, `isItem55Block`. `wouldOverflowIfAdd` simplificado para usar apenas `pageLimitPx`. Variável morta `isAvoid` também removida (detectada no code-review).

### Fix 4 — Botão "Download PDF" na toolbar
**Commit:** aplicado  
**Status:** ✅ FEITO

Botão adicionado em `PropostaPreviewEditavel.js` chamando `GET /api/propostas/:id/pdf` com `responseType: 'blob'`. Erros logados em `console.error` além do toast (detectado no code-review).

---

### Fix 5 — Subdivisão da cláusula 5.5 em 3 seções
**Status:** ✅ FEITO

A cláusula 5.5 ("Supervisão e Comissionamento de Startup") tinha ~18 parágrafos + tabela num único bloco — mais alto que uma página A4. O paginator a movia para uma nova página mas ela continuava a overflow.

Solução: dividida em 3 `<section allow-break>` independentes:
1. h3 + 8 parágrafos de agendamento/timing
2. 10 parágrafos de responsabilidades da CONTRATANTE + lista de itens
3. Tabela Hora-Homem + observações

Agora o paginator pode distribuir cada parte em páginas diferentes conforme espaço disponível.
