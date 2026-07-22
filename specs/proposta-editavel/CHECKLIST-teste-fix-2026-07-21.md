# Checklist de teste — Fix Layout + Auditoria (2026-07-21)

Branch: `fix/proposta-layout-auditoria` · Marque `[x]` conforme for validando no Chrome.

## O que foi feito (resumo)

8 correções na proposta editável, todas com testes automatizados passando (render/paginação/lógica). Falta a validação **visual** com dados reais no navegador.

| # | Cenário | Status código |
|---|---|---|
| 1 | Cláusula 5.23 (preço + FINAME + fiscais) sempre visível, em página própria | ✅ feito + teste |
| 2 | Seção "5. CONDIÇÕES GERAIS" começa em página nova | ✅ feito + teste |
| 3 | "Descritivo técnico" como 1º item do equipamento (após o nome) | ✅ feito + teste |
| 4 | Mais espaçamento entre linhas dos descritivos técnicos | ✅ feito |
| 5 | Cláusula 5.24 começa em página nova | ✅ feito + teste |
| 6 | Número da proposta no header (linha própria abaixo do título) | ✅ feito + teste |
| 7 | Histórico registra incluir/editar/remover **produtos** | ✅ feito + teste |
| 8 | Logo do cliente na capa (acima do nome), se cadastrada | ✅ feito + teste |

Extra: renumeração automática das cláusulas reserva o slot **5.23** (editáveis vão 5.1–5.22 e pulam para 5.24).

---

## Checklist de validação no Chrome

> App rodando (`npm run dev`), abrir uma proposta pelo ícone de olho → `/comercial/propostas/:id/preview-editavel`.

### #1 — Cláusula 5.23
- [ x ] A 5.23 (PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS) **aparece** na proposta
- [ x ] Ela começa numa página **só dela** (não divide página com a 5.22 ou 5.24)
- [ x ] A **tabela de preços** reflete os itens/total reais da proposta
- [ x] Tabela FINAME/BNDES e tabelas fiscais aparecem logo abaixo (fixas) (no pdf o FINAME  e BNDES são logos e nao texto puro. Vou verificar se eu consigo as imagens numa qualidade boa  pra gente utilizar.)
- [ x ] No SUMÁRIO, a 5.23 aparece listada com número de página correto

### #2 e #5 — Quebras de página
- [ x ] A seção "5. CONDIÇÕES GERAIS DE FORNECIMENTO" inicia no topo de uma página nova
- [ x  ] A cláusula "5.24 CONSIDERAÇÃO FINAL" inicia no topo de uma página nova

### #3 e #4 — Descritivo técnico (seção 4.x)
- [ x ] Em um item com descritivo, o "Descritivo técnico" aparece **primeiro**, logo após o nome do equipamento (antes de Equipamento/Código/Quantidade…)
- [ x ] O texto do descritivo está com espaçamento entre linhas mais confortável de ler
- [ x ] A foto do equipamento continua flutuando à direita (não regrediu)

### #6 — Número no header
- [ x ] No topo de cada página: "PROPOSTA TÉCNICA COMERCIAL" e, **abaixo**, "Nº {número}"
- [ ] ⚠️ **Se em produção o número NÃO aparecer**: a causa é `proposta_template_config.header_image_url` apontando para uma imagem de header custom (estática, esconde o header dinâmico). Ação: anular esse campo no banco de prod. (n entendi, vamos verificar depois)

### #7 — Histórico de edições (produtos) — ✅ VALIDADO (todos os cenários testados OK em 21/07)
- [x] Adicionar um produto → salvar → "Produto adicionado: {nome}" (corrigido: chave duplicada, `19cb97a`)
- [x] Editar quantidade/valor de um produto → "Produto editado: {nome}" — **uma** entrada agrupada ("Qtd: X, Total: Y"), sem duplicar (corrigido: agrupamento + campos-do-payload + normalização numérica, `7ac895f`)
- [x] Remover um produto (🗑 vermelho na última coluna — botão agora rotulado/visível, `1f841de`) → "Produto removido: {nome}"
- [x] Save que falha não cria registros (log movido para o caminho de sucesso, `8f4b7c0`)
- [x] **Bônus corrigidos:** editar só o nome do cliente não apaga mais o e-mail (`3d74c7b`); salvar não apaga mais `modelo`/`descritivo_tecnico` dos itens (`2fec8b4`); data do histórico corrigida (mostrava "—")

### #8 — Logo do cliente na capa
- [ x ] Cliente **com** logo cadastrada: a logo aparece na capa, **acima** do nome do cliente
- [  x ] Cliente **sem** logo: capa normal, sem espaço vazio

### Regressão geral
- [ x ] Gerar/baixar o **PDF** e conferir que tudo acima também vale no PDF final
- [ x ] Console do navegador sem erros durante o fluxo

---

## Achados do seu teste — análise e o que eu acho

### ✅ Esclarecimentos (não são bugs)

- **"Só vejo remover a proposta, não um produto"** — são duas coisas diferentes. O "remover proposta" apaga a proposta inteira. Para remover **um produto**, o botão é o ícone 🗑 na **última coluna** de cada linha da **tabela de produtos**, dentro do formulário de edição (`PropostaForm.js:630`) — ele existe para todo item, mas é a coluna mais à direita e pode estar **cortada por scroll horizontal** numa tabela larga. → **Reteste:** role a tabela de produtos até a direita, clique no 🗑 de um item, salve, e confira "Produto removido" no histórico. (Se realmente não aparecer o 🗑, é um problema de layout/coluna cortada que eu corrijo.)
- **#6 em produção (explicação simples)** — o cabeçalho da proposta pode ser (a) o **padrão do sistema** (que agora mostra "Nº {número}") ou (b) uma **imagem de cabeçalho** que alguém subiu nas configurações. Se existir a imagem (b), ela **cobre** o cabeçalho padrão e, como é uma figura estática, não tem o número. Em prod parece ser esse o caso. Solução: apagar essa imagem nas configs pra voltar ao cabeçalho padrão com número. **Verificamos depois**, sem pressa.

### 🐛 Bugs do #7 a corrigir (auditoria de itens)

- **Produto adicionado não aparece no histórico** — preciso reproduzir. Hipóteses: (1) colisão de chave no diff quando o item não tem `codigo_produto` (dois itens caem na mesma chave e um "some"); (2) o painel de Histórico não recarrega logo após o save. → **Vou investigar** (systematic-debugging) com um caso real.
- **Edição parece "duplicada"** — causa provável confirmada no código: o log grava **uma entrada por campo alterado**. Ao mudar o preço de um item, mudam `valor_unitario` **e** `valor_total` ao mesmo tempo → **duas** linhas "Produto editado". → **Ajuste proposto:** agrupar numa entrada por item (ex.: "Produto editado: Masseira — valor 250.000 → 260.000"), em vez de uma por campo.
- **"Checar antes de salvar se não mudei pro mesmo valor"** — o diff já compara valor antigo × novo, mas por texto pode dar **falso-positivo** com formatação numérica (ex.: `250000` vs `250000.00`). → **Ajuste proposto:** normalizar números antes de comparar (comparar como número, não string).

### ~~🔮 Melhoria futura (#1)~~ — descartada

- **FINAME/BNDES como logos** — ~~trocar texto por imagem~~ **DISPENSADO**: o PM aprovou manter do jeito que está (texto). Nada a fazer.

### ℹ️ Observações adicionais (minhas)

- **Escopo da auditoria de itens:** o registro só dispara no **save do formulário de edição** (`PUT /api/propostas/:id`). Se um produto for adicionado por **outro caminho** (ex.: criar proposta a partir de oportunidade, duplicar proposta, importação), isso **não** entra no histórico hoje. Se precisar cobrir esses fluxos, é trabalho à parte.
- **A entrada "Produto editado" hoje não diz qual produto** — mostra só o campo (ex.: `valor_unitario`) e antes/depois, sem o nome do item. O ajuste de "agrupar por item" já resolve isso (passa a mostrar "Masseira — valor 250.000 → 260.000").

### Próximos passos — status (commit `7ac895f`)
- [x] Investigar "produto adicionado não aparece" (#7) — **causa raiz encontrada**: o diff comparava `modelo`/`descritivo_tecnico`, que o formulário nunca envia → toda gravação criava 2 edições **espúrias** por item, soterrando o "adicionado". Corrigido.
- [x] Agrupar log de edição por item (1 entrada, com nome do produto + resumo antes/depois) (#7)
- [x] Normalizar comparação numérica no diff (250000 == "250000" == 250000.0) (#7)
- [x] Bônus: corrigida a **data** do histórico que mostrava sempre "—" (`criado_em` → `created_at`)
- [x] **2ª causa raiz (add/remove não apareciam) — confirmada no banco e corrigida** (commit `19cb97a`): a proposta 288 tinha 3 itens com o **mesmo `codigo_produto`**. O diff usava um `Map` por chave que **colapsava duplicatas** → adicionar/remover uma duplicata não mudava o conjunto de chaves e não era detectado (só edição aparecia). Trocado por agrupamento por chave + pareamento por posição. 10/10 nos testes.
- [x] **Reteste ✅ (21/07):** adicionar/editar/remover produto (inclusive repetidos) aparecem corretamente no histórico, entrada agrupada, data correta. Validado no banco também.

> ✅ **Achado colateral — CORRIGIDO (commit `2fec8b4`):** ao salvar pelo formulário, o payload não envia `modelo`/`descritivo_tecnico`/`categoria`/`tag`/etc., e o INSERT gravava `null` → **salvar apagava esses dados dos itens**. Corrigido no backend: o re-INSERT agora **preserva** esses campos a partir do item existente (função `mesclarItensPreservandoCampos`, 4/4 no teste). Respeita o payload quando ele traz o campo.
> - [ ] **Reteste sugerido:** editar uma proposta que tenha itens com descritivo técnico → salvar → reabrir → o descritivo técnico (seção 4.x) **continua lá** (antes sumia).

---

## Pendências / o que ainda falta

### Reteste visual (quando puder, no navegador)
- [ ] **#8 Logo do cliente na capa** — abrir uma proposta cujo cliente tenha logo cadastrada e conferir a aparência (não validável headless aqui).
- [ ] **#1 Aparência final da 5.23** com dados reais (o isolamento em página própria já está confirmado).
- [ ] **Preservação do descritivo técnico** (achado colateral) — editar/salvar/reabrir e confirmar que a seção 4.x continua com o descritivo.

### Decisões suas
- [ ] **Abrir PR** de `fix/proposta-layout-auditoria` → `main`? (posso preparar)
- [ ] O commit de performance `03c2697` fica nesta branch ou vai para uma branch separada?
- [ ] **Diagnóstico prod #6** (`header_image_url`) — só se o número da proposta sumir no cabeçalho em produção.

### Backlog (não bloqueia; anotado em `auditoria.md`)
- [ ] Histórico: agrupar entradas consecutivas do mesmo usuário; filtros por usuário/tipo/período; controle de permissão (só admin/comercial).
- [ ] Auditoria de itens cobre só o save do formulário (`PUT /propostas/:id`). Produtos adicionados por outros fluxos (criar de oportunidade, duplicar proposta, importação) não entram no histórico.
- [ ] (Ofereci) Varredura por outros endpoints de save com o mesmo risco de "payload parcial zera colunas não enviadas" (já apareceu em itens e em contato).

---

## Todos os commits desta rodada (branch `fix/proposta-layout-auditoria`, pushados)

| Commit | O quê |
|---|---|
| Grupo A/B + merge | 8 cenários originais (5.23, quebras, descritivo, header, logo, auditoria base) |
| `8f4b7c0` | auditoria de itens só após save bem-sucedido |
| `7ac895f` | auditoria fiel: sem edições espúrias, agrupada por item, normalização numérica, data corrigida |
| `2fec8b4` | preservar campos do item não enviados pelo formulário (modelo/descritivo/etc.) |
| `1f841de` | botão de remover item visível (coluna rotulada + botão vermelho) |
| `19cb97a` | auditoria detecta add/remove com `codigo_produto` repetido (pareamento por posição) |
| `3d74c7b` | editar um campo de contato não apaga os demais (customizações) |
