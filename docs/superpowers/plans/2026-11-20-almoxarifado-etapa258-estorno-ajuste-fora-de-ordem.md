# Etapa 258 — o estorno do Ajuste sem localização desfaz a diferença, não volta a um valor fixo (C550)

> Item único: o **C550** (achado da Fase 2 da Etapa 257; a D (256) 3). A "próxima tarefa detalhada" (item 2) do plano da 257. Estimativa
> `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-estorno-ajuste-fora-de-ordem.md` (1h15, `4f4240bd`). **Não entram:** os itens
> 24, 25 e 26 da estimativa de 18/11 (esperam resposta da empresa).
> **Fatia visível:** não há tela nova — o que muda aparece no total e no saldo por localização depois de **Estornar** um Ajuste que teve
> movimento do material depois dele, e na recusa nova quando o estorno deixaria o material negativo. Declarado (motor puro).

## Fase 0 — medido (sonda executada sobre `e904ba73`, 20/11, `scratchpad/sab-258-sonda.js`, pela rota)

| # | Cenário (material sem negativo, padrão *A*) | Hoje | Pela diferença |
|---|---|---|---|
| 1 | C550: *A* 3, *B* 5; Saída 6; Ajuste para 1; estorno da Saída (7: *A* 3, *B* 4); estorno do Ajuste | total 2, *A* −2, *B* 4 | 8, *A* 3, *B* 5 |
| 2 | *A* 3; Ajuste para 1; Entrada 5 em *B*; estorno do Ajuste | total 3, *A* −2, *B* 5 | 8, *A* 3, *B* 5 |
| 3 | *A* 2; Ajuste para 10; Saída 9; estorno do Ajuste | total 2, *A* 2 (inventa 8) | −7 → recusa |
| 4 | *A* 2, *B* 5; Ajuste para 10 (*A* 5); Saída 5 de *A*; estorno | total 7, *A* 2, *B* 5 (inventa 5) | 2; sem drenar *A* −3 |
| 5 | *A* 3; Ajuste para 7; estorno (nada no meio) | total 3, *A* 3 | o mesmo |

- **Causa:** `cancelarMovimentacao`, ramo `AJUSTE` sem `localizacao_destino_id` (~`stockService.js:3850`): `guardaEstornoAjuste(saldo_anterior,
  atual)` → `UPDATE … SET quantidade_atual = saldo_anterior` → `syncSaldoLocalizacaoPadrao(… { drenar: Boolean(lote_id), devolver })`. O valor
  fixo apaga do total todo movimento do material feito depois do Ajuste; o resíduo (total − as outras linhas) vai para a padrão e, sem lote,
  não drena — a padrão fica negativa.
- O ramo **com** localização já estorna pela diferença (`delta = saldo_posterior − saldo_anterior`, só na linha, total pela soma) e recusa o
  total negativo com *"Não é possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)"*.
- `saldo_anterior` e `saldo_posterior` do livro do AJUSTE sem localização são **totais do material** (antes e depois do Ajuste).
- O manual diz em quatro lugares que o estorno do ajuste "volta o total ao de antes" / "devolve o saldo ao de antes" (3.6, 6.10, 16.2 e 16.8).

## Decisão (B1605)

**Escolhido (a): estornar pela diferença** — novo total = total atual − (saldo_posterior − saldo_anterior), como o ramo com localização. É o
mesmo número de hoje quando nada mexeu no material depois do Ajuste; com movimento depois, mantém esse movimento. Quando a diferença deixaria
o material negativo (cenário 3), **recusa** com a literal do ramo com localização. E o estorno **sem lote** passa a **drenar** as outras
posições sem lote quando a padrão ficaria negativa (cenário 4), como o Ajuste de ida (Etapa 51; o não separado primeiro, Etapa 254) e como
o estorno com lote já fazia (Etapa 253).
**Descartado (b): recusar** o estorno quando houve qualquer movimento do material depois do Ajuste (mandar fazer um Ajuste novo) — trava
estornos que hoje passam (qualquer entrada do material depois do Ajuste travaria), e o (a) dá o número certo sem pedir nada ao operador. **Descartado (c): só a recusa da padrão negativa sem drenar** (como o ramo com localização recusa
quando a linha não comporta) — a padrão aqui não é a posição que o Ajuste indicou; o Ajuste de ida drena, e o operador faria um Ajuste novo
que drenaria do mesmo jeito. Reversível: o cálculo do novo total e o `drenar` são duas linhas.

## Regras de negócio

- **RN-258.01** O estorno do AJUSTE sem localização grava o total `atual − (saldo_posterior − saldo_anterior)` (arredondado, `Q.qtd`). Sem
  movimento depois do Ajuste, é o `saldo_anterior` (o de antes, como sempre). Cenário C550 → total 8, *A* 3, *B* 5; cenário 2 → 8, *A* 3, *B* 5.
  Livro do estorno: `saldo_posterior` = o novo total.
- **RN-258.02** Novo total negativo num material que não permite negativo (nem a configuração global): **400** *"Não é possível estornar: o
  saldo já foi consumido (o estorno deixaria o material negativo)"*, antes de qualquer efeito (o claim volta pelo catch). Material que permite
  negativo: passa e o total fica negativo (a linha padrão leva o resíduo).
- **RN-258.03** (com o achado 1 da Fase 2) A guarda de retenção/caixa vale também no material que permite negativo: o total negativo só
  dispensa a guarda quando o material **não** permite (aí responde a RN-258.02) ou quando nada está retido. Cenário: permite negativo, 2,
  Ajuste para 10, Bloqueio 5, Saída 4, estorno → recusa *"Não é possível estornar: Ajuste para -2 UN deixaria o disponível negativo (…)"* (sem
  isto: total −2 com 5 bloqueados). Vale para os dois ramos (a guarda é a mesma função; no com localização o furo era latente).
  As guardas que já existiam usam o novo total: a de retenção/caixa (`guardaEstornoAjuste`, só quando o estorno reduz) e a do
  lote (`projecaoDoLoteNoAjuste`/`recusaDoLoteNoAjuste`, literal *"o estorno volta o total para ⟨novo total⟩ …"*).
- **RN-258.04** Sem lote, o estorno que deixaria a linha padrão negativa drena as outras posições sem lote (`drenar: true`, a ordem e as duas
  passadas do Ajuste de ida), e as drenadas entram no `compensarLinhasClaim` (o desfazer devolve). Cenário 4 → total 2, *A* 0, *B* 2.
- **RN-258.05** Desfazer: se o livro do estorno falhar, o total (por diferença, `compensarQuantidadeMaterial`), as linhas devolvidas e as
  drenadas voltam, dentro da seção; estado idêntico ao de antes; o estorno de novo, sem a falha, dá o RN-258.01.
- **RN-258.07** (Fase 2, achado 3; **B1606**) Um ajuste do total vivo **feito depois** deste — `AJUSTE` sem localização ou
  `AJUSTE_INVENTARIO`, não cancelado, do mesmo material, id maior — é uma contagem mais recente: o estorno é **recusado** (400) *"Não é
  possível estornar: há um ajuste deste material feito depois deste (movimentação #⟨id⟩) — a contagem mais recente vale. Estorne
  primeiro o ajuste mais recente ou faça um novo ajuste."*, antes de qualquer efeito. Cenário: 5, Ajuste para 3, Ajuste para 7, estorno do 1º
  → recusa (pela diferença daria 9; o SET de antes, 5; a contagem diz 7); estornado o 2º (3), o 1º passa (5). **Fase 5 (achados 1 e 4):**
  também o `AJUSTE` **com** localização feito depois **na posição padrão ou numa posição que este drenou** (o registro da 256) — *A* 5,
  Ajuste para 3, Ajuste de *A* para 10, estorno do 1º → 12 por cima da contagem de *A*; o de outra posição não trava. Com
  `AJUSTE_INVENTARIO` depois (que não se estorna), a literal é *"Não é possível estornar: há uma conferência de inventário deste material
  feita depois deste ajuste (movimentação #⟨id⟩) — a contagem mais recente vale. Faça um novo ajuste."*
- **RN-258.06** O que não muda: o AJUSTE **com** localização; o `AJUSTE_INVENTARIO` (não estorna); a devolução às prateleiras da 256 (o
  `devolver`, limitado pelo resíduo); a mensagem de recusa do lote; o Ajuste de ida.

## Contratos

- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual. Recusas novas no AJUSTE sem localização: **400** `{ error: 'Não é
  possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)' }` (a literal que o ramo com localização já tem);
  **400** a da RN-258.07 (com o id do ajuste mais recente); e, no material que permite negativo com algo retido, a M8 de sempre.
  Ordem: ajuste mais recente (RN-258.07) → negativo (RN-258.02) → retenção/caixa → lote.
- Banco: nada novo. Sem consulta de produção (os estornos já feitos não mudam) — não vai para a letra A.

## Desenho

No `else` (sem localização): `delta = saldo_posterior == null ? null : Q.qtd(saldo_posterior − saldo_anterior)`; `novoTotal = delta === null ?
Q.qtd(saldo_anterior) : Q.qtd(atual − delta)`. Guarda negativa (com `compensacao !== true`), `guardaEstornoAjuste(novoTotal, atual)`, lote com
`novoTotal`, `SET quantidade_atual = novoTotal`, `compensarQuantidadeMaterial = atual − novoTotal`, `saldoDepois = novoTotal`, `drenar: true`.
Travas: nada novo (a seção do material do efeito ao livro, Etapa 118).

## Fase 2 (revisor fresco, 20/11) — 3 importantes, 1 menor, ruídos verificados

Sondas executadas em cópias de `server/` (base `afc8ae66` e com a mudança). Os cinco cenários da Fase 0 bateram; a recusa devolve o claim; o
desfazer com o livro falhando volta idêntico; a devolução da 256 e o drenar não se atropelam; o piso da caixa (254) é respeitado; livro legado
e total que não batia com as linhas saem iguais à base.

1. **[importante]** Com negativo permitido o estorno pulava a guarda de retenção (`guardaEstornoAjuste` saía cedo em todo total negativo):
   permite negativo, 2, Ajuste 10, Bloqueio 5, Saída 4, estorno → 200, total −2 com 5 bloqueados. → **consertado** (RN-258.03; a guarda só
   sai cedo quando o material não permite negativo ou nada está retido); teste [RN-258.03, Fase 2 achado 1].
2. **[importante]** O drenar sem lote faz as prateleiras dependerem da ordem dos estornos: *A* 2, *B* 5, Ajuste 10, Saída 5 de *A*; estorno
   do Ajuste (*A* 0, *B* 2) e depois da Saída → total 7, **A 5, B 2** (na ordem inversa, *A* 2, *B* 5). Sem o drenar, a padrão fica −3 no
   meio. → **mantido o drenar** (a padrão negativa trava a entrega e a caixa; o total fica certo), **declarado C551**, cenário
   *[C551, documenta]*; registrado na B1605.
3. **[importante]** Um Ajuste do total feito depois (uma contagem): 5, Ajuste para 3, Ajuste para 7, estorno do 1º → 9 (base 5; o certo é a
   contagem, 7). → **recusa** (RN-258.07, **B1606**); teste [RN-258.07].
4. **[menor]** Ajuste sem lote num material com saldo só em linhas de lote: o drenar sem lote não as alcança (*A* −3, L1 5). Anterior (a ida
   faz o mesmo). → declarado em D (258).
5. Testes que mudam: os cinco que já tinham virado no T1 (o revisor listou os mesmos e confirmou os valores novos); o T3 do plano não citava
   o `quantidadeArredondada` (já no T1).

## Tasks

- [x] **T1 (tronco, motor)** — `8f0ce1f5`: o cálculo, a recusa do negativo, o drenar sem lote; `estornoAjusteForaDeOrdem.api.test.js` (14 no
  commit; **13 vermelhos no código de antes** — o RN-258.06 é o "como antes"). **Sabotagens S1-S10** (harness `scratchpad/sab-258-harness.js`,
  âncora contada, cópia, md5 de volta ao pós-conserto): valor fixo (13 caem), sem a recusa negativa, sem drenar sem lote, lote e retenção pelo
  valor fixo, desfazer sem o total, ignorar o negativo permitido (do material e da configuração), drenadas fora do desfazer, livro pelo valor
  fixo — cada uma derruba o seu cenário pela asserção certa.
- [x] **T2** integração — no T1: pela rota (v2 + cancelar, e uma Saída de 8 depois cabe) e pelo serviço.
- [x] **T3** os testes que afirmavam o defeito — no T1: o [C550, documenta] da 257 (virou [C550]: 8, *A* 3, *B* 5); quatro do
  `estornoAjusteDevolvePrateleira` (a devolução "parcial" da RN-256.03 era o total errado: 11 / 14 / 13 / *A* 4); o RN-253.14 do
  `ajusteComLoteNaoNegativa` (a Entrada sem lote depois não recusa mais; a recusa ganhou o cenário do lote que saiu depois do ajuste que o
  subiu); a varredura do `quantidadeArredondada` (a escrita absoluta é `novoTotal`). Os 35 arquivos de `tests/api` com AJUSTE e estorno,
  rodados um a um: só esses quatro arquivos caíram, e viraram.
- [x] **T3b** Fase 2 — os achados 1 e 3 consertados, o 2 declarado (C551) — commit "Fase 2". Sabotagens S11-S15: sem a recusa da contagem
  mais recente, a guarda saindo cedo em todo negativo, sem a dispensa do retido 0, contagem que conta o ajuste com localização, contagem
  que conta o cancelado — cada uma derruba o seu cenário (a S12 escrita errada na 1ª vez, parênteses desbalanceados: exit 1 com 0 cenários;
  refeita).
- [x] **T4** Fase 5 — revisor fresco, adversarial, sondas executadas numa cópia de `server/` (commit "Fase 5"). Achados reais:
  (1) **[importante]** a contagem por posição feita depois não travava: *A* 5, Ajuste para 3, Ajuste de *A* para 10, estorno → 12; *A* 5,
  *B* 4, Ajuste para 2 (drena *B*), Ajuste de *B* para 6, estorno → 13 (*B* 8 por cima da contagem 6). → **consertado**: a RN-258.07 conta o
  `AJUSTE` com localização na padrão ou numa posição do registro de drenadas. (2) **[importante, cobertura]** duas sabotagens passavam:
  tirar o `AJUSTE_INVENTARIO` da consulta e tirar a configuração global da guarda de retenção → **cenários novos** (S19, S20). (3) **[menor,
  anterior]** o estorno do Ajuste **com** localização não olha o Ajuste do total feito depois (5 → *A* 3 → total 7 → estorno = 9) → declarado
  (D (258)). (4) **[menor]** com o inventário a mensagem mandava estornar o que não se estorna → **mensagem própria**. (5) **[ruído]** o SET do
  livro sem `saldo_posterior` é inalcançável (coluna `NOT NULL`) — fica como defesa. Tentado e não quebrou: fracionário (0,3/0,1/0,2), lote
  em duas prateleiras, caixa separada (drena o não separado; recusa M8 quando o total fica abaixo da caixa), dois Ajustes nas duas ordens
  com Entrada no meio, falha forçada no `movimento_estorno_id`, na 1ª e na 2ª linha drenada e na escrita final da padrão (estado idêntico, o
  estorno de novo certo), concorrência (Saída, Entrada e Ajuste do material disparados do contexto do teste com o estorno parado: esperaram a
  trava; final igual ao serial), a recusa nova não barra nada legítimo (`AJUSTE` só nasce da movimentação do usuário; `AJUSTE_INVENTARIO`
  só da conclusão da conferência). Sabotagens S16-S20 (sem a padrão, sem as drenadas, mensagem genérica do inventário, sem o inventário,
  guarda sem a configuração global): cada uma derruba o seu cenário. Teste da etapa: 22.
- [x] **T5** fechamento (fechar-etapa sem 7½ e 8) — o commit de fechamento. Primeiro boot: **não se aplica** (nenhuma tabela nem coluna).

## Divergências do plano

- O plano previa só o cálculo pela diferença, a recusa do negativo e o drenar sem lote. A Fase 2 acrescentou a guarda de retenção no
  material que permite negativo (RN-258.03) e a recusa da contagem mais recente (RN-258.07, B1606); a Fase 5 estendeu a RN-258.07 ao Ajuste
  com localização na padrão ou nas drenadas e deu ao inventário a mensagem própria.
- O plano não listava a consequência sobre a 256: a devolução "parcial" da RN-256.03 com movimento no meio era o total errado — com a
  diferença, o limite da devolução é exatamente o que o Ajuste drenou, e a devolução fica inteira (quatro cenários viraram). E o RN-253.14
  (Entrada sem lote depois do Ajuste do lote) deixou de ser recusa.
- O drenar sem lote ficou com um custo declarado (C551): a ordem dos estornos decide as prateleiras.
- **CLAUDE.md:** nenhuma linha ficou errada — a seção das travas não descreve o cálculo do estorno do Ajuste; a leitura nova (o livro e o
  registro de drenadas) roda dentro da seção do material que ela já descreve.

## Próxima tarefa detalhada

1. **Itens 24, 25 e 26 da estimativa de 18/11 — continuam esperando resposta da empresa.** Caminho reversível de cada um no plano da 253.
   **Não comece sem a resposta.**
2. **Sem resposta, o próximo do almoxarifado: a exclusão da requisição devolver às prateleiras de onde a entrega tirou** (D (257) 2).
   **Medido (20/11, leitura):** `requisitionService` ~3401 monta `partes` por saída da entrega com `localizacao_destino_id = origem da saída (se
   aceita) ou padrão` e credita por uma ENTRADA própria (não pelo estorno do livro). O registro das linhas que a entrega baixou já existe desde
   a 257 (`ajuste_linhas_drenadas_almoxarifado` por `movimentacao_id` da SAÍDA da entrega). Caminho: na exclusão, para cada saída com registro,
   uma ENTRADA por linha registrada (posição da linha, a quantidade dela) em vez de uma só; sem registro, como hoje. Pontos de atenção: a
   ENTRADA tem a validação de endereço (ativa, não bloqueada, tipo permitido) que o estorno não tem — decidir se a prateleira bloqueada recebe
   (como a B1604) ou cai na padrão (reversível; letra B); a exclusão roda sob `comTravaDaRequisicao` (trava por requisição → por material; a
   ENTRADA do motor passa direto por `naTravaDoMaterial`); séries (a C251 e a guarda da 116) e lote (a linha registrada tem o lote); o
   desfazer da exclusão (B447/B452: a gravação que perde depois de mexer em estoque **não** tenta de novo). Molde de teste:
   `estornoSaidaDevolvePrateleira.api.test.js` (a entrega) e `exclusaoSerieQueVoltou.api.test.js`. Motor/trava: Fase 2 e Fase 5, ~1h15.
3. Depois: o C551 (a ordem dos estornos troca as prateleiras) só se aparecer na operação; o estorno do Ajuste com localização olhar o Ajuste
   do total feito depois (D (258) 5, simétrico da RN-258.07); outras 🟡 medidas nos planos da 254 e 255 (agrupamento da Fila — B1600; dupla
   aprovação do Ajuste — espera decisão; lista de separação e kits — fora da estimativa).
- **O que já está pronto e não reabre:** o estorno do Ajuste sem localização pela diferença, com as recusas (negativo, contagem mais recente,
  retenção também com negativo permitido) e o drenar sem lote; o registro e a devolução do AJUSTE (256) e da Saída (257).

## Verificação (medida)

- `npm run test:api` (rodado **sozinho**, `NODE_OPTIONS=--max-old-space-size=4096`, sem sabotagem rodando): **655/655 arquivos de teste OK**
  sobre `1663f022` (o mais lento: `entregaGuardaSemLote`, 103,1 s); antes, sobre `3dc41e84`, também 655/655.
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0 (sobre `1663f022`).
- Jest da tela (`--maxWorkers=2`): **240 suítes, 3248 testes**, verdes; `CI=true react-scripts build`: *Compiled successfully* (nenhum arquivo da
  tela mudou; rodados sobre `8f0ce1f5`).
- `estornoAjusteForaDeOrdem` 22/22; os 42 arquivos de `tests/api` com ajuste, inventário e estorno, um a um, depois do T4: 0 vermelhos.
- Primeiro boot: não se aplica (nenhuma tabela nem coluna nova). Nenhum clique no navegador (F (258)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (T1; Fase 2 — retenção e contagem mais recente; Fase 5 — a contagem por posição e o inventário).
- Achados: Fase 2 — 3 importantes (2 consertados, 1 declarado C551), 1 menor (declarado), testes que mudam confirmados; Fase 5 — 1 importante
  no código novo (consertado), 1 de cobertura (2 cenários), 1 menor anterior (declarado), 1 menor de mensagem (consertado), 1 ruído.
- Paralelismo: o revisor da Fase 2 rodou enquanto o T1 era escrito (o T1 já tinha feito a mesma mudança; sem retrabalho); o da Fase 5 em
  cópia enquanto a suíte rodava.
- Defeito que escapou: (preencher na etapa seguinte). Da 257: o C550 já era conhecido (declarado na Fase 2 dela) — nenhum novo.
