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
  `lote-liberado-<lote>-<instante>-req-<rid>` (o lote pode ser bloqueado e liberado de novo; a chave por documento engoliria a 2ª).
  Descartado: sem aviso (mais barato, mas o solicitante não saberia que a requisição andou).
- **B1465 — a fatia visível**: as três respostas ganham `reservado_para_quem_esperava: { quantidade, unidade, requisicoes }` (zeros quando
  nada foi reservado) e a tela **Lotes e Séries** mostra *"⟨q⟩ ⟨un⟩ reservado(s) para quem esperava este material (⟨n⟩ requisição(ões))."*
  depois do sucesso, quando `quantidade > 0`. Contrato aditivo: o resto da resposta não muda.
- **B1466 — sem migration, sem trava nova** (a trava por material que já existe); a ordem requisição → material não muda (as rotas do
  lote não pegam a trava por requisição).

## Regras de negócio (RN-220.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-220.01 | Anexar o certificado libera o lote BLOQUEADO por certificado e reserva o livre dele para quem espera | R1 espera 4; nota de 4 em L1 (sem certificado → BLOQUEADO); `POST /lotes/L1/certificado` → R1 com 4 reservado, status `TOTALMENTE_RESERVADA` (recalculado); resposta `{ status: 'ATIVO', reservado_para_quem_esperava: { quantidade: 4, unidade: 'PC', requisicoes: 1 } }` |
| RN-220.02 | `PUT /lotes/:id/status` para `ATIVO` (de BLOQUEADO ou REPROVADO) faz o mesmo | o cenário da RN-219.01 → ATIVO → R1 com 4 reservado (era a RN-219.06, que dizia que não distribuía — **muda**) |
| RN-220.03 | `PUT /lotes/:id/liberar-vencimento` de lote ATIVO vencido faz o mesmo | L1 vencido com 4, R1 espera 4 → liberar → R1 reserva 4 |
| RN-220.04 | Gesto que deixa o lote impedido não distribui (B1463) | (a) L1 vencido BLOQUEADO → ATIVO sem liberação do vencimento: 0 reservado; (b) liberar o vencimento de L1 vencido e BLOQUEADO: 0; (c) BLOQUEADO → REPROVADO: 0; resposta com `quantidade: 0` |
| RN-220.05 | O teto é o livre do lote e o que pode sair (B1462) | (a) 4 livres de ajuste em L0 + 4 em L1 bloqueado, R1 (direta, `AGUARDANDO_ESTOQUE`) pede 8 → liberar L1 reserva 4 (não 8); (b) L1 com 4 reservadas para R0 antes do bloqueio (B1372), R1 espera 4 → liberar L1: 0 para R1 |
| RN-220.06 | Material sem controle de lote: liberar não distribui | material `controle_lote = 0`, lote BLOQUEADO → ATIVO: 0 (nada estava preso) |
| RN-220.07 | A reserva da liberação: sem `recebimento_id`, motivo e observação literais | `motivo` do livro `Reserva na liberação do lote L1`; observação `Reserva na liberação do lote L1 — requisição <numero>`; `recebimento_id IS NULL` |
| RN-220.08 | O aviso ao solicitante (B1464) | e-mail `RECEBIMENTO_ENTRADA_REQUISITANTE` com a 1ª linha literal e *"reservado para a sua requisição: 4 PC"*; bloquear e liberar de novo com outra espera gera outro aviso (a chave não engole) |
| RN-220.09 | Fila: quem tem prioridade leva primeiro | R1 NORMAL e R2 URGENTE esperam 4 cada; L1 com 4 → liberar → R2 reserva 4, R1 nada |
| RN-220.10 | Os três escritores pegam a trava do material (C523, B1461) | espião em `travaPorMaterial.comLockDoMaterial`: cada uma das três rotas (e o bloqueio) chama com o `material_id` do lote |
| RN-220.11 | Bloquear o lote no meio de uma reserva espera a reserva (C523) | gancho em `stockService.criarReserva` (só sinaliza e segura) durante a nota de 4 em L1 ATIVO com R1 esperando; `PUT /lotes/L1/status BLOQUEADO` disparado do contexto do teste **não** grava enquanto a reserva está segura (o lote ainda ATIVO no banco); soltando, os dois terminam: reserva feita (B1372) e lote BLOQUEADO. O mesmo pela aprovação (`/aprovar`) |
| RN-220.12 | A tela mostra o que a liberação reservou (B1465) | `LotesAlmoxarifado`: resposta com `quantidade: 4` → `toast.info('4 PC reservado(s) para quem esperava este material (1 requisição(ões)).')`; com 0 → nenhum toast extra |

## Contratos congelados

**`PUT /api/almoxarifado/lotes/:id/status`** — payload `{ status, justificativa }` (igual). Resposta 200: o lote (`getLote`, igual) **+**
`reservado_para_quem_esperava: { quantidade: number, unidade: string|null, requisicoes: number }`. Erros iguais (literais de hoje):
400 `status de lote invalido: X. Use ATIVO, BLOQUEADO, REPROVADO`, 400 `justificativa obrigatoria para mudar o status do lote`,
404 `Lote nao encontrado`, 409 `O status do lote mudou durante a operacao. Recarregue e tente de novo.`

**`PUT /api/almoxarifado/lotes/:id/liberar-vencimento`** — payload `{ justificativa }` (igual). Resposta 200: o lote **+**
`reservado_para_quem_esperava` (mesmo formato). Erros iguais: 400 `justificativa obrigatoria para liberar o vencimento do lote`,
404 `Lote nao encontrado`, 400 `Lote nao esta vencido; nao ha vencimento para liberar`, 409 `O lote mudou durante a operacao. Recarregue e tente de novo.`

**`POST /api/almoxarifado/lotes/:id/certificado`** — multipart `certificado` (igual). Resposta 200 `{ id, certificado_arquivo, status,
reservado_para_quem_esperava }`. Erros iguais (400 `Nenhum certificado enviado`, 404 `Lote nao encontrado`).

**Serviço** (`lotService`): `mudarStatusLote(db, user, loteId, novoStatus, justificativa)`, `liberarBloqueioPorCertificado(...)` e
`liberarVencimento(...)` mantêm a assinatura e o retorno (o lote, ou `null` no certificado que não liberou) e ganham o campo
`reservado_para_quem_esperava` no objeto devolvido. A distribuição nunca derruba o gesto (a liberação já gravou — `aposLiberacaoSemFalhar`
engole e loga).

**Literais novos:** observação da reserva `Reserva na liberação do lote ⟨L⟩ — requisição ⟨numero⟩`; motivo `Reserva na liberação do
lote ⟨L⟩`; aviso, 1ª linha `O lote ⟨L⟩ do material que a sua requisição aguardava foi liberado e está no estoque.`; tela
`⟨q⟩ ⟨un⟩ reservado(s) para quem esperava este material (⟨n⟩ requisição(ões)).`

## Tasks (sort topológico)

- [ ] **T1 (tronco)** — `lotService`: os três escritores sob `naTravaDoMaterial` (releitura dentro), e a liberação chama
  `reservaChegadaService.reservarLoteLiberadoSobTrava(db, user, lote, pendencia)` (nova, B1462/B1463) dentro da seção;
  `concluirPendencia` depois de soltar; rótulos `LOTE_LIBERADO`; aviso com a origem nova. Testes RN-220.01 a .11 (servidor), com controle
  positivo e a RN-219.06 reescrita.
- [ ] **T2 (galho, consome o contrato)** — a tela `LotesAlmoxarifado` mostra a reserva da liberação nas três ações (RN-220.12), teste RTL.
- [ ] **T3 (integração)** — o fluxo completo pela rota: nota em lote bloqueado → R1 esperando → certificado → reserva → **separar** e
  **entregar** R1 pelo lote liberado (o gesto seguinte aceita o que a liberação reservou) — RN-220.13.

## Sabotagens previstas (controle positivo)

1. sem a distribuição na liberação → RN-220.01/.02/.03/.08/.09/.13; 2. sem a guarda "agora não está impedido" → RN-220.04; 3. teto pelo
disponível (sem o livre do lote) → RN-220.05 a; 4. sem a guarda de `controle_lote` → RN-220.06; 5. sem a trava em `mudarStatusLote` →
RN-220.10/.11; 6. sem a trava no certificado e no vencimento → RN-220.10; 7. dedupe por documento → RN-220.08 (2º aviso).
