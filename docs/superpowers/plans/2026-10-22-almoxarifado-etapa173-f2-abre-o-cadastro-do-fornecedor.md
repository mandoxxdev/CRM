# Etapa 173 — F2 abre o cadastro completo do fornecedor numa janela

> **Status:** em execução · **Branch:** `etapa-e173` (worktree `CRM-wt-e173`) · **Data:** 2026-10-22
> **Origem:** pedido do cliente (Compras), repassado pelo André em 2026-10-22: "atalho ao apertar F2 para abrir um
> modal com a tela de cadastro de fornecedor". Junto, a reclamação do mesmo cliente: "ao iniciar o cadastro, são
> exibidos apenas os campos Nome, Nome Fantasia e CNPJ" — medido: é o modal **"Cadastrar novo"** do grupo homologado
> (`FornecedoresDoGrupo.js`, 3 campos). A ficha de `/compras/fornecedores/novo` já é completa desde a Etapa 34.

## O que existe hoje (medido na Fase 0)

- `FornecedorForm.js` (Etapa 34): a ficha completa (13 campos, CNPJ e CEP que preenchem), só como **página**, que
  navega para a lista ao salvar.
- Pedido de compra (`PedidoCompraForm.js`) e cotação (`CotacaoForm.js`) escolhem o fornecedor num `<select>`. Quem não
  acha o fornecedor tem de sair da tela (e perder o que digitou) para cadastrá-lo.
- Nenhuma tela trata F2 (`grep "'F2'"` no client: zero). Os atalhos globais (`utils/atalhosTeclado.js`) usam F1 e
  Ctrl+B/K/R/W//: o F2 está livre.
- O F2 que existiu em 16/09 (`98f6fc9d`, inclusão de materiais em lote no pedido) **não é este**: foi descartado no merge
  de 07/10 (Etapa 39, B19). Esta etapa não o traz de volta.
- `POST /api/compras/fornecedores` devolve `201 { id, razao_social, nome_fantasia, grupo_id }`. **Nenhuma mudança de
  servidor nesta etapa.**

## Regras de negócio

| RN | Enunciado | Cenário |
|---|---|---|
| RN-173.01 | No pedido de compra e na cotação, **F2** abre uma janela com a **ficha completa** do fornecedor (as mesmas 13 entradas de `/compras/fornecedores/novo`). O F2 não chega ao navegador (`preventDefault`). | Comprador no pedido aperta F2 com o foco em qualquer campo → abre "Novo fornecedor" com Razão social, CNPJ, IE, grupo, contato, telefones, e-mail, CEP, endereço, cidade, estado. |
| RN-173.02 | Ao lado do campo Fornecedor há o botão **"Novo fornecedor (F2)"**, que faz o mesmo — quem não sabe do atalho também acha. | Clique no botão → mesma janela. |
| RN-173.03 | Salvou: o fornecedor novo **entra na lista** do campo e **já fica escolhido**; a janela fecha; nada mais do pedido/cotação muda (itens, valores, condições). Não há navegação. | Pedido com 3 itens digitados, F2, salva "ACME" → o campo mostra ACME e os 3 itens continuam. |
| RN-173.04 | Fechar a janela (botão ×, "Cancelar" ou **Esc**) não grava nada e não muda o pedido. **Clique fora não fecha** (a ficha tem 13 campos — um clique errado não pode jogá-los fora). | Digita meia ficha, clica no fundo escuro → janela continua aberta com o digitado. |
| RN-173.05 | Com o fornecedor travado (pedido recebido = "só status"; cotação que já virou pedido), o F2 **não abre** e o botão não aparece. | Pedido recebido, F2 → nada. |
| RN-173.06 | Com a janela aberta, outro F2 não abre segunda janela; segurar o F2 (`repeat`) não abre várias. F2 com Ctrl/Alt/Shift/Meta não é o atalho. **Com outra janela aberta por cima** (busca global Ctrl+K, ajuda F1, relatório, workflow, ou um modal da própria tela) o F2 não faz nada — senão a ficha abriria escondida atrás dela. | F2 duas vezes → uma janela só. Ctrl+K aberto + F2 → nada. |
| RN-173.07 | Recusa do servidor (permissão, validação) aparece **dentro da janela** em `role="alert"`, com a frase do servidor; a janela fica aberta e o digitado fica. | Grupo desativado com a janela aberta → POST → 400 "Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores" → a frase aparece e a ficha continua preenchida. (O exemplo original, "400 CNPJ inválido", **não existe**: o servidor não valida CNPJ — corrigido na Fase 2.) |
| RN-173.08 | No grupo homologado, **"Novo fornecedor"** abre a **mesma ficha completa** (com o grupo já escolhido **e travado**) no lugar do modal de 3 campos, e F2 faz o mesmo (só quando o botão existe — `podeVincular` — e nenhum outro modal da tela está aberto). Ao salvar, a lista do grupo recarrega. O modal de 3 campos deixa de existir. | Grupo "Insumos" → Novo fornecedor → ficha com Grupo homologado = Insumos → salva → aparece na lista do grupo. |
| RN-173.09 | A página `/compras/fornecedores/novo` e `/editar/:id` continua igual (mesmo corpo de POST/PUT, mesma navegação, mesmo toast) — a suíte da Etapa 34 passa **sem edição**. | `FornecedorForm.test.js` verde sem tocar no arquivo. |

## Contratos

Nenhuma rota nova. Consome, sem mudar:

- `POST /api/compras/fornecedores` — a rota que responde é a de `server/routes/compras/fornecedores.js` (registrada
  antes; a de `server/routes/compras.js` com `FornecedorSchema` **nunca roda** — a primeira versão deste plano citava a
  errada, corrigido na Fase 2). Corpo: as 13 chaves de `CHAVES_CONTRATO` (Etapa 34). `201 { id, razao_social,
  nome_fantasia, grupo_id }` (`nome_fantasia` vem `null` quando vazio). Recusas, literais:
  - `400 "Razão social é obrigatória"` (a tela barra antes, com a mesma literal)
  - `400 "Grupo inválido"` · `400 "Grupo não encontrado"`
  - `400 "Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores"`
  - `403 "Acesso negado ao módulo"` · `500 err.message`

  Todas vão para o `role="alert"` da janela (RN-173.07). O servidor **não** valida CNPJ.
- `GET /api/compras/grupos` — lista do select "Grupo homologado" (já consumida pela ficha).

Contrato interno (componentes do client):

- `FornecedorFicha({ fornecedorId?, grupoIdInicial?, onSalvo(fornecedor), onCancelar, rotuloCancelar? })` — o corpo da
  ficha, sem cabeçalho de página e sem navegação. `onSalvo` recebe `{ ...corpoEnviado, id, status }` (o `id` do 201 no
  cadastro; o da rota na edição). Toast é do chamador.
- `FornecedorModal({ aberto, grupoIdInicial?, onSalvo(fornecedor), onFechar })` — `role="dialog"`, `aria-modal`,
  título "Novo fornecedor", Esc e × fecham, clique no fundo não fecha.
- `useAtalhoF2(ativo, aoApertar)` — escuta `keydown` na janela enquanto `ativo`; F2 puro, sem `repeat`.

## Tasks (sort topológico)

| Task | O que | Tipo |
|---|---|---|
| T1 | Extrair `FornecedorFicha` de `FornecedorForm` (a página vira casca: cabeçalho + navegação + toast). Suíte da 34 sem edição (RN-173.09). | tronco |
| T2 | `FornecedorModal` + `useAtalhoF2`, com testes próprios (RN-173.04, 06, 07). | tronco |
| T3 | Pedido de compra e cotação: botão + F2 + seleção do novo (RN-173.01/02/03/05). | galho |
| T4 | Grupo homologado: o modal de 3 campos vira a ficha completa, botão e F2 (RN-173.08). | galho |
| T5 | Integração: no pedido, F2 → preenche → salva → o novo está escolhido **e** o POST do pedido leva o `fornecedor_id` dele, com os itens intactos (cruza T1+T2+T3 pela fronteira HTTP). | integração |

T3 e T4 são galhos (só consomem o modal congelado em T2), mas pequenos e no mesmo client: rodam em sequência nesta
worktree — paralelizar custaria mais (duas worktrees, dois jest) do que economiza.

## Fase 2 — o que a revisão do plano achou (aplicado antes do código das telas)

1. **Salvar a janela enviaria o pedido junto** (Critical): o React leva o `submit` pelo portal até o `onSubmit` do
   `<form>` pai. Duas proteções: a janela é renderizada **fora** do `<form>` do pedido/cotação, e a ficha chama
   `stopPropagation` no submit. Medido: tirar só uma não derruba o cenário de integração; tirar as duas derruba.
2. **Contrato da rota errada** — corrigido acima.
3. **Esc da busca global por cima fecharia a ficha** — o Esc só vale com o foco dentro da janela ou sem foco (regra de
   `BuscaGlobal.js`); o F2 é ignorado com outra janela aberta (`JANELAS_POR_CIMA` em `useAtalhoF2.js`).
4. **Grupo**: o campo "Grupo homologado" trava no grupo da tela; o F2 respeita `podeVincular` e os outros dois modais.
5. **A lista inicial que chega depois do cadastro apagava o novo** — `juntarListaCarregada`; o novo vai para o topo
   (`colocarNoTopo`, a ordem do servidor é `created_at DESC`).
6. **F2 durante o carregamento do pedido** (o "só status" ainda não chegou) — o F2 fica desligado enquanto carrega.

## Decisões (letra B)

- **Clique fora não fecha** (RN-173.04) — descartado: fechar no clique fora, como o modal antigo do grupo. Motivo: ficha
  longa; perder 13 campos por um clique é pior do que um clique a mais para fechar.
- **Escopo das telas:** pedido de compra, cotação e grupo homologado. Fora: Remessas a terceiros e Reposição do
  almoxarifado (também têm fornecedor) — não foram pedidas; o hook e o modal servem a elas sem mudança se pedirem.
- **O F2 antigo (lote de materiais, `98f6fc9d`) não volta** — a tecla agora é do fornecedor, que é o pedido vigente.

## Andamento

- [ ] T1
- [ ] T2
- [ ] T3
- [ ] T4
- [ ] T5
- [ ] Revisão adversarial
- [ ] Fechamento
