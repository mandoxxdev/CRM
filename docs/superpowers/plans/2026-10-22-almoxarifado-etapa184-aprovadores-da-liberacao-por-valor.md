# Etapa 184 — A leitura da liberação por valor para de entregar nome e e-mail dos aprovadores

> **Status:** 📝 **plano escrito (2026-10-22)** — falta a revisão da Fase 2, a execução (T1 → T2 → T3) e o fechamento. Feature **23**
> (perfis, segurança e auditoria), item aberto da spec `specs/modulo-almoxarifado/23-perfis-seguranca-auditoria/README.md:709-712`
> (letra **D (20)** das novidades, `docs/almoxarifado-novidades-por-etapa.md:16402-16408`).
> Antes: Etapa 183 (ficha de EPI) — **não tocar** nos arquivos dela (outra sessão revisa a 183 em paralelo).

## Objetivo (em linguagem simples)

A tela de requisições pergunta ao servidor "eu sou aprovador de valor?". Para responder, o servidor manda **a configuração inteira** da
liberação por valor — e nela vai a **lista de aprovadores com nome e e-mail**. Qualquer pessoa logada no almoxarifado (até o chão de
fábrica) recebe essa lista, mesmo sem a tela mostrar.

Depois desta etapa:

- **Quem não configura o almoxarifado** recebe só três coisas: se a regra está ligada, o limite em reais e **"você é aprovador: sim/não"**.
- **Quem configura** (administrador do módulo, perfil Administrador, super administrador) **e o administrador do sistema** (que abre a aba em
  modo só leitura) recebem também **os números (ids) de quem aprova** — é o que a aba *Liberação por Valor* usa para marcar as caixinhas.
- **Ninguém** recebe nome nem e-mail por esta leitura. O nome que a aba mostra já vem de outra leitura (`GET /usuarios`).
- Gravar (`PUT`) não muda nada.

Analogia: antes, para saber se você tinha a chave do cofre, o sistema te entregava a lista de todos os donos de chave com telefone. Agora
responde só "sim" ou "não" — e a lista (sem telefone) fica com quem administra o cofre.

## Fase 0 (medido em 2026-10-22, `68d72b17`)

- **Rota** — `server/routes/almoxarifado.js:3655-3662`: `GET /api/almoxarifado/configuracoes/liberacao-valor` com `authenticateToken` só (mais
  o portão de módulo do prefixo, `:325-328`: `checkModulePermission('almoxarifado')`). Chama `valueApprovalService.getConfigForApi(db, req.user)`
  e devolve o resultado **inteiro**.
- **Serviço** — `server/services/almoxarifado/requisitionValueApprovalService.js:428-438` (`getConfigForApi`): devolve
  `{ ativo, limite, aprovadores, aprovadorIds, souAprovador }`. `aprovadores` = `getAprovadoresDetalhes` (`:54-64`): `SELECT id, nome, email FROM
  usuarios WHERE id IN (…) AND COALESCE(ativo,1)=1`. `souAprovador` = `isAprovadorValor` (`:94-99`): `role === 'admin'` (o `isAdmin` local,
  `:90-92`) **ou** id na lista. `getConfig` (`:41-52`) lê as três chaves e **não** toca em `usuarios`.
- **PUT** — `:3664`, já barrado por `denyUnlessAlmoxAdmin` (`:173-179`, `canConfigureAlmox` do servidor, 403
  `Acesso restrito — administrador do Almoxarifado ou Super Administrador`). Responde `saveConfig` → `getConfigForApi(db, null)` (`:463`),
  **com** `aprovadores`. **Não muda nesta etapa.**
- **Critério de quem configura** — servidor `server/services/systemPermissions.js:81-83` (`canConfigureAlmox` = super, admin do módulo ou perfil
  `ADMINISTRADOR`; **não** aceita `role = 'admin'` sozinho) e `isSystemAdmin` (`:38-40`, super ou `role` `admin` sem caixa). O client abre a aba
  com `canConfigureAlmox` **do client** (`client/src/utils/systemPermissions.js:49-68`), que **inclui** `isSystemAdmin`; grava com
  `podeGravarConfigAlmox` (`:74-77`, a regra do servidor). Logo, quem abre a aba = `canConfigureAlmox(servidor) || isSystemAdmin`.
- **Consumidores** (busca por `liberacao-valor` em `client/src` fora de teste: 3 linhas, 2 arquivos):
  - `client/src/components/almoxarifado/RequisicoesList.js:380-386` — só em `warehouseMode`, lê **só** `souAprovador`
    (`setSouAprovadorValor(!!res.data?.souAprovador)`), usado em `:1374`, `:1780`, `:1793` (sempre `souAprovadorValor || isAdmin`). Erro → `false`.
  - `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js:3227-3253` (`TabLiberacaoValor`) — lê `ativo`, `limite`, `aprovadorIds`;
    nomes de `GET /usuarios` (`:3242`). O `PUT` (`:3269`) ignora a resposta.
  - Ninguém lê `aprovadores` desta rota. A régua achou `aprovadores` em `AprovacoesRegra.js`/`TabRegrasAprovacao.js` (regras de aprovação,
    outra rota) — então ela funciona.
- **Testes que tocam a rota**: nenhum trava o formato do `GET`. `auditoriaConfiguracoes.api.test.js:487` (PUT → 500 no harness, sem tabela
  `usuarios`) e `:306-309` (`aprovadores`/`souAprovador` fora do diff); `alcadaValorDepoisDaSeparacao.api.test.js:142-155` e
  `alcadaValorDepoisDaSeparacaoIntegracao.api.test.js:24` (PUT grava e responde 500). Todos são do **PUT** — continuam iguais. No client,
  mocks em `ConfiguracoesSomenteLeitura.test.js:62` (`{ ativo, limite, aprovadorIds: [7] }`, usado em `:208-232`), `Etapa160Almoxarifado.test.js:147`
  e `RequisicoesList.test.js:111` (`{ souAprovador: false }`) + 14 `Requisicoes*.test.js` — **já** usam o formato reduzido.
- **Precedente** — Etapa 181: `GET /ferramentas` mascara por `can(req.user, 'gerenciar_ferramentas')` com lista branca
  (`server/routes/almoxarifado/extended.js:1624-1637`).

### Divergências e achados da Fase 0

1. **Caminho do precedente:** o pedido citava `server/routes/extended.js:1629-1635`; o arquivo é `server/routes/almoxarifado/extended.js`
   (`:1628-1636`). Só endereço.
2. **A spec 23 está errada no item seguinte** (`:713-715`: *"Erro de multer continua virando 500 opaco nas 5 rotas de upload"*). Desde a
   Etapa 86 (`bf8d27fe`, 2026-10-08) `server/services/errosApi.js:103-106` devolve **400** `{ error: 'Upload inválido' }` para `MulterError`
   (o de tamanho é 413, `uploadGrandeDemais.api.test.js`), provado na rota real de foto de material (`errosModulosJson.api.test.js:57`) e na
   unidade (`:289`). O fechamento marca o item dizendo que **estava errado** (regra 5 do CLAUDE.md), não apaga em silêncio.
3. **Achado (não muda aqui) — o e-mail de todo usuário já sai por outra porta.** `GET /api/usuarios` devolve `id, nome, email, ativo` a
   **qualquer** logado (`server/services/leituraDeUsuarios.js:47-54`, decisão da Etapa 130, B841: as abas do almoxarifado precisam da lista). Então
   esta etapa fecha **"quem é aprovador, com contato, numa leitura só"**, não "o e-mail de alguém". Fechar o e-mail em `/usuarios` é do núcleo e
   quebraria as duas abas do administrador do módulo — vai para **D (184)**.
4. **Achado (não muda aqui) — `souAprovador` segue o critério antigo.** `isAprovadorValor` aceita `role === 'admin'` estrito (`:90-92`), não o
   super com outro papel nem o administrador do módulo (B196 da Etapa 47 já declarou e deixou para o usuário). `souAprovador` tem de continuar
   **igual** ao portão real de `/aprovar-valor` (`:195-199`, 403 `Sem permissão para aprovar liberação por valor`) e de
   `/requisicoes/aprovacoes-valor` (`almoxarifado.js:3822-3823`) — senão a tela mostra botão que dá 403. Nesta etapa ele **não** muda.
5. **Harness sem `usuarios`.** `createTestApp` não cria a tabela; com `aprovadorIds` não vazio, `getConfigForApi` lança e o GET de hoje responde
   **500**. Para o vermelho cair **pelo motivo certo** (o e-mail sai), o teste novo cria `usuarios` como
   `alertaForaDaTrava.api.test.js:73` (`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)`).
   A função nova não lê `usuarios` — o GET deixa de depender dela.

## Regras

Configuração-base de todos os cenários: `liberacao_valor_ativo = '1'`, `liberacao_valor_limite = '800'`, `liberacao_valor_aprovadores = '[7,9]'`;
`usuarios`: `7 Aprovador Um a1@x.com`, `9 Aprovador Dois a2@x.com`.

| ID | Regra | Cenário |
|---|---|---|
| RN-184.01 | Quem **não** configura o almoxarifado e **não** é administrador do sistema recebe **exatamente** `{ ativo, limite, souAprovador }`. | (a) usuário comum (perfil `CONSULTA`, id 21); (b) **PRODUCAO sem perfil** (sem `perfil_almoxarifado`, cai no fallback, id 22); (c) **ALMOXARIFE** não-admin (id 23) → os três recebem `{ "ativo": true, "limite": 800, "souAprovador": false }`, chaves exatas. |
| RN-184.02 | Quem configura (`canConfigureAlmox` do servidor: super, admin do módulo, perfil `ADMINISTRADOR`) **ou** é administrador do sistema (`isSystemAdmin`) recebe **exatamente** `{ ativo, limite, aprovadorIds, souAprovador }` — `aprovadorIds` só números. | (a) **admin do sistema só leitura** (`role: 'admin'`, id 5) → `aprovadorIds: [7, 9]`, `souAprovador: true`; (b) **admin almox** por perfil (id 4) → `aprovadorIds: [7, 9]`, `souAprovador: false`; (c) admin do módulo (`admin_modulos: ['almoxarifado']`, id 6) → idem (b); (d) super (`role: 'admin'`, `is_superadmin: 1`, id 1) → `[7, 9]`, `true`. |
| RN-184.03 | **Ninguém** recebe nome nem e-mail por esta leitura: nenhuma resposta tem a chave `aprovadores`, e o JSON inteiro não contém `a1@x.com`, `a2@x.com`, `Aprovador Um` nem `@`. | Os 8 usuários de RN-184.01/02/04: `JSON.stringify(body)` sem `@` e sem os nomes. |
| RN-184.04 | `souAprovador` é **o mesmo** `isAprovadorValor` de antes (o portão de `/aprovar-valor`): verdadeiro para quem está na lista **mesmo sem configurar**, e quem está na lista **não** ganha `aprovadorIds`. | Aprovador sem configurar (`id: 7`, perfil `GESTOR`) → `{ "ativo": true, "limite": 800, "souAprovador": true }`; e `PUT /requisicoes/:id/aprovar-valor` dele **não** dá 403 de permissão (T3). |
| RN-184.05 | O `PUT` não muda: mesmo portão (403 literal para quem não configura), mesma gravação, mesma auditoria, mesma resposta (com `aprovadores`, só para quem configura). | `auditoriaConfiguracoes`, `alcadaValorDepoisDaSeparacao*` verdes **sem** mudar asserção; ALMOXARIFE → PUT 403 `Acesso restrito — administrador do Almoxarifado ou Super Administrador`. |
| RN-184.06 | As telas continuam funcionando com a resposta **real**: a lista de requisições mostra o filtro *Aprovações de valor* para o aprovador sem configurar; a aba *Liberação por Valor* do administrador do sistema marca as caixas dos aprovadores (somente leitura) e a do admin almox grava. | T3: fixture gravada da rota → Jest de `RequisicoesList` e `ConfiguracoesSomenteLeitura`. |
| RN-184.07 | Erro ao ler a configuração continua 500 `{ error }` (como hoje); a leitura **não** depende mais da tabela `usuarios`. | Sem a tabela `usuarios` no harness, o GET do admin almox com `aprovadorIds: [7, 9]` responde **200** (hoje 500). |

## Contrato (congelado)

**`GET /api/almoxarifado/configuracoes/liberacao-valor`** — `authenticateToken` + portão de módulo (sem mudança; nenhum 403 novo). Com a
configuração-base:

| Usuário (harness `setUser`) | Resposta 200 (chaves exatas, nesta ordem) |
|---|---|
| comum `{ id: 21, role: 'user', perfil_almoxarifado: 'CONSULTA' }` | `{"ativo":true,"limite":800,"souAprovador":false}` |
| PRODUCAO sem perfil `{ id: 22, role: 'user' }` | `{"ativo":true,"limite":800,"souAprovador":false}` |
| ALMOXARIFE `{ id: 23, role: 'user', perfil_almoxarifado: 'ALMOXARIFE' }` | `{"ativo":true,"limite":800,"souAprovador":false}` |
| aprovador sem configurar `{ id: 7, role: 'user', perfil_almoxarifado: 'GESTOR' }` | `{"ativo":true,"limite":800,"souAprovador":true}` |
| admin do sistema só leitura `{ id: 5, role: 'admin' }` | `{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":true}` |
| admin almox (perfil) `{ id: 4, role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' }` | `{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}` |
| admin do módulo `{ id: 6, role: 'user', admin_modulos: ['almoxarifado'] }` | `{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}` |
| super `{ id: 1, role: 'admin', is_superadmin: 1 }` | `{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":true}` |

- `ativo`: boolean; `limite`: número ≥ 0; `aprovadorIds`: `number[]` (o `parseList` de hoje); `souAprovador`: boolean.
- **Nunca** sai: `aprovadores`, nome, e-mail.
- Erro de leitura: 500 `{ error: <mensagem> }` (sem mudança).
- **`PUT`**: sem mudança alguma (RN-184.05).

**Serviço** — função nova em `requisitionValueApprovalService.js`, exportada:

```js
// Etapa 184 (RN-184.01..04): a leitura do GET — sem `usuarios`, sem nome/e-mail; ids so para quem abre a aba.
async function getConfigPublica(db, user, { verIds = false } = {}) {
  const config = await getConfig(db);
  const souAprovador = user ? await isAprovadorValor(db, user) : false;
  return verIds
    ? { ativo: config.ativo, limite: config.limite, aprovadorIds: config.aprovadorIds, souAprovador }
    : { ativo: config.ativo, limite: config.limite, souAprovador };
}
```

**Rota** — quem decide `verIds` é a rota (o critério é de tela/autorização, não de regra de valor):

```js
const config = await valueApprovalService.getConfigPublica(db, req.user, {
  verIds: canConfigureAlmox(req.user) || isSystemAdmin(req.user),
});
```

`getConfigForApi` **fica** (o `saveConfig`/PUT usa). `canConfigureAlmox` e `isSystemAdmin` já estão importados em `almoxarifado.js:63`.

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Servidor: `getConfigPublica` + rota (RN-184.01..05, .07) | **tronco** (congela o JSON) |
| T2 | Client: nada muda no código; testes das duas telas contra o contrato (RN-184.06) | galho (contra o contrato acima) |
| T3 | Integração pela rota e pelo serviço, com fixture real para o client (RN-184.03/04/06) | depois de T1 e T2 |

Nenhuma task toca motor de estoque, trava, migration nem `ACAO_PERFIS`. T2 só escreve testes do client — paralela à T1 sem risco, mas é tão
pequena que pode ir em sequência no mesmo executor (preferido: um executor, T1 → T2 → T3, como a 183).

### T1 (tronco) — o GET passa a usar `getConfigPublica`

Arquivos: `server/services/almoxarifado/requisitionValueApprovalService.js` (função nova + export), `server/routes/almoxarifado.js:3655-3662`,
teste novo `server/tests/api/liberacaoValorLeitura.api.test.js`.

1. **Vermelho primeiro.** Runner próprio (`test()`, contador, `process.exit`), harness `testApp.js`. Semear: `CREATE TABLE IF NOT EXISTS usuarios
   (…)` (molde `alertaForaDaTrava.api.test.js:73`) com 7 e 9; as três chaves de `configuracoes_almoxarifado` por `INSERT … ON CONFLICT` direto
   (o PUT responderia 500 por outro motivo antes da tabela existir — não usar para semear). Um teste por linha da tabela do contrato:
   - `[RN-184.01] comum|PRODUCAO sem perfil|ALMOXARIFE` → `assert.deepStrictEqual(res.body, { ativo: true, limite: 800, souAprovador: false })`
     (o `deepStrictEqual` do objeto inteiro trava as chaves — chave a mais cai);
   - `[RN-184.04] aprovador sem configurar` → `{ ativo: true, limite: 800, souAprovador: true }`;
   - `[RN-184.02] admin do sistema | admin almox | admin do módulo | super` → o objeto exato da tabela;
   - `[RN-184.03]` laço nos 8: `!('aprovadores' in body)`, `!JSON.stringify(body).includes('@')`, `!…includes('Aprovador Um')`. **Antes** do laço,
     premissa: `SELECT email FROM usuarios WHERE id = 7` é `a1@x.com` (senão o "não contém" passa por a tabela estar vazia — o teste vazio
     da M2 da 183);
   - `[RN-184.07]` `DROP TABLE usuarios` → admin almox → **200** com `aprovadorIds: [7, 9]` (recriar a tabela depois, ou rodar por último);
   - `[RN-184.05]` ALMOXARIFE → `PUT` 403 com o literal exato; admin almox → `PUT { ativo: true, limite: 900, aprovadorIds: [7] }` 200 e a resposta
     **ainda** traz `aprovadores` (o PUT não mudou — com a tabela existindo).
2. Rodar e ver vermelho **pelos motivos certos**: os oito com `aprovadores`/e-mail a mais (o `deepStrictEqual` mostra a chave) e o `[RN-184.07]` com
   500. O `[RN-184.05]` passa de primeira (guarda de regressão — provada pelo controle 5 abaixo).
3. Implementar o contrato (serviço + rota). **Não** mexer em `getConfigForApi`, `saveConfig`, `isAprovadorValor` nem no PUT.
4. **Controles positivos** (restauro por cópia + `cmp`, um por vez, âncora `perl` contada = 1, base LF):
   - **(1) a rota volta para `getConfigForApi`** → caem `[RN-184.03]` nos 8 e as chaves exatas de RN-184.01/02/04;
   - **(2) conceder a permissão proibida ao ALMOXARIFE**: `verIds: canConfigureAlmox(req.user) || isSystemAdmin(req.user) ||
     getPerfilFromUser(req.user) === 'ALMOXARIFE'` → cai **só** `[RN-184.01] ALMOXARIFE` (`aprovadorIds` a mais). **A asserção negativa de
     permissão passa verde de qualquer jeito antes — só este controle prova que ela sabe falhar**;
   - **(3) conceder ao fallback**: `|| getPerfilFromUser(req.user) === 'PRODUCAO'` → cai **só** `[RN-184.01] PRODUCAO sem perfil` (o comum com
     `CONSULTA` **não** cai — prova que os dois cenários são distintos);
   - **(4) conceder ao aprovador**: `|| await valueApprovalService.isAprovadorValor(db, req.user)` → cai `[RN-184.04]` (e não as de admin);
   - **(5) tirar `isSystemAdmin`** (`verIds: canConfigureAlmox(req.user)`) → cai **só** `[RN-184.02] admin do sistema` (o super continua — ele é
     `canConfigureAlmox`); o T3 do client também cai (caixas desmarcadas);
   - **(6) `souAprovador: false` fixo** → caem `[RN-184.04]`, admin do sistema e super;
   - **(7) PUT barrado errado**: trocar `denyUnlessAlmoxAdmin` do PUT por nada → cai `[RN-184.05]` (ALMOXARIFE 200).
5. Suítes: `test:api` inteira — `auditoriaConfiguracoes` e `alcadaValorDepoisDaSeparacao*` **sem mudança de asserção** (RN-184.05).

### T2 (galho) — as duas telas continuam funcionando com o formato reduzido

Arquivos: `client/src/components/almoxarifado/RequisicoesList.test.js` (ou um `RequisicoesAprovadorValor.test.js` novo, se o mock de `:111` ficar
complicado) e `client/src/components/almoxarifado/ConfiguracoesSomenteLeitura.test.js`. **Nenhum** arquivo de código do client muda.

1. Testes (mock na fronteira HTTP, JSON do contrato):
   - `[RN-184.06] lista`: `warehouseMode`, usuário **não** admin (o `isAdmin` da lista é `canDeleteAlmoxRequisicao`, `RequisicoesList.js:272` —
     com `role: 'admin'` o botão aparece de qualquer jeito e o teste não prova nada), GET responde `{ ativo: true, limite: 800, souAprovador: true }` (sem
     `aprovadorIds`, sem `aprovadores`) → o filtro/botão *Aprovações de valor* (`RequisicoesList.js:1374`) aparece; com `souAprovador: false` →
     não aparece;
   - `[RN-184.06] aba, admin do sistema`: o mock de `:62` já é o formato reduzido (`aprovadorIds: [7]`, sem `aprovadores`) — acrescentar o
     teste que **apaga** `aprovadorIds` da resposta e confere que a aba abre sem quebrar (nenhuma caixa marcada, sem toast de erro) — o
     comportamento de quem não recebe os ids, caso um dia a tela abra para ele.
2. Este galho **não tem** vermelho natural (o client já lê só os campos que ficam). Controles positivos obrigatórios:
   - `RequisicoesList.js:383` lendo `res.data?.aprovadores?.length > 0` no lugar de `souAprovador` → cai o da lista;
   - `ConfiguracoesAlmoxarifado.js:3247` lendo `cfgRes.data.aprovadores.map((a) => a.id)` → cai o da aba (`TypeError` / caixa desmarcada).
3. `CI=true npx react-scripts test src/components/almoxarifado/RequisicoesList src/components/almoxarifado/ConfiguracoesSomenteLeitura --watchAll=false`.

### T3 — integração pela rota e pelo serviço, e a resposta real nas telas

Arquivo: `server/tests/api/liberacaoValorLeituraIntegracao.api.test.js`; fixture `client/src/components/almoxarifado/__fixtures__/liberacaoValor.rota.json`.

- **Pela rota (o gesto até o fim):** admin almox `PUT` `{ ativo: true, limite: 1, aprovadorIds: [7] }` → requisição de um material com custo
  que passa do limite, criada pela rota (molde `alcadaValorDepoisDaSeparacao.api.test.js` — status `AGUARDANDO_APROVACAO_VALOR`) → aprovador 7 sem
  configurar: `GET /configuracoes/liberacao-valor` dá `souAprovador: true` **e** `GET /requisicoes/aprovacoes-valor` 200 com a requisição **e**
  `PUT /requisicoes/:id/aprovar-valor` **não** dá 403 → ALMOXARIFE: GET `souAprovador: false` **e** `aprovacoes-valor` 403 `Sem permissão para ver
  aprovações de valor` (o `souAprovador` e o portão real dizem o mesmo — RN-184.04) → nenhum dos GETs tem `@`.
- **Pelo serviço:** `getConfigPublica(db, user, { verIds })` com os 8 usuários → `deepStrictEqual` ao corpo da rota de cada um (a rota não
  acrescenta nem filtra nada além do `verIds`).
- **Fixture para o client (molde I3 da 183):** o teste **sempre** compara a fixture versionada com as respostas reais de dois usuários
  (`aprovadorSemConfigurar`, `adminDoSistema`) — chaves, tipos e ausência de `@`; com `CRM_GRAVAR_FIXTURE=1` só regrava. Dois Jest novos
  (em `RequisicoesList.test.js` e `ConfiguracoesSomenteLeitura.test.js`) importam a fixture: o aprovador vê *Aprovações de valor*; o admin do
  sistema vê a caixa do id 7 marcada e desabilitada (os nomes vêm do mock de `/usuarios`, como hoje).
- **Controles positivos:** (a) controle (5) da T1 + regravar a fixture → cai o Jest da aba (caixa desmarcada); sem regravar → cai o teste do
  servidor (fixture ≠ resposta); (b) controle (1) da T1 **sem** regravar → cai o servidor (chave `aprovadores` a mais e `@` na resposta real).

### Fechamento (skill `fechar-etapa`)

Spec 23: o item `:709-712` marcado com hash e o que ficou (D (184): `/usuarios` ainda dá e-mail a qualquer logado; `souAprovador` no critério
antigo, B196); o item `:713-715` (multer) marcado **dizendo que estava errado** desde a Etapa 86 (`bf8d27fe`, `errosModulosJson.api.test.js:57`).
Mapa (linha 23 — o item sai da lista "o que falta"), guia do usuário (roteiro: entrar como chão de fábrica, abrir Requisições, F12 → a resposta
da liberação por valor só tem três campos; entrar como aprovador → aparece *Aprovações de valor*; admin do sistema → aba só leitura com as
caixas marcadas), novidades (seção da Etapa 184, letra B abaixo, D (20) marcado como pago) e este plano com a próxima tarefa detalhada.

## Execução

_(vazia — preencher task a task com hash, vermelho antes, controles e suítes.)_

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1210** — Quem recebe os ids dos aprovadores: **quem configura o almoxarifado ou o administrador do sistema** — o mesmo grupo que abre a aba no
  client. **Descartado:** só `canConfigureAlmox` do servidor (a aba do administrador do sistema, só leitura desde a Etapa 126, ficaria com as
  caixas desmarcadas mentindo "ninguém aprova"); `can(user, 'configurar')` (dá o mesmo grupo hoje, mas por outro caminho — `getPerfilFromUser`
  compara `role === 'admin'` sensível à caixa, `isSystemAdmin` não — e o client decide pela `systemPermissions`; dois critérios para a mesma aba
  divergiriam na primeira mudança). Reversível: um `||` na rota.
- **B1211** — `aprovadores` (nome e e-mail) sai do GET **para todo mundo**, inclusive para quem configura. **Por quê:** nenhum consumidor lê
  (Fase 0), a aba tira os nomes de `GET /usuarios`, e o GET deixa de consultar `usuarios` (um erro naquela tabela não derruba mais a aba nem a
  lista de requisições). **Descartado:** manter `aprovadores` para quem configura (dado que ninguém lê, e mais um caminho com e-mail para
  vigiar). Reversível: a função antiga `getConfigForApi` continua no serviço (o PUT usa); voltar é trocar a chamada na rota para os
  administradores.
- **B1212** — O **PUT continua** respondendo com `aprovadores` (nome e e-mail), só para quem configura. **Descartado nesta etapa:** reduzir a
  resposta do PUT (a tela ignora, mas três testes de auditoria e de alçada dependem de o PUT passar por `getAprovadoresDetalhes`; mudar o PUT é
  outro contrato e não fecha exposição — quem configura já lê `/usuarios`). Reversível.
- **B1213** — `souAprovador` **não muda de critério** (continua `role === 'admin'` estrito ou estar na lista — o portão real de `/aprovar-valor`).
  **Descartado:** alinhar com `canConfigureAlmox` aqui (mudaria quem aprova valor, não só quem lê — é a decisão B196 da Etapa 47, que segue sua).
- **B1214** — O e-mail de todo usuário continua saindo por `GET /api/usuarios` para qualquer logado (decisão B841 da Etapa 130). Esta etapa fecha
  "a lista de quem aprova, com contato, para qualquer um"; o e-mail em si fica em **D (184)**. **Descartado:** fechar `/usuarios` aqui (é do núcleo
  e quebraria as abas do administrador do módulo, que leem nome da lista). Reversível.

## Próxima tarefa detalhada

_(preencher no fechamento.)_
