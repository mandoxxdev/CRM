# Estimativa 20/11/2026 — o estorno do Ajuste devolve às prateleiras de onde a baixa saiu (C549) (1h30)

Etapa 256, item único. É a "próxima tarefa detalhada" (item 2) do plano da Etapa 255: o aviso **C549** (decisão **B1597** da Etapa 254).
Os itens 24-26 da estimativa de 18/11 continuam esperando resposta e não entram aqui.

**Medido (20/11):**
- Reprodução: `tests/api/ajusteSemLotePoupaCaixa.api.test.js`, cenário *[D (254), documenta]* — padrão *A* com 4 separadas, *B* 3, Ajuste
  para 4 → *A* 4, *B* 0; estorno → *A* 7, *B* 0 (rodado agora: 15/15 verdes, o cenário afirma o defeito).
- Ida: `stockService.syncSaldoLocalizacaoPadrao(..., { drenar: true })` (linha ~2600) já devolve as linhas drenadas (`[{ id, quantidade }]`),
  mas ninguém grava. O livro só nasce depois (`INSERT INTO movimentacoes_almoxarifado`), então a gravação vai depois dele, sob a mesma seção.
- Estorno: `cancelarMovimentacao`, ramo AJUSTE sem localização (linha ~3784): SET absoluto do total + `syncSaldoLocalizacaoPadrao` (sem
  lote não drena; com lote drena). O resíduo cai inteiro na linha padrão. O desfazer (`compensarLinhasClaim`) já devolve linhas por id antes
  do total e do sync.
- Banco: tabela nova (o schema do almoxarifado é `CREATE TABLE IF NOT EXISTS` em `schema.js`); ajuste antigo sem registro = comportamento de
  hoje.

Régua: fatia do almoxarifado no motor/estorno (~1h15 a 1h30, passo 3 da skill); tabela nova + revisão do plano e revisão final com sonda:
**1h30**.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estornar um ajuste de saldo devolve as peças às prateleiras de onde saíram | 1h30 | motor/estorno (E253 C475 ~1 h; E254 C548 ~0,7 h) | 1h30 | Etapa 256 (`2026-11-20-almoxarifado-etapa256-estorno-ajuste-devolve-prateleira.md`) | fatia do almoxarifado no motor | 0,8 h (horas.js 20/11, grupo "Etapa 256|estorno do ajuste"; 1 min dele é de um commit da 254 que casa a regex) | 1h | `f4153785`, `f178287b`, `84f75167`, `a930c7be`, `2bd1a333` |

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-20 --ate 2026-11-21 --grupos "Estorno do ajuste=Etapa 256|estorno do ajuste"
```

**Etapa 256 (20/11):** não revisada. Medido 0,8 h (~48 min, arredondado para 1h) — 30 min abaixo do estimado: a revisão do plano e a
revisão final não acharam defeito no código (só ajustes de plano e testes que faltavam), e a tela não mudou. A suíte do servidor inteira
(~1 h de relógio, sem commit no meio) não entra no horas.js.
