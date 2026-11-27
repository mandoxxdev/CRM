# Etapa 273 — Estorno da entrada de lote com reprovação liberada (C556) e a guarda de outra caixa na entrega (C485)

> Fora da estimativa de 23/11 (os itens 23 e 24 dela dependem de resposta). Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_estorno-entrada-lote-e-guarda-de-outra-caixa.md` (30 min + 45 min), commit `858e1911`.
> Features: `specs/modulo-almoxarifado/02-movimentacoes` (estorno) e `05-separacao-entrega` / `04-requisicoes` (entrega). Etapa anterior: 272.

## Fase 0 — medido antes de prometer (sondas executadas sobre `a4850e27`)

**A — C556. Reproduzido.** L1 com duas entradas (4 + 1), L2 4; reprovação de 2 na inspeção do L1, já liberada pelo "Sem lote" (bloqueado 0,
documento sem carimbo — C501); **Bloquear 4 do L2**; estornar a entrada de 4 do L1 → **400** *"Não é possível estornar: o lote L1 tem 2 UN presas
nele (2 reprovadas na inspeção) e, sem esta entrada, ficaria com 1 UN — … Libere 1 UN do lote L1 (a reprovação pela não conformidade) e depois
estorne esta entrada."* Sem o bloqueio do L2 → **200**. A causa é a mesma da Fase 5 da 272: `stockService.recusaDoEstornoDeEntradaDoLoteBloqueado`
limita a reprovação por `total − bloqueado DESTE lote`; o bloqueio do L2 entra no total e devolve a reprovação liberada. A frase manda para a
não conformidade, que não destrava nada (a reprovação já foi liberada).

**B — C485, a metade da outra caixa. Não reproduzido em 7 sondas** (cópia do harness da 206): (1) R1 guarda o L1 inteiro em (A01, L1) → R2 nem
separa (*"não é possível separar 2 un. Máximo: 0"*), com e sem saldo negativo permitido; (2) R2 separada antes sem origem, R1 guarda depois, uma
Transferência de 2 do L1 para outro endereço → a entrega de R2 sai do que não está guardado, nenhuma linha negativa; (3) R2 separou 1 de 2, R1 guarda
3 do L1 4, a entrega de R2 pede 2 (com e sem automático; com e sem saldo negativo permitido) → **400** *"… não é possível entregar 2 un. Máximo: 1
(pendente: 2, disponível: 4)"*, antes de baixar. A conta: o disponível do material já desconta a caixa inteira de cada requisição (a parte guardada
inclusive), e o automático só pula a parte guardada das **outras** caixas — o que o automático pode tirar dos lotes que podem sair é sempre ≥ o
que a conferência do disponível deixa passar. O aviso C485 (Etapa 206) dizia *"(… todo na parte guardada da caixa de outra requisição) a entrega
não recusa … sai sem lote … a linha fica negativa"* e **nunca foi medido** nessa metade (a reprodução da 206, RN-206.15 c, era da inspeção).
Caminho (o reversível do plano da 272): provar por cenário com as portas de hoje e corrigir o aviso dizendo que estava errado; se uma sonda da
Fase 5 reproduzir, recusar antes da baixa.

## Regras de negócio

- **RN-273.01** — No estorno da entrada de um lote, a reprovação da inspeção do lote só conta como presa no que o bloqueado do material ainda
  cobre **além do bloqueado de todos os lotes** (`total − max(bloqueado deste lote, Σ por lote do bloqueado com lote)`). Cenário: o de cima →
  **200**; o L1 fica 1, o bloqueado do material fica 4 (o do L2).
- **RN-273.02** — A reprovação **não** liberada continua presa: o mesmo cenário sem o "Sem lote" (bloqueado 2 + 4 = 6) → **400** com a literal
  geral de hoje (*"… tem 2 UN presas nele (2 reprovadas na inspeção) e, sem esta entrada, ficaria com 1 UN — … Libere 1 UN do lote L1 (a
  reprovação pela não conformidade) e depois estorne esta entrada."*), nada gravado.
- **RN-273.03** — O bloqueio do próprio lote continua com a literal "só o bloqueio" da 264, e o bloqueio de outro lote sozinho não prende o lote
  do estorno: L1 4 + 1, L2 4, bloquear 4 do L2 (sem reprovação) → o estorno da entrada de 4 do L1 passa.
- **RN-273.04** — Mesma régua do Σ por lote da 272 (o BLOQUEIO conta enquanto o estorno dele não concluiu; o DESBLOQUEIO só com `cancelado = 0`;
  `MAX(0, …)` por lote). Uma régua só, em uma função, usada pelos dois estornos.
- **RN-273.05** — A conferência continua dentro da seção do estorno (`naTravaDoMaterial`, Etapa 118), antes do débito; a recusa volta o claim.
  Pelo serviço (`cancelarMovimentacao`) e pela rota `POST /movimentacoes/:id/cancelar`.
- **RN-273.06** — Entrega (C485, outra caixa): a entrega de uma requisição cujo lote bom está na parte guardada da caixa de **outra** nunca
  deixa linha negativa: ou sai do que não está guardado, ou é recusada antes de baixar com a literal da conferência do disponível. Cenários: as 3
  sondas da Fase 0 viram teste (rota `PUT /requisicoes/:id/entregar`), mais o caminho pelo serviço (`entregarRequisicao`) e um fluxo
  separar → transferir → entregar → conferir linhas e físico.
- **RN-273.07** — *(revista pela Fase 2, achado 5 — reproduzido)* Sem lote impedido, quando a parte automática passa do que os lotes que
  podem sair cobrem e algum lote do material tem parte guardada que o automático pula, a entrega é recusada antes de qualquer baixa com a **E2**
  (o resto do lote em prateleira bloqueada ou numa linha sem endereço; com um lote impedido sem saldo livre também). *(Antes dizia "só se a
  Fase 5 reproduzir, com a frase do disponível".)*
- **RN-273.08** — O que cabe passa: com a prateleira livre, a entrega sai dela (L1); o fluxo recusa → desbloquear → entregar → a dona da caixa
  entrega a dela.
- **RN-273.09** — A guarda de um item da **própria** requisição que fica depois da entrega conta (o número dela na frase); a que sai inteira
  nesta entrega não conta (`guardaQueConta`): com a falta vinda só do registro antigo de inspeção, como antes (B1640).

## Contratos (congelados)

`POST /api/almoxarifado/movimentacoes/:id/cancelar` — nenhum campo novo, **nenhuma literal nova** (só deixa de recusar quando a reprovação já foi
liberada e outro lote tem bloqueio; a literal geral da 264 fica igual).

`PUT /api/almoxarifado/requisicoes/:id/entregar` (e `entregarRequisicao`) — nenhum campo novo. **E2** (400, Fase 2 achado 5): `⟨material⟩: não é possível
entregar ⟨n⟩ ⟨un⟩ — faltam ⟨f⟩ ⟨un⟩ em lote que pode sair. O resto do lote|dos lotes ⟨L1, L2⟩ está separado na caixa de|nas caixas de ⟨REQ-1, REQ-2⟩ ou em
prateleira bloqueada ou sem endereço. Desbloqueie a prateleira ou transfira as peças para uma prateleira livre, ou entregue ⟨f⟩ ⟨un⟩ a menos.|nada sai
deste material.` Literais de antes que o teste trava (lidas do código):
*"⟨material⟩: não é possível separar ⟨n⟩ un. Máximo: ⟨m⟩ (pendente: ⟨p⟩, disponível: ⟨d⟩)"* e *"⟨material⟩: não é possível entregar ⟨n⟩ un.
Máximo: ⟨m⟩ (pendente: ⟨p⟩, disponível: ⟨d⟩)"*.

## Fase 2 (revisor fresco, uma passada, 27/11) — 3 importantes (aplicados), 4 menores

1. **[importante → aplicado `908bccae`]** O nome `bloqueadoComLoteSql` já existe em `bloqueioPorLote.js` com outra régua (soma **líquida**, sem o
   MAX(0) por lote) e alimenta as guardas do "Sem lote". A função nova chama-se `bloqueadoPorLotePositivoSql`; a antiga não foi tocada.
2. **[menor → decisão B1653]** A régua "que mais bloqueia" no Σ deixa o teto menor se o processo morrer no meio do estorno de um bloqueio de outro
   lote (só com o processo morrendo; tudo roda sob a trava). Mantida (a mesma do 272); a "que menos bloqueia" recusaria estornos certos.
3. **[menor → D (273) 1]** Com outra reprovação de pé em outro lote, a liberada pelo "Sem lote" ainda conta (o total não diz de quem é a peça).
4. **[importante → C557, deduzido]** Depois do estorno que agora passa, a NC *Devolver* da reprovação liberada pelo "Sem lote" pode tentar tirar do
   L1 peças que ele não tem. O mesmo estado já era alcançável antes (estornar a entrada antes de bloquear o L2). Registrado, não reproduzido.
   O fluxo do teste também mostrou que o **Bloquear indicando o lote** recusa a peça que sobrou (reprovação crua, Etapa 249) — B1651.
5. **[importante → reproduzido, virou tronco]** O C485 **reproduz** por outro caminho: o automático pula as linhas do lote com guarda em
   prateleira **bloqueada** ou **sem endereço**; o que elas têm vai para o resto sem lote (L1 3 em A01 guardadas pela R1 + 1 em B01 bloqueada;
   entrega de 1 da R2 → 200, saldo sem lote −1). A Fase 0 dizia "automático ≥ conferência" — **estava errado** nesses dois casos. T2 deixou de
   ser só teste: RN-273.07 aplicada (E2).
6. **[menor → texto]** As literais citadas têm sufixos (E190 com saldo negativo permitido; a inspeção da 269); o teste confere o prefixo onde cabe.
7. **[menor]** As sabotagens de T1 e T2 rodaram uma depois da outra (mesma árvore).

## Tasks

- [x] **T1 (tronco, motor)** — A: `bloqueadoPorLotePositivoSql` (a régua do Σ por lote; nome novo pela Fase 2) extraída e usada por `presoNoLoteParaEstorno` (272) e por
  `recusaDoEstornoDeEntradaDoLoteBloqueado` (264). Teste `estornoEntradaLoteReprovacaoLiberada.api.test.js` (rota + serviço). Sabotagem. — `908bccae`.
  9 cenários (4 vermelhos antes). Sabotagens (âncora contada, cópia, md5 de volta): teto só deste lote → 4; reprovação zerada → 3. Vizinhos:
  `estornoDesbloqueioComLote` 15/15, `saidaEEstornoComLoteBloqueado` 27/27, `bloqueioSabeOLote` 25/25.
- [x] **T2 (virou tronco pela Fase 2, achado 5)** — B: a E2 em `conferirAutomaticoPeloLote` (`outrasCaixasNoMaterial`,
  `fraseEntregaGuardaDeOutra`); teste `entregaGuardaDeOutraCaixa.api.test.js` (13 cenários, rota + serviço + fluxo; 6 vermelhos antes) — `6b7ab65e`.
  Sabotagens: sem o ramo sem impedido → 6; sem o ramo impedido vazio → 1; a própria fora → 1; a própria pela parte crua → 1. 7 vizinhos de
  entrega com lote verdes (127 cenários).
- [x] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido; sondas de B: devolução, estorno da separação, exclusão, cancelamento
  de outra requisição) — `b0876c15` (abaixo).
- [x] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8) — o commit de fechamento. Nenhuma coluna, tabela nem índice novo (primeiro boot igual).

## Pontos de atenção

- `com_lote` lê o livro inteiro (sem o `desde` da 262) — como na 272.
- A reprovação continua limitada pelo total; a régua só fica mais baixa (nunca recusa algo que passava).
- B não muda código; se a Fase 5 achar caminho, T2 vira tronco.
- B não muda o detalhe nem a Fila: o entregável delas só desconta o lote impedido (D (273) 2, achado 1 da Fase 5).

## Fase 5 (revisor fresco, adversarial, 27/11) — 1 consertado, 1 declarado, 1 aviso novo; A não refutado

Sondas executadas numa cópia de `6b7ab65e` (`git archive`).

1. **[média → declarado D (273) 2]** O detalhe (`quantidade_entregavel`) e a Fila mostram 1 no caso da prateleira bloqueada e a porta recusa
   com a E2 (`tetoDaEntregaPeloLote` só calcula com lote impedido). Nasce com B (antes a porta aceitava, negativa). É a próxima tarefa.
2. **[baixa/média → consertado `b0876c15`]** A E2 recusava quando havia guarda em qualquer lote, mesmo sem prateleira bloqueada nem linha sem
   endereço (falta vinda da inspeção antiga do L2): causa errada e B1640 mudada em silêncio. Agora só o lote com guarda **e** saldo numa linha que
   o automático pula. Cenário novo (vermelho antes).
3. **[média, anterior → C558]** Material **sem** controle de lote com saldo em lote (Entradas que indicaram o lote) sai "sem lote" negativo pelo
   mesmo caminho: a conferência por lote pula o material sem controle de lote.
- Não refutado: permite negativo (a separação já recusa); R2 com lote escolhido sem endereço (400 da 267); A (procurou baixa de bloqueado sem
  DESBLOQUEIO que inflasse o Σ por lote — só a NC, presa ao carimbo).

## Divergências do plano

- A Fase 0 dizia que o C485 da outra caixa não reproduzia e que T2 seria só prova: a Fase 2 achou o caminho (prateleira bloqueada / sem
  endereço) e T2 virou tronco com a E2 (RN-273.07 revista, RN-273.08/.09 novas). O C485 estava errado num ponto: a parte guardada **sozinha**
  não deixava o negativo nascer.
- O fluxo de A mostrou que o Bloquear indicando o lote continua recusando a peça que sobrou (B1651, recusa segura do C516).
- **CLAUDE.md:** nenhuma linha ficou errada — o estorno continua numa seção só (a conta mudou dentro dela); a entrega continua sob as duas
  travas (a E2 só lê, antes de qualquer baixa).

## Próxima tarefa detalhada

Escolhida pelo mapa (feature 05 🟡 — o que falta para 🟢) e pela D (273) 2: **o entregável do detalhe e da Fila no caso da E2** (~45 min, sem
motor: só leitura). Hoje `tetoDaEntregaPeloLote` (requisitionService, Etapa 206 Fase 5, B1395) só devolve teto quando o material tem saldo em lote
impedido; fora disso devolve null e o detalhe/Fila mostram o número de antes. Caminho: o mesmo gatilho da E2 — quando `outrasCaixasNoMaterial`
acha lote com guarda e linha bloqueada ou sem endereço, calcular o teto pelo `cabeDoAutomaticoPeloLote` (a mesma régua da porta). Contrato: nenhum
campo novo (`quantidade_entregavel`, `saldo_entregavel` mudam de valor). Pontos de atenção: a guarda da própria requisição pelo que fica
(`guardaQueConta` com o item entregando sozinho, como o B1395 faz); a Fila e o detalhe leem fora das travas (só leitura). Fatia visível: o número
certo na tela. Precisa de estimativa própria antes (skill `estimativa-de-tarefas`). Alternativas: **C558** (material sem controle de lote com
saldo em lote, ~45 min, medir); **C557** (a NC depois do "Sem lote" — reproduzir primeiro).

- **Item 24 da estimativa de 23/11 (série e etiqueta obrigatórios) ainda depende de resposta** — não comece sem ela. O item 23 também.
- **O que já está pronto e não reabre:** o teto da reprovação no estorno da entrada (C556) e a E2 da entrega (C485), desta etapa.

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `b0876c15`, **depois** do último conserto): **685/687 arquivos OK** —
  os 2 que falham são os já conhecidos de proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1).
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0** (sobre `6b7ab65e`;
  o conserto da Fase 5 só mexe na entrega, coberta pelo `test:api` acima).
- Jest da tela e build: **não rodados** — o client não mudou nesta etapa.
- Nenhum clique no navegador (F (273)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2 — o caminho do C485 e o nome da régua; Fase 5 — a E2 só no lote com linha que o automático pula).
- Achados: Fase 2 — 3 importantes (1 reproduzido e consertado, 1 de nome aplicado, 1 deduzido → C557), 4 menores; Fase 5 — 1 consertado, 1
  declarado, 1 aviso anterior (C558), A não refutado.
- Paralelismo: os revisores das Fases 2 e 5 rodaram enquanto o código e a documentação eram escritos; nenhum retrabalho além dos achados.
- Defeito que escapou: (preencher na etapa seguinte). Da 272: o C556 (anotado lá, resolvido aqui).
