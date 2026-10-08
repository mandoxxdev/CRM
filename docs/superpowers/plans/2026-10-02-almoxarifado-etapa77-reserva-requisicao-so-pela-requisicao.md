# Etapa 77 — a reserva de uma requisição só sai pela requisição (C136 + C137, feature 07 com a 04 e a 23)

> Status: **ETAPA FECHADA (2026-10-08).** T0–T3, Fase 5 (`a5245acc`, `198f09f4`) e T4 (código `2201eb1f` + documentos
> `6b03642d`). Ver "T4 — fechamento" e a **Próxima tarefa detalhada — Etapa 91** no fim. *(Antes: "T0–T3 feitas
> e Fase 5 fechada — falta a T4"; e antes ainda "Fase 1 — nada commitado".)*
> Origem: "Próxima tarefa detalhada — Etapa 77" de
> `docs/superpowers/plans/2026-10-02-almoxarifado-etapa76-liberar-expirar-recalcula-status.md:632-684` e os avisos
> **C136**/**C137** de `docs/almoxarifado-novidades-por-etapa.md:6971-6984` (com a **B402**, `:5468`, que deixou a C136
> de fora na 76 "até medir quem usa" — medido abaixo).

**Escopo desta etapa:**
1. **C136** — uma saída que cita `reserva_id` de uma reserva de **origem `REQUISICAO`** só é aceita quando é a
   **entrega da própria requisição** (`requisitionService.entregarRequisicao`). Qualquer outra — a `POST
   /movimentacoes/v2` (SAIDA, SAIDA_PRODUCAO, PERDA, AJUSTE_NEGATIVO…) ou um chamador de serviço futuro — toma **400**
   com uma literal que ensina o caminho. A reserva **manual** continua consumível pela v2 como hoje.
2. **C137** — liberar à mão (`POST /reservas/:id/liberar`) uma reserva de **origem `REQUISICAO`** passa a exigir ser
   **quem pediu a requisição** (`requisicoes_almoxarifado.solicitante_id`) **ou** a ação nova
   `liberar_reserva_requisicao` = `[ADMINISTRADOR, ALMOXARIFE]`. O gate de rota `reservar` fica (duas camadas). A
   reserva **manual** continua como hoje.
3. **A tela Reservas** mostra o **número** da requisição (não o id — Surpresa 6 da 76) e barra o **Liberar** antes do
   modal para quem não é o solicitante nem tem a ação (o backend decide; a tela só não abre formulário que vai morrer
   em 403).

**Fora (declarado, ver "O que fica de fora"):** o fallback `getPerfilFromUser` → `PRODUCAO` (B54, decisão de negócio
aberta); quem libera reserva **manual** alheia (Surpresa 5 — C novo); PERDA/AJUSTE_NEGATIVO consumindo reserva
**manual** (Surpresa 4); corrigir o passado (D8, a A41 acha); a C131; o GESTOR liberar reserva de requisição (D4).

**Toque no cliente:** `ReservasAlmoxarifado.js` (+ teste) e `utils/permissaoErro.js` (rótulo da ação nova, **no mesmo
commit** que a cria — `permissaoErro.test.js` importa `ACAO_PERFIS` do servidor e cai sem ele). **Toque em Compras:**
nenhum.

## Fase 0 — medido (2026-10-02)

Sondas executadas pelas rotas reais com o harness `testApp.js` (`requirePermission` real), no scratchpad da sessão:
`sonda77-c136-c137.js` (C136 por tipo, metade manual, dono, C137 por perfil), `sonda77-c136b.js` (SAIDA_PRODUCAO com
projeto por ALMOXARIFE; v2 por usuário sem perfil), `sonda77-legado.js` (a consulta da letra A no banco local).

### 1. A C136 reproduzida (sonda `sonda77-c136-c137.js`)

Material com 4, R(4) aprovada pela rota → `TOTALMENTE_RESERVADA`, reserva `ATIVA` origem `REQUISICAO`. Depois,
`POST /movimentacoes/v2` citando o `reserva_id` dela:

| tipo | resposta | reserva | R | item | material (atual/reservada) |
|---|---|---|---|---|---|
| `SAIDA` | **201** | `CONSUMIDA` 4/4 | `TOTALMENTE_RESERVADA` | entregue 0 | 0 / 0 |
| `PERDA` | **201** | `CONSUMIDA` 4/4 | `TOTALMENTE_RESERVADA` | entregue 0 | 0 / 0 |
| `AJUSTE_NEGATIVO` | **201** | `CONSUMIDA` 4/4 | `TOTALMENTE_RESERVADA` | entregue 0 | 0 / 0 |
| `SAIDA_PRODUCAO` sem projeto | 400 (outro motivo: *"SAIDA_PRODUCAO exige vínculo com OS ou projeto…"*) | `ATIVA` | igual | 0 | 4 / 4 |
| `SAIDA_PRODUCAO` + `projeto_id`, por **ALMOXARIFE** (`c136b`) | **201** | `CONSUMIDA` | — | — | — |
| `SAIDA` parcial 1 de 4 | **201** | `ATIVA` util 1 | `TOTALMENTE_RESERVADA` | 0 | — |

**Metade positiva medida:** reserva **MANUAL** (`POST /reservas`) consumida pela v2 → 201, `CONSUMIDA`, origem
`MANUAL`, `requisicao_id` nulo — é o contrato da Etapa 4 (`reservaConsumo`) e **continua**.

`requisicao_id` forjado no body da v2 → **descartado** (o movimento grava `requisicao_id = null`): `validate()` troca
`req.body` pelo `parsed.data` (`services/almoxarifado/validation.js:28`) e `MovimentacaoSchema` não declara
`requisicao_id` (`schemas.js:85-131`). A v2 por usuário **sem perfil** → 403 `acao=movimentar` (`c136b`): a C136 é de
quem tem `movimentar` (ADMINISTRADOR, ALMOXARIFE) ou de integração com essas credenciais.

### 2. Todos os caminhos que aceitam `reserva_id` numa saída, e quem os chama

Régua: `grep -rn "reserva_id" server/routes server/services` (fora testes) + `grep registrarMovimentacao` fora do
módulo. Controle da régua: ela acha `requisitionService.js:1174` (o caminho que **sei** que existe).

- **Motor:** `stockService.registrarMovimentacao` — `consumindoReserva = !!reserva_id && tiposSaida.includes(tipo)`
  (`stockService.js:1021`); claim em `:1619-1675` (`UPDATE … WHERE id = ? AND material_id = ? AND status = 'ATIVA' AND
  saldo >= ?`), **sem olhar `origem` nem `requisicao_id`**. `TIPOS_SAIDA` = 11 tipos (`movementTypes.js:69-71`); a v2
  aceita os que não são dedicados nem retenção (SAIDA, SAIDA_PRODUCAO, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA,
  AJUSTE_NEGATIVO, PERDA).
- **Portas HTTP que repassam `reserva_id` ao motor:** **só a v2** (`routes/almoxarifado/extended.js:814-826`, gate
  `movimentar`, `req.body` inteiro). A v1 (`routes/almoxarifado.js:984-1015`) monta o objeto sem `reserva_id`; a
  `/transferencias` (`extended.js:858-869`) repassa o body cru mas força `tipo: 'TRANSFERENCIA'` (não é saída); a
  devolução ao cliente (`:888-920`) monta o objeto sem `reserva_id`.
- **Chamadores de serviço que passam `reserva_id` numa saída:** **um só** — `requisitionService.entregarRequisicao`
  (`requisitionService.js:1124-1188`): lê as reservas `ATIVA` **`origem = 'REQUISICAO'` do item** (`:1124-1130`) e chama o
  motor com `reserva_id` + `requisicao_id: requisicaoId` (`:1170-1186`). `entregarRequisicao` tem **uma** porta: `PUT
  /requisicoes/:id/entregar` (`routes/almoxarifado.js:3772`). Os outros `reserva_id` do motor são `RESERVA`
  (`stockService.js:2985-2988`) e `LIBERACAO_RESERVA` (`:3056-3060`) — não consomem. Fora do módulo: `requisicoesMaterial.js`
  só cita o motor num comentário. O `liberar-retirada` (`routes/almoxarifado.js:3713`) só muda status.
- **A tela Movimentações não manda `reserva_id`** (o payload de `MovimentacoesAlmoxarifado.js:560-599` não tem a chave;
  `grep reserva_id client/src` só acha um comentário em `InspecoesAlmoxarifado.js:83`). **Nenhuma integração legítima do
  repositório** consome reserva de requisição fora da entrega.
- **Testes que usam `reserva_id` na saída genérica hoje** (o impacto da recusa): `reservaConsumo` (6 saídas),
  `reservaTransferenciaExpiracao:243,289`, `relatoriosIndicadoresSpec27:491`, `saldoEmTerceiros:168,181`,
  `loteGuardasSaida:197` (pelo serviço) — **todas com reserva MANUAL** (criadas por `POST /reservas` ou
  `stockService.criarReserva` sem 4º argumento → `origem 'MANUAL'`, `stockService.js:2974`). **Impacto previsto: zero
  testes quebram** (a confirmar na T1 rodando-os antes e depois).

### 3. A C137 reproduzida (sonda `sonda77-c136-c137.js`) — `POST /reservas/:id/liberar` de reserva de REQUISIÇÃO

Uma requisição nova, aprovada pelo ADMIN, por usuário:

| usuário | perfil efetivo | resposta | reserva | R |
|---|---|---|---|---|
| sem perfil (`role: 'user'`) | **PRODUCAO** (fallback) | **200** | `LIBERADA` | `TOTALMENTE` → `APROVADO` |
| PRODUCAO (não é quem pediu) | PRODUCAO | **200** | `LIBERADA` | → `APROVADO` |
| ENGENHARIA | ENGENHARIA | **200** | `LIBERADA` | → `APROVADO` |
| ALMOXARIFE | ALMOXARIFE | 200 | `LIBERADA` | → `APROVADO` |
| GESTOR / COMPRAS / CONSULTA / QUALIDADE | idem | 403 `acao=reservar` | `ATIVA` | igual |
| PRODUCAO **que pediu a requisição** | PRODUCAO | 200 | `LIBERADA` | → `APROVADO` |

Mapa: `reservar: [ADMINISTRADOR, ENGENHARIA, PRODUCAO, ALMOXARIFE]` (`permissions.js:103`); `getPerfilFromUser` cai em
`PRODUCAO` (`:257`). Rota: `extended.js:936-952` (gate `reservar`, sem nenhuma outra checagem). Reserva **manual**
alheia: ENGENHARIA cria, **outro** PRODUCAO libera → 200 (Surpresa 5).

**O que cada perfil precisa de verdade** (régua: quem tem porta para o gesto vizinho):
- **Quem pede** (`requisitar` = ADMINISTRADOR, PRODUCAO, ENGENHARIA, ALMOXARIFE — **o mesmo conjunto** de `reservar`)
  já desiste da requisição **inteira** pelo `/cancelar` (só o solicitante ou admin de sistema, `routes/almoxarifado.js:3946`,
  que solta todas as reservas) e a reprova pelo `/rejeitar` (`ehSolicitante || can('aprovar_requisicao')`,
  `:3496-3507` — *"reprovar a própria requisição é desistência, decisão legítima do solicitante"*). Liberar a reserva da
  **própria** requisição é a desistência parcial — cabe a ele.
- **PRODUCAO/ENGENHARIA reservam para si** (`POST /reservas`, reserva manual) — isso continua. Liberar a reserva da
  requisição **de outra pessoa** não é ofício deles: é o almoxarifado (quem separa/entrega) que decide devolver o
  prometido ao bolo.
- **GESTOR** aprova e encerra (o `/encerrar` solta tudo — `routes/almoxarifado.js:3840-3870`), mas a rota de liberar
  exige `reservar`, que ele não tem → listá-lo na ação nova seria **configuração morta** (regra da Etapa 36).

### 4. Reserva manual — quem libera hoje

Qualquer perfil com `reservar` libera **qualquer** reserva manual (medido: PRODUCAO libera a da ENGENHARIA, 200). Os
contratos da 76 dizem que a reserva manual "para quem já pode" **não se reabre** — fica como está e vira aviso (C novo).

### 5. A tela Reservas

- O botão **Liberar** aparece para toda reserva `ATIVA`; o clique chama `bloquearSeNaoPode('reservar', e)`
  (`ReservasAlmoxarifado.js:380-381`). O **Transferir**, `bloquearSeNaoPode('reservar_outra_os')` (`:385`).
- A coluna diz `REQ #<requisicao_id>` (`:353`) e o modal *"Esta reserva pertence à requisição #<id>"* (`:518`) — **o id,
  não o número** (Surpresa 6 da 76). `GET /reservas` (`reservationService.listarReservas`, `:19-33`) não traz número nem
  solicitante da requisição — a tela não tem como saber quem é o dono.
- O teste da tela (`ReservasAlmoxarifado.test.js`) mocka `useAlmoxPermissoes` com `pode: () => true` (`:26-29`) e
  prende o texto `'requisição #55'` (`:160`) com fixture **sem** número — a tela nova precisa do fallback `#<id>` para
  esse teste continuar verde sem edição.

### 6. Surpresas da medição

1. **A C136 não é só `SAIDA`.** `PERDA`, `AJUSTE_NEGATIVO` e `SAIDA_PRODUCAO` (com projeto) também consomem a reserva da
   requisição pela v2 — a recusa tem de valer para **todo** `consumindoReserva`, não para um tipo.
2. **"Dono da reserva" ≠ "dono da requisição".** Na reserva de origem `REQUISICAO`, `reservas.solicitante_id` é **quem
   aprovou** (o `user` da aprovação: a sonda deu `solicitante_id = 1 (Adm 77)` para uma requisição pedida pelo 99); na da
   chegada/inspeção (74/75), é a Qualidade/o sistema. O dono certo é `requisicoes_almoxarifado.solicitante_id`.
   Implementar "o solicitante libera" lendo a coluna da reserva daria a liberação ao **aprovador** e a negaria a quem
   pediu.
3. **A v2 não consegue forjar `requisicao_id`** (o Zod descarta) — mas a regra **não deve depender disso**: a
   `/transferencias` repassa o body cru (`extended.js:865`) e o próximo chamador de serviço pode passar qualquer coisa
   em `params`. Daí a marca no **4º argumento** (D1).
4. **PERDA e AJUSTE_NEGATIVO consomem reserva MANUAL também** (mesmo ramo do motor). Pode ser legítimo ("o material
   reservado para o projeto se perdeu") — **não** é desta etapa; declarado.
5. **Reserva manual alheia**: qualquer `reservar` libera a de qualquer um (§4).
6. **O `/cancelar` compara `r.solicitante_id !== req.user.id` sem `Number()`** (`routes/almoxarifado.js:3946`) — hoje
   inofensivo (os dois são inteiros do SQLite/JWT), mas a checagem nova usa `Number(a) === Number(b)`, o molde do
   `/rejeitar` (`:3502`).
7. **Banco local:** zero reservas de origem `REQUISICAO` (`sonda77-legado.js` → `{"n":0}`) — a régua da letra A não tem
   o que medir aqui; o tamanho do passado só em produção (**A41**).

## Decisões reversíveis (letra B do documento de novidades; última usada: B406)

- **D1 (B407) — a recusa da C136 mora no MOTOR, e a exceção é uma marca no 4º argumento.** Em
  `registrarMovimentacao`, quando `consumindoReserva` e a reserva é de `origem = 'REQUISICAO'`: aceita **só** se
  `Number(opcoes.requisicaoDaEntrega) === Number(reserva.requisicao_id)`; senão **400** com a literal M1.
  `requisitionService.entregarRequisicao` passa `{ …, requisicaoDaEntrega: requisicaoId }` no 4º argumento de cada baixa.
  **Esta decisão substitui a B402** (que deixou a C136 de fora na 76). Descartados: (a) **aceitar e descontar da
  requisição como entrega parcial** — seria uma segunda porta de entrega que pula a separação, a segunda conferência do
  material crítico (RN-06 da Etapa 28, `assertConferidaSeObrigatorio`), a assinatura e a retirada, e mudaria o
  "entregue" sem separação; (b) **recusar só na rota v2** — o motor ficaria aberto ao próximo chamador de serviço
  (mobile, integração) — a mesma lição da `TIPOS_DEDICADOS`; (c) **comparar `params.requisicao_id`** em vez do 4º
  argumento — vem do mesmo objeto que a rota repassa (Surpresa 3); (d) **só o tipo `SAIDA`** (Surpresa 1).
- **D2 (B408) — a recusa é uma leitura antes de qualquer escrita, sem claim atômico.** `origem` e `requisicao_id` nunca
  mudam depois de criados (a `transferirReserva` troca só projeto/OS/OS-ref/cliente — `reservationService.js:69-73`), então
  ler antes não abre corrida. **Precedência:** a leitura é `WHERE id = ? AND material_id = ?` — reserva inexistente ou
  de outro material continua com a mensagem de hoje (*"Reserva não encontrada para este material"*); reserva de
  requisição em **qualquer** status (ATIVA, CONSUMIDA, LIBERADA, EXPIRADA) → M1 (a regra é "nunca por esta porta", não
  "não agora"). Descartado: pôr a condição no `WHERE` do claim (a recusa sairia com a mensagem genérica de saldo/status
  e não ensinaria o caminho).
- **D3 (B409) — liberar reserva de requisição: quem pediu, ou a ação nova `liberar_reserva_requisicao` =
  `[ADMINISTRADOR, ALMOXARIFE]`.** Molde do `/rejeitar` (`ehSolicitante || can(…)`). O dono é
  `requisicoes_almoxarifado.solicitante_id` (Surpresa 2). O gate de rota `reservar` **fica** — duas camadas: abrir a
  tela (módulo), agir (perfil), e agora **sobre o quê** (dono/ação). A ação entra em `GET /minhas-permissoes` de graça
  (a rota itera `Object.keys(ACAO_PERFIS)`). Descartados: (a) **`reservar` + ser o solicitante, sem ação nova** — o
  ALMOXARIFE perderia a liberação das reservas que não pediu, que é o ofício dele; (b) **reusar `aprovar_requisicao`**
  — listaria o GESTOR sem porta (D4) e amarraria "aprovar" a "liberar": restringir um restringiria o outro (o
  critério de ação própria escrito em `permissions.js`); (c) **só a ação, sem o dono** — o solicitante perderia a
  desistência parcial que o `/cancelar` já lhe dá inteira; (d) **trocar o fallback `PRODUCAO` → `CONSULTA`** (B54) —
  decisão de negócio aberta, muda o módulo inteiro para fechar uma porta.
- **D4 (B410) — o GESTOR fica fora da ação nova.** Medido: a rota exige `reservar` e ele não tem — listá-lo seria
  configuração morta (regra da Etapa 36, `autorizar_excedente`). Ele solta tudo pelo `/encerrar`. Reversível: incluir o
  GESTOR exige mudar o gate da rota (vira "reservar **ou** liberar_reserva_requisicao"), não só o mapa.
- **D5 (B411) — a checagem fica numa função de serviço chamada pela ROTA, não dentro de `stockService.liberarReserva`.**
  `reservationService.assertPodeLiberarReserva(db, user, reservaId)`. Descartado: no motor — `liberarReserva` tem oito
  chamadores de **sistema** (cancelar, excluir, encerrar, rejeitar-valor, expiração, desfazer aprovação perdedora,
  desfazer chegada, estorno da entrada), todos legítimos sem dono nem perfil; cada um precisaria de um opt-out — o mesmo
  motivo da D1 da 76 (gancho nas portas).
- **D6 (B412) — a reserva manual não muda** (contrato que não se reabre): qualquer `reservar` continua liberando a de
  qualquer um (Surpresa 5 → **C novo**). Descartado agora: "só quem criou a manual" — `reservas.solicitante_id` existe
  e serviria, mas muda o que PRODUCAO/ENGENHARIA fazem hoje sem medir uso; candidata.
- **D7 (B413) — `GET /reservas` ganha duas chaves (aditivo) e a tela usa.** `requisicao_numero` e
  `requisicao_solicitante_id` (`LEFT JOIN requisicoes_almoxarifado`; `null` na manual). A tela mostra o número (coluna e
  modal, fallback `#<id>`) e, para reserva de requisição, barra o **Liberar** antes do modal quando
  `!pode('liberar_reserva_requisicao') && Number(user.id) !== Number(r.requisicao_solicitante_id)`. A tela falha
  **aberto** como sempre (o hook) — quem decide é o backend. Descartado: tela intocada (o barrado só saberia depois de
  digitar o motivo); expor o **nome** do solicitante (a tela não precisa; menos dado pessoal na listagem sem gate de
  perfil).
- **D8 (B414) — sem corrigir o passado.** Saídas avulsas que já consumiram reserva de requisição ficam como estão; a
  **A41** as acha. Descartado: reverter no deploy (estorno automático de movimento alheio).

## Regras de negócio

- **RN-01 (a saída genérica não consome reserva de requisição)** — material com 4, R(4) aprovada → reserva `ATIVA`
  origem `REQUISICAO`. `POST /movimentacoes/v2` (ALMOXARIFE) `{tipo, quantidade: 4, reserva_id}` para `SAIDA`, `PERDA`,
  `AJUSTE_NEGATIVO` e `SAIDA_PRODUCAO` + `projeto_id` → **400 com a literal M1** (número da requisição dentro); **nada
  mudou**: reserva `ATIVA` util 0, material atual 4 / reservada 4, R `TOTALMENTE_RESERVADA`, item entregue 0, **nenhuma
  linha nova** no livro do material. Parcial (1 de 4) → mesmo 400. *Metade positiva:* reserva **manual** pela v2 → 201,
  `CONSUMIDA` (o `reservaConsumo` existente, **sem edição**, mais um caso novo lado a lado com o recusado).
- **RN-02 (a entrega da própria requisição continua consumindo)** — R(4) aprovada, separada e entregue pela rota (`PUT
  /requisicoes/:id/entregar`, ALMOXARIFE) → 200; reserva `CONSUMIDA`; o movimento `SAIDA` cita `reserva_id` **e**
  `requisicao_id`; item entregue 4. Entrega maior que a reserva (reserva 2, entrega 4) → o excedente sai do disponível e a
  parte reservada consome a reserva (o desenho de `:1106-1141`, inalterado). Os testes existentes
  (`requisicaoReservaAutomatica`, `entregaOrigemPorItem`, `recebimentoReservaChegadaIntegracao` jornada 4,
  `inspecaoReservaLiberacaoIntegracao`) **verdes sem edição**.
- **RN-03 (a marca é do 4º argumento e é da requisição certa — pelo serviço)** — `stockService.registrarMovimentacao`
  direto, reserva de R1: (a) sem 4º argumento → 400 M1; (b) `params.requisicao_id = R1` sem marca → 400 M1 (o campo do
  `params` não abre); (c) `{ requisicaoDaEntrega: R2 }` → 400 M1; (d) `{ requisicaoDaEntrega: R1 }` → consome.
- **RN-04 (precedência)** — reserva inexistente → *"Reserva não encontrada para este material"* (hoje); reserva **de
  requisição** de outro material → a mesma mensagem de hoje; reserva de requisição já `LIBERADA` (liberada pelo
  ALMOXARIFE) → **M1** (não *"Reserva liberada não pode ser consumida"*).
- **RN-05 (quem libera reserva de requisição — a lista positiva)** — (a) **quem pediu**, sem perfil (→ PRODUCAO) →
  200, reserva `LIBERADA`, R recalculada (contrato da 76: `APROVADO`), corpo com as quatro chaves de hoje; (b) quem
  pediu, liberando **parte** → 200, `PARCIALMENTE_RESERVADA`; (c) ALMOXARIFE (não pediu) → 200; (d) ADMINISTRADOR
  (perfil) → 200.
- **RN-06 (a lista NEGATIVA de permissão)** — reserva de requisição pedida por **outro**: (a) usuário sem perfil
  (→ PRODUCAO), (b) PRODUCAO, (c) ENGENHARIA → **403** `{error: M2, acao: 'liberar_reserva_requisicao', perfil}`; reserva
  `ATIVA`, R inalterada, **nenhuma** `LIBERACAO_RESERVA` no livro. (d) GESTOR, COMPRAS, CONSULTA, QUALIDADE → 403
  `acao: 'reservar'` (a rota, inalterada). (e) O mapa: `ACAO_PERFIS.liberar_reserva_requisicao` deepStrictEqual
  `['ADMINISTRADOR', 'ALMOXARIFE']`. (f) **O aprovador não é o dono:** a reserva tem `solicitante_id` = quem aprovou;
  um usuário PRODUCAO cujo `id` é o `solicitante_id` **da reserva** (forjado por `UPDATE` no teste) mas não o da
  requisição → 403. (g) Ordem: não-dono sem a ação liberando uma reserva de requisição já `LIBERADA` → **403** (permissão
  antes do estado); reserva inexistente → **404** *"Reserva não encontrada"* (hoje).
- **RN-07 (reserva manual — inalterada, declarado)** — ENGENHARIA cria manual; **outro** PRODUCAO libera → 200
  (Surpresa 5, C novo). O job de expiração (`configurar`) vence reserva de requisição como hoje (a checagem é da rota de
  liberar, não do job).
- **RN-08 (a listagem diz de quem é)** — `GET /reservas`: reserva de requisição traz `requisicao_numero` (o número) e
  `requisicao_solicitante_id`; manual traz os dois `null`; as chaves de hoje continuam.
- **RN-09 (minhas-permissoes)** — `GET /minhas-permissoes` → `acoes.liberar_reserva_requisicao` `true` para ALMOXARIFE,
  `false` para PRODUCAO e para o sem perfil.
- **RN-10 (a tela)** — reserva de requisição, usuário **sem** a ação e **não** solicitante → clicar **Liberar** chama
  `bloquearSeNaoPode('liberar_reserva_requisicao')` e **o modal não abre**; o solicitante (`user.id ===
  requisicao_solicitante_id`) → o modal abre; o modal e a coluna mostram o **número** (`REQ-…`), e `#<id>` quando o
  número não veio. Reserva manual → o gate de hoje (`reservar`).

## Contrato (congelado)

### Literais

- **M1** (motor, 400): `` `A reserva ${reserva_id} é da requisição ${numero} — o material reservado para ela só sai pela entrega da requisição (tela Requisições), não por movimentação avulsa` ``
  `numero` = `requisicoes_almoxarifado.numero`; se a requisição não for achada, `` `#${requisicao_id}` ``. Pela v2 sai
  `{ error: M1 }` (o `handleError` de hoje). Pela entrega (não deveria acontecer) o `requisitionService` prefixa
  `"<material>: "` como faz com todo erro do motor.
- **M2** (rota de liberar, 403): corpo `{ error, acao: 'liberar_reserva_requisicao', perfil: getPerfilFromUser(user) }`
  com `` error = `Sem permissão para liberar a reserva da requisição ${numero}: só quem pediu a requisição, o almoxarife ou o administrador liberam` ``
  (mesmo fallback `#<id>`).
- **Rótulo** (`client/src/utils/permissaoErro.js`, `ACOES`): `liberar_reserva_requisicao: 'liberar a reserva de uma requisição'`.

### Mapa — `services/almoxarifado/permissions.js` (T0)

```
liberar_reserva_requisicao: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
```
com comentário: dono por identidade mora em `reservationService.assertPodeLiberarReserva`; GESTOR fora (D4); `reservar`
inalterado.

### Serviço — `services/almoxarifado/reservationService.js` (T0)

```
assertPodeLiberarReserva(db, user, reservaId) -> void        // exportada; lança 403 com .acao/.perfil
```
1. `r = SELECT id, origem, requisicao_id FROM reservas_material_almoxarifado WHERE id = ?`. Não achou → **retorna**
   (o 404 é do `liberarReserva`, inalterado). `origem !== 'REQUISICAO'` ou `requisicao_id` nulo → retorna.
2. `q = SELECT numero, solicitante_id FROM requisicoes_almoxarifado WHERE id = ?`.
3. `q && Number(user?.id) === Number(q.solicitante_id)` → retorna. `can(user, 'liberar_reserva_requisicao')` → retorna.
4. Senão lança `Object.assign(new Error(M2), { status: 403, acao: 'liberar_reserva_requisicao', perfil:
   getPerfilFromUser(user) })`.

`listarReservas` (T0): o `SELECT` ganha `rq.numero AS requisicao_numero, rq.solicitante_id AS requisicao_solicitante_id`
com `LEFT JOIN requisicoes_almoxarifado rq ON rq.id = r.requisicao_id`. Filtros e ordem inalterados.

### Rota — `POST /api/almoxarifado/reservas/:id/liberar` (T0, `extended.js:936-952`)

Ordem: `requirePermission('reservar')` (inalterado) → `await reservationService.assertPodeLiberarReserva(db,
req.user, req.params.id)` → `stockService.liberarReserva` → gancho da 76 → `res.json(result)`. No `catch`: erro com
`acao` → `res.status(403).json({ error: e.message, acao: e.acao, perfil: e.perfil })`; os demais → `handleError` (hoje).
Resposta de sucesso **inalterada** (B399).

### Motor — `stockService.registrarMovimentacao` (T1)

Logo depois de `const consumindoReserva = …` (`:1021`) e **antes de qualquer escrita**:
```
if (consumindoReserva) {
  const rv = await dbGet(db, `SELECT rs.id, rs.origem, rs.requisicao_id, rq.numero
    FROM reservas_material_almoxarifado rs LEFT JOIN requisicoes_almoxarifado rq ON rq.id = rs.requisicao_id
    WHERE rs.id = ? AND rs.material_id = ?`, [reserva_id, material_id]);
  if (rv && rv.origem === 'REQUISICAO' && rv.requisicao_id != null
      && Number(opcoes.requisicaoDaEntrega) !== Number(rv.requisicao_id)) throw 400 M1;
}
```
`opcoes.requisicaoDaEntrega` só pelo 4º argumento (nunca do body — comentário no código, molde de `doBloqueado`).
`requisitionService.entregarRequisicao` (`:1186`): o 4º argumento ganha `requisicaoDaEntrega: requisicaoId`.

### O que não muda (contratos que não se reabrem)

O recálculo da 76 (`recalcularStatusSobTrava`, as duas portas, respostas); a reserva na chegada/liberação (74/75) e a
trava; a entrega consumindo a reserva do item (só ganha a marca); o estorno (B374/B381/B382); a reserva manual (criar,
liberar, transferir, consumir pela v2); `processar-expiracao`; `transferir`; `getPerfilFromUser`; `reservar`.

> **Correção da Fase 5 — esta seção estava ERRADA.** Ela dizia que o estorno de uma saída avulsa antiga que consumiu
> reserva de requisição "reativa a reserva, como hoje". **Falso:** `cancelarMovimentacao` (`stockService.js:2216`) não
> tem ramo de reserva para estorno de SAÍDA (só o da ENTRADA_COMPRA da 74). Medido (sonda P1 de `sonda77f-b.js`): depois
> do estorno a reserva continua `CONSUMIDA` (util 4/4), o material volta a atual 4 com **reservada 0**, e a requisição
> continua `TOTALMENTE_RESERVADA` sem hold nenhum. Também deixou de ser verdade que `transferir` "não muda": desde a
> Fase 5 (F2) reserva de requisição não se transfere.

## Tasks

Ordem topológica: **T0 → T1 → T3 → T4**, com **T2 (galho)** em paralelo a T1 depois da T0.

- T0 e T1 são **tronco**: T0 muda `ACAO_PERFIS` (todas as telas e testes de permissão leem) e o contrato do `GET
  /reservas`; T1 muda o motor. Arquivos disjuntos (T0: `permissions.js`, `reservationService.js`, `extended.js`,
  `client/src/utils/permissaoErro.js`; T1: `stockService.js`, `requisitionService.js`) — **mas rodam em sequência, no
  mesmo agente**: os dois sabotam produção nos controles positivos e o SQLite de teste é um só (G84); são pequenos.
- **T2 é galho de verdade:** só o cliente, contra o contrato congelado acima (mock na fronteira HTTP — legítimo), e
  depende da T0 só pelo rótulo (já commitado) e pelas chaves do `GET /reservas` (congeladas). Roda em **worktree
  própria** (junction de `node_modules`, memória `worktree-junction-node-modules.md`) enquanto a T1 roda na árvore
  principal. Não toca SQLite.

**Regras de paralelismo (G84, mantidas):**
- **Dois agentes nunca no mesmo arquivo.** T0/T1 como acima + um teste novo cada. T2: `ReservasAlmoxarifado.js` +
  `ReservasAlmoxarifado.test.js`. T3: só um teste novo. T4: só `docs/` e `specs/`.
- **Quem sabota produção não roda suíte junto com outra suíte na mesma árvore.** Sabotagem por `perl -0pi` com âncora
  contada = 1, backup `e77-<task>-*.bak` no scratchpad, restauro por cópia com md5 conferido, um controle de cada vez
  (memórias: base LF, nunca `\r\n`; `python3` indisponível).
- **A revisão adversarial (Fase 5) só começa com a T3 commitada** e a árvore quieta.
- Scratchpad com nome único (`msg-e77-t0.txt`…). Executores **não** marcam este plano; o fio principal marca.

- [x] **T0 — FEITA em `413dec88`.** Teste novo `reservaLiberarSoQuemPode` 15/15 (vermelho antes: 8 falhas, a lista
  negativa tomava 200). Contrato final: ação `liberar_reserva_requisicao` = `[ADMINISTRADOR, ALMOXARIFE]`, rótulo
  `'liberar a reserva de uma requisição'`; 403 = `{ error: M2, acao: 'liberar_reserva_requisicao' }` **sem `perfil`**
  (Fase 2), o erro do serviço carrega só `status`/`acao`; `GET /reservas` + `requisicao_numero`,
  `requisicao_solicitante_id` (`null` na manual). Controles: s1 PRODUCAO derrubou RN-06 (a)(b)(e)(f)(g) + RN-09 — (f)
  e (g) a mais que o previsto, porque usam PRODUCAO; s1 ENGENHARIA → só (c)(e); s2 → RN-05 (a)(b); s3 → RN-05 (a)(b) +
  RN-06 (f); s4 (guarda inteira) → RN-07; s5 → RN-06 (a)(b)(c)(f)(g); s6 → mesmos cinco no `deepStrictEqual` do corpo;
  s7 (sem as duas colunas) → RN-08; rótulo apagado → `permissaoErro.test.js` cai nomeando a ação. Os seis medidos
  antes verdes sem edição. Suítes: test:api 292/292, test:almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite
  verde; cliente `src/utils` + `ReservasAlmoxarifado` 111/111.
  Enunciado original: **T0 (tronco) — quem libera reserva de requisição (C137) + a listagem diz de quem é.** Pelo contrato: a ação no
  mapa, o rótulo no cliente (**mesmo commit**), `assertPodeLiberarReserva`, a rota, o `listarReservas`. Teste novo
  `server/tests/api/reservaLiberarSoQuemPode.api.test.js`, **pela rota** (usuários por perfil reais): RN-05 (a–d),
  RN-06 (a–g), RN-07, RN-08, RN-09. Nomes dos testes com o ID (`[RN-06] (b) PRODUCAO que não pediu …`).
  **Medir antes (e depois, sem edição):** `reservaLiberarRecalculaStatus`, `reservaRecalculoIntegracao`,
  `reservaRecalculoRevisaoFase5`, `reservaTransferenciaExpiracao`, `reservaConsumo`, `reservaCicloIntegracao`; cliente
  `permissaoErro.test.js` e `ReservasAlmoxarifado.test.js`. Previsto: zero edições (os testes da 76 liberam como ADMIN ou
  ALMOXARIFE — medido; o `reservaTransferenciaExpiracao` libera reservas **manuais**).
  **TDD:** a lista negativa **fica vermelha de verdade** antes da implementação (medido: PRODUCAO/ENGENHARIA/sem perfil
  tomam **200** hoje) — diferente do caso comum em que a asserção negativa nasce verde porque `can()` devolve `false` para
  a ação que não conhece. Mesmo assim o controle de concessão é obrigatório (ele prova que o teste lê **o mapa**, não um
  `if` de perfil escrito à mão).
  **Controles positivos (e por que cada um consegue cair — G85):**
  (s1) **CONCEDER a permissão proibida:** `liberar_reserva_requisicao` ganha `PERFIS.PRODUCAO` → **caem RN-06 (a) e
  (b)** com 200, a mensagem nomeando a ação (`"PRODUCAO liberou sem liberar_reserva_requisicao"`). Cai porque o passo 3
  do contrato consulta `can(user, 'liberar_reserva_requisicao')`, e o sem perfil cai em PRODUCAO pelo fallback; (c)
  ENGENHARIA continua 403 — prova que o teste mede perfil a perfil. **E cai também RN-06 (e)** (o deepStrictEqual do
  mapa). Repetir com `PERFIS.ENGENHARIA` → só (c) e (e).
  (s2) **sem a exceção do dono** (passo 3 só com o `can`) → **cai RN-05 (a) e (b)** com 403: o dono é PRODUCAO, fora do
  mapa — só a identidade o deixa passar.
  (s3) **o dono errado** (comparar com `reservas.solicitante_id` em vez do da requisição — a Surpresa 2) → **caem RN-05
  (a)/(b)** (403: a reserva diz "aprovador") **e RN-06 (f)** (200: o `id` forjado bate com a coluna da reserva). Cai porque
  o teste cria a requisição com solicitante ≠ aprovador e o (f) existe exatamente para separar as duas colunas.
  (s4) **a checagem para todas as origens** (sem o `origem !== 'REQUISICAO'` do passo 1) → **cai RN-07** (403 na manual
  alheia).
  (s5) **a rota sem chamar `assertPodeLiberarReserva`** → caem RN-06 (a)(b)(c)(f)(g) — o vermelho do TDD repetido como
  controle depois do verde (prova que nada mais barra).
  (s6) **o `catch` da rota sem o ramo de `acao`** (`handleError` para tudo) → **cai RN-06 (a)** na asserção do corpo
  (`acao`/`perfil` ausentes; o status 403 continua — por isso a asserção é `deepStrictEqual` das chaves do corpo, não só
  o status).
  (s7) **`listarReservas` sem o JOIN** → cai RN-08.
  *Declarado redundante (não é controle):* o `Number()` na comparação do dono — os dois lados são inteiros hoje, nenhum
  teste o derruba (Surpresa 6).
- [x] **T1 — FEITA em `4c7dc181` (2026-10-08).** Teste novo `reservaRequisicaoSoPelaEntrega` 15/15 (vermelho antes:
  10 falhas — RN-01 inteiro tomava 201 e consumia, RN-03 (a)(b)(c) consumiam, RN-04 "já LIBERADA" dava a mensagem de
  status). Os 11 medidos antes verdes sem edição; `test:almoxarifado` 44/0 antes e depois. Controles: s1 → RN-01 todo +
  RN-03 (a)(b)(c) + RN-04 LIBERADA; s2 → RN-02 + RN-03 (d) + 4 de fora (`requisicaoReservaAutomatica` 2,
  `entregaOrigemPorItem` 1, `recebimentoReservaChegadaIntegracao` 4, `inspecaoReservaLiberacaoIntegracao` 3); s3 → RN-02 +
  os mesmos 4, RN-03 (d) verde; s4 → só RN-03 (c); s5 → só RN-03 (b); s6 → RN-01 na "nada mudou" (+ RN-03 (a)(b)(c) e
  RN-04 LIBERADA, mais que o previsto); s7 → só RN-04 "outro material". Divergências: RN-03 (b) põe as duas formas do s5
  no `params`; a M1 usa o id lido do banco (mesmo valor). Suítes: test:api 312/312, almoxarifado 44/0, validation 4/0,
  safealter 3/0, sqlite 5/0.
  Enunciado original: **T1 (tronco) — a saída genérica não consome reserva de requisição (C136).** Pelo contrato do motor e a marca na
  entrega. Teste novo `server/tests/api/reservaRequisicaoSoPelaEntrega.api.test.js`: RN-01 **pela rota v2** (os quatro
  tipos + parcial + a metade manual), RN-02 **pela rota de entrega**, RN-03 **pelo serviço** (a–d), RN-04.
  **Medir antes (e depois, sem edição):** os que usam `reserva_id` na saída (§2: `reservaConsumo`,
  `reservaTransferenciaExpiracao`, `relatoriosIndicadoresSpec27`, `saldoEmTerceiros`, `loteGuardasSaida`) e os que
  entregam com reserva (`requisicaoReservaAutomatica`, `entregaOrigemPorItem`, `recebimentoReservaChegadaIntegracao`,
  `inspecaoReservaLiberacaoIntegracao`, `ncReservaLiberacao`, `reservaRecalculoIntegracao`) — e a suíte
  `test:almoxarifado`.
  **Controles positivos (e por que cada um consegue cair — G85):**
  (s1) **sem a recusa no motor** → **caem RN-01 (todos) e RN-03 (a)(b)(c)** com 201/consumo — medido hoje (§1: 201 e
  `CONSUMIDA`). RN-04 "já LIBERADA → M1" também cai (volta a mensagem de status).
  (s2) **a recusa ignorando a marca** (recusa toda reserva de requisição) → **cai RN-02** (a entrega pela rota toma 400
  com M1 prefixado do material) **e RN-03 (d)**, **e caem os de fora** (`requisicaoReservaAutomatica` etc.) — é o
  controle de que a entrega passa pela mesma porta que recusa (ponto 1 da Fase 0 da 76). Cai porque
  `entregarRequisicao` cita `reserva_id` na baixa reservada (`requisitionService.js:1174`, medido).
  (s3) **a entrega sem passar a marca** (`requisitionService` sem `requisicaoDaEntrega`) → o mesmo de (s2) pela rota,
  **RN-03 (d) verde** — prova que RN-02 mede a fiação da entrega, não só o motor.
  (s4) **a marca aceita por presença** (`if (opcoes.requisicaoDaEntrega)` em vez de comparar com a da reserva) → **cai
  só RN-03 (c)** (consome a reserva de R1 com a marca de R2).
  (s5) **a marca lida do `params`** (`params.requisicaoDaEntrega || params.requisicao_id`) → **cai RN-03 (b)**.
  (s6) **a recusa depois do claim** (mover o bloco para depois do `UPDATE … RETURNING` da reserva, sem compensar) → **cai
  RN-01 na asserção "nada mudou"** (util 4 / reserva presa). Cai porque a asserção relê reserva **e** material, não só o
  status HTTP.
  (s7) **a leitura sem `AND material_id = ?`** → **cai RN-04** "reserva de requisição de outro material" (sai M1 em vez da
  mensagem de hoje).
- [x] **T2 — FEITA em `db2e294c` (worktree `e77b`, merge `bdeefda4`, 2026-10-08).** 6 casos novos de RN-10 ((a), (b),
  (b2) com a ação sem ser dono, (b3) dono sem `reservar` barrado pela primeira camada, (b4) manual, (c)); os 10 de hoje
  sem edição; (a) e (c) vermelhos contra o componente antigo. Controles: s1 → só (b); s2 → só (a); s3 → só o caso
  existente do `#55`. Cliente 93 suítes / 1388 testes (antes 1382), build limpo. Divergência (segue a Fase 2): o (a)
  afirma `pode('liberar_reserva_requisicao')` + o toast com a literal da tela, não `bloquearSeNaoPode` (que mostraria o
  "Solicite acesso" genérico); a coluna mostra o número sozinho (já começa com `REQ-`), `REQ #<id>` só no fallback.
  Enunciado original: **T2 (galho, paralelo à T1, worktree) — a tela Reservas.** Contra o contrato: coluna e modal com
  `requisicao_numero ?? '#' + requisicao_id`; `useAuth()` para o `user.id`; o **Liberar** de reserva de requisição:
  `if (Number(user?.id) !== Number(r.requisicao_solicitante_id) && !bloquearSeNaoPode('liberar_reserva_requisicao', e))
  return;` — manual continua `bloquearSeNaoPode('reservar', e)`. Testes novos em `ReservasAlmoxarifado.test.js` (RN-10):
  mock de `useAlmoxPermissoes` **por teste** (`pode`/`bloquearSeNaoPode` controláveis) e de `AuthContext`; (a) não-dono
  sem a ação → `bloquearSeNaoPode` chamado com `'liberar_reserva_requisicao'` e **nenhum** `.almox-modal`; (b) dono
  sem a ação → modal abre; (c) com número → `'requisição REQ-…'` no modal e na coluna; (d) os 10 casos de hoje **sem
  edição** (o `'requisição #55'` vem do fallback). **Medir antes:** a suíte do cliente inteira e `CI=true` build.
  **Controles positivos:** (s1) sem o ramo do dono → **cai (b)** (o mock de `bloquearSeNaoPode` devolve `false` para a
  ação). (s2) gate de requisição trocado de volta para `'reservar'` → **cai (a)** (a asserção é sobre o **nome** da ação
  passada ao mock, que devolve `true` para `reservar`). (s3) sem o fallback `#<id>` → **cai o caso existente** de `:160`.
- [x] **T3 — FEITA em `6476f63d` (2026-10-08).** 12 casos pelas rotas, perfis reais, verdes de primeira (esperado
  depois de T0/T1). Controles: (s1) da T1 → jornada 2 e chegada 2 caem com 201 (+7 em cascata); (s1) da T0 com PRODUCAO
  → jornada 3 cai com 200 (ENGENHARIA continua 403 — mede perfil a perfil); (s2) da T0 → jornada 7 cai com 403; **(s3)
  da T1 a mais** (entrega sem a marca) → jornada 9 e chegada 3 caem com 400 M1 prefixado — a prova do ponto 1 da seção
  abaixo. Texto do plano a acertar: R termina `ENTREGUE` (o "ATENDIDA/terminal"); a parte da chegada também entra pelas
  rotas (a reserva nasce no serviço da 74 dentro do `processar`). Suítes: test:api 313/313, almoxarifado 44/0,
  validation 4/0, safealter 3/0, sqlite 5/0.
  Enunciado original: **T3 — integração cruzando T0 × T1 × a 76, pelas rotas e pelo serviço.** Teste novo
  `server/tests/api/reservaRequisicaoPortaIntegracao.api.test.js`, perfis reais (molde `reservaRecalculoIntegracao`):
  **jornada pela rota** — S (sem perfil → PRODUCAO) cria R(6) pela rota; GESTOR aprova (`TOTALMENTE_RESERVADA`);
  ALMOXARIFE tenta a v2 `SAIDA` com o `reserva_id` → 400 M1, nada mudou; **outro** PRODUCAO tenta liberar → 403 M2;
  ENGENHARIA → 403 M2; S libera **2** → 200, `PARCIALMENTE_RESERVADA` (o recálculo da 76 compõe com a checagem nova);
  `GET /reservas` mostra o número e `requisicao_solicitante_id = S`; ALMOXARIFE separa e entrega **6** → a parte
  reservada (4) consome a reserva (`CONSUMIDA`, movimento com `reserva_id` e `requisicao_id`), o excedente (2) sai do
  disponível; R `ATENDIDA`/terminal pela máquina de hoje. **Metade manual na mesma jornada:** ENGENHARIA cria manual; a
  v2 do ALMOXARIFE a consome → 201; outra manual liberada por PRODUCAO alheio → 200 (declarado). **Pelo serviço:**
  uma nota (Etapa 74) cria reserva de chegada para R2 (origem `REQUISICAO`, `recebimento_id`) → a v2 com esse
  `reserva_id` → 400 M1 (a reserva da chegada é reserva de requisição); a entrega de R2 a consome.
  **Controles:** (s1) da T1 → cai a v2 da jornada e a da reserva de chegada; (s1) da T0 com PRODUCAO concedido → cai o
  "outro PRODUCAO → 403"; (s2) da T0 → cai "S libera 2".
- [x] **T4 — FEITA (2026-10-08): código `2201eb1f` (a tela esconde o Transferir em reserva de requisição) + documentos
  `6b03642d`.** O que cada documento recebeu, as divergências e a verificação: seção "T4 — fechamento" no fim.
  A "Etapa 78" abaixo saiu como **Etapa 91** (numeração única desde 2026-10-07).
  Enunciado original: **T4 — fechamento** (skill `fechar-etapa`): spec 07 (a linha *"Consumo contra reserva: saída com `reserva_id`
  valida contra a própria reserva"* (`07-reservas/README.md:47`) ganha a exceção **dizendo que estava incompleta** — ela
  valia para reserva de requisição também, e isso era a C136; tabela de testes com os três arquivos novos; a linha da
  rota `POST /reservas/:id/liberar (reservar)` (`:43`) ganha "+ dono ou `liberar_reserva_requisicao` para reserva de
  requisição"); spec 23 (a ação nova no mapa de perfis); mapa `specs/modulo-almoxarifado/README.md` (linha 07);
  guia do usuário; manual; novidades: **B407–B414** (a **B402** marcada "substituída pela B407"), **C136** e **C137** ✅
  resolvidos, **C novo** (manual alheia — Surpresa 5), **C novo** (o que muda para quem integra: v2 com reserva de
  requisição → 400; PRODUCAO/ENGENHARIA deixam de liberar reserva de requisição alheia), **A41**, limitação (77) em D
  (PERDA/AJUSTE_NEGATIVO em reserva manual — Surpresa 4); retro de 4 números e a **Próxima tarefa detalhada — Etapa 78**
  (candidata: C131).

## Teste de integração — por que a T3 é a única prova de duas coisas

1. **A fiação da entrega** (a marca no 4º argumento) só é provada por um cenário que entra **pela rota** `PUT
   /requisicoes/:id/entregar` **com** a recusa do motor ligada — o RN-03 (d) pelo serviço passaria com a entrega sem a
   marca (é o (s3) da T1).
2. **A checagem nova antes do gancho da 76**: liberar parte pelo dono tem de passar pela `assertPodeLiberarReserva`
   **e** recalcular — duas peças de etapas diferentes na mesma rota.

## O que fica de fora (declarado — e por quê)

- **O fallback `PRODUCAO`** (B54): decisão de negócio aberta; esta etapa fecha a porta da C137 sem mexer nele.
- **Quem libera reserva manual alheia** (D6, Surpresa 5): contrato que não se reabre — C novo.
- **PERDA/AJUSTE_NEGATIVO consumindo reserva manual** (Surpresa 4): pode ser legítimo; limitação declarada.
- **GESTOR liberar reserva de requisição** (D4): sem porta.
- **Corrigir o passado** (D8): a A41 acha.
- **C131**: ~~Etapa 78~~ **Etapa 91** *(corrigido no fechamento: desde a unificação de 2026-10-07 a numeração de etapas é
  única e as 78–90 foram do lote de Compras/núcleo)*.
- **Avisar o solicitante quando a reserva dele é liberada por outro**: nenhuma porta avisa hoje (o mesmo "fora" da 76).
- *(acrescentado na Fase 5 — a revisão mediu, o plano não declarava)* **Saída avulsa SEM `reserva_id` em material
  com `permite_saldo_negativo` leva o estoque reservado da requisição** (sonda P5 de `sonda77f-b.js`): a C136 fecha a
  porta de quem **cita** a reserva; quem não cita passa pela guarda do disponível, e o material que aceita saldo
  negativo não tem guarda. Medido: material com 4, reserva de 4 da requisição, a v2 `SAIDA` de 4 **sem** `reserva_id`
  → 201, atual 0 / reservada 4, reserva `ATIVA`, R `TOTALMENTE_RESERVADA`; a separação depois → 400 *"Máximo: 0"*.
  Limitação declarada (letra D no fechamento): é a regra de `permite_saldo_negativo`, não desta etapa.
- *(Fase 5)* **Tipos que não são saída guardam `reserva_id` sem consumir** (sonda P7): `ENTRADA` e `AJUSTE` pela
  v2 com o `reserva_id` de uma reserva de requisição → 201 e a coluna fica gravada no movimento (o motor só consome
  quando `tiposSaida.includes(tipo)`; para os outros a coluna é só texto). Não move a reserva — por isso a A41
  filtra por `TIPOS_SAIDA` (correção abaixo); recusar `reserva_id` em não-saída fica de fora (candidata).
- *(Fase 5)* **F3 — `PUT /api/requisicoes-material/:id/cancelar` cancela uma requisição `APROVADO` sem soltar as
  reservas** (achado da revisão; a porta do almoxarifado, `/api/almoxarifado/requisicoes/:id/cancelar`, solta
  pelo `liberarReservasDaRequisicao`). Janela estreita (só o status `APROVADO` com reserva `ATIVA`) — vira **item C
  na T4**, não correção nesta etapa.

## Letra A — consulta para produção (a confirmar no fechamento como **A41**)

**A41 — saídas avulsas que já consumiram reserva de requisição** (o tamanho da C136 em produção). A entrega grava
`requisicao_id` no movimento; a saída avulsa não. Somente leitura:

```sql
SELECT m.id, m.created_at, m.tipo, m.quantidade, m.usuario_nome, rs.id AS reserva_id, rq.numero, rq.status
FROM movimentacoes_almoxarifado m
JOIN reservas_material_almoxarifado rs ON rs.id = m.reserva_id
LEFT JOIN requisicoes_almoxarifado rq ON rq.id = rs.requisicao_id
WHERE rs.origem = 'REQUISICAO'
  -- Fase 5: TIPOS_SAIDA (movementTypes.js:69-71), nao "tudo menos RESERVA/LIBERACAO/ESTORNO"
  AND m.tipo IN ('SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO',
                 'SUCATA', 'PERDA', 'DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
                 'DEVOLUCAO_FORNECEDOR')
  AND m.requisicao_id IS NULL
  AND COALESCE(m.cancelado, 0) = 0
ORDER BY m.created_at;
```

(Banco local medido: **0** reservas de requisição — sem amostra aqui.) O que fazer com o resultado: cada linha é
material que saiu "pela requisição" sem ela saber — conferir se a requisição foi atendida de outro jeito; se não,
estornar a saída avulsa e entregar pela requisição.
**Correção da Fase 5 — o texto antigo dizia "(o estorno reativa a reserva)": era FALSO.** Medido (sonda P1): o estorno
devolve o material ao **disponível** (atual 4, reservada 0) e a reserva continua `CONSUMIDA`; não há porta que recrie a
reserva de requisição para uma requisição já `TOTALMENTE_RESERVADA` (o `/aprovar` só sai de `PENDENTE`). O que funciona
hoje, medido: estornar a saída avulsa e, **logo em seguida**, separar e entregar pela requisição (`PUT
/requisicoes/:id/separacao` + `/entregar`) → 200, `ENTREGUE`, a baixa sai do disponível. Entre o estorno e a separação o
material fica **desprotegido** (outra saída ou reserva pode levá-lo) e a requisição diz `TOTALMENTE_RESERVADA` sem hold —
por isso os dois gestos juntos. A query também passou a filtrar `m.tipo IN (TIPOS_SAIDA)` (era "tudo menos RESERVA,
LIBERACAO_RESERVA, ESTORNO"): `ENTRADA` e `AJUSTE` pela v2 gravam `reserva_id` sem consumir (sonda P7: 201, coluna
gravada) e seriam falsos positivos.
*(Colunas conferidas no schema: `usuario_nome` em `schema.js:392`, `cancelado` em `schema.js:1267`.)*

## Próximo passo

**Fase 2** — revisão do plano por um agente fresco, com as quatro perguntas da skill (contratos e literais; RN × spec 07
e 23; independência real da T2; cada RN seguida até o último gesto — p.ex. RN-05: o dono libera parte → R
`PARCIALMENTE_RESERVADA` → a próxima nota ainda a trata como candidata (74)? → a entrega pela rota, com a reserva
reduzida, ainda consome o que sobrou? — e RN-01: a v2 recusada → a tela Movimentações, que não manda `reserva_id`,
continua dando baixa do **disponível** sem tocar a reserva?) **e a quinta da G85: cada controle positivo acima
consegue cair, pelo caminho que o plano diz?** Depois, T0.

## Fase 2 — revisão do plano: 0 críticos, 4 importantes, 4 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE — M2 nunca chega ao usuário**: o interceptor do axios (`client/src/services/api.js:148-156`) reescreve
  `data.error` de todo 403 com `acao` E `perfil` para "Sem permissão … seu perfil é X. Solicite acesso" — a regra é "só
  quem pediu", não "peça acesso". → **o 403 da liberação sai SEM `perfil`** (o molde do `/rejeitar`,
  `routes/almoxarifado.js:3503-3506`): `{ error: M2, acao }`; RN-06 e o controle (s6) mudam junto (letra B).
- **IMPORTANTE — "quem pediu pode liberar" é falso para quem pediu por outro módulo**: `POST
  /api/requisicoes-material` não tem gate de perfil (`requisicoesMaterial.js:310`) — COMPRAS/GESTOR/CONSULTA criam
  requisição e, depois de aprovada, tomam 403 `reservar` ao liberar (sonda `sonda77r-dono-sem-reservar.js`). Backend:
  não é regressão — declarar na RN-05, no guia e na letra C. **Tela (T2)**: o Liberar só abre com `pode('reservar')` E
  (dono OU `pode('liberar_reserva_requisicao')`); quem não passa vê o toast com a REGRA (texto literal próprio da tela:
  "Só quem pediu a requisição, o almoxarife ou o administrador liberam esta reserva"), não o "Solicite acesso" genérico.
- **IMPORTANTE (G85) — T0 (s4) não caía**: tirar só `origem !== 'REQUISICAO'` deixa a manual passar pelo
  `requisicao_id` nulo. → a sabotagem tira a guarda inteira do passo 1 (as duas condições).
- Menores: T0 (s1) cai também no RN-09 (minhas-permissoes) — listar; T1 (s6): âncora fixada ENTRE o claim da reserva
  (`stockService.js:1628`) e `saidaFisicoAplicado = true` (depois disso o catch largo desfaz e "nada mudou" fica
  verde); `GET /reservas` traz `solicitante_id` (= APROVADOR) pelo `r.*` — comentário no código e a tela usa
  `requisicao_solicitante_id`; T2: `jest.mock('../../context/AuthContext')` no topo do arquivo de teste (useAuth lança
  sem provider) — os 10 casos não mudam, o arquivo sim; o rótulo da ação nova entra no MESMO commit da T0
  (`permissaoErro.test.js:46` importa `ACAO_PERFIS`); o guia diz que, depois da 77, o único jeito de PRODUCAO liberar
  material de outro é a reserva manual (B412).
- **Paralelismo**: T2 (só `client/`) roda em paralelo com a T1 (só `server/`) na árvore principal — arquivos e
  suítes disjuntos (o teste do client só lê `permissions.js`, que a T1 não toca); a T2 começa DEPOIS do commit da T0.
  Commits: cada agente adiciona só os seus arquivos; se o git acusar `index.lock`, espere e repita.

## Fase 5 — revisão adversarial do código (2026-10-08): 1 importante, 1 médio, 2 sobreviventes, 1 lacuna + 4 correções do plano → 1 rodada até verde

Revisores frescos com sondas executadas (scratchpad: `sonda77a-1.js`, `sonda77f-a.js`, `sonda77f-b.js`,
`r77/mut/tests/api/zzProbe77.api.test.js`). Cada achado reproduzido como teste **vermelho antes** da correção.

- **F1 (importante) — o dono liberava a reserva depois que a separação começou.** Sonda: R(6) aprovada, separada
  (`EM_SEPARACAO`); o `/cancelar` do dono → 400, mas `POST /reservas/:id/liberar` do dono → **200**, material
  atual 6 / reservada 0, outro PRODUCAO reserva os 6 (201) e a entrega → 400 *"Máximo: 0"*. Correção em
  `assertPodeLiberarReserva`: a exceção do dono só vale enquanto `validarTransicao(status, 'CANCELADO').ok` (a máquina
  de estados, não uma lista à mão — o mesmo critério do `/cancelar`); fora disso o dono sem a ação toma 403 `{ error:
  M3, acao: 'liberar_reserva_requisicao' }`, M3 = `` `Sem permissão para liberar a reserva da requisição ${numero}: ela
  já está em separação — só o almoxarife ou o administrador liberam agora` `` (fallback `#<id>`). ALMOXARIFE/ADMINISTRADOR
  inalterados; não-dono continua M2. Cliente: `GET /reservas` ganha `requisicao_status` (aditivo, `null` na manual) e
  a tela só abre o Liberar para o dono quando o status está em `STATUS_DONO_LIBERA_RESERVA` (exportada; o teste (d4)
  compara com `TRANSICOES` do servidor — drift derruba); fora disso, toast próprio *"Esta requisição já está em
  separação — só o almoxarife ou o administrador liberam a reserva agora"*; sem o status (servidor antigo) falha aberto.
  Vermelho antes: `[F1]` EM_SEPARACAO e PRONTA_PARA_RETIRADA → 200 (19/3 com o F2); cliente (d)×2 + (d4) → 18/3.
- **F2 (médio) — `PUT /reservas/:id/transferir` re-apontava reserva de requisição** para outra OS/projeto (GESTOR →
  200, `projeto_id = 999`, origem `REQUISICAO` mantida). Correção em `transferirReserva`: origem `REQUISICAO` → 400
  `` `A reserva ${id} é da requisição ${numero} e não pode ser transferida para outra OS ou projeto` ``, antes do status.
  Manual segue transferível (metade positiva). **Contrato declarado da 76 que muda:** `reservaLiberarRecalculaStatus`
  RN-08 afirmava 200 — editado para 400 com o comentário do porquê (o que ele protegia — `requisicao_id`, status e hold
  — continua afirmado).
- **Sobrevivente 1 — RN-01 cobria 4 tipos.** Restringir a recusa do motor a SAIDA/PERDA/AJUSTE_NEGATIVO/SAIDA_PRODUCAO
  ficava verde. Agora o loop é derivado (`TIPOS_SAIDA ∩ TIPOS_MOVIMENTO_ROTA`, vínculo de `REGRAS_VINCULO`; guarda da
  guarda com os 6 tipos). Mutação aplicada → caem SAIDA_MONTAGEM e SAIDA_ASSISTENCIA com 201.
- **Sobrevivente 2 — JOIN por `r.item_requisicao_id`** passava porque os ids andavam juntos. RN-08 (T0) e a jornada 8
  (T3) ganham requisição avulsa com itens extras antes + pré-condição `item_requisicao_id !== requisicao_id`. Mutação →
  cai RN-08 (T0) e a jornada 8 (T3).
- **Lacuna — RN-05 (e)**: admin de **sistema** (`role: 'admin'`, sem perfil do módulo) libera → 200. Mutação `can()` →
  lista literal de perfis → cai só ele.
- **Correções do plano (o plano estava errado — ver as notas no lugar):** (a) "O que não muda" e a remediação da A41
  diziam que o estorno da saída avulsa reativa a reserva — falso (P1); (b) a A41 passou a filtrar `TIPOS_SAIDA` (P7);
  (c) "O que fica de fora" ganhou P5 (saída sem `reserva_id` em material com saldo negativo leva o reservado) e os
  não-saída que gravam `reserva_id`; (d) **F3** (`/api/requisicoes-material/:id/cancelar` cancela `APROVADO` sem soltar
  reservas) declarado como **item C para a T4**.

**Controles positivos (sabotagem `perl -0pi`, âncora contada = 1, backup `e77-f5-*.bak`, restauro por cópia, md5
conferido):** servidor — c1 (dono sem a condição de status) → caem os dois `[F1]` com 200; c2 (sem o ramo M3) → os dois
`[F1]` no `deepStrictEqual` do corpo (sai M2); c3 (sem a guarda do transferir) → `[F2]` com 200. Cliente — cc1 (dono
sem `aindaCancela`) → caem os dois (d); cc2 (`RASCUNHO` fora da lista) → cai só (d4). As metades positivas (ALMOXARIFE e
ADMINISTRADOR em `EM_SEPARACAO`, manual transferível, RN-05 (a)) ficaram verdes em todos.

**Commits:** `a5245acc` (F1 + F2 + RN-05 (e) + RN-08 descolado + cliente), `198f09f4` (RN-01 derivado + jornada 8).
**Suítes depois:** test:api 313/313 arquivos; test:almoxarifado 44/0; validation 4/0; safealter 3/0; sqlite 5/0;
cliente 93 suítes / 1393 testes (antes 1388, +5); `CI=true` build *Compiled successfully*.
Arquivos de teste: `reservaLiberarSoQuemPode` 22/22 (antes 15), `reservaRequisicaoSoPelaEntrega` 17/17 (antes 15),
`reservaRequisicaoPortaIntegracao` 12/12, `reservaLiberarRecalculaStatus` 13/13.

**Para a T4 (além do que já está listado nela):** C novo **F3**; D (limitação) P5; o não-saída gravando `reserva_id`
(candidata); a tela ainda oferece **Transferir** em reserva de requisição (o servidor recusa com 400 que ensina —
esconder o botão é candidata, não feito: o teste de tela `transferir de projeto para OS` usa fixture de requisição);
B nova para a regra "dono só enquanto se cancela" (descartado: lista de status à mão no servidor) e para F2.

~~**Próximo passo: T4 (fechamento)** com a skill `fechar-etapa`.~~ *(Feito — abaixo.)*

## T4 — fechamento (2026-10-08): o que cada documento recebeu

**Código (passo 0, antes dos documentos) — `2201eb1f`:** a tela Reservas não mostra mais **Transferir** em reserva de
`origem === 'REQUISICAO'` (o servidor recusa com 400 desde a F2). Decidido esconder (B417; descartado desabilitar com
tooltip — não é permissão, é regra da reserva). Os dois testes de transferir usavam a fixture de requisição e passaram
para `RESERVA_MANUAL_ATIVA` (id 5); caso novo *"reserva de requisição não oferece Transferir; a manual oferece"* (com a
metade positiva: Liberar na linha de requisição, Liberar + Transferir na manual). Controle positivo: guarda trocada por
`true` → cai o caso novo **na asserção da linha de requisição** (esperado `false`, veio `true`); restaurado por Edit,
md5 `37a3dd93…` conferido igual ao pós-conserto, LF (0 CR). Cliente 93 suítes / 1394 testes (antes 1393), build
*Compiled successfully*.

**Documentos — `6b03642d` (o hash foi escrito pelo commit seguinte; um commit não contém o próprio hash):**
- `docs/almoxarifado-novidades-por-etapa.md` — seção **Etapa 77** (abertura, Antes → Agora, 8 regras com a literal de
  cada recusa lida do código, NÃO cobre, o que a revisão encontrou); **A41** (com a remediação corrigida da Fase 5) e o
  cabeçalho da letra A de quarenta para quarenta e um; **B407–B414** (D1–D8) + **B415** (F1, dono só enquanto se
  cancela), **B416** (F2, não se transfere), **B417** (o botão escondido), **B418** (403 sem `perfil` e textos próprios da
  tela — Fase 2); **B402** marcada "SUBSTITUÍDA PELA B407"; **C136** e **C137** ✅ resolvidos (texto original preservado);
  **C139** (manual alheia — Surpresa 5), **C140** (o que muda para quem integra, para quem libera e para quem pede por
  outro módulo; inclui "o estorno não reativa a reserva"), **C141** (F3, com consulta para achar); D **(77)** (Surpresa 4,
  P5, P7, GESTOR, quem pede por outro módulo, passado, sem aviso); F **(77)**; "Onde estamos" com a Etapa 77 e a próxima
  **Etapa 91**; ponteiro no cabeçalho do documento.
- `specs/modulo-almoxarifado/07-reservas/README.md` — status/última atualização; a linha **"Consumo contra reserva"**
  ganhou a correção à vista (**estava incompleta**: valia para reserva de requisição, e isso era a C136; e o estorno não
  reativa); as rotas `liberar` (+ dono ou ação nova) e `transferir` (reserva de requisição → 400); item de checklist da
  Etapa 77 com os hashes; transferência "só reserva manual"; tela 10 → 22 casos; 11 linhas novas na tabela de testes
  (os três arquivos novos + F1/F2); a linha da 76 "transferir não recalcula" riscada (o RN-08 virou 400); a contagem
  "51 casos em 5 arquivos" (da Etapa 4, envelhecida) saiu, dita.
- `specs/modulo-almoxarifado/23-perfis-seguranca-auditoria/README.md` — bloco "Etapa 77" (a ação nova no mapa, as três
  camadas na liberação, 403 sem `perfil`, GESTOR fora, lista negativa por controle positivo, B54 intocada).
- `specs/modulo-almoxarifado/README.md` — última atualização; linhas **07** e **23**.
- `docs/almoxarifado-guia-etapas-e-testes.md` — cabeçalho "onde parou" (Etapa 77 entregue, próxima 91, o porquê do
  número); seção da Etapa 77 (Antes → Agora, roteiro de 8 passos, NÃO cobre); o "NÃO cobre" da 76 riscado.
- `docs/almoxarifado-manual-do-sistema.md` — 5.5 (linha nova na tabela + a leitura da regra por identidade); 9.2
  (**reescrito**: "Consumida volta a Ativa quando a saída é estornada" era falso — medido na Fase 5, P1); 9.2 o número
  da requisição na tela; 9.4 (a reserva de requisição só sai pela entrega, com a literal M1); 9.5 (não se transfere, com
  a literal); 9.6 (quem libera, os status em que o dono libera, as duas literais da tela e as duas da integração).

**Numeração (registrada nos documentos):** desde a unificação de 2026-10-07 a numeração de etapas é uma só para todos os
módulos e as Etapas 78 a 90 foram do lote de Compras/núcleo (`docs/compras-novidades-por-etapa.md`, B18). Por isso a
"Próxima tarefa detalhada — Etapa 78" que a T4 previa sai como **Etapa 91**, e a linha "C131: Etapa 78" de "O que fica
de fora" foi corrigida.

## Divergências do plano (registradas, não escondidas)

1. **O Transferir da tela** — a Fase 5 o deixou como "candidata, não feito"; virou o passo 0 do fechamento (`2201eb1f`),
   porque o servidor já recusava e a tela oferecia um modal que morria em 400.
2. **O manual também estava errado** sobre o estorno (9.2: *"Uma reserva Consumida volta a Ativa quando a saída que a
   consumiu é estornada"*) — o mesmo erro que a Fase 5 achou no plano. Conferido no código: `cancelarMovimentacao` não
   tem ramo de reserva para estorno de saída; o único `SET status = 'ATIVA'` do motor (`stockService.js:1587`) é a
   compensação de uma falha **dentro da mesma** `registrarMovimentacao`. Reescrito no manual; dito na seção da etapa
   nas novidades e na spec 07.
3. **Doze B, não oito:** as quatro a mais são F1 (B415), F2 (B416), o botão (B417) e a Fase 2 do 403 sem `perfil` (B418)
   — esta última a Fase 2 mandava "para a letra B" e o plano não lhe dava número.
4. **Três C, não dois:** além dos dois previstos (C139 manual alheia, C140 o que muda), a F3 virou **C141**.
5. **Contrato de API (CLAUDE.md, decidido sem perguntar, reversível):** `GET /reservas` ganhou `requisicao_status` além
   das duas chaves congeladas (Fase 5) — aditivo; registrado na B413.

## Verificação final (2026-10-08, depois do passo 0; os documentos não tocam código)

- `cd server && npm run test:api` → **313/313 arquivos OK**.
- `npm run test:almoxarifado` → **44 passou, 0 falhou**.
- `npm run test:validation` → **4 passed, 0 failed**; `test:safealter` → **3 passed, 0 failed**; `test:sqlite` →
  **5 passed, 0 failed**.
- `cd client && CI=true npx react-scripts test --watchAll=false` → **93 suítes / 1394 testes**, todos passando.
- `CI=true npx react-scripts build` → *Compiled successfully*.
- Arquivos da etapa, rodados um a um: `reservaLiberarSoQuemPode` 22/0, `reservaRequisicaoSoPelaEntrega` 17/0,
  `reservaRequisicaoPortaIntegracao` 12/0, `reservaLiberarRecalculaStatus` 13/0.

## Retro — 4 números

1. **Rodadas de correção até verde:** 1 (o fix-round da Fase 5), mais o passo 0 do fechamento (uma sobra declarada da
   Fase 5, não um defeito novo).
2. **Achados da revisão — reais × ruído:** Fase 2: 8 (0 críticos, 4 importantes, 4 menores), 0 ruído — dois deles
   (o 403 reescrito pelo interceptor e o controle s4 que não caía) teriam passado verdes. Fase 5: 5 (1 importante, 1
   médio, 2 sobreviventes de mutação, 1 lacuna) + 4 correções do próprio plano, 0 ruído.
3. **Paralelismo:** um galho real (T2, só cliente, em worktree, contra o contrato congelado) em paralelo à T1 no tronco;
   integrado por merge (`bdeefda4`), sem retrabalho registrado. T0/T1 em sequência no mesmo agente (os dois sabotam o mesmo SQLite —
   G84).
4. **Defeito que escapou de etapa anterior:** dois. (a) A Etapa 76 tinha prendido como contrato (RN-08) que transferir
   reserva de requisição respondia 200 — o teste afirmava o defeito; a F2 o inverteu. (b) O manual dizia que o
   estorno reativa a reserva — falso, e o plano desta etapa herdou o erro. **Lição:** um teste que
   "declara" um comportamento não o torna certo; e afirmação de manual sobre efeito de estorno precisa de sonda, não de
   leitura.

## Próxima tarefa detalhada — Etapa 91: a inversão inspeção × Aprovar (C131, feature 07 com a 09 e a 04)

*(Numerada 91, não 78: numeração única desde a unificação de 2026-10-07 — ver acima.)*

**O problema (medido duas vezes).** Material crítico entra retido; R1 espera 4. A inspeção aprova 4 e, no mesmo
instante, R3 é aprovada pelo **Aprovar**: R3 leva os 4 e R1 fica com nada — oito de oito na Etapa 75, seis de seis na 76
(`sonda76-c131.js`), também com a trava por material. A ordem medida é sempre `APROVAR.criarReserva → INSPECAO.entra
liberacao → INSPECAO.sai reservas=0`: o saldo fica livre no movimento `DECISAO_INSPECAO` do motor, **antes** de a
distribuição pegar a trava.

**Por que esta (valor × esforço).** É a última inversão de fila conhecida da família reserva/chegada (74–77); as outras
candidatas são menores e podem andar junto se a Fase 0 confirmar que cabem: **C141** (o cancelar dos outros módulos não
solta reserva — trocar a rota `PUT /api/requisicoes-material/:id/cancelar`, `server/routes/requisicoesMaterial.js:338`,
para passar pelo `reservationService.liberarReservasDaRequisicao`), **C139** (reserva manual alheia — decisão de regra) e
recusar `reserva_id` em tipos não-saída (D (77)). Alternativa declarada pela B403: deixar a C131 para a migração
Postgres, onde a trava vira `SELECT … FOR UPDATE` — a Fase 0 deve medir o custo das duas e escolher (letra B).

**Fase 0 — medir antes de prometer:**
1. Reproduzir pelas rotas (com usuários reais por perfil: a Qualidade decide, o Gestor aprova) a inversão na
   **inspeção**, na **não conformidade** que aceita e na **nota** (a nota já reserva dentro do `concluir*` — medir se a
   janela existe nela também, entre o `ENTRADA_COMPRA` e `reservarChegadaParaQuemEspera`, `receiptService.js:86`).
2. As seis portas: liberação — `receiptService` (`:86`), `inspectionService.decidirInspecao` (`:374`,
   `aposLiberacaoSemFalhar`), `nonConformityService.decidirNaoConformidade` (`:968`); aprovação — `PUT
   /requisicoes/:id/aprovar` (`routes/almoxarifado.js:3437`), `PUT /requisicoes/:id/aprovar-valor` (`:3577`),
   `tentarAprovacaoAutomatica` (`:3273`), as três chamando `requisitionService.prepararPosAprovacao`
   (`requisitionService.js:250`).
3. A trava: `reservaChegadaService.comLockDoMaterial(materialId, fn)` (`:221`) — **não reentrante** (pegar duas vezes o
   mesmo material trava para sempre); `recalcularStatusSobTrava` (`:255`) é o único que pega várias, em ordem crescente
   com `DISTINCT`. Uma aprovação que pega a trava de **todos** os materiais da requisição e depois chama algo que pega a
   trava de novo (a distribuição, o recálculo) **se trava** — medir a pilha de chamadas antes de desenhar.

**Contrato que a etapa consome (não reabrir):** a distribuição (`distribuirParaQuemEspera`, a ordem da fila de
separação, o teto de cada porta, os pulos por valor e por dono); o recálculo da 76 sob a trava; a recusa da C136 no motor
(`registrarMovimentacao`, marca `requisicaoDaEntrega`); a regra de quem libera da 77 (`assertPodeLiberarReserva`); as
respostas das rotas de aprovar e decidir (B387, B399 — sem chave nova sem dizer na letra C).

**Pontos de atenção:**
- **A trava teria de começar ANTES do movimento do motor** que põe o saldo no disponível, nas três portas de liberação,
  e envolver o motor — o motor hoje não sabe da trava; não chamar `comLockDoMaterial` de dentro de algo que já roda sob
  ela (G84 + a não-reentrância).
- **Premissa de um processo só** (C132): a trava é em memória. Qualquer desenho novo herda a premissa — dizer no código e
  na letra C.
- **Teste de corrida precisa saber falhar:** a inversão é sistemática (8/8, 6/6), então o teste vermelho é reprodutível
  — exigir o vermelho antes, com o controle positivo de tirar a trava nova e ver a inversão voltar.
- **Sabotagem concorrente contamina a suíte** (memória do projeto): um agente por vez sabotando produção no mesmo SQLite.
