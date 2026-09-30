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

## 6. O que a Fase 2 mudou: 1 CRITICAL, 4 IMPORTANT, provados por sonda (`rev49-sonda-lote*.js`)

**🔴 A RN-01 estava ERRADA: o saldo por lote NÃO é o físico.** Os fluxos isentos de lote gravam na linha
`lote_id NULL` de `estoque_saldo_almoxarifado`: a entrega de requisição (`requisitionService.js:633`),
o `AJUSTE` absoluto e os fluxos internos (`stockService.js:641-678`, `:1381`).
- Sonda: entrada de 100 no lote A e depois a entrega sem lote → o material fica com **70**, o lote A continua com **100**, e aparece uma linha `NULL` com −30.
- **A invariante que vale** é a soma de TODAS as linhas do material igual a `quantidade_atual`, e ela bateu em todos os passos da sonda.

**RN-01 corrigida:** o relatório mostra, por material com lote:
- uma linha por lote com o **saldo atribuído**;
- **mais** a linha **"Sem lote atribuído"**, igual a `quantidade_atual − Σ lotes`, **podendo ser negativa**;
- a coluna do **físico total** do material;
- uma `nota` na tela que diz que o saldo do lote é o **atribuído**, não o que está na prateleira.

O cenário obrigatório é o da sonda.

**⚠️ E a tela de lotes JÁ MENTE do mesmo jeito** (`lotService.js:208`, a mesma soma). Isso é anterior a esta
etapa e fica **fora dela**: consertar muda o motor ou a tela de lotes, e merece etapa própria. Vai
para a **letra C**, com o cenário.

**A tabela da seção 1 tinha três afirmações falsas:**
- *"Entradas/saídas · devoluções · ajustes: coberto"* **estava errado.** O filtro é `m.tipo = ?` **exato** (`reportService.js:73`), sobre texto livre: entradas são 8 tipos, ajustes 4, devoluções 2. **RN-05 nova:** o histórico ganha o parâmetro `grupo`, com os valores `ENTRADA`/`SAIDA`/`DEVOLUCAO` vindos de `movementTypes` (listas importadas), `AJUSTE` (`tipo LIKE 'AJUSTE%'`) e `TRANSFERENCIA`. Fora da lista: 400 — `Grupo de movimento inválido: <valor> (use ENTRADA, SAIDA, AJUSTE, DEVOLUCAO ou TRANSFERENCIA)`.
- *"Histórico completo do item: coberto"* **exagerava**: o relatório corta em 500 e esconde os cancelados. O histórico **completo** é o de `GET /movimentacoes?material_id=` (`routes/almoxarifado.js:920`), sem teto e com os cancelados. É ele que fecha o item.
- *"Por usuário / centro de custo: nenhuma"* **estava errado**: a mesma rota `/movimentacoes` já filtra `usuario_id` e `centro_custo_id`. O que falta é no **relatório** (a tela e o XLSX). A RN-04 continua, e a coluna usa o **JOIN** de `centros_custo_almoxarifado` daquela rota (código e nome, e não o id). O `LIKE` do usuário leva `ESCAPE '\'`.

**A RN-03 era meia-verdade:** o SQL acompanha `COLUNAS_RETENCAO`, mas as `colunas` do registro são
**estáticas** (o registro não importa serviço, por regra). Uma quinta retenção sairia no JSON e sumiria
da tabela e do XLSX. **Correção:** um teste exige `colunas ⊇ COLUNAS_RETENCAO`, então quem acrescentar
uma retenção toma vermelho no registro.

**Contagem fixa:** `relatoriosRegistro.api.test.js` compara com **19** em quatro linhas. Com as três chaves
novas, passa a **22**, e isso entra na T1.

**Material de cliente:** `estoque-atual` exclui (`proprietario_cliente_id IS NULL`). **Escolha (letra B):**
as três chaves novas **incluem** material de cliente, com a coluna **Cliente**. Reserva e lote de
material de cliente são justamente o que o almoxarife precisa ver. O que a `estoque-atual` exclui é a
**valorização**, e nenhuma chave nova valoriza.
