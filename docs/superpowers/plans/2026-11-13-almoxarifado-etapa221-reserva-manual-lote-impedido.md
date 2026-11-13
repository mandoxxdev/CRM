# Etapa 221 — a reserva manual não conta o lote impedido (C479)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa220-liberar-lote-reserva-para-quem-espera.md` (`:231-258`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-reserva-manual-lote-impedido.txt` (**4h**, `c3e49396`). Números de linha
> medidos sobre `c3e49396`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½).

## Objetivo (em linguagem simples)

Desde a Etapa 205 a aprovação só reserva o que pode sair; desde a 219/220 a chegada e a liberação do lote também. Falta a **reserva manual**
(tela **Reservas**): ela ainda conta as peças que estão num lote **bloqueado** (sem certificado), **reprovado** ou **vencido** — a reserva
sai, mas a peça não pode sair do estoque, e a reserva fica presa (**C479**). Depois desta etapa, a reserva manual compara com o que pode sair
de verdade e, quando falta, a recusa diz quanto está em lote impedido. As reservas que o sistema faz sozinho (aprovação, chegada, liberação
do lote, reserva da OS) não mudam.

## Fase 0 — medido em 2026-11-13 (sobre `c3e49396`)

1. **A porta**: `stockService.criarReservaSemTrava` (`:3813`), embrulhada por `criarReserva` (`:3809`, `naTravaDoMaterial`). O `hold`
   (`:3826-3829`) é um `UPDATE materiais_almoxarifado … WHERE id = ? AND <régua> >= ?` com a régua `caixaSql.livreDeCaixaSql()` na manual
   e `disponivelSql()` quando há `opcoes.requisicao_id`. Recusa (`:3832-3839`): com caixa, *"Saldo disponível insuficiente: ⟨livre⟩"* +
   `sufixoDaCaixa`; sem caixa, *"Saldo disponível insuficiente: ⟨getSaldoDisponivel⟩"*.
2. **Quem chama**: a rota `POST /api/almoxarifado/reservas` (`routes/almoxarifado/extended.js:995-1000`, `criarReserva(db, req.user,
   req.body)` — **sem** 4º argumento: `sistema` falso, sem `requisicao_id`). Os outros, todos com `sistema: true`: a aprovação
   (`requisitionService.js:773`, com `requisicao_id`, já desconta antes — `disponivel_liberado`, Etapa 205), o miolo da chegada/liberação
   (`reservaChegadaService.js:446`, com `requisicao_id`, já desconta — B1453), a recriação depois do estorno recusado
   (`reservaChegadaService.js:881`, com `requisicao_id`), a recriação da reserva da OS (`reservaDaOs.js:264`, **sem** `requisicao_id`) e a
   reserva da OS (`reservaDaOs.js:205`, `criarReservaSemTrava`, sem `requisicao_id`). A reserva da OS fica **sobre** o impedido de propósito
   (B1381, `osNoImpedido`). Grep: nenhum outro `INSERT INTO reservas_material_almoxarifado` no servidor; `transferirReserva` não mexe no
   `quantidade_reservada`.
3. **A régua pronta**: `loteImpedido.loteImpedidoSql(m)` (205 + 217) — 0 sem `controle_lote`; a frase `fraseLoteImpedido(n, unidade)` →
   *"Não entram ⟨n⟩ ⟨un⟩ em lote bloqueado, reprovado ou vencido."*. O molde da aprovação: `disponivel − caixa dos outros − loteImpedido`
   (`saldoDisponivelParaItem`, `requisitionService.js:509`). O molde da recusa com corte: a separação (`requisitionService.js:1657-1661`,
   "a 2ª frase diz só o que o lote CORTOU do teto").
4. **A trava**: a reserva manual já roda sob `naTravaDoMaterial` (Etapa 97) e todo escritor do status/validade do lote também (B1461,
   B1468) — a leitura do impedido dentro do `hold` é consistente. Nenhuma trava nova; a por requisição não entra (a rota não a pega).
5. **A tela**: `ReservasAlmoxarifado.js` — `submitReserva` (`:179-205`) já mostra `err.response.data.error` no `toast.error`. O material
   vem de `/estoque` (`consultarEstoque`, `m.*` → traz `controle_lote`); o formulário mostra *"Disponível: ⟨n⟩ ⟨un⟩"* (`:508-511`), que
   continua contando o impedido (**C481**, fora).
6. **Testes que fixam a recusa de hoje**: `portasAvulsasCaixa.api.test.js` (`:330`, `:454` — sem lote, ficam iguais) e
   `portasAvulsasCaixaIntegracao` (`M3`). Nenhum fixa reserva manual sobre lote impedido (grep `criarReserva`/`/reservas` × `BLOQUEADO`).

## Caminhos

- **(escolhido) Só a reserva manual desconta, dentro do mesmo `UPDATE`** (`livre de caixa − loteImpedido`), com a 2ª frase na recusa
  quando o lote cortou algo. Reverter = tirar o termo do `WHERE` e a frase.
- **(descartado) Descontar em todas as reservas** (também as de `sistema`). A aprovação e o miolo já descontam antes de chamar (descontar
  de novo é inofensivo para elas, mas não acrescenta nada), e a reserva da OS converte **sobre** o impedido de propósito (B1381): seria
  recusada, e a recriação depois de um estorno recusado perderia a reserva da OS.
- **(descartado) Pré-checagem em JS antes do `UPDATE`.** Duas leituras (a conta e o claim) — o padrão do motor é a régua no próprio claim.

## Decisões (letra B — reversíveis; livres depois de **B1468**, **C525**, **A116**, conferido por `grep` em `docs` e `specs`)

- **B1469 — só a reserva manual desconta o lote impedido** (`!opcoes.sistema && !opcoes.requisicao_id` — hoje só a rota): a régua do
  `hold` vira `livreDeCaixa − loteImpedido` (o impedido lido por subconsulta com apelido próprio, `lim_mr`, correlacionada pelo id). As de
  `sistema` ficam byte a byte. Descartado: todas (a reserva da OS, B1381).
- **B1470 — a recusa diz o que o lote cortou**: `cortado = min(impedido, max(0, base))`, onde `base` é o número que a recusa já mostra
  (o livre de caixa, com caixa; o disponível, sem). Com `cortado > 0`: *"Saldo disponível insuficiente: ⟨base − cortado⟩⟨sufixo da caixa⟩.
  Não entram ⟨cortado⟩ ⟨un⟩ em lote bloqueado, reprovado ou vencido."*. Com `cortado = 0` (sem lote impedido, ou o livre já ≤ 0): a recusa
  de hoje, byte a byte. Descartado: mostrar o impedido inteiro (com o livre negativo, diria "não entram 6" quando o que faltou não foi o lote).
- **B1471 — a reserva manual de antes do bloqueio fica** (como a B1372 da aprovação): nada é revogado; ela conta contra o que pode sair, e a
  manual nova vê o resto.
- **B1472 — a fatia visível**: a recusa já aparece no `toast` da tela **Reservas**; e o formulário, quando o material escolhido tem controle
  de lote, mostra sob *"Disponível"* a linha *"Peças em lote bloqueado, reprovado ou vencido não entram na reserva."* (o número do
  "Disponível" continua o de hoje — C481). Descartado: o número já descontado no formulário (mexe em `/estoque`, que é a C481).
- **B1473 — sem migration, sem trava nova, sem rota nova**; contrato da rota igual (só a mensagem da recusa ganha a 2ª frase).
- **B1474 (Fase 2, achado I2) — a reserva da OS que está sobre o lote bloqueado conta contra a manual**, como já conta contra a aprovação de
  uma requisição de outra OS (B1381/B1460, **C522**): com L1 ATIVO 4, L2 BLOQUEADO 6 e a reserva da OS de 6, a manual de 1 é recusada com
  *"… 0. Não entram 4 un em lote bloqueado, reprovado ou vencido."* (hoje passava). A reserva não sabe o lote; a conta agregada supõe que as
  6 da OS estão no lote bom — é a mesma suposição conservadora da aprovação. Descartado: descontar a reserva da OS do impedido
  (`osNoImpedido` da aprovação) — a reserva manual não é da OS, e liberaria peça que pode estar bloqueada. **C526** registra o efeito.
- **Um "hoje" só (Fase 2, achado M1)**: o `hold` e a frase leem `loteImpedidoSql` com o mesmo `hojeISO` (passado aos dois) — à
  meia-noite entre as duas leituras, o lote vencido contaria num e não no outro.

## Regras de negócio (RN-221.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-221.01 | A reserva manual não conta o lote BLOQUEADO | L1 ATIVO 4 + L2 BLOQUEADO 6 (material `un`, controle de lote): `POST /reservas` de 4 → 201; de 5 → 400 `Saldo disponível insuficiente: 4. Não entram 6 un em lote bloqueado, reprovado ou vencido.`; nada muda (reservado, livro, reservas) |
| RN-221.02 | REPROVADO e vencido sem liberação também; vencido com o vencimento liberado conta | (a) L2 REPROVADO → o mesmo 400; (b) L2 ATIVO vencido (validade ontem) → o mesmo 400; (c) L2 vencido com `PUT /liberar-vencimento` → reserva de 10 → 201 |
| RN-221.03 | Só lote impedido: nada sai | só L2 BLOQUEADO 6: reserva de 1 → 400 `Saldo disponível insuficiente: 0. Não entram 6 un em lote bloqueado, reprovado ou vencido.` |
| RN-221.04 | Material sem controle de lote: igual a antes | `controle_lote = 0`, lote BLOQUEADO 6: reserva de 6 → 201 |
| RN-221.05 | Sem lote impedido, a recusa é a de hoje byte a byte | L1 ATIVO 4: reserva de 5 → 400 `Saldo disponível insuficiente: 4` (sem 2ª frase) |
| RN-221.05 b | (Fase 2) Base negativa (legado) com lote impedido: a recusa de hoje | só L2 BLOQUEADO 6, reservado 8 (legado): reserva de 1 → a mesma mensagem que o material sem controle de lote dá (sem a 2ª frase) |
| RN-221.05 c | (Fase 2, M1) Lote ATIVO que vence no futuro não corta | L1 4 com validade daqui a 30 dias: reserva de 5 → `Saldo disponível insuficiente: 4`; de 4 → 201 |
| RN-221.06 | A reserva manual de antes do bloqueio fica e conta (B1471); o corte é só o que o lote tirou | L1 4 + L2 6 ATIVOS; manual de 6 → 201; bloquear L2 → a reserva continua ATIVA; manual de 1 → 400 `Saldo disponível insuficiente: 0. Não entram 4 un em lote bloqueado, reprovado ou vencido.` (o disponível era 4: o lote cortou 4, não 6) |
| RN-221.07 | As reservas do sistema não mudam (B1469) | (a) `criarReserva(..., { sistema: true })` sem requisição (a recriação da reserva da OS) sobre só L2 BLOQUEADO 6 → reserva de 6 criada; (b) a aprovação continua reservando 4 de L1 (a RN-205.03 continua verde) |
| RN-221.08 | Pela rota e pelo serviço | o cenário da RN-221.01 também por `stockService.criarReserva(db, user, data)` (sem 4º argumento) → o mesmo erro, `status` 400 |
| RN-221.09 | Integração: recusada → liberar o lote → passa | **sem requisição esperando o material** (com uma esperando, a liberação reserva para ela — Etapa 220 — e a manual recusa, legítimo); só L2 BLOQUEADO 6: manual de 6 → 400; `POST /lotes/L2/certificado`… (ou `PUT /lotes/L2/status ATIVO`) → manual de 6 → 201; a saída contra essa reserva (`registrarMovimentacao` SAIDA com `reserva_id`) baixa 6 |
| RN-221.12 | (Fase 2, I1) Com caixa: o número é o livre de caixa menos o corte, o sufixo da caixa antes da 2ª frase | L1 4 + L2 BLOQUEADO 6; requisição de 3 aprovada sem estoque, entradas depois, separada 3 (caixa 3 sem reserva): manual de 2 → `Saldo disponível insuficiente: 1 — 3 un estão separados para a requisição … excluí-la). Não entram 6 un em lote bloqueado, reprovado ou vencido.`; de 1 → 201 |
| RN-221.13 | (Fase 2, I2, B1474) A reserva da OS sobre o bloqueado conta | L1 4 + L2 BLOQUEADO 6, reserva da OS (sistema) de 6: manual de 1 → `Saldo disponível insuficiente: 0. Não entram 4 un em lote bloqueado, reprovado ou vencido.` |
| RN-221.10 | A tela avisa (B1472) | `ReservasAlmoxarifado`: material com `controle_lote: 1` escolhido → o texto *"Peças em lote bloqueado, reprovado ou vencido não entram na reserva."*; com `controle_lote: 0` → não aparece |
| RN-221.11 | A tela mostra a recusa do servidor | `POST /reservas` 400 com a mensagem da RN-221.01 → `toast.error` com ela, literal |

## Contratos congelados

**`POST /api/almoxarifado/reservas`** — payload igual (`material_id`, `quantidade`, `projeto_id`, `os_id`, `os_referencia`, `cliente_id`,
`equipamento`, `submontagem`, `observacoes`, `data_necessidade`, `expira_em`). Resposta 201 `{ id }` (igual). Erros iguais (403 `Sem
permissão para reservar`, 400 `Quantidade da reserva deve ser maior que zero`, 404 do material), e a recusa de saldo:

- sem lote impedido cortando: `Saldo disponível insuficiente: ⟨n⟩` (sem caixa) / `Saldo disponível insuficiente: ⟨livre⟩⟨sufixo da caixa⟩`
  (com caixa) — **iguais a hoje**;
- com lote impedido cortando: `Saldo disponível insuficiente: ⟨base − cortado⟩⟨sufixo da caixa, se houver⟩. Não entram ⟨cortado⟩ ⟨un⟩ em
  lote bloqueado, reprovado ou vencido.` (a 2ª frase é `fraseLoteImpedido(cortado, unidade)`; sem unidade, sem o espaço).

**Serviço**: `criarReserva(db, user, data, opcoes)` — assinatura e retorno iguais; o desconto só quando `!opcoes.sistema &&
!opcoes.requisicao_id`.

**Tela (literal novo)**: `Peças em lote bloqueado, reprovado ou vencido não entram na reserva.`

## Tasks (sort topológico)

- [x] **T1 (tronco)** — `stockService.criarReservaSemTrava`: régua da manual com o impedido; recusa com o corte (B1469/B1470, B1474, o
  "hoje" único). Testes RN-221.01 a .09, .05 b/c, .12, .13 em `server/tests/api/reservaManualLoteImpedido.api.test.js` — `156adb41`.
- [x] **T2 (galho, consome o contrato)** — `ReservasAlmoxarifado`: a linha do aviso (RN-221.10) e o teste da recusa (RN-221.11) — `e386d335`. Feita depois da T1 no mesmo fluxo (não em paralelo: é pequena).
- [x] **T3 (integração)** — RN-221.09 pela rota (reserva recusada → `PUT /lotes/:id/status ATIVO` → reserva → saída v2 contra ela, que
  a consome), no mesmo arquivo da T1 (por isso depois dela, não em paralelo — Fase 2, M3) — `156adb41`.
- [x] **T4 (Fase 5, não estava no plano)** — a transformação no terceiro faz o claim do item sob a trava do material (**B1475**,
  RN-221.14) e as 4 lacunas de teste (RN-221.03 b, .12 b, .05 d, RN-221.10 b) — `8395f440`.

## Sabotagens previstas (controle positivo)

1. sem o termo do impedido no `hold` → RN-221.01/.02/.03/.06/.08/.09 caem; 2. desconto também em `sistema` → RN-221.07 a; 3. sem a 2ª frase
→ RN-221.01/.03/.06; 4. a 2ª frase sempre (sem a guarda `cortado > 0`) → RN-221.05; 5. `cortado` = impedido inteiro (sem o `min`) →
RN-221.06 (o disponível 4 é menor que o impedido 6: diria `-2 … Não entram 6`); 6. tela sem a guarda de `controle_lote` → RN-221.10 (o "não aparece").

## Fase 2 — revisão do plano (1 revisor fresco)

Sem trava. **2 importantes:** (I1) nenhuma RN tinha caixa — a base errada (o disponível em vez do livre de caixa) passaria por todas as
sabotagens → **RN-221.12** (aceito; sabotagem 9); (I2) a reserva da OS sobre o lote bloqueado conta contra a manual (hoje passava) → **B1474**
+ **RN-221.13** + **C526** (aceito como decisão conservadora, igual à aprovação). **4 menores:** (M1) o `hold` e a frase com o mesmo
"hoje" → um `hojeISO` passado aos dois + **RN-221.05 c** (aceito; sabotagem 11); base negativa com lote impedido sem RN → **RN-221.05 b**
(aceito); (M3) T3 no mesmo arquivo da T1 → sequencial (aceito); a RN-221.09 tem de dizer "sem requisição esperando" (aceito); a caixa
separada de lote impedido **antes** da 205 desconta duas vezes (recusa a mais, segura) → **D (221)** (aceito). Confirmado por sonda: todos os
outros chamadores passam `sistema: true`; a subconsulta correlacionada funciona no `WHERE` do `UPDATE`; nenhuma trava nova; nenhum gesto
posterior (liberar, expirar, transferir, a saída que consome, a aprovação) recusa o que a reserva manual aceitou. A T2 começou em paralelo com
a revisão (o contrato dela — o literal e o `controle_lote` de `/estoque` — não mudou com os achados).

## Execução e controles (medidos)

`reservaManualLoteImpedido.api.test.js` **16/16** em `156adb41`, **20/20** depois da Fase 5 (`8395f440`). Vermelho antes da T1: **5 passou,
7 falhou** (os 5 verdes são as regras "não muda": .02 c, .04, .05, .07 a/b). Tela: `ReservasAlmoxarifado.test.js` **32/32** (30 + 2), **33/33**
depois da Fase 5.

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | sem o termo do impedido no `hold` | RN-221.01, .02 a, .02 b, .03, .06, .08, .09, .12, .13 |
| 2 | desconto também nas de `sistema` | RN-221.07 a, .13 |
| 3 | sem a 2ª frase | RN-221.01, .02 a, .02 b, .03, .06, .08, .09, .12, .13 |
| 4 | a 2ª frase sempre (sem a guarda do corte) | RN-221.05, .05 b |
| 5 | `cortado` = impedido inteiro (sem o `min`) | RN-221.06, .13, .05 b |
| 9 | a base sempre o disponível (sem o livre de caixa) | RN-221.12 |
| 10 | base negativa vira corte (`abs`) | RN-221.05 b |
| 11 | outro "hoje" na frase (+400 dias) | RN-221.05 c, .05 d (sobreviveu antes da .05 c existir) |
| 12 | unidade fixa `un` (Fase 5) | RN-221.03 b |
| 13 | o corte contra o disponível, não contra o livre de caixa (Fase 5) | RN-221.12 b |
| 14 | "hoje" + 1 dia no `hold` (Fase 5) | RN-221.05 d |
| 15 | "hoje" + 1 dia na frase (Fase 5) | RN-221.05 d |
| 16 | a transformação sem a trava (o claim fora, Fase 5) | RN-221.14 |
| 6 (tela) | sem a guarda de `controle_lote` | RN-221.10 |
| 7 (tela) | sem o aviso | RN-221.10 |
| 8 (tela) | `toast` genérico | RN-221.11 |
| 17 (tela) | a guarda também exige `controle_serie !== 1` (Fase 5) | RN-221.10 b |

Restauro conferido por md5/igualdade depois de cada rodada.

## Fase 5 — revisão adversarial (3 revisores frescos em paralelo: regra, travas/concorrência, "o teste passaria com a feature quebrada?")

Proibidos de editar o repositório; sondas `e221-rev-*.js` no scratchpad; o de testes mutou uma worktree própria (22 mutações no servidor, 6 na
tela, cópia + conferência).

1. **[TRAVAS, real, reproduzido, ANTERIOR] O claim da transformação no terceiro fora da trava.** `thirdPartyService.registrarTransformacao`
   gravava `quantidade_retornada` do item fora da trava do material e só o `CONSUMO_TERCEIRO` pegava a trava (dentro do motor). Entre os dois,
   o retido do lote (`retidoDoLote.js`, 217) perdia a parte em terceiros do lote bom, que ia para o "resto" que `loteImpedidoSql` tira do lote
   impedido: o impedido caía de 6 para 4. Sonda (sem gancho em produção: o teste segura a trava, enfileira a reserva, dispara a transformação e
   solta): L1 ATIVO 2 enviado ao terceiro, L2 BLOQUEADO 6 → reserva manual de 2 **201** (final: reservado 2 sobre peças que só existem em L2
   bloqueado). Alcançava também a aprovação e a separação (desde a 217). **B1475**: claim, consumo e o desfazer do claim numa seção só sob
   `naTravaDoMaterial` do material enviado (o molde do retorno, 218); a compensação desfaz consumo, em-terceiros e claim sob a mesma trava; os
   créditos dos resultados (outros materiais) ficam fora. **RN-221.14** — `8395f440`. Depois: 400.
2. **[TESTE, real] 4 lacunas** (mutações sobreviventes): a unidade fixa `un` na frase → **RN-221.03 b** (PC); o corte medido contra o
   disponível em vez do livre de caixa → **RN-221.12 b** (caixa 6 maior que o livre 4); o "hoje" +1 dia no `hold` ou na frase → **RN-221.05 d**
   (lote que vence hoje); a tela com a guarda também exigindo "sem série" → **RN-221.10 b** — `8395f440`. Equivalentes: `manual = !sistema`
   (todo chamador com `requisicao_id` passa `sistema`), o corte sem a guarda `manual` (só muda texto de recusa de reserva do sistema, que vai
   para log), `>`/`>=` no corte (arredondado, nunca negativo), os `Math.max` internos, a guarda da tela por verdade (`/estoque` manda 0/1).
   Fora da 221: tirar o `livreMostrado` da base com caixa sobrevive a todas as suítes (a caixa com livre negativo apareceria sem o 0) —
   **anterior**, registrado em D (221).
3. **[REGRA] nenhum achado reproduzido.** Sondas: quantidades fracionadas na folga (0,3 − 0,1), unidade nula, lote + série, material de
   cliente, vencido com `vencimento_liberado_em = ''`, lote que vence hoje — todos com o número e a frase certos; a recusa e a frase não
   discordam (mesma SQL, mesmo "hoje", mesma seção). Notas (não achados): a base negativa sem caixa aparece negativa (anterior, RN-221.05 b a
   mantém); a reserva antiga sobre o bloqueado recusa a mais (B1471/B1474, C526).

Sem auto-espera nem ordem nova de trava: a 221 não pega trava nova (o `hold` roda na seção que a reserva já segura); a B1475 usa a trava por
material do material enviado, e a rota da transformação não está em seção nenhuma.

## Fechamento

- [x] Fase 5 — 3 revisores; **1 corrida anterior** corrigida (B1475), **4 lacunas de teste** fechadas, 0 achado de regra, 0 ruído —
  `8395f440`.
- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1469–B1475, C479 resolvido, C526, D (221), F (221),
  seção, topo e "onde estamos"), spec 07, mapa, guia (seção e cabeçalho), manual (9.1 e 9.3 — duas frases do 9.3 estavam velhas: diziam que
  a chegada da nota não desconta o lote impedido (errado desde a 219) e que liberar o lote não reserva (errado desde a 220); reescritas), este
  plano e a estimativa.

### Divergências do plano

- **RN-221.05 b/c/d, .03 b, .12, .12 b, .13, .14, RN-221.10 b** e as decisões **B1474** (Fase 2) e **B1475** (Fase 5) não existiam no plano.
- **A T4 (a transformação no terceiro)** saiu da 221: é uma porta que alimenta o `loteImpedidoSql` sem a trava — o defeito era anterior,
  mas a garantia da 221 ("a leitura é consistente sob a trava") dependia dela.
- A T2 começou em paralelo com a revisão da Fase 2 (o contrato dela não mudou).

### Retro (4 números)

- **Rodadas até verde na Fase 5:** 1 (os testes novos passaram na primeira, cada um com controle positivo).
- **Achados reais:** Fase 2: 2 importantes + 4 menores (todos aceitos). Fase 5: 1 corrida anterior (corrigida), 4 lacunas de teste
  (fechadas), 0 de regra; 0 ruído.
- **Paralelismo:** sem galhos de código em paralelo (T2 pequena, depois da T1); a revisão da Fase 2 rodou junto com a T1/T2; 3 revisores da
  Fase 5 em paralelo (o de testes numa worktree própria) — sem contaminação. A 1ª rodada do `test:api` rodou durante a Fase 5 (sobre
  `e386d335`); a verificação final foi refeita depois de `8395f440`.
- **Defeito que escapou da 220:** nenhum achado nesta etapa.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 221 fecha o C479 — a última porta que reservava peça de lote impedido. A spec 07 continua 🟢; o
vizinho de maior valor **visível** é o **C481** (as telas de saldo mostram o lote impedido como disponível) — e a semana pede algo na tela.
**Sem estimativa** — começa pela Fase 0.5.)*

**O extrato do material diz quanto está em lote impedido (C481, 1ª parte).**

- **Onde:** `GET /api/almoxarifado/materiais/:id/extrato` (o modal `ExtratoMaterialModal.js:75`, KPI *Disponível* em `:165`) e o formulário
  **Nova Reserva** (`ReservasAlmoxarifado.js`, a linha da B1472). Um material só por chamada — `loteImpedido.loteImpedidoSql('m')` custa uma
  passada pelos lotes dele (barato), ao contrário da lista `/estoque` (todos os materiais — medir antes de levar a ela).
- **O que está pronto e não reabre:** a régua `loteImpedidoSql` (205 + 217) e a frase `fraseLoteImpedido`; o *Disponível* continua o de
  sempre (a aprovação, a separação, a reserva manual e a entrega já descontam por conta própria — **não** mudar o número das telas, só
  mostrar a parte impedida ao lado).
- **A decisão a tomar (letra B, reversível):** (1) campo aditivo `lote_impedido` no material do extrato (e, se a medida deixar, no
  `/estoque`); (2) a tela mostra um KPI *"Em lote impedido"* ou uma linha sob o *Disponível* (*"⟨n⟩ ⟨un⟩ em lote bloqueado, reprovado ou
  vencido — não sai"*); (3) se o formulário de reserva troca o aviso fixo da B1472 pelo número.
- **Pontos de atenção:** leitura sem trava (só exibe); o "hoje" de Brasília (`diaLocal`); material sem controle de lote → 0 e nada na
  tela. Vizinhos baratos que seguem abertos: C519, C521, C524, C525, C526, C514–C518, C486, C491, C495, C497, C498.
