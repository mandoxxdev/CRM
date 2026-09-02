# Design — Almoxarifado Etapa 3: Requisições Ponta a Ponta (features 04 + 06)

> Aprovado pelo usuário em 2026-08-05 (três decisões de escopo confirmadas com recomendação).
> Specs: `specs/modulo-almoxarifado/04-requisicoes/README.md` e `06-aprovacoes/README.md`.

## Decisões aprovadas

1. **Aprovações = regras fixas declarativas** + limite por valor já existente. Segregação (solicitante não aprova a própria requisição, nas duas lanes), rejeição exige motivo, tipo EMERGENCIAL exige justificativa na criação, decisões auditadas. Tabela de regras configurável com UI fica para demanda real.
2. **Tipos de requisição = campo único** (`tipo_requisicao`, 14 valores da spec 5.1) com fluxo operacional único; usado em filtros, exibição e na regra do emergencial. Fluxos específicos (EPI/ferramenta) vêm com as features donas.
3. **Status novos sem os de reserva**: RASCUNHO, AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA, PRONTA_PARA_RETIRADA, ENCERRADA + máquina de estados explícita. PARCIALMENTE/TOTALMENTE_RESERVADA entram na Etapa 4 (reservas).

## O problema central que a etapa fecha

`requisitionService.entregarRequisicao/excluirRequisicao` baixam/estornam estoque com **SQL cru** (read-then-write, sem auditoria, sem saldo por localização, validando pelo físico e não pelo disponível) — bypass do motor anotado desde a Etapa 1. Passam a usar `stockService.registrarMovimentacao` (SAIDA/ENTRADA com `requisicao_id`, os/projeto/centro de custo e justificativa), ganhando atomicidade, auditoria, disponível e restrições de localização de graça. `maxEntregar` passa a calcular pelo **disponível**.

## Máquina de estados (módulo `requisitionStateMachine.js`, padrão do movementRules)

```
RASCUNHO → PENDENTE (enviar) | CANCELADO
PENDENTE → APROVADO | REJEITADO | AGUARDANDO_APROVACAO_VALOR | CANCELADO
AGUARDANDO_APROVACAO_VALOR → PENDENTE/APROVADO (aprovar-valor) | REJEITADO | CANCELADO
APROVADO → EM_SEPARACAO | AGUARDANDO_ESTOQUE | AGUARDANDO_COMPRA | CANCELADO
AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA → EM_SEPARACAO | CANCELADO
EM_SEPARACAO → PRONTA_PARA_RETIRADA | PARCIALMENTE_ATENDIDA | ENTREGUE
PRONTA_PARA_RETIRADA → PARCIALMENTE_ATENDIDA | ENTREGUE
PARCIALMENTE_ATENDIDA → EM_SEPARACAO | ENTREGUE | ENCERRADA
ENTREGUE → ENCERRADA
```
- Toda mudança de status passa pelo validador; transição inválida → 400.
- **AGUARDANDO_ESTOQUE/COMPRA**: setados automaticamente na aprovação quando nenhum item tem disponível > 0 (COMPRA quando existe `solicitacoes_compra_almoxarifado` pendente para ao menos um material; senão ESTOQUE). Almoxarife pode iniciar separação a partir deles quando o estoque chegar.
- **PRONTA_PARA_RETIRADA**: ação explícita do almoxarife após separar (exige ≥1 item com separado > 0).
- **ENCERRADA**: cancela saldos pendentes (nenhuma entrega futura); a partir de ENTREGUE ou PARCIALMENTE_ATENDIDA. Registra encerrado_por/em.
- **Confirmação de recebimento** não é status: campos `recebimento_confirmado_por/em` setáveis pelo SOLICITANTE em ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA.

## Dados (safeAlter em requisicoes_almoxarifado)

`tipo_requisicao TEXT` (default 'CONSUMO') · `centro_custo_id INTEGER` · `local_entrega TEXT` · `recebimento_confirmado_por INTEGER` · `recebimento_confirmado_em DATETIME` · `encerrado_por INTEGER` · `encerrado_em DATETIME`.
Tipos (enum em código): CONSUMO, ORDEM_PRODUCAO, ORDEM_SERVICO, PROJETO, MONTAGEM, INSTALACAO_EXTERNA, ASSISTENCIA_TECNICA, MANUTENCAO, DESENVOLVIMENTO, ADMINISTRATIVO, EMERGENCIAL, FERRAMENTA, EPI, MATERIAL_CLIENTE.

## Criação unificada

Serviço único `requisitionCreateService.createRequisicao(db, user, payload, { modulo })` usado pelas DUAS rotas (`/api/almoxarifado/requisicoes` e `/api/requisicoes-material`), com `RequisicaoSchema` (Zod): itens ≥1, **quantidade > 0 (fecha o bug conhecido)**, material existente/ativo, whitelist por setor mantida, EMERGENCIAL exige justificativa. `salvar_rascunho: true` → nasce RASCUNHO sem disparar e-mails; enviar depois dispara o fluxo normal.

## Rotas novas

`POST /requisicoes/:id/enviar` (rascunho→pendente) · `PUT /:id/liberar-retirada` · `PUT /:id/confirmar-recebimento` (solicitante) · `PUT /:id/encerrar` (perfil aprovar_requisicao) · `POST /:id/copiar` (→ novo RASCUNHO com os itens).

## Regras essenciais (nascem com teste de API)

| Regra | Teste |
|---|---|
| Item com quantidade ≤ 0 rejeitado (nas 2 rotas) | novo |
| Solicitante não aprova a própria (2 lanes) → 403 | novo |
| Rejeição sem motivo → 400 | novo |
| EMERGENCIAL sem justificativa → 400 | novo |
| Transição inválida → 400 (ex.: entregar PENDENTE; separar RASCUNHO) | novo |
| Entrega grava movimentação via motor (auditoria + disponível + localização) | novo |
| Entrega bloqueada por reserva/bloqueio de terceiros (disponível) | novo |
| Encerrar impede novas entregas e registra responsável | novo |
| Confirmação só pelo solicitante | novo |
| Copiar gera RASCUNHO fiel (itens/tipo/vínculos, sem quantidades entregues) | novo |
| Compat: fluxo atual criar→aprovar→separar→entregar continua verde | suites existentes |

## Frontend

- `RequisicoesList.js`: badges/filtros dos status e tipos novos; ações Enviar (rascunho), Liberar retirada, Confirmar recebimento (solicitante), Encerrar, Copiar; stepper do `AlmoxPageHeader` atualizado.
- `RequisicaoForm.js` + `RequisicaoMaterialCesta.js`: campo tipo, centro de custo (select), local de entrega, botão "Salvar rascunho"; justificativa obrigatória quando EMERGENCIAL.

## Fora da etapa (registrado nas specs)

Anexos da requisição · assinatura digital (Etapa 15) · importar de BOM/OP (feature 22) · reserva automática e status de reserva (Etapa 4) · lote/série na entrega (feature 10) · reprogramação fina de saldo pendente (o encerrar cobre o cancelamento).
