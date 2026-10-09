# Etapa 97 — as portas avulsas do motor não levam o material que está na caixa sem reserva de uma requisição (B466 iv, feature 03 com a 05 e a 07)

> Status: **EM EXECUÇÃO — 2026-10-09: Fase 2 `4a9cf5c1`; T0 `9ace72b2`, T1 `65dc74b2` feitas (seção "Execução" no fim).** Próximo: **T2**, depois T3, T4 — **o plano foi revisto na Fase 2**
> (seção "Fase 2 — revisão do plano", antes de "Próximo passo"; ela vale sobre o texto acima). Nenhuma task marcada.
> HEAD de partida: `b15640f3` (main, árvore limpa, sem push).
> Origem: "Próxima tarefa detalhada — Etapa 97" no fim de
> `docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md`; B466 (iv) e D (95), D (96).
> **A Fase 0 mediu que o defeito é mais largo (14 portas, não 9 — 17 depois da Fase 2, B-2) e que o contrato provável da 96 para a entrega
> ("exclui só a caixa da própria requisição") prende a entrega que hoje sai** — ver "O que contradiz a próxima tarefa
> escrita na 96".
>
> **Numeração:** etapa única para todos os módulos (esta é a **97**). Letras de `docs/almoxarifado-novidades-por-etapa.md`
> conferidas em 2026-10-09 (`grep` no documento e em `docs/`/`specs/`): última **B490**, último C **183**, última **A47**
> (B491/C184/A48 só aparecem no plano da 96, como "livres"). Esta etapa reserva **B491–B498**, **C184–C189** e **A48**.

**Escopo desta etapa (o que a Fase 0 reproduziu — e só isso):**
1. **Uma régua só para "o que está livre fora da caixa"** — `livreDeCaixaSql` = `disponivelSql` − caixa sem reserva de
   todas as requisições com caixa —, num módulo novo (`caixaSql.js`) para o motor poder lê-la sem ciclo de `require`.
   O `disponivelSql` **não muda** (B491).
2. **As portas avulsas recusam pelo livre de caixa:** a saída comum do motor (todos os `TIPOS_SAIDA` que tiram do
   disponível, por qualquer rota — v2, v1, retalho, devolução ao cliente), o envio a terceiro, o bloqueio avulso, a
   reserva manual, o estorno de entrada, o `AJUSTE`/`AJUSTE_INVENTARIO` **sem** localização, **os estornos do `AJUSTE`
   (com e sem localização) e do `DESBLOQUEIO` avulso (corrigido na Fase 2, B-2)**, e as pré-checagens fora do motor
   (remessa, sucateamento, inventário).
3. **A entrega da requisição e as reservas de requisição ficam com a régua de hoje** (a caixa delas é a conta da 95) —
   marca no 4º argumento, nunca do body (B492).
4. **A literal de hoje, com sufixo que nomeia a caixa** — sem caixa, idêntica byte a byte (B493).
5. **A porta avulsa sob a trava por material:** o motor pega a trava quando a seção do contexto **não segura** o material
   agora — e não por `secao.ativa` (corrigido na Fase 2, B-1) (B494).
6. **A48** — consulta para produção que acha as requisições que o defeito já prendeu.

**Fora (declarado, ver "O que fica de fora"):** o `AJUSTE` **com** localização — o de ida; o **estorno** dele entra
(corrigido na Fase 2, B-2) — (D1/D7 da Etapa 10, B495); um gesto
novo "devolver da caixa à prateleira" (B497); a tela mostrar a caixa no disponível; as requisições já presas (A48 acha,
as saídas legítimas de hoje resolvem); caixa por endereço (`CLAUDE.md`: saldo global é intencional).

---

## Fase 0 — medido (2026-10-09)

Sondas no scratchpad da sessão (`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM\7ead12bf-e959-4c36-bd6b-6614fb9c9bcd\scratchpad`),
harness `e95-h.js` (`testApp` com `requirePermission` real, usuário por header `x-u`, molde 92–96); saída `*.out` ao
lado de cada sonda. **S** sem perfil cria por `POST /api/requisicoes-material`; **ADMIN** superadmin aprova e movimenta
por `POST /api/almoxarifado/movimentacoes/v2`; **ALMOX**/**ALMOX2** (`ALMOXARIFE`) separam e entregam. Tudo no HEAD
`b15640f3` (código da 96).

**Montagem (estado novo por cenário):** material PC com físico 0; S pede 4; ADMIN aprova (*Aprovado*, reservas `[]`);
`ENTRADA` 4 avulsa; ALMOX separa 4 → *Em Separação*, físico 4, reservado 0 — **caixa sem reserva 4**. Depois, a porta; e
A tenta entregar os 4.

**Detector:** cada linha escreve à mão o certo ("a porta recusa levar a caixa" ou "A ainda entrega") e compara.
**Controles do detector:** a mesma montagem com a caixa **coberta pela reserva** (o motor já protege — tem de dar CERTO)
e três gestos que **não** tocam a caixa (consumo e liberação de reserva manual; transferência). Duas linhas deram
CERTO falso e foram **descartadas** e re-medidas (abaixo).

### Sonda s1 — as 9 portas da 96 (`e97f0-s1-caixa-portas.js`, re-executada → `e97-sonda-s1-rerun.out`)

Reproduz **igual** ao plano da 96: placar cru **10/12 ERRADO, 2 CERTO** → **9/9 portas ERRADO, controle CERTO**.
`SAIDA` 4, `AJUSTE_NEGATIVO` 4, `AJUSTE` para 0 com localização, `PERDA` 4, remessa (criar + enviar), `bloquear` 4,
`POST /reservas` 4 → 201/200 e A entrega → **400** *"⟨material⟩: não é possível entregar 4 PC. Máximo: 0 (pendente: 4,
disponível: 0)"*, fila `AGUARDANDO_SALDO`; `AJUSTE` para 1 sem localização → 201 e *"Máximo: 1"*; parcial (reserva 2,
caixa 4) `SAIDA` 2 → 201 e *"Máximo: 2"*. **Controle** (reserva 4 cobre a caixa) `SAIDA` 4 → 400 *"Saldo insuficiente.
Disponível: 0 PC"*, A entrega 200. Descartados como na 96: `SAIDA_PRODUCAO` sem OS (o 400 é da regra de OS — re-medida
na s2) e o sucateamento só **solicitado** (re-medido na s2b).

### Sonda s2 — as portas que a 96 não mediu (`e97-sonda-s2-portas-nao-medidas.js`, `e97-sonda-s2b-sucateamento.js`, `e97-sonda-s2c-transferencia.js`)

| porta (ADMIN, salvo dito) | resposta | estado depois | A entrega os 4? | |
|---|---|---|---|---|
| **P1 inventário**: conferência (categoria isolada, tolerância 100), conta 0, `concluir` com `aplicar_ajustes` (`AJUSTE_INVENTARIO`) | **200** | físico 0 | **400** *"Máximo: 0"* | ERRADO |
| **P2 estorno da `ENTRADA`** que trouxe os 4 (`POST /movimentacoes/:id/cancelar`) | **200** | físico 0 | **400** *"Máximo: 0"* | ERRADO — **porta que não estava na lista da 96** |
| **P3 `SAIDA_PRODUCAO`** 4 com `emergencial: true` | **201** | físico 0 | **400** | ERRADO (a descartada da 96, medida) |
| **P4 v1** `POST /movimentacoes` `SAIDA` 4 (modal rápido de Materiais) | **201** | físico 0 | **400** | ERRADO |
| **P5 sucateamento até a baixa** (s2b: solicita ALMOX2, assina ALMOX e ADMIN) | 201 / 200 / **200** | físico 0 | **400** *"Máximo: 0"* | ERRADO |
| ~~P5 na s2~~ (ADMIN solicitou e assinou: 403 *"Quem solicitou … não aprova"*) | — | — | — | **descartada** (CERTO falso: o 403 não é a caixa) |
| **P6** `bloquear` **10** com físico 4, **sem** caixa | **200** | bloqueado 10 | — | ERRADO — **lacuna pré-existente**: o `BLOQUEIO` do motor (`stockService.js:1476`) não tem guarda nenhuma |
| **P7** `AJUSTE` com localização para 0, reserva manual 4, **sem** caixa | **201** | físico 0, reservado 4 | — | ERRADO — **D1/D7 da Etapa 10, de propósito** (`ajusteRetencao.api.test.js:74` prende "passa") |
| C1 controle: reserva manual 2, `SAIDA` 2 com `reserva_id` | 201 | — | 200 | CERTO (consumo de reserva não toca a caixa) |
| C2 controle: reserva manual 2, liberar | 200 | — | 200 | CERTO |
| C3 caixa **endereçada** (separou com origem LA) e `TRANSFERENCIA` LA→LB | 201 | — | 400 *"a origem da separação (LA) não serve mais (…) — entregue escolhendo de onde sai"*; s2c: entregar com `localizacao_origem_id` LB → **200** `ENTREGUE` | CERTO (saída guiada pela literal; não é armadilha) |

**Placar das portas da caixa: 14 de 14 ERRADO** (9 da s1 + inventário, estorno de entrada, `SAIDA_PRODUCAO`, v1,
sucateamento) — **a Fase 2 achou mais 3** (estornos do `AJUSTE` sem e com localização e do `DESBLOQUEIO` avulso,
`e97rv/r1-estornos.js` 6/6 ERRADO): **17 de 17**; **controles 4 de 4 CERTO** (reserva cobre a caixa; consumo e liberação de reserva manual; transferência).
P6 e P7 são lacunas vizinhas, sem caixa — P6 entra pela porta da B496, P7 fica fora (B495).

### Sonda s3 — o caso legítimo: material da caixa perdido/quebrado (`e97-sonda-s3-saidas-legitimas.js`) — 6/6 CERTO (o que existe hoje)

| gesto | resultado | a caixa depois |
|---|---|---|
| L1 `PUT /requisicoes/:id/cancelar` em *Em Separação* | 400 *"Não é possível cancelar neste status"* | 4 |
| L2 `PUT /requisicoes/:id/encerrar` em *Em Separação* | 400 *"Transição inválida: EM_SEPARACAO → ENCERRADA"* | 4 |
| L3 entregar 2 (o que sobrou) → *Parcialmente Atendida*; `encerrar` → *Encerrada*; `PERDA` 2 | 200 / 200 / **201** | 2 → **0** |
| L4 `DELETE /requisicoes/:id` (ADMIN) | 200, `ativo 0`, *Cancelado* | **0** |
| L5 `DELETE` por ALMOXARIFE | 403 *"Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições"* | 4 |
| L6 separar 0 (reabrir) | 200, separado continua 4 | 4 — **não há gesto que devolva a caixa à prateleira** |

**Leitura:** hoje, quando o material da caixa se perde, a `PERDA` passa e a requisição fica presa para sempre
(*"Máximo: 0"*) — e o único jeito de soltá-la é o mesmo que existiria depois da 97 (entregar o que existe e encerrar, ou o
administrador excluir). **A 97 inverte a ordem, não cria a dependência do administrador:** primeiro a requisição sai da
frente, depois a baixa — e o livro fica honesto. Com **tudo** perdido (nada a entregar) só a exclusão solta (L4/L5),
hoje e depois. Gesto novo para isso = B497 (fora).

### Sonda s4/s4b — a corrida porta avulsa × separação (`e97-sonda-s4-corrida.js`, `e97-sonda-s4b-corrida-gancho.js`)

Contra um **protótipo do claim novo** (o `UPDATE` da saída comum com `livreDeCaixaSql` no `WHERE`, rodado pela sonda —
sem mexer no código), físico 4, A aprovada sem reserva; em paralelo: A separa 4 ‖ claim de 4. Errado = os dois vencem
(caixa 4 sobre físico 0).

- **Controle do protótipo** (sequencial: separa, depois o claim): o claim **recusa** — CERTO (o protótipo sabe falhar;
  e prova que `materiais_almoxarifado.id` correlaciona dentro do `UPDATE` de tabela única).
- **s4, atrasos de 0–4 ms:** solto **0/20**, sob trava **0/20** — **teste vazio**: nenhuma rodada caiu na janela. Não
  prova nada (é o quarto caso de "passou de primeira" da base).
- **s4b, gancho determinístico** (segura a escrita de `quantidade_separada`, `requisitionService.js:1032`, depois de a
  separação ler o teto, e dispara o claim ali): **solto 10/10 ERRADO** (separado 4, físico 0, os dois 200/ok); **claim
  dentro de `comLockDoMaterial` 0/10** (o claim espera a separação soltar e recusa). **A janela existe e a trava fecha.**

### Sonda s5 — o contrato "a entrega exclui só a própria caixa" (`e97-sonda-s5-entrega-propria-caixa.js`)

A e B separam 4 cada com físico 8; uma `SAIDA` avulsa leva 4 (o defeito) → físico 4, caixas 8. **HEAD:** A entrega 4 →
**200** (a entrega da própria caixa vai pelo `estoque`, `maxEntregar` da 95). **Protótipo da 96** (disponível − caixa das
**outras** requisições): 4 − 4 = **0** → a entrega de A seria **recusada**. **ERRADO** — o contrato provável da 96 prende
o que hoje sai. Decisão na B492.

### Sonda s6 — a consulta A48 (`e97-sonda-s6-consulta-a48.js`, SQL em `e97-a48.sql`) — 1/1 CERTO

Três materiais: X com o defeito (caixa 4, físico 0), Y (caixa 4, físico 4) e Z (caixa coberta pela reserva). A consulta
devolve **só X**, com *"REQ-… (EM_SEPARACAO, 4.0)"* — acha e não acha (controle nos dois sentidos).

### Onde a régua entra (lido no HEAD `b15640f3`)

- **Motor** (`stockService.js`): pré-checagem da saída `:1423-1426` e o claim da saída comum `:1812-1817` (ramo
  `else`, depois de `consumindoReserva` `:1724` e de `baixandoBloqueado`); `REMESSA_TERCEIRO` `:1551-1559`; `BLOQUEIO`
  `:1476-1480` (sem guarda); `AJUSTE`/`AJUSTE_INVENTARIO` sem localização `:1437-1446` (`motivoRecusaAjustePorRetencao`
  `:95`); estorno de entrada em `cancelarMovimentacao` `:2587-2593` e `mensagemEstornoSemDisponivel` `:2957`;
  `criarReserva` `:3013`, hold `:3026-3034`.
- **Fora do motor:** `inspectionService.bloquearMaterial` `:463` (porta do bloqueio avulso); `returnService.js:209`
  (`BLOQUEIO` da devolução para quarentena — interno, fica como está); `thirdPartyService.enviarRemessa` pré-checagem
  `:205`; `scrapDisposalService` pré-checagem `:203`/`:243`; inventário `routes/almoxarifado.js:1563-1640`
  (pré-validação `:1604`, aplicação `:1626`).
- **Já fora da régua, de propósito:** consumo de reserva (`consumindoReserva` — C1), baixa de terceiro e do bloqueado
  (`baixandoTerceiro`, `baixandoBloqueado`), transferência (não muda o físico — C3).
- **O helper:** `requisitionService.caixaSemReservaSql` (`:152`), que lê `STATUS_COM_CAIXA`
  (`requisitionStateMachine.js:109`). **`requisitionService` requer `stockService`** (`:11`): o motor não pode ler o
  helper de lá (ciclo). `requisitionStateMachine` requer só `db` e `availabilitySql` (e `purchaseService` preguiçoso) —
  um módulo novo que o requeira não fecha ciclo com o motor.
- **A marca da entrega já existe:** `opcoes.requisicaoDaEntrega` (4º argumento, `requisitionService.js:1522`; lida em
  `stockService.js:1089`). A reserva de requisição já se distingue por `opcoes.requisicao_id` (4º argumento de
  `criarReserva`, `:3062`). **O `requisicao_id` do `params` não serve:** a v2 repassa o body inteiro.
- **Travas:** `registrarMovimentacao` não pega nenhuma; a separação pega requisição → material (`requisitionService.js:809`);
  a entrega, a aprovação, a nota, a inspeção e a NC chamam o motor **dentro** da seção do material. `cancelarMovimentacao`
  roda **fora** de seção e chama `recalcularStatusSobTrava` (que pega a trava — `stockService.js:2986`): embrulhá-lo
  inteiro travaria a si mesmo (a trava não é reentrante).

---

## Decisões reversíveis (letra B do documento de novidades; última usada: B490)

- **B491 — a regra: as portas avulsas recusam pelo "livre de caixa" (disponível do motor − caixa sem reserva de todas as
  requisições com caixa), sem mexer no `disponivelSql`.** **Descartados:** (b) **a caixa dentro do `disponivelSql`** —
  os 15 leitores mudam juntos, a separação e a aprovação da 95 descontariam a caixa duas vezes (`tetoSeparacao`, B469),
  relatórios e fila mudam de número, e a entrega da própria requisição seria recusada (s5); (c) **só avisar** — não
  protege, a entrega continua presa (o defeito medido); (d) **a porta leva da caixa explicitamente** (opção "levar da
  caixa" que baixa também o separado do item) — o motor escreveria estado de requisição, sem a trava por requisição nem
  a trilha da separação; é gesto novo (B497). Reversível: a régua volta a ser o `disponivelSql` trocando um helper.
- **B492 — a entrega da requisição e as reservas de requisição ficam com a régua de hoje.** A entrega
  (`opcoes.requisicaoDaEntrega`) e `criarReserva` com `opcoes.requisicao_id` (aprovação, chegada, recriação no estorno)
  comparam com o `disponivelSql` de sempre — a caixa delas já é a conta da 95 (`maxEntregar`/`tetoSeparacao`, B469,
  B475). **Descartados:** (i) **excluir só a caixa da própria requisição** (o contrato provável da 96) — a s5 mede que
  prende a entrega da própria caixa quando as caixas somam mais que o físico (o estado que este defeito e o legado da
  A45 produzem): HEAD 200, protótipo livre 0; (ii) **ler a exclusão do `params.requisicao_id`** — a v2 repassa o body:
  qualquer `SAIDA` avulsa com `requisicao_id` no corpo pularia a régua. Só o 4º argumento.
- **B493 — a literal: o prefixo de hoje + um sufixo que nomeia a caixa, as requisições e a saída; sem caixa, idêntica
  byte a byte.** **Descartados:** (i) **só o número menor** em *"Disponível: ⟨d⟩"* — o operador vê físico 4 na tela de
  Materiais e *"Disponível: 0"* no erro, sem saber por quê; (ii) **literal nova inteira** — quebra os testes e as telas que
  casam o prefixo, e muda a recusa de quem não tem caixa nenhuma.
- **B494 — a porta avulsa sob a trava por material, pelo próprio motor.** `registrarMovimentacao` e `criarReserva` pegam
  a trava do material quando chamados **fora** de uma seção — **"dentro" = a seção do contexto segura o material agora
  (`secao.materiais.has(m)`, que deixa de guardar o que já foi solto), nunca `secao.ativa` (corrigido na Fase 2, B-1)**; dentro de uma seção que **já segura** o material rodam
  direto (a entrega, a aprovação, a nota — sem deadlock, a trava não é reentrante); dentro de uma seção que **não** o
  segura, rodam direto como hoje (o invariante da 91 proíbe aninhar fora de `comLockDosMateriais`). O estorno de entrada
  pega a trava **só em volta do claim** (embrulhar `cancelarMovimentacao` inteiro travaria em `recalcularStatusSobTrava`).
  **Descartados:** (i) **declarar a corrida** — s4b 10/10 ERRADO; (ii) **a trava em cada rota/serviço** — 11+ portas, e a
  próxima porta esquece (foi assim que a 91 começou); (iii) **variante `sobTrava` explícita** (molde
  `reservaChegadaService`) — desnecessária: a seção já diz quem segura (`materiaisForaDaSecao`).
- **B495 — o `AJUSTE` com localização fica fora.** O total novo do material só existe depois do `syncMaterialTotals`
  (D1/D7 da Etapa 10), e o teste `ajusteRetencao.api.test.js:74` prende que a contagem por endereço passa mesmo abaixo
  da retenção (material sem linhas: o endereço redefine o total). **Descartado:** projetar o total (soma das linhas − a
  linha do endereço + o pedido) e recusar — reabre uma decisão da Etapa 10 com teste que a prende, e mudaria a recusa
  para reservas também. A porta 2b fica aberta e declarada (C186).
- **B496 — o bloqueio avulso ganha guarda (claim pelo livre de caixa), por opção do 4º argumento.**
  `inspectionService.bloquearMaterial` chama o motor com `{ bloqueioAvulso: true }`; o `BLOQUEIO` sem a opção (a
  devolução para quarentena, `returnService.js:209`, logo depois da `ENTRADA_DEVOLUCAO`) fica como está. Consequência:
  o bloqueio avulso acima do que pode ser bloqueado passa a ser recusado (P6). ~~inclusive sobre material **reservado**
  (libera a reserva antes)~~ — **corrigido na Fase 2 (I-5, reproduzido em `e97rv/r2-pares-internos.js` (b)):** a guarda
  **não conta o reservado** — bloqueável = `quantidade_atual − bloqueada − em inspeção − em terceiros − caixa sem
  reserva`. Com o texto de antes a qualidade perdia o bloqueio do reservado: o GESTOR tem `ajustar_estoque` (bloqueia) mas
  não `liberar_reserva_requisicao` (`permissions.js:114`, só ADMINISTRADOR/ALMOXARIFE) — não teria como "liberar antes".
  P6 continua fechada (bloquear 10 com físico 4 → 400); reter o reservado continua possível. **Descartados:** (i) guarda no `BLOQUEIO` de todos — num estado já inconsistente a devolução quebraria
  depois da entrada gravada; (ii) guardar "só a caixa" e deixar bloquear o reservado — não há conta limpa: bloquear o
  reservado já deixa o disponível negativo, que a RN-06 da Etapa 10 recusa no ajuste. **(Fase 2, I-5: o (ii) é, em essência, o escolhido — a conta limpa é a do
  físico não retido; o disponível negativo por bloquear o reservado já existe hoje e é o que a qualidade precisa.)**
- **B497 — o caso legítimo (perdido/quebrado na caixa) não ganha gesto novo nesta etapa.** As saídas de hoje (s3):
  entregar o que existe e encerrar (L3), ou o administrador do almoxarifado excluir (L4); a literal (B493) as ensina.
  **Descartados:** (i) gesto **"devolver da caixa à prateleira"** (reduzir o separado com motivo e trilha) — rota,
  estado e permissão novos, etapa própria; **é o candidato natural da 98** se o André quiser o almoxarife resolvendo
  sem o administrador; (ii) "levar da caixa" na porta (B491 d).
- ~~**B498 — `permite_saldo_negativo` continua passando por cima da caixa nas saídas, como passa por cima da reserva; o
  ajuste não** (…). Com a flag, a entrega também sai (físico negativo) — a requisição não fica presa. **Descartado:** a
  caixa valer mesmo com a flag.~~ **B498 — invertida na Fase 2 (I-1, reproduzido em `e97rv/r5-flag-negativo.js`): a
  caixa vale mesmo com `permite_saldo_negativo`.** O texto de antes estava **errado**: "com a flag, a entrega também sai"
  — `maxEntregar` (95) não honra a flag; com a `SAIDA` 4 passando pela flag, A ficava presa em *"Máximo: 0"* igual.
  Regra: com a flag, a saída comum e o estorno de entrada passam se o material **não tem caixa sem reserva** (como hoje,
  físico pode ficar negativo) **ou** se `quantidade_atual − caixa ≥ q` (a flag dispensa reserva e retenções, nunca a
  caixa); ⟨n⟩ de M1/M5 nesse caso = `max(0, quantidade_atual − caixa)`. O ajuste continua sem a flag (RN-06 da Etapa
  10). **Descartados:** (i) a flag passar por cima da caixa (o texto original) — a requisição fica presa; (ii) a caixa
  **desligar a flag inteira** (`flag AND caixa = 0`) — com qualquer caixa a flag deixaria de dispensar a reserva, mais
  forte que o necessário.

---

## Regras de negócio

Os testes levam o prefixo `[97 RN-xx]`; o manual cita pelo conteúdo. **"Caixa sem reserva"** = `caixaSemReservaSql`
(95, B466/B473): por item de requisição ativa num status de `STATUS_COM_CAIXA`, `max(0, separado − entregue − reserva
ATIVA de origem REQUISICAO do item)`. **"Livre de caixa"** = disponível do motor − caixa sem reserva do material
(arredondado, `Q.qtd`). **"Montagem"** = a da Fase 0 (caixa sem reserva 4 sobre físico 4).

- **RN-01 (as portas avulsas não levam a caixa)** — na montagem, cada porta recusa **400** com a literal da porta + o
  sufixo S, o material fica intacto (físico, retenções, livro) e A entrega os 4 depois (**200**, *Entregue*): `SAIDA` 4
  (v2 e v1), `SAIDA_PRODUCAO` 4 emergencial, `AJUSTE_NEGATIVO` 4, `PERDA` 4, `AJUSTE` para 0 e para 1 **sem**
  localização, conferência que conta 0 e conclui aplicando, envio a terceiro, bloqueio avulso 4, `POST /reservas` 4,
  estorno da `ENTRADA` dos 4, solicitação de sucateamento de 4 (recusa **na solicitação**, antes das duas assinaturas).
  **(Fase 2, B-2:)** estorno do `AJUSTE` 0→4 **sem** localização (M8), do `AJUSTE` 0→4 **com** localização (M8) e do
  `DESBLOQUEIO` avulso (entra 4, bloqueia 4, desbloqueia 4, separa 4, estorna o desbloqueio — M9): cada um **400** e A
  entrega 4. E sem caixa (r1b): `AJUSTE` 0→4, reserva manual 4, estorno do `AJUSTE` → **400** M8 (hoje 200, reservado 4
  sobre físico 0).
  Pelo serviço: os demais `TIPOS_SAIDA` da saída comum (`SAIDA_MONTAGEM`, `SAIDA_ASSISTENCIA`, `SUCATA` sem
  `doBloqueado`, `DEVOLUCAO_CLIENTE` em material de cliente) num laço — cada um recusa com M1.
- **RN-02 (o que está fora da caixa continua livre)** — físico 6, caixa 4: `SAIDA` 2 → **201**; `SAIDA` 3 → **400** M1
  com *"Disponível: 2 PC"* e o sufixo. Caixa parcialmente coberta (reserva 2 do item, caixa 4, físico 4): livre 0 →
  `SAIDA` 2 → 400; A entrega 4 → 200. Caixa de duas requisições soma (A 2 + B 2, físico 6): `SAIDA` 3 → 400 com
  *"Disponível: 2"* e as duas requisições no sufixo.
- **RN-03 (a entrega e as reservas da requisição não mudam de régua)** — o cenário da s5 (caixas 8 sobre físico 4): A
  entrega a própria caixa → **200**; a aprovação de C com a caixa de A presente reserva `disponível − caixa dos outros`
  (a B469 da 95, igual a hoje); o caso P5b/B2 da 95 (aprovação do legado com caixa **própria**) continua reservando o
  pedido inteiro; a chegada da nota dá primeiro a quem tem caixa (B475) como hoje. ~~Os testes da 95
  (`separacaoTetoFisico*`, `filaSeparacao`, aprovação) passam **sem edição**.~~ **Corrigido na Fase 2 (I-2):** três
  montagens da 95 usam a `SAIDA` avulsa que agora recusa, corretamente — `separacaoTetoFisico` P4 RN-01 (`:243`) e P4
  RN-03 (`:591`), `separacaoTetoFisicoIntegracao` T4 I4 (`saidaAvulsa`, `:156`). A T1 as remonta pelo escritor de legado
  (`UPDATE materiais_almoxarifado SET quantidade_atual = …`, comentário *"mudado na Etapa 97"*); as asserções não mudam.
  `filaSeparacao` e os de aprovação passam sem edição.
- **RN-04 (a literal)** — sem caixa sem reserva no material, toda recusa é **byte a byte** a de hoje (os testes que
  casam literal passam sem edição); com caixa, o sufixo S nomeia a quantidade, até três números de requisição (por id;
  *"e mais N"* depois) e as duas saídas legítimas.
- **RN-05 (a porta avulsa espera a separação)** — pela rota, com o gancho da s4b (a separação parada depois de ler o
  teto): a `SAIDA` avulsa de 4 **espera** e, quando a separação grava, **recusa** — 0/10 rodadas com separado > físico.
  Com a trava do material presa por um teste, a `SAIDA` avulsa fica pendente (150 ms) e resolve ao soltar — **o teste
  dispara a requisição FORA da `fn` da seção** (o supertest criado dentro herda o contexto que segura `m` e, com a B-1
  corrigida, rodaria direto — corrigido na Fase 2). **(Fase 2, B-1:)** um fluxo nascido dentro de uma seção que chama o
  motor depois de a seção-mãe fechar **não espera a si mesmo** (`e97rv/r3-contexto-vazado.js`). Dentro de
  uma seção que já segura o material (a entrega), o motor **não** espera (sem deadlock: a entrega de A conclui).
- **RN-06 (o caso legítimo)** — material perdido da caixa: entregar 2, encerrar, `PERDA` 2 → **201**; excluir a requisição
  (ADMIN) e `PERDA` 4 → **201**. Antes de soltar a caixa, a `PERDA` recusa com o sufixo que diz como.
- **RN-07 (`permite_saldo_negativo`)** — material com a flag, montagem: `SAIDA` 4 → ~~**201** (como com reserva)~~
  **400** M1 com *"Disponível: 0"* e S, e A entrega 4 → 200 (corrigido na Fase 2, I-1 — B498 invertida); físico 10 com a
  flag, caixa 4, reserva manual 6: `SAIDA` 6 → **201** (a flag dispensa a reserva), `SAIDA` 1 a mais → **400**; sem
  caixa, a flag continua deixando o físico negativo (`SAIDA` 5 com físico 4 → 201); `AJUSTE` para 0 sem localização →
  **400** (a flag não dispensa a guarda do ajuste).
- **RN-08 (o bloqueio avulso)** — físico 4 sem caixa: bloquear 10 → **400** M4; bloquear 4 → 200; com reserva manual 4:
  ~~bloquear 1 → 400 M4~~ bloquear 4 → **200** e bloquear 5 → **400** M4 (corrigido na Fase 2, I-5: a guarda não conta
  o reservado); na montagem (caixa 4 sobre físico 4): bloquear 1 → **400** M4 com S; a devolução para quarentena (`POST /devolucoes` com destino `QUARENTENA`) continua **201** e
  bloqueia a quantidade devolvida.
- **RN-09 (o inventário é tudo ou nada com a caixa)** — conferência com dois materiais, o primeiro sem caixa (conta 3 de
  5) e o segundo com caixa 4 (conta 0): `concluir` com `aplicar_ajustes` → **400** *"Ajuste bloqueado: ⟨cod2⟩: Ajuste para
  0 PC deixaria o disponível negativo (separada na caixa de requisição: 4, mínimo aceitável: 4 PC)…"* e **nenhum** item
  ajustado (o primeiro continua 5). A recusa vem da pré-validação, não do motor no meio.

---

## Contrato (congelado)

**Nenhuma rota nova, nenhum campo novo de resposta.** A recusa é o 400 de sempre (`{ error }`); muda o número
interpolado (o livre de caixa) e o sufixo, só quando há caixa.

### O módulo — `server/services/almoxarifado/caixaSql.js` (T0)

```js
// requires: ./requisitionStateMachine (STATUS_COM_CAIXA), ./availabilitySql (disponivelSql), ./quantidade (Q), ./db
caixaSemReservaSql(materialExpr, exclusao = '')   // MOVIDO de requisitionService.js:152, texto idêntico
livreDeCaixaSql(alias = '')                        // Q.qtdSql(`${disponivelSql(alias)} - ${caixaSemReservaSql(alias ? `${alias}.id` : 'materiais_almoxarifado.id')}`)
async lerCaixa(db, materialId)                     // -> { caixa: Q.qtd(n), requisicoes: ['REQ-…', …] } (por id da requisição; só as com caixa > 1e-9)
sufixoCaixa({ caixa, requisicoes }, unidade)       // -> '' se caixa <= 1e-9; senão a literal S
```

`requisitionService` passa a importar `caixaSemReservaSql` daqui e **mantém o re-export** (`requisitionService.caixaSemReservaSql`
continua existindo — as sondas e testes da 95 o leem). Sem alias, o `UPDATE` de tabela única correlaciona por
`materiais_almoxarifado.id` (medido no controle da s4). **Nenhum `require` de `stockService` ou `requisitionService` neste
módulo** (ciclo); conferido na T0 por `node -e "require('./services/almoxarifado/stockService')"` sem aviso de export
parcial e por teste que lê `Object.keys(require(caixaSql))`.

### A trava — `travaPorMaterial.naTravaDoMaterial(materialId, fn)` (T0)

- ~~fora de seção ativa → `comLockDoMaterial`; seção ativa que segura o material → `fn()`~~ **(corrigido na Fase 2, B-1
  — os testes, nesta ordem):**
- a seção do contexto **segura `m` agora** (`secao.materiais.has(m)`, testado **antes** de `ativa`) → `fn()`;
- seção ativa que **não** o segura → `fn()` (comportamento de hoje; não aninha — invariante da 91);
- fora de seção, ou seção já fechada (`!secao.ativa`) que não segura `m` → `module.exports.comLockDoMaterial(materialId,
  fn)` (pelo objeto, os testes espiam);
- **`segurarTrava` tira a chave de `secao.materiais` no `finally`** (hoje ela fica no `Set` depois de soltar: o conjunto
  passa a dizer "segura agora", não "já segurou"; `materiaisForaDaSecao` lê o mesmo `Set` e fica mais exato). Por quê: o
  fluxo nascido dentro de outra seção reaproveita o objeto da mãe (`travaPorMaterial.js:71-73`); quando a mãe fecha,
  `ativa` vira `false` e o filho, que **segura** `m`, pedia a trava de novo e esperava a si mesmo para sempre
  (`e97rv/r3-contexto-vazado.js`: PRESO; com o protótipo do contrato antigo caíram na suíte `aprovacaoEsperaTrava` RN-05
  (f) e `travaRevisaoFase5` (f), (f) automática, (g) automática, (g) desfazer — `e97rv/suite-trava.out`);
- `materialId` nulo/não finito → `fn()` (a recusa de material inválido continua sendo a do motor).

### O motor (T1)

- `registrarMovimentacao(db, user, params, opcoes)` = `naTravaDoMaterial(params?.material_id, () => corpo)`. O corpo é o de
  hoje, renomeado (`registrarMovimentacaoSemTrava` — ~~não exportado~~ **exportado só para os dois testes de corrida do
  claim**, corrigido na Fase 2, I-3; nenhum serviço o chama).
- **Saída comum** (o ramo que hoje compara `disponivelSql` — nem `consumindoReserva`, nem `baixandoTerceiro`, nem
  `baixandoBloqueado`): **sem** `opcoes.requisicaoDaEntrega`, a pré-checagem `:1423` e o claim `:1815` usam o livre de
  caixa (`livreDeCaixaSql()` no `WHERE`; o `? = 1 OR` do `permiteNegativo` vira a regra da B498 invertida — `? = 1 AND
  (caixa ≤ 1e-9 OR quantidade_atual − caixa ≥ ?)`, corrigido na Fase 2, I-1); **com** a marca, o de hoje.
- **`REMESSA_TERCEIRO`** `:1554`: livre de caixa no claim; literal M2.
- **`BLOQUEIO`** com `opcoes.bloqueioAvulso === true`: claim novo `UPDATE … SET quantidade_bloqueada = qtdSql(+ ?) WHERE id = ?
  AND ⟨bloqueável⟩ >= ? FOLGA_SQL RETURNING id`, bloqueável = `quantidade_atual − bloqueada − em_inspecao −
  em_terceiros − caixaSemReservaSql` (~~`livreDeCaixaSql()`~~ — corrigido na Fase 2, I-5: sem contar o reservado); sem
  claim → M4 com ⟨n⟩ = o bloqueável. Sem a opção, o `UPDATE` de hoje.
- **`AJUSTE`/`AJUSTE_INVENTARIO` sem localização**: `motivoRecusaAjustePorRetencao(material, novoTotal, caixa = 0)` —
  continua **pura**; a caixa entra na soma do retido e nas partes (*"separada na caixa de requisição: ⟨c⟩"*, depois de
  *"em terceiros"*). O motor lê a caixa (`lerCaixa`) e passa. Com localização: nada muda (B495).
- **`criarReserva`**: embrulhada em `naTravaDoMaterial`; **sem** `opcoes.requisicao_id` (manual) o hold `:3029` usa o
  livre de caixa e a recusa é M3; com `requisicao_id`, o de hoje.
- **Estorno de entrada** (`cancelarMovimentacao`, `:2587-2593`): o claim usa o livre de caixa, **dentro de
  `naTravaDoMaterial` só em volta do `UPDATE`**; a recusa é `mensagemEstornoSemDisponivel(db, mov)` + sufixo S.
- **(Fase 2, B-2) Estorno do `AJUSTE`** (as duas formas; `stockService.js:2729-2752` com localização, `:2758-2762` sem):
  quando o estorno **reduz** o total (o `AJUSTE` de ida subiu), antes de escrever, sob `naTravaDoMaterial` em volta da
  guarda + escrita: `motivoRecusaAjustePorRetencao(material, totalDepois, caixa)` — `totalDepois` = `saldo_anterior`
  (sem localização) ou `Q.qtd(soma das linhas − delta)` (com localização) —; recusa M8. Fecha também a lacuna anterior,
  sem caixa, de o estorno do `AJUSTE` levar o **reservado** (`e97rv/r1b-estorno-ajuste-reserva.js`: `AJUSTE` 4, reserva
  manual 4, estorno **200** com reservado 4 sobre físico 0). Quando o estorno **aumenta** o total: sem guarda, como hoje
  (recusar o que melhora o estado seria prender o legado).
- **(Fase 2, B-2) Estorno do `DESBLOQUEIO`** (`:2797`, hoje soma ao bloqueado sem guarda): claim `UPDATE … SET
  quantidade_bloqueada = qtdSql(+ ?) WHERE id = ? AND livreDeCaixaSql() >= ? FOLGA_SQL RETURNING id` sob a trava curta;
  recusa M9. Mais estrito que o bloqueio avulso (conta o reservado): o estorno corrige o livro, não é retenção de
  qualidade — declarado.
- **(Fase 2, I-4) `cancelarMovimentacao(db, user, id, motivo, opcoes = {})`:** `opcoes.compensacao === true` mantém a
  régua de hoje no estorno de entrada (par do mesmo evento, soma zero). Conferidos os chamadores: `scrapService.js:143`
  (`compensarRetalho` estorna a `ENTRADA_RETALHO` recém-creditada) e `thirdPartyService.js:768` (`compensarTransformacao`
  estorna os créditos das peças) passam `{ compensacao: true }` — sem isso, no legado (caixa > físico) a compensação
  recusaria e deixaria retalho/peça fantasma (o `.catch` engole); `scrapService.js:149` e `thirdPartyService.js:776`
  estornam saída/consumo (crédito, não mudam) e não passam. A rota (`extended.js:861`) não passa — nunca vem do body.
- **(Fase 2, I-4) A perna `SUCATA` da devolução** (`returnService.js:229`, logo depois da `ENTRADA_DEVOLUCAO` do mesmo
  documento): 4º argumento `{ ...opcoes, parDaDevolucao: true }` → a saída comum usa a régua de hoje. Sem isso, no legado
  a entrada gravava e a `SUCATA` recusava — devolução pela metade (`e97rv/r2-pares-internos.js` (a)). A T1 confere os
  demais chamadores do motor com tipo de `TIPOS_SAIDA` (`grep -rn "registrarMovimentacao(" services routes`) e diz no
  commit quais são porta avulsa (entram) e quais são par interno (opção).
- `getSaldoDisponivel` e `disponivelSql` **não mudam** (B491).

### Fora do motor (T2)

- `inspectionService.bloquearMaterial`: `registrarMovimentacao(…, { bloqueioAvulso: true })`.
- `thirdPartyService.enviarRemessa` `:205`: a pré-checagem lê `livreDeCaixaSql('m')` no lugar do `disponivelSql('m')` e
  acrescenta o sufixo S à recusa de hoje (literal M2b) — **dentro do fragmento do material** que tem caixa (a recusa junta
  um fragmento por material; o S não vai no fim da frase inteira — corrigido na Fase 2, menor 2).
- `scrapDisposalService` `:203`: `livreDeCaixaSql()` AS disponivel; a recusa `:243` acrescenta *"e o separado na caixa
  de requisições"* à frase *"O disponivel ja desconta …"* e o sufixo S (M7) — a frase acrescida e o S **só quando há
  caixa**; sem caixa, a literal de hoje byte a byte (corrigido na Fase 2, menor 2).
- Inventário (`routes/almoxarifado.js:1604`): a pré-validação lê `lerCaixa(db, material.id)` e passa `caixa` a
  `motivoRecusaAjustePorRetencao` — mesma função que o motor chama (D1 da Etapa 10: não duplicar a fórmula).
  **(Fase 2, menor 3:)** a conclusão inteira (pré-validação + aplicação) roda em `comLockDosMateriais(materiais da
  conferência)` — o motor ali dentro roda direto (a seção segura cada material; depende da B-1 corrigida) e a corrida
  pré-validação × separação deixa de existir para o tudo-ou-nada. A T2 confere que o motor do `AJUSTE_INVENTARIO` não
  chama, de dentro, porta proibida em seção (recálculo, `cancelarMovimentacao`, variantes sem `sobTrava`).

### Literais (S = sufixo; ⟨n⟩ = livre de caixa `Q.qtd(max(0, livre))` quando há caixa, o número de hoje quando não há)

- **S:** `` — ⟨c⟩ ⟨un⟩ estão separados para ⟨"a requisição REQ-1" | "as requisições REQ-1, REQ-2 e REQ-3" | "… e mais N"⟩
  e só saem pela entrega (material perdido da caixa: entregue o que existe e encerre a requisição, ou peça ao
  administrador do almoxarifado para excluí-la)``
- **M1** (saída comum, pré-checagem e claim): `Saldo insuficiente. Disponível: ⟨n⟩ ⟨un⟩` + S
- **M2** (remessa, claim do motor): `Saldo disponível insuficiente para enviar ao terceiro: ⟨n⟩ ⟨un⟩` + S
- **M2b** (remessa, pré-checagem do serviço): a literal de hoje de `thirdPartyService` com ⟨n⟩ + S
- **M3** (reserva manual): `Saldo disponível insuficiente: ⟨n⟩` + S
- **M4** (bloqueio avulso, **nova**): `Saldo disponível insuficiente para bloquear: ⟨n⟩ ⟨un⟩` + S
- **M5** (estorno de entrada): `mensagemEstornoSemDisponivel` de hoje + S
- **M6** (ajuste/inventário): a de `motivoRecusaAjustePorRetencao` com a parte *"separada na caixa de requisição: ⟨c⟩"*
  e o mínimo somado (sem S — a frase já manda *"Resolva a retenção antes"*)
- **M7** (sucateamento, pré-checagem): a de hoje com ⟨n⟩, a frase do disponível acrescida e S (a frase e o S só com
  caixa — Fase 2)
- **M8** (estorno do `AJUSTE`, Fase 2, B-2): `Não é possível estornar: ` + a de `motivoRecusaAjustePorRetencao` (M6, sem S)
- **M9** (estorno do `DESBLOQUEIO`, Fase 2, B-2): `Não é possível estornar o desbloqueio: saldo disponível insuficiente
  para bloquear de novo: ⟨n⟩ ⟨un⟩` + S

### O que não muda

`disponivelSql`, `getSaldoDisponivel`, `caixaSemReservaSql` (texto), `tetoSeparacao`, `maxEntregar`, a separação, a
aprovação, a chegada, o consumo de reserva, a baixa de terceiro e do bloqueado, a transferência, o `AJUSTE` com
localização (o de ida), o `BLOQUEIO` interno. ~~o `permiteNegativo` da saída~~ (muda: B498 invertida na Fase 2). Nenhuma
migração.

---

## Técnica dos testes

Arquivo novo `server/tests/api/portasAvulsasCaixa.api.test.js` (runner próprio, molde da 95/96), harness `testApp` com
`requirePermission` real e usuário por requisição (`setUser` num middleware, molde `e95-h.js`). Montagem pela **rota**
(S cria, ADMIN aprova, `ENTRADA`, ALMOX separa) — nunca escrevendo `quantidade_separada` à mão. O estado legado da
RN-03 (caixas > físico) a s5 montou com a `SAIDA` avulsa, que depois da T1 recusa; no teste ele é montado por
`UPDATE materiais_almoxarifado SET quantidade_atual = 4` direto (escritor de legado, como a 96 fez com o torto).
O gancho da RN-05 é o da s4b (`db.run` embrulhado até a escrita de `quantidade_separada`), restaurado no `finally`.
Cada asserção de recusa confere **status, literal inteira e o estado intacto** (físico, retenções, contagem do livro).

---

## Tasks

**Ordem topológica: T0 → T1 → T2 → T3 → T4.** T0 e T1 são **tronco** (T0: o módulo e a trava, regra compartilhada;
T1: o motor, lido por quase tudo). T2 só **consome** a régua e a opção da T1 — **galho**, mas roda **serial na mesma
árvore** depois da T1: as quatro portas dela sabotam código que a suíte inteira lê (memória "sabotagem concorrente
contamina a suíte"), e é pequena demais para pagar uma worktree. T3 é a integração (cruza T1 e T2 pela rota **e** pelo
serviço). T4 fecha.

- [x] `9ace72b2` **T0 (tronco) — `caixaSql.js` e `naTravaDoMaterial` (B491, B494).** Contrato "O módulo" e "A trava". Testes
  `[97 RN-00]`: `livreDeCaixaSql('ma')` e `livreDeCaixaSql()` (num `UPDATE … WHERE` de tabela única) dão 0 na montagem e 2
  com físico 6; `lerCaixa` devolve `{ caixa: 4, requisicoes: [numero] }`; `sufixoCaixa({caixa: 0})` é `''`; quatro
  requisições → *"… e mais 1"*; `naTravaDoMaterial` fora de seção espera a trava presa e resolve ao soltar; dentro de
  `comLockDoMaterial(m)` roda sem esperar (`comPrazo` 2 s); `requisitionService.caixaSemReservaSql === caixaSql.caixaSemReservaSql`;
  carregar `stockService` sem aviso de ciclo. **(Fase 2, B-1:)** (a) o fluxo nascido dentro de `comLockDoMaterial(m)` que
  chama `naTravaDoMaterial(m)` depois de a mãe fechar **resolve** (`comPrazo`; a sonda `r3` dá PRESO no contrato antigo);
  (b) um fluxo vazado que **não** segura `m` (a mãe segurou e soltou `m`), com `m` preso por outro, **espera**.
  **Vermelho antes:** todos (módulo não existe; (a) e (b) contra o `travaPorMaterial` de hoje — `naTravaDoMaterial` não
  existe). **Controles:** (s1)
  `livreDeCaixaSql` sem a subtração → cai "0 na montagem"; (s2) `naTravaDoMaterial` sempre `fn()` → cai "espera a trava
  presa"; (s3) sempre `comLockDoMaterial` → cai "dentro de seção roda sem esperar" (o `comPrazo` estoura); (s4) `sufixoCaixa`
  sem o corte em três → cai *"e mais 1"*. **(Fase 2:)** (s5) `naTravaDoMaterial` testando `ativa` antes do `has` → cai
  B-1 (a) (PRESO); (s6) `segurarTrava` sem o `delete` no `finally` → cai B-1 (b) (o `Set` velho manda rodar direto).
- [x] `65dc74b2` **T1 (tronco) — o motor (B491–B494, B496, B498).** Contrato "O motor", M1–M6. **RN-01** pelo serviço (saída comum
  em laço de tipos, ajuste sem localização, reserva manual, remessa pelo `REMESSA_TERCEIRO`, bloqueio com a opção,
  estorno de entrada), **RN-02**, **RN-03**, **RN-04**, **RN-05** pelo serviço, **RN-07**, **RN-08** pelo serviço.
  **Vermelho antes:** RN-01, RN-02 (recusas), RN-05, RN-08. **Guardas (passam antes):** RN-03, RN-04 sem caixa, RN-07
  `SAIDA`. **Medir antes e depois, sem edição:** `test:api` inteiro; em especial `ajusteRetencao` (D1/D7 continua),
  `travaPorMaterial`, `travaRevisaoFase5`, `aprovacaoEsperaTrava`, `filaLiberacaoAprovacaoCorrida` (espiam
  `comLockDoMaterial`: o motor fora de seção agora o chama — se algum conta chamadas, registrar e ajustar só a contagem,
  nunca a regra), `separacaoTetoFisico*`, `quantidadeArredondada`, `saldoEmTerceiros` (varredura). **Custo:** laço de
  mil `SAIDA` de 1 antes e depois (tempo total; o índice da B478 cobre a subconsulta) — registrar os dois números.
  **(Fase 2:)** RN-01 ganha os três estornos e o r1b (B-2); RN-07 invertida (I-1); RN-08 sem contar o reservado (I-5); a
  perna `SUCATA` da devolução e as compensações com caso no legado (caixa > físico): devolução para sucata → 201 com as
  duas pernas no livro (I-4); **edição declarada** de três testes da 95 (I-2) e de dois de corrida (I-3:
  `confirmacaoLeituraLocalizacao` *"Fase 5: duas saidas CONCORRENTES"* e `saidaPorLocalizacao` *"(12)"* passam a chamar
  `registrarMovimentacaoSemTrava` para continuarem provando o claim; caso novo: as mesmas duas saídas pelo motor travado
  **serializam** — a segunda vê o resultado da primeira).
  **Controles:** (s1) claim da saída comum de volta ao `disponivelSql` (pré-checagem também) → cai RN-01 `SAIDA`/`PERDA`
  (201); (s2) a exceção da entrega removida → cai RN-03 (s5: a entrega de A → 400); (s3) `criarReserva` com o livre de
  caixa também para `requisicao_id` → cai o caso P5b/B2 da 95 (nomear o teste na execução); (s4) o wrapper sem a trava →
  cai RN-05 (gancho: 10/10); (s5) `bloqueioAvulso` ignorado → cai RN-08 "bloquear 10 → 400"; (s6) estorno sem o livre →
  cai RN-01 estorno; (s7) `motivoRecusaAjustePorRetencao` sem a caixa → cai RN-01 `AJUSTE` para 1; (s8) `sufixoCaixa`
  sempre → cai RN-04 "byte a byte sem caixa". **(Fase 2:)** (s9) estorno do `DESBLOQUEIO` sem o claim → cai B-2
  `DESBLOQUEIO`; (s10) estorno do `AJUSTE` sem a guarda → cai B-2 `AJUSTE` (as duas formas) e o r1b; (s11) a perna
  `SUCATA` sem a opção → cai I-4 (devolução 400 com a entrada gravada); (s12) a flag passando por cima da caixa → cai
  RN-07 `SAIDA` 4 → 400; (s13) a guarda do bloqueio contando o reservado → cai RN-08 "bloquear 4 com reserva 4 → 200".
- [ ] **T2 (galho, serial) — as portas fora do motor (B493, B496).** Contrato "Fora do motor", M2b, M6, M7. **RN-01**
  pela rota (bloquear, remessa criar + enviar, sucateamento solicitado, inventário), **RN-08** pela rota, **RN-09**.
  **Vermelho antes:** RN-08 rota, RN-09, RN-01 sucateamento (a recusa tem de vir **na solicitação**) e as literais M2b/M7.
  **Controles:** (s1) `bloquearMaterial` sem a opção → cai RN-08 pela rota; (s2) a pré-checagem da remessa sem a caixa →
  a recusa vem do claim do motor (M2), cai a literal M2b; (s3) a do sucateamento sem a caixa → a solicitação passa (201),
  cai RN-01 sucateamento; (s4) a pré-validação do inventário sem a caixa → o motor recusa o segundo item **depois** de
  ajustar o primeiro — cai a asserção "nenhum item ajustado" da RN-09. **(Fase 2, menor 3:)** a conclusão do inventário
  inteira em `comLockDosMateriais`.
- [ ] **T3 (tronco, integração) — o fluxo inteiro pela rota e pelo serviço.** Cenário único, **pela rota**: S pede 4,
  ADMIN aprova, `ENTRADA` 4, ALMOX separa 4 → `SAIDA` avulsa 4 (400 M1+S) → `PERDA` 4 (400) → bloquear 4 (400) →
  `POST /reservas` 4 (400) → conferência conta 0 (400) → A entrega 4 (**200**, *Entregue*) → agora a `SAIDA` de 1 de uma
  `ENTRADA` nova passa (201, a caixa sumiu). Segundo cenário, **pelo serviço** (`stockService.registrarMovimentacao` e
  `requisitionService.separarRequisicao` direto, sem `app`): a corrida da RN-05 com gancho (0/10) e a entrega dentro da
  seção (não espera). Terceiro: **RN-06** (entrega parcial + encerrar → `PERDA` 201; excluir → `PERDA` 201). Quarto: a s5
  inteira pela rota (RN-03). **Controles:** (s1) desfazer só o wrapper da T1 → cai a corrida pela rota e pelo serviço;
  (s2) desfazer só a exceção da entrega → cai o quarto cenário; (s3) desfazer a T2 inteira → cai o passo "conferência
  conta 0" do primeiro cenário (e o bloquear). **(Fase 2, menor 1:)** as asserções de recusa exigem a literal **inteira**
  — na conferência, com o prefixo *"Ajuste bloqueado:"* da pré-validação; sem isso o (s3) passaria com a recusa do motor
  (400, sem o prefixo) e o controle ficaria vazio.
- [ ] **T4 — fechamento (skill `fechar-etapa`).** Novidades (B491–B498, C184–C189, A48), specs 03 (motor: a régua da
  caixa nas portas avulsas, a trava no motor), 05 (a caixa protegida também das portas avulsas — fecha a B466 iv), 07
  (reserva manual não toma a caixa — iguala a B469), 14 (remessa), 15 (sucateamento), 17 (inventário: a caixa na guarda
  do ajuste), **09 (inspeção: o bloqueio avulso ganha guarda que não conta o reservado) e 12 (devoluções: a perna
  `SUCATA` fica na régua de hoje) — Fase 2, menor 4**, mapa de status, guia do usuário (Antes → Agora: *"a saída avulsa recusava? não — levava a caixa e a
  requisição ficava presa"*; roteiro clicável: separar sem reserva → tentar `PERDA` → ler o sufixo → entregar), e a
  próxima tarefa detalhada (candidata: B497 (i), o gesto "devolver da caixa à prateleira"). Os cinco comandos de teste,
  citados com o resultado real.

---

## Teste de integração — por que a T3 é a prova de que as partes compõem

Cada porta certa sozinha não prova o fluxo: a régua nova pode recusar a **entrega** (o passo seguinte do mesmo
documento) — foi o que a s5 achou no contrato da 96. A T3 segue o documento até o último gesto (separar → tentar levar
por cada porta → **entregar** → a caixa some → a porta volta a passar) e cruza a T1 (motor) com a T2 (inventário,
bloqueio). A RN-05 depende de **fiação** (a seção de quem chama o motor — `AsyncLocalStorage`): só o cenário pela rota
**e** pelo serviço prova que a entrega, chamando o motor de dentro da própria seção, não espera a si mesma.

---

## Avisos (letra C) — a registrar no fechamento

- **C184** — as saídas avulsas que levavam o material separado sem reserva agora recusam (~~14~~ **17** portas —
  corrigido na Fase 2, B-2: saída v1/v2, produção, ajuste negativo e sem localização, perda, inventário, remessa,
  bloqueio, reserva manual, estorno de entrada, sucateamento, **estornos do `AJUSTE` sem e com localização e do
  `DESBLOQUEIO`**; e, com `permite_saldo_negativo`, a saída também deixa de levar a caixa — B498 invertida) — o operador vê *"Disponível: 0"* com físico 4 e o sufixo que explica.
- **C185** — o bloqueio avulso passa a recusar acima do físico não retido menos a caixa — ~~inclusive material
  **reservado** (liberar a reserva antes)~~ **o reservado continua bloqueável** (corrigido na Fase 2, I-5). Antes aceitava
  bloquear 10 com físico 4 (P6).
- **C186** — o `AJUSTE` **com** localização continua podendo levar a caixa (B495; D1/D7 da Etapa 10) — o de ida; o
  **estorno** dele não leva mais (Fase 2, B-2). Medido: s1 2b.
- **C187** — a tela de Movimentações/Materiais mostra o disponível do motor (com a caixa dentro); o 400 é que explica.
  Mostrar a caixa na tela fica fora.
- **C188** — requisições **já** presas pelo defeito (caixa maior que o disponível) não se destravam sozinhas: a **A48**
  as acha; a saída é entregar o que existe e encerrar, ou excluir (s3).
- **C189** — com o material **todo** perdido na caixa, só o administrador do almoxarifado solta a requisição (excluir) —
  igual a hoje; o almoxarife não tem gesto próprio (B497).

---

## O que fica de fora (declarado — e por quê)

- **`AJUSTE` com localização** — B495 (reabriria D1/D7 da Etapa 10, teste que prende o contrário).
- **Gesto "devolver da caixa à prateleira"** — B497; candidato da 98.
- **A tela mostrar a caixa** no disponível de Movimentações/Materiais — C187; é leitura nova em várias consultas.
- **Destravar o legado** — C188/A48; as saídas de hoje resolvem, um script seria decidir pelo almoxarife.
- **Caixa por endereço / por almoxarifado** — saldo global é intencional (`CLAUDE.md`); a transferência da caixa
  endereçada já tem saída guiada (C3/s2c).
- **A corrida do `AJUSTE` sem localização × separação entre a guarda e a escrita** — coberta pela trava do motor (o corpo
  inteiro roda sob ela fora de seção); a da pré-validação do inventário × separação (a pré-validação lê fora da trava e
  o motor relê dentro) continua a "limitação conhecida" de sempre da rota (comentário `routes/almoxarifado.js:1621`) — o
  motor recusa, e o tudo-ou-nada só quebra nessa corrida. **Corrigido na Fase 2 (menor 3):** a conclusão inteira passa a
  rodar sob `comLockDosMateriais` — essa corrida deixa de existir.

---

## Letra A — consulta para produção (a confirmar no fechamento como **A48**)

**A48 — requisições presas pela caixa levada por uma porta avulsa.** Materiais cuja caixa sem reserva passa do
disponível, com as requisições (número, status, caixa). Medida na s6 (acha X, não acha Y nem Z). A lista de status é
`STATUS_COM_CAIXA` (`requisitionStateMachine.js:109`) — **mudou lá, muda aqui** (como a A46 da 95).

```sql
SELECT ma.id AS material_id, ma.codigo,
       ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) AS disponivel,
       ROUND(SUM(c.caixa), 6) AS caixa_sem_reserva,
       GROUP_CONCAT(c.numero || ' (' || c.status || ', ' || ROUND(c.caixa, 6) || ')', '; ') AS requisicoes
FROM materiais_almoxarifado ma
JOIN (
  SELECT ix.material_id, rq.numero, rq.status,
         MAX(COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0)
             - COALESCE((SELECT SUM(rx.quantidade - COALESCE(rx.quantidade_utilizada,0))
                         FROM reservas_material_almoxarifado rx
                         WHERE rx.item_requisicao_id = ix.id AND rx.material_id = ix.material_id
                           AND rx.status = 'ATIVA' AND rx.origem = 'REQUISICAO'), 0), 0) AS caixa
  FROM itens_requisicao_almoxarifado ix
  JOIN requisicoes_almoxarifado rq ON rq.id = ix.requisicao_id
  WHERE COALESCE(rq.ativo, 1) = 1
    AND rq.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                      'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
) c ON c.material_id = ma.id AND c.caixa > 0.000001
GROUP BY ma.id
HAVING SUM(c.caixa) > ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) + 0.000001
ORDER BY ma.codigo;
```

Linha devolvida = requisição que hoje mostra *"Máximo: ⟨menos que a caixa⟩"* na entrega. Saída por requisição: entregar
o que existe e encerrar, ou excluir (administrador do almoxarifado). Opcional: nada roda sozinho.

---

## O que contradiz a próxima tarefa escrita na 96

1. **"Contrato provável: `registrarMovimentacao` aceita um contexto que exclui a caixa da própria requisição"** — **errado
   para a entrega** (s5): no estado em que as caixas somam mais que o físico (o que este defeito produz), a entrega de A
   veria livre 0 e seria recusada, onde hoje sai 200. Decidido (B492): a entrega e as reservas de requisição **não**
   entram na régua — a caixa delas é a conta da 95.
2. **"9 de 9 portas"** — são **14** (**17** com os três estornos que a Fase 2 achou, B-2): o inventário (*"não foi medido"* — medido: leva), o **estorno de entrada** (não estava
   na lista), a `SAIDA_PRODUCAO` (descartada lá pela regra de OS; com `emergencial` leva), a **v1** e o sucateamento até a
   baixa (*"não medida até o fim"* — leva).
3. **"recusar … na guarda de retenção do `AJUSTE`" com e sem localização** — o **com** localização reabre D1/D7 da Etapa 10
   (`ajusteRetencao.api.test.js:74` prende "passa"); fica fora (B495, C186).
4. **"o bloqueio avulso → `registrarMovimentacao` `BLOQUEIO`" como mais um claim a trocar** — o `BLOQUEIO` do motor **não
   tem claim nenhum** (bloqueia 10 com físico 4 — P6). Não é trocar a régua, é criar a guarda (opção do 4º argumento,
   B496), e ela muda também o bloqueio do material reservado (C185).
5. **"Ou a 97 põe a saída avulsa sob a trava … ou declara a corrida e mede N de N"** — medido: a janela existe (gancho
   10/10) e a trava fecha (0/10); a sonda de atrasos dava 0/20 — **teste vazio**, teria "provado" que declarar bastava.
   E o "sob trava explícito, molde `sobTrava`" é desnecessário: a seção já diz quem segura o material (B494).
6. **O caso legítimo não estava no texto** — não há gesto que devolva a caixa à prateleira (s3 L6), *Em Separação* não
   cancela nem encerra; a saída é entregar parcial + encerrar ou excluir. A régua nova obriga essa ordem (B497, C189).
7. **"A literal de sempre com o número já sem a caixa — ou literal que nomeie a caixa"** — decidido: as duas (prefixo
   de sempre + sufixo; sem caixa, byte a byte — B493).
8. **"o helper existe: `requisitionService.caixaSemReservaSql`"** — existe, mas o motor **não pode** lê-lo de lá
   (`requisitionService` requer `stockService` — ciclo); muda de módulo (T0), com re-export.

---

## Fase 2 — revisão do plano (2026-10-09): 2 bloqueantes, 5 importantes, 4 menores → plano revisto (vale sobre o texto acima)

Revisor fresco (plano + specs 03/05/07/14/15/17), com sondas executadas no scratchpad
(`…\scratchpad\e97rv\`): `r1-estornos.js` e `r1b-estorno-ajuste-reserva.js` (estornos fora da lista), `r2-pares-internos.js`
(perna `SUCATA` da devolução no legado; GESTOR e o reservado), `r3-contexto-vazado.js` (a trava), `r5-flag-negativo.js`
(a flag), e dois protótipos aplicados numa worktree descartável (`aplicar-regra.sh` → `suite-regra.out`; a trava do
contrato antigo → `suite-trava.out`, 4 min 8 s). Cada achado foi conferido contra o código pelo fio principal no HEAD
`eb7cd9d8`: `travaPorMaterial.js:71-99`; `stockService.js` `:95-108`, `:984`, `:1476-1479`, `:2587-2593`, `:2729-2752`,
`:2758-2762`, `:2797`; `returnService.js:201-240`; `scrapService.js:143`, `:149`; `thirdPartyService.js:205`, `:768`,
`:776`; `scrapDisposalService.js:203-245`; `permissions.js:26`, `:114`; `separacaoTetoFisico.api.test.js:243`, `:591`;
`separacaoTetoFisicoIntegracao.api.test.js:156`; `confirmacaoLeituraLocalizacao.api.test.js:122`;
`saidaPorLocalizacao.api.test.js:163`; os chamadores de `cancelarMovimentacao` (`grep`: rota `extended.js:861`,
`scrapService` 2, `thirdPartyService` 2). Os pontos afetados acima estão marcados **"(corrigido na Fase 2)"** ou
**"(Fase 2, …)"**. Nenhuma letra nova: **B494**, **B496** e **B498** corrigidas à vista (a B498 **invertida**); literais
**M8** e **M9** novas.

**Bloqueantes**

1. **B-1 — a trava presa para sempre (reproduzido).** O contrato decidia "fora de seção" por `secao.ativa`. O fluxo
   nascido dentro de outra seção reaproveita o objeto da mãe (`travaPorMaterial.js:71-73`); quando a mãe fecha, `ativa`
   vira `false` e o filho — que **segura** `m` — pede a trava que ele mesmo segura (`r3`: PRESO). Com o protótipo, na
   suíte: `aprovacaoEsperaTrava` RN-05 (f) e `travaRevisaoFase5` (f), (f) automática, (g) automática, (g) desfazer.
   **Escolhido:** "dentro de seção" = "a seção do contexto segura `m` agora": `segurarTrava` tira a chave de
   `secao.materiais` no `finally`; `naTravaDoMaterial` testa `secao.materiais.has(m)` **antes** de `ativa`. Na RN-05 o
   teste que segura a trava dispara a requisição **fora** da `fn` (o supertest criado dentro herda o contexto).
   **Descartado:** contar profundidade de seção ou marcar o filho — o `AsyncLocalStorage` não distingue o filho vazado
   da continuação legítima; o `Set` do que se segura agora é a prova que já existe (F1 da 91).
2. **B-2 — três estornos levam a caixa e não estavam na lista (reproduzido 6/6, `r1`).** Pela `POST
   /movimentacoes/:id/cancelar`: `AJUSTE` sem localização (`stockService.js:2758-2762`, SET absoluto sem guarda),
   `AJUSTE` com localização (`:2729-2752`, só confere negativo) e `DESBLOQUEIO` avulso (`:2797`, soma ao bloqueado sem
   guarda). **Escolhido:** entram no escopo — o do `DESBLOQUEIO` com claim pelo livre de caixa (M9); o do `AJUSTE` (as
   duas formas) pela régua de retenção + caixa (`motivoRecusaAjustePorRetencao` com a caixa — M8), só quando o estorno
   reduz o total. **Isso também fecha uma lacuna anterior, sem caixa:** o estorno do `AJUSTE` levava o **reservado**
   (`r1b`: `AJUSTE` 4, reserva manual 4, estorno 200, reservado 4 sobre físico 0). O placar e a C184 deixam de dizer
   "14": são **17**.

**Importantes**

1. **I-1 — `permite_saldo_negativo` não solta a requisição (reproduzido, `r5`).** A B498 dizia "com a flag, a entrega
   também sai" — `maxEntregar` (95) não honra a flag: a `SAIDA` 4 passa e A fica presa em *"Máximo: 0"*. **Escolhido:
   inverter a B498** — a caixa vale mesmo com a flag (a flag dispensa reserva e retenções, não a caixa); RN-07 `SAIDA` 4
   passa a ser **400**.
2. **I-2 — "os testes da 95 passam sem edição" é falso.** `separacaoTetoFisico` (P4 RN-01 `:243`, P4 RN-03 `:591`) e
   `separacaoTetoFisicoIntegracao` (T4 I4, `saidaAvulsa` `:156`) montam o estado com a `SAIDA` avulsa que agora recusa —
   corretamente (`suite-regra.out`: os três caem com *"Saldo insuficiente. Disponível: 0 PC"*). **Escolhido:** edição
   declarada — remontar pelo escritor de legado (`UPDATE quantidade_atual`), comentário *"mudado na Etapa 97"*; as
   asserções não mudam.
3. **I-3 — a trava muda dois testes de corrida.** `confirmacaoLeituraLocalizacao` *"Fase 5: duas saidas CONCORRENTES"*
   e `saidaPorLocalizacao` *"(12)"* disparam duas saídas em paralelo para provar o claim; sob a trava elas serializam
   e o resultado muda (`suite-regra.out`). **Escolhido:** apontá-los para `registrarMovimentacaoSemTrava` (exportado só
   para isso) para continuarem provando o claim; e um caso novo provando que pelo motor travado elas serializam.
4. **I-4 — a perna `SUCATA` da devolução quebra no legado (reproduzido, `r2` (a)).** `returnService.js:222-240` grava a
   `ENTRADA_DEVOLUCAO` e depois a `SUCATA` sem opção; com caixa > físico a `SUCATA` recusa e a devolução fica pela
   metade. **Escolhido:** a perna leva `{ parDaDevolucao: true }` no 4º argumento (régua de hoje — o par soma zero).
   Conferidas as compensações por estorno de entrada: `scrapService.js:143` e `thirdPartyService.js:768` estornam
   **entradas** do mesmo evento (mesmo problema → `cancelarMovimentacao` ganha `opcoes.compensacao`); `scrapService.js:149`
   e `thirdPartyService.js:776` estornam saída/consumo (crédito, sem guarda) — não precisam.
5. **I-5 — a B496 tiraria da qualidade o bloqueio do reservado (reproduzido, `r2` (b)).** O GESTOR bloqueia
   (`ajustar_estoque`) mas não libera reserva de requisição (`liberar_reserva_requisicao` é só
   ADMINISTRADOR/ALMOXARIFE, `permissions.js:114`): "libere a reserva antes" não é gesto dele. **Escolhido:** a guarda
   do bloqueio avulso recusa só o que passa do **físico não retido menos a caixa, sem contar o reservado**. P6 continua
   fechada; reter o reservado continua possível. B496, RN-08 e C185 corrigidas.

**Menores**

1. O (s3) da T3 exige a literal inteira com o prefixo *"Ajuste bloqueado:"* — senão a recusa do motor faz o controle
   passar vazio.
2. Na remessa o sufixo S vai **dentro do fragmento do material**; na M7 a frase *"e o separado na caixa de
   requisições"* só quando há caixa (sem caixa, byte a byte).
3. Inventário: a conclusão inteira em `comLockDosMateriais(materiais da conferência)` (o motor ali dentro roda direto,
   com a B-1 corrigida) — some a corrida pré-validação × separação que o plano declarava.
4. A T4 inclui as specs 09 (inspeção — o bloqueio avulso) e 12 (devoluções — a perna `SUCATA`).

**Os cinco pontos que o "Próximo passo" pediu:** (4) e (5) viraram a menor 3 e as B-1/I-3; (1) a ordem
requisição → material com a exclusão, (2) o `liberarParaEstorno` antes do claim do estorno e (3) o `getSaldoDisponivel`
da M1 no claim não vieram como achado — a T1 os confere pela suíte inteira (as sondas `suite-*.out` rodaram os 336
arquivos com os protótipos) e pela troca explícita da M1 para o livre.

## Próximo passo

**Fase 2 feita (ver a seção acima). Próximo: T0, depois T1, T2, T3, T4.** ~~**Fase 2** — um agente fresco (sem este contexto) com este plano, a spec 03 (motor), a 05, a 07, a 14, a 15 e a 17, e as
quatro perguntas da skill (contratos com erro e literal; RN × spec; independência real da T2; **cada RN traçada até o
último gesto** — separar → porta avulsa → entregar → encerrar; aprovar → reservar → separar → entregar; inventário aberto
→ contar → concluir; remessa criar → enviar → retornar; bloquear → desbloquear; sucatear → assinar → assinar → destino).
Pontos que a Fase 2 deve atacar em especial: (1) **a trava no motor** — algum chamador do motor fora de seção **segura a
trava por requisição** e é esperado, dentro do motor, por quem segura material → requisição? (a ordem permitida é
requisição → material); a exclusão (`excluirRequisicao`) chama o motor com a trava por requisição presa — conferir que
nenhuma porta pega material e depois requisição; (2) **`cancelarMovimentacao`** — o estorno de **saída** (crédito) não
muda; o de entrada com a trava curta: a `liberarParaEstorno` que roda antes do claim libera reservas da chegada — o
livre de caixa lido depois disso é o certo?; (3) **o `getSaldoDisponivel` da mensagem M1 do claim** (`:1817`) — trocar
pelo livre; nenhum outro leitor dele muda; (4) **a pré-validação do inventário** lê `lerCaixa` por material fora da trava
— a RN-09 fica de pé sem corrida? (5) os testes que espiam `comLockDoMaterial` — contam chamadas em algum caminho fora de
seção que passa pelo motor? Corrigir o plano, **depois** executar T0.~~

## Execução (2026-10-09)

Baseline `test:api` 336/336 (4104 ✓), almox 44/0. T0 → 337/337 (4114); T1 → 337/337 (4135); 44/0; no fim 4/0, 3/0, 5/0.
Cada commit com a suíte rodada no seu estado.

- **T0 `9ace72b2`** — `caixaSql.js` (`caixaSemReservaSql` movido do `requisitionService`, que re-exporta; `livreDeCaixaSql`,
  `lerCaixa`, `sufixoCaixa`); `naTravaDoMaterial` testa `secao.materiais.has(m)` antes de `ativa`, e `segurarTrava` tira o
  material no `finally` (B-1). Vermelho antes 10/10. Controles s1–s6 caíram cada um no seu; s5 (`ativa` antes do `has`)
  prende o fluxo nascido dentro da seção — o cenário da B-1.
- **T1 `65dc74b2`** — o motor. Vermelho antes 18 (RN-03 e a devolução para sucata no legado eram guardas). Controles s1–s13
  caíram; s3 derruba `[95 RN-05] P5b (Fase 2, B2)` e `[95 Fase 5] (T8)`; s12 aplicado à mão (dois pontos). O teste de
  ciclo de `require` sabe falhar (aviso de dependência circular). Custo: mil `SAIDA` com 20 requisições com caixa
  ~1200 → ~1400 ms. Testes antigos editados como declarado: três montagens da 95 pelo escritor de legado; as duas corridas
  em `registrarMovimentacaoSemTrava` + caso novo provando que pelo motor travado serializam.
  **Divergências:** (1) `AJUSTE` para 0 sem localização já é recusado pela M2 da 96 — os testes usam 3, 1 e 0,5;
  (2) o estorno do `AJUSTE` que deixaria o total negativo pula a guarda nova e responde a recusa da Etapa 51 (sem isso
  `saidaPorLocalizacao (17)` mudava de texto sem caixa — contra a RN-04); (3) a recusa do claim da saída citava um
  disponível velho — agora relê o material; (4) o caso da RN-03 "a aprovação de C reserva 2" não cai com o s3 — caem os
  dois da 95; (5) a mensagem do commit da T1 tem um acento ("asserçoes"). **Para a T2:** `inspectionService.bloquearMaterial`
  ainda não passa `{ bloqueioAvulso: true }` — o motor tem a guarda, a tela não a aciona.
