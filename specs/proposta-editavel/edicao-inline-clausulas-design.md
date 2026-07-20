# Edição inline das cláusulas (substituição do painel "Cláusulas")

Status: design aprovado — 2026-07-20

## Contexto

Hoje a única parte da proposta customizável por proposta é a seção **5. CONDIÇÕES GERAIS DE FORNECIMENTO**, armazenada em `proposta_clausulas` (título + conteúdo por cláusula). Ela é editada num painel lateral separado (`EditorClausulas.js`, aberto pelo botão "Cláusulas" da toolbar de `PropostaPreviewEditavel.js`), com textarea por cláusula, auto-save no blur, botões de mover/remover/adicionar/resetar.

As seções 1-4 e a tabela FINAME continuam fixas no template — fora de escopo desta mudança.

O usuário considera o painel lateral mais trabalhoso do que editar direto no texto como ele aparece no documento (que já é o padrão usado para os campos de contato da capa via `contenteditable` + `data-edit`). Este design troca o painel por edição inline diretamente no preview.

## Decisões (validadas com o usuário)

1. **Escopo:** só a seção 5 (cláusulas). Seções 1-4 continuam fixas.
2. **Granularidade:** mantém o modelo de dados atual (uma linha por cláusula em `proposta_clausulas`, com título e conteúdo próprios, auditável e resetável individualmente) — a edição inline manipula essa mesma estrutura, não vira um blob de texto livre.
3. **Estrutura (adicionar/remover/reordenar):** continua existindo, via pequenos controles inline (↑ ↓ 🗑 ➕) injetados junto de cada bloco de cláusula no próprio documento — não um painel separado.
4. **Salvamento:** unificado no fluxo existente de "Alterações pendentes" → botão "Salvar alterações" (igual aos campos de contato). Cláusulas deixam de fazer auto-save no blur.
5. **Resetar para padrão:** vira um botão na toolbar (ao lado de Histórico/Baixar PDF), com confirmação — não fica mais dentro de um painel.
6. **Inicialização:** transparente. Propostas que nunca foram customizadas (usam `getClausulasDefault()`) já aparecem editáveis normalmente; a cópia para `proposta_clausulas` (equivalente ao atual `POST /clausulas/inicializar`) só acontece nos bastidores no momento em que o usuário efetivamente salva uma alteração.
7. **Preview sempre estruturado:** a rota de preview do editor (`/premium?embed=1`) passa a montar a seção 5 sempre a partir de uma lista estruturada de cláusulas (customizada ou `getClausulasDefault()`), nunca do HTML fixo do template — sem gravar nada no banco até o usuário salvar. As rotas `/premium` (não-embed) e `/pdf` continuam com o comportamento atual (fixo quando não há customização).

## Restrição técnica identificada

O HTML gerado usa um paginador client-side (`paginateProposalContent()`, já embutido no template) que distribui os blocos de conteúdo em `<div class="proposal-page">` de altura fixa (297mm) com `overflow: hidden` (`.proposal-page` e `.page-content`, `propostaPremiumV2.js` ~linhas 1031/1034). Editar texto diretamente dentro de uma página já paginada pode estourar a altura e cortar conteúdo visualmente até a página ser re-paginada.

**Solução adotada:** debounce (~500ms) chamando de novo `paginateProposalContent()` (exposta em `window` pelo próprio HTML gerado) a cada edição, para refluir o conteúdo pelas páginas quase em tempo real. Enquanto o debounce não dispara (durante a digitação), a página que contém o elemento em edição recebe `overflow: visible` temporariamente, garantindo que nada fique invisível no meio de uma frase; ao disparar a repaginação, volta ao `overflow: hidden` estrito. Se o usuário sair do modo edição ou salvar antes do debounce dispar, uma repaginação síncrona é forçada primeiro.

## Mudanças por arquivo

### `server/templates/propostaPremiumV2.js`
- `clausulasSection`: cada `<section>` de cláusula ganha `data-clausula-key="{id ou índice}"`; o `<h3>` ganha `data-clausula-campo="titulo"`; o `<div class="stack-sm">` de conteúdo ganha `data-clausula-campo="conteudo"`. Não muda o HTML renderizado para `/pdf` fora do modo edição (mesmas classes/estrutura visual).
- Nenhuma outra mudança visual/estrutural nesta seção.

### `server/index.js`
- Na rota `GET /api/propostas/:id/premium` quando chamada com `embed=1` (preview do editor): se a query de `proposta_clausulas` ativas retornar vazio, usar `templateConfig.clausulas_custom = getClausulasDefault()` em vez de deixar `clausulas_custom` indefinido — assim o template sempre usa o caminho `clausulasSection` (estruturado) nesse contexto. Comportamento de `/premium` sem `embed=1` e de `/pdf` não muda.
- Endpoints de cláusulas existentes (`GET/POST/PUT/DELETE/reordenar/inicializar/resetar`) não mudam de contrato — só passam a ser chamados em lote pelo frontend.

### `client/src/components/proposta/PropostaPreviewEditavel.js`
- Novo `ativarEdicaoClausulas(doc)`, chamado no `onLoad` do iframe (junto do `ativarEdicao()` existente):
  - Para cada `[data-clausula-key]`: aplica `contentEditable` + mesmo estilo visual (borda amarela pontilhada) já usado nos campos de contato, nos elementos `[data-clausula-campo="titulo"]` e `[data-clausula-campo="conteudo"]`.
  - Injeta, dentro do próprio `doc` do iframe, uma barra de controles por cláusula (↑, ↓, remover, adicionar nova depois desta) — manipulação direta do DOM do iframe (mesmo padrão já usado em `injetarAtributosEdicao`), sem overlay externo sincronizado por posição.
  - Mantém `clausulasEditadasRef` (lista em memória: id-ou-temp-id, ordem, título, conteúdo) espelhando o estado atual da seção 5; toda edição/mover/remover/adicionar atualiza essa ref e seta `mudancasPendentes = true`.
  - `oninput` dispara debounce (~500ms) chamando `doc.defaultView.paginateProposalContent()`; durante a digitação, a página ativa recebe `overflow: visible` (revertido quando a repaginação roda).
- `salvar()`: antes do `PUT /customizacoes` atual, diffa `clausulasEditadasRef.current` contra o snapshot carregado em `clausulas` (estado já existente) e dispara, em sequência:
  1. Se a proposta ainda estava em modo padrão (`clausulasIsDefault`) e há alguma mudança: `POST /clausulas/inicializar` primeiro.
  2. `POST /clausulas` para cada cláusula nova (sem id).
  3. `PUT /clausulas/:id` para cada cláusula alterada (título/conteúdo mudou).
  4. `DELETE /clausulas/:id` para cada cláusula removida.
  5. `PUT /clausulas/reordenar` se a ordem final mudou.
  Cláusula com título e conteúdo vazios ao salvar é tratada como removida (não cria registro vazio).
  Erro em qualquer chamada do lote: mantém `mudancasPendentes = true`, toast de erro, estado local preservado para nova tentativa.
- Toolbar: remove o botão "Cláusulas" (`FiEdit2`); adiciona botão "Resetar cláusulas" com confirmação (`window.confirm` ou modal simples), chamando `POST /clausulas/resetar` e recarregando o preview.
- Remove `mostrarClausulas`, o painel overlay de cláusulas e o import de `EditorClausulas`.

### Remoção de código morto (após validação em uso real)
- `client/src/components/proposta/EditorClausulas.js` e `EditorClausulas.css` apagados quando o fluxo inline estiver validado — não antes, para permitir reverter facilmente se algo não funcionar como esperado.

## Testes

- Manual no navegador: abrir proposta nunca customizada → editar texto de uma cláusula → salvar → recarregar → confirmar persistência e que a proposta saiu do modo "padrão".
- Adicionar cláusula nova, remover uma existente, reordenar (mover ↑/↓) → salvar → recarregar → conferir que a ordem/lista final bate.
- "Resetar cláusulas" → confirmar que apaga customizações e volta ao padrão (via toolbar, sem painel).
- Gerar PDF (`Baixar PDF`) depois de editar → conferir que o conteúdo baixado reflete as edições salvas.
- Digitar um parágrafo longo o suficiente para estourar a página → confirmar visualmente que nada fica cortado/invisível durante a digitação e que a repaginação ocorre corretamente após parar de digitar.
- Reaproveitar `render_test.js` (scratchpad) como base para um script que simula edição via `page.evaluate` e confere que a paginação final e o HTML resultante batem com o esperado.

## Fora de escopo

- Editar seções 1-4 ou a tabela FINAME diretamente no documento.
- Rich-text/formatação (bold, listas, etc.) nas cláusulas — continua texto simples convertido em parágrafos, como hoje.
- Drag-and-drop para reordenar (mantém botões ↑/↓, como no painel atual).
