# Etapa 230 — a fila da OS aberta recebe só o que pode sair (C520)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa229-liberacao-lote-impedido.md` (`:160-180`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-os-aberta-lote-impedido.txt` (**4h**, `240eb83b`). Números de linha
> medidos hoje sobre `60393569`.

## Objetivo (em linguagem simples)

A OS 500 comprou 4 peças. A nota chega com as 4 num lote que nasce **bloqueado** (sem o certificado). A requisição R1, da OS 500, esperava
4. Hoje R1 fica *Totalmente reservada* com as 4 bloqueadas — e a separação e a entrega recusam (Etapa 206). Depois desta etapa R1 continua
esperando; as 4 ficam na **reserva da OS** (a posse é da OS) e, quando o lote for liberado, passam para R1.

## Fase 0 — medido em 2026-11-13 (sobre `60393569`)

1. **A nota.** `reservaChegadaService.reservarChegadaParaQuemEspera` (`:233-305`): com OS aberta (`osAbertaDoRecebimento`, lida dentro da
   seção), `livre = livreTotal` (`:271-273` — não tira o item em lote impedido, B1455) e `distribuirParaOs(livre − ja)` (`:276-280`; `ja` =
   o que a nota já reservou para a OS, I3 da 171).
2. **A liberação (inspeção/NC).** `reservarLiberacaoParaQuemEspera` (`:592-640`): o ramo `if (os)` (`:611-615`) vem **antes** do lote do
   item (B1510) — `distribuirParaOs(teto)`.
3. **O miolo da OS.** `distribuirParaOs` (`:509-528`): `distribuirSemLock(teto, { filtro: da OS, semDescontoDoLote: true })`; o resto
   (`teto − usado`) vira a reserva da OS (`reservaDaOs.reservarParaOsSobTrava`, teto pelo livre de caixa). O `semDescontoDoLote`
   (`:406-412`) só existe para isto.
4. **A liberação do lote** (Etapa 220). `reservarLoteLiberadoSobTrava` (`:687-718`): fila **geral** com teto = livre do lote; o miolo
   limita pelo que pode sair (`disponivel − loteImpedido`). A reserva da OS que segura as peças do lote está no `reservado`: o disponível
   não as vê. **Sem mudança aqui, R1 nunca recebe as peças** (só a aprovação converte a reserva da OS, `requisitionService.converterReservasDaOs`
   — R1 já foi aprovada). É o "pior que hoje" da B1455; a C480 (liberar o lote não distribuía) foi resolvida na 220, então agora há onde
   converter.
5. **O estorno** (`liberarParaEstorno`, `:780-880`). A B1508 volta à régua de antes (`livre = disp`) na nota com OS porque a fila da OS
   reservava **sem** o desconto. Com esta etapa a fila da OS desconta: a exceção perde a razão e, mantida, deixa a requisição da OS
   reservada só com peça bloqueada depois do estorno do lote bom (RN-228.11: R1 com 2, físico 5 todo em L1 bloqueado).
6. **A aprovação** (Etapa 205, B1381) já faz a mesma divisão: o que da reserva da OS cabe no lote impedido fica para a OS; a requisição da OS
   pega o que pode sair. Esta etapa leva a mesma régua às portas que distribuem.
7. **C522** (a reserva da OS sobre o bloqueado segura a nota boa seguinte): o total reservado sobre o lote bloqueado é o mesmo (antes na
   requisição da OS, agora na reserva da OS) — a conta da B1460 dá o mesmo número. Não muda; um cenário prova (RN-230.10).
8. **A tela.** Sem código novo: o aviso da inspeção (Etapa 229, `lote_impedido` na resposta) passa a sair também na OS aberta; o aviso do
   lote liberado (`reservado_para_quem_esperava`, Etapa 220) passa a contar o que foi para a requisição da OS.

## Caminhos

- **(escolhido)** A fila da OS desconta o lote (sai o `semDescontoDoLote`) e recebe só o que **esta** entrada trouxe fora de lote impedido
  (a nota: `livreForaDeLoteImpedido`; a liberação: 0 com o lote do item impedido); o resto do teto de hoje continua indo para a reserva da
  OS. Liberar o lote passa a reserva da OS **daquela nota** para a fila da OS que espera, antes da fila geral. O estorno perde a exceção
  B1508. Reverter = devolver a opção `semDescontoDoLote`, o `if (os)` antes do lote e a exceção do estorno.
- **(descartado)** Só tirar o `semDescontoDoLote` (teto da fila = o teto inteiro, limitado pelo que pode sair do **material**): com saldo
  avulso bom de outra entrada, a fila da OS levaria o avulso no lugar das peças bloqueadas (o caso da B1454/C519, na OS).
- **(descartado)** Mandar a parte bloqueada para nenhum lugar (sem reserva da OS): a peça comprada para a OS ficaria livre e outra requisição
  a pegaria quando o lote fosse liberado (B1455).
- **(descartado)** Converter na liberação do lote **todas** as reservas da OS do material (não só as da nota do lote): a reserva da OS de
  outra nota está sobre outro lote; convertê-la daria a R1 peça que pode estar bloqueada.

## Decisões (letra B — reversíveis; livres depois de **B1512**, **C535**)

- **B1513 — a fila da OS aberta recebe só o que pode sair.** Na nota com OS aberta, a fila da OS tem teto = o que a nota trouxe fora de lote
  impedido (menos o que ela já reservou para a OS, I3) e o desconto do lote do material (como a fila geral); o resto do teto de antes
  (`livre − ja`) vai para a reserva da OS, como antes. Na inspeção/NC com OS aberta e o lote do item impedido agora, a fila da OS tem teto 0
  e a liberação inteira vai para a reserva da OS; a resposta da inspeção traz `lote_impedido` (o aviso da 229 sai também na OS). Material
  sem controle de lote: como antes (B1371). Revoga a B1455 e a B1510.
- **B1514 — liberar o lote passa a reserva da OS para a requisição da OS.** Na liberação do lote (Etapa 220), para cada nota que pôs peças no
  lote (Fase 5: também no lote de várias notas — o plano dizia "se o lote veio de **uma** nota só", e **estava errado**: deixava a requisição
  da OS sem as peças, pior que antes) e tem OS **aberta**, a reserva da OS dessa nota e desse material é solta até `mín(livre do lote, saldo dela, a falta
  da fila da OS)` e o solto vai para a fila da OS (o miolo, com o filtro da OS); o que a fila não levar (regra do dono, valor) volta a ser
  reserva da OS. Depois, a fila geral como antes. Sem requisição da OS esperando, a reserva da OS não é tocada (nada é solto e recriado).
  Motivo da liberação da reserva da OS: *"Reserva da OS ⟨numero⟩ passada à requisição da OS na liberação do lote ⟨codigo⟩"*.
- **B1515 — o estorno perde a exceção da OS.** A B1508 (nota com OS: a régua de antes) sai: a fila da OS agora reserva com o desconto, e a
  exceção deixava a requisição da OS reservada só com peça bloqueada depois do estorno do lote bom. A reserva da OS continua solta
  primeiro (`mín(reserva, estornado)`, 171). Revoga a B1508.
- **B1516 (Fase 2, achados 1 e 2) — a fila da OS tem o abono da aprovação.** No miolo, só para a fila da OS: o que pode sair ganha
  `mín(lote impedido do material, reservas da OS ATIVAS desta OS e deste material)` — a regra da aprovação (B1381): a reserva da OS é da
  mesma dona e conta como estando no lote impedido. Sem isto a reserva da OS sobre um lote ainda bloqueado contava duas vezes (no reservado e
  no impedido, a conta da B1460/C522) e a requisição da OS não recebia nem o lote liberado (dois lotes bloqueados da mesma nota, RN-230.14) nem
  a nota boa seguinte da mesma OS (RN-230.15). Descartado: criar a reserva da requisição direto, sem o miolo (pularia a regra do dono, o valor
  e a releitura da falta).

### Limitações (D (230))

1. ~~**Lote de várias notas.**~~ *(Resolvida na Fase 5, `de2bd342`: a conversão roda nota a nota.)* A reserva da OS não sabe o lote: a
   conversão pode passar uma reserva da OS que a nota fez sobre outro lote dela (as peças saem do lote liberado, que é bom).
2. **A OS fechada.** OS fechada quando o lote é liberado: nada é convertido (a reserva da OS já foi solta pelo encerramento da OS).
3. **Reservas de antes.** A requisição da OS reservada sobre lote bloqueado **antes** desta etapa continua como está (não há migração); o
   estorno do lote bom a solta pela régua nova (B1515).
4. **Retomada da nota (Fase 2, achado 3).** Na retomada (I3), `tetoFila = livre fora de impedido − ja`, e o `ja` inclui a reserva da OS
   feita com a parte bloqueada: erra para menos (a fila da OS recebe menos), nunca para mais. A retomada só acontece depois de uma falha
   anterior à distribuição.
5. **Requisição da OS barrada pelo dono ou pelo valor (Fase 2, achado 5).** A conversão solta a reserva da OS e, se a fila não levar, a
   recria (linha nova, observação *"Compra para a OS ⟨numero⟩ — não coube na requisição da OS na liberação do lote ⟨codigo⟩"*) — cada liberação de lote gera uma linha.
   Se a liberação da reserva falhar no meio, para e distribui só o que soltou.
6. **O abono pode dar à requisição da OS peça de outra nota.** O abono supõe que a reserva da OS está no lote impedido (a mesma suposição da
   aprovação, B1381). Com a reserva da OS sobre um lote **bom** e um lote impedido de outra origem, a fila da OS — limitada pelo que a
   entrada trouxe — pode ficar com peças cuja entrega sai do lote bom que a reserva da OS "segura". As duas são da mesma OS.

## Regras de negócio

Montagem padrão (molde da RN-219.07 de `chegadaLoteImpedido.api.test.js`): OS aberta (`ordens_servico`, `em_andamento`); material com
`controle_lote = 1`, `controle_certificado = 1` (o lote da nota nasce **BLOQUEADO**), não crítico (sem inspeção), `PC`; R1 da OS (`os_id` e
`os_referencia`) esperando, inserida direto (`AGUARDANDO_ESTOQUE`); a nota com `os_id` processada por `POST /recebimentos/:id/processar`.
"Reserva da OS" = reservas `ATIVA`, `origem = 'MANUAL'`, `os_id` da OS, do material.

- **RN-230.01 — nota com OS, 4 em L1 BLOQUEADO, R1 da OS espera 4 → R1 sem reserva; reserva da OS 4.** (Antes: R1 com 4. Muda de propósito
  a RN-219.07.) R1 continua `AGUARDANDO_ESTOQUE`.
- **RN-230.02 — nota com OS, 3 em L2 ATIVO + 4 em L1 BLOQUEADO (L1 com 1 manual antes, bloqueado), R1 da OS espera 4 → R1 com 3; reserva da
  OS 4.** (L2 nasce ativo: o lote já existente é bloqueado à mão; L2 de material com certificado — usar `controle_certificado = 0` e
  bloquear L1 antes, molde RN-228.11.)
- **RN-230.03 — o avulso bom não entra no lugar.** 4 manuais em L0 ATIVO antes; nota com OS, 4 em L1 BLOQUEADO; R1 da OS espera 4 → R1 sem
  reserva; reserva da OS 4. (Com o teto só pelo material, R1 levaria as 4 de L0 — o descartado 1.)
- **RN-230.04 — controle: lote ativo e material sem controle de lote.** (a) `controle_certificado = 0` (L1 ATIVO) → R1 com 4, reserva da OS
  0. (b) `controle_lote = 0` com `controle_certificado = 1` → R1 com 4 (B1371).
- **RN-230.05 — a inspeção de nota com OS, lote do item impedido → a fila da OS nada; a reserva da OS fica com o aprovado; a resposta traz
  `lote_impedido`.** Material **crítico** (`inspecao_material_critico = 1`), nota com OS, 4 em L1 BLOQUEADO retidas; 4 manuais em L0; R1 da
  OS espera 4; inspeção 4/0 → **201**, `lote_impedido: 'L1'`; R1 sem reserva; reserva da OS 4. (Muda de propósito a RN-229.06.) Controle:
  `controle_certificado = 0` → R1 com 4, sem a chave.
- **RN-230.06 — liberar o lote passa a reserva da OS para R1.** Depois da .01, `PUT /lotes/:id/status` L1 → `ATIVO` → **200**; R1 com **4**
  (`TOTALMENTE_RESERVADA`), reserva da OS **0**, a reserva de R1 com `recebimento_id` da nota; resposta
  `reservado_para_quem_esperava: { quantidade: 4, unidade: 'PC', requisicoes: 1 }`. A reserva da OS solta tem o motivo literal da B1514.
- **RN-230.07 — liberar o lote sem requisição da OS esperando não toca a reserva da OS.** Nota com OS, 4 em L1 BLOQUEADO, ninguém esperando
  → reserva da OS 4; liberar L1 → reserva da OS **4** (a mesma linha, `ATIVA`, nenhuma `LIBERACAO_RESERVA` dela); resposta com
  `quantidade: 0`. Uma R2 **sem OS** esperando 4 continua sem reserva (a peça é da OS).
- **RN-230.08 — conversão parcial.** Nota com OS, 4 em L1 BLOQUEADO, R1 da OS espera 2 e R2 sem OS espera 4 → reserva da OS 4; liberar L1 →
  R1 com 2, reserva da OS 2, R2 sem reserva.
- **RN-230.09 — o estorno sem a exceção (muda de propósito a RN-228.11 e a .16).** Nota com OS, 3 em L2 + 4 em L1 BLOQUEADO (1 manual em L1
  antes), R1 da OS espera 2 → R1 com 2, reserva da OS 5 (premissas iguais às de hoje); estornar a entrada de L2 → **200**; R1 **sem
  reserva** (o que sobra está todo em L1 bloqueado); reserva da OS 2. A .16 (OS só pelo pedido): o mesmo.
- **RN-230.10 — C522 não muda.** Depois da .01, uma nota **sem** OS traz 4 em L2 ATIVO e R2 (sem OS) esperava 4 → R2 sem reserva (como
  antes da etapa — a reserva da OS sobre o bloqueado conta, B1460).
- **RN-230.11 — integração (cruza nota, lote e separação).** Depois da .06, `POST /requisicoes/:id/separar` de R1 com 4 → **200**.
- **RN-230.12 — a conversão é sob a trava.** `reservarLoteLiberadoSobTrava` sem a trava do material → não converte (o `throw` de
  `erroSemTrava` é engolido pelo `try` dela, resultado vazio) — já coberto pela 220; aqui só se confere que a conversão roda **depois** do
  `travado` (sabotagem: mover a conversão para fora não é possível sem mudar a assinatura — não há teste novo de corrida; a leitura da OS e
  da reserva acontecem na mesma seção que o `UPDATE` do status do lote, como a fila geral da 220).
- **RN-230.08 b — a reserva da OS de outra nota não é convertida.** Nota A da OS com 4 em L1 BLOQUEADO, nota B da mesma OS com 3 em L2
  BLOQUEADO (reserva da OS 7), R1 da OS espera 6; liberar L2 → R1 com 3, reserva da OS 4 — a linha da nota A intacta (`ATIVA` 4), a da nota
  B `LIBERADA`. (Fase 2: com o miolo sem o abono, R1 ficava com 0.)
- **RN-230.14 (Fase 2) — dois lotes bloqueados da mesma nota.** Nota da OS com 4 em L1 e 4 em L3, ambos BLOQUEADOS, R1 da OS espera 8 →
  reserva da OS 8; liberar L1 → R1 com 4; liberar L3 → R1 com 8, reserva da OS 0.
- **RN-230.15 (Fase 2) — a nota boa seguinte da mesma OS.** Nota A da OS com 4 em L1 BLOQUEADO (reserva da OS 4); R1 da OS espera 4; nota B
  da mesma OS com 3 em L2 ATIVO → R1 com 3, reserva da OS 4.
- **RN-230.16 — a reserva antiga vale para a OS (B1456).** R0 (sem OS) aprovada com 4 de L1; L1 bloqueado depois; nota da OS com 4 em L2
  ATIVO; R1 da OS espera 4 → R1 sem reserva (a entrega de R0 sai do L2). Prova o desconto do lote na fila da OS.
- **RN-230.17 — a fila geral depois da conversão leva só o resto do lote.** L1 (1 manual + 4 da nota da OS) BLOQUEADO; R1 da OS espera 4, R2
  sem OS espera 4; 4 avulsas em L0; liberar L1 → R1 com 4, R2 com **1** (livre do lote 5 − 4 convertidas), não 4.
- **RN-230.13 — regressão.** `chegadaLoteImpedido` (salvo a .07), `liberacaoLoteImpedido` (salvo a .06), `estornoLoteImpedido` (salvo a .11 e
  a .16), `reservaDaOs*`, `requisicaoOsIdCasaReservaDaOs`, `liberarLote*`, `osEncerrada*` verdes.

## Contrato (congelado)

- `reservaChegadaService.distribuirParaOs(db, user, materialId, teto, rotulos, acc, os, tetoFila = teto)` — a fila da OS com
  `mín(tetoFila, teto)` e o desconto do lote; a reserva da OS com `teto − usado`. A opção `semDescontoDoLote` do miolo sai.
- `reservarLiberacaoParaQuemEspera` — com OS aberta e `ctx.lote_id` impedido agora: `tetoFila = 0` e `resultado.lote_impedido = { id, codigo }`;
  sem lote impedido: como antes.
- `reservarLoteLiberadoSobTrava(db, user, lote, pendencia)` — mesma assinatura; `resultado.reservas` inclui as reservas da fila da OS; a fila
  geral com teto `livre do lote − convertido` (Fase 2, achado 4).
- `distribuirSemLock(..., filaOpcoes)` — `filaOpcoes.abonoDaOs = os` (B1516); `filaDoMaterial(db, materialId, filtro)` extraída do miolo.
- `POST /api/almoxarifado/recebimentos/itens/:itemId/inspecionar` — **201**; `lote_impedido: '<codigo>'` também com OS aberta. Recusas inalteradas.
- `PUT /api/almoxarifado/lotes/:id/status` e as outras **três** portas que liberam o lote (o anexo do certificado, a liberação do vencimento e
  a correção da validade, `corrigirValidadeDoLote` — Fase 2, achado 5) — **200**; `reservado_para_quem_esperava` conta também o que foi para
  a requisição da OS. Recusas inalteradas.
- Observação literal da reserva da OS recriada quando a fila não leva: `Compra para a OS <numero_os> — não coube na requisição da OS na
  liberação do lote <codigo>` (o prefixo é o `motivoReservaDaOs` de sempre).
- Motivo literal da liberação da reserva da OS na conversão (B1514), em `motivo_liberacao` e na movimentação:
  `Reserva da OS <numero_os> passada à requisição da OS na liberação do lote <codigo>`.
- Sem migration, sem rota nova, sem perfil, sem tela nova.

## Tasks

Tudo é **tronco** (uma regra do motor de reservas, três portas que a compartilham). Sem galhos: a mesma função (`distribuirParaOs`) serve as
três.

- [x] **T1 (tronco)** — `osAbertaLoteImpedido.api.test.js` em RED (10 de 14 vermelhos antes do código; .04 a/b, .05 controle e .07 são
  controles); `distribuirParaOs` com `tetoFila` e sem `semDescontoDoLote`; a nota com `livreForaDeLoteImpedido` também na OS; a liberação com
  o lote antes do `if (os)`; a conversão na liberação do lote (`converterReservaDaOsNoLoteLiberado`); o estorno sem a B1508; o abono da OS
  (B1516, da Fase 2 — a .08 b ficou vermelha com o código do plano, e a .14/.15 nasceram dos achados); os testes que mudam de propósito
  (RN-219.07, RN-229.06, RN-228.11/.16) editados com o motivo — `59a5ae94`. 18/18. Sabotagens (10, md5 restaurado): S1 fila da OS com o teto
  inteiro → .03; S2 sem o desconto do lote → .16; S3 sem a conversão → .06/.08/.08 b/.11/.14; S4b conversão solta o livre inteiro → .08;
  S5 conversão de toda reserva da OS → .08 b; S6 estorno com a B1508 → .09; S7 liberação com OS ignora o lote → .05; S8 sem o abono → .08 b/.14/
  .15; S9 fila geral sem tirar o convertido → .17. **S4** (tirar o retorno cedo sem falta) sobrevive: mutante equivalente (o
  `mín(livre, falta)` já zera). Primeira rodada: S2, S4b, S5 e S9 sobreviviam → nasceram a .16, a .17 e as asserções de linha da .08/.08 b.
- [x] **Fase 5** — um revisor fresco em worktree própria (regra + trava + testes; 20 mutações). **Achado 1, reproduzido (médio):** o lote
  abastecido por duas notas (uma da OS e uma comum, ou duas da mesma OS) não convertia — só com nota única (o plano dizia isso e **estava
  errado**): com R2 comum mais antiga, R2 levava 4 e R1 da OS nada (antes da 230, os dois 4). Corrigido: a conversão roda nota a nota, a
  reserva criada com a marca da nota (RN-230.18, .19) — `de2bd342`. Mutantes que sobreviviam: M5 (a sobra não volta para a reserva da OS) →
  RN-230.20; M17 (conversão sem o filtro da OS) → .18/.20; M7b/M7c (o teto da conversão) → asserção de linha na .14. Uma tentativa de
  limitar cada nota pelo que ela pôs no lote foi **descartada** (dava menos à requisição da OS do que o lote liberado tinha de bom). Sobram,
  declarados: M2 (abono sem o teto do impedido) e M19 (abono de qualquer origem) — limitados pelo teto da entrada, nenhum cenário com dano
  construído (o revisor também não); M14 (`mín(teto, tetoFila)` → `tetoFila`) é equivalente (`tetoFila ≤ teto` nas três portas). Checado e
  bom pelo revisor: inspeção e depois liberar; estorno depois da conversão; liberar, bloquear e liberar de novo; travas (sem reentrância,
  ordem requisição → material).
- [x] **T2** — suítes serial sobre `de2bd342` (ver Verificação). A primeira rodada, sobre `59a5ae94`, foi interrompida para incluir a Fase 5.
- [x] **Fechamento** (`fechar-etapa`, sem o Passo 7½ e o 8).

## Retro

- Rodadas de correção até verde: 1 (a Fase 5: o lote de várias notas).
- Achados: Fase 2 — 2 importantes reais (o abono, nos dois caminhos), 4 menores (retomada, teto da fila geral, contrato, o tamanho da T1);
  Fase 5 — 1 regressão real reproduzida, 3 lacunas de teste reais (M5, M17, M7c), 3 mutantes declarados, 0 ruído.
- Paralelismo: sem galhos; a Fase 2 rodou junto com a escrita do teste; a Fase 5 em worktree própria, com a suíte na árvore principal (a
  correção foi feita na worktree do revisor e copiada depois de parar a suíte).
- Defeito que escapou da 229: nenhum achado.

## Verificação (medida, serial, sobre `de2bd342` + os documentos)

- `test:api` **624/624 arquivos OK**; `test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**.
- Tela (sem mudança de código nesta etapa): `react-scripts test --maxWorkers=2` **225/225 suítes, 3061/3061 testes**; `react-scripts build`
  (CI=true) **Compiled successfully**.
- `osAbertaLoteImpedido.api.test.js` **21/21**; `chegadaLoteImpedido` 18/18, `liberacaoLoteImpedido` 15/15, `estornoLoteImpedido` 19/19,
  `liberarLoteReserva` 25/25. Sabotagens: 10 na T1 (9 caem, 1 equivalente) e 5 na Fase 5 (todas caem); md5 restaurado nas duas rodadas.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 230 fecha o C520; a feature 07 continua 🟢. A limitação que esta seção nomeava antes da Fase 5 — o
lote de várias notas — foi resolvida na própria 230 (`de2bd342`). Do mesmo assunto (lote impedido), o C522 e o C526 pedem que a reserva
saiba o lote (grande); o aviso aberto de menor custo e com fatia visível é o **C532**. **Sem estimativa** — começa pela Fase 0.5.)*

**A entrega não pré-escolhe a origem da separação que ficou em lote impedido (C532).**

- **O problema (C532, da Etapa 226, B1493/B1494):** na janela de entrega, a origem da separação do item continua pré-escolhida e escolhível
  mesmo quando o lote dela ficou bloqueado, reprovado ou vencido depois de separar — com a frase *"Lote L2: Bloqueado. Nada sai dele …"*
  embaixo. Confirmar dá a recusa de sempre; o botão **Confirmar Entrega e Baixar Estoque** (um clique, sem janela) também, com *"a origem da
  separação (Z-02) não serve mais (…)"*. O almoxarife só descobre no clique.
- **Onde:** a tela — `client/src/components/almoxarifado/RequisicoesList.js` (a janela de entrega e o "Sai de", Etapas 224–226; teste de
  molde `RequisicoesSaiDeLoteImpedido.test.js`); o servidor já diz a situação do lote por origem (o contrato da 226). A porta da entrega
  (`requisitionService`, `origem_separacao_id`/`lote_separacao_id`, `PARTE_ORIGEM_SQL`) **não** muda — ela recusa certo.
- **O que decidir na Fase 1 (reversível):** não pré-escolher a origem impedida (pré-escolher outra que sirva, ou nenhuma) e/ou desabilitar
  o **Confirmar Entrega e Baixar Estoque** de um clique com a frase do lote. Conferir o que a entrega faz com a caixa (as peças separadas
  saíram do lote impedido — B1493: a entrega pode tirar de outro endereço?).
- **Pontos de atenção:** a trava por requisição → material (a entrega já roda nas duas); a tela de celular (Etapa 24, mobilidade) tem
  entrega? — medir. Testes do front com `--maxWorkers=2`.
- Outros abertos: C522 e C526 (a reserva saber o lote), C524, C525, C527, C529–C531, C533–C535, C514–C518, C486, C491, C495, C497, C498.
