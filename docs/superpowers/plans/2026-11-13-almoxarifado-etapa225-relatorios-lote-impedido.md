# Etapa 225 — os relatórios de saldo dizem quanto está em lote impedido (D (223))

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa224-extrato-qual-lote-impedido.md` (`:210-227`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-relatorios-lote-impedido.txt` (**3h**, `6518f251`). Números de linha
> medidos sobre `7dfcd4a4`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½ e o 8).

## Objetivo (em linguagem simples)

Desde a 222/223 o extrato e a lista de materiais dizem quanto do estoque está em lote bloqueado, reprovado ou vencido — os relatórios não
(D (223)). Depois desta etapa, os relatórios **Estoque atual** e **Saldos comprometidos** ganham a coluna *Em lote impedido*, logo depois do
*Disponível*, na tela e na planilha exportada; e o material que só tem estoque em lote impedido passa a aparecer em *Saldos comprometidos*.

## Fase 0 — medido em 2026-11-13 (sobre `7dfcd4a4`)

1. `reportService.relatorioEstoqueAtual` (`reportService.js:14`): `SELECT m.*, disponivelSql as disponivel, valorEstoqueSql as valor_total …
   WHERE ativo = 1 AND proprietario_cliente_id IS NULL`. `relatorioSaldosComprometidos` (`:119`): colunas e filtro montados de
   `COLUNAS_RETENCAO` (`WHERE ativo = 1 AND (alguma retenção > 0)`), com o cliente.
2. Registro (`reportRegistry.js:56` e `:126`): colunas **estáticas**; `estoque-atual` sem nota; `saldos-comprometidos` com nota que diz o
   filtro. O teste `relatoriosSaldos (5)` exige `colunas ⊇ COLUNAS_RETENCAO ∪ {disponivel}`.
3. A tela (`RelatoriosAlmoxarifado.js`) e o export (`extended.js:2682`, xlsx projetado pelo `colunas`) são **genéricos**: coluna nova no
   registro aparece na tabela e na planilha sem mudar o cliente. Paridade de cabeçalho: `relatoriosRegistro [5]` e `relatoriosJornada [3]`
   comparam o cabeçalho do xlsx com os rótulos do registro (seguem verdes: os dois lados mudam juntos).
4. Os dois relatórios só têm estes consumidores (`extended.js:2561`, `:2602`) e os testes que chamam `relatorioEstoqueAtual` direto
   (`custoUnitarioFonteUnica`, `materialClienteSegregacao`, `saldoEmTerceiros`) — todos acham a linha por `id` e leem outros campos.
5. `materiais_almoxarifado` não tem coluna `lote_impedido` (`schema.js`): sem colisão com `m.*`.
6. A gêmea legada `GET /relatorio/posicao-estoque` (`routes/almoxarifado.js:2288`) não tem nem o *Disponível* nem consumidor na tela: fica
   como está (B1491).
7. *Saldo por lote* (`reportRegistry.js:655`) já tem *Validade* e *Status do lote*: o bloqueado e o reprovado já se leem; o **vencido** não
   aparece como situação (D (225)).
8. **Custo medido** (sonda `e225-custo.js` no scratchpad: cópia do banco de dev inflada para 3.022 materiais ativos, 1.000 com controle de
   lote, 2.000 lotes; mediana de 15 rodadas): *Estoque atual* 85 → **98 ms**; *Saldos comprometidos* 3 → **31 ms** (o filtro novo calcula
   a régua para todos os materiais ativos: 609 → 1.409 linhas no banco inflado). Abaixo do limite de ~200 ms das 223/224: sem opt-in.
9. **Trava:** só leitura, sem trava (como as 222–224). Pode estar um instante velho — relatório.

## Caminhos

- **(escolhido)** `${loteImpedidoSql('m')} as lote_impedido` nos dois `SELECT` — o **mesmo** número, o mesmo nome e a mesma régua do extrato
  (222), do `/estoque` e do `/materiais` (223) — e a coluna *Em lote impedido* nos dois registros, depois do *Disponível*.
- **(descartado)** um número próprio do relatório (Σ dos lotes impedidos sem descontar o bloqueado): divergiria do extrato do mesmo material.
- **(descartado)** mexer no *Disponível* do relatório: ele continua o de sempre (B1476 da 222).

## Decisões (letra B — reversíveis; livres B1488 a B1491, C531, conferido por `grep` em `docs` e `specs`)

- **B1488 — os relatórios *Estoque atual* e *Saldos comprometidos* trazem `lote_impedido`.** Aditivo: campo novo em cada linha (número,
  `loteImpedidoSql('m')`, 0 sem controle de lote — B1371) e a coluna `{ chave: 'lote_impedido', rotulo: 'Em lote impedido' }` no registro,
  logo depois de `disponivel`. A planilha exportada ganha a coluna (o export projeta pelo registro). Descartado: número próprio; coluna antes
  do *Disponível*.
- **B1489 — *Saldos comprometidos* passa a listar o material só com lote impedido.** O filtro vira "alguma retenção > 0 **ou**
  `lote_impedido` > 0" (consulta envolvida: `SELECT * FROM (…) x WHERE …`, para a régua não rodar duas vezes por linha). O relatório é o
  "o que não está livre"; sem isso, o material que tem 6 em lote bloqueado e nenhuma retenção sumiria justamente do relatório que diz o que
  está preso. Custo medido (Fase 0, item 8). Descartado: manter o filtro (a coluna só apareceria em quem já tem retenção).
- **B1490 — as notas dos dois relatórios dizem o que é a coluna.** *Estoque atual* ganha nota (era `null`); a do *Saldos comprometidos* passa
  a citar o lote impedido. Literais nos contratos.
- **B1491 — fora:** a gêmea legada `/relatorio/posicao-estoque` (sem *Disponível*, sem tela); o vencido como situação no *Saldo por lote*
  (D (225)); a coluna *disponível* da Fila de separação (D (223), continua). Sem mudança no banco, sem trava, sem rota nova, sem perfil novo.
- **C531 (aviso) — *Em lote impedido* não soma com *Bloqueado*.** A coluna é o número do extrato: o que está em lote impedido **fora** o
  que já aparece em *Bloqueado*, em terceiros ou em inspeção sem recebimento (a régua da 205/217). Um material com 6 em lote bloqueado e 2
  em quarentena sem lote conhecido mostra *Bloqueado* 2 e *Em lote impedido* 4 — não 6. E o *Disponível* ainda conta o impedido.

## Regras de negócio (RN-225.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-225.01 | *Estoque atual* traz o impedido; o *Disponível* e o valor não mudam | material `un` com controle de lote, L1 ATIVO 4 + L2 BLOQUEADO 6: linha `lote_impedido 6`, `disponivel 10`; o mesmo material sem lote bloqueado → 0; material sem controle de lote → 0 |
| RN-225.02 | REPROVADO, vencido, vencido liberado, vence hoje | (a) L2 REPROVADO → 6 nos dois relatórios; (b) L2 vencido ontem → 6; (c) (b) + liberar o vencimento → 0; (d) vence hoje → 0 |
| RN-225.03 | *Saldos comprometidos* lista o material só com lote impedido | L1 4 + L2 BLOQUEADO 6, sem retenção: aparece com as quatro retenções 0, `disponivel 10`, `lote_impedido 6`; material só com L1 ATIVO e sem retenção → **não** aparece; material com retenção e sem lote → aparece com `lote_impedido 0` |
| RN-225.04 | Sem controle de lote, 0 e fora do comprometido por isso | `controle_lote = 0` com L2 BLOQUEADO 6 → *Estoque atual* `lote_impedido 0`; não aparece em *Saldos comprometidos* |
| RN-225.05 | A régua é uma só | para todo material de cada relatório, `lote_impedido` = `SELECT loteImpedidoSql('m')` dele = `lote_impedido` do extrato |
| RN-225.06 | O que já está em *Bloqueado* sai do impedido (C531) | L1 4 + L2 BLOQUEADO 6 e `quantidade_bloqueada = 2` → comprometido `quantidade_bloqueada 2`, `lote_impedido 4` |
| RN-225.07 | Material de cliente: no comprometido sim, no *Estoque atual* não (como hoje) | material de cliente com L2 BLOQUEADO 6 → aparece em *Saldos comprometidos* com o cliente e `lote_impedido 6`; fora do *Estoque atual* |
| RN-225.08 | O registro e a planilha têm a coluna, depois do *Disponível* | `GET /relatorios`: nos dois, a coluna `lote_impedido`/`Em lote impedido` vem logo depois de `disponivel`, e a nota é a literal; o xlsx dos dois tem *Em lote impedido* logo depois de *Disponível*, e a célula do material da .01 vale 6 |
| RN-225.09 | Integração: liberar o lote zera a coluna e tira o material do comprometido | L1 4 + L2 BLOQUEADO 6 → nos dois relatórios 6 e no comprometido; `PUT /lotes/L2/status ATIVO` → *Estoque atual* 0 e fora do comprometido |

## Contratos congelados

**`GET /api/almoxarifado/relatorios/estoque-atual`** e **`GET /api/almoxarifado/relatorios/saldos-comprometidos`** (e os `/export`) — query,
autorização e erros iguais aos de hoje. Cada linha ganha `lote_impedido` (número, `loteImpedidoSql('m')`). Nenhum campo existente muda.
O *Saldos comprometidos* muda o **filtro** (B1489).

**`GET /api/almoxarifado/relatorios`** (lista do registro):

- `estoque-atual.colunas`: `… { disponivel, 'Disponível' }, { lote_impedido, 'Em lote impedido' }, { valor_total, 'Valor total' }`.
- `estoque-atual.nota` (literal): `'Disponível = físico menos o reservado, o bloqueado, o em inspeção e o em terceiros. Em lote impedido = o que está em lote bloqueado, reprovado ou vencido, fora o que já é bloqueado: continua contado no Disponível, mas não sai para uso até o lote ser liberado na tela Lotes e Séries.'`
- `saldos-comprometidos.colunas`: `… { disponivel, 'Disponível' }, { lote_impedido, 'Em lote impedido' }` (última).
- `saldos-comprometidos.nota` (literal): `'Materiais ativos com saldo reservado, bloqueado, em inspeção, em terceiros ou em lote impedido. Disponível = físico menos essas quatro retenções. Em lote impedido = o que está em lote bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado: continua contado no Disponível, mas não sai para uso até o lote ser liberado na tela Lotes e Séries. Material inativado com retenção não aparece aqui (mesma régua de "Materiais bloqueados").'`

**Tela:** nenhuma mudança de código — a tabela e a nota seguem o registro.

## Fase 2 — revisão do plano (1 revisor fresco)

*(a preencher)*

## Tasks (sort topológico)

- [ ] **T1 (tronco)** — teste `server/tests/api/relatoriosLoteImpedido.api.test.js` (RN-225.01 a .09) vermelho → `reportService` (os dois
  `SELECT`, o filtro) + `reportRegistry` (colunas e notas) → verde. Controles positivos pelas sabotagens abaixo.
- Sem galho: a tela é genérica (Fase 0, item 3). A RN-225.09 é a integração (lote → relatório pela rota).

## Sabotagens previstas (controle positivo)

1. tirar `lote_impedido` do `SELECT` do *Estoque atual* → .01, .02, .05, .08 caem;
2. voltar o filtro antigo do comprometido → .03, .07, .09 caem;
3. `lote_impedido` = Σ bruto dos lotes impedidos (sem descontar o bloqueado) → .06 cai;
4. tirar a coluna de um registro, ou pô-la antes do *Disponível* → .08 cai;
5. filtro do comprometido com `lote_impedido >= 0` → .03 (material só ATIVO) e .04 caem.

## Execução e controles (medidos)

*(a preencher)*

## Fase 5 — revisão adversarial

*(a preencher)*

## Tasks feitas

*(a preencher)*

## Verificação (medida, serial)

*(a preencher)*

## Retro (4 números)

*(a preencher)*

## Fechamento

*(a preencher)*

## Próxima tarefa detalhada

*(a preencher)*
