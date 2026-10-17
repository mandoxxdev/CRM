# Etapa 133 (núcleo): a régua das rotas de permissões (C273) e a sala do `mensagem_excluida` (C274) — design

> Origem: "Próxima tarefa detalhada — Etapa 133" do plano da 132
> (`docs/superpowers/plans/2026-10-16-almoxarifado-etapa132-o-inativo-no-chat.md`). Plano:
> `docs/superpowers/plans/2026-10-16-almoxarifado-etapa133-a-regua-das-permissoes.md`.

## Fase 0 — medido (não suposto)

**Sonda no servidor real** (`scratchpad/e133/sonda-perm.js`: `index.js` com pasta de dados vazia, o seed administrador cria um super
administrador com papel `usuario` (`sup`), um usuário com papel `Admin` com maiúscula (`Adm`), o alvo e um comum (`com`)):

| Rota | seed (admin + super) | sup (super, papel usuario) | Adm (papel "Admin") | com |
|---|---|---|---|---|
| `PUT /usuarios/:id` (cadastro, `requireManageUsers`) | 200 | **200** | **200** | 403 |
| `DELETE /permissoes/usuario/:id/modulos` | 200 | **403** *Acesso negado* | **403** | 403 |
| `POST /permissoes` | 200 | **403** *Apenas administradores podem gerenciar permissões* | **403** | 403 |
| `GET /permissoes/usuario/:id` (outro) | 200 | **403** | **403** | 403 |
| `GET /permissoes/verificar` | `permitido: true, motivo: admin` | `sem_permissao` | `sem_permissao` | `sem_permissao` |
| `GET/PUT /permissoes/grupos[/:id]`, usuários e permissões do grupo | 200 | **403** | **403** | 403 |
| `GET /auditoria/logs` | 200 | **403** *Acesso negado. Apenas administradores podem visualizar logs.* | **403** | 403 |
| `DELETE /aprovacoes/:id` | 404 (inexistente) | 403 | 403 | 403 |
| `GET /engenharia/materiais-escritorio/admin` | 200 | 403 *Apenas admin* | 403 | 403 (módulo) |

**Efeito na tela (lido no client):** a área `/admin` abre para o super e para o `Admin` (`ProtectedModuleRoute`: `bypassModuleRestrictions`
ou `isSystemAdmin`, sem diferença de caixa). As três abas são irmãs (`Admin.js`): **Usuários** funciona (o cadastro usa `canManageUsers`),
**Permissões** e **Logs** tomam 403 ao carregar. No `UsuarioForm` (salvar um usuário não administrador): o `PUT` grava, o `DELETE
/permissoes/usuario/:id/modulos` toma 403 e o salvar mostra *"Usuário salvo, mas houve erro ao salvar permissões de módulos. Tente editar
novamente."* — os módulos **não mudam** (nada é apagado, porque o `DELETE` é o primeiro e falha). **A spec da 132 dizia "pode perder a
gravação das permissões"** — medido: não perde o que havia; perde a mudança feita na tela, com o aviso. Fica dito.

**Os outros usos do padrão `role ... 'admin'` no `index.js` (medidos um por um):**

- `DELETE /api/aprovacoes/:id` (≈14323): o client também esconde o botão com `user.role === 'admin'` exato (`Aprovacoes.js:740/785`).
  Quem apaga solicitação de aprovação é regra de negócio do comercial, não "gerencia usuários" → **não muda**; registrado (C275).
- Os 5 de `/api/engenharia/materiais-escritorio*` (≈17947–18030): cadastro da Engenharia, já atrás de `checkModulePermission
  ('engenharia_projetos')`; o "admin" ali é dono do cadastro de material de escritório, não de usuários; a Engenharia depende do P.O.
  (spec 06) → **não muda**; registrado (C276).
- `POST /api/operacional/ordens-servico` (≈20667). **Esta linha estava errada (corrigida na Fase 2, C1):** dizia que o resto do
  portão chamava `next()` em todos os ramos e que ninguém era barrado. Medido no servidor real (`scratchpad/e133/rev2-os.js`): o SQL do
  portão filtra por `gp.modulo`, coluna que `grupos_permissoes` não tem num banco novo, e o erro responde **500 `Erro ao verificar
  permissões`** a todos sem o papel `admin` exato — o super com papel `usuario` e o `Admin` não criam OS (`OSForm`, `OSComercialForm`). O
  papel exato é a única porta → **muda** para `bypassModuleRestrictions` (a régua de todo portão de módulo); o 500 dos outros é registrado
  (C277, consulta A81) — quem cria OS sem ser administrador (operacional? comercial? o comercial sem grupo?) não é desta etapa.
- `GET /api/auditoria/logs` (≈22397): é a aba **Logs**, irmã de Usuários e Permissões na mesma tela de Administração → **muda** junto
  (mesma régua do cadastro).

## Decisão

- **As 13 rotas de `/api/permissoes/*` saem do `index.js`** para `services/rotasDePermissoes.js` (`registrarRotasDePermissoes(app,
  { getDb, authenticateToken })`, o molde do `leituraDeUsuarios.js` da 130), registradas no mesmo ponto, **com o corpo igual** salvo a
  régua: gestão → `canManageUsers`; `GET /usuario/:id` → `canManageUsers` ou o próprio (id pelo número); `/verificar` →
  `bypassModuleRestrictions` (a régua do portão de módulo, que é quem dá acesso de verdade — hoje o `/verificar` diria "sem permissão"
  ao super que o portão deixa passar). O `DELETE /permissoes/usuario/:id/modulos` (≈20188) vem junto (é a mesma família; nenhum `DELETE`
  entre 18487 e 20188 casa o caminho — a ordem de registro não muda o resultado).
- **As mensagens de recusa ficam literais como hoje** (`Acesso negado`; `Apenas administradores podem gerenciar permissões`; a dos logs) —
  o contrato de recusa não muda, só quem passa.
- `/auditoria/logs` fica no `index.js`, com `canManageUsers`.
- **C274:** `routes/chat.js` emite para `` `conversa:${Number(req.params.id)}` `` (o mesmo `Number` que já vai para o serviço e para o
  `conversa_id` do payload).

**Ampliação de acesso (letra B, B855):** o super administrador com qualquer papel e o papel *Admin*/*ADMIN* passam a mexer em permissões,
grupos e logs — o que o cadastro de usuários já deixava (um super sem o papel já podia se dar `role = 'admin'` pelo `PUT` e passar).
**Descartado:** manter o `=== 'admin'` exato (a tela segue quebrada para quem o servidor já reconhece como administrador do sistema); só o
super (`isSuperAdmin`) — tiraria o administrador do sistema (`role = 'admin'`) das próprias abas, regressão; `requireManageUsers` com a
mensagem dele — mudaria o literal de recusa que o client mostra. A consulta **A80** mostra, antes do deploy, quem ganha o acesso.

## Testes

- `tests/api/rotasDePermissoes.api.test.js` — o registrador de produção num express com SQLite real (DDL de produção de `usuarios`,
  `permissoes`, `grupos_permissoes`, `usuarios_grupos`), `authenticateToken` falso que põe o usuário já enriquecido; a matriz de quem
  passa e quem recebe a mensagem literal, e o banco conferido (a recusa não grava); a fiação do `index.js` presa por texto.
- `tests/api/permissoesNoServidor.api.test.js` — o `index.js` real com pasta vazia (molde `chatSocketInativoNoServidor`): o fluxo do
  `UsuarioForm` e da aba Permissões pelo super sem papel e pelo `Admin`, e o alvo passando no portão do módulo que recebeu; os logs; o
  comum e o administrador do módulo `admin` recusados; e a C274 (a conversa pelo endereço com zero, o `mensagem_excluida` chegando).
