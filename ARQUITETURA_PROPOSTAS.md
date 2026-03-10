# Arquitetura do Módulo de Propostas – CRM GMP

## Visão geral

- **Preview fiel** = HTML/CSS renderizado no navegador.
- **PDF idêntico** = mesmo HTML enviado ao Puppeteer (Chrome headless).
- **Snapshot** = cópia exata do HTML/CSS usada na geração; garante que propostas antigas continuem reproduzíveis mesmo após mudanças no template.

---

## 1. Template (configuração e versões)

### Banco: `proposta_template_config` (atual)

- Configuração do template em uso: logo, cores, margens, componentes (JSON), variáveis técnicas, imagens de cabeçalho/rodapé.
- Uma linha por “família” ou padrão geral; o sistema usa a mais recente.

### Banco: `proposta_templates` (novo – versionado)

| Coluna         | Tipo    | Descrição                                      |
|----------------|---------|------------------------------------------------|
| id             | INTEGER | PK                                             |
| nome           | TEXT    | Nome do template                               |
| versao         | TEXT    | Ex.: `"1.0"`                                   |
| html           | TEXT    | HTML do template (opcional; para templates raw) |
| css            | TEXT    | CSS do template (opcional)                     |
| schema_campos  | TEXT    | JSON com definição dos campos                  |
| tipo_proposta  | TEXT    | `comercial` \| `tecnica` \| `orcamento` \| `aditivo` |
| is_padrao      | INTEGER | 0/1                                            |
| created_at     | DATETIME|                                                |
| updated_at     | DATETIME|                                                |

- Uso futuro: templates versionados (Tiptap + Handlebars); hoje o fluxo principal continua com `proposta_template_config` + `gerarHTMLPropostaPremium` / componentes.

---

## 2. Proposta

### Banco: `propostas`

Além dos campos já existentes (cliente, número, título, itens, valores, etc.), passam a existir:

| Coluna          | Tipo    | Descrição |
|-----------------|---------|-----------|
| template_id     | INTEGER | FK para `proposta_templates` (opcional) |
| template_versao  | TEXT    | Versão do template no momento da geração |
| html_rendered   | TEXT    | **Snapshot:** HTML completo usado na última geração (preview/PDF) |
| css_snapshot    | TEXT    | **Snapshot:** trecho de CSS extraído (para auditoria/diff) |
| pdf_gerado_at   | DATETIME| Última vez que o PDF foi gerado e o snapshot gravado |

- **Dados preenchidos** = já existentes (cliente_id, titulo, proposta_itens, condicoes_pagamento, etc.).
- **PDF** = gerado sob demanda com Puppeteer; não é armazenado em coluna (opcional no futuro: salvar em arquivo e guardar `pdf_path`).

---

## 3. Snapshot (reprodução no tempo)

Quando o PDF é gerado:

1. O sistema monta o HTML (a partir do template atual + dados da proposta).
2. Puppeteer gera o PDF a partir desse HTML.
3. Esse mesmo HTML é gravado em `propostas.html_rendered` e o CSS (extraído do `<style>`) em `propostas.css_snapshot`.
4. `pdf_gerado_at` é atualizado.

Nas próximas vezes:

- **GET `/api/propostas/:id/premium`**  
  - Se existir `html_rendered`, a resposta é esse HTML (apenas ajuste de URLs de imagens para o host atual).  
  - Assim, o preview fica **igual ao PDF já gerado**.

- **GET `/api/propostas/:id/pdf`**  
  - Se existir `html_rendered`, o PDF é gerado **só** a partir desse HTML (sem usar o template atual).  
  - Assim, o PDF permanece **reproduzível** mesmo que o template mude depois.

Resumo: **uma proposta gerada mantém para sempre o mesmo preview e o mesmo PDF**, independentemente de alterações futuras no template.

---

## 4. Fluxo técnico

```
[Usuário cria/edita proposta] → dados em propostas + proposta_itens
         ↓
[Ver proposta] → GET /api/propostas/:id/premium
         ↓
   ┌─────────────────────────────────────┐
   │ Existe html_rendered?                │
   │  SIM → retorna snapshot (URLs fixas) │
   │  NÃO → gera HTML do template atual   │
   └─────────────────────────────────────┘
         ↓
[Gerar PDF] → GET /api/propostas/:id/pdf
         ↓
   ┌─────────────────────────────────────┐
   │ Existe html_rendered?                │
   │  SIM → usa snapshot no Puppeteer     │
   │  NÃO → gera HTML → Puppeteer →       │
   │        grava html_rendered + css_     │
   │        snapshot + pdf_gerado_at      │
   └─────────────────────────────────────┘
         ↓
   PDF enviado ao cliente
```

---

## 5. Stack recomendado (evolução futura)

- **Editor de template:** Tiptap (blocos controlados).
- **Placeholders:** Handlebars (`{{cliente.nome}}`, `{{itens}}`, etc.).
- **Preview:** React (ou página HTML servida pelo backend).
- **PDF:** Puppeteer (HTML + CSS iguais ao preview).
- **Word (se necessário):** Docxtemplater + PizZip.

Com isso, mantém-se: **preview = PDF**, sem conversão “Word → PDF” que costuma quebrar layout (quebra de página, tabelas, fontes, margens, cabeçalho/rodapé).

---

## 6. O que evitar

- Evitar montar proposta em editor Word-like e depois converter para PDF com bibliotecas genéricas (quebra de página, tabelas, logos, fontes e margens costumam sair diferentes).
- Para **fidelidade**, o caminho estável é: **HTML/CSS + Puppeteer**.

---

## 7. Resumo

| Conceito        | Implementação no CRM GMP |
|-----------------|---------------------------|
| Template        | `proposta_template_config` (+ `proposta_templates` para versões) |
| Proposta        | `propostas` + `proposta_itens` + snapshot |
| Snapshot        | `html_rendered` + `css_snapshot` + `pdf_gerado_at` |
| Preview         | GET `/propostas/:id/premium` (usa snapshot se houver) |
| PDF             | GET `/propostas/:id/pdf` (Puppeteer; usa snapshot se houver; grava snapshot na 1ª geração) |
| Reprodução      | Propostas antigas continuam com o mesmo HTML/PDF mesmo após mudar o template. |
