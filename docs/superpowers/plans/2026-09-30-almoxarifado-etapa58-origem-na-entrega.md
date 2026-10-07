# Etapa 58 — a entrega de requisição diz de onde cada item sai (endereço, lote, leitura)

> Status: **FECHADA (2026-09-30)** — `cec2b56` (T1), `d18019f` (T2), fix-round e9bca72.
> Feature 05 (Separação e picking), item "registro por item (localização/lote)" — pago **na entrega**, não na separação.

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

- [x] **T1 (tronco)** — `cec2b56`. **Divergência:** a RN-04 (rota nova) **caiu** na Fase 2 — `GET /estoque/:id/saldos`
  já existia; e a T1 ganhou os três críticos da Fase 2 (origem estrita, validação de todos os itens antes da 1ª baixa,
  estorno da exclusão por saída) e a herança de lote na devolução. Plano original da T1: Testes `server/tests/api/entregaOrigemPorItem.api.test.js`:
  sai do endereço informado (A:10, B:50, entrega 5 de A → A 5, B 50); com lote (baixa do lote); com
  reserva (as duas baixas usam a mesma origem); endereço bloqueado/inexistente recusado com prefixo;
  leitura confere/não confere; origem que não cobre com leitura → recusa B224; ausente = hoje;
  RN-04 com e sem lote. Integração: aprovar → separar → entregar → saldo por endereço.
- [x] **T2 (galho, tela)** — `d18019f`. **Divergências:** (1) o botão principal **"Confirmar Entrega e Baixar Estoque"**
  é o caminho DIRETO (um clique, sem modal) e continua sem origem — ao lado dele entrou **"Entregar escolhendo de onde
  sai…"**, que abre o modal com "Sai de" (B230; descartado: o principal abrir o modal sempre, um clique a mais para
  todo mundo). (2) O campo "Confirmar endereço lido" saiu de `MovimentacoesAlmoxarifado.js` para
  `CampoCodigoLido.js` — as duas telas usam o mesmo. (3) `lote_id` não é enviado quando a linha não tem lote (em vez
  de `null`). Testes: 10 cenários, 11 sabotagens + 1 (o botão secundário) vermelhas.
- [x] **T3** — Fase 5 + fix-round e9bca72 + fechamento.

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

## Fase 5 — revisão adversarial do código (um revisor): 0 CRITICAL, 2 IMPORTANT, 3 MINOR corrigidos; 4 declarados

| # | Achado | Cenário | Correção |
|---|---|---|---|
| I-1 | A exclusão podia **travar** e **creditar em dobro** | Saída de um endereço que hoje não aceita o tipo do material como destino (saldo antigo ali): a ENTRADA de estorno voltava para lá e o motor recusava; com duas partes (origem, lote), a 1ª já tinha sido creditada quando a 2ª falhava — requisição ativa, e a nova tentativa creditava a 1ª de novo | A origem só vale como destino do estorno se ainda aceita o material (ativa, não bloqueada, tipo permitido); senão a padrão. **Todas** as partes são validadas antes da 1ª ENTRADA. Agrupado por **material** |
| I-2 | O status do lote não estava na pré-checagem | Item 1 sem origem, item 2 com lote BLOQUEADO: o item 1 era baixado e o 2 recusado na baixa | Status e vencimento do lote na pré-checagem, com as literais do motor |
| M-1 | Dois itens do mesmo material | A:10, dois itens de 6 saindo de A: cada um cabia sozinho, o 2º era recusado depois de o 1º sair; e a exclusão caía sempre no estorno antigo (as saídas somavam os dois itens) | A pré-checagem soma por material/origem/lote; a exclusão agrupa por material |
| M-2 | Devolução para RETRABALHO herdando lote | RETRABALHO é uma saída: herdar um lote vencido ou curto recusaria o que antes passava | Herda o lote da saída só para ESTOQUE/QUARENTENA (ou material com `controle_lote`). **Sem teste** — ver D (58) |
| M-3 | Formatação `formatMoeda =(v)` | — | sem efeito; não mexido |

Declarados, não corrigidos: a tela não marca lote bloqueado/vencido nem endereço bloqueado nas opções (a recusa vem do
servidor, com a literal); a fixture da tela não tem dois lotes no mesmo endereço; o teste "Ausente" é de regressão (não
prova a feature); a herança de lote no RETRABALHO não tem teste.

Testes finais: `server/tests/api/entregaOrigemPorItem.api.test.js` **14/14** (7 sabotagens da T1 + 5 do fix-round, todas
vermelhas no cenário certo); `client/.../RequisicoesEntregaOrigem.test.js` **10/10**.

## Retro — os 4 números

1. **Rodadas de correção até verde:** 1 fix-round.
2. **Achados:** Fase 2 — 10 (3 CRITICAL) + a Fase 0 **errada** (a rota "onde o material está" já existia); Fase 5 —
   2 IMPORTANT + 3 MINOR reais, 4 declarados, **0 ruído**.
3. **Paralelismo:** 1 galho (a tela) depois do tronco commitado, sem retrabalho. A divergência do botão principal veio
   do executor da tela (ele notou que o modal não abria no caminho mais comum) — virou um botão secundário.
4. **Defeito que escapou da Etapa 57:** nenhum conhecido.

## Próxima tarefa detalhada — Etapa 59: a separação escolhe de onde sai, e a entrega direta usa (feature 05)

**Por que esta.** A 58 pagou o "registro por item (localização/lote)" **na entrega** — mas só no modal. A entrega mais
comum é o botão **"Confirmar Entrega e Baixar Estoque"**, de um clique, que **continua sem origem** (drena a padrão
primeiro — **C80**). Quem vai à prateleira é quem **separa**: é ali que "tirei de A, lote L" é conhecido. Se a
separação registrar a origem planejada por item, a entrega direta pode usá-la sem mudar o gesto de ninguém.

**Fase 0 da 59 — medir antes de prometer:**
1. A rodada de separação (`separacoes_requisicao_almoxarifado`, `itens_json`, Etapa 28): o formato do JSON, quem lê
   (`listarSeparacoes`, a tela da 2ª conferência), e se cabe `{ localizacao_origem_id, lote_id }` por item sem quebrar
   leitor nenhum.
2. **Várias rodadas** para o mesmo item (separou 3 de A, depois 2 de B): a entrega direta tem de sair em **duas
   baixas** com origens diferentes — a entrega hoje monta **uma** entrada por item (`itens_atendidos`). Medir se o
   serviço aceita o mesmo `item_id` duas vezes (hoje: `find` pega só a primeira).
3. A **2ª conferência** (quem separou não confere): a origem planejada entra no que o conferente vê?
4. O que acontece se o saldo da origem planejada **mudou** entre separar e entregar — a origem é estrita (recusa).
   Decidir (letra B): a entrega direta recusa, ou cai no automático com aviso.
5. Contratos que **não** se reabrem: a origem estrita da 58 (`origemEstrita`), a pré-checagem de todos os itens, a
   confirmação por leitura, o estorno da exclusão por saída.
