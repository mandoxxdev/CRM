# 17 — Inventário e Contagem Cíclica

> **Status:** 🟡 — inventário simples funciona, mas o ajuste da conclusão corre **por fora do motor** (risco nomeado abaixo); falta contagem cega, recontagem e tolerância · **Spec original:** seção 21
> **Última atualização:** 2026-08-11 — auditoria de cauda: o problema da conclusão estava subestimado (a spec só dizia "falta aprovação forte"); registrado como risco de dessincronização pós-Etapa 6 e registrado o ponto positivo da dupla permissão

## Objetivo

Inventário geral e contagens cíclicas (por material, endereço, criticidade, ABC) com listas cegas, recontagem, tolerância, ajuste por transação aprovada e relatório de acuracidade.

## O que já existe

- `conferencias_almoxarifado` + `itens_conferencia_almoxarifado` (`schema.js`): número, status, responsável, tipo, projeto, localização, aprovador, justificativa de ajuste; itens com quantidade sistema/contada/divergência/ajustado.
- Rotas de `/conferencias` (`routes/almoxarifado.js`): criar por categoria, lançar contagem, `PUT /conferencias/:id/concluir` (gera ajustes), cancelar.
- Front: `ConferenciaEstoque.js` (341 L).
- Dado real: 2 conferências em produção.
- **Ponto positivo não registrado antes (2026-08-11):** a conclusão exige **dupla permissão** — `inventario` no middleware para fechar a contagem e, se `aplicar_ajustes: true`, `ajustar_estoque` checado no handler (o ALMOXARIFE conta, mas quem homologa a divergência no saldo é ADMINISTRADOR/GESTOR); após aplicar, reavalia o alerta de mínimo por material (`alertService.verificarAlertaPorMaterialId`).

## ⚠️ Risco: a conclusão corre por fora do motor de estoque (registrado 2026-08-11)

Esta spec dizia apenas "falta aprovação forte" — **subestimava o problema**. A conclusão da
conferência (`PUT /conferencias/:id/concluir` com `aplicar_ajustes`) faz **UPDATE direto** em
`materiais_almoxarifado.quantidade_atual` + **INSERT manual** de movimentação tipo `AJUSTE`,
por fora do `stockService` e **sem `registrarAuditoria`**. Consequências:

- Sem validação de saldo, localização bloqueada ou custo médio.
- **Depois da Etapa 6** (saldo por localização/lote em `estoque_saldo_almoxarifado` como fonte
  por localização), esse caminho **dessincroniza** o saldo por localização/lote do saldo do
  material: o ajuste muda `quantidade_atual` sem tocar nas linhas de `estoque_saldo_almoxarifado`.
- É a **única exceção conhecida** à invariante do motor (todo write de saldo passa pelo
  `stockService`) — a spec 03 já a nomeia; espelhada aqui.

A correção é o item do checklist "Ajuste como movimentação específica (v2, tipo
AJUSTE_INVENTARIO)" — enquanto ele não sai, todo inventário concluído com ajustes deixa o saldo
por localização defasado.

## Checklist

### Backend
- [ ] Tipos de contagem (spec 21): geral, por endereço, por família, cíclica, item crítico, curva ABC, por divergência, surpresa, materiais de cliente, materiais em terceiros
- [ ] **Contagem cega**: contador não vê a quantidade do sistema (API não retorna `quantidade_sistema` para o perfil contador)
- [ ] Plano de contagem cíclica (frequência por criticidade/ABC) + geração automática
- [ ] Recontagem obrigatória acima da tolerância (config de tolerância %)
- [ ] Dupla contagem: contadores diferentes, comparação
- [ ] Congelar movimentações do escopo durante a contagem (bloqueio por material/localização)
- [ ] Ajuste como movimentação específica (v2, tipo AJUSTE_INVENTARIO) com **dupla aprovação** (feature 06) e justificativa
- [ ] Impacto financeiro do ajuste (quantidade × custo médio)
- [ ] Relatório de acuracidade (feature 21)
- [ ] E-mail do resultado (feature 19)

### Frontend
- [ ] Modo contagem cega na tela
- [ ] Fluxo de recontagem e aprovação de ajuste
- [ ] Contagem por endereço (hoje só por categoria)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Contagem cega não expõe saldo do sistema | `lista cega omite quantidade_sistema` |
| Divergência acima da tolerância exige recontagem | `concluir sem recontagem acima da tolerancia falha` |
| Ajuste sem aprovação falha | `ajuste de inventario sem aprovacao falha` |
| Ajuste gera movimentação auditável, nunca UPDATE direto | `ajuste cria movimentacao tipo AJUSTE com saldo anterior/posterior` |
| Material congelado não movimenta durante contagem | `movimentar material em contagem congelada falha` |
| Histórico de contagens é imutável | `conferencia concluida nao pode ser editada` |

## Dependências

- 03 (ajuste via movimentação) · 06 (dupla aprovação) · 01 (classe ABC).
