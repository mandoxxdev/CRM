# Teste no Chrome — edição inline + ajustes de layout da proposta

> **Para retomar em nova sessão / outra máquina:** este arquivo é o roteiro do teste manual no navegador. Como a edição inline depende de layout real (iframe, medição de altura, seleção/cursor) e das rotas autenticadas do app, isso só é validável num Chrome logado — não em teste automatizado headless.

## Contexto

Branch: `feat/proposta-redesign-fase15`. Todos os commits já estão no remote (`git pull` traz tudo). O último commit de código é `8e54b29`.

Foram entregues, nas sessões anteriores:
- Edição inline das cláusulas (substituiu o painel lateral `EditorClausulas`)
- 5 ajustes: (A) fonte Century Gothic embutida, (B) conteúdo não ultrapassa o rodapé, (C) foto do equipamento flutuando à direita, (D) corpo da cláusula nova visível/clicável, (E) renumeração automática das cláusulas

Detalhes técnicos em `tasks.md` (seções "Edição inline das cláusulas", "Ajustes de layout e edição" e "QA no Chrome + 2 fixes").

### Estado do QA (atualizado 21/07/2026)

Já validado no Chrome pelo usuário (proposta 37): **A** (fonte Gothic), **B** (rodapé), **C** (foto). ✅

Dois bugs corrigidos após esse QA — **ainda a validar no navegador**:
- `2a69dbc` — rodapé comia cláusula (ex.: 5.11) já ao abrir, por causa da UI de edição (barra de controles + `min-height`) somando altura depois da paginação. Corrigido; confirmado por harness headless. Reconfirmar visualmente ao abrir a 37.
- `8e54b29` — cláusula nova deixada em branco persistia como "5.x Nova Cláusula". Corrigido + 6 unit tests. Falta o end-to-end no navegador (Task D abaixo).

Foco da retomada: **D, E, regressão e PDF**. Depois, Task 7.

## Como usar a skill do Chrome (para o assistente na nova sessão)

1. O usuário precisa ter a **extensão do Claude no Chrome instalada e com permissão concedida ao domínio** do app (ex.: `http://localhost:3000`). Sem isso a skill `claude-in-chrome` é rejeitada.
2. App rodando: `npm run dev` (raiz do projeto). Frontend costuma subir em `localhost:3000`, backend em `localhost:5000`.
3. Invocar a skill `claude-in-chrome`, abrir a rota do preview editável de uma proposta e seguir o checklist abaixo, tirando screenshots e lendo o console.

Rota do preview editável: `/comercial/propostas/:id/preview-editavel` (abre em nova aba pelo ícone de olho na lista de propostas).

## Proposta de teste

- Proposta **37** foi citada pelo usuário para o teste do rodapé.
- Para o teste de cláusulas grandes/quebra de rodapé, o ideal é uma proposta com muitas cláusulas e/ou uma cláusula longa. Se a 37 não for grande o suficiente, criar/editar cláusulas até encher várias páginas.

## Checklist

### 1. Rodapé (Task B) — ✅ VALIDADO 20/07 + reconfirmar o fix `2a69dbc`
- [x] Abrir a 37 e percorrer as páginas — sem conteúdo sob/sobre o rodapé (usuário confirmou, não replicou o bug)
- [ ] **Reconfirmar após o fix da edição**: ao ABRIR a 37 (modo edição já ativo), a cláusula 5.11 e as demais aparecem completas — nenhuma engolida pelo rodapé
- [ ] Gerar o PDF ("Baixar PDF") e conferir o rodapé no PDF final

### 2. Fonte Century Gothic (Task A) — ✅ VALIDADO
- [x] No preview, texto em Century Gothic (usuário confirmou)
- [ ] No PDF gerado, idem (conferir junto do PDF acima)

### 3. Foto do equipamento (Task C) — ✅ VALIDADO
- [x] Foto à direita, texto envolvendo, sem distorção (usuário confirmou)

### 4. Corpo da cláusula nova (Task D) — fix `8e54b29`, VALIDAR END-TO-END
- [ ] Clicar "+ cláusula": aparece o corpo como área clicável com placeholder "Clique para escrever o conteúdo da cláusula..."
- [ ] Clicar no corpo e digitar: o placeholder some, o texto entra
- [ ] **Remoção implícita**: criar uma cláusula e NÃO preencher nada → Salvar alterações → recarregar → a cláusula vazia NÃO persiste
- [ ] **Caso-guarda (não pode remover)**: criar cláusula → digitar SÓ o título (deixar corpo vazio) → salvar → recarregar → a cláusula PERSISTE com o título digitado
- [ ] Obs.: salvar aqui muta a proposta 37 (sai do modo padrão). Reverter com "Resetar cláusulas" ao final se quiser deixar a 37 como estava.

### 5. Renumeração das cláusulas (Task E)
- [ ] Adicionar uma cláusula no meio da lista → as de baixo renumeram (5.x incrementa) e o SUMÁRIO reflete
- [ ] Mover uma cláusula ↑/↓ → renumera coerente
- [ ] Remover uma cláusula do meio → as seguintes renumeram

### 6. Fluxo de edição inline geral (regressão)
- [ ] Editar texto de uma cláusula, salvar, recarregar → persiste
- [ ] Editar o título de uma cláusula → persiste
- [ ] Editar campos de contato da capa (nome/email/telefone) → persiste
- [ ] "Resetar cláusulas" volta ao padrão
- [ ] Console do navegador sem erros durante todo o fluxo (nesta sessão só apareceram warnings do React Router — inofensivos)
- [ ] Caso especial (Task B interação): criar uma cláusula grande o suficiente para dividir em 2+ páginas, editar o texto no fragmento da 2ª página, salvar, recarregar → o conteúdo NÃO é truncado (deve manter todos os parágrafos)

## Reproduzir/medir o rodapé SEM o Chrome (headless)

Se a extensão do Chrome não estiver disponível na outra máquina, dá pra medir o vazamento do rodapé direto no Chromium do Puppeteer (mesmo caminho do PDF). Técnica usada nesta sessão para achar o fix `2a69dbc`:

1. App rodando. Forçar regeneração do snapshot fresco (com fontes base64): limpar `html_rendered` da proposta e chamar o PDF —
   `UPDATE propostas SET html_rendered = NULL WHERE id = 37;` depois `curl -s http://localhost:5000/api/propostas/37/pdf -o /dev/null` (a rota regrava o snapshot).
2. Carregar `SELECT html_rendered` no Puppeteer, rodar a mesma sequência do `server/index.js` (setContent → 1.5s → `paginateProposalContent()` → beforeprint), e para cada `.proposal-page` comparar `stack.getBoundingClientRect().bottom` com `pageContent.bottom - paddingBottom`. `> 0.5px` = conteúdo sob o rodapé.
3. Para reproduzir o MODO DE EDIÇÃO (onde o bug vivia), aplicar no DOM o que `ativarEdicaoClausulas` faz — `contentEditable`, `min-height:3em` nos corpos e a barra `.ppe-clausula-controles` em cada `[data-clausula-key]` — ANTES de medir.
   - Nota: com o fix, a barra é `position:absolute` e o `min-height` é regra CSS `:empty`, então a medição não deve acusar vazamento.

## Depois do teste

- Se tudo passar: o assistente pode executar a **Task 7 do plano** — remover `client/src/components/proposta/EditorClausulas.js` e `.css` (código morto, já não importado). Está explicitamente gated nesta validação.
- Se algo falhar: reportar o sintoma exato + print + erro do console para debugging (skill `systematic-debugging`).
