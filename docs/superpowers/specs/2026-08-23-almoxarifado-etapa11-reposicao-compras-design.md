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
| **em qualquer caso**, se `quantidade_minima` for **maior** que o resultado acima | a mínima | `MINIMO` |
| nada disso | 0 — material **sem régua**, nunca é sugerido | — |

**Emendada pela revisão da Task 1 (Critical, medido): a MÍNIMA é o CHÃO de todas as réguas.**
A versão original era uma precedência seca (cadastrado > calculado > mínima) — **estava
errada**: giro baixo (1 un. em 90 dias) × prazo 10 dava ponto CALCULADO de 0,111 que *vencia*
a mínima de 100, e o material **desaparecia da sugestão** enquanto o alerta de mínimo e o
`verificar-minimos` legado gritavam por ele (que abria solicitação de 195). Preencher o prazo
— que a própria etapa incentiva — piorava o resultado. Com o chão: se o alerta de mínimo
dispara, a sugestão existe, sempre; `origem_ponto` diz quem venceu de fato (o chão vale
também para um `ponto_reposicao` cadastrado abaixo da mínima).

O `CALCULADO` é a spec 22 ("consumo médio + prazo de fornecedor") em fórmula: o ponto é o
consumo esperado **durante o prazo de reposição** — pedir quando o estoque só cobre o tempo de
entrega.

### RN-03 — Posição de estoque: disponível + a caminho (sem descontar reservas DUAS vezes)

`posicao = disponivel + a_caminho`, onde:

- `disponivel` é a fonte única `disponivelSql()` — que **JÁ desconta** reservado, bloqueado, em
  inspeção e em terceiros. A spec 22 pede "considerar reservas": está considerado **ali**, e
  reescrever a subtração aqui contaria a reserva duas vezes (a fórmula tem UMA casa desde a 8b).
- `a_caminho` = Σ `quantidade` das `solicitacoes_compra_almoxarifado` do material com status
  `PENDENTE` ou `VINCULADO` **criadas dentro do horizonte** (config
  `reposicao_horizonte_solicitacao_dias`, semeada com `60`) — o que já foi pedido não é
  sugerido de novo, e a solicitação aberta **entra na conta** (o material só reaparece se
  ainda assim estiver abaixo do ponto).

**Por que o horizonte existe (achado da Fase 2, Critical):** nada no sistema fecha uma
solicitação — os únicos escritores de status são a criação (`PENDENTE`) e o vínculo
(`VINCULADO`); não há status terminal, e o recebimento por NF não a toca (isso é a feature 22).
Sem o horizonte, a solicitação de janeiro seguraria a posição **para sempre** e o material
nunca mais apareceria na sugestão — sub-compra silenciosa. Com ele, uma solicitação velha
simplesmente deixa de contar. **Vai para a letra E**: a régua certa é "fechar no recebimento",
que depende do módulo Compras ganhar o elo; o horizonte é a aproximação honesta até lá.

Cada item traz também `a_caminho_vencido` — o espelho do `a_caminho`, para as solicitações
`PENDENTE`/`VINCULADO` **fora** do horizonte (achado 5 da revisão final): não seguram mais a
posição, mas continuam abertas de verdade, e a tela usa o campo para avisar "há solicitação
antiga aberta" em vez de fingir que ela nunca existiu.

**Nota da revisão final (achado 3): o MESMO horizonte vale para a máquina de estados de
requisição.** `requisitionStateMachine.calcularStatusPosAprovacao` também lê
`solicitacoes_compra_almoxarifado` para decidir `AGUARDANDO_COMPRA` vs `AGUARDANDO_ESTOQUE`
numa requisição aprovada sem saldo (ver "Interações verificadas" abaixo) — e usava `PENDENTE`
**sem corte de data**. Duas leituras da mesma tabela com réguas diferentes de "aberta" é o
tipo de inconsistência que este design existe para evitar: uma solicitação de 400 dias atrás,
que a própria tela de reposição já não considera "a caminho", continuava travando requisições
novas em `AGUARDANDO_COMPRA` — status que nunca se autocorrige. A contagem em
`calcularStatusPosAprovacao` agora aplica `AND created_at >= datetime('now', '-' || ? ||
' days')` com o mesmo `reposicao_horizonte_solicitacao_dias`.

Sugere-se quando `ponto_efetivo > 0` **e** `posicao < ponto_efetivo`.

### RN-04 — Quantidade sugerida: completar até o alvo, nunca menos que o lote econômico

`alvo = max(quantidade_maxima, ponto_efetivo)` (o `max` protege contra máxima cadastrada menor
que o ponto — dado ruim não pode gerar sugestão que já nasce abaixo do ponto).
`quantidade_sugerida = max(alvo − posicao, lote_economico)` quando `lote_economico > 0`, senão
`alvo − posicao`.

**Correção da revisão final (Etapa 11, achado 6 — a frase abaixo estava ERRADA): a Fase 2
dizia que "sugestão ≤ 0 não sai" era regra intestável e que a condição de entrada
(`posicao < ponto_efetivo`) já garantia `alvo − posicao` positiva, dispensando o guard.**
Matematicamente é verdade — mas só em aritmética exata. Em ponto flutuante não é: residual de
soma (`2.14` contra pendências `1.0 + 1.14 = 2.1399999999999997`) faz `alvo − posicao` sair
negativo por um fio, e o `toFixed(4)` de exibição pode devolver tanto `0.0000` quanto um
resíduo simbólico positivo como `0.0001` (medido: minima `2.14` contra pendência `2.1399`) —
os dois são fantasmas, não quantidade real a comprar. O guard **foi restaurado** pela revisão
da Task 2 (contra o resíduo que já arredondava pra zero) e **endurecido** na revisão final
E11 para um **piso absoluto** `quantidade_sugerida < 0.001` (não relativo — um piso em % do
ponto esconderia falta real num material de ponto grande). Sem ele, cada `POST` gravava mais
uma solicitação de quantidade ~0 que nunca somava em `a_caminho`: lixo infinito no relatório
de solicitações.

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

**Nota da revisão final (achado 2, medido):** `resumo.riscos_parada` conta **TODOS** os
materiais críticos zerados existentes no catálogo (`material_critico = 1` e `disponivel <= 0`),
**sugeridos ou não** — não é `itens.filter(risco_parada).length`. A diferença importa: gerar a
solicitação de um material crítico zerado faz a pendência entrar em `a_caminho` (RN-03), a
`posicao` passar a cobrir o `ponto_efetivo`, e o item **sumir da lista** de sugestões — mas o
material continua fisicamente parado (`disponivel` não mudou; solicitação a caminho não move
uma unidade da prateleira). Contar só sobre `itens` fazia o clique em "Gerar solicitações"
**zerar o contador de risco enquanto a fábrica seguia parada** — o resumo mentia exatamente no
momento em que o usuário mais confiava nele. O flag `risco_parada` **por item** continua igual
(só existe nos itens sugeridos, porque só eles têm objeto no payload).

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

**(Reescrita pela Fase 2 — a versão original tinha um dedupe `JA_PENDENTE` que a própria
arquitetura tornava inalcançável no caminho normal e nocivo no caso raro em que alcançava:
recusava repor material que continuava faltando.)**

`POST /reposicao/gerar-solicitacoes` aceita `material_ids`: **ausente** = todas as sugestões do
momento; **`[]` = nenhuma** (desmarcar tudo e clicar não dispara o catálogo inteiro — achado da
Fase 2). **As quantidades vêm do cálculo do servidor, nunca do body** — o cliente escolhe
*quais* materiais, não *quanto*.

**Não há dedupe no caminho novo — a matemática da posição É o dedupe:** a solicitação aberta
entra em `a_caminho` (RN-03), então (a) material cuja pendência já cobre o ponto **não é
sugerido** e um `POST` ausente simplesmente não o inclui; (b) material com pendência
**insuficiente** continua sugerido com `quantidade_sugerida` já descontando o que está a
caminho — gerar cria a solicitação do **complemento**, que é o comportamento certo (o dedupe
antigo recusaria repor o que falta). O dedupe por `PENDENTE` continua existindo **só no caminho
legado** (`verificar-minimos`), intocado — é dele que o teste da spec 18 fala.

`pulada` tem um único motivo: `SEM_SUGESTAO` — id pedido explicitamente que não está entre as
sugestões do momento (sem régua, ou posição já coberta). `POST` sem ids quando não há nada a
sugerir responde `{ criadas: [], puladas: [] }` e o front mostra "Nenhuma sugestão para gerar"
(não é sucesso mudo).

Cada criação é **auditada** (`registrarAuditoria`, `dados_novos` como **objeto** — a função
serializa; passar string duplicaria o escape), coisa que a geração legada nunca fez (e continua
não fazendo — legado intocado, D10).

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
          "disponivel": 4, "a_caminho": 0, "a_caminho_vencido": 0, "posicao": 4,
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
- `a_caminho_vencido` (adicionado na revisão final, achado 5): soma de `PENDENTE`/`VINCULADO`
  do material **fora** do horizonte — solicitações que deixaram de segurar a `posicao` mas
  continuam abertas de verdade. Ver a nota em RN-03.
- Materiais sem fornecedor: grupo com `fornecedor_id: null`, `fornecedor_nome: "Sem fornecedor
  definido"`, **sempre por último** na lista; grupos com fornecedor em ordem alfabética.
- Fornecedor **órfão** (`fornecedor_id` gravado mas sem linha correspondente em `fornecedores`
  — a coluna é `INTEGER` solto, sem FK): grupo com `fornecedor_nome: "Fornecedor #<id> (não
  cadastrado)"` em vez de cabeçalho vazio (o `LEFT JOIN` devolve nome `null`, e `String(null)`
  ordenaria como a palavra "null"); o rótulo aponta o dado a consertar em vez de escondê-lo
  (revisão da Task 1, coberto por teste em `reposicaoSugestao.api.test.js`).
- **403**: mensagem padrão do `requirePermission` (`acao: "gerenciar_reposicao"`).

### `POST /api/almoxarifado/reposicao/gerar-solicitacoes` (novo, mesmo gate)

- Body: `{ "material_ids": [10, 11] }` — **ausente** = todas as sugestões do momento;
  **`[]` = nenhuma** (corrigido pela Fase 2: "vazio = todas" era destrutivo com a tela que
  marca tudo por default).
- **200**: `{ "criadas": [{ "material_id", "solicitacao_id", "quantidade" }], "puladas":
  [{ "material_id", "motivo": "SEM_SUGESTAO" }] }` — `puladas` só existe para ids explícitos.
- **400** (`material_ids` presente mas não-array ou com não-número):
  `{ "error": "Lista de materiais inválida" }`

### `GET /api/almoxarifado/reposicao/estoque-parado` (novo, mesmo gate)

- Query: `?tipo=EXCESSO|SEM_CONSUMO|OBSOLETO` (opcional; ausente **ou vazio** = tudo que tem
  alguma flag — string vazia é "Todos" do select da tela, não erro; achado da Fase 2).
- **200**: `{ "dias_sem_consumo": 180, "itens": [{ "material_id", "codigo", "nome", "unidade",
  "quantidade_atual", "quantidade_maxima", "ultima_entrada", "ultima_saida", "valor_parado",
  "excesso", "sem_consumo", "obsoleto" }], "resumo": { "excesso", "sem_consumo", "obsoleto",
  "valor_parado_total" } }` — flags booleanas; datas `null` quando nunca houve. **O `resumo` é
  calculado sobre a lista COMPLETA (antes do filtro por tipo e do teto de 500)** — é o retrato
  do estoque parado inteiro; `itens` é a janela filtrada/truncada (semântica congelada pela
  Fase 2, que apontou a ambiguidade).
- **400** (`tipo` não-vazio fora do domínio): `{ "error": "Tipo inválido (use EXCESSO, SEM_CONSUMO ou OBSOLETO)" }`

### Configs novas (semeadas no `schema.js` — lição da Etapa 10: config não semeada nunca é configurável)

| Chave | Default | Descrição |
|---|---|---|
| `reposicao_janela_consumo_dias` | `90` | Janela (dias) do consumo médio para reposição |
| `reposicao_dias_sem_consumo` | `180` | Dias sem saída para material contar como parado/obsoleto |
| `reposicao_horizonte_solicitacao_dias` | `60` | Dias em que uma solicitação aberta ainda conta como "a caminho" |

**E as três entram no array `CAMPOS` da tela de Configurações** (achado da Fase 2: semear no
banco não basta — a tela renderiza uma lista fixa de campos, e chave fora dela é ineditável
pela UI; a mesma lição da Etapa 10 um nível acima).

**Validação no `PUT /api/almoxarifado/configuracoes` (revisão final, achado 4, medido):**
qualquer chave que comece com `reposicao_` precisa valer um inteiro `>= 1`, senão 400 literal
`Configuração "<chave>" deve ser um número de dias maior que zero`. Sem essa validação,
`'0'`/`''`/`'-7'` eram aceitos com `200`/"sucesso", gravados como string, e o motor
(`purchaseService.lerConfigNumero`) caía silenciosamente no default para qualquer valor não
finito/`<= 0` — o administrador achava que tinha mudado a janela e nada mudava. A regra vale
só para as chaves `reposicao_*`; as demais configs do módulo têm semânticas próprias (booleana
`'0'`/`'1'`, texto livre) que essa validação não serve.

### Front — tela nova `/almoxarifado/reposicao` (`ReposicaoAlmoxarifado.js`)

- Rota lazy + item de menu (padrão `lazyModules.js`/`Layout.js`).
- **Aba Sugestões de Compra**: grupos por fornecedor (cabeçalho com nome, total de itens e
  valor), linhas com disponível/a caminho/posição/ponto (e origem)/sugerida/valor, badge
  vermelho "Risco de parada"; checkbox por material (todos marcados por default), botão
  **Gerar solicitações** (gateado por `bloquearSeNaoPode('gerenciar_reposicao')`) chamando o
  POST com os marcados; resposta mostra criadas/puladas.
- **Aba Estoque Parado**: filtro por tipo, tabela com flags como badges, valor parado,
  última entrada/saída (`—` quando nunca).
- **Aba Solicitações**: leitura do relatório `GET /almoxarifado/relatorios/solicitacoes-compra`.
  **Correção da Fase 2:** o relatório real era `WHERE status = 'PENDENTE'` — a VINCULADA (que
  é justamente a que esconde o material da sugestão) ficava invisível na tela inteira; o
  relatório passa a trazer `PENDENTE` e `VINCULADO` (mudança no tronco, Task 2). Sem ação nova
  além de visualizar. **Correção da revisão final (achado 1, medido pelos dois revisores):**
  esse alargamento (PENDENTE+VINCULADO = o pipeline de compra inteiro) foi feito numa rota de
  relatório **sem gate nenhum** — qualquer usuário do módulo, chão de fábrica incluído, passou
  a enxergar solicitações de compra em aberto. O dispatcher de relatórios ganhou o mesmo gate
  das rotas novas: `!can(req.user, 'gerenciar_reposicao')` → 403 (mesmo remédio já usado para
  `inventario-divergencias` na revisão final da 10b).
- Todos os valores em R$ com `toLocaleString('pt-BR', { style: 'currency' })`; nulos → `—`.

## Decisões

- **D1 — O motor de sugestão vive no `purchaseService`** (expande o serviço existente de 31
  linhas), não num serviço novo. Descartado: `replenishmentService` separado — duas fontes de
  "o que comprar" divergiriam; o serviço é um só e pequeno.
- **D2 — "Pedidos de compra abertos" = solicitações do próprio almoxarifado (com horizonte).**
  A spec 22 pede para descontar pedidos abertos. **Correção da Fase 2 — a versão original
  deste D dizia que "quantidade pedida por material não existe no sistema"; estava errado:**
  existe `solicitacoes_compra_itens` (do core do CRM) com `material_id`/`quantidade`, **mas
  hoje ela só é gravada com `material_tipo = 'escritorio'`** (o fluxo de solicitações do
  escritório) — para material de almoxarifado o dado continua não sendo gravado por ninguém, e
  `pedidos_compra` é só cabeçalho. O proxy honesto segue sendo
  `solicitacoes_compra_almoxarifado` `PENDENTE`/`VINCULADO`, agora **dentro do horizonte**
  (RN-03) porque nada as fecha. Quando o Compras ganhar o elo por material, trocar a fonte é
  uma query. **Vai para a letra E.**
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
- **`verificarEstoqueMinimo` legado**: continua existindo, intocado.
  **Correção da revisão final (achado 8a — a frase anterior aqui estava ERRADA nos DOIS
  sentidos):** a versão original afirmava que "material com PENDENTE não duplica em nenhum dos
  dois caminhos — a mesma checagem protege ambos". Não protege. As réguas são diferentes e
  cada uma tem um buraco medido (390 pedidos onde 195 bastavam num cenário controlado):
  - **novo → vinculado → legado duplica:** o caminho novo (`gerarSolicitacoesDaSugestao`) não
    tem dedupe — a matemática da posição faz esse papel (RN-09). Quando essa solicitação é
    **vinculada** a um pedido real (`VINCULADO`), o dedupe do legado (`verificarEstoqueMinimo`)
    só enxerga `PENDENTE` — ele não vê a `VINCULADA` e abre uma solicitação **nova** para o
    mesmo material, que o motor de sugestão volta a contar em `a_caminho` normalmente (RN-03
    soma `PENDENTE` **e** `VINCULADO`), mas o legado nunca soube que já havia uma pendência.
  - **legado → envelhece → novo duplica:** uma solicitação aberta pelo legado (`PENDENTE`,
    dedupe por `PENDENTE`) segura a posição enquanto está dentro do horizonte (RN-03). Depois
    do horizonte, ela some de `a_caminho` — o material reaparece na sugestão nova, que gera
    outra solicitação para o mesmo material sem saber que a antiga (ainda `PENDENTE` no banco,
    só velha) continua em aberto.
  - **Mitigação real:** `a_caminho_vencido` (achado 5, RN-03) expõe a solicitação velha na
    tela em vez de escondê-la — reduz a chance de duplicar por desconhecimento, mas não
    elimina a corrida (ver G5, abaixo). A régua definitiva é status terminal no recebimento
    (letra E) — enquanto ele não existe, os dois caminhos podem sempre divergir sobre "o que já
    está pedido".
- **Material de cliente**: fora de sugestões, estoque parado e geração (mesma classe A da
  auditoria da Etapa 8).
- **G5 (duas passadas)**: o POST recalcula as sugestões na hora de gerar (uma passada só que
  decide e aplica por material; dedupe por INSERT após SELECT tem corrida teórica de
  duplicidade — mesma janela que o legado sempre teve; registrada, não resolvida: solicitação
  duplicada é anulável por humano, não corrompe saldo).
- **Front espelha formatação, não fórmula** — nenhum cálculo de sugestão no client (aprendizado
  G6: o que o servidor decide, o servidor manda pronto).
- **`requisitionStateMachine.calcularStatusPosAprovacao` conta solicitações `PENDENTE`** para
  decidir `AGUARDANDO_COMPRA` vs `AGUARDANDO_ESTOQUE` numa requisição aprovada sem saldo — o
  POST novo passa a influenciar esse status (uma requisição aprovada depois de gerar a
  sugestão verá "aguardando compra"). É o comportamento **desejável** (a compra está mesmo em
  andamento) e fica declarado aqui em vez de descoberto por surpresa. **Correção da revisão
  final (achado 3):** essa contagem não tinha corte de data — uma solicitação `PENDENTE` de
  400 dias atrás, que a própria RN-03 já não considera "a caminho", continuava empurrando
  requisições novas para `AGUARDANDO_COMPRA` (status sem escritor de saída, não se
  autocorrige). Passou a aplicar o mesmo `reposicao_horizonte_solicitacao_dias` — ver a nota
  em RN-03.
- **Já existe um terceiro caminho de compra com canal:** `requisitionPurchaseNotifyService`
  e-maila o setor de Compras quando itens de requisição não têm estoque (config
  `compras_notificar_emails`). Não conflita em código com esta etapa (fluxos distintos), mas a
  frase "uma fonte de compra" do D1 vale para o SERVIÇO de sugestão, não para o módulo inteiro
  — corrigido aqui para a narrativa não mentir.
- **Índice novo** `idx_mov_almox_material_tipo` em `movimentacoes_almoxarifado (material_id,
  cancelado, tipo)` — as queries novas fazem subselects correlacionados por material sobre o
  livro; sem índice é N × full scan (Fase 2). Primeira consulta do módulo com esse shape.

## Testes exigidos (arquivos novos)

- `reposicaoSugestao.api.test.js` — RN-01 (consumo pela janela, cancelada fora, cliente fora),
  RN-02 (as três origens do ponto + material sem régua nunca sugerido), RN-03 (posição soma
  a_caminho; solicitação aberta faz o material sumir da sugestão; disponível vem líquido de
  reserva SEM descontar de novo — cenário com reserva ativa; `a_caminho_vencido` soma o que
  está fora do horizonte, achado 5 da revisão final), RN-04 (alvo máx(máxima, ponto), lote
  econômico como piso), RN-05 (agrupamento e ordem), RN-06 (flag risco), RN-08 (403 sem a
  ação + 200 COMPRAS — o par positivo+negativo, lição da 10b).
- `requisicaoEstados.api.test.js` — cobre também `calcularStatusPosAprovacao` com o horizonte
  (achado 3 da revisão final): solicitação `PENDENTE` recente → `AGUARDANDO_COMPRA`, a mesma
  mas backdated 400 dias → `AGUARDANDO_ESTOQUE`.
- `configuracoesGerais.api.test.js` — cobre a validação das chaves `reposicao_*` no `PUT
  /configuracoes` (achado 4 da revisão final): `'0'`/`''`/`'-7'` → 400 literal; `'30'` → 200 e
  round-trip conferido em `GET /reposicao/sugestoes` (`janela_dias` reflete o valor salvo).
- `reposicaoGerarSolicitacoes.api.test.js` — RN-09 (cria com quantidade DO SERVIDOR,
  **`pulada: SEM_SUGESTAO`** — não há dedupe `JA_PENDENTE` no caminho novo, a lista da Fase 2
  acima estava desatualizada com a própria reescrita de RN-09 dela mesma — body inválido 400
  literal, auditoria gravada, seleção parcial); mais os achados da revisão final: gate do
  relatório `solicitacoes-compra` (achado 1), `riscos_parada` sobre todos os críticos zerados
  mesmo após gerar (achado 2), piso absoluto do resíduo simbólico (achado 6).
- `reposicaoEstoqueParado.api.test.js` — RN-07 (cada flag isolada + combinação obsoleto,
  filtro por tipo, tipo inválido 400 literal, cliente fora, valor parado).
- Task de integração cruzando os galhos (jornada: consumir no livro → sugestão aparece →
  gerar → solicitação some da sugestão → estoque parado detecta excesso/obsoleto).

Todo teste com **controle positivo** (sabotagem, âncora única NOS DOIS SENTIDOS, sed reverso,
md5); testes de conjunto forçam o cenário explicitamente (lição G5/10b).
