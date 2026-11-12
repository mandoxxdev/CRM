# Etapa 212 (Compras) — vários fornecedores para o mesmo material

> Pedido da compradora (12/11/2026, `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/`, img1, img2, img5).
> Estimativa `docs/estimativas/2026-11/estimativa_2026-11-12_cadastro-de-material-fornecedores.md`, item 2 (3h30). Fila do Compras,
> linha 4 (o cliente pediu fornecedores primeiro; a Etapa 211 ficou no branch `etapa-211-familias-no-compras-wip`).
> Regra permanente: cadastro é do Compras — tudo aqui vive no formulário de Compras → Materiais.

## Medido antes (Fase 0)

- **Já existe** `itens_fornecedor` (`server/index.js:19104`): catálogo de cada fornecedor — `fornecedor_id`, `codigo`, `descricao`
  (NOT NULL), `unidade`, `preco`, `observacoes`. Rotas `GET/POST/PUT/DELETE /api/compras/fornecedores/:fornecedorId/itens[/:id]` e
  `.../itens/importar` (`routes/compras.js:987-1105`), porta só do módulo Compras. Tela `components/ItensFornecedor.js`
  (Compras → Fornecedores homologados → fornecedor). **Não tem ligação com o material da GMP.** O harness de teste não cria a tabela
  (`comprasPedidosRotas.api.test.js:238` cria à mão).
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
| T1 | Schema: `itens_fornecedor` no `initSchema` do almoxarifado (IF NOT EXISTS, mesma DDL) + `material_id` + índice único parcial (material_id, fornecedor_id); migração RN-212.04 | tronco | — |
| T2 | Serviço + 4 rotas (`services/compras/fornecedoresDoMaterial.js`, registradas ao lado das portas do cadastro); teste `fornecedoresDoMaterial.api.test.js` com controle positivo | tronco | — |
| T3 | Tela: seção no formulário (só `rotas.modulo === 'compras'` e edição), tira os dois campos, aviso do texto antigo; coluna "Material GMP" no catálogo do fornecedor; testes | galho | — |
| T4 | Integração: vincular pelo material → aparece no catálogo do fornecedor; editar preço no catálogo → aparece no material | integração | — |
| T5 | Fechamento | — | — |

## Fora (declarado)

- O código do fornecedor na cotação e no pedido (item 5 da fila) e o histórico de preços (item 6) — etapas próprias, em cima deste vínculo.
- A lista de Materiais continua mostrando `fornecedor_principal` (texto antigo) — troca no item 5.
