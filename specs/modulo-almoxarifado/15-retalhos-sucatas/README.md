# 15 — Retalhos, Sobras e Sucatas

> **Status:** 🟡 — tabela e rotas de sobras existem (CRUD sem auditoria); falta baixa dimensional, etiqueta e todo o fluxo de sucata · **Spec original:** seção 19
> **Última atualização:** 2026-08-11 — auditoria de cauda: nomeada a pendência de auditoria do `scrapService` (único serviço de cauda sem `registrarAuditoria`) e registrado que `SUCATA` passou a exigir justificativa no motor

## Objetivo

Consumo parcial de chapa/tubo/barra gera retalho rastreável com dimensões remanescentes e nova etiqueta; sucata com classificação, aprovação e destino financeiro.

## O que já existe

- `sobras_material_almoxarifado` (`schema.js`): material, tipo, dimensões originais/restantes, espessura, peso, localização, projeto/OS de origem, reutilizável, status.
- `GET/POST/PUT /sobras` (`extended.js`) via `scrapService.js`. Teste de serviço existe.
- Tipos de localização preveem área de sucata e de retalhos.
- **Registrado na auditoria de 2026-08-11:**
  - `scrapService` é **CRUD puro sem auditoria** — o único serviço de cauda sem nenhuma chamada a `registrarAuditoria` (todos os demais auditam). Pendência nomeada no checklist.
  - O tipo `SUCATA` no motor **passou a exigir justificativa** (`REGRAS_VINCULO` em `movementRules`, Etapa 5/6) — afeta o caminho devolução→sucata (a feature 12 já envia justificativa) e qualquer fluxo futuro de sucateamento desta feature.

## Checklist

### Backend — retalhos
- [ ] Auditar o CRUD de sobras: `scrapService` sem `registrarAuditoria` em criar/editar (pendência nomeada em 2026-08-11)
- [ ] Fluxo de consumo parcial: dar baixa na dimensão/peso original + criar saldo do retalho **na mesma transação** (spec 19)
- [ ] Vínculo com lote/corrida original (feature 10)
- [ ] Campos completos: norma, diâmetro, largura, comprimento, foto, responsável, data (parcial na tabela)
- [ ] Nova etiqueta com dimensões/peso remanescente (feature 10)
- [ ] Retalho consultável na disponibilidade (sugerir retalho antes de material inteiro)
- [ ] Retalho de material de cliente permanece do cliente (feature 13)

### Backend — sucatas
- [ ] Classificação de tipo de sucata + peso + material + projeto de origem
- [ ] Aprovação de sucateamento (Almoxarifado + gestão — feature 06)
- [ ] Transferência para área de sucata (movimentação)
- [ ] Registro de venda ou descarte com comprovantes anexos
- [ ] Relatório financeiro de sucata
- [ ] E-mail no sucateamento (feature 19)

### Frontend
- [ ] Tela de sobras/retalhos (hoje inexistente): consulta por material/dimensão, gerar retalho, imprimir etiqueta
- [ ] Fluxo de sucateamento com aprovação

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Consumo parcial baixa o original e cria retalho atomicamente | `consumo parcial gera retalho na mesma transacao` |
| Retalho herda lote/corrida do original | `retalho referencia lote original` |
| Sucateamento sem dupla aprovação falha | `sucatear sem aprovacao falha` |
| Sucata sai do estoque disponível | `material sucateado fora do disponivel` |

## Dependências

- 03 (transação de consumo) · 10 (lote/etiqueta) · 06 (aprovação) · 13 (propriedade do cliente).
