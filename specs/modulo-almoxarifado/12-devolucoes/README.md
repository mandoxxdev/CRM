# 12 — Devoluções

> **✅ RESSALVA RESOLVIDA em 2026-09-29 (Etapa 45, `a425559..7f72e39`) — a devolução AO FORNECEDOR
> existe.** Ela não é a "mesma devolução com outro destino", como esta spec sempre disse, e por isso
> **não** mora na tela de Devoluções: ela é a **execução de uma decisão de não conformidade**. Quem
> decide *Devolver ao fornecedor* registra a intenção; quem despacha o material registra a
> **execução**, e é esse registro que gera a saída `DEVOLUCAO_FORNECEDOR` — da quantidade reprovada,
> do lote que entrou naquele recebimento, com o número da NC em `documento_vinculado` e o motivo
> *"Devolução ao fornecedor"*. O caminho é **Almoxarifado → Não Conformidades**, e o item 187 do
> checklist abaixo está marcado **em parte**, com o que ficou de fora dito ali.
> **A feature 09 fechou em 🟢 junto com isto** — era o último item dela.
> ~~**⚠️ RESSALVA DO 🟢, acrescentada em 2026-09-28 (Fase 0 da Etapa 45) — leia antes de confiar na
> cor.** O verde vale para a **devolução AO ESTOQUE**; a **devolução AO FORNECEDOR continua
> desmarcada** no checklist, e a feature 09 depende dela. **Não mude a cor sem entregar a devolução
> ao fornecedor** — e, quando entregar, tire esta ressalva.~~
> *(Riscada, não apagada: o diagnóstico dela estava certo — inclusive o detalhe de que o erro
> atravessava as duas specs e nenhuma o via sozinha — e é o registro de que o 🟢 desta feature
> escondeu por sete semanas (2026-08-12 a 2026-09-29) um item de que outra feature dependia. O verde agora vale para os dois
> destinos; o que ficou de fora está no item 187 e nas limitações desta spec, não na cor.)*
>
> **Status:** 🟢 — **os DOIS destinos existem**: ao estoque desde a Etapa 7, ao fornecedor desde a **Etapa 45** (2026-09-29, `a425559..7f72e39`, pela tela de **Não Conformidades** — ver a nota resolvida no topo e o item 187). **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd` + `eabd848`/`7fc1b7f`)**: a
> devolução cita a saída original (com validação de quantidade), herda o lote, reativa a série,
> tem tela dedicada em `/almoxarifado/devolucoes` — e o **bug de saldo do destino SUCATA foi
> corrigido**. O cabeçalho anterior dizia *"falta vínculo à saída original e devolução com lote"*:
> **isso está entregue**. · **Spec original:** seção 16
> **Etapa 34 (2026-09-16, `746a106..054f727`) — a tabela de devoluções ganhou ANEXOS** (`67f2389`):
> a tela recebeu a **primeira coluna de ações que já teve**, com um clipe por linha abrindo o modal
> **Anexos** (entidade `devolucao`). Como a devolução é **imutável** no servidor (não há PUT nem
> DELETE), anexar comprovante numa devolução antiga é legítimo — e é justamente quando o
> comprovante costuma chegar. Zero linhas de servidor. A frase "plugar aqui é uma linha", que esta
> spec repetia desde a Etapa 32, **estava errada** — ver a correção no item de checklist de fotos.
> **Última atualização:** 2026-10-09 (**Etapa 97** — a perna `SUCATA` da devolução fica na régua de hoje (`parDaDevolucao` no 4º argumento do motor, `65dc74b2`): a régua nova das portas avulsas (o livre de caixa) não a recusa depois de a `ENTRADA_DEVOLUCAO` gravar, o que deixaria a devolução pela metade no legado; e os destinos de duas pernas (`QUARENTENA` e `SUCATA`) rodam sob **uma** trava do material (`3810f79a`, Fase 5) — uma separação não cai mais entre a entrada e a segunda perna (**C192**). O plano dizia que a perna podia ficar na régua de hoje porque "o par soma zero" — **estava errado** sem a trava. Range `eb7cd9d8..3fc39310`. Continua 🟢. Ver a seção "Etapa 97" no fim.)
> Antes: 2026-09-16 (Etapa 34 — anexos na tela; antes: 2026-08-12 — Etapa 7
> (Tasks 1, 3, 4, 5, 7) + o conserto de compensação fora do plano)
> Antes: 2026-08-11 — auditoria de cauda: corrigida a descrição da movimentação (anterior à Etapa 6) e registradas as decisões da Etapa 6 que afetam esta feature (isenção de lote, RETRABALHO neutro, SUCATA com justificativa)

## Objetivo

Devoluções (da produção, de projeto, de ferramenta, ao fornecedor, de cliente) sempre vinculadas à
saída original, com avaliação de condição e destino (estoque/inspeção/reparo/sucata).

## ⚠️ A spec estava ERRADA sobre o destino SUCATA — e a afirmação errada escondia um bug de saldo

Até 2026-08-12 esta spec dizia, em "O que já existe":

> *"destino SUCATA emite `SUCATA`"*

**Estava errado**, e não era erro de redação: era a descrição fiel de um comportamento **quebrado**,
escrita como se estivesse certa. O material devolvido para sucata **já tinha saído do estoque na
entrega**; emitir só o `SUCATA` — que é um **tipo de saída** para o motor — descontava de novo um
saldo que nunca voltou. **Devolver para sucata baixava o estoque duas vezes.**

Medido com sonda executada, com controle positivo (2026-08-12):

```
estoque inicial          => 100
saída 10                 => 90
devolução 3 → SUCATA     => 87      ← errado, deveria ser 90
devolução 2 → ESTOQUE    => 89      ← controle positivo: a sonda sabe medir
```

Nenhum teste pegava, e **a leitura do código não mostrava** — só a execução. Esta spec e o guia
tinham a mesma frase, e quem a lesse confirmaria o comportamento errado como intencional. Por isso a
afirmação não foi apagada em silêncio: fica aqui registrada como **errada**, para o próximo não
confiar nela de novo.

**Correção adotada (`29524fc`, commit próprio, antes das features da etapa):** o destino `SUCATA`
emite **`ENTRADA_DEVOLUCAO` seguida de `SUCATA`** — entra e sai. O saldo fecha em 90 e o livro conta
as duas coisas: voltou, e foi sucateada. Descartada a alternativa de **não movimentar nada** no
destino `SUCATA`: o saldo também ficaria certo, mas a sucata sumiria do livro, e a feature 15
(retalhos e sucatas) vai precisar dela lá.

**Efeito em dados já gravados:** a correção **não reprocessa o passado**. Onde já houve devolução
para sucata antes do deploy, o saldo daquele material está **a menos** pela quantidade devolvida. A
consulta que identifica isso está no guia de usuário (`docs/almoxarifado-guia-etapas-e-testes.md`,
seção da Etapa 7). No **banco de desenvolvimento a checagem foi feita: 0 devoluções, nenhum efeito**
— produção precisa da mesma checagem antes do deploy.

## O que já existe

- `devolucoes_material_almoxarifado` (`schema.js`): material, quantidade, motivo, condição, destino,
  origem_os_id, origem_projeto_id — e, **desde a Etapa 7 (`38d2391`, via `safeAlter`)**,
  `movimentacao_saida_id` e `lote_id`.
- `GET/POST /devolucoes` (`extended.js`) via `returnService.js`. O serviço audita a criação
  (`registrarAuditoria`).
- **`GET /devolucoes/saidas-elegiveis?material_id=X`** (`4d5f79f`) — as entregas daquele material
  que uma devolução pode citar: tipos `SAIDA`/`SAIDA_PRODUCAO`/`SAIDA_MONTAGEM`/`SAIDA_ASSISTENCIA`,
  não canceladas, as 30 mais recentes, cada uma com data, lote, requisição/OS/projeto, quem retirou,
  `quantidade_devolvida`, `saldo_devolvivel` e as `series` entregues naquela saída. `SUCATA`, `PERDA`
  e `AJUSTE_NEGATIVO` ficam fora **de propósito**: não se devolve o que foi descartado ou corrigido.
  Linha já devolvida por inteiro **volta** na lista com saldo 0 — "já devolvido por inteiro" é
  informação útil, não ruído; a tela a mostra desabilitada.
- **Tela `/almoxarifado/devolucoes`** (`0722bfd`), code-split em `routes/lazyModules.js` como o resto
  do módulo: material → entregas daquele material (ou "devolução avulsa") → quantidade limitada ao
  devolvível → condição sugerindo o destino → motivo/observações → lote herdado em leitura ou
  seletor → checkboxes de série.
- Movimentação conforme o destino, via motor (`returnService.registrarDevolucao`):
  `ESTOQUE`/`QUARENTENA` emitem `ENTRADA_DEVOLUCAO` (quarentena emite também `BLOQUEIO`);
  **`SUCATA` emite `ENTRADA_DEVOLUCAO` e depois `SUCATA`** (ver acima); `RETRABALHO` emite
  `RETRABALHO`, tipo neutro ao saldo. **Todos** os destinos gravam `referencia: DEV-<id>` em cada
  movimentação que emitem (`29524fc`) — antes só `ESTOQUE`/`QUARENTENA` gravavam, e a devolução que
  virava sucata ficava sem nenhum fio ligando o lançamento do livro ao registro da devolução.
  **Correção (2026-08-11):** a spec dizia "tipo `DEVOLUCAO` na movimentação v1/v2" — isso descrevia
  o estado anterior à Etapa 6 e estava desatualizado; `DEVOLUCAO` sobrevive apenas como tipo aceito
  na rota v1 e como filtro do livro.

### A decisão da Etapa 6 que a Etapa 7 REVOGOU

- ~~**Devolução é isenta de `controle_lote`**~~ — **revogado em 2026-08-12 (`38d2391`)**. A isenção
  existia porque **não havia de onde tirar um lote**. Agora há nos dois caminhos: herda da saída
  original quando a devolução cita a entrega, e a tela tem seletor de lote quando é avulsa. A
  devolução passou a declarar `exigeLote: true` **honestamente** — no 4º argumento, nunca no body —
  e **saiu da lista de fluxos internos isentos da spec 10**, que passou de quatro para três. Os dois
  testes de `loteControleObrigatorio.api.test.js` que provavam a isenção mudaram de lado no arquivo.
- **`RETRABALHO` é tipo neutro ao saldo**: registra no livro mas não baixa nem aumenta nada (ramo de
  tipo neutro no `stockService`) — continua verdadeiro.
- **`SUCATA` exige justificativa no motor** (`REGRAS_VINCULO` em `movementRules`); o `returnService`
  envia `justificativa` no destino SUCATA — continua verdadeiro.

### Compensação da devolução recusada (conserto de 2026-08-12, fora do plano da Etapa 7 — `eabd848`, guia em `7fc1b7f`)

`registrarDevolucao` grava a linha de `devolucoes_material_almoxarifado` **antes** de emitir as
movimentações — precisa do `id` para montar `referencia: DEV-<id>`. Como **não há transação neste
módulo** (SQLite; a migração para Postgres é que resolve de vez), qualquer recusa do motor depois
desse `INSERT` deixava a linha gravada: uma devolução registrada que nunca aconteceu.

**Medido por sonda executada (2026-08-12):** material com `controle_lote`, entrada de 20 no lote L1,
saída de 10; devolução **avulsa** de 3 sem informar lote → `400 "O material ORF exige lote nesta
movimentacao"` e `linhas em devolucoes_material_almoxarifado antes: 0 | depois: 1`.

Duas consequências, e a segunda é invisível:

1. `listarDevolucoes` (a tela da Etapa 7) mostrava uma devolução que não existe.
2. Quando a recusada **citava uma saída**, a linha fantasma entrava no `SUM(quantidade)` que
   `validarSaidaOriginal` e o `saldo_devolvivel` de `listarSaidasElegiveis` usam — cada recusa
   **encolhia permanentemente** o quanto ainda podia ser devolvido daquela entrega, sem avisar
   ninguém (medido: saldo devolvível 10 → 7 depois de uma devolução **recusada** de 3).

**Comportamento a partir daqui** — a emissão das movimentações roda dentro de `try/catch`, e o
`catch` pergunta se alguma movimentação chegou ao livro (`COUNT` por `referencia = DEV-<id>`, que é
única por devolução):

| Situação | O que acontece com a linha | Por quê |
|---|---|---|
| **Nenhuma** movimentação gravada | `DELETE` da linha + auditoria `COMPENSACAO`; o erro **original** é re-lançado sem máscara | nada aconteceu no estoque: a linha é ficção e contamina o `saldo_devolvivel` |
| **Alguma** movimentação já gravada (caso do destino `SUCATA`, que emite `ENTRADA_DEVOLUCAO` e só depois `SUCATA`) | a linha **fica**, com auditoria `ESTADO_PARCIAL`; o erro original é re-lançado | apagar seria pior que o bug: a linha passaria a ser o único rastro de um movimento real, e a `ENTRADA_DEVOLUCAO` ficaria com `referencia` apontando para nada |

As pré-validações que a Etapa 7 já tinha (status do lote no destino `SUCATA`; cardinalidade de série)
**continuam** e continuam sendo a primeira linha de defesa — são elas que impedem o par entrada+saída
de ficar meio feito, coisa que compensação nenhuma desfaz. Compensação foi escolhida **em vez de**
mais pré-validação caso a caso porque o buraco é geral: a lista de erros do motor cresce sem o
`returnService` saber.

**Pendência que este conserto deixa aberta:** ninguém é **notificado** do `ESTADO_PARCIAL`. A
auditoria registra, mas não existe alerta nem fila de resolução — descobrir depende de alguém abrir
a auditoria. A resolução é manual: estornar a `ENTRADA_DEVOLUCAO` órfã pela tela de **Movimentações**.
É o cenário mais raro possível (exige o motor recusar a **segunda** perna do destino SUCATA depois
de aceitar a primeira, com as pré-validações passando), mas não é impossível, e fica registrado em
vez de implícito. *(Etapa 97: a régua nova das portas avulsas — o livre de caixa — **não** vale para a segunda perna
(`parDaDevolucao`, `65dc74b2`), justamente para não criar um caminho novo para este `ESTADO_PARCIAL`; e as duas pernas
rodam sob uma trava do material, `3810f79a`. Ver a seção "Etapa 97" no fim.)*

## Checklist

### Backend
- [x] Vincular devolução à **movimentação de saída original** (`movimentacao_saida_id`) — validar quantidade devolvida ≤ entregue — **`38d2391`** (colunas + validação) e **`4d5f79f`** (rota que alimenta a tela). O vínculo é **opcional, mas validado quando informado** (decisão 2 do design): obrigatório foi descartado porque tornaria impossível devolver o que saiu por um caminho sem registro (sobra antiga, material entregue antes do sistema); "continua avulso" foi descartado porque é justamente o buraco que esta spec mais citava. A recusa por quantidade **diz quanto resta** — mensagem sem número obriga o operador a adivinhar
- [x] Devolução **com lote** — **`38d2391`**. Herda o `lote_id` da saída original quando o material tem `controle_lote`; lote informado à mão ganha do herdado; devolução avulsa exige o lote pelo seletor da tela. Resolve o saldo que ficava **preso**: entrava com `lote_id NULL` e a saída seguinte, que exige lote, não achava nenhum
- [x] Devolução com **número de série** — **`9e27bcb`**. Destinos `ESTOQUE`/`QUARENTENA`: o motor reativa a série `ENTREGUE → EM_ESTOQUE` (`seriesService.entradaSeries`). Antes, devolver material serializado voltava o saldo **sem voltar a peça**, quebrando o invariante `COUNT(séries presentes) == quantidade_atual` da Etapa 6b a cada devolução
- [x] Condição → destino: boa → estoque · suspeita → quarentena · danificada → sucata — **`0722bfd`**, entregue **como sugestão na tela**. O backend aceita qualquer combinação **de propósito**: uma regra rígida no motor criaria um caso sem saída (material bom que precisa ir para inspeção por outro motivo). Trocar o destino à mão não é desfeito pela sugestão — quem decide é quem está com a peça na mão. "Suspeita → inspeção (feature 09)" foi implementada como **quarentena** (`ENTRADA_DEVOLUCAO` + `BLOQUEIO`): o físico volta, o disponível não sobe. Ligar isso à fila formal de inspeção da feature 09 continua aberto
- [ ] Tipos de devolução (spec 16): produção, projeto, instalação externa, ferramenta (feature 16), não utilizado, ~~ao fornecedor~~, do fornecedor, de cliente (feature 13), assistência técnica. **Continua aberto** — é uma **coluna a mais** nesta tabela, não tabela nova; conteúdo das features 13/16
      > ⚠️ **"Ao fornecedor" saiu desta lista na Etapa 45, e NÃO como coluna desta tabela.** Ele
      > virou um **tipo de movimento próprio** (`DEVOLUCAO_FORNECEDOR`) disparado pela execução de
      > uma não conformidade, e não passa por `devolucoes_material_almoxarifado`. Fica riscado aqui
      > porque a premissa *"é só uma coluna a mais"* **estava errada para este caso** — e quem
      > confiasse nela acrescentaria a coluna e não teria construído nada do que faltava.
- [x] Fotos da devolução (anexos) — **`67f2389`** (Etapa 34, 2026-09-16). *Era "fora do escopo da Etapa 7, declarado" — deixou de ser.* A tabela de `DevolucoesAlmoxarifado.js` ganhou uma **9ª coluna, de ações** — a primeira coluna de ações que esta tela já teve —, com um botão de clipe por linha (`title` "Anexos e documentos desta devolução") que abre o modal **Anexos** na entidade `devolucao`. O botão **não** é gateado por perfil (RN-03/B68): quem vê a tela vê o clipe; enviar e remover são decididos dentro do bloco, pelo backend. **Anexar em devolução antiga é legítimo e deliberado:** a devolução é imutável no servidor (sem `PUT`, sem `DELETE`), e o comprovante em papel quase sempre chega depois do lançamento
      **Etapa 32 (`e708125..fd71958`): o MECANISMO existe, está testado, e falta SÓ o plug desta
      tela.** A entidade é `devolucao`, já no mapa fechado do serviço.
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
      confirmado na execução: esta tela **não tinha casa** para o bloco — a devolução não tem
      painel de detalhe nem linha expansível, e a tabela nem coluna de ações tinha —, então foi
      preciso construir antes a casca de modal (`AnexosModal` + `titulo` opcional em
      `AnexosDocumento`, `746a106`), abrir a coluna de ações e pendurar o clipe nela. O mesmo
      valeu para Materiais e para o item da remessa a terceiros; e mesmo nas duas telas que tinham
      painel (requisição e recebimento) o plug não foi uma linha — o bloco precisou sair do
      ternário de `loadingDetalhe` (`c5d9e99`) e, na requisição, de gate por `warehouseMode`
      (`a88d715`, B71). O texto da Etapa 32 fica acima **de propósito** — o mecanismo que ele
      descreve continua exato; errada era só a estimativa do custo do plug.
- [ ] Atualizar custo do projeto (estorno de consumo — feature 22) — **fora do escopo da Etapa 7, declarado**
- [x] Devolução ao fornecedor — **PAGO EM PARTE na Etapa 45** (2026-09-29, `a425559..7f72e39`):
      T1 `a425559` (tipo `DEVOLUCAO_FORNECEDOR` no motor, dedicado, fora da rota genérica),
      T2 `f8ab433` (estado de execução da NC + migração com backfill), T3 `dc629e1`
      (`POST /nao-conformidades/:id/executar` e a fila `?execucao=PENDENTE`), T5 `7c9bd1f`,
      T6 `a5b800c`, T4 `0305acc` (tela), fix-round `7f72e39`.
      ~~fluxo próprio com documento e e-mail — **fora do escopo da Etapa 7, declarado**. Não é
      "a mesma devolução com outro destino": tem documento fiscal e contraparte externa~~
      > **A frase riscada estava CERTA no diagnóstico, e foi ela que decidiu o desenho:** não é a
      > mesma devolução com outro destino, então **não** entrou na tela de Devoluções nem na tabela
      > `devolucoes_material_almoxarifado`. Entrou como **execução de uma decisão de não
      > conformidade**, na feature 09 — quem decide *Devolver* registra a intenção, quem despacha
      > registra a execução, e é a execução que move o estoque.
      >
      > **O que saiu:** a saída de estoque com baixa simultânea do físico e do bloqueado, do lote
      > que entrou naquele recebimento; autor, data e observações da execução; o número da NC em
      > `documento_vinculado` e o motivo *"Devolução ao fornecedor"*; a fila do que falta despachar;
      > o gate de perfil próprio (`executar_encaminhamento`); e o cartão de material reprovado
      > deixando de cobrar o que saiu.
      >
      > **O que NÃO saiu, e é por isso que este item é "em parte":** **(a)** o **documento fiscal**
      > — nota de devolução, CFOP e impostos ficam fora; o número da nota vai no campo de
      > observações; **(b)** o **e-mail ao fornecedor** — nenhum aviso externo sai do sistema (o
      > e-mail interno da reprovação, esse existe desde a Etapa 17); **(c)** material com **número
      > de série**, que continua no caminho de dois passos por **Movimentações**, pela mesma razão
      > declarada no descarte de devolução desta spec; **(d)** o pedido de compra **não** é reaberto
      > e `quantidade_recebida` **não** é reduzida (corte declarado, fixado por teste).
      >
      > **E um furo de operação nasceu com isto:** o documento recusado por série ou por lote não
      > identificável fica **preso** em *Pendente de execução*, porque nada em tela nenhuma cancela,
      > redecide ou reabre um documento já decidido — furo **C64** das novidades, e é a próxima
      > etapa. Quem marcar este item como 100% sem ler isso vai prometer o que não existe.
- [ ] E-mail automático (feature 19) — **fora do escopo da Etapa 7, declarado**

### Frontend
- [x] Tela de devoluções — **`0722bfd`** (`/almoxarifado/devolucoes`, `DevolucoesAlmoxarifado.js`, rota em `routes/lazyModules.js` + `App.js`, item de menu em `Layout.js`). **Começa pelo material**, não pela requisição: pela requisição não se alcança saída manual sem requisição, e `SAIDA_PRODUCAO`/`SAIDA_MONTAGEM`/`SAIDA_ASSISTENCIA` existem exatamente para isso
- [x] Tirar `DEVOLUCAO` do formulário genérico de Movimentações — **`f8a3e34`**. Registrar "Devolução" ali criava uma movimentação **solta** (sem motivo, sem condição, sem destino) e **não criava registro nenhum** em `devolucoes_material_almoxarifado`. Continua na lista completa de tipos (filtro e exibição do livro), senão os lançamentos antigos sumiriam; um hint aponta a tela nova

## Fora de escopo, declarado com o motivo

- **Série no descarte de devolução (decisão 10 do design).** Devolução com série cobre **`ESTOQUE` e
  `QUARENTENA`**. Para sucatear uma peça serializada devolvida, o caminho é de **dois passos**:
  devolver ao **Estoque** e depois registrar a baixa em **Movimentações**, que já tem seletor de
  série. Suportar direto exigiria encadear entrada+saída de série **com compensação no meio**, e
  este módulo não tem transação — uma falha entre as duas pernas deixaria a série num estado que
  ninguém desfaz. Mandar `series` para `SUCATA`/`RETRABALHO` devolve **400 explicando o caminho**,
  em vez de ignorar o campo em silêncio e deixar o operador achando que registrou a peça. A tela não
  oferece os checkboxes nesses destinos e mostra o aviso antes do envio.
  **Não confundir:** a limitação é "não dá para *informar a série* nesses destinos", não "material
  serializado não pode ir para sucata" — **sem** `series`, `SUCATA` continua passando (a entrada
  entra sem série, a saída sai logo depois, saldo líquido zero e o invariante fecha).
- **Trânsito/aprovação/e-mail** — pertencem à feature 11, cortados lá.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Estado |
|-------|-------|--------|
| Devolver mais que o entregue falha, **dizendo quanto resta** | `devolucao acima da quantidade entregue falha` — `devolucaoVinculo.api.test.js` | ✅ `38d2391` |
| Devoluções parciais somam no limite do entregue | `devolucao parcial soma com a anterior no limite do entregue` — mesmo arquivo | ✅ `38d2391` |
| Saída citada tem de existir, não estar cancelada, ser do mesmo material e de tipo devolvível — cada recusa com a **razão específica** | `devolucao sem saida original valida falha` (4 casos) — mesmo arquivo | ✅ `38d2391` |
| Devolução ao estoque restaura saldo e registra no livro com `referencia` | `devolucao boa aumenta saldo com movimentacao vinculada` — mesmo arquivo | ✅ `38d2391` |
| Condição "suspeita" volta ao físico mas **não** ao disponível | `devolucao para quarentena nao aumenta disponivel` — mesmo arquivo | ✅ `38d2391` |
| **Devolução para sucata não baixa o estoque duas vezes** (o bug) | `devolucao para SUCATA nao baixa estoque duas vezes` + `[controle positivo] devolucao para ESTOQUE soma ao saldo` — `devolucaoDestinos.api.test.js` | ✅ `29524fc` |
| Sucata aparece no livro como entrada seguida de saída | `devolucao para SUCATA registra ENTRADA_DEVOLUCAO e SUCATA no livro` — mesmo arquivo | ✅ `29524fc` |
| Todos os destinos gravam `referencia: DEV-<id>` | `todos os destinos gravam referencia DEV-<id> nas movimentacoes que emitem` — mesmo arquivo | ✅ `29524fc` |
| `RETRABALHO` continua neutro ao saldo | `devolucao para RETRABALHO continua neutra ao saldo` — mesmo arquivo | ✅ `29524fc` |
| Devolução herda o lote da saída original | `devolucao herda o lote da saida original` — `devolucaoVinculo.api.test.js` | ✅ `38d2391` |
| Devolução avulsa de material com `controle_lote` exige lote informado | `devolucao avulsa de material com controle de lote exige lote informado` + `devolucao avulsa COM lote informado passa` — mesmo arquivo | ✅ `38d2391` |
| Sucata com lote bloqueado falha **antes** de creditar o estoque (sem estado parcial) | `devolucao para sucata com lote bloqueado falha ANTES de creditar o estoque` — mesmo arquivo | ✅ `38d2391` |
| `saidas-elegiveis` lista as entregas com o devolvível, mantém a zerada e ordena da mais recente | `saidas-elegiveis lista as entregas do material com o saldo devolvivel` + `…mantem a saida ja devolvida por inteiro, com saldo 0` — mesmo arquivo | ✅ `4d5f79f` |
| `saidas-elegiveis` **não** oferece descarte, ajuste, entrada nem saída cancelada | `saidas-elegiveis nao oferece descarte, ajuste, entrada nem saida cancelada` — mesmo arquivo | ✅ `4d5f79f` |
| **As duas pontas usam o mesmo número**: o `saldo_devolvivel` da rota é exatamente o limite que a validação aplica | `[duas pontas] o saldo_devolvivel da rota e exatamente o limite que a validacao aplica` — mesmo arquivo | ✅ `4d5f79f` |
| A leitura identifica a entrega (lote, requisição, OS, projeto, quem retirou) e traz as séries | `saidas-elegiveis identifica a entrega…` + `saidas-elegiveis traz as series entregues naquela saida` — mesmo arquivo | ✅ `4d5f79f` |
| Devolução de material serializado **reativa a série** entregue | `devolucao de material com serie reativa a serie da saida` + `devolucao para quarentena tambem aceita serie` — mesmo arquivo | ✅ `9e27bcb` |
| Devolver ao estoque sem informar a série de material serializado é recusado | `devolucao ao estoque de material com serie sem informar a serie e recusada` — mesmo arquivo | ✅ `9e27bcb` |
| Série em destino de descarte é recusada **ensinando o caminho de dois passos** | `devolucao para sucata de material com serie recusa e explica o caminho` (e o equivalente de RETRABALHO) — mesmo arquivo | ✅ `9e27bcb` |
| Devolução recusada não deixa linha gravada | `[compensacao] devolucao avulsa sem lote recusada nao deixa linha gravada` — mesmo arquivo | ✅ `eabd848` |
| Devolução recusada não encolhe o devolvível da entrega citada | `[compensacao] devolucao vinculada recusada nao encolhe o saldo_devolvivel da entrega` — mesmo arquivo | ✅ `eabd848` |
| Devolução com movimentação já gravada **mantém** a linha (rastro do estoque) | `[compensacao] devolucao com movimentacao JA gravada mantem a linha (rastro do estoque)` — mesmo arquivo | ✅ `eabd848` |
| **Etapa 97** — devolução para sucata no legado (caixa sem reserva > físico) completa com as duas pernas no livro | `[97 I-4] (Fase 2) devolucao para SUCATA no legado (caixa 4 > fisico 2): 201, as duas pernas no livro` — `portasAvulsasCaixa.api.test.js` | ✅ `65dc74b2` |
| **Etapa 97** — a separação não cai entre as duas pernas (SUCATA e QUARENTENA) | `[97 F5-2] devolucao com duas pernas (SUCATA e QUARENTENA) x separacao entre as pernas: a separacao espera a devolucao inteira — 0/5 com caixa + bloqueado > fisico, por destino` — mesmo arquivo | ✅ `3810f79a` |
| **Etapa 97** — a quarentena da devolução (`BLOQUEIO` interno) continua bloqueando, mesmo com caixa | `[97 RN-08] a devolucao para QUARENTENA (BLOQUEIO interno, sem a opcao) continua 201 e bloqueia o devolvido, mesmo com caixa` — mesmo arquivo | ✅ `65dc74b2` |

**Testes de tela** (`DevolucoesAlmoxarifado.test.js`, `0722bfd` — 11 casos): lista com material,
destino e saída de origem; a sugestão condição→destino e o fato de que **ela não trava** a escolha
manual; saída já devolvida por inteiro desabilitada; `max` da quantidade igual ao devolvível;
quantidade acima do devolvível não chega a ser enviada; devolução avulsa não manda
`movimentacao_saida_id`; lote herdado em leitura vs. seletor; checkboxes de série; e o destino Sucata
em material serializado sem checkboxes, explicando o caminho.

## Dependências

- 03 (movimentação) · 09 (inspeção — a ligação da quarentena de devolução com a fila formal continua
  aberta) · 15 (sucata) · 16 (ferramentas) · 22 (custo de projeto) · 13 (devolução de cliente).

## Etapa 97 — a perna SUCATA na régua de hoje e as duas pernas sob uma trava do material (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md` (`eb7cd9d8`, Fase 2
`4a9cf5c1`). Range `eb7cd9d8..3fc39310`. A régua da caixa (as portas avulsas não levam o material separado na caixa sem
reserva de uma requisição) está na feature 03; aqui, só o que toca a devolução.

**O que estava errado:**
- **Fase 2 (I-4, reproduzido):** com a régua nova aplicada a toda `SUCATA`, no legado (caixa sem reserva maior que o
  físico) a `ENTRADA_DEVOLUCAO` gravava e a perna `SUCATA` recusava — devolução pela metade (`ESTADO_PARCIAL`).
- **Fase 5 (achado 2, igual antes da 97 — 20/20 na base):** cada perna pegava a trava do material sozinha; uma
  separação que caísse entre a entrada e a segunda perna separava o que a entrada acabou de creditar, e a segunda perna o
  levava — `SUCATA`: físico 0 com caixa 4; `QUARENTENA`: bloqueado 4 + caixa 4 sobre físico 4 — e a entrega ficava presa
  em *"Máximo: 0"* (**C192**).

**Entregue:**
- [x] **A perna `SUCATA` na régua de hoje** — `65dc74b2`: `returnService` passa `{ ...opcoes, parDaDevolucao: true }`
  no 4º argumento (nunca do body); o motor a trata como a entrega (régua do `disponivelSql`).
- [x] **As duas pernas sob uma trava do material** — `3810f79a` (B500): os destinos `QUARENTENA` (`ENTRADA_DEVOLUCAO`
  + `BLOQUEIO`) e `SUCATA` (`ENTRADA_DEVOLUCAO` + `SUCATA`) rodam dentro de `trava.naTravaDoMaterial(material_id, …)`; o
  motor ali dentro roda direto (a seção segura o material); a compensação (`catch`) roda fora da trava. `ESTOQUE` e
  `RETRABALHO` (uma perna só): a trava do próprio motor basta.

**Plano que estava errado, dito à vista:** a I-4 da Fase 2 justificava a régua de hoje na perna `SUCATA` com *"o par soma
zero"* — **só vale sem concorrência**: sem nada entre as pernas. Sem a trava, uma separação no meio fazia o par levar a
caixa (achado 2 da Fase 5). O certo é: régua de hoje **e** as duas pernas sob uma trava (`3810f79a`).

**Fica de fora (declarado):** o `BLOQUEIO` interno da quarentena continua sem a guarda do bloqueio avulso (num estado já
inconsistente a devolução quebraria depois da entrada gravada — B496 (i)); o `ESTADO_PARCIAL` continua sem notificação
(pendência da Etapa 7, acima).

**Testes:** `portasAvulsasCaixa.api.test.js` — *"[97 I-4] (Fase 2) devolucao para SUCATA no legado (caixa 4 > fisico 2):
201, as duas pernas no livro"*, *"[97 F5-2] devolucao com duas pernas (SUCATA e QUARENTENA) x separacao entre as
pernas: a separacao espera a devolucao inteira — 0/5 com caixa + bloqueado > fisico, por destino"*, *"[97 RN-08] a
devolucao para QUARENTENA (BLOQUEIO interno, sem a opcao) continua 201 e bloqueia o devolvido, mesmo com caixa"*.
Controle (s11) da T1: a perna `SUCATA` sem a opção → a devolução dá 400 com a entrada gravada. `test:api` 338/338
(4163 ✓). Continua 🟢.
