# Etapa 49 — Relatórios de saldo e de movimentação por usuário/centro de custo (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa49-relatorios-saldos-design.md`
> **Feature:** 21

## T1 — `saldo-por-lote` e `series-em-estoque` (RN-01/02)

- **Registro:** as duas chaves (`categoria: 'Estoque'`, `acao: null`, `exportavel: true`).
- **Dispatcher:** duas funções em `reportService`.
- **`series-em-estoque`:** importa `STATUS_PRESENTES` de `seriesService` (verificar que é exportada; se não for, exportar).
- **Cenários** (`relatoriosSaldoLote.api.test.js`):
  - lote com saldo aparece com a quantidade somada;
  - lote zerado **não** aparece;
  - série `EM_ESTOQUE` e `BLOQUEADA` aparecem; `ENTREGUE` não;
  - as colunas batem com o registro.

## T2 — `saldos-comprometidos` (RN-03)

- Colunas e filtro montados de `COLUNAS_RETENCAO`, e o disponível de `disponivelSql`.
- **Cenários:**
  - material com reservado > 0 aparece, com cada coluna no valor certo;
  - material sem retenção **não** aparece;
  - o disponível é igual ao da `estoque-atual`.
- **Controle positivo que importa:** acrescentar uma quinta coluna fictícia a `COLUNAS_RETENCAO` num teste e ver o relatório acompanhar. Se ficar caro, basta provar que as colunas vêm da lista.

## T3 — usuário e centro de custo no histórico (RN-04)

- Duas colunas e dois filtros novos, **aditivos**.
- **Cenários:**
  - o filtro por usuário (parte do nome) devolve só as movimentações dele;
  - o filtro por centro de custo idem;
  - sem filtro, o resultado é igual ao de antes (a metade positiva do "aditivo").

## T4 — integração

- A lista de relatórios (`GET` que dirige a tela) traz as três chaves novas na categoria certa.
- A exportação XLSX de cada uma responde 200 com cabeçalho igual aos rótulos do registro.
- A validação de subida aceita o registro, provado por subir o app no harness.

## Fase 2 — o que o revisor tem de atacar

1. `estoque_saldo_almoxarifado` por `lote_id` é **mantido** pelo motor em toda entrada e saída por lote (inclusive transferência, devolução, ajuste, sucata e estorno)? A soma por lote bate com `quantidade_atual` em material com controle de lote? Se não bater, a RN-01 mentiria.
2. As colunas de `COLUNAS_RETENCAO` estão todas em `materiais_almoxarifado`?
3. O gate `acao: null` expõe algo que o módulo não expunha?
4. O filtro por usuário com `LIKE` é injetável (parâmetro, e não concatenação)?

## Estado

- [x] Fase 0 (desenho, seção 1) · [x] Fase 1
- [x] Fase 2 (1 CRITICAL, 4 IMPORTANT — seção 6 do desenho) · [x] T1–T3 (`c71cb87`) · [x] T4 (`d77df40`) · [x] Fase 5 (fix-round `5eeed45`) · [x] Fase 6 (verificação final medida: `test:api` 226/226 · `test:almoxarifado` 42/42 · validation 4/4 · safealter 3/3 · sqlite 5/5 · client 872/872 em 53 suítes · build `CI=true` limpo)

## Execução (2026-09-30)

- **T1–T3 (`c71cb87`):** as três chaves novas, o histórico estendido e o registro de 19 para 22 chaves.
  - `relatoriosSaldos` 8/8, incluindo o cenário da sonda do lote e o `%` como texto.
  - 9 sabotagens vermelhas. A K7, do escape, deu NO-OP na primeira rodada por escape de shell e foi refeita com um script perl em arquivo.
  - **Divergências:** os testes vieram **depois** do código, e as sabotagens são a prova. A varredura existente do registro chamava todo parâmetro de texto com `'x'`, e o `grupo` tem lista fechada; ganhou um `exemplo` opcional no parâmetro.
- **T4 (`d77df40`):** `integracaoRelatoriosSaldos` 6/6, com 2 sabotagens vermelhas.
- **Suítes:** `test:api` **226/226**, `test:almoxarifado` 42/42.

## Fase 5 — revisão adversarial: 2 lentes, 1 fix-round (Fase 5 `5eeed45`)

| Lente | Placar | O que era |
|---|---|---|
| Correção e exposição (sonda `f549rn-sonda.js`) | **0 CRITICAL, 2 IMPORTANT, 3 MINOR**; exposição **refutada** | **I1:** lote **negativo** (material que permite saldo negativo) sumia da tela mas entrava na conta — a tela somava 10 com o físico em 5. Agora `|saldo| > ε`. **I2:** material com controle de lote que **nunca teve lote** não aparecia, enquanto o de lote zerado aparecia com o residual — o legado sumia. Agora entra com o físico inteiro em "Sem lote atribuído". **M1** inativo (séries inclui, os outros excluem), **M2** grupos sobrepostos, **M3** acento no `LIKE` — os três viraram texto nas notas do registro |
| Força dos testes (worktree isolada) | **10 sabotagens novas, 10 verdes** — o código estava certo, faltava cenário | lote em dois endereços (`SUM`→`MAX` passava), residual positivo, retenção isolada (só inspeção, só terceiros), grupos SAIDA/DEVOLUCAO/TRANSFERENCIA, validade/status do lote, material inativo, `_` no `LIKE`, grupo em minúscula, e a integração comparando **0 = 0** para lote e série (semente sem lote nem série) |

**Ruído: 0** — a lição da Etapa 47 (revisor que sabota na mesma árvore) segue valendo: o de testes
trabalhou em worktree, e viu as correções do I1/I2 na árvore principal sem confundi-las com as dele.

**Os cenários que fecham:** `relatoriosSaldos` **8 → 16** — (2b) lote negativo, (2c) nunca teve lote,
(2d) dois endereços + validade/status, (2e) residual positivo, (2f) inativo, (4b) retenção isolada,
(6b) cada grupo + minúscula, (7b) `_`; `integracaoRelatoriosSaldos` ganhou lote e série na semente e
a asserção `json.body.length > 0` (a comparação vazia não prova nada).

**Controle positivo:** as duas correções (I1, I2) — 2/2 vermelhas; as dez lacunas reproduzidas contra
os testes novos — **10/10 vermelhas**. ⚠️ **A S5 (`_` no escape) deu NO-OP DUAS VEZES** — uma por
escape de shell, outra porque `\Q…\E` do perl consome uma barra antes de citar; refeita com uma
âncora **sem barra** (`%_]`, contada: 1 ocorrência). É o sétimo NO-OP de harness desta base; a regra
que fica: **âncora de sabotagem sem barra invertida sempre que possível**.

## Retro de 4 números — Etapa 49

1. **Rodadas de correção até verde: 1** (Fase 5). Mas o número que ensina é o da **Fase 2: 1 CRITICAL** —
   a RN-01 (soma por lote) estava **errada**, e a sonda que a derrubou movimentou estoque de verdade. Sem a
   Fase 2, o relatório de lote nasceria mentindo no fluxo principal de consumo.
2. **Achados reais: 7** (1 CRITICAL + 4 IMPORTANT na Fase 2; 2 IMPORTANT na Fase 5) + 3 MINOR + **10 lacunas de
   teste**. **Ruído: 0.** **E três afirmações da MINHA Fase 0 eram falsas** (dei por "coberto" o que não estava)
   — a Fase 0 mediu pelo nome do contrato, mas não **executou** o filtro que dizia cobrir.
3. **Paralelismo: 0 galhos** — as quatro tasks escrevem o mesmo registro, cuja validação é global; declarado no
   desenho. Paralelismo de revisão (2 lentes) e de documentação (fork).
4. **Defeito que escapou:** *preencher na Etapa 50.* Da 48 para cá: nenhum defeito da 48 foi achado nesta etapa.

## Próxima tarefa detalhada — Etapa 50: a tela de Lotes para de mostrar o saldo atribuído como físico (fecha o C71)

**Escolha, pela ordem do CLAUDE.md** (a "próxima tarefa" desta etapa → o que ficou para 🟢 → o mapa):
- a **21** não vai a 🟢 sem a feature 22 (previsto × realizado) e as features donas dos indicadores restantes;
- **medido no mapa** (`specs/modulo-almoxarifado/README.md`), as 🟡 restantes têm falta cara ou presa a decisão:
  **02** (capacidade/peso, sugestão de localização, leitura por confirmação), **05** (lista de separação como
  entidade, rota de picking), **08** (valores e validação fiscal), **23** (*"falta o cliente dizer quais
  operações a exigem"* — decisão dele);
- o **C71** é a única **mentira operacional em tela** conhecida, é pequeno, não depende de ninguém, e a
  Etapa 49 já tem a régua que o resolve.

**O que já está medido (Fase 0 parcial, feita neste fechamento):**
- a tela é `client/src/components/almoxarifado/LotesAlmoxarifado.js`, que exibe `l.saldo` (`:417`) de
  `GET /api/almoxarifado/materiais/:id/lotes` (`routes/almoxarifado/extended.js:1158`), servido por
  `lotService.listarLotesDoMaterial` (`:206`) — `SUM(estoque_saldo.quantidade) WHERE lote_id = l.id`, o
  **atribuído**;
- a **mesma** rota é consumida com `com_saldo=1` pelos seletores de lote de **Movimentações**
  (`MovimentacoesAlmoxarifado.js:241`), **Devoluções** (`DevolucoesAlmoxarifado.js:114`) e **Sobras**
  (`SobrasAlmoxarifado.js:224`, `:251`), onde o atribuído é o **certo** (a saída por lote valida contra o saldo do lote — manual 4.5). **Não mudar o número
  do lote**: o que falta é mostrar a **diferença** e o **físico**;
- a régua já existe em `reportService.relatorioSaldoPorLote` (Etapa 49): residual = `quantidade_atual − Σ lotes`,
  com `|x| > ε`, lote negativo exibido.

**Contrato proposto (a Fase 1 da 50 congela):** a rota devolve um **array** — mudar para objeto quebraria esses quatro
consumidores. Duas saídas, escolher na Fase 1: (a) rota nova `GET /materiais/:id/lotes/resumo` →
`{ fisico, soma_lotes, sem_lote_atribuido }`, reaproveitando a régua do relatório (extraída para um helper
único — **não** copiar a conta); (b) a tela calcula com o `quantidade_atual` do material que ela já tem e a
soma de **todos** os lotes (sem `com_saldo`). **Preferir (a)**: fonte única, e o teste da régua já existe.
**Na tela:** abaixo da tabela de lotes, a linha *"Sem lote atribuído"* e o *"Físico total"*, com um texto curto
explicando — o mesmo da nota do relatório.

**Pontos de atenção:** os seletores de lote (quatro consumidores de `com_saldo=1`) **não** mudam; material sem controle de lote não mostra a linha;
a correção **não** faz a entrega de requisição baixar de lote (isso é mudança de regra do estoque — **B204**
descartou); o C71 vira ✅ nas novidades com o hash, e o manual 4.5 perde a frase *"para saber quanto do
material não está em lote nenhum, use o relatório"*.
