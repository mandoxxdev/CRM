# Etapa 65 — a troca de origem NA SEPARAÇÃO fica registrada

> Status: **FECHADA (2026-10-01)** — `5290ba8` (T1), `7d2a160` (T2), fix-rounds `75ff9a5` (servidor) e `4512b16` (tela). Feature 05, item "troca registrada também na separação" (falta para 🟢) — pago; o item "Substituição de lote com registro" continua `[ ]` só pela série.

## Fase 0 — medido (2026-10-01)

1. **Onde a rodada apaga a planejada** — `separarRequisicao` (`requisitionService.js` ~650): `planejada =
   pendenteAntes > 0 && !mesmoPar ? {null, null} : {origemId, origemId ? loteId : null}`. `pendenteAntes` e `mesmoPar`
   são calculados sobre o item **em memória** — já mutado pela entrada anterior do mesmo item no payload. Logo:
   - rodada 1 de A (planejada A), rodada 2 de B → planejada some, calada (B237);
   - rodada 2 em **automático** (sem "Sai de") sobre planejada A → `mesmoPar` falso → some, calada (D (59));
   - a mesma origem → mantém; sem planejada antes → a rodada vira a planejada (não é troca).
   - Dentro de uma rodada, o mesmo item duas vezes (A e depois B) também zera — mas ali **não havia** planejada gravada.
   Nenhum par novo substitui a planejada: o resultado com troca é **sempre nulo**.
2. **`substituicoes_origem_requisicao`** (schema.js ~2299): `movimentacao_ids TEXT` e `localizacao_saida_id` anuláveis;
   não há coluna que diga separação × entrega. → `safeAlter` `momento TEXT` (NULL = legado = entrega) e
   `separacao_id INTEGER` (a rodada).
3. **Detalhe** — `listarSubstituicoes` (~431) alimenta o bloco "Substituições" (`RequisicoesList.js` ~1449), texto
   "`COD: Q — separado de A · saiu de B|automático · motivo`".
4. **Janela de separação** — o item já traz `origem_separacao_codigo`/`lote_separacao_codigo` e `quantidade_separada`/
   `quantidade_entregue`; o "Sai de" por item é `origensSeparacao[i.id]` (vazio = automático). Dá para avisar antes.

## Regras de negócio

- **RN-01 (registro)** — numa rodada de separação, para cada item que **antes da rodada** (estado gravado) tinha origem
  planejada com separado pendente (separado − entregue > 0) e que **termina a rodada sem ela** (planejada nula), grava-se
  UMA linha em `substituicoes_origem_requisicao` com `momento = 'SEPARACAO'`, `separacao_id` = a rodada,
  `quantidade` = o pendente planejado antes da rodada, planejada = o par antigo, saída = o par da rodada (se o item usou
  um par só na rodada; vários pares → saída nula, `automatica = 0`), `automatica = 1` se nenhuma entrada do item na rodada
  trouxe origem/lote, `movimentacao_ids` NULL (separação não move estoque), motivo opcional (`motivo_substituicao` na
  entrada, ≤ 500, trim; vazio = NULL).
  Metade positiva / negativa: mesma origem → nada; sem planejada antes → nada; planejada sem pendente → nada.
- **RN-02 (não muda a regra)** — a planejada continua sendo **apagada** (B237 inalterada): a entrega de um clique do que
  sobrou sai automática, como hoje. Só registro, aditivo; a rodada não recusa nada novo. Decisão reversível (letra B):
  descartado "substituir pela nova" (a caixa é mista; dizer "veio tudo de B" seria falso) e "planejada por parcela"
  (entidade nova — escopo da lista como entidade).
- **RN-03 (detalhe)** — `listarSubstituicoes` devolve `momento`; o bloco "Substituições" diz, para `SEPARACAO`:
  "`COD: Q — separado de A[ — lote L] · nova separação de B|sem origem (na separação) — a origem anterior deixou de
  valer[ · motivo]`"; para entrega, o texto de hoje.
- **RN-04 (janela de separação)** — item com planejada e separado pendente cuja quantidade a separar > 0 e cujo "Sai de"
  difere da planejada (inclusive vazio/automático): aviso no item "`A origem da separação anterior (A[ — lote L]) deixa
  de valer: o que já está separado passa a sair automático na entrega.`" e um campo opcional "Motivo da troca" que vai
  como `motivo_substituicao`. Sem planejada, ou mesmo par: nada.

## Contrato

`PUT /api/almoxarifado/requisicoes/:id/separacao` — entrada ganha `motivo_substituicao?: string` (opcional; ignorado
quando não há troca). Resposta inalterada. `GET /api/almoxarifado/requisicoes/:id` — `substituicoes[]` ganha
`momento: 'SEPARACAO' | 'ENTREGA'` (legado NULL → `'ENTREGA'`). Nenhuma recusa nova.

## Tasks
- [x] **T1 (tronco)** — **feita, `5290ba8`** (fix-round `75ff9a5`). schema (`safeAlter` momento/separacao_id), registro na rodada, `listarSubstituicoes` com momento.
  Testes `server/tests/api/trocaSeparacao.api.test.js`: troca A→B, A→automático, mesma origem (nada), sem planejada
  (nada), mistura dentro da mesma rodada sem planejada (nada), motivo, quantidade = pendente antes (com entrega parcial
  no meio), pela rota (PUT) e pelo detalhe (GET mostra momento), a entrega de depois não registra outra troca.
- [x] **T2 (galho, tela)** — **feita, `7d2a160`** (fix-round `4512b16`). RN-03 e RN-04 em `RequisicoesList.js` + testes.
- [x] **T3** — verificação, Fase 5 (servidor e tela), fechamento — feita (este documento e o commit de fechamento).

## Fase 2 — revisão do plano: 2 críticos, 6 importantes, 5 menores → plano revisto

- **CRÍTICO 1** — "estado gravado" sem dizer onde: o `item` é mutado no laço; usar o `pendenteAntes` em memória grava
  troca falsa no "A e depois B sem planejada". → **retrato antes da passada 1** (no laço que semeia `pedidoSeparacao`).
- **CRÍTICO 2** — a janela de separação abre com "Sai de" automático e a quantidade sugerida: a rodada 2 de um clique
  apaga a planejada e grava troca automática em **todo** item. → T2 **pré-seleciona a planejada** no "Sai de" da
  rodada quando o item tem planejada com separado pendente (fecha também a D (59)).
- **IMPORTANTE** — detectar na passada 1, **gravar depois** do INSERT da rodada (`separacao_id`); rodada recusada na
  passada 1 não registra nada (teste). INSERT da troca falha → best-effort com `console.warn` (como a auditoria da
  rodada; a rodada já está gravada) — letra B.
- **⚠️ ESTE ACHADO ESTAVA ERRADO (provado na Fase 5 — ver "Divergências").** - **IMPORTANTE** — planejada **sem lote** (A, —) e rodada (A, L1): a entrega (Etapa 63) diz "sem lote vale qualquer
  lote"; a separação apagava. → alinhar: mesmo endereço com planejada sem lote **é o mesmo par** — a planejada fica
  (A, —), não estreita para L1, e não há troca. Lote planejado diferente → troca registrada (como hoje apaga).
- **IMPORTANTE** — vários pares na rodada: texto próprio "de mais de uma origem"; só entradas com quantidade > 0 contam
  (a regua da divergência já faz isso — `origens`). Motivo: o primeiro não vazio; não-texto ignorado; > 500 cortado.
- **IMPORTANTE** — o texto da linha não pode dizer "saiu de" (nada saiu do estoque na separação): T1 e T2 sobem juntas.
  `trocaDaPlanejada` da tela usa a régua da entrega; o aviso da RN-04 segue a régua da separação acima.
- Menores: `momento TEXT NOT NULL DEFAULT 'ENTREGA'` (o legado vira ENTREGA, sem NULL eterno); entrada só de lote
  (sem endereço) → "do lote L"; a quantidade do texto é o **já separado** de A ("5 já separados de A"), não "5 trocados";
  rastreabilidade por lote futura filtra `momento` (lote_saida_id numa linha SEPARACAO é o lote separado); o item
  "Substituição de lote com registro" da spec 05 **continua [ ]** (a troca de série segue fora — D (63)).

## Divergências do plano (o plano errado é dado, não vergonha)

- **A Fase 2 mandou alinhar "planejada sem lote vale qualquer lote" na separação — ESTAVA ERRADO.** A premissa era "a
  entrega (Etapa 63) diz que sem lote vale qualquer lote". Isso vale só para a **comparação** que decide se a entrega é
  uma troca; o saldo da origem (`checarOrigemItem`), o `pedidoSeparacao`, a régua `outras` (`ir.lote_separacao_id IS ?`)
  e o motor leem (A, sem lote) como "o saldo **sem lote** em A". A T1 (`5290ba8`) implementou o alinhamento e a Fase 5
  provou por sonda: A com 2 sem lote e 10 no L1, separar 2 de (A, —) e 4 de (A, L1) → a planejada ficava (A, —) e a
  entrega de um clique de 6 era recusada com *"a origem da separação (A) não serve mais (O saldo em A (2) não cobre a
  quantidade (6) …)"* — antes passava. Voltou o par exato em `75ff9a5`: (A, —) → (A, L1) apaga a planejada e registra a
  troca (**B257**). Descartado ensinar o saldo e o motor a ler "qualquer lote" (escopo do motor).
- **O contrato da tela mudou no meio da T2** (por causa do item acima): o executor da tela recebeu a régua nova por
  mensagem — planejada sem lote só casa com a opção sem lote; nunca cair numa opção com lote. Sem retrabalho grande.
- **RN-04 ganhou uma condição que o plano não tinha:** a pré-seleção da planejada só quando ela **cobre** a quantidade
  sugerida (`maxSeparavelNaTela` ≥ sugerida) — `4512b16` (**B259**).
- **RN-03:** o texto final da linha SEPARACAO é *"⟨cód⟩: ⟨q⟩ já separados de ⟨A⟩[ — lote ⟨L⟩] · nova separação ⟨destino⟩
  — a origem anterior deixou de valer[ · motivo]"*, com quatro destinos: *"de ⟨B⟩[ — lote ⟨L⟩]"*, *"do lote ⟨L⟩"*,
  *"sem origem (automática)"* e *"de mais de uma origem"*.

## Fase 5 — revisão adversarial do código

**Servidor (sobre `5290ba8`), sondas executadas:**

| Achado | Severidade | Destino |
|---|---|---|
| Planejada (A, —) mantida após rodada (A, L1): entrega de um clique recusada; segundo item do mesmo material sem conseguir separar de (A, —) | IMPORTANTE (perto de CRÍTICO) | corrigido — par exato (`75ff9a5`) |
| Mutante "rodada só de lote vira automática" sobrevivia | lacuna de teste | cenário novo (`75ff9a5`) |
| Mutante "o motivo é o último, não o primeiro não vazio" sobrevivia (o teste tinha o primeiro = o último) | lacuna de teste | cenário refeito (`75ff9a5`) |
| Mutante "sem try/catch no INSERT da troca" sobrevivia | lacuna de teste | cenário com trigger que falha (`75ff9a5`) |
| Bordas: lote sem endereço; A e A sobre planejada B; reabertura após conferência; falha forçada do INSERT | — | confirmadas corretas |

**Tela (sobre `7d2a160`), sondas executadas (tela + servidor real):**

| Achado | Severidade | Destino |
|---|---|---|
| Pré-seleção da planejada sem saldo livre: o clique mandava 5 de SA e o servidor recusava *"O saldo em SA (0) não cobre a quantidade (5) — a saída tiraria de outros endereços"* (antes da T2 o mesmo clique passava, em automático) | IMPORTANTE | corrigido — só quando cobre (`4512b16`) |
| O teste aprovava esse PUT: fixture com 4 em L-7 e 5 já separados de lá (fisicamente impossível) | teste falso | fixture corrigida + 2 cenários (`4512b16`) |
| Saldos que falham ao carregar → automático, troca registrada | MENOR | declarado (**D (65)**) |
| Clique antes de os saldos chegarem → automático | MENOR | declarado (**D (65)**) |
| Laço de render, reabertura com outra requisição, id string × número | — | refutados |

**Testes ao fechar:** `server/tests/api/trocaSeparacao.api.test.js` 12/12 (8 sabotagens, todas vermelhas na asserção
certa); `client/src/components/almoxarifado/RequisicoesTrocaSeparacao.test.js` 19/19 (9 sabotagens vermelhas; trocar a
guarda `hasOwnProperty` por "truthy" pendura num laço de render — prova a guarda, não por asserção; inverter a ordem do
merge é equivalente e fica verde). Suítes: `test:api` 242/242, `test:almoxarifado`/`validation`/`safealter`/`sqlite`
exit 0, cliente 1047/1047, build limpo — medidos no fix-round da tela.

## Retro (4 números)

- **Rodadas de correção até verde:** 2 — uma no servidor (`75ff9a5`) e uma na tela (`4512b16`).
- **Achados da revisão:** Fase 2 — 13 (2 críticos, 6 importantes, 5 menores), **um deles errado** (o alinhamento "sem
  lote vale qualquer lote"), que virou defeito implementado e foi pego só na Fase 5 por sonda executada. Dado sobre o
  fluxo: o revisor da Fase 2 lê, não executa; uma recomendação que **muda regra de saldo** precisa ser provada por sonda
  antes de entrar no plano. Fase 5 — 2 reais (1 servidor, 1 tela) + 3 lacunas de teste + 1 fixture impossível; 0 ruído.
- **Paralelismo:** T2 (tela) rodou em paralelo com a Fase 5 do servidor; a mudança de contrato no meio exigiu uma
  mensagem ao executor da tela, sem retrabalho grande. O harness de sabotagem do executor da tela deixou uma sabotagem
  aplicada visível no meio do caminho (era o próprio harness andando; restaurou por cópia e md5).
- **Defeito que escapou da Etapa 64:** nenhum conhecido.

## Próxima tarefa detalhada — Etapa 66: motivos de movimentação e de ajuste como cadastro (feature 01)

**Por que esta.** Os "falta para 🟢" que sobram são, quase todos, bloqueados por dependência (22: BOM/OP/centro de
custo; 06: Engenharia e dupla aprovação de ajuste — decisão B11) ou escopo grande (05: lista de separação como entidade
e rota; kits exigem estender `TIPOS_LOCALIZACAO`). Na feature 01, o item **"Motivos de movimentação e motivos de ajuste
(cadastro, hoje texto livre)"** está `[ ]`, é independente e tem valor operacional direto: o ajuste e a saída manual hoje
levam um motivo digitado à mão (`MovimentacaoSchema.motivo: z.string().optional()` em
`server/services/almoxarifado/schemas.js:98`), o que impede relatório por motivo e deixa ajuste sem porquê padronizado.

**Fase 0 da 66 — medir antes de prometer:**
1. Onde o motivo entra hoje: `MovimentacaoSchema` (opcional), a regra de "motivo obrigatório" por tipo em
   `movementRules.js` (Etapa 5: "tirar material do disponível sem dizer por que"), a janela de movimentação/ajuste na
   tela (`MovimentacoesAlmoxarifado` / modal de ajuste) e o inventário (ajuste de inventário tem motivo?).
2. O padrão de cadastro simples que já existe para copiar (tela `Categorias`, rotas de cadastro com auditoria da
   Etapa 19, permissão `configurar`), e se há tabela de "tipos de documento" ou similar.
3. Quem lê `movimentacoes_almoxarifado.motivo` (relatórios do `reportRegistry`, extrato, livro, export) — o texto livre
   antigo tem de continuar legível.
4. Se a integração (rotas que movimentam por API) manda motivo livre — o cadastro não pode quebrar quem integra.

**Contratos que não se reabrem:** o motor (`registrarMovimentacao`, opções no 4º argumento); as regras de tipo dedicado
(`CAMINHO_TIPO_DEDICADO`); a separação/entrega das Etapas 58–65.

**Pontos de atenção.**
- Decidir (letra B, reversível) se o motivo do cadastro **substitui** o texto livre ou **acompanha** (código do motivo +
  observação livre) — o caminho reversível é acompanhar, com o texto livre continuando aceito pela API.
- Motivo por tipo de movimentação (ajuste positivo/negativo, saída manual, perda) — o cadastro precisa dizer a que tipos
  serve; a tela só oferece os do tipo escolhido.
- Desativar um motivo não pode apagar o histórico (o livro guarda o texto do motivo na hora).
- Metade positiva no teste: movimentação com motivo do cadastro grava o código e o texto; sem motivo onde é obrigatório
  continua recusada com a mensagem de hoje.
