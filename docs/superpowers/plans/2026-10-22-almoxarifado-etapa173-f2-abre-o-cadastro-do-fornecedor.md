# Etapa 173 — F2 abre o cadastro completo do fornecedor numa janela

> **Status:** 🟢 entregue (2026-10-22) · **Branch:** `etapa-e173` (worktree `CRM-wt-e173`) · **Data:** 2026-10-22
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

- [x] T1 — `1f889f51`: `FornecedorFicha` extraída; a suíte da 34 passa sem edição (22/22). Controle: trocar o toast da página derruba 2.
- [x] T2 — `0cbaa535`: `FornecedorModal` (portal, Esc só com foco dentro, fundo não fecha) e `useAtalhoF2`; a ficha ganha `grupoTravado` e
  `stopPropagation` no submit.
- [x] T3 — `f86947bb`: pedido e cotação (botão, F2, novo no topo e escolhido, `juntarListaCarregada`, desligado com fornecedor travado e
  enquanto carrega).
- [x] T4 — `85b4bbdc`: grupo homologado — o modal de 3 campos saiu; a ficha completa com o grupo travado; F2 respeita `podeVincular` e os
  outros dois modais.
- [x] T5 — `15b8b91a`: `FornecedorF2.test.js`, 19 cenários (23 depois da Fase 5), incluindo o pedido salvo de ponta a ponta.
- [x] Revisão adversarial — `5b67cfa8` (abaixo).
- [x] Fechamento — novidades (seção da etapa, **B1120** a **B1124**), manual (14c.2 reescrita, 14c.4, 14c.5), guia, mapa de Compras.

**Divergências do plano.**
- A T1 foi feita antes da revisão do plano (Fase 2) voltar, por não depender dela; nada nela mudou depois.
- **A primeira versão do plano citava a rota de fornecedor errada** (`server/routes/compras.js` com `FornecedorSchema`, que nunca roda) e um
  exemplo de recusa que não existe ("400 CNPJ inválido"). Corrigido na Fase 2 — ver acima.
- **O manual do sistema estava errado sobre o fornecedor desde a Etapa 34**, independente desta etapa: a 14c.2 descrevia a ficha antiga
  (sem inscrição estadual, CEP, os dois telefones, a consulta do CNPJ) e a 14c.4 citava as recusas da rota que nunca roda (*"Dados inválidos —
  razao_social: …"*, *"Dados inválidos — grupo_id: …"*, *"Dados inválidos — status: …"*); o certo, lido do código e da suíte
  `comprasFornecedor.api.test.js`, é *"Razão social é obrigatória"*, *"Grupo inválido"*, *"Grupo não encontrado"*, *"Grupo desativado — …"*,
  *"Status inválido"*. Reescrito no manual (que não guarda a versão errada à vista, pela regra dele); registrado aqui.
- Paralelismo: zero. T3 e T4 eram galhos, mas pequenos e no mesmo client — rodaram em sequência (decisão do plano).

## Fase 5 — revisão adversarial

Um revisor fresco, quatro lentes. Cinco achados, todos reais; nenhum ruído:

1. **Com o guia "?" aberto o F2 abria a ficha escondida atrás dele** (z-index 9999, montado em toda tela) — o guia e o tour entram em
   `JANELAS_POR_CIMA`. Corrigido, com teste.
2. **O Tab escapava da janela** para o pedido atrás do fundo escuro (`aria-modal` não prende foco); um Enter ali salvaria o pedido com o
   fornecedor antigo. O Tab agora circula dentro. Corrigido, com teste.
3. **Ao fechar, o foco caía no `<body>`.** Volta ao campo de onde o F2 foi apertado — lido no **render** que abre a janela (no efeito já
   seria a razão social: o efeito da ficha, filha, roda antes). Corrigido, com teste — e com a sabotagem que lê no efeito (S14) derrubando-o.
4. **"Cancelar" não tinha teste.** Escrito.
5. **Duas guardas redundantes** (`!novoFornecedorAberto`, `!showModalAdd`) — o seletor de janelas por cima também as cobre; apagar só uma
   não derruba teste. **Mantidas e declaradas** (proteção em dobro), como o par portal-fora-do-form + `stopPropagation`.

Controle positivo da etapa: 15 sabotagens (S1–S15). S1 (só o `stopPropagation`) não derrubou nada — o defeito ficou **inalcançável** pela
outra proteção (a janela fora do `<form>` na árvore do React); a sabotagem dupla derruba o cenário de integração. As outras 14 derrubaram
cada uma o cenário dela (lido o nome do cenário que caiu, não só o placar).

## Retro (4 números)

- Rodadas de correção até verde: **1** (a Fase 5).
- Achados: Fase 2 — **8** (2 bloqueantes, 6 menores), todos reais; Fase 5 — **5**, todos reais, 0 ruído.
- Paralelismo: **0** galhos em paralelo (decisão: tasks pequenas no mesmo client); sem retrabalho.
- Defeito que escapou: a preencher na próxima etapa que tocar Compras.

## Próxima tarefa detalhada

A próxima etapa numerada é da outra frente (a **174** está reservada para a sessão que fecha a 172). Desta frente, o que a usuária de Compras
pediu e ainda não existe, em ordem de valor e de prontidão:

1. **Ferramentas: o formulário de edição na tela** (spec `16-ferramentas-calibracao`, checklist "Edição de ferramenta pela tela").
   `PUT /api/almoxarifado/ferramentas/:id` e o 409 de patrimônio duplicado **já existem e estão testados**
   (`server/tests/api/toolFerramentaEdicao.api.test.js`) — falta só o formulário em `FerramentasAlmoxarifado.js`. É o primeiro passo do
   item "ferramentas, EPIs e ativos" que ela pediu, e não depende de nada que ela precise mandar.
2. **Entrega/empréstimo de ferramenta e EPI com assinatura** (NR-6: identificação do colaborador, registro sem edição, número do CA, ficha
   de EPI em PDF). **Espera os formulários em papel** que a empresa usa hoje — sem eles, os campos seriam inventados. A assinatura de entrega
   de requisição (`deliverySignatureService.js`, append-only) é o molde de gravação.
3. **Retorno da manutenção com a condição do item e o destino (volta ao responsável ou descarte/baixa).** Hoje `concluir manutenção` só
   devolve a ferramenta a *DISPONIVEL* (`toolService.js`); falta a condição e a baixa patrimonial.

Pontos de atenção para quem pegar a 1: a tela de ferramentas usa a ação de perfil `gerenciar_ferramentas` (ADMINISTRADOR, ALMOXARIFE) nas
escritas; o 409 de patrimônio duplicado tem literal própria no teste citado — a tela tem de mostrá-la sem reescrever. O teste prova o
409 no **POST** e o PUT em id inexistente (404); **medir** se o PUT que duplica patrimônio também responde 409 antes de prometer a frase na tela.
