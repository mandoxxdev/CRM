# Etapa 31 — Os quatro geradores de número colidem (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** os quatro números de documento do módulo (`INV-`, `REQ-`, `REC-`, `REM-`) param de
colidir. Um gerador só, com carimbo de tempo que **não dá a volta** e entropia larga, mais um
retry curto como cinto de segurança.

**Architecture:** módulo novo `server/services/almoxarifado/numeroDoc.js`, consumido pelos quatro
pontos de escrita. **Nenhuma mudança de schema, nenhuma migração de dado.**

**Spec:** `docs/superpowers/specs/2026-08-31-almoxarifado-etapa31-numeros-que-colidem-design.md`.

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
   passa igual com o gerador velho.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | `gerarNumeroDocumento(prefixo)` devolve `<PREFIXO>-<8 chars de tempo><6 aleatórios>`, tudo em maiúsculas, sem separador interno | `numeroDocumento.api.test.js` |
| RN-02 | O carimbo de tempo **não dá a volta**: dois instantes distintos **nunca** produzem o mesmo prefixo de tempo. **Prova direta** — comparar o carimbo de `t` com o de `t + 10⁶ ms` e `t + 10⁸ ms`, que é exatamente onde o gerador antigo repetia | idem (**peso**) |
| RN-03 | **Mil chamadas no MESMO milissegundo** (relógio fixado) produzem **mil números distintos** | idem (**peso**) |
| RN-04 | A criação dos quatro documentos retenta ao tomar `UNIQUE constraint` no `numero`, até **5** vezes com número novo a cada tentativa; esgotadas, sobe erro **traduzido** (`'Não foi possível gerar um número único para o documento'`, 500), nunca o texto cru do SQLite | teste com colisão **forçada** |
| RN-05 | Documento gravado no formato **antigo** continua sendo lido, listado, filtrado e impresso — nenhuma tela nem rota valida o formato | teste que grava um `REM-885484687` à mão e o lê pela rota |
| RN-06 | O gerador é **um só**: nenhum dos quatro pontos monta número por conta própria | `grep` no teste (ver a armadilha abaixo) |

> **A armadilha da RN-06, dita antes de alguém cair nela.** Provar "não existe outro gerador" com
> `grep` dentro de um teste é frágil e já falhou nesta base (`grep -c` combinado com `wc -l` foi um
> dos quatro testes vazios documentados). Se for feito, **tem de ter controle positivo**: a
> varredura precisa **achar** a ocorrência quando ela é reintroduzida de propósito. Se não der para
> fazer isso de forma limpa, **não escreva o teste** — escreva a ausência no plano e siga.

## Contratos congelados

**C1 — `server/services/almoxarifado/numeroDoc.js`** (novo):

```js
gerarNumeroDocumento(prefixo)          // -> 'REM-M8K2P0X7A3F1'  (prefixo + '-' + 8 + 6)
inserirComNumeroUnico(db, prefixo, fn) // fn(numero) faz o INSERT; retenta ate 5x no UNIQUE
NUMERO_TENTATIVAS = 5
```

- **Tempo:** `Date.now().toString(36).toUpperCase()`, **inteiro**, sem `slice` — é o `slice` que
  fazia o carimbo dar a volta. Hoje isso são 8 caracteres, e continuam 8 até o ano **5138**.
- **Aleatório:** 6 caracteres base36 maiúsculos (~2,2 bilhões por milissegundo).
- `inserirComNumeroUnico` só engole erro cujo texto case `/UNIQUE constraint/i` **e** mencione a
  coluna `numero` — **qualquer outro erro sobe intacto**. Engolir `UNIQUE` genérico esconderia
  colisão de outra coluna (`nota_fiscal`, por exemplo) atrás de um retry mudo.
- `fn` tem de ser **só o INSERT do documento**, nada mais: nos quatro pontos ele é a **primeira
  escrita** do fluxo (medido), então retentar é seguro. **Se algum executor achar um ponto em que
  não é a primeira escrita, pare e reporte** — retentar depois de outra escrita duplicaria efeito.

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

Cenários: (1) formato da RN-01, com o prefixo e os comprimentos; (2) **RN-02, a prova que importa**
— `Date.now` fixado em `t`, depois em `t + 1e6` e `t + 1e8`, e os três carimbos têm de ser
**distintos entre si** (é exatamente onde o gerador antigo repetia; incluir no teste um comentário
dizendo isso); (3) **RN-03** — relógio fixo, 1000 chamadas, `new Set(...).size === 1000`;
(4) `inserirComNumeroUnico` devolve o resultado do `fn` quando não há colisão, chamando `fn`
**uma vez**; (5) colisão nas 2 primeiras e sucesso na 3ª → `fn` chamado 3 vezes, **com números
diferentes a cada vez** (guardar os argumentos e afirmar que são distintos — sem isso, um retry que
reusa o mesmo número passaria); (6) 5 falhas → erro traduzido, e a mensagem crua do SQLite **não**
aparece; (7) erro que **não** é UNIQUE de `numero` sobe intacto **na primeira**, com `fn` chamado
uma vez só.

**Controles positivos:** `toString(36)` de volta para `slice(-8)` → (2) cai no carimbo repetido;
aleatório de 6 para 1 char → (3) cai contando distintos; retry reusando o mesmo número → (5) cai
na asserção dos argumentos distintos; `catch` engolindo qualquer erro → (7) cai.

Commit: `Almoxarifado Etapa 31 Task 1: um gerador de numero que nao da a volta`.

## Task 2 — Ligar os quatro pontos (tronco)

Arquivos: os quatro da C2. Cada um passa a chamar `inserirComNumeroUnico`, e a função local some.
**Confirme, ponto a ponto, que o INSERT do documento é a primeira escrita do fluxo** — está medido,
mas medir de novo custa um `grep` e evita duplicar efeito.
Cenário RN-05, um por tabela que já tenha teste: gravar à mão um registro com número no **formato
antigo** (`REM-885484687`) e lê-lo pela rota — nenhuma leitura pode recusá-lo.
**Rode a suíte inteira**: os quatro números aparecem em asserção de teste? Se algum teste afirmar
comprimento ou formato, ele **é** o achado — ajuste o teste e diga no plano.

**Controle positivo:** voltar **um** dos quatro para a função antiga → o cenário da RN-03 daquele
fluxo cai. Se não houver cenário que caia, **é achado**: o ponto está sem cobertura.

Commit: `Almoxarifado Etapa 31 Task 2: os quatro documentos passam pelo mesmo gerador`.

## Task 3 — O retry provado pela rota (tronco)

O retry da RN-04 é código que, com a entropia da D2, **nunca deve disparar** — e por isso precisa
de prova própria, senão é código que ninguém sabe se funciona.

Cenário: pela rota real de um dos quatro fluxos, **force a colisão** — por exemplo, fixando
`Date.now` e o aleatório para produzir o mesmo número duas vezes, ou pré-inserindo o número que a
próxima chamada vai gerar. Duas criações seguidas têm de **as duas terem sucesso**, com números
distintos, e **nenhuma** delas devolver erro de SQLite ao cliente.

**Controle positivo:** remover o retry → o cenário cai com o `UNIQUE constraint` cru na resposta —
que é exatamente o que o usuário vê hoje.

Commit: `Almoxarifado Etapa 31 Task 3: a colisao forcada prova o retry, pela rota`.

## Fechamento

`fechar-etapa`: novidades (seção; **letra C** — a partir do deploy os números novos ficam mais
curtos e **com letras**, e os antigos continuam válidos e legíveis, D4; **letra B** — perguntar se
ele quer numeração **sequencial por ano** (`REQ-2026-0001`), que é o que uma ERP madura faz e exige
tabela de contador mais decisão sobre reinício anual), spec da feature de cada documento tocado
(requisições 03, recebimento 08, terceiros 8b, inventário 10) — **só a linha do número, não o
status**, porque a etapa não muda comportamento de feature —, mapa, guia (roteiro: criar dois
documentos e comparar os números; o antigo continua abrindo), manual (**onde o manual descreve o
formato do número, se descrever** — medir antes), retro.
