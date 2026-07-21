# Spec: Lentidão em `GET /api/propostas` (listagem)

**Data:** 2026-07-21
**Status:** Frente A — a executar agora · Frente B — documentada, não executar
**Arquivo afetado:** `server/index.js`

---

## Problema

A rota de listagem `GET /api/propostas` demora **muito** para carregar em produção
(`https://systemgmp.online/api/propostas`).

### Causa raiz

O handler (`server/index.js:5032`) monta a query com `SELECT pr.*`:

```js
let query = `SELECT pr.*, c.razao_social as cliente_nome, ...
             FROM propostas pr
             LEFT JOIN clientes c ON pr.cliente_id = c.id
             ...
             WHERE 1=1`;
// ...
query += ' ORDER BY pr.created_at DESC';
db.all(query, params, (err, rows) => { res.json(rows || []); });
```

O `pr.*` arrasta **todas** as colunas da tabela `propostas`, incluindo duas colunas
`TEXT` gigantes que a listagem **nunca usa**:

- **`html_rendered`** — o HTML completo renderizado da proposta (com imagens inline em base64).
- **`css_snapshot`** — o snapshot de CSS da proposta.

Essas colunas só são consumidas na tela de **preview/detalhe**
(`client/src/components/PreviewPropostaEditavel.js`), que carrega via
`GET /api/propostas/:id` — não na lista.

### Evidência (medida no banco local, `server/data/database.sqlite`)

Com apenas **6 propostas** cadastradas, o payload da rota é dominado por:

| Coluna | Peso |
|---|---|
| `html_rendered` | **4,65 MB** (média 794 KB/linha, uma linha com 4,6 MB) |
| `css_snapshot` | **0,75 MB** |
| Tudo que a lista precisa (título, cliente, valor, status, datas) | ~0 MB |
| **Total transferido** | **~5,4 MB para 6 linhas** |

Em produção isso escala linearmente com a quantidade de propostas: 100 propostas
≈ **80+ MB** de resposta que o SQLite lê do disco, o Node serializa em JSON e a rede
transfere — a cada carregamento da lista.

Agravantes secundários na mesma rota:
- **Sem `LIMIT`/paginação** (`server/index.js:5094`) — retorna todas as propostas ativas de uma vez.
- **Sem índice** em `propostas(created_at)`, usado no `ORDER BY`.

Observação: `pdf_proposta_cliente` e `anexo_cotacao` guardam apenas **nomes de arquivo**
(pequenos), não os bytes — não entram na conta.

---

## Frente A — Correção mínima e segura (EXECUTAR AGORA)

**Objetivo:** parar de trafegar `html_rendered` e `css_snapshot` na rota de listagem,
mantendo todo o resto do comportamento idêntico.

**Escopo:** somente `server/index.js`, somente a rota `GET /api/propostas` (linha ~5032).
Nenhuma mudança no frontend. A rota de detalhe `GET /api/propostas/:id` continua com
`pr.*` para o preview.

### Implementação recomendada (lista de colunas dinâmica, à prova de futuro)

Em vez de fixar dezenas de nomes de coluna (frágil quando novas colunas são adicionadas
via `ALTER TABLE`), montar a lista de colunas dinamicamente uma única vez a partir de
`PRAGMA table_info(propostas)`, excluindo apenas as colunas pesadas. Assim, qualquer
coluna nova continua sendo retornada automaticamente, e as pesadas ficam sempre de fora.

Adicionar um helper com cache (perto das outras funções auxiliares de proposta):

```js
// Colunas "pesadas" da tabela propostas que NÃO devem trafegar na listagem.
// São o documento renderizado inteiro (só usado no preview/detalhe via /:id).
const HEAVY_PROPOSTA_COLS = new Set(['html_rendered', 'css_snapshot']);
let _propostaListColsCache = null;

function getPropostaListColumns(cb) {
  if (_propostaListColsCache) return cb(null, _propostaListColsCache);
  db.all('PRAGMA table_info(propostas)', (err, cols) => {
    if (err) return cb(err);
    _propostaListColsCache = cols
      .map((c) => c.name)
      .filter((name) => !HEAVY_PROPOSTA_COLS.has(name))
      .map((name) => `pr.${name}`)
      .join(', ');
    cb(null, _propostaListColsCache);
  });
}
```

E na rota `GET /api/propostas`, trocar o `SELECT pr.*` pela lista dinâmica. O corpo do
handler passa a ser envolvido pela resolução das colunas:

```js
app.get('/api/propostas', authenticateToken, (req, res) => {
  getPropostaListColumns((colErr, prCols) => {
    if (colErr) return respondDbError(res, colErr, 'propostas:list:cols');

    const { cliente_id, status, /* ...igual ao atual... */ } = req.query;
    // ...toda a lógica de filtros permanece idêntica...

    let query = `SELECT ${prCols}, c.razao_social as cliente_nome,
                 c.nome_fantasia as cliente_nome_fantasia,
                 u1.nome as created_by_nome, u2.nome as responsavel_nome
                 FROM propostas pr
                 LEFT JOIN clientes c ON pr.cliente_id = c.id
                 LEFT JOIN usuarios u1 ON pr.created_by = u1.id
                 LEFT JOIN usuarios u2 ON pr.responsavel_id = u2.id
                 WHERE 1=1`;
    // ...resto idêntico ao handler atual (filtros, ORDER BY, db.all)...
  });
});
```

**Importante:** a única mudança de conteúdo do `SELECT` é a ausência de
`html_rendered` e `css_snapshot`. Todos os demais campos, filtros, o `ORDER BY` e a
resposta continuam iguais — sem regressão para nenhum consumidor da lista.

### Verificação

1. `node -c server/index.js` (ou subir o servidor) para garantir que não há erro de sintaxe.
2. Chamar `GET /api/propostas` autenticado e conferir que:
   - a resposta **não** contém `html_rendered` nem `css_snapshot`;
   - todos os outros campos usados pela lista continuam presentes
     (`titulo`, `cliente_nome`, `valor_total`, `status`, `created_at`, etc.).
3. Conferir que `GET /api/propostas/:id` (detalhe) **ainda retorna** `html_rendered`
   (preview não pode quebrar).
4. Medir o tamanho do payload da lista antes/depois (deve cair de MBs para KBs).

---

## Frente B — Correção completa (NÃO EXECUTAR — documentada)

Melhorias estruturais para o crescimento da base. Mexe também no frontend, por isso
fica para uma etapa seguinte, depois que a Frente A já tiver resolvido o gargalo medido.

### B.1 — Paginação com `LIMIT`/`OFFSET`

Aceitar `page`/`pageSize` (ou `limit`/`offset`) na query string e paginar no servidor,
retornando também o total para o frontend:

```js
const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 50, 200);
const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
const offset = (page - 1) * pageSize;
// ... após montar o WHERE ...
query += ' ORDER BY pr.created_at DESC LIMIT ? OFFSET ?';
params.push(pageSize, offset);
// devolver { data: rows, page, pageSize, total } e ajustar o frontend da lista
```

Requer ajuste no componente de listagem no `client/` para consumir a resposta paginada
e renderizar controles de página.

### B.2 — Índice para o `ORDER BY`

Criar índice na coluna usada na ordenação (e opcionalmente nas mais filtradas):

```js
db.run('CREATE INDEX IF NOT EXISTS idx_propostas_created_at ON propostas(created_at)');
db.run('CREATE INDEX IF NOT EXISTS idx_propostas_ativo ON propostas(ativo)');
```

Adicionar junto às demais criações de índice/migração na inicialização.

### B.3 (opcional) — Endpoint de listagem enxuto e dedicado

Se no futuro a lista precisar de ainda menos dados, criar um `SELECT` com apenas os
campos exibidos na tabela do frontend, em vez de "tudo menos as pesadas".
