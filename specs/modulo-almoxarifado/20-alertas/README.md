# 20 — Alertas Operacionais

> **Status:** 🟢 no que é viável hoje — **20 de 21 alertas** do checklist original, **mais um que a spec não previa**: a **Etapa 46** acrescentou `NAO_CONFORMIDADE_EXECUCAO_PENDENTE` (a **15ª entrada do registro**), que nasceu do fluxo criado pelas Etapas 45/46 e entrou no checklist abaixo como item novo, pela regra que este próprio checklist manda ("cada alerta novo entra … incluir o alerta no checklist") (Etapa 16 somou 7 pela varredura, Etapa 17 somou 4 no ato/vigília, **Etapa 39 somou 1 — o primeiro que lê tabela CORE**, a **Etapa 42 somou o 19o** (`PEDIDO_COMPRA_PARCIAL`, que fechou a lacuna mais antiga desta lista) e a **Etapa 43 somou o 20o**, `NAO_CONFORMIDADE_ABERTA` — documento de nao conformidade sem decisao, o primeiro alerta que cobra um ATO HUMANO sobre um documento que o proprio sistema abriu; 2 itens SAÍRAM do checklist dizendo por quê — ver abaixo), **central no front entregue** e o motor único em duas parcelas (`alertRegistry` + modo evento com `dispararAlertaRegistrado`). **Restam só os 3 com lacuna nas features donas** — nenhum deles é bloqueio deste arquivo. · **Spec original:** seção 26
> **Última atualização:** 2026-09-30 (**Etapa 46: a 15ª entrada do registro, `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`** — ver o parágrafo dela acima e o item novo no checklist; e o comentário da `NAO_CONFORMIDADE_ABERTA` corrigido à vista, porque ele dizia que "NC decidida sai da condição sozinha", verdade na 43 e vencida na 45). Antes: 2026-09-28 (Etapa 43: a entrada **`NAO_CONFORMIDADE_ABERTA`** — `9b6f205`, com SQL proprio (`listarNaoConformidadesParadas`) em vez de reusar `listarNaoConformidades`, que clampa em 100 e faria a varredura diaria ignorar a 101a NC parada em silencio; e o cartao `DIVERGENCIA_RECEBIMENTO` passou a EXCLUIR item que ja tem NC, virando a rede de seguranca do gancho nao fatal — a exclusao mora no `listar` da ENTRADA, nunca na funcao compartilhada, porque a Fase 2 mediu que mexer nela silencia o cenario A1 da Etapa 17. Design e plano: `docs/superpowers/{specs,plans}/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada*`. Antes — Etapa 42: a entrada **`PEDIDO_COMPRA_PARCIAL`** — a fonte `dcda360`, a entrada e o cartao no range da etapa; design `docs/superpowers/specs/2026-09-27-almoxarifado-etapa42-recebimento-fecha-pedido-design.md`, plano `docs/superpowers/plans/2026-09-27-almoxarifado-etapa42-recebimento-fecha-pedido.md`. Antes — Etapa 39: a entrada **`PEDIDO_COMPRA_ATRASADO`** — `ddbc18f`, `33031ac`, `8f3db94`, dentro do range `39ea9d2..19ebf7d`; design `docs/superpowers/specs/2026-09-16-crm-etapa39-pedido-acompanhado-design.md`, plano `docs/superpowers/plans/2026-09-16-crm-etapa39-pedido-acompanhado.md`. Antes — Etapa 17: modo evento + 4 alertas — `d65d81b..e51ca79`; design `docs/superpowers/specs/2026-08-28-almoxarifado-etapa17-alertas-evento-design.md`, plano `docs/superpowers/plans/2026-08-28-almoxarifado-etapa17-alertas-evento.md`. Antes — Etapa 16: registro + varredura + central — `6bed5e2..ed5f032`; design `docs/superpowers/specs/2026-08-28-almoxarifado-etapa16-alertas-design.md`, plano `docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md`)
> **Etapa 46 (2026-09-30, `950c2f5` + `5a975a0`) — a 21ª entrada do registro, e ela cobra um ATO
> que a etapa anterior tornou obrigatório.** `NAO_CONFORMIDADE_EXECUCAO_PENDENTE`: documento de não
> conformidade **decidido** cuja execução segue **pendente** há mais dias que o configurado
> (`alerta_nc_execucao_pendente_dias`, padrão 7). **A janela é por `decidido_em`, não por
> `created_at`** — cobra-se o tempo desde a **decisão**, e um documento aberto há 60 dias e decidido
> ontem não está atrasado.
> **Ela é SEPARADA de `NAO_CONFORMIDADE_ABERTA` em vez de a régua daquela ser afrouxada**, e a razão
> é de destinatário: aquela cobra a **decisão** (dono: QUALIDADE), esta cobra a **execução** (dono:
> COMPRAS). Uma entrada só misturaria dois donos e dois prazos no mesmo cartão.
> **⚠️ E o comentário de `NAO_CONFORMIDADE_ABERTA` foi corrigido à vista:** ele dizia que *"NC
> decidida ou cancelada sai da condição sozinha, sem gancho nenhum"* — verdade quando escrito, na
> Etapa 43, porque **decidir era o último gesto**, e vencido desde a 45, que criou um segundo gesto
> depois da decisão. Era exatamente por isso que o documento preso não cobrava ninguém.
> **Um achado de revisão que vale para esta feature inteira:** quem recebe o cartão novo é o
> **COMPRAS** (ele tem `ver_alertas`), e a saída do documento preso é **cancelar**, que é de
> QUALIDADE — perfil que está **fora** de `ver_alertas` porque a central carrega o valor em dinheiro
> do estoque parado. O cartão ficaria aceso para quem só pode tomar erro. **Escolhido:** o corpo e a
> descrição da entrada **nomeiam a saída**. **Descartado:** pôr QUALIDADE em `ver_alertas` —
> alargar permissão é menos reversível que escrever a frase. **B183** das novidades.
> **Custo medido de acrescentar entrada neste registro, e ele vale registro aqui:** **nove**
> asserções de contagem em **cinco** arquivos de teste, mais **quatro** pontas de configuração
> (semente no schema, campo na tela de Configurações, entrada em `COLUNAS_POR_CHAVE` da central, e a
> fixture do teste da tela de Configurações — sem esta última, sete testes de Salvar que nada têm
> com a chave caem). Uma delas era um **guarda de texto-fonte** que varria o `alertRegistry.js`
> inteiro e passou a acusar regressão inexistente, porque a régua da entrada nova tem
> `nc.execucao_estado = 'PENDENTE'` no SQL **por contrato**; a janela foi estreitada para o corpo da
> função que ela quer guardar.

## Objetivo

Todos os alertas preventivos da spec, com motor único (verificação periódica + gatilhos por evento), canais e destinatários configuráveis.

## O que já existe

- Estoque abaixo do mínimo (máquina de estados + debounce, e-mail/WhatsApp) — `alertService.js`.
- Requisição aguardando aprovação há N dias (lembretes, job 1 h) — `requisitionReminderService.js`.
- Padrão de job periódico agendado em `routes/almoxarifado.js` (worker da fila + varreduras diárias).
- **Registro de alertas (Etapa 16)** — `services/almoxarifado/alertRegistry.js`: cada alerta declara condição (`listar`), dedupe, config de dias e textos; a varredura diária (`varrerAlertasRegistrados`, pela fila da 19) e a central (`montarCentral`) leem o MESMO registro. Alerta novo = uma entrada no registro. Erro num `listar` não cala os demais — nem na central nem na varredura (achado A1 da revisão, com teste nos dois lados).
- **Central no front (Etapa 16)** — tela `/almoxarifado/alertas` (avaliação ao vivo; cartão por alerta, total cheio com linhas cortadas em 50, erro por cartão), gateada pela ação nova `ver_alertas` [ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS — decisão B28].

## Checklist de alertas (spec 26)

- [x] Estoque abaixo do mínimo
- [x] Requisição aguardando aprovação
- [x] Estoque zerado — `837faec`/`078cce2`/`d7fee6c` (máquina de estado própria com claim atômico na transição, anti-flap 60s, régua = saldo FÍSICO ≤ 0; **só material SEM mínimo** — com mínimo fica no canal do alerta de mínimo, decisão B17; inativo e cliente fora; primeira zeragem observada decide pelo `saldo_anterior` do motor)
- ~~Estoque negativo~~ — **SAIU do checklist (Etapa 16)**: não é alerta, é regra do motor (feature 03), como este arquivo já dizia; mantê-lo desmarcado fingia pendência
- [x] Requisição atrasada — Etapa 16, `6bed5e2` (status derivado da máquina de estados — a primeira versão do plano hardcodava literais inexistentes como `APROVADA` e **estava errada**; só alerta quem preencheu `data_necessidade`; dedupe 1× por requisição). **Pendência nomeada:** `data_necessidade` aceita texto livre por API e data ilegível nunca alerta, em silêncio (letra C19 das novidades) — falta `z.regex` no schema
- [ ] Material separado aguardando retirada há N dias
- [x] Material reservado há muitos dias — Etapa 16, `6bed5e2` (reserva ATIVA além de `alerta_reserva_parada_dias` OU `expira_em` vencida; dedupe 1× por reserva)
- [x] **Pedido recebido parcialmente** — **Etapa 42, 2026-09-27.** A 13ª entrada do registro
  (`PEDIDO_COMPRA_PARCIAL`), com o follow-up que este item nomeava **entregue na mesma etapa**:
  `derivarRecebimentoDoPedido` passou a ser **exportada** e nasceu `situacaoDosPedidosCompra`, sem
  `LIMIT` e com `previsao_entrega`/`status` (`dcda360`, fatia da feature 08, como estava previsto
  aqui). Contrato da entrada, que é o que outra sessão precisa para não reinventá-la:
  - população: `situacao_recebimento === 'PARCIAL'` **e** `status` ∉ `{cancelado, rejeitado,
    recebido}` — nos três a decisão já é do comprador;
  - `dedupeChave` `pedido-parcial-${id}-${Math.round(saldo_pendente * 1000)}` — **um aviso por
    saldo**: mesmo saldo não repete, saldo novo avisa de novo. O **arredondamento é parte do
    contrato**: `saldo_pendente` é `REAL` e duas `SUM(REAL)` sobre o mesmo estado físico podem
    produzir `6.699999999999999` e `6.7`, o que mandaria dois e-mails para o mesmo estado;
  - prefixo `[Compras]` no assunto (o documento é de Compras, a lista de destinatários é
    compartilhada — mesma razão do alerta de atrasado);
  - corpo com **sete** linhas: `Pedido:` · `Fornecedor:` (`-` sem fornecedor) · `Quantidade pedida:`
    · `Quantidade recebida:` · `Saldo pendente:` · `Previsão de entrega:` (**`não informada`** quando
    vazia — e isto é contrato, porque, ao contrário do alerta de atrasado, esta população **não
    filtra** por previsão, então o pedido importado sem prazo entra) · `Status:`;
  - colunas **projetadas** na fonte, `LEFT JOIN fornecedores`, e **require lazy** de
    `receiptService` dentro do `listar` — as três pelo mesmo motivo da entrada irmã (vazamento para
    quem tem `ver_alertas` sem o módulo Compras; pedido órfão de fornecedor que desapareceria; e o
    ciclo de require, que agora **fecha de fato** e cuja falha é silenciosa);
  - cartão da central com 6 colunas próprias — `Pedido · Fornecedor · Pedida · Recebida · Saldo
    pendente · Previsão` (`6df2169`), porque o fallback genérico mostraria `id` cru.

  > ⚠️ **O texto que estava aqui era a SEGUNDA versão do motivo, e as duas ficam registradas, porque
  > a sequência é a lição.** A primeira dizia *"falta noção de saldo do pedido"* — **bloqueado por
  > falta de dado**, e estava **desatualizada** desde a Etapa 37. A segunda (escrita na Etapa 39)
  > corrigiu para o motivo verdadeiro: *"a derivação não é exportada … a única fonte exportada tem
  > `LIMIT 50` e não devolve `previsao_entrega`; consumi-la daria um alerta que ignora o 51º pedido
  > em silêncio, e recalcular a situação aqui criaria a segunda fórmula de saldo"*. **Essa segunda
  > versão estava certa, e foi ela que desenhou a solução** — a Etapa 42 não contornou o bloqueio,
  > removeu-o: exportou a régua e criou a fonte sem `LIMIT`, mantendo **um dono** para a régua e
  > **um dono** para a agregação (`SOMA_POR_PEDIDO_SQL`, compartilhada com a rota da tela, que
  > **continua** com o `LIMIT 50` porque ali ele é contrato de tela). Há teste pareado que afirma a
  > diferença: com 51 pedidos parciais, a fonte nova devolve **51** e o aux da tela devolve **50**.
- [x] **Pedido de compra atrasado** — Etapa 39, `ddbc18f` (+ `33031ac`, `8f3db94`). **A primeira
  entrada do registro que lê tabelas CORE** (`pedidos_compra`, `fornecedores`) — as 11 anteriores só
  leem `*_almoxarifado`; mesmo handle, mesmo arquivo SQLite, decisão de arquitetura declarada. O
  contrato inteiro, que é o que outra sessão precisa para não reinventá-lo:
  - `chave` `'PEDIDO_COMPRA_ATRASADO'` · `titulo` `'Pedido de compra atrasado'` · `descricao`
    `'Pedidos de compra com previsão de entrega vencida e ainda não recebidos.'` · `configDias`
    `null` (a régua é a data prometida, não uma janela configurável).
  - **Régua:** `derivarAtraso` + `hojeLocalISO` **importados do módulo Compras por require LAZY**
    dentro do `listar` (`services/compras/pedidoCompraService.js`). O SQL só **pré-filtra** por
    `previsao_entrega IS NOT NULL` — superconjunto, não segunda fórmula; quem decide linha a linha é
    a régua em JS. Escrever `AND previsao_entrega < date('now') AND status NOT IN (…)` aqui seria a
    segunda régua, e `date('now')` ainda por cima é **UTC**. `alertaPedidoAtrasado.api.test.js (5)`
    cruza os ids do alerta com os `atrasado=1` da rota por `deepStrictEqual`.
  - **Require lazy é convenção, não estilo, e a suíte NÃO a protege** — está escrito no arquivo:
    hoje o ciclo de módulos **não fecha** (`notificationQueueService` requer o `alertRegistry` lazy),
    então um require de topo funcionaria; é justamente por isso que é perigoso, porque o ciclo está a
    **um** require de distância (`receiptService.js:26` e `:31`, os dois no topo). Quando fechar, um
    dos lados captura `{}` mid-load, `derivarAtraso` vem `undefined` e o cartão aparece com
    `erro: true` **em vez de quebrar a suíte**. Falha silenciosa.
  - **Colunas projetadas, nunca `SELECT p.*`** (`8f3db94`, achado Important da revisão final):
    `SELECT p.id, p.numero, p.status, p.previsao_entrega, f.razao_social AS fornecedor_nome`, com
    **`LEFT JOIN`** (pedido órfão de fornecedor também atrasa). Com `p.*`, `montarCentral` punha as
    linhas **cruas** na resposta de `GET /api/almoxarifado/alertas/central`, cujo gate é
    `requirePermission('ver_alertas')` — **sem** `checkModulePermission('compras')`: um ALMOXARIFE
    ou GESTOR, que toma **403** em `GET /api/compras/pedidos`, recebia `valor_total` e `observacoes`
    de pedidos CORE na aba Network. É a mesma classe de dado que tirou PRODUÇÃO/ENGENHARIA/CONSULTA
    de `ver_alertas` na Etapa 16 (`valor_parado`). `data_pedido` **não** entra: nada o lê.
  - **Dedupe `pedido-atrasado-${id}-${previsao_entrega}`** (`33031ac`, achado Important das **duas**
    lentes). Só com o id, a chave calava o pedido **para sempre**: o comprador recebia o aviso,
    renegociava o prazo pelo `PUT` (gesto canônico depois do primeiro alerta), o prazo novo vencia, e
    o `enfileirar` recalculava o **mesmo** hash, batia no `UNIQUE` e devolvia DUPLICADA — nenhum
    e-mail, nunca mais, e não há expurgo da fila. Com a data prometida na chave o objetivo original
    fica inteiro (a previsão não muda dia a dia), e o formato é o das irmãs que dependem de uma data
    prometida: `calibracao-${id}-${data_validade}`, `lote-vencendo-${id}-${data_validade}`,
    `remessa-vencida-${id}-${prazo_previsto}`. **Descartado:** expurgo/retenção da fila — é contrato
    da feature 19 e mudaria o dedupe das 11 entradas anteriores junto.
  - **Assunto** `` `[Compras] Pedido de compra atrasado — ${linha.numero}` `` — prefixo **`[Compras]`**,
    e não `[Almoxarifado]` como as 11 anteriores: o documento é de Compras e a lista de destinatários
    é compartilhada, então o prefixo é o que permite filtrar. **Corpo**, cinco linhas:
    `Pedido:` · `Fornecedor:` (com `|| '-'`) · `Previsão de entrega:` · `Atraso: N dia(s)` ·
    `Status:`. **Payload** `{ pedido_compra_id, dias_atraso }`.
  - **Canal: o mesmo das 11 outras, sem exceção** — toggle mestre `alertas_estoque_notificar_email`
    e lista única `alertas_estoque_emails` (que no dump de produção é **idêntica** a
    `compras_notificar_emails`). Canal por alerta continua fora (B15). **Varredura:** o Job B
    existente (`setTimeout 30 s` no boot + `setInterval 24 h`), **sem** modo evento — atraso não tem
    ato. **Central:** 4 colunas em `COLUNAS_POR_CHAVE` — `Pedido` · `Fornecedor` · `Previsão` ·
    `Dias de atraso`.
  - **Limitações declaradas:** o alerta **nasce inerte** enquanto nenhum pedido tiver previsão de
    entrega preenchida; a hora da varredura é a hora em que o contêiner subiu e **anda a cada
    deploy** (M3 da revisão final, não acionado); e a central mostra a previsão como `25/09/26`
    enquanto a aba Pedidos mostra `25/09/2026` (dívida pré-existente desta feature, vale para as 11
    entradas anteriores).
- [x] Divergência de recebimento — Etapa 17, `c1cd0a1`/`8eeaeea` (dispara NO ATO nos DOIS escritores reais da quantidade — `conferirRecebimento` e `salvarDadosFiscal`; a UI usa o segundo, e o plano original só previa o primeiro: **achado Crítico da revisão do plano**. Régua float-safe por `divergenciaRealSql`; dedupe por item **+ quantidade** — sem a quantidade, errar de novo e PIOR ficava calado, achado A1 da revisão adversarial. Volume por item declarado, B32)
- [x] Material em quarentena parado — Etapa 16, `6bed5e2` (item com retenção de inspeção além de `alerta_quarentena_dias`; dedupe 1× por item). **Limitação declarada (achado A3 da revisão):** o relógio é o `created_at` do RECEBIMENTO — não existe a data da transição para inspeção; NF que demora a processar gera falso positivo no 1º dia real de quarentena (letra C18 das novidades)
- [x] Material reprovado — Etapa 17, `c1cd0a1`/`8eeaeea` (gancho pós-INSERT em `decidirInspecao`, só com `quantidade_reprovada > 0`; a linha do e-mail vem do `listar` dual-mode por id — régua única com a central; RN-02: o aviso nunca derruba o ato)
- [x] **Não conformidade com execução pendente** — **item NOVO, que esta spec não previa.** Etapa 46, `950c2f5` (+ `5a975a0`). A **15ª entrada** do registro: documento de não conformidade **decidido** cuja execução segue **pendente** há mais dias que o configurado (`alerta_nc_execucao_pendente_dias`, padrão 7), com a janela contada por **`decidido_em`** — não por `created_at`, porque o que se cobra é o tempo desde a **decisão**. Entrou **pela regra que este checklist manda** ("cada alerta novo entra quando a feature correspondente ganhar o dado — incluir o alerta no checklist"), e o dado passou a existir na Etapa 45, que separou decidir de executar. **Ela é separada da `NAO_CONFORMIDADE_ABERTA` de propósito:** aquela cobra a DECISÃO (dono: QUALIDADE), esta cobra a EXECUÇÃO (dono: COMPRAS) — uma entrada só misturaria dois donos e dois prazos no mesmo cartão. **E o corpo dela NOMEIA a saída** (*"Execução impossível…? A Qualidade pode cancelar o documento…"*), porque quem recebe o cartão não é quem pode resolvê-lo — ver **B183** das novidades
- [x] Material sem certificado — Etapa 17, `c1cd0a1`/`e51ca79` (varredura pura AGREGADA: 1 resumo por mês com total + 20 primeiros — B31, medido em 1000 e-mails/mês na versão por lote. Régua `COALESCE(TRIM(certificado_arquivo),'')=''` com saldo>0; lote BLOQUEADO entra — é o caso principal, porque o lote que exige certificado nasce travado; material de cliente entra)
- [x] Material sem endereço — Etapa 16, `6bed5e2` (a MESMA régua do relatório homônimo, extraída para função compartilhada; **material de cliente conta de propósito** — B29; resumo AGREGADO 1×/semana)
- ~~Transferência não recebida~~ — **SAIU do checklist (Etapa 16)**: foi **cortado por decisão do cliente em 2026-08-12** (spec 11 — não existe trânsito entre áreas físicas do mesmo site); este arquivo o listava como pendência e isso **estava errado**
- [x] Ferramenta não devolvida (feature 16) — `837faec` (lembrete diário pela fila, dedupe por empréstimo+dia — paga a pendência B7 da Etapa 9b)
- [x] Material em terceiro com prazo vencido (feature 14) — `837faec` (varredura diária pela régua única de `listarRemessas({vencidas})`, dedupe por remessa+prazo)
- [x] Lote próximo do vencimento (feature 10) — `837faec`/`d7fee6c` (janela configurável de 30 dias **sem piso — lote JÁ vencido com saldo entra**, a primeira versão o excluía para sempre e **estava errada**; lote com vencimento liberado sai; dedupe por lote+validade)
- [x] Calibração próxima do vencimento — Etapa 16, `6bed5e2` (via `painelCalibracoes`; ferramenta nunca calibrada conta como vencida; janela `alerta_calibracao_dias`; dedupe por ferramenta+validade — paga a dívida da 9b)
- [x] Divergência de inventário — Etapa 17, `c1cd0a1`/`8eeaeea` (gancho na conclusão da conferência, AGREGADO: 1 aviso por conferência, nunca por item — o mesmo motivo pelo qual `AJUSTE_INVENTARIO` está fora da notificação de movimentação; corpo SEM impacto financeiro, B30. Régua compartilhada por `listarDivergenciaConferencia` dual-mode, porque a conclusão é inline na rota)
- [x] Item sem movimentação há N dias — Etapa 16, `6bed5e2` (via `estoqueParado`, janela `reposicao_dias_sem_consumo`; re-lembrete mensal por dedupe material+mês)
- [x] Estoque excessivo — Etapa 16, `6bed5e2` (via `estoqueParado`, acima da máxima; re-lembrete mensal)
- [ ] Projeto com consumo acima do previsto (feature 22)

## Infra

- [x] **Primeira parcela do motor único** — Etapa 16, `6bed5e2`: o `alertRegistry` é o registro de regras (condição, dedupe, janela em config, textos), consumido pela varredura E pela central. **O que NÃO entrou, declarado:** canal/destinatário POR alerta (todos usam a lista única `alertas_estoque_emails` e o toggle mestre — corte da Etapa 12 que continua, B15) e a unificação da máquina do mínimo/zerado no registro (funciona e é testada; reescrever seria risco sem valor novo — decisão do design da 16)
- [x] Central de alertas no front — Etapa 16, `3eb2c42`/`ed5f032` (tela própria com item de menu; SEM segundo sino no header, decisão da Etapa 12 mantida)
- [x] **Segunda parcela do motor único — modo EVENTO** (Etapa 17, `c1cd0a1`): `dispararAlertaRegistrado(db, chave, linha)` enfileira no ato reusando dedupe/assunto/corpo/payload da MESMA entrada do registro, e os `listar` dos alertas de evento são **dual-mode** (janela para central/varredura, id do fato para o gancho) — uma régua só para os dois caminhos, com o `INSERT OR IGNORE` da fila garantindo que o duplo disparo vire DUPLICADA e que evento perdido seja pego pela varredura
- [ ] Cada alerta novo entra quando a feature correspondente ganhar o dado — **incluir o alerta no checklist da feature dona**. Lacunas nomeadas (medição 2026-08-28), as ÚNICAS que restam **e agora são DUAS**: separado-aguardando-retirada (falta a data da transição p/ PRONTA_PARA_RETIRADA) e consumo-acima-do-previsto (projeto sem orçamento). ~~pedido-parcial (falta noção de saldo do pedido)~~ — **ENTREGUE na Etapa 42** (`dcda360` + a entrada do registro), e o texto riscado registra as duas correções que essa linha já sofreu: o motivo original (*"falta o dado"*) estava desatualizado desde a Etapa 37, o segundo (*"falta a fonte exportada"*) estava certo, e a Etapa 42 removeu o bloqueio em vez de contorná-lo — ver o item do checklist acima
- [x] **Uma entrada do registro pode ler tabela de OUTRO módulo** — Etapa 39, `ddbc18f`: `PEDIDO_COMPRA_ATRASADO` consulta `pedidos_compra`/`fornecedores` (CORE) pelo mesmo handle e importa a régua do módulo Compras por **require lazy**. Precedente aberto de propósito e declarado: o registro deixou de ser exclusivamente do almoxarifado. **O que isso exige de quem escrever a próxima entrada cross-módulo:** projetar as colunas (a central não tem o gate do módulo de origem) e manter o require lazy (o ciclo está a um require de distância)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Alerta dispara na transição de estado, não a cada verificação | `alerta nao repete enquanto condicao persistir` |
| Resolver a condição rearma o alerta | `voltar acima do minimo permite novo alerta futuro` |
| Destinatários respeitam a configuração | `alerta enviado apenas aos destinatarios configurados` |

## Dependências

- 19 (canal de envio) · cada alerta depende da sua feature dona.
