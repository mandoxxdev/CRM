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
- **B1514 — liberar o lote passa a reserva da OS para a requisição da OS.** Na liberação do lote (Etapa 220), se o lote veio de **uma** nota
  só (B1467) e essa nota tem OS **aberta**, a reserva da OS dessa nota e desse material é solta até `mín(livre do lote, saldo dela, a falta
  da fila da OS)` e o solto vai para a fila da OS (o miolo, com o filtro da OS); o que a fila não levar (regra do dono, valor) volta a ser
  reserva da OS. Depois, a fila geral como antes. Sem requisição da OS esperando, a reserva da OS não é tocada (nada é solto e recriado).
  Motivo da liberação da reserva da OS: *"Reserva da OS ⟨numero⟩ passada à requisição da OS na liberação do lote ⟨codigo⟩"*.
- **B1515 — o estorno perde a exceção da OS.** A B1508 (nota com OS: a régua de antes) sai: a fila da OS agora reserva com o desconto, e a
  exceção deixava a requisição da OS reservada só com peça bloqueada depois do estorno do lote bom. A reserva da OS continua solta
  primeiro (`mín(reserva, estornado)`, 171). Revoga a B1508.

### Limitações (D (230))

1. **Lote de várias notas.** Liberar um lote que veio de mais de uma nota (B1467: a reserva do lote vai sem nota) não converte reserva da OS
   nenhuma — a fila geral como antes. A requisição da OS converte na próxima aprovação; se já foi aprovada, espera (molde da 220).
2. **A OS fechada.** OS fechada quando o lote é liberado: nada é convertido (a reserva da OS já foi solta pelo encerramento da OS).
3. **Reservas de antes.** A requisição da OS reservada sobre lote bloqueado **antes** desta etapa continua como está (não há migração); o
   estorno do lote bom a solta pela régua nova (B1515).

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
- **RN-230.13 — regressão.** `chegadaLoteImpedido` (salvo a .07), `liberacaoLoteImpedido` (salvo a .06), `estornoLoteImpedido` (salvo a .11 e
  a .16), `reservaDaOs*`, `requisicaoOsIdCasaReservaDaOs`, `liberarLote*`, `osEncerrada*` verdes.

## Contrato (congelado)

- `reservaChegadaService.distribuirParaOs(db, user, materialId, teto, rotulos, acc, os, tetoFila = teto)` — a fila da OS com
  `mín(tetoFila, teto)` e o desconto do lote; a reserva da OS com `teto − usado`. A opção `semDescontoDoLote` do miolo sai.
- `reservarLiberacaoParaQuemEspera` — com OS aberta e `ctx.lote_id` impedido agora: `tetoFila = 0` e `resultado.lote_impedido = { id, codigo }`;
  sem lote impedido: como antes.
- `reservarLoteLiberadoSobTrava(db, user, lote, pendencia)` — mesma assinatura; `resultado.reservas` inclui as reservas da fila da OS.
- `POST /api/almoxarifado/recebimentos/itens/:itemId/inspecionar` — **201**; `lote_impedido: '<codigo>'` também com OS aberta. Recusas inalteradas.
- `PUT /api/almoxarifado/lotes/:id/status` (e as outras duas portas que liberam o lote) — **200**; `reservado_para_quem_esperava` conta
  também o que foi para a requisição da OS. Recusas inalteradas.
- Motivo literal da liberação da reserva da OS na conversão (B1514), em `motivo_liberacao` e na movimentação:
  `Reserva da OS <numero_os> passada à requisição da OS na liberação do lote <codigo>`.
- Sem migration, sem rota nova, sem perfil, sem tela nova.

## Tasks

Tudo é **tronco** (uma regra do motor de reservas, três portas que a compartilham). Sem galhos: a mesma função (`distribuirParaOs`) serve as
três.

- [ ] **T1 (tronco)** — `osAbertaLoteImpedido.api.test.js` em RED (RN-230.01–.11); `distribuirParaOs` com `tetoFila` e sem
  `semDescontoDoLote`; a nota com `livreForaDeLoteImpedido` também na OS; a liberação com o lote antes do `if (os)`; a conversão na
  liberação do lote; o estorno sem a B1508; os testes que mudam de propósito (RN-219.07, RN-229.06, RN-228.11/.16) editados com o motivo.
  Sabotagens: (S1) devolver `semDescontoDoLote` → .01/.03 caem; (S2) fila da OS com o teto inteiro → .03 cai; (S3) sem a conversão → .06/.08/.11
  caem; (S4) conversão sem o mínimo pela falta da fila → .07 cai (a reserva da OS solta e recriada); (S5) conversão de todas as reservas da
  OS → .08 (R2) ou cenário de outra nota; (S6) estorno com a B1508 → .09 cai; (S7) liberação com `if (os)` antes do lote → .05 cai.
- [ ] **T2** — suítes serial (ver Verificação).
- [ ] **Fase 5** — revisor fresco (regra + trava + testes).
- [ ] **Fechamento** (`fechar-etapa`, sem o Passo 7½ e o 8).

## Verificação

*(preenchida no fechamento)*

## Próxima tarefa detalhada

*(preenchida no fechamento)*
