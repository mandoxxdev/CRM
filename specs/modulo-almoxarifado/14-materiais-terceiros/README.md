# 14 — Materiais Enviados a Terceiros

> **Status:** 🟢 **completa** — a feature fecha com as **duas metades**:
> **Etapa 8b** (`0a01124..b176212`, 2026-08-12) — remessa e retorno do **MESMO** material, o que
> volta é o que saiu (galvanizar, pintar, tratar); e **Etapa 8c** (`753d23b..61c6f52`, 2026-08-13) —
> **transformação**: o que volta é **outra coisa** (cortar, dobrar, usinar). A chapa é baixada de
> verdade (patrimônio **e** retenção) e as peças e a sobra entram como material próprio, herdando o
> **dono** da chapa e o **custo** dela rateado por quantidade.
> **Etapa 31 (2026-08-31, `1e6c9a9..67b6758`) — o NÚMERO deste documento mudou de forma, e só ele.** O `REM-` era montado com os **últimos dígitos** do milissegundo mais um sorteio de 0 a 99, e por isso o carimbo **repetia** a cada **27,78 horas** — é o número cuja colisão aparecia como flake de `remessaTerceiroCiclo` desde a Etapa 29. Agora vem do gerador único `services/almoxarifado/numeroDoc.js` (relógio inteiro em base36 + 8 aleatórios), com retry na colisão. **Nada mais desta feature mudou** — nem status, nem checklist, nem comportamento: o número passa de 12–14 caracteres só com dígitos para 20 com letras, os antigos **não** foram migrados e continuam legíveis (RN-05, testada). Furo **C41** das novidades.
> **Spec original:** seção 18 · **Última atualização:** 2026-08-13
>
> | Etapa | Design | Plano |
> |---|---|---|
> | 8b | [`…/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md`](../../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md) | [`…/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md`](../../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md) |
> | 8c | [`…/specs/2026-08-13-almoxarifado-etapa8c-transformacao-design.md`](../../../docs/superpowers/specs/2026-08-13-almoxarifado-etapa8c-transformacao-design.md) (commit `753d23b`, **corrigido em `601436d`** — ver "Correção de spec declarada") | [`…/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md`](../../../docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md) |
>
> ## A feature foi dividida em 8b e 8c — e a fronteira era real
>
> A Etapa 8 do plano mestre cobria as features **13 e 14**, e foi dividida em 2026-08-12 (Etapa 8 =
> clientes, Etapa 8b = terceiros). Na sessão de design da 8b, a **decisão 1** dividiu de novo:
>
> - **Etapa 8b — remessa e retorno do MESMO material** (entregue 2026-08-12): máquina de estados,
>   saldo em terceiros, documento de remessa, retorno parcial, encerramento com destino obrigatório,
>   tela.
> - **Etapa 8c — transformação** (entregue 2026-08-13): o material que volta **não é** o que saiu.
>
> **Por que não foi "cortar pela metade":** metade dos beneficiamentos da lista da spec —
> **tratamento, pintura e galvanização** — devolve o **mesmo** material, com o mesmo código. Para
> esses, a 8b entrega o ciclo **completo, sozinha**. Só **corte, dobra e usinagem** devolvem
> material diferente, e é aí que entrou a modelagem nova. Mesmo precedente da Etapa 6 (6/6b/6c).
>
> **A 8b não fechou a porta da 8c, e a 8c confirmou isso:** o retorno já nascera modelado como
> *lista de resultados* (`retornos_remessa_item_almoxarifado`, com `material_id` próprio) e não como
> escalar "quantidade que voltou" — a 8c acrescentou **três colunas** àquela tabela e **nenhuma**
> migração de dados (só `safeAlter`). A tabela não precisou ser reescrita.
>
> **A diferença de natureza entre as duas metades**, que é o que organizou o design da 8c: na 8b a
> remessa é **retenção pura** — o material nunca sai do patrimônio, só não está no prédio, então o
> retorno não credita nada. Na transformação a chapa **deixa de existir**: sai do patrimônio **e**
> da retenção, e as peças entram como material novo. São dois efeitos de **sinais opostos em
> materiais diferentes**, e metade já estava pronta desde a 8b (`CONSUMO_TERCEIRO` já fazia a baixa
> definitiva com claim duplo; faltava o crédito).

## Objetivo

Remessas para beneficiamento externo (corte, dobra, usinagem, tratamento, pintura, galvanização...) com saldo "em terceiros", prazos, retornos parciais e transformação de material (código original → componente resultante).

## O que já existe

**Entregue pela Etapa 8b (2026-08-12):**

- `materiais_almoxarifado.quantidade_em_terceiros` — a **quarta coluna de retenção**, e a conta do
  disponível centralizada em `services/almoxarifado/availabilitySql.js` (`0a01124`).
- Três tabelas: `remessas_terceiro_almoxarifado`, `itens_remessa_terceiro_almoxarifado`,
  `retornos_remessa_item_almoxarifado` (`258f5d2`).
- `services/almoxarifado/thirdPartyStateMachine.js` (transições declaradas) e
  `services/almoxarifado/thirdPartyService.js` (criar / enviar / retornar / encerrar / cancelar /
  vencidas).
- Quatro tipos de movimento no motor: `REMESSA_TERCEIRO`, `RETORNO_TERCEIRO`, `PERDA_TERCEIRO`,
  `CONSUMO_TERCEIRO` (`e0be211`).
- Ação de perfil `remessar_terceiro` em `ACAO_PERFIS`, exposta em `/almoxarifado/minhas-permissoes`.
- Sete rotas em `routes/almoxarifado/extended.js` + `GET /remessas-terceiros/vencidas` (`11a73cb`).
- Tela `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js` e
  `client/src/utils/remessaPdf.js` (`b176212`).

**Pontos de apoio que a etapa consumiu sem reabrir** (vindos da Etapa 8): guarda do dono
(`ownerRules.js`), modelo de propriedade `proprietario_cliente_id`, precedente de ação de perfil
própria, PDF gerado no navegador, e a auditoria nomeada das 40 leituras de `materiais_almoxarifado`.

**Entregue pela Etapa 8c (2026-08-13) — a transformação:**

- `services/almoxarifado/materialService.js` (**novo**, `028da1e`): `createMaterial` extraído do
  handler HTTP, `GET /proximo-codigo` passa a usar o **`MAX` do sufixo numérico** (antes era
  `ORDER BY id DESC`, que erra quando o código de maior `id` não é o de maior número) e
  `codigo_auto` liga **retry sob `UNIQUE`** (até 5 tentativas). Sem `codigo_auto`, comportamento
  idêntico ao de antes (400 `'Código já existe'`).
- **Recebimento por NF passa a alimentar o custo médio** (`8cd3fcf`) — `receiptService` passava a
  entrada **sem** `custo_unitario`, apesar de gravar `valor_unitario` na linha. Sem isso o rateio da
  transformação distribuiria R$ 0,00 na maioria dos casos: a conta fecharia e seria inútil. **Vale
  só daqui para frente** — não há backfill possível, o ledger não tem coluna de custo.
- Três colunas novas em `retornos_remessa_item_almoxarifado` (`3e1a8dd`, mais `03c7ce5` que
  antecipou `TIPOS_RESULTADO` para `schema.js` porque a Task 6 não roda sem ele): `tipo_resultado`,
  `custo_unitario_aplicado`, `movimentacao_consumo_id`. Só `safeAlter` — **nenhuma migração de
  dados**, e `NULL` é o valor histórico que significa "retorno simples da 8b".
- Tipo de movimento `RETORNO_TRANSFORMACAO` dentro do motor (`9c7ec75`), nas **duas** listas
  `tiposEntrada` (`registrarMovimentacao` **e** `cancelarMovimentacao`) — esquecer a segunda faria o
  estorno marcar `cancelado = 1`, gravar linha de `ESTORNO` e **não devolver saldo nenhum**.
- `ownerRules.assertMesmoDonoNaTransformacao` (`d791fe2`): a peça tem de ter o **mesmo dono** da
  chapa. Não é dedução — decorre da guarda da Etapa 8; sem ela, transformar converteria material de
  cliente em patrimônio da GMP em silêncio.
- `services/almoxarifado/transformCost.js` (**novo**, `f6dbe39`): `ratearCusto`, **função pura**
  (sem `db`, sem `async`), com o invariante testado. Rateio por **quantidade** entre as peças,
  **sobra a custo zero** (decisão do cliente).
- `thirdPartyService.registrarTransformacao` (`a9fe371`): pré-checagem de **todas** as linhas antes
  de mover qualquer coisa, claim no `WHERE`, compensação explícita no `catch` — mesma forma da 8b,
  SQLite sem transação.
- Rota `POST /almoxarifado/remessas-terceiros/:id/transformacoes`, schema Zod
  `TransformacaoRemessaSchema` e `calcularRendimento` (`31cf440`).
- Modal de transformação com **N resultados**, classificação Peça/Sobra, atalho **"Criar material
  resultante"** e **toast de rendimento** (`61c6f52`).

**Dois achados que a execução da 8c produziu fora do escopo planejado** (commits próprios, um
assunto cada):

- `a644ab7` — **o relatório valorava material a ZERO**: a leitura de custo virou fonte única em
  `services/almoxarifado/custoSql.js`.
- `3ef0144` — **a posição por cliente mentia**: as listas de tipos de movimento viraram fonte única
  em `services/almoxarifado/movementTypes.js`.

## Checklist

### Backend
- [x] Tabela `remessas_terceiro_almoxarifado`: fornecedor, pedido/OS relacionado, prazo previsto, status (ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA) (`258f5d2`)
- [x] Itens da remessa: material, quantidade, peso, lote (`258f5d2`) — **desenhos anexos NÃO**: fora do escopo declarado (decisão 10 do design da 8b), não bloqueia o ciclo. **A 8b escreveu aqui que "a 8c é o consumidor natural dele". A 8c NÃO o consumiu** — o modal de transformação recebe material, quantidade e classificação, e nenhum anexo. O item **continua aberto** e não tem mais etapa natural marcada: quem quiser desenho no item da remessa abre uma etapa para isso
- [x] Envio = saldo visível mas **não disponível** (`0a01124`, `e0be211`, `257a444`) — **não** por localização virtual: a redação original desta spec propunha isso e **estava errada** (ver "Correção de spec declarada", abaixo)
- [x] Documento de remessa (PDF) (`b176212`)
- [x] Retorno parcial/total: entrada vinculada à remessa (`69d32a8`)
- [x] Perda ou consumo no terceiro: baixa com motivo (`519e471`) — destino obrigatório (`PERDA_NO_TERCEIRO` / `CONSUMIDO_NO_PROCESSO`) **mais** justificativa; os dois baixam físico e retenção no mesmo lançamento
- [x] **Transformação**: registrar novos códigos resultantes (chapa → peças cortadas + sobra) mantendo vínculo material original → componente — **Etapa 8c, 2026-08-13** (`753d23b..61c6f52`). Task a task:
  - `028da1e` — `materialService.createMaterial` extraído do handler HTTP; `GET /proximo-codigo` usando **`MAX` do sufixo numérico**; `codigo_auto` com **retry sob `UNIQUE`**
  - `8cd3fcf` — recebimento por NF passa a **alimentar o custo médio** (pré-requisito: sem ele o rateio distribui R$ 0,00)
  - `3e1a8dd` (+ `03c7ce5`, que antecipou `TIPOS_RESULTADO` para `schema.js`) — três colunas novas em `retornos_remessa_item_almoxarifado`: `tipo_resultado`, `custo_unitario_aplicado`, `movimentacao_consumo_id`
  - `9c7ec75` — tipo de movimento `RETORNO_TRANSFORMACAO` dentro do motor, nas **DUAS** listas `tiposEntrada`
  - `d791fe2` — `assertMesmoDonoNaTransformacao` em `ownerRules.js`
  - `f6dbe39` — `transformCost.ratearCusto`, **função pura**, com invariante testado
  - `a9fe371` — `thirdPartyService.registrarTransformacao`
  - `31cf440` — rota `POST /almoxarifado/remessas-terceiros/:id/transformacoes`, schema Zod `TransformacaoRemessaSchema`, `calcularRendimento`
  - `61c6f52` — modal de transformação com N resultados, classificação, atalho "Criar material resultante" e toast de rendimento
  - **Extras achados durante a etapa** (fora do plano, commit próprio cada): `a644ab7` (leitura de custo vira fonte única, `custoSql.js`) e `3ef0144` (listas de tipos viram fonte única, `movementTypes.js`)
- [ ] Acompanhamento de prazo + alerta de atraso — **o prazo é gravado**, `GET /remessas-terceiros/vencidas` existe (`11a73cb`) e a tela destaca a remessa vencida (`b176212`); o **disparo** do alerta é da **feature 20** (decisão 10 do design da 8b). Não há agendador no projeto e introduzir um é decisão de infraestrutura. **A 8c não mexeu nisso** — fora do escopo declarado, é outra feature
- [ ] E-mail no envio e retorno — **feature 19** (decisão 10 do design da 8b), mesma razão da Etapa 8: não travar a etapa esperando outra feature. **A 8c não mexeu nisso** — fora do escopo declarado, é outra feature

### Frontend
- [x] Tela de remessas (criar, acompanhar, receber retorno, encerrar, cancelar) (`b176212`) — **mais o modal de transformação** (`61c6f52`): N linhas de resultado, classificação Peça/Sobra, campo opcional de custo do serviço, atalho **"Criar material resultante"** (que cadastra na hora já com a família e o dono da chapa) e **toast de rendimento**. Duas ressalvas escritas para não virarem afirmação confortável e falsa: (a) o botão "Criar material resultante" **aparece** para quem não tem `criar_material` — `bloquearSeNaoPode` barra no `onClick` e **falha aberto** de propósito (`criar_material` e `remessar_terceiro` têm gates diferentes: ENGENHARIA cria material e **não** transforma); (b) o **rendimento não fica guardado** em lugar nenhum — não há coluna de rendimento, ele aparece **num toast, uma vez**, logo depois de confirmar
- [x] Posição "o que está em cada terceiro" — a listagem traz o **terceiro**, o serviço, o prazo, o status e o total de itens de cada remessa, e filtra por **status** (`b176212`). **Duas ressalvas escritas, porque a versão anterior desta linha exagerava:** (a) **não** é uma tela separada de "posição por terceiro" agregando saldo por fornecedor — o design não a pediu; (b) o filtro por **fornecedor** existe na **API** (`GET /remessas-terceiros?fornecedor_id=`, `11a73cb`) mas **não foi exposto na tela** — o único `select` da tela é o de status. Quem quiser a posição de um terceiro específico hoje lê a coluna, ou chama a rota

## Correção de spec declarada

**Esta spec dizia, no checklist de backend: *"Envio = saída para localização virtual 'Em terceiros'
(via movimentação v2 — saldo visível mas não disponível)"*. Isso está ERRADO**, e a correção faz
parte da entrega da 8b (decisão 2 do design).

`stockService.getSaldoDisponivel` calcula sobre o **escalar** `materiais_almoxarifado.quantidade_atual`
— material numa localização virtual **continuaria disponível para saída**. Ou seja: a solução
proposta pela própria spec **não entregava o requisito que ela mesma enunciava** ("saldo visível mas
não disponível").

**O que foi feito:** quarta coluna de retenção `quantidade_em_terceiros`, no padrão das três
existentes, **mais** a mudança na conferência de inventário — `quantidade_sistema` passa a ser
`quantidade_atual − quantidade_em_terceiros`, e **só essa** retenção é descontada, porque é a única
das quatro que significa "não está no prédio".

*A afirmação errada está registrada aqui em vez de apagada em silêncio, porque quem a leu antes
pode ter acreditado nela — e a localização virtual é uma ideia que volta sozinha.*

> **Uma segunda correção, esta no design e não na spec:** a primeira versão do design da 8b dizia
> que a conta do disponível estava replicada em **sete** lugares. Eram **quatorze**, em 8 arquivos
> (corrigido em `742b9ea`). É o **segundo** erro do mesmo tipo na sequência — a spec da Etapa 8
> mandou auditar um subconjunto de diretórios e deixou de fora as duas piores leituras. A regra que
> fica escrita: **mudança em coluna de `materiais_almoxarifado` exige varredura de `server/`
> inteiro, nunca de um subconjunto escolhido por intuição.** A Task 1 fechou essa porta de vez: a
> conta passou a existir só em `availabilitySql.js`, e o teste **varre o código-fonte** provando que
> sobrou zero réplica — "sobrou zero" não depende de eu ter contado certo.

### Terceira correção — o design da 8c estava ERRADO sobre o invariante de custo

**A decisão 4 do design da 8c afirmava, literalmente:** *"Não existe coluna de valor no sistema —
valor é sempre `quantidade × custo`, calculado na leitura. […] O patrimônio não se move porque **não
há um segundo lugar onde ele possa discordar**."*

**Isso está ERRADO. Há dois — e a decisão 11.1 do MESMO documento os nomeia:**

1. **Duas famílias de leitura de valor divergentes no código.** Uma usa `custo_unitario` **puro**
   (`routes/almoxarifado.js:249` e `:1048`); a outra usa `COALESCE(custo_medio, custo_unitario, 0)`
   (`reportService.js`, `stockService.js`, `requisitionValueApprovalService.js`).
2. **O ramo de entrada com custo escreve as duas colunas com valores DIFERENTES**
   (`stockService.js`, ramo `custoInformado > 0`): `custo_medio` recebe a **média ponderada**,
   `custo_unitario` recebe o custo **desta** entrada. Se o material-peça já tinha saldo a outro
   custo, as duas leituras dão totais diferentes — o invariante fecha numa e **não** na outra.

**Onde o invariante realmente fecha:** na **função pura** (`transformCost.ratearCusto`, com o
invariante testado em `transformCost.api.test.js`), e nas leituras **quando os materiais de destino
não têm custo prévio** — que é exatamente a condição que os testes do invariante exigem, escrita na
asserção, com o motivo. Fora dessa condição, o invariante é uma afirmação sobre a conta, não sobre a
tela.

**Consequência prática registrada na mesma linha (a sobra):** o crédito com `custo_unitario = 0` cai
no ramo **sem custo informado**, que **não escreve custo nenhum**. Isso é o que impede a sobra a
custo zero de **zerar o cadastro** do material da sobra — e é também o que faz a sobra **entrar
carregando o custo que aquele material já tinha**. Numa contagem de patrimônio, isso aparece do lado
de dentro.

O erro era **interno ao próprio documento de design**: as decisões 4 e 11.1 foram escritas sem
cruzar uma com a outra. Foi corrigido no design em `601436d`, **sem apagar a afirmação errada** — e
está registrado aqui pelo mesmo motivo que as duas correções acima: apagar em silêncio já fez o
próximo confiar na afirmação errada de novo.

**O que a execução da 8c fez a respeito:** `a644ab7` unificou a leitura de custo em
`services/almoxarifado/custoSql.js`. Isso **reduziu** o problema (1) — mas **não** resolveu o (2):
as duas colunas continuam sendo escritas com valores diferentes pelo ramo de entrada com custo. Ver
pendência 6.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Onde |
|-------|-------|------|
| Material em terceiros sai do disponível mas segue no patrimônio | `envio a terceiro remove do disponivel e mantem quantidade_atual` | `remessaTerceiroMotor.api.test.js` |
| **A contagem de inventário não cobra o que está no terceiro** | `conferencia desconta o que esta em terceiros do esperado` | `conferenciaEmTerceiros.api.test.js` |
| Bloqueado e quarentena **continuam** sendo contados (controle positivo) | `conferencia continua cobrando material bloqueado e em quarentena` | `conferenciaEmTerceiros.api.test.js` |
| Retorno acima do enviado falha, dizendo quanto ainda está lá | `retorno maior que a remessa falha` | `remessaTerceiroCiclo.api.test.js` |
| Encerrar remessa com pendência **sem destino** falha | `encerrar remessa com pendencia sem destino falha` | `remessaTerceiroCiclo.api.test.js` |
| Encerrar com destino **zera** o saldo retido | `encerrar com perda no terceiro zera o em_terceiros` | `remessaTerceiroCiclo.api.test.js` |
| Cancelar remessa ENVIADA devolve ao disponível | `cancelar remessa enviada restaura o disponivel` | `remessaTerceiroCiclo.api.test.js` |
| Remessa não move **nenhum** item se um falhar | `remessa com item sem saldo nao move nenhum item` | `remessaTerceiroCiclo.api.test.js` |
| Material de cliente vai a terceiro isento de OS/projeto | `remessa de material de cliente nao exige vinculo do dono` | `remessaTerceiroMotor.api.test.js` |
| Sem a ação `remessar_terceiro`, a remessa é recusada (403) | `remessa sem a acao remessar_terceiro falha com 403` | `remessaTerceiroCiclo` (serviço) + `remessaTerceiroRotas` (rota) |
| **Transformação mantém vínculo de rastreabilidade** — o vínculo existe em **duas colunas**: `movimentacao_consumo_id` aponta para a **baixa da chapa** (`CONSUMO_TERCEIRO`) e **agrupa todas as N linhas do mesmo evento**; `movimentacao_id` aponta para o **crédito da peça** (`RETORNO_TRANSFORMACAO`) | as N linhas da mesma transformação compartilham o mesmo `movimentacao_consumo_id`; a chapa zera patrimônio **e** retenção; o `id` do `CONSUMO_TERCEIRO` é **menor** que o dos créditos | `transformacaoTerceiro.api.test.js` (**48 testes**) |
| A peça cortada tem de ter o **mesmo dono** da chapa (par positivo + negativo) | recusa nomeando os dois donos; par positivo na mesma task | `transformacaoTerceiro.api.test.js` |
| `RETORNO_TRANSFORMACAO` é **entrada** e o estorno devolve saldo de verdade | estorno cai nas **duas** listas `tiposEntrada` | `transformacaoMotor.api.test.js` |
| Rateio por quantidade fecha; sobra a custo zero não dilui as peças | invariante da função pura, com sobra sem custo prévio (ver "Terceira correção") | `transformCost.api.test.js` |

**Etapa 8b:** seis arquivos de teste novos (`saldoEmTerceiros`, `conferenciaEmTerceiros`,
`remessaTerceiroEstados`, `remessaTerceiroMotor`, `remessaTerceiroCiclo`, `remessaTerceiroRotas`),
mais 24 testes de client (tela + PDF).

**Etapa 8c:** cinco arquivos de teste novos no servidor — `materialServiceCriacao`,
`recebimentoCustoMedio`, `transformacaoTerceiro` (**48**), `transformacaoMotor`, `transformCost` —
mais a suíte nova de client `RemessasTerceirosTransformacao.test.js`.

**Gates medidos ao fim da 8c (2026-08-13) — números REAIS, não previstos:**

| Suíte | Medido |
|---|---|
| `cd server && npm run test:api` | **81/81 arquivos OK** |
| `cd server && npm run test:almoxarifado` | **42 passou, 0 falhou** |
| `cd server && npm run test:validation` | **4 passed, 0 failed** |
| `cd server && npm run test:safealter` | **3 passed, 0 failed** |
| `cd server && npm run test:sqlite` | **3 passed, 0 failed** |
| `cd client && CI=true npx react-scripts test --watchAll=false` | **283 testes / 25 suítes, todos passando** |
| `cd client && CI=true npx react-scripts build` | **Compiled successfully.** |

*Para comparação, os gates ao fim da 8b eram: `test:api` **74/74 arquivos**, `test:almoxarifado`
**42/0**, `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client **268
testes em 24 suítes**, build `Compiled successfully.`*

## Decisões desta feature que valem para quem continuar

- **Só `quantidade_em_terceiros` sai da contagem de inventário.** As outras três retenções são
  estados **administrativos** de material que **está** na prateleira. Quem "uniformizar as quatro"
  passa a esconder do inventário material que está no galpão. Está comentado no código
  (`routes/almoxarifado.js`, criação da conferência) e coberto nos dois sentidos.
- **Fornecedor é `INTEGER` sem FK + nome espelhado.** `fornecedores` é criada em `server/index.js`,
  **não** pelo `initSchema` do almoxarifado — pode não existir. Padrão do módulo
  (`lotes_almoxarifado`, `recebimentos_material_almoxarifado`), com leitura protegida por
  `sqlite_master`. No teste: **stub no harness, nunca fallback na query.**
- **Tipos de movimento dedicados para a baixa do encerramento** (`PERDA_TERCEIRO`/`CONSUMO_TERCEIRO`,
  em vez de reusar `PERDA`/`SUCATA`): reusar quebraria o encerramento de remessa de material **de
  cliente** (os dois estão em `TIPOS_SAIDA_COM_DONO`) e deixaria a retenção presa.
- **O par remessa/retorno não é estornável pelo livro** — sem guarda, o estorno gravaria a linha e
  **não tocaria** em `quantidade_em_terceiros`, com o livro afirmando uma reversão que não
  aconteceu. `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` **continuam** estornáveis, e o estorno devolve ao
  **disponível** (a remessa já está encerrada; recriar a retenção deixaria saldo preso).
- **`quantidade_retornada` tem TRÊS significados — e continua tendo.** A 8b escreveu aqui:
  *"`quantidade_retornada = quantidade` no encerramento significa LIQUIDADO, não 'voltou'. Corrigir
  de vez custa uma coluna nova (`quantidade_baixada`) + `safeAlter` — **a 8c decide isso junto com a
  transformação**."* **A 8c NÃO criou `quantidade_baixada`**, e a coluna passou de dois significados
  para **três**:

  1. **voltou como era** (retorno simples da 8b);
  2. **foi liquidado no encerramento** (perda ou consumo no terceiro — o item fica com pendente zero
     sem ter retornado nada);
  3. **foi consumido numa transformação** (a `quantidade_consumida` da 8c também entra aqui).

  **Motivo da adiação, escrito:** a coluna nova obrigaria a **migrar dois significados já gravados**
  e a mexer em `encerrarRemessa`, `cancelarRemessa` e na tela — **três caminhos estáveis**, por um
  problema de **rótulo e não de número**: o pendente continua **correto** nos três casos.

  **O que a 8c entregou no lugar:** (a) `tipo_resultado` na linha de resultado, que torna o terceiro
  significado **legível no dado** e não só no cabeçalho (`WHERE tipo_resultado IS NOT NULL` separa
  os dois mundos sem tabela nova); (b) o desdobramento **Retornado / Transformado / Baixado (não
  voltou)** na tela da remessa.

  **A pendência continua ABERTA** — ver pendência 5. Ela não foi apagada porque a 8c encostou nela:
  encostar não é resolver.

## ⚠️ Pendências e pontos abertos

1. **"Uma remessa não pode misturar donos" é uma regra DEDUZIDA e NÃO confirmada com a GMP.** Ela
   saiu de "o documento nomeia o proprietário", no singular, e foi implementada como recusa
   (`thirdPartyService.resolverProprietario`, com o comentário dizendo em voz alta que é dedução).
   **Se a GMP manda chapa de dois clientes na mesma viagem para o mesmo galvanizador, a regra tem de
   virar "o documento lista os donos por item".** Ponto de mudança: `resolverProprietario` + as
   colunas `proprietario_cliente_id/nome` do cabeçalho + o PDF. **Nada a migrar** — o dono de cada
   item já é lido do material.
2. **O `AJUSTE` não reconcilia `quantidade_em_terceiros`** — terceira instância da mesma pendência
   (ver [03-motor-estoque](../03-motor-estoque/README.md)). A 8b **não resolve e não piora**.
3. **Verificação manual não executada:** o Step 11 da Task 9 **do plano da 8b** (conferir no navegador a cor dos cinco
   badges e o PDF baixando legível) **não foi feito** — JSDOM não valida CSS renderizado nem PDF
   binário.
4. **Toda coluna nova de `materiais_almoxarifado` vaza para o requisitante até ser nomeada em
   `stockAvailabilityService.SENSITIVE_MATERIAL_FIELDS`** — `GET /api/requisicoes-material/materiais`
   faz `SELECT m.*` e o sanitizador exclui por **lista explícita** (proteção por exclusão: o que não
   está na lista passa). Aconteceu com `quantidade_em_terceiros` e foi corrigido em `0a01124`.

   **A 8b escreveu aqui: *"a 8c tem de repetir a checagem"*. A 8c NÃO caiu nesta pendência** — e não
   por tê-la resolvido: ela **não acrescentou nenhuma coluna em `materiais_almoxarifado`**. As três
   colunas novas da 8c (`tipo_resultado`, `custo_unitario_aplicado`, `movimentacao_consumo_id`) são
   **todas** de `retornos_remessa_item_almoxarifado`, que não é lida pelo `SELECT m.*`. Isso foi
   restrição declarada no plano da 8c, e é a mesma restrição que dispensou a varredura de `server/`
   inteiro que a Task 1 da 8b exigiu.

   **A pendência continua ABERTA. A 8c passou ao lado dela por sorte de escopo, não por resolução.**
   A próxima etapa que criar coluna em `materiais_almoxarifado` **cai nela** — e junto com ela volta
   a ser obrigatória a varredura de `server/` **inteiro** (nunca de um subconjunto escolhido por
   intuição; ver "Correção de spec declarada").
5. **`quantidade_retornada` tem TRÊS significados** (voltou / liquidado no encerramento / consumido
   numa transformação) e **não** existe `quantidade_baixada`. A 8b mandou a 8c decidir; a 8c decidiu
   **não criar a coluna**, com o motivo escrito, e entregou `tipo_resultado` + o desdobramento na
   tela em vez disso. Detalhe completo em "Decisões desta feature que valem para quem continuar".
   **Continua aberta.**
6. **As duas famílias de leitura de valor continuam divergindo entre telas.** `a644ab7` unificou a
   leitura de custo em `services/almoxarifado/custoSql.js` — o que **reduz** o problema — mas o ramo
   de entrada com custo continua escrevendo `custo_medio` (média ponderada) e `custo_unitario`
   (custo desta entrada) com valores **diferentes**. Ver "Terceira correção", acima.
7. **O estorno não reverte custo** (decisão explícita da Etapa 1), e a compensação da transformação
   reverte o custo **à mão**. É uma inconsistência **deliberada** entre os dois caminhos,
   documentada no código.
8. ~~**A mensagem de recusa de `validarRetornoDoItem` está desatualizada.**~~ **RESOLVIDA na Task 10
   da 8c**, e o registro fica porque o achado vale. A mensagem dizia que o retorno de material
   diferente *"e a Etapa 8c e ainda nao esta implementado"* (`thirdPartyService.js`,
   `validarRetornoDoItem`) — **depois de a 8c ter sido entregue**. A recusa em si sempre esteve
   correta (`registrarRetorno` **não** aceita material diferente; quem aceita é
   `registrarTransformacao`), mas o texto **mandava o operador embora com informação falsa**, que é
   o pior tipo de mensagem de erro: ela encerra a tentativa em vez de redirecioná-la. Passou a
   apontar o caminho certo (botão **Transformar** /
   `POST /almoxarifado/remessas-terceiros/:id/transformacoes`). Os dois testes que a cobrem casam
   por `/8c/`, e o texto novo continua citando a etapa — a correção **não** afrouxou a asserção.
   **Lição:** esta mensagem só foi achada porque a Task 10 releu a spec contra o código. Uma etapa
   que entrega o caminho novo tem de varrer as mensagens que diziam "isso ainda não existe".
9. **Material com saldo bloqueado E saldo em terceiros ao mesmo tempo** pode ter o encerramento da
   remessa barrado pela guarda "Material bloqueado não pode ser utilizado". Não foi mexido: é a
   mesma pendência do item 2, e a decisão é do cliente.
10. **Anexo de desenhos no item da remessa continua aberto** — a 8b apontou a 8c como "consumidor
    natural" e a 8c **não** o consumiu (ver checklist). Não há mais etapa natural marcada.

## Dependências

- 03 (movimentação) · 10 (lotes na transformação) · 19/20 (e-mails/alertas).
- **02 (localização virtual) deixou de ser dependência** — ver "Correção de spec declarada": a
  localização virtual não resolveria o requisito. A retenção é por coluna.

## Contrato novo que a 8c produz — e que a próxima etapa consome

Escrito aqui para não ser redescoberto lendo o código.

**Serviço**

```js
thirdPartyService.registrarTransformacao(db, user, remessaId, {
  nota_fiscal,                    // opcional
  itens: [{
    item_remessa_id,              // obrigatório
    quantidade_consumida,         // obrigatório, > 0, SEMPRE na unidade do ENVIADO
    custo_servico,                // opcional, >= 0 — valor TOTAL da nota do terceiro para esta linha
    lote_id, observacoes,         // opcionais
    resultados: [{                // ao menos um
      material_id, quantidade,    // obrigatórios
      tipo_resultado,             // obrigatório, 'PECA' | 'SOBRA', SEM default
      lote_id, observacoes,       // opcionais
    }],
  }],
})
```

**Os dois números são separados de propósito:** `quantidade_consumida` é a única coisa que conta no
**teto do item** — o teto da 8b continua valendo intacto. `resultados[]` tem cada um o **seu**
material e a **sua** unidade, e **nenhum** deles encosta no teto: comparar 40 peças (UN) com uma
chapa de 100 (KG) seria somar laranja com maçã.

**`custo_unitario_aplicado` NÃO está declarado no schema Zod, de propósito** — o cliente não dita o
custo da peça pela API. Quem manda é o rateio.

**Rota:** `POST /api/almoxarifado/remessas-terceiros/:id/transformacoes` · ação de permissão
**`remessar_terceiro`** · schema `schemas.TransformacaoRemessaSchema`.

> ⚠ **`remessar_terceiro` e `criar_material` são gates DIFERENTES.** ENGENHARIA cria material e
> **não** transforma. A tela trata os dois separadamente.

**Colunas novas em `retornos_remessa_item_almoxarifado`** (só `safeAlter`, sem migração de dados):

| Coluna | Tipo | O que é |
|---|---|---|
| `tipo_resultado` | `TEXT` | `'PECA'` / `'SOBRA'` (fonte única: `schema.TIPOS_RESULTADO`). **`NULL` para as linhas da 8b** — retorno simples. `WHERE tipo_resultado IS NOT NULL` separa os dois mundos sem tabela nova |
| `custo_unitario_aplicado` | `REAL` | o custo **por unidade** creditado **naquele momento** — não o custo atual do material, que muda a cada entrada seguinte |
| `movimentacao_consumo_id` | `INTEGER` | aponta para a movimentação `CONSUMO_TERCEIRO` que **baixou a chapa**, e é o **agrupador do evento**: todas as N linhas de uma mesma transformação compartilham o mesmo valor. Espelha `movimentacao_id`, que aponta para o **crédito da peça** |

**Não existe** coluna `quantidade_consumida` nem `custo_servico` na tabela de resultados: uma
transformação é **um evento com N linhas** e a tabela não tem cabeçalho de evento — gravar em cada
linha faria qualquer `SUM()` ingênuo contar o mesmo consumo N vezes. O cabeçalho do evento **já
existe**: é a movimentação `CONSUMO_TERCEIRO`, cuja `quantidade` é o consumo e cujo `id` é
`movimentacao_consumo_id`. O `custo_servico` é **entrada** do cálculo, não resultado, e fica na
`justificativa` do `CONSUMO_TERCEIRO`.

**Tipo de movimento `RETORNO_TRANSFORMACAO`:** é **entrada**, **aceita custo**, está em
`TIPOS_DEDICADOS` (portanto **fora** da rota genérica de movimentação, porque `TIPOS_MOVIMENTO_ROTA`
é derivado) e está nas **duas** listas `tiposEntrada` do motor (`registrarMovimentacao` **e**
`cancelarMovimentacao`). **Não** entra em `TIPOS_RETENCAO` e **não** é recusado pelo estorno — ao
contrário de `REMESSA_TERCEIRO`/`RETORNO_TERCEIRO`, ele é entrada de verdade e é estornável.

**Funções puras** (sem `db`, sem `async`) em `services/almoxarifado/transformCost.js`:

```js
transformCost.ratearCusto({ custoUnitarioChapa, quantidadeConsumida, custoServico, resultados })
transformCost.calcularRendimento({ materialOrigem, quantidadeConsumida, resultados })
```

Rateio por **quantidade** entre as peças, **sobra a zero**. Se **todas** as linhas forem `SOBRA` não
há denominador e o valor **evapora de propósito** — `ratearCusto` devolve `valorDistribuido = 0` e
`residuo = valorTotal`, e o resíduo é escrito na justificativa do `CONSUMO_TERCEIRO` para o número
não sumir sem rastro. `calcularRendimento` só calcula quando **todos** os materiais têm
`peso_unitario`; quando falta, diz **qual** material falta e a transformação **é registrada do mesmo
jeito**.

**Guarda de dono:** `ownerRules.assertMesmoDonoNaTransformacao(db, materialOrigem, materialResultado)`
— a peça tem de ter o **mesmo dono** da chapa, e a recusa **nomeia os dois donos**. Não é a mesma
guarda de `resolverProprietario` (que é sobre misturar donos numa remessa): esta é o par
chapa ↔ peça.

**Criação de material:** `materialService.createMaterial(db, user, data)` — o `INSERT` deixou de
estar inline no handler HTTP. `data.codigo_auto` verdadeiro torna `data.codigo` uma **sugestão** e
liga **retry sob `UNIQUE`** (até **5** tentativas, regerando o código a cada colisão). Sem
`codigo_auto`, comportamento **idêntico** ao de antes: 400 `'Código já existe'`. `GET /proximo-codigo`
usa o **`MAX` do sufixo numérico** da família, não mais `ORDER BY id DESC`.
