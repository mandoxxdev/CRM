# Etapa 198 — Separado de outras requisições no mesmo local: a separação conta o que já está separado para as outras

> **Tronco (motor da requisição, leitura sob trava).** Estimativa enviada: item 6 de
> `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt` (**4h**: análise 1h, execução 1h, teste 2h). Fecha o **C449**
> na forma que sobrou depois das 196/197. Plano medido sobre `301bda7a` (linhas abaixo são de hoje). Spec:
> `specs/modulo-almoxarifado/05-separacao-picking/README.md` (C449 em `:1095`, `:1124`, `:1230`).

## Objetivo (em linguagem simples)

Há 6 peças no endereço XB-01 (lote L1). Duas requisições pedem 4 cada e as duas janelas de separação abrem sugerindo XB-01. A primeira
separa 4 de lá. A segunda, com a janela ainda aberta, também confirma 4 de XB-01 — e o sistema **aceita**, embora lá só sobrem 2 que não
são de ninguém. O erro só aparece na **entrega** da segunda: *"a origem da separação (XB-01) não serve mais (O saldo em XB-01 (2)…)"* —
uma recusa sem motivo claro, no gesto errado. Passa a ser recusado **na separação**, com a conta à vista: quanto há, quanto já está separado
dali para outras requisições (quais) e quanto sobra.

## Fase 0 — medido em 2026-11-05 (sobre `301bda7a`)

### Onde está a causa (`server/services/almoxarifado/requisitionService.js`)

- **`checarOrigemItem` (`:1196`)** — a régua única "este item pode sair desta origem/lote nesta quantidade", da separação e da entrega.
  Soma as linhas do par (`:1224-1226`) e desconta só `pedidoPorOrigem` **da própria chamada** (`:1228-1232`); recusa em `:1233-1238`
  com *"O saldo em ⟨cod⟩ (⟨saldo⟩) não cobre a quantidade (⟨qty⟩) — a saída tiraria de outros endereços"* (com endereço) ou
  *"Saldo insuficiente no lote ⟨L⟩. Disponível: …"* (só lote). **Não conhece outras requisições.**
- **Separação:** envelope `separarRequisicao` (`:1307-1309`: `serializarNaRequisicao` → `comTravaDaRequisicao`), corpo `separarSemTrava`
  (`:1312`). `pedidoSeparacao` (`:1354`) é semeado com a **parte guardada dos itens da própria requisição** (`:1365-1370`, Etapa 59/196) —
  por isso a 2ª rodada no mesmo par e dois itens do mesmo material já somam. O separado das **outras** requisições no par é lido em
  `:1449-1452` (query `outras`, `SUM(PARTE_ORIGEM_SQL)`, `ir.requisicao_id <> ?`), mas só entra em `regua.saldoOrigem` (`:1453-1454`), que
  alimenta a **divergência** (`:1510-1511`: `maximo = min(base, saldoOrigem)`), não a aceitação. A aceitação é o `checarOrigemItem` de `:1459`.
  A query `outras` só roda com endereço (`origemId ? … : { q: 0 }`).
- **Entrega:** `entregarSemTrava` (`:1814`), `validarOrigemDaEntrega` (`:1904-1915`) → `checarOrigemItem` (`:1908`); com a planejada, a
  recusa vira *"⟨material⟩: a origem da separação (⟨cod⟩) não serve mais (⟨msg⟩) — entregue escolhendo de onde sai"* (`:1912-1913`).
- **Rotas:** `PUT /api/almoxarifado/requisicoes/:id/separar` (`server/routes/almoxarifado.js:4655`, `handleSeparacao` `:4626`) e
  `PUT /api/almoxarifado/requisicoes/:id/entregar` (`:4758`).

### As réguas que já contam o separado de outras caixas (reusar, não duplicar)

| Onde | Conta | Filtro da requisição |
|---|---|---|
| `PARTE_ORIGEM_SQL` / `parteOrigemSql` (`:68-74`, Etapa 196) | a parte da origem do item, limitada à caixa; `quantidade_origem_separacao` NULL = caixa inteira | — |
| `lerDadosDaColeta` (`:330`, `planejados` `:340-348`) — Fila e `GET /requisicoes/:id/sugestao-coleta` | `SUM(PARTE_ORIGEM_SQL)` por (material, origem, lote) | `COALESCE(r.ativo,1)=1 AND r.status IN STATUS_COM_CAIXA` |
| `lotesParaOAutomatico` (`:1749`, `guardadas` `:1758-1762`) — automático da entrega, 197 | `PARTE_ORIGEM_SQL` por (lote, endereço) | o mesmo |
| query `outras` da separação (`:1449-1452`) | `SUM(PARTE_ORIGEM_SQL)` no par | **só** `COALESCE(r.ativo,1)=1` — **diferente** |

`STATUS_COM_CAIXA` mora em `requisitionStateMachine.js:116` (PODE_SEPARAR + PODE_ENTREGAR + AGUARDANDO_APROVACAO_VALOR). **A diferença do
filtro importa agora:** os cancelamentos das rotas (`routes/almoxarifado.js:2196`, `:5029`) gravam `status='CANCELADO'` **sem** `ativo=0`;
só a exclusão (`requisitionService.js:2575`) zera `ativo`. Hoje uma requisição **cancelada** com origem gravada (legado — a caixa volta à
prateleira sem movimento, docstring de `STATUS_COM_CAIXA`) ainda entra na régua da divergência; se a aceitação passar a usar essa query
como está, ela **recusaria** separar por causa de uma caixa morta. Logo: unificar o filtro (RN-198.04).

### O teste que hoje afirma o defeito

`server/tests/api/preSelecaoColetaIntegracao.api.test.js:290` *"[Fase 5, C449] sugestao velha…"* (setup `duasJanelas` `:277-288`: L1 6 em
XB-01 vence em +5 dias, L2 9 em XP-01 em +45; R1 e R2 de 4 recebem a mesma sugestão XB-01/L1; R1 separa 4 do par) — **R2 separa 4 do mesmo
par → 200** (`:293`), R1 entrega 200, **R2 entrega → 400** com a literal da planejada (`:297-298`), nada baixado. O controle histórico
`:308` (R2 no **automático**) continua igual (a separação automática não guarda par; o automático da entrega já desconta, B1326/B1329).

Outros testes com duas requisições no mesmo par, medidos: `separacaoDivergencia.api.test.js:111` (A 8; outra separa 5 de A; esta 3 de A →
5+3 = 8 cabe: continua 200, `maximo` 3) — não muda. A suíte inteira roda depois da T1 para achar o resto (não estimado: medido).

### A separação automática, a planejada e a tela

- **Automática (sem "Sai de"):** não passa por `checarOrigemItem` e não guarda par (RN-196.03). O teto físico por material (Etapa 95) já
  desconta a caixa das outras. **Não muda.**
- **Só lote (sem endereço):** `checarOrigemItem` confere o saldo do lote; "só lote não vira origem" (`:1468`, e a planejada `:1475`) — não guarda nada, e a
  entrega dela vai ao automático, que desconta a parte guardada das outras (197). **Não muda** (B1332).
- **Planejada (pré-seleção da janela):** a sugestão vem de `GET /requisicoes/:id/sugestao-coleta`, que já desconta a parte guardada das
  outras (`lerDadosDaColeta`, `planejados`). O defeito só acontece com a **janela velha** (aberta antes da outra separar) ou com o "Sai de"
  escolhido à mão. Reaberta a janela, a sugestão já aponta outro par (teste `origemSeparacaoEmDuasVezes.api.test.js:406` prova a conta).
- **O "Sai de" da tela** (`client/src/components/almoxarifado/RequisicoesList.js:148`, rótulo `⟨cod⟩ — lote ⟨L⟩ (⟨quantidade⟩)`) vem de
  `GET /estoque/:id/saldos` (`routes/almoxarifado.js:830`), o **físico** do par; o comentário `:275` diz *"outras requisições a tela não
  conhece"*. Mostrar o comprometido ali exige campo novo no `/saldos` (usado também pela Movimentação) — **cortado** (C469). A fatia visível
  desta etapa é a **mensagem** da recusa, na janela de separação (a janela já mostra o `error` do 400).

### Entrega: a recusa continua alcançável? Sim — guarda mantida

Com a separação recusando, o par só fica sobrecomprometido por: (a) **dado antigo** (separações gravadas antes do deploy); (b) estoque que
saiu do endereço depois da separação (ajuste/contagem com localização, transferência — a 97 só barra saída avulsa da caixa no nível do
material). Nos dois, a entrega da planejada continua recusando com a literal de hoje (`:1912-1913`) e nada baixa. **A entrega não muda**
(B1333) e ganha teste próprio da guarda (RN-198.06, dado antigo semeado por SQL).

### C467 (a exclusão não limpa a origem guardada)

A etapa **toca** no ponto que o C467 pede: *"quem escrever uma conta nova da parte guardada tem de filtrar requisição em andamento"*. A
aceitação nova usa o filtro unificado (`ativo` **e** `STATUS_COM_CAIXA`) e ganha teste com R1 excluída (RN-198.03). **Não** limpa a origem
na exclusão (o filtro protege; limpar seria escrita nova na exclusão, sob a trava da 120, fora do escopo) — o C467 continua "nenhum efeito".

### Travas

A separação já roda sob `serializarNaRequisicao` → `comTravaDaRequisicao` (trava por material dos itens, Etapa 95, B476): duas separações
de requisições diferentes do mesmo material são uma depois da outra, e a segunda lê a parte que a primeira acabou de gravar. A leitura nova
é **dentro** da mesma seção — nenhuma porta nova, nenhuma trava nova. Teste de corrida barato (sem gancho): duas `separarRequisicao`
disparadas juntas do contexto do teste (`Promise.all`) — RN-198.07.

## Caminhos pesados

- **Escolhido — recusar na separação** a entrada com endereço cujo par, descontada a parte guardada das outras caixas vivas, não cobre
  (B1330). Move o erro para o gesto certo, com a conta à vista; reversível (só uma condição a mais no `checarOrigemItem`, sem dado).
- **Descartado — aceitar e avisar** (200 com `aviso`): a falha continuaria na entrega da segunda, que é exatamente a reclamação do item; e
  o aviso exigiria contrato e tela novos.
- **Descartado — descontar também na entrega planejada:** com dado antigo sobrecomprometido, as **duas** requisições seriam recusadas
  (cada uma vê a parte da outra), em vez de a primeira entregar. A entrega fica "quem entrega primeiro leva", com a guarda de hoje.
- **Cortado (C468) — a entrega com "Sai de" escolhido à mão** (não a planejada) também não desconta a parte guardada de outra: escolher
  XB-01/L1 na entrega de R2 drena o que R1 separou dali e é a entrega de **R1** que toma o *"não serve mais"*. É o mesmo defeito, por outra
  porta; fica para a próxima (literal própria, e o escape *"entregue escolhendo de onde sai"* não pode virar armadilha no dado antigo).

## Regras

- **RN-198.01 — a separação com "Sai de" recusa o par já separado para outras.** Entrada com `localizacao_origem_id` (com ou sem `lote_id`):
  recusa com 400 quando `saldo do par − o que esta chamada já pede no par (inclui a parte guardada da própria requisição, :1365-1370) −
  parte guardada das outras caixas vivas no par < quantidade`, e o físico sozinho cobriria. **Nada gravado:** status, rodada, itens e
  divergência iguais aos de antes (a recusa é da passada 1, antes do claim `:1526`). *Cenário:* XB-01/L1 6; R1 separou 4 de lá; R2 pede 4
  de XB-01/L1 → 400 com a literal C1 (abaixo), `R2.status` igual, nenhuma rodada nova.
- **RN-198.02 — o que sobra, cabe.** Mesma conta com igualdade: R2 pede 2 → 200 e grava a origem XB-01/L1 com parte 2. *Fronteira:* 2,000001
  recusa (folga `1e-9` de hoje).
- **RN-198.03 — só conta caixa viva, e a parte (não a caixa).** Não comprometem o par: requisição **entregue** (parte 0), **cancelada**
  (status fora de `STATUS_COM_CAIXA`, ativa) e **excluída** (`ativo = 0`, C467). Comprometem: EM_SEPARACAO, PRONTA_PARA_RETIRADA,
  PARCIALMENTE_ATENDIDA, AGUARDANDO_APROVACAO_VALOR com parte > 0. A parte é a da 196 (`PARTE_ORIGEM_SQL`): separou 3 de A e 3 no automático
  → compromete 3; `quantidade_origem_separacao` **NULL** (dado antigo) → a caixa inteira (RN-196.10). Entregue em parte → a parte cai pelo
  que saiu dela.
- **RN-198.04 — uma régua só.** O filtro "caixa viva" (`COALESCE(r.ativo,1)=1 AND r.status IN STATUS_COM_CAIXA`) vira um fragmento único
  (`caixaVivaSql`) usado pela Fila/sugestão (`lerDadosDaColeta`), pelo automático da entrega (`lotesParaOAutomatico`) e pela separação
  (aceitação **e** divergência — a query `outras` passa a ser uma leitura só, `parteGuardadaDeOutras`, usada pelos dois). Efeito colateral
  declarado: a divergência deixa de contar caixa de requisição cancelada (legado) — correção, não regressão.
- **RN-198.05 — automática e só lote não mudam.** Separação sem "Sai de" e com só `lote_id` respondem como hoje (o controle histórico
  `preSelecaoColetaIntegracao.api.test.js:308` continua verde sem edição).
- **RN-198.06 — a entrega não muda e a guarda fica.** Com o par sobrecomprometido por dado antigo (duas origens gravadas por SQL, 4 + 4 em
  6), R1 entrega 200; R2 entrega 400 com a literal de hoje (`… não serve mais (O saldo em XB-01 (2) não cobre a quantidade (4) — …) —
  entregue escolhendo de onde sai`), nada baixado, nenhuma troca.
- **RN-198.07 — duas ao mesmo tempo, uma passa.** R1 e R2 pedem 4 de XB-01/L1 (6) na mesma volta do laço (`Promise.all`, 10 repetições
  com material novo): exatamente uma 200 e uma 400 C1; a soma das partes gravadas no par ≤ 6.
- **RN-198.08 — a própria requisição não é "outra".** 2ª rodada no mesmo par da própria requisição e dois itens do mesmo material no mesmo
  par somam como hoje (Etapa 59/196); só `requisicao_id <> esta` entra na parte das outras.
- **RN-198.09 — o caso do item, ponta a ponta.** As duas janelas com a sugestão velha: R2 recusa **na separação** (C1); reaberta, a sugestão
  de R2 aponta XP-01/L2 (cobre); R2 separa de lá; R1 e R2 entregam 200; XB-01/L1 2, XP-01/L2 5, nenhuma linha sem lote, nenhuma troca.

## Contrato congelado

**`PUT /api/almoxarifado/requisicoes/:id/separar`** — payload, perfis e respostas de sucesso **inalterados**. Recusa nova (só entrada com
`localizacao_origem_id`):

- **400 C1** (`error`):
  `` `${material_nome}: O saldo em ${cod} (${saldo}) não cobre a quantidade (${qty}) — ${outras} já está separado dali para outra requisição (${numeros}); sobra ${sobra}. Escolha outro endereço ou reabra a janela para ver a sugestão atual` ``
  - `cod` = código do endereço; com lote: `` `${codEndereco}, lote ${loteCodigo}` ``;
  - `saldo` = soma das linhas do par − o já pedido nesta chamada (o mesmo número que a literal antiga mostra);
  - `outras` = parte guardada das outras caixas vivas no par; `sobra = max(0, saldo − outras)`; números com `Math.round(x * 1e6) / 1e6`;
  - `numeros` = `r.numero` das requisições que guardam parte > 0 no par, distintos, em ordem crescente, separados por `", "`.
  - Exemplo (RN-198.01): *"Parafuso X: O saldo em XB-01, lote L1 (6) não cobre a quantidade (4) — 4 já está separado dali para outra
    requisição (REQ-0001); sobra 2. Escolha outro endereço ou reabra a janela para ver a sugestão atual"*.
- **Precedência:** se o físico sozinho já não cobre (`saldo < qty`), vale a literal de **hoje** (`O saldo em ⟨cod⟩ (⟨saldo⟩) não cobre a
  quantidade (⟨qty⟩) — a saída tiraria de outros endereços`), inalterada. A C1 só quando `saldo ≥ qty` e `saldo − outras < qty`.
- Ordem com as outras recusas: depois do teto do item (`:1410-1417`, *"não é possível separar …"*) — a C1 é do `checarOrigemItem`.
- Só lote (sem endereço): inalterado (literal *"Saldo insuficiente no lote …"*).

**`PUT /api/almoxarifado/requisicoes/:id/entregar`**, **`GET /fila-separacao`**, **`GET /requisicoes/:id/sugestao-coleta`**,
**`GET /estoque/:id/saldos`** — **inalterados** (a fila e a sugestão já usam o filtro unificado: mesmos números).

**Interno (serviço):**
- `caixaVivaSql(alias = 'r')` → `{ sql, params }` com `COALESCE(${alias}.ativo, 1) = 1 AND ${alias}.status IN (?,…)` e `STATUS_COM_CAIXA`.
- `parteGuardadaDeOutras(db, materialId, origemId, loteId, requisicaoId)` → `{ q, numeros }` (`SUM(PARTE_ORIGEM_SQL)` + `GROUP_CONCAT` dos
  `numero` com parte > 0); memo por chave `m|o|l` dentro de uma chamada de `separarSemTrava`.
- `checarOrigemItem(db, item, { origemId, loteId, lidoNorm }, qty, pedidoPorOrigem, outras = null)` — 6º parâmetro opcional
  `{ q, numeros }`; a entrega não passa (comportamento de hoje, bit a bit).

## Tasks (sort topológico)

- **T1 — tronco — a aceitação conta as outras** (`requisitionService.js` só).
  1. `caixaVivaSql` e troca nos dois lugares que já filtram (`:340-348`, `:1758-1762`) — mecânico.
  2. `parteGuardadaDeOutras`; a query `outras` (`:1449-1452`) passa a chamá-la (memo); `regua.saldoOrigem` usa o `q` dela.
  3. `checarOrigemItem` com o 6º parâmetro e a C1; a separação passa `outras` quando `origemId` (`:1459`).
  4. **Reescrita no mesmo commit:** `preSelecaoColetaIntegracao.api.test.js:290` passa a dizer *"Etapa 198 (RN-198.01): era 200 na
     separação e 400 na entrega (C449)"* — R2 separa → 400 C1, `R2` sem rodada; o resto do teste sai (a entrega de R2 não acontece). Rodar
     `npm run test:api` inteiro; todo vermelho novo é medido e reescrito aqui com o mesmo comentário "era…" (ou vira achado no plano).
  *Controles (cada um tem de derrubar o que diz):* (i) não passar `outras` em `:1459` → cai a reescrita de `:290` e RN-198.01/09;
  (ii) filtro só `ativo` → cai RN-198.03 (cancelada); (iii) sem filtro nenhum → cai RN-198.03 (excluída); (iv) caixa em vez de
  `PARTE_ORIGEM_SQL` → cai RN-198.03 (parte limitada); (v) contar a própria requisição como outra → cai RN-198.08.
  *Estimativa:* 45 min (código 25, reescritas e suíte 20).
- **T2 — tronco — os testes das regras**, arquivo novo `server/tests/api/separacaoSeparadoDeOutras.api.test.js` (molde de setup:
  `preSelecaoColetaIntegracao.api.test.js:60-120`; validades **relativas** a hoje, `dia(n)`).
  - **pela rota** (`PUT …/separar`, `PUT …/entregar`): RN-198.01, .02 (com fronteira), .03 (entregue, cancelada pela rota de cancelar,
    excluída pelo `DELETE`, parte limitada, NULL legado por SQL, AGUARDANDO_APROVACAO_VALOR por SQL), .05, .06, .08;
  - **pelo serviço** (`requisitionService.separarRequisicao` direto): RN-198.01 (a mesma C1) e RN-198.07 (`Promise.all`, 10×).
  *Controles:* os da T1 (rodar cada sabotagem e anotar quais caem); RN-198.06 com o desconto aplicado também na entrega → cai (prova que
  a entrega não foi tocada).
  *Estimativa:* 1h (11 cenários + sabotagens).
- **T3 — tronco (fecha) — integração** (RN-198.09) no mesmo arquivo da T2 ou em `preSelecaoColetaIntegracao` (ao lado de `duasJanelas`):
  pela **rota** — `GET /sugestao-coleta` das duas → R1 separa → R2 separa com a sugestão velha (400 C1) → `GET /sugestao-coleta` de R2
  (XP-01/L2, `cobre`) → R2 separa de lá → `GET /fila-separacao` (as duas com `ENTREGAR`) → R1 e R2 entregam → saldos e livro; pelo
  **serviço** — o mesmo com `separarRequisicao`/`entregarRequisicao`. *Controle:* T1 sabotada (i) → o fluxo volta ao 400 na entrega.
  *Estimativa:* 20 min.

Ordem: **T1 → T2 → T3**, um executor (tudo é tronco: mexe na régua compartilhada da separação). Nenhum galho; nenhuma tela.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1330** — a separação com "Sai de" recusa o par já separado para outras requisições (RN-198.01). **Descartado:** aceitar e avisar.
- **B1331** — o filtro "caixa viva" é um só (`ativo` + `STATUS_COM_CAIXA`) para fila, automático da entrega e separação (RN-198.04).
  **Descartado:** manter só `ativo` na separação (a cancelada legada recusaria separar; a régua da divergência já errava com ela).
- **B1332** — só o par **com endereço**; só lote e automático não mudam (RN-198.05). **Descartado:** conferir também o só lote (ele não
  guarda par e a entrega dele já desconta no automático — 197).
- **B1333** — a entrega não muda; a recusa *"não serve mais"* continua como guarda (dado antigo, estoque que saiu do endereço depois)
  (RN-198.06). **Descartado:** descontar as outras também na entrega planejada (no dado antigo prenderia as duas).
- **B1334** — a mensagem diz quanto há, quanto está separado para outras, **quais** (número da requisição) e quanto sobra. **Descartado:**
  sem os números (o almoxarife não saberia de quem é a caixa); a literal antiga (é a que o item chama de "sem motivo claro").
- **B1335** — sem mudança de tela: a fatia visível é a mensagem. **Descartado:** o "Sai de" mostrar o comprometido (campo novo no
  `/saldos`, usado pela Movimentação — C469).

## Letra C proposta (a partir de C468)

- **C468** — a entrega com "Sai de" escolhido à mão (não a planejada) ainda não desconta o que outra requisição separou do par: tira de lá e
  a entrega da outra toma *"não serve mais"*. Mesmo defeito por outra porta; próxima etapa candidata.
- **C469** — o "Sai de" da janela de separação mostra o saldo físico do par, sem descontar o que está separado para outras requisições; a
  recusa (C1) diz a conta. Reabrir a janela atualiza a sugestão.
- **C449** — vira **resolvido na separação**; a entrega fica com a guarda (B1333) e o resto vai para a C468.

## O que não cobre

A entrega com escolha à mão (C468); o rótulo do "Sai de" (C469); limpar a origem na exclusão (C467, protegido pelo filtro); o só lote
(B1332); material com série (a separação com "Sai de" de série passa pela mesma régua — sem caso novo).

## Cabe em 4h?

**Sim, com os cortes acima.** Análise 1h (este plano + Fase 2). Execução ~45 min (T1). Teste ~1h20 (T2 + T3) mais a suíte e as sabotagens —
dentro das 2h. Risco de estouro: a suíte inteira achar mais testes que afirmam a separação aceita no par comprometido (só medido depois da
T1); se passar de 3, a reescrita deles entra na conta e o estouro é registrado no fechamento. Fazer a C468 junto **não** cabe (+1h a 1h30:
literal e testes da entrega, e o cuidado com o dado antigo).

## Fase 2 — revisão do plano (a fazer, revisor fresco)

Quatro perguntas da skill, com atenção a: (a) a C1 ser alcançável sem a literal antiga a esconder (precedência); (b) a janela de separação
mostrar o `error` do 400 sem fechar (medir em `RequisicoesList.js` antes de executar); (c) seguir cada RN até a entrega — a separação
recusada não deixa gravação que a entrega depois leia; (d) a fronteira com a C468 não deixar uma porta posterior recusando o que a
separação aceitou.

## Fase 2 — correções do revisor fresco (2026-11-05) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `0affc3df`: 0 trava, 2 importantes, 5 menores, todos aceitos. Confirmado: a separação roda sob `serializarNaRequisicao` +
`comTravaDaRequisicao` (`requisitionService.js:1307-1309`); quem grava parte/caixa (separação, entrega, devolução `:2636`, exclusão) está sob a
trava por material; cancelar e encerrar com caixa são recusados (M1, B700); fora da trava só se diminui a parte das outras (B441, seguro). Trocar a
Fila (`:340-348`) e o automático (`:1758-1762`) para `caixaVivaSql` é mecânico; a única mudança real é a divergência (`:1452`) deixar de contar
caixa cancelada antiga — correção; `separacaoDivergencia.api.test.js:111` não muda.

1. **[IMPORTANTE] A literal C1 se contradizia** ("O saldo (6) não cobre a quantidade (4)" quando 6 ≥ 4). **Contrato C1 passa a ser:**
   `` `${material_nome}: em ${cod} há ${saldo} para esta separação, mas ${outras} ${plural ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} (${numeros}); sobra ${sobra}, que não cobre a quantidade (${qty}). Escolha outro endereço ou reabra a janela para ver a sugestão atual` ``
   (`plural` = mais de um número). O `checarOrigemItem` lança **sem** o prefixo do material — quem chama já põe (`:1462`), senão o nome duplica.
   Com `jaPedido > 0` (vários itens do mesmo par na mesma chamada), acrescentar `" (já contando ${jaPedido} desta requisição)"` depois de `${saldo}`
   (achado 6).
2. **[IMPORTANTE] RN-198.03 "cancelada pela rota" não se monta** (a rota recusa cancelar com caixa — M1; cancelando depois de devolver, a origem já
   foi limpa, `:2725`). **T2:** cancelada **com caixa semeada por SQL** (`status='CANCELADO'`, `ativo=1`, origem e parte gravadas — o legado da
   docstring de `STATUS_COM_CAIXA`); a rota de cancelar com caixa ganha só um teste de controle do 400. A citação `routes/almoxarifado.js:2196` era o
   cancelamento de **conferência** — trocar por `:5029`.
3. **[MENOR]** Todo cenário da C1 tem **estoque em outro endereço** (molde `duasJanelas`, XP-01 9), senão o teto do item ("não é possível separar 4…
   Máximo: 2") bate antes e a sabotagem (i) passa verde.
4. **[MENOR]** Controle novo (vi): `separarRequisicao` chamando `separarSemTrava` direto, sem `comTravaDaRequisicao` → a RN-198.07 (corrida) cai (as
   duas 200, soma 8 > 6).
5. **[MENOR]** Ordem dos números: `SELECT r.id, r.numero, SUM(parte) q … GROUP BY r.id HAVING q > folga`, ordenar por `r.id` no JS e somar `q`
   (`GROUP_CONCAT` não garante ordem; `numero` é `NOT NULL`, `schema.js:609`).
6. **[MENOR]** coberto no item 1 (`jaPedido`).
7. **[MENOR]** A tela chama `PUT …/separacao` (`RequisicoesList.js:955`), não `/separar` (as duas vão a `handleSeparacao`); o 400 vira **toast com a
   janela aberta** (`:960-970`), a sugestão só atualiza reabrindo. Fase 0: "toast, janela aberta"; a T3 usa `/separacao`.
8. **C468** ganha a frase: "contorna a recusa da 198 (automático na separação + 'Sai de' à mão na entrega)". Seguro deixar fora: nada é baixado
   errado; R1 entrega escolhendo outro endereço.

## Execução

*(preencher por task: feita, hash, divergência do previsto)*

## Próxima tarefa detalhada

*(preencher no fechamento — candidata: C468, a entrega com "Sai de" escolhido à mão descontando a parte guardada das outras.)*
