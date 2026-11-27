# Etapa 271 — Devolução depois de uma exclusão interrompida (C553)

> Item **22** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, 1h15, motor).
> Feature: `specs/modulo-almoxarifado/04-requisicoes` (C553) e `12-devolucoes`. Etapa anterior: 270.

## Fase 0 — medido antes de prometer

- O defeito **existe como descrito** (reproduzido com o teste da etapa, sobre `c3de7a14`, 7 de 8 cenários vermelhos):
  *A* 3, *B* 5 (padrão *A*); entrega de 6 (*A* 3, *B* 3, uma saída); a exclusão falha na 2ª ENTRADA (a requisição continua, físico 5);
  **Devolução** de 6 citando a saída → **201**; com a corrida dentro da trava (a exclusão interrompida enquanto a devolução espera a
  trava), físico **11** (o certo: 8 depois de excluir de novo).
- Onde: a régua do que já voltou de uma saída tem três peças (`devolucaoViva.js`): a devolução viva, as séries que voltaram por outra
  entrada (C253) — e **nenhuma** para a ENTRADA da exclusão interrompida. A ENTRADA da exclusão grava `requisicao_id`, `tipo = 'ENTRADA'`,
  `motivo = 'Estorno exclusão requisição <numero>'` (a mesma chave da B1609) e **não** cita a saída.
- As cinco contas da régua e quem precisa da peça nova:
  1. a validação da devolução (`returnService.validarSaidaOriginal`) — **precisa**;
  2. a gravação condicional (`INSERT … WHERE EXISTS`) — **precisa** (corrida validação × gravação);
  3. a reconferência dentro da trava (`reconferirNaTrava`) — **precisa** (corrida medida: físico 11);
  4. a lista das entregas devolvíveis (`listarSaidasElegiveis`) — **precisa** (senão a tela oferece 6 e a gravação recusa);
  5. o estorno da saída pelo livro (`stockService`) — **não precisa**: a saída de requisição já é recusada no estorno avulso
     (*"Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)"*);
  6. a própria exclusão (`requisitionService.excluirSemTrava`) — **não pode**: ela já pula o que entrou (B1609); contar aqui de novo
     descontaria duas vezes.
- Série: a ENTRADA da exclusão com séries reativa as séries e grava `series_entrada_anterior_almoxarifado.saida_anterior_id` — elas
  **já** entram em `seriesQueVoltaramSql`. A peça nova tem de ignorar a ENTRADA da exclusão que trouxe série (senão conta em dobro).

## Regras de negócio

- **RN-271.01** — A Devolução citando uma entrega de requisição desconta o que uma exclusão interrompida dessa requisição já devolveu ao
  estoque dessa entrega. Cenário: o medido acima → Devolução de 6 → **400** com a literal E1; nada gravado; físico 5.
- **RN-271.02** — Devolver o que falta (3) passa; excluir de novo depois não credita mais nada (B1609 continua): físico 8.
- **RN-271.03** — A lista das entregas devolvíveis mostra o mesmo saldo (`saldo_devolvivel` 3) e o campo novo `quantidade_exclusao` (3);
  sem exclusão, `quantidade_exclusao` 0 e o saldo de sempre. Na tela, o rótulo da entrega diz *"N já voltou/voltaram ao estoque pela
  exclusão interrompida da requisição"* (fatia visível).
- **RN-271.04** — Com várias entregas na mesma requisição, o que a exclusão devolveu é de cada entrega **na ordem dela** — a mesma ordem
  da exclusão (saídas por id, cada uma pelo líquido: entregue − devolução viva): entregas de 2 e 4, a exclusão para na 2ª → a 1ª fica sem
  nada a devolver, a 2ª com 4. Fórmula, por saída *s* (requisição *R*, material *M*):
  `exclusao(s) = max(0, min(liquido(s), E − Σ liquido(s') das saídas de R/M com id < s))`, com `E` = soma das ENTRADAs vivas da exclusão de
  *R*/*M* **sem série** e `liquido = max(0, quantidade − devolução viva)`. **Fase 2 (achado 4 de leitura, já no código):** na reconferência
  dentro da trava a própria linha da devolução (já gravada) **não** entra no líquido (`semDevolucaoId`) — senão a conta é circular: a linha
  zera o líquido, a parte da exclusão some e `dev + exclusão` nunca passa da entrega (medido: físico 11). As outras devoluções entram: as que
  vieram depois da exclusão já foram limitadas por esta conta, então o líquido não cai abaixo do que a exclusão devolveu.
- **RN-271.05** — Material com série: a ENTRADA da exclusão que trouxe séries não entra em `E` (as séries já contam como "voltaram por
  outra entrada"). Cenário: S1 S2 em *A*, S3 S4 em *B*, saída das 4, a exclusão para depois de *A* → devolver S3 S4 → 201. **Fase 2 (achado
  2):** a **saída** com série (série vinculada, ou que voltou com a série) também fica fora da repartição, dos dois lados (ela e a soma das
  anteriores): com uma saída com série e outra antiga sem série do mesmo material, o que a exclusão devolveu da antiga caía na com série e a
  antiga aceitava devolver de novo. Último gesto (Fase 2, achado 3): com série, **excluir de novo** é recusado (as séries não batem / já
  voltaram — D (259)); o caminho é **encerrar**. A RN-271.02 ("excluir de novo") vale para material sem série.
- **RN-271.06** — A mesma conta na gravação condicional (a) e na reconferência dentro da trava (b). (a) a exclusão interrompida entre a
  validação e a gravação → 400 E1 (pela validação de novo, depois da gravação que não gravou); (b) a exclusão interrompida enquanto a
  devolução espera a trava do material → 400 E2, a linha apagada, físico 5.

## Contratos (congelados)

`POST /api/almoxarifado/devolucoes` — nenhum campo novo.
- **E1** (400, a de sempre, com um trecho novo só quando a exclusão devolveu algo): `Devolução acima do entregue: a saída <id> entregou
  <q>, já foram devolvidos <d>[, <v> já voltou|já voltaram ao estoque por uma entrada que não cita esta saída][, <e> já voltou|já voltaram
  ao estoque pela exclusão interrompida da requisição] e restam <r>` — sem exclusão, a literal **não muda**.
- **E2** (400, a de sempre): `A saída <id> mudou enquanto a devolução era gravada — nada foi gravado. Tente de novo.`

`GET /api/almoxarifado/devolucoes/saidas-elegiveis?material_id=` — campo novo por saída `quantidade_exclusao` (número, 0 sem exclusão);
`saldo_devolvivel = max(0, quantidade − quantidade_devolvida − quantidade_reentrada − quantidade_exclusao)`.

## Fase 2 (revisor fresco, uma passada, 27/11) — 2 importantes, 3 menores, ruídos

1. **[importante, residual — declarado D (271) 1, B1646]** Entregas *s1* 2 e *s2* 4, devolução de 2 em *s1*; a exclusão pula *s1*, credita 2 de
   *s2* e falha; a entrada da devolução é estornada pelo livro → o líquido de *s1* volta a 2 e a repartição põe os 2 da exclusão em *s1*: *s1*
   recusa os 2 que estão fora e *s2* aceita 4 (2 já voltaram). Conserto de verdade: gravar a saída na ENTRADA da exclusão (coluna nova) —
   descartado nesta etapa (B1646). Precisa de falha inesperada **e** estorno pelo livro da entrada da devolução depois.
2. **[menor → consertado]** Saída com série ao lado de saída antiga sem série: a antiga aceitava de novo → a saída com série fica fora da
   repartição (RN-271.05, cenário novo).
3. **[menor → texto]** RN-271.05 não ia até o último gesto (com série, excluir de novo é recusado; encerrar) → no plano.
4. **[importante de texto → já no código]** a reconferência com a própria linha no líquido seria vazia → RN-271.04 diz o `semDevolucaoId`.
5. **[menor → cenário]** interrupção **entre materiais** (M1 inteiro, falha na 1ª de M2) → cenário novo.
- Ruído: o ramo legado (livro que não soma o entregue) é conservador; a linha de série da reativação que não gravou (não fatal) recusa 1 a
  mais, nunca em dobro. Nenhuma outra conta ficou de fora (estorno da saída de requisição recusado; EPI sem requisição).

## Tasks

- [x] **T1 (tronco, motor)** — `exclusaoInterrompidaSql(saidaSql)` em `devolucaoViva.js`; as quatro contas do `returnService`; teste
  `devolucaoDepoisDeExclusaoInterrompida.api.test.js` (integração pela rota: separação → entrega → exclusão interrompida → lista →
  devolução → exclusão). Controle positivo por sabotagem de cada conta. — `ae64f9a5`. Teste: 10 cenários (7 de 8 vermelhos no código de
  antes; os 2 da Fase 2 vermelhos com a sabotagem da saída com série). Sabotagens (harness `scratchpad/sab271.sh`, âncora contada, cópia,
  md5 de volta): S1 validação, S2 INSERT (cai pela literal: a reconferência pegava com E2), S3 reconferência, S4 sem tirar a própria linha,
  S5 lista, S7 sem a soma das anteriores, S8 `<` → `<=`, S10 saída com série na soma — **cada uma derruba o seu cenário**. S6 (ENTRADA com
  série em `E`) e S11 (saída com série no `sxa`) sobrevivem **sozinhas** porque uma cobre a outra; as duas juntas derrubam a RN-271.05 —
  ficam as duas (defesa dupla). S9 (sem `cancelado = 0` na ENTRADA da exclusão) sobrevive: **inalcançável** (a ENTRADA com `requisicao_id`
  não se estorna pelo livro), como na B1609. `devolucaoEntregasAntigas` (a lista de campos ganhou `quantidade_exclusao`).
- [x] **T2 (galho, tela)** — o rótulo da entrega em `DevolucoesAlmoxarifado.js` + teste Jest — `6c1c9021` (32/32 no arquivo; as duas
  sabotagens — sem a frase, e o "já devolvido por inteiro" sem olhar a exclusão — derrubam o cenário novo).
- [x] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido) — `4a9e4feb` (o desempenho da lista; abaixo).
- [x] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8) — o commit de fechamento. Primeiro boot: o índice novo é `CREATE INDEX IF NOT EXISTS`
  logo depois do da Etapa 11, na mesma função do schema (nenhuma coluna nem tabela nova).

## Fase 5 (revisor fresco, adversarial, 27/11) — 1 menor (consertado), nada refutado

Sondas executadas numa cópia de `ae64f9a5` (`git archive`). Não refutou (a) dobra depois da exclusão interrompida, (b) recusa sem exclusão
nenhuma, (c) lista × gravação: corte no meio da 1ª entrega com mais uma entrega depois (físico 8), dois itens do mesmo material sem exclusão
(físico 10), Quarentena e Sucata (a mesma régua), quantidade fracionada (0,3 + 0,5). 13 arquivos vizinhos verdes na cópia.

1. **[menor, desempenho → consertado `4a9e4feb`]** a conta roda por linha da lista e somava o livro do material inteiro (sem índice em
   `requisicao_id`), mesmo sem exclusão interrompida: lista de 30 com 20 mil movimentos, ~450 ms (revisor) / 250 ms (sonda daqui). Agora
   responde 0 logo quando não há ENTRADA da exclusão daquela requisição e material (`CASE WHEN NOT EXISTS`) e o índice
   `idx_mov_almox_requisicao_material (requisicao_id, material_id, tipo)` atende o EXISTS: **3 ms** no mesmo cenário. Sabotagem do atalho
   (`ELSE 0 * …`) derruba 8 dos 10 cenários.

## Divergências do plano

- A RN-271.04 não dizia que a reconferência dentro da trava precisa tirar a própria linha do líquido — o teste da corrida (b) ficou vermelho
  com a fórmula literal (conta circular) e o `semDevolucaoId` entrou antes da Fase 2 (que confirmou).
- A RN-271.05 ganhou a saída com série fora da repartição (Fase 2, achado 2); o plano só tirava a ENTRADA com série.
- O atalho e o índice (Fase 5) não estavam no plano.
- **CLAUDE.md:** nenhuma linha ficou errada — a régua "viva" continua morando em `devolucaoViva.js` (a peça nova está lá); a devolução para
  Estoque continua validando fora e relendo dentro da trava (agora também a exclusão interrompida); a exclusão não mudou de trava.

## Próxima tarefa detalhada

A estimativa de 23/11 não tem mais item do almoxarifado a fazer: os itens 23 e 24 **dependem de resposta** (não comece sem ela). Os
candidatos já registrados **fora** da estimativa da semana, medidos — cada um precisa de estimativa própria antes (skill
`estimativa-de-tarefas`):

1. **O estorno do Desbloquear com lote bloqueia de novo sem conferir o lote** (**D (264)**, **C504**, **D (249)** 2; ~45 min, motor). Medido
   na revisão final da 264: bloquear 4 no *L1*, desbloquear, estornar a entrada do *L1* (passa, certo), estornar o Desbloquear → passa, e o
   bloqueio volta apontando para o *L1* vazio. Onde: `stockService.cancelarMovimentacao`, ramo do estorno de `DESBLOQUEIO` com `lote_id`.
   Caminho reversível: a mesma conferência do Bloquear com lote (o livre do lote: saldo do lote − bloqueado do lote, `bloqueioPorLote.js`) e
   a recusa no molde da do estorno da entrada com peça presa da 264 (literal *"… o lote ficaria apontando para peças que não estão nele …"*).
   Pontos de atenção: o estorno roda inteiro sob `naTravaDoMaterial` (Etapa 118 — a conferência tem de estar dentro da seção); o claim volta
   pelo catch; molde de teste em `estornoEntradaDevolucaoQuarentenaExcluida` / os da 264.
2. **A conferência do lote na entrega depende da ordem dos itens** (**C555**; ~1 h, entrega sob as duas travas). Medido na 268: lote *L* com 9
   (4 em inspeção — podem sair 5); item *i* no automático, item *k* com 4 separadas de *ZA — lote L*; a mesma entrega passa com *i* antes de *k*
   e é recusada com *k* antes. Nenhum erro de estoque. Caminho reversível: a conta do lote somar o separado de **todos** os itens da entrega
   antes do primeiro (a mesma da janela, que já usa a conta mais segura). Onde: a conferência do lote em `requisitionService` (entrega).
- **O que já está pronto e não reabre:** a devolução conta o que a exclusão interrompida devolveu (esta etapa; o residual é a **D (271)** 1);
  a B1609; a separação de duas prateleiras (270).

## Verificação (medida)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`, sobre `6c1c9021`): **681/683 arquivos OK** — os 2 que falham são os
  já conhecidos de proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1); o mais lento:
  `propostaClausulasGrava`, 79,7 s. O conserto da Fase 5 (`4a9e4feb`) entrou no fim dessa rodada: depois dele, os 27 arquivos de
  devolução/exclusão rodaram de novo, **27/27 OK**.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`): **259/259 suítes, 3398/3398 testes**. `CI=true npx react-scripts build`: **Compiled successfully.**
- `devolucaoDepoisDeExclusaoInterrompida` 10/10; `DevolucoesAlmoxarifado` 32/32. Nenhum clique no navegador (F (271)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (T1 — a conta circular na reconferência; Fase 2 — a saída com série; Fase 5 — o desempenho).
- Achados: Fase 2 — 5 (1 residual declarado, 1 consertado, 3 de texto/cenário) e ruídos; Fase 5 — 1 menor consertado, nada refutado.
- Paralelismo: o revisor da Fase 2 rodou enquanto o T1 era escrito (sem retrabalho; o achado 4 já estava no código); o da Fase 5 em cópia,
  junto com a suíte.
- Defeito que escapou: (preencher na etapa seguinte). Da 270: nenhum apontado.


## Pontos de atenção

- A chave da ENTRADA da exclusão é a da B1609 (`motivo = 'Estorno exclusão requisição ' || numero`, `requisicao_id`, vivo). Mudar o
  motivo da exclusão quebra as duas juntas.
- O cenário sem exclusão interrompida não pode mudar (literal E1 igual, `quantidade_exclusao` 0).
- A ordem por id das saídas é a da exclusão (`ORDER BY m.id`); a exclusão pula a saída com líquido 0.
