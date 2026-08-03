# Estado atual do código (mapa de referência)

> Levantado em 2026-08-02. Atualizar quando a estrutura mudar de forma relevante.

## Onde as coisas estão

- **Backend real:** `server/` (Express 4.18 + sqlite3, SQL cru, sem ORM). Entry: `server/index.js` (~23.000 linhas, monólito). A pasta `backend/` (Prisma/TS) é um stub morto — **ignorar**.
- **Frontend real:** `client/` (React 18 + CRA, CSS puro + design system próprio em `client/src/styles/`). A pasta `src/` da raiz é protótipo morto — **ignorar**.
- **Banco:** `server/data/database.sqlite` (WAL). Path via `server/config/paths.js` (`CRM_DATA_DIR`).
- **Sem framework de migrations** — `CREATE TABLE IF NOT EXISTS` no boot + `safeAlter` (ALTER com erro engolido). Exceção: ledger `schema_migrations_almoxarifado` em `server/services/almoxarifado/schema.js:199`.

## Backend do almoxarifado

### Rotas (3 arquivos, ~117 rotas)
| Arquivo | Conteúdo |
|---|---|
| `server/routes/almoxarifado.js` (2.008 L, 64 rotas) | materiais, dashboard, movimentações **v1**, conferências/inventário, tipos, localizações, setores, famílias, configurações (9 grupos), requisições (fluxo completo + aprovação por valor), lembretes. Auth em bloco: `app.use('/api/almoxarifado', authenticateToken, checkModulePermission('almoxarifado'))` (linha 138). **Contém DDL duplicado (linhas 55-1068)** |
| `server/routes/almoxarifado/extended.js` (381 L, 45 rotas "v3") | movimentações **v2**, transferências, reservas, recebimentos + workflow fiscal NF, devoluções, sobras, ferramentas/empréstimos, materiais de cliente, compras por mínimo, auditoria, 15 relatórios, setores-requisição. Cada rota com `requirePermission(<ação>)` |
| `server/routes/requisicoesMaterial.js` (543 L, 8 rotas) | API cross-módulo de requisições (`/api/requisicoes-material`), whitelist por setor, disponibilidade em lote. Sem `checkModulePermission` de propósito |

### Serviços (`server/services/almoxarifado/`)
`schema.js` (DDL+seeds, 768 L) · `stockService.js` (motor de movimentação, 380 L) · `receiptService.js` (recebimento+fiscal, 511 L) · `alertService.js` (e-mail/WhatsApp, 635 L) · `requisitionService.js` · `requisitionValueApprovalService.js` · `requisitionReminderService.js` (job 1h) · `requisitionNotificationService.js` · `requisitionPurchaseNotifyService.js` · `sectorMaterialService.js` (whitelist, 401 L) · `stockAvailabilityService.js` · `reportService.js` (15 relatórios) · `permissions.js` (7 perfis × 15 ações) · `returnService.js` · `toolService.js` · `clientMaterialService.js` · `scrapService.js` · `purchaseService.js` · `materialPhoto.js` · `audit.js` · `db.js`

### Tabelas principais (definidas em `services/almoxarifado/schema.js`)
- `materiais_almoxarifado` (+colunas v3: familia_id, tipo_material, material_critico, controle_lote, controle_certificado, quantidade_reservada/bloqueada/em_inspecao, custo_medio, permite_saldo_negativo)
- `estoque_saldo_almoxarifado` — saldo por material+localização+lote (UNIQUE)
- `movimentacoes_almoxarifado` (+v3: origem/destino, lote, projeto_id, os_id, cliente_id, estorno, reserva/recebimento/requisicao_id)
- `localizacoes_almoxarifado` (hierárquica, mapa 2D) · `setores_almoxarifado` · `categorias_material_almoxarifado` (parent_id) · `familias_material_almoxarifado` · `unidades_medida_almoxarifado` · `tipos_material_almoxarifado`
- `requisicoes_almoxarifado` + `itens_requisicao_almoxarifado` + `requisicao_lembretes_log`
- `recebimentos_material_almoxarifado` (+25 colunas fiscais) + itens + `inspecoes_recebimento_almoxarifado`
- `reservas_material_almoxarifado` · `devolucoes_material_almoxarifado` · `sobras_material_almoxarifado` · `ferramentas_almoxarifado` + `emprestimos_ferramenta_almoxarifado` · `materiais_cliente_almoxarifado`
- `conferencias_almoxarifado` + itens (inventário) · `solicitacoes_compra_almoxarifado` · `alertas_estoque_*` · `auditoria_log_almoxarifado` · `anexos_documento_almoxarifado` · `perfil_almoxarifado_usuario` · `configuracoes_almoxarifado` (28 chaves) · `setores_requisicao_almoxarifado` + `setor_material_permitido`

### O que NÃO existe no banco
Tabela de almoxarifados múltiplos · tabela de lotes de estoque (lote é TEXT livre) · números de série de material · subfamílias formais (`subcategoria_id` aponta para categorias por convenção) · curva ABC/valorização · remessas a terceiros · calibração · XML NF-e.

### Tabelas órfãs (criadas em `index.js`, sem rota)
`lotes` (produção), `rastreabilidade_lotes`, `controle_qualidade`, `logs_operacoes`.

## Permissões (4 camadas)

1. **Flags globais** (`services/systemPermissions.js`): `is_superadmin`, `role='admin'`, `admin_modulos` JSON. Helpers `canConfigureAlmox`, `requireAlmoxAdmin`, `canDeleteAlmoxRequisicao`.
2. **Módulo** (`index.js:2780` `checkModulePermission`): tabelas `permissoes`/`grupos_permissoes`/`usuarios_grupos`. ⚠️ default: usuário sem grupo ganha `comercial`.
3. **Perfil do almoxarifado** (`services/almoxarifado/permissions.js`): 7 perfis (ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA) × 15 ações. Fallback sem perfil → PRODUCAO.
4. **Whitelist por setor** (`sectorMaterialService.js`): `setor_material_permitido` + tipo industrial/administrativo.

## E-mail

- **(A) Global**: `index.js:2939 sendEmail` — ⚠️ SMTP hardcoded no código.
- **(B) Almoxarifado**: `alertService.js:413` — config na tabela `configuracoes_almoxarifado`, histórico em `alertas_estoque_historico_almoxarifado`, canal WhatsApp opcional. Consumidores: alertas de mínimo, nova requisição, itens sem estoque→Compras, lembretes (job 1h), aprovação por valor.

## Frontend do almoxarifado (`client/src/components/almoxarifado/`)

Rotas em `App.js:451-483` sob `/almoxarifado` (`ProtectedModuleRoute`). Menu em `Layout.js:327-338`.

| Tela | Rota | Estado |
|---|---|---|
| `AlmoxarifadoDashboard.js` | `/almoxarifado` | KPIs + 2 relatórios |
| `MateriaisAlmoxarifado.js` + `MaterialAlmoxarifadoForm.js` | `/materiais` | CRUD com foto, código automático. ⚠️ categorias hardcoded duplicadas em 3 componentes |
| `MovimentacoesAlmoxarifado.js` | `/movimentacoes` | ⚠️ usa rota **v1**; `referencia` é texto livre |
| `ConferenciaEstoque.js` | `/conferencias` | inventário simples |
| `RecebimentosAlmoxarifado.js` (732 L) | `/recebimentos` | workflow NF 4 etapas / 11 status |
| `RequisicoesList.js` (1.080 L) + `RequisicaoForm.js` + `RequisicaoMaterialCesta.js` | `/requisicoes` + `{modulo}/requisicoes-material` | fluxo completo, 2 UX (industrial × cesta) |
| `MapaLocalizacoesAlmoxarifado.js` (786 L) | `/mapa` | mapa 2D drag-and-drop |
| `ConfiguracoesAlmoxarifado.js` (⚠️ 2.499 L) | `/configuracoes` | 9 abas |

**Sem tela:** reservas, devoluções, sobras, ferramentas, materiais de cliente, transferências, estorno, auditoria, relatórios (só 2 no dashboard), inspeção/quarentena, lotes/séries/etiquetas.

**Arquitetura front:** axios único em `client/src/services/api.js`; sem camada de service por domínio (não há `almoxarifadoApi.js`); sem react-query; permissões em `client/src/utils/systemPermissions.js` + `services/permissionsCache.js`. Registro de módulo espalhado em 5 arquivos (`Layout.js`, `modulosMeta.js`, `lazyModules.js`, `requisicoesMaterialConfig.js`, `TipoSelecao.js`).

## Testes

- Runner caseiro (sem jest/mocha): cada `server/tests/*.test.js` é script Node com helper `test()`, `assert` nativo, exit code. Padrão canônico: `server/tests/proposta523Fixa.test.js`.
- `server/tests/almoxarifado.test.js` — **43 testes** de serviço (SQLite `:memory:` + `initSchema`), cobrem: entrada/saída/saldo negativo, reservas, transferência, bloqueio, material inativo, material de cliente, permissões, auditoria, recebimento+workflow NF, separação/entrega parcial, exclusão com estorno, alertas, mapa, setor, lembretes, liberação por valor. Rodar: `npm run test:almoxarifado` (em `server/`).
- Também: `sectorMaterial.test.js`, `stockAvailability.test.js`, `materialPhoto.test.js`, `permissionsCacheAdmin.test.js`, `sqliteConcurrency.test.js`.
- **Não há testes HTTP** (supertest) — `index.js` não exporta o app. Não há CI.

## Módulo paralelo a consolidar um dia

Materiais de escritório: `materiais_escritorio` (30 itens) + `solicitacoes_compra`(+itens/decisoes) + `limites_setor` — fluxo próprio, telas em `engenhariaProjetos/`. Terceiro caminho paralelo de "pedir material". Candidato à consolidação futura com o almoxarifado (não é prioridade agora).
