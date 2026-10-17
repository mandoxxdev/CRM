# Etapa 138 (núcleo/propostas): o payload parcial que zera colunas nos `PUT` — design

> Origem: "Próxima tarefa detalhada — Etapa 138" do plano da 137 e o item oferecido e nunca feito de
> `specs/proposta-editavel/CHECKLIST-teste-fix-2026-07-21.md:115` ("varredura por outros endpoints de save com o mesmo risco de payload
> parcial zera colunas não enviadas"). Junto, a **C294** (a renumeração de propostas desfaz no mesmo passo).

## Fase 0 — medido (sonda `scratchpad/e138/sonda-f0.js`: o `index.js` real em pasta vazia, um campo por `PUT`, o banco lido por fora)

| `PUT` | Só um campo | Resultado |
|---|---|---|
| `/api/clientes/:id` | `{telefone}` | **500** `NOT NULL constraint failed: clientes.razao_social` (nada gravado) |
| | `{razao_social}` | **200** e **13 colunas zeradas**: nome fantasia, CNPJ, segmento, telefone, e-mail, endereço, cidade, UF, CEP, contato, observações, **status** (`ativo` → `null`) e **logo** |
| `/api/propostas/:id` | `{status}` | **500** `NOT NULL constraint failed: propostas.titulo` |
| | `{titulo}` | **200** e: cliente → `null`, descrição → `null`, **valor 300 → 0**, condições/prazo/garantia/observações → `""`, **status → `null`**, **revisão 0 → 1**, margem 2 → 0, os 3 contatos, tipo, idioma, moeda, incoterm, unidade de negócio → `null`, e **os 2 itens apagados** |
| `/customizacoes` | `{cliente_email}` | mantém (já conserto: `resolverCamposCustomizacao`) |
| `/itens/descricoes` | um item | mantém o outro (é por item; a primeira medição tinha um item só — refeita com dois, Fase 2 M9) |
| `/clausulas/:id` | `{titulo}`, `{conteudo}` | mantém o outro (`!== undefined`) |
| `/fotos/:id` | `{pos_x}` | mantém (`num(v, atual)`) |
| `/variaveis-manuais` | uma chave | mantém a outra (é por chave) |
| `/api/produtos/:id` | `{nome}`, `{preco_base}` | mantém (`!== undefined ? body : row`) |
| `/api/oportunidades/:id` | `{etapa}` | **500** `NOT NULL constraint failed: oportunidades.titulo` |
| | `{titulo}` | **200** e cliente, descrição, valor, probabilidade, etapa, status → `null` |

**O que cada tela manda** (agente de medição, só leitura, cruzado com o código e conferido pela Fase 2):

- **Propostas** — a única tela viva que grava é `client/src/components/proposta/PropostaForm.js:416` (rota `propostas/editar/:id`). Ela
  manda uma **lista fixa** de campos: nunca carrega nem manda `projeto_id`, `cliente_contato`, `cliente_telefone`, `cliente_email`,
  `idioma`, `moeda`, `incoterm`, `unidade_negocio` → **todo salvamento pela tela zera essas oito colunas** (elas chegam pela clonagem,
  pela geração automática e pela API, e a capa lê o contato). E ela representa "vazio" de dois jeitos: `""`/`null` na maioria, mas
  **`undefined` (a chave some do JSON)** em `tipo_proposta`, `expira_em`, `oportunidade_id`, `data_fechamento` e `responsavel_id` (e o
  `numero_proposta` vazio é apagado do corpo — o servidor já o mantém). O *Tipo* tem a opção "—" e o *Fechamento* é um campo de data —
  **apagá-los manda a chave ausente**. Com "ausente = mantém" no servidor, apagar o tipo pela tela deixaria de apagar: **a tela tem de
  passar a mandar `null`** nesses quatro. `components/PropostaForm.js` e `components/PreviewPropostaEditavel.js` são **código morto**
  (fora das rotas; o segundo só é importado por um teste, `ContratoAnexoDownload.test.js`, com o `put` simulado — Fase 2 M10).
- **Clientes** — `ClienteForm.js:415` manda o **objeto inteiro** lido do `GET` (todas as 14 colunas do `UPDATE`), inclusive depois de
  subir a logo; apagar um campo manda `""` (gravado `""`), tirar a logo manda `logo_url: ''` (gravado `null`). Razão social é obrigatória
  na tela.
- **Produtos** — `ProdutoForm.js:663` manda o objeto inteiro; o servidor já mescla. **A classificação de área não pode ser apagada**: a
  tela cai no valor antigo e o servidor ignora `""` — achado, fica declarado (C297).
- **Oportunidades** — `OportunidadeForm.js`/`Oportunidades.js` são **código morto** (fora das rotas; nem existe `GET /oportunidades/:id`).
  O `PUT` só é alcançável pela API.
- **Status de proposta** pelas listas e pelo detalhe vai por rotas próprias (`POST /enviar`, `/aceitar`…), não pelo `PUT`.
- **Nenhum teste versionado** chama esses três `PUT` ou a renumeração com payload parcial (Fase 2); `numeroPropostaNaoMudaNaRevisao.test.js`
  ancora o `sufixoRev` e a ausência de `gerarNumeroPropostaComVerificacao(` no `PUT` — os dois ficam.

**Uma coluna que a varredura NÃO deve preservar: `html_rendered`.** O `PUT` a grava `null` em todo salvamento. O PDF **não** a usa
(`sempreRegenerarParaPdf = true`, Etapa 82 — dado morto para leitura), mas o bloco que grava o retrato depois de gerar o PDF
(`if (!usouSnapshot && html)`: a coluna, `css_snapshot`, `pdf_gerado_at`, o `snapshot_checksum` e a linha de `proposta_snapshot`) só roda
quando ela está vazia. Mantida no salvamento, o retrato e o "PDF gerado em" ficariam os da primeira geração para sempre. *(A primeira
versão deste design dizia que a limpeza "invalida o retrato do PDF" — estava imprecisa, Fase 2 M8: o PDF sempre regenera; o que a
limpeza mantém vivo é o registro do retrato.)* Presente no corpo (só a tela morta manda) continua gravada como hoje.

## Achado da Fase 0 fora do escopo previsto: o salvamento de proposta com variável manual nunca responde (C296)

O teste vermelho da RN-01a pendurou (20 s sem resposta). O log do servidor: `[FATAL GUARD] uncaughtException: ReferenceError: chaveDe is
not defined`. A religação das variáveis manuais (`religarVariaveisManuais`, commit `3124b01d`, 30/07) usa `chaveDe`, que o `index.js`
**nunca importou** de `propostaItensDiff.js` (a linha 226 importa só `diffItensParaLog, nomeDe, resumoLado, mesclarItensPreservandoCampos`).
Em **todo** salvamento pela tela de uma proposta que tem variável manual preenchida no preview, os itens já foram apagados e reinseridos
com ids novos, a exceção estoura dentro do callback, o guarda do processo a engole e **a requisição nunca responde** (a tela fica em
"salvando"); as variáveis ficam órfãs — o mesmo sintoma que o `3124b01d` dizia corrigir ("salvo e ficam, mas quando adiciono outro
produto, elas zeram"). Conserto de uma linha (importar `chaveDe`), na T2, com o cenário RN-03b.

## Decisões (letra B, reversíveis)

1. **Contrato por porta: ausente = mantém; presente = grava com a transformação de hoje** (o `""` que hoje vira `""` continua `""`, o
   que vira `null` continua `null`). Implementação: o `SET` é montado **só com as colunas presentes** no corpo (não `COALESCE` e não
   "lê e regrava"): a coluna ausente nem entra no comando — não sobrescreve uma gravação concorrente dela. **Descartados:** `COALESCE`
   (não distingue "mandou `null` para limpar" de "não mandou"); ler a linha e regravar tudo (a gravação de outra aba no meio seria
   desfeita). **Fica (Fase 2 I5, D (138)):** as regras que cruzam duas colunas (desconto × status) leem a linha e gravam só uma; duas
   abas pela API, uma mandando só o status e a outra só a margem, podem juntas deixar margem acima de 5% sem aprovação. A tela manda as
   duas juntas, então não é alcançável por ela.
2. **A tela de propostas manda `null`, não ausente, para "vazio"** em `tipo_proposta`, `expira_em`, `oportunidade_id`,
   `data_fechamento` (o `responsavel_id` continua ausente: o servidor já o mantém, e a tela não o apaga). **Descartado:** tratar o
   ausente como "limpa" só nesses quatro no servidor — duas regras por porta, e quem integra pela API não saberia qual vale. A tela vai
   no **mesmo commit** do servidor (Fase 2 M12: sozinho, o servidor deixaria a tela sem conseguir apagar o tipo).
3. **Exceções declaradas no `PUT` de proposta:** `html_rendered` continua limpo em todo salvamento (o retrato, acima);
   `probabilidade` continua `COALESCE` (nulo/vazio mantém — é o de hoje); `responsavel_id` vazio ou ausente continua "o de hoje, ou quem
   salva"; `numero_proposta` ausente continua mantido; `revisao` e `numero_proposta` são calculados e sempre gravados.
4. **`itens` ausente não toca nos itens** (nem apaga, nem reinsere, nem religa as variáveis manuais, nem registra item no histórico);
   `itens` presente segue o de hoje (inclusive `[]`/`null` apagando todos). **A revisão só sobe** se `itens` veio e mudou, ou se
   `valor_total` veio e mudou; o sufixo `REVnn` acompanha pelo **cliente efetivo** (Fase 2 I2: hoje o `if (cliente_id && …)` olha o
   corpo); o registro da revisão (`proposta_revisoes`) compara pelos **valores efetivos** (Fase 2 I3: com o corpo cru, `{valor_total}`
   registrava título, status, cliente… como "(vazio)").
5. **As regras que olham outro campo usam o valor efetivo** (o do corpo se veio, senão o gravado) e só rodam quando um dos campos que elas
   olham veio: o motivo da não venda (status × motivo), o desconto acima de 5% (margem × status) e a data de fechamento automática (status ×
   data). Hoje `{status: 'enviada'}` sem a margem passava a margem a 0 e furava a conferência do desconto; agora a conferência usa a margem
   gravada. Consequências explícitas (Fase 2 I6): `{status: 'enviada'}` numa *rejeitada* limpa o motivo (como hoje: só *rejeitada* guarda
   motivo); `{margem_desconto: 10}` numa *enviada* sem aprovação passa a ser **403** (hoje 200, com o status apagado); `{status:
   'aprovada'}` numa proposta que já tem data de fechamento **mantém** a data (hoje a trocava por hoje).
6. **Obrigatório presente e vazio (ou só espaços) → 400 com a mensagem da criação** (hoje era 500 de banco com `null`, ou gravava `""`):
   razão social — *"Razão social é obrigatória"*; título da proposta e da oportunidade — *"Título é obrigatório"*. As telas já exigem os
   dois. A criação continua como é (`POST` com título só de espaços passa — D (138)).
7. **Corpo sem nenhuma coluna conhecida** (`{}`, `{foo: 1}`) em cliente e oportunidade → 200 e só `updated_at` (Fase 2 I4: o `SET` vazio
   seria erro de SQL). Na proposta, o mesmo corpo → 200, só `updated_at`, `html_rendered` limpo.
8. **Fora:** produtos (já mesclava) e as cinco portas do preview editável (já mantinham — medido). O `PUT` em cliente/oportunidade
   inexistente continua 200 (é o de hoje; D (138)).

## Fase 5 — o que mudou no design (três revisores, executando)

- **A decisão 1 dizia "Fica (D (138))" para a corrida desconto × status entre duas abas pela API — não ficou.** O revisor de permissão a
  reproduziu (5 em 6) e mostrou que **a tela salvando o rascunho com margem 20 mais um pedido só com o status** bastavam (6 em 6); e o mesmo
  padrão com rejeitar × apagar o motivo. Conserto: quando o corpo traz status, margem, motivo ou data de fechamento, o `UPDATE` leva
  `AND <col> IS <lido>` para cada um desses quatro que **não** veio; não casou → 409 `PROPOSTA_ALTERADA`, nada gravado (B896).
- **O número, a revisão e o responsável** eram sempre gravados com o calculado a partir da leitura — uma renumeração feita entre a leitura e a
  gravação era desfeita. Agora só entram quando mudam.
- **A troca de cliente** (revisor de regra): com a tela deixando de apagar os contatos da proposta, a capa da proposta do cliente B saía com o
  contato do cliente A. Agora trocar o cliente apaga contato, telefone, e-mail e projeto da proposta que não vieram (B897).
- **O revisor de sabotagem** mostrou que 51 de 90 sabotagens sobreviviam por falta de cenário (colunas do mapa que nenhum teste escrevia,
  entre outras) — os 20 cenários dele entraram na suíte.

## C294 — a renumeração desfaz no mesmo passo

`POST /api/propostas/renumerar` passa de `db.exec('BEGIN…COMMIT')` + `db.exec('ROLLBACK')` no `catch` para `db.execEmTransacao(corpo)`
(Etapa 137: o `ROLLBACK` na mesma vaga). O `catch` perde o `ROLLBACK`. Teste pela rota com uma falha forçada no último passo (gatilho com
`RAISE(ABORT)`; `RAISE(ROLLBACK)` fecharia a transação sozinho e o código velho passaria) e uma **rajada** de edições de cliente mandada
**junto** com a renumeração. **Medido pelo revisor da Fase 2:** edições espalhadas durante a renumeração não perdem nada — o `exec` do driver
é exclusivo e toda rota autenticada lê o banco antes de gravar, então a leitura espera o `exec` e a gravação entra na fila depois do
`ROLLBACK`; só quem já tinha a leitura em curso quando o `exec` foi agendado perde (rajada: 21 a 24 de 30 respondem 200 e somem). **O texto
da C294 ("as gravações que entraram na fila enquanto ela falhava") vale só para essas — corrigir ao fechar.**
