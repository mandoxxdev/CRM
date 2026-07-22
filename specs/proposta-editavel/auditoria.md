# Proposta Editável — Auditoria

## Status
Implementado. Log gerado no backend a cada operação de escrita.

---

## O que é registrado

| Tipo de Alteração | `tipo` no log | Campos adicionais |
|---|---|---|
| Campo de contato editado | `campo` | `campo`, `valor_anterior`, `valor_novo` |
| Cláusula criada | `clausula_criada` | `clausula_id`, `valor_novo` (título) |
| Cláusula editada | `clausula_editada` | `campo` (titulo/conteudo), `clausula_id`, `valor_anterior`, `valor_novo` |
| Cláusula removida | `clausula_removida` | `clausula_id`, `valor_anterior` (título) |
| Cláusulas reordenadas | `clausula_reordenada` | `valor_novo` (nova ordem de IDs) |
| Cláusulas inicializadas | `clausulas_inicializadas` | — |
| Reset para padrão | `clausulas_resetadas` | — |
| Produto adicionado | `item_adicionado` | `campo` = nome/descrição do item; `valor_novo` = nome |
| Produto editado | `item_editado` | `campo` = nome/descrição do item; `valor_anterior`/`valor_novo` = **resumo agrupado** dos campos que mudaram (ex.: `"Qtd: 1, Total: 231231"` → `"Qtd: 5, Total: 1156155"`) |
| Produto removido | `item_removido` | `campo` = nome/descrição do item; `valor_anterior` = nome |

---

## Estrutura do Log

```json
{
  "id": 42,
  "proposta_id": 7,
  "usuario_id": 3,
  "usuario_nome": "João Silva",
  "tipo": "campo",
  "campo": "cliente_email",
  "clausula_id": null,
  "valor_anterior": "joao@empresa.com",
  "valor_novo": "contato@empresa.com",
  "created_at": "2026-06-25T14:32:00.000Z"
}
```

---

## Visualização no Frontend

### Painel `HistoricoEdicoes.js`
- Ordenado do mais recente ao mais antigo
- Paginado (20 por página)
- Labels humanizados por tipo (`clausula_editada` → "Cláusula editada")
- Botão "Ver diff" expande antes/depois lado a lado
- `stripHtml()` remove tags ao exibir valores no diff

### Implementado
- [x] Lista paginada
- [x] Diff expansível (antes/depois)
- [x] Exibição do usuário e timestamp

### Não implementado
- [ ] Agrupamento de entradas consecutivas do mesmo usuário
- [ ] Filtros por usuário/tipo/período
- [ ] Controle de permissão (exibir só para admin/comercial)

---

## Auditoria de itens — comportamento e correções (2026-07-21)

Fonte: save principal da proposta (`PUT /api/propostas/:id`). Módulo puro e testável: `server/propostaItensDiff.js` (testes: `server/tests/propostaDiffItens.test.js`, 10/10).

- **Só registra após o save persistir com sucesso** — o bloco de auditoria roda dentro do callback de sucesso (após UPDATE + reinserção dos itens), evitando logar mudanças de um save que falhou (ex.: número de proposta duplicado).
- **Uma entrada por item editado (agrupada)**, com o nome do produto no `campo` — em vez de uma entrada por campo alterado. Evita o "log duplicado".
- **Compara apenas os campos que o formulário envia** (`quantidade`, `unidade`, `valor_unitario`, `valor_total`, `familia_produto`, `regiao_busca`). `modelo`/`descritivo_tecnico` foram removidos da comparação porque o formulário não os edita nem envia — comparar contra o valor do banco gerava edições espúrias.
- **Comparação numérica normalizada** (`250000` == `"250000"` == `250000.0`) — evita falso-positivo por formatação.
- **Itens com `codigo_produto` repetido**: a proposta pode ter vários itens do mesmo produto. O diff agrupa por chave (`codigo_produto` ou `descricao`) e **pareia por posição** (multiconjunto): sobras em "depois" = adicionados, sobras em "antes" = removidos, pares = possíveis edições. (Um `Map` simples colapsava as duplicatas e quebrava a detecção de add/remove.)

### Correções relacionadas (perda de dados) — mesma origem: payload parcial zerando colunas não enviadas
- **Itens:** o formulário não envia `modelo`/`descritivo_tecnico`/`categoria`/`tag`/etc., e o re-INSERT gravava `null` → salvar apagava esses campos dos itens. Corrigido em `mesclarItensPreservandoCampos` (`server/propostaItensDiff.js`): preserva os campos ausentes a partir do item existente. Testes: `server/tests/propostaItensPreservar.test.js` (4/4).
- **Campos de contato (customizações):** o preview editável manda payload parcial (só o campo editado); o `PUT /customizacoes` fazia UPDATE dos 4 campos com `valor || null` → editar só o nome apagava o e-mail. Corrigido em `resolverCamposCustomizacao` (`server/propostaCustomizacoes.js`): preserva os campos ausentes; campo enviado vazio (`''`) limpa (null). Testes: `server/tests/propostaCustomizacoes.test.js` (4/4).

---

## Retenção dos Logs
- Logs são permanentes (sem TTL)
- Não são apagados quando a proposta é editada, revisada ou resetada
- Soft delete da proposta não apaga os logs
