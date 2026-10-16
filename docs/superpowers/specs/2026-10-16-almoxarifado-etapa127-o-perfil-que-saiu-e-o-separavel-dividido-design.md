# Almoxarifado — Etapa 127: o perfil que saiu, e o separável dividido entre itens do mesmo material (design)

> Origem: "Próxima tarefa detalhada — Etapa 127" do plano da 126 (**C264**, do núcleo; e, se couber, a Fase 0 do mapa para a feature
> 🟡 de maior valor). Worktree `CRM-wt-e127`, branch `etapa-e127` (a partir da main `2289b7d2`). Numeração conferida com `grep -oE` em
> `docs/almoxarifado-novidades-por-etapa.md` (2026-10-16): última B **B817**, último C **C264**, última A **A75** → esta etapa **B818+**,
> **C265+**, **A76+**.

## Parte 1 — C264: o perfil retirado continua na tela até sair e entrar

### Medido

- **O servidor manda a chave SEMPRE.** `buildAuthUserPayload` (`server/index.js`, usado por `POST /api/auth/login` e `GET /api/auth/me`)
  devolve `perfil_almoxarifado: moduleContext?.perfil_almoxarifado || null` e `perfil_frota` do mesmo jeito — `null` para quem não tem.
  `GET /api/usuarios/:id/grupos` devolve `usuario` = `getUsuarioModuleContext` (as cinco chaves `role`, `is_superadmin`, `admin_modulos`,
  `perfil_almoxarifado`, `perfil_frota`, os perfis em `null` quando não há), ou `usuario: null` para usuário inativo (o cliente não faz o
  merge com `null` — `getEffectiveUser` exige `cached?.usuario`). **Nenhum dos três omite a chave** — não há caminho em que a correção
  não mude nada.
- **O cliente joga o `null` fora.** `client/src/utils/systemPermissions.js:105-106`:
  `perfil_almoxarifado: extra.perfil_almoxarifado ?? base.perfil_almoxarifado ?? null` (e `perfil_frota` igual). `null ?? 'ADMINISTRADOR'`
  é `'ADMINISTRADOR'`: o valor antigo do `localStorage` (o `base` do boot, `AuthContext.refreshUserFromServer`) ou do usuário logado (o
  `base` de `getEffectiveUser`, `permissionsCache.js:87`) sobrevive. `admin_modulos` e `is_superadmin` já usam `!== undefined` (chave
  presente vale). O `foto_src` já tinha o mesmo cuidado do lado do servidor (comentário da Etapa 82: "SEMPRE presente (null sem foto)").
- **Quem chama com `extra = {}`** (tem de continuar preservando): `applyFreshUser`, o boot que falhou o `/auth/me`
  (`mergeUserPermissions(parsedUser, {})`), o `login` antes do refresh, e `seedPermissionsFromAuthUser`. Com `{}` a chave é `undefined` —
  preserva.
- **Reproduzido** (TDD vermelho antes do código, `client/src/context/AuthContextPerfilRetirado.test.js` com o `AuthProvider` e o
  `permissionsCache` reais, só o HTTP mockado): o administrador do sistema com `ADMINISTRADOR` guardado e o `/auth/me` dizendo `null` abre
  Configurações → Famílias com *Nova Família*; o usuário comum na mesma situação abre a tela inteira em vez do *"Acesso restrito"*; o
  `refreshUser` não tira; o cache de `/usuarios/:id/grupos` com `null` não tira. **6 vermelhos de 10** (os 4 verdes são os controles).
- **O servidor nunca foi enganado:** cada rota lê o perfil do banco (`services/systemPermissions.js:199`). É só a tela.

### Escolha (B818 — core × módulo)

A correção é no **núcleo** (`mergeUserPermissions` serve o CRM inteiro, inclusive a Frota): a chave **presente** vale, inclusive `null`;
só a chave **ausente** (ou `undefined`) preserva. Os **dois** perfis (almoxarifado e frota) — é a mesma linha e o mesmo defeito.
**Descartado:** (a) só o do almoxarifado (deixaria o da Frota com o mesmo defeito, conhecido); (b) a tela de Configurações reler
`/almoxarifado/minhas-permissoes` (consertaria uma tela e deixaria as outras que usam `podeGravarConfigAlmox`/`hasAlmoxAdminPerfil`);
(c) avisar a sessão aberta na hora (socket ou consulta periódica) — é mudança de produto do núcleo; o efeito agora é **ao recarregar a
página** (o boot pergunta ao `/auth/me`) ou no próximo `refreshUser` (Minha Conta, cadastro de usuário). **Consequência aceita:** se o
banco falhar na leitura do perfil dentro de `getUsuarioModuleContext` (o erro é engolido e o perfil sai `null`), a tela esconde os botões
até o próximo refresh — antes ela mostrava o perfil antigo. Falha **fechada** só na tela; o servidor decide igual. **Reversível** (uma
linha por perfil).

## Parte 2 — Fase 0 do mapa: as features 🟡 medidas

Duas leituras em paralelo (agentes só de leitura) cruzadas com o que as specs já mediram, e uma sonda (`server/tests/sonda/e127fase0.js`,
não versionada, rodada uma vez, sozinha).

| Feature | O que falta para 🟢 (mapa) | Medido agora | Depende do P.O.? |
|---|---|---|---|
| **05** Separação | produto: lista de separação como entidade, rota de picking, troca de série, kits/localização de kit | nada disso existe (sem tabela de lista, sem tipo Kit em `TIPOS_LOCALIZACAO`, `substituicoes_origem_requisicao` sem série) | **sim** — produto, nenhuma B aberta |
| 05 | integridade: **a linha da fila que não divide** (D (95)) | **existe** — `listarFilaSeparacao` calcula o `separavel` de cada linha sozinho; sonda C1: 4 livres, dois itens de 4 → a fila diz 4 e 4, a porta recusa o 4+4 | **não** (B468 já decidiu: a separação divide) |
| 05 | **(novo, da sonda) o modal divide errado quando o item tem reserva** | sonda C2: dois itens reservados 4+4 → o detalhe dá `saldo_separavel` 4 e 4, o modal abre **4 e 0** (subtrai do segundo o que o primeiro separa **da própria reserva**), a porta aceita 4+4. C3: reservado 4 + livre 2 → o modal abre 4 e **0**, a porta aceita 4+**2**. O aviso "chegou material" (`separavelAgoraPorItem`) usa a mesma régua → **C265** | **não** |
| 05 | C209 (a contagem abaixo do reservado não avisa) | existe — o `aviso_caixa` só olha a caixa sem reserva (`stockService.js:2442-2446`) | não (B711 só adiou) |
| 05 | C198 (equipe de dois) | por desenho — `requisitionService.js:565-566`, `:611-620` | **sim** (B505 (ii), decisão de processo) |
| 05 | C186 | resolvido com aviso na 104 (B704) — o "falta" da 102 que ainda o cita é histórico | só se quiser recusar (B704 (a)) |
| **06** Aprovações | material fora da lista técnica → Engenharia; dupla aprovação de ajuste | Engenharia não existe; dupla aprovação é a **B11** | **sim / bloqueado** |
| **21** Relatórios | previsto × realizado | bloqueado — BOM/OP não existem | bloqueado |
| 21 | **tempo médio de recebimento** | não existe; datas existem (`data_recebimento` no cabeçalho, `entrada_estoque_em` por item, só volta a NULL quando nada entrou); **nenhuma spec define** a régua (chegada → estoque é a natural, deduzida) | não, mas a régua é **deduzida** (letra E) |
| 21 | valorização por cliente | decisão de negócio | **sim** |
| 21 | PDF | corte D da Etapa 13 | não — médio |
| 21 | perdas (seção 27, "Gestão") | só a listagem `tipo=PERDA`, sem valor; **o item não estava no checklist da spec 21** (furo da spec) | não — pequeno |
| **22** Integrações | BOM, OP, centro de custo | inexistentes / sem uso | bloqueado |
| 22 | workflow do pedido; idempotência da importação; segunda camada no Compras | existem os três furos (`pedidoCompraService.js:676-714`, `:896-901`; `routes/compras.js` só `checkModulePermission`) | **sim** (B13, B101/G30, G38) |
| 22 | aviso de rejeição da Qualidade ao comprador | falta; o alerta `MATERIAL_REPROVADO` vai para `alertas_estoque_emails`; não há comprador gravado no pedido (D2) | pouco ("quando o negócio pedir", D7) |
| **00** Fundação | migração para Postgres | planejada para depois do almoxarifado | — |

### Escolha (B819)

**A feature 05: o separável dividido entre itens do mesmo material — na fila e no modal, com o número da porta.** É número errado na
tela de trabalho do almoxarife, nos dois sentidos: a fila promete o que a porta recusa (C1) e o modal esconde o que a porta aceita (C2,
C3 — o almoxarife que confia no pré-preenchimento deixa material reservado na prateleira). A regra já está decidida (B468); falta a fila e
o modal usarem a conta da porta. **Descartado agora (ficam para a 128):** (a) o **tempo médio de recebimento** (21) — valor de gestão,
mas a régua é deduzida e ninguém a definiu: vai como próxima tarefa com o desenho pronto e a régua na letra E; (b) a **C209** — aditiva e
pequena, mas é aviso de contagem (feature 17/05) e não número errado; (c) o aviso ao comprador (22) — o próprio texto diz "quando o
negócio pedir"; (d) perdas com valor (21) — pequeno, sem o furo operacional.

### A conta da porta, medida

A porta (`separarRequisicao`, `requisitionService.js:1038-1049`) processa as entradas **na ordem do payload** (a tela manda na ordem do
pedido, `ORDER BY ir.id`) e, para cada item, o teto com a caixa sem reserva que os irmãos **desta rodada** acabaram de criar:
`caixaSemReservaDe(o, separado) = max(0, separado - entregue - r_o)`. O teto do item é
`teto = max(0, r - c) + max(0, disp - csrOutros - max(0, c - r))`. Daí:

- a **parte própria** do item: `propria = max(0, r - c)` — a reserva dele que ainda não está na caixa; **não é dividida**;
- a **parte livre**: `livre = teto - propria` — é **a mesma** para todos os irmãos (`disp - csrTotal`, porque `csrOutros` de cada um exclui
  só a dele e a fórmula subtrai a dele): é o pote que eles dividem;
- separar `q` num irmão tira do pote só o que passa da parte própria dele: `max(0, q - propria_o)`.

Logo, na ordem do pedido: `separavel_i = min(pendente_i, propria_i + max(0, livre_i - consumido))`, e `consumido += max(0, separavel_i -
propria_i)`. Contra a sonda: C1 (sem reserva) → 4 e 0; C2 (4+4 reservados) → 4 e 4; C3 (reservado 4 + livre 2) → 4 e 2 — os três
iguais ao que a porta aceitou (C1: 4+4 recusado; C2: 4+4 aceito). A ordem inversa (o item sem reserva primeiro) dá 2 e 4 **pela conta**
— não medida na sonda; o teste da T2 a prende contra a porta.

O modal já divide (Etapa 95, `quantidadesIniciaisSeparacao`, `separandoOutrosDoMaterial`, `separavelAgoraPorItem`), mas subtrai **tudo**
o que o irmão separa — inclusive a parte própria. A correção é a mesma conta: o detalhe passa a mandar a **parte própria**
(`saldo_separavel_reserva`, aditivo, ao lado de `saldo_separavel`), e o cliente desconta do irmão só o que passa dela.

**Correção de spec (a dizer à vista):** a D (95) dizia "a separação divide (**B468**) e o modal abre dividido" — o modal abria dividido
**errado** quando o item tinha reserva própria (C265). E o item "perdas" da seção 27 não estava no checklist da spec 21.

### Escolhas menores (B820, B821)

- **B820 — as etapas da fila seguem o número dividido.** Com 4 livres e dois itens de 4, a linha passa a ter *Separar* **e** *Aguardando
  saldo* (o segundo item não tem o que separar) — como já acontece hoje com dois materiais diferentes, um com saldo e outro sem.
  **Descartado:** calcular as etapas pelo número de antes (a fila diria "nada aguardando saldo" com metade do pedido sem estoque).
- **B821 — a divisão é na ordem do pedido** (o id do item), a mesma do modal e do payload que a tela manda. Quem quiser separar o segundo
  item primeiro digita no modal (o máximo dele acompanha o que se digita nos irmãos, como hoje). **Descartado:** dividir proporcional
  (nenhuma porta faz assim).

## O que esta etapa não cobre

- O efeito do perfil retirado é ao **recarregar a página** (ou no próximo refresh da Minha Conta/cadastro de usuário), não na hora.
- O **entregável** da fila não muda e **não foi medido** com irmãos do mesmo material nesta etapa (a entrega sai da caixa de cada item;
  o disponível do material abaixo da soma das caixas é a regra do motor, B509) — fica declarado (D (127)).
- A C209, a C198, os itens de produto da 05, o tempo médio de recebimento (21) — ver a próxima tarefa.
