# Frotas — Etapa 2: perfil do Frota pela tela (Consulta / Motorista)

> **Status:** **etapa fechada em 2026-10-23** — T1..T3 feitas, Fase 5 corrigida (`50219d5d`, `805aaa3c`). Próxima: **Etapa 3** (A8 + A10, "Próxima tarefa detalhada", no fim).
> **Origem:** "Próxima tarefa detalhada" do [plano da Etapa 1](2026-10-23-frotas-etapa1-portal-do-motorista.md) (B24).
> **Spec:** [`specs/modulo-frotas/15-perfis-pela-tela/README.md`](../../../specs/modulo-frotas/15-perfis-pela-tela/README.md) e o mapa
> [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) (linha 11).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B (B25+).

## Objetivo

Hoje quem tem acesso ao Frota e não é administrador **vira Motorista** (C2): quem só acompanha (escritório, financeiro) perde o painel
e o relatório, e a única saída é SQL ou dar administrador. Esta etapa dá ao gestor uma tela **Frota → Perfis de acesso** onde ele escolhe,
para cada usuário, **Consulta** ou **Motorista** — e o perfil gravado passa a valer no próximo pedido daquele usuário. Fatia visível: a
tela, o item no menu do gestor, e um aviso no cadastro do motorista quando o usuário escolhido está como Consulta (ele não grava no
portal). De carona (se couber): o C7 — o motorista que digita `/frota/documentos` deixa de ver os documentos de todos.

## Fase 0 — medido antes de prometer

- `perfil_frota_usuario` (tabela **core**, criada em `server/index.js` dentro do callback do `PRAGMA table_info(usuarios)`): só
  `syncModuleAdminProfiles` grava (`ADMIN_FROTA` ao conceder, `DELETE … AND perfil = 'ADMIN_FROTA'` ao revogar). **Nenhuma rota/tela
  grava CONSULTA/MOTORISTA** — a etapa não encolhe.
- Leitores: `finishFrotaProfile` (`systemPermissions.js`, `perfil_frota` no `req.user`: admin do módulo/superadmin → `ADMIN_FROTA`,
  senão a linha), `leituraDeUsuarios.js` (`/usuarios/:id/grupos`, alimenta o cache do front), `getPerfilFromUser`
  (`services/frotas/permissions.js`: superadmin, admin do módulo, `role === 'admin'` (**sensível a caixa**), `perfil_frota`, fallback
  MOTORISTA).
- `frotas_motoristas.perfil_frota` (coluna criada por `safeAlter` em `schema.js`) **não tem leitor nem escritor** — coluna morta. Fica
  como está (não é o perfil; o perfil é do **usuário**).
- Front: `perfilFrota(user)` (`client/src/utils/systemPermissions.js`) espelha `getPerfilFromUser`; menu por perfil em `frotaMenu.js`
  (`menuFrotaDoPerfil`: MOTORISTA → menu curto; o resto → menu do gestor); o usuário afetado recebe o perfil novo pelo `/auth/me` ao
  recarregar a página, ou pelo `/usuarios/:id/grupos` quando o cache de 5 min vence (`AuthContext.onPermissoesGravadas`) — **estava
  errado**: ninguém chama esse `/grupos` dentro do Frota, então o menu só mudava no F5 (Fase5-2 corrigiu pelo portal e pelo painel). Sem novo login.
- Harness `frotasTestApp.js`: `usuarios` sem `is_superadmin`, `admin_modulos`, `is_oculto`; sem `perfil_frota_usuario`; o usuário vem
  pronto no header (o `finishFrotaProfile` **não** roda).
- C7: `listDocumentos(db, query)` ignora o usuário; não há `GET /documentos/:id`.

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F2.01 | `GET /perfis-usuario` lista os usuários **ativos e não ocultos** (por nome) com perfil explícito, efetivo, origem e o motorista ligado. Só quem tem `configurar` (ADMIN_FROTA) | CONSULTA → 403 `Sem permissão para esta operação` |
| RN-F2.02 | **Uma régua só** para o efetivo: `classificarPerfilFrota(u, explicito)` em `services/frotas/permissions.js` **chama `getPerfilFromUser`** sobre `{is_superadmin, admin_modulos, role, perfil_frota: explicito}`. `forcado` = `getPerfilFromUser` sem o explícito já dá ADMIN_FROTA; senão `explicito` se há linha; senão `padrao` (MOTORISTA) | `role:'admin'` → forcado; `admin_modulos:'["frota"]'` → forcado; `["almoxarifado"]` sem linha → padrao/MOTORISTA |
| RN-F2.03 | `PUT /perfis-usuario/:id {perfil}`: `CONSULTA`/`MOTORISTA` gravam (upsert, `updated_at`); `null` ou `''` apagam a linha (volta ao padrão MOTORISTA); qualquer outro valor (inclusive `ADMIN_FROTA` e chave ausente) → 400 | `{perfil:'ADMIN_FROTA'}` → 400 |
| RN-F2.04 | Usuário **forçado** (superadmin, `role` admin, `frota` em `admin_modulos`) → 409; nada é gravado | gestor tentando dar CONSULTA a um admin → 409 |
| RN-F2.05 | Usuário inexistente ou desativado → 404 | `PUT /perfis-usuario/5` (inativo) → 404 |
| RN-F2.06 | **Ida e volta real:** gravar CONSULTA pelo `PUT` faz o **próximo pedido** desse usuário, pelo login real (`criarAuthenticateToken` + `enrichUserFromDb` → `finishFrotaProfile`), passar em `ver_painel`/`relatorios` (`/dashboard` 403→200) e ser recusado em `registrar_operacoes`; voltar ao padrão (`null`) devolve o 403 do painel | Ana: `/dashboard` 403 → PUT CONSULTA → 200 → PUT null → 403 |
| RN-F2.07 | Linha `ADMIN_FROTA` **sobrando** num usuário **não** forçado (vale como administrador para `getPerfilFromUser`) aparece como `perfil_explicito: 'ADMIN_FROTA'`, `origem: 'explicito'`, efetivo ADMIN_FROTA; o `PUT` pode trocá-la por CONSULTA/MOTORISTA/padrão | sobra de admin revogado sem o sync |
| RN-F2.08 | `GET /usuarios-vinculaveis` traz, em cada usuário, `perfil_frota` (o efetivo, pela régua RN-F2.02) — **campo aditivo** | Consulta → `perfil_frota: 'CONSULTA'` |
| RN-F2.09 | No cadastro do motorista, escolher em **Usuário de acesso** um usuário com `perfil_frota === 'CONSULTA'` mostra o aviso literal (abaixo). Não bloqueia | |
| RN-F2.10 | Menu: **Perfis de acesso** (`/frota/perfis`) só no menu do ADMIN_FROTA; CONSULTA mantém o menu do gestor **sem** esse item; MOTORISTA não muda | |
| RN-F2.11 | **Lista negativa** (provada por concessão): CONSULTA não grava no portal (`registros`, `abastecimentos`), não aprova viagem, não abre/grava perfis; MOTORISTA não abre/grava perfis | sabotar `ACAO_PERFIS` concedendo → o cenário cai nomeando a ação |
| RN-F2.12 | (C7) `GET /documentos` para **MOTORISTA** devolve lista vazia (documentos são do veículo e têm valor; o motorista não tem "os dele"). ADMIN_FROTA e CONSULTA veem tudo | Ana em `/documentos` → `[]`; Consulta → os documentos |
| RN-F2.13 | (Fase 2) O `PUT` no **próprio** usuário → 409 `PROPRIO_PERFIL` (só alcançável por quem é administrador pela linha sobrando, RN-F2.07) | Helena (sobra) muda a si → 409; muda o Joao → 200 |
| RN-F2.14 | (Fase 2, T-1) CONSULTA nas telas do gestor: **só leitura** — sem Novo, Editar, Aprovar, Excluir | Consulta em Veículos não vê "Novo Veículo" |

## Contratos de API (congelados)

Todas sob `/api/frotas`, com `auth + módulo frota`. Erros `{ error: '<literal>' }` (+ campos indicados).

### `GET /perfis-usuario` — `configurar`

`200 { perfis: ['CONSULTA','MOTORISTA'], usuarios: [{ id, nome, email, perfil_explicito: 'CONSULTA'|'MOTORISTA'|'ADMIN_FROTA'|null,
perfil_efetivo: 'ADMIN_FROTA'|'CONSULTA'|'MOTORISTA', origem: 'forcado'|'explicito'|'padrao', motorista: {id, nome} | null }] }`

- `usuarios`: `ativo = 1 AND COALESCE(is_oculto,0) = 0`, `ORDER BY nome, id`. `motorista` = o motorista **ativo** ligado (o de menor id,
  se legado com dois). `perfil_explicito` é a linha crua (pode ser `ADMIN_FROTA` só no caso RN-F2.07, ou num forçado — o sync grava).
- 403 `{ error: 'Sem permissão para esta operação', acao: 'configurar', perfil }` (o `requirePermission` de sempre).

### `PUT /perfis-usuario/:usuarioId` — `configurar`

Corpo `{ perfil: 'CONSULTA' | 'MOTORISTA' | null | '' }`. Resposta `200 { usuario_id, perfil_explicito, perfil_efetivo, origem }`.

| Caso | Código | Mensagem literal |
|---|---|---|
| usuário inexistente, desativado ou id não numérico | 404 | `Usuário não encontrado` |
| usuário forçado | 409 | `Este usuário já é administrador (superadmin, administrador do sistema ou administrador do módulo Frota) e tem acesso total à frota. Remova essa condição no cadastro de usuário antes de definir outro perfil.` (+ `code: 'PERFIL_FORCADO'`) |
| `perfil` fora de `CONSULTA`/`MOTORISTA`/`null`/`''` (inclui `ADMIN_FROTA`, minúsculas e chave ausente) | 400 | `Perfil inválido. Use CONSULTA, MOTORISTA ou vazio para voltar ao padrão.` |
| sem `configurar` | 403 | `Sem permissão para esta operação` |

Ordem das conferências: 404 → 400 → 409 (perfil inválido para admin dá 400; o 409 só fala de quem pediu um perfil válido).

### `GET /usuarios-vinculaveis` — mudança aditiva

Cada item ganha `perfil_frota: 'ADMIN_FROTA'|'CONSULTA'|'MOTORISTA'` (régua RN-F2.02). Nada mais muda.

### `GET /documentos` — mudança de escopo (C7)

MOTORISTA → `200 []`. Os outros, como antes.

### Textos de tela (literais)

- Página: título **Perfis de acesso**, subtítulo *"Quem vê o painel e quem registra no portal"*.
- Texto de ajuda: *"Ter acesso ao módulo Frota (no cadastro de usuário) permite abrir as telas; o perfil abaixo diz o que a pessoa faz
  dentro delas."* e *"Quem não tem perfil definido entra como Motorista."*
- Rótulos: `MOTORISTA` → **Motorista**: *"Registra saída, retorno, inspeção e abastecimento no portal; vê só o que é dele."*;
  `CONSULTA` → **Consulta**: *"Vê o painel, os alertas, as listas e os relatórios, e exporta a planilha. Não registra nem altera
  nada."*; `ADMIN_FROTA` → **Administrador de Frota**: *"Faz tudo no módulo, inclusive dar perfis."*
- Opção vazia do seletor: **Motorista (padrão)**. Forçado: etiqueta **Administrador** e *"Para dar outro perfil, remova a condição de
  administrador no cadastro de usuário."*. Coluna **Motorista ligado**: o nome, ou *"—"*.
- Toasts: sucesso `Perfil definido: <rótulo>` / `Perfil removido — o usuário volta ao padrão (Motorista)`; erro = `error` do servidor.
- Aviso no motorista (RN-F2.09): *"Este usuário está com o perfil Consulta no Frota: ele vê o painel, mas não consegue registrar no
  portal. Para ele registrar, mude o perfil em Frota → Perfis de acesso."*

## Esquema

- `services/frotas/schema.js` passa a fazer `CREATE TABLE IF NOT EXISTS perfil_frota_usuario (…)` com **o mesmo DDL** do `index.js`
  (idempotente): a rota nova não depende da ordem de boot do core, e o harness ganha a tabela de graça.
- Harness: `usuarios` ganha `is_superadmin`, `admin_modulos`, `is_oculto`; usuários semeados novos: 6 *Admin modulo* (`admin_modulos
  '["frota"]'`), 7 *Oculto* (`is_oculto 1`), 8 *Super* (`is_superadmin 1`).

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Harness (colunas + semente), tabela no `schema.js`, `classificarPerfilFrota`, serviço `perfisService.js` (`listarPerfis`, `definirPerfil`), rotas `GET/PUT /perfis-usuario`, `perfil_frota` em `/usuarios-vinculaveis`, C7. Testes `frotasPerfis.api.test.js` (RN-F2.01..05, 07, 08, 11, 12) | tronco | — |
| T2 | Integração pelo login real: `frotasPerfisIdaEVolta.api.test.js` — app com `criarAuthenticateToken` + `enrichUserFromDb` no mesmo banco; RN-F2.06 entrando **pela rota** (PUT do gestor → pedido da Ana) e **pelo serviço** (`definirPerfil` direto → pedido da Ana) | integração | T1 |
| T3 | Front: `FrotasPerfisAcesso.js` (`/frota/perfis`), rota no `App.js`/`lazyModules.js`, menu ADMIN_FROTA (RN-F2.10), aviso no motorista (RN-F2.09), testes `FrotasPerfisAcesso.test.js` + menu | galho | contrato |

Cada task: TDD com controle positivo; a lista negativa (RN-F2.11) só vale com sabotagem **por concessão**.

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| T1 | feito — harness (colunas), tabela no schema do Frota, `classificarPerfilFrota`, `perfisService.js`, `GET/PUT /perfis-usuario` (+ `viagem_aberta`, RN-F2.13), `perfil_frota` em `/usuarios-vinculaveis`, C7 (RN-F2.12); `frotasPerfis` 16/16 | 30ec5df3 |
| T2 | feito — `comLoginReal` no harness (login real + `enrichUserFromDb`), `frotasPerfisIdaEVolta` 3/3: pela rota, pelo serviço e tela × servidor usuário a usuário | 6fd592c5 |
| T3 | feito | 02a7aee3 |

## Ajustes da Fase 2 (revisor fresco: 3 travas + 20 menores — **valem sobre o texto acima**)

| Achado | Ajuste |
|---|---|
| T-1 (trava) CONSULTA vê **Novo / Editar / Aprovar / Excluir** nas telas de cadastro (`FrotasEntityPage`) e leva 403 ao salvar — até aqui ninguém virava CONSULTA pela tela | **RN-F2.14**: com `perfilFrota(user) === 'CONSULTA'` as telas do gestor escondem Novo, Editar, Aprovar e Excluir (e qualquer botão de criar do painel). Só leitura. Quem decide continua sendo o servidor |
| T-2 (trava) conceder admin do módulo e revogar **apaga o Consulta** (o upsert do sync troca a linha; o `DELETE` da revogação a apaga) | Comportamento **fixado em teste** (`frotasPerfis` "C9") e declarado na letra **C9**. Guardar o perfil anterior exigiria coluna nova — fica para depois (reversível) |
| T-3 (trava) MOTORISTA com saída sem retorno virando CONSULTA não registra o retorno; o carro fica preso (C4) | `GET /perfis-usuario` ganha `viagem_aberta: boolean` por usuário (EXISTS viagem `em_andamento` do motorista ligado). A tela avisa na linha (texto abaixo). O `PUT` **não** recusa (B30) |
| 5 corpo torto / `"02"` | `{perfil: 1}`, `[...]`, sem corpo → 400 (já). `"02"` = usuário 2 (`/^\d+$/`), aceito — declarado aqui |
| 6 linha com valor fora da lista (`'consulta'` minúsculo por SQL) | Aparece **crua** no GET (`explicito`, efetivo = o valor cru, que não dá ação nenhuma — é o que o servidor aplica). A tela mostra a opção `<valor> (valor inválido — escolha outro)`; o `PUT` corrige. Teste com o usuário 12 |
| 7 página aberta por quem não é ADMIN_FROTA | A página mostra o `error` do servidor (`Sem permissão para esta operação`) no lugar da tabela |
| 9 `role 'Admin'` (maiúscula): servidor = MOTORISTA (`=== 'admin'`), front `perfilFrota` = ADMIN_FROTA (`toLowerCase`) | A régua da tela segue o **servidor** (teste com o usuário 11). Divergência do front declarada na letra **E5** (o cadastro de usuário grava `'admin'` minúsculo; banco local medido: só `admin`/`usuario`). A frase "o front espelha" da Fase 0 **estava errada** nesse detalhe |
| 10 administrador só pela linha sobrando pode se rebaixar e perder `configurar` | **RN-F2.13**: `PUT` no próprio usuário → 409 `Você não pode mudar o seu próprio perfil por esta tela.` (`code: 'PROPRIO_PERFIL'`). Ordem: 404 → 400 → 409 forçado → 409 próprio |
| 11 superadmin com linha CONSULTA sobrando: o 409 impede limpar; ao perder o super vira CONSULTA | Declarado na letra **C10** |
| 12 a lista traz quem **não** tem acesso ao módulo Frota | Declarado (B27, D7): o perfil não dá acesso; o acesso ao módulo continua no cadastro de usuário |
| 14 CONSULTA vê CPF/CNH de todos os motoristas e exporta a planilha | Decisão **B28** (é o que "Consulta" quer dizer desde a Etapa 1; nada muda nesta etapa) |
| 15 auditoria | **B26**: sem trilha; só o `updated_at` da linha |
| 16 o aviso do motorista também ao **abrir** um motorista já ligado a um CONSULTA | O aviso sai do `form.usuario_id` (aparece ao abrir e ao trocar) |
| 18 o usuário afetado só vê a mudança ao recarregar (ou em até 5 min) | Declarado na letra **C11** e no manual. O "em até 5 min" **estava errado** (Fase5-2): corrigido no código (portal e painel renovam) e no texto |
| 19 MOTORISTA sem motorista ligado | Sem aviso na linha (seria ruído: quase ninguém é motorista); a coluna **Motorista ligado** mostra "—". Declarado |
| 20 "Motorista (padrão)" e "Motorista" explícito têm o mesmo efeito | **B29**: a tela oferece só **Motorista (padrão)** e **Consulta**; uma linha MOTORISTA explícita aparece como "Motorista (padrão)" (mesmo efeito; escolher a opção já marcada não grava nada — o "vira padrão" que estava aqui **estava errado**, achado 4 da Fase 5). A API continua aceitando `MOTORISTA` |
| 21 corrida PUT × sync | Inofensiva: quem é forçado continua forçado pelo `admin_modulos`; na revogação o `DELETE` só apaga ADMIN_FROTA. Registrado |
| 22 C7: o motorista que digita `/frota/documentos` vê a lista vazia, sem explicação | Aceito; letra C7 atualizada |
| 23 spec 15 e B25+ ainda não escritos | Escritos no fechamento |

### Contrato depois da Fase 2 (o que muda no texto acima)

- `GET /perfis-usuario` → cada usuário ganha `viagem_aberta: boolean`.
- `PUT /perfis-usuario/:id` → novo 409 `Você não pode mudar o seu próprio perfil por esta tela.` (`code: 'PROPRIO_PERFIL'`), depois do 409
  do forçado.
- Textos novos de tela (literais):
  - aviso na linha, perfil efetivo CONSULTA com motorista ligado: *"Ligado ao motorista {nome}: como Consulta, não registra no portal."*
  - e, se `viagem_aberta`: *"Tem saída sem retorno: como Consulta, não consegue registrar o retorno. Feche a viagem em Frota → Viagens ou
    volte o perfil para Motorista."*
  - opção do valor fora da lista: *"{valor} (valor inválido — escolha outro)"*; linha ADMIN_FROTA não forçada: *"Administrador de Frota
    (gravado à parte)"*.

## Fase 5 — revisão adversarial (dois revisores frescos em paralelo; achados só reproduzidos)

Revisor 1 — regras e permissões com o **servidor real** (`CRM_DATA_DIR=<pasta vazia> PORT=5917 node index.js`, login real de 6
usuários; o node foi morto e a pasta apagada no fim). Revisor 2 — front × back (leitura linha a linha dos dois lados + jest no scratchpad
com `AuthProvider`, `permissionsCache` e `Layout` reais).

| Achado | O que era | Correção | Estado | Commit |
|---|---|---|---|---|
| Fase5-1 (real, revisor 1) | Perfil com valor fora da lista (`consulta` minúsculo, por SQL — o tipo de linha que a C2 ensinava) **lia** CPF/CNH de todos, viagens e documentos com valor: o escopo só restringia `=== MOTORISTA` | escopo **fechado**: só ADMIN_FROTA e CONSULTA leem tudo (B33). Teste vermelho antes, com a metade positiva | corrigido | 50219d5d |
| Fase5-2 (real, revisor 2, achados 1–3) | Depois do `PUT`, o menu do afetado **nunca** mudava dentro do Frota (o "em até 5 min" da Fase 0 era falso: ninguém chama `/usuarios/:id/grupos` lá dentro); quem virou Consulta caía no portal, quem voltou a Motorista via *"Sem permissão para acessar o módulo Frota."* | o portal (`perfil` do `/portal/inicio`) e o painel (`perfil` do 403) chamam `refreshUser` **uma vez** quando divergem da tela. Controle positivo: sem a chamada, os 3 cenários caem | corrigido | 805aaa3c |
| Fase5-3 (texto, revisor 2, achado 4) | B29 dizia que escolher de novo "Motorista (padrão)" numa linha MOTORISTA explícita "vira padrão" — escolher a opção já marcada não dispara nada | texto corrigido (o efeito é o mesmo) | corrigido no texto | fechamento |
| Ruído / declarado | `role 'Admin'` maiúsculo aceito pela API de usuários (E5: a premissa "o cadastro grava minúsculo" valia só para a tela); usuário oculto fora da lista mas aceito no `PUT` (C12); valor torto por SQL deixa o **menu** do gestor no front (E6); `FrotasEtapa2Gestor.test.js` mocka `getEffectiveUser` como identidade (baixo) | declarado | — | — |

Confirmado pelo revisor 1 sem achado: 403 de CONSULTA/MOTORISTA com `acao: 'configurar'`; ida e volta com o **mesmo token** (painel
403→200→403); 409 forçado (super, role admin, admin do módulo) e próprio (inclusive pelo id `05`); 400 antes do 409; 404 para 9 ids tortos;
8 corpos tortos → 400; C7; o sync do cadastro de usuário (C9 confirmado; salvar sem `admin_modulos` mantém o Consulta); 40 `PUT` + 20 `GET`
em paralelo sem 500/BUSY; primeiro boot sem a tabela → recriada, sem "no such table"; `/auth/me` e `/usuarios/:id/grupos` com o perfil novo.

## Estado final das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | feito | 3aa4e088 |
| T1 | feito (ver acima) | 30ec5df3 |
| T2 | feito | 6fd592c5 |
| T3 | feito — `FrotasPerfisAcesso`, rota, menu do ADMIN, aviso no motorista, Consulta só leitura; 11 sabotagens por concessão | 02a7aee3 |
| Fase5-1 | feito | 50219d5d |
| Fase5-2 | feito | 805aaa3c |
| Fechamento (docs) | feito | commit "Frota etapa 2: fechamento nas specs, no plano e nos documentos do modulo" |

## Fechamento (2026-10-23)

### Divergências do plano

| Onde | O plano dizia | O que foi feito | Por quê |
|---|---|---|---|
| Fase 0 | o usuário afetado vê o perfil novo "pelo `/usuarios/:id/grupos` quando o cache de 5 min vence" | **errado**; corrigido no código (Fase5-2) | ninguém chama esse `/grupos` dentro do Frota |
| Fase 0 | "o front espelha `getPerfilFromUser`" | **errado** no `role 'Admin'` | o front minusculiza; declarado em E5 |
| Ajustes da Fase 2, item 6 | valor fora da lista "não dá ação nenhuma" | certo para ações, **errado** para leituras | Fase5-1 |
| B29 | "ao escolher de novo, vira padrão" | não dispara | Fase5-3 |
| Contrato `GET /perfis-usuario` | sem `viagem_aberta` | `+ viagem_aberta` | trava T-3 da Fase 2 |
| Contrato `PUT` | 3 erros | + 409 `PROPRIO_PERFIL` | achado 10 da Fase 2 |
| Front | só a página nova | + Consulta só leitura (RN-F2.14), + o portal e o painel renovam o usuário (Fase5-2) | trava T-1 da Fase 2; Fase5-2 |

### Retro (4 números)

| Medida | Valor |
|---|---|
| Rodadas de correção | **1** — um fix-round da Fase 5 (Fase5-1 `50219d5d`, Fase5-2 `805aaa3c`) + correção de texto no fechamento |
| Achados da revisão | Fase 2 (plano): **3 travas + 20 menores**. Fase 5 (código): **2 reais** (Fase5-1, Fase5-2) + 1 de texto (B29); **ruído/declarado: 4** (E5, C12, E6, mock do teste) |
| Paralelismo | T1/T2 (servidor) e T3 (front, subagente) em paralelo contra o contrato congelado; **sem retrabalho** na integração. Os dois revisores da Fase 5 também em paralelo |
| Defeito que escapou | **a preencher na Etapa 3** |

Defeito que escapou da **Etapa 1** (a retro dela pedia): o escopo aberto para perfil fora da lista (Fase5-1) existia desde a Etapa 1 e
nenhuma revisão dela o pegou, porque ninguém gravava perfil fora do `syncModuleAdminProfiles`. (O C7 já era conhecido e declarado.)

### Testes no fechamento

Ver a letra **E7** de [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md) (números lidos da saída).

## Próxima tarefa detalhada — Etapa 3: km e horímetro confiáveis no portal (A8 + A10)

**Por que esta (B34):** com o portal no ar, o km digitado errado entra **calado** (A8: 900 com o carro em 1.800 é aceito; o carro mantém
o maior, o lançamento fica com o menor e entra na conta do km/L pela ordem do km, distorcendo o dele e o do vizinho), e numa máquina
**por horímetro** o número digitado no "KM atual" vai para o **km** do veículo (A10: `updateHorimetroVeiculoSeMaior` em
`frotasService.js:59` não tem chamador). As duas estragam o dado desde o primeiro dia. Descartados para depois: foto (o módulo não tem
anexo), A7 (relatório), seção 3 (depende da folha inteira).

**Medido (Fase 0 adiantada):**
- Portal: `portalService.registrar` (`lerKm`, `Informe o KM atual`, `updateKmVeiculoSeMaior` nas linhas ~135/168/186) e
  `registrarAbastecimento` (~199). `GET /portal/inicio` já devolve `veiculos[].km_atual` e `tipo_medicao`.
- Gestor: `createAbastecimento`/`updateAbastecimento` (`updateKmVeiculoSeMaior` ~556/590), manutenção (~420), viagens (~853/894).
- `frotas_veiculos.tipo_medicao` ∈ `km`|`horimetro` (`TIPOS_MEDICAO` no `schema.js`), `horimetro_atual`.
- km/L pela ordem do km (RN-F1.11) — horímetro **não** entra nessa conta hoje.

**Contrato proposto (congelar na Fase 1):**
- RN-F3.01 — Portal (registros e abastecimento): km **menor** que o `km_atual` do veículo → 409
  `KM menor que o atual do veículo (<atual>). Confira o hodômetro.` com `code: 'KM_MENOR_QUE_ATUAL'`; o corpo pode mandar
  `confirmar_km_menor: true` para gravar mesmo assim (o motorista confirma na tela — caminho reversível; bloqueio total é letra B).
  O retorno já tem a régua do km da saída e continua.
- RN-F3.02 — Veículo `tipo_medicao = 'horimetro'`: o portal pede **Horímetro atual** (mensagem `Informe o horímetro atual`), grava em
  `horimetro_atual` (`updateHorimetroVeiculoSeMaior`) e **não** mexe no km; o registro guarda o valor numa coluna nova (`safeAlter`) ou no
  próprio `km` com a unidade — decidir na Fase 1 olhando a exportação (a planilha tem coluna de horímetro?) e o consumo (L/h?).
- RN-F3.03 — A mesma régua nas telas do gestor (abastecimento, manutenção, viagem): **aviso** com o mesmo `confirmar` (o gestor lança
  atrasado), não bloqueio cego.
- Fatia visível: no portal, o campo vira "Horímetro atual" na máquina; o aviso de km menor com "Confirmar mesmo assim".

**Pontos de atenção:**
1. **Lançamento retroativo é legítimo** (RN-F1.11 recalcula o vizinho): um abastecimento de ontem com km menor que o atual é normal. A
   régua tem de olhar a **data** (comparar com o lançamento anterior **na data**), ou só valer para lançamento de hoje. Medir com sonda.
2. **Fila de viagens** (`filaDeViagens.js`): a conferência do km da saída roda dentro dela; a nova também, para não ler `km_atual` velho.
3. **Exportação** (`exportacaoService.js`): ver se a planilha da empresa (`specs/modulo-frotas/Controle_de_Frota_GMP.xlsx`) tem horímetro
   antes de decidir a coluna.
4. **Teste de corrida:** dois abastecimentos simultâneos com km diferentes — o `km_atual` final tem de ser o maior.
5. Harness `frotasTestApp` (`ctx.como`) e `comLoginReal` já existem; o portal tem `FrotasPortalMotorista.test.js` com a fronteira HTTP
   (e, desde a Etapa 2, o mock de `useAuth`/`refreshUser`).
