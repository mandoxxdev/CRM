# Etapa 184 — A leitura da liberação por valor para de entregar nome e e-mail dos aprovadores

> **Status:** ✅ **FECHADA (2026-10-22): T1 `b23e60a2`, T2 `3383b4e5`, T3 `8467192f`; Fase 5 (0 críticos, 0 importantes, 3 menores, todos
> corrigidos) `892228fe`, `e74961a4`; fechamento (skill `fechar-etapa`) no commit seguinte.** Próxima: **Etapa 185** (ver "Próxima tarefa
> detalhada", no fim). Feature **23**
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

| # | Task | Tipo | Feita |
|---|---|---|---|
| T1 | Servidor: `getConfigPublica` + rota (RN-184.01..05, .07) | **tronco** (congela o JSON) | ✅ `b23e60a2` |
| T2 | Client: nada muda no código; testes das duas telas contra o contrato (RN-184.06) | galho (contra o contrato acima) | ✅ `3383b4e5` |
| T3 | Integração pela rota e pelo serviço, com fixture real para o client (RN-184.03/04/06) | depois de T1 e T2 | ✅ `8467192f` |
| F5 | Fix-round da revisão adversarial (3 menores) | depois de T3 | ✅ `892228fe`, `e74961a4` |
| — | Fechamento (`fechar-etapa`) | por último | ✅ (o commit do fechamento) |

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

### T1 — feita, `b23e60a2`

- `getConfigPublica` no serviço (exportada) e a rota GET chamando-a com `verIds: canConfigureAlmox(req.user) || isSystemAdmin(req.user)`.
  `getConfigForApi`, `saveConfig`, `isAprovadorValor` e o PUT intocados.
- Teste novo `server/tests/api/liberacaoValorLeitura.api.test.js` (12), na ordem da M1: 8 linhas do contrato (01/04/02, cada uma com
  `deepStrictEqual` **e** `JSON.stringify` igual ao literal — M2) → 03 (premissa `a1@x.com` antes do laço) → 05 (PUT do ALMOXARIFE com o corpo
  da configuração-base; PUT do admin almox 200 com `aprovadores`) → ressemear → 07 (`DROP TABLE usuarios`) por último.
- **Vermelho antes:** 2/12 — os 8 com `aprovadorIds`/`aprovadores` a mais no diff do `deepStrictEqual`, o 03 com `@`/chave/nome nos 8, o 07 com
  `500 no such table: usuarios`; os dois do 05 verdes (guarda de regressão). **Depois:** 12/12.
- **Controles** (perl, âncora = 1, md5 antes/sabotado/restaurado, `cmp` ok em todos): (1) rota → `getConfigForApi`: caem os 8 + 03 + 07 (2/12);
  (2) `|| perfil ALMOXARIFE`: cai **só** `[RN-184.01] ALMOXARIFE` (11/12); (3) `|| perfil PRODUCAO`: cai **só** `[RN-184.01] PRODUCAO sem perfil`
  — o comum CONSULTA não cai; (4) `|| isAprovadorValor`: cai **só** `[RN-184.04]`; (5) só `canConfigureAlmox`: cai **só** `[RN-184.02] admin do
  sistema` (super segue); (6) `souAprovador = false` no serviço: caem `[RN-184.04]`, admin do sistema e super (9/12); (7) PUT sem
  `denyUnlessAlmoxAdmin`: cai **só** o `[RN-184.05] ALMOXARIFE` (200 com `aprovadores`).
- Vizinhos do PUT sem mudar asserção: `auditoriaConfiguracoes` 23/0, `alcadaValorDepoisDaSeparacao` 40/0, `alcadaValorDepoisDaSeparacaoIntegracao`
  10/0. Divergências: nenhuma.

### T2 — feita, `3383b4e5`

- `RequisicoesList.test.js` (bloco novo "Etapa 184", 2 testes): usuário `{ id: 7, role: 'user', perfil_almoxarifado: 'GESTOR' }` (não admin),
  `GET` → `{ ativo: true, limite: 800, souAprovador: true }` mostra *Aprovações de valor*; com `souAprovador: false` não mostra.
- `ConfiguracoesSomenteLeitura.test.js` (1 teste): `[RN-184.06] robustez: sem aprovadorIds a aba não quebra` — nome e comentário da M3 (afirma só
  sem `toast.error`, limite 800, a lista de usuários renderizada e a frase de somente leitura; **não** afirma caixas desmarcadas).
- Verde de primeira (sem vermelho natural, como o plano previa). **Controles:** (A) `RequisicoesList.js` lendo
  `res.data?.aprovadores?.length > 0` → cai **só** `[RN-184.06] lista: aprovador sem configurar … mostra` (`Received: undefined`), 117/118;
  (B) `ConfiguracoesAlmoxarifado.js` lendo `cfgRes.data.aprovadores.map((a) => a.id)` → caem o de robustez (`toast.error` chamado 1 vez) **e**
  os dois da Etapa 126 que já usavam o formato reduzido (`[RN-05]` caixa desmarcada, `[RN-08]` `TypeError`), 22/25. md5 restaurado e `cmp` ok
  nos dois. Divergência: nenhuma de código; o controle (B) derruba também testes antigos — esperado, eles já mockavam sem `aprovadores`.

### T3 — feita, `8467192f`

- `server/tests/api/liberacaoValorLeituraIntegracao.api.test.js` (6): serviço × rota nos 8 usuários (`JSON.stringify` igual); fixture × resposta
  real; e o fluxo pela rota com as emendas **I1** (cria e semeia `usuarios` — 7 `a1@x.com`, 9, solicitante 18401 —, premissa `a1@x.com` antes
  dos "sem `@`"; o PUT do admin almox responde **200**) e **I2** (requisição criada pelo solicitante 18401, não pelo 7 — premissa afirmada;
  ALMOXARIFE: GET `{"ativo":true,"limite":1,"souAprovador":false}`, `aprovacoes-valor` 403 `Sem permissão para ver aprovações de valor`,
  `aprovar-valor` 403 `Sem permissão para aprovar liberação por valor`, status inalterado; aprovador 7: GET `souAprovador: true`, a requisição
  na fila, `aprovar-valor` **200**, status ≠ `AGUARDANDO_APROVACAO_VALOR` e `aprovador_valor_id = 7`).
- Fixture `client/src/components/almoxarifado/__fixtures__/liberacaoValor.rota.json` (`aprovadorSemConfigurar`, `adminDoSistema`), conferida a
  cada execução por chaves, tipos, JSON idêntico e ausência de `@`; `CRM_GRAVAR_FIXTURE=1` regrava. Dois Jest novos importam-na
  (`RequisicoesList.test.js`: o aprovador vê *Aprovações de valor*; `ConfiguracoesSomenteLeitura.test.js`: a caixa do 7 marcada e
  desabilitada, a de "Outra Pessoa" desmarcada). Os dois arquivos do client: 145/145.
- **Vermelho antes:** 5/6 — só o da fixture, `fixture ausente` (gravada em seguida com `CRM_GRAVAR_FIXTURE=1`; o resto do fluxo já passava
  porque a T1 estava feita — o vermelho que importa vem dos controles).
- **Controles** (perl, âncora = 1, md5, restauro por cópia + `cmp`): (a) controle (5) da T1 **sem** regravar → caem a fixture (`adminDoSistema:
  chaves da fixture != da resposta real`) e o serviço × rota (`SISADMIN` sem `aprovadorIds`), 4/6; **regravando** → cai o Jest da aba (`[RN-184.06,
  fixture da rota] … caixa do aprovador 7` — `Expected: true, Received: false`), 144/145; rota e fixture restauradas (md5 `a8fd639d…` da fixture
  igual ao versionado). (b) controle (1) da T1 sem regravar → 1/6: caem serviço × rota, fixture, os dois gestos (o GET 200 com `aprovadores`)
  e o `[RN-184.03, rota]` (`tem aprovadores` com `a1@x.com` no corpo **200** — cai pelo e-mail, não por 500, como a I1 pede). (c, extra) o
  `isAprovadorValor` ignorando a lista → caem a fixture (`souAprovador` false) e o gesto do aprovador 7, 4/6.
- **Divergência:** o teste serviço × rota calcula o `verIds` com o predicado do contrato, então cai também no controle (a) — o plano previa só a
  fixture. Fica: é a mesma regra afirmada por dois caminhos.

### Suítes (uma vez cada, sequencial, depois da T3)

- `test:api` 527/527 arquivos OK; `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Client: `CI=true npx react-scripts test --watchAll=false` 180 suítes, 2382/2382; `CI=true npx react-scripts build` *Compiled successfully*.
- Próximo passo: revisão adversarial da Fase 5; depois o fechamento (skill `fechar-etapa`) — **não feito** nesta execução. *(Feitos: ver
  as duas seções abaixo.)*

## Fase 5 — revisão adversarial (2026-10-22) — 0 críticos, 0 importantes, 3 menores, todos CORRIGIDOS

A revisão sabotou o código de produção e achou duas trocas que a suíte deixava passar verde (12/12 no `liberacaoValorLeitura` e 6/6 no
`liberacaoValorLeituraIntegracao`), mais um desencontro anterior à etapa na tela de Requisições. Fix-round sequencial na main; controle positivo
por achado — `perl` com âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia (`fix184-*` no scratchpad), `git diff --stat`
vazio do arquivo sabotado depois do restauro.

- **Menor 1 (CORRIGIDO no teste, `892228fe`) — nada provava que `souAprovador` diz o mesmo que o portão.** Trocar o `isAprovadorValor` de
  `getConfigPublica` por `isSystemAdmin(user) || aprovadorIds.includes(id)` passava verde, mas com `role: 'Admin'` e com o super de `role: 'user'`
  (`is_superadmin: 1` / `isSuperAdmin: true`) a lista diria *"sou aprovador"* e `GET /requisicoes/aprovacoes-valor` responderia **403** — botão
  que dá erro. **Correção:** três usuários novos no teste (`ADMIN_CAIXA` 31, `SUPER_ROLE_USER` 32, `SUPER_CAMEL` 33) e o caso `[RN-184.04, Fase 5]`
  que roda os **11** usuários e exige `souAprovador === (aprovacoes-valor responde 200)`, com a premissa de **3** positivos (aprovador 7, admin do
  sistema, super `role: 'admin'`) para o laço não ser só de 403. **Controle:** a troca acima no serviço → **12/16**: caem os três
  `[RN-184.02, Fase 5]` (`souAprovador: true` contra `false` no `deepStrictEqual`) **e** a paridade, nomeando os três (*"role 'Admin' (caixa
  alta): souAprovador true mas aprovacoes-valor 403 | super com role 'user' (is_superadmin: 1): … | super com role 'user' (isSuperAdmin:
  true): …"*). A asserção que guarda o achado (a paridade) caiu.
- **Menor 2 (CORRIGIDO no teste, `892228fe`) — nada provava a caixa do `role` no `verIds`.** Trocar `isSystemAdmin(req.user)` da rota por
  `req.user.role === 'admin'` passava verde; com `role: 'Admin'` o client abre a aba (compara em minúsculas) e veria as caixas todas desmarcadas.
  **Correção:** os mesmos três usuários exigem o JSON literal `{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}`.
  **Controle:** a troca acima → **15/16**: cai **só** `[RN-184.02, Fase 5] role 'Admin' (caixa alta)` (`aprovadorIds` ausente no
  `deepStrictEqual`); os dois supers seguem (são `canConfigureAlmox`), como deviam. O `liberacaoValorLeituraIntegracao` ficou 6/6 sob a
  sabotagem — esperado: os 8 usuários dele não têm `role` em caixa alta.
- **Menor 3 (CORRIGIDO no código, `e74961a4`; anterior à etapa) — a lista mostrava a aprovação de valor a quem o portão recusa.**
  `RequisicoesList.js` mostrava o filtro *Aprovações de valor* (`:1374`), os botões **Aprovar Liberação**/**Reprovar** (`:1780`) e escondia o aviso
  *"Esta requisição aguarda aprovação de um aprovador de alto valor configurado."* (`:1793`) com `souAprovadorValor || isAdmin` — e o `isAdmin` da
  tela (`canDeleteAlmoxRequisicao`, `:272`) aceita o admin do módulo, o `role: 'Admin'` e o super de outro papel, a quem `/aprovacoes-valor`,
  `/aprovar-valor` e `/rejeitar-valor` respondem 403. **Correção (pequena e segura):** as três condições passam a usar só `souAprovadorValor`, que
  o servidor calcula com o mesmo critério do portão (Menor 1). O teste da Etapa 47 *"a lane de valor tambem fica desabilitada com pendencia
  aberta"* usava `role: 'admin'` com o mock `souAprovador: false` (o servidor real responde `true` a esse usuário) — o mock dele passou a dizer
  `true`. Jest novos (`Etapa 184 (Fase 5): a aprovação de valor segue só o souAprovador do servidor`, 4 casos): admin do módulo, `role:
  'Admin'` e super de `role: 'user'` com `souAprovador: false` → o aviso **está** na tela (metade positiva), sem filtro, sem Aprovar
  Liberação, sem Reprovar; `role: 'admin'` com `souAprovador: true` → filtro e botões, sem o aviso. Vermelho antes: 3/123 (caíam pelo aviso).
  **Controles** (cada um sozinho): (A) o filtro com `|| isAdmin` → caem os 3 negativos em `botaoPorTexto('Aprovações de valor')` (`:1377`);
  (B) os botões com `|| isAdmin` → caem os 3 em `botaoPorTexto('Aprovar Liberação')` (`:1378`); (C) o aviso com `&& !isAdmin` → caem os 3 em
  `toContain(BANNER)` (`:1376`); (D) `false && souAprovadorValor` nos botões → caem o positivo (`:1388`, Aprovar Liberação) e o da Etapa 47
  (`:850`). Cada controle caiu pela asserção da sua condição. md5 do pós-conserto (`5af25d50…`) de volta nos quatro. Decisão registrada como
  **B1223** (escolhido: só `souAprovador`; descartado: manter o botão para admin).

**Divergência do plano:** a Fase 0 (achado 4) dizia que `souAprovador` "tem de continuar igual ao portão real — senão a tela mostra botão
que dá 403" e concluía que nada mudava na tela; não viu que a **própria tela** somava o `isAdmin` ao `souAprovador`. O botão que dá 403 já
existia antes da etapa — a revisão achou, o fix-round fechou.

## Verificação final (2026-10-22, uma suíte por vez, depois do fix-round)

Sobre `e74961a4` (código) + os documentos do fechamento; exit 0 em todas:

- `test:api` **527/527** arquivos OK (mais lento: `propostaClausulasGrava.api.test.js`, 67,5 s); `liberacaoValorLeitura` **16/16** (eram 12).
- `test:almoxarifado` **44 passou, 0 falhou**.
- `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**.
- client **180 suítes / 2386 testes**, todos passando (eram 2382 na T3: +4 da Fase 5 — os casos de `RequisicoesList.test.js`).
- `CI=true react-scripts build`: *Compiled successfully*.
- `git status`: só os arquivos do fechamento antes do commit.

## Retrospectiva

1. **2 sabotagens de produção passavam verde** na suíte da T1/T3 (12/12 e 6/6) — os 8 usuários do contrato tinham `role` sempre em
   minúsculas e o super sempre com `role: 'admin'`, justamente os casos em que as duas réguas (`isSystemAdmin` e `role === 'admin'` estrito)
   coincidem. Teste de critério de acesso precisa do usuário **onde as réguas divergem**, não só dos papéis canônicos.
2. **3 usuários novos** bastaram para os dois achados (`role: 'Admin'`, super `role: 'user'` pelos dois nomes da flag) — e a paridade
   `souAprovador === portão` pela **rota**, não por predicado copiado, é o que impede a régua de se separar do portão de novo.
3. **3 condições** na tela somavam `isAdmin` ao `souAprovador` desde antes da etapa; a Fase 0 mediu o servidor e o consumidor, mas leu o
   consumidor só pelo campo (`souAprovador`), não pela expressão inteira em que ele entra.
4. **0 mudanças de contrato de API** no fix-round — o JSON do GET continua o da T1; mudou só a tela (o que ela mostra a quem o portão recusa).

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1210** — Quem recebe os ids dos aprovadores: **quem configura o almoxarifado ou o administrador do sistema** — o mesmo grupo que abre a aba no
  client. **Descartado:** só `canConfigureAlmox` do servidor (a aba do administrador do sistema, só leitura desde a Etapa 126, ficaria com as
  caixas desmarcadas mentindo "ninguém aprova"); `can(user, 'configurar')` (dá o mesmo grupo hoje, salvo a caixa do `role` — emenda M4 —, mas por outro caminho — `getPerfilFromUser`
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

- **B1223** (Fase 5, Menor 3) — A lista de requisições mostra o filtro *Aprovações de valor*, **Aprovar Liberação** e **Reprovar** só com
  `souAprovador` (o mesmo critério do portão). **Descartado:** manter o botão para o admin do módulo, o `role: 'Admin'` e o super de outro papel
  (o portão continua respondendo 403 a eles; dar-lhes o direito de aprovar é mudar quem aprova — B196/B1213). Reversível: três condições.
- **B1224** — a próxima etapa (185): a tabela da ficha de EPI e o termo de ferramenta quebram por largura (B1208/C444).

*(B1215 a B1222 e C445 são do plano da 185, escrito em paralelo — por isso a 184 salta para B1223.)*

## Próxima tarefa detalhada — Etapa 185: a tabela da ficha de EPI (e o termo de ferramenta) cabe na folha (feature 25 e ferramentas)

**O plano já existe:** `docs/superpowers/plans/2026-10-22-almoxarifado-etapa185-tabela-da-ficha-epi-dentro-da-folha.md` (outra sessão, commit
`90168815`; Fase 0 medida com o jsPDF real; **Fase 2 ainda não rodou** — é o primeiro passo). Decisões a partir de **B1215**; aviso novo **C445**
(se for o caso). Este resumo é só o que permite retomar sem reler o código — **o plano da 185 prevalece** sobre ele.

**Por que esta.** A **B1208**/**C444** (Etapa 183): na linha de cada entrega do PDF da ficha de EPI (o papel da NR-6), cada célula é cortada
por **número de letras**, sem medir: *Entregue por* com 15 caracteres já passa da margem (198,6 mm; a margem é 196) e com 25 sai da folha; o
*Motivo* perde texto num valor comum (*Primeira entreg*). O termo de responsabilidade de ferramenta (Etapa 180) tem o mesmo defeito.
Não depende da empresa.

**Contrato que ela consome (não há API nova nem alterada):** o descritor da ficha que o client já monta a partir de `GET /epi/ficha/:colaborador_id`
(sem mudança) e o do termo; a mudança é só no desenho de `client/src/utils/fichaEpiPdf.js` e `client/src/utils/termoFerramentaPdf.js` — colunas
em x = 14, 32, 82, 102, 121, 131, 143, 168; célula quebra por palavra em linhas de 4 mm; a entrega só começa na página se couber até 287 mm
(régua da 183, agora com `4·n`).

**Pontos de atenção:**
- Medir com o **jsPDF real** (o gravador dos testes devolve `undefined` para medida — lição da 183); a régua "nenhum texto passa de 196" vale
  para todas as fontes (14, 9, 7), não só a 7.
- "Nada perdido" se prova por junção das linhas sem espaços = texto sem espaços — e por sabotagem que **corta** e vê o teste cair.
- O HMAC, a API e a tela da ficha **não** mudam: o `git diff --stat` da etapa fica nos dois `*Pdf.js` e nos testes.

**O que já está pronto e ela não reabre:** tudo da 184 (o GET da liberação por valor, a tela de Requisições) e as duas linhas da 183
(matrícula confirmada e aparelho, que já quebram por largura — B1207).

**Depois da 185** (medir antes de prometer): as 🟡 do mapa que não dependem da empresa — 05, 06, 01, 23 (na 23, o que falta para 🟢 continua
B33-b, B41, B56, B853 e os laços sem transação).

## Emendas da Fase 2

Revisor fresco, 2026-10-22, sobre `0036a2a5`. Lido: rota `server/routes/almoxarifado.js:3654-3662` (GET), `:3664` (PUT), `:173-179`
(`denyUnlessAlmoxAdmin`), `:3819-3826` (`/requisicoes/aprovacoes-valor`), `:4322-4324` (`/aprovar-valor`); serviço
`requisitionValueApprovalService.js:41-99`, `:195-216`, `:428-464`; `server/services/systemPermissions.js:30-83`; `permissions.js:273-287`;
client `systemPermissions.js:1-77`, `permissionsCache.js:109-116`, `ConfiguracoesAlmoxarifado.js:225-296` e `:3227-3330`,
`RequisicoesList.js:272`, `:283`, `:380-386`, `:1374`, `:1780`, `:1793`; os testes citados; spec 23 `:709-715`; `errosApi.js:103-106`.

**Veredito: nenhum Crítico. O contrato e as RN batem com o código; as emendas abaixo são de teste (para não ficar vazio) e de ordem.**

### As quatro perguntas

1. **Contratos × código.** Conferido linha a linha da tabela, com os predicados reais: `verIds` = `canConfigureAlmox` do servidor (super ‖
   `isModuleAdmin` ‖ perfil `ADMINISTRADOR`) ‖ `isSystemAdmin` (super ‖ `role` minúsculo `admin`); `souAprovador` = `isAprovadorValor`
   (`role === 'admin'` estrito ‖ id na lista). Comum/PRODUCAO/ALMOXARIFE → `{ativo,limite,souAprovador:false}`; 7 GESTOR → `souAprovador:true`
   sem ids; admin do sistema (5) → ids + `true` (só por `isSystemAdmin`); perfil ADMINISTRADOR (4) e admin do módulo (6) → ids + `false`; super
   (1) → ids + `true`. A ordem das chaves do objeto literal do contrato é a que o `res.json` serializa. Erro: o `try/catch` da rota continua 500
   `{ error }`. Bate.
2. **RN × spec.** A spec 23 (`:709-712`) pede "reduzir o payload para não-admin"; o plano vai além (tira `aprovadores` também do admin, B1211)
   e declara. O item do multer (`:713-715`) está mesmo errado: `errosApi.js:103-106` é o handler global e devolve 400 `Upload inválido` para
   `MulterError`; os `fileFilter` das rotas de `extended.js` usam `erroComMensagemUsuario` (4xx com mensagem) e a de anexos tem wrapper próprio
   400 (`extended.js:1861-1869`). Bate.
3. **Galhos.** T2 só escreve Jest com mock na fronteira HTTP e nenhum código do client muda — independente da T1 de verdade. T3 depende das duas
   e escreve nos **mesmos** dois arquivos de teste da T2: só pode ir depois (o plano já diz). Bate.
4. **Até o último gesto.**
   - *Aprovador que não configura:* a lista lê só `souAprovador` (`RequisicoesList.js:383`), que não muda; `/aprovacoes-valor` (`:3822`) e
     `/aprovar-valor` (serviço `:195-199`) usam o mesmo `isAprovadorValor`, sem `requirePermission` de perfil no caminho (`aprovar_requisicao`
     de `ACAO_PERFIS` não é usado por essas rotas). Vê o botão e aprova. OK.
   - *Admin do sistema só leitura:* a aba abre por `canConfigureAlmox` do client (`ConfiguracoesAlmoxarifado.js:225`, com `getEffectiveUser`),
     que é `isSystemAdmin ‖ isModuleAdmin ‖ perfil ADMINISTRADOR` (`client/src/utils/systemPermissions.js:49-68`). O `verIds` da rota é o
     **mesmo** predicado (o super está nos dois lados; `parseAdminModulos` igual nos dois; `role` comparado em minúsculas nos dois; o servidor
     ainda põe `perfil_almoxarifado = 'ADMINISTRADOR'` no admin do módulo, `systemPermissions.js:193`). **Não há** usuário que abre a aba e não
     recebe `aprovadorIds`. OK — e o controle (5) prova o contrário.
   - *Quem grava:* `handleSalvar` (`:3266-3280`) **ignora** a resposta do PUT e **não** relê o GET — a tela fica com o estado local, que é o
     que acabou de gravar. Reabrir a aba relê o GET, e quem grava (`podeGravarConfigAlmox` ⊂ `verIds`) recebe os ids. Nada quebra.
   - *Outros consumidores:* busca por `liberacao-valor` no repositório inteiro (fora de `node_modules`/`build`): só `RequisicoesList.js:382`,
     `ConfiguracoesAlmoxarifado.js:3241/3269` e mocks de teste (todos já no formato reduzido). `getConfigForApi` no servidor: só a rota GET
     (`:3657`, que sai) e `saveConfig` (`:463`, fica). Nenhum hook/serviço do client. OK.

### Achados

- **I1 (Importante) — o "nenhum GET tem `@`" da T3 fica vazio.** A T3 (`### T3`) não manda criar nem semear `usuarios`. Sem a tabela, o
  `PUT` do admin almox responde 500 (grava antes, `alcadaValorDepoisDaSeparacaoIntegracao.api.test.js:24`) e — pior — a asserção "sem `@`"
  passaria mesmo com a rota sabotada para `getConfigForApi`, porque o sabotado também daria **500** sem e-mail nenhum no corpo, e o controle
  (b) da T3 cairia pelo status, não pelo e-mail. **Correção:** a T3 cria `usuarios` (molde `alertaForaDaTrava.api.test.js:73`) com 7 `a1@x.com`
  e um solicitante, e afirma a premissa (`SELECT email … id = 7` é `a1@x.com`) **antes** dos "sem `@`", como a T1. O controle (b) tem de cair
  com o `@`/`aprovadores` no corpo **200**, não com 500.
- **I2 (Importante) — "`/aprovar-valor` não dá 403" é fraco e mascara a segregação.** `aprovarValor` (`requisitionValueApprovalService.js:213-216`)
  também responde **403** quando o aprovador é o solicitante; e qualquer 404/409/500 passaria em "não dá 403". **Correção:** a requisição da T3 é
  criada por outro usuário (não o 7) e o gesto do 7 afirma **200** e o status relido diferente de `AGUARDANDO_APROVACAO_VALOR` (e
  `aprovador_valor_id = 7`). O ALMOXARIFE, no mesmo cenário, afirma 403 com o literal `Sem permissão para aprovar liberação por valor` — o
  par positivo/negativo do RN-184.04 pelo gesto final, não só pela listagem.
- **M1 (Menor) — ordem dos testes da T1 conflita.** O `[RN-184.05]` grava `limite: 900, aprovadorIds: [7]` (muda a configuração-base das oito
  linhas) e precisa de `usuarios`; o `[RN-184.07]` faz `DROP TABLE usuarios`. O plano diz "rodar por último" para o 07 e não ordena o 05.
  **Correção:** ordem fixa — 01/02/04 → 03 (laço) → 05 → ressemear as três chaves → 07 por último. E o PUT do ALMOXARIFE no 05 manda o
  **mesmo** corpo da configuração-base (`limite: 800, aprovadorIds: [7, 9]`), para que o controle (7) derrube só o 05 e não as linhas seguintes
  por efeito colateral.
- **M2 (Menor) — "chaves exatas, nesta ordem" não é o que o `deepStrictEqual` trava.** `assert.deepStrictEqual` ignora a ordem das chaves.
  **Correção:** ou tirar "nesta ordem" do contrato, ou afirmar também `assert.strictEqual(JSON.stringify(res.body), '<literal da tabela>')`
  (o literal já está escrito na tabela; preferido — custa uma linha e trava o que o contrato promete).
- **M3 (Menor) — o Jest "apaga `aprovadorIds` → nenhuma caixa marcada, sem toast" abençoa o estado enganoso.** Caixas todas desmarcadas
  dizem "ninguém aprova" — é exatamente o que o B1210 descartou. Como teste de robustez (a aba não quebra) ele serve, mas o nome e o comentário
  não podem apresentar isso como comportamento correto. **Correção:** nomear `[RN-184.06] robustez: sem aprovadorIds a aba não quebra` e
  comentar que quem abre a aba **sempre** recebe os ids (o predicado é o mesmo nos dois lados — pergunta 4) e que a guarda real é o controle
  (5) + a fixture da T3. Não afirmar "nenhuma caixa marcada" como se fosse desejado; afirmar só "sem `TypeError`/toast e a aba renderiza".
- **M4 (Menor) — o B1210 diz que `can(user, 'configurar')` "dá o mesmo grupo hoje".** Quase: `getPerfilFromUser` (`permissions.js:278`) compara
  `role === 'admin'` estrito, e `isSystemAdmin` em minúsculas — um `role: 'Admin'` entra num e não no outro. O próprio B1210 cita a caixa; a frase
  "dá o mesmo grupo" deve dizer "o mesmo grupo, salvo a caixa do `role`". Só redação.

Nenhum achado muda o contrato congelado nem as RN; a execução segue T1 → T2 → T3 com I1, I2 e M1–M3 aplicados.
