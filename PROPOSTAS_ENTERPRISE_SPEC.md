# Módulo de Propostas / Quotes – Especificação Enterprise (Salesforce-like)

## 1. Comparativo com o mercado (Salesforce CPQ, HubSpot, Pipedrive)

| Recurso | Salesforce CPQ / Mercado | CRM GMP (alvo) |
|--------|---------------------------|----------------|
| **Ciclo de vida** | Draft → Sent → Viewed → Accepted/Rejected/Expired | ✅ Mesmo fluxo |
| **Vinculação a Oportunidade** | Quote ligado a Opportunity | ✅ proposta.oportunidade_id |
| **Versionamento** | Múltiplas versões (revisões) do mesmo quote | ✅ revisao + proposta_status_history |
| **Itens (linhas)** | Product, Qty, Unit Price, Discount, Total | ✅ proposta_itens (já existe) |
| **Template versionado** | Document templates com versão | ✅ proposta_templates + snapshot |
| **Snapshot ao enviar** | Congelar conteúdo no envio | ✅ html_rendered ao gerar PDF/enviar |
| **Aprovação por desconto** | Approval workflow para descontos acima de X% | ✅ aprovacoes (já existe) |
| **Assinatura digital** | E-signature no documento | ✅ assinaturas (já existe) |
| **Preview = PDF** | Documento idêntico ao enviado | ✅ Puppeteer + snapshot |
| **Clone / Nova revisão** | Duplicar quote, criar nova versão | ✅ APIs clone + nova-revisao |
| **Auditoria** | Quem alterou, quando, o quê | ✅ proposta_status_history |
| **Tipos de documento** | Quote, Proposal, Amendment | ✅ tipo_proposta: comercial | tecnica | orcamento | aditivo |

---

## 2. Ciclo de vida da proposta (status)

```
[rascunho] → [enviada] → [visualizada]? → [aceita] | [rejeitada] | [expirada]
     ↑            |            |                |
     |            |            |                └→ (opcional) converter em OS/pedido
     |            |            └→ cliente abriu o link/documento
     |            └→ enviada_em preenchido; snapshot gravado (HTML/PDF congelado)
     └── nova revisão volta para rascunho (revisao++)
```

- **rascunho** – Editável; ainda não enviada ao cliente.
- **enviada** – Enviada (e-mail/link); conteúdo congelado (snapshot); pode ver PDF/preview.
- **visualizada** – Cliente visualizou (tracking opcional via link).
- **aceita** – Cliente aceitou (assinatura ou registro manual).
- **rejeitada** – Cliente rejeitou ou proposta cancelada.
- **expirada** – Passou da data de validade sem aceite.

Transições permitidas (exemplo):

- rascunho → enviada (ação “Enviar”)
- enviada → visualizada (opcional, por evento)
- enviada → aceita | rejeitada | expirada
- Qualquer → rascunho apenas via “Nova revisão” (cria novo “estado” com revisao++)

---

## 3. Modelo de dados (banco)

### 3.1 Tabela `propostas` (estendida)

Além dos campos atuais, incluir:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| oportunidade_id | INTEGER | FK oportunidades (opcional) |
| tipo_proposta | TEXT | 'comercial' \| 'tecnica' \| 'orcamento' \| 'aditivo' |
| status | TEXT | 'rascunho' \| 'enviada' \| 'visualizada' \| 'aceita' \| 'rejeitada' \| 'expirada' |
| enviada_em | DATETIME | Quando foi enviada ao cliente |
| expira_em | DATETIME | Validade (pode ser = validade em formato date) |
| template_id | INTEGER | FK proposta_templates (opcional) |
| template_versao | TEXT | Versão do template no momento da geração |
| html_rendered | TEXT | Snapshot HTML (reprodução fiel) |
| css_snapshot | TEXT | Snapshot CSS |
| pdf_gerado_at | DATETIME | Última geração de PDF |

(Já existem: template_id, template_versao, html_rendered, css_snapshot, pdf_gerado_at na migração anterior.)

### 3.2 Tabela `proposta_status_history` (auditoria)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | INTEGER | PK |
| proposta_id | INTEGER | FK propostas |
| status_anterior | TEXT | |
| status_novo | TEXT | |
| usuario_id | INTEGER | Quem fez a alteração |
| observacao | TEXT | Opcional |
| created_at | DATETIME | |

Registrar toda troca de status (rascunho→enviada, enviada→aceita, etc.).

### 3.3 Tabela `proposta_templates`

(Já criada anteriormente: nome, versao, html, css, schema_campos, tipo_proposta.)

### 3.4 Tabelas existentes utilizadas

- **proposta_itens** – Linhas da proposta (produto, qtd, preço, total).
- **aprovacoes** – Aprovação de desconto (proposta_id).
- **assinaturas_digitais** – Assinatura na proposta (proposta_id).
- **proposta_revisoes** – Histórico de revisões (dados_anteriores, dados_novos).
- **proposta_followups** – Follow-ups ligados à proposta.

---

## 4. APIs (REST, consistentes)

### 4.1 CRUD (existentes, manter)

- `GET /api/propostas` – Lista (filtros: status, cliente_id, oportunidade_id, responsavel_id).
- `GET /api/propostas/:id` – Detalhe.
- `POST /api/propostas` – Criar.
- `PUT /api/propostas/:id` – Atualizar (apenas se status = rascunho).
- `DELETE /api/propostas/:id` – Excluir (apenas rascunho ou regra de negócio).

### 4.2 Documento / Preview / PDF

- `GET /api/propostas/:id/premium` – HTML do preview (usa snapshot se existir).
- `GET /api/propostas/:id/pdf` – Gera PDF (Puppeteer); grava snapshot na primeira geração; se já existir snapshot, usa-o.

### 4.3 Ciclo de vida (novas)

- `POST /api/propostas/:id/enviar` – Transição para **enviada**. Opcional: gerar e gravar snapshot, enviar e-mail (futuro). Atualiza `enviada_em`, `status`, grava em `proposta_status_history`.
- `POST /api/propostas/:id/marcar-visualizada` – status → **visualizada** (opcional).
- `POST /api/propostas/:id/aceitar` – status → **aceita**. Body: opcional observação, assinatura (se já não tiver).
- `POST /api/propostas/:id/rejeitar` – status → **rejeitada**. Body: motivo_rejeicao, observação.
- `POST /api/propostas/:id/nova-revisao` – Cria “nova revisão”: incrementa `revisao`, pode duplicar proposta ou manter mesmo id com novo status rascunho e limpar snapshot (conteúdo novo a ser gerado). Regra de negócio: proposta enviada/aceita/rejeitada pode ter nova revisão como novo rascunho.
- `POST /api/propostas/:id/clone` – Clona proposta (novo id, numero_proposta novo, status rascunho, itens copiados). Retorna a nova proposta.

### 4.4 Outros (existentes)

- `GET /api/propostas/:id/revisoes`
- `GET /api/propostas/:id/followups`, `POST /api/propostas/:id/followups`
- `GET /api/propostas/gerar-numero/:cliente_id`
- Template: `GET/POST /api/proposta-template`, list, save-as, uploads (logo, header, footer, contrato).
- Anexo cotação, assinaturas: já existem.

---

## 5. Regras de negócio (melhores práticas)

1. **Só editar em rascunho** – PUT e alteração de itens permitidos apenas se `status = 'rascunho'`.
2. **Snapshot ao enviar** – Ao marcar como enviada (ou ao gerar PDF pela primeira vez), gravar `html_rendered` (e opcionalmente `css_snapshot`) para reprodução futura.
3. **Preview = PDF** – Sempre que possível usar o mesmo HTML (snapshot ou gerado) no preview e no Puppeteer.
4. **Aprovação de desconto** – Manter integração com tabela `aprovacoes`; descontos acima de X% podem exigir aprovação antes de enviar.
5. **Validade** – Job ou checagem ao abrir: se `expira_em` < hoje e status = enviada/visualizada → atualizar para **expirada** (e registrar em status_history).
6. **Número da proposta** – Único por cliente ou global (já existe gerar-numero).
7. **Oportunidade** – Se preenchido `oportunidade_id`, listar propostas da oportunidade e no funil.

---

## 6. UX sugerida (frontend)

### 6.1 Listagem (tipo Salesforce)

- Filtros: status, cliente, período, responsável, oportunidade.
- Colunas: Número, Cliente, Título, Valor, Status, Data envio, Validade, Ações.
- Ações por linha: Ver, Editar (se rascunho), Enviar (se rascunho), PDF, Nova revisão, Clonar, Aceitar/Rejeitar (se enviada).

### 6.2 Criação / Edição (wizard ou aba única)

1. **Cabeçalho** – Cliente, Oportunidade (opcional), Título, Tipo (comercial/técnica/orçamento/aditivo), Validade, Condições, Prazo, Garantia.
2. **Itens** – Adicionar produtos/serviços (catálogo), quantidade, preço, desconto, total por linha; totais no rodapé.
3. **Preview** – Iframe ou nova aba com `/api/propostas/:id/premium` (ou preview em tempo real com dados do form).
4. **Ações** – Salvar rascunho, Enviar (→ POST enviar), Gerar PDF, Nova revisão, Clonar.

### 6.3 Detalhe da proposta

- Card com dados principais; histórico de status (timeline); follow-ups; assinaturas; botões conforme status (Enviar, Aceitar, Rejeitar, PDF, Nova revisão, Clonar).

### 6.4 Templates

- Configuração de template (ConfigTemplateProposta) por família/tipo; editor de blocos (EditorTemplateProposta); versionamento em `proposta_templates` para evolução futura (Tiptap + Handlebars).

---

## 7. Resumo de implementação (fases)

| Fase | Descrição | Status |
|------|------------|--------|
| **1** | Schema: oportunidade_id, tipo_proposta, enviada_em, expira_em; tabela proposta_status_history; migração. | ✅ Implementado |
| **2** | APIs: POST enviar, aceitar, rejeitar, nova-revisao, clone; GET status-history; registro em proposta_status_history. | ✅ Implementado |
| **3** | Regra: só permitir edição (PUT) quando status = rascunho. | ✅ Implementado |
| **4** | Frontend: listagem com filtros (status, oportunidade_id, tipo_proposta); botões Enviar, Aceitar, Rejeitar, Nova revisão, Clonar; detalhe com timeline. | Pendente |
| **5** | (Opcional) Job expira_em → expirada; e-mail ao enviar; link de visualização com marcar-visualizada; conversão proposta → OS/pedido. | Pendente |

---

## 8. APIs implementadas (backend)

- `GET /api/propostas?status=&oportunidade_id=&tipo_proposta=` – Listagem com filtros.
- `GET /api/propostas/:id/status-history` – Histórico de mudanças de status (auditoria).
- `POST /api/propostas/:id/enviar` – rascunho → enviada.
- `POST /api/propostas/:id/marcar-visualizada` – enviada → visualizada.
- `POST /api/propostas/:id/aceitar` – enviada/visualizada → aceita (body: `{ observacao }`).
- `POST /api/propostas/:id/rejeitar` – enviada/visualizada → rejeitada (body: `{ motivo_rejeicao, observacao }`).
- `POST /api/propostas/:id/nova-revisao` – Volta para rascunho, incrementa revisão, limpa snapshot.
- `POST /api/propostas/:id/clone` – Clona proposta (novo id, novo número, status rascunho, itens copiados).
- `PUT /api/propostas/:id` – Aceita `oportunidade_id`, `tipo_proposta`, `expira_em`; **só permite edição se status = rascunho**.
- `POST /api/propostas` – Aceita `oportunidade_id`, `tipo_proposta`, `expira_em`.

Este documento serve como referência para a reformulação completa do módulo de emissão de propostas em padrão enterprise (Salesforce-like).
