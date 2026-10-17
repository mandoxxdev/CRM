# Proposta Editável — Backend

## Novas Tabelas

### `proposta_customizacoes`
Armazena overrides de campos por proposta. Não altera os dados originais do cliente.

```sql
CREATE TABLE proposta_customizacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposta_id INTEGER NOT NULL UNIQUE,
  -- Campos de contato editáveis
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  cliente_contato TEXT,
  -- Metadados
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);
```

### `proposta_clausulas`
Cláusulas customizadas por proposta. Quando existir ao menos uma entrada para uma proposta, as cláusulas padrão (`condicoesNano4You.js`) são ignoradas.

```sql
CREATE TABLE proposta_clausulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposta_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE
);
```

### `proposta_edicoes_log`
Auditoria campo a campo de todas as alterações feitas no preview editável.

```sql
CREATE TABLE proposta_edicoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposta_id INTEGER NOT NULL,
  usuario_id INTEGER,
  usuario_nome TEXT,
  tipo TEXT NOT NULL, -- 'campo' | 'clausula_criada' | 'clausula_editada' | 'clausula_removida' | 'clausula_reordenada'
  campo TEXT,         -- ex: 'cliente_email', 'clausula_titulo', 'clausula_conteudo'
  clausula_id INTEGER,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposta_id) REFERENCES propostas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

---

## Novas Rotas

### Customizações de campos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/propostas/:id/customizacoes` | Busca customizações salvas da proposta |
| PUT | `/api/propostas/:id/customizacoes` | Salva/atualiza campos customizados |

**Body do PUT:**
```json
{
  "cliente_nome": "Empresa XYZ Ltda",
  "cliente_email": "contato@xyz.com",
  "cliente_telefone": "(11) 99999-9999",
  "cliente_contato": "João Silva"
}
```

### Cláusulas por proposta

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/propostas/:id/clausulas` | Lista cláusulas da proposta (customizadas ou padrão) |
| POST | `/api/propostas/:id/clausulas` | Cria nova cláusula |
| PUT | `/api/propostas/:id/clausulas/:clausulaId` | Edita cláusula existente |
| DELETE | `/api/propostas/:id/clausulas/:clausulaId` | Remove cláusula (soft delete: ativo=0) |
| PUT | `/api/propostas/:id/clausulas/reordenar` | Salva nova ordem das cláusulas |
| POST | `/api/propostas/:id/clausulas/resetar` | Volta para as cláusulas padrão (apaga customizadas) |

### Auditoria

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/propostas/:id/edicoes-log` | Lista histórico de edições da proposta |

---

## Salvar a proposta: `PUT /api/propostas/:id` (Etapa 138)

O corpo pode ser **parcial**. Regra por chave (`montarSetParcial`, `server/atualizacaoParcial.js`):

| Chave no corpo | Efeito |
|---|---|
| ausente | a coluna nem entra no `UPDATE` (fica como está) |
| presente, inclusive `null`/`''` | grava com a transformação de sempre (`|| ''` nos textos de condição/prazo/garantia/observações, `|| null` nos outros, `|| 0` em valor e margem) |
| `itens` ausente | os itens não são tocados (nem apagados, nem reinseridos, nem auditados) |
| `itens` presente | apaga e reinsere com `mesclarItensPreservandoCampos`, religa as variáveis manuais (`[]`/`null` apaga todos) |

Exceções: `html_rendered` é sempre limpo (o retrato do PDF só é regravado com ele vazio); `probabilidade` nula/vazia mantém (`COALESCE`); `responsavel_id` vazio/ausente = o gravado, ou quem salva; `numero_proposta`, `revisao` e `responsavel_id` só entram quando mudam. A revisão sobe só se `itens` ou `valor_total` vieram e mudaram; o sufixo `REVnn` e o `proposta_revisoes` usam os valores efetivos (o do corpo, senão o gravado). Trocar `cliente_id` apaga `cliente_contato`/`cliente_telefone`/`cliente_email`/`projeto_id` que não vieram.

Recusas, nesta ordem: 404 *"Proposta não encontrada"* → 400 *"Título é obrigatório"* (título presente vazio ou só espaços) → 400 *"Motivo da não venda é obrigatório quando a proposta está perdida/rejeitada."* → 403 *"Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada."* → (na gravação) 409 `PROPOSTA_ALTERADA` *"A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo."* quando o corpo traz status, margem, motivo ou data de fechamento e um desses que **não** veio mudou entre a leitura e a gravação. As regras do motivo, do desconto e da data de fechamento automática usam o valor efetivo e só rodam quando um dos campos delas veio.

O formulário (`client/src/components/proposta/PropostaForm.js`) monta o corpo em `montarPayloadProposta` (`payloadProposta.js`) e manda `null` — não `undefined` — para *Tipo*, *Data de fechamento*, oportunidade e expiração vazios.

## Lógica de Renderização

### Preview (`/api/propostas/:id/premium`)
Ao gerar o HTML, verificar se existem customizações:
1. Buscar `proposta_customizacoes` para a proposta
2. Se existir, sobrescrever os campos de contato com os valores customizados
3. Verificar se existem entradas em `proposta_clausulas` para a proposta
4. Se existir, usar as cláusulas customizadas em vez das do `condicoesNano4You.js`

### PDF (`/api/propostas/:id/pdf`)
Aplicar a mesma lógica acima antes de gerar o PDF via PDFKit.

---

## Lógica de Auditoria
Toda vez que `PUT /customizacoes` ou qualquer rota de cláusula for chamada:
- Comparar valor anterior (busca antes de salvar) com valor novo
- Inserir uma entrada em `proposta_edicoes_log` por campo alterado
- Registrar `usuario_id` e `usuario_nome` do token JWT da requisição

---

## Inicialização de Cláusulas
Quando o usuário editar cláusulas pela primeira vez em uma proposta que ainda não tem customizações:
- Copiar todas as cláusulas padrão de `condicoesNano4You.js` para `proposta_clausulas`
- A partir daí, usar apenas as da tabela para aquela proposta
