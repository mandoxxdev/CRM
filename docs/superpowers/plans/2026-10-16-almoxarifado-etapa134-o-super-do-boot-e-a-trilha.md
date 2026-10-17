# Etapa 134 (núcleo + spec 23): o super administrador do boot (C280) e a trilha que faltava (C123, C36) — plano

> Origem: "Próxima tarefa detalhada — Etapa 134" do plano da 133. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa134-o-super-do-boot-e-a-trilha-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B860**, último C
> **C281**, última A **A82**. Esta etapa: **B861+**, **C282+**, **A83+**. Worktree `CRM-wt-e134`, branch `etapa-e134` (a partir da main
> `61a92c60`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sondas `scratchpad/e134/rev2-*` no `index.js` real): 0 Critical, 4 Important, 7 Minor — todos aceitos,
> antes de qualquer código de produção.** **I1** — num banco antigo **sem a coluna `ativo`**, a régua de "super ativo" rodaria no lugar do seed
> (antes do `ALTER … ativo`, que vem do callback do `PRAGMA`): "no such column", nada promovido e o primeiro boot sem super (medido:
> `rev2-order.log`). → o callback do `CREATE` garante `ativo` **antes** do `is_superadmin` (molde G6), e a falha da régua é **fechada**
> (log, nem promove nem cria; o próximo boot tenta de novo) — letra B; cenário novo **RN-01b′** (banco sem `ativo` nem `is_superadmin`).
> **I2** — `email` que não é texto no `PUT` (`123`, `{}`) derrubaria o processo se a régua chamasse `.trim()` dentro do callback → a régua
> devolve `false` para não-texto e nunca lança; o `PUT` lê `SELECT id, email`; cenários do `email` ausente (o 500 NOT NULL de hoje) e
> `123` (sem L4, o processo de pé). **I3** — `inspecaoIntegracao.api.test.js` (8) afirma "a decisão NÃO deixa rastro" — a mesma afirmação
> falsa da C36 → reescrito na T3 dizendo que estava errado; e o cenário de cobertura do `auditLabels.api.test.js` passa a ler os três
> vetores do `schema.js` (e o título "26 literais" atualizado, M7). **I4** — o caminho de recuperação do operador muda (apagar o seed e
> reiniciar não o traz mais com super ativo) → o procedimento novo vai para o guia, o manual, `docs/DEPLOY_COOLIFY.md` e a A83. **M1** a
> guarda antes do `generatePassword`/`persistSeedAdmin`; **M2** cenário do seed **renomeado**; **M3** o `admin@gmp.com.br` inativo sem super:
> promovido e o seed não nasce (como hoje) — declarado em D; **M4** o `/enviar` responde **200**; `entidade_id` = `reqRow.id`; **M5** a
> RN-07 com urgência `NORMAL`; **M6** `usuario_nome: user.nome || user.email`.
>
> **Trava de máquina:** `scratchpad/e134-lock.sh` (o mesmo diretório `maquina-testes.lock` das etapas anteriores). Um arquivo de teste de
> servidor por vez, inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

**Super ativo** = linha de `usuarios` com `COALESCE(is_superadmin,0) = 1 AND COALESCE(ativo,1) = 1` (a régua de `countActiveSuperAdmins`).
**E-mail do administrador padrão** = `admin@gmp.com.br` (o literal de hoje, sem mudança). **L4** (novo) = `O e-mail admin@gmp.com.br é
reservado ao administrador padrão — só um Super Administrador pode atribuí-lo`. **L5** (de hoje) = `Apenas Super Administradores podem
excluir usuários`.

- **RN-01 — o boot só promove o administrador padrão quando não há super ativo (C280).** Em cada boot, **antes** do seed: se não há super
  ativo, quem tem o e-mail `admin@gmp.com.br` (exato, como hoje) vira super; havendo um super ativo, ninguém é promovido. Num comando só
  (`UPDATE … WHERE email = ? AND COALESCE(is_superadmin,0) = 0 AND NOT EXISTS (SELECT 1 … super ativo)`). O `UPDATE` incondicional do
  callback do `PRAGMA table_info(usuarios)` some.
  Cenários (o `index.js` real, **reinício no mesmo data dir**): (a) o super S põe `admin@gmp.com.br` no administrador do sistema A (não
  super; S pode — RN-03) → reinício → A segue **não** super (`GET /api/usuarios/:A` `is_superadmin` 0; `DELETE /api/usuarios/:x` por A →
  403 L5). (b) **Banco antigo, sem a coluna** `is_superadmin` (criado à mão: `usuarios` sem a coluna, `admin@gmp.com.br` papel `admin` e um
  comum), sem `SEED_ADMIN_*` no env → o boot cria a coluna e promove o `admin@gmp.com.br` (`/api/auth/me` `is_superadmin` 1; o comum segue
  0; **nenhum** usuário novo). (c) **Banco sem super ativo** (o de (a), com o servidor parado: todos `is_superadmin = 0` no arquivo) →
  reinício → o `admin@gmp.com.br` é promovido e só ele.
- **RN-02 — o administrador semeado só nasce quando não há super ativo.** `seedAdminInicial`: depois da RN-01, se o e-mail do seed não
  existe **e** não há super ativo, cria (como hoje: env, arquivo ou gerado); se há super ativo, não cria e escreve no log
  `Admin inicial não recriado: já há Super Administrador ativo`. Cenários: (a) **pasta vazia** → o seed nasce super (todos os testes do
  servidor real já dependem disso; e este afirma `is_superadmin` 1 e papel `admin`). (b) **Banco do primeiro boot** (o seed já existe) →
  reinício → nenhum usuário novo (contagem igual). (c) o super S2 **exclui** o seed → reinício com o mesmo env → o seed **não** volta
  (login com a senha do seed → 401; contagem igual).
- **RN-03 — o e-mail do administrador padrão só é dado por um super (C280, defesa).** `POST /api/usuarios` e `PUT /api/usuarios/:id`: quem
  **não** é super e manda `email` que, sem espaços nas pontas e sem diferença de caixa, é `admin@gmp.com.br`, para um usuário que **não** o
  tinha (o `POST` sempre; o `PUT` quando o e-mail atual do alvo, normalizado igual, é outro) → **403 L4**, nada gravado. O super passa (200).
  Quem já tem o e-mail e é editado com ele igual → passa (200). Cenários: A (papel `admin`) troca o **próprio** e-mail para
  `admin@gmp.com.br` → 403 L4 e o e-mail não mudou; para `'  ADMIN@GMP.com.br '` → 403 L4; cria usuário com ele → 403 L4 e nenhuma linha;
  S põe em A → 200; A edita a si mesmo (nome) com o e-mail igual → 200; o comum C → 403 de hoje (`requireManageUsers`, sem mudança).
- **RN-04 — a aprovação automática grava a linha *Aprovação* (C123).** Quando `tentarAprovacaoAutomatica` aprova (status gravado), grava
  **uma** linha `auditoria_log_almoxarifado`: `entidade 'requisicao'`, `entidade_id` = a requisição, `acao 'APROVACAO'`, `usuario_id`
  **nulo**, `usuario_nome 'Sistema (automático)'`, `dados_novos { status, reservas, aprovacao: 'automatica', enviado_por_id, enviado_por_nome
  }` — depois de soltar a trava, **não fatal** (`audit.registrarAuditoriaDoAto`). Quando não aprova (PENDENTE), nenhuma linha. Cenários,
  pelas **duas portas** (`POST /requisicoes` e `POST /requisicoes/:id/enviar`): com saldo → 201 `aprovacao: 'automatica'` e uma linha com
  `status 'TOTALMENTE_RESERVADA'`; sem saldo → a linha com `status 'AGUARDANDO_ESTOQUE'`; `aprovacao_automatica = 0` → nenhuma linha; urgência
  `CRITICO` → nenhuma; a tabela da auditoria indisponível na hora → 201 com `aprovacao: 'automatica'` e a requisição aprovada (a falha só
  no log). `GET /auditoria?entidade=requisicao&acao=APROVACAO` traz a linha com `acao_rotulo 'Aprovação'`; `/auditoria/opcoes` não ganha
  usuário novo (o `usuario_id` nulo).
- **RN-05 — decidir inspeção grava a linha da inspeção (C36).** `inspectionService.decidirInspecao`, depois do `INSERT` da inspeção e das
  medidas, grava `entidade 'inspecao'`, `entidade_id` = a inspeção, `acao 'INSPECAO_DECIDIDA'`, `usuario_id`/`usuario_nome` de quem decidiu,
  `dados_novos { recebimento_id, recebimento_item_id, material_id, quantidade_aprovada, quantidade_reprovada, encaminhamento, conforme,
  medidas_registradas }`, `justificativa` = `observacoes` (ou nulo) — **não fatal**. Recusa (400: conta que não fecha, item já decidido) →
  nenhuma linha. Rótulos: entidade **Inspeção**, ação **Inspeção decidida**. Cenários pela **rota** (`POST /recebimentos/itens/:id/inspecionar`:
  7 + 3 com `DEVOLVER` → a linha com os números; `GET /auditoria?entidade=inspecao` → `entidade_rotulo 'Inspeção'`, `acao_rotulo 'Inspeção
  decidida'`) e pelo **serviço** (`decidirInspecao` direto: aprovação total → a linha com `conforme 1`); a 400 da conta → nenhuma linha; a
  tabela da auditoria indisponível → 201 e o saldo movido.
- **RN-06 — nenhum verbo do motor aparece cru na Auditoria.** Todo tipo de `TIPOS_MOVIMENTO ∪ TIPOS_RETENCAO ∪ TIPOS_DEDICADOS` (`schema.js`)
  tem rótulo em `auditLabels`: os 11 de hoje sem rótulo ganham — `RESERVA` *Reserva*, `LIBERACAO_RESERVA` *Liberação de reserva*,
  `RETRABALHO` *Retrabalho*, `QUARENTENA` *Quarentena*, `LIBERACAO_INSPECAO` *Liberação da inspeção*, `REPROVACAO_INSPECAO` *Reprovação na
  inspeção*, `DECISAO_INSPECAO` *Decisão de inspeção (estoque)*, `REMESSA_TERCEIRO` *Remessa a terceiro*, `RETORNO_TERCEIRO` *Retorno de
  terceiro*, `ESTORNO` *Estorno*, `AJUSTE_INVENTARIO` *Ajuste de inventário*. Pela tela: `/auditoria/opcoes` depois de uma decisão de
  inspeção e de uma reserva oferece *Quarentena*, *Reserva*, *Decisão de inspeção (estoque)* e *Inspeção decidida*, e nenhuma opção com o
  rótulo igual ao verbo.
- **RN-07 — integração que cruza (rota → rota → tela).** Com `aprovacao_automatica = 1`: requisição de material crítico **sem** saldo pelo
  `POST /requisicoes` → `AGUARDANDO_ESTOQUE` com a linha *Aprovação* do sistema; recebimento do material (retido) → decisão pela rota (todo
  aprovado) → a parte aprovada vai para a requisição (status reservado, comportamento de hoje); a Auditoria da requisição mostra a
  *Aprovação* (`usuario_nome 'Sistema (automático)'`) e a da inspeção a *Inspeção decidida*, com o filtro "Aprovação" (`acao=APROVACAO`)
  trazendo só a linha da requisição.

## Contrato congelado

- Nenhuma rota muda de caminho, payload ou resposta de sucesso. Muda: `POST`/`PUT /api/usuarios` ganham o **403 L4** (RN-03; no `PUT` depois
  do 404 e antes de qualquer outra validação; no `POST` depois dos 400 de campos e senha).
- `services/superPadrao.js` (novo) exporta `EMAIL_SUPER_PADRAO`, `ehEmailDoSuperPadrao(email)`, `LITERAL_EMAIL_RESERVADO` (L4),
  `promoverSuperPadraoSemSuperAtivo(db) → Promise<number>` (linhas promovidas) e `haSuperAtivo(db) → Promise<boolean>`.
- Auditoria: as linhas novas das RN-04/RN-05 com as formas acima; os 11 rótulos da RN-06; entidade `inspecao`.

## Tasks (sort topológico)

- [ ] **T1 — tronco (núcleo: o boot e o cadastro)** — `services/superPadrao.js`; `index.js`: a promoção e o seed encadeados em
  `seedAdminInicial` (RN-01, RN-02), o `UPDATE` do `PRAGMA` sai, o 403 L4 no `POST`/`PUT` (RN-03). Teste `tests/api/superPadraoNoBoot.api.test.js`
  (o `index.js` real com reinício no mesmo data dir; o banco antigo criado à mão; e a fiação estática: o `UPDATE` incondicional não sobra),
  escrito e rodado **vermelho** antes do código.
- [ ] **T2 — C123** — `routes/almoxarifado.js` (`tentarAprovacaoAutomatica`). Teste `tests/api/auditoriaDaAprovacaoAutomatica.api.test.js`
  (RN-04), vermelho antes.
- [ ] **T3 — C36 + rótulos** — `inspectionService.js`, `auditLabels.js`. Teste `tests/api/auditoriaDaInspecao.api.test.js` (RN-05, RN-06,
  RN-07), vermelho antes.
- [ ] **T4 — fechamento** — novidades (B861+, C123/C36/C19/C25/C105/C111/C280 resolvidas, a C36 corrigida dizendo que estava errada, C282+,
  A83, D (134), F (134), a seção da etapa, cabeçalho), spec 23, mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada — Etapa 135"),
  o "defeito que escapou" da retro da 133. CLAUDE.md: a trava **não** muda.

**Ordem:** T1 → T2 → T3, em série, eu mesmo. **Galhos em paralelo: 0** — T2 e T3 seriam independentes por regra (arquivos e regras
diferentes), mas o "um teste de servidor por vez" serializa de qualquer forma e o RN-07 cruza as duas.

**Boot:** mexe no `index.js` → pasta vazia (RN-02a) **e** banco antigo (RN-01b, e o reinício da RN-02b). **Migração:** nenhuma coluna nem
tabela nova (a `is_superadmin` já é criada; a RN-01b prova o banco sem ela).

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): a promoção sem a guarda do super
ativo (RN-01a cai); a promoção de volta ao callback do `PRAGMA` (RN-01 estático); o seed sem a guarda (RN-02c cai); a comparação do L4 com
caixa (RN-03 `ADMIN@…` cai); o L4 sem a exceção do e-mail igual (RN-03 "edita a si mesmo" cai); a auditoria da aprovação automática
removida (RN-04 cai); `registrarAuditoria` (fatal) no lugar do `…DoAto` (RN-04 "tabela indisponível" cai); a auditoria da inspeção
removida (RN-05 cai); um rótulo removido (RN-06 cai).

## Execução — o que aconteceu

*(preenchido durante a etapa)*
