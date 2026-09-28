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

- [ ] T1 — tronco (schema + backfill + serviço, 13 cenários)
- [ ] T2 — galho (rota)
- [ ] T3 — galho (tela)
- [ ] T4 — integração (2 fluxos)
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa` (incluindo a correção dos dois textos da spec 09)
