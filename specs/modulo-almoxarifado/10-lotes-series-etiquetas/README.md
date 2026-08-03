# 10 — Lotes, Números de Série e Etiquetas

> **Status:** ❌ — lote hoje é texto livre; série e etiquetas não existem · **Spec original:** seção 10
> **Última atualização:** 2026-08-02

## Objetivo

Controle real por lote (validade, corrida/heat number, certificado), número de série individual, e etiquetas com QR/código de barras.

## O que já existe (pouco)

- Coluna `lote` TEXT livre em `estoque_saldo_almoxarifado` e `movimentacoes_almoxarifado` (o motor já segrega saldo por lote — bom ponto de partida).
- Flags `controle_lote` e `controle_certificado` no material — **gravadas mas nunca verificadas** em nenhuma operação.
- Campo `lote` no item de recebimento.
- Tabela órfã `lotes` (`index.js:19458`) é de lote de **produção**, sem rota — não confundir.

## Checklist

### Backend — lotes
- [ ] Tabela `lotes_almoxarifado`: material, código do lote, fornecedor, corrida/heat number, certificado (anexo), data de fabricação, validade, status (ativo/bloqueado/reprovado/vencido)
- [ ] `estoque_saldo_almoxarifado.lote` passa a referenciar a tabela (migração dos textos existentes)
- [ ] Aplicar `controle_lote`: material controlado exige lote em TODA entrada e saída
- [ ] Aplicar `controle_certificado`: entrada sem certificado anexado falha (ou entra bloqueada)
- [ ] Validade: bloquear saída de lote vencido; sugestão FEFO (primeiro que vence sai primeiro)
- [ ] Rastreabilidade: consulta de tudo que aconteceu com um lote

### Backend — números de série
- [ ] Tabela `series_almoxarifado`: material, número de série, status (em estoque/reservado/entregue/em terceiro/devolvido), localização, projeto/OS atual
- [ ] `controle_serie` no material: entrada exige N séries para N unidades; saída exige quais séries
- [ ] Série é única por material; ciclo de vida rastreável

### Backend — etiquetas
- [ ] Geração de etiqueta (spec 10): código GMP, descrição, quantidade, lote/série, fornecedor, pedido, NF, projeto, localização, status inspeção + **QR Code**
- [ ] Endpoint de etiqueta em PDF (aproveitar infra `pdfkit`/`puppeteer` existente)
- [ ] Etiqueta de retalho com dimensões/peso remanescente (feature 15)
- [ ] Regras por tipo (spec 10): motores/instrumentos → série; chapas/tubos certificados → lote+corrida; químicos → lote+validade

### Frontend
- [ ] Cadastro/consulta de lotes e séries no detalhe do material
- [ ] Seleção de lote/série na movimentação, separação e entrega
- [ ] Botão imprimir etiqueta (recebimento, material, localização)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material com controle_lote exige lote na movimentação | `movimentar material controlado sem lote falha` |
| Saída de lote vencido falha | `saida de lote vencido falha` |
| Saída de lote reprovado falha | `saida de lote reprovado falha` |
| Série não pode estar em dois lugares | `entrada de serie ja em estoque falha` |
| Saída de material seriado exige séries válidas em estoque | `saida seriada com serie inexistente falha` |
| Saldo por lote soma o saldo do material | `soma dos lotes igual saldo total` |

## Dependências

- 03 (motor de estoque) — as validações entram no `stockService`. Consome: 04/05 (entrega), 07 (reserva por lote), 08 (entrada), 09 (reprovação), 15 (retalhos).
