# Etapa 274 — O entregável do detalhe e da Fila no caso da guarda de outra caixa (D (273) 2) e a não conformidade depois da liberação pelo "Sem lote" (C557)

> Fora da estimativa de 23/11. Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_entregavel-do-detalhe-e-nao-conformidade.md` (45 min + 30 min), commit `5a55b57c`.
> Features: `specs/modulo-almoxarifado/05-separacao-entrega` (o entregável) e `10-lotes-series-etiquetas` / `06-inspecao-qualidade` (a NC).
> Etapa anterior: 273.

## Fase 0 — medido antes de prometer (sobre `6620f448`)

**A — D (273) 2. Medido no código.** `requisitionService.tetoDaEntregaPeloLote` devolve `null` sem `lote_impedido` e a Fila nem o chama sem ele
(`listarFilaSeparacao`, laço dos `tetosLote`). A E2 da 273 (`conferirAutomaticoPeloLote` → `outrasCaixasNoMaterial`) recusa justamente **sem**
lote impedido. Cenário da Fase 5 da 273: L1 3 em A01 guardadas pela R1 + 1 em B01 bloqueada; R2 de 1 separada sem origem → o detalhe e a Fila da
R2 mostram entregável 1 e a porta recusa com a E2.

**B — C557. Sonda executada (cópia do harness da 273, NC automática da inspeção, decisão DEVOLVER, `registrarExecucao`).** Três variantes:
1. *(o C557 como escrito)* L1 4 + 1, L2 4; reprovação de 2 no L1 liberada pelo "Sem lote"; bloquear 4 do L2; estornar a entrada de 4 do L1 (passa
   desde a 273); executar a NC → **400** do motor *"Saldo insuficiente no lote L1. Disponível: 1 UN"*, **nada se move** (claims desfeitos).
   O C557 dizia "pode tentar tirar do lote peças que ele não tem" — tenta, mas o motor recusa: **não há negativo**. A recusa é a frase crua do
   motor, que não diz que a reprovação já foi liberada.
2. *(variante nova, sem estorno — o furo real)* L1 4 + 1, L2 4; reprovação de 2 liberada pelo "Sem lote"; bloquear 4 do L2; executar a NC →
   **200** `BAIXADA`: 2 saem do L1 (peças que já estavam livres) e o bloqueado do material cai de 4 para 2 **com as 4 do L2 ainda bloqueadas pelo
   livro** (bloqueado 2 < Σ por lote 4). A devolução tira a reprovação "sem lote" de um bloqueado que é todo do L2.
3. *(estorno antes do bloqueio do L2)* igual à 1: 400 do motor, nada se move.

A causa de 2 é a mesma do C501 (Etapa 249) na liberação: a reprovação mora no bloqueado **sem lote**, e o "Sem lote" já a tirou; a liberação pela
NC confere isso desde a 249 (`SEM_LOTE_INSUFICIENTE`, frase própria), a devolução não.

## Regras de negócio

- **RN-274.01** — O entregável do detalhe (`quantidade_entregavel`, `saldo_entregavel`) e da Fila (`entregavel`) de um item de material com controle
  de lote e sem série, **sem** lote impedido, passa pelo teto da conferência (`tetoDaEntregaPeloLote`) quando o material tem um lote com parte
  guardada que o automático pula (o mesmo gatilho da E2: `outrasCaixasNoMaterial`, com o item entregando sozinho — `parteQueFica` 0 dele).
  Cenário: o de cima → detalhe e Fila da R2 mostram **0** (a porta recusa 1 com a E2).
- **RN-274.02** — O que cabe continua: R2 pede 2 e o L2 tem 1 livre → entregável **1** (a porta aceita 1, recusa 2 com a E2 "entregue 1 un a menos").
- **RN-274.03** — Sem o gatilho, nada muda: B01 livre → entregável 1 (o número de antes; a porta aceita). Guarda num lote **sem** prateleira
  bloqueada nem linha sem endereço → o número de antes (B1640).
- **RN-274.04** — A guarda da própria requisição: um item com 3 separadas de (A01, L1) e outro de 1 sem origem, B01 bloqueada → o segundo mostra
  **0**; o primeiro mostra **3** (a sua guarda sai inteira e não conta — `guardaQueConta`).
- **RN-274.05** — Só leitura: nenhum campo novo, nenhuma trava; a Fila só lê a mais para o item de material com controle de lote sem série.
- **RN-274.06** — Executar a devolução ao fornecedor (NC DEVOLVER) da reprovação de uma inspeção é recusado **antes de qualquer efeito** quando o
  bloqueado **sem lote** do material não cobre a reprovação e há bloqueado em lote (parte da reprovação saiu pelo Desbloquear "Sem lote"):
  **400** com a literal L1 abaixo; a NC continua PENDENTE (decidida), a inspeção sem carimbo, nada no livro. Variante 2 da Fase 0.
- **RN-274.07** — O C557 como escrito (variante 1) passa a receber a mesma recusa L1 (antes a frase crua do motor), nada se move.
- **RN-274.08** — Sem bloqueio em lote, nada muda: a reprovação ainda bloqueada → 200 `BAIXADA` (como antes); o bloqueado drenado abaixo da
  reprovação → o "registra sem mover" de sempre (`SEM_SALDO`, RN-11 da Etapa 45).
- **RN-274.09** — A conferência roda dentro da seção da devolução (`naTravaDoMaterial`, Etapa 218), **depois** do claim da inspeção *(revista pela
  Fase 5: antes dizia "antes do claim", e a segunda NC da mesma inspeção ficava presa)*; a recusa desfaz o claim da inspeção e o da NC (PENDENTE). Fluxo: recusa → Bloquear 2 *sem lote* → executar → 200 `BAIXADA`, bloqueado volta a 4 (o do L2).

## Contratos (congelados)

`GET /api/almoxarifado/requisicoes/:id` e `GET /api/almoxarifado/fila-separacao` — **nenhum campo novo**; só o
valor de `quantidade_entregavel` / `saldo_entregavel` (detalhe) e `entregavel` (Fila) muda no caso da RN-274.01.

`POST /api/almoxarifado/nao-conformidades/:id/executar` (e `registrarExecucao`) — **L1** (400, nova):
`Não é possível devolver pela não conformidade: só ⟨s⟩ ⟨un⟩ do bloqueado está sem lote e a reprovação tem ⟨q⟩ ⟨un⟩ — parte dela pode já ter sido
liberada pelo Desbloquear (o resto do bloqueado está em lote: ⟨L2: 4⟩). Bloqueie de novo, sem lote, o que falta e registre a execução outra vez, ou
cancele a não conformidade` — o mesmo molde da frase da liberação (Etapa 249, C501), lida do código.

## Tasks

- [x] **T1 (galho, leitura)** — A: o gatilho em `tetoDaEntregaPeloLote` + a Fila deixa de pular o item sem lote impedido (e lê `ma.controle_serie`).
  Teste `entregavelGuardaDeOutraCaixa.api.test.js` (9 cenários; 6 vermelhos antes) — `6afe38eb`. Sabotagens (âncora contada, cópia, md5 de volta):
  sem o gatilho → 6; a Fila pulando sem impedido → 4. Tirar o `parteQueFica` 0 do próprio item no gatilho **não derruba nada**: o teto calculado
  com a guarda própria saindo inteira dá o mesmo número (a dona → 3) — declarado, a forma fica pela regra (a mesma régua da E2). Vizinhos: 8
  arquivos de entrega, entregável e Fila verdes (92 cenários).
- [x] **T2 (tronco, NC)** — B: a conferência em `executarDevolucaoNaTrava` (com o fim "cancele" quando o lote não tem a reprovação — Fase 2,
  achado 1). Teste `ncDevolucaoDepoisDoSemLote.api.test.js` (7 cenários; 4 vermelhos sobre HEAD) — `75262048`. Sabotagens: sem o ramo do lote
  curto → 1; sem desfazer o claim da NC → 5. Vizinhos: 12 arquivos de NC, devolução, sucateamento e bloqueio por lote verdes.
- [x] **T3** — Fase 5 (revisor fresco, adversarial, sondas numa cópia `git archive`) — 1 achado reproduzido e consertado, `30eb19ba` (abaixo).
- [x] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8) — o commit de fechamento. Nenhuma coluna, tabela nem índice novo (primeiro boot igual).

## Pontos de atenção

- A Fila chama `tetoDaEntregaPeloLote` para mais itens (uma consulta a mais por item de material com lote sem série). Só leitura, fora das travas.
- `tetoDaEntregaPeloLote` com origem impedida/não cobre (Etapa 251) continua igual; o gatilho novo só abre a porta de entrada.
- A conferência da NC lê o bloqueado por lote dentro da trava do material (a mesma régua de `bloqueioPorLote.bloqueadoPorLote` que o
  Desbloquear usa).

## Fase 2 (revisor fresco, uma passada, 27/11) — 2 importantes, 3 menores

1. **[importante → aplicado `75262048`]** No C557 como escrito (o L1 com 1) a frase mandava "bloquear de novo, sem lote", o que não resolve (o
   lote não tem a reprovação): a recusa termina em *"O lote L1 tem só 1 UN, menos que a reprovação: cancele a não conformidade"*.
2. **[importante → C559, deduzido]** O sucateamento da reprovação (`scrapDisposalService`, a SUCATA "do bloqueado") só confere o total: o mesmo
   furo da devolução, deduzido pela leitura. Fora desta etapa; é a próxima tarefa.
3. **[menor → D (274) 1]** A conferência é do bloqueado do material, não de cada inspeção.
4. **[menor → texto]** "Nenhum campo novo" no detalhe: os campos de teto da 206 (`saldo_entregavel_lote*`) passam a vir também no caso novo.
5. **[menor → C560, deduzido]** Entregar juntos os dois itens da RN-274.04: a E2 não dispara para o irmão (furo da 273, não regressão).

## Fase 5 (revisor fresco, adversarial, 27/11) — 1 consertado; A não refutado

1. **[média → consertado `30eb19ba`]** A conferência da NC rodava **antes** do claim da inspeção: a **segunda** NC da mesma inspeção (já devolvida
   pela primeira, com outro lote bloqueado) levava a recusa nova em vez do *JA_DEVOLVIDA* de sempre e nunca fechava — e, seguindo a frase,
   duas peças livres ficariam bloqueadas. Agora roda depois do claim e a recusa desfaz os dois. Cenário novo (vermelho com a ordem anterior);
   sabotagem sem desfazer o claim da inspeção → 4.
- Não refutado: B com duas inspeções decimais (2,3 e 3,4) presas + L2 → as duas BAIXADA; A com dois itens do mesmo material (detalhe 2/2, Fila
  2/0, porta 2+1 recusa e 1+1 passa), guarda própria com a R1 no L1, segunda rodada (a Fila mostra 0 — igual antes da 274), material crítico.

## Divergências do plano

- A Fase 0 de B dizia "conferência antes do claim da inspeção" (RN-274.09) — **estava errado**: a Fase 5 mostrou a segunda NC presa. A RN-274.09
  passa a dizer: dentro da seção, **depois** do claim da inspeção, desfazendo os dois claims na recusa.
- O C557 estava errado no efeito (o caso descrito o motor já recusava); a variante sem estorno era o furo real.
- **CLAUDE.md:** nenhuma linha ficou errada (a devolução continua numa seção só, sob a trava do material desde a 218).

## Próxima tarefa detalhada

Escolhida pelas pendências C da feature 10 (o mesmo furo, o de maior valor: apaga patrimônio do lote errado): **C559 — o sucateamento da
reprovação depois do "Sem lote"** (~45 min, motor: medir antes). Caminho: reproduzir pelo fluxo da NC *Sucatear* → *Solicitar sucateamento* →
duas aprovações (`scrapDisposalService`, a SUCATA "do bloqueado", ~linha 498) com a reprovação liberada pelo "Sem lote" e 4 bloqueadas no L2;
se reproduzir, a mesma conferência de `executarDevolucaoNaTrava` (`bloqueioPorLote.bloqueadoPorLote`, sem lote < reprovação com lote bloqueado →
400 antes da baixa, desfazendo o que a aprovação gravou), dentro da trava do material; frase no molde da L1 desta etapa (*"Não é possível
sucatear pela não conformidade: …"*). Pontos de atenção: a segunda NC da mesma inspeção (a lição da Fase 5 daqui: conferir depois do claim);
o sucateamento avulso (sem NC) não passa por ali. Alternativas: **C560** (medir a entrega dos dois itens juntos, ~30 min); **C558**.

- **Item 24 da estimativa de 23/11 (série e etiqueta obrigatórios) ainda depende de resposta** — não comece sem ela. O item 23 (tirar o campo
  Aplicação) **foi resolvido na Etapa 263** (esta linha dizia, no plano da 273, que ainda dependia; estava desatualizada).
- **O que já está pronto e não reabre:** o entregável do detalhe e da Fila no caso da E2 e a devolução pela NC depois do "Sem lote", desta etapa.

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `30eb19ba`, **depois** do último conserto): **687/689 arquivos OK** —
  os 2 que falham são os já conhecidos de proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1).
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0** (sobre `30eb19ba`).
- Jest da tela e build: **não rodados** — o client não mudou nesta etapa.
- Nenhum clique no navegador (F (274)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2 — o fim "cancele" para o lote sem a reprovação; Fase 5 — a conferência depois do claim da inspeção).
- Achados: Fase 2 — 2 importantes (1 aplicado, 1 deduzido → C559), 3 menores (D (274) 1, texto, C560); Fase 5 — 1 reproduzido e consertado, A não
  refutado.
- Paralelismo: os revisores rodaram enquanto os testes e a documentação eram escritos; a primeira rodada do `test:api` foi parada e refeita
  depois do conserto da Fase 5.
- Defeito que escapou: (preencher na etapa seguinte). Da 273: o C557 estava errado no efeito e escondia a variante sem estorno (resolvida aqui).
