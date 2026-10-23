# Frota — Etapa 6: tratar a pendência do registro

> **Status:** em execução (2026-10-23) — Fase 2 feita (ajustes no fim do plano); T1 em andamento.
> **Origem:** "Próxima tarefa detalhada" do [plano da Etapa 5](2026-10-23-frotas-etapa5-fotos.md) (B60).
> **Spec:** `specs/modulo-frotas/18-tratar-pendencia/README.md` (criada no fechamento) e o mapa
> [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) (features 06, 09).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B
> (B61+).

## Objetivo

O motorista marca uma falha de freio ou uma avaria (e, desde a Etapa 5, fotografa). O gestor recebe o alerta *"Checklist com pendência —
(placa)"* no painel. E aí o ciclo para: **não há onde dizer "consertado"**, e o alerta **some sozinho em 7 dias**, consertado ou não. Uma
falha de freio de 8 dias atrás sai do painel sem ninguém ter mexido; uma avaria consertada ontem continua gritando por uma semana.

Esta etapa fecha o ciclo: o gestor marca a pendência como **tratada** (com o que foi feito e, se quiser, a manutenção que abriu para o
conserto); o alerta sai do painel na hora; a lista do gestor, o "Meus registros" do motorista e a planilha mostram que foi tratada. A
pendência **não tratada não some mais** do painel.

## Fase 0 — medido antes de prometer

- `frotas_checklists` tem `status_geral` (`OK`/`PENDENCIA`/`INCOMPLETO`, régua única `situacaoDoRegistro` em `schema.js`) e **nenhum campo
  de tratamento**. Não há `PUT /checklists` (B10) e nenhum outro código grava `status_geral` depois do `INSERT` (medido:
  `grep -rn "status_geral" server/services server/routes` → só `inserirRegistro`, `getAlertas`, `exportacaoService`). A situação de um
  registro **não muda** depois de gravada — "tem pendência" é estável.
- Linhas de antes da Etapa 1 têm `status_geral` nulo: a tela do gestor cai no `aprovado` (0 → PENDÊNCIA); o alerta **não** as vê (só
  `status_geral = 'PENDENCIA'`). O banco local tem 0 registros (medido no levantamento); produção nunca usou o módulo.
- Alerta: `frotasService.getAlertas` (~1286) — `WHERE c.status_geral = 'PENDENCIA' AND date(c.data_checklist) >= date(?, '-7 days')`.
  Mesma função atende `GET /alertas` e o `getDashboard` (perfil `ver_painel`). O teste `frotasPortal.api.test.js` RN-F1.10 **trava a janela
  de 7 dias** ("o de 8 dias atrás não") — muda nesta etapa (RN-F6.04), com o teste reescrito e a mudança dita.
- **Cache do painel:** `routes/frotas.js` guarda o `GET /dashboard` por 30 s (`DASHBOARD_CACHE_MS`, um cache só para todos); a tela guarda
  45 s (`frotasApi.fetchFrotasDashboard`, `invalidateFrotasDashboardCache` existe). Sem limpar os dois, o alerta tratado continuaria no
  painel por até 75 s.
- Listas: `listChecklists` (`c.*`, escopo RN-F1.14) e `portalService.meusRegistros` (`c.*`, só o vínculo) — colunas novas saem sozinhas
  pelo `c.*`.
- Planilha: `exportacaoService.abaChecklist` — colunas novas **no fim** (B41).
- Tela do gestor: `FrotasEntityPage` (genérica) — ações por linha fixas (Editar, Aprovar da viagem, Excluir), só com `podeAlterar`
  (≠ CONSULTA). Não há gancho de ação por linha: **entra um** (`config.AcoesDaLinha`, componente opcional por entidade) — o mesmo que o
  D14 pediria. Painel: `FrotasDashboard.PainelDoGestor`, alerta `tipo === 'checklist'` traz `referencia_id` (id do registro) e `veiculo_id`.
- Portal: `FrotasPortalMotorista.MeusRegistros` mostra `SITUACAO[r.status_geral]`.
- Data/hora local: `diaLocal.hojeLocalISO(agora)` e `portalService.horaLocalHHMM(agora)` (Brasília). Formato do instante gravado:
  `AAAA-MM-DDTHH:MM` (o mesmo de `data_saida`), que a tela já lê (`dataLegivel`).
- Manutenções: `frotas_manutencoes(veiculo_id, descricao, data_manutencao, status)`; `GET /manutencoes?veiculo_id=` existe (o gestor vê
  todas).
- Permissões: `gerenciar_veiculos` = só ADMIN_FROTA. **`ACAO_PERFIS` não muda.**
- Réguas de fonte de fora do módulo (lição da Etapa 5): rotas novas com caminho **literal** (`app.post('/api/frotas/checklists/:id/...')`);
  nada novo sob `/api/uploads`. Rodar `npm run test:api` inteiro **logo depois do T1**, não só no fim.

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F6.01 | Colunas novas em `frotas_checklists` (`safeAlter`): `pendencia_tratada_em` (`AAAA-MM-DDTHH:MM`, Brasília), `pendencia_tratada_por_id`, `pendencia_tratada_por_nome`, `pendencia_tratamento` (texto), `pendencia_manutencao_id` (opcional). A situação gravada **não muda** (continua PENDENCIA — é o que o motorista viu); "tratada" é um estado à parte | registro tratado: `status_geral` = `PENDENCIA` e `pendencia_tratada_em` preenchido |
| RN-F6.02 | Tratar: `POST /api/frotas/checklists/:id/tratar-pendencia` `{ tratamento, manutencao_id? }`, perfil `gerenciar_veiculos` (só o gestor). Texto obrigatório (sem espaços nas pontas), até 1000 caracteres. Só registro com `status_geral = 'PENDENCIA'` e ainda não tratado — a condição vai **no `WHERE` da gravação** (dois gestores ao mesmo tempo: um só grava). A manutenção, se vier, tem de existir e ser **do mesmo veículo** — também no `WHERE` | dois gestores tratam juntos → um 200 e um 409 `Esta pendência já foi tratada` |
| RN-F6.03 | Desfazer: `DELETE /api/frotas/checklists/:id/tratar-pendencia`, só o gestor; limpa as 5 colunas (`WHERE pendencia_tratada_em IS NOT NULL`); o alerta volta | tratou o registro errado → desfaz → o alerta volta ao painel |
| RN-F6.04 | O alerta *"Checklist com pendência"* sai para todo registro `PENDENCIA` **não tratado**, **sem janela de 7 dias** (a RN-F1.10 dizia "nos últimos 7 dias"; muda aqui). Tratado não gera alerta. Os outros campos do alerta não mudam | registro com falha de 8 dias atrás, não tratado → continua no painel; tratado → sai |
| RN-F6.05 | Leitura: `GET /checklists` e `GET /portal/meus-registros` trazem as colunas da RN-F6.01; `GET /checklists` traz também `pendencia_manutencao_descricao` (a descrição da manutenção ligada, `null` se ela não existir mais). Planilha: aba Checklist ganha **no fim** `Pendência tratada em` (`AAAA-MM-DD HH:MM`), `Tratada por` e `O que foi feito` (vazias no registro não tratado) | exportar com um registro tratado → as três colunas preenchidas na linha dele |
| RN-F6.06 | Tela do gestor (lista **Checklist**): na linha com `status_geral = 'PENDENCIA'` não tratada, botão **Tratar pendência** (só ADMIN_FROTA) → janela com *O que foi feito* e *Manutenção (opcional)* (as manutenções do veículo); tratada: a etiqueta vira **PENDÊNCIA · tratada** e embaixo *"Tratada em DD/MM/AAAA às HH:MM por (nome): (texto)"*, com botão **Desfazer tratamento** (só ADMIN_FROTA, com confirmação). Consulta vê a etiqueta e o texto, sem botão | |
| RN-F6.07 | Painel: o alerta *"Checklist com pendência"* ganha o botão **Tratar pendência** (só ADMIN_FROTA; Consulta não vê) que abre a mesma janela; ao tratar, o painel recarrega **sem cache** e o alerta some | |
| RN-F6.08 | Portal (Meus registros): o registro tratado mostra a etiqueta **PENDÊNCIA · tratada** e *"Tratada em DD/MM/AAAA às HH:MM: (texto)"*. O motorista não trata nem desfaz | |
| RN-F6.09 | Tratar e desfazer **limpam o cache do painel** no servidor (os 30 s) e na tela (os 45 s) | tratar e abrir o painel no mesmo segundo → o alerta já não está |

## Contratos de API (congelados)

Todas sob `authenticateToken + checkModulePermission('frota') + ensureSchema`, depois `requirePermission('gerenciar_veiculos')`.

### `POST /api/frotas/checklists/:id/tratar-pendencia`

Corpo: `{ tratamento: string, manutencao_id?: inteiro > 0 | null | '' }`. Recusas, **nesta ordem**:

| # | Status | Corpo | Quando |
|---|---|---|---|
| 1 | 403 | `{ error: 'Sem permissão para esta operação', acao, perfil }` | perfil sem `gerenciar_veiculos` (MOTORISTA, CONSULTA) |
| 2 | 400 | `{ error: 'Descreva o que foi feito' }` | `tratamento` ausente, não-texto, vazio ou só espaços |
| 3 | 400 | `{ error: 'O texto passou de 1000 caracteres' }` | `tratamento` (sem as pontas) > 1000 |
| 4 | 400 | `{ error: 'Manutenção inválida' }` | `manutencao_id` presente (≠ `null`/`''`/ausente) e não é inteiro > 0 nem texto só de dígitos (`'5'` vale) (`'abc'`, `0`, `-1`, `1.5`, `true`) |
| 5 | 404 | `{ error: 'Registro não encontrado' }` | `:id` não é inteiro > 0, ou não existe |
| 6 | 409 | `{ error: 'Este registro não tem pendência', code: 'SEM_PENDENCIA' }` | `status_geral` ≠ `PENDENCIA` (inclui nulo) |
| 7 | 409 | `{ error: 'Esta pendência já foi tratada', code: 'PENDENCIA_JA_TRATADA' }` | já tratada |
| 8 | 400 | `{ error: 'Manutenção não encontrada' }` | `manutencao_id` não existe |
| 9 | 400 | `{ error: 'Esta manutenção é de outro veículo' }` | manutenção de outro veículo |

Gravação: `UPDATE frotas_checklists SET … WHERE id = ? AND status_geral = 'PENDENCIA' AND pendencia_tratada_em IS NULL AND (? IS NULL OR
EXISTS (SELECT 1 FROM frotas_manutencoes mt WHERE mt.id = ? AND mt.veiculo_id = frotas_checklists.veiculo_id))`. `changes = 0` → relê e
devolve a recusa do estado atual (5, 7, 8 ou 9, nessa ordem). `200` → o registro (formato de `registroComItens`: `itens`/`avarias`
parseados, colunas da RN-F6.01). Limpa o cache do painel (RN-F6.09).

### `DELETE /api/frotas/checklists/:id/tratar-pendencia`

403 (perfil) → 404 `Registro não encontrado` → 409 `{ error: 'Esta pendência não foi tratada', code: 'PENDENCIA_NAO_TRATADA' }` → `200` o
registro (colunas da RN-F6.01 nulas). Gravação com `WHERE pendencia_tratada_em IS NOT NULL` (dois desfazer juntos: um 200, um 409).
Limpa o cache do painel.

### Leituras — aditivo

- `GET /checklists`: cada linha `+ pendencia_tratada_em, pendencia_tratada_por_id, pendencia_tratada_por_nome, pendencia_tratamento,
  pendencia_manutencao_id, pendencia_manutencao_descricao`.
- `GET /portal/meus-registros`: `registros[]` `+` as cinco colunas da RN-F6.01 (sem a descrição da manutenção — B63).
- `GET /alertas`, `GET /dashboard`: o item `tipo: 'checklist'` só para não tratado, sem janela (RN-F6.04). Formato igual.
- `GET /exportar.xlsx`: aba Checklist `+ 'Pendência tratada em', 'Tratada por', 'O que foi feito'` no fim.

### Textos de tela (literais)

- Botão na linha e no alerta: `Tratar pendência`. Janela: título `Tratar pendência — <placa>`; campo `O que foi feito *` (textarea,
  `maxLength` 1000); campo `Manutenção (opcional)` (select; primeira opção `— nenhuma —`; cada opção `DD/MM/AAAA · <descrição>`);
  botões `Cancelar` e `Marcar como tratada` (`Salvando...` durante o envio).
- Sucesso: toast `Pendência tratada`. Erro: toast com a mensagem do servidor, ou `Não foi possível tratar a pendência.`
- Etiqueta: `PENDÊNCIA · tratada` (classe `situacao-tratada`).
- Linha do gestor: `Tratada em <DD/MM/AAAA às HH:MM> por <nome>: <texto>` e, com manutenção, ` (manutenção: <descrição>)`.
- Desfazer: botão `Desfazer tratamento`; confirmação `Desfazer o tratamento desta pendência? O alerta volta para o painel.`; toast
  `Tratamento desfeito`; erro: mensagem do servidor ou `Não foi possível desfazer o tratamento.`
- Portal: `Tratada em <DD/MM/AAAA às HH:MM>: <texto>`.

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Servidor: colunas (`schema.js`), `services/frotas/pendenciaService.js` (`tratar`, `desfazer`), rotas literais com limpeza do cache, `getAlertas` (RN-F6.04), `listChecklists` com a descrição da manutenção, planilha (3 colunas). Teste `frotasPendencia.api.test.js` (todas as recusas, concorrência, cache, escopo de leitura, planilha). Reescrever o RN-F1.10 de `frotasPortal.api.test.js` (8 dias atrás **continua**). **Rodar `npm run test:api` inteiro ao terminar** | tronco | — |
| T2 | Tela: `frotasApi.tratarPendencia`/`desfazerTratamento`; componente `TratarPendencia.js` (janela + `AcoesDaPendencia` + `RotuloTratada`); gancho `config.AcoesDaLinha` no `FrotasEntityPage`; coluna Situação da lista Checklist; botão no alerta do painel; Meus registros. Teste `FrotasPendencia.test.js` (fronteira HTTP mockada pelo contrato) | galho | contrato |
| T3 | Integração `frotasPendenciaIntegracao.api.test.js`: (a) **pela rota** — motorista registra saída com falha pelo portal e manda foto → alerta no `GET /alertas` e no `/dashboard` → gestor trata pela rota (com manutenção) → alerta some do `/alertas` e do `/dashboard` (sem esperar cache) → lista do gestor e do Consulta e o `meus-registros` mostram tratada; Bruno não vê o registro → planilha com as 3 colunas → desfazer → alerta volta; (b) **pelo serviço** — `pendenciaService.tratar`/`desfazer` + `getAlertas` direto no mesmo cenário | integração | T1 |

Cada task: TDD com controle positivo (sabotar e ver cair **a asserção certa**).

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | pendente | |
| T1 | pendente | |
| T2 | pendente | |
| T3 | pendente | |

## Ajustes da Fase 2 (revisor fresco: 3 travas + 9 menores — **valem sobre o texto acima**)

| Achado | Ajuste |
|---|---|
| T-1 (trava) o cache do painel no servidor volta com o alerta tratado: a contagem que já estava em andamento quando o gestor tratou grava o resultado velho no cache **depois** da limpeza (só se zerava a referência). Idem na tela (`invalidateFrotasDashboardCache` não zera o em andamento) | **geração** do cache nos dois lados: limpar incrementa a geração; a contagem só grava no cache se a geração ainda for a dela, e só zera o "em andamento" se ainda for ela. Teste de corrida na T1 com gancho (o gancho só segura; o tratar sai do contexto do teste) |
| T-2 (trava) o tipo do `manutencao_id` não estava dito — o `<select>` devolve texto | **inteiro > 0 ou texto só de dígitos** (`'5'` vale). O `:id` idem (`'01'` = 1; `'1e3'`, `'1.5'`, `'abc'` → 404) |
| T-3 (trava) o 200 não traz `placa`, `motorista_nome`, `anexos`, descrição da manutenção | a tela **recarrega a lista** (e o painel com `force`) depois de tratar/desfazer — não troca a linha pelo corpo. O alerta `tipo: 'checklist'` ganha `placa` (aditivo) para o título da janela |
| 4 corrida sem saída (gravou 0 e a releitura não acha recusa — outro gestor desfez no meio) | 409 `PENDENCIA_JA_TRATADA` (ela estava tratada no instante da gravação); sem nova tentativa |
| 5 manutenção excluída ou trocada de veículo depois | descrição `null` → a tela **não** mostra o trecho ` (manutenção: …)`. "Mesmo veículo" vale no instante de tratar — **B64** |
| 6 o motorista lê `GET /checklists` (com escopo) e receberia a descrição da manutenção | com escopo (motorista), `pendencia_manutencao_descricao` = `null` — o mesmo do `meus-registros` (**B63**) |
| 7 `frotasExportacao.api.test.js:150` trava o cabeçalho da aba Checklist | atualizado na T1 junto com o RN-F1.10 |
| 8 painel corta em 15 alertas; pendência de veículo excluído ficaria para sempre | alerta só de veículo **ativo** (`v.ativo = 1`, como o de consumo) — **B65**; manual diz que o painel mostra os 15 mais graves e que a lista Checklist é o caminho completo |
| 9 linha anterior à Etapa 1 (`status_geral` nulo, `aprovado = 0`) aparece PENDÊNCIA na tela, sem botão, 409 no servidor | declarado — **B66** (o banco não tem nenhuma) |
| 10 classe CSS | `frotas-badge-situacao-tratada` (gestor) e `situacao-tratada` (portal) |
| 11 dia e hora do mesmo `agora` | já assim (`instanteLocal(agora)`), com teste do relógio de Brasília |
| 12 "7 dias" escrito em specs e docs | corrigir no fechamento **dizendo que mudou** (13-portal RN-F1.10, mapa linha 09, manual, guia, referência, novidades) |
