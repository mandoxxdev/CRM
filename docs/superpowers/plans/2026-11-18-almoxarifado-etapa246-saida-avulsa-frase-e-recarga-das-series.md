# Etapa 246 — Saída avulsa com série: a frase do lote e a lista depois da recusa (plano)

> Itens 9 e 10 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 45 min cada,
> **não revisados**: a medição confirmou os dois defeitos e o tamanho). Ponto de partida: a "Próxima tarefa detalhada" do plano da 245 e os
> planos das Etapas 233/234. Módulo Almoxarifado, tela **Movimentações → Nova Movimentação → Saída/Perda** (o item 9 vale também para a
> janela **Devolver** de Materiais de Clientes, que usa a mesma régua).

## Fase 0 — o que a medição achou (sobre `dfc08907`)

- **Item 9 (C539, B1531/B1533):** a frase *"As séries marcadas saem do lote L1."* é montada por `utils/loteDasSeries.js`
  (`fraseDoLoteDasSeries`) só com o `lote_id`/`lote_codigo` de cada série. O servidor (`stockService.js` ~`:1408-1433`, Etapa 234, Fase 5)
  só usa o lote das séries quando **as linhas positivas do lote cobrem a quantidade** (`SUM(quantidade) … quantidade > 0` ≥ quantidade);
  senão a saída sai do "sem lote". A lista de séries (`GET /materiais/:id/series`, `listarSeriesDoMaterial`) **não traz o saldo do lote**, e a
  lista de lotes da tela (`/lotes?com_saldo=1`) traz `saldo` = soma de **todas** as linhas (inclui a negativa de legado) e esconde lote com
  `saldo` ≤ 0 — não é a régua do motor. Caso real: a **Regularizar séries** (Lotes e Séries) dá lote à série com a peça no "sem lote"
  (o teste `[RN-234.04] … regularizada` do servidor monta exatamente isso): a tela diz L1, o servidor grava sem lote. **Defeito confirmado.**
- **Item 10 (C538):** no `catch` do `handleSubmit` de `MovimentacoesAlmoxarifado.js`, só o **Ajuste** recarrega a lista de séries
  (`setRecargaSeriesAjuste`, Etapa 62). Na Saída/Perda, uma recusa (lote bloqueado no meio, série levada por outra pessoa) deixa a lista velha:
  a série continua marcada e salvar de novo é recusado de novo. A entrega já recarrega (C537, Etapa 232). **Defeito confirmado.**
- A devolução ao cliente (`/materiais-cliente/.../devolver`) passa pelo mesmo motor com `lotePelasSeries` (`extended.js:996`) — a mesma régua
  de cobertura; a frase dela usa a mesma função. Corrigir a função corrige as duas telas.

## Decisões (letra B)

1. **O saldo do lote da série vem do servidor**, na lista de séries: campo novo, aditivo, `lote_saldo_positivo` (a soma das linhas
   **positivas** do lote da série, do material da série — a régua do motor; `null` sem lote). A tela compara com o número de séries marcadas.
   Descartado: usar a lista de lotes da tela (`saldo` soma a linha negativa e o `com_saldo=1` esconde lote com soma ≤ 0 — divergiria do motor
   nos dois sentidos) e a tela recalcular a régua.
2. **Lote que não cobre → nenhuma frase** (como "todas sem lote"): a saída sai do "sem lote", como antes. Descartado: uma frase explicando
   ("saem sem lote: o lote L1 não tem a peça") — o operador não pode fazer nada com ela (C539: "O que fazer: nada").
3. **A frase de lotes diferentes não muda** (o servidor recusa a mistura sem olhar o saldo).
4. **Recusa da Saída/Perda com série recarrega só a lista de séries**, não a de lotes (recarregar os lotes refaz a sugestão FEFO e troca o
   lote escolhido). A série que ficou de lote impedido volta apagada e é desmarcada (o efeito da 233 que sincroniza `serie_ids`); a levada
   por outra pessoa some da lista. Descartado: recarregar também os lotes (limitação declarada na D (246)).

## Regras (RN)

- **RN-246.01** (servidor, leitura) — `GET /materiais/:id/series` traz `lote_saldo_positivo` em cada série: a soma das linhas **positivas** de
  saldo do lote da série (do material da série); `null` sem lote. Amarrado ao motor no mesmo teste: série regularizada com a peça no "sem
  lote" → `0` e a Saída com o lote em branco grava lote `NULL`; série normal do L2 (2 peças) → `2` e a Saída grava o L2; duas séries do L1
  com 1 peça na linha do lote → `1` e a Saída das duas grava `NULL`; linha negativa de legado no lote não entra na soma.
- **RN-246.02** (tela, item 9) — a frase *"As séries marcadas saem do lote L1."* só aparece quando o número de séries marcadas cabe no
  `lote_saldo_positivo` da série; senão, nenhuma frase. Metade positiva no mesmo teste: o lote que cobre mostra a frase. Vale para a Saída/Perda
  de Movimentações e para a janela Devolver de Materiais de Clientes. A frase da mistura não muda.
- **RN-246.03** (tela, item 10) — Saída/Perda de material com série recusada pelo servidor → a lista de séries é lida de novo; a série cujo
  lote foi bloqueado volta apagada e desmarcada (contador "0 de 1"), e a mensagem do servidor aparece. Metade positiva: a Saída aceita não
  relê a lista (o formulário fecha). Ajuste continua relendo (Etapa 62).

## Contrato (congelado)

- `GET /api/almoxarifado/materiais/:id/series[?status=…]` — campo novo `lote_saldo_positivo` (número ou `null`). Nenhum outro campo muda.
- `POST /api/almoxarifado/movimentacoes/v2` — sem mudança.
- Fixtures: nenhuma fixture JSON de contrato espelha a lista de séries (os testes de tela usam objetos inline); os objetos inline das séries
  nos testes que conferem a frase (`MovimentacoesSaidaLoteDasSeries`, `MateriaisClienteDevolucao*`) ganham o campo, no formato do servidor.

## Fase 2 — pulada, com motivo

Sem motor, sem trava, sem saldo gravado: um campo de leitura numa listagem e duas mudanças de tela. T1 → T2 → T3 sequenciais e pequenas.
Fase 5 com um revisor fresco, com sonda.

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor)** — `4bf9fe15`. Teste primeiro: 4 vermelhos de 4 (campo ausente). Controle positivo: sem o `> 0` → o cenário
  da linha negativa; `0` no lugar de `null` → o cenário da série sem lote. Restauro por cópia, md5 de volta. Os testes que leem `/series`
  (servidor) rodados antes do commit: verdes.
- [x] **T2 (galho, tela)** — `522ded97`. Teste primeiro: 4 vermelhos (3 em Movimentações, 1 na devolução ao cliente); a mistura passa de
  primeira (comportamento mantido, de propósito). Os objetos de série dos testes da tela que conferem a frase ganharam `lote_saldo_positivo`.
  Controle positivo: frase sem conferir o saldo (3 vermelhos); só `saldo > 0` sem contar as marcadas (1 vermelho).
- [x] **T3 (galho, tela)** — `fcc7b076`. Teste primeiro: 2 vermelhos (Saída com lote bloqueado, Perda com série levada); a metade positiva
  passa de primeira. Controle positivo: só o Ajuste relê (2 vermelhos); relê também no sucesso (1 vermelho, a metade positiva).
- [x] **T4** — Fase 5 (`509d6902`), suítes, fechamento.

**Divergência:** nenhuma de escopo; a estimativa não foi revisada (a medição confirmou os dois defeitos). O item 9 precisou de um campo de
leitura no servidor (previsto no plano como "se faltar campo") e corrigiu também a janela Devolver de Materiais de Clientes (a mesma função).
**Execução:** as correções da Fase 5 (só `client/`) foram feitas enquanto o `test:api` (só `server/`) rodava — o servidor não carrega
nada de `client/`, então não há contaminação; nenhuma sabotagem no servidor durante a suíte.

## Fase 5 (um revisor adversarial fresco, com sonda executada) — achados e o que foi feito

- **Achado 1 (real, médio-baixo, introduzido pela T3, reproduzido em Jest):** POST sem resposta (rede) e a releitura também falhando → o
  `.catch` da busca limpava a lista: *"Nenhuma série disponível em estoque."*, a marcação apagada, contador "0/1". **Corrigido**
  (`509d6902`): a releitura pedida pela recusa (chave material|tipo) que falha mantém a lista; fora disso, a regra de antes. Testes
  próprios: a releitura que falha; depois dela, trocar o tipo limpa; a releitura pendurada e o tipo trocado (a chave). Controle positivo:
  a falha limpa sempre (2 vermelhos); a chave sem material e tipo (1 vermelho — o terceiro teste existe por isso: os dois primeiros não a
  derrubavam, porque o `.finally` zera a chave).
- **Achado 2 (real, baixo, só aparência, reproduzido por sonda):** devolução ao cliente de material com controle de lote, lote escolhido,
  saldo negativo permitido, as séries do lote com o saldo do lote menor que as marcadas → o servidor grava o lote escolhido (201), a frase
  sumia. **Corrigido** (`509d6902`): `fraseDoLoteDasSeries(..., { conferirSaldo: false })` com o lote escolhido. Teste próprio em
  `MateriaisClienteDevolucaoLote`; controle positivo: conferindo o saldo → vermelho.
- **Lacuna declarada:** o filtro `es.material_id` do campo não tem teste que o derrube (sem caminho de tela que dê à série o lote de outro
  material) — D (246) 4.
- **Tentados e não quebraram:** lote em duas localizações, saldo negativo sem controle de lote, quantidade ≠ séries marcadas (a tela barra),
  Saída × Perda × SAIDA_PRODUCAO, origem estrita da devolução ao cliente, a recusa local da tela (não relê), troca de material durante a
  releitura, troca para Ajuste com o POST pendente.

## Verificação (medida, serial, sobre o código final `509d6902`)

- `npm run test:api`: **639/639 arquivos** (o servidor não mudou depois de `4bf9fe15`; a suíte rodou sobre `fcc7b076`, e a Fase 5 só tocou
  `client/`). O `permissoesNoServidor.api.test.js` [RN-06], que caiu uma vez na 245, **passou** nesta rodada — não caiu, então não foi
  investigado (a instrução era investigar só se caísse de novo); continua registrado como intermitente na F (245).
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela (sobre `509d6902`): **236 suítes, 3191 testes** (3180 da 245 + 11 novos); `CI=true react-scripts build`: *Compiled successfully*.

## Retro (4 números)

- Rodadas de correção até verde: 1 (Fase 5: dois achados, corrigidos com teste).
- Achados: Fase 2 pulada (sem motor, sem trava); Fase 5 — 2 reais reproduzidos (1 médio-baixo, 1 baixo), 1 lacuna de teste declarada, 0
  ruído.
- Paralelismo: T1 → T2 → T3 sequenciais (pequenas); a Fase 5 e o Jest rodaram junto com o `test:api`.
- Defeito que escapou: (preencher na etapa seguinte). Da 245: nenhum conhecido.

## Próxima tarefa detalhada

Item 11 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h15, motor/estorno):
**liberar lote que veio de mais de uma nota — a reserva da liberação repartida por nota** (**C524**, **B1467**). Módulo Almoxarifado.

- **O que é:** liberar um lote abastecido por duas notas reserva para quem esperava, mas a reserva vai **sem a marca da nota**
  (`reservaChegadaService.js` `reservarLoteLiberadoSobTrava`, ~`:756`: `recebimentoId` só quando `recs.length === 1`). Estornar uma
  das notas depois é recusado com *"Não é possível estornar: o material está reservado para requisições (REQ-…) — libere as reservas antes de
  estornar"* — o estorno só solta a reserva que tem a marca da própria nota (Etapa 74). O conserto: repartir a reserva da liberação por nota
  (quanto de cada nota está no livre do lote) e cada parte com a marca da sua nota.
- **Medir antes de prometer (Fase 0, sonda executada):** reproduzir pela rota (duas notas no mesmo lote bloqueado → liberar → estornar a
  segunda nota → 400?); ver como o estorno da nota conta "o que é da nota" (a conta da Etapa 74 e a da C525, que roda fora da trava — o item
  12 é ela) e se repartir pela quantidade recebida de cada nota fecha quando parte já saiu. Conferir a **C524**, a **B1467**, a **C525** e a
  conversão da reserva da OS por nota (Etapa 230, C520/B1514 — já reparte por nota, molde).
- **Contrato que consome:** as rotas de status do lote (`PUT /lotes/:id/status`, liberar vencimento, certificado — os três escritores que
  chamam `reservarLoteLiberadoSobTrava`), o estorno da nota (`POST /movimentacoes/:id/cancelar` da ENTRADA_COMPRA) e a resposta das três rotas
  (`resumoDaReservaDoLote`, B1465) — se a resposta mudar, regravar a fixture de contrato da tela que a espelhe.
- **Pontos de atenção:** é motor + trava + estorno — **Fase 2 e Fase 5 obrigatórias** (revisor fresco com sonda); a liberação roda sob a
  trava do material (`trava.travado`), não reentrante; a ordem requisição → material; teste de corrida com gancho disparado do contexto do
  teste (CLAUDE.md). O item 12 (estorno da nota sob a trava, C525 + C534) mexe na mesma conta — não misturar, mas não contradizer.
- **O que já está pronto e não reabre:** a frase do lote das séries e a lista relida (esta etapa); a conversão da reserva da OS por nota
  (Etapa 230).


O teste de integração que cruza as partes é o próprio RN-246.01 (a leitura amarrada à gravação do motor, pela rota).
