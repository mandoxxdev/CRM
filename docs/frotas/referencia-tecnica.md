# Módulo Frota — referência técnica (estado em 2026-10-23, depois da Etapa 6)

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
| Fotos | `server/services/frotas/anexosService.js` | ~200 | **Novo (Etapa 5).** `gravar` (tipo pelos primeiros bytes, dono e teto de 3 no mesmo `INSERT … WHERE EXISTS`), `apagar`, `apagarDoLancamento`, `comAnexos` (URL assinada na saída), `MSG` literais |
| Pendência | `server/services/frotas/pendenciaService.js` | ~130 | **Novo (Etapa 6).** `tratar` e `desfazer` a pendência do registro; `gravarTratamento` (todas as condições no `WHERE`); `instanteLocal` (Brasília, `AAAA-MM-DDTHH:MM`); `MSG` literais |
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
| `gerenciar_veiculos` | ✓ | | | CRUD veículo; **POST/PUT de multas e documentos** (desde a Etapa 1); DELETE de todos os lançamentos; **`POST`/`DELETE /checklists/:id/tratar-pendencia`** (Etapa 6) |
| `gerenciar_motoristas` | ✓ | | | CRUD motorista; `GET /usuarios-vinculaveis` |
| `registrar_operacoes` | ✓ | ✓ | | POST/PUT de manutenção, abastecimento, viagem, checklist; `POST /portal/registros`, `POST /portal/abastecimentos` |
| `aprovar_viagens` | ✓ | | | `POST /viagens/:id/aprovar`; e levar a viagem a `aprovada`/`cancelada` pelo `POST`/`PUT` (RN-F1.20) |
| `relatorios` | ✓ | | ✓ | relatórios e `GET /exportar.xlsx` |
| (fotos) | | | | `POST /anexos` e `DELETE /anexos/:id` usam `registrar_operacoes` (ADMIN_FROTA e MOTORISTA) + o escopo por dono abaixo; Consulta 403 |
| `configurar` | ✓ | | | `GET`/`PUT /perfis-usuario` (desde a Etapa 2); **desde a Etapa 8 o `PUT` também dá e tira `ADMIN_FROTA`** (escreve `frota` em `usuarios.admin_modulos`) |
| (destinos) | ✓ | ✓ (POST) | GET | **Etapa 8:** `GET /destinos` só o módulo; `POST` `registrar_operacoes` (o motorista cadastra pelo "+ Novo destino"); `PUT`/`DELETE` `gerenciar_veiculos` |

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

**Etapa 8 (feature 19).** `classificarPerfilFrota` distingue `origem: 'forcado'` (superadmin, `role` admin) de **`'admin_modulo'`** (só
`admin_modulos` com `frota`); `PERFIS_ATRIBUIVEIS` ganha `ADMIN_FROTA`. `definirPerfil` com `ADMIN_FROTA` escreve `frota` em
`usuarios.admin_modulos` (JSON, sem duplicar, preservando os outros módulos) **e** a linha espelho `ADMIN_FROTA` (o mesmo upsert do
sync); com CONSULTA/MOTORISTA/`null` num `admin_modulo`, tira `frota` da lista e grava o pedido (o upsert sobrescreve a linha espelho;
`null` a apaga — não há `DELETE` separado, B83). **Não chama** `syncModuleAdminProfiles` (ele também mexe em
`perfil_almoxarifado_usuario`). O `enrichUserFromDb` relê `admin_modulos` a cada pedido, então o administrador dado pela tela vale no
pedido seguinte **mesmo sem a linha espelho** (RN-F8.07 prova apagando-a). O `PUT /usuarios/:id` do núcleo com a lista **velha**
(cadastro de usuário aberto antes) **desfaz**: reescreve `admin_modulos` sem `frota` e o sync apaga a linha espelho — fixado em teste,
B81. O sync **sozinho** com a lista velha só apaga a linha espelho e não desfaz (a coluna manda; medido no T2). Superadmin e `role` admin continuam 409 `PERFIL_FORCADO` (mensagem nova).
*Este parágrafo dizia acima "A tela de usuários grava ADMIN_FROTA" como o único caminho; desde a Etapa 8 há dois.*

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
| GET | `/api/frotas/meta` | módulo | + `itensChecklist`, `vistasAvaria`, `tiposAvaria`, `niveisCombustivel`, `tiposRegistro`; **Etapa 8:** `origemPadrao: 'GMP'` |
| GET/POST/PUT/DELETE | `/api/frotas/destinos[/:id]` | GET módulo; POST `registrar_operacoes`; PUT/DELETE `gerenciar_veiculos` | **Etapa 8 (feature 22).** `crudRoutes` **sem `getOne`** (não há `GET /:id`). GET `?search=` (nome/endereço) `&inativos=1` (inclui `ativo = 0`), por nome. POST `{ nome, endereco? }` → 201 a linha (`criado_por_*` = quem pediu); `nome` só string, aparado e com espaços colapsados: vazio/não-string → 400 `Informe o nome do destino`; > 120 → 400 `Nome do destino: no máximo 120 caracteres`; `endereco` > 255 → 400 `Endereço: no máximo 255 caracteres`; nome já **ativo** (NOCASE, pelo índice — sem conferência antes do INSERT) → 409 `{ error: 'Destino já cadastrado', code: 'DESTINO_DUPLICADO', destino: <linha existente> }` (o `handleError` passa a espalhar `err.extra`). PUT `{ nome?, endereco?, ativo? }` (`ativo` normalizado como `uso_funcionarios`), mesmos 400/409 (inclusive ao reativar), 404 `Destino não encontrado` lançado pelo serviço. DELETE → `ativo = 0`, `{ success: true }`, 404 idem. **Etapa 9 (feature 23):** a linha ganha `cep, logradouro, numero, complemento, bairro, cidade, uf`; `endereco` passa a ser **montado** pelo servidor (`montarEnderecoDestino`: `Rua, Nº[ - Compl], Bairro, Cidade/UF[, CEP 00000-000]`) e o `endereco` do corpo é ignorado. POST: depois do nome, **duplicidade antes do endereço** (A8: nome ativo → 409 mesmo sem endereço; o índice segue de rede); depois cep (8 dígitos após tirar não-dígitos, grava `00000-000`; só não-dígitos = ausente) → logradouro → numero → complemento → bairro → cidade → uf (27 siglas, aceita minúscula), com as mensagens literais do plano 2026-10-29 (`Informe a rua (logradouro) do destino`, `Informe o número (ou S/N)`, `Informe o bairro do destino`, `Informe a cidade do destino`, `Informe o estado (UF) do destino`, `Estado (UF) inválido`, `CEP deve ter 8 dígitos`, `Rua: no máximo 150 caracteres` …). PUT (`enderecoDoPut`): chave presente = `!== undefined`; `null`/`''` em cep/complemento apagam; com chave presente o endereço final passa pela régua inteira e é remontado — **exceto** destino antigo (sem `logradouro`) cujas chaves presentes vêm todas vazias (A2: endereço intocado). Busca também em `cidade`, `bairro`, `cep` e `REPLACE(cep,'-','')`. 409 `destino` = `{ id, nome, endereco, cidade, uf, ativo }` |
| GET | `/api/frotas/dashboard` | **`ver_painel`** | cache 30 s; `?refresh=1` fura. **Etapa 6:** o cache tem **geração** — `limparCacheDashboard()` (chamado ao tratar e desfazer) a incrementa, e a contagem que já estava em andamento não grava o painel velho. *Era "módulo" no levantamento; mudou na Etapa 1* |
| GET | `/api/frotas/alertas` | **`ver_painel`** | + alerta `checklist` (PENDÊNCIA, `dias_restantes: null`). **Etapa 6:** só `pendencia_tratada_em IS NULL` e veículo `ativo = 1`, **sem a janela de 7 dias** (*era "7 dias" até a Etapa 5*); o item ganha `placa`. *Era "módulo"* |
| GET | `/api/frotas/relatorios/custos-por-veiculo?data_inicio&data_fim` | `relatorios` | *Até a Etapa 3: "multas sem filtro de período (A7)"; mudou na Etapa 4.* Cada data opcional (`substr(data,1,10)`); multas pelo dia `diaDaMultaSql` (`COALESCE(NULLIF(substr(data_infracao,1,10),''), date(created_at, modificadorDoFuso()))`), sem as `contestado`; só `ativo = 1`; `+ tipo_medicao`, `+ horimetro_atual` |
| GET | `/api/frotas/relatorios/consumo?veiculo_id&data_inicio&data_fim` | `relatorios` | **Etapa 4:** `[{ veiculo_id, placa, tipo_medicao, consumo_medio, consumo_litros_hora, total_litros, total_gasto, abastecimentos }]`, só `ativo = 1`, por placa; totais de **todas** as linhas do período (antes, só das com km/L) |
| GET | `/api/frotas/portal/inicio` | módulo | **novo.** `{ motorista, viagem_aberta, veiculos[{…, status, em_uso}], itens, vistas, tipos_avaria, niveis_combustivel, perfil, pode_registrar, pode_gerir }`. **Etapa 3:** `veiculos[].horimetro_atual`; `viagem_aberta.horimetro_saida` e `tipo_medicao` (a régua com que a viagem abriu: `horimetro_saida` → horimetro; `km_saida` → km; senão a do veículo). **Etapa 8:** `veiculos[].uso_funcionarios` (0/1), `viagem_aberta.condutor_nome`, `+ destinos: [{ id, nome, endereco }]` (ativos, por nome). **Etapa 9:** `destinos[]` + `cidade, uf`; `+ origem: { nome: 'GMP', endereco }` (`enderecoDaOrigem`: `configuracoes.empresa_endereco/cidade/estado/cep` → `Endereço, Cidade/UF, CEP 00000-000`, partes vazias saem; sem a tabela → `''`) |
| POST | `/api/frotas/portal/registros` | `registrar_operacoes` | **novo.** `{ tipo, veiculo_id, km, data, horario, nivel_combustivel, itens, avarias, observacoes, origem, destino, finalidade }` → `201 { registro, viagem }`. **Etapa 3:** `+ horimetro` (máquina; o `km` é ignorado nela) e `+ confirmar_km_menor` (booleano). Leitura menor que a do veículo → 409 `{ error, code: 'KM_MENOR_QUE_ATUAL' \| 'HORIMETRO_MENOR_QUE_ATUAL' }`, depois das recusas duras; retorno em horas menor que a saída → 400. **Etapa 8 (saída):** `+ destino_id` (inteiro; ativo → `destino` = nome e `destino_id`; inexistente/desativado/não numérico → 400 `Destino não encontrado`; `destino` texto sem id continua aceito), `+ condutor_nome` (aparado, ≤ 120 senão 400 `Condutor: no máximo 120 caracteres`; **obrigatório** se o veículo relido na fila tem `uso_funcionarios` → 400 `Informe quem vai dirigir (condutor)`); `origem` ausente ou vazia → `'GMP'`. Ordem **dentro da fila**: manutenção → viagem única → destino → tamanho do condutor → condutor obrigatório → `conferirMenorQueAtual` (409) → grava — o 400 de condutor vem **antes** do 409 para o motorista não confirmar o km menor à toa. A viagem aprovada consumida (B8) leva `COALESCE(?, origem, 'GMP')` e `COALESCE` de destino/`destino_id`/condutor |
| POST | `/api/frotas/portal/abastecimentos` | `registrar_operacoes` | **novo.** `motorista_id` = o do vínculo. **Etapa 3:** `horimetro`, `confirmar_km_menor` e os mesmos 409; máquina grava `horimetro_abastecimento` com `km_abastecimento` nulo |
| GET | `/api/frotas/portal/meus-registros?limite=30` | módulo | **novo.** `{ registros, abastecimentos }` (máx. 200). **Etapa 5:** cada item `+ anexos` |
| GET | `/api/frotas/usuarios-vinculaveis` | `gerenciar_motoristas` | **novo.** `[{ id, nome, email, ativo, motorista, perfil_frota }]`: ativos + o desativado ainda ligado; `perfil_frota` (efetivo) desde a Etapa 2 |
| GET | `/api/frotas/perfis-usuario` | `configurar` | **Etapa 2.** `{ perfis, usuarios: [{ id, nome, email, perfil_explicito, perfil_efetivo, origem, motorista, viagem_aberta }] }` — ativos e não ocultos. **Etapa 8:** `perfis = ['CONSULTA','MOTORISTA','ADMIN_FROTA']`; `origem ∈ forcado \| admin_modulo \| explicito \| padrao`; para `admin_modulo` o `perfil_explicito` é **calculado** `'ADMIN_FROTA'` (a fonte é `admin_modulos`, não a tabela) |
| PUT | `/api/frotas/perfis-usuario/:usuarioId` | `configurar` | **Etapa 2.** `{ perfil: 'CONSULTA'\|'MOTORISTA'\|null\|'' }` → `{ usuario_id, perfil_explicito, perfil_efetivo, origem }`. 404 → 400 → 409 `PERFIL_FORCADO` → 409 `PROPRIO_PERFIL`. **Etapa 8:** `+ 'ADMIN_FROTA'` (→ `origem 'admin_modulo'`; idempotente em quem já é); tirar = outro perfil ou `null`. 400: `Perfil inválido. Use CONSULTA, MOTORISTA, ADMIN_FROTA ou vazio para voltar ao padrão.`; 409 forçado só superadmin/`role` admin: `Este usuário é superadmin ou administrador do sistema e tem acesso total à frota. Isso não se altera por esta tela.` |
| GET | `/api/frotas/exportar.xlsx?data_inicio&data_fim` | `relatorios` | **novo.** `controle-de-frota-AAAA-MM-DD.xlsx`, 6 abas; **Etapa 4:** 7ª aba `Multas` (período por `diaDaMultaSql`) e `Horas desde Abastec. Anterior`/`Consumo L/h` no fim de Abastecimentos |
| POST | `/api/frotas/anexos` | `registrar_operacoes` | **Etapa 5.** multipart `foto` + `entidade` (`registro`\|`abastecimento`) + `entidade_id` → `201 { id, entidade, entidade_id, url, tipo_mime, tamanho, created_at }`. `requirePermission` **antes** do multer. Recusas na ordem: 403 perfil → 400 `Envie uma foto por vez` → 400 `Formato de imagem não suportado` (MIME) → 413 `Arquivo grande demais (máximo 10 MB)` → 400 `Não foi possível ler a foto enviada` → 400 `Nenhuma foto enviada` → 400 `Tipo de lançamento inválido` → 400 `Lançamento inválido` → 404 `Registro não encontrado`/`Abastecimento não encontrado` → 409 `MOTORISTA_NAO_VINCULADO` → 403 `Você só pode alterar os seus próprios registros` → 400 formato (primeiros bytes) → 409 `LIMITE_DE_FOTOS` `Este lançamento já tem 3 fotos`. Toda recusa depois do multer apaga o arquivo |
| DELETE | `/api/frotas/anexos/:id` | `registrar_operacoes` | **Etapa 5.** 404 `Foto não encontrada` → 409/403 (dono; lançamento sumido: só o gestor) → `{ success: true }`; o arquivo só é apagado se a linha foi |
| GET | `/api/uploads/frotas-anexos/<arquivo>?exp&sig` | só assinatura | **Etapa 5.** `criarAssinadorUpload(JWT_SECRET, PASTAS.frotasAnexos)` — domínio `frotas-anexos-v1`, 120 min + balde 30; `express.static` com `index:false`, `dotfiles:'deny'`, `cabecalhosUploadSeguro` (nosniff, CSP sandbox, private); fecho 404. Toda falha = 404 |
| GET/POST/PUT/DELETE | `/api/frotas/veiculos[/:id]` | GET módulo; resto `gerenciar_veiculos` | **Etapa 8:** `uso_funcionarios` (0/1; corpo aceita `true/'1'/1`; ausente no PUT mantém) |
| GET/POST/PUT/DELETE | `/api/frotas/motoristas[/:id]` | GET módulo (escopo); resto `gerenciar_motoristas` | aceita `usuario_id` (null desvincula) |
| GET/POST/PUT/DELETE | `/api/frotas/manutencoes[/:id]` | POST/PUT `registrar_operacoes`; DELETE `gerenciar_veiculos` | escopo por `usuario_id` |
| GET/POST/PUT/DELETE | `/api/frotas/abastecimentos[/:id]` | idem | + `km_desde_anterior`; recálculo do vizinho. **Etapa 5:** GET `+ anexos`; DELETE apaga o lançamento e depois as fotos (linhas e arquivos). **Etapa 4:** GET `+ horas_desde_anterior`, `+ consumo_litros_hora` (calculados na leitura). **Etapa 3:** `horimetro_abastecimento` (PUT: ausente mantém, vazio apaga); sem a régua do km menor (B36) |
| GET/POST/PUT/DELETE | `/api/frotas/multas[/:id]` | **POST/PUT `gerenciar_veiculos`** | *era `registrar_operacoes`; mudou na Etapa 1* |
| GET/POST/PUT/DELETE | `/api/frotas/documentos[/:id]` | **POST/PUT `gerenciar_veiculos`** | *idem*; GET: MOTORISTA recebe `[]` (Etapa 2) |
| GET/POST/PUT/DELETE | `/api/frotas/viagens[/:id]` | POST/PUT `registrar_operacoes`; DELETE `gerenciar_veiculos` | fila de viagens; viagem única; km e data do retorno; RN-F1.20. **Etapa 3:** `horimetro_saida`/`horimetro_retorno` (PUT: null/ausente mantém; retorno menor que a saída → 400). **Etapa 8:** `condutor_nome` (≤ 120; PUT: null/ausente mantém — B80), `destino_id` devolvido (o gestor não manda: `destino` segue texto, B79); a busca inclui `condutor_nome`; sem padrão de origem no servidor (a tela preenche `GMP`). **Etapa 9:** `destino_id` aceito do gestor (número ou string só de dígitos; resolvido **dentro** da fila; ativo → `destino` = nome; senão 400 `Destino não encontrado`; o id manda sobre o texto). PUT: `destino_id` ausente/null/'' mantém; **igual ao gravado** (após `Number()`) aceito mesmo desativado e sem renomear (RN-F9.12, A5); sem id e com `destino` texto diferente do gravado → grava o texto e zera `destino_id` (B96). Origem: POST sem origem (ausente/null/vazia) → `'GMP'`; PUT sem origem mantém e grava `'GMP'` se a gravada for NULL (B99). `GET /meta` + `origemEndereco` |
| POST | `/api/frotas/viagens/:id/aprovar` | `aprovar_viagens` | **só `solicitada`** (409). *No levantamento "não confere o status atual"; mudou na Etapa 1* |
| GET/POST/DELETE | `/api/frotas/checklists[/:id]` | POST `registrar_operacoes` | **sem PUT**. Lista traz `tipo_registro, km, horario, nivel_combustivel, status_geral, itens, avarias, viagem_id`, **`anexos`** (Etapa 5); DELETE apaga também as fotos. **Etapa 6:** GET `+ pendencia_tratada_em, pendencia_tratada_por_id, pendencia_tratada_por_nome, pendencia_tratamento, pendencia_manutencao_id, pendencia_manutencao_descricao` (esta, `null` para quem tem escopo) |
| POST | `/api/frotas/checklists/:id/tratar-pendencia` | `gerenciar_veiculos` | **Etapa 6.** `{ tratamento, manutencao_id? }` (inteiro > 0 ou texto só de dígitos). Recusas na ordem: 403 perfil → 400 `Descreva o que foi feito` → 400 `O texto passou de 1000 caracteres` → 400 `Manutenção inválida` → 404 `Registro não encontrado` → 409 `SEM_PENDENCIA` `Este registro não tem pendência` → 409 `PENDENCIA_JA_TRATADA` `Esta pendência já foi tratada` → 400 `Manutenção não encontrada` → 400 `Esta manutenção é de outro veículo`. `UPDATE … WHERE status_geral = 'PENDENCIA' AND pendencia_tratada_em IS NULL AND (manutenção do mesmo veículo)`; perdeu a corrida → relê e responde a recusa do estado (sem recusa: 409 já tratada). `200` o registro (`registroComItens`). Limpa o cache do painel |
| DELETE | `/api/frotas/checklists/:id/tratar-pendencia` | `gerenciar_veiculos` | **Etapa 6.** 404 → 409 `PENDENCIA_NAO_TRATADA` `Esta pendência não foi tratada` (`WHERE pendencia_tratada_em IS NOT NULL`) → `200` o registro com as 5 colunas nulas. Limpa o cache do painel |

Sem validação de esquema (Zod) — checagem no serviço.

## Tabelas

| Tabela | Campos principais | Exclusão |
|---|---|---|
| `frotas_tipos_veiculo` | nome, categoria; seed de 10 tipos | — |
| `frotas_veiculos` | placa (UNIQUE, normalizada), modelo, marca, ano, tipo_id, status (ativo/manutencao/inativo/vendido), km_atual, horimetro_atual, tipo_medicao, combustivel, consumo_medio_esperado, setor_responsavel, centro_custo, motorista_id, **uso_funcionarios** (Etapa 8, 0/1), … | lógica |
| `frotas_destinos` (Etapa 8) | nome, endereco (montado desde a Etapa 9), **cep, logradouro, numero, complemento, bairro, cidade, uf** (Etapa 9, safeAlter; linhas antigas NULL), ativo (1), criado_por_id/nome, created_at, updated_at; índice único **parcial** `ux_frotas_destinos_nome_ativo` em `nome COLLATE NOCASE WHERE ativo = 1` (dois ativos iguais não cabem; desativado libera o nome; erro `UNIQUE constraint failed: frotas_destinos.nome`) | lógica |
| `frotas_motoristas` | nome, cpf, **usuario_id** (o vínculo — *"sem uso na tela" no levantamento; mudou na Etapa 1*), cnh_*, telefone, email, setor, status, perfil_frota (sem uso). Índice único parcial `idx_frotas_motoristas_usuario_ativo` | lógica |
| `frotas_manutencoes` | veiculo_id, tipo, descricao, oficina, custo, km_manutencao, data_manutencao, proxima_revisao_km/data, status, usuario_id/nome, requisicao_almox_id | física |
| `frotas_abastecimentos` | veiculo_id, motorista_id, data_abastecimento, litros, valor_total, valor_litro, posto, km_abastecimento, combustivel_tipo, consumo_medio, **km_desde_anterior** (novo), usuario_id/nome, **horimetro_abastecimento** (Etapa 3) | física |
| `frotas_multas` | veiculo_id, motorista_id, data_infracao, valor, pontos, status_pagamento, data_vencimento, … | física |
| `frotas_documentos` | veiculo_id, tipo, numero_documento, valor, data_vencimento, alerta_dias_antes (30), status (ativo/vencido/renovado) | física |
| `frotas_viagens` | veiculo_id, motorista_id, data_saida/retorno (`AAAA-MM-DDTHH:MM`), km_saida/retorno/rodado, **horimetro_saida/retorno** (Etapa 3), **origem** (novo; a saída do portal grava `'GMP'` desde a Etapa 8), destino (texto, sempre), **destino_id** e **condutor_nome** (Etapa 8), finalidade, setor, status, aprovador_*, solicitante_*, observacoes | física |
| `frotas_checklists` | veiculo_id, motorista_id, data_checklist, 7 × `*_ok`, observacoes, aprovado, usuario_id/nome; **novas:** `tipo_registro` (saida/retorno/inspecao, padrão inspecao), `km`, `horario`, `nivel_combustivel`, `itens_json` (os 12), `avarias_json`, `status_geral` (OK/PENDENCIA/INCOMPLETO), `viagem_id`; **Etapa 3:** `horimetro`; **Etapa 6:** `pendencia_tratada_em` (`AAAA-MM-DDTHH:MM`, Brasília), `pendencia_tratada_por_id`, `pendencia_tratada_por_nome`, `pendencia_tratamento`, `pendencia_manutencao_id` (sem FK) — o `status_geral` não muda ao tratar | física |
| `frotas_anexos` (Etapa 5) | entidade (`registro`→`frotas_checklists` | `abastecimento`→`frotas_abastecimentos`, CHECK), entidade_id, arquivo (UNIQUE, só o nome), tipo_mime, tamanho, usuario_id/nome, created_at; índice `(entidade, entidade_id)`. Arquivos em `<CRM_DATA_DIR>/uploads/frotas-anexos` (entram no backup) | física, junto com o lançamento |
| `perfil_frota_usuario` (em `index.js` e, desde a Etapa 2, também no `schema.js` do Frota) | usuario_id (PK), perfil (padrão 'MOTORISTA'), updated_at | gravada por `syncModuleAdminProfiles` (ADMIN_FROTA) e, desde a Etapa 2, por `PUT /perfis-usuario` (CONSULTA/MOTORISTA; **desde a Etapa 8 também ADMIN_FROTA**, junto com `usuarios.admin_modulos`) |

Saída, retorno e inspeção do portal são linhas de `frotas_checklists` (B1). Os 7 `*_ok` continuam gravados a partir dos 12:
pneus←pneus_estepe, oleo←oleo_motor, luzes←farois_lanternas, freios←freios, documentos←documentos_equipamentos (FALHA → 0, OK/NA → 1,
ausente → nulo); extintor e limpeza → 1. A API devolve `itens` (objeto, ou `null` em registro da tela antiga) e `avarias` (array) no
lugar do JSON cru.


**Injeção (Etapa 5).** `registerFrotasRoutes(app, db, auth, checkModulePermission, { dataDir, segredoUpload })` — sem os dois, **lança**.
`index.js` passa `PERSISTENT_DATA_DIR` e `JWT_SECRET`; o harness `frotasTestApp`, uma pasta temporária por app (apagada na saída do
processo) e um segredo de teste, nas duas montagens (`createFrotasTestApp` e `comLoginReal`); expõe `uploadsDir`, `dataDir`,
`segredoUpload`. O multer é o embrulhado (`multerComLimiteNoErro`), com filtro próprio (jpeg/jpg/png/webp — o `filtroImagemMulter`
aceitaria gif), nome `frota-<24 hex>` e extensão por `extensaoSegura`; o erro do multer é traduzido **na rota** pelos
`tratarErroFormatoImagem`/`tratarArquivoGrandeDemais` (o harness não monta os handlers do `/api`). Medido: o busboy dispara o limite ao
**atingir** o `fileSize` — 10 MB exatos já são 413 (vale para todo multer do sistema).

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

Etapa 5: `frotasAnexos.api.test.js` (RN-F5.01..08, corrida da exclusão, dono trocado no meio, domínio da assinatura) e
`frotasAnexosIntegracao.api.test.js` (pela rota e pelo serviço). Tela: `FrotasFotos.test.js`. Números no plano da Etapa 5.

Etapa 6: `frotasPendencia.api.test.js` (RN-F6.01..09, recusas na ordem, corridas tratar×tratar e desfazer×desfazer, o `WHERE` da manutenção, a corrida do cache com gancho) e `frotasPendenciaIntegracao.api.test.js` (pela rota e pelo serviço); `frotasPortal` (RN-F1.10 reescrito: 8 dias atrás **continua**) e `frotasExportacao` (3 colunas no fim) ajustados. Tela: `FrotasPendencia.test.js`. Números no plano da Etapa 6.

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
