# Etapa 134 (núcleo + spec 23): o super administrador do boot (C280) e a trilha que faltava (C123, C36) — design

> Origem: "Próxima tarefa detalhada — Etapa 134" do plano da 133
> (`docs/superpowers/plans/2026-10-16-almoxarifado-etapa133-a-regua-das-permissoes.md`). Worktree `CRM-wt-e134`, branch `etapa-e134`
> (a partir da main `61a92c60`). Numeração conferida com `grep -oE` nas novidades em 2026-10-16: última B **B860**, último C **C281**,
> última A **A82** — esta etapa usa **B861+**, **C282+**, **A83+**.

## Fase 0 — o que foi medido (não suposto)

### C280 — o e-mail que vira super a cada boot (lido no `index.js`)

- `server/index.js` ≈2588: `UPDATE usuarios SET is_superadmin = 1 WHERE email = 'admin@gmp.com.br' AND COALESCE(is_superadmin, 0) = 0`
  roda em **todo** boot, dentro do callback do `PRAGMA table_info(usuarios)`. Não olha se já há super. O r2 da 133 reproduziu a escalada
  (`scratchpad/e133/r2-auth.js`): o administrador do sistema não super troca o próprio e-mail (`PUT /api/usuarios/:id`, `requireManageUsers`)
  para esse, o servidor reinicia e o `DELETE /api/usuarios/:id` (só super) passa de 403 a 200.
- **Para que a promoção existe:** a coluna `is_superadmin` nasceu depois dos usuários; num banco antigo ela chega com 0 para todos, e a
  promoção fazia do administrador padrão o primeiro super. Depois do primeiro boot com a coluna, num banco em que o administrador padrão já
  é super, a linha não faz nada — **só age quando alguém tem esse e-mail sem ser super**, que é exatamente a escalada (ou o caso raro de um
  super ter rebaixado o administrador padrão de propósito, que o boot desfazia).
- **O vizinho, `seedAdminInicial`** (≈2164, chamado do callback do `CREATE TABLE usuarios` desde a G6): procura o seed **pelo e-mail**
  (`SEED_ADMIN_EMAIL`, ou o persistido em `.runtime-secrets.json`, ou `admin@gmp.com.br`) e, se **não acha**, cria um super novo com a senha
  do env ou do arquivo (gera e persiste se não houver). Consequência medida na leitura: o super que **apaga** ou **renomeia** o administrador
  padrão (porque a senha vazou, por exemplo) o vê voltar no próximo reinício, com a senha antiga do arquivo/env.
- **Quem troca e-mail:** só `POST /api/usuarios` e `PUT /api/usuarios/:id` (`requireManageUsers`; `grep "UPDATE usuarios SET"`: o
  `PUT /api/conta` não mexe no e-mail). O `is_superadmin` do corpo já é tirado de quem não é super (`sanitizeSuperAdminPayload`); o e-mail não.
- **Régua de "há super ativo":** `countActiveSuperAdmins` (`systemPermissions.js`) — `COALESCE(is_superadmin,0) = 1 AND COALESCE(ativo,1) = 1`.
  Pela API não se chega a zero super ativo: desativar e excluir o último são recusados (`wouldRemoveLastSuperAdmin`), e quem não é super não
  mexe no campo. Zero só acontece em banco antigo (a coluna recém-criada) ou por edição direta do banco.
- **Produção:** a `docs/DEPLOY_COOLIFY.md` diz que o `SEED_ADMIN_EMAIL` é opcional (padrão `admin@gmp.com.br`) — produção provavelmente tem o
  seed com esse e-mail, já super. A **A82** (133) diz quem tem o e-mail; esta etapa acrescenta a **A83** (quantos super ativos há): com pelo
  menos um, a promoção do boot deixa de existir para produção.
- **Achado de passagem (não muda nesta etapa, vira C282):** o boot (≈2196) apaga todo usuário cujo **nome** contém "administrator" (sem
  diferença de caixa), exceto o de e-mail `admin@gmp.com.br` — e o cadastro grava nome em maiúsculas.

### C123 — a aprovação automática não grava a trilha (sonda `scratchpad/e134/sonda-f0-audit.js`, `testApp` real)

`aprovacao_automatica = 1`, requisição de material com saldo pelo `POST /api/almoxarifado/requisicoes` → 201 `TOTALMENTE_RESERVADA`,
`aprovacao: 'automatica'`; a requisição fica com `aprovador_nome = 'Sistema (automático)'`, `aprovador_id` nulo. Na Auditoria: **uma** linha —
`movimentacao / RESERVA` (do motor), em nome de quem pediu. **Nenhuma** `requisicao / APROVACAO`. Confirmado. A porta é uma só
(`tentarAprovacaoAutomatica`, `routes/almoxarifado.js` ≈3907), chamada pelo `POST /requisicoes` e pelo `POST /requisicoes/:id/enviar`.

### C36 — decidir inspeção "nunca gerou linha de auditoria": **a C36 estava errada** (mesma sonda)

Decidir 7 aprovados + 3 reprovados pelo `POST /recebimentos/itens/:id/inspecionar` grava **duas** linhas: `movimentacao / DECISAO_INSPECAO`
(do motor — `stockService` audita `acao: tipo` em todo lançamento) e `nao_conformidade / NC_ABERTA`. Então há rastro na Auditoria — mas:
(1) sob **Movimentação**, não sob a inspeção nem sob "Plano de inspeção" (onde a C36 procurou); (2) com `quantidade: 10, saldo_posterior: 10`
— **sem** aprovado × reprovado, sem encaminhamento, sem o número da inspeção; (3) com o verbo **cru** na tela: `acao_rotulo:
"DECISAO_INSPECAO"`. O que a C36 dizia ("nunca gerou linha") é falso desde que o motor audita; o que ela queria (a tela responder "quem
decidiu o quê") continua faltando.

**Achado da mesma medição:** a tela de Auditoria mostra **crus** os verbos de 11 tipos de movimentação que o motor grava — `node -e` sobre
`TIPOS_MOVIMENTO ∪ TIPOS_RETENCAO ∪ TIPOS_DEDICADOS` × `rotularAcao`: `RESERVA`, `LIBERACAO_RESERVA`, `RETRABALHO`, `QUARENTENA`,
`LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO`, `DECISAO_INSPECAO`, `REMESSA_TERCEIRO`, `RETORNO_TERCEIRO`, `ESTORNO`, `AJUSTE_INVENTARIO`.
O teste de cobertura (`auditLabels.api.test.js`, "as tres fontes") só lê `movementTypes` (entrada, saída, devolução) — a régua deixava a
retenção de fora. Sonda: `/auditoria/opcoes` oferece `QUARENTENA`, `RESERVA`, `DECISAO_INSPECAO` como opção de filtro.

### Limpeza de documento (conferida uma a uma)

- **C19** (data de necessidade ilegível) — corrigida na **Etapa 67**: `requisitionCreateService.normalizarDataNecessidade` recusa 400 o que
  não é AAAA-MM-DD de um dia que existe; as três portas de criação (`routes/almoxarifado.js` ×2, `routes/requisicoesMaterial.js`) passam por
  `createRequisicao`, e nenhuma rota regrava `data_necessidade` da requisição (`grep`).
- **C25** (upload com 500 opaco) — corrigida na **Etapa 86**. Sonda `scratchpad/e134/sonda-c25.js` nas cinco rotas: tipo errado → **400**
  com a frase da rota (*"Apenas imagens são permitidas"*, *"Certificado deve ser PDF ou imagem"*, *"Comprovante deve ser PDF ou imagem"*,
  *"Assinatura deve ser imagem (PNG, JPEG ou WebP)"*); grande demais → **413** *"Arquivo grande demais (máximo 10 MB)"* (2 MB na assinatura).
- **C105** (conferência com `status: APROVADO`) — corrigida na **Etapa 129**: `conferirRecebimento` recusa 400 `NAO_APROVA` antes de tudo.
- **C111** (conferência de nota processada) — corrigida na **Etapa 129**: `assertConferenciaPermitida` recusa 409 `DEPOIS_DA_ENTRADA` com o
  recebimento `PROCESSADO`/`APROVADO` ou com item já entrado, e o `UPDATE` do item confere no próprio comando.

## Decisões (todas reversíveis; vão para a letra B)

1. **A promoção do boot vira recuperação** (B861): promove `admin@gmp.com.br` **só quando não há nenhum super ativo**, num comando só
   (`… AND NOT EXISTS (super ativo)`), e passa a rodar **antes** do seed, no mesmo encadeamento (deterministico). Descartados: apagar a
   promoção (o banco antigo ficaria sem super — ninguém gerencia nada); manter (a escalada); promover só se o e-mail for o do seed (não fecha:
   o seed padrão **é** esse e-mail).
2. **O seed só nasce se não há super ativo** (B862): o administrador padrão apagado ou renomeado não volta com a senha antiga. Banco novo:
   igual. Consequência declarada: banco antigo sem a coluna, com `SEED_ADMIN_EMAIL` diferente de `admin@gmp.com.br` → o `admin@gmp.com.br`
   é promovido e o seed novo **não** nasce (hoje nasciam os dois). Descartado: reservar o e-mail do seed também (B863).
3. **O e-mail `admin@gmp.com.br` só é dado por um super** (B863): `POST`/`PUT /api/usuarios` recusam **403** quando quem não é super põe esse
   e-mail (sem diferença de caixa e espaços) num usuário que **não** o tinha. Editar quem já o tem (o próprio administrador padrão, com o
   e-mail igual) segue. Defesa em profundidade: com a decisão 1 a escalada já não fecha, mas a recuperação promoveria quem pegou o e-mail.
   Descartados: recusar sempre (o administrador do sistema não editaria mais o administrador padrão — é a **B853**/C279, do P.O.); reservar
   também o `SEED_ADMIN_EMAIL` (sem efeito de acesso: quem o toma não vira nada).
4. **A aprovação automática grava a linha *Aprovação*** (B864): `requisicao / APROVACAO`, `usuario_id` nulo, `usuario_nome 'Sistema
   (automático)'` (o mesmo nome que a requisição guarda), `dados_novos { status, reservas, aprovacao: 'automatica', enviado_por_id,
   enviado_por_nome }`, não fatal (`registrarAuditoriaDoAto`), depois de soltar a trava. Descartados: verbo novo `APROVACAO_AUTOMATICA` (o
   filtro "Aprovação" deixaria de achar — e a pergunta é "quem aprovou"); `usuario_id` de quem enviou (a lista de usuários do filtro ganharia
   o mesmo id com dois nomes, e a linha afirmaria que a pessoa aprovou).
5. **Decidir inspeção grava a linha da inspeção** (B865): `inspecao / INSPECAO_DECIDIDA`, `entidade_id` = a inspeção, em nome de quem
   decidiu, `dados_novos { recebimento_id, recebimento_item_id, material_id, quantidade_aprovada, quantidade_reprovada, encaminhamento,
   conforme, medidas_registradas }`, `justificativa` = as observações; não fatal, logo depois de gravar a inspeção e as medidas. Rótulos
   novos: entidade **Inspeção**, ação **Inspeção decidida**. Descartados: só rotular a linha do motor (não diz aprovado × reprovado nem o
   número); entidade `recebimento_item` (o documento da decisão é a inspeção, e o filtro por entidade a separa do excedente).
6. **Os 11 verbos crus ganham rótulo** (B866), e o cenário de cobertura passa a ler os três vetores do `schema.js`. O `DECISAO_INSPECAO` do
   motor vira **"Decisão de inspeção (estoque)"** — para não se confundir com a linha nova da inspeção.

## Fora (depende do P.O. ou de outra etapa)

C279/B853 (quem edita super), C282 (o boot que apaga "administrator" — registrado, candidata), e a lista de "Dependem do P.O." do plano da 133.
