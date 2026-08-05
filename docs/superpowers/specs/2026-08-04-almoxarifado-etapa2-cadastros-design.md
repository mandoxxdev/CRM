# Design — Almoxarifado Etapa 2: Cadastros Completos (features 01 + 02)

> Aprovado pelo usuário em 2026-08-04 (três decisões de modelagem confirmadas com recomendação).
> Specs de referência: `specs/modulo-almoxarifado/01-cadastros-materiais/README.md` e `02-localizacoes-enderecamento/README.md`.

## Decisões aprovadas

1. **Multi-almoxarifado = entidade nova como raiz.** Tabela `almoxarifados` (codigo UNIQUE, nome, descricao, ativo). Localizações ganham `almoxarifado_id`. Migração de dados via ledger `schema_migrations_almoxarifado` (primeiro uso real do padrão — fecha o item 0.4 da fundação): cria "ALM-GERAL / Almoxarifado Geral" e vincula todas as localizações existentes.
2. **Subfamílias dentro do cadastro de famílias.** `parent_id` na própria `familias_material_almoxarifado` (máximo 2 níveis — subfamília não tem filhos). Material ganha `subfamilia_id` validado: deve ser filha da `familia_id` do material.
3. **Escopo = núcleo do cadastro.** Campos do material (técnicos, reposição, controles, ABC), unidades compra/consumo + fatores de conversão, multi-almoxarifado + restrições de endereço. Fora: transportadoras, tipos de documento, motivos estruturados (ficam com as features donas), capacidade/peso como enforcement (informativo apenas — adiado), confirmação por leitura (Etapa 15).

## Modelo de dados (todas as mudanças via safeAlter/ledger em schema.js)

**materiais_almoxarifado — colunas novas:** `fabricante`, `codigo_fabricante`, `peso_unitario REAL`, `dimensoes TEXT`, `material_construtivo`, `norma`, `marca`, `modelo`, `aplicacao`, `ponto_reposicao REAL`, `lote_economico REAL`, `controle_serie`, `controle_validade`, `controle_corrida`, `requer_inspecao`, `requer_foto` (INTEGER 0/1), `classe_abc TEXT (A|B|C|null)`, `unidade_compra TEXT`, `fator_conversao_compra REAL`, `unidade_consumo TEXT`, `fator_conversao_consumo REAL`, `subfamilia_id INTEGER`.
Já existentes e reutilizados: `descricao_tecnica`, `especificacoes` (especificação técnica), `prazo_reposicao_dias`, `controle_lote`, `controle_certificado`, `material_critico` (criticidade), `custo_unitario` (= último custo, atualizado pelo motor da Etapa 1 — documentado, sem coluna nova).

**familias_material_almoxarifado:** `parent_id INTEGER` (NULL = família raiz; preenchido = subfamília).

**almoxarifados (nova):** `id, codigo TEXT UNIQUE NOT NULL, nome TEXT NOT NULL, descricao TEXT, ativo INTEGER DEFAULT 1, created_at`.

**localizacoes_almoxarifado:** `almoxarifado_id INTEGER`, `bloqueada INTEGER DEFAULT 0`, `tipos_material_permitidos TEXT` (JSON array de valores de `tipo_material`; NULL = sem restrição).

## Regras essenciais (todas nascem com teste de API)

| Regra | Onde |
|---|---|
| Subfamília deve ser filha da família do material; senão 400 | POST/PUT materiais |
| Subfamília não pode ter filhos (2 níveis máx); pai inválido 400 | POST/PUT famílias |
| Fator de conversão ≤ 0 → 400 (quando unidade compra/consumo informada) | MaterialSchema (Zod) |
| classe_abc fora de A/B/C → 400 | MaterialSchema |
| Editar material grava auditoria com dados anteriores/novos (spec 29) | PUT materiais |
| Movimentação com localização (origem OU destino) bloqueada → 400 | motor (`registrarMovimentacao`) |
| Movimentação para destino com restrição de tipos incompatível → 400 | motor |
| Excluir localização com saldo positivo → 400 | DELETE localizações |
| Migração vincula localizações existentes ao ALM-GERAL exatamente uma vez | ledger de migração |
| Inativar família com subfamílias ativas ou almoxarifado com localizações ativas → 400 | PUT/DELETE respectivos |

## Rotas

- `GET/POST/PUT /api/almoxarifado/almoxarifados` (POST/PUT com `requirePermission('configurar')` + Zod).
- `GET /localizacoes` ganha filtro `?almoxarifado_id=` e campo computado `endereco_completo` (caminho hierárquico "ALM-GERAL / Corredor A / A-01"); POST/PUT aceitam `almoxarifado_id`, `bloqueada`, `tipos_material_permitidos`.
- `GET /localizacoes/vazias` (posições ativas sem saldo positivo) e `GET /relatorios/materiais-sem-endereco`.
- POST/PUT `/materiais` migram para `validate(MaterialSchema)` (Zod) com os campos novos + auditoria de update.
- POST/PUT `/familias` aceitam `parent_id` com as validações de hierarquia.

## Frontend

- `MaterialAlmoxarifadoForm.js` em seções: Identificação · Classificação (família→subfamília em cascata) · Dados técnicos · Estoque e reposição (min/max/ponto/lote econômico) · Controles (flags) · Unidades e custos (compra/consumo + fatores).
- Configurações: gestão de Almoxarifados (nova aba ou dentro de "Setores e Áreas"); localizações com almoxarifado, bloqueio e tipos permitidos.
- Mapa 2D: filtro por almoxarifado; badge de localização bloqueada.

## Testes e processo

~7 arquivos de API novos; regressão completa por task (`test:api` + `test:almoxarifado`); execução subagent-driven com review por task e review final da etapa; commits na `desenvolvimento-almoxarifado`.
