# Etapa 164 (Frotas e Financeiro): os vencimentos, os alertas, os painéis e as datas da tela no dia de Brasília (C409) — plano

> Origem: "Próxima tarefa detalhada — Etapa 164" do plano da 163
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa163-a-atividade-editada-e-as-validades-no-dia-de-brasilia.md`). Etapa de consertos
> técnicos fora do Almoxarifado; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1045**, último C **C409**,
> última A **A103**. Esta etapa: **B1046+**, **C410+**, **A104+**. Worktree `CRM-wt-e164`, branch `etapa-e164` (da main `adc2d24a`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 3 Important, 10 Minor — todos aceitos; o plano abaixo já está
> corrigido.** Reproduzidos por sonda: o `daysUntil(hoje)` = −1 em `TZ=America/Sao_Paulo`; o `mes` ausente = `NaN` → `mes: null`. **I1** o
> HOJE calculado do mês de **Brasília** real coincide de mês com o `date('now')` (UTC) das 21h à meia-noite do último dia de cada mês — a
> sabotagem do mês passaria vazia 3 h por mês: o HOJE sai do mês **UTC** real e a guarda confere que o mês do `date('now')` difere do de
> HOJE e do de HOJE+1 (o teste da 163 tem o mesmo buraco — registrado). **I2** as réguas que agregam (`COUNT(DISTINCT veiculo)`, a média com
> `HAVING`, o `COUNT` dos checklists, as somas) só pegam a sabotagem com **um veículo por borda** e quantidades diferentes entre as bordas —
> escrito na T1/T2. **I3** o painel do Financeiro conta *vencidas* pela data, mas a lista e o filtro *Vencido* leem `status = 'vencido'`, que
> ninguém grava — declarado (C411), não mexido. **Minor:** a tabela da T2 corrigida e com a coluna do modificador; trimestre/ano pela rota (a
> sabotagem de fuso neles só o unitário pega); um documento com `alerta_dias_antes = 10`; o `hoje` passado a cada `diasAte`; a Fase 0 do
> `mes` ausente corrigida (só as métricas do mês zeram); o fuso do Jest é o do `client/jest.globalSetup.js` (a guarda fica) e a planilha
> assertada no `exportToExcel`; o `—` do `formatDateBR` para valor inválido; o botão *Atualizar* de Frotas passa a mandar `refresh=1` (o
> cache de 30 s do servidor seguia valendo); a guarda separada da RN-164.06; as revisões antigas que continuam alertando (C412, não é régua de
> data).

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor, sem leitores em paralelo). Base `test:api` rodada antes de qualquer código
(`scratchpad/e164/base-api.log`). O processo de produção roda com `TZ=America/Sao_Paulo` (`Dockerfile:47`); a máquina de
desenvolvimento também (`Intl…timeZone` = `America/Sao_Paulo`). O `date('now')` do SQLite e o `toISOString()` são o dia **UTC** em qualquer
`TZ` — das 21h à meia-noite de Brasília, o de amanhã.

**A forma das colunas (todas só de data).** Frotas (`services/frotas/schema.js`): `cnh_validade`, `data_manutencao`, `proxima_revisao_data`,
`data_abastecimento`, `data_infracao`, `data_vencimento` (multas e documentos), `data_emissao`, `data_checklist` — `TEXT`, gravadas pelo
`type="date"` dos formulários (`client/src/components/frotas/frotasEntityConfigs.js:104, 145, 151, 184, 227, 232, 266, 267, 347`). As únicas
de instante são `data_saida`/`data_retorno` das viagens (`datetime-local`, `:310-311`) e `data_aprovacao` — nenhuma régua as lê. Financeiro
(`index.js:19098-19136`): `contas_pagar`/`contas_receber` `data_vencimento`, `data_pagamento`/`data_recebimento` e `fluxo_caixa.data` —
`DATE`. Quem grava: `receiptService.gerarContaPagar` (o `data_entrada_nf` do recebimento, `type="date"`); a tela do Financeiro **não tem
formulário** (só lista, painel, exclusão e exportação).

**Frotas — servidor (`services/frotas/frotasService.js`), quem lê e o que muda das 21h à meia-noite (dia D):**

| Onde | Linha | Régua | Quem lê | Efeito das 21h à meia-noite |
|---|---|---|---|---|
| `listDocumentos` (`?vencendo=1`) | `:457` | `date(venc) <= date('now', '+N days')` (N = `alerta_dias_antes`, padrão 30) | só a API (a tela *Seguros e Documentos* não manda o filtro) | o teto é D+1+N: entra um dia a mais |
| `getAlertas` documentos | `:646` | a mesma | painel *Frotas* (`/frotas/dashboard` → lista *Alertas*, o cartão *Alertas*) e `GET /frotas/alertas` | idem |
| `getAlertas` CNH | `:664` | `<= date('now', '+30 days')` | idem | teto D+31 |
| `getAlertas` revisões | `:680` | `<= date('now', '+15 days')` | idem | teto D+16 |
| `getAlertas` multas | `:702` | `<= date('now', '+15 days')` | idem | teto D+16 |
| `getAlertas` consumo baixo | `:721` | `data_abastecimento >= date('now', '-60 days')` | idem | a janela começa em D−59 (um dia a menos) |
| `getDashboard` custo do mês | `:757` | `strftime('%Y-%m', data_abastecimento) = strftime('%Y-%m', 'now')` | cartão *Combustível (mês)* | no último dia do mês, o do mês seguinte (≈ R$ 0) |
| `getDashboard` checklists de hoje | `:760` | `date(data_checklist) = date('now')` | cartão *Checklists hoje* | conta os de D+1 (≈ 0) |
| `getDashboard` manutenção vencida | `:764` | `date(proxima_revisao_data) < date('now')` | cartão *Manutenção vencida* | a revisão de hoje já conta vencida |
| `daysUntil` (`dias_restantes` dos alertas e a severidade) | `:17-25` | `new Date('AAAA-MM-DD')` (meia-noite **UTC**) com `setHours(0)` **local** | a lista *Alertas* ("Vencido há N dia(s)" / "N dia(s) restantes") e a cor | **o dia inteiro, em produção**: com `TZ=America/Sao_Paulo`, `new Date('2026-10-20')` é 19/10 21h local → `setHours(0)` → 19/10: **um dia a menos sempre** — o documento que vence hoje sai *"Vencido há 1 dia(s)"* e **crítico**; o de D+8 sai 7 e **alto**. (Com `TZ=UTC`, só das 21h à meia-noite.) |
| `createManutencao` (data padrão) | `:250` | `data_manutencao \|\| toISOString().slice(0, 10)` | `POST /frotas/manutencoes` sem data (a tela sempre manda — o padrão do formulário) | grava D+1 |

**Frotas — navegador:** os padrões dos formulários *Nova Manutenção*, *Novo Abastecimento* e *Novo Checklist*
(`frotasEntityConfigs.js:139, 178, 340`) são `new Date().toISOString().slice(0, 10)` — das 21h à meia-noite o campo abre com **amanhã** e é
o que se grava se a pessoa não mexe (a mesma classe dos cinco formulários da Fábrica, C397/161). As colunas das listas mostram o texto cru
(sem `new Date`) — certas. O painel mostra o `dias_restantes` do servidor (`FrotasDashboard.js:163-165`).

**Financeiro — servidor (`index.js`):**

| Onde | Linha | Régua | Quem lê | Efeito |
|---|---|---|---|---|
| `GET /financeiro/dashboard` `hoje` | `:19953` | `new Date().toISOString().split('T')[0]` → `data_vencimento < ?` | cartões *Contas a receber* / *Contas a pagar* — *"N vencidas"* (`:19990`, `:20004`) | das 21h, a conta que vence hoje já conta vencida |
| idem, gráfico de receita | `:20027` | `status IN ('pendente','parcial') AND data_vencimento <= date('now')` soma como receita | gráfico *Receitas × Despesas* e *Saldo acumulado* | das 21h, a pendente de amanhã já soma |
| idem, `mes`/`ano` padrão | `:19944-19945` | `new Date().getFullYear()`/`getMonth()` (o `TZ` do processo); **e** `parseInt(req.query.mes) !== undefined` é sempre verdadeiro — sem `mes`, `mes = NaN` (o padrão nunca vale; as métricas do mês — receita, despesas, variações, categorias — voltam zeradas e `mes: null`; os totais, as vencidas, o gráfico anual e o saldo vêm preenchidos — corrigido pela Fase 2 M8) | só a API (a tela sempre manda `mes` e `ano`, `Financeiro.js:68`) | — (na tela, nenhum) |
| `contas-pagar`, `contas-receber`, `fluxo-caixa` `?periodo=mes\|trimestre\|ano` | `:19818-19831`, `:19860-19873`, `:19893-19906` | `new Date(ano, mês, 1).toISOString()` — o mês do `TZ` do processo | o filtro *Período* das três listas | em produção (TZ fixado), **nenhum**; com o processo em UTC (o `tzdata` ausente — o aviso do `Dockerfile:31`), no último dia do mês das 21h o período *Este mês* começa no mês seguinte e esconde o mês inteiro |

Nenhuma régua do Financeiro decide pagamento, baixa ou valor gravado — só contagem e soma de **painel** (leitura). Exclusão
(`DELETE /financeiro/:tipo/:id`) não lê data.

**Financeiro — navegador (`client/src/components/Financeiro.js:123-126`):** `formatDate` = `new Date('AAAA-MM-DD').toLocaleDateString('pt-BR')`
— meia-noite UTC exibida no fuso do navegador: **no Brasil, o dia anterior, o dia inteiro** (medido: `TZ=America/Sao_Paulo node -e
"new Date('2026-10-20').toLocaleDateString('pt-BR')"` → `19/10/2026`). Vale para o vencimento, o pagamento e o recebimento das duas listas,
a data do fluxo de caixa (`:268-269`, `:367-368`, `:464`) e as mesmas colunas da exportação Excel (`:163-175`). Existe `formatDateBR`
(`client/src/utils/formatDate.js`, `parseISO` do `date-fns` — lê só data como **local**) usado por outras telas.

**Portas de saldo, trava e permissão:** nenhuma. Frotas e Financeiro não tocam estoque; nenhum portão muda.

**Os testes que calculam *hoje* nesses fluxos:** **nenhum.** `server/tests/frotas.test.js` (fora de qualquer `npm run`; roda à mão) usa
datas fixas (`2025-01-01`, `2025-06-01`) e só confere `totalVeiculos`/`custoTotal` do painel; `permissoesNoServidor.api.test.js` usa
`/financeiro/contas-pagar` só como portão; `FrotasEntityPage.test.js` não lê data. Nenhum teste antigo muda.

**Fora de Frotas e do Financeiro, a mesma classe (medido de passagem, não mexido — vira C410):** no Comercial, a prioridade
*vencido/hoje/futuro* dos lembretes das propostas (`index.js:17388-17389`, `DATE(lembrete_data) < / = DATE('now')`) e as propostas
*a vencer* do painel (`:18061`, `:18068`, `julianday(p.validade) - julianday('now')`); no Operacional, o painel antigo (*Dashboard MES*,
`:21873-22189` — C403, dependente do P.O.).

## Decisões (letra B — reversíveis)

- **B1046 — os alertas, a lista *vencendo* e o painel de Frotas no dia de Brasília (C409).** As nove réguas da tabela (`:457`, `:646`,
  `:664`, `:680`, `:702`, `:721`, `:757`, `:760`, `:764`) passam a usar o `diaLocal.hojeLocalISO()` como **parâmetro** (`?`), sem
  modificador (colunas só de data); somar dias com `date(?, '+' || N || ' days')`; o mês do custo = `hoje.slice(0, 7)`. O `hoje` é lido
  **uma vez** por chamada: o `getDashboard` o lê e o passa ao `getAlertas` (que também aceita sem, para a rota `/frotas/alertas`).
  **Os números mudam (das 21h à meia-noite):** cada teto anda um dia para trás (documentos D+N, CNH D+30, revisões e multas D+15); a janela
  do consumo baixo ganha o dia D−60; o custo do mês, no último dia do mês, é o do mês (não R$ 0 do seguinte); os checklists de hoje contam os
  de hoje; a revisão de hoje deixa de contar como manutenção vencida. **Descartado:** só os alertas (o cartão *Manutenção vencida* e a lista
  discordariam do mesmo dia).
- **B1047 — os dias restantes dos alertas de Frotas contados no dia de Brasília, o dia inteiro.** `daysUntil` passa a contar
  `data − hoje de Brasília` em dias de calendário (`Date.UTC` das duas datas `AAAA-MM-DD`), independente do `TZ` do processo; texto que não
  começa por `AAAA-MM-DD` cai na conta antiga (mesmo resultado de antes para formato legado). **Os números mudam o dia inteiro, não só das
  21h:** em produção os dias restantes passam a ser **um a mais** que hoje — o documento (a CNH, a revisão) que vence hoje sai *"0 dia(s)
  restantes"* e **alto** (antes *"Vencido há 1 dia(s)"* e **crítico**); o de D+8 sai 8 e **médio** (antes 7 e alto); o vencido ontem sai
  *"Vencido há 1 dia(s)"* (antes 2). **Descartado:** só a janela das 21h (o defeito do `setHours` local sobre a meia-noite UTC é o dia
  inteiro e é o mais visível).
- **B1048 — a data padrão dos formulários de Frotas e da manutenção sem data no dia de Brasília.** Navegador: os três padrões
  (`frotasEntityConfigs.js:139, 178, 340`) passam ao `hojeLocalISO()` de `utils/dataLocal.js` (o dia local do navegador, a régua da 161).
  Servidor: o padrão do `createManutencao` passa ao `diaLocal.hojeLocalISO()`. **Muda:** das 21h à meia-noite o formulário abre com hoje
  (antes amanhã, e era o que se gravava sem mexer). **Descartado:** tirar o padrão (muda o formulário — produto).
- **B1049 — o painel e os filtros de período do Financeiro no calendário de Brasília (só a régua da data; nada de dinheiro).** O `hoje`
  do painel = `diaLocal.hojeLocalISO()`, **o mesmo** valor nas vencidas e no gráfico de receita (o `date('now')` vira `?`); o `mes`/`ano`
  padrão = o mês/ano de Brasília, e o `mes` ausente ou não numérico passa a valer o padrão (antes `NaN`: painel zerado com `mes: null` — o
  padrão era inalcançável); o início do *Período* (*Este mês*, *Trimestre*, *Este ano*) das três listas sai do calendário de Brasília
  (novo `diaLocal.inicioDoPeriodoLocalISO(periodo, agora)`), não do `TZ` do processo. **Os números mudam:** das 21h à meia-noite a conta que
  vence hoje deixa de contar *vencida* no cartão, e a pendente de amanhã deixa de somar na receita do gráfico; o painel chamado sem `mes`
  mostra o mês corrente. O período, em produção (TZ fixado), não muda — muda só se o processo cair em UTC. **Nenhum valor gravado, nenhuma
  baixa, nenhum pagamento muda.** **Descartado:** só o `hoje` (o gráfico e o cartão discordariam); validar `mes` fora de 1–12 com 400 (muda o
  contrato — `mes=13` continua o que era).
- **B1050 — as datas da tela do Financeiro exibidas no dia certo (o dia inteiro).** `formatDate` passa a ler a data sem hora como **local**
  (o `formatDateBR` de `utils/formatDate.js`), mantendo o `'-'` para vazio. **Muda o dia inteiro:** o vencimento, o pagamento, o recebimento e
  a data do fluxo aparecem no dia gravado (antes, no Brasil, a véspera) — na tela **e** na planilha exportada. **Descartado:** formatar no
  servidor (muda o contrato das listas).
- **B1051 — o nome do PDF de etiquetas no dia local (de passagem, r1 da 163).** `etiquetas-<dia>.pdf` com o `hojeLocalISO()` do navegador
  (antes o dia UTC: das 21h, o arquivo saía com a data de amanhã). Cosmético.
- **B1052 (Fase 5 r2) — o painel do Financeiro espera as nove consultas.** O contador começava em 8 para nove consultas: a resposta saía
  antes da última e um número (o lucro, na sonda) vinha nulo de vez em quando. `pending = 9`. Leitura só; nenhum valor gravado muda.
  **Muda:** o cartão de lucro e as variações não somem mais. **Descartado:** reescrever com `Promise.all` (mais diff, o mesmo efeito).
- **B1053 — a próxima etapa (165).**

## Regras de negócio

- **RN-164.01 (B1046)** — documento de Frotas *vencendo* = `status = 'ativo'` (no alerta), com vencimento, `data_vencimento ≤ hoje de
  Brasília + alerta_dias_antes` (padrão 30); na lista `?vencendo=1`, a mesma régua (sem o status, como antes), combinada com veículo, tipo e
  busca.
- **RN-164.02 (B1046)** — CNH no alerta = motorista ativo, `cnh_validade ≤ hoje + 30`; revisão = `proxima_revisao_data ≤ hoje + 15` (ou a
  régua de km, que não muda); multa = pendente, `data_vencimento ≤ hoje + 15`.
- **RN-164.03 (B1046)** — consumo baixo = a média dos abastecimentos com `data_abastecimento ≥ hoje − 60` abaixo de 70% do esperado.
- **RN-164.04 (B1046)** — painel: *Combustível (mês)* = soma dos abastecimentos do mês de Brasília; *Checklists hoje* = os de
  `data_checklist = hoje`; *Manutenção vencida* = veículos com `proxima_revisao_data < hoje` (ou a régua de km).
- **RN-164.05 (B1047)** — `dias_restantes` = `data − hoje de Brasília` em dias (hoje = 0; ontem = −1); severidade como antes (documento:
  `< 0` crítico, `≤ 7` alto, senão médio; CNH: `< 0` crítico, senão alto; revisão: `< 0` ou km ≤ 0 crítico, senão médio).
- **RN-164.06 (B1048)** — manutenção sem `data_manutencao` grava o hoje de Brasília; os três formulários abrem com o dia local.
- **RN-164.07 (B1049)** — painel do Financeiro: vencida = `pendente`/`parcial` com `data_vencimento < hoje de Brasília`; receita do gráfico
  = recebidas + pendentes/parciais com `data_vencimento ≤ hoje de Brasília`; `mes`/`ano` ausentes (ou `mes` não numérico) = os de Brasília.
- **RN-164.08 (B1049)** — *Período* das listas: *Este mês* = desde o dia 1 do mês de Brasília; *Trimestre* = desde o dia 1 do trimestre;
  *Este ano* = desde 1º de janeiro — combinado com busca e status.
- **RN-164.09 (B1050)** — a tela do Financeiro mostra a data sem hora no dia gravado (`AAAA-MM-DD` → `DD/MM/AAAA`), vazio = `-`.

## Contratos (congelados)

- **`GET /api/frotas/alertas`**, **`GET /api/frotas/dashboard`** (`?refresh=1` fura o cache de 30 s), **`GET /api/frotas/documentos`**
  (`vencendo`, `veiculo_id`, `tipo`, `search`), **`POST /api/frotas/manutencoes`** — mesmas formas, códigos e mensagens; as datas pelas
  RN-164.01 a .06.
- **`GET /api/financeiro/dashboard`** (`mes`, `ano` opcionais), **`GET /api/financeiro/contas-pagar|contas-receber|fluxo-caixa`**
  (`periodo`, `search`, `status`) — mesmas formas; RN-164.07/.08. Única mudança de forma: sem `mes`, a resposta traz `mes: <número>` (antes
  `null`), e o mesmo para `mes` não numérico (Fase 2 M8). Mensagens que já existem e não mudam: 400 *"Veículo e descrição são
  obrigatórios"* (manutenção), o 403 do perfil de Frotas e o do portão do Financeiro.
- **Servidor:** `diaLocal.inicioDoPeriodoLocalISO(periodo, agora = new Date())` (novo) → `'AAAA-MM-01'` (mes), `'AAAA-(01|04|07|10)-01'`
  (trimestre), `'AAAA-01-01'` (ano), `null` para outro valor. `frotasService.diasAte(data, hoje = hojeLocalISO())` exportado (para o
  teste); o `getAlertas` passa o seu `hoje` a **cada** `diasAte` (Fase 2 M7). Em SQL, **parâmetro** (`?`), nunca interpolado; sem `modificadorDoFuso`.
- **Navegador:** `dataLocal.hojeLocalISO()` nos três padrões e no nome do PDF; `formatDateBR` no Financeiro (vazio = `-` como antes;
  valor legado inválido passa de *Invalid Date* a `—`); `fetchFrotasDashboard({ force: true })` manda `?refresh=1` (Fase 2 M11).

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor) — Frotas.** — `0f879884` (Fase 5: `fa064023`). RN-164.01 a .06 em `frotasService.js`. Teste novo
  `server/tests/api/vencimentosFrotasFinanceiroNoDiaLocal.api.test.js` pelo `index.js` real em pasta vazia (as rotas de Frotas e do
  Financeiro **não estão** no `createTestApp`), filho com `TZ=UTC` e `relogioAdiantado` (`RELOGIO_ADIANTADO_MS`) nas **22h de Brasília do
  último dia do mês seguinte ao mês UTC real** (Fase 2 I1; se esse mês for dezembro, o seguinte — HOJE+1 tem de cair no mesmo ano, para o gráfico do Financeiro): HOJE
  (Brasília), HOJE+1 (dia UTC do JS, primeiro do outro mês) e o `date('now')` (o real, semanas antes) são três dias e dois meses diferentes;
  guarda **independente do código de produção** (Fase 2 M12) que derruba se o mês do `date('now')` do filho for o de HOJE ou o de HOJE+1, ou
  se o deslocamento não pegou (o `/frotas/manutencoes` sem data gravando HOJE é a asserção da RN-164.06, não a guarda). Massa por fora (`sqlite3` no arquivo do filho, depois do schema de Frotas pronto) com as **duas bordas** e
  números diferentes por régua — **um veículo por borda** e **quantidades diferentes entre as bordas** (Fase 2 I2: *Manutenção vencida* é
  `COUNT(DISTINCT veiculo)` com `proxima_revisao_km` nulo; o consumo baixo é média por veículo com `HAVING` — um veículo só com HOJE−61, outro
  só com HOJE−60, e o abastecimento de HOJE+1 do combustível com `consumo_medio` nulo; checklists 2 em HOJE e 1 em HOJE+1; somas diferentes
  no mês de HOJE, no de HOJE+1 e no real); um documento com `alerta_dias_antes = 10` (HOJE+10 dentro, HOJE+11 fora) e outro nulo (= 30)
  (Fase 2 M6); **um cenário de filtros combinados** (`?vencendo=1&veiculo_id&tipo&search` — o `?` do hoje fora de ordem só
  aparece assim). E, no próprio processo do teste (`TZ=America/Sao_Paulo` fixado antes do primeiro `Date`), o `diasAte` contra o
  `hojeLocalISO()` (prova o defeito do dia inteiro: a régua antiga dá −1 para hoje nesse fuso).
  **Qual borda pega qual sabotagem** (no filho: `date('now')` = o real, semanas antes de HOJE; `toISOString` = HOJE+1):

  | Régua | volta ao `date('now')` | volta ao `toISOString` | modificador na coluna (`date(col, '-180 minutes')`) |
  |---|---|---|---|
  | `<= hoje + N` (documentos, CNH, revisões, multas) | HOJE+N fora → pega HOJE+N | HOJE+N+1 dentro → pega HOJE+N+1 | HOJE+N+1 vira HOJE+N, dentro → pega HOJE+N+1 |
  | `>= hoje − 60` (consumo) | HOJE−61 dentro → pega HOJE−61 | HOJE−60 fora → pega HOJE−60 | HOJE−60 vira HOJE−61, fora → pega HOJE−60 |
  | `= hoje` (checklists) | 0 → pega HOJE | conta HOJE+1 → pega HOJE+1 | conta HOJE+1 (vira HOJE) e perde HOJE → pega |
  | `< hoje` (manutenção vencida) | HOJE−1 fora → pega HOJE−1 | HOJE dentro → pega HOJE | HOJE vira HOJE−1, dentro → pega HOJE |
  | mês (combustível) | o mês real → pega o de HOJE | o mês de HOJE+1 → pega o de HOJE+1 | — |
  | `dias_restantes` | — (JS) | ±1 → pega o número | — |
- [x] **T2 (tronco, servidor) — Financeiro.** — `0f879884` (Fase 5: `fa064023`). RN-164.07/.08 em `index.js` e `diaLocal.inicioDoPeriodoLocalISO`. No mesmo arquivo da T1:
  painel com `mes`/`ano` de HOJE, `?periodo=trimestre` e `?periodo=ano` pela rota (Fase 2 M5), (vencidas: HOJE fora, HOJE−1 dentro, em receber **e** pagar, números diferentes; receita do gráfico:
  pendente de HOJE soma, de HOJE+1 não — no mês dele), painel **sem** `mes`/`ano` (= os de HOJE), `?periodo=mes` nas três listas (o dia 1
  do mês de HOJE entra, o último do mês anterior não) e combinado com `search`+`status`; `inicioDoPeriodoLocalISO` com instantes fixos
  (mês, trimestre nas quatro viradas, ano na virada do ano às 22h, valor desconhecido = `null`).

  | Régua | volta ao `date('now')` | volta ao `toISOString` / `getMonth` do processo (UTC) |
  |---|---|---|
  | `< hoje` (vencidas — conta **toda** a massa pendente; o esperado calculado com ela inteira, Fase 2 I2) | HOJE−1 fora → pega HOJE−1 | HOJE dentro → pega HOJE |
  | `<= hoje` (receita) | HOJE fora → pega HOJE | HOJE+1 dentro → pega HOJE+1 |
  | mês padrão / *Este mês* | o mês real entra → o último dia do mês anterior a HOJE entra → pega | o mês de HOJE+1 → o dia 1 do mês de HOJE sai → pega |
  | *Trimestre* / *Este ano* / `ano` padrão | pela rota: o dia 1 entra, a véspera não (prova a ligação); a sabotagem de fuso só o unitário pega (HOJE e HOJE+1 raramente mudam de trimestre e nunca de ano — Fase 2 M5) | idem |
- [x] **T3 (galho, navegador) — os padrões de Frotas, o Financeiro e o PDF.** — `350eaed8` (Fase 5: `fa064023`). `frotasEntityConfigs.js` (três padrões), `Financeiro.js`
  (`formatDate` → `formatDateBR`, vazio = `'-'`), `etiquetasPdf.js:176`. Testes do cliente no fuso do `client/jest.globalSetup.js` (atribuir `process.env.TZ` no arquivo não vale no Jest — Fase 2 M9), com a
  guarda (`new Date('2026-10-20T00:00:00Z').getDate() === 19`), relógio falso nas 22h30 de Brasília: os três `getDefaultForm()` = o dia
  local; o Financeiro renderizado (com `api` mockado) mostra `20/10/2026` para a conta de vencimento `2026-10-20` e `-` para o pagamento
  vazio (metade positiva e negativa), e os mesmos valores nos argumentos do `exportToExcel` mockado (Fase 2 M9); o nome do PDF; o
  `fetchFrotasDashboard({ force: true })` com `params: { refresh: 1 }`.
- [x] **T4 (integração — cruza a régua nova com a severidade e o painel; mora no arquivo da T1)** — `0f879884` (o painel sem o atalho para a lista: `fa064023`): o mesmo documento de vencimento HOJE
  aparece na lista `?vencendo=1`, no `/frotas/alertas` com `dias_restantes 0` e severidade `alto`, e conta no `alertasCount` do painel; a
  revisão de HOJE está nos alertas (`0`, `medio`) e **não** em *Manutenção vencida*; a de HOJE−1 está nos dois (`−1`, `critico`).

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. O schema de Frotas sobe **depois** do boot (`db.run('SELECT 1', …, startSchemaInit)`) — a massa por fora espera as tabelas `frotas_*`
   existirem (uma chamada a `/frotas/meta` antes, que aguarda o `ensureSchema`).
3. O cache de 30 s do `/frotas/dashboard`: sempre `?refresh=1`.
4. Coluna só de data: **nunca** o modificador; o hoje entra como `?`.
5. O `hoje` lido **uma vez** por chamada (o painel de Frotas e o `getAlertas` dele; as vencidas e o gráfico do Financeiro).
6. Nenhuma porta de permissão muda; nenhum valor de dinheiro gravado muda.
7. `TZ` do processo do teste: o filho em `UTC` (régua independente do `TZ`); o próprio processo do teste em `America/Sao_Paulo` só para a
   prova do `diasAte` (o defeito antigo aparece nesse fuso o dia inteiro).

## Fora desta etapa (declarado)

- **C410 (novo)** — a mesma classe no Comercial: a prioridade *vencido/hoje* dos lembretes das propostas (`index.js:17388-17389`) e as
  propostas *a vencer* do painel (`:18061`, `:18068`), ainda no `date('now')`/`julianday('now')`. Medido de passagem, não a fundo.
- O `mes` fora de 1–12 do painel do Financeiro (`mes=13` → `'2026-13-01'`, painel vazio) — já era assim; validar com 400 muda o contrato.
- O painel antigo do Operacional (*Dashboard MES*, C403) — P.O.
- **C411 (novo, Fase 2 I3)** — o painel do Financeiro conta *vencidas* pela data; a lista (*Vencido* = R$ 0,00, `Financeiro.js:207`/`:306`) e
  o filtro de status *Vencido* leem `status = 'vencido'`, que nenhum código grava (o recebimento grava `pendente`). Marcar as vencidas na lista
  é produto.
- **C412 (novo, Fase 2 M13)** — o alerta de revisão e o cartão *Manutenção vencida* de Frotas leem **todas** as manutenções com próxima
  revisão, sem filtro de status nem só a mais recente por veículo: registrada a revisão nova, a antiga continua crítica. Não é régua de data.
- O teste da 163 (`validadesNoDiaLocal`) tem o buraco da Fase 2 I1 (o mês de HOJE pelo dia de Brasília real coincide com o do
  `date('now')` 3 h por mês) — registrado, não mexido.

## Execução — o que divergiu do plano

- **Reproduzido antes do conserto:** o teste novo contra o código de `adc2d24a`: **10 de 14** cenários caem (os 4 verdes: a guarda, as duas
  massas e o trimestre/ano pela rota — que só muda de trimestre/ano nas viradas, como a Fase 2 M5 previu). Depois do conserto: 14/14.
- **O `diasAte` entrou com uma checagem de data impossível** (nula) que o plano não pedia — e que a Fase 5 r1 mostrou errada (a conta antiga
  rolava a data; o comentário "como a conta antiga" era falso). Trocado na Fase 5 por `setUTCFullYear` (rola como antes).
- **Controle positivo da T1/T2 (`scratchpad/e164/sabota.js`, `sabota-t1t2.txt`):** 45 sabotagens — as três colunas da tabela por régua
  (`date('now')` pelo parâmetro `'now'`, `toISOString`, o modificador na coluna), o N fixo, o `hoje` fora de ordem na lista, o painel não
  passando o `hoje`, a conta antiga do `diasAte`, o mês padrão (`getMonth` UTC e o `NaN` de antes), o período nas três rotas e no
  utilitário — **45/45 caíram pela asserção do cenário delas**, md5 restaurado.
- **Controle positivo da T3:** voltar cada um dos quatro (padrões de Frotas, `formatDate`, nome do PDF, `refresh`) derruba 3, 2, 1 e 1 testes.
- **Paralelismo 0** (a T3 era galho, mas pequena; o condutor fez em sequência). Nenhum teste antigo mudou (a Fase 0 mediu: nenhum depende do
  dia UTC nesses fluxos).
- **De passagem (não previsto):** a seção 22.5 do manual ainda dizia que as validades da 163 contavam o dia universal — corrigida no
  fechamento; é o "defeito que escapou" da 163.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (regra) — 0 Critical/Important; 2 Minor + 1 informativo.** Sondas pelo `index.js` real (TZ=UTC e America/Sao_Paulo; 31/12/2026 22h e
  29/02/2028 21h30). (1) **real:** o `diasAte` devolvia nulo para o ano `0026` e para `2026-02-30`, que o SQL continua incluindo — o alerta
  saía sem dias e sem a cor crítica, e o cartão *Manutenção vencida* contava 3 com 1 crítico na lista (corrigido). (2) **declarado:** um
  instante ISO com `Z` (`2027-01-01T01:30Z`, 31/12 22h30 em Brasília) conta pelo prefixo — o dia UTC, coerente com o `date()` do SQL; só pela
  API (os formulários gravam só a data). (3) informativo: o `formatDateBR` com instante `Z`/número/data impossível — nenhum caminho grava isso.
  **Sem defeito:** as bordas, as viradas (ano, fevereiro bissexto, trimestre), o `mes`/`ano` estranhos (sem 500), nenhuma régua UTC restante.
- **r2 (autorização) — 0 achados.** 13 usuários × 32 chamadas, HEAD e base: **0 divergências** de código (200: 145, 201: 8, 401: 64, 403: 199
  nas duas); os 22 corpos diferentes são os esperados (o `dias_restantes` +1, o lucro). Nenhum valor do usuário chega interpolado; a ordem dos
  binds da lista não burla filtro; o `refresh=1` não tem efeito de autorização (o painel não é por usuário). **De quebra, reproduzido (de
  antes):** o painel do Financeiro contava 8 pendentes para 9 consultas — o lucro vinha nulo de vez em quando (**B1052**, corrigido).
- **r3 (sabotagem, worktree própria `CRM-wt-e164-r3`) — 48 sabotagens novas: 30 caíram pela asserção certa, 18 sobreviveram** (13 faltas de
  asserção, 2 inalcançáveis/equivalentes — `round`/`floor`, o hoje impossível —, 1 de dedupe antigo, 1 contrato indefinido — `mes=13` —, 1
  inalcançável pela rota — o ano padrão). As 13: a CNH vencida crítica (G05), a situação do motorista (G11), a régua de km (G07–G09), o T4 no
  painel que caía na lista da rota (G26 — **o T4 "no painel" não provava nada**), o `refresh` na rota (G28), o padrão do `diasAte` às 22h
  (G18), a data com hora (G16), a parcial do pagar (M03), o trimestre/ano no pagar e no fluxo (M10/M11), a chamada sem `force` (C02).
- **Correção da Fase 5 (`fa064023`):** o `diasAte` com `setUTCFullYear`; `pending = 9`; os cenários das 13 + o `mes=13` preso. **Controles:** o
  script do r3 reaplicado contra os testes novos — todas as que eram faltas de asserção caem pela asserção delas (G11 e M11 só depois de uma
  segunda massa: o motorista de situação *inativo* e o fluxo em 1º de janeiro); `pending = 8` cai na chamada 0; a versão que devolvia nulo e
  a do `Date.UTC` caem. **Declarado, sem teste:** o ano padrão do painel (HOJE nunca cai em 31/12 — lido no código).

## Suítes (lidas na saída, `scratchpad/e164/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **484/484**.
- **Bateria 1 — antes de `0f879884`/`350eaed8` (`b1-*.log`):** `test:api` **485/485** arquivos (`vencimentosFrotasFinanceiroNoDiaLocal` **14/0**);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **166** suítes / **2096** testes; `CI=true build`
  *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **39/39**.
- **Bateria 2 — antes de `fa064023` (`b2-*.log`; é também a do fechamento: depois só mudaram documentos):** `test:api` **485/485** arquivos (`vencimentosFrotasFinanceiroNoDiaLocal` **17/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **166** suítes / **2097** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **39/39**.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (o `diasAte` do legado, o `pending` e as asserções). As tasks ficaram verdes na
   primeira aplicação. **Testes antigos mudados: 0.**
2. **Achados da revisão:** Fase 2 — **0 Critical + 3 Important + 10 Minor**, todos reais (o mais caro: o HOJE pelo mês de Brasília real
   coincidia de mês com o `date('now')` 3 h por mês — a sabotagem do mês passaria vazia nessa janela). Fase 5 — r1 **1** real de produção
   (o legado nulo) + 1 declarado; r2 **0** da etapa + **1** real de antes (o `pending`); r3 **13** faltas de asserção reais; **0** ruído. **O que
   mais pesou:** de novo um cenário que **passava por atalho** (o `|| alerta(lista…)` do T4 caía na lista da rota — a mesma família do "passava
   por coincidência de ids" da 163) e as réguas antigas vizinhas (km, situação) sem massa.
3. **Paralelismo:** **0** galhos de código em paralelo; **1** revisor na Fase 2, **3** em paralelo na Fase 5 (o r3 na worktree própria, 48
   sabotagens) — **0** incidente de trava, **0** retrabalho.
4. **Defeito que escapou:** *(preencher na Etapa 165)*.

## Próxima tarefa detalhada — Etapa 165

*(A série desta etapa foi B1046–B1053, C409 resolvido, C410, C411 e C412 novos, nenhuma A — a 165 começa em **B1054**, **C413**, **A104**;
confira com `grep -oE` antes.)*

**Escolhida: o dia de Brasília nos lembretes e na validade das propostas do Comercial (C410).** Medido de passagem nesta etapa (não a
fundo): `GET /api/notificacoes` (`index.js:17366`, a prioridade *vencido*/*hoje*/*futuro* do lembrete da proposta, `:17388-17389`,
`DATE(pr.lembrete_data) < / = DATE('now')`); `GET /api/dashboard/vendas` (`:17929`, as propostas *a vencer*, `:18061`
`julianday(p.validade) - julianday('now') as dias_restantes` e `:18068` `julianday(p.validade) >= julianday('now')`); e no navegador o
`Dashboard.js:1394` (`new Date(item.lembrete_data).toLocaleDateString('pt-BR')` — a véspera o dia inteiro, a classe da B1050). O lembrete é
`type="date"` (`PropostaForm.js:713`); a validade da proposta — **medir a forma** (só data? `julianday` de só data dá meia-noite: o
`dias_restantes` sai fracionário?). **Medir antes:** quem lê cada consulta (o sino de notificações, o painel de vendas), as outras réguas
`date('now')`/`toISOString` no Comercial (`:6690`, `:6758`, `:7050`, `:17163`, `:18032` — instantes `created_at`? janelas de meses), e os testes que
calculam *hoje* nesses fluxos. **Régua:** `diaLocal.hojeLocalISO()` como parâmetro, sem modificador em coluna só de data; em coluna de
instante, `date(col, ?)` com `modificadorDoFuso()`. **Teste:** o molde desta etapa (`vencimentosFrotasFinanceiroNoDiaLocal` — TZ=UTC e o
relógio adiantado no filho para as 22h de Brasília do último dia do mês seguinte **ao mês UTC real** (pulando dezembro), com a guarda dos três
meses); massa com as duas bordas, **um veículo/uma linha por borda** nas réguas que agregam, filtros combinados, e **nenhum atalho** na
asserção do cenário (o `||` que cai em outra fonte — a lição do r3 desta etapa). **Pontos de atenção:** (1) a trava de máquina (um `test:api`
por vez); (2) a tabela "qual borda pega qual sabotagem"; (3) nenhuma porta de permissão muda (o portão do Comercial nas propostas é o da
145); (4) a revisão obrigatória da proposta (23 + editor 39) é critério — o painel de vendas lê propostas.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**, ligar o painel antigo (*Dashboard
MES*, **C403** — se for ligado a um menu, consertar antes a régua do dia e a consulta da manutenção) e **ligar a edição de atividades e decidir
o que ela grava** (**C408**); do Comercial, a **C354**, a **C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**, a **C383**,
ignorar também o acento nas buscas (**B1013**, **B1019**) e o resto da **C382** (**B1016**); do núcleo, a **C362**; da 160, o filtro *Status* dos
Materiais (**C398**) e os tipos do filtro das Movimentações e o material de cliente nos seletores das Reservas/Inspeções (**C399**); da C400,
acrescentar a descrição da OS à busca das OPs (muda o resultado); da 162, contar os *dias em espera* em dias de calendário (**B1036** — é
régua); da 163 (r1), validar o `referencia` das remessas como `AAAA-MM-DD` com 400 (muda o contrato da rota) e o `horas_reais: 0` gravado
como nulo (é régua de presença); **desta etapa**, marcar as contas vencidas na lista do Financeiro (**C411** — o status *vencido* que ninguém
grava), as revisões antigas que continuam alertando em Frotas (**C412** — qual revisão vale), e validar o `mes` fora de 1–12 do painel do
Financeiro com 400 (muda o contrato). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `diaLocal.js` (`hojeLocalISO`, `inicioDoMesLocalISO`, `inicioDoPeriodoLocalISO`,
`modificadorDoFuso`, `instanteDoBancoNoFuso`) e o `dataLocal.js` do navegador; o `formatDateBR` (data sem hora como local); as réguas de
Frotas, o `diasAte` e o painel/filtros do Financeiro (`0f879884`, `350eaed8`, `fa064023`).
