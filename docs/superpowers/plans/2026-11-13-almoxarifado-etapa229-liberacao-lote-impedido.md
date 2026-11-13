# Etapa 229 — a inspeção e a não conformidade olham o lote do item que liberaram (C519)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa228-estorno-lote-impedido.md` (`:243-266`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-liberacao-lote-impedido.txt` (**4h**, `23076563`). Números de linha
> medidos hoje sobre `9384951f`.

## Objetivo (em linguagem simples)

Uma nota traz 4 peças de um material crítico num lote que nasce **bloqueado** (o certificado do fornecedor não foi anexado). As peças
ficam retidas para inspeção. Enquanto isso, entram 4 peças avulsas do mesmo material (um ajuste, uma devolução) — livres, ninguém as
reserva (a entrada manual não distribui, D4 da 74). A requisição R1 espera 4. A inspeção aprova as 4 do lote bloqueado. Hoje a liberação
reserva para R1 as 4 **avulsas**, no lugar das aprovadas (que não podem sair até o lote ser liberado). Depois desta etapa a liberação vê
que o lote do item continua impedido e **não reserva nada no lugar**; as peças aprovadas vão para quem espera quando o lote for liberado
(Etapa 220). A tela da inspeção avisa que o lote continua impedido.

## Fase 0 — medido em 2026-11-13 (sobre `9384951f`)

1. **Onde.** `reservaChegadaService.reservarLiberacaoParaQuemEspera` (`reservaChegadaService.js:591-631`): lê `disponivelSql()` do material
   (`:598`), `teto = min(quantidade, disponivel)` (`:603`); com a OS aberta do recebimento vai para `distribuirParaOs` (`:611-614`); senão
   `distribuirSemLock(teto)` (`:616`), cujo miolo já limita pelo que pode sair do material (`disponivel − loteImpedido`, B1453 da 219).
2. **Quem chama.** `inspectionService.decidirInspecao` (`:437-445`): `ctx` = `{ origem: 'INSPECAO', documento_id, documento_numero: null,
   material_id, quantidade: aprovada, recebimento_id }`; o item (`:197`, `SELECT *`) tem `lote_id`. `nonConformityService.decidir…`
   (`:1006-1014`): `ctx` com `recebimento_id: atual.recebimento_id || insp?.recebimento_id`; `insp` (`getInspecao`, `:346`) já traz
   `ri.lote_id`. Os dois com `{ sobTrava: true, pendencia }` (Etapa 91): a leitura do lote acontece dentro da seção do material.
   `osEncerradaService.js:92` — sem lote (a fila geral; RN-219.05), não muda.
3. **A régua pronta.** `loteImpedidoAgora(db, loteId)` (`reservaChegadaService.js:637`, Etapa 220): `predicadoLoteImpedidoSql('lt')` só em
   material com `controle_lote = 1`. Mudar o status do lote pega a trava do material desde a 220 (C523): ler sob a seção serializa com o
   bloqueio/liberação.
4. **O aviso.** `aposLiberacaoSemFalhar` com `sobTrava` empurra `{ ctx, resultado }` para `pendencia.avisos`; `avisarLiberacao`
   (`receiptNotificationService.js:459`) manda *"Material liberado"* a quem espera se `reservado > 0` **ou** há livre que pode sair do
   material (`haLivre`, B1457 c). Com as 4 avulsas livres, R1 seria avisada de uma liberação que não lhe deu nada — mesmo depois da
   correção do teto.
5. **A resposta da inspeção.** `{ id, quantidade_aprovada, quantidade_reprovada, divergencia_dimensional, divergencia_quantidade,
   medidas_registradas }` — as chaves estão congeladas por `inspecaoReservaLiberacao.api.test.js:175,286` (`CHAVES_RESPOSTA`, D5 da 75).
6. **A tela.** `InspecoesAlmoxarifado.js:284-292`: depois do `POST`, `toast.success('Inspeção registrada!')` (ou com as medidas).

## Caminhos

- **(escolhido)** O `ctx` ganha `lote_id`; dentro da seção, **sem OS aberta**, se `loteImpedidoAgora(lote_id)` → não distribui, e o
  resultado leva `lote_impedido: { id, codigo }`. O aviso não sai quando o resultado traz `lote_impedido`. A resposta da inspeção ganha a
  chave `lote_impedido` (o código) **só** nesse caso; a tela mostra um aviso. Reverter = tirar o `if` e a chave.
- **(descartado)** Teto = `min(quantidade, disponivel − loteImpedido do material)`: é o que o miolo já faz (B1453) e não resolve — o
  livre avulso está fora do impedido.
- **(descartado)** Limitar o teto ao **livre do lote** do item (`situacaoDosLotes`): com o lote impedido o livre "que pode sair" do lote é
  0 de qualquer forma; com o lote bom daria um teto menor que hoje quando o lote já foi consumido em parte por outra saída — mudança de
  comportamento sem cenário pedindo. Fica a régua binária (impedido → 0).

## Decisões (letra B — reversíveis; livres depois de **B1508**, **C534**, conferido por `grep` em `docs` e `specs`)

- **B1509 — o teto zera com o lote do item impedido agora.** Inspeção e NC passam o `lote_id` do item do recebimento; sem OS aberta, com
  o lote impedido **agora** (lido sob a trava, `loteImpedidoAgora`: bloqueado, reprovado ou vencido sem liberação, só com
  `controle_lote = 1`), a liberação não reserva nada para a fila geral. Sem `lote_id` no `ctx` (item sem lote, a OS encerrada), com o
  lote bom ou com o material sem controle de lote (B1371): como hoje. Descartados: os dois de "Caminhos".
- **B1510 — a OS aberta fica como está.** Com OS aberta no recebimento, a liberação continua indo para a fila da OS e a reserva da OS com
  o teto de hoje — o mesmo da nota (B1455, C520). Descartado: zerar também na OS (mudaria a regra da 171 sem a C520 decidida).
- **B1511 — o aviso não sai quando o lote zerou o teto.** Com `lote_impedido` no resultado, `avisarLiberacao` não manda *"Material
  liberado"* a ninguém, mesmo havendo livre de outra entrada (B1457 c falava do livre do material; aqui a liberação não liberou nada que
  possa sair). Quem espera é avisado quando o lote for liberado (Etapa 220, `LOTE_LIBERADO`). Descartado: manter o `haLivre` (prometeria
  ao solicitante o que a liberação não deu).
- **B1512 — a fatia visível: a tela da inspeção avisa.** A resposta do `POST /recebimentos/itens/:id/inspecionar` ganha
  `lote_impedido: '<código do lote>'` **só** quando a parte aprovada caiu num lote impedido e o teto zerou (sem a chave nos outros casos —
  as chaves de hoje estão congeladas pela D5 da 75). A tela mostra, além do *"Inspeção registrada!"*, o aviso amarelo (literal no
  contrato). A NC não ganha aviso de tela (a resposta dela é a NC inteira; fica para quando houver pedido). Descartado: a chave sempre
  presente com `null` (quebraria a D5 da 75 e o teste que a congela).

### Fora (C novo)

- **C535** — a NC que aceita não diz na tela que o lote do item continua impedido (B1512).

### Limitações (D (229), da Fase 2)

1. **O lote que nunca é liberado (achado 2).** Com L1 bloqueado e 4 livres em L0, R1 espera. Se L1 vira *Reprovado* de vez (ou fica vencido),
   nenhum gesto automático dá a R1 as 4 de L0 — a entrada manual não distribui (D4 da 74), e antes desta etapa a inspeção as dava. R1 é
   atendida por uma reserva manual, por uma nota nova ou pela liberação do lote. O e-mail *"Material liberado"* que o livre de L0 provocava
   também some (B1511).
2. **Item antigo só com o código do lote (Minor).** Item da nota com `lote` (texto) e sem `lote_id` (antes da Etapa 6): a liberação faz como
   antes (sem `lote_id` no `ctx`). A execução da NC resolve o lote também pelo código; a liberação não — divergência declarada.
3. **Lote de outro material (Minor).** `ctx.lote_id` de lote de outro material (dado sujo) é ignorado: a consulta exige `lt.material_id` do
   material liberado.

## Regras de negócio

Montagem padrão (molde da RN-219.04 de `chegadaLoteImpedido.api.test.js`): material **crítico**, `controle_lote = 1`,
`controle_certificado = 1`, `PC`, `inspecao_material_critico = 1`; R1 aprovada e esperando 4 (sem saldo); a nota (`/processar`) traz 4 em
L1, que nasce **BLOQUEADO** (sem certificado) e fica retida para inspeção; depois, **4 PC manuais em L0** (ATIVO; a entrada manual não
distribui — premissa conferida: R1 continua sem reserva).

- **RN-229.01 — a inspeção aprova as 4 de L1 bloqueado: nada no lugar.** `POST /inspecionar` 4/0 → **201**; R1 **sem reserva** e no
  status de espera; a resposta traz `lote_impedido: 'L1'`; nenhum aviso de liberação (`origem: 'INSPECAO'`) para R1. (Antes: R1 com 4
  reservadas do L0.)
- **RN-229.02 — controle: L1 ativo.** Material com `controle_certificado = 0` (L1 nasce ATIVO), o resto igual → R1 com **4** reservadas;
  a resposta **sem** a chave `lote_impedido` (as chaves de `CHAVES_RESPOSTA`).
- **RN-229.03 — a NC que aceita, lote do item impedido.** Mesma montagem, mas com R1 esperando e a inspeção 0/4 (reprova as 4, NC aberta
  automaticamente); depois 4 manuais em L0; `POST /nao-conformidades/:id/decidir` `ACEITAR` → **200**, efeito `LIBERADA`; R1 **sem
  reserva**; nenhum aviso `origem: 'NAO_CONFORMIDADE'`. Controle: `controle_certificado = 0` → R1 com 4.
- **RN-229.04 — vencido conta; vencimento liberado não.** Material crítico sem certificado; antes da inspeção, `data_validade` de L1 =
  ontem (Brasília) → como a .01 (nada; `lote_impedido: 'L1'`); com `vencimento_liberado_em` preenchido → como a .02 (4).
- **RN-229.05 — sem controle de lote nada muda.** `controle_lote = 0`, `controle_certificado = 1` (L1 fica BLOQUEADO mas o material não
  controla lote — B1371) → R1 com 4, sem a chave.
- **RN-229.06 — OS aberta como hoje (B1510; congela o C520 — quem resolver o C520 edita este teste de propósito).** Nota com `os_id` de OS aberta, R1 da OS esperando 4, L1 BLOQUEADO, 4 manuais em L0 →
  inspeção 4/0: o resultado igual ao de antes desta etapa (medido no RED: o teste registra o número de hoje e exige o mesmo), sem a chave.
- **RN-229.07 — serviço: sem `lote_id` no ctx é como hoje.** `reservarLiberacaoParaQuemEspera` direto (sem `lote_id`), material com L1
  BLOQUEADO e 4 em L0, R1 esperando 4 → reserva 4 (a OS encerrada, RN-219.05 controle); com `lote_id` do L1 → nenhuma, e
  `resultado.lote_impedido` = `{ id, codigo: 'L1' }`.
- **RN-229.08 — integração: liberar o lote atende R1.** Depois da .01, `PUT /lotes/:id/status` L1 → ATIVO (com justificativa) → a
  liberação do lote (Etapa 220) reserva **4** para R1; R1 `TOTALMENTE_RESERVADA`; separar 4 de R1 → 200.
- **RN-229.09 — trava: o lote liberado no meio vale.** O status de L1 muda para ATIVO **antes** de a inspeção entrar na seção (gesto
  disparado do contexto do teste, gancho só sinalizando — molde do CLAUDE.md): a inspeção lê o lote já ativo → reserva 4. Se o bloqueio
  chega depois da seção, a inspeção já reservou (a régua de hoje). *(Cobre que a leitura é dentro da seção; ver Task 1.)*
- **RN-229.09b — a leitura é dentro da seção (Fase 2, achado 1).** O teste segura a trava do material; o `PUT` L1 → ATIVO entra na fila
  **antes** da inspeção, cujas leituras de antes da trava (o item, as medidas) veem L1 BLOQUEADO; ao soltar, o `PUT` roda primeiro (fila
  por material, FIFO) e a inspeção lê ATIVO → reserva **4**, sem a chave. Lida antes da seção, a inspeção daria 0 (sabotagem S9).
- **RN-229.10 — regressão.** `chegadaLoteImpedido`, `inspecaoReservaLiberacao*`, `ncReservaLiberacao*`, `reservaLiberacao*`,
  `liberarLote*` verdes **sem edição**.

## Contrato (congelado)

- `reservaChegadaService.reservarLiberacaoParaQuemEspera(db, user, ctx, resultado, opcoes)` — `ctx.lote_id` (opcional, inteiro). Retorno:
  `{ reservas, status }` como hoje; **mais** `lote_impedido: { id, codigo }` só quando, sem OS aberta, `ctx.lote_id` aponta para lote
  impedido agora de material com controle de lote (e então `reservas` vazio).
- `receiptNotificationService.avisarLiberacao(db, user, ctx, resultadoReserva)` — a chave desligada continua primeiro (`{ desligado: true }`);
  ligada, com `resultadoReserva.lote_impedido` devolve `{ requisitantes: [] }` sem enfileirar (Fase 2, achado 3).
- `POST /api/almoxarifado/recebimentos/itens/:itemId/inspecionar` — **201**, as chaves de hoje **mais** `lote_impedido: '<codigo>'` só no
  caso acima. Recusas inalteradas.
- `POST /api/almoxarifado/nao-conformidades/:id/decidir` — resposta inalterada.
- Tela (`InspecoesAlmoxarifado.js`): com `res.data.lote_impedido`, além do `toast.success` de hoje,
  `toast.warn('O lote <codigo> continua bloqueado, reprovado ou vencido: as peças aprovadas vão para quem espera quando o lote for liberado.')`.

## Tasks

Tudo é **tronco** (uma porta do motor + a tela que lê a chave nova). Sem galhos paralelos: a tela é uma linha contra o contrato congelado.

- [ ] **T1 (tronco)** — teste `server/tests/api/liberacaoLoteImpedido.api.test.js` (RN-229.01 a .09) em RED; `ctx.lote_id` nas duas portas;
  o `if` em `reservarLiberacaoParaQuemEspera`; o `return` cedo em `avisarLiberacao`; a chave na resposta da inspeção. Controle positivo e
  sabotagens (tirar o `if`; ler o lote fora da seção / sem `controle_lote`; tirar o `return` do aviso; tirar o `lote_id` de cada porta).
- [ ] **T2 (tela)** — `InspecoesAlmoxarifado.js` + teste em `InspecoesAlmoxarifado.test.js` (com e sem a chave), sabotagem.
- [ ] **T3** — suítes serial (test:api, test:almoxarifado, test:validation, test:safealter, test:sqlite, cliente, build).
- [ ] **Fase 5** — revisão adversarial (regra/trava; testes).
- [ ] **Fechamento** (`fechar-etapa`, sem o Passo 7½ e o 8).
