# Etapa 58 — a entrega de requisição diz de onde cada item sai (endereço, lote, leitura)

> Status: **Fase 0-1** (design + plano). Feature 05 (Separação e picking), item "registro por item
> (localização/lote)".

## Fase 0 — medido (2026-09-30)

- `entregarRequisicao` (`requisitionService.js:520`) chama o motor com `tipo: 'SAIDA'` **sem**
  `localizacao_origem_id` e **sem** `lote_id` (`:633`). Cada item vira até duas baixas: o excedente
  (sem reserva) e a parte reservada (`reserva_id`). O motor drena os endereços pelo
  `claimSaldoSemLote` (a padrão primeiro); material com lote não baixa de lote nenhum (B204, C72).
- A **separação** (`separarRequisicao`, Etapa 28) é lógica: grava `quantidade_separada` e a rodada
  (`itens_json`, autor) — **não mexe em estoque**. O gesto que move estoque, e portanto o que diz
  "tirei de A", é a **entrega**. Decisão (letra B): a origem é informada na entrega; registrar a
  origem **planejada** na separação fica para depois.
- Rota: `PUT /requisicoes/:id/entregar { itens_atendidos: [{ item_id, quantidade_atendida }] }`;
  tela `RequisicoesList.js:447-464`.
- Não há rota que diga "onde este material está" por endereço e lote — a tela de Movimentações
  lista todas as localizações.

## Regras de negócio

- **RN-01** — cada entrada de `itens_atendidos` aceita, opcionais, `localizacao_origem_id`, `lote_id` e
  `codigo_lido_origem`; o serviço os repassa a **todas** as baixas daquele item (excedente e
  reservada). Ausentes → o comportamento de hoje.
- **RN-02** — quem valida é o motor (endereço inexistente/bloqueado, lote de outro material, saldo
  do lote, confirmação por leitura com a regra da B224 e a checagem pós-claim da Etapa 56). A recusa
  sai prefixada pelo material, como hoje: `{material}: {mensagem do motor}`.
- **RN-03** — a validação da entrega é **tudo ou nada**? Hoje uma falha no 2º item deixa o 1º
  entregue (cada baixa é registrada no item logo em seguida). Mantido — mudar é outra etapa; a
  literal da recusa diz o material.
- **RN-04** — `GET /api/almoxarifado/materiais/:id/enderecos` → `[{ localizacao_id, codigo,
  endereco_completo, lote_id, lote_codigo, quantidade }]` das linhas com quantidade > 0 (endereço não
  nulo), ordenadas por quantidade desc. Gate: `auth` + `visualizar`.
- **RN-05 (tela)** — no modal de entrega, por item: "Sai de" (opcional; opções da RN-04 como
  "`{endereço}` — lote `{lote}` ({quantidade})"; escolher preenche endereço e lote) e "Confirmar
  endereço lido" (opcional, a mesma extração da Etapa 56). Erro do servidor aparece como hoje.

## Tasks

- **T1 (tronco)** — serviço + rota RN-04. Testes `server/tests/api/entregaOrigemPorItem.api.test.js`:
  sai do endereço informado (A:10, B:50, entrega 5 de A → A 5, B 50); com lote (baixa do lote); com
  reserva (as duas baixas usam a mesma origem); endereço bloqueado/inexistente recusado com prefixo;
  leitura confere/não confere; origem que não cobre com leitura → recusa B224; ausente = hoje;
  RN-04 com e sem lote. Integração: aprovar → separar → entregar → saldo por endereço.
- **T2 (galho, tela)** — RN-05 com testes.
- **T3** — verificação, Fase 5, fechamento.

## Fase 2 — revisão do plano: 3 críticos, 4 importantes, 3 menores → o que mudou

- **CRÍTICO 1** — "sai de A" era só PREFERÊNCIA: sem leitura, o claim drena os outros endereços e o
  livro grava A (A:3, B:50, entrega 5 → A 0, B 48, "5 saíram de A"; o estorno devolvia 5 para A).
  → a origem informada na entrega é **estrita**: o serviço recusa se A (no lote) não cobre, e o motor
  ganha a opção `origemEstrita` (4º argumento, nunca o body) com a mesma checagem pré e pós-claim da
  confirmação por leitura (Etapa 56). Literal: `{material}: O saldo em {codigo} ({saldo}) não cobre a quantidade ({q}) — a saída tiraria de outros endereços`.
- **CRÍTICO 2** — duas baixas por item (excedente + reservada): uma recusa na 2ª deixava a 1ª feita.
  → o serviço valida **todos** os itens com origem/lote/leitura ANTES de qualquer baixa (saldo do
  item inteiro em origem+lote, lote do material, endereço, leitura).
- **CRÍTICO 3** — excluir a requisição estornava uma ENTRADA sem lote e sem endereço: com a entrega
  saindo de um lote, o lote perdia o que saiu para sempre (C72 pelo lado inverso). → o estorno da
  exclusão devolve **por saída** (mesmo lote; para a origem se ativa e não bloqueada); dado antigo cujo
  livro não soma o entregue cai no estorno de antes.
- **IMPORTANTE (Fase 0 estava errada)** — a rota "onde o material está" **já existe**:
  `GET /estoque/:materialId/saldos` (`consultarSaldosPorLocalizacao`). A RN-04 (rota nova) **caiu**;
  a tela usa a existente.
- **IMPORTANTE** — a B204 ("a entrega não escolhe lote") muda: a entrega **pode** escolher o lote;
  sem escolha, o de antes. A C72 só se resolve quando o operador escolhe.
- **IMPORTANTE** — a devolução citando a saída herdava o lote só em material com `controle_lote`; a
  entrega agora escolhe lote também em material sem controle → **herda sempre que a saída tem lote**.
  Voltar para o endereço da saída: não (declarado).
- Menores/declarados: lote não ATIVO/vencido é recusado pelo motor com a literal dele (a tela não os
  marca); a entrega direta (`direto: true`) não manda origem; série e divergência por item (spec 05)
  ficam fora; RN-03 (não é tudo-ou-nada entre itens SEM origem) mantida.

## Contrato da tela (T2)
- Modal de entrega (`RequisicoesList.js`), por item com quantidade a entregar: "Sai de" opcional,
  opções de `GET /almoxarifado/estoque/{material_id}/saldos` com `quantidade > 0` e `localizacao_id`
  não nulo, rótulo `{localizacao_codigo}[ — lote {lote}] ({quantidade})`; escolher preenche
  `localizacao_origem_id` e `lote_id` (nulo quando a linha não tem lote). "Confirmar endereço lido"
  opcional (extração `extrairCodigoLido` da Etapa 56), só com origem escolhida. Manda os campos só
  quando escolhidos. Erro do servidor como hoje.
