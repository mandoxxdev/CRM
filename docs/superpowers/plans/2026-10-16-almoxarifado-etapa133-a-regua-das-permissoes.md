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

- [x] **T1 — tronco (núcleo: o registrador)** — `services/rotasDePermissoes.js` (as 13 rotas, corpo igual, régua nova), o `index.js`
  registra e perde as 13, `/auditoria/logs` com `canManageUsers`; `tests/api/rotasDePermissoes.api.test.js` (RN-01..RN-05) escrito
  primeiro (vermelho por `Cannot find module` e pela fiação estática); o vermelho **da matriz** é provado pelo controle positivo da régua
  (o `role !== 'admin'` de volta no registrador).
- [x] **T2 — integração (núcleo: o servidor real)** — `tests/api/permissoesNoServidor.api.test.js` (RN-06, RN-07). Escrito e rodado
  **vermelho** contra a main antes da T1 (o super e o Admin levam 403 — o quadro da Fase 0; a C274 sem o aviso).
- [x] **T3 — C274** — `routes/chat.js` (`Number`). Depende da T2 para o vermelho.
- [x] **T4 — fechamento** — novidades (B855+, C273 e C274 resolvidas, C275–C277, A80, F (133), a seção da etapa, cabeçalho), spec 23,
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

## Execução — o que aconteceu

- **Fase 0** — medida por mim no servidor real (`scratchpad/e133/sonda-perm.js`, `index.js` com pasta vazia, quatro perfis): o super com
  papel `usuario` e o `Admin` levavam 403 nas 13 rotas e nos logs, e o `PUT` do cadastro passava (o quadro do design). O efeito na tela foi
  lido no client (`Admin.js`, `UsuarioForm.js`, `ProtectedModuleRoute.js`).
- **Fase 2 antes do código de produção:** 2 Critical + 1 Important + 4 Minor, todos aceitos (ver o topo). O C1 corrigiu a medição do
  portão da OS (**a Fase 0 estava errada** — corrigido no design dizendo que estava). Os dois testes foram escritos e rodados **vermelhos**
  antes do código: o do registrador 0/10 (`Cannot find module` e a fiação), o do servidor real 1/8 (o único verde era a metade negativa
  "antes: o alvo sem financeiro toma 403"; a C274 reproduzida: o aviso não chegava). Design e plano `0c140e9e`.
- **Commits:** T3 (C274) `d5282228`; T1 + T2 (C273, os dois testes) `5fda2eda`; Fase 5 `cdaec0f3`.
- **Divergências do plano:** (1) T1 e T2 foram num commit só (o teste do servidor real é a prova da T1 pela rota; separados, o primeiro
  commit ficaria com um teste vermelho na suíte); (2) o serviço foi gerado do bloco do `index.js` por script (`scratchpad/e133/gera-servico.js`,
  âncoras contadas: 1 + 1 + 1 + 10 réguas, 13 handlers com `getDb()`), e o r1 conferiu com `diff -w` contra `8e42bf8e` — só as réguas e
  os literais em constante mudaram; (3) o `/verificar` sem linha responde `{ motivo }` sem `permitido` (corpo de hoje) — o teste prende
  isso e virou **C281**.
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): **10** antes da Fase 5
  (`scratchpad/e133/bateria.js` S1..S10) e **8** da Fase 5 (`bateria-f5.js` D1..D8) — todas caem pelo cenário certo, restauradas com o md5
  de antes.
- **Boot** com pasta de dados vazia: o `permissoesNoServidor.api.test.js` sobe o `index.js` real dentro da suíte; a sonda da Fase 0
  repetida depois do código mostrou o quadro invertido (S e A 200 em tudo, o comum com os literais de hoje). **Migração:** nenhuma.
- **CLAUDE.md:** a seção da trava **não mudou** (nada aqui mexe em saldo).
- **Suíte antes do commit de código (`5fda2eda`):** `test:api` **445/445**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **131** suítes / **1768** testes; `CI=true build` *Compiled successfully*.
- **Fase 5** — três revisores frescos em paralelo sob a trava de máquina; o de sabotagem na worktree própria `CRM-wt-e133-r3` (removida
  com as junções desfeitas antes). Eu não rodei teste enquanto eles trabalhavam.
  - **Regra (r1): 0 Critical/Important, 2 Minor** (sonda `r1-perfis.js`: super com `role` nulo, `is_superadmin` `'1'`, `ADMIN`, o desativado
    → 401): o `/verificar` sem `permitido` (anterior → **C281**); quem gerencia usuários grava permissões de um super ou oculto (anterior,
    sem efeito — o super pula o portão).
  - **Permissão (r2): 0 desta etapa; 1 Important anterior em duas formas, reproduzidas** (sonda `r2-auth.js`, tabela de 11 perfis × rotas):
    o administrador do sistema não super troca a senha de um super e entra como ele (**C279**, ligado à **B853**); e troca o próprio e-mail
    para `admin@gmp.com.br` e vira super no próximo boot (**C280**, consulta **A82**). Sem código nesta etapa (fora do escopo; a C279 é da B853).
  - **Sabotagem (r3): 22** sabotagens novas, **11** caíram, **8** sobreviveram por falta de asserção (todas no "corpo de hoje" das rotas
    movidas, e o aviso fora da conversa) → viraram cenários (`cdaec0f3`) e caem na bateria D; **3** equivalentes provados (R1, R2: as três
    réguas têm o mesmo corpo hoje; R5: o `db` nunca é reatribuído).
- **Suíte final (depois da Fase 5, antes da documentação):** `test:api` **445/445**; `test:almoxarifado` **44/0**; `test:validation`
  4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **131** suítes / **1768** testes; `CI=true build` *Compiled successfully*.
- **T4 — fechamento** (o commit de documentação — ver `git log`): novidades (cabeçalho, A80–A82, B853 atualizada, B855–B860, C273 e C274
  resolvidas, C275–C281, D (133), F (133), a seção da etapa, "Onde estamos"), spec 23 (o núcleo, com as duas correções), mapa, guia, manual
  (5.2f), este plano, o "defeito que escapou" da retro da 132.

## Tasks — estado

- [x] **T1** + **T2** `5fda2eda` (Fase 5 `cdaec0f3`) · [x] **T3** `d5282228` · [x] **T4** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5, só testes). Nenhum teste antigo mudou.
2. **Achados da revisão:** Fase 2 — **2 Critical + 1 Important + 4 Minor, todos reais** (o C1 reproduzido por sonda: a medição da OS estava
   errada). Fase 5 — r1 **2 Minor** reais, anteriores; r2 **1 Important** real anterior, em duas formas reproduzidas (C279, C280); r3
   **8** sobreviventes reais (viraram cenários) + **3** equivalentes provados; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo (as tasks tocam o `index.js` ou dependem dele), **0** retrabalho; **1** revisor na Fase 2,
   **3** em paralelo na Fase 5 sob a trava e **1** agente de medição (só leitura) para a próxima etapa.
4. **Defeito que escapou:** **0** da 133 (medido na 134: os três revisores da Fase 5 da 134 rodaram sobre o cadastro e o boot de usuários no servidor real e não acharam defeito das rotas de permissões, dos logs, do portão da OS nem do aviso do chat). A **C280**, achada pelo r2 da 133, era anterior e foi resolvida na 134 (`31947ced`).

## Próxima tarefa detalhada — Etapa 134

*(A série desta etapa foi B855–B860, C275–C281, A80–A82 — a 134 começa em **B861**, **C282**, **A83**; confira com `grep -oE` antes.)*

**Medido em 2026-10-16 (fechamento desta etapa), como o plano da 132 pediu — as candidatas do núcleo sem o P.O. tinham acabado aqui.** Um
agente de medição leu o mapa do almoxarifado (`specs/modulo-almoxarifado/README.md`: 🟡 = 00, 01, 05, 06, 21, 22, 23) e o do Compras
(`specs/modulo-compras/README.md`: **nenhuma** feature 🔴/🟡 — só a ⚪ D-90, pergunta ao P.O., linha 75), classificou cada pendência em
livre × depende do P.O., e cruzou com os C abertos da letra C. Somado à Fase 5 desta etapa, as livres de maior valor:

1. **C280 — o e-mail `admin@gmp.com.br` vira super administrador a cada boot (núcleo, segurança) — a principal.** `server/index.js` ≈2590:
   `UPDATE usuarios SET is_superadmin = 1 WHERE email = 'admin@gmp.com.br' AND COALESCE(is_superadmin, 0) = 0` roda em todo boot; quem
   gerencia usuários troca o próprio e-mail (`PUT /api/usuarios/:id`, `requireManageUsers`) para esse e vira super no reinício (reproduzido
   pelo r2 desta etapa, `scratchpad/e133/r2-auth.js`: o `DELETE /usuarios/:id` — só super — passou de 403 a 200). **Vizinho a medir junto:**
   `seedAdminInicial` (≈2164) procura o seed **pelo e-mail** (`SEED_ADMIN_EMAIL` ou o persistido no data dir) e, se não acha, **cria** um
   super novo com a senha persistida — trocar o e-mail do administrador semeado faz o próximo boot recriar um super (quem tem o arquivo de
   senha do data dir entra). **Candidatos (reversíveis):** promover pelo e-mail só quando **não há** super ativo (o boot como
   recuperação, não como regra); e/ou recusar no `PUT`/`POST` de usuário o e-mail do seed a quem não é super. **Atenção:** produção pode
   depender da promoção (rode a **A82** primeiro); a trava do último super (`wouldRemoveLastSuperAdmin`) e o `countActiveSuperAdmins` são a
   régua de "há super ativo". Teste de rota com o `index.js` real e **reinício** no mesmo data dir (molde: `permissoesNoServidor.api.test.js`
   + o reinício do `r2-auth.js`). Boot com pasta vazia **e** com banco antigo (o seed já existente) obrigatório.
2. **C123 + C36 — a trilha de auditoria que falta (spec 23, perna Auditoria; livres).** `docs/almoxarifado-novidades-por-etapa.md` C123: a
   aprovação **automática** não grava a linha *Aprovação* na Auditoria (`server/routes/almoxarifado.js` ≈3941–3954; só o `/aprovar` manual
   grava, ≈4212); C36: decidir uma inspeção não deixa linha (`inspectionService.js` não chama a auditoria). **Medir primeiro:** as linhas de
   `requisicao`/`APROVACAO` depois de uma auto-aprovação, se o `decidirInspecao` grava alguma trilha, e qual entidade/ação usar sem quebrar
   os filtros da tela de Auditoria. Cabe junto da C280 se ela for pequena; senão é a 135.
3. **O entregável de irmãos (05, livre)** — `specs/modulo-almoxarifado/05-separacao-picking/README.md` ≈983 e D (127): a fila já divide o
   separável entre itens do mesmo material (127), o **entregável** com dois itens do mesmo material nunca foi medido (reservado 4 + 4,
   separados 4 e 3, entrega parcial). Depois da 2.
4. **Limpeza de documento (pequena, junto de qualquer uma):** C19, C105 e C111 estão corrigidas no código e sem "RESOLVIDO" na letra C
   (o agente de medição: C19 na 67, `requisitionCreateService.js:88`; C105/C111 na 129, `receiptService.js` ≈1026/1065); a C25
   provavelmente também (conferir as 5 rotas de upload). Marcar **depois de conferir** cada uma.

**Dependem do P.O. — NÃO implemente:** **B853** (agora com a **C279**: o administrador do sistema troca a senha de um super e entra como
ele — a régua "só super edita super" é a opção (b) da B853), **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de recebimento
(E2)**, a **C268**, a **C269**, as perguntas da **C275** (quem exclui aprovação), **C276** (Engenharia) e **C277** (quem cria OS); na 05, os
itens de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63.

**Escolhida: a C280 (1)**, com a C123 + C36 (2) junto se couber — as duas do núcleo/spec 23, reversíveis, sem o P.O.

**O que já está pronto e não precisa reabrir:** as rotas de permissões (`services/rotasDePermissoes.js`, com o teste do registrador e o do
servidor real), os logs e o portão da OS com a régua do administrador, o `enrichUserFromDb` (131) e o socket do chat (132). O teste que sobe o
`index.js` real (`permissoesNoServidor.api.test.js`) é o molde para a C280 — falta só o reinício no mesmo data dir.
