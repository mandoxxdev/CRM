# Módulo Frota — referência técnica (estado em 2026-10-23, depois da Etapa 4)

> Levantamento original lendo a `main` em `d16de90b`; **atualizado no fechamento da Etapa 1** (portal do motorista, `4ba85d16`) e no
> **da Etapa 2** (perfil pela tela, `3aa4e088`..`805aaa3c`; plano
> [`2026-10-23-frotas-etapa2-perfis-pela-tela.md`](../superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md)).
> Onde o levantamento dizia algo que deixou de ser verdade, o texto diz **"isto era assim no levantamento; mudou na Etapa 1"**.
> Guia de usuário: [`README.md`](README.md) · manual: [`manual-do-sistema.md`](manual-do-sistema.md) · mapa de status:
> [`specs/modulo-frotas/README.md`](../../specs/modulo-frotas/README.md) · plano com os contratos congelados:
> [`2026-10-23-frotas-etapa1-portal-do-motorista.md`](../superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md)

## Arquivos

| Camada | Arquivo | Linhas | Papel |
|---|---|---|---|
| Rotas | `server/routes/frotas.js` | 265 | Registra `/api/frotas/*`; `crudRoutes` genérico (passa `req.user` a list/getOne/update desde a Etapa 1); cache de 30 s do dashboard (`limparCacheDashboard()` exportado para o harness) |
| Serviço | `server/services/frotas/frotasService.js` | 1.310 | CRUD, km, consumo, alertas, dashboard, relatórios; **escopo do motorista** (`escopoDoUsuario`, `forcarMotoristaDoVinculo`, `conferirDonoPorMotorista`), vínculo, viagem única, `inserirRegistro`, `validarItens`/`validarAvarias` |
| Portal | `server/services/frotas/portalService.js` | 235 | **Novo (Etapa 1).** `inicio`, `registrar` (saída/retorno/inspeção), `registrarAbastecimento`, `meusRegistros` |
| Exportação | `server/services/frotas/exportacaoService.js` | 189 | **Novo (Etapa 1).** O `.xlsx` no formato da planilha (lib `xlsx`) |
| Fila | `server/services/frotas/filaDeViagens.js` | 17 | **Novo (Etapa 1).** `naFilaDeViagens(fn)` — fila única em memória, **não reentrante**, premissa de um processo |
| Schema | `server/services/frotas/schema.js` | 323 | `CREATE TABLE IF NOT EXISTS` + `safeAlter` + seed; listas fixas; **`ITENS_CHECKLIST`** (os 12) e **`situacaoDoRegistro`** (a única régua da situação) |
| Perfis | `server/services/frotas/permissions.js` | 71 | `ACAO_PERFIS` (com `ver_painel` desde a Etapa 1), `getPerfilFromUser`, `can`, `requirePermission`; **desde a Etapa 2** `PERFIS_ATRIBUIVEIS` e `classificarPerfilFrota(u, explicito)` (a régua da tela, que chama o próprio `getPerfilFromUser`) |
| Perfis pela tela | `server/services/frotas/perfisService.js` | 96 | **Novo (Etapa 2).** `listarPerfis`, `definirPerfil(db, id, corpo, quemPede)` e as mensagens literais |
| Helpers | `server/services/frotas/db.js` | 26 | `dbRun/dbGet/dbAll` promisificados |
| Perfil no login | `server/services/systemPermissions.js` (`finishFrotaProfile`, `syncModuleAdminProfiles`), `server/services/leituraDeUsuarios.js` | — | Lê `perfil_frota_usuario`; admin do módulo vira `ADMIN_FROTA` |
| Telas | `client/src/components/frotas/` | ~1.800 (sem testes) | `FrotasDashboard` (+ Exportar, redirect do MOTORISTA), `FrotasEntityPage` + `frotasEntityConfigs` (8 telas), `FrotasRelatorios` (+ Exportar), **`FrotasPortalMotorista`** (+ `.css`), **`frotaMenu.js`** (menu por perfil; `MENU_FROTA_ADMIN` com "Perfis de acesso" desde a Etapa 2), **`FrotasPerfisAcesso`** (Etapa 2, `/frota/perfis`), `FrotasPageHeader`, `Frotas.css` |
| API cliente | `client/src/utils/frotasApi.js` | 117 | Cache do dashboard e do meta; `baixarPlanilhaFrota(periodo)`, `mensagemDoServidor` (lê o erro de resposta `blob`) |
| Rotas do front | `client/src/App.js` (`/frota/*`, inclui `/frota/motorista`), menu `client/src/components/Layout.js` (`menuFrotaDoPerfil(perfilFrota(user))`) | — | protegido por `ProtectedModuleRoute modulo="frota"` |
| Testes (servidor) | `server/tests/api/frotas*.api.test.js` (11 arquivos) + `vencimentosFrotasFinanceiroNoDiaLocal.api.test.js`; harness `server/tests/helpers/frotasTestApp.js` | — | ver "Testes" |
| Testes (tela) | `client/src/components/frotas/*.test.js` (7 arquivos), `client/src/components/Etapa164FrotasFinanceiro.test.js` | — | — |

Isto era assim no levantamento; mudou na Etapa 1: **`server/tests/frotas.test.js` ficava fora da suíte** (o runner só descobre
`tests/api/*.api.test.js`) — foi movido para `server/tests/api/frotasServico.api.test.js` (A9, `4ed19f8b`) e roda no `npm run test:api`.

Fora do módulo (não usar): `client/src/components/VeiculosManutencao.js` (rascunho sem rota) e `src/pages/Veiculos.tsx` (app `src/`
da raiz, não é o `client/`).

## Autorização

Duas camadas, como no almoxarifado:

1. **Módulo** — `checkModulePermission('frota')` em todas as rotas: abre as telas.
2. **Perfil** — `requirePermission(acao)` nas rotas e **escopo por dono** no serviço (MOTORISTA).

| Ação | ADMIN_FROTA | MOTORISTA | CONSULTA | Onde |
|---|---|---|---|---|
| `visualizar` | ✓ | ✓ | ✓ | não usada em rota; os GET de cadastro só exigem o módulo (com escopo, abaixo) |
| `ver_painel` (**novo**) | ✓ | | ✓ | `GET /dashboard`, `GET /alertas` (antes do cache) |
| `gerenciar_veiculos` | ✓ | | | CRUD veículo; **POST/PUT de multas e documentos** (desde a Etapa 1); DELETE de todos os lançamentos |
| `gerenciar_motoristas` | ✓ | | | CRUD motorista; `GET /usuarios-vinculaveis` |
| `registrar_operacoes` | ✓ | ✓ | | POST/PUT de manutenção, abastecimento, viagem, checklist; `POST /portal/registros`, `POST /portal/abastecimentos` |
| `aprovar_viagens` | ✓ | | | `POST /viagens/:id/aprovar`; e levar a viagem a `aprovada`/`cancelada` pelo `POST`/`PUT` (RN-F1.20) |
| `relatorios` | ✓ | | ✓ | relatórios e `GET /exportar.xlsx` |
| `configurar` | ✓ | | | `GET`/`PUT /perfis-usuario` (desde a Etapa 2) |

`getPerfilFromUser`: sem usuário → `CONSULTA`; superadmin, admin do módulo `frota` ou `role` "admin" **em qualquer caixa** (desde a
Etapa 3, E5; até a Etapa 2 era `=== 'admin'`) → `ADMIN_FROTA`; senão
`user.perfil_frota` (de `perfil_frota_usuario`); **senão `MOTORISTA`**. A tela de usuários grava `ADMIN_FROTA` (via
`admin_modulos` → `syncModuleAdminProfiles`: upsert ao conceder, `DELETE … AND perfil = 'ADMIN_FROTA'` ao revogar — o que apaga um
Consulta que estivesse lá, C9). **Desde a Etapa 2**, `CONSULTA`/`MOTORISTA` se gravam por `PUT /perfis-usuario` (tela **Frota → Perfis
de acesso**). Isto era assim até a Etapa 1: *"`MOTORISTA`/`CONSULTA` continuam sem tela"*. A tabela `perfil_frota_usuario` é criada
pelo `server/index.js` e, desde a Etapa 2, também pelo `schema.js` do Frota (mesmo DDL, idempotente). A coluna
`frotas_motoristas.perfil_frota` existe e **ninguém lê**. O front usa a mesma régua (`perfilFrota` em
`client/src/utils/systemPermissions.js`) para o menu e para o redirect `/frota` → `/frota/motorista` do MOTORISTA. *Até a Etapa 2
havia uma diferença: o front minusculizava o `role` e o servidor comparava `=== 'admin'` (E5); desde a Etapa 3 os dois ignoram a caixa,
como o `isSystemAdmin` do núcleo.* Desde a Etapa 2 (Fase5-2) o portal e o
painel chamam `refreshUser` uma vez quando o `perfil` do servidor (no `/portal/inicio` ou no 403 do `/dashboard`) diverge do da tela.

### Escopo por dono (MOTORISTA)

Isto era assim no levantamento; mudou na Etapa 1: **"não há escopo por dono: nenhuma listagem filtra pelo usuário logado e o `PUT`
não confere quem criou o registro"**. Hoje (`6dd0b130`, `9007353e`):

- **Vínculo:** `frotas_motoristas.usuario_id` liga o login ao motorista; um motorista **ativo** por usuário (conferência no serviço +
  índice único parcial `idx_frotas_motoristas_usuario_ativo ON frotas_motoristas(usuario_id) WHERE ativo = 1 AND usuario_id IS NOT
  NULL`). Se o banco já tiver duplicata, o índice não nasce e o boot loga e segue (B21).
- `escopoDoUsuario(db, user)` = `null` para **ADMIN_FROTA e CONSULTA** (veem tudo) ou sem usuário (chamada interna); para os demais —
  MOTORISTA e qualquer valor fora da lista —, `{ motoristaId, usuarioId }`. Isto era "`null` para quem não é MOTORISTA" até a Fase5-1 da
  Etapa 2 (`50219d5d`): um perfil `consulta` minúsculo gravado por SQL lia tudo.
- **Listas filtradas** para MOTORISTA: abastecimentos, viagens, checklists e multas por `motorista_id` do vínculo; manutenções por
  `usuario_id` (quem lançou); motoristas = só ele. Sem vínculo → lista vazia. `GET /motoristas/:id` de outro → 404 `Não encontrado`.
- **Sem filtro** para MOTORISTA: veículos. **Documentos**: lista **vazia** para MOTORISTA desde a Etapa 2 (RN-F2.12, C7, `30ec5df3`);
  até ali vinha sem filtro.
- **Escrita:** no `POST`/`PUT` de abastecimentos, viagens e checklists, o `motorista_id` é **forçado** ao do vínculo (RN-F1.19); sem
  vínculo → 409 `MOTORISTA_NAO_VINCULADO`. `PUT` em registro de outro (abastecimento, viagem, manutenção) → 403
  `Você só pode alterar os seus próprios registros`.

## API

Todas sob `authenticateToken + checkModulePermission('frota') + ensureSchema`. Erros 4xx: `{ error }` (+ `code` quando o contrato
manda); o resto passa por `respondDbError`. Contratos completos (mensagens literais) no plano.

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/frotas/meta` | módulo | + `itensChecklist`, `vistasAvaria`, `tiposAvaria`, `niveisCombustivel`, `tiposRegistro` |
| GET | `/api/frotas/dashboard` | **`ver_painel`** | cache 30 s; `?refresh=1` fura. *Era "módulo" no levantamento; mudou na Etapa 1* |
| GET | `/api/frotas/alertas` | **`ver_painel`** | + alerta `checklist` (PENDÊNCIA, 7 dias, `dias_restantes: null`). *Era "módulo"* |
| GET | `/api/frotas/relatorios/custos-por-veiculo?data_inicio&data_fim` | `relatorios` | *Até a Etapa 3: "multas sem filtro de período (A7)"; mudou na Etapa 4.* Cada data opcional (`substr(data,1,10)`); multas pelo dia `diaDaMultaSql` (`COALESCE(NULLIF(substr(data_infracao,1,10),''), date(created_at, modificadorDoFuso()))`), sem as `contestado`; só `ativo = 1`; `+ tipo_medicao`, `+ horimetro_atual` |
| GET | `/api/frotas/relatorios/consumo?veiculo_id&data_inicio&data_fim` | `relatorios` | **Etapa 4:** `[{ veiculo_id, placa, tipo_medicao, consumo_medio, consumo_litros_hora, total_litros, total_gasto, abastecimentos }]`, só `ativo = 1`, por placa; totais de **todas** as linhas do período (antes, só das com km/L) |
| GET | `/api/frotas/portal/inicio` | módulo | **novo.** `{ motorista, viagem_aberta, veiculos[{…, status, em_uso}], itens, vistas, tipos_avaria, niveis_combustivel, perfil, pode_registrar, pode_gerir }`. **Etapa 3:** `veiculos[].horimetro_atual`; `viagem_aberta.horimetro_saida` e `tipo_medicao` (a régua com que a viagem abriu: `horimetro_saida` → horimetro; `km_saida` → km; senão a do veículo) |
| POST | `/api/frotas/portal/registros` | `registrar_operacoes` | **novo.** `{ tipo, veiculo_id, km, data, horario, nivel_combustivel, itens, avarias, observacoes, origem, destino, finalidade }` → `201 { registro, viagem }`. **Etapa 3:** `+ horimetro` (máquina; o `km` é ignorado nela) e `+ confirmar_km_menor` (booleano). Leitura menor que a do veículo → 409 `{ error, code: 'KM_MENOR_QUE_ATUAL' \| 'HORIMETRO_MENOR_QUE_ATUAL' }`, depois das recusas duras; retorno em horas menor que a saída → 400 |
| POST | `/api/frotas/portal/abastecimentos` | `registrar_operacoes` | **novo.** `motorista_id` = o do vínculo. **Etapa 3:** `horimetro`, `confirmar_km_menor` e os mesmos 409; máquina grava `horimetro_abastecimento` com `km_abastecimento` nulo |
| GET | `/api/frotas/portal/meus-registros?limite=30` | módulo | **novo.** `{ registros, abastecimentos }` (máx. 200) |
| GET | `/api/frotas/usuarios-vinculaveis` | `gerenciar_motoristas` | **novo.** `[{ id, nome, email, ativo, motorista, perfil_frota }]`: ativos + o desativado ainda ligado; `perfil_frota` (efetivo) desde a Etapa 2 |
| GET | `/api/frotas/perfis-usuario` | `configurar` | **Etapa 2.** `{ perfis: ['CONSULTA','MOTORISTA'], usuarios: [{ id, nome, email, perfil_explicito, perfil_efetivo, origem: forcado\|explicito\|padrao, motorista, viagem_aberta }] }` — ativos e não ocultos |
| PUT | `/api/frotas/perfis-usuario/:usuarioId` | `configurar` | **Etapa 2.** `{ perfil: 'CONSULTA'\|'MOTORISTA'\|null\|'' }` → `{ usuario_id, perfil_explicito, perfil_efetivo, origem }`. 404 → 400 → 409 `PERFIL_FORCADO` → 409 `PROPRIO_PERFIL` |
| GET | `/api/frotas/exportar.xlsx?data_inicio&data_fim` | `relatorios` | **novo.** `controle-de-frota-AAAA-MM-DD.xlsx`, 6 abas; **Etapa 4:** 7ª aba `Multas` (período por `diaDaMultaSql`) e `Horas desde Abastec. Anterior`/`Consumo L/h` no fim de Abastecimentos |
| GET/POST/PUT/DELETE | `/api/frotas/veiculos[/:id]` | GET módulo; resto `gerenciar_veiculos` | |
| GET/POST/PUT/DELETE | `/api/frotas/motoristas[/:id]` | GET módulo (escopo); resto `gerenciar_motoristas` | aceita `usuario_id` (null desvincula) |
| GET/POST/PUT/DELETE | `/api/frotas/manutencoes[/:id]` | POST/PUT `registrar_operacoes`; DELETE `gerenciar_veiculos` | escopo por `usuario_id` |
| GET/POST/PUT/DELETE | `/api/frotas/abastecimentos[/:id]` | idem | + `km_desde_anterior`; recálculo do vizinho. **Etapa 4:** GET `+ horas_desde_anterior`, `+ consumo_litros_hora` (calculados na leitura). **Etapa 3:** `horimetro_abastecimento` (PUT: ausente mantém, vazio apaga); sem a régua do km menor (B36) |
| GET/POST/PUT/DELETE | `/api/frotas/multas[/:id]` | **POST/PUT `gerenciar_veiculos`** | *era `registrar_operacoes`; mudou na Etapa 1* |
| GET/POST/PUT/DELETE | `/api/frotas/documentos[/:id]` | **POST/PUT `gerenciar_veiculos`** | *idem*; GET: MOTORISTA recebe `[]` (Etapa 2) |
| GET/POST/PUT/DELETE | `/api/frotas/viagens[/:id]` | POST/PUT `registrar_operacoes`; DELETE `gerenciar_veiculos` | fila de viagens; viagem única; km e data do retorno; RN-F1.20. **Etapa 3:** `horimetro_saida`/`horimetro_retorno` (PUT: null/ausente mantém; retorno menor que a saída → 400) |
| POST | `/api/frotas/viagens/:id/aprovar` | `aprovar_viagens` | **só `solicitada`** (409). *No levantamento "não confere o status atual"; mudou na Etapa 1* |
| GET/POST/DELETE | `/api/frotas/checklists[/:id]` | POST `registrar_operacoes` | **sem PUT**. Lista traz `tipo_registro, km, horario, nivel_combustivel, status_geral, itens, avarias, viagem_id` |

Sem validação de esquema (Zod) — checagem no serviço.

## Tabelas

| Tabela | Campos principais | Exclusão |
|---|---|---|
| `frotas_tipos_veiculo` | nome, categoria; seed de 10 tipos | — |
| `frotas_veiculos` | placa (UNIQUE, normalizada), modelo, marca, ano, tipo_id, status (ativo/manutencao/inativo/vendido), km_atual, horimetro_atual, tipo_medicao, combustivel, consumo_medio_esperado, setor_responsavel, centro_custo, motorista_id, … | lógica |
| `frotas_motoristas` | nome, cpf, **usuario_id** (o vínculo — *"sem uso na tela" no levantamento; mudou na Etapa 1*), cnh_*, telefone, email, setor, status, perfil_frota (sem uso). Índice único parcial `idx_frotas_motoristas_usuario_ativo` | lógica |
| `frotas_manutencoes` | veiculo_id, tipo, descricao, oficina, custo, km_manutencao, data_manutencao, proxima_revisao_km/data, status, usuario_id/nome, requisicao_almox_id | física |
| `frotas_abastecimentos` | veiculo_id, motorista_id, data_abastecimento, litros, valor_total, valor_litro, posto, km_abastecimento, combustivel_tipo, consumo_medio, **km_desde_anterior** (novo), usuario_id/nome, **horimetro_abastecimento** (Etapa 3) | física |
| `frotas_multas` | veiculo_id, motorista_id, data_infracao, valor, pontos, status_pagamento, data_vencimento, … | física |
| `frotas_documentos` | veiculo_id, tipo, numero_documento, valor, data_vencimento, alerta_dias_antes (30), status (ativo/vencido/renovado) | física |
| `frotas_viagens` | veiculo_id, motorista_id, data_saida/retorno (`AAAA-MM-DDTHH:MM`), km_saida/retorno/rodado, **horimetro_saida/retorno** (Etapa 3), **origem** (novo), destino, finalidade, setor, status, aprovador_*, solicitante_*, observacoes | física |
| `frotas_checklists` | veiculo_id, motorista_id, data_checklist, 7 × `*_ok`, observacoes, aprovado, usuario_id/nome; **novas:** `tipo_registro` (saida/retorno/inspecao, padrão inspecao), `km`, `horario`, `nivel_combustivel`, `itens_json` (os 12), `avarias_json`, `status_geral` (OK/PENDENCIA/INCOMPLETO), `viagem_id`; **Etapa 3:** `horimetro` | física |
| `perfil_frota_usuario` (em `index.js` e, desde a Etapa 2, também no `schema.js` do Frota) | usuario_id (PK), perfil (padrão 'MOTORISTA'), updated_at | gravada por `syncModuleAdminProfiles` (ADMIN_FROTA) e, desde a Etapa 2, por `PUT /perfis-usuario` (CONSULTA/MOTORISTA) |

Saída, retorno e inspeção do portal são linhas de `frotas_checklists` (B1). Os 7 `*_ok` continuam gravados a partir dos 12:
pneus←pneus_estepe, oleo←oleo_motor, luzes←farois_lanternas, freios←freios, documentos←documentos_equipamentos (FALHA → 0, OK/NA → 1,
ausente → nulo); extintor e limpeza → 1. A API devolve `itens` (objeto, ou `null` em registro da tela antiga) e `avarias` (array) no
lugar do JSON cru.

Schema montado na primeira requisição/boot por `runInitSchemaWithRetry` (3 tentativas), depois do `SELECT 1` que espera a fila de
DDL do `index.js`.

## Regras de cálculo

- **km do veículo** (`updateKmVeiculoSeMaior`): manutenção, abastecimento, retorno de viagem **e saída/retorno/inspeção do portal**
  sobem o `km_atual` se o lançado for maior; nunca descem. **Desde a Etapa 3** é um comando só (`SET km_atual = MAX(COALESCE(km_atual,0), ?)`):
  ler e depois gravar deixava a menor leitura por último em chamadas simultâneas. *Até a Etapa 2: "`updateHorimetroVeiculoSeMaior`
  continua sem chamador (A10); o portal grava em km também para veículo por horímetro"* — **deixou de ser verdade**: o portal (máquina,
  `tipo_medicao = 'horimetro'`), o retorno/abastecimento do gestor com `horimetro_*` sobem o `horimetro_atual` pelo mesmo `MAX`, sem
  tocar no km.
- **Régua do km menor (Etapa 3, A8)**: só no portal — `conferirMenorQueAtual` em `portalService.js`, depois das recusas duras; 409 com
  `code`; `confirmar_km_menor === true` passa. O número da mensagem sai em `Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })`.
- **Revisão da máquina (Etapa 3, RN-F3.14)**: `getAlertas` e o cartão de manutenção vencida do `getDashboard` comparam
  `proxima_revisao_km` com `horimetro_atual` quando `tipo_medicao = 'horimetro'` (folga 50, contra 500 no km); a aba Cadastro Frota idem.
- **km/L** — isto era assim no levantamento; mudou na Etapa 1: *"`(km lançado − km do último abastecimento do veículo por data) ÷ litros
  lançados`"*. Hoje (`80362b54`): `km_desde_anterior = km − km do anterior EM KM` (ordem `km_abastecimento ASC, id ASC`, mesmo
  veículo, só linhas com km); `consumo_medio = km_desde_anterior ÷ litros`, 2 casas, `null` se a diferença ≤ 0 ou sem anterior.
  Criar, editar e excluir **recalculam o seguinte em km** (no `PUT` que muda km ou veículo, o seguinte da posição antiga e o da nova).
- **Litros por hora (Etapa 4, RN-F4.05)**: `litrosPorHora(db, veiculoIds)` — **calculado na leitura**, sem coluna: linhas com
  `horimetro_abastecimento` dos veículos pedidos, ordem `veiculo_id, horimetro ASC, id ASC`; `horas_desde_anterior` = h − h do anterior
  (arredondado em 6 casas), `consumo_litros_hora` = litros ÷ horas (2 casas), nulo sem anterior, com horas ≤ 0 ou litros ≤ 0. O
  anterior vem de **todas** as linhas do veículo (fora do período, da busca e do escopo do motorista). `comLitrosPorHora` é usado pela
  lista, pelo relatório de consumo e pela planilha. Não olha `tipo_medicao` (como o km/L).
- **valor por litro**: `valor_total ÷ litros` se não vier; no `PUT`, refeito quando muda `litros` ou `valor_total` sem `valor_litro`
  no corpo (Fase5-1).
- **Manutenção `em_andamento`** na criação → veículo `status='manutencao'`. Concluir **não** devolve o veículo a `ativo`.
- **Situação do registro** (`situacaoDoRegistro`, a única régua) — isto era assim no levantamento; mudou na Etapa 1: *"`aprovado = 1`
  só se os 7 itens forem 1; item ausente vale 1"*. Hoje:
  - com `itens` (os 12): `PENDENCIA` se algum `FALHA` ou avaria; senão `INCOMPLETO` se faltar algum; senão `OK`;
  - sem `itens` (rota antiga): algum `*_ok` = 0 → `PENDENCIA`; avaria → `PENDENCIA` (B22, `4ba85d16`); algum nulo → `INCOMPLETO`;
    senão `OK`. `aprovado = 1` só se `OK`.
- **Viagem**: `km_rodado = km_retorno − km_saida` no `POST` (novo) e no `PUT`; km do retorno menor → 400; data/hora do retorno antes da
  saída → 400 (sem hora numa delas, compara o dia); no máximo **uma** `em_andamento` por veículo e por motorista, conferida dentro de
  `naFilaDeViagens` (portal, `POST`/`PUT /viagens`).
- **Alerta de checklist**: `status_geral = 'PENDENCIA'` e `date(data_checklist) >= date(hoje, '-7 days')`, severidade `alto`.
- **Datas**: "hoje" é o dia de Brasília (`hojeLocalISO`), no servidor e nos padrões dos formulários; o portal recusa data depois de
  hoje (só o dia — B20).

## Testes

Rodados no fechamento da Etapa 1 (2026-10-23); os da Etapa 2 estão no fim desta seção.

| Arquivo | Resultado |
|---|---|
| `frotasConsumoViagem.api.test.js` | 12/12 |
| `frotasEscopoMotorista.api.test.js` | 12/12 |
| `frotasEsquema.api.test.js` | 6/6 |
| `frotasExportacao.api.test.js` | 9/9 |
| `frotasFase5Auth.api.test.js` | 8/8 |
| `frotasFase5Regras.api.test.js` | 8/8 |
| `frotasPortal.api.test.js` | 19/19 |
| `frotasPortalIntegracao.api.test.js` | 2/2 |
| `frotasServico.api.test.js` (o antigo `tests/frotas.test.js`) | 6/6 |
| `vencimentosFrotasFinanceiroNoDiaLocal.api.test.js` | 17/17 |
| `client/src/components/frotas` (5 arquivos) | 37/37 |

Harness `frotasTestApp`: express + SQLite `:memory:` + `registerFrotasRoutes` real + `requirePermission` real; usuários `ADMIN`,
`MOTORISTA`, `CONSULTA`, `MOTORISTA2`; o usuário viaja na requisição (`x-test-user`), `ctx.como(user)(metodo, url, corpo)` para
paralelo. **Não** roda o `finishFrotaProfile` (o perfil vem no objeto do usuário). **Desde a Etapa 2**: `usuarios` tem `is_superadmin`,
`admin_modulos` e `is_oculto`, e `comLoginReal(ctx)` monta o **mesmo banco** atrás do login real (`criarAuthenticateToken` +
`enrichUserFromDb`), para provar que o perfil gravado chega ao `req.user` (`frotasPerfisIdaEVolta`).

Etapa 2: `frotasPerfis.api.test.js` **17/17** e `frotasPerfisIdaEVolta.api.test.js` **3/3**; tela `FrotasPerfisAcesso.test.js`,
`FrotasEtapa2Gestor.test.js`, mais casos em `FrotasMenuPorPerfil` e `FrotasPortalMotorista` — `client/src/components/frotas`: 7
arquivos, **64/64**. Números da suíte inteira: letra E nas novidades.

Etapa 3: `frotasKmHorimetro.api.test.js` **32/32** (RN-F3.01..15, ajustes da Fase 2, Fase5-R1..R4, S4/S6/S7/S9/S20/S22) e
`frotasKmHorimetroIntegracao.api.test.js` **2/2** (pela rota e pelo serviço; colunas da planilha lidas pelo nome); os 13 arquivos
`frotas*` somam **136 passaram, 0 falharam**. Tela: `FrotasPortalKmHorimetro` (26), `FrotasHorimetroGestor` (5),
`FrotasHorimetroGestorTela` (1) — `client/src/components/frotas`: 10 arquivos, **96/96**. A corrida da RN-F3.08 **não** se reproduz pelo
HTTP (8 abastecimentos em paralelo passavam antes do conserto); a prova é a chamada dupla no serviço, no mesmo tique.

Etapa 4: `frotasRelatorios.api.test.js` e `frotasRelatoriosIntegracao.api.test.js` (pela rota e pelo serviço; reconciliação tela ×
planilha, RN-F4.14); `frotasExportacao` ajustado (7 abas, colunas no fim). Tela: `FrotasRelatorios.test.js`. Números no plano da Etapa 4.

## Achados

Sonda executada em 2026-10-23 contra o `initSchema` e o `frotasService` reais, banco em memória.

| Id | Passos | Esperado | Medido no levantamento | Estado (Etapa 1) |
|---|---|---|---|---|
| A1 | 2 abastecimentos (km 1000, 1500, 50 L) → `updateAbastecimento(2º, {observacoes})` | km/L 10 | `null` | **corrigido** `80362b54` |
| A2 | abastecimento com data anterior e km 500 | km/L do trecho | `null`; vizinhos não recalculam | **corrigido** `80362b54` |
| A3 | `createChecklist({veiculo_id, data_checklist})` sem itens | recusar ou reprovar | `aprovado = 1` | **corrigido** `80362b54` (INCOMPLETO, `aprovado = 0`) |
| A4 | viagem `concluida` → `aprovarViagem` | 409 | `status='aprovada'` | **corrigido** `80362b54` |
| A5 | viagem km_saida 2000 → `PUT {km_retorno: 1800}` | 400 | `km_rodado = -200` | **corrigido** `80362b54` |
| A6 | `getPerfilFromUser({id:9, role:'usuario'})` | — | `MOTORISTA`; GETs sem filtro por dono | **corrigido** quanto ao escopo (`6dd0b130`, `9007353e`); o fallback MOTORISTA continua (Etapa 2) |
| A7 | leitura de `relatorioCustosPorVeiculo` | período em multas | sem filtro | **corrigido** `e841b13a` (Etapa 4): pela data da infração (sem ela, dia do lançamento), sem as contestadas |
| A8 | abastecimento km 900 com veículo em 1800 | aviso/recusa | aceito; km/L `null` | **corrigido** `fc1328e0` (Etapa 3): o portal responde 409 `KM_MENOR_QUE_ATUAL` e grava só com `confirmar_km_menor`; as rotas do gestor seguem sem a régua (B36) |
| A9 | `server/tests/frotas.test.js` | na suíte | fora do runner | **corrigido** `4ed19f8b` |
| A10 | `updateHorimetroVeiculoSeMaior` | chamado nos lançamentos | sem chamador | **corrigido** `fc1328e0` (Etapa 3): portal e rotas do gestor com `horimetro_*` |

Banco local (`projetos/CRM/server/data/database.sqlite`, leitura no levantamento): **0 linhas** em todas as tabelas `frotas_*` e em
`perfil_frota_usuario`.
