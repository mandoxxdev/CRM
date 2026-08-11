# 05 — Separação e Picking

> **Status:** 🟡 básico — a separação simples por item existe e foi endurecida pelas Etapas 3/4/6 (permissão `separar_emitir`, liberação para retirada, parcialidade acumulada); lista de separação como entidade, conferência dupla, rota de picking e kits continuam não existindo · **Spec original:** seção 12
> **Última atualização:** 2026-08-11 (auditoria spec×código — esta spec estava congelada em 2026-08-02, anterior às Etapas 3, 4 e 6, e não refletia nada do que elas mudaram aqui)

## Objetivo

Listas de separação agrupadas, rota de picking, conferência dupla, montagem e identificação de kits.

## O que já existe

- Separação simples por item dentro da requisição: `PUT /requisicoes/:id/separacao` + alias `PUT /requisicoes/:id/separar` (`routes/almoxarifado.js`), ambos hoje sob `requirePermission('separar_emitir')` (perfis ADMIN/ALMOXARIFE) — esta spec não mencionava permissão. Grava `quantidade_separada` (acumulando em múltiplas rodadas, com teto `maxSeparar`), bloqueia separar acima do teto e sem aprovação de valor (`requisitionService.js`).
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
- [ ] Separação parcial com saldo pendente — nota (auditoria 2026-08-11): a **parcialidade em si já funciona** (acúmulo de `quantidade_separada` em múltiplas rodadas + teto `maxSeparar`, entregue nas Etapas 3/4); o que falta deste item é a entidade lista-de-separação e o registro de divergência
- [ ] Transferir material separado para localização "Aguardando retirada"/"Kit" (movimentação v2 de transferência)
- [ ] Segunda conferência (conferente ≠ separador)
- [ ] Kit: identificação e conteúdo
- [x] Liberar para retirada → status da requisição `PRONTA_PARA_RETIRADA` — **entregue na Etapa 3 (2026-08-05)**: rota `PUT /requisicoes/:id/liberar-retirada` (permissão `separar_emitir`), valida a transição na máquina de estados e exige ≥1 item separado, com teste de API. Estava marcado na spec 04 desde a Etapa 3 e **aqui ficou esquecido como pendente** — corrigido na auditoria de 2026-08-11

### Frontend
- [ ] Tela de listas de separação (fila de trabalho do almoxarife)
- [ ] Fluxo de conferência

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Separar mais que o solicitado/estoque falha | `separacao acima do estoque falha` (existe em serviço — cobrir na API) |
| ~~Material separado sai do disponível (vai para localização reservada)~~ **Superada — esta regra estava errada como mecanismo (corrigido 2026-08-11):** desde a Etapa 4 o material sai do disponível **na aprovação**, via reserva (`requisitionService.reservarItensAprovacao`); a separação não move saldo nenhum | coberto pelos testes de reserva da feature 07 (`requisicaoReservaAutomatica.api.test.js`); mover fisicamente para localização de kit fica com a lista de separação, se vier |
| Segunda conferência exige usuário diferente | `conferencia pelo mesmo usuario da separacao falha` |
| Divergência na separação exige registro | `separacao com quantidade menor exige motivo` |

## Dependências

- 03 (movimentação v2 para transferências internas) · 04 (status novos) · 02 (localizações virtuais) · leitura de código de barras fica para Etapa 15 (API deve aceitar campos de leitura desde já).
