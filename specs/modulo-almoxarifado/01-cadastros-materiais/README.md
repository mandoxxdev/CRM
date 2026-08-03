# 01 — Cadastros de Materiais

> **Status:** 🟡 · **Spec original:** seções 4.1, 4.2, 4.3
> **Última atualização:** 2026-08-02

## Objetivo

Cadastro completo de materiais com todos os campos da spec, famílias/subfamílias formais, unidades com conversão e cadastros complementares.

## O que já existe

- Tabela `materiais_almoxarifado` (`services/almoxarifado/schema.js:68` + colunas v3 em `:294-327`): codigo UNIQUE, nome, descricao, categoria/categoria_id, familia_id, subcategoria_id, unidade, foto, localizacao_padrao_id, quantidade_atual/minima/maxima, custo_unitario/custo_medio, fornecedor_id, ncm, tipo_material, material_critico, controle_lote, controle_certificado, permite_saldo_negativo, ativo.
- CRUD completo: `routes/almoxarifado.js:195-499` (validação de família ativa obrigatória, soft delete, foto ≤10 MB, código automático por família/setor).
- Famílias: `familias_material_almoxarifado` + CRUD (`routes/almoxarifado.js:1371-1452`) com `tipo_uso` (administrativo/industrial/ambos).
- Categorias com hierarquia (`parent_id`), 27 seeds. Unidades de medida (12 seeds). Tipos de material (20 no enum + tabela com flags EPI/controlado/assinatura).
- Front: `MateriaisAlmoxarifado.js`, `MaterialAlmoxarifadoForm.js` (545 L), aba Famílias em `ConfiguracoesAlmoxarifado.js`.
- Testes: cobertura parcial em `almoxarifado.test.js` (material inativo, foto em `materialPhoto.test.js`).

## Checklist

### Campos faltantes no material (spec 4.1)
- [ ] Descrição técnica completa (separada da resumida)
- [ ] Unidade de compra + unidade de consumo + fator de conversão (hoje só `unidade` única)
- [ ] Fabricante + código do fabricante
- [ ] Peso unitário e dimensões
- [ ] Material construtivo, especificação técnica, norma aplicável, marca, modelo, aplicação
- [ ] Ponto de reposição + lote econômico + prazo médio de reposição (hoje só min/max)
- [ ] Controles adicionais: `controle_serie`, `controle_validade`, `controle_corrida` (colunas `controle_lote`/`controle_certificado` já existem mas **nunca são verificadas** — a aplicação efetiva é da feature 10)
- [ ] Necessidade de inspeção no recebimento / de certificado / de fotografia (flags)
- [ ] Classe ABC + último custo
- [ ] Ficha técnica e documentos anexos (tabela `anexos_documento_almoxarifado` já existe, entidade `material`)

### Famílias / subfamílias / grupos
- [ ] Formalizar subfamílias: hoje `subcategoria_id` aponta para `categorias_material_almoxarifado` por convenção implícita — decidir: tabela própria ou documentar/validar a convenção com FK
- [ ] Grupo (nível acima de família) — avaliar se necessário ou se categoria hierárquica cobre

### Cadastros complementares (spec 4.3)
- [x] Unidades de medida · fornecedores (módulo compras) · clientes · setores · localizações · perfis de acesso
- [ ] Conversões entre unidades (tabela + API)
- [ ] Motivos de movimentação e motivos de ajuste (cadastro, hoje texto livre)
- [ ] Tipos de documento · transportadoras
- [ ] Grupos de e-mail (parcial em `configuracoes_almoxarifado`) · regras de aprovação (feature 06)

### Frontend
- [ ] Form de material com os novos campos (agrupados em abas/seções para não virar monstro)
- [ ] Remover listas de categorias hardcoded duplicadas em `MateriaisAlmoxarifado.js`, `MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` → usar `/almoxarifado/categorias`
- [ ] Criar `client/src/services/almoxarifadoApi.js` (camada de service, padrão de `frotasApi.js`)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Código interno é único; duplicado → 409/400 | `criar material com codigo duplicado falha` |
| Material exige família ativa | `criar material sem familia ou com familia inativa falha` (regra já existe — cobrir na API) |
| Fator de conversão > 0 quando unidades diferem | `fator de conversao invalido falha` |
| Alteração de cadastro mantém histórico (spec 29) | `editar material grava auditoria com dados anteriores e novos` |
| Soft delete não some com histórico de movimentações | `material inativado mantem movimentacoes consultaveis` |

## Dependências

- Fundação (00) para os testes de API.
- Histórico de alteração de cadastro depende da auditoria unificada (00.3 / 23).
