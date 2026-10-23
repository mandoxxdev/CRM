# Módulo Frota — referência técnica (estado em 2026-10-23)

> Levantamento feito lendo o código na `main` em `d16de90b`. Guia de usuário:
> [`README.md`](README.md) · mapa de status: [`specs/modulo-frotas/README.md`](../../specs/modulo-frotas/README.md)

## Arquivos

| Camada | Arquivo | Linhas | Papel |
|---|---|---|---|
| Rotas | `server/routes/frotas.js` | 218 | Registra `/api/frotas/*`; `crudRoutes` genérico; cache de 30 s do dashboard |
| Serviço | `server/services/frotas/frotasService.js` | 886 | Toda a regra: CRUD, km, consumo, alertas, dashboard, relatórios |
| Schema | `server/services/frotas/schema.js` | 243 | `CREATE TABLE IF NOT EXISTS` + `safeAlter` + seed de tipos; listas fixas (setores, centros de custo, status) |
| Perfis | `server/services/frotas/permissions.js` | 49 | `ACAO_PERFIS`, `getPerfilFromUser`, `requirePermission` |
| Helpers | `server/services/frotas/db.js` | 26 | `dbRun/dbGet/dbAll` promisificados |
| Perfil no login | `server/services/systemPermissions.js` (`finishFrotaProfile`, `syncModuleAdminProfiles`), `server/services/leituraDeUsuarios.js` | — | Lê `perfil_frota_usuario`; admin do módulo vira `ADMIN_FROTA` |
| Telas | `client/src/components/frotas/` | ~1.600 | `FrotasDashboard`, `FrotasEntityPage` (genérica, 8 telas), `frotasEntityConfigs` (colunas/campos), `FrotasRelatorios`, `FrotasPageHeader`, `Frotas.css` |
| API cliente | `client/src/utils/frotasApi.js` | 67 | Cache de 45 s do dashboard e 60 s do meta, com dedupe |
| Rotas do front | `client/src/App.js:305-326`, menu `client/src/components/Layout.js:304-315` | — | `/frota/*`, protegido por `ProtectedModuleRoute modulo="frota"` |
| Testes | `server/tests/frotas.test.js` (6, **fora da suíte**), `server/tests/api/vencimentosFrotasFinanceiroNoDiaLocal.api.test.js` (Etapa 164), `client/src/components/frotas/FrotasEntityPage.test.js`, `client/src/components/Etapa164FrotasFinanceiro.test.js` | — | — |

Fora do módulo (não usar): `client/src/components/VeiculosManutencao.js` (rascunho sem rota) e
`src/pages/Veiculos.tsx` (app `src/` da raiz, não é o `client/`).

## Autorização

Duas camadas, como no almoxarifado:

1. **Módulo** — `checkModulePermission('frota')` em todas as rotas: abre as telas.
2. **Perfil** — `requirePermission(acao)` nas escritas.

| Ação | ADMIN_FROTA | MOTORISTA | CONSULTA |
|---|---|---|---|
| `visualizar` (não é usada em rota nenhuma — **todo GET só exige o módulo**) | ✓ | ✓ | ✓ |
| `gerenciar_veiculos` (CRUD veículo; **DELETE de todos os lançamentos**) | ✓ | | |
| `gerenciar_motoristas` | ✓ | | |
| `registrar_operacoes` (POST/PUT de manutenção, abastecimento, multa, documento, viagem, checklist) | ✓ | ✓ | |
| `aprovar_viagens` | ✓ | | |
| `relatorios` | ✓ | | ✓ |
| `configurar` (sem rota) | ✓ | | |

`getPerfilFromUser`: superadmin, admin do módulo `frota` ou `role === 'admin'` → `ADMIN_FROTA`; senão
`user.perfil_frota` (da tabela `perfil_frota_usuario`); **senão `MOTORISTA`**. A tela de usuários só
grava `ADMIN_FROTA` (via `admin_modulos`); `MOTORISTA`/`CONSULTA` não têm como ser atribuídos pela UI.
A coluna `frotas_motoristas.perfil_frota` é criada pelo schema mas **ninguém lê**.

**Não há escopo por dono:** nenhuma listagem filtra pelo usuário logado e o `PUT` não confere quem
criou o registro.

## API

Todas sob `authenticateToken + checkModulePermission('frota') + ensureSchema`.

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/frotas/meta` | módulo | tipos, motoristas ativos, setores, centros de custo, listas de status |
| GET | `/api/frotas/dashboard` | módulo | cache 30 s; `?refresh=1` fura |
| GET | `/api/frotas/alertas` | módulo | |
| GET | `/api/frotas/relatorios/custos-por-veiculo?data_inicio&data_fim` | `relatorios` | |
| GET | `/api/frotas/relatorios/consumo?veiculo_id` | `relatorios` | |
| GET/POST/PUT/DELETE | `/api/frotas/veiculos[/:id]` | GET módulo; resto `gerenciar_veiculos` | `?search&status`; tem `GET /:id` |
| GET/POST/PUT/DELETE | `/api/frotas/motoristas[/:id]` | GET módulo; resto `gerenciar_motoristas` | tem `GET /:id` |
| GET/POST/PUT/DELETE | `/api/frotas/manutencoes[/:id]` | POST/PUT `registrar_operacoes`; DELETE `gerenciar_veiculos` | `?veiculo_id&tipo&search` |
| GET/POST/PUT/DELETE | `/api/frotas/abastecimentos[/:id]` | idem | `?veiculo_id&search` |
| GET/POST/PUT/DELETE | `/api/frotas/multas[/:id]` | idem | `?veiculo_id&status_pagamento&search` |
| GET/POST/PUT/DELETE | `/api/frotas/documentos[/:id]` | idem | `?vencendo=1` |
| GET/POST/PUT/DELETE | `/api/frotas/viagens[/:id]` | idem | `?status` |
| POST | `/api/frotas/viagens/:id/aprovar` | `aprovar_viagens` | não confere o status atual |
| GET/POST/DELETE | `/api/frotas/checklists[/:id]` | POST `registrar_operacoes` | **sem PUT** |

Sem validação de esquema (Zod) — só checagem de obrigatórios no serviço. Erros 4xx levam
`err.status`; o resto passa por `respondDbError`.

## Tabelas

| Tabela | Campos principais | Exclusão |
|---|---|---|
| `frotas_tipos_veiculo` | nome, categoria (leve/pesado/industrial); seed de 10 tipos | — |
| `frotas_veiculos` | placa (UNIQUE, normalizada sem traço, maiúscula), modelo, marca, ano, tipo_id, status (ativo/manutencao/inativo/vendido), km_atual, horimetro_atual, tipo_medicao (km/horimetro), combustivel, consumo_medio_esperado, setor_responsavel, centro_custo, motorista_id, cor, chassi, renavam, foto (sem uso) | lógica (`ativo=0`) |
| `frotas_motoristas` | nome, cpf, **usuario_id (sem uso na tela)**, cnh_numero, cnh_categoria, cnh_validade, telefone, email, setor, status, perfil_frota (sem uso) | lógica |
| `frotas_manutencoes` | veiculo_id, tipo, descricao, oficina, custo, pecas_descricao, km_manutencao, data_manutencao, proxima_revisao_km/data, status (agendada/em_andamento/concluida), usuario_id/nome, requisicao_almox_id (só número) | física |
| `frotas_abastecimentos` | veiculo_id, motorista_id, data_abastecimento, litros, valor_total, valor_litro, posto, km_abastecimento, combustivel_tipo, consumo_medio, usuario_id/nome | física |
| `frotas_multas` | veiculo_id, motorista_id, data_infracao, descricao, valor, pontos, status_pagamento, data_vencimento, data_pagamento, numero_auto | física |
| `frotas_documentos` | veiculo_id, tipo (ipva/licenciamento/seguro/crlv/rastreador/outros), numero_documento, seguradora, valor, data_emissao, data_vencimento, alerta_dias_antes (30), status | física |
| `frotas_viagens` | veiculo_id, motorista_id, data_saida/retorno (datetime-local), km_saida/retorno/rodado, destino, finalidade, setor, status (solicitada/aprovada/em_andamento/concluida/cancelada), aprovador_*, solicitante_* | física |
| `frotas_checklists` | veiculo_id, motorista_id, data_checklist, 7 × `*_ok`, observacoes, aprovado, usuario_id/nome | física |
| `perfil_frota_usuario` (em `index.js`) | usuario_id, perfil | — |

Schema é montado na primeira requisição/boot por `runInitSchemaWithRetry` (3 tentativas), depois do
`SELECT 1` que espera a fila de DDL do `index.js`.

## Regras de cálculo

- **km do veículo** (`updateKmVeiculoSeMaior`): manutenção, abastecimento e retorno de viagem sobem o
  `km_atual` se o lançado for **maior**; nunca descem. Horímetro tem a função equivalente, mas
  **nenhum lançamento a chama** (abastecimento de veículo por horímetro não atualiza o horímetro).
- **km/L** (`calcConsumoMedio`): `(km lançado − km do último abastecimento do veículo por data) ÷
  litros lançados`; `null` se a diferença ≤ 0. Método "tanque cheio" implícito.
- **valor por litro**: `valor_total ÷ litros` se não vier.
- **Manutenção `em_andamento`** na criação → veículo `status='manutencao'`. Concluir **não** devolve o
  veículo a `ativo`.
- **Checklist**: `aprovado = 1` só se os 7 itens forem 1; item ausente vale 1.
- **Viagem**: `km_rodado = km_retorno − km_saida` no `PUT` se não vier.
- **Datas**: "hoje" é o dia de Brasília (`hojeLocalISO`, Etapa 164), no servidor e nos padrões dos
  formulários.

## Achados

Sonda executada em 2026-10-23 contra o `initSchema` e o `frotasService` reais, banco em memória
(script descartável no scratchpad da sessão; reproduzível com os passos abaixo).

| Id | Passos | Esperado | Medido |
|---|---|---|---|
| A1 | 2 abastecimentos (km 1000, km 1500, 50 L) → `updateAbastecimento(2º, {observacoes})` | km/L 10 | `null` — o "anterior" do recálculo é o **próprio** registro (último por data) |
| A2 | depois disso, abastecimento com data anterior e km 500 | km/L do trecho | `null`; vizinhos não recalculam |
| A3 | `createChecklist({veiculo_id, data_checklist})` sem itens | recusar ou reprovar | `aprovado = 1` |
| A4 | viagem `concluida` → `aprovarViagem` | 409 | `status='aprovada'` |
| A5 | viagem km_saida 2000 → `PUT {km_retorno: 1800}` | 400 | `km_rodado = -200` |
| A6 | `getPerfilFromUser({id:9, role:'usuario'})` | — | `MOTORISTA`, `can(…,'registrar_operacoes') = true`; GETs sem filtro por dono |
| A7 | leitura de `relatorioCustosPorVeiculo` | período em multas | subconsulta de multas sem filtro de data |
| A8 | abastecimento km 900 com veículo em 1800 | aviso/recusa | aceito; km/L `null` |
| A9 | `server/tests/frotas.test.js` | na suíte | 6/6 passam, mas o runner só descobre `tests/api/*.api.test.js` |

Testes rodados no levantamento: `node server/tests/frotas.test.js` → **6 passou, 0 falhou**;
`node server/tests/api/vencimentosFrotasFinanceiroNoDiaLocal.api.test.js` → **17 passaram, 0 falharam**.

Banco local (`projetos/CRM/server/data/database.sqlite`, leitura): **0 linhas** em todas as tabelas
`frotas_*` e em `perfil_frota_usuario`.

## Peças que o portal do motorista pode reaproveitar

- `usuario_id` em `frotas_motoristas` — o vínculo login ↔ motorista já tem coluna.
- `usuario_id/usuario_nome` gravados em manutenção, abastecimento e checklist; `solicitante_id` na
  viagem — dá para filtrar "os meus" sem migração.
- `getPerfilFromUser` já devolve `MOTORISTA` para quem não é admin — o perfil certo por padrão.
- `Frotas.css` tem `@media (max-width: 768px)`, mas as telas são tabela + modal (feitas para desktop).
