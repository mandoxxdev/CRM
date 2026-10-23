# Frota — Etapa 4: relatórios fechados (A7, a máquina no relatório, aba de multas)

> **Status:** **etapa fechada em 2026-10-23** — T1..T3 feitas, Fase 5 corrigida (`ff3573a9`, `bcb498a0`). Próxima: **Etapa 5 — foto da avaria e do cupom** ("Próxima tarefa detalhada", no fim).
> **Origem:** "Próxima tarefa detalhada" do [plano da Etapa 3](2026-10-23-frotas-etapa3-km-e-horimetro.md) (B44).
> **Spec:** [`specs/modulo-frotas/10-relatorios/README.md`](../../../specs/modulo-frotas/10-relatorios/README.md) (criada no fechamento) e
> o mapa [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) (feature 10, A7, D3, D9, D11).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B
> (B45+).

## Objetivo

A tela **Frota → Relatórios** é o que o escritório vai olhar no fim do mês. Hoje ela tem três buracos:

1. **A7** — o custo por veículo filtra o período em manutenção e combustível, **não em multas**: um mês de outubro soma as multas de
   todos os anos.
2. **A máquina some** — desde a Etapa 3 a empilhadeira abastece em horas, fora do km/L; o relatório de consumo não a mostra (D9) e o
   custo por veículo mostra o km dela (normalmente 0, D11).
3. **A planilha não tem multas** (D3).

E um quarto, medido nesta Fase 0: **o período com uma data só** — a planilha filtra com só o início (ou só o fim); o relatório na tela
ignora o período inteiro se faltar uma das duas datas. A mesma tela mostrava uma coisa e baixava outra.

## Fase 0 — medido antes de prometer

- `frotasService.relatorioCustosPorVeiculo` (linha ~1301): subconsultas `man` (`date(data_manutencao) BETWEEN`), `abs`
  (`date(data_abastecimento) BETWEEN`), `mul` **sem filtro e com contestadas**; período só se **as duas** datas vierem; devolve
  `km_atual` sem `tipo_medicao`/`horimetro_atual`. Só veículos `ativo = 1`.
- `frotasService.relatorioConsumo`: `WHERE a.consumo_medio IS NOT NULL` — média, total de litros, total gasto e **contagem só das
  linhas com km/L** (o primeiro abastecimento de cada carro some dos totais); **sem período**; ordem `consumo_medio DESC`.
- O painel (`getDashboard`) soma multas **sem as contestadas** (`status_pagamento != 'contestado'`); o relatório soma com.
- `exportacaoService.filtroPeriodo`: cada data opcional, `substr(col,1,10) >= / <=`. 6 abas, sem multas. A aba Abastecimentos termina em
  `Horímetro` (Etapa 3).
- `frotas_multas`: `data_infracao` **opcional** no formulário (o `PUT` grava `''` se a tela mandar vazio), `status_pagamento` ∈
  `pendente`|`pago`|`contestado`, `created_at` UTC.
- Abastecimento da máquina: `horimetro_abastecimento` preenchido, `km_abastecimento` nulo (RN-F3.04); o gestor pode preencher os dois
  (B39) — o km/L olha só o km (RN-F1.11), sem olhar a medição do veículo.
- Tela `FrotasRelatorios.js`: manda o período só com as duas datas, só para o custo; o consumo nunca recebe período; erro de carga vira
  "Sem dados" calado. Nenhum teste lê o conteúdo dos relatórios (só a permissão: `frotasPerfis`, `frotasPerfisIdaEVolta`).
- Lista do gestor (Abastecimentos): coluna **Km/L** mostra `consumo_medio` ou `-`.

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F4.01 | Custo por veículo: as multas entram pelo período pela **data da infração**; multa **sem** data da infração entra pelo **dia em que foi lançada** (dia de Brasília). Sem período, todas, como hoje | multa de 2025-03 e outra de 2026-10; período outubro/2026 → só a de outubro |
| RN-F4.02 | Custo por veículo e painel com a mesma régua: multa **contestada não soma** no custo | multa contestada de R$ 500 → coluna Multas não muda |
| RN-F4.03 | O período vale com **uma data só** (só início = daí em diante; só fim = até ele), nos dois relatórios e na planilha — a régua da planilha (`substr(data,1,10)`) | só início 2026-10-01 → nada de setembro |
| RN-F4.04 | Custo por veículo devolve `tipo_medicao` e `horimetro_atual`; a tela mostra a coluna **KM / Horímetro** com `"125 h"` na máquina e o km no carro | |
| RN-F4.05 | **Litros por hora** de um abastecimento com horímetro: `horas_desde_anterior` = horímetro dele − horímetro do abastecimento **anterior em horas** do mesmo veículo (ordem `horimetro ASC, id ASC`, só linhas com horímetro — a régua da RN-F1.11 com horas no lugar do km); `consumo_litros_hora` = litros **deste** ÷ horas, 2 casas; sem anterior → os dois nulos; horas ≤ 0 → L/h nulo (horas ficam). **Calculado na leitura**, nada gravado: criar, editar ou excluir refaz o vizinho por construção | 120 h (40 L) e 130 h (50 L) → o segundo: 10 h, 5 L/h. Lançando depois 125 h (20 L): ele 5 h, 4 L/h; o de 130 h passa a 5 h, 10 L/h |
| RN-F4.06 | A régua da RN-F4.05 olha **só o horímetro da linha**, como o km/L olha só o km (B39): linha com km e horímetro tem km/L **e** L/h | |
| RN-F4.07 | Relatório de consumo: uma linha por veículo com **algum** abastecimento no período (e no `veiculo_id`, se vier): `consumo_medio` = média do km/L das linhas que têm km/L (como antes), `consumo_litros_hora` = média do L/h das linhas que têm L/h, `total_litros`/`total_gasto`/`abastecimentos` de **todas** as linhas do período; `tipo_medicao` do veículo; ordem por placa | carro com 3 abastecimentos (2 com km/L) → abastecimentos 3 |
| RN-F4.08 | O L/h e as horas de uma linha não dependem do filtro: o anterior pode estar fora do período ou ser de outro motorista | período que corta o anterior → L/h igual ao sem período |
| RN-F4.09 | Lista de Abastecimentos (`GET /abastecimentos`): cada linha ganha `horas_desde_anterior` e `consumo_litros_hora`; a coluna **Km/L** da tela mostra `"5 L/h"` na linha de horas | |
| RN-F4.10 | Planilha: aba **Multas** no **fim** da lista de abas (7ª), filtrada pelo período da RN-F4.01/03, com todas as situações (contestada também, com o Status) | |
| RN-F4.11 | Planilha: aba Abastecimentos ganha no fim `Horas desde Abastec. Anterior` e `Consumo L/h` | |
| RN-F4.12 | Tela Relatórios: manda o período com o que estiver preenchido, para o custo **e** para o consumo; mostra embaixo do título o período aplicado; linha **Total** no custo; consumo com colunas **Km/L** e **L/h**; erro de carga vira aviso (não "Sem dados" calado) | |
| RN-F4.13 | Perfis: nada muda — `relatorios` (ADMIN_FROTA e CONSULTA); MOTORISTA 403; `GET /abastecimentos` segue o escopo do motorista (as linhas dele, com o L/h calculado sobre todas as do veículo) | |

## Contratos de API (congelados)

Todas sob `/api/frotas`, perfil `relatorios` nos três primeiros. Nenhum código de erro novo (período inválido não é recusado: a data do
`<input type="date">` é sempre `AAAA-MM-DD`; texto torto só compara como texto — declarado em E).

### `GET /relatorios/custos-por-veiculo?data_inicio=&data_fim=` (cada um opcional)

`200` — lista ordenada por placa, só `ativo = 1`:
```
{ id, placa, modelo, marca, setor_responsavel, custo_manutencao, custo_combustivel, custo_multas, custo_total,
  km_atual, tipo_medicao, horimetro_atual }          // + tipo_medicao, + horimetro_atual (aditivo)
```
Manutenção por `data_manutencao`, combustível por `data_abastecimento`, multas pela RN-F4.01/02.

### `GET /relatorios/consumo?data_inicio=&data_fim=&veiculo_id=` (todos opcionais)

`200` — lista ordenada por placa (antes: por `consumo_medio DESC`):
```
{ veiculo_id, placa, tipo_medicao, consumo_medio, consumo_litros_hora, total_litros, total_gasto, abastecimentos }
```
`consumo_medio`/`consumo_litros_hora`: número ou `null`. **Mudança de significado:** `total_litros`, `total_gasto` e `abastecimentos`
passam a contar todas as linhas do período (antes, só as com km/L) — B47.

### `GET /abastecimentos` — aditivo

Cada linha: `+ horas_desde_anterior`, `+ consumo_litros_hora` (número ou `null`).

### `GET /exportar.xlsx` — aditivo

- Abas: `['Cadastro Frota', 'Viagens e KM', 'Checklist', 'Abastecimentos', 'Manutenções', 'Documentos', 'Multas']`.
- Aba **Multas**: `['Data', 'Veículo', 'Condutor', 'Infração', 'Valor R$', 'Pontos', 'Vencimento', 'Status', 'Pagamento', 'Nº do Auto',
  'Observações']` — Data = data da infração (vazia se não houver), Status = `Pendente`|`Pago`|`Contestado`, Pagamento = data do
  pagamento; ordem: data (a da régua RN-F4.01), id.
- Aba Abastecimentos: `+ 'Horas desde Abastec. Anterior'`, `+ 'Consumo L/h'` depois de `Horímetro`.

### Textos de tela (literais)

- Período aplicado (embaixo do título da página, na barra do período): `Período: 01/10/2026 a 31/10/2026` · `Período: a partir de
  01/10/2026` · `Período: até 31/10/2026` · `Período: tudo`.
- Nota do custo: `Multas pela data da infração (sem ela, pelo dia do lançamento); contestadas não entram.`
- Cabeçalho da última coluna do custo: `KM / Horímetro`; valor da máquina: `125 h` (pt-BR); do carro: `1.800 km`.
- Linha de total do custo: primeira célula `Total`.
- Título da seção de consumo: `Consumo médio`; colunas `Placa`, `Km/L`, `L/h (máquina)`, `Total litros`, `Total gasto`,
  `Abastecimentos`; valores `10,50 km/L`, `5,00 L/h`, `-` sem valor.
- Vazio do consumo: `Sem abastecimentos no período`.
- Erro de carga: toast com a mensagem do servidor, ou `Não foi possível carregar os relatórios`.
- Lista de Abastecimentos, coluna Km/L: `5 L/h` (pt-BR) na linha com L/h; senão o km/L como hoje.

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Servidor: `litrosPorHora` (RN-F4.05/06/08), `listAbastecimentos` (RN-F4.09), `relatorioConsumo` (RN-F4.07), `relatorioCustosPorVeiculo` (RN-F4.01..04), planilha (RN-F4.10/11). Teste `frotasRelatorios.api.test.js` | tronco | — |
| T2 | Tela: `FrotasRelatorios.js` (RN-F4.12) + coluna Km/L da lista (RN-F4.09) + `FrotasRelatorios.test.js` (fronteira HTTP mockada pelo contrato) | galho | contrato |
| T3 | Integração `frotasRelatoriosIntegracao.api.test.js`: (a) **pela rota** — máquina pelo portal (saída/abastecimentos em horas) e carro pelo gestor → relatório de consumo com L/h e km/L, custo com período cortando multas, planilha lida de volta (Multas, Abastecimentos L/h) batendo com o relatório; editar/excluir o do meio refaz o vizinho; (b) **pelo serviço** — `relatorioConsumo`/`relatorioCustosPorVeiculo` chamados direto com o mesmo cenário | integração | T1 |

Cada task: TDD com controle positivo (sabotar e ver cair **a asserção certa**).

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | feito — 2 travas + 10 menores (tabela abaixo) | 99658314 |
| T1 | feito — serviço, planilha, `frotasRelatorios` 12/12; `frotasExportacao` ajustado (7 abas, colunas no fim); 12 sabotagens, cada uma derrubou a asserção que a nomeia | e841b13a |
| T2 | feito (subagente, em paralelo com T1 contra o contrato) — `FrotasRelatorios` 13/13; 8 sabotagens | 0365e198 |
| T3 | feito — integração pela rota e pelo serviço, reconciliação tela × planilha; 4 sabotagens | 8cbed9d4 |

## Ajustes da Fase 2 (revisor fresco: 2 travas + 10 menores — **valem sobre o texto acima**)

| Achado | Ajuste |
|---|---|
| T-1 (trava) tela × planilha sem régua de reconciliação: veículo excluído (`ativo = 0`) entra na planilha e no consumo, não no custo; contestada entra na aba Multas, não no custo | **RN-F4.14**: os dois relatórios da tela contam **só veículos ativos** (o consumo passa a filtrar `ativo = 1`, B49). A planilha continua com o histórico de todos (as abas de lançamento nunca filtraram). Reconciliação travada no T3, no mesmo período: Σ Combustível do custo = Σ `total_gasto` do consumo = Σ `Valor Total R$` da aba Abastecimentos das placas da aba Cadastro Frota; Σ Multas do custo = Σ `Valor R$` da aba Multas das placas do Cadastro com Status ≠ Contestado; Σ Manutenção = Σ `Custo R$` da aba Manutenções das placas do Cadastro |
| T-2 (trava) a Fase 0 dizia que nenhum teste lê o conteúdo; `frotasExportacao` trava as **6** abas e o cabeçalho de Abastecimentos terminando em `Horímetro` | T1 atualiza os dois (motivo: RN-F4.10/11, colunas e aba **no fim**); `frotasKmHorimetroIntegracao` lê pelo nome e não muda. **A Fase 0 estava errada** neste ponto |
| 3 régua do dia da multa | fixada: `COALESCE(NULLIF(substr(data_infracao,1,10),''), date(created_at, modificadorDoFuso()))` (`diaDaMultaSql`), a mesma no custo, no período e na ordem da aba Multas |
| 4 escopo do motorista / busca / período cortando o anterior | o L/h é calculado sobre **todas** as linhas do veículo numa consulta à parte (`litrosPorHora`), uma função só para lista, relatório e planilha. Teste com motorista, busca por posto e período |
| 5 linha com km e horímetro na lista | coluna Km/L mostra os dois: `10,50 km/L · 5,00 L/h`; só um → só ele; nenhum → `-`. Descartado (B48): "a régua da medição do veículo" sugerida no plano da Etapa 3 |
| 6 formatação | um formatador (2 casas, pt-BR) na lista e no relatório: `10,50 km/L`, `5,00 L/h` |
| 7 casos da tela | máquina com `horimetro_atual` nulo → `-` na coluna KM / Horímetro (carro com km nulo → `-`); linha **Total** soma Manutenção, Combustível, Multas e Total, e deixa Placa/Modelo/Setor/KM vazias; os dois `GET` independentes (`Promise.allSettled`): o que falhar mostra toast (`mensagemDoServidor`, padrão `Não foi possível carregar os relatórios`) e a tabela dele vazia; o outro fica |
| 8 L/h com litros ≤ 0 | nulo (como o km/L) — RN-F4.05 |
| 9 alerta de consumo baixo da máquina | continua só em km/L (`consumoAnomalo`); sem "consumo esperado em L/h" no cadastro — **D12** |
| 10 Meus registros do portal | não recebe o L/h (consulta própria; a tela do motorista não mostra consumo) — **D13** |
| 11 "a régua do painel" | a igualdade com o painel é **só** "contestada não soma"; o painel soma todo o tempo e documentos |
| 12 coluna Pagamento da aba Multas | **retirada**: o formulário de multas não tem data de pagamento (sairia sempre vazia). Cabeçalho final: `['Data', 'Veículo', 'Condutor', 'Infração', 'Valor R$', 'Pontos', 'Vencimento', 'Status', 'Nº do Auto', 'Observações']` |

## Fase 5 — revisão adversarial (dois revisores frescos em paralelo; achados só reproduzidos)

Revisor 1 — regras e somas, por sonda executada: **5 sementes** (20261023, 7, 4242, 99, 31337), **2.000 operações** pela rota do gestor e
pelo portal (abastecimentos com km, horímetro, os dois, nenhum, troca de veículo, litros `'0'`, `0.1+0.2`, empates, `T23:59`; multas com e
sem data, `''` pelo PUT, `created_at` em `02:59:59`/`03:00:00` UTC, três status; manutenções; exclusão de veículo), conferindo do zero,
contra as linhas cruas, a lista do gestor e a do motorista (11.670 linhas), o km/L gravado (RN-F1.11), o consumo, o custo e — a cada 5
operações — a planilha inteira e as somas da RN-F4.14: **0 divergências**. A sonda sabia falhar (5 sabotagens em memória: 224, 41, 150,
16 e 100 divergências). 32 sabotagens contra os testes: 28 caíram na asserção certa. Revisor 2 — front × back: sonda jest com corrida,
os dois GET falhando, data limpa, datas invertidas, nulos e números grandes; literais conferidos letra a letra; nenhum outro consumidor
das rotas em `client/src`.

| Achado | O que era | Correção | Estado | Commit |
|---|---|---|---|---|
| Fase5-R1 (real, revisor 1) | `status_pagamento` aceitava qualquer texto: `"Contestado"`/`"contestado "` somavam no custo e a planilha os tirava (tela 3010 × planilha 2010) | só `pendente`/`pago`/`contestado`, 400 `Status de pagamento inválido`; vazio no PUT mantém (B53, consulta A6) | corrigido | bcb498a0 |
| Fase5-R2 (real, revisor 1) | PUT do gestor gravava litros `-10` e `0` (POST, negativos); o consumo somava | número > 0, 400 `Informe os litros` (consulta A7) | corrigido | bcb498a0 |
| Fase5-R3 (teste fraco, revisor 1) | S04: tirar `litros > 0` do L/h passava | cenário com litros 0 gravado direto | corrigido | bcb498a0 |
| Fase5-F (testes fracos, revisor 2) | 5 sabotagens da tela passavam (guarda da carga velha, Total litros/gasto, célula de custo, aviso único, Abastecimentos fixo) | 5 cenários + limpar a data; cada sabotagem derrubou o cenário que a nomeia | corrigido | ff3573a9 |
| Ruído / declarado | S11 (`slice(0,10)` do período) e S14 (`substr` da data da infração) só pesam com data com hora, que a tela não manda; S17 (padrão `km` do tipo de medição): a coluna já tem padrão; `litros:'abc'` no PUT dava 500 (antigo) — agora 400 pelo R2; datas invertidas → vazio (E15); vazio do consumo diz "no período" mesmo em "tudo" (literal do plano) | — | — | — |

## Estado final das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | feito | 99658314 |
| T1 | feito | e841b13a |
| T2 | feito | 0365e198 |
| T3 | feito | 8cbed9d4 |
| Fase5-F | feito | ff3573a9 |
| Fase5-R | feito | bcb498a0 |
| Fechamento (docs) | feito | commit "Frota etapa 4: fechamento nas specs, no plano e nos documentos do modulo" |

## Fechamento (2026-10-23)

### Divergências do plano

| Onde | O plano dizia | O que foi feito | Por quê |
|---|---|---|---|
| Fase 0 | nenhum teste lê o conteúdo da planilha | `frotasExportacao` travava 6 abas e o cabeçalho; ajustado | Fase 2, T-2 |
| RN-F4.07 | consumo com todos os veículos | só ativos (RN-F4.14) | Fase 2, T-1 |
| Aba Multas | coluna Pagamento | retirada | o formulário não tem a data de pagamento (Fase 2, 12) |
| Lista | `5 L/h` | `5,00 L/h`, e os dois consumos na linha com km e horímetro | Fase 2, 5 e 6 |
| Escopo | só relatórios e planilha | + validação do status da multa e dos litros do gestor | Fase5-R1/R2: sem elas a reconciliação RN-F4.14 quebrava por API |

### Verificação final (medida)

`npm run test:api` **553/553 arquivos OK**; `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**; tela **197 suítes, 2654/2654 testes**; `build` com `CI=true` **"Compiled successfully."**. Frota no servidor: 15 arquivos `frotas*`, **152 passaram, 0 falharam** (+ `vencimentosFrotasFinanceiroNoDiaLocal` 17/17); Frota na tela: 11 arquivos, **113/113**. A suíte `test:api` rodou sozinha, depois que os revisores terminaram.

### Retro (4 números)

| Medida | Valor |
|---|---|
| Rodadas de correção | **1** fix-round da Fase 5 (`ff3573a9` tela + `bcb498a0` regras); nenhum teste falhou em 3 rodadas |
| Achados da revisão | Fase 2 (plano): **2 travas + 10 menores**; Fase 5 (código): **4 reais** (R1, R2, R3 teste fraco, F lote de 5 testes fracos) + **5 ruído/declarados** |
| Paralelismo | T2 (tela) num subagente em paralelo com T1 (servidor), contra o contrato congelado — **sem retrabalho**; T3 sequencial |
| Defeito que escapou | Da Etapa 3: nenhum descoberto nesta etapa (a sonda refeita do km/L, RN-F1.11, deu 0 divergências). Da Etapa 4: (preencher na seguinte) |

## Próxima tarefa detalhada — Etapa 5: foto da avaria e do cupom (D1)

**Por que esta (B54):** com os relatórios fechados, o que mais falta para o uso diário é a **prova**: o motorista marca uma avaria
("lateral esquerda: amassado") sem poder mostrar, e o abastecimento entra sem o cupom — o escritório continua pedindo a foto por fora.
Não depende de ninguém. Descartados: **cadastro inicial dos 4 veículos** (a planilha da empresa só tem "V01, V02, V03, C01" e o tipo —
sem placa, modelo, ano ou km; depende do André); **seção 3 do formulário** (folha cortada); **alerta de consumo da máquina** (D12,
ninguém informou o consumo esperado em L/h).

**Medido (Fase 0 adiantada):**
- Não há upload no Frota: `routes/frotas.js` é registrado em `server/index.js` (linha ~22552) com `(app, db, authenticateToken,
  checkModulePermission)` — **sem** o objeto `uploads` que `routes/compras.js` recebe por injeção (multer em `index.js` ~781/807/826).
- Arquivos do sistema ficam em `server/data/uploads/` (gitignored; `CRM_DATA_DIR` em produção). Desde as Etapas 81/82 os estáticos de
  `/api/uploads` têm `nosniff` + CSP sandbox, e pastas sensíveis só servem com URL assinada: `services/uploadsAssinadosCrm.js`
  (`PASTAS`, `criarAssinadoresCrm`, assinador `services/almoxarifado/urlUpload.js`, domínio próprio por pasta).
- Registro do portal: `frotas_checklists` (avarias em JSON, `validarAvarias`); abastecimento: `frotas_abastecimentos`. "Meus registros"
  (`portalService.meusRegistros`) e as listas do gestor (Checklist, Abastecimentos) são onde a foto aparece.

**Contrato proposto (congelar na Fase 1):**
- RN-F5.01 — Tabela `frotas_anexos (id, entidade 'registro'|'abastecimento', entidade_id, arquivo, tipo_mime, tamanho, usuario_id,
  created_at)`; até **3 fotos** por registro/abastecimento; **jpeg/png/webp**, até **5 MB** cada (decidir na Fase 1; letra B).
- RN-F5.02 — `POST /api/frotas/portal/anexos` (multipart, campo `foto`, `entidade`, `entidade_id`), perfil `registrar_operacoes`, só o
  **dono** do registro/abastecimento (motorista do vínculo) ou o gestor; 400 tipo/tamanho com mensagem literal; 404; 403
  `Você só pode alterar os seus próprios registros` (`MSG_SO_OS_SEUS`).
- RN-F5.03 — Leitura: as listas e `meus-registros` trazem `anexos: [{ id, url }]` com **URL assinada** (pasta nova em `PASTAS`, domínio
  `frotas-anexos-v1`); o motorista vê só as dele, gestor e Consulta veem todas (o escopo da RN-F1.14).
- RN-F5.04 — Tela do motorista: botão **Tirar foto** (`<input type="file" accept="image/*" capture="environment">`) na avaria e no
  abastecimento; envio **depois** do 201 do registro (o registro não espera a foto); falha da foto não desfaz o registro (aviso). Lista
  do gestor: ícone com as miniaturas.
- Fatia visível: a foto da avaria na lista Checklist do gestor e no "Meus registros".

**Pontos de atenção:**
1. Injeção do multer no `registerFrotasRoutes` sem quebrar o harness `frotasTestApp` (que chama `registrar(app, db, authStub, portao)`);
   no harness, pasta de upload temporária e `supertest .attach`.
2. Excluir registro/abastecimento (gestor) → apagar anexos e arquivos (sem órfão).
3. Celular: foto de 4–12 MB — reduzir no navegador (canvas) antes de enviar, ou aceitar um teto maior; decidir medindo.
4. Não servir por `express.static` público (Etapa 82): só URL assinada.
5. Sabotagem do escopo: motorista B anexando no registro do motorista A → 403 (controle positivo concedendo).
6. Não mexer no que a Etapa 4 provou: relatórios e planilha não leem anexo.
