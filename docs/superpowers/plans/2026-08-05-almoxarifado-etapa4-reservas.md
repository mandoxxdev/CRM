# Plano — Almoxarifado Etapa 4: Reservas de Estoque (feature 07)

> Design: `docs/superpowers/specs/2026-08-05-almoxarifado-etapa4-reservas-design.md`
> Spec e checklist: `specs/modulo-almoxarifado/07-reservas/README.md`

## Estado (2026-08-05)

Backend **entregue**. Falta a tela. Se você está retomando o trabalho, comece pela Task 4.

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

## ⬜ Task 4 — Tela de reservas (PRÓXIMA TAREFA)

Novo `client/src/components/almoxarifado/ReservasAlmoxarifado.js` + rota e entrada de menu
(`client/src/App.js`, `client/src/components/Layout.js`, e o lazy em
`client/src/routes/lazyModules.js` se for o padrão do módulo).

**Backend já pronto, nada a fazer nele:**
- `GET /api/almoxarifado/reservas` — filtros `status`, `projeto_id`, `material_id`, `os_id`;
  cada linha traz `saldo` (quantidade − utilizada), `material_codigo`, `material_nome`,
  `material_unidade`, solicitante, `data_necessidade`, `expira_em`, `origem`.
- `POST /api/almoxarifado/reservas` — aceita `material_id`, `quantidade`, `projeto_id`,
  `os_id`, `os_referencia`, `cliente_id`, `equipamento`, `submontagem`, `observacoes`,
  `data_necessidade`, `expira_em`. Exige `reservar`.
- `POST /api/almoxarifado/reservas/:id/liberar` — aceita `motivo`.
- `PUT /api/almoxarifado/reservas/:id/transferir` — exige `reservar_outra_os`.

**Pontos de atenção da UI:**
- Guardar os botões com `useAlmoxPermissoes` (`bloquearSeNaoPode('reservar', e)` e
  `'reservar_outra_os'` no transferir), como as outras telas do módulo fazem — o padrão é botão
  visível, tooltip explicando, toast no clique quando não pode.
- Mostrar `saldo` e `quantidade_utilizada`, não só `quantidade`: uma reserva parcialmente
  consumida é o caso normal e a diferença é o que importa operacionalmente.
- Distinguir `origem`: reserva `REQUISICAO` tem dono (a requisição) e liberar à mão pode
  atrapalhar o fluxo dela — vale ao menos um aviso, ou linkar para a requisição.
- Status `EXPIRADA` é diferente de `LIBERADA` de propósito; a tela deve refletir isso.

## ⬜ Task 5 — Indicador de reservas no detalhe do material

O extrato (`ExtratoMaterialModal.js`) já lista reservas ativas. Falta mostrar quem reservou,
para qual projeto/OS, quanto já foi consumido e a data de necessidade — os campos já vêm do
backend.

## ⬜ Task 6 — Pendências registradas (decidir se entram nesta etapa)

- **`/aprovar-valor` não reserva.** `valueApprovalService.aprovarValor` grava `APROVADO` direto,
  então requisição liberada por valor não ganha o hold. É a lacuna mais relevante do backend.
- **DELETE de requisição não libera reservas** — só o `/cancelar` faz. Mesmo remédio:
  `reservationService.liberarReservasDaRequisicao`.
- Consulta "quem reservou" como histórico dedicado por material.

## Fora da Etapa 4 (registrado na spec)

Reserva por lote/série (feature 10) · prioridade na reserva · e-mail de reserva vencida
(feature 20) · scheduler in-process para a expiração · reserva por localização (o saldo é
global por decisão de negócio — ver "Decisões de negócio" no guia).
