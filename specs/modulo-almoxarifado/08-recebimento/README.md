# 08 — Entrada e Recebimento de Materiais

> **Status:** 🟡 — workflow fiscal NF maduro, quarentena na entrada fechada (Etapa 5), **lote nasce aqui desde a Etapa 6**, entrada da nota **atômica e idempotente** desde o review final do branch (2026-08-10), e desde a **Etapa 36** as duas portas de escrita têm enum, guarda de NF duplicada e barreira de excedente, mais o campo de quantidade conferida na tela. **O que falta para 🟢:** (1) recebimento **parcial e excedente contra o PEDIDO DE COMPRA** — o saldo do pedido não é comparado por ninguém, e um pedido de 10 pode receber 25 em três recebimentos e continuar `ABERTO` (é a **Etapa 37**, já desenhada: `docs/superpowers/specs/2026-09-16-almoxarifado-etapa37-recebimento-contra-pedido-design.md`; **não confundir** com o excedente sobre a `quantidade_esperada` do próprio documento, que esta etapa fechou nas **três** portas); (2) **conferência física estruturada** (contagem, pesagem, medição, checklist por tipo de material); (3) **divergência formal numerada**; (4) definição de localização na entrada (feature 02) e e-mail automático (feature 19). **A frase anterior deste status dizia que faltava "etiqueta" — ESTAVA ERRADA:** a etiqueta foi entregue na **Etapa 6c** (`4ebd1ce`), ver a correção no item de checklist "Ao aprovar" · **Spec original:** seção 8
> **Etapa 31 (2026-08-31, `1e6c9a9..67b6758`) — o NÚMERO deste documento mudou de forma, e só ele.** O `REC-` era montado com os **últimos dígitos** do milissegundo mais um sorteio de 0 a 99, e por isso o carimbo **repetia** a cada **27,78 horas**. Agora vem do gerador único `services/almoxarifado/numeroDoc.js` (relógio inteiro em base36 + 8 aleatórios), com retry na colisão. **Nada mais desta feature mudou** — nem status, nem checklist, nem comportamento: o número passa de 12–14 caracteres só com dígitos para 20 com letras, os antigos **não** foram migrados e continuam legíveis (RN-05, testada). Furo **C41** das novidades.
> **Etapa 34 (2026-09-16, `746a106..054f727`) — o painel do recebimento ganhou ANEXOS, e a tela
> ganhou a PRIMEIRA suíte de teste que já teve.** Bloco "Anexos" no fim do painel de detalhe
> (entidade `recebimento`, id do detalhe) — `01dd3ce` + `c5d9e99` —, mais
> `RecebimentosAlmoxarifado.test.js` com **7 cenários** (contados no arquivo). Zero linhas de
> servidor. A frase "plugar aqui é uma linha", que esta spec repetia desde a Etapa 32, **estava
> errada** — ver a correção no item de checklist de fotos/anexos, que também registra o defeito
> **pré-existente** descoberto aqui (os três `catch` que engolem erro de carga — **fechado na
> Etapa 35**, `22e1d9b`).
> **Etapa 35 (2026-09-16, `6f6a8b0..2d5cd35`) — a tela passou a DIZER quando não conseguiu
> carregar, e o painel parou de mostrar o recebimento anterior.** NÃO é feature nova: são defeitos
> pré-existentes desta tela, achados pela revisão da Etapa 34 e pelas duas lentes da revisão final
> desta. (1) **`22e1d9b`** — os três `catch` de carga engoliam o erro: falha de rede ou 500
> aparecia como *"Nenhum recebimento registrado"*, indistinguível de "não há recebimento", com o
> risco real de registrar de novo uma nota que já existe. Agora a falha vai para o **DOM**
> (*"Não foi possível carregar os recebimentos."* + botão *"Tentar de novo"*), a lista é **zerada**
> na falha (recarregamento que falha não deixa dado velho passando por fresco) e o erro de
> materiais aparece **dentro** do modal de criar (*"Não foi possível carregar a lista de
> materiais."*); `loadAuxiliares` **continua silencioso de propósito**, e o porquê está escrito no
> próprio `catch`. (2) **`4681111`** — trocar de linha mostrava o registro **anterior** sob o id
> novo, e resposta fora de ordem vencia o último clique: fechado com `selectedId` +
> `idCarregadoRef` + `detalheFetchSeqRef`, o molde da tela irmã de Requisições. (3) **`29cbdfa`** —
> consequência do (2) pega pela revisão final: a barra de etapas do cabeçalho piscava para o
> **passo 1** durante a carga; agora fica **neutra**. (4) A tela ganhou aqui os cenários que
> faltavam: `RecebimentosAlmoxarifado.test.js` foi de 7 para **12 cenários** (contados no arquivo,
> `test(` de (a) a (l)). Zero linhas de servidor no range.
> **Etapa 36 (2026-09-16, `d02b9f4..e287a06`) — as DUAS portas de escrita do recebimento
> passaram a recusar o que sempre aceitaram, e a tela ganhou onde dizer QUANTO chegou.** É feature
> desta 08 (servidor + client), não higiene de tela. As duas portas são
> `POST /almoxarifado/recebimentos` e `PUT /almoxarifado/recebimentos/:id/fiscal`; a terceira
> (quantidade contra o **pedido** no POST) ficou declarada fora e é a Etapa 37.
> **(1) `d02b9f4` — enum de `tipo_recebimento` nas duas portas.** `TIPOS_RECEBIMENTO` (fonte única
> em `schema.js`) validado por Zod `z.looseObject` nos dois schemas, literal
> *"forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)"*. O `z.looseObject` **não** é
> preciosismo: `z.object` faz *strip* de `nota_fiscal` e `itens`, e todo POST válido viraria 400
> *"Inclua ao menos um item"* — medido por sonda antes de escrever. Sonda que gravava
> `'BANANA<script>'` com 201 passou a 400.
> **(2) `ffc5f47` + `c5f14c8` — a mesma NF do mesmo fornecedor não entra duas vezes.**
> `assertNotaNaoDuplicada` **no serviço** (`receiptService.js`), antes do `INSERT` da criação e do
> `UPDATE` do fiscal, com 409 *"Nota fiscal {nf} já lançada no recebimento {numero} para este
> fornecedor"*. Dano medido antes: a mesma NF em dois documentos creditava **20** em vez de 10 e
> gerava **2** contas a pagar.
> **(3) `f747df4` + `3e36af4` + `230baf6` + `2d7787d` + o F5 da onda (`17c4130`) — receber mais
> que o esperado exige autorização.** Ação nova `autorizar_excedente` em `ACAO_PERFIS`
> (`[ADMINISTRADOR, COMPRAS]`), checada **no serviço** (`assertExcedentePermitido`) nas **três**
> portas que escrevem quantidade recebida — `criarRecebimento`, `/conferir` e `/fiscal`: 400
> nomeando quem autoriza sem a flag, 403 nomeando a ação e o perfil sem a permissão, e trilha
> `EXCEDENTE_AUTORIZADO` por item excedente. A T3 cobria **duas**; a terceira entrou na
> re-revisão da onda, ver o item de checklist.
> **(4) `9d19e7d` — `avancar etapa fora de ordem falha`**, a régua de workflow que esta spec exigia
> desde 2026-08-11 (`recebimentoWorkflowOrdem.api.test.js`, zero linhas de produção).
> **(5) `e2a23a9` + `d02744a` + `e287a06` — o campo "Qtd. conferida" por item no painel**, com o
> aviso *"Divergência: N a menos/a mais que o esperado (E)"*, o botão "Salvar Conferência" (a rota
> `PUT /:id/conferir` **nunca tinha tido chamador**) e a caixa de autorizar excedente visível só
> para quem tem a ação.
> **(6) `d90853d` — os itens do POST passaram a ser validados** (`quantidade` e
> `quantidade_esperada` numéricas e positivas): mandar `quantidade_esperada: 'abc'` era a forma de
> **desligar** a barreira de excedente daquele item em silêncio.
> **(7) `5ce3fdf` — `fecharDetalhe` zera `loadingDetalhe`** nas duas telas (o resíduo que esta spec
> nomeou como item da Etapa 36), **declaradamente sem régua** e com controle positivo executado:
> placar idêntico com e sem a linha.
> **(8) `aa39155` — integração** das três guardas em cinco pontos de chamada, pela rota e pelo
> serviço.
> **A revisão adversarial final (duas lentes independentes) convergiu num CRÍTICO** que nenhuma
> suíte via: o documento cujo excedente havia sido **autorizado** na conferência **nunca mais
> salvava dados fiscais** (o modal de NF reenvia a quantidade de todos os itens e não tem caixa
> nenhuma) e morria no `processar` — documento **preso**. Consertado em `230baf6`+`2d7787d`, com a
> regra unificada: a barreira só dispara quando `recebida > esperada` **E** `recebida > quantidade
> já gravada`, e a trilha só é escrita quando a barreira disparou e foi autorizada. **E a
> re-revisão dessa onda achou o efeito colateral do próprio conserto (F5):** a regra certa removeu
> um bloqueio **acidental** que o `/fiscal` dava a um recebimento criado por API já com quantidade
> acima da esperada — 201 → 200 → 200 → processável, sem flag, sem permissão e sem trilha. A
> barreira passou a valer também em `criarRecebimento`. **Re-revisar o conserto de um crítico não é
> zelo:** esse defeito **não existia** quando as duas lentes rodaram.
> **Última atualização:** 2026-09-16 (Etapa 36 — enum, NF duplicada, barreira de excedente,
> quantidade conferida na tela e a régua do workflow; antes: 2026-09-16, Etapa 35 — erro de carga visível, painel que não mente e
> barra de etapas neutra; antes: 2026-09-16, Etapa 34 — anexos no painel + primeira suíte da tela;
> antes: 2026-08-11 — **auditoria spec×código**: corrigida a afirmação — que estava
> errada — de que a rota de certificado não tinha tela; registradas a entrada atômica/idempotente e
> a exigência de lote do review final de 2026-08-10, que só a spec 10 documentava; tabela de testes
> ganhou coluna de estado porque cinco linhas citavam testes que não existem; refs de linha
> defasadas trocadas por nomes de função/rota. Antes: 2026-08-09, Etapa 6 — o lote nasce no
> recebimento e `controle_certificado` deixou de ser `SELECT` morto)

## Objetivo

Todos os tipos de entrada da spec, conferência documental e física estruturadas, divergências, etiqueta, endereçamento na entrada e e-mail automático.

## O que já existe

- Tabelas `recebimentos_material_almoxarifado` (+25 colunas fiscais: chave NFe, CFOP, ICMS/IPI, frete, contas_pagar_id, etapa_atual) + itens (quantidade esperada/recebida, conferência, lote, valores) — `schema.js`, procure pelos `CREATE TABLE` dessas duas tabelas (a ref numérica antiga apontava para outra região do arquivo).
- Workflow em 4 etapas com 11 status: Almoxarifado → Compras → Faturamento → Contas a Pagar (`receiptService.js`; rotas em `routes/almoxarifado/extended.js`: `POST/GET /recebimentos`, `PUT /recebimentos/:id/conferir`, `POST /recebimentos/itens/:itemId/inspecionar`, `POST /recebimentos/:id/aprovar`, `POST /recebimentos/:id/workflow`, `PUT /recebimentos/:id/fiscal`, `POST /recebimentos/:id/processar`).
- Inspeção por item: `inspecoes_recebimento_almoxarifado` (conforme, divergências, certificado ausente, dano, ação).
- Front: `RecebimentosAlmoxarifado.js` com o workflow completo; cross-links nos menus de Compras e Financeiro.
- Vínculo a pedido de compra e fornecedor (`itens_pedido_compra`, rotas aux).
- Testes de serviço: recebimento + workflow NF → contas a pagar.
- **Etapa 5 (2026-08-08):** entrada de material que exige inspeção deixou de ser barrada. Antes,
  `darEntradaEstoque` recusava aprovar o recebimento de item crítico sem inspeção prévia
  ("Item crítico #N requer inspeção") — o material não existia no sistema mesmo já estando
  fisicamente no galpão. Agora a entrada acontece sempre e o item que exige inspeção
  (`material_critico = 1` na ficha do material + config `inspecao_material_critico = '1'`, que
  já nasce ligada por padrão) entra **retido**: sobe o físico (`quantidade_atual`) e
  `quantidade_em_inspecao` juntos, via movimentação `QUARENTENA` vinculada ao recebimento
  (`recebimento_id`) — fora do disponível, mas dentro do físico. Item comum continua entrando
  direto no disponível, sem mudança (`4db5e11`).
- **Etapa 6 (2026-08-09):** **é aqui que o lote nasce.** Antes, `RecebimentosAlmoxarifado.js` não
  mencionava lote em lugar nenhum, embora a coluna `lote TEXT` existisse no item e o backend a
  repassasse ao motor — ou seja, o ponto em que um lote naturalmente nasce (a NF do fornecedor) era
  justamente o que não conseguia registrá-lo. Agora:
  - o item de recebimento ganhou **quatro** colunas de lote — `lote_id`, `data_validade_lote`,
    `data_fabricacao_lote` e `corrida_lote` — mais a marca de idempotência `entrada_estoque_em`
    (bloco `recebItemCols` em `schema.js`), preenchíveis na tela por **quatro** campos por item
    (Lote / Validade / Fabricação / Corrida, inputs por item e payload dos dados fiscais em
    `RecebimentosAlmoxarifado.js`) — `9406bff`. **Correção da auditoria de 2026-08-11:** esta
    linha dizia "três colunas / três campos" e citava números de linha; ficou desatualizada no
    review final do branch (2026-08-10), quando `data_fabricacao_lote` ganhou escritor e leitor
    (`a3afaa1`, ver spec 10) e `entrada_estoque_em` nasceu (`6bb455d`, ver bullet abaixo);
  - `receiptService.darEntradaEstoque` chama
    `lotService.criarOuObterLote` **antes** do motor, herdando fornecedor, NF, corrida e validade,
    e passa `lote_id` para a movimentação `ENTRADA_COMPRA`. A criação fica dentro do `if (qtd > 0)`
    de propósito: item com quantidade zero não move estoque, então não cria lote — `64686b1`;
  - **`controle_certificado` deixou de ser flag morta.** O `SELECT` dos itens em
    `darEntradaEstoque` fazia `SELECT … m.controle_certificado` e **nunca usava a coluna
    selecionada** — quem auditasse por `grep controle_certificado` achava aquela linha e concluía
    que a entrada verificava certificado. Não verificava. Agora, material com a flag ligada faz o
    lote **nascer `BLOQUEADO`** com motivo "Certificado do fornecedor nao anexado" (dentro de
    `darEntradaEstoque`, na criação do lote).
    A **entrada não é barrada** — barrar a entrada foi exatamente o erro corrigido na Etapa 5; o
    material entra fisicamente e é a **saída** que fica travada até o certificado chegar;
  - `POST /api/almoxarifado/lotes/:id/certificado` (`routes/almoxarifado.js:623`, perm.
    `receber_material`, `requirePermission` **antes** do multer, aceita PDF e imagem) anexa o
    arquivo e libera **só** o bloqueio que era de certificado — a pré-condição inteira mora dentro
    do `WHERE` de `lotService.liberarBloqueioPorCertificado`, porque decidir fora dele abria uma
    corrida que liberava lote `REPROVADO` por engano (`c11db85`).

  > ⚠️ **Correção (auditoria de 2026-08-11): a primeira das "duas ressalvas honestas" abaixo
  > estava ERRADA.** Este parágrafo dizia que *"não há tela que chame essa rota de certificado
  > depois do recebimento"*. Falso desde a **Task 9** (`09c75d2`, 2026-08-09): a tela
  > `LotesAlmoxarifado.js` (menu Almoxarifado → Lotes) anexa certificado via
  > `POST /lotes/:id/certificado` — a própria spec 10 marca a pendência (a) como **resolvida**
  > pela Task 9, e esta spec seguiu afirmando o contrário. Fica registrado o texto original,
  > riscado, em vez de apagado em silêncio:

  Duas ressalvas honestas: ~~**não há tela que chame essa rota de certificado** depois do
  recebimento (ver pendência (a) da spec 10)~~ *(errado — ver a correção acima)*, e
  `recebimentos_material_itens_almoxarifado.lote_id` tem escritor mas ainda nenhum leitor
  (continua verdade — é a pendência (f) da spec 10, verificada por grep em 2026-08-10).

- **Review final do branch (2026-08-10, `6bb455d`) — a entrada da nota é atômica e idempotente.**
  Mudança **desta** feature que, até esta auditoria, só a spec 10 documentava.
  `receiptService.darEntradaEstoque` percorria os itens chamando o motor um a um, sem pré-checagem
  e sem marca: se o item B falhasse, os anteriores já tinham entrado, e reprocessar a nota
  creditava o item A **de novo** (reproduzido no review: A ficou com 20 em vez de 10). Agora:
  - **pré-checagem da nota inteira antes de mover qualquer coisa** — material inativo,
    `controle_lote` sem lote digitado, localização de destino bloqueada ou que não aceita o tipo
    do material: nota com um item ruim é recusada **inteira**, sem ter movido nada;
  - **claim por item**: cada item é reclamado por
    `UPDATE … WHERE entrada_estoque_em IS NULL` **antes** de mover — item que já entrou não entra
    de novo, então reprocessar não duplica estoque. A marca é devolvida se a falha acontecer
    **antes** da entrada física; depois dela, não (creditar duas vezes é pior do que deixar a
    `QUARENTENA` daquele item por fazer).
  - Testes: `server/tests/api/recebimentoEntradaAtomica.api.test.js` (5 casos, incluindo
    `A entra e B falha: reprocessar entra so o B, e o A continua em 10 (nao 20)`).
- **Review final do branch (2026-08-10): o recebimento também EXIGE lote para material com
  `controle_lote`.** `darEntradaEstoque` declara `exigeLote: true` ao motor, e a pré-checagem
  acima recusa a nota inteira quando um item de material controlado vem sem lote digitado. Teste:
  `[recebimento] nota com item sem lote em material controlado e recusada inteira` —
  `server/tests/api/loteControleObrigatorio.api.test.js`. O alcance completo de `controle_lote`
  (onde exige, onde é isento de propósito) está documentado na spec 10.
- **Etapa 36 (2026-09-16, `d02b9f4..e287a06`) — as três guardas das duas portas, com as regras
  exatas.** Todas moram **no serviço** (`receiptService.js` / `schemas.js`), não na rota, porque a
  rota não é o único chamador possível:
  - **Enum** — `TIPOS_RECEBIMENTO` é `string[]` exportado de `schema.js` (fonte única) e consumido
    pelos dois schemas Zod (`RecebimentoCreateSchema` e `RecebimentoFiscalSchema`, os dois
    `z.looseObject`). Literal congelada numa constante só (`TIPO_RECEBIMENTO_INVALIDO`).
    **Limitação declarada:** o enum é checado no **schema da rota**, não dentro de
    `criarRecebimento` — quem chamar o serviço direto grava `tipo_recebimento` cru (afirmado por
    asserção de caracterização na T7; hoje os únicos chamadores são as duas rotas validadas).
  - **NF duplicada** — `assertNotaNaoDuplicada(db, dados, recebimentoId?)`. Busca os candidatos
    pela NF normalizada (`UPPER(TRIM(nota_fiscal))`, com `AND id <> ?` no `/fiscal` para o
    documento não se autoacusar) e compara o **fornecedor em JS**, casando se **QUALQUER** perna
    casar: mesmo `fornecedor_id`; ou mesmo CNPJ **só dígitos**
    (`String(v).replace(/\D+/g, '')`); ou mesmo nome por
    `normalize('NFD').replace(/\p{M}+/gu, '').toUpperCase().trim().replace(/\s+/g, ' ')`. Perna
    vazia não casa. NF vazia/nula não é duplicata, e fornecedor não identificado (id, CNPJ e nome
    os três vazios) também não. O índice é **`CREATE INDEX` NÃO-único de propósito** — produção
    pode já ter duplicatas, e a consulta de diagnóstico é a **letra A9** do doc de novidades.
  - **Excedente** — `assertExcedentePermitido(db, user, recebimentoId, itens, autorizado)` nas
    **três** portas que escrevem quantidade recebida: `criarRecebimento` (o `POST`),
    `PUT /:id/conferir` e `PUT /:id/fiscal`. Barra o item quando `recebida > esperada` **E**
    `recebida > quantidade_recebida já gravada` (no `POST` não há quantidade gravada, então vale só
    a primeira metade); a trilha `EXCEDENTE_AUTORIZADO` (entidade `recebimento_item`) só é escrita quando a
    barreira disparou **e** foi autorizada. Sem a flag: **400**
    *"Quantidade recebida (N) maior que a esperada (E) no item #ID — a autorização de excedente é
    de Compras ou do Administrador"*. Com a flag e sem a permissão: **403** *"Autorizar recebimento
    acima do pedido exige a permissão "autorizar_excedente" (seu perfil: X)."*
  - **Itens do POST** — `RecebimentoItemSchema` (`z.looseObject`) exige `quantidade` numérica
    positiva e aceita `quantidade_esperada` positiva opcional. Literais:
    *"quantidade do item deve ser um número maior que zero"* e *"quantidade esperada do item deve
    ser um número maior que zero"*. **Isto é mudança de contrato do `POST`** para qualquer cliente
    externo que mandasse quantidade não numérica; os 9 arquivos de teste internos que criam
    recebimento pela rota passaram sem alteração.

  **Pendências nomeadas nesta etapa, nenhuma silenciosa:**
  1. **A terceira porta (`POST`) fechou PARCIALMENTE, e o recorte importa.** A T3 pôs a barreira em
     **duas** portas (`/conferir` e `/fiscal`) e declarou o `POST` fora (decisão **B84**); a
     re-revisão da onda (**F5**) mostrou que isso deixou um caminho **inteiramente aberto** e o
     fechou: hoje o `POST` também barra excedente. **O que continua aberto e é a Etapa 37** é coisa
     diferente e não deve ser confundida: o **saldo contra o PEDIDO DE COMPRA**. A barreira desta
     etapa compara com a `quantidade_esperada` **do próprio documento**; ninguém compara com o que
     o pedido ainda tem a receber — um pedido de 10 pode receber 25 em três recebimentos e
     continuar `ABERTO`. Design commitado em `5f03afc`, plano em `9790b07`.
  2. **A guarda de NF não é airtight** — é *check-then-insert* sem transação: dois `POST`
     simultâneos com a mesma NF passam os dois. O CRM tem uma conexão SQLite só e `ROLLBACK`
     desfaria escrita alheia; fecha de verdade na migração para Postgres. Nomeada na letra G do doc
     de novidades.
  3. **A consulta A9 SUB-REPORTA duplicatas por acento** — ela roda em SQL, e o `UPPER` do SQLite é
     ASCII-only; `'José Aços'` × `'Jose Acos'` **não** aparecem como par. O número que ela devolver
     é **piso**, não total. A guarda em JS cruza os dois; a consulta, não.
  4. **O 400 do excedente nomeia só o PRIMEIRO item excedente**, enquanto a trilha grava uma linha
     por item: quem corrige o item A e reenvia pode tomar um 400 novo pelo item B.
  5. **`PUT /:id/conferir` não tem `validate()`** — quantidade em **texto** é aceita pela rota. A
     barreira usa `parseFloat` + `isFinite` e portanto não quebra, mas grava o que vier. É
     **pré-existente**, e o `d90853d` fechou só o lado do `POST`: a mesma família de defeito, outra
     porta.
  6. **Resíduo do aviso de divergência:** diferença **abaixo de `0,00005`** continua sendo exibida
     como `0`. O `e287a06` mudou o piso de 2 para 4 casas, não para infinito — a régua é o
     arredondamento, e ele sempre tem um piso.
  7. **`fornecedor_id` `'0'` casaria uma coluna nula** na comparação por id
     (`Number('0') === Number(null)` dá `0 === 0`). **Inalcançável pela UI** — não existe fornecedor
     com id 0 —, registrado aqui para não ser descoberto como surpresa por quem chamar o serviço
     direto.

## Checklist

### Backend
- [x] Tipos de entrada (spec 8.1): materiais de cliente, consignado, retorno de industrialização/fornecedor/assistência, devolução da produção, transferência, fabricado internamente, sobra/retalho, ajuste, ferramenta, produto acabado — hoje o recebimento é só de NF de compra (os demais entram pelas features 11/12/13/14/15). **Fora do escopo da Etapa 5** (design 2026-08-07): decisão explícita de deixar para quando houver demanda real de um tipo específico.
  > **`[x]` PARCIAL, e o recorte está dito aqui para não parecer marcação folgada — Etapa 36,
  > `d02b9f4`.** O que o ponto (3) da correção abaixo definiu como *"a tarefa real desta linha"*
  > está **feito**: o enum dos dois tipos que o recebimento de fato faz (`NOTA_FISCAL`,
  > `PEDIDO_COMPRA`) está fechado em `TIPOS_RECEBIMENTO` (fonte única em `schema.js`) e **validado
  > nas duas portas de escrita** — `POST /almoxarifado/recebimentos` e
  > `PUT /almoxarifado/recebimentos/:id/fiscal` —, com a literal
  > *"forma de recebimento inválida (use NOTA_FISCAL ou PEDIDO_COMPRA)"*. Antes disso o valor do
  > body era gravado cru: `'BANANA<script>'` entrava com 201 (sonda executada).
  > **O que NÃO está feito, e não é código:** ampliar a lista para os dez tipos da spec 8.1
  > continua sendo **decisão de negócio**, e esbarra no ponto (2) — as features 11–15 estão 🟢 e
  > **já são a porta** dos outros tipos; replicá-los aqui criaria uma segunda porta. Enquanto essa
  > decisão não vier, esta linha está fechada no que dependia de código.
  > **Sem backfill do acervo:** a validação vale só para escritas novas, e o `tipo_recebimento`
  > fora do enum que já estiver gravado continua gravado (letra **A10** do doc de novidades leva a
  > consulta de diagnóstico). O modal fiscal **deixou de ecoar** o campo (`41df1cb`), justamente
  > para que uma linha de acervo fora do enum não tomasse 400 em toda gravação fiscal.
  > **CORREÇÃO (Fase 0 da Etapa 27, medida em 2026-08-29): esta linha dizia "aqui: campo
  > `tipo_entrada` + validações por tipo", e ESTAVA ERRADA nas duas metades.**
  > ⚠️ **Correção da Etapa 36: as TRÊS refs de linha deste bloco apodreceram, e uma delas já
  > apontava para outra coisa.** `schema.js:1147` — **estava errado** em 2026-09-16 (a coluna
  > `tipo_recebimento` estava em `:1229`); `extended.js:765` — **estava errado** (`:765` passou a
  > ser a `POST /movimentacoes/v2`, ou seja, a ref não só envelheceu, ela passou a **mentir**; a
  > rota do recebimento estava em `:973`); `receiptService.js:281` — **estava errado** (o
  > `tipo_recebimento = COALESCE(?, tipo_recebimento)` estava em `:286`). **Não estamos trocando
  > número por número:** as três passam a ser citadas pelo **nome** do `CREATE TABLE`, da rota e da
  > função, que é o que sobrevive a um commit — o mesmo movimento que a Etapa 35 fez no seu F3, e a
  > terceira vez que uma ref de linha apodrecida aparece nesta base. Os números ficam escritos aqui
  > **de propósito**, riscados pela frase acima, para que quem já confiou neles reconheça o erro em
  > vez de achar que a linha mudou sozinha.
  > **(1) O campo não se chama `tipo_entrada` e ele JÁ EXISTE**: é `tipo_recebimento`
  > (o `CREATE TABLE recebimentos_material_almoxarifado` em `schema.js`,
  > `TEXT DEFAULT 'NOTA_FISCAL'`), gravado por `criarRecebimento`
  > (`receiptService.js`), e há um `<select>` para ele na tela
  > (`RecebimentosAlmoxarifado.js`, modal de novo recebimento). Procurar por `tipo_entrada` no código não acha **nada** —
  > é exatamente o modo de errar que já custou duas etapas nesta base (medir ausência pelo nome
  > que se imagina, em vez do nome do **contrato**).
  > **(2) Os outros tipos JÁ TÊM PORTA, e construí-los aqui criaria uma segunda.** Esta linha diz
  > que os demais "entram pelas features 11/12/13/14/15" mas não registra que **as cinco estão
  > 🟢** (mapa, linhas 598-602): transferências, devoluções, materiais de clientes, terceiros e
  > retalhos/sucatas foram todas entregues. Lido de fora, o item parece dizer que esses tipos não
  > têm caminho. Têm — e replicá-los como tipos de recebimento é exatamente o erro de **segunda
  > porta** que a Etapa 24 quase cometeu.
  > **(3) O que falta de verdade não é o campo: são os VALORES e a VALIDAÇÃO.** O campo aceita hoje dois
  > valores por convenção (`NOTA_FISCAL` e `PEDIDO_COMPRA`) e **não é validado em lugar nenhum** —
  > não há enum, não há Zod (`schemas.js` não tem schema de recebimento) e a rota
  > `POST /api/almoxarifado/recebimentos` (em `routes/almoxarifado/extended.js`) tem **só** o gate
  > `requirePermission('receber_material')`, sem `validate(...)`. O valor do body é gravado cru:
  > qualquer string entra na coluna. **A tarefa real desta linha é**: fechar o enum dos tipos
  > que o recebimento de fato faz hoje e validá-lo nas **duas** portas de escrita — o `POST` e o
  > `PUT /:id/fiscal` (`salvarDadosFiscal`, em `receiptService.js`, o
  > `tipo_recebimento = COALESCE(?, tipo_recebimento)` do `UPDATE`),
  > senão a validação é contornável por um `PUT`. Ampliar a lista para os dez tipos da spec 8.1 é
  > **decisão de negócio**, não código, e esbarra no ponto (2).
  > **↑ ESTE PARÁGRAFO DESCREVE O ESTADO ATÉ 2026-09-16 (Etapa 27).** A tarefa que ele nomeia foi
  > cumprida na **Etapa 36** (`d02b9f4`) — fica no lugar porque é o diagnóstico que gerou a tarefa,
  > e apagá-lo esconderia o motivo de o enum existir.
  > **Medido no banco de desenvolvimento: zero recebimentos gravados** — não há acervo a migrar,
  > e um enum aplicado agora não invalida dado nenhum.
- [ ] Recebimento parcial de pedido (validar suporte real + saldo pendente do pedido)
  > **Continua desmarcado, e o motivo está MEDIDO (Fase 0 da Etapa 37, 2026-09-16) — não é
  > esquecimento nem falta de tempo:** `itens_pedido_compra` tem 8 colunas, **1 leitor**
  > (`receiptService.js`, o `SELECT` que traz os itens do pedido) e **0 escritores**; não existe
  > coluna de `quantidade_recebida` acumulada, então não há onde o saldo pendente morar. A tela
  > **nunca carrega** os itens do pedido (o handler de seleção de pedido em
  > `RecebimentosAlmoxarifado.js` limpa `itens: []`), logo o parcial é impossível **pela tela**. E
  > um pedido de 10 que recebeu 25 em três recebimentos fica `ABERTO` com `quantidade = 10`. Isto
  > é a **Etapa 37**, já desenhada e commitada:
  > `docs/superpowers/specs/2026-09-16-almoxarifado-etapa37-recebimento-contra-pedido-design.md`
  > (design `5f03afc`) + `docs/superpowers/plans/2026-09-16-almoxarifado-etapa37-recebimento-contra-pedido.md`
  > (plano `9790b07`). Escopo: migration aditiva sem backfill (acumulador + situação do pedido), a
  > barreira de excedente na **terceira porta** reusando `assertExcedentePermitido`, e o client
  > carregando os itens do pedido. Acervo com `COUNT = 0` nas três tabelas — sem migração de dado.
- [x] Recebimento excedente só com autorização — **`f747df4`** + **`3e36af4`** + **`230baf6`** +
      **`2d7787d`** + o F5 da onda de correção (hash no `git log`: `17c4130`) — Etapa 36,
      2026-09-16. Ação nova `autorizar_excedente` em `ACAO_PERFIS`,
      **`[ADMINISTRADOR, COMPRAS]`**, checada **no serviço** (`assertExcedentePermitido`) nas
      **três** portas que escrevem quantidade recebida: `criarRecebimento` (o `POST`),
      `PUT /:id/conferir` e `PUT /:id/fiscal`. Sem a flag → 400
      *"Quantidade recebida (N) maior que a esperada (E) no item #ID — a autorização de excedente é
      de Compras ou do Administrador"*; com a flag e sem a permissão → 403 nomeando a ação **e o
      perfil**; trilha `EXCEDENTE_AUTORIZADO` (entidade `recebimento_item`) por item excedente.
      **O ALMOXARIFE ficou de fora de propósito:** quem recebe não autoriza o próprio excedente.
      > ⚠️ **O design desta etapa dizia *"GESTOR → 200"*, e ESTAVA ERRADO** — e errado por
      > **inconsistência interna**, porque ele mesmo havia medido o gate e escreveu o contrário. A
      > lista desenhada era `[ADMINISTRADOR, GESTOR, COMPRAS]`, mas as duas portas são gateadas por
      > `receber_material` = `[ADMINISTRADOR, ALMOXARIFE, COMPRAS]`: o GESTOR tomava **403 antes de
      > chegar ao serviço**, e a entrada dele na lista era **configuração morta**. Corrigido em
      > `3e36af4`. **Descartado:** alargar `receber_material` (entregaria o fluxo inteiro de
      > recebimento ao GESTOR) e abrir um *carve-out* de rota. Se o negócio decidir que o GESTOR
      > autoriza excedente, isso exige **rota própria** — é etapa própria (letra **B82** do doc de
      > novidades).
      > ⚠️ **E a regra escrita na T3 ESTAVA INCOMPLETA — foi o CRÍTICO desta etapa.** Ela comparava
      > a quantidade do **payload** com a **esperada** e nada mais; como o modal de NF reenvia a
      > quantidade de **todos** os itens e não tem caixa de autorização nenhuma, o documento cujo
      > excedente já havia sido autorizado na conferência **nunca mais salvava dados fiscais** e
      > morria no `processar` — documento **preso** —, e toda linha de acervo com
      > `recebida > esperada` travaria no primeiro deploy. Pelo mesmo motivo, depois do primeiro
      > excedente autorizado **todo** "Salvar Conferência" seguinte tomava 400, e a trilha ganhava
      > uma linha nova a cada save. Regra corrigida nas **duas** portas (`230baf6` + `2d7787d`): a
      > barreira só dispara quando `recebida > esperada` **E** `recebida > quantidade já gravada`, e
      > a trilha só é escrita quando a barreira disparou e foi autorizada. **`> gravada`, não
      > `!== gravada`:** baixar 25 → 20 num item de 10 não é ato novo de autorização. **Descartado:**
      > mandar o client reenviar a flag (não cobre o acervo) e tirar a quantidade do payload fiscal
      > (o fiscal é o escritor real de quantidade em produção).
      > ⚠️ **E a T3 cobria DUAS portas, não três — o que a re-revisão da onda (F5) mostrou é que
      > isso deixava um caminho inteiro aberto.** Com a regra certa (`> esperada` **E**
      > `> gravada`), um recebimento **criado por API** já com `quantidade_recebida` acima da
      > esperada passa a ter aquela quantidade **como gravada**: `POST` 999/10 → **201**, `/fiscal`
      > → **200**, `/conferir` → **200**, documento **processável** — **sem flag, sem permissão e
      > sem uma linha de trilha**. Antes do conserto do crítico, o `/fiscal` barrava isso **por
      > acidente** (tratava o eco como ato novo), e era esse acidente que segurava o caminho; a
      > regra correta o removeu. A tela **nunca** produz esse payload, e é justamente por isso que
      > nenhum cenário de client o alcançaria. **Conserto:** a mesma barreira passou a valer em
      > `criarRecebimento` — 400 com a literal sem a flag, 403 nomeando a ação e o perfil sem a
      > permissão, e **201 + trilha por item** quando autorizado. **Consequência para a decisão
      > B84:** a "terceira porta" declarada fora fechou **parcialmente** — o excedente sobre a
      > **esperada do próprio documento** está fechado nas três portas; o que fica para a **Etapa
      > 37** é o **saldo contra o PEDIDO DE COMPRA**, que é outra comparação (contra
      > `itens_pedido_compra`) e tem literal própria.
- [x] Itens do `POST /recebimentos` validados — **`d90853d`** (Etapa 36): `RecebimentoItemSchema`
      (`z.looseObject`) exige `quantidade` numérica positiva e aceita `quantidade_esperada`
      positiva opcional. Antes, `quantidade_esperada: 'abc'` era **gravado como texto** e a
      barreira de excedente fazia `continue` — mandar `'abc'` era a forma de **desligar** a RN-18
      para aquele item, em silêncio. Literais: *"quantidade do item deve ser um número maior que
      zero"* e *"quantidade esperada do item deve ser um número maior que zero"*.
      **Ponto de atenção: isto é MUDANÇA DE CONTRATO do `POST`** — cliente externo que mandasse
      quantidade não numérica passa a tomar 400. Os 9 arquivos de teste internos que criam
      recebimento pela rota passaram sem alteração.
- [ ] Conferência física estruturada (spec 8.3): contagem, pesagem, medição, checklist configurável por tipo de material. **Fora do escopo da Etapa 5**, mesma decisão acima.
  > **Continua desmarcado, e agora com um recorte exato (Etapa 36):** a **quantidade conferida** por
  > item passou a existir (campo "Qtd. conferida" no painel, `e2a23a9`; ver o item de frontend
  > abaixo), com o aviso de divergência e a gravação pela rota `PUT /:id/conferir`. **Contagem
  > estruturada, pesagem, medição e checklist configurável por tipo de material continuam não
  > existindo** — não há tabela de checklist, não há campo de peso nem de medida, e nada disso foi
  > tocado aqui. O que a Etapa 36 entregou é o **dado de entrada** que faltava (quanto chegou de
  > fato), não a conferência estruturada.
- [x] Fotos do recebimento (`anexos_documento_almoxarifado` entidade `recebimento`) — **`01dd3ce`** + **`c5d9e99`** (Etapa 34, 2026-09-16): bloco **Anexos** inline no fim do painel de detalhe do recebimento, entidade `recebimento` com o id do detalhe carregado. Quem acaba de registrar um recebimento cai no painel e já anexa a nota fiscal sem sair da tela (cenário testado). **Esta tela ganhou aqui a primeira suíte de teste que já teve** — `client/src/components/almoxarifado/RecebimentosAlmoxarifado.test.js`, **7 cenários**: (a) uma linha por recebimento, (b) o clique abre o painel do recebimento clicado, (c) o bloco consulta `entidade=recebimento` com o id DO DETALHE, uma vez, (d) lista fechada não consulta anexos (100 recebimentos ≠ 100 requisições — RN-02), (e) trocar de linha refaz a consulta com o novo id, (f) depois de registrar, o painel do recém-criado já traz o bloco com o id devolvido pelo POST, (g) refetch por ação de workflow não desmonta o bloco nem repete a consulta. **Na Etapa 35 essa suíte foi de 7 para 12 cenários** — (h) a (l), ver o item de erro de carga abaixo.
      **Etapa 32 (`e708125..fd71958`): o MECANISMO existe, está testado, e falta SÓ o plug desta
      tela.** A entidade é `recebimento` — e a tabela por trás é `recebimentos_material_almoxarifado`, não `recebimentos_almoxarifado`, que é o nome que a intuição erra.
      A `anexos_documento_almoxarifado` era **órfã** — zero leitor, zero escritor, sem índice —,
      e virou `services/almoxarifado/anexoService.js` (mapa fechado de seis entidades,
      existência do registro-pai verificada, soft delete, auditoria) mais as rotas
      `POST/GET/DELETE /almoxarifado/anexos` e `GET /almoxarifado/anexos/:id/arquivo`, esta com
      **download autenticado** — o arquivo NÃO é servido estaticamente. No client existe o
      componente genérico `client/src/components/almoxarifado/AnexosDocumento.js`.
      **Plugar aqui é uma linha** — `<AnexosDocumento entidade="CHAVE" entidadeId={id} />` — mais
      dois cenários de teste. **Ponto de atenção medido na Etapa 32:** confira QUANDO o `id`
      existe nesta tela. Na inspeção o plug teve de ir para a aba Histórico, porque a linha só
      nasce **depois** da decisão — anexar antes penduraria o arquivo num id inexistente.

      **⚠️ Correção da Etapa 34 (2026-09-16, `746a106..054f727`).** O parágrafo acima dizia que
      **"plugar aqui é uma linha"**; isso **ESTAVA ERRADO**. O certo, medido no design `6ccaf40` e
      confirmado na execução: esta tela era uma das **duas** (com Requisições) que tinham painel
      onde plugar inline — as outras três (Materiais, Devoluções, item de remessa) não tinham casa
      nenhuma, nem linha expansível nem painel, e precisaram de uma casca de modal (`AnexosModal`,
      `746a106`) e de um botão por linha. E nem aqui foi uma linha: o corpo do painel vivia dentro
      do ternário de `loadingDetalhe` (`RecebimentosAlmoxarifado.js:496`), então **desmontava a
      cada refetch** — foco da janela, que é exatamente o que acontece ao FECHAR o diálogo de
      escolher arquivo; troca de filtro; ação de workflow ou fiscal —, e com ele sumia o arquivo
      recém-escolhido, mais um GET de anexos a cada volta. O bloco teve de sair do ternário
      (`c5d9e99`, cenário (g): identidade do nó DOM mais contagem `=== 1` depois do refetch). O
      texto da Etapa 32 fica acima **de propósito** — o mecanismo que ele descreve continua exato;
      errada era só a estimativa do custo do plug.

      **Defeito PRÉ-EXISTENTE descoberto ao escrever a suíte desta tela (não era da Etapa 34) —
      ✅ FECHADO NA ETAPA 35 (`22e1d9b`), fragilidade G10.** Os três carregamentos de
      `RecebimentosAlmoxarifado.js` **engoliam o erro**: `loadRecebimentos` só disparava um toast e
      caía no estado vazio, `loadMateriais` e `loadAuxiliares` tinham `catch { /* ignore */ }`
      literal. Falha de rede ou 500 do servidor aparecia para o operador como **"Nenhum recebimento
      registrado"**, isto é, como se não houvesse recebimento nenhum — o mesmo pecado que a Etapa 29
      corrigiu em `HistoricoInspecoes`, e com risco de registrar de novo uma nota que já existe.

      > ⚠️ **Correção da Etapa 35: a redação anterior deste parágrafo citava linhas, e uma delas
      > ESTAVA ERRADA.** Isto dizia que `loadAuxiliares` ficava em `:99-108`; **estava errado**; o
      > certo, na época, era **`:100-109`** — `:99` era **linha em branco**. E depois
      > do `22e1d9b` e do `4681111` as três funções se deslocaram de novo, então **nenhum** dos
      > três intervalos que este parágrafo citava (`:72-85`, `:93-97`, `:99-108` — **estava errado**
      > o terceiro, e os outros dois apodreceram) aponta mais para o que descrevia.
      > Por isso as referências desta spec passam a ser pelo **nome da função** —
      > `loadRecebimentos`, `loadMateriais`, `loadAuxiliares` —, que é o que sobrevive a um commit.
      > Fica registrado em vez de trocado em silêncio: já aconteceu duas vezes nesta base alguém
      > confiar numa ref de linha apodrecida.

      **Como ficou** (`22e1d9b`, molde do `HistoricoInspecoes` pós-Etapa 29, sem classe CSS nova):
      `loadRecebimentos` grava estado de erro e a tela renderiza **"Não foi possível carregar os
      recebimentos."** com botão **"Tentar de novo"** (RN-04), **zerando a lista** na falha para que
      um refresh que falha não deixe linhas velhas passando por frescas (RN-05); `loadMateriais`
      grava o seu próprio erro e a frase **"Não foi possível carregar a lista de materiais."**
      aparece **dentro** do modal de novo recebimento, junto do campo de busca, onde ela atrapalha
      (RN-06) — e só **avisa**, não bloqueia registrar. O botão de refresh do cabeçalho ganhou
      `title="Atualizar lista"`, que era o que faltava para o cenário poder clicá-lo.
      **`loadAuxiliares` continua silencioso, e isso é decisão, não esquecimento:** pedidos de
      compra e fornecedores alimentam dois `<select>` **opcionais**, os dois têm entrada manual ao
      lado, e o recebimento pode ser registrado inteiro sem eles — um terceiro estado de erro pagaria
      uma superfície nova por uma falha que não bloqueia ninguém. O que era errado ali era o
      `/* ignore */` **sem explicação**, que fazia parecer esquecimento; o porquê está escrito dentro
      do próprio `catch`.

      **Cenários que travam isto** (`RecebimentosAlmoxarifado.test.js`, o `api.get` da suíte tem
      fallback que **rejeita**): **(h)** a lista que não carregou mostra erro, nunca "Nenhum
      recebimento registrado" — com as duas metades positivas: a tela montada e o *"Tentar de novo"*
      **restaurando** a lista (um `<button>` sem `onClick` passaria verde); **(i)** refresh que falha
      não deixa a lista velha na tela; **(j)** falha ao carregar materiais aparece **dentro** do
      modal.

      **Dois itens que NENHUMA spec tinha, fechados aqui** (`4681111`) — registrados porque ficaram
      sem número até esta etapa (letra C das novidades: **C46** e **C47**):
      - **RN-07 — o painel mostrava o registro ANTERIOR sob o id novo.** `abrirDetalhe` nunca
        anulava `detalhe`, nem ao trocar de linha: durante a carga do recebimento B o painel (e o
        bloco de anexos, que desde `c5d9e99` vive **fora** do ternário de loading) continuava
        exibindo A — e nessa janela um arquivo escolhido "para A" seria enviado a **B**. Conserto no
        molde completo de Requisições: o painel passa a ser gatilhado por **`selectedId`** (não por
        `detalhe`), `idCarregadoRef` diz qual id está **realmente** dentro de `detalhe` e o `detalhe`
        é anulado **só na troca de id**. **Descartado:** apenas "anular `detalhe`" sem `selectedId` —
        sem ele o painel inteiro desaparece e os pontos que desreferenciam `detalhe` lançam
        `TypeError`. Sete pontos de render ganharam guarda explícita, e o cabeçalho mostra
        `detalhe?.numero || '...'` enquanto carrega. Cenário **(k)**.
      - **RN-08 — resposta fora de ordem vencia.** Dois cliques rápidos deixam dois `GET` em voo e o
        que chegasse **por último** pintava o painel, mesmo sendo o do clique **anterior**.
        `detalheFetchSeqRef` descarta a resposta atrasada. Cenário **(l)**.
      - **RN-09 (não-regressão):** refetch do **mesmo** id (ação de workflow/fiscal) **não** desmonta
        o bloco de anexos — é o cenário (g) da Etapa 34, que continua verde porque a anulação de
        `detalhe` é condicionada a `idCarregadoRef.current !== id`.

      **E a consequência que a revisão final pegou** (`29cbdfa`): `currentStep` era derivado de
      `detalhe` e era o **oitavo** consumidor dele — a tabela de sete pontos do design **estava
      incompleta**. Com `detalhe` anulado na troca de linha, o `: 0` fazia a **barra de etapas** do
      cabeçalho acender o **passo 1** por um round-trip inteiro e pular de volta ao chegar o detalhe
      novo (e acender "Almoxarifado" já na lista, sem nada aberto). Agora vale `undefined` enquanto
      carrega e `AlmoxPageHeader` (`idx = currentStep ?? -1`) deixa a barra **neutra** em vez de
      mentir; `currentStep = 0` legítimo continua acendendo. **Descartado:** congelar o último passo
      num ref — mostraria o passo do recebimento **anterior** sob o id novo, exatamente a classe de
      defeito que a RN-07 acabou de fechar.

      **O que CONTINUA aberto nesta tela (residual da G10):** **workflow e etiquetas seguem sem
      teste** — a suíte cobre lista, painel, anexos, erro de carga, ordem de resposta, o campo de
      conferência e, desde a Etapa 36, **um** cenário do modal fiscal (o (r), que prova que o
      payload do `/fiscal` **não** leva `tipo_recebimento`). O resto do modal fiscal — lote,
      validade, valores, chave NFe — continua sem cenário.
      > ✅ **O resíduo do `loadingDetalhe` foi FECHADO na Etapa 36 (`5ce3fdf`).** O texto anterior
      > deste parágrafo o descrevia como aberto e dizia que *"o irmão em Requisições tem (`2817054`)
      > e serve de molde"* — **isso estava errado**, e é a mesma correção que o plano da Etapa 35
      > recebeu: `2817054` **não** zerava `loadingDetalhe`, e `RequisicoesList.js` tinha o **mesmo**
      > resíduo. O defeito era **gêmeo, não moldado** — as duas telas foram consertadas juntas, com
      > `setLoadingDetalhe(false)` em `fecharDetalhe`. E a régua proposta na época (*"reabrir e ver
      > se nasce em Carregando…"*) **não funcionaria**, porque `abrirDetalhe` religa a flag em toda
      > abertura. Por isso a Etapa 36 entregou a linha **declaradamente sem régua** (caso 2 da skill
      > `fechar-etapa`: defeito inalcançável pelo harness — todo leitor de `loadingDetalhe` renderiza
      > só sob `selectedId`), com **controle positivo executado** e o placar **idêntico** com e sem
      > a linha (17/17 e 35/35). Fingir um vermelho seria pior; remover a proteção porque nada cai
      > seria muito pior.
- [ ] Divergências: registro formal (tipo, quantidade, ação) — parcial na inspeção
  > **Continua desmarcado (Etapa 36), e o que mudou é que ele deixou de ser impossível.** Antes
  > desta etapa **nenhum gesto de tela** produzia `recebida ≠ esperada`, então "registrar a
  > divergência formalmente" não tinha nem dado de entrada. Agora tem: a quantidade conferida é
  > digitável e a tela avisa
  > *"Divergência: N a menos/a mais que o esperado (E)"* (`e2a23a9`), e o evento
  > `DIVERGENCIA_RECEBIMENTO` já existia. **O que falta é o registro FORMAL:** divergência
  > numerada, com tipo, ação e responsável — tabela própria, fluxo próprio. Não foi tocado aqui, e
  > é candidato natural depois da Etapa 37.
- [ ] Ao aprovar: definir localização (sugestão da feature 02) + gerar etiqueta (feature 10) + **atualizar saldo via movimentação v2** — a entrada já passa pelo motor (`registrarMovimentacao`) desde antes da Etapa 5, e desde a Etapa 6 a movimentação vai com `lote_id` (`64686b1`).
  > ⚠️ **Correção da Etapa 36 (2026-09-16): a frase que estava aqui — *"Continuam faltando a
  > etiqueta (Etapa 6c, não a 6) e a sugestão de localização"* — ESTAVA ERRADA na metade da
  > etiqueta.** A etiqueta **foi entregue**, em 2026-08-11, na **Etapa 6c**, commit **`4ebd1ce`**:
  > o botão *"Imprimir etiquetas dos itens"* está em `RecebimentosAlmoxarifado.js` (status
  > `PROCESSADO`/`APROVADO`), o montador do PDF é `client/src/utils/etiquetasPdf.js`, e **a spec 10
  > já registrava a entrega** — esta spec seguiu afirmando o contrário por cinco etapas, e o texto
  > foi copiado daqui para a tabela final do plano da Etapa 35, propagando o mesmo erro. Esta é a
  > razão pela qual a correção fica **escrita** em vez de apagada: quem lesse "falta etiqueta"
  > planejaria uma etapa para construir o que existe.
  > **O que de fato falta neste item são duas coisas, e nenhuma é a etiqueta:** (a) a **sugestão de
  > localização** na entrada (feature 02, não construída); (b) a etiqueta **automática ao aprovar**
  > — hoje é impressão sob demanda por clique, e disparar automaticamente é **decisão de negócio**,
  > não ausência de código. O item fica desmarcado por (a).
- [x] Quarentena: material aguardando inspeção não entra no disponível (`quantidade_em_inspecao`) — **Etapa 5 (2026-08-08)**. Três movimentos novos no motor (`QUARENTENA`, `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO`) com guarda atômica (`c37b67e`); entrada retida em vez de barrada (`4db5e11`). A decisão de inspeção em si (aprovar/reprovar/parcial) é da feature 09 — ver aquele README para o motor real usado na decisão (`DECISAO_INSPECAO`, não os dois tipos separados acima).
- [ ] E-mail automático na entrada confirmada (feature 19)
  > **Desmarcado: é da feature 19 (notificações), não desta.** Não foi tocado na Etapa 36 e não
  > depende de nada entregue aqui.
- [x] Duplicidade: mesma NF+fornecedor não entra duas vezes — **`ffc5f47`** + **`c5f14c8`**
      (Etapa 36, 2026-09-16). *(Era "**confirmado ausente**" na Fase 0 da Etapa 27, 2026-08-29:
      não havia nenhuma checagem de nota repetida em `receiptService.js` e a rota não tinha schema
      de validação. **O dano foi medido antes do conserto:** a mesma NF em dois documentos creditava
      **20** em vez de 10 no estoque e gerava **2** contas a pagar.)*
      `assertNotaNaoDuplicada` roda **no serviço**, antes do `INSERT` da criação **e** antes do
      `UPDATE` do `/fiscal` — as duas portas, senão a regra é contornável por um `PUT`. 409
      *"Nota fiscal {nf} já lançada no recebimento {numero} para este fornecedor"*.
      **As três exceções são deliberadas:** NF vazia/nula não é duplicata (nota sem número não
      identifica nada); **fornecedor diferente** com a mesma NF é legítimo (numeração de NF é por
      emitente); e **fornecedor não identificado** (id, CNPJ e nome os três vazios) não conta. No
      `/fiscal` há `AND id <> ?` para o documento não se autoacusar da própria NF.
      **`UNIQUE(nota_fiscal, fornecedor)` foi DESCARTADO, com motivo:** produção pode já ter
      duplicatas, e um índice único subiria **quebrando o deploy** sobre dado histórico; o índice
      criado é `CREATE INDEX IF NOT EXISTS` **não-único**, e a consulta de diagnóstico está na letra
      **A9** do doc de novidades — zero linhas ⇒ o `UNIQUE` pode subir numa etapa futura sem
      migração de dado. **Consequência assumida:** a guarda é *check-then-insert* sem transação, ou
      seja **não é airtight** — dois `POST` simultâneos com a mesma NF passam os dois, e isso só
      fecha na migração para Postgres.
      > ⚠️ **A chave de fornecedor escrita na T2 ESTAVA INCOMPLETA, e era contornável de três
      > jeitos** (achados da revisão final, corrigidos em `c5f14c8`): (1) a comparação de nome rodava
      > em SQL, e o `UPPER` do SQLite é **ASCII-only** — `'José Aços Ltda'` e `'JOSÉ AÇOS LTDA'` com
      > a mesma NF viravam **dois** documentos, com o estoque dobrado; (2) a guarda comparava **UMA
      > perna só**, a que o documento novo trazia, então identificação **mista** (documento A só com
      > o nome digitado, documento B com o fornecedor escolhido no `<select>`, que copia nome **e**
      > CNPJ) nunca colidia; (3) o CNPJ era trimado na coluna, não no parâmetro. A regra passou a
      > buscar candidatos pela NF normalizada e comparar o fornecedor **em JS por QUALQUER perna que
      > case** (id; CNPJ só dígitos; nome NFD sem diacrítico, maiúsculo, espaços colapsados) — a
      > forma verbatim está no bloco da Etapa 36 em "O que já existe". **Descartado:** resolver no
      > SQL (não há como remover acento em SQLite sem extensão) e manter uma perna por documento,
      > que era o desenho original. **Consequência para a letra A:** a consulta A9 roda em SQL e
      > portanto **SUB-REPORTA** duplicatas de nome acentuado — o número dela é piso, não total.
      > **Lição de harness registrada:** a sabotagem prevista para o strip de acento era **no-op**,
      > porque `'José'.toUpperCase()` em JS **já** casa com `'JOSÉ'` (o `toUpperCase` do JS é
      > Unicode-aware; o `UPPER` do SQLite não é, e era esse o bug). A régua do strip NFD só existe
      > com o par **sem acento × com acento**, que foi acrescentado ao cenário.

### Frontend
- [x] Campos de conferência física + fotos — **`e2a23a9`** + **`d02744a`** + **`e287a06`**
      (Etapa 36) para a **quantidade conferida**, e **`01dd3ce`** + **`c5d9e99`** (Etapa 34) para as
      **fotos/anexos**. Cada item do painel, nos status `RECEBIDO` e `EM_CONFERENCIA`, ganhou o campo
      **"Qtd. conferida"** (`title`, sem label visível) e o botão **"Salvar Conferência"**, que chama
      `PUT /almoxarifado/recebimentos/:id/conferir` — **rota que existia e nunca tinha tido um
      chamador**. Digitar quantidade diferente da esperada mostra
      *"Divergência: N a menos/a mais que o esperado (E)"*; a caixa de autorizar excedente aparece
      só com `pode('autorizar_excedente')` (**a UI não decide** — o hook falha **aberto** de
      propósito, e quem recusa é o backend); a recusa 400/403 do servidor vai para o **DOM** com
      `role="alert"`, e o 400 **não apaga** o que foi digitado, de modo que marcar a caixa e
      reenviar funciona.
      **Dois detalhes que são decisão, não sobra:** (1) campo **vazio** omite tanto
      `quantidade_recebida` quanto `conferencia_quantidade` do payload (`d02744a`) — mandar
      `Number('')` gravaria **zero** e dispararia divergência de "0 recebidos", e mandar o boolean
      sempre concreto tornava o `COALESCE` do servidor **morto** para o único chamador, fazendo com
      que salvar a contagem de um item **desmarcasse** a conferência de outro; (2) o aviso mostra até
      **4 casas** quando a diferença arredonda a zero em duas (`e287a06`) — antes dizia
      *"Divergência: 0 a mais que o esperado (200)"* para `200.001`, isto é, **a tela afirmava zero
      enquanto o servidor barrava o save**.
      **O que este item NÃO cobre, e por isso o item de backend "Conferência física estruturada"
      continua desmarcado:** pesagem, medição, contagem estruturada e checklist por tipo de material.
- [ ] Definição de localização na entrada
  > **Desmarcado: depende da feature 02 (sugestão de localização), não construída.** Não foi tocado
  > na Etapa 36.
- [ ] Tipos de entrada no form
  > **Desmarcado por decisão de negócio, não por falta de código.** O `<select>` de forma de
  > recebimento existe no modal de novo recebimento e, desde a Etapa 36, os dois valores que ele
  > oferece são os **únicos** que o servidor aceita (`d02b9f4`). Acrescentar os outros tipos da spec
  > 8.1 ao formulário é o mesmo item do checklist de backend: as features 11–15 🟢 já são a porta
  > deles, e replicá-las aqui criaria uma segunda porta.

## Regras essenciais + testes de API exigidos

> **Correção (auditoria de 2026-08-11): esta tabela lia como se todos os testes existissem — e
> cinco deles nunca foram escritos** (`recebimento com NF duplicada falha`, `recebimento excedente
> sem autorizacao falha`, `processar recebimento cria movimentacao v2 vinculada`, `avancar etapa
> fora de ordem falha`, `recebimento parcial atualiza saldo pendente do pedido` — verificado por
> grep em `server/tests`). A coluna **Estado** abaixo distingue o que existe (✅) do que continua
> exigido e ainda não escrito (⏳), no mesmo padrão da spec 10. Também faltava aqui o quinto teste
> da suíte de quarentena, agora listado.
>
> **Atualização da Etapa 36 (2026-09-16): dos cinco que faltavam, TRÊS foram escritos** — NF
> duplicada (`ffc5f47`), excedente sem autorização (`f747df4`) e workflow fora de ordem
> (`9d19e7d`) —, e a tabela ganhou **duas linhas novas** (o enum nas duas portas + itens do POST, e
> a integração das três guardas). **Continuam ⏳ dois**, cada um com o motivo escrito na própria
> linha: `processar recebimento cria movimentacao v2 vinculada` (a entrada **já passa** pelo motor;
> falta o teste dedicado a saldo anterior/posterior) e `recebimento parcial atualiza saldo pendente
> do pedido` (não existe onde o saldo pendente morar — Etapa 37).

| Regra | Teste | Estado |
|-------|-------|--------|
| NF duplicada (fornecedor+número) falha | `recebimento com NF duplicada falha` e mais 9 cenários — `server/tests/api/recebimentoNfDuplicada.api.test.js` (`ffc5f47`, ampliado em `c5f14c8` com acento, identificação mista e CNPJ sem trim) | ✅ |
| Quantidade recebida > pedida sem autorização falha | `recebimento excedente sem autorizacao falha` e mais 11 cenários — `server/tests/api/recebimentoExcedente.api.test.js` (`f747df4`/`3e36af4`, ampliado em `230baf6` e `2d7787d` com o eco do fiscal, o acervo e o `> gravada`) | ✅ |
| Forma de recebimento fora do enum falha nas DUAS portas, e o item do POST exige quantidade numérica positiva | `server/tests/api/recebimentoTipoEnum.api.test.js` — 7 cenários (`d02b9f4`, cenário (7) em `d90853d`) | ✅ |
| As três guardas valem em todos os cinco pontos de chamada, pela rota **e** pelo serviço | `server/tests/api/recebimentoPortasIntegracao.api.test.js` (`aa39155`) | ✅ |
| Material com necessidade de inspeção entra em quarentena (físico sobe, disponível não) | `item critico entra no fisico mas fora do disponivel` — `server/tests/api/recebimentoQuarentena.api.test.js` (`4db5e11`) | ✅ |
| Aprovar recebimento de item crítico **não exige mais inspeção prévia** (mudança da Etapa 5 — antes lançava erro) | `aprovar recebimento de item critico NAO exige inspecao previa (mudanca da Etapa 5)` — mesmo arquivo | ✅ |
| Item não crítico entra direto no disponível (regressão) | `item NAO critico entra direto no disponivel (regressao)` — mesmo arquivo | ✅ |
| Com a config `inspecao_material_critico` desligada, material crítico entra direto | `com a config desligada, material critico entra direto` — mesmo arquivo | ✅ |
| Retenção fica registrada no livro, vinculada ao recebimento | `a retencao aparece no livro como QUARENTENA vinculada ao recebimento` — mesmo arquivo | ✅ |
| Processar recebimento gera movimentação de entrada com saldo anterior/posterior | `processar recebimento cria movimentacao v2 vinculada` — a entrada **já passa** pelo motor; o que falta é o teste dedicado a saldo anterior/posterior | ⏳ exigido — ainda não escrito |
| Nota com um item inválido é recusada inteira, sem mover nada (pré-checagem) | `nota com um item invalido e recusada INTEIRA — nada do primeiro item entra` — `server/tests/api/recebimentoEntradaAtomica.api.test.js` (`6bb455d`) | ✅ |
| Reprocessar a nota não duplica estoque (idempotência por item) | `reprocessar uma nota ja processada nao credita nada de novo` + `A entra e B falha: reprocessar entra so o B, e o A continua em 10 (nao 20)` + `item com quantidade zero nao entra nem e marcado` — mesmo arquivo | ✅ |
| Recebimento exige lote em material com `controle_lote` | `[recebimento] nota com item sem lote em material controlado e recusada inteira` — `server/tests/api/loteControleObrigatorio.api.test.js`; e `material com controle_lote e sem lote digitado tambem recusa a nota inteira` — `recebimentoEntradaAtomica.api.test.js` | ✅ |
| Processar recebimento cria o lote com os dados da NF, e a entrada fica vinculada a ele | `processar recebimento cria o lote com dados da NF` + `a entrada de estoque fica vinculada ao lote criado` — `server/tests/api/loteRecebimento.api.test.js` (`64686b1`) | ✅ |
| Material com `controle_certificado` e sem anexo: lote nasce BLOQUEADO, mas o material **entra** | `sem certificado, o lote nasce BLOQUEADO: entra fisicamente mas a saida e recusada` — mesmo arquivo | ✅ |
| Anexar certificado libera o lote — mas nunca um lote REPROVADO | `anexar o certificado libera o lote` + `lote REPROVADO continua bloqueado depois de anexar o certificado` — mesmo arquivo (`c11db85`) | ✅ |
| Upload de certificado sem permissão não grava arquivo (permissão antes do multer) | `upload de certificado sem permissao nao grava arquivo` — mesmo arquivo | ✅ |
| Workflow não pula etapas | `avancar etapa fora de ordem falha` + `acao de workflow inexistente falha` + `id inexistente responde 404` + a sequência completa de cinco 200 — `server/tests/api/recebimentoWorkflowOrdem.api.test.js` (`9d19e7d`, zero linhas de produção) | ✅ |
| Recebimento parcial mantém pendência do pedido | `recebimento parcial atualiza saldo pendente do pedido` | ⏳ exigido — **e o motivo de continuar ⏳ está medido (Fase 0 da Etapa 37):** não existe onde o saldo pendente morar. `itens_pedido_compra` tem **0 escritores** e nenhuma coluna de quantidade recebida acumulada; a tela **nunca carrega** os itens do pedido; e o `POST` aceita 999 de 10 porque a barreira compara com a linha já gravada, que no POST não existe. Precisa de **coluna nova + escritor + decisão de quando o pedido fecha**, e atravessa Compras — é a **Etapa 37**, desenhada em `5f03afc` |

## Dependências

- 03 (movimentação v2) · 02 (localização na entrada) · 09 (inspeção — decide o que este README apenas retém) · 10 (**lote ligado na Etapa 6**; **etiqueta entregue na Etapa 6c, `4ebd1ce`** — esta linha dizia *"etiqueta continua ausente — Etapa 6c"* e **ESTAVA ERRADA**, ver a correção no item "Ao aprovar" do checklist) · 19 (e-mail) · **08 ↔ Compras: recebimento parcial/excedente contra o pedido é a Etapa 37** (`itens_pedido_compra` precisa de acumulador e de situação derivada).
