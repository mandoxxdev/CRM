# 05 — Separação e Picking

> **Status:** 🟡 **+ O "SAI DE" DA ENTREGA RESPEITA A GUARDA DO IRMÃO DA MESMA REQUISIÇÃO — Etapa 208 (2026-11-06)** (C496 = C472, e C470): na passada do caso (c) da entrega, a guarda que FICA dos outros itens desta requisição no par exato (`guardaDosIrmaosNoPar`, régua `guardaQueConta` com o `parteQueFicaPorItem` da própria entrega) é a terceira parcela da E1 (B1407); o mesmo par acima da própria parte entra no caso (c) pelo excesso (B1408, fecha o C470); a E1 estendida, idêntica sem irmão (B1409); os itens (c) têm o físico conferido depois dos (a)/(b) (B1415); a janela de entrega rotula o Sai de com *"(sobra 1 de 3; 2 desta)"* (`irmaosNoPar`, B1411). Sem trava nova. **+ A ENTREGA RESPEITA A GUARDA SEM LOTE — Etapa 207 (2026-11-06)** (C490): a parte automática **sem lote** da entrega (material sem `controle_lote`, e o `resto` sem lote do que tem) passa por `fatiasSemLoteParaOAutomatico` — a guarda sem lote das caixas vivas de todas as requisições, descontada por endereço; quando o claim de hoje a levaria (Fase 5 S1, B1406) e o livre usável cobre, sai em fatias com `localizacao_origem_id` e origem estrita (uma SAIDA por fatia); senão, uma baixa como hoje (B1397, B1398). Sem recusa nova, sem trava nova, tela intocada. **+ A ENTREGA RECUSA LOTE BLOQUEADO, REPROVADO OU VENCIDO — Etapa 206 (2026-11-06)** (C464, 2ª parte; a causa do C484): em material com `controle_lote`, a conferência `conferirAutomaticoPeloLote` (prévia da entrega, antes da alçada, sob as duas travas) recusa com 400 `fraseEntregaLoteImpedido` a parte automática que só lote impedido cobriria — nada baixado; o detalhe e a Fila tiram o entregável da mesma conta (`tetoDaEntregaPeloLote`); a passada 2 conta uma vez a guarda do próprio item (B1394, defeito da 197). Só servidor. **+ LOTE BLOQUEADO, REPROVADO OU VENCIDO NÃO CONTA NA SEPARAÇÃO — Etapa 205 (2026-11-06)** (C464, 1ª parte): a porta da separação, a Fila e o detalhe da requisição descontam o saldo de lote impedido do separável (`saldoDisponivelParaItem.disponivel_liberado`, coluna `lote_impedido`), a recusa ganha a 2ª frase e a janela mostra a linha do impedido. A entrega não muda (RN-205.10). **+ A EXCLUSÃO DA REQUISIÇÃO LIMPA A ORIGEM SEPARADA DOS ITENS — Etapa 203 (2026-11-06)** (C467). **+ O "SAI DE" MOSTRA O QUE SOBRA DEPOIS DO SEPARADO PARA OUTRAS REQUISIÇÕES — Etapa 201 (2026-11-05):** `GET /estoque/:materialId/saldos[?requisicao_id=N]` ganha, por linha, `separado_outras` (a parte guardada das caixas vivas de outras requisições no par endereço + lote, `parteGuardadaDeOutrasPorPar`, provada igual a `parteGuardadaDeOutras` por par) e `sobra`; `requisicao_id` inválido → 400 `requisicao_id inválido`; o extrato (`consultarSaldosPorLocalizacao`) não muda. As duas janelas pedem com `requisicao_id` e o `rotuloOrigem` mostra *"XB-01 — lote L1 (sobra 2 de 6; 4 para outras)"*; na separação desconta a parte desta requisição no par (*"…, 1 desta)"*, inclusive sem outras — B1349, Fase 5); `maxSeparavelNaTela` e o sugerido usam a sobra (B1346). C469 resolvido; C473 novo (o número é o da abertura da janela). **+ A ENTREGA COM "SAI DE" ESCOLHIDO À MÃO RESPEITA O QUE OUTRA REQUISIÇÃO SEPAROU DALI — Etapa 200 (2026-11-05):** a entrada da entrega com `localizacao_origem_id` que não é a origem guardada do item (outro endereço, outro lote, ou item sem origem — inclusive com `serie_ids`) desconta a parte guardada das outras caixas vivas no par (a régua da 198, `memoParteGuardadaDeOutras`) numa passada depois do laço, com o pedido de todos os itens da entrega, e recusa com 400 E1 (`mensagemSeparadoDeOutras`, `gesto: 'entrega'`) antes da prévia e da alçada, nada gravado. Casos (a) planejada e (b) "Sai de" igual à origem do item, automático e só lote inalterados. C468 resolvido no "Sai de" de outro par; ficam C470–C472. Só motor; tela intocada (C469, a próxima). **+ A SEPARAÇÃO COM "SAI DE" CONTA O QUE JÁ ESTÁ SEPARADO PARA OUTRAS REQUISIÇÕES — Etapa 198 (2026-11-05):** a entrada da separação com `localizacao_origem_id` passa pelo `checarOrigemItem` com o 6º parâmetro `outras` (`parteGuardadaDeOutras`: `SUM(PARTE_ORIGEM_SQL)` das outras requisições com caixa viva no par material + endereço + lote) e recusa com 400 (a literal C1, que diz quanto há, quanto está separado para outras, quais e quanto sobra) quando o físico cobriria mas a sobra não; o filtro "caixa viva" virou um só (`caixaVivaSql`: `ativo` + `STATUS_COM_CAIXA`) para a Fila/sugestão, o automático da entrega e a separação — aceitação e divergência leem a mesma conta (a divergência deixou de contar caixa de requisição cancelada legada). C449 resolvido na separação; a entrega não mudou (a guarda "não serve mais" fica, B1333); a entrega com "Sai de" à mão ainda não desconta (C468). Só motor; tela intocada (C469). **+ SEPARAR EM DUAS VEZES, 2ª PARTE: EM MATERIAL COM LOTE, A PARTE AUTOMÁTICA DA ENTREGA BAIXA DO LOTE CERTO — Etapa 197 (2026-11-05):** em material com `controle_lote` e sem série, o pedaço automático da entrega (`comOrigem: false`, passada 2) sai por lote, na ordem FEFO de `listarLotesDoMaterial`, só lote `elegivel`, uma SAIDA por lote e pedaço (`dividirPorLotes`, `lotesParaOAutomatico` em `requisitionService.js`); o saldo de cada lote desconta a inspeção e a parte guardada das caixas de requisição ativa — no par (lote, endereço) quando há guarda, com origem estrita (B1329) —, e a do próprio item só pelo que fica depois da entrega; o resto sai sem lote como antes (B1323, C464). C451 e C453 resolvidos na entrega de material com controle de lote (fica: material sem controle, B1321); C462 resolvido (frases da fila); a fila ganha `controle_lote` por item. Motor intocado (B1325). **+ SEPARAR EM DUAS VEZES: A PARTE SEPARADA PRIMEIRO CONTINUA SAINDO DE ONDE FOI SEPARADA — Etapa 196 (2026-11-05):** o item guarda, além do par (endereço, lote) da separação, **quanto** da caixa saiu dele (`quantidade_origem_separacao`); a rodada de outro par não apaga mais a origem nem grava troca (a regra da Etapa 65 na separação foi **revogada**, B1314); a entrega, a devolução à prateleira e a fila contam a parte, não a caixa inteira (C453 resolvido na parte do endereço; a parte automática de material com lote ainda sai da linha sem lote — C451, a próxima). **+ AS QUANTIDADES DIGITADAS NA JANELA FICAM AO VOLTAR PARA A ABA — Etapa 195 (2026-11-05):** o recarregamento da requisição com a janela de separação ou de entrega aberta mantém o que foi digitado (C454), e o caminho morto do Completar Entrega saiu (C452); só tela. **+ A JANELA DE SEPARAÇÃO JÁ ABRE NO ENDEREÇO SUGERIDO, E A FILA IMPRIME A LISTA DE COLETA — Etapa 189 (2026-10-23):** o "Sai de" do item sem separado pendente parte do par que a fila sugere quando ele cobre (rota nova só de leitura `GET /requisicoes/:id/sugestao-coleta`, gate `separar_emitir`), e separar dali grava a planejada — a entrega sai do par, sem linha sem lote negativa (C451 resolvida para a separação de uma rodada); a fila imprime a lista de coleta em PDF (por requisição e "todas"). Continua 🟡 pelo mesmo de produto. Antes: 🟡 **+ SUGESTÃO DE COLETA NA FILA — Etapa 188 (2026-10-23):** cada item separável diz de onde pegar e a requisição diz em que ordem andar; a "rota de picking" sai do que falta para 🟢 (falta o de produto — lista de separação como entidade, troca de série, localização de kit e kits — e a C198). Antes: 🟡 **com dono, segunda conferência, origem por item na SEPARAÇÃO e na ENTREGA, divergência registrada, SÉRIE na entrega, TROCA da origem separada registrada NA ENTREGA E NA SEPARAÇÃO , FILA DE SEPARAÇÃO e SEPARAÇÃO LIMITADA AO FÍSICO (Etapa 95), DEVOLVER DA CAIXA À PRATELEIRA (Etapa 98) e A SEPARAÇÃO RECUSA O INSEPARÁVEL, A CONFERÊNCIA CONTA A CAIXA (Etapa 99)** — **Etapa 99 (2026-10-15, `314837d6..3e14653a`: T1 `7353265d`, T2 `b8e16e4c`, T2b `c9087106`, T3 `3e14653a`)**: a separação valida a **forma** de cada entrada numa passada própria, depois do status e **antes** da alçada de valor e da reivindicação — quantidade negativa ou não numérica (Q1), item que não é da requisição (Q2), fração em material com série (Q3) e `itens_separados` que não é lista (Q4) viram 400 com literal e **nada muda** (tudo ou nada: a entrada válida do mesmo payload também não grava); 0, ausente, `null`, `""` e `[]` continuam aceitos (28 RN-02). A conferência conta a **caixa** (separado − entregue, a régua da B512) e recusa a caixa vazia com *"Nenhum item separado"* (C200); o botão "Conferir separação" segue a caixa. C197 e C200 resolvidos. **O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada, localização de kit e kits). Antes: **Etapa 65 (2026-10-01, `5290ba8`, `7d2a160` + fix-rounds `75ff9a5` e `4512b16`)**: a rodada de separação que apaga a origem planejada (separado pendente de A, rodada nova de outro par, em automático ou de vários pares) grava a troca em `substituicoes_origem_requisicao` com `momento = 'SEPARACAO'` e `separacao_id`; a janela de separação parte da planejada no "Sai de" quando ela cobre a quantidade sugerida, avisa a troca e pede "Motivo da troca (opcional)". **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, substituição de lote com registro (falta a troca de **série**), transferência para localização de kit e kits. Antes: **Etapa 64 (2026-10-01, `fb06142`, `88d943a` + fix-round `42d7526`)**: `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`, só leitura) e a tela "Fila de separação": as requisições com trabalho, na ordem acionável → urgência → necessidade → mais antiga, com `etapas[]` por requisição (Separar só com separável agora, Entregar só com entregável agora, conferência conforme o estado, aprovação de valor avaliada na hora) e o que falta por item. **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, a troca registrada também **na separação**, transferência para localização de kit e kits. Antes: **Etapa 63 (2026-10-01, `3e022eb`, `e7f3afa` + fix-round `4f008f2`)**: a entrega que sai de outro endereço ou lote que não o separado deixa registro (tabela `substituicoes_origem_requisicao`, motivo opcional, bloco "Substituições" no detalhe); acima do separado pendente a baixa se divide (o pendente sai da planejada, o excedente pelo automático). **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, a troca registrada também **na separação**, transferência para localização de kit, kits e a tela de fila. Antes: **Etapa 61 (2026-09-30, `6ba7429`, `d74e5a8` + fix-round `77d084c`)**: a entrega de material com série exige e baixa as séries escolhidas (o registro por item fica completo); a exclusão da requisição as devolve. **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, substituição de lote com registro, transferência para localização de kit, kits e a tela de fila. Antes: **Etapa 60 (2026-09-30, `eea0687`, `0486b9c` + fix-round 1125a0f)**: cada rodada de separação grava, por item, quanto dava para separar, se ficou abaixo (divergente) e o motivo — **opcional**; a janela pede o motivo abaixo do possível e o conferente lê no bloco "Separação". **Só registro** (**B238**). Antes: **Etapa 59 (2026-09-30, `11dcdb5`, `29eb434` + fix-round e2b7dab)**: a separação registra, por item, o endereço e o lote de onde sai ("Sai de"), conferidos como na entrega; o item guarda a **origem planejada** e a entrega — inclusive a de **um clique** — sai dali, até o separado ainda não entregue (fecha o **C80**). Antes: **Etapa 58 (2026-09-30, `cec2b56`, `d18019f` + fix-round e9bca72)**: a entrega de requisição escolhe, por item, o endereço e o lote de onde sai ("Sai de"), com confirmação por leitura opcional; a origem escolhida é estrita; a exclusão da requisição devolve ao lote e ao endereço de cada saída. Antes: **Etapa 28 (2026-08-29, `9cef003..62cb2b1`)**: cada rodada de separação é registrada com autor (`separacoes_requisicao_almoxarifado`, append-only), a separação e a liberação auditam, e a **segunda conferência (conferente ≠ separador, em QUALQUER rodada)** existe com a barreira repetida no `WHERE` do claim; com material crítico ainda na caixa ela é **obrigatória** para liberar e para entregar. **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, registro por item com localização lida e lote retirado **na SEPARAÇÃO** (pago na separação e na entrega — Etapas 58 e 59; o que falta do item é a **série**), **série por item** (a entrega de material com série ainda sai sem escolher as séries — ver a próxima tarefa no plano da Etapa 60), substituição de lote, transferência para localização de kit (exige estender `TIPOS_LOCALIZACAO`), kits, e a tela de fila. Antes: 🟡 básico — a separação simples por item existe e foi endurecida pelas Etapas 3/4/6 (permissão `separar_emitir`, liberação para retirada, parcialidade acumulada); lista de separação como entidade, conferência dupla, rota de picking e kits continuam não existindo · **Spec original:** seção 12
> **Última atualização:** 2026-11-13 (**Etapa 218** — o **Sai de** com lote escolhido (separação e entrega, inclusive "só lote" e a
> origem da separação) confere o lote inteiro quando ele tem peça presa (C513, B1443–B1452): `8f9affd2` (plano), `97ba728c`, Fase 5
> `e4490a2f`. Ver o bloco "Etapa 218" no fim.)
> *Antes:* 2026-11-13 (**Etapa 217** — a entrega automática e a separação/aprovação descontam a peça bloqueada **no lote** (quarentena, reprovação, terceiros; C503, B1434–B1442): `cf346c35` (plano), `e2a43f20`, Fase 5 `cad6da56` (trava; testes em `e2a43f20`). Detalhe na spec 10, seção "Etapa 217".)
> *Antes:* > **Última atualização:** 2026-11-06 (**Etapa 208** — o "Sai de" da entrega respeita a guarda do irmão (C496, C472, C470; B1407–B1415): `025d7109` (plano), `4301c74b` (Fase 2), `575174c0` (T0), `227334f1` (T1), `5c60c868` (T2), `f170693f` (T3), `53fd0fae` (T4), `05b6e567` (execução), Fase 5 `d88a53bc` — ver o bloco "Etapa 208" no fim; a frase da 200 que diz que a parte de um irmão "não é protegida" e o "C496, a próxima" da 207 **anotados à vista**. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-06 (**Etapa 207** — a entrega respeita a guarda sem lote (C490, B1396–B1406): `4d8fb611` (plano), `7e2708d7` (Fase 2), `08e1070c` (T0), `842567ca` (T1), `3db19406` (T2), `8a99e628` (T3), `fddeb5ee`, `147dbf6b` (T4), `4431a83d` (execução), Fase 5 `730a8a00`, `12ca0500`, `2d668f2c` — ver o bloco "Etapa 207" no fim. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-06 (**Etapa 206** — a entrega recusa lote impedido (C464 2ª parte, B1383–B1395): `7f210f62` (plano), `7159f344` (Fase 2), `df1de701` (T0), `ccbce184` (T1), `62c3dc79` (T2), `a286ba46` (T3), `7d21a13c` (execução), Fase 5 `31aca1a3`, `00d9e24a`, `0996c3c2` — ver o bloco "Etapa 206" no fim. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-06 (**Etapa 205** — lote impedido na aprovação e na separação (C464 1ª parte, B1368–B1382): `88f18de5` (plano), `422b8e90` (Fase 2), `8bebd3ce` (T0), `82ae8664` (T2), `18b41f47` (T2b), `e989ec54` (T3), `9bf6ccd6`, Fase 5 `689bfa7d`, `0516c933`, `13fe3691` — ver o bloco "Etapa 205" no fim. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-06 (**Etapa 203** — a exclusão da requisição limpa a origem separada dos itens (C467, B1358–B1362): `b0a4a46b` (plano), `c28f7d37` (T1/T2) — ver o bloco "Etapa 203" no fim. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-05 (**Etapa 201** — o "Sai de" mostra a sobra (C469, B1343–B1349): `855e7404` (plano), `1fc07cbf` (Fase 2), `1b04ad38` (T1), `4b62f20c` (T2), `f089c284` (T3), `b3727231` (T4), `65902725` (execução), Fase 5 `dfffe96b`, `ab1d6246`, `298a3d72` — ver o bloco "Etapa 201" no fim; o "Fica de fora (D (200))" sobre o rótulo e o "o 'Sai de' da janela mostra o físico do par" do bloco da 198 **anotados à vista**. Continua 🟡.) · Antes: (**Etapa 200** — a entrega com "Sai de" à mão conta o separado de outras requisições (C468 no "Sai de" de outro par, B1338–B1342): `fd1daad2` (plano), `e22db079` (Fase 2), `d7ff9a39` (T1), `943a486e` (T2), `71783dc8` (T3), `52ae600e` (execução), Fase 5 `5bc921e4` — ver o bloco "Etapa 200" no fim; o "Fica de fora (D (198))" e o "O que falta para 🟢" sobre o C468 **anotados à vista**; a B1335/C469 sobre a Movimentação **estava errada**. Continua 🟡.) · Antes: (**Etapa 198** — a separação com "Sai de" conta o separado de outras requisições (C449 na separação, B1330–B1335): `0affc3df` (plano), `0eb953f0` (Fase 2), `2fa621de` (T1), `1d24311b` (T2), `00d717ad` (T3), `97d7e0ef` (execução), Fase 5 `75da9211` — ver o bloco "Etapa 198" no fim; o "Fica de fora (D (197))" e o "O que falta para 🟢" sobre o C449 **anotados à vista**. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-05 (**Etapa 197** — a entrega automática pelo lote (C451/C453 na parte do lote, C462, B1320–B1329): `7f099fae` (plano), `b21a81f5` (Fase 2), `ee835811`, `b751b3ab` (T0), `58227edf`, `d8a4f1d9`, `398d1e69` (T1), `e011affe`, `cbb2b66f` (T2), Fase 5 `838bb350`, `1723b78c`, `351ee457`, `6d4dec1d`, `1ed41bb8` — ver o bloco "Etapa 197" no fim; a linha da D (136) e a do "Fica de fora (D (196))" sobre a parte automática sem lote **anotadas à vista**. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-05 (**Etapa 196** — a origem da separação em duas vezes (C453, B1313–B1319): `4c602925` (plano), `8a98d548` (Fase 2), `4cf2b6dd`, `aecaadd3`, `83abf7eb`, `425acd91`, `f4ba735c`, `e3f9b929`, `1eca71f1`, Fase 5 `736ccb49`, `4ba2e9b4` — ver o bloco "Etapa 196" no fim; as linhas da Etapa 65 sobre a troca na separação (o item "Substituição de lote" e a regra da tabela) **revogadas à vista**. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-11-05 (**Etapa 195** — as quantidades digitadas na janela de separação e na de entrega ficam ao recarregar (C454, B1309–B1311) e o C452 removido (B1312); `f8398b40` (plano), `650db899` (código e testes), `bdc2eb74`, Fase 5 `727792a3`. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-10-23 (**Etapa 189** — a pré-seleção do "Sai de" na janela de separação e a lista de coleta em PDF; `da0c2d6b` (T1 rota), `d043224f` (T2 janela), `4c1f059a` (T3 PDF e frases), `d1146a6e` (T4 integração), Fase 5 `940ba3c5`, `aa61d3d5`, `b2fe087e`, `43b17210` — ver o bloco "Etapa 189". O item *"Sugestão de rota"* ganha a nota da 189; a lista impressa **não** é a "Lista de separação como entidade própria", que continua `[ ]`. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-10-23 (**Etapa 188** — a Fila de separação sugere de onde pegar cada item (`pegar_em`) e a ordem de coleta por requisição (`ordem_coleta`), só leitura; o item *"Sugestão de rota"* do checklist virou `[x]` e **o texto dele estava errado** ("ordenar itens" quebraria a B821 — corrigido à vista no item); `27819165`, `e550353e`, `aa41152f`, `f35321ac`, revisão adversarial `9efbcf4a`, `9b159c69` — ver o bloco "Etapa 188". Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-10-22 (**Etapa 182** — a liberação para retirada grava a data (`pronta_para_retirada_em`) e a caixa parada vira alerta na feature 20; `4ed84488`, `1e6677be`. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-10-17 (**Etapa 136** — a ordem das baixas da entrega: o que sai de um endereço (a origem da separação ou o escolhido) sai antes do que tem só o lote e do automático, em todos os itens; a recusa por endereço depois da primeira baixa da D (135) sumiu, e a D (135) **estava errada** em dois pontos (ver o bloco "Etapa 136" no fim); `d4f19bfa`, Fase 5 `ddded5a2`. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-10-17 (**Etapa 135** — o entregável de irmãos: a entrega confere a requisição inteira antes de baixar e a janela de entrega divide o livre entre itens do mesmo material; o detalhe do crítico fica na caixa (C286); `35425c3d`, `39d82137`, Fase 5 `70a77c0f` — ver o bloco "Etapa 135" no fim. Continua 🟡 pelos motivos de produto.)
> *Antes:* 2026-10-16 (**Etapa 128** — a contagem abaixo do reservado passou a avisar: a C209 do checklist de "fica de fora" está resolvida, spec 03.)
> *Antes:* 2026-10-16 (**Etapa 127** — a Fila de separação e a janela de separação dividem o separável entre itens do mesmo material com o número da porta: a linha da fila deixou de mostrar o teto de cada item sozinho (D (95)), e a janela deixou de tirar do segundo item a reserva própria dele (C265); `77385aaa`, `e5e7938f`. Continua 🟡: os itens de produto e, de integridade, C198 e C209.) Antes: 2026-10-15 (**Etapa 104** — a contagem por endereço que leva a caixa sem reserva grava e **avisa** (`aviso_caixa` na resposta da v2, toast na tela de Movimentações): C186 tratado com aviso, decisão B704 (a recusa foi descartada), régua pelo disponível (B705), a frase manda estornar o ajuste que baixou (B706); `660ae114`, `385ff127`, `27ba1c29`. Continua 🟡 pelos motivos de produto — ver a seção "Etapa 104" no fim. Antes: **Etapa 102** — material na caixa não se encerra em status nenhum: a *Parcialmente Atendida* com caixa recusa o encerramento (E1) como a *Em Separação*, C204 resolvido, regra na feature 04, `99043a57`, `5746553b`, `f18cae5d`. Antes: **Etapa 101** — a *Em Separação* com a caixa vazia cancela (nada entregue) ou encerra (algo entregue), e os cancelamentos esperam a separação na trava por requisição: C195 resolvido, regra na feature 04, `6dcced8e`, `dfdad6b1`. Antes: **Etapa 99** — a separação recusa o que não é separável (C197) e a conferência recusa a caixa vazia (C200): `validarFormaDaSeparacao` em `requisitionService.js` roda depois de `PODE_SEPARAR` e antes de `verificarBloqueioLiberacao` (B516), com as literais Q1–Q4 (B517–B520); a rota passa `itens_separados ?? []` (B520); `conferirSeparacao` conta a caixa com `ROUND(…, 6) > 1e-9` (B522); o botão "Conferir separação" do detalhe segue `caixaDoItem > 0` (B523, reescrita na Fase 2). Range `314837d6..3e14653a`. A frase do bloco "Etapa 98" sobre o C197 (*"200, nada mudava"*) **estava errada** — o status mudava para *Em Separação*; corrigida à vista lá. Fase 5 `821fb03b`, `f1041706`. Continua 🟡 pelos motivos de produto — ver a seção "Etapa 99" no fim.) Antes: 2026-10-09 (**Etapa 98** — devolver da caixa à prateleira: `PUT /api/almoxarifado/requisicoes/:id/devolver-separado` (gate `separar_emitir`) diminui o separado ainda não entregue de um ou mais itens, com motivo obrigatório, sem mover estoque, com trilha própria (`devolucoes_caixa_requisicao`) e auditoria `DEVOLUCAO_CAIXA`; a *Pronta para Retirada* volta a *Em Separação* (seta nova); a segunda conferência é limpa; a reserva do item não muda; o sufixo da 97 ensina a terceira saída (S98); a entrega, a fila e o detalhe dizem o que o motor deixa sair com o disponível negativo (C190, E190); o liberar para retirada passa a exigir caixa > 0 (B512). Range `6e61cb27..b7fc06a0`. O "não há gesto de devolver da caixa" do bloco "Etapa 95" **estava desatualizado** — corrigido à vista lá. Continua 🟡 pelos motivos de produto — ver a seção "Etapa 98" no fim.) Antes: 2026-10-09 (**Etapa 97** — o material separado na caixa de uma requisição só sai pela entrega: as portas avulsas do motor (saída v1/v2, perda, ajustes sem localização, inventário, remessa, bloqueio avulso, reserva manual, sucateamento, estornos — 17) recusam levar a caixa sem reserva, com a literal de antes + um sufixo que nomeia a requisição e ensina a saída; a entrega fica na régua de hoje e a porta avulsa espera a separação do mesmo material (trava). Fecha a B466 (iv) / D (95) / D (96); fica fora o `AJUSTE` com localização de ida (B495, C186) e o C190. Range `eb7cd9d8..3fc39310`. Continua 🟡 pelos motivos de produto — ver a seção "Etapa 97" no fim.) Antes: 2026-10-09 (**Etapa 96** — o item da requisição grava arredondado a 6 casas (`quantidade_separada`, `quantidade_entregue`, o solicitado) e a entrega compara com folga de 1e-9: separar 0,7 + 0,2 + 0,1 e entregar 1 não fica mais preso, a entrega fracionada não deixa físico fantasma, a requisição de 1/3 fecha *Entregue*; ver a seção "Etapa 96" no fim. Continua 🟡.) Antes: 2026-10-09 (**Etapa 95** — a separação não aceita mais do que existe na prateleira (**C169** resolvido): o teto de cada item passa a ser o que a reserva dele ainda segura além do que ele já tem na caixa, mais o livre do material depois de tirar a caixa sem reserva dos **outros** itens de qualquer requisição com caixa (`tetoSeparacao`, arredondado a 1e-6); itens do mesmo material dividem o teto na rodada; a separação e a entrega pegam a trava por material dos itens, por dentro da trava por requisição. A fila (`separavel`) e o detalhe (`saldo_separavel`, `quantidade_separavel` — aditivos) dão o número que a porta aceita, e a tela usa esse número. O "Fica de fora" da Etapa 60 que dizia que o separado sem endereço de outra requisição não sai do livre foi **revogado** (B467) — riscado à vista no bloco "Etapa 60". `f0b94706..42e08faf`: T0 `f8edb54a`, T0b `35e274c5`, T2 `9237af2c`, T1 `5a2bfa9f`, T3 `c335cf40`, T4 `ed90a0aa`, Fase 5 `582844e8`, `6e0fae83`, `16cacc0e`, `42e08faf`. Continua 🟡 pelos motivos de produto — ver o bloco "Etapa 95" no fim.) Antes: 2026-10-09 (**Etapa 94** — a alçada de valor vale até o começo da separação: com material separado ou entregue a separação e a entrega não a reconferem mais (antes gravavam *Aguardando aprovação de valor* por fora da máquina, de qualquer status — C163), e a fila de separação só mostra *Aguardando aprovação de valor* enquanto ela vale (C165, B457); etapa nova da fila `RETOMAR_SEPARACAO` (*"Reabrir separação"*) para o legado com tudo separado num status anterior à separação (B460); o 409 V1 e o 403 da alçada fecham o modal de separação e recarregam (B463, B465). Fecha o "Fica de fora" da 93 sobre `verificarBloqueioLiberacao`. `a758d39d`, `7b66807f`, `19e294fc`, `9cafb842`, `79a766e9`, Fase 5 `ad5fcd7f`, `c729b784`, `469fda3b`. O fechamento achou um defeito **antigo**, anterior à etapa: a separação aceita mais que o físico (**C169** — Etapa 95). Continua 🟡 — ver o bloco "Etapa 94" no fim.) Antes: 2026-10-09 (**Etapa 93** — a separação, a liberação para retirada e a entrega seguram uma trava por requisição (B443) e as gravações depois da reivindicação conferem o status: o *compare-and-clear* da conferência perde por status → 409 X1 (B444), a liberação confere o status e a marca de rodada → 409 L1 (B445). Fecha o "Fica de fora (D (92))" abaixo — que dizia "não medido" e **estava errado**: medido 5/5. `fa4ae85c`, `034076ff`, `908ee2a1`, `03c147cb`, `9307a2cc`, Fase 5 `2661bdd1`, `92d995a0`. O status continua 🟡 pelos mesmos motivos de produto — ver o bloco "Etapa 93" no fim.) Antes: 2026-10-08 (**Etapa 92** — a separação **reivindica** a requisição antes de gravar: `UPDATE … SET status='EM_SEPARACAO' WHERE id=? AND status IN (PODE_SEPARAR)` depois da passada de validação; perdeu (cancelada no meio) → o 400 de sempre e nada gravado; a falha de banco depois de reivindicar, sem rodada gravada, devolve o status lido — só se nenhuma rodada nova entrou (RN-09). `6a0b529c`, Fase 5 `f3b2b4fb`. O status continua 🟡 pelos mesmos motivos — ver o bloco "Etapa 92" no fim; esta etapa não mexe no que falta para 🟢.) Antes: 2026-10-01 (**Etapa 65 fechada** — a troca de origem na separação fica registrada; o item "Substituição de lote com registro" continua [ ] só pela série; ver o bloco "Etapa 65" no fim). Antes: 2026-10-01 (**Etapa 64 fechada** — a fila de separação do almoxarife; o item "Tela de listas de separação" vira [x]; ver o bloco "Etapa 64" no fim). Antes: 2026-10-01 (**Etapa 63 fechada** — a troca da origem separada fica registrada na entrega; ver o bloco "Etapa 63" no fim). Antes: 2026-09-30 (**Etapa 61 fechada** — a série por item na entrega; o registro por item vira [x]; ver o bloco "Etapa 61" no fim). Antes: 2026-09-30 (**Etapa 60 fechada** — separar menos do que dava passa a deixar registro, com motivo opcional; ver o bloco "Etapa 60" no fim). Antes: 2026-09-30 (**Etapa 59 fechada** — a separação diz de onde cada item sai, e a entrega de um clique usa; ver o bloco "Etapa 59" no fim). Antes: 2026-09-30 (**Etapa 58 fechada** — a entrega de requisição diz de onde cada item sai). Antes: 2026-08-29 (**Etapa 28 fechada, `9cef003..62cb2b1`** — ver o bloco "Etapa 28" no fim: o "responsável pela separação" e a "segunda conferência" estão pagos; a **régua de obrigatoriedade** é decisão minha (letra **B62**), e a revisão adversarial achou que a **escrita parcial** do laço de separação — anterior à etapa — deixava item gravado sem rodada, furando a barreira; virou tudo-ou-nada em `5a3d593`). Antes: 2026-08-29 (**Fase 0 da Etapa 28, medida no código**: esta spec afirmava
> que `TIPOS_LOCALIZACAO` já contemplava "Reservado"/"Kit"/"Aguardando retirada" — **ESTAVA
> ERRADO**, ver a correção abaixo; e a medição achou o **bloqueio real** de três itens do
> checklist, que a spec não nomeava: **a separação não tem autor e não deixa rastro**. Nenhum item
> mudou de estado.) Antes: 2026-08-11 (auditoria spec×código — esta spec estava congelada em 2026-08-02, anterior às Etapas 3, 4 e 6, e não refletia nada do que elas mudaram aqui)

## Objetivo

Listas de separação agrupadas, rota de picking, conferência dupla, montagem e identificação de kits.

## O que já existe

- Separação simples por item dentro da requisição: `PUT /requisicoes/:id/separacao` + alias `PUT /requisicoes/:id/separar` (`routes/almoxarifado.js`), ambos hoje sob `requirePermission('separar_emitir')` (perfis ADMIN/ALMOXARIFE) — esta spec não mencionava permissão. Grava `quantidade_separada` (acumulando em múltiplas rodadas, com teto `maxSeparar`), bloqueia separar acima do teto e sem aprovação de valor (`requisitionService.js`). *(Etapa 95: o "teto" daqui era `min(pendente, disponível + reserva do item)` — **não descontava o separado ainda não entregue** e deixava separar acima do físico (**C169**). Desde `f8edb54a` o disponível do teto é o físico que sobra para o item — ver o bloco "Etapa 95".)*
- Front: ação "Separação" em `RequisicoesList.js` com quantidades por item.
- ~~Localização virtual: `TIPOS_LOCALIZACAO` já contempla tipos que servem para "Reservado"/"Kit"/"Aguardando retirada" (validar na implementação).~~
  > **ISTO ESTAVA ERRADO, e o erro é do tipo que faz alguém começar a implementar e travar no meio**
  > (medido na Fase 0 da Etapa 28, 2026-08-29). A lista completa de `TIPOS_LOCALIZACAO`
  > (`server/services/almoxarifado/schema.js:21-26`) é: *Almoxarifado, Rua, Prateleira, Gaveta,
  > Box, Área externa, Área de corte, Área de montagem, Área de elétrica, Área de pintura, Área de
  > expedição, Área de materiais do cliente, Área de quarentena/inspeção*. **Não existe
  > "Reservado", não existe "Kit", não existe "Aguardando retirada".** O que a spec chamava de
  > "validar na implementação" é, na verdade, **estender o enum** — que é exportado
  > (`schema.js:2046`) e servido ao front como `localizacoes_tipos` (`extended.js:151`), ou seja,
  > **mudança de contrato de API**, não conferência. O item de checklist que depende disto é o
  > "Transferir material separado para localização Aguardando retirada/Kit".
  > **A afirmação errada fica à vista, riscada**, em vez de apagada: é a quarta vez nesta base que
  > uma spec afirma algo sobre a existência de código sem medir, e a segunda no sentido inverso
  > (as três anteriores diziam que algo **não** existia quando existia; esta diz que existe e não
  > existe).
- ~~**A separação NÃO TEM AUTOR e NÃO DEIXA RASTRO**~~ **PAGO na Etapa 28 (`f298536`)** — ver o bloco no fim. O texto abaixo fica como estava, porque é a medição que definiu a etapa: (medido na Fase 0 da Etapa 28, 2026-08-29 —
  esta spec não nomeava o fato, e ele é o **bloqueio real** de três itens do checklist):
  `requisitionService.separarRequisicao(db, requisicaoId, itensSeparados)` (`:189`) **não recebe
  `user`**, e o handler da rota (`routes/almoxarifado.js:3301`, `handleSeparacao`) **não repassa
  `req.user`**; `requisitionService.js` tem **zero** ocorrências de `registrarAuditoria`/`auditar`
  (contado); `auditLabels.js` tem **zero** ocorrências de `SEPARA` — não existe verbo de
  separação no vocabulário da trilha. Consequência: **não há como saber quem separou uma
  requisição**, nem pela trilha nem pela tabela. O contraste é dentro do mesmo arquivo de rotas:
  `/confirmar-recebimento` e `/rejeitar-valor` auditam; `/separacao` e `/liberar-retirada` não.
- **Armadilha de segunda porta, medida e nomeada:** existe `conferencias_almoxarifado` com
  `dupla_contagem`, `contado_por_id`/`recontado_por_id` e `modo_cego` (`schema.js:1876-1891`).
  **Não serve para o item "Segunda conferência" desta spec:** é conferência de **inventário**
  (feature 10, `tipo DEFAULT 'GERAL'`, tela `ConferenciaEstoque.js`), sem nenhuma ligação com
  requisição ou separação. Está escrito aqui para ninguém "descobrir" a tabela no meio da etapa e
  achar que o item já está meio pronto — mesmo cuidado que a spec 09 tomou com `padroes_qualidade`.

## Checklist

### Backend
- [ ] Lista de separação como entidade própria (agrupa itens de 1+ requisições) — **continua `[ ]` depois da Etapa 189:** a *"lista de coleta"* impressa da 189 é um papel gerado da Fila já carregada, uma seção por requisição, sem gravar nada; não agrupa itens de várias requisições nem vira registro (B1266).
- [ ] Agrupamento por projeto / setor / localização
- [x] **Responsável pela separação — PAGO na Etapa 28 (`f298536`, RN-01/02/04):** `separarRequisicao` recebe `user`, cada rodada vira uma linha de `separacoes_requisicao_almoxarifado` (quem, quando, `itens_json`), e audita `SEPARACAO`. **Prioridade** continua fora (depende da lista de separação como entidade). Texto original: **o "responsável" é o bloqueio de fato, e ele é
  anterior a tudo neste checklist:** hoje o separador **não é gravado em lugar nenhum** (ver "O que
  já existe"). Não é um campo a somar a um fluxo pronto: é o campo sem o qual os itens
  "Segunda conferência (conferente ≠ separador)" e a regra "conferência pelo mesmo usuário da
  separação falha" **não têm como existir**
- [x] **Sugestão de rota — Etapa 188** (`27819165` regra pura, `e550353e` a fila devolve, `aa41152f` tela, `f35321ac` integração; revisão adversarial `9efbcf4a`, `9b159c69`): cada item separável da Fila de separação ganha `pegar_em` (um endereço e lote — FEFO, a padrão, o maior; nunca bloqueado/inativo/área especial/lote bloqueado ou vencido) e cada requisição ganha `ordem_coleta` (o percurso pela árvore de localizações, número como número). ~~Texto original: "Sugestão de rota (ordenar itens pela hierarquia de localizações)".~~ **Isto estava errado:** ordenar os **itens** mudaria a divisão do separável entre itens do mesmo material, que é feita na ordem do pedido (B821, Etapa 127). O certo, entregue: **a ordem de coleta é um campo ao lado dos itens, que continuam na ordem do pedido** (B1256). Fica de fora: a pré-seleção do "Sai de" e o PDF da lista de coleta (Etapa 189, B1257) — ver o bloco "Etapa 188". **Pago na Etapa 189** (`da0c2d6b`, `d043224f`, `4c1f059a`, `d1146a6e`; Fase 5 `940ba3c5`, `aa61d3d5`, `b2fe087e`, `43b17210`): a janela de separação parte do par sugerido quando ele cobre, e a fila imprime a lista de coleta — ver o bloco "Etapa 189".
- [x] Registro por item: localização lida, lote/série retirado, quantidade, divergência — **COMPLETO na Etapa 61** (`6ba7429`, `d74e5a8` + fix-round `77d084c`): a **série** retirada é registrada **na entrega** (a janela lista as séries em estoque do item e exige exatamente a quantidade; o servidor valida antes de qualquer baixa e dá baixa nelas). **Por que [x] com a série na ENTREGA e não na separação:** a separação é lógica (não move estoque); quem baixa a peça é a entrega, e é ali que o sistema precisa saber QUAL unidade saiu — registrar a série na separação seria uma intenção a mais, sem efeito. A **leitura de etiqueta na separação** continua fora (a leitura existe na entrega e na movimentação) — declarado, não bloqueia o item. Histórico: **PARCIAL, pago NA ENTREGA na Etapa 58** (`cec2b56` serviço, `d18019f` tela, fix-round e9bca72): cada item da entrega aceita `localizacao_origem_id`, `lote_id` e `codigo_lido_origem` (a "localização lida" é a confirmação por leitura da Etapa 56), a origem escolhida é **estrita** (recusa se não cobre) e tudo é validado antes da primeira baixa. **Continua `[ ]` por três motivos:** (1) o registro é na **entrega**, não na **separação** — a rodada de separação não guarda endereço nem lote (próxima etapa); (2) a entrega de **um clique** ("Confirmar Entrega e Baixar Estoque") não escolhe origem (**C80**); (3) **série** e **divergência** por item ficam fora (**D (58)**). **Etapa 59 (`11dcdb5`, `29eb434` + fix-round e2b7dab):** os motivos (1) e (2) estão **pagos** — a separação registra endereço e lote por item (na rodada e como origem planejada do item), e a entrega de um clique sai dali. **Continua `[ ]` só pelo motivo (3):** série e divergência por item (**D (59)**); a "localização lida" na separação (leitura de etiqueta) também fica fora. **Etapa 60 (`eea0687`, `0486b9c` + fix-round 1125a0f):** a **divergência** está paga — cada rodada registra, por item, o máximo separável na hora, se ficou abaixo e o motivo (opcional, **B238**). **Continua `[ ]` só pela SÉRIE** por item (e pela leitura de etiqueta na separação).
- [ ] Substituição de lote com registro — **PARCIAL, pago NA ENTREGA na Etapa 63** (`3e022eb` serviço, `e7f3afa` tela, fix-round `4f008f2`): quando a entrega de um item sai de outro endereço (ou de outro lote, se o separado tinha lote) que não a origem separada, ou vai pelo automático pedido, fica registrado em `substituicoes_origem_requisicao` (quanto, endereço e lote separados e de saída, movimentações, motivo opcional, autor) e o detalhe mostra o bloco "Substituições". **Continua `[ ]` por dois motivos:** (1) a troca **na separação** (uma rodada com outra origem sobre separado pendente apaga a planejada — **B237**) continua **sem registro** (**B248**); (2) trocar a **série** escolhida não conta como troca (**D (63)**). **Etapa 65** (`5290ba8` serviço, `7d2a160` tela, fix-rounds `75ff9a5` e `4512b16`): ~~o motivo (1) está **pago** — a rodada que apaga a planejada registra a troca com `momento = 'SEPARACAO'`.~~ **Revogado pela 196 (B1314):** isto dizia que a troca na separação era um registro devido; **estava errado como regra** — separar não move estoque, e a "troca" era efeito de o item guardar o endereço sem a quantidade. Desde a Etapa 196 (`aecaadd3`) a rodada de outro par **não** apaga a planejada nem grava troca: o item guarda quanto saiu da origem (`quantidade_origem_separacao`) e a parte nova sai no automático na entrega. As linhas `SEPARACAO` antigas continuam no bloco "Substituições". **Continua `[ ]` só pelo motivo (2):** a troca de **série** (**D (63)**, **D (65)**).
- [ ] Separação parcial com saldo pendente — nota (auditoria 2026-08-11): a **parcialidade em si já funciona** (acúmulo de `quantidade_separada` em múltiplas rodadas + teto `maxSeparar`, entregue nas Etapas 3/4); o que falta deste item é a entidade lista-de-separação e o registro de divergência. **Etapa 60:** o registro de divergência está **pago** (`eea0687`, `0486b9c` + fix-round 1125a0f); continua `[ ]` pela lista de separação como entidade
- [ ] Transferir material separado para localização "Aguardando retirada"/"Kit" (movimentação v2 de transferência) — **exige estender `TIPOS_LOCALIZACAO` primeiro** (ver a correção em "O que já existe"): os três tipos que este item pressupõe **não existem** no enum. **Etapa 68 (feature 02):** `TIPOS_LOCALIZACAO` passou a 15 rótulos e a **`Área de expedição`** (que já existia) ganhou semântica de **aviso** — a tela avisa que *"a requisição não usa este endereço — a entrega baixa da origem separada"*. "Aguardando retirada" e "Kit" **continuam não existindo**, e levar o separado para a área de expedição (com a entrega baixando de lá) continua **falta desta feature** — depende da lista de separação como entidade.
- [x] **Segunda conferência (conferente ≠ separador) — PAGA na Etapa 28 (`174d388` + fix-round `5a3d593`, RN-03/05/06/07):** `PUT /requisicoes/:id/conferir-separacao`, ação própria `conferir_separacao` (ADMINISTRADOR, ALMOXARIFE), recusa quem aparece em **qualquer** rodada (403 pela mensagem; `NOT EXISTS` no `WHERE` do claim pela garantia — `claimConferencia` exportado e provado direto), 409 para segunda conferência; **obrigatória** para `liberar-retirada` e `entregar` quando há material crítico separado e não entregue (decisão **B62**); rodada nova limpa a conferência (compare-and-clear) e guarda a apagada em `dados_anteriores`. **Fica de fora, declarado:** conferência só em `EM_SEPARACAO` (**B63**); requisição separada antes da etapa não tem rodada (**C37**). Texto original: **depende do item "responsável" acima**. O
  molde já existe na base e é o mais maduro dela: a dupla assinatura **por identidade** do
  sucateamento (`scrapDisposalService.js:342`, duas ações de perfil próprias, segunda assinatura
  fechando o status num claim único). Aqui falta a primeira metade — saber quem foi o primeiro
- [ ] Kit: identificação e conteúdo
- [x] Liberar para retirada → status da requisição `PRONTA_PARA_RETIRADA` — **entregue na Etapa 3 (2026-08-05)**: rota `PUT /requisicoes/:id/liberar-retirada` (permissão `separar_emitir`), valida a transição na máquina de estados e exige ≥1 item separado, com teste de API. Estava marcado na spec 04 desde a Etapa 3 e **aqui ficou esquecido como pendente** — corrigido na auditoria de 2026-08-11 **+ Etapa 182 (`4ed84488`):** a liberação passa a gravar o momento (`pronta_para_retirada_em`, a última liberação, também por trigger em qualquer caminho que ponha PRONTA), e a feature 20 cobra a caixa parada no balcão — cartão *Separado aguardando retirada* e e-mail por liberação (`1e6677be`). Entrega parcial a partir de PRONTA sai do alerta (B1192).

### Frontend
- [x] Tela de listas de separação (fila de trabalho do almoxarife) — **Etapa 64** (`fb06142` serviço e rota, `88d943a` tela, fix-round `42d7526`): a "Fila de separação" lista as requisições com trabalho de almoxarife, na ordem de trabalho, com as etapas de cada uma e o que falta por item. **Por que [x] sendo por requisição:** a fila de trabalho do almoxarife é o que o item pede; agrupar várias requisições numa **lista** é o item "Lista de separação como entidade própria" (Backend), que continua `[ ]` junto com o agrupamento e a rota de picking.
- [ ] Fluxo de conferência

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Separar mais que o solicitado/estoque falha | `separacao acima do estoque falha` (serviço) **e, desde a Etapa 28, na API:** `separacaoComDono.api.test.js` `[RN-01] payload misto valido+invalido -> 400 e NADA gravado` (que também prova o tudo-ou-nada). **Etapa 95 — esta linha estava furada:** o "estoque" da régua era disponível + reserva do item, sem descontar a caixa; separar acima do físico passava (C169). A regra certa está nas linhas "Etapa 95" abaixo |
| ~~Material separado sai do disponível (vai para localização reservada)~~ **Superada — esta regra estava errada como mecanismo (corrigido 2026-08-11):** desde a Etapa 4 o material sai do disponível **na aprovação**, via reserva (`requisitionService.reservarItensAprovacao`); a separação não move saldo nenhum. *(Etapa 95: continua sem mover saldo, mas o separado ainda não entregue que nenhuma reserva cobre — a "caixa sem reserva" — passa a contar contra o livre na separação, na aprovação e na segunda rodada da entrega; **não** no motor: uma saída avulsa ainda o leva, B466 iv)* | coberto pelos testes de reserva da feature 07 (`requisicaoReservaAutomatica.api.test.js`); mover fisicamente para localização de kit fica com a lista de separação, se vier |
| Segunda conferência exige usuário diferente | **`segundaConferencia.api.test.js` `[RN-03] PESO: separador da PRIMEIRA rodada tenta conferir -> 403`** e `[RN-03] o claim sozinho segura` (Etapa 28) |
| Divergência na separação exige registro | ~~`separacao com quantidade menor exige motivo`~~ — **esta linha estava errada (corrigido na Etapa 59):** o teste citado **não existe** em `server/tests/api/`, e o serviço de separação não tem campo nem regra de motivo de divergência (medido no fechamento da 59, `grep` em `requisitionService.js`). A regra **não está implementada**; é a candidata da próxima etapa. **Etapa 60 — como ficou:** a divergência é **registrada, não exigida** (**B238**): a rodada grava `maximo`, `divergente` e `motivo_divergencia` por item; o motivo é opcional. O nome da regra ("exige registro") descreve o que o sistema faz **se** o separador escrever o porquê — o sistema **não recusa** sem ele. Testes: `separacaoDivergencia.api.test.js` (7 cenários, Etapa 60). |
| Separação com origem: o endereço (no lote) cobre esta rodada somada ao separado pendente de quem planejou o mesmo par; nada é gravado se um item falha | `separacaoOrigemPorItem.api.test.js` — `RN-01 A nao cobre…`, `RN-01 mesma origem em duas rodadas…`, `Fase 5: DOIS itens do mesmo material…` (Etapa 59) |
| A entrega sem origem usa a origem planejada até o separado pendente; `origem_automatica` a ignora; a que não serve mais recusa com o caminho | `separacaoOrigemPorItem.api.test.js` — `C80…`, `RN-03…` (três cenários) (Etapa 59) |
| Entrega com origem escolhida é estrita (recusa se o endereço/lote não cobre; nada sai pela metade quando há escolha) | `entregaOrigemPorItem.api.test.js` — `Fase 2 critico 1`, `Fase 2 critico 2`, `Tudo antes`, `Concorrencia` (Etapa 58) |
| Excluir a requisição devolve ao lote e ao endereço de cada saída | `entregaOrigemPorItem.api.test.js` — `Fase 2 critico 3`, `Fase 5: excluir com DUAS partes…` (Etapa 58) |
| A entrega que sai de outro par (endereço, ou lote quando o separado tinha lote) que não a origem separada registra a troca; sair da própria planejada não registra | `substituicaoOrigem.api.test.js` — `RN-01 separou de A, entregou de B…`, `Metade positiva…`, `Planejada SEM lote vale qualquer lote…`, `origem_automatica…` (Etapa 63) |
| Acima do separado pendente, o pendente sai da origem separada (estrita) e o excedente pelo automático — também com série+lote e cruzando a reserva | `substituicaoOrigem.api.test.js` — `Fase 2 (critico)…`, `Fase 5 (critico): material com SERIE e lote…`, `Fase 5: divisao com RESERVA parcial…` (Etapa 63) |
| ~~A rodada de separação que apaga a origem planejada (outro par, automático, vários pares, só lote) registra a troca com momento SEPARACAO; o mesmo par, sem planejada antes ou planejada já entregue não registram; rodada recusada não registra; falha do registro não derruba a rodada~~ — **revogado pela 196 (B1314):** a rodada de outro par, automática, de vários pares ou só de lote **mantém** a origem e a parte dela e **não** grava troca; o mesmo par soma a parte; a 1ª rodada com endereço vira a origem com a quantidade dela (RN-196.01..05) | `trocaSeparacao.api.test.js` reescrito na 196 (`aecaadd3`: 10 dos 12 nos mesmos cenários com a regra nova; o da falha do INSERT da troca **apagado** — sem INSERT, sem objeto); `origemSeparacaoEmDuasVezes.api.test.js` `[RN-196.01]`..`[RN-196.05]` (Etapa 196) |
| **Etapa 95** — separar não passa do físico: o teto do item = `max(0, reserva − caixa) + max(0, disponível sem a reserva do item − caixa sem reserva dos outros itens − max(0, caixa − reserva))`, arredondado a 1e-6; a caixa dos outros conta em qualquer requisição ativa com caixa (`STATUS_COM_CAIXA`); acima → 400 S2 *"⟨material⟩: não é possível separar ⟨q⟩ ⟨unidade⟩. Máximo: ⟨max⟩ (pendente: ⟨pendente⟩, disponível: ⟨teto⟩)"* | `separacaoTetoFisico.api.test.js` — `[95 RN-01] C1 (o C169)…` a `C7…`, `M2…`, `M5…`, `E3 (critico)…`, `P4 (Fase 2, I1)…`, `decimal (Fase 2, I2)…`, guardas `K1`–`K4`, `M1`, `M6`; `[95 Fase 5] (T5-T7) cada status…` |
| **Etapa 95** — na mesma rodada itens do mesmo material dividem o teto (e o mesmo item duas vezes no payload também); nada é gravado se um falha | `[95 RN-02] M4…`, `[95 RN-02] o mesmo item duas vezes no payload…` |
| **Etapa 95** — duas separações do mesmo material (e separação × entrega, separação × aprovação) acontecem uma depois da outra (trava por material dentro da por requisição) | `[95 RN-01] P1 (Fase 2, B1/B476)…`, `[95 Fase 5] (T1) P1 com R1 de dois materiais…`, `[95 Fase 5] entrega x separacao AO MESMO TEMPO…`; `separacaoTetoFisicoIntegracao.api.test.js` `[95 T4 I6] corrida…` |
| **Etapa 95** — a fila e o detalhe dizem o que a porta aceita | `[95 RN-03]…`; `[95 T4 I4] propriedade…` |
| **Etapa 99** — a separação recusa a forma inválida (Q1 quantidade, Q2 item alheio, Q3 fração de série, Q4 não-lista) antes da alçada de valor e da reivindicação; tudo ou nada; 0, ausente e `[]` continuam aceitos | `separacaoFormaDaEntrada.api.test.js` — `[99 RN-01]`…`[99 RN-08]`; `separacaoFormaDaEntradaIntegracao.api.test.js` — `[99 I1]`…`[99 I4]` |
| **Etapa 99** — a conferência exige caixa > 0 (separado − entregue, `ROUND` a 6 casas) → *"Nenhum item separado"*; o liberar também (RN-10 prova o `ROUND`) | `conferirCaixaVazia.api.test.js` — `[99 RN-09]` C1–C4; `devolverSeparado.api.test.js` — `[98 RN-03] (Fase 5)` com o caso 2,0000001; jest `RequisicoesDevolverPrateleira.test.js` — `[99 RN-09]` (o botão) |

## Dependências

- 03 (movimentação v2 para transferências internas) · 04 (status novos) · 02 (localizações virtuais) · leitura de código de barras fica para Etapa 15 (API deve aceitar campos de leitura desde já).


## Etapa 28 — a separação ganha dono e segunda conferência (2026-08-29, `9cef003..62cb2b1`)

Plano: `docs/superpowers/plans/2026-08-29-almoxarifado-etapa28-separacao-com-dono.md` (RN-01 a
RN-09, contratos C1-C6, fix-round). Design: `docs/superpowers/specs/2026-08-29-almoxarifado-etapa28-separacao-com-dono-design.md`.

**Entregue:** `separacoes_requisicao_almoxarifado` (append-only, uma linha por rodada, `itens_json`);
`conferido_por_id/_nome/_em` em `requisicoes_almoxarifado`; `separarRequisicao(db, id, itens, user)`
em **duas passadas** (valida tudo, depois grava — `5a3d593`); `conferirSeparacao` +
`claimConferencia` (exportado) + `assertConferidaSeObrigatorio` + `conferenciaObrigatoria`
(`material_critico = 1 && separado − entregue > 0`); rotas `conferir-separacao` (nova),
`liberar-retirada` e `entregar` com a barreira RN-06; auditoria `SEPARACAO`,
`CONFERENCIA_SEPARACAO`, `LIBERACAO_RETIRADA`; `GET /requisicoes/:id` com `separacoes`,
`conferencia`, `conferencia_obrigatoria`; tela (`RequisicoesList.js`, `75b5d3d`).

**O que a revisão adversarial achou (Fase 5) e virou código no fix-round `5a3d593`:** (1) o laço
de `separarRequisicao` gravava item a item antes de validar o próximo — **anterior à etapa**, mas a
barreira apoiada na rodada tornou isso um furo (item gravado sem rodada → quem separou conferia);
(2) `maxEntregar` (Etapa 3) solta o teto do separado depois de entrega parcial — para **crítico**
passou a valer `qty ≤ separado − entregue`; comum mantém; (3) `itens_tocados` sem teste; (4) a
releitura da conferência antes do UPDATE tinha janela — compare-and-clear; (5) universo de
"crítico" incluía crítico já entregue; (6) o teste de corrida aceitava conferência de B sem exigir
que a rodada de B a registrasse.

**Não virou código, declarado:** requisição separada antes da etapa não tem rodada (**C37**);
`dbGet` com `UPDATE ... RETURNING` roda fora da `writeChain` (**G9**, pré-existente em todo claim).


## Etapa 58 — a entrega de requisição diz de onde cada item sai (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa58-origem-na-entrega.md`.

**Por que na ENTREGA e não na separação:** a separação é **lógica** — grava quantidade separada e a rodada, **não
move estoque**. O gesto que baixa o saldo, e portanto o que pode dizer "tirei de A", é a entrega. Registrar a origem
**planejada** na separação é a próxima etapa.

**Entregue:**
- [x] Origem por item na entrega (`localizacao_origem_id`, `lote_id`, `codigo_lido_origem` em `itens_atendidos`),
  repassada a todas as baixas do item (excedente e reservada) — `cec2b56`.
- [x] Origem **estrita**: o serviço recusa se o endereço (no lote) não cobre, e o motor ganha `origemEstrita` (4º
  argumento, nunca o body) com a checagem antes e depois da baixa, contra entregas simultâneas — `cec2b56`.
- [x] Validação de **todos** os itens com escolha antes da primeira baixa (endereço, lote do material, status e
  vencimento do lote, leitura, saldo somado por material/endereço/lote) — `cec2b56` + fix-round e9bca72.
- [x] Exclusão da requisição devolve **por saída** (mesmo lote; origem se ainda aceita o material, senão a padrão),
  agrupando por material, com todas as partes validadas antes da primeira devolução — `cec2b56` + fix-round e9bca72.
  **Toca a feature 04 (requisições).**
- [x] Devolução citando a saída herda o lote dela (Estoque/Quarentena) — `cec2b56` + fix-round e9bca72.
  **Toca a feature 12 (devoluções).**
- [x] Tela: "Sai de" e "Confirmar endereço lido" por item na janela de entrega; botão **"Entregar escolhendo de onde
  sai…"** ao lado do de um clique — `d18019f`.

**Fica de fora, declarado:** a entrega de um clique sem origem (**C80**); item sem escolha continua item a item
(**C81**); a janela não marca lote bloqueado/vencido nem endereço bloqueado (**D (58)**); série e divergência por item
(**D (58)**); a herança de lote no Retrabalho não tem teste (**D (58)**).

**A Fase 0 do plano estava errada** num ponto: dizia que não havia rota "onde este material está" — **havia**
(`GET /estoque/:materialId/saldos`); a rota nova planejada caiu.

**Testes:** `server/tests/api/entregaOrigemPorItem.api.test.js` 14/14; `client/.../RequisicoesEntregaOrigem.test.js` 10/10.

## Etapa 59 — a separação diz de onde cada item sai, e a entrega de um clique usa (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa59-origem-na-separacao.md`.

**Entregue:**
- [x] Origem por item na **rodada de separação** (`localizacao_origem_id`, `lote_id` em `itens_separados`),
  validada na passada 1 (tudo ou nada) com a mesma regra da entrega — agora num helper só,
  `checarOrigemItem` —, gravada em `itens_json` e no item como **origem planejada**
  (`origem_separacao_id`, `lote_separacao_id`) — `11dcdb5`.
- [x] Rodadas com origens diferentes sobre separado pendente → planejada nula (automático) — `11dcdb5` (**B237**).
- [x] Entrega sem origem usa a planejada, até o separado ainda não entregue, validada antes da primeira baixa;
  `origem_automatica: true` a ignora; falha da planejada recusa com *"… a origem da separação (X) não serve mais
  (…) — entregue escolhendo de onde sai"*; entregue todo o separado, a planejada é limpa — `11dcdb5`. **Fecha o C80.**
- [x] A checagem da separação conta o separado pendente de **todos** os itens que planejaram o mesmo par; lote sem
  endereço não vira planejada — fix-round e2b7dab.
- [x] Detalhe da requisição traz `origem_separacao_codigo` / `lote_separacao_codigo` — `11dcdb5`.
- [x] Tela: "Sai de" na separação; na entrega, a planejada pré-selecionada só até o separado pendente; "Planejada da
  separação (X)" quando a busca de endereços falha; "separado de X" no detalhe — `29eb434` + fix-round e2b7dab.

**Fica de fora, declarado:** segunda rodada "sem mexer" no Sai de apaga a planejada sem aviso (**B237**, **D (59)**);
não há reserva por endereço (**B236**, **D (59)**); leitura de etiqueta na separação; série e divergência por item.

**Testes:** `server/tests/api/separacaoOrigemPorItem.api.test.js` 11/11; `client/.../RequisicoesSeparacaoOrigem.test.js` 14/14.

## Etapa 60 — separar menos do que dava passa a deixar registro, com o porquê (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa60-divergencia-na-separacao.md`.

**O desenho mudou na revisão do plano:** a primeira versão **recusava** a rodada sem motivo quando se separava menos
que o possível. A Fase 2 derrubou isso — tornaria "divergência obrigatória" o parcial legítimo que esta feature já
entrega (várias viagens, o "Sai de" com uma origem por item em cada rodada, o "Ajustar Separação"), e 111 separações
parciais da suíte seriam recusadas. Ficou **só registro, motivo opcional** (**B238**).

**Entregue:**
- [x] A rodada grava, por item (agregado — o mesmo item duas vezes no payload é uma régua só), `maximo` (o separável
  na hora), `divergente` (`quantidade < maximo`, tolerância `1e-9`) e `motivo_divergencia` (opcional, trim, até 500) em
  `itens_json` e na auditoria `SEPARACAO` — `eea0687`.
- [x] O `maximo` desconta o que **outros itens do mesmo material** separam na mesma rodada; com uma origem só na
  rodada, é limitado ao saldo nela menos o separado ainda não entregue de quem planejou o mesmo par — **inclusive de
  outras requisições**; lote sem endereço limita pelo saldo do lote. O motivo escrito **nunca** é descartado (**B239**)
  — fix-round 1125a0f.
- [x] Tela: "Motivo da divergência (opcional)" no modal de separação abaixo do máximo (a mesma régua do servidor, sem
  as outras requisições); bloco "Separação (N)" com *"⟨material⟩: separou ⟨q⟩ de ⟨máximo⟩ — ⟨motivo⟩"* / *"— sem
  motivo informado"*, uma linha por item — `0486b9c` + fix-round 1125a0f.
- [x] Os dois testes da Etapa 28 que comparavam a rodada e a auditoria com `deepStrictEqual` comparam os campos de
  antes e exigem os novos (contrato aditivo), e voltam a provar que rodada **sem** origem não carrega origem/lote.

**Fica de fora, declarado:** a divergência não recusa, não avisa, não abre não conformidade nem ajusta (**B238**,
**D (60)**); ~~separado **sem** endereço de outra requisição não sai do "livre" (a separação não reserva) — o máximo pode
sair maior que o real (**D (60)**)~~ — isto dizia que o separado sem reserva de outra requisição continuava contando como
livre, e o tratava como imprecisão inofensiva do `maximo`; **estava errado e foi revogado na Etapa 95 (B467)**: não era
só o registro — a **porta** também o contava como livre, e duas requisições separavam os mesmos 4 físicos (M2; a mesma
família do **C169**). O certo, desde `f8edb54a`: a caixa sem reserva de qualquer requisição com caixa sai do livre para
a separação (a porta recusa com a S2) e para a aprovação (`9237af2c`); ver o bloco "Etapa 95"; quantidade 0 não fica
registrada (**D (60)**); **série** por item.

**Testes:** `server/tests/api/separacaoDivergencia.api.test.js` 7/7; `separacaoComDono.api.test.js` 11/11;
`client/.../RequisicoesSeparacaoDivergencia.test.js` 12/12.

## Etapa 61 — a entrega de material com série diz QUAIS séries saem (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa61-serie-na-entrega.md`. Toca também as features **04**
(entrega e exclusão de requisição) e **10** (séries — onde a pendência (a) de série é **corrigida à vista**: a
isenção da entrega era o defeito, não uma decisão de escopo).

**O defeito, medido por sonda:** material com série, entrada de 3 séries, entrega de 2 pela rota → **200**; físico
**1**, séries em estoque **3**. O invariante `séries presentes == físico` quebrava a cada entrega, e a série entregue
podia sair de novo.

**Entregue:**
- [x] A entrega exige `serie_ids` para material com série (N == quantidade, inteira; séries do material, em estoque,
  sem repetição — nem entre itens —, de um lote só; o lote da saída vem das séries e tem de bater com o escolhido ou o
  planejado), validado antes de qualquer baixa; as séries se dividem entre as baixas (excedente + reservada) e o motor
  é chamado com `exigeSerie` — `6ba7429`, fix-round `77d084c`.
- [x] A exclusão da requisição devolve **por saída**, **líquido das devoluções**, com as séries daquela saída; saída
  legada sem série volta como antes; séries que não batem com o que falta devolver → recusa antes da 1ª ENTRADA —
  `6ba7429`, fix-round `77d084c`.
- [x] Regularização das séries (`POST /materiais/:id/series/regularizar`) para o legado — ver spec 10 — `6ba7429`,
  fix-round `77d084c`.
- [x] Tela: séries na janela de entrega (contador, confirmar travado até bater, lotes misturados barrados, recarga
  após erro); regularização na aba Séries de Lotes e Séries — `d74e5a8`, fix-round `77d084c`.
- [x] O teste `serieControleObrigatorio` "entrega continua isenta de série" foi **reescrito de propósito** (a isenção
  era o defeito).

**Fica de fora, declarado:** a entrega de um clique de material com série é **recusada** (a janela escolhe);
`AJUSTE`/inventário de material com série mudam o físico sem tocar em série (**C82** — a regularização é o remédio);
transferência não move a série (**C76**); a compensação da regularização só é exercitada em corrida (**D (61)**).

**Testes:** `server/tests/api/entregaSeriePorItem.api.test.js` 15/15; `serieControleObrigatorio.api.test.js` 8/8;
`client/.../RequisicoesEntregaSerie.test.js` e `LotesRegularizarSeries.test.js`.

## Etapa 63 — a troca da origem separada fica registrada na entrega (2026-10-01)

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa63-substituicao-na-entrega.md`.

**O que estava calado (Fase 0):** a separação grava a origem planejada (Etapa 59), mas a entrega que saía de outro par
(origem no payload, que vence a planejada — **B235** —, ou `origem_automatica`) não deixava rastro, e a planejada é
limpa depois da entrega total. E acima do separado pendente **tudo** saía pelo automático (o livro podia dizer "saiu de
B" do que estava na caixa tirado de A).

**Entregue:**
- [x] Registro da troca em tabela própria, só de acréscimo (`substituicoes_origem_requisicao`: planejada e saída com
  endereço e lote, ids das movimentações, motivo opcional, autor) — um por item por entrega, quantidade
  `min(entrega, separado pendente)`; planejada sem lote compara só o endereço; o lote do automático vem do livro;
  gravado num `finally` (falha no meio do item também registra) — `3e022eb`, fix-round `4f008f2`.
- [x] Acima do separado pendente a baixa se **divide**: o pendente sai da planejada (estrita), o excedente pelo
  automático; o pedaço automático de item com série leva o lote das séries — `3e022eb`, fix-round `4f008f2`.
- [x] O detalhe da requisição traz `substituicoes`; a tela mostra o bloco "Substituições (N)", pede "Motivo da troca
  (opcional)" e avisa na dica do pendente que a entrega pode ser recusada — `e7f3afa`, fix-round `4f008f2`.

**Estava errado, dito à vista:** (1) o comentário da tela que dizia que o servidor "aplicava a planejada até o pendente
e completava automático acima" — até esta etapa, acima do pendente tudo saía automático (corrigido no código); (2) a
frase do commit `3e022eb` "nada que hoje passa é recusado" — acima do pendente a parte separada agora é estrita e pode
ser recusada (**B251**, **C84**).

**Fica de fora, declarado:** a troca na separação (**B248**); a troca de série; a rastreabilidade por lote ainda não lê
a tabela (feature 10); o registro não acompanha estorno/exclusão; a janela compara o lote da opção e o servidor o das
séries (**D (63)**).

**Testes:** `server/tests/api/substituicaoOrigem.api.test.js` 7/7 (7 sabotagens, 1 verde por guarda redundante —
declarada); `client/.../RequisicoesSubstituicaoOrigem.test.js` 16/16 (9 sabotagens).

## Etapa 64 — a fila de separação do almoxarife (2026-10-01)

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa64-fila-de-separacao.md`.

**O que faltava (Fase 0):** o almoxarife trabalhava em `GET /api/almoxarifado/requisicoes` (`warehouseMode` em
`RequisicoesList.js`): ordem urgência e depois **a mais nova primeiro**, só o cabeçalho — nada por item. `?minha=1` é
"as minhas como **solicitante**", não "minha fila".

**Entregue:**
- [x] `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`), `requisitionService.listarFilaSeparacao` — **só
  leitura**: uma consulta de requisições, **uma** de itens (`IN`, o mesmo disponível de `carregarItensRequisicao`, com
  a reserva da própria requisição — *Etapa 95: separável = disponível + reserva estava errado, não descontava a caixa;
  desde `5a2bfa9f` a consulta traz a caixa sem reserva dos outros itens e a fila usa o teto físico*) e uma de separadores; não chama `verificarBloqueioLiberacao` — `fb06142`.
- [x] `etapas[]` por requisição: `SEPARAR` (algum item com `maxSeparar` > 0), `AGUARDANDO_SALDO`, `CONFERIR` (só em
  `EM_SEPARACAO`), `REABRIR_SEPARACAO` (só em `PODE_SEPARAR`), `CONFERENCIA_SEM_SAIDA` (fora dele, não acionável),
  `ENTREGAR` (algum item com `entregavel` = min(separado − entregue, disponível) > 0), `APROVACAO_VALOR` (avaliação ao
  vivo e só leitura, `avaliarRequisicaoValor`; *Etapa 94: só enquanto a alçada de valor ainda vale — `19e294fc`, B457 —, e
  a etapa nova `RETOMAR_SEPARACAO`, B460; ver o bloco "Etapa 94"*); `acionavel`, `separadores`, `posso_conferir` — `fb06142`, fix-round
  `42d7526`.
- [x] Ordem: acionável primeiro; urgência (`UPPER`: CRITICO, URGENTE, resto); data de necessidade (sem data por último);
  a mais antiga primeiro (**B252**) — `fb06142`.
- [x] Tela "Fila de separação" (menu depois de "Requisições (almox.)"; grupo "Aguardando" para as não acionáveis; um
  chip por etapa; por item "a separar X (separável agora Y) · a entregar Z (entregável agora E) · disponível D ·
  separado de …"; 403 vira painel de permissão; "Abrir" → `/almoxarifado/requisicoes?id=X`) — `88d943a`, fix-round
  `42d7526`.

**Estava errado, dito à vista:** o plano (Fase 2) e o commit `fb06142` descartaram a avaliação de valor ao vivo porque
"a avaliação escreve" — **falso**: `avaliarRequisicaoValor` só lê; quem escreve é `atualizarValorRequisicao` /
`verificarBloqueioLiberacao`. E o flag gravado nunca coincidia com status separável (**B255**).

**Fica de fora, declarado (D (64)):** lista como entidade, agrupamento e rota; "Abrir" abre o detalhe, não o modal de
separar; o menu aparece para todos com acesso ao módulo; `data_necessidade` legada em `DD/MM/AAAA` ordena errado; item
serializado sem séries em estoque aparece como entregável; a avaliação de valor é uma consulta por requisição.

**Testes:** `server/tests/api/filaSeparacao.api.test.js` 11/11 (14 sabotagens, todas vermelhas);
`client/src/components/almoxarifado/FilaSeparacao.test.js` 10/10 (11 sabotagens, todas vermelhas).

## Etapa 65 — a troca de origem NA SEPARAÇÃO fica registrada (2026-10-01)

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa65-troca-na-separacao.md`.

**O que estava calado (Fase 0):** `separarRequisicao` apaga a origem planejada quando uma rodada nova nomeia outro par
(ou nenhum) sobre separado ainda não entregue (**B237**) — sem registro (**B248**, **D (63)**). E a janela de separação
abria com "Sai de" automático: a segunda rodada de um clique apagava a planejada de todo item (**D (59)**).

**Entregue:**
- [x] Registro da troca na separação — `substituicoes_origem_requisicao` ganha `momento TEXT NOT NULL DEFAULT 'ENTREGA'`
  (o legado e a entrega viram `ENTREGA`) e `separacao_id`; a rodada que termina sem a planejada que o item tinha
  **antes** dela (retrato tirado antes da passada 1, não o item mutado em memória) grava uma linha `SEPARACAO`:
  quantidade = o separado pendente planejado antes da rodada; saída = o par da rodada (um par só), nula com vários pares,
  `automatica = 1` sem nenhum par; só entradas com quantidade > 0 contam; motivo opcional `motivo_substituicao` (o
  primeiro não vazio, só texto, ≤ 500); `movimentacao_ids` nulo (separar não move estoque); gravado **depois** do INSERT
  da rodada (rodada recusada não registra), best-effort com `console.warn` — `5290ba8`, fix-round `75ff9a5`.
- [x] `listarSubstituicoes` devolve `momento` (`COALESCE(..., 'ENTREGA')`) — `5290ba8`.
- [x] Tela: a linha `SEPARACAO` do bloco "Substituições" não diz "saiu de" — *"⟨cód⟩: ⟨q⟩ já separados de ⟨A⟩[ — lote
  ⟨L⟩] · nova separação ⟨de B[ — lote L] | do lote L | sem origem (automática) | de mais de uma origem⟩ — a origem
  anterior deixou de valer[ · motivo]"*; a da entrega fica igual — `7d2a160`.
- [x] Tela: o "Sai de" da separação parte da planejada (par exato) quando ela está nas opções **e cobre** a quantidade
  sugerida (`maxSeparavelNaTela`); com quantidade > 0 e outro par (inclusive automático), o aviso *"A origem da separação
  anterior (⟨A⟩[ — lote ⟨L⟩]) deixa de valer: o que já está separado passa a sair automático na entrega."* e o campo
  "Motivo da troca (opcional)" — `7d2a160`, fix-round `4512b16`.

**Estava errado, dito à vista:** a Fase 2 deste plano mandou alinhar a separação à régua da entrega ("planejada sem
lote vale qualquer lote do endereço") e o commit `5290ba8` implementou — **estava errado**: só a **comparação** da troca
da entrega (Etapa 63) pensa assim; o saldo da origem, o `pedidoSeparacao` e o motor leem (A, sem lote) como "o saldo
sem lote em A", e a entrega de um clique de (A, —) + (A, L1) passou a ser recusada (*"O saldo em A (2) não cobre a
quantidade (6)…"*). Voltou o par exato em `75ff9a5`: (A, —) → (A, L1) apaga a planejada e registra a troca. A
afirmação do teste da Etapa 63 ("Planejada SEM lote vale qualquer lote") continua certa — é da **entrega**.

**Fica de fora, declarado (D (65)):** a troca de **série** (o item "Substituição de lote com registro" continua `[ ]`);
a planejada continua **uma só** por item (caixa mista = sem planejada — **B256**); saldos que falham ao carregar, ou
clique antes de eles chegarem, abrem em automático (a rodada troca, o aviso aparece e o servidor registra).

**Testes:** `server/tests/api/trocaSeparacao.api.test.js` 12/12 (8 sabotagens, todas vermelhas na asserção certa);
`client/src/components/almoxarifado/RequisicoesTrocaSeparacao.test.js` 19/19 (9 sabotagens vermelhas; a troca da guarda
`hasOwnProperty` por "truthy" pendura num laço de render — prova a guarda, mas não por asserção; inverter a ordem do
merge é equivalente e fica verde).

## Etapa 92 — a separação reivindica a requisição antes de gravar (2026-10-08)

Plano: `docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md`.

**O que estava errado (Fase 0, medido):** `separarRequisicao` gravava `EM_SEPARACAO` só no fim, com `WHERE id=?` — um
cancelamento que entrasse entre a leitura e esse `UPDATE` respondia 200 e a separação passava por cima: a requisição
"ressuscitava" em `EM_SEPARACAO` com a reserva já solta (50/50 pelo cancelamento do almoxarifado, 10/10 pelo dos outros
módulos, com gancho; 8/70 e 4/70 sem gancho). Esta spec não dizia nada sobre a separação conferir o status ao gravar —
**omissão, não afirmação errada**; fica dito aqui.

**Entregue:**
- [x] **Reivindicação antes de gravar** — `6a0b529c` (B436): depois da passada 1 e antes de `const tocados`, `UPDATE
  requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=…, ultimo_lembrete_enviado=NULL WHERE id=? AND status
  IN (PODE_SEPARAR)`; `changes` 0 → `console.info` I2 e 400 com `MSG_STATUS_SEPARAR` (a literal de sempre, agora
  constante). O `else` do "Iniciar Separação" sem quantidade saiu (a reivindicação faz o que ele fazia). A
  reivindicação **não** limpa a conferência (só a rodada com quantidade limpa — D3 da 28). Testes RN-03 (as duas rotas de
  cancelamento × cinco status × com/sem quantidade, e pelo serviço).
- [x] **Falha depois de reivindicar devolve o status (RN-09)** — `6a0b529c`: as gravações depois da reivindicação num
  `try/catch`; sem rodada inserida e `reqRow.status !== 'EM_SEPARACAO'` → devolve o lido com `WHERE … AND
  status='EM_SEPARACAO'` e W2; relança sempre. **Fase 5 `f3b2b4fb`:** essa devolução apagava a separação concorrente que
  venceu (B reivindica e trava; A reivindica — `EM_SEPARACAO` está em `PODE_SEPARAR` —, grava a rodada, 200; B falha e
  devolvia o status → cancelável com material na caixa; 5/5) — agora `ultimaRodadaAntes = COALESCE(MAX(id),0)` é lido
  **antes** do `reqRow` e o `UPDATE` de devolução ganha `AND NOT EXISTS (rodada com id > marca)`; a guarda não devolveu
  → sem W2, relança. RN-09 (a)–(d).

**Fica de fora, declarado (D (92))** — *(resolvido pela Etapa 93 — ver o bloco no fim. **A frase "não foi medida" abaixo estava errada no que sugeria:** a Fase 0 da 93 mediu e as corridas liberar-retirada/entrega × separação acontecem 5/5 com gancho (1a, 1b, 1c, 3a, 3b, 3c), duas delas **prendem** a requisição (1c, 3c) e a 3c prende **reserva**. O texto original fica para o histórico:)* os `UPDATE` do *compare-and-clear* da conferência (depois da rodada) regravam
`EM_SEPARACAO` sem guarda de status — uma exclusão administrativa no meio termina com a requisição excluída (`ativo=0`)
de volta a `EM_SEPARACAO` (achado 7 da Fase 5, reproduzido), e uma *liberar-retirada*/*entrega* concorrente da mesma
requisição não foi medida — **Etapa 93**; um "Iniciar Separação" sem quantidade concorrente não grava rodada e a guarda
da devolução não o vê; a guarda `AND status='EM_SEPARACAO'` da devolução não tem teste que a derrube. O que falta para
🟢 não mudou: lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada, localização
de kit e kits.

**Testes:** `server/tests/api/separacaoNaoRessuscita.api.test.js` 33/33 (RN-03, RN-04, RN-09; controles s1–s6 da T0
todos vermelhos na asserção prevista — o s3 sem quantidade caiu em "separação 400" antes de "gancho disparou", só ordem
das asserções); `cancelarOutrosModulosIntegracao.api.test.js` jornadas B1/B2 e o par de serviço.

## Etapa 93 — dois gestos na mesma requisição não passam um por cima do outro (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa93-gestos-concorrentes-mesma-requisicao.md`.

**O que estava errado (Fase 0, medido 5/5 cada com gancho):** depois da reivindicação da 92, os dois `UPDATE` do
*compare-and-clear* da conferência regravavam `EM_SEPARACAO` com `WHERE id=?` (sem status), e a liberação para retirada
gravava `PRONTA_PARA_RETIRADA` com `WHERE id=?` depois de validar a barreira do crítico **na leitura**. Corridas: (1a) a
exclusão administrativa no meio da separação deixava a requisição excluída (`ativo=0`) em `EM_SEPARACAO`; (1b) a
liberação sumia sob a rodada seguinte; (1c) a requisição toda entregue voltava a `EM_SEPARACAO` e nunca chegava a
`ENTREGUE`; (3a) liberar × entregar tudo deixava `PRONTA_PARA_RETIRADA` com tudo entregue, presa; (3b) liberar × excluir
deixava a excluída `PRONTA`; (3c) liberar no instante de uma rodada nova de crítico liberava sem a segunda conferência e
**prendia** a requisição e a reserva (**C158**). O D (92) desta spec dizia "não medido" — corrigido à vista acima.

**Entregue:**
- [x] **A trava por requisição** — `fa4ae85c` (separar, entregar, excluir) e `034076ff` (liberar, encerrar), B443: o
  segundo gesto espera e lê o estado novo (a rodada depois da liberação → 400 *"Requisição deve estar aprovada, aguardando
  estoque/compra, em separação ou parcialmente atendida para separar"*). Não reentrante; ordem sempre requisição →
  material; nunca pega de dentro da trava por material (medido na Fase 2: 0 de 1574 aquisições).
- [x] **O *compare-and-clear* confere o status (B444)** — `908ee2a1`: `AND status='EM_SEPARACAO'` **depois** de
  `conferido_por_id IS ?` (a regex do teste da 92 depende da ordem); perdeu por status → limpa a conferência, não
  regrava o status, W3, grava a trilha da rodada e responde **409** *"A requisição mudou de status durante a separação
  (agora ⟨status⟩); a rodada ficou registrada — confira a caixa antes de separar de novo."* Fase 5 `2661bdd1`: a última
  tentativa (depois de 3 corridas na conferência) também confere `changes` — antes respondia 200 sobre um escritor que
  tirasse a requisição de `EM_SEPARACAO` bem ali (item 4 da revisão).
- [x] **A liberação confere o status e a marca de rodada (B445)** — `03c147cb`: `WHERE id=? AND status=? AND NOT EXISTS
  (rodada com id > marca lida antes)`, laço de 2 refazendo as recusas de hoje; perdeu as duas → **409** *"A requisição
  mudou enquanto era liberada para retirada; recarregue e confira antes de liberar."* Fase 5 `92d995a0`: RN-08 (b''')
  prende que a marca lida tarde liberava o crítico sem segunda conferência (sabotagem que passava verde).

**Alcance:** com a trava, o 409 X1 e o L1 só acontecem com escritor fora dela (outro processo, escrita direta) — os
testes os provocam por SQL direto no gancho (RN-08). **Residual declarado (M2):** depois do 409 X1 o modal de separação
fica aberto; em *Parcialmente Atendida* um novo "Separar" grava a mesma caixa de novo — só fora da trava; a literal manda
conferir a caixa antes.

**Fica de fora:** a conferência fora da trava (B450 — já reivindica no `WHERE`); `verificarBloqueioLiberacao` gravando
`AGUARDANDO_APROVACAO_VALOR` de `EM_SEPARACAO`/`PARCIALMENTE_ATENDIDA` *(resolvido pela Etapa 94 — ver o bloco no fim; o
texto nomeava dois status, mas o desvio saía de qualquer um em que a separação ou a entrega rodassem, também de
`PRONTA_PARA_RETIRADA` pela entrega)*; prazo para pegar a trava. **O que falta para
🟢 não mudou:** lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada, localização
de kit e kits. A parte de integridade (D (92)) saiu da lista de faltas.

**Testes:** `server/tests/api/requisicaoGestosConcorrentes.api.test.js` 48 (RN-01…RN-09, controles de cada task
vermelhos na asserção prevista, divergências no plano); `requisicaoGestosConcorrentesIntegracao.api.test.js` 10 (jornadas
A–E pela rota e pelo serviço, A44 vazia no fim, controle positivo da A44).

## Etapa 94 — a alçada de valor vale até o começo da separação (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa94-alcada-de-valor-ate-a-separacao.md`. A regra completa
(onde a alçada é conferida, gatilhos, o risco aceito) está na feature 06, bloco "Etapa 94".

**O que estava errado (Fase 0, medido):** `verificarBloqueioLiberacao`, chamada na separação e na entrega, recalculava
o valor e gravava *Aguardando aprovação de valor* por fora da máquina de estados, de qualquer status — inclusive com
material separado ou entregue (sonda 1: 5/7 por gatilho; sonda 2: 7/8 por origem). Daí reprovar ou cancelar soltavam a
reserva com o material na caixa, e aprovar por valor devolvia *Reservada* com material entregue (C163). E a fila de
separação, que reimplementa a regra ao vivo, mostrava *Aguardando aprovação de valor* numa requisição em separação,
pronta ou parcialmente atendida (3/3, C165) — um gesto que a porta, agora, não recusa.

**Entregue:**
- [x] **A separação só reconfere a alçada antes de começar** — `a758d39d` (B453, B454, B455, B462): o predicado
  `alcadaDeValorAindaVale(status, itens)` vale nos cinco status anteriores à separação e na `EM_SEPARACAO` **vazia**
  (*Iniciar Separação* sem quantidade), sem nada separado nem entregue. Com material na caixa a separação e a entrega
  seguem sem ler custo e sem gravar nada. Na entrega a verificação roda **depois** das recusas da própria entrega — Fase 5
  `ad5fcd7f` (B464): a entrega numa *Em Separação* vazia com o limite baixado gravava a alçada (403, status mudado,
  e-mail) antes do 400 da entrega.
- [x] **A gravação da alçada confere o status lido** — `7b66807f` (B456): separar × cancelar no mesmo instante → **409**
  *"A requisição mudou de status enquanto a alçada de valor era conferida (agora CANCELADO); recarregue e confira antes
  de separar."* em vez de ressuscitar a cancelada (C164).
- [x] **A fila usa o mesmo predicado** — `19e294fc` (B457): `APROVACAO_VALOR` só enquanto a alçada vale; numa *Em
  Separação* com material, *Pronta* ou *Parcialmente Atendida* a fila mostra `ENTREGAR`. **Etapa nova
  `RETOMAR_SEPARACAO`** (acionável, chip *"Reabrir separação"*; B460) para o legado: status anterior à separação (os
  cinco — não `EM_SEPARACAO`, onde já há *Ajustar Separação*) com algum item separado > entregue e nada mais a separar
  (`separacaoAReabrir`); antes essa requisição **sumia** da fila (nada a separar, e `*_RESERVADA` fora de
  `PODE_ENTREGAR`). Não confundir com `REABRIR_SEPARACAO` (Etapa 64, chip *"Separar de novo para conferir"*), que é a
  conferência pendente fora de `EM_SEPARACAO`.
- [x] **A tela** — `9cafb842` (B460, B463): no legado com tudo separado, *Iniciar Separação* abre o modal com o aviso
  *"Todo o material desta requisição já está separado. Confirme para reabrir a separação e seguir para a entrega."* e o
  botão **habilitado** *"📦 Reabrir separação"* (manda zero itens; o servidor leva a *Em Separação*; daí Entregar). Um
  409 na separação fecha o modal e recarrega o detalhe e a lista (o toast mostra a mensagem). Fase 5 `c729b784` (B465):
  o 403 da alçada (`code: 'AGUARDANDO_APROVACAO_VALOR'`, que as rotas `/separar`, `/separacao` e `/entregar` passam a
  mandar) faz o mesmo; um 403 de permissão mantém o modal. Fecha também o residual **M2** da 93 para o 409 X1.
- [x] **Integração** — `79a766e9` (`alcadaValorDepoisDaSeparacaoIntegracao.api.test.js`, 10/10: jornadas A–G pela rota
  e pelo serviço, até `ENTREGUE`, e a A45); Fase 5 `469fda3b` (testes para quatro sabotagens que passavam verde).

**Fica de fora:** o lembrete da requisição que volta a aguardar valor depois de aprovada (C68/A25, feature 06); guarda em
reprovar/cancelar para o legado que o desvio já deixou com caixa (a **A45** o acha); os cancelamentos na trava por
requisição (B450). Nenhum clique no navegador foi dado nesta etapa — a tela foi provada por teste de componente.

**Pendência medida — defeito antigo, achado no fechamento (C169, Etapa 95): a separação aceita mais que o físico.**
**→ RESOLVIDA na Etapa 95** — a porta `f8edb54a`, a aprovação `9237af2c`, a fila e o detalhe `5a2bfa9f`, a tela
`c335cf40`; a entrega sob a trava por material `582844e8`. A "causa provável" abaixo estava **incompleta**: o defeito
acontecia também **sem reserva**, entre **requisições diferentes** (M2), entre **itens da mesma rodada** (M4) e na
**aprovação** (M3) — ver o bloco "Etapa 95". O texto fica como a medição da 94:
Pede 6, estoque 4, aprova (reserva 4) → separa 4 → a fila mostra separável 2 → separar +2 → **200**, 6 separados para 4
físicos (também em *Parcialmente Reservada*). Depois: entregar 6 → 400 *"… Máximo: 4 …"*; entregar 4 → 200 *Parcialmente
Atendida*, estoque 0, item com separado 6 / entregue 4 — 2 "na caixa" que não existem. Causa provável (a confirmar na
Fase 0 da 95): o disponível do item soma de volta a reserva da própria requisição (que já cobre o separado) sem
descontar o separado ainda não entregue. Não foi introduzido pela Etapa 94.

**O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada,
localização de kit e kits; ~~e, de integridade, o **C169** (Etapa 95)~~ *(pago na Etapa 95 — ver o bloco no fim)*.

**Testes:** `server/tests/api/alcadaValorDepoisDaSeparacao.api.test.js` (`[94 RN-01]`…`[94 RN-05]` + `[94 F5]`),
`alcadaValorDepoisDaSeparacaoIntegracao.api.test.js` (10/10), `client/src/components/almoxarifado/RequisicoesReabrirSeparacao.test.js`;
`filaSeparacao.api.test.js` segue verde (os casos de `APROVACAO_VALOR` antes da separação continuam).

## Etapa 95 — a separação não aceita mais do que existe na prateleira (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa95-separacao-limitada-ao-fisico.md` (`f0b94706`, Fase 2
`2bee899c`). Range `f0b94706..42e08faf`. Features 05 com a 04 e a 07.

**O que estava errado (Fase 0, medido):** separar não move estoque, e o separado ainda não entregue (a "caixa") não era
descontado de lugar nenhum. O teto da separação era `min(pendente, disponível + reserva do item)`: a reserva cobria a
caixa e ainda era somada de volta. Daí: **C169 (C1)** — pede 6, físico 4, aprova (reserva 4), separa 4 → separar +2
passava (6 na caixa para 4); **M2** — R1 e R2 aprovadas sem estoque, entram 4 soltos, as **duas** separavam 4 (8 na caixa
para 4); **M4** — dois itens do mesmo material numa rodada, 4 + 4 com físico 4 passava; **M3** — a aprovação de R2
reservava os 4 que estavam na caixa sem reserva de R1, e R1 ficava presa (entregar → 400 *"Máximo: 0"*); **P3** — a
segunda rodada da entrega (já entregou algo, sem separar) levava o físico da caixa sem reserva de outra requisição.

**A regra (lida no código, `requisitionService.tetoSeparacao` / `caixaSemReservaSql`):** a *caixa* de um item é o
separado − entregue; a *caixa sem reserva* é `max(0, caixa − reserva ativa do item)`. O que o item pode separar agora
(o teto) é o que a reserva dele ainda segura além do que ele já tem na caixa, mais o livre do material depois de tirar a
caixa sem reserva dos **outros** itens (de qualquer requisição ativa, inclusive a mesma) e a parte da caixa dele que a
reserva não cobre — `max(0, r − c) + max(0, disp − csrOutros − max(0, c − r))`, arredondado a 1e-6. Separável =
`min(pendente de separação, teto)`. Contam como caixa as requisições ativas em *Aprovado*, *Aguardando estoque*,
*Aguardando compra*, *Parcialmente/Totalmente Reservada*, *Em Separação*, *Parcialmente Atendida*, *Pronta para retirada*
e *Aguardando aprovação de valor* (`STATUS_COM_CAIXA`, B473); a caixa de *Entregue*, *Encerrada*, *Cancelada*,
*Reprovada*, excluída e *Pendente* volta a contar como livre, sem movimento de estoque.

**Entregue:**
- [x] **T0 — a conta única e a porta da separação** — `f8edb54a` (B466, B468, B471, B473, B474; Fase 2 B476, B478):
  `tetoSeparacao`, `caixaSemReservaSql`, `STATUS_COM_CAIXA`; a porta recusa acima do teto com a S2 de **forma
  inalterada** — muda o número do `disponível` (o teto) e do `Máximo`: *"Parafuso: não é possível separar 2 PC. Máximo: 0
  (pendente: 2, disponível: 0)"*; itens do mesmo material dividem o teto na rodada; a régua da Etapa 60 (`maximo`
  registrado) usa a mesma conta com o separado de antes da rodada; a separação pega a trava por material dos itens dentro
  da por requisição (B476, invertida na Fase 2 — sem ela duas separações do mesmo material passavam juntas, 10/10); dois
  índices novos no `schema.js` (B478 — a fila ficava ~40× mais lenta sem eles). Commit próprio do `CLAUDE.md` `4f89c295`.
- [x] **T0b — a segunda rodada da entrega não leva a caixa de outra** — `35e274c5` (B477): na segunda rodada (já
  entregou, a própria caixa menor que o pendente, material comum) a parte além da própria caixa é limitada ao teto. P3:
  *"… não é possível entregar 4 PC. Máximo: 0 (pendente: 4, disponível: 4)"*.
- [x] **T2 — a aprovação não reserva a caixa sem reserva de outra requisição** — `9237af2c` (B469; regra na feature 07).
- [x] **T1 — a fila e o detalhe dizem o que a porta aceita** — `5a2bfa9f` (B472): a fila (`separavel`) e o detalhe
  (`saldo_separavel`, `quantidade_separavel`) dão o **mesmo** número; com separável 0 e algo a separar a fila mostra
  `AGUARDANDO_SALDO`. `saldo_atual` não muda (contrato na feature 04).
- [x] **T3 — a tela usa o separável do servidor** — `c335cf40`: o máximo do campo e o pré-preenchimento do modal usam
  `saldo_separavel` (caem no `saldo_atual` se o servidor não mandar); itens do mesmo material dividem o pré-preenchimento
  na ordem do pedido; item com separável 0 não aparece entre os separáveis e *Confirmar Separação* fica desabilitado
  quando nada há a separar. `FilaSeparacao.js` não muda.
- [x] **T4 — integração** — `ed90a0aa` (`separacaoTetoFisicoIntegracao.api.test.js`: I1 o C169 do começo ao fim, I2 o M3
  até as duas *Entregue*, I3 pelo serviço, I4 a propriedade fila = detalhe = porta, I5 o P3, I6 a corrida separar ×
  aprovar, e o controle positivo da **A46**).
- [x] **Fase 5 (revisão adversarial)** — `582844e8` (a entrega pega a trava por material dos itens — B479: entrega ×
  separação de outra requisição do mesmo material passavam juntas, 10/10, e deixavam caixa fantasma); `6e0fae83` (a
  reserva da aprovação arredondada a 1e-6 — físico 0,3 com 0,1 na caixa de outra reservava 0,19999… e ficava *Parcialmente
  Reservada*); `16cacc0e` (o detalhe não expõe a coluna crua `caixa_sem_reserva_outros`); `42e08faf` (testes da revisão
  para a corrida da entrega e para as sabotagens que passavam verde).

**Spec que estava errada, dita à vista:** o "Fica de fora" da Etapa 60 (separado sem reserva de outra requisição não sai
do livre) — riscado no bloco "Etapa 60", revogado (B467); a "causa provável" do C169 no bloco "Etapa 94" — incompleta;
a linha "Separar mais que o solicitado/estoque falha" da tabela de regras — furada (o "estoque" era disponível + reserva);
a fila da Etapa 64 com "o mesmo disponível, com a reserva da própria requisição" — não descontava a caixa.

**Fica de fora (declarado, com o porquê):**
- A entrega fora da segunda rodada (B470) — continua por disponível + reserva do item.
- **(Corrigido na Etapa 98 — isto dizia "não há gesto de devolver da caixa"; estava desatualizado desde `9e0bb225`; o
  certo é: o almoxarife devolve à prateleira pelo gesto da 98 — ver a seção "Etapa 98" no fim. O C174 abaixo fica
  resolvido: a caixa sai sem estornar o entregue; a requisição fica *Em Separação* esperando saldo.)** Texto original:
  ~~Corrigir o legado — não há gesto de "devolver da caixa"; a consulta **A46** lista as caixas acima do físico e o
  administrador decide por status (*Parcialmente Atendida* → Encerrar; *Em Separação*/*Pronta* com entregue 0 → excluir;
  *Em Separação* com entregue > 0 e sem físico → sem gesto limpo, **C174**). Produto novo.~~
- A chegada, a liberação, o estorno (74/75) e o recálculo (76) — dão primeiro a quem já tem caixa sem reserva (B475, C173).
- `calcularStatusPosAprovacao` — a requisição aprovada com a caixa de outra ocupando o físico pode ficar *Aprovado* sem
  reserva e a fila a mostra *Aguardando saldo* (C172, cosmético).
- ~~O motor — uma **saída avulsa** ainda leva o físico que está na caixa sem reserva (o motor não conhece caixa, B466 iv).~~
  *(resolvido na Etapa 97 — `65dc74b2`, `9dbf11c0`; salvo o `AJUSTE` com localização de ida, B495/C186, e o C190;
  ver a seção "Etapa 97" no fim.)*
- A **linha da fila não divide** o separável entre itens do mesmo material da mesma requisição (a porta divide e o modal
  pré-preenche dividindo).
- "(na caixa: n)" na mensagem (B471); o arredondamento do motor, que grava 0,3 − 0,1 como 0,19999999999999998 no físico
  (C176 — *resolvido na Etapa 96, ver a seção dela*); a caixa em requisição que voltou a *Pendente* não retém (legado da A45, C175).

**O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada,
localização de kit e kits (produto). De integridade, o C169 saiu da lista; ficam declarados ~~a saída avulsa que leva a
caixa sem reserva (o motor)~~ *(resolvido na Etapa 97)* e a linha da fila que não divide entre itens do mesmo material.

**Testes:** `server/tests/api/separacaoTetoFisico.api.test.js` (58 casos: `[95 RN-01]`…`[95 RN-07]`, `[95 Fase 5]`,
`[95 B478]`), `separacaoTetoFisicoIntegracao.api.test.js` (7: I1–I6 + controle da A46),
`client/src/components/almoxarifado/RequisicoesSeparacaoTeto.test.js` (4). Reescritos com "Mudado na Etapa 95": o
"Fase 5 (critico)" de `filaSeparacao` e os dois de `separacaoOrigemPorItem` (B474); `saldoEmTerceiros` ajustado fora
do plano (três chamadas passam a levar `requisicao_id`, porque a leitura do item lança sem ele). `test:api`
331/331; cliente 95 suítes / 1463.

## Etapa 96 — o item da requisição grava a quantidade arredondada e a entrega não recusa o que existe (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md` (`604b37b1`, Fase 2 `e2a2f2d7`). Range `604b37b1..2d0bbfe9`. A regra do motor está na feature 03.

**O que estava errado (Fase 0, sonda 10, com estoque limpo):** físico 1, requisição de 1 aprovada (reserva 1), separar
em três rodadas 0,7 + 0,2 + 0,1 → `quantidade_separada = 0.9999999999999999` (soma em JS); entregar 1 → 400 *"… Máximo:
0.9999999999999999 (pendente: 1, disponível: 1)"* — gesto preso sem estoque torto nenhum. Separar 1 e entregar 0,7 + 0,2
+ 0,1 → `ENTREGUE`, mas físico `2.7755575615628914e-17` e `quantidade_entregue = 0.9999999999999999`. No legado torto
(físico `0.9999…`), a aprovação deixava a requisição sem reserva e a entrega ficava presa em `EM_SEPARACAO` (C179).

**Entregue:**
- [x] **T3 — a requisição** — `f26e53db`: soma da separação e escrita do item arredondadas em SQL; a entrega arredonda o
  pedido e compara com folga (prévia, laço, crítico); E1 e R3 com o número arredondado; a fila e o detalhe arredondados
  (inclusive a soma SQL disponível + reserva do item — a B488 dizia que o servidor já mandaria limpo: **estava errado**,
  corrigido na Fase 2, I5). O cliente não muda.
- [x] **Fase 5, R1 (regressão da própria 96)** — `e25454b5`: a separação e a entrega arredondavam a 1e-6, mas o item
  guardava o **solicitado cru**: uma requisição de 0,3333333 (ou de 1,0000004, ou o 1/3 legado de uma conversão de
  unidade) travava em `PARCIALMENTE_ATENDIDA` com pendente 0 e entregável 0, fora da fila, com a reserva `ATIVA` zumbi
  (antes da 96 ela fechava `ENTREGUE`). Agora a criação grava `Q.qtd` do solicitado (o que arredonda a zero recebe a
  recusa de quantidade inválida que o schema já dá; nenhuma literal nova); `todosItensCompletos` compara com `Q.cabe`;
  a separação arredonda o pedido; a reserva é consumida quando `Q.qtd(sobra) <= 0`; `COLUNAS_LEGADO` ganha
  `itens_requisicao_almoxarifado.quantidade_solicitada` (14 → 15).
- [x] **T5 — integração** — `8f33584f`: I3 (requisição sobre o legado: aprovar reserva 1, separar 0,7 + 0,2 + 0,1, fila e
  detalhe dizem 1, entregar 0,1 + 0,2 + 0,7, `ENTREGUE`, devoluções), I4 (pelo serviço), I5 (normalizar no meio).

**Spec que estava errada, dita à vista:** o item C176 do documento de novidades (escrito no fechamento da 95; o "Fica de fora"
da Etapa 95 acima só o cita) dizia que *"a separação, a fila e a aprovação desta etapa arredondam a 6
casas e não são afetadas"* — **estava errado**: a separação arredondava a **conta**, mas o item gravava
`quantidade_separada` por soma em JS e a entrega comparava sem folga; separar em rodadas fracionadas prendia a entrega
**com estoque limpo** (sonda 10 A, C178). Corrigido na T3.

**Fica de fora (declarado):** a tela (`step="1"` nos modais de separação e entrega e no formulário de requisição — C181);
~~a saída avulsa que leva a caixa (Etapa 97, B466 iv)~~ *(resolvido na Etapa 97)*; o legado no meio exato da 7ª casa (ver a feature 03).

**O que falta para 🟢:** o mesmo da Etapa 95 (lista de separação como entidade, rota de picking, série, kits); de
integridade, ~~a saída avulsa que leva a caixa sem reserva (**Etapa 97**)~~ *(resolvido na Etapa 97, salvo o `AJUSTE`
com localização de ida — B495/C186 — e o C190; ver a seção "Etapa 97" abaixo)*.

**Testes:** `quantidadeArredondadaRequisicao.api.test.js` (17: `[96 RN-06 a/b/c/d]`, `[96 RN-03]`, `[96 RN-05]`,
`[96 RN-04] (Fase 5, R1)`), `quantidadeArredondadaIntegracao` I3–I5; `relatoriosIndicadoresSpec27` [M-1] remontado por
escritor direto ("mudado na Etapa 96").

## Etapa 97 — o material separado na caixa de uma requisição só sai pela entrega (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md` (`eb7cd9d8`, Fase 2
`4a9cf5c1`). Range `eb7cd9d8..3fc39310`. A régua e o motor estão na feature 03. Fecha a B466 (iv), a D (95) e a D (96).

**O que estava errado (Fase 0, medido no HEAD `b15640f3`):** S pede 4, o administrador aprova sem saldo (*Aprovado*,
sem reserva), entra 4 avulso, o almoxarife separa 4 (*Em Separação*, físico 4, reservado 0 — caixa sem reserva 4).
Qualquer uma de 17 portas avulsas levava os 4 (`SAIDA` v1/v2, `SAIDA_PRODUCAO` emergencial, `AJUSTE_NEGATIVO`, `PERDA`,
`AJUSTE` sem localização, conferência que conta 0, remessa, bloqueio, `POST /reservas`, estorno da `ENTRADA`,
sucateamento até a baixa, estornos do `AJUSTE` e do `DESBLOQUEIO`) e a entrega ficava presa para sempre: *"⟨material⟩:
não é possível entregar 4 PC. Máximo: 0 (pendente: 4, disponível: 0)"*. E não havia gesto que devolvesse a caixa à
prateleira (*Em Separação* não cancela nem encerra).

**Entregue:**
- [x] **A caixa sem reserva protegida das portas avulsas** — `9ace72b2` (régua `livreDeCaixaSql` e trava), `65dc74b2`
  (o motor), `9dbf11c0` (bloqueio avulso, remessa, sucateamento, inventário), `3046eb4a` (integração). Cada porta
  recusa 400 com a literal de antes + o sufixo *" — 4 PC estão separados para a requisição ⟨número da requisição⟩ e só
  saem pela entrega (material perdido da caixa: ~~entregue o que existe e encerre a requisição~~ *(superado na Etapa 102, B701: encerrar com material na caixa passou a ser recusado — devolva à prateleira e encerre)*, ou peça ao administrador do
  almoxarifado para excluí-la)"*; o material fica intacto e A entrega os 4 (*Entregue*). O que está fora da caixa
  continua livre (físico 6, caixa 4: `SAIDA` 2 passa, 3 recusa com *"Disponível: 2"*).
- [x] **A entrega fica na régua de hoje** — `65dc74b2` (B492): `opcoes.requisicaoDaEntrega` no 4º argumento; a caixa
  dela é a conta da 95 (`maxEntregar`). O contrato provável escrito na 96 — *"a entrega exclui só a caixa da própria
  requisição"* — **estava errado**: com as caixas somando mais que o físico (o legado que este defeito produziu) a
  entrega de A, que hoje sai, seria recusada (sonda s5).
- [x] **A porta avulsa espera a separação do mesmo material** — `9ace72b2`, `65dc74b2` (B494): `registrarMovimentacao` e
  `criarReserva` pegam a trava do material quando a seção do contexto não o segura; dentro da entrega (que já segura o
  material) o motor não espera a si mesmo. Corrida medida: sem a trava 10/10 com separado > físico; com ela 0/10.
- [x] **O caso legítimo (material perdido na caixa) sem gesto novo** (B497): entregar o que sobrou (*Parcialmente
  Atendida*), Encerrar, e a `PERDA` do resto passa; tudo perdido, o administrador do almoxarifado (ou super
  administrador) exclui a requisição e a `PERDA` passa; o almoxarife não exclui (403 *"Apenas administradores do
  Almoxarifado ou Super Administrador podem excluir requisições"*). Antes de soltar, a `PERDA` recusa com o sufixo que
  ensina o caminho — a 97 inverte a ordem (primeiro a requisição sai da frente, depois a baixa), não cria a dependência
  do administrador: hoje a única saída para a requisição já presa é a mesma.
- [x] **Fase 5** — `3251b014` (o ajuste para cima não é recusado pela caixa — senão o legado travava o inventário),
  `3810f79a` (a separação não cai entre as duas pernas de uma devolução — C192), `c427bf6d` (C191), `3fc39310` (testes).

**Fica de fora (declarado, com o porquê):**
- **O `AJUSTE` com localização de ida** continua podendo levar a caixa (B495, **C186**) — reabriria D1/D7 da Etapa 10.
- **Bloquear o reservado já separado** (a reserva da requisição coberta pela caixa) prende a entrega em *"Máximo: 0"*
  sem nomear o bloqueio (**C190**, aberto — o bloqueio avulso não conta o reservado de propósito, ver a feature 09).
  *(Etapa 98: o C190 **estava incompleto** — com bloqueio parcial a prévia anunciava o resto e o motor recusava tudo
  (C196); a entrega, a fila e o detalhe passaram a dizer o que o motor deixa sair e a recusa nomeia a saída — E190,
  `55bc2165`, `cc130a86`. A guarda do bloqueio não mudou.)*
- **As requisições já presas** pelo defeito não destravam sozinhas (**C188**): a consulta **A48** as acha; a saída é
  ~~entregar o que existe e encerrar~~ *(superado na Etapa 102, B701: encerrar com material na caixa passou a ser recusado — devolva à prateleira e encerre)*, ou excluir. Com tudo perdido, só o administrador solta (**C189**). *(Etapa 98:
  resolvido — o almoxarife devolve à prateleira e dá a baixa; a A48 esvazia, RN-09/P8.)*
- ~~**O gesto "devolver da caixa à prateleira"** (B497) — candidato da Etapa 98.~~ *(feito na Etapa 98 — `9e0bb225`,
  `4941c9d9`; ver a seção "Etapa 98" no fim.)*
- **A tela** não mostra a caixa no disponível (C187); nenhuma rota nova, nenhum campo novo. Nenhum clique de navegador
  foi dado nesta etapa.

**O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada,
localização de kit e kits (produto). De integridade, a saída avulsa que leva a caixa **saiu da lista**; ficam
declarados o `AJUSTE` com localização de ida (C186), ~~o C190~~ *(resolvido na Etapa 98)* e a linha da fila que não divide entre itens do mesmo
material.

**Testes:** `server/tests/api/portasAvulsasCaixa.api.test.js` (46) e `portasAvulsasCaixaIntegracao.api.test.js` (10
chamadas `test()`, 13 ✓) — os da separação, em especial: *"[97 RN-02] caixa parcialmente coberta (reserva 2 do item,
separou 4, fisico 4): livre 0 -> SAIDA 2 recusa com S de 2; A entrega 4"*, *"[97 RN-02] caixa de duas requisicoes soma
(…)"*, *"[97 RN-03] s5: caixas 8 sobre fisico 4 (legado): A entrega a propria caixa -> 200 (…)"*, *"[97 RN-05] com a
trava do material presa por um teste, a SAIDA avulsa pelo servico fica pendente e resolve ao soltar; dentro da entrega o
motor nao espera"*, *"[97 T3 C1] pela rota: separa 4 sem reserva; SAIDA v2, SAIDA v1, PERDA, bloquear, POST /reservas,
remessa, sucateamento e a conferencia que conta 0 recusam com a literal inteira (…); A entrega 4 (ENTREGUE) (…)"*,
*"[97 T3 C2] RN-05 pela ROTA (PUT /separar x POST /movimentacoes/v2) (…)"*, *"[97 T3 C3] RN-06 entregar o que sobrou e
encerrar (…)"*, *"[97 T3 C3] RN-06 tudo perdido: o ALMOXARIFE nao exclui (403); o ADMIN exclui (…)"*, *"[97 T3 C4] s5
pela rota (…) o ADMIN exclui B e a A48 esvazia"*. Editados de forma declarada (*"mudado na Etapa 97"*, asserções
iguais): `separacaoTetoFisico` P4 RN-01 e P4 RN-03, `separacaoTetoFisicoIntegracao` T4 I4 — montavam o estado com a
`SAIDA` avulsa que agora recusa, corretamente; remontados pelo escritor de legado. `test:api` 338/338 (4163 ✓).

## Etapa 98 — devolver da caixa à prateleira (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa98-devolver-da-caixa-a-prateleira.md` (`d1679eaa`, Fase 2
`a16ea09f`). Range `6e61cb27..b7fc06a0`. Resolve a **B497** e o **C189** da 97, o **C174** da 95 e o **C190** (que
**estava incompleto** — C196).

**O que estava errado (Fase 0, medido no HEAD `6e61cb27`):** material quebrado ou perdido **na caixa** (separado e ainda
não entregue) não tinha gesto: a `PERDA` recusava com o sufixo da 97, a separação aceitava quantidade negativa em
silêncio (200, nada mudava — C197) *[Etapa 99: isto dizia "200, nada mudava"; **estava errado** — medido na Fase 0 da
99 (sonda s3, 33/48 ERRADO): a resposta era 200, a quantidade não mudava, mas o **status mudava** — *Totalmente
Reservada*, *Aguardando Estoque* ou *Parcialmente Atendida* viravam *Em Separação* (a reivindicação da 92 rodava antes
de a passada 1 pular a entrada); `true` separava 1 e limpava a conferência; a entrada válida do mesmo payload gravava.
O certo é: a separação aceitava em silêncio **e** reivindicava a requisição para Em Separação. Resolvido na 99 — ver o
bloco "Etapa 99".]*, *Em Separação* não encerrava nem cancelava, e o almoxarife não exclui (403). Só o
administrador soltava, **excluindo** a requisição (s2: 6/8 ERRADO). A separação **não move estoque** (s1 F: saldo por
endereço idêntico antes e depois) — logo devolver também não move: é desfazer um registro da requisição.

**Entregue:**
- [x] **A tabela da trilha e a seta** — `0aafb939` (T0): `devolucoes_caixa_requisicao` (append-only, 17 colunas, índice por
  requisição; B507) e `PRONTA_PARA_RETIRADA → EM_SEPARACAO` em `requisitionStateMachine.TRANSICOES` (B504). Primeiro boot
  em pasta vazia cria a tabela.
- [x] **O gesto** — `9e0bb225` (T1): `PUT /api/almoxarifado/requisicoes/:id/devolver-separado`, body `{ motivo, itens:
  [{ item_id, quantidade }] }`, `requisitionService.devolverSeparado` sob `serializarNaRequisicao` → `comTravaDaRequisicao`
  (ordem requisição → material). Diminui `quantidade_separada` (claim `separado − entregue >= q` e requisição ativa em
  `STATUS_COM_CAIXA`); **não** chama o motor (B502). Todas as recusas antes da primeira escrita, tudo ou nada (B511):
  D-1 *"Devolução à prateleira exige usuário identificado"*, D0 404 *"Requisição não encontrada"*, D1 *"Só é possível
  devolver à prateleira o que está separado numa requisição em andamento (status atual: ⟨STATUS⟩)"*, D2 *"Informe o
  motivo da devolução à prateleira"*, D3 *"Informe ao menos um item para devolver à prateleira"*, D5 *"Item ⟨id⟩ não
  pertence a esta requisição"*, D6 *"Item ⟨id⟩ repetido na devolução"*, D4 *"⟨material⟩: informe uma quantidade maior
  que zero para devolver à prateleira"*, D7 *"⟨material⟩: não é possível devolver ⟨q⟩ ⟨un⟩ à prateleira. Na caixa: ⟨c⟩
  (separado: ⟨s⟩, entregue: ⟨e⟩)"*; o claim perdido → 409 D409 *"A caixa desta requisição mudou enquanto a devolução era
  registrada; recarregue e confira antes de devolver de novo."* — **depois** de gravar a trilha dos itens já escritos
  (RN-02b, molde da B444). Origem/lote planejados zeram só quando a caixa do item zera. Rótulo de auditoria
  *"Devolução à prateleira"* (`DEVOLUCAO_CAIXA`). O detalhe ganha `devolucoes_caixa` (aditivo).
- [x] **O status (B504)** — *Pronta para Retirada* volta a *Em Separação* em qualquer devolução (compare-and-set); os
  outros status ficam (inclusive *Parcialmente Atendida* e o legado pré-separação com caixa). A *Em Separação*
  esvaziada é a *Em Separação* vazia que já existia: separa de novo, a alçada de valor volta a valer (V403b, B462).
- [x] **A segunda conferência (B505)** — a devolução a limpa (compare-and-clear, molde F4 da 28), em qualquer status; a
  auditoria leva a conferência apagada em `dados_anteriores`. Quem devolveu **pode** conferir (C198).
- [x] **A reserva do item não muda (B506)** — a resposta traz `reserva_do_item`; com reserva, a `PERDA` continua
  recusando até a reserva ser liberada (C194; a feature 07).
- [x] **O sufixo S98 (B508)** — `672bb151` (T2): `caixaSql.sufixoCaixa` ensina a terceira saída — *"… e só saem pela
  entrega (material perdido da caixa: devolva-o à prateleira na requisição e dê a baixa, ~~entregue o que existe e encerre a
  requisição~~ *(superado na Etapa 102, B701: encerrar com material na caixa passou a ser recusado — devolva à prateleira e encerre)*, ou peça ao administrador do almoxarifado para excluí-la)"*. Os dois testes da 97 mudaram só a constante
  `S_FIM` (*"Mudado na Etapa 98 (B508)"*).
- [x] **O C190 (B509, B513, B514)** — `55bc2165` (T3), `cc130a86` (Fase 5): a entrega (prévia e laço), a fila e o detalhe
  usam `entregavelPeloMotor` — com o disponível do material sem a reserva do item negativo e o motor sem permitir
  negativo, **0**; a recusa ganha o sufixo E190 (ver a feature 07). O motor não mudou.
- [x] **A tela** — `4941c9d9` (T4): botão *"Devolver à prateleira"* por item com caixa > 0, em `STATUS_COM_CAIXA` (espelho
  exportado em `requisicaoLabels.js`, paridade em `devolverListaTelaRota.api.test.js`), gate `separar_emitir`; modal
  *"Devolver à prateleira — ⟨material⟩"* (quantidade padrão = a caixa, `step="any"`, motivo obrigatório até 500, avisos
  da reserva, da *Pronta* e da conferência); bloco *"Devolvido à prateleira (n)"* no histórico; o *title* do "Ajustar
  Separação" deixou de prometer correção (*"Separa mais quantidade — para tirar da caixa, use Devolver à prateleira no
  item"*). Em *Parcialmente Atendida* com conferência obrigatória pendente, botão *"Separar de novo para conferir"*
  (`PUT /separar` com `itens_separados: []` → *Em Separação*, onde o "Conferir separação" existe — Fase 2, B-1). 409 fecha o
  modal e recarrega, 400 o mantém (B515).
- [x] **A integração** — `de77a6eb`, `a70107ca` (T5): `devolverSeparadoIntegracao.api.test.js` (C1–C5).
- [x] **Fase 5** — `084ded25` (o liberar para retirada exige **caixa > 0**, não separado > 0 — B512, C199), `cc130a86`
  (a E190 — B513), `b7fc06a0` (seis testes para sabotagens que passavam verde).

**Spec que estava errada, dita à vista:**
- O "Fica de fora" do bloco "Etapa 95" dizia **"não há gesto de 'devolver da caixa'"** — **estava desatualizado** desde
  `9e0bb225`; riscado lá com a correção. O **C174** (*Em Separação* com entregue > 0 e sem físico, "sem gesto limpo")
  fica resolvido: devolver tira a caixa **sem estornar** o entregue. Lido na máquina, não sondado: a requisição fica *Em
  Separação* esperando saldo (encerrar direto de *Em Separação* continua não existindo — mesma família do C195).
- A **B504** dizia que a *Pronta para Retirada* esvaziada só existiria sem a seta nova — **estava incompleta**: a *Pronta*
  com a caixa vazia já existia **antes** da 98 (entrega parcial + "separar de novo" com itens vazios + liberar, que contava
  `quantidade_separada > 0`), e a 98 abria mais um caminho. Corrigida pela **B512** (`084ded25`, C199).
- O "Fica de fora" da Etapa 97 sobre o **C190** ("prende em *Máximo: 0* sem nomear") estava **incompleto** (C196).

**Fica de fora (declarado, com o porquê):**
- **Voltar ao status anterior à separação** (B504 (i)) — quatro a seis setas novas e os recálculos de reserva, alçada e
  chegada sobre cada uma, para um ganho que é lacuna pré-existente (C195).
- **Quem pediu cancelar a *Em Separação* vazia** (C195) — pré-existente (a vazia do "Iniciar Separação" também não cancela).
- **Liberar a reserva no mesmo gesto** (B506) — o gesto de liberar existe (Etapa 77).
- **Série inteira na devolução** (B510) e **a separação que aceita fração de série e quantidade negativa em silêncio**
  (C197) — a devolução de fração é a saída da fração; a porta que a produz fica para etapa própria. *(Resolvido na
  Etapa 99, `7353265d`: a separação recusa quantidade negativa/não numérica (Q1), item alheio (Q2), fração de série
  (Q3) e lista que não é lista (Q4), e nada muda. A devolução continua sem exigir inteiro — é a saída do legado, A50.)*
- **Ação de perfil própria** (B503 (i)) — hoje seriam os mesmos perfis; reversível numa linha.
- **Barrar quem devolveu de conferir** (B505 (ii), C198): a barreira "quem separou não confere" continua por rodada de
  separação. Consequência pré-existente (28): numa equipe de **dois** almoxarifes em que os dois separaram rodadas da
  mesma requisição com crítico, **ninguém** confere — o terceiro (outro almoxarife ou o administrador) confere.
- **Mover estoque ou escolher o endereço de volta** (C193) — a transferência existe.
- **A conferência confirmada sobre caixa vazia** (C200, aberto): `conferir-separacao` conta `quantidade_separada > 0`
  (`requisitionService.js:~563`), a mesma régua que a B512 trocou no liberar — não medido como estado preso.
  *(Resolvido na Etapa 99, `b8e16e4c` + `c9087106`: a conferência conta a caixa e recusa a vazia com "Nenhum item
  separado"; o botão segue a caixa. A Fase 0 da 99 mediu que o C200 não precisa de devolução nem de crítico — material
  comum, separa 2, entrega 2, `separar []` já chegava lá.)*
- Nenhum clique de navegador foi dado nesta etapa (a tela está coberta por jest com mock na fronteira HTTP).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, agrupamento/rota de picking, troca de
**série** registrada, localização de kit e kits). De integridade, o C190 e o "material perdido na caixa sem gesto" **saem
da lista**; ficam declarados o `AJUSTE` com localização de ida (C186), a linha da fila que não divide entre itens do mesmo
material, a separação que aceita negativo e fração de série (C197), a *Em Separação* vazia que quem pediu não cancela
(C195), a conferência sobre caixa vazia (C200) e a barreira da equipe de dois (C198). *(C197 e C200 saem da lista na
Etapa 99.)*

**Testes:** `server/tests/api/devolverSeparado.api.test.js` (40 `test()`: `[98 RN-00]`…`[98 RN-11]`, inclusive *"[98
RN-03] (Fase 5) liberar exige caixa > 0: …"*, *"[98 RN-04] critico conferido: ALMOX2 devolve 1 -> conferencia limpa;
entregar 400 C3; ALMOX (separou) 403; ALMOX2 (devolveu) confere 200; …"*, *"[98 RN-08] autorizacao: …"*, *"[98 RN-10] (a)
liberar parado depois de contar os separados: a devolucao espera; nunca PRONTA com caixa 0 (0/10)"*),
`entregaDisponivelNegativo.api.test.js` (16: `[98 RN-12]` e `[98 A49][CONTROLE]`), `devolverSeparadoIntegracao.api.test.js`
(10: C1, C1b, C2, C2b, C3, C3b, C4, C4b, C5 ×2), `devolverListaTelaRota.api.test.js` (3: a paridade da lista);
cliente `RequisicoesDevolverPrateleira.test.js` (23). Editados de forma declarada: `portasAvulsasCaixa` e
`portasAvulsasCaixaIntegracao` (só a constante `S_FIM`). `test:api` 342/342 no último commit da etapa (`b7fc06a0`).

## Etapa 99 — a separação recusa o que não é separável e a conferência conta a caixa (2026-10-15)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa99-separacao-recusa-o-inseparavel.md` (`5f28c044`, Fase 2
`314837d6`). Range `314837d6..3e14653a`. Resolve o **C197** e o **C200** da 98 (decisões B516–B523; avisos C201–C203;
consulta A50).

**O que estava errado (Fase 0, medido no HEAD `7b5fd57e`, sondas s1–s6):**
- **A porta da separação não lia a forma da entrada** (s3: 33/48 ERRADO pela rota e pelo serviço): quantidade −2,
  `"abc"`, `Infinity`, `1e400`, `{}`, item 999999, item de **outra** requisição, `item_id` nulo — tudo **200**, sem
  separar, e a requisição era **reivindicada para *Em Separação*** (de *Totalmente Reservada*, *Aguardando Estoque* ou
  *Parcialmente Atendida*). `true` separava **1** (`Number(true)`), com rodada, trilha e conferência limpa. Num payload
  com uma entrada válida e uma inválida, a válida **gravava** e a inválida sumia (M1/M2). `itens_separados` objeto e
  entrada `null` davam **500**; texto dava 200 (iterava as letras). Fração em material com série ia para a caixa (a
  entrega só tira inteiro). Com a alçada de valor armada, um payload inválido **gravava *Aguardando aprovação de
  valor*** e disparava o e-mail dos aprovadores (A1).
- **A conferência contava o separado acumulado, não a caixa** (s4: 8/14 ERRADO): *Em Separação* com separado = entregue
  (separa 2, entrega 2, `separar []` — sem devolução, material comum) era conferida com 200.
- **O teste de resíduo da 98 não provava o `ROUND` do liberar** (s6): 2,0000000001 − 2 = 1e-10 é recusado com ou sem o
  `ROUND`; só um resto entre a folga (1e-9) e meia unidade da precisão (5e-7) separa as duas.

**Entregue:**
- [x] **A passada de forma da separação (B516–B521)** — `7353265d` (T1): `validarFormaDaSeparacao` em
  `requisitionService.js`, chamada em `separarSemTrava` depois de `user.id`, da requisição (404) e de `PODE_SEPARAR`
  (`MSG_STATUS_SEPARAR`) e **antes** de `verificarBloqueioLiberacao` e da reivindicação; só lê (os itens com
  `carregarItensRequisicao`, reaproveitados pela passada 1; o `controle_serie` por consulta própria, só se alguma
  entrada é fracionária). Ordem: Q4; depois, por entrada na ordem do payload, Q2 → Q1 → Q3; a primeira inválida
  responde e **nada** é escrito (status, separado, rodada, trilha `SEPARACAO`, conferência). Literais (400):
  - **Q1** *"⟨material⟩: quantidade inválida para separar (⟨valor⟩) — informe um número positivo, ou 0 para não separar
    este item"* — negativo ou o que `Q.qtd` lê `NaN` (texto não numérico, `Infinity`, `NaN`, booleano, objeto); ⟨valor⟩
    é o bruto (`JSON.stringify` para objeto, protegido), cortado em 40 caracteres com `…`;
  - **Q2** *"Item ⟨id⟩ não pertence a esta requisição"* — a fórmula da D5 da 98 (`entrada && entrada.item_id`; entrada
    `null` → *"Item null …"*), em qualquer quantidade, **inclusive 0**; `item_id` booleano, objeto ou lista também é Q2
    (diferente da D5, que aceita `true`);
  - **Q3** *"⟨material⟩: material com controle de série exige quantidade inteira na separação (informado: ⟨q⟩)"* — por
    entrada, depois do arredondamento (1,0000001 vira 1 e passa); o acumulado não é conferido (legado com 0,5 na caixa
    separa uma rodada inteira);
  - **Q4** *"Informe os itens separados em lista (itens_separados)"* — inclusive `""`, `0` e `false` pela rota, que
    passou de `itens_separados || []` para `?? []` (só ausente e `null` valem `[]`).

  Continuam aceitos: quantidade 0, `"0"`, ausente, `null`, `""` ou só espaços (pulada), `[]` e sem `itens_separados`
  (200, sem rodada, *Em Separação*, a conferência fica — 28 RN-02); `"2"` separa 2; o mesmo item repetido soma (B521).
  Edição declarada: `separacaoComDono.api.test.js` — o `rFantasma` (999999 com 3) passou de 200 a 400 Q2 (*"mudado na
  Etapa 99 (B518)"*).
- [x] **A conferência conta a caixa (B522, C200)** — `b8e16e4c` (T2): `conferirSeparacao` conta os itens com
  `quantidade_separada > 0 AND ROUND(COALESCE(quantidade_separada, 0) − COALESCE(quantidade_entregue,
  quantidade_atendida, 0), 6) > 1e-9` — a régua do liberar (B512); zero → 400 *"Nenhum item separado"* (a literal de
  sempre). O claim não muda. O teste `[98 RN-03] (Fase 5)` do liberar ganhou o caso 2,0000001 (RN-10), que **sabe
  falhar** sem o `ROUND` (controle s1b medido).
- [x] **O botão "Conferir separação" segue a caixa (B523, reescrita na Fase 2)** — `c9087106` (T2b):
  `RequisicoesList.js` troca `getSeparado(i) > 0` por `caixaDoItem(i) > 0` (o molde do "Liberar"). A Fase 2 mediu que o
  botão aparecia sobre a caixa vazia e o clique passaria a dar o 400 novo.
- [x] **A integração** — `3e14653a` (T3): I1 (crítico pela rota, do −2 recusado ao *Entregue*, passando pelo −1 em
  *Parcialmente Atendida*, devolução, `[]`, conferir vazio e liberar vazio recusados), I2 (série; legado com a A50;
  **o C202 até o encerramento**), I3 (alçada: `[A 2, B −1]` → 400 Q1, nada gravado, espião zero; `[A 4]` → 403), I4
  (pelo serviço).
- [x] **Fase 5 (revisão adversarial, dois revisores executando)** — `821fb03b`: **regressão da própria etapa** —
  `conferenciaObrigatoria` (a régua que a fila, o detalhe, o liberar e a entrega usam para exigir a conferência) media a
  caixa crua; com um resto de legado de crítico (2,0000001 − 2) a fila mostrava CONFERIR, a conferência (T2) recusava,
  e liberar, entregar e encerrar recusavam — presa. Agora as três réguas são `Q.qtd(separado − entregue) > 1e-9`
  (**B524**). `f1041706`: testes para nove sabotagens que passavam verde (a série lida pelo material de outro item, a
  ordem Q2 → Q1 na linha, `"1,5"`, `item_id` fracionário, o corte 40/41, o serviço com `null`, o `ROUND` de 5 casas, e
  o botão da tela com o entregue legado, com o resto e com a menor caixa real).

**Spec que estava errada, dita à vista:**
- O bloco "Etapa 98" dizia que a separação aceitava negativo *"200, nada mudava"* — **estava errado**: o status mudava
  para *Em Separação* (s3). Corrigido à vista lá.
- O plano da 99 (Fase 0) dizia que o "Conferir separação" só aparecia com `conferenciaPendente` — **estava errado**
  (aquilo é o "Separar de novo para conferir"); a Fase 2 corrigiu e nasceu a T2b.
- A próxima tarefa escrita na 98 errava ou omitia em sete pontos (lista no plano da 99, "O que contradiz a próxima
  tarefa escrita na 98") — entre eles, o `step` "livre" do modal (o campo já é `step="1"` para todo material) e que o
  C200 precisaria de devolução (não precisa).

**Fica de fora (declarado, com o porquê):**
- **A criação de requisição aceita fração de material com série** (C202) — outra porta (feature 04), sem estado preso:
  a saída é **Encerrar** a *Parcialmente Atendida* (não zerar o modal — ver a feature 04).
- **Limpar a conferência no `separar []`** (B522 (ii)) — contrato 28 RN-02; medido inofensivo (a próxima rodada limpa,
  o liberar e a conferência recusam a caixa vazia).
- **Recusar item repetido na rodada** (B521) — três contratos (59/60/95) sem defeito medido.
- **`1e400` digitado no modal** — `parseFloat` dá `Infinity`, o JSON manda `null`, o servidor lê como ausente: 200 sem
  separar (resíduo antigo da tela, nota no C201).
- **C195** (*Em Separação* vazia que quem pediu não cancela) — seta nova com recálculo de reserva; etapa própria.
- **Material inativo na separação** — não medido como defeito (cadastro, feature 01).
- Nenhum clique de navegador foi dado (tela coberta por jest com mock na fronteira HTTP).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, agrupamento/rota de picking, troca de
**série** registrada, localização de kit e kits). De integridade, C197 e C200 **saem da lista**; ficam declarados o
`AJUSTE` com localização de ida (C186), a linha da fila que não divide entre itens do mesmo material, a *Em Separação*
vazia que quem pediu não cancela (C195), a barreira da equipe de dois (C198) e a fração de série na criação (C202,
feature 04).

**Testes:** `server/tests/api/separacaoFormaDaEntrada.api.test.js` (24 `test()`: `[99 RN-01]`…`[99 RN-08]`, pela rota e
pelo serviço; RN-06 com o espião em `notificarAprovadoresValor`), `conferirCaixaVazia.api.test.js` (8: `[99 RN-09]` C1–C4,
controles, "o documento anda" e os dois da Fase 5), `separacaoFormaDaEntradaIntegracao.api.test.js` (6: I1, I2 ×3, I3, I4),
`devolverSeparado.api.test.js` (40, o `[98 RN-03] (Fase 5)` com o caso RN-10), `separacaoComDono.api.test.js` (11, o
`rFantasma` editado); cliente `RequisicoesDevolverPrateleira.test.js` (+4 `[99 RN-09]`). Verificação depois da Fase 5 (árvore `f1041706`):
`test:api` 345/345, `test:almoxarifado` 44/44, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 5/5, jest
1504/1504 (96 suítes), `CI=true react-scripts build` EXIT 0.

## Etapa 101 — a *Em Separação* vazia tem saída (2026-10-15)

Regra na feature 04 (seção "Etapa 101"). O que toca a separação: a *Em Separação* com a caixa vazia (Iniciar Separação
sem quantidade; separar e devolver tudo; entrega parcial + separação vazia) **cancela** (nada entregue) ou **encerra**
(algo entregue) — `6dcced8e`, `dfdad6b1`. Os dois cancelamentos entram na **trava por requisição** (B527): um
cancelamento clicado no instante da separação espera ela terminar e decide pela caixa que ela deixou (antes passava na
frente e a separação tomava S1). A régua da caixa é a única da B524 (`destinoDaSeparacaoVazia`).

- [x] **C195 resolvido** — `6dcced8e` (B525, B526). *(O bloco da Etapa 99 acima lista "C195 — etapa própria" no "o que
  falta": **saiu da lista**.)*
- [x] **Testes de corrida reescritos** — os que disparavam o cancelamento AGUARDADO dentro da separação viraram deadlock
  com a trava; o contrato agora é "o cancelamento espera" (`separacaoNaoRessuscita`, `requisicaoGestosConcorrentes*`,
  `cancelarOutrosModulosIntegracao`, `alcadaValorDepoisDaSeparacao*`). O S1 da separação e o D409 da devolução continuam
  alcançáveis por escritor fora da trava (reprovação por valor, legado) e seguem provados com escritor direto.

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, rota de picking, troca de série,
localização de kit e kits); de integridade, C186, a linha da fila que não divide entre itens do mesmo material, C198
(equipe de dois) e a C204 (a *Parcialmente Atendida* com caixa ainda encerra). C195 e C202 **saem**.

## Etapa 102 — material na caixa não se encerra (2026-10-15)

Regra na feature 04 (seção "Etapa 102"). O que toca a separação: a caixa da *Parcialmente Atendida* passa a segurar o
encerramento como a da *Em Separação* — encerrar com material separado e não entregue é recusado (E1), e a saída é a
devolução à prateleira da Etapa 98 (ou a entrega). A recusa de saldo por caixa das portas avulsas (o sufixo S98 desta
spec) perde *"entregue o que existe e encerre a requisição"* (B701) — o bloco da Etapa 98 acima o cita como contrato:
**superado**, marcado à vista.

- [x] **C204 resolvido** — `99043a57`, `5746553b` (B700, B702).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, rota de picking, troca de série,
localização de kit e kits); de integridade, C186 (o ajuste com endereço de ida leva a caixa — candidata à Etapa 104), a
linha da fila que não divide entre itens do mesmo material e C198 (equipe de dois). C204 **sai**.

## Etapa 104 — a contagem por endereço que leva a caixa avisa (2026-10-15)

Regra no motor (feature 03) e na tela de Movimentações. O que toca a separação: a caixa sem reserva (95) deixa de ser
levada **em silêncio** pelo `AJUSTE` com localização de ida — a contagem continua gravando (B704: a contagem redefine o
saldo, decisão do cliente; a recusa foi descartada), e a resposta traz `aviso_caixa` quando o disponível ficou abaixo da
caixa, nomeando a requisição e os dois caminhos (estornar o ajuste que baixou; devolver à prateleira — Etapa 98).

- [x] **C186 tratado com aviso** — `660ae114` (motor e `caixaSql.avisoCaixaDoAjuste`), `385ff127` (tela), `27ba1c29`
  (integração pela rota e pelo serviço), `86ec9f39` (Fase 5: unidade nula no aviso, três testes reforçados). *(Não "resolvido" no sentido da 97: o ajuste ainda leva a caixa; quem contou fica
  sabendo e tem o caminho. Se o P.O. preferir recusar, é a opção (a) da B704.)*
- [x] **A caixa coberta por reserva** — ✅ **resolvida na Etapa 128** (`e62dc05f`, `37110f59`; spec 03): a contagem abaixo do reservado
  agora **avisa** (`aviso_retencao`), com o caminho — devolver à prateleira na requisição **e** liberar a reserva. O texto de antes:
  *"fora (C209): a contagem abaixo do reservado não avisa; a entrega já diz "disponível
  negativo (reservado além do físico)". Segue candidata depois da Etapa 106 (a 106 foi a C211 e a 108 é a C213 — B711/B712; o desenho da C209 está no fim da próxima tarefa do plano da 104).*

**Correção à vista:** o "o que falta" da Etapa 102 (acima) chamava a C186 de *"o ajuste com endereço de ida leva a caixa —
candidata à Etapa 104"*: feita, com aviso. E a próxima tarefa do plano da 102 dizia que o ajuste com endereço *"não pega a
trava por material hoje"* — **estava errado** desde a Etapa 97 (B494): `registrarMovimentacao` envolve o motor inteiro em
`naTravaDoMaterial`.

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, rota de picking, troca de série,
localização de kit e kits); de integridade, a linha da fila que não divide entre itens do mesmo material, C198 (equipe
de dois) e a C209 (a contagem abaixo do reservado não avisa). C186 **sai** (tratado com aviso).

## Etapa 127 — o separável dividido entre itens do mesmo material (2026-10-16)

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa127-o-perfil-que-saiu-e-o-separavel-dividido.md`.

A porta (`separarRequisicao`) já dividia (B468). A fila calculava cada linha sozinha, e a janela dividia tirando do segundo item **tudo**
o que o primeiro separava. A conta única, `dividirSeparavel` (pura, `requisitionService.js`): do teto de cada item, a **própria**
(`max(0, r − c)`, a reserva dele fora da caixa) não é dividida; o resto (`teto − própria`) é o mesmo pote para os irmãos; separar q
num irmão tira do pote só `max(0, q − própria)`. Na ordem do pedido (B821).

- [x] **A fila divide** — `77385aaa`: `listarFilaSeparacao` usa `dividirSeparavel` (ordem `ir.requisicao_id, ir.id`); as etapas seguem o
  número dividido — *Separar* e *Aguardando saldo* juntos quando o separável não cobre os dois (B820). RN-10..RN-14, RN-16.
- [x] **O detalhe manda a parte própria** — `77385aaa`: `saldo_separavel_reserva` (aditivo, 0 no inativo); `saldo_separavel` e
  `quantidade_separavel` não mudam (o item sozinho). RN-15.
- [x] **A janela divide pela mesma conta** — `e5e7938f`: o pré-preenchimento, o máximo que decide o motivo da divergência e o aviso
  "chegou" descontam dos irmãos só o que passa da própria (C265). RN-17, RN-18.
- [x] **Integração pela rota e pelo serviço** — `77385aaa`: `separavelDivididoIntegracao.api.test.js` (fila = serviço = detalhe = porta,
  +0,01 recusado com a literal). RN-19.
- [x] **A divergência gravada usa a mesma conta** — `0fe7a111` (Fase 5, r1): a régua da rodada tirava dos irmãos a quantidade inteira
  (reservados 4 + 4 separados 4 e 3: o modal pedia o motivo, o servidor gravava `maximo: 0`, não divergente, e quem confere não via).
  Com os 9 cenários do revisor de sabotagem (reserva com caixa, entrega parcial, três irmãos, fração de verdade, Pronta para retirada).
- [x] **O entregável de irmãos** — *(Etapa 135)* medido e corrigido: `35425c3d` (a prévia da entrega e o detalhe), `39d82137` (a janela), Fase 5 `70a77c0f` — ver o bloco "Etapa 135". Esta linha dizia "não medido nesta etapa (D (127))".

**Correção à vista:** a Etapa 95 (acima) dizia *"A linha da fila não divide o separável entre itens do mesmo material da mesma
requisição (a porta divide e o modal pré-preenche dividindo)"* e prendia isso no teste I3 (*"cada item mostra o seu teto (nao dividido
na linha)"*). A primeira metade deixou de valer (a fila divide); a segunda **estava errada** desde a 95: o modal pré-preenchia
dividindo **errado** quando o item tinha reserva própria — dois itens reservados 4 + 4 abriam 4 e 0, e a porta aceita 4 + 4 (C265). O
I3 e o I4 de `separacaoTetoFisicoIntegracao` foram corrigidos (o item 2 do M4 mostra 0 na fila; o detalhe continua 4).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, rota de picking, troca de série, localização de kit e
kits — sem B aberta, decisão de produto); de integridade, C198 (equipe de dois — decisão B505 (ii)) e a C209 (a contagem abaixo do
reservado não avisa — candidata da Etapa 128). A linha da fila que não divide **sai**.

## Etapa 135 — o entregável de irmãos (2026-10-17)

Plano: `docs/superpowers/plans/2026-10-16-almoxarifado-etapa135-o-entregavel-de-irmaos.md` (design com a Fase 0 medida ao lado, em
`docs/superpowers/specs/`).

**Medido (Fase 0, sonda no `testApp` real):** o cenário que a D (127) nomeava — reservados 4 + 4, separados 4 e 3, entrega parcial de um —
**não diverge** (a reserva de cada irmão é dele, e a caixa sem reserva já está fora do pote). **Diverge** a **segunda rodada** (item já
entregue em parte, a caixa abaixo do pendente — a única em que `maxEntregar` passa da caixa) de dois irmãos que tiram do mesmo livre: o
detalhe dava o livre inteiro a cada um, a prévia da entrega (B464) lia cada irmão sozinho e passava, e o laço de baixa — que relê depois
de cada baixa — recusava o segundo **depois** de baixar o primeiro (400 com metade da entrega feita, status sem recalcular). A fila **não**
diverge: o entregável dela nunca passa da caixa.

- [x] **A prévia conta os irmãos anteriores** — `35425c3d`: `entregarSemTrava` ajusta a leitura fresca (`saldoDisponivelParaItem`) pelo
  efeito dos irmãos anteriores já validados, **por material** e na ordem do laço (`efeitoDaEntregaNoMaterial`: do disponível
  `max(0, q − r)`, da caixa sem reserva a queda dela; `saldoAjustadoPelosIrmaos`), e usa as mesmas contas (`entregavelPeloMotor`,
  `tetoDaLeitura`, `maxEntregar`) — a recusa E1 sai antes de qualquer baixa (B869). Vale também com o físico abaixo da caixa sem reserva
  (P1, C186). RN-01. O laço de baixa não mudou.
- [x] **O detalhe manda o teto e a parte própria do entregável** — `35425c3d`: `saldo_entregavel` e `saldo_entregavel_proprio` (aditivos);
  na segunda rodada `c + tetoSeparacao(...)` e `max(c, r)`, fora dela os dois iguais a `quantidade_entregavel` (que não muda). RN-02.
- [x] **O crítico entrega, no detalhe, só a caixa** — `35425c3d` (Fase 2 I3, C286, B871). RN-02b.
- [x] **A janela divide pela conta da 127** — `39d82137`: `quantidadesIniciaisEntrega`, `maxEntregaNaTela` nas quatro portas
  (`aplicarDetalhe` — também no recarregar com o modal aberto —, `abrirModalEntrega`, `handleConfirmarEntrega` direto e não direto) e no
  `max` do campo; servidor sem os campos: nada dividido (B870). RN-06.
- [x] **Integração pela rota e pelo serviço** — `entregavelDeIrmaos.api.test.js` (24, com os Z1–Z7 da Fase 5) e
  `RequisicoesEntregavelDividido.test.js` (11). RN-03, RN-07.
- [x] **Fase 5** — `70a77c0f`: os cenários que 17 sabotagens sobreviventes pediram (reserva dentro da caixa, três irmãos, a caixa de um
  terceiro irmão, o recarregar com o modal aberto, outro material).

**Fica de fora (D (135)):** com o físico abaixo da caixa sem reserva a janela não divide (a entrega recusa antes de baixar); a conferência
antes da baixa conta quantidades, não endereços (a recusa *"a origem da separação não serve mais"* de um irmão cuja origem o outro esvaziou
ainda pode vir depois da primeira baixa).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, rota de picking, troca de série, localização de kit e kits —
decisão de produto) e, de integridade, C198 (equipe de dois — B505 (ii)). O entregável de irmãos **sai**.

## Etapa 136 — a ordem das baixas da entrega (2026-10-17)

Plano: `docs/superpowers/plans/2026-10-17-almoxarifado-etapa136-a-ordem-das-baixas.md` (design com a Fase 0 medida ao lado, em
`docs/superpowers/specs/`).

**Correção à vista:** a D (135) acima dizia *"a recusa "a origem da separação não serve mais" de um irmão cuja origem o outro esvaziou ainda
pode vir depois da primeira baixa"* e o plano da 135 a descrevia "na segunda rodada" e "não reproduzida". **Estava errada em dois pontos:**
a recusa que saía depois da primeira baixa era a do **motor** (a origem estrita — *"⟨mat⟩: O saldo em A-01 (1) não cobre a quantidade (2) —
a saída tiraria de outros endereços"*), porque a prévia (`checarOrigemItem`) via A-01 cheio; e ela acontecia **já na primeira rodada** —
um item separado sem origem e o irmão separado de A-01 bastam (Fase 0, V1). A causa: o laço baixava item a item, e o pedaço automático
(`claimSaldoSemLote`/`claimSaldoDoLote`: o padrão, depois o de mais saldo) de um item chegava antes ao endereço planejado do irmão.

- [x] **As baixas em três passadas** — `d4f19bfa`: em `entregarSemTrava`, (0) os pedaços com endereço (estritos), (1) os com lote e sem
  endereço, (2) os automáticos, cada passada na ordem do laço; dentro do item a ordem não muda (o excedente antes da reserva, as séries).
  A leitura fresca de todos os itens roda antes da primeira baixa; a substituição e a limpeza da origem planejada saem num `finally` das três
  passadas. V1, V1b, V3, V4, V6 e V7 → 200 (B877). RN-01, RN-02, RN-05.
- [x] **O só lote conta os estritos do mesmo lote** — `d4f19bfa`: a conferência do lote sem endereço roda depois de todas as estritas e
  soma o que elas pedem do mesmo lote; em material com saldo negativo permitido não soma (o motor não confere o lote). V7b → 400
  *"Saldo insuficiente no lote ⟨L⟩. Disponível: 0 ⟨un⟩"* antes de qualquer baixa (B878). RN-03.
- [x] **Integração pela rota e pelo serviço** — `entregaOrdemDasBaixas.api.test.js` (20, com os 6 da Fase 5). RN-04, RN-06.
- [x] **Fase 5** — `ddded5a2`: os cenários que 9 sabotagens sobreviventes pediram (a leitura fresca antes da primeira baixa, a ordem dentro
  da passada, o excedente antes da reserva, dois só lote, o só lote com leitura, a falha na primeira baixa). Regra: 3.169 entregas, código
  novo × `f064fbde`, sem divergência no que a entrega aceita.

**Fica de fora (D (136)):** a parte automática de um item com série (o lote das séries) não entra na prévia — inalcançável pela revisão (as
séries distintas em estoque limitam o pedido); a saída automática sem lote continua tirando só do saldo sem lote (B204) *(— mudou na 197 para material com `controle_lote`: sai por lote, FEFO, B1320; ver o bloco "Etapa 197")*. **Mudou o que se
vê:** o endereço de onde a parte automática sai (agora depois dos estritos) e, quando duas recusas cabem, qual aparece primeiro.

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, rota de picking, troca de série, localização de kit e kits —
decisão de produto) e, de integridade, C198 (equipe de dois — B505 (ii)). A recusa por endereço depois da primeira baixa **sai**.

## Etapa 188 — a Fila de separação sugere de onde pegar e em que ordem andar (2026-10-23)

Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md`.

**Correção à vista:** o item do checklist dizia *"Sugestão de rota (ordenar itens pela hierarquia de localizações)"*. **Estava errado:** os
itens da fila são a ordem da divisão do separável (`dividirSeparavel`, Etapa 127, B821) — o primeiro item do material leva o que dá, o
segundo o que sobra. Reordenar mudaria quem leva. A ordem de percurso é o campo novo `ordem_coleta`; `itens` continua na ordem do pedido.

- [x] **A regra pura** — `27819165`: `services/almoxarifado/sugestaoDeColeta.js` (`sugerirColeta`, `candidatoSugerivel`,
  `caminhoDaLocalizacao`, `compararCaminho`). RN-188.01 a 06 com as emendas da Fase 2 (C1: item com planejada pendente só tem a planejada;
  nenhum cobre → o de maior livre; I3: série limita pelo lote). `sugestaoDeColeta.api.test.js` (36 cenários com os da Fase 5).
- [x] **A fila devolve a dica** — `e550353e`: `GET /fila-separacao` só acrescenta `itens[].pegar_em`, `itens[].pegar_em_aviso`
  (`null | NENHUM_ENDERECO_COBRE | SEM_ENDERECO_SUGERIVEL | PLANEJADA_NAO_COBRE | PLANEJADA_INDISPONIVEL`), `itens[].pegar_em_alerta`
  (`null | RETENCAO_NO_MATERIAL`, Fase 5) e `ordem_coleta`. 4 consultas por chamada (5 com série), nenhuma por requisição; sem trava
  (B1250). `filaSugestaoColeta.api.test.js` (12).
- [x] **A tela** — `aa41152f`: *"Pegar em ⟨end⟩ (⟨caminho⟩) — lote ⟨L⟩ (vence DD/MM/AAAA) · ⟨q⟩ ⟨un⟩ — escolha este endereço no 'Sai de' ao
  separar"*, os avisos e a lista **Ordem de coleta** (≥ 2 paradas). `FilaSeparacao.test.js`.
- [x] **Integração pela rota e pelo serviço** — `f35321ac`: `filaSugestaoColetaIntegracao.api.test.js` (6: separar o sugerido, a
  segunda requisição vê o par descontado, rota = serviço, dica velha recusada pela porta, C1, B821).
- [x] **Revisão adversarial (Fase 5)** — `9efbcf4a` (servidor): alerta de retenção (a retenção é do material, não do endereço — B1258),
  `PLANEJADA_INDISPONIVEL` (a planejada bloqueada/inativa dizia "o resto não cabe lá"), testes do lote da planejada e da virada de dia de
  Brasília; `9b159c69` (tela): com lote, o aviso manda escolher o lote no "Sai de" da entrega em vez de "a entrega passa a sair automática"
  (C451, defeito anterior B204).

**Fica de fora (D (188)):** a pré-seleção do "Sai de" na janela de separação e o PDF da lista de coleta (Etapa 189, B1257); a combinação de
endereços (B1254); a distância real (B1252); o separado no automático não desconta a dica (B1255) e duas requisições recebem o mesmo endereço
(C449); a validade do lote da Entrada manual não é gravada (C450, anterior).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits — decisão de
produto) e, de integridade, C198 (equipe de dois — B505 (ii)). A "rota de picking" sai da lista.

## Etapa 189 — a janela de separação já abre no endereço sugerido, e a fila imprime a lista de coleta (2026-10-23)

Plano: `docs/superpowers/plans/2026-10-23-almoxarifado-etapa189-lista-de-coleta-e-pre-selecao-do-sai-de.md`.

- [x] **A rota da sugestão por requisição** — `da0c2d6b`: `GET /api/almoxarifado/requisicoes/:id/sugestao-coleta` (`separar_emitir`; 403 com
  a literal do `requirePermission`; 404 *"Requisição não encontrada"* para inexistente, inativa ou id que não é só dígitos, conferido antes do
  SQL) devolve `{ requisicao_id, itens: [{ item_id, separavel, pegar_em, pegar_em_aviso, pegar_em_alerta }], ordem_coleta }` — o recorte da
  fila para a requisição, pelo mesmo código (`listarFilaSeparacao(db, user, { requisicaoId })`). Fora da fila: `itens: []`. Só leitura, sem
  trava (B1260). `sugestaoColetaRequisicao.api.test.js` (6).
- [x] **A janela pré-seleciona** — `d043224f`, Fase 5 `940ba3c5`, `43b17210`: item sem separado pendente, com `pegar_em` que cobre
  (`cobre: true`, sem aviso), o par entre as opções do "Sai de" e cobrindo a quantidade (somando os irmãos no mesmo par) abre com o par
  escolhido e *"Sugerido pela fila de separação. Se pegou de outro endereço, troque aqui."*; os demais com `pegar_em` mostram *"Sugestão da
  fila: … — não veio escolhida; confira o saldo no 'Sai de' antes de escolher."*. A escolha do almoxarife vence — **também depois de a
  janela recarregar** (Fase 5, J2: antes, um item de outro material saindo da janela zerava as escolhas e a pré-seleção escolhia de novo).
  Sem sugestão (falha, 403, resposta estranha), fica no automático, sem erro. `RequisicoesSeparacaoPreSelecao.test.js` (23).
- [x] **A lista de coleta em PDF e as frases em `utils/coletaTexto.js`** — `4c1f059a`, Fase 5 `aa61d3d5`: *"Imprimir lista de coleta"* por
  requisição e *"Imprimir lista de coleta (todas)"*, do JSON já carregado (sem chamada nova); na ordem de `ordem_coleta`; caixinha **OK**
  desenhada; bloco *"Sem endereço sugerido"*; cabe na folha pela régua da Etapa 186. `listaColetaPdf.test.js` (19), `coletaTexto.test.js`
  (14), `FilaSeparacao.test.js` (26).
- [x] **Integração** — `d1146a6e`, Fase 5 `b2fe087e`: `preSelecaoColetaIntegracao.api.test.js` (9: separar do par e entregar sem escolha
  baixa do par, 0 trocas, nenhuma linha sem lote; o controle histórico no automático deixa −5 sem lote; dica velha → 400; C1; o custo das
  duas rodadas; e, da Fase 5, duas janelas com a mesma sugestão — C449); `RequisicoesPreSelecaoFluxo.test.js` (2).

**Fica de fora (D (189)):** item já separado no automático continua saindo no automático (o endereço não está gravado — I2 da 188, B1264);
separar o resto de outro endereço sem entregar a primeira parte troca a origem (B1262, C453); duas janelas com a mesma sugestão (C449, falha
segura); a lista única intercalando requisições (é a "Lista de separação como entidade", que continua `[ ]` — B1266); a combinação de
endereços para um item (B1254).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de
integridade, C198.

## Etapa 195 — as quantidades digitadas não voltam ao inicial ao recarregar (2026-11-05)

Plano: `docs/superpowers/plans/2026-11-05-almoxarifado-etapa195-quantidades-da-separacao.md`. Só tela
(`client/src/components/almoxarifado/RequisicoesList.js`); nenhum contrato de API, nenhum servidor.

- [x] **A guarda em `aplicarDetalhe`** — `650db899`: com a janela de separação (ou de entrega) aberta e o mesmo detalhe relido (foco,
  `visibilitychange` ou outro `abrirDetalhe`), `manterDigitado` mantém a quantidade de cada item que estava na janela no detalhe da tela e
  continua nela; item que saiu volta ao inicial (0 na separação, ausente na entrega) e não vai no envio; item que entrou ou saiu e voltou
  recebe o inicial; item sumido sai. Com a janela fechada, o inicial como antes (o **Aprovar e Separar** depende disso). B1309, B1310.
- [x] **A entrega também** — `650db899`: a mesma função em `quantidadesEntrega` (o C454 da entrega estava "não medido"; medido `1→2`). B1311.
- [x] **C452 removido** — `650db899`: `handleCompletarEntrega` = `abrirModalEntrega()`; o ramo `precisaSeparar` e o estado
  `entregaAposSeparar` saíram (inalcançáveis: o botão só renderiza com `temEntregavel`). B1312.
- [x] **Testes** — `650db899`, Fase 5 `727792a3`: `RequisicoesQuantidadesNoRecarregar.test.js` (8 cenários; o da Fase 5 é o digitado acima
  do novo máximo, que limitar em silêncio deixava verde). Controles positivos: seis sabotagens, cada uma derruba o cenário dela; a guarda
  `mesmo` (mesmo id) fica sem controle, declarada (redundante hoje — `abrirDetalhe` zera o detalhe ao trocar de id).

**Fica de fora (D (195)):** a requisição que saiu do status no recarregamento continua com a janela aberta, e a confirmação é recusada (Etapa
94); o digitado acima do novo máximo não é limitado (B1310 — o servidor recusa com a conta); "separar e entregar" num clique (B1312);
separar em duas vezes de endereços diferentes sem entregar no meio troca a origem (C453 — a próxima).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de
integridade, C198.

## Etapa 196 — separar em duas vezes: a parte separada primeiro continua saindo de onde foi separada (2026-11-05)

Plano: `docs/superpowers/plans/2026-11-05-almoxarifado-etapa196-origem-da-separacao-em-duas-vezes.md` (o bloco "Fase 2 — correções" manda
sobre o texto de cima). Tronco (motor da requisição) e tela. Contrato de API inalterado: cada item ganha `quantidade_origem_separacao`
(número ou `null`, aditivo, via `ir.*`); `motivo_substituicao` na separação passa a ser ignorado sem 400 (B1318).

- [x] **Coluna e helper** — `4cf2b6dd`: `quantidade_origem_separacao REAL` (safeAlter, primeiro boot em pasta vazia conferido);
  `parteDaOrigem` / `parteOrigemSql` / `PARTE_ORIGEM_SQL` em `requisitionService.js` (sem origem 0; com quantidade, ela limitada à caixa;
  origem antiga `NULL` = a caixa inteira, RN-196.10, B1317).
- [x] **Separação** — `aecaadd3` (RN-196.01..05, 196.09, 196.10): a 1ª rodada com endereço vira a origem com a quantidade; o mesmo par soma;
  outro par, automático ou só lote mantêm origem e parte; toda rodada sobre item com origem grava a parte (o dado antigo não herda a parte
  nova — Fase 2, achado 2); o comprometido do par (`pedidoSeparacao` e `outras` da régua) conta a parte. **A troca `SEPARACAO` saiu** (B1314).
- [x] **Entrega e devolução à prateleira** — `83abf7eb` (RN-196.06..08, 196.10): a planejada vale até a parte; a parte cai pelo que **saiu**
  (`baixadoComOrigem`, Fase 2 achado 3); a entrega de outro par consome primeiro a parte sem origem e só registra troca acima dela (Fase 2,
  achado 1); a devolução faz `parte = MIN(parte, caixa)`.
- [x] **Fila e sugestão** — `425acd91` (RN-196.09): `planejados` pela parte; `separado_pendente` pela parte (NO-OP declarado: só o `> 0`);
  `lotService.js:466` intocado (conta itens; NO-OP declarado).
- [x] **Teste vizinho fora do plano** — `f4ba735c`: `separacaoOrigemPorItem.api.test.js` RN-02 afirmava "planejada nula" (regra da 59) e foi
  reescrito.
- [x] **Tela** — `e3f9b929` (RN-196.11, 196.12): `pendentePlanejado(item)` = `min(parte, separado − entregue)` nos quatro pontos; o aviso novo
  da separação sem motivo; `FRASE_PARCIAL` nova; *"separado de ⟨end⟩ (⟨q⟩ ⟨un⟩)"* no detalhe.
- [x] **Integração** — `1eca71f1`: `origemSeparacaoEmDuasVezesIntegracao.api.test.js` (9), pela rota e pelo serviço, até a exclusão.
- [x] **Fase 5** — `736ccb49` (K1: séries de outro lote num clique com parte sem origem valem como de outro par — **B1319**; K2: a entrega
  escolhendo a própria origem; K3: dado antigo com entrega parcial) e `4ba2e9b4` (K4: a dica da entrega diz a quantidade da parte; K5: o
  "Motivo da troca" da entrega segue a régua do servidor).

**Estava errado nesta spec (regra 5 do CLAUDE.md):** o item "Substituição de lote com registro" dava o motivo (1) como "pago na Etapa 65"
(a rodada que apaga a planejada registra a troca `SEPARACAO`), e a tabela de regras tinha a linha correspondente. As duas estão **riscadas à
vista** com "revogado pela 196 (B1314)". O item continua `[ ]` pelo motivo (2) (a troca de **série**, D (63), D (65)). O plano da 195 também
estava errado num ponto (a 2ª rodada **é** pré-selecionada com a planejada desde a 65, quando ela cobre) — registrado na Fase 0 do plano da 196.

**Fica de fora (D (196)):** em material com lote, a parte automática sai da linha *sem lote* (C451/B204 — no caso real −3, era −6; a próxima); *(— feito na 197 para material com `controle_lote`: no caso real a linha sem lote fica 0)*
uma origem por item (a 2ª rodada de outro endereço escolhido sai no automático, C461); o estorno da exclusão manda a saída automática para a
padrão (D (51)); séries de dois lotes na mesma entrega continuam recusadas (Etapa 61); a dica da Fila ainda diz "troca a origem" (C462).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de integridade,
C198.

## Etapa 197 — separar em duas vezes, 2ª parte: em material com lote, a parte automática da entrega baixa do lote certo (2026-11-05)

Plano: `docs/superpowers/plans/2026-11-05-almoxarifado-etapa197-entrega-automatica-pelo-lote.md` (o bloco "Fase 2 — correções" manda
sobre o texto de cima). Tronco (motor da requisição, só `entregarSemTrava`) e tela (textos). Contrato de API: `PUT /requisicoes/:id/entregar`
igual (payload, resposta e recusas; o livro passa a ter uma SAIDA por lote); `GET /fila-separacao` ganha `controle_lote` por item (aditivo).
Motor de estoque intocado (B1325).

- [x] **A parte automática por lote** — `ee835811` (RN-197.01..10, B1320–B1325): `plano.controleLote` lido do cadastro por item (gatilho
  `controle_lote = 1` e item sem série, B1321); o corpo de uma baixa virou `baixar(plano, baixa, quantidade, lote)` (motor, livro do item e
  entregue relativo depois de cada chamada — RN-197.09); na passada 2, o pedaço automático lê os lotes **ali** (`lotesParaOAutomatico`) e
  divide por `dividirPorLotes` (pura, exportada; fatia `<= Q.QTD_FOLGA` descartada — Fase 2 item 4); cada fatia leva o `reserva_id` do
  pedaço; o resto sem lote como antes (B1323). Fase 2 itens 1 e 2: o saldo de cada lote desconta a parte guardada (`PARTE_ORIGEM_SQL`) das
  caixas de requisição ativa em `STATUS_COM_CAIXA` e o que está em inspeção no lote. Reescritas no mesmo commit:
  `preSelecaoColetaIntegracao` ×3 (+ validades relativas), `origemSeparacaoEmDuasVezesIntegracao` ×3, `loteControleObrigatorio` ×2 (o nome
  mentia), `lotesResumo` (10). `b751b3ab`: placares e controles (i)–(x) no plano.
- [x] **Fila, C462 e notas** — `58227edf` (`ma.controle_lote` no SELECT da fila e `controle_lote` nas linhas; validades de
  `filaSugestaoColeta*` relativas a hoje — senão caíam sozinhas em 11/11, Fase 2 item 5), `d8a4f1d9` (C462: as três frases de
  `textoAvisoPegarEm` e o sufixo `controle_lote ? NA_ENTREGA_LOTE_AUTOMATICO : NA_ENTREGA_ESCOLHA_O_LOTE`, B1328), `398d1e69` (notas de
  `LotesAlmoxarifado.js` e `reportRegistry.js`). Feita numa worktree e integrada por cherry-pick (os hashes da worktree não existem).
- [x] **Integração** — `e011affe` (`entregaAutomaticaPeloLoteIntegracao.api.test.js`, 8): pela rota, fila → 1ª rodada no par sugerido →
  chegam L2 e L3 → 2ª rodada sem "Sai de" → entrega de um clique → resumo/relatório sem linha sem lote → devolução citando a SAIDA de L3 →
  estorno pelo livro → exclusão; pelo serviço, reserva 4 + excedente 2; controle "sem a feature" em cada um. `cbb2b66f`: plano.
- [x] **Fase 5 (três revisores frescos, ~440 entregas sorteadas, 0 violações depois do conserto)** — `838bb350` (M1 **crítico**: a parte
  guardada de outra caixa descontada só no lote deixava o claim drenar o endereço guardado — a outra entrega tomava 400 "não serve mais";
  agora o lote com guarda volta com as linhas (lote, endereço), cada uma com o livre dela, e o pedaço vai ao motor com `localizacao_origem_id`
  e origem estrita, pulando linha sem endereço e endereço bloqueado — B1329), `1723b78c` (M2–M5: reserva no resto sem lote; filtro de
  requisição ativa — a exclusão **não** limpa a origem guardada, C467 *(valeu até a 203: desde ela a exclusão limpa, ver o bloco "Etapa 203")*; inspeção no 2º lote; lote sem validade por último), `351ee457` (M6: as
  notas não diziam que o que os lotes elegíveis não cobrem sai sem lote — C464), `6d4dec1d` (B1329 no novidades), `1ed41bb8` (2º fix-round:
  a parte do **próprio** item que não sai da origem era descontada inteira — linha sem lote negativa num material sem saldo negativo e lote
  inflado; agora `parteQueFica = parte − troca`, a conta do `finally`). Ruído: 0.

**Estava errado nesta spec (regra 5 do CLAUDE.md):** a D (136) dizia que a saída automática "continua tirando só do saldo sem lote (B204)" e
o "Fica de fora (D (196))" dava a parte automática de material com lote como saindo da linha sem lote — eram verdade até a 197 e **deixaram de
ser** para material com `controle_lote`: anotadas à vista nas duas linhas, não apagadas. A spec 10 (pendência (g)) dizia que a exclusão
"devolve sem lote" — **estava errada desde a Etapa 58** (B232); corrigida lá, à vista.

**Fica de fora (D (197)):** o que nenhum lote elegível cobre sai sem lote (C464); material sem controle de lote, EPI e internos (C465); o
`LIMIT 30` das saídas elegíveis da devolução, com N saídas por entrega (C465); bloqueio e terceiros sem lote — o automático pode tirar a peça
da quarentena (C466); as linhas sem lote negativas antigas (B1327); duas requisições separadas do mesmo par escolhido (C449 — a próxima) *(— resolvido na separação pela 198: a segunda é recusada na separação com a conta; ver o bloco "Etapa 198")*.

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de integridade,
C198 e o C449.
*(— desde a 198 o C449 está resolvido na separação; o que sobra dele é a entrega com "Sai de" à mão, C468 — ver o bloco "Etapa 198".)*

## Etapa 198 — a separação com "Sai de" conta o que já está separado para outras requisições (2026-11-05)

Plano: `docs/superpowers/plans/2026-11-05-almoxarifado-etapa198-separado-de-outras-requisicoes.md` (o bloco "Fase 2 — correções" manda
sobre o texto de cima). Tronco (motor da requisição, `requisitionService.js` só). Contrato de API: `PUT /requisicoes/:id/separar` (e
`/separacao`, a mesma `handleSeparacao`) com payload, perfis e sucesso **iguais**; recusa nova 400 C1 só para entrada com
`localizacao_origem_id`. `PUT …/entregar`, `GET /fila-separacao`, `GET /requisicoes/:id/sugestao-coleta` e `GET /estoque/:id/saldos`
inalterados. Nenhuma tela mexida (`client/` intocado).

- [x] **A aceitação conta as outras** — `2fa621de` (RN-198.01..08, B1330–B1334): `caixaVivaSql(alias)` (`COALESCE(r.ativo,1)=1 AND r.status
  IN STATUS_COM_CAIXA`) nos três lugares que filtram caixa (Fila/sugestão `lerDadosDaColeta`, automático da entrega `lotesParaOAutomatico`,
  separação); `parteGuardadaDeOutras(db, materialId, origemId, loteId, requisicaoId)` → `{ q, numeros }` (`SUM(PARTE_ORIGEM_SQL)` por
  requisição com parte > folga, números na ordem do id), com memo por chamada (`outrasDoPar`) — a aceitação e a régua da divergência leem a
  mesma; `checarOrigemItem(…, outras)` com a C1 da Fase 2 (sem o prefixo do material; plural; *"já contando ⟨n⟩ desta requisição"*; precedência
  da literal antiga quando o físico sozinho não cobre). Reescrita no mesmo commit: `preSelecaoColetaIntegracao` *"[Fase 5, C449]"* (era 200 na
  separação e 400 na entrega). Nenhum outro teste afirmava o defeito (`test:api` 585/585).
- [x] **Os testes das regras** — `1d24311b` (`separacaoSeparadoDeOutras.api.test.js`, 18 cenários pela rota e pelo serviço, inclusive a
  corrida `Promise.all` 10×), com os controles (i)–(vi) e o da entrega no plano.
- [x] **Integração (RN-198.09)** — `00d717ad`: o caso do item ponta a ponta pela rota da tela (`PUT …/separacao`) e pelo serviço — sugestão
  velha recusa na separação, reaberta aponta XP-01/L2, as duas entregam, saldos e livro conferidos. `97d7e0ef`: a seção Execução do plano.
- [x] **Fase 5 (um revisor fresco: 0 defeitos, 3 lacunas, ruído 0)** — `75da9211`: (a) a divergência deixou de contar caixa cancelada sem teste
  (trocar `outrasDoPar` pela query antiga na régua da divergência ficava 20/20) — cenário novo com `itens_json` `maximo` 4 / `divergente`;
  (b) material sem lote (`lote_separacao_id IS ?` → `= ?` ficava verde) — C1 sem o trecho *", lote"*; (c) a sobra nunca negativa (sem o
  `Math.max(0, …)` ficava verde) — dado antigo 4 + 4 em 6, *"sobra 0"*. Cada sabotagem derruba só o cenário dela; arquivo 23/23.

**Estava impreciso (regra 5 do CLAUDE.md):** o C467 (fechamento da 197) dizia que *toda* conta da parte guardada "só olha requisições **em
andamento**" — a régua da divergência da separação filtrava só `ativo` e contava a caixa de requisição **cancelada** legada (CANCELADO com
`ativo = 1`). Desde a 198 as três usam `caixaVivaSql` (RN-198.04).

**Fica de fora (D (198)):** a entrega com "Sai de" escolhido à mão não desconta a parte guardada de outra caixa (C468 — contorna a recusa
da 198: automático na separação + "Sai de" à mão na entrega) *(— resolvido na 200 para o "Sai de" de outro par; ficam C470–C472, ver o bloco "Etapa 200")*; o "Sai de" da janela mostra o físico do par, sem o comprometido (C469) *(— resolvido na 201: o rótulo mostra a sobra, ver o bloco "Etapa 201")*; limpar a
origem na exclusão (C467, protegido pelo filtro) *(— resolvido na 203: a exclusão limpa a origem, ver o bloco "Etapa 203")*; o só lote e o automático (B1332).

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de integridade,
C198 e o C468. *(— o C468 foi resolvido na 200 no "Sai de" de outro par; o que falta dele está em C470, C471 e C472 — ver o bloco "Etapa 200".)*

## Etapa 200 — a entrega com "Sai de" escolhido à mão respeita o que outra requisição separou dali (2026-11-05)

Plano: `docs/superpowers/plans/2026-11-05-almoxarifado-etapa200-entrega-a-mao-respeita-separado.md` (o bloco "Fase 2 — correções" manda
sobre o texto de cima). Tronco (motor da requisição, `requisitionService.js` só). Contrato de API: `PUT /requisicoes/:id/entregar` com
payload, perfis e sucesso **iguais**; recusa nova 400 E1 só no caso (c) — entrada com `localizacao_origem_id` que **não** é a origem guardada
do item (`!!origemId && !saiDaOrigem`: outro endereço, outro lote quando a guardada tem lote, ou item sem origem guardada; inclusive com
`serie_ids`). `PUT …/separar` / `…/separacao` (a C1 letra por letra), `GET /fila-separacao`, `GET /requisicoes/:id/sugestao-coleta` e
`GET /estoque/:id/saldos` inalterados. Nenhuma tela mexida (`client/` intocado).

- [x] **A entrega conta as outras no caso (c)** — `d7ff9a39` (RN-200.01..08, B1338–B1341): `memoParteGuardadaDeOutras(db, requisicaoId)` e
  `mensagemSeparadoDeOutras({ gesto, … })` extraídos (a separação usa os dois; `separacaoSeparadoDeOutras` 23/23 e
  `preSelecaoColetaIntegracao` 9/9 sem edição); `validarOrigemDaEntrega(…, contarOutras)` confere só o físico no laço e marca o item; a E1 sai
  de **uma passada depois do laço** (Fase 2, item 1), antes do só lote, da prévia e da alçada, com `ja = pedidoPorOrigem.get(par) −
  qtdComOrigem` e o físico do par **por lote**. `test:api` 586/586 depois da T1 — nenhum teste antigo afirmava o defeito (0 reescritas).
- [x] **Os testes das regras** — `943a486e` (`entregaSaiDeRespeitaSeparado.api.test.js`, 19 cenários pela rota e pelo serviço, inclusive a
  corrida `Promise.all` 10× alternando quem é lançado primeiro: separação venceu 5, entrega 5), com os controles (i)–(vi) no plano.
- [x] **Integração (RN-200.09)** — `71783dc8`: o caso do item pela rota da tela (`PUT …/separacao` + `PUT …/entregar` com o payload de
  `montarItensEntrega`) e pelo serviço — E1 em XB-01/L1, XP-01/L2 passa, R1 entrega pelo par, saldos, livro e trocas conferidos. `52ae600e`:
  a seção Execução do plano.
- [x] **Fase 5 (um revisor fresco: 0 defeitos, 3 lacunas)** — `5bc921e4`: (P1) vários itens — `continue` → `break` na passada do caso (c)
  ficava verde (item 1 em par livre, item 2 no par comprometido → 200); (P2) físico por lote — sem `lote_id IS ?` na leitura do físico
  ficava verde (XB-01 com L1 6 e L3 5 lia 11); (P3) séries (B1338) — `&& !infoSeries` na marca do caso (c) ficava verde. Cada sabotagem
  derruba só o cenário dela; arquivo 24/24.

**Estava errado (regra 5 do CLAUDE.md):** a B1335 (fechamento da 198) e o C469 diziam que a lista de saldos por endereço (`GET
/estoque/:id/saldos`) "a Movimentação também usa". Medido no fechamento da 200: no `client/` só `RequisicoesList.js:538` a chama (janelas de
separação e de entrega); o extrato do material usa a mesma `consultarSaldosPorLocalizacao` por outra rota (`extended.js:1021`).

**Fica de fora (D (200)):** o caso (b) com quantidade acima da parte (C470); o só lote (C471, B1341 — `claimSaldoDoLote` no motor); a parte
guardada de um irmão da mesma requisição que não sai nesta entrega (C472, B1340); o rótulo do "Sai de" (C469, B1342 — a próxima) *(— feito na 201, ver o bloco "Etapa 201")*.
*(— **Etapa 208:** esta frase **estava certa e deixou de valer** para o C470 e o C472: o caso (b) acima da parte entra no caso (c) pelo excesso (B1408) e a guarda que fica dos irmãos conta (B1407; a B1340 revertida nessa parte, B1413) — ver o bloco "Etapa 208".)*

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de integridade,
C198, C470, C471 e C472.

## Etapa 201 — o "Sai de" mostra o que sobra depois do separado para outras requisições (2026-11-05)

Plano: `docs/superpowers/plans/2026-11-05-almoxarifado-etapa201-sai-de-mostra-o-que-sobra.md` (o bloco "Fase 2 — correções" manda sobre o
texto de cima). Tronco (rota de leitura + régua do serviço) e um galho de tela. Contrato: `GET /api/almoxarifado/estoque/:materialId/saldos`
ganha `?requisicao_id=N` opcional (presente e não `/^[1-9]\d*$/`, inclusive repetido → 400 `{ error: 'requisicao_id inválido' }`;
inexistente → conta todas) e, por linha, `separado_outras` (0 sem endereço) e `sobra` = `Q.qtd(max(0, quantidade − separado_outras))`. Mesma
ordem e mesmos campos de antes; 401/403 do `auth`/módulo e `[]` do material inexistente inalterados; sem trava (leitura de momento — a C1/E1
decidem). `GET /materiais/:id/extrato` e `consultarSaldosPorLocalizacao` **intocados**. Payloads de separação e entrega, C1 e E1 inalterados.

- [x] **A régua agrupada e a rota** — `1b04ad38` (RN-201.01..05, B1343–B1345): `parteGuardadaDeOutrasPorPar(db, materialId, requisicaoId)`
  ao lado de `parteGuardadaDeOutras` (que não mudou; exportada para a prova de equivalência), chave `${origemId}|${loteId ?? ''}`; a rota
  valida o parâmetro e monta os dois campos.
- [x] **Os testes das regras** — `4b62f20c` (`saldosSobraDeOutras.api.test.js`, 11 cenários: .01, .02, .03 ×6, .04 ×2, .05, com a equivalência
  rota × `PorPar` × `parteGuardadaDeOutras` par a par) e os controles (i)–(vi) no plano.
- [x] **A tela** — `f089c284` (RN-201.06..08, B1346–B1348): as duas janelas pedem com `requisicao_id=${detalhe.id}`; `rotuloOrigem(s,
  propriaNoPar)` com a literal L1 da Fase 2; `sobraDaOpcao` em `maxSeparavelNaTela` e no teste de cobertura do sugerido (servidor sem o campo →
  `quantidade`, compat). Jest `RequisicoesSaiDeSobra.test.js`; os mocks de saldos de dez arquivos passaram a casar a URL com
  `?requisicao_id=55` (só a fronteira HTTP).
- [x] **Integração (RN-201.09)** — `b3727231`: o número da lista é o número da recusa, pela rota e pelo serviço (inclusive "R2 separa 1, lê
  sobra 1, tenta 2 → C1 com sobra 1"). `65902725`: a seção Execução do plano.
- [x] **Fase 5 (um revisor fresco: 0 críticos, 1 correção menor, 2 lacunas)** — `dfffe96b`: o filtro `ir.material_id = ?` da régua agrupada
  (`… OR 1` ficava verde) — cenário de dois materiais sem lote em XB-01, arquivo 15/15; `ab1d6246` (**B1349**): na separação, com só a
  própria no par, o rótulo mostra a sobra (*"XB-01 — lote L1 (sobra 5 de 6; 1 desta)"*), como a recusa física (físico − `jaPedido`); `298a3d72`:
  `propriaNoPar` com parte 1 de caixa 5 + irmão no par + outro material no par (`pendenteSeparado` no lugar de `pendentePlanejado`, ou sem o
  filtro de material, ficavam verdes).

**Fica de fora (D (201)):** o número da abertura da janela (C473); a entrega sem desconto da própria e sem teto por origem; o campo de
quantidade da separação; o "Saldo:" do cabeçalho do item; o extrato e a Movimentação.

**O que falta para 🟢:** o mesmo de produto (lista de separação como entidade, troca de série, localização de kit e kits) e, de integridade,
C198, C470, C471 e C472.

## Etapa 203 — a exclusão da requisição limpa a origem separada dos itens (2026-11-06)

Plano: `docs/superpowers/plans/2026-11-06-almoxarifado-etapa203-exclusao-limpa-a-origem.md`. Só servidor; contrato inalterado (as duas rotas
de exclusão, `DELETE /api/almoxarifado/requisicoes/:id` e `DELETE /api/requisicoes-material/:id`, mesmos status, mensagens e resposta
`{ success, estornos, reservas_liberadas }`). O C467 dizia "pequeno, sem efeito hoje": confirmado na Fase 0 — os oito leitores de
`origem_separacao_id`/`lote_separacao_id`/`quantidade_origem_separacao` filtram a requisição viva (`caixaVivaSql`, a fila por `ativo` e
status, o detalhe por `ativo`, o lote por `STATUS_COM_CAIXA`).

- [x] **A limpeza** — `c28f7d37` (RN-203.01..05, B1358–B1360): em `excluirSemTrava`, um `UPDATE` dos itens da requisição (as três colunas
  NULL) logo depois do `UPDATE … ativo=0` que venceu, dentro das duas travas, antes de liberar as reservas; best-effort (`console.warn`, 200,
  sem nova tentativa — B447/B452). A caixa e o `itens_json` das rodadas ficam. Testes `exclusaoLimpaOrigem.api.test.js` (5: as duas rotas,
  entrega parcial com a outra requisição no mesmo par intocada, recusas 403/400 que não limpam, falha simulada na limpeza).
- [x] **O filtro continua provado** — `c28f7d37` (RN-203.06, B1362): os quatro testes que montavam a excluída pela rota com a origem gravada
  (198 `[RN-198.03 excluida, C467]`, 200 `[RN-200.05 excluida]`, 197 `[Fase 5 M3]`, 201 `[RN-201.03 excluida]`) assertam a origem limpa e
  ganharam a versão por SQL (a excluída de antes da 203, B1361), mais dois controles "só `ativo = 0`" (198 e 200).
- [ ] **Acerto das excluídas antigas** — não feito de propósito (B1361): sem efeito em conta, e mexeria em dado de produção.

**Fica de fora (D (203)):** as excluídas antigas (B1361); o cancelamento não limpa (C476 — mas não cancela com caixa); a caixa e o histórico.

**O que falta para 🟢:** o mesmo de produto e de integridade da 201 (C198, C470, C471, C472).

## Etapa 205 — lote bloqueado, reprovado ou vencido não conta na separação (2026-11-06)

Plano: `docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md` (Fase 2 `422b8e90`, que manda
sobre o texto de cima). C464 dividido: a 1ª parte (aprovação e separação) é esta; a 2ª (entrega) é o item 7 do 2º pacote. A parte da
aprovação está na spec 07 (seção "Etapa 205"). Nenhuma rota nova, nenhum código HTTP novo, nenhuma trava nova (B1375).

- [x] **A régua e a conta** — `loteImpedido.js` (`predicadoLoteImpedidoSql`, `loteImpedidoSql`, `fraseLoteImpedido`): impedido = o contrário de
  `elegivel` (B1369); a conta abate a inspeção do lote, a bloqueada, os terceiros e a inspeção sem recebimento (B1370 + Fase 2 I1/I2), só em *(— **Etapa 217 (B1438):** a bloqueada e os terceiros que sabem o lote saem do lote deles; só o resto é abatido do material — o desconto
  deixou de ser "menor que o real" quando a peça bloqueada está num lote bom; `e2a43f20`)*
  `controle_lote = 1` (B1371). `saldoDisponivelParaItem` devolve `lote_impedido` e `disponivel_liberado`; `disponivel` e `disponivel_material`
  byte a byte (B1368) — `8bebd3ce`. Testes `loteImpedido.api.test.js` (RN-205.01 oito lotes, RN-205.02 a–l, sorteio de 150 materiais).
- [x] **A porta da separação lê o liberado** (`tetoCom` com `disponivel_liberado`), a **Fila** subtrai `lote_impedido` só no `teto` (não no
  `entregavel` nem em `disponivel`) e o **detalhe** ganha a coluna `lote_impedido` (aditiva, fica no JSON — Fase 2 I4), com `normalizarItem`
  usando `estoque − lote_impedido` só no separável (o `teto` de sempre continua alimentando `saldo_entregavel`) — `82ae8664` (RN-205.07,
  .08, .09; M1). Testes `loteImpedidoSeparacao.api.test.js`.
- [x] **A 2ª frase da recusa** — *"Não entram ⟨n⟩ ⟨un⟩ em lote bloqueado, reprovado ou vencido."*, ⟨n⟩ = o que o lote cortou do teto, só
  quando o máximo fica abaixo do pendente (Fase 2 I3, B1373) — `82ae8664`. O corte da B1378 não aconteceu.
- [x] **A linha na janela de separação** (`RequisicoesList.js`) — *"· Em lote bloqueado/reprovado/vencido: ⟨n⟩"* — `18b41f47` (T2b); com a
  unidade e *"; a reserva desta requisição continua valendo"* quando o separável passa de saldo − impedido — `0516c933` (Fase 5 P4, B1382).
  Jest `RequisicoesLoteImpedido.test.js`.
- [x] **Integração pela rota e pelo serviço** — Entrada v2 → bloquear → aprovar (4) → fila (4) → detalhe (4) → separar 5 (400, literal) →
  separar 4 → entregar 4 (sai de L1) → desbloquear → R2 reserva 6 — `e989ec54`; a releitura depois da conversão da reserva da OS
  `33328089`; a régua da divergência gravada na rodada (máximo 4, não divergente) `689bfa7d` (Fase 5 P3). Testes
  `loteImpedidoIntegracao.api.test.js`.
- [x] **Desempenho** — o saldo filtra também pelo material e o índice `idx_receb_itens_almox_lote` (B1380, A111): 200 leituras ~1,8 s → ~35 ms
  — `17fb5202` (Fase 5 P2). Teste por `EXPLAIN QUERY PLAN` (sem `SCAN`).
- [x] **RN-197.03 ajustado** — separava 4 com só 2 em lote elegível; passou a separar **antes** de o lote ficar impedido (o caso que chega à
  entrega) — `9bf6ccd6`. Quebra esperada, não regressão.
- [ ] **O "Sem lote atribuído" negativo abater o lote impedido** — feito em `65a19db6` (Fase 5 P1) e **desfeito** em `13fe3691`: o negativo é
  anônimo (não diz de qual lote saiu) e abatê-lo deixava sair peça de lote bloqueado com o livro apontando outro lote. Fica a falha segura
  (**C484**, **B1379** reescrita); a causa é a entrega (item 7).
- [ ] **A entrega** — não muda de propósito (RN-205.10, fixado em `e989ec54` para o item 7 encontrá-lo vermelho). *(**Feito na Etapa 206** —
  `df1de701` (o RN-205.10 virou a recusa, RN-206.06), `ccbce184`; ver o bloco "Etapa 206".)*

**Fica de fora (D (205)):** a entrega (C464 2ª parte); as telas de saldo (C481); a reserva manual (C479); as três portas que distribuem
(C478); liberar o lote não distribui (C480); o negativo sem lote (C484).

**O que falta para 🟢:** o mesmo de produto e de integridade da 203 (C198, C470, C471, C472) e, desta, a entrega que recusa lote impedido
(item 7).

## Etapa 206 — a entrega recusa lote bloqueado, reprovado ou vencido (2026-11-06)

Plano: `docs/superpowers/plans/2026-11-06-almoxarifado-etapa206-entrega-recusa-lote-impedido.md` (Fase 2 `7159f344`, que manda sobre o
texto de cima). A 2ª parte do C464 (a 1ª é a Etapa 205, acima) e a causa do C484. Rota sem mudança (`PUT /requisicoes/:id/entregar`):
recusa nova 400 `{ error }`. Nenhuma trava nova (B1392).

- [x] **SDD** — os seis testes que fixavam o de hoje viram a regra nova antes do código: RN-197.03 (bloqueado, vencido) → recusa; RN-205.10 →
  RN-206.06; a segunda rodada → RN-206.11 (refeita com entrega parcial antes do bloqueio); os dois do C484 montam o negativo por SQL —
  `df1de701`.
- [x] **A conferência e a literal** — `conferirAutomaticoPeloLote` na prévia de `entregarSemTrava`, depois do E1 de todos os itens e antes de
  `verificarBloqueioLiberacao` (B464): por material com `controle_lote`, a parte automática (sem série) contra `cabe` (B1384, Fase 2 item 1 —
  `origemPorItem` + `saiuSimulado` + `lotesParaOAutomatico`, mais o sem lote positivo, B1385); passou **e** há lote impedido (B1386) → 400
  `fraseEntregaLoteImpedido` (B1388; 6º argumento `nadaSai`, divergência do contrato) — `ccbce184`. `parteQueFicaPorItem` subiu para antes da
  prévia (TDZ, Fase 2 item 4). Testes `entregaLoteImpedido.api.test.js` RN-206.01 a .05, .07 a .10, .12, .09b.
- [x] **Detalhe e Fila** — `normalizarItem`: entregável = `maxEntregar(item, max(0, entregavelPeloMotor(…) − loteImpedido), tetoSeparavel)`,
  segunda rodada `caixa + tetoSeparavel`; Fila: `− lote_impedido` com piso (B1390, Fase 2 item 2) — `62c3dc79`. O `teto` sem uso saiu. RN-206.11.
- [x] **Integração pela rota e pelo serviço** — aprovar → separar → bloquear → detalhe 2 / Fila 2 → entregar 4 (400) → 2 (L1) → L2 ATIVO → 2
  (L2), mesmo livro pelos dois caminhos; RN-206.01b (inspeção fora do saldo da frase) e RN-206.08b (a falta do material) da revisão "passaria
  quebrado?" — `a286ba46`. Teste `entregaLoteImpedidoIntegracao.api.test.js`.
- [x] **Fase 5 R2 (B1394; defeito da 197)** — a passada 2 subtraía duas vezes a guarda do próprio item (relia `PARTE_ORIGEM_SQL` depois da
  baixa e ainda tirava o que saiu): o automático do irmão levava a guarda que fica e a 2ª entrega do item tomava "não serve mais".
  `parteQueFicaPorItem` cobre também quem sai da origem, com a parte de antes da baixa — `31aca1a3`. RN-206.14 a/b.
- [x] **Fase 5 R1 (B1395)** — o detalhe e a Fila não descontavam a guarda de um irmão no lote bom (ofereciam 3, a porta recusava "nada
  sai"): `cabeDoAutomaticoPeloLote` sai da conferência e `tetoDaEntregaPeloLote` (anotado pela rota do detalhe, lido pela Fila) usa a mesma
  conta — `00d9e24a`. RN-206.13. O teto é por item sozinho (**C489**).
- [x] **Fase 5 T1–T5** — cinco testes que a suíte deixava passar com a conferência sabotada (dois materiais; `parteQueFica` na conferência;
  lista vazia de impedidos; negativa somando no sem lote positivo; o `nadaSai`) — `0996c3c2`. RN-206.15 a–e.
- [ ] **Série em lote impedido antes da primeira baixa** — fora (**C486**): item com série não entra na conferência; o motor recusa na baixa.
- [ ] **Falta sem lote impedido** (inspeção, guarda de outra caixa) — fora de propósito (B1386, **C485**): sai sem lote, negativa, como antes.

**Esta spec dizia** (bloco da 197, acima) *"o resto sai sem lote como antes (B1323, C464)"* e, no bloco da 205, *"A entrega não muda"*: os
dois **valiam até a 206**. O resto sem lote agora é só o saldo sem lote positivo (B1385) e a falta sem lote impedido (C485).

**Fica de fora (D (206)):** C485, C486, o negativo antigo (C487), o entregável aproximado e por item (B1390, C489), a corrida de bloquear
no meio da entrega (B1392). **Anteriores, achados na 3ª revisão da Fase 5 e não consertados:** a guarda **sem lote** levada pelo automático de
outro item (`lotesParaOAutomatico` só protege guarda com lote — o filtro `lote_separacao_id IN (…)`, `requisitionService.js:1927` — e a
passada 2 só o chama com `controleLote`, `:2653`) — **C490**, a próxima; e o teto do detalhe que conta a parte da própria origem cujo lote
ficou impedido — **C491**.

**O que falta para 🟢:** o mesmo de produto e de integridade (C198, C470, C471, C472) e, desta, C490 (a próxima), C485 e C486.

## Etapa 207 — a entrega respeita a guarda sem lote (2026-11-06)

Plano: `docs/superpowers/plans/2026-11-06-almoxarifado-etapa207-entrega-respeita-guarda-sem-lote.md` (Fase 2 `7e2708d7`, que manda sobre o
texto de cima). Fecha o **C490** (anterior, da 3ª revisão da 206). Rota sem mudança (`PUT /requisicoes/:id/entregar`): payload, códigos e
literais iguais, **nenhuma recusa nova** (B1398). Nenhuma trava nova (B1403).

- [x] **SDD** — `entregaGuardaSemLote.api.test.js` com as RN sobre o código de antes: RN-207.01/.03/.04/.07 vermelhos (a parte automática
  sem lote saía numa SAIDA sem endereço que levava a guarda), RN-207.02 a/c/d e .05 a/b verdes (a fronteira) — `08e1070c`.
- [x] **A régua** — `guardaQueConta` extraída de `lotesParaOAutomatico` (sem mudar a conta), `fatiasSemLoteParaOAutomatico` (a guarda sem
  lote das caixas vivas de todas as requisições, por endereço; `null` sem guarda que conte — decidido antes de ler o saldo, Fase 2 I3 — ou
  quando o livre usável não cobre; usável = `lc.id` não nulo, não bloqueado, livre > folga, Fase 2 M1) e `baixarSemLote` na passada 2 (o
  ramo sem `controleLote` novo e o `resto` do ramo com lote, B1400; série como hoje, B1404) — `842567ca`. Controles (i)–(v); livro de
  material sem guarda 300/300 igual ao serviço de `4d8fb611`.
- [x] **O livro e o desfazer** (B1402) — a exclusão pela rota devolve cada fatia ao endereço da SAIDA; controle: a SAIDA sem endereço volta
  à padrão (a ENTRADA vai sem endereço no livro — o plano dizia "destino P"; o teste afirma o medido) — `3db19406`. RN-207.06.
- [x] **Integração pela rota e pelo serviço** — dois itens do mesmo material, aprovar, separar (item 2 de A), detalhe 3 e 2 (B1401), entregar
  item 1 (A 1 + B 2, com o `reserva_id` do item) e item 2 (A 2); `GET /movimentacoes?material_id=` mostra a origem de cada SAIDA — `8a99e628`.
  `entregaGuardaSemLoteIntegracao.api.test.js`.
- [x] **Sorteio RN-207.08** (semente 207, 400 casos — o plano dizia 120; com 120 a premissa T ≥ 10 não fechava) com os invariantes T, G, N,
  L, F — `fddeb5ee`; duas asserções da revisão "passaria quebrada?" (RN-207.05 c, endereço apagado; RN-207.04 b, requisição cancelada) —
  `147dbf6b`.
- [x] **Fase 5 S1 (B1406, regressão da T1)** — a fatia pulava a linha sem endereço que o claim de hoje baixa primeiro (sem padrão, ou padrão
  vazia com a linha sem endereço maior) e tirava de A o livre que outra requisição ia escolher (R3 400 "sobra 0"). Agora a função simula o
  claim de hoje sobre todas as linhas sem lote e só fatia quando ele levaria guarda — `730a8a00`. RN-207.09 a/b; o sorteio deixa de isentar
  G e N nos blocos que baixam como hoje.
- [x] **Fase 5 S2–S4** — três lacunas de teste (o código estava certo): a fatia que leva mais do que falta (RN-207.10 e o invariante S), a
  padrão primeiro (RN-207.11) e a recusa legítima no sorteio (invariante R) — `12ca0500`.
- [ ] **Livre usável que não cobre** — fora de propósito (B1398, **C492**): sai como hoje.
- [ ] **Item com série** — fora (B1404, **C493**).
- [ ] **O corte da B1405** — não foi preciso (o ramo com lote entrou, RN-207.03); **C494** sem uso.

**Esta spec dizia** (bloco da 206, acima) que a guarda **sem lote** levada pelo automático de outro item era *"C490, a próxima"*: **feito
aqui**. E o bloco da 196 diz que *"o estorno da exclusão manda a saída automática para a padrão (D (51))"*: continua valendo para a SAIDA sem
endereço; a SAIDA fatiada desta etapa volta ao endereço dela.

**Fica de fora (D (207)):** C492, C493, a troca automática sem o endereço (C495), a padrão bloqueada que passa a sair pelas fatias (uma
recusa a menos, sem teste explícito — F (207)) e a devolução limitada à fatia (D (207, Fase 5)). **Anterior, achado na Fase 5 e não
consertado:** entregar com o "Sai de" escolhido no mesmo par da separação além da parte, ou num item sem origem no endereço do irmão, leva
a guarda do irmão da **mesma** requisição — o caso (c) só confere outras requisições (`memoParteGuardadaDeOutras(db, requisicaoId)`) e o
mesmo par acima da parte nem entra no caso (c) — **C496**, a próxima. *(— feito na 208, ver o bloco "Etapa 208".)*

**O que falta para 🟢:** o mesmo de produto e de integridade (C198, C470, C471, C472) e C496 (a próxima), C485, C486 e C492.

## Etapa 208 — o "Sai de" da entrega respeita a guarda do irmão da mesma requisição (2026-11-06)

Plano: `docs/superpowers/plans/2026-11-06-almoxarifado-etapa208-sai-de-respeita-guarda-do-irmao.md` (Fase 2 `4301c74b`, que manda sobre o
texto de cima). Fecha o **C496** (= **C472** da 200) e o **C470**. Rota sem mudança de payload, perfis ou sucesso (`PUT /requisicoes/:id/entregar`);
recusa nova: a E1 estendida, 400, só no caso (c) e no (b) com excesso (*"… mas 2 já está separado dali para outra peça desta requisição; sobra
1, …"*). `GET /estoque/:id/saldos` não muda (B1411). Nenhuma trava nova (B1412).

- [x] **SDD** — `entregaSaiDeGuardaDoIrmao.api.test.js` (13/21 no código de antes; RN-208.03 a/b verdes — são o controle do `fica`) e
  `[RN-200.06 (i)]` reescrito (a B1340 revertida, B1413) — `575174c0`.
- [x] **A conta** — `mensagemSeparadoDeOutras` com `irmaosQ/irmaosN` (B1409), `guardaDosIrmaosNoPar` (B1407, B1410), `parteQueFicaPorItem`
  sobe, a marca do (c) com o excesso (B1408), e o físico dos itens (c) adiado para depois dos (a)/(b) (Fase 2 item 2, B1415) — `227334f1`.
  Controles (i)–(vi).
- [x] **A tela** — `irmaosNoPar` no rótulo do Sai de da entrega (*"A (sobra 1 de 3; 2 desta)"*; o próprio item fora) — `5c60c868` (B1411).
- [x] **Integração pela rota e pelo serviço** — `entregaSaiDeGuardaDoIrmaoIntegracao.api.test.js` 3/3 — `f170693f`.
- [x] **Sorteio** — o `[RN-207.08]` sem a isenção da escolha à mão, com a 2ª forma no gerador, 2.000 casos — `53fd0fae`.
- [x] **Fase 5 (um revisor fresco: 0 defeitos; diferencial ~2.900 entregas, 0 recusas novas de entrega certa)** — `d88a53bc`: o filtro de
  material de `guardaDosIrmaosNoPar` sem teste (RN-208.06 e), o plural da forma mista sem teste (RN-208.06 d), e o comentário do adiamento que
  dizia "nenhuma literal muda" — **estava errado** (muda QUAL recusa sai, B1415).
- [ ] **O corte da B1414** — não foi preciso (a tela e o sorteio entraram); **C499** sem uso.
- [ ] **A guarda sem lote num lote escolhido** — fora (B1410, **C498**).

**Esta spec dizia** (bloco da 200) que a parte de um irmão que não sai nesta entrega não é protegida (C472) e que o (b) acima da parte fica
de fora (C470): **estava certo e deixou de valer**. E o bloco da 207 dizia "C496, a próxima": **feito aqui**.

**Fica de fora (D (208)):** C497 (a recusa física não diz de quem é o resto), C498, o rótulo que supõe que o irmão não sai junto (B1411) e o
dado antigo dentro da parte (B1408).

**O que falta para 🟢:** o mesmo de produto e de integridade (C198, C471) e C485, C486, C492, C497 e C498.

## Etapa 217 — a entrega e a separação descontam a peça bloqueada no lote (2026-11-13)

Plano: `docs/superpowers/plans/2026-11-13-almoxarifado-etapa217-entrega-nao-tira-peca-bloqueada.md`. Rotas sem mudança.

- [x] **A entrega automática** (`lotesParaOAutomatico`, também a conferência da 206 e o teto do detalhe) não tira do lote a peça em
  quarentena, reprovada ou em terceiro — `e2a43f20`.
- [x] **A aprovação, a fila, o detalhe e a separação** (`loteImpedidoSql`) descontam o bloqueado do lote certo (RN-217.04) — `e2a43f20`.
- [x] **O envio de remessa espera a entrega** (trava do material, B1442, RN-217.14) — `cad6da56` (trava; testes em `e2a43f20`).
- [ ] **Fora:** o **Sai de** manual (C513 — a próxima). *(**Resolvido na Etapa 218** — `97ba728c`.)*

Continua 🟡 (o que falta para 🟢 é o de antes: C478, C486, C491, C495, C497, C498, e agora C513).

## Etapa 218 — o lote escolhido à mão deixa de fora a peça presa (2026-11-13)

Plano: `docs/superpowers/plans/2026-11-13-almoxarifado-etapa218-lote-escolhido-desconta-peca-presa.md` (RN-218.01 a .23, B1443–B1452,
Fase 2 e Fase 5). **C513 resolvido.** Rota nova: nenhuma; `GET /estoque/:materialId/saldos` ganha `lote_livre`, `lote_bloqueado`,
`lote_inspecao` (aditivo).

- [x] **A separação** (`separarSemTrava`): com lote escolhido e peça presa no lote (retido + inspeção > folga; `controle_lote = 1`, sem série),
  `pode sair = MAX(0, saldo_L − inspeção_L − retido_L) − guardado das outras − própria (rodadas anteriores) − já pedido`; recusa com a
  literal da B1451 depois das de antes; a régua da divergência limitada pelo mesmo número (B1448) — `97ba728c`.
- [x] **A entrega** (`entregarSemTrava`): uma passada depois do "só lote", na ordem das origens conferidas (B1447); guardado = outras
  requisições + a guarda que fica dos outros itens desta (`guardaQueConta`; o próprio item fora — **o plano dizia "a guarda que fica das peças desta requisição", com o próprio item dentro; estava errado**: dava falsa recusa "só 0" numa caixa de 3 com 2 livres no lote; Fase 5); a planejada que não cabe recusa
  pelo "não serve mais" (B1446) — `97ba728c`.
- [x] **A janela** (`/saldos` + `RequisicoesList.js`): o sufixo *"— do lote podem sair N (…)"* e o teto da separação por `lote_livre` menos a
  guarda desta requisição no lote (B1449) — `97ba728c`.
- [x] **Fase 5 (B1452):** cancelar, encerrar e o retorno da remessa, a devolução ao fornecedor e o sucateamento do reprovado passam a gravar
  o documento junto do motor, sob `naTravaDoMaterial` (dois achados reproduzidos: o retido de todos os lotes sumia no meio do
  cancelamento; as reprovadas pareciam livres entre o carimbo e a baixa) — `e4490a2f`.
- [ ] **Fora (declarado):** série (B1445); a sugestão da fila (C517); o entregável do detalhe quando a planejada deixou de servir (C518);
  material sem controle de lote com lotes (D (218)). Antes do deploy: **A115**.

Continua 🟡 (o que falta para 🟢: C478, C486, C491, C495, C497, C498, e agora C517/C518).
Testes: `loteEscolhidoPecaPresa.api.test.js` (26), `loteEscolhidoTravas.api.test.js` (2), `RequisicoesLoteLivre.test.js` (8).
