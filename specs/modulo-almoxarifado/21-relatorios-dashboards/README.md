# 21 — Relatórios, Dashboards e Indicadores

> **+ Etapa 181 (2026-10-22, T1 `3ce1d3a2`, Fase 5 `0e6d5b37`, `e104df3c`): o *EPI por colaborador* lê as entregas de EPI (feature 25) e ele e o *Ferramentas emprestadas* ficam restritos (`entregar_epi` / `gerenciar_ferramentas` — o GESTOR passa de 26 para 24 relatórios, a PRODUCAO de 22 para 20); o dispatcher e a exportação mascaram a justificativa antiga da entrega de EPI para quem não tem `entregar_epi`** — ver a seção "Etapa 181", no fim; o status não muda (falta para 🟢 continua só previsto × realizado).

> **+ Etapa 174 (2026-10-22, `97d3012f`, Fase 5 `9d1fcd1d`, `aa053fa8`): o *Consumo por OS* ganha Devolvido e Líquido e passa a contar as entregas de requisição; o quadro do painel ignora linhas só de devolução** — ver a seção "Etapa 174", no fim; o status não muda.

> **+ Etapa 162 (2026-10-20, `e2d2306c`, Fase 5 `e1ac2cfa`): os nove relatórios, o painel e o indicador *no prazo* no dia de Brasília, a planilha na hora de Brasília (C401 resolvido, B1033, B1037, B1039)** — ver a seção "Etapa 162", no fim.

> **+ Etapa 160 (2026-10-19, `eaf682e9`, Fase 5 `ff3e7d78`): no *Histórico de movimentações*, o usuário sem caixa (com o escape de antes) e o tipo aparado e em maiúsculas; a nota diz a regra nova (C393, B1020)** — ver a seção "Etapa 160", no fim; o status não muda.

> **Status:** 🟡→quase-🟢 — **Etapa 129 (2026-10-16, `b1f1e64f`, Fase 5 `bce8f530`): as perdas com valor** — chave `perdas-por-motivo` (PERDA e PERDA_TERCEIRO não estornadas, por tipo e motivo, valor pelo custo atual, gate `gerenciar_reposicao`). **Falta para 🟢:** previsto × realizado (depende da 22) — o único item aberto. · Antes: **Etapa 128 (2026-10-16, `37aa1228`, Fase 5 `41255477`): o tempo médio de recebimento** — bloco `tempo_recebimento` no `indicadores` (média, mediana, considerados, incompletos; da chegada à última entrada no estoque, só o que entrou inteiro, janela pelo fim, `null` sem dados) e o quinto cartão no dashboard; a régua é **deduzida** (letra E2 das novidades). **Falta para 🟢:** previsto × realizado (depende da 22) e as perdas com valor (candidata da 129). · Antes: **Etapa 67 (2026-10-01, `22c6e57..80bad3b`): os indicadores que faltavam da spec 27** — % de requisições no prazo e integrais (blocos novos do `indicadores` + cartão "Requisições no prazo" no dashboard + campo "Data de necessidade" na criação, que nenhuma tela gravava), nº de ajustes (bloco + chave `ajustes-por-motivo`), divergência e rejeição por fornecedor (chave `qualidade-fornecedores`, com a coluna "Agrupado por"); o tempo de atendimento deixou de contar requisição excluída (C89). O registro tem **25** chaves. **Falta para 🟢:** previsto × realizado / consumo não previsto por projeto (depende da 22) — o único item da spec 27 ainda aberto, e bloqueado; o tempo médio de recebimento continua candidato (ver o item). · Antes: **Etapa 49 (2026-09-30, `492b14f..` fechamento): os relatórios de SALDO que faltavam** — saldo por lote (atribuído + "Sem lote atribuído", que fecha com o físico), séries em estoque, saldos comprometidos, e o histórico de movimentações por grupo, usuário e centro de custo. Com isso **todos os itens de "Relatórios de estoque" e "Relatórios de movimentação" estão pagos** (cinco deles já estavam cobertos por chaves existentes — ver o checklist). **Falta para 🟢:** previsto × realizado (depende da 22) e os indicadores restantes da spec 27 (cada um com a feature dona); o **saldo por endereço** ficou fora de propósito (ver o item). · **Etapa 13 entregue (2026-08-24, `4fdda54..8bb5e52`)**: tela de relatórios dirigida por registro único com gate declarado por chave, exportação XLSX, indicadores gerenciais e cartões no dashboard. · **Spec original:** seção 27
>
> **CORREÇÃO DE FATO (regra 5), Etapa 49:** o item do Levantamento dizia "**são 18**" chaves no
> registro — **estava errado**: eram **19** (a `custo-por-projeto`, `reportRegistry.js:416`, entrou na
> Etapa 14 e esta spec não foi reaberta). Com a Etapa 49 são **22**. Com a **Etapa 52** são **23** (`localizacoes-vazias`, Relatórios → Estoque — a lista de localizações vazias pela regra do mapa; ver spec 02).
>
> **CORREÇÕES DE FATO (regra 5 — o texto abaixo afirmava e ESTAVA ERRADO):** este arquivo
> dizia "**15** tipos no mapa" e "eram 16" — no início da Etapa 13 eram **17** (medido), e com
> `indicadores` são **18**. E o cabeçalho dizia "só **2** consumidos no front" — eram **3**
> (o dashboard consome consumo-os e materiais-mais-consumidos; a tela de Reposição consome o
> gated solicitacoes-compra).
> **Última atualização:** 2026-10-16 (**Etapa 128** — o tempo médio de recebimento; ver o status e a seção no fim). *Esta linha tinha parado em 2026-08-13; as etapas seguintes estão no status e nas seções.*
> *Antes:* 2026-08-13 — **a valoração dos relatórios estava errada e foi corrigida**
> (tarefa extra da Etapa 8c, ver "Valoração do estoque" abaixo). O resto da linha de 2026-08-11
> segue valendo: eram 15 tipos, a Etapa 2 acrescentou `materiais-sem-endereco` (16), e "só 2
> consumidos no front" continua verdade.
>
> **Etapa 122 (2026-10-16):** o *Qualidade por fornecedor* dá o recebimento como conferido pela coluna `conferencia_finalizada_em` (antes, pela existência da trilha `FINALIZAR_CONFERENCIA`, que pode faltar desde a 121 — C255b, B788). Status inalterado.

## Objetivo

Tela de relatórios completa (estoque, movimentações, gestão) + indicadores gerenciais, com exportação.

## O que já existe

- `reportService.js` + `GET /relatorios/:tipo` (`extended.js`, **15** tipos no mapa `reports` do dispatcher). Nem todos vêm do `reportService`: `materiais-sem-endereco` (acrescentado na Etapa 2) é servido por SQL inline no próprio dispatcher, e há tipo servido por `scrapService`. **Eram 16:** o tipo `materiais-cliente` era servido pelo `clientMaterialService`, removido com a ilha na Etapa 8, Task 7 — o tipo responde **404** até a Task 8 recriar a chave sobre `clienteEstoqueService.posicaoPorCliente`.
- Relatórios v1: posição de estoque, movimentações por período (rotas `/relatorio/*` em `routes/almoxarifado.js`).
- Dashboard com KPIs + consumo por OS + materiais mais consumidos (`AlmoxarifadoDashboard.js`).
- Referência de UI: telas `/frota/relatorios` e `/fabrica/relatorios` já existem em outros módulos (seguir o padrão).
- Infra de exportação: `xlsx` e `pdfkit`/`puppeteer` já no projeto.

### Valoração do estoque — fonte única (corrigido em 2026-08-13, tarefa extra da Etapa 8c)

**A afirmação anterior desta spec era que a valoração "existe"; ela existia e estava ERRADA.**
`materiais_almoxarifado.custo_medio` é `REAL DEFAULT 0` — **zero, não NULL** — e o cadastro de
material grava só `custo_unitario`. Como `COALESCE` devolve o primeiro **não-nulo**,
`COALESCE(custo_medio, custo_unitario, 0)` devolvia **0** e nunca chegava em `custo_unitario`:
**todo material cujo custo só foi digitado no cadastro (o acervo inteiro anterior à Etapa 8c, que é
quando o recebimento por NF passou a alimentar custo médio) era valorado a ZERO.** Sonda executada
no banco de teste, `custo_unitario = 10` e `custo_medio = 0`: a fórmula antiga lê `0`, a do motor lê
`10`.

A mesma pergunta ("quanto vale uma unidade?") estava respondida em **8 lugares com 3 fórmulas
diferentes** — a do motor, a que zerava, e `custo_unitario` puro (dashboard e
`GET /relatorio/posicao-estoque`, que não zeravam mas ignoravam a média ponderada e por isso
divergiam do relatório gêmeo `relatorios/estoque-atual`).

Hoje há **uma** fonte: `services/almoxarifado/custoSql.js` (`custoUnitarioSql` / `valorEstoqueSql`),
no mesmo desenho de `availabilitySql.js`. Regra: **nenhuma query nova escreve a leitura do custo à
mão** — `tests/api/custoUnitarioFonteUnica.api.test.js` varre o código-fonte e falha se alguém
replicar, com controle positivo do próprio padrão de busca.

> **Consequência visível:** o `valorTotalEstoque` do dashboard **mudou de número** para material que
> já recebeu NF com custo diferente do cadastro — ele passou a valorar pela média ponderada, igual
> ao relatório de posição. Para material sem custo médio (a maioria hoje) o número não muda.

## Checklist

### Levantamento (fazer primeiro)
- [x] Listar os tipos do mapa `reports` e casar com a spec 27 — `781c784` (**são 18** — *dizia 18; **estava errado**: eram **19** desde a Etapa 14; **22** na Etapa 49; **agora 23**, Etapa 52 (`localizacoes-vazias`)* —, todos no
  `reportRegistry.js` com titulo/categoria/gate/params/colunas/limite/nota declarados por
  chave; a validação de subida derruba o processo se dispatcher e registro divergirem). **Etapa 67: 25 chaves**
  (`ajustes-por-motivo`, `2ee2f86`; `qualidade-fornecedores`, `1bfe89b`).

### Relatórios de estoque (spec 27)
- [x] Saldo por item — coberto pela chave **`estoque-atual`** (existente, `781c784`). **Por localização / almoxarifado: FORA, de propósito.** Saldo segregado por almoxarifado não se propõe (almoxarifado é área física, não filial — CLAUDE.md); um relatório de **onde está fisicamente** precisaria de saldo por endereço confiável, e a Fase 0 da Etapa 49 não mediu se `estoque_saldo_almoxarifado.localizacao_id` é mantido em toda movimentação (letra D da 49). O endereço **padrão** do material já sai em `materiais-sem-endereco` (o inverso).
- [x] Saldo por lote / número de série — chaves **`saldo-por-lote`** e **`series-em-estoque`** (Etapa 49, `c71cb87`; Fase 5 `5eeed45`). ⚠️ **O saldo de lote é o ATRIBUÍDO, não o físico:** as saídas sem lote (entrega de requisição) e o ajuste de saldo total gravam na linha sem lote; o relatório mostra a linha **"Sem lote atribuído"** (pode ser negativa) para a conta fechar com o físico. A Fase 2 da 49 **derrubou a primeira versão desta RN por sonda** (entrada de 100 no lote A, entrega de 30 sem lote → lote "com 100", material com 70). **Etapa 50 (`1f335b4`) corrigiu um defeito que ESCAPOU da 49 aqui:** o relatório agrupava por `l.id`, e uma linha de saldo de OUTRO material apontando para um lote somava no lote errado (X mostrava LX com 17 e "Sem lote atribuído" −7; Y sumia). Agora `GROUP BY s.material_id, l.id`; o "nunca teve lote" passou a exigir lote EXISTENTE (JOIN lotes), e a conta do resíduo é `lotService.residualSemLote`, a mesma da tela de Lotes.
- [x] Saldo por cliente — coberto pela chave **`materiais-cliente`** ("Posição por cliente", existente, `6e97715`). **Por projeto:** coberto em parte — custo e reserva por projeto/OS (`custo-por-projeto`, `reservado-os`); saldo **físico** por projeto não existe porque o saldo é por material, não por projeto.
- [x] Saldo reservado / bloqueado / em quarentena / em terceiros — chave **`saldos-comprometidos`** (Etapa 49, `c71cb87`), montada de `COLUNAS_RETENCAO` + `disponivelSql`; o teste do registro exige `colunas ⊇ COLUNAS_RETENCAO` (uma retenção nova sem coluna toma vermelho). `materiais-bloqueados` continua existindo.
- [x] Estoque disponível — coberto pela chave **`estoque-atual`**, coluna `disponivel` (existente, `0a01124`, fórmula única `disponivelSql`).

### Relatórios de movimentação
- [x] Entradas/saídas por período · transferências · devoluções · ajustes — **`historico-movimentacoes`** com o parâmetro novo **`grupo`** (Etapa 49, `c71cb87`). *Antes desta etapa o item estava "parcial" e a Fase 0 o marcou "coberto" — **errado**: o filtro `tipo` é exato sobre texto livre (entradas são 8 tipos); a Fase 2 derrubou.* Os grupos se sobrepõem (AJUSTE_POSITIVO em ENTRADA e AJUSTE) — declarado na nota.
- [x] Por usuário / por centro de custo — parâmetros **`usuario`** e **`centro_custo_id`** + colunas no **`historico-movimentacoes`** (Etapa 49, `c71cb87`). A rota `GET /movimentacoes` já filtrava os dois; faltava no relatório (tela/XLSX). **Por projeto:** `consumo-periodo` (param `projeto_id`) e `custo-por-projeto`.
- [x] Histórico completo do item — a cobertura **completa** é **`GET /api/almoxarifado/movimentacoes?material_id=`** (`routes/almoxarifado.js:920`, sem teto e com os cancelados, tela Movimentações). O relatório `historico-movimentacoes` filtrado por material corta em 500 e esconde cancelados — é o recorte exportável, não o histórico completo.

### Gestão e indicadores — ver a seção "entregue na Etapa 13" abaixo para o estado atual
- [x] Acuracidade — já era da 10b (rota própria, gate `inventario`) · giro/cobertura/rupturas — Etapa 13, ver abaixo
- [x] Materiais parados / obsoletos — já era da Etapa 11 (aba Estoque Parado)
- [x] Valor total do estoque / por grupo — quebra **por grupo** entregue na Etapa 13 (`4f8e3fc`); a valorização **por cliente** continua fora (letra B — valorar patrimônio alheio é decisão de negócio)
- [ ] Consumo por projeto, previsto × realizado (feature 22)
- [x] Tempo médio de atendimento de requisição — Etapa 13 (entrega completa, todo o histórico); **Etapa 67 (`9126d88`): requisição excluída fica fora** (C89 — a exclusão desfaz as entregas e deixava `data_entrega`; o tempo médio contava entrega desfeita). **De recebimento** continua fora — *este item dizia "nenhum timestamp de ciclo de recebimento confiável foi levantado"; **estava errado** desde a Etapa 6: cada item do recebimento guarda `entrada_estoque_em` (a hora da entrada no estoque). Não entrou na 67 porque a confiabilidade precisa de medição própria (o claim volta a NULL se a entrada falhar) e o indicador não está nos "Indicadores principais" — candidato.*
- [x] Indicadores da spec 27 restantes: % requisições no prazo/integrais, divergência e rejeição por fornecedor, nº de ajustes — **Etapa 67** (**valor de sucata já existia**, relatório sucata-financeiro, Etapa 9):
  - **% no prazo e % integrais** — blocos `requisicoes_no_prazo` e `requisicoes_integrais` do `indicadores` (`9126d88`), cartão **"Requisições no prazo"** no dashboard (`e3ed85d`), campo **"Data de necessidade"** na criação (`81e35fd`) e o formato `AAAA-MM-DD` validado no serviço (`fd159b6`). Régua: prazo na janela, entrega completa até o dia do prazo, dia UTC (*desde a Etapa 162, o de Brasília — B1037*); integral = chegou a ENTREGUE. A entrega fracionada passou a completar (`22c6e57`) e a fechar a reserva (`f8a8980`).
  - **Nº de ajustes** — bloco `ajustes` do `indicadores` (`9126d88`) e a chave **`ajustes-por-motivo`** (`2ee2f86`): Cadastro / Inventário / Texto livre, sem estornados, material de cliente fora.
  - **Divergência e rejeição por fornecedor** — chave **`qualidade-fornecedores`** (`1bfe89b`; coluna "Agrupado por" `6da0048`): conferido = conferência FINALIZADA (auditoria `FINALIZAR_CONFERENCIA`); rejeição = inspeções com reprovação ÷ inspeções decididas; agrupado por CNPJ sem pontuação → cadastro → nome.
  - Testes: `relatoriosIndicadoresSpec27` 28, `relatorioAjustesPorMotivo` 10, `relatorioQualidadeFornecedores` 18, `indicadoresSpec27Integracao` 8 (`571beee`); mutantes da Fase 5 (`d7f22f8`).
  - **Fora, declarado:** rejeição por quantidade; a lista das atrasadas dentro do relatório (o alerta já lista); o status `REPROVADO` do recebimento por API; conferência só pela API sem finalizar.

### Frontend
- [x] Tela `/almoxarifado/relatorios` — `59fb871..12dfd4d` via merge `8fd7977` (dirigida pela
  lista fail-closed do servidor: menu por categoria só com o que o perfil pode ver, params
  declarados, tabela projetada pelas colunas com rótulos, nota/régua no rodapé, aviso de teto)
- [x] Exportação **XLSX** — `781c784`+`cfdbbe5` (genérica pela MESMA função e gate do
  dispatcher; projeção pelas colunas declaradas — SELECT * nunca vaza); **PDF cortado**
  (impressão do navegador; letra D da Etapa 13)
- [x] Dashboard: 3 cartões (giro/rupturas/atendimento) — `1aa7c13`+`8bb5e52` (falha isolada
  com retry; legendas com a janela efetiva e a aproximação do giro). **Etapa 67: quarto cartão "Requisições no
  prazo"** (`e3ed85d`) — `—` com "sem requisições com prazo no período" quando não há o que medir; sem o bloco, os três
  de antes.

### Gestão e indicadores — entregue na Etapa 13 (`4f8e3fc`+`bc1e2de`)
- [x] Giro (aproximado e DECLARADO: consumo na janela ÷ estoque ATUAL — sem snapshot
  histórico) · cobertura (MEDIANA, sem-consumo à parte) · rupturas (saldo físico ≤ 0 por
  saída/ajuste-inventário na janela; próprios ativos)
- [x] Valor total por grupo (categoria; fonte única `custoSql`) — a **valorização por
  cliente** continua fora (valorar patrimônio alheio é decisão de negócio, letra B)
- [x] Tempo médio de atendimento de requisição (entrega COMPLETA, todo o histórico — sem
  janela, declarado)
- [ ] Consumo por projeto previsto×realizado — depende de BOM/OP (feature 22)
- [x] Indicadores restantes da spec 27 (% no prazo, divergência por fornecedor etc.) — **Etapa 67**, ver o item da
  seção "Gestão e indicadores" acima (hashes e régua lá)

## Etapa 122 (2026-10-16) — o "conferido" do relatório de fornecedor sem a Auditoria (C255b)

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa122-a-aprovacao-que-falha-e-o-estado-fora-da-auditoria.md`.

- [x] `relatorioQualidadeFornecedores`: `conferido` = item com quantidade **e** `r.conferencia_finalizada_em IS NOT NULL` — `ec140017`.
  ⚠️ **Corrige a Etapa 67:** a régua ("só o gesto *Finalizar Conferência* conta") continua; **dizia "auditoria FINALIZAR_CONFERENCIA"
  como fonte, e isso deixou de ser confiável na 121** — a trilha é não-fatal. O legado vem da trilha, uma vez, no boot.
- [x] Guardas: `/conferir` com status CONFERIDO_ALMOX, `iniciar_conferencia` e `encaminhar_compras` não contam (RN-11, RN-11c).
- [ ] Fora: a conferência finalizada com a trilha falhando entre os deploys da 121 e da 122 (**C257**, A71 (b)).

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Posição de estoque bate com o livro de movimentações | `posicao de estoque consistente com movimentacoes` |
| Relatórios respeitam permissões (CONSULTA vê, mas não muda) | `perfil CONSULTA acessa relatorios e nao movimenta` |
| Filtros de período/projeto retornam apenas o escopo | `relatorio filtrado por projeto exclui outros projetos` |

## Dependências

- Quase todas — os relatórios ficam completos conforme as features donas entregam os dados. Desenvolver a **tela** cedo com os relatórios já existentes e ir ampliando.

## Etapa 127 (2026-10-16) — medida na Fase 0 do mapa (nada entregue nesta feature)

- **Correção à vista — o checklist estava incompleto:** a seção 27 dos requisitos
  (`specs/modulo-almoxarifado/2026-08-02-requisitos-modulo-almoxarifado.md`, "Gestão") pede **perdas**, e este README não tinha o item.
  Hoje só existe a listagem do histórico com `tipo=PERDA`, sem valor. Fica aberto:
- [x] **Perdas com valor** (quanto se perdeu, por período e motivo) — ✅ **Etapa 129** (`b1f1e64f`, Fase 5 `bce8f530`) — ver o item abaixo.
- [x] ~~Tempo médio de recebimento — medido: não existe~~ *(entregue na Etapa 128 — o item abaixo)*; as datas existem (`data_recebimento` no cabeçalho do recebimento,
  `entrada_estoque_em` por item, que só volta a NULL quando nada entrou). **Nenhuma spec define a régua** — a natural (deduzida) é da
  chegada à entrada no estoque (`data_recebimento` → o maior `entrada_estoque_em` do recebimento). Escolhida como próxima tarefa
  (Etapa 128), com a régua para o P.O. confirmar.

## Etapa 128 (2026-10-16) — o tempo médio de recebimento

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa128-o-tempo-do-recebimento-e-o-aviso-da-retencao.md`.

- [x] **Tempo médio de recebimento** — ✅ **Etapa 128** (`37aa1228`; Fase 5 `41255477`). Régua (deduzida, E2): por recebimento, de
  `data_recebimento` (só o DEFAULT a escreve) ao **maior** `entrada_estoque_em` de qualquer item que a tem; entra só o que entrou
  inteiro — nenhum item com quantidade > 0 (`CAST`, no SQLite texto > 0) sem data **com o recebimento ainda antes de
  `PROCESSADO`/`APROVADO`** (B825; a conferência sem guarda de status é a **C266**); o que entrou em parte vai para `incompletos`; janela
  pelo fim; `null` sem considerado (B823); cliente e inativo entram, estorno não tira (B824). Cartão *"Tempo médio de recebimento"* no
  dashboard. Testes: `relatoriosTempoRecebimento` (22), `tempoRecebimentoIntegracao` (2, rota e serviço, a nota que falha no meio
  pela rota), `AlmoxarifadoDashboardTempoRecebimento` (5). **Fora:** a lista dos recebimentos (é um número); os anteriores à Etapa 6
  (sem a hora da entrada); a inspeção depois da entrada.
  *(O item do checklist de "Gestão e indicadores" acima diz "**De recebimento** continua fora … candidato" — **deixou de valer** na Etapa
  128; fica como estava para a história, e este item é o que vale.)*

## Etapa 129 (2026-10-16) — as perdas com valor

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa129-a-conferencia-depois-da-entrada-e-as-perdas-com-valor.md`.

- [x] **Perdas com valor** — ✅ **Etapa 129** (`b1f1e64f`; Fase 5 `bce8f530`; integração `b0efb4d4`). Chave `perdas-por-motivo`
  (`reportService.relatorioPerdasPorMotivo`), categoria Gestão, gate `gerenciar_reposicao` (Administrador, Gestor, Compras — **B832**;
  o custo por material continua aberto, **C268**): `PERDA` e `PERDA_TERCEIRO` com `cancelado = 0`, uma linha por tipo + origem/motivo
  (o da `ajustes-por-motivo`), lançamentos, materiais distintos, `ROUND(SUM(qtd × custoUnitarioSql), 2)` (custo **atual**,
  retroativo — **B833**), último em; material de cliente fora, inativo conta; `data_inicio`/`data_fim` pelo dia UTC (*desde a Etapa 162, o de Brasília — B1033*), `material_id`
  inteiro positivo (vazio = sem filtro). Testes: `relatorioPerdasPorMotivo` (8) e a RN-17 de `conferenciaDepoisDaEntradaIntegracao` (a
  perda pela rota e o estorno). **Fora (declarado, D (129)):** a quantidade (unidades diferentes), a abertura por material ou projeto e a
  perda de material de cliente. O registro passa de 25 para 26 chaves.

## Etapa 160 — os filtros e as buscas que não casavam (2026-10-19)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa160-filtros-da-fabrica-e-do-almoxarifado.md`. Consertos técnicos, sem regra de acesso nova e sem mexer em saldo: a medição chave por chave das telas do
Almoxarifado (nenhuma rota ignora uma chave que a tela manda; o defeito estava na comparação).

- [x] **RN-160.04 (C393, B1020)** — `usuario` pela `condicaoDeBusca(..., { escapar: true })` (`\`, `%` e `_` continuam texto); `tipo` aparado e em maiúsculas, não texto = sem filtro — `eaf682e9`.
- [x] **A nota do registro** — dizia *"ignora maiúsculas só em letras sem acento"*; passa a dizer *"ignora maiúsculas e minúsculas, mas não o acento (um nome antigo com letras acentuadas maiúsculas e minúsculas misturadas só é achado com a mesma grafia)."* — `eaf682e9`, o limite na Fase 5 (r1-2, `ff3e7d78`).
- [x] **Os Relatórios ao trocar de relatório com a consulta em andamento** (a exportação com o tipo novo e os parâmetros do antigo) — resolvido na Etapa 161 (C396, `f2a10ffe` — ver a seção abaixo).

## Etapa 161 — os Relatórios ao trocar de relatório, o painel ao trocar o período, e o dia (2026-10-19)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa161-respostas-velhas-e-o-dia-local.md`. Consertos técnicos, sem regra de acesso nova e sem mexer em saldo; o status da feature não muda.

- [x] **RN-161.03 (C396)** — trocar de relatório invalida a consulta em voo: a resposta e o erro dela são descartados, o *Consultar* do novo vale na hora, e a exportação usa o tipo e os parâmetros da última consulta bem-sucedida do relatório aberto — `f2a10ffe`. (O "lembrar o tipo da última consulta" é uma segunda trava que nenhum teste derruba sozinha: trocar de relatório já zera a última consulta — declarado.)
- [x] **RN-161.06** — o nome do arquivo exportado leva o dia local (`toISOString` dava o de amanhã depois das 21h) — `db960831`.
- [x] **RN-161.02 (C396)** — o painel do Almoxarifado ao trocar o período (*Consumo por O.S.*, *Materiais mais consumidos*): só a resposta do último pedido mexe na lista (a de um filtro anterior que chega depois, o erro dela e o fim do *carregando* dela são descartados; quem chama com `await` continua recebendo uma promessa que resolve) — `f2a10ffe`.
- [x] **RN-161.06 (C397)** — as últimas movimentações e as requisições abertas do painel na hora de Brasília — `db960831`.
- [x] **Os relatórios e o painel no dia de Brasília** — resolvido na Etapa 162 (C401, B1033, `e2d2306c` — ver a seção abaixo). *O texto a seguir fica como registro:* **ficavam no dia UTC (C401, B1027)**: *Consumo por O.S.*, *Histórico de movimentações*, *Ajustes por motivo*, *Perdas por motivo*, *Materiais mais consumidos*, *Consumo por período*, *Sucata (financeiro)*, *Custo por projeto*, *Qualidade de fornecedores* (`reportService.js`, `DATE(created_at)`) e o painel (*movimentações hoje*, o gráfico de 7 dias). A lista das Movimentações já filtra pelo dia de Brasília — entre 21h e meia-noite, o mesmo período pode diferir entre a lista e o *Histórico*. Etapa própria (9 relatórios, ~17 arquivos de teste, vários calculando *hoje* em UTC).

## Etapa 162 — os relatórios, o painel e o indicador de prazo no dia de Brasília (2026-10-20)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa162-o-dia-de-brasilia-nos-relatorios-e-nas-reservas.md`. Consertos técnicos, sem regra de acesso nova e sem mexer em saldo; o status da feature não muda (falta para 🟢 continua só
previsto × realizado, que depende da 22).

- [x] **RN-162.01 (C401, B1033)** — os nove relatórios (*Consumo por O.S.*, *Histórico de movimentações*, *Ajustes por motivo*, *Perdas por
  motivo*, *Materiais mais consumidos*, *Consumo por período*, *Sucata (financeiro)* — as duas colunas, `m.created_at` e
  `s.destino_registrado_em` —, *Custo por projeto*, *Qualidade de fornecedores*) e a rota sem consumidor `relatorio/movimentacoes-periodo`:
  `DATE(instante, '-180 minutes')` pelo `diaLocal.modificadorDoFuso`, parâmetro em linha (sem CTE) — `e2d2306c`.
- [x] **RN-162.02** — o painel: *Movimentações Hoje* e o gráfico de 7 dias (o `dia` e a borda) pelo dia de Brasília — `e2d2306c`; e o período dos
  quadros *Consumo por O.S.* e *Materiais mais consumidos* no dia local do navegador (era o `toISOString` — achado da Fase 5 r1) — `e1ac2cfa`.
- [x] **RN-162.03 / RN-162.09 (B1039)** — o nome do arquivo exportado pelo servidor leva o hoje de Brasília; a planilha mostra o instante do banco
  na hora de Brasília (`diaLocal.instanteDoBancoNoFuso`, a mesma régua do `formatCelula` da tela; data impossível e ano antes de 1900 voltam
  como estão — Fase 5) — `e2d2306c`, `e1ac2cfa`.
- [x] **RN-162.04 (B1037)** — indicadores, *requisições no prazo*: o prazo (só data) contra o hoje de Brasília e a entrega pelo dia de Brasília do
  instante; as janelas N × 24 h dos outros blocos não mudam (medido) — `e2d2306c`. *Esta spec (a régua do *no prazo* e a das *Perdas por motivo*, acima) e o comentário
  do bloco diziam "dia UTC" — era a régua da época, não erro; os dois trechos ficaram marcados com a mudança.*
- [ ] **Os indicadores do Operacional (C403)** — **não mexidos (B1034)**: estão todos no `GET /api/operacional/dashboard-mes`, cujo único
  consumidor (`DashboardMES`) não é montado pelo `App.js`; quatro tabelas sem escritor; a consulta da manutenção pede colunas que não existem.

## Etapa 174 (2026-10-22) — Consumo por OS com Devolvido e Líquido

Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa174-entrega-com-os-e-consumo-por-os.md`. A saída da entrega com a OS está na
feature 22 (seção "Etapa 174").

### Contrato congelado (I1) — `reportService.relatorioConsumoPorOS`

Uma query, `cancelado = 0`, agrupada por `material_id, os_id`:
- `total_consumido` = `SAIDA`, `SAIDA_PRODUCAO`, `SAIDA_MONTAGEM`, `SAIDA_ASSISTENCIA` — **sem mudança** (régua histórica);
- `devolvido` = `tipo IN TIPOS_DEVOLUCAO` (`ENTRADA_DEVOLUCAO` e o legado `DEVOLUCAO`) **menos** a devolução de destino `SUCATA` (I2, B1113 —
  achada por `d.id = CAST(SUBSTR(m.referencia, 5) AS INTEGER) AND m.referencia = 'DEV-' || d.id`: a busca pela chave primária é da Fase 5,
  `9d1fcd1d`; o texto sozinho fazia `SCAN d`) **OR** `tipo = 'ENTRADA' AND requisicao_id IS NOT NULL` (o estorno da exclusão — o saldo inicial
  não tem requisição e fica fora);
- `liquido = total_consumido − devolvido`; cada linha pela data **dela** (C2, B1114: com período, pode ser negativo);
- `HAVING total_consumido > 0 OR devolvido > 0` — **a suíte não o protege sozinho**: o `WHERE` já filtra o tipo e `cancelado = 0`, então
  nenhum grupo chega 0/0 (só com quantidade zero). Mantido como defesa do contrato; o teste prova o par (sem `WHERE` de tipo **e** sem
  `HAVING` → vermelho);
- `ORDER BY total_consumido DESC`. Registro (`reportRegistry.js`): colunas **Devolvido** e **Líquido**; a `nota` diz a régua, a sucata e a
  data de cada linha. A exportação projeta pelas colunas.

### Checklist

- [x] RN-174.03 (I1, I2, I3, C2) — `97d3012f` (`consumoPorOsDevolvido.api.test.js`).
- [x] Ponta a ponta 8/0/8 → 8/3/5 → sucata 8/3/5 — `94d18eac`.
- [x] **Fase 5, item 2** — o quadro *Consumo por O.S.* do painel (`AlmoxarifadoDashboard.aggregateConsumoPorOS`) ignora linha com
  `total_consumido` 0: a OS só de devolução não aparece com "Qtd. consumida 0" e o estado vazio volta (B1117) — `aa053fa8` (2 testes Jest).
  **Correção:** o plano da T2 dizia "o dashboard soma só `total_consumido` (o `HAVING` o protege)" — **estava errado**: o `HAVING` deixa passar
  exatamente essas linhas.
- [x] **Fase 5, item 3** — o `NOT EXISTS` da sucata pela chave primária — `9d1fcd1d` (`EXPLAIN QUERY PLAN`: `SCAN d` → `SEARCH d USING INTEGER
  PRIMARY KEY`).
- [x] **Fase 5, item 4** — o tipo legado `DEVOLUCAO` conta (10/4/6); entrega 10, devolve 5, exclui → a exclusão estorna 5 e o relatório fica
  10/10/0 — `d087bcfc`.
- [ ] **Fora (letra D (174)):** quarentena depois sucateada continua contando como devolvida; devolução de destino SUCATA com a perna SUCATA
  recusada fica fora do devolvido; o *Custo por projeto* não desconta a ENTRADA da exclusão (I4, de antes).

## Etapa 181 (2026-10-22) — o "EPI por colaborador" lê as entregas, e os dois relatórios de pessoa ficam restritos

- **`epi-colaborador`** — a fonte **estava errada** desde a Etapa 13: lia empréstimos de ferramenta `tipo='EPI'` em aberto, com `acao: null`
  e sem parâmetros; as entregas de EPI da 178 (`entregas_epi_almoxarifado`) não apareciam. Agora: SELECT próprio sobre as entregas, 14 colunas
  (*Entregue em* no formato do banco, para a tela e a planilha mostrarem Brasília — C1 da revisão da Fase 2), parâmetros `colaborador_id`
  (select de `/almoxarifado/aux/colaboradores`), `material_id` (número), `de`/`ate` (date, dia de Brasília), todos com `exemplo` (a varredura
  I1 de `relatoriosRegistro.api.test.js` os exercita), nota nova, `acao: 'entregar_epi'` (**B1180** a **B1184**, **B1187**). `3ce1d3a2`.
- **`ferramentas-emprestadas`** — `acao: 'gerenciar_ferramentas'` (**B1182**). O registro continua com **26** chaves; o GESTOR vê **24** e a
  PRODUCAO **20** (eram 26 e 22 — `relatoriosJornada.api.test.js` mudou a asserção, mudança de contrato intencional).
- **Dispatcher e exportação** (`extended.js`): o resultado de **todo** relatório passa por `mascararMovimentacoes(linhas, req.user)` — a
  justificativa `^Entrega de EPI a .+$` (a SAÍDA da entrega de EPI até a 181) vira *"Entrega de EPI (dados do colaborador restritos)"* para quem
  não tem `entregar_epi`; hoje só o `historico-movimentacoes` a devolve (**B1185**, revisão da Fase 5). `0e6d5b37`.
- Testes: `relatorioEpiPorColaborador.api.test.js` (12), `historicoEntregaEpiMascara.api.test.js` (7), Jest em
  `RelatoriosAlmoxarifado.test.js` (nota, select, consulta, data). Plano:
  `docs/superpowers/plans/2026-10-22-almoxarifado-etapa181-relatorio-epi-por-colaborador.md`. Novidades: seção "Etapa 181", **B1180** a
  **B1188**, **C440** a **C442**, **D (181)**, **F (181)**.
