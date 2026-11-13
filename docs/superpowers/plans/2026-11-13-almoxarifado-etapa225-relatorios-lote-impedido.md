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
  em quarentena sem lote conhecido mostra *Bloqueado* 2 e *Em lote impedido* 4 — não 6; com a quarentena registrada num lote **bom** (L1,
  `retidoDoLote`, 217), o impedido continua 6. E o impedido não desconta o **reservado** (nem o "Sem lote atribuído" negativo, 205): com
  reservado 8, *Disponível* 2 e *Em lote impedido* 6 — por isso a nota diz "não é descontado do Disponível", não "está contado nele"
  (Fase 2 M1).

## Regras de negócio (RN-225.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-225.01 | *Estoque atual* traz o impedido; o *Disponível* e o valor não mudam | material `un` com controle de lote, L1 ATIVO 4 + L2 BLOQUEADO 6: linha `lote_impedido 6`, `disponivel 10`; o mesmo material sem lote bloqueado → 0; material sem controle de lote → 0 |
| RN-225.02 | REPROVADO, vencido, vencido liberado, vence hoje | (a) L2 REPROVADO → 6 nos dois relatórios; (b) L2 vencido ontem → 6; (c) (b) + liberar o vencimento → 0; (d) vence hoje → 0 |
| RN-225.03 | *Saldos comprometidos* lista o material só com lote impedido | L1 4 + L2 BLOQUEADO 6, sem retenção: aparece com as quatro retenções 0, `disponivel 10`, `lote_impedido 6`; material só com L1 ATIVO e sem retenção → **não** aparece; material com retenção e sem lote → aparece com `lote_impedido 0` |
| RN-225.04 | Sem controle de lote, 0 e fora do comprometido por isso | `controle_lote = 0` com L2 BLOQUEADO 6 → *Estoque atual* `lote_impedido 0`; não aparece em *Saldos comprometidos* |
| RN-225.05 | A régua é uma só | para todo material de cada relatório, `lote_impedido` = `SELECT loteImpedidoSql('m')` dele = `lote_impedido` do extrato |
| RN-225.06 | O que já está em *Bloqueado* ou *Em terceiros* sem lote conhecido sai do impedido; o reservado não (C531) | L1 4 + L2 BLOQUEADO 6 e (a) `quantidade_bloqueada = 2` gravada direto (sem lote conhecido) → comprometido `quantidade_bloqueada 2`, `lote_impedido 4`; (b) `quantidade_em_terceiros = 2` → `[0, 2, 4]`; (c) `quantidade_reservada = 8` → `disponivel 2`, `lote_impedido 6` |
| RN-225.07 | Material de cliente: no comprometido sim, no *Estoque atual* não (como hoje) | material de cliente com L2 BLOQUEADO 6 → aparece em *Saldos comprometidos* com o cliente e `lote_impedido 6`; fora do *Estoque atual* |
| RN-225.08 | O registro e a planilha têm a coluna, depois do *Disponível* | `GET /relatorios`: nos dois, a coluna `lote_impedido`/`Em lote impedido` vem logo depois de `disponivel`, e a nota é a literal; o xlsx dos dois tem *Em lote impedido* logo depois de *Disponível*, e a célula do material da .01 vale 6 |
| RN-225.09 | Integração: liberar o lote zera a coluna e tira o material do comprometido | L1 4 + L2 BLOQUEADO 6 → nos dois relatórios 6 e no comprometido; `PUT /lotes/L2/status ATIVO` → *Estoque atual* 0 e fora do comprometido |

## Contratos congelados

**`GET /api/almoxarifado/relatorios/estoque-atual`** e **`GET /api/almoxarifado/relatorios/saldos-comprometidos`** (e os `/export`) — query,
autorização e erros iguais aos de hoje. Cada linha ganha `lote_impedido` (número, `loteImpedidoSql('m')`). Nenhum campo existente muda.
O *Saldos comprometidos* muda o **filtro** (B1489).

**`GET /api/almoxarifado/relatorios`** (lista do registro):

- `estoque-atual.colunas`: `… { disponivel, 'Disponível' }, { lote_impedido, 'Em lote impedido' }, { valor_total, 'Valor total' }`.
- `estoque-atual.nota` (literal): `'Disponível = físico menos o reservado, o bloqueado, o em inspeção e o em terceiros. Em lote impedido = o que está em lote bloqueado, reprovado ou vencido, fora o que já é contado como bloqueado, em terceiros ou em inspeção: não é descontado do Disponível, mas não sai para uso até o lote ser liberado na tela Lotes e Séries.'`
- `saldos-comprometidos.colunas`: `… { disponivel, 'Disponível' }, { lote_impedido, 'Em lote impedido' }` (última).
- `saldos-comprometidos.nota` (literal): `'Materiais ativos com saldo reservado, bloqueado, em inspeção, em terceiros ou em lote impedido. Disponível = físico menos essas quatro retenções. Em lote impedido = o que está em lote bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado, Em terceiros ou Em inspeção: não é descontado do Disponível, mas não sai para uso até o lote ser liberado na tela Lotes e Séries. Material inativado não aparece aqui (como em "Materiais bloqueados").'`

**Tela:** nenhuma mudança de código — a tabela e a nota seguem o registro.

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a escrita do teste da T1. **1 importante, aceito:** (I1) as duas notas diziam "fora o que já é bloqueado", mas a régua tira
também o em terceiros e a inspeção sem recebimento (`loteImpedido.js:64-69`) — com terceiros 2 sem lote, o relatório mostraria 4 e a nota
faria esperar 6 → as notas citam *Bloqueado, Em terceiros ou Em inspeção*; RN-225.06 (b). **3 menores, aceitos:** (M1) "continua contado no
Disponível" é falso com reservado (o impedido não desconta o reservado: *Disponível* 2, impedido 6) → "não é descontado do Disponível";
RN-225.06 (c) e C531; (M2) a RN-225.06 não dizia como a bloqueada nasce (gravada direto = sem lote conhecido → 4; quarentena num lote bom → 6)
→ dito na RN e no C531; (M4) a nota dizia "mesma régua de Materiais bloqueados", mas os dois filtros agora divergem de propósito (o
comprometido lista material só com lote impedido, o *Materiais bloqueados* não) → "Material inativado não aparece aqui (como em …)".
**Já atendido:** (M3) o `ORDER BY` está na consulta de fora. **Confirmado:** nenhum teste existente quebra (os de paridade leem o registro;
as cópias do cliente têm as próprias colunas); a tela formata 2.5 como "2,5" (`RelatoriosAlmoxarifado.js:94`); o export projeta pelo registro.

## Tasks (sort topológico)

- [x] **T1 (tronco)** — teste `server/tests/api/relatoriosLoteImpedido.api.test.js` (RN-225.01 a .09) vermelho → `reportService` (os dois
  `SELECT`, o filtro) + `reportRegistry` (colunas e notas) → verde. Controles positivos pelas sabotagens abaixo. `18084c49`.
- Sem galho: a tela é genérica (Fase 0, item 3). A RN-225.09 é a integração (lote → relatório pela rota).

## Sabotagens previstas (controle positivo)

1. tirar `lote_impedido` do `SELECT` do *Estoque atual* → .01, .02, .05, .08 caem;
2. voltar o filtro antigo do comprometido → .03, .07, .09 caem;
3. `lote_impedido` = Σ bruto dos lotes impedidos (sem descontar o bloqueado) → .06 cai;
4. tirar a coluna de um registro, ou pô-la antes do *Disponível* → .08 cai;
5. filtro do comprometido com `lote_impedido >= 0` → .03 (material só ATIVO) e .04 caem.

## Execução e controles (medidos)

- **Vermelho antes do código:** 0/12 (todas pela falta do campo/da coluna/do material no comprometido).
- **Verde:** 12/12; depois da Fase 2 (notas e RN-225.06 b/c) 14/14; depois da Fase 5 (RN-225.03 b/c) **16/16**.
- **Sabotagens** (script `e225-sabotagem.js` no scratchpad, troca por `split/join` com âncora contada = 1, restaura a cópia; `md5sum` igual
  antes e depois; `git diff --stat server/services` vazio): (1) sem a coluna no *Estoque atual* → 9 caem (.01, .02 a/b/d, .04, .06, .05,
  .08 planilha, .09); (2) filtro antigo → 7 caem (.02 a, b/c, .03, .04, .07, .08 planilha, .09); (3) soma bruta → 3 caem (.02 b/c, .06,
  .05); (4) coluna antes do *Disponível* → as duas .08; (4b) sem a coluna no comprometido → as duas .08; (5) filtro `>= 0` → 5 caem (.02 b/c,
  .02 d, .03, .04, .09). Fase 5: (M1) ordem por código → .03 c; (M9) filtro `>= 1` → .03 b.
- **Vizinhos rodados à mão antes do commit:** `relatoriosSaldos` 17, `relatoriosRegistro` 20, `relatoriosJornada` 6, `integracaoRelatoriosSaldos`
  6, `custoUnitarioFonteUnica` 12, `saldoEmTerceiros` 33, `materialClienteSegregacao` 14 — todos verdes, nenhum mudou.

## Fase 5 — revisão adversarial (2 revisores frescos em paralelo, junto com o `test:api`)

- **Regras e consumidores:** **nenhum achado reproduzido.** Comparou a consulta nova com a de antes (`7dfcd4a4`) sobre o mesmo banco: as
  linhas que já apareciam saem **idênticas** (valores, ordem das chaves e das linhas, inclusive dois materiais de mesmo nome); retenções
  `NULL`, negativa e resíduo 1e-12 filtram como antes; só os materiais com lote impedido entram (inativo fora); toda linha dos dois relatórios
  igual ao `lote_impedido` do extrato (0 divergências); a planilha com o cabeçalho e os valores certos.
- **Força dos testes:** 10 mutações. **2 sobreviviam a todas as suítes de relatório** — (M9) filtro `lote_impedido >= 1` (0,5 kg num lote
  bloqueado sumiria do comprometido) e (M1) ordem por código (o helper dava o mesmo texto a código e nome) → **RN-225.03 b e c**, `70941fd2`,
  cada um derrubado pela sua sabotagem. 5 sobreviviam só ao arquivo novo e caem em `relatoriosSaldos`/`integracaoRelatoriosSaldos` (ativo,
  retenções isoladas, físico). 3 (hoje em UTC, hoje congelado, nome do cliente) já caíam. **Ruído:** "hoje" fixado literalmente passaria no
  dia em que é escrito — vale para toda a régua (é `loteImpedido.js`, não desta etapa).
- **Contaminação:** as duas sabotagens da Fase 5 rodaram com o `test:api` no meio (arquivos com "c"); os de relatório ("r") ainda não tinham
  rodado — conferido no log antes de seguir.

## Divergências do plano

- A próxima tarefa da 224 dizia "*Posição do estoque*" em alguns documentos; o relatório se chama **Estoque atual** (a gêmea legada
  `/relatorio/posicao-estoque` não tem tela e ficou fora, B1491).
- As notas literais mudaram na Fase 2 (I1, M1, M4) — o contrato acima já está na versão final.

## Tasks feitas

- [x] Estimativa `6518f251` · plano `4d6e493d` · T1 `18084c49` · Fase 5 `70941fd2` · fechamento (este e o seguinte).

## Verificação (medida, serial)

Sobre `70941fd2` (código final; o `test:api` rodou sobre `18084c49` + o teste da Fase 5, que entrou antes de o runner chegar aos "r" —
o arquivo novo rodou com 16/16 no log):

- `npm run test:api` — **620/620 arquivos OK** (`relatoriosLoteImpedido` 16/16).
- `npm run test:almoxarifado` — **44 passou, 0 falhou**.
- `npm run test:validation` — **4/4**; `npm run test:safealter` — **3/3**; `npm run test:sqlite` — **16/16**.
- Cliente: `CI=true npx react-scripts test --watchAll=false --maxWorkers=2` — **224/224 suítes, 3038/3038 testes**; `CI=true npx react-scripts
  build` — **Compiled successfully**.
- Sem mudança de código no cliente (a tela e a planilha seguem o registro) — o Jest e o build foram rodados como conferência.

## Retro (4 números)

- **Rodadas até verde:** 1 (a implementação passou na primeira; a Fase 2 mudou texto e acrescentou cenários, a Fase 5 só cenários).
- **Achados reais:** Fase 2: 1 importante + 3 menores (aceitos) + 1 já atendido. Fase 5: 0 de regra; 2 lacunas de teste (fechadas); 1 ruído.
- **Paralelismo:** sem galhos (tela genérica); a Fase 2 rodou junto com a escrita do teste; os 2 revisores da Fase 5 junto com o `test:api`
  (o de testes numa worktree própria).
- **Defeito que escapou da 224:** nenhum achado.

## Fechamento

- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1488–B1491, C531, D (225), F (225), seção, topo e
  "onde estamos"; D (223) e D (224) apontando para a 225), spec 21 (topo e seção 225) e spec 10 (o "Fora" dos relatórios), mapa (linhas 10 e
  21 e última atualização), guia (seção e cabeçalho), manual (21d) e a estimativa.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 225 fecha o D (223) dos relatórios; o vizinho aberto de maior valor visível é o **D (224)** — o "Sai
de" da entrega oferece o lote bloqueado sem dizer, e a entrega o recusa ao confirmar. A spec 10 continua 🟢. **Sem estimativa** — começa pela
Fase 0.5.)*

**O "Sai de" da entrega (e da separação) diz qual lote está impedido (D (224)).**

- **Onde:** `RequisicoesList.js` — `rotuloOrigem(s, propriaNoPar)` (`:177`) monta o texto de cada opção do "Sai de" a partir das linhas de
  `GET /estoque/:materialId/saldos?requisicao_id=` (`:601`); a entrega usa em `:2668`, a separação em `:2529`. Desde a 224 cada linha já traz
  `lote_status`, `lote_validade`, `lote_vencimento_liberado_em`, `lote_esta_impedido` e `lote_vencido_sem_liberacao` (B1484, contrato no plano
  da 224) — **não precisa de servidor**.
- **O que fazer:** acrescentar ao rótulo, quando `lote_esta_impedido === true`, as mesmas palavras do extrato (B1486: *Bloqueado*,
  *Reprovado*, *Vencido em dd/mm/aaaa*, *Validade a corrigir: …*, *Impedido*) — por exemplo *"Z-01 — lote L2 (6) — Bloqueado: não sai"*.
  Reaproveitar a função das palavras do `ExtratoMaterialModal.js` (extrair para um util comum em vez de copiar). Decidir (B): mostrar e deixar
  escolher (a entrega recusa com a mensagem de hoje) ou desabilitar a opção (`disabled`) — desabilitar é mais claro, mas a opção planejada da
  separação pode apontar para um lote que ficou impedido depois: medir esse caminho (`temPlanejada`, `valorPlanejada`) antes de decidir.
- **Pontos de atenção:** o rótulo já tem o sufixo da 218 (`sufixoDoLote`, "— do lote podem sair 3 (1 bloqueada)") e a sobra da 201 — testar
  as combinações; `<option>` não aceita estilo nem `title` confiáveis (texto puro); Jest em `RequisicoesList` com mock na fronteira HTTP (as
  linhas com os cinco campos); servidor antigo sem os campos → rótulo de hoje, letra por letra. Pronto e que não reabre: os campos da 224, a
  recusa da entrega (206), a régua.
- Outros abertos: o vencido como situação no *Saldo por lote* (**D (225)**), C519, C521, C524–C527, C529–C531, C514–C518, C486, C491, C495,
  C497, C498.
