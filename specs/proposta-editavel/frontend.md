# Proposta Editável — Frontend

## Fluxo do Usuário
1. Usuário clica no ícone de olho na lista de propostas
2. Nova aba abre com a rota `/comercial/propostas/:id/preview-editavel`
3. No topo aparece a **barra de ferramentas** com os controles de edição
4. O HTML da proposta é renderizado dentro de um `<iframe>`
5. Usuário edita campos e/ou cláusulas
6. Campos de contato: salvar com o botão "Salvar alterações"
7. Cláusulas: salvas automaticamente no blur de cada campo

---

## Barra de Ferramentas (topo)
Fixa no topo, fundo escuro (`#1e293b`):

```
[ Proposta #001-2026 ]  [ Editar campos ]  [ Cláusulas ]  [ Histórico ]  [ Salvar Alterações ]
```

- **Editar campos**: ~~toggle~~ — na implementação atual, `ativarEdicao()` é chamado automaticamente no `onLoad` do iframe; os campos de contato ficam sempre editáveis (borda amarela sempre visível)
- **Cláusulas**: abre painel lateral com o `EditorClausulas`
- **Histórico**: abre painel lateral com o `HistoricoEdicoes`
- **Salvar Alterações**: envia as mudanças via `PUT /customizacoes` (desabilitado se nada mudou)

---

## Campos Editáveis

Na **capa** (template V2), os atributos `data-edit` já estão no HTML gerado pelo servidor (em `<span>` dentro dos `<p>` da cover-client-info). Na **tabela de contratante** das páginas internas, são injetados via `injetarAtributosEdicao()` que lê `<th>/<td>` da tabela.

| Campo | `data-edit` |
|---|---|
| Nome/Razão Social | `cliente_nome` |
| E-mail | `cliente_email` |
| Telefone | `cliente_telefone` |
| Contato | `cliente_contato` |

- Em modo edição: fundo `#fffde7` + borda `2px dashed #f59e0b`
- Em modo visualização: aparência normal

---

## Editor de Cláusulas (`EditorClausulas.js`)

### Estrutura visual (accordion)
Cada cláusula é um card colapsado. Clicar expande o painel de edição:

```
┌─────────────────────────────────────────────────┐
│ [↑][↓]  5.1 PRAZO DE ENTREGA          [🗑] [›] │  ← fechado
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ [↑][↓]  5.2 TRANSPORTE E EMBALAGEM    [🗑] [↓] │  ← aberto
│─────────────────────────────────────────────────│
│ TÍTULO                                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ 5.2 TRANSPORTE E EMBALAGEM                 │ │
│ └─────────────────────────────────────────────┘ │
│ CONTEÚDO                                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ A CONTRATADA deverá promover...             │ │
│ │ (cresce com o texto)                        │ │
│ └─────────────────────────────────────────────┘ │
│ Salvo automaticamente ao sair do campo          │
└─────────────────────────────────────────────────┘
```

### Comportamentos
- Apenas um card expandido por vez
- Ao adicionar nova cláusula, já abre expandida automaticamente
- Textarea cresce com o conteúdo (`scrollHeight`) sem barra de scroll
- `scrollIntoView` após crescer para manter visibilidade
- Auto-save no blur (título ou conteúdo)
- Conteúdo HTML do banco convertido para texto legível ao carregar (`htmlToText`)
- Conteúdo plain text salvo → servidor converte para `<p>` no template

### Barra de ações (topo do painel)
```
[ + Adicionar cláusula ]                    [ ↺ Resetar para padrão ]
```

### Estado inicial
Proposta sem cláusulas customizadas → mostra tela de inicialização:
```
"Esta proposta ainda usa as cláusulas padrão."
[ Inicializar cláusulas para edição ]
```
Ao inicializar, as cláusulas padrão de `clausulasDefault.js` são copiadas para a proposta.

---

## Painel de Histórico de Edições (`HistoricoEdicoes.js`)

- Painel lateral (slide-in da direita, sobre overlay escuro)
- Log paginado (20 por página) do mais recente ao mais antigo
- Cada entrada: campo/tipo alterado, usuário, data/hora
- Botão "Ver diff" expande antes/depois para alterações com conteúdo

---

## Iframe — Decisão de Arquitetura

O HTML da proposta é renderizado num `<iframe>` com:
```jsx
sandbox="allow-same-origin allow-scripts"
```

**Por que iframe e não `dangerouslySetInnerHTML`:**
- O template V2 usa JS de paginação que redistribui os blocos de conteúdo entre páginas
- `dangerouslySetInnerHTML` não executa scripts
- `allow-same-origin` permite ler o DOM do iframe para injetar `contenteditable`
- `allow-scripts` permite o JS de paginação rodar

**Limitação:** As cláusulas ficam dentro do iframe, fora do alcance direto do React — por isso o editor de cláusulas é um painel lateral separado e não inline.

---

## Arquivos

### Criados
- `client/src/components/proposta/PropostaPreviewEditavel.js`
- `client/src/components/proposta/PropostaPreviewEditavel.css`
- `client/src/components/proposta/EditorClausulas.js`
- `client/src/components/proposta/EditorClausulas.css`
- `client/src/components/proposta/HistoricoEdicoes.js`
- `client/src/components/proposta/HistoricoEdicoes.css`
- `server/clausulasDefault.js`

### Modificados
- `client/src/App.js` — nova rota lazy-loaded
- `client/src/routes/lazyModules.js` — export lazy do componente
- `client/src/components/proposta/PropostasList.js` — botão de olho abre nova rota

---

## Pendências

- [ ] Controle de permissão: botão Histórico visível só para admin/comercial/dono da proposta
- [ ] Filtros no histórico: por usuário, tipo, período
- [ ] Agrupamento de entradas consecutivas do mesmo usuário no histórico
