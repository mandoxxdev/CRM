# Etapa 49 — Relatórios: saldo por lote, séries em estoque, saldos comprometidos e movimentação por usuário/centro de custo (desenho)

> **Feature:** 21 (Relatórios). **Fase 0:** a "próxima tarefa detalhada" do plano da Etapa 48,
> **cruzada com o registro** (`reportRegistry.js`) antes de desenhar. A etapa mede pelo nome do
> contrato, a chave, e não pelo nome que se imagina.
> **Plano:** `docs/superpowers/plans/2026-09-30-almoxarifado-etapa49-relatorios-saldos.md`

## 1. A medição: o que o checklist da spec 21 pede e o registro JÁ tem

| Item do checklist (`[ ]` hoje) | Chave que já cobre | Veredito |
|---|---|---|
| Estoque disponível (fórmula da feature 03) | `estoque-atual`, coluna `disponivel` | **coberto** → `[x]` |
| Saldo por cliente | `materiais-cliente` ("Posição por cliente") | **coberto** → `[x]` |
| Saldo por projeto | `custo-por-projeto`, `reservado-os` | **coberto em parte**: custo e reserva por projeto/OS; saldo **físico** por projeto não existe, porque o saldo é por material, não por projeto |
| Histórico completo do item | `historico-movimentacoes` com filtro `material_id` | **coberto**, com o teto declarado de 500 linhas |
| Entradas/saídas por período · transferências · devoluções · ajustes | `historico-movimentacoes` com `tipo` + datas | **coberto** pelo filtro de tipo |
| Saldo reservado / bloqueado / em quarentena / em terceiros | só `materiais-bloqueados` | **falta**: o reservado, o em inspeção e o em terceiros não têm relatório |
| Saldo por lote / número de série | nenhuma | **falta** |
| Por usuário / por centro de custo | nenhuma: o histórico não tem nem coluna nem filtro | **falta**, mas `movimentacoes_almoxarifado` já grava `usuario_nome` e `centro_custo_id` |
| Saldo por localização / almoxarifado | `materiais-sem-endereco` (o inverso) | **fora**, ver a seção 4 |

**Achado de spec:** a spec 21 diz que o registro tem **18** chaves; tem **19**. A `custo-por-projeto`
(`reportRegistry.js:416`) entrou depois, e a spec não foi reaberta.

## 2. As regras

**RN-01 — `saldo-por-lote`** (Estoque, mesmo gate do `estoque-atual`). Uma linha por **lote com saldo**,
com material (código e nome), lote, validade, status do lote e quantidade. A quantidade é
`SUM(estoque_saldo_almoxarifado.quantidade)` por `lote_id`, **só `> 0`**. A fonte é a mesma tabela que
o motor escreve na entrada e na saída por lote; não se cria régua nova.

**RN-02 — `series-em-estoque`** (Estoque). Uma linha por série **presente**:
- o filtro usa `STATUS_PRESENTES` de `seriesService` (`EM_ESTOQUE`, `BLOQUEADA`), importada e não copiada;
- as colunas são material, número, status e lote.

**RN-03 — `saldos-comprometidos`** (Estoque). Uma linha por material com **qualquer** saldo comprometido:
- as colunas são físico, reservado, bloqueado, em inspeção, em terceiros e disponível;
- as colunas de retenção e o filtro "algum > 0" saem de **`COLUNAS_RETENCAO`** (`availabilitySql.js`);
- o disponível sai de **`disponivelSql`**.

Uma retenção nova no futuro entra no relatório sem ninguém lembrar dele.

**RN-04 — `historico-movimentacoes` ganha usuário e centro de custo.** A mudança é aditiva:
- a coluna **Usuário** (`usuario_nome`) e a coluna **Centro de custo**;
- os filtros `usuario` (texto, com `LIKE` no nome) e `centro_custo_id` (número).

Nenhuma coluna ou filtro existente muda, e o teto de 500 continua.

## 3. Contrato

- Relatório novo é **chave nova no registro**, sem tela nova: a tela `/almoxarifado/relatorios` e a exportação XLSX são dirigidas pela lista do servidor.
- A **validação de subida** do registro derruba o processo se o dispatcher e o registro divergirem, então cada chave nova entra com a sua função no **mesmo** commit.
- Gate: as quatro chaves ficam com `acao: null`, a régua do `estoque-atual` e do `historico-movimentacoes`. Nenhuma expõe dado que as vizinhas não exponham: lote, série e retenções já aparecem nas telas de material e de lotes para quem acessa o módulo.

## 4. O que NÃO é

- **Saldo segregado por almoxarifado:** saldo global é intencional (CLAUDE.md), e não se propõe segregação. Um relatório de **onde está fisicamente** (endereço) precisaria de saldo por localização confiável. `estoque_saldo_almoxarifado.localizacao_id` existe, mas a Fase 0 não mediu se ele é mantido em toda movimentação, então **não se promete**. **Letra D.**
- **Previsto × realizado** depende da feature 22.
- **Indicadores restantes da spec 27**: cada um tem a feature dona.
- **PDF** continua fora (letra D da Etapa 13).

## 5. Sort topológico

| Task | O que é | Classificação |
|---|---|---|
| **T1** | `saldo-por-lote` + `series-em-estoque` | **tronco**: registro e dispatcher andam juntos |
| **T2** | `saldos-comprometidos` | **tronco**: mesmo registro |
| **T3** | usuário e centro de custo no histórico | **tronco**: mesmo registro |
| **T4** | integração: a tela lista as chaves novas, e a exportação XLSX de cada uma sai com as colunas do registro | **tronco** |

Tudo é tronco porque as quatro tasks escrevem o **mesmo** registro e a validação de subida é global. Paralelizar custaria conflito certo.
