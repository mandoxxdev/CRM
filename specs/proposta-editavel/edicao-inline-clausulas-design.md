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

O HTML gerado usa um paginador client-side (`paginateProposalContent()`, já embutido no template) que **não edita as páginas visíveis in-place**: ele lê os blocos originais de um container oculto `#proposalSource` (`display:none`, contém o `blocksHtml` inteiro sem paginação) e, a cada chamada, **remove e recria do zero** todo `.proposal-page[data-generated="1"]`, clonando (`cloneNode`) os blocos de `#proposalSource` para dentro de páginas de altura fixa (297mm, `overflow: hidden` — `.proposal-page`/`.page-content`, `propostaPremiumV2.js` ~linhas 1031/1034/1442/1450). Duas consequências:

1. Editar texto diretamente dentro de uma página já paginada pode estourar a altura e cortar conteúdo visualmente até a página ser re-paginada.
2. Se simplesmente chamarmos `paginateProposalContent()` de novo depois de editar o texto **visível** (dentro das páginas geradas), a função reconstrói as páginas a partir de `#proposalSource`, que continua com o conteúdo **original, não editado** — a edição do usuário seria descartada na primeira repaginação.

**Solução adotada:** `#proposalSource` é a fonte da verdade; as páginas visíveis são sempre uma projeção dela.
- Os atributos `data-clausula-key` / `data-clausula-campo` (ver seção seguinte) são adicionados no HTML de `clausulasSection`, então existem tanto na cópia oculta (`#proposalSource`) quanto em cada clone visível dentro das páginas geradas (`cloneNode` preserva atributos) — cada elemento pode ser localizado em ambos os lugares pela mesma chave.
- A cada edição de texto (`oninput` no elemento visível com `contentEditable`): localizar o elemento correspondente em `#proposalSource` via `source.querySelector('[data-clausula-key="{key}"] [data-clausula-campo="{campo}"]')` e copiar o texto editado (`innerText`) para lá — mantendo `#proposalSource` sempre sincronizado com o que o usuário digitou. Só then, com debounce (~500ms), chama `paginateProposalContent()` para refluir as páginas visíveis a partir da fonte já atualizada.
- Ações estruturais (mover/remover/adicionar cláusula) são aplicadas diretamente nos filhos de `#proposalSource` (não nas páginas visíveis, que serão descartadas) e disparam `paginateProposalContent()` de forma síncrona (sem debounce) logo em seguida, já que são ações discretas (clique), não digitação contínua.
- Enquanto o debounce de texto não dispara (durante a digitação), a página que contém o elemento em edição recebe `overflow: visible` temporariamente, garantindo que nada fique invisível no meio de uma frase; ao disparar a repaginação, as páginas são recriadas do zero (já com `overflow: hidden` padrão). Se o usuário sair do modo edição ou salvar antes do debounce disparar, uma repaginação síncrona é forçada primeiro.
- Corolário: como a repaginação **recria** os nós das páginas visíveis, os `contentEditable`/estilos/listeners injetados nelas precisam ser reaplicados após cada `paginateProposalContent()` (dentro da própria função de ativação, chamada de novo ao final do debounce/da ação estrutural) — o foco do campo em edição deve ser restaurado manualmente após a repaginação disparada por `oninput` (guardar qual `data-clausula-key`/`data-clausula-campo` e a posição do cursor antes de repaginar, restaurar no elemento equivalente recriado).

## Mudanças por arquivo

### `server/templates/propostaPremiumV2.js`
- `clausulasSection`: cada `<section>` de cláusula ganha `data-clausula-key="{c.id}"` quando a cláusula vem de `proposta_clausulas` (tem `id` numérico do banco), ou `data-clausula-key="default-{c.numero}"` quando vem de `getClausulasDefault()` (sem `id`, mas `numero` é único e estável, ex. `"5.4"`); o `<h3>` ganha `data-clausula-campo="titulo"`; o `<div class="stack-sm">` de conteúdo ganha `data-clausula-campo="conteudo"`. Não muda o HTML renderizado para `/pdf` fora do modo edição (mesmas classes/estrutura visual) — os atributos `data-*` são inertes em PDF.
- Nenhuma outra mudança visual/estrutural nesta seção.

### `server/index.js`
- Na rota `GET /api/propostas/:id/premium` quando chamada com `embed=1` (preview do editor): se a query de `proposta_clausulas` ativas retornar vazio, usar `templateConfig.clausulas_custom = getClausulasDefault()` em vez de deixar `clausulas_custom` indefinido — assim o template sempre usa o caminho `clausulasSection` (estruturado) nesse contexto. Comportamento de `/premium` sem `embed=1` e de `/pdf` não muda.
- Endpoints de cláusulas existentes (`GET/POST/PUT/DELETE/reordenar/inicializar/resetar`) não mudam de contrato — só passam a ser chamados em lote pelo frontend.

### `client/src/components/proposta/PropostaPreviewEditavel.js`
- `#proposalSource` (dentro do iframe) é a fonte da verdade durante a edição — não é mantido nenhum espelho em estado React; a lista atual de cláusulas (ordem, título, conteúdo, id-ou-temp-id) é sempre lida diretamente do DOM em `#proposalSource [data-clausula-key]` no momento de salvar, evitando duplicar/desincronizar estado.
- Novo `ativarEdicaoClausulas(doc)`, chamado no `onLoad` do iframe (junto do `ativarEdicao()` existente) **e de novo ao final de cada repaginação** (já que `paginateProposalContent()` recria os nós das páginas visíveis, descartando `contentEditable`/listeners anteriores):
  - Para cada `[data-clausula-key]` **dentro das páginas visíveis** (`.proposal-page[data-generated="1"] [data-clausula-key]`, não em `#proposalSource`): aplica `contentEditable` + mesmo estilo visual (borda amarela pontilhada) já usado nos campos de contato, nos elementos `[data-clausula-campo="titulo"]` e `[data-clausula-campo="conteudo"]`.
  - Injeta, junto de cada bloco de cláusula visível, uma barra de controles (↑, ↓, remover, adicionar nova depois desta) — manipulação direta do DOM do iframe (mesmo padrão já usado em `injetarAtributosEdicao`), sem overlay externo sincronizado por posição.
  - `oninput` em `[data-clausula-campo]`: copia o `innerText` do elemento editado para o elemento correspondente em `#proposalSource` (mesma `data-clausula-key`/`data-clausula-campo`); marca `mudancasPendentes = true`; salva `{ key, campo, cursorOffset }` numa ref e dispara debounce (~500ms) que chama `paginateProposalContent()` e, na sequência, `ativarEdicaoClausulas(doc)` de novo, restaurando o foco/cursor no elemento recriado com a mesma `data-clausula-key`/`data-clausula-campo`. Enquanto o debounce não dispara, a página do elemento em edição recebe `overflow: visible` temporário.
  - Botões estruturais (↑/↓/remover/adicionar) operam diretamente nos filhos de `#proposalSource` (mover/remover/inserir `<section data-clausula-key>`, gerando um `data-clausula-key` novo tipo `temp-{timestamp}` para cláusula nova) e chamam `paginateProposalContent()` + `ativarEdicaoClausulas(doc)` de forma síncrona (sem debounce) em seguida; marcam `mudancasPendentes = true`.
- `salvar()`: antes do `PUT /customizacoes` atual, lê o estado atual direto do DOM (`Array.from(doc.querySelectorAll('#proposalSource [data-clausula-key]')).map(...)`), monta a lista final `{ key, titulo, conteudo }` na ordem em que aparecem, diffa contra o snapshot carregado em `clausulas` (estado já existente, carregado da API) e dispara, em sequência:
  1. Se a proposta ainda estava em modo padrão (`clausulasIsDefault`) e há alguma mudança: `POST /clausulas/inicializar` primeiro, depois recarrega `clausulas` (agora com `id`s reais) antes de continuar o diff — chaves `default-{numero}` são casadas com a cláusula recém-inicializada de mesmo `numero` para descobrir o `id` real.
  2. `POST /clausulas` para cada cláusula com key `temp-*` (nova, criada durante a edição).
  3. `PUT /clausulas/:id` para cada cláusula existente (`id` numérico) cujo título/conteúdo mudou.
  4. `DELETE /clausulas/:id` para cada cláusula que existia no snapshot original e não está mais presente no DOM.
  5. `PUT /clausulas/reordenar` se a ordem final (por `id`) mudou.
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
