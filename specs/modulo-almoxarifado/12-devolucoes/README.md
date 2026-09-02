# 12 — Devoluções

> **Status:** 🟢 — **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd` + `eabd848`/`7fc1b7f`)**: a
> devolução cita a saída original (com validação de quantidade), herda o lote, reativa a série,
> tem tela dedicada em `/almoxarifado/devolucoes` — e o **bug de saldo do destino SUCATA foi
> corrigido**. O cabeçalho anterior dizia *"falta vínculo à saída original e devolução com lote"*:
> **isso está entregue**. · **Spec original:** seção 16
> **Última atualização:** 2026-08-12 — Etapa 7 (Tasks 1, 3, 4, 5, 7) + o conserto de compensação
> fora do plano
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
vez de implícito.

## Checklist

### Backend
- [x] Vincular devolução à **movimentação de saída original** (`movimentacao_saida_id`) — validar quantidade devolvida ≤ entregue — **`38d2391`** (colunas + validação) e **`4d5f79f`** (rota que alimenta a tela). O vínculo é **opcional, mas validado quando informado** (decisão 2 do design): obrigatório foi descartado porque tornaria impossível devolver o que saiu por um caminho sem registro (sobra antiga, material entregue antes do sistema); "continua avulso" foi descartado porque é justamente o buraco que esta spec mais citava. A recusa por quantidade **diz quanto resta** — mensagem sem número obriga o operador a adivinhar
- [x] Devolução **com lote** — **`38d2391`**. Herda o `lote_id` da saída original quando o material tem `controle_lote`; lote informado à mão ganha do herdado; devolução avulsa exige o lote pelo seletor da tela. Resolve o saldo que ficava **preso**: entrava com `lote_id NULL` e a saída seguinte, que exige lote, não achava nenhum
- [x] Devolução com **número de série** — **`9e27bcb`**. Destinos `ESTOQUE`/`QUARENTENA`: o motor reativa a série `ENTREGUE → EM_ESTOQUE` (`seriesService.entradaSeries`). Antes, devolver material serializado voltava o saldo **sem voltar a peça**, quebrando o invariante `COUNT(séries presentes) == quantidade_atual` da Etapa 6b a cada devolução
- [x] Condição → destino: boa → estoque · suspeita → quarentena · danificada → sucata — **`0722bfd`**, entregue **como sugestão na tela**. O backend aceita qualquer combinação **de propósito**: uma regra rígida no motor criaria um caso sem saída (material bom que precisa ir para inspeção por outro motivo). Trocar o destino à mão não é desfeito pela sugestão — quem decide é quem está com a peça na mão. "Suspeita → inspeção (feature 09)" foi implementada como **quarentena** (`ENTRADA_DEVOLUCAO` + `BLOQUEIO`): o físico volta, o disponível não sobe. Ligar isso à fila formal de inspeção da feature 09 continua aberto
- [ ] Tipos de devolução (spec 16): produção, projeto, instalação externa, ferramenta (feature 16), não utilizado, ao fornecedor, do fornecedor, de cliente (feature 13), assistência técnica. **Continua aberto** — é uma **coluna a mais** nesta tabela, não tabela nova; conteúdo das features 13/16
- [ ] Fotos da devolução (anexos) — **fora do escopo da Etapa 7, declarado**
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
- [ ] Atualizar custo do projeto (estorno de consumo — feature 22) — **fora do escopo da Etapa 7, declarado**
- [ ] Devolução ao fornecedor: fluxo próprio com documento e e-mail — **fora do escopo da Etapa 7, declarado**. Não é "a mesma devolução com outro destino": tem documento fiscal e contraparte externa
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

**Testes de tela** (`DevolucoesAlmoxarifado.test.js`, `0722bfd` — 11 casos): lista com material,
destino e saída de origem; a sugestão condição→destino e o fato de que **ela não trava** a escolha
manual; saída já devolvida por inteiro desabilitada; `max` da quantidade igual ao devolvível;
quantidade acima do devolvível não chega a ser enviada; devolução avulsa não manda
`movimentacao_saida_id`; lote herdado em leitura vs. seletor; checkboxes de série; e o destino Sucata
em material serializado sem checkboxes, explicando o caminho.

## Dependências

- 03 (movimentação) · 09 (inspeção — a ligação da quarentena de devolução com a fila formal continua
  aberta) · 15 (sucata) · 16 (ferramentas) · 22 (custo de projeto) · 13 (devolução de cliente).
