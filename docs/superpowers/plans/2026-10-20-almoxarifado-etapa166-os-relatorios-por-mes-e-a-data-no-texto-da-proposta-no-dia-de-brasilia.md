# Etapa 166 (Comercial): os relatórios por mês, o filtro de período do painel e a data no texto da proposta no dia de Brasília (C413, C415) — plano

> Origem: "Próxima tarefa detalhada — Etapa 166" do plano da 165
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa165-os-lembretes-e-a-validade-das-propostas-no-dia-de-brasilia.md`). Etapa de
> consertos técnicos fora do Almoxarifado; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1059**, último C **C415**,
> última A **A103**. Esta etapa: **B1060+**, **C416+**, **A104+**. Worktree `CRM-wt-e166`, branch `etapa-e166` (da main `ddfae1ce`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 4 Important, 5 Minor — todos aceitos; o plano abaixo já está
> corrigido** (`scratchpad/e166/f2-relatorio.md`). **I1** a conta dos `?`: a evolução e as tendências têm **3** (`[mod, mod, hoje]` — o
> `strftime` do SELECT e o `date` do WHERE); com 2, o node-sqlite3 liga NULL no terceiro e o gráfico sai **vazio em silêncio** (sondado);
> nas tendências os três `CASE strftime(created_at) = strftime(created_at)` (C417) ficam **intocados**. **I2** a asserção do avançado por
> `propostasPorEstado` não sabia falhar (sem o modificador, E1 sai e F1 entra: 2 de novo) — passa a `topClientesPorValor` de A = 1007
> (sabotado: 10). **I3** bomba-relógio: quando o mês UTC real é fevereiro, abril ou setembro, o SQLite normaliza `date(HOJE, '-6 months')`
> para o dia 1º e o E4/E5 caem no mês anterior — as asserções passam a ser **somas sobre todas as linhas** e **nenhuma linha antes do mês
> de I6/I12**. **I4** o editor congela o marcador: o preview recebe a cláusula já resolvida e o *Salvar* seguinte grava a data literal no
> `conteudo` (`PropostaPreviewEditavel.js:1273-1325`, `clausulasInlineEditor.js:60,176`) — de antes; o B1063 restringe a promessa da
> reimpressão, vira **C418** e a **A104** mede em produção. **Minor:** são **10** consultas no filtro (2 + 8), não 11 (M5); o `created_at`
> ilegível muda de lado (M6 — declarado); o nome do PNG do `ModalGrafico.js:379,444` (M7 — entra na T2, com guarda no fonte do nome do
> PDF); o `filtroDashboard.test.js` fora dos `npm run` entra na bateria com controle positivo (M8); a T1 antes da T2 (M9).

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor). Base `test:api` rodada antes de qualquer código (`scratchpad/e166/base-api.log`). O processo
de produção roda com `TZ=America/Sao_Paulo` (`Dockerfile:47`). O `date('now')` do SQLite é o dia **UTC** em qualquer `TZ`; o `created_at`
das tabelas é **instante** (`DATETIME DEFAULT CURRENT_TIMESTAMP` — `'AAAA-MM-DD HH:MM:SS'` em UTC, sem fuso). `date(created_at)` e
`strftime('%Y-%m', created_at)` dão o dia/mês **UTC**: das 21h à meia-noite de Brasília, o de amanhã — e, no último dia do mês, o **mês
seguinte**. A ferramenta já existe: `diaLocal.modificadorDoFuso()` (`'-180 minutes'`) para coluna de instante e `diaLocal.hojeLocalISO()`
para o hoje (161–165).

**Servidor (`server/index.js`) — quem lê e o que muda:**

| Rota | Linha | Régua | Quem lê | Efeito hoje |
|---|---|---|---|---|
| `GET /api/relatorios/executivo` — *Evolução de Propostas (Últimos 6 Meses)* | `:6684-6696` | `WHERE created_at >= date('now', '-6 months')` (texto contra texto) e `GROUP BY strftime('%Y-%m', created_at)` | o gráfico de barras+linha dos *Relatórios* (`Relatorios.js:727`, eixo = o `mes` cru `AAAA-MM`), o modal do gráfico e a tabela do PDF exportado (`Relatorios.js:313`) | a proposta criada das 21h à meia-noite do último dia do mês conta no **mês seguinte**; a borda da janela é o dia UTC de 6 meses atrás (a proposta das 21h da véspera da borda entra) |
| idem — *Clientes que Precisam de Visita* | `:6746-6764` | `date(MAX(p.created_at)) < date('now', '-90 days')` | a tabela dos *Relatórios* (`Relatorios.js:917`), o PDF (`:332`) e a recomendação *"Clientes que Precisam de Visita"* (`gerarRecomendacoes`, `:7155`) | o cliente cuja última proposta foi criada às 22h do dia D−91 (= D−90 em UTC) **não** entra (o certo: entra); das 21h à meia-noite de hoje, a borda anda um dia |
| `GET /api/relatorios/visitas-tecnicas` — *atividade recente* | `:7050` | `p.created_at >= date('now', '-90 days')` (texto contra texto) | `propostas_ultimos_90_dias` → a regra **opcional** *"Cliente teve propostas nos últimos 90 dias"* (`:7097-7103`) → a pontuação → a **prioridade** (*Alta*/*Média*/*Baixa*) e a ordem dos elegíveis | a proposta das 22h do dia D−91 conta como recente (o certo: não); das 21h, a borda anda um dia |
| `GET /api/dashboard/historico` — *Tendências Mensais* | `:17131-17150` | `WHERE created_at >= date('now', '-12 months')` e `GROUP BY strftime('%Y-%m', created_at)` sobre a união de clientes, projetos e propostas | o gráfico do painel (`Dashboard.js:182`, `:208-213`: `name` = `rotuloDoMesDoHistorico`, `receita` = `propostas_aprovadas`) | o mesmo deslocamento de mês; a borda de 12 meses |
| `filtroDashboardSql` (o *Filtros* → *De*/*Até* do painel) | `:550-563` | `date(created_at) >= 'inicio'` / `<= 'fim'` (inline, validado `AAAA-MM-DD`) | **10** consultas — 2 de `GET /api/dashboard` (`:17095`, `:17100`) e 8 de `GET /api/dashboard/avancado` (`:17188`–`:17313`) (Fase 2 M5): os cartões e gráficos do painel | o filtro é escrito pelo usuário em **dias de Brasília**; a proposta criada às 22h do dia `fim` **fica fora** (o dia UTC é o seguinte) e a das 22h da véspera do `inicio` **entra** |
| `prepareCompositionData` — o marcador `{{proposal.date}}` (C415) | `propostaCompositionEngine.js:65-70` | `new Date(totais.dataEmissao \|\| proposta.created_at).toLocaleDateString('pt-BR')` | o texto de qualquer cláusula/campo do documento que use `{{proposal.date}}` (`substituirPlaceholdersProposta` roda sobre o HTML inteiro do V2 no `/premium` e no `/pdf`, `propostaPremiumV2.js:2640`) | a `dataEmissao` já chega `DD/MM/AAAA` (B1057); o `new Date` a lê como `MM/DD/AAAA`: **dia ≤ 12 troca dia e mês** (`05/11/2026` → `11/05/2026`), **dia > 12 sai *"Invalid Date"*** (`20/10/2026`); com a emissão vazia cai no `created_at` lido como hora local (o dia seguinte das 21h) |

**Quem usa o marcador:** nenhum texto padrão (`grep "{{"` em `clausulasDefault.js`, no template e nas telas: zero); documentado como marcador
disponível em `docs/MODULO_PROPOSTA_TECNICA_COMERCIAL.md:131` (*"data emissão"*). Só cláusula escrita à mão (o editor grava pelo
`POST /api/propostas/:id/clausulas`, `:6227`). O `composeBlocks` do motor não tem chamador. Defeito **de antes** da 165 (a emissão já era
`DD/MM/AAAA` por `toLocaleDateString`).

**Navegador:**

| Onde | Linha | O que mostra | Efeito |
|---|---|---|---|
| `Dashboard.js` atalhos *Este mês* / *Últimos 3 meses* / *Este ano* | `:28-50` | preenchem *De*/*Até*; o `fim` = `new Date().toISOString()` (o dia **UTC**) | das 21h à meia-noite o *Até* sai **amanhã** (e, no último dia do mês, o dia 1º do mês seguinte). O `inicio` (`new Date(a, m, 1)` = meia-noite local → `toISOString` = 03:00 UTC do mesmo dia) está **certo** no fuso de Brasília |
| `Relatorios.js` *Última Proposta* (tabela e PDF) | `:338-340`, `:922-924` | `new Date('AAAA-MM-DD HH:MM:SS').toLocaleDateString` — o instante UTC lido como hora **local** | a proposta criada das 21h à meia-noite mostra o **dia seguinte**; o valor ilegível mostra *"Invalid Date"* |
| `Relatorios.js` nome do arquivo do PDF | `:562` | `Relatorios_GMP_<toISOString>` | das 21h, o dia de amanhã no nome |
| `ModalGrafico.js` nome do PNG (*Baixar* do modal de gráfico — aberto pela *Evolução* dos Relatórios e pelo painel) | `:379`, `:444` | `<titulo>_<toISOString>.png` | idem (Fase 2 M7) |

**Medido e não mexido (vira C):**
- `GET /api/custos-viagens/verificar-elegibilidade/:cliente_id` (`:16018-16022`) — *Atividade Recente* = `new Date(MAX(created_at))` (o
  instante UTC lido como hora **local** no `TZ=America/Sao_Paulo` de produção: 3 h depois do real) e `Math.floor((agora − isso) / 1 dia) <= 90`.
  É duração em períodos de 24 h, não dia de calendário: com a leitura certa, a borda anda 3 h. **C416.**
- `GET /api/dashboard/historico` — `clientes` e `projetos` são `COUNT(DISTINCT id)` sobre a **união** das três tabelas (o `CASE` compara o
  mês consigo mesmo — sempre verdadeiro): as duas colunas dão o mesmo número, a soma de linhas das três tabelas com os ids coincidentes
  contados uma vez; e o painel chama de `receita` a **contagem** de propostas aprovadas. De antes, não é régua de data. **C417.**
- O início de cada janela é o **mesmo dia** de 6/12 meses atrás (`date(hoje, '-6 months')`), não o dia 1º: a primeira barra é parcial — de
  antes, mantido.
- Fora do Comercial: o *Dashboard MES* (`:21842`+) — código morto (C403).

**Portas de saldo, trava e permissão:** nenhuma. O portão das rotas (`exigirComercialNasPropostas`, 153) não muda.

**Os testes antigos que leem estas rotas:** `paineisBuscaGlobalPortao.api.test.js:184-192` (o portão: `historico` com
`propostas_aprovadas >= 1`, o `executivo` pelos KPIs, as `visitas` pela forma) — propostas criadas **agora** (real), dentro de toda janela
nos dois jeitos; não mudam. `coordenadasPrazo.api.test.js:305` — as visitas pela forma; não muda. `tests/filtroDashboard.test.js` (fora dos
`npm run`) carrega o corpo da `filtroDashboardSql` com `new Function` e confere a string — muda junto (a função passa a usar `diaLocal`).

## Decisões (letra B — reversíveis)

- **B1060 — os relatórios por mês do Comercial no calendário de Brasília (o Relatório Executivo, as Visitas Técnicas e as Tendências
  Mensais do painel).** Coluna de instante: `date(created_at, ?)` / `strftime('%Y-%m', created_at, ?)` com `diaLocal.modificadorDoFuso()`;
  o início da janela = `date(?, '-6 months')` / `'-12 months'` / `'-90 days'` com o `diaLocal.hojeLocalISO()`, os dois como **parâmetro**
  (`?` posicional), lidos **uma vez** por consulta. **Muda (das 21h à meia-noite e nas bordas):** a proposta criada das 21h à meia-noite do
  último dia do mês passa a contar no mês em que foi criada (antes, no seguinte) na *Evolução de Propostas* e nas *Tendências Mensais*; a
  janela começa no dia de Brasília de 6/12 meses atrás (a proposta das 21h da véspera da borda sai); o cliente cuja última proposta é das
  22h do dia D−91 entra em *Clientes que Precisam de Visita* e perde a *atividade recente* nas *Visitas Técnicas* (o que pode baixar a
  prioridade dele de *Alta* para *Média*, ou de *Média* para *Baixa*). **Descartado:** comparar por texto (`created_at >= ?` — o instante
  das 22h da véspera, `'…D 01:30:00' >= 'D'`, continuaria entrando); o início no dia 1º do mês (muda a janela — produto).
- **B1061 — o filtro de período do painel (*De*/*Até* e os atalhos) no dia de Brasília.** A `filtroDashboardSql` compara
  `date(created_at, '<modificador>')` com o `inicio`/`fim` (o modificador é gerado pelo servidor — `'-180 minutes'`, de um número
  arredondado —, interpolado como o resto da função, que monta SQL inline por desenho: as 10 consultas passam `[]`); os atalhos
  preenchem *Até* com o hoje local e *De* com o dia 1º local (`dataLocal.hojeLocalISO`). **Muda (das 21h à meia-noite):** o atalho mostra
  *Até* = hoje (antes, amanhã); a proposta criada às 22h do dia *Até* entra no painel filtrado e a das 22h da véspera do *De* sai. **No
  fuso de Brasília o *De* dos atalhos não muda** (a conta antiga já dava o dia certo — a troca é de régua única; a sabotagem dele é
  equivalente neste fuso, declarado). **Descartado:** só os atalhos (com o *Até* = hoje e o servidor no dia UTC, a proposta das 22h de hoje
  **sumiria** do *Este mês* — regressão); passar o filtro a parâmetro (`?`) nas 10 consultas (a validação `AAAA-MM-DD` já segura; mexer
  nos 10 chamadores é risco sem ganho).
- **B1062 — a *Última Proposta* dos *Relatórios* (tabela e PDF) no dia de Brasília, e o nome do arquivo do PDF com o dia local.**
  `formatarDataDoBanco` (o instante do banco como UTC → o dia local; vazio → *Nunca* como antes; ilegível → `-`, antes *"Invalid Date"*).
  **Muda (das 21h à meia-noite):** a proposta criada nessa faixa mostra o dia em que foi criada (antes, o seguinte). Os nomes dos arquivos
  baixados (o PDF dos *Relatórios* e o PNG do modal de gráfico, `ModalGrafico.js:379,444` — Fase 2 M7) levam o dia local (antes, das 21h,
  o de amanhã).
- **B1063 — o marcador `{{proposal.date}}` no texto da proposta = a Data de Emissão da capa, como está (C415). MUDA O TEXTO IMPRESSO.**
  `displayFields.proposal.date` = a `totais.dataEmissao` quando já é `DD/MM/AAAA` (o que o `/premium` e o `/pdf` mandam, B1057), sem
  reparsear; senão (vazia ou em outro formato) o `diaLocal.dataDoBancoBR` dela, e depois o do `created_at`; nada legível → `''` (o marcador
  some do texto, como o resto dos marcadores vazios). **Muda:** na cláusula escrita com o marcador, a data da proposta criada nos dias 1–12
  deixa de sair com dia e mês trocados (`11/05/2026` → `05/11/2026`), a dos dias 13–31 deixa de sair *"Invalid Date"*, e a data passa a
  ser **a mesma da capa** — **também na reimpressão** de proposta antiga (o PDF é sempre regerado) **cuja cláusula ainda guarda o marcador**.
  **Não conserta** a cláusula que já foi re-salva pelo preview editável depois de o marcador aparecer: o editor recebe o texto resolvido e o
  *Salvar* grava a data literal (*Invalid Date* ou o dia/mês trocado) no lugar do marcador (Fase 2 I4 — de antes, **C418**; a **A104**
  conta essas cláusulas em produção). Nenhum texto padrão usa o marcador.
  **Descartado:** formatar de novo a partir do `created_at` sempre (duas contas para a mesma data — a capa e o texto poderiam divergir).
- **B1064 — a próxima etapa (167).**

## Regras de negócio

- **RN-166.01 (B1060)** — *Evolução de Propostas*: propostas ativas com `date(created_at, mod) >= date(hoje, '-6 months')`, agrupadas pelo
  mês de Brasília (`strftime('%Y-%m', created_at, mod)`), `total` = contagem, `valor_aprovado` = soma do `valor_total` das aprovadas.
- **RN-166.02 (B1060)** — *Clientes que Precisam de Visita*: clientes ativos sem proposta ativa, ou com `date(MAX(created_at), mod) <
  date(hoje, '-90 days')`; ordem e `LIMIT 20` como antes.
- **RN-166.03 (B1060)** — *Visitas Técnicas*: `propostas_ultimos_90_dias` = propostas ativas do cliente com `date(created_at, mod) >=
  date(hoje, '-90 days')`; a regra *atividade recente* passa quando > 0 (o resto da pontuação como antes).
- **RN-166.04 (B1060)** — *Tendências Mensais*: a união (clientes, projetos, propostas ativas) com `date(created_at, mod) >= date(hoje,
  '-12 months')`, agrupada pelo mês de Brasília; `propostas_aprovadas` = as aprovadas do mês (as colunas `clientes`/`projetos` como antes —
  C417).
- **RN-166.05 (B1061)** — filtro do painel: `date(created_at, mod) >= inicio` e `<= fim`; os atalhos: *Este mês* = dia 1º do mês local até
  hoje local, *Últimos 3 meses* = dia 1º de dois meses antes até hoje, *Este ano* = 1º de janeiro até hoje (todos no dia local).
- **RN-166.06 (B1062)** — *Última Proposta*: o dia de Brasília do instante; sem proposta = *Nunca*; ilegível = `-`.
- **RN-166.07 (B1063)** — `{{proposal.date}}` = a emissão `DD/MM/AAAA` como está; senão `dataDoBancoBR(emissão)` ou
  `dataDoBancoBR(created_at)`; senão `''`.

## Contratos (congelados)

- **`GET /api/relatorios/executivo`**, **`GET /api/relatorios/visitas-tecnicas`**, **`GET /api/dashboard/historico`**, **`GET
  /api/dashboard`**, **`GET /api/dashboard/avancado`** — mesmas formas, códigos e campos (o `mes` continua `AAAA-MM`); os valores pelas
  RN-166.01 a .05. Nenhuma recusa nova; `inicio`/`fim` fora de `AAAA-MM-DD` continuam **ignorados** (sem 400). O `created_at` NULL fica
  fora como antes; o ISO com `Z` é lido certo; o `created_at` **ilegível** muda de lado (antes `'lixo' >= '2026-…'` era verdadeiro — uma
  linha `mes` nula na evolução e a proposta contada como recente; agora `date('lixo', mod)` é nulo e ela sai — Fase 2 M6, declarado).
- **`GET /api/propostas/:id/premium`**, **`GET /api/propostas/:id/pdf`** — o mesmo documento; o texto do marcador pela RN-166.07.
- **Servidor:** `prepareCompositionData(proposta, itens, totais)` — `displayFields.proposal.date` pela RN-166.07 (o resto igual).
  `filtroDashboardSql(req, alias)` — a mesma assinatura; a string ganha o modificador.
- **Navegador:** `ATALHOS_PERIODO[i].intervalo()` → `{ inicio, fim }` no dia local.

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor) — as réguas (RN-166.01 a .05) e o marcador (RN-166.07).** `index.js` e `propostaCompositionEngine.js`.
  Teste novo `server/tests/api/relatoriosPorMesDoComercialNoDiaLocal.api.test.js` pelo `index.js` real em pasta vazia (o molde da 165:
  filho com `TZ=UTC` e `relogioAdiantado` nas **22h de Brasília do último dia do mês seguinte ao mês UTC real**, pulando dezembro; HOJE
  (Brasília), HOJE+1 (o dia UTC do JS, e o 1º do mês seguinte) e o `date('now')` do SQLite (o real, semanas antes) são três dias
  diferentes; guarda independente do código). Massa por fora (`sqlite3` no arquivo do filho), com `created_at` escolhido, **um registro por
  borda**, valores diferentes entre as bordas. Com `I6 = date(HOJE, '-6 months')`, `I12 = date(HOJE, '-12 months')`, `I90 = date(HOJE,
  '-90 days')` (calculados pelo SQLite no teste) e `brt(dia, hh, mm)` = o instante UTC das hh:mm de Brasília:

  | Registro | `created_at` (Brasília) | status, valor | Prova |
  |---|---|---|---|
  | E1 (cliente A) | HOJE 22:30 | aprovada, 1000 | evolução e tendências no mês de HOJE (sem `mod` no `strftime` → mês seguinte); filtro `fim = HOJE` entra |
  | E2 (A) | HOJE 12:00 | enviada, 7 | o mês de HOJE (controle) |
  | F1 (A) | HOJE−1 22:30 | rejeitada, 3 | filtro `inicio = HOJE` **sai** (sem `mod` → entra) |
  | G1 (A) | dia 05 do mês de HOJE, 22:30 | rascunho, 1 | o marcador com dia ≤ 12 (troca dia/mês) |
  | E3 (A) | I6 00:30 | aprovada, 300 | entra na evolução (borda de dentro) |
  | E4 (A) | I6−1 22:30 | aprovada, 50 | **sai** da evolução (texto contra texto, ou sem `mod` → entra) |
  | E5 (A) | I6−10 12:00 | aprovada, 20 | sai da evolução (com o `date('now')` real → entra) |
  | H3 (A) | I12 00:30 | aprovada, 1 | entra nas tendências |
  | H4 (A) | I12−1 22:30 | aprovada, 1 | **sai** das tendências (sem `date(col, mod)` → entra) |
  | H5 (A) | I12−10 12:00 | aprovada, 1 | sai (com o `date('now')` real → entra) |
  | V1 (cliente V1) | I90−1 22:30 | enviada | *visitar*: **entra** (sem `mod` → sai); *recente*: 0 (texto/sem `mod` → 1) |
  | V2 (V2) | I90 12:00 | enviada | *visitar*: sai (`<` × `<=`; com o hoje UTC → entra); *recente*: 1 (com o hoje UTC → 0) |
  | V3 (V3) | I90−1 12:00 | enviada | *visitar*: entra (com o `date('now')` real → sai); *recente*: 0 (com o real → 1) |
  | V0 (V0) | — (sem proposta) | — | *visitar*: entra (o `IS NULL`) |

  Asserções: evolução `[mês de I6] = {total 1, valor_aprovado 300}`, `[mês de HOJE] = {total 4, valor_aprovado 1000}`, **nenhuma** linha do
  mês de HOJE+1, **nenhuma** antes do mês de I6, e as somas sobre todas as linhas `SUM(total)` = 8 (E1, E2, F1, G1, E3, V1, V2, V3) e
  `SUM(valor_aprovado)` = 1300 (Fase 2 I3 — sabem falhar mesmo quando o I6 cai no dia 1º); tendências `propostas_aprovadas` `[mês de I12] =
  1`, `[mês de HOJE] = 1`, sem o mês de HOJE+1, nenhuma antes do mês de I12, `SUM(propostas_aprovadas)` = 5 (E1, E3, E4, E5, H3); *visitar* = {V0, V1, V3}
  (sem V2 e sem A); *visitas técnicas* `propostas_ultimos_90_dias` V1 0, V2 1, V3 0, A 4 e a regra *atividade recente* de cada um; painel
  `?inicio=HOJE&fim=HOJE`: `propostasPorStatus` = aprovada 1, enviada 1, sem rejeitada; `valorTotalPropostasAprovadas` 1000; o
  `/dashboard/avancado` com o mesmo filtro: `topClientesPorValor` de A = `{ total_propostas 2, valor_total 1007 }` (sem o modificador no ramo
  com alias: E2+F1 = 10 — Fase 2 I2; o `propostasPorEstado` daria 2 nos dois jeitos). Guardas: menos de 20 clientes ativos (o `LIMIT 20`).
  **C415:** no próprio processo do teste (`TZ=America/Sao_Paulo`, guarda), o `prepareCompositionData`: `'20/10/2026'` → igual,
  `'05/11/2026'` → igual, `''` + `created_at '2026-12-01 01:00:00'` → `'30/11/2026'` (a leitura local daria 01/12), `totais` ausente →
  pelo `created_at`, emissão `'2026-11-05'` → `'05/11/2026'`, tudo ilegível → `''`; e pela rota: uma cláusula escrita pelo
  `POST /api/propostas/:id/clausulas` com `{{proposal.date}}` em E1 e em G1 → o `/premium` traz `BR(HOJE)` (e não *Invalid Date*) e
  `05/<mês>/<ano>` (e não `<mês>/05`) no texto, **igual** à *Data de Emissão* da capa do mesmo HTML. `tests/filtroDashboard.test.js` passa
  a injetar o `diaLocal` no `new Function` e a esperar o modificador; entra na bateria (`node tests/filtroDashboard.test.js` — fora dos
  `npm run`, Fase 2 M8) com controle positivo.
- [ ] **T2 (galho, navegador) — os atalhos (RN-166.05) e a *Última Proposta* (RN-166.06).** `Dashboard.js` (`ATALHOS_PERIODO` com
  `hojeLocalISO`), `Relatorios.js` (`formatarDataDoBanco` nas duas *Última Proposta*; o nome do arquivo com `hojeLocalISO`), `ModalGrafico.js` (o nome do PNG
  com `hojeLocalISO`, Fase 2 M7). **Só entra depois da T1** (Fase 2 M9: o *Até* = hoje com o servidor no dia UTC é a regressão que o B1061
  descarta). Teste novo
  `client/src/components/relatoriosDoComercialNoDiaLocal.test.js` no fuso do `jest.globalSetup.js` com a guarda; o relógio às 22h30 do
  último dia do mês (`31/10/2026`, o `Date` sobrescrito como no teste da 165): clicar *Este mês* no painel → a chamada `api.get('/dashboard',
  { params })` seguinte leva `inicio: '2026-10-01', fim: '2026-10-31'` (antes `fim: '2026-11-01'`), *Últimos 3 meses* `inicio:
  '2026-08-01'`, *Este ano* `inicio: '2026-01-01'`, e os dois campos *De*/*Até* mostram esses valores; os *Relatórios* renderizados com
  `clientesParaVisitar` `[{ ultima_proposta: '2026-11-01 01:30:00' }, { ultima_proposta: null }, { ultima_proposta: 'lixo' }]` mostram
  `31/10/2026`, *Nunca* e `-`. O PDF dos *Relatórios* (jsPDF) **não** é exercitado — a mesma função nas duas células (guarda no fonte: o
  `toLocaleDateString` sobre `ultima_proposta` não volta, e nenhum `toISOString` no `Relatorios.js` nem no `ModalGrafico.js` — os nomes dos
  arquivos). Molde: `datasDoComercialNoDiaLocal.test.js`.
- [ ] **T3 (integração — cruza as réguas novas; mora no arquivo da T1):** o **mesmo** E1 (criado às 22h30 de HOJE) é lido no mês de HOJE pela
  evolução do Relatório Executivo, pelas Tendências Mensais e pelo painel filtrado em HOJE; e o `/premium` dele imprime a mesma data na
  capa e no texto da cláusula escrita pela rota — cada asserção na fonte dela, sem atalho.

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. Coluna de instante → `date(col, ?)` com o modificador; o hoje entra como `?` **posicional** (os nomeados não funcionam nesta base).
3. O modificador e o hoje são lidos **uma vez** por consulta; conferir a **ordem** e a **conta** dos `?` (Fase 2 I1): a evolução
   `[mod, mod, hoje]`, o *visitar* `[mod, hoje]`, as visitas `[mod, hoje]`, as tendências `[mod, mod, hoje]` — só na coluna `mes` e no
   WHERE; os três `CASE` das tendências ficam como estão (C417). `?` a menos não dá erro: liga NULL e a consulta volta vazia.
4. A `filtroDashboardSql` é interpolada **por desenho** (as 10 consultas passam `[]`): o modificador vem do servidor, não do usuário.
5. O `created_at` da massa é gravado por fora (o `CURRENT_TIMESTAMP` do SQLite é o relógio real, não o adiantado). Os clientes criados
   pelo teste têm `created_at` real (o mês real, que nenhuma asserção lê).
6. A revisão obrigatória da proposta (23 + editor 39) é critério: o motor do marcador muda (`propostaCompositionEngine.js`), o template e a
   paginação não.
7. Nenhuma porta de permissão muda; nenhum valor gravado muda (só leitura e exibição).

## Fora desta etapa (declarado)

- **C416 (novo)** — a *Atividade Recente* da elegibilidade de viagem (`/api/custos-viagens/verificar-elegibilidade`) lê o instante como hora
  local (3 h de borda) e conta períodos de 24 h, não dias de calendário.
- **C418 (novo, Fase 2 I4)** — o preview editável congela o marcador: recebe a cláusula com o `{{proposal.date}}` já resolvido e o *Salvar*
  seguinte grava a data literal no `conteudo` (de antes). A **A104** conta as cláusulas afetadas em produção.
- **C417 (novo)** — as colunas `clientes`/`projetos` das *Tendências Mensais* contam ids misturados das três tabelas (o mesmo número nas
  duas), e o painel chama de *receita* a contagem de aprovadas.
- Tudo o que depende do P.O. (a lista do fim do plano da 165).
