# Etapa 131 — as listas de usuário (C270) e a sessão do inativo (B842) — design

> Origem: "Próxima tarefa detalhada — Etapa 131" do plano da 130. Núcleo (não é do almoxarifado), reversível, sem P.O.
> Worktree `CRM-wt-e131`, branch `etapa-e131`, a partir da main `12de5dc3`.

## Fase 0 — o que foi medido (2026-10-16)

### As três listas (C270)

As três rotas moram no `server/index.js` (≈ linhas 3735–3935), antes do `registrarLeituraDeUsuarios` da 130, e só exigem estar logado:

| Rota | O que devolve hoje, a qualquer logado | Filtros (ficam como estão) |
|---|---|---|
| `GET /api/usuarios/comercial` | `id, nome, email, cargo, role, ativo, setor, departamento, created_at` de quem tem o módulo comercial (direto ou por grupo) ou `role = 'admin'` | ativo = 1; quem não é `role = 'admin'` (relido do banco, `ctxUser`) só vê o próprio setor (`LOWER(TRIM(COALESCE(setor,'')))`); cache de 60 s por `cacheKey(isAdmin, setor)` em `services/comercialResponsaveisCache.js` |
| `GET /api/usuarios/filtrar?flag=…` | `{ flag, limit, offset, count, items }`, cada item com `id, nome, email, cargo, role, ativo, setor, departamento, flag_vendedor, flag_compras, flag_ti, is_oculto` | flag obrigatória (400); quem não é `role = 'admin'` só pede flag que tem (403) e só vê o próprio setor; `ativo`, `departamento`, `q`, `limit` (1..200), `offset` |
| `GET /api/usuarios/por-modulo/:modulo` (e `por-modulo/admin`) | `id, nome, email, cargo, role, ativo, setor, departamento, is_oculto, created_at` de quem tem o módulo pedido ou `role = 'admin'` | ativo = 1; mesmo filtro de setor da `/comercial` (`buildSetorCondition`, duplicado no index.js) |

**Quem chama e o que lê** (varredura em `client/src`, régua testada contra um caso que existe — `Dashboard.js:136` aparece):

- `/usuarios/comercial` — `utils/userFilters.js` `fetchComercialResponsaveis` (cache do client por `super|user:id`), lido por `Atividades.js`
  (+ `CalendarioAtividades.js` pelo prop), `Oportunidades.js`, `OSComercialForm.js`, `ProjetoForm.js`, `Projetos.js`, `PropostaForm.js`,
  `proposta/PropostaForm.js`, e pelo hook `useComercialResponsaveis` (`Propostas.js`, `proposta/PropostasList.js`). Campos lidos:
  **`id`, `nome`** em todos; **`cargo`** em `ProjetoForm.js:220` e `PropostaForm.js:1000` (`{nome} - {cargo}` no seletor de responsável).
- `/usuarios/por-modulo/:modulo` — `Dashboard.js:136` (`comercial`; lê `id`, `nome`, `username` — que a rota nunca devolveu) e
  `fetchModuleUsers` → `operacional/OSForm.js:241` (`operacional`; lê `id`, `nome`). `por-modulo/admin`: **nenhum** chamador no client.
- `/usuarios/filtrar` — `fetchUsersFiltered` em `utils/userFilters.js`, **nenhum** chamador.
- Nenhum chamador lê `role`, `setor`, `departamento`, `is_oculto`, `created_at`, as flags; `email` e `ativo` também não, mas ficam (a
  projeção da B841 é `id, nome, email, ativo`, e reusar a mesma é o pedido).
- Testes de servidor dessas rotas: **nenhum** (só o RN-12 da 130 usa `por-modulo` como âncora de posição no texto do `index.js`).

### A sessão do inativo (B842)

- `enrichUserFromDb` (`services/systemPermissions.js:149`): sem linha ativa, desde a 130 rebaixa (`role = 'usuario'`, sem super, sem
  módulos, sem perfis) e segue — o desativado continua usando o sistema como usuário comum até o token vencer (24 h).
- **O cache de 30 s é código morto:** o `index.js` passa `enrich: (req, res, next) => enrichUserFromDb(db)(req, res, next)` — uma
  instância (e um `Map`) nova a cada pedido; o `cache.get` nunca acha nada. Se virasse instância única, a retirada de papel passaria a
  valer só depois de até 30 s (o r2 da 130 mediu), o que piora a B818/B828. → **sai**.
- O client: `services/api.js:151` — **qualquer 401** limpa `token`/`user` e manda para `/login` (`?sessao_expirada=1` só se a mensagem
  casar `/expirado|inválido|não fornecido/i`). Um 401 do enriquecimento desloga na primeira chamada.
- `/api/auth/me` já devolve **404** para o inativo (`SELECT … AND ativo = 1`); o `AuthContext` não trata o 404 como saída.
- Rotas sem `authenticateToken` (`/health`, `/api/health`, `/api/auth/login`, `/api`, `/api/backup` — token próprio —, deploy-version,
  imagens estáticas): não passam pelo enriquecimento, nada muda. O login já recusa o inativo (`AND ativo = 1`).
- Outro caminho de token: o socket do chat (`services/chat/socket.js:30`) só verifica o JWT, **não** relê o banco → o inativo continua
  conectado ao chat até o token vencer. Fora desta etapa → **C271**.
- Testes que montam o `authenticateToken` com usuário fora do banco: `tokenNaUrl.api.test.js` injeta um `enrich` próprio (não usa
  `enrichUserFromDb`) — não muda; `portaoDeModulo.api.test.js` não monta o `authenticateToken`; o `testApp.js` grava `req.user` direto.
  Os três `tests/*.test.js` que sobem o `index.js` de verdade (`clonarFamilia`, `clonarProduto`, `codigoProdutoSegueModelo`) inserem os
  usuários dos tokens antes (ativos). Quem muda **à vista**: os dois `[RN-13 F5 r2]` de `leituraDeUsuarios.api.test.js` (o rebaixamento
  vira 401).

## Decisões

1. **C270 — a projeção reusa `projetarListaDeUsuarios`** com um parâmetro opcional de campos extras: para quem **não** gerencia usuários
   (`canManageUsers`: super administrador ou `role = 'admin'`), cada linha das três listas vira `{ id, nome, email, ativo, cargo }`;
   quem gerencia recebe a forma de hoje. `cargo` entra porque dois seletores o mostram (medido); o mesmo conjunto nas três rotas (uma
   regra só). Descartado: tirar `cargo` (os dois seletores perderiam o "- Cargo"); projeção diferente por rota (três regras para o
   mesmo dado, sem ganho); 403 nas rotas (os seletores de responsável quebrariam para todo mundo).
2. **O cache da `/comercial` guarda as linhas inteiras e a projeção é aplicada na resposta, por pedido.** O pedido da etapa dizia "a
   projeção tem de entrar na chave do cache"; o risco que isso cobre (o cache de um servir o outro) desaparece se o que se guarda não
   depende de quem pede. Cenário que prova: o super administrador com `role = 'usuario'` e o comum do mesmo setor caem na **mesma**
   chave — nos dois sentidos de ordem, cada um recebe a sua forma. Descartado: a projeção na chave (duplica as entradas e a chave teria
   de reproduzir o `canManageUsers` inteiro, e o próximo que mudar a regra esquece a chave).
3. **As três rotas saem do `index.js` para `services/leituraDeUsuarios.js`**, registradas pelo mesmo `registrarLeituraDeUsuarios`
   **antes** das três da 130 (senão `/comercial` cairia no `/:id`) — o mesmo movimento da B841, para rodarem em teste de verdade. O
   `buildSetorCondition` do `index.js` (que duplicava o do cache) sai; o da rota `por-modulo` passa a ser o do módulo do cache
   (exportado). A chamada no `index.js` não muda.
4. **B842 — 401 no enriquecimento sem linha ativa**: `{ error: 'Sessão encerrada — o usuário foi desativado ou removido', code:
   'USUARIO_INATIVO' }`. O client já desloga em qualquer 401 (vai para `/login`, sem o aviso de sessão expirada — a frase não casa a
   régua dele, de propósito: não expirou). **Corrigido na Fase 2 (I1, I2):** o BUSY no enriquecimento vira 503 (o client repete; ninguém
   é deslogado) e outro erro do banco segue **sem** o poder do token — deixar passar com o token devolvia o papel ao administrador
   desativado (reproduzido); e o `USUARIO_INATIVO` vai para `/login?sessao_encerrada=1` com aviso próprio, e o 401 do próprio
   `/auth/login` não redireciona (antes, a senha errada recarregava a página com "sessão expirada" e apagava a mensagem). Descartado: manter o rebaixamento (o inativo segue usando o sistema por até 24 h); 403 (o client não
   desloga com 403 e as telas mostrariam "sem permissão" para sempre).
5. **O cache de 30 s sai** (código morto, medido). Descartado: torná-lo instância única (a retirada de papel passaria a demorar até 30 s).

## Riscos

- Ordem de registro: errar a ordem joga `/comercial`, `/filtrar` e `/por-modulo/x` no `/:id` (403 L10 para o comum). Coberto por
  cenário de rota (o comum recebe a lista) e por um teste estático da ordem dentro do módulo.
- O 401 dispara para qualquer token cujo id não tem linha ativa — inclusive banco restaurado de backup sem o usuário: o efeito é um novo
  login, que é o certo.
