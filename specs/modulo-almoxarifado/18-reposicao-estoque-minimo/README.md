# 18 — Reposição e Estoque Mínimo

> **Status:** 🟢 no que é do almoxarifado — Etapa 11 entregue (2026-08-24, `54e1278..1ea6ab2`):
> motor de sugestão, consolidação por fornecedor, geração de solicitações, estoque parado e a
> tela `/almoxarifado/reposicao`. O que resta é **integração com o módulo Compras** (fechar/
> cancelar solicitação no recebimento, itens por material), declarada fora com porquê abaixo ·
> **Spec original:** seção 22 · **Design da etapa:**
> [`docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md`](../../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md)
> **Última atualização:** 2026-08-24 (Etapa 11 fechada) · Antes: 2026-08-02

## Objetivo

Monitoramento de mínimo/máximo, ponto de reposição calculado (consumo médio + prazo), sugestão
de compra considerando pedidos abertos e reservas, e identificação de excessos/obsoletos.

## O que existe hoje

- **Motor de sugestão** (`services/almoxarifado/purchaseService.js`, `calcularSugestoes`):
  consumo médio diário pela fonte única `TIPOS_SAIDA` (janela configurável), ponto efetivo
  (cadastrado > calculado consumo×prazo, **com a mínima como chão de todas as réguas**),
  posição = `disponivelSql` + a_caminho (solicitações `PENDENTE`/`VINCULADO` dentro do
  horizonte configurável; `a_caminho_vencido` exposto para as fora dele), alvo
  `max(máxima, ponto)` com lote econômico como piso e piso absoluto `0.001` anti-fantasma.
- **Rotas novas** (`routes/almoxarifado/extended.js`, gate `gerenciar_reposicao` =
  ADMINISTRADOR/GESTOR/COMPRAS): `GET /reposicao/sugestoes` (consolidado por fornecedor,
  valorado por `custoUnitarioSql`), `POST /reposicao/gerar-solicitacoes` (quantidades sempre
  do servidor, sem dedupe — a matemática da posição é o dedupe; auditado),
  `GET /reposicao/estoque-parado` (excesso/sem_consumo/obsoleto, flags independentes, resumo
  do estoque inteiro, LIMIT 500).
- **Relatório** `solicitacoes-compra` traz `PENDENTE`+`VINCULADO` e é **gateado** por
  `gerenciar_reposicao` (era aberto ao módulo — mesmo remédio do precedente da Etapa 10b).
- **Horizonte compartilhado**: `requisitionStateMachine.calcularStatusPosAprovacao` usa o
  mesmo `reposicao_horizonte_solicitacao_dias` — solicitação velha não trava requisição em
  `AGUARDANDO_COMPRA`.
- **Configs semeadas e editáveis pela tela** (validação ≥ 1 nos dois lados, 400 literal
  `Configuração "<chave>" deve ser um número de dias maior que zero`):
  `reposicao_janela_consumo_dias` (90), `reposicao_dias_sem_consumo` (180),
  `reposicao_horizonte_solicitacao_dias` (60).
- **Índice** `idx_mov_almox_material_tipo` no livro (subselects correlacionados por material).
- **Tela** `/almoxarifado/reposicao` (3 abas: Sugestões por fornecedor com selecionar-todos e
  confirm antes de gerar; Estoque Parado com legendas e filtro; Solicitações) + painel de
  erro/permissão por aba com retry.
- **Legado intocado**: `verificarEstoqueMinimo` (gate `configurar`, dedupe por PENDENTE) e
  `vincular-pedido` continuam como eram; `alertService` segue dono do alerta de mínimo.

## Checklist

### Backend
- [x] **Ponto de reposição + lote econômico + prazo no cadastro** — as colunas já existiam
      (feature 01, Etapa 2); a Etapa 11 as tornou **consumidas** (`7f04e42`).
- [x] **Consumo médio calculado do histórico (janela configurável)** — `7f04e42` (RN-01) +
      fonte única de tipos presa por teste no fix `cd83b1e`.
- [x] **Cálculo de sugestão (disponível + pedidos abertos − reservas < ponto)** — `7f04e42` +
      emenda do chão da mínima `cd83b1e`. **Correção declarada:** a spec pedia "− reservas"
      como se fosse conta a fazer — **a reserva já está descontada** no `disponivelSql`
      (fonte única da 8b); repetir a subtração contaria em dobro. "Pedidos abertos" =
      solicitações do próprio almoxarifado dentro do horizonte (ver "fora do escopo").
- [x] **Sugestão consolidada por fornecedor** — `7f04e42` (órfão com rótulo próprio,
      `cd83b1e`).
- [x] **Gerar solicitação a partir da sugestão** — `21dde5e` + fixes `eec45b8` (fantasma de
      quantidade zero, ids repetidos) e `95fb25b`.
- [x] **Materiais críticos: risco de parada** — flag + contagem no resumo (`7f04e42`; conta
      na passada completa desde `95fb25b` — pedir não tira o risco). **Alerta ativo com
      canal** fica com as features 19/20 (corte declarado).
- [x] **Identificar sem consumo / excesso / obsoleto** — `21dde5e` (RN-07) + fixes `eec45b8`.
- [x] **Estoque máximo** — o excesso é **identificado** no estoque-parado; **alerta na
      entrada não foi construído** (D5 do design: máquina de estados nova sem pedido
      concreto — corte declarado, não esquecimento).

### Frontend
- [x] **Tela "Sugestões de compra"** — `a65e501` + fixes `8a7208c` e `1ea6ab2` (painel de
      erro por aba, legendas, aviso de solicitação antiga, quantidades reais no resultado).
- [ ] **Indicadores de excesso/obsoleto na listagem de materiais** — **fora do escopo,
      declarado**: a aba Estoque Parado é a visão dedicada (com valor parado e filtros);
      espalhar selo na listagem geral de materiais é decisão de UX que ninguém pediu ainda.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Arquivo |
|-------|-------|---------|
| Cruzou o mínimo → alerta não duplica (debounce) | já existia (alertService) | testes de alertas |
| Sugestão desconta pedidos abertos e reservas (sem contar reserva 2×) | `RN-03: solicitacao aberta entra na posicao...` e `RN-03: reserva NAO e descontada duas vezes` | `reposicaoSugestao.api.test.js` |
| A mínima é o chão de todas as réguas do ponto | `RN-02 (emenda da revisao): a MINIMA e o chao...` | `reposicaoSugestao.api.test.js` |
| Solicitação automática não duplica (legado) / complemento (novo) | legado: dedupe PENDENTE; novo: `pendencia INSUFICIENTE gera o COMPLEMENTO` | `comprasMinimos` / `reposicaoGerarSolicitacoes.api.test.js` |
| Vincular pedido fecha a solicitação (status VINCULADO) | passo 8 da jornada | `reposicaoJornada.api.test.js` |
| Quantidades sempre do servidor; ids repetidos não multiplicam | `[CONTROLE] a quantidade do body e IGNORADA` / `ids repetidos...` | `reposicaoGerarSolicitacoes.api.test.js` |
| Estoque parado: flags independentes, resumo do estoque inteiro | `resumo e da lista COMPLETA...` | `reposicaoEstoqueParado.api.test.js` |
| Gate `gerenciar_reposicao` (par positivo+negativo, ALMOXARIFE fora) | `RN-08: gate...` nos 3 arquivos + relatório gateado | os 3 + `reposicaoGerarSolicitacoes` |
| Jornada de composição (consumo → sugestão → gerar → some → vincular → parado → gates) | 10 passos, motor real | `reposicaoJornada.api.test.js` |
| Config inválida recusada com 400 literal | testes do PUT de configuração | `configuracoesGerais.api.test.js` |

## O que ficou de fora (declarado — e por quê)

- **Fechar/cancelar solicitação no recebimento** — o módulo Compras não tem o elo por
  material (`solicitacoes_compra_itens` do core só grava `material_tipo = 'escritorio'` —
  o design D2 original dizia que a tabela não existia; **estava errado** e foi corrigido).
  Até lá, o **horizonte de 60 dias** é a aproximação de "aberta", e não existe cancelamento
  (item B14 do doc de novidades).
- **Criar pedido de compra real** — features 22/24 (integração com Compras).
- **"Projetos futuros" no cálculo** — exigiria BOM/OP (features 22/23).
- **Alerta de máximo na entrada** e **e-mail de sugestão** — cortes declarados (D5/D8).
- **Indicadores na listagem geral de materiais** — ver checklist.

## Dependências

- 01 (campos de reposição — **consumidos nesta etapa**) · 07 (reservas — via `disponivelSql`,
  fonte única) · 22/24 (pedidos de compra por material — ainda não existem; é o que falta
  para fechar o ciclo).
