# Almoxarifado Etapa 8c — Transformação no terceiro (chapa → peças + sobra): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar este plano task a task. Os steps
> usam checkbox (`- [ ]`) para acompanhamento.

**Design de origem:** [`docs/superpowers/specs/2026-08-13-almoxarifado-etapa8c-transformacao-design.md`](../specs/2026-08-13-almoxarifado-etapa8c-transformacao-design.md)
· **Antecessora:** [`2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md`](2026-08-12-almoxarifado-etapa8b-remessas-terceiros.md)
· **Feature:** [14 — Materiais em terceiros](../../../specs/modulo-almoxarifado/14-materiais-terceiros/README.md)
· **Branch:** `desenvolvimento-almoxarifado`

**Goal:** a chapa que a GMP manda cortar deixa de voltar mentindo. Sai **uma chapa em KG** e voltam
**40 peças em UN mais uma sobra**: a chapa é baixada de verdade (patrimônio **e** retenção, no
mesmo UPDATE, via `CONSUMO_TERCEIRO`), e as peças e a sobra **entram** como material próprio pelo
tipo novo `RETORNO_TRANSFORMACAO`, herdando o **dono** da chapa e o **custo** dela rateado por
quantidade, com a sobra a custo zero.

**Architecture:** três camadas, nenhuma inventada nesta etapa. (1) O **motor** ganha um único tipo
de entrada (`RETORNO_TRANSFORMACAO`) e nada mais — a baixa da chapa já existe desde a 8b
(`CONSUMO_TERCEIRO`, claim duplo em `stockService.js:984-1006`). (2) O **serviço**
(`thirdPartyService.registrarTransformacao`) copia letra por letra a forma da 8b: pré-checagem de
**todas** as linhas antes de mover qualquer coisa, claim no `WHERE` do item, e compensação
explícita no `catch` — SQLite sem transação. (3) O **rateio** mora numa função **pura** isolada
(`services/almoxarifado/transformCost.js`), para trocar a base de rateio ser uma linha. Duas
correções de pré-requisito viajam junto porque sem elas a etapa entrega zero: o recebimento por NF
passa a alimentar o custo médio (hoje ele é **quase nunca** alimentado), e a criação de material sai
de dentro do handler HTTP para um serviço com gerador de código que aguenta lote.

**Tech Stack:** Node 18 + Express + SQLite3 (`server/`), Zod 4 para validação de rota, React CRA
(`client/`). Testes: runner próprio por arquivo em `server/tests/api/*.api.test.js`; Jest via
react-scripts no client.

---

## Global Constraints

Toda task herda esta seção. Ela é a lista de coisas que **já custaram caro nesta base**.

- **Commits em português, corpo SEM ACENTO**, explicando o **porquê** (qual era o bug, qual a
  consequência, o que foi decidido **e o que foi descartado**). **Um commit por assunto.**
  **NUNCA `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`;
  sempre `git add <caminhos explícitos>`. Todo commit termina com
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Documentação desatualizada é trabalho não terminado** (`CLAUDE.md`, regra nº 1). Nenhuma task se
  reporta pronta sem a Task 10; e se uma spec estiver **errada**, corrija a spec **dizendo que
  estava errada** — não apague a afirmação errada em silêncio.
- **Chave não declarada em schema Zod é DESCARTADA EM SILÊNCIO.** `validation.js` troca `req.body`
  pelo objeto parseado e `z.object` remove o que não está declarado (aviso literal em
  `services/almoxarifado/schemas.js:311-320`). Já custou caro **quatro** vezes: `reserva_id`
  (Etapa 4), `lote_id` (Etapa 6), `justificativa`/`motivo` do cancelamento (Etapa 8) e
  `material_id` do retorno (8b, declarado de propósito). **Todo campo novo de API entra no schema.**
- **O motor não tem transações.** Todo efeito multi-passo é claim-no-`WHERE` + compensação
  explícita no `catch`. Nunca `SELECT` seguido de `UPDATE` sem guarda na cláusula `WHERE`.
- **Toda pré-checagem "tudo ou nada" agrega pelo RECURSO ESCASSO, nunca pela linha do documento.**
  Regra escrita com sangue na Task 5 da 8b: checando linha a linha, duas linhas de 60 de um item de
  100 passavam as **duas**. E quando a pré-checagem agrega, **a mensagem tem de dizer o valor
  agregado** (Task 6 da 8b).
- **Quem decide é sempre o backend.** `GET /almoxarifado/minhas-permissoes` existe só para a UI
  barrar antes do formulário e **falha aberto** de propósito.
- **`getPerfilFromUser` faz fallback para `PRODUCAO`** — usuário sem perfil **não** é "sem acesso",
  é chão de fábrica. Todo teste de negativa de permissão usa perfil **explícito**
  (`perfil_almoxarifado: 'PRODUCAO'` ou `'CONSULTA'`), nunca "usuário sem perfil".
- **Controle positivo bilateral obrigatório em toda regra de recusa.** Nesta base já se comprovou
  **cinco vezes** que teste só de recusa aprova implementação que barra tudo. Toda guarda desta
  etapa (dono, material inexistente, teto, classificação) tem o par positivo **na mesma task**.
- **Almoxarifado é área física, não filial.** A 8c **não** segrega saldo por almoxarifado e não
  introduz seletor de almoxarifado na transformação. Saldo global por material é intencional.
- **Nenhuma coluna nova em `materiais_almoxarifado` nesta etapa.** As colunas novas são todas de
  `retornos_remessa_item_almoxarifado`. É isso que dispensa a varredura de `server/` inteiro que a
  Task 1 da 8b exigiu (`availabilitySql.js` e as 14 réplicas da conta do disponível) e que dispensa
  mexer em `SENSITIVE_MATERIAL_FIELDS`. **Se alguma task passar a precisar de coluna em
  `materiais_almoxarifado`, essa varredura volta a ser obrigatória** — é a pendência 4 da 8b.
- **Suítes (comandos literais):**
  ```
  cd server && npm run test:api          # runner: tests/api/run-all.js; descobre SO tests/api/*.api.test.js
  cd server && npm run test:almoxarifado
  cd server && npm run test:validation
  cd server && npm run test:safealter
  cd server && npm run test:sqlite
  cd client && CI=true npx react-scripts test --watchAll=false
  cd client && CI=true npx react-scripts build   # CI=true faz warning virar erro
  ```
  Um arquivo só: `cd server && node tests/api/<arquivo>.api.test.js`.
- **Convenção do harness de teste do servidor:** cada arquivo tem runner próprio (`test()`,
  contadores `passed`/`failed`, `process.exit(failed > 0 ? 1 : 0)`); o harness é
  `server/tests/helpers/testApp.js` e roda o `requirePermission` **real**.
- **Teste que passa de primeira é SUSPEITO.** Três casos de teste vazio nesta base: varredura com
  caminho errado + `2>/dev/null` engolindo o erro; `grep -c` combinado com `wc -l`; e backup testado
  **depois** de fechar a conexão SQLite (o checkpoint apagava o `-wal`, então o teste passava
  provando nada). **Cada task deste plano termina com sabotagem obrigatória.**
- **Regras do harness de sabotagem (violá-las já produziu sabotagem que não sabotou nada):**
  1. **`python` NÃO existe nesta máquina.** Heredoc de python vira **no-op silencioso**. Use `sed`,
     `perl` ou edição direta com a ferramenta Edit.
  2. **Conte a âncora ANTES:** `grep -cF '<ancora>' <arquivo>` **tem de dar exatamente `1`**. Se der
     `0` ou `>1`, **ABORTE e escolha outra âncora** — já aconteceu de `grep -F` casar a 1ª de 4
     ocorrências e sabotar a tabela errada.
  3. **`md5sum` do arquivo ANTES da sabotagem, DEPOIS da sabotagem e DEPOIS da restauração.** O md5
     de depois tem de **diferir** do de antes (senão a sabotagem não fez nada — já aconteceu) e o de
     depois da restauração tem de **voltar a ser igual** ao de antes.
  4. **`git diff --stat` tem de voltar VAZIO** depois da restauração.
  5. **Sabotagem que NÃO derruba nenhum teste é um ACHADO, não um detalhe.** Registre qual asserção
     falta e **escreva a asserção** antes de seguir.
- **Nada de placeholder.** Nenhum step deste plano diz "similar à Task N", "adicione validação
  apropriada" ou "TBD". Todo step de código traz o código.

---

## Mapa de arquivos

| Arquivo | Papel nesta etapa | Task |
|---|---|---|
| `server/services/almoxarifado/materialService.js` | **novo** — `createMaterial`, `proximoCodigo` e os 4 helpers que hoje são closures da rota | 1 |
| `server/routes/almoxarifado.js` | POST materiais vira chamador magro; `GET /proximo-codigo` usa `MAX` do sufixo | 1 |
| `server/services/almoxarifado/receiptService.js` | `ENTRADA_COMPRA` passa a levar `custo_unitario` da linha da nota | 2 |
| `server/services/almoxarifado/schema.js` | 3 colunas em `retornos_remessa_item_almoxarifado` (`safeAlter`); `RETORNO_TRANSFORMACAO` em `TIPOS_MOVIMENTO` e `TIPOS_DEDICADOS`; `TIPOS_RESULTADO` | 3, 4 |
| `server/services/almoxarifado/stockService.js` | `RETORNO_TRANSFORMACAO` nas **duas** listas `tiposEntrada` (`:512` e `:1388`) | 4 |
| `server/services/almoxarifado/movementRules.js` | `REGRAS_VINCULO.RETORNO_TRANSFORMACAO` | 4 |
| `server/services/almoxarifado/ownerRules.js` | `TIPOS_ISENTOS_DONO` + `assertMesmoDonoNaTransformacao` (a guarda da decisão 3) | 4, 5 |
| `server/services/almoxarifado/transformCost.js` | **novo** — `ratearCusto` (pura) e `calcularRendimento` (pura) | 6, 8 |
| `server/services/almoxarifado/thirdPartyService.js` | `registrarTransformacao` + a recusa da 8c passa a citar a rota certa | 5, 7, 8 |
| `server/services/almoxarifado/schemas.js` | `TransformacaoRemessaSchema`; `codigo_auto` em `MaterialShape` | 1, 8 |
| `server/routes/almoxarifado/extended.js` | `POST /remessas-terceiros/:id/transformacoes` | 8 |
| `server/tests/api/materialServiceCriacao.api.test.js` | **novo** | 1 |
| `server/tests/api/recebimentoCustoMedio.api.test.js` | **novo** | 2 |
| `server/tests/api/transformacaoTerceiro.api.test.js` | **novo** — cresce nas Tasks 3, 5, 7, 8 | 3, 5, 7, 8 |
| `server/tests/api/transformacaoMotor.api.test.js` | **novo** — o tipo dentro do motor | 4 |
| `server/tests/api/transformCost.api.test.js` | **novo** — a função pura e o invariante | 6 |
| `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js` | modal de transformação com N linhas de resultado | 9 |
| `client/src/components/almoxarifado/RemessasTerceirosTransformacao.test.js` | **novo** | 9 |
| specs 14 / 03 / README mestre / guia / novidades / este plano | fechamento de documentação | 10 |

---

## Contrato conferido linha a linha (leitura feita ao escrever este plano)

Cada linha abaixo foi **aberta e lida**, não copiada do briefing. As divergências entre o que o
briefing dizia e o que o código diz estão marcadas com **⚠**.

| Onde | O que está lá | Consequência para a 8c |
|---|---|---|
| `thirdPartyService.js:338-378` | `validarRetornoDoItem(db, { remessaId, itemRemessaId, quantidade, materialId, linhas = 1 })`. Recusa material diferente em `:355-360`; teto do item em `:366-376` | Task 5/7 chama com `materialId` **omitido** — a recusa da 8c continua valendo só para `registrarRetorno` |
| `thirdPartyService.js:395-512` | pré-checagem com `linhasPorItem` + `jaPedido`; claim `UPDATE ... WHERE (quantidade - COALESCE(quantidade_retornada,0)) >= ? RETURNING id`; `catch` com `MAX(0, ... - ?)` | forma copiada literalmente na Task 7 |
| `thirdPartyService.js:450-451` e `:464` | `material_id: item.material_id` **hardcoded** na movimentação e de novo no INSERT. `linha.material_id` é validado e **nunca usado** | a Task 7 **não** mexe em `registrarRetorno`: cria função irmã |
| `thirdPartyService.js:21-26` | `DESTINOS_ENCERRAMENTO = ['PERDA_NO_TERCEIRO','CONSUMIDO_NO_PROCESSO']`, `TIPO_MOVIMENTO_DESTINO` | decisão 8: **nenhum destino novo** |
| `thirdPartyService.js:84-99` | `resolverProprietario(db, materiais)` recusa donos misturados e devolve `{ proprietario_cliente_id, proprietario_cliente_nome }` | a guarda da decisão 3 é **outra** (par chapa↔peça), não esta |
| `thirdPartyService.js:288-301` | `getRemessa` devolve `{ ...remessa, itens: [... com `pendente`], retornos: [...] }` | a tela já recebe `retornos`; ganha `tipo_resultado` de graça |
| `thirdPartyService.js:676-681` | `module.exports` com 10 nomes | Task 7 acrescenta `registrarTransformacao` |
| `stockService.js:812-825` | `REMESSA_TERCEIRO`: só `quantidade_em_terceiros +=`, `saldoPosterior = saldoAnterior` | inalterado |
| `stockService.js:826-839` | `RETORNO_TERCEIRO`: só `quantidade_em_terceiros -=` | inalterado |
| `stockService.js:984-1006` | `baixandoTerceiro` (`PERDA_TERCEIRO`/`CONSUMO_TERCEIRO`): baixa `quantidade_atual` **E** `quantidade_em_terceiros` no MESMO UPDATE, duas guardas no `WHERE` | **é a baixa da chapa, pronta, sem alteração** |
| `stockService.js:512` | `tiposEntrada` (em `registrarMovimentacao`) | recebe `RETORNO_TRANSFORMACAO` |
| `stockService.js:1388` | `tiposEntrada` **de novo**, em `cancelarMovimentacao` | **⚠ o design fala em "tiposEntrada" no singular. São DUAS listas.** Esquecer a segunda = estorno marca `cancelado=1`, grava `ESTORNO` e **não devolve saldo nenhum** (defeito exato da Task 4 da 8b) |
| `stockService.js:484` | `emergencial, custo_unitario: custoInformado, quantidade_reprovada` | o campo de entrada chama-se `custo_unitario` |
| `stockService.js:1031-1041` | ramo `custoInformado && custoInformado > 0`: média ponderada com `ROUND(...,4)`; escreve `custo_medio` **e** `custo_unitario` | **único escritor real de `custo_medio`** |
| `stockService.js:1043-1049` | `else`: entrada **sem** custo informado — só quantidade, custo **intocado** | é o que faz o controle positivo da decisão 5 passar, e o que faz `SOBRA` a custo 0 **não zerar** o custo do material da sobra |
| `stockService.js:1256-1268` | compensação interna do `catch` amplo restaura `custo_medio`/`custo_unitario` **exatos** (não só subtrai a quantidade) | molde da compensação de custo da Task 7 |
| `stockService.js:1323-1357` | `cancelarMovimentacao(db, user, movimentoId, motivo)`; recusa `ESTORNO`, reserva, inspeção e **`REMESSA_TERCEIRO`/`RETORNO_TERCEIRO`** | `RETORNO_TRANSFORMACAO` **não** entra nessa recusa: é entrada de verdade, estornável |
| `stockService.js:1380-1387` | comentário: `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` são estornáveis e o estorno **não recria `quantidade_em_terceiros`** — deliberado | **⚠ colide com a decisão 9** (ver contradição C6) |
| `stockService.js:1548-1550` | estorno **não** reverte custo, decisão explícita da Etapa 1 | a compensação da Task 7 restaura o custo **à mão** |
| `schema.js:46-82` | `TIPOS_MOVIMENTO`, terminando em `'ENTRADA','SAIDA','AJUSTE','DEVOLUCAO','ESTORNO'` | recebe `RETORNO_TRANSFORMACAO` |
| `schema.js:101-106` | `TIPOS_RETENCAO` | **não** recebe (é entrada de verdade) |
| `schema.js:125` | `TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE','PERDA_TERCEIRO','CONSUMO_TERCEIRO']` | recebe `RETORNO_TRANSFORMACAO` |
| `schemas.js:54-56` | `TIPOS_MOVIMENTO_ROTA` é **derivado**: `TIPOS_MOVIMENTO` menos `ESTORNO`, `TIPOS_RETENCAO` e `TIPOS_DEDICADOS` | entrar em `TIPOS_DEDICADOS` **já** barra a rota genérica, sem editar `schemas.js` |
| `schema.js:170-178` | `safeAlter(db, sql)` engole `duplicate column name` e relança o resto | as 3 colunas da Task 3 |
| `schema.js:194` | `custo_unitario REAL DEFAULT 0` no CREATE base | leitura de custo da chapa |
| `schema.js:647` | `'custo_medio REAL DEFAULT 0'` na lista `materialCols` | idem |
| `schema.js:708` | `safeAlter(... ADD COLUMN quantidade_em_terceiros REAL DEFAULT 0)` | inalterado |
| `schema.js:1127-1198` | as três tabelas; `retornos_remessa_item_almoxarifado` em `:1180-1193` | as 3 colunas novas vão logo depois do bloco |
| `schema.js:7-13` | `CATEGORIAS_SEED` contém `'Sucata e sobras reaproveitáveis'` | a sobra usa categoria que já existe |
| `schema.js:319-352` | ledger `schema_migrations_almoxarifado` com `INSERT OR IGNORE` (duas chamadas concorrentes de `initSchema` no boot) | **a 8c não precisa de migração de dados** — só `safeAlter`. Registrado para ninguém inventar uma |
| `movementRules.js:58-61` | os quatro tipos da 8b: `{ vinculo: 'nenhum', justificativa: true }` | mesma forma para o tipo novo |
| `ownerRules.js:50-51` | `TIPOS_ISENTOS_DONO` (9 tipos, inclui `AJUSTE_POSITIVO`, que é **entrada** — precedente de entrada declarada ali) | `RETORNO_TRANSFORMACAO` entra por legibilidade |
| `ownerRules.js:63` | `TIPOS_SAIDA_COM_DONO`; a guarda só roda para saída (`stockService.js:636`) | por isso a guarda da decisão 3 **não** pode ser `assertSaidaPermitida`: precisa de função nova |
| `schemas.js:349-365` | `RetornoRemessaSchema` com `material_id` opcional declarado | schema novo e separado para a transformação |
| `schemas.js:194-266` | `MaterialShape`; obrigatórios: `codigo`, `nome`, `familia_id` | `codigo_auto` entra aqui (Task 1) |
| `routes/almoxarifado.js:365-490` | POST materiais: `validateFamiliaAtiva` → `validateSubfamilia` → `resolveLocalizacaoFromFk` → INSERT (`:454`) → movimentação inicial → `syncSaldoLocalizacaoPadrao` → auditoria → `SELECT` final; UNIQUE vira `'Código já existe'` | extraído inteiro na Task 1 |
| `routes/almoxarifado.js:117 / :309 / :321 / :330` | `resolveLocalizacaoFromFk`, `validateFamiliaAtiva`, `validateSubfamilia`, `bool01` são **closures** do módulo de rota (capturam `db`), com **20 usos** no arquivo | movem para o serviço; a rota mantém wrappers de uma linha para os outros usos não mudarem |
| `routes/almoxarifado.js:500-560` | PUT materiais monta o UPDATE a partir de `MATERIAL_UPDATE_COLUMNS` (lista fixa) | acrescentar `codigo_auto` ao Zod **não** afeta o PUT |
| `routes/almoxarifado.js:697-739` | `GET /proximo-codigo`: `ORDER BY id DESC LIMIT 1` + `+1`, em callback, sem transação | reescrito na Task 1 |
| `routes/almoxarifado.js:249` e `:1048` | leituras que usam **só** `custo_unitario` | decisão 11.1 — registradas, não consertadas |
| `receiptService.js:493-513` | `registrarMovimentacao(..., { tipo:'ENTRADA_COMPRA', quantidade: qtd, ... }, { exigeLote:true, exigeSerie:true })` — **sem `custo_unitario`** | Task 2 |
| `receiptService.js:110-115` | grava `valor_unitario`/`valor_total` no item (`vUnit = parseFloat(item.valor_unitario) \|\| 0`) | o dado já existe, só não é passado adiante |
| `receiptService.js:44-50` | `carregarItensPedidoCompra` termina em `.filter((i) => i.material_id)` — o recebimento **não cria material** | precedente da decisão 6 |
| `routes/almoxarifado/extended.js:902-960` | 7 rotas + `/vencidas` **antes** de `/:id`; nenhuma tem `try/catch` com mensagem inventada — todas caem em `handleError` | a rota nova entra depois de `/retornos`, sob `/:id/`, sem risco de ordem |
| `permissions.js:16-47` | `remessar_terceiro: [ADMINISTRADOR, ALMOXARIFE]`, `criar_material: [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA]` | **⚠ transformar e criar o material resultante têm gates DIFERENTES.** ENGENHARIA cria material e **não** transforma. A tela trata os dois separadamente (Task 9) |
| `availabilitySql.js:32-37` | `COLUNAS_RETENCAO` com as 4 colunas; `disponivelSql(alias)` | **não é tocado**: a 8c não acrescenta coluna em `materiais_almoxarifado` |
| `client/.../RemessasTerceirosAlmoxarifado.js:550-573` | modal de retorno: `<select>` de item + `<input>` de quantidade + NF. **Um item por vez, sem seletor de material** | Task 9 acrescenta um modal irmão |
| `client/.../RemessasTerceirosAlmoxarifado.js:246-253` | submissão do retorno monta `itens: [{ item_remessa_id, quantidade }]` | idem |
| `client/.../RemessasTerceirosAlmoxarifado.js:274-282` | `retornadoPorItem` soma `aberta.retornos` por `item_remessa_id` | ganha desdobramento por `tipo_resultado` |

---

## Contradições e lacunas achadas no design (declaradas, não consertadas em silêncio)

Sete achados. **Seis mudam o que o plano faz**; o primeiro muda o que o plano **afirma**.

### C1 — A decisão 4 diz que o invariante "fecha sozinho". A decisão 11.1 diz que não.

A decisão 4 afirma: *"Não existe coluna de valor no sistema — valor é sempre `quantidade × custo`,
calculado na leitura. […] O patrimônio não se move porque **não há um segundo lugar onde ele possa
discordar**."*

Há. A própria decisão 11.1 nomeia: **duas famílias de leitura**, `custo_unitario` sozinho
(`routes/almoxarifado.js:249` e `:1048`) contra `COALESCE(custo_medio, custo_unitario)`
(`reportService.js:10`, `stockService.js:1870`, `requisitionValueApprovalService.js:61`). E o ramo
de entrada com custo (`stockService.js:1031-1041`) escreve as duas colunas com valores
**diferentes**: `custo_medio` vira a média ponderada, `custo_unitario` vira o **último** custo. Se o
material-peça já tinha saldo a outro custo, as duas leituras dão totais diferentes — o invariante
fecha numa e não na outra.

**Como o plano resolve:** o teste do invariante (Tasks 6 e 7) mede com **UMA** fórmula declarada,
`COALESCE(custo_medio, custo_unitario)`, e **exige material-peça e material-sobra com saldo prévio
zero**. Isso está escrito na asserção, com o motivo. A afirmação "não há segundo lugar" é
**corrigida na spec da feature 14** na Task 10, em vez de repetida.

### C2 — A sobra a custo zero só é neutra se a sobra não tiver custo prévio.

Consequência do ramo `else` de `stockService.js:1043-1049`: crédito com `custo_unitario = 0` cai no
ramo **sem custo**, que **não escreve custo nenhum**. Isso é ótimo (não zera o cadastro) e é o que
faz o controle positivo da decisão 5 funcionar — mas significa que a sobra **entra carregando o
custo que o material dela já tinha**. Numa contagem de patrimônio, `sobra.quantidade ×
custo_medio_antigo_da_sobra` aparece do lado de dentro, e o invariante da decisão 4 **não fecha**.

O design não menciona. **Como o plano resolve:** o teste do invariante usa sobra com custo zero e
**diz na asserção** por quê; e o teste `sobra entra com custo zero e nao dilui as pecas` verifica os
dois fatos separados — a linha grava `custo_unitario_aplicado = 0` **e** o `custo_medio` do material
da sobra fica **inalterado**. Declarado no guia de usuário (Task 10) como limitação conhecida.

### C3 — "Zero peças, só sobra" não está decidido.

Rateio por quantidade entre as peças, sobra a zero (decisão 4). Se **todas** as linhas forem
`SOBRA`, não há denominador: o valor inteiro da chapa evapora. O design não trata.

**Decisão do plano: é permitido, e o valor evapora de propósito.** Chapa que voltou só como retalho
é exatamente o caso em que o valor foi consumido pelo processo — inflar o retalho para "fechar a
conta" é o que a decisão 4 recusa em voz alta. `ratearCusto` devolve `valorDistribuido = 0` e
`residuo = valorTotal`, e **o serviço escreve o resíduo na justificativa do `CONSUMO_TERCEIRO`**,
para o número não sumir sem rastro. Testado (Task 6 e Task 7).

### C4 — "Retry em colisão" no `proximo-codigo` não cabe no `proximo-codigo`.

A decisão 6 diz: *"Passa a usar `MAX` do sufixo numérico e a tolerar colisão com retry"*. Mas
`GET /proximo-codigo` só **devolve** um número; a colisão acontece no `INSERT`, que é outra rota e
outro momento. `MAX` sozinho **não resolve o lote**: duas chamadas concorrentes devolvem o mesmo
número, sempre.

**Decisão do plano:** são **duas** mudanças em **dois** lugares. (a) `proximoCodigo` usa `MAX` do
sufixo numérico — conserta o bug de que o código de maior `id` nem sempre é o de maior número.
(b) `createMaterial` ganha **retry sob `UNIQUE`**, ativado por um campo novo e explícito
`codigo_auto`: quando ele vem verdadeiro, o `codigo` recebido é **sugestão**, e a colisão faz o
serviço regerar e tentar de novo (até 5 vezes). Sem `codigo_auto`, comportamento **idêntico** ao de
hoje (400 `'Código já existe'`) — a tela de cadastro manual não muda em nada.

### C5 — `RETORNO_TRANSFORMACAO` "entra em `tiposEntrada`" — no singular, e são duas listas.

`stockService.js` declara `tiposEntrada` **duas** vezes: `:512` (em `registrarMovimentacao`) e
`:1388` (em `cancelarMovimentacao`); o comentário de `:1362-1364` diz que a duplicação é histórica e
que esquecer uma **torna o motor assimétrico**. O if-chain do cancelamento **não tem `else`**: um
tipo ausente das duas listas é marcado `cancelado = 1`, ganha linha de `ESTORNO` com
`saldo_anterior == saldo_posterior` e **nenhum saldo volta**. É literalmente o quarto defeito que só
a execução da 8b achou.

**Como o plano resolve:** a Task 4 mexe nas **duas** e tem teste do estorno, com sabotagem que
remove **só a segunda** para provar que o teste sabe pegar isso.

### C6 — A decisão 9 diz "devolve a chapa"; o estorno do livro **deliberadamente não devolve a retenção**.

`stockService.js:1380-1387`, comentário literal: o ramo de saída do cancelamento *"credita
`quantidade_atual` e NÃO recria `quantidade_em_terceiros` — o que é exatamente o comportamento certo
[…] quando alguém estorna a baixa, a remessa já está ENCERRADA, e recriar a retenção seria um hold
sem remessa viva por trás"*.

Na compensação da 8c a premissa é **falsa**: a remessa está **viva**, o claim do item está sendo
devolvido e o item volta a `pendente`. Se `quantidade_em_terceiros` não voltar, o item fica pendente
com **zero retenção** — e a próxima tentativa de transformar bate na guarda
`COALESCE(quantidade_em_terceiros,0) >= ?` do claim duplo (`stockService.js:996`) **para sempre**.
"Devolve a chapa", tomado ao pé da letra com a ferramenta existente, produz uma remessa que nunca
mais pode ser transformada.

**Decisão do plano:** a compensação da chapa é **`cancelarMovimentacao` (mantém o livro honesto:
linha de `ESTORNO` de verdade) MAIS um `UPDATE` suplementar que devolve SÓ
`quantidade_em_terceiros`**, com comentário explicando por que este caminho difere do encerramento.
O teste decisivo não é "os números voltaram": é **a retransformação depois da falha funciona**.

### C7 — A 8c cria o **terceiro** significado de `quantidade_retornada`, e a 8b tinha mandado decidir isso aqui.

Pendência 5 do plano da 8b, texto literal: *"`quantidade_retornada = quantidade` no encerramento
significa LIQUIDADO, não 'voltou'. Corrigir de vez custa uma coluna `quantidade_baixada` +
`safeAlter` — **a 8c decide junto com a transformação**."* O design da 8c **não decide**. E a
decisão 1 piora o quadro: `quantidade_consumida` também entra em `quantidade_retornada`, então a
coluna passa a significar *voltou* **ou** *foi liquidado no encerramento* **ou** *foi consumido numa
transformação*.

**Decisão do plano: NÃO criar `quantidade_baixada` na 8c.** Motivo: a coluna nova obrigaria a migrar
os **dois** significados já gravados e a mexer em `encerrarRemessa`, `cancelarRemessa` e na tela —
três caminhos estáveis, por um problema de **rótulo**, não de número: o pendente continua correto em
todos os casos. O que a 8c faz em vez disso: (a) `tipo_resultado` na linha de resultado torna o
terceiro significado **legível no dado**, não só no cabeçalho; (b) a tela (Task 9) desdobra
"Retornado / Transformado / Baixado"; (c) a pendência é **reescrita** na Task 10 dizendo que agora
são **três** significados e que a decisão continua aberta. Apagar a pendência porque a 8c encostou
nela seria o erro que o `CLAUDE.md` proíbe.

---

## Nomes decididos aqui (e por quê) — leia antes da Task 3

Estes nomes aparecem em seis tasks. Estão decididos **uma vez**, aqui.

| Nome | Onde vive | Por que este nome |
|---|---|---|
| `tipo_resultado` | coluna `TEXT` em `retornos_remessa_item_almoxarifado`; valores `'PECA'` / `'SOBRA'`; **`NULL` para as linhas da 8b** (retorno do mesmo material) | `classificacao` seria ambíguo num módulo que já tem `categoria`, `classe_abc` e `tipo_material`. `tipo_resultado` diz exatamente o que é: que **tipo de resultado** esta linha é. `NULL` é o valor histórico e significa "retorno simples, não é transformação" — e é o que permite a query `WHERE tipo_resultado IS NOT NULL` separar os dois mundos sem tabela nova |
| `TIPOS_RESULTADO` | constante em `schema.js`, `['PECA','SOBRA']` | mesma casa de `TIPOS_MOVIMENTO`/`TIPOS_RETENCAO`/`TIPOS_DEDICADOS`, e é de lá que o Zod e o serviço leem — lista literal repetida em dois lugares diverge na primeira mudança |
| `custo_unitario_aplicado` | coluna `REAL` em `retornos_remessa_item_almoxarifado` | é **por unidade** e é **o que foi aplicado naquele momento**, não o custo atual do material (que muda a cada entrada seguinte). `custo_aplicado` sozinho seria lido como valor total da linha; `custo_unitario` colidiria com a coluna homônima de `materiais_almoxarifado` na cabeça de quem lê um JOIN |
| `movimentacao_consumo_id` | coluna `INTEGER` em `retornos_remessa_item_almoxarifado` | espelha `movimentacao_id` (que já existe e aponta para o **crédito**). Um aponta para a entrada da peça, o outro para a **baixa da chapa**. **E é o agrupador do evento**: todas as N linhas de uma mesma transformação compartilham o mesmo `movimentacao_consumo_id` |
| `RETORNO_TRANSFORMACAO` | tipo de movimento | nome do design, mantido |
| `registrarTransformacao` | `thirdPartyService` | irmão de `registrarRetorno`; **não** é um modo dele |
| `ratearCusto` / `calcularRendimento` | `transformCost.js` | funções puras, sem `db`, sem `async` |
| `assertMesmoDonoNaTransformacao` | `ownerRules.js` | segue `assertSaidaPermitida` / `assertAjustePermitido` |

**Por que NÃO existe coluna `quantidade_consumida` nem `custo_servico` na tabela de resultados.**
Uma transformação é **um evento com N linhas**, e a tabela não tem cabeçalho de evento. Gravar
`quantidade_consumida` (ou `custo_servico`) em **cada** linha significaria que qualquer `SUM()`
ingênuo conta o mesmo consumo N vezes — a armadilha exata que esta base já pagou com `grep -c` +
`wc -l`. O cabeçalho do evento **já existe**: é a movimentação `CONSUMO_TERCEIRO`, cuja `quantidade`
é o consumo e cujo `id` é `movimentacao_consumo_id`. Para somar consumo, agrupa-se por ele. O
`custo_servico` é **entrada** do cálculo, não resultado: fica gravado na `justificativa` do
`CONSUMO_TERCEIRO` (texto auditável, lido no extrato) e no registro de auditoria do evento. Coluna
de custo no ledger está **fora de escopo** por decisão 10 do design.

---
### Task 1: `materialService.createMaterial` extraído do handler HTTP + `proximo-codigo` que aguenta lote

> ✅ **FEITA — commit `afcd5aa`.** Gates medidos: `test:api` **77/77 arquivos OK** (incluindo
> `materialServiceCriacao.api.test.js` com **13 passed, 0 failed**), `test:validation`
> **4 passed, 0 failed**. Sabotagens S1/S2/S3 executadas, as três derrubaram teste.
>
> **Quatro divergências deste plano, corrigidas em vez de obedecidas:**
> 1. O Step 3 trazia `buildLocalizacaoPath`/`formatLocalizacaoLabel` **reescritas** (outra regra de
>    montagem do caminho). Isso mudaria calado o rótulo gravado na coluna `localizacao` de todo
>    material criado pelo serviço, e o guarda de refactor **não pegaria** — o corpo de teste não
>    manda `localizacao_padrao_id`. Copiadas **literalmente** do handler.
> 2. O Step 4 mandava mantê-las na rota alegando "outros usos no arquivo (listagem de
>    localizações)". **Não têm**: o único chamador era o `resolveLocalizacaoFromFk`, que passou a
>    delegar. Foram **removidas** da rota. **A dívida de duplicação que a Task 10 ia registrar não
>    existe** — não a registre.
> 3. O teste do Step 1 lia auditoria em `auditoria_almoxarifado`; a tabela é
>    `auditoria_log_almoxarifado` (`schema.js:1314`). O `dbGet` estourava `SQLITE_ERROR` e o teste
>    falhava pelo motivo errado, sem provar nada sobre a auditoria.
> 4. São **13** testes, não 12 — o próprio bloco do Step 1 tem 13.
>
> **Achado da sabotagem S2:** ela derrubou **um** teste, não os dois previstos. O cenário do teste
> da rota tinha **um material só**, e com um material só `MAX` e `ORDER BY id DESC` dão a mesma
> resposta — "a rota e o serviço concordam" ficou barato demais no instante em que a rota passou a
> delegar. O cenário foi corrigido (`ROT-007` e **depois** `ROT-003`) para a **rota** — o caminho
> que a tela usa — provar o `MAX` por conta própria. Com a correção, S2 derruba os dois.

**Por que esta é a Task 1 e não a última.** A decisão 6 do design diz que a transformação **recusa**
material inexistente e que a tela oferece um atalho explícito de criar o material resultante. Esse
atalho precisa de duas coisas que **não existem**: uma função de criar material (hoje o único
`INSERT INTO materiais_almoxarifado` de produção está inline no handler HTTP,
`routes/almoxarifado.js:454`) e um gerador de código que não repita quando se pede N códigos
seguidos (`GET /proximo-codigo` usa `ORDER BY id DESC LIMIT 1`, `routes/almoxarifado.js:697-739`).
Fazer isso depois seria fazer a Task 9 duas vezes.

**Files:**
- Create: `server/services/almoxarifado/materialService.js`
- Modify: `server/routes/almoxarifado.js` — helpers `:117-134`, `:309-330` viram delegações; POST
  materiais `:365-490`; `GET /proximo-codigo` `:697-739`
- Modify: `server/services/almoxarifado/schemas.js` — `codigo_auto` em `MaterialShape` (`:194-266`)
- Test: `server/tests/api/materialServiceCriacao.api.test.js` (**novo**)

**Interfaces:**
- Consumes: `dbRun`/`dbGet` de `services/almoxarifado/db`; `stockService.syncSaldoLocalizacaoPadrao`;
  `registrarAuditoria` de `services/almoxarifado/audit`.
- Produces (usado pelas Tasks 8, 9 e 10):
  - `materialService.bool01(v) => 0|1`
  - `materialService.validateFamiliaAtiva(db, familiaId) => Promise<row|null>` — lança
    `Error('Família não encontrada')` ou `Error('Família inativa — não é possível vincular novos itens')`
  - `materialService.validateSubfamilia(db, subfamiliaId, familiaId) => Promise<row|null>` — lança
    `Error('Subfamília inválida para a família selecionada')`
  - `materialService.resolveLocalizacaoFromFk(db, id) => Promise<{ locId:number|null, locText:string|null }>`
  - `materialService.proximoCodigo(db, familiaId) => Promise<string>` — `'PREFIXO-NNN'` com `NNN`
    zero-padded em 3, ou `'ALM-NNN'` quando `familiaId` é falsy
  - `materialService.createMaterial(db, user, data) => Promise<row>` — a linha criada, já com
    `familia_nome`/`familia_codigo`. Lança `Object.assign(new Error(msg), { status })`:
    `400` para família/subfamília/código duplicado, `500` para falha de localização.
    `data.codigo_auto` verdadeiro faz o `codigo` ser **sugestão**: colisão `UNIQUE` regenera e
    tenta de novo, até **5** tentativas.

---

- [x] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/materialServiceCriacao.api.test.js` com o conteúdo abaixo. **São 12 testes**
e três deles são refactor-guards: rodam a **rota** e o **serviço** com a mesma entrada e comparam o
que ficou no banco, campo a campo.

```js
/**
 * Etapa 8c, Task 1 — a criacao de material sai do handler HTTP e vira servico, e o gerador de
 * codigo passa a aguentar lote.
 *
 * Por que este arquivo existe: a decisao 6 do design manda a tela oferecer um atalho de criar o
 * material resultante da transformacao. Nao havia funcao de criar material — so um INSERT inline
 * no handler (routes/almoxarifado.js:454) — e o gerador de codigo montava o proximo numero com
 * ORDER BY id DESC LIMIT 1, que repete quando se pede N codigos seguidos.
 *
 * O alvo aqui e REFACTOR SEM MUDANCA DE COMPORTAMENTO. Por isso os testes-guarda comparam a linha
 * gravada pela ROTA com a linha gravada pelo SERVICO, campo a campo, em vez de conferir uma lista
 * de campos escolhida a dedo: lista a dedo aprova o refactor que esqueceu a coluna que ninguem
 * lembrou de listar.
 *
 * Executar: cd server && node tests/api/materialServiceCriacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// Perfil EXPLICITO: getPerfilFromUser faz fallback para PRODUCAO, entao "usuario sem perfil" nao e
// "sem acesso" — e chao de fabrica, e o teste passaria pelo motivo errado.
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };
const ENGENHARIA = { id: 4, nome: 'Engenharia', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

/** Colunas que NAO podem ser comparadas entre duas criacoes (mudam por definicao). */
const VOLATEIS = new Set(['id', 'codigo', 'nome', 'created_at', 'updated_at']);

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  const familia = await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('CHP','Chapas',1)");
  const FAM = familia.lastID;
  const subfam = await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('CHP-INOX','Chapas inox',1,?)",
    [FAM]);
  const SUB = subfam.lastID;
  const inativa = await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('OLD','Familia morta',0)");
  const FAM_INATIVA = inativa.lastID;

  /** Corpo completo — de proposito com MUITOS campos, para o guarda de refactor ter o que comparar. */
  const corpo = (over = {}) => ({
    codigo: 'X', nome: 'Chapa de teste', familia_id: FAM, subfamilia_id: SUB,
    descricao: 'descricao', categoria: 'Materia-prima', unidade: 'KG',
    quantidade_atual: 0, quantidade_minima: 5, quantidade_maxima: 50,
    custo_unitario: 12.5, fornecedor_principal: 'Fornecedor A', codigo_fornecedor: 'F-1',
    ncm: '7208', especificacoes: 'ASTM A36', observacoes: 'obs',
    descricao_tecnica: 'tecnica', material_critico: 1, controle_lote: 1, controle_certificado: 1,
    fabricante: 'Fab', codigo_fabricante: 'CF-1', peso_unitario: 7.85, dimensoes: '1000x2000',
    material_construtivo: 'Aco', norma: 'A36', marca: 'M', modelo: 'MO', aplicacao: 'estrutura',
    ponto_reposicao: 10, lote_economico: 100, controle_serie: 0, controle_validade: 0,
    controle_corrida: 1, requer_inspecao: 1, requer_foto: 0, classe_abc: 'A',
    unidade_compra: 'KG', fator_conversao_compra: 1, unidade_consumo: 'KG', fator_conversao_consumo: 1,
    ...over,
  });

  // ══ Refactor sem mudanca de comportamento ═══════════════════════════════════════════════════

  await test('createMaterial extraido produz a MESMA linha que a rota, campo a campo', async () => {
    setUser(ADMIN);
    const r = await request(app).post('/api/almoxarifado/materiais')
      .send(corpo({ codigo: 'CMP-ROTA', nome: 'Pela rota' }));
    assert.strictEqual(r.status, 201, `a rota devolveu ${r.status}: ${JSON.stringify(r.body)}`);
    const doServico = await materialService.createMaterial(db, ADMIN,
      corpo({ codigo: 'CMP-SVC', nome: 'Pelo servico' }));

    const a = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE codigo = ?', ['CMP-ROTA']);
    const b = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [doServico.id]);
    const divergentes = Object.keys(a)
      .filter((k) => !VOLATEIS.has(k))
      .filter((k) => String(a[k]) !== String(b[k]))
      .map((k) => `${k}: rota=${a[k]} servico=${b[k]}`);
    assert.deepStrictEqual(divergentes, [],
      `o refactor mudou comportamento nestas colunas:\n  ${divergentes.join('\n  ')}`);
  });

  await test('createMaterial grava a movimentacao de saldo inicial igual a rota', async () => {
    // Efeito colateral que mora DENTRO do handler hoje (routes/almoxarifado.js:459-464) e que um
    // refactor "so mover o INSERT" perde em silencio — o material nasceria com saldo e sem historia.
    setUser(ADMIN);
    await request(app).post('/api/almoxarifado/materiais')
      .send(corpo({ codigo: 'MOV-ROTA', nome: 'Rota com saldo', quantidade_atual: 40 }));
    const doServico = await materialService.createMaterial(db, ADMIN,
      corpo({ codigo: 'MOV-SVC', nome: 'Servico com saldo', quantidade_atual: 40 }));
    const daRota = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', ['MOV-ROTA']);

    const movs = await dbAll(db,
      'SELECT material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo FROM movimentacoes_almoxarifado WHERE material_id IN (?,?) ORDER BY material_id',
      [daRota.id, doServico.id]);
    assert.strictEqual(movs.length, 2, 'o servico nao gravou a movimentacao de saldo inicial');
    assert.strictEqual(movs[0].tipo, movs[1].tipo);
    assert.strictEqual(movs[1].tipo, 'ENTRADA');
    assert.strictEqual(movs[1].quantidade, 40);
    assert.strictEqual(movs[1].saldo_anterior, 0);
    assert.strictEqual(movs[1].saldo_posterior, 40);
    assert.strictEqual(movs[1].motivo, 'Saldo inicial de cadastro');
  });

  await test('[CONTROLE POSITIVO] material com quantidade 0 NAO gera movimentacao', async () => {
    // A metade que falta: "sempre grava movimentacao" passaria no teste acima e sujaria o extrato
    // de todo material cadastrado sem saldo.
    const m = await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'MOV-ZERO', nome: 'Sem saldo', quantidade_atual: 0 }));
    const n = await dbGet(db, 'SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id]);
    assert.strictEqual(n.n, 0);
  });

  await test('createMaterial devolve a linha COM familia_nome e familia_codigo, como a rota', async () => {
    const m = await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'ENR-1', nome: 'Enriquecido' }));
    assert.strictEqual(m.familia_codigo, 'CHP');
    assert.strictEqual(m.familia_nome, 'Chapas');
  });

  await test('createMaterial registra auditoria de CRIACAO', async () => {
    const m = await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'AUD-1', nome: 'Auditado' }));
    const aud = await dbGet(db,
      "SELECT * FROM auditoria_almoxarifado WHERE entidade = 'material' AND entidade_id = ?", [m.id]);
    assert.ok(aud, 'a criacao pelo servico nao deixou registro de auditoria');
    assert.strictEqual(aud.acao, 'CRIACAO');
  });

  // ══ As recusas que existiam no handler continuam existindo ══════════════════════════════════

  await test('familia inativa e recusada com 400 e a mensagem original', async () => {
    await assert.rejects(
      () => materialService.createMaterial(db, ADMIN, corpo({ codigo: 'INA-1', familia_id: FAM_INATIVA, subfamilia_id: null })),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /Família inativa/);
        return true;
      });
  });

  await test('subfamilia de outra familia e recusada com 400', async () => {
    const outra = await dbRun(db,
      "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('OUT','Outra',1)");
    await assert.rejects(
      () => materialService.createMaterial(db, ADMIN, corpo({ codigo: 'SUB-1', familia_id: outra.lastID })),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /Subfamília inválida/);
        return true;
      });
  });

  await test('codigo repetido SEM codigo_auto continua dando 400 "Código já existe"', async () => {
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'DUP-1', nome: 'Primeiro' }));
    await assert.rejects(
      () => materialService.createMaterial(db, ADMIN, corpo({ codigo: 'DUP-1', nome: 'Segundo' })),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.strictEqual(e.message, 'Código já existe');
        return true;
      });
  });

  await test('a rota continua respondendo 403 para quem nao tem criar_material', async () => {
    // O gate mora na ROTA (requirePermission('criar_material')), nao no servico: o servico e
    // chamado por caminhos internos que ja passaram pelo gate deles. Mover o gate para dentro
    // quebraria esses caminhos; nao testa-lo deixaria o refactor tirar o gate sem ninguem ver.
    setUser(PRODUCAO);
    const r = await request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'P-403' }));
    assert.strictEqual(r.status, 403);
    const existe = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', ['P-403']);
    assert.strictEqual(existe, undefined, 'o 403 aconteceu DEPOIS do INSERT');
    setUser(ADMIN);
  });

  await test('[CONTROLE POSITIVO] ENGENHARIA, que tem criar_material, cria pela rota', async () => {
    // Sem isto, "403 sempre" passaria no teste acima. E ENGENHARIA importa: e o perfil que a
    // Task 9 encontra criando o material-peca SEM poder transformar (gates diferentes).
    setUser(ENGENHARIA);
    const r = await request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'ENG-OK' }));
    assert.strictEqual(r.status, 201, `ENGENHARIA levou ${r.status}: ${JSON.stringify(r.body)}`);
    setUser(ADMIN);
  });

  // ══ proximo-codigo em lote ══════════════════════════════════════════════════════════════════

  await test('proximo-codigo usa o MAIOR numero, nao o material de maior id', async () => {
    // O bug real: ORDER BY id DESC LIMIT 1. Cadastrar CHP-010 e depois CHP-002 fazia o gerador
    // olhar CHP-002 (id maior) e propor CHP-003, que ja podia existir.
    const fam = await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('MAX','Max',1)");
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'MAX-010', nome: 'Dez', familia_id: fam.lastID, subfamilia_id: null }));
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'MAX-002', nome: 'Dois', familia_id: fam.lastID, subfamilia_id: null }));
    assert.strictEqual(await materialService.proximoCodigo(db, fam.lastID), 'MAX-011');
  });

  await test('proximo-codigo em LOTE nao repete: 5 criacoes concorrentes dao 5 codigos distintos', async () => {
    // O caso da 8c: uma chapa vira 5 pecas e a tela cria os 5 materiais. Com o gerador chamado
    // em paralelo, as 5 chamadas devolvem O MESMO numero — por isso `codigo_auto` existe: o
    // codigo vira sugestao e a colisao UNIQUE faz o servico regerar.
    const fam = await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('LOT','Lote',1)");
    const F = fam.lastID;
    const sugestao = await materialService.proximoCodigo(db, F);
    assert.strictEqual(sugestao, 'LOT-001');

    const criados = await Promise.all([1, 2, 3, 4, 5].map((i) => materialService.createMaterial(db, ADMIN,
      corpo({ codigo: sugestao, codigo_auto: 1, nome: `Peca ${i}`, familia_id: F, subfamilia_id: null }))));
    const codigos = criados.map((m) => m.codigo);
    assert.strictEqual(new Set(codigos).size, 5,
      `o lote repetiu codigo: ${codigos.join(', ')}`);
    for (const c of codigos) assert.match(c, /^LOT-\d{3}$/, `codigo fora do padrao: ${c}`);
    const noBanco = await dbGet(db, "SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE codigo LIKE 'LOT-%'");
    assert.strictEqual(noBanco.n, 5, 'nem todas as 5 pecas foram gravadas');
  });

  await test('GET /proximo-codigo devolve o mesmo numero que materialService.proximoCodigo', async () => {
    // Duas contas dariam uma tela que discorda do servico — o mesmo erro que a 8b evitou
    // calculando `vencida` no SQL em vez de no client.
    const fam = await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('ROT','Rota',1)");
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'ROT-007', nome: 'Sete', familia_id: fam.lastID, subfamilia_id: null }));
    const r = await request(app).get(`/api/almoxarifado/proximo-codigo?familia_id=${fam.lastID}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.codigo, 'ROT-008');
    assert.strictEqual(r.body.codigo, await materialService.proximoCodigo(db, fam.lastID));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/materialServiceCriacao.api.test.js`

Expected: FAIL. Os 12 testes falham com
`Cannot find module '../../services/almoxarifado/materialService'` — o `require` do topo quebra
antes de qualquer teste rodar, então o processo morre com stack trace e **sem** a linha
`N passed, M failed`. **Isso é esperado nesta etapa** e é diferente de "0 passed, 0 failed", que
seria o teste vazio que esta base já produziu três vezes.

- [x] **Step 3: Criar `materialService.js`**

Criar `server/services/almoxarifado/materialService.js`:

```js
/**
 * Cadastro de material — a criacao, fora do handler HTTP.
 *
 * Ate a Etapa 8c o unico INSERT INTO materiais_almoxarifado de producao morava INLINE no handler
 * (routes/almoxarifado.js:454), junto com quatro efeitos que ninguem que so olha o INSERT enxerga:
 * a movimentacao de saldo inicial, a sincronizacao da linha de saldo por localizacao, a auditoria
 * e a releitura enriquecida com a familia. Qualquer outro caminho que precisasse criar material
 * teria de fazer uma requisicao HTTP para o proprio servidor, ou reimplementar os cinco passos —
 * e a Etapa 8c precisa exatamente disso (a tela cria o material-peca resultante da transformacao).
 *
 * O QUE ESTE SERVICO NAO FAZ: nao checa permissao. O gate e da ROTA
 * (requirePermission('criar_material')), como em todo o modulo — os caminhos internos que chamam
 * este servico ja passaram pelo gate DELES, e duplicar a checagem aqui recusaria chamadas
 * legitimas de servico para servico. Ver o mesmo desenho em thirdPartyService (o gate proprio
 * `remessar_terceiro` esta no servico porque ele NAO tem chamador interno; aqui tem).
 *
 * Os quatro helpers no topo eram closures do modulo de rota (capturavam `db`). Aqui recebem `db`
 * por parametro e a rota mantem wrappers de uma linha, para os outros 16 usos dela nao mudarem —
 * refactor sem mudanca de comportamento e testado como tal
 * (tests/api/materialServiceCriacao.api.test.js compara a linha da rota com a do servico coluna
 * a coluna, em vez de uma lista de campos escolhida a dedo).
 */
const { dbRun, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');
const stockService = require('./stockService');

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

function bool01(v) { return v ? 1 : 0; }

async function validateFamiliaAtiva(db, familiaId) {
  if (!familiaId) return null;
  const row = await dbGet(db, 'SELECT id, ativo FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
  if (!row) throw new Error('Família não encontrada');
  if (row.ativo !== 1) throw new Error('Família inativa — não é possível vincular novos itens');
  return row;
}

/**
 * Subfamilias (Etapa 2, Task 3): quando informada, a subfamilia do material precisa ser filha
 * (parent_id = familiaId) e ativa. familiaId pode ser null (familia omitida no PUT full-replace) —
 * nesse caso nenhuma subfamilia bate no WHERE e a validacao falha, que e o comportamento correto.
 */
async function validateSubfamilia(db, subfamiliaId, familiaId) {
  if (!subfamiliaId) return null;
  const row = await dbGet(db,
    'SELECT id FROM familias_material_almoxarifado WHERE id = ? AND parent_id = ? AND ativo = 1',
    [subfamiliaId, familiaId]);
  if (!row) throw new Error('Subfamília inválida para a família selecionada');
  return row;
}

function buildLocalizacaoPath(loc, parent) {
  const partes = [];
  if (parent) partes.push([parent.codigo, parent.descricao || parent.subgrupo].filter(Boolean).join(' '));
  const propria = [loc.descricao, loc.subgrupo, loc.setor].filter(Boolean)[0];
  if (propria) partes.push(propria);
  return partes.filter(Boolean).join(' / ');
}

function formatLocalizacaoLabel(loc, parent) {
  const p = buildLocalizacaoPath(loc, parent);
  return p ? `${loc.codigo} — ${p}` : loc.codigo;
}

/**
 * Resolve o par (id, rotulo formatado) de uma localizacao padrao a partir do FK — usado no cadastro
 * de materiais (POST/PUT). locId e null quando o FK nao foi informado; locText e null quando a
 * localizacao nao existe mais (FK orfao).
 */
async function resolveLocalizacaoFromFk(db, localizacaoPadraoId) {
  const id = localizacaoPadraoId ? parseInt(localizacaoPadraoId, 10) : null;
  if (!id) return { locId: null, locText: null };
  const row = await dbGet(db,
    `SELECT l.id, l.codigo, l.descricao, l.setor, l.subgrupo, l.parent_id,
            p.codigo as parent_codigo, p.descricao as parent_descricao, p.subgrupo as parent_subgrupo
     FROM localizacoes_almoxarifado l
     LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
     WHERE l.id = ?`, [id]);
  if (!row) return { locId: id, locText: null };
  const parent = row.parent_id ? {
    codigo: row.parent_codigo, descricao: row.parent_descricao, subgrupo: row.parent_subgrupo,
  } : null;
  return { locId: id, locText: formatLocalizacaoLabel(row, parent) };
}

/**
 * Proximo codigo da familia — pelo MAIOR NUMERO, nao pelo material de maior id.
 *
 * O que havia antes (routes/almoxarifado.js:697-739) era `ORDER BY id DESC LIMIT 1` + 1. Dois
 * defeitos: (1) cadastrar CHP-010 e depois CHP-002 fazia o gerador olhar CHP-002 (id maior) e
 * propor CHP-003, que ja podia existir; (2) em lote, N chamadas concorrentes devolvem o MESMO
 * numero — e a Etapa 8c pede N codigos de uma vez (uma chapa vira N pecas).
 *
 * O (1) se resolve aqui, com MAX. O (2) NAO se resolve aqui e nem tem como: esta funcao so LE.
 * Quem resolve e createMaterial, com retry sob UNIQUE quando `codigo_auto` esta ligado — a
 * colisao e detectada onde ela de fato acontece, no INSERT.
 *
 * GLOB '[0-9]*' alem do LIKE: sem ele, um codigo manual como 'CHP-ESPECIAL' entraria no CAST e
 * viraria 0 em silencio (SQLite nao lanca em CAST invalido), e um codigo 'CHP-12A' viraria 12 —
 * numeros que competiriam com os de verdade pelo MAX.
 */
async function proximoCodigo(db, familiaId) {
  if (familiaId) {
    const fam = await dbGet(db, 'SELECT codigo FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
    if (!fam) throw erro('Família não encontrada', 404);
    const prefix = fam.codigo;
    const row = await dbGet(db, `SELECT MAX(CAST(substr(codigo, ?) AS INTEGER)) AS maxnum
      FROM materiais_almoxarifado
      WHERE familia_id = ? AND codigo LIKE ? AND codigo GLOB ?`,
      [prefix.length + 2, familiaId, `${prefix}-%`, `${prefix}-[0-9]*`]);
    const prox = Number(row?.maxnum || 0) + 1;
    return `${prefix}-${String(prox).padStart(3, '0')}`;
  }
  const row = await dbGet(db, `SELECT MAX(CAST(substr(codigo, 5) AS INTEGER)) AS maxnum
    FROM materiais_almoxarifado WHERE codigo GLOB 'ALM-[0-9]*'`);
  const prox = Number(row?.maxnum || 0) + 1;
  return `ALM-${String(prox).padStart(3, '0')}`;
}

/** Quantas vezes createMaterial regera o codigo quando `codigo_auto` esta ligado. */
const TENTATIVAS_CODIGO_AUTO = 5;

/**
 * Cria o material. Mesmos cinco passos do handler de onde ele saiu, na MESMA ORDEM:
 *   1. valida familia e subfamilia   2. resolve a localizacao padrao (id + rotulo)
 *   3. INSERT                         4. movimentacao de saldo inicial (so se quantidade > 0)
 *   5. sync da linha de saldo por localizacao, auditoria, e releitura enriquecida com a familia
 *
 * `data.codigo_auto` (Etapa 8c, decisao 6): quando verdadeiro, `data.codigo` e SUGESTAO. Colisao
 * UNIQUE regera pelo proximoCodigo da familia e tenta de novo, ate TENTATIVAS_CODIGO_AUTO. Sem a
 * flag, colisao continua sendo 400 'Código já existe' — identico ao de hoje, e o formulario de
 * cadastro manual nao muda: quem digitou o codigo quer saber que ele ja existe, nao ganhar outro.
 */
async function createMaterial(db, user, data) {
  const {
    codigo, nome, descricao, categoria, unidade,
    quantidade_atual, quantidade_minima, quantidade_maxima,
    custo_unitario, fornecedor_principal, codigo_fornecedor,
    ncm, especificacoes, observacoes,
    descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
    fornecedor_id, proprietario_cliente_id, tipo_material, material_critico, controle_lote,
    controle_certificado, familia_id, subfamilia_id,
    fabricante, codigo_fabricante, peso_unitario, dimensoes, material_construtivo,
    norma, marca, modelo, aplicacao, ponto_reposicao, lote_economico,
    controle_serie, controle_validade, controle_corrida, requer_inspecao, requer_foto,
    classe_abc, unidade_compra, fator_conversao_compra, unidade_consumo, fator_conversao_consumo,
    codigo_auto,
  } = data;

  try {
    await validateFamiliaAtiva(db, familia_id);
    await validateSubfamilia(db, subfamilia_id || null, familia_id);
  } catch (e) {
    throw erro(e.message, 400);
  }

  let locId; let locText;
  try {
    ({ locId, locText } = await resolveLocalizacaoFromFk(db, localizacao_padrao_id));
  } catch (e) {
    throw erro(e.message, 500);
  }

  const insertValues = {
    codigo, nome,
    descricao: descricao || null,
    categoria: categoria || 'OUTROS',
    unidade: unidade || 'UN',
    localizacao: locText,
    quantidade_atual: quantidade_atual || 0,
    quantidade_minima: quantidade_minima || 0,
    quantidade_maxima: quantidade_maxima || 0,
    custo_unitario: custo_unitario || 0,
    fornecedor_principal: fornecedor_principal || null,
    codigo_fornecedor: codigo_fornecedor || null,
    ncm: ncm || null,
    especificacoes: especificacoes || null,
    observacoes: observacoes || null,
    descricao_tecnica: descricao_tecnica || null,
    categoria_id: categoria_id ?? null,
    subcategoria_id: subcategoria_id ?? null,
    localizacao_padrao_id: locId,
    fornecedor_id: fornecedor_id ?? null,
    // Etapa 8: NULL = material nosso. O select da secao "Propriedade" manda '' quando ninguem e
    // escolhido; `|| null` normaliza para o unico valor que significa "nosso" — 0 e '' NAO
    // significam nada aqui (as leituras de estoque proprio testam IS NULL).
    proprietario_cliente_id: proprietario_cliente_id || null,
    tipo_material: tipo_material || null,
    material_critico: bool01(material_critico),
    controle_lote: bool01(controle_lote),
    controle_certificado: bool01(controle_certificado),
    familia_id,
    subfamilia_id: subfamilia_id ?? null,
    fabricante: fabricante || null,
    codigo_fabricante: codigo_fabricante || null,
    peso_unitario: peso_unitario ?? null,
    dimensoes: dimensoes || null,
    material_construtivo: material_construtivo || null,
    norma: norma || null,
    marca: marca || null,
    modelo: modelo || null,
    aplicacao: aplicacao || null,
    ponto_reposicao: ponto_reposicao ?? null,
    lote_economico: lote_economico ?? null,
    controle_serie: bool01(controle_serie),
    controle_validade: bool01(controle_validade),
    controle_corrida: bool01(controle_corrida),
    requer_inspecao: bool01(requer_inspecao),
    requer_foto: bool01(requer_foto),
    classe_abc: classe_abc || null,
    unidade_compra: unidade_compra || null,
    fator_conversao_compra: fator_conversao_compra ?? null,
    unidade_consumo: unidade_consumo || null,
    fator_conversao_consumo: fator_conversao_consumo ?? null,
  };
  const insertColumns = Object.keys(insertValues);

  let id = null;
  let ultimoErro = null;
  const tentativas = codigo_auto ? TENTATIVAS_CODIGO_AUTO : 1;
  for (let i = 0; i < tentativas && id === null; i += 1) {
    try {
      const result = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (${insertColumns.join(', ')})
        VALUES (${insertColumns.map(() => '?').join(',')})`,
        insertColumns.map((c) => insertValues[c]));
      id = result.lastID;
    } catch (err) {
      if (!(err.message && err.message.includes('UNIQUE'))) throw erro(err.message, 500);
      ultimoErro = err;
      // Regera SO quando a flag esta ligada. Sem ela, a colisao e resposta ao usuario, nao
      // acidente a contornar.
      if (codigo_auto) insertValues.codigo = await proximoCodigo(db, familia_id);
    }
  }
  if (id === null) {
    throw erro(codigo_auto
      ? `Não foi possível gerar um código livre para a família após ${TENTATIVAS_CODIGO_AUTO} tentativas`
      : 'Código já existe', 400);
  }
  void ultimoErro;

  // Movimentacao inicial: SO com saldo. Gravar sempre sujaria o extrato de todo material
  // cadastrado sem saldo, e o extrato e a tela onde a Etapa 1 gastou uma etapa inteira.
  if ((quantidade_atual || 0) > 0) {
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
      VALUES (?, 'ENTRADA', ?, 0, ?, 'Saldo inicial de cadastro', ?, ?)`,
      [id, quantidade_atual, quantidade_atual, user.id, user.nome || user.email]);
  }

  await stockService.syncSaldoLocalizacaoPadrao(db, id).catch((e) => {
    console.warn('[almoxarifado] Falha ao sincronizar saldo por localização:', e.message);
  });

  await registrarAuditoria(db, {
    entidade: 'material', entidade_id: id, acao: 'CRIACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { codigo: insertValues.codigo, nome, familia_id },
  });

  return dbGet(db, `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
    FROM materiais_almoxarifado m
    LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
    WHERE m.id = ?`, [id]);
}

module.exports = {
  bool01, validateFamiliaAtiva, validateSubfamilia, resolveLocalizacaoFromFk,
  proximoCodigo, createMaterial, TENTATIVAS_CODIGO_AUTO,
};
```

- [x] **Step 4: Fazer a rota chamar o serviço (helpers viram delegações)**

Em `server/routes/almoxarifado.js`, acrescentar o `require` junto dos outros (logo abaixo de
`const stockService = require('../services/almoxarifado/stockService');`):

```js
const materialService = require('../services/almoxarifado/materialService');
```

Substituir o corpo de `resolveLocalizacaoFromFk` (`:117-134`) por uma delegação — **manter o nome e
a assinatura**, para os outros usos do arquivo não mudarem:

```js
  // Etapa 8c, Task 1: o corpo mudou de casa (services/almoxarifado/materialService.js) porque a
  // criacao de material precisava sair do handler HTTP. Este wrapper existe para os outros usos
  // deste arquivo (PUT de material, importacao) continuarem chamando com um argumento so.
  async function resolveLocalizacaoFromFk(localizacaoPadraoId) {
    return materialService.resolveLocalizacaoFromFk(db, localizacaoPadraoId);
  }
```

Substituir `validateFamiliaAtiva` (`:309-315`), `validateSubfamilia` (`:321-329`) e `bool01`
(`:330`) pelas delegações:

```js
  async function validateFamiliaAtiva(familiaId) {
    return materialService.validateFamiliaAtiva(db, familiaId);
  }

  async function validateSubfamilia(subfamiliaId, familiaId) {
    return materialService.validateSubfamilia(db, subfamiliaId, familiaId);
  }

  const bool01 = materialService.bool01;
```

> **As funções auxiliares `buildLocalizacaoPath` e `formatLocalizacaoLabel` continuam existindo em
> `routes/almoxarifado.js`** — elas têm outros usos no arquivo (listagem de localizações). O
> serviço leva a **sua** cópia. Duplicação declarada e aceita: unificá-las obrigaria a mover a
> listagem de localizações inteira, que não é assunto desta etapa. Registrado como dívida na
> Task 10.

Substituir o corpo do handler `app.post('/api/almoxarifado/materiais', ...)` (`:365-490`) inteiro
por:

```js
  // POST /api/almoxarifado/materiais — criar
  //
  // requirePermission('criar_material'): o gate global do modulo (linha ~71) so checa ACESSO, nao
  // perfil — sem isto qualquer usuario do modulo (fallback PRODUCAO em getPerfilFromUser)
  // cadastrava material, contornando criar_material: [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA].
  //
  // Etapa 8c, Task 1: o corpo virou materialService.createMaterial. O gate FICA AQUI de proposito
  // — os caminhos internos que chamam o servico ja passaram pelo gate deles.
  app.post('/api/almoxarifado/materiais', requirePermission('criar_material'), validate(MaterialSchema), async (req, res) => {
    try {
      const row = await materialService.createMaterial(db, req.user, req.body);
      res.status(201).json(row);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
```

Substituir `GET /api/almoxarifado/proximo-codigo` (`:697-739`) inteiro por:

```js
  // GET /api/almoxarifado/proximo-codigo — proximo codigo da familia (ou geral)
  //
  // Etapa 8c, Task 1: passou a usar MAX do sufixo numerico em vez de ORDER BY id DESC LIMIT 1.
  // O bug: cadastrar CHP-010 e depois CHP-002 fazia o gerador olhar CHP-002 (id maior) e propor
  // CHP-003, que ja podia existir. E em LOTE — o caso da 8c, uma chapa que vira N pecas — N
  // chamadas concorrentes devolvem o MESMO numero, o que MAX nao resolve e nem tem como: quem
  // resolve e materialService.createMaterial, com retry sob UNIQUE quando `codigo_auto` esta
  // ligado. Duas mudancas, dois lugares, porque a colisao acontece no INSERT e nao aqui.
  app.get('/api/almoxarifado/proximo-codigo', async (req, res) => {
    try {
      const codigo = await materialService.proximoCodigo(db, req.query.familia_id || null);
      res.json({ codigo });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
```

- [x] **Step 5: Declarar `codigo_auto` no Zod (senão o campo é descartado em silêncio)**

Em `server/services/almoxarifado/schemas.js`, dentro de `MaterialShape`, logo abaixo de
`codigo: z.string().min(1, 'codigo é obrigatório'),`:

```js
  // Etapa 8c, decisao 6: quando verdadeiro, `codigo` e SUGESTAO — colisao UNIQUE faz
  // materialService.createMaterial regerar pelo proximoCodigo da familia e tentar de novo. Existe
  // porque a 8c cria N materiais-peca de uma vez a partir da MESMA sugestao, e o gerador de codigo
  // (que so LE) devolve o mesmo numero para as N chamadas concorrentes.
  // SEM DECLARAR AQUI o z.object descarta a chave EM SILENCIO e o retry nunca liga: o lote falharia
  // com 'Código já existe' e ninguem saberia por que. Quarta vez que esta armadilha aparece nesta
  // base (reserva_id, lote_id, justificativa do cancelamento, material_id do retorno).
  // No PUT e inerte: o UPDATE e montado a partir de MATERIAL_UPDATE_COLUMNS, lista fixa.
  codigo_auto: FlagSchema,
```

- [x] **Step 6: Rodar o teste da task e ver passar**

Run: `cd server && node tests/api/materialServiceCriacao.api.test.js`
Expected: `12 passed, 0 failed`

- [x] **Step 7: Rodar as suítes que este refactor pode ter quebrado**

Run:
```
cd server && npm run test:api
cd server && npm run test:validation
```
Expected: `test:api` com **todos os arquivos OK** (o número de arquivos é o da entrada **+1**, o
arquivo novo desta task — anote o número medido, não copie o desta linha); `test:validation` com
`4 passed, 0 failed`.

> **Atenção ao que pode quebrar aqui:** qualquer teste que exercite `POST /api/almoxarifado/materiais`
> ou `GET /api/almoxarifado/proximo-codigo`. Se um deles falhar, **é achado de refactor**, não ruído:
> significa que o handler fazia algo que o serviço não faz. Conserte o **serviço** para igualar o
> handler antigo (`git show HEAD:server/routes/almoxarifado.js | sed -n '365,490p'`), nunca o teste.

- [x] **Step 8: SABOTAGEM — provar que os testes sabem falhar**

Três sabotagens. Para **cada uma**: contar a âncora, `md5sum` antes, sabotar, `md5sum` depois (tem
de mudar), rodar, restaurar, `md5sum` de novo (tem de voltar), `git diff --stat` vazio.

**S1 — o refactor "esquece" a movimentação de saldo inicial** (prova o teste
`createMaterial grava a movimentacao de saldo inicial igual a rota`):

```bash
cd server
grep -cF "if ((quantidade_atual || 0) > 0) {" services/almoxarifado/materialService.js   # TEM de dar 1
md5sum services/almoxarifado/materialService.js
perl -0pi -e "s/if \(\(quantidade_atual \|\| 0\) > 0\) \{/if (false) {/" services/almoxarifado/materialService.js
md5sum services/almoxarifado/materialService.js   # TEM de diferir
node tests/api/materialServiceCriacao.api.test.js
git checkout -- services/almoxarifado/materialService.js
md5sum services/almoxarifado/materialService.js   # TEM de voltar ao primeiro
git diff --stat                                    # TEM de sair vazio
```
Esperado: **`✗ createMaterial grava a movimentacao de saldo inicial igual a rota: o servico nao gravou a movimentacao de saldo inicial`**,
e o restante passando. Se **nada** falhar, o teste está lendo a movimentação errada — **achado**.

**S2 — `proximoCodigo` volta ao `ORDER BY id DESC`** (prova
`proximo-codigo usa o MAIOR numero, nao o material de maior id`):

```bash
cd server
grep -cF "SELECT MAX(CAST(substr(codigo, ?) AS INTEGER)) AS maxnum" services/almoxarifado/materialService.js  # TEM de dar 1
md5sum services/almoxarifado/materialService.js
perl -0pi -e "s/SELECT MAX\(CAST\(substr\(codigo, \?\) AS INTEGER\)\) AS maxnum/SELECT CAST(substr(codigo, ?) AS INTEGER) AS maxnum/" services/almoxarifado/materialService.js
perl -0pi -e "s/WHERE familia_id = \? AND codigo LIKE \? AND codigo GLOB \?/WHERE familia_id = ? AND codigo LIKE ? AND codigo GLOB ? ORDER BY id DESC LIMIT 1/" services/almoxarifado/materialService.js
md5sum services/almoxarifado/materialService.js
node tests/api/materialServiceCriacao.api.test.js
git checkout -- services/almoxarifado/materialService.js
md5sum services/almoxarifado/materialService.js
git diff --stat
```
Esperado: **`✗ proximo-codigo usa o MAIOR numero, nao o material de maior id`** com
`'MAX-003' !== 'MAX-011'`, e também **`✗ GET /proximo-codigo devolve o mesmo numero...`** (a rota lê
do mesmo lugar). Duas falhas, não uma — é isso que prova que a rota e o serviço têm uma conta só.

**S3 — o retry de `codigo_auto` é desligado** (prova `proximo-codigo em LOTE nao repete`):

```bash
cd server
grep -cF "if (codigo_auto) insertValues.codigo = await proximoCodigo(db, familia_id);" services/almoxarifado/materialService.js  # TEM de dar 1
md5sum services/almoxarifado/materialService.js
sed -i "s|if (codigo_auto) insertValues.codigo = await proximoCodigo(db, familia_id);|if (false) insertValues.codigo = await proximoCodigo(db, familia_id);|" services/almoxarifado/materialService.js
md5sum services/almoxarifado/materialService.js
node tests/api/materialServiceCriacao.api.test.js
git checkout -- services/almoxarifado/materialService.js
md5sum services/almoxarifado/materialService.js
git diff --stat
```
Esperado: **`✗ proximo-codigo em LOTE nao repete: 5 criacoes concorrentes dao 5 codigos distintos`**
— a mensagem traz os 5 códigos, e todos serão `LOT-001`, quatro deles com rejeição por
`Código já existe`.

- [x] **Step 9: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/materialService.js \
        server/services/almoxarifado/schemas.js \
        server/routes/almoxarifado.js \
        server/tests/api/materialServiceCriacao.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 1: criar material vira servico e o gerador de codigo aguenta lote

A Etapa 8c precisa criar o material-peca resultante da transformacao a partir da tela, e nao havia
funcao de criar material: o unico INSERT INTO materiais_almoxarifado de producao estava inline no
handler HTTP (routes/almoxarifado.js:454), junto com quatro efeitos que quem so olha o INSERT nao
enxerga (movimentacao de saldo inicial, sync da linha de saldo por localizacao, auditoria e a
releitura enriquecida com a familia). Qualquer outro caminho teria de fazer HTTP para o proprio
servidor ou reimplementar os cinco passos.

Agora existe services/almoxarifado/materialService.createMaterial, e a rota e um chamador magro. O
gate requirePermission('criar_material') FICA NA ROTA: os caminhos internos que chamam o servico ja
passaram pelo gate deles, e duplicar a checagem recusaria chamada de servico para servico.

Segundo bug, o que motivou a mudanca: GET /proximo-codigo montava o proximo numero com
ORDER BY id DESC LIMIT 1. Cadastrar CHP-010 e depois CHP-002 fazia o gerador olhar CHP-002 (id
maior) e propor CHP-003, que podia ja existir. E em lote — o caso da 8c, uma chapa que vira N
pecas — N chamadas concorrentes devolvem o MESMO numero.

Sao DUAS correcoes em DOIS lugares, e o design tratava como uma. MAX do sufixo numerico conserta o
primeiro e nao tem como consertar o segundo: proximoCodigo so LE. O segundo foi resolvido onde a
colisao de fato acontece, no INSERT: createMaterial ganhou retry sob UNIQUE, ligado pelo campo novo
e explicito `codigo_auto`.

DESCARTADO: fazer proximoCodigo reservar o numero numa tabela de sequencia. Resolveria, e custa uma
tabela nova, um caminho de limpeza para numeros reservados e nao usados, e uma segunda fonte de
verdade sobre qual codigo existe — para um problema que o retry resolve em 6 linhas.
DESCARTADO: tornar `codigo` opcional no MaterialSchema quando ha familia. Mudaria o contrato da API
para todo mundo por causa de um caso; `codigo_auto` deixa o caso explicito e o resto identico.

`codigo_auto` foi declarado no MaterialShape porque z.object DESCARTA chave nao declarada em
silencio (schemas.js:311-320): sem a declaracao o retry nunca ligaria e o lote falharia com
'Código já existe' sem ninguem entender por que. Quarta vez que essa armadilha aparece nesta base.

Testes: 12 em tests/api/materialServiceCriacao.api.test.js, sendo tres guardas de refactor que
comparam a linha gravada pela ROTA com a gravada pelo SERVICO coluna a coluna (lista de campos
escolhida a dedo aprovaria o refactor que esqueceu a coluna que ninguem lembrou de listar).
Sabotagens executadas: desligar a movimentacao de saldo inicial, voltar o ORDER BY id DESC e
desligar o retry — as tres derrubaram exatamente os testes previstos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: o recebimento por NF passa a alimentar o custo médio

> ## ✅ FEITA — 2026-08-13 (`be9b384` — **hash de outro assunto, ver abaixo**)
>
> Steps 1 a 6 executados na ordem, com o teste vermelho antes da implementação
> (`2 passed, 3 failed`: os dois principais mais o do `valor_unitario` da linha da nota; os dois
> controles positivos passaram de primeira, como o plano previa). Depois:
> **`5 passed, 0 failed`** em `server/tests/api/recebimentoCustoMedio.api.test.js` e
> **`77/77 arquivos OK`** em `npm run test:api`.
>
> **⚠ O commit desta task NÃO tem mensagem própria.** As Tasks 1, 2 e 6 rodaram em paralelo no
> **mesmo working tree**, e o `git commit` do agente da Task 6 levou junto o que a Task 2 já tinha
> em *stage*: `receiptService.js` e `recebimentoCustoMedio.api.test.js` entraram em `be9b384`
> ("Task 6: o rateio…"), cuja mensagem não fala deles. Quem procurar o commit da Task 2 pela
> mensagem **não acha**. Registrado aqui porque apagar o descompasso em silêncio é o que o
> `CLAUDE.md` proíbe. **Lição para as próximas tasks paralelas: `git add` e `git commit` na mesma
> linha de comando, ou stage nenhum entre execuções concorrentes.**
>
> **Duas correções ao plano, feitas na execução** (detalhadas nos Steps 1 e 5): a assinatura real é
> `darEntradaEstoque(db, user, rec, recebimentoId, opcoes)` — corrigida no teste, não no serviço; e
> a sabotagem S3 do plano **não prova o que dizia provar** — quebrar só a guarda do motor deixa
> `5 passed, 0 failed`, porque o Step 3 normaliza `0` para `undefined` e o motor nunca recebe 0.
> Quem prova é a S3b, que quebra **as duas camadas** (`3 passed, 2 failed`).

**Por que esta task existe, e por que ela vem antes do rateio.** A decisão 5 do design é uma
**correção de pré-requisito**, achada durante o desenho: `receiptService.js:493-513` chama
`registrarMovimentacao` com `ENTRADA_COMPRA` e **não passa `custo_unitario`**, apesar de gravar
`valor_unitario` e `valor_total` na linha da nota (`receiptService.js:110-115`). O **único** caminho
que move `custo_medio` no sistema inteiro é a movimentação manual com custo digitado à mão. Sem esta
task, o rateio da decisão 4 distribuiria **R$ 0,00** na maioria dos casos: a conta fecharia
(zero = zero) e o resultado seria inútil.

**Files:**
- Modify: `server/services/almoxarifado/receiptService.js:493-513`
- Test: `server/tests/api/recebimentoCustoMedio.api.test.js` (**novo**)

**Interfaces:**
- Consumes: `stockService.registrarMovimentacao` com o campo `custo_unitario` (o motor já o
  desestrutura como `custo_unitario: custoInformado`, `stockService.js:484`, e o usa no ramo
  `custoInformado > 0` de `:1031-1041`). **Nada de novo é criado no motor.**
- Produces: nenhuma assinatura nova. O que muda é **comportamento declarado**: material recebido por
  NF passa a ter `custo_medio` real, **daqui para frente**. **Não há backfill** — recalcular custo
  médio retroativo exigiria o custo por movimento, e `movimentacoes_almoxarifado` **não tem nenhuma
  coluna de custo** (`schema.js:205-219`).

---

- [x] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/recebimentoCustoMedio.api.test.js`:

```js
/**
 * Etapa 8c, Task 2 (decisao 5 do design) — o recebimento por NF passa a alimentar o custo medio.
 *
 * Achado durante o desenho da 8c, e ele decide se o rateio da decisao 4 vale alguma coisa:
 * receiptService.darEntradaEstoque chamava registrarMovimentacao com ENTRADA_COMPRA e NAO passava
 * custo_unitario, apesar de gravar valor_unitario/valor_total na linha da nota. O unico caminho que
 * movia custo_medio no sistema inteiro era a movimentacao manual com custo digitado a mao — entao o
 * rateio da transformacao distribuiria R$ 0,00 na maioria dos casos, a conta fecharia (zero = zero)
 * e o resultado seria inutil.
 *
 * O par de testes aqui e BILATERAL de proposito, e o segundo e o que importa mais: passar
 * custo_unitario CEGAMENTE zeraria o custo de todo material recebido sem valor na nota.
 *
 * Executar: cd server && node tests/api/recebimentoCustoMedio.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { atual = 0, custoMedio = 0, custoUnit = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, ativo)
     VALUES (?,?,'UN',?,?,?,1)`, [`NF-${seq}`, `Material NF ${seq}`, atual, custoMedio, custoUnit]);
  return r.lastID;
}
const custos = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario FROM materiais_almoxarifado WHERE id = ?', [id]);

/** Cria recebimento com 1 item e da entrada. Devolve o id do recebimento. */
async function receberEDarEntrada(db, materialId, { quantidade, valor_unitario }) {
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    tipo: 'COMPRA',
    nota_fiscal: `NF-${Date.now()}${Math.floor(Math.random() * 1000)}`,
    fornecedor_nome: 'Fornecedor Teste',
    itens: [{ material_id: materialId, quantidade, quantidade_recebida: quantidade, valor_unitario }],
  });
  await receiptService.darEntradaEstoque(db, ADMIN, rec.id, {});
  return rec.id;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('recebimento por NF passa a alimentar custo medio', async () => {
    const mat = await novoMaterial(db, { atual: 0, custoMedio: 0, custoUnit: 0 });
    await receberEDarEntrada(db, mat, { quantidade: 100, valor_unitario: 10 });
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 100);
    assert.strictEqual(c.custo_medio, 10,
      'o recebimento nao alimentou custo_medio — o rateio da transformacao distribuiria R$ 0,00');
    assert.strictEqual(c.custo_unitario, 10);
  });

  await test('segunda NF com preco diferente faz MEDIA PONDERADA, nao substituicao', async () => {
    // A conta e a do motor (stockService.js:1031-1041): (100*10 + 100*20) / 200 = 15.
    // Sem esta assercao, "custo_medio = ultimo preco" passaria no teste acima.
    const mat = await novoMaterial(db);
    await receberEDarEntrada(db, mat, { quantidade: 100, valor_unitario: 10 });
    await receberEDarEntrada(db, mat, { quantidade: 100, valor_unitario: 20 });
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 200);
    assert.strictEqual(c.custo_medio, 15, `media ponderada errada: ${c.custo_medio}`);
    assert.strictEqual(c.custo_unitario, 20, 'custo_unitario deve ser o ULTIMO custo, nao a media');
  });

  await test('[CONTROLE POSITIVO] recebimento SEM valor_unitario nao zera o custo existente', async () => {
    // O modo de falhar desta decisao. Passar custo_unitario cegamente (ou passar 0) zeraria o
    // custo de todo material recebido sem valor na nota — e nota sem valor e caso normal
    // (remessa de conserto, amostra, brinde, material de cliente). O motor ja protege disso pelo
    // ramo `custoInformado > 0` (stockService.js:1031 e o else de :1043), e este teste e o que
    // garante que a Task 2 nao passou por cima dessa protecao.
    const mat = await novoMaterial(db, { atual: 50, custoMedio: 7.5, custoUnit: 7.5 });
    await receberEDarEntrada(db, mat, { quantidade: 50, valor_unitario: 0 });
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 100, 'a quantidade tem de entrar mesmo sem valor na nota');
    assert.strictEqual(c.custo_medio, 7.5, 'a NF sem valor ZEROU o custo medio existente');
    assert.strictEqual(c.custo_unitario, 7.5, 'a NF sem valor ZEROU o custo unitario existente');
  });

  await test('[CONTROLE POSITIVO] valor_unitario ausente (undefined) tambem nao zera o custo', async () => {
    // Irmao do anterior, pelo outro caminho: `valor_unitario` ausente no payload vira
    // `parseFloat(undefined) || 0` = 0 na linha da nota (receiptService.js:110). Se a Task 2
    // passasse `item.valor_unitario` cru em vez do numero normalizado, o motor receberia
    // `undefined` — que NAO e > 0 e portanto tambem nao move custo. Este teste fixa isso: os dois
    // caminhos tem de dar o mesmo resultado.
    const mat = await novoMaterial(db, { atual: 20, custoMedio: 3, custoUnit: 3 });
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      tipo: 'COMPRA', nota_fiscal: `NF-SEMVAL-${Date.now()}`, fornecedor_nome: 'Fornecedor Teste',
      itens: [{ material_id: mat, quantidade: 10, quantidade_recebida: 10 }],
    });
    await receiptService.darEntradaEstoque(db, ADMIN, rec.id, {});
    const c = await custos(db, mat);
    assert.strictEqual(c.quantidade_atual, 30);
    assert.strictEqual(c.custo_medio, 3);
  });

  await test('o valor_unitario que alimenta o custo e o MESMO gravado na linha da nota', async () => {
    // Sem esta assercao, alimentar o custo com um numero calculado em outro lugar (valor_total /
    // quantidade, por exemplo) passaria nos testes acima e produziria uma nota que diz um preco e
    // um custo que diz outro — a divergencia mais dificil de achar depois.
    const mat = await novoMaterial(db);
    const recId = await receberEDarEntrada(db, mat, { quantidade: 40, valor_unitario: 12.75 });
    const item = await dbGet(db,
      'SELECT valor_unitario FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
    const c = await custos(db, mat);
    assert.strictEqual(item.valor_unitario, 12.75);
    assert.strictEqual(c.custo_unitario, item.valor_unitario,
      'o custo aplicado nao e o valor_unitario da linha da nota');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

> **Se a assinatura de `receiptService.criarRecebimento`/`darEntradaEstoque` divergir do uso acima,
> corrija o TESTE lendo o serviço** (`sed -n '60,140p' server/services/almoxarifado/receiptService.js`
> e `grep -n 'async function darEntradaEstoque' -A 20 server/services/almoxarifado/receiptService.js`),
> **nunca o serviço.** Esta task não muda o contrato do recebimento.
>
> **⚠ Divergiu mesmo (corrigido no teste em 2026-08-13):** a assinatura real é
> `darEntradaEstoque(db, user, rec, recebimentoId, opcoes)` — a **linha** do recebimento vem
> **antes** do id (`receiptService.js:363`), porque a pré-checagem de material de cliente lê
> `rec.nota_fiscal`. O bloco acima escrevia `darEntradaEstoque(db, ADMIN, rec.id, {})`. E
> `criarRecebimento` lê `tipo_recebimento`, não `tipo` (`receiptService.js:64-70`) — `tipo` seria
> ignorado em silêncio.

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/recebimentoCustoMedio.api.test.js`

Expected: FAIL nos **dois primeiros** testes com `0 !== 10` e `0 !== 15` — o custo não é alimentado.
Os **três controles positivos passam de primeira**, e isso **é esperado**: eles descrevem o
comportamento que já existe (o motor não mexe em custo quando não recebe custo). Estão aqui para
provar que a Task 2 não o destruiu — ver a sabotagem S2 do Step 5, que é o que dá valor a eles.

- [x] **Step 3: Implementar**

Em `server/services/almoxarifado/receiptService.js`, no bloco `await registrarMovimentacao(db, user, {`
de `:493-513`, acrescentar **uma** propriedade logo abaixo de `quantidade: qtd,`:

```js
          // Etapa 8c, decisao 5 do design: o custo do item da nota passa a ALIMENTAR o custo medio.
          //
          // Ate aqui o recebimento gravava valor_unitario/valor_total na linha do item (linha ~112)
          // e NAO os passava adiante, entao o unico caminho que movia custo_medio no sistema
          // inteiro era a movimentacao manual com custo digitado a mao. A Etapa 8c rateia o custo
          // da chapa entre as pecas cortadas — com o custo medio quase nunca alimentado, o rateio
          // distribuiria R$ 0,00, a conta fecharia (zero = zero) e o resultado seria inutil.
          //
          // `|| undefined` NAO e cosmetico e tem teste bilateral: nota SEM valor e caso normal
          // (conserto, amostra, brinde, material de cliente). O motor so mexe em custo quando
          // `custoInformado > 0` (stockService.js:1031); mandar 0 cai no ramo `else` (:1043) e o
          // custo fica intocado — que e o comportamento certo. Mandar `undefined` explicitamente
          // deixa isso legivel em vez de depender de o motor tratar o 0.
          //
          // MUDANCA DE COMPORTAMENTO DECLARADA: material recebido por NF passa a ter custo medio
          // real, e vale SO daqui para frente. NAO ha backfill: recalcular custo medio retroativo
          // exigiria o custo POR MOVIMENTO, e movimentacoes_almoxarifado nao tem nenhuma coluna de
          // custo (schema.js:205-219).
          custo_unitario: (parseFloat(item.valor_unitario) || 0) > 0
            ? parseFloat(item.valor_unitario)
            : undefined,
```

- [x] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/api/recebimentoCustoMedio.api.test.js`
Expected: `5 passed, 0 failed`

Run: `cd server && npm run test:api`
Expected: todos os arquivos OK. **Atenção:** qualquer teste de recebimento que assira `custo_medio`
ou `custo_unitario` **vai** mudar de resultado — se algum falhar, leia a asserção: se ela dizia
"custo continua 0 depois do recebimento", **ela documentava o bug** e deve ser reescrita com o
motivo escrito no próprio teste (`// Etapa 8c, decisao 5: o recebimento passou a alimentar o
custo medio — este teste afirmava o contrario`).

- [x] **Step 5: SABOTAGEM**

**S1 — o custo volta a não ser passado** (prova os dois testes principais):

```bash
cd server
grep -cF "custo_unitario: (parseFloat(item.valor_unitario) || 0) > 0" services/almoxarifado/receiptService.js  # TEM de dar 1
md5sum services/almoxarifado/receiptService.js
perl -0pi -e "s/custo_unitario: \(parseFloat\(item\.valor_unitario\) \|\| 0\) > 0\n\s*\? parseFloat\(item\.valor_unitario\)\n\s*: undefined,/custo_unitario: undefined,/" services/almoxarifado/receiptService.js
md5sum services/almoxarifado/receiptService.js   # TEM de diferir
node tests/api/recebimentoCustoMedio.api.test.js
cp "$SCRATCH/receiptService.bak.js" services/almoxarifado/receiptService.js   # NAO use `git checkout --`: a implementacao do Step 3 ainda nao esta commitada
md5sum services/almoxarifado/receiptService.js
git diff --stat
```
Esperado: **`✗ recebimento por NF passa a alimentar custo medio`** (`0 !== 10`),
**`✗ segunda NF com preco diferente faz MEDIA PONDERADA`** (`0 !== 15`) e
**`✗ o valor_unitario que alimenta o custo e o MESMO gravado na linha da nota`**. **Três** falhas.
Os controles positivos continuam passando — correto: eles não dependem desta linha.

**S2 — a sabotagem que dá sentido aos controles positivos: passar o custo CEGAMENTE:**

```bash
cd server
grep -cF "custo_unitario: (parseFloat(item.valor_unitario) || 0) > 0" services/almoxarifado/receiptService.js  # TEM de dar 1
md5sum services/almoxarifado/receiptService.js
perl -0pi -e "s/custo_unitario: \(parseFloat\(item\.valor_unitario\) \|\| 0\) > 0\n\s*\? parseFloat\(item\.valor_unitario\)\n\s*: undefined,/custo_unitario: parseFloat(item.valor_unitario) || 0,/" services/almoxarifado/receiptService.js
md5sum services/almoxarifado/receiptService.js
node tests/api/recebimentoCustoMedio.api.test.js
cp "$SCRATCH/receiptService.bak.js" services/almoxarifado/receiptService.js   # NAO use `git checkout --`: a implementacao do Step 3 ainda nao esta commitada
md5sum services/almoxarifado/receiptService.js
git diff --stat
```
Esperado: os dois principais **continuam passando** e os controles positivos… **também**, porque o
motor recusa `custoInformado > 0` de qualquer forma. **Isso é o achado que a regra 5 do harness
manda registrar, e o plano já o registra aqui:** a proteção real mora no **motor**
(`stockService.js:1031`), não nesta linha — a expressão condicional é **legibilidade**, não guarda.
Escreva isto no commit e **não** finja que a sabotagem provou algo que não provou.

**S3 — quebrar a guarda do MOTOR. ⚠ O PLANO ESTAVA ERRADO AQUI — corrigido na execução (2026-08-13).**

O plano afirmava: *"Esperado: `✗ [CONTROLE POSITIVO] recebimento SEM valor_unitario nao zera o custo
existente` (`0 !== 7.5`). […] É esta sabotagem que prova que os controles positivos sabem falhar"*.
**Não prova: executada, ela deixa `5 passed, 0 failed`.** Motivo, achado só na execução: o Step 3
normaliza `0` para `undefined` **antes** de chamar o motor, então o motor **nunca recebe 0** vindo do
recebimento — e `undefined !== undefined` é falso, exatamente pelo mesmo argumento que o plano usou
para o *outro* controle positivo. As duas camadas se **sombreiam**: quebrar uma só nunca aparece.

**IMPORTANTE — `git checkout --` não pode ser usado aqui.** No Step 5 a implementação do Step 3
ainda está **não commitada**; `git checkout -- services/almoxarifado/receiptService.js` a
**destruiria** (foi o que corrompeu `stockService.js` numa sessão anterior). Restaure por cópia:
`cp <arquivo> $SCRATCH/<arquivo>.bak` antes, `cp $SCRATCH/<arquivo>.bak <arquivo>` depois, e
confira o md5. `git diff --stat` ao fim tem de voltar **igual ao de antes da sabotagem** (as
alterações do Step 3), não vazio.

```bash
cd server
# S3a (a do plano, mantida como REGISTRO do achado): quebra SO o motor -> nao derruba nada.
grep -cF "if (custoInformado && custoInformado > 0) {" services/almoxarifado/stockService.js   # TEM de dar 1
cp services/almoxarifado/stockService.js "$SCRATCH/stockService.bak.js"
md5sum services/almoxarifado/stockService.js
sed -i "s|if (custoInformado \&\& custoInformado > 0) {|if (custoInformado !== undefined) {|" services/almoxarifado/stockService.js
md5sum services/almoxarifado/stockService.js   # TEM de diferir
node tests/api/recebimentoCustoMedio.api.test.js   # 5 passed, 0 failed  <- ACHADO
cp "$SCRATCH/stockService.bak.js" services/almoxarifado/stockService.js

# S3b (a que PROVA): quebra as DUAS camadas ao mesmo tempo.
cp services/almoxarifado/receiptService.js "$SCRATCH/receiptService.bak.js"
perl -0pi -e "s/custo_unitario: \(parseFloat\(item\.valor_unitario\) \|\| 0\) > 0\n\s*\? parseFloat\(item\.valor_unitario\)\n\s*: undefined,/custo_unitario: parseFloat(item.valor_unitario) || 0,/" services/almoxarifado/receiptService.js
sed -i "s|if (custoInformado \&\& custoInformado > 0) {|if (custoInformado !== undefined) {|" services/almoxarifado/stockService.js
node tests/api/recebimentoCustoMedio.api.test.js
cp "$SCRATCH/receiptService.bak.js" services/almoxarifado/receiptService.js
cp "$SCRATCH/stockService.bak.js"   services/almoxarifado/stockService.js
md5sum services/almoxarifado/receiptService.js services/almoxarifado/stockService.js
git diff --stat
```
Esperado em S3b: **`3 passed, 2 failed`** — caem os **dois** controles positivos
(`a NF sem valor ZEROU o custo medio existente` e o irmão do `undefined`). **É S3b que prova que
os controles positivos sabem falhar.**

**Conclusão registrada no teste (comentário do controle positivo) e no commit:** não existe
asserção de comportamento capaz de separar as duas camadas — `movimentacoes_almoxarifado` não tem
coluna de custo, então mandar `0` e mandar `undefined` são **indistinguíveis de fora**. O teste
falha exatamente quando o sistema está quebrado de verdade (as duas camadas caídas), que é o
comportamento certo; a condicional do recebimento é **legibilidade + redundância**, não a guarda
única. Nenhuma asserção nova é possível aqui — e essa é a resposta à regra 5 do harness, não uma
desculpa: a alternativa seria espionar `registrarMovimentacao`, que `receiptService` desestrutura
**no `require`** (`receiptService.js:3-5`), tornando o monkeypatch do módulo inócuo.

- [x] **Step 6: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/receiptService.js \
        server/tests/api/recebimentoCustoMedio.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 2: recebimento por NF passa a alimentar o custo medio

Correcao de pre-requisito achada ao desenhar a 8c, e ela decide se o rateio de custo da
transformacao vale alguma coisa. receiptService.darEntradaEstoque chamava registrarMovimentacao com
ENTRADA_COMPRA e NAO passava custo_unitario, apesar de o proprio recebimento gravar
valor_unitario/valor_total na linha do item. Consequencia: o unico caminho que movia custo_medio no
sistema inteiro era a movimentacao manual com custo digitado a mao — quase nenhum material tinha
custo medio real, e o rateio da chapa entre as pecas cortadas distribuiria R$ 0,00. A conta fecharia
(zero = zero) e o resultado seria inutil.

O dado ja estava gravado; so nao era passado adiante. Uma propriedade a mais na chamada.

MUDANCA DE COMPORTAMENTO DECLARADA: material recebido por NF passa a ter custo medio real, e vale SO
daqui para frente. NAO ha backfill, e nao pode haver: recalcular custo medio retroativo exigiria o
custo POR MOVIMENTO, e movimentacoes_almoxarifado nao tem nenhuma coluna de custo (schema.js:205-219).
DESCARTADO acrescentar essa coluna: obrigaria a decidir baixa valorizada (CMV) para o modulo inteiro,
que e etapa propria (fora de escopo por decisao 10 do design).

O par de testes e bilateral: nota SEM valor e caso normal (conserto, amostra, brinde, material de
cliente) e nao pode zerar o custo existente. Achado registrado durante a sabotagem: a protecao real
contra isso mora no MOTOR (`custoInformado > 0`, stockService.js:1031), nao na expressao condicional
que este commit acrescenta — a condicional e legibilidade e redundancia.

Segundo achado, este contra o proprio plano, que previa o contrario: quebrar SO a guarda do motor
(`custoInformado !== undefined`) tambem NAO derruba nada, porque esta linha normaliza 0 para
`undefined` e o motor nunca recebe 0 vindo do recebimento. As duas camadas se sombreiam. A
sabotagem que PROVA os controles positivos e a que quebra AS DUAS ao mesmo tempo — 3 passed,
2 failed, com o custo existente zerado — e foi essa que foi executada. Nao existe assercao capaz de
separar as camadas por comportamento: movimentacoes_almoxarifado nao tem coluna de custo, entao
mandar 0 e mandar `undefined` sao indistinguiveis de fora. Registrado no comentario do teste e no
plano, que estava errado nesse ponto.

Testes: 5 em tests/api/recebimentoCustoMedio.api.test.js; 77/77 arquivos em npm run test:api.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 3: as três colunas da linha de resultado (`safeAlter`) + a peça Zod que as acompanha

**Files:**
- Modify: `server/services/almoxarifado/schema.js` — 3 `safeAlter` logo depois do CREATE de
  `retornos_remessa_item_almoxarifado` (`:1180-1193`); constante `TIPOS_RESULTADO`; export
- Modify: `server/services/almoxarifado/schemas.js` — `ResultadoTransformacaoSchema`
- Test: `server/tests/api/transformacaoTerceiro.api.test.js` (**novo**, bloco `══ Task 3 ══`)

**Interfaces:**
- Produces:
  - `schema.TIPOS_RESULTADO === ['PECA', 'SOBRA']`
  - colunas em `retornos_remessa_item_almoxarifado`: `tipo_resultado TEXT`,
    `custo_unitario_aplicado REAL`, `movimentacao_consumo_id INTEGER`
  - `schemas.ResultadoTransformacaoSchema` — `z.object` com
    `{ material_id: number>0, quantidade: number>0, tipo_resultado: enum(TIPOS_RESULTADO),
    lote_id?: number>0, observacoes?: string }`
- Consumes: `safeAlter` (`schema.js:170-178`).

**Por que estes nomes** — ver a seção "Nomes decididos aqui", acima. Em resumo:
`tipo_resultado` (e não `classificacao`, ambíguo num módulo que já tem `categoria`, `classe_abc` e
`tipo_material`), `custo_unitario_aplicado` (é **por unidade** e é **o aplicado naquele momento**,
não o custo atual do material), `movimentacao_consumo_id` (espelha o `movimentacao_id` que já existe
para o **crédito**, e é o **agrupador do evento** — todas as N linhas de uma transformação
compartilham o mesmo).

**Por que NÃO há coluna `quantidade_consumida` nem `custo_servico`:** uma transformação é **um
evento com N linhas** e a tabela não tem cabeçalho de evento. Gravá-los em cada linha faria qualquer
`SUM()` ingênuo contar o mesmo consumo N vezes. O cabeçalho já existe: é a movimentação
`CONSUMO_TERCEIRO`, cuja `quantidade` é o consumo e cujo `id` é `movimentacao_consumo_id`.

**Por que não há migração de dados:** `safeAlter` acrescenta coluna com `NULL` para as linhas
existentes, e `NULL` em `tipo_resultado` **significa** "retorno simples da 8b, mesmo material" — é o
valor certo, não um buraco. Nada a fazer no ledger `schema_migrations_almoxarifado`
(`schema.js:319-352`); esta etapa **não** cria migração.

---

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/transformacaoTerceiro.api.test.js` (este arquivo cresce nas Tasks 5, 7 e 8;
os blocos seguintes entram **antes** do `await close()`):

```js
/**
 * Etapa 8c — transformacao no terceiro: chapa que sai e volta como pecas cortadas + sobra.
 *
 * Testa o SERVICO e o SCHEMA, nao as rotas (as rotas ganham bloco proprio na Task 8, neste mesmo
 * arquivo, porque a superficie e pequena e separar em dois arquivos duplicaria as fixtures).
 *
 * A diferenca de natureza que organiza tudo: na 8b a remessa e RETENCAO pura (o material continua
 * sendo nosso, so nao esta no predio) e o retorno e a operacao inversa, igualmente inocua. Na
 * transformacao a chapa DEIXA DE EXISTIR: ela sai do patrimonio E da retencao (CONSUMO_TERCEIRO,
 * que ja existe desde a 8b e faz as duas coisas no mesmo UPDATE) e as pecas ENTRAM como material
 * novo (RETORNO_TRANSFORMACAO, Task 4).
 *
 * Executar: cd server && node tests/api/transformacaoTerceiro.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { TIPOS_RESULTADO } = require('../../services/almoxarifado/schema');
const { ResultadoTransformacaoSchema } = require('../../services/almoxarifado/schemas');
const svc = require('../../services/almoxarifado/thirdPartyService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
// Perfil EXPLICITO: getPerfilFromUser faz fallback para PRODUCAO, entao "usuario sem perfil" nao e
// "sem acesso" — e chao de fabrica.
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
/**
 * Material de teste. `custo` alimenta AS DUAS colunas de custo de proposito: o sistema tem duas
 * familias de leitura de valor (custo_unitario sozinho em routes/almoxarifado.js:249 e :1048;
 * COALESCE(custo_medio, custo_unitario) em reportService.js:10 e stockService.js:1870), e uma
 * fixture que enchesse so uma delas faria o teste do invariante depender de qual das duas o
 * assertor escolheu. Ver a contradicao C1 no plano.
 */
async function novoMaterial(db, { atual = 0, custo = 0, dono = null, unidade = 'UN', peso = null, cod = null } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
       (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, peso_unitario, ativo, proprietario_cliente_id)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    [cod || `TRF-${seq}`, `Material transformacao ${seq}`, unidade, atual, custo, custo, peso, dono]);
  return r.lastID;
}
const saldos = async (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros,
          COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario
   FROM materiais_almoxarifado WHERE id = ?`, [id]);
/** Valor do material por UMA formula so — ver C1 no plano. */
const valorDe = async (db, id) => {
  const m = await dbGet(db,
    'SELECT quantidade_atual, COALESCE(custo_medio, custo_unitario, 0) AS custo FROM materiais_almoxarifado WHERE id = ?', [id]);
  return Number(m.quantidade_atual) * Number(m.custo);
};

/** Remessa ENVIADA de 1 item. Devolve { remessa, itemId, materialId }. */
async function remessaEnviada(db, { qtd = 100, custo = 0, dono = null, unidade = 'KG', peso = null } = {}) {
  const mat = await novoMaterial(db, { atual: qtd, custo, dono, unidade, peso });
  const rem = await svc.criarRemessa(db, ADMIN, {
    fornecedor_nome: 'Corte a Laser Oeste LTDA',
    tipo_servico: 'Corte',
    prazo_previsto: '2026-09-30',
    itens: [{ material_id: mat, quantidade: qtd }],
  });
  await svc.enviarRemessa(db, ADMIN, rem.id);
  const item = await dbGet(db,
    'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
  return { remessa: rem, itemId: item.id, materialId: mat };
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  // ══ Task 3 — as tres colunas e a peca Zod ═══════════════════════════════════════════════════

  await test('[schema] retornos_remessa_item_almoxarifado tem as tres colunas novas', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(retornos_remessa_item_almoxarifado)');
    const nomes = cols.map((c) => c.name);
    for (const c of ['tipo_resultado', 'custo_unitario_aplicado', 'movimentacao_consumo_id']) {
      assert.ok(nomes.includes(c), `falta a coluna ${c} — tem: ${nomes.join(', ')}`);
    }
    // O tipo declarado importa: TEXT numa coluna que vai guardar 'PECA'/'SOBRA', REAL no custo,
    // INTEGER no vinculo. SQLite tolera qualquer coisa, mas o PRAGMA e o unico lugar onde a
    // intencao fica escrita para quem ler o banco depois.
    const tipoDe = (n) => cols.find((c) => c.name === n).type;
    assert.strictEqual(tipoDe('tipo_resultado'), 'TEXT');
    assert.strictEqual(tipoDe('custo_unitario_aplicado'), 'REAL');
    assert.strictEqual(tipoDe('movimentacao_consumo_id'), 'INTEGER');
  });

  await test('[schema] as colunas novas nascem NULL, e NULL significa "retorno simples da 8b"', async () => {
    // NAO e buraco: e o valor certo para as linhas que a 8b ja gravou (e continua gravando) — o
    // retorno do MESMO material nao e transformacao. E o que permite separar os dois mundos com
    // `WHERE tipo_resultado IS NOT NULL` sem tabela nova.
    const { remessa, itemId, materialId } = await remessaEnviada(db, { qtd: 50 });
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-8B-1', itens: [{ item_remessa_id: itemId, quantidade: 20 }] });
    const linha = await dbGet(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.material_id, materialId);
    assert.strictEqual(linha.tipo_resultado, null, 'o retorno simples da 8b nasceu classificado');
    assert.strictEqual(linha.custo_unitario_aplicado, null);
    assert.strictEqual(linha.movimentacao_consumo_id, null);
  });

  await test('[schema] initSchema roda de novo sem erro — safeAlter e idempotente', async () => {
    // O initSchema roda DUAS vezes no boot (routes/almoxarifado.js:56 fire-and-forget +
    // extended.runInitSchemaWithRetry), e as duas podem interlear num DB fresco. Um ALTER sem
    // safeAlter derruba o boot na segunda.
    const { initSchema } = require('../../services/almoxarifado/schema');
    await initSchema(db);
    const cols = await dbAll(db, 'PRAGMA table_info(retornos_remessa_item_almoxarifado)');
    const n = cols.filter((c) => c.name === 'tipo_resultado').length;
    assert.strictEqual(n, 1, 'a segunda passada duplicou a coluna (ou derrubou)');
  });

  await test('[schema] TIPOS_RESULTADO e a fonte unica: PECA e SOBRA, nessa ordem', async () => {
    assert.deepStrictEqual(TIPOS_RESULTADO, ['PECA', 'SOBRA']);
  });

  await test('[schema] ResultadoTransformacaoSchema recusa tipo_resultado fora da lista', async () => {
    const r = ResultadoTransformacaoSchema.safeParse({
      material_id: 1, quantidade: 5, tipo_resultado: 'CAVACO' });
    assert.strictEqual(r.success, false);
    assert.match(JSON.stringify(r.error.issues), /tipo_resultado/);
  });

  await test('[schema] ResultadoTransformacaoSchema exige tipo_resultado — nao ha default silencioso', async () => {
    // Um default 'PECA' pareceria conveniente e seria a pior escolha possivel: a sobra viraria peca
    // por omissao e entraria carregando rateio, que e exatamente o que a decisao 4 existe para
    // impedir (a sobra e UMA linha e uma FATIA GRANDE — e ela que envenena a media).
    const r = ResultadoTransformacaoSchema.safeParse({ material_id: 1, quantidade: 5 });
    assert.strictEqual(r.success, false);
  });

  await test('[schema] ResultadoTransformacaoSchema PRESERVA os cinco campos declarados', async () => {
    // z.object DESCARTA chave nao declarada EM SILENCIO (schemas.js:311-320). Este teste e o que
    // impede lote_id/observacoes de sumirem no caminho — a mesma armadilha que custou caro com
    // reserva_id (Etapa 4), lote_id (Etapa 6) e justificativa do cancelamento (Etapa 8).
    const entrada = { material_id: 7, quantidade: 40, tipo_resultado: 'PECA', lote_id: 3, observacoes: 'obs' };
    const r = ResultadoTransformacaoSchema.safeParse(entrada);
    assert.strictEqual(r.success, true, JSON.stringify(r.error?.issues));
    assert.deepStrictEqual(r.data, entrada, 'o schema comeu algum campo declarado');
  });

  await test('[CONTROLE POSITIVO] ResultadoTransformacaoSchema aceita SOBRA com o minimo', async () => {
    // Sem isto, um schema que recusasse TUDO passaria nos dois testes de recusa acima.
    const r = ResultadoTransformacaoSchema.safeParse({ material_id: 9, quantidade: 1, tipo_resultado: 'SOBRA' });
    assert.strictEqual(r.success, true, JSON.stringify(r.error?.issues));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`

Expected: FAIL logo no `require` — `ResultadoTransformacaoSchema` é `undefined` e
`TIPOS_RESULTADO` é `undefined`, então o processo morre com
`TypeError: Cannot read properties of undefined (reading 'safeParse')` no primeiro teste que usa o
schema; os dois primeiros testes de coluna falham com `falta a coluna tipo_resultado`.

**Confira que a saída traz `N passed, M failed` com `M >= 5`.** Se o processo morrer antes de
imprimir o rodapé, o `require` do topo quebrou — corrija o teste (não o código) para importar o que
existe, e volte aqui depois do Step 3.

- [ ] **Step 3: Acrescentar as colunas em `schema.js`**

Em `server/services/almoxarifado/schema.js`, **logo depois** do `CREATE TABLE IF NOT EXISTS
retornos_remessa_item_almoxarifado` (que termina em `:1193`) e **antes** dos quatro
`CREATE INDEX` (`:1195-1198`):

```js
  // ── Etapa 8c: a linha de resultado passa a saber que TIPO de resultado ela e ────────────────
  //
  // Ate a 8b todo resultado tinha material_id igual ao do item enviado — o retorno era do MESMO
  // material (tratamento termico, pintura, galvanizacao). Na transformacao (corte, dobra,
  // usinagem) sai UMA chapa e voltam 40 pecas e uma sobra: material diferente, unidade diferente,
  // e custo que precisa ser rateado.
  //
  // safeAlter e nao recriacao de tabela: as linhas ja gravadas nascem com NULL nas tres colunas, e
  // NULL AQUI SIGNIFICA ALGUMA COISA — "retorno simples, nao e transformacao". Nao e buraco de
  // migracao: e o valor correto, e e o que permite separar os dois mundos com
  // `WHERE tipo_resultado IS NOT NULL` sem tabela nova e sem backfill.
  //
  // tipo_resultado: 'PECA' | 'SOBRA' (TIPOS_RESULTADO) | NULL. E a CLASSIFICACAO DA LINHA que
  //   decide o rateio (decisao 4 e 8 do design): PECA recebe rateio, SOBRA entra a ZERO. A sobra
  //   nao e material especial — e material normal, com codigo e cadastro, e a categoria
  //   'Sucata e sobras reaproveitáveis' ja existe no CATEGORIAS_SEED deste arquivo.
  //   Por que a sobra entra a zero: chapa de R$ 1.000 -> 40 pecas + 1 sobra que e um terco da
  //   chapa; rateando por quantidade em 41 linhas a sobra carrega 2,4% do valor e as pecas ficam
  //   ~40% caras. A sobra e UMA linha e uma FATIA GRANDE — e ela que envenena a media.
  //
  // custo_unitario_aplicado: o custo POR UNIDADE que foi creditado NESTA linha, no momento em que
  //   ela foi criada. NAO e o custo atual do material (esse muda a cada entrada seguinte) — e o
  //   registro do que o rateio decidiu, e e o unico lugar onde ele fica auditavel, porque
  //   movimentacoes_almoxarifado NAO TEM coluna de custo (decisao 10 do design: acrescenta-la
  //   exigiria decidir baixa valorizada/CMV para o modulo inteiro).
  //
  // movimentacao_consumo_id: aponta para a movimentacao CONSUMO_TERCEIRO que baixou a chapa.
  //   Espelha `movimentacao_id`, que ja existe e aponta para o CREDITO desta linha. Um aponta para
  //   a entrada da peca, o outro para a baixa da chapa — os dois lados da mesma transformacao.
  //   E ELE E O AGRUPADOR DO EVENTO: as N linhas de uma transformacao compartilham o mesmo valor.
  //   E por isso que NAO existe coluna `quantidade_consumida` nem `custo_servico` aqui: uma
  //   transformacao e um EVENTO COM N LINHAS e esta tabela nao tem cabecalho de evento; grava-los
  //   em cada linha faria qualquer SUM() ingenuo contar o mesmo consumo N vezes. O cabecalho ja
  //   existe — e a propria movimentacao CONSUMO_TERCEIRO, cuja `quantidade` E o consumo.
  await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN tipo_resultado TEXT');
  await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN custo_unitario_aplicado REAL');
  await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN movimentacao_consumo_id INTEGER');
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_retornos_remessa_consumo
    ON retornos_remessa_item_almoxarifado(movimentacao_consumo_id)`);
```

Acrescentar a constante `TIPOS_RESULTADO` **logo depois** de `TIPOS_DEDICADOS` (`schema.js:125`):

```js
/**
 * Classificacao da linha de resultado de uma TRANSFORMACAO (Etapa 8c, decisao 8 do design).
 *
 * PECA  — recebe o rateio do custo da chapa (decisao 4).
 * SOBRA — entra a custo ZERO, o tratamento conservador que ERP da a retalho: o patrimonio nunca
 *         infla, e se a sobra for vendida como sucata um dia, aparece como GANHO e nunca como
 *         perda inventada.
 *
 * O que "virou cavaco" NAO e resultado e nao tem linha: e a diferenca entre o consumido e o que
 * voltou, e ela ja esta baixada pelo CONSUMO_TERCEIRO da chapa. Nao precisa de destino novo em
 * DESTINOS_ENCERRAMENTO.
 *
 * Lista literal repetida em dois lugares diverge na primeira mudanca — e daqui que o Zod
 * (ResultadoTransformacaoSchema) e o servico (thirdPartyService.registrarTransformacao) leem.
 */
const TIPOS_RESULTADO = ['PECA', 'SOBRA'];
```

E acrescentar `TIPOS_RESULTADO` ao `module.exports` de `schema.js`, junto de `TIPOS_DEDICADOS`.

> **Verificação obrigatória do export:** `grep -n "TIPOS_DEDICADOS" server/services/almoxarifado/schema.js`
> deve mostrar a declaração **e** a linha do `module.exports`. Acrescente `TIPOS_RESULTADO` **na
> mesma linha** do export. Um `const` exportado só na declaração é `undefined` no `require` — e o
> teste do Step 1 falharia com uma mensagem que não diz isso.

- [ ] **Step 4: Acrescentar `ResultadoTransformacaoSchema` em `schemas.js`**

Em `server/services/almoxarifado/schemas.js`, logo depois de `RetornoRemessaSchema` (`:365`):

```js
// ── Transformacao no terceiro (Etapa 8c) ───────────────────────────────────────
/**
 * UMA linha de resultado de uma transformacao: a peca cortada, ou a sobra.
 *
 * `tipo_resultado` e OBRIGATORIO e NAO tem default. Um default 'PECA' pareceria conveniente e seria
 * a pior escolha possivel: a sobra viraria peca por omissao e entraria carregando rateio — que e
 * exatamente o que a decisao 4 do design existe para impedir (a sobra e UMA linha e uma FATIA
 * GRANDE, e e ela que envenena a media).
 *
 * O enum le de schema.TIPOS_RESULTADO, e nao de uma lista literal aqui: duas listas divergem na
 * primeira mudanca, e o servico recusaria um valor que o schema aceitou (ou o contrario).
 *
 * TODO campo que o servico usa precisa estar declarado: `validate()` troca req.body pelo parsed e
 * z.object DESCARTA chave nao declarada EM SILENCIO — `lote_id` e `observacoes` sao os candidatos
 * obvios a serem esquecidos aqui, e o teste `[schema] ... PRESERVA os cinco campos declarados`
 * existe por causa disso.
 */
const ResultadoTransformacaoSchema = z.object({
  material_id: z.number().int().positive(),
  quantidade: z.number().gt(0, 'quantidade do resultado deve ser maior que zero'),
  tipo_resultado: z.enum(TIPOS_RESULTADO),
  lote_id: z.number().int().positive().optional(),
  observacoes: z.string().optional(),
});
```

No topo de `schemas.js`, onde já existe
`const { TIPOS_MOVIMENTO, TIPOS_RETENCAO } = require('./schema');` (confirmado em `:7` do arquivo —
**releia a linha antes de editar**, e se o `require` também trouxer `TIPOS_DEDICADOS`, acrescente ali
mesmo), passar a importar `TIPOS_RESULTADO` também. E acrescentar `ResultadoTransformacaoSchema` ao
`module.exports` (`:386-392`).

- [ ] **Step 5: Rodar e ver passar**

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: `8 passed, 0 failed`

Run: `cd server && npm run test:safealter`
Expected: `3 passed, 0 failed`

Run: `cd server && npm run test:api` e `cd server && npm run test:validation`
Expected: todos OK.

- [ ] **Step 6: SABOTAGEM**

**S1 — uma das três colunas some** (prova o teste de PRAGMA):

```bash
cd server
grep -cF "ADD COLUMN custo_unitario_aplicado REAL" services/almoxarifado/schema.js   # TEM de dar 1
md5sum services/almoxarifado/schema.js
sed -i "s|await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN custo_unitario_aplicado REAL');|// SABOTADO|" services/almoxarifado/schema.js
md5sum services/almoxarifado/schema.js   # TEM de diferir
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/schema.js
md5sum services/almoxarifado/schema.js
git diff --stat
```
Esperado: **`✗ [schema] retornos_remessa_item_almoxarifado tem as tres colunas novas: falta a coluna custo_unitario_aplicado`**.

**S2 — o enum aceita qualquer string** (prova os dois testes de recusa do Zod):

```bash
cd server
grep -cF "tipo_resultado: z.enum(TIPOS_RESULTADO)," services/almoxarifado/schemas.js   # TEM de dar 1
md5sum services/almoxarifado/schemas.js
sed -i "s|tipo_resultado: z.enum(TIPOS_RESULTADO),|tipo_resultado: z.string().optional(),|" services/almoxarifado/schemas.js
md5sum services/almoxarifado/schemas.js
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/schemas.js
md5sum services/almoxarifado/schemas.js
git diff --stat
```
Esperado: **duas** falhas —
`✗ [schema] ResultadoTransformacaoSchema recusa tipo_resultado fora da lista` e
`✗ [schema] ResultadoTransformacaoSchema exige tipo_resultado — nao ha default silencioso`.

**S3 — o schema come um campo declarado** (prova a armadilha do `z.object`):

```bash
cd server
grep -cF "lote_id: z.number().int().positive().optional()," services/almoxarifado/schemas.js   # PODE dar >1
```
> ⚠ **`lote_id: z.number().int().positive().optional(),` aparece mais de uma vez em `schemas.js`
> (`RetornoRemessaSchema` e `ItemRemessaTerceiroSchema` também o têm).** Regra 2 do harness: com
> contagem `> 1`, **NÃO use `sed`**. Faça esta sabotagem com a ferramenta **Edit**, apagando a linha
> `lote_id` **de dentro de `ResultadoTransformacaoSchema`** (identificável pelo contexto
> `tipo_resultado: z.enum(TIPOS_RESULTADO),` logo acima). Depois:
> ```bash
> cd server && node tests/api/transformacaoTerceiro.api.test.js
> git checkout -- services/almoxarifado/schemas.js && git diff --stat
> ```
Esperado: **`✗ [schema] ResultadoTransformacaoSchema PRESERVA os cinco campos declarados: o schema comeu algum campo declarado`**.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/schema.js \
        server/services/almoxarifado/schemas.js \
        server/tests/api/transformacaoTerceiro.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 3: a linha de resultado passa a saber que tipo de resultado ela e

Ate a 8b todo resultado tinha material_id igual ao do item enviado — o retorno era do MESMO material
(tratamento termico, pintura, galvanizacao). Na transformacao sai UMA chapa e voltam 40 pecas e uma
sobra: material diferente, unidade diferente, e custo que precisa ser rateado. A tabela ja era LISTA
DE RESULTADOS (decisao da 8b, tomada para nao obrigar a 8c a reescreve-la); faltavam tres coisas na
linha.

tipo_resultado (PECA|SOBRA|NULL) e a classificacao que DECIDE o rateio: PECA recebe, SOBRA entra a
zero. NULL e o valor das linhas ja gravadas e SIGNIFICA "retorno simples, nao e transformacao" — nao
e buraco de migracao, e o que permite separar os dois mundos com WHERE tipo_resultado IS NOT NULL sem
tabela nova e sem backfill.

custo_unitario_aplicado guarda o custo POR UNIDADE creditado NAQUELE momento, e nao o custo atual do
material (esse muda a cada entrada seguinte). E o unico lugar onde a decisao do rateio fica
auditavel, porque movimentacoes_almoxarifado nao tem coluna de custo.

movimentacao_consumo_id aponta para o CONSUMO_TERCEIRO que baixou a chapa e espelha o
movimentacao_id que ja apontava para o credito. E tambem o AGRUPADOR DO EVENTO: as N linhas de uma
transformacao compartilham o valor.

DESCARTADO criar colunas quantidade_consumida e custo_servico na linha de resultado. Uma
transformacao e um EVENTO COM N LINHAS e esta tabela nao tem cabecalho de evento: grava-los em cada
linha faria qualquer SUM() ingenuo contar o mesmo consumo N vezes — a armadilha que esta base ja
pagou com grep -c + wc -l. O cabecalho ja existe: e a propria movimentacao CONSUMO_TERCEIRO, cuja
quantidade E o consumo. custo_servico fica na justificativa do movimento e na auditoria.
DESCARTADO o nome `classificacao`: ambiguo num modulo que ja tem categoria, classe_abc e
tipo_material.
DESCARTADO tabela de cabecalho de transformacao: um documento a mais para um evento que ja tem um
identificador natural e que ja pertence a uma remessa.

ResultadoTransformacaoSchema exige tipo_resultado SEM DEFAULT. Um default 'PECA' pareceria
conveniente e seria a pior escolha possivel: a sobra viraria peca por omissao e entraria carregando
rateio, que e exatamente o que a decisao 4 existe para impedir.

Testes: 8, incluindo o de idempotencia do safeAlter (o initSchema roda DUAS vezes no boot) e o de
preservacao de campo do Zod (z.object descarta chave nao declarada em silencio).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: `RETORNO_TRANSFORMACAO` dentro do motor

**Por que um tipo novo e não `ENTRADA_MANUAL`** (decisão 2 do design), em ordem de gravidade:
1. **Dono.** `ENTRADA_MANUAL` não tem lógica de proprietário. A peça cortada de uma chapa do cliente
   X é do cliente X, e a Etapa 8 inteira existe para essa garantia não depender de alguém lembrar.
2. **Livro.** No extrato, `ENTRADA_MANUAL` faz a peça parecer ter aparecido do nada — o motivo real
   ("veio da chapa tal, remessa tal") some.
3. **Estorno.** Cancelar uma entrada manual não sabe que existe uma baixa de chapa do outro lado.

**Files:**
- Modify: `server/services/almoxarifado/schema.js` — `TIPOS_MOVIMENTO` (`:46-82`) e
  `TIPOS_DEDICADOS` (`:125`)
- Modify: `server/services/almoxarifado/stockService.js` — **as DUAS** listas `tiposEntrada`
  (`:512` e `:1388`)
- Modify: `server/services/almoxarifado/movementRules.js` — `REGRAS_VINCULO` (`:58-61`)
- Modify: `server/services/almoxarifado/ownerRules.js` — `TIPOS_ISENTOS_DONO` (`:50-51`)
- Test: `server/tests/api/transformacaoMotor.api.test.js` (**novo**)

**Interfaces:**
- Produces: o tipo `'RETORNO_TRANSFORMACAO'`, aceito por
  `stockService.registrarMovimentacao(db, user, { material_id, tipo: 'RETORNO_TRANSFORMACAO',
  quantidade, custo_unitario?, lote_id?, referencia?, documento_vinculado?, justificativa })`.
  **`justificativa` é obrigatória** (`movementRules`). Devolve `{ id, saldo_anterior, saldo_posterior }`.
- Consumes: nada de novo.

**A armadilha desta task, em uma frase:** `tiposEntrada` é declarado **duas** vezes em
`stockService.js` — `:512` em `registrarMovimentacao` e `:1388` em `cancelarMovimentacao` — e o
if-chain do cancelamento **não tem `else`**. Um tipo ausente da segunda lista é marcado
`cancelado = 1`, ganha linha de `ESTORNO` com `saldo_anterior == saldo_posterior` e **nenhum saldo
volta**. É literalmente o quarto defeito que só a execução da 8b achou (ver contradição C5).

---

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/transformacaoMotor.api.test.js`:

```js
/**
 * Etapa 8c, Task 4 — RETORNO_TRANSFORMACAO dentro do motor.
 *
 * O tipo e ENTRADA: credita quantidade_atual, aceita custo_unitario e alimenta o custo medio pelo
 * caminho que ja existe (stockService.js:1031-1041). NAO e retencao: nao toca em
 * quantidade_em_terceiros — quem baixa a retencao da chapa e o CONSUMO_TERCEIRO do outro lado.
 *
 * Metade dos testes daqui existe por causa de UM defeito da 8b que so a execucao achou: tiposEntrada
 * e declarado DUAS vezes neste arquivo (:512 em registrarMovimentacao e :1388 em
 * cancelarMovimentacao) e o if-chain do cancelamento NAO tem else. Tipo ausente da segunda lista e
 * marcado cancelado=1, ganha linha de ESTORNO com saldo_anterior == saldo_posterior, e NENHUM saldo
 * volta. Leitura e suite verde nao pegam isso.
 *
 * Executar: cd server && node tests/api/transformacaoMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { TIPOS_MOVIMENTO, TIPOS_DEDICADOS, TIPOS_RETENCAO } = require('../../services/almoxarifado/schema');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');
const { TIPOS_ISENTOS_DONO } = require('../../services/almoxarifado/ownerRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const T = 'RETORNO_TRANSFORMACAO';

let seq = 0;
async function novoMaterial(db, { atual = 0, custo = 0, terceiros = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
       (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, quantidade_em_terceiros, ativo)
     VALUES (?,?,'UN',?,?,?,?,1)`, [`MOT-${seq}`, `Material motor ${seq}`, atual, custo, custo, terceiros]);
  return r.lastID;
}
const est = async (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros,
          COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario
   FROM materiais_almoxarifado WHERE id = ?`, [id]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('[declaracao] RETORNO_TRANSFORMACAO esta em TIPOS_MOVIMENTO e em TIPOS_DEDICADOS', async () => {
    assert.ok(TIPOS_MOVIMENTO.includes(T), 'o tipo nao foi declarado em TIPOS_MOVIMENTO');
    assert.ok(TIPOS_DEDICADOS.includes(T), 'o tipo nao entrou em TIPOS_DEDICADOS');
  });

  await test('[declaracao] RETORNO_TRANSFORMACAO NAO esta em TIPOS_RETENCAO', async () => {
    // Se entrasse, o motor pularia o bloco fisico (a skip-list deriva de TIPOS_RETENCAO,
    // stockService.js:926) e a peca NUNCA seria creditada — o pior modo de falhar desta etapa,
    // porque a movimentacao apareceria no livro do mesmo jeito.
    assert.ok(!TIPOS_RETENCAO.includes(T));
  });

  await test('[declaracao] entrar em TIPOS_DEDICADOS ja tira o tipo da rota generica', async () => {
    // TIPOS_MOVIMENTO_ROTA e DERIVADO (schemas.js:54-56): TIPOS_MOVIMENTO menos ESTORNO, menos
    // TIPOS_RETENCAO, menos TIPOS_DEDICADOS. Nao ha lista a editar em schemas.js — e este teste e
    // o que garante que a derivacao continua sendo derivacao.
    assert.ok(!TIPOS_MOVIMENTO_ROTA.includes(T));
  });

  await test('[declaracao] RETORNO_TRANSFORMACAO esta em TIPOS_ISENTOS_DONO', async () => {
    // Declarativo: a guarda do dono (assertSaidaPermitida) so roda para SAIDA, e este tipo e
    // entrada — a ausencia nao mudaria comportamento HOJE. Esta na lista para a ausencia nao poder
    // ser lida como esquecimento por quem for mexer nela depois. Mesmo criterio de AJUSTE_POSITIVO,
    // que tambem e entrada e tambem esta la.
    assert.ok(TIPOS_ISENTOS_DONO.includes(T));
  });

  await test('RETORNO_TRANSFORMACAO credita quantidade_atual e alimenta o custo medio', async () => {
    const mat = await novoMaterial(db, { atual: 0, custo: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 40, custo_unitario: 25,
      justificativa: 'Transformacao da remessa REM-1 (chapa CHP-001)',
    });
    assert.ok(mov.id, 'a movimentacao nao foi gravada no livro');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 40);
    assert.strictEqual(e.custo_medio, 25);
    assert.strictEqual(e.custo_unitario, 25);
  });

  await test('RETORNO_TRANSFORMACAO NAO mexe em quantidade_em_terceiros', async () => {
    // Quem baixa a retencao da chapa e o CONSUMO_TERCEIRO do OUTRO material. Se a entrada da peca
    // tambem mexesse na retencao, o numero baixaria duas vezes — e a peca nem estava no terceiro.
    const mat = await novoMaterial(db, { atual: 10, terceiros: 7 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 5, justificativa: 'Transformacao REM-2' });
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 15);
    assert.strictEqual(e.em_terceiros, 7, 'a entrada da peca mexeu na retencao de terceiros');
  });

  await test('RETORNO_TRANSFORMACAO sem custo credita quantidade e NAO zera o custo existente', async () => {
    // O caminho da SOBRA (custo zero, decisao 4). Sem esta garantia, creditar a sobra apagaria o
    // custo cadastrado do material da sobra.
    const mat = await novoMaterial(db, { atual: 20, custo: 8 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 5, custo_unitario: 0, justificativa: 'Sobra da REM-3' });
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 25);
    assert.strictEqual(e.custo_medio, 8, 'a sobra a custo zero apagou o custo do material');
    assert.strictEqual(e.custo_unitario, 8);
  });

  await test('RETORNO_TRANSFORMACAO exige justificativa', async () => {
    // movementRules: o tipo muda a resposta a pergunta "de onde veio esse material?", e a resposta
    // tem de estar escrita. Vinculo com OS/projeto e 'nenhum' porque o vinculo mora no DOCUMENTO
    // da remessa — exigi-lo de novo aqui duplicaria a regra em dois lugares que divergiriam.
    const mat = await novoMaterial(db);
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: T, quantidade: 1 }),
      /justificativa/i);
    assert.strictEqual((await est(db, mat)).quantidade_atual, 0, 'creditou mesmo recusando');
  });

  await test('a rota generica de movimentacao RECUSA RETORNO_TRANSFORMACAO', async () => {
    // Gate `movimentar` e o mais amplo do modulo. Aceitar o tipo la permitiria criar peca cortada
    // sem remessa nenhuma por tras e sem baixar chapa alguma — estoque do nada, exatamente o que a
    // mensagem de recusa da 8b dizia querer evitar.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: T, quantidade: 5, justificativa: 'pela porta errada' });
    assert.strictEqual(r.status, 400, `a rota generica aceitou o tipo (status ${r.status})`);
    assert.strictEqual((await est(db, mat)).quantidade_atual, 0);
  });

  await test('[CONTROLE POSITIVO] a rota generica continua aceitando ENTRADA_MANUAL', async () => {
    // Sem isto, um TIPOS_MOVIMENTO_ROTA vazio (ou um refine quebrado) passaria no teste acima e
    // derrubaria a tela de movimentacao inteira.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 5, justificativa: 'entrada normal' });
    assert.strictEqual(r.status, 201, `ENTRADA_MANUAL levou ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('estorno de RETORNO_TRANSFORMACAO DEVOLVE a quantidade (as duas listas tiposEntrada)', async () => {
    // ESTE E O TESTE DA ARMADILHA. tiposEntrada e declarado DUAS vezes em stockService.js: :512
    // (registrarMovimentacao) e :1388 (cancelarMovimentacao). O if-chain do cancelamento nao tem
    // else — tipo ausente da segunda lista e marcado cancelado=1, ganha linha de ESTORNO com
    // saldo_anterior == saldo_posterior e NENHUM saldo volta. Foi o quarto defeito que so a
    // execucao da 8b achou, e ele nao aparece em leitura nem em suite verde.
    const mat = await novoMaterial(db, { atual: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 30, custo_unitario: 10, justificativa: 'REM-9' });
    assert.strictEqual((await est(db, mat)).quantidade_atual, 30);

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'teste de estorno');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 0, 'o estorno gravou a linha e NAO devolveu o saldo');

    const estorno = await dbGet(db,
      "SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'ESTORNO' AND material_id = ?", [mat]);
    assert.ok(estorno, 'nao gravou linha de ESTORNO');
    assert.notStrictEqual(estorno.saldo_anterior, estorno.saldo_posterior,
      'a linha de ESTORNO diz que nada mudou — o tipo caiu no if-chain sem ramo');
  });

  await test('o estorno de RETORNO_TRANSFORMACAO NAO reverte o custo (decisao anterior, declarada)', async () => {
    // Decisao explicita da Etapa 1 (stockService.js:1548-1550): reversao exata de custo medio e
    // mal-definida depois de movimentos intermediarios. Este teste NAO aprova o comportamento — ele
    // o FIXA, para a decisao 11.2 do design da 8c ser verdade verificavel e para uma mudanca futura
    // aparecer como quebra de teste em vez de surpresa em relatorio.
    const mat = await novoMaterial(db, { atual: 0, custo: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 10, custo_unitario: 50, justificativa: 'REM-10' });
    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'teste de custo no estorno');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 0);
    assert.strictEqual(e.custo_medio, 50,
      'o estorno passou a reverter custo — se foi de proposito, corrija a decisao 11.2 do design e este teste');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/transformacaoMotor.api.test.js`

Expected: FAIL. Os quatro `[declaracao]` falham por `includes` falso; os que chamam
`registrarMovimentacao` falham com a mensagem do motor sobre tipo desconhecido **ou** creditam nada
(`0 !== 40`) — o tipo não está em `tiposEntrada`, então o if-chain do bloco físico não tem ramo para
ele e `saldoPosterior` fica `undefined`. **Anote a mensagem exata**: ela é o que o Step 4 tem de
fazer desaparecer.

- [ ] **Step 3: Declarar o tipo**

**(a)** Em `server/services/almoxarifado/schema.js`, dentro de `TIPOS_MOVIMENTO`, logo **depois** da
linha `'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',`:

```js
  // Etapa 8c (decisao 2 do design): o credito das pecas cortadas. E ENTRADA de verdade — credita
  // quantidade_atual e aceita custo_unitario, alimentando o custo medio pelo caminho que ja existe.
  //
  // Por que NAO reusar ENTRADA_MANUAL, em ordem de gravidade:
  //  1. DONO: ENTRADA_MANUAL nao tem logica de proprietario. A peca cortada de uma chapa do cliente
  //     X e do cliente X, e a Etapa 8 inteira existe para essa garantia nao depender de alguem
  //     lembrar. A guarda que impede converter material de cliente em patrimonio da GMP
  //     (ownerRules.assertMesmoDonoNaTransformacao) so tem onde se pendurar com tipo proprio.
  //  2. LIVRO: no extrato, ENTRADA_MANUAL faz a peca parecer ter aparecido do nada — o motivo real
  //     ("veio da chapa tal, remessa tal") some.
  //  3. ESTORNO: cancelar uma entrada manual nao sabe que existe uma baixa de chapa do outro lado.
  //
  // NAO entra em TIPOS_RETENCAO: se entrasse, o motor pularia o bloco fisico (a skip-list deriva de
  // TIPOS_RETENCAO) e a peca nunca seria creditada — com a movimentacao aparecendo no livro do
  // mesmo jeito, que e o pior modo de falhar desta etapa.
  'RETORNO_TRANSFORMACAO',
```

**(b)** Ainda em `schema.js`, em `TIPOS_DEDICADOS` (`:125`), substituir a linha inteira por:

```js
//   RETORNO_TRANSFORMACAO -> POST /remessas-terceiros/:id/transformacoes (gate
//     `remessar_terceiro`). Mesmo criterio dos outros tres: aceita-lo na v2 (gate `movimentar`, o
//     mais amplo do modulo) permitiria criar peca cortada SEM remessa nenhuma por tras e SEM baixar
//     chapa alguma — estoque do nada, exatamente o que a mensagem de recusa da 8b dizia querer
//     evitar. Entrar aqui ja o tira da rota generica: TIPOS_MOVIMENTO_ROTA e DERIVADO desta lista
//     (schemas.js:54-56), nao ha segunda lista a lembrar.
const TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO', 'RETORNO_TRANSFORMACAO'];
```

**(c)** Em `server/services/almoxarifado/stockService.js`, **AS DUAS** listas `tiposEntrada`.

Na de `:512` (dentro de `registrarMovimentacao`):

```js
  // Etapa 8c: RETORNO_TRANSFORMACAO entra em tiposEntrada NOS DOIS lugares deste arquivo — aqui e
  // em cancelarMovimentacao (~:1388). Esquecer o segundo torna o motor assimetrico: a entrada
  // acontece e o estorno dela nao, marcando cancelado=1 com linha de ESTORNO de
  // saldo_anterior == saldo_posterior. Foi o quarto defeito que so a EXECUCAO da 8b achou.
  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO', 'RETORNO_TRANSFORMACAO'];
```

Na de `:1388` (dentro de `cancelarMovimentacao`):

```js
  // Etapa 8c: RETORNO_TRANSFORMACAO entra aqui TAMBEM, e a decisao foi tomada olhando ESTE ramo e
  // nao copiada do outro. O ramo de entrada abaixo subtrai quantidade_atual e NAO reverte custo
  // (decisao explicita da Etapa 1, ~:1548) — comportamento aceito e testado como tal em
  // tests/api/transformacaoMotor.api.test.js. Deixa-lo FORA seria o pior dos mundos: cairia no
  // if-chain sem ramo (nao ha `else` final), marcado cancelado=1 com linha de ESTORNO de
  // saldo_anterior == saldo_posterior, e a peca creditada nunca sairia do saldo.
  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO', 'RETORNO_TRANSFORMACAO'];
```

> **Como garantir que as duas foram editadas:**
> `grep -c "RETORNO_TRANSFORMACAO'\];" server/services/almoxarifado/stockService.js` deve dar **2**.

**(d)** Em `server/services/almoxarifado/movementRules.js`, logo depois de
`CONSUMO_TERCEIRO: { vinculo: 'nenhum', justificativa: true },`:

```js
  // Etapa 8c: mesma forma dos quatro da 8b, e pela mesma razao. Justificativa porque o tipo muda a
  // resposta a pergunta "de onde veio esse material?" e a resposta tem de estar escrita — no
  // extrato da peca, sem ela, ela teria aparecido do nada. Vinculo 'nenhum' porque o vinculo mora
  // no DOCUMENTO da remessa (fornecedor, prazo, OS/projeto e proprietario ficam em
  // remessas_terceiro_almoxarifado); exigi-lo de novo aqui duplicaria a regra em dois lugares que
  // divergiriam na primeira mudanca.
  RETORNO_TRANSFORMACAO: { vinculo: 'nenhum', justificativa: true },
```

**(e)** Em `server/services/almoxarifado/ownerRules.js`, `TIPOS_ISENTOS_DONO` (`:50-51`), acrescentar
`'RETORNO_TRANSFORMACAO'` ao final do array e, no bloco de comentário acima dele, acrescentar:

```js
 *  - RETORNO_TRANSFORMACAO (Etapa 8c): DECLARATIVO. A guarda desta lista (assertSaidaPermitida) so
 *    roda para SAIDA, e este tipo e ENTRADA — a ausencia nao mudaria comportamento nenhum hoje.
 *    Esta aqui para a ausencia nao poder ser lida como esquecimento por quem mexer nesta lista
 *    depois, exatamente como AJUSTE_POSITIVO, que tambem e entrada e tambem esta aqui.
 *    A GUARDA DE VERDADE DA TRANSFORMACAO E OUTRA e mora neste mesmo arquivo:
 *    assertMesmoDonoNaTransformacao (Task 5) — a peca tem de ter o MESMO dono da chapa, senao a
 *    transformacao converteria material de cliente em patrimonio da GMP.
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/api/transformacaoMotor.api.test.js`
Expected: `12 passed, 0 failed`

Run: `cd server && npm run test:api` · `npm run test:almoxarifado` · `npm run test:validation`
Expected: todos OK.

- [ ] **Step 5: SABOTAGEM**

**S1 — a armadilha das duas listas: remover o tipo SÓ da segunda `tiposEntrada`.**

Como a string das duas listas é **idêntica**, `grep -cF` dá **2** e a regra 2 do harness proíbe
`sed`. **Use a ferramenta Edit** apagando `, 'RETORNO_TRANSFORMACAO'` **apenas** da lista que está
dentro de `cancelarMovimentacao` (identificável pelo comentário `Etapa 8c: RETORNO_TRANSFORMACAO
entra aqui TAMBEM` logo acima). Confirme com:

```bash
cd server
grep -c "RETORNO_TRANSFORMACAO'\];" services/almoxarifado/stockService.js   # depois da edicao TEM de dar 1
md5sum services/almoxarifado/stockService.js
node tests/api/transformacaoMotor.api.test.js
git checkout -- services/almoxarifado/stockService.js
md5sum services/almoxarifado/stockService.js
git diff --stat
```
Esperado: **`✗ estorno de RETORNO_TRANSFORMACAO DEVOLVE a quantidade (as duas listas tiposEntrada): o estorno gravou a linha e NAO devolveu o saldo`**,
e também `✗ o estorno de RETORNO_TRANSFORMACAO NAO reverte o custo` (o saldo não voltou, então a
primeira asserção dele já cai). Se **nenhum** falhar, **é achado**: o teste de estorno está lendo o
material errado.

**S2 — o tipo sai de `TIPOS_DEDICADOS`** (prova a recusa da rota genérica **e** a derivação):

```bash
cd server
grep -cF "'CONSUMO_TERCEIRO', 'RETORNO_TRANSFORMACAO'];" services/almoxarifado/schema.js   # TEM de dar 1
md5sum services/almoxarifado/schema.js
sed -i "s|'CONSUMO_TERCEIRO', 'RETORNO_TRANSFORMACAO'\];|'CONSUMO_TERCEIRO'];|" services/almoxarifado/schema.js
md5sum services/almoxarifado/schema.js
node tests/api/transformacaoMotor.api.test.js
git checkout -- services/almoxarifado/schema.js
md5sum services/almoxarifado/schema.js
git diff --stat
```
Esperado: **duas** falhas —
`✗ [declaracao] RETORNO_TRANSFORMACAO esta em TIPOS_MOVIMENTO e em TIPOS_DEDICADOS`,
`✗ [declaracao] entrar em TIPOS_DEDICADOS ja tira o tipo da rota generica`,
e **uma terceira**, a que mais importa:
`✗ a rota generica de movimentacao RECUSA RETORNO_TRANSFORMACAO: a rota generica aceitou o tipo (status 201)`.

**S3 — a justificativa deixa de ser obrigatória:**

```bash
cd server
grep -cF "RETORNO_TRANSFORMACAO: { vinculo: 'nenhum', justificativa: true }," services/almoxarifado/movementRules.js  # TEM de dar 1
md5sum services/almoxarifado/movementRules.js
sed -i "s|RETORNO_TRANSFORMACAO: { vinculo: 'nenhum', justificativa: true },|RETORNO_TRANSFORMACAO: { vinculo: 'nenhum' },|" services/almoxarifado/movementRules.js
md5sum services/almoxarifado/movementRules.js
node tests/api/transformacaoMotor.api.test.js
git checkout -- services/almoxarifado/movementRules.js
md5sum services/almoxarifado/movementRules.js
git diff --stat
```
Esperado: **`✗ RETORNO_TRANSFORMACAO exige justificativa`**.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/schema.js \
        server/services/almoxarifado/stockService.js \
        server/services/almoxarifado/movementRules.js \
        server/services/almoxarifado/ownerRules.js \
        server/tests/api/transformacaoMotor.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 4: RETORNO_TRANSFORMACAO, o credito das pecas cortadas, dentro do motor

Metade da transformacao ja estava pronta desde a 8b: CONSUMO_TERCEIRO e exatamente a baixa
definitiva de que a chapa precisa — baixa quantidade_atual E quantidade_em_terceiros no MESMO
UPDATE, com claim duplo. Faltava o outro lado, o credito das pecas.

DESCARTADO usar ENTRADA_MANUAL, por tres razoes em ordem de gravidade. DONO: ENTRADA_MANUAL nao tem
logica de proprietario, e a peca cortada de uma chapa do cliente X e do cliente X — a Etapa 8 inteira
existe para essa garantia nao depender de alguem lembrar, e a guarda do dono so tem onde se pendurar
com tipo proprio. LIVRO: no extrato, ENTRADA_MANUAL faz a peca parecer ter aparecido do nada, e o
motivo real ("veio da chapa tal, remessa tal") some. ESTORNO: cancelar uma entrada manual nao sabe
que existe uma baixa de chapa do outro lado.

O tipo entra em TIPOS_DEDICADOS e isso ja o tira da rota generica de movimentacao, porque
TIPOS_MOVIMENTO_ROTA e DERIVADO dessa lista — nao ha segunda lista a lembrar em schemas.js. Aceita-lo
na v2 (gate `movimentar`, o mais amplo do modulo) permitiria criar peca cortada sem remessa nenhuma
por tras e sem baixar chapa alguma: estoque do nada, que e o que a mensagem de recusa da 8b dizia
querer evitar.

NAO entra em TIPOS_RETENCAO: se entrasse, o motor pularia o bloco fisico (a skip-list deriva de
TIPOS_RETENCAO) e a peca nunca seria creditada — com a movimentacao aparecendo no livro do mesmo
jeito, o pior modo de falhar desta etapa.

ENTRA NAS DUAS LISTAS tiposEntrada do stockService (registrarMovimentacao e cancelarMovimentacao). O
design falava em "tiposEntrada" no singular e sao duas: o if-chain do cancelamento nao tem else, e um
tipo ausente da segunda e marcado cancelado=1, ganha linha de ESTORNO com saldo_anterior ==
saldo_posterior e NENHUM saldo volta. Foi o quarto defeito que so a EXECUCAO da 8b achou, e a
sabotagem executada aqui foi exatamente remover o tipo so da segunda lista.

Testes: 12 em tests/api/transformacaoMotor.api.test.js, incluindo o par bilateral da rota generica
(recusa o tipo novo / continua aceitando ENTRADA_MANUAL) e o teste que FIXA que o estorno nao reverte
custo — nao para aprovar, mas para a decisao 11.2 do design ser verdade verificavel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 5: a guarda do dono na transformação (decisão 3) — com controle positivo obrigatório

**O que a guarda impede, em uma frase:** se a chapa é do cliente X e o material-peça está cadastrado
como **nosso** (`proprietario_cliente_id` NULL), a transformação **converteria material de cliente
em patrimônio da GMP** — em silêncio, com o número certo em todos os relatórios e sem nada errado
aparecendo em lugar nenhum.

**Por que ela é uma função nova e não `assertSaidaPermitida`:** a guarda existente
(`ownerRules.js:63`, `TIPOS_SAIDA_COM_DONO`) só roda para **saída** (`stockService.js:636`) e
compara o dono do material com o cliente do **vínculo** (OS/projeto). Aqui os dois lados são
**materiais**, e a comparação é material↔material. Nenhuma das duas peças serve.

**Files:**
- Modify: `server/services/almoxarifado/ownerRules.js` — `assertMesmoDonoNaTransformacao` + export
- Test: `server/tests/api/transformacaoTerceiro.api.test.js` (bloco `══ Task 5 ══`, **antes** do
  `await close()`)

**Interfaces:**
- Consumes: `dbGet` (já importado em `ownerRules.js`); `nomeDoCliente(db, clienteId)` (já existe no
  arquivo, `:73-77`, devolve `razao_social` ou `cliente #N`).
- Produces:
  `ownerRules.assertMesmoDonoNaTransformacao(db, materialOrigem, materialResultado) => Promise<void>`
  — `materialOrigem` e `materialResultado` são **linhas de `materiais_almoxarifado`** (precisam ter
  `id`, `codigo` e `proprietario_cliente_id`). Lança `Object.assign(new Error(msg), { status: 400 })`
  quando os donos diferem. **Não** lança quando os dois são `NULL` (os dois nossos) nem quando os
  dois são o mesmo cliente.

---

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `server/tests/api/transformacaoTerceiro.api.test.js`, **antes** do `await close()`:

```js
  // ══ Task 5 — a guarda do dono na transformacao ══════════════════════════════════════════════

  const ownerRules = require('../../services/almoxarifado/ownerRules');
  const mat = async (id) => dbGet(db,
    'SELECT id, codigo, proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);

  const CLI_X = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Metalurgica X LTDA')")).lastID;
  const CLI_Y = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Caldeiraria Y SA')")).lastID;

  await test('transformacao para material de OUTRO dono falha', async () => {
    const chapa = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'DONO-CHAPA-X' }));
    const peca = await mat(await novoMaterial(db, { dono: CLI_Y, cod: 'DONO-PECA-Y' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => {
        assert.strictEqual(e.status, 400);
        // A mensagem NOMEIA OS DOIS. Sem isso o operador ve "dono diferente" e nao sabe qual dos
        // dois cadastros esta errado — o mesmo criterio de resolverProprietario na 8b.
        assert.match(e.message, /Metalurgica X LTDA/, 'a mensagem nao diz de quem e a chapa');
        assert.match(e.message, /Caldeiraria Y SA/, 'a mensagem nao diz de quem e o material de destino');
        assert.match(e.message, /DONO-CHAPA-X/, 'a mensagem nao diz QUAL chapa');
        assert.match(e.message, /DONO-PECA-Y/, 'a mensagem nao diz QUAL material de destino');
        return true;
      });
  });

  await test('chapa DE CLIENTE virando peca NOSSA falha — o caso que a decisao 3 existe para impedir', async () => {
    // ESTE e o caso perigoso, e nao o de dois clientes diferentes: material de cliente virando
    // patrimonio da GMP em silencio, com numero certo em todo relatorio.
    const chapa = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'CONV-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: null, cod: 'CONV-PECA' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /Metalurgica X LTDA/);
        // O nosso estoque tem nome proprio na mensagem — "dono: null" nao diz nada a ninguem.
        assert.match(e.message, /estoque proprio|material nosso/i,
          'a mensagem nao nomeia o lado NOSSO da comparacao');
        return true;
      });
  });

  await test('chapa NOSSA virando peca DE CLIENTE tambem falha (a guarda e simetrica)', async () => {
    // O caminho inverso e igualmente errado: presentear o cliente com material nosso, e o
    // inventario dele passando a contar uma peca que a GMP pagou.
    const chapa = await mat(await novoMaterial(db, { dono: null, cod: 'INV-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'INV-PECA' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => { assert.strictEqual(e.status, 400); return true; });
  });

  await test('[CONTROLE POSITIVO] transformacao para material do MESMO dono passa', async () => {
    // OBRIGATORIO: sem ele, uma guarda que recusasse TUDO passaria nos tres testes acima e a
    // transformacao nunca funcionaria. Ja aconteceu cinco vezes nesta base.
    const chapa = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'OK-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: CLI_X, cod: 'OK-PECA' }));
    await ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca); // nao lanca
  });

  await test('[CONTROLE POSITIVO] os dois materiais NOSSOS passam', async () => {
    // A outra metade do positivo: NULL === NULL e o caso mais comum do dia a dia da GMP, e uma
    // implementacao que comparasse com `===` sobre valores vindos do SQLite (onde ausente e
    // `null`, mas um `0` mal normalizado tambem aparece) poderia recusar justamente este.
    const chapa = await mat(await novoMaterial(db, { dono: null, cod: 'NOSSO-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: null, cod: 'NOSSO-PECA' }));
    await ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca); // nao lanca
  });

  await test('a guarda nao depende de o cliente existir na tabela clientes', async () => {
    // Robustez da MENSAGEM, nao da regra: cliente apagado (ou banco de teste sem a linha) nao pode
    // fazer a guarda explodir com "cannot read razao_social of undefined" — nomeDoCliente ja cai
    // para `cliente #N`, e este teste fixa isso.
    const chapa = await mat(await novoMaterial(db, { dono: 99999, cod: 'FANTASMA-CHAPA' }));
    const peca = await mat(await novoMaterial(db, { dono: null, cod: 'FANTASMA-PECA' }));
    await assert.rejects(
      () => ownerRules.assertMesmoDonoNaTransformacao(db, chapa, peca),
      (e) => { assert.match(e.message, /cliente #99999/); return true; });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: os 6 testes novos falham com
`ownerRules.assertMesmoDonoNaTransformacao is not a function`; os **8** da Task 3 continuam
passando. Rodapé esperado: `8 passed, 6 failed`.

- [ ] **Step 3: Implementar**

Em `server/services/almoxarifado/ownerRules.js`, antes do `module.exports` (`:189`):

```js
/**
 * A peca cortada tem de ter o MESMO dono da chapa (Etapa 8c, decisao 3 do design). Sem excecao.
 *
 * O caso perigoso NAO e o de dois clientes diferentes — e chapa DE CLIENTE virando peca NOSSA: a
 * transformacao converteria material de cliente em patrimonio da GMP, em silencio, com o numero
 * certo em todo relatorio e sem nada errado aparecendo em lugar nenhum. A guarda e SIMETRICA
 * porque o caminho inverso e igualmente errado (presentear o cliente com material nosso, e o
 * inventario dele passando a contar uma peca que a GMP pagou).
 *
 * ISTO NAO E REGRA DEDUZIDA — e diferente de "uma remessa nao mistura donos" (thirdPartyService.
 * resolverProprietario), que a 8b deduziu e deixou registrado como pergunta pendente ao cliente.
 * Esta decorre direto da guarda de saida da Etapa 8, e e o mesmo raciocinio que fez a movimentacao
 * emergencial nao furar a guarda do dono: "regularizo depois" nao e resposta para o dono da chapa.
 *
 * Por que funcao NOVA e nao assertSaidaPermitida: aquela so roda para tipo de SAIDA
 * (stockService.js:636) e compara o dono do MATERIAL com o cliente do VINCULO (OS/projeto). Aqui os
 * dois lados sao MATERIAIS, e a comparacao e material <-> material. Nenhuma das duas pecas serve.
 *
 * Recebe LINHAS de materiais_almoxarifado (precisam ter id, codigo e proprietario_cliente_id), e
 * nao ids, porque quem chama (thirdPartyService.registrarTransformacao) ja leu as duas linhas na
 * pre-checagem — reler aqui seria uma consulta por resultado, N+1 numa transformacao de 40 pecas.
 *
 * `|| null` nos dois lados normaliza antes de comparar: '' e 0 NAO significam nada aqui (todas as
 * leituras de estoque proprio testam IS NULL), e sem a normalizacao um 0 mal gravado recusaria a
 * transformacao mais comum do dia a dia — a de material nosso.
 */
async function assertMesmoDonoNaTransformacao(db, materialOrigem, materialResultado) {
  const donoOrigem = materialOrigem.proprietario_cliente_id || null;
  const donoResultado = materialResultado.proprietario_cliente_id || null;
  if (donoOrigem === donoResultado) return;

  const rotulo = async (id) => (id ? await nomeDoCliente(db, id) : 'estoque proprio (material nosso)');
  const nomeOrigem = await rotulo(donoOrigem);
  const nomeResultado = await rotulo(donoResultado);

  // A mensagem NOMEIA OS DOIS LADOS e os DOIS CODIGOS: sem isso o operador ve "dono diferente" e
  // nao sabe qual dos dois cadastros esta errado, nem por qual dos dois caminhos consertar
  // (corrigir o dono do material de destino, ou usar outro material de destino). Mesmo criterio da
  // mensagem de remessa mista na 8b.
  throw erro(`A peca resultante tem dono diferente da chapa: ${materialOrigem.codigo} e de `
    + `${nomeOrigem} e ${materialResultado.codigo} e de ${nomeResultado}. A transformacao nao pode `
    + 'mudar o proprietario do material — cadastre o material resultante com o mesmo proprietario '
    + 'da chapa, ou escolha outro material de destino.');
}
```

E acrescentar `assertMesmoDonoNaTransformacao` ao `module.exports` (`:189-192`):

```js
module.exports = {
  TIPOS_ISENTOS_DONO, TIPOS_SAIDA_COM_DONO, TIPOS_AJUSTE_DONO,
  assertSaidaPermitida, assertAjustePermitido, assertMesmoDonoNaTransformacao,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: `14 passed, 0 failed`

Run: `cd server && npm run test:api`
Expected: todos OK.

- [ ] **Step 5: SABOTAGEM**

**S1 — a guarda passa a barrar TUDO** (é a sabotagem que prova os **controles positivos**, e é a
mais importante desta task):

```bash
cd server
grep -cF "if (donoOrigem === donoResultado) return;" services/almoxarifado/ownerRules.js   # TEM de dar 1
md5sum services/almoxarifado/ownerRules.js
sed -i "s|if (donoOrigem === donoResultado) return;|if (false) return;|" services/almoxarifado/ownerRules.js
md5sum services/almoxarifado/ownerRules.js   # TEM de diferir
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/ownerRules.js
md5sum services/almoxarifado/ownerRules.js
git diff --stat
```
Esperado: **`✗ [CONTROLE POSITIVO] transformacao para material do MESMO dono passa`** e
**`✗ [CONTROLE POSITIVO] os dois materiais NOSSOS passam`**. Se **nenhum** dos dois cair, os
controles positivos são decorativos — **achado**, conserte-os antes de seguir.

**S2 — a guarda passa a aceitar TUDO** (prova as três recusas):

```bash
cd server
grep -cF "async function assertMesmoDonoNaTransformacao(db, materialOrigem, materialResultado) {" services/almoxarifado/ownerRules.js  # TEM de dar 1
md5sum services/almoxarifado/ownerRules.js
perl -0pi -e "s/(async function assertMesmoDonoNaTransformacao\(db, materialOrigem, materialResultado\) \{\n)/\$1  return;\n/" services/almoxarifado/ownerRules.js
md5sum services/almoxarifado/ownerRules.js
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/ownerRules.js
md5sum services/almoxarifado/ownerRules.js
git diff --stat
```
Esperado: **três** falhas — `transformacao para material de OUTRO dono falha`,
`chapa DE CLIENTE virando peca NOSSA falha`, `chapa NOSSA virando peca DE CLIENTE tambem falha` —
mais `a guarda nao depende de o cliente existir na tabela clientes`. **Quatro** no total.

**S3 — a mensagem para de nomear os donos** (prova que as asserções de mensagem não são enfeite):

```bash
cd server
grep -cF "throw erro(\`A peca resultante tem dono diferente da chapa: \${materialOrigem.codigo} e de \`" services/almoxarifado/ownerRules.js  # TEM de dar 1
md5sum services/almoxarifado/ownerRules.js
```
> Esta âncora tem crase e `${}`; `sed` com esses caracteres é frágil. **Use a ferramenta Edit** para
> trocar o `throw erro(...)` inteiro por
> `throw erro('Dono diferente entre a chapa e a peca resultante');`. Depois:
> ```bash
> cd server && node tests/api/transformacaoTerceiro.api.test.js
> git checkout -- services/almoxarifado/ownerRules.js && git diff --stat
> ```
Esperado: **`✗ transformacao para material de OUTRO dono falha: a mensagem nao diz de quem e a chapa`**,
**`✗ chapa DE CLIENTE virando peca NOSSA falha: ... a mensagem nao nomeia o lado NOSSO da comparacao`**
e **`✗ a guarda nao depende de o cliente existir na tabela clientes`**.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/ownerRules.js \
        server/tests/api/transformacaoTerceiro.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 5: a peca cortada tem de ter o mesmo dono da chapa

Se a chapa e do cliente X e o material-peca esta cadastrado como nosso (proprietario_cliente_id
NULL), a transformacao converteria material de cliente em patrimonio da GMP — em silencio, com o
numero certo em todo relatorio e sem nada errado aparecendo em lugar nenhum. Esse e o caso perigoso,
e nao o de dois clientes diferentes.

A guarda e SIMETRICA porque o caminho inverso e igualmente errado: chapa nossa virando peca de
cliente presenteia o cliente com material que a GMP pagou, e o inventario dele passa a contar a peca.

ISTO NAO E REGRA DEDUZIDA — diferente de "uma remessa nao mistura donos" (8b), que foi deduzida ao
escrever o plano e ficou registrada como pergunta pendente ao cliente. Esta decorre direto da guarda
de saida da Etapa 8, e e o mesmo raciocinio que fez a movimentacao emergencial nao furar a guarda do
dono: "regularizo depois" nao e resposta para o dono da chapa.

DESCARTADO reusar assertSaidaPermitida: ela so roda para tipo de SAIDA e compara o dono do MATERIAL
com o cliente do VINCULO (OS/projeto). Aqui os dois lados sao MATERIAIS e a comparacao e material
<-> material — nenhuma das duas pecas serve.
DESCARTADO herdar o dono automaticamente (criar/ajustar o material de destino para o dono da chapa
na hora da transformacao): mudar o proprietario de um material cadastrado por causa de uma operacao
de estoque e exatamente o tipo de efeito colateral silencioso que a Etapa 8 gastou uma etapa inteira
desfazendo. A tela oferece o atalho de CRIAR o material ja com o dono certo (Task 9) — criar e
explicito, alterar seria escondido.

A funcao recebe as LINHAS dos materiais e nao ids, porque quem chama ja as leu na pre-checagem —
reler seria uma consulta por resultado, N+1 numa transformacao de 40 pecas.

A mensagem NOMEIA OS DOIS DONOS E OS DOIS CODIGOS: sem isso o operador ve "dono diferente" e nao sabe
qual dos dois cadastros esta errado nem por qual caminho consertar.

Testes: 6, sendo DOIS controles positivos (mesmo cliente / os dois nossos). Sabotagem executada:
inverter a guarda para barrar tudo — foram os dois controles positivos que cairam, que e a prova de
que eles nao sao decorativos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: `transformCost.js` — o rateio, função pura, com o invariante testado

> ## ✅ FEITA — 2026-08-13 (`be9b384`, e o pré-requisito em `03c7ce5`)
>
> Steps 1 a 6 executados na ordem, com o teste vermelho antes da implementação
> (`Cannot find module '../../services/almoxarifado/transformCost'`, sem rodapé). Resultado real:
> **`12 passed, 0 failed`** em `server/tests/api/transformCost.api.test.js`.
>
> **Dependência que a execução descobriu:** esta task **não roda** sem `schema.TIPOS_RESULTADO`, que
> é entregue pela **Task 3** — ainda não executada quando a 6 rodou. Sem a constante, o `require`
> devolve `undefined` e os 12 testes morrem em `Cannot read properties of undefined (reading
> 'includes')`, por um motivo que não é o que eles testam. Foi antecipada **só a constante + o
> export** (`03c7ce5`), com o texto que o próprio plano já escrevia para ela; repetir a lista
> literal dentro de `transformCost.js` foi descartado (é o que este plano proíbe). **Continuam
> pendentes na Task 3:** as três colunas via `safeAlter`, o índice de `movimentacao_consumo_id` e o
> `ResultadoTransformacaoSchema`. **Se a Task 3 for executada depois desta linha, ela deve PULAR a
> constante — declará-la de novo é `SyntaxError` de `const` duplicado.**
>
> **Um teste a mais que o plano (11 → 12).** O plano listava 11 `await test(...)` e dizia
> "Expected: 12 passed" — a conta do plano estava errada por um. Em vez de baixar o número, a
> execução acrescentou o teste que faltava para o invariante valer alguma coisa:
> `[CONTROLE POSITIVO DA TOLERANCIA]`. Sem ele, trocar `TOLERANCIA_RATEIO` por um número grande
> demais deixaria o `[INVARIANTE]` verde para sempre e **nenhum** teste cairia — tolerância frouxa é
> carimbo, não teto.

**A decisão 4, em três frases.** Rateio **por quantidade** entre as peças, **sobra a zero**,
`custo_servico` opcional somando ao valor rateado. Por quantidade e não por peso porque na GMP uma
chapa vira N peças **iguais** (os dois critérios dão o mesmo número) e peso exigiria `peso_unitario`
preenchido em todo material — sem ele o cálculo simplesmente não roda. A sobra a zero porque o
rateio por quantidade não quebra entre as peças, quebra **na sobra**: chapa de R$ 1.000 → 40 peças +
1 sobra que é um terço da chapa; rateando em 41 linhas, a sobra carrega 2,4% do valor e as peças
ficam ~40% caras.

**Por que uma função pura isolada:** para trocar a base de rateio ser **uma linha** se a GMP passar a
cortar peças mistas. E porque um invariante contábil testado contra uma função sem `db`, sem `async`
e sem estado é um teste que não pode passar por acaso.

**Files:**
- Create: `server/services/almoxarifado/transformCost.js`
- Test: `server/tests/api/transformCost.api.test.js` (**novo**)

**Interfaces:**
- Produces:
  ```
  ratearCusto({ custoUnitarioChapa, quantidadeConsumida, custoServico = 0, resultados })
    => { valorBase, valorServico, valorTotal, quantidadePecas,
         custoUnitarioPeca, linhas, valorDistribuido, residuo }
  ```
  - `resultados`: `[{ material_id, quantidade, tipo_resultado }]` (campos extras são preservados)
  - `linhas`: os mesmos objetos, **cada um com `custo_unitario_aplicado` acrescentado**
  - `TOLERANCIA_RATEIO(quantidadePecas) => number` — o teto do `|residuo|` aceitável
  - lança `Object.assign(new Error(msg), { status: 400 })` para entrada inválida
- Consumes: `TIPOS_RESULTADO` de `./schema`. **Nenhum `db`, nenhum `async`.**

---

- [x] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/transformCost.api.test.js`:

> **⚠ O bloco abaixo tem 11 testes; o arquivo entregue tem 12.** O 12º
> (`[CONTROLE POSITIVO DA TOLERANCIA]`, acrescentado na execução) está **só no arquivo** — leia
> `server/tests/api/transformCost.api.test.js`, não este bloco, se quiser a lista completa.

```js
/**
 * Etapa 8c, Task 6 — o rateio de custo da transformacao, funcao PURA.
 *
 * Vive em tests/api/ porque e la que o runner descobre arquivos (`tests/api/*.api.test.js`), nao
 * porque exercite rota nenhuma: nao ha db, nao ha app, nao ha async. E de proposito — um invariante
 * contabil testado contra uma funcao sem estado e um teste que nao pode passar por acaso.
 *
 * Executar: cd server && node tests/api/transformCost.api.test.js
 */
const assert = require('assert');
const { ratearCusto, TOLERANCIA_RATEIO } = require('../../services/almoxarifado/transformCost');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const peca = (quantidade, material_id = 1) => ({ material_id, quantidade, tipo_resultado: 'PECA' });
const sobra = (quantidade, material_id = 2) => ({ material_id, quantidade, tipo_resultado: 'SOBRA' });

(async () => {

  await test('o caso da GMP: chapa de 100 kg a R$ 10 vira 40 pecas e 1 sobra', async () => {
    const r = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100,
      resultados: [peca(40), sobra(1)],
    });
    assert.strictEqual(r.valorTotal, 1000);
    assert.strictEqual(r.quantidadePecas, 40);
    assert.strictEqual(r.custoUnitarioPeca, 25);
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 25);
    assert.strictEqual(r.linhas[1].custo_unitario_aplicado, 0, 'a sobra recebeu rateio');
  });

  await test('[INVARIANTE] o valor que sai na chapa e o que entra nas pecas', async () => {
    // O UNICO invariante contabil desta etapa. Ele so vale medido por UMA formula de valor: o
    // sistema tem duas familias de leitura (custo_unitario sozinho em routes/almoxarifado.js:249 e
    // :1048; COALESCE(custo_medio, custo_unitario) nas outras tres), e o design afirmava que "nao
    // ha um segundo lugar onde o patrimonio possa discordar" — HA, e e a propria decisao 11.1 que
    // o diz. Ver contradicao C1 no plano.
    //
    // Aqui, no nivel da funcao pura, o invariante e exato a menos do arredondamento de 4 casas que
    // o motor usa (ROUND(...,4) em stockService.js:1034). TOLERANCIA_RATEIO da o teto.
    const casos = [
      { custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] },
      { custoUnitarioChapa: 7.35, quantidadeConsumida: 83, resultados: [peca(17), peca(6, 3), sobra(2)] },
      { custoUnitarioChapa: 1, quantidadeConsumida: 1, resultados: [peca(3)] },
      { custoUnitarioChapa: 12.3456, quantidadeConsumida: 55.5, resultados: [peca(7), sobra(1)] },
      { custoUnitarioChapa: 10, quantidadeConsumida: 100, custoServico: 250, resultados: [peca(40), sobra(1)] },
    ];
    for (const c of casos) {
      const r = ratearCusto(c);
      const tol = TOLERANCIA_RATEIO(r.quantidadePecas);
      assert.ok(Math.abs(r.residuo) <= tol,
        `residuo ${r.residuo} acima da tolerancia ${tol} no caso ${JSON.stringify(c)}`);
      // A conta refeita AQUI, a mao, a partir das linhas: se ratearCusto calculasse `residuo` de
      // um jeito e `custo_unitario_aplicado` de outro, o teste acima passaria e este nao.
      const distribuido = r.linhas.reduce((a, l) => a + l.quantidade * l.custo_unitario_aplicado, 0);
      assert.ok(Math.abs(distribuido - r.valorTotal) <= tol,
        `refazendo a conta pelas linhas: ${distribuido} != ${r.valorTotal} (caso ${JSON.stringify(c)})`);
    }
  });

  await test('sobra entra com custo zero e NAO dilui as pecas', async () => {
    // O caso que motivou a regra. Chapa de R$ 1.000, 40 pecas + 1 sobra que e um terco da chapa:
    // rateando por quantidade em 41 linhas, a sobra carregaria 2,4% do valor e as pecas ficariam
    // ~40% caras. Com a sobra a zero, a peca fica em 25 e nao em 24,39.
    const comSobra = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    const semSobra = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40)] });
    assert.strictEqual(comSobra.custoUnitarioPeca, semSobra.custoUnitarioPeca,
      'a presenca da sobra mudou o custo da peca — ela entrou no denominador');
    assert.strictEqual(comSobra.custoUnitarioPeca, 25);
  });

  await test('custo_servico informado soma ao valor rateado', async () => {
    // A peca nao e peca sem o corte: a nota do terceiro entra no custo dela. Se em branco, nao
    // entra. Sem estimativa, sem default.
    const semServico = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    const comServico = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, custoServico: 400, resultados: [peca(40), sobra(1)] });
    assert.strictEqual(semServico.valorTotal, 1000);
    assert.strictEqual(comServico.valorTotal, 1400);
    assert.strictEqual(comServico.custoUnitarioPeca, 35);
    assert.strictEqual(comServico.valorServico, 400);
    assert.strictEqual(comServico.linhas[1].custo_unitario_aplicado, 0,
      'o custo do servico vazou para a sobra');
  });

  await test('[CONTROLE POSITIVO] chapa com custo zero credita peca com custo zero, sem erro', async () => {
    // Prova que o rateio NAO inventa numero. Material sem custo cadastrado e caso comum (todo o
    // acervo anterior a Task 2 desta etapa), e a transformacao dele tem de funcionar mesmo assim —
    // com custo zero, que e a verdade, e nao com um custo estimado.
    const r = ratearCusto({
      custoUnitarioChapa: 0, quantidadeConsumida: 100, resultados: [peca(40), sobra(1)] });
    assert.strictEqual(r.valorTotal, 0);
    assert.strictEqual(r.custoUnitarioPeca, 0);
    assert.strictEqual(r.residuo, 0);
    for (const l of r.linhas) assert.strictEqual(l.custo_unitario_aplicado, 0);
  });

  await test('so SOBRA: o valor evapora, e o residuo DIZ quanto evaporou', async () => {
    // Caso que o design nao trata (contradicao C3 do plano). Decidido aqui: e permitido e o valor
    // evapora DE PROPOSITO — chapa que voltou so como retalho e exatamente o caso em que o valor foi
    // consumido pelo processo, e inflar o retalho para "fechar a conta" e o que a decisao 4 recusa
    // em voz alta. O numero nao pode sumir sem rastro: `residuo` o carrega, e o servico (Task 7) o
    // escreve na justificativa do CONSUMO_TERCEIRO.
    const r = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 100, resultados: [sobra(3)] });
    assert.strictEqual(r.quantidadePecas, 0);
    assert.strictEqual(r.custoUnitarioPeca, 0);
    assert.strictEqual(r.valorDistribuido, 0);
    assert.strictEqual(r.residuo, 1000, 'o valor que evaporou nao foi reportado');
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 0);
  });

  await test('duas linhas de PECA com quantidades diferentes recebem o MESMO custo unitario', async () => {
    // Rateio por QUANTIDADE: cada unidade custa o mesmo, independentemente de estar numa linha de
    // 30 ou numa de 10. Um rateio por LINHA (valorTotal / numeroDeLinhas) daria 500 e 500, e as 10
    // pecas da segunda linha ficariam 3x mais caras que as 30 da primeira.
    const r = ratearCusto({
      custoUnitarioChapa: 25, quantidadeConsumida: 40, resultados: [peca(30, 1), peca(10, 2)] });
    assert.strictEqual(r.valorTotal, 1000);
    assert.strictEqual(r.quantidadePecas, 40);
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 25);
    assert.strictEqual(r.linhas[1].custo_unitario_aplicado, 25);
  });

  await test('a funcao PRESERVA os campos das linhas de entrada', async () => {
    // Ela devolve as linhas para quem chama gravar. Perder lote_id/observacoes aqui seria a mesma
    // classe de bug do z.object que come chave nao declarada.
    const r = ratearCusto({
      custoUnitarioChapa: 10, quantidadeConsumida: 10,
      resultados: [{ material_id: 5, quantidade: 2, tipo_resultado: 'PECA', lote_id: 9, observacoes: 'x' }],
    });
    assert.strictEqual(r.linhas[0].material_id, 5);
    assert.strictEqual(r.linhas[0].lote_id, 9);
    assert.strictEqual(r.linhas[0].observacoes, 'x');
    assert.strictEqual(r.linhas[0].custo_unitario_aplicado, 50);
  });

  await test('a funcao NAO muta o array de entrada', async () => {
    // Pura de verdade. Se mutasse, a compensacao do Task 7 (que reusa os objetos para desfazer)
    // desfaria com dados ja alterados.
    const entrada = [peca(4)];
    ratearCusto({ custoUnitarioChapa: 10, quantidadeConsumida: 4, resultados: entrada });
    assert.strictEqual(entrada[0].custo_unitario_aplicado, undefined,
      'ratearCusto escreveu no objeto de entrada');
  });

  await test('entradas invalidas sao recusadas com 400 e mensagem especifica', async () => {
    const casos = [
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 0, resultados: [peca(1)] }, /consumida/i],
      [{ custoUnitarioChapa: -1, quantidadeConsumida: 10, resultados: [peca(1)] }, /custo/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, custoServico: -5, resultados: [peca(1)] }, /servico/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, resultados: [] }, /resultado/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, resultados: [peca(0)] }, /quantidade/i],
      [{ custoUnitarioChapa: 10, quantidadeConsumida: 10, resultados: [{ material_id: 1, quantidade: 1, tipo_resultado: 'CAVACO' }] }, /CAVACO|classifica/i],
    ];
    for (const [entrada, regex] of casos) {
      assert.throws(() => ratearCusto(entrada), (e) => {
        assert.strictEqual(e.status, 400, `caso ${JSON.stringify(entrada)} nao veio com status 400`);
        assert.match(e.message, regex, `mensagem generica demais: ${e.message}`);
        return true;
      }, `nao recusou: ${JSON.stringify(entrada)}`);
    }
  });

  await test('[CONTROLE POSITIVO] a entrada minima valida NAO e recusada', async () => {
    // Sem isto, uma validacao que recusasse tudo passaria no teste acima.
    const r = ratearCusto({ custoUnitarioChapa: 0, quantidadeConsumida: 1, resultados: [sobra(1)] });
    assert.strictEqual(r.valorTotal, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/transformCost.api.test.js`
Expected: FAIL — `Cannot find module '../../services/almoxarifado/transformCost'`, processo morre no
`require` sem imprimir o rodapé.

- [x] **Step 3: Implementar**

Criar `server/services/almoxarifado/transformCost.js`:

```js
/**
 * O rateio de custo da transformacao (Etapa 8c, decisao 4 do design) — FUNCAO PURA.
 *
 * Sem db, sem async, sem estado. Isolada de proposito por dois motivos: (1) trocar a base do rateio
 * (por peso, por area, por linha) e uma mudanca de UM arquivo se a GMP passar a cortar pecas
 * mistas; (2) o unico invariante contabil desta etapa vale a pena testar contra uma funcao que nao
 * tem como passar por acaso.
 *
 * ─── A regra, decidida com o cliente em 2026-08-13 ───────────────────────────────────────────
 *
 * RATEIO POR QUANTIDADE ENTRE AS PECAS, SOBRA A ZERO.
 *
 * Por que quantidade e nao peso: na GMP uma chapa vira N pecas IGUAIS, e ai os dois criterios dao o
 * mesmo numero. Peso so ganharia se a mesma remessa voltasse com pecas de tamanhos bem diferentes.
 * E peso exige `peso_unitario` preenchido em TODO material — sem ele o calculo simplesmente nao
 * roda, e travar o operador por um campo de cadastro em branco e o que a decisao 7 recusa.
 *
 * Por que a sobra entra a zero: o rateio por quantidade nao quebra entre as pecas; quebra NA SOBRA.
 * Chapa de R$ 1.000 -> 40 pecas + 1 sobra que e um terco da chapa: rateando por quantidade em 41
 * linhas, a sobra carrega 2,4% do valor e as pecas ficam ~40% caras. A sobra e UMA linha e uma
 * FATIA GRANDE — e ela que envenena a media. Sobra a custo zero e o tratamento conservador que ERP
 * da a retalho: o patrimonio nunca infla, e se um dia a sobra for vendida como sucata aparece como
 * GANHO, nunca como perda inventada.
 *
 * CUSTO DO SERVICO: opcional, e o valor TOTAL da nota do terceiro daquela transformacao. Se
 * preenchido, soma ao valor rateado — a peca nao e peca sem o corte. Se em branco, nao entra. Sem
 * estimativa, sem default.
 *
 * ─── Dois casos-limite decididos aqui, e nao no design ───────────────────────────────────────
 *
 * 1. ZERO PECAS (so sobra). Permitido, e o valor EVAPORA de proposito: chapa que voltou so como
 *    retalho e exatamente o caso em que o valor foi consumido pelo processo, e inflar o retalho
 *    para "fechar a conta" e o que a decisao 4 recusa em voz alta. O numero nao some sem rastro:
 *    `residuo` o carrega, e quem chama escreve o residuo na justificativa do CONSUMO_TERCEIRO.
 * 2. CUSTO ZERO na chapa. Permitido e silencioso: material sem custo cadastrado e caso comum (todo
 *    o acervo anterior a Task 2 desta etapa), e a transformacao dele tem de funcionar com custo
 *    zero, que e a VERDADE, e nao com um custo estimado.
 *
 * ─── O invariante, e o que ele NAO promete ───────────────────────────────────────────────────
 *
 * PROMETE: `sum(linha.quantidade * linha.custo_unitario_aplicado) == valorTotal`, a menos do
 * arredondamento de 4 casas que o motor usa (ROUND(...,4), stockService.js:1034). `residuo` e a
 * diferenca e TOLERANCIA_RATEIO(n) e o teto dela.
 *
 * NAO PROMETE que o patrimonio lido nas telas nao se move. Duas razoes, as duas registradas no
 * plano (C1 e C2): o sistema tem DUAS familias de leitura de valor (`custo_unitario` sozinho contra
 * `COALESCE(custo_medio, custo_unitario)`), e a sobra creditada a custo zero cai no ramo SEM custo
 * do motor (stockService.js:1043) — ou seja, ela entra carregando o custo que o material dela ja
 * tinha. O invariante fecha na FUNCAO; nas telas ele fecha quando os materiais de destino nao tem
 * custo previo e a leitura e uma so.
 */
const { TIPOS_RESULTADO } = require('./schema');

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** As 4 casas do motor (ROUND(...,4) em stockService.js:1034). Mesma precisao, de proposito. */
const CASAS = 4;
const arredondar = (v) => Math.round(v * 10 ** CASAS) / 10 ** CASAS;

/**
 * Teto do |residuo| aceitavel para `n` unidades de peca.
 *
 * Cada custo unitario e arredondado a 4 casas, entao erra no maximo 0,00005 por unidade; `n`
 * unidades acumulam `n * 0,00005`. O `1e-9` cobre o erro de ponto flutuante da propria soma. Sem
 * esta funcao, o teste do invariante teria de escolher um numero magico, e um numero magico grande
 * demais aprova rateio errado.
 */
const TOLERANCIA_RATEIO = (n) => n * 0.00005 + 1e-9;

function ratearCusto({ custoUnitarioChapa, quantidadeConsumida, custoServico = 0, resultados }) {
  const custoChapa = Number(custoUnitarioChapa);
  const consumida = Number(quantidadeConsumida);
  const servico = Number(custoServico || 0);

  if (!Number.isFinite(custoChapa) || custoChapa < 0) {
    throw erro(`Custo unitario da chapa invalido: ${custoUnitarioChapa}`);
  }
  if (!Number.isFinite(consumida) || !(consumida > 0)) {
    throw erro(`Quantidade consumida da chapa deve ser maior que zero (recebido: ${quantidadeConsumida})`);
  }
  if (!Number.isFinite(servico) || servico < 0) {
    throw erro(`Custo do servico do terceiro nao pode ser negativo (recebido: ${custoServico})`);
  }
  if (!Array.isArray(resultados) || resultados.length === 0) {
    throw erro('Informe ao menos um resultado da transformacao (peca ou sobra)');
  }
  for (const r of resultados) {
    if (!Number.isFinite(Number(r.quantidade)) || !(Number(r.quantidade) > 0)) {
      throw erro(`Quantidade do resultado deve ser maior que zero (material ${r.material_id}: ${r.quantidade})`);
    }
    if (!TIPOS_RESULTADO.includes(r.tipo_resultado)) {
      throw erro(`Classificacao invalida no resultado do material ${r.material_id}: `
        + `${r.tipo_resultado}. Validas: ${TIPOS_RESULTADO.join(', ')}`);
    }
  }

  const valorBase = custoChapa * consumida;
  const valorServico = servico;
  const valorTotal = arredondar(valorBase + valorServico);

  const quantidadePecas = resultados
    .filter((r) => r.tipo_resultado === 'PECA')
    .reduce((a, r) => a + Number(r.quantidade), 0);

  // Zero pecas: o denominador nao existe. Custo zero em todas as linhas, e o valor inteiro vira
  // residuo — reportado, nunca escondido. Ver o caso-limite 1 no cabecalho.
  const custoUnitarioPeca = quantidadePecas > 0 ? arredondar(valorTotal / quantidadePecas) : 0;

  // Objetos NOVOS: a funcao nao muta a entrada. Quem chama (thirdPartyService) reusa os objetos de
  // entrada na compensacao, e mutar aqui faria a compensacao desfazer com dados ja alterados.
  const linhas = resultados.map((r) => ({
    ...r,
    custo_unitario_aplicado: r.tipo_resultado === 'PECA' ? custoUnitarioPeca : 0,
  }));

  const valorDistribuido = arredondar(
    linhas.reduce((a, l) => a + Number(l.quantidade) * l.custo_unitario_aplicado, 0));
  const residuo = arredondar(valorTotal - valorDistribuido);

  return {
    valorBase: arredondar(valorBase),
    valorServico: arredondar(valorServico),
    valorTotal,
    quantidadePecas,
    custoUnitarioPeca,
    linhas,
    valorDistribuido,
    residuo,
  };
}

module.exports = { ratearCusto, TOLERANCIA_RATEIO, CASAS };
```

- [x] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/api/transformCost.api.test.js`
Expected: `12 passed, 0 failed`

Run: `cd server && npm run test:api`
Expected: todos OK (número de arquivos +1).

- [x] **Step 5: SABOTAGEM**

**S1 — a sobra entra no denominador** (prova o teste que motivou a regra inteira **e** o do
`custo_servico`):

```bash
cd server
grep -cF ".filter((r) => r.tipo_resultado === 'PECA')" services/almoxarifado/transformCost.js   # TEM de dar 1
md5sum services/almoxarifado/transformCost.js
sed -i "s|.filter((r) => r.tipo_resultado === 'PECA')|.filter(() => true)|" services/almoxarifado/transformCost.js
md5sum services/almoxarifado/transformCost.js   # TEM de diferir
node tests/api/transformCost.api.test.js
cp "$SCRATCH/transformCost.bak.js" services/almoxarifado/transformCost.js   # NAO use `git checkout --`: no Step 5 a implementacao ainda nao esta commitada
md5sum services/almoxarifado/transformCost.js
git diff --stat
```
**⚠ O PLANO PREVIA ERRADO AQUI — corrigido na execução (2026-08-13, `be9b384`).** O plano dizia:
*"O `[INVARIANTE]` continua passando […] o invariante não detecta este bug, porque a soma continua
fechando"*. **Executada, S1 DERRUBA o invariante.** Resultado real: **`7 passed, 5 failed`** —
`✗ o caso da GMP` (41 ≠ 40), `✗ [INVARIANTE]` (**resíduo 24.392 acima da tolerância 0.002050001**),
`✗ sobra entra com custo zero e NAO dilui as pecas` (24.3902 ≠ 25), `✗ custo_servico informado soma
ao valor rateado` (34.1463 ≠ 35) e `✗ so SOBRA` (3 ≠ 0).

O motivo: S1 mexe **só no denominador** e deixa o `map` creditando a sobra com 0. Isso não é "a
sobra entrou no rateio" — é **valor evaporando** (a sobra engorda o divisor e não recebe nada), e
evaporação é exatamente o que o invariante pega.

**S1b — a sabotagem que prova mesmo a afirmação do plano** (sobra no denominador **E** creditada):

```bash
cd server
A1=".filter((r) => r.tipo_resultado === 'PECA')"
A2="custo_unitario_aplicado: r.tipo_resultado === 'PECA' ? custoUnitarioPeca : 0,"
grep -cF "$A1" services/almoxarifado/transformCost.js   # TEM de dar 1
grep -cF "$A2" services/almoxarifado/transformCost.js   # TEM de dar 1
md5sum services/almoxarifado/transformCost.js
sed -i "s|$A1|.filter(() => true)|" services/almoxarifado/transformCost.js
sed -i "s|$A2|custo_unitario_aplicado: custoUnitarioPeca,|" services/almoxarifado/transformCost.js
md5sum services/almoxarifado/transformCost.js   # TEM de diferir
node tests/api/transformCost.api.test.js
cp "$SCRATCH/transformCost.bak.js" services/almoxarifado/transformCost.js   # NAO use `git checkout --`
md5sum services/almoxarifado/transformCost.js
```
Resultado real: **`8 passed, 4 failed`** — o **`[INVARIANTE]` passa VERDE** (a soma fecha: nada
evaporou, só ficou mal distribuído) e quem cai é `✗ sobra entra com custo zero e NAO dilui as pecas`
(24.3902 ≠ 25), junto de `o caso da GMP`, `custo_servico` e `so SOBRA`. **É esta a prova de que o
invariante mede "nada evaporou" e NÃO "o rateio foi justo"** — e de que o teste separado tem de
existir. **Escreva isso no commit** — é o limite conhecido do invariante.

**S2 — o rateio passa a ser por LINHA e não por quantidade:**

```bash
cd server
grep -cF "const custoUnitarioPeca = quantidadePecas > 0 ? arredondar(valorTotal / quantidadePecas) : 0;" services/almoxarifado/transformCost.js  # TEM de dar 1
md5sum services/almoxarifado/transformCost.js
```
> A linha contém `?` e `/`; use `|` como delimitador do `sed` (já é o padrão deste plano) — a linha
> **não** contém `|`, então é seguro:
```bash
sed -i "s|const custoUnitarioPeca = quantidadePecas > 0 ? arredondar(valorTotal / quantidadePecas) : 0;|const custoUnitarioPeca = quantidadePecas > 0 ? arredondar(valorTotal / resultados.length) : 0;|" services/almoxarifado/transformCost.js
md5sum services/almoxarifado/transformCost.js
node tests/api/transformCost.api.test.js
cp "$SCRATCH/transformCost.bak.js" services/almoxarifado/transformCost.js   # NAO use `git checkout --`: no Step 5 a implementacao ainda nao esta commitada
md5sum services/almoxarifado/transformCost.js
git diff --stat
```
Esperado: **`✗ [INVARIANTE] o valor que sai na chapa e o que entra nas pecas`** (o resíduo estoura a
tolerância), **`✗ o caso da GMP`**, **`✗ custo_servico informado soma ao valor rateado`** e
**`✗ duas linhas de PECA com quantidades diferentes recebem o MESMO custo unitario`**. **Quatro**
falhas — esta é a sabotagem que o invariante pega.

**Resultado real (2026-08-13):** **`6 passed, 6 failed`** — as quatro previstas (`[INVARIANTE]` com
resíduo −19000 contra tolerância 0.002000001) **mais** `✗ a funcao PRESERVA os campos das linhas de
entrada` (100 ≠ 50, porque ali o rateio por linha também muda o custo) e o próprio
`✗ sobra entra com custo zero...`. Seis, não quatro; a previsão do plano era conservadora.

**S3 — o resíduo é sempre zero** (prova o caso "só sobra"):

```bash
cd server
grep -cF "const residuo = arredondar(valorTotal - valorDistribuido);" services/almoxarifado/transformCost.js  # TEM de dar 1
md5sum services/almoxarifado/transformCost.js
sed -i "s|const residuo = arredondar(valorTotal - valorDistribuido);|const residuo = 0;|" services/almoxarifado/transformCost.js
md5sum services/almoxarifado/transformCost.js
node tests/api/transformCost.api.test.js
cp "$SCRATCH/transformCost.bak.js" services/almoxarifado/transformCost.js   # NAO use `git checkout --`: no Step 5 a implementacao ainda nao esta commitada
md5sum services/almoxarifado/transformCost.js
git diff --stat
```
Esperado: **`✗ so SOBRA: o valor evapora, e o residuo DIZ quanto evaporou: o valor que evaporou nao foi reportado`**
(`0 !== 1000`). **Atenção:** o `[INVARIANTE]` **continua passando** com `residuo = 0` — e isso é
exatamente por que a asserção "refazendo a conta pelas linhas" existe dentro dele. Confirme na saída
que ela **não** caiu; se cair, ótimo (melhor ainda). Se o teste `so SOBRA` **não** cair, é achado.

**Resultado real (2026-08-13):** **`11 passed, 1 failed`**, exatamente como previsto — cai só
`✗ so SOBRA ... : o valor que evaporou nao foi reportado` (`0 !== 1000`) e o `[INVARIANTE]` segue
verde.

- [x] **Step 6: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/transformCost.js \
        server/tests/api/transformCost.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 6: o rateio de custo da transformacao, funcao pura, com invariante

Rateio POR QUANTIDADE entre as pecas, SOBRA A ZERO, custo do servico do terceiro somando quando
informado. Decidido com o cliente em 2026-08-13.

Por que quantidade e nao peso: na GMP uma chapa vira N pecas IGUAIS, e ai os dois criterios dao o
mesmo numero. Peso so ganharia com pecas de tamanhos bem diferentes na mesma remessa, e exigiria
peso_unitario preenchido em TODO material — sem ele o calculo nao roda, e travar o operador por campo
de cadastro em branco e o que a decisao 7 do design recusa.

Por que a sobra a zero: o rateio por quantidade nao quebra entre as pecas, quebra NA SOBRA. Chapa de
R$ 1.000 -> 40 pecas + 1 sobra que e um terco da chapa: rateando em 41 linhas, a sobra carrega 2,4%
do valor e as pecas ficam ~40% caras. A sobra e UMA linha e uma FATIA GRANDE, e e ela que envenena a
media. Sobra a custo zero e o tratamento conservador que ERP da a retalho.

Funcao PURA e isolada: sem db, sem async, sem estado. Trocar a base do rateio vira mudanca de um
arquivo se a GMP passar a cortar pecas mistas, e um invariante contabil testado contra funcao sem
estado nao passa por acaso.

DOIS CASOS-LIMITE decididos aqui porque o design nao os trata. ZERO PECAS (so sobra): permitido, e o
valor EVAPORA de proposito — chapa que voltou so como retalho e o caso em que o valor foi consumido
pelo processo, e inflar o retalho para "fechar a conta" e o que a decisao 4 recusa. O numero nao some
sem rastro: `residuo` o carrega e o servico o escreve na justificativa do CONSUMO_TERCEIRO. CUSTO
ZERO na chapa: permitido e silencioso, porque material sem custo cadastrado e caso comum e a
transformacao tem de funcionar com a verdade (zero) e nao com estimativa.

O QUE O INVARIANTE NAO PROMETE, e isto corrige uma afirmacao do design (decisao 4 dizia que "nao ha
um segundo lugar onde o patrimonio possa discordar"): HA DOIS. O sistema tem duas familias de leitura
de valor (custo_unitario sozinho contra COALESCE(custo_medio, custo_unitario)) — a propria decisao
11.1 do design o diz — e a sobra creditada a custo zero cai no ramo SEM custo do motor, entrando
carregando o custo que o material dela ja tinha. O invariante fecha na FUNCAO; nas telas fecha quando
os materiais de destino nao tem custo previo e a leitura e uma so. Registrado, nao escondido.

Achado durante a sabotagem, registrado: o invariante NAO pega "a sobra entrou no denominador" — a
soma continua fechando. O que ele prova e que nada evaporou, nao que o rateio foi justo. Por isso o
teste `sobra ... NAO dilui as pecas` existe separado dele.

Testes: 12 em tests/api/transformCost.api.test.js.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 7: `thirdPartyService.registrarTransformacao` — a baixa, os N créditos e a compensação

**A forma, e por que ela é a da 8b.** SQLite, motor sem transação. A transformação é a operação mais
composta do módulo até aqui: **uma baixa e N créditos**, em materiais diferentes, com sinais
opostos. Copia letra por letra `registrarRetorno` (`thirdPartyService.js:395-512`): valida **tudo**
antes de mover **qualquer coisa**, faz claim no `WHERE` do item, e no `catch` desfaz o que já entrou.

**A ordem, decidida na decisão 9: baixa a chapa PRIMEIRO, credita as peças DEPOIS.** Se o crédito
falhar no meio, a compensação estorna os créditos já feitos e devolve a chapa. A ordem inversa
(creditar primeiro) criaria, na falha, **peças sem baixa** — estoque do nada, que é o pior dos dois
estados, e é literalmente o que a mensagem de recusa da 8b dizia querer evitar.

**A correção que esta task faz na decisão 9 (contradição C6 do plano).** "Devolve a chapa", tomado
ao pé da letra com `cancelarMovimentacao`, **não devolve `quantidade_em_terceiros`** — e isso é
deliberado no motor (`stockService.js:1380-1387`), porque lá a remessa **já está ENCERRADA**. Aqui a
remessa está **viva** e o claim do item está sendo devolvido: sem a retenção de volta, o item fica
pendente com **zero retenção** e a próxima tentativa bate na guarda
`COALESCE(quantidade_em_terceiros,0) >= ?` (`stockService.js:996`) **para sempre**. A compensação é
`cancelarMovimentacao` (livro honesto) **mais** um `UPDATE` suplementar que devolve **só** a
retenção. O teste decisivo não é "os números voltaram": é **a retransformação depois da falha
funciona**.

**Files:**
- Modify: `server/services/almoxarifado/thirdPartyService.js` — `registrarTransformacao`,
  `compensarTransformacao`, `require` de `transformCost` e `ownerRules`, `module.exports`
- Test: `server/tests/api/transformacaoTerceiro.api.test.js` (bloco `══ Task 7 ══`)

**Interfaces:**
- Consumes: `validarRetornoDoItem` (Task/8b, chamado **sem** `materialId` — é isso que evita a
  recusa da 8c); `stockService.registrarMovimentacao` com `CONSUMO_TERCEIRO` (8b) e
  `RETORNO_TRANSFORMACAO` (Task 4); `stockService.cancelarMovimentacao`;
  `ownerRules.assertMesmoDonoNaTransformacao` (Task 5); `transformCost.ratearCusto` (Task 6);
  `sm.PODE_RECEBER_RETORNO` e `sm.validarTransicao` (8b).
- Produces:
  ```
  registrarTransformacao(db, user, remessaId, data) => Promise<{
    success: true, remessa_id, status, transformacoes, resultados, pendente_total, custo: [...]
  }>
  ```
  com
  ```
  data = { nota_fiscal?, itens: [{
    item_remessa_id, quantidade_consumida, custo_servico?, lote_id?, observacoes?,
    resultados: [{ material_id, quantidade, tipo_resultado, lote_id?, observacoes? }]
  }] }
  ```
  `custo[i] = { item_remessa_id, material_codigo, valor_base, valor_servico, valor_total,
  custo_unitario_peca, residuo }`.
  **`rendimento` NÃO faz parte desta task** — entra na Task 8, que também acrescenta a rota.

---

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `server/tests/api/transformacaoTerceiro.api.test.js`, **antes** do `await close()`:

```js
  // ══ Task 7 — registrarTransformacao ═════════════════════════════════════════════════════════

  const stockService = require('../../services/almoxarifado/stockService');

  /** Chapa de 100 KG a R$ 10, enviada. Devolve { remessa, itemId, materialId }. */
  const chapaEnviada = (extra = {}) => remessaEnviada(db, { qtd: 100, custo: 10, unidade: 'KG', ...extra });

  await test('transformacao baixa a chapa e credita as pecas', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-A' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-A' });

    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-TRF-1',
      itens: [{
        item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [
          { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
          { material_id: sobraId, quantidade: 12, tipo_resultado: 'SOBRA' },
        ],
      }],
    });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.transformacoes, 1);
    assert.strictEqual(r.resultados, 2);
    assert.strictEqual(r.pendente_total, 0);
    assert.strictEqual(r.status, 'ENCERRADA', 'consumo total nao encerrou a remessa');

    // A chapa saiu do patrimonio E da retencao — as duas, no mesmo UPDATE do motor.
    const chapa = await saldos(db, materialId);
    assert.strictEqual(chapa.quantidade_atual, 0, 'a chapa continua no patrimonio');
    assert.strictEqual(chapa.em_terceiros, 0, 'a retencao da chapa ficou presa');

    // As pecas entraram.
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 40);
    assert.strictEqual((await saldos(db, sobraId)).quantidade_atual, 12);
  });

  await test('a transformacao grava as tres colunas novas e os DOIS vinculos de movimentacao', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-B' });
    const sobraId = await novoMaterial(db, { unidade: 'KG', cod: 'SOBRA-B' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      nota_fiscal: 'NF-TRF-2',
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 12, tipo_resultado: 'SOBRA' },
      ] }],
    });
    const linhas = await dbAll(db,
      'SELECT * FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.strictEqual(linhas.length, 2);
    assert.strictEqual(linhas[0].tipo_resultado, 'PECA');
    assert.strictEqual(linhas[1].tipo_resultado, 'SOBRA');
    assert.strictEqual(linhas[0].custo_unitario_aplicado, 25);
    assert.strictEqual(linhas[1].custo_unitario_aplicado, 0);
    assert.strictEqual(linhas[0].material_id, pecaId, 'o resultado gravou o material da CHAPA');
    assert.strictEqual(linhas[0].nota_fiscal, 'NF-TRF-2');

    // As DUAS pontas: movimentacao_id aponta para o credito, movimentacao_consumo_id para a baixa.
    for (const l of linhas) {
      const credito = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [l.movimentacao_id]);
      assert.ok(credito, 'a linha nao aponta para a movimentacao que a creditou');
      assert.strictEqual(credito.tipo, 'RETORNO_TRANSFORMACAO');
      assert.strictEqual(credito.material_id, l.material_id);
      const baixa = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [l.movimentacao_consumo_id]);
      assert.ok(baixa, 'a linha nao aponta para a movimentacao que baixou a chapa');
      assert.strictEqual(baixa.tipo, 'CONSUMO_TERCEIRO');
      assert.strictEqual(baixa.material_id, materialId);
      assert.strictEqual(baixa.quantidade, 100);
    }
    // O agrupador: as N linhas do MESMO evento compartilham o consumo. E por isso que nao ha coluna
    // quantidade_consumida na linha — somar por linha contaria o mesmo consumo N vezes.
    assert.strictEqual(linhas[0].movimentacao_consumo_id, linhas[1].movimentacao_consumo_id);
  });

  await test('[INVARIANTE] o valor que sai na chapa e o que entra nas pecas', async () => {
    // Medido por UMA formula so (COALESCE(custo_medio, custo_unitario)) e com materiais de destino
    // de saldo/custo ZERO. As duas restricoes sao reais e estao no plano (C1 e C2): o sistema tem
    // DUAS familias de leitura de valor, e a sobra a custo zero entra carregando o custo que o
    // material dela ja tinha (o motor nao escreve custo quando o custo informado nao e > 0).
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-INV' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-INV' });

    const antes = await valorDe(db, materialId);
    assert.strictEqual(antes, 1000, 'a fixture da chapa nao vale R$ 1.000');

    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 12, tipo_resultado: 'SOBRA' },
      ] }],
    });
    const depois = (await valorDe(db, materialId)) + (await valorDe(db, pecaId)) + (await valorDe(db, sobraId));
    assert.ok(Math.abs(depois - antes) < 0.01,
      `o patrimonio se moveu: antes ${antes}, depois ${depois}`);
    assert.strictEqual(await valorDe(db, materialId), 0);
    assert.strictEqual(await valorDe(db, sobraId), 0, 'a sobra entrou com valor');
  });

  await test('sobra entra com custo zero e nao dilui as pecas', async () => {
    // O caso que motivou a regra, medido no BANCO: 25 e nao 24,39.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-DIL' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-DIL' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 33, tipo_resultado: 'SOBRA' },
      ] }],
    });
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 25,
      'a sobra entrou no denominador do rateio');
    const s = await saldos(db, sobraId);
    assert.strictEqual(s.quantidade_atual, 33);
    assert.strictEqual(s.custo_medio, 0);
  });

  await test('sobra a custo zero NAO apaga o custo que o material da sobra ja tinha', async () => {
    // Consequencia do ramo `else` do motor (stockService.js:1043): credito com custo 0 nao escreve
    // custo nenhum. E o comportamento certo — e e tambem o motivo pelo qual o invariante so fecha
    // com sobra de custo previo zero (contradicao C2 do plano). Fixado aqui para nao virar surpresa.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-C2' });
    const sobraId = await novoMaterial(db, { atual: 5, custo: 3, unidade: 'KG', cod: 'SOBRA-C2' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 10, tipo_resultado: 'SOBRA' },
      ] }],
    });
    const s = await saldos(db, sobraId);
    assert.strictEqual(s.quantidade_atual, 15);
    assert.strictEqual(s.custo_medio, 3, 'a sobra a custo zero apagou o custo cadastrado do material');
  });

  await test('custo_servico informado soma ao valor rateado', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-SRV' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, custo_servico: 400,
        resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 35, '1000 + 400 rateado em 40 = 35');
    assert.strictEqual(r.custo[0].valor_servico, 400);
    assert.strictEqual(r.custo[0].valor_total, 1400);
    // O servico tem de ficar ESCRITO em algum lugar auditavel: nao ha coluna de custo no ledger, e
    // nao ha coluna de servico na linha de resultado (seria repetida por linha). A justificativa do
    // CONSUMO_TERCEIRO e esse lugar.
    const baixa = await dbGet(db,
      "SELECT motivo, observacoes FROM movimentacoes_almoxarifado WHERE tipo = 'CONSUMO_TERCEIRO' ORDER BY id DESC LIMIT 1");
    assert.match(`${baixa.motivo || ''} ${baixa.observacoes || ''}`, /400/,
      'o custo do servico do terceiro nao ficou registrado em lugar nenhum');
  });

  await test('[CONTROLE POSITIVO] chapa com custo zero credita peca com custo zero, sem erro', async () => {
    // Prova que o rateio nao inventa numero. Material sem custo cadastrado e caso comum (todo o
    // acervo anterior a Task 2), e a transformacao dele tem de funcionar — com zero, que e a
    // verdade.
    const { remessa, itemId } = await remessaEnviada(db, { qtd: 50, custo: 0, unidade: 'KG' });
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-ZERO' });
    await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 50,
        resultados: [{ material_id: pecaId, quantidade: 10, tipo_resultado: 'PECA' }] }],
    });
    const p = await saldos(db, pecaId);
    assert.strictEqual(p.quantidade_atual, 10);
    assert.strictEqual(p.custo_medio, 0);
  });

  await test('so SOBRA: o valor sem destino fica ESCRITO na baixa da chapa', async () => {
    // Caso-limite decidido no plano (C3): permitido, e o valor evapora de proposito. O que nao pode
    // e evaporar em silencio.
    const { remessa, itemId } = await chapaEnviada();
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'SOBRA-SO' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: sobraId, quantidade: 30, tipo_resultado: 'SOBRA' }] }],
    });
    assert.strictEqual(r.custo[0].residuo, 1000);
    const baixa = await dbGet(db,
      "SELECT motivo, observacoes FROM movimentacoes_almoxarifado WHERE tipo = 'CONSUMO_TERCEIRO' ORDER BY id DESC LIMIT 1");
    assert.match(`${baixa.motivo || ''} ${baixa.observacoes || ''}`, /1000/,
      'o valor que evaporou nao ficou escrito na baixa');
  });

  await test('peca de material inexistente falha ensinando o caminho', async () => {
    // Decisao 6: o motor NAO cria material. Precedente do modulo: o recebimento tambem nao
    // (receiptService.js:44-50). Criar material implicitamente a partir de um formulario de retorno
    // produziria cadastro-lixo a cada erro de digitacao, e cadastro-lixo em almoxarifado nao se
    // apaga — ele ganha saldo.
    const { remessa, itemId, materialId } = await chapaEnviada();
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: 987654, quantidade: 5, tipo_resultado: 'PECA' }] }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /987654/, 'a mensagem nao diz QUAL material nao existe');
        assert.match(e.message, /cadastr/i, 'a mensagem nao ensina o caminho (cadastrar antes)');
        return true;
      });
    // Nada se moveu: a recusa e na PRE-CHECAGEM, antes de qualquer efeito.
    const c = await saldos(db, materialId);
    assert.strictEqual(c.quantidade_atual, 100);
    assert.strictEqual(c.em_terceiros, 100);
  });

  await test('material de destino INATIVO tambem falha', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const morto = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-MORTA' });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [morto]);
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: morto, quantidade: 5, tipo_resultado: 'PECA' }] }] }),
      /inativ/i);
  });

  await test('resultado com o MESMO material da chapa e recusado, apontando o retorno simples', async () => {
    // Chapa que volta como ela mesma nao e transformacao — e o retorno da 8b, e ele tem rota
    // propria. Aceitar aqui daria dois caminhos para a mesma operacao, com contabilidades de custo
    // diferentes (um rateia, o outro nao).
    const { remessa, itemId, materialId } = await chapaEnviada();
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: materialId, quantidade: 10, tipo_resultado: 'PECA' }] }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /retorno/i, 'a mensagem nao aponta o caminho do retorno simples');
        return true;
      });
  });

  await test('quantidade_consumida acima do pendente falha, com os numeros na mensagem', async () => {
    // O teto da 8b continua valendo, INTACTO: `quantidade_consumida` esta na unidade do ENVIADO, e
    // e por isso que a decisao 1 separou os dois numeros. Comparar peca (UN) com chapa (KG) seria
    // somar laranja com maca.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-TETO' });
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 140,
          resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }] }),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /100/, 'a mensagem nao diz quanto foi enviado');
        assert.match(e.message, /140/, 'a mensagem nao diz quanto este documento pede');
        return true;
      });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100, 'moveu saldo numa recusa');
  });

  await test('resultado em unidade diferente NAO conta no teto', async () => {
    // O erro que o desenho evita. A chapa saiu em KG; 400 pecas em UN nao estouram teto nenhum,
    // porque o teto e sobre `quantidade_consumida` (KG) e os resultados nao encostam nele.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PECA-UN' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 60,
        resultados: [{ material_id: pecaId, quantidade: 400, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual(r.status, 'RETORNO_PARCIAL');
    assert.strictEqual(r.pendente_total, 40, 'o teto contou as 400 pecas em UN');
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 40);
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 400);
  });

  await test('transformacao com um item invalido NAO aplica NENHUM item do lote', async () => {
    // Pre-checagem TOTAL, a forma da 8b: um documento com dois itens, um deles com material de
    // destino inexistente, nao pode transformar metade.
    const matA = await novoMaterial(db, { atual: 100, custo: 10, unidade: 'KG', cod: 'LOTE-A' });
    const matB = await novoMaterial(db, { atual: 100, custo: 10, unidade: 'KG', cod: 'LOTE-B' });
    const rem = await svc.criarRemessa(db, ADMIN, { fornecedor_nome: 'Corte Oeste',
      itens: [{ material_id: matA, quantidade: 100 }, { material_id: matB, quantidade: 100 }] });
    await svc.enviarRemessa(db, ADMIN, rem.id);
    const its = await dbAll(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [rem.id]);
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-LOTE' });

    await assert.rejects(() => svc.registrarTransformacao(db, ADMIN, rem.id, { itens: [
      { item_remessa_id: its[0].id, quantidade_consumida: 50,
        resultados: [{ material_id: pecaId, quantidade: 10, tipo_resultado: 'PECA' }] },
      { item_remessa_id: its[1].id, quantidade_consumida: 50,
        resultados: [{ material_id: 555555, quantidade: 10, tipo_resultado: 'PECA' }] },
    ] }), /555555/);

    assert.strictEqual((await saldos(db, matA)).quantidade_atual, 100, 'o item bom foi consumido numa recusa');
    assert.strictEqual((await saldos(db, matA)).em_terceiros, 100);
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 0);
  });

  await test('transformacao sem a acao remessar_terceiro falha com 403', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-403' });
    await assert.rejects(
      () => svc.registrarTransformacao(db, PRODUCAO, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 10,
          resultados: [{ material_id: pecaId, quantidade: 5, tipo_resultado: 'PECA' }] }] }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 100);
  });

  await test('[CONTROLE POSITIVO] ALMOXARIFE, que tem a acao, transforma normalmente', async () => {
    // Sem isto, `throw 403 sempre` passaria no teste acima e a funcao nunca funcionaria.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, unidade: 'UN', cod: 'PECA-ALMOX' });
    const r = await svc.registrarTransformacao(db, ALMOXARIFE, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: pecaId, quantidade: 20, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 'ENCERRADA');
  });

  await test('transformacao em remessa que nunca foi enviada e recusada', async () => {
    const m = await novoMaterial(db, { atual: 10, unidade: 'KG', cod: 'ABERTA-CHAPA' });
    const rem = await svc.criarRemessa(db, ADMIN, { fornecedor_nome: 'Corte Oeste',
      itens: [{ material_id: m, quantidade: 10 }] });
    const it = await dbGet(db,
      'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'PECA-ABERTA' });
    await assert.rejects(
      () => svc.registrarTransformacao(db, ADMIN, rem.id, {
        itens: [{ item_remessa_id: it.id, quantidade_consumida: 5,
          resultados: [{ material_id: pecaId, quantidade: 2, tipo_resultado: 'PECA' }] }] }),
      /ABERTA/);
    assert.strictEqual((await saldos(db, m)).quantidade_atual, 10);
  });

  await test('falha no credito da SEGUNDA peca devolve a chapa (patrimonio E retencao)', async () => {
    // A compensacao da decisao 9, e o teste mais importante desta task. Stuba o motor para falhar
    // no SEGUNDO RETORNO_TRANSFORMACAO — depois do consumo e depois do primeiro credito.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const p1 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'COMP-P1' });
    const p2 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'COMP-P2' });

    const original = stockService.registrarMovimentacao;
    let creditos = 0;
    stockService.registrarMovimentacao = async (dbx, u, params, opts) => {
      if (params.tipo === 'RETORNO_TRANSFORMACAO') {
        creditos += 1;
        if (creditos === 2) throw Object.assign(new Error('falha simulada no segundo credito'), { status: 500 });
      }
      return original(dbx, u, params, opts);
    };
    try {
      await assert.rejects(() => svc.registrarTransformacao(db, ADMIN, remessa.id, {
        itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
          { material_id: p1, quantidade: 20, tipo_resultado: 'PECA' },
          { material_id: p2, quantidade: 20, tipo_resultado: 'PECA' },
        ] }] }), /falha simulada/);
    } finally {
      stockService.registrarMovimentacao = original;
    }

    // A chapa voltou INTEIRA: patrimonio E retencao.
    const chapa = await saldos(db, materialId);
    assert.strictEqual(chapa.quantidade_atual, 100, 'a chapa nao voltou ao patrimonio');
    assert.strictEqual(chapa.em_terceiros, 100,
      'a retencao NAO voltou — o estorno do livro nao a recria (stockService.js:1380-1387) e a '
      + 'compensacao precisa do UPDATE suplementar');
    // O credito que passou foi desfeito, e o custo dele tambem.
    const q1 = await saldos(db, p1);
    assert.strictEqual(q1.quantidade_atual, 0, 'a primeira peca ficou creditada');
    assert.strictEqual(q1.custo_medio, 0,
      'o custo medio da primeira peca ficou movido por uma transformacao que nao aconteceu');
    // O claim do item voltou.
    const it = await dbGet(db,
      'SELECT quantidade_retornada FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(Number(it.quantidade_retornada || 0), 0, 'o claim do item nao foi devolvido');
    // Nenhuma linha de resultado orfa.
    const n = await dbGet(db,
      'SELECT COUNT(*) AS n FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(n.n, 0, 'sobrou linha de resultado de uma transformacao que falhou');
  });

  await test('depois da falha, a MESMA transformacao pode ser refeita e funciona', async () => {
    // O teste decisivo da contradicao C6 do plano. "Os numeros voltaram" nao basta: se a retencao
    // nao voltar, o item fica pendente com zero retencao e a proxima tentativa bate na guarda
    // `COALESCE(quantidade_em_terceiros,0) >= ?` do claim duplo, PARA SEMPRE.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const p1 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'RETRY-P1' });
    const p2 = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'RETRY-P2' });
    const corpo = { itens: [{ item_remessa_id: itemId, quantidade_consumida: 100, resultados: [
      { material_id: p1, quantidade: 20, tipo_resultado: 'PECA' },
      { material_id: p2, quantidade: 20, tipo_resultado: 'PECA' },
    ] }] };

    const original = stockService.registrarMovimentacao;
    let creditos = 0;
    stockService.registrarMovimentacao = async (dbx, u, params, opts) => {
      if (params.tipo === 'RETORNO_TRANSFORMACAO') {
        creditos += 1;
        if (creditos === 2) throw Object.assign(new Error('falha simulada'), { status: 500 });
      }
      return original(dbx, u, params, opts);
    };
    try {
      await assert.rejects(() => svc.registrarTransformacao(db, ADMIN, remessa.id, corpo), /falha simulada/);
    } finally {
      stockService.registrarMovimentacao = original;
    }

    // Agora de verdade.
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, corpo);
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 0);
    assert.strictEqual((await saldos(db, materialId)).em_terceiros, 0);
    assert.strictEqual((await saldos(db, p1)).quantidade_atual, 20);
    assert.strictEqual((await saldos(db, p2)).quantidade_atual, 20);
  });

  await test('transformacao parcial deixa o resto pendente e a remessa em RETORNO_PARCIAL', async () => {
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'PARC-P' });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 30,
        resultados: [{ material_id: pecaId, quantidade: 12, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 'RETORNO_PARCIAL');
    assert.strictEqual(r.pendente_total, 70);
    const c = await saldos(db, materialId);
    assert.strictEqual(c.quantidade_atual, 70, 'baixou mais (ou menos) do que o consumido');
    assert.strictEqual(c.em_terceiros, 70);
    // 30 kg a R$ 10 = R$ 300 em 12 pecas = 25 cada.
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 25);
  });

  await test('transformacao e RETORNO simples convivem no mesmo item', async () => {
    // Metade da chapa volta inteira (RETORNO_TERCEIRO, 8b) e a outra metade e cortada. Os dois
    // caminhos somam no MESMO teto do item, porque os dois estao na unidade do enviado.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'MISTO-P' });
    await svc.registrarRetorno(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade: 40 }] });
    const r = await svc.registrarTransformacao(db, ADMIN, remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 60,
        resultados: [{ material_id: pecaId, quantidade: 24, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 'ENCERRADA');
    assert.strictEqual(r.pendente_total, 0);
    const c = await saldos(db, materialId);
    // 40 voltaram (retencao desceu, patrimonio nao mudou) e 60 foram consumidos (as duas desceram).
    assert.strictEqual(c.quantidade_atual, 40);
    assert.strictEqual(c.em_terceiros, 0);
    // As linhas de resultado convivem: a da 8b com tipo_resultado NULL, a da 8c com 'PECA'.
    const linhas = await dbAll(db,
      'SELECT tipo_resultado FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.deepStrictEqual(linhas.map((l) => l.tipo_resultado), [null, 'PECA']);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: os 21 testes novos falham com `svc.registrarTransformacao is not a function`; os **14** das
Tasks 3 e 5 continuam passando. Rodapé esperado: `14 passed, 21 failed`.

- [ ] **Step 3: Implementar**

Em `server/services/almoxarifado/thirdPartyService.js`, acrescentar aos `require` do topo
(logo abaixo de `const stockService = require('./stockService');`):

```js
const ownerRules = require('./ownerRules');
const transformCost = require('./transformCost');
```

E, antes do `module.exports` (`:676`):

```js
/**
 * Desfaz o que ja entrou quando uma transformacao falha no meio (decisao 9 do design).
 *
 * A ORDEM E A INVERSA DA APLICACAO, e ela e decidida no design: baixa a chapa primeiro, credita as
 * pecas depois; entao a compensacao estorna os creditos e SO DEPOIS devolve a chapa. A ordem
 * inversa na aplicacao (creditar primeiro) criaria, na falha, pecas SEM baixa — estoque do nada,
 * que e o pior dos dois estados.
 *
 * ── Por que o estorno do livro NAO basta, e o que este UPDATE suplementar conserta ──
 *
 * cancelarMovimentacao de um CONSUMO_TERCEIRO credita `quantidade_atual` e NAO recria
 * `quantidade_em_terceiros` — deliberadamente (stockService.js:1380-1387), porque LA a remessa ja
 * esta ENCERRADA e recriar a retencao seria um hold sem remessa viva por tras.
 *
 * AQUI a premissa e falsa: a remessa esta VIVA e o claim do item esta voltando. Sem a retencao de
 * volta, o item fica pendente com ZERO retencao, e a proxima tentativa bate na guarda
 * `COALESCE(quantidade_em_terceiros,0) >= ?` do claim duplo (stockService.js:996) PARA SEMPRE — a
 * remessa nunca mais poderia ser transformada. Por isso a compensacao e estorno-do-livro (que
 * mantem o livro honesto, com linha de ESTORNO de verdade) MAIS o UPDATE que devolve so a retencao.
 *
 * ── Por que o custo e restaurado a mao ──
 *
 * O estorno NAO reverte custo, por decisao explicita da Etapa 1 (stockService.js:1548-1550), e essa
 * decisao esta certa para um estorno de VERDADE (o evento aconteceu; reverter custo medio depois de
 * movimentos intermediarios e mal-definido). Aqui e outra coisa: e a compensacao de um evento que
 * NAO aconteceu. Deixar o custo movido faria uma transformacao que falhou mudar o custo medio da
 * peca para sempre. O valor restaurado e o lido ANTES do primeiro credito daquele material — por
 * isso `custosAnteriores` guarda por material e so na PRIMEIRA vez que o material aparece (um mesmo
 * material pode aparecer em duas linhas de resultado).
 *
 * Todo passo e `.catch(() => {})` menos o ultimo: compensacao que falha no meio nao pode esconder o
 * erro ORIGINAL, que e o que interessa a quem chamou. O ultimo (devolver o claim) fica sem catch de
 * proposito — se ele falhar, o item ficaria com pendencia menor do que a real, e isso e pior do que
 * mascarar o erro original.
 */
async function compensarTransformacao(db, user, { creditos, custosAnteriores, movConsumo, item, consumida }) {
  const motivo = 'Compensacao automatica: a transformacao falhou no meio e foi desfeita';

  for (const c of [...creditos].reverse()) {
    if (c.linhaId) {
      await dbRun(db, 'DELETE FROM retornos_remessa_item_almoxarifado WHERE id = ?', [c.linhaId]).catch(() => {});
    }
    await stockService.cancelarMovimentacao(db, user, c.movId, motivo).catch(() => {});
  }
  for (const [materialId, c] of custosAnteriores) {
    await dbRun(db, `UPDATE materiais_almoxarifado
      SET custo_medio = ?, custo_unitario = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [c.custo_medio, c.custo_unitario, materialId]).catch(() => {});
  }
  if (movConsumo && movConsumo.id) {
    await stockService.cancelarMovimentacao(db, user, movConsumo.id, motivo).catch(() => {});
    await dbRun(db, `UPDATE materiais_almoxarifado
      SET quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [consumida, item.material_id]).catch(() => {});
  }
  await dbRun(db, `UPDATE itens_remessa_terceiro_almoxarifado
    SET quantidade_retornada = MAX(0, COALESCE(quantidade_retornada,0) - ?) WHERE id = ?`,
  [consumida, item.id]);
}

/**
 * Registra uma TRANSFORMACAO: a chapa deixa de existir e as pecas entram (Etapa 8c).
 *
 * ── A diferenca de natureza em relacao a registrarRetorno ──
 *
 * O RETORNO da 8b nao credita estoque: `quantidade_em_terceiros` desce e `quantidade_atual` nao
 * muda, porque o material nunca saiu do patrimonio — ele so estava a 40 km. AQUI a chapa DEIXA DE
 * EXISTIR: sai do patrimonio E da retencao (CONSUMO_TERCEIRO, claim duplo no mesmo UPDATE) e as
 * pecas ENTRAM como material novo (RETORNO_TRANSFORMACAO). Dois efeitos de sinais opostos em
 * MATERIAIS DIFERENTES.
 *
 * ── Os dois numeros que a decisao 1 separa, e por que ──
 *
 * `quantidade_consumida` esta SEMPRE na unidade do ENVIADO e e a unica coisa que conta no teto do
 * item — o teto da 8b continua valendo, intacto. `resultados[]` tem cada um a SUA unidade e NENHUM
 * deles encosta no teto. Comparar 40 pecas (UN) com uma chapa de 100 (KG) seria somar laranja com
 * maca, e o criterio de "liquidado" que decide ENCERRADA vs RETORNO_PARCIAL continua quantitativo
 * sobre o item enviado. Zero mudanca na maquina de estados.
 *
 * `validarRetornoDoItem` e chamado SEM `materialId` de proposito: e nele que mora a recusa de
 * material diferente (a mensagem que aponta esta etapa), e ela continua valendo para
 * registrarRetorno. Quem abre a transformacao e ESTA funcao, com a baixa da chapa junto — que e
 * justamente o que faltava para "creditar outro material" nao ser estoque do nada.
 *
 * ── Sem transacao (decisao 9) ──
 *
 * PRE-CHECAGEM de TUDO (todos os itens, todos os resultados, o dono de cada par, o rateio inteiro)
 * antes de mover qualquer coisa; claim no WHERE do item; compensacao explicita no catch. A
 * pre-checagem agrega pelo RECURSO ESCASSO (o pendente do item), nunca pela linha do documento —
 * regra da Task 5 da 8b, onde duas linhas de 60 de um item de 100 passavam as duas.
 */
async function registrarTransformacao(db, user, remessaId, data) {
  assertPodeRemessar(user);
  const remessa = await getRemessaBase(db, remessaId);
  if (!sm.PODE_RECEBER_RETORNO.includes(remessa.status)) {
    throw erro(`Remessa em ${remessa.status} nao recebe transformacao `
      + `(recebem: ${sm.PODE_RECEBER_RETORNO.join(', ')})`);
  }
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  if (itens.length === 0) throw erro('Informe ao menos um item transformado');

  // ── 1. Pre-checagem: o documento INTEIRO e recusado antes de mover qualquer coisa ──
  const linhasPorItem = new Map();
  for (const linha of itens) {
    const k = Number(linha.item_remessa_id);
    linhasPorItem.set(k, (linhasPorItem.get(k) || 0) + 1);
  }
  const validados = [];
  const jaPedido = new Map();
  for (const linha of itens) {
    const chave = Number(linha.item_remessa_id);
    const acumulado = jaPedido.get(chave) || 0;
    const consumida = Number(linha.quantidade_consumida);
    // materialId OMITIDO: ver o docstring. O teto e sobre a unidade do ENVIADO.
    const item = await validarRetornoDoItem(db, {
      remessaId,
      itemRemessaId: linha.item_remessa_id,
      quantidade: consumida + acumulado,
      linhas: linhasPorItem.get(chave) || 1,
    });
    jaPedido.set(chave, acumulado + consumida);

    const materialOrigem = await dbGet(db, `SELECT id, codigo, nome, unidade, peso_unitario,
        proprietario_cliente_id, COALESCE(custo_medio, custo_unitario, 0) AS custo
      FROM materiais_almoxarifado WHERE id = ?`, [item.material_id]);

    const resultados = Array.isArray(linha.resultados) ? linha.resultados : [];
    if (resultados.length === 0) {
      throw erro(`A transformacao do item ${materialOrigem.codigo} precisa de ao menos um `
        + 'resultado (peca ou sobra) — se a chapa voltou inteira, use o retorno simples');
    }

    const resolvidos = [];
    for (const r of resultados) {
      const matRes = await dbGet(db, `SELECT id, codigo, nome, unidade, peso_unitario, ativo,
          proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?`, [r.material_id]);
      // Decisao 6: o motor NAO cria material. Precedente do modulo — o recebimento tambem nao
      // (receiptService.js:44-50). Criar material implicitamente a partir de um formulario de
      // retorno produziria cadastro-lixo a cada erro de digitacao, e cadastro-lixo em almoxarifado
      // nao se apaga: ele ganha saldo. A mensagem ENSINA O CAMINHO em vez de so recusar.
      if (!matRes) {
        throw erro(`O material ${r.material_id} do resultado nao existe. Cadastre o material `
          + 'resultante primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material '
          + 'resultante" na tela de Remessas) e refaca a transformacao — o sistema nao cria '
          + 'material sozinho a partir de um formulario de retorno.');
      }
      if (!matRes.ativo) {
        throw erro(`O material ${matRes.codigo} do resultado esta inativo — reative o cadastro `
          + 'antes de transformar para ele');
      }
      if (Number(matRes.id) === Number(item.material_id)) {
        throw erro(`O resultado ${matRes.codigo} e o MESMO material da chapa enviada. Chapa que `
          + 'volta como ela mesma nao e transformacao: use o retorno simples da remessa.');
      }
      // Decisao 3: a peca tem de ter o mesmo dono da chapa. Sem excecao.
      await ownerRules.assertMesmoDonoNaTransformacao(db, materialOrigem, matRes);
      resolvidos.push({ ...r, material_id: matRes.id, material: matRes });
    }

    // O rateio roda AQUI, na pre-checagem: se ele recusar (quantidade zero, classificacao invalida),
    // recusa antes de qualquer efeito. E o resultado ja fica pronto para a fase 2.
    const rateio = transformCost.ratearCusto({
      custoUnitarioChapa: Number(materialOrigem.custo || 0),
      quantidadeConsumida: consumida,
      custoServico: Number(linha.custo_servico || 0),
      resultados: resolvidos,
    });

    validados.push({ item, linha, consumida, materialOrigem, rateio });
  }

  // ── 2. Efeito, item a item ──
  const efetivados = [];
  for (const v of validados) {
    const { item, linha, consumida, materialOrigem, rateio } = v;

    const claim = await dbGet(db, `UPDATE itens_remessa_terceiro_almoxarifado
      SET quantidade_retornada = COALESCE(quantidade_retornada,0) + ?
      WHERE id = ? AND (quantidade - COALESCE(quantidade_retornada,0)) >= ?
      RETURNING id`, [consumida, item.id, consumida]);
    if (!claim) {
      // Corrida com outro documento concorrente do mesmo item: a pre-checagem passou, o claim nao.
      throw erro(`Transformacao acima do enviado no item ${item.material_codigo}: outro documento `
        + 'foi registrado ao mesmo tempo. Recarregue a remessa e tente de novo.');
    }

    const creditos = [];
    const custosAnteriores = new Map();
    let movConsumo = null;
    try {
      // 2a. BAIXA A CHAPA PRIMEIRO (decisao 9). CONSUMO_TERCEIRO ja existe desde a 8b e faz
      // exatamente o que a chapa precisa: baixa quantidade_atual E quantidade_em_terceiros no MESMO
      // UPDATE, com claim duplo (stockService.js:984-1006). Nenhuma alteracao no motor foi
      // necessaria para esta metade.
      //
      // A justificativa carrega o que NAO tem coluna: o custo do servico do terceiro e o valor sem
      // destino quando nao houve peca nenhuma. Nao ha coluna de custo no ledger (decisao 10) e nao
      // ha coluna de servico na linha de resultado (seria repetida por linha, e qualquer SUM()
      // ingenuo contaria N vezes) — a justificativa e o lugar auditavel que sobra.
      const extras = [];
      if (rateio.valorServico > 0) extras.push(`servico do terceiro R$ ${rateio.valorServico}`);
      if (rateio.quantidadePecas === 0 && rateio.residuo > 0) {
        extras.push(`R$ ${rateio.residuo} sem destino (nenhuma peca no resultado — so sobra)`);
      }
      movConsumo = await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'CONSUMO_TERCEIRO',
        quantidade: consumida,
        lote_id: linha.lote_id || item.lote_id || undefined,
        referencia: remessa.numero,
        documento_vinculado: data.nota_fiscal || undefined,
        justificativa: `Transformacao da remessa ${remessa.numero}: ${consumida} `
          + `${materialOrigem.unidade || ''} de ${materialOrigem.codigo} viraram `
          + `${rateio.linhas.length} resultado(s)`
          + (extras.length ? ` — ${extras.join('; ')}` : ''),
      });

      // 2b. CREDITA OS RESULTADOS.
      for (const l of rateio.linhas) {
        const mid = Number(l.material_id);
        // Guarda o custo ANTES do primeiro credito daquele material — e o que a compensacao
        // restaura. So na primeira vez: o mesmo material pode aparecer em duas linhas.
        if (!custosAnteriores.has(mid)) {
          const c = await dbGet(db, `SELECT COALESCE(custo_medio,0) AS custo_medio,
            COALESCE(custo_unitario,0) AS custo_unitario FROM materiais_almoxarifado WHERE id = ?`, [mid]);
          custosAnteriores.set(mid, c);
        }
        const mov = await stockService.registrarMovimentacao(db, user, {
          material_id: mid,
          tipo: 'RETORNO_TRANSFORMACAO',
          quantidade: Number(l.quantidade),
          // `undefined` e nao 0 quando nao ha custo: o motor so mexe em custo com `custoInformado
          // > 0` (stockService.js:1031), e mandar 0 explicitamente sugeriria que o custo foi
          // zerado de proposito. A SOBRA passa por aqui — e por isso que ela NAO apaga o custo
          // que o material dela ja tinha.
          custo_unitario: l.custo_unitario_aplicado > 0 ? l.custo_unitario_aplicado : undefined,
          lote_id: l.lote_id || undefined,
          referencia: remessa.numero,
          documento_vinculado: data.nota_fiscal || undefined,
          justificativa: `Transformacao da remessa ${remessa.numero}: ${consumida} `
            + `${materialOrigem.unidade || ''} de ${materialOrigem.codigo} viraram `
            + `${l.quantidade} ${l.material.unidade || ''} de ${l.material.codigo} (${l.tipo_resultado})`,
        });
        const registro = { movId: mov.id, materialId: mid, linhaId: null };
        creditos.push(registro);
        const ins = await dbRun(db, `INSERT INTO retornos_remessa_item_almoxarifado
          (remessa_id, item_remessa_id, material_id, quantidade, lote_id, nota_fiscal, observacoes,
           movimentacao_id, recebido_por, recebido_por_nome,
           tipo_resultado, custo_unitario_aplicado, movimentacao_consumo_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
          remessaId, item.id, mid, Number(l.quantidade), l.lote_id || null,
          data.nota_fiscal || null, l.observacoes || null,
          mov.id, user.id, user.nome || user.email,
          l.tipo_resultado, l.custo_unitario_aplicado, movConsumo.id,
        ]);
        registro.linhaId = ins.lastID;
      }
    } catch (e) {
      await compensarTransformacao(db, user, {
        creditos, custosAnteriores, movConsumo, item, consumida,
      });
      throw e;
    }

    efetivados.push({
      item_remessa_id: item.id,
      material_codigo: materialOrigem.codigo,
      valor_base: rateio.valorBase,
      valor_servico: rateio.valorServico,
      valor_total: rateio.valorTotal,
      custo_unitario_peca: rateio.custoUnitarioPeca,
      residuo: rateio.residuo,
      resultados: rateio.linhas.length,
    });
  }

  // ── 3. Status: MESMO criterio da 8b, e e por isso que a decisao 1 separou os dois numeros ──
  const { pendente } = await dbGet(db, `SELECT
      COALESCE(SUM(quantidade - COALESCE(quantidade_retornada,0)), 0) AS pendente
    FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?`, [remessaId]);
  const novoStatus = Number(pendente) <= 0 ? 'ENCERRADA' : 'RETORNO_PARCIAL';
  const t = sm.validarTransicao(remessa.status, novoStatus);
  if (!t.ok) throw erro(t.erro);
  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP,
        encerrado_em = CASE WHEN ? = 'ENCERRADA' THEN CURRENT_TIMESTAMP ELSE encerrado_em END,
        encerrado_por = CASE WHEN ? = 'ENCERRADA' THEN ? ELSE encerrado_por END
    WHERE id = ?`, [novoStatus, novoStatus, novoStatus, user.id, remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro',
    entidade_id: Number(remessaId),
    acao: 'TRANSFORMACAO',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status },
    dados_novos: {
      status: novoStatus,
      transformacoes: efetivados.length,
      resultados: efetivados.reduce((a, e) => a + e.resultados, 0),
      pendente_total: Number(pendente),
      nota_fiscal: data.nota_fiscal || null,
      custo: efetivados,
    },
  }).catch(() => {});

  return {
    success: true,
    remessa_id: Number(remessaId),
    status: novoStatus,
    transformacoes: efetivados.length,
    resultados: efetivados.reduce((a, e) => a + e.resultados, 0),
    pendente_total: Number(pendente),
    custo: efetivados,
  };
}
```

E no `module.exports` (`:676-681`), acrescentar `registrarTransformacao`:

```js
module.exports = {
  DESTINOS_ENCERRAMENTO, TIPO_MOVIMENTO_DESTINO,
  criarRemessa, enviarRemessa, getRemessa, listarRemessas,
  validarRetornoDoItem, registrarRetorno, registrarTransformacao,
  pendentesDaRemessa, encerrarRemessa, cancelarRemessa,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: `35 passed, 0 failed`

Run: `cd server && npm run test:api` · `npm run test:almoxarifado`
Expected: todos OK.

- [ ] **Step 5: SABOTAGEM**

**S1 — a ordem se inverte: credita primeiro, baixa depois** (a decisão 9 vira nada). Não há um
`sed` limpo para trocar dois blocos de lugar — **use a ferramenta Edit** movendo o bloco
`movConsumo = await stockService.registrarMovimentacao(...CONSUMO_TERCEIRO...)` para **depois** do
laço `for (const l of rateio.linhas)`. Substitua `movConsumo.id` no INSERT por `null`
temporariamente. Depois:

```bash
cd server
md5sum services/almoxarifado/thirdPartyService.js
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/thirdPartyService.js
md5sum services/almoxarifado/thirdPartyService.js
git diff --stat
```
Esperado: **`✗ falha no credito da SEGUNDA peca devolve a chapa (patrimonio E retencao)`** — a chapa
nunca foi baixada, então `quantidade_atual` fica 100 (a asserção passa por acidente) mas
`a primeira peca ficou creditada` cai, porque `movConsumo` é `null` e a compensação do crédito ainda
roda… **confira a saída real**. Se a única falha for a de `movimentacao_consumo_id`, escreva no
plano que **a ordem não tem teste próprio** e acrescente a asserção que falta:
```js
    // dentro de `a transformacao grava as tres colunas novas...`
    assert.ok(linhas[0].movimentacao_consumo_id < linhas[0].movimentacao_id,
      'a baixa da chapa nao aconteceu ANTES do credito da peca (decisao 9): os ids do ledger '
      + 'dizem a ordem real, e credito antes de baixa cria peca sem baixa na falha');
```
**Acrescente essa asserção de qualquer forma** — ela é barata e é a única que mede a ordem.

**S2 — a compensação para de devolver a retenção** (prova a contradição C6):

```bash
cd server
grep -cF "SET quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) + ?, updated_at = CURRENT_TIMESTAMP" services/almoxarifado/thirdPartyService.js  # TEM de dar 1
md5sum services/almoxarifado/thirdPartyService.js
perl -0pi -e "s/await dbRun\(db, \`UPDATE materiais_almoxarifado\n      SET quantidade_em_terceiros = COALESCE\(quantidade_em_terceiros,0\) \+ \?, updated_at = CURRENT_TIMESTAMP\n      WHERE id = \?\`, \[consumida, item\.material_id\]\)\.catch\(\(\) => \{\}\);//" services/almoxarifado/thirdPartyService.js
md5sum services/almoxarifado/thirdPartyService.js   # TEM de diferir
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/thirdPartyService.js
md5sum services/almoxarifado/thirdPartyService.js
git diff --stat
```
Esperado: **duas** falhas, e a segunda é a que importa —
`✗ falha no credito da SEGUNDA peca devolve a chapa (patrimonio E retencao): a retencao NAO voltou — o estorno do livro nao a recria`
e **`✗ depois da falha, a MESMA transformacao pode ser refeita e funciona`** (o retry bate na guarda
do claim duplo). Se a segunda **não** falhar, o teste de retry é decorativo — **achado**.

**S3 — a compensação para de restaurar o custo:**

```bash
cd server
grep -cF "SET custo_medio = ?, custo_unitario = ?, updated_at = CURRENT_TIMESTAMP" services/almoxarifado/thirdPartyService.js  # TEM de dar 1
md5sum services/almoxarifado/thirdPartyService.js
perl -0pi -e "s/for \(const \[materialId, c\] of custosAnteriores\) \{/for (const [materialId, c] of []) {/" services/almoxarifado/thirdPartyService.js
md5sum services/almoxarifado/thirdPartyService.js
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/thirdPartyService.js
md5sum services/almoxarifado/thirdPartyService.js
git diff --stat
```
Esperado: **`✗ falha no credito da SEGUNDA peca devolve a chapa: o custo medio da primeira peca ficou movido por uma transformacao que nao aconteceu`**.

**S4 — a pré-checagem passa a ser por linha e não total** (prova o "tudo ou nada"):

```bash
cd server
grep -cF "const resolvidos = [];" services/almoxarifado/thirdPartyService.js   # TEM de dar 1
```
> A sabotagem aqui é mover o bloco `── 2. Efeito` para **dentro** do laço da pré-checagem. Não há
> `sed` para isso — **use Edit**, ou faça a sabotagem equivalente e mais simples: trocar
> `if (!matRes) { throw erro(...) }` por `if (!matRes) { continue; }`. Depois:
> ```bash
> cd server && node tests/api/transformacaoTerceiro.api.test.js
> git checkout -- services/almoxarifado/thirdPartyService.js && git diff --stat
> ```
Esperado: **`✗ peca de material inexistente falha ensinando o caminho`** e
**`✗ transformacao com um item invalido NAO aplica NENHUM item do lote`**.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/thirdPartyService.js \
        server/tests/api/transformacaoTerceiro.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 7: registrarTransformacao — a chapa deixa de existir e as pecas entram

Ate aqui o sistema recusava a transformacao explicitamente, num ponto so, com uma mensagem que
apontava esta etapa. Sem ela a GMP tinha duas saidas ruins: registrar o retorno como se a chapa
tivesse voltado inteira (o estoque passa a ter uma chapa que nao existe) ou nao registrar (o material
some do controle no momento em que vira produto). As duas mentem no inventario.

Metade ja estava pronta desde a 8b: CONSUMO_TERCEIRO baixa quantidade_atual E quantidade_em_terceiros
no MESMO UPDATE, com claim duplo. Nenhuma alteracao no motor foi necessaria para a baixa. O que esta
task acrescenta e a orquestracao: pre-checagem TOTAL, uma baixa, N creditos e compensacao.

ORDEM (decisao 9): baixa a chapa PRIMEIRO, credita as pecas DEPOIS. DESCARTADA a ordem inversa:
creditar primeiro criaria, na falha, pecas SEM baixa — estoque do nada, o pior dos dois estados, e
literalmente o que a mensagem de recusa da 8b dizia querer evitar.

CORRECAO DA DECISAO 9, achada ao conferir o motor: "devolve a chapa", tomado ao pe da letra com
cancelarMovimentacao, NAO devolve quantidade_em_terceiros — e isso e deliberado la
(stockService.js:1380-1387), porque naquele caminho a remessa ja esta ENCERRADA e recriar a retencao
seria hold sem remessa viva por tras. AQUI a remessa esta VIVA e o claim do item esta voltando: sem a
retencao de volta, o item fica pendente com zero retencao e a proxima tentativa bate na guarda
COALESCE(quantidade_em_terceiros,0) >= ? do claim duplo PARA SEMPRE. A compensacao e
estorno-do-livro (linha de ESTORNO de verdade) MAIS um UPDATE que devolve so a retencao. O teste
decisivo nao e "os numeros voltaram" e sim "a retransformacao depois da falha funciona".

A compensacao tambem RESTAURA O CUSTO a mao, contrariando a decisao da Etapa 1 de o estorno nao
reverter custo — e a contradicao e aparente: aquela decisao vale para estorno de VERDADE (o evento
aconteceu), e aqui e a compensacao de um evento que NAO aconteceu. Deixar o custo movido faria uma
transformacao que falhou mudar o custo medio da peca para sempre.

validarRetornoDoItem e chamado SEM materialId de proposito: e nele que mora a recusa de material
diferente, e ela continua valendo para registrarRetorno. Quem abre a transformacao e esta funcao,
COM a baixa da chapa junto — que e justamente o que faltava para "creditar outro material" nao ser
estoque do nada.

Os dois numeros da decisao 1 (quantidade_consumida na unidade do enviado, resultados[] cada um na
sua) deixam o teto da 8b INTACTO e a maquina de estados sem uma linha de mudanca.

DESCARTADO criar o material resultante quando ele nao existe (decisao 6): cadastro-lixo em
almoxarifado nao se apaga, ele ganha saldo. A recusa ENSINA o caminho, e a tela oferece o atalho
explicito.
DESCARTADO aceitar como resultado o MESMO material da chapa: seria o retorno simples por outra porta,
com contabilidade de custo diferente (um rateia, o outro nao).

Testes: 21 novos (35 no arquivo), incluindo os dois de compensacao com o motor stubado, o de retry
depois da falha, o bilateral de permissao e o de convivencia entre retorno simples e transformacao no
mesmo item.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 8: rendimento informativo (decisão 7) + a rota + o schema Zod

**A decisão 7, e por que ela não bloqueia.** `chapa consumida = peças + sobra + perda` só é
verificável se **todos** os materiais envolvidos tiverem `peso_unitario`, e eles não têm. Bloquear
com base num dado **opcional** trava o operador por um campo de cadastro em branco. Quando todos têm
peso, o sistema calcula o **rendimento** (peso que voltou ÷ peso que saiu) e mostra na tela e no
retorno da API. Quando não tem, diz `"rendimento nao calculavel"` **dizendo qual material falta**.
Nunca recusa, nunca estima.

**Files:**
- Modify: `server/services/almoxarifado/transformCost.js` — `calcularRendimento` + export
- Modify: `server/services/almoxarifado/thirdPartyService.js` — `registrarTransformacao` passa a
  devolver `rendimento`
- Modify: `server/services/almoxarifado/schemas.js` — `TransformacaoRemessaSchema` + export
- Modify: `server/routes/almoxarifado/extended.js` — `POST /remessas-terceiros/:id/transformacoes`
  e o `require` do schema (`:10`)
- Test: `server/tests/api/transformacaoTerceiro.api.test.js` (bloco `══ Task 8 ══`) e
  `server/tests/api/transformCost.api.test.js` (bloco de rendimento)

**Interfaces:**
- Produces:
  - `transformCost.calcularRendimento({ materialOrigem, quantidadeConsumida, resultados })` — puro.
    `materialOrigem` precisa de `{ codigo, peso_unitario }`; cada resultado precisa de
    `{ quantidade, material: { codigo, peso_unitario } }`. Devolve
    `{ calculavel: true, peso_saida, peso_retorno, rendimento_percentual }` **ou**
    `{ calculavel: false, motivo, materiais_sem_peso: [codigos] }`.
  - `registrarTransformacao` passa a incluir `rendimento: [{ item_remessa_id, material_codigo, ...res }]`
  - `schemas.TransformacaoRemessaSchema`
  - `POST /api/almoxarifado/remessas-terceiros/:id/transformacoes` (gate `remessar_terceiro`)
- Consumes: `ResultadoTransformacaoSchema` (Task 3); `registrarTransformacao` (Task 7).

**Sobre a ordem das rotas:** `/vencidas` tem de continuar **antes** de `/:id` (comentário literal em
`extended.js:891-893`). A rota nova é `/:id/transformacoes` — está sob `/:id/`, como
`/:id/retornos`, e **não** compete com `/vencidas`. Registre-a **logo depois** de `/:id/retornos`,
para as duas irmãs ficarem juntas.

---

- [ ] **Step 1: Escrever os testes que falham (parte A — a função pura)**

Acrescentar a `server/tests/api/transformCost.api.test.js`, **antes** do `console.log` final:

```js
  // ── rendimento (decisao 7): informativo, nunca bloqueia ────────────────────────────────────
  const { calcularRendimento } = require('../../services/almoxarifado/transformCost');
  const comPeso = (codigo, peso_unitario) => ({ codigo, peso_unitario });

  await test('rendimento: com todos os pesos, calcula peso que saiu, peso que voltou e o percentual', async () => {
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-001', 7.85),
      quantidadeConsumida: 100,
      resultados: [
        { quantidade: 40, material: comPeso('PC-010', 15) },
        { quantidade: 1, material: comPeso('SOB-001', 120) },
      ],
    });
    assert.strictEqual(r.calculavel, true);
    assert.strictEqual(r.peso_saida, 785);
    assert.strictEqual(r.peso_retorno, 720);
    assert.strictEqual(r.rendimento_percentual, 91.72);
  });

  await test('rendimento nao calculavel diz QUAL material nao tem peso', async () => {
    // "nao calculavel" seco manda o operador procurar em 41 cadastros. A mensagem NOMEIA.
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-001', 7.85),
      quantidadeConsumida: 100,
      resultados: [
        { quantidade: 40, material: comPeso('PC-010', null) },
        { quantidade: 1, material: comPeso('SOB-001', 120) },
      ],
    });
    assert.strictEqual(r.calculavel, false);
    assert.deepStrictEqual(r.materiais_sem_peso, ['PC-010']);
    assert.match(r.motivo, /PC-010/, 'a mensagem nao diz qual material falta');
    assert.match(r.motivo, /peso/i);
    assert.ok(!('rendimento_percentual' in r), 'estimou um rendimento sem ter os pesos');
  });

  await test('rendimento nao calculavel quando quem falta e a CHAPA', async () => {
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-SEMPESO', null),
      quantidadeConsumida: 100,
      resultados: [{ quantidade: 40, material: comPeso('PC-010', 15) }],
    });
    assert.strictEqual(r.calculavel, false);
    assert.deepStrictEqual(r.materiais_sem_peso, ['CHP-SEMPESO']);
  });

  await test('rendimento lista TODOS os materiais sem peso, nao so o primeiro', async () => {
    // Sem isto o operador conserta um cadastro, tenta de novo e descobre o segundo — e assim por
    // diante. Mesma licao da pre-checagem "tudo ou nada": diga tudo o que falta de uma vez.
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-X', null),
      quantidadeConsumida: 10,
      resultados: [
        { quantidade: 2, material: comPeso('A', null) },
        { quantidade: 2, material: comPeso('B', 5) },
        { quantidade: 2, material: comPeso('C', 0) },
      ],
    });
    assert.strictEqual(r.calculavel, false);
    // peso 0 conta como NAO cadastrado: peso zero nao existe fisicamente, e trata-lo como valido
    // daria rendimento 0% com cara de resultado.
    assert.deepStrictEqual(r.materiais_sem_peso, ['CHP-X', 'A', 'C']);
  });

  await test('[CONTROLE POSITIVO] rendimento acima de 100% e calculado, nao recusado', async () => {
    // O sistema NAO valida que os pesos fecham (decisao 7). Rendimento > 100% significa cadastro de
    // peso errado, e mostrar 116% e o que faz alguem ir conferir; recusar esconderia o problema.
    const r = calcularRendimento({
      materialOrigem: comPeso('CHP-001', 1),
      quantidadeConsumida: 100,
      resultados: [{ quantidade: 116, material: comPeso('PC', 1) }],
    });
    assert.strictEqual(r.calculavel, true);
    assert.strictEqual(r.rendimento_percentual, 116);
  });
```

- [ ] **Step 2: Escrever os testes que falham (parte B — rotas e schema)**

Acrescentar a `server/tests/api/transformacaoTerceiro.api.test.js`, **antes** do `await close()`.
Este bloco precisa do `app` e do `setUser`, então **a linha de abertura do arquivo tem de mudar** de
`const { db, close } = await createTestApp({ user: ADMIN });` para:

```js
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
```

e o `require` do `supertest` entra no topo do arquivo:

```js
const request = require('supertest');
```

Bloco novo:

```js
  // ══ Task 8 — rota, schema Zod e rendimento ══════════════════════════════════════════════════

  const BASE = '/api/almoxarifado/remessas-terceiros';
  const transformar = (remessaId, body) => request(app).post(`${BASE}/${remessaId}/transformacoes`).send(body);

  await test('[rota] a transformacao acontece pela rota e devolve o custo rateado', async () => {
    setUser(ADMIN);
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ROTA-P' });
    const r = await transformar(remessa.id, {
      nota_fiscal: 'NF-ROTA-1',
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
        resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual(r.status, 200, `a rota devolveu ${r.status}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'ENCERRADA');
    assert.strictEqual(r.body.custo[0].custo_unitario_peca, 25);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 0);
    assert.strictEqual((await saldos(db, pecaId)).quantidade_atual, 40);
  });

  await test('[rota] sem a acao remessar_terceiro: 403, e o campo `acao` na resposta', async () => {
    // Assere o CAMPO e nao so o status: hoje `movimentar` e `remessar_terceiro` tem os mesmos
    // perfis, entao trocar um gate pelo outro nao mudaria status nenhum e a regressao passaria
    // despercebida. Licao registrada na Task 8 da 8b.
    const { remessa, itemId, materialId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { unidade: 'UN', cod: 'ROTA-403' });
    setUser(PRODUCAO);
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 10, resultados: [{ material_id: pecaId, quantidade: 5, tipo_resultado: 'PECA' }] }] });
    setUser(ADMIN);
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.acao, 'remessar_terceiro',
      `o 403 veio de outro gate: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 100);
  });

  await test('[schema] tipo_resultado ATRAVESSA o Zod — a sobra chega como SOBRA no banco', async () => {
    // A armadilha: z.object DESCARTA chave nao declarada EM SILENCIO. Sem `tipo_resultado`
    // declarado, TODO resultado chegaria como undefined ao servico — o rateio recusaria tudo (ou,
    // pior, com um default, a sobra viraria peca e entraria carregando rateio).
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-P' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'ZOD-S' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 10, tipo_resultado: 'SOBRA' },
      ] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linhas = await dbAll(db,
      'SELECT tipo_resultado, custo_unitario_aplicado FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ? ORDER BY id', [itemId]);
    assert.deepStrictEqual(linhas.map((l) => l.tipo_resultado), ['PECA', 'SOBRA']);
    assert.strictEqual(linhas[1].custo_unitario_aplicado, 0);
  });

  await test('[schema] custo_servico ATRAVESSA o Zod e muda o custo da peca', async () => {
    // Campo de nivel de ITEM (nao de resultado) — o candidato obvio a ser esquecido no schema.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-SRV' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, custo_servico: 400,
      resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await saldos(db, pecaId)).custo_medio, 35,
      'custo_servico foi descartado pelo schema em silencio (custo ficou 25 e nao 35)');
  });

  await test('[schema] lote_id e observacoes do resultado ATRAVESSAM o Zod', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-LOTE' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [{ material_id: pecaId, quantidade: 40,
        tipo_resultado: 'PECA', observacoes: 'cortado em 4 chapas' }] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linha = await dbGet(db,
      'SELECT observacoes FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.observacoes, 'cortado em 4 chapas');
  });

  await test('[schema] resultado NAO declarado no Zod nao chega ao servico', async () => {
    // A outra ponta da mesma armadilha: mandar `custo_unitario_aplicado` pela API nao pode deixar o
    // cliente escolher o custo da peca. O rateio manda, e a chave estranha e descartada.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'ZOD-EXTRA' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [{ material_id: pecaId, quantidade: 40,
        tipo_resultado: 'PECA', custo_unitario_aplicado: 999 }] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const linha = await dbGet(db,
      'SELECT custo_unitario_aplicado FROM retornos_remessa_item_almoxarifado WHERE item_remessa_id = ?', [itemId]);
    assert.strictEqual(linha.custo_unitario_aplicado, 25,
      'o cliente conseguiu ditar o custo da peca pela API');
  });

  await test('[schema] documento sem `resultados` e recusado pelo Zod com 400', async () => {
    const { remessa, itemId } = await chapaEnviada();
    const r = await transformar(remessa.id, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 10 }] });
    assert.strictEqual(r.status, 400);
  });

  await test('[rota] a mensagem do servico chega INTACTA ao cliente', async () => {
    // As mensagens desta etapa dizem os numeros e os codigos de proposito; um catch generico as
    // apagaria. Nenhuma rota de remessa tem try/catch proprio com mensagem inventada — todas caem
    // em handleError, que respeita err.status e devolve err.message.
    const { remessa, itemId } = await chapaEnviada();
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 10, resultados: [{ material_id: 424242, quantidade: 5, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /424242/);
    assert.match(r.body.error, /cadastr/i);
  });

  await test('[rendimento] com todos os pesos, a resposta traz o percentual', async () => {
    const { remessa, itemId } = await remessaEnviada(db, { qtd: 100, custo: 10, unidade: 'KG', peso: 7.85 });
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', peso: 15, cod: 'REND-P' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', peso: 120, cod: 'REND-S' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 1, tipo_resultado: 'SOBRA' },
      ] }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.rendimento[0].calculavel, true);
    assert.strictEqual(r.body.rendimento[0].peso_saida, 785);
    assert.strictEqual(r.body.rendimento[0].rendimento_percentual, 91.72);
  });

  await test('[rendimento] NUNCA bloqueia: sem peso, a transformacao acontece do mesmo jeito', async () => {
    // A decisao 7 inteira em um teste. Bloquear por um dado OPCIONAL travaria o operador por um
    // campo de cadastro em branco.
    const { remessa, itemId, materialId } = await chapaEnviada(); // sem peso
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'REND-SEMPESO' });
    const r = await transformar(remessa.id, { itens: [{ item_remessa_id: itemId,
      quantidade_consumida: 100, resultados: [{ material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' }] }] });
    assert.strictEqual(r.status, 200, `a transformacao foi BLOQUEADA por falta de peso: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await saldos(db, materialId)).quantidade_atual, 0);
    assert.strictEqual(r.body.rendimento[0].calculavel, false);
    assert.match(r.body.rendimento[0].motivo, /peso/i);
    assert.ok(r.body.rendimento[0].materiais_sem_peso.length > 0,
      'disse "nao calculavel" sem dizer QUAL material falta');
  });

  await test('[leitura] getRemessa devolve os resultados JA classificados', async () => {
    // A tela (Task 9) le daqui. getRemessa faz `SELECT rr.*`, entao as tres colunas novas viajam de
    // graca — este teste e o que impede alguem "otimizar" o SELECT para uma lista de colunas e
    // quebrar a tela em silencio.
    const { remessa, itemId } = await chapaEnviada();
    const pecaId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'UN', cod: 'GET-P' });
    const sobraId = await novoMaterial(db, { atual: 0, custo: 0, unidade: 'KG', cod: 'GET-S' });
    await transformar(remessa.id, { itens: [{ item_remessa_id: itemId, quantidade_consumida: 100,
      resultados: [
        { material_id: pecaId, quantidade: 40, tipo_resultado: 'PECA' },
        { material_id: sobraId, quantidade: 5, tipo_resultado: 'SOBRA' },
      ] }] });
    const cheia = await svc.getRemessa(db, remessa.id);
    assert.strictEqual(cheia.retornos.length, 2);
    assert.deepStrictEqual(cheia.retornos.map((x) => x.tipo_resultado), ['PECA', 'SOBRA']);
    assert.strictEqual(cheia.retornos[0].custo_unitario_aplicado, 25);
    assert.strictEqual(cheia.retornos[0].material_codigo, 'GET-P',
      'a leitura nao traz o codigo do material do RESULTADO');
    void itemId;
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd server && node tests/api/transformCost.api.test.js`
Expected: os 5 de rendimento falham com `calcularRendimento is not a function`.

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: os 12 novos falham — os de rota com `404` (a rota não existe) e os de rendimento com
`Cannot read properties of undefined (reading '0')`.

- [ ] **Step 4: Implementar `calcularRendimento`**

Em `server/services/almoxarifado/transformCost.js`, antes do `module.exports`:

```js
/**
 * Rendimento da transformacao: peso que voltou / peso que saiu (Etapa 8c, decisao 7 do design).
 *
 * INFORMATIVO, NUNCA BLOQUEIA. `chapa consumida = pecas + sobra + perda` so e verificavel se TODOS
 * os materiais envolvidos tiverem peso_unitario, e eles nao tem — o campo e opcional no cadastro.
 * Bloquear com base num dado opcional travaria o operador por um campo em branco, e e a mesma razao
 * que descartou o rateio por peso na decisao 4.
 *
 * Quando falta peso, devolve `calculavel: false` NOMEANDO OS MATERIAIS. "Nao calculavel" seco manda
 * o operador procurar o cadastro faltante entre 41 linhas; e lista TODOS de uma vez, nao so o
 * primeiro — senao ele conserta um, tenta de novo, descobre o segundo, e assim por diante (mesma
 * licao da pre-checagem "tudo ou nada").
 *
 * peso_unitario ZERO conta como NAO cadastrado: peso zero nao existe fisicamente, e trata-lo como
 * valido daria rendimento 0% com cara de resultado.
 *
 * Rendimento acima de 100% e CALCULADO e mostrado, nao recusado: significa cadastro de peso errado,
 * e mostrar 116% e o que faz alguem ir conferir. Recusar esconderia o problema — e o sistema nao
 * valida que os pesos fecham, por decisao.
 */
function calcularRendimento({ materialOrigem, quantidadeConsumida, resultados }) {
  const semPeso = [];
  const pesoDe = (m) => {
    const p = Number(m?.peso_unitario);
    if (!Number.isFinite(p) || p <= 0) { semPeso.push(m?.codigo || `material #${m?.id}`); return null; }
    return p;
  };
  const pesoChapa = pesoDe(materialOrigem);
  const pesos = resultados.map((r) => ({ quantidade: Number(r.quantidade), peso: pesoDe(r.material) }));

  if (semPeso.length > 0) {
    return {
      calculavel: false,
      materiais_sem_peso: semPeso,
      motivo: `rendimento nao calculavel — peso unitario nao cadastrado em: ${semPeso.join(', ')}`,
    };
  }

  const pesoSaida = arredondar(pesoChapa * Number(quantidadeConsumida));
  const pesoRetorno = arredondar(pesos.reduce((a, p) => a + p.quantidade * p.peso, 0));
  // 2 casas no percentual (e nao 4): e numero de tela, nao de contabilidade.
  const percentual = pesoSaida > 0 ? Math.round((pesoRetorno / pesoSaida) * 10000) / 100 : 0;
  return {
    calculavel: true,
    peso_saida: pesoSaida,
    peso_retorno: pesoRetorno,
    rendimento_percentual: percentual,
  };
}
```

E o export: `module.exports = { ratearCusto, calcularRendimento, TOLERANCIA_RATEIO, CASAS };`

- [ ] **Step 5: `registrarTransformacao` passa a devolver `rendimento`**

Em `server/services/almoxarifado/thirdPartyService.js`, dentro do laço da fase 2, **depois** do
`efetivados.push({...})`, acrescentar um segundo acumulador. Declarar `const rendimentos = [];`
junto de `const efetivados = [];`, e depois do `efetivados.push`:

```js
    // Rendimento (decisao 7): calculado DEPOIS do efeito, porque ele nao decide nada — se decidisse,
    // um campo de cadastro em branco travaria a transformacao. Vai na resposta e na tela.
    rendimentos.push({
      item_remessa_id: item.id,
      material_codigo: materialOrigem.codigo,
      ...transformCost.calcularRendimento({
        materialOrigem,
        quantidadeConsumida: consumida,
        resultados: rateio.linhas,
      }),
    });
```

E no `return` final, acrescentar `rendimento: rendimentos,` logo depois de `custo: efetivados,`.
Acrescentar também `rendimento: rendimentos,` em `dados_novos` do `registrarAuditoria`.

- [ ] **Step 6: `TransformacaoRemessaSchema`**

Em `server/services/almoxarifado/schemas.js`, logo depois de `ResultadoTransformacaoSchema`:

```js
/**
 * Transformacao: a chapa deixa de existir e as pecas entram (Etapa 8c).
 *
 * OS DOIS NUMEROS SEPARADOS (decisao 1 do design) sao a razao de existir deste schema em vez de um
 * modo do RetornoRemessaSchema:
 *  - `quantidade_consumida` esta SEMPRE na unidade do ENVIADO e e a unica coisa que conta no teto
 *    do item — o teto da 8b continua valendo, intacto e comparavel;
 *  - `resultados[]` tem cada um o SEU material, a SUA quantidade e a SUA unidade, e NENHUM deles
 *    encosta no teto. Comparar 40 pecas (UN) com uma chapa de 100 (KG) seria somar laranja com maca.
 *
 * `custo_servico` e o valor TOTAL da nota do terceiro para AQUELA linha de transformacao — e ali
 * que a nota chega. Opcional: se em branco, nao entra no rateio. Sem estimativa, sem default.
 *
 * TODO campo que o servico usa precisa estar declarado: `validate()` troca req.body pelo parsed e
 * z.object DESCARTA chave nao declarada EM SILENCIO. `custo_servico` e `lote_id` sao os candidatos
 * obvios a serem esquecidos — o arquivo de teste rele cada um do banco depois do POST por isso.
 * E a outra ponta da mesma armadilha e boa: `custo_unitario_aplicado` NAO esta declarado, entao o
 * cliente nao consegue ditar o custo da peca pela API. Quem manda e o rateio.
 */
const TransformacaoRemessaSchema = z.object({
  nota_fiscal: z.string().optional(),
  itens: z.array(z.object({
    item_remessa_id: z.number().int().positive(),
    quantidade_consumida: z.number().gt(0, 'quantidade consumida da chapa deve ser maior que zero'),
    custo_servico: z.number().nonnegative().optional(),
    lote_id: z.number().int().positive().optional(),
    observacoes: z.string().optional(),
    resultados: z.array(ResultadoTransformacaoSchema).min(1, 'informe ao menos um resultado (peca ou sobra)'),
  })).min(1, 'informe ao menos um item transformado'),
});
```

E acrescentar `TransformacaoRemessaSchema` ao `module.exports`.

- [ ] **Step 7: A rota**

Em `server/routes/almoxarifado/extended.js`, acrescentar `TransformacaoRemessaSchema` ao `require`
de `:10`, e registrar a rota **logo depois** de `POST /:id/retornos`:

```js
  // Etapa 8c: a transformacao (corte, dobra, usinagem) — sai UMA chapa, voltam N pecas e uma sobra.
  //
  // Rota IRMA de /retornos e nao um modo dele: os corpos sao diferentes (aqui ha
  // `quantidade_consumida` + `resultados[]`, la ha `quantidade`), o efeito de estoque e de natureza
  // oposta (aqui a chapa DEIXA DE EXISTIR e materiais novos ENTRAM; la nada entra e nada sai do
  // patrimonio) e a compensacao na falha e diferente. Um modo obrigaria o schema a aceitar os dois
  // formatos e o servico a decidir qual e qual por presenca de campo — a classe de bug que a
  // Etapa 8 gastou uma etapa desfazendo.
  //
  // Fica sob /:id/, como /retornos: nao compete com /vencidas (que tem de continuar registrada
  // ANTES de /:id, ver o comentario la em cima).
  //
  // Sem try/catch com mensagem propria: cai em handleError, que respeita err.status e devolve
  // err.message INTACTA. As mensagens deste servico dizem os numeros e os codigos de proposito.
  app.post('/api/almoxarifado/remessas-terceiros/:id/transformacoes', auth, requirePermission('remessar_terceiro'),
    validate(TransformacaoRemessaSchema), async (req, res) => {
      try {
        res.json(await thirdPartyService.registrarTransformacao(db, req.user, req.params.id, req.body));
      } catch (e) { handleError(res, e); }
    });
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd server && node tests/api/transformCost.api.test.js`
Expected: `17 passed, 0 failed`

Run: `cd server && node tests/api/transformacaoTerceiro.api.test.js`
Expected: `47 passed, 0 failed`

Run: `cd server && npm run test:api` · `npm run test:validation` · `npm run test:almoxarifado`
Expected: todos OK.

- [ ] **Step 9: SABOTAGEM**

**S1 — `tipo_resultado` sai do `ResultadoTransformacaoSchema`** (a armadilha do `z.object`):

```bash
cd server
grep -cF "tipo_resultado: z.enum(TIPOS_RESULTADO)," services/almoxarifado/schemas.js   # TEM de dar 1
md5sum services/almoxarifado/schemas.js
sed -i "s|tipo_resultado: z.enum(TIPOS_RESULTADO),||" services/almoxarifado/schemas.js
md5sum services/almoxarifado/schemas.js
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/schemas.js
md5sum services/almoxarifado/schemas.js
git diff --stat
```
Esperado: **`✗ [schema] tipo_resultado ATRAVESSA o Zod`** — o serviço recebe `undefined` e o rateio
recusa com "Classificacao invalida", virando 400. Também caem os dois de `[schema] ...` da Task 3.

**S2 — `custo_servico` sai do schema** (o campo silenciosamente descartado):

```bash
cd server
grep -cF "custo_servico: z.number().nonnegative().optional()," services/almoxarifado/schemas.js  # TEM de dar 1
md5sum services/almoxarifado/schemas.js
sed -i "s|custo_servico: z.number().nonnegative().optional(),||" services/almoxarifado/schemas.js
md5sum services/almoxarifado/schemas.js
node tests/api/transformacaoTerceiro.api.test.js
git checkout -- services/almoxarifado/schemas.js
md5sum services/almoxarifado/schemas.js
git diff --stat
```
Esperado: **`✗ [schema] custo_servico ATRAVESSA o Zod e muda o custo da peca: custo_servico foi descartado pelo schema em silencio (custo ficou 25 e nao 35)`**
— e **nada mais**. Este é o retrato exato da armadilha: sem o teste, o campo some e **nenhum erro
acontece**.

**S3 — o rendimento passa a BLOQUEAR** (prova a decisão 7):

```bash
cd server
grep -cF "if (semPeso.length > 0) {" services/almoxarifado/transformCost.js   # TEM de dar 1
md5sum services/almoxarifado/transformCost.js
perl -0pi -e "s/if \(semPeso\.length > 0\) \{\n    return \{/if (semPeso.length > 0) {\n    throw erro(\`rendimento nao calculavel\`);\n    return {/" services/almoxarifado/transformCost.js
md5sum services/almoxarifado/transformCost.js
node tests/api/transformacaoTerceiro.api.test.js
cp "$SCRATCH/transformCost.bak.js" services/almoxarifado/transformCost.js   # NAO use `git checkout --`: no Step 5 a implementacao ainda nao esta commitada
md5sum services/almoxarifado/transformCost.js
git diff --stat
```
Esperado: **`✗ [rendimento] NUNCA bloqueia: sem peso, a transformacao acontece do mesmo jeito: a transformacao foi BLOQUEADA por falta de peso`**
e os três testes de `rendimento nao calculavel` do `transformCost.api.test.js`.

**S4 — a mensagem de rendimento para de nomear o material:**

```bash
cd server
grep -cF "motivo: \`rendimento nao calculavel — peso unitario nao cadastrado em: \${semPeso.join(', ')}\`," services/almoxarifado/transformCost.js  # TEM de dar 1
```
> Âncora com crase e `${}`: **use a ferramenta Edit** para trocar o `motivo` por
> `motivo: 'rendimento nao calculavel'`. Depois rode os dois arquivos de teste e restaure.
Esperado: **`✗ rendimento nao calculavel diz QUAL material nao tem peso: a mensagem nao diz qual material falta`**
e **`✗ [rendimento] NUNCA bloqueia ...`** na asserção de `materiais_sem_peso`… **não** — essa
continua passando, porque `materiais_sem_peso` não foi tocado. Confirme na saída e registre.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add server/services/almoxarifado/transformCost.js \
        server/services/almoxarifado/thirdPartyService.js \
        server/services/almoxarifado/schemas.js \
        server/routes/almoxarifado/extended.js \
        server/tests/api/transformCost.api.test.js \
        server/tests/api/transformacaoTerceiro.api.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 8: rota da transformacao, schema Zod e rendimento informativo

A rota POST /remessas-terceiros/:id/transformacoes e IRMA de /retornos e nao um modo dele: os corpos
sao diferentes (aqui ha quantidade_consumida + resultados[], la ha quantidade), o efeito de estoque e
de natureza oposta (aqui a chapa DEIXA DE EXISTIR e materiais novos ENTRAM; la nada entra e nada sai
do patrimonio) e a compensacao na falha e diferente. DESCARTADO fazer um modo: obrigaria o schema a
aceitar dois formatos e o servico a decidir qual e qual por presenca de campo.

TransformacaoRemessaSchema declara custo_servico e lote_id porque z.object DESCARTA chave nao
declarada EM SILENCIO — e a outra ponta da armadilha e boa: custo_unitario_aplicado NAO esta
declarado, entao o cliente nao consegue ditar o custo da peca pela API. Quem manda e o rateio.

RENDIMENTO E INFORMATIVO E NUNCA BLOQUEIA (decisao 7): "chapa consumida = pecas + sobra + perda" so e
verificavel se TODOS os materiais tiverem peso_unitario, e eles nao tem — o campo e opcional no
cadastro. Bloquear com base num dado opcional travaria o operador por um campo em branco, que e a
mesma razao que descartou o rateio por peso. Quando falta peso, a resposta NOMEIA os materiais, e
lista TODOS de uma vez em vez do primeiro: senao o operador conserta um, tenta de novo e descobre o
segundo.

Peso ZERO conta como NAO cadastrado: peso zero nao existe fisicamente, e trata-lo como valido daria
rendimento 0% com cara de resultado. Rendimento acima de 100% e CALCULADO e mostrado, nao recusado:
significa cadastro de peso errado, e mostrar 116% e o que faz alguem ir conferir.

Sabotagem que vale registrar: tirar custo_servico do schema NAO produz erro nenhum — o campo some, a
transformacao acontece com custo 25 em vez de 35, e nada denuncia. E o retrato exato da armadilha do
z.object, e por isso cada campo declarado tem um teste que o rele do banco depois do POST.

Testes: 5 de rendimento em transformCost.api.test.js (17 no arquivo) e 12 de rota/schema em
transformacaoTerceiro.api.test.js (47 no arquivo).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 9: a tela — modal de transformação com N linhas de resultado, classificação, atalho de criar material e rendimento

**O que a tela de hoje não dá conta.** O modal de retorno (`RemessasTerceirosAlmoxarifado.js:550-573`)
é **um item por vez, sem seletor de material**: um `<select>` de item, um `<input>` de quantidade e a
NF. A transformação precisa de **N linhas de resultado**, cada uma com **material próprio**,
**quantidade própria** e **classificação PECA/SOBRA** — e de um caminho para o operador criar o
material resultante quando ele ainda não existe (decisão 6), porque o backend **recusa** material
inexistente de propósito.

**A armadilha de permissão desta task (achado do contrato, ver a tabela acima).** Transformar exige
`remessar_terceiro` **[ADMINISTRADOR, ALMOXARIFE]**; criar material exige `criar_material`
**[ADMINISTRADOR, ALMOXARIFE, ENGENHARIA]**. **São gates diferentes**, e o atalho de criar material
tem de ser barrado pelo **seu** gate, não pelo da transformação. Um ENGENHARIA que abra a tela pode
criar o material e **não** pode transformar.

**Files:**
- Modify: `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js`
- Create: `client/src/components/almoxarifado/RemessasTerceirosTransformacao.test.js`

**Interfaces:**
- Consumes: `POST /almoxarifado/remessas-terceiros/:id/transformacoes` (Task 8);
  `GET /almoxarifado/proximo-codigo?familia_id=` e `POST /almoxarifado/materiais` com
  `codigo_auto: 1` (Task 1); `GET /almoxarifado/remessas-terceiros/:id` já traz
  `retornos[].tipo_resultado` (Task 8).
- Produces: nada consumido por outra task. **É a última task de código.**

---

- [ ] **Step 1: Escrever os testes que falham**

Criar `client/src/components/almoxarifado/RemessasTerceirosTransformacao.test.js`:

```js
/**
 * Etapa 8c, Task 9 — o modal de transformacao da tela "Remessas a Terceiros".
 *
 * O alvo e o que SO A TELA pode errar: montar o corpo errado (os dois numeros da decisao 1 sao
 * facilmente trocados), deixar a classificacao PECA/SOBRA implicita, esconder o atalho de criar
 * material atras do gate ERRADO (sao gates diferentes: remessar_terceiro x criar_material), e nao
 * mostrar o rendimento que o servidor calculou. O ciclo em si tem teste de servico e de rota.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RemessasTerceirosAlmoxarifado from './RemessasTerceirosAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../utils/remessaPdf', () => ({
  __esModule: true, gerarRemessaPDF: jest.fn(), montarRemessaPDF: jest.fn(),
}));

// Permissoes: por padrao tudo liberado. Os testes que medem gate trocam este mock em runtime.
let podeMock = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => podeMock(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (podeMock(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));

const REMESSA = {
  id: 10, numero: 'REM-CORTE-1', fornecedor_nome: 'Corte a Laser Oeste', tipo_servico: 'Corte',
  status: 'ENVIADA', prazo_previsto: '2099-01-01', vencida: 0, itens_total: 1,
  proprietario_cliente_id: null, proprietario_cliente_nome: null,
};
const DETALHE = {
  ...REMESSA,
  itens: [{ id: 101, material_id: 1, material_codigo: 'CHP-001', material_nome: 'Chapa 3/16',
    unidade: 'KG', quantidade: 100, quantidade_retornada: 0, pendente: 100 }],
  retornos: [],
};
const MATERIAIS = [
  { id: 1, codigo: 'CHP-001', nome: 'Chapa 3/16', unidade: 'KG', familia_id: 3, proprietario_cliente_id: null },
  { id: 2, codigo: 'PC-010', nome: 'Peca cortada 010', unidade: 'UN', familia_id: 3, proprietario_cliente_id: null },
  { id: 3, codigo: 'SOB-001', nome: 'Sobra de chapa', unidade: 'KG', familia_id: 3, proprietario_cliente_id: null },
  { id: 4, codigo: 'CLI-CHP', nome: 'Chapa do cliente', unidade: 'KG', familia_id: 3,
    proprietario_cliente_id: 7, proprietario_cliente_nome: 'Metalurgica X' },
];

function mockGets({ detalhe = DETALHE } = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/remessas-terceiros/')) return Promise.resolve({ data: detalhe });
    if (url.startsWith('/almoxarifado/remessas-terceiros')) return Promise.resolve({ data: [REMESSA] });
    if (url.startsWith('/almoxarifado/materiais')) return Promise.resolve({ data: MATERIAIS });
    if (url.startsWith('/almoxarifado/proximo-codigo')) return Promise.resolve({ data: { codigo: 'PC-011' } });
    return Promise.resolve({ data: [] });
  });
}

let container; let root;
async function montar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><RemessasTerceirosAlmoxarifado /></MemoryRouter>);
  });
}
const textos = () => container.textContent;
const porTexto = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(t));
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const digitar = async (el, valor) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const campo = (label) => [...container.querySelectorAll('.almox-field')]
  .find((f) => f.textContent.includes(label))?.querySelector('input, select, textarea');

/** Abre a tela, abre o detalhe da remessa e abre o modal de transformacao. */
async function abrirTransformacao() {
  await montar();
  await clicar(porTexto('Abrir'));
  await clicar(porTexto('Transformar'));
}

beforeEach(() => {
  jest.clearAllMocks();
  podeMock = () => true;
  mockGets();
  api.post.mockResolvedValue({ data: { success: true, status: 'ENCERRADA', pendente_total: 0,
    custo: [{ custo_unitario_peca: 25, valor_total: 1000, residuo: 0 }],
    rendimento: [{ calculavel: false, motivo: 'rendimento nao calculavel — peso unitario nao cadastrado em: PC-010', materiais_sem_peso: ['PC-010'] }] } });
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

test('o botao Transformar aparece em remessa ENVIADA, ao lado de Retorno', async () => {
  await montar();
  expect(porTexto('Transformar')).toBeTruthy();
  expect(porTexto('Retorno')).toBeTruthy();
});

test('o botao Transformar NAO aparece em remessa ENCERRADA', async () => {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/remessas-terceiros/')) return Promise.resolve({ data: { ...DETALHE, status: 'ENCERRADA' } });
    if (url.startsWith('/almoxarifado/remessas-terceiros')) return Promise.resolve({ data: [{ ...REMESSA, status: 'ENCERRADA' }] });
    if (url.startsWith('/almoxarifado/materiais')) return Promise.resolve({ data: MATERIAIS });
    return Promise.resolve({ data: [] });
  });
  await montar();
  expect(porTexto('Transformar')).toBeFalsy();
});

test('o modal manda os DOIS numeros separados: quantidade_consumida e resultados[]', async () => {
  // A decisao 1 inteira. Trocar os dois numeros e o erro mais provavel de quem monta este corpo, e
  // ele nao daria erro nenhum: 40 (UN) caberia no teto de 100 (KG) e a chapa seria baixada errado.
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await digitar(campo('Classificação'), 'PECA');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));

  expect(api.post).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/10/transformacoes',
    expect.objectContaining({
      itens: [expect.objectContaining({
        item_remessa_id: 101,
        quantidade_consumida: 100,
        resultados: [expect.objectContaining({ material_id: 2, quantidade: 40, tipo_resultado: 'PECA' })],
      })],
    }));
});

test('duas linhas de resultado (peca + sobra) viajam juntas no MESMO documento', async () => {
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await digitar(campo('Classificação'), 'PECA');
  await clicar(porTexto('Adicionar resultado'));
  await digitar(campo('Material do resultado'), '3');
  await digitar(campo('Quantidade do resultado'), '12');
  await digitar(campo('Classificação'), 'SOBRA');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));

  const corpo = api.post.mock.calls[0][1];
  expect(corpo.itens[0].resultados).toHaveLength(2);
  expect(corpo.itens[0].resultados[1]).toEqual(expect.objectContaining({ material_id: 3, tipo_resultado: 'SOBRA' }));
});

test('nao deixa confirmar sem nenhuma linha de resultado', async () => {
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await clicar(porTexto('Confirmar transformação'));
  expect(api.post).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/resultado/i));
});

test('recusa o MESMO material da chapa como resultado, antes de mandar', async () => {
  // A tela ADIANTA a recusa do servidor para o operador nao montar cinco linhas e perder tudo no
  // Confirmar. Quem decide continua sendo o backend.
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Material do resultado'), '1'); // CHP-001, a propria chapa
  await digitar(campo('Quantidade do resultado'), '10');
  await clicar(porTexto('Adicionar resultado'));
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/mesma chapa|retorno/i));
});

test('recusa resultado de OUTRO dono, nomeando os dois', async () => {
  // Espelha ownerRules.assertMesmoDonoNaTransformacao. Adiantada aqui pelo mesmo motivo do teste
  // acima — e com a mesma frase, para o operador nao ver duas explicacoes diferentes do mesmo nao.
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Material do resultado'), '4'); // CLI-CHP, do cliente 7; a chapa e nossa
  await digitar(campo('Quantidade do resultado'), '10');
  await clicar(porTexto('Adicionar resultado'));
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Metalurgica X/));
});

test('o atalho de criar material resultante herda dono e familia da chapa, e usa codigo_auto', async () => {
  // Decisao 6: o motor NAO cria material; a tela oferece um atalho EXPLICITO, que chama a criacao
  // normal. `codigo_auto` existe porque o gerador de codigo devolve o mesmo numero para N chamadas
  // concorrentes — a colisao e resolvida no INSERT, com retry (Task 1).
  api.post.mockResolvedValue({ data: { id: 99, codigo: 'PC-011', nome: 'Peca nova', unidade: 'UN', familia_id: 3, proprietario_cliente_id: null } });
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await clicar(porTexto('Criar material resultante'));
  await digitar(campo('Nome do novo material'), 'Peca nova');
  await digitar(campo('Unidade do novo material'), 'UN');
  await clicar(porTexto('Cadastrar e usar'));

  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/almoxarifado/proximo-codigo?familia_id=3'));
  expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais', expect.objectContaining({
    codigo: 'PC-011', codigo_auto: 1, nome: 'Peca nova', unidade: 'UN',
    familia_id: 3, proprietario_cliente_id: null,
  }));
});

test('o atalho de criar material e barrado por criar_material, NAO por remessar_terceiro', async () => {
  // Os gates sao DIFERENTES (permissions.js): remessar_terceiro e [ADMINISTRADOR, ALMOXARIFE];
  // criar_material e [ADMINISTRADOR, ALMOXARIFE, ENGENHARIA]. Barrar o atalho pelo gate da
  // transformacao tiraria a funcao de quem tem direito a ela.
  podeMock = (acao) => acao !== 'criar_material';
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await clicar(porTexto('Criar material resultante'));
  expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/materiais', expect.anything());
});

test('[CONTROLE POSITIVO] com criar_material, o atalho abre o formulario', async () => {
  // Sem isto, um atalho que nunca abrisse passaria no teste acima.
  podeMock = () => true;
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await clicar(porTexto('Criar material resultante'));
  expect(campo('Nome do novo material')).toBeTruthy();
});

test('mostra o rendimento NAO CALCULAVEL dizendo qual material falta', async () => {
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));
  expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/PC-010/));
  expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/peso/i));
});

test('[CONTROLE POSITIVO] mostra o rendimento quando ele E calculavel', async () => {
  api.post.mockResolvedValue({ data: { success: true, status: 'ENCERRADA', pendente_total: 0,
    custo: [{ custo_unitario_peca: 25, valor_total: 1000, residuo: 0 }],
    rendimento: [{ calculavel: true, peso_saida: 785, peso_retorno: 720, rendimento_percentual: 91.72 }] } });
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));
  expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/91[.,]72/));
});

test('a tabela de itens separa Retornado de Transformado', async () => {
  // A coluna "Retornado" ja significava duas coisas (voltou / foi liquidado no encerramento). Com a
  // 8c vira TRES. A tela desdobra, porque quantidade_retornada sozinha nao distingue.
  const detalhe = {
    ...DETALHE,
    itens: [{ ...DETALHE.itens[0], quantidade_retornada: 100, pendente: 0 }],
    retornos: [
      { id: 1, item_remessa_id: 101, material_id: 1, material_codigo: 'CHP-001', quantidade: 40, tipo_resultado: null },
      { id: 2, item_remessa_id: 101, material_id: 2, material_codigo: 'PC-010', quantidade: 24, tipo_resultado: 'PECA', custo_unitario_aplicado: 25 },
    ],
  };
  mockGets({ detalhe });
  await montar();
  await clicar(porTexto('Abrir'));
  const linha = container.querySelector('.almox-remessa-detalhe tbody tr');
  expect(linha.querySelector('[data-col="retornado"]').textContent).toContain('40');
  expect(linha.querySelector('[data-col="transformado"]').textContent).toContain('60');
  expect(textos()).toContain('PC-010');
});

test('o erro do servidor chega ao operador INTACTO', async () => {
  // As mensagens desta etapa dizem os codigos e os numeros de proposito; um toast generico as
  // apagaria.
  api.post.mockRejectedValue({ response: { data: { error: 'O material 424242 do resultado nao existe. Cadastre o material resultante primeiro' } } });
  await abrirTransformacao();
  await digitar(campo('Item transformado'), '101');
  await digitar(campo('Quantidade consumida'), '100');
  await digitar(campo('Material do resultado'), '2');
  await digitar(campo('Quantidade do resultado'), '40');
  await clicar(porTexto('Adicionar resultado'));
  await clicar(porTexto('Confirmar transformação'));
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('424242'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false`
Expected: FAIL — `porTexto('Transformar')` devolve `undefined` e `clicar(undefined)` explode em quase
todos. O primeiro teste falha com `expect(received).toBeTruthy()`.

- [ ] **Step 3: Implementar — constantes e estado**

Em `client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js`, logo abaixo de
`const STATUS_COM_RETORNO = ...` (`:30`):

```js
/**
 * Transformacao (Etapa 8c) tem os MESMOS status do retorno, e isto e afirmacao e nao coincidencia:
 * as duas sao formas de o material voltar do terceiro, e as duas passam por
 * sm.PODE_RECEBER_RETORNO no servidor. Duas listas com os mesmos valores divergiriam na primeira
 * mudanca; uma constante propria existe para o dia em que elas DEVAM divergir.
 */
const STATUS_COM_TRANSFORMACAO = STATUS_COM_RETORNO;

/** Classificacao da linha de resultado (schema.TIPOS_RESULTADO) em linguagem de tela. */
const ROTULO_RESULTADO = {
  PECA: 'Peça (recebe o custo rateado da chapa)',
  SOBRA: 'Sobra / retalho (entra a custo zero)',
};
```

No corpo do componente, junto dos outros `useState`:

```js
  // Linhas de resultado do modal de transformacao (N por documento) e o formulario da linha nova.
  const [resultados, setResultados] = useState([]);
  const [novoResultado, setNovoResultado] = useState({ material_id: '', quantidade: '', tipo_resultado: 'PECA' });
  // Atalho de criar o material resultante (decisao 6): sub-formulario que aparece SOB DEMANDA,
  // nunca junto — criar material tem gate PROPRIO (criar_material), diferente do da transformacao.
  const [novoMaterial, setNovoMaterial] = useState(null); // null = fechado; {} = aberto
```

Em `abrirModal` (`:143`), acrescentar a limpeza dos três estados novos (dentro da função, depois do
`setForm({})` que já existe):

```js
    setResultados([]);
    setNovoResultado({ material_id: '', quantidade: '', tipo_resultado: 'PECA' });
    setNovoMaterial(null);
```

- [ ] **Step 4: Implementar — os handlers**

Acrescentar, depois de `adicionarItem`:

```js
  /** O item de remessa selecionado no modal de transformacao (a CHAPA). */
  const itemDaTransformacao = useMemo(() => {
    const id = String(form.item_remessa_id || '');
    return (aberta?.itens || []).find((i) => String(i.id) === id) || null;
  }, [aberta, form.item_remessa_id]);

  /**
   * Acrescenta uma linha de resultado.
   *
   * As duas recusas aqui ESPELHAM o servidor (thirdPartyService.registrarTransformacao e
   * ownerRules.assertMesmoDonoNaTransformacao), adiantadas para o operador nao montar cinco linhas
   * e perder tudo no Confirmar. Quem DECIDE continua sendo o backend — se estas duas sumissem, o
   * 400 viria com a mesma frase.
   */
  const adicionarResultado = () => {
    const material = materiais.find((m) => String(m.id) === String(novoResultado.material_id));
    if (!material) { toast.error('Selecione o material do resultado'); return; }
    const qtd = Number(novoResultado.quantidade);
    if (!(qtd > 0)) { toast.error('Informe a quantidade do resultado'); return; }
    if (itemDaTransformacao && Number(material.id) === Number(itemDaTransformacao.material_id)) {
      toast.error(`${material.codigo} é a mesma chapa enviada. Chapa que volta como ela mesma não é `
        + 'transformação — use "Retorno".');
      return;
    }
    if (itemDaTransformacao) {
      const donoChapa = (materiais.find((m) => Number(m.id) === Number(itemDaTransformacao.material_id))
        ?.proprietario_cliente_id) ?? null;
      const donoResultado = material.proprietario_cliente_id ?? null;
      if (donoChapa !== donoResultado) {
        const nomeDe = (id, m) => (id ? (m?.proprietario_cliente_nome || `cliente #${id}`) : 'estoque próprio (material nosso)');
        toast.error(`${itemDaTransformacao.material_codigo} é de `
          + `${nomeDe(donoChapa, materiais.find((m) => Number(m.id) === Number(itemDaTransformacao.material_id)))} e `
          + `${material.codigo} é de ${nomeDe(donoResultado, material)}. A transformação não pode `
          + 'mudar o proprietário do material.');
        return;
      }
    }
    setResultados((lista) => [...lista, {
      material_id: Number(material.id),
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      quantidade: qtd,
      tipo_resultado: novoResultado.tipo_resultado || 'PECA',
    }]);
    setNovoResultado({ material_id: '', quantidade: '', tipo_resultado: 'PECA' });
  };

  /**
   * Atalho EXPLICITO de criar o material resultante (decisao 6 do design).
   *
   * O motor NAO cria material — precedente do modulo (o recebimento tambem nao). Criar
   * implicitamente a partir de um formulario de retorno produziria cadastro-lixo a cada erro de
   * digitacao, e cadastro-lixo em almoxarifado nao se apaga: ele ganha saldo. Este atalho chama a
   * criacao NORMAL (POST /almoxarifado/materiais), so pre-preenchendo o que ja se sabe.
   *
   * GATE PROPRIO: `criar_material`, NAO `remessar_terceiro`. Sao listas de perfis diferentes
   * (ENGENHARIA cria material e nao transforma), e barrar pelo gate errado tiraria a funcao de quem
   * tem direito a ela.
   *
   * `codigo_auto: 1` porque GET /proximo-codigo devolve o MESMO numero para N chamadas
   * concorrentes: a colisao e resolvida no INSERT, com retry (materialService.createMaterial).
   */
  const abrirCriarMaterial = (evento) => {
    if (!bloquearSeNaoPode('criar_material', evento)) return;
    const chapa = materiais.find((m) => Number(m.id) === Number(itemDaTransformacao?.material_id));
    setNovoMaterial({ nome: '', unidade: 'UN', familia_id: chapa?.familia_id ?? null,
      proprietario_cliente_id: chapa?.proprietario_cliente_id ?? null });
  };

  const cadastrarMaterialResultante = async () => {
    if (!String(novoMaterial?.nome || '').trim()) { toast.error('Informe o nome do novo material'); return; }
    if (!novoMaterial.familia_id) {
      toast.error('A chapa enviada não tem família cadastrada — cadastre o material resultante pela tela de Materiais');
      return;
    }
    setSalvando(true);
    try {
      const prox = await api.get(`/almoxarifado/proximo-codigo?familia_id=${novoMaterial.familia_id}`);
      const criado = await api.post('/almoxarifado/materiais', {
        codigo: prox.data?.codigo,
        codigo_auto: 1,
        nome: String(novoMaterial.nome).trim(),
        unidade: String(novoMaterial.unidade || 'UN').trim(),
        familia_id: Number(novoMaterial.familia_id),
        proprietario_cliente_id: novoMaterial.proprietario_cliente_id ?? null,
      });
      setMateriais((lista) => [...lista, criado.data]);
      setNovoResultado((r) => ({ ...r, material_id: String(criado.data.id) }));
      setNovoMaterial(null);
      toast.success(`Material ${criado.data.codigo} criado — já selecionado como resultado`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar o material resultante');
    } finally { setSalvando(false); }
  };
```

- [ ] **Step 5: Implementar — a submissão**

Em `confirmar`, **antes** do bloco `if (tipo === 'retorno' && ...)`, acrescentar as validações e, no
`try`, o ramo novo. Validações:

```js
    if (tipo === 'transformacao') {
      if (!form.item_remessa_id) { toast.error('Selecione a chapa que foi transformada'); return undefined; }
      if (!(Number(form.quantidade_consumida) > 0)) {
        toast.error('Informe quanto da chapa foi consumido'); return undefined;
      }
      if (resultados.length === 0) {
        toast.error('Adicione ao menos um resultado (peça ou sobra) — se a chapa voltou inteira, use "Retorno"');
        return undefined;
      }
    }
```

E dentro do `try`, como primeiro ramo:

```js
      if (tipo === 'transformacao') {
        // OS DOIS NUMEROS SEPARADOS (decisao 1): `quantidade_consumida` esta na unidade da CHAPA e
        // e a unica coisa que conta no teto do item; cada resultado tem a SUA quantidade, na SUA
        // unidade, e nenhum deles encosta no teto. Trocar os dois aqui nao daria erro nenhum — 40
        // (UN) cabe no teto de 100 (KG) — e a chapa seria baixada errado. Por isso ha teste.
        const item = {
          item_remessa_id: Number(form.item_remessa_id),
          quantidade_consumida: Number(form.quantidade_consumida),
          resultados: resultados.map((r) => ({
            material_id: r.material_id, quantidade: r.quantidade, tipo_resultado: r.tipo_resultado,
          })),
        };
        if (Number(form.custo_servico) > 0) item.custo_servico = Number(form.custo_servico);
        const resp = await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/transformacoes`, {
          nota_fiscal: form.nota_fiscal || undefined,
          itens: [item],
        });
        toast.success('Transformação registrada — a chapa foi baixada e os resultados entraram no estoque');
        // Rendimento (decisao 7): INFORMATIVO. `toast.info` e nao `warn`: nao ha nada errado em um
        // material sem peso cadastrado, e um alerta amarelo ensinaria o operador a ignorar alertas.
        const rend = resp.data?.rendimento?.[0];
        if (rend?.calculavel) {
          toast.info(`Rendimento: ${rend.rendimento_percentual}% `
            + `(saíram ${rend.peso_saida} kg, voltaram ${rend.peso_retorno} kg)`);
        } else if (rend?.motivo) {
          toast.info(rend.motivo);
        }
      } else if (tipo === 'retorno') {
```

> **Atenção:** o `if (tipo === 'retorno') {` que já existe passa a ser `} else if (tipo === 'retorno') {`.
> Não duplique o bloco.

- [ ] **Step 6: Implementar — o botão e o modal**

Botão, na coluna de ações, **logo depois** do botão `Retorno`:

```js
                        {STATUS_COM_TRANSFORMACAO.includes(r.status) && (
                          <button className="btn-almox-secondary"
                            title="A chapa foi cortada: registrar as peças e a sobra que voltaram"
                            onClick={(e) => abrirModal('transformacao', r, e)}>
                            <FiScissors size={13} /> Transformar
                          </button>
                        )}
```

E `FiScissors` entra no `import` de `react-icons/fi` (`:4`).

Título do modal: acrescentar o caso `transformacao` na cadeia de `<h2>`:

```js
                {modal.tipo === 'nova' ? 'Nova remessa a terceiros'
                  : modal.tipo === 'transformacao' ? 'Registrar transformação (corte, dobra, usinagem)'
                    : modal.tipo === 'retorno' ? 'Registrar retorno'
                      : modal.tipo === 'encerrar' ? 'Encerrar remessa' : 'Cancelar remessa'}
```

Tamanho do modal: `modal.tipo === 'nova' || modal.tipo === 'transformacao' ? 'almox-modal-lg' : 'almox-modal-sm'`.

Rótulo do botão de confirmar:

```js
                {salvando ? 'Salvando...'
                  : modal.tipo === 'nova' ? 'Criar remessa'
                    : modal.tipo === 'transformacao' ? 'Confirmar transformação'
                      : modal.tipo === 'retorno' ? 'Confirmar retorno'
                        : modal.tipo === 'encerrar' ? 'Confirmar encerramento' : 'Confirmar cancelamento'}
```

Corpo do modal, **depois** do bloco `{modal.tipo === 'retorno' && (...)}`:

```js
              {modal.tipo === 'transformacao' && (
                <>
                  <p style={{ marginTop: 0, fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                    Use aqui quando <strong>voltou material diferente do que saiu</strong> (corte, dobra,
                    usinagem). A chapa consumida sai do estoque de vez e os resultados entram como
                    material próprio. Se a chapa voltou inteira, use <strong>Retorno</strong>.
                  </p>

                  <div className="almox-field">
                    <label className="almox-label">Item transformado (a chapa)<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.item_remessa_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, item_remessa_id: e.target.value }))}>
                      <option value="">Selecionar item...</option>
                      {(aberta?.id === modal.remessa.id ? (aberta.itens || []) : []).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.material_codigo} — ainda no terceiro: {i.pendente} {i.unidade}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">
                      Quantidade consumida da chapa{itemDaTransformacao ? ` (em ${itemDaTransformacao.unidade})` : ''}
                      <span className="required">*</span>
                    </label>
                    <input className="almox-input" type="number" min="0" value={form.quantidade_consumida || ''}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade_consumida: e.target.value }))} />
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Na unidade da chapa. É só este número que desconta do que está no terceiro — as
                      peças que voltaram têm a unidade delas e não entram nesta conta.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">Custo do serviço do terceiro (R$)</label>
                    <input className="almox-input" type="number" min="0" value={form.custo_servico || ''}
                      onChange={(e) => setForm((f) => ({ ...f, custo_servico: e.target.value }))} />
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Opcional. Se informado, soma ao custo das peças (a peça não é peça sem o corte).
                      Em branco, não entra — o sistema não estima.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">Nota fiscal do retorno</label>
                    <input className="almox-input" value={form.nota_fiscal || ''}
                      onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))} />
                  </div>

                  <h3 style={{ fontSize: '0.9rem', margin: '12px 0 4px' }}>O que voltou</h3>
                  <div className="almox-field">
                    <label className="almox-label">Material do resultado</label>
                    <select className="almox-form-select" value={novoResultado.material_id}
                      onChange={(e) => setNovoResultado((r) => ({ ...r, material_id: e.target.value }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => (
                        <option key={m.id} value={m.id}>{m.codigo} — {m.nome} ({m.unidade})</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade do resultado</label>
                    <input className="almox-input" type="number" min="0" value={novoResultado.quantidade}
                      onChange={(e) => setNovoResultado((r) => ({ ...r, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Classificação</label>
                    <select className="almox-form-select" value={novoResultado.tipo_resultado}
                      onChange={(e) => setNovoResultado((r) => ({ ...r, tipo_resultado: e.target.value }))}>
                      <option value="PECA">{ROTULO_RESULTADO.PECA}</option>
                      <option value="SOBRA">{ROTULO_RESULTADO.SOBRA}</option>
                    </select>
                  </div>
                  <div className="almox-actions" style={{ marginBottom: 8 }}>
                    <button type="button" className="btn-almox-secondary" onClick={adicionarResultado}>
                      <FiPlus size={13} /> Adicionar resultado
                    </button>
                    {/* Gate PROPRIO: criar_material, e nao remessar_terceiro. ENGENHARIA cria
                        material e nao transforma — barrar pelo gate errado tiraria a funcao de quem
                        tem direito a ela. O botao continua VISIVEL: bloquearSeNaoPode barra no
                        onClick, com o mesmo texto que o backend produziria, e FALHA ABERTO se
                        GET /minhas-permissoes nao carregar. */}
                    <button type="button" className="btn-almox-secondary"
                      title="Cadastrar agora o material que voltou, já com a família e o dono da chapa"
                      onClick={(e) => abrirCriarMaterial(e)}>
                      <FiPlus size={13} /> Criar material resultante
                    </button>
                  </div>

                  {novoMaterial && (
                    <div className="almox-field" style={{ border: '1px solid var(--gmp-border)', padding: 8, borderRadius: 6 }}>
                      <p style={{ marginTop: 0, fontSize: '0.8rem' }}>
                        O código é gerado pela família da chapa e o proprietário é herdado dela — a
                        peça cortada de uma chapa do cliente continua sendo do cliente.
                      </p>
                      <label className="almox-label">Nome do novo material<span className="required">*</span></label>
                      <input className="almox-input" value={novoMaterial.nome}
                        onChange={(e) => setNovoMaterial((m) => ({ ...m, nome: e.target.value }))} />
                      <label className="almox-label">Unidade do novo material</label>
                      <input className="almox-input" value={novoMaterial.unidade}
                        onChange={(e) => setNovoMaterial((m) => ({ ...m, unidade: e.target.value }))} />
                      <div className="almox-actions" style={{ marginTop: 8 }}>
                        <button type="button" className="btn-almox-primary" disabled={salvando}
                          onClick={cadastrarMaterialResultante}>Cadastrar e usar</button>
                        <button type="button" className="btn-almox-secondary"
                          onClick={() => setNovoMaterial(null)}>Cancelar cadastro</button>
                      </div>
                    </div>
                  )}

                  <table className="almox-table">
                    <thead>
                      <tr><th>Código</th><th>Material</th><th>Qtd.</th><th>Un.</th><th>Classificação</th><th /></tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, idx) => (
                        <tr key={`${r.material_id}-${idx}`}>
                          <td>{r.codigo}</td><td>{r.nome}</td><td>{r.quantidade}</td><td>{r.unidade}</td>
                          <td>{r.tipo_resultado === 'SOBRA' ? 'Sobra (custo zero)' : 'Peça'}</td>
                          <td>
                            <button type="button" className="btn-almox-secondary" title="Remover o resultado"
                              onClick={() => setResultados((l) => l.filter((_, k) => k !== idx))}>
                              <FiTrash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resultados.length === 0 && (
                    <p style={{ margin: '8px 0', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                      Nenhum resultado ainda. A chapa só é baixada quando você confirmar.
                    </p>
                  )}
                </>
              )}
```

- [ ] **Step 7: Implementar — a tabela de detalhe separa Retornado de Transformado**

Substituir `retornadoPorItem` (`:274-282`) por **dois** mapas, e acrescentar a coluna:

```js
  /**
   * O que voltou de verdade, por item, SEPARADO em duas naturezas.
   *
   * `quantidade_retornada` do item ja significava DUAS coisas (voltou / foi liquidado no
   * encerramento). Com a 8c passa a significar TRES: a transformacao tambem soma nela. A coluna nao
   * distingue e nao vai distinguir nesta etapa (a decisao de criar `quantidade_baixada` foi adiada
   * de novo, com o motivo escrito no plano) — quem distingue e a linha de resultado, por
   * `tipo_resultado`: NULL = retorno simples da 8b, PECA/SOBRA = transformacao.
   */
  const retornadoPorItem = useMemo(() => {
    const mapa = {};
    for (const r of (aberta?.retornos || [])) {
      if (r.tipo_resultado) continue; // linha de transformacao: conta no outro mapa
      const k = String(r.item_remessa_id);
      mapa[k] = (mapa[k] || 0) + Number(r.quantidade || 0);
    }
    return mapa;
  }, [aberta]);

  /**
   * Transformado, por item: NAO e a soma das quantidades dos resultados — elas estao em OUTRA
   * unidade (40 pecas em UN nao sao 40 kg de chapa). O que foi consumido da chapa e o que sobra em
   * `quantidade_retornada` depois de tirar o que voltou de verdade e o que foi liquidado; como o
   * detalhe nao carrega a movimentacao de consumo, a tela deriva pelo unico caminho honesto: itens
   * que TEM linha de transformacao mostram a diferenca rotulada como "transformado".
   */
  const temTransformacao = useMemo(() => {
    const set = new Set();
    for (const r of (aberta?.retornos || [])) if (r.tipo_resultado) set.add(String(r.item_remessa_id));
    return set;
  }, [aberta]);
```

E, dentro do `map` dos itens, substituir o cálculo de `baixado` e acrescentar a coluna:

```js
                const retornado = retornadoPorItem[String(i.id)] || 0;
                const semRetorno = Math.max(0, Number(i.quantidade_retornada || 0) - retornado);
                // Se este item tem linha de transformacao, o que sobrou foi CONSUMIDO na
                // transformacao; senao, foi liquidado no encerramento/cancelamento.
                const transformado = temTransformacao.has(String(i.id)) ? semRetorno : 0;
                const baixado = temTransformacao.has(String(i.id)) ? 0 : semRetorno;
```

No `<thead>`, acrescentar a coluna entre "Retornado" e "Baixado (não voltou)":

```js
                <th title="Consumido numa transformação: a chapa deixou de existir e voltou como outro material">Transformado</th>
```

E no `<tbody>`:

```js
                    <td data-col="transformado">{transformado > 0 ? transformado : '—'}</td>
```

Por fim, a lista de retornos abaixo da tabela passa a rotular a natureza:

```js
              Retornos recebidos: {aberta.retornos.map((r) => `${r.material_codigo} ${r.quantidade}`
                + (r.tipo_resultado ? ` [${r.tipo_resultado === 'SOBRA' ? 'sobra' : 'peça'}${r.custo_unitario_aplicado ? `, R$ ${r.custo_unitario_aplicado}/un` : ''}]` : '')
                + (r.nota_fiscal ? ` (${r.nota_fiscal})` : '')).join(' · ')}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceiros --watchAll=false`
Expected: os **14** testes novos passam e os **22** de `RemessasTerceirosAlmoxarifado.test.js`
continuam passando.

> **Se algum dos 22 antigos falhar, é achado, não ruído.** O mais provável é o que lê
> `data-col="retornado"`: ele passou a excluir linhas de transformação. Se o teste antigo montava um
> `retorno` sem `tipo_resultado`, ele continua contando — confirme; se falhar, o mock dele tem
> `tipo_resultado` inesperado.

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: a suíte inteira verde. **Anote o total medido**, não copie número deste plano.

Run: `cd client && CI=true npx react-scripts build`
Expected: `Compiled successfully.` (com `CI=true`, **warning vira erro** — variável não usada quebra
o build).

- [ ] **Step 9: SABOTAGEM**

**S1 — os dois números trocam de lugar** (a decisão 1 vira nada). Use a ferramenta **Edit** para
trocar, no ramo `tipo === 'transformacao'` de `confirmar`,
`quantidade_consumida: Number(form.quantidade_consumida)` por
`quantidade_consumida: resultados.reduce((a, r) => a + r.quantidade, 0)`. Depois:

```bash
cd client
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false
git checkout -- src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
git diff --stat
```
Esperado: **`✕ o modal manda os DOIS numeros separados`** (`quantidade_consumida` vira 40 e não 100)
e **`✕ duas linhas de resultado (peca + sobra) viajam juntas`**.

**S2 — o atalho de criar material passa a usar o gate da transformação:**

```bash
cd client
grep -cF "if (!bloquearSeNaoPode('criar_material', evento)) return;" src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js  # TEM de dar 1
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
sed -i "s|if (!bloquearSeNaoPode('criar_material', evento)) return;|if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;|" src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false
git checkout -- src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
git diff --stat
```
Esperado: **`✕ o atalho de criar material e barrado por criar_material, NAO por remessar_terceiro`**
— com o gate trocado, `podeMock` (que só nega `criar_material`) deixa passar e o `POST /materiais`
acontece.

**S3 — a classificação ganha default implícito:**

```bash
cd client
grep -cF "tipo_resultado: novoResultado.tipo_resultado || 'PECA'," src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js  # TEM de dar 1
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
sed -i "s|tipo_resultado: novoResultado.tipo_resultado || 'PECA',|tipo_resultado: 'PECA',|" src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false
git checkout -- src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
git diff --stat
```
Esperado: **`✕ duas linhas de resultado (peca + sobra) viajam juntas no MESMO documento`** — a sobra
viraria `PECA` e entraria carregando rateio, exatamente o que a decisão 4 existe para impedir.

**S4 — o rendimento para de ser mostrado:**

```bash
cd client
grep -cF "const rend = resp.data?.rendimento?.[0];" src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js  # TEM de dar 1
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
sed -i "s|const rend = resp.data?.rendimento?.\[0\];|const rend = null;|" src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceirosTransformacao --watchAll=false
git checkout -- src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
md5sum src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js
git diff --stat
```
Esperado: **duas** falhas — `✕ mostra o rendimento NAO CALCULAVEL dizendo qual material falta` e
`✕ [CONTROLE POSITIVO] mostra o rendimento quando ele E calculavel`.

- [ ] **Step 10: Verificação manual no navegador (o que JSDOM não valida)**

`npm run dev` na raiz. Abrir **Almoxarifado → Remessas a Terceiros**. Roteiro mínimo:

1. Criar remessa com uma chapa de 100 KG que tenha **custo** (recebida por NF depois da Task 2), e
   **Enviar**.
2. Clicar em **Transformar**. Conferir que o modal é **largo** (`almox-modal-lg`) e que a tabela de
   resultados não estoura na largura.
3. Clicar em **Criar material resultante** sem selecionar o item: o formulário abre com família
   vazia e o **Cadastrar e usar** tem de dar a mensagem sobre família, não um 500.
4. Selecionar o item, criar o material, conferir que ele **aparece selecionado** no `<select>` de
   material do resultado.
5. Adicionar peça + sobra, confirmar, e conferir os **três toasts** (sucesso, e o de rendimento).
6. Reabrir a remessa e conferir a coluna **Transformado** e a linha "Retornos recebidos" com o
   rótulo `[peça, R$ 25/un]`.

> **Este step não tem automação e, se não for executado, tem de ficar REGISTRADO como pendência na
> Task 10** — foi exatamente o que aconteceu com o Step 11 da Task 9 da 8b (cor dos badges e PDF),
> que ficou pendente e está no plano dela dizendo isso.

- [ ] **Step 11: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add client/src/components/almoxarifado/RemessasTerceirosAlmoxarifado.js \
        client/src/components/almoxarifado/RemessasTerceirosTransformacao.test.js
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 9: modal de transformacao com N resultados, classificacao e rendimento

O modal de retorno da 8b e um item por vez, sem seletor de material: um select de item, um input de
quantidade e a NF. A transformacao precisa de N linhas de resultado, cada uma com material proprio,
quantidade propria e classificacao PECA/SOBRA — e de um caminho para o operador criar o material
resultante, porque o backend RECUSA material inexistente de proposito (decisao 6: cadastro-lixo em
almoxarifado nao se apaga, ele ganha saldo).

Modal IRMAO e nao um modo do de retorno: os dois numeros da decisao 1 (quantidade_consumida na
unidade da chapa, resultados[] cada um na sua) sao o coracao da tela, e um modo com campos que
aparecem e somem produziria exatamente a troca que o teste principal desta task existe para pegar —
mandar 40 (UN) como quantidade consumida cabe no teto de 100 (KG) e NAO daria erro nenhum.

O atalho "Criar material resultante" tem GATE PROPRIO: criar_material, nao remessar_terceiro. Sao
listas de perfis diferentes (ENGENHARIA cria material e nao transforma), e barrar pelo gate da
transformacao tiraria a funcao de quem tem direito a ela. Foi achado ao conferir permissions.js, o
design nao mencionava. Ele herda familia e proprietario da chapa e manda codigo_auto: 1, porque
GET /proximo-codigo devolve o mesmo numero para N chamadas concorrentes.

O rendimento aparece como toast.info e nao warn: nao ha nada errado em um material sem peso
cadastrado, e alerta amarelo ensina o operador a ignorar alertas.

A tabela de detalhe passou a separar Retornado de Transformado. Motivo: quantidade_retornada do item
ja significava DUAS coisas (voltou / foi liquidado no encerramento) e com a 8c passa a significar
TRES. DESCARTADO criar a coluna quantidade_baixada agora (pendencia que a 8b mandou a 8c decidir):
obrigaria a migrar os dois significados ja gravados e a mexer em encerrar, cancelar e na tela — tres
caminhos estaveis, por um problema de ROTULO e nao de numero. Quem distingue e tipo_resultado na
linha de resultado, e a pendencia foi reescrita dizendo que agora sao tres.

As duas recusas do lado da tela (mesma chapa como resultado; dono diferente) ESPELHAM o servidor,
adiantadas para o operador nao montar cinco linhas e perder tudo no Confirmar. Quem decide continua
sendo o backend, com a mesma frase.

Testes: 14 em RemessasTerceirosTransformacao.test.js, com dois controles positivos (o gate do atalho
e o rendimento calculavel). Sabotagens executadas: trocar os dois numeros, trocar o gate do atalho,
fixar a classificacao em PECA e desligar o rendimento.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---
### Task 10: documentação e verificação final

**Esta task não é burocracia — é a regra nº 1 do `CLAUDE.md`, e ela existe porque já falhou:**
código foi entregue e as specs continuaram dizendo que a feature não existia. Uma sessão nova (ou
outra máquina) lê os documentos primeiro e é **ativamente enganada** por eles.

**Files:**
- Modify: `specs/modulo-almoxarifado/14-materiais-terceiros/README.md`
- Modify: `specs/modulo-almoxarifado/README.md`
- Modify: `specs/modulo-almoxarifado/03-motor-estoque/README.md`
- Modify: `specs/modulo-almoxarifado/01-cadastro-materiais/README.md` (se existir com esse nome —
  confirme com `ls specs/modulo-almoxarifado/`; é a spec que carrega a dívida das categorias
  hardcoded do front e o `INSERT` inline do handler)
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md`
- Modify: `docs/almoxarifado-novidades-por-etapa.md`
- Modify: `docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md` (este arquivo)

---

- [ ] **Step 1: Medir os gates de verdade, e anotar os números REAIS**

Rodar, **na ordem**, e **anotar a saída literal de cada um**:

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation
cd server && npm run test:safealter
cd server && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Preencher a tabela abaixo **neste arquivo**, no cabeçalho de conclusão (Step 6), com o número
**medido**. **Número inventado em documento de fechamento é pior que número divergente explicado** —
foi a regra que a Task 10 da 8b fixou quando o client deu 268 testes e o plano previa 255.

| Suíte | Previsto neste plano | **Medido** |
|---|---|---|
| `server && npm run test:api` | entrada + **4 arquivos novos** | *preencher* |
| `server && npm run test:almoxarifado` | igual à entrada | *preencher* |
| `server && npm run test:validation` | `4 passed, 0 failed` | *preencher* |
| `server && npm run test:safealter` | `3 passed, 0 failed` | *preencher* |
| `server && npm run test:sqlite` | `3 passed, 0 failed` | *preencher* |
| `client && npx react-scripts test` | entrada + **14 testes**, +1 suíte | *preencher* |
| `client && npx react-scripts build` | `Compiled successfully.` | *preencher* |

Os quatro arquivos novos de `tests/api/`: `materialServiceCriacao` (12),
`recebimentoCustoMedio` (5), `transformacaoMotor` (12), `transformCost` (17), mais o crescimento de
`transformacaoTerceiro` (47). **Total previsto de testes novos no servidor: 93.**

- [ ] **Step 2: Sonda executada — não confie em suíte verde para o estado do banco**

Regra registrada da 8b (`almoxarifado-review-por-execucao`): **no motor de estoque, sonda executada
acha o que leitura e suíte verde não acham.** Rodar este script uma vez, contra um banco de teste
descartável, e **colar a saída** no fechamento:

```bash
cd server && node -e "
const { createTestApp } = require('./tests/helpers/testApp');
const { dbRun, dbGet, dbAll } = require('./services/almoxarifado/db');
const svc = require('./services/almoxarifado/thirdPartyService');
const U = { id: 1, nome: 'Sonda', role: 'admin', is_superadmin: 1, email: 's@t.com' };
(async () => {
  const { db, close } = await createTestApp({ user: U });
  const chapa = (await dbRun(db, \"INSERT INTO materiais_almoxarifado (codigo,nome,unidade,quantidade_atual,custo_medio,custo_unitario,peso_unitario,ativo) VALUES ('SONDA-CHP','Chapa',' KG',100,10,10,7.85,1)\")).lastID;
  const peca  = (await dbRun(db, \"INSERT INTO materiais_almoxarifado (codigo,nome,unidade,quantidade_atual,ativo,peso_unitario) VALUES ('SONDA-PC','Peca','UN',0,1,15)\")).lastID;
  const sobra = (await dbRun(db, \"INSERT INTO materiais_almoxarifado (codigo,nome,unidade,quantidade_atual,ativo,peso_unitario) VALUES ('SONDA-SB','Sobra','KG',0,1,120)\")).lastID;
  const rem = await svc.criarRemessa(db, U, { fornecedor_nome: 'Corte Oeste', itens: [{ material_id: chapa, quantidade: 100 }] });
  await svc.enviarRemessa(db, U, rem.id);
  const it = await dbGet(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [rem.id]);
  const r = await svc.registrarTransformacao(db, U, rem.id, { nota_fiscal: 'NF-SONDA', itens: [{
    item_remessa_id: it.id, quantidade_consumida: 100, custo_servico: 0, resultados: [
      { material_id: peca, quantidade: 40, tipo_resultado: 'PECA' },
      { material_id: sobra, quantidade: 1, tipo_resultado: 'SOBRA' } ] }] });
  console.log('RESPOSTA:', JSON.stringify(r, null, 2));
  console.log('MATERIAIS:', JSON.stringify(await dbAll(db, 'SELECT codigo, quantidade_atual, quantidade_em_terceiros, custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id IN (?,?,?)', [chapa, peca, sobra]), null, 2));
  console.log('LINHAS:', JSON.stringify(await dbAll(db, 'SELECT material_id, quantidade, tipo_resultado, custo_unitario_aplicado, movimentacao_id, movimentacao_consumo_id FROM retornos_remessa_item_almoxarifado'), null, 2));
  console.log('LEDGER:', JSON.stringify(await dbAll(db, 'SELECT id, material_id, tipo, quantidade, saldo_anterior, saldo_posterior FROM movimentacoes_almoxarifado ORDER BY id'), null, 2));
  console.log('ITEM:', JSON.stringify(await dbGet(db, 'SELECT quantidade, quantidade_retornada FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [it.id])));
  await close();
})();
"
```

**O que conferir na saída, item por item** (se qualquer um destes não bater, **é bug e não
formatação**):
1. `SONDA-CHP`: `quantidade_atual = 0` **e** `quantidade_em_terceiros = 0`.
2. `SONDA-PC`: `quantidade_atual = 40`, `custo_medio = 25`, `custo_unitario = 25`.
3. `SONDA-SB`: `quantidade_atual = 1`, `custo_medio = 0` (o crédito a custo zero **não escreve** custo).
4. `LINHAS`: duas, com `tipo_resultado` `PECA`/`SOBRA`, `custo_unitario_aplicado` 25/0 e o **mesmo**
   `movimentacao_consumo_id`.
5. `LEDGER`: **um** `CONSUMO_TERCEIRO` no material da chapa, e o `id` dele **menor** que os dois
   `RETORNO_TRANSFORMACAO` — é isso que prova a ordem da decisão 9.
6. `ITEM`: `quantidade_retornada = 100`.
7. `RESPOSTA.rendimento[0].rendimento_percentual = 91.72`.

- [ ] **Step 3: `specs/modulo-almoxarifado/14-materiais-terceiros/README.md`**

Atualizar: **status no topo** (a feature 14 fecha com a 8c — as duas metades, retorno do mesmo
material e transformação) e **cada item do checklist com o hash do commit**. Itens que ficarem de
fora precisam do **motivo escrito ali**; deixar desmarcado sem explicação parece esquecimento.

**Três correções de spec obrigatórias nesta task** (a regra do `CLAUDE.md`: se a spec estava errada,
**diga que estava errada**, não apague em silêncio):

1. **A decisão 4 do design da 8c afirma que o invariante de valor "fecha sozinho" porque "não há um
   segundo lugar onde o patrimônio possa discordar". ERRADO** — há dois, e a própria decisão 11.1 do
   mesmo documento os nomeia: as duas famílias de leitura (`custo_unitario` sozinho em
   `routes/almoxarifado.js:249` e `:1048` contra `COALESCE(custo_medio, custo_unitario)` em
   `reportService.js:10`, `stockService.js:1870` e `requisitionValueApprovalService.js:61`), e o
   fato de o ramo de entrada com custo escrever as duas colunas com valores **diferentes**. O
   invariante fecha **na função pura** e nas telas **quando os materiais de destino não têm custo
   prévio e a leitura é uma só**. Escrever isso, com o texto errado citado.
2. **A pendência 5 do plano da 8b** (`quantidade_retornada` significa LIQUIDADO, não "voltou", e
   *"a 8c decide junto com a transformação"*) — **a 8c NÃO criou `quantidade_baixada`, e agora são
   TRÊS significados** (voltou / liquidado / consumido na transformação). Reescrever a pendência
   dizendo isso, com o motivo da adiação (migrar dois significados já gravados + mexer em encerrar,
   cancelar e tela, por um problema de rótulo e não de número) e com o que a 8c entregou no lugar
   (`tipo_resultado` na linha e o desdobramento na tela).
3. **A pendência 4 da 8b** (`SENSITIVE_MATERIAL_FIELDS` protege por lista de exclusão, e *"a 8c cai
   aqui"*) — **a 8c NÃO caiu aqui**, porque não acrescentou coluna em `materiais_almoxarifado`.
   Registrar que a pendência **continua aberta** e que a 8c passou ao lado dela por sorte de escopo,
   não por ter sido resolvida.

Acrescentar ao final da spec 14 o **contrato novo** que a 8c produz e que a próxima etapa consome:
`registrarTransformacao`, as três colunas, `RETORNO_TRANSFORMACAO`, `transformCost.ratearCusto` e
`calcularRendimento`, e a rota.

- [ ] **Step 4: `specs/modulo-almoxarifado/README.md`, `03-motor-estoque` e a spec de cadastro**

- **README mestre:** a linha da feature 14 no mapa de status passa a **completa**, com a data e a
  faixa de commits da 8c.
- **`03-motor-estoque/README.md`:** acrescentar `RETORNO_TRANSFORMACAO` à lista de tipos, dizendo
  que é **entrada**, que aceita custo, que está em `TIPOS_DEDICADOS` (logo, fora da rota genérica) e
  que entra nas **duas** listas `tiposEntrada`. Registrar também, na seção de custo, que **o
  recebimento por NF passa a alimentar o custo médio** (Task 2) — é mudança de comportamento do
  motor vista de fora, e a spec dizia que o único alimentador era a movimentação manual.
- **Spec de cadastro de materiais:** o `INSERT INTO materiais_almoxarifado` deixou de estar inline no
  handler e virou `materialService.createMaterial`; `GET /proximo-codigo` deixou de usar
  `ORDER BY id DESC`. Registrar também que a dívida das **categorias hardcoded no front**
  (`MaterialAlmoxarifadoForm.js:13-16`, lista diferente da tabela seedada, sem a categoria da sobra)
  **continua aberta** — a 8c a encostou (a sobra usa categoria que já existe no seed) e **não** a
  resolveu, porque resolvê-la mexe em três telas por um motivo que não é o desta etapa.

- [ ] **Step 5: `docs/almoxarifado-guia-etapas-e-testes.md`**

Este é o documento que o **usuário** lê. Três coisas:

**(a) O cabeçalho "Onde o desenvolvimento parou"** — hoje diz *"Etapas 1 a 8b completas […] Próxima
etapa da ordem: Etapa 8c — transformação […] ainda não tem design"*. Substituir pelo bloco da 8c,
mantendo os blocos anteriores abaixo (o guia acumula histórico).

**(b) Seção "Etapa 8c" nova**, em linguagem de usuário, com a tabela **Antes → Agora**:

| Situação | Antes (até a 8b) | Agora (8c) |
|---|---|---|
| Chapa mandada cortar volta como 40 peças | O sistema **recusava** o retorno, com uma mensagem dizendo "isso é a Etapa 8c". Sobravam duas saídas ruins: registrar como se a chapa tivesse voltado inteira (o estoque passa a ter uma chapa que não existe) ou não registrar nada (o material some do controle na hora em que vira produto) | Botão **Transformar**: você diz **quanto da chapa foi consumido** e **o que voltou** (N linhas: peças e sobra). A chapa é baixada de verdade e as peças entram no estoque |
| Custo das peças | Não havia peça no estoque; não havia custo | O custo da chapa é **dividido entre as peças pela quantidade**. A **sobra entra a custo zero** — de propósito: ela é uma linha só e uma fatia grande, e rateá-la deixaria as peças ~40% mais caras |
| Custo do serviço do terceiro (a nota do cortador) | Não entrava em lugar nenhum | Campo opcional no modal. Se preenchido, **soma ao custo das peças** — a peça não é peça sem o corte. Em branco, não entra: o sistema **não estima** |
| Custo médio dos materiais recebidos por NF | Só era alimentado por movimentação manual com custo digitado à mão. Quase todo material tinha custo médio **zerado** | O recebimento por NF passa a alimentar o custo médio com o `valor_unitario` da linha da nota. **Vale só daqui para frente** — não há como recalcular o passado |
| Chapa de cliente cortada | — | A peça **tem de estar cadastrada com o mesmo dono da chapa**. Se não estiver, o sistema recusa **dizendo de quem é cada um** — sem isso, material do cliente viraria patrimônio da GMP em silêncio |
| Material da peça ainda não cadastrado | — | O sistema **não cria sozinho** (cadastro-lixo em almoxarifado não se apaga — ele ganha saldo). O modal tem o botão **Criar material resultante**, que cadastra na hora já com a **família e o dono da chapa** |
| Conferir se os pesos fecham | — | Quando **todos** os materiais têm peso cadastrado, aparece o **rendimento** (peso que voltou ÷ peso que saiu). Quando falta peso, o sistema diz **qual material** falta — e **deixa registrar do mesmo jeito** |
| Criar vários materiais de uma vez | O gerador de código repetia o número: cadastrar 5 peças seguidas dava erro de "Código já existe" | O gerador usa o **maior número** da família e o cadastro **tenta de novo** sozinho quando dois pedidos batem |

**(c) Roteiro de teste manual clicável** (numerado, sem pular passo):

1. **Almoxarifado → Recebimentos**: dar entrada numa nota com uma chapa, **100 KG a R$ 10** — e
   conferir em **Materiais** que o custo médio da chapa ficou **R$ 10** (antes ficava R$ 0).
2. **Almoxarifado → Remessas a Terceiros → Nova remessa**: terceiro "Corte a Laser", serviço
   "Corte", item = a chapa, quantidade 100. **Enviar**.
3. Conferir em **Materiais** que a chapa **sumiu do disponível** e **continua no total**.
4. Voltar em Remessas, **Abrir** a remessa e clicar em **Transformar**.
5. Selecionar o item, **Quantidade consumida = 100**.
6. Clicar em **Criar material resultante**, nome "Peça cortada 010", unidade "UN", **Cadastrar e
   usar**. Conferir que o código gerado segue a família da chapa e que ele **já vem selecionado**.
7. Quantidade do resultado = **40**, Classificação = **Peça**, **Adicionar resultado**.
8. Selecionar um material de sobra, quantidade **12**, Classificação = **Sobra**,
   **Adicionar resultado**.
9. **Confirmar transformação**. Conferir os toasts (sucesso e rendimento).
10. Em **Materiais**: a chapa está **zerada** (total **e** disponível); a peça tem **40 UN** e custo
    médio **R$ 25**; a sobra tem 12 e custo **R$ 0**.
11. Reabrir a remessa: coluna **Transformado** com 100, e a linha "Retornos recebidos" mostrando
    `[peça, R$ 25/un]` e `[sobra]`.
12. **O teste da recusa:** tentar transformar de novo (a remessa já está ENCERRADA) — o botão
    **Transformar** não deve nem aparecer.
13. **O teste do dono:** criar uma remessa com uma chapa **de cliente**, enviar, e tentar transformar
    para um material **nosso**. O sistema tem de recusar **nomeando os dois donos**.

**(d) O que a etapa NÃO cobre** (copiar da decisão 10 do design, em linguagem de usuário):
não planeja o corte (não há lista de materiais/nesting) — registra o que voltou; não controla corte
feito **dentro** da GMP; **não recalcula** o custo de nada que entrou antes desta etapa; não valida
que os pesos fecham; não conserta a divergência entre as telas de patrimônio (é anterior e está
registrada); não manda e-mail nem alerta.

- [ ] **Step 6: `docs/almoxarifado-novidades-por-etapa.md`**

Acrescentar a linha da 8c na tabela "Visão geral":

```
| 8c | Transformação no Terceiro | 2026-08-13 | A chapa que sai para corte e volta como 40 peças e uma sobra para de mentir no estoque: a chapa é baixada de verdade e as peças entram com o custo dela rateado |
```

E a seção completa da 8c (o que o usuário vê de novo, o que melhorou por baixo do capô, e o
"antes → agora"). **Conferir cada frase contra o código antes de publicar** — foi por causa desta
regra que a Task 10 da 8b achou **duas** afirmações confortáveis e falsas em textos que o próprio
plano trazia prontos ("o botão nem aparece na tela"; "a listagem tem filtro por fornecedor"). **Duas
frases desta etapa que são candidatas ao mesmo erro e precisam ser conferidas abrindo o arquivo:**
- *"o botão Criar material resultante não aparece para quem não pode"* — **falso**: ele **aparece**;
  `bloquearSeNaoPode` barra no `onClick` e **falha aberto** de propósito.
- *"o rendimento aparece na tela da remessa"* — **falso**: ele aparece **num toast, uma vez, logo
  depois de confirmar**. Não fica guardado em lugar nenhum (não há coluna de rendimento). Se quiser
  que fique, é etapa nova.

- [ ] **Step 7: Fechar este plano**

No topo deste arquivo, acrescentar o cabeçalho de conclusão, no molde do plano da 8b:

```markdown
## ✅ ETAPA CONCLUÍDA — 2026-08-13 (`<hash-inicial>..<hash-final>`)

**As 10 tasks foram executadas.** O que a etapa entrega: [uma frase].

### Task → o quê → hash
| Task | O quê | Hash |
...

### Gates — números REAIS, medidos na Task 10
[a tabela do Step 1, preenchida]

### Sonda executada (Step 2)
[a saída, e o que cada item prova]

### Correções de spec declaradas por esta etapa
[as três do Step 3]

### O que só a EXECUÇÃO achou — leitura e suíte verde não achavam
[preencher durante a execução; se ficar vazia, DESCONFIE: a 8b achou quatro]

### Pendências que a etapa deixa registradas (não consertadas)
1. `quantidade_retornada` agora tem TRÊS significados (ver C7).
2. `SENSITIVE_MATERIAL_FIELDS` continua protegendo por lista de exclusão — a 8c passou ao lado.
3. Categorias hardcoded no front (`MaterialAlmoxarifadoForm.js:13-16`).
4. As duas famílias de leitura de valor continuam divergindo entre telas (decisão 11.1).
5. Estorno não reverte custo (decisão 11.2) — e a compensação da transformação reverte à mão,
   o que é uma inconsistência **deliberada** entre os dois caminhos, documentada no código.
6. `buildLocalizacaoPath`/`formatLocalizacaoLabel` estão duplicados entre `routes/almoxarifado.js` e
   `materialService.js` (Task 1, Step 4).
7. Verificação manual no navegador (Task 9, Step 10) — **marcar EXECUTADO ou PENDENTE**.
8. `AJUSTE` continua sem reconciliar retenção (pendência 1 da 8b, terceira instância).
```

- [ ] **Step 8: Commit**

```bash
cd /c/Users/User/projetos/CRM
git add specs/modulo-almoxarifado/14-materiais-terceiros/README.md \
        specs/modulo-almoxarifado/README.md \
        specs/modulo-almoxarifado/03-motor-estoque/README.md \
        docs/almoxarifado-guia-etapas-e-testes.md \
        docs/almoxarifado-novidades-por-etapa.md \
        docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md
git commit -m "$(cat <<'MSG'
Almoxarifado Etapa 8c Task 10: documentacao, correcoes de spec e verificacao final

Documentacao desatualizada e trabalho nao terminado: ja aconteceu de codigo ser entregue e as specs
continuarem dizendo que a feature nao existia, e uma sessao nova le os documentos primeiro e e
ativamente enganada por eles.

TRES correcoes de spec declaradas, em vez de apagadas em silencio:

1. O design da 8c afirmava, na decisao 4, que o invariante de valor "fecha sozinho" porque "nao ha um
segundo lugar onde o patrimonio possa discordar". ERRADO, e a propria decisao 11.1 do mesmo documento
nomeia os dois: as duas familias de leitura de valor (custo_unitario sozinho contra
COALESCE(custo_medio, custo_unitario)) e o fato de o ramo de entrada com custo escrever as duas
colunas com valores diferentes. O invariante fecha na funcao pura, e nas telas fecha quando os
materiais de destino nao tem custo previo e a leitura e uma so.

2. A pendencia 5 da 8b dizia que "a 8c decide junto com a transformacao" o problema de
quantidade_retornada significar LIQUIDADO e nao "voltou". A 8c NAO criou quantidade_baixada, e agora
sao TRES significados. A pendencia foi reescrita dizendo isso — apaga-la porque a etapa encostou nela
seria o erro que o CLAUDE.md proibe.

3. A pendencia 4 da 8b dizia que "a 8c cai aqui" no problema de SENSITIVE_MATERIAL_FIELDS proteger
por lista de exclusao. A 8c NAO caiu: nao acrescentou coluna em materiais_almoxarifado. Registrado
que a pendencia continua aberta e que a 8c passou ao lado por sorte de escopo, nao por resolucao.

O guia de usuario ganhou a secao da 8c com "Antes -> Agora", roteiro de 13 cliques e o que a etapa
NAO cobre. Duas frases confortaveis foram conferidas contra o codigo antes de publicar e sairam:
"o botao nem aparece para quem nao pode" (ele APARECE; bloquearSeNaoPode barra no onClick e falha
aberto) e "o rendimento aparece na tela da remessa" (aparece num toast, uma vez, e nao fica guardado
— nao ha coluna de rendimento). Foi por essa mesma checagem que a Task 10 da 8b achou dois textos
prontos que descreviam a tela melhor do que ela e.

Numeros dos gates: medidos, nao copiados do plano.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Self-review do plano

### 1. Cobertura do design — decisão por decisão

| Decisão do design | Onde vive no plano | Coberta? |
|---|---|---|
| **1.** Retorno com transformação separa consumido de retornado (`quantidade_consumida` × `resultados[]`) | Task 7 (pré-checagem chama `validarRetornoDoItem` com `quantidade_consumida` e **sem** `materialId`); Task 8 (`TransformacaoRemessaSchema`); Task 9 (o modal com os dois campos). Testes: `quantidade_consumida acima do pendente falha`, `resultado em unidade diferente NAO conta no teto`, `o modal manda os DOIS numeros separados` | ✅ |
| **2.** Tipo novo `RETORNO_TRANSFORMACAO` (entrada, aceita custo, `TIPOS_DEDICADOS`) | Task 4 inteira, incluindo **as duas** listas `tiposEntrada` (contradição C5) | ✅ |
| **3.** A peça tem de ter o mesmo dono da chapa | Task 5 (`assertMesmoDonoNaTransformacao`, 6 testes, 2 controles positivos); Task 7 (chamada na pré-checagem); Task 9 (recusa adiantada na tela) | ✅ |
| **4.** Rateio por quantidade, sobra a zero, `custo_servico` opcional, invariante | Task 6 (função pura, 12 testes incluindo o invariante); Task 7 (integração, `[INVARIANTE]` medido no banco). Limites declarados em C1, C2 e C3 | ✅ **com três ressalvas escritas** |
| **5.** Recebimento por NF alimenta custo médio | Task 2 (5 testes, com o par bilateral e a sabotagem no motor) | ✅ |
| **6.** Material tem de existir; a tela ajuda a criar; `createMaterial` extraído; `proximo-codigo` em lote | Task 1 (extração + `MAX` + `codigo_auto`); Task 7 (recusa que ensina o caminho); Task 9 (o atalho, com o gate `criar_material`) | ✅ **com C4 declarado** |
| **7.** Rendimento informativo, nunca bloqueia, diz qual material falta | Task 8 (`calcularRendimento` + rota + resposta); Task 9 (o toast). Teste `[rendimento] NUNCA bloqueia` | ✅ |
| **8.** Sobra é classificação da linha, não material especial | Task 3 (`tipo_resultado`, `TIPOS_RESULTADO`); Task 6 (é ela que decide o rateio); Task 9 (o `<select>`). O buraco das categorias hardcoded fica **declarado** na Task 10 | ✅ |
| **9.** Sem transação: pré-checagem, claim, compensação, **baixa antes de creditar** | Task 7 inteira. A ordem tem asserção própria (S1 do Step 5) e a compensação tem dois testes, sendo o decisivo o de **retry** | ✅ **com C6 corrigindo a decisão** |
| **10.** Fora de escopo declarado | Global Constraints + Task 10 Step 5(d). Nenhuma task toca em BOM, ordem de produção, custo por lote/localização, custo no ledger, backfill, categorias do front, e-mail/alerta | ✅ |
| **11.** Duas inconsistências pré-existentes registradas, não consertadas | Task 4 (teste que **fixa** que o estorno não reverte custo); Task 10 Step 3 e Step 7 (pendências 4 e 5) | ✅ |

**Tabela de "Testes exigidos" do design — os 17, um a um:**

| Teste exigido | Onde | ✔ |
|---|---|---|
| `transformacao baixa a chapa e credita as pecas` | Task 7 | ✅ |
| `[invariante] o valor que sai na chapa e o que entra nas pecas` | Task 6 (puro) **e** Task 7 (banco) | ✅ |
| `sobra entra com custo zero e nao dilui as pecas` | Task 6 **e** Task 7 | ✅ |
| `custo_servico informado soma ao valor rateado` | Task 6 **e** Task 7 | ✅ |
| `[controle positivo] chapa com custo zero credita peca com custo zero, sem erro` | Task 6 **e** Task 7 | ✅ |
| `transformacao para material de OUTRO dono falha` | Task 5 | ✅ |
| `[controle positivo] transformacao para material do MESMO dono passa` | Task 5 | ✅ |
| `peca de material inexistente falha ensinando o caminho` | Task 7 | ✅ |
| `quantidade_consumida acima do pendente falha` | Task 7 | ✅ |
| `resultado em unidade diferente NAO conta no teto` | Task 7 | ✅ |
| `falha no credito da segunda peca devolve a chapa` | Task 7 (+ o de retry, que o design não pedia e C6 exige) | ✅ |
| `[schema] resultado nao declarado no Zod nao chega ao servico` | Task 8 | ✅ |
| `recebimento por NF passa a alimentar custo medio` | Task 2 | ✅ |
| `[controle positivo] recebimento sem valor_unitario nao zera o custo existente` | Task 2 (dois: `0` e `undefined`) | ✅ |
| `proximo-codigo em lote nao repete` | Task 1 | ✅ |
| `createMaterial extraido produz o mesmo resultado da rota` | Task 1 (comparação **coluna a coluna**) | ✅ |
| `rendimento nao calculavel diz QUAL material nao tem peso` | Task 8 | ✅ |

### 2. Varredura de placeholders

Procurei os padrões proibidos e **não há**: nenhum "TBD", "implementar depois", "similar à Task N",
"adicione validação apropriada" ou "escreva os testes para o acima". Todo step de código traz o
código literal; toda sabotagem traz o comando (ou, quando `sed` seria inseguro, **diz explicitamente
para usar Edit e por quê**); toda mensagem de erro que os testes casam está escrita no
implementador.

**Três lugares onde o plano manda o executor CONFERIR em vez de assumir**, e isso é deliberado, não
placeholder:
1. Task 2, Step 1 — a assinatura de `receiptService.criarRemessa`/`darEntradaEstoque` **não** foi
   lida linha a linha ao escrever este plano; o plano manda conferir e ajustar **o teste**.
2. Task 3, Step 4 — a linha do `require` de `schemas.js` (`TIPOS_MOVIMENTO, TIPOS_RETENCAO`) pode já
   trazer `TIPOS_DEDICADOS`; o plano manda reler antes de editar.
3. Task 10, Step 3 — o nome exato da spec de cadastro de materiais; o plano manda `ls`.

### 3. Consistência de tipos e nomes

Conferido nome por nome, entre tasks:

| Nome | Definido em | Usado em | Bate? |
|---|---|---|---|
| `tipo_resultado` (coluna e campo Zod e campo de API) | Task 3 | Tasks 6, 7, 8, 9 | ✅ |
| `TIPOS_RESULTADO` | Task 3 (`schema.js`) | Task 3 (Zod), Task 6 (validação) | ✅ |
| `custo_unitario_aplicado` | Task 3 | Task 6 (**saída** de `ratearCusto`), Task 7 (INSERT), Task 8 (teste do Zod), Task 9 (tela) | ✅ |
| `movimentacao_consumo_id` | Task 3 | Task 7 (INSERT), Task 8 (`getRemessa`) | ✅ |
| `RETORNO_TRANSFORMACAO` | Task 4 | Task 7 | ✅ |
| `assertMesmoDonoNaTransformacao(db, materialOrigem, materialResultado)` | Task 5 | Task 7 (mesma ordem de argumentos) | ✅ |
| `ratearCusto({ custoUnitarioChapa, quantidadeConsumida, custoServico, resultados })` | Task 6 | Task 7 (mesmas quatro chaves) | ✅ |
| `ratearCusto(...).linhas[].custo_unitario_aplicado` | Task 6 | Task 7 (lido no laço de crédito) | ✅ |
| `calcularRendimento({ materialOrigem, quantidadeConsumida, resultados })` — cada resultado precisa de `.material.{codigo,peso_unitario}` | Task 8 | Task 7 passa `rateio.linhas`, que **carregam `.material`** porque `resolvidos` o acrescenta e `ratearCusto` **preserva os campos de entrada** (testado em Task 6) | ✅ **— este era o encaixe mais frágil do plano; é a razão do teste `a funcao PRESERVA os campos das linhas de entrada`** |
| `registrarTransformacao(db, user, remessaId, data)` | Task 7 | Task 8 (rota) | ✅ |
| `custo_servico` (nível de **item**, não de resultado) | Task 7 | Task 8 (Zod), Task 9 (form) | ✅ |
| `codigo_auto` | Task 1 (`MaterialShape` + `createMaterial`) | Task 9 (o atalho manda `codigo_auto: 1`) | ✅ |
| `materialService.proximoCodigo(db, familiaId)` | Task 1 | Task 1 (rota), Task 9 (via `GET /proximo-codigo`) | ✅ |
| `STATUS_COM_TRANSFORMACAO` | Task 9 | Task 9 | ✅ |

**Uma inconsistência achada e corrigida durante este self-review:** a Task 7 escrevia
`resolvidos.push({ ...r, material_id: matRes.id, material: matRes })` e a Task 8 lê
`resultado.material.peso_unitario`. Se `ratearCusto` **mutasse** ou **reconstruísse** as linhas sem
espalhar (`...r`), `material` sumiria e `calcularRendimento` diria "sem peso" para tudo, sempre — um
bug silencioso que **passaria em todos os testes de rateio**. O teste
`a funcao PRESERVA os campos das linhas de entrada` (Task 6) e o
`a funcao NAO muta o array de entrada` (Task 6) existem exatamente por isso, e a implementação de
`ratearCusto` faz `resultados.map((r) => ({ ...r, custo_unitario_aplicado }))`.

**Uma segunda, também corrigida:** a Task 7 declara `const rendimentos = []` **na Task 8**, não na 7.
Está escrito no Step 5 da Task 8 que o `const` entra junto de `const efetivados = []` — se a Task 7
for executada isolada e a 8 não, o `return` da 7 **não** tem `rendimento`, e isso está declarado no
bloco **Interfaces** da Task 7 ("`rendimento` NÃO faz parte desta task").

### 4. Duas decisões que eu tomei e o design não tomou — sinalizadas para revisão

1. **Não criar `quantidade_baixada`** (C7). A 8b mandou a 8c decidir; a 8c decidiu **adiar de novo**,
   e agora a coluna tem três significados. **Se o revisor achar que três é demais, a hora de criar a
   coluna é agora e não depois** — o custo cresce a cada etapa.
2. **A compensação restaura o custo à mão**, contrariando a decisão da Etapa 1 de o estorno não
   reverter custo. Argumentei que a contradição é aparente (compensação ≠ estorno), mas o resultado
   é que **existem dois caminhos com políticas de custo diferentes** no mesmo módulo. Está comentado
   no código e testado. **Se o revisor preferir uniformidade, a alternativa é aceitar que uma
   transformação que falhou deixe o custo médio movido** — e essa alternativa precisa de um teste
   que a fixe, não de silêncio.

---

## Próxima tarefa

**A feature 14 fecha com a 8c.** As duas metades estão entregues: retorno do mesmo material (8b,
tratamento/pintura/galvanização) e transformação (8c, corte/dobra/usinagem). Não há Etapa 8d.

**O contrato que a 8c deixa pronto para quem vier depois:**
- `thirdPartyService.registrarTransformacao(db, user, remessaId, data)` e a rota
  `POST /almoxarifado/remessas-terceiros/:id/transformacoes`.
- `retornos_remessa_item_almoxarifado.{tipo_resultado, custo_unitario_aplicado, movimentacao_consumo_id}`
  — e `movimentacao_consumo_id` é o **agrupador de evento** de qualquer relatório de transformação.
- `services/almoxarifado/transformCost.js` — `ratearCusto` e `calcularRendimento`, **puras**, sem
  `db`. Trocar a base do rateio (peso, área, linha) é mudança de **um** arquivo.
- `services/almoxarifado/materialService.js` — `createMaterial` e `proximoCodigo`. **Qualquer etapa
  que precise criar material a partir de outro serviço já tem por onde.**
- `RETORNO_TRANSFORMACAO` no motor, e o recebimento por NF alimentando o custo médio.

**As três candidatas naturais à próxima etapa, em ordem de dívida acumulada:**

1. **A decisão do cliente sobre `AJUSTE` e retenção — TERCEIRA instância, e agora QUARTA
   coluna.** Pendência 1 da 8b, ainda aberta: `AJUSTE` grava `quantidade_atual` fora do motor
   (`aplicar_ajustes` da conferência) e **não reconcilia nenhuma das quatro retenções**. A 8c não
   piorou, mas também não ajudou. **É pergunta ao cliente antes de ser código**: quando o inventário
   ajusta um material com saldo em terceiros, o ajuste baixa a retenção, recusa, ou avisa?
2. **A divergência entre as telas de patrimônio (decisão 11.1).** Duas famílias de leitura de valor,
   e agora que o recebimento alimenta `custo_medio` de verdade (Task 2), **os números vão divergir
   mais**, não menos — antes as duas leituras davam quase sempre o mesmo, porque `custo_medio` era
   quase sempre zero e o `COALESCE` caía em `custo_unitario`. **Esta etapa tornou uma inconsistência
   dormente em visível.** É a primeira coisa que alguém vai perguntar depois de usar a 8c.
3. **Categorias hardcoded no front** (`MaterialAlmoxarifadoForm.js:13-16`): lista diferente da
   tabela seedada, sem a categoria da sobra. A 8c encostou e não resolveu; resolver mexe em três
   telas.

**E uma pergunta de negócio que a 8c cria e não responde:** o rendimento é calculado, mostrado num
toast e **jogado fora** — não há coluna que o guarde. Se a GMP quiser acompanhar rendimento por
terceiro ou por tipo de serviço (a pergunta óbvia depois de ver o número duas vezes), isso é etapa
própria: precisa de coluna (ou de um relatório que refaça a conta a partir de
`movimentacao_consumo_id`) e de tela. **Não invente isso antes de a GMP pedir** — mas saiba que
`movimentacao_consumo_id` já é o agrupador que esse relatório usaria, e foi escolhido pensando nele.

**A primeira ação de quem pegar a próxima etapa é `superpowers:brainstorming` com este briefing** —
e, se for a nº 1 ou a nº 3, **uma pergunta ao cliente antes de qualquer código**.
