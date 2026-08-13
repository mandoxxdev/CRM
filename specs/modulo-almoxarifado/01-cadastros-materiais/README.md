# 01 — Cadastros de Materiais

> **Status:** 🟡 — Etapa 2 entregue (2026-08-04): ~21 colunas novas no material (técnicos, reposição, controles, ABC, unidades compra/consumo + fatores), subfamílias via `parent_id` em famílias, `MaterialSchema`/`MaterialUpdateSchema` (Zod) com validação e auditoria de criação/atualização, form em 6 seções. Falta: tabela de conversões genérica, grupo acima de família, motivos/transportadoras/tipos de documento, remover categorias hardcoded do front, `almoxarifadoApi.js`.
> **Spec original:** seções 4.1, 4.2, 4.3
> **Última atualização:** 2026-08-13 (**Etapa 8c, Task 1 (`028da1e`) — criar material virou serviço
> e o gerador de código passou a aguentar lote.** Ver a seção "Entregue na Etapa 8c, Task 1", no
> fim. Nada disso estava documentado nesta feature até agora.)
> Antes: 2026-08-11 (auditoria spec×código: corrigida a afirmação falsa sobre `controle_lote`/`controle_certificado`; refs de linha trocadas por nomes)
> **📋 Plano de implementação:** [docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md) — Tasks 3, 4, 6 (subfamílias, campos do material, form) · Design: [docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md](../../../docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md)

## Objetivo

Cadastro completo de materiais com todos os campos da spec, famílias/subfamílias formais, unidades com conversão e cadastros complementares.

## O que já existe

- Tabela `materiais_almoxarifado` (criada em `services/almoxarifado/schema.js`; colunas v3 e as da Etapa 2 adicionadas via `safeAlter` no mesmo arquivo): codigo UNIQUE, nome, descricao, categoria/categoria_id, familia_id, subcategoria_id, subfamilia_id, unidade, foto, localizacao_padrao_id, quantidade_atual/minima/maxima, custo_unitario/custo_medio, fornecedor_id, ncm, tipo_material, material_critico, controle_lote, controle_certificado, controle_serie, controle_validade, controle_corrida, requer_inspecao, requer_foto, classe_abc, fabricante, codigo_fabricante, peso_unitario, dimensoes, material_construtivo, norma, marca, modelo, aplicacao, ponto_reposicao, lote_economico, unidade_compra/fator_conversao_compra, unidade_consumo/fator_conversao_consumo, permite_saldo_negativo, ativo.
- CRUD completo: rotas GET/POST/PUT/DELETE de `/materiais` em `routes/almoxarifado.js` (validação de família ativa obrigatória, soft delete, foto ≤10 MB, código automático por família/setor). **Desde a Etapa 8c, Task 1 (2026-08-13, `028da1e`), o POST é um chamador magro:** a criação mora em `services/almoxarifado/materialService.createMaterial` — ver a seção do fim; POST/PUT migrados para `validate(MaterialSchema)`/`validate(MaterialUpdateSchema)` (Zod, com coerção de strings do form) na Etapa 2; PUT preserva qualquer campo omitido do payload (inclusive os novos); toda criação/edição grava auditoria (`CRIACAO`/`ATUALIZACAO`) com diff dos campos alterados em `auditoria_log_almoxarifado`.
- Famílias: `familias_material_almoxarifado` + CRUD (rotas de `/familias` em `routes/almoxarifado.js`) com `tipo_uso` (administrativo/industrial/ambos); ganhou `parent_id` na Etapa 2 (subfamílias, máx. 2 níveis, validação de hierarquia em POST/PUT/DELETE).
- Categorias com hierarquia (`parent_id`), 27 seeds. Unidades de medida (12 seeds). Tipos de material (20 no enum + tabela com flags EPI/controlado/assinatura).
- Front: `MateriaisAlmoxarifado.js`, `MaterialAlmoxarifadoForm.js` (reorganizado em 6 seções na Etapa 2: Identificação · Classificação com cascata família→subfamília · Dados Técnicos · Estoque e Reposição · Controles · Unidades e Custos), aba Famílias em `ConfiguracoesAlmoxarifado.js`.
- Testes: cobertura parcial em `almoxarifado.test.js` (material inativo, foto em `materialPhoto.test.js`); Etapa 2 adiciona `server/tests/api/materialCompleto.api.test.js` e `server/tests/api/subfamilias.api.test.js`.

## Checklist

### Campos faltantes no material (spec 4.1)
- [x] Descrição técnica completa (separada da resumida) — coluna `descricao_tecnica` (já existia) agora exposta no form, separada de `especificacoes`
- [x] Unidade de compra + unidade de consumo + fator de conversão (`unidade_compra`/`fator_conversao_compra`, `unidade_consumo`/`fator_conversao_consumo`; `unidade` única continua existindo em paralelo)
- [x] Fabricante + código do fabricante
- [x] Peso unitário e dimensões
- [x] Material construtivo, especificação técnica, norma aplicável, marca, modelo, aplicação
- [x] Ponto de reposição + lote econômico (`ponto_reposicao`, `lote_economico`) — prazo médio de reposição (`prazo_reposicao_dias`) **continua fora do `MaterialSchema`** (usado só em rotina de bulk existente), não migrado nesta etapa
- [x] Controles adicionais: `controle_serie`, `controle_validade`, `controle_corrida`.
  **Correção 2026-08-11:** esta spec afirmava que `controle_lote`/`controle_certificado` "continuam sem verificação efetiva na saída — a aplicação é da feature 10". Isso é **falso desde a Etapa 6** (2026-08-09/10): `stockService.registrarMovimentacao` recusa entrada/saída sem lote em material com `controle_lote` (com isenção declarada dos 4 fluxos internos — decisão de 2026-08-10), e o `receiptService` recusa item de nota sem lote e usa `controle_certificado` para mandar o item para quarentena. Teste dedicado: `server/tests/api/loteControleObrigatorio.api.test.js` (10 casos). A correção vale **só** para essas duas flags — `controle_validade`/`controle_serie`/`controle_corrida` seguem sem enforcement (Etapas 6b/6c).
- [x] Necessidade de inspeção no recebimento / de fotografia (flags `requer_inspecao`, `requer_foto`)
- [x] Classe ABC (`classe_abc`, validado A/B/C) + último custo (`custo_unitario`, já existente, atualizado pelo motor da Etapa 1)
- [ ] Ficha técnica e documentos anexos na tela do material (tabela `anexos_documento_almoxarifado` já existe, entidade `material`; não trabalhado nesta etapa)

### Famílias / subfamílias / grupos
- [x] **Decisão tomada (2026-08-04):** subfamílias formalizadas via `parent_id` na própria `familias_material_almoxarifado` (máximo 2 níveis — subfamília não pode ter filhos). Material ganhou `subfamilia_id`, validado como filha da `familia_id` do material (400 caso contrário). `subcategoria_id`/categoria hierárquica não foram tocados — convivem sem relação formal com o novo `parent_id`.
- [ ] Grupo (nível acima de família) — não avaliado nesta etapa

### Cadastros complementares (spec 4.3)
- [x] Unidades de medida · fornecedores (módulo compras) · clientes · setores · localizações · perfis de acesso
- [ ] Conversões entre unidades (tabela + API) — **não criada**; decisão de escopo do design (item 3): ficou só como colunas `fator_conversao_compra`/`fator_conversao_consumo` + validação no material, sem tabela genérica de conversão
- [ ] Motivos de movimentação e motivos de ajuste (cadastro, hoje texto livre)
- [ ] Tipos de documento · transportadoras
- [ ] Grupos de e-mail (parcial em `configuracoes_almoxarifado`) · regras de aprovação (feature 06)

### Frontend
- [x] Form de material com os novos campos, em seções (`MaterialAlmoxarifadoForm.js`: Identificação · Classificação com cascata família→subfamília · Dados Técnicos · Estoque e Reposição · Controles · Unidades e Custos)
- [ ] Remover listas de categorias hardcoded duplicadas em `MateriaisAlmoxarifado.js` (`CATEGORIAS` em `:15`), `MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` → usar `/almoxarifado/categorias` — **ainda não feito**. **A Etapa 8c encostou nesta dívida e NÃO a resolveu (2026-08-13):** a sobra da transformação é material normal e usa a categoria "Sucata e sobras reaproveitáveis", que **já existe no `CATEGORIAS_SEED`** — a lista hardcoded do front não a tem, e é diferente da tabela seedada. Resolver mexe em **três telas** por um motivo que não era o da etapa, então ficou de fora **de propósito**; segue aberta, e cada etapa que cria material por caminho novo aumenta a chance de a lista do front mentir
- [ ] Criar `client/src/services/almoxarifadoApi.js` (camada de service, padrão de `frotasApi.js`) — **não criado**

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Código interno é único; duplicado → 409/400 | `materialCompleto.api.test.js`: "REGRESSÃO: POST código duplicado → 400 Código já existe" · `materialServiceCriacao.api.test.js`: "codigo repetido SEM codigo_auto continua dando 400 'Código já existe'" |
| Com `codigo_auto`, colisão de código regera em vez de recusar (até 5 tentativas) e cadastro em lote não repete número | `materialServiceCriacao.api.test.js`: "proximo-codigo em LOTE nao repete: 5 criacoes concorrentes dao 5 codigos distintos" |
| `GET /proximo-codigo` usa o MAIOR número, não o material de maior `id` | `materialServiceCriacao.api.test.js`: "proximo-codigo usa o MAIOR numero, nao o material de maior id" |
| Material exige família ativa | regra existe na rota (`POST /materiais`); **sem teste de API dedicado** nesta etapa |
| Subfamília deve ser filha da família do material; senão 400 | `subfamilias.api.test.js`: "POST material com familia A + subfamília de B → 400", "POST material com familia raiz + subfamília raiz (não filha) → 400" |
| Fator de conversão ≤ 0 (com unidade compra/consumo informada) → 400 | `materialCompleto.api.test.js`: "POST fator_conversao_compra: 0 ... → 400", "POST unidade_consumo sem fator_conversao_consumo → 400" |
| `classe_abc` fora de A/B/C → 400 | `materialCompleto.api.test.js`: "POST classe_abc inválida (X) → 400", "PUT classe_abc inválida (X) → 400" |
| Alteração de cadastro mantém histórico (spec 29) | `materialCompleto.api.test.js`: "PUT altera nome+marca → auditoria com dados_anteriores/dados_novos SÓ dos campos alterados" |
| Soft delete não some com histórico de movimentações | regra pré-existente; **sem teste de API dedicado** nesta etapa |

## Dependências

- Fundação (00) para os testes de API.
- Histórico de alteração de cadastro depende da auditoria unificada (00.3 / 23).

## Entregue na Etapa 2 (2026-08-04)

Plano completo em [docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md) (Tasks 3, 4, 6 desta feature; Tasks 1, 2, 5, 7 em `02-localizacoes-enderecamento`). Principais arquivos:

- Backend: `server/services/almoxarifado/schema.js` (colunas novas do material + `familias_material_almoxarifado.parent_id`, via `safeAlter`), `server/services/almoxarifado/schemas.js` (`MaterialSchema`/`MaterialUpdateSchema`), `server/routes/almoxarifado.js` (POST/PUT `/materiais` com Zod + auditoria; POST/PUT/DELETE `/familias` com validação de hierarquia de `parent_id`).
- Frontend: `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` (6 seções, cascata família→subfamília).
- Testes: `server/tests/api/materialCompleto.api.test.js`, `server/tests/api/subfamilias.api.test.js`; regressão em `test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`.
- Não entregue nesta etapa: tabela genérica de conversão entre unidades, grupo acima de família, ficha técnica/anexos na tela, motivos/transportadoras/tipos de documento, remoção das categorias hardcoded do front, `almoxarifadoApi.js`, `prazo_reposicao_dias` no `MaterialSchema`.

## Entregue na Etapa 8c, Task 1 (2026-08-13, `028da1e`)

Esta feature não foi o **objetivo** da Etapa 8c — a etapa é a transformação no terceiro (feature
14) —, mas foi ela que precisou criar material a partir de outro serviço, e o cadastro **não tinha
por onde**. O que mudou aqui, e que até agora não estava documentado em lugar nenhum desta spec:

- **A criação de material deixou de ser um `INSERT` inline no handler HTTP.** O único
  `INSERT INTO materiais_almoxarifado` de produção vivia dentro do `app.post('/api/almoxarifado/materiais')`,
  junto com **quatro efeitos que quem só olha o `INSERT` não enxerga**: a movimentação de saldo
  inicial (só quando `quantidade_atual > 0`, para não sujar o extrato de todo material sem saldo),
  o `syncSaldoLocalizacaoPadrao`, a auditoria `CRIACAO` e a releitura enriquecida com a família.
  Qualquer outro caminho teria de fazer HTTP para o próprio servidor ou reimplementar os cinco
  passos. Agora existe **`services/almoxarifado/materialService.createMaterial`** e a rota é um
  chamador magro. **O gate `requirePermission('criar_material')` FICA NA ROTA**, de propósito: os
  caminhos internos já passaram pelo gate deles, e duplicar a checagem recusaria chamada de serviço
  para serviço.
- **`GET /proximo-codigo` deixou de usar `ORDER BY id DESC`.** Aquilo devolvia o código do registro
  de **maior `id`**, não o de **maior número**: cadastrar `CHP-010` e depois `CHP-002` fazia o
  gerador olhar `CHP-002` (id maior) e propor `CHP-003`, que já podia existir. Passou a usar o
  **MAX do sufixo numérico** (`MAX(CAST(substr(codigo, …) AS INTEGER))`, com `GLOB '[0-9]*'` além do
  `LIKE` — sem ele, `CHP-ESPECIAL` viraria `0` em silêncio e `CHP-12A` viraria `12`, competindo com
  os números de verdade).
- **Campo novo e explícito `codigo_auto`** (`MaterialShape`/`MaterialSchema`). Quando verdadeiro, o
  `codigo` recebido é **sugestão**: a colisão de UNIQUE faz o serviço **regerar pelo `proximoCodigo`
  da família e tentar de novo**, até `TENTATIVAS_CODIGO_AUTO` = **5**. **Sem `codigo_auto`, o
  comportamento é idêntico ao de sempre** — colisão continua sendo `400 "Código já existe"`, e a
  tela de cadastro manual **não muda em nada** (quem digitou o código quer saber que ele já existe,
  não ganhar outro). É isso que permite cadastrar **vários materiais em sequência**, o caso do modal
  de transformação da 8c: `proximoCodigo` **só lê**, então N chamadas concorrentes devolveriam o
  mesmo número — a colisão é resolvida onde ela de fato acontece, no `INSERT`.
  *(Descartado: reservar o número numa tabela de sequência — custa tabela nova, caminho de limpeza
  para números reservados e não usados, e uma segunda fonte de verdade sobre qual código existe,
  para um problema que o retry resolve em 6 linhas. Descartado: tornar `codigo` opcional no
  `MaterialSchema` quando há família — mudaria o contrato da API para todo mundo por causa de um
  caso.)*
- Testes: `server/tests/api/materialServiceCriacao.api.test.js` (13 casos), **três deles guardas de
  refactor** que comparam a linha gravada pela **rota** com a gravada pelo **serviço**, coluna a
  coluna — lista de campos escolhida a dedo aprovaria o refactor que esqueceu a coluna que ninguém
  lembrou de listar.

> **Correção de uma expectativa que virou afirmação em outros documentos:
> `buildLocalizacaoPath`/`formatLocalizacaoLabel` NÃO ficaram duplicados.** O plano da 8c mandava
> mantê-las em `routes/almoxarifado.js` alegando que tinham outros usos ali (listagem de
> localizações) e registrar a duplicação como dívida conhecida. **O plano estava errado**: o único
> chamador era o `resolveLocalizacaoFromFk` logo abaixo, que passou a delegar. As duas foram
> **REMOVIDAS da rota** e vivem só em `materialService.js` — há um comentário no lugar delas em
> `routes/almoxarifado.js` dizendo exatamente isso. **A dívida que se esperava registrar aqui não
> existe.** *(Verificado por leitura do código em 2026-08-13: não há definição dessas funções em
> `routes/almoxarifado.js`, só a menção no comentário.)* O que **de fato** foi divergência do plano
> e vale como registro: as funções foram copiadas **literalmente** do handler em vez de reescritas —
> reescrevê-las mudaria, calado, o rótulo gravado na coluna `localizacao` de todo material criado
> pelo serviço, e a guarda de refactor não pegaria porque o corpo de teste não manda
> `localizacao_padrao_id`.
