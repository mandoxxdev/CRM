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
  para consumo. …"*) e **nada sai**: nenhum item entregue, nenhuma movimentação nova, saldos e séries como antes. Vencimento liberado → 200.
- **RN-266.10 (B1628)** Na Fila (`GET /fila-separacao`), o *"Pegar em"* de cada item desconta do livre de cada par (prateleira, lote) — e do
  teto das séries e do lote com peça presa — o que foi sugerido aos itens das requisições **anteriores na ordem da Fila** e aos irmãos
  anteriores da mesma requisição. Cenário: *SA-01* 3, *SB-01* 3, R2 URGENTE 3 e R1 NORMAL 3 → R2 *"Pegar em SA-01 · 3"*, R1 *"Pegar em SB-01 ·
  3"*; separar as duas pela dica → 200 e 200.
- **RN-266.11** A ordem é a da Fila: R1 e R2 com a mesma urgência → a de data de necessidade mais cedo primeiro (depois criação, número
  interno). Requisição sem dica (alçada de valor; sem separável) não desconta nada.
- **RN-266.12 (B1629)** Item sem planejada, com pelo menos um par sugerível de livre > 0 **sem** o desconto das requisições anteriores, e
  nenhum **com** ele → `pegar_em: null`, `pegar_em_aviso: 'SALDO_INDICADO_A_OUTRAS'`; a tela mostra *"Sem endereço livre agora: o saldo das
  prateleiras já foi indicado às requisições à frente na fila. Separe esta depois delas ou escolha o endereço no 'Sai de'."* Sem par
  sugerível nenhum → `SEM_ENDERECO_SUGERIVEL` como hoje. Desconto parcial → `NENHUM_ENDERECO_COBRE` / o par com o que sobra, como hoje.
- **RN-266.13 (B1630)** `GET /requisicoes/:id/sugestao-coleta` devolve, para cada item, o mesmo `pegar_em`/`pegar_em_aviso` que a Fila mostra
  para a requisição (a fila inteira lida). Requisição fora da fila → `itens: []` como hoje; 404 como hoje.
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

- [ ] **T1 (independente; só teste)** — RN-266.01: `server/tests/api/entregaConfereLoteDasSeries.api.test.js`. Controle positivo: sabotar a
  guarda de status de `checarOrigemItem` e a derivação `loteId = loteSeries` → os cenários caem (item 1 sai antes da recusa).
- [ ] **T2 (tronco)** — RN-266.10..13: `sugestaoDeColeta.js` (`jaIndicado`, aviso novo) + `requisitionService.listarFilaSeparacao` (a dica
  depois de ordenar a fila, um acumulador) + `sugestaoDeColetaDaRequisicao` (fila inteira). Testes: unidade em
  `server/tests/api/sugestaoDeColeta.api.test.js` (função pura) e rota em `server/tests/api/dicaDaFilaDivideAsPrateleiras.api.test.js`, com
  a **RN-266.14** (integração Fila → janela → separação pela rota) e um cenário pelo **serviço** (`listarFilaSeparacao`).
- [ ] **T3 (galho, contra o contrato)** — a frase da RN-266.12 em `coletaTexto.js` + `coletaTexto.test.js`.
- [ ] **T4** — Fase 5, documentos (`fechar-etapa`), suítes.

## Pontos de atenção

- Nada aqui pega trava: a dica é leitura (RN-188.07). A separação continua decidindo sob a trava dela.
- Testes antigos que tenham duas requisições do mesmo material na fila podem mudar de prateleira esperada — se mudarem, é a regra nova;
  conferir caso a caso que a expectativa antiga era a dica que levava à recusa.
- A lista de coleta impressa e o PDF da Fila leem a mesma fila — mudam junto (sem código).
