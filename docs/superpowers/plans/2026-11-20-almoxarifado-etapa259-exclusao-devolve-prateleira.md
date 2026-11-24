# Etapa 259 — a exclusão da requisição devolve às prateleiras de onde a entrega tirou (D (257) 2)

> Item único: a limitação **D (257) 2** ("a exclusão da requisição continua devolvendo a entrega numa prateleira só"). A "próxima tarefa
> detalhada" (item 2) do plano da 258. Estimativa `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-exclusao-devolve-prateleira.md`
> (1h15, `665745a7`). **Não entram:** os itens 24, 25 e 26 da estimativa de 18/11 (esperam resposta da empresa).
> **Fatia visível:** não há tela nova — o que muda aparece em **Estoque → saldo por localização** (e no **Histórico**: uma Entrada por
> prateleira) depois de **Excluir** uma requisição entregue. Declarado (motor puro).

## Fase 0 — medido (sonda executada sobre `508eb9c9`, 20/11, `scratchpad/sab-259-sonda.js`, pela rota `DELETE /requisicoes/:id`)

| # | Cenário (material sem lote, sem série) | Hoje | Certo |
|---|---|---|---|
| 1 | padrão *A* 3, *B* 5; separação e entrega de 6 (*A* 0, *B* 2); excluir | *A* 6, *B* 2 | *A* 3, *B* 5 |
| 2 | padrão *P* vazia, *A* 4, *B* 4; entrega de 6 (*A* 0, *B* 2); excluir | *P* 6, *A* 0, *B* 2 | *A* 4, *B* 4, *P* 0 |

- **Causa:** `excluirSemTrava` (`requisitionService.js` ~3407): uma `parte` por SAÍDA da entrega (líquido das devoluções vivas), destino =
  a origem do livro se ainda aceita o material (ativa, não bloqueada, tipo permitido) ou `undefined` (a padrão, pelo motor); uma ENTRADA por
  parte. Todas as partes são validadas (séries, a guarda da 116, a C251, o endereço) **antes** da primeira ENTRADA (Etapa 58).
- **O registro existe:** desde a 257 toda SAÍDA do motor grava, por movimento, as linhas que o claim baixou
  (`ajuste_linhas_drenadas_almoxarifado`: `movimentacao_id`, `saldo_id`, `quantidade`), e a entrega passa pelo motor (teste RN-257.06).
  A soma do registro é a quantidade da saída.
- **Travas:** a exclusão já roda sob a por requisição → por material dos itens (`comTravaDaRequisicao`, Etapa 120); a ENTRADA do motor passa
  direto (`naTravaDoMaterial` vê a seção). A leitura nova (registro + linhas + endereços) fica dentro da seção. Nada novo de trava.
- **Série:** a ENTRADA com séries reativa cada série com `localizacao_id` = o destino da ENTRADA (`seriesService.entradaSeries`). A saída não
  muda o endereço da série.

## Decisões

- **B1607 — prateleira que não aceita mais o material** (inativa, bloqueada, tipo não permitido, ou a linha sem endereço): a parte dela vai
  para onde a exclusão manda hoje (a origem do livro, se aceita; senão a padrão). **Escolhido** porque a exclusão credita por ENTRADA, e a
  ENTRADA confere endereço (o estorno pelo livro não confere — por isso a B1604 da 257 deixa a bloqueada receber); é a regra que a exclusão
  já usa para a origem desde a Etapa 58. **Descartado:** receber na bloqueada como a B1604 — exigiria a ENTRADA pular a validação de
  endereço só para a exclusão (abrir exceção no motor). Reversível: um `if`.
- **B1608 — devolução parcial da saída antes da exclusão:** o líquido (saída − devoluções vivas) é distribuído às linhas **na ordem do
  claim** (a primeira baixada recebe primeiro, até o que saiu dela); as últimas recebem menos. **Escolhido** porque a devolução não diz de
  que prateleira a peça veio, e a ordem do claim é a do estorno pelo livro (257). **Descartado:** ratear proporcionalmente (frações num
  material inteiro) e a ordem inversa (sem motivo melhor). Reversível: a ordem do laço.

## Regras de negócio

- **RN-259.01** Na exclusão, cada SAÍDA da entrega **com registro** credita por **uma ENTRADA por linha registrada** (o endereço da linha, o
  lote da saída), a quantidade que saiu dela, na ordem do claim, limitado ao líquido (RN-259.03). Cenário 1 → *A* 3, *B* 5; cenário 2 →
  *A* 4, *B* 4, *P* 0. Total igual ao de hoje.
- **RN-259.02** Linha registrada que não existe mais, de outro material ou lote, sem endereço, ou cujo endereço não aceita mais o material
  (inativo, bloqueado, tipo não permitido): a parte dela vai para o destino de hoje (origem do livro se aceita, senão a padrão) — **B1607**.
  Partes com o mesmo destino viram uma ENTRADA só.
- **RN-259.03** Líquido menor que o registrado (devolução viva da saída): distribuído na ordem do claim — **B1608**. Cenário: *A* 3, *B* 5,
  entrega de 6, devolução de 2 para Estoque (em *P*), excluir → *A* 3, *B* 3 (*B* recebe 1), *P* 2 (da devolução). *(Corrigido na Fase 2,
  achado 3: esta linha dizia "*A* 3, *B* 1" — **estava errada**; *B* tinha 2 e recebe 1.)*
- **RN-259.04** Material com série: **(Fase 2, achado 2)** a quantidade de cada linha vem primeiro das séries ENTREGUE da saída com o
  endereço gravado igual ao da linha (até o que saiu dela); só o que sobra segue a ordem do claim (B1608 — para a série, a série diz de que
  prateleira veio). Depois as séries são repartidas: primeiro, em todas as partes, as de endereço igual; depois as demais na ordem do número.
  Cenário: S1 S2 em *A*, S3 S4 em *B*; saída das 4; devolução de S1 em *P*; excluir → *A* 1 (S2), *B* 2 (S3, S4) — pela ordem do claim
  seria *A* 2 com S3. Quantidade não inteira numa parte com série → a saída faz como hoje (uma ENTRADA só).
- **RN-259.05** Saída **sem registro** (entrega anterior à 257, ou o registro falhou) e o ramo legado (o livro não soma o entregue): como hoje.
- **RN-259.06** O que não muda: as recusas e mensagens da exclusão (séries que não batem, a guarda da 116, a C251, endereço — **menos uma**,
  Fase 2 achado 4: a padrão bloqueada com a entrega tirada de outras prateleiras que aceitam deixa de recusar, porque nada vai para a
  padrão; antes, *"⟨material⟩: Localização ⟨P⟩ está bloqueada"*); a ENTRADA da linha da padrão vai sem destino no livro, como antes
  (Fase 2, achado 5); todas as partes
  validadas antes da primeira ENTRADA; o motivo, a referência, a OS da saída e os vínculos de cada ENTRADA; `estornos` na resposta (por item);
  o UPDATE final e a regra B447/B452 (a gravação que perde depois de mexer em estoque **não** tenta de novo: 409); a liberação das reservas.
- **RN-259.07** (**reescrita na Fase 2, achado 1 — B1609**; dizia "a etapa multiplica as ENTRADAs por saída, não muda a regra" e **estava
  errada**: excluir de novo creditava tudo outra vez, e com uma ENTRADA por prateleira o caso deixou de ser raro) Falha **inesperada** numa
  ENTRADA depois de outra já gravada (disco, erro do motor) deixa o que já entrou creditado com a requisição ativa — a exclusão não tem
  transação. A **nova tentativa** pula, por material e na ordem fixa das partes, o que as ENTRADAs vivas desta exclusão (`requisicao_id`,
  tipo `ENTRADA`, motivo *"Estorno exclusão requisição ⟨número⟩"*) já creditaram. Cenário: entrega de 6 de *A* e *B*, a 2ª ENTRADA falha
  (*A* 3, *B* 2, ativa); excluir de novo → *A* 3, *B* 5, físico 8 (antes: 11). Vale também para duas entregas (antes: 10). Material com série
  fica de fora: a nova tentativa já é recusada pela validação das séries (as que voltaram não estão mais Entregue) — não credita de novo.

## Contratos

- `DELETE /api/almoxarifado/requisicoes/:id` e o `DELETE` de `routes/requisicoesMaterial.js` — resposta igual (`{ success, estornos,
  reservas_liberadas }`), códigos e mensagens iguais. Nenhuma recusa nova.
- Banco: nada novo (lê a tabela da 256/257). Sem consulta de produção (entrega antiga = como hoje) — não vai para a letra A.

## Desenho

No ramo "livro soma o entregue", para cada saída `g` com `liquido > 0`, depois das validações de série de hoje (que produzem `series` e
`destino`): `SELECT d.saldo_id, SUM(d.quantidade) q, MIN(d.id) ordem, s.localizacao_id, s.lote_id, s.material_id FROM
ajuste_linhas_drenadas_almoxarifado d LEFT JOIN estoque_saldo_almoxarifado s ON s.id = d.saldo_id WHERE d.movimentacao_id = ? GROUP BY
d.saldo_id ORDER BY ordem`. Sem linhas → uma parte como hoje. Com linhas: `resto = liquido`; para cada linha `q = min(linha, resto)`; aceita
(existe, mesmo material, `lote_id IS g.lote_id`, endereço não nulo, ativo, `motivoRecusaEndereco` nulo) → parte com destino = endereço; senão
a fatia vai para o destino de hoje. `resto` que sobrar → destino de hoje. Partes agrupadas por destino. Séries repartidas (RN-259.04). O
resto do fluxo (validação de endereço de todas as partes, ENTRADAs, UPDATE) como está.

## Fase 2 (revisor fresco, 20/11) — 2 importantes, 4 menores, 1 anterior, 1 ruído

Sondas executadas numa cópia de `server/` (`git archive HEAD`) com um protótipo do desenho. Cobertos e medidos: FEFO por lote (uma saída
por lote, registro certo), duas entregas parciais e dois itens do mesmo material, saída com origem da separação (uma linha, como hoje), linha
registrada que é a padrão; trava: nada novo, a leitura fica na seção.

1. **[importante]** A falha no meio das ENTRADAs: excluir de novo creditava tudo outra vez (11 em vez de 8; com duas entregas, já antes: 10).
   → **consertado**: a nova tentativa pula o que já entrou (RN-259.07, **B1609**); testes [B1609].
2. **[importante]** Série com devolução: a ordem do claim dava a *A* a série que veio de *B*. → **consertado**: a série primeiro
   (RN-259.04); teste [RN-259.04, Fase 2 achado 2]. *(Sem devolução, a entrega pode ter baixado linhas que não batem com o endereço das
   séries — a Etapa 252; a exclusão devolve as quantidades às linhas e as séries pelo endereço quando cabem — declarado, D (259).)*
3. **[menor]** O cenário da RN-259.03 estava errado → corrigido acima, dizendo que estava errado.
4. **[menor]** Uma recusa some (a padrão bloqueada) → RN-259.06 e B1607; teste [RN-259.06, Fase 2 achado 4].
5. **[menor]** O livro passaria a gravar a padrão por id → a linha da padrão vai `undefined` (já no T1).
6. **[menor]** T3: os mesmos 4 arquivos que o T1 já tinha virado (`entregaAutomaticaPeloLote` passou de volta com o 5).
7. **[anterior]** Devolução de 2, exclusão (físico 8), estorno pelo livro da entrada da devolução → físico 6: a exclusão já tinha descontado
   a devolução. → declarado **C552**.
8. **[ruído]** A44 (c) soma por material; o alerta de mínimo roda uma vez por ENTRADA.

## Fase 5 (revisor fresco, adversarial, 20/11) — 1 importante (declarado), 1 menor (consertado), 2 de cobertura, ruídos

Sondas executadas numa cópia de `server/` (`git archive` de `8b5de9df`).

1. **[importante, anterior com duas entregas; declarado C553]** Depois de uma falha no meio, uma Devolução citando a saída aceita o que a
   exclusão já devolveu: *A* 3, *B* 5, entrega de 6, a 2ª ENTRADA falha, Devolução de 6 → 201, excluir de novo → físico 11 (certo 8). A régua
   do que já voltou (`devolucaoViva.js`, uma só para cinco contas) não conhece a ENTRADA parcial. **Não consertado:** mexe na régua comum; o
   caminho operacional é excluir de novo logo (B1609). Precisa de falha inesperada.
2. **[menor]** Série com devolução parcial e a prateleira de origem bloqueada: a série de *B* caía em *A* pela ordem do claim. →
   **consertado** (`d2d7943b`): a linha que não aceita mais também fica com as séries dela (a parte vai para o destino de hoje).
3. **[cobertura]** Tirar o `ORDER BY ordem` do registro não derrubava nada (as linhas criadas na ordem do claim) → cenário com *B* criada
   antes da padrão (S15).
4. **[cobertura]** Trocar `l.q - l.dado` por `l.q` no laço do claim não derrubava → cenário com uma série gravada em *A* que saiu de *B*
   (S16; o cenário do revisor deixou de alcançar depois do conserto do 2).
5. **[ruído]** Com série, depois da falha a requisição fica presa (a nova exclusão recusa: *"… as series desta entrega nao batem com o que
   falta devolver — use a devolucao"*); nunca credita em dobro. Declarado (D (259)).
- Sabotagens que sobrevivem e não alcançam nada (o revisor conferiu): destino explícito na fusão, o `|| parte.series` do pulo, o teto da
  série, o filtro de material e o de `cancelado` no pulo (a ENTRADA com `requisicao_id` não se estorna pelo livro; nenhuma outra porta grava
  ENTRADA com `requisicao_id`, e a v2 descarta a chave).
- **Tentado e não quebrou:** B1609 com falha na 2ª e na 3ª ENTRADA, dois materiais, três prateleiras; prateleira bloqueada entre as
  tentativas; concorrência (Saída, Transferência, Entrada, entrega e separação de outra requisição do mesmo material disparadas do contexto
  do teste com a exclusão parada antes da 2ª ENTRADA: esperaram a trava; final igual ao serial); lote, negativo, padrão bloqueada.

## Tasks

- [x] **T1 (tronco, motor)** — `e1f4dc82`: `fatiasDaSaidaPorLinha` + a repartição; `exclusaoDevolvePrateleira.api.test.js` (16 no commit; 13
  vermelhos no código de antes). Sabotagens S1-S11 (harness `scratchpad/sab-259-harness.js`, âncora contada, cópia, md5 de volta): cada uma
  derruba o seu cenário, menos S8 (sem conferir a linha nula) e S11 (sem conferir o lote) — **inalcançáveis** (a conferência de material já
  cobre a linha nula; a linha nunca muda de lote); ficam como defesa. A S2 abortou na 1ª vez (âncora 0x depois de uma edição) e foi refeita.
- [x] **T2** integração — no T1: pela rota (separação → entrega → excluir → transferência de 5 a partir de *B*) e pelo serviço.
- [x] **T3** os testes que afirmavam o defeito — no T1: `entregaAutomaticaPeloLoteIntegracao` (T2 serviço: o L1 volta a WB-01),
  `entregaGuardaSemLote` (RN-207.06 controle: a ENTRADA volta a GZ-A), `origemSeparacaoEmDuasVezesIntegracao` (cenário 1 controle: o L1 volta
  a YB-01). Os 46 arquivos de `tests/api` que excluem requisição, um a um: só esses viraram (o `entregaAutomaticaPeloLote` caiu enquanto o
  livro gravava a padrão por id e voltou com a padrão sem destino).
- [x] **T3b** Fase 2 — `8b5de9df` (B1609, a série primeiro, o cenário da RN-259.03 corrigido, a padrão bloqueada). S12, S13.
- [x] **T4** Fase 5 — `d2d7943b` (a série da linha recusada; cenários S14-S16). Teste da etapa: 24.
- [x] **T5** fechamento (fechar-etapa sem 7½ e 8) — o commit de fechamento. Primeiro boot: **não se aplica** (nenhuma tabela nem coluna).

## Divergências do plano

- O plano previa a RN-259.07 como "declarado, anterior; a etapa não muda a regra" — **estava errado** (Fase 2): com uma ENTRADA por
  prateleira a nova tentativa depois de uma falha passou a creditar em dobro numa entrega simples. Virou a B1609 (pular o já creditado).
- A RN-259.04 ganhou a série primeiro (Fase 2) e a série da linha recusada (Fase 5); o cenário da RN-259.03 estava errado no plano.
- A linha da padrão vai sem destino no livro (`undefined`) — o plano não dizia; sem isso três testes de histórico viravam sem motivo.
- **CLAUDE.md:** nenhuma linha ficou errada — a seção das travas diz que a exclusão valida e credita dentro das duas travas (continua), e a
  regra "gravação que perde depois de mexer em estoque não tenta de novo" fala da nova tentativa **automática** (continua: o UPDATE final
  perdido responde 409); a B1609 é a nova exclusão **do usuário** depois de uma falha, e pula o que já entrou.

## Próxima tarefa detalhada

1. **Itens 24, 25 e 26 da estimativa de 18/11 — continuam esperando resposta da empresa.** Caminho reversível de cada um no plano da 253.
   **Não comece sem a resposta.**
2. **Sem resposta, o próximo do almoxarifado: o estorno do Ajuste COM localização olhar o Ajuste do total feito depois** (D (258) 5,
   simétrico da RN-258.07; feature 03 🟢 com pendência). **Medido** (Fase 5 da 258, sonda executada): *A* 5; Ajuste de *A* para 3; Ajuste do
   total para 7; estorno do primeiro → total 9 (a contagem mais recente diz 7). Onde: `stockService.cancelarMovimentacao`, ramo `AJUSTE` com
   `localizacao_destino_id` (o sem localização já tem a consulta da RN-258.07 — `AJUSTE` sem localização ou `AJUSTE_INVENTARIO`, vivo, do
   material, id maior; e o com localização na padrão ou nas drenadas). Caminho reversível: a mesma recusa (literal da RN-258.07) quando há um
   `AJUSTE` sem localização ou `AJUSTE_INVENTARIO` vivo, do material, feito depois; ou um `AJUSTE` com localização na **mesma** posição. Pontos
   de atenção: a ordem das guardas (contagem mais recente → negativo → retenção → lote), o claim do estorno volta pelo catch, e o
   `estornoAjusteForaDeOrdem.api.test.js` como molde. Motor: Fase 2 e Fase 5, ~1h15. Sem fatia visível (declarar).
3. Depois: o **C553** (a Devolução contar a ENTRADA parcial da exclusão — mexe na régua única de `devolucaoViva.js`, cinco contas; só com
   falha inesperada); o C551 só se aparecer na operação; outras 🟡 medidas nos planos da 254 e 255 (agrupamento da Fila — B1600; dupla
   aprovação do Ajuste — espera decisão; lista de separação e kits — fora da estimativa).
- **O que já está pronto e não reabre:** a exclusão devolve às linhas que a entrega baixou (com lote, série, devolução parcial, prateleira
  recusada) e a nova tentativa não credita em dobro; o registro e a devolução do AJUSTE (256) e da Saída (257); o estorno do Ajuste sem
  localização pela diferença (258).

## Verificação (medida)

Rodada em 23/11 sobre `d2d7943b` (a sessão de 20/11 caiu no meio do fechamento; a documentação já estava escrita e não commitada — foi
conferida e commitada junto com esta verificação), cada suíte sozinha:

- `npm run test:api` (`NODE_OPTIONS=--max-old-space-size=4096`): **656/656** arquivos OK.
- `npm run test:almoxarifado`: **44** passou, 0 falhou. `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **16/16**.
- Cliente: `react-scripts test` **240/240** suítes, **3248/3248** testes; `CI=true react-scripts build`: *Compiled successfully*.

## Retro (4 números)

- Rodadas de correção até verde: 3 (T1 — o destino da padrão no livro; Fase 2 — B1609 e a série primeiro; Fase 5 — a série da linha recusada).
- Achados: Fase 2 — 2 importantes (consertados), 4 menores (consertados ou corrigidos no texto), 1 anterior (C552), 1 ruído; Fase 5 — 1
  importante anterior (declarado C553), 1 menor (consertado), 2 de cobertura (cenários), 1 ruído.
- Paralelismo: o revisor da Fase 2 rodou enquanto o T1 era escrito (o protótipo dele achou os mesmos 4 testes; sem retrabalho); o da Fase 5
  em cópia. A suíte inteira foi interrompida uma vez porque o conserto da Fase 5 entrou no meio dela, e rodou de novo do zero.
- Defeito que escapou: (preencher na etapa seguinte). Da 258: nenhum apontado.
