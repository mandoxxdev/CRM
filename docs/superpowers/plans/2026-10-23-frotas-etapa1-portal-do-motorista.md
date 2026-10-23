# Frotas — Etapa 1: portal do motorista (o formulário de papel dentro do sistema)

> **Status:** plano escrito em 2026-10-23 · execução: ver "Estado das tasks" no fim.
> **Spec:** [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) e
> [`00-processo-atual`](../../../specs/modulo-frotas/00-processo-atual/README.md) (formulário × planilha × sistema).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B.

## Objetivo

O motorista entra no sistema (pelo celular), e em **um formulário** registra o que hoje vai no papel: **saída**, **retorno**
ou **inspeção** — km, horário, combustível, os 12 itens OK/N/A/Falha e as avarias. Saída abre a viagem, retorno fecha.
Abastecimento também tem tela própria do motorista. O motorista **só vê e só altera o que é dele**. O gestor exporta tudo
**no formato da planilha** que eles usam hoje. Corrige os achados que o portal expõe no primeiro dia: A1, A2, A3, A4, A5, A6, A9.

Fora desta etapa: A7 (multa no período do relatório), A10 (horímetro), foto/anexo, desenho clicável do mapa de avarias,
seção 3 do formulário (a imagem recebida está cortada), apelido V01/C01.

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F1.01 | Itens do checklist = os 12 do papel, chaves fixas em `ITENS_CHECKLIST` (`schema.js`); resposta de cada um ∈ `OK` · `NA` · `FALHA` | `pneus_estepe: 'FALHA'` aceito; `'talvez'` → 400 |
| RN-F1.02 | Situação do registro: **PENDENCIA** se algum item `FALHA` **ou** houver avaria; senão **INCOMPLETO** se faltar algum dos 12; senão **OK**. (Avaria conta como "Não conforme" na coluna Avarias da planilha.) `aprovado` legado = 1 só se OK | 11 itens OK sem avaria → INCOMPLETO; 12 OK + 1 avaria → PENDENCIA |
| RN-F1.03 | Checklist enviado sem nenhum item (API antiga, `POST /checklists`) **não** é aprovado: item ausente deixa de valer OK (A3) | `POST /checklists {veiculo_id, data_checklist}` → `aprovado = 0`, `status_geral = 'INCOMPLETO'` |
| RN-F1.04 | **Saída** grava o registro (tipo `saida`) **e** abre uma viagem `em_andamento` com km_saida = km informado, data_saida = data+horário, motorista, origem, destino, finalidade. Sem aprovação (a planilha não tem) | viagem nasce `em_andamento`, `registro.viagem_id` preenchido |
| RN-F1.05 | Um veículo só tem **uma** viagem `em_andamento`; um motorista também | 2ª saída do mesmo veículo → 409 |
| RN-F1.06 | **Retorno** fecha a viagem `em_andamento` **do motorista**: km_retorno, data_retorno, km_rodado = km_retorno − km_saida, status `concluida`; grava o registro (tipo `retorno`) com o mesmo `viagem_id` e o veículo da viagem | retorno sem viagem aberta → 409 |
| RN-F1.07 | km do retorno **menor** que o da saída → recusa (planilha: "VERIFICAR KM"). Vale também no `PUT /viagens/:id` (A5) | saída 2000, retorno 1800 → 400 |
| RN-F1.08 | Saída, retorno, inspeção e abastecimento sobem o `km_atual` do veículo se o km for maior (regra que já existe) | |
| RN-F1.09 | **Inspeção** grava só o registro (tipo `inspecao`), sem viagem | |
| RN-F1.10 | Registro com PENDENCIA vira **alerta** no painel do gestor (tipo `checklist`, severidade `alto`) por 7 dias | |
| RN-F1.11 | km/L de um abastecimento = (km dele − km do abastecimento **anterior em km** do mesmo veículo) ÷ litros dele; guarda também `km_desde_anterior`. Ao criar, editar ou excluir, **recalcula o vizinho seguinte** (A1, A2) | editar só a observação mantém o km/L; lançar um retroativo recalcula o seguinte |
| RN-F1.12 | Usuário ↔ motorista: `frotas_motoristas.usuario_id`, **um motorista por usuário** (entre os ativos) | ligar o mesmo usuário a 2 motoristas → 409 |
| RN-F1.13 | Portal exige vínculo: sem motorista ligado ao usuário, as gravações do portal respondem 409 `MOTORISTA_NAO_VINCULADO` | |
| RN-F1.14 | Perfil **MOTORISTA** só **lista** o que é dele: abastecimentos, viagens, checklists e multas por `motorista_id` do vínculo; manutenções por `usuario_id`; motoristas = só ele mesmo. Sem vínculo, as listas vêm vazias (A6) | |
| RN-F1.15 | Perfil MOTORISTA só **altera** (`PUT`) registro dele (mesma régua da RN-F1.14) → senão 403 | |
| RN-F1.16 | Painel e alertas (`/dashboard`, `/alertas`) passam a exigir `ver_painel` (ADMIN_FROTA, CONSULTA). Multas e documentos: criar/alterar passam a `gerenciar_veiculos` (motorista não lança multa nem documento) | MOTORISTA em `/dashboard` → 403 |
| RN-F1.17 | "Aprovar" só vale para viagem `solicitada` (A4) | aprovar concluída → 409 |
| RN-F1.18 | Exportação no formato da planilha: abas **Cadastro Frota, Viagens e KM, Checklist, Abastecimentos, Manutenções, Documentos**, perfil `relatorios`, período opcional sobre a data de cada aba | |

## Contratos de API (congelados)

Todas sob `/api/frotas`, com `auth + módulo frota`. Erros: `{ error: '<mensagem literal>' }` (+ `code` quando indicado).

### `GET /portal/inicio` — qualquer perfil com módulo
`200 { motorista: {id, nome, cnh_validade} | null, viagem_aberta: {id, veiculo_id, placa, km_saida, data_saida, destino} | null,
veiculos: [{id, placa, modelo, marca, km_atual, tipo_medicao, em_uso: bool}], itens: [{chave, rotulo}] (os 12, em ordem),
vistas: ['lateral_esquerda','lateral_direita','superior','frente','traseira'], tipos_avaria: ['R','A','T','Q','O'],
niveis_combustivel: ['vazio','1/4','1/2','3/4','cheio'] }`
`veiculos` = ativos (`ativo=1` e status ≠ `vendido`/`inativo`).

### `POST /portal/registros` — `registrar_operacoes`
Corpo: `{ tipo: 'saida'|'retorno'|'inspecao', veiculo_id (obrigatório em saida/inspecao; ignorado em retorno), km: number ≥ 0,
data: 'AAAA-MM-DD' (padrão hoje de Brasília), horario: 'HH:MM' (padrão agora), nivel_combustivel: um de niveis | null,
itens: { <chave>: 'OK'|'NA'|'FALHA' }, avarias: [{ vista, tipo, descricao? }], observacoes?, origem?, destino?, finalidade? }`
Resposta `201 { registro: <linha de frotas_checklists com itens e avarias já como objeto/array>, viagem: <linha de frotas_viagens> | null }`

| Caso | Código | Mensagem literal |
|---|---|---|
| usuário sem motorista ligado | 409 | `Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo.` (`code: 'MOTORISTA_NAO_VINCULADO'`) |
| tipo inválido | 400 | `Tipo deve ser saida, retorno ou inspecao` |
| km ausente/negativo/não número | 400 | `Informe o KM atual` |
| veículo ausente (saída/inspeção) | 400 | `Escolha o veículo` |
| veículo inexistente ou inativo | 404 | `Veículo não encontrado` |
| item com chave ou resposta inválida | 400 | `Item de checklist inválido: <chave>` |
| avaria com vista ou tipo inválido | 400 | `Avaria inválida` |
| nível de combustível inválido | 400 | `Nível de combustível inválido` |
| saída com veículo já em uso | 409 | `Este veículo já está em uso (saída sem retorno).` |
| saída com motorista já em viagem | 409 | `Você já tem uma saída sem retorno. Registre o retorno primeiro.` |
| retorno sem viagem aberta do motorista | 409 | `Você não tem saída aberta para registrar o retorno.` |
| retorno com km < km_saida | 400 | `KM do retorno (<km>) menor que o KM da saída (<km_saida>). Confira o hodômetro.` |

### `POST /portal/abastecimentos` — `registrar_operacoes`
Corpo: `{ veiculo_id, km, litros, valor_total, data?, posto?, combustivel_tipo?, observacoes? }`. `motorista_id` = o do vínculo
(o corpo **não** escolhe). Mesma regra de cálculo da RN-F1.11. `201 <linha de frotas_abastecimentos>`.
Erros: 409 vínculo (acima); 400 `Veículo, litros e data são obrigatórios` (o existente); 400 `Informe o KM atual`.

### `GET /portal/meus-registros?limite=30` — qualquer perfil com módulo
`200 { registros: [checklists do motorista, mais novos primeiro, com placa], abastecimentos: [os dele, com placa] }`; sem vínculo → listas vazias.

### Mudanças em rotas existentes
- `GET /dashboard`, `GET /alertas` → `ver_painel`; 403 padrão do `requirePermission` (`Sem permissão para esta operação`).
- `POST/PUT /multas`, `POST/PUT /documentos` → `gerenciar_veiculos`.
- `PUT` de manutenções, abastecimentos, multas, viagens por MOTORISTA em registro alheio → 403 `Você só pode alterar os seus próprios registros`.
- `PUT /viagens/:id` com km_retorno < km_saida → 400 `KM do retorno (<km>) menor que o KM da saída (<km_saida>). Confira o hodômetro.`
- `POST /viagens/:id/aprovar` fora de `solicitada` → 409 `Só é possível aprovar viagem solicitada`.
- `POST/PUT /motoristas` aceitam `usuario_id` (número ou null); ligado a outro motorista ativo → 409 `Este usuário já está ligado ao motorista <nome>`.
- `GET /checklists` passa a trazer `tipo_registro, km, horario, nivel_combustivel, status_geral, itens, avarias, viagem_id`.
- `GET /abastecimentos` passa a trazer `km_desde_anterior`.

### `GET /exportar.xlsx?data_inicio&data_fim` — `relatorios`
`200` binário xlsx, `Content-Disposition: attachment; filename="controle-de-frota-<AAAA-MM-DD>.xlsx"`. Abas e colunas:
- **Cadastro Frota**: Placa, Tipo, Marca, Modelo, Ano, KM Atual, Responsável, Próxima Revisão KM, Próxima Revisão Data, Situação
  (próxima revisão = a menor pendente entre as manutenções do veículo).
- **Viagens e KM**: Data, Veículo (placa), Condutor, Finalidade, Origem, Destino, Saída, Retorno, KM Inicial, KM Final, KM Percorrido, Status, Observações.
- **Checklist**: Data, Horário, Tipo, Veículo, Condutor, KM, Combustível, os 12 itens (Conforme / Não conforme / N/A / vazio), Avarias (texto `Vista: tipo — descrição; …` ou vazio), Status Geral (OK / PENDÊNCIA / INCOMPLETO), Observações.
- **Abastecimentos**: Data, Veículo, Condutor, KM, Litros, Valor Total R$, Preço por Litro, KM desde Abastec. Anterior, Consumo km/L, Posto, Observações.
- **Manutenções**: Data, Veículo, Tipo, Serviço, Fornecedor, KM Serviço, Custo R$, Próxima Revisão KM, Próxima Revisão Data, Status (agendada→Planejada, em_andamento→Em andamento, concluida→Concluída), Observações.
- **Documentos**: Veículo, Documento, Vencimento, Dias até Vencer, Status (VENCIDO / ATENÇÃO ≤ 30 / EM DIA), Observações.
Período filtra Viagens (data_saida), Checklist, Abastecimentos, Manutenções; Cadastro e Documentos saem inteiros.

## Esquema (migração aditiva, `safeAlter`)

- `frotas_checklists`: `tipo_registro TEXT DEFAULT 'inspecao'`, `km REAL`, `horario TEXT`, `nivel_combustivel TEXT`,
  `itens_json TEXT`, `avarias_json TEXT`, `status_geral TEXT`, `viagem_id INTEGER`. Os 7 `*_ok` legados continuam gravados:
  pneus←pneus_estepe, oleo←oleo_motor, luzes←farois_lanternas, freios←freios, documentos←documentos_equipamentos,
  extintor e limpeza ← 1 (o papel não tem); FALHA → 0, OK/NA → 1.
- `frotas_viagens`: `origem TEXT`.
- `frotas_abastecimentos`: `km_desde_anterior REAL`.
- `ITENS_CHECKLIST` (ordem do papel): `pneus_estepe` Pneus e estepe · `farois_lanternas` Faróis / lanternas · `setas_luz_freio`
  Setas / luz de freio · `parabrisa_vidros` Parabrisa / vidros · `espelhos_retrovisores` Espelhos / retrovisores ·
  `limpadores_agua` Limpadores / água · `oleo_motor` Óleo do motor / vazamentos · `arrefecimento` Arrefecimento / nível ·
  `freios` Freios / freio de estacionamento · `buzina_cintos` Buzina / cintos · `documentos_equipamentos` Documentos /
  equipamentos · `carroceria_carga` Carroceria / amarração da carga.

## Ajustes da Fase 2 (revisor fresco, 18 achados — **valem sobre o texto acima**)

| Achado | Ajuste no plano |
|---|---|
| F2-1 (trava) `crudRoutes` não passa `req.user` a list/getOne/update | T3 muda as assinaturas: `listFn(db, query, user)`, `getOne(db, id, user)`, `updateFn(db, id, body, user)` para todas as entidades |
| F2-2 (trava) `GET /motoristas/:id` abre CPF/CNH de qualquer um | RN-F1.14 vale para `GET /:id`: MOTORISTA pedindo outro → 404 `Não encontrado` |
| F2-3 (trava) motorista troca `motorista_id` no PUT/POST antigos | **RN-F1.19**: para MOTORISTA, `POST`/`PUT` de abastecimentos, viagens e checklists **forçam** `motorista_id` = o do vínculo (o do corpo é ignorado); sem vínculo → 409 `MOTORISTA_NAO_VINCULADO` (mensagem do contrato) |
| F2-4 (trava) não dá para desvincular | `updateMotorista` usa `'usuario_id' in data` (null desvincula). Teste de desvincular |
| F2-5 (trava) seletor `/usuarios/por-modulo` filtra por setor | Endpoint novo **`GET /api/frotas/usuarios-vinculaveis`** (`gerenciar_motoristas`): `200 [{id, nome, email, motorista: {id, nome} | null}]` de `usuarios WHERE ativo = 1 ORDER BY nome`. `usuario_id` inexistente/inativo no POST/PUT de motorista → 400 `Usuário não encontrado` |
| F2-6 (trava) situação calculada em duas tasks | `situacaoDoRegistro({itens, avarias, legados})` mora em `schema.js` (T1) e é a única régua; T2/T4/T5 a importam |
| F2-7 (trava) checklist da tela antiga sairia sempre INCOMPLETO | **RN-F1.03 reescrita:** registro **sem** `itens` (rota antiga) usa os 7 `*_ok`: algum enviado = 0 → PENDENCIA; os 7 enviados = 1 → OK; algum ausente → INCOMPLETO. `aprovado` = (OK). Com `itens` → RN-F1.02 |
| F2-8 recálculo do km/L | RN-F1.11: ordem = `km ASC, id ASC`; linha sem km fica com km/L e km_desde_anterior nulos e não serve de "anterior"; PUT que muda km/veículo recalcula o seguinte da posição antiga e o da nova (nos dois veículos); DELETE lê a linha antes e recalcula o seguinte |
| F2-9 viagem órfã | `em_uso` = existe viagem `em_andamento` do veículo; o gestor fecha pelo `PUT /viagens/:id {status:'concluida', km_retorno}`; teste |
| F2-10 viagens abertas em dobro | RN-F1.05 vale também em `POST`/`PUT /viagens` que levem a `em_andamento` → 409 com as mesmas mensagens. **Saída consome** uma viagem `aprovada` do mesmo veículo e motorista (vira `em_andamento` com os dados da saída) em vez de criar outra (B8) |
| F2-11 front não sabe quem pode gravar | `GET /portal/inicio` devolve também `perfil`, `pode_registrar` (`can(user,'registrar_operacoes')`) e `pode_gerir` (`can(user,'gerenciar_veiculos')`) |
| F2-12 erros sem mensagem | Portal: `data` fora de `AAAA-MM-DD` → 400 `Data inválida`; `horario` fora de `HH:MM` → 400 `Horário inválido`; abastecimento: veículo inexistente/inativo → 404 `Veículo não encontrado`; `litros` ≤ 0 ou ausente → 400 `Informe os litros`; `valor_total` < 0 → 400 `Valor inválido`; data padrão = hoje (sem a mensagem antiga) |
| F2-13 cache do painel nos testes | `routes/frotas.js` exporta `limparCacheDashboard()`; o harness chama ao criar o app; `requirePermission('ver_painel')` fica **antes** do cache |
| F2-14 saída com veículo em manutenção | `inicio.veiculos[]` traz `status`; saída com veículo `manutencao` → 409 `Veículo em manutenção. Fale com o gestor da frota.` (inspeção e retorno aceitam) |
| F2-15 formato da data da viagem | `data_saida`/`data_retorno` gravadas como `AAAA-MM-DDTHH:MM` (abre no `datetime-local` do gestor) |
| F2-16 multas no "PUT alheio" | multas saem dessa lista (já são `gerenciar_veiculos`) |
| F2-17 admin no portal | menu do ADMIN também mostra "Portal do motorista"; sem vínculo a tela mostra a mensagem do 409 |
| F2-18 "próxima revisão" | Cadastro Frota: Próxima Revisão KM = menor `proxima_revisao_km` > `km_atual`; Data = menor `proxima_revisao_data` ≥ hoje; entre as manutenções do veículo |

Galhos: T5 importa `situacaoDoRegistro` (F2-6); T6 usa `pode_registrar`/`perfil` (F2-11); T7 usa `usuarios-vinculaveis` (F2-5) e mantém "Novo Checklist" do gestor (F2-7 decidido).

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Harness `server/tests/helpers/frotasTestApp.js` (express + `:memory:` + `registerFrotasRoutes` real, `requirePermission` real, auth stub com `setUser`, módulo liberado) · mover `tests/frotas.test.js` para `tests/api/frotasServico.api.test.js` (A9) · esquema acima · `ITENS_CHECKLIST` e listas no `meta` · `ACAO_PERFIS.ver_painel` | tronco | — |
| T2 | Consumo por ordem de km + `km_desde_anterior` + recálculo do vizinho (RN-F1.11) · A3 (RN-F1.03) · A4 (RN-F1.17) · A5 (RN-F1.07 no PUT) | tronco | T1 |
| T3 | Vínculo usuário↔motorista (RN-F1.12) · escopo MOTORISTA em listas e PUT (RN-F1.14/15) · RN-F1.16 | tronco | T1 |
| T4 | Rotas do portal (`/portal/*`) e serviço `portalService.js` (RN-F1.01, 02, 04–10, 13) · alerta de pendência no painel | tronco | T2, T3 |
| T5 | `GET /exportar.xlsx` (RN-F1.18) | galho | T1 (lê as colunas) |
| T6 | Front: página `/frota/motorista` (celular primeiro) contra os contratos acima | galho | contrato |
| T7 | Front do gestor: campo "Usuário de acesso" no motorista (`/api/usuarios/por-modulo/frota`), colunas novas do Checklist (Tipo, KM, Situação), Origem em Viagens, botão "Exportar planilha" no Dashboard/Relatórios, menu por perfil (MOTORISTA vê só "Meu painel" + requisições; `/frota` de MOTORISTA redireciona para `/frota/motorista`) | galho | contrato |
| T8 | Integração pela rota: motorista ligado faz saída → retorno → 2 abastecimentos (um retroativo) → gestor exporta e a planilha tem as linhas; outro motorista não vê nem altera; e o mesmo fluxo entrando pelo serviço | integração | T4, T5 |

Cada task: TDD com controle positivo (quebrar a implementação e ver o vermelho). Testes em `server/tests/api/frotas*.api.test.js`.

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| T1 | feito — harness, schema, 12 itens, situacaoDoRegistro, ver_painel; teste antigo no runner (A9) | 4ed19f8b |
| T2 | feito — km/L por ordem de km + vizinho (A1/A2), checklist antigo sem itens (A3), aprovar so solicitada (A4), km do retorno no PUT (A5), uma viagem em andamento (F2-10) com fila em memoria | 80362b54 |
| T3 | feito — vinculo usuario-motorista (RN-12, F2-4, F2-5 + /usuarios-vinculaveis), escopo MOTORISTA nas listas, GET /:id e PUT (RN-14/15, F2-1, F2-2), motorista_id forcado (RN-19), painel/alertas = ver_painel e multas/documentos = gerenciar_veiculos (RN-16) | 6dd0b130 |
| T4 | feito — portalService + /portal/inicio, /registros, /abastecimentos, /meus-registros; alerta de pendencia (7 dias) no painel | este commit ("Frota etapa 1 T4") |
| T5 | a fazer | |
| T6 | a fazer (front, outro agente) | |
| T7 | a fazer (front, outro agente) | |
| T8 | a fazer | |
