# 02 — Localizações e Endereçamento

> **Status:** 🟡 · **Spec original:** seções 3, 11
> **Última atualização:** 2026-08-02

## Objetivo

Múltiplos almoxarifados, endereçamento padrão (ALM-CORREDOR-ESTRUTURA-NÍVEL-POSIÇÃO), restrições de armazenagem e operações de endereço.

## O que já existe

- `localizacoes_almoxarifado` hierárquica (`parent_id`) com posições 2D para o mapa (`schema.js:155,330-336`), 13 tipos em `TIPOS_LOCALIZACAO`.
- `setores_almoxarifado` (área/corredor/bancada, prefixo de código).
- CRUD localizações (`routes/almoxarifado.js:1144-1224`, valida subgrupo duplicado) e setores (`:1237-1326`).
- Mapa 2D drag-and-drop: `MapaLocalizacoesAlmoxarifado.js` (786 L) + rotas `extended.js:61-67` — mostra ocupação e reservas.
- Saldo por localização já suportado no motor: `estoque_saldo_almoxarifado` (material+localização+lote).
- `localizacao_padrao_id` no material.

## Decisão em aberto (tomar na Etapa 2)

**Multi-almoxarifado:** a spec pede vários almoxarifados (3.1 lista ~24). Hoje o modelo é UM almoxarifado com hierarquia de setores/localizações. Opções:
1. Nova entidade `almoxarifados` como nível raiz da hierarquia existente (menos invasivo — provável escolha).
2. Reinterpretar `setores_almoxarifado` tipo `area` como "almoxarifado" (sem mudança de schema, mais ambíguo).

## Checklist

### Backend
- [ ] Decidir e implementar multi-almoxarifado (ver acima); áreas especiais (quarentena, expedição, sucata, devoluções, em-terceiros) como localizações tipadas
- [ ] Código de endereço padrão gerado a partir da hierarquia (ex.: `ALM-GERAL-A03-E02-N04-P01`)
- [ ] Restrições da posição: tipo de material permitido, capacidade, peso máximo, dimensões → validação na movimentação de destino
- [ ] Bloquear/liberar endereço (flag + validação em movimentação)
- [ ] Consultas: ocupação (parcial no mapa), posições vazias, materiais sem endereço
- [ ] Sugestão de localização na entrada (usa `localizacao_padrao_id` + restrições + espaço)
- [ ] Confirmação de localização por leitura (depende de código de barras — Etapa 15; deixar API pronta para receber `codigo_lido`)

### Frontend
- [ ] Cadastro/gestão de almoxarifados (se entidade nova)
- [ ] Tela de consulta de ocupação/vazias/sem endereço (pode ser aba do mapa)
- [ ] Bloqueio de endereço no mapa

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material com restrição não entra em posição incompatível | `movimentacao para localizacao incompativel falha` |
| Endereço bloqueado não recebe nem fornece material | `movimentacao com endereco bloqueado falha` |
| Endereço com material não pode ser excluído | `excluir localizacao com saldo falha` |
| Saldo por localização bate com saldo total do material | `soma dos saldos por localizacao igual ao saldo do material` |

## Dependências

- Motor de estoque (03) — as validações rodam dentro da movimentação v2.
