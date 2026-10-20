# Etapa 165 (Comercial): os lembretes, a validade, as datas gravadas e a data de emissão das propostas no dia de Brasília (C410) — plano

> Origem: "Próxima tarefa detalhada — Etapa 165" do plano da 164
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa164-os-vencimentos-de-frotas-e-do-financeiro-no-dia-de-brasilia.md`). Etapa de
> consertos técnicos fora do Almoxarifado; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1053**, último C **C412**,
> última A **A103**. Esta etapa: **B1054+**, **C413+**, **A104+**. Worktree `CRM-wt-e165`, branch `etapa-e165` (da main `3731b0e1`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 8 Important, 14 Minor — todos aceitos (os de produto, declarados);
> o plano abaixo já está corrigido** (`scratchpad/e165/f2-relatorio.md`). **I1** o formulário da proposta (`proposta/PropostaForm.js:337`)
> preenche a `data_fechamento` com o dia UTC ao marcar *aprovada*/*rejeitada* — o padrão do servidor nunca roda nesse caminho: entra na T2.
> **I2** o `listasNotificacoesPortao` grava o lembrete conferido na `:499` (não só na `:262`/`:277`). **I3** a ordem *vencidos primeiro* das
> Atividades é monotônica na data — o teste só sabe falhar com uma atividade de **instante** (ISO `Z`) das 21h à meia-noite ao lado do
> lembrete de hoje/amanhã. **I4** `validade_dias` enorme deixa a requisição **sem resposta** (`toISOString` lança dentro do callback): fora de
> ±36 500 dias → o padrão 15. **I5** a previsão compara por `julianday` (o texto livre `'30/10/2026'` passaria num `>=` de texto e derrubaria a
> tela) e conta os dias por `date(validade)` (inteiro mesmo com hora). **I6** no filho `TZ=UTC` a sabotagem "lê o instante como local" passa
> vazia: o unitário do `dataDoBancoBR` roda no processo do teste (Brasília) com um instante entre 00:00 e 02:59 UTC, e uma guarda no fonte
> prova que as duas rotas usam a função. **I7** o rótulo do mês do gráfico de evolução do painel (`Dashboard.js:198`) sai um mês atrás o dia
> inteiro — entra na T2. **I8** os instantes das telas da proposta (*Criada em*, *Enviada em*, o histórico, o histórico de edições) saem +3 h
> o dia inteiro — entram na T2 (a *Criada em* discordaria da *Data de Emissão* corrigida). **Minor:** a aprovação **não** vai ao sino (M1 —
> texto corrigido, asserção tirada); a ordem do sino é sem efeito (M2 — declarado); a migração `aceita → aprovada` (`:35`) grava o dia UTC
> (M3 — incluída); o `{{proposal.date}}` (M4 — C415); a probabilidade da proposta gerada é 50 (M5); a validade não tem campo no formulário
> (M6); as três ordenações do calendário (M7); a borda de 3 px do lembrete *alta* no calendário (M8); *hoje* × *vencido* entre as telas (M9 —
> declarado, produto); o tempo médio de fechamento mistura data e instante (M10 — declarado); data impossível → `''` (M11); lembrete com hora
> (M12 — limite); lembrete inválido derrubava as Atividades (M13 — `-`, fim da ordem, fora do calendário); polling da atividade de aprovação,
> aprovador não dono, cliente na massa, guarda do `LIMIT 20`, o `PropostaForm.js` morto e os atalhos do `Dashboard.js:21-41` (M14).

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor). Base `test:api` rodada antes de qualquer código (`scratchpad/e165/base-api.log`). O processo
de produção roda com `TZ=America/Sao_Paulo` (`Dockerfile:47`); a máquina de desenvolvimento também. O `date('now')`/`julianday('now')` do
SQLite e o `toISOString()` são o dia **UTC** em qualquer `TZ` — das 21h à meia-noite de Brasília, o de amanhã.

**A forma das colunas.** `propostas.validade DATE` e `propostas.lembrete_data DATE` (`index.js:1412`, `:1423`) — **só data**, gravadas pelo
`type="date"` (`client/src/components/proposta/PropostaForm.js:713` o lembrete); a validade **não tem campo** no formulário da rota (só é
carregada e devolvida, `:211` — Fase 2 M6): nasce na geração automática por `validade_dias` (`:8858-8864`) ou pela API. `propostas.data_fechamento` — só data (`toISOString().split('T')[0]`, `:7527`, `:7820`, `:8481`).
`propostas.expira_em DATETIME` — recebe o mesmo texto só de data da validade na geração automática (`:8867`). `propostas.created_at` —
**instante** (`CURRENT_TIMESTAMP`, UTC sem fuso). `atividades.data_agendada DATETIME` — texto só de data na atividade de aprovação
(`:14111`) e nos lembretes (é o `lembrete_data`), ISO com `Z` nas criadas pelo calendário (`CalendarioAtividades.js:366`).

**Servidor (`server/index.js`) — quem lê e o que muda (dia D = o de Brasília):**

| Onde | Linha | Régua | Quem lê | Efeito |
|---|---|---|---|---|
| `GET /api/notificacoes` prioridade | `:17388-17389` | `DATE(lembrete) < / = DATE('now')` → `vencido`/`hoje`/`futuro` | o sino do Comercial (`Notificacoes.js`: rótulo *Vencido*/*Hoje*/*Próximos 7 dias*, a cor, o ícone de alerta e o contador = vencido + hoje) | das 21h à meia-noite: o lembrete de hoje sai *Vencido*, o de amanhã sai *Hoje* (e conta no número do sino) |
| idem, janela | `:17396` | `DATE(lembrete) <= DATE('now', '+7 days')` | idem | entra o de D+8 |
| idem, ordem | `:17398-17403` | vencido, hoje, futuro, depois a data | idem | **nenhum visível**: a prioridade é monotônica na data, a ordem é a da data com régua velha ou nova (Fase 2 M2) |
| `GET /api/atividades` prioridade do lembrete | `:15286-15295` | `<= DATE('now')` → `alta`, senão `media` (o `status_lembrete` é sempre `pendente` — régua morta) | as *Atividades* do Comercial (o selo de prioridade do cartão; no calendário, a borda de 3 px do evento `alta`, `CalendarioAtividades.js:124` — Fase 2 M8) e o `CustosViagens.js:322` (não lê a prioridade) | das 21h: o lembrete de amanhã sai *ALTA* |
| `GET /api/dashboard/avancado` `cotacoesComLembrete` | `:17350-17353` | `lembrete_vencido = DATE(lembrete) <= DATE('now')` | a tabela de lembretes do painel (`Dashboard.js:1389-1404`: a linha vermelha e a coluna *Alerta*) | das 21h: o lembrete de amanhã sai vencido |
| `GET /api/dashboard/vendas` previsão de fechamento | `:18050-18070` | `julianday(validade) - julianday('now')` (dias **fracionários**, `Math.round`) e `julianday(validade) >= julianday('now')` | a lista *Previsão de fechamento* do painel de vendas (`DashboardVendas.js:244-268`: *"N dias restantes"*, o selo *Urgente*/*Atenção*/*Normal*) e a probabilidade padrão (≤ 7 → 80, ≤ 15 → 60, senão 40) quando a proposta não tem probabilidade | **o dia inteiro**: `julianday` de só data é a meia-noite UTC — a proposta que vale até **hoje** sai da lista desde as **21h da véspera** (nunca aparece no próprio dia); os dias restantes são `validade − agora`, arredondados: das 9h às 24h de Brasília sai **um a menos** (D+N mostra N−1), da meia-noite às 9h sai N |
| `POST /api/propostas` (aprovada/rejeitada sem data) | `:7527` | `data_fechamento = toISOString` | a data de fechamento gravada (a lista, os relatórios de fechamento) | das 21h: grava amanhã |
| `PUT /api/propostas/:id` (idem) | `:7820` | idem | idem | idem |
| `POST /api/propostas/:id/aceitar` | `:8481` | `COALESCE(data_fechamento, toISOString)` | idem | idem |
| `POST /api/propostas/gerar-automatica` `validade_dias` | `:8858-8864` | `setDate(+N)` no `TZ` do processo, depois `toISOString` | a validade (e o `expira_em`) da proposta gerada pelo *Gerar proposta* (`GerarPropostaModal.js`, padrão 15 dias) | das 21h: hoje + N + 1 (medido: 20/10 22h + 15 → `2026-11-05`; o certo é `2026-11-04`) |
| `migrarAceitaParaAprovada` (boot, só se houver proposta `aceita`) | `:35` | `data_fechamento = toISOString` | idem | das 21h: grava amanhã (Fase 2 M3) |
| `POST /api/aprovacoes` (a atividade do aprovador, gravada **depois** da resposta) | `:14111` | `data_agendada = toISOString` | a atividade *Aprovação de Desconto* nas *Atividades* do aprovador | das 21h: agendada para amanhã |
| `GET /api/propostas/:id/premium` `dataEmissao` | `:9174-9181` | `new Date(created_at).toLocaleDateString('pt-BR')` — o `'AAAA-MM-DD HH:MM:SS'` UTC lido como hora **local** | a **capa do documento** (`propostaPremiumV2.js:2061`, *"Data de Emissão: <strong>DD/MM/AAAA</strong>"*) — o preview | proposta **criada** das 21h à meia-noite imprime o **dia seguinte**, em toda reimpressão |
| `GET /api/propostas/:id/pdf` `dataEmissao` | `:9468-9474` | idem | a capa do PDF (sempre regenerado — `sempreRegenerarParaPdf`, `:9651`) | idem |
| `dataValidade` (os dois) | `:9183-9190`, `:9472` | `new Date('AAAA-MM-DD').toLocaleDateString` (a véspera em UTC-3); o `/pdf` lê `proposta.data_validade`, coluna que **não existe** em `propostas` | **ninguém imprime**: `propostaPremiumV2.js:276` declara `dataValidade` e não o usa | **nenhum** na tela/documento |

**A validade NÃO aparece no documento da proposta** (medido: `grep dataValidade` no template — declarada em `:276`, nunca interpolada; o
sumário só traz o título *5.17 VALIDADE DA PROPOSTA*, texto de cláusula). A **data de emissão** aparece (a capa). A revisão obrigatória da
proposta (23 scripts + editor 39) chama o template **direto**, com `totais.dataEmissao` fixo (`acessoriosItem.test.js:153` etc.) — não passa
pela conta mudada.

**Navegador — a véspera o dia inteiro (a classe da B1050):** `new Date('AAAA-MM-DD')` é meia-noite UTC = 21h da véspera no Brasil.

| Onde | Linha | O que mostra | Efeito |
|---|---|---|---|
| `Notificacoes.js` (o sino) | `:175` | a data do lembrete (só data; a rota monta as aprovações mas **não as devolve**, `index.js:17473` — Fase 2 M1) | o lembrete aparece com a **véspera** |
| `Atividades.js` cartão e modal | `:496`, `:532` | *"Lembrete para: DD/MM/AAAA"* / *"Agendada: …"* e *"Data do Lembrete"* | o lembrete e a atividade de aprovação (só data) com a véspera |
| `Atividades.js` ordem | `:69-80`, `:202-212` e as três recargas do calendário (`:331-339`, `:352-360`, `:373-381`) | lembretes *vencidos* primeiro (`new Date(data) < meia-noite local`), depois a data | a partição é monotônica na data, então só a troca de 3 h entre a data pura (meia-noite UTC) e o **instante** aparece: a atividade criada no calendário para hoje às 22h (ISO `Z` = amanhã 01:00 UTC) fica **depois** do lembrete de amanhã (Fase 2 I3, sonda); o lembrete inválido derruba a página (`format(Invalid Date)` lança — M13) |
| `CalendarioAtividades.js` | `:37-41`, `:97-104` | a posição do evento no calendário (`setHours(9)` sobre a véspera) e o vermelho escuro do lembrete vencido | o lembrete (e a atividade de aprovação) aparece **no dia anterior** no calendário, e o de hoje, escuro (vencido) |
| `Dashboard.js` (tabela de lembretes) | `:1394` | *Data Lembrete* | a véspera |
| `DashboardVendas.js` (previsão) | `:255` | *"Validade: DD/MM/AAAA"* | a véspera |
| `Dashboard.js` gráfico de evolução | `:198` | o rótulo do mês (`new Date(mes + '-01')`) | **o mês anterior**, o dia inteiro (outubro sai *set.* — Fase 2 I7) |
| `proposta/PropostaForm.js` (*Status* → aprovada/rejeitada) | `:336-338` | preenche a `data_fechamento` com `toISOString` (o dia UTC) — é o que se grava, o padrão do servidor nunca roda nesse caminho | das 21h: amanhã (Fase 2 I1) |
| `PropostaDetalhe.js:218/219/228`, `PropostasList.js:325/523` (`formatDateTimeBR`) e `HistoricoEdicoes.js:25-28` | — | *Enviada em*, *Criada em*, o histórico de status e o de edições (instantes do banco) | **+3 h o dia inteiro** (o `parseISO` lê `'AAAA-MM-DD HH:MM:SS'` UTC como local); das 21h à meia-noite, o dia seguinte — e a *Criada em* discordaria da *Data de Emissão* corrigida (Fase 2 I8) |
| `Atividades.js` estatísticas (*Vencidos*/*Prestes a vencer*) e a cor do cartão | `:97-140`, `:405-460` | contam pelo dia local (já leem a data como local) | **certas** — não mudam |
| `PropostaDetalhe.js:216`/`:217`, `PropostasList.js:324`/`:521` | — | a validade e o *Expira em* | **certas** (`formatDateBR`, data pura como local) |

**Fora do caminho (código morto — medido, não mexido; vira C414):** `client/src/components/Propostas.js` (`:286`, `:411`, `:564`, a validade
com a véspera — **não está em rota nenhuma**: o `App.js:277` usa `PropostasList`), `client/src/utils/gerarPDFProposta.js` (`:106-113`,
emissão e validade — **ninguém importa**) e o `gerarHTMLPropostaPremium` (V1, `index.js:10560`, o fallback da emissão em `:11782` —
**ninguém chama**) e o `components/PropostaForm.js` de nível de cima (`:1454`, `:1598` — sem import; Fase 2 M14).

**Outras réguas do Comercial (medidas, não mexidas — viram C413):** janelas e agrupamentos por mês sobre o **instante** de criação, no UTC:
`/api/relatorios/executivo` (`:6690` evolução de 6 meses `created_at >= date('now', '-6 months')` com `strftime('%Y-%m', created_at)`; `:6758`
clientes sem proposta há 90 dias), `/api/relatorios/visitas-tecnicas` (`:7050`, propostas dos últimos 90 dias) e `/api/dashboard/historico`
(`:17163`, 12 meses). Efeito: a borda da janela anda 3 h, e a proposta criada das 21h à meia-noite do último dia do mês conta no mês
seguinte. É agrupamento de relatório (muda o desenho dos gráficos por mês) — fica para uma etapa própria. O tempo médio por
etapa (`:18032`, `julianday('now') - julianday(created_at)`) é duração entre dois instantes UTC — certo em qualquer fuso. O tempo médio de
fechamento (`:18093-18098`) subtrai o instante de criação da `data_fechamento` **só de data** (meia-noite): viés de cerca de −0,5 dia, de
antes; a B1056 o desloca um pouco (o fechamento das 21h passa a contar um dia a menos) — declarado (Fase 2 M10). Os atalhos de período do
`Dashboard.js:21-41` (o fim no dia UTC) são da mesma família — C413.

**Portas de saldo, trava e permissão:** nenhuma. O Comercial não toca estoque; o portão das rotas (`exigirComercialNasPropostas`, o
`filtrarNotificacoesPorModulo` da 154) não muda.

**Os testes antigos que calculam *hoje* nesses fluxos (mudam junto — o dia UTC deixa de ser o do servidor):**
- `tests/api/listasNotificacoesPortao.api.test.js:262`, `:277` — grava o lembrete com `DATE('now')` e espera `prioridade 'hoje'` (`:272`).
  O lembrete conferido é o do preparo, **`:499`** (Fase 2 I2). Hoje passa a qualquer hora; com a régua nova, das 21h à meia-noite o
  `DATE('now')` é amanhã → `futuro` → cairia **3 h por dia**. As três (`:262`, `:277`, `:499`) passam ao hoje de Brasília.
- `tests/api/putParcialMantem.api.test.js:266`, `:286`, `:462` — espera `data_fechamento = toISOString` (o dia UTC). Mesma janela. Passa ao
  `hojeLocalISO()`.
- `tests/aceitarPropostaViraAprovada.test.js` — fora de todo `npm run` e com SQL próprio (não chama o `index.js`); só confere o formato. Não
  muda.


## Decisões (letra B — reversíveis)

- **B1054 — os lembretes das propostas no dia de Brasília (o sino, as Atividades e o painel).** As réguas de `:15286-15295`, `:17350-17353`
  e `:17388-17403` passam a comparar `DATE(lembrete_data)` com o `diaLocal.hojeLocalISO()` como **parâmetro** (`?`), sem modificador (coluna
  só de data); a janela do sino = `date(?, '+7 days')`. O `hoje` é lido **uma vez** por chamada e o mesmo valor vai a todas as comparações da
  consulta. **Muda (das 21h à meia-noite):** o lembrete de hoje volta a sair *Hoje* (antes *Vencido*); o de amanhã sai *Próximos 7 dias* e
  deixa de contar no número do sino (antes *Hoje*); o de D+8 sai do sino; nas Atividades o lembrete de amanhã sai *MEDIA* (antes *ALTA*, e a
  borda grossa no calendário); no painel, o lembrete de amanhã deixa de sair vencido. **Não muda (declarado, Fase 2 M9):** as telas já
  discordavam entre si sobre o lembrete **de hoje** — o painel o marca *Vencido* (`<=`), o sino diz *Hoje*, as estatísticas das Atividades
  dizem *Prestes a vencer* — é produto, fica como era. **Descartado:** só o sino (as três telas leriam dias diferentes para o mesmo lembrete).
- **B1055 — a previsão de fechamento do painel de vendas no calendário de Brasília (o dia inteiro).** A lista = `julianday(validade) >=
  julianday(hoje)` e `dias_restantes = julianday(date(validade)) − julianday(hoje)` (dias de calendário, inteiro mesmo com hora), com o
  `hoje` como parâmetro (o mesmo valor nas duas). A comparação é por `julianday`, não por texto: a validade em texto livre (`'30/10/2026'`)
  continua **fora**, como antes (um `>=` de texto a deixaria entrar e a tela cairia ao formatá-la — Fase 2 I5). **Muda o dia inteiro:** a
  proposta que vale até hoje passa a aparecer, com *"0 dias restantes"* e *Urgente* (antes sumia desde as 21h da véspera); os dias restantes
  passam a ser os de calendário (antes, das 9h01 à meia-noite, um a menos: a que vale até amanhã dizia *0*); a probabilidade padrão (só da
  proposta sem probabilidade gravada — a coluna tem padrão 50, então quase nunca) usa o mesmo número. **Descartado:** só a janela das 21h (o
  defeito do `julianday('now')` fracionário é o dia inteiro).
- **B1056 — as datas que as propostas gravam, no dia de Brasília.** `data_fechamento` padrão (`POST`, `PUT`, `/aceitar`, a migração
  `aceita → aprovada` do boot, e o **formulário** ao marcar *aprovada*/*rejeitada* — o gesto principal, Fase 2 I1), a `validade` e o
  `expira_em` da geração automática (`hoje + validade_dias` em dias de calendário, `diaLocal.somarDiasISO`, sem passar pelo `TZ` do
  processo) e a `data_agendada` da atividade de aprovação = o hoje de Brasília (+ N). `validade_dias` lido como antes (`parseInt(v, 10) ||
  15` quando presente e não vazio: `'7.9'` → 7, `'abc'`/`'0'` → 15, o número `0` → sem validade, **o negativo continua valendo** → validade no
  passado, como antes), **e** fora de ±36 500 dias → 15 (antes: o `toISOString` lançava dentro do callback e a requisição **ficava sem
  resposta** — Fase 2 I4). **Muda (das 21h à meia-noite):** grava hoje (antes amanhã); a validade gerada é hoje + N (antes hoje + N + 1); o
  `validade_dias` enorme gera a proposta com 15 dias em vez de pendurar. **Nenhum valor já gravado muda.** **Descartado:** recusar o
  `validade_dias` fora de faixa com 400 (recusa nova — muda o contrato); corrigir as datas antigas no banco (não dá para saber, de um
  `data_fechamento` só de data, se foi gravado depois das 21h).
- **B1057 — a data de emissão no documento da proposta (preview e PDF) no dia de Brasília. MUDA A DATA IMPRESSA.** `dataEmissao` = o dia de
  Brasília do `created_at` (o instante UTC lido como UTC), em `DD/MM/AAAA`; a `dataValidade` (que o template não imprime) = o texto só de data
  em `DD/MM/AAAA`, sem fuso, e o `/pdf` passa a lê-la de `validade` (a coluna `data_validade` não existe em `propostas` — o valor era sempre
  vazio; continua não impresso). Uma função só (`diaLocal.dataDoBancoBR`) para as duas rotas. **Muda:** a proposta **criada das 21h à
  meia-noite** passa a imprimir, na capa, o dia em que foi criada (antes, o dia seguinte) — **e isso vale também para a reimpressão de
  proposta antiga**: o PDF regerado de uma proposta criada às 22h sai com uma data de emissão **um dia antes** da que foi enviada ao cliente.
  As outras (criadas das 0h às 21h) não mudam. O `created_at` ilegível deixa de imprimir *"Invalid Date"* e passa ao `—` do template.
  **Descartado:** congelar a data das propostas já enviadas (exigiria gravar a emissão — schema e produto); imprimir a validade (produto).
- **B1058 — as datas das telas do Comercial no dia gravado, e os instantes no relógio de Brasília (o dia inteiro).** Uma leitura só no
  navegador (`dataLocal.lerDataDoBanco`: só data → meia-noite **local**; o `'AAAA-MM-DD HH:MM:SS'` do banco → UTC (`lerInstanteDoBanco`); ISO →
  como está; inválido → `null`) e um formatador (`dataLocal.formatarDataDoBanco`, `DD/MM/AAAA`, vazio/inválido → o marcador da tela) em: o
  sino (`Notificacoes.js:175`), as Atividades (o cartão, o modal, as **cinco** ordenações), o calendário (o dia do evento, o vermelho do
  vencido; o evento sem data válida sai do calendário), a tabela de lembretes e o rótulo do mês do gráfico de evolução do painel
  (`Dashboard.js:1394`, `:198`) e a validade da previsão (`DashboardVendas.js:255`). E os instantes das telas da proposta: o `formatDateTimeBR`
  (só usado por `PropostaDetalhe` e `PropostasList`) passa a ler o `'AAAA-MM-DD HH:MM:SS'` do banco como UTC, e o histórico de edições
  (`HistoricoEdicoes.js`) também (Fase 2 I8). **Muda o dia inteiro:** o lembrete, a validade e a atividade de aprovação aparecem no dia gravado
  (antes, no Brasil, a véspera; no calendário, no dia anterior); o gráfico de evolução rotula o mês certo (antes o anterior); *Criada em*,
  *Enviada em* e os dois históricos mostram a hora de Brasília (antes +3 h; das 21h à meia-noite, o dia seguinte); o lembrete de hoje deixa de
  sair escuro (vencido) no calendário; o lembrete com data ilegível deixa de derrubar a página das Atividades (mostra `-`, vai para o fim da
  lista e sai do calendário). **Descartado:** formatar no servidor (muda o contrato de várias rotas).
- **B1059 — a próxima etapa (166).**

## Regras de negócio

- **RN-165.01 (B1054)** — sino: lembrete com `DATE(lembrete_data) < hoje de Brasília` = `vencido`; `= hoje` = `hoje`; senão `futuro`; só os com
  `DATE(lembrete_data) <= hoje + 7`; ordem vencido → hoje → futuro, depois a data; só os do usuário (responsável ou criador), como antes.
- **RN-165.02 (B1054)** — Atividades: lembrete com `DATE(lembrete_data) <= hoje` = prioridade `alta`, senão `media` (status `pendente`).
- **RN-165.03 (B1054)** — painel avançado: `lembrete_vencido = 1` quando `DATE(lembrete_data) <= hoje`.
- **RN-165.04 (B1055)** — previsão de fechamento: propostas `enviada`, ativas, com `julianday(validade) >= julianday(hoje)`, ordenadas pela
  validade, até 20; `dias_restantes = julianday(date(validade)) − julianday(hoje)`; probabilidade = a gravada, ou 80 (≤ 7 dias), 60 (≤ 15), 40.
- **RN-165.05 (B1056)** — `data_fechamento` padrão = hoje (POST/PUT com aprovada/rejeitada sem data; `/aceitar` sem data; a migração do boot;
  o formulário ao marcar aprovada/rejeitada sem data); geração automática com `validade_dias` (sem `validade`) → `validade = expira_em =
  hoje + N`, N = `parseInt(v, 10) || 15`, e N fora de ±36 500 → 15; a atividade de aprovação nasce agendada para hoje.
- **RN-165.06 (B1057)** — documento: *Data de Emissão* = o dia de Brasília do instante de criação, `DD/MM/AAAA`; vazio ou ilegível → `''` (o
  template mostra `—`).
- **RN-165.07 (B1058)** — telas: data só de data exibida no dia gravado; instante do banco no relógio/dia de Brasília; o lembrete de hoje não
  é *vencido* no calendário; vazio ou ilegível = o marcador de cada tela (`-`); nas ordenações, sem data válida vai para o fim. **Limite
  declarado (Fase 2 M12):** o lembrete gravado com hora (`'…T00:00:00.000Z'`, só pela API — o formulário grava só a data) é lido como instante
  na tela e pelo prefixo no servidor.

## Contratos (congelados)

- **`GET /api/notificacoes`**, **`GET /api/atividades`**, **`GET /api/dashboard/avancado`**, **`GET /api/dashboard/vendas`** — mesmas formas,
  códigos e campos; os valores pelas RN-165.01 a .04 (`dias_restantes` continua inteiro).
- **`POST /api/propostas`**, **`PUT /api/propostas/:id`**, **`POST /api/propostas/:id/aceitar`**, **`POST /api/propostas/gerar-automatica`**,
  **`POST /api/aprovacoes`** — mesmas formas, códigos e mensagens (nenhuma recusa nova); as datas gravadas pela RN-165.05.
- **`GET /api/propostas/:id/premium`**, **`GET /api/propostas/:id/pdf`** — o mesmo documento; a data da capa pela RN-165.06.
- **Servidor:** `diaLocal.dataDoBancoBR(valor)` (novo) → `'DD/MM/AAAA'`: `'AAAA-MM-DD'` válido → reformatado sem fuso; `'AAAA-MM-DD
  HH:MM:SS'` válido (instante UTC do banco) → o dia de Brasília; ISO com `Z`/deslocamento → o dia de Brasília do instante; ISO com `T` **sem**
  fuso → lido como hora do processo (o `new Date` de sempre) e levado ao dia de Brasília; data impossível (`2026-02-30`, `2025-02-30
  10:00:00`), ano < 1900, vazio, nulo, não texto, lixo → `''` (Fase 2 M11). `diaLocal.somarDiasISO(dia, n)` (novo) → `'AAAA-MM-DD'` + n dias
  de calendário (`Date.UTC`); `n` não inteiro finito ou resultado inválido → `null`. Em SQL, **parâmetro** (`?`), nunca interpolado; sem
  `modificadorDoFuso` (colunas só de data).
- **Navegador:** `dataLocal.lerDataDoBanco(valor)` → `Date | null`; `dataLocal.formatarDataDoBanco(valor, vazio = '-')` → `'dd/MM/yyyy'` ou
  `vazio`; `formatDateTimeBR` (utils/formatDate) lê o instante do banco como UTC (o resto como antes).

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor) — as réguas de leitura (RN-165.01 a .04), as datas gravadas (RN-165.05) e a emissão (RN-165.06).** — `5cdaec48` (Fase 5: `4155d11d`).
  `index.js` e `diaLocal.js`. Teste novo `server/tests/api/lembretesEValidadeDasPropostasNoDiaLocal.api.test.js` pelo `index.js` real em
  pasta vazia (o molde da 164: filho com `TZ=UTC` e `relogioAdiantado` nas **22h de Brasília do último dia do mês seguinte ao mês UTC
  real**, pulando dezembro; HOJE (Brasília), HOJE+1 (o dia UTC do JS) e o `date('now')`/`julianday('now')` do SQLite (o real, semanas antes)
  são três dias diferentes; guarda independente do código de produção). Massa por fora (`sqlite3` no arquivo do filho), **com cliente** (o
  painel faz `JOIN clientes`): **uma proposta por borda** (lembrete em HOJE−1, HOJE, HOJE+1, HOJE+7, HOJE+8, do admin; um de HOJE de outro
  usuário — o recorte); propostas `enviada` com validade em HOJE−1, HOJE, HOJE+1, HOJE+7, HOJE+8, HOJE+15, HOJE+16 com `probabilidade` nula
  (os três degraus), uma com probabilidade 33, uma com validade `'30/10/2026'` (texto livre — fora) e uma com validade `HOJE+5 15:00:00`
  (dias 5); uma `rascunho` com validade HOJE (fora — o status); guarda de que há menos de 20 `enviada` com validade (o `LIMIT 20`). Um segundo
  usuário com `pode_aprovar_descontos` (o aprovador não pode ser dono — RN-140.07); a atividade de aprovação é lida por polling (gravada
  depois da resposta). E, no próprio processo do teste (`TZ=America/Sao_Paulo`), o `dataDoBancoBR` (com um instante entre 00:00 e 02:59 UTC —
  a variante "lê como local" só cai aqui, Fase 2 I6; as datas impossíveis; o ISO com `Z`) e o `somarDiasISO`; e uma guarda no fonte (sem
  comentários) de que o `/premium` e o `/pdf` calculam a emissão pelo `diaLocal.dataDoBancoBR`.
  **Qual borda pega qual sabotagem** (no filho: `date('now')`/`julianday('now')` = o real, semanas antes de HOJE; `toISOString` = HOJE+1):

  | Régua | volta ao `date('now')` | volta ao `toISOString` (HOJE+1) | modificador na coluna (`date(col, '-180 minutes')`) |
  |---|---|---|---|
  | sino `< hoje` / `= hoje` | HOJE−1 e HOJE somem/saem `futuro` → pega | HOJE sai `vencido`, HOJE+1 `hoje` → pega | HOJE vira HOJE−1 → `vencido` → pega |
  | sino `<= hoje + 7` | HOJE+7 sai → pega | HOJE+8 entra → pega | HOJE+8 vira HOJE+7, entra → pega |
  | sino, a ordem | — sem efeito por construção (Fase 2 M2 — declarado, não testado) | — | — |
  | Atividades `<= hoje` | HOJE−1 sai `media` → pega | HOJE+1 sai `alta` → pega | HOJE+1 vira HOJE, `alta` → pega |
  | painel `<= hoje` | HOJE−1 sai 0 → pega | HOJE+1 sai 1 → pega | HOJE+1 vira HOJE → pega |
  | previsão `>= hoje` e os dias | HOJE−1 entra e os números saem semanas a mais → pega | com o instante de agora: HOJE sai (−1,04) → pega | HOJE vira HOJE−1 (fora) → pega |
  | previsão por texto (`validade >= ?`) | — | — | o `'30/10/2026'` entra → pega |
  | previsão sem `date()` nos dias | — | — | a de `HOJE+5 15:00:00` sai 5,625 → `Math.round` 6 → pega |
  | `data_fechamento`, atividade de aprovação | — | grava HOJE+1 → pega | — |
  | `validade_dias` | — | `setDate` no TZ do filho (UTC = HOJE+1) → HOJE+N+1 → pega | — |
  | emissão (`created_at` = HOJE 22h de Brasília = HOJE+1 01:00 UTC) | — | a conta antiga no filho em UTC → HOJE+1 → pega; a variante "lê como local" passa no filho e **cai no unitário** (Brasília) | — |

  Os testes antigos `listasNotificacoesPortao` (`:262`, `:277`, `:499`) e `putParcialMantem` (`:266`, `:286`, `:462`) passam ao hoje de
  Brasília (Fase 0).
- [x] **T2 (galho, navegador) — as datas das telas (RN-165.07) e o formulário (RN-165.05).** — `0431c949` (Fase 5: `4155d11d`). `utils/dataLocal.js` (`lerDataDoBanco`,
  `formatarDataDoBanco`), `utils/formatDate.js` (`formatDateTimeBR`), `Notificacoes.js`, `Atividades.js`, `CalendarioAtividades.js`,
  `Dashboard.js`, `DashboardVendas.js`, `proposta/HistoricoEdicoes.js`, `proposta/PropostaForm.js` (`handleStatusChange` → `hojeLocalISO()`).
  Testes no fuso do `client/jest.globalSetup.js` com a guarda (`new Date('2026-10-20T00:00:00Z').getDate() === 19`): os utilitários (só
  data, instante do banco, ISO com `Z`, vazio, inválido); o sino renderizado (`api` mockado) mostra `20/10/2026` para o lembrete
  `2026-10-20`; as Atividades (o cartão *"Lembrete para: 20/10/2026"*, o modal, e a ordem com o relógio falso às 15h de 20/10: o lembrete de
  amanhã `2026-10-21` **depois** da atividade de hoje às 22h `2026-10-21T01:00:00.000Z` — Fase 2 I3 —, o de ontem no topo, o ilegível no
  fim e o cartão dele com `-`); o calendário (o evento do lembrete `2026-10-20` com `start` em 20/10 9h local, sem o vermelho escuro; o de
  ontem, escuro; o ilegível fora); o painel (a data do lembrete e o rótulo do mês: `2026-10` → *out.*); a previsão (`20/10/2026`);
  `formatDateTimeBR('2026-10-21 01:30:00')` = `20/10/2026 22:30`; o histórico de edições; e o formulário da proposta às 22h30 de 20/10 ao
  marcar *Aprovada* manda `data_fechamento: '2026-10-20'`. Molde: `Notificacoes.test.js`, `Atividades.filtroTodos.test.js`.
- [x] **T3 (integração — cruza a régua nova do servidor com o que grava; mora no arquivo da T1):** — `5cdaec48`. a proposta gerada pela geração automática
  (validade HOJE+15) aparece na previsão (depois de `enviada` por fora) com `dias_restantes 15` e probabilidade **50** (a gravada — Fase 2
  M5); a aprovada pelo `/aceitar` grava `data_fechamento` HOJE; o lembrete gravado pelo `PUT` (o formulário) em HOJE aparece no sino como
  `hoje`, nas Atividades como `alta` e no painel como vencido — os três lidos pela rota, **sem atalho** (cada asserção na fonte dela).

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. Coluna só de data: **nunca** o modificador; o hoje entra como `?`.
3. O `hoje` lido **uma vez** por chamada.
4. O `created_at` da massa é gravado por fora, com o instante escolhido (o `CURRENT_TIMESTAMP` do SQLite é o relógio real, não o adiantado).
5. A previsão tem `LIMIT 20`: a massa tem menos de 20 propostas `enviada` com validade (com guarda).
6. O `/pdf` abre o Chrome (o `filaPdf`); a data da capa se lê no `html_rendered` gravado depois (`index.js:9757`).
7. Nenhuma porta de permissão muda; nenhum valor gravado antes muda.
8. A revisão obrigatória da proposta (23 + editor 39) é critério: o `/premium` e o `/pdf` mudam (a conta da emissão).

## Fora desta etapa (declarado)

- **C413 (novo)** — as janelas e os agrupamentos por mês dos relatórios do Comercial sobre o instante de criação, ainda no UTC
  (`/api/relatorios/executivo` `:6690`/`:6758`, `/api/relatorios/visitas-tecnicas` `:7050`, `/api/dashboard/historico` `:17163`), e os atalhos de
  período do painel (`Dashboard.js:21-41`, o fim no dia UTC).
- **C414 (novo)** — código morto com a véspera: `Propostas.js` (sem rota), `components/PropostaForm.js` de nível de cima (sem import),
  `utils/gerarPDFProposta.js` do navegador (ninguém importa), o template V1 `gerarHTMLPropostaPremium` (ninguém chama). Não mexido — se algum
  for religado, trocar antes a leitura da data.
- **C415 (novo, Fase 2 M4)** — o marcador `{{proposal.date}}` (`propostaCompositionEngine.js:65`) reparseia a emissão `DD/MM/AAAA` com
  `new Date`: `20/10/2026` → *Invalid Date*, `05/10/2026` → `10/05/2026`. Nenhum texto padrão o usa; só cláusula escrita à mão. De antes.
- **Declarados sem mudança:** a ordem do sino (sem efeito visível — M2); *hoje* × *vencido* entre as telas (produto — M9); o viés de −0,5
  dia do tempo médio de fechamento (M10).
- Tudo o que depende do P.O. (a lista do fim do plano da 164, inclusive **C408**, **C411**, **C412** e o `mes` fora de 1–12).

## Execução — o que divergiu do plano

- **Reproduzido antes do conserto:** o teste novo do servidor contra o `index.js` de `3731b0e1`: **10 de 14** cenários caem (os 4 verdes: os
  dois unitários do `diaLocal` — a função é nova e roda no próprio processo —, a guarda e a massa). Depois do conserto: 14/14.
- **Os parâmetros nomeados (`$hoje`) não funcionam nesta base:** a primeira versão do sino e da previsão usou `{ $hoje }` e as duas consultas
  voltaram vazias (o invólucro do banco passa os parâmetros como lista). Trocado por `?` posicional com o `hoje` lido uma vez numa variável.
- **O retrato do `/pdf` é gravado depois da resposta** (`index.js`, "Snapshot") — o teste espera por ele (*polling*); a primeira rodada leu
  `null`.
- **Controle positivo da T1 (`scratchpad/e165/sabota.js`, `sabota-t1.txt`):** 24 sabotagens — o `toISOString`/o `date('now')`/o modificador na
  coluna por régua, a janela, o `<` × `<=`, o texto × `julianday`, o `date()` dos dias, o instante de agora, as três datas de fechamento, a
  geração automática (o hoje, o teto, a borda do teto), a atividade de aprovação, a conta antiga nas duas rotas do documento e o
  `dataDoBancoBR` (o prefixo UTC, o instante lido como local, a data impossível) — **24/24 caíram pela asserção do cenário delas**, md5
  restaurado.
- **Controle positivo da T2 (`sabota-cli.js`, `sabota-t2.txt`):** 17 sabotagens, **16 caíram**; a que sobrevive (tirar a partição *vencidos
  primeiro* do `ordenarAtividades`) é **equivalente** à ordem pela data (vencido ⇔ data antes de hoje) — declarado no teste.
- **Paralelismo 0** (a T2 era galho, mas o condutor fez em sequência). **Testes antigos mudados: 2** (`listasNotificacoesPortao` `:262`,
  `:277`, `:499`; `putParcialMantem` `:266`, `:286`, `:462` — o dia UTC deixou de ser o do servidor; a Fase 0 os nomeou, a Fase 2 achou a
  `:499`).

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (regra) — 0 Critical/Important; 3 Minor, todos reproduzidos e corrigidos (`4155d11d`).** (M1) o lembrete ou a validade **com hora**
  gravados pela API (`'2026-11-30 01:00:00'`): o servidor lê o prefixo (o dia 30), a tela nova lia como instante UTC (29/11) — *"0 dias
  restantes"* e *"Validade: 29/11"* no mesmo card; antes da etapa a tela mostrava o dia certo (regressão de tela). `lerDataDoBanco` ganhou
  `soData` nas colunas só de data. (M2) o `dataDoBancoBR` recusava o instante sem segundos e com fração (a capa saía *—*). (M3) o corte de 1900
  pelo ano UTC. **Sem defeito:** a ordem dos `?` nos três ramos das Atividades, as bordas às 22h do último dia do mês, a previsão (hora, Z,
  bissexto, impossível), o `somarDiasISO`, o documento (só a emissão e a `dataValidade` não impressa mudaram), as réguas UTC restantes = as da
  C413.
- **r2 (autorização) — 0 achados.** 144 células (6 perfis × as rotas tocadas), HEAD × `3731b0e1`, em duas rodadas (o relógio às 22h e o real):
  **0 divergências de código**; o conjunto de donos visíveis em cada lista idêntico; os 4 corpos diferentes na rodada de controle são a
  previsão com a proposta que vale até hoje (a B1055). Nenhum valor do usuário interpolado; as linhas `app.*(` idênticas. De antes (não
  mudou): qualquer um que passa pelo portão do Comercial lê os lembretes de todos com `?todos=true`; a previsão não tem recorte por usuário.
- **r3 (sabotagem, worktree própria `CRM-wt-e165-r3`) — 25 sabotagens novas: 8 caíram, 17 sobreviveram** (16 faltas de asserção, 1
  equivalente — o CASE do `ORDER BY` do sino, monotônico na data como a partição das Atividades). As 16: a ordem do sino (R02/R02b), o
  lembrete com hora (R04), **as Atividades com `?responsavel_id=`** (R05 — o filtro da tela; o bind do ramo não tinha teste), a probabilidade 0
  (R09), `validade_dias` 7.5 e "10 dias" (R12), as bordas do `somarDiasISO`/`dataDoBancoBR` (R14, R15, R16, R23), a migração aceita→aprovada
  (R17 — nenhum teste a exercitava), o rótulo do mês que chega ao gráfico (K01 — o teste provava a função, não a tela), o histórico de
  edições ilegível (K03 — a tela caía), Rejeitada no formulário (K04), o instante sem segundos na tela (K05), o detalhe da proposta (K13 —
  nenhuma tela que usa o `formatDateTimeBR` era renderizada), o ano de dois dígitos (K20).
- **Correção da Fase 5 (`4155d11d`):** o `soData`, o `dataDoBancoBR` (M2/M3) e as asserções das 16. **Controles:** o script do r3 reaplicado
  contra os testes novos — **11/11** sobreviventes do servidor caem (R24 segue equivalente); no cliente, as 17 do condutor com as âncoras novas,
  as 5 do `soData` e as 6 do r3: **26/28 caem** (a C03 segue equivalente; a C22, tirar o `soData` de **um** lado da comparação,
  sobrevive porque o outro lado ainda o lê — a sabotagem dos **dois** lados cai); M2 e M3 sabotados caem.

## Suítes (lidas na saída, `scratchpad/e165/`)

- **Base (antes de qualquer código, `base-api.log`):** `test:api` **485/485**.
- **Bateria 1 — antes de `5cdaec48`/`0431c949` (`b1-*.log`):** `test:api` **486/486** arquivos (`lembretesEValidadeDasPropostasNoDiaLocal`
  **14/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **167** suítes / **2108** testes;
  `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor
  **39/39**.
- **Bateria 2 — antes de `4155d11d` (`b2-*.log`; é também a do fechamento: depois só mudaram documentos):** `test:api` **486/486** arquivos
  (`lembretesEValidadeDasPropostasNoDiaLocal` **25/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0,
  16/0**; client **167** suítes / **2112** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com
  saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **39/39**.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (o `soData`, o `dataDoBancoBR` e as asserções). As tasks ficaram verdes na primeira
   aplicação depois de dois tropeços de harness (os parâmetros nomeados, o retrato gravado depois da resposta). **Testes antigos mudados: 2.**
2. **Achados da revisão:** Fase 2 — **0 Critical + 8 Important + 14 Minor**, todos reais (o mais caro: o formulário preenchia a data de
   fechamento com o dia UTC — o padrão do servidor nunca rodava no gesto principal; e o teste de ordem das Atividades proposto não sabia
   falhar). Fase 5 — r1 **3** reais (uma regressão de tela com dado da API); r2 **0**; r3 **16** faltas de asserção reais + 1 equivalente;
   **0** ruído. **O que mais pesou:** de novo **o chamador sem prova** (o rótulo do mês provado na função, não na tela; o `formatDateTimeBR`
   sem tela renderizada; o ramo `responsavel_id` dos binds) — a família do "atalho" das 163/164.
3. **Paralelismo:** **0** galhos de código em paralelo; **1** revisor na Fase 2, **3** em paralelo na Fase 5 (o r3 na worktree própria, 25
   sabotagens) — **0** incidente de trava, **0** retrabalho.
4. **Defeito que escapou:** *(preenchido na Etapa 166)* **nenhum no código da 165** — as três revisões da 166 não acharam defeito nas réguas,
   nas datas gravadas nem na emissão. **Um no documento:** a **C413** que esta etapa registrou estava **incompleta** — nomeava os atalhos de
   período do painel, mas não o filtro *De*/*Até* do servidor (`filtroDashboardSql`), que também comparava com o dia universal; consertar só
   os atalhos faria a proposta das 22h de hoje sumir do *Este mês* (a Fase 0 da 166 achou; a C413 foi corrigida dizendo que estava
   incompleta).

## Próxima tarefa detalhada — Etapa 166

*(A série desta etapa foi B1054–B1059, C410 resolvido, C413, C414 e C415 novos, nenhuma A — a 166 começa em **B1060**, **C416**, **A104**;
confira com `grep -oE` antes.)*

**Escolhida: o dia de Brasília nas janelas por mês dos relatórios do Comercial (C413) e o marcador da data no texto da proposta (C415).**
Medido nesta etapa (não a fundo): `GET /api/relatorios/executivo` (`index.js` ~`:6690`, a evolução de 6 meses `created_at >= date('now',
'-6 months')` agrupada por `strftime('%Y-%m', created_at)`; ~`:6758`, os clientes sem proposta há 90 dias `date(ultima_proposta) <
date('now', '-90 days')`); `GET /api/relatorios/visitas-tecnicas` (~`:7050`, as propostas dos últimos 90 dias); `GET /api/dashboard/historico`
(~`:17146`, 12 meses agrupados por mês, que o *Tendências Mensais* do painel mostra); e os atalhos de período do `Dashboard.js:21-41` (o fim
pelo dia UTC). `created_at` é **instante** (`CURRENT_TIMESTAMP`): a régua é `date(created_at, ?)`/`strftime('%Y-%m', created_at, ?)` com
`diaLocal.modificadorDoFuso()` e o início da janela pelo `diaLocal.hojeLocalISO()` (+ `date(?, '-6 months')`). **Medir antes:** quem lê cada
número (o *Relatório Executivo*, as *Visitas Técnicas*, o painel), os testes que dependem do mês UTC (os da 153 de portão leem essas rotas —
`paineisBuscaGlobalPortao`), e o que muda nos gráficos (a proposta criada às 22h do último dia do mês muda de barra). **C415:** o
`substituirPlaceholdersProposta`/`propostaCompositionEngine.js:65` relê a `dataEmissao` `'DD/MM/AAAA'` com `new Date` — medir quem usa o
marcador (nenhum texto padrão; só cláusula do usuário) e passar a data já formatada; é o documento → a revisão obrigatória (23 + editor 39) é
critério e a mudança do texto impresso vai para a letra B. **Teste:** o molde desta (`lembretesEValidadeDasPropostasNoDiaLocal` — filho em
TZ=UTC com o relógio nas 22h de Brasília do último dia do mês seguinte ao mês UTC real, pulando dezembro; massa por fora com `created_at`
escolhido; **um registro por borda** nas réguas que agregam — `COUNT`/`SUM` por mês —, valores diferentes entre as bordas; o chamador provado
pela rota/tela, **não só a função** — a lição desta etapa). **Pontos de atenção:** (1) a trava de máquina; (2) parâmetro posicional (`?`) —
os nomeados não funcionam nesta base; (3) nenhuma porta de permissão muda (o portão das 153); (4) a revisão obrigatória da proposta se mexer
no C415.

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
como nulo (é régua de presença); da 164, marcar as contas vencidas na lista do Financeiro (**C411** — o status *vencido* que ninguém grava), as revisões
antigas que continuam alertando em Frotas (**C412** — qual revisão vale), e validar o `mes` fora de 1–12 do painel do Financeiro com 400
(muda o contrato); **desta etapa**, congelar a data de emissão das propostas já enviadas (**B1057** — exige guardar a emissão), imprimir a
validade no documento, unificar *hoje* × *vencido* do lembrete entre o painel, o sino e as Atividades (Fase 2 M9) e recusar com 400 o
`validade_dias` fora de faixa (recusa nova). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `diaLocal.js` (`hojeLocalISO`, `inicioDoMesLocalISO`, `inicioDoPeriodoLocalISO`,
`modificadorDoFuso`, `instanteDoBancoNoFuso`, `somarDiasISO`, `dataDoBancoBR`) e o `dataLocal.js` do navegador (`lerDataDoBanco` com
`soData`, `formatarDataDoBanco`, `lerInstanteDoBanco`); o `formatDateTimeBR` (o instante do banco como UTC); as réguas dos lembretes, da
previsão, das datas gravadas e da emissão (`5cdaec48`, `0431c949`, `4155d11d`).
