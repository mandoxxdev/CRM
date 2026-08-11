# 11 — Transferências Internas

> **Status:** 🟡 — transferência direta existe (desde a Etapa 6 movendo a linha do lote); falta trânsito, aprovação, UI, exigência de lote e regra de vínculo · **Spec original:** seção 15
> **Última atualização:** 2026-08-11 — auditoria de cauda: registrado que a TRANSFERENCIA move a linha do lote (Etapa 6) e nomeadas duas lacunas: rota sem `exigeLote` e tipo fora de `REGRAS_VINCULO`

## Objetivo

Transferências entre almoxarifados/endereços com fluxo solicitação → aprovação → retirada → **em trânsito** → recebimento → confirmação.

## O que já existe

- `POST /transferencias` (`extended.js`, permissão `movimentar`) — via `stockService`, move saldo entre localizações imediatamente (origem→destino atômico). Teste de serviço existe.
- Movimentação com `localizacao_origem_id`/`localizacao_destino_id`.
- **Desde a Etapa 6 (registrado 2026-08-11):** `TRANSFERENCIA` move a **linha do lote** entre localizações em `estoque_saldo_almoxarifado` (`stockService`, com claim no WHERE para atomicidade) — a spec descrevia só "move saldo entre localizações", sem a dimensão do lote.

### Lacunas achadas na auditoria de 2026-08-11 (pendências no checklist)

1. A rota `POST /transferencias` **não declara `exigeLote`**: material com `controle_lote` transfere sem citar lote.
2. `TRANSFERENCIA` **não está em `REGRAS_VINCULO`** (`movementRules`): não há exigência de vínculo nem de justificativa para transferir.

## Checklist

### Backend
- [ ] Entidade `transferencias_almoxarifado` com status (SOLICITADA → APROVADA → EM_TRANSITO → RECEBIDA → CONFIRMADA / CANCELADA) — hoje a transferência é instantânea, sem estados
- [ ] Localização virtual "Em trânsito": material retirado não é disponível na origem nem no destino
- [ ] Aprovação quando exigida (regras da feature 06 — ex.: transferir para sucata/cliente/terceiro)
- [ ] Recebimento no destino com conferência (quantidade recebida ≠ enviada → divergência)
- [ ] Destinos especiais (spec 15): produção, kit de projeto, quarentena, inspeção, expedição, sucata, reservado, estoque de cliente, terceiro — validar restrições por tipo de destino
- [ ] Transferência entre almoxarifados (depende da decisão multi-almoxarifado, feature 02)
- [ ] Declarar `exigeLote` na rota `POST /transferencias` — hoje material com `controle_lote` transfere sem citar lote (lacuna nomeada em 2026-08-11)
- [ ] Incluir `TRANSFERENCIA` em `REGRAS_VINCULO` (`movementRules`) — decidir se exige justificativa e/ou vínculo (lacuna nomeada em 2026-08-11)
- [ ] E-mail nas transferências relevantes (feature 19) · alerta "transferência não recebida" (feature 20)

### Frontend
- [ ] Tela de transferências (criar, receber, acompanhar em trânsito) — hoje inexistente

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material em trânsito não é disponível em lugar nenhum | `saldo em transito fora do disponivel de origem e destino` |
| Recebimento confirma exatamente o que chegou; divergência registrada | `receber quantidade menor gera divergencia` |
| Transferir mais que o saldo da origem falha | `transferencia acima do saldo falha` |
| Cancelamento antes da retirada devolve tudo à origem | `cancelar transferencia solicitada restaura origem` |
| Transferência instantânea (mesmo prédio) continua atômica | `transferencia direta origem-destino atomica` (existe em serviço — cobrir na API) |

## Dependências

- 03 (motor) · 02 (localizações/multi-almoxarifado) · 06 (aprovação).
