# Design — Almoxarifado Etapa 4: Reservas de Estoque (feature 07)

> Spec: `specs/modulo-almoxarifado/07-reservas/README.md`.
> Contexto de negócio: almoxarifado é **área física do mesmo site**, não filial — saldo é global
> por material (ver `docs/almoxarifado-guia-etapas-e-testes.md`, "Decisões de negócio").

## O problema central que a etapa fecha

A spec afirma, em "O que já existe": *"Integração com movimentação v2 (`reserva_id` na
movimentação; consumo baixa reserva)"*. **Isso não é verdade.** Verificado em
`stockService.js`: `reserva_id` aparece só como coluna gravada no INSERT da movimentação
(linhas 372/381). Não existe nenhuma lógica que:

- decremente `quantidade_utilizada` quando uma saída cita uma reserva;
- permita ao dono da reserva consumir o que ele mesmo reservou.

A consequência é que a feature hoje é **ativamente prejudicial**. `criarReserva` soma em
`materiais_almoxarifado.quantidade_reservada`, e `getSaldoDisponivel` faz
`quantidade_atual − reservada − bloqueada − inspecao`. Então reservar 10 unidades para o
projeto A torna essas 10 indisponíveis para **todo mundo, inclusive o projeto A**. Não há
caminho de consumo: a única saída é liberar a reserva (devolvendo ao disponível geral) e
correr para dar baixa antes que outro consuma.

É por isso que a feature nunca ganhou UI: expor um botão "Reservar" hoje seria entregar
uma armadilha. O núcleo da etapa é o **consumo contra reserva**; o resto (automação,
transferência, expiração, tela) depende disso existir.

## Decisões de escopo

1. **Consumo contra reserva é o núcleo.** Saída com `reserva_id` valida contra a própria
   reserva (não contra o disponível geral), decrementa `quantidade_utilizada` e reduz
   `quantidade_reservada` do material na mesma instrução condicional do saldo — mesmo padrão
   atômico do resto do motor (`stockService.js:290`). Reserva totalmente consumida vira
   `CONSUMIDA`.

2. **Reserva automática na aprovação**, ligando 04→07. Ao aprovar, cada item com disponível
   > 0 ganha reserva vinculada à requisição; a requisição assume
   `TOTALMENTE_RESERVADA` (todos os itens reservados na quantidade pedida) ou
   `PARCIALMENTE_RESERVADA` (alguns/parcial). Isso **substitui** o
   AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA quando há algum saldo: os dois continuam para o caso
   de disponível zero em todos os itens. A entrega passa a consumir a reserva da própria
   requisição, o que resolve de vez a corrida entre aprovar e entregar.

3. **Transferência entre projetos** (`reservar_outra_os`): muda `projeto_id`/`os_id` da
   reserva sem tocar em saldo — é troca de dono, não movimentação. Auditada.

4. **Expiração por endpoint, não por cron.** Segue o padrão que já existe
   (`POST /requisicoes/processar-lembretes`, chamado por cron externo/admin): novo
   `POST /reservas/processar-expiracao`. Não vou introduzir scheduler in-process — o projeto
   não tem um, e criar um agora é decisão de infraestrutura, não desta etapa. Campo
   `data_necessidade` + config de dias para vencimento.

5. **Bloqueio de consumo cruzado** já é consequência da decisão 1, não código novo: uma
   saída sem `reserva_id` valida pelo disponível, que já exclui o reservado de terceiros.
   Ganha teste explícito porque é a regra que a spec cobra.

6. **Fora da etapa:** reserva por lote/série (depende da feature 10), prioridade na reserva
   (sem demanda concreta — `data_necessidade` cobre o ordenamento útil), alerta de reserva
   vencida por e-mail (feature 20 é dona das notificações; a expiração já registra e o
   endpoint devolve o resumo).

## Dados (safeAlter em `reservas_material_almoxarifado`)

`requisicao_id INTEGER` (reserva criada pela aprovação) · `item_requisicao_id INTEGER` ·
`data_necessidade DATE` · `expira_em DATE` · `origem TEXT` (`MANUAL` | `REQUISICAO`) ·
`liberado_por INTEGER` · `liberado_em DATETIME` · `motivo_liberacao TEXT`.

Status da reserva (enum em código): `ATIVA`, `CONSUMIDA`, `LIBERADA`, `EXPIRADA`.

Status novos da requisição: `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA` — entram na
máquina de estados de `requisitionStateMachine.js` entre APROVADO e EM_SEPARACAO.

## Regras essenciais (cada uma nasce com teste de API)

| Regra | Por que importa |
|---|---|
| Reservar acima do disponível → 400 | já existe, ganha teste de API |
| Após reservar, disponível cai e físico permanece | contrato do disponível |
| Saída **com** `reserva_id` consome a reserva e não é barrada pelo disponível | o buraco central |
| Saída com `reserva_id` acima do saldo da reserva → 400 | não deixa a reserva virar bypass do saldo |
| Saída **sem** `reserva_id` não toca reserva de terceiros | regra cobrada pela spec |
| Reserva totalmente consumida vira CONSUMIDA | evita reserva zumbi segurando saldo |
| Liberar devolve ao disponível e registra quem/quando/por quê | rastro |
| Aprovar requisição cria reservas dos itens com saldo e seta o status | ligação 04→07 |
| Entrega de requisição consome a reserva dela, não o disponível geral | fecha a corrida aprovar→entregar |
| Transferência muda dono sem mover saldo; exige `reservar_outra_os` | segregação |
| Expiração libera vencidas e devolve ao disponível | saldo não fica preso |
| Liberar/consumir reserva já LIBERADA/CONSUMIDA → 400 | idempotência |

## Frontend

- **Tela de reservas** (`ReservasAlmoxarifado.js`, nova): listar com filtro por status,
  material, projeto/OS; criar; liberar (com motivo); transferir. Entrada no menu do módulo.
- **Detalhe do material**: o extrato já lista reservas ativas — passa a mostrar quem
  reservou, para qual projeto/OS, quanto já foi consumido e a data de necessidade.
- **Requisição**: badges dos dois status novos e, no detalhe, quanto de cada item está
  reservado.

## Fora do escopo desta etapa

Lote/série na reserva (feature 10) · prioridade · e-mail de reserva vencida (feature 20) ·
scheduler in-process para a expiração · reserva por localização específica (o saldo é global
por decisão de negócio).
