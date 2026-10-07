# Etapa 59 — a separação diz de onde cada item sai, e a entrega de um clique usa

> Status: **FECHADA (2026-09-30)** — T1 `11dcdb5`, T2 `29eb434`, fix-round e2b7dab. Feature 05 (Separação e picking), item "registro por item
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

- [x] **T1 (tronco)** — `11dcdb5` — migração (2 colunas no item), serviço de separação e de entrega. Testes
  `server/tests/api/separacaoOrigemPorItem.api.test.js`: separa de A → entrega sem origem sai de A
  (C80 fechado); A não cobre na separação → recusa, nada gravado; rodadas com origens diferentes →
  planejada nula → entrega automática; payload vence a planejada; planejada que deixou de cobrir →
  recusa com a literal; entregue tudo → planejada limpa; lote bloqueado na separação recusado;
  integração separar → conferir → entregar → saldo por endereço.
- [x] **T2 (galho, tela)** — `29eb434` — RN-05.
- [x] **T3** — verificação, Fase 5 (fix-round e2b7dab), fechamento.

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

## Divergências da execução

- **T1:** a regra da checagem virou um helper único, `checarOrigemItem`, usado pela separação e pela entrega (antes
  inline na entrega da Etapa 58). A primeira versão somava o pendente só quando a planejada era o **mesmo par** do
  próprio item (`mesmoPar`) — a Fase 5 trocou por uma semente com o pendente de **todos** os itens (abaixo). O detalhe
  da requisição passou a trazer `origem_separacao_codigo`/`lote_separacao_codigo` (não estava no plano; a tela
  precisava).
- **T2:** a tela usa `PUT /separacao` (a rota que já usava; `/separar` é alias). Decisão do executor: com a busca de
  endereços falhando num item com planejada, a tela não decidia (sem chave, o servidor aplica a planejada) — no
  fix-round isso virou a opção **"Planejada da separação (X)"** pré-selecionada, porque sem ela era beco sem saída
  (o select em `""` não dispara `onChange` ao reescolher `""`).

## Fase 5 — revisão adversarial do código (1 revisor, 0 critico)

| # | Achado | Tipo | Resultado |
|---|---|---|---|
| I-1 | Depois de entrega parcial, a tela pré-selecionava a planejada para a quantidade inteira (que passa do separado pendente, porque `maxEntregar` solta o teto) — como origem estrita, recusava onde o servidor faria automático | Importante | Corrigido: pré-seleção só até o pendente; acima, automático sem chave |
| I-2 | A checagem da separação contava o pendente só do PRÓPRIO item: dois itens do mesmo material no mesmo par passavam e a entrega de um clique recusava um | Importante | Corrigido: o acumulado é semeado com o separado pendente de todos os itens com planejada; a mensagem mostra o saldo já descontado |
| M-3 | A mesma entrada duas vezes no payload contava o pendente em dobro | Menor | Corrigido pela semente |
| M-4 | Beco sem saída: busca de endereços falha + planejada falha, e "automático" não disparava troca | Menor | Corrigido: opção "Planejada da separação (X)" |
| M-5 | Lote sem endereço virava planejada que a entrega nunca usa (e nunca limpa) | Menor | Corrigido: só com endereço |
| M-6 | Segunda rodada "sem mexer" apaga a planejada sem aviso | Menor | Declarado (B237, D (59)) |
| M-7 | Faltava teste de RN-04 mantendo a planejada depois de entrega parcial | Menor | Teste novo |

Sabotagens do fix-round: server 3/3 vermelhas (semente, lote sem endereço, limpar sempre); cliente 4/4.
Testes finais: server `separacaoOrigemPorItem` 11/11 (9 + 3 sabotagens); cliente `RequisicoesSeparacaoOrigem` 14/14 (7 + 4).

## Retro (4 números)

1. **Rodadas de correção até verde:** 1 fix-round.
2. **Achados da revisão:** Fase 2 — 9 (2 críticos), todos incorporados antes do código; Fase 5 — 2 importantes + 4
   menores corrigidos, 1 declarado; **0 ruído**.
3. **Paralelismo:** 1 galho (tela) depois do tronco commitado; sem retrabalho.
4. **Defeito que escapou da Etapa 58:** nenhum conhecido.

**Lição de processo:** um script perl longo passado por heredoc do bash quebrou com aspas desbalanceadas
(*"unexpected EOF while looking for matching `''"*) e nem chegou a rodar; escrito com a ferramenta **Write** num arquivo
do scratchpad, rodou de primeira. Script de edição com mais de ~30 linhas: arquivo, não heredoc.

## Próxima tarefa detalhada — Etapa 60: a divergência na separação, com motivo (feature 05)

**Por que esta.** No "falta para 🟢" da 05, o registro por item ficou pago em endereço e lote (58/59); o que resta
dele é **série e divergência**. A **divergência** é a mais barata e a mais útil: separar **menos** do que o pedido (ou
do que o reservado) hoje é silencioso. E a spec 05 **dizia** que a regra existia — citava o teste
`separacao com quantidade menor exige motivo`, que **não existe** (corrigido à vista na spec no fechamento da 59).

**Fase 0 da 60 — medir antes de prometer:**
1. O que é "divergência" na separação: quantidade separada **menor** que o pendente de separação quando há saldo
   (o separador não achou)? E menor que o **reservado** para o item? Separação parcial legítima (sem saldo) não pode
   exigir motivo — medir `maxSeparar` e o disponível na hora.
2. Onde gravar: na rodada (`itens_json` já é por item — `motivo_divergencia` por entrada?) e/ou no item. Quem lê:
   a tela de detalhe (bloco **Separação (N)**), a auditoria da rodada (`SEPARACAO`), relatórios.
3. A conferência (2ª pessoa, Etapa 28) deve ver a divergência? Uma divergência exige conferência?
4. A divergência gera algo além do registro (alerta, não conformidade, ajuste de inventário)? Provavelmente **só
   registro** nesta etapa — decidir e registrar na letra B.
5. Contratos que não se reabrem: `checarOrigemItem` (origem/lote), a origem planejada (59), o tudo-ou-nada da
   separação (Etapa 28, `5a3d593`).

**Pontos de atenção.** Não confundir com a divergência do **recebimento** (conferência de NF) nem com a da
**inspeção** — nomes e tabelas diferentes. Testar a metade positiva: separar menos **por falta de saldo** não exige motivo.
