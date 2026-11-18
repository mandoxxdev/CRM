# Estimativa 18/11/2026 — cadastro de material e almoxarifado (29h)

Pedido do André (18/11/2026): previsão das próximas alterações do cadastro de produto; se somarem pouco, completar com o
almoxarifado. **Primeira estimativa na régua nova** da skill `estimativa-de-tarefas` (passo 3, 18/11/2026): tempo informado =
execução prevista na régua do `horas.js`, **sem** a parte fixa de análise + teste (a regra anterior estava errada: a semana de
08-14/11 somou 91h45 estimadas para 29 h medidas).

Régua conferida em 18/11/2026 com `node .claude/skills/relatorio-semanal/scripts/horas.js --semana 2026-11-10 --grupos
"E211=Etapa 211;E212=Etapa 212;E214=Etapa 214;E216=Etapa 216;E230=Etapa 230;E233=Etapa 233;E236=Etapa 236;E237=Etapa 237"`:
E211 1,8 h · E212 0,9 h · E214 1,8 h · E216 0,6 h (cadastro no Compras, ~1h a 1h30) · E230 0,9 h · E233 0,7 h · E236 0,8 h · E237
1,1 h (fatias do almoxarifado, ~45 min a 1h; motor/trava/estorno 1h15 a 1h30).

Partes: **Cadastro de material 1h15 · Almoxarifado 23h15 · Dependem de resposta 4h30 = 29h.**

## Tabela

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Medido no código (18/11) | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Explicação do CA; Nº/Validade do CA só para tipo EPI | 1h15 | cadastro no Compras (E216 0,6 h; a lista de tipos hoje traz só nomes — falta trazer `is_epi`) | 1h15 | Etapa 238 (`2026-11-18-compras-etapa238-ca-so-para-epi.md`) | `MaterialAlmoxarifadoForm.js:925-934` (`ca_numero`, `ca_validade`); `useCategoriasMaterial(rotas.api.tiposMaterial)` `:127` devolve só nomes; `tipos_material_almoxarifado.is_epi` (`schema.js:592`). Caminho: legenda + campos só com tipo EPI; valor gravado continua (campo escondido, não apagado) | 0,7 h (horas.js 18/11, grupo CA) | 45 min | `2827bf94`, `44a3d6ae`, `5f206303` |
| 2 | Devolução Quarentena/Sucata de peça com série grava o lote | 1h15 | motor (E233/E234 0,7 h + Fase 0 por sonda) | 1h15 | resto da D (233) 3 — plano 236 "Próxima tarefa detalhada" | `returnService.js:326-375` (ENTRADA_DEVOLUCAO, BLOQUEIO, SUCATA sem `lotePelasSeries`); `returnService.js:162` (série nesses destinos é limitação declarada) — a sonda da Fase 0 decide se há buraco; sem buraco, fecha com o teste | — | — | — |
| 3 | Retalho de peça com série: baixa do original grava o lote | 1h15 | motor | 1h15 | idem | `scrapService.js:342` (SAIDA do original), `:362` | — | — | — |
| 4 | Devolução ao fornecedor (NC) de peça com série grava o lote | 1h15 | motor | 1h15 | idem | `nonConformityService.js:1664` (DEVOLUCAO_FORNECEDOR, `lote_id` da inspeção quando há); `:1060` é DESBLOQUEIO (não é saída) | — | — | — |
| 5 | Saída com lote valida a prateleira do lote, não a padrão (C543 no motor) | 1h30 | motor, toda saída sem origem | 1h30 | C543 + D (236) 1; o aviso da Etapa 237 (B1542) muda junto | `stockService.js:1565` `validarLocalizacaoParaMovimento(resolveLocalizacaoSaida(...))`; `claimSaldoDoLote` baixa onde o lote está | 0,9 h (horas.js 18/11, grupo C543) | 1h | `e21132d1`, `9e33f948`, `d9171d1d` |
| 6 | Escolher a origem na devolução ao cliente | 1h | fatia de tela (E236 0,8 h) | 1h | D (236) 1, B1541 | `MateriaisClienteAlmoxarifado.js` (janela); a rota já aceita `localizacao_origem_id` pelo motor (só preferida: a Etapa 240 a fez estrita) | 0,6 h (horas.js 18/11, grupo Origem devolucao cliente) | 45 min | `81c9ed15`, `077ca21f`, `fb01d574`, `db9096cb` |
| 7 | Seletor de lote mostra reservado e livre | 1h | fatia de tela + leitura | 1h | C542 | `lotService.listarLotesDoMaterial:593` (`saldo` = físico do lote); seletores da devolução ao cliente e de Movimentações | — | — | — |
| 8 | Aviso de material de cliente reservado para OS | 45 min | fatia de tela (E237 1,1 h com fixture; esta sem campo novo de servidor se a posição já trouxer a reserva) | 45 min | C541 | molde do aviso `#dev-loc-bloqueada` da Etapa 237 | — | — | — |
| 9 | Frase do lote das séries só quando o lote tem a peça | 45 min | fatia de tela | 45 min | C539, B1531 | frase de Movimentações lê só a série; o servidor deriva o lote só quando a linha cobre (`stockService.js:1379`) | — | — | — |
| 10 | Lista de séries da saída avulsa recarrega após recusa | 45 min | fatia de tela | 45 min | C538 (molde: entrega, C537) | Movimentações → Saída/Perda | — | — | — |
| 11 | Reserva da liberação repartida por nota | 1h15 | motor/estorno | 1h15 | C524, B1467 | liberação de lote (Etapa 220) + conta do estorno da nota | — | — | — |
| 12 | Estorno da nota sob a trava (C525 + C534) | 1h30 | trava/estorno | 1h30 | C525, C534, B1506 | a conta do estorno que solta reservas roda fora de `naTravaDoMaterial` | — | — | — |
| 13 | Busca de entrega na tela Devoluções | 1h15 | tela + servidor (o C477 dizia ~1h30 na régua antiga) | 1h15 | C477, B1367 | `returnService.js:486-495` (páginas de 30, cursor `antes_de`) | — | — | — |
| 14 | Bloquear material indicando o lote | 1h30 | motor (BLOQUEIO com lote; regra "o lote tem livre para bloquear") | 1h30 | C500, B1419 | `extended.js:1302` (`/materiais/:id/bloquear`); Etapa 209 já grava lote no BLOQUEIO da devolução | — | — | — |
| 15 | Mensagem própria na liberação pela NC | 30 min | frase | 30 min | C501 | `nonConformityService.js` `executarLiberacao` `:1036` | — | — | — |
| 16 | Entrega diz quantas peças do lote estão bloqueadas | 45 min | fatia de tela | 45 min | C514, B1440 | janela de entrega (Etapa 218 já mostra quanto pode sair do lote) | — | — | — |
| 17 | Sugestão da fila lê a conta do lote preso | 45 min | fatia (o C517 diz "pequeno") | 45 min | C517 | dica "pegar em XB-01, lote L1" da Fila | — | — | — |
| 18 | Ajuste com lote limita a baixa ao saldo do lote | 1h15 | motor (o C475 dizia ~1h30 na régua antiga) | 1h15 | C475, B1357 | ramo de Ajuste do `registrarMovimentacao`; só pela movimentação nova (integração) | — | — | — |
| 19 | Frase própria para o excesso de dois itens na mesma prateleira | 30 min | frase | 30 min | C497, B1415 | recusa de saldo da entrega (Etapa 208) | — | — | — |
| 20 | Teto dividido entre itens que disputam o mesmo lote | 1h | fatia de tela (molde: separação, Etapa 127) | 1h | C489, B1395 | detalhe e Fila | — | — | — |
| 21 | Entregável do detalhe sem a parte de lote impedido/peça presa (C491 + C518) | 1h15 | fatia de tela + leitura | 1h15 | C491, C518 | teto da B1395 soma a parte guardada sem olhar o lote | — | — | — |
| 22 | Endereço na troca para o automático | 45 min | fatia | 45 min | C495 | bloco Substituições do detalhe | — | — | — |
| 23 | Série respeita a peça separada do irmão (material sem lote) | 1h30 | motor; **medido só pela descrição** ("conserto não medido") — reestimar na Fase 0.5 se a sonda mostrar mais | 1h30 | C493, B1404 | teste `[RN-207.02 c]` reproduz | — | — | — |
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
