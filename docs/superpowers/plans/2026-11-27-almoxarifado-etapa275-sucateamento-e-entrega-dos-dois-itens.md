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

- [ ] **T1 (A)** — conferência em `scrapDisposalService` (helper único para as duas portas). Teste `sucateamentoDepoisDoSemLote.api.test.js`.
- [ ] **T2 (B)** — `outrasCaixasNoMaterial` com opção da conferência (a guarda própria desta entrega conta pela parte). Teste
  `entregaDosDoisItensDoLote.api.test.js`.
- [ ] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido).
- [ ] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

## Pontos de atenção

- `sucateamentoDoReprovadoPrevisto` é pura (sem banco) e é a precedência do `/executar`; a conferência nova fica fora dela, nas duas portas do
  sucateamento. O `/executar` de SUCATEAR não move estoque (só aponta para a solicitação).
- A opção nova de `outrasCaixasNoMaterial` só vale na conferência (falta já medida); o gatilho do teto (274) chama sem ela.
- O sucateamento avulso (sem NC) não passa pela reprovação: fora.

## Fase 2 (revisor fresco, uma passada)

(preencher)
