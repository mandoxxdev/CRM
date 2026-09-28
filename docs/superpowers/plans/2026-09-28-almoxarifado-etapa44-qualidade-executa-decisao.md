# Plano — Etapa 44: a QUALIDADE executa a própria decisão (feature 09)

> **Design:** `docs/superpowers/specs/2026-09-28-almoxarifado-etapa44-qualidade-executa-decisao-design.md`
> **Fecha:** o furo **C57** das novidades e o item 2 de "o que falta para 🟢" da spec 09.
> **Fase 0:** medida em 2026-09-28 (commit `4c72bc9` + as medições F0-1..F0-6 do design).

---

## Regras de negócio (as RN estão no design, seção 3 — repetidas aqui só pelo ID)

`RN-01` liberar na aceitação · `RN-02` fatal · `RN-03` uma vez por INSPEÇÃO · `RN-04` as outras
quatro decisões não mexem no saldo · `RN-05` origem RECEBIMENTO não tem bloqueio ·
`RN-06` reprovada zero/nula não tem o que liberar · `RN-07` o efeito volta na resposta e aparece
na tela · `RN-08` nenhuma ação de perfil nova.

## Sort topológico

| Task | O quê | Tipo |
|---|---|---|
| **T1** | Coluna `liberacao_nc_em` + a liberação dentro de `decidirNaoConformidade` | **tronco** |
| **T2** | A rota devolve o efeito (aditivo) + cenários de rota | **galho** |
| **T3** | A tela diz o que aconteceu com o saldo | **galho** |
| **T4** | Integração ponta a ponta pela rota, cruzando motor e saldo | **tronco** (depois dos galhos) |

T2 e T3 só podem partir depois de T1 porque consomem o campo `liberacao` que ela cria — e o
contrato dele está **congelado na seção 5 do design**, que é o que permite os dois rodarem em
paralelo sem se esperarem.

---

## T1 — tronco: a liberação (schema + serviço)

**Arquivos:** `server/services/almoxarifado/schema.js`,
`server/services/almoxarifado/nonConformityService.js`,
`server/tests/api/naoConformidadeLiberacao.api.test.js` (novo).

1. `safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN liberacao_nc_em DATETIME')`
   — com o comentário explicando **por que a trava mora na inspeção e não na NC** (F0-2).
2. Constante `DECISOES_QUE_LIBERAM = ['ACEITAR', 'ACEITAR_SOB_DESVIO']`.
3. Função `executarLiberacao(db, user, nc, decisao, justificativa)` que devolve
   `{ efeito, quantidade, material_id, mensagem }` conforme a tabela da seção 5 do design.
4. `decidirNaoConformidade` reordenada conforme a seção 4 do design: resolver → claim da inspeção →
   `registrarMovimentacao` → claim da decisão → auditoria. Compensação nos dois caminhos de falha.
5. A movimentação carrega `documento_vinculado = nc.numero`, `justificativa` = a da decisão e
   `motivo = 'Liberação por não conformidade'` (literal novo, distinto de *"Desbloqueio avulso"* —
   é o que torna a liberação legível no livro).

**Cenários (TDD, com controle positivo em cada um):**

1. `ACEITAR` em NC de inspeção libera a reprovada e o bloqueado cai exatamente por ela
2. `ACEITAR_SOB_DESVIO` libera igual (é o caso do C57)
3. `DEVOLVER` grava a decisão e **não** mexe no bloqueado — efeito `NENHUMA`
4. `SUCATEAR` idem (RN-04)
5. NC de origem `RECEBIMENTO` decidida `ACEITAR` → `SEM_BLOQUEIO`, bloqueado intacto
6. Inspeção com `quantidade_reprovada = 0` → `SEM_BLOQUEIO`
7. **RN-03 — duas NCs da mesma inspeção**: a segunda devolve `JA_LIBERADA` e o bloqueado **não**
   cai de novo (o cenário que a F0-2 mediu; abre a segunda NC pela porta manual)
8. **RN-02 fatal** — bloqueado insuficiente: 400 com *"Quantidade bloqueada insuficiente: N"*,
   a NC continua **ABERTA**, `liberacao_nc_em` continua **NULL** e o bloqueado não muda
9. A movimentação nasce com `documento_vinculado` = o número da NC
10. Decidir duas vezes a **mesma** NC continua 409 (regressão da Etapa 43)

> **Controle positivo obrigatório no cenário 7 e no 8** — são os dois que a leitura não pega.
> No 7, sabotar trocando o claim da inspeção por um claim na NC: tem de cair **nomeando o
> bloqueado que caiu duas vezes**. No 8, sabotar removendo a compensação: tem de cair na asserção
> do `status = 'ABERTA'`, não na do saldo.

## T2 — galho: a rota devolve o efeito

**Arquivos:** `server/routes/almoxarifado/extended.js` (`:1097`),
`server/tests/api/naoConformidadeLiberacaoRotas.api.test.js` (novo).

A rota hoje devolve `obterNaoConformidade`. Passa a devolver o objeto **com** `liberacao`. Cenários:
o efeito chega pelo HTTP nos quatro valores; 403 para perfil sem `decidir_nao_conformidade` **e o
bloqueado não muda** (asserção positiva ao lado da negativa); 400 do motor propagado com a literal.

## T3 — galho: a tela

**Arquivos:** `client/src/components/almoxarifado/NaoConformidadesAlmoxarifado.js`,
`client/src/components/almoxarifado/__tests__/NaoConformidadesAlmoxarifado.test.js`.

O toast de sucesso concatena `resp.data?.liberacao?.mensagem` quando houver. Cenários: os quatro
efeitos aparecem no toast; resposta **sem** o campo `liberacao` (servidor antigo) não quebra a tela
nem mostra `undefined`.

## T4 — tronco: integração

**Arquivo:** `server/tests/api/naoConformidadeLiberacaoIntegracao.api.test.js` (novo).

Fluxo inteiro **pela rota**: receber → item crítico entra retido → inspecionar reprovando parcial →
a NC nasce sozinha → decidir `ACEITAR_SOB_DESVIO` com um usuário **QUALIDADE real** no harness →
conferir que o disponível subiu exatamente pela reprovada, que o livro tem a linha `DESBLOQUEIO`
com `documento_vinculado` e que a NC está `DECIDIDA`. É o cenário que prova o C57 fechado.

---

## Fase 2 — o que o revisor fresco tem de atacar

1. **A ordem da seção 4 do design** — é o ponto de maior risco. Existe sequência mais simples com
   as duas garantias (não liberar duas vezes **e** decisão gravada ⇒ material liberado)?
2. **A compensação do passo 4** usa `BLOQUEIO` pelo motor. Isso reintroduz o bloqueio no pool —
   mas o pool é do material: se outra coisa mexeu no bloqueado no meio, o número volta certo?
3. **Cada RN traçada até o último gesto do usuário** (a quarta pergunta da Fase 2): depois de
   liberar, o material volta ao disponível — alguma guarda posterior recusa o que esta etapa
   autorizou? Conferir a saída, a requisição e o consumo.
4. **A ausência de ação nova** (F0-1/RN-08) é defensável, ou abre caminho para a QUALIDADE mexer
   em saldo por uma porta lateral?

---

## Estado

- [ ] T1 — tronco
- [ ] T2 — galho
- [ ] T3 — galho
- [ ] T4 — integração
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
