# Etapa 60 — a divergência na separação, com motivo

> Status: **FECHADA (2026-09-30)** — `eea0687` (T1), `0486b9c` (T2), fix-round 1125a0f.
> Feature 05, item "divergência com motivo" (a spec citava um teste que não existe — corrigido à vista na Etapa 59).
> **Leia a seção "Fase 2 … o desenho mudou": as RN-01..RN-04 abaixo descrevem a versão COM RECUSA, que foi derrubada
> antes do código. Ficaram à vista de propósito; o que vale é a decisão da Fase 2 e o contrato congelado.**

## Fase 0 — medido (2026-09-30)

- `separarRequisicao`: passada 1 valida cada entrada contra `maxSeparar(item, disponível)` (recusa
  acima com "`{material}: não é possível separar {q} {un}. Máximo: {max} (pendente: {p}, disponível: {d})`");
  abaixo do máximo, **aceita calado**. A rodada grava `itens_json` (item, material, quantidade e — desde
  a 59 — origem/lote) e a auditoria `SEPARACAO`.
- Nada registra *por que* se separou menos do que dava. O conferente (Etapa 28) não tem como saber.
- Tela: modal de separação em `RequisicoesList.js`; bloco "Separação (N)" no detalhe lista as rodadas
  (`GET /requisicoes/:id/separacoes`, `listarSeparacoes`).

## Regras de negócio — ⚠️ SUPERADAS pela Fase 2 (versão com recusa; não implementada)

- **RN-01** — uma entrada da rodada com `0 < quantidade_separada < máximo separável` (o mesmo
  `maxSeparar` da recusa, calculado na hora) é **divergente** e exige `motivo_divergencia` (texto,
  ≥ 5 caracteres após trim): 400 `{material}: separou {q} de {max} possível(is) — informe o motivo da divergência (mínimo 5 caracteres)`.
  Separar menos **porque não há saldo** não é divergência (o máximo já é o disponível).
- **RN-02** — o motivo vai na rodada (`itens_json[].motivo_divergencia` e `itens_json[].maximo`) e na
  auditoria `SEPARACAO`. `motivo_divergencia` numa entrada que não é divergente é ignorado.
- **RN-03** — `listarSeparacoes` devolve as entradas com o motivo; a tela mostra no bloco "Separação (N)"
  "`{material}: {q} de {max} — {motivo}`".
- **RN-04 (tela)** — no modal de separação, quando a quantidade de um item fica abaixo do máximo
  separável, aparece o campo "Motivo da divergência" (obrigatório para confirmar).
- Só registro: sem alerta, sem não conformidade, sem ajuste (letra B).

## Tasks

- [x] **T1 (tronco)** — `eea0687` + fix-round 1125a0f. **Divergiu do plano:** sem recusa (Fase 2) — os testes provam o
  registro (7 cenários), não um 400. Texto original: serviço. Testes `server/tests/api/separacaoDivergencia.api.test.js`: menos que o
  máximo sem motivo → 400 literal, nada gravado; com motivo curto → 400; com motivo → gravado na rodada
  e na auditoria; menos por falta de saldo → sem motivo passa; igual ao máximo → sem motivo passa;
  motivo em entrada não divergente é ignorado; `listarSeparacoes` devolve o motivo.
- [x] **T2 (galho, tela)** — `0486b9c` + fix-round 1125a0f. O motivo é **opcional** na tela (Fase 2). T1 e T2 no mesmo push.
- [x] **T3** — verificação, Fase 5 e fechamento (abaixo).

## Fase 2 — revisão do plano: 1 crítico, 2 importantes, 2 menores → o desenho mudou

- **CRÍTICO** — "divergente = 0 < q < máximo" com **recusa** transforma em divergência obrigatória o
  parcial **legítimo** que a spec 05 já entrega: separar em várias viagens; o "Sai de" da Etapa 59
  (uma origem por item por rodada — com 4 em A e 6 em B, a rodada de A é sempre q=4 < 10); o
  "Ajustar Separação". E q=0 passava calado. Além disso, 111 separações parciais literais na suíte.
- **IMPORTANTE** — o default do modal usa o saldo lido ao abrir o detalhe: um recebimento com o modal
  aberto sobe o máximo do servidor e o default viraria "divergente" sem o usuário mexer.
- **IMPORTANTE** — T1 e T2 no mesmo push (senão a tela recusaria sem ter onde dar o motivo).
- Menores: o mesmo item duas vezes no payload (a régua tem de ser por item agregado); tolerância `1e-9`.

**Decisão (reversível, letra B): NÃO recusa.** A rodada **registra**, por item: `maximo` (o separável
na hora — o `maxSeparar` inicial do item; com uma origem só na rodada, limitado ao saldo nela menos o
já comprometido), `divergente` (`q < maximo - 1e-9`, agregado por item) e `motivo_divergencia`
(opcional, trim, até 500 caracteres). A tela **pede** o motivo quando a quantidade fica abaixo do
máximo, sem obrigar. O conferente vê no bloco "Separação (N)". Descartado: exigir motivo (quebraria o
parcial legítimo); exigir só quando o separador declarar "item encerrado" (não há esse gesto hoje).

### Contrato (congelado)
- `itens_separados[].motivo_divergencia` (opcional).
- Rodada `itens_json[]` e auditoria `SEPARACAO` (`dados_novos.itens[]`): + `maximo`, `divergente`,
  `motivo_divergencia` (null quando não há).
- `GET /requisicoes/:id/separacoes` devolve os campos (o `JSON.parse` genérico já passa). **Divergência medida no T1:**
  essa rota **não existe** — as rodadas vêm no detalhe `GET /requisicoes/:id`, campo `separacoes` (lido por
  `listarSeparacoes`). O plano citou a rota de memória; os testes usam o detalhe.

## Execução (2026-09-30)

- **T1 — `eea0687`.** A régua por item (`reguaDivergencia`) nasce no 1º encontro do item na passada 1, antes da
  mutação em memória; o resultado (`maximo`, `divergente`, `motivo_divergencia`) vai em cada entrada de `itens_json` e
  na auditoria `SEPARACAO`. **Dois testes da Etapa 28** (`separacaoComDono`) comparavam rodada e auditoria com
  `deepStrictEqual` e caíram: passaram a comparar os campos de antes e exigir os novos (contrato aditivo).
- **T2 — `0486b9c`.** Campo "Motivo da divergência (opcional)" no modal e a divergência no bloco "Separação (N)".
  Quantidade 0 não pede motivo (o item nem vai no payload).

## Fase 5 — revisão adversarial (um revisor, três lentes): 0 crítico, 2 importantes, 3 menores, 0 ruído

| # | Achado | Estado |
|---|---|---|
| I-1 | O registro **mentia**: dois itens do mesmo material mediam cada um contra todo o disponível (10 livres, 6 + 4 → os dois "divergentes"); o separado pendente de **outra requisição** no mesmo par contava como separável (quem separava tudo o que estava livre saía divergente) | **corrigido** — o máximo desconta os outros itens do material na rodada e o pendente de outras requisições no par; teste |
| I-2 | A régua da **tela** diferia da do **servidor**: o campo aparecia e o servidor descartava o motivo (ou o contrário) | **corrigido** — a tela desconta os outros itens do material e o pendente da própria planejada no par; o servidor **nunca** descarta o motivo (**B239**); testes |
| M-1 | Lote sem endereço caía no máximo do item (o saldo do lote não limitava) | **corrigido** |
| M-2 | O bloco mostrava uma linha por **entrada** com o máximo agregado | **corrigido** — uma linha por item com a soma |
| M-3 | O ajuste da T1 no teste da Etapa 28 **enfraqueceu** a prova de que rodada sem origem não carrega origem/lote | **corrigido** — a asserção voltou |
| — | Nenhum cenário tinha separado pendente no mesmo par: tirar o desconto passava verde | **corrigido** — cenário; e um 2º controle positivo ficou **verde** porque o pedido do item limitava antes do desconto — o cenário foi refeito (C:8, pede 10, 4 + 4) até a sabotagem cair |

**Declarados (não corrigidos):** separado **sem** endereço de outra requisição não sai do disponível (a separação
não reserva) — o máximo pode superestimar (**D (60)**); a tela não conhece outras requisições (o servidor grava a
verdade); quantidade 0 não é registrada (**D (60)**).

**Testes:** `server/tests/api/separacaoDivergencia.api.test.js` 7/7 (5 + 4 sabotagens vermelhas no cenário certo);
`separacaoComDono.api.test.js` 11/11; `client/src/components/almoxarifado/RequisicoesSeparacaoDivergencia.test.js`
12/12 (5 + 3 sabotagens).

## Retro (4 números)

- **Rodadas de correção até verde:** 1 fix-round.
- **Achados:** Fase 2 — 1 crítico + 2 importantes + 2 menores, e o crítico **derrubou o desenho** (a recusa); Fase 5 —
  2 importantes + 3 menores corrigidos, 3 declarados, **0 ruído**.
- **Paralelismo:** a tela rodou em paralelo com o tronco, contra o contrato congelado; T1 e T2 foram no mesmo push
  (exigência da Fase 2). Sem retrabalho.
- **Defeito que escapou da Etapa 59:** nenhum conhecido.
- **Lição de processo:** um conserto de teste feito com `printf '%b'` + `perl` deixou `\&\&` literal no JavaScript — a
  sintaxe quebrada pegou na hora, mas o jeito seguro é o de sempre nesta base: editar com a ferramenta de edição (ou um
  script escrito em arquivo), nunca com substituição montada no shell.

## Próxima tarefa detalhada — Etapa 61: a série por item na entrega (feature 05)

**Por que esta.** No "falta para 🟢" da 05, o registro por item ficou pago em endereço, lote (58/59) e divergência
(60); o que resta dele é a **série**. E não é só completude: **medido na leitura do código** (não executado) —
`server/tests/api/serieControleObrigatorio.api.test.js`, cenário *"[fluxos internos] entrega de requisicao continua
isenta de serie"*: `entregarRequisicao` chama o motor **sem** `exigeSerie`, então a entrega de material com
`controle_serie` baixa o físico **sem tocar em `series_almoxarifado`** — as séries entregues continuam "em estoque".
O invariante da Etapa 6b (`COUNT(série presente) == quantidade_atual`) quebra a cada entrega, e a série entregue
continua aparecendo como disponível para outra saída.

**Fase 0 da 61 — medir antes de prometer:**
1. **Reproduzir por sonda** (não por leitura): material com série, entrada de 3 séries, requisição de 2, entregar —
   contar `series_almoxarifado` por status antes/depois. Confirmar que o invariante quebra.
2. **Onde escolher a série:** na **separação** (quem pega na prateleira lê o número — o mesmo raciocínio da B234) e/ou
   na **entrega**. Como a origem planejada (59), uma "série planejada" por rodada? Medir o que a tela de Movimentações
   já faz para série na saída (`GET /materiais/:id/series?status=EM_ESTOQUE`, checkboxes) e reaproveitar.
3. **O legado:** material com `controle_serie` e estoque **sem** linhas de série (entrou antes da 6b — o próprio
   teste citado usa esse caso). Exigir série na entrega travaria esse estoque; a isenção existe por isso. Decidir
   (letra B, reversível): exigir só quando há séries em estoque para o material? Declarar o legado?
4. **Série × lote × origem:** a série tem lote e localização; a escolha da série deveria **determinar** a origem e o
   lote (ou ser conferida contra eles). Medir `claimSaidaSeries` (hoje não filtra localização — **C76**).
5. **A exclusão da requisição e a devolução** precisam devolver a série (`seriesService.entradaSeries` já reativa
   ENTREGUE → EM_ESTOQUE na devolução — medir se a exclusão faz o mesmo).
6. **Contratos que não se reabrem:** origem estrita e pré-checagem "tudo antes" (58), origem planejada (59), régua da
   divergência (60), a guarda `exigeSerie` do motor (6b).

**Pontos de atenção.** O teste citado **prova a isenção de propósito** — mudar a regra exige mudar esse teste, e isso é
decisão (letra B), não detalhe. Testar a metade positiva: material **sem** controle de série continua saindo sem série.
