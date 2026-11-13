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

- [x] **T1 (tronco, servidor)** — `a78a80ec` — `server/tests/api/entregaSeriesLoteImpedido.api.test.js` (RN-232.01, .02) vermelho → as quatro colunas em
  `listarSeriesDoMaterial` (os booleanos convertidos no JS) → verde.
- [x] **T2 (galho, tela, contra o contrato acima)** — `533349da`, Fase 2 `7aa1f239` — `client/src/components/almoxarifado/RequisicoesEntregaSeriesImpedidas.test.js`
  (RN-232.03 a .07) vermelho → `RequisicoesList.js` → verde.
- Integração: a RN-232.02 (rota real) prova que a série apagada é a que a porta recusa e que a que a tela deixa marcar passa; a RN-232.04
  prova o payload.

## Sabotagens previstas (controle positivo)

1. servidor: `lote_esta_impedido` sempre 0 → .01 cai; sem a conversão a booleano → .01 cai; sem a parte do vencido → .01 vencido cai;
2. tela: o checkbox sem a guarda nova → .03 cai; o filtro das escolhidas sem a guarda → .05 cai; sem a frase → .03 cai;
3. tela: `situacaoDoLote` trocado por texto fixo → .06 cai; a guarda por "truthy" em vez de `=== true` → .07 cai (com `'false'`? não — com
   campo ausente: a guarda tem de ser pela situação).

*(Corrigido na Fase 2: o item 3 "truthy" não tinha teste que o derrubasse — entrou o cenário `lote_esta_impedido: 1`/`'true'`. O item 2
"filtro das escolhidas" virou código morto e saiu — ver Execução.)*

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a escrita dos testes. **Confirmado:** a literal da RN-232.02 (`<material>: Lote L2 esta bloqueado e nao pode ser utilizado`,
pelo caminho só-lote com `origem_automatica`); a régua do vencido igual dos dois lados (`vencimento_liberado_em` vazio não libera, data por
`substr(1,10)`); nenhum caso em que a tela apague o que a porta aceita; a caixa do próprio item (separada do lote impedido) é recusada em
todos os caminhos; T1 e T2 independentes (sem ciclo de `require`). **1 importante:** a sabotagem "guarda truthy" não caía (RN-232.07 só
testava o campo ausente) → cenário `lote_esta_impedido: 1`/`'true'` — `7aa1f239`. **3 menores:** (M1) o B1525 "desmarca" era só da conta:
a marcada que ficava impedida ao reler continuava no estado e, liberado o lote e relido de novo, voltava marcada ao lado da que o almoxarife
marcou no lugar (*"6 de 3"*) → o reler tira do estado (RN-232.05 Fase 2) — `7aa1f239`; (M2) a literal do vencido não estava congelada
(`Lote L2 vencido em <data crua> nao pode sair para consumo. Libere o vencimento …`; pela planejada, embrulhada em *"a origem da separação
(Z-02) não serve mais (…)"*) — o teste ancora o começo; (M3) já antes desta etapa: com a planejada aplicada à caixa inteira o filtro de
lote é nulo e a lista mostra **acesas** séries de outro lote **bom** que a porta recusa (*"as series escolhidas nao sao do lote dela"*) — não
é lote impedido, declarado em **D (232)** 3; série com lote apagado/de outro material vem acesa e a porta recusa — **D (232)** 4.

## Execução e controles (medidos)

- **Vermelho antes do código:** servidor 5/7 (as RN-232.01; as .02 passavam — documentam a porta, que não muda); tela 5/7 (os 2 controles
  passavam, como devem).
- **Divergência do plano:** o "filtro das escolhidas" em `seriesDoItem` (B1525) **saiu** — com o checkbox apagado e o reler limpando o
  estado, nenhuma série impedida chega às escolhidas, e a sabotagem dele (C2) passava: era código que nenhum teste derruba (a única porta de
  entrada nas escolhidas é o `alternarSerie` do checkbox, confirmado pelo revisor de fluxo da Fase 5). O B1525 vive no reler
  (`recarregarSeriesEntrega`).
- **Sabotagens** (script `e232-sabotagem.js` no scratchpad: troca por `split/join` com âncora contada (=1), roda o arquivo de teste,
  restaura e confere o `md5`): rodada 1 (T1/T2) — S1–S3 servidor e C1, C3 tela caem; C2 (o filtro das escolhidas) **passava** — código
  morto, saiu (acima); rodada 2 (Fase 2) — C4–C7 caem; rodada final (sobre o código da Fase 5, todas de novo) — **12/12 caem** (S1–S4
  servidor; C1, C3–C7, F1, F2 tela). Restauro conferido por `md5` em cada uma; `git status` sem sobra depois.

## Fase 5 — revisão adversarial do código (2 revisores frescos)

- **Fluxo (0 Critical/Important; 2 Minor não reproduzidos como defeito):** nenhum caminho manda série impedida no `PUT` (a única entrada nas
  escolhidas é o checkbox; o estado zera ao abrir; o reler limpa); nenhum caso em que a tela seja mais estrita que a porta (as bordas de
  status vazio, validade vazia ou torta, liberação vazia, série sem lote dão a mesma resposta); as outras telas que leem a listagem não
  copiam o objeto da série para o que gravam. Minor 1: com 3 a entregar e só 2 séries boas o **Confirmar** fica apagado e a dica é a de
  sempre (*"Escolha exatamente 3 série(s) …"*) — a quantidade ainda conta o físico do lote impedido; fica (é a régua do saldo, não da
  lista). Minor 2: duas releituras fora de ordem (herdado da Etapa 61, não reproduzido; a porta recusa) — ruído.
- **Testes (4 Minor argumentados, fechados ou declarados):** o reler com a guarda truthy (F1) e o rótulo da série errada (F2) passavam →
  cenários novos (o reler com `lote_esta_impedido: 1` mantém a marcada; RN-232.05 confere o rótulo do L2 ao lado do L1); a RN-232.02 não lia
  a listagem e não tinha REPROVADO → cenário REPROVADO que lê a listagem e entrega pela porta; o `!s.falhou &&` da frase era equivalente
  (lista vazia) e saiu. **Declarado:** a guarda `impedida` no checkbox de uma série **marcada** não tem teste (o reler desmarca antes —
  inalcançável hoje); o "vence hoje → false" do servidor só derrubaria uma troca por data UTC entre 21h e 24h de Brasília (o mesmo das
  etapas 224/231). — `29201ab2`.

## Limitações (D (232))

1. **A saída avulsa** (Movimentações → Saída) de material com série ainda lista as séries do lote impedido (a listagem já traz a situação).
2. **A situação é a da leitura (C537).**
3. **Planejada aplicada à caixa inteira** (Fase 2 M3, anterior a esta etapa): a lista mostra acesas séries de outro lote bom que a porta
   recusa.
4. **Série com lote apagado ou de outro material** (dado quebrado): vem acesa; a porta recusa.

## Retro

- Rodadas de correção até verde: 2 (Fase 2: o reler e o cenário truthy; Fase 5: os cenários de teste).
- Achados: Fase 2 — 1 importante (corrigido), 3 menores (1 corrigido, 2 declarados); Fase 5 — 0 defeitos de produção reproduzidos, 4
  lacunas de teste reais (3 fechadas, 1 declarada inalcançável), 2 ruídos.
- Paralelismo: T1 e T2 sequenciais no mesmo agente (pequenas); revisores da Fase 5 em paralelo com o `test:api`, sem retrabalho.
- Defeito que escapou: — (preencher na etapa seguinte). Da 231: nenhum descoberto.

## Verificação (medida, serial)

- Servidor: `test:api` **626/626 arquivos OK** (sobre `7aa1f239`; a Fase 5 não mexeu no código do servidor, só no teste — rodado sozinho,
  **8/8**); `test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0** (sobre `29201ab2`).
- Tela (sobre `29201ab2`): `react-scripts test --maxWorkers=2` **227/227 suítes, 3089/3089 testes**; `react-scripts build` (CI=true)
  **Compiled successfully**.
- Arquivos da etapa: `entregaSeriesLoteImpedido` **8/8**, `RequisicoesEntregaSeriesImpedidas` **10/10**; `serieService` 13/0, `serieRotas`
  3/0.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 232 fecha a D (231) 1; a feature 05 continua 🟡. O que esta etapa declarou de fora e que pega o mesmo
gesto em outra tela é a **D (232) 1** — pequena, com fatia visível, e a listagem já traz o que ela precisa. **Sem estimativa** — começa pela
Fase 0.5.)*

**A saída avulsa não deixa marcar série de lote impedido (D (232) 1).**

- **O problema:** **Movimentações → Saída** (e as outras saídas com série: `TIPOS_SAIDA_LOTE`) de material com série lista as séries em
  estoque (`seriesDisponiveis`, `MovimentacoesAlmoxarifado.js:1221`), filtradas só pelo lote escolhido no formulário (`form.lote_id`). Com o
  lote em branco aparecem as do lote bloqueado; marcadas, o motor recusa (`stockService.js:~1571`, *"Lote L2 esta bloqueado e nao pode ser
  utilizado"*). *(**Estava errado** — medido na Fase 0 da Etapa 233: o motor só recusava com o lote **escolhido**; com o lote em branco,
  em material sem controle por lote, a Saída e a Perda baixavam a série de lote impedido (201). A 233 fecha isso, `b3fc7a0a`.)*
- **O contrato que ela consome:** `GET /materiais/:id/series?status=EM_ESTOQUE` com `lote_status`, `lote_validade`, `lote_esta_impedido`,
  `lote_vencido_sem_liberacao` (B1523, esta etapa). Sem mexer no servidor.
- **Ponto de atenção — o vencido não é igual em todo tipo de saída:** o motor recusa **BLOQUEADO/REPROVADO** em qualquer saída, mas o
  **vencido** só no consumo — `SUCATA`, `PERDA` e o ajuste negativo baixam lote vencido (é como o vencido sai do sistema; comentário em
  `stockService.js` logo abaixo da guarda de status). Apagar a série vencida na sucata seria a tela mais estrita que a porta. Medir os
  tipos de `TIPOS_SAIDA_LOTE` e a regra de cada um antes de escolher a guarda.
- **O que já está pronto:** `situacaoDoLote` (palavras do extrato), o molde do rótulo e da frase desta etapa; o efeito que sincroniza
  `serie_ids` com as visíveis (`:394-406`) é onde a série impedida sai do estado.
- Outros abertos: C522 e C526 (a reserva saber o lote, grande), C524, C525, C527, C529–C531, C533, C534, C536, C537, C514–C518, C486, C491,
  C495, C497, C498.
