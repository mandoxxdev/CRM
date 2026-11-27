# Etapa 266 — A entrega confere o lote das séries antes de começar (C486) e a dica da Fila não manda duas requisições à mesma prateleira (B1255)

> Itens **12** e **13** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h15 + 1h15; não
> refeita: a Fase 0 **diminuiu** o item 12 — ver abaixo — e o 13 ficou do tamanho estimado). A "próxima tarefa detalhada" do plano da 265.
> **Fatia visível:** na **Fila de separação**, duas requisições do mesmo material passam a receber prateleiras diferentes no *"Pegar em"*;
> quando o saldo das prateleiras já foi todo indicado às requisições à frente, a linha diz isso em vez de mandar à mesma prateleira.

## Fase 0 — medido (sondas `server/tests/api/zzsonda266*.api.test.js`, apagadas antes do commit, sobre `4d8b9d00`)

### Item 12 (C486) — **a pendência estava errada: a entrega já confere o lote das séries antes da 1ª baixa**

Sonda: requisição com 2 itens — item 1 de material comum (2 un., saldo 5), item 2 de material com série (S3, do lote *L2*); *L2* bloqueado
(ou vencido ontem); material com e sem controle de lote; série escolhida no automático (`origem_automatica`), no um clique (origem planejada da
separação) e com a prateleira escolhida. **12 de 12 combinações: 400 antes de qualquer baixa** (item 1 entregue 0, item 2 entregue 0) com a
literal do motor — *"Mat X: Lote L2 esta bloqueado e nao pode ser utilizado"* / *"Mat X: Lote L2 vencido em AAAA-MM-DD nao pode sair para
consumo. Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou
corrija por AJUSTE."*

- **Por quê:** o lote das séries vira o lote do item (`if (loteSeries) loteId = loteSeries`, Etapa 61/63) e o item vai para a conferência
  por item antes da 1ª baixa — com prateleira, `validarOrigemDaEntrega`; sem prateleira, o "só lote" (`soLotePendentes`, Etapa 136) —, que
  chama `checarOrigemItem`, e ela recusa lote não ATIVO e vencido sem liberação com as literais do motor (Etapa 58). As duas linhas
  existiam no código do plano da 206 (`7f210f62`: `:2125`, `:2153`, `:1348`).
- **A C486 (Etapa 206) dizia** *"a validação das séries não olha o lote; o motor recusa na baixa da passada 2 — com vários itens, depois de
  outros saírem"*. **Estava errada desde que foi escrita:** foi deduzida da leitura da validação das séries (`:2018-2047` da época) sem sonda;
  a conferência do lote acontece logo depois, na passada por item. O item 12 da estimativa repetiu a afirmação.
- **O que a etapa faz no item 12 (B1627):** prova por cenário (que hoje não existe — o teste da 232 tem um item só) e corrige os documentos
  dizendo que estavam errados. Nenhuma linha de código.

### Item 13 (B1255, D (250) 4) — confirmado

Sonda: material sem lote, *SA-01* 3 e *SB-01* 3; R1 (NORMAL) e R2 (URGENTE), 3 cada, APROVADO. Fila: **as duas** com *"Pegar em SA-01 · 3"*;
a janela (`GET /requisicoes/:id/sugestao-coleta`) idem. Separar R2 pela dica → 200; separar R1 pela dica → **400** *"M266: em SA-01 há 3
para esta separação, mas 3 já está separado dali para outra requisição (R266-2); sobra 0, que não cobre a quantidade (3). Escolha outro
endereço ou reabra a janela para ver a sugestão atual"* — e *SB-01* tinha os 3.

- **Causa:** `sugestaoDeColeta.sugerirColeta` desconta o sugerido só entre os irmãos da **mesma** requisição (RN-188.03); o
  `listarFilaSeparacao` chama uma vez por requisição, na ordem do banco, com o consumo zerado. A janela lê a fila **filtrada** pela requisição
  (RN-189.01) — mesmo que a fila dividisse, a janela não veria as da frente.

## Decisões

- **B1627 (item 12, C486)** — a C486 estava errada (acima). **Escolhido:** cenário de regressão por rota com vários itens + correção dos
  documentos. **Descartado:** uma conferência nova "das séries" antes da 1ª baixa — repetiria a que já existe, com a mesma frase.
- **B1628 (item 13)** — a dica divide o livre de cada prateleira (e o teto do lote: séries, lote com peça presa) entre as requisições **na
  ordem em que a Fila as mostra** (a que pode ser feita agora primeiro, depois urgência, data de necessidade, criação, número interno —
  `compararPrioridade`). O que foi indicado às requisições da frente desconta como o dos irmãos. **Descartado:** (a) só entre requisições do
  mesmo setor/projeto — a prateleira é uma só; (b) contar a requisição que está na alçada de valor ou sem separável — ela não recebe dica e
  não separa agora; (c) respeitar o filtro da tela (setor/projeto/localização) — o filtro é da tela, a prateleira continua disputada pelas
  escondidas. **Reversível** (é a ordem de uma leitura; nada é gravado).
- **B1629 (item 13)** — quando o item **teria** prateleira sem as da frente e não tem com elas, a dica não aponta prateleira e diz o porquê
  (aviso novo `SALDO_INDICADO_A_OUTRAS`). **Descartado:** (a) voltar à dica de hoje (a mesma prateleira) — é a que leva à recusa; (b)
  `SEM_ENDERECO_SUGERIVEL` — a frase dele ("sem endereço, bloqueado, área especial…") seria falsa. A planejada (RN-188.01a) continua com
  `PLANEJADA_NAO_COBRE`. **Reversível.**
- **B1630 (item 13)** — a janela de separação (`GET /requisicoes/:id/sugestao-coleta`) passa a ler a fila **inteira** e devolver o recorte
  da requisição — o mesmo *"Pegar em"* da Fila. A RN-189.01 dizia "por requisição, o resultado só depende das linhas dela e dos dados
  globais" — deixa de valer (a dica depende das requisições da frente). **Descartado:** manter o filtro (a janela pré-selecionaria a
  prateleira que a Fila já mandou a outra). O custo é ler a fila inteira ao abrir a janela (as mesmas consultas da tela da Fila).

## Regras de negócio

- **RN-266.01 (C486, prova)** Entrega pela rota (`PUT /requisicoes/:id/entregar`) com vários itens, um deles de material com série cuja
  série escolhida está em lote bloqueado, reprovado ou vencido sem liberação — automático, um clique ou prateleira escolhida; material com e
  sem controle de lote; o item da série antes ou depois dos outros → 400 com a literal do motor prefixada pelo nome do material (*"⟨material⟩:
  Lote L2 esta bloqueado e nao pode ser utilizado"*, *"… esta reprovado …"*, *"⟨material⟩: Lote L2 vencido em ⟨AAAA-MM-DD⟩ nao pode sair
  para consumo. …"*); com a origem planejada da separação **no** lote que ficou impedido, o um clique leva o envelope da planejada com a
  frase do motor dentro (*"⟨material⟩: a origem da separação (P266) não serve mais (Lote L2 esta bloqueado e nao pode ser utilizado) —
  entregue escolhendo de onde sai"*, Fase 2) — e **nada sai**: nenhum item entregue, nenhuma movimentação nova, saldos e séries como antes. Vencimento liberado → 200.
- **RN-266.10 (B1628)** Na Fila (`GET /fila-separacao`), o *"Pegar em"* de cada item desconta do livre de cada par (prateleira, lote) — e do
  teto das séries e do lote com peça presa — o que foi sugerido aos itens das requisições **anteriores na ordem da Fila** e aos irmãos
  anteriores da mesma requisição. Cenário: *SA-01* 3, *SB-01* 3, R2 URGENTE 3 e R1 NORMAL 3 → R2 *"Pegar em SA-01 · 3"*, R1 *"Pegar em SB-01 ·
  3"*; separar as duas pela dica → 200 e 200.
- **RN-266.11** A ordem é a da Fila: R1 e R2 com a mesma urgência → a de data de necessidade mais cedo primeiro (depois criação, número
  interno). Requisição sem dica (alçada de valor; sem separável) não desconta nada.
- **RN-266.12 (B1629)** Item sem planejada, com pelo menos um par sugerível de livre > 0 **sem** o desconto das requisições anteriores
  (mantido o desconto dos irmãos da mesma requisição — Fase 2), e
  nenhum **com** ele → `pegar_em: null`, `pegar_em_aviso: 'SALDO_INDICADO_A_OUTRAS'`; a tela mostra *"Sem endereço livre agora: o saldo das
  prateleiras já foi indicado às requisições à frente na fila. Separe esta depois delas ou escolha o endereço no 'Sai de'."* Sem par
  sugerível nenhum → `SEM_ENDERECO_SUGERIVEL` como hoje. Desconto parcial → `NENHUM_ENDERECO_COBRE` / o par com o que sobra, como hoje.
- **RN-266.13 (B1630)** `GET /requisicoes/:id/sugestao-coleta` devolve, para cada item, o mesmo `pegar_em`/`pegar_em_aviso` que a Fila mostra
  para a requisição (a fila inteira lida). Requisição fora da fila → `itens: []` como hoje; 404 como hoje.
- **RN-266.15 (Fase 2)** A planejada (RN-188.01a) **não** desconta o indicado às requisições da frente — a frase dela (*"o resto não cabe lá"*)
  seria falsa: a prateleira foi indicada a outra, não está cheia. Fica como hoje.
- **RN-266.17 (Fase 5)** O sugerido às **planejadas** (RN-188.01a) de todas as outras requisições da Fila — da frente e de trás — desconta
  para quem não é planejada (a planejada não desconta ninguém, RN-266.15). Cenário: *SA-01* 5, *SB-01* 3; R1 (atrás) já separou 1 de *SA-01*,
  faltam 2; R2 URGENTE 3 → R2 *SB-01* 3, R1 *SA-01* 2; as duas separam pela dica.
- **RN-266.16 (Fase 2)** A janela de separação, no item sem planejada cuja sugestão veio sem prateleira com `SALDO_INDICADO_A_OUTRAS`, mostra a
  frase da RN-266.12 (`#separacao-sugestao-<item>`) — antes ficava calada. A lista de coleta impressa mostra a mesma frase em "Sem endereço
  sugerido" (sem código novo; um caso no teste dela).
- **RN-266.14 (integração, cruza Fila → janela → separação)** No cenário da RN-266.10, a janela de R1 devolve *SB-01*; separar R2 e depois R1
  pelo `pegar_em` de cada uma → 200 e 200; a Fila de novo: as duas em ENTREGAR, sem dica.

## Contratos (congelados)

- `GET /api/almoxarifado/fila-separacao` — sem campo novo; `itens[].pegar_em_aviso` ganha o valor `'SALDO_INDICADO_A_OUTRAS'`;
  `pegar_em.quantidade_no_endereco` passa a ser o livre depois das requisições anteriores. Ordem das requisições e dos itens: a de sempre.
- `GET /api/almoxarifado/requisicoes/:id/sugestao-coleta` — mesmo formato; o conteúdo é o da Fila inteira.
- `sugestaoDeColeta.sugerirColeta({ …, jaIndicado })` — `jaIndicado` opcional `{ porPar: Map, porLote: Map }`, **mutado** ao fim (soma o
  sugerido desta requisição); ausente = o comportamento de hoje. `AVISO.SALDO_INDICADO_A_OUTRAS`.
- Tela: `client/src/utils/coletaTexto.js` `textoAvisoPegarEm` — o caso novo com a frase da RN-266.12.

## Tasks (sort topológico)

- [x] **T1 (independente; só teste)** — `b681741c` (23/23; sabotagens: guarda de status 15 caem, de vencimento 7, derivação do lote 22; a
  prateleira de verdade entrou no arranjo — sem ela o saldo nascia sem endereço e "escolher a prateleira" não escolhia nada) — RN-266.01: `server/tests/api/entregaConfereLoteDasSeries.api.test.js`. Controle positivo: sabotar a
  guarda de status de `checarOrigemItem` e a derivação `loteId = loteSeries` → os cenários caem (item 1 sai antes da recusa).
- [x] **T2 (tronco)** — `787ee077` — RN-266.10..13: `sugestaoDeColeta.js` (`jaIndicado`, aviso novo) + `requisitionService.listarFilaSeparacao` (a dica
  depois de ordenar a fila, um acumulador) + `sugestaoDeColetaDaRequisicao` (fila inteira). Testes: unidade em
  `server/tests/api/sugestaoDeColeta.api.test.js` (função pura) e rota em `server/tests/api/dicaDaFilaDivideAsPrateleiras.api.test.js`, com
  a **RN-266.14** (integração Fila → janela → separação pela rota) e um cenário pelo **serviço** (`listarFilaSeparacao`).
- [x] **T3 (galho, contra o contrato; feito em série depois da T2)** — `6a55156f` — a frase da RN-266.12 em `coletaTexto.js` + `coletaTexto.test.js`, a janela (RN-266.16, `RequisicoesList.js`)
  e um caso em `listaColetaPdf.test.js`.
- [x] **T4** — Fase 5 `517c6e5f`; documentos (`fechar-etapa`) e suítes no fechamento.

## Pontos de atenção

- Nada aqui pega trava: a dica é leitura (RN-188.07). A separação continua decidindo sob a trava dela.
- Testes antigos que tenham duas requisições do mesmo material na fila podem mudar de prateleira esperada — se mudarem, é a regra nova;
  conferir caso a caso que a expectativa antiga era a dica que levava à recusa.
- A lista de coleta impressa e o PDF da Fila leem a mesma fila — mudam junto (sem código).

## Fase 2 (revisor fresco, uma passada, sobre o plano `9b4d0e65`)

- **(1) importante** — a mensagem do "um clique" com a planejada **no** lote impedido é o envelope da planejada, não a frase pura. → RN-266.01
  corrigida e cenário próprio no T1 (a sonda da Fase 0 rodava sem prateleira: a separação não gravava planejada com lote).
- **(2) importante** — T1 e T2 sabotam/editam o mesmo arquivo. → executados em série (o T1 commitado antes do T2), sem worktree.
- **menores:** a janela ficava calada com o aviso novo (→ RN-266.16); a lista impressa sem teste (→ caso no T3); a planejada com
  `PLANEJADA_NAO_COBRE` falso (→ RN-266.15: não desconta); RN-266.12 ambígua quanto aos irmãos (→ explícito); o acumulador tem de entrar nos
  dois tetos por lote (séries e lote com peça presa — no T2); o controle positivo do T1 tem de cair com o item da série **depois** (→ o comum
  sai de prateleira escolhida, a passada 0, e cai: S1 15, S3 7, S2 22); a da frente com `NENHUM_ENDERECO_COBRE` só indica o que cobre — se o
  resto for separado de outra prateleira, a dica da de trás pode ser recusada (dica; vai para os pontos de atenção e D).
- **Refutação tentada, não achou:** nenhum caminho da entrega em que a série de lote impedido só é recusada na baixa (planejada sem lote,
  K1, caso (c), `origem_automatica`, controle de lote 0); a corrida do status do lote está sob a trava do material desde a 220.

## Fase 5 (um revisor fresco, sondas `scratchpad/f5-266-*.js`, sobre `6a55156f`)

1. **[importante, reproduzido]** A planejada de trás (presa à origem, sem descontar ninguém pela RN-266.15) ficava com a origem dela, e a
   requisição da frente, calculada sem saber dela, levava a mesma prateleira (a de mais livre): *SA-01* 5 (1 separado por R1), *SB-01* 3 → R2
   *SA-01* 3, R1 *SA-01* 2; separar R1 pela dica → 400 com *SB-01* livre. Não era regressão (antes da 266, igual). → **consertado**
   (RN-266.17): uma passada antes calcula o sugerido às planejadas de cada requisição; quem não é planejada desconta o das outras; o
   `jaIndicado` recebe só o dos não planejados (sem contar em dobro). Cenário pela rota e de unidade; sabotagens: tirar o desconto → o cenário
   da rota e o de unidade caem; somar a planejada no `jaIndicado` → o de unidade cai.
- Tentado e não quebrou: irmãos do mesmo material (o aviso certo), série e lote preso (os dois tetos descontam), materiais diferentes,
  alçada de valor e sem separável (não entram no acumulador), a ordem do acumulador = a da Fila, a frase de `SALDO_INDICADO_A_OUTRAS`
  (verdadeira por construção), a janela (mesma porta, mesmo gate, 404 e fora da fila como antes), e o item 12 (todo caminho passa por
  `checarOrigemItem` antes da 1ª baixa). Mencionado, não reproduzido: com **Agrupar por setor**, a requisição "da frente" na Fila pode aparecer
  abaixo da que mostra a frase (a ordem da divisão é a da Fila sem agrupar) — vai para D (266).

## Divergências do plano

- **Item 12 não teve código:** a Fase 0 mostrou que a C486 estava errada (B1627); a estimativa (1h15) previa uma conferência nova.
- RN-266.01 prometia a frase pura do motor nos três modos — errado com a planejada **no** lote impedido (envelope da planejada; Fase 2).
- RN-266.15 (a planejada não desconta) deixava a da frente levar a origem da planejada de trás → RN-266.17 (Fase 5).
- A sonda da Fase 0 do item 12 rodou sem prateleira (o saldo nascia sem endereço); o teste final usa uma prateleira de verdade — só com ela
  o controle positivo derruba os cenários com o item comum saindo primeiro.
- Dois testes antigos (`preSelecaoColetaIntegracao` C449, `separacaoSeparadoDeOutras` RN-198.09) tinham como premissa "as duas janelas
  recebem o mesmo par" — o defeito que a etapa conserta; reescritos para abrir a janela velha com a requisição sozinha na Fila.
- **CLAUDE.md:** nenhuma linha ficou errada — a dica é leitura, sem trava; nada mudou na entrega.

## Próxima tarefa detalhada

Os itens **14 e 15** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`):

1. **Item 14 — Lista "Sai de" atualizada depois de uma recusa (C473; 45 min, tela).** `client/src/components/almoxarifado/RequisicoesList.js`:
   as janelas de separação e de entrega leem os saldos por endereço (`saldosEntrega`, `GET /almoxarifado/estoque/:material/saldos?requisicao_id=`)
   ao abrir; quando a confirmação é recusada porque outra pessoa separou da mesma prateleira (a frase C1 *"… já está separado dali para outra
   requisição …"*, 10.2), reler os saldos e a sugestão (`GET /requisicoes/:id/sugestao-coleta`, que desde esta etapa lê a Fila inteira) sem
   fechar a janela. Atenção: a pré-seleção é uma vez por abertura (`aberturaSugestaoRef`, `preSelecao`) — a releitura não pode reescolher o
   que o almoxarife mudou (RN-189.05). Molde de releitura na recusa: a lista de séries da entrega (recarrega e desmarca a série impedida).
2. **Item 15 — Entrega escolhendo só o lote respeita a separação de outra requisição (C471, B1341; 1h30, motor).** `requisitionService.
   entregarSemTrava`, o "só lote" (`soLotePendentes`, passada 1): o motor tira do endereço de mais saldo do lote sem descontar o separado de
   outra requisição ali; a régua da caixa existe (`caixaSql`, B1326; o automático por lote já desconta — `lotesParaOAutomatico`). Roda sob as
   duas travas da entrega (requisição → material). Sonda antes: lote L1 em *A* 4 (todos separados por R1) e *B* 2; R2 entrega 2 escolhendo só L1.
- **O que já está pronto e não reabre:** a dica dividida da Fila e a janela (esta etapa); a entrega com série de lote impedido (já recusava).
- Candidatos fora da estimativa: conferir as séries na origem escolhida (D (265) 1); o estorno do Desbloquear com lote (C504).

## Verificação (medida sobre o código final, `517c6e5f`; os documentos não mudam código)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **675/677 arquivos OK** — os 2 que falham são os já conhecidos de
  proposta, de outra máquina (`propostaBilingueTemplate`, `propostaPdfExigeLogin`); o mais lento: `entregaGuardaSemLote`, 94,2 s.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`, sobre `6a55156f` — a tela não mudou depois): **256/256 suítes, 3367/3367 testes**. `CI=true npx react-scripts
  build`: **Compiled successfully.**
- `entregaConfereLoteDasSeries` 23/23; `dicaDaFilaDivideAsPrateleiras` 6/6; `sugestaoDeColeta` 43/43. Sabotagens: 3 no item 12, 12 no servidor
  da dica, 4 na tela (harness `scratchpad/sab-266a.sh`: âncora contada = 1, cópia, md5 sabotado ≠ original e restaurado = original) — cada uma
  derruba o seu cenário.
- Nenhum clique no navegador (F (266)).

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2 — o envelope da planejada, a janela calada, a planejada que não desconta; Fase 5 — a planejada de
  trás).
- Achados: Fase 2 — 2 importantes (1 de mensagem, 1 de execução) e 6 menores, todos absorvidos; Fase 5 — 1 importante reproduzido e
  consertado, 1 mencionado sem reprodução (Agrupar → D).
- Paralelismo: nenhum galho em paralelo (T1 e T2 no mesmo arquivo, Fase 2); o Jest da tela rodou enquanto a revisão final trabalhava.
- Defeito que escapou: (preencher na etapa seguinte). Da 265: nenhum apontado.
