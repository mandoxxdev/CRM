# Etapa 253 — a busca de entrega na tela Devoluções (C477) e o Ajuste com lote que não deixa o lote negativo (C475)

> Itens 13 e 18 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`; 13: 1h15,
> 18: 1h15). Ponto de partida: a "Próxima tarefa detalhada" do plano da 252. **Estimativa não revisada:** a sonda reproduziu os dois no
> tamanho descrito (abaixo); o estorno do item 18 entra no mesmo tempo (é a mesma conta).
> **Fatia visível:** o campo **Buscar entrega** na janela *Nova devolução*. O item 18 não tem fatia visível natural — a tela
> **Movimentações** não mostra lote no Ajuste; só a integração alcança (registrado na D (253)).

## Fase 0 — medido (código + execução, 20/11)

Sonda executada (`createTestApp`, rotas reais; script fora de `tests/api`, apagado depois):

- **C475 (item 18).** (1) LB 5 + 3 sem lote (físico 8), `POST /movimentacoes/v2` AJUSTE 1 com `lote_id` LB → **201**, físico 1, linhas
  **LB −2** e sem lote 3. **Reproduzido.** (2) **Variante nova:** LB 5 no endereço A, 3 sem lote; AJUSTE 4 com LB → 201, físico 4, linhas
  (A, LB) **5**, (sem endereço, LB) **−4**: o total do lote está certo (1), mas A diz 5 e a linha sem endereço do lote fica negativa. (3)
  **Estorno:** LB 5 + 3; AJUSTE 6 com LB (LB 3); Entrada 10 sem lote; estorno do AJUSTE → 200, físico **8**, LB **−5**, sem lote 13. (O
  físico voltar a 8 apagando a Entrada é a regra de sempre do estorno do Ajuste — *"o estorno devolve o saldo ao de antes"*, manual 6.10;
  não muda.) (4) AJUSTE 10 com LB (para cima) → LB 7: certo.
  Onde: `registrarMovimentacaoSemTrava`, ramo AJUSTE sem localização → `syncSaldoLocalizacaoPadrao(db, m, loteIdFinal, { drenar: true })`
  grava na linha (padrão, lote) o resíduo `total − todas as outras linhas`; o `drenar` só existe para `!loteId`. No estorno,
  `cancelarMovimentacao` ramo AJUSTE sem localização: `SET quantidade_atual = saldo_anterior` + `syncSaldoLocalizacaoPadrao(lote)`.
  Quem alcança: só a v2 (a v1 não repassa lote no AJUSTE — B1357; o inventário não manda lote). O teste
  `movimentacaoV1Lote.api.test.js` *"[C475, documenta]"* afirmava o defeito e muda junto.
- **C477 (item 13).** `GET /devolucoes/saidas-elegiveis?material_id=M&busca=REQ` ignora o `busca` (a resposta é a página de sempre). A base
  local tem um material com 33 entregas (duas páginas). **Reproduzido** (ausência do filtro; teste vermelho abaixo).

## Regras de negócio

**Item 13 (C477) — busca de entrega:**

- **RN-253.01** `busca` ausente, vazia ou só espaços → resposta igual à de hoje, byte a byte.
- **RN-253.02** `busca` com cara de data — `DD/MM/AAAA` ou `AAAA-MM-DD` — → só as entregas daquele **dia no fuso do negócio**
  (`DATE(created_at, diaLocal.modificadorDoFuso())`, a régua dos relatórios). Data impossível (31/02/2026) → 400
  `Data inválida na busca: 31/02/2026 — use DD/MM/AAAA`.
- **RN-253.03** Outro texto → a entrega cujo **número da requisição contém** o texto (sem diferenciar maiúsculas; `%` e `_` literais) **ou**
  cuja OS é o número digitado, como a tela a mostra (*"OS 12"* ou *"12"* → `os_id = 12`).
- **RN-253.04** Mesma ordem, mesma página de 30, mesmo cursor `antes_de` — aplicados **dentro** do filtro (a página seguinte da busca traz as
  30 anteriores que casam). Recusas do cursor iguais.
- **RN-253.05** `busca` com mais de 60 caracteres (aparada) → 400 `Busca muito longa — use até 60 caracteres`. Ordem das recusas: material
  inexistente → busca (tamanho, data) → cursor.
- **RN-253.05 b (Fase 2, achado 8)** `busca` repetida na query chega como texto "a,b" (como o `antes_de`; não é recusada). A busca "12"
  acha também a entrega da OS 12 que tem requisição — por isso o rótulo passa a mostrar a OS junto da requisição (`REQ-x · OS 12`).
- **RN-253.06** Tela (janela *Nova devolução*): campo **Buscar entrega** (*"Requisição, OS ou data (DD/MM/AAAA)"*), botão **Buscar** (e Enter no
  campo — sem enviar a devolução), **Limpar** quando há busca aplicada. Buscar: recarrega a lista com a busca e **limpa a entrega escolhida e
  as séries**. *"Carregar entregas mais antigas"* continua dentro da busca. Busca sem resultado: *"Nenhuma entrega deste material para
  ⟨texto⟩."* Trocar de material limpa a busca. Recusa do servidor → toast com a mensagem, lista intacta.

**Item 18 (C475) — Ajuste com lote:**

- **RN-253.10** AJUSTE (ou AJUSTE_INVENTARIO) **sem localização** citando o lote L, em material que **não** permite saldo negativo: o lote
  depois = novo total − **fora do lote** (a soma das linhas de saldo que não são de L). Se ficaria negativo → 400 **antes de qualquer efeito**
  (depois da guarda de retenção de sempre):
  `Ajuste para ⟨X⟩ ⟨un⟩ indicando o lote ⟨L⟩ deixaria o lote com saldo negativo (⟨X − fora⟩ ⟨un⟩): fora do lote ⟨L⟩ há ⟨fora⟩ ⟨un⟩. Para
  baixar só este lote, o novo total tem de ser de no mínimo ⟨fora⟩ ⟨un⟩; para baixar mais, faça o ajuste sem indicar o lote.`
  Cenário C475: *"Ajuste para 1 UN indicando o lote LB deixaria o lote com saldo negativo (-2 UN): fora do lote LB há 3 UN. …"*.
- **RN-253.11** Cabe no lote, mas a linha do lote no endereço padrão (ou sem endereço) ficaria negativa porque o lote está noutro endereço:
  a baixa **tira das linhas positivas do lote** nos outros endereços (maior primeiro, depois a mais antiga) — o mesmo `drenar` que o ajuste
  sem lote já faz com as linhas sem lote (Etapa 51). Cenário (2): (A, LB) 1, (sem endereço, LB) 0. Vale também em material que permite
  negativo (a linha do lote só fica negativa no que sobrar depois de drenar todas).
- **RN-253.10 b (Fase 2, achado 1)** O lote também não desce abaixo do que está **preso** nele: a caixa viva de todas as requisições no
  lote (com ou sem reserva, `guardadoNoLoteDeOutras`), em inspeção, bloqueado no lote, reprovado e em terceiros — as parcelas cruas da
  régua do **Bloquear indicando o lote** (Etapa 249). O piso só vale quando o ajuste **desce** o lote. Literal com piso:
  `Ajuste para ⟨X⟩ ⟨un⟩ indicando o lote ⟨L⟩ deixaria o lote com ⟨depois⟩ ⟨un⟩, abaixo do que está preso nele (⟨parcelas⟩; mínimo do lote:
  ⟨piso⟩ ⟨un⟩): fora do lote ⟨L⟩ há ⟨fora⟩ ⟨un⟩. Para baixar só este lote, o novo total tem de ser de no mínimo ⟨fora + piso⟩ ⟨un⟩; para
  baixar mais, faça o ajuste sem indicar o lote.` Números pelo `Q.qtd`, comparação com a folga (Fase 2, achado 4). Ordem: a recusa das
  séries (material com série) e a guarda de retenção do material vêm antes (achado 5). AJUSTE_INVENTARIO só alcança pelo serviço (a v2 o
  recusa e a conferência não manda lote — achado 7).
- **RN-253.12** Material que permite saldo negativo (o dele ou o global): sem a recusa do RN-253.10 (como hoje).
- **RN-253.13** Ajuste sem lote, ajuste com localização, ajuste para cima que não deixa o lote negativo: como hoje, byte a byte.
- **RN-253.14** Estorno do AJUSTE sem localização com lote, material que não permite negativo: o lote depois = saldo anterior do ajuste −
  fora do lote **agora**. Se ficaria negativo → 400 antes de qualquer efeito (o claim volta):
  `Não é possível estornar: o estorno volta o total para ⟨saldo anterior⟩ ⟨un⟩, mas fora do lote ⟨L⟩ já há ⟨fora⟩ ⟨un⟩ — o lote ⟨L⟩
  ficaria com saldo negativo (⟨projeção⟩ ⟨un⟩). Faça um novo ajuste em vez de estornar.`
  Cenário (3): *"… volta o total para 8 UN, mas fora do lote LB já há 13 UN — o lote LB ficaria com saldo negativo (-5 UN). …"*. Com o
  piso do RN-253.10 b (quando desce), a mesma forma (`… ficaria com ⟨d⟩ ⟨un⟩, abaixo do que está preso nele (…)`). O estorno que cabe põe o
  resíduo na linha do lote e, **com lote, drena** as linhas do lote nos outros endereços (Fase 2, achado 2: sem isso, ajuste para cima +
  transferência do lote + estorno deixava a linha padrão do lote em −2); as drenadas vão para o desfazer. **Declarado (achado 3):** o estorno
  de um ajuste que drenou devolve o lote ao total certo, mas **na linha padrão**, não no endereço drenado (A 1, padrão 4) — o mesmo do
  drenar sem lote da Etapa 51; gravar o drenado por movimento é escopo maior (D (253)).

## Contratos

- `GET /api/almoxarifado/devolucoes/saidas-elegiveis?material_id=&antes_de=&busca=` — `busca` opcional (aditivo, RN-253.01 a .05). Resposta:
  o mesmo array, os mesmos campos. Recusas novas (400, `{ error }`): `Busca muito longa — use até 60 caracteres`; `Data inválida na busca:
  ⟨texto⟩ — use DD/MM/AAAA`.
- `returnService.listarSaidasElegiveis(db, materialId, { limite, antesDeId, busca })` — `busca` novo.
- `POST /api/almoxarifado/movimentacoes/v2` (e qualquer chamador de `registrarMovimentacao`) — AJUSTE sem localização com lote: recusa nova
  do RN-253.10; o drenar do RN-253.11. Nada mais muda.
- `POST /api/almoxarifado/movimentacoes/:id/cancelar` — recusa nova do RN-253.14.

## Desenho

- **13:** `returnService` — `normalizarBusca(busca)` (aparar, tamanho, data → `{ data }` / texto → `{ texto, os }`), filtro no `WHERE` antes
  do cursor. Rota: repassa `req.query.busca`. Tela: estado `busca` (digitado) e `buscaAplicada`; o `useEffect` da lista passa a depender de
  `[form.material_id, buscaAplicada]`; `carregarMaisAntigas` manda a busca aplicada; a geração da lista sobe em cada aplicação (molde da 204).
- **18:** `stockService` — função nova `projecaoDoLoteNoAjuste(db, materialId, loteId, novoTotal)` → `{ fora, depois }` (uma leitura);
  recusa no ramo de validação `tiposAjuste && !localizacao_destino_id` (depois da guarda de retenção) e no estorno (ramo AJUSTE sem
  localização, depois da `guardaEstornoAjuste`, antes do `SET`). `syncSaldoLocalizacaoPadrao`: o `drenar` passa a valer com lote
  (`lote_id IS ?` = o lote; sem lote fica `IS NULL`, como hoje). **Travas:** nada novo — o ajuste roda sob `naTravaDoMaterial`
  (`registrarMovimentacao`, Etapa 97) e o estorno inteiro na seção do material (Etapa 118); a leitura da projeção e a escrita ficam na mesma
  seção.

## Fase 2 — revisão do plano (item 18 mexe no motor)

Um agente fresco, sondas executadas (scratchpad, o drenar simulado por SQL). **Nenhuma trava; 3 importantes e 5 menores, todos aceitos**:

1. **[importante] A caixa separada do lote:** requisição separada 4 de (A, LB); AJUSTE 4 com LB passava pela guarda do material e pelo
   RN-253.10 (4 − 3 = 1) e a entrega ficava presa (*"a origem da separação (A) não serve mais"*). → **RN-253.10 b** (o piso do preso no lote,
   com o retido do lote pela régua da 249). Testes *[Fase 2 achado 1]* e *[o bloqueado NO lote]*.
2. **[importante] O estorno sem drenar:** AJUSTE 10 com LB, transferência de 2 do LB de P para A, estorno → padrão/LB −2 (medido). → o
   estorno com lote drena, com as drenadas em `compensarLinhasClaim` (o desfazer as devolve antes do total e do sync). Testes *[achado 2]* e
   *[o livro do estorno falha depois do drenar]*.
3. **[importante] O estorno de um ajuste que drenou não devolve o endereço** (A 1, padrão 4; uma transferência de 5 do LB a partir de A dá
   400). → declarado no RN-253.14 e na D (253); teste *[estorno que cabe depois do drenar]* afirma o estado.
4. **[menor]** `Q.qtd` e folga na literal (0,3 − 0,1). → teste de casas decimais.
5. **[menor]** A ordem das recusas (séries e retenção antes). → escrita no RN.
6. **[menor]** O drenar tirava do endereço bloqueado primeiro. → bloqueadas por último (a ordem da saída do lote). Teste.
7. **[menor]** AJUSTE_INVENTARIO com lote só pelo serviço. → teste pelo serviço; o inventário sem lote com o lote noutro endereço
   continua podendo deixar o "sem lote" negativo (anterior, D (253)).
8. **[menor, item 13]** "12" acha a OS 12 com requisição e o rótulo não mostrava a OS; `busca` repetida. → o rótulo mostra as duas
   (`289cea8c`); a repetida declarada (RN-253.05 b).

Pergunta 3: T1 e T2 em arquivos separados — independentes (o T2 já estava pronto quando a revisão chegou). Verificado e certo pela revisão:
a projeção bate com o resíduo do sync (inclusive sem linhas e com linhas que não batem com o físico); lote de outro material/inexistente
já recusados antes; o ajuste sem lote byte a byte; as travas (nada novo); a compensação (`compensacao: true`) não alcança o AJUSTE.

## Tasks

Executadas: T2 primeiro (enquanto a Fase 2 revisava o plano do motor), depois T1 com os achados da Fase 2 já no desenho.

- [x] **T2** 13 (C477) — `f393437b`: `normalizarBusca` + o filtro no `WHERE` (antes do cursor) + a rota repassa `busca`; tela com o campo, o
  Buscar/Enter/Limpar, a frase de vazio e a busca seguindo no "Carregar entregas mais antigas". Testes `devolucaoBuscaEntrega.api.test.js` (9;
  8 vermelhos antes — o `[RN-253.01]` passa antes por definição) e 6 novos no `DevolucoesAlmoxarifado.test.js`. Sabotagens: 7 no servidor e
  7 na tela, cada uma derruba o seu cenário. A C1 (buscar não limpa a escolha) **não derrubava nada** na 1ª versão: o select com valor fora das
  opções mostra "" — o teste passou a devolver a mesma entrega no resultado, e aí cai. Limite: o Enter sem o `preventDefault` não é
  sabotável no jsdom (não há envio implícito do formulário) — o teste prova que o Enter busca e que nada é enviado.
  Fase 2 (achado 8) — `289cea8c`: o rótulo com a OS também quando há requisição (+1 teste; a sabotagem do `else` derruba).
- [x] **T1** 18 (C475) — `521f6651`: `projecaoDoLoteNoAjuste` + `recusaDoLoteNoAjuste` (ida e estorno), o drenar com lote e o rastreador
  `drenadas` (desfazer do estorno). `ajusteComLoteNaoNegativa.api.test.js` (14; 11 vermelhos no código de antes, rodado com o
  `stockService` de HEAD no lugar); o *"[C475, documenta]"* da 202 passou a afirmar a recusa. Sabotagens: 11, cada uma derruba o seu.
- [x] **T3** Fase 5 — `bffd526a`: um revisor fresco, sondas executadas. **1 regressão da etapa** (o drenar com lote tirava da prateleira da
  caixa separada: LB 4 em A separados e 3 em B, ajuste para 4 → A 1, entrega recusada *"não serve mais"*; o mesmo no estorno) → duas
  passadas (primeiro a parte não guardada, `parteGuardadaDeOutrasPorPar`); **3 buracos de teste** (inspeção/reprovado/terceiros no piso; o
  piso no texto do estorno; o drenar contra a caixa) → 4 testes novos (18 no total), 7 sabotagens, cada uma derruba o seu; **2 anteriores**
  (o mesmo drenar sem lote — **C548**; o livro falhando no AJUSTE de ida não desfaz nada — D (253)); **1 ruído** (séries × prateleira no
  drenar, já desalinhava antes). Uma rodada de correção; sem segunda revisão (a correção só reordena o que o drenar tira).
- [x] **T4** fechamento (fechar-etapa sem 7½ e 8).

## Divergências do plano

- O plano dizia que a recusa olharia só o "não negativo" — a Fase 2 mostrou que isso deixava a caixa separada presa (achado 1): entrou o
  **piso** (RN-253.10 b). E o estorno não drenaria — entrou o drenar no estorno com o desfazer (achado 2).
- O drenar copiado da Etapa 51 tirava da prateleira da caixa (Fase 5): a Fase 2 olhou a caixa como piso do **total do lote**, não **onde**
  a baixa sai. Achado de plano: um piso por lote não protege a prateleira; a régua certa é por par (endereço, lote).
- **CLAUDE.md:** nenhuma linha ficou desatualizada — o ajuste e o estorno já rodavam sob a trava do material (Etapas 97 e 118); o drenar e a
  leitura da caixa ficam dentro da mesma seção, sem trava nova. A leitura de `parteGuardadaDeOutrasPorPar` (requisitionService) é um
  `require` preguiçoso, só leitura.

## Verificação (medida, sobre o código final `8c495ce0`)

- **`npm run test:api` (a suíte inteira) NÃO foi medido.** Rodado sozinho, foi interrompido pelo sistema por falta de memória da máquina,
  perto do fim; o log ficou incompleto (os cabeçalhos dos 649 arquivos, mas sem o placar de vários) e **não serve de número**. No lugar dele:
  os **57 arquivos** que fazem AJUSTE ou leem as entregas devolvíveis, um por um — **56 verdes e 1 vermelho**: o `(20)` de
  `saidaPorLocalizacao.api.test.js` (Etapa 51) afirmava o ajuste de lote que deixa o lote negativo; passou a afirmar a recusa e a regra dele
  com um ajuste que cabe (`8c495ce0`) → 24/24. O único ✗ que o log parcial mostrou (`lembretesEValidadeDasPropostasNoDiaLocal`, R17, das
  propostas — a rodada cruzou a meia-noite de Brasília) passou sozinho, 25/25. **A rodar antes do deploy:** a suíte inteira (letra F (253)).
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **239 suítes, 3224 testes**, verdes; `CI=true react-scripts build`: *Compiled successfully*.
- Nenhum clique no navegador (F (253)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2: 4 mudanças de desenho antes do código do motor; Fase 5: 1).
- Achados: Fase 2 — 8 reais (3 importantes, 5 menores), 0 ruído; Fase 5 — 1 regressão da etapa + 3 buracos de teste + 2 anteriores, 1 ruído.
- Paralelismo: T2 (busca) executada enquanto a Fase 2 revisava o T1 (motor) — arquivos e regras separados, sem retrabalho.
- Defeito que escapou: (preencher na etapa seguinte). Da 252: nenhum conhecido.

## Próxima tarefa detalhada

A fila da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`) acabou, fora os itens
**24 a 27, que esperam resposta**. Cada um tem o caminho reversível decidido (seção "Os que dependem de resposta" do `.md` da estimativa):
**começar pelo caminho reversível se a resposta não vier**, registrando a decisão na letra B e o "depende de resposta" no `.txt` do
fechamento. Todos são **cadastro** — pela regra "cadastro é do Compras", o lugar é o **Compras → Materiais** (o formulário
`MaterialAlmoxarifadoForm.js` é o mesmo nas duas telas; no Almoxarifado ele é só consulta). Nenhum mexe no motor nem nas travas.

- **Item 24 — tirar o campo Aplicação (30 min; espera o Matheus).** Caminho reversível: esconder o campo do formulário
  (`MaterialAlmoxarifadoForm.js` ~958, o `<textarea>` de `form.aplicacao`), **sem** apagar a coluna `aplicacao` nem o valor; a lista de campos
  lidos (~55, `'aplicacao'`) fica — o servidor continua aceitando e devolvendo. Material que já tem texto: mostrar o campo só para ele (como o
  26), para nada sumir. Teste da tela: o campo some no cadastro novo; aparece, com o texto, no material que tem. **Descartado:** apagar a
  coluna (não volta).
- **Item 25 — nº de série e nº de controle (etiqueta) obrigatórios (1h30; a imagem do pedido não foi salva).** Caminho reversível: na tela
  **Ferramentas** (`FerramentasAlmoxarifado.js`: o `codigo_patrimonio` já é obrigatório em ~296 e ~345; o `numero_serie` é opcional em ~306), o
  rótulo do código de patrimônio passa a *"Nº de controle (etiqueta)"* e o número de série fica obrigatório no cadastro novo e na edição que
  mexe nele; as ferramentas antigas sem série continuam editáveis (o servidor só exige quando o campo vem). Contrato: `POST/PUT
  /api/almoxarifado/ferramentas` com recusa nova *"Informe o número de série"* — medir antes se a rota já valida algo
  (`routes/almoxarifado/*`, `grep numero_serie`). **Descartado:** etiqueta por peça no controle por série do material (coluna nova em
  `series_almoxarifado`, 3 h ou mais).
- **Item 26 — Especificações Técnicas e Observações Gerais (1h; "manter só no campo Identificação", ambíguo).** Caminho reversível: tirar os
  dois `<textarea>` do formulário (~963 e ~967), deixar a Identificação com Descrição e Descrição Técnica; material com texto antigo nesses
  campos os mostra (só os que têm texto). As colunas `especificacoes` e `observacoes` ficam. **Descartado:** copiar o texto para a Descrição
  Técnica sozinho (muda dado sem pedir).
- **Item 27 — material criado pela sobra e pela remessa (1h30; contraria a regra "cadastro é do Compras").** Caminho reversível: manter a
  criação restrita da Etapa 193 (`SobrasAlmoxarifado.js` ~324 e `RemessasTerceirosAlmoxarifado.js` ~314, `POST /almoxarifado/materiais` no
  formato restrito) e **marcar** o material criado por esses fluxos como *cadastro a completar* (coluna nova, default 0; migration no padrão
  "ALTER no callback do CREATE"), com o aviso e um filtro no **Compras → Materiais**; salvar pelo Compras tira a marca. **Descartado:** tirar
  a criação desses fluxos (o almoxarife não registraria o retalho — a B74 do Compras já descartou).
- **Pontos de atenção:** a frente é de cadastro (Compras) — os testes do Compras moram em `tests/api/compras*.api.test.js` e a tela em
  `client/src/components/compras/`; documento de novidades é o `docs/compras-novidades-por-etapa.md` (letra B de lá). Se nenhuma resposta
  vier e o André preferir não mexer no cadastro sem ela, o próximo do almoxarifado é o **C548** (o mesmo "poupa a caixa" no Ajuste sem lote,
  ~45 min, motor — Fase 2 e Fase 5) e, depois, o mapa `specs/modulo-almoxarifado/README.md`.
- **O que já está pronto e não reabre:** a busca da entrega e o Ajuste com lote (esta etapa).
