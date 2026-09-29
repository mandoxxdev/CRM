# Plano — Etapa 45: a devolução ao fornecedor, e o encaminhamento com status

> **Design:** `docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md`
> **Paga:** o **último** item de "falta para 🟢" da feature 09, o item desmarcado da feature 12, e
> o corte declarado da Etapa 44 (**B174**).
> **Fase 0:** medida em 2026-09-28 (F0-1..F0-6, commit `d187cf7`).
> **Fase 2:** revisor fresco, **13 achados, 5 CRITICAL** — este plano é a versão **corrigida** por
> eles; o que mudou está na seção final.
>
> **Linha de base:** `test:api` **208/208 arquivos** · almoxarifado **42/0** · validation **4/0** ·
> safealter **3/0** · sqlite **5/0** · cliente **52 suítes / 817 testes** · build compilado.

---

## Regras de negócio

Enunciados completos na seção 3 do design, e a **precedência de 10 níveis** é contrato — sem ela,
mais de um caso casa duas regras com mensagens diferentes.

`RN-01` estado de execução · `RN-02` gesto posterior · `RN-03` `DEVOLVER` baixa do bloqueado ·
`RN-04` as outras três não movem · `RN-05` idempotência em **dois** níveis (inspeção + NC) ·
`RN-06` **só NC automática de inspeção baixa saldo** · `RN-07` só NC decidida ·
`RN-08` o cartão exclui o executado **opt-in** · `RN-09` rastro no livro · `RN-10` não estornável ·
`RN-11` três estados conhecidos registram sem mover · `RN-12` lote resolvido · `RN-13` série recusa.

## Sort topológico

| Task | O quê | Tipo |
|---|---|---|
| **T1** | `DEVOLUCAO_FORNECEDOR` no motor: tipo **dedicado**, guarda, claim e compensação | **tronco** |
| **T2** | Ação, colunas de execução (NC **e inspeção**) e `registrarExecucao` | **tronco** |
| **T3** | Rota `POST /:id/executar` + projeção e filtro da listagem | **galho** |
| **T4** | A tela: coluna, filtro e botão | **galho** |
| **T5** | O cartão de reprovados exclui o devolvido — **opt-in** | **galho** |
| **T6** | Integração ponta a ponta | **tronco** |

T1 é tronco sozinho e primeiro (mexe no motor). T2 depende dele. Despachar galhos em lote de no
máximo dois.

---

## T1 — tronco: o tipo de movimento

**Arquivos:** `schema.js` (`TIPOS_MOVIMENTO` **e `TIPOS_DEDICADOS`**), `schemas.js`
(`CAMINHO_TIPO_DEDICADO`), `movementTypes.js` (`TIPOS_SAIDA`), `ownerRules.js`, `stockService.js`,
`movementRules.js`, `server/tests/api/devolucaoFornecedorMotor.api.test.js` (novo).

1. `DEVOLUCAO_FORNECEDOR` em `TIPOS_MOVIMENTO`, **ao lado de `DEVOLUCAO_CLIENTE`**, com o
   comentário dizendo que são irmãs e que as duas são **direção oposta** à devolução da Etapa 7 —
   o código já chama isso de *"a confusão mais provável de quem ler este código depois"*.
2. **`TIPOS_DEDICADOS` (`schema.js:126-135`) — é ISTO que o tira da rota genérica.** ⚠️ A versão
   anterior deste plano mandava deixá-lo *"fora de `TIPOS_MOVIMENTO_ROTA`"*, que é **derivada por
   `filter`** (`schemas.js:58`): não há lista a editar, e o tipo entraria **aberto por default**.
3. Entrada em **`CAMINHO_TIPO_DEDICADO`** (`schemas.js:71`) apontando a tela de Não Conformidades.
   Sem ela a recusa manda o operador para *"as telas de Reservas e Inspeções"* — e `schemas.js:69`
   avisa que **o manual cita estas mensagens literalmente**.
4. `movementTypes.TIPOS_SAIDA` (`:56`) — *"quem criar um tipo novo acrescenta **AQUI, e só aqui**"*.
   ⚠️ **E decidir, por escrito, o efeito derivado:** `clienteEstoqueService.TIPOS_CONSUMO` (`:43`)
   é `TIPOS_SAIDA` menos `DEVOLUCAO_CLIENTE`, então material **de cliente** devolvido ao fornecedor
   passaria a contar como *consumido* na posição dele. **Registrar na letra B.**
5. `ownerRules.js:75-82` — o arquivo **avisa em maiúsculas** que quem cria tipo de saída tem de
   decidir se ele entra em `TIPOS_SAIDA_COM_DONO` ou em `TIPOS_ISENTOS_DONO`. **Decisão: isento**,
   com a razão escrita — o material reprovado volta para quem o entregou; não é aplicá-lo em
   trabalho de ninguém. Omitir seria cair fora por acidente.
6. Flag `baixandoBloqueado`, espelhando `baixandoTerceiro` (`stockService.js:598`).
7. Claim atômico com as **duas** condições no `WHERE` (`quantidade_bloqueada >= ?` **e**
   `quantidade_atual >= ?`), molde de `PERDA_TERCEIRO`. A recusa **diz o número** (lição da Etapa 7,
   escrita na literal do `RETORNO_TERCEIRO`).
8. **Compensação: ramo novo em `reverterFisicoDaSaida` (`stockService.js:999`)**, espelho do de
   `baixandoTerceiro` (`:1085`). ⚠️ **`retencaoAplicada` fica `null` para este tipo** — a versão
   anterior deste plano pedia os dois, e eles são **mutuamente exclusivos**: juntos compensam **em
   dobro** (bloqueada volta a 6 para uma reprovação de 3).
9. `movementRules`: `{ vinculo: 'nenhum', justificativa: true }`.
10. Recusa de estorno em `cancelarMovimentacao`, casando por **`tipo`** — mais forte que casar por
    motivo, como a RN-12 da 44 teve de fazer por o tipo dela não ser dedicado.
11. `tiposDescarte` (`stockService.js:775`): entra, senão lote **vencido** trava a devolução do
    próprio lote vencido — beco que a Etapa 7 já pagou. **Mas continua sujeito à guarda de status
    do lote.**

**Cenários:** baixa tira dos dois lugares · bloqueado insuficiente recusa **com o número** ·
físico insuficiente recusa · a guarda *"Material bloqueado não pode ser utilizado"* **não** barra
este tipo **e continua barrando `SAIDA_PRODUCAO`** (metade positiva) · **a v2 recusa o tipo e a
mensagem nomeia a tela de Não Conformidades** · estorno recusado · **falha depois do claim: o
estado volta ao ANTERIOR, com igualdade exata** (`atual === 100 && bloqueada === 3`, nunca `>=` —
senão a compensação dupla passa verde) · material de cliente não vira "consumido".

## T2 — tronco: o estado de execução

**Arquivos:** `permissions.js`, `schema.js`, `nonConformityService.js`, `auditLabels.js`,
`server/tests/api/encaminhamentoExecucao.api.test.js` (novo).

1. Ação `executar_encaminhamento: [ADMINISTRADOR, QUALIDADE, COMPRAS]`, com o comentário dizendo
   que **a concessão a COMPRAS é condicionada à RN-06** — sem ela, `registrar_nao_conformidade` +
   esta ação dariam a Compras meia porta para apagar estoque.
2. Colunas na NC: `execucao_estado`, `execucao_em`, `execucao_por_id`, `execucao_por_nome`,
   `execucao_observacoes`, `execucao_movimentacao_id`.
3. **Coluna na INSPEÇÃO: `devolucao_fornecedor_em`** (molde de `liberacao_nc_em`) — é a trava que
   impede duas NCs da mesma inspeção baixarem o mesmo material duas vezes. ⚠️ A versão anterior
   punha a trava só na NC, contra o que a spec 09 **já tinha escrito com a razão**.
4. Backfill do `execucao_estado` nas NCs já decididas (`PENDENTE` quando a decisão pedir), com
   comentário explicando por que é o **oposto** do backfill da 44 — senão parece incoerência.
5. `registrarExecucao` com a precedência de 10 níveis e a ordem da seção 4 do design da 44:
   resolver e calcular → claim da inspeção → motor → rollback do claim se o motor falhar.
6. Rótulo `NC_EXECUTADA` em `auditLabels.js` — sem ele `auditLabels.api.test.js` **derruba a suíte**.

### ✅ T2 — feita (`f8ab433`)

`encaminhamentoExecucao.api.test.js`, **19 cenários, 19/19**. Suítes: `test:api` **210/210
arquivos** · almoxarifado **42/0** · validation **4/0** · safealter **3/0** · sqlite **5/0**.

**Divergências e medições da execução:**

| # | O que o plano dizia | O que a execução mediu |
|---|---|---|
| 1 | 7 literais na tabela de efeitos | faltava **uma**: NC automática de inspeção cuja inspeção deixou de ter reprovada (a decisão da inspeção é reescrevível). Sem literal própria isso caía no `NENHUMA` genérico — *"esta execução não altera o saldo"*, verdade que **não diz nada** no único caso em que o usuário esperava a baixa. Acrescentada como `SEM_SALDO_SEM_REPROVADA`, com a razão no código e na seção 5 do design |
| 2 | backfill precisa de barreira como o da 44 | **não precisa, e o motivo é a direção**: o da 44 carimba para **trancar** (re-executá-lo tranca inspeção recente, em silêncio, sem volta); este carimba para **destrancar**, e o `WHERE execucao_estado IS NULL` o torna inofensivo por construção. Cenário (16) prende os dois lados — inclusive que ele **não rebaixa** uma `EXECUTADA` |
| 3 | (nada) | o rollback do motor devolve a NC a **`PENDENTE`**, e **não** desfaz a decisão — ao contrário da 44, onde a liberação é fatal para a decisão. Aqui a decisão foi de outra pessoa, outro dia, e continua valendo. Cenário (14) prende, e prova que o estado volta **usável** (executar de novo funciona) |

**Controles positivos — 8 sabotagens, e as duas primeiras caíram na asserção ERRADA:**

| Sabotagem | Cai | Asserção |
|---|---|---|
| desligar a RN-06 (as **duas** camadas) | (6), (7) | ⚠️ primeiro caiu em `efeito === 'NENHUMA'` — a asserção de saldo **nunca rodava**. Só com a segunda sabotagem, que faz o código **mentir** (relata `NENHUMA` e roda o motor), o teste caiu em *"a NC manual mexeu no fisico"* e `7 !== 10` |
| claim da inspeção sem `IS NULL` | (8) | ⚠️ idem — caiu em `efeito`. A versão que mente (roda o motor e relata `JA_DEVOLVIDA`) derruba em *"a segunda NC baixou o fisico de novo"*, `14 !== 17` |
| rollback **só** do claim da inspeção | (14) | *"o claim da inspecao ficou orfao"* |
| rollback da NC deixando `EXECUTADA` | (14) | *"a NC nao voltou para a fila"* |
| nível 7 (lote) desligado | (12) | a mensagem vira a do motor (*"exige lote nesta movimentacao"*) — **medição**: a segunda tranca (`exigeLote`) é real, o furo é de **mensagem**, não de saldo |
| nível 6 (série) desligado | (13) | *"devolveu material com controle de serie"* — nenhum erro é levantado |
| backfill sem `execucao_estado IS NULL` | (16) | *"o backfill rebaixou uma execucao ja registrada"* |
| `decidir` sempre `PENDENTE` | (1) | *"ACEITAR deveria nascer NAO_SE_APLICA"* |

**Cenários:** os sete efeitos da tabela · 409 na segunda execução · 400 em NC aberta e cancelada ·
400 na decisão de aceitação · **RN-06: NC manual e NC de origem RECEBIMENTO não baixam saldo** ·
**RN-05: duas NCs de tipos diferentes da MESMA inspeção — a segunda não move saldo** · os três
estados da RN-11 · RN-12 (lote resolvido; e sem lote resolvível recusa) · RN-13 (série recusa) ·
rollback quando o motor falha · trilha com o verbo novo · a movimentação com número e motivo.

## T3 — galho: a rota e a fila

`POST /:id/executar`; `execucao_estado`/`execucao_em` na projeção; filtro `?execucao=PENDENTE`.

**Cenários:** matriz de perfis **inteira** — ⚠️ **a linha que importa é COMPRAS PODE**, porque é
ela que distingue esta ação de `decidir_nao_conformidade`; sem ela o teste passaria com a ação
pendurada na outra · **COMPRAS executando NC manual recebe 200 com `NENHUMA` e o saldo não se
move** (é a linha que prova que a B169 continua valendo) · 403 não move saldo · o filtro traz o
pendente **e não traz** o executado, **nem NC `ABERTA`, nem `CANCELADA`**.

### ✅ T3 — feita (`dc629e1`)

`encaminhamentoRotas.api.test.js`, **8 cenários, 8/8**. `test:api` **211/211 arquivos**.

**Divergência:** o filtro ganhou `AND nc.status = 'DECIDIDA'` junto, que o plano não pedia.
`execucao_estado` fica `NULL` em NC `ABERTA` e `CANCELADA`, então a igualdade sozinha já as
excluiria **hoje** — mas "hoje" é o acidente de o backfill só ter carimbado as decididas. Uma NC
cancelada **depois** de decidida conserva o `PENDENTE` que a decisão gravou (cancelar não limpa a
coluna) e voltaria à fila cobrando execução de documento morto. O cenário (7) **confere** que ela
conserva o `PENDENTE` antes de afirmar que a fila a exclui — sem essa conferência ele mediria
outra coisa e passaria verde à toa.

**Controles positivos:** conceder `executar_encaminhamento` ao ALMOXARIFE derruba (1b) e (2)
nomeando o perfil (é a **única** prova da lista negativa — `can()` devolve `false` para o que não
conhece, então ela passa verde até com a ação inexistente); pendurar a rota em
`decidir_nao_conformidade` derruba (1) e (3) com COMPRAS levando 403; tirar a cláusula de status
derruba (7) em *"NC CANCELADA depois de decidida entrou na fila"*.

⚠️ **E uma sabotagem NÃO SABOTOU na primeira tentativa:** o padrão `perl` não casava as aspas
escapadas do SQL dentro da string JS, e a suíte seguiu verde. Lida sem conferência, a conclusão
seria *"a cláusula está protegida"* — **falsa**. Foi pega por conferir o arquivo depois de
aplicar, que é exatamente a razão de a regra do `md5`/`grep -c` existir.

### ⚠️ O QUE A T3 E A T2 DEIXARAM QUEBRADO, E SÓ A T4 MEDIU

**O commit da T2 (`f8ab433`) deixou a suíte do client VERMELHA, e eu reportei a T2 e a T3 como
fechadas citando só os números do servidor.** `permissaoErro.test.js:52` varre `ACAO_PERFIS` e
exige rótulo em `client/src/utils/permissaoErro.js` para toda ação; `executar_encaminhamento`
nasceu sem o dele e a guarda acusou `semRotulo = ["executar_encaminhamento"]` — **sétima
ocorrência** desse buraco nesta base.

A guarda existe desde a Etapa 30 e **funcionou**. Quem falhou foi a medição: a `fechar-etapa`
lista **cinco** comandos, e eu rodei os três de servidor depois da T2 e da T3. Dizer "210/210" e
"211/211" não era mentira, mas era **resposta a uma pergunta menor que a que eu tinha dito estar
respondendo**. Consertado dentro da T4 (`0305acc`); registrado aqui porque suíte vermelha entre
dois commits é o tipo de coisa que some do histórico se ninguém escrever.

**Regra que fica:** ação nova em `ACAO_PERFIS` é mudança de **duas pontas**, e o commit que cria
a ação tem de rodar a suíte do client.

## T4 — galho: a tela

Coluna **Execução**, filtro *Pendentes de execução*, botão **Registrar execução**.

⚠️ **ARMADILHA NOMEADA:** o cenário `(21)` (`NaoConformidadesAlmoxarifado.test.js:536-537`) tem
duas asserções **negativas** que a Etapa 44 deixou para o C57 não voltar. A redação natural do
texto novo (*"o material continua bloqueado até a execução"*) **derruba** a asserção. **Mantenha as
duas negativas e escreva sem essas palavras** (*"segue retido até a execução ser registrada"*).
Apagar a negativa para o teste passar desfaz a proteção da etapa anterior.

### ✅ T4 — feita (`0305acc`)

`NaoConformidadesAlmoxarifado.test.js`, **12 cenários novos (22)-(33)**, arquivo em **33/33**.
Suíte do client inteira **829/829 em 52 arquivos**; `CI=true npx react-scripts build` →
*Compiled successfully*, sem warning.

**Divergências e medições da execução:**

| # | O que o plano/briefing dizia | O que a execução mediu |
|---|---|---|
| 1 | o teste fica em `__tests__/NaoConformidadesAlmoxarifado.test.js` | **não existe `__tests__/` neste módulo**: o arquivo é irmão do componente, em `client/src/components/almoxarifado/`. As linhas 536-537 da armadilha estavam certas |
| 2 | (nada) | **a suíte do CLIENT já estava VERMELHA quando a T4 começou**, por causa do commit de SERVIDOR da T2: `executar_encaminhamento` entrou em `ACAO_PERFIS` e não tinha rótulo em `client/src/utils/permissaoErro.js`, então `permissaoErro.test.js:52` acusava `semRotulo = ["executar_encaminhamento"]`. Medido **antes** de qualquer edição. É a **sétima** ocorrência deste buraco; a guarda da Etapa 30 funcionou — quem atrasou foi o rótulo. Corrigido no mesmo commit, e o cenário (30) prova que ele **chega à tela**, não só ao mapa |
| 3 | a armadilha era o parágrafo do modal | **era, e pelo mesmo motivo de novo**: ele afirmava *"devolver não cria a devolução"* — verdade até a T3 e mentira depois dela. Corrigido com *"segue retido"*; as duas negativas do (21) ficaram intactas e **repetidas** no (32), junto com uma terceira (`not.toContain('não cria a devolução')`) |
| 4 | (nada) | **`?execucao` não é filtro independente**: o serviço soma `AND status = 'DECIDIDA'` (`nonConformityService.js:1146`). Com o status padrão da tela ("Abertas") a fila devolveria lista vazia **sempre**, e a tela afirmaria "não há nada pendente" sem ter medido nada. Os dois selects passaram a se sincronizar (letra B abaixo) |

**Decisões reversíveis (letra B), com o que foi descartado:**

1. **Os dois filtros se sincronizam** — escolher um estado de execução põe o status em "Decididas";
   escolher outro status larga a fila. *Descartado:* deixar os selects independentes e explicar a
   lista vazia com um aviso — seria a regra 2 do cabeçalho do componente (a tela afirmando ausência
   que não mediu) entrando pela porta do filtro.
2. **Este botão some por PERFIL**, ao contrário do de decidir — e continua falhando **aberto**
   (`pode()` devolve `true` enquanto `minhas-permissoes` não voltou). Razão: `executar_encaminhamento`
   é a única ação desta tela cuja plateia (COMPRAS) **não** é a de quem decide (QUALIDADE).
   *Descartado:* mostrar sempre e deixar o 403 falar, como faz o botão de decidir.
3. **Observações opcionais**, ao contrário da justificativa da decisão: aqui se declara um FATO
   físico. *Descartado:* exigir texto — produziria "ok" digitado.

**Controles positivos — 18 sabotagens, todas vermelhas na asserção que guarda o achado:**

| Sabotagem | Cai | Asserção |
|---|---|---|
| vazio (NC não decidida) renderiza "Pendente" | (22) | `toBe('—')` — recebeu `"Pendente"` |
| `NAO_SE_APLICA` vira traço | (22) | `toContain('Não se aplica')` |
| executada sem autor nem data | (22), (31) | `toContain('Marina Prado')` — recebeu `"Executada—"` |
| `execucao` fora da query | (23) | `params` sem o campo |
| a fila não acerta o status | (23), (31) | `status: 'ABERTA'` no lugar de `'DECIDIDA'`; e (31) ficou com **0 linhas** |
| o status não larga a fila | (23) | `execucao` sobrevivendo em `{ limite, status: 'ABERTA' }` |
| o botão ignora o perfil | (24) | `botaoExecutar(...)` **definido** com `mockPodeExecutar = false` |
| o botão ignora o estado de execução | (24) | o botão apareceu na linha `NAO_SE_APLICA` |
| POST em `/decidir` | (25), (26) | a URL da chamada |
| corpo sempre com `observacoes` | (26) | `toHaveBeenCalledWith(url, {})` |
| o toast cala `execucao.mensagem` | (27) | recebeu `"…registrada!"` sem a literal |
| concatenação sem o `?.` | (28) | recebeu `"…registrada! undefined"` |
| erro genérico no lugar da literal | (29), (30) | recebeu `"Erro ao registrar a execução"` |
| a ação sem rótulo em `permissaoErro.js` | **(30) e `permissaoErro.test.js`** | *"Sem permissão para **executar encaminhamento**"* (o fallback) |
| a fila não é largada depois de executar | (31) | `execucao` ainda na query da recarga |
| o modal de execução com texto igual para toda decisão | (33) | `toContain('não movimenta estoque')` num `SUCATEAR` |
| parágrafo velho inteiro de volta | (32) | ⚠️ **caiu na asserção ERRADA** — `toContain('execução')`, **antes** da negativa. O controle não valia |
| ↳ o texto NOVO carregando a afirmação velha junto | (32) | `not.toContain('não cria a devolução')` — **esta** é a que guarda o achado |

**Cenários:** os quatro estados da coluna · o filtro manda `execucao` e leva o status junto (e a
volta) · o botão só em DECIDIDA+PENDENTE e some sem a ação · o POST com observações aparadas · o
corpo vazio quando não há observação · os **cinco** efeitos do servidor no toast, inclusive os que
**não** movem saldo · resposta sem `execucao` não mostra `undefined` · 409 literal · 403 traduzido
com o rótulo novo · executar com a fila ligada **não** esconde a linha · o parágrafo do modal de
decisão fala do segundo gesto **sem** ressuscitar o C57 · o modal de execução muda de texto conforme
a decisão.

### Próxima tarefa detalhada: T5 — o cartão de reprovados

Fica **inteira em `server/`** (`alertRegistry.js` / `listarReprovados`), e o contrato que ela
consome é o desta T4 apenas de leitura: `execucao_estado = 'EXECUTADA'` **e** `decisao = 'DEVOLVER'`
é a régua, e nada mais. Pontos de atenção já escritos acima, na descrição da T5: a flag
`excluirComExecucao` é **opt-in** e liga **só** no `listar` da entrada do cartão — **nunca** no modo
`{ inspecaoId }`, que é o gancho do ato (excluir por dentro calaria o gancho a partir da segunda
escrita, erro **medido** na Etapa 43, `alertRegistry.js:415-425`).

## T5 — galho: o cartão de reprovados

⚠️ **Esta task foi REESCRITA — a premissa dela era falsa.** O cartão **não** cobra para sempre
(janela de 7 dias) e o e-mail **já saiu** no instante da reprovação (dedupe por inspeção). Ver F0-4.

1. Flag **`excluirComExecucao` opt-in** em `listarReprovados`, ligada **só** no `listar` da entrada
   do cartão — **nunca** no modo `{ inspecaoId }`, que é o **gancho do ato**. Excluir por dentro
   calaria o gancho a partir da segunda escrita: erro **medido** na Etapa 43
   (`alertRegistry.js:415-425`).
2. A régua casa **só** NC com `execucao_estado = 'EXECUTADA'` **e** `decisao = 'DEVOLVER'`.

**Cenários:** o devolvido sai **e o pendente continua** · **o gancho do ato continua avisando no
modo `{inspecaoId}`** · **execução de `SUBSTITUICAO` NÃO silencia o cartão** (ela não devolve nada).

### ✅ T5 — feita (`7c9bd1f`)

`alertaReprovadoExecutado.api.test.js`, **7 cenários**. `test:api` **213/213** · almoxarifado
**42/0**. Seis controles positivos, cada um na asserção que guarda o achado — e **uma sabotagem
que não aplicou** (regex `perl` falhou, suíte verde), tratada como **controle inválido, não como
prova**, e refeita por `sed`. É a segunda ocorrência do mesmo padrão nesta etapa.

**Duas divergências do que o briefing dizia:**

| # | Briefing | Medido |
|---|---|---|
| 1 | o comentário-molde de `excluirComNC` está em `:415-425` | está em **`:139-152`**; `:415-425` é a entrada do registro, não a função |
| 2 | (nada sobre `status`) | **`status` ficou FORA da régua**, decisão do executor, com a razão escrita: hoje o único escritor de `CANCELADA` cancela NC `ABERTA`, e se um dia cancelar uma executada, o material **saiu do galpão do mesmo jeito** |

⚠️ **A divergência 2 é uma assimetria deliberada com a T3, e as duas precisam ser lidas juntas.**
A T3 pôs `AND status = 'DECIDIDA'` na fila `?execucao=PENDENTE`; a T5 **não** pôs a condição
equivalente no cartão. Não é incoerência: a fila **cobra ação futura**, e cobrar de documento
morto é ruído que treina o operador a ignorar a fila; o cartão **relata um fato consumado**, e o
material devolvido não volta a existir porque alguém cancelou o papel. Se um dia `CANCELADA`
passar a alcançar NC executada, é a **fila** que continua certa e o **cartão** que precisa ser
reavaliado — não o contrário.

**Consequência declarada pelo executor:** o `listar` é um só para a central e para a varredura
diária (RN-01), então a rede de segurança da varredura também para de enfileirar a devolvida.
Caso perdido estreito (exigiria o gancho ter virado `console.warn` **e** a execução cair dentro
dos mesmos 7 dias). Descartado: dois `listar` separados.

## T6 — tronco: integração

Receber crítico → reprovar com `DEVOLVER` → a NC nasce → decidir → **conferir que o material NÃO
saiu** (é a RN-02, e é o que distingue esta etapa da 44) → registrar execução com **COMPRAS real**
→ o material sai do físico **e** do bloqueado, a linha do **lote** é debitada e a de lote `NULL`
não fica negativa → o cartão para de cobrar → o pedido de compra **continua Recebido** (corte
declarado, fixado por teste).

### ✅ T6 — feita (`a5b800c`)

`devolucaoFornecedorIntegracao.api.test.js`, **3 cenários, 3/3**. `test:api` **213/213** ·
almoxarifado **42/0** · client **52 suítes / 829 testes** · build compilado sem warning.

**Divergência:** *"o cartão para de cobrar"* **não** entrou neste arquivo. A T5 já o prova ponta a
ponta, pela entrada do registro **e** por `montarCentral` (cenário 7 dela), e repetir aqui seria
uma segunda cópia da mesma medição — que é como as listas replicadas deste módulo começaram.

**Controles positivos — e os DOIS primeiros caíram na asserção errada.** A asserção que guarda a
RN-02 (*"a DECISÃO baixou o físico"*) está **atrás de duas outras**: qualquer sabotagem que mova o
material na decisão muda junto `liberacao.efeito` e `execucao_estado`, então o cenário caía por
elas e a de saldo **nunca rodava**.

| Sabotagem | Cai | Asserção |
|---|---|---|
| `DEVOLVER` dentro de `DECISOES_QUE_LIBERAM` | (1) | ⚠️ `efeito === 'NENHUMA'` — a de saldo não roda |
| decisão chamando `registrarExecucao` em silêncio | (1) | ⚠️ `execucao_estado === 'PENDENTE'` — idem |
| **motor chamado PELA LATERAL na decisão**, sem tocar em `efeito` nem em `execucao_estado` | (1) | ✅ *"a DECISAO baixou o fisico — o sistema afirmaria uma remessa que nao aconteceu"*, `7 !== 10` |
| sem `lote_id` **e** sem `exigeLote` | (1) | *"a linha do lote nao caiu de 10 para 7"* — com `lote_id` sozinho o motor ainda recusa, o que **mede** que a segunda tranca da RN-12 é real |
| tipo fora de `TIPOS_DEDICADOS` | (3) | *"a rota generica aceitou o tipo"*, 201 com o saldo movido |
| `UPDATE` artificial baixando `quantidade_recebida` | (2) | *"a devolucao baixou `quantidade_recebida` do pedido"* — a fixação do corte está viva, não é comentário |

**A lição, pela terceira vez nesta etapa:** placar vermelho não é prova. A asserção decisiva
precisa ser alcançável por **alguma** sabotagem — e quando ela está atrás de outras, a sabotagem
tem de ser a que faz o código **mentir sobre o que fez**.

---

## Fase 5 — o que a revisão adversarial tem de atacar

1. A flag `baixandoBloqueado` desliga duas guardas — algum outro caminho a alcança?
2. A precedência de 10 níveis: algum caso casa duas regras, ou nenhuma?
3. "Este teste passaria com a feature quebrada?" — em especial os cenários da RN-05, RN-06 e T5.
4. O backfill oposto ao da 44 cria fila retroativa **zerável**?

---

## O que a Fase 2 mudou neste plano

| # | O que eu tinha escrito | Por que estava errado |
|---|---|---|
| 1 | *"fora de `TIPOS_MOVIMENTO_ROTA`"* | a lista é **derivada**; o opt-out é `TIPOS_DEDICADOS`, e o default é **aberto** |
| 2 | `retencaoAplicada` **e** claim no `try` | **mutuamente exclusivos** — juntos compensam em dobro |
| 3 | trava de idempotência na NC | a spec 09 **já escrevera** que tem de ser na inspeção, com a razão |
| 4 | (nada) | faltava a irmã da RN-09 da 44 — NC manual baixaria **patrimônio** |
| 5 | *"o cartão cobra para sempre"* | **falso**: janela de 7 dias, e-mail já saiu, e a exclusão calaria o gancho do ato |
| 6 | (nada) | lote e série não eram citados uma vez — saldo de lote `NULL` negativo e invariante de série quebrado |
| 7 | 3 arquivos | faltavam `movementTypes`, `ownerRules` e `schemas`, e um efeito derivado em material de cliente |
| 8 | 4 literais | faltavam as de origem `RECEBIMENTO` (o caso **mais comum**) e de físico insuficiente |

---

## Estado

- [x] T1 — tronco (motor) — `a425559`
- [x] T2 — tronco (estado de execução) — `f8ab433`
- [x] T3 — rota e fila — `dc629e1` · [x] T4 — tela — `0305acc` · [x] T5 — cartão — `7c9bd1f`
- [x] T6 — integração — `a5b800c`
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
