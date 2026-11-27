# Etapa 269 — Entrega com o lote ainda em inspeção (C485, B1386) e entrada num lote vencido avisa (C457, B1282, C460)

> Itens **18** e **21** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h15 + 1h; não
> refeita). O 18 é a "próxima tarefa detalhada" do plano da 268; o 21 foi puxado para cá por também tratar de lote (os 19/20 vão juntos na
> próxima).
> **Fatia visível:** a recusa da entrega passa a dizer *"… — 3 un em inspeção (lote L1) só saem depois de decidida a inspeção"*; a Entrada
> num lote vencido, sem digitar a validade, mostra o aviso amarelo *"O lote L entrou já vencido (validade DD/MM/AAAA). …"*.

## Fase 0 — medido (sonda `server/tests/api/zzsonda269.api.test.js`, apagada antes do commit, sobre `1b9e10d8`)

### Item 18 (C485, B1386) — **o C485 estava errado no caso da inspeção com dado do próprio sistema**

Material com lote, *L1* 4 em A, requisição de 4 separada no automático, depois 3 de *L1* em inspeção:

| Inspeção gravada como | Entrega de 4 hoje | Detalhe (entregável) |
|---|---|---|
| no item do recebimento **e** no material (`materiais.quantidade_em_inspecao`, o que o recebimento e o motor gravam — `QUARENTENA`) | **400** antes de baixar: *"⟨m⟩: não é possível entregar 4 un. Máximo: 1 (pendente: 4, disponível: 1)"* — **não diz que é inspeção** | 1 (o um clique entrega 1) |
| só no item do recebimento (o material sem a inspeção — dado antigo; é como o teste RN-206.15 c monta) | **200**: SAÍDA 1 de *L1* + SAÍDA 3 **sem lote**, a linha sem lote −3 (com ou sem *permite negativo*) | 4 |

- Com a inspeção gravada pelo próprio sistema, o disponível do material já desconta a inspeção, e a conferência da entrega (E1) recusa
  **antes** de baixar: o negativo do C485 **não nasce**. O que falta é a recusa **dizer** que a parte que falta está em inspeção.
- O negativo só nasce quando a inspeção do item do recebimento não está no material (o C485 foi reproduzido assim, no RN-206.15 c). Não
  achei porta do sistema que grave isso hoje (o `QUARENTENA` e as decisões mexem nos dois juntos; a v2 recusa os tipos de retenção) — é dado
  antigo. Ainda assim é a mesma conta do lote impedido da 206, e o conserto é barato.
- Separar com a inspeção já gravada: a separação recusa *"… Máximo: 1 …"* (fora do escopo; já correto).

### Item 21 (C457, B1282, C460) — confirmado

- Entrada (v2) num lote existente vencido **sem** `data_validade`: 201 sem `aviso_validade` (o aviso só responde à data digitada, B1282).
- Lote com `data_validade = ''` (cadastro antigo) com saldo; Entrada com `data_validade` → 400 *"O lote L já tem validade . A validade é do
  lote, não da entrada: …"* (C460). Sem a data: 201.
- A tela (`MovimentacoesAlmoxarifado.js`) já mostra qualquer `aviso_validade` da resposta como aviso amarelo que não fecha sozinho — o
  conserto é só no servidor.

## Decisões

- **B1639 (item 18)** — a recusa da conferência do disponível (E1) da entrega ganha um sufixo quando o material tem peça **em inspeção** e o
  disponível não cobre a quantidade: *" — ⟨q⟩ ⟨un⟩ em inspeção (lote ⟨L⟩) só saem depois de decidida a inspeção"*. Só quando o sufixo do
  disponível negativo (E190) não sai (ele já nomeia a inspeção). Byte a byte igual sem inspeção. **Descartado:** mudar o "Máximo" (já é o
  certo) e uma recusa nova antes do E1 (duas mensagens para o mesmo fato). **Reversível.**
- **B1640 (item 18)** — o dado antigo (inspeção só no item do recebimento): a conferência do automático por lote (Etapa 206) passa a contar a
  inspeção dos lotes que podem sair como a do lote impedido — recusa antes de baixar, nomeando o lote *"(em inspeção, N un)"*. Revisa a
  **B1386** só na parte da inspeção; a parte guardada de outra caixa (Etapa 197) **fica como está** (o C485 continua valendo para ela).
  **Descartado:** corrigir o dado antigo sozinho (mexer na retenção do material fora de uma decisão de inspeção). **Reversível.**
- **B1641 (item 21)** — a Entrada pela tela de **Movimentações** (rota v2 — opção do motor `avisaLoteVencido`, só no 4º argumento) num lote
  **existente e vencido**, sem a validade digitada, avisa com o texto que já existe (*"… entrou já vencido …"* ou, com o vencimento liberado,
  *"…; o vencimento já foi liberado para consumo."*). As entradas internas (devolução, estorno, nota) e a v1 ficam como estão — a razão da
  B1282. **Revisa a B1282.** **Descartado:** avisar em toda entrada do motor. **Reversível.**
- **B1642 (item 21)** — a validade em branco (`''`, cadastro antigo) é "sem validade" na Entrada: a data digitada **preenche** o lote (o aviso
  *"O lote L não tinha validade; ela foi gravada agora (…)"*), como no lote com a validade nula. A guarda do preencher passa a casar nulo ou
  em branco. O recebimento fica como está (já avisa o branco — B1301, `PREVIA_LEGADO`). **Descartado:** recusar com outra frase (o lote não
  tem validade: não há conflito). **Reversível.**

## Regras de negócio

### Item 18 — entrega com a parte que falta em inspeção

- **RN-269.01** Material com lote, *L1* 4, requisição de 4 separada no automático, 3 de *L1* em inspeção (gravada pelo sistema: item do
  recebimento + material). Entregar 4 → **400** antes de baixar, nada gravado: *"⟨m⟩: não é possível entregar 4 un. Máximo: 1 (pendente: 4,
  disponível: 1) — 3 un em inspeção (lote L1) só saem depois de decidida a inspeção"*. Entregar 1 → 200, SAÍDA 1 de *L1*, nenhuma linha
  negativa. O detalhe oferece 1. Pela rota e pelo serviço.
- **RN-269.02** Sem lote no item do recebimento (inspeção só no material): o sufixo sai sem o parêntese — *"… — 3 un em inspeção só saem
  depois de decidida a inspeção"*. Inspeção em dois lotes: *"(lotes L1 2, L2 1)"* (os lotes na ordem do código, a quantidade de cada).
- **RN-269.03** Sem inspeção, ou com o disponível cobrindo: a recusa é a de antes, byte a byte (o sufixo não aparece). Com o disponível
  negativo, o sufixo E190 (que já nomeia *"em inspeção"*) vence e o novo não sai.
- **RN-269.04** Dado antigo (3 em inspeção só no item do recebimento de *L1*): entregar 4 → **400** antes de baixar, nada gravado:
  *"⟨m⟩: não é possível entregar 4 un — faltam 3 un em lote que pode sair. Em lote ainda em inspeção: L1 (3 un). Espere a decisão da
  inspeção ou entregue 3 un a menos."* Com permite negativo, o mesmo (era o RN-206.15 c, que passa a esperar a recusa). Entregar 1 → 200,
  SAÍDA 1 de *L1*, nenhuma linha negativa.
- **RN-269.05** Misto: *L2* BLOQUEADO 5 e *L1* com inspeção antiga 3, falta 4 → *"… Em lote impedido: L2 (bloqueado, 5 un), L1 (em
  inspeção, 3 un). Libere o lote (mude o status, libere o vencimento ou decida a inspeção) ou entregue 4 un a menos."* Sem inspeção no lote
  que pode sair: a frase da 206 byte a byte.

### Item 21 — entrada num lote vencido

- **RN-269.10** Entrada pela v2 num lote existente com validade vencida (sem liberação), sem `data_validade` → 201 com `aviso_validade`
  *"O lote ⟨L⟩ entrou já vencido (validade ⟨DD/MM/AAAA⟩). A saída para consumo fica bloqueada até liberar o vencimento na tela de Lotes e
  Séries."*; com o vencimento liberado → *"O lote ⟨L⟩ entrou já vencido (validade ⟨DD/MM/AAAA⟩); o vencimento já foi liberado para
  consumo."*
- **RN-269.11** Sem aviso: lote não vencido (inclusive o que vence hoje), lote sem validade, lote novo, Entrada sem lote, e as entradas que
  não vêm da v2 (a v1 e as internas — devolução de requisição, pelo serviço do motor sem a opção). Com `data_validade` digitada, o aviso é o
  da Etapa 190 (um só, não dois).
- **RN-269.12** Lote com `data_validade = ''` e saldo; Entrada com `data_validade` futura → 201, a validade do lote passa a ser a digitada,
  `aviso_validade` *"O lote ⟨L⟩ não tinha validade; ela foi gravada agora (⟨DD/MM/AAAA⟩) e vale também para o saldo que já estava nele."*; a
  auditoria do lote registra `VALIDADE_PREENCHIDA` com o anterior `''`. Data passada → o aviso de preenchida + o de vencido (como no lote
  nulo). Nenhuma recusa com a data vazia.
- **RN-269.13 (tela, fronteira HTTP)** Entrada com lote e **sem** validade; a resposta traz `aviso_validade` → o aviso amarelo que não fecha
  sozinho, depois do *"Movimentação registrada!"*.

## Contratos (congelados)

- `PUT /api/almoxarifado/requisicoes/:id/entregar` — nenhum campo novo; as recusas acima (RN-269.01/02/04/05), status 400.
- `POST /api/almoxarifado/movimentacoes/v2` — nenhum campo novo; `aviso_validade` passa a vir nos casos de RN-269.10/12. A opção do motor
  `avisaLoteVencido: true` só no 4º argumento (nunca do corpo).
- `requisitionService.fraseEntregaLoteImpedido` — `impedidos[i].status === 'EM_INSPECAO'` vira o motivo *"em inspeção"*; frases acima.
- `requisitionService.sufixoInspecaoNaEntrega(nome, unidade, saldo, qty, lotes)` → `''` ou o sufixo (pura, exportada para o teste).
- `lotService.preencherValidadeSeVazia` — guarda `data_validade IS NULL OR TRIM(data_validade) = ''`.

## Tasks (sort topológico)

- [ ] **T1 (galho, servidor, item 18)** — `requisitionService.js` (E1 + `conferirAutomaticoPeloLote` + frase) e
  `server/tests/api/entregaLoteEmInspecao.api.test.js` (RN-269.01..05, rota e serviço); o RN-206.15 c passa a esperar a recusa.
  Controle positivo: sem o sufixo → RN-269.01 cai; sem a inspeção dos lotes que podem sair → RN-269.04 cai; frase sem o ramo misto →
  RN-269.05 cai.
- [ ] **T2 (galho, servidor, item 21)** — `stockService.js` + `lotService.js` + `extended.js` (opção) e
  `server/tests/api/entradaLoteVencidoAvisa.api.test.js` (RN-269.10..12). Controle positivo: sem a opção na rota → RN-269.10 cai; o branco
  como validade → RN-269.12 cai.
- [ ] **T3 (galho, tela)** — `client/src/components/almoxarifado/MovimentacoesValidadeLote.test.js` (RN-269.13, prova; a tela não muda).
- [ ] **T4** — Fase 5, documentos (`fechar-etapa`), suítes, estimativa.

T1 e T2 independentes (arquivos e regras diferentes; nenhum muda o motor que o outro lê).
