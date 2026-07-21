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
| Produto adicionado | `item_adicionado` | `valor_novo` (nome/descrição do item) |
| Produto editado | `item_editado` | `campo` (quantidade/valor_unitario/valor_total/modelo/descritivo_tecnico), `valor_anterior`, `valor_novo` |
| Produto removido | `item_removido` | `valor_anterior` (nome/descrição do item) |

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

## Retenção dos Logs
- Logs são permanentes (sem TTL)
- Não são apagados quando a proposta é editada, revisada ou resetada
- Soft delete da proposta não apaga os logs
