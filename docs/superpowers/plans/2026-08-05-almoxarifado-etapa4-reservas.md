# Plano — Almoxarifado Etapa 4: Reservas de Estoque (feature 07)

> Design: `docs/superpowers/specs/2026-08-05-almoxarifado-etapa4-reservas-design.md`
> Spec e checklist: `specs/modulo-almoxarifado/07-reservas/README.md`

## Estado (2026-08-06)

Etapa 4 **encerrada** — Tasks 1 a 6, sem pendência aberta na feature 07. Backend, tela e as duas
rotas que escapavam do hold. Quem retomar o módulo vai para a **Etapa 5 — Recebimento +
Inspeção** (`08-recebimento` + `09-inspecao-qualidade`) no planejamento mestre.

### ✅ Task 1 — Consumo contra reserva (`0e37dea`)

O buraco central. Saída com `reserva_id` valida contra a própria reserva em vez do disponível,
reivindica a reserva num UPDATE condicional com RETURNING (impede duas entregas concorrentes
consumirem o mesmo saldo), baixa físico e reservado juntos e marca `CONSUMIDA` ao zerar. Como
não há transação no serviço, há compensação explícita se a baixa do material falhar depois da
reivindicação. Teste: `server/tests/api/reservaConsumo.api.test.js` (10 casos).

Achado no caminho: `MovimentacaoSchema` não declarava `reserva_id` e o Zod descartava a chave
em silêncio — o motor nunca via o campo pela rota v2.

### ✅ Task 2 — Reserva automática na aprovação (`6690c1a`)

`requisitionService.reservarItensAprovacao`; status `PARCIALMENTE_RESERVADA`/
`TOTALMENTE_RESERVADA` na máquina de estados (destinos de APROVADO, e em `PODE_SEPARAR`);
entrega consome a reserva da requisição, dividindo a saída quando excede o reservado (o
excedente vai primeiro, porque é o único que pode falhar). `criarReserva` ganhou 4º argumento
`opcoes` — campos novos NÃO podem vir de `data`, que é `req.body` inteiro e seria forjável;
`opcoes.sistema` dispensa o gate `reservar`, obrigatório porque GESTOR tem `aprovar_requisicao`
mas não tem `reservar`. Teste: `requisicaoReservaAutomatica.api.test.js` (10 casos).

### ✅ Task 3 — Transferência, expiração e ciclo fechado (`6690c1a`)

`reservationService.js`: listagem com filtros, `PUT /reservas/:id/transferir`
(`reservar_outra_os`, sem tocar saldo, auditada), `POST /reservas/processar-expiracao` (sem
scheduler in-process, uma reserva ruim não aborta o lote) e `liberarReservasDaRequisicao`
chamada no cancelamento. `criarReserva` passou a aceitar `data_necessidade`/`expira_em`, com o
vencimento calculado pela config `reserva_dias_validade` — **opt-in**, senão as reservas manuais
existentes começariam a ser liberadas sozinhas. Testes:
`reservaTransferenciaExpiracao.api.test.js` (15) e `reservaCicloIntegracao.api.test.js` (7).

Dois bugs corrigidos ao endurecer `liberarReserva`: liberar acima do que a reserva segurava
roubava o hold de outras reservas do mesmo material; liberação parcial não reduzia a
`quantidade` da reserva.

---

### ✅ Task 4 — Tela de reservas (`43cd367`)

`client/src/components/almoxarifado/ReservasAlmoxarifado.js`, rota `/almoxarifado/reservas`
(`App.js` + `lazyModules.js`) e entrada "Reservas" no menu do módulo (`Layout.js`). Lista com
filtros de status/material/projeto, criação, liberação total ou parcial com motivo,
transferência e o botão do job de expiração (gate `configurar`).

**Três decisões que a tela não podia errar** — cada uma faz a tela mentir sobre saldo, e as três
têm teste validado por mutação:

1. Exibe `saldo` (quantidade − utilizada), não `quantidade`. Reserva consumida pela metade é o
   caso normal desde que a entrega passou a baixar contra a reserva.
2. O disponível vem de `GET /almoxarifado/estoque`, **não** de `/materiais` — só o primeiro traz
   `quantidade_disponivel` calculado pelo servidor; `/materiais` devolve o físico. Recalcular a
   fórmula no front criaria uma segunda fonte de verdade (mesmo motivo de `useAlmoxPermissoes`
   não espelhar `ACAO_PERFIS`).
3. Transferir envia os quatro campos de dono sempre, inclusive vazios: o servidor lê `undefined`
   como "manter" e `''` como "limpar", então enviar só o preenchido faz o dono antigo grudar.

Achado no caminho: o toast do job precisava reportar `erros` além de `processadas` — o job não
aborta o lote quando uma reserva falha, e engolir esse campo esconderia o saldo que ficou preso.

Teste: `client/src/components/almoxarifado/ReservasAlmoxarifado.test.js` (10 casos). Controle
positivo rodado: 4 mutações deliberadas derrubaram exatamente os 4 testes correspondentes.

### ✅ Task 5 — Indicador de reservas no detalhe do material (`43cd367`)

`ExtratoMaterialModal.js`: a tabela de reservas ativas ganhou **saldo**, **origem** (REQ #id ou
MANUAL) e os **prazos** (necessidade/expiração). Os campos já vinham do backend (`SELECT *`),
só não eram exibidos. `formatDateOnly` novo para os campos DATE puros — `new Date('2026-08-10')`
é meia-noite UTC e em UTC-3 cairia no dia 9.

---

### ✅ Task 6 — As duas pontas fechadas (`ad0c831`)

Eram a mesma classe: rota que altera a requisição sem passar pelo hold.

**`/aprovar-valor` agora reserva.** A chamada a `reservarItensAprovacao` fica na rota, **depois**
do serviço — a segregação e a validação de status vivem lá, e não faz sentido segurar saldo de
uma aprovação que vai ser recusada. Sem nada a reservar, o `APROVADO` do serviço permanece
(regressão coberta). A máquina de estados ganhou `PARCIALMENTE/TOTALMENTE_RESERVADA` como
destinos de `AGUARDANDO_APROVACAO_VALOR`: sem essas setas o hold nasceria e o status seria
recusado, e deixar `APROVADO` faria o mesmo fato ter dois status conforme a rota que aprovou.

**Excluir requisição agora libera.** `excluirRequisicao` chama
`liberarReservasDaRequisicao` (que passou de um para dois chamadores), best-effort como no
`/cancelar`; a justificativa da exclusão vira o motivo da liberação.

Teste: `reservaPontasFaltantes.api.test.js` (9 casos), escritos antes e vistos falhando. O único
que passou no RED é o de regressão — validado à parte por mutação. Um teste existente
(`requisicaoAprovacao`) foi ajustado porque assertava `APROVADO`, e ganhou asserção nova de que o
hold sai.

<details><summary>Contexto original da Task 6 (antes de ser feita)</summary>

- **`/aprovar-valor` não reserva** (verificado 2026-08-06). O serviço é
  `requisitionValueApprovalService.js` — **não** `valueApprovalService.js`, como este plano
  dizia antes. `aprovarValor` faz `UPDATE ... SET status = 'APROVADO'` direto, sem passar por
  `reservarItensAprovacao`. Requisição liberada por valor não ganha o hold: é a lacuna mais
  relevante do backend, porque justamente as requisições de valor alto ficam sem proteção.
- **Excluir requisição não libera reservas** (verificado 2026-08-06).
  `requisitionService.excluirRequisicao` é soft delete —
  `UPDATE ... SET ativo=0, status='CANCELADO'` — e não chama
  `reservationService.liberarReservasDaRequisicao`, que hoje tem **um único chamador**
  (`routes/almoxarifado.js:2309`, a rota `/cancelar`). Ou seja: duas rotas levam ao mesmo
  status `CANCELADO` com efeitos diferentes sobre o saldo, e pela exclusão o hold fica preso
  até a expiração — que é opt-in, isto é, para sempre na configuração padrão.
- ~~Consulta "quem reservou" como histórico dedicado por material~~ — coberto pela tela
  (`43cd367`): filtro por material + status "Todos" mostra o histórico com solicitante, destino
  e o que cada reserva consumiu.

</details>

## Fora da Etapa 4 (registrado na spec)

Reserva por lote/série (feature 10) · prioridade na reserva · e-mail de reserva vencida
(feature 20) · scheduler in-process para a expiração · reserva por localização (o saldo é
global por decisão de negócio — ver "Decisões de negócio" no guia).
