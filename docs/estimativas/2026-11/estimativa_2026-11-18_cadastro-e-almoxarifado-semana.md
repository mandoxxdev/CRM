# Estimativa 18/11/2026 — cadastro de material e almoxarifado (29h; revisada para 28h30 em 18/11, item 3; e para 28h, item 4)

Pedido do André (18/11/2026): previsão das próximas alterações do cadastro de produto; se somarem pouco, completar com o
almoxarifado. **Primeira estimativa na régua nova** da skill `estimativa-de-tarefas` (passo 3, 18/11/2026): tempo informado =
execução prevista na régua do `horas.js`, **sem** a parte fixa de análise + teste (a regra anterior estava errada: a semana de
08-14/11 somou 91h45 estimadas para 29 h medidas).

Régua conferida em 18/11/2026 com `node .claude/skills/relatorio-semanal/scripts/horas.js --semana 2026-11-10 --grupos
"E211=Etapa 211;E212=Etapa 212;E214=Etapa 214;E216=Etapa 216;E230=Etapa 230;E233=Etapa 233;E236=Etapa 236;E237=Etapa 237"`:
E211 1,8 h · E212 0,9 h · E214 1,8 h · E216 0,6 h (cadastro no Compras, ~1h a 1h30) · E230 0,9 h · E233 0,7 h · E236 0,8 h · E237
1,1 h (fatias do almoxarifado, ~45 min a 1h; motor/trava/estorno 1h15 a 1h30).

Partes: **Cadastro de material 1h15 · Almoxarifado 23h15 · Dependem de resposta 4h30 = 29h.** Revisada (item 3, Etapa 244): Almoxarifado 22h45, total **28h30**. Revisada (item 4, Etapa 245): Almoxarifado 22h15, total **28h**.

## Tabela

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Medido no código (18/11) | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Explicação do CA; Nº/Validade do CA só para tipo EPI | 1h15 | cadastro no Compras (E216 0,6 h; a lista de tipos hoje traz só nomes — falta trazer `is_epi`) | 1h15 | Etapa 238 (`2026-11-18-compras-etapa238-ca-so-para-epi.md`) | `MaterialAlmoxarifadoForm.js:925-934` (`ca_numero`, `ca_validade`); `useCategoriasMaterial(rotas.api.tiposMaterial)` `:127` devolve só nomes; `tipos_material_almoxarifado.is_epi` (`schema.js:592`). Caminho: legenda + campos só com tipo EPI; valor gravado continua (campo escondido, não apagado) | 0,7 h (horas.js 18/11, grupo CA) | 45 min | `2827bf94`, `44a3d6ae`, `5f206303` |
| 2 | Devolução Quarentena/Sucata de peça com série grava o lote | 1h15 | motor (E233/E234 0,7 h + Fase 0 por sonda) | 1h15 | resto da D (233) 3 — plano 236 "Próxima tarefa detalhada" | `returnService.js:326-375` (ENTRADA_DEVOLUCAO, BLOQUEIO, SUCATA sem `lotePelasSeries`); `returnService.js:162` (série nesses destinos é limitação declarada) — a sonda da Fase 0 decide se há buraco; sem buraco, fecha com o teste | 0,8 h (horas.js 18/11, grupo Quarentena series) | 1h | `ca5da1d6`, `d3a59a77`, `e17aa7b1` |
| 3 | Retalho de peça com série: ~~baixa do original grava o lote~~ **revisado: aviso antecipado na janela** (Etapa 244) | ~~1h15~~ 45 min | ~~motor~~ fatia de tela (E236 0,8 h) + teste de rota | ~~1h15~~ 45 min | Etapa 244 (`2026-11-18-almoxarifado-etapa244-retalho-peca-com-serie.md`) | `scrapService.js:342` (SAIDA do original), `:362`; **sonda (Fase 0, 244): a baixa de origem com série é recusada antes de mover desde a Etapa 9** (`scrapService.js:281`) — não há lote a gravar | 0,5 h (horas.js 18/11, grupo Retalho series) | 30 min | `40c6e9f5`, `c73db29d`, `7bcb8f5c`, `70d02d59` |
| 4 | Devolução ao fornecedor (NC) de peça com série: ~~grava o lote~~ **revisado: aviso antecipado na janela Registrar execução + o caminho completo na recusa** (Etapa 245) | ~~1h15~~ 45 min | ~~motor~~ fatia de tela + leitura (molde: Etapa 244, 0,5 h) | ~~1h15~~ 45 min | Etapa 245 (`2026-11-18-almoxarifado-etapa245-devolucao-fornecedor-peca-com-serie.md`) | `nonConformityService.js:1397` (nível 6, RN-13: recusa antes de mover); **sonda (Fase 0, 245): a execução recusa a série antes de mover qualquer coisa — não há lote a gravar; o caminho que a recusa ensina ("dê baixa pela tela de Movimentações") é recusado com tudo reprovado (*"Saldo insuficiente. Disponível: 0 UN"*) e, com parte reprovada, deixa a peça boa presa no bloqueio** | 1,2 h (horas.js 18/11, grupo Fornecedor series) | 1h15 | `296e5bab`, `4f52e829`, `f1235e25`, `c3ea407d`, `82bfc4f8` |
| 5 | Saída com lote valida a prateleira do lote, não a padrão (C543 no motor) | 1h30 | motor, toda saída sem origem | 1h30 | C543 + D (236) 1; o aviso da Etapa 237 (B1542) muda junto | `stockService.js:1565` `validarLocalizacaoParaMovimento(resolveLocalizacaoSaida(...))`; `claimSaldoDoLote` baixa onde o lote está | 0,9 h (horas.js 18/11, grupo C543) | 1h | `e21132d1`, `9e33f948`, `d9171d1d` |
| 6 | Escolher a origem na devolução ao cliente | 1h | fatia de tela (E236 0,8 h) | 1h | D (236) 1, B1541 | `MateriaisClienteAlmoxarifado.js` (janela); a rota já aceita `localizacao_origem_id` pelo motor (só preferida: a Etapa 240 a fez estrita) | 0,6 h (horas.js 18/11, grupo Origem devolucao cliente) | 45 min | `81c9ed15`, `077ca21f`, `fb01d574`, `db9096cb` |
| 7 | Seletor de lote mostra reservado e livre | 1h | fatia de tela + leitura | 1h | C542 | `lotService.listarLotesDoMaterial:593` (`saldo` = físico do lote); seletores da devolução ao cliente e de Movimentações | 0,5 h (horas.js 18/11, grupo C542 com "Etapa 241" — dois commits da tela e da Fase 5 não citavam a C542 no assunto) | 30 min | `6e3a496a`, `0cc2141d`, `0989e7e3`, `5719afb7` |
| 8 | Aviso de material de cliente reservado para OS | 45 min | fatia de tela (E237 1,1 h com fixture; esta sem campo novo de servidor se a posição já trouxer a reserva) | 45 min | C541 (Etapa 242, `2026-11-18-almoxarifado-etapa242-aviso-reservado-para-os.md`) | molde do aviso `#dev-loc-bloqueada` da Etapa 237 | 0,9 h (horas.js 18/11, grupo C541) | 1h | `d4edb6bc`, `423613d7`, `3f42ece3`, `8e84fea8`, `03185e2f` |
| 9 | Frase do lote das séries só quando o lote tem a peça | 45 min | fatia de tela | 45 min | C539, B1531 | frase de Movimentações lê só a série; o servidor deriva o lote só quando a linha cobre (`stockService.js:1379`) — **confirmado na Fase 0 da 246**; a lista de séries não trazia o saldo do lote (campo novo de leitura) | 0,35 h (rateio da Etapa 246: 0,7 h medida no horas.js, grupo E246="Etapa 246", pelos 45 min + 45 min estimados) | 30 min | `4bf9fe15`, `522ded97`, `509d6902`, `48580e4d` |
| 10 | Lista de séries da saída avulsa recarrega após recusa | 45 min | fatia de tela | 45 min | C538 (molde: entrega, C537) | Movimentações → Saída/Perda — **confirmado na Fase 0 da 246** (só o Ajuste relia, `MovimentacoesAlmoxarifado.js` `catch` do envio) | 0,35 h (rateio da Etapa 246, como o item 9) | 30 min | `fcc7b076`, `509d6902`, `48580e4d` |
| 11 | Reserva da liberação repartida por nota | 1h15 | motor/estorno | 1h15 | C524, B1467 (Etapa 247, `2026-11-18-almoxarifado-etapa247-liberar-lote-de-mais-de-uma-nota.md`) | liberação de lote (Etapa 220) + conta do estorno da nota — **confirmado na Fase 0 da 247** (sonda: lote de duas notas → reserva sem marca → os dois estornos recusados) | 1,3 h (horas.js 18/11, grupo C524) | 1h30 | `5ac930cf`, `7305080c`, `493cfeba`, `0e163246`, `b01e30ae` |
| 12 | Estorno da nota sob a trava (C525 + C534) | 1h30 | trava/estorno | 1h30 | C525, C534, B1506 (Etapa 248, `2026-11-18-almoxarifado-etapa248-estorno-da-nota-sob-a-trava.md`) | a conta do estorno que solta reservas roda fora de `naTravaDoMaterial` — **confirmado na Fase 0 da 248** (sonda com gancho: 0/4 — o estorno recusado no meio da liberação do lote; a requisição solta com o lote liberado no meio) | 1,3 h (horas.js 19/11, grupo C525) | 1h30 | `d7da2ad1`, `99a2fabf`, `2bdc900f` |
| 13 | Busca de entrega na tela Devoluções | 1h15 | tela + servidor (o C477 dizia ~1h30 na régua antiga) | 1h15 | C477, B1367 | `returnService.js:486-495` (páginas de 30, cursor `antes_de`) | — | — | — |
| 14 | Bloquear material indicando o lote | 1h30 | motor (BLOQUEIO com lote; regra "o lote tem livre para bloquear") | 1h30 | C500, B1419 (Etapa 249, `2026-11-19-almoxarifado-etapa249-bloquear-indicando-o-lote.md`) | `extended.js:1302` (`/materiais/:id/bloquear`); Etapa 209 já grava lote no BLOQUEIO da devolução — **confirmado na Fase 0 da 249** (o serviço não lia `lote_id`; teste vermelho 0/14) | 0,675 h (rateio da Etapa 249: 0,9 h medida no horas.js 19/11, grupo C500 — os commits do pacote citam C500 —, pelos 1h30 + 30 min estimados) | 45 min | `9ef32392`, `55b78b37`, `7fd033c9`, `20ed25bb`, `df6054f3` |
| 15 | Mensagem própria na liberação pela NC | 30 min | frase | 30 min | C501 (Etapa 249) | `nonConformityService.js` `executarLiberacao` `:1047` — **confirmado na Fase 0 da 249** (a aceitação recebia *"Informe o lote…"*) | 0,225 h (rateio da Etapa 249, como o item 14) | 30 min | `9ef32392`, `df6054f3` |
| 16 | Entrega diz quantas peças do lote estão bloqueadas | 45 min | fatia de tela | 45 min | C514, B1440 (Etapa 250, `2026-11-19-almoxarifado-etapa250-entrega-e-fila-sabem-do-lote-preso.md`) | janela de entrega (Etapa 218 já mostra quanto pode sair do lote) — **confirmado na Fase 0 da 250** (o automático não dizia nada; sem campo novo de servidor) | 0,35 h (rateio da Etapa 250: 0,7 h medida no horas.js 19/11, grupos C514 + C517 — o fechamento cita os dois e caiu no C514 —, pelos 45 min + 45 min estimados) | 30 min | `9c85f727`, `122d7e68`, `a0fbec62` |
| 17 | Sugestão da fila lê a conta do lote preso | 45 min | fatia (o C517 diz "pequeno") | 45 min | C517 (Etapa 250) | dica "pegar em XB-01, lote L1" da Fila — **confirmado na Fase 0 da 250** (teste vermelho: a dica mandava pegar 2 no lote com 1 livre e a separação recusava) | 0,35 h (rateio da Etapa 250, como o item 16) | 30 min | `69c3f581`, `6dfb6905`, `a0fbec62` |
| 18 | Ajuste com lote limita a baixa ao saldo do lote | 1h15 | motor (o C475 dizia ~1h30 na régua antiga) | 1h15 | C475, B1357 | ramo de Ajuste do `registrarMovimentacao`; só pela movimentação nova (integração) | — | — | — |
| 19 | Frase própria para o excesso de dois itens na mesma prateleira | 30 min | frase | 30 min | C497, B1415 (Etapa 252, `2026-11-19-almoxarifado-etapa252-endereco-da-troca-frase-do-irmao-e-serie.md`) | recusa de saldo da entrega (Etapa 208) — **confirmado na Fase 0 da 252** (sonda: "O saldo em A (1) não cobre a quantidade (3)") | 0,16 h (rateio da Etapa 252: 0,9 h medida no horas.js 20/11, grupo E252="Etapa 252" — os commits citam os três itens —, pelos 45 + 30 + 90 min estimados) | 30 min | `b8ccaf79`, `73b0a9d9`, `e56365df`, `b1878c87` |
| 20 | Teto dividido entre itens que disputam o mesmo lote | 1h | fatia de tela (molde: separação, Etapa 127) | 1h | C489, B1395 (Etapa 251, `2026-11-19-almoxarifado-etapa251-entregavel-dividido-e-lote-da-separacao.md`) | detalhe e Fila — **confirmado na Fase 0 da 251** (sonda: 3 e 3 no detalhe e na Fila, a entrega dos dois recusada) | 0,49 h (rateio da Etapa 251: 1,1 h medida no horas.js 19/11, grupo E251="Etapa 251" — os commits citam C489 e C491/C518 juntos —, pelos 1h + 1h15 estimados) | 30 min | `9fc00300`, `9877c01c`, `9c66b95c` |
| 21 | Entregável do detalhe sem a parte de lote impedido/peça presa (C491 + C518) | 1h15 | fatia de tela + leitura | 1h15 | C491, C518 (Etapa 251) | teto da B1395 soma a parte guardada sem olhar o lote — **confirmado na Fase 0 da 251** (C491 só com o resto do material guardado; C518: o número já batia sem lote impedido, o defeito era o um clique) | 0,61 h (rateio da Etapa 251, como o item 20) | 45 min | `9fc00300`, `9877c01c`, `e8a79383`, `256bada6`, `9c66b95c` |
| 22 | Endereço na troca para o automático | 45 min | fatia | 45 min | C495 (Etapa 252) | bloco Substituições do detalhe — **confirmado na Fase 0 da 252** (sonda: saiu todo de B, troca "automático") | 0,25 h (rateio da Etapa 252: 0,9 h medida no horas.js 20/11, grupo E252="Etapa 252" — os commits citam os três itens —, pelos 45 + 30 + 90 min estimados) | 30 min | `b326b672`, `0c524552`, `b1878c87` |
| 23 | Série respeita a peça separada do irmão (material sem lote) | 1h30 | motor; **medido só pela descrição** ("conserto não medido") — reestimar na Fase 0.5 se a sonda mostrar mais | 1h30 | C493, B1404 (Etapa 252) | teste `[RN-207.02 c]` reproduz — **estava errado**: ali a baixa não leva a separação; **a sonda da Fase 0 da 252 reproduziu** com A toda guardada (série B1 baixando A; o irmão "não serve mais"); não revisado | 0,49 h (rateio da Etapa 252: 0,9 h medida no horas.js 20/11, grupo E252="Etapa 252" — os commits citam os três itens —, pelos 45 + 30 + 90 min estimados) | 30 min | `89665967`, `e56365df`, `b1878c87` |
| 24 | Tirar o campo Aplicação — **depende de resposta** | 30 min | tirar um campo | 30 min | fila do Compras, item 7 | `MaterialAlmoxarifadoForm.js:934-938`; `camposLidos.js:34` fica (a coluna `aplicacao` continua) | — | — | — |
| 25 | Nº de série + nº de controle (etiqueta) obrigatórios — **depende de resposta** | 1h30 | cadastro + regra de obrigatório (legado editável) | 1h30 | pedido 12/11, img4 (não salva) | `FerramentasAlmoxarifado.js:296,306,1048` (`codigo_patrimonio` já obrigatório; `numero_serie` opcional) | — | — | — |
| 26 | Especificações/Observações — **depende de resposta** | 1h | cadastro | 1h | pedido 12/11, img6 | `MaterialAlmoxarifadoForm.js:939-948`; colunas `especificacoes`, `observacoes` ficam | — | — | — |
| 27 | Material da sobra/remessa: aviso "cadastro a completar" no Compras — **depende de resposta** | 1h30 | cadastro no Compras + marca na criação | 1h30 | B74 (Compras), Etapa 193 | `SobrasAlmoxarifado.js:320`, `RemessasTerceirosAlmoxarifado.js:314` (POST `/almoxarifado/materiais`, formato restrito) | — | — | — |

**Correção (18/11, Etapa 238):** a linha 1 dizia "falta trazer `is_epi`" — **estava errado**: a lista de tipos já trazia `is_epi` (`SELECT *`); só o hook
`useCategoriasMaterial` o descartava. Nenhuma mudança de servidor.

**Etapa 239 (item 5, 18/11):** entregue no tamanho estimado; além da validação, a entrega automática por lote passou a deixar por último o lote
guardado só em prateleira bloqueada e a posição do cliente ganhou um campo de leitura (Fases 2 e 5). Medido 0,9 h → 1h.

**Etapa 240 (item 6, 18/11):** entregue no tamanho estimado; além do campo, a origem escolhida passou a ser estrita na devolução (a rota só a
preferia) e a leitura de saldos diz o endereço bloqueado. Medido 0,6 h → 45 min.

**Etapa 241 (item 7, 18/11):** entregue no tamanho estimado; o "reservado" virou o **livre** do lote (a reserva não tem lote — C526), e a revisão
achou três casos em que o número divergia do sistema (saldo negativo global, separado com negativo, linha negativa antiga), corrigidos. Medido
0,5 h → 30 min.

**Etapa 242 (item 8, 18/11):** 15 min acima do estimado. A posição **não** trazia a reserva (a régua previa "sem campo novo de servidor se a
posição já trouxer"): ganhou o livre e as reservas por OS, a revisão pediu o projeto da reserva e a fixture da posição usada pelos testes da
tela foi regravada. Medido 0,9 h → 1h.

**Etapa 243 (item 2, 18/11):** 15 min abaixo do estimado. Havia buraco (sonda da Fase 0): a devolução avulsa para Quarentena **e para
Estoque** deixava a peça "sem lote" — as duas foram corrigidas (a mesma entrada). A **Sucata não mudou** (a série não se move nela; B1551):
o texto "Quarentena ou Sucata" do item vale como Quarentena e Estoque. Medido 0,8 h → 1h.

**Etapa 244 (item 3, 18/11):** revisado antes de fazer (1h15 → 45 min, `a4409686`): a sonda mostrou que o retalho não baixa peça com série (recusa da
Etapa 9), então não havia lote a corrigir; o item virou o aviso antecipado na janela Gerar retalho. A revisão final achou a série ligada no
meio da geração passando sem série (anterior à etapa), corrigida com teste. Medido 0,5 h → 30 min.

**Etapa 245 (item 4, 18/11):** revisado antes de fazer (1h15 → 45 min, `296e5bab`): a sonda mostrou que a devolução pela não conformidade não
baixa peça com série (recusa da Etapa 45), mas que o caminho ensinado pela recusa não fechava (tudo reprovado: Saída recusada; parte reprovada:
peça boa presa no bloqueio). O item virou o aviso antecipado com os três passos. 30 min acima do revisado: a revisão final achou o aviso
falando para quem não faz os passos (Compras/Qualidade) e o campo de leitura valendo fora da NC pendente — corrigidos com teste; e o
fechamento. Medido 1,2 h → 1h15.

**Etapa 246 (itens 9 e 10, 18/11):** não revisados (a medição confirmou os dois defeitos). 30 min abaixo do estimado no total. O item 9 ganhou
um campo de leitura na lista de séries e corrigiu também a janela Devolver de Materiais de Clientes (a mesma frase). A revisão final achou
dois casos (a releitura que falha sem rede apagava a lista; com o lote escolhido na devolução ao cliente a frase sumia), corrigidos com
teste. Medido 0,7 h para os dois (os commits do pacote citam "Etapa 246"; o grupo C539/C538 da linha de medição não casa com os assuntos)
→ 30 min + 30 min.

**Etapa 247 (item 11, 18/11):** não revisado (a sonda confirmou o defeito). 15 min acima do estimado: a revisão do plano e a revisão final
acharam quatro casos em que o estorno de uma nota continuava recusado (a segunda liberação do mesmo lote, a reserva da OS, a peça em inspeção
ou reprovada, a mesma nota em dois lotes), corrigidos com teste; e a tela Reservas passou a dizer a nota de cada reserva. Medido 1,3 h → 1h30.


**Etapa 248 (item 12, 18/11):** não revisado (a sonda reproduziu os dois defeitos). Entregue no tamanho estimado; a revisão do plano e a
revisão final acharam três casos vizinhos (a mensagem da liberação e o aviso prometendo a reserva que o estorno soltou, a requisição
cancelada no meio do estorno fazendo soltar a reserva de outra, e a reserva recriada sumindo da mensagem), corrigidos com teste. Medido
1,3 h → 1h30.
**Etapa 249 (itens 14 e 15, 19/11):** não revisados (a medição confirmou os dois). 45 min abaixo do estimado no total: a régua do lote já
existia (a da entrega) e a frase era só a troca da mensagem. A revisão do plano trocou a régua da entrega pelas parcelas cruas (com ela a peça
reprovada parecia livre) e restringiu o lote a material com controle por lote e sem série; a revisão final limitou o livre de cada lote pelo
do material — corrigidos com teste. Medido 0,9 h para os dois (todos os commits citam C500; o grupo C501 não casa sozinho) → 45 min + 30 min.
**Etapa 250 (itens 16 e 17, 19/11):** não revisados (a medição confirmou os dois). 30 min abaixo do estimado no total: a frase usa números
que a tela já recebia e a sugestão reaproveitou a conta da separação. A revisão final achou a frase falando da saída automática quando as
peças saíam do endereço da separação, corrigida com teste. Medido 0,7 h para os dois → 30 min + 30 min.
**Etapa 251 (itens 20 e 21, 19/11):** não revisados (a sonda confirmou os três defeitos). 1h abaixo do estimado no total: a divisão reaproveitou a
conta que a janela já fazia para o livre do material e o teto da conferência já existia. A revisão final achou, em duas rodadas, a tela
oferecendo pelo automático uma quantidade que a entrega recusava (a caixa num lote com peça presa) — corrigida com teste. Medido 1,1 h para
os dois → 30 min + 45 min.

**Etapa 252 (itens 22, 19 e 23, 20/11):** não revisados (a sonda confirmou os três). 1h15 abaixo do estimado no total: o endereço da troca
veio das linhas que a saída já debitava, a frase reaproveitou a conta da entrega e a saída da peça com série reaproveitou a régua da
separação sem lote. A revisão do plano achou seis casos (o endereço da série que fica velho depois de transferir, as séries trocadas entre
as saídas, a frase com o separado de outra requisição, a troca à mão pelo lote, a linha negativa) e a revisão final mais um (a frase com o
separado de outro item da mesma requisição) — corrigidos com teste. Medido 0,9 h para os três → 30 min + 30 min + 30 min.

## Os que dependem de resposta — caminho reversível se a resposta não vier

- **24 Aplicação** (espera o Matheus): esconder o campo do formulário (Compras e consulta do Almoxarifado), sem apagar a coluna nem o
  valor — voltar é recolocar o campo.
- **25 Série + etiqueta** (img4 não foi salva; não se sabe a tela): seguir pela tela de **Ferramentas** (é onde há equipamento com
  número de série e etiqueta de controle — `codigo_patrimonio`): rótulo "Nº de controle (etiqueta)", série obrigatória para cadastro novo
  e para edição que mexe nela; as antigas sem série continuam editáveis. **Descartado:** etiqueta por peça no controle por série do
  material (seria coluna nova em `series_almoxarifado`, a entrada pedindo duas informações por peça — 3h ou mais; só se ela disser que é lá).
- **26 Especificações/Observações** ("manter só no campo Identificação", ambíguo): tirar os dois campos do formulário e deixar a
  Identificação com Descrição e Descrição Técnica; material com texto antigo neles mostra os campos (só os que têm texto), para nada
  sumir. **Descartado:** copiar o texto para a Descrição Técnica automaticamente (altera dado sem pedir).
- **27 Sobra e remessa** (contraria a regra "cadastro é do Compras"): manter a criação restrita da Etapa 193 e marcar o material criado
  por esses fluxos como "cadastro a completar", com o aviso e um filtro no Compras → Materiais; ao salvar pelo Compras, a marca sai.
  **Descartado:** tirar a criação desses fluxos (o almoxarife não registraria o retalho — a B74 já descartou).

## Fora desta estimativa (medido, não entra)

- Spec 01 abertos: grupo acima de família, tabela de conversões, tipos de documento e transportadoras, `almoxarifadoApi.js` — ninguém
  pediu; tipos de documento e transportadoras, se vierem, nascem no Compras.
- C533 (Saldo por lote com situação vazia no vencido liberado) — é a decisão B1500, não defeito.
- C526 (a reserva saber o lote — grande), C485, C498 (sem conserto medido), B1534 e B1537 (decisão do André).
- Feature 05 ("troca de série registrada", lista de separação como entidade, kits) e as 🟡 que dependem da empresa (16, 21, 22, 25).

## Ordem de execução

1 (cadastro, sem resposta pendente) → 5, 6 (a C543 no motor e a origem na devolução ao cliente, juntas mudam o aviso da 237) → 7, 8
(a mesma janela) → 2, 3, 4 (resto da D (233) 3, na ordem do plano da 236) → 9, 10 → 11, 12 (estorno da nota e trava) → 14, 15 →
16, 17, 20, 21, 22, 19, 23 (entrega e fila) → 13 → 18. Os 24 a 27 entram assim que a resposta chegar (ou, sem resposta, pelo caminho
reversível acima, depois do 18).

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-18 --ate 2026-11-28 --grupos "CA=validade do CA|Nº do CA|CA so para EPI;Quarentena series=quarentena.*serie|sucata.*serie;Retalho series=retalho.*serie;Fornecedor series=devolucao ao fornecedor.*serie;C543=C543|prateleira do lote;Origem devolucao cliente=origem da devolucao ao cliente;C542=C542|reservado e livre;C541=C541|reservado para a OS;C539=C539;C538=C538;C524=C524;C525=C525|C534;C477=C477|busca.*Devolucoes;C500=C500|bloquear.*lote;C501=C501;C514=C514;C517=C517;C475=C475;C497=C497;C489=C489;C491=C491|C518;C495=C495;C493=C493;Aplicacao=aplicacao;Serie e etiqueta=etiqueta;Especificacoes=especificacoes|observacoes gerais;Sobra e remessa=cadastro a completar"
```
