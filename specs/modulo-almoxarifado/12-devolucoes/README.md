# 12 — Devoluções

> **Status:** 🟡 — registro simples existe; falta vínculo à saída original e fluxo de destino · **Spec original:** seção 16
> **Última atualização:** 2026-08-02

## Objetivo

Devoluções (da produção, de projeto, de ferramenta, ao fornecedor, de cliente) sempre vinculadas à saída original, com avaliação de condição e destino (estoque/inspeção/reparo/sucata).

## O que já existe

- `devolucoes_material_almoxarifado` (`schema.js:518`): material, quantidade, motivo, condição, destino, origem_os_id, origem_projeto_id.
- `GET/POST /devolucoes` (`extended.js:218-223`) via `returnService.js` (58 L). Teste de serviço existe.
- Tipo `DEVOLUCAO` na movimentação v1/v2.

## Checklist

### Backend
- [ ] Vincular devolução à **movimentação de saída original** (`movimentacao_saida_id`) — validar quantidade devolvida ≤ entregue
- [ ] Tipos de devolução (spec 16): produção, projeto, instalação externa, ferramenta (feature 16), não utilizado, ao fornecedor, do fornecedor, de cliente (feature 13), assistência técnica
- [ ] Condição → destino: boa → estoque · suspeita → inspeção (feature 09) · danificada → reparo/sucata (feature 15)
- [ ] Fotos da devolução (anexos)
- [ ] Atualizar custo do projeto (estorno de consumo — feature 22)
- [ ] Devolução ao fornecedor: fluxo próprio com documento e e-mail
- [ ] E-mail automático (feature 19)

### Frontend
- [ ] Tela de devoluções (hoje inexistente) — criar a partir de uma saída/requisição entregue

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Devolver mais que o entregue falha | `devolucao acima da quantidade entregue falha` |
| Devolução vincula-se à saída original | `devolucao sem saida original valida falha` |
| Condição "suspeita" entra em inspeção, não no disponível | `devolucao para inspecao nao aumenta disponivel` |
| Devolução ao estoque restaura saldo e registra no livro | `devolucao boa aumenta saldo com movimentacao vinculada` |

## Dependências

- 03 (movimentação) · 09 (inspeção) · 15 (sucata) · 16 (ferramentas) · 22 (custo de projeto).
