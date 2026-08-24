# Etapa 13 — Relatórios e indicadores (feature 21) — Design

> Fase 0 medida em 2026-08-24: o dispatcher `GET /api/almoxarifado/relatorios/:tipo`
> (`extended.js:1220`) tem **17 chaves**, com gate inline em só 2 (`inventario-divergencias` →
> `inventario`, achado da 10b; `solicitacoes-compra` → `gerenciar_reposicao`, achado da 11) —
> as DUAS entraram por achado de revisão final, não por design: a classe de defeito
> "relatório novo esquece o gate" é estrutural. Front consome só 2 dos 17; não há tela de
> relatórios do módulo. Libs de exportação já no server (`xlsx@0.18.5`, `pdfkit`, `puppeteer`).
> Acuracidade (10b) vive em rota própria com `requirePermission('inventario')`.
> **Correção da Fase 2 (M2): "front consome só 2 dos 17" estava ERRADO — são 3**
> (AlmoxarifadoDashboard consome consumo-os e materiais-mais-consumidos; ReposicaoAlmoxarifado
> consome o GATED solicitacoes-compra — a regressão do refactor cobre esse consumidor).
> Fontes únicas
> vivas: `custoUnitarioSql`/`valorEstoqueSql` (com teste-varredura que PROÍBE ler custo à mão),
> `disponivelSql`, `divergenciaRealSql`.

## Problema

17 relatórios órfãos de tela, gate por exceção (esquecer = vazamento, já aconteceu 2×),
nenhum indicador gerencial (giro/cobertura/ruptura/tempos), nenhuma exportação, e o dashboard
sem os cartões que a spec 27 pede.

## Decisões

- **D1 — Registro central de relatórios (mata a classe de defeito do gate).** Um mapa único
  `RELATORIOS` em serviço novo (`reportRegistry.js`): chave → `{ titulo, categoria, acao,
  params, colunas }`. `acao: null` é decisão EXPLÍCITA ("qualquer usuário do módulo"), não
  default de esquecimento — o dispatcher passa a resolver gate pelo registro, e um teste varre
  o registro exigindo que toda chave declare `acao` (nem que seja null). Os 17 existentes
  entram com o gate ATUAL (2 gated, 15 null — comportamento preservado de propósito; apertar
  gate de relatório existente é decisão de negócio, letra B).
- **D2 — `GET /api/almoxarifado/relatorios` (lista) devolve SÓ o que o usuário pode ver.**
  Fail-**closed** por construção (a lista nasce do registro filtrado por `can()`); a tela monta
  o menu a partir dela e nunca mostra link que daria 403. O 403 do relatório gated continua no
  dispatcher (defesa em profundidade — a lista é UI, o gate é backend).
- **D3 — Exportação XLSX no servidor, genérica, pela MESMA função e o MESMO gate.**
  `GET /relatorios/:tipo/export` roda a MESMA função do registro e serializa com `xlsx` usando
  `colunas` declaradas (ordem/rótulos). Nenhum relatório ganha query própria de export (não há
  como divergirem). **PDF é corte declarado** (letra D): a tela oferece impressão do navegador;
  PDF estilizado por relatório é etapa própria se a prática pedir. Descartado: export no client
  (jsPDF, padrão do módulo global) — perderia paridade garantida com o JSON e refaria a
  paginação/limites no browser.
- **D4 — Indicadores gerenciais como RELATÓRIO no registro (`indicadores`) + cartões no
  dashboard.** Cálculos novos em `reportService` usando SÓ as fontes únicas:
  - **Giro (aproximado e DECLARADO):** valor consumido na janela (saídas × custo da fonte
    única) ÷ valor do estoque ATUAL. Não existe snapshot histórico de estoque — usar o valor
    atual como denominador é aproximação honesta, escrita na tela e na letra E; snapshot
    diário é etapa futura.
  - **Cobertura (dias):** disponível ÷ consumo médio diário da janela (a MESMA régua de
    consumo da Etapa 11 — `TIPOS_SAIDA` na janela), por material; o indicador agregado é a
    mediana (média seria distorcida por material sem consumo → cobertura infinita; materiais
    sem consumo na janela ficam FORA da mediana e contados à parte).
  - **Rupturas na janela (régua emendada pela Fase 2, C5 — a original contava lançamento
    burocrático como ruptura, medido):** COUNT de materiais ativos, próprios, com movimentação
    `cancelado = 0` na janela, `saldo_posterior <= 0` **e `tipo` em `TIPOS_SAIDA` ou
    `AJUSTE_INVENTARIO`** (tipos neutros gravam `saldo_posterior = saldo_anterior` e, num
    material já zerado, atribuiriam a 1ª ruptura a uma LIBERACAO_RESERVA). Declarado (letra
    E): a régua olha o saldo FÍSICO — 100% reservado tem disponível 0 e NÃO aparece; é
    contagem de evento, não de estado; AJUSTE_INVENTARIO que zera por contagem conta.
  - **Valor do estoque por grupo:** `valorEstoqueSql` agrupado por `categoria` (COALESCE
    'Sem categoria').
  - **Tempo médio de atendimento de requisição (h) — régua confirmada pela Fase 2 (I7):**
    `AVG((julianday(data_entrega) - julianday(created_at)) * 24)` com
    `WHERE data_entrega IS NOT NULL` e `total_consideradas` DENTRO do mesmo WHERE. Declarado:
    `data_entrega` tem UM escritor (requisitionService.js:376) e só na entrega COMPLETA —
    parcial e ENCERRADA sem completar ficam fora. `media_horas` arredondada
    (`Number(x.toFixed(2))` — julianday devolve 6.499999992549419 para 6h30, medido).
  - **Cortados (letra D):** previsto×realizado por projeto (exige BOM/OP — feature 22),
    divergência/rejeição por fornecedor (dados da 08/09 sem agregação pedida por ninguém
    ainda), % requisições no prazo (campo de prazo prometido não é confiável — conferir na
    task; se não houver, corte), valorização por cliente (material de cliente não tem custo
    NOSSO — valorar patrimônio alheio no nosso relatório é decisão de negócio, letra B).
- **D5 — Gate dos indicadores: `null` (módulo inteiro), IGUAL ao dashboard.** O
  `valorTotalEstoque` já é visível a todo usuário do módulo no dashboard hoje; gate novo aqui
  seria regra nova sem pedido. Registrado na letra B como reversível (uma linha no registro).
  **Declarado (Fase 2, M6): `acao: null` expõe a QUEBRA por categoria e a lista nominal de
  rupturas — mais do que o agregado de hoje.** Decisão consciente; se o cliente objetar, o
  gate natural é `gerenciar_reposicao`.
- **D6 — Tela `/almoxarifado/relatorios` genérica, dirigida pelo registro.** Menu por
  categoria (vem da lista D2), formulário de parâmetros declarados (`params`), tabela
  genérica com as `colunas`, botão Exportar XLSX, painel de erro por estado (lição da 11),
  datas UTC-safe, `—` para nulos. Relatório que o usuário não pode ver NÃO aparece no menu.
- **D7 — Dashboard ganha 3 cartões** (giro, rupturas na janela, tempo médio de atendimento)
  lendo o MESMO endpoint `indicadores` (nenhuma conta duplicada no front).
- **D8 — Nada de recriar o que existe:** acuracidade (10b) e os relatórios v1
  (`/relatorio/*`) ficam como estão; a tela nova aponta para o dispatcher unificado. O
  relatório `indicadores` NÃO recalcula acuracidade (link para a tela de inventário).

## Regras de negócio

### RN-01 — Registro único com gate declarado por chave
Toda chave do dispatcher vem do registro; toda entrada declara `acao` (string de `ACAO_PERFIS`
ou `null` explícito). Teste varre o registro e falha se alguma entrada omitir o campo. Os
gates existentes ficam idênticos: `inventario-divergencias` → `inventario`,
`solicitacoes-compra` → `gerenciar_reposicao`; os demais 15 → `null` (comportamento atual
preservado — mudar é letra B).

### RN-02 — Lista fail-closed
`GET /api/almoxarifado/relatorios` → 200 `{ relatorios: [{ tipo, titulo, categoria, params }] }`
contendo SÓ as chaves cujo `acao` é null ou passa em `can(req.user, acao)`. Usuário sem perfil
(PRODUCAO) vê os 15 sem gate e NÃO vê os 2 gated. A resposta NUNCA inclui `acao` (detalhe de
autorização não vaza para a UI decidir).

### RN-03 — Dispatcher e export com o MESMO gate e a MESMA função

**Emendas da Fase 2 (todas medidas):** o export só existe para relatório `exportavel: true`
com `colunas` declaradas — payload OBJETO (`materiais-cliente`, `sucata-financeiro`, e
`indicadores`) responde 400 `Relatório sem exportação tabular` (o xlsx explode com TypeError
em payload não-array); as linhas são PROJETADAS pelas colunas ANTES do `json_to_sheet`
(`header` não descarta chave não declarada — 6 declaradas viravam 64 colunas com
custo/proprietário vazando, e `inventario-divergencias` re-exporia `ic.*` desfazendo o gate
da 10b); NUNCA passar o array do registro como `header` (a lib faz push nele — o singleton
corromperia a lista até reiniciar); headers HTTP só DEPOIS do await (senão 400/403/404
estoura com headers enviados); LIMITs herdados declarados no registro
(`historico-movimentacoes` 500, `inventario-divergencias` 500, `materiais-mais-consumidos`
10) e avisados na tela; volume medido: 20.000 linhas × 4 colunas = 187 ms / 3,13 MB.
`GET /relatorios/:tipo` (existente) e `GET /relatorios/:tipo/export` resolvem gate pelo
registro: sem permissão → 403 `{ "error": "Sem permissão para este relatório", "acao": "<acao>" }`
(literal ATUAL do dispatcher, preservado). Tipo inexistente → 404
`{ "error": "Relatório não encontrado" }` (idem). O export chama a MESMA função do registro —
mesmos filtros de query — e devolve XLSX (`Content-Type` de planilha,
`Content-Disposition: attachment; filename="<tipo>-<AAAA-MM-DD>.xlsx"`) com cabeçalhos das
`colunas` declaradas; relatório sem `colunas` declaradas exporta as chaves do primeiro item
(fallback documentado).

### RN-04 — Indicadores medidos pelas fontes únicas
`GET /relatorios/indicadores?janela_dias=90` (default 90; validação: inteiro ≥ 1, senão 400
`Parâmetro "janela_dias" deve ser um número inteiro maior que zero`) → `{ janela_dias,
giro: { valor_consumido, valor_estoque_atual, indice }, cobertura: { mediana_dias,
materiais_sem_consumo }, rupturas: { total, materiais: [...] }, valor_por_grupo: [{ categoria,
valor }], atendimento_requisicoes: { media_horas, total_consideradas } }`. Custo SEMPRE via
`custoUnitarioSql`/`valorEstoqueSql` (o teste-varredura de fonte única já existe e pega
leitura à mão); consumo SEMPRE via `TIPOS_SAIDA` (fonte única de tipos); material de cliente
fora de giro/cobertura/rupturas/valor (não é patrimônio nosso).

### RN-05 — Tela dirigida pelo registro

**Emenda da Fase 2 (I6/C4/I5):** os nomes de parâmetro vêm do REGISTRO, nunca assumidos
(`sucata-financeiro` usa `de`/`ate` — nome errado não erra, é ignorado e o período inteiro
volta parecendo filtrado); cada relatório exibe no rodapé a régua/nota declarada (consumo-os
conta só SAIDA*, indicadores conta TIPOS_SAIDA inteiro — 10 vs 18 medidos no mesmo material)
e o aviso "mostrando os primeiros N" quando as linhas baterem no limite declarado.
Menu por categoria com SÓ o que a lista devolve; parâmetros renderizados por declaração
(`data_inicio`/`data_fim` como date, ids como number/text); erro de rede/403 → painel de erro
com retry (nunca lista vazia); export baixa o arquivo da rota de export com os mesmos
parâmetros da consulta na tela.

### RN-06 — Dashboard consome `indicadores`
3 cartões novos com legenda da janela; falha do endpoint não derruba os KPIs existentes
(painel parcial com erro localizado).

## Contratos de API (congelados)

- `GET /api/almoxarifado/relatorios` → **200** `{ relatorios: [{ tipo, titulo, categoria,
  params: [{ nome, rotulo, tipo, obrigatorio }] }] }`. Sem gate próprio (a lista JÁ filtra).
- `GET /api/almoxarifado/relatorios/:tipo` → comportamento atual preservado (200 payload do
  relatório; 404/403 com os literais da RN-03). `indicadores` entra como tipo novo.
- `GET /api/almoxarifado/relatorios/:tipo/export` → **200** XLSX binário; 400 de parâmetro
  inválido espelha o do relatório; 403/404 idênticos ao dispatcher.
- Compat: NENHUMA rota existente muda shape. O refactor do dispatcher é interno (registro),
  provado por regressão dos testes atuais.

## Tasks (sort topológico)

| Task | O quê | Classe |
|---|---|---|
| 1 | `reportRegistry.js` + refactor do dispatcher + lista fail-closed + export XLSX genérico | **tronco** |
| 2 | indicadores no `reportService` + chave `indicadores` no registro + validação | **tronco** (consome o registro da 1) |
| 3 | tela `/almoxarifado/relatorios` | **galho** (worktree) |
| 4 | cartões do dashboard + teste-jornada cruzando lista→consulta→export→gates | **galho** (árvore principal) |
| 5 | fechar-etapa | — |

## Interações verificadas (Fase 0)

- Dispatcher atual: 17 chaves; `materiais-cliente` exige `cliente_id` (400 — a lista declara
  o param como obrigatório); `materiais-sem-endereco` NÃO filtra dono de propósito (comentário
  classe C da Etapa 8 — preservar).
- `can()` já é importado no `extended.js` (usado pelos 2 gates inline).
- `xlsx` está no `package.json` do server (0.18.5) — nenhuma dependência nova.
- O teste `custoUnitarioFonteUnica.api.test.js` varre o código: os indicadores NOVOS têm de
  usar `custoSql` senão a suíte já quebra sozinha (proteção de graça).
- `configuracoesGerais.api.test.js`: a etapa NÃO cria config nova (janela vem por querystring)
  — nenhuma amarração nova de CAMPOS.
