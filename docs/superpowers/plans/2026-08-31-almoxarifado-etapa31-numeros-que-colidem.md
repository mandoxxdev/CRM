# Etapa 31 — Os quatro geradores de número colidem (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** os quatro números de documento do módulo (`INV-`, `REQ-`, `REC-`, `REM-`) param de
colidir. Um gerador só, com carimbo de tempo que **não dá a volta** e entropia larga, mais um
retry curto como cinto de segurança.

**Architecture:** módulo novo `server/services/almoxarifado/numeroDoc.js`, consumido pelos quatro
pontos de escrita. **Nenhuma mudança de schema, nenhuma migração de dado.**

**Spec:** `docs/superpowers/specs/2026-08-31-almoxarifado-etapa31-numeros-que-colidem-design.md`.

> **REESCRITO PELA FASE 2** (8 correções obrigatórias + 7 melhorias, todas medidas contra o
> código): (1) o base36 dá 8 chars até **2059**, não 5138 — 5138 era o 5188 mal copiado;
> (2) os números novos ficam **mais LONGOS**, não mais curtos — todos crescem; (3) *"nos quatro
> pontos o INSERT é a primeira escrita"* é **falso no `REQ`**, e como o plano mandava **parar**
> nesse caso, ele travaria a Task 2 por um não-problema; (4) `inserirComNumeroUnico` **não devolvia
> o número**, e os quatro chamadores precisam dele **depois** do INSERT — um executor seguindo a
> letra devolveria o número da **primeira** tentativa enquanto o banco guardou o da terceira;
> (5) a Task 3, como escrita, **passava com esse mesmo defeito**; (6) a receita de forçar a colisão
> **não podia dar certo** (com `Math.random` preso, as 5 tentativas geram o mesmo número e o fluxo
> termina em erro, não em sucesso); (7) a Task 2 **não tinha nenhum cenário que caísse** — o
> controle positivo dela era no-op; (8) a régua do erro casa também `series_almoxarifado.numero`.
> Onde diz "ESTAVA ERRADO", vale a versão atual.

> **Esta etapa não é de feature — é de defeito.** Ela não aparece em nenhuma tela. O que ela muda é
> que dois documentos criados no mesmo instante deixam de disputar 100 sufixos, e que o carimbo de
> tempo deixa de repetir a cada 16,7 minutos (`REQ-`) ou 27,78 horas (os outros três).

## Global Constraints

1. `python3`, nunca `python`; `sed` só com âncora contada (`grep -cF` = 1).
2. **COMMITE ANTES DE SABOTAR.** Controle positivo com alvo, `md5sum` antes/depois/restaurado,
   **restaure por CÓPIA (`cp`), NUNCA `git checkout --`** (na Etapa 29 o checkout engoliu junto uma
   correção ainda não commitada), `git diff --stat` vazio, lendo **qual asserção** caiu.
3. Não escreva no banco de desenvolvimento. Nunca `git add -A`. Commit em português, corpo sem
   acento, `git commit -F` com nome único no scratchpad.
4. Testes de API em `server/tests/api/*.api.test.js` — **é o único lugar que o runner descobre**.
   Um módulo puro como `numeroDoc.js` também é testado ali.
5. **O teste do relógio tem de fixar o relógio.** Provar "mil números no mesmo milissegundo" por
   acaso é teste vazio na máquina rápida e falso vermelho na lenta: **stub `Date.now`** e prove
   determinístico. (Regra da `fechar-etapa`: teste que depende de relógio declara isso e falha fora
   do ambiente esperado.)
6. **Não meça a colisão por "rodei e não colidiu".** Ausência de colisão em N execuções não prova
   nada sobre um evento de 1 em 100 — a prova é **contar números distintos** num conjunto gerado
   com o relógio fixo.
7. **A asserção tem de conseguir distinguir o certo do errado.** É a lição comum das Etapas 29 e
   30: lá, fixture simétrica e régua de texto sobre lista manual deixaram 6 testes passarem com a
   feature quebrada. Aqui o risco equivalente é afirmar "o número tem o prefixo certo" — o que
   passa igual com o gerador velho. **E não é hipótese:** a suíte inteira tem **uma** asserção
   sobre estes quatro números, `tests/api/requisicaoCriacao.api.test.js:103`, e ela é exatamente
   essa (`startsWith('REQ-')`). Reverter qualquer um dos quatro pontos **hoje não derruba nada**.
8. **Como se fixa o relógio neste harness** (medido pela Fase 2): `tests/api/run-all.js` roda
   **um processo por arquivo**, em sequência, então um stub global fica contido no arquivo. Não há
   jest aqui — o jeito limpo é:
   ```js
   const real = Date.now; Date.now = () => T_FIXO;
   try { /* ... */ } finally { Date.now = real; }
   ```
   Use um epoch **realista** (`Date.now()` de verdade como base): com `t` pequeno o carimbo tem
   menos de 8 caracteres e qualquer fatiamento por posição desalinha.
9. **Nada de fatiar o número por posição no teste.** O `8` do carimbo é verdade até 2059; um teste
   que faz `numero.slice(4, 12)` re-congela esse 8 em mais um lugar. C1 exporta `carimboTempo(ms)`
   justamente para a RN-02 comparar carimbos sem fatiar string.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | `gerarNumeroDocumento(prefixo)` devolve `<PREFIXO>-<8 chars de tempo><8 aleatórios>`, tudo em maiúsculas, sem separador interno — 20 caracteres com prefixo de 3. **Eram 6 aleatórios; com 6 o cenário da RN-03 colidiria 1 vez em ~4.358 execuções**, virando o flake que esta etapa existe para matar (`36^6 ≈ 2,2×10⁹`, P ≈ `2,3×10⁻⁴`); com 8, `1,8×10⁻⁷` | `numeroDocumento.api.test.js` |
| RN-02 | O carimbo de tempo **não dá a volta**: dois instantes distintos **nunca** produzem o mesmo prefixo de tempo. **Prova direta** — comparar o carimbo de `t` com o de `t + 10⁶ ms` e `t + 10⁸ ms`, que é exatamente onde o gerador antigo repetia | idem (**peso**) |
| RN-03 | **Mil chamadas no MESMO milissegundo** (relógio fixado) produzem **mil números distintos** | idem (**peso**) |
| RN-07 | O `numero` que a rota **devolve** é o mesmo que ficou **gravado** na linha — e o mesmo que foi para a auditoria. Com retry, o número vencedor nasce **dentro** de `inserirComNumeroUnico`; devolver o da primeira tentativa faria o papel impresso não bater com o banco | Task 3 (**peso**) |
| RN-04 | A criação dos quatro documentos retenta ao tomar `UNIQUE constraint` no `numero`, até **5** vezes com número novo a cada tentativa; esgotadas, sobe erro **traduzido** (`'Não foi possível gerar um número único para o documento'`, 500), nunca o texto cru do SQLite | teste com colisão **forçada** |
| RN-05 | Documento gravado no formato **antigo** continua sendo lido, listado, filtrado e impresso — nenhuma tela nem rota valida o formato | teste que grava um `REM-885484687` à mão e o lê pela rota |
| RN-06 | O gerador é **um só**: nenhum dos quatro pontos monta número por conta própria | **verificação manual, NÃO teste** (abaixo) |

> **A RN-06 NÃO vira teste, e a decisão é da Fase 2.** A versão anterior mandava provar "não existe
> outro gerador" com `grep` dentro de um teste, avisando que era frágil. A Fase 2 mostrou que ela
> ficou **redundante**: com a RN-01 aferida por **forma completa** em cada um dos quatro fluxos
> (A7, abaixo), reverter qualquer ponto para a função antiga **já derruba um cenário**. Um teste de
> `grep` só acrescentaria fragilidade — e `grep -c` combinado com `wc -l` foi um dos quatro testes
> vazios documentados nesta base.
> **No lugar dele, um passo de verificação manual na Task 2**, rodado uma vez com controle positivo
> à mão: `grep -rn "Date.now().toString()" server/services/almoxarifado server/routes/almoxarifado.js`
> tem de dar **zero linhas**, e reintroduzir uma de propósito tem de fazê-la aparecer. O resultado
> vai escrito no fechamento da task.

## Contratos congelados

**C1 — `server/services/almoxarifado/numeroDoc.js`** (novo):

```js
carimboTempo(ms)                       // -> 'MTHK5F35'  (8 chars hoje; exportado para a RN-02)
gerarNumeroDocumento(prefixo)          // -> 'REM-MTHK5F35ABC12345'  (prefixo + '-' + 8 + 8)
inserirComNumeroUnico(db, prefixo, fn) // -> { numero, resultado }; fn(numero, db)
NUMERO_TENTATIVAS = 5
RE_COLISAO_NUMERO                      // a regua, exportada para a Task 3 nao duplicar a regex
```

- **Tempo:** `Date.now().toString(36).toUpperCase()`, **inteiro**, sem `slice` — é o `slice` que
  fazia o carimbo dar a volta.
  > **Isto dizia "continuam 8 até o ano 5138". ESTAVA ERRADO** (Fase 2): são 8 caracteres até
  > **2059-05-25** (`36^8 = 2.821.109.907.456` ms); a fronteira 9→10 é que fica em **5188**, e o
  > 5138 era esse número mal copiado. **O que continua verdadeiro é o que importa:** o carimbo
  > **não dá a volta**. O que é falso é a durabilidade do comprimento fixo — daí a Global
  > Constraint 9 proibir fatiar o número por posição no teste.
- **Aleatório: 8 caracteres** base36 maiúsculos (~2,8×10¹² por milissegundo). **Congelado como se
  produz**, porque deixar livre é onde as cópias divergentes recomeçam: **8 sorteios de
  `Math.floor(Math.random() * 36).toString(36)`**. A forma idiomática
  `Math.random().toString(36).slice(2, 10)` **pode devolver menos caracteres** (o double tem
  representação base36 curta em ~2⁻⁴¹ dos sorteios), encurtando o número e derrubando a asserção de
  comprimento sem ninguém entender por quê.
- **`inserirComNumeroUnico` DEVOLVE `{ numero, resultado }`** — `numero` é o que **venceu** (pode
  ser o da 3ª tentativa) e `resultado` é o `{ lastID, changes }` do `dbRun`.
  > **A versão anterior devolvia só "o resultado do `fn`". ERA UM DEFEITO LATENTE**, e a Fase 2
  > mediu: os **quatro** chamadores usam o `numero` **depois** do INSERT — `thirdPartyService.js`
  > na auditoria (`dados_novos: { numero }`) e no retorno, `receiptService.js:157` e
  > `requisitionCreateService.js:146` no retorno, e a rota do `INV` na resposta. Um executor
  > seguindo a letra escreveria `const numero = gerarNumeroDocumento('REM')` antes e devolveria o
  > **primeiro** número enquanto o banco guardou o **terceiro**: o papel impresso deixaria de bater
  > com a linha. Virou a **RN-07**.
- **A régua do erro é ANCORADA:** `/UNIQUE constraint failed:\s*[A-Za-z0-9_]+\.numero\s*$/i`.
  > **A Fase 2 corrigiu esta régua e a correção AINDA ESTAVA ERRADA.** A versão anterior era
  > `/UNIQUE constraint failed:[^\n]*\.numero(\s|,|$)/i`, escrita para *excluir* a série — e ela
  > **não exclui**, porque a mensagem real da série **termina** em `.numero`:
  > `UNIQUE constraint failed: series_almoxarifado.material_id, series_almoxarifado.numero`. O
  > `[^\n]*` atravessa a vírgula e casa. O executor da Task 1 mediu isso rodando a régua do plano
  > como sétimo controle positivo: o cenário (8) — que a própria Task 1 exigia — **caía**.
  > **A régua certa não tem `.*` entre o `failed:` e o nome da coluna**, o que exige UNIQUE de
  > **coluna única**. Verificado nas três mensagens reais: casa remessa, **não** casa série, **não**
  > casa `nota_fiscal`.
  > **Por que isso importa e não é preciosismo:** com a régua frouxa, uma colisão de número de
  > **série** — que é digitado pelo operador — entraria no retry, que gera número de **documento**
  > novo e não resolve nada; cinco tentativas depois o erro sobe **traduzido**, escondendo a causa
  > real atrás de "não foi possível gerar um número único".
  > A Fase 2 mediu a mensagem real: `SQLITE_CONSTRAINT: UNIQUE constraint failed:
  > remessas_terceiro_almoxarifado.numero` (com `err.code = 'SQLITE_CONSTRAINT'`, `errno 19`) —
  > **o retry dispara mesmo, não é código morto**. Mas um `/numero/i` solto casaria também
  > `series_almoxarifado.material_id, series_almoxarifado.numero`, que **não** é documento: o
  > retry passaria a cobrir a série em silêncio. **Qualquer outro erro sobe intacto** — engolir
  > `UNIQUE` genérico esconderia colisão de `nota_fiscal` atrás de um retry mudo.
- **O que `fn` pode conter, dito com precisão** — a versão anterior dizia *"nos quatro pontos o
  INSERT é a primeira escrita do fluxo"* e mandava **parar** se não fosse. **A afirmação é FALSA no
  `REQ`**, e a instrução travaria a Task 2 por um não-problema:
  `requisitionCreateService.js:100` chama `sectorMaterialService.ensureSetoresRequisicao`, que faz
  `CREATE TABLE`, `INSERT` e `UPDATE` **antes** do INSERT da requisição.
  **A regra correta:** `fn` contém **apenas o INSERT do documento**, e **nada é escrito entre a
  geração do número e o INSERT**. Escritas **anteriores** ao `fn` ficam **fora** do retry e não são
  repetidas. Medido nos quatro: o número é gerado na linha **imediatamente anterior** ao INSERT.
  O `ensureSetoresRequisicao` do `REQ` é idempotente e fica fora — **isto NÃO é motivo de parada.**

**C2 — Os quatro pontos de escrita** (medidos na Fase 0):

| Prefixo | Arquivo | Hoje |
|---|---|---|
| `INV` | `server/routes/almoxarifado.js:1108` | `INV-` + 8 dígitos, **sem aleatório** |
| `REQ` | `server/services/almoxarifado/requisitionCreateService.js:18` | `slice(-6)` + 2 aleatórios |
| `REC` | `server/services/almoxarifado/receiptService.js:74` | `slice(-8)` + 0–99 |
| `REM` | `server/services/almoxarifado/thirdPartyService.js:33` | `slice(-8)` + 0–99 |

As funções locais `gerarNumeroReq`/`gerarNumero`/`gerarNumero` **somem**; quem quiser o número
chama o módulo. O `gerarNumero(prefix)` do `receiptService` é o único que já recebe prefixo.

## Sort topológico

| # | Task | Tipo | Depende |
|---|---|---|---|
| 1 | `numeroDoc.js` + `numeroDocumento.api.test.js` (RN-01..04) | **tronco** | — |
| 2 | Ligar os quatro pontos (C2) + RN-05 | **tronco** | 1 |
| 3 | RN-04 **pela rota**, com colisão forçada, num dos quatro fluxos reais | **tronco** | 2 |

**Não há galho nesta etapa, e isso é dito em vez de fingido:** as três tasks são a mesma regra
compartilhada, em sequência. Paralelizar aqui só criaria retrabalho — é o critério da Fase 3
("independência é de **regra**, não de arquivo").

## Task 1 — O gerador (tronco)

Arquivos: `server/services/almoxarifado/numeroDoc.js` (novo) e
`server/tests/api/numeroDocumento.api.test.js` (novo).

Cenários: (1) forma da RN-01 por **regex completa** — `/^REM-[0-9A-Z]{16}$/` —, não só o prefixo;
(2) **RN-02, a prova que importa** — `carimboTempo(t)`, `carimboTempo(t + 1e6)` e
`carimboTempo(t + 1e8)` **distintos entre si**, com `t` sendo um epoch realista. São exatamente os
dois pontos onde o gerador antigo repetia (16,7 min e 27,78 h); **escreva isso no comentário do
cenário**; (3) **RN-03** — relógio fixo, 1000 chamadas, `new Set(...).size === 1000`;
(4) `inserirComNumeroUnico` sem colisão → devolve **`{ numero, resultado }`**, com `numero` igual
ao argumento que o `fn` recebeu e `resultado` sendo o `{ lastID }` que o `fn` retornou, e `fn`
chamado **uma vez**; (5) colisão nas 2 primeiras e sucesso na 3ª → `fn` chamado 3 vezes, **com
números diferentes a cada vez** (guardar os argumentos e afirmar que são distintos — sem isso, um
retry que reusa o mesmo número passaria) **e o `numero` devolvido é o TERCEIRO**, não o primeiro
(é a RN-07 na unidade); (6) 5 falhas → erro traduzido, e a mensagem crua do SQLite **não** aparece;
(7) erro que **não** é UNIQUE de `numero` sobe intacto **na primeira**, com `fn` chamado uma vez
só; (8) erro `UNIQUE constraint failed: series_almoxarifado.material_id, series_almoxarifado.numero`
**sobe intacto** — a âncora da régua, sem a qual o retry cobriria a série.

**Controles positivos:**

| Sabotagem | Cai em | Observação |
|---|---|---|
| `toString(36)` → `slice(-8)` | (2) | **Só o par `t` vs `t + 1e8` colide**; `t + 1e6` continua distinto. Dito aqui porque quem sabotar e vir dois pares verdes acharia que sabotou errado |
| aleatório de 8 para 1 char | (3) | contando distintos |
| retry reusando o mesmo número | (5) | asserção dos argumentos distintos |
| devolver o **primeiro** número em vez do vencedor | (5) | é o defeito latente que a Fase 2 pegou |
| `catch` engolindo qualquer erro | (7) e (8) | — |
| régua `/numero/i` sem âncora | (8) | — |

Commit: `Almoxarifado Etapa 31 Task 1: um gerador de numero que nao da a volta`.

## Task 1 — O gerador (tronco) — ✅ FEITA (`8c162c8`)

> **Fechamento (2026-08-31).** 8/8 no arquivo novo; `test:api` **165/165** arquivos. TDD real: o
> teste foi rodado antes contra um stub que reproduzia o gerador **antigo** de propósito — 2/8, e
> cada vermelho pela asserção certa. **Os 6 controles positivos caíram, nenhum sobreviveu**,
> inclusive o do carimbo, que caiu **só no par `t` vs `t+1e8`** como o plano avisava.
>
> **Achado do executor, e ele corrigiu o plano:** a régua ancorada que a Fase 2 tinha congelado
> **ainda casava a série** (acima, no C1). Ele mediu, propôs a régua sem `.*` e provou nas três
> mensagens reais. Conferido de forma independente aqui antes de aceitar.
>
> **Divergências, todas para mais:** `fn` recebe `(numero, db)` — sem isso o parâmetro `db` da
> assinatura congelada ficaria morto; `RE_COLISAO_NUMERO` também é exportada, para a Task 3 não
> duplicar a regex; **as fixtures de erro são reais, não literais** — as três mensagens são
> capturadas de INSERTs que falham de verdade num `:memory:`, e o setup afirma o texto delas antes
> dos cenários, de modo que uma mudança de mensagem do `sqlite3` vira **vermelho** em vez de deixar
> (7) e (8) passarem vazios; o cenário (1) ganhou os dois extremos de `Math.random` (0 e ~1), que é
> o que torna testável a proibição do `Math.random().toString(36).slice(2, 10)`; o cenário (3)
> ganhou uma guarda de que o stub do relógio **pegou** — sem ela, 1000 distintos poderiam vir do
> relógio andando e o cenário mediria o relógio, não a entropia; e o (5) roda com relógio fixo,
> para "três números distintos" provar que o **aleatório** foi regenerado.

## Task 2 — Ligar os quatro pontos (tronco)

Arquivos: os quatro da C2. Cada um passa a chamar `inserirComNumeroUnico`, usando o **`numero` que
ela devolve** (RN-07) em tudo que vem depois — retorno, auditoria, resposta da rota. As funções
locais somem; **`gerarNumeroReq` está em `module.exports` mas não é importado em lugar nenhum**
(medido pela Fase 2: só as 3 auto-referências do próprio arquivo), então removê-la é seguro.

**Não confirme "é a primeira escrita do fluxo"** — o `REQ` não é, e isso está resolvido no C1. O
que **tem** de ser confirmado, ponto a ponto: o `fn` contém **só o INSERT**, e nada é escrito entre
a geração do número e o INSERT.

**Cenário por fluxo, e é ele que dá o controle positivo (a versão anterior não tinha nenhum):**
em cada uma das quatro rotas de criação, afirmar a **forma completa** do número devolvido —
`/^INV-[0-9A-Z]{16}$/`, `/^REQ-…/`, `/^REC-…/`, `/^REM-…/`. O formato antigo era `PREFIXO-` +
**só dígitos**, 8–10 deles: a regex cai na reversão de qualquer um dos quatro pontos.

> **A suíte inteira tem HOJE uma única asserção sobre estes números** —
> `tests/api/requisicaoCriacao.api.test.js:103`, `startsWith('REQ-')` — e ela é exatamente a
> armadilha da Global Constraint 7: passa igual com o gerador velho. **Reverter qualquer um dos
> quatro pontos hoje não derruba nada.** É por isso que os quatro cenários de forma são
> obrigatórios, e não "bom ter".

Cenário **RN-05**, um por tabela: gravar à mão um registro com número no **formato antigo**
(`REM-885484687`) e lê-lo pela rota — nenhuma leitura pode recusá-lo. A Fase 2 já mediu que
**nada** valida, faz parse, ordena ou fatia estes quatro números (os `numero LIKE`/`ORDER BY
numero` que existem são de `pedidos_compra` e `series_almoxarifado`), então este cenário é de
regressão, não de descoberta.

**Verificação manual da RN-06**, uma vez, com controle positivo à mão:
`grep -rn "Date.now().toString()" server/services/almoxarifado server/routes/almoxarifado.js` = 0
linhas, e reintroduzir uma de propósito tem de fazê-la aparecer. Escreva o resultado no fechamento.

**Controle positivo:** voltar **um** dos quatro para a função antiga → o cenário de forma daquele
fluxo cai. Se não cair, **é achado**: o ponto está sem cobertura.

Commit: `Almoxarifado Etapa 31 Task 2: os quatro documentos passam pelo mesmo gerador`.

## Task 3 — O retry provado pela rota (tronco)

O retry da RN-04 é código que, com a entropia da D2, **nunca deve disparar** — e por isso precisa
de prova própria, senão é código que ninguém sabe se funciona.

**Como forçar a colisão — a receita anterior NÃO PODIA dar certo.** Ela dizia *"fixando `Date.now`
e o aleatório para produzir o mesmo número duas vezes"*. Com `Math.random` preso num valor, as
**cinco** tentativas do retry geram o **mesmo** número, todas colidem, e o fluxo termina no erro
traduzido da RN-04 — o oposto do critério de sucesso do próprio cenário, e o executor seguiria a
letra.

**A receita correta:** congele `Date.now` para o arquivo inteiro e substitua `Math.random` por um
stub de **uma chamada só** — ele devolve o valor que reproduz o número do documento 1 na primeira
chamada do documento 2, e o `Math.random` **real** dali em diante. Restaure os dois no `finally`.
Assim a 1ª tentativa colide, a 2ª vence, e o fluxo termina em **sucesso**, que é o que se quer
provar.

**Cenário:** duas criações seguidas pela rota real de um dos quatro fluxos. As duas têm sucesso,
com números distintos, e nenhuma devolve erro de SQLite ao cliente. **E a asserção que a versão
anterior não tinha (RN-07):**

```js
assert.strictEqual(res.body.numero,
  (await dbGet(db, 'SELECT numero FROM <tabela> WHERE id = ?', [res.body.id])).numero);
```

— mais o mesmo para o `numero` que foi para a **auditoria** (`dados_novos`).

> **Sem essa asserção a Task 3 passa com a feature quebrada**, e é o defeito do C1 (A4): se o
> chamador devolver o número da **primeira** tentativa enquanto o banco guardou o da segunda, as
> duas criações continuam sendo sucesso e continuam distintas — o cenário passa verde com o papel
> impresso não batendo com a linha. É o mesmo padrão das 6 asserções cegas das Etapas 29 e 30.

**Controle positivo:** **não** "remover o retry" — isso derrubaria também os cenários (5) e (6) da
Task 1, e faria a Task 3 parecer duplicata. O que **isola** esta task é fazer **aquele único ponto
de escrita** chamar `dbRun` direto, sem `inserirComNumeroUnico`: aí só o cenário desta task cai,
com o `UNIQUE constraint` cru na resposta — que é exatamente o que o usuário vê hoje. E, para a
RN-07, devolver o primeiro número em vez do vencedor → a asserção de igualdade com a linha cai.

Commit: `Almoxarifado Etapa 31 Task 3: a colisao forcada prova o retry, pela rota`.

## Task 3 — O retry provado pela rota (tronco) — ✅ FEITA (`54dad43`)

> **Fechamento (2026-08-31).** O cenário entrou em
> `server/tests/api/remessaTerceiroRotas.api.test.js` (arquivo que já cobria o fluxo, sem arquivo
> novo): **38/38** ali, `test:api` **165/165** arquivos.
>
> **O stub do aleatório.** `Date.now` congelado em `1788134400000` (epoch realista, carimbo de 8
> chars) para as duas remessas nascerem com o **mesmo** carimbo; `Math.random` trocado por um
> roteiro de **exatamente 8 valores** — `(digito + 0,5) / 36` para cada caractere do sufixo da
> remessa 1 —, delegando ao `Math.random` **real** da 9ª chamada em diante. A 1ª tentativa da
> remessa 2 colide, a 2ª vence com aleatório de verdade, e o fluxo termina em **sucesso**. Os dois
> globais são restaurados num `finally`. O sufixo da remessa 1 **não** é lido por posição fixa: o
> corte sai de `carimboTempo(T_FIXO)` (Global Constraint 9).
>
> **Divergência para mais, e é ela que impede o teste vazio:** "as duas deram 201 com números
> distintos" passaria verde **mesmo com o retry morto** — bastaria o roteiro ser consumido por
> outro chamador de `Math.random` e nenhuma colisão aconteceria. Por isso um **espião no `db.run`**
> grava o número de **cada** tentativa de INSERT do cabeçalho, e o teste afirma a sequência inteira:
> `[numero1, numero1, vencedor]`. Prova medida: com o stub desarmado de propósito (cópia
> descartável do arquivo), o cenário **cai** em `0 !== 8`.
>
> **Os dois controles positivos do plano caíram, e cada um numa asserção diferente** — o que
> confirma que eles isolam coisas distintas:
>
> | Sabotagem | Caiu em | Mensagem |
> |---|---|---|
> | `criarRemessa` chamando `dbRun` direto, **sem** `inserirComNumeroUnico` | `assert.strictEqual(r2.status, 201)` | `{"error":"SQLITE_CONSTRAINT: UNIQUE constraint failed: remessas_terceiro_almoxarifado.numero"}` — o erro cru que o operador via antes desta etapa |
> | o chamador devolvendo o **primeiro** número em vez do vencedor | `assert.notStrictEqual(r2.body.numero, numero1)` e, neutralizada essa, a **RN-07**: `a rota devolveu REM-MTGH1XC07AQWMPKT e o banco guardou REM-MTGH1XC0UCA56UKB` | 37/38 nos dois casos: **só** o cenário desta task cai, o da Task 2 fica verde |
>
> **Achado sobre a segunda sabotagem:** a primeira tentativa de escrevê-la trocou o número **do
> INSERT** (e não só o do retorno), o que fez as 5 tentativas repetirem o mesmo número e o fluxo
> terminar no erro traduzido da RN-04 — vermelho pelo motivo **errado**. A sabotagem só isola a
> RN-07 quando o INSERT continua recebendo número novo a cada tentativa e **apenas o retorno** fica
> preso no primeiro. Registrado porque é a mesma armadilha da receita do `Math.random` preso.
>
> Restauração por `cp` nos dois casos, `md5sum` conferido antes/depois/restaurado
> (`6cc2973d…` → sabotado → `6cc2973d…`) e `git diff --stat` vazio no fim.

## Task 2 — fechamento (`d51bc51`)

> 10/10 `conferenciaEscopo`, 27/27 `requisicaoCriacao`, 7/7 `recebimentoEntradaAtomica`,
> 37/37 `remessaTerceiroRotas`; `test:api` 165/165. **Os quatro controles positivos caíram** —
> revertendo cada ponto, o cenário de forma daquele fluxo cai (`"INV-01620967"`, `"REQ-63307073"`,
> `"REC-0164236416"`, `"REM-0165164284"`). **Antes desta task, reverter qualquer um deles não
> derrubava nada na suíte inteira**, que era exatamente o buraco que a Fase 2 apontou.
> **Duas decisões do executor que valem registro:** ele **promoveu** a linha 103 do
> `requisicaoCriacao` — o `startsWith('REQ-')` que o plano nomeia como a armadilha — em vez de
> criar um cenário paralelo, porque deixar a asserção fraca ao lado de uma forte a manteria no
> arquivo; e percebeu que os comentários "por que este gerador sumiu" citavam o código antigo
> **literalmente** e sujavam a varredura da RN-06 com 5 linhas, então reescreveu os quatro em
> palavras.
> **Ressalva da RN-06, para quem repetir a verificação:** o `grep` cru dá **1 linha**, não zero —
> o cabeçalho do próprio `numeroDoc.js`, que documenta o padrão que ele mata. Não é defeito, é
> documentação; restrita a código, a varredura dá **zero** (conferido no fechamento).

## Fase 5 — Revisão adversarial (2026-08-31) — ✅ FEITA

Um revisor fresco, cinco lentes. **Nenhum bloqueante.** Dois achados importantes, os dois no
fix-round `67b6758`.

**Achado 1 — e é o mais útil que uma revisão produziu nesta base, porque não é um bug: é uma
fragilidade da PROVA.** O revisor sabotou `carimboTempo` para `String(ms).slice(-8)` — o carimbo
volta a **dar a volta**, o defeito central da etapa, mas continua com 8 caracteres, todos em
`[0-9A-Z]`. Placar: **7/1** no arquivo do gerador (só o cenário 2) e **verde nos quatro arquivos de
fluxo**. As regexes `/^INV-[0-9A-Z]{16}$/` distinguem o gerador **velho** (que tinha outro
comprimento) e **não** distinguem base36 de decimal fatiado do mesmo tamanho. A defesa do defeito
central estava pendurada numa asserção só, num arquivo só.

**Achado 2 —** a régua do retry casa também `pedidos_compra.numero` (`server/index.js:19159`) e
`cotacoes.numero` (`:19173`) do banco **core**. Hoje inalcançável — nenhum `fn` insere nelas —, mas
esses números são **digitados pelo comprador**, igual ao de série: embrulhar a criação deles no
helper faria o retry reescrever em silêncio uma escolha de gente, que é a falha que a exclusão da
série existe para evitar. Virou aviso no cabeçalho, com a regra geral: documento que queira este
helper precisa de número **gerado**, nunca digitado.

**Não confirmado, e vale registrar o que ele mediu para não ser reaberto:** enumerou os **21**
UNIQUE reais do schema via `PRAGMA index_list` e testou a mensagem de cada um contra a régua — casa
exatamente as quatro tabelas de documento e deixa passar só a série; zero falso positivo, zero
falso negativo. Não há `CREATE TRIGGER` em lugar nenhum do servidor, então nenhum INSERT colateral
injeta UNIQUE de outra tabela dentro do `catch`. Os quatro `fn` são uma expressão única com o
INSERT do cabeçalho e nada mais. Nenhuma variável `numero` sobrevive de antes do retry em nenhum
dos quatro — ele checou os **dois** `return` do `REQ` e os **dois** ramos de resposta do `INV`.
Nenhum stub vaza entre cenários. Nenhum quinto gerador sobrou.

### Lição da etapa: exemplo prova exemplo; invariante prova a regra

A correção do achado 1 **não foi acrescentar mais exemplos** — foi trocar o par de exemplos por um
**invariante**: `parseInt(carimboTempo(ms), 36) === ms`. Se o milissegundo volta inteiro, nenhuma
informação foi perdida — e "não perde informação" é exatamente o mesmo que "não dá a volta", só que
**impossível de satisfazer por acidente**. Qualquer fatiamento reprova, em qualquer base e qualquer
comprimento.

**O padrão se repete há três etapas, e é sempre o mesmo:** *a asserção não consegue distinguir o
certo do errado*. Na 29 foi fixture simétrica (5 testes); na 30, régua de texto sobre lista manual
(1 teste); aqui, exemplos que só separavam por comprimento. **E nas três vezes o problema só
apareceu sob sabotagem** — nenhuma delas se pega relendo o teste.

## Retro de 4 números (2026-08-31)

1. **Rodadas de correção até verde: 1.** Um fix-round, nenhum teste falhando duas vezes.
2. **Achados: 8 na Fase 2 + 1 do executor da Task 1 + 2 na Fase 5 = 11 reais, 0 ruído.** A **Fase 2
   foi de novo a mais lucrativa**: duas correções **travariam** a execução (o "pare e reporte"
   sobre o `REQ`, e a receita de colisão que não podia dar certo) e duas deixariam passar defeito
   silencioso (número devolvido ≠ gravado; Task 2 sem cenário que caísse).
   **E a Fase 2 errou uma:** a régua "ancorada" que ela congelou **ainda casava a série**, e quem
   pegou foi o **executor da Task 1**, rodando a régua do plano como sétimo controle positivo —
   o que é um argumento a favor de mandar o executor testar o que o plano afirma, não só o que ele
   pede.
3. **Paralelismo: zero, declarado.** As três tasks são a mesma regra em sequência, e o plano diz
   isso em vez de fingir galho. **Zero retrabalho.**
4. **Defeito que escapou:** preencher na etapa seguinte.

**Quinto número, o mesmo das duas etapas anteriores:** **1 teste passava com a feature quebrada** —
e desta vez não era um teste periférico: era a defesa do **defeito central** da etapa, espalhada
por cinco arquivos e cega em quatro deles.

## Próxima tarefa detalhada

**A escolher pelo mapa** (`specs/modulo-almoxarifado/README.md`), medindo antes de prometer. Duas
observações que esta etapa deixa para quem escolher:

1. **A feature 09 (inspeção) ficou sem nenhum item de UI.** Os quatro que restam — não conformidade
   formal numerada, liberação sob desvio autorizado, anexos, encaminhamento com status — são
   **fluxo de negócio com máquina de estados própria**, cada um do tamanho de uma etapa. **Anexos**
   é o que destrava mais coisas (aparece como pendência em pelo menos três features), mas depende
   de `anexos_documento_almoxarifado` — **medir se a tabela existe antes de desenhar**, porque a
   spec 09 a cita como "item próprio de outra spec" e isso não é o mesmo que "existe".
2. **Se for outra feature, o mapa é o critério** (🔴/🟡 de maior valor), com as duas regras que esta
   base aprendeu por falha: **medir ausência pelo nome do CONTRATO**, não pelo nome que se imagina
   que o consumidor usaria (Etapa 24); e **cruzar com a spec ANTES de varrer** (Etapa 26), porque
   duas etapas seguidas desenharam sobre varredura minha que estava errada.

## Fechamento

`fechar-etapa`: novidades (seção; **letra C** — a partir do deploy os números novos ficam **mais
LONGOS** (de 12–14 para 20 caracteres) e **com letras**, e os antigos continuam válidos e legíveis,
D4. *Isto dizia "mais curtos"; **estava errado**, medido na Fase 2 — todos os quatro crescem, e é o
texto que vai para o guia do usuário;* **letra B** — perguntar se
ele quer numeração **sequencial por ano** (`REQ-2026-0001`), que é o que uma ERP madura faz e exige
tabela de contador mais decisão sobre reinício anual), spec da feature de cada documento tocado
(requisições 03, recebimento 08, terceiros 8b, inventário 10) — **só a linha do número, não o
status**, porque a etapa não muda comportamento de feature —, mapa, guia (roteiro: criar dois
documentos e comparar os números; o antigo continua abrindo), manual (**onde o manual descreve o
formato do número, se descrever** — medir antes), retro.
