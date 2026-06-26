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
