# 08 — Entrada e Recebimento de Materiais

> **Status:** 🟡 — workflow fiscal NF maduro; faltam tipos de entrada e conferência física estruturada · **Spec original:** seção 8
> **Última atualização:** 2026-08-02

## Objetivo

Todos os tipos de entrada da spec, conferência documental e física estruturadas, divergências, etiqueta, endereçamento na entrada e e-mail automático.

## O que já existe

- Tabelas `recebimentos_material_almoxarifado` (+25 colunas fiscais: chave NFe, CFOP, ICMS/IPI, frete, contas_pagar_id, etapa_atual) + itens (quantidade esperada/recebida, conferência, lote, valores) — `schema.js:419-502`.
- Workflow em 4 etapas com 11 status: Almoxarifado → Compras → Faturamento → Contas a Pagar (`receiptService.js`, 511 L; rotas `extended.js:149-211`: criar, conferir, inspecionar item, aprovar, workflow, fiscal, processar).
- Inspeção por item: `inspecoes_recebimento_almoxarifado` (conforme, divergências, certificado ausente, dano, ação).
- Front: `RecebimentosAlmoxarifado.js` (732 L) com o workflow completo; cross-links nos menus de Compras e Financeiro.
- Vínculo a pedido de compra e fornecedor (`itens_pedido_compra`, rotas aux).
- Testes de serviço: recebimento + workflow NF → contas a pagar.

## Checklist

### Backend
- [ ] Tipos de entrada (spec 8.1): materiais de cliente, consignado, retorno de industrialização/fornecedor/assistência, devolução da produção, transferência, fabricado internamente, sobra/retalho, ajuste, ferramenta, produto acabado — hoje o recebimento é só de NF de compra (os demais entram pelas features 11/12/13/14/15; aqui: campo `tipo_entrada` + validações por tipo)
- [ ] Recebimento parcial de pedido (validar suporte real + saldo pendente do pedido)
- [ ] Recebimento excedente só com autorização
- [ ] Conferência física estruturada (spec 8.3): contagem, pesagem, medição, checklist configurável por tipo de material
- [ ] Fotos do recebimento (`anexos_documento_almoxarifado` entidade `recebimento`)
- [ ] Divergências: registro formal (tipo, quantidade, ação) — parcial na inspeção
- [ ] Ao aprovar: definir localização (sugestão da feature 02) + gerar etiqueta (feature 10) + **atualizar saldo via movimentação v2** (verificar se o processamento atual passa pelo stockService — se não, unificar)
- [ ] Quarentena: material aguardando inspeção não entra no disponível (`quantidade_em_inspecao`)
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
| Material com necessidade de inspeção entra em quarentena, não no disponível | `recebimento de material inspecionavel nao aumenta disponivel` |
| Processar recebimento gera movimentação de entrada com saldo anterior/posterior | `processar recebimento cria movimentacao v2 vinculada` |
| Workflow não pula etapas | `avancar etapa fora de ordem falha` |
| Recebimento parcial mantém pendência do pedido | `recebimento parcial atualiza saldo pendente do pedido` |

## Dependências

- 03 (movimentação v2) · 02 (localização na entrada) · 09 (inspeção) · 10 (lote/etiqueta) · 19 (e-mail).
