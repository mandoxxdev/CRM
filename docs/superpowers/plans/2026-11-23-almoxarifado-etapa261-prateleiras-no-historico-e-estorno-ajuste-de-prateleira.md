# Etapa 261 — O histórico diz de quais prateleiras a peça saiu, e o estorno do Ajuste de prateleira respeita a contagem mais recente

> Itens **4** e **5** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, commitada em
> `d7e6afb9` — a estimativa da semana inteira, 1h + 1h15; não refeita). A "próxima tarefa detalhada" do plano da 260.
> **Fatia visível:** o item 4 (a linha da Saída e do Ajuste no histórico de Movimentações ganha *"Saiu de: A-01 3 · B-02 3"*). O item 5 é
> motor puro (a recusa nova aparece ao clicar em **Estornar**).

## Fase 0 — medido

### Item 5 (sonda executada sobre `74dd633c`, 23/11, `scratchpad/sab-261-sonda.js`, pela rota)

| # | Cenário (padrão *A*, material sem negativo) | Hoje | Certo |
|---|---|---|---|
| 1 | *A* 5; Ajuste de *A* para 3; Ajuste do total para 7; estorno do 1º | 200, total **9**, *A* 9 | recusa (a contagem diz 7) |
| 2 | *A* 5; Ajuste de *A* para 3; Ajuste de *A* para 6; estorno do 1º | 200, total **8**, *A* 8 | recusa (a contagem de *A* diz 6) |
| 3 | *A* 5, *B* 4; Ajuste de *A* para 3; Ajuste de *B* para 2; estorno do 1º | 200, 7 (*A* 5, *B* 2) | o mesmo (outra prateleira) |
| 4 | *A* 5; Ajuste do total para 7 **antes**; Ajuste de *A* para 3; estorno | 200, 7 (*A* 7) | o mesmo (a contagem é anterior) |

- **Causa:** `stockService.cancelarMovimentacao`, ramo `AJUSTE` **com** `localizacao_destino_id` (~3809): desfaz a diferença na linha
  (*loc*, lote) e recalcula o total pela soma, sem olhar se uma contagem mais nova já disse quanto há. O ramo **sem** localização tem a guarda
  desde a 258 (RN-258.07, B1606, ~3877).
- O Ajuste com localização define **a linha** (*loc*, `lote_id`) (`registrarMovimentacao` ~2430); o `AJUSTE_INVENTARIO` é sempre do total
  (`routes/almoxarifado.js:2108`, sem localização) e não se estorna.

### Item 4 (leitura)

- `ajuste_linhas_drenadas_almoxarifado` (`schema.js:1610`, `movimentacao_id, saldo_id, quantidade`, índice por movimento) recebe: na **Saída**
  (todo `TIPOS_SAIDA`), as linhas que a baixa tirou — exatamente o que saiu (Etapa 257); no **AJUSTE sem localização**, só as **outras**
  linhas que ele drenou — a parte que saiu da linha padrão **não** está lá (Etapa 256, `drenadasDoAjuste`). Gravado depois do livro, não-fatal.
- Só o estorno (`stockService` ~3744/3936) e a exclusão (`requisitionService` ~3387) leem a tabela.
- `GET /api/almoxarifado/movimentacoes` (`routes/almoxarifado.js:1389`) devolve `m.*` + nomes; a tabela de `MovimentacoesAlmoxarifado.js`
  (~796) **não tem coluna de endereço nenhuma** — nem a origem escolhida à mão aparece.

## Decisões

- **B1614 (item 5)** — o estorno do Ajuste **de prateleira** é recusado quando, depois dele, há, vivo, do mesmo material: um `AJUSTE` **sem**
  localização (do total), um `AJUSTE_INVENTARIO`, ou um `AJUSTE` **da mesma linha** (mesma prateleira **e** mesmo lote). O de outra prateleira,
  ou de outro lote na mesma prateleira, **não** trava (ele contou só a linha dele; o cenário 3 dá o número certo). Mensagens: as literais da
  RN-258.07. **Descartado:** travar com qualquer ajuste posterior do material (barraria o cenário 3, que está certo); travar só com o do total
  (deixaria o cenário 2). **Reversível:** é a consulta.
- **B1615 (item 4)** — *"Saiu de"* aparece sempre que a movimentação tem o registro (mesmo uma prateleira só — a tabela não mostra endereço
  nenhum hoje); no Ajuste do total, além das prateleiras drenadas, a parte que saiu da posição padrão (o que o Ajuste baixou menos o drenado)
  aparece como *"posição padrão"*, sem código (o endereço padrão da época não é gravado; o de hoje pode ser outro). **Descartado:** só com mais
  de uma prateleira (esconderia a prateleira da Saída automática, que é o caso da D (252) 1); gravar o endereço no livro (B1581: mudaria o
  estorno). **Reversível:** é a condição na tela e a soma na rota.

## Regras de negócio

- **RN-261.01** O estorno de um `AJUSTE` com localização é recusado (400), antes de qualquer efeito (o claim volta pelo catch), quando existe
  movimento **vivo** (`cancelado = 0`), do mesmo material, de **id maior**, que seja: `AJUSTE_INVENTARIO` → *"Não é possível estornar: há uma
  conferência de inventário deste material feita depois deste ajuste (movimentação #⟨id⟩) — a contagem mais recente vale. Faça um novo
  ajuste."*; ou `AJUSTE` sem localização, ou `AJUSTE` com a mesma `localizacao_destino_id` e o mesmo `lote_id` (`IS`) → *"Não é possível
  estornar: há um ajuste deste material feito depois deste (movimentação #⟨id⟩) — a contagem mais recente vale. Estorne primeiro o ajuste mais
  recente ou faça um novo ajuste."* O id citado é o **maior** que casa. Cenários 1 e 2 → recusa, nada muda; estornado o mais recente, o
  primeiro passa (cenário 1: o estorno do Ajuste do total volta para 3, e o do 1º para 5).
- **RN-261.02** Não trava: o Ajuste de outra prateleira, o de outro lote na mesma prateleira, a contagem **anterior** (cenário 4), a
  contagem já estornada, e a Saída/Entrada/Transferência depois (o estorno pela diferença continua). Compensação interna
  (`compensacao: true`) não passa pela guarda (como a RN-258.07).
- **RN-261.03** `GET /api/almoxarifado/movimentacoes` ganha, em cada movimento, `prateleiras: [{ localizacao_id, codigo, quantidade }]` —
  aditivo; `[]` quando não há registro (movimento antigo, Entrada, Transferência, Estorno…). Soma por `localizacao_id` (linhas de lotes
  diferentes na mesma prateleira somam), na ordem do registro. Linha sem endereço (ou apagada): `localizacao_id: null, codigo: null`.
- **RN-261.04** No `AJUSTE` sem localização **com** registro, entra mais uma parte `{ localizacao_id: null, codigo: null, padrao: true,
  quantidade: (saldo_anterior − saldo_posterior) − soma do registro }` quando ela é > 0 (o que saiu da linha padrão). Sem registro: `[]`.
- **RN-261.05** Tela: na coluna *Quantidade*, abaixo do número, *"Saiu de: ⟨codigo⟩ ⟨qtd⟩ · …"* (`data-testid="mov-prateleiras"`), com
  *"sem endereço"* para `codigo: null` e *"posição padrão"* para `padrao: true`. Sem `prateleiras` (ou vazio): nada (como hoje).
- **RN-261.06** Uma consulta para a página inteira (sem N+1), em blocos de até 500 ids.

## Contratos

- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual; recusas novas (400) as da RN-261.01. Ordem no ramo com localização:
  contagem mais recente → retenção (`guardaEstornoAjuste`) → linha que não comporta → negativo.
- `GET /api/almoxarifado/movimentacoes` — cada linha ganha `prateleiras` (RN-261.03/04). Nada sai do contrato.
- Banco: nada novo. Sem consulta de produção (letra A não se aplica).

## Fase 2 (revisor fresco, 24/11 — a primeira rodada foi cortada pelo limite de uso; refeita sobre o código já escrito)

Sonda `scratchpad/fase2-261-sondaR.js` (pela rota, `:memory:`). Literais e ordem das recusas conferidas; nenhum chamador interno estorna
AJUSTE com localização (só Saída/Entrada em `epiService`, `scrapService`, `thirdPartyService`); galhos independentes.

1. **[importante, anterior, reproduzido]** O Ajuste de **outra** prateleira pode reescrever a linha deste por `absorverNegativosSemLote`:
   padrão *A*, Entrada 5, Entrada 10 em *B*/L1, Ajuste de *A* para 3, Saída de 5 sem lote (*A* −2), Ajuste de *B*/L1 para 0 (total 0, *A* −2 → 0);
   estorno do Ajuste de *A* → 200, total **2** (sem ele, 0). → **declarado** (D (261) 1). A RN-261.02 dizia, sem exceção, que a outra
   prateleira "dá o número certo" — **estava incompleta**. Conserto exigiria gravar as linhas que o Ajuste com endereço **absorve** (o registro
   de hoje é de quem **baixa**); raro: material sem negativo, linha sem lote negativa e saldo em lote.
2. **[menor, reproduzido]** RN-261.04 com a padrão que **sobe** (negativa, material que permite negativo): *A* −2, *B* 5, Ajuste para 1 →
   *"Saiu de: B 4"* num total que caiu 2; Ajuste **para cima** que drenou → *"Saiu de: B 1"*. → **consertado**: quando a parte da padrão dá
   negativa, o Ajuste fica sem *"Saiu de"* (`[]`); cenário [RN-261.04, Fase 2 achado 2]; sabotagem R8.
3. **[menor]** Total que não batia com as linhas (legado): a parte "posição padrão" leva o que nunca teve endereço. → declarado (D (261) 2).
4. **[menor]** Ajuste do total que só baixou a padrão (sem drenar) não tem registro e fica sem *"Saiu de"*. → declarado (D (261) 3; guia).
5. **[ruído]** Ajuste sem localização com lote feito depois trava (certo); o id citado é o maior; `saldo_id` não se reaproveita
   (AUTOINCREMENT), linha não muda de endereço, registro que falhou → `[]` (omite, não mente).

**Achado da integração (não da revisão):** os 42 arquivos com ajuste e estorno, um a um, derrubaram o **J5 da Etapa 104** (caixa de 4 em *A*,
Ajuste de *A* para 0, Ajuste de *A* para 3, estorno do primeiro → 7). Pela RN-261.01 o estorno passa a ser recusado; o caminho é o da recusa,
um Ajuste novo de *A* contando a caixa (7, sem aviso) — **B1616**. O aviso A1 da 104 ainda manda *"estorne o ajuste que baixou o estoque"*;
com um ajuste da mesma prateleira depois, isso é recusado (**C554**). Teste atualizado em `61ead3b6`.

## Tasks

- [x] **T1 (tronco, motor)** item 5 — `125db383`: `recusarSeContagemDepois` (a consulta da RN-258.07 virou função, com a condição da linha
  por ramo) e a chamada no ramo com localização; `estornoAjustePrateleiraContagem.api.test.js` 11 no commit (**6 vermelhos no código de
  antes**, os 5 "não trava" verdes nos dois). Sabotagens **S1-S9** (harness `scratchpad/sab-261-harness.js`: âncora contada = 1, cópia,
  md5 antes/sabotado/restaurado): sem a guarda, sem o lote, sem a prateleira, a mais antiga, a estornada contando, a guarda na compensação,
  o inventário com a mensagem de ajuste, sem o inventário, sem o Ajuste do total — cada uma derruba o seu cenário pela asserção certa.
- [x] **T2 (galho, leitura)** item 4 — `caff2759`: `anexarPrateleirasDaBaixa` na rota; `movimentacoesPrateleirasDaSaida.api.test.js` (6 no
  commit). Sabotagens **R1-R7** (sem anexar, sem a padrão, padrão 0, agrupar por linha, só o 1º bloco, ordem por código, padrão também na
  Saída) — a R7 não derrubava nada na 1ª rodada (a conta dá 0 numa Saída íntegra): ganhou o cenário do registro menor que a quantidade.
- [x] **T3 (galho, tela)** — `334752a7`: `MovimentacoesPrateleirasDaSaida.test.js` (3; **3 vermelhos antes**). Sabotagens **F1-F5**.
- [x] **T4 integração** — `a4c40e2a` (no arquivo da rota): Saída de *A* e *B*, Ajuste de *B*, Ajuste do total, o estorno do de *B* recusado,
  o da Saída devolve a cada prateleira, o histórico intacto. Controle positivo: sem a guarda (I1) e sem anexar (I2), cai.
- [x] **T4b** — `61ead3b6`: os 42 arquivos de `tests/api` com AJUSTE e estorno, um a um: só o J5 da 104 caiu (B1616, C554; ver Fase 2).
- [x] **T5** Fase 2 — `87a7ef3f` (achado 2 consertado; sabotagem R8). **T6** Fase 5 — `6b18d4de` (abaixo).
- [x] **T7** fechamento (fechar-etapa sem 7½ e 8) + Passo 7¼ — o commit de fechamento e o do estimado × realizado. Primeiro boot: **não se
  aplica** (nenhuma tabela nem coluna).

## Fase 5 (revisor adversarial fresco, 24/11, sondas executadas em cópia de `server/`)

1. **[importante, reproduzido]** O claim do estorno (`cancelado = 1`) roda **fora** da trava do material, e a guarda filtrava `cancelado = 0`:
   dois estornos juntos (*A* 5, Ajuste de *A* para 8, para 10, Saída 6) — o do mais recente faz o claim e espera; o do mais antigo o lê como
   cancelado e passa; o do mais recente falha depois (*"a localização não comporta"*) e volta. Final: o antigo estornado com o recente vivo,
   total 1 (o certo, 2). **16/30** rodadas sem forçar nada (`fase5-261-corrida2.js`), **17/30** no ramo **sem** localização (anterior, desde
   a 258; `corrida3`) — reproduzido por mim no repositório antes do conserto. → **consertado** `6b18d4de`: "vivo" = `NOT estornoConcluidoSql`
   (a régua de `devolucaoViva.js`); 30/30 certas nos dois ramos. Cenário determinístico (a trava segura pelo teste, os dois estornos
   disparados do contexto do teste — molde do CLAUDE.md), nos dois ramos; 5 rodadas seguidas, 14/14. Sabotagem S10 (o `cancelado = 0` de
   antes) derruba os dois. Preço: enquanto o estorno do mais recente roda, o do mais antigo é recusado e a pessoa tenta de novo.
2. **[menor, cobertura]** A fronteira sem lote × com lote na mesma prateleira não tinha cenário: duas sabotagens passavam → cenário novo;
   S11 e S12 derrubam.
3. **[ruído]** `GET /movimentacoes` com 5002 movimentos e 10000 linhas de registro, sem `limit`: ~113 ms contra ~86 ms sem as prateleiras;
   com `limit=200` (a tela), 7 ms nos dois.
- Tentado e não quebrou: a recusa devolve o claim inteiro (`cancelado`, `cancelado_por`, motivo, `regularizacao_pendente`) e não grava
  ESTORNO; **falha forçada** (trigger no INSERT do ESTORNO): 500, estado idêntico, a 2ª tentativa certa; Ajuste de *A* disparado junto com
  o estorno do Ajuste de *A*: 30/30 iguais ao serial; Ajuste sem localização com lote depois trava (é do total); Transferência para *A* depois
  passa pela diferença; o mascaramento de EPI não toca os códigos de prateleira; filtros, `limit` e o portão iguais.

## Divergências do plano

- O plano previa só a guarda e a leitura. A integração dos 42 arquivos achou o J5 da 104 (B1616, C554); a Fase 2 tirou o *"Saiu de"* do
  Ajuste em que a padrão sobe; a Fase 5 trocou o "vivo" da guarda (os dois ramos — mexe também na RN-258.07 da 258).
- A RN-261.02 dizia, sem exceção, que a outra prateleira dá o número certo — **estava incompleta** (Fase 2, achado 1; D (261) 1).
- **O plano e o primeiro rascunho dos documentos diziam "Ajuste escolhendo a prateleira *A*" na tela — estava errado:** a tela de
  Movimentações não oferece prateleira no Ajuste (`TIPOS_COM_DESTINO` = Entrada e Transferência; o manual 3.6 já dizia "a contagem por
  posição é feita pela integração"). Os roteiros do guia e das novidades dizem agora "pela integração".
- A primeira rodada da Fase 2 foi cortada pelo limite de uso e refeita sobre o código; a base de `test:api` (658/658, abaixo) rodou
  enquanto o T1 era escrito — os arquivos do fim da fila já carregaram a guarda nova.
- **CLAUDE.md:** nenhuma linha ficou errada — a seção das travas não descreve a guarda da contagem; a leitura nova roda dentro da seção do
  material que ela já descreve, e o claim provisório fora da trava já estava descrito.

## Próxima tarefa detalhada

Os itens **6 e 7** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`), juntos numa etapa — o
mesmo ramo do `cancelarMovimentacao` (a entrada de uma devolução):

1. **Item 6 — o estorno da devolução para Quarentena desfaz o bloqueio (C239, B761; 1h15, motor).** A devolução para Quarentena grava duas
   pernas (`returnService.js` ~332: `ENTRADA_DEVOLUCAO` + `BLOQUEIO`, as duas com `referencia DEV-<id>`, sob a trava do material). O estorno da
   entrada (`stockService.js` ~3294, `devolucaoDaEntrada`) só olha o destino `SUCATA` (`entradaDaSucata`, a guarda da 117) e as séries; o
   `BLOQUEIO` fica de pé e o disponível fica a menos. Caminho reversível a decidir por sonda (letra B): **(a)** estornar a perna do bloqueio
   junto, dentro da mesma seção do material, com o desfazer dela no catch (CLAUDE.md: "uma seção só vai do efeito ao livro", Etapa 118), ou
   **(b)** recusar como a Sucata, mandando estornar o bloqueio antes (literal no molde de `mensagemEntradaDaSucata`). O (b) é o mais barato e o
   mesmo padrão da Sucata; o (a) é o que o operador espera. Pontos de atenção: o bloqueio pode já ter sido desbloqueado em parte (a guarda
   *"o bloqueio já foi desfeito"* do estorno de BLOQUEIO, lote incluído — manual 15.3); as séries da quarentena; a caixa (o desbloqueio só cabe
   no livre fora da caixa). Molde de teste: o da guarda da Sucata (grep "C237" em `tests/api`) e `devolucaoDoQueVoltou.api.test.js`.
2. **Item 7 — o estorno da entrada de uma devolução de requisição já excluída é recusado (C552; 1h).** Mesma leitura `devolucaoDaEntrada`
   (`movimentacao_saida_id`): se a saída citada é a entrega de uma requisição **excluída** (a exclusão já descontou a devolução — Etapa 259),
   recusar **antes do claim**, com uma literal que diga o caminho (um Ajuste). Medir na Fase 0 como a exclusão marca a requisição e se a saída
   da entrega fica estornada (`cancelado`) ou só ganha a ENTRADA da exclusão. Atenção à ordem com a guarda da Sucata e à `compensacao: true`
   (não passa).
- Motor/estorno: Fase 2 e Fase 5 com sonda executada e falha forçada, como nesta.
- **O que já está pronto e não reabre:** o *"Saiu de"* na tela Movimentações; a guarda da contagem mais recente nos dois ramos do estorno do
  Ajuste, com o "vivo" = estorno concluído.

## Verificação (medida sobre o código final, `6b18d4de`)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **660/660 arquivos OK** (o mais lento: `propostaClausulasGrava`, 70,8 s).
  Base antes de começar (sobre `74dd633c`, com o T1 sendo escrito no meio): **658/658**.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`, sobre `334752a7`; a tela não mudou depois): **244/244 suítes, 3270/3270 testes**.
- `CI=true npx react-scripts build`: **Compiled successfully.**
- `estornoAjustePrateleiraContagem` 14/14 (5 rodadas seguidas), `movimentacoesPrateleirasDaSaida` 8/8, `estornoAjusteForaDeOrdem` 22/22,
  `ajusteEnderecoCaixaIntegracao` 5/5; os 42 arquivos com ajuste e estorno, um a um, depois do T1: só o J5 caiu (atualizado).
- Primeiro boot: não se aplica. Nenhum clique no navegador (F (261)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (T1/T2/T3; Fase 2 — a padrão que sobe e o J5 da 104; Fase 5 — o claim provisório).
- Achados: Fase 2 — 1 importante anterior (declarado), 1 menor consertado, 2 menores declarados, ruídos verificados; Fase 5 — 1 importante
  (consertado, também no ramo da 258), 1 de cobertura (cenário novo), 1 ruído (desempenho medido).
- Paralelismo: nenhum galho em paralelo (mesma árvore, em sequência); os revisores rodaram em paralelo com o trabalho. A sabotagem do
  harness rodou enquanto a Fase 2 sondava o repositório — risco de contaminar a sonda dela; nenhum achado dela dependeu disso (os
  reproduzidos foram refeitos por mim).
- Defeito que escapou: (preencher na etapa seguinte). Da 260: nenhum apontado.
