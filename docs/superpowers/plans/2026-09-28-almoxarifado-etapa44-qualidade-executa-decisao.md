# Plano — Etapa 44: a QUALIDADE executa a própria decisão (feature 09)

> **Design:** `docs/superpowers/specs/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao-design.md`
> **Fecha:** o furo **C57** das novidades e o item 2 de "o que falta para 🟢" da spec 09.
> **Fase 0:** medida em 2026-09-28 (commit `4c72bc9` + as medições F0-1..F0-6 do design).
> **Fase 2:** revisor fresco, **15 achados, 2 CRITICAL** — este plano é a versão **corrigida** por
> eles. O que mudou está na seção "O que a Fase 2 mudou neste plano", no fim.
>
> **Linha de base medida antes de tocar em código:** `test:api` **205/205 arquivos** ·
> almoxarifado **42/0** · validation **4/0** · safealter **3/0** · sqlite **5/0** ·
> cliente **52 suítes / 813 testes**.

---

## Regras de negócio (enunciados completos no design, seção 3)

`RN-01` liberar na aceitação · `RN-02` fatal · `RN-03` uma vez por INSPEÇÃO **+ backfill** ·
`RN-04` as outras quatro decisões não mexem no saldo · `RN-05` origem RECEBIMENTO não tem bloqueio ·
`RN-06` reprovada zero/nula não tem o que liberar · `RN-07` o efeito volta na resposta e aparece
na tela · `RN-08` nenhuma ação de perfil nova · **`RN-09` só NC automática libera** ·
**`RN-10` material inativo não trava o documento**.

A **ordem de precedência do efeito** está congelada na seção 3 do design e é obrigatória — sem ela,
`RECEBIMENTO` + `DEVOLVER` casa duas regras ao mesmo tempo.

## Sort topológico

| Task | O quê | Tipo |
|---|---|---|
| **T1** | Coluna `liberacao_nc_em` + backfill + a liberação dentro de `decidirNaoConformidade` | **tronco** |
| **T2** | A rota devolve o efeito (aditivo) + cenários de rota | **galho** |
| **T3** | A tela diz o que aconteceu com o saldo | **galho** |
| **T4** | Integração ponta a ponta pela rota, cruzando motor e saldo | **tronco** (depois dos galhos) |

T2 e T3 só podem partir depois de T1 porque consomem o campo `liberacao` que ela cria — e o
contrato dele está **congelado na seção 5 do design**, que é o que permite os dois rodarem em
paralelo sem se esperarem.

---

## T1 — tronco: a liberação (schema + backfill + serviço)

**Arquivos:** `server/services/almoxarifado/schema.js`,
`server/services/almoxarifado/nonConformityService.js`,
`server/tests/api/naoConformidadeLiberacao.api.test.js` (novo).

1. `safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN liberacao_nc_em DATETIME')`
   — com o comentário explicando **por que a trava mora na inspeção e não na NC** (F0-2).
2. **BACKFILL, com id próprio em `schema_migrations_almoxarifado`** (molde de `schema.js:491-540`):
   `UPDATE inspecoes_recebimento_almoxarifado SET liberacao_nc_em = CURRENT_TIMESTAMP
   WHERE liberacao_nc_em IS NULL`, rodado **uma vez**, no momento da migração. É o que torna
   verdadeiro o "não retroage" — sem ele **toda reprovação da história é um vale-desbloqueio**.
   O comentário tem de dizer isso, porque um `UPDATE` que marca tudo como "já liberado" parece
   errado para quem o lê sem contexto.
3. Constante `DECISOES_QUE_LIBERAM = ['ACEITAR', 'ACEITAR_SOB_DESVIO']`.
4. Função **pura de decisão de efeito** `efeitoPrevisto(nc, insp, material)` implementando a
   precedência de 7 níveis da seção 3 do design, **sem escrever nada**. Separada de propósito: é
   a parte testável sem banco e é onde a RN-09 e a RN-10 moram.
5. `decidirNaoConformidade` reordenada conforme a seção 4 do design:
   **resolver → claim da DECISÃO → claim da inspeção → motor → auditoria**, com rollback das duas
   colunas (e **nenhuma** movimentação compensatória) quando o motor falha.
6. A movimentação carrega `documento_vinculado = nc.numero`, `justificativa` = a da decisão e
   `motivo = 'Liberação por não conformidade'` (literal novo, distinto de *"Desbloqueio avulso"* —
   é o que torna a liberação legível no livro).

**Cenários (TDD, com controle positivo em cada um):**

1. `ACEITAR` em NC **automática** de inspeção libera a reprovada e o bloqueado cai exatamente por ela
2. `ACEITAR_SOB_DESVIO` libera igual (é o caso do C57)
3. `DEVOLVER` grava a decisão e **não** mexe no bloqueado — efeito `NENHUMA`
4. `SUCATEAR` idem (RN-04)
5. NC de origem `RECEBIMENTO` decidida `ACEITAR` → `SEM_BLOQUEIO`, bloqueado intacto
6. Inspeção com `quantidade_reprovada = 0` → `SEM_BLOQUEIO`
7. **RN-03 — duas NCs da mesma inspeção**: a segunda devolve `JA_LIBERADA` e o bloqueado **não**
   cai de novo. ⚠️ **O material TEM DE ter bloqueio de outra origem** (ex.: bloqueio avulso de 10
   + reprovada 3, asserção final `bloqueada = 10`). Com `bloqueada` igual à reprovada, quem barra
   a segunda liberação é o **teto do motor**, não a trava — o cenário mediria a coisa errada e
   chamaria isso de idempotência (achado 13 da Fase 2).
8. **RN-02 fatal** — bloqueado insuficiente: 400 com *"Quantidade bloqueada insuficiente: N"*,
   a NC volta a **ABERTA**, `liberacao_nc_em` volta a **NULL**, o bloqueado não muda e **não
   nasce linha nenhuma no livro**
9. A movimentação nasce com `documento_vinculado` = o número da NC e `motivo` novo
10. Decidir duas vezes a **mesma** NC continua 409 (regressão da Etapa 43)
11. **RN-09 — a porta lateral**: NC **manual** (`aberto_automaticamente = 0`) apontando para uma
    inspeção antiga, num material com bloqueio avulso de outra origem → `SEM_BLOQUEIO` com a
    literal própria e **o bloqueado não cai**. É o achado CRITICAL da Fase 2; sem este cenário a
    etapa entrega um desbloqueio sem `ajustar_estoque`
12. **RN-03 — o backfill**: inspeção criada **antes** da migração nasce com `liberacao_nc_em`
    preenchido; NC automática sobre ela decidida `ACEITAR` → `JA_LIBERADA`, bloqueado intacto
13. **RN-10 — material inativo**: decisão de aceitação grava e devolve `SEM_BLOQUEIO` com a
    literal própria, em vez de estourar *"Material inativo não pode ser movimentado"* e deixar a
    NC presa para sempre

### Controles positivos obrigatórios (a asserção que tem de cair está nomeada)

| Sabotagem | Cenário que tem de ficar vermelho | **Asserção discriminante** |
|---|---|---|
| trocar o claim da inspeção por um claim na NC | 7 | `bloqueada` final (10, não 7) |
| remover o rollback do passo 4 | 8 | `status = 'ABERTA'` **e** `liberacao_nc_em IS NULL` — **as duas**, porque só a segunda distingue na ordem antiga e só a primeira distingue na nova |
| remover a checagem de `aberto_automaticamente` | 11 | `bloqueada` final e o `efeito` |
| remover o backfill | 12 | o `efeito` (`LIBERADA` em vez de `JA_LIBERADA`) |
| remover a guarda de material inativo | 13 | o status 400 e a mensagem |

> **Por que a linha do rollback nomeia DUAS asserções:** a versão anterior deste plano mandava
> conferir `status` e saldo, e a Fase 2 mediu que, na ordem antiga, **nenhuma das duas distinguia**
> — a sabotagem passaria verde e o cenário 8 não provaria nada. Com a ordem nova, `status` volta a
> discriminar; exigir as duas é o que impede o erro de renascer se a ordem mudar outra vez.

## T2 — galho: a rota devolve o efeito

**Arquivos:** `server/routes/almoxarifado/extended.js` (`:1097`),
`server/tests/api/naoConformidadeLiberacaoRotas.api.test.js` (novo).

A rota hoje devolve `obterNaoConformidade`. Passa a devolver o objeto **com** `liberacao`.
Cenários: o efeito chega pelo HTTP nos quatro valores, **com a forma congelada** (`quantidade` e
`material_id` em `null` quando não libera); 403 para perfil sem `decidir_nao_conformidade` **e o
bloqueado não muda** (asserção positiva ao lado da negativa); 400 do motor propagado com a literal.

## T3 — galho: a tela

**Arquivos:** `client/src/components/almoxarifado/NaoConformidadesAlmoxarifado.js`,
`client/src/components/almoxarifado/__tests__/NaoConformidadesAlmoxarifado.test.js`.

O toast de sucesso concatena `resp.data?.liberacao?.mensagem` quando houver. Cenários: os quatro
efeitos aparecem no toast; resposta **sem** o campo `liberacao` (servidor antigo) não quebra a tela
nem mostra `undefined`.

## T4 — tronco: integração

**Arquivo:** `server/tests/api/naoConformidadeLiberacaoIntegracao.api.test.js` (novo).

1. Fluxo inteiro **pela rota**: receber → item crítico entra retido → inspecionar reprovando
   parcial → a NC nasce sozinha → decidir `ACEITAR_SOB_DESVIO` com um usuário **QUALIDADE real** no
   harness → conferir que o disponível subiu exatamente pela reprovada, que o livro tem a linha
   `DESBLOQUEIO` com `documento_vinculado` e que a NC está `DECIDIDA`. É o cenário que prova o C57
   fechado.
2. **O segundo portão do lote** (achado 7 da Fase 2): material com controle de lote, lote posto em
   `REPROVADO`, NC decidida `ACEITAR` → efeito `LIBERADA` e bloqueado cai, **mas a saída continua
   400 com** *"Lote X esta reprovado e nao pode ser utilizado"*. Fixa o comportamento por teste
   para ninguém "consertar" como regressão, e é o que o guia do usuário tem de avisar.

---

## Fase 5 — o que a revisão adversarial tem de atacar

1. A ordem da seção 4 do design, de novo e com olhos frescos — foi reescrita uma vez.
2. O backfill: ele marca **tudo** como já liberado. Existe base em que isso apaga um caso legítimo?
3. A RN-09 fecha a porta lateral **inteira**, ou sobra caminho por `origem`/`referencia_tipo`?
4. "Este teste passaria com a feature quebrada?" — em especial os cenários 7, 8, 11 e 12.

---

## O que a Fase 2 mudou neste plano

- **T1 ganhou o backfill (item 2)** e **três cenários novos** (11, 12, 13) — dois deles fechando o
  achado CRITICAL da porta lateral.
- **A ordem das operações inverteu**: o claim da decisão passou a vir primeiro, e **a compensação
  por movimentação deixou de existir**. Com ela saíram dois achados IMPORTANT (disponível negativo
  e modo de falha próprio da compensação).
- **O controle positivo do cenário 8 estava prometido na asserção errada** e teria produzido o
  quarto teste vazio desta base. Corrigido, com a razão escrita.
- **O cenário 7 media o teto do motor** e chamava isso de idempotência. Agora exige bloqueio de
  outra origem.
- **T4 ganhou o cenário do lote reprovado**, e a seção 7 do design ganhou o aviso — a tela diria
  "liberado" e a produção não conseguiria retirar.
- **A Fase 6 ganhou uma correção nomeada:** a spec 09 prescreve `bloquear_qualidade` em dois
  pontos (`README.md:5` e `:236`) e esta etapa **abandona** a prescrição. Pela regra 5 do
  `CLAUDE.md`, os dois textos têm de ser corrigidos **dizendo que a prescrição foi abandonada e
  por quê**, não apagados.

---

## Estado

- [x] **T1 — tronco** (`ff02188`): coluna `liberacao_nc_em` + backfill com ledger próprio +
      `efeitoPrevisto` (função pura, 7 níveis de precedência) + `decidirNaoConformidade`
      reordenada + `executarLiberacao`. **13 cenários**, todos verdes.
- [x] **T2 — galho** (`db94225`): a rota **não precisou mudar uma linha** — ela já devolve o que o
      serviço monta. **5 cenários** de contrato: o campo sobrevivendo à serialização, a forma
      congelada (`null`, nunca `0`), o 400 do motor com a literal e o 403 antes de qualquer efeito.
- [x] **T3 — galho** (`db94225`): o toast concatena `resp.data?.liberacao?.mensagem`. **3 cenários**
      (os quatro efeitos + resposta sem o campo). O cabeçalho do componente, que afirmava "não move
      estoque (D7)", ficou corrigido à vista.
- [x] **T4 — integração** (`db94225`): **2 fluxos** — o ciclo do C57 ponta a ponta com usuário
      QUALIDADE real, e o segundo portão do lote.
- [x] **Documentação** (`a3f3373`, `195a06d`): os 7 artefatos da skill `fechar-etapa`.
- [x] **Fase 5 — revisão adversarial** (`49e8ec9`, `d06e356`, `405368a`, `71105fa`): duas lentes,
      **19 achados, 2 CRITICAL, zero ruído**, todos reproduzidos por sonda ou sabotagem executada.
- [x] Retro de 4 números (abaixo)

---

## Fase 5 — o que as duas lentes acharam, e o que isso diz do fluxo

### O CRITICAL que não era desta etapa

**O rollback supunha que o motor é atômico.** Os seis ramos de retenção de `registrarMovimentacao`
escrevem em `quantidade_bloqueada`/`quantidade_em_inspecao` **antes do `try` do próprio motor** —
então uma falha no `INSERT` do ledger saía da função com o pool já mexido e nenhuma linha no livro,
enquanto quem chamou confia no `throw` para concluir que nada aconteceu. `executarLiberacao`
desfazia os dois claims, a NC voltava a `ABERTA`, era decidida de novo, e **uma reprovação de 3 kg
soltava 6**.

**É defeito do motor, não da Etapa 44** — atinge `BLOQUEIO`, `QUARENTENA` e os de inspeção pela
mesma razão, e é a mesma classe que o fix round 1 da Etapa 5 já consertou para série e físico. A
retenção era a coluna que faltava naquele catch. Consertado lá, não aqui.

**E a lição de teste é mais afiada que o conserto:** o cenário 8 — o cenário da *fatalidade*,
escrito de propósito para provar o rollback — **não pegava**. Ele provocava a recusa de **teto** do
motor, que falha *antes* de qualquer efeito; provava "o rollback funciona quando o motor não fez
nada", a metade fácil. Um cenário pode ter o nome certo, a RN certa e a asserção certa e ainda
medir o caso trivial. Nasceu daí o **8b**, com trigger no `INSERT` do ledger.

### Os dois becos sem saída

- **`cancelarMovimentacao` ressuscitava o C57** (RN-12). `DESBLOQUEIO` é estornável pelo livro, e a
  liberação é um `DESBLOQUEIO` — escapava das guardas de retenção ao lado. Estorná-la deixava o
  documento dizendo "aceito" com o material preso, **sem saída**.
- **A fatalidade criava o beco que a RN-10 existe para evitar** (RN-11). Desbloquear à mão **era o
  procedimento normal antes desta etapa**; depois dela, esse gesto inutilizava o documento.

Os dois têm a mesma forma: **a etapa fechou um caminho e abriu outro para o mesmo estado**. Vale
como pergunta de revisão futura — *"o estado que esta etapa proíbe continua alcançável por outra
porta?"* — porque as duas portas estavam a um passo do código novo e nenhuma foi vista no desenho.

### O CRITICAL de apresentação

**O modal ainda exibia o enunciado literal do C57**, no passo do roteiro em que o apresentador
afirma que ele foi resolvido. A etapa corrigiu o **comentário de cabeçalho** do componente e deixou
a **frase visível** intacta. *Comentário de código corrigido não corrige a tela* — e a única razão
de isso ter sido pego é a lente que lê a documentação **com o sistema aberto**.

### Seis buracos de teste, e um deles é estrutural

O que mais ensina: **a fiação do backfill não tinha prova**. O cenário chamava a migração à mão,
provando o corpo dela e não que `initSchema` a executa — apagar a chamada deixava as três suítes
verdes. Num deploy onde essa linha se perdesse, toda inspeção antiga nasceria liberável, com a
suíte afirmando o contrário. **Testar a função não é testar que alguém a chama.**

---

## Retro de 4 números — Etapa 44

1. **Rodadas de correção até verde:** **uma** (o fix-round da Fase 5). Nenhuma task precisou de
   segunda rodada depois de integrada e a suíte nunca ficou vermelha na branch.
2. **Achados das revisões: 34 reais, 0 ruído** — **15** na Fase 2 (plano, antes de codar) e **19**
   na Fase 5 (duas lentes), com **4 CRITICAL** somados. Terceira etapa seguida com zero ruído.
   **O número que ensina:** dos 19 da Fase 5, **3 mudaram código de produção e 6 eram buracos de
   teste** — ou seja, **um terço dos achados foi sobre a própria suíte**, que estava verde. E o
   mais grave deles (`8b`) estava **dentro do cenário que existia para prová-lo**.
3. **Paralelismo:** 2 galhos (T2 e T3) e 2 lentes de revisão, em paralelo, sem worktree — as tasks
   eram pequenas e tocavam arquivos disjuntos. **Nenhum retrabalho.** O que evitou: o contrato do
   campo `liberacao` congelado por escrito na seção 5 do design, com a **forma** (`null`, nunca
   `0`) explícita — e foi exatamente a forma que a revisão encontrou medida em 1 dos 4 efeitos.
   ⚠️ **Um risco de processo apareceu:** uma das lentes sabotou arquivos **do projeto** em vez de
   cópias, e por alguns minutos houve sabotagem viva na árvore. Restaurou e conferiu por `md5sum`,
   mas se tivesse morrido no meio a sabotagem ficaria. **Instrução para a próxima:** exigir
   trabalho em cópia, ou `git stash` como rede.
4. **Defeito que escapou:** a preencher pela Fase 0 da Etapa 45. *(Ver também o achado de mapa na
   seção seguinte — a Fase 0 da 45 já começou e encontrou um.)* **Dois candidatos declarados:**
   (a) a **RN-11** e a **RN-12** nasceram no fix-round e não passaram por revisão adversarial —
   valem uma leitura fresca; (b) o `efeito_saldo` gravado na trilha **não tem rótulo** em
   `auditLabels.js` nem leitor — é o padrão *"calculado, gravado e sem quem leia"* que esta base já
   pagou três vezes.

   ### ✅ PREENCHIDO pela Fase 5 da Etapa 45 (2026-09-29) — e escapou de verdade

   **`liberarRetencaoDaInspecao` comparava REAL sem épsilon.** A guarda
   `material.quantidade_bloqueada < reprovada` — escrita nesta etapa, no fix-round — devolve
   **verdade** quando o bloqueado é `3.3999999999999995` e a reprovada `3.4`, o que acontece com
   duas reprovações fracionárias do mesmo material (2,3 + 3,4 = `5.699999999999999`). Consequência
   **nesta** etapa: a decisão `ACEITAR`/`ACEITAR_SOB_DESVIO` fecha a NC com efeito
   `SEM_BLOQUEIO` e **não libera nada** — o furo **C57**, que esta etapa existe para fechar,
   renascendo por arredondamento **dentro dela**.

   Por que escapou: as duas lentes da Fase 5 daqui atacaram atomicidade, ordem de claim e
   autorização, e o arquivo já importava `EPSILON_DIVERGENCIA` — a presença do import fez a régua
   **parecer** aplicada. Corrigido em `7f72e39` (Etapa 45), com o helper único `menosQue` usado
   pelas duas etapas e a tolerância pareada no claim `baixandoBloqueado` do motor.

   Dos dois candidatos declarados acima: (a) **acertou parcialmente** — a RN-11 nascida no
   fix-round foi de fato onde o defeito estava, mas o problema era a **comparação**, não a regra;
   (b) o `efeito_saldo` sem rótulo/leitor **não** foi achado por ninguém na Fase 5 da 45 e
   **continua aberto**.

---

## Onde a execução divergiu do plano

**1. O plano previa mudança na rota (T2) e ela não foi necessária.** `extended.js:1102` já faz
`res.json(await nonConformityService.decidirNaoConformidade(...))` — o campo aditivo flui sozinho.
A task virou **só cenários**, e isso não a torna dispensável: o que ela mede é a **forma** do
contrato (`quantidade`/`material_id` em `null`, nunca `0` nem ausentes), contra a qual a T3 foi
escrita em paralelo. Sem o cenário, servidor e tela poderiam divergir com as duas suítes verdes.

**2. Dois controles positivos do plano caíram pela asserção ERRADA, e precisaram de um segundo
disparo cada.** É a armadilha que a `fechar-etapa` nomeia — *"leia QUAL asserção caiu"* — e ela
apareceu duas vezes nesta task:

| Sabotagem prevista | O que caiu | O que faltava provar | O segundo disparo |
|---|---|---|---|
| trocar o claim da inspeção por um claim na NC | cenário 7, pela asserção do **`efeito`** (`LIBERADA` em vez de `JA_LIBERADA`) | a asserção do **saldo** (`bloqueada` = 10, não 7) nunca rodou | rodar o motor **mesmo com o claim falhando** e ainda reportar `JA_LIBERADA` — derruba o saldo nos cenários **7 e 12** |
| remover o rollback do passo 4 | cenário 8, pela asserção do **`status`** | a de **`liberacao_nc_em`** nunca rodou | remover **só** o rollback da inspeção — derruba a asserção que faltava |

**A lição, que vale além desta etapa:** quando duas asserções do mesmo cenário são produzidas pelo
**mesmo ramo** do código, uma sabotagem qualquer derruba sempre a primeira, e a segunda fica sem
prova nenhuma — com o placar vermelho dando a impressão contrária. O que separa as duas é uma
sabotagem que faça o código **mentir sobre o que fez**, e não uma que o faça fazer menos.

**3. O cenário do lote (T4) precisou de dois ajustes de fixture que são medição, não acidente:**
material com `controle_lote` **exige o campo Lote na entrada** (o lote nasce do recebimento, não de
um `INSERT`), e `SAIDA_PRODUCAO` **exige vínculo com OS ou projeto** — a saída do cenário teve de
ser `emergencial` com justificativa. As duas guardas são anteriores a esta etapa e continuam de pé.

---

## Próxima tarefa detalhada — Etapa 45: a devolução ao fornecedor (features 12 + 09)

**Por que esta, e não outra** (pela ordem do `CLAUDE.md`, sem consultar ninguém):

1. **É o que o fechamento desta etapa nomeou como "falta para 🟢"** da feature que acabei de tocar.
   A 09 saiu de dois itens para **um**: *encaminhamento com status* — saber se a devolução, a
   análise ou a substituição foi **executada**. E a spec 09 diz que a execução é da feature 12.
2. **Ela paga também o corte declarado desta etapa.** A **B174** registra que *Devolver ao
   fornecedor* apenas **marca intenção**: o documento fecha e o material continua bloqueado. É o
   próximo passo natural do mesmo gesto — a Etapa 44 fez a aceitação executar; a 45 faz a
   **devolução** executar.

### ⚠️ ACHADO DE MAPA da Fase 0 (medido em 2026-09-28) — a feature 12 está 🟢 com o item que falta

**A spec 09 diz que a feature 12 "ainda não existe"; o mapa diz 🟢. As duas afirmações estão
erradas do jeito que importa, e a correção é parte da Etapa 45.**

- **A feature 12 EXISTE e está entregue** (Etapa 7, `29524fc..0722bfd`) — mas para **devolução ao
  estoque**: da produção, de projeto, de ferramenta, de cliente, com vínculo à saída original,
  lote, série e tela própria. A frase da spec 09 (*"a feature 12, que ainda não existe"*) é de
  antes da Etapa 7 e **nunca foi corrigida**.
- **E o que a feature 09 precisa está DESMARCADO dentro dela:**
  `12-devolucoes/README.md:176` — *"[ ] Devolução ao fornecedor: fluxo próprio com documento e
  e-mail — **fora do escopo da Etapa 7, declarado**. Não é 'a mesma devolução com outro destino':
  tem documento fiscal e contraparte externa"*.
- **Logo: a feature 12 está 🟢 com um item de checklist aberto do qual OUTRA feature depende.** A
  cor diz "pronto" e a coisa que a 09 espera não existe. É exatamente a classe de erro de mapa que
  esta base já pagou quatro vezes na feature 23 — e desta vez ela atravessa duas specs, que é por
  que nenhuma das duas a viu sozinha.

**A Etapa 45 tem de corrigir os dois textos**, dizendo que estavam errados: a frase da 09 sobre a
12 não existir, e a cor da 12 (que precisa virar 🟡, ou ganhar uma ressalva explícita no cabeçalho
dizendo que o 🟢 é só da devolução ao estoque).

### O que a 45 consome, já medido

- **`nonConformityService.decidirNaoConformidade`** é o ponto de entrada: a decisão `DEVOLVER`
  hoje devolve efeito `NENHUMA`. O gancho de execução entra no **mesmo lugar** onde a liberação
  entrou — e a ordem das operações da seção 4 do design da 44 vale igual, já revisada duas vezes.
- **A NC de origem `INSPECAO` alcança material, quantidade reprovada e recebimento** sem coluna
  nova (`getInspecao`, `nonConformityService.js:141`), e a de origem `RECEBIMENTO` alcança o item.
  **Medir**: uma devolução ao fornecedor pode nascer das **duas** origens (material reprovado *e*
  material que chegou errado), ao contrário da liberação, que só faz sentido na inspeção.
- **`inspecoes_recebimento_almoxarifado.encaminhamento`** (`DEVOLVER` | `ANALISE_ENGENHARIA` |
  `SUBSTITUICAO`) está gravado desde a Etapa 5.
  > ⚠️ **ESTA LINHA DIZIA "continua sem leitor" E EU A ESCREVI ERRADA** (achado da própria Fase 0
  > da 45, medindo o que eu tinha acabado de afirmar). Ele **tem três leitores**: a consulta do
  > cartão de alerta (`alertRegistry.js:119`), o corpo do e-mail (`:457`) e a coluna
  > *Encaminhamento* da tela de Alertas (`AlertasAlmoxarifado.js:141`) — mais a descrição da NC
  > (`nonConformityService.js:511`). **O que ele não tem é STATUS**: os leitores mostram a
  > *intenção*, e ninguém sabe se ela foi cumprida. É uma frase muito diferente de "sem leitor", e
  > a diferença muda o desenho: a Etapa 45 **não** precisa criar a fila — precisa dar **estado** à
  > que já aparece na tela.
  > Fica à vista porque é o terceiro handoff seguido desta base em que uma frase minha sobre
  > "ninguém lê isto" não sobreviveu à medição.
- **`quantidade_bloqueada`** é de onde o material sai: devolver ao fornecedor **tira do bloqueado
  e tira do físico**, ao contrário da liberação, que só tira do bloqueado. **Medir se existe tipo
  de movimento para isso** — `SUCATA` e `PERDA` fazem algo parecido, e a Etapa 5 declarou que o
  bloqueado sai por `DESBLOQUEIO` seguido de saída separada, *"e os dois passos não estão amarrados
  um ao outro"* (pendência aberta da spec 09).

- ⚠️ **MEDIDO — a devolução que existe é uma ENTRADA, e por isso o fluxo novo não é "mais um
  destino".** `devolucoes_material_almoxarifado` (`schema.js:1537`) e `returnService.js` tratam do
  material **voltando para o galpão**: `DESTINOS = ['ESTOQUE','QUARENTENA','SUCATA','RETRABALHO']`
  (`:12`), e o serviço grava `ENTRADA_DEVOLUCAO` em todos eles. Devolver ao **fornecedor** é o
  oposto: o material **sai do site**. Acrescentar `FORNECEDOR` àquela lista faria o serviço dar
  **entrada** de algo que está indo embora.
  **A spec 12 já dizia isso** — *"Não é 'a mesma devolução com outro destino': tem documento fiscal
  e contraparte externa"* (`:176`) — e a medição **confirma a spec**, o que é raro o bastante para
  ficar escrito: aqui não há correção a fazer, há uma afirmação a reusar.
  **Consequência de desenho:** o fluxo novo se parece mais com a **remessa a terceiros** (feature
  14, que já tem retenção própria e documento) do que com a devolução ao estoque. Medir `REMESSA_TERCEIRO`
  como molde antes de inventar um tipo de movimento.

### Pontos de atenção (medir na Fase 0 antes de prometer)

- **A trava de idempotência, de novo.** A `liberacao_nc_em` da 44 é por inspeção. A devolução
  precisa da dela — e a pergunta é a mesma: por documento ou por inspeção? **Não copie a resposta
  da 44 sem refazer a medição**: lá a razão era o índice único parcial e por tipo; aqui pode haver
  devolução parcial, que a liberação não tinha.
- **Fatal ou não fatal.** A 44 escolheu fatal e a revisão mostrou que a fatalidade **cria becos**
  (RN-11). Aqui há mais estados conhecidos (material já consumido, recebimento já processado, nota
  já paga): **liste-os antes de escolher**, e prefira o efeito explícito à recusa.
- **A recusa de estorno (RN-12) vale para a devolução também?** Se a saída de devolução for
  estornável pelo livro, o documento voltará a dizer "devolvido" com o material de volta no
  galpão — o mesmo furo, na outra ponta.
- **Não repetir o erro do modal.** A Etapa 44 corrigiu o comentário do componente e deixou a frase
  **visível** afirmando o contrário. Ao mudar o efeito de `DEVOLVER`, o parágrafo do modal muda
  junto — e há cenário `(21)` prendendo-o.
- **O documento fiscal.** A spec 12 diz que devolução ao fornecedor *"tem documento fiscal e
  contraparte externa"*. Isso pode ser etapa inteira. **Caminho reversível:** entregar o
  **movimento e o status** (o que a 09 precisa) e declarar o documento fiscal como corte, na letra
  B — em vez de desenhar uma nota fiscal de saída que ninguém pediu.
