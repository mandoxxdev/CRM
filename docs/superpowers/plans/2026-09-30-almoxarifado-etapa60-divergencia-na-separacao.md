# Etapa 60 — a divergência na separação, com motivo

> Status: **Fase 0-1** (design + plano). Feature 05, item "divergência com motivo" (a spec citava um
> teste que não existe — corrigido à vista na Etapa 59).

## Fase 0 — medido (2026-09-30)

- `separarRequisicao`: passada 1 valida cada entrada contra `maxSeparar(item, disponível)` (recusa
  acima com "`{material}: não é possível separar {q} {un}. Máximo: {max} (pendente: {p}, disponível: {d})`");
  abaixo do máximo, **aceita calado**. A rodada grava `itens_json` (item, material, quantidade e — desde
  a 59 — origem/lote) e a auditoria `SEPARACAO`.
- Nada registra *por que* se separou menos do que dava. O conferente (Etapa 28) não tem como saber.
- Tela: modal de separação em `RequisicoesList.js`; bloco "Separação (N)" no detalhe lista as rodadas
  (`GET /requisicoes/:id/separacoes`, `listarSeparacoes`).

## Regras de negócio

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

- **T1 (tronco)** — serviço. Testes `server/tests/api/separacaoDivergencia.api.test.js`: menos que o
  máximo sem motivo → 400 literal, nada gravado; com motivo curto → 400; com motivo → gravado na rodada
  e na auditoria; menos por falta de saldo → sem motivo passa; igual ao máximo → sem motivo passa;
  motivo em entrada não divergente é ignorado; `listarSeparacoes` devolve o motivo.
- **T2 (galho, tela)** — RN-03/RN-04.
- **T3** — verificação, Fase 5, fechamento.

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
- `GET /requisicoes/:id/separacoes` devolve os campos (o `JSON.parse` genérico já passa).
