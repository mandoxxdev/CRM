# 01 — Cadastros de Materiais

> **Status:** 🟡 — Etapa 2 entregue (2026-08-04): ~21 colunas novas no material (técnicos, reposição, controles, ABC, unidades compra/consumo + fatores), subfamílias via `parent_id` em famílias, `MaterialSchema`/`MaterialUpdateSchema` (Zod) com validação e auditoria de criação/atualização, form em 6 seções. Falta: tabela de conversões genérica, grupo acima de família, motivos/transportadoras/tipos de documento, remover categorias hardcoded do front, `almoxarifadoApi.js`.
> **Spec original:** seções 4.1, 4.2, 4.3
> **Última atualização:** 2026-08-04
> **📋 Plano de implementação:** [docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md) — Tasks 3, 4, 6 (subfamílias, campos do material, form) · Design: [docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md](../../../docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md)

## Objetivo

Cadastro completo de materiais com todos os campos da spec, famílias/subfamílias formais, unidades com conversão e cadastros complementares.

## O que já existe

- Tabela `materiais_almoxarifado` (`services/almoxarifado/schema.js:68` + colunas v3 em `:294-327` + colunas da Etapa 2 em `:400-430`): codigo UNIQUE, nome, descricao, categoria/categoria_id, familia_id, subcategoria_id, subfamilia_id, unidade, foto, localizacao_padrao_id, quantidade_atual/minima/maxima, custo_unitario/custo_medio, fornecedor_id, ncm, tipo_material, material_critico, controle_lote, controle_certificado, controle_serie, controle_validade, controle_corrida, requer_inspecao, requer_foto, classe_abc, fabricante, codigo_fabricante, peso_unitario, dimensoes, material_construtivo, norma, marca, modelo, aplicacao, ponto_reposicao, lote_economico, unidade_compra/fator_conversao_compra, unidade_consumo/fator_conversao_consumo, permite_saldo_negativo, ativo.
- CRUD completo: `routes/almoxarifado.js:195-499` (validação de família ativa obrigatória, soft delete, foto ≤10 MB, código automático por família/setor); POST/PUT migrados para `validate(MaterialSchema)`/`validate(MaterialUpdateSchema)` (Zod, com coerção de strings do form) na Etapa 2; PUT preserva qualquer campo omitido do payload (inclusive os novos); toda criação/edição grava auditoria (`CRIACAO`/`ATUALIZACAO`) com diff dos campos alterados em `auditoria_log_almoxarifado`.
- Famílias: `familias_material_almoxarifado` + CRUD (`routes/almoxarifado.js:1371-1452`) com `tipo_uso` (administrativo/industrial/ambos); ganhou `parent_id` na Etapa 2 (subfamílias, máx. 2 níveis, validação de hierarquia em POST/PUT/DELETE).
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
- [x] Controles adicionais: `controle_serie`, `controle_validade`, `controle_corrida` (colunas `controle_lote`/`controle_certificado` continuam **sem verificação efetiva** na saída — a aplicação é da feature 10)
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
- [ ] Remover listas de categorias hardcoded duplicadas em `MateriaisAlmoxarifado.js` (`CATEGORIAS` em `:15`), `MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` → usar `/almoxarifado/categorias` — **ainda não feito**
- [ ] Criar `client/src/services/almoxarifadoApi.js` (camada de service, padrão de `frotasApi.js`) — **não criado**

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Código interno é único; duplicado → 409/400 | `materialCompleto.api.test.js`: "REGRESSÃO: POST código duplicado → 400 Código já existe" |
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
