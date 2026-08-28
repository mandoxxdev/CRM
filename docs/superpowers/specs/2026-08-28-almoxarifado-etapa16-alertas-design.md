# Almoxarifado — Etapa 16: Alertas operacionais, a fatia real (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Spec de origem: `specs/modulo-almoxarifado/20-alertas/README.md` (feature 20).

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

A medição sobre os 16 alertas desmarcados da spec 20:

- **11 são viáveis já** (feature dona existe e o dado está no banco); destes, **5 têm função ou
  rota pronta**: calibração vencendo (`toolService.painelCalibracoes`), sem consumo e estoque
  excessivo (`purchaseService.estoqueParado`), quarentena parada
  (`inspectionService.listarInspecoesPendentes` com `data_entrada`), material sem endereço
  (consulta do relatório `materiais-sem-endereco`). Mais **2 réguas de data já gravadas**:
  requisição atrasada (`data_necessidade`) e reserva parada (`created_at`/`expira_em` de
  reserva ATIVA).
- **3 têm lacuna de dado**: separado aguardando retirada (não existe a data da transição para
  PRONTA_PARA_RETIRADA), pedido recebido parcialmente (não existe noção de saldo do pedido),
  consumo acima do previsto (projeto não tem coluna de orçamento).
- **2 estão fora do jogo**: transferência não recebida foi **CORTADA por decisão do cliente
  em 2026-08-12** (não há trânsito — spec 11), e estoque negativo **não é alerta** (é regra
  do motor, como a própria spec 20 diz). O checklist da spec 20 ainda os lista como
  pendências — **será corrigido dizendo isso**.
- Infraestrutura pronta que esta etapa **não reabre**: fila de notificações
  (dedupe/retry/backoff/claim), transporte SMTP/WhatsApp e configs do `alertService`,
  agendador in-process (worker + varreduras diárias), painel da fila, `useAlmoxPermissoes`.
- **Buraco real além dos alertas**: hoje há **dois motores paralelos** (o alerta de mínimo
  envia direto; zerado + 3 varreduras enfileiram) e **não existe central no front** — o
  painel `/almoxarifado/notificacoes` é fila de e-mail para ADMIN/GESTOR, o sino do header é
  do CRM comercial, e o dashboard calcula "crítico" por conta própria.

**Escopo escolhido (delegação do usuário — caminho recomendado/reversível):**

1. **Registro de alertas** (`alertRegistry.js`) — fonte única declarativa por alerta: chave,
   evento, condição (função de listagem), dedupe, config de dias. É a primeira parcela
   honesta do "motor único", **sem reescrever** a máquina do mínimo/zerado.
2. **7 alertas novos** pela fila existente, no padrão de varredura diária da Etapa 12:
   calibração vencendo, sem consumo, estoque excessivo, quarentena parada, material sem
   endereço, requisição atrasada, reserva parada.
3. **Central de alertas no front** (`/almoxarifado/alertas`) — leitura **ao vivo** das
   condições (não da fila), dirigida pelo mesmo registro.

**Fica FORA, declarado com porquê:**

- **Unificar a máquina do mínimo/zerado no registro** — funciona, é testada e tem semântica
  própria (claim, anti-flap, histórico). Reescrever agora é risco sem valor novo; o registro
  nasce ao lado e a unificação é etapa futura, se valer.
- **Os 3 alertas com lacuna de dado** — cada um exige coluna/entidade nova (data de transição,
  saldo de pedido, orçamento de projeto); são mudanças das features donas, declaradas na
  spec 20 com a lacuna nomeada.
- **Os 3 alertas de evento** (material reprovado, divergência de recebimento, divergência de
  inventário) e **material sem certificado** — viáveis, mas o gancho correto é dentro do ato
  (decisão de inspeção, conclusão de conferência), não varredura; fatia seguinte natural da
  feature 20, não desta etapa. Declarados na spec.
- **Matriz evento×destinatário, digest, canais por alerta** — corte da Etapa 12 que continua
  (letra D/B15); os 7 alertas novos usam o destinatário único existente
  (`alertas_estoque_emails`) e o toggle mestre.
- **Sino no header** — decisão registrada da Etapa 12 (dois sinos confundem); a central é
  tela do módulo, com item de menu próprio.

## Arquitetura

### 1. `alertRegistry.js` — o registro (fonte única)

`server/services/almoxarifado/alertRegistry.js` exporta `ALERT_REGISTRY` (array congelado) e
helpers. Cada entrada:

```js
{
  chave: 'CALIBRACAO_VENCENDO',       // única; vira o `evento` da fila
  titulo: 'Calibração vencendo',
  descricao: 'Ferramentas com calibração vencida ou vencendo na janela configurada.',
  configDias: { chave: 'alerta_calibracao_dias', default: 30 },  // null quando não usa dias
  listar: async (db, { dias }) => [...],  // linhas da condição AO VIVO (a mesma para varredura e central)
  dedupeChave: (linha) => `calibracao-${linha.ferramenta_id}-${linha.data_validade}`,
  assunto: (linha) => '...', corpo: (linha) => '...' // texto do e-mail
}
```

A varredura e a central consomem o MESMO `listar` — não existem duas réguas (RN-01). Entrada
nova no registro = alerta novo completo (varredura + central + config), sem tocar em mais nada.

### 2. Os 7 alertas (condição, config e dedupe)

| Chave/evento | Fonte da condição (existente) | Config de dias | Dedupe (1 alerta por...) |
|---|---|---|---|
| `CALIBRACAO_VENCENDO` | `toolService.painelCalibracoes(db, dias)` — vencidas + a vencer | `alerta_calibracao_dias` (novo, 30) | ferramenta+validade: `calibracao-<ferramenta_id>-<data_validade>` |
| `ESTOQUE_SEM_CONSUMO` | `purchaseService.estoqueParado`, flag `sem_consumo` | `reposicao_dias_sem_consumo` (já existe, 180) | material+mês: `sem-consumo-<material_id>-<AAAA-MM>` (re-lembra 1×/mês enquanto persistir) |
| `ESTOQUE_EXCESSIVO` | idem, flag `excesso` | — (régua da 11: acima da máxima) | material+mês: `excessivo-<material_id>-<AAAA-MM>` |
| `QUARENTENA_PARADA` | `inspectionService.listarInspecoesPendentes` filtrado por idade da `data_entrada` | `alerta_quarentena_dias` (novo, 7) | item de recebimento: `quarentena-<item_id>` (1× por item, para sempre) |
| `MATERIAL_SEM_ENDERECO` | consulta do relatório `materiais-sem-endereco` (saldo>0 sem `localizacao_id`) | — | **agregado**: 1 resumo por semana `sem-endereco-<AAAA-WSS>` com a contagem e os primeiros 20 — alerta por material seria ruído em massa |
| `REQUISICAO_ATRASADA` | `requisicoes_almoxarifado.data_necessidade < hoje` e status não-terminal (PENDENTE/APROVADA/EM_SEPARACAO/PRONTA_PARA_RETIRADA/PARCIALMENTE_ATENDIDA) | — | requisição: `req-atrasada-<requisicao_id>` (1× por requisição) |
| `RESERVA_PARADA` | reserva `ATIVA` com `julianday('now') - julianday(created_at) > dias` OU `expira_em` vencida | `alerta_reserva_parada_dias` (novo, 30) | reserva: `reserva-parada-<reserva_id>` (1× por reserva) |

Decisões transversais (registradas):

- **Material de cliente fica FORA** dos alertas de estoque (sem consumo, excessivo, sem
  endereço) — segregação da feature 13; conferir no plano se `estoqueParado` já filtra
  `proprietario_cliente_id IS NULL` (se não filtrar, o `listar` do registro filtra).
- **Destinatários**: `alertas_estoque_emails` (lista única existente), como os 4 da Etapa 12.
- **Toggle mestre**: `alertas_estoque_notificar_email` governa a varredura inteira (RN-03).
- Requisição atrasada só alerta quem **preencheu** `data_necessidade` (coluna opcional) —
  limitação declarada, não silenciosa.

### 3. Varredura

`notificationQueueService.varrerAlertasRegistrados(db)` — itera o registro, resolve a config
de dias de cada um, chama `listar`, monta e `enfileirar` cada linha (o dedupe da fila segura a
repetição). Entra no **Job B existente** (varreduras diárias, `Promise.all`) — nenhum
agendador novo. Sem destinatário configurado → no-op por alerta (comportamento da fila).

### 4. Central no front

- **Rota nova** `GET /api/almoxarifado/alertas/central` (gate: ação nova `ver_alertas`):
  responde `{ alertas: [{ chave, titulo, descricao, dias, total, linhas: [até 50] }] }` —
  avaliação AO VIVO pelo registro, na ordem do registro. Linha é objeto cru da condição
  (campos variam por alerta; o front trata por chave).
- **Ação de perfil nova** `ver_alertas: [ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS]` —
  PRODUCAO/ENGENHARIA/CONSULTA fora: a central expõe números de estoque e valor parado
  (lição G1: requisitante não vê quantidade). Decisão registrada na letra B.
- **Tela nova** `/almoxarifado/alertas` (`AlertasAlmoxarifado.js`): um cartão por alerta com
  título, descrição, badge com o total e a janela de dias; expande para a tabela das linhas;
  painel de sem-permissão no padrão da Etapa 11 (403 nunca vira "não há alertas" — o
  Critical daquela revisão). Item de menu "Alertas" (ícone `FiAlertTriangle` — sem segundo
  sino, decisão da Etapa 12 mantida).
- **Configurações**: os 3 campos novos de dias aparecem em Configurações do módulo com
  validação ≥ 1 **nos dois lados** (padrão da Etapa 11).

## Regras de negócio (RN)

- **RN-01 — Registro é fonte única.** Varredura e central leem o MESMO `listar` de cada
  alerta. Cenário: régua alterada num lugar reflete nos dois; teste compara o total da
  central com o que a varredura enfileira no mesmo estado.
- **RN-02 — Varredura não duplica.** Rodar a varredura duas vezes no mesmo estado enfileira
  na segunda **zero** notificações novas (dedupe estável por alerta, tabela acima). Cenário:
  2ª rodada → `enfileirada:false, motivo:'DUPLICADA'` em todas.
- **RN-03 — Toggle mestre desligado = varredura muda.** `alertas_estoque_notificar_email='0'`
  → `varrerAlertasRegistrados` não enfileira nada. Cenário: condição existente + toggle off →
  fila vazia.
- **RN-04 — Central gateada por `ver_alertas`.** Matriz de 8 perfis; PRODUCAO/ENGENHARIA/
  CONSULTA recebem o 403 padrão do módulo. A tela renderiza painel de sem-permissão, nunca
  "não há alertas".
- **RN-05 — Central é ao vivo, não é a fila.** A central reflete a condição atual: resolvida
  a condição (calibração renovada, requisição entregue), a linha some da central mesmo que a
  notificação antiga continue na fila. Cenário: criar condição → central 1; resolver →
  central 0.
- **RN-06 — Configs de dias validam ≥ 1 nos dois lados.** `0`/negativo/não-número → 400 no
  backend com mensagem literal do padrão existente das configs; o front barra antes.
- **RN-07 — Material de cliente fora dos alertas de estoque.** Sem consumo/excessivo/sem
  endereço nunca listam material com `proprietario_cliente_id` preenchido. Cenário: material
  de cliente parado há 400 dias → não aparece nem na central nem na fila.

## Testes

- **API** (`alertRegistry.api.test.js` ou dividido): por alerta, cenário positivo (condição →
  linha na central E notificação na fila com o evento certo) e negativo (condição resolvida →
  fora); RN-02 (2ª varredura zero); RN-03 (toggle); RN-04 (matriz 8 perfis na central);
  RN-06 (config 0 → 400); RN-07 (material de cliente). Controle positivo obrigatório em
  teste que passar de primeira.
- **Integração cruzando galhos**: jornada real — semear 3 condições distintas (calibração
  vencida, requisição atrasada, reserva parada) → `varrerAlertasRegistrados` → fila com 3
  eventos → `GET central` com 3 totais → resolver uma condição → central atualiza, fila não
  encolhe (RN-05).
- **Client**: tela com fetch mockado no contrato (cartões, badge, expandir, painel 403,
  campos de config novos com validação).

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/almoxarifado/alertRegistry.js` | novo — o registro |
| `services/almoxarifado/notificationQueueService.js` | `varrerAlertasRegistrados` |
| `services/almoxarifado/permissions.js` | ação `ver_alertas` |
| `routes/almoxarifado/extended.js` | `GET /alertas/central` |
| `routes/almoxarifado.js` | Job B inclui a varredura nova |
| `schema.js` | 3 configs novas semeadas |
| `client` | tela `/almoxarifado/alertas` + menu + configs novas na tela de Configurações |
| `specs/modulo-almoxarifado/20-alertas/README.md` | checklist corrigido (cortado/regra-do-motor ditos como tais) |
