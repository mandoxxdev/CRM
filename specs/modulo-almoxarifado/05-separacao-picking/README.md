# 05 — Separação e Picking

> **Status:** 🟡 básico · **Spec original:** seção 12
> **Última atualização:** 2026-08-02

## Objetivo

Listas de separação agrupadas, rota de picking, conferência dupla, montagem e identificação de kits.

## O que já existe

- Separação simples por item dentro da requisição: `PUT /requisicoes/:id/separacao` (`routes/almoxarifado.js:1908`), grava `quantidade_separada`, bloqueia separar acima do estoque e sem aprovação de valor (`requisitionService.js`).
- Front: ação "Separação" em `RequisicoesList.js` com quantidades por item.
- Localização virtual: `TIPOS_LOCALIZACAO` já contempla tipos que servem para "Reservado"/"Kit"/"Aguardando retirada" (validar na implementação).

## Checklist

### Backend
- [ ] Lista de separação como entidade própria (agrupa itens de 1+ requisições)
- [ ] Agrupamento por projeto / setor / localização
- [ ] Prioridade e responsável pela separação
- [ ] Sugestão de rota (ordenar itens pela hierarquia de localizações)
- [ ] Registro por item: localização lida, lote/série retirado, quantidade, divergência
- [ ] Substituição de lote com registro
- [ ] Separação parcial com saldo pendente
- [ ] Transferir material separado para localização "Aguardando retirada"/"Kit" (movimentação v2 de transferência)
- [ ] Segunda conferência (conferente ≠ separador)
- [ ] Kit: identificação e conteúdo
- [ ] Liberar para retirada → status da requisição `PRONTA_PARA_RETIRADA`

### Frontend
- [ ] Tela de listas de separação (fila de trabalho do almoxarife)
- [ ] Fluxo de conferência

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Separar mais que o solicitado/estoque falha | `separacao acima do estoque falha` (existe em serviço — cobrir na API) |
| Material separado sai do disponível (vai para localização reservada) | `separacao move saldo para localizacao de kit` |
| Segunda conferência exige usuário diferente | `conferencia pelo mesmo usuario da separacao falha` |
| Divergência na separação exige registro | `separacao com quantidade menor exige motivo` |

## Dependências

- 03 (movimentação v2 para transferências internas) · 04 (status novos) · 02 (localizações virtuais) · leitura de código de barras fica para Etapa 15 (API deve aceitar campos de leitura desde já).
