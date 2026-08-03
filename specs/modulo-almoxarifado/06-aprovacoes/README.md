# 06 — Motor de Aprovações

> **Status:** 🟡 — só aprovação simples + por valor · **Spec original:** seção 6
> **Última atualização:** 2026-08-02

## Objetivo

Motor de aprovação configurável por tipo de material, valor, quantidade, projeto, urgência, criticidade e propriedade (cliente), com regras de segregação.

## O que já existe

- Aprovar/rejeitar requisição: `PUT /requisicoes/:id/aprovar|rejeitar` (`routes/almoxarifado.js:1856-1868`) com perfis `aprovar_requisicao` (ADMIN, ALMOXARIFE, GESTOR).
- Aprovação por valor: `requisitionValueApprovalService.js` (399 L) — limite configurável em `configuracoes_almoxarifado`, fluxo aprovar-valor/rejeitar-valor, e-mails, testes.
- Configuração "Liberação por Valor" no front (`ConfiguracoesAlmoxarifado.js`).
- Aprovação de ajuste de inventário: aprovador registrado em `conferencias_almoxarifado` (`aprovador_*`, `justificativa_ajuste`).

## Checklist

### Backend
- [ ] Tabela `regras_aprovacao` (critérios: tipo de requisição, tipo/criticidade do material, valor, quantidade, projeto/centro de custo, urgência, material de cliente, fora da lista técnica) → aprovadores/perfis exigidos
- [ ] Avaliador de regras no envio da requisição (gera lista de aprovações pendentes; requisição pode exigir N aprovações)
- [ ] Segregação: solicitante não aprova a própria requisição
- [ ] Requisição emergencial exige justificativa
- [ ] Material de cliente exige autorização específica (feature 13)
- [ ] Material fora da lista técnica → aprovação da Engenharia (depende da feature 22)
- [ ] Ajuste de estoque exige **dupla aprovação** (feature 17)
- [ ] Sucateamento exige aprovação Almoxarifado + gestão (feature 15)
- [ ] Registro imutável de cada decisão (quem, quando, justificativa) — tabela `aprovacoes`
- [ ] Rejeição exige justificativa

### Frontend
- [ ] Config de regras de aprovação (nova aba em Configurações)
- [ ] Fila "minhas aprovações pendentes" (hoje só a lista geral filtrada)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Solicitante não aprova a própria requisição | `aprovar propria requisicao falha` |
| Emergencial sem justificativa é rejeitada | `requisicao emergencial sem justificativa falha` |
| Requisição só avança com TODAS as aprovações exigidas | `requisicao com aprovacao pendente nao pode ser separada` |
| Rejeição exige justificativa | `rejeitar sem justificativa falha` |
| Decisão de aprovação é imutável | `nao existe rota de editar/excluir aprovacao` |

## Dependências

- 04 (máquina de estados da requisição) · consumidores: 13, 15, 17.
