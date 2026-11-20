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

## Tasks

- [ ] **T1 (tronco, motor)** — a repartição na exclusão; teste novo `exclusaoDevolvePrateleira.api.test.js` (TDD: vermelho no código de
  antes; sabotagens com âncora contada, cópia, md5 de volta).
- [ ] **T2** integração — pela rota (`DELETE /api/almoxarifado/requisicoes/:id`, separação → entrega → excluir → uma transferência a partir
  de *B* que antes não cabia) e pelo serviço (`requisitionService.excluirRequisicao`).
- [ ] **T3** os testes que afirmavam o defeito (procurar nos arquivos de exclusão que conferem a linha da padrão depois de excluir).
- [ ] **T3b** Fase 2 (revisor fresco).
- [ ] **T4** Fase 5 (revisor fresco, adversarial, sonda executada; falha forçada; concorrência do contexto do teste).
- [ ] **T5** fechamento (fechar-etapa sem 7½ e 8).
