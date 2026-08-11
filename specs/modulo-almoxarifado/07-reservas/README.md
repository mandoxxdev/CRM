# 07 — Reservas de Estoque

> **Status:** 🟢 Etapa 4 completa — backend (2026-08-05) e tela (2026-08-06) ·
> **Spec original:** seção 7
> **Última atualização:** 2026-08-11 (auditoria spec×código)
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
- Rotas (`routes/almoxarifado/extended.js`) — 5, sob `/api/almoxarifado`:
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
- [ ] Reserva por lote específico / número de série — **fora da Etapa 4**. Atualização (2026-08-11): a dependência de **lote** caiu — a feature 10 (lotes) foi entregue na Etapa 6 (2026-08-09/10), então reserva por lote ficou implementável; número de série continua dependendo da 6b
- [x] Data de necessidade na reserva (`data_necessidade`) — `6690c1a`. **Prioridade** ficou fora: sem demanda concreta, `data_necessidade` cobre o ordenamento útil
- [x] Expiração automática (`POST /reservas/processar-expiracao` + config `reserva_dias_validade`) — `6690c1a`. **Opt-in**: sem a config e sem `expira_em` explícito a reserva não expira, senão as reservas manuais existentes começariam a ser liberadas sozinhas. Alerta por e-mail fica com a feature 20
- [x] Transferência de reserva entre projetos (`PUT /reservas/:id/transferir`, `reservar_outra_os`) — `6690c1a`
- [x] Bloqueio de consumo por outro projeto — consequência do consumo contra reserva, com teste explícito — `0e37dea`
- [x] Consulta "quem reservou" (histórico por material) — `43cd367`. A tela filtra por material com status "Todos", mostrando solicitante, destino e o consumido de cada reserva; o extrato do material traz as ativas
- [x] Reserva parcial com registro do atendido (`quantidade_utilizada`) — `0e37dea`

### Frontend
- [x] **Tela de reservas** (`ReservasAlmoxarifado.js`, rota `/almoxarifado/reservas`, menu "Reservas") — `43cd367`. Lista com filtros de status/material/projeto, criação, liberação total ou parcial com motivo, transferência entre projetos/OS e o botão do job de expiração (só `configurar`). Testes: `client/src/components/almoxarifado/ReservasAlmoxarifado.test.js` (10 casos)
- [x] Indicador de reservas no detalhe do material (`ExtratoMaterialModal`) — `43cd367`. A tabela de reservas ativas passou a mostrar saldo, origem (REQ #id ou MANUAL) e os prazos, além de quem reservou e o vínculo que já tinha
- ⚠️ **Ressalva (auditoria de 2026-08-11) — a Etapa 4 constava completa com um buraco de front na tela vizinha.** O item de tela desta spec cobria a tela de **reservas**, que estava ok; mas os status `PARCIALMENTE/TOTALMENTE_RESERVADA` que esta feature introduziu **não existiam na tela de requisições**: `RequisicoesList.js` mostrava o badge cru, o filtro não tinha as opções e os botões "Iniciar Separação"/"Cancelar Requisição" ficavam invisíveis nesses status; `AlmoxPageHeader.js` caía no fallback "Criar" do stepper. Corrigido em `92fe236`, com teste novo `client/src/components/almoxarifado/RequisicoesList.test.js` (badge, filtro, stepper, botões; controle positivo rodado)

### Decisões da tela (não mexer sem ler)

Três coisas que parecem detalhe e não são — cada uma faz a tela **mentir sobre saldo**:

1. **Mostra `saldo` (quantidade − utilizada), não `quantidade`.** Reserva consumida pela metade
   é o caso normal desde que a entrega passou a baixar contra a reserva.
2. **O disponível vem de `GET /almoxarifado/estoque`, não de `/materiais`.** Só o primeiro traz
   `quantidade_disponivel` calculado pelo servidor; `/materiais` devolve o **físico**. Oferecer
   físico como disponível numa tela de reserva convida a reservar saldo já reservado. Não
   recalcular a fórmula no front — seria uma segunda fonte de verdade.
3. **Transferir envia os quatro campos de dono sempre, inclusive vazios.** O servidor trata
   `undefined` como "manter" e `''` como "limpar" (`transferirReserva`, CAMPOS_DONO). Enviar só
   o preenchido faz trocar de projeto para OS **manter o projeto antigo junto**.

As três têm teste; as três foram validadas por mutação (controle positivo).

### Pendências desta feature — RESOLVIDAS (`ad0c831`)

Eram a mesma classe: rota que alterava a requisição sem passar pelo hold. As duas foram
fechadas na Task 6; ficam registradas porque explicam decisões do código atual.

- [x] **A lane `/aprovar-valor` agora reserva.** O serviço é `requisitionValueApprovalService.js`
  (esta spec já disse `valueApprovalService.js`, que **não existe** — corrigido em `7ab91e3`).
  `aprovarValor` continua gravando `APROVADO`; a reserva acontece **depois** dele, na rota, e
  sobrescreve o status para `PARCIALMENTE/TOTALMENTE_RESERVADA`. Depois e não dentro porque a
  segregação e a validação de status vivem no serviço, e não faz sentido segurar saldo de uma
  aprovação que vai ser recusada. Sem nada a reservar, o `APROVADO` permanece.
- [x] **Excluir requisição libera as reservas.** `excluirRequisicao` (soft delete
  `ativo=0, status='CANCELADO'`) passou a chamar `reservationService.liberarReservasDaRequisicao`,
  que agora tem dois chamadores — antes só o `/cancelar`. Best-effort: falha ao liberar não
  desfaz a exclusão. A justificativa da exclusão vira o motivo da liberação.

A máquina de estados ganhou `PARCIALMENTE/TOTALMENTE_RESERVADA` como destinos de
`AGUARDANDO_APROVACAO_VALOR` — sem essas setas o hold nasceria e o status seria recusado.

## Regras essenciais + testes de API exigidos

Todos em `server/tests/api/` (**51 casos** em 5 arquivos), rodam com `npm run test:api`.
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
| Aprovação **por valor** também reserva | `reservaPontasFaltantes` · *[aprovar-valor] com saldo total reserva os itens e derruba o disponível* |
| Aprovação por valor sem saldo continua APROVADO (regressão) | `reservaPontasFaltantes` · *[aprovar-valor] sem saldo nenhum continua APROVADO e não cria reserva (regressão)* |
| Excluir requisição libera as reservas dela | `reservaPontasFaltantes` · *excluir requisição libera as reservas dela e devolve ao disponível* |
| Excluir não toca reserva manual de terceiro | `reservaPontasFaltantes` · *excluir NÃO mexe em reserva manual de outro dono do mesmo material* |

## Dependências

- 03 (fórmula de disponível) · 04 (gancho pós-aprovação) · 10 (reserva por lote/série).
