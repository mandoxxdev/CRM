# Etapa 220 — liberar o lote reserva para quem esperava (C480) e quem muda o status do lote pega a trava do material (C523)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa219-chegada-em-lote-impedido-nao-reserva.md` (`:270-293`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-liberar-lote-reserva.txt` (**4h**, `0c07e6d4`). Números de linha medidos
> sobre `d772cd43`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½).

## Objetivo (em linguagem simples)

Desde a Etapa 219, o que entra num lote **bloqueado** (sem certificado), **reprovado** ou **vencido** não fica reservado para a requisição
que esperava: ela continua *Aguard. Estoque*. Mas quando o lote era liberado — anexando o certificado, voltando o status para *Ativo* ou
liberando o vencimento — nada acontecia: a requisição continuava esperando e quem chegasse primeiro na aprovação levava (**C480**). Depois
desta etapa, a liberação reserva as peças do lote para quem esperava, na ordem de prioridade, e avisa o solicitante. E mudar o status do
lote passa a esperar a vez das outras operações do mesmo material (**C523**): um lote bloqueado no exato instante de uma reserva não fica
mais com a reserva feita "no meio" — ou o bloqueio vem antes (e a reserva não sai), ou vem depois (B1372, a reserva de antes fica).

## Fase 0 — medido em 2026-11-13 (sobre `d772cd43`)

1. **Os três escritores do status** (`lotService.js`): `mudarStatusLote` (`:289`, `PUT /lotes/:id/status`, `extended.js:1366`),
   `liberarBloqueioPorCertificado` (`:331`, `POST /lotes/:id/certificado`, `almoxarifado.js:1331`) e `liberarVencimento` (`:367`,
   `PUT /lotes/:id/liberar-vencimento`, `extended.js:1315`). **Só as rotas os chamam** (grep em `server/` fora de `tests/`) — nenhum
   chamador de dentro de outra seção da trava. Nenhum pega a trava hoje; só `corrigirValidadeDoLote` (`:491`, `naTravaDoMaterial`, molde).
2. **A porta pronta**: `reservaChegadaService.reservarLiberacaoParaQuemEspera` (`:589`) com `opcoes.sobTrava` + `pendencia`
   (`novaPendencia`/`concluirPendencia` `:165-190`: recálculo da 76 e aviso da 75 depois de soltar) e `aposLiberacaoSemFalhar` (`:633`).
   O teto dela é `min(quantidade, disponível)`, e o miolo `distribuirSemLock` (`:399`) limita de novo por `disponível − loteImpedido`
   (B1453). Com `recebimento_id` nulo não há OS aberta (`:617`) — vai para a fila geral.
3. **O livre do lote**: `retidoDoLote.situacaoDosLotes(db, materialId)` → `Map<lote_id, { livre }>`, `livre = MAX(0, saldo − em
   inspeção no lote − retido no lote)`.
4. **O lote continua impedido depois do gesto?** `loteImpedido.predicadoLoteImpedidoSql('lt')` (status ≠ ATIVO, ou vencido sem
   liberação). Voltar para *Ativo* um lote vencido sem liberação, ou liberar o vencimento de um lote BLOQUEADO, não solta nada.
5. **O aviso**: `receiptNotificationService.avisarLiberacao` (`:438`) — `montarAvisoLiberacao` (`:195`) tem duas origens (NC e o resto =
   inspeção); a chave de dedupe é `<prefixo>-<documento_id>-req-<rid>` (`:529`) e vale para sempre (hash na fila).
6. **O estorno**: `liberarParaEstorno` (`:676`) só solta reserva com `recebimento_id` da movimentação estornada — a reserva da liberação do
   lote nasce **sem** `recebimento_id`, então não é solta pelo estorno de uma nota.
7. **A trava da reserva**: `stockService.criarReserva` (`:3809`) pega `naTravaDoMaterial` (aninha dentro da seção de quem distribui).
   O teste de corrida espia `stockService.criarReserva` pelo objeto do módulo (o miolo e a aprovação chamam por ele, `:773`).
8. **O teste que fixa o comportamento antigo**: `chegadaLoteImpedido.api.test.js` RN-219.06 (*"C480: liberar o lote nao distribui"*) — muda
   nesta etapa (a spec muda junto; não é teste a apagar em silêncio).

## Caminhos

- **(escolhido) A liberação distribui dentro da mesma seção que muda o status**, pela porta da 75 como 4ª origem (`LOTE_LIBERADO`), com a
  quantidade = o livre do lote; recálculo e aviso depois de soltar. Os três escritores (e o bloqueio, que é a mesma função) pegam
  `naTravaDoMaterial`. Reverter = tirar a chamada da distribuição e o embrulho da trava.
- **(descartado) Recalcular só o status (sem reservar).** A requisição sairia de *Aguard. Estoque* para *Aprovada* sem nada guardado — a
  aprovação de outra levaria as peças; é o C480 de hoje com outro rótulo.
- **(descartado) Distribuir depois de soltar a trava**, numa seção nova. Entre soltar e distribuir, outra aprovação ou uma saída avulsa pega
  as peças; e a liberação e a distribuição deixariam de ser um gesto só (a corrida que o C523 fecha).

## Decisões (letra B — reversíveis; livres depois de **B1460**, **C523**, **A116**, conferido por `grep` em `docs` e `specs`)

- **B1461 — os três escritores do status do lote pegam a trava do material (C523)** — `naTravaDoMaterial(lote.material_id)`, com a
  releitura do lote, o `UPDATE` com guarda, a auditoria e (na liberação) a distribuição dentro da seção. O bloqueio e a reprovação também
  (é a mesma `mudarStatusLote`). A leitura do lote **fora** (para saber o material) só serve para achar a trava: o `material_id` de um lote
  não muda. Descartado: só a liberação (o bloqueio no meio da reserva continuaria passando — a corrida reproduzida na 219).
- **B1462 — a liberação reserva o livre do lote para quem espera (C480)**, pela porta da 75 (`reservarLiberacaoParaQuemEspera` com
  `sobTrava` e `pendencia`), origem `LOTE_LIBERADO`, `quantidade` = `situacaoDosLotes(...).get(lote).livre`, `recebimento_id` nulo (fila
  geral; o estorno de nota não a solta). O teto do miolo continua `disponível − loteImpedido` (B1453): a reserva antiga feita antes do
  bloqueio (B1372) conta, e o livre de outro lote (ajuste) **não** é distribuído no lugar do lote (a D4 da 74 — o teto é o livre do lote).
- **B1463 — só distribui quem deixou o lote liberado**: o gesto tem de ter mudado algo (o `UPDATE` casou), o lote **antes** estava impedido
  e **agora**, relido dentro da seção, não está (`predicadoLoteImpedidoSql`), e o material tem `controle_lote` (sem ele o lote nunca
  prendeu nada — B1371). Voltar a *Ativo* um lote vencido sem liberação, liberar o vencimento de um lote ainda BLOQUEADO, ou trocar
  BLOQUEADO → REPROVADO, não distribuem.
- **B1464 — o aviso tem origem própria**: primeira linha *"O lote ⟨L⟩ do material que a sua requisição aguardava foi liberado e está no
  estoque."*; o resto é o aviso da 75 (liberado = o livre do lote, pendente, reservado). Dedupe por liberação:
  `lote-liberado-<lote>-<Date.now()>-<sequência do processo>-req-<rid>` (o lote pode ser bloqueado e liberado de novo; a chave por
  documento engoliria a 2ª; o `updated_at` tem resolução de segundo — Fase 2, achado 2).
  Descartado: sem aviso (mais barato, mas o solicitante não saberia que a requisição andou).
- **B1465 — a fatia visível**: as três respostas ganham `reservado_para_quem_esperava: { quantidade, unidade, requisicoes }` (zeros quando
  nada foi reservado) e a tela **Lotes e Séries** mostra *"⟨q⟩ ⟨un⟩ reservado(s) para quem esperava este material (⟨n⟩ requisição(ões))."*
  depois do sucesso, quando `quantidade > 0`. Contrato aditivo: o resto da resposta não muda.
- **B1466 — sem migration, sem trava nova** (a trava por material que já existe); a ordem requisição → material não muda (as rotas do
  lote não pegam a trava por requisição).
- **B1467 (Fase 2, achado 1) — a reserva da liberação leva o recebimento do lote quando ele veio de UMA nota só** (`DISTINCT
  recebimento_id` dos itens de recebimento com aquele `lote_id`). Sem isso, a nota que entrou em lote bloqueado, depois de liberada, ficava
  **inestornável** (*"o material está reservado para requisições …"*): `liberarParaEstorno` só solta reserva com o `recebimento_id` da
  nota — e antes da 219 a reserva da chegada o levava (D4/B386 da 75). Com mais de uma nota no lote, vai sem (o estorno recusa como hoje
  recusa a reserva manual — **C524**). O ramo da OS aberta **não** é seguido por causa desse recebimento (a função própria chama o miolo
  direto: a peça da OS já ficou com ela na chegada, B1455). Descartado: deixar sempre sem (o estorno travava, regressão da 74).
- **Correção da B1462 (Fase 2, achado 3).** "O livre de outro lote não é distribuído" era exagero: a reserva não sabe o lote, e o teto do
  miolo é a conta agregada da aprovação. Com 4 de ajuste em L0 e 4 em L1 reservados para R0 antes do bloqueio, liberar L1 reserva 4 para R1
  (8 físicos, 8 reservados — a conta fecha). Fixado pela **RN-220.05 c**.

## Regras de negócio (RN-220.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-220.01 | Anexar o certificado libera o lote BLOQUEADO por certificado e reserva o livre dele para quem espera | R1 espera 4; nota de 4 em L1 (sem certificado → BLOQUEADO); `POST /lotes/L1/certificado` → R1 com 4 reservado, status `TOTALMENTE_RESERVADA` (recalculado); resposta `{ status: 'ATIVO', reservado_para_quem_esperava: { quantidade: 4, unidade: 'PC', requisicoes: 1 } }` |
| RN-220.02 | `PUT /lotes/:id/status` para `ATIVO` (de BLOQUEADO ou REPROVADO) faz o mesmo | o cenário da RN-219.01 → ATIVO → R1 com 4 reservado (era a RN-219.06, que dizia que não distribuía — **muda**) |
| RN-220.03 | `PUT /lotes/:id/liberar-vencimento` de lote ATIVO vencido faz o mesmo | L1 vencido com 4, R1 espera 4 → liberar → R1 reserva 4 |
| RN-220.04 | Gesto que deixa o lote impedido não distribui (B1463) | (a) L1 vencido BLOQUEADO → ATIVO sem liberação do vencimento: 0 reservado; (b) liberar o vencimento de L1 vencido e BLOQUEADO: 0; (c) BLOQUEADO → REPROVADO: 0; resposta com `quantidade: 0` |
| RN-220.05 | O teto é o livre do lote e o que pode sair (B1462) | (a) 4 livres de ajuste em L0 + 4 em L1 bloqueado, R1 (direta, `AGUARDANDO_ESTOQUE`) pede 8 → liberar L1 reserva 4 (não 8); (b) L1 com 4 reservadas para R0 antes do bloqueio (B1372), R1 espera 4 → liberar L1: 0 para R1; (c) o mesmo com 4 de ajuste em L0 → 4 para R1 (Fase 2) |
| RN-220.06 | Material sem controle de lote: liberar não distribui | material `controle_lote = 0`, lote BLOQUEADO → ATIVO: 0 (nada estava preso) |
| RN-220.07 | A reserva da liberação: o recebimento do lote (B1467), motivo e observação literais | `motivo` do livro `Reserva na liberação do lote L1`; observação `Reserva na liberação do lote L1 — requisição <numero>`; `recebimento_id` = a nota do lote (uma só) — *era "IS NULL" no plano; mudou na Fase 2* |
| RN-220.08 | O aviso ao solicitante (B1464) | e-mail `RECEBIMENTO_ENTRADA_REQUISITANTE` com a 1ª linha literal e *"reservado para a sua requisição: 4 PC"*; bloquear e liberar de novo com outra espera gera outro aviso (a chave não engole) |
| RN-220.09 | Fila: quem tem prioridade leva primeiro | R1 NORMAL e R2 URGENTE esperam 4 cada; L1 com 4 → liberar → R2 reserva 4, R1 nada |
| RN-220.10 | Os três escritores pegam a trava do material (C523, B1461) | espião em `travaPorMaterial.comLockDoMaterial`: cada uma das três rotas (e o bloqueio) chama com o `material_id` do lote |
| RN-220.11 | Bloquear o lote no meio de uma reserva espera a reserva (C523) | gancho em `stockService.criarReserva` (só sinaliza e segura) durante a nota de 4 em L1 ATIVO com R1 esperando; `PUT /lotes/L1/status BLOQUEADO` disparado do contexto do teste **não** grava enquanto a reserva está segura (o lote ainda ATIVO no banco); soltando, os dois terminam: reserva feita (B1372) e lote BLOQUEADO. O mesmo pela aprovação (`/aprovar`) |
| RN-220.12 | A tela mostra o que a liberação reservou (B1465) | `LotesAlmoxarifado`: resposta com `quantidade: 4` → `toast.info('4 PC reservado(s) para quem esperava este material (1 requisição(ões)).')`; com 0 → nenhum toast extra |
| RN-220.13 | Integração: o gesto seguinte aceita o que a liberação reservou | nota em L1 bloqueado → R1 esperando → certificado → `TOTALMENTE_RESERVADA` → separar 4 → entregar 4: o saldo de L1 vai a 0 e a reserva é consumida |
| RN-220.14 | (Fase 2, B1467) O estorno da nota solta a reserva da liberação | nota 4 em L1 bloqueado → certificado reserva 4 para R1 → `POST /movimentacoes/:id/cancelar` da ENTRADA_COMPRA → 200, R1 sem reserva e esperando; (b) lote com duas notas → a reserva vai sem recebimento (C524) |

## Contratos congelados

**`PUT /api/almoxarifado/lotes/:id/status`** — payload `{ status, justificativa }` (igual). Resposta 200: o lote (`getLote`, igual) **+**
`reservado_para_quem_esperava: { quantidade: number, unidade: string|null, requisicoes: number }`. Erros iguais (literais de hoje):
400 `status de lote invalido: X. Use ATIVO, BLOQUEADO, REPROVADO`, 400 `justificativa obrigatoria para mudar o status do lote`,
404 `Lote nao encontrado`, 409 `O status do lote mudou durante a operacao. Recarregue e tente de novo.`

**`PUT /api/almoxarifado/lotes/:id/liberar-vencimento`** — payload `{ justificativa }` (igual). Resposta 200: o lote **+**
`reservado_para_quem_esperava` (mesmo formato). Erros iguais: 400 `justificativa obrigatoria para liberar o vencimento do lote`,
404 `Lote nao encontrado`, 400 `Lote nao esta vencido; nao ha vencimento para liberar`, 409 `O lote mudou durante a operacao. Recarregue e tente de novo.`

**`POST /api/almoxarifado/lotes/:id/certificado`** — multipart `certificado` (igual). Resposta 200 `{ id, certificado_arquivo, status,
reservado_para_quem_esperava }`. Erros iguais (400 `Nenhum certificado enviado`, 404 `Lote nao encontrado`). O certificado que não
liberou o lote (reprovado, bloqueado por outro motivo, já ativo) responde `reservado_para_quem_esperava` com zeros
(`lotService.reservaVaziaDoLote` — Fase 2, achado 4). A tela omite a unidade quando ela vem `null`.

**Serviço** (`lotService`): `mudarStatusLote(db, user, loteId, novoStatus, justificativa)`, `liberarBloqueioPorCertificado(...)` e
`liberarVencimento(...)` mantêm a assinatura e o retorno (o lote, ou `null` no certificado que não liberou) e ganham o campo
`reservado_para_quem_esperava` no objeto devolvido. A distribuição nunca derruba o gesto (a liberação já gravou —
`reservarLoteLiberadoSobTrava` engole, loga e devolve o parcial).

**Literais novos:** observação da reserva `Reserva na liberação do lote ⟨L⟩ — requisição ⟨numero⟩`; motivo `Reserva na liberação do
lote ⟨L⟩`; aviso, 1ª linha `O lote ⟨L⟩ do material que a sua requisição aguardava foi liberado e está no estoque.`; tela
`⟨q⟩ ⟨un⟩ reservado(s) para quem esperava este material (⟨n⟩ requisição(ões)).`

## Tasks (sort topológico)

- [x] **T1 (tronco)** — `lotService`: os três escritores sob `naTravaDoMaterial` (`comTravaDoLote`, releitura dentro), e a liberação chama
  `reservaChegadaService.reservarLoteLiberadoSobTrava(db, user, lote, pendencia)` (nova, B1462/B1463/B1467) dentro da seção;
  `concluirPendencia` depois de soltar; rótulos próprios; aviso com a origem `LOTE_LIBERADO`. Testes RN-220.01 a .11, .14 (servidor), com
  controle positivo e a RN-219.06 reescrita — `7a428526`. **Divergência:** a função própria em vez da porta `reservarLiberacaoParaQuemEspera`
  (o ramo da OS aberta seria seguido pelo recebimento da B1467).
- [x] **T2 (galho, consome o contrato)** — a tela `LotesAlmoxarifado` mostra a reserva da liberação nas três ações (RN-220.12, 2 testes RTL;
  controle positivo: sem a chamada, os 2 caem) — `a04b43e8`.
- [x] **T3 (integração)** — RN-220.13 pela rota (certificado → separar → entregar), no mesmo arquivo — `7a428526`.

## Fase 2 — revisão do plano (1 revisor fresco)

Sem trava. **2 importantes:** (1) a reserva sem recebimento deixava a nota inestornável depois da liberação → **B1467** + RN-220.14 (aceito);
(2) a chave do aviso por `updated_at` colidia no mesmo segundo → sequência do processo (aceito). **4 menores:** a B1462 prometia mais que a
conta (corrigida, RN-220.05 c); o contrato do certificado que não libera (zeros, aceito); a RN-220.05 a montável só com requisição direta
(o teste já usava); a origem nova nos três pontos (rótulos, 1ª linha, prefixo — aceito). Sem problema de trava (só as rotas chamam os
escritores; `criarReserva` aninha; nada da trava por requisição). Sugestão de separar a trava numa T0: não seguida (a sabotagem 5 já
derruba RN-220.10/.11 sozinha).

## Execução e controles (medidos)

`liberarLoteReserva.api.test.js` **22/22** em `7a428526`, **25/25** depois da Fase 5 (`6c80f908`); `chegadaLoteImpedido` **18/18** (RN-219.06 reescrita). Vermelho antes: 0/19 (as rotas não
devolviam o campo; a trava não era pega; o gancho da RN-220.11 não era atingido até o `Promise.resolve` do supertest).

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | sem a distribuição | RN-220.01, .02, .02 b, .03, .05 a, .05 c, .07, .08, .08 b, .09, .13, .14, .14 b |
| 2 | sem a guarda "agora não está impedido" | RN-220.04 a, b, c |
| 3 | teto 1e9 (sem o livre do lote) | RN-220.05 a |
| 4 | sem a guarda de `controle_lote` | **nada — equivalente** (`loteImpedidoAgora` já exige controle de lote, e o "antes impedido" vem dela) |
| 5 | sem a trava em `comTravaDoLote` | RN-220.10, .11 a, .11 b (e toda distribuição: L1) |
| 6 | dedupe por documento | RN-220.08 b |
| 7 | "antes impedido" sempre verdadeiro | RN-220.04 d |
| 8 | reserva sempre sem recebimento | RN-220.07, .14 |
| 9 | aviso sem a frase do lote | RN-220.08, .08 b |
| 10 | a correção de validade sem a distribuição (Fase 5) | RN-220.15 |
| 11 | o certificado que não libera sem os zeros (Fase 5) | RN-220.08 c |
| 12 | `requisicoes` = número de reservas (Fase 5) | RN-220.01 b |
| 13 | aviso sem o recebimento (Fase 5) | RN-220.08 |

Tela: sem a chamada do aviso, as 2 RN-220.12 caem (`LotesAlmoxarifado`) e a RN-220.15 cai (`LotesCorrigirValidade`).

## Sabotagens previstas (controle positivo — o resultado medido está em "Execução e controles")

1. sem a distribuição na liberação → RN-220.01/.02/.03/.08/.09/.13; 2. sem a guarda "agora não está impedido" → RN-220.04; 3. teto pelo
disponível (sem o livre do lote) → RN-220.05 a; 4. sem a guarda de `controle_lote` → RN-220.06; 5. sem a trava em `mudarStatusLote` →
RN-220.10/.11; 6. sem a trava no certificado e no vencimento → RN-220.10; 7. dedupe por documento → RN-220.08 (2º aviso).

## Fase 5 — revisão adversarial (3 revisores frescos em paralelo: regra, travas/concorrência, "o teste passaria com a feature quebrada?")

Proibidos de editar o repositório; sondas `e220-rev-*.js` no scratchpad; o de testes mutou uma worktree própria (25 mutações, cópia + md5).

1. **[REGRA, real, reproduzido] Corrigir a validade é a 4ª porta.** Lote ATIVO vencido com 4, R1 esperando: `PUT /lotes/:id/validade` para
   o ano que vem → 200, lote livre, R1 sem reserva (a mesma corrida do C480). **B1468**: `corrigirValidadeDoLote` (que já pegava a trava)
   mede o "antes impedido" e reserva na mesma seção; a resposta `{ lote, avisos }` ganha `reservado_para_quem_esperava` (aditivo) e a tela
   mostra o aviso. **RN-220.15** — `6c80f908`.
2. **[TESTE, real] 3 lacunas**: o certificado que não libera (rota sem os zeros sobrevivia) → RN-220.08 c; a conta da resposta (soma e
   número de requisições — todo cenário tinha 1 reserva) → RN-220.01 b, com dois itens na mesma requisição; o recebimento no aviso → RN-220.08.
   7 mutações sobreviventes equivalentes ou inalcançáveis (os 409 sob a trava, o 404 relido, `concluirPendencia` fora do `finally`, a guarda
   L1, o `livre > EPS`, o contador da chave no mesmo milissegundo) — `6c80f908`.
3. **[TRAVAS, reproduzido, ANTERIOR] Estorno no mesmo instante da liberação.** `liberarParaEstorno` roda fora da trava (B441: soltar não
   distribui); lido no meio da liberação, não solta nada e o estorno recusa (400, *"… reservado para requisições …"*). Nenhum erro de
   estoque; tentar de novo passa. **C525**, sem conserto (mexe no motor do estorno).
4. **[SUÍTE, achado ao rodar] O teste da 191 "[Fase 5 F2] liberação gravada depois da leitura de fora"** patcheava `naTravaDoMaterial`
   chamando `liberarVencimento` de dentro: como ela agora passa pela mesma função, recursão infinita (a suíte pendurava). Guarda de uma vez só
   no gancho; o cenário é o mesmo — `6c80f908`. Comentário de `redefinirValidadeDoLoteVazio` que dizia que `liberarVencimento` não pega a
   trava atualizado.

Sem achado: sem auto-espera nem deadlock (as rotas são as únicas chamadoras; dentro da seção tudo passa por `naTravaDoMaterial`); a ordem
requisição → material respeitada; a distribuição relê `loteImpedidoAgora`, e todo escritor de status/validade pega a mesma trava (sonda: um
bloqueio e uma saída avulsa disparados no meio da liberação esperaram; o final bate). Peças já separadas por outra requisição não são
reservadas de novo (sonda: o teto do que pode sair dá 0).

## Fechamento

- [x] Fase 5 — 3 revisores; **1 achado de regra** (a 4ª porta) corrigido, **3 lacunas de teste** fechadas, **1 corrida anterior** registrada
  (C525), 1 travamento de teste antigo achado ao rodar a suíte; 0 ruído — `6c80f908`.
- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1461–B1468, C480/C523 resolvidos, C524 e C525,
  D (220), F (220), seção, topo e "onde estamos"; sem A — nada no banco), specs 07, 10 e 05, mapa, guia (seção, cabeçalho, a 219 anotada),
  manual (4.2, 4.3c, 9.3c-bis nova, 21c.1), este plano e a estimativa.

- [x] **A suíte inteira achou mais dois testes que fixavam o C480** — `loteImpedidoAprovacao` RN-205.05 e `loteImpedidoIntegracao` T3 rota
  esperavam que a requisição aprovada **depois** da liberação levasse as peças. Agora afirmam que quem esperava leva (a RN-205.05 continua
  provando que o vencido liberado conta, com uma entrada nova) — `52148fd0`. 1ª rodada: `test:api` 613/615 (estes dois).

### Divergências do plano

- **A porta da 75 não foi usada direto**: a função própria (`reservarLoteLiberadoSobTrava`) chama o miolo, porque com o recebimento da
  B1467 a porta seguiria o ramo da OS aberta.
- **A RN-220.07 mudou na Fase 2** (o plano dizia `recebimento_id IS NULL`; agora é o da nota do lote). **B1467**, **B1468**, **C524**,
  **C525**, **RN-220.05 c, .08 c, .01 b, .13, .14, .15** não existiam no plano.
- **Quatro escritores, não três**: a correção de validade entrou na Fase 5.

### Retro (4 números)

- **Rodadas até verde na Fase 5:** 1 (os testes novos passaram na primeira, cada um com controle positivo).
- **Achados reais:** Fase 2: 2 importantes + 4 menores (todos aceitos). Fase 5: 1 regra (corrigida), 3 lacunas de teste (fechadas), 1 corrida
  anterior (registrada); 0 ruído. Mais 1 teste antigo que pendurava com a trava nova (achado pela suíte, não pela revisão).
- **Paralelismo:** sem galhos de código em paralelo (T2 depois de T1, no mesmo fluxo); 3 revisores em paralelo (o de testes numa worktree
  própria) — sem contaminação. Uma rodada da suíte inteira foi interrompida por eu ter mudado código com ela rodando; refeita do zero.
- **Defeito que escapou da 219:** nenhum.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 220 fecha o C480 e o C523; o vizinho imediato é o **C479** — a última porta que ainda reserva peça
de lote impedido. **Sem estimativa** — começa pela Fase 0.5.)*

**A reserva manual não conta o lote impedido (C479).**

- **Onde:** `stockService.criarReservaSemTrava` (`:3813`), `POST /api/almoxarifado/reservas` (`routes/almoxarifado/extended.js:995`). O
  `hold` compara com `caixaSql.livreDeCaixaSql()` para a manual (`:3829`) e com `disponivelSql()` para a de requisição — nenhum dos dois tira
  `loteImpedido.loteImpedidoSql`. A recusa é *"Saldo disponível insuficiente: ⟨n⟩"* (com o sufixo da caixa quando há caixa).
- **O que está pronto e não reabre:** a régua `loteImpedidoSql('ma')` (205 + 217); o molde da aprovação (`disponivel_liberado`,
  `requisitionService.reservarItensAprovacao`) e do miolo da chegada (B1453). A reserva já roda sob `naTravaDoMaterial` (Etapa 97) e o
  status do lote agora também (B1461), então a leitura é consistente.
- **A decisão a tomar (letra B, reversível):** (1) só a manual desconta, ou também a de requisição feita por este caminho (cuidado: o miolo
  da chegada e a aprovação já descontam antes de chamar — descontar de novo dentro do `hold` pode recusar a reserva da reserva da OS, B1381,
  que converte **sobre** o impedido de propósito; medir `osNoImpedido`); (2) a frase da recusa (molde: `loteImpedido.fraseLoteImpedido`,
  *"Não entram ⟨n⟩ ⟨un⟩ em lote bloqueado, reprovado ou vencido."*) somada à de hoje.
- **Pontos de atenção:** `criarReserva` é chamada de dentro de seções (miolo, aprovação, reserva da OS) — a régua nova no `hold` vale para
  todas se não for condicionada a `!opcoes.requisicao_id`/`!opcoes.sistema`. A fatia visível: a recusa na tela **Reservas** dizendo quanto
  está em lote impedido. Vizinhos baratos que seguem abertos: C519, C521, C524, C525, C514–C518, C486, C491, C495, C497, C498.

### Verificação (medida, serial, sobre `52148fd0`)

`test:api` **615/615 arquivos OK** (os 614 da 219 + `liberarLoteReserva`; a 1ª rodada,
antes de `52148fd0`, deu 613/615); `test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**;
`test:sqlite` **16/0**; cliente (`CI=true npx react-scripts test --watchAll=false --maxWorkers=2`) **224/224 suítes, 3010/3010 testes**
(3007 + 3 novos); `build` **Compiled successfully**. `liberarLoteReserva` **25/25**; `chegadaLoteImpedido` **18/18**; `corrigirValidadeLote`
**23/23**; `loteImpedidoAprovacao` **12/12**; `loteImpedidoIntegracao` **6/6**.
