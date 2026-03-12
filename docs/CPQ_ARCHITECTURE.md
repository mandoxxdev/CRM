# Módulo CPQ (Configure Price Quote) – Arquitetura

## Visão geral

Configure → Price → Quote: configurador técnico, motor de preço e geração de proposta técnica comercial.

## Banco de dados (SQLite)

| Tabela | Uso |
|--------|-----|
| cpq_system_types | Tipo de sistema (dispersor, moinho, linha_processo, agua_gelada, turn_key) |
| cpq_composition_groups | Grupos de composição (equipamentos principais, tubulação, válvulas, instrumentação, automação, painéis, serviços, montagem, comissionamento) |
| cpq_engineering_rules | Regras IF/THEN (condição expr ou campo+operador+valor → resultado equipamento/especificação) |
| cpq_projects | Projeto CPQ (cliente, oportunidade, tipo sistema, params_json, proposta_id) |
| cpq_project_items | Itens do projeto por grupo (produto_id, quantidade, valor, specs_json, descritivo_gerado) |
| cpq_cost_types | Tipos de custo (equipamento, engenharia, montagem, logística, automação) |
| cpq_templates | Templates de proposta por tipo/idioma |
| cpq_descriptive_templates | Templates de texto para motor de descritivo |
| cpq_metrics | Métricas (propostas geradas/fechadas, ticket médio, tempo médio) |

## Backend (Node/Express)

- **cpq/configurator.js** – configure(system_type, params) → regras aplicadas, grupos, equipamentos sugeridos.
- **cpq/rulesEngine.js** – evaluateRule(rule, params), runRules(rules, params).
- **cpq/priceEngine.js** – calculate(items, options) → breakdown (custos, margem, desconto, impostos), by_group, total.
- **cpq/descriptiveEngine.js** – generate(item, params) → texto descritivo.

### APIs

- GET/POST cpq/system-types, composition-groups, engineering-rules (CRUD regras).
- POST cpq/configure – configurador.
- GET/POST/PUT/DELETE cpq/projects, GET cpq/projects/:id, POST cpq/projects/:id/items, PUT/DELETE items.
- POST cpq/price/calculate, cpq/descriptive/generate.
- POST cpq/projects/:id/generate-proposal – cria proposta + itens e associa ao projeto.

## Frontend (React)

- **CPQConfigurator** – tipo de sistema, parâmetros de processo, aplicar regras, criar projeto.
- **CPQProjects** – lista de projetos CPQ.
- **CPQProjectDetail** – composição por grupo, adicionar/editar/remover itens, calcular preço, gerar proposta.

## Fluxo

1. Usuário escolhe tipo de sistema e parâmetros → POST /cpq/configure.
2. Regras sugerem equipamentos → usuário cria projeto → POST /cpq/projects.
3. Em CPQProjectDetail: adiciona itens por grupo (produto ou manual), edita qtd/valor.
4. Calcular preço (opcional) → POST /cpq/price/calculate.
5. Gerar proposta → POST /cpq/projects/:id/generate-proposal → redireciona para proposta (preview/PDF já existentes).

## Versionamento e snapshot

- Propostas: revisão (REV00, REV01), proposta_revisoes, proposta_status_history (já existente).
- Snapshot: html_rendered imutável após envio (já existente).

## Multi-idioma

- cpq_templates.idioma (pt, es, en); labels no frontend podem ser estendidos com i18n.

## Fluxo CRM

- Lead → Oportunidade (oportunidades) → Proposta (propostas, vinculada a oportunidade_id) → Negociação → Pedido/OS → Projeto (projetos).
