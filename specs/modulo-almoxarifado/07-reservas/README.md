# 07 — Reservas de Estoque

> **Status:** 🟢 backend da Etapa 4 entregue (2026-08-05) · falta a **tela de reservas** ·
> **Spec original:** seção 7
> **Última atualização:** 2026-08-06
> **Design da etapa:** `docs/superpowers/specs/2026-08-05-almoxarifado-etapa4-reservas-design.md`

> ⚠️ **Correção de uma afirmação errada que estava aqui.** Este arquivo dizia
> *"backend pronto"* e listava, em "o que já existe", *"consumo baixa reserva"*. **Não era
> verdade**: `reserva_id` era apenas uma coluna gravada na movimentação, sem nenhuma lógica
> atrás. Como `criarReserva` soma em `quantidade_reservada` e o disponível subtrai isso,
> reservar 10 unidades tornava as 10 indisponíveis para **todos, inclusive quem reservou** —
> não havia caminho de consumo. A Etapa 4 fechou isso (commit `0e37dea`).

## Objetivo

Reserva automática pós-aprovação, reserva manual, por projeto/OS/lote, com expiração, transferência entre projetos e efeito real no disponível.

## O que já existe

- Tabela `reservas_material_almoxarifado` (`schema.js:569`): material, quantidade, quantidade_utilizada, projeto_id, os_id, cliente_id, equipamento, submontagem, status.
- Rotas (`extended.js:337-375`) — 5, sob `/api/almoxarifado`:
  `GET /reservas` (filtros `status`/`material_id`/`projeto_id` + campo derivado `saldo`) ·
  `POST /reservas` (`reservar`) · `POST /reservas/:id/liberar` (`reservar`) ·
  `PUT /reservas/:id/transferir` (`reservar_outra_os`) ·
  `POST /reservas/processar-expiracao` (`configurar`).
- `quantidade_reservada` no material e no saldo por localização; mapa 2D exibe reservas.
- **Consumo contra reserva** (`0e37dea`): saída com `reserva_id` valida contra a própria reserva
  (não contra o disponível), reivindica a reserva em UPDATE condicional, baixa físico+reservado
  juntos e marca `CONSUMIDA` ao zerar. Sem transação no serviço → compensação explícita.
- **Reserva na aprovação** (`6690c1a`): `requisitionService.reservarItensAprovacao`; status
  `PARCIALMENTE_RESERVADA`/`TOTALMENTE_RESERVADA` na máquina de estados.
- `reservationService.js`: listagem com filtros, transferência, expiração e
  `liberarReservasDaRequisicao` (usada no cancelamento).
- Testes de serviço: reserva e transferência em `almoxarifado.test.js`.

## Checklist

### Backend
- [x] Reserva automática ao aprovar requisição (liga 04→07; status `PARCIALMENTE/TOTALMENTE_RESERVADA`) — `6690c1a`
- [ ] Reserva por lote específico / número de série (depende da feature 10) — **fora da Etapa 4**
- [x] Data de necessidade na reserva (`data_necessidade`) — `6690c1a`. **Prioridade** ficou fora: sem demanda concreta, `data_necessidade` cobre o ordenamento útil
- [x] Expiração automática (`POST /reservas/processar-expiracao` + config `reserva_dias_validade`) — `6690c1a`. **Opt-in**: sem a config e sem `expira_em` explícito a reserva não expira, senão as reservas manuais existentes começariam a ser liberadas sozinhas. Alerta por e-mail fica com a feature 20
- [x] Transferência de reserva entre projetos (`PUT /reservas/:id/transferir`, `reservar_outra_os`) — `6690c1a`
- [x] Bloqueio de consumo por outro projeto — consequência do consumo contra reserva, com teste explícito — `0e37dea`
- [ ] Consulta "quem reservou" (histórico por material) — o `GET /reservas` já filtra por material e traz solicitante; falta a visão de histórico dedicada
- [x] Reserva parcial com registro do atendido (`quantidade_utilizada`) — `0e37dea`

### Frontend
- [ ] **Tela de reservas (listar/criar/liberar/transferir) — ainda não existe. É a próxima tarefa desta feature.** O backend que ela consome já está pronto: `GET /reservas` (filtros `status`/`projeto_id`/`material_id` + campo derivado `saldo`), `POST /reservas` (aceita `data_necessidade`/`expira_em`), `POST /reservas/:id/liberar` (aceita `motivo`), `PUT /reservas/:id/transferir`
- [ ] Indicador de reservas no detalhe do material — o extrato já lista reservas ativas; falta mostrar quem reservou, para qual projeto/OS, quanto foi consumido e a data de necessidade

### Pendências conhecidas desta feature
- **A lane `/aprovar-valor` não reserva.** `valueApprovalService.aprovarValor` grava `APROVADO`
  direto, então requisição liberada por valor não ganha o hold. Funciona pelo caminho antigo,
  só fica sem a proteção que o resto da etapa criou.
- Excluir requisição (DELETE) não libera as reservas — só o `/cancelar` faz. Mesma classe de
  armadilha, mesmo remédio (`reservationService.liberarReservasDaRequisicao`).

## Regras essenciais + testes de API exigidos

Todos em `server/tests/api/` (**42 casos** nos 4 arquivos), rodam com `npm run test:api`.
Os nomes abaixo são os reais — copiáveis para localizar o caso.

| Regra | Arquivo · teste |
|-------|-----------------|
| Reservar acima do disponível falha | `reservaConsumo` · *reservar acima do disponível → erro* |
| Reserva reduz o disponível imediatamente, sem tocar no físico | `reservaConsumo` · *após reservar, disponível cai e o físico permanece* |
| Saída de outro projeto não consome reserva alheia | `reservaConsumo` · *saída SEM reserva_id não consome reserva de terceiro* |
| Saída **com** `reserva_id` consome a própria reserva e não é barrada pelo disponível | `reservaConsumo` · *saída COM reserva_id consome a reserva e NÃO é barrada pelo disponível* |
| Consumo acima do saldo da reserva falha sem efeito colateral | `reservaConsumo` · *consumir mais que o saldo da reserva → 400 e nada muda* |
| Reserva totalmente consumida vira CONSUMIDA | `reservaConsumo` · *reserva totalmente consumida vira CONSUMIDA e libera o reservado* |
| Consumo deixa rastro (`reserva_id` na movimentação) | `reservaConsumo` · *a movimentação de consumo fica registrada com o reserva_id (rastro)* |
| Liberação devolve ao disponível e registra quem/quando/por quê | `reservaConsumo` · *liberar reserva devolve ao disponível* · `reservaTransferenciaExpiracao` · *liberar grava liberado_por, liberado_em e motivo_liberacao* |
| Aprovação de requisição reserva automaticamente | `requisicaoReservaAutomatica` · *[aprovar] saldo total em todos os itens -> TOTALMENTE_RESERVADA com uma reserva por item* |
| Aprovação com saldo parcial reserva só o disponível | `requisicaoReservaAutomatica` · *[aprovar] saldo parcial -> PARCIALMENTE_RESERVADA e reserva só do disponível* |
| Sem saldo nenhum, segue para AGUARDANDO_ESTOQUE/COMPRA (não regride) | `requisicaoReservaAutomatica` · *[aprovar] nenhum item com saldo -> AGUARDANDO_ESTOQUE e nenhuma reserva (regressão)* |
| Entrega consome a reserva da própria requisição, debitando uma vez só | `requisicaoReservaAutomatica` · *[entregar] consome a reserva da requisição: CONSUMIDA e disponível debitado UMA vez* |
| Entrega acima do reservado divide a saída (reserva + excedente) | `requisicaoReservaAutomatica` · *[entregar] quantidade acima da reserva: consome a reserva + o excedente sem reserva* |
| Transferência muda dono sem mover saldo; exige `reservar_outra_os` | `reservaTransferenciaExpiracao` · *transferir muda o dono da reserva e NÃO move saldo nenhum* · *transferir exige reservar_outra_os: perfil sem a permissão → 403 e nada muda* |
| Expiração libera vencidas, marca EXPIRADA e devolve ao disponível | `reservaTransferenciaExpiracao` · *expiração libera só as vencidas, marca EXPIRADA e devolve ao disponível* |
| Expiração é **opt-in** (sem config e sem `expira_em`, não expira) | `reservaCicloIntegracao` · *sem config e sem valor explícito, a reserva NÃO ganha expira_em (opt-in)* |
| Cancelar requisição libera as reservas dela | `reservaCicloIntegracao` · *cancelar requisição libera as reservas dela e devolve ao disponível* |
| Cancelar não mexe em reserva manual de terceiro | `reservaCicloIntegracao` · *cancelar NÃO mexe em reserva manual de outro dono do mesmo material* |
| Idempotência: liberar/consumir reserva já finalizada → 400 | `reservaConsumo` · *consumir reserva já CONSUMIDA → 400* · `reservaTransferenciaExpiracao` · *liberar reserva já liberada → 400 (idempotência)* · *expiração é idempotente: rodar de novo não libera nem desconta duas vezes* |

## Dependências

- 03 (fórmula de disponível) · 04 (gancho pós-aprovação) · 10 (reserva por lote/série).
