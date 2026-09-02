# 08 — Entrada e Recebimento de Materiais

> **Status:** 🟡 — workflow fiscal NF maduro, quarentena na entrada fechada (Etapa 5), **lote nasce aqui desde a Etapa 6**, entrada da nota **atômica e idempotente** desde o review final do branch (2026-08-10); faltam tipos de entrada, conferência física estruturada e etiqueta · **Spec original:** seção 8
> **Etapa 31 (2026-08-31, `1e6c9a9..67b6758`) — o NÚMERO deste documento mudou de forma, e só ele.** O `REC-` era montado com os **últimos dígitos** do milissegundo mais um sorteio de 0 a 99, e por isso o carimbo **repetia** a cada **27,78 horas**. Agora vem do gerador único `services/almoxarifado/numeroDoc.js` (relógio inteiro em base36 + 8 aleatórios), com retry na colisão. **Nada mais desta feature mudou** — nem status, nem checklist, nem comportamento: o número passa de 12–14 caracteres só com dígitos para 20 com letras, os antigos **não** foram migrados e continuam legíveis (RN-05, testada). Furo **C41** das novidades.
> **Última atualização:** 2026-08-11 (**auditoria spec×código**: corrigida a afirmação — que estava
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

## Checklist

### Backend
- [ ] Tipos de entrada (spec 8.1): materiais de cliente, consignado, retorno de industrialização/fornecedor/assistência, devolução da produção, transferência, fabricado internamente, sobra/retalho, ajuste, ferramenta, produto acabado — hoje o recebimento é só de NF de compra (os demais entram pelas features 11/12/13/14/15). **Fora do escopo da Etapa 5** (design 2026-08-07): decisão explícita de deixar para quando houver demanda real de um tipo específico.
  > **CORREÇÃO (Fase 0 da Etapa 27, medida em 2026-08-29): esta linha dizia "aqui: campo
  > `tipo_entrada` + validações por tipo", e ESTAVA ERRADA nas duas metades.**
  > **(1) O campo não se chama `tipo_entrada` e ele JÁ EXISTE**: é `tipo_recebimento`
  > (`schema.js:1147`, `TEXT DEFAULT 'NOTA_FISCAL'`), gravado por `criarRecebimento`
  > (`receiptService.js:106`), e há um `<select>` para ele na tela
  > (`RecebimentosAlmoxarifado.js:600`). Procurar por `tipo_entrada` no código não acha **nada** —
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
  > `POST /api/almoxarifado/recebimentos` (`extended.js:765`) tem **só** o gate
  > `requirePermission('receber_material')`, sem `validate(...)`. O valor do body é gravado cru:
  > qualquer string entra na coluna. **A tarefa real desta linha é**: fechar o enum dos tipos
  > que o recebimento de fato faz hoje e validá-lo nas **duas** portas de escrita — o `POST` e o
  > `PUT /:id/fiscal` (`receiptService.js:281`, `tipo_recebimento = COALESCE(?, tipo_recebimento)`),
  > senão a validação é contornável por um `PUT`. Ampliar a lista para os dez tipos da spec 8.1 é
  > **decisão de negócio**, não código, e esbarra no ponto (2).
  > **Medido no banco de desenvolvimento: zero recebimentos gravados** — não há acervo a migrar,
  > e um enum aplicado agora não invalida dado nenhum.
- [ ] Recebimento parcial de pedido (validar suporte real + saldo pendente do pedido)
- [ ] Recebimento excedente só com autorização
- [ ] Conferência física estruturada (spec 8.3): contagem, pesagem, medição, checklist configurável por tipo de material. **Fora do escopo da Etapa 5**, mesma decisão acima.
- [ ] Fotos do recebimento (`anexos_documento_almoxarifado` entidade `recebimento`)
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
- [ ] Divergências: registro formal (tipo, quantidade, ação) — parcial na inspeção
- [ ] Ao aprovar: definir localização (sugestão da feature 02) + gerar etiqueta (feature 10) + **atualizar saldo via movimentação v2** — a entrada já passa pelo motor (`registrarMovimentacao`) desde antes da Etapa 5, e desde a Etapa 6 a movimentação vai com `lote_id` (`64686b1`). Continuam faltando a **etiqueta** (Etapa 6c, não a 6) e a sugestão de localização
- [x] Quarentena: material aguardando inspeção não entra no disponível (`quantidade_em_inspecao`) — **Etapa 5 (2026-08-08)**. Três movimentos novos no motor (`QUARENTENA`, `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO`) com guarda atômica (`c37b67e`); entrada retida em vez de barrada (`4db5e11`). A decisão de inspeção em si (aprovar/reprovar/parcial) é da feature 09 — ver aquele README para o motor real usado na decisão (`DECISAO_INSPECAO`, não os dois tipos separados acima).
- [ ] E-mail automático na entrada confirmada (feature 19)
- [ ] Duplicidade: mesma NF+fornecedor não entra duas vezes — **confirmado ausente** (Fase 0 da Etapa 27, 2026-08-29): não há nenhuma checagem de nota repetida em `receiptService.js`, e a rota não tem schema de validação

### Frontend
- [ ] Campos de conferência física + fotos
- [ ] Definição de localização na entrada
- [ ] Tipos de entrada no form

## Regras essenciais + testes de API exigidos

> **Correção (auditoria de 2026-08-11): esta tabela lia como se todos os testes existissem — e
> cinco deles nunca foram escritos** (`recebimento com NF duplicada falha`, `recebimento excedente
> sem autorizacao falha`, `processar recebimento cria movimentacao v2 vinculada`, `avancar etapa
> fora de ordem falha`, `recebimento parcial atualiza saldo pendente do pedido` — verificado por
> grep em `server/tests`). A coluna **Estado** abaixo distingue o que existe (✅) do que continua
> exigido e ainda não escrito (⏳), no mesmo padrão da spec 10. Também faltava aqui o quinto teste
> da suíte de quarentena, agora listado.

| Regra | Teste | Estado |
|-------|-------|--------|
| NF duplicada (fornecedor+número) falha | `recebimento com NF duplicada falha` | ⏳ exigido — ainda não escrito |
| Quantidade recebida > pedida sem autorização falha | `recebimento excedente sem autorizacao falha` | ⏳ exigido — ainda não escrito |
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
| Workflow não pula etapas | `avancar etapa fora de ordem falha` | ⏳ exigido — ainda não escrito |
| Recebimento parcial mantém pendência do pedido | `recebimento parcial atualiza saldo pendente do pedido` | ⏳ exigido — ainda não escrito |

## Dependências

- 03 (movimentação v2) · 02 (localização na entrada) · 09 (inspeção — decide o que este README apenas retém) · 10 (**lote ligado na Etapa 6**; etiqueta continua ausente — Etapa 6c) · 19 (e-mail).
