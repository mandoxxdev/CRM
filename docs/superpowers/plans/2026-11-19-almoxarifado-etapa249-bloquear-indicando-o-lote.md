# Etapa 249 — bloquear material indicando o lote (C500, B1419) e a frase própria da liberação pela não conformidade (C501)

> Itens 14 e 15 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 14: 1h30,
> motor; 15: 30 min, frase). Ponto de partida: a "Próxima tarefa detalhada" do plano da 248 e a Etapa 209 (o bloqueio sabe o lote; o
> Desbloquear já tem o campo Lote, RN-209.12). **Estimativa não revisada:** a medição confirmou os dois itens no tamanho descrito.
> **Fatia visível:** o campo **Lote** na janela **Inspeções → Bloquear Material**, com quanto cada lote tem livre para bloquear.

## Fase 0 — medido (código + execução, 19/11)

- `inspectionService.bloquearMaterial` (`server/services/almoxarifado/inspectionService.js:495`) **não lê** `lote_id` do corpo: chama o
  motor com `{ material_id, tipo: 'BLOQUEIO', quantidade, justificativa, motivo }` e `{ bloqueioAvulso: true }`. Todo bloqueio avulso
  grava `lote_id NULL` (conta como *"Sem lote"*) — confirmado pelo teste vermelho da T1 (`[RN-249.01]`, livro com `lote_id` null).
- O motor já aceita `lote_id` no BLOQUEIO (o da devolução para Quarentena, Etapa 209): resolve o lote (`Lote nao encontrado`, `O lote
  informado pertence a outro material`), grava `lote_id` no livro; o estorno do BLOQUEIO com lote tem a guarda M3 (209) e o Desbloquear
  tira do lote (M2) ou só do *"Sem lote"* (M1). O ramo `BLOQUEIO` avulso tem só a guarda do material (Etapa 97: `disponível + reservado −
  caixa sem reserva`).
- A régua "livre do lote" que já existe: `retidoDoLote.situacaoDosLotes` (Etapa 218, a do **Sai de** da entrega): `livre = MAX(0, saldo do
  lote − em inspeção no lote − retido no lote)`, retido = quarentena/avulso pelo livro + reprovado pela inspeção + terceiros pela remessa
  (B1434-B1436). A linha de saldos (`GET /estoque/:id/saldos`) mostra ao **Sai de** `lote_livre = livre − guardado das caixas de outras
  requisições no lote` (`requisitionService.guardadoNoLoteDeOutras`).
- **C501 reproduzido** (teste vermelho da T2, `[RN-249.20]`): reprovação 3 (sem lote), o *"Sem lote"* consumido em parte pelo
  Desbloquear, aceitar a NC → *"Informe o lote: só 2 UN bloqueado(s) sem lote — o resto está em lote (L1: 2)"* (a frase da tela de
  Inspeções, que manda "informar o lote" numa decisão que não tem campo de lote). `nonConformityService.executarLiberacao`
  (`:1047`) chama o motor e relança o erro como veio.

## Regras de negócio

**Item 14 (C500):**

- **RN-249.01** (rota) Material com controle de lote, L1 4 e L2 4. **Bloquear** 2 indicando L1 → 200; o livro tem `BLOQUEIO` com
  `lote_id` L1, 2; `GET /bloqueado-por-lote` → `{ total 2, sem_lote 0, lotes [L1 2] }`. Sem indicar o lote → como antes (sem lote,
  RN-209.03 intacta).
- **RN-249.02** O lote tem de ter **livre para bloquear** = `livre` de `situacaoDosLotes` − o guardado das caixas vivas de **todas** as
  requisições no lote (a régua do **Sai de** com `requisicao_id` nulo). L1 4 com 3 já bloqueados em L1 → bloquear 2 em L1 → **400**
  *"Saldo livre do lote L1 insuficiente para bloquear: 1 UN"*, nada gravado (livro, `quantidade_bloqueada`); bloquear 1 → 200. Também
  conta: a peça em inspeção no lote (recebimento com inspeção pendente) e a caixa separada no lote.
- **RN-249.03** Ordem das recusas: `lote_id` que não é inteiro positivo → *"lote_id deve ser um número inteiro positivo"* (vazio/null/
  ausente = sem lote, como no Desbloquear, B1422) → lote inexistente / de outro material (as literais do motor) → o **material**
  (*"Saldo disponível insuficiente para bloquear: N UN"*, a de sempre, Etapa 97) → o **lote** (RN-249.02). Assim quem pede mais do que
  o material tem continua vendo a mensagem de antes (molde B1420).
- **RN-249.04** (último gesto: Desbloquear) Depois de bloquear 2 em L1: Desbloquear *"Sem lote"* 2 → 400 M1 (*"Informe o lote: só 0 UN
  bloqueado(s) sem lote — o resto está em lote (L1: 2)"*); Desbloquear L1 2 → 200, L1 0.
- **RN-249.05** (último gesto: estorno) Estornar o BLOQUEIO avulso com L1 → 200, L1 some, total 0. Bloquear L1 2 + sem lote 2,
  desbloquear L1 2, estornar o BLOQUEIO de L1 → 400 M3 (*"Não é possível estornar: o bloqueio do lote L1 já foi desfeito (bloqueado no
  lote: 0 UN)"*) — a guarda da 209, agora alcançável pelo bloqueio avulso.
- **RN-249.06** (leitores) Depois de bloquear 2 em L1 (L1 4, L2 4): `retidoDoLote.retidoPorLote` → L1 2; o automático da entrega e o
  **Sai de** veem L1 com 2 livres (a peça bloqueada no lote não sai pela entrega).
- **RN-249.07** (NC que aceita/devolve) Reprovação 3 sem lote no livro (o lote pela inspeção) + bloqueio avulso de 2 em L1: aceitar a NC
  libera os 3 (o *"Sem lote"* continua 3 — o bloqueio com lote não come a parte da reprovação). A devolução ao fornecedor / sucata do
  reprovado não mudam (baixam o total pelo lote da inspeção, C502 como está).
- **RN-249.08** (trava) Dois bloqueios simultâneos de 3 em L1 (L1 4): um 200 e um 400 RN-249.02; `quantidade_bloqueada` 3, L1 3. A
  guarda do lote lê **dentro** da seção do motor (`registrarMovimentacao` sob `naTravaDoMaterial`).
- **RN-249.09** `GET /api/almoxarifado/materiais/:id/lotes-para-bloquear` (`visualizar`) →
  `{ material_id, lotes: [{ lote_id, codigo, saldo, livre }] }`, só lotes com saldo > folga, por código e id; inexistente → 404
  *"Material não encontrado"*. O `livre` é o **mesmo** número da guarda (bloquear `livre` passa; `livre + 1` → 400). Fixture da tela
  gravada pelo teste da rota (`client/src/components/almoxarifado/__fixtures__/lotesParaBloquearDoServidor.json`).
- **RN-249.10** (tela) **Bloquear Material**: ao escolher o material, busca o GET; com lotes, mostra o campo **Lote** (opcional) com
  *"Sem lote (não indicar)"* e *"L1 — 4 livre(s) para bloquear"*; o POST leva `lote_id` só com lote escolhido. GET falhou ou `lotes: []`
  → sem o campo, POST como antes. Trocar o material zera o lote; a resposta atrasada do material anterior é ignorada. **Mudança de
  regra:** o teste (8) da 209 (*"Bloquear não busca nem mostra o campo (B1419)"*) passa a dizer o contrário.

**Item 15 (C501):**

- **RN-249.20** Aceitar a NC (`ACEITAR`/`ACEITAR_SOB_DESVIO`) quando o *"Sem lote"* não cobre a reprovação → 400 com a frase própria
  *"Não é possível liberar pela não conformidade: só 2 UN do bloqueado está sem lote e a reprovação tem 3 UN — parte dela pode já ter
  sido liberada pelo Desbloquear (o resto do bloqueado está em lote: L1: 2)"*; a NC volta a ABERTA, nada liberado (RN-02 da 44). O
  Desbloquear direto continua com a M1 (metade positiva). A recusa do **total** (*"Quantidade bloqueada insuficiente: N"*) não muda.

## Contratos

- `POST /api/almoxarifado/materiais/:id/bloquear` (`ajustar_estoque`): corpo `{ quantidade, justificativa, lote_id? }` (aditivo).
  Resposta `{ success: true }`. Recusas novas: *"lote_id deve ser um número inteiro positivo"* (400), *"Saldo livre do lote ⟨código⟩
  insuficiente para bloquear: ⟨n⟩ ⟨un⟩"* (400). As outras inalteradas.
- `GET /api/almoxarifado/materiais/:id/lotes-para-bloquear` (nova, `visualizar`): RN-249.09.
- Decisão da NC (`POST /nao-conformidades/:id/decidir`): a recusa M1 vira a frase da RN-249.20; o resto inalterado.
- `POST /materiais/:id/desbloquear`, `POST /movimentacoes/:id/cancelar`: inalterados.

## Desenho

1. `lotService.lotesParaBloquear(db, materialId)` → a lista da RN-249.09 (`situacaoDosLotes` + `guardadoNoLoteDeOutras(null)`, `require`
   preguiçoso do `requisitionService`). Uma régua só: a rota e a guarda leem a mesma função.
2. Motor, ramo `BLOQUEIO` com `bloqueioAvulso` e `loteIdFinal`: antes do claim, lê o bloqueável do material (recusa de sempre), depois o
   `livre` do lote (`lotService.lotesParaBloquear`) → recusa RN-249.02. O claim do material continua com o `WHERE` dele. Tudo dentro da
   seção do motor (`naTravaDoMaterial`); nada novo pega trava.
3. `inspectionService.bloquearMaterial` lê `lote_id` como o `desbloquearMaterial` (B1422) e repassa.
4. O motor marca a recusa M1 do DESBLOQUEIO com `codigo: 'SEM_LOTE_INSUFICIENTE'`, `sem_lote`, `lotes_texto`, `unidade`;
   `executarLiberacao`, no `catch` (depois do desfazer de sempre), troca a mensagem pela da RN-249.20.
5. Tela: `InspecoesAlmoxarifado.js` — o campo Lote no Bloquear (molde do Desbloquear, `useUltimoPedido`).

Descartado: (a) a guarda do lote no `inspectionService` antes do motor (fora da seção do motor, ou uma seção a mais; e a ordem RN-249.03
ficaria lote antes do material); (b) o livre do lote **sem** a caixa separada (bloquear a peça que está na caixa de uma requisição prende a
entrega dela — a B496 da 97, agora por lote); (c) descontar também o reservado (a reserva não tem lote — C526; e o bloqueio avulso retém o
reservado de propósito, Etapa 97 I-5); (d) lote obrigatório no Bloquear para material com controle de lote (o bloqueio sem lote continua
válido e é o que a tela fazia; reversível depois); (e) recusar bloquear em lote impedido (bloquear dentro de um lote bloqueado/vencido só
retém mais; o desconto do impedido já tira o retido do lote, B1438 — sem dupla conta).

## Fase 2 (revisor fresco, 19/11) — 10 achados

1. (Importante) a régua `situacaoDosLotes` corta a família inteira quando ela não cabe no total (B1436): com o "Sem lote" consumido pelo
   Desbloquear, a reprovação de L1 deixava de reter e o Bloquear aceitava bloquear a peça reprovada. → **a régua do bloqueio usa as parcelas
   cruas**: `livre = MAX(0, físico livre do lote − quarentena − reprovado − terceiros − guardado nas caixas)`, sem o corte da família
   (mais rígida que a da entrega só nesse caso; letra B). Teste `[RN-249.02 família]`.
2. (Importante) a Saída/Perda/Sucata/Remessa com lote não respeitam o bloqueado do lote (comportamento da 209 para a quarentena, agora
   também para o avulso); o seletor da Saída mostra o saldo do lote. → **declarado** (aviso C novo) e provado por teste (`[RN-249.06 saída]`);
   a RN-249.06 vale para a entrega e o automático.
3. (Importante) material com série ou sem controle de lote: nenhum leitor respeita o lote do bloqueio. → **RN-249.11**: o GET devolve
   `lotes: []` e o motor recusa `lote_id` com *"Bloquear indicando o lote só vale para material com controle por lote e sem número de
   série"*.
4. (Importante) a caixa **com** reserva é bloqueável sem lote e não com lote → declarado (letra B), teste `[RN-249.02 caixa]`.
5. (Fixture) a RN-249.07 precisa de L1 com folga (o teste usa L1 10).
6. (Menor) o estorno do DESBLOQUEIO com lote rebloqueia sem a régua do lote → não muda; o aviso C504 ganha o caminho pelo avulso.
7. (Menor) a opção de lote com livre 0 sai **desabilitada** na tela.
8. (Menor) a T3 depende da fixture da T1 → T3 depois da T1.
9. (Menor) a frase da RN-249.20 ganha o que fazer.
10. Trava: sem achado; controle positivo da RN-249.08 obrigatório.

- **RN-249.11** (Fase 2, achado 3) material sem controle de lote, ou com número de série: GET `lotes: []`; POST com `lote_id` → 400 a
  literal acima (depois do formato do `lote_id`, antes do material).
- **RN-249.20 (revisada)** a frase: *"Não é possível liberar pela não conformidade: só 2 UN do bloqueado está sem lote e a reprovação tem
  3 UN — parte dela pode já ter sido liberada pelo Desbloquear (o resto do bloqueado está em lote: L1: 2). Bloqueie de novo, sem lote, o
  que falta e aceite outra vez, ou registre outra decisão"*.

## Tasks

- [x] **T1 (tronco)** (com os achados 1, 3, 5, 9 e 10 da Fase 2; vermelhos 0/14 antes; controle positivo: 8 sabotagens — guarda do lote, caixa, reprovado cru, ordem material→lote, `lote_id` no serviço, frase da NC, série, trava desligada —, cada uma derrubou o cenário que a guarda) — testes RN-249.01..09 em `server/tests/api/bloquearIndicandoOLote.api.test.js` (vermelhos antes) + `lotesParaBloquear`
  + motor + serviço + rota + fixture. Controle positivo: sabotar (1) a guarda do lote (tirar), (2) o desconto da caixa, (3) a ordem
  material→lote, (4) o `lote_id` no serviço.
- [x] **T2** (no mesmo commit da T1: o teste é o mesmo arquivo) — RN-249.20 (C501) no mesmo arquivo de teste (vermelho antes) + motor (`codigo`) + `executarLiberacao`. Controle positivo:
  tirar a tradução.
- [x] **T3 (galho)** (vermelhos 5/5 antes; controle positivo: 4 sabotagens — `lote_id` no POST, opção desabilitada, resposta atrasada, rótulo obrigatório —, cada uma derrubou o seu cenário) — tela: RN-249.10 em `InspecoesAlmoxarifado.test.js` (com a fixture), teste (8) da 209 reescrito.
- [x] **T4** — Fase 5 (revisor adversarial fresco com sonda executada, 19/11): 3 achados reais, 0 ruído. (1) o GET prometia o lote inteiro com bloqueio sem lote no material e o motor recusava pela guarda do material (sonda p4) → **RN-249.12**: o livre de cada lote é limitado pelo bloqueável do material (`caixaSql.bloqueavelAvulsoSql`, a mesma expressão do motor), teste vermelho antes, sabotagem do limite derruba. (2) o estorno da ENTRADA do lote passa com o lote inteiro bloqueado nele (sonda p3a) → declarado (aviso C, teste prende o comportamento). (3) a caixa separada sem lote não sai do livre do lote (sonda p1b) → declarado (letra B, como o bloqueio sem lote desde a 97). Não quebrou: corrida bloquear × separar (0/20), burlar pela v2, fracionado, permissão, reentrada. Fase 5 (revisor adversarial fresco com sonda executada) e correções com teste próprio.
- [x] **T5** — fechamento (fechar-etapa sem 7½ e 8).

## Pontos de atenção

- A trava não é reentrante: a leitura do livre roda dentro da seção do motor; `lotesParaBloquear` só lê (nada de `comLockDoMaterial`).
- `situacaoDosLotes` limita a quarentena por família (B1436): o livre pode subir se a soma da família não couber no total — o mesmo número
  que a entrega usa.
- O estorno do DESBLOQUEIO com lote rebloqueia o lote sem conferir o livre do lote (RN-209.06 a, *"sem guarda nova"*; C504) — não muda.

## Divergências do plano

- O plano dizia que a régua do livre do lote era a `situacaoDosLotes` da entrega — **estava errado** (Fase 2, achado 1): com o corte da
  família (B1436) ela deixava bloquear a peça reprovada; a régua usa as parcelas cruas.
- O plano não previa: a restrição a material com controle por lote e sem série (RN-249.11, Fase 2), o limite pelo bloqueável do material
  (RN-249.12, Fase 5), os dois testes que prendem o comportamento declarado (Saída com lote, estorno da entrada — C546, C547).
- A RN-249.20 do plano dizia que a recusa do total era *"Quantidade bloqueada insuficiente: N"* — **estava errado**: o total abaixo da
  reprovação é a RN-11 da 44 (a decisão é gravada sem liberar, *"O material já havia sido desbloqueado fora do documento…"*); o teste foi
  escrito assim.
- Nenhuma linha do `CLAUDE.md` ficou desatualizada (o motor inteiro já roda sob `naTravaDoMaterial` desde a 97; a guarda nova lê dentro dela).

## Verificação (medida, sobre o código final)

- `npm run test:api` sobre o código de produção final (`7fd033c9`): **641/642 arquivos** — o vermelho foi `portasAvulsasCaixa` (prende a lista
  exata de exports do `caixaSql`, que a Fase 5 aumentou com `bloqueavelAvulsoSql`); o teste foi atualizado em `20ed25bb` (só teste) e
  rodado de novo: 46/46. A rodada rodou sozinha, sem Jest nem build em paralelo, e terminou (não morreu por memória).
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **236 suítes, 3201 testes**; `CI=true react-scripts build`: *Compiled successfully*.

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2: régua crua, série, frase com ação; Fase 5: limite pelo bloqueável do material).
- Achados: Fase 2 — 10 (5 importantes: 3 corrigidos, 2 declarados; 5 menores: 3 aplicados, 2 registrados); Fase 5 — 3 reais com sonda
  executada (1 corrigido com teste vermelho antes, 2 declarados com teste que prende), 0 ruído.
- Paralelismo: a tela (T3) depois do tronco (fixture); a Fase 5 rodou enquanto a tela era feita, sem edição de servidor.
- Defeito que escapou: (preencher na etapa seguinte). Da 248: nenhum conhecido.

## Próxima tarefa detalhada

Itens 16 e 17 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 45 min cada,
fatias de tela). Módulo Almoxarifado.

- **Item 16 — a entrega diz quantas peças do lote estão bloqueadas (C514, B1440).** A janela de entrega (Etapa 218 já mostra quanto pode sair
  do lote: `GET /estoque/:materialId/saldos` traz por linha de lote com peça presa `lote_livre`, `lote_bloqueado`, `lote_inspecao`) sai do lote
  seguinte sem dizer por quê. **Medir antes de prometer:** onde a janela usa `lote_bloqueado` hoje (o *"Sai de"* de `RequisicoesAlmoxarifado`/
  janela de entrega) e se o automático (sem *Sai de*) tem como dizer; desde a 249 o bloqueio avulso com lote também entra em `lote_bloqueado`
  (RN-249.06). Contrato que consome: o de `/saldos` (sem campo novo, se a medição confirmar).
- **Item 17 — a sugestão da Fila lê a conta do lote preso (C517).** A dica *"pegar em XB-01, lote L1"* (`sugestaoDeColeta.js`, Etapa 218)
  pode apontar um lote cujo livre não cobre. Conserto previsto: a sugestão ler `retidoDoLote.situacaoDosLotes` (a régua da entrega, com o
  corte da família — **não** a do bloqueio, B1568) e o guardado das outras caixas. **Medir:** sonda com peça em quarentena no lote sugerido.
- **Pontos de atenção:** a régua da entrega e a do bloqueio diferem de propósito (B1568); a fila só lê (sem trava); fixture da tela regravada
  se `/saldos` ou a fila mudarem.
- **O que já está pronto e não reabre:** o bloqueio com lote e a frase da NC (esta etapa); o retido do lote nos leitores (217/218).
