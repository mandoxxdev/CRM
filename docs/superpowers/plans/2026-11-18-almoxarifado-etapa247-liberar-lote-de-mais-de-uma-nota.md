# Etapa 247 — liberar lote que veio de mais de uma nota: a reserva repartida por nota (C524, B1467)

> Item 11 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h15, motor/estorno).
> Ponto de partida: a "Próxima tarefa detalhada" do plano da 246; Etapas 220 (liberar o lote reserva para quem esperava) e 228 (o estorno
> da entrada boa solta a reserva coberta só por lote bloqueado). **Estimativa não revisada:** a sonda da Fase 0 confirmou o defeito.

## Fase 0 — medido (sonda executada pela rota, 18/11)

Material com lote e certificado; R1 espera 8; nota A (4 em L1) e nota B (4 em L1) — L1 nasce bloqueado (sem certificado). `PUT
/lotes/:id/status` ATIVO → 200, `reservado_para_quem_esperava` `{8, PC, 1}`; **uma reserva de 8 com `recebimento_id` null**. Estornar B
(`POST /movimentacoes/:id/cancelar`) → **400** *"Não é possível estornar: o material está reservado para requisições (REQ-S1) — libere as
reservas antes de estornar"*; estornar A → o mesmo 400. A C524 está certa.

- Onde: `reservaChegadaService.js` `reservarLoteLiberadoSobTrava` — `recebimentoId` só quando o lote veio de uma nota (lido de
  `recebimentos_material_itens_almoxarifado.lote_id`, que **não** sabe se a nota foi estornada: lote de A estornada + B também ia sem marca).
- O estorno (`liberarParaEstorno`, Etapa 74/228) só solta reserva ATIVA de origem REQUISICAO com `recebimento_id` = a própria nota, de
  requisição que espera e não separou nada, e só o que falta para o estorno caber. **Marcar a mais é inofensivo** (ele solta só o que
  falta); marcar a menos trava o estorno.
- A conversão da reserva da OS (Etapa 230) já anda nota a nota (molde) — não muda.

## Regras de negócio

- **RN-247.01** Lote L1 com A (4) e B (4), bloqueado, R1 espera 8 → liberar o lote: R1 fica com **duas** reservas, 4 com a marca de B e 4
  com a de A (a nota mais nova primeiro); a resposta continua `{8, PC, 1}`.
- **RN-247.02** Depois do RN-247.01: estornar B → **200**, a reserva de B sai, a de A (4) fica, R1 volta a esperar; estornar A → **200**.
- **RN-247.03** Fila menor que o lote (R1 espera 5): B leva 4, A leva 1. Estornar A → 200 (solta 1); o estorno de B solta só o que falta.
- **RN-247.04** A nota já estornada não conta: A (4) e B (4) em L1 bloqueado, estornar A (lote ainda bloqueado), liberar → a reserva de R1
  (4) leva a marca de B e o aviso cita o recebimento de B (lote de **uma** nota viva). Estornar B depois → 200.
- **RN-247.05** Lote com a nota A (4) e uma entrada avulsa (4) em L1, R1 espera 8 → liberar: as 8 com a marca de A (a sobra que não é de
  nota nenhuma vai para a nota mais antiga — como a 220 fazia com o lote de uma nota só). Estornar A → 200.
- **RN-247.06** (regressão) a reserva da OS por nota (Etapa 230, RN-230.18/19) não muda; a parte convertida para a OS desconta da cota da
  nota de onde veio.
- **RN-247.07** (fatia visível) A tela **Reservas** mostra, na coluna Origem / Destino, *"Recebimento ⟨REC-…⟩ · NF ⟨…⟩"* na reserva que
  tem a marca de uma nota (a chegada, a inspeção, a liberação do lote); a reserva sem nota não mostra nada novo. Campo novo de leitura no
  `GET /almoxarifado/reservas`: `recebimento_numero`, `recebimento_nota_fiscal` (aditivos, `null` sem nota).
- **RN-247.05 c** (Fase 2, achado 1a) A e C no lote, R1 (4) leva a de C; bloqueado e liberado de novo para R2 (4): a cota de C já
  está reservada → R2 leva a de A; estornar A → 200.
- **RN-247.09** (Fase 2, achado 1b) B da OS deixa 4 em reserva da OS sobre L1 (marca B), A geral 4, R1 geral espera 8 → R1 leva 4 com a
  marca de A; estornar A → 200.
- **RN-247.10** (Fase 2, achado 2) A aprovada na inspeção e B (a mais nova) ainda em inspeção no lote: a parte em inspeção não conta na
  cota de B → R1 leva 4 com a marca de A; estornar A → 200. **RN-247.10 b**: B com reprovado nunca se estorna (Etapa 71) e fica sem cota.
- **RN-247.11** (Fase 2, achado 3) com o claim do estorno de A gravado e ainda não concluído (`cancelado = 1`, sem
  `movimento_estorno_id`), A conta como viva.
- **RN-247.08** (integração, o gesto seguinte) Depois do RN-247.01: separar 8 e entregar 8 de R1 consome as duas reservas (nenhuma fica
  ATIVA) e o lote L1 fica com 0.

## Contratos

- `PUT /lotes/:id/status`, `PUT /lotes/:id/liberar-vencimento`, `POST /lotes/:id/certificado`, `PUT /lotes/:id/validade`: **resposta
  inalterada** (`reservado_para_quem_esperava` soma as reservas e conta requisições — repartir não muda a soma).
- `POST /movimentacoes/:id/cancelar`: inalterado; a recusa continua *"Não é possível estornar: o material está reservado para requisições
  (⟨REQ-…⟩) — libere as reservas antes de estornar"* nos casos que sobram (ver D).
- `GET /almoxarifado/reservas`: + `recebimento_numero` (string|null), `recebimento_nota_fiscal` (string|null). Fixture
  `client/src/components/almoxarifado/__fixtures__/reservaDaNotaDoServidor.json`, conferida pelo teste do servidor (chaves = as da rota;
  `CRM_GRAVAR_FIXTURE=1` regrava).

## Desenho

`reservarLoteLiberadoSobTrava` (sob a trava do material, como hoje):
1. `notas` = as ENTRADA_COMPRA do lote cujo estorno **não concluiu** (`NOT estornoConcluidoSql`, a régua de `devolucaoViva.js`),
   por recebimento: quantidade, o que ainda está em inspeção e o que foi reprovado (pelos itens com `movimentacao_entrada_id`), ordenadas
   pela **última ENTRADA_COMPRA** (maior id) primeiro. ~~"sob a trava o claim do estorno não está no meio"~~ — **estava errado** (Fase 2,
   achado 3): o claim `cancelado = 1` é gravado fora da trava e volta a 0 se o estorno falhar.
2. A conversão da OS (230) itera as mesmas notas (antes: as do item da nota).
3. Cota de cada nota = entrada − em inspeção − **saldo das reservas ATIVAS com a marca dela** (qualquer origem: chegada, OS, conversão,
   liberação anterior); nota com reprovado: cota 0 (Fase 2, achados 1 e 2 — o desenho original descontava só o convertido).
   Repartição: `resta = livre - convertido`; para cada nota (mais nova primeiro) `teto = min(resta, cota)`, e a
   **última** (a mais antiga) leva `resta` inteiro; `distribuirSemLock(..., rotulos da nota)`; `resta -= usado`; se `usado < teto` a fila
   acabou (para). Sem nota nenhuma: uma chamada sem marca (como hoje).
4. Aviso: `recebimento_id` só com uma nota (como hoje, agora contando só as vivas).

Descartado: (a) o estorno soltar também a reserva sem marca da liberação do lote (mexe na conta do estorno — é o item 12, e soltaria reserva
de outra nota); (b) repartir proporcionalmente (o estorno da nota nunca teria a cota inteira); (c) a nota mais antiga primeiro (a nota
recém-chegada é a que mais se estorna — erro de lançamento — e é a que precisa da cota cheia).

## Fase 2 (revisor fresco, 18/11) — 7 achados, todos aplicados ao plano

1. (Crítico) a cota ignorava o que já está reservado com a marca da nota (2ª liberação; sobra da reserva da OS) → cota desconta as
   reservas ATIVAS com a marca (RN-247.05 c, RN-247.09). 2. (Crítico) a cota contava o que está em inspeção/reprovado → desconta
   (RN-247.10, .10 b). 3. (Crítico) `cancelado = 0` como "viva" estava errado (claim fora da trava) → régua de `devolucaoViva.js`
   (RN-247.11). 4. (Importante) o RN-230.18 afirmava a reserva de R2 sem marca → agora com a marca de B (não a de A, a da OS).
   5. (Importante) faltava a lista do que continua recusado → seção D abaixo; sem NF a tela mostra só o recebimento. 6. (Menor) ordem pelo
   id do recebimento → pela última ENTRADA_COMPRA. 7. (Menor) marca a mais entre lotes → limitação D.

## D — o que continua recusado no estorno da nota (mensagens literais, inalteradas)

- Nota com parte em inspeção: *"Esta entrada tem ⟨n⟩ ⟨un⟩ em inspeção — decida a inspeção antes de estornar a entrada"*.
- Nota com reprovado: *"Esta entrada teve ⟨n⟩ ⟨un⟩ reprovado(s) na inspeção — o reprovado sai pela não conformidade; esta entrada não
  pode ser estornada"*.
- Requisição que já separou alguma coisa, peças do lote que já saíram (a cota da nota mais antiga fica curta), ou a marca usada por outro
  lote da mesma nota: *"Não é possível estornar: o material está reservado para requisições (⟨REQ-…⟩) — libere as reservas antes de
  estornar"*. A marca não diz o lote: a marca da nota no L1 também serve ao estorno do movimento dela no L2 (solta só o que falta, mas pode
  soltar a reserva de outra requisição).

## Tasks

- [ ] **T1 (tronco)** testes RN-247.01..06 e .08 em `server/tests/api/liberarLoteDeDuasNotas.api.test.js` (vermelhos) + conserto em
  `reservaChegadaService.js`; o `[RN-220.14 b]` (afirmava a reserva **sem** marca — C524) passa a afirmar a repartição. Controle positivo
  (sabotagem da ordem e da cota).
- [ ] **T2 (galho, depois de T1 só por arquivo)** RN-247.07: `reservationService.listarReservas` + teste de rota/fixture + tela
  `ReservasAlmoxarifado.js` + teste Jest com a fixture.
- [ ] **T3** integração: RN-247.08 (pela rota) e um cenário pelo serviço (`reservarLoteLiberadoSobTrava` direto, sob a trava).
- [ ] **T4** Fase 5 (revisor adversarial com sonda) e correções com teste próprio.
- [ ] **T5** fechamento (fechar-etapa sem 7½ e 8).

## Pontos de atenção

- Trava: a liberação já roda sob a trava do material (`trava.travado`); `distribuirSemLock` não pega trava; nada novo de trava.
- Item 12 (C525 + C534, o estorno sob a trava) mexe em `liberarParaEstorno` — não tocar aqui.
