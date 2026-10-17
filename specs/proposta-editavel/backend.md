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

Recusas, nesta ordem: 404 *"Proposta não encontrada"* → 400 *"Título é obrigatório"* (título presente vazio ou só espaços) → 400 *"Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal."* (Etapa 139, só quando a margem veio) → 400 *"Motivo da não venda é obrigatório quando a proposta está perdida/rejeitada."* → 403 *"Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada."* → (na gravação) 409 `PROPOSTA_ALTERADA` *"A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo."* quando o corpo traz status, margem, motivo ou data de fechamento e um desses que **não** veio mudou entre a leitura e a gravação. As regras do motivo, do desconto e da data de fechamento automática usam o valor efetivo e só rodam quando um dos campos delas veio.

### A margem de desconto (Etapa 139, C299/C300)

Uma régua só, `lerMargemDesconto` (`server/margemDesconto.js`), em **quatro** portas: `POST /api/propostas`, `PUT /api/propostas/:id`
(só quando a chave veio), `POST /api/propostas/gerar-automatica` e `POST /api/aprovacoes` (`valor_desconto`).

| Valor | Resultado |
|---|---|
| ausente no `POST`/geração, `null`, `''`, só espaços | **0** (número) |
| número finito de 0 a 100 (`-0` vira 0) | o número |
| texto que é número com ponto (`" 10.5 "`), de 0 a 100 | o número |
| qualquer outra coisa — `"10,5"`, `"10abc"`, `"1e2"`, `".5"`, `-1`, `101`, `true`, `false`, lista, objeto, `NaN`, `Infinity` | **400** *"Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal."*, nada gravado |

O corpo do `PUT` é normalizado (texto → número) **antes** de tudo que lê a margem (a regra dos 5 %, o `montarSetParcial`, o registro da
revisão). A **margem gravada** que a régua não lê (texto de antes desta régua, ou fora de 0 a 100) conta como **acima de 5** na regra do
desconto do `PUT` — enviar sem aprovação dá 403. Ordem no `POST`: título → margem → motivo → cliente → desconto. Na geração automática:
cliente/produtos → margem → **403** com a mensagem do `POST` (*"Não é possível salvar uma proposta com desconto acima de 5% sem aprovação
prévia. A proposta deve ser salva como rascunho até que a autorização seja aprovada."*) quando a margem passa de 5 e o `status` veio e não é
rascunho; margem acima de 5 sem status → rascunho. *(Esta seção dizia "Não coberto (C301–C303): /enviar não olha a margem, o PUT aceita
desconto_aprovado por conta própria, e as aprovações não conferem quem aprova" — resolvido na Etapa 140, abaixo.)*

### A autorização do desconto acima de 5 % (Etapa 140, C301–C303)

Plano com as RN e os contratos: `docs/superpowers/plans/2026-10-17-almoxarifado-etapa140-a-autorizacao-do-desconto.md`. Regras em
`server/aprovacaoDesconto.js` (as mensagens literais em `MSG`); rotas no `index.js`. Teste: `tests/api/aprovacaoDescontoAutorizacao.api.test.js`
(duas subidas; a segunda com `tests/helpers/atrasoSqlInjetado.js`, que atrasa o callback de um SQL escolhido para abrir a janela entre leitura
e gravação).

- **Aprovador** = `pode_aprovar_descontos = 1` **ou** `is_superadmin = 1`, lido do banco na hora (o `req.user` não traz a coluna). Admin de
  papel não basta. **Dono do pedido** = `solicitado_por`, `propostas.responsavel_id` e `propostas.created_by` — o dono não decide, nem o super.
- **`PUT /api/aprovacoes/:id`** (aprovar ou rejeitar): 400 status/motivo → 404 → 403 *sem permissão* → 403 *dono* → 409 *já decidida* (pendente
  = `'pendente'`, vazio ou nulo) → (aprovar desconto) 400 *valor fora da régua* → 404 proposta → 409 *proposta saiu* (só rascunho e
  `desconto_aprovado` aceitam). `aprovado_por` = `req.user`. **Ordem das gravações ao aprovar:** a proposta primeiro (`WHERE status IN
  ('rascunho','desconto_aprovado') AND EXISTS (pedido pendente)`), depois o pedido (`WHERE pendente`); se o pedido foi decidido no meio, a
  proposta volta ao status e à margem lidos (`WHERE status = 'desconto_aprovado' AND margem IS <a gravada>`) e 409. Tudo antes da resposta.
- **`POST /api/aprovacoes`**: `status` e `solicitado_por` do corpo ignorados (nasce `pendente`, de `req.user`); 400 sem `proposta_id` → 400 régua
  → 404 proposta → 400 sem aprovador → 400 só donos aprovam. A atividade vai para o primeiro aprovador ativo não dono (não oculto, com a
  coluna, menor id).
- **`GET /api/aprovacoes`**: cada linha com `pode_decidir` (pendente e aprovador e não dono); `tipo=recebida` com a mesma regra.
- **`PUT /api/propostas/:id`**: 403 ao **entrar** em `desconto_aprovado` (depois do motivo, antes do desconto); 409 ao trocar o
  `responsavel_id` com pedido de desconto pendente; a regra dos 5 % vale para todo status que não é rascunho, inclusive `desconto_aprovado`
  (com a mensagem própria).
- **`POST /api/propostas/:id/enviar`** e **`/assinar`**: margem gravada (ilegível = acima de 5) acima de 5 só com aprovação que casa; a gravação
  confere a margem (`IS`) e, no envio, o status — senão 409 `PROPOSTA_ALTERADA`. A assinatura grava o status antes da assinatura.
- **Casar** (`casaComAprovacao`): aprovação `aprovado`, tipo `desconto`, com `aprovado_por` não nulo e diferente de `solicitado_por`, valor pela
  régua da margem, diferença < 0,01 ponto depois de arredondar a duas casas. Só pelo percentual (**B910**).
- **Não coberto:** `/premium` e `/pdf` não barram rascunho nem `desconto_aprovado` no servidor (**C304**, próxima); quem edita a proposta de
  outro (Fase 12, **C305**).

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
