# Frota — Etapa 4: relatórios fechados (A7, a máquina no relatório, aba de multas)

> **Status:** em execução (2026-10-23).
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
| Plano + Fase 2 | — | — |
| T1 | — | — |
| T2 | — | — |
| T3 | — | — |

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
