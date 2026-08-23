# Etapa 10b — Inventário avançado, parte 2 (design)

> **Data:** 2026-08-23 · **Feature:** 17 (inventário e contagem cíclica), segunda rodada ·
> **Baseline:** Etapa 10 fechada (`d644827..8db2671`) — tipo `AJUSTE_INVENTARIO` no motor,
> guarda de retenção, contagem cega, tolerância+recontagem, aplicação tudo-ou-nada.
> **Autorização:** etapa conduzida sob a autorização permanente do usuário (regras de overnight
> da skill `desenvolver-etapa-almoxarifado`); toda decisão tomada no lugar dele está na seção
> "Decisões" e vai para a letra B do fechamento.

## O problema

A Etapa 10 fechou o risco crítico (ajuste por fora do motor) e declarou uma lista de cortes
"para uma Etapa 10b". Esta etapa entrega o subconjunto desses cortes que tem valor real hoje e
não depende de decisão de negócio pendente:

1. **Escopos de contagem** — hoje a conferência só filtra por `categoria`; a spec 21 pede
   contagens por família, classe ABC, item crítico, materiais de cliente e materiais em
   terceiros. Todas essas informações **já existem como coluna** do material.
2. **Dupla contagem por duas pessoas** — a recontagem da Etapa 10 aceita a mesma pessoa
   contando de novo, o que não elimina o erro sistemático de leitura (a pessoa que leu errado
   uma vez tende a ler errado de novo).
3. **Relatório de acuracidade** — os dados (divergência por item, por conferência) existem e
   são imutáveis após a conclusão, mas não há leitura consolidada; e o impacto financeiro
   calculado na conclusão é mostrado uma vez e jogado fora.

## O que fica fora — de novo, e por quê (ver "Decisões")

Congelamento de movimentação (ruling anterior mantido), fluxo formal de dupla aprovação (B11
sem arbitragem), contagem por endereço, contagem cíclica automática, contagem surpresa como
artefato de software, **contagem "por divergência"** (ver D12 — a recontagem obrigatória da
Etapa 10 já é a recontagem seletiva dos itens divergentes; um escopo de criação "só os que
divergiram da última vez" seria uma segunda resposta para a mesma pergunta), filtro por
cliente específico, e-mail do resultado.

---

## Regras de negócio

### RN-01 — Escopo combinável na criação da conferência

`POST /conferencias` passa a aceitar, além de `categoria` (existente), os filtros
**combináveis por E**: `familia_id` (inteiro), `classe_abc` (`'A'|'B'|'C'`), `apenas_criticos`
(booleano — `material_critico = 1`), `apenas_de_clientes` (booleano —
`proprietario_cliente_id IS NOT NULL`), `apenas_em_terceiros` (booleano — ver RN-02).

- `classe_abc` fora de A/B/C → **400** com a mensagem literal
  `"Classe ABC inválida (use A, B ou C)"`. A comparação é case-insensitive na entrada
  (`'a'` vale) e grava/filtra em maiúscula.
- Filtro que não casa com nenhum material ativo → conferência criada **vazia**
  (`totalItens: 0`), mesmo comportamento que `categoria` inexistente já tem hoje. Não é erro.
- A conferência grava uma descrição legível do escopo (`escopo_descricao`), montada no
  servidor com as partes na ordem fixa e juntadas por `" + "`:
  `Categoria: <categoria>` · `Família: <nome da família>` (id sem cadastro:
  `Família #<id>`) · `Classe <A|B|C>` · `Somente críticos` · `Materiais de clientes` ·
  `Com saldo em terceiros`. Sem nenhum filtro → `"Geral"`.
- Resposta 201 passa a ecoar `escopo_descricao` e `dupla_contagem` (RN-03), além do que já
  ecoa (`modo_cego`, `tolerancia_percentual`, `totalItens`).

### RN-02 — Escopo "em terceiros"

`apenas_em_terceiros: true` limita a conferência aos materiais com
`COALESCE(quantidade_em_terceiros, 0) > 0`. O **esperado de cada item continua descontando**
`quantidade_em_terceiros` (regra da Etapa 8b, inalterada): o escopo serve para conferir **o
que está no prédio** dos materiais que têm parte fora — não para contar o que está no
galvanizador.

### RN-03 — Dupla contagem por duas pessoas

Conferência criada com `dupla_contagem: true` (default `false`) exige que **toda contagem
depois da primeira** de um item seja feita por usuário **diferente de quem fez a primeira**
(`contado_por_id`). O autor da primeira contagem tentando recontar → **400** com a mensagem
literal:

`"Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: <nome>)"`

- A regra compara com o autor da **primeira** contagem, não da anterior — senão o primeiro
  contador poderia sobrescrever a recontagem do colega e anular os quatro olhos.
- Sem a flag, o comportamento da Etapa 10 fica **intacto** (mesma pessoa pode recontar).
- A flag é por conferência, como `modo_cego`; conferências antigas (coluna nula) valem 0.

### RN-04 — Autoria de contagem sempre gravada

Independente de `dupla_contagem`, `PUT /item` grava a autoria: a primeira contagem preenche
`contado_por_id`/`contado_por_nome`; cada contagem subsequente preenche (sobrescrevendo)
`recontado_por_id`/`recontado_por_nome`. `GET /conferencias/:id` retorna os quatro campos por
item. Nome segue o padrão do módulo: `req.user.nome || req.user.email`.

### RN-05 — Impacto financeiro persistido na conclusão

`PUT /concluir` calcula o impacto financeiro **sempre** (com ou sem `aplicar_ajustes`) sobre
os itens contados com divergência: `Σ |divergência| × custo unitário` (fórmula D8 da Etapa 10,
custo via `custoUnitarioSql()` — fonte única), e grava o resultado na coluna nova
`impacto_financeiro` da conferência, junto do `data_fim` que já existe. A resposta continua
com o campo `impactoFinanceiro`.

**Mudança declarada em relação à Etapa 10:** concluir **sem** aplicar ajustes respondia
`impactoFinanceiro: 0`; passa a responder o valor das divergências encontradas. O número "o
inventário achou R$ X de erro" é o que interessa, aplique-se ou não — e é o que o relatório
(RN-06) consome. Conferências concluídas antes desta etapa ficam com a coluna **nula** (sem
backfill — recalcular hoje com o custo de hoje daria um número diferente do apresentado na
época; ver D9).

### RN-06 — Relatório de acuracidade

`GET /conferencias/relatorio-acuracidade` (novo) lista **só** conferências `CONCLUIDO`, mais
recente primeiro, com métricas **derivadas dos itens** (imutáveis pós-conclusão — nada de
persistir acuracidade):

- por conferência: `id`, `numero`, `data_fim`, `escopo_descricao`, `modo_cego`,
  `dupla_contagem`, `total_itens`, `contados` (com `quantidade_contada` não nula), `exatos`
  (contados com `divergencia = 0`), `divergentes` (contados − exatos), `acuracidade`
  (`exatos / contados × 100`, 2 casas; **`null` quando `contados = 0`** — sem contagem não há
  acuracidade, e 0% mentiria), `impacto_financeiro` (nulo nas anteriores à etapa).
- `agregado`: `conferencias`, `total_itens`, `contados`, `exatos` e `acuracidade` **ponderada**
  (`Σ exatos / Σ contados × 100`, 2 casas; `null` se `Σ contados = 0`) — média ponderada por
  item contado, não média simples das porcentagens (uma conferência de 2 itens não pode pesar
  o mesmo que uma de 200).

### RN-07 — Gate do relatório

O relatório fica sob `requirePermission('inventario')` (ADMINISTRADOR, ALMOXARIFE, GESTOR),
como todo o fluxo de conferência. Usuário sem perfil → 403 do `requirePermission` real.

---

## Contratos de API (congelados)

### `POST /api/almoxarifado/conferencias` (alterado)

Body (tudo opcional): `observacoes`, `categoria`, `modo_cego`, `tolerancia_percentual`
(existentes) + `familia_id`, `classe_abc`, `apenas_criticos`, `apenas_de_clientes`,
`apenas_em_terceiros`, `dupla_contagem`.

- **201**: `{ id, numero, status: 'ABERTO', modo_cego, tolerancia_percentual, dupla_contagem,
  escopo_descricao, totalItens }` (+ `itens: []` no ramo vazio, como hoje).
- **400**: `{ error: "Classe ABC inválida (use A, B ou C)" }`.

### `PUT /api/almoxarifado/conferencias/:id/item/:itemId` (alterado)

Comportamento novo: grava autoria (RN-04); com `dupla_contagem` na conferência, recusa o
primeiro contador recontando (RN-03).

- **400** (dupla contagem): `{ error: "Dupla contagem: a recontagem deve ser feita por outra
  pessoa (primeira contagem: <nome>)" }`.
- Resposta de sucesso inalterada: `{ success, divergencia, recontagem }`.
- Erros existentes (RN-03 da Etapa 10, 404) inalterados.

### `GET /api/almoxarifado/conferencias/:id` (alterado)

Cada item passa a incluir `contado_por_id`, `contado_por_nome`, `recontado_por_id`,
`recontado_por_nome`. A blindagem do modo cego (RN-02 da Etapa 10) não muda — autoria não é
número de saldo.

### `PUT /api/almoxarifado/conferencias/:id/concluir` (alterado)

Grava `impacto_financeiro` na conferência e responde `impactoFinanceiro` sempre calculado
(RN-05). Todos os gates e mensagens da Etapa 10 inalterados.

### `GET /api/almoxarifado/conferencias/relatorio-acuracidade` (novo)

- **200**: `{ conferencias: [{ id, numero, data_fim, escopo_descricao, modo_cego,
  dupla_contagem, total_itens, contados, exatos, divergentes, acuracidade, impacto_financeiro }],
  agregado: { conferencias, total_itens, contados, exatos, acuracidade } }`
- **403**: perfil sem `inventario` (mensagem do `requirePermission` real).
- **Atenção de rota:** registrar **antes** de `GET /conferencias/:id`, senão o Express casa
  `relatorio-acuracidade` como `:id`.

---

## Banco (tudo por `safeAlter`, zero migração destrutiva)

- `conferencias_almoxarifado`: `escopo_descricao TEXT`, `dupla_contagem INTEGER DEFAULT 0`,
  `impacto_financeiro REAL` (nulo = concluída antes da etapa, ou ainda aberta).
- `itens_conferencia_almoxarifado`: `contado_por_id INTEGER`, `contado_por_nome TEXT`,
  `recontado_por_id INTEGER`, `recontado_por_nome TEXT`.

Dado real: conferências e itens existentes ficam com as colunas novas nulas — comportamento
idêntico ao de hoje (sem dupla contagem, escopo mostrado vazio/"—", impacto "—" no relatório).

## Front (`ConferenciaEstoque.js`)

- Criação: selects/checkboxes de escopo (família — lista via `GET /almoxarifado/familias` já
  usada pelo form de material; classe ABC; críticos; de clientes; em terceiros) + checkbox
  "Dupla contagem (recontagem por outra pessoa)".
- Lista de conferências: coluna/badge com `escopo_descricao`.
- Detalhe: "contado por" / "recontado por" nos itens; erro 400 da dupla contagem exibido como
  veio do servidor.
- Visão nova "Acuracidade": tabela do relatório + linha de agregado; acuracidade/impacto nulos
  renderizam "—".

(Se `GET /almoxarifado/familias` não existir com esse caminho exato, o executor usa o endpoint
que o `MaterialAlmoxarifadoForm.js` já usa — a fonte é o form de material, não uma rota nova.)

## Decisões

- **D1 — Escopo = filtros combináveis sobre colunas existentes.** Descartado: tabela de
  "tipos de contagem" ou enum de tipo. As colunas (`familia_id`, `classe_abc`,
  `material_critico`, `proprietario_cliente_id`, `quantidade_em_terceiros`) já existem; um
  enum viraria segunda fonte da mesma informação.
- **D2 — Contagem por endereço fica fora.** A conferência é por **material** (a decisão da
  8b sobre o esperado depende disso), e ajuste com localização é exatamente o caminho que a
  guarda de retenção da Etapa 10 declarou fora (D1 da 10). Abrir endereço aqui reabriria os
  dois. Escopo declarado para quando contagem por endereço for pedida de verdade.
- **D3 — Cíclica automática (plano por ABC/criticidade com geração agendada) fica fora.**
  Não há infra de job/agendamento no módulo; o filtro por classe ABC entrega a prática
  manual (contar classe A todo mês é criar a conferência "Classe A" todo mês). Automatizar é
  etapa própria, junto com notificações (features 19/20).
- **D4 — Contagem surpresa não é artefato de software.** "Surpresa" é não avisar o galpão —
  qualquer conferência criada ad hoc já é isso. Nada a construir; declarado para a spec 17
  não parecer esquecimento.
- **D5 — Dupla contagem por flag por conferência** (como `modo_cego`), default desligada;
  autoria gravada **sempre**, flag só liga a recusa. Descartado: config global (perderia o
  caso "inventário anual com dupla contagem, cíclica sem") e comparação com o contador
  **anterior** em vez do primeiro (anularia os quatro olhos — ver RN-03).
- **D6 — Filtro por cliente específico fica fora.** `apenas_de_clientes` cobre o tipo da
  spec 21; auditoria por cliente específico já tem a tela de posição por cliente (Etapa 8).
  Menos um select assíncrono no form.
- **D7 — Congelamento de movimentação: ruling anterior mantido** (site único, baixo valor,
  alto custo — mesma razão da Transferência sem "em trânsito").
- **D8 — Dupla aprovação formal fica fora: B11 segue sem arbitragem.** Construir o fluxo de
  duas assinaturas antes da resposta do usuário seria construir sobre decisão pendente.
- **D9 — Impacto financeiro persistido só daqui pra frente, sem backfill.** Recalcular
  conferências antigas com o custo de hoje inventaria um número que nunca foi mostrado a
  ninguém. Nulo = "não medido na época", e o relatório mostra "—".
- **D10 — Acuracidade derivada, nunca persistida.** Os itens são imutáveis pós-conclusão
  (RN-03/D9 da Etapa 10); persistir a porcentagem criaria uma segunda fonte que pode
  divergir da conta. Impacto financeiro é a exceção (D9) porque **depende do custo do
  momento**, que muda.
- **D11 — E-mail do resultado: fora (feature 19)**, mesmo corte de todas as etapas.
- **D12 — Contagem "por divergência" (spec 21) não vira escopo de criação.** (Acrescentado
  pela revisão adversarial do plano — o design original nem a listava, o que na Task 6
  deixaria o item do checklist da spec 17 desmarcado e mudo.) A recontagem obrigatória acima
  da tolerância (RN-04/05 da Etapa 10) já É a recontagem seletiva dos itens divergentes,
  dentro da mesma conferência; um escopo "só materiais divergentes da última conferência"
  responderia a mesma pergunta por um segundo caminho. Se a operação pedir esse escopo de
  verdade, é filtro barato sobre o histórico — decisão adiada, não perdida.

## Interações verificadas com regras existentes

- **RN-04 da Etapa 10 (recontagem automática na segunda contagem)**: inalterada; a dupla
  contagem só restringe **quem** pode fazer a segunda.
- **Modo cego**: autoria não é blindada (não é número de saldo). O contador da recontagem em
  modo cego continua sem ver `quantidade_sistema` se não puder ajustar.
- **Esperado × em terceiros (8b)**: inalterado (RN-02 explicita).
- **G5 (validar em duas passadas)**: esta etapa **não cria** nenhum caminho novo de duas
  passadas — escopo é WHERE na criação, dupla contagem é checagem única no PUT, relatório é
  leitura. O tudo-ou-nada do concluir não é tocado (só ganha o UPDATE do impacto, depois da
  aplicação, no mesmo ponto do UPDATE de status que já existe).

## Testes exigidos (arquivos novos)

- `conferenciaEscopo.api.test.js` — RN-01 (cada filtro isolado + combinação + classe inválida
  400 literal + `escopo_descricao` montada + filtro sem match cria vazia), RN-02 (em
  terceiros: só materiais com retenção > 0 entram; esperado desconta).
- `conferenciaDuplaContagem.api.test.js` — RN-03 (mesmo usuário recontando → 400 literal;
  outro usuário → ok; **controle**: sem a flag, mesmo usuário reconta como na Etapa 10;
  primeiro contador barrado também na terceira contagem), RN-04 (autoria gravada e ecoada no
  GET, com e sem flag).
- `conferenciaAcuracidade.api.test.js` — RN-05 (impacto persistido; concluir sem aplicar
  também calcula), RN-06 (conta de acuracidade com números conhecidos; `contados = 0` →
  `null`; conferência antiga sem impacto → `null`; só CONCLUIDO entra; agregado ponderado),
  RN-07 (403 sem perfil).
- Task de integração cruzando os galhos (jornada: escopo + dupla contagem + modo cego +
  concluir + relatório).

Todo teste novo com **controle positivo** (sabotagem provada) — e, lição da G5: teste de
regra que depende de ordem/conjunto força a ordem explicitamente, não confia no acidente.
