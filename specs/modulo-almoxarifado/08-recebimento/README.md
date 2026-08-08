# 08 — Entrada e Recebimento de Materiais

> **Status:** 🟡 — workflow fiscal NF maduro, quarentena na entrada fechada (Etapa 5); faltam tipos de entrada e conferência física estruturada · **Spec original:** seção 8
> **Última atualização:** 2026-08-08 (Etapa 5 — quarentena e bloqueio efetivos no saldo)

## Objetivo

Todos os tipos de entrada da spec, conferência documental e física estruturadas, divergências, etiqueta, endereçamento na entrada e e-mail automático.

## O que já existe

- Tabelas `recebimentos_material_almoxarifado` (+25 colunas fiscais: chave NFe, CFOP, ICMS/IPI, frete, contas_pagar_id, etapa_atual) + itens (quantidade esperada/recebida, conferência, lote, valores) — `schema.js:419-502`.
- Workflow em 4 etapas com 11 status: Almoxarifado → Compras → Faturamento → Contas a Pagar (`receiptService.js`, 511 L; rotas `extended.js:149-211`: criar, conferir, inspecionar item, aprovar, workflow, fiscal, processar).
- Inspeção por item: `inspecoes_recebimento_almoxarifado` (conforme, divergências, certificado ausente, dano, ação).
- Front: `RecebimentosAlmoxarifado.js` (732 L) com o workflow completo; cross-links nos menus de Compras e Financeiro.
- Vínculo a pedido de compra e fornecedor (`itens_pedido_compra`, rotas aux).
- Testes de serviço: recebimento + workflow NF → contas a pagar.
- **Etapa 5 (2026-08-08):** entrada de material que exige inspeção deixou de ser barrada. Antes,
  `darEntradaEstoque` recusava aprovar o recebimento de item crítico sem inspeção prévia
  ("Item crítico #N requer inspeção") — o material não existia no sistema mesmo já estando
  fisicamente no galpão. Agora a entrada acontece sempre e o item que exige inspeção
  (`material_critico = 1` na ficha do material + config `inspecao_material_critico = '1'`, que
  já nasce ligada por padrão) entra **retido**: sobe o físico (`quantidade_atual`) e
  `quantidade_em_inspecao` juntos, via movimentação `QUARENTENA` vinculada ao recebimento
  (`recebimento_id`) — fora do disponível, mas dentro do físico. Item comum continua entrando
  direto no disponível, sem mudança (`4db5e11`).

## Checklist

### Backend
- [ ] Tipos de entrada (spec 8.1): materiais de cliente, consignado, retorno de industrialização/fornecedor/assistência, devolução da produção, transferência, fabricado internamente, sobra/retalho, ajuste, ferramenta, produto acabado — hoje o recebimento é só de NF de compra (os demais entram pelas features 11/12/13/14/15; aqui: campo `tipo_entrada` + validações por tipo). **Fora do escopo da Etapa 5** (design 2026-08-07): decisão explícita de deixar para quando houver demanda real de um tipo específico.
- [ ] Recebimento parcial de pedido (validar suporte real + saldo pendente do pedido)
- [ ] Recebimento excedente só com autorização
- [ ] Conferência física estruturada (spec 8.3): contagem, pesagem, medição, checklist configurável por tipo de material. **Fora do escopo da Etapa 5**, mesma decisão acima.
- [ ] Fotos do recebimento (`anexos_documento_almoxarifado` entidade `recebimento`)
- [ ] Divergências: registro formal (tipo, quantidade, ação) — parcial na inspeção
- [ ] Ao aprovar: definir localização (sugestão da feature 02) + gerar etiqueta (feature 10) + **atualizar saldo via movimentação v2** (verificar se o processamento atual passa pelo stockService — se não, unificar) — a entrada já passa pelo motor (`registrarMovimentacao`) desde antes da Etapa 5; falta a etiqueta (feature 10) e a sugestão de localização
- [x] Quarentena: material aguardando inspeção não entra no disponível (`quantidade_em_inspecao`) — **Etapa 5 (2026-08-08)**. Três movimentos novos no motor (`QUARENTENA`, `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO`) com guarda atômica (`c37b67e`); entrada retida em vez de barrada (`4db5e11`). A decisão de inspeção em si (aprovar/reprovar/parcial) é da feature 09 — ver aquele README para o motor real usado na decisão (`DECISAO_INSPECAO`, não os dois tipos separados acima).
- [ ] E-mail automático na entrada confirmada (feature 19)
- [ ] Duplicidade: mesma NF+fornecedor não entra duas vezes

### Frontend
- [ ] Campos de conferência física + fotos
- [ ] Definição de localização na entrada
- [ ] Tipos de entrada no form

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| NF duplicada (fornecedor+número) falha | `recebimento com NF duplicada falha` |
| Quantidade recebida > pedida sem autorização falha | `recebimento excedente sem autorizacao falha` |
| Material com necessidade de inspeção entra em quarentena (físico sobe, disponível não) | `item critico entra no fisico mas fora do disponivel` — `server/tests/api/recebimentoQuarentena.api.test.js` (`4db5e11`) |
| Aprovar recebimento de item crítico **não exige mais inspeção prévia** (mudança da Etapa 5 — antes lançava erro) | `aprovar recebimento de item critico NAO exige inspecao previa (mudanca da Etapa 5)` — mesmo arquivo |
| Item não crítico entra direto no disponível (regressão) | `item NAO critico entra direto no disponivel (regressao)` — mesmo arquivo |
| Retenção fica registrada no livro, vinculada ao recebimento | `a retencao aparece no livro como QUARENTENA vinculada ao recebimento` — mesmo arquivo |
| Processar recebimento gera movimentação de entrada com saldo anterior/posterior | `processar recebimento cria movimentacao v2 vinculada` |
| Workflow não pula etapas | `avancar etapa fora de ordem falha` |
| Recebimento parcial mantém pendência do pedido | `recebimento parcial atualiza saldo pendente do pedido` |

## Dependências

- 03 (movimentação v2) · 02 (localização na entrada) · 09 (inspeção — decide o que este README apenas retém) · 10 (lote/etiqueta) · 19 (e-mail).
