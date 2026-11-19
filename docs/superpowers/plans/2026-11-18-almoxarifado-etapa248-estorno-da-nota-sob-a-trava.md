# Etapa 248 — o estorno da nota no mesmo instante da liberação do lote: a conta do estorno sob a trava (C525 + C534, B1506)

> Item 12 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h30, trava/estorno).
> Ponto de partida: a "Próxima tarefa detalhada" do plano da 247. **Estimativa não revisada:** a sonda da Fase 0 reproduziu C525 e C534.
> **Etapa só de motor** (sem tela nova): o efeito visível é o estorno que deixa de ser recusado / a requisição que deixa de perder a reserva.

## Fase 0 — medido (sonda executada com gancho, 18/11)

`server/tests/api/estornoNotaSobTrava.api.test.js` no código de `c9cda9ad` (gesto concorrente disparado do contexto do TESTE; o gancho só
sinaliza e segura o comando do sqlite): **0 passou, 4 falharam**.

- **C525 reproduzida** (RN-248.01 pela rota, RN-248.04 pelo serviço): a liberação do L1 segura o `UPDATE lotes_almoxarifado SET status`
  (lote já Ativo, nada reservado) até o estorno gravar o claim. O estorno leu a conta fora da trava (livre 4 ≥ 4 → não soltou nada), a
  liberação reservou 4 para R1 com a marca de A, e o estorno foi recusado: *"Não é possível estornar: o material está reservado para
  requisições (REQ-E248-2) — libere as reservas antes de estornar"*.
- **C534 reproduzida** ("de mais", RN-248.02): A reservou R1 (L1 ativo); L2 (4, entrada avulsa) bloqueado. O estorno de A lê a conta (L2
  impedido → solta R1) e, segurado ali, a liberação do L2 termina (R1 ainda reservada: nada para ela); o estorno solta R1 → R1 sem reserva
  com 4 livres no L2. A variante "de menos" pelo **bloqueio** é linearizável (o resultado é o mesmo de "estorno, depois bloqueio" em série:
  bloquear um lote não solta reserva) — não é defeito do estorno; a "de menos" real é a C525 (liberação).
- **Onde:** `stockService.cancelarMovimentacao` — a pré-checagem da linha do lote e `reservaChegadaService.liberarParaEstorno` rodam antes
  do claim, fora de `trava.naTravaDoMaterial`; a seção do estorno (Etapa 118) começa no ramo do efeito. A recriação
  (`recriarReservasDoEstorno`) e o recálculo rodam no `catch` de fora, depois de soltar.
- A liberação, o bloqueio e a correção de validade do lote rodam sob `naTravaDoMaterial` (`lotService.comTravaDoLote`, Etapa 220).

## Regras de negócio

- **RN-248.01** (C525, rota) L1 bloqueado com A (4), R1 espera 4. Liberar L1 e, no meio da liberação, estornar A → o estorno **espera** a
  liberação e conclui **200**: solta a reserva que a liberação acabou de criar (marca A), R1 volta a esperar, físico 0. O gesto seguinte: a
  nota B (4, L2) liberada atende R1 (reserva com a marca de B).
- **RN-248.02** (C534, "de mais") A (4, L1 ativo) reservou R1; L2 (4) bloqueado. Estornar A e, no meio da conta, liberar L2 → a liberação
  **espera** o estorno; o estorno solta R1 (o que sobra estava bloqueado), a liberação do L2 reserva 4 para R1 → R1 **Totalmente
  reservada**, físico 4.
- **RN-248.03** A conta (`liberarParaEstorno`) roda sob a trava do material; se o estorno falha depois de soltar (o livro falha), a
  recriação (`recriarAposEstornoRecusado`) roda **sob a trava** (antes de soltar), R1 volta reservada (4), físico 4, `cancelado = 0`, a
  trava solta.
- **RN-248.04** (serviço) a corrida da RN-248.01 com `stockService.cancelarMovimentacao` chamado direto → conclui.
- **RN-248.05** (regressão) recusas e mensagens do estorno inalteradas (a pré-checagem do lote, *"Movimentação já cancelada"*, a recusa do
  reservado nos casos da D da 247); a repartição da 247 (o estorno solta a reserva com a marca da própria nota, só o que falta) não muda —
  coberto pelas suítes existentes (`liberarLoteDeDuasNotas`, `estornoEntradaCompra*`, etc.).

## Contratos

- `POST /movimentacoes/:id/cancelar`: **inalterado** (resposta, códigos e mensagens). Muda só **quando** a conta roda: depois do claim,
  dentro da seção da trava do material.
- `PUT /lotes/:id/status`, `POST /lotes/:id/certificado`, `PUT /lotes/:id/validade`, `PUT /lotes/:id/liberar-vencimento`: inalterados (já
  pegam a trava; agora esperam o estorno do mesmo material inteiro).

## Desenho

Em `cancelarMovimentacao`, para `ENTRADA_COMPRA` com `recebimento_id`:
1. o claim (`cancelado = 1`) continua **fora** da trava, onde está (é o que ordena dois estornos da mesma movimentação; os caminhos de claim
   perdido não têm mais nada a recriar);
2. a pré-checagem da linha do lote e `liberarParaEstorno` passam para o **começo da seção** (`trava.naTravaDoMaterial`, Etapa 118), dentro
   do `try` dela: recusa da pré-checagem desfaz o claim (mesma literal, mesmo 400);
3. o `catch` de dentro da seção, depois de desfazer efeitos e claim, **recria** as reservas soltas (`recriarReservasDoEstorno` —
   `criarReserva` usa `naTravaDoMaterial`, que dentro da seção que segura o material roda direto; `recriarReservaDaOs` idem) e zera a lista;
4. o recálculo das requisições continua **fora** (pega `comLockDosMateriais` — a trava não é reentrante), no `catch` de fora e no caminho
   de sucesso, como hoje.

Descartado: (a) uma seção curta só para a conta, antes do claim (a liberação do lote caberia entre ela e a seção do efeito: o estorno solta,
a liberação distribui o livre para quem acabou de perder a reserva, o débito recusa); (b) pôr o claim também dentro da seção (muda a ordem
de dois estornos e a régua "nota viva" da 247 sem ganho — o claim é só a marca); (c) recálculo dentro da seção (deadlock: `comLockDosMateriais`
do mesmo material).

## Fase 2 (revisor fresco, 18/11) — 6 achados, aplicados

1. (Importante) o `[Fase 5]` "outro estorno ganha o claim enquanto este liberava" de `recebimentoReservaChegadaEstorno.api.test.js`
   descrevia uma ordem que deixa de existir (a liberação depois do claim): o trigger não mudava nada e o estorno concluía 200. **A RN-248.05
   dizia "coberto pelas suítes existentes, inalterado" — estava errado.** O cenário foi reescrito: o outro estorno grava o claim **antes**
   → 400 *"Movimentação já cancelada"* e a reserva da chegada intacta (mesmo id; nada solto, nada recriado).
2. (Importante) depois da RN-248.01 a resposta da liberação (`reservado_para_quem_esperava`) e o aviso ao solicitante (rodam depois de
   soltar a trava) prometiam os 4 que o estorno acabara de soltar → **RN-248.06**: os dois releem as reservas (`resultadoDePe`: só
   `ATIVA`/`CONSUMIDA`, até a quantidade de agora). Medido vermelho (resposta `{4, PC, 1}`) antes do conserto.
3. (Importante) "zera a lista": só `liberadasNoEstorno`; `requisicoesDoEstorno` fica para o recálculo de fora; a recriação de fora fica
   como reserva (se o desfazer de dentro falhar). Chamadas pelo objeto do módulo.
4. (Menor) a recusa da pré-checagem do lote agora grava e desfaz o claim: um segundo estorno da mesma movimentação nessa janela ouve
   *"Movimentação já cancelada"* em vez da frase do lote → letra B (**B1566**).
5. (Menor, anterior) `liberarParaEstorno` que lança no meio perde a reserva da OS já solta (o `catch` engole e devolve `[]`) — não muda;
   registrado em D.
6. (Importante, docs) CLAUDE.md, o comentário da seção do estorno e os docs de `liberarParaEstorno`/`liberarReservaDaOsParaEstorno` diziam
   "fora da trava" → corrigidos dizendo que estavam errados desde a 248.

- **RN-248.06** (Fase 2, achado 2) depois da RN-248.01: a resposta da liberação diz `{0, PC, 0}` e nenhum aviso `LOTE_LIBERADO` sai para
  R1; a metade positiva: a liberação do L2 (nota B) avisa R1.

## Tasks

- [x] **T1 (tronco)** — (hash no fechamento) testes RN-248.01..04 e .06 em `server/tests/api/estornoNotaSobTrava.api.test.js` (vermelhos: 0/4 no código anterior) +
  conserto em `stockService.cancelarMovimentacao`. Controle positivo: sabotar (1) a conta de volta para antes do claim, (2) a recriação de
  volta para o `catch` de fora — cada uma derruba o cenário que a guarda.
- [ ] **T2** — Fase 5 (revisor adversarial fresco com sonda executada) e correções com teste próprio.
- [ ] **T3** — fechamento (fechar-etapa sem 7½ e 8).

## Pontos de atenção

- A trava não é reentrante: nada dentro da seção pode chamar `recalcularStatusSobTrava`/`comLockDosMateriais` do mesmo material.
- `liberarReserva` → `registrarMovimentacao` (`naTravaDoMaterial`: passa direto); alerta adiado (`adiarParaDepoisDaSecao`).
- Quem chama `cancelarMovimentacao` (rota, EPI, retalho, terceiros) não está dentro de seção (CLAUDE.md: proibido); a mudança só afeta a
  `ENTRADA_COMPRA` com recebimento.
