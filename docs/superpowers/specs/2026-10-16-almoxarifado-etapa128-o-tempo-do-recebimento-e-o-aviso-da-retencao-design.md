# Almoxarifado — Etapa 128: o tempo do recebimento, o aviso da retenção e o perfil que não pisca (design)

> Origem: "Próxima tarefa detalhada — Etapa 128" do plano da 127 (tempo médio de recebimento, feature 21; a **C209**, se couber; e,
> opcional, do núcleo, o perfil que pisca sem recarregar — D (127), r2). Worktree `CRM-wt-e128`, branch `etapa-e128` (a partir da main
> `652fc416`). Numeração conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` (2026-10-16): última B **B822**, último
> C **C265**, última A **A75** → esta etapa **B823+**, **C266+**, **A76+**. A letra E não é numerada (uma regra só, a da remessa mista):
> a régua deduzida desta etapa entra como **segundo item** dela.

## Parte 1 — Tempo médio de recebimento (feature 21)

### Medido (sonda `server/tests/sonda/e128fase0.js`, não versionada, rodada sozinha)

- **Não existe.** O único tempo médio do almoxarifado é o de atendimento de requisição (`reportService.relatorioIndicadores`, bloco
  `atendimento_requisicoes`). A spec 21 (fim, "Etapa 127 — medida") já dizia isso — cruzado, bate.
- **As duas datas têm um escritor cada, e o mesmo formato.** `recebimentos_material_almoxarifado.data_recebimento` só tem o
  `DEFAULT CURRENT_TIMESTAMP` (o único `INSERT` do cabeçalho, `receiptService.criarRecebimento`, não a passa; nenhum `UPDATE` a reescreve;
  o Compras só lê a tabela). `recebimentos_material_itens_almoxarifado.entrada_estoque_em` só é escrita por `darEntradaEstoque`
  (`SET entrada_estoque_em = CURRENT_TIMESTAMP` no claim, antes de mover) e volta a `NULL` só quando o item **não** entrou fisicamente
  (a falha antes do motor); `/processar` e `/aprovar` passam pela mesma função. Medido pela rota: `POST /recebimentos` →
  `data_recebimento '2026-10-16 17:23:05'`; `POST /recebimentos/:id/aprovar` → `entrada_estoque_em '2026-10-16 17:23:05'` — os dois
  `AAAA-MM-DD HH:MM:SS` em UTC, `julianday` direto. (`compras_data`, ISO com `T`, não entra na régua.)
- **Todo item com quantidade entra junto.** `darEntradaEstoque` percorre todos os itens com quantidade > 0 (`quantidadeDoItem`: o `''`
  legado vale a esperada) — não há item que fique de fora por desenho. Recebimento com um item entrado e outro com quantidade sem
  entrada é **a nota que falhou no meio** (espera o reprocessamento).
- **O estorno não limpa** `entrada_estoque_em`; a quarentena começa **na** entrada (o material crítico entra retido) — a inspeção vem
  depois e não muda a data.

### Escolha — a régua (deduzida; vai na letra E para vocês)

Por recebimento: **início** = `data_recebimento` (o registro da chegada no sistema); **fim** = o **maior** `entrada_estoque_em` dos itens
com quantidade > 0 (a última entrada no estoque). Entra **só o recebimento completo** (pelo menos um item entrou e nenhum item com
quantidade espera entrada); o que entrou em parte conta em `incompletos`; o que não entrou nada (em conferência, fiscal, aguardando) não
aparece. **Janela pelo fim** (a última entrada na janela), como os outros blocos da janela. Média e mediana, em horas, 2 casas; **sem
recebimento considerado → `null`** (não 0, que diria "instantâneo"). Material de cliente e material inativado **entram** (é o tempo do
trabalho do galpão, não valor de patrimônio). **Descartado:** (a) do pedido de compra à chegada (é tempo do fornecedor, e o
recebimento sem pedido não teria início); (b) da chegada à liberação da inspeção (só o material crítico passa por ela — duas réguas na
mesma média); (c) `conferencia_finalizada_em` como fim (o recebimento sem conferência formal ficaria de fora); (d) `0` para "sem dados"
(o atendimento usa 0 desde a Etapa 13 — fica como está; o bloco novo não copia o defeito).

**Contrato:** `GET /api/almoxarifado/relatorios/indicadores` ganha `tempo_recebimento: { media_horas, mediana_horas, considerados,
incompletos }`. Nada mais muda (sem chave nova no registro; a `nota` de `indicadores` ganha a régua). O dashboard ganha o cartão
"Tempo médio de recebimento" (só se o bloco vier — servidor antigo mantém os quatro cartões). A tela Relatórios → Indicadores mostra o
bloco sozinha (renderização genérica do payload objeto).

## Parte 2 — C209: a contagem por endereço abaixo do retido não avisa

### Medido (sonda `e128fase0.js` e `e128fase0b.js`)

- **C209 reproduzida:** físico 4 no A, requisição de 4 aprovada (reserva 4) e separada; `AJUSTE` com localização "0 no A" → **201**
  `{"id":3,"saldo_anterior":4,"saldo_posterior":0}` — sem aviso; o material fica `quantidade_atual 0, quantidade_reservada 4`
  (disponível −4). A entrega depois: *"…: não é possível entregar 4 PC. Máximo: 0 (pendente: 4, disponível: 0) — o disponível de … está
  negativo (reservado além do físico): nada dele sai pela entrega até liberar outra reserva deste material"*.
- **O mesmo sem caixa** (o corte da Etapa 10, D (104)): físico 4, reserva 3 não separada, contagem "1 no A" → 201 sem aviso (disponível
  −2); e com **bloqueado** 3, contagem "1" → 201 sem aviso. O ajuste **sem** localização no mesmo estado é recusado (*"Ajuste para 2 PC
  deixaria o disponível negativo (reservada: 3, mínimo aceitável: 3 PC). Resolva a retenção…"*) — é a Etapa 10, inalterada.
- **Enquanto o disponível está negativo, nada sai pela entrega**, mesmo com físico: físico 1, reserva 3 → a separação aceita 3 (o teto
  confia na reserva do item — Etapa 95) e a entrega de 1 diz *"Máximo: 0 … nada dele sai pela entrega até liberar da reserva desta
  requisição o que passa do físico"*.
- **O ponto do aviso existe:** fim de `registrarMovimentacaoSemTrava`, o `aviso_caixa` da Etapa 104 (`ajusteComEndereco`, leitura depois
  do livro, dentro da trava, `try/catch` que nunca derruba). As parcelas da retenção já têm construtor (`motivoRecusaAjustePorRetencao`,
  rótulos da M6) — **extrair as partes**, não duplicar (D1 da Etapa 10).

### Escolha

A resposta do ajuste com endereço ganha `aviso_retencao` (texto literal) quando o disponível depois dele ficou **negativo** e há
retenção (reservada, bloqueada, em inspeção ou em terceiros). Aditivo, como o `aviso_caixa`; a tela de Movimentações mostra num aviso
amarelo que não fecha sozinho. **Descartado:** (a) recusar a contagem (contraria a decisão do cliente — a contagem por endereço redefine
o saldo, Etapa 10; e a B704 já escolheu avisar para a caixa); (b) estender o `aviso_caixa` (a caixa coberta por reserva não é "abaixo da
caixa sem reserva" — misturar as duas réguas confundiria a frase da 104 que está em uso); (c) avisar também quando o disponível fica
exatamente 0 (é o estado normal de material todo reservado).

## Parte 3 — o perfil que pisca sem recarregar (núcleo, D (127) r2)

### Medido (leitura; o r2 da 127 reproduziu)

`getEffectiveUser(authUser)` = `mergeUserPermissions(authUser, cache.usuario)` enquanto o cache de `/usuarios/:id/grupos` vale (5 min);
depois, `authUser` (o do contexto). Quem perdeu o perfil sem recarregar: a tela que relê o cache esconde os botões; 5 min depois o cache
vence e o contexto velho os devolve. `getUsuarioModuleContext` (servidor) manda exatamente as cinco chaves de permissão (`role`,
`is_superadmin`, `admin_modulos`, `perfil_almoxarifado`, `perfil_frota`) ou `null` (usuário inativo).

### Escolha (B, núcleo)

Quando uma busca **real** de `/usuarios/:id/grupos` do **próprio** usuário grava o cache, o `AuthProvider` regrava o usuário do contexto
(e o `localStorage`) com `mergeUserPermissions(atual, usuario)` — o mesmo merge de `getEffectiveUser`, então o que a tela mostra durante o
cache passa a ser o que mostra depois. Sem mudança, nada é regravado. **Descartado:** (a) só os dois perfis (o `role` e o
`admin_modulos` piscariam do mesmo jeito); (b) consulta periódica (mudança de produto); (c) o cache sem validade (perderia a renovação).
