# Fix — Layout da Proposta + Auditoria de Itens (2026-07-21)

Status: design aprovado — 2026-07-21

Lote de 8 correções sobre a feature de Proposta Editável, agrupadas por área de trabalho.
Referência visual: `specs/proposta-editavel/PROPOSTA PARA DEV.docx` / `pp para dev.pdf`.

## Contexto e arquivos

| Arquivo | Papel neste lote |
|---|---|
| `server/templates/propostaPremiumV2.js` | Template HTML V2 (capa, header/footer, seções, paginador embutido). Cenários #1–#6, #8 |
| `server/clausulasDefault.js` | Cláusulas padrão de texto (5.1–5.22, 5.24 — **sem 5.23**). Cenário #1 |
| `client/src/components/proposta/clausulasInlineEditor.js` | Manipulação de `#proposalSource` + `renumerarClausulas`. Cenário #1 (numeração) |
| `server/index.js` | Rotas `/premium` (8267), `/pdf` (8576), save da proposta (7639+), `registrarEdicaoLog` (5443). Cenário #7 |
| `client/src/components/proposta/HistoricoEdicoes.js` | Painel de histórico — humanização de tipos. Cenário #7 |

Achados que orientam o lote:
- **Dois caminhos de renderização da seção 5.** `clausulasSection` (linhas ~455–516) monta a seção 5 a partir de lista estruturada quando há cláusulas custom/inline; caso contrário cai no HTML *hardcoded* (linhas ~556–952). A tabela de preços, FINAME/BNDES e tabelas fiscais existem **apenas** no caminho hardcoded (linhas ~787–912) — somem no caminho inline.
- `const numero = esc(proposta.numero_proposta || 'N/A')` (linha 109): número nunca fica vazio no header padrão; header vazio em prod indica header custom por imagem.
- `proposta.cliente_logo_url` já é selecionado em `/premium` (8300) e `/pdf` (8595) via `LEFT JOIN clientes`.
- O save principal da proposta faz `DELETE FROM proposta_itens ... ` + re-`INSERT` de todos os itens (linha ~7746); nenhuma chamada a `registrarEdicaoLog`.

---

## Grupo A — Layout do template (`propostaPremiumV2.js`)

### #1 — Cláusula 5.23 sempre visível, em página própria

**Problema:** no caminho inline/custom a seção 5.23 (título + tabela de preços dinâmica + FINAME/BNDES + tabelas fiscais) não é renderizada; `clausulasSection` só emite as cláusulas de texto + assinaturas.

**Decisão:** 5.23 vira uma **seção fixa não-editável** (`sec523PrecoHtml`) construída uma vez e injetada nos **dois** caminhos (inline e hardcoded), posicionada entre a 5.22 e a 5.24.
- Tabela de preços: **dinâmica**, a partir dos itens/totais da proposta (reusar `tabelaPrecosRows` + `totais.total`).
- Tabela FINAME/BNDES e tabelas de classificação/impostos fiscais: **fixas**, idênticas aos docs (conteúdo atual das linhas ~823–912).
- **Não** faz parte de `proposta_clausulas` nem do editor inline (usuário não edita).
- Página própria via marcador de quebra (ver #2/#5): quebra antes da 5.23 e antes da 5.24 → 5.23 ocupa sua(s) própria(s) página(s) sem se misturar.

**Numeração (decisão aprovada — reservar slot 5.23):** as cláusulas editáveis vêm de `clausulasDefault.js` (5.1–5.22, 5.24 — sem 5.23). A renumeração automática (`renumerarClausulas` em `clausulasInlineEditor.js`) deve **reservar o número 23**: as editáveis preenchem 5.1–5.22 e a próxima continua em **5.24** (pulando 5.23, que pertence à seção fixa). A 5.23 fixa permanece rotulada estaticamente. Atualizar os testes jsdom de `renumerarClausulas` para cobrir o pulo do 23.

### #2 — Seção "5. CONDIÇÕES GERAIS" sempre inicia em página nova
### #5 — Cláusula 5.24 (CONSIDERAÇÃO FINAL) sempre inicia em página nova

**Mecanismo comum:** introduzir um marcador de "quebra de página antes" reconhecido pelo paginador embutido (`paginateProposalContent`). Proposta: atributo `data-page-break="before"` (ou classe `.page-break-before`) nos blocos-raiz de `#proposalSource`. No loop de paginação, ao encontrar um bloco marcado, fechar a página corrente e começar uma nova antes de posicioná-lo (mesmo se a atual ainda tem espaço).

Aplicar o marcador a: (a) o grupo de abertura da seção 5 (`five-intro-group` / `<h2>5. CONDIÇÕES GERAIS…`), (b) a seção fixa 5.23, (c) a 5.24. Vale para ambos os caminhos (inline e hardcoded).

**Cuidado:** o marcador precisa existir tanto na cópia oculta `#proposalSource` quanto sobreviver ao `cloneNode` para as páginas visíveis (atributos são preservados no clone). Não deve afetar o PDF de forma diferente do preview (o paginador roda igual nos dois).

### #3 — "Descritivo técnico" como primeiro item do bloco 4.x

Em `equipDescritivoHtml` (bloco `equip-specs-kv`, linhas ~401–414) o "Descritivo técnico" hoje é o **último** item. Reordenar para que fique **imediatamente após o `<h3>` do nome do equipamento**, antes de Equipamento/Código/Quantidade/Modelo/Família/Categoria/NCM/specs. A foto flutuante (`equip-photo-float`) permanece com `float:right` (não regredir o comportamento da Task C anterior).

### #4 — Mais espaçamento entre linhas dos descritivos técnicos

Aumentar `line-height` dos parágrafos do descritivo técnico para melhorar legibilidade. Alvos: `.equip-descritivo` e/ou `.equip-specs-kv > p` (hoje `font-size:10pt` sem line-height explícito, linha ~1284). Definir `line-height: ~1.6`. Ajuste puramente de CSS; conferir que não estoura páginas (rodar validação de overflow do rodapé, como no lote anterior).

### #6 — Número da proposta no header

**Parte visual:** no header padrão (`page-header-center-box`, linhas ~960–963), separar em duas linhas — `PROPOSTA TÉCNICA COMERCIAL` e, abaixo, `Nº ${numero}` — em vez de tudo numa linha.

**Parte diagnóstica (prod):** em produção o header aparece sem o número; local aparece com. Causa provável: `proposta_template_config.header_image_url` aponta para uma imagem de header custom **estática** (sem número dinâmico); quando `headerImageURL` está setado, o template esconde `.page-header-inner` (que contém o número) e mostra a imagem. Passos:
1. Confirmar no banco de prod se `header_image_url` está preenchido e se o arquivo existe em `uploadsHeaderDir`.
2. Se for imagem legada/indesejada: limpar/anular `header_image_url` no `proposta_template_config` para usar o header padrão (que já tem o número). Alinha com o item de backlog "limpar proposta_template_config".
3. Se prod **quiser** manter a imagem custom: decisão adicional com o usuário (sobrepor o número via HTML sobre a imagem). **Não** implementar a sobreposição sem confirmar.

### #8 — Logo do cliente na capa

Na capa (`cover-info-area`, linhas ~1338–1347), **acima** de `cover-client-info` (nome do cliente), renderizar a logo do cliente quando `proposta.cliente_logo_url` estiver preenchido. Embed base64 a partir de `uploadsLogosDir` (via helper `uploadToDataUrl`, mesmo padrão dos outros assets — evita dependência de HTTP no PDF). Quando não houver logo, nada é renderizado (sem espaço vazio). Novo container `.cover-client-logo` com dimensão máxima controlada (ex.: `max-height: 25mm; max-width: 60%`), centralizado.

---

## Grupo B — Auditoria de inclusão/edição/remoção de itens

### #7 — Registrar mudanças de itens no histórico

**Problema:** `registrarEdicaoLog` (linha 5443) só é chamado nas rotas de customizações/cláusulas. O save principal da proposta (PUT que re-insere itens, ~7639–7760) não registra nada.

**Backend (`server/index.js`):**
- No endpoint de update da proposta, **antes** do `DELETE FROM proposta_itens`, ler os itens atuais (`SELECT * FROM proposta_itens WHERE proposta_id = ?`).
- Após montar a nova lista, computar um diff old×new. Chave de correspondência: `codigo_produto` quando presente; senão `descricao` normalizada. Detectar:
  - `item_adicionado` — item novo não presente antes (valor_novo = descrição/nome + qtd).
  - `item_removido` — item que existia e não está mais (valor_anterior = descrição/nome).
  - `item_editado` — mesmo item com mudança de campos relevantes (quantidade, valor_unitario, modelo, descritivo_tecnico…); registrar campo alterado com antes/depois.
- Emitir uma entrada de log por mudança via `registrarEdicaoLog(propostaId, usuarioId, usuarioNome, tipo, campo, null, valorAnterior, valorNovo)`.
- Reaproveitar `usuario_id`/`usuario_nome` já disponíveis no endpoint (mesmo padrão das outras chamadas de log).

**Frontend (`HistoricoEdicoes.js`):** adicionar labels humanizados para os novos `tipo`s (`item_adicionado` → "Produto adicionado", `item_editado` → "Produto editado", `item_removido` → "Produto removido"). O diff antes/depois já é genérico.

**Auditoria doc:** atualizar `specs/proposta-editavel/auditoria.md` com os novos tipos.

---

## Fora de escopo
- Editar 5.23/tabelas via editor inline (é seção fixa).
- Auditoria de todos os campos da proposta além de itens (título, cliente, datas) — só itens neste lote.
- Sobreposição de número sobre imagem de header custom (só se o diagnóstico #6 apontar necessidade e o usuário aprovar).
- Reordenar/redesenhar as tabelas FINAME/fiscais (mantidas idênticas aos docs).

## Testes / validação
- **Automatizável (headless, como no lote anterior):**
  - Render inline (com `clausulas_custom`) e hardcoded devem ambos conter a 5.23 (título + tabela de preços + FINAME + fiscais).
  - Marcadores de quebra: seção 5, 5.23 e 5.24 iniciam em páginas distintas; 5.23 não compartilha página com outra cláusula.
  - Overflow do rodapé permanece zero após #3/#4 (reusar `headless_taskB.js`).
  - `renumerarClausulas` pula o slot 23 (unit test jsdom novo).
  - `#7`: teste de diff de itens (add/edit/remove) chamando o log com os tipos corretos.
- **Manual no Chrome (destravável com a extensão):** logo do cliente na capa (#8), header em duas linhas (#6), aparência final da 5.23 em página própria.
- **Diagnóstico manual (prod):** confirmar `header_image_url` no `proposta_template_config` (#6).
