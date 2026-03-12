# Módulo de Proposta Técnica Comercial – Arquitetura e Roadmap

Documento de referência para o módulo **100% automatizado** de propostas técnicas comerciais no CRM GMP, alinhado à especificação enterprise (cadastro cliente, itens/equipamentos, descritivo técnico dinâmico, condições comerciais, preview = PDF, versionamento, múltiplos templates).

---

## 1. Stack e contexto atual

| Camada        | Especificação      | Atual no projeto |
|---------------|--------------------|------------------|
| Frontend      | React ou Next.js   | React (CRA)      |
| Backend       | Node.js            | Node.js (Express)|
| Banco         | PostgreSQL         | SQLite           |
| PDF           | Puppeteer          | Puppeteer        |
| Template      | HTML + CSS dinâmico| HTML inline no server (gerarHTMLPropostaPremium) |
| Preview       | WYSIWYG = PDF      | Mesmo HTML para preview e PDF (snapshot) |

**Nota:** O projeto usa SQLite. A migração para PostgreSQL pode ser feita depois; o schema abaixo usa tipos compatíveis com ambos.

---

## 2. O que já existe (gap analysis)

### 2.1 Dashboard / listagem
- **Existe:** Listagem (`PropostasList`), filtros por status, tipo, oportunidade, responsável; ações Ver, PDF, Editar, Enviar, Aceitar, Rejeitar, Nova revisão, Clonar, Excluir.
- **Spec adicional:** Status "em revisão", "aprovada internamente", "cancelada"; filtro por data; ação "arquivar".

### 2.2 Cadastro de proposta
- **Existe:** Número, revisão, validade, tipo (comercial/técnica/orçamento/aditivo), cliente, contato, departamento, e-mail, responsável, condições de pagamento, prazo de entrega, garantia, observações, oportunidade_id, expira_em.
- **Spec adicional:** Unidade de negócio, idioma, moeda, incoterm (campos a adicionar).

### 2.3 Itens / escopo
- **Existe:** proposta_itens com descrição, quantidade, unidade, valor unitário/total, codigo_produto, familia_produto; vínculo com produtos (JOIN por código) para nome, imagem, especificações.
- **Spec adicional:** tag, modelo, categoria, descrição resumida, descritivo técnico completo, dados de processo, materiais construtivos, utilidades, opcionais, exclusões, prazo individual por item (campos estruturados + tabela de especificações).

### 2.4 Descritivo técnico dinâmico
- **Existe:** Especificações vêm do produto (especificacoes_tecnicas); texto livre na proposta.
- **Spec adicional:** Campos estruturados (vazão, potência, tensão, etc.), botão "gerar descritivo automático", editor manual sem perder estrutura, biblioteca de descritivos padrão.

### 2.5 Templates
- **Existe:** proposta_templates (nome, versão, html, css, tipo_proposta), proposta_template_config (logo, cores, header/footer, margens); um template premium fixo no código (gerarHTMLPropostaPremium).
- **Spec adicional:** Múltiplos tipos (equipamento individual, linha de processo, água gelada, turn-key, painel, automação, serviços, mista); estrutura de seções configurável; placeholders padronizados.

### 2.6 Preview e PDF
- **Existe:** Preview = HTML servido por GET /propostas/:id/premium; PDF = mesmo HTML via Puppeteer; snapshot (html_rendered) para reprodução; seção 4 em nova página; itens 1–3 da seção 4 na mesma página.
- **Spec adicional:** Reorganizar seções no preview; placeholders no template; assinatura final.

### 2.7 Versionamento
- **Existe:** revisao (numérico), proposta_revisoes (dados_anteriores, dados_novos, mudancas), proposta_status_history; número no formato com REV00/REV01.
- **Spec adicional:** Diff resumido, snapshot do conteúdo por revisão (já próximo com html_rendered).

### 2.8 Regras de negócio
- **Existe:** Total por item e geral; edição só em rascunho; enviar/aceitar/rejeitar/nova revisão/clone; validade e expira_em.
- **Spec adicional:** Impostos configuráveis, subtotal por grupo, travamento ao enviar (já existe via status).

---

## 3. Modelo de dados (schema alvo)

### 3.1 Tabela `propostas` (colunas a adicionar)

| Coluna           | Tipo    | Descrição |
|------------------|---------|-----------|
| idioma           | TEXT    | pt, es, en |
| moeda            | TEXT    | BRL, USD, EUR |
| incoterm         | TEXT    | Ex: FOB, CIF |
| unidade_negocio  | TEXT    | Unidade de negócio |

(Campos como numero_proposta, revisao, tipo_proposta, status, oportunidade_id, template_id, html_rendered, enviada_em, expira_em já existem ou estão em migração.)

### 3.2 Tabela `proposta_itens` (colunas a adicionar)

| Coluna                | Tipo    | Descrição |
|-----------------------|---------|-----------|
| tag                   | TEXT    | Tag do item (ex: P-001) |
| modelo                | TEXT    | Modelo do equipamento |
| categoria             | TEXT    | Categoria do item |
| descricao_resumida    | TEXT    | Descrição curta |
| descritivo_tecnico    | TEXT    | Descritivo técnico completo (gerado ou manual) |
| dados_processo        | TEXT    | Dados de processo |
| materiais_construtivos| TEXT    | Materiais |
| utilidades_requeridas | TEXT    | Utilidades |
| opcionais             | TEXT    | Itens opcionais |
| exclusoes             | TEXT    | Exclusões específicas |
| prazo_individual     | TEXT    | Prazo por item |
| numero_item           | INTEGER | Ordem do item (1, 2, 3…) |

### 3.3 Nova tabela `proposta_item_specs` (especificações estruturadas)

Campos numéricos/unidade para uso por software e geração automática de texto:

| Coluna            | Tipo    | Descrição |
|-------------------|---------|-----------|
| id                | INTEGER | PK |
| proposta_item_id  | INTEGER | FK proposta_itens |
| flow_rate_value   | REAL    | Valor de vazão |
| flow_rate_unit    | TEXT    | m³/h, L/min, etc. |
| power_value       | REAL    | Potência |
| power_unit        | TEXT    | kW, cv |
| voltage_value     | REAL    | Tensão |
| voltage_unit      | TEXT    | V |
| pressure_value    | REAL    | Pressão |
| pressure_unit     | TEXT    | bar, psi |
| temperature_value | REAL    | Temperatura |
| temperature_unit  | TEXT    | °C |
| volume_value      | REAL    | Volume útil |
| volume_unit       | TEXT    | L, m³ |
| viscosity_value   | REAL    | Viscosidade |
| viscosity_unit    | TEXT    | cP |
| density_value     | REAL    | Densidade |
| density_unit      | TEXT    | g/cm³ |
| protection_degree | TEXT    | Grau de proteção (IP) |
| area_classificada | TEXT    | Área classificada |
| outros            | TEXT    | JSON para campos extras |
| created_at        | DATETIME| |

### 3.4 Outras tabelas (spec)

- **proposal_terms** (cláusulas reutilizáveis): id, nome, tipo, conteudo, ativo – pode ser implementada depois.
- **proposal_logs** (auditoria): id, proposal_id, acao, usuario_id, created_at – proposta_status_history já cobre parte; logs genéricos opcional.

---

## 4. Placeholders no template

O template deve aceitar placeholders substituídos na geração do HTML/PDF:

| Placeholder              | Origem |
|--------------------------|--------|
| {{proposal.number}}      | proposta.numero_proposta |
| {{proposal.date}}        | data emissão |
| {{proposal.revision}}    | proposta.revisao (R00, R01) |
| {{client.name}}          | cliente nome_fantasia/razao_social |
| {{client.cnpj}}          | cliente cnpj |
| {{client.contact}}      | proposta cliente_contato |
| {{item.tag}}             | item tag |
| {{item.model}}           | item modelo |
| {{item.quantity}}        | item quantidade + unidade |
| {{item.description}}     | item descrição/descritivo |
| {{item.specifications.flow_rate}} | specs formatado |
| {{item.specifications.power}}    | specs formatado |
| {{commercial.delivery_time}}     | proposta.prazo_entrega |
| {{commercial.payment_terms}}     | proposta.condicoes_pagamento |
| {{totals.grand_total}}   | total geral formatado |

Implementação: função no backend que recebe o HTML e o objeto proposta (com cliente e itens) e substitui cada `{{...}}` pelo valor correspondente antes de enviar ao Puppeteer e ao preview.

---

## 5. Fluxo de criação da proposta

1. Usuário acessa lista de propostas → filtros e ações.
2. "Nova proposta" ou "Proposta automática" (seleção de produtos) → formulário de proposta (cliente, tipo, validade, condições, etc.).
3. Inclusão de itens: seleção de produtos (SelecaoProdutosPremium) ou cadastro manual; para cada item, opção de preencher tag, modelo, categoria, descritivo, specs estruturadas.
4. "Gerar descritivo automático" (futuro): monta texto a partir de proposta_item_specs e campos do produto.
5. Preview: GET /propostas/:id/premium → mesmo HTML que será usado no PDF (com ou sem placeholders já substituídos).
6. Ajustes manuais no texto (campos editáveis no formulário, não no HTML ao vivo).
7. Gerar PDF: GET /propostas/:id/pdf → Puppeteer; grava snapshot na primeira vez.
8. Enviar → status enviada; snapshot preservado; histórico registrado.
9. Nova revisão → revisao++, status volta a rascunho; clone → nova proposta com novo número.

---

## 6. Estrutura de pastas sugerida (frontend)

```
client/src/
  components/
    proposta/
      PropostasList.js      (lista + filtros + ações)
      PropostaForm.js      (criar/editar proposta + itens)
      PropostaDetalhe.js   (detalhe + timeline + ações de ciclo)
      GerarPropostaModal.js (proposta automática por produtos)
      PropostaPreview.js   (iframe ou página de preview, opcional)
      PropostaItemEditor.js (futuro: item com specs + descritivo)
  pages/                   (se usar rotas por página)
  services/
    propostaService.js     (chamadas API)
```

---

## 7. APIs backend (resumo)

- **CRUD:** GET/POST /api/propostas, GET/PUT/DELETE /api/propostas/:id
- **Ciclo de vida:** POST enviar, aceitar, rejeitar, nova-revisao, clone
- **Documento:** GET /propostas/:id/premium (HTML), GET /propostas/:id/pdf (PDF)
- **Itens:** inclusão no PUT da proposta ou endpoints específicos (POST/GET /api/propostas/:id/itens)
- **Revisões:** GET /api/propostas/:id/revisoes, GET /api/propostas/:id/status-history
- **Template:** GET/PUT /api/proposta-template, uploads logo/header/footer
- **Placeholders:** aplicados internamente na função que monta o HTML (não um endpoint separado)

---

## 8. Roadmap em fases

### Fase 1 (curto prazo) – Schema e dados
- Adicionar colunas em `propostas`: idioma, moeda, incoterm, unidade_negocio.
- Adicionar colunas em `proposta_itens`: tag, modelo, categoria, descricao_resumida, descritivo_tecnico, dados_processo, materiais_construtivos, utilidades_requeridas, opcionais, exclusoes, prazo_individual, numero_item.
- Criar tabela `proposta_item_specs` e migração.
- Backend: ler/gravar novos campos no CRUD de propostas e itens.

### Fase 2 – Preview = PDF e placeholders
- Centralizar geração do HTML em uma função que aplica placeholders (proposal, client, items, totals, commercial).
- Garantir que o mesmo HTML seja usado no preview e no PDF (já em grande parte feito; reforçar uso de placeholders no template base).

### Fase 3 – Dashboard e status
- Incluir status "em revisão", "aprovada internamente", "cancelada" onde fizer sentido.
- Filtro por data (período) na listagem.
- Ação "arquivar" (status ou flag arquivado).

### Fase 4 – Descritivo técnico dinâmico
- Tela/componente para editar specs estruturadas por item (flow_rate, power, voltage, etc.).
- Função "gerar descritivo automático" a partir de specs + modelo.
- Biblioteca de descritivos padrão (tabela ou arquivos).

### Fase 5 – Múltiplos templates
- Seleção de template por tipo (equipamento, turn-key, painel, etc.).
- Estrutura de seções configurável por template.
- Editor de cláusulas reutilizáveis.

### Fase 6 – Diferencias
- Autocomplete para materiais, tensões, motores, vazões.
- Suporte multilíngue (PT, ES, EN) em labels e templates.
- Editor de cláusulas e termos reutilizáveis.

---

## 9. Requisito crítico: preview = PDF

- Toda renderização da proposta deve vir do **mesmo** template base (HTML + CSS).
- Preview: servido como HTML (GET /propostas/:id/premium) com os mesmos dados que o PDF.
- PDF: Puppeteer abre o mesmo HTML (ou o snapshot gravado) e gera o PDF.
- Evitar lógica duplicada: uma única função (ex: `gerarHTMLPropostaPremium`) que recebe proposta, itens, config e opção de substituir placeholders; usada tanto na rota de preview quanto na de PDF.

---

## 10. Identidade visual

- Interface: clean, técnica, corporativa, B2B industrial.
- Layout: grid, cards, tipografia moderna, botões claros.
- Destaque para: preview da proposta e botão de gerar/baixar PDF.
- Cores e logo: definidos em proposta_template_config (já existente).

Este documento serve como referência para implementação incremental do módulo de proposta técnica comercial no CRM GMP.

---

## 11. Instruções de implantação (resumo)

1. **Banco:** O servidor aplica migrações ao subir (ALTER TABLE para novas colunas, CREATE TABLE para `proposta_item_specs`). Reinicie o servidor após alterações no `server/index.js`.
2. **Variáveis de ambiente:** Manter `API_URL` (ou base URL do backend) para links de imagens/logo no HTML da proposta e no Puppeteer.
3. **Preview e PDF:** Usar o mesmo HTML gerado por `gerarHTMLPropostaPremium`; placeholders `{{...}}` são substituídos por `substituirPlaceholdersProposta` antes da resposta.
4. **Frontend:** Listagem e filtros já suportam os novos status (em_revisao, aprovada_internamente, cancelada). Formulário de proposta pode ser estendido para exibir/editar idioma, moeda, incoterm, unidade_negocio; formulário de itens para tag, modelo, categoria, descritivo_tecnico, etc.
5. **Próximos passos (Fase 4+):** Tela de edição de specs por item (`proposta_item_specs`), botão "Gerar descritivo automático", múltiplos templates por tipo, editor de cláusulas.

---

## 12. Motor de composição (blocos e regras)

Implementado em `server/propostaCompositionEngine.js`:

- **Blocos técnicos e comerciais:** `buildDisplayModel()` monta `technicalBlocks` e `commercialBlocks` a partir dos dados brutos; tabelas `proposta_blocos` e `proposta_regras_exibicao` permitem persistir blocos e regras.
- **Separação de camadas:** dados brutos (proposta, itens, totais) → **displayModel** (proposal, items, itemsByCategory, totals, blocks) → **texto renderizado** (HTML após placeholders).
- **Regras condicionais:** `evaluateCondition(rule, context)` e `getBlocksToRender(blocks, rules, context)`; regra pode ser `when: 'always' | 'has_field' | 'expr'` com `field` ou `expr`.
- **Placeholders avançados:** `{{path}}`, `{{#if path}}...{{/if}}`, `{{#unless path}}...{{/unless}}`, `{{#each path}}...{{/each}}`; contexto expõe `proposal`, `client`, `commercial`, `items`, `itemsByCategory`, `totals`.
- **Template por família:** na rota de preview e de PDF, a configuração do template é obtida por `familia_produto` da proposta (config com `familia` correspondente ou padrão).
- **Snapshot imutável:** o HTML gravado em `html_rendered` só é atualizado se a proposta estiver em **rascunho** ou ainda não tiver snapshot; após envio, o snapshot não é sobrescrito.
- **Mesmo template para preview e PDF:** o mesmo HTML gerado por `gerarHTMLPropostaPremium` é usado na rota de preview e na geração do PDF (Puppeteer).
- **Agrupamento por categoria:** na seção 4 (Escopo), é exibido um subtítulo quando a categoria técnica/comercial do item muda (`item.categoria` ou `item.familia_produto`); templates customizados podem usar `{{#each itemsByCategory}}` para listar por grupo.
