# Etapa 13 — Relatórios e indicadores — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** registro único de relatórios com gate declarado por chave (mata a classe "relatório
novo esquece o gate", que já entrou 2× por achado de revisão), lista fail-closed para a tela,
exportação XLSX genérica pela MESMA função/gate, indicadores gerenciais pelas fontes únicas,
tela `/almoxarifado/relatorios` e 3 cartões no dashboard.

**Spec:** `docs/superpowers/specs/2026-08-24-almoxarifado-etapa13-relatorios-design.md`
(RN-01..RN-06, D1..D8 — mensagens literais de lá são contrato).

## Global Constraints

- Literais congelados (do dispatcher ATUAL, preservados): 404 `Relatório não encontrado`;
  403 `{ "error": "Sem permissão para este relatório", "acao": "<acao>" }`. Novo: 400 do
  indicadores `Parâmetro "janela_dias" deve ser um número inteiro maior que zero`.
- **NENHUM shape de rota existente muda.** O refactor do dispatcher para o registro é interno;
  a prova é a regressão da suíte inteira (116 arquivos) sem tocar nos testes existentes de
  relatório.
- Custo SEMPRE via `custoUnitarioSql`/`valorEstoqueSql` (o `custoUnitarioFonteUnica.api.test.js`
  varre o fonte e JÁ quebra sozinho se alguém ler custo à mão — não desative, obedeça).
  Consumo SEMPRE via `movementTypes.TIPOS_SAIDA`. Disponível via `disponivelSql`.
- Material de cliente (`proprietario_cliente_id IS NOT NULL`) FORA de giro/cobertura/
  rupturas/valor-por-grupo. `materiais-sem-endereco` continua SEM filtro de dono (decisão
  classe C da Etapa 8 — não "corrigir").
- Export: mesma função do registro, mesmos parâmetros; nunca query própria de export.
- Sem config nova (janela via querystring) — nenhuma amarração nova no
  `configuracoesGerais.api.test.js`.
- Sabotagem: âncora única NOS DOIS SENTIDOS, restauração por edição reversa (NUNCA
  `git checkout` — queimou 2× na Etapa 12), md5 antes/durante/depois; par positivo+negativo
  em todo gate. Commits pt-BR sem acento, `git add` explícito.
- Baseline: `npm run test:api` = 116/116; client 436/436.

## Sort topológico

| Task | O quê | Classe |
|---|---|---|
| 1 | registro + refactor dispatcher + lista + export | tronco |
| 2 | indicadores | tronco (usa o registro) |
| 3 | tela | galho (worktree) |
| 4 | dashboard + jornada | galho (principal, após 1-2) |
| 5 | fechar-etapa | — |

---

### Task 1: Registro, lista fail-closed e export XLSX (RN-01, RN-02, RN-03)

**Files:** Create `server/services/almoxarifado/reportRegistry.js`;
Modify `server/routes/almoxarifado/extended.js` (dispatcher consome o registro; rotas novas
lista + export); Test `server/tests/api/relatoriosRegistro.api.test.js` (novo).

- `reportRegistry.js` exporta `RELATORIOS`: para CADA uma das 17 chaves atuais,
  `{ titulo, categoria ('Estoque'|'Movimentações'|'Gestão'|'Terceiros e clientes'), acao
  (string|null EXPLÍCITO), params: [{ nome, rotulo, tipo: 'date'|'number'|'text',
  obrigatorio }], colunas: [{ chave, rotulo }] | null, fn: null }`. As funções são LIGADAS no
  `extended.js` (o registro não importa serviços — evita ciclo e mantém o registro puro de
  metadados; o dispatcher valida na subida que TODA chave do registro ganhou `fn`).
  Gates atuais preservados: `inventario-divergencias` → `'inventario'`,
  `solicitacoes-compra` → `'gerenciar_reposicao'`, resto `null`.
- Dispatcher `GET /relatorios/:tipo`: resolve `fn` e `acao` PELO REGISTRO (apaga os dois ifs
  inline; os literais 403/404 idênticos). `GET /relatorios` (lista): filtra por
  `acao === null || can(req.user, acao)`, devolve `{ relatorios: [...] }` SEM o campo `acao`.
  `GET /relatorios/:tipo/export`: mesmo gate → mesma `fn(db, req.query)` → `xlsx.utils` com
  `colunas` (ordem/rótulo) ou fallback `Object.keys(primeiro item)`; attachment
  `<tipo>-<AAAA-MM-DD>.xlsx`; resultado vazio → planilha só com cabeçalho (200, não erro).
- [ ] Step 1: teste vermelho — (1) registro completo: as 17 chaves atuais presentes, TODA
  entrada com `acao` declarada (`'acao' in entrada`), categorias válidas; (2) lista como
  ADMIN traz 17+ tipos; como PRODUCAO (sem perfil) NÃO traz os 2 gated e TRAZ os sem gate;
  sem campo `acao` no JSON; (3) paridade dispatcher×lista: todo tipo listado responde ≠404 no
  dispatcher (loop real); (4) gates preservados: PRODUCAO em `inventario-divergencias` → 403
  literal com `acao: 'inventario'`; ADMIN → 200 (par positivo+negativo, idem
  solicitacoes-compra com COMPRAS positivo); (5) export: `estoque-atual` como ADMIN → 200,
  content-type de xlsx, attachment correto, e o BUFFER reaberto com a própria lib `xlsx` tem
  as mesmas LINHAS do JSON do dispatcher (paridade medida, não presumida); export de tipo
  gated sem perfil → 403; tipo inexistente → 404; `materiais-cliente` sem `cliente_id` → 400
  igual ao dispatcher.
- [ ] Step 2: implementação.
- [ ] Step 3: verde + regressão dos testes de relatório existentes + suíte completa (116→117).
- [ ] Step 4: controles positivos — (i) apagar `acao` de uma entrada do registro → teste 1
  cai; (ii) lista deixando de filtrar (`can` → true) → teste 2 cai; (iii) export com query
  própria (trocar `fn` por SELECT direto de outra tabela) → paridade (5) cai; (iv) gate do
  export removido → 403 do export cai.
- [ ] Step 5: suíte + commit.

### Task 2: Indicadores gerenciais (RN-04)

**Files:** Modify `server/services/almoxarifado/reportService.js` (função
`relatorioIndicadores`), `server/services/almoxarifado/reportRegistry.js` +
`extended.js` (chave `indicadores`, categoria 'Gestão', `acao: null` — D5, colunas null:
payload é objeto, export desabilitado para este tipo → o export responde 400
`Relatório sem exportação tabular` — literal novo, congelado aqui);
Test `server/tests/api/relatoriosIndicadores.api.test.js` (novo).

- Régua (RN-04, shape congelado no design): giro (valor consumido na janela via saídas ×
  `custoUnitarioSql` ÷ `valorEstoqueSql` atual, com os DOIS operandos no payload), cobertura
  (mediana dos dias por material com consumo; `materiais_sem_consumo` contados à parte),
  rupturas (materiais próprios ativos com alguma movimentação `cancelado = 0` e
  `saldo_posterior <= 0` na janela — lista com codigo/nome/data da 1ª ruptura), valor por
  grupo (`valorEstoqueSql` GROUP BY `COALESCE(categoria,'Sem categoria')` — só próprios),
  atendimento (`AVG(julianday(data_entrega) - julianday(created_at)) * 24` das requisições
  com `data_entrega` no período; `total_consideradas`).
- `janela_dias`: default 90; inválido → 400 literal da Global Constraint.
- [ ] Step 1: teste vermelho — cenário construído pelo MOTOR REAL (entradas com custo, saídas,
  material 100% de cliente que NÃO pode contaminar nada, material zerado na janela, requisição
  entregue com timestamps controlados): asserts NUMÉRICOS exatos de cada bloco (nada de
  `>= 0`); janela=1 exclui movimento antigo (filtro provado); `janela_dias=0` → 400 literal;
  material de cliente ausente de rupturas/valor_por_grupo (par: o MESMO material como próprio
  aparece).
- [ ] Step 2: implementação (custo/valor SÓ pelas fontes únicas — o teste-varredura pega).
- [ ] Step 3: verde + suíte (117→118).
- [ ] Step 4: controles positivos — (i) trocar mediana por média na cobertura → teste cai
  (fixture com outlier); (ii) incluir cliente no valor_por_grupo → cai; (iii) régua de ruptura
  para `< 0` (excluindo o == 0) → cai.
- [ ] Step 5: suíte + commit.

### Task 3: Tela `/almoxarifado/relatorios` (galho, worktree)

**Files:** Create `client/src/components/almoxarifado/RelatoriosAlmoxarifado.js` + `.test.js`;
Modify `lazyModules.js`, `App.js`, `Layout.js` (menu, ícone ≠ dos usados).

- Contrato: os 3 endpoints da Task 1 + o shape de `indicadores` (mock HTTP). Menu agrupado
  por `categoria` SÓ com o que a lista devolveu; formulário de `params` por declaração
  (date/number/text, obrigatório marcado); tabela genérica (colunas do payload; datas
  UTC-safe; `—` para nulos); tipo `indicadores` renderiza os 5 blocos como cards/tabelas (não
  a tabela genérica); botão **Exportar XLSX** (window.open/anchor para a rota de export com a
  MESMA querystring; oculto para `indicadores`); painel de erro por estado com retry (403/erro
  de rede NUNCA viram lista vazia — lição da 11); duplo clique de consulta desabilita botão.
- [ ] Testes (mínimo 9, fixtures com números distintos, asserts por célula): menu só com o
  listado; params obrigatórios bloqueiam consulta; consulta manda querystring certa; tabela
  por célula; indicadores renderiza blocos; export usa a MESMA querystring; 403 → painel;
  rede → painel; botão desabilitado em voo.
- [ ] Sabotagens mínimas: export apontando para o dispatcher (sem /export) → cai; painel de
  erro removido → cai; menu ignorando a lista (hardcode) → cai.
- [ ] Full client suite + build + `npm run test:api` NA WORKTREE (regra da base). Commit na
  worktree.

### Task 4: Dashboard + teste-jornada (galho, árvore principal — SÓ após Tasks 1-2)

**Files:** Modify `client/src/components/almoxarifado/AlmoxarifadoDashboard.js` (+ teste);
Create `server/tests/api/relatoriosJornada.api.test.js`.

- Dashboard: 3 cartões (giro, rupturas, tempo médio de atendimento) do endpoint
  `relatorios/indicadores`, com legenda da janela; falha do endpoint → erro localizado nos 3
  cartões, KPIs existentes intactos (teste com mock rejeitando SÓ o indicadores).
- Jornada (servidor, motor real): semear estoque/movimentações/requisição → lista como GESTOR
  contém `indicadores` e `solicitacoes-compra`; como PRODUCAO não contém os gated → consultar
  `indicadores` (números batem com o semeado) → exportar `estoque-atual` e conferir paridade
  de linhas com o dispatcher → 403 do export gated como PRODUCAO → 404 de tipo inventado.
  Sabotagem da jornada: gate do export removido → elo do 403 cai.
- [ ] Commit (arquivos explícitos).

### Task 5: Fechar a etapa
- [ ] `fechar-etapa` completa (7 artefatos + verificação medida + retro de 4 números).

## Self-review do plano (feito na escrita)

- O refactor do dispatcher é o único ponto que toca comportamento existente — blindado por
  "nenhum shape muda" + regressão da suíte inteira + literais congelados copiados do código.
- Registro sem `fn` (metadados puros) evita ciclo de require e deixa a Task 3 consumir a
  lista sem carregar serviço nenhum.
- Indicadores com asserts numéricos exatos e cenário pelo motor real — a lição de TODAS as
  etapas: teste que aceita `>= 0` não sabe falhar.
- Export com paridade MEDIDA (reabrir o XLSX e comparar linhas) — senão a sabotagem (iii) da
  Task 1 não teria como ficar vermelha.
