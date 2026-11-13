# Etapa 227 — o *Saldo por lote* diz que o lote ativo está vencido (D (225)) e a Fila de separação diz o impedido (D (223))

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa226-sai-de-lote-impedido.md`. Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-saldo-por-lote-vencido.txt` (**4h**: 2h45 + 1h15, `4f559e67`). Números de
> linha medidos sobre `084fe4b1`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo
> 7½ e o 8). Por pedido do André, a D (225) é pequena e vai junto com o vizinho de lote impedido mais próximo nomeado nos planos 225/226 — a
> coluna *disponível* da Fila de separação (D (223)) —, porque as duas somam até 4h.

## Objetivo (em linguagem simples)

1. O relatório *Saldo por lote* mostra a validade e o status de cada lote, mas um lote *Ativo* que já venceu aparece como qualquer outro.
   Depois desta etapa ele ganha a coluna *Situação*, com as palavras do extrato (*Vencido em 10/11/2026*, *Bloqueado*, *Reprovado*…), na tela
   e na planilha.
2. Na Fila de separação, cada item diz *"disponível 10"* contando as peças de lote impedido. Depois desta etapa diz *"disponível 10 · 6 em lote
   impedido"*, como a Nova Reserva (223).

## Fase 0 — medido em 2026-11-13 (sobre `084fe4b1`)

1. `reportService.relatorioSaldoPorLote` (`reportService.js:44`): um `SELECT … l.data_validade as validade, l.status as status_lote,
   SUM(s.quantidade) … GROUP BY s.material_id, l.id` **sem filtro de `controle_lote`**; depois a linha "Sem lote atribuído" (residual) e o
   material com controle que nunca teve lote, montados em JS (`validade: null, status_lote: null`). Um consumidor: `extended.js:2600`.
2. Registro `'saldo-por-lote'` (`reportRegistry.js:659`): colunas estáticas; nota longa que o teste `relatoriosSaldos (2g)` confere por
   `includes` (acrescentar no fim não quebra). A tela (`RelatoriosAlmoxarifado.js:83`: `null`/`''` → "—") e o xlsx (`extended.js:2682`,
   projetado pelo registro) são genéricos. Nenhuma cópia das colunas no cliente (`grep status_lote client/src` → 0).
3. Testes que leem o relatório (`relatoriosSaldos`, `lotesResumo`, `entregaAutomaticaPeloLoteIntegracao`, `movimentacaoV1LoteIntegracao`,
   `integracaoRelatoriosSaldos`) acham a linha e leem campos — nenhum compara a linha inteira.
4. As palavras: só no cliente (`client/src/utils/situacaoDoLote.js`, B1496) — a planilha é feita no servidor e não roda o cliente.
5. A régua: `predicadoLoteImpedidoSql(l, hoje)` e `predicadoLoteVencidoSql(l, hoje)` (`loteImpedido.js`), o "hoje" de Brasília
   (`diaLocal.hojeLocalISO()`); o extrato faz assim desde a 224 (`stockService.js:4037-4053`, booleanos convertidos com `=== 1`).
6. Fila: `requisitionService.js:1115` já lê `${loteImpedidoSql('ma')} as lote_impedido` por item (usa no teto do separável e do entregável);
   a linha que vai à tela (`:1170-1190`) traz `disponivel: Q.qtd(num(i.saldo_disponivel))` mas não o impedido. `FilaSeparacao.js:78` escreve
   `disponível ${fmtQtd(it.disponivel)}`.
7. Sem banco, sem trava (só leitura, como 222–226), sem rota nova, sem perfil.

## Caminhos

- **(escolhido)** coluna nova *Situação* (`situacao_lote`) logo depois de *Status do lote*, texto montado no servidor por uma cópia da função
  do cliente, com um teste que roda as duas sobre a mesma tabela de casos; a Fila ganha `lote_impedido` na linha e um pedaço no texto.
- **(descartado)** trocar *Status do lote* pela situação: some o status cru (`ATIVO`) que hoje se lê; aditivo é reversível.
- **(descartado)** devolver só os booleanos e montar a palavra na tela: a planilha exportada ficaria sem a palavra.
- **(descartado)** o cliente importar a função do servidor: o CRA não importa fora de `src/`.

## Decisões (letra B — reversíveis; livres B1498 a B1502, C533, conferido por `grep` em `docs` e `specs`)

- **B1498 — o *Saldo por lote* ganha a coluna *Situação*.** Campo `situacao_lote` em toda linha: as palavras do extrato quando o lote está
  impedido (`Bloqueado`, `Reprovado`, `Vencido em dd/mm/aaaa`, juntas por ` · `; `Validade a corrigir: <texto>` quando a validade gravada não
  é AAAA-MM-DD; `Impedido` com outro status), `null` quando o lote pode sair e na linha "Sem lote atribuído". Registro: `{ chave:
  'situacao_lote', rotulo: 'Situação' }` logo depois de `status_lote`. *Status do lote* fica. Descartado: substituir o status; palavra só na
  tela.
- **B1499 — as palavras moram também no servidor.** `server/services/almoxarifado/situacaoDoLote.js` (CommonJS) é a mesma função do
  `client/src/utils/situacaoDoLote.js`; o teste da RN-227.05 lê o arquivo do cliente, tira o `export` e roda as duas sobre a mesma tabela —
  quem mudar uma sem a outra derruba o teste. Descartado: o cliente importar do servidor (CRA).
- **B1500 — a régua é a do extrato.** `lote_esta_impedido` e `lote_vencido_sem_liberacao` calculados no `SELECT` com
  `predicadoLoteImpedidoSql('l', hoje)`/`predicadoLoteVencidoSql('l', hoje)` e um `hoje = diaLocal.hojeLocalISO()` (Brasília) lido uma vez;
  `=== 1` em JS. Com o controle de lote desligado a linha ainda diz (como o extrato, B1485): o relatório não filtra por `controle_lote`.
  Os campos auxiliares (`lote_esta_impedido`, `lote_vencido_sem_liberacao`, `vencimento_liberado_em`) **não** saem na linha (a linha de
  saída é montada campo a campo, como hoje).
- **B1501 — a nota do *Saldo por lote* diz o que é a coluna.** Acrescenta no fim (literal no contrato).
- **B1502 — a Fila de separação diz o impedido.** Cada item da `GET /fila-separacao` ganha `lote_impedido` (`Q.qtd(max(0, …))`, o número do
  extrato, do material) e a tela escreve `disponível 10 · 6 em lote impedido` (um pedaço à parte, como a Nova Reserva) quando
  `Number(lote_impedido) > 0`; sem o campo, 0 ou negativo: `disponível 10`, letra por letra. O `disponivel` não muda (B1374). Descartado
  (Fase 2 I1): o parêntese `disponível 10 (6 em lote impedido)` — lê-se "6 dos 10", e o impedido não desconta o reservado e pode passar do
  disponível (C531: reservado 8 → `disponível 2`, impedido 6); unidade no número (o *disponível* também vai sem unidade).
- **C533 (aviso) — vencido liberado e "vence hoje" ficam com a *Situação* vazia.** O lote cujo vencimento foi liberado, ou que vence hoje,
  pode sair: *Situação* vazia, embora a *Validade* mostre a data. A situação é a da hora em que o relatório foi gerado.

## Regras de negócio (RN-227.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-227.01 | A coluna diz a situação do lote impedido; o bom fica vazio | material com L1 ATIVO 4 (sem validade), L2 BLOQUEADO 6, L3 REPROVADO 2, L4 ATIVO vencido ontem 3: `situacao_lote` = `null`, `Bloqueado`, `Reprovado`, `Vencido em <ontem dd/mm/aaaa>` |
| RN-227.02 | Vencido liberado, vence hoje, futura: vazio; combinações | L4 + `PUT /lotes/L4/liberar-vencimento` → `null`; validade hoje → `null`; amanhã → `null`; BLOQUEADO vencido ontem → `Bloqueado · Vencido em …`; validade `01/03/2027` (texto) → `Validade a corrigir: 01/03/2027` (Fase 2 I2: `31/03/2027` não vence pela régua — `'31/03/2027' < '2026-11-13'` é falso); status `QUARENTENA` (gravado direto) → `Impedido` |
| RN-227.03 | A linha sem lote fica vazia | material com L2 BLOQUEADO 6 e um ajuste que deixa residual → a linha "Sem lote atribuído" com `situacao_lote null`; material com controle que nunca teve lote → a linha única com `null` |
| RN-227.04 | Controle de lote desligado: a linha ainda diz | material com L2 BLOQUEADO 6 e depois `controle_lote = 0` → `Bloqueado` |
| RN-227.05 | As palavras são as do cliente | a tabela de casos (ATIVO, BLOQUEADO, REPROVADO, vencido, vencido + bloqueado, validade texto, validade vazia com o booleano, status estranho, `lote_esta_impedido` falso/`1`/`'true'`, `null`) dá o mesmo resultado na função do servidor e na do `client/src/utils/situacaoDoLote.js` |
| RN-227.06 | O registro e a planilha têm a coluna, depois do *Status do lote* | `GET /relatorios`: a coluna `situacao_lote`/`Situação` logo depois de `status_lote`; a nota termina com o literal; o xlsx tem *Situação* logo depois de *Status do lote*, e a célula do L4 vale `Vencido em …`; a linha não traz os campos auxiliares |
| RN-227.07 | O "hoje" é o de Brasília (`diaLocal`) | com `diaLocal.hojeLocalISO` trocado no teste para `2026-11-13` e a validade `2026-11-12` → `Vencido em 12/11/2026`; trocado para `2026-11-12` → `null` |
| RN-227.08 | Integração: bloquear e liberar pela rota muda a coluna | L2 ATIVO → `null`; `PUT /lotes/L2/status BLOQUEADO` → `Bloqueado`; `PUT … ATIVO` → `null` |
| RN-227.09 | A fila traz o impedido do material | requisição de 5 com L1 ATIVO 4 + L2 BLOQUEADO 6 → item da fila `disponivel 10`, `lote_impedido 6`, igual ao `loteImpedidoSql` do material; com reservado 8 → `disponivel 2`, `lote_impedido 6` (Fase 2 I1); sem bloqueio → `lote_impedido 0`; material sem controle de lote → 0 |
| RN-227.10 | A tela da fila escreve o parêntese | item `disponivel 10, lote_impedido 6` → `… · disponível 10 · 6 em lote impedido`; `lote_impedido 2.5` → `· 2,5 em lote impedido`; `0`, ausente ou negativo → `… · disponível 10` letra por letra; `disponivel 2`, impedido 6, com origem → `disponível 2 · 6 em lote impedido · separado de A-01 — L-77` |

## Contratos congelados

**`GET /api/almoxarifado/relatorios/saldo-por-lote`** (e o `/export`) — query, autorização e erros iguais aos de hoje. Cada linha ganha
`situacao_lote` (texto|null). Nenhum campo existente muda; nenhum campo auxiliar sai.

**`GET /api/almoxarifado/relatorios`** — `saldo-por-lote.colunas`: `… { status_lote, 'Status do lote' }, { situacao_lote, 'Situação' },
{ quantidade, 'Saldo atribuído' }, …`. `saldo-por-lote.nota`: a de hoje + `' Situação = por que o lote não sai para uso (Bloqueado, Reprovado,
Vencido em dd/mm/aaaa ou Validade a corrigir, as palavras do extrato do material); vazia quando o lote pode sair (inclusive o vencido com o vencimento
liberado).'`

**`GET /api/almoxarifado/fila-separacao`** — cada item ganha `lote_impedido` (número ≥ 0). Nenhum campo muda. (Fase 2 I3: o teste
`filaSugestaoColeta [RN-188.01]` confere a lista exata de chaves do item — ganha `lote_impedido`.)

Literais da tela da fila: depois de `` `disponível ${fmtQtd(it.disponivel)}` ``, quando `Number(it.lote_impedido) > 0`, o pedaço
`` `${fmtQtd(it.lote_impedido)} em lote impedido` `` (juntos por ` · `).

As palavras (B1499): idênticas a `client/src/utils/situacaoDoLote.js` — `Bloqueado`, `Reprovado`, `Vencido em dd/mm/aaaa`, `Validade a
corrigir: <texto ou —>`, juntas por ` · `; `Impedido` quando nenhuma se aplica.

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a escrita do teste. **3 importantes, aceitos:** (I1) o parêntese `disponível 2 (6 em lote impedido)` lê-se "6 dos 2" — o
impedido não desconta o reservado (C531, `loteImpedido.js:64-77`) e a Nova Reserva usa um pedaço à parte (`ReservasAlmoxarifado.js:54`) →
pedaço ` · 6 em lote impedido` (B1502) e o cenário com reservado 8 na RN-227.09; (I2) `31/03/2027` como texto **não** vence pela régua
(comparação de texto: `'31/03/2027' < '2026-11-13'` é falso) — o literal só valia no Jest do extrato, que injeta os booleanos → `01/03/2027`;
(I3) `filaSugestaoColeta [RN-188.01]` confere a lista exata de chaves do item da fila → entra no escopo da T1. **3 menores:** (M4) a linha do
relatório usa `status_lote`/`validade`, a função lê `lote_status`/`lote_validade` — o serviço monta o objeto com os nomes certos (a
RN-227.01 pega o erro); (M5) a nota não citava *Validade a corrigir* → cita; (M6) na tela a *Validade* sai `dd/mm/aa` e a *Situação*
`dd/mm/aaaa` — cosmético, aceito (a palavra é a do extrato). **Confirmado:** o relatório não filtra `controle_lote` (só o "nunca teve lote");
status fora da lista é possível (sem CHECK no banco) e vira *Impedido*; `liberar-vencimento` só grava `vencimento_liberado_em`; a fila
calcula `lote_impedido` para todo item; o xlsx projeta pelo registro e `instanteDoBancoNoFuso` não mexe no texto; a lista de coleta impressa
e o `coletaTexto` não mostram o disponível (nada a jusante contradiz); T2 só depende do campo congelado.

## Tasks (sort topológico)

- [x] **T1 (tronco)** — `2460585f` — teste `server/tests/api/relatorioSaldoPorLoteSituacao.api.test.js` (RN-227.01 a .09) vermelho → `situacaoDoLote.js`
  do servidor, `reportService.relatorioSaldoPorLote`, `reportRegistry` (coluna e nota), a linha da fila → verde. Entraram também
  `filaSugestaoColeta [RN-188.01]` (Fase 2 I3) e a exceção da varredura do registro (`relatoriosRegistro [revisao I1]`, B1503 — divergência
  abaixo).
- [x] **T2 (galho do contrato da fila)** — `3ba4fd58` — — `FilaSeparacao.test.js` (RN-227.10) vermelho → `descricaoItem` → verde. Pequena: feita na
  sequência pelo mesmo executor (um arquivo de tela).
- A RN-227.08 é a integração (lote pela rota → relatório pela rota); a .06 cruza o registro com a planilha.

## Sabotagens previstas (controle positivo)

1. `situacao_lote` sempre `null` → .01, .02, .04, .06, .07, .08 caem;
2. vencido sem os booleanos da régua (ex.: `validade < hoje` em JS, ignorando a liberação) → .02 (liberado) cai;
3. "hoje" em UTC/`new Date` em vez de `diaLocal` → .07 cai;
4. filtro `controle_lote = 1` na situação → .04 cai;
5. trocar uma palavra só no servidor (ex.: `Vencido desde`) → .05 cai;
6. coluna antes de *Status do lote* ou fora do registro → .06 cai;
7. linha "Sem lote atribuído" herdando a situação do último lote → .03 cai;
8. fila sem `lote_impedido` → .09 e (cliente) .10 cai; parêntese com `>= 0` → .10 (zero) cai.

## Execução e controles (medidos)

- **Vermelho antes do código:** 13/13 no arquivo novo (cada um pela falta do campo, da coluna ou do módulo); o Jest da fila caiu no cenário novo.
- **Verde:** 13/13; depois da Fase 5, **16/16**. `FilaSeparacao.test.js` 27/27.
- **Vizinhos rodados à mão antes do commit:** `relatoriosSaldos` 17, `relatoriosRegistro` 20 (caiu 1 antes da B1503 — divergência abaixo),
  `relatoriosJornada` 6, `integracaoRelatoriosSaldos` 6, `lotesResumo` 13, `loteImpedidoSeparacao` 10, `relatoriosLoteImpedido` 16,
  `entregaAutomaticaPeloLoteIntegracao` 8, `movimentacaoV1LoteIntegracao` 14, `filaSugestaoColeta` 13 — verdes.
- **Sabotagens** (scripts `e227-sabotagem.js`, `e227-sab-varredura.js` e `e227-sabotagem-f5.js` no scratchpad, troca por `split/join` com
  âncora contada = 1, restaura a cópia; `md5sum` igual antes e depois): (1) situação sempre `null` → 9 caem; (2) vencido em JS sem a
  liberação → .02 a; (3) "hoje" em UTC → .07; (4) filtro `controle_lote` → .04; (5) palavra trocada só no servidor → 6 caem, inclusive .05;
  (6) coluna fora do registro / (6b) antes do status → as duas .06; (7) "Sem lote" herdando → .03; (8a) fila sem o campo → .09; (8c/8d/8e)
  tela sem o pedaço, com `>= 0`, entre parênteses → .10. Varredura do registro: (V1) chave errada → cai; (V3) a coluna também no SQL → cai.
  Fase 5: (F1) fila menos a reserva do item, (F2) arredondada, (F3) situação só com saldo positivo, (F4) cliente sozinho com `trim` → cada
  uma derruba o seu cenário. **18 derrubadas.** **Equivalentes (não caem, e não deveriam):** (8b) a fila sem o `max(0)` — `loteImpedidoSql`
  já é ≥ 0 (o `MAX(0, …)` de fora); (V2) a linha sem a coluna na varredura do registro — o banco daquele teste não tem lote (a .01 e a .06
  deste arquivo derrubam).

## Divergências do plano

- A **varredura do registro** (`relatoriosRegistro [revisao I1]`) exige que toda coluna declarada venha do SQL; a *Situação* é montada em JS e
  o plano não previa — a Fase 2 não a viu. Saída: a lista `COLUNAS_MONTADAS_EM_JS` com duas provas (não pode estar no SQL; tem de estar na
  linha) — **B1503**. Descartado: `NULL as situacao_lote` no `SELECT` só para passar.
- O texto da Fila (B1502) e o literal da validade em texto (RN-227.02) mudaram na Fase 2 (I1, I2), antes do código.

## Fase 5 — revisão adversarial (2 revisores frescos em paralelo, junto com o `test:api`)

- **Regras e gestos:** **nenhum achado reproduzido** (sonda no scratchpad, app em memória): o relatório × `situacaoDoLote` das linhas de
  `/estoque/:id/saldos` lote a lote — um lote em dois endereços, validade com hora, lote negativo, status `ativo` minúsculo (*Impedido* nos
  dois), controle desligado; a planilha (*Situação* depois de *Status do lote*; vazia em branco); a Fila com fração, dois itens do mesmo
  material e `PRONTA_PARA_RETIRADA`; nenhuma outra tela lê o `disponivel` do item da fila; cliente velho × servidor novo e o inverso.
  **Ruído:** (1) a planilha passa toda célula por `instanteDoBancoNoFuso` — uma validade gravada com hora (só por SQL direto) sai com 3 h a
  menos na coluna *Validade* (anterior à etapa); (2) com o controle desligado o relatório diz *Bloqueado* e a Fila 0 — declarado (RN-227.04,
  C530); (3) "disponível 2 · 6 em lote impedido" — a Fase 2 I1 já escolheu o pedaço à parte.
- **Força dos testes:** 16 mutações novas numa cópia fora da árvore (junction de `node_modules`). 12 mortas; **4 sobreviviam** — (M13) a fila
  tirando a reserva do próprio item (*"2 em lote impedido"* com 6 bloqueadas), (M09) a fila arredondando (2,5 → 3), (M12) a situação calada no
  lote negativo, (M04) o cliente sozinho com `trim` na validade. O código estava certo; faltava a asserção → três cenários, `6caa31a5`, cada
  mutação derrubada (F1 a F4 acima).

## Tasks feitas

- [x] Estimativa `4f559e67` · plano e Fase 2 `3932ec90` · T1 `2460585f` · T2 `3ba4fd58` · Fase 5 `6caa31a5` · fechamento (este e o seguinte).

## Verificação (medida, serial)

Sobre `6caa31a5` (código final; o `test:api` começou sobre `3ba4fd58` e o cenário da Fase 5 entrou antes de o runner chegar aos "r" — o
arquivo novo rodou com 16/16 no log):

- `npm run test:api` — **621/621 arquivos OK** (`relatorioSaldoPorLoteSituacao` 16/16).
- `npm run test:almoxarifado` — **44 passou, 0 falhou**.
- `npm run test:validation` — **4/4**; `npm run test:safealter` — **3/3**; `npm run test:sqlite` — **16/16**.
- Cliente: `CI=true npx react-scripts test --watchAll=false --maxWorkers=2` — **225/225 suítes, 3060/3060 testes**; `CI=true npx react-scripts
  build` — **Compiled successfully**.

## Retro (4 números)

- **Rodadas até verde:** 1 por task; a varredura do registro caiu nos vizinhos antes do commit (B1503) e foi resolvida na mesma rodada.
- **Achados reais:** Fase 2: 3 importantes + 3 menores (aceitos; 1 cosmético declarado). Fase 5: 0 de regra; 4 lacunas de teste (fechadas);
  3 ruídos.
- **Paralelismo:** sem galhos de verdade (T2 é uma linha de tela, feita na sequência); a Fase 2 rodou junto com a escrita do teste; os 2
  revisores da Fase 5 junto com o `test:api` (o de testes numa cópia fora da árvore, com junction).
- **Defeito que escapou da 226:** nenhum achado.

## Fechamento

- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1498–B1503, C533, D (227), F (227), seção, topo e
  "onde estamos"; D (225), D (226) e D (223) e o C481 apontando para a 227), spec 21 (topo e seção 227), spec 05 (última atualização e bloco
  227), spec 10 (os "Fora"), mapa (linhas 05, 10 e 21 e última atualização), guia (seção e cabeçalho), manual (21d e 10.6) e a estimativa.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 227 fecha os dois vizinhos visíveis do lote impedido (D (225), D (223)) e a C481 inteira; o mapa
continua com a 10 e a 21 como estavam. Dos abertos do mesmo assunto, o de maior valor é o que deixa uma requisição presa sem nada que saia —
**C521**, um conserto pequeno no motor. **Sem estimativa** — começa pela Fase 0.5.)*

**Estornar a entrada boa não deixa a reserva coberta só por lote impedido (C521).**

- **O problema (C521, Etapa 219):** nota com 3 num lote bom (reservadas para R1) e 4 num lote bloqueado. Estornar a entrada boa **não** solta a
  reserva de R1: o `disponivel` do material (4, todo no lote bloqueado) cobre o estorno de 3. R1 fica *Parcialmente/Totalmente Reservada* com
  nada que saia, e a entrega recusa (Etapa 206).
- **Onde:** `reservaChegadaService.liberarParaEstorno` (`server/services/almoxarifado/reservaChegadaService.js:757`): `disp` vem de
  `SELECT ${disponivelSql()} …` (`:763`) e `if (disp >= qtd - EPS) return liberadasOs;` (`:765`) — sem descontar `loteImpedidoSql('m')`
  (`loteImpedido.js`). Chamada pelo estorno em `stockService.cancelarMovimentacao` (`stockService.js:3064`), **fora** da trava do material
  (soltar sem distribuir não pega — B441; ler o disponível e soltar é o mesmo caso do C525).
- **O que fazer:** a conta "o que sobra para cobrir as reservas depois do estorno" usar o que **pode sair** — `disponivel − lote_impedido` —,
  cuidando do lote **da própria entrada estornada**: se ele estiver impedido, as peças dele já estão no `lote_impedido` e saem com o estorno
  (descontar duas vezes soltaria reserva de mais). Medir com cenários: entrada boa estornada com o resto em lote bloqueado (solta); entrada
  boa estornada com o resto em lote bom (não solta, como hoje); entrada do lote bloqueado estornada (a régua de hoje).
- **Pontos de atenção:** a reserva da OS (`liberarReservaDaOsParaEstorno`, sempre `min(reserva, estornado)`) não muda; o "hoje" de Brasília
  da régua; a recusa do estorno pelo disponível (o motor) não muda — só o que se solta antes; `recriarAposEstornoRecusado` recria o que foi
  solto se o estorno falhar. Testes de molde: `chegadaLoteImpedido.api.test.js` (219) e `estorno*` da 74/171.
- Outros abertos: C519 (a inspeção não olha o lote do item que liberou, pequeno), C524–C527, C529–C533, C514–C518, C486, C491, C495, C497,
  C498.
