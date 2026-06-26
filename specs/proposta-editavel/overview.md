# Proposta Editável — Visão Geral

## Objetivo
Permitir que o time comercial edite campos específicos da proposta diretamente na tela de visualização (preview), sem precisar voltar ao formulário principal. As edições persistem e refletem tanto no preview quanto no PDF baixado.

## Status atual
**Feature implementada e funcional.** Pendências listadas em `tasks.md` (Fases 12 e 13).

---

## Problema Resolvido
- O preview abria como HTML estático sem possibilidade de edição
- Dados de contato (email, telefone, empresa) às vezes precisavam ser ajustados por proposta sem alterar o cadastro do cliente
- As cláusulas eram fixas no código e não podiam ser negociadas por proposta
- Não havia rastreamento de quem alterou o quê no documento

---

## O que foi construído

### Banco de dados (3 novas tabelas)
| Tabela | Propósito |
|---|---|
| `proposta_customizacoes` | Override de campos de contato por proposta, sem alterar dados originais |
| `proposta_clausulas` | Cláusulas editáveis por proposta; quando existem, substituem as cláusulas padrão |
| `proposta_edicoes_log` | Histórico completo de alterações com usuário, timestamp, valor anterior e novo |

### Backend (novas rotas)
- `GET/PUT /api/propostas/:id/customizacoes`
- `GET/POST/PUT/DELETE /api/propostas/:id/clausulas/:id`
- `PUT /api/propostas/:id/clausulas/reordenar`
- `POST /api/propostas/:id/clausulas/inicializar`
- `POST /api/propostas/:id/clausulas/resetar`
- `GET /api/propostas/:id/edicoes-log`

### Frontend (3 novos componentes)
| Componente | Função |
|---|---|
| `PropostaPreviewEditavel` | Tela principal com toolbar, iframe do HTML da proposta, painéis laterais |
| `EditorClausulas` | Accordion de cláusulas com edição, reordenação, criação e deleção |
| `HistoricoEdicoes` | Painel lateral com log paginado e diff antes/depois |

---

## Decisões de implementação (divergências do spec original)

| Spec original | O que foi implementado | Motivo |
|---|---|---|
| `dangerouslySetInnerHTML` para o HTML da proposta | `<iframe sandbox="allow-same-origin allow-scripts">` | O template V2 usa JS de paginação que precisa rodar; iframe isola estilos e scripts |
| Drag-and-drop para reordenar cláusulas | Botões ↑↓ | Mais simples, suficiente, sem dependências externas |
| `contenteditable` direto nas cláusulas dentro do documento | Painel lateral (accordion) separado do documento | Cláusulas ficam no iframe sem acesso direto do React |
| Auto-save só no botão "Salvar" | Auto-save no blur de cada campo de cláusula | Evita perda de dados; campos de contato ainda exigem botão salvar explícito |
| Cláusulas padrão em `condicoesNano4You.js` | Cláusulas padrão em `server/clausulasDefault.js` | Arquivo renomeado e migrado para o servidor |

---

## Arquitetura da seção 5 (cláusulas)

```
proposta_clausulas (vazia) → usa clausulasDefault.js (padrão global)
proposta_clausulas (com dados) → usa apenas as cláusulas da tabela para aquela proposta
```

Ao clicar em "Inicializar cláusulas para edição", as cláusulas padrão são copiadas para a tabela da proposta. A partir daí só as da tabela são usadas.

---

## Seção 4.0 — Descritivo dos Equipamentos

Seção gerada dinamicamente no template V2 a partir dos itens da proposta. Não faz parte do sistema de cláusulas editáveis.

**Diagnóstico (Jun/2026):** A seção vinha em branco porque:
1. A maioria dos itens não tem `codigo_produto` vinculado a um produto do catálogo
2. O único item com produto vinculado tinha `descricao` vazia no cadastro
3. Nenhum item tinha `descritivo_tecnico` ou `descricao_resumida` preenchidos

**Fixes aplicados:**
- Campo vazio mostra mensagem informativa em vez de `—`
- Imagem do produto aparece acima da tabela de dados (melhora uso do espaço)

**Pendente:** Adicionar campo `descritivo_tecnico` editável na tela de cadastro de produtos.
