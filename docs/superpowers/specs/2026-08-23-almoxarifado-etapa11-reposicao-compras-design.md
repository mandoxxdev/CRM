# Etapa 11 — Reposição e compras (design)

> **Data:** 2026-08-23 · **Feature:** 18 (reposição e estoque mínimo) · **Spec original:** seção 22
> **Baseline:** alertas de mínimo maduros (`alertService`), `solicitacoes_compra_almoxarifado` +
> `purchaseService` mínimo (verificar-mínimos por saldo físico, dedupe por PENDENTE,
> vincular-pedido), colunas `ponto_reposicao`/`lote_economico`/`prazo_reposicao_dias`/
> `fornecedor_id` já no material, perfil COMPRAS existente e quase sem uso.
> **Autorização:** etapa conduzida sob a autorização permanente do usuário (overnight); decisões
> tomadas no lugar dele estão em "Decisões" e vão para a letra B do fechamento.

## O problema

O módulo sabe **avisar** que um material cruzou o mínimo, mas não sabe **responder às perguntas
de compra**: *quanto* pedir, *quando* pedir (antes de faltar, considerando o prazo do
fornecedor), *de quem* pedir (consolidado por fornecedor, com valor), e *o que está parado*
(excesso, sem consumo, obsoleto). Os dados para isso já existem — consumo no livro de
movimentações, campos de reposição no cadastro, fornecedor no material — mas nada os cruza.

## O que a etapa entrega

1. **Motor de sugestão de reposição** no `purchaseService` (uma fonte de compra, não duas):
   consumo médio diário do livro, ponto de reposição efetivo, posição de estoque e quantidade
   sugerida — com as fórmulas de RN-01..RN-04.
2. **`GET /reposicao/sugestoes`** — sugestão consolidada **agrupada por fornecedor**, valorada
   pela fonte única de custo, com flag de risco de parada.
3. **`POST /reposicao/gerar-solicitacoes`** — transforma sugestões em
   `solicitacoes_compra_almoxarifado` (motivo `PONTO_REPOSICAO`), com dedupe e auditoria.
4. **`GET /reposicao/estoque-parado`** — excesso, sem consumo e obsoleto, com valor parado.
5. **Tela nova** `/almoxarifado/reposicao` — abas Sugestões de Compra, Estoque Parado e
   Solicitações.
6. **Ação de perfil nova** `gerenciar_reposicao` — primeiro uso real do perfil **COMPRAS**.

O motor de estoque, o `alertService` e as rotas legadas (`verificar-minimos`,
`vincular-pedido`) **não mudam**.

## Regras de negócio

### RN-01 — Consumo médio diário vem do livro, pela fonte única de tipos

`consumo_medio_diario = Σ quantidade das movimentações com tipo ∈ TIPOS_SAIDA
(movementTypes.js), cancelado = 0, criadas nos últimos J dias ÷ J`, onde **J** é a config
`reposicao_janela_consumo_dias` (semeada com `90`; configurável pela tela de Configurações).

- A régua é **"tudo que debita patrimônio"** (a lista `TIPOS_SAIDA` inteira, incluindo sucata e
  perda): o que baixou precisa ser reposto, seja qual for o motivo. Nenhuma lista nova é criada
  (ver D6).
- **Material de cliente está fora de toda a reposição** (`proprietario_cliente_id IS NULL`) —
  não se compra material dos outros; mesma regra que o `verificarEstoqueMinimo` já aplica.
- Material sem nenhuma saída na janela tem consumo 0 — e ainda pode ser sugerido pelas outras
  réguas (mínimo/ponto cadastrado).

### RN-02 — Ponto de reposição efetivo: cadastrado > calculado > mínimo

Por material, nesta ordem (`origem_ponto` no payload diz qual valeu):

| Condição | Ponto efetivo | `origem_ponto` |
|---|---|---|
| `ponto_reposicao > 0` no cadastro | o cadastrado | `CADASTRADO` |
| senão, `consumo_medio_diario > 0` **e** `prazo_reposicao_dias > 0` | `consumo_medio_diario × prazo_reposicao_dias` | `CALCULADO` |
| senão, `quantidade_minima > 0` | a mínima | `MINIMO` |
| senão | 0 — material **sem régua**, nunca é sugerido | — |

O `CALCULADO` é a spec 22 ("consumo médio + prazo de fornecedor") em fórmula: o ponto é o
consumo esperado **durante o prazo de reposição** — pedir quando o estoque só cobre o tempo de
entrega.

### RN-03 — Posição de estoque: disponível + a caminho (sem descontar reservas DUAS vezes)

`posicao = disponivel + a_caminho`, onde:

- `disponivel` é a fonte única `disponivelSql()` — que **JÁ desconta** reservado, bloqueado, em
  inspeção e em terceiros. A spec 22 pede "considerar reservas": está considerado **ali**, e
  reescrever a subtração aqui contaria a reserva duas vezes (a fórmula tem UMA casa desde a 8b).
- `a_caminho` = Σ `quantidade` das `solicitacoes_compra_almoxarifado` do material com status
  `PENDENTE` ou `VINCULADO` — o que já foi pedido não é sugerido de novo (e por isso não existe
  flag "já solicitado": a solicitação aberta **entra na conta** e o material só reaparece se
  ainda assim estiver abaixo do ponto).

Sugere-se quando `ponto_efetivo > 0` **e** `posicao < ponto_efetivo`.

### RN-04 — Quantidade sugerida: completar até o alvo, nunca menos que o lote econômico

`alvo = max(quantidade_maxima, ponto_efetivo)` (o `max` protege contra máxima cadastrada menor
que o ponto — dado ruim não pode gerar sugestão que já nasce abaixo do ponto).
`quantidade_sugerida = max(alvo − posicao, lote_economico)` quando `lote_economico > 0`, senão
`alvo − posicao`. Sugestões com quantidade ≤ 0 não saem.

`valor_estimado = quantidade_sugerida × custo unitário` pela fonte única (`custoUnitarioSql()`).

### RN-05 — Consolidação por fornecedor

As sugestões saem agrupadas pelo `fornecedor_id` do material (nome via tabela `fornecedores`
do CRM); materiais sem fornecedor entram no grupo `"Sem fornecedor definido"`. Cada grupo traz
`total_itens` e `valor_total`; o `resumo` geral traz `materiais_sugeridos`, `valor_total` e
`riscos_parada`.

### RN-06 — Risco de parada

`risco_parada = true` quando o material é **crítico** (`material_critico = 1`) e o
**disponível** (sem contar o a-caminho — solicitação não segura produção) é **≤ 0**. É flag no
payload e contagem no resumo — **notificação por e-mail/WhatsApp é feature 19/20** (corte
declarado; o `alertService` continua dono do canal do mínimo).

### RN-07 — Estoque parado: excesso, sem consumo, obsoleto

Para materiais ativos, nossos, com `quantidade_atual > 0` (LIMIT 500, ordenado por valor parado
desc):

- `excesso`: `quantidade_atual > quantidade_maxima` e `quantidade_maxima > 0`.
- `sem_consumo`: nenhuma saída (`TIPOS_SAIDA`, não cancelada) nos últimos **N** dias — ou nunca
  — onde **N** é a config `reposicao_dias_sem_consumo` (semeada com `180`).
- `obsoleto`: `sem_consumo` **e** nenhuma entrada (`TIPOS_ENTRADA`) no mesmo período — não
  entra, não sai, só ocupa prateleira.

As três são **flags independentes** no item (um material pode ser excesso E obsoleto);
`valor_parado = quantidade_atual × custo unitário`. `?tipo=EXCESSO|SEM_CONSUMO|OBSOLETO`
filtra. Identificação **sem** alerta na entrada (D5).

### RN-08 — Gate: ação nova `gerenciar_reposicao`

`gerenciar_reposicao: [ADMINISTRADOR, GESTOR, COMPRAS]` em `ACAO_PERFIS` — decidir compra é
gestão/compras, não operação de balcão (ALMOXARIFE fica fora **de propósito**; ele conta e
movimenta, não decide pedido). As três rotas novas ficam sob ela. As rotas legadas
(`verificar-minimos`, `vincular-pedido`) **mantêm** `configurar` — compatibilidade; nada que
funciona muda de gate nesta etapa. A ação entra automaticamente em `GET /minhas-permissoes`
(a rota itera `ACAO_PERFIS`).

### RN-09 — Gerar solicitações: o servidor calcula, o cliente só escolhe

`POST /reposicao/gerar-solicitacoes` aceita `material_ids` (opcional; ausente = todas as
sugestões do momento). **As quantidades vêm do cálculo do servidor, nunca do body** — o cliente
escolhe *quais* materiais, não *quanto*. Dedupe pela regra que já existe (material com
solicitação `PENDENTE` não ganha outra — vira `pulada` com motivo `JA_PENDENTE`); id que não
está entre as sugestões do momento vira `pulada` com motivo `SEM_SUGESTAO`. Cada criação é
**auditada** (`registrarAuditoria`), coisa que a geração legada por mínimo nunca fez (e
continua não fazendo — não mexer no legado; registrado em "Interações").

## Contratos de API (congelados)

### `GET /api/almoxarifado/reposicao/sugestoes` (novo, `requirePermission('gerenciar_reposicao')`)

- **200**:
```json
{
  "janela_dias": 90,
  "fornecedores": [
    {
      "fornecedor_id": 3,
      "fornecedor_nome": "Aços Fulano LTDA",
      "total_itens": 2,
      "valor_total": 1234.5,
      "itens": [
        {
          "material_id": 10, "codigo": "ALM-0010", "nome": "Chapa 3mm", "unidade": "PC",
          "disponivel": 4, "a_caminho": 0, "posicao": 4,
          "consumo_medio_diario": 0.5, "prazo_reposicao_dias": 10,
          "ponto_efetivo": 5, "origem_ponto": "CALCULADO",
          "quantidade_sugerida": 16, "valor_estimado": 800,
          "risco_parada": false
        }
      ]
    }
  ],
  "resumo": { "materiais_sugeridos": 2, "valor_total": 1234.5, "riscos_parada": 1 }
}
```
- Materiais sem fornecedor: grupo com `fornecedor_id: null`, `fornecedor_nome: "Sem fornecedor
  definido"`, **sempre por último** na lista; grupos com fornecedor em ordem alfabética.
- **403**: mensagem padrão do `requirePermission` (`acao: "gerenciar_reposicao"`).

### `POST /api/almoxarifado/reposicao/gerar-solicitacoes` (novo, mesmo gate)

- Body: `{ "material_ids": [10, 11] }` (opcional — ausente/vazio = todas as sugestões).
- **200**: `{ "criadas": [{ "material_id", "solicitacao_id", "quantidade" }], "puladas":
  [{ "material_id", "motivo": "JA_PENDENTE" | "SEM_SUGESTAO" }] }`
- **400** (`material_ids` presente mas não-array ou com não-número):
  `{ "error": "Lista de materiais inválida" }`

### `GET /api/almoxarifado/reposicao/estoque-parado` (novo, mesmo gate)

- Query: `?tipo=EXCESSO|SEM_CONSUMO|OBSOLETO` (opcional; ausente = tudo que tem alguma flag).
- **200**: `{ "dias_sem_consumo": 180, "itens": [{ "material_id", "codigo", "nome", "unidade",
  "quantidade_atual", "quantidade_maxima", "ultima_entrada", "ultima_saida", "valor_parado",
  "excesso", "sem_consumo", "obsoleto" }], "resumo": { "excesso", "sem_consumo", "obsoleto",
  "valor_parado_total" } }` — flags booleanas; datas `null` quando nunca houve.
- **400** (`tipo` fora do domínio): `{ "error": "Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)" }`

### Configs novas (semeadas no `schema.js` — lição da Etapa 10: config não semeada nunca é configurável)

| Chave | Default | Descrição |
|---|---|---|
| `reposicao_janela_consumo_dias` | `90` | Janela (dias) do consumo médio para reposição |
| `reposicao_dias_sem_consumo` | `180` | Dias sem saída para material contar como parado/obsoleto |

### Front — tela nova `/almoxarifado/reposicao` (`ReposicaoAlmoxarifado.js`)

- Rota lazy + item de menu (padrão `lazyModules.js`/`Layout.js`).
- **Aba Sugestões de Compra**: grupos por fornecedor (cabeçalho com nome, total de itens e
  valor), linhas com disponível/a caminho/posição/ponto (e origem)/sugerida/valor, badge
  vermelho "Risco de parada"; checkbox por material (todos marcados por default), botão
  **Gerar solicitações** (gateado por `bloquearSeNaoPode('gerenciar_reposicao')`) chamando o
  POST com os marcados; resposta mostra criadas/puladas.
- **Aba Estoque Parado**: filtro por tipo, tabela com flags como badges, valor parado,
  última entrada/saída (`—` quando nunca).
- **Aba Solicitações**: leitura do relatório existente `GET /almoxarifado/relatorios/solicitacoes-compra`
  (pendentes/vinculadas) — sem ação nova aqui além de visualizar.
- Todos os valores em R$ com `toLocaleString('pt-BR', { style: 'currency' })`; nulos → `—`.

## Decisões

- **D1 — O motor de sugestão vive no `purchaseService`** (expande o serviço existente de 31
  linhas), não num serviço novo. Descartado: `replenishmentService` separado — duas fontes de
  "o que comprar" divergiriam; o serviço é um só e pequeno.
- **D2 — "Pedidos de compra abertos" = solicitações do próprio almoxarifado.** A spec 22 pede
  para descontar pedidos abertos, mas a tabela `pedidos_compra` do módulo Compras é **só
  cabeçalho** (fornecedor + valor total, sem itens por material) — o dado "quantidade pedida
  por material" **não existe** no sistema. O proxy honesto é `solicitacoes_compra_almoxarifado`
  com status `PENDENTE`/`VINCULADO` (a VINCULADO aponta para um pedido real). Quando o módulo
  Compras ganhar itens por material, trocar a fonte é uma query. **Vai para a letra E** (regra
  aproximada por limitação de dado, não por escolha).
- **D3 — Reservas não são descontadas de novo** — `disponivelSql` já as desconta (fonte única
  da 8b). A spec lista "considerar reservas" como se fosse conta nova; está considerada.
- **D4 — "Projetos futuros" fora** — exigiria BOM/OP (features 22/23 de integração), que não
  existem. Corte declarado.
- **D5 — "Estoque máximo com alerta na entrada" vira identificação, não alerta.** O EXCESSO
  aparece no estoque-parado (RN-07); estender o `alertService` para máximo é uma máquina de
  estados nova (ACIMA/ABAIXO com debounce e canal) sem pedido concreto. Descartado o aviso
  não-bloqueante na resposta da movimentação: mexeria numa rota compartilhada e pesada de
  testes por um texto que ninguém pediu.
- **D6 — Consumo = `TIPOS_SAIDA` inteiro** (inclui sucata/perda). Descartada uma lista curada
  de "consumo nobre": criaria a segunda lista de tipos que a Etapa 8c acabou de unificar, e a
  régua de reposição é "o que baixou precisa ser reposto".
- **D7 — Risco de parada = crítico com disponível ≤ 0.** Descartada a versão sofisticada
  (disponível < consumo × prazo): depende de `prazo_reposicao_dias` preenchido, que a maioria
  do catálogo ainda não tem — a flag mentiria por omissão de cadastro. A versão simples é
  verdadeira sempre; a sofisticada pode vir quando o cadastro amadurecer.
- **D8 — Notificações fora** (feature 19/20) — flag e contagem no payload, canal nenhum.
- **D9 — Ação nova `gerenciar_reposicao` sem ALMOXARIFE.** Decidir compra é gestão/compras.
  Reversível (uma linha em `ACAO_PERFIS`); registrado na letra B porque é a primeira ação do
  módulo que o ALMOXARIFE não tem.
- **D10 — As rotas legadas de compra não mudam** (gate `configurar`, sem auditoria, fórmula
  antiga) — compatibilidade; a tela nova não as chama (a aba Solicitações só lê o relatório).
- **D11 — Sem tela de aprovação de compra** — B11 (dupla aprovação formal) segue sem
  arbitragem; gerar solicitação não é aprovar pedido. O vínculo com pedido real continua pela
  rota legada.

## Interações verificadas com regras existentes

- **`disponivelSql`/`custoUnitarioSql`/`TIPOS_SAIDA`**: consumidos, nunca reescritos — zero
  fórmula nova de disponível/custo/tipos.
- **`verificarEstoqueMinimo` legado**: continua existindo e NÃO deduplica contra as sugestões
  novas além da regra comum (material com PENDENTE não duplica em nenhum dos dois caminhos —
  a mesma checagem protege ambos).
- **Material de cliente**: fora de sugestões, estoque parado e geração (mesma classe A da
  auditoria da Etapa 8).
- **G5 (duas passadas)**: o POST recalcula as sugestões na hora de gerar (uma passada só que
  decide e aplica por material; dedupe por INSERT após SELECT tem corrida teórica de
  duplicidade — mesma janela que o legado sempre teve; registrada, não resolvida: solicitação
  duplicada é anulável por humano, não corrompe saldo).
- **Front espelha formatação, não fórmula** — nenhum cálculo de sugestão no client (aprendizado
  G6: o que o servidor decide, o servidor manda pronto).

## Testes exigidos (arquivos novos)

- `reposicaoSugestao.api.test.js` — RN-01 (consumo pela janela, cancelada fora, cliente fora),
  RN-02 (as três origens do ponto + material sem régua nunca sugerido), RN-03 (posição soma
  a_caminho; solicitação aberta faz o material sumir da sugestão; disponível vem líquido de
  reserva SEM descontar de novo — cenário com reserva ativa), RN-04 (alvo máx(máxima, ponto),
  lote econômico como piso), RN-05 (agrupamento e ordem), RN-06 (flag risco), RN-08 (403 sem a
  ação + 200 COMPRAS — o par positivo+negativo, lição da 10b).
- `reposicaoGerarSolicitacoes.api.test.js` — RN-09 (cria com quantidade DO SERVIDOR, dedupe
  JA_PENDENTE, SEM_SUGESTAO, body inválido 400 literal, auditoria gravada, seleção parcial).
- `reposicaoEstoqueParado.api.test.js` — RN-07 (cada flag isolada + combinação obsoleto,
  filtro por tipo, tipo inválido 400 literal, cliente fora, valor parado).
- Task de integração cruzando os galhos (jornada: consumir no livro → sugestão aparece →
  gerar → solicitação some da sugestão → estoque parado detecta excesso/obsoleto).

Todo teste com **controle positivo** (sabotagem, âncora única NOS DOIS SENTIDOS, sed reverso,
md5); testes de conjunto forçam o cenário explicitamente (lição G5/10b).
