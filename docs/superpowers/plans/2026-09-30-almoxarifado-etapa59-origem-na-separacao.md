# Etapa 59 — a separação diz de onde cada item sai, e a entrega de um clique usa

> Status: **Fase 0-1** (design + plano). Feature 05 (Separação e picking), item "registro por item
> (localização/lote)" — fecha o C80 (a entrega de um clique sai sem origem).

## Fase 0 — medido (2026-09-30)

- `separarRequisicao` (`requisitionService.js:366`): passada 1 valida todas as entradas (tudo ou
  nada), passada 2 grava `quantidade_separada` e a rodada (`separacoes_requisicao_almoxarifado`,
  `itens_json` = `[{ item_id, material_id, quantidade }]`, autor) e limpa a 2ª conferência. Não mexe
  em estoque. Pode haver várias rodadas por item (parcial).
- A entrega da Etapa 58 aceita origem/lote por item; a entrega **de um clique** (`direto: true`,
  botão principal) monta `itens_atendidos` sem origem (C80) — é a mais comum.
- Quem pega o material na prateleira é quem separa: é o gesto natural para dizer "tirei de A".

## Regras de negócio

- **RN-01** — cada entrada de `itens_separados` aceita, opcionais, `localizacao_origem_id` e
  `lote_id`. Validados na passada 1 (tudo ou nada), com as MESMAS regras e literais da entrega:
  endereço existe e não bloqueado, lote do material e ATIVO/não vencido, e o saldo em
  (origem, lote) cobre a quantidade **separada ainda não entregue do item** somada à desta rodada
  (acumulado por material/origem/lote na rodada). Recusa prefixada pelo material.
- **RN-02** — a rodada grava origem/lote em `itens_json`; o item guarda a **origem planejada**
  (`origem_separacao_id`, `lote_separacao_id`): a da rodada, se o item ainda não tinha separado
  pendente ou a planejada era a mesma; se uma rodada nova nomeia origem diferente (ou nenhuma)
  com separado pendente de outra origem, a planejada vira **nula** (mista → automático).
- **RN-03** — a entrega: item **sem** origem no payload e **com** origem planejada → usa a planejada
  (estrita). Origem no payload vence. Se a planejada não cobre mais:
  400 `{material}: a origem da separação ({codigo}) não cobre mais a quantidade ({q}) — entregue escolhendo de onde sai`.
- **RN-04** — entregue tudo o que foi separado (separado = entregue), a planejada é limpa.
- **RN-05 (tela)** — modal de separação: "Sai de" por item (mesmas opções da entrega); modal de
  entrega: "Sai de" pré-selecionado com a planejada; a lista/detalhe mostra "separado de {codigo}".

## Tasks

- **T1 (tronco)** — migração (2 colunas no item), serviço de separação e de entrega. Testes
  `server/tests/api/separacaoOrigemPorItem.api.test.js`: separa de A → entrega sem origem sai de A
  (C80 fechado); A não cobre na separação → recusa, nada gravado; rodadas com origens diferentes →
  planejada nula → entrega automática; payload vence a planejada; planejada que deixou de cobrir →
  recusa com a literal; entregue tudo → planejada limpa; lote bloqueado na separação recusado;
  integração separar → conferir → entregar → saldo por endereço.
- **T2 (galho, tela)** — RN-05.
- **T3** — verificação, Fase 5, fechamento.

## Fase 2 — revisão do plano: 2 críticos, 4 importantes, 3 menores → o que mudou

- **CRÍTICO 1** — sem saída: com a planejada aplicada a toda entrega sem origem, o "Qualquer
  endereço (automático)" do modal também caía nela, e a planejada que deixou de servir travava a
  entrega sem gesto de correção. → **`origem_automatica: true`** por item no payload ignora a planejada.
- **CRÍTICO 2** — a planejada entra na pré-checagem "tudo antes" da Etapa 58 (senão o 1º item saía e
  o 2º recusava).
- **IMPORTANTE** — a planejada vale só até o **separado ainda não entregue**; acima disso é
  automático (o que sai a mais nunca foi separado dali).
- **IMPORTANTE** — qualquer falha da planejada (saldo, endereço bloqueado/inativo, lote bloqueado/
  vencido) sai com a literal que diz o que fazer:
  `{material}: a origem da separação ({codigo}) não serve mais ({motivo}) — entregue escolhendo de onde sai`.
- **IMPORTANTE** — não há reserva por endereço: outra saída automática pode drenar A entre separar e
  entregar; recusar é o honesto (B229). Descartado: cair em automático em silêncio (o livro diria
  "saiu de B" do que saiu fisicamente de A). Letra B.
- **IMPORTANTE** — o pendente só soma na checagem da separação quando a planejada é o MESMO par
  (endereço, lote).
- Menores: "mesma origem" = par (endereço, lote); origem no payload substitui o par inteiro; a
  confirmação por leitura na separação fica fora (letra B); a tela mostra "separado de X" só
  enquanto separado > entregue — o detalhe traz `origem_separacao_codigo` / `lote_separacao_codigo`.

## Contrato da tela (T2)
- **Modal de separação** (`RequisicoesList.js`): por item, "Sai de" opcional (mesmas opções/rótulos
  da entrega: `GET /almoxarifado/estoque/{material_id}/saldos`, `quantidade > 0`, com endereço);
  `PUT .../separar` (ver a rota atual) manda `localizacao_origem_id` e `lote_id` por item só quando
  escolhidos. Erro do servidor como hoje.
- **Modal de entrega**: "Sai de" **pré-selecionado** com a planejada (`origem_separacao_id` +
  `lote_separacao_id` do item) quando o item tem planejada; se o usuário escolher "Qualquer endereço
  (automático)" num item COM planejada, manda `origem_automatica: true`.
- **Detalhe**: "separado de {origem_separacao_codigo}[ — lote {lote_separacao_codigo}]" por item,
  só enquanto separado > entregue.
