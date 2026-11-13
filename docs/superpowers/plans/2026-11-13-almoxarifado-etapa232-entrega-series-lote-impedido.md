# Etapa 232 — a entrega não deixa marcar série de lote impedido (D (231) 1)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa231-entrega-origem-lote-impedido.md` (`:193-214`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-entrega-series-lote-impedido.txt` (**2h30**, `46900440`). Números de linha
> medidos sobre `a0c5a30d`.

## Objetivo (em linguagem simples)

Material com número de série e lote. Na janela de entrega, quando o "Sai de" não tem lote (*"Escolha de onde sai"*, *"Qualquer endereço
(automático)"*, *"Planejada da separação"* com a busca de saldos falha), a lista **Séries que saem** mostra as séries em estoque de todos os
lotes — inclusive as de um lote bloqueado, reprovado ou vencido. Marcadas, a entrega é recusada no clique. Depois desta etapa: essas séries
continuam na lista, **apagadas** (não dá para marcar), com o lote e a situação ao lado, uma frase embaixo explica, e elas não contam para o
**Confirmar Entrega**.

## Fase 0 — medido em 2026-11-13 (sobre `a0c5a30d`)

1. **A lista** (`RequisicoesList.js`): `seriesDoLote(info, loteId)` (`:374`) filtra pelo lote do "Sai de" (`lerValorOrigem(...).lote_id`);
   sem lote (`__escolher__`, `''`, `__planejada__` — `lerValorOrigem` devolve `null` para os três) mostra todas. `seriesDoItem` (`:1286`)
   devolve `{ visiveis, escolhidas, falhou, lotesMisturados }`; `entregaSeriesPendente` (`:1302`) segura o Confirmar se
   `escolhidas.length !== qtd`; o checkbox em `:2882-2896` (`disabled={bloqueada}` = escolhida em outro item ou contador cheio).
2. **A série não diz a situação do lote.** `GET /api/almoxarifado/materiais/:id/series?status=EM_ESTOQUE` (`extended.js:1387`) →
   `seriesService.listarSeriesDoMaterial` (`seriesService.js:31`): `s.*`, `lt.codigo AS lote_codigo`, `loc.descricao`. Nada do status nem da
   validade do lote.
3. **Cruzar com as linhas de saldo da janela não basta**: `saldosEntrega[material]` só existe para material com linha de saldo; série num lote
   sem linha positiva no endereço (dado antigo, série "fantasma" — Etapa 61 RN-06) ficaria sem situação, e as linhas são de outra leitura.
4. **A porta** (`requisitionService.js:2410-2446`): o lote da entrega vem das séries (`loteSeries`); com lote impedido a recusa é a de
   `checarOrigemItem` (`:1378-1386`): `Lote L2 esta bloqueado e nao pode ser utilizado` / `Lote L2 vencido em <data> nao pode sair para
   consumo. …`. Não muda.
5. **Reler as séries**: `recarregarSeriesEntrega` (`:1324`) roda depois de uma entrega recusada (`:1177`) e mantém só as marcações que
   continuam em estoque.
6. **A separação não tem lista de séries** (só a entrega busca `/series`, Etapa 61). **Celular**: sem entrega (231, Fase 0 item 7).
7. **Outros consumidores da listagem**: `ExtratoMaterialModal.js`, `LotesAlmoxarifado.js`, `MovimentacoesAlmoxarifado.js` — campos novos
   aditivos, nenhum deles muda. A saída avulsa (Movimentações) também lista séries de lote impedido — fica de fora (D (232) 1).

## Caminhos

- **(escolhido)** a listagem de séries ganha a situação do lote (aditivo, a régua da 224); a tela apaga a série de lote impedido, com o rótulo
  da situação e uma frase, e tira a série impedida das escolhidas.
- **(descartado)** cruzar com as linhas de saldo da janela (só tela): série num lote sem linha de saldo escapa (Fase 0 item 3).
- **(descartado)** esconder a série impedida: com a peça na mão, o almoxarife veria "Nenhuma série em estoque" e não saberia por quê.
- **(descartado)** a listagem filtrar as impedidas no servidor: muda o que as outras três telas veem (Lotes e Séries mostra todas).

## Decisões (letra B — reversíveis; livres B1523 a B1526 e C537, conferido por `grep` em `docs` e `specs`)

- **B1523 — a listagem de séries diz a situação do lote.** `GET /materiais/:id/series` ganha por série, aditivo: `lote_status`
  (texto|null), `lote_validade` (texto|null), `lote_esta_impedido` (booleano), `lote_vencido_sem_liberacao` (booleano) — a régua da 224
  (`predicadoLoteImpedidoSql`/`predicadoLoteVencidoSql`, "hoje" de Brasília), falsos sem lote. Os mesmos nomes das linhas de saldo da 224.
- **B1524 — na entrega a série de lote impedido vem apagada.** Checkbox `disabled`, e ao lado do número o rótulo
  `· lote <codigo> — <situação>: não sai` (as palavras de `situacaoDoLote`, como a opção apagada do "Sai de" da 226). Descartado: esconder.
- **B1525 — a série impedida não conta.** `seriesDoItem` tira das `escolhidas` a série cujo lote está impedido (não vai no `PUT`, não conta no
  contador nem no Confirmar). Uma série marcada que fica impedida ao reler (depois de uma recusa) é desmarcada.
- **B1526 — a frase.** Embaixo da lista, quando há ao menos uma série visível impedida, `#entrega-series-impedidas-<item>`.
- **C537 (aviso) — a situação é a da leitura das séries** (ao abrir a janela, ou ao reler depois de uma recusa). O lote bloqueado com a janela
  aberta só aparece depois da recusa (que relê) ou ao reabrir — a mesma regra do C536.

## Regras de negócio (RN-232.xx)

Cenário-base da tela: item `id 1`, *Chapa 3mm*, material 10 com série, entregável 3, separado de Z-02/L2 (L2 BLOQUEADO → a janela abre em
`__escolher__`, Etapa 231). Séries EM_ESTOQUE: `S1`, `S2`, `S3` em L1 (id lote 7, ATIVO) e `S4`, `S5` em L2 (id lote 12, BLOQUEADO).

| RN | Enunciado | Cenário |
|---|---|---|
| RN-232.01 | A listagem de séries diz a situação do lote | servidor: séries em L1 e L2, L2 BLOQUEADO → série de L2 `lote_esta_impedido: true`, `lote_status: 'BLOQUEADO'`, `lote_vencido_sem_liberacao: false`; de L1 → `false`, `'ATIVO'`; L2 REPROVADO → `true`; L2 ATIVO vencido ontem → `true`, vencido `true`, `lote_validade` crua; vencido com o vencimento liberado → `false`; série sem lote → `false`, `false`, status `null`. `lote_codigo` continua. Booleanos de verdade (`=== true`). |
| RN-232.02 | Integração: a porta recusa a série impedida e aceita a boa (o que a tela apaga corresponde à recusa) | servidor, rota real: entregar com `origem_automatica: true` e séries de L2 BLOQUEADO → 400 `<material>: Lote L2 esta bloqueado e nao pode ser utilizado` (literal medida no teste) e nada baixa; com séries de L1 → 200 e as séries ficam `ENTREGUE`; L2 vencido ontem → 400 |
| RN-232.03 | A série de lote impedido vem apagada, com o rótulo e a frase | a janela em `__escolher__`: checkboxes de S4 e S5 `disabled`, rótulo `· lote L2 — Bloqueado: não sai`; S1–S3 habilitados e sem rótulo; `#entrega-series-impedidas-1` com a frase; controle: sem série impedida → todas habilitadas e sem frase |
| RN-232.04 | A série impedida não conta | escolhe XB-01/L1 → só S1–S3 visíveis, sem frase; escolhe "Qualquer endereço": marca S1, S2, S3 → contador `3 de 3`, Confirmar habilitado e o `PUT` leva `serie_ids [S1,S2,S3]`; com só S1, S2 boas e qtd 3 → Confirmar apagado |
| RN-232.05 | Ao reler, a marcada que ficou impedida é desmarcada | "Qualquer endereço", marca S1–S3, a entrega é recusada (mock 400), a releitura traz L1 BLOQUEADO → S1–S3 apagadas e desmarcadas, contador `0 de 3`, Confirmar apagado |
| RN-232.06 | As palavras são as do extrato | `REPROVADO` → `· lote L2 — Reprovado: não sai`; vencido `2026-11-10` → `· lote L2 — Vencido em 10/11/2026: não sai` |
| RN-232.07 | Sem o campo (resposta antiga), como antes | séries sem `lote_esta_impedido` → todas habilitadas, sem rótulo nem frase |

## Contratos congelados

- `GET /api/almoxarifado/materiais/:id/series[?status=]` — cada série ganha (aditivo) `lote_status`, `lote_validade`, `lote_esta_impedido`
  (booleano), `lote_vencido_sem_liberacao` (booleano). Nenhum campo existente muda. Só `=== true` conta.
- `PUT /requisicoes/:id/entregar` — **não muda** (recusa de sempre).

Literais da tela:

- rótulo da série impedida (um `<span data-serie-situacao="<id>">` depois do número e do endereço):
  `` ` · lote ${serie.lote_codigo} — ${situacaoDoLote(serie)}: não sai` ``;
- frase: `<div id="entrega-series-impedidas-<item>">`
  `Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.`

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor)** — `server/tests/api/entregaSeriesLoteImpedido.api.test.js` (RN-232.01, .02) vermelho → as quatro colunas em
  `listarSeriesDoMaterial` (os booleanos convertidos no JS) → verde.
- [ ] **T2 (galho, tela, contra o contrato acima)** — `client/src/components/almoxarifado/RequisicoesEntregaSeriesImpedidas.test.js`
  (RN-232.03 a .07) vermelho → `RequisicoesList.js` → verde.
- Integração: a RN-232.02 (rota real) prova que a série apagada é a que a porta recusa e que a que a tela deixa marcar passa; a RN-232.04
  prova o payload.

## Sabotagens previstas (controle positivo)

1. servidor: `lote_esta_impedido` sempre 0 → .01 cai; sem a conversão a booleano → .01 cai; sem a parte do vencido → .01 vencido cai;
2. tela: o checkbox sem a guarda nova → .03 cai; o filtro das escolhidas sem a guarda → .05 cai; sem a frase → .03 cai;
3. tela: `situacaoDoLote` trocado por texto fixo → .06 cai; a guarda por "truthy" em vez de `=== true` → .07 cai (com `'false'`? não — com
   campo ausente: a guarda tem de ser pela situação).
