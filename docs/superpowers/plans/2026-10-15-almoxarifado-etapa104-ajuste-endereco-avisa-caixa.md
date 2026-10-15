# Etapa 104 — o ajuste com endereço que leva a caixa passa a avisar (C186, B495)

> Status: **FECHADA — 2026-10-15.** Plano `4e025751`, T1 `660ae114`, T2 `385ff127`, T3 `27ba1c29`, Fase 5 `86ec9f39`, fechamento (docs) no commit seguinte. Worktree `CRM-wt-e104`, branch `etapa-e104` (de `main` `806a0e0c`).
> Origem: "Próxima tarefa detalhada — Etapa 104" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa102-encerrar-com-caixa-recusa.md`; C186, B495.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa-design.md`.
>
> **Numeração** (conferida com `grep -o` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B703**,
> último C **208**, última A **A54**. A Etapa 105 (Compras) roda em paralelo e escreve só em `docs/compras-*`. Esta etapa:
> **B704–B709**, **C209–C210**, A55 se houver consulta.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e104fase0.js` (não versionada). Tabela e respostas no design. Resumo:

- P1: AJUSTE com endereço A→0 sobre caixa sem reserva 4 → **201**, total 0; a entrega → 400 *"Máximo: 0"*.
- P5: o **estorno** desse ajuste (ADMIN, `ajustar_estoque`) → 200, total 4, a entrega → 200 *Entregue*.
- O teste da Etapa 10 (`ajusteRetencao` *"AJUSTE COM localizacao continua passando mesmo com retencao"*) prende um
  **corte de escopo** (D1/D7), não "a contagem é verdade física"; "a contagem redefine" é a decisão do cliente no
  comentário do motor (Etapa 6, round 3).
- A conferência de inventário grava `AJUSTE_INVENTARIO` **sem** endereço — já protegida (Etapa 97).
- Com reserva (P2) a caixa também é levada; a entrega diz "disponível negativo" (C209, declarado).
- **Erro do plano da 102** (ponto de atenção): *"o ajuste com endereço não pega a trava por material hoje"* — **estava
  errado**: desde a 97 (B494) `registrarMovimentacao` envolve o motor em `naTravaDoMaterial`.

## Regras de negócio

- **RN-01 — a contagem por endereço continua gravando.** `AJUSTE` (e `AJUSTE_INVENTARIO`) com `localizacao_destino_id`:
  a linha vira o contado e o total a soma das linhas, como sempre — nenhuma recusa nova. O teste da Etapa 10 não muda.
  *Cenário:* P1 → 201, total 0.
- **RN-02 — avisa quando o DISPONÍVEL fica abaixo da caixa sem reserva.** Depois do ajuste com endereço,
  `lerCaixa(material)` e o `disponivelSql` do material (físico − reservado − bloqueado − em inspeção − em terceiros: o
  mesmo que limita a entrega); se `caixa > disponível + 1e-9` (`!Q.cabe(caixa, disponível)`), a resposta ganha
  `aviso_caixa` = literal **A1** (o número mostrado é `max(0, disponível)`). Senão a chave **não vem**. Vale nos dois
  sentidos (o ajuste que sobe e continua abaixo também avisa). *Cenários:* P1 avisa; P3 B→0 (total 4 = caixa 4, sem
  retenção) não avisa; P3 A→1 avisa; P3 A→3 avisa; bloqueado 2 com total = caixa avisa com 2; a reserva 3 de outra
  requisição com total = caixa avisa com 1; sem caixa nunca avisa. *(Corrigido na Fase 2, achado 2: o plano dizia
  `caixa > total` — com bloqueado ou reserva de outra requisição a entrega ficava presa em "Máximo: 2" sem aviso.)*
- **RN-03 — só o ajuste com endereço.** Ajuste sem endereço já recusa (97); ENTRADA, SAIDA, TRANSFERENCIA: sem aviso.
- **RN-04 — o aviso nunca derruba o ajuste.** A leitura vem depois do livro, num `try/catch`; falhou → 201 sem aviso.
- **RN-05 — sem trava nova.** O motor já roda sob a trava do material; a caixa é lida dentro dela.
- **RN-06 — a tela mostra o aviso.** Em Movimentações, depois do *"Movimentação registrada!"*, `toast.warn(aviso_caixa,
  { autoClose: false })` com a literal do servidor; sem `aviso_caixa`, nada além do sucesso.
- **RN-07 — os dois caminhos que a A1 ensina funcionam.** (i) estornar o ajuste **que baixou** o estoque (perfil com
  `ajustar_estoque`: Administrador, Gestor; o almoxarife recebe 403) → o total volta e a entrega passa; (ii) devolver à
  prateleira o que se perdeu → a caixa some, um ajuste seguinte não avisa, e a requisição vazia sem entrega é cancelada por
  quem pediu (E2 da 101). *(Corrigido na Fase 2, achado 1: a A1 dizia "estorne este ajuste" — o ajuste que SOBE e
  continua abaixo também avisa, e o estorno dele reduz o total e é recusado pela guarda da 97.)*

## Contrato congelado

`server/services/almoxarifado/caixaSql.js` exporta, além do que já exporta:

```js
// a lista "a requisição X" / "as requisições X e Y" / "as requisições X, Y, Z e mais N" — a mesma do sufixoCaixa
function descreverRequisicoes(requisicoes) { ... }  // usada por sufixoCaixa (texto byte a byte o de hoje) e pelo aviso
// null se a caixa cabe no disponível (Q.cabe(caixa, disponivel)); senão a literal A1
function avisoCaixaDoAjuste({ caixa, requisicoes } = {}, disponivel, material) { ... }
```

**A1** (literal, `${…}` = `Q.qtd(...)` e `material.codigo` / `material.unidade`):

```
Ajuste gravado, mas o disponível de ${codigo} ficou em ${max(0, disponível)} ${unidade}, abaixo dos ${caixa} ${unidade} separados para ${lista}: a entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu — estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o à prateleira na requisição.
```

Motor (`stockService.registrarMovimentacaoSemTrava`): retorno `{ id, saldo_anterior, saldo_posterior }` e, só no ajuste
com endereço com aviso, `aviso_caixa: <A1>`. `POST /api/almoxarifado/movimentacoes/v2` devolve o retorno do motor (201)
— a chave chega sem mudar a rota. A v1 não aceita endereço (inalterada). Recusas: nenhuma nova.

Cliente (`MovimentacoesAlmoxarifado.js`): lê `resposta?.data?.aviso_caixa` (string não vazia; resposta sem `data` não quebra — Fase 2, achado 3) → `toast.warn(texto, { autoClose:
false })`.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 1 trava, 2 correções, notas

O revisor leu o código e rodou a sonda `server/tests/sonda/e104rv-1.js` (R1–R6, contra a T1 parcial que já estava no disco).

1. **(trava) A A1 mandava estornar um ajuste cujo estorno é recusado.** R1: A→0 (avisa), A→3 (sobe, ainda abaixo, avisa
   *"estorne este ajuste"*); estornar o A→3 → 400 da guarda da 97 (reduz o total abaixo da caixa); estornar o A→0 → 200,
   entrega 200. **Corrigido:** *"estorne o ajuste que baixou o estoque"*; teste J5 prende os dois estornos.
2. **(correção) A régua `caixa > total` deixava a entrega presa sem aviso** com retenção fora da caixa: R2 (bloqueado 2,
   A:6, caixa 4, A→4 → sem aviso, entrega *"Máximo: 2"*); R3 (reserva 3 de outra requisição, A:7, A→4 → sem aviso, entrega
   *"Máximo: 1"*). **Corrigido:** a régua é o `disponivelSql` do material depois do ajuste; a A1 diz "disponível".
3. **(correção) Cliente:** `api.post` sem guardar o retorno; ler `res.data` com `res` indefinido daria TypeError dentro do
   `try` e `toast.error` logo depois do sucesso. Já estava `resposta?.data?.aviso_caixa`; o teste cobre `undefined`.
4. **(nota)** `AJUSTE_INVENTARIO` com endereço não tem chamador (a v2 barra o tipo; a conferência grava sem endereço) — o
   "(e AJUSTE_INVENTARIO)" da RN-01 só é alcançável pelo serviço direto.
5. **(nota)** O retorno do motor: a v1 monta a resposta campo a campo; nenhum outro chamador chega ao ramo; nenhum
   `deepStrictEqual` do retorno em risco. `saldoPosterior` no ramo é o total relido depois do `syncMaterialTotals`.
6. **(nota)** Perfis conferidos (ALMOXARIFE estorna → 403, GESTOR → 200); a devolução vale em todo `STATUS_COM_CAIXA`;
   "na requisição" fica no singular com duas requisições e a A1 não diz quanto devolver (declarado, B706).
7. **(nota)** O fluxo até o fim funciona (R4 várias linhas e uma entrada no meio; R5 perdeu tudo → devolver → cancelar pelo
   solicitante; R6 entrega parcial → devolver 3 → encerrar 200).
8. **(nota)** T2 é independente (só a chave congelada).

## Tasks (sort topológico)

- [x] **T1 (tronco) — o aviso no motor.** — `660ae114`. RN-01..RN-05. `caixaSql.js` (`descreverRequisicoes`, `avisoCaixaDoAjuste`),
  `stockService.js` (ramo do ajuste com endereço marca; aviso no fim, em `try/catch`). Teste novo
  `server/tests/api/ajusteEnderecoCaixa.api.test.js`: P1 (literal inteira, total 0, linha 0); P3 (B→0 sem chave; A→1
  com; A→3 com); sem caixa sem chave; o ajuste sem endereço segue recusando (M6); ENTRADA/TRANSFERENCIA sem chave; duas
  requisições na lista; pela função pura (`avisoCaixaDoAjuste` com caixa 0, igual, resto 1e-10, maior); `sufixoCaixa`
  byte a byte o de hoje; RN-04 (a leitura falha → 201 sem chave, por stub de `caixaSql.lerCaixa`). Controle positivo:
  sabotar a régua (`>=`→ sempre), o ramo (sem endereço também), o `try/catch`.
- [x] **T2 (galho, depois da T1) — a tela.** — `385ff127`. RN-06. `MovimentacoesAlmoxarifado.js`; teste novo
  `client/src/components/almoxarifado/MovimentacoesAvisoCaixa.test.js`: com `aviso_caixa` → `toast.success` e
  `toast.warn(literal, { autoClose: false })`; sem → só o sucesso; `aviso_caixa` vazio/não texto → nada. Controle:
  sabotar o `toast.warn`.
- [x] **T3 (integração, depois de T1–T2) — o documento até o fim, pela rota E pelo serviço.** — `27ba1c29` (+ J5, da Fase 2).
  `server/tests/api/ajusteEnderecoCaixaIntegracao.api.test.js`: (J1) pela rota, ALMOXARIFE conta A→0 → 201 com A1;
  entrega → "Máximo: 0"; ALMOXARIFE estorna → 403 (perfil); ADMIN estorna → 200; entrega 4 → 200 *Entregue*. (J2) pelo
  serviço (`registrarMovimentacao`) o mesmo aviso no retorno; devolver à prateleira 4 → a caixa some → um novo ajuste
  com endereço não traz a chave. (J3) o teste da Etapa 10 intacto (ajuste com endereço abaixo do reservado passa, sem
  aviso: não há caixa).
- [x] **T4 — Fase 5 e fechamento.** — ver abaixo.

## Execução (2026-10-15)

- **Plano** `4e025751` (design, plano, Fase 2).
- **T1** `660ae114` — `caixaSql.descreverRequisicoes` (extraída do `sufixoCaixa`, texto byte a byte o de antes) e
  `caixaSql.avisoCaixaDoAjuste`; o motor marca `ajusteComEndereco` no ramo e, no fim, lê a caixa e o `disponivelSql` num
  `try/catch`. Teste novo `ajusteEnderecoCaixa` (12). **Controle:** 8 sabotagens — o aviso para todo movimento (cai o
  RN-03 na ENTRADA), a TRANSFERENCIA na condição (cai o RN-03 na TRANSFERENCIA), o flag no ramo sem endereço (cai o RN-03
  no ajuste sem endereço 2→3), sem `Q.cabe` (P3 B→0 e a função pura), sem folga (a função pura, resto 1e-10), sem o
  `try/catch` (RN-04: 500), o saldo anterior no lugar do posterior (5 vermelhas), a régua pelo total (os dois casos da
  Fase 2), sem o `max(0)` (a função pura, disponível −2). Restauro por cópia e `md5sum -c` OK.
  **Divergências:** (1) o RN-03 do primeiro rascunho passava com o flag em todo movimento — a ENTRADA deixava o total acima
  da caixa; reescrito para começar abaixo da caixa (A→1), e o ajuste sem endereço da 97 passou a ser 2→1 (o 3 subia e não
  era recusado). (2) **`portasAvulsasCaixa` `[97 RN-00]` prendia os 4 exports do `caixaSql`** (e o teste do ciclo contava
  4) — a Fase 2 não o listou; achado pela suíte (354/355), reescrito para 6 no mesmo commit.
- **T2** `385ff127` — `resposta?.data?.aviso_caixa` → `toast.warn(texto, { autoClose: false })`. Teste novo
  `MovimentacoesAvisoCaixa` (3). **Controle:** sem `{ autoClose: false }` (cai o primeiro); o guard trocado por
  `!== undefined` (cai o terceiro).
- **T3** `27ba1c29` — `ajusteEnderecoCaixaIntegracao` (J1–J5). **Controle:** o motor sem o flag derruba J1, J2, J4 e J5 (J3 é
  a metade negativa) — medido depois de o J5 entrar.

## Fase 4 — integração serial (2026-10-15)

Sem worktree de galho (T2 só depende da chave congelada; executada em sequência na `CRM-wt-e104`). Suíte na árvore com
T1–T3 (antes dos commits): `test:api` **355/355** arquivos (EXIT 0; a primeira rodada deu 354/355 — o `[97 RN-00]`
acima); `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter` **3/3**; `test:sqlite` **5/5**;
cliente jest **102 suítes / 1552 testes** (EXIT 0); `CI=true react-scripts build` EXIT 0.

## Fase 5 — revisão adversarial do código (2026-10-15) — 0 defeito de regra, 4 correções pequenas, 1 furo anterior

Dois revisores frescos em worktrees próprias (`CRM-wt-e104rv1`, `CRM-wt-e104rv2`, HEAD `27ba1c29`, junction; removidas).

- **Revisor 1 (RN, perfil, último gesto).** Sondado e passou: perfis na v2 (ADMIN e ALMOXARIFE 201 com aviso; GESTOR,
  CONSULTA, PRODUCAO 403) e no estorno (só ADMINISTRADOR e GESTOR); *Parcialmente Atendida*; *Pronta para Retirada*
  (devolver a leva a *Em Separação*); requisição excluída (sem aviso); duas requisições, uma com reserva (o número bate com
  o "Máximo"); lote; prateleira inativa; `permite_saldo_negativo`; fração (*"0.333333 PC"*, ponto decimal como o sufixo); a
  corrida separar × contar, 10 rodadas nas duas ordens, coerente. **Achados:** (1, real) unidade vazia/nula suja a A1
  (*"0 , abaixo dos 4  separados"*, *"0 null"*) — **corrigido** (o filtro do `sufixoCaixa`); (2, real, documento) três
  frases do manual (7.5, 10.5 e as portas avulsas) diziam que "o ajuste para menos" nunca leva a caixa — **corrigido**
  ("sem localização" + a frase do aviso); (3, real, **anterior à etapa**) o Gestor estorna o ajuste de material de
  cliente — **C211**, reproduzido por mim (`server/tests/sonda/e104c211.js`), candidata da 106; notas: (4) legado já
  preso antes da contagem pode não ter "ajuste que baixou"; (5) dois ajustes que baixaram exigem dois estornos — as duas
  na B706 e no manual; (6) com reserva parcial o número do aviso (a parte sem reserva) difere do separado da tela —
  coerente com a regra, declarado.
- **Revisor 2 ("o teste passaria com a feature quebrada?") — 33 sabotagens: 29 vermelhas, 4 equivalentes/inalcançáveis**
  (S03 a caixa lida antes do livro — o ajuste não muda a caixa; S08/S09 sem `Q.qtd` — os valores já chegam arredondados;
  S18 a lista vazia — `lerCaixa` só devolve caixa > 0 com requisição; S24 `AJUSTE_INVENTARIO` com endereço — sem
  chamador). **Achados reais:** (1) a ordem sucesso → aviso não estava presa — **asserção nova** (`invocationCallOrder`);
  (2) o caso de arredondamento `0.1 + 0.1` dá 0,2 exato e não provava nada — **trocado** por `0.1 + 0.2`; (3) unidade
  nula (o mesmo do rv1). **Cobertura fina declarada:** a régua pelo disponível é presa por 2 testes unitários e o `max(0)`
  só pelo puro — **acrescentado** o caso pela rota com disponível −3 (*"ficou em 0 PC"*).
- **Correção:** `86ec9f39`. **Controle:** sem o filtro de unidade (cai o puro, *"0 null"*); `qtdUn` sem `Q.qtd` (cai o
  puro, o 0.1 + 0.2); `toast.warn` antes do `toast.success` (cai o primeiro teste do cliente). Restauro por cópia, `md5sum
  -c` OK.

**Verificação depois da Fase 5:** na árvore com a correção (antes do commit `86ec9f39`, idêntica a ele): `test:api` **355/355** arquivos (EXIT 0);
`test:almoxarifado` **44/44**; `test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 5/5; cliente jest **102 suítes /
1552 testes**; `CI=true react-scripts build` EXIT 0.

---

## Retro de 4 números

- **Rodadas de correção até verde:** 2 — a da Fase 2 (régua e literal, antes da suíte) e a da suíte (`[97 RN-00]` prendia
  os exports — 354/355 → 355/355). Nenhum teste vermelho em duas rodadas seguidas.
- **Achados de revisão:** Fase 2 — 1 trava + 2 correções, **todas reais** (e não listou o `[97 RN-00]`). Fase 5 — rv1:
  **3 reais** (2 da etapa, 1 anterior — C211), 3 notas; rv2: 33 sabotagens, **3 reais** (1 repetido do rv1), **4 ruído**
  (equivalentes/inalcançáveis).
- **Paralelismo:** 0 galho de código em paralelo (T2 só depois da T1, na mesma árvore). Em paralelo: a revisão do plano ×
  a escrita da T1 (o revisor sondou contra a T1 parcial — ajudou); os dois revisores da Fase 5 × a documentação. Nenhum
  EADDRINUSE (a suíte inteira só rodou com ninguém mais rodando teste).
- **Defeito que escapou:** *(preenchido na Etapa 106.)* Nenhum defeito de código da 104 apareceu na 106. A frase da A1
  *"(perfil Administrador ou Gestor do almoxarifado)"* passou a ficar errada para material de cliente **por causa da regra nova
  da 106** (o estorno do ajuste de cliente só do Administrador) — corrigida lá (B710); não é escape da 104. Da Etapa 102 para cá: nenhum defeito de código; um erro de
  documento (a trava no plano da 102) e o `CLAUDE.md` desatualizado na mesma frase (**G87**, não editado).

## O que fica de fora (declarado)

- Recusar a contagem (opção (a) da B704).
- A caixa coberta por reserva e as retenções sem caixa (C209; o D7 da Etapa 10).
- O aviso fora da tela de Movimentações (sem e-mail/notificação).

## Próxima tarefa detalhada — Etapa 106

*(A 105 é da frente de Compras, em paralelo. A série B desta etapa foi B704–B706 — a 106 começa em **B707**, C em
**C212**, A em **A55**, G em **G88**.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md`, medido em 2026-10-15):** as features 🟡 são 00, 01, 05,
06, 21, 22 e 23. Dois candidatos medidos nesta etapa:

1. **C211 — o Gestor estorna o ajuste de material de cliente** (feature 13, com a 23 — perfis e segurança, 🟡). A
   decisão 7 da Etapa 8 restringe o ajuste de material de cliente a `ajustar_material_cliente` (Administrador; no motor,
   `ownerRules.assertAjustePermitido`, `stockService.js` ~1347). O estorno (`POST /api/almoxarifado/movimentacoes/:id/cancelar`,
   gate `ajustar_estoque` = Administrador e Gestor) não confere o dono. **Medido** (sonda `server/tests/sonda/e104c211.js`,
   não versionada): Gestor ajusta → 403 *"Sem permissão para esta operação"*; Administrador ajusta (com e sem localização) →
   201; Gestor estorna → **200**, o saldo do cliente volta.
2. **C209 — a contagem abaixo do reservado não avisa** (feature 05/03): material com reserva da requisição separada,
   contagem "0 no A" → 201, disponível −4, sem aviso; a entrega já explica (*"disponível … negativo (reservado além do
   físico)"*).

**Escolhida: a C211.** É autorização (o número que o cliente confere e cobra muda por quem não tem a permissão), a C209 é
aviso de um estado que a entrega já nomeia. A C209 fica para depois (o desenho dela está no fim desta seção).

**Tema: o estorno de ajuste de material de cliente exige a mesma permissão do ajuste (C211).**

**Fase 0 (medir antes de prometer):**
1. Reproduzir a sonda pela rota com os perfis reais (Gestor, Administrador, superadmin, Almoxarife) e os dois tipos
   estornáveis de ajuste (`AJUSTE` com e sem localização; `AJUSTE_INVENTARIO` não é estornável — RN-10 da Etapa 10).
2. Os **outros** estornos de material de cliente: ENTRADA, SAIDA (com OS/projeto do dono — `ownerRules.assertSaidaPermitida`),
   DEVOLUCAO_CLIENTE, TRANSFERENCIA — algum deles contorna uma regra do dono? (Medir cada um; não supor.)
3. O que `assertAjustePermitido` faz além de `can(...)`: ele **audita** como efeito colateral (comentário da conferência,
   `routes/almoxarifado.js` ~1620) — chamar no estorno gravaria auditoria? É o que se quer?
4. Quem mais chama `cancelarMovimentacao` (exclusão de nota, estornos internos, compensação `opcoesEstorno.compensacao`)
   — a guarda nova não pode recusar um estorno interno legítimo.

**Contrato candidato (decisão — letra B, caminho reversível):** no `cancelarMovimentacao`, para `mov.tipo === 'AJUSTE'` de
material com `proprietario_cliente_id`, exigir `can(user, 'ajustar_material_cliente')` — recusa **403** com literal
própria no estilo da do ajuste (ler a literal exata em `ownerRules.assertAjustePermitido` e reaproveitar), **antes** de
qualquer efeito; isento quando `opcoesEstorno.compensacao === true` (estorno interno). Descartado de saída: mudar o gate da
rota (`ajustar_estoque`) para todos (o Gestor perderia o estorno do material próprio).

**Pontos de atenção:** a mensagem da tela do livro (`MovimentacoesAlmoxarifado.js`, estorno) mostra `err.response.data.error`
— conferir que o 403 aparece; o manual §16.8 e §6.10 descrevem a permissão; teste de integração pela rota **e** pelo
serviço (`cancelarMovimentacao` direto); controle positivo concedendo a permissão ao Gestor (asserção negativa de
permissão só se prova sabotando — `fechar-etapa`).

**O que já está pronto e não precisa reabrir:** a regra do ajuste (`assertAjustePermitido`, Etapa 8), o gate da rota de
estorno, o aviso da caixa desta etapa.

**Depois (C209, desenho já medido):** o motor, no mesmo ponto do `aviso_caixa` (fim de `registrarMovimentacaoSemTrava`,
`ajusteComEndereco`, `try/catch`), devolveria `aviso_retencao` quando o disponível depois do ajuste com endereço ficou
**negativo**, com as parcelas na ordem e rótulos da M6 (`motivoRecusaAjustePorRetencao` — exportar o construtor das
"partes", não duplicar a fórmula: D1 da Etapa 10); a tela mostraria como mostra o `aviso_caixa`. O teste
`ajusteRetencao` *"AJUSTE COM localizacao continua passando mesmo com retencao"* segue passando (aviso é aditivo).
