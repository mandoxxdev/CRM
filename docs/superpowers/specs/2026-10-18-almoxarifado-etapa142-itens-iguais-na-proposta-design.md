# Etapa 142 (propostas): a identidade do item no salvamento — itens iguais, variáveis manuais e campos preservados (C298, C308, C309) — design

> Origem: "Próxima tarefa detalhada — Etapa 142" do plano da 141. Plano com as RN e os contratos:
> `docs/superpowers/plans/2026-10-18-almoxarifado-etapa142-itens-iguais-na-proposta.md`.

## Fase 0 — o que foi medido (2026-10-18, worktree `CRM-wt-e142`, da main `93c6dddb`)

**Como o formulário manda os itens no `PUT /api/propostas/:id`.** `montarPayloadProposta` (`client/src/components/proposta/payloadProposta.js`)
monta cada item com `descricao, quantidade, unidade, valor_unitario, valor_total, codigo_produto, familia_produto, regiao_busca,
desconto_percentual, preco_tabela, acessorios` — **sem o `id`**. *(**Esta frase estava errada** — Fase 2, C1: "o estado `itens` do
`proposta/PropostaForm.js` tem o `id` de cada item gravado". Não tem: o carregamento (linhas 232-260) monta cada item campo a campo, sem o
`id` — a medição leu o `components/PropostaForm.js`, que é código morto. O plano põe o `id` no carregamento e prova pelo formulário montado.)*
O `GET /api/propostas/:id` devolve o `id` de cada item (`SELECT * FROM proposta_itens`); o item incluído na tela (`addItem`, o modal de
produtos) nasce sem `id`. Depois de salvar, a tela navega para a lista (`navigate('/comercial/propostas')`) — não há segundo `PUT` com ids velhos. Os
outros que mandam `itens` no `PUT` são `components/PreviewPropostaEditavel.js` (código morto, D (140)) — manda o item inteiro, com `id`.

**O que o `PUT` faz com os itens.** Com `itens` presente (Etapa 138): `DELETE FROM proposta_itens WHERE proposta_id = ?` e reinsere todos,
na ordem do corpo — `proposta_itens.id` é `INTEGER PRIMARY KEY AUTOINCREMENT` (ids novos, crescentes, **nunca reaproveitados**). Antes de
inserir, `mesclarItensPreservandoCampos(itensAtuais, itens)` (`server/propostaItensDiff.js`) devolve a cada item do corpo os campos que a
tela não manda (`CAMPOS_PRESERVAR`: tag, modelo, categoria, descricao_resumida, descritivo_tecnico, dados_processo,
materiais_construtivos, utilidades_requeridas, opcionais, exclusoes, prazo_individual, descricao_tabela, acessorios). Depois,
`religarVariaveisManuais` reaponta `proposta_variaveis_manuais.item_id` dos ids velhos para os novos casando **código do produto (ou
descrição) + posição entre os iguais** (`chaveDe` + `#n`), entre os itens velhos e os novos lidos do banco.

**C298 reproduzida (pela leitura do código e pela função pura copiada do `index.js`).** Velhos `[P#1 id1 (TAG-A), P#2 id2 (TAG-B)]`, corpo
`[P]` (o segundo) → novo `[P#1 id3]`: a religação casa `P#1 → P#1`, ou seja `id1 → id3` — o que ficou recebe a TAG-A; `id2` fica órfão.
E o reparo da leitura (`repararVariaveisManuais`, usado pelo `/premium` e pelo `/pdf`) **também** reaponta a órfã TAG-B para `P#1` (id3),
que já tem a TAG-A: saem duas linhas `(id3, tag)` e o template fica com a que vier por último (`valoresManuais["id:chave"]`). Medido com a
função: `[{12,tag,A,P}, {12,tag,B,P}]`.

**Achados da medição (anteriores a esta etapa):**

- **C308 — a mesclagem copia os campos do último item igual para todos os iguais.** `mesclarItensPreservandoCampos` monta um `Map` por
  `chaveDe`: com dois itens do mesmo produto, o `Map` guarda só o **último**, e os dois itens do corpo recebem os campos dele. Medido:
  velhos `[{P, tag X, descricao_tabela 'linha 1'}, {P, tag Y, 'linha 2'}]`, corpo `[P, P]` → `['Y/linha 2', 'Y/linha 2']`. Ou seja, **todo
  salvamento pelo formulário** de uma proposta com o mesmo produto duas vezes troca a descrição da tabela de preços, a tag, os acessórios,
  o prazo individual e o descritivo do primeiro pelos do último — sem tirar item nenhum. Banco local: 1 proposta (74) com produto repetido
  (13 e 7 vezes) — todos esses campos nulos nela, nada a medir de estrago.
- **C309 — o reparo da leitura divide as variáveis de um item entre dois.** O reparo conta a posição **por linha de variável**, não por
  item: um item órfão com duas variáveis (`tag`, `serie`) de um produto que aparece duas vezes manda a `tag` para o primeiro e a `serie`
  para o segundo. Medido: `[{10,tag,A}, {11,serie,S}]`.
- A identidade compara o texto cru: o banco grava a descrição em caixa alta (`'Item 1'` vira `'ITEM 1'`) e a mesclagem compara com o corpo
  — um item **sem código** mandado em outra caixa não recupera os campos preservados. A religação compara banco com banco (não sofre disso).

**Banco local** (`SELECT item_chave, COUNT(*) FROM proposta_variaveis_manuais GROUP BY 1`): **vazio** — nenhuma variável manual gravada; 0
órfãs. Não há o que migrar de dado; a coluna nova nasce nula em tudo.

**Testes que já cobrem a área:** `tests/variaveisManuaisReligar.test.js` e `tests/variaveisManuaisIdentidade.test.js` trazem **cópias** das
duas funções (fora de qualquer `npm run`); `tests/propostaItensPreservar.test.js` (revisão obrigatória) cobre a mesclagem sem itens
iguais; `tests/api/putParcialMantem.api.test.js` RN-03b (C296) salva pela rota **sem ids** e confere a religação. Nenhum cobre itens
iguais.

**C297 (a alternativa) medida e deixada para o P.O.:** na tela o campo *Classificação de Área* está marcado **obrigatório** (`*`) e é
um par de botões sem gesto de limpar; o valor mora em **dois lugares** (a coluna `produtos.classificacao_area` e
`especificacoes_tecnicas.classificacao_area`, JSON) e as leituras (`GET /api/produtos`, `GET /api/produtos/:id`) caem no JSON quando a
coluna está vazia — fazer o `PUT` apagar a coluna com `""` não apagaria nada na tela. Decidir "o vazio apaga" é decidir se o campo é
obrigatório e qual dos dois lugares manda: regra do cadastro, do P.O. (B924).

## Decisões de desenho

1. **O formulário manda o `id` de cada item que já estava gravado** (o item incluído na tela vai sem `id`). É o único que sabe qual dos
   dois iguais saiu — o servidor sozinho só vê "um P a menos".
2. **Um pareamento só, puro, para a mesclagem e para a religação** — `parearItens(itensAtuais, itensDoCorpo)` em
   `server/propostaItensDiff.js`. Dois modos:
   - **por id** — quando pelo menos um item do corpo traz o `id` de um item atual da proposta com a mesma identidade: cada item do corpo
     com `id` válido (existe entre os atuais, mesma identidade, não usado por outro item do corpo) fica com o seu; o resto do corpo é item
     novo; o atual que ninguém reclamou **saiu**.
   - **por posição** — sem nenhum `id` válido (API, a tela antiga, o corpo das Etapas 138 e anteriores): o k-ésimo item de identidade P do
     corpo fica com o k-ésimo atual de identidade P (o que a religação já fazia; a mesclagem passa a fazer o mesmo em vez de "o último").
   A identidade é `chaveDe` sem espaços nas pontas e sem caixa (B922).
3. **A mesclagem preserva os campos do item pareado** (C308). O item do corpo **sem par** que tem um igual entre os atuais continua
   herdando do último igual — o que acontece hoje com o item incluído de um produto que já está na proposta (B920; mudar isso é outra regra).
4. **A religação usa o mesmo pareamento**: item do corpo `i` ↔ linha nova `i` (os ids novos saem na ordem do corpo). Se a contagem de linhas
   novas não bater com a do corpo, não religa nada (o reparo da leitura cuida) — nunca apaga.
5. **As variáveis do item que saiu (modo por id) são aposentadas, não apagadas** (B919): coluna nova
   `proposta_variaveis_manuais.item_removido_em` (data). Aposentada não aparece no documento, não passa para outro item no reparo, nem
   quando o mesmo produto volta. Desfazer é limpar a coluna. No modo por posição nada é aposentado (o servidor não sabe qual saiu).
6. **O reparo da leitura (C309):** agrupa as órfãs **por item antigo**; para cada identidade, os itens antigos em ordem de id vão para os
   itens atuais da mesma identidade **sem nenhuma variável viva**, na ordem do documento; aposentada nunca é candidata; nunca escreve em item
   que já tem variável (sem linha dobrada).
7. **`id` inválido no corpo** (inexistente, de outra proposta, repetido, de outro produto) é ignorado sem erro — o item vira novo (B923).
8. **Fora:** a auditoria de itens (`diffItensParaLog`) continua pareando por posição — com o pareamento por id, tirar o primeiro de dois
   iguais pode registrar "editado" + "removido" em vez de só "removido" (D (142)); o `POST /api/propostas` não lê `id`.

**Revisto pela Fase 2 (o plano tem o detalhe):** a decisão 5 vale nos **dois** modos (no por posição, "o que saiu" é o último da identidade;
tirar todos aposenta todas); o `id` de item **manual** vale mesmo com a descrição editada; o item novo não herda do que acabou de sair; e o
reparo da decisão 6 é **gravado** no `PUT` da proposta (antes de parear, com as órfãs que não cabem aposentadas) e no `PUT .../variaveis-manuais`
(antes do upsert, que passa a ignorar `item_id` que não é item da proposta) — sem isso a órfã que sobrava ia para o produto incluído depois.
