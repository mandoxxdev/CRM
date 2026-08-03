# 17 — Inventário e Contagem Cíclica

> **Status:** 🟡 — inventário simples funciona; falta contagem cega, recontagem, tolerância e aprovação forte · **Spec original:** seção 21
> **Última atualização:** 2026-08-02

## Objetivo

Inventário geral e contagens cíclicas (por material, endereço, criticidade, ABC) com listas cegas, recontagem, tolerância, ajuste por transação aprovada e relatório de acuracidade.

## O que já existe

- `conferencias_almoxarifado` + `itens_conferencia_almoxarifado` (`schema.js:107-129,715-720`): número, status, responsável, tipo, projeto, localização, aprovador, justificativa de ajuste; itens com quantidade sistema/contada/divergência/ajustado.
- Rotas `GET/POST/PUT /conferencias*` (`routes/almoxarifado.js:657-804`): criar por categoria, lançar contagem, concluir (gera ajustes), cancelar.
- Front: `ConferenciaEstoque.js` (341 L).
- Dado real: 2 conferências em produção.

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
