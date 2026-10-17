# Etapa 133 (núcleo): a régua das rotas de permissões (C273) e a sala do `mensagem_excluida` (C274) — plano

> Origem: "Próxima tarefa detalhada — Etapa 133" do plano da 132. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa133-a-regua-das-permissoes-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B854**, último C
> **C274**, última A **A79**. Esta etapa: **B855+**, **C275+**, **A80+**. Worktree `CRM-wt-e133`, branch `etapa-e133` (a partir da main
> `8e42bf8e`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sonda `scratchpad/e133/rev2-os.js` no `index.js` real): 2 Critical, 1 Important, 4 Minor — todos aceitos,
> antes de qualquer código de produção.** **C1** — **a Fase 0 estava errada sobre o portão da OS** (`POST /api/operacional/ordens-servico`):
> o SQL filtra por `gp.modulo`, coluna que `grupos_permissoes` não tem num banco novo — o callback recebe erro e responde **500 `Erro ao
> verificar permissões`** a todo mundo que não tem o papel `admin` exato (o super com papel `usuario`, o `Admin` e o comum: 500). O
> papel exato é a única porta, o mesmo defeito da C273 → **entra** (RN-08: `bypassModuleRestrictions`, a régua do portão de módulo); o 500
> para os outros fica registrado (**C277**, com a consulta **A81** do `PRAGMA` em produção — um banco antigo pode ter a coluna). A contagem do
> RN-05 passa a **6**. **C2** — o RN-05 proibia `role` no serviço, mas o `GET …/grupos/:id/usuarios` devolve `u.role` (contrato): a régua
> passa a "nenhuma **comparação** de papel". **I1** — a RN-06 ganha o `PUT`/`DELETE` de grupo, o `DELETE` de membro e o `POST /permissoes` com
> `grupo_id` (o toggle da aba). **M1** — o próprio continua comparado por `parseInt` (corpo igual; `/usuario/05` já passava). **M2** — os
> outros `=== admin` exatos fora do `index.js` (`leituraDeUsuarios.js:177/280`, os seletores por setor; `UsuarioForm.js` e `Usuarios.js`
> no client, o alvo/selo) → registrados (**C278**), sem mudança. **M3** — o administrador do módulo `admin` (M) continua recusado → letra B
> como descartado. **M4** — o `authenticateToken` falso no teste do registrador: o 401 do inativo é da 131 e a RN-06 passa pelo real.
>
> **Trava de máquina:** `scratchpad/e133-lock.sh` (diretório `maquina-testes.lock`). Um arquivo de teste de servidor por vez, inclusive
> os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

**Quem gerencia usuários** = `canManageUsers` (`services/systemPermissions.js`) = super administrador (`is_superadmin` 1/true/'1') com
qualquer papel, ou papel `admin` sem diferença de caixa. O `req.user` já vem do `enrichUserFromDb` (papel e super lidos do banco a cada
pedido). **L1** = `Acesso negado`; **L2** = `Apenas administradores podem gerenciar permissões`; **L3** = `Acesso negado. Apenas
administradores podem visualizar logs.` (os três literais de hoje, sem mudança).

Perfis da matriz: **S** super com papel `usuario`; **A** papel `Admin` (maiúscula), não super; **a** papel `admin`, não super; **M**
administrador do módulo `admin` (`admin_modulos ["admin"]`), papel `usuario`; **P** perfil Administrador do almoxarifado, papel `usuario`;
**C** comum.

- **RN-01 — a gestão de permissões é de quem gerencia usuários.** `POST /api/permissoes`, `GET/POST /api/permissoes/grupos`,
  `GET/PUT/DELETE /api/permissoes/grupos/:id`, `GET/POST /api/permissoes/grupos/:id/usuarios`, `DELETE
  /api/permissoes/grupos/:id/usuarios/:usuario_id`, `GET /api/permissoes/grupos/:id/permissoes` e `DELETE
  /api/permissoes/usuario/:id/modulos`: S, A e a → seguem como hoje (200 com o corpo de hoje, gravando); M, P e C → **403** com L2 no
  `POST /api/permissoes` e L1 nas outras, **sem gravar** (conferido no banco: nenhuma linha nova/apagada/alterada).
- **RN-02 — as permissões de um usuário: o próprio ou quem gerencia.** `GET /api/permissoes/usuario/:id`: S, A, a → 200 com as linhas de
  qualquer id; M, P, C → 200 com as **suas** (o id da rota por `parseInt`, como hoje: `/usuario/05` é o 5) e 403 L1 com o de outro.
- **RN-03 — `/verificar` responde como o portão de módulo.** `GET /api/permissoes/verificar`: quem o portão deixa passar sem consultar
  (`bypassModuleRestrictions` — a mesma régua: S, A, a) → `{ permitido: true, motivo: 'admin' }`; os outros pelo banco como hoje
  (`permissao_explicita` / `negado_explicito` / `permissao_grupo` / `sem_permissao`).
- **RN-04 — os logs de auditoria: quem gerencia usuários.** `GET /api/auditoria/logs`: S, A, a → 200; M, P, C → 403 L3.
- **RN-05 — a fiação.** `index.js` (estático, sem comentários): nenhum `app.<método>('/api/permissoes` sobra; `registrarRotasDePermissoes(app,
  { getDb: () => db, authenticateToken });` aparece **uma** vez, antes de `app.get('/api/busca-global'`; `services/rotasDePermissoes.js` não
  compara papel (`role ===`/`!==`: só as réguas de `systemPermissions`; o `u.role` da resposta fica); a rota dos logs chama `canManageUsers(req.user)`. E os
  usos de papel exato que ficam são presos pela **contagem** (`role !== 'admin'` ou `role === 'admin'` no `index.js` = **6**: aprovações,
  5 de materiais de escritório) — um novo aparece no teste.
- **RN-06 — integração pela rota (o servidor real).** O `index.js` com pasta vazia: o seed cria S, A, M (`admin_modulos: ['admin']`), C e
  dois alvos comuns. Para S e para A, cada um num alvo: o salvar do `UsuarioForm` (`PUT /api/usuarios/:id` → `DELETE
  /api/permissoes/usuario/:id/modulos` → dois `POST /api/permissoes` `{ usuario_id, grupo_id: null, modulo, acao: 'visualizar',
  permissao: 1 }`) → 200 em todos; `GET /api/usuarios/:id/grupos` mostra as duas diretas; **o alvo, logado, passa no portão do módulo que
  ganhou** (`GET /api/financeiro/contas-pagar` 403 antes, 200 depois); um segundo salvar sem `financeiro` → o alvo volta a 403 (o `DELETE`
  apagou de verdade). A aba Permissões: `POST` grupo, `PUT` grupo, `POST /permissoes` com `grupo_id` (o toggle), `POST` usuário no grupo, `GET` usuários e
  permissões do grupo, `GET` grupos, `DELETE` do membro e do grupo → 200 *(Fase 2 I1)*.
  `GET /api/auditoria/logs` → 200. M e C: `DELETE …/modulos` e `POST /api/permissoes` → 403 (L1/L2) e o alvo segue com o que tinha;
  `GET /api/permissoes/grupos` 403 L1; logs 403 L3. `GET /api/permissoes/verificar` de S → `motivo: 'admin'`.
- **RN-08 — a OS pelo portão de módulo (Fase 2 C1).** `POST /api/operacional/ordens-servico`: S e A (`bypassModuleRestrictions`) → seguem
  para a gravação (200 com o corpo válido); os outros → como hoje (no banco novo, 500 `Erro ao verificar permissões` — C277, sem mudança).
  Pela rota (RN-06, o servidor real) e estático (o `role === 'admin'` some do portão).
- **RN-07 — C274: o aviso de mensagem apagada vai para a sala da conversa pelo número.** `DELETE /api/chat/conversas/:id/mensagens/:msgId`
  com `:id = '0<id>'` → 200 e o participante na conversa (sala `conversa:<id>`) recebe `mensagem_excluida { id, conversa_id }` (números).
  Pela rota (o `index.js` real da RN-06, com o cliente mínimo `tests/helpers/clienteSocketIo.js`) e estático em `routes/chat.js` (a sala
  com `Number(req.params.id)`).

## Contrato congelado

- Nenhuma rota muda de caminho, payload, resposta de sucesso ou **mensagem** de recusa. Muda só quem passa (RN-01..RN-04).
- `services/rotasDePermissoes.js` exporta `registrarRotasDePermissoes(app, { getDb, authenticateToken })` e os literais `L_ACESSO_NEGADO`,
  `L_GERENCIAR_PERMISSOES`.
- `mensagem_excluida` → `{ id: Number, conversa_id: Number }` na sala `conversa:<Number>` (o payload de hoje).

## Tasks (sort topológico)

- [ ] **T1 — tronco (núcleo: o registrador)** — `services/rotasDePermissoes.js` (as 13 rotas, corpo igual, régua nova), o `index.js`
  registra e perde as 13, `/auditoria/logs` com `canManageUsers`; `tests/api/rotasDePermissoes.api.test.js` (RN-01..RN-05) escrito
  primeiro (vermelho por `Cannot find module` e pela fiação estática); o vermelho **da matriz** é provado pelo controle positivo da régua
  (o `role !== 'admin'` de volta no registrador).
- [ ] **T2 — integração (núcleo: o servidor real)** — `tests/api/permissoesNoServidor.api.test.js` (RN-06, RN-07). Escrito e rodado
  **vermelho** contra a main antes da T1 (o super e o Admin levam 403 — o quadro da Fase 0; a C274 sem o aviso).
- [ ] **T3 — C274** — `routes/chat.js` (`Number`). Depende da T2 para o vermelho.
- [ ] **T4 — fechamento** — novidades (B855+, C273 e C274 resolvidas, C275–C277, A80, F (133), a seção da etapa, cabeçalho), spec 23,
  mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada — Etapa 134" de uma medição dos mapas do almoxarifado e do Compras), o
  "defeito que escapou" da retro da 132. CLAUDE.md: a trava **não** muda.

**Ordem de execução:** T2 (vermelho) → T1 → T3 → T2 verde. Executo em série, eu mesmo (as três tocam o `index.js` ou dependem dele; o
"um teste de servidor por vez" serializa de qualquer forma).

**Boot:** mexe no `index.js` → boot com pasta de dados vazia (a RN-06 já é isso dentro da suíte; a sonda da Fase 0 repete o quadro
depois). Sem migração (nenhuma coluna, nenhuma tabela): banco novo e antigo não se aplica.

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): a régua de gestão de volta ao
`role !== 'admin'` (RN-01: S e A caem); `canManageUsers` trocado por `isSuperAdmin` (RN-01: a cai); a recusa que grava (RN-01: o `return`
do 403 removido numa rota); o próprio comparado como texto (RN-02: `/usuario/05`); o `/verificar` sem a régua (RN-03); os logs de volta
ao exato (RN-04); uma rota de permissões de volta ao `index.js` (RN-05); o `DELETE …/modulos` que não apaga (RN-06: o alvo segue com
`financeiro`); o `Number` fora da sala (RN-07).
