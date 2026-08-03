# 04 — Requisições de Materiais

> **Status:** 🟡 — a feature mais madura do módulo · **Spec original:** seção 5
> **Última atualização:** 2026-08-02

## Objetivo

Fluxo completo: rascunho → aprovação → disponibilidade → reserva → separação → conferência → entrega → confirmação → encerramento, com os 15 status e 14 tipos da spec.

## O que já existe

- Tabelas `requisicoes_almoxarifado` + `itens_requisicao_almoxarifado` (com `quantidade_solicitada/atendida/separada/entregue` — entrega parcial funciona).
- Duas APIs: `/api/almoxarifado/requisicoes` (`routes/almoxarifado.js:1687-1964`) e `/api/requisicoes-material` (`routes/requisicoesMaterial.js`, cross-módulo com whitelist por setor e sanitização de campos).
- Fluxo implementado: criar → aprovar/rejeitar → separação → entregar (parcial ok) → cancelar; delete admin com estorno de estoque.
- Aprovação por valor (`requisitionValueApprovalService.js`, limite configurável, aprovar-valor/rejeitar-valor).
- Notificações: e-mail ao almoxarifado na criação, e-mail a Compras para itens sem estoque, lembretes a cada 1 h (`requisitionReminderService.js`, log em `requisicao_lembretes_log`).
- Disponibilidade em lote: `POST /requisicoes-material/disponibilidade` + badge no front.
- Front: `RequisicoesList.js` (1.080 L, ações completas), `RequisicaoForm.js` (industrial), `RequisicaoMaterialCesta.js` (administrativa), configurado para 10 módulos-origem (`requisicoesMaterialConfig.js`).
- Campos existentes: solicitante, departamento, setor, os_referencia (texto), urgencia, prioridade, data_necessidade, justificativa, projeto_id, cliente_id, equipamento, valor_total.
- Testes de serviço: separação/entrega parcial em múltiplas rodadas, exclusão com estorno, lembretes, liberação por valor, filtro por setor.

## Checklist

### Validações e correções (fazer primeiro — bugs conhecidos)
- [ ] `POST /requisicoes-material` **não valida `quantidade > 0`** — corrigir com teste
- [ ] Validar material ativo e existente em cada item (verificar cobertura atual)
- [ ] Unificar as duas rotas de criação num serviço único (hoje `routes/almoxarifado.js:1747` e `requisicoesMaterial.js:308` duplicam lógica)

### Status faltantes (spec 5.4)
- [ ] `RASCUNHO` (hoje nasce direto enviada)
- [ ] `AGUARDANDO_ESTOQUE` / `AGUARDANDO_COMPRA`
- [ ] `PARCIALMENTE_RESERVADA` / `TOTALMENTE_RESERVADA` (depende da feature 07)
- [ ] `PRONTA_PARA_RETIRADA` (pós-conferência da separação)
- [ ] `ENCERRADA` (distinta de entregue: fecha saldos pendentes)
- [ ] Máquina de estados explícita com transições válidas (rejeitar transição inválida)

### Funcionalidades faltantes (spec 5.5)
- [ ] Tipo de requisição (14 tipos — spec 5.1) como campo estruturado
- [ ] Campos: ordem de produção, centro de custo, local de entrega, gestor responsável
- [ ] Anexos (desenho/documento — `anexos_documento_almoxarifado` já existe)
- [ ] Copiar requisição anterior
- [ ] Importar itens de lista técnica / ordem de produção (depende da feature 22)
- [ ] Confirmação de recebimento pelo solicitante (fecha o ciclo)
- [ ] Registrar lote/série entregue por item (depende da feature 10)
- [ ] Reprogramar saldo pendente / cancelar saldo não utilizado
- [ ] Assinatura digital na retirada (Etapa 15 — mobilidade; deixar campo previsto)
- [ ] Encerramento com e-mail de resumo

### Frontend
- [ ] Novos status no `RequisicoesList.js` + `AlmoxPageHeader.js` (stepper `REQUISICAO_FLOW`)
- [ ] Botão "copiar requisição" · confirmação de recebimento pelo solicitante
- [ ] Anexos no form

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Item com quantidade ≤ 0 é rejeitado | `criar requisicao com quantidade zero ou negativa falha` |
| Setor só requisita material da sua whitelist | `requisicao com material fora do setor falha` (regra existe — cobrir na API) |
| Transição de status inválida é rejeitada | `entregar requisicao nao aprovada falha` |
| Entrega nunca excede o solicitado/separado | `entregar quantidade maior que separada falha` |
| Entrega baixa estoque exatamente uma vez | `entrega parcial multipla baixa estoque corretamente` |
| Requisição acima do limite exige aprovação de valor | `requisicao acima do limite fica AGUARDANDO_APROVACAO_VALOR` |
| Delete estorna estoque entregue | `excluir requisicao entregue devolve saldo` (existe em serviço — cobrir na API) |
| Encerramento cancela saldos pendentes | `encerrar requisicao zera pendencias e bloqueia novas entregas` |

## Dependências

- 00 (harness) · 06 (motor de aprovações para regras além de valor) · 07 (reservas para os status de reserva) · 10 (lote/série na entrega).
