# CPQ para Processo Químico — Especificação e Implementação

## Objetivo

Módulo CPQ orientado a **dimensionamento comercial preliminar** e **proposta técnica comercial** para equipamentos aplicados em processos químicos (tintas, resinas, solventes, massas, agroquímicos, adesivos, impermeabilizantes).

**Critérios centrais de dimensionamento:** viscosidade (cPs), densidade, volume útil, tipo de produto, base química, temperatura, produtividade, necessidade de dispersão/moagem/agitação/transferência/dosagem.

---

## 1. Configurador Técnico (Módulo 1)

### Entrada — Dados de processo

| Campo | Descrição |
|-------|------------|
| produto / segmento | Tipo (tinta, resina, massa, agroquímico...) |
| viscosity_cps | Viscosidade em cP (centipoise) |
| densidade | g/cm³ |
| volume_util / volume_total | Litros |
| temperatura | °C |
| vazão / produtividade | Conforme unidade |
| base_quimica | água, solvente |
| area_classificada | Área Ex |
| produto_corrosivo | Sim/Não |
| produto_abrasivo | Sim/Não |
| necessidade_dispersao, necessidade_moagem, necessidade_agitacao | Checkboxes |
| presenca_solidos | Sim/Não |

### Tipos de solução

- dispersor, moinho, agitador, tanque, reator  
- tubulacao, dosagem, agua_gelada  
- linha_processo, turn_key  

### Saída automática

- Família de equipamento adequada  
- Potência preliminar (min–max CV)  
- Tipo de acionamento (padrão / EX)  
- Material de contato sugerido (inox 316 se corrosivo, revestimento se abrasivo)  
- Tipo de vedação (mecânica simples/dupla, EX)  
- Tipo de impelidor (hélice, dispersor, helicoidal/âncora conforme viscosidade)  
- Acessórios obrigatórios e opcionais  
- Alertas técnicos e origem do cálculo  

---

## 2. Motor de Regras (Módulo 2)

Regras configuráveis considerando:

- **Viscosidade (cPs):** ≤500 → agitador baixa viscosidade; 500–3000 → dispersor média; >3000 → helicoidal/âncora.  
- **Base química / produto:** solvente → motor EX, vedação adequada.  
- **Área classificada:** painel EX, botoeira EX.  
- **Corrosividade:** material inox 316 ou compatível.  
- **Abrasividade:** revestimentos reforçados.  
- **Densidade elevada:** revisar potência e torque.  

Regras retornam: `equipment[]`, `specifications{}`, `applied_rules[]` (com `justificativa_tecnica`), e opcionalmente `blocked` + `block_reason`.

---

## 3. Dimensionamento Preliminar (Módulo 3)

**Arquivo:** `server/cpq/sizingEngine.js`

- **Entrada:** viscosity_cps, density, volume_util, temperatura, base_quimica, produto, area_classificada, produto_corrosivo, produto_abrasivo, necessidade_dispersao, necessidade_moagem.  
- **Saída:**  
  - `valor_informado`, `valor_sugerido`, `valor_calculado`  
  - `potencia_sugerida_min`, `potencia_sugerida_max`  
  - `tipo_impelidor`, `tipo_vedacao`, `material_contato_sugerido`, `tipo_acionamento`  
  - `necessidade_camisa_termica`, `necessidade_chiller`  
  - `origem_calculo[]`, `alertas[]`  

Potência é estimada por faixa de volume e ajustada por viscosidade (>3000 cPs +30%) e densidade (≥1,4 +15%).

---

## 4. Compositor de Sistemas (Módulo 4)

Estrutura hierárquica: Equipamentos principais, Tanques, Moinhos, Dispersores, Tubulações, Bombas, Válvulas, Instrumentação, Automação, Painéis, Utilidades, Montagem, Startup, Opcionais, Exclusões.

**Sugestões por tipo de solução** (tabela `cpq_solution_suggestions`):

- **agua_gelada:** chiller, bombas, válvulas, tubulação isolada, tanque expansão.  
- **dispersor:** tanque dispersor, painel, bomba transferência, tubulação.  
- **linha_processo:** dispersor, moinho, automação, tubulação.  

O configurador retorna `composition_suggestions[]` (group_codigo, item_sugerido, ordem).

---

## 5. Motor de Descritivo Técnico (Módulo 5)

**Arquivo:** `server/cpq/descriptiveEngine.js`

Gera texto técnico a partir de: biblioteca do item, parâmetros de processo (viscosidade, densidade, volume, temperatura), resultado do dimensionamento.

**Estilos:** `tecnico_resumido`, `tecnico_detalhado`, `comercial`.

Exemplo (detalhado): *"O [tipo] modelo [modelo] foi dimensionado para processamento de produto químico com viscosidade estimada de X cPs e densidade de Y g/cm³, operando em volume útil de Z litros. Com base nessas premissas, foi considerada configuração com acionamento compatível, sistema de agitação/dispersão adequado à faixa reológica e materiais construtivos compatíveis."*

---

## 6. Engine de Preço (Módulo 6)

Custos: equipamento, componentes, materiais, painel, automação, tubulação, válvulas, montagem, engenharia, startup, contingência.  
Cálculo: subtotal por grupo → custo total → margem → desconto → impostos → total.  
Cenários: com/sem montagem, com/sem startup, nacional/exportação, EXW/CIF.

---

## 7. Template e Placeholders (Módulo 7)

Placeholders suportados no modelo de exibição (proposta):

- `{{proposal.number}}`, `{{proposal.revision}}`, `{{client.name}}`  
- `{{item.model}}`, `{{item.process.viscosity_cps}}`, `{{item.process.density}}`  
- `{{item.specifications.power}}`, `{{item.specifications.volume}}`, `{{item.materials.main}}`  
- `{{totals.grand_total}}`  
- Condicionais: `{{#if item.area_classificada}}` ... `{{/if}}`  

Os itens no `buildDisplayModel` recebem `process` (viscosity_cps, density, volume, temperature, product, base_quimica, area_classificada) e `specifications` (power, volume, main) a partir de `dados_processo` e `specs_json` do item.

---

## 8. Preview e PDF (Módulo 8)

Mesmo HTML/CSS usado no preview e no Puppeteer para PDF. Dados estruturados → JSON → `buildDisplayModel` → `resolveAllPlaceholders` → HTML → preview e PDF idênticos.

---

## 9. Versionamento e Snapshot (Módulo 9)

Proposta: número, revisão, histórico (data, usuário, motivo, alterações). Snapshot imutável (html_rendered, css_snapshot) após envio/travamento.

---

## 10. Multi-idioma e multi-moeda (Módulo 10)

Idiomas: PT, ES, EN. Moedas: BRL, USD, EUR. Campos `idioma` e `moeda` na proposta; templates por idioma.

---

## 11. Integração CRM (Módulo 11)

Fluxo: Lead → Oportunidade → Configuração técnica (CPQ) → Proposta → Negociação → Aprovação → Pedido → Projeto → Engenharia → Execução.  
Ao aprovar: resumo executivo, lista de itens, BOM preliminar, handoff para engenharia.

---

## Modelagem de dados (extensões)

- **cpq_sizing_result** — resultado do dimensionamento (viscosity_cps, density, volume_util, potencia_sugerida_min/max, tipo_impelidor, tipo_vedacao, material_contato_sugerido, alertas_json, origem_calculo).  
- **cpq_solution_suggestions** — sistema_tipo_codigo, group_codigo, item_sugerido, ordem.  
- **cpq_applied_rules_log** — registro de regras aplicadas por projeto (rule_id, rule_nome, justificativa, resultado_json).  
- **cpq_engineering_rules** — colunas `justificativa_tecnica`, `bloqueia`.  
- Itens de proposta: `dados_processo` (JSON), `specs_json` (JSON) para preencher `item.process` e `item.specifications` nos placeholders.

---

## Arquivos principais

| Arquivo | Função |
|---------|--------|
| server/cpq/sizingEngine.js | Dimensionamento por viscosidade, densidade, volume, produto |
| server/cpq/rulesEngine.js | Regras químicas, applied_rules, bloqueia, normalizeParams |
| server/cpq/configurator.js | Orquestra regras + sizing + composition_suggestions |
| server/cpq/descriptiveEngine.js | Descritivo técnico processo químico (estilos) |
| server/propostaCompositionEngine.js | buildDisplayModel com item.process e item.specifications |
| client/.../CPQConfigurator.js | Formulário dados de processo, resultado dimensionamento, regras, composição |

---

## Instruções de uso

1. Acessar **Comercial → CPQ (Configure Price Quote)**.  
2. Escolher **Tipo de solução** e preencher **Dados de processo** (viscosidade em cPs, densidade, volume útil, base, área classificada, corrosivo/abrasivo, etc.).  
3. Clicar em **Aplicar regras e dimensionar**.  
4. Revisar **Dimensionamento preliminar** (potência, impelidor, vedação, material, alertas, origem) e **Regras aplicadas** (com justificativa).  
5. Opcional: revisar **Composição sugerida** por tipo de solução.  
6. Informar título (e cliente) e **Criar projeto e compor itens**.  
7. No detalhe do projeto: adicionar/ajustar itens por grupo, calcular preço, gerar proposta técnica comercial (preview = PDF).
