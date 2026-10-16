# 01 — Cadastros de Materiais

> **Status:** 🟡 — **continua 🟡. Etapa 124 (`a5e9d30f..5b5e3998`): o formulário de material manda a família e a subfamília que
> leu e o salvar que desfaria a mudança de outra pessoa é recusado (D (123), B800); a aba Famílias lista as inativas e as reativa
> sem apagar descrição e tipo de uso (B802, B803)** — ver a seção "Etapa 124", no fim. Não fecha item do checklist. Antes:
> **Etapa 123 (`40b7e08e..0106f6b5`): reorganizar famílias confere e grava no mesmo passo (C221),
> o dono do material tem de estar em Clientes (C216) e o pai 0 deixa de nascer e vira família principal no boot (C223)** — ver a
> seção "Etapa 123", no fim. Não fecha item do checklist (regras de integridade do cadastro). Antes: **Etapa 116 (`fe93cc10..96a90ce2`): o formulário de material manda os controles que leu ao
> abrir e o salvar que desfaria o controle mudado por outra pessoa é recusado (C233); o estorno de Saída com séries (e a
> exclusão de requisição) com a série desligada depois é recusado (C232)** — ver a seção "Etapa 116", no fim. Não fecha item
> do checklist (regra de integridade do cadastro). Antes: **Etapa 115 (`e60e34e1..385d938f`): o salvar que liga ou desliga lote/série grava sob a trava do
> material (C226) e desligar a série com séries em estoque exige `ajustar_estoque` (C225)** — ver a seção "Etapa 115", no
> fim. Não fecha item do checklist (regra de integridade do cadastro). Antes: **Etapa 113 (`508eb6c4..6ed479a6`): inativar material com saldo ou retenção é recusado para
> todos (C217, C227), reativar confere a família (C220) e a lista de Materiais ganha Inativos + Reativar** — ver a seção
> "Etapa 113", no fim. Não fecha item do checklist (regra de integridade do cadastro). Antes: **Etapa 112 (`a8cda2ad..d7b0cae8`): ligar controle por lote ou por série num material
> com saldo não identificado passa a exigir `ajustar_estoque` (C222)** — ver a seção "Etapa 112", no fim. Não fecha item
> do checklist (regra de integridade do cadastro). Antes: **Etapa 110 (`233f4787..e5584a85`): o Saldo Inicial do cadastro passa pelo motor de estoque (C215) e a
> corrida família × cadastro fecha dos dois lados (C218)** — ver a seção "Etapa 110", no fim. Não fecha item do checklist
> (as duas são regra de integridade do cadastro, não campo novo). Antes: **a Etapa 66 fecha mais um item** (motivos de movimentação —
> `de04974..40dd180`). Seguem abertos: tabela de conversões genérica, grupo acima de família,
> **transportadoras e tipos de documento**, `almoxarifadoApi.js`, e o que a Etapa 66 deixou de fora
> do próprio item de motivos (ver o item no checklist). Histórico do status: a Etapa 26 fechou as
> categorias hardcoded; a Etapa 34 pagou a ficha técnica/anexos na tela (`eb89b5e`). Etapa 2 entregue (2026-08-04): ~21 colunas novas no material (técnicos, reposição, controles, ABC, unidades compra/consumo + fatores), subfamílias via `parent_id` em famílias, `MaterialSchema`/`MaterialUpdateSchema` (Zod) com validação e auditoria de criação/atualização, form em 6 seções.
> **Spec original:** seções 4.1, 4.2, 4.3
> **Última atualização:** 2026-10-01 (**Etapa 66 (`de04974..40dd180`) — motivos de movimentação
> viraram cadastro.** Ver a seção "Entregue na Etapa 66", no fim.)
> Antes: 2026-09-16 (**Etapa 34 (`746a106..054f727`) — a tela de materiais ganhou
> anexos.** Clipe na coluna de ações de cada linha abrindo o modal **Anexos** (entidade `material`,
> `eb89b5e`); zero linhas de servidor na etapa inteira. E a frase "plugar aqui é uma linha", que
> esta spec repetia desde a Etapa 32, **estava errada** — ver a correção no item de checklist de
> anexos.)
> Antes: 2026-08-29 (**Etapa 26 (`1bca087..9d86a84`) — o catálogo de categorias
> virou cadastro e as três telas pararam de hardcodar a lista.** Ver a seção "Entregue na Etapa
> 26", no fim.)
> Antes: 2026-08-13 (**Etapa 8c, Task 1 (`028da1e`) — criar material virou serviço
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
- Categorias: 27 seeds em `CATEGORIAS_SEED`, **CRUD completo desde a Etapa 26** (`GET [?todos=1]`/`POST`/`PUT`/`DELETE` em `routes/almoxarifado/extended.js`, gate `requirePermission('configurar')`, soft delete, auditoria com entidade `categoria`, `CREATE UNIQUE INDEX idx_categorias_almox_nome`) + aba **Categorias** em `ConfiguracoesAlmoxarifado.js`. A coluna `parent_id` da tabela **existe e continua sem uso nenhum** — a hierarquia nunca foi construída, e o CRUD da Etapa 26 não a toca (a lista é plana, de propósito). Unidades de medida (12 seeds). Tipos de material (20 no enum + tabela com flags EPI/controlado/assinatura).
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
- [x] Ficha técnica e documentos anexos na tela do material — **`eb89b5e`** (Etapa 34, 2026-09-16): cada linha da tabela de materiais ganhou um **botão de clipe** na coluna de ações (`title` "Anexos e documentos deste material") que abre o modal **Anexos** com o subtítulo `código — nome` e, dentro, o bloco completo (listar, enviar, baixar, remover) na entidade `material`. O botão **não** é gateado por perfil (RN-03 do design, decisão B68): quem enxerga a tela vê o clipe; quem pode *enviar* e *remover* é decidido **dentro** do bloco, pelo backend. A metade "ficha técnica" já estava paga pelos campos técnicos da Etapa 2 (itens acima) — o que faltava era só o anexo. *(Esta linha dizia, até 2026-09-16: "tabela `anexos_documento_almoxarifado` já existe, entidade `material`; não trabalhado nesta etapa" — era verdade na Etapa 2.)*
      **Etapa 32 (`e708125..fd71958`): o MECANISMO existe, está testado, e falta SÓ o plug desta
      tela.** A entidade é `material`, já no mapa fechado do serviço.
      A `anexos_documento_almoxarifado` era **órfã** — zero leitor, zero escritor, sem índice —,
      e virou `services/almoxarifado/anexoService.js` (mapa fechado de seis entidades,
      existência do registro-pai verificada, soft delete, auditoria) mais as rotas
      `POST/GET/DELETE /almoxarifado/anexos` e `GET /almoxarifado/anexos/:id/arquivo`, esta com
      **download autenticado** — o arquivo NÃO é servido estaticamente. No client existe o
      componente genérico `client/src/components/almoxarifado/AnexosDocumento.js`.
      **Plugar aqui é uma linha** — `<AnexosDocumento entidade="CHAVE" entidadeId={id} />` — mais
      dois cenários de teste. **Ponto de atenção medido na Etapa 32:** confira QUANDO o `id`
      existe nesta tela. Na inspeção o plug teve de ir para a aba Histórico, porque a linha só
      nasce **depois** da decisão — anexar antes penduraria o arquivo num id inexistente.

      **⚠️ Correção da Etapa 34 (2026-09-16, `746a106..054f727`).** O parágrafo acima dizia que
      **"plugar aqui é uma linha"**; isso **ESTAVA ERRADO**, e ficou errado nesta spec (e em mais
      quatro) por duas semanas. O certo, medido no design `6ccaf40` e confirmado na execução: das
      cinco telas que faltavam, **três — Materiais, Devoluções e o item da remessa a terceiros —
      não tinham casa nenhuma para o bloco** (sem linha expansível, sem painel de detalhe), então
      foi preciso construir antes uma **casca de modal** (`AnexosModal` + `titulo` opcional em
      `AnexosDocumento`, `746a106`) e um **botão por linha**; esta tela é uma das três. E mesmo as
      duas que tinham painel (requisição e recebimento) não foram uma linha: o bloco precisou
      **sair do ternário de `loadingDetalhe`** (`c5d9e99`) para não remontar a cada refetch, e o da
      requisição precisou de **gate por `warehouseMode`** (`a88d715`, decisão B71). O texto da
      Etapa 32 fica acima **de propósito** — o mecanismo que ele descreve continua exato; errada
      era só a estimativa do custo do plug.

### Famílias / subfamílias / grupos
- [x] **Decisão tomada (2026-08-04):** subfamílias formalizadas via `parent_id` na própria `familias_material_almoxarifado` (máximo 2 níveis — subfamília não pode ter filhos). Material ganhou `subfamilia_id`, validado como filha da `familia_id` do material (400 caso contrário). `subcategoria_id`/categoria hierárquica não foram tocados — convivem sem relação formal com o novo `parent_id`.
- [ ] Grupo (nível acima de família) — não avaliado nesta etapa

### Cadastros complementares (spec 4.3)
- [x] Unidades de medida · fornecedores (módulo compras) · clientes · setores · localizações · perfis de acesso
- [ ] Conversões entre unidades (tabela + API) — **não criada**; decisão de escopo do design (item 3): ficou só como colunas `fator_conversao_compra`/`fator_conversao_consumo` + validação no material, sem tabela genérica de conversão
- [x] Motivos de movimentação e motivos de ajuste (cadastro, hoje texto livre) — **FEITO na Etapa 66 (2026-10-01)**:
  cadastro `de04974` (tabela, CRUD com gate `configurar`, auditoria), uso na movimentação `56d8b38` (`motivo_id` na v2,
  na `/transferencias` e no motor; o livro grava o nome da época + o id), aba em Configurações `448e5d7`, escolha na
  tela de movimentação + justificativa no livro/extrato `139dda2`, relatório "Histórico de movimentações" com colunas
  Motivo/Justificativa e filtro por motivo `1998227`, integração ponta a ponta `f6c9979`, revisão adversarial
  `40dd180`. **Escopo:** o cadastro **acompanha** o texto livre (B261). **Ficou de fora, de propósito:**
  - [ ] tornar obrigatório escolher do cadastro (por tipo, configurável) — depende de o cadastro estar em uso;
  - [ ] motivo do cadastro na v1 (`POST /movimentacoes`, movimentação rápida da tela de Materiais), bloqueio/
    desbloqueio, inventário, estorno, NC e devolução — continuam texto fixo + justificativa livre (os tipos deles não
    estão na rota genérica; DESBLOQUEIO colidiria com o rótulo da liberação por NC);
  - [ ] regra própria por motivo de ajuste (ex.: dupla aprovação por motivo) — feature 06;
  - [ ] migrar o texto livre antigo para o cadastro — não, como nas categorias (consulta A6);
  - [ ] indicador/gráfico "movimentações por motivo" — o mínimo foi a coluna e o filtro.
- [ ] Tipos de documento · transportadoras
- [ ] Grupos de e-mail (parcial em `configuracoes_almoxarifado`) · regras de aprovação (feature 06)

### Frontend
- [x] Form de material com os novos campos, em seções (`MaterialAlmoxarifadoForm.js`: Identificação · Classificação com cascata família→subfamília · Dados Técnicos · Estoque e Reposição · Controles · Unidades e Custos)
- [x] Remover listas de categorias hardcoded duplicadas em `MateriaisAlmoxarifado.js`, `MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` → usar `/almoxarifado/categorias` — **FEITO na Etapa 26 (2026-08-29, `f047948`)**, via o hook único `client/src/hooks/useCategoriasMaterial.js`; nenhuma das três constantes existe mais. A dívida estava aberta desde a Etapa 2 e a Etapa 8c encostou nela sem resolver (a sobra da transformação usa "Sucata e sobras reaproveitáveis", que existe no `CATEGORIAS_SEED` e **não** existia na lista do front).
  > **AVISO PARA QUEM FOR MEDIR ESTA SPEC: esta linha estava CERTA e a Fase 0 da Etapa 26 a
  > ignorou.** A varredura de abertura daquela etapa escreveu "3 arquivos" e nomeou **dois**
  > (contou duas linhas do mesmo `MaterialAlmoxarifadoForm.js` como se fossem arquivos
  > diferentes), deixando `MateriaisAlmoxarifado.js` de fora — **e esta linha aqui já nomeava os
  > três corretamente e já dizia "mexe em três telas"**. A Fase 2 pegou o erro (achado A1) antes de
  > qualquer código, mas executado como estava o plano teria violado a própria RN-01 da etapa e
  > deixado esta pendência impossível de marcar como fechada. **A regra que saiu disso: ler a spec
  > da feature ANTES de medir o código** — foi a segunda etapa seguida (a 24 foi a primeira) em que
  > uma varredura sobre "o que existe no client" errou tendo a resposta pronta no repositório.
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
| Motivo de movimentação: nome único (maiúsculas, acento, espaços e invisíveis), tipos válidos, gate `configurar`, desativar não apaga (Etapa 66) | `motivosMovimentacaoCrud.api.test.js` (18 cenários) |
| Movimentação com `motivo_id`: grava nome da época + id; 5 recusas literais nas três portas (v2, `/transferencias`, serviço); v1 ignora (Etapa 66) | `motivosMovimentacaoUso.api.test.js` (11 cenários) |
| Ponta a ponta pela rota: cadastrar → listar por tipo → movimentar → livro/extrato → relatório filtrado → renomear não reescreve → desativar recusa → estorno fora do filtro (Etapa 66) | `motivosMovimentacaoIntegracao.api.test.js` (8 cenários) |
| Histórico de movimentações: colunas Motivo/Justificativa e filtro por `motivo_id` (por id, não por texto) (Etapa 66) | `relatorioMotivoMovimentacao.api.test.js` (5 cenários) |

## Dependências

- Fundação (00) para os testes de API.
- Histórico de alteração de cadastro depende da auditoria unificada (00.3 / 23).

## Entregue na Etapa 2 (2026-08-04)

Plano completo em [docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md) (Tasks 3, 4, 6 desta feature; Tasks 1, 2, 5, 7 em `02-localizacoes-enderecamento`). Principais arquivos:

- Backend: `server/services/almoxarifado/schema.js` (colunas novas do material + `familias_material_almoxarifado.parent_id`, via `safeAlter`), `server/services/almoxarifado/schemas.js` (`MaterialSchema`/`MaterialUpdateSchema`), `server/routes/almoxarifado.js` (POST/PUT `/materiais` com Zod + auditoria; POST/PUT/DELETE `/familias` com validação de hierarquia de `parent_id`).
- Frontend: `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` (6 seções, cascata família→subfamília). **Desde a Etapa 37 (linha `main`, 2026-10-07):** a aba *Famílias* de `ConfiguracoesAlmoxarifado.js` cadastra subfamílias ("Nova subfamília" no cartão da raiz, árvore na lista); `GET /familias` conta itens por `subfamilia_id` para subs; `GET /familias/:id/itens` e `GET /materiais?subfamilia_id=` idem; `DELETE /familias/:id` passou a recusar subfamília com itens ativos (antes passava — era defeito). ⚠️ Esta spec dizia, por omissão, que a tela de subfamília estava entregue; o guia (`:751`, `:4620`) é que registrava "só via API". Plano: `docs/superpowers/plans/2026-10-07-crm-etapa37-subfamilias-na-aba-familias.md`.
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

## Entregue na Etapa 26 (2026-08-29, `1bca087..9d86a84`)

**A dívida "categorias hardcoded no front" fechou** — estava aberta desde a Etapa 2 (2026-08-04),
foi encostada e não resolvida pela Etapa 8c, e era a pendência mais antiga desta feature ainda de
pé. Junto com ela, o catálogo deixou de ser semente morta e virou cadastro.

**O estado que a etapa encontrou, medido:** duas listas de categorias coexistindo, **sem uma única
categoria em comum**. A das telas — 11 nomes em maiúsculas (`CONSUMÍVEL`, `FERRAMENTA`, `EPI`…) —
hardcoded em três componentes. A do servidor — as 27 de `CATEGORIAS_SEED`, taxonomia de
metalúrgica — semeada em `categorias_material_almoxarifado` e **com zero materiais usando**. O
`GET /api/almoxarifado/categorias` já existia e já era consumido por `ConfiguracoesAlmoxarifado.js`
(o seletor de catálogo por setor); o que não existia era **POST/PUT/DELETE** e nenhum formulário de
material lia dali. No banco de desenvolvimento: **2 materiais, ambos `CONSUMÍVEL`**.

### Task 1 (`1bca087`) — o catálogo virou cadastro

- **POST/PUT/DELETE** em `routes/almoxarifado/extended.js`, ao lado do `GET` que já morava lá.
  **Molde híbrido por assunto**, e a escolha está escrita no código porque o molde óbvio é o
  errado: gate e auditoria dos **centros de custo** (mesmo arquivo — o `auditarCadastro` de
  famílias é closure **não exportada** de `routes/almoxarifado.js`, inalcançável dali); régua de
  nome e unicidade dos **setores**; soft delete dos **tipos de material** na versão corrigida pela
  Etapa 23 (`AND ativo = 1`, 404 para inexistente, 200 `ja_inativo` idempotente **sem auditar**).
  **Famílias não é molde de nada aqui** — tem `parent_id`, validação de pai, bloqueio de inativação
  com filhas e código automático, e **não tem unicidade de nome**, que é justamente o que a etapa
  precisava.
- **`CREATE UNIQUE INDEX idx_categorias_almox_nome`** em `services/almoxarifado/schema.js` — a
  tabela não tinha índice nenhum.
- **`?todos=1`** no `GET` (molde do centro de custo, o GET vizinho no mesmo arquivo), sem o qual a
  aba de CRUD não teria como reativar o que desativou.
- **`categoria: 'Categoria'`** em `ROTULOS_ENTIDADE` (`auditLabels.js`) — sem isso a entidade nova
  apareceria crua no filtro da tela de auditoria.
- Testes: `server/tests/api/categoriasCrud.api.test.js` (11 cenários), com matriz de perfis
  (7 perfis × 3 verbos = 21 acessos indevidos nomeados no vermelho).

**Duas correções que a execução fez no plano** (o plano estava incompleto, não errado):

1. **A RN-06 só falava de CRIAR duplicada.** Sem a mesma régua no `PUT`, renomear para um nome já
   ocupado devolvia **500** em vez de 400 — e a tela, que mostra o `error` do servidor cru, diria
   "erro interno" para um erro de preenchimento.
2. **O `CREATE UNIQUE INDEX` não podia ficar solto.** O plano dizia "aplica limpo (medido)" — e o
   medido foi o **dev**. Numa base de cliente com dois nomes iguais, a exceção subiria pelo
   `initSchema` inteiro e derrubaria o módulo por causa de duas linhas de catálogo. Ficou em
   `try/catch` com log que traz o `GROUP BY ... HAVING COUNT(*) > 1` pronto. **Consequência
   declarada:** se houver duplicatas em produção, o índice **não é criado** e a regra de unicidade
   não vale — é a consulta **A7** do documento de apresentação.

### Task 2 (`f047948`) — as três telas pararam de hardcodar

Ponto único de busca: **`client/src/hooks/useCategoriasMaterial.js`**, consumido por
`MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` e `MateriaisAlmoxarifado.js`. Devolve os
**nomes**, porque é nome que `materiais.categoria` guarda. **Sem cache de módulo, de propósito**
(ao contrário de `useAlmoxPermissoes`): com cache, a categoria recém-criada na aba não apareceria
no select até um reload completo — o mesmo "a tela mente" que a etapa existe para corrigir.

**Dois defeitos que a medição encontrou e que o design não tinha visto:**

- **A tela mostrava a primeira opção da lista** para material gravado com categoria fora dela. O
  `<select>` é controlado por state e o React **não dispara `onChange`** para valor ausente das
  opções: DOM `select.value = "Chapas"` enquanto o payload mandava `"CONSUMÍVEL"`. O design tinha
  descrito o bug **errado** ("salvar trocaria a categoria em silêncio") — não troca, e o real é
  pior, porque não deixa rastro. Corrigido concatenando o valor atual, rotulado
  `(fora de catálogo)`.
- **"Nascer vazio" não bastava.** `materialService.createMaterial` faz
  `categoria: categoria || 'OUTROS'`: mandar vazio trocaria "nasce `CONSUMÍVEL`" por "nasce
  `OUTROS`" — as duas fora do catálogo, e a segunda escolhida pelo **servidor**, sem sequer
  aparecer na tela. Por isso o submit **barra o vazio antes do POST** (*"Selecione a categoria do
  material"*). A trava é **só do vazio**: categoria fora de catálogo continua salvando.

### Task 3 (`c87fe92`) — a aba Categorias em Configurações

Criar, renomear, desativar e **reativar**, com o aviso da RN-05 no renomear e a mensagem do
servidor exibida crua. O `GET` vai sempre com `?todos=1`; o `PUT` de rename **omite** `ativo` (a
rota preserva), e o de reativação manda `ativo: 1` explícito.

### Task 4 (`9d86a84`) — integração

`server/tests/api/categoriaIntegracao.api.test.js` (4 cenários): criar pela rota → aparecer no
`GET` → classificar material → **ler pela tela-contrato da auditoria**
(`GET /auditoria?entidade=categoria`), conferindo rótulo, autor e de/para, e que
`/auditoria/opcoes` passa a **oferecer** `categoria` no filtro.

### O que esta etapa deliberadamente NÃO fez

- **Não migrou material nenhum.** A coluna `materiais.categoria` continua com o valor que tinha.
  A consulta de produção é a **A6** do documento de apresentação; a decisão é do usuário.
- **Renomear não propaga** (RN-05) — a coluna é texto livre, não chave estrangeira. Está declarado
  na tela e virou a decisão **B58**.
- **Categoria não virou chave estrangeira.** É o que tornaria a RN-05 desnecessária, e é migração
  de schema sobre o cadastro de material: etapa própria.
- **`parent_id` da tabela continua sem uso.** O CRUD trata a lista como plana.

## Etapa 108 (2026-10-15, `cd7d5118..bc415eb6`) — o campo Proprietário ganha guarda na edição

Não fecha item deste checklist (a regra é da feature 13): o `PUT /materiais/:id` passa a recusar com 403 a troca do
proprietário de material com saldo, retenção ou livro para quem não tem `ajustar_material_cliente`, antes de qualquer
validação do cadastro (B713–B715). O formulário não mudou. Achados de cadastro registrados, **não** resolvidos: o **Saldo
Inicial** da criação grava ENTRADA fora do motor (`materialService.createMaterial`, C215 — a Etapa 110) e a API aceita
`proprietario_cliente_id` de cliente inexistente (C216). A cor continua 🟡.

## Etapa 110 (2026-10-15, `233f4787..e5584a85`) — o Saldo Inicial pelo motor, e a corrida da família

- [x] **Saldo Inicial pelo motor (C215)** — `a5173c00`. `POST /materiais` com `quantidade_atual` > 0 (arredondada a
  1e-6): sem `movimentar` → 403 *"Cadastrar material com saldo inicial exige a permissão "movimentar" (seu perfil: …) — …"*
  (rota, depois do Zod); com `controle_lote`, `controle_serie`, `requer_inspecao` ou `proprietario_cliente_id` → 400
  *"O material ⟨código⟩ não pode nascer com saldo inicial: ⟨motivos⟩. …"* (serviço, antes da família); o permitido é
  `stockService.registrarMovimentacao(ENTRADA, motivo 'Saldo inicial de cadastro', destino = a padrão)` sobre o material
  gravado com 0; a recusa do motor (ex.: padrão bloqueada, B723) apaga o material recém-criado (B724). Decisão B721
  (descartado: tirar o campo).
- [x] **Corrida família × cadastro (C218, B61 de Compras)** — `96f28b29`. `createMaterial` grava com `INSERT … SELECT
  … WHERE EXISTS` (família raiz ativa, sub ativa filha) em toda tentativa do `codigo_auto`; o `PUT` de material, quando
  valida família/sub, leva a mesma condição no `UPDATE`; o `DELETE` e o `PUT {ativo: 0}` de família levam `NOT EXISTS`
  material ativo e subfamília ativa. Não gravou → relê e responde a literal de hoje (409 só quando a família vira duas
  vezes, E3, ou o PUT de material perde por outra coisa, E4). Decisão B722.
- [x] **Aviso na tela (RN-11)** — `28907d0d`. Frase sob o Saldo Inicial no cadastro novo com lote, série, inspeção ou
  cliente; não trava o campo (B725).
- [x] **Integração** — `7c578b56` (rota e serviço, K1–K3).
- [x] **Fase 5** — `e5584a85`: o PUT de família não regrava o `ativo` omitido (B727) e a 2ª tentativa do "já inativada por
  outro" leva a condição; 9 cenários novos das sabotagens verdes.
- [ ] **Fora, de propósito (B726):** ~~reativar material em família inativa (**C220**)~~ — *feita na Etapa 113*, mudar o nível de família e criar
  subfamília sob raiz sendo inativada (**C221**) — *feita na Etapa 123 (seção abaixo)*, ~~ligar lote/série/inspeção num material com saldo (**C222**)~~ — *a
  C222 foi feita na Etapa 112 (seção abaixo).*

**A C215 estava parcialmente errada — fica dito.** Ela dizia que o saldo inicial pulava "as regras da Entrada da tela"
inclusive o documento do material de cliente e a inspeção. **Estava errado**: a Entrada manual não exige nenhum dos dois
(medido: 201); quem exige é o Recebimento. Por isso o saldo inicial desses dois casos é **recusado**, não convertido em
Entrada manual — e o furo da Entrada manual é a **C219**. **A B61 de Compras dizia que a importação de material usava o
mesmo `createMaterial` — estava errado**: não existe importação de material (o único `INSERT INTO materiais_almoxarifado`
do servidor é o do serviço).

## Entregue na Etapa 66 (2026-10-01, `de04974..40dd180`) — motivos de movimentação viram cadastro

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa66-motivos-de-movimentacao.md`.

| Task | Commit | O que entregou |
|---|---|---|
| T1 (tronco) | `de04974` | tabela `motivos_movimentacao_almoxarifado` (`nome`, `nome_normalizado` UNIQUE, `tipos` JSON, `ativo`), serviço `services/almoxarifado/motivoMovimentacao.js`, `GET/POST/PUT/DELETE /api/almoxarifado/motivos-movimentacao` (+ `GET …/tipos`), escrita com `configurar`, auditoria `motivo_movimentacao` |
| T2 (tronco) | `56d8b38` | `motivo_id` na movimentação: resolvido no topo de `stockService.registrarMovimentacao` (antes da desestruturação), `movimentacoes_almoxarifado.motivo_id`, `MovimentacaoSchema.motivo_id: z.unknown()` — a mesma mensagem nas três portas |
| T4 (galho) | `448e5d7` | aba **Motivos de Movimentação** em Configurações |
| T5 (galho) | `139dda2` | select de motivos por tipo + "Outro (digitar)" + complemento na Nova Movimentação; justificativa no livro e no extrato (RN-08) |
| T3 (galho) | `1998227` | Histórico de movimentações: colunas Motivo/Justificativa e filtro `motivo_id`; o render genérico de parâmetros ganhou `tipo: 'select'` com `opcoes_url` |
| T6 (integração) | `f6c9979` | ponta a ponta pela rota (8 cenários) |
| Fase 5 | `40dd180` | nome com espaços/invisíveis; complemento não-texto na `/transferencias`; a tela não perde a escolha calada |

**Medido na Fase 0, que nenhum documento dizia:** o motor exige **`justificativa`**, não `motivo` — a tela só funcionava
porque copiava o texto nos dois campos; o livro e o extrato mostravam só o `motivo`, então o porquê digitado em
bloqueio, inventário e estorno (gravado em `justificativa`) **nunca aparecia**; e o relatório "Histórico de
movimentações" não tinha coluna de motivo, nem no export.

**O plano da etapa tinha um erro, registrado lá:** dizia "export CSV" — o export do histórico é **XLSX**; o teste
confere os cabeçalhos do XLSX.

**Para a rastreabilidade futura:** `motivo` na linha do livro é o nome **da época** (renomear não reescreve); o filtro por
motivo é pelo **id** (`m.motivo_id`), nunca pelo texto.

## Etapa 112 (2026-10-15, `a8cda2ad..d7b0cae8`) — ligar lote ou série com saldo não identificado

- [x] **A guarda (C222)** — `528a44a0`. `PUT /materiais/:id` que liga `controle_lote` ou `controle_serie` (0 → 1 contra o
  gravado) num material com **sobra sem lote atribuído ≠ 0** (lote; a conta de `lotService.resumoLotesDoMaterial`) ou
  **físico ≠ séries presentes** (série; `EM_ESTOQUE` + `BLOQUEADA`), por quem não tem `ajustar_estoque` → 403 *"Ligar o
  controle ⟨nomes⟩ no material ⟨código⟩ exige a permissão "ajustar_estoque" (seu perfil: ⟨perfil⟩): ⟨partes⟩. …"*, depois da
  guarda do dono e antes da família. Para quem não pode regularizar, o `UPDATE` leva a régua e o controle gravado como
  condição; a releitura responde na ordem dono → controle → família → E4. Decisões **B728**–**B731**.
- [x] **Integração** — `51df3c3c` (lote, série, material de cliente e o caminho do Almoxarife, até a Saída depois de
  regularizar).
- [x] **Fase 5** — `d7b0cae8` (10 cenários das sabotagens que passavam; nenhuma mudança de produção).
- [ ] **Fora, de propósito:** aviso ao Administrador que liga com saldo não identificado (**C224**); desligar a série com
  séries presentes (**C225**); a Entrada que começou antes de o controle ser ligado (**C226**) *(as duas — Etapa 115, seção
  abaixo; a C225 só para o Almoxarife e a Engenharia)*; reativar material em
  família inativa (**C220**) e inativar material com saldo (**C217**, **C227**) — a Etapa 113 (*feita, seção abaixo*).

**A C222 estava parcialmente errada — fica dito.** Ela dizia que ligar **inspeção** com saldo também travava a saída.
**Estava errado**: *Requer inspeção* não é lida por saída nenhuma (quem retém no Recebimento é *Material crítico*). E dizia
que o Administrador regulariza o lote "com um Ajuste" — **também errado**: o Ajuste sozinho corrige o total; o que dá lote
ao saldo é a Entrada com o lote + o Ajuste do total (B730). O plano desta etapa partiu de "recusar para todos e zerar o
saldo"; a revisão do plano derrubou (consumo fictício, impossível no material de cliente, tranca a regularização de séries
— B728).

## Etapa 113 (2026-10-15, `508eb6c4..6ed479a6`) — a situação do material não prende saldo

Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa113-situacao-do-material.md`.

- [x] **Inativar com saldo (C217, C227)** — `082c210a`. `DELETE /materiais/:id` e `PUT /materiais/:id` com `ativo` 1 → 0 num
  material com físico ou retenção ≠ 0 (6 casas) → 400 *"Não é possível inativar o material ⟨código⟩: o saldo físico é …"*,
  para todos (B733). A condição vai no `UPDATE` (`SEM_SALDO_SQL`; no DELETE também `ativo = 1`), sob
  `trava.naTravaDoMaterial` (o motor lê `ativo` e credita dentro dela); não gravou → relê. O DELETE de material já inativo
  não escreve e a auditoria é pelo `changes`.
- [x] **Reativar confere a família (C220)** — `082c210a`. `ativo` 0 → 1 valida família/subfamília com as literais de sempre e
  leva `condicaoFamiliaSql` (B736). O PUT leva sempre `AND ativo IS ⟨lido⟩` (B737).
- [x] **Lista e tela** — `GET /materiais?status=inativo` em `082c210a`; filtro Inativos, selo, Reativar e a mensagem do
  servidor no toast do Inativar em `e6671ce8` (B735).
- [x] **Integração** — `9abef080` (Saída → inativar; Devolver ao cliente → inativar; reativar família → reativar material;
  reserva → cancelar → inativar; conferência aberta → reativar → concluir).
- [x] **Fase 5** — `6ed479a6`: o estorno de movimento de material inativo é recusado (no motor, `cancelarMovimentacao`;
  o crédito do estorno de Saída leva `AND ativo = 1`), a recusa do PUT que inativa e liga o lote relê o saldo, e 14
  cenários das sabotagens que passavam (B738).
- [ ] **Fora, de propósito (B734):** documento aberto não impede inativar — conferência e nota travam depois (**C228**); a
  requisição pendente de material inativado é aprovada sem reserva (**C229**, Etapa 114). *(Paga na Etapa 114 — `a113a657`,
  `071f6c7b`: a aprovação, o envio e a separação recusam; ver a spec 04. A frase "a separação recusa depois", da C229,
  **estava errada**: a separação aceitava.)*

**O design desta etapa tinha uma premissa errada — fica dito.** Ele declarava como furo a corrida "Entrada que leu *ativo*
antes do Inativar e grava depois", dizendo que o motor não pega a trava do material. **Estava errado**: desde a Etapa 97 o
motor inteiro roda em `naTravaDoMaterial`; o `UPDATE` que inativa passou a usar a mesma trava e a corrida fecha.

## Etapa 115 (2026-10-15, `e60e34e1..385d938f`) — ligar e desligar o controle com saldo, sob a trava do material

Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa115-controle-com-saldo-sob-a-trava.md`.

- [x] **O salvar que muda o controle espera a trava (C226)** — `8072b497`. `PUT /materiais/:id` que liga **ou desliga**
  `controle_lote`/`controle_serie` grava o `UPDATE` em `trava.naTravaDoMaterial` (`materialService.mudaControle`); o renomear
  continua fora. Sob a trava a Entrada sem lote termina antes (a régua da 112 vê o saldo dela: 403 para quem não regulariza)
  ou começa depois (exige lote). Decisão **B745**.
- [x] **Desligar a série com séries presentes exige `ajustar_estoque` (C225)** — `8072b497`. 1 → 0 com ≥ 1 série
  `EM_ESTOQUE`/`BLOQUEADA`, por quem não regulariza → 403 com três textos (E1a/E1b/E1c, pela conta `min(n, floor(n − físico))`),
  depois da 403 de ligar e antes da família; a condição `SEM_SERIE_PRESENTE_SQL` no `UPDATE` e a releitura. O Administrador
  desliga (as séries ficam). Decisões **B746**, **B747**.
- [x] **Regularizar séries sob a trava** — `8072b497` (**B748**; a segunda aba da corrida recebe 400 da validação no lugar
  do 409).
- [x] **Os dois controles lidos no `WHERE`** — `8072b497` para quem não regulariza (**B749**); `385d938f` para todos
  (**B750** — inverte o cenário da 112 "o Administrador mantém ligado e fica ligado").
- [x] **Integração** — `0324037d` (o caminho que a E1 manda, o Almoxarife sem pedir a ninguém, o legado com físico 0 e a
  Entrada real pela v2 com o salvar disparado no meio dela).
- [x] **Fase 5** — `385d938f`: o estorno de Saída relê `controle_serie` sob a trava antes de `reverterSaida` (26/30 rodadas
  deixavam séries órfãs); a guarda prévia do desligar relê o saldo de inativar (RN-07); 15 cenários (`controleSobATravaFase5`,
  `controleSobATravaSabotagem`).
- [ ] **Fora, de propósito:** o Administrador que desliga com séries presentes não é avisado e as séries ficam (**C225**, o
  resto; a alternativa é a **B746** (c)); estornar/devolver Saída com série depois de desligar não volta as séries (**C232**);
  o formulário aberto há minutos desfaz o controle mudado nesse meio-tempo (**C233**, próxima — Etapa 116); **C224** (P.O.).

**A B731 dizia "desligar o controle continua livre" — para a série com séries presentes isso deixou de valer** (B746); o
lote e a série sem série presente continuam livres. **E o plano desta etapa afirmava, na R4, que "outra aba liga a série na
janela de um renomear → 409 E4" protegia o renomear — estava largo demais:** a conferência só pega a mudança que cai entre a
leitura e a gravação do próprio salvar; o formulário manda os controles de quando foi aberto (**C233**).

## Etapa 116 — o formulário diz o que leu, e o estorno não devolve saldo sem as séries (2026-10-16)

Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa116-controles-lidos-e-estorno-sem-serie.md`.

- [x] **`controles_lidos` no PUT (C233)** — `58e8fbbf`. `PUT /materiais/:id` com `controles_lidos: { controle_lote,
  controle_serie }`: lido ≠ gravado **e** gravaria ≠ gravado → 409 (*"O controle por ⟨nomes⟩ do material ⟨código⟩ foi
  ⟨ligado|desligado|mudado⟩ por outra pessoa depois que você abriu o cadastro — …"*), logo depois do 404, para todos (B752,
  B753). Sem a chave → o comportamento da 115. Declarado no `MaterialUpdateSchema` (senão o `z.object` descarta).
- [x] **O formulário manda os lidos** — `d7d9ef6c` (ref gravado em `loadMaterial`; não vai no POST); `96a90ce2` (troca de
  material sem desmontar; lote lido).
- [x] **Estorno de Saída com séries, série desligada (C232)** — `333f13cd`. 400 E2 antes do claim; o ramo de saída do estorno
  roda inteiro sob a trava com o controle relido; parte das séries já reentrou → a literal da 6b (B754).
- [x] **Excluir requisição com a mesma regra** — `00783173` (achado da Fase 5).
- [x] **Estorno de Saída já devolvida (B756)** — `333f13cd`, `00783173` (conferência atômica dos dois lados; devolução viva).
  Ver a spec 12.
- [x] **Integração** — `4f693c7f`.
- [ ] **Fora, de propósito:** a devolução de Saída com séries depois de desligar (**B755**); séries reentradas antes de o
  Administrador desligar (**C234**); os outros campos do cadastro no "último que salva vence".

**O plano desta etapa dizia "o estorno (Administrador ou Almoxarife)" — estava errado:** estornar exige `ajustar_estoque`
(Administrador e Gestor). A seção "Etapa 115" acima marcava a C232 e a C233 como abertas; as duas fecharam aqui (a C232 menos
a devolução).

## Etapa 123 — reorganizar famílias sem corrida, o dono que existe e o pai 0 (2026-10-16)

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa123-a-reorganizacao-de-familias-sem-corrida-e-o-dono-que-existe.md`.

- [x] **Gravações de família com a conferência no comando (C221)** — `9f035163`. `POST /familias` com pai: `INSERT … SELECT …
  WHERE EXISTS` (pai raiz ativa); `PUT /familias/:id`: `parent_id IS <lido>` sempre, o pai conferido ativo e raiz, `NOT EXISTS`
  material quando o nível muda, `NOT EXISTS` subfamília quando vira sub. Não gravou → uma releitura só, pelas **mesmas** funções da
  primeira passada (404 → pai mudou 409 → itens → subfamílias ativas → reativação → inativas → materiais → pai); desfeito na janela →
  uma tentativa a mais; de novo → 409. Literal nova só no `POST`: *"A família principal mudou enquanto a subfamília era criada —
  nada foi gravado. Tente de novo."* (B793).
- [x] **Dono que existe (C216)** — `c97fe07f`. `materialService.assertDonoExiste` (`SELECT 1 FROM clientes`): no `createMaterial`
  (saldo inicial → dono → família) e no `PUT /materiais/:id` só quando o dono muda para um id, depois do 403 da troca. 400 *"O
  cliente dono informado (#⟨n⟩) não existe em Clientes — escolha um cliente cadastrado ou deixe o material como estoque próprio."*
  Cliente inativo aceito; sem condição no comando (B794).
- [x] **Pai 0 (C223)** — `c63c1b4b`. `POST /familias` com a régua do `PUT` (`/^[1-9]d*$/`, senão *"Família pai não encontrada"*,
  depois do nome); `schema.migrateRepararFamiliaPaiZero` (ledger `reparo_familia_pai_zero`, no `initSchema`) (B795).
- [x] **Integração** — `bbef8aea` (rota e serviço).
- [x] **Fase 5** — `91e95c80`: o `ativo` informado sem transição confere o lido (B796), o `PUT` de material confere o par
  família/subfamília lido (B798), o *Inativar* que não grava não diz "já inativa" (B797); `0106f6b5`: seis cenários das sabotagens.
- [ ] **Fora, de propósito:** o pai que aponta para família inexistente (não reparado; A73); o formulário aberto há minutos ainda grava
  a família que mostra (o "último que salva vence", D (123)).

**A C223 estava errada — fica dito.** Ela dizia "legado de antes da Etapa 103"; a 103 fechou o `PUT`, e o `POST /familias`
continuou gravando `parent_id = 0` com `"0"` (e `"1.5"` como pai 1) até esta etapa. **A C221 estava incompleta:** o terceiro nível
(raiz que vira sub com sub nascendo nela; sub que entra numa raiz que está virando sub) e a mudança para uma raiz sendo inativada
são a mesma forma e não estavam nela. **A seção "Etapa 108" acima diz "cliente inexistente" sem dizer como ele aparece — e a C216
dizia "o cliente foi apagado": estava errado**, o sistema não apaga cliente (só inativa).

## Etapa 124 — a família que o formulário leu, e a aba Famílias que reativa (2026-10-16)

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa124-a-familia-que-o-formulario-leu-e-a-reativacao-que-a-recusa-pede.md`
(design e plano `a5e9d30f`).

- [x] **O par lido (D (123))** — `879b362b`. `familia_lida: {familia_id, subfamilia_id}` declarada no `MaterialUpdateSchema`
  (`numFromForm`: `null` atravessa, `''` é ausente); `materialService.familiaDesfeita`: por coluna presente, lido ≠ gravado **e**
  merged ≠ gravado → 409 *"A família do material ⟨código gravado⟩ foi mudada por outra pessoa depois que você abriu o cadastro —
  salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo."* (ou *"A subfamília …"*; a família
  vence). Depois do 409 dos controles (116), antes do 403 do dono. Sem a chave, o de antes (B800).
- [x] **O formulário manda o par lido** — `1a1ebf1c` (ref gravado em `loadMaterial`, número ou `null`; não vai no POST).
- [x] **A aba Famílias lista as inativas e reativa** — `2105505e`, `98bfcca5` (`GET /familias?ativo=all`; selo *Inativa*,
  inativas depois; *Reativar* → `PUT {nome, ativo: 1}`; a inativa sem *Adicionar item*, *Nova subfamília*, *Inativar* e
  *Cadastrar primeiro item*; a subfamília ativa sob principal inativa no bloco das órfãs) (B802).
- [x] **`PUT /familias/:id` preserva `descricao` e `tipo_uso` omitidos** — `ee6c3774` (no próprio `UPDATE`, `CASE WHEN`)
  (B803; o defeito era anterior — nenhuma tela os omitia antes do *Reativar*).
- [x] **Integração** — `fa0fa1f9` (duas abas pela rota; a C231 seguida até aprovar).
- [x] **Fase 5** — `ee6c3774`, `98bfcca5`, `5b5e3998` (três revisores; 90 sabotagens, 12 cenários sem prova viraram teste).
- [ ] **Fora, de propósito:** os outros campos do cadastro (nome, descrição, unidade…) continuam no "último que salva vence"
  (D (124), candidata da 125); o *Reativar* da família manda o nome da lista (D (124)); o administrador do sistema sem perfil vê os
  botões da aba e a rota recusa (C259, anterior); o legado com a subfamília no `familia_id` (A75).

**A seção "Etapa 123" acima marca "o formulário aberto há minutos ainda grava a família que mostra" como fora** — fechado aqui.
**A spec dizia, na lista de Famílias (topo), "CRUD (rotas de `/familias`)" como se a tela cobrisse o CRUD:** a tela não reativava
(a aba só pedia as ativas) — **estava incompleto**; a reativação existia só pela API até esta etapa.
