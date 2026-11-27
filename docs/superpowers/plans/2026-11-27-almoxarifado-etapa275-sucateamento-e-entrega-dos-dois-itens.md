# Etapa 275 — O sucateamento da reprovação depois do "Sem lote" (C559) e a entrega dos dois itens do mesmo lote (C560)

> Fora da estimativa de 23/11. Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_sucateamento-depois-da-liberacao-e-entrega-do-lote.md` (45 min + 30 min), commit `163d7fbc`.
> Features: `specs/modulo-almoxarifado/10-lotes-series-etiquetas` / `06-inspecao-qualidade` (o sucateamento) e `05-separacao-entrega` (a entrega).
> Etapa anterior: 274.

## Fase 0 — medido antes de prometer (sondas executadas sobre `73de3d13`)

**A — C559. REPRODUZIDO.** Cópia do harness da 274 (`ncDevolucaoDepoisDoSemLote`), NC automática decidida SUCATEAR,
`solicitarDoReprovado` → `aprovar` gestão → `aprovar` almoxarifado:
1. L1 4 + 1, L2 4; reprovação de 2 no L1 liberada pelo "Sem lote"; 4 bloqueadas no L2 → **APROVADO**: L1 3 (2 peças **livres** sucateadas),
   bloqueado 4 → 2 com as 4 do L2 ainda bloqueadas pelo livro. O mesmo furo da 274 (B1655), na outra saída do reprovado.
2. Com a entrada de 4 do L1 estornada: a solicitação já recusa (`SEM_SALDO_LOTE`, "o reprovado já saiu do lote").
3. Reprovação presa (não liberada) + L2: APROVADO, L1 3, bloqueado 4 (o do L2) — certo.
4. Liberada, sem bloqueio em lote: a solicitação recusa ("já havia saído do bloqueio — há 0 UN") — certo.

A precedência da solicitação (`sucateamentoDoReprovadoPrevisto`, a mesma que o `/executar` consulta) só confere o **total** bloqueado (nível 15).

**B — C560. REPRODUZIDO (pior que o deduzido).** O cenário da RN-274.04 (item 1 com 3 separadas de (A01, L1), item 2 de 1 sem origem, B01 com a
última peça do L1 bloqueada), entregando **os dois juntos** → **400** com a frase crua do motor *"E274-24: Localização Z274B-01 está
bloqueada"* — **e o item 1 já tinha saído**: SAIDA de 3 de A01 no livro, `quantidade_entregue` 3, físico 4 → 1. Uma recusa que move estoque.
Causa: a conferência (`conferirAutomaticoPeloLote`) acha a falta (cabe 0 para o automático de 1), mas a E2 da 273 (`outrasCaixasNoMaterial`)
não conta a guarda do item 1 — ele entrega a guarda inteira (`guardaQueConta` 0) — e a conferência deixa seguir; o automático do item 2 escolhe
B01 e o motor recusa no meio do laço, depois da baixa do item 1.

## Regras de negócio

- **RN-275.01** — A segunda assinatura do sucateamento ligado a NC (`baixarReprovadoNaTrava`) é recusada **antes do motor** quando o bloqueado
  **sem lote** do material não cobre a reprovação e há bloqueado em lote: **400** com a literal S1; a assinatura recém-feita é desfeita
  (`compensarAssinatura`, volta a SOLICITADO, a outra perna fica), o carimbo `sucateamento_em` da inspeção volta a NULL, nada no livro.
- **RN-275.02** — A conferência roda **dentro** da trava do material, **depois** do claim da inspeção (a lição da Fase 5 da 274: a segunda
  NC/sucateamento da mesma inspeção já sucateada recebe o 409 de sempre, não a recusa nova).
- **RN-275.03** — A solicitação (`solicitarDoReprovado`) faz a mesma conferência depois da precedência: **400** S2, nenhuma solicitação gravada
  (a frase aparece antes de alguém assinar). A garantia é a da RN-275.01 (o bloqueio em lote pode nascer entre a solicitação e a assinatura).
- **RN-275.04** — Sem bloqueio em lote, ou com a reprovação ainda presa (sem lote ≥ reprovação), nada muda (cenários 3 e 4 da Fase 0).
- **RN-275.05** — Fluxo: recusa → Bloquear 2 *sem lote* → assinar → APROVADO, L1 3, bloqueado 4 (o do L2).
- **RN-275.06** — Entrega conjunta: quando a conferência da parte automática acha falta num lote do material com linha que o automático pula
  (prateleira bloqueada ou sem endereço) e guarda **de um item desta entrega**, a E2 recusa **antes de qualquer baixa** — a guarda da própria
  requisição que sai nesta entrega conta pela parte (ela é consumida pelo dono, não sobra para o irmão). Cenário B → 400 E2 com
  *"entregue 1 un a menos"*, nada baixado; entregar só o item 1 → 200 (como antes).
- **RN-275.07** — O teto do detalhe e da Fila (o gatilho da 274) não muda: o item entregando sozinho continua com a guarda própria saindo inteira.
- **RN-275.08** — Sem a linha bloqueada (B01 livre), os dois juntos entregam (1 sai de B01).

## Contratos (congelados)

`POST /api/almoxarifado/sucateamentos/:id/aprovar-almoxarifado|aprovar-gestao` (a que fecha) — **S1** (400, nova):
`Não é possível sucatear pela não conformidade: só ⟨s⟩ ⟨un⟩ do bloqueado está sem lote e a reprovação tem ⟨q⟩ ⟨un⟩ — parte dela pode já ter sido
liberada pelo Desbloquear (o resto do bloqueado está em lote: ⟨L2: 4⟩). Bloqueie de novo, sem lote, o que falta e assine outra vez, ou rejeite o
sucateamento`

`POST /api/almoxarifado/nao-conformidades/:id/solicitar-sucateamento` — **S2** (400, nova): o mesmo começo, fim
`Bloqueie de novo, sem lote, o que falta e solicite outra vez, ou cancele a não conformidade`.

`PUT /api/almoxarifado/requisicoes/:id/entregar` — nenhuma frase nova: a E2 da 273 (`fraseEntregaGuardaDeOutra`) passa a valer no caso B, com o
número da própria requisição na lista de caixas.

## Tasks

- [x] **T1 (A)** — conferência em `scrapDisposalService` (`recusaDoSemLote`, as duas portas). Teste `sucateamentoDepoisDoSemLote.api.test.js` (9; 7 vermelhos sobre HEAD) — `1edd8acb`. Sabotagens (âncora contada, cópia, md5 de volta): sem a conferência da assinatura → 4; sem a da solicitação → 2. Vizinhos de sucateamento e NC verdes (22 arquivos).
- [x] **T2 (B)** — `cabeDoAutomaticoPeloLote` sem a peça da prateleira bloqueada no lote sem guarda + `outrasCaixasNoMaterial` com a opção da conferência. Teste
  `entregaDosDoisItensDoLote.api.test.js` (5 + 1 da Fase 5; 2 vermelhos sobre HEAD) — `4dad97b7`. Sabotagens: sem o desconto → 2; sem a guarda própria → 2. 141 vizinhos verdes.
- [x] **T3** — Fase 5 — 1 achado reproduzido e consertado, `dcbc3908` (abaixo).
- [x] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8) — o commit de fechamento. Nenhuma coluna, tabela nem índice novo (primeiro boot igual).

## Pontos de atenção

- `sucateamentoDoReprovadoPrevisto` é pura (sem banco) e é a precedência do `/executar`; a conferência nova fica fora dela, nas duas portas do
  sucateamento. O `/executar` de SUCATEAR não move estoque (só aponta para a solicitação).
- A opção nova de `outrasCaixasNoMaterial` só vale na conferência (falta já medida); o gatilho do teto (274) chama sem ela.
- O sucateamento avulso (sem NC) não passa pela reprovação: fora.

## Fase 2 (revisor fresco, uma passada, 27/11) — 3 importantes, 5 menores

1. **[importante → aplicado `1edd8acb`]** A S1 mandava "bloqueie de novo" também quando o lote já não tem a reprovação (entrada estornada depois da
   solicitação): o fim vira *"O lote L1 tem só 1 UN, menos que a reprovação: rejeite o sucateamento"* (cenário próprio).
2. **[menor → aplicado]** O erro da S1 leva `causa`: a trilha da compensação dizia "a baixa SUCATA foi recusada pelo motor" (o teste confere a trilha).
3. **[menor → aplicado]** A S2 entra **depois** do nível 19 (justificativa): a ordem 1-19 do contrato de `solicitarDoReprovado` não muda.
4. Sem problema: o lugar da S1 (depois do claim, dentro do `try`; a perna que não fecha não confere).
5. **[menor → D (275) 2]** O sem lote é um pool por material: a reprovação sem lote de outra inspeção cobre a conta.
6. **[importante → medido, aplicado]** A linha **sem endereço**: o automático a drena e os dois juntos entregam 200 hoje. A opção nova só conta a
   guarda própria quando o lote tem saldo em prateleira **bloqueada** (cenário RN-275.08 sem endereço).
7. **[importante → D (275) 3, não medido]** A falta vinda de outro lote (inspeção antiga, B1640) com a guarda própria e prateleira bloqueada no L1
   passaria a recusar com a E2 citando o L1. Estreitado pelo item 8; o caso restante não foi medido.
8. **[menor → aplicado em parte]** Estreitar a guarda própria (item em `saiuSimulado`, lote com prateleira bloqueada).
9. **[menor → B1657]** A E2 cita a própria requisição em "na caixa de": mantido (é verdade — a caixa dela guarda as peças), registrado na B1657.

## Fase 5 (revisor fresco, adversarial, 27/11) — 1 consertado; A não refutado

1. **[média → consertado `dcbc3908`]** O desconto da prateleira bloqueada em `cabeDoAutomaticoPeloLote` se somava ao retido do lote (já fora de
   `l.saldo`): L0 impedido, L2 3 em A01 + 1 em B01 bloqueada e 1 bloqueada no L2 (bloqueio avulso) → o detalhe caía de 3 para 2 e a entrega de 3,
   que saía certa antes, recusava. Agora o lote sem guarda vale o **menor** entre o livre e o físico fora da bloqueada. Cenário novo (vermelho com a
   subtração).
- Não refutado: o sucateamento (leitura da conferência nas duas portas; a perna que não fecha, a reprovação decimal e a NC manual não sondadas).

## Divergências do plano

- **B (C560) mudou de natureza:** a Fase 0 achou que bastava a E2 contar a guarda própria (`outrasCaixasNoMaterial`). Medido no conserto: a
  conferência nem via a falta — `cabeDoAutomaticoPeloLote` contava a peça da prateleira bloqueada do lote cuja guarda sai inteira (o lote vira
  "sem guarda" e o saldo vai cheio). Foram duas mudanças; a primeira versão do desconto contava duas vezes no lote com guarda (um vizinho da 197
  caiu) e, na Fase 5, a peça retida (consertados).
- **O C560 estava errado no efeito:** dizia "o motor recusa ou a linha fica negativa"; medido, o motor recusava **depois** de baixar o primeiro item
  (estoque movido numa resposta 400), sem negativo.
- **O C559 (deduzido) estava certo**, reproduzido como escrito.
- **CLAUDE.md:** nenhuma linha ficou errada (nenhuma trava nova; o sucateamento do reprovado já rodava sob a trava do material desde a 218).

## Próxima tarefa detalhada

Escolhida pelas pendências C da feature 05 (o mesmo caminho da entrega, a de maior valor: linha negativa): **C558 — material SEM controle por
lote com saldo em lote (Entradas que indicaram o lote) ainda pode deixar "sem lote" negativo pela prateleira bloqueada** (~45 min, motor: medir
antes). Caminho: reproduzir pelas portas (material com *Controle por lote* desligado, Entradas com lote, a guarda de outra caixa e a última peça
em prateleira bloqueada, entrega no automático); se reproduzir, `conferirAutomaticoPeloLote` deixa de pular o material sem `controle_lote` quando
ele tem saldo em lote (`porMaterial.controleLote`), com a mesma E2; se não, provar com teste e corrigir o aviso. Pontos de atenção: a régua
`cabeDoAutomaticoPeloLote` desta etapa (o menor entre o livre e o físico fora da bloqueada, só no lote sem guarda); o teto do detalhe
(`tetoDaEntregaPeloLote`) também pula material sem `controle_lote`. Alternativas: **D (275) 1** (o detalhe do item sem guarda no lote só na
prateleira bloqueada) e **D (275) 3** (medir a falta de outro lote).

- **Item 24 da estimativa de 23/11 (série e etiqueta obrigatórios) ainda depende de resposta** — não comece sem ela.
- **O que já está pronto e não reabre:** o sucateamento depois do "Sem lote" e a entrega dos dois itens juntos, desta etapa.

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `dcbc3908`, **depois** do último conserto): **689/691 arquivos OK** —
  os 2 que falham são os já conhecidos de proposta, de outra máquina (`propostaBilingueTemplate`, `propostaPdfExigeLogin`).
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0** (sobre `dcbc3908`).
- Jest da tela e build: **não rodados** — o client não mudou nesta etapa.
- Nenhum clique no navegador (F (275)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (B: a primeira versão do desconto contava duas vezes no lote com guarda — um vizinho caiu; Fase 2 — o fim
  "rejeite" e a linha sem endereço; Fase 5 — a peça retida na prateleira bloqueada).
- Achados: Fase 2 — 3 importantes (2 aplicados, 1 declarado D (275) 3), 5 menores; Fase 5 — 1 reproduzido e consertado, A não refutado.
- Paralelismo: os dois revisores rodaram enquanto o código e a documentação eram escritos; o `test:api` rodou sozinho depois do conserto da Fase 5.
- Defeito que escapou: (preencher na etapa seguinte). Da 274: o C560 era pior que o deduzido (recusa depois de baixar).
