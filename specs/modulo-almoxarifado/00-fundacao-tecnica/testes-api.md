# Padrão de testes de API do almoxarifado

> Objetivo: toda regra essencial tem teste exercitando a **rota HTTP** (não só o serviço), com banco em memória. Enquanto o harness não existir, manter o padrão atual de teste de serviço — mas o harness é o item 0.1 da fundação.

## Padrão do repositório (manter)

- Runner caseiro: script Node autônomo, helper `test(nome, fn)`, `assert` nativo, `process.exit(failed > 0 ? 1 : 0)`. Sem jest/mocha no servidor.
- Banco: `new sqlite3.Database(':memory:')` + `initSchema(db)` de `server/services/almoxarifado/schema.js`.
- Referências: `server/tests/almoxarifado.test.js` (setupDb nas linhas 37-66), `server/tests/proposta523Fixa.test.js`.

## Harness proposto (`server/tests/helpers/testApp.js`)

```js
// Esboço da interface — implementação na Etapa 0.1
const { createTestApp } = require('./helpers/testApp');

// createTestApp({ user }) →
//   monta express() novo
//   cria db :memory: + initSchema(db)
//   registra req.user = user (stub de authenticateToken/checkModulePermission)
//   registra as rotas: routes/almoxarifado.js, routes/almoxarifado/extended.js,
//                      routes/requisicoesMaterial.js
//   retorna { app, db, close() }

const { app, db } = await createTestApp({
  user: { id: 1, nome: 'Teste', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' }
});
const res = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({...});
assert.strictEqual(res.status, 201);
```

Pontos de atenção descobertos no levantamento:
- `routes/almoxarifado.js` registra auth em bloco via `app.use('/api/almoxarifado', authenticateToken, checkModulePermission('almoxarifado'))` na linha 138 — o stub precisa entrar **antes** ou substituir esses middlewares (injeção por parâmetro ou `NODE_ENV=test`).
- As rotas recebem `(app, db)` — verificar assinaturas reais na implementação; pode ser preciso pequeno refactor para injetar `db` (hoje alguns arquivos importam o db de `services/almoxarifado/db.js`).
- O DDL duplicado nas rotas (item 0.2) deve sair antes, senão o app de teste cria schema divergente.

## Convenções de escrita

- Um arquivo por feature: `server/tests/api/<feature>.api.test.js` (ex.: `movimentacoes.api.test.js`).
- Nome do teste = a regra de negócio em linguagem clara: `test('saida sem saldo suficiente retorna 400 e nao altera saldo', ...)`.
- Cada teste cria seus dados via helpers locais (`criarMaterial`, `criarRequisicaoComItens`) — INSERTs diretos ou chamadas de API.
- Testar sempre os dois lados: o caminho feliz E a regra de bloqueio (4xx + estado do banco intacto).
- Testes de permissão: repetir a chamada com perfil sem a ação → 403.
- Registrar o script no `server/package.json` (`test:api` roda todos os `tests/api/*.api.test.js` em sequência).

## Checklist de cobertura mínima (espelha as regras essenciais de cada feature)

- [ ] Harness `createTestApp` criado e documentado
- [ ] `movimentacoes.api.test.js` — saldo, tipos, auditoria, estorno, transacionalidade
- [ ] `requisicoes.api.test.js` — fluxo completo, validações, permissões
- [ ] `reservas.api.test.js` — reserva/liberação/disponível
- [ ] `recebimentos.api.test.js` — workflow NF, inspeção, quarentena
- [ ] `transferencias.api.test.js` — origem/destino/trânsito
- [ ] `devolucoes.api.test.js` — vínculo à saída original
- [ ] `inventario.api.test.js` — contagem, ajuste aprovado
- [ ] `lotes-series.api.test.js` — controles efetivos, validade, FEFO
- [ ] `permissoes.api.test.js` — matriz perfil × ação
