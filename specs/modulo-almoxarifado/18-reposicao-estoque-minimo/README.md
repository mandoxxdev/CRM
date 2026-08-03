# 18 — Reposição e Estoque Mínimo

> **Status:** 🟡 — alertas de mínimo maduros; falta ponto de reposição calculado e sugestão consolidada · **Spec original:** seção 22
> **Última atualização:** 2026-08-02

## Objetivo

Monitoramento de mínimo/máximo, ponto de reposição calculado (consumo médio + prazo), sugestão de compra considerando pedidos abertos e reservas, e identificação de excessos/obsoletos.

## O que já existe

- Alertas de estoque mínimo: `alertService.js` (635 L) — máquina de estados ACIMA/ABAIXO com debounce, e-mail + WhatsApp, histórico em `alertas_estoque_historico_almoxarifado`, teste manual via `/alertas-estoque/testar`.
- `solicitacoes_compra_almoxarifado` (`schema.js:629`): geração automática por mínimo (`POST /compras/verificar-minimos`), vínculo a pedido (`/compras/solicitacoes/:id/vincular-pedido`) — `extended.js:293-298`, permissão `configurar`.
- Config de estoques mínimos em massa (`PUT /configuracoes/estoques-minimos` + aba no front).
- `quantidade_minima/maxima` no material. Testes de alertas existem.

## Checklist

### Backend
- [ ] Ponto de reposição + lote econômico + prazo médio no cadastro (feature 01)
- [ ] Consumo médio calculado do histórico de movimentações (janela configurável)
- [ ] Cálculo de sugestão: disponível + pedidos de compra abertos − reservas − projetos futuros < ponto de reposição → sugerir quantidade (lote econômico)
- [ ] Sugestão de compra consolidada (tela única com todas as sugestões, agrupada por fornecedor preferencial)
- [ ] Gerar requisição/solicitação de compra a partir da sugestão (integração módulo Compras — feature 22)
- [ ] Materiais críticos: alerta de risco de parada (feature 20)
- [ ] Identificar: sem consumo há N dias, excesso (acima do máximo), obsoletos
- [ ] Estoque máximo com alerta na entrada

### Frontend
- [ ] Tela "Sugestões de compra" (hoje inexistente)
- [ ] Indicadores de excesso/obsoleto na listagem de materiais

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Cruzou o mínimo → alerta disparado uma única vez (debounce) | `alerta de minimo nao duplica` (existe em serviço — cobrir na API) |
| Sugestão desconta pedidos abertos e reservas | `sugestao considera pedidos abertos e reservas` |
| Solicitação automática não duplica para o mesmo material pendente | `verificar-minimos nao gera solicitacao duplicada` |
| Vincular pedido fecha a solicitação | `vincular pedido atualiza status da solicitacao` |

## Dependências

- 01 (campos de reposição) · 07 (reservas no cálculo) · 22 (pedidos de compra abertos).
