# Etapa 181 — O relatório "EPI por colaborador" lê as entregas de EPI, e os dois relatórios de pessoa ficam restritos

> **Status:** ✅ **fechada (2026-10-22)** — T1 `3ce1d3a2`, revisão adversarial (Fase 5) `0e6d5b37`, `71418065`, `e104df3c`, e o
> fechamento. Emendada da "próxima tarefa detalhada" da Etapa 180 (e B1177). **Próxima: Etapa 182** — ver o fim deste plano.
> **Fase 0 (medido):**
> - `epi-colaborador` (`reportService.js:561-566`, registro `reportRegistry.js:487-502`) lê **empréstimos de ferramenta
>   `tipo='EPI'` em aberto** — não as entregas de EPI da 178 (`entregas_epi_almoxarifado`). `acao: null` (qualquer
>   usuário do módulo), sem parâmetros, `nota: null`.
> - `ferramentas-emprestadas` (`reportRegistry.js:469-486`) também `acao: null`, enquanto `GET /emprestimos` exige
>   `gerenciar_ferramentas` desde a 180 (B1177).
> - O dispatcher aplica a permissão pelo campo `acao` do registro (`extended.js:2555`, `:2581`, `:2594`); a lista some
>   para quem não pode, sem mudança no client.
> - O plano da 180 dizia "quem entregou (`criado_por_nome`)" e filtros `data_inicio/data_fim` — **errado**: a coluna da
>   entrega é `entregue_por_nome` e o filtro de `listarEntregas` é `de`/`ate`.
> - A varredura `relatoriosRegistro.api.test.js` [revisao I1] exige que cada coluna exista no SQL e cada parâmetro mude o
>   SQL.
> - Banco local: 0 ferramentas, 0 empréstimos (o legado `tipo='EPI'` não foi medido em produção).

## Regras

| ID | Regra |
|---|---|
| RN-181.01 | `epi-colaborador` passa a ler `entregas_epi_almoxarifado`: colunas `criado_em` ("Entregue em", dia de Brasília como os outros relatórios), `numero`, `colaborador_nome`, `matricula`, `setor`, `material_codigo`, `material_nome` ("EPI"), `ca_numero`, `ca_validade`, `quantidade`, `motivo`, `entregue_por_nome` ("Entregue por"), `tem_evidencia` ("Assinatura", `EXISTS` na evidência `ENTREGA_EPI` — **sem** recalcular hash por linha: a verificação continua na tela de EPI). Mais recentes primeiro. |
| RN-181.02 | Parâmetros: `colaborador_id`, `material_id`, `de`, `ate` (os nomes que o SQL lê; `de`/`ate` no dia de Brasília como `listarEntregas`). Cada um muda o SQL (varredura I1). |
| RN-181.03 | `epi-colaborador` com `acao: 'entregar_epi'`; `ferramentas-emprestadas` com `acao: 'gerenciar_ferramentas'`. PRODUCAO não vê nenhum dos dois na lista e recebe 403 na consulta e na exportação. |
| RN-181.04 | `nota` do `epi-colaborador`: diz que a fonte são as entregas com assinatura (a partir da entrega de EPI pela tela), que a integridade se confere na tela de EPI, e que **empréstimos de ferramenta cadastrada como EPI não entram mais aqui** (continuam em "Ferramentas emprestadas"). Letra B: o legado sai deste relatório (descartado: juntar as duas fontes — misturaria entrega com assinatura e empréstimo sem). |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | `reportService`/`reportRegistry` (RN-01..04) + testes: colunas e ordem, cada filtro (com controle de que muda o resultado), `tem_evidencia` 1/0, 403 e lista sem os dois relatórios para PRODUCAO, exportação com as colunas, a varredura I1 verde. Front: só conferir que a tela genérica mostra os parâmetros (tipo do campo — select de colaborador/EPI se o registro suportar `select` com opções do servidor; senão `numero`), teste Jest se mudar algo. | tronco |

## Execução

- [x] **T1** — RN-181.01..04 com as emendas C1, C2, I1, I2, I3 e os menores. Commit: `3ce1d3a2`.
  - `reportService.relatorioEPIPorColaborador(db, filtros)` com SELECT próprio sobre `entregas_epi_almoxarifado`:
    `strftime('%Y-%m-%d %H:%M:%S', e.criado_em) AS criado_em` (C1), `motivo` por CASE (`Primeira entrega`/`Troca`/`Perda`/`Dano`),
    `tamanho`, `tem_evidencia` `'Sim'`/`'Não'` por `EXISTS` na evidência `ENTREGA_EPI` (C2), mais recentes primeiro.
  - Helper compartilhado: `epiService.filtroDasEntregas(filtros)` → `{ where, params }` (colaborador_id, material_id, de/ate no
    dia de Brasília, mesma regex) — `listarEntregas` passou a usá-lo sem mudar comportamento (os `epi*` ficaram verdes sem mudar
    asserção). `reportService` faz `require` tardio de `epiService`.
  - Registro: `epi-colaborador` com `acao: 'entregar_epi'`, nota (RN-04), 14 colunas, params `colaborador_id` (select,
    `opcoes_url: '/almoxarifado/aux/colaboradores'`), `material_id` (number), `de`/`ate` (date), todos com `exemplo`;
    `ferramentas-emprestadas` com `acao: 'gerenciar_ferramentas'`.
  - Testes: `server/tests/api/relatorioEpiPorColaborador.api.test.js` (11) e um teste Jest novo em
    `RelatoriosAlmoxarifado.test.js` (nota, select carregado da rota aux, consulta com o id, célula de data). Client sem mudança
    de código.
  - Controles positivos (restauro por cópia + `cmp`): sem `strftime` → C1 e exportação vermelhos; evidência sempre `Sim` → C2 e
    exportação; ORDER BY ASC → ordem e filtro de colaborador; fuso `0 minutes` no helper → de/ate; `ferramentas-emprestadas`
    `acao: null` → registro e PRODUCAO; param renomeado / coluna renomeada no registro → varredura I1 vermelha; Jest: ISO cru no
    payload → célula vermelha, `opcoes_url` errada → select vermelho.
  - **Divergências do plano:** (1) a entrega sem evidência foi semeada por `INSERT` direto em `entregas_epi_almoxarifado` sem
    evidência — não precisou contornar trigger (os da 178 barram só UPDATE/DELETE); (2) a data na tela é conferida no Jest pela
    mesma conversão que a tela usa (fuso do processo), não pelo literal `21/10` — o teste antigo de data faz igual; o literal
    `2026-10-21 22:30:00` é conferido no servidor (consulta via `instanteDoBancoNoFuso` e linha da planilha); (3) `tamanho` entrou
    depois de `quantidade`; rótulo do material `EPI (id do material)`.
    (4) `relatoriosJornada.api.test.js` mudou de assercao (era o unico vermelho da 1a rodada, 517/518): o GESTOR via as 26
    chaves e PRODUCAO 22; agora GESTOR ve 24 (nao tem `entregar_epi` nem `gerenciar_ferramentas` — coerente com a tela de EPI
    e `GET /emprestimos`, que ja lhe negavam) e PRODUCAO 20. Mudanca de contrato intencional da RN-181.03, nao regressao.
  - Suites (2026-10-22, uma por vez): `test:api` 518/518; `test:almoxarifado` 44/0; validation 4/0; safealter 3/0;
    sqlite 16/0; Jest 180 suites / 2355 testes verdes; `CI=true build` compilado sem warning.

## Fase 5 — revisão adversarial (2026-10-22) — 2 importantes e 1 menor, todos corrigidos

A revisão olhou além do relatório: **por onde mais** o dado de pessoa que a 181 fechou no relatório continuava saindo.

- [x] **I1 — quem recebeu qual EPI vazava pelo histórico de movimentações.** `epiService.registrarEntrega` gravava na SAÍDA a
  justificativa `Entrega de EPI a <nome> (<matrícula>)`, e a justificativa sai para qualquer usuário do módulo em **sete** portas:
  `GET /movimentacoes`, `GET /materiais/:id/historico`, `GET /dashboard` (`ultimasMovimentacoes`), `GET /relatorio/movimentacoes-periodo`
  (as quatro em `routes/almoxarifado.js`), `GET /materiais/:id/extrato` e o dispatcher de relatórios (`historico-movimentacoes`, `acao: null`)
  com a exportação (as três em `extended.js`). A Auditoria também a guarda, mas é `configurar` (só Administrador) — fora. Correção
  (reversível, **B1185**): (a) a escrita futura é `Entrega de EPI <numero>`; (b) as linhas antigas **não** são reescritas — a máscara é na
  leitura, `services/almoxarifado/mascaraEntregaEpi.js` (`mascararMovimentacoes(linhas, user)`): sem `entregar_epi`, a justificativa que casa
  `^Entrega de EPI a [\s\S]+$` vira `Entrega de EPI (dados do colaborador restritos)`. No dispatcher vale para **todo** relatório (um futuro
  que devolva a justificativa já nasce coberto). **Conferido antes:** a justificativa **não** entra no HMAC — `camposDoRegistro` leva só o
  `movimentacao_id` —, então mudar a escrita não mexe na verificação da cadeia (os `epi*` ficaram verdes; `epiEntrega` mudou só a asserção do
  texto). Commit `0e6d5b37`. Teste novo `historicoEntregaEpiMascara.api.test.js` (7): a escrita nova; a linha antiga intacta no banco;
  PRODUCAO e GESTOR veem a máscara nas sete portas, a saída comum (`Entrega de EPI conforme OS 12`, não casa a régua) e a nova intactas;
  a exportação mascarada; ALMOXARIFE e ADMIN veem o texto original nas sete e na exportação. **Controles positivos** (cópia + `cmp`): helper
  desligado → os três `[b]` de PRODUCAO/GESTOR/exportação vermelhos; `can(user, 'visualizar')` → os mesmos; régua larga `/^Entrega de EPI/`
  → vermelho na asserção da saída comum; escrita antiga → `[a]`; e **cada uma das sete portas desembrulhada uma a uma** → vermelho nomeando a
  porta (`GET /dashboard (ultimas)`, `GET /movimentacoes`, `GET /materiais/:id/historico`, `GET /relatorio/movimentacoes-periodo`,
  `GET /materiais/:id/extrato`, `relatorio historico-movimentacoes`; a da exportação derruba só o teste da exportação).
- [x] **I2 — `GET /ferramentas` (só `auth`) devolvia `emprestimo_aberto.colaborador_nome`** a qualquer usuário — o dado que
  `GET /emprestimos` (180) e `ferramentas-emprestadas` (181) restringem. Correção na rota (`extended.js`, **B1186**): sem
  `gerenciar_ferramentas`, o `emprestimo_aberto` sai por **lista branca** `{ id, data_prevista_devolucao }` (o `status` da ferramenta continua
  `EMPRESTADA`; hoje o SELECT do serviço só traz `id`, `colaborador_nome`, `data_prevista_devolucao` — não há `colaborador_id` nem `setor` a
  tirar, a lista branca impede que um campo novo vaze). Front: `FerramentasAlmoxarifado.js` já só mostrava *"com <nome>"* quando o nome vinha
  — sem mudança de código. Commit `71418065`. Testes: `ferramentasListaSemColaborador.api.test.js` (4) e um Jest novo (a linha mostra
  *"Emprestada"*, sem *"com …"* nem *"undefined"*). **Controles:** gate sempre verdadeiro, `visualizar` e o nome na lista branca → PRODUCAO/
  GESTOR vermelhos no `deepStrictEqual`; gate sempre falso → ALMOXARIFE/ADMIN vermelhos; front com a condição só pelo empréstimo → o Jest cai
  em `not /com /` (*"Paquímetro digitalcom Emprestada…"*).
- [x] **M3 — nada provava que a coluna Assinatura filtra a evidência pelo contexto.** Cenário novo em `relatorioEpiPorColaborador`: evidência
  `TERMO_FERRAMENTA` com `contexto_id` = id da entrega sem assinatura → continua *"Não"*, e a da rota continua *"Sim"* (metade positiva).
  Controle: sem `v.contexto = 'ENTREGA_EPI'` → o cenário novo e a linha da exportação vermelhos. Commit `e104df3c`.

**Divergência:** a correção do I1 pediu "as duas portas"; a varredura achou **sete** (mais o extrato, o histórico e o painel do material e o
relatório por período da v1). Todas cobertas e sabotadas uma a uma.

## Verificação final (2026-10-22, uma suíte por vez)

Depois dos três commits da Fase 5 (`e104df3c`), lidos da saída: `test:api` **520/520** arquivos (eram 518; +2 arquivos novos);
`test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**; client
**180 suítes / 2356 testes** verdes (eram 2355; +1 da lista de ferramentas); `CI=true build` **Compiled successfully** (a única linha
"warning" é a deprecação do Node, não do CRA). `git status`: só os documentos deste fechamento.

## Retrospectiva

- O relatório era a porta **nomeada**; o dado de pessoa saía por mais **oito** (sete do histórico, uma da lista de ferramentas). Fechar um
  relatório sem procurar onde mais o mesmo dado sai é meia correção — a busca certa foi pelo **campo** (`justificativa`, `colaborador_nome`),
  não pelo nome da tela.
- Antes de mudar a escrita, conferir se o texto entra num hash: aqui não entrava (`camposDoRegistro`), e por isso a escrita futura pôde mudar;
  se entrasse, a correção seria só a máscara.
- Sabotagem por porta com `perl` e contador de ocorrência (`++$i == K`) — uma `grep -cF` de âncora multilinha conta linhas, não ocorrências
  (deu 5126 e abortou, como deve).

## Próxima tarefa detalhada — Etapa 182: o alerta "material separado aguardando retirada há N dias" (feature 20, com a 05)

**Por que esta.** Pelo mapa, as 🟡 que **não** dependem de resposta da empresa: 16 (ferramentas), 20 (alertas, uma lacuna), 21 (previsto ×
realizado — depende da 22), 22 (Engenharia/BOM e Produção/OP — grandes), 05, 06, 01, 23. **Medido na Fase 0 desta escolha:**
- A **16** dizia faltar *"o lembrete de devolução com canal (feature 20)"* — **está errado**: o job diário existe desde a Etapa 12
  (`notificationQueueService.varrerLembretesFerramenta`, chamado em `routes/almoxarifado.js:~5116`, e-mail pela fila, dedupe por empréstimo +
  dia de Brasília desde a 163) e a spec 20 o marca pago (`837faec`). A spec 16 foi corrigida **neste fechamento** (topo e checklist), dizendo
  que estava errada; o que sobra para a 16 é a integração com a inspeção (**B1146** pergunta à empresa — fica de fora).
- A **20** tem duas lacunas: *consumo acima do previsto* (depende da 22) e **material separado aguardando retirada há N dias** — a única que
  não depende de ninguém. É dor de galpão: a caixa separada ocupa a área de expedição e segura reserva enquanto ninguém busca.

**O que falta (medido):** não há **data da transição** para `PRONTA_PARA_RETIRADA`. Ela é gravada só por
`PUT /requisicoes/:id/liberar-retirada` (`routes/almoxarifado.js:~4560`, o UPDATE em `:~4609`, `UPDATE ... SET status='PRONTA_PARA_RETIRADA', updated_at=...`, dentro
de `travaPorRequisicao.serializarNaRequisicao`) e volta para `EM_SEPARACAO` em `requisitionService.js:~2424` (B504, a caixa mudou). `updated_at`
**não** serve (qualquer gravação o mexe). A auditoria `LIBERACAO_RETIRADA` existe mas é **best-effort** (pode faltar).

**Contrato proposto:**
- Coluna `requisicoes_almoxarifado.pronta_para_retirada_em` (`safeAlter`, ALTER no callback do CREATE — padrão do primeiro boot): gravada no
  mesmo `UPDATE` da liberação (`CURRENT_TIMESTAMP`) e **zerada** no `UPDATE` do B504 (volta a EM_SEPARACAO) — senão a requisição reliberada
  herda a idade antiga. Linhas antigas `NULL`: fallback lido da auditoria `LIBERACAO_RETIRADA` mais recente; sem ela, fora do alerta (letra B —
  descartado: usar `updated_at`).
- Entrada nova em `alertRegistry.js` (molde `RESERVA_PARADA`, `:~564`): `chave: 'SEPARADO_AGUARDANDO_RETIRADA'`, `configDias:
  { chave: 'alerta_retirada_parada_dias', default: 3 }` (default **deduzido** — letra E), `listar` com `status = 'PRONTA_PARA_RETIRADA'` e
  `julianday('now') - julianday(pronta_para_retirada_em) > ?`, `dedupeChave: retirada-parada-<id>-<pronta_para_retirada_em>` (reliberar
  avisa de novo), payload `{ requisicao_id }`, corpo com número, solicitante, OS, dias. A central de alertas e a varredura diária leem o registro
  — sem rota nova. O dia de Brasília onde a régua comparar dia (163).
- Tela de Configurações: o campo de dias **não** sai do registro — é uma linha na lista de `ConfiguracoesAlmoxarifado.js:~3561` (molde `alerta_reserva_parada_dias`) e o seed da config no servidor; teste Jest do campo.

**Pontos de atenção:** (1) a liberação está sob a trava por requisição — gravar a coluna no **mesmo** UPDATE, não num segundo; (2) o B504
volta a EM_SEPARACAO sem passar pela rota — esquecer de zerar ali faz o alerta mentir; (3) a entrega parcial a partir de PRONTA vai para
`PARCIALMENTE_ATENDIDA` (sai do alerta — conferir se é o desejado: o resto da caixa continua lá; letra B); (4) a spec 20 (checklist, linha
"Material separado aguardando retirada") e a 05 recebem a entrega. **Testes:** a idade pela coluna, o B504
zerando, reliberar com dedupe novo, a linha antiga com/sem auditoria, a configuração de dias, e controle positivo em cada um.

---

## Revisão da Fase 2 (2026-10-22) — 2 críticos, 3 importantes, 5 menores; as emendas PREVALECEM

- **C1 — data:** `criado_em` da entrega é ISO UTC do Node (`2026-10-22T01:30:00.000Z`); os formatadores da tela
  (`RelatoriosAlmoxarifado.js:78-85`) e do Excel (`diaLocal.js:59-61`) só reconhecem `AAAA-MM-DD HH:MM:SS`. No SQL:
  `strftime('%Y-%m-%d %H:%M:%S', e.criado_em) AS criado_em` → a tela e a exportação mostram Brasília. Teste na linha
  exportada (22h30 de 21/10 → 21/10).
- **C2 — `tem_evidencia`:** `CASE WHEN EXISTS(...) THEN 'Sim' ELSE 'Não' END`. A nota diz que toda entrega pela tela
  grava a evidência na mesma transação — "Não" só aparece em anomalia (e a tela de EPI verifica a cadeia).
- **I1 — SELECT próprio** do relatório (o `COLUNAS_LISTA` não tem `setor` nem evidência), com o filtro `de`/`ate` extraído
  para um helper compartilhado com `listarEntregas` (mesma regex e `DATE(e.criado_em, ?)` do dia de Brasília).
- **I2 — tipos concretos dos params:** `colaborador_id` → `select` com `opcoes_url: '/almoxarifado/aux/colaboradores'`,
  `exemplo: 1` (lista só os ativos — quem saiu não é filtrável; letra B); `material_id` → `number`, `exemplo: 1`
  (a lista de materiais não filtra EPI — letra B); `de`/`ate` → `date`.
- **I3 —** `exemplo` declarado em todo param (a varredura I1 manda `'x'` sem ele).
- **Menores:** `motivo` com rótulo por CASE (`Primeira entrega`, `Troca`, `Perda`, `Dano`); `tamanho` entra nas colunas;
  testes positivos de ALMOXARIFE ao lado dos 403 de PRODUCAO (consulta **e** exportação, nos dois relatórios); a `nota`
  conferida no Jest (`nota-relatorio`).
