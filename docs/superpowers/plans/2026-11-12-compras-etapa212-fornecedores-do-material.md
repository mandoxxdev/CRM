# Etapa 212 (Compras) — vários fornecedores para o mesmo material

> Pedido da compradora (12/11/2026, `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/`, img1, img2, img5).
> Estimativa `docs/estimativas/2026-11/estimativa_2026-11-12_cadastro-de-material-fornecedores.md`, item 2 (3h30). Fila do Compras,
> linha 4 (o cliente pediu fornecedores primeiro; a Etapa 211 ficou no branch `etapa-211-familias-no-compras-wip`).
> Regra permanente: cadastro é do Compras — tudo aqui vive no formulário de Compras → Materiais.

## Medido antes (Fase 0)

- **Já existe** `itens_fornecedor` (`server/index.js:19104`): catálogo de cada fornecedor — `fornecedor_id`, `codigo`, `descricao`
  (NOT NULL), `unidade`, `preco`, `observacoes`. Rotas `GET/POST/PUT/DELETE /api/compras/fornecedores/:fornecedorId/itens[/:id]` e
  `.../itens/importar` (`routes/compras.js:987-1105`), porta só do módulo Compras. Tela `components/ItensFornecedor.js`
  (Compras → Fornecedores homologados → fornecedor). **Não tem ligação com o material da GMP.** ~~O harness de teste não cria a tabela~~
  **— estava errado** (Fase 2): o harness cria, em `testApp.js:185`, desde a Etapa 40, mas depois do `initSchema`; a T1 cria antes,
  com `material_id`. A tela `ItensFornecedor` busca os itens mas **não os lista** (mostra a planilha) — a RN-212.05 ficou só no servidor.
- No material: `fornecedor_principal` e `codigo_fornecedor`, texto livre, um por material (`schema.js:524`), editados na seção
  "Unidades e custos" do formulário (`MaterialAlmoxarifadoForm.js:1119-1126`); a lista de Materiais mostra `fornecedor_principal`
  (`TabelaMateriais.js:167`).
- O cadastro de material é só do Compras desde a 193 (`portaCompras`, `services/compras/cadastroDeMaterial.js`).

## Decisão de desenho (letra B)

**Escolhido:** o vínculo é uma coluna nova `itens_fornecedor.material_id` — a linha do catálogo do fornecedor que **é** aquele material
da GMP. Um material tem N linhas (uma por fornecedor), cada uma com o código, a descrição comercial, a unidade e o preço do fornecedor.
Assim o catálogo que já existe e a lista do material são a mesma informação (cadastrar num aparece no outro), e o preço já mora na
linha (base para o item 6, histórico de preços). **Descartado:** tabela nova `materiais_fornecedores` — duplicaria código, descrição e
preço do catálogo, e as duas listas divergiriam.

## Regras de negócio

- **RN-212.01** — No formulário de material do Compras (só ao editar: o material precisa existir), a seção **Fornecedores deste
  material** lista as linhas vinculadas (fornecedor, código no fornecedor, descrição comercial, unidade, preço) e permite **adicionar**,
  **editar** e **remover**. Grava quem cadastra material (admin do Compras ou do sistema — `portaCompras`).
- **RN-212.02** — Um fornecedor só uma vez por material: 409 `Este fornecedor já está vinculado a este material.` Fornecedor que não
  existe: 400 `Fornecedor não encontrado.` Sem fornecedor: 400 `Escolha o fornecedor.`
- **RN-212.03** — A descrição comercial é opcional; vazia, grava o nome do material (a coluna é NOT NULL e o catálogo do fornecedor
  precisa de um texto). O código interno da GMP nunca muda por esta seção.
- **RN-212.04** — Os campos **Fornecedor Principal** e **Código no Fornecedor** saem do formulário. No boot, cada material com
  `fornecedor_principal` preenchido cujo texto bate (sem caixa, sem acento, aparado) com a razão social ou o nome fantasia de **um só**
  fornecedor ganha a linha (código = `codigo_fornecedor`), se ainda não tiver. Os que não batem continuam com o texto gravado e o
  formulário mostra, na seção, `Fornecedor informado antes (texto livre): <texto>` (e o código), para a compradora vincular à mão.
  Nada é apagado (reversível).
- **RN-212.05** — No catálogo do fornecedor (tela Itens do fornecedor), a linha vinculada mostra o código GMP do material.
  Remover o vínculo pelo material **apaga a linha do catálogo** (é a mesma linha). Descartado: só desvincular (deixaria linhas
  órfãs duplicadas a cada vincular/remover).

## Contratos (novos, porta do cadastro do Compras)

| Método e caminho | Porta | Corpo | Respostas |
|---|---|---|---|
| `GET /api/compras/materiais/cadastro/:id/fornecedores` | `portaCompras.leitura` | — | 200 `[{ id, fornecedor_id, fornecedor_nome, codigo, descricao, unidade, preco, observacoes }]` ordenado pelo nome do fornecedor; 404 `Material não encontrado` |
| `POST .../cadastro/:id/fornecedores` | `portaCompras.escrita('editar_material')` | `{ fornecedor_id, codigo?, descricao?, unidade?, preco? }` | 201 a linha; 400/404/409 acima |
| `PUT .../cadastro/:id/fornecedores/:linhaId` | idem | `{ codigo?, descricao?, unidade?, preco? }` (o fornecedor não muda) | 200 a linha; 404 `Vínculo não encontrado` |
| `DELETE .../cadastro/:id/fornecedores/:linhaId` | idem | — | 200 `{ ok: true }`; 404 idem |

Preço: número ≥ 0 ou vazio (0); negativo/não numérico → 400 `Preço inválido.`

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | Schema: `itens_fornecedor` no `initSchema` do almoxarifado (IF NOT EXISTS, mesma DDL) + `material_id` + índice único parcial (material_id, fornecedor_id); migração RN-212.04 | tronco | feita `f59c0551` |
| T2 | Serviço + 4 rotas (`services/compras/fornecedoresDoMaterial.js`, registradas ao lado das portas do cadastro); teste `fornecedoresDoMaterial.api.test.js` com controle positivo | tronco | feita `f59c0551` (10/10; 6 sabotagens vermelhas) |
| T3 | Tela: seção no formulário (só `rotas.modulo === 'compras'` e edição), tira os dois campos, aviso do texto antigo; coluna "Material GMP" no catálogo do fornecedor; testes | galho | feita `db55113a` (6/6 e 4/4; 3 sabotagens vermelhas). A coluna no catálogo **não** foi feita: a tela não lista os itens |
| T4 | Integração: vincular pelo material → aparece no catálogo do fornecedor; editar preço no catálogo → aparece no material | integração | feita em `f59c0551` (cenário [T4 integracao] pela rota) |
| T5 | Fechamento | — | — |

## Execução (2026-11-12)

- **Fase 2 (revisor fresco, antes de executar):** 10 achados; aplicados — a migração roda **uma vez** (marca em
  `configuracoes_almoxarifado`; sem ela o vínculo removido voltava no boot), a guarda nas rotas do catálogo (B85), o código GMP na
  leitura do catálogo, a mensagem de fornecedor inativo, e o formulário mantém os dois campos antigos no estado e na lista de campos
  lidos (só o input saiu). O resto foi para "Fora".
- **Controle positivo:** servidor — sem acento, guarda, marca, inativo, normalização NFC e índice único invertido: 6 sabotagens, 6
  vermelhos no cenário certo; tela — seção no Almoxarifado, POST sem fornecedor, lista sem filtrar os vinculados: 3 vermelhos.

- **Fase 5 (revisor fresco, 4 lentes):** servidor e autorização sem achado; 2 achados reais na tela, corrigidos e com teste + sabotagem: **Enter** num campo da seção enviava o formulário do material (PUT, volta para a lista, fornecedor perdido) — agora salva o fornecedor; preço **"1.234,56"** dava 400 — agora grava 1234,56. Risco registrado, não corrigido: o código do fornecedor sobe para maiúsculo (o campo antigo e o catálogo já subiam; nada compara o código pela caixa). Ainda fora: salvar o material com o rascunho de fornecedor aberto descarta o rascunho.

- **Verificação final (medida):** servidor na `main` em `db55113a` — `test:api` 605/605 arquivos, `test:almoxarifado` 44/0, validation 4/0, safealter 3/0, sqlite 16/0. Depois da correção da Fase 5 (`e74bcb05`), `fornecedoresDoMaterial` 11/11. **Tela inteira e build NÃO concluídos:** a rodada foi interrompida pelo sistema por falta de memória; rodaram só as suítes tocadas (`FornecedoresDoMaterial` 7/7, `MaterialFormFornecedores` 4/4, `MaterialAlmoxarifadoForm`, `MaterialFormDicaConfiguracoes`, `MateriaisCompras` — verdes). Falta rodar `react-scripts test` inteiro e o build.

## Retro (4 números)

- Rodadas de correção até verde: 1 (Fase 5).
- Achados: Fase 2 com 10 (8 aplicados, 2 para Fora); Fase 5 com 2 reais, 0 ruído.
- Paralelismo: nenhum galho em paralelo (servidor e tela em sequência, pelo contrato).
- Defeito que escapou: preencher na próxima etapa.

## Próxima tarefa detalhada

Fila do Compras, linha 5: **o código do fornecedor na cotação e no pedido de compra** (tela e impresso). Consome a linha `itens_fornecedor` por (`material_id`, `fornecedor_id`) — ou `GET /api/compras/materiais/cadastro/:id/fornecedores`, mas essa porta exige quem cadastra material; o comprador comum monta pedido, então a leitura no pedido precisa de porta própria do pedido (módulo Compras). Medir antes: como o item do pedido guarda o material (`itens_pedido_compra.material_id`?) e onde o documento impresso monta a linha (`services/compras/pedidoDocumentoHtml.js`).

## Fora (declarado)

- A busca da lista de Materiais (`almoxarifado.js:462`) só procura no `fornecedor_principal` antigo (Fase 2, achado 8).
- A exclusão de fornecedor com vínculo dá 409 "Fornecedor possui itens cadastrados" — correto, mas a frase não diz que são vínculos
  de material (Fase 2, achado 9).

- O código do fornecedor na cotação e no pedido (item 5 da fila) e o histórico de preços (item 6) — etapas próprias, em cima deste vínculo.
- A lista de Materiais continua mostrando `fornecedor_principal` (texto antigo) — troca no item 5.
